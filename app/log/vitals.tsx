/**
 * Vital Signs Log Screen
 * Manual entry for BP, HR, SpO2, temperature, respiratory rate, weight, and sleep.
 * Voice entry: press-and-hold mic → Whisper transcription → LLM parses all vital fields.
 */
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang, useRTL } from '@/hooks';
import { getBPStatus, getBPStatusLabel, getBPStatusColor, type VitalSignsRecord, type ActivityRecord, type SleepRecord, kgToLbs, lbsToKg } from '@/lib/health/types';
import { syncVitalSigns, requestDeviceSyncPermissions } from '@/lib/health/device-sync';
// BLE removed — Apple Health integration only
import { logStrings, dictationBoxStrings } from '@/lib/i18n';
import { parseVitalsTranscript } from '@/lib/scribe/parsers';
import { useUnitPreferences, cToF, fToC } from '@/hooks/use-unit-preferences';
import { DictationTipBanner } from '@/components/dictation-tip-banner';
import { safeSetItem, safeGetItem } from '@/lib/safe-async-storage';
import { useUpsell } from '@/hooks/use-upsell';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
// KeyboardDictationBanner replaced with live Dictate button + text field

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatTimeHHMM(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Compute sleep duration in minutes between two ISO strings */
function computeSleepMinutes(bedtime: string, wakeTime: string): number {
  const bed = new Date(bedtime).getTime();
  let wake = new Date(wakeTime).getTime();
  // Handle next-day wake time
  if (wake <= bed) wake += 24 * 60 * 60 * 1000;
  return Math.round((wake - bed) / 60000);
}

/** Format minutes as "Xh Ym" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  unit: string;
  colors: ReturnType<typeof useColors>;
  highlighted?: boolean;
}

function VitalField({ label, value, onChangeText, placeholder, unit, colors, highlighted }: FieldProps) {
  const s = fieldStyles(colors);
  return (
    <View style={s.field}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Text style={[s.label, { marginBottom: 0 }]}>{label}</Text>
      </View>
      <View style={s.row}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="default"
          returnKeyType="done"
          maxLength={6}
        />
        <Text style={s.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const fieldStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  field: { flex: 1, minWidth: '45%', marginBottom: 12, marginHorizontal: 4 },
  label: { fontSize: 11, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, fontSize: 18, fontWeight: '700', color: c.foreground },
  unit: { fontSize: 13, color: c.muted, marginLeft: 4 },
});

/** Build an ISO datetime string for today at a given HH:MM */
function todayAtTime(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

/** Increment/decrement time by 15 minutes */
function adjustTime(hhmm: string, deltaMinutes: number): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const total = hh * 60 + mm + deltaMinutes;
  const clamped = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(clamped / 60);
  const nm = clamped % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** Simple HH:MM stepper for bedtime/wake time */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TimeStepper({ label, value, onChange, colors }: { label: string; value: string; onChange: (v: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flex: 1, minWidth: '45%', marginBottom: 12, marginHorizontal: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 }}>
        <Pressable
          onPress={() => { onChange(adjustTime(value, -15)); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '700' }}>−</Text>
        </Pressable>
        <TextInput
          style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.foreground }}
          value={value}
          onChangeText={(v) => {
            // Allow typing HH:MM directly
            const clean = v.replace(/[^0-9:]/g, '');
            onChange(clean);
          }}
          placeholder="22:00"
          placeholderTextColor={colors.muted}
          keyboardType="default"
          returnKeyType="done"
          maxLength={5}
        />
        <Pressable
          onPress={() => { onChange(adjustTime(value, 15)); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Stable constants (outside component to avoid exhaustive-deps issues) ─────
const TYPE_ORDER = ['Blood Pressure', 'Heart Rate', 'SpO₂', 'Temperature', 'Respiratory Rate', 'HRV', 'Weight', 'Sleep', 'Other'];

type VitalTypeRecord = { systolic?: number | null; diastolic?: number | null; heartRate?: number | null; spo2?: number | null; oxygenSaturation?: number | null; temperature?: number | null; respiratoryRate?: number | null; hrv?: number | null; weightKg?: number | null; sleepBedtime?: string | null };

/** Returns ALL vital types present in a record (multi-vital fanout). */
function getVitalTypes(r: VitalTypeRecord): string[] {
  const types: string[] = [];
  if (r.systolic != null || r.diastolic != null) types.push('Blood Pressure');
  if (r.heartRate != null) types.push('Heart Rate');
  if (r.spo2 != null || r.oxygenSaturation != null) types.push('SpO₂');
  if (r.temperature != null) types.push('Temperature');
  if (r.respiratoryRate != null) types.push('Respiratory Rate');
  if (r.hrv != null) types.push('HRV');
  if (r.weightKg != null) types.push('Weight');
  if (r.sleepBedtime != null) types.push('Sleep');
  return types.length > 0 ? types : ['Other'];
}

/** Returns the primary (first) vital type — used for sort ordering. */
function getVitalType(r: VitalTypeRecord): string {
  return getVitalTypes(r)[0];
}

export default function VitalsLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const lang = useLang();
  const isRTL = useRTL();
  const l = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const { checkAndShow: checkUpsell, UpsellSheet } = useUpsell();
  const translateVitalType = (type: string): string => {
    const map: Record<string, string> = {
      'Blood Pressure': l.bloodPressure ?? 'Blood Pressure',
      'Heart Rate': l.heartRate ?? 'Heart Rate',
      'SpO₂': l.spo2 ?? 'SpO₂',
      'Temperature': l.temperature ?? 'Temperature',
      'Respiratory Rate': l.respRate ?? 'Respiratory Rate',
      'HRV': 'HRV',
      'Weight': l.weightSection ?? 'Weight',
      'Sleep': l.logSleepTitle ?? 'Sleep',
      'Other': l.otherVitals ?? 'Other',
    };
    return map[type] ?? type;
  };
  const db = (dictationBoxStrings as unknown as Record<string, typeof dictationBoxStrings['en']>)[lang] ?? dictationBoxStrings['en'];
  const { state, addVitalSigns, deleteVitalSigns, addWeight, addBloodSugar, addActivity, addSleep } = useHealth();
  // Merge HealthKit bloodPressure records (stored in data.bloodPressure) into the
  // vitalSigns list so BP from Apple Health / Health Connect appears in this tab.
  const records = useMemo(() => {
    const vitalSigns = state.data?.vitalSigns ?? [];
    const hkBP = (state.data?.bloodPressure ?? []).map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      systolic: r.systolic ?? undefined,
      diastolic: r.diastolic ?? undefined,
      source: (r as any).source ?? 'device',
      deviceName: (r as any).deviceName ?? (l.appleHealth ?? 'Apple Health'),
    } as VitalSignsRecord));
    const existingIds = new Set(vitalSigns.map((v) => v.id));
    const newHkBP = hkBP.filter((r) => !existingIds.has(r.id));
    return [...vitalSigns, ...newHkBP].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [state.data?.vitalSigns, state.data?.bloodPressure]);
  // Most recent record that has each field — used for placeholder pre-fill
  const lastBPRecord = records.find(r => r.systolic != null && r.diastolic != null);
  const lastHRRecord = records.find(r => r.heartRate != null);
  const lastHRVRecord = records.find(r => r.hrv != null);
  const lastSpo2Record = records.find(r => r.spo2 != null);
  const lastTempRecord = records.find(r => r.temperature != null);
  const lastRespRecord = records.find(r => r.respiratoryRate != null);

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [dictationText, setDictationText] = useState('');
  const [dictationParsing, setDictationParsing] = useState(false);
  const dictationInputRef = useRef<any>(null);
  const [scribeResult, setScribeResult] = useState<{ transcript: string; confidence: string; reasoning: string; filledCount: number; totalFields: number } | null>(null);
  const [scribeError, setScribeError] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState('');
  const [hrv, setHrv] = useState('');
  const [spo2, setSpo2] = useState('');
  const [temperature, setTemperature] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [weight, setWeight] = useState('');
  const unitPrefs = useUnitPreferences();
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(() => unitPrefs.weightUnit);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(() => unitPrefs.tempUnit);
  // Sync unit prefs when they change live (e.g. user updates Settings while app is open)
  React.useEffect(() => {
    setWeightUnit(unitPrefs.weightUnit);
    setTempUnit(unitPrefs.tempUnit);
  }, [unitPrefs.weightUnit, unitPrefs.tempUnit]);
  // Sleep fields
  const [sleepBedtime, setSleepBedtime] = useState('22:00');
  const [sleepWakeTime, setSleepWakeTime] = useState('06:30');
  const [sleepEfficiency, setSleepEfficiency] = useState('');
  const [sleepDeepMins, setSleepDeepMins] = useState('');
  const [sleepRemMins, setSleepRemMins] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sleepEnabled, setSleepEnabled] = useState(false); // kept for compat
  const [sleepModified, setSleepModified] = useState(false); // true once user touches the time steppers
  const [steps, setSteps] = useState('');
  const [note, setNote] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Local-only parser — no server call

  // Date-range filter for history
  type VitalsDateRange = '7d' | '30d' | 'all';
  const [vitalsDateRange, setVitalsDateRange] = useState<VitalsDateRange>('all');
  type VitalsSortMode = 'date' | 'type';
  const [vitalsSortMode, setVitalsSortMode] = useState<VitalsSortMode>('date');
  type VitalsTypeFilter = 'all' | 'bp' | 'hr' | 'spo2' | 'temp' | 'resp' | 'hrv';
  const [vitalsTypeFilter, setVitalsTypeFilter] = useState<VitalsTypeFilter>('all');
  // getVitalType / getVitalTypes / TYPE_ORDER are defined outside the component (stable constants)
  // Collapsed sections state for By Type view (Set of type strings that are collapsed)
  // Persisted to AsyncStorage so the layout survives app restarts
  const COLLAPSED_STORAGE_KEY = 'vitals_collapsed_sections_v1';
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Load persisted collapse state on mount
  React.useEffect(() => {
    safeGetItem(COLLAPSED_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const arr: string[] = JSON.parse(raw);
          if (Array.isArray(arr)) setCollapsedSections(new Set(arr));
        } catch { /* ignore parse errors */ }
      }
    });
  }, []);
  const toggleSection = useCallback((type: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      // Persist asynchronously
      safeSetItem(COLLAPSED_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [COLLAPSED_STORAGE_KEY]);
  const filteredVitalsRecords = useMemo(() => {
    let base = records;
    if (vitalsDateRange !== 'all') {
      const cutoff = Date.now() - (vitalsDateRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
      base = records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    }
    // Apply type filter chip
    if (vitalsTypeFilter !== 'all') {
      base = base.filter(r => {
        switch (vitalsTypeFilter) {
          case 'bp':   return r.systolic != null || r.diastolic != null;
          case 'hr':   return r.heartRate != null;
          case 'spo2': return r.spo2 != null || r.oxygenSaturation != null;
          case 'temp': return r.temperature != null;
          case 'resp': return r.respiratoryRate != null;
          case 'hrv':  return r.hrv != null;
          default:     return true;
        }
      });
    }
    if (vitalsSortMode === 'type') {
      return [...base].sort((a, b) => {
        const ta = TYPE_ORDER.indexOf(getVitalType(a));
        const tb = TYPE_ORDER.indexOf(getVitalType(b));
        if (ta !== tb) return ta - tb;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    }
    return [...base].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [records, vitalsDateRange, vitalsSortMode, vitalsTypeFilter]);
  // Count records per type from the date-filtered base (independent of active type filter)
  const chipCounts = useMemo(() => {
    let base = records;
    if (vitalsDateRange !== 'all') {
      const cutoff = Date.now() - (vitalsDateRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
      base = records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    }
    return {
      all:  base.length,
      bp:   base.filter(r => r.systolic != null || r.diastolic != null).length,
      hr:   base.filter(r => r.heartRate != null).length,
      spo2: base.filter(r => r.spo2 != null || r.oxygenSaturation != null).length,
      temp: base.filter(r => r.temperature != null).length,
      resp: base.filter(r => r.respiratoryRate != null).length,
      hrv:  base.filter(r => r.hrv != null).length,
    };
  }, [records, vitalsDateRange]);

  const vitalsStats = useMemo(() => {
    if (vitalsDateRange === 'all' || filteredVitalsRecords.length === 0) return null;
    const bpRecords = filteredVitalsRecords.filter(r => r.systolic && r.diastolic);
    const hrRecords = filteredVitalsRecords.filter(r => r.heartRate);
    const avgSys = bpRecords.length > 0
      ? Math.round(bpRecords.reduce((a, r) => a + r.systolic!, 0) / bpRecords.length)
      : null;
    const avgDia = bpRecords.length > 0
      ? Math.round(bpRecords.reduce((a, r) => a + r.diastolic!, 0) / bpRecords.length)
      : null;
    const avgHR = hrRecords.length > 0
      ? Math.round(hrRecords.reduce((a, r) => a + r.heartRate!, 0) / hrRecords.length)
      : null;
    return { avgSys, avgDia, avgHR, count: filteredVitalsRecords.length };
  }, [filteredVitalsRecords, vitalsDateRange]);

  const handleDeviceSync = useCallback(async () => {
    setSyncing(true);
    try {
      const hasPermission = await requestDeviceSyncPermissions();
      if (!hasPermission) {
        Alert.alert(l.permissionRequired, l.vitalsPermissionMsg);
        return;
      }
      const result = await syncVitalSigns(7);
      if (!result.ok) {
        Alert.alert(l.syncFailed, result.error);
        return;
      }
      const existingIds = new Set(records.map((r) => r.id));
      const newRecords = result.records.filter((r) => !existingIds.has(r.id));
      if (!newRecords.length) {
        Alert.alert(l.upToDate, l.noNewVitals);
        return;
      }
      for (const rec of newRecords) {
        await addVitalSigns(rec);
      }
      const sourceName = result.source === 'health-connect' ? 'Health Connect' : 'your BP monitor';
      Alert.alert('Synced', l.syncedMsg(newRecords.length, sourceName));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSyncing(false);
    }
  }, [records, addVitalSigns, l]);

  const handleSave = useCallback(async () => {
    const sys = systolic ? parseFloat(systolic) : undefined;
    const dia = diastolic ? parseFloat(diastolic) : undefined;
    const hr = heartRate ? parseFloat(heartRate) : undefined;
    const hrvVal = hrv ? parseFloat(hrv) : undefined;
    const sp = spo2 ? parseFloat(spo2) : undefined;
    // Temperature is stored in °F in VitalSignsRecord; convert from °C if user prefers Celsius
    const tempRaw = temperature ? parseFloat(temperature) : undefined;
    const temp = tempRaw !== undefined ? (tempUnit === 'C' ? cToF(tempRaw) : tempRaw) : undefined;
    const rrRaw = respiratoryRate ? Math.round(parseFloat(respiratoryRate)) : undefined;
    const rr = rrRaw !== undefined && !isNaN(rrRaw) ? Math.min(60, Math.max(4, rrRaw)) : undefined;

    let wKg: number | undefined;
    if (weight) {
      const wVal = parseFloat(weight);
      if (!isNaN(wVal) && wVal > 0) {
        wKg = weightUnit === 'lbs' ? lbsToKg(wVal) : wVal;
      }
    }

    // Sleep
    let sleepBedtimeISO: string | undefined;
    let sleepWakeTimeISO: string | undefined;
    let sleepTotalMinutes: number | undefined;
    let sleepEff: number | undefined;
    if (sleepModified) {
      // Save sleep data only when the user has interacted with the time steppers
      const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)$/;
      if (!timeRe.test(sleepBedtime) || !timeRe.test(sleepWakeTime)) {
        Alert.alert(l.invalidSleepTime, l.invalidSleepTimeMsg);
        return;
      }
      sleepBedtimeISO = todayAtTime(sleepBedtime);
      sleepWakeTimeISO = todayAtTime(sleepWakeTime);
      sleepTotalMinutes = computeSleepMinutes(sleepBedtimeISO, sleepWakeTimeISO);
      if (sleepEfficiency) {
        const effVal = parseFloat(sleepEfficiency);
        if (!isNaN(effVal) && effVal >= 0 && effVal <= 100) sleepEff = Math.round(effVal);
      }
    }
    // Parse optional sleep stage minutes
    let deepMinsVal: number | undefined;
    let remMinsVal: number | undefined;
    if (sleepDeepMins) {
      const v = parseInt(sleepDeepMins, 10);
      if (!isNaN(v) && v >= 0) deepMinsVal = v;
    }
    if (sleepRemMins) {
      const v = parseInt(sleepRemMins, 10);
      if (!isNaN(v) && v >= 0) remMinsVal = v;
    }

    if (!sys && !dia && !hr && !sp && !temp && !rr && !wKg && !sleepModified && !steps) {
      Alert.alert(l.noData, l.noDataMsg);
      return;
    }

    const record: VitalSignsRecord = {
      id: `vs-${Date.now()}`,
      timestamp: new Date().toISOString(),
      systolic: sys,
      diastolic: dia,
      heartRate: hr,
      hrv: hrvVal,
      spo2: sp,
      temperature: temp,
      respiratoryRate: rr,
      weightKg: wKg,
      weightUnit: wKg !== undefined ? weightUnit : undefined,
      sleepBedtime: sleepBedtimeISO,
      sleepWakeTime: sleepWakeTimeISO,
      sleepTotalMinutes,
      sleepEfficiency: sleepEff,
      note: note.trim() || undefined,
      source: 'manual',
    };
    await addVitalSigns(record);

    // If sleep was entered via the vitals form, also create a proper SleepRecord so the
    // sleep banner, sleep detail screen, sparkline, and analytics all see it immediately.
    // This mirrors what the dedicated Sleep log screen does via addSleep().
    if (sleepModified && sleepBedtimeISO && sleepWakeTimeISO && sleepTotalMinutes && sleepTotalMinutes > 0) {
      const sleepRecord: SleepRecord = {
        id: `sleep_vs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: sleepBedtimeISO.slice(0, 10),
        bedtime: sleepBedtimeISO,
        wakeTime: sleepWakeTimeISO,
        totalMinutes: sleepTotalMinutes,
        deepMinutes: deepMinsVal ?? 0,
        remMinutes: remMinsVal ?? 0,
        lightMinutes: Math.max(0, sleepTotalMinutes - (deepMinsVal ?? 0) - (remMinsVal ?? 0)),
        awakeMinutes: 0,
        efficiency: sleepEff ?? 0,
        source: 'manual',
      };
      await addSleep(sleepRecord);
    }

    // If steps were entered, also save an ActivityRecord so the dashboard step counter updates
    const stepsNum = steps ? parseInt(steps, 10) : undefined;
    if (stepsNum && stepsNum > 0) {
      const activityRecord: ActivityRecord = {
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'walk',
        durationMinutes: 0,
        steps: stepsNum,
        source: 'manual',
        note: 'Logged via Vitals',
      };
      await addActivity(activityRecord);
    }

    // Flag for dashboard: auto-select "Last 1 hr" on Personal Narrative after a fresh log
    safeSetItem('@vsht:last_vital_log_ts', Date.now().toString()).catch(() => {});
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Contextual upsell triggers (non-blocking, fire after form resets)
    if (sys && dia) {
      setTimeout(() => { checkUpsell('bp_third_log').catch(() => {}); }, 600);
    }
    setSystolic(''); setDiastolic(''); setHeartRate(''); setHrv(''); setSpo2('');
    setTemperature(''); setRespiratoryRate(''); setWeight(''); setNote('');
    setSleepBedtime('22:00'); setSleepWakeTime('06:30'); setSleepEfficiency('');
    setSleepDeepMins(''); setSleepRemMins('');
    setSleepEnabled(false); setSleepModified(false); setSteps('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systolic, diastolic, heartRate, hrv, spo2, temperature, respiratoryRate, weight, weightUnit,
      sleepModified, sleepBedtime, sleepWakeTime, sleepEfficiency, sleepDeepMins, sleepRemMins,
      note, steps, addVitalSigns, addActivity, addSleep, l]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(l.deleteEntry, l.deleteVitalsMsg, [
      { text: l.cancel, style: 'cancel' },
      {
        text: l.delete, style: 'destructive', onPress: () => {
          deleteVitalSigns(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteVitalSigns, l]);

  /** Dictation text submit: parse transcript locally (no server) and fill vital sign fields */
  const handleDictationSubmit = useCallback(() => {
    const text = dictationText.trim();
    if (!text) return;
    setDictationParsing(true);
    setScribeError(null);
    setScribeResult(null);
    try {
      const result = parseVitalsTranscript(text);
      let filledCount = 0;
      if (result.systolic !== null) { setSystolic(String(result.systolic)); filledCount++; }
      if (result.diastolic !== null) { setDiastolic(String(result.diastolic)); filledCount++; }
      if (result.heartRate !== null) { setHeartRate(String(result.heartRate)); filledCount++; }
      if (result.spo2 !== null) { setSpo2(String(result.spo2)); filledCount++; }
      if (result.temperature !== null) {
        // parser returns raw value; auto-detect unit by magnitude
        const t = result.temperature;
        if (tempUnit === 'C') {
          // If value looks like Fahrenheit, convert to Celsius
          setTemperature(t >= 95 ? String(Math.round(fToC(t) * 10) / 10) : String(t));
        } else {
          // If value looks like Celsius, convert to Fahrenheit
          setTemperature(t <= 42 ? String(Math.round(cToF(t) * 10) / 10) : String(t));
        }
        filledCount++;
      }
      if (result.respiratoryRate !== null) { setRespiratoryRate(String(result.respiratoryRate)); filledCount++; }
      if (result.note) { setNote(result.note); filledCount++; }
      setScribeResult({
        transcript: text,
        confidence: filledCount > 0 ? 'high' : 'low',
        reasoning: `Parsed ${filledCount} field(s) from transcript`,
        filledCount,
        totalFields: 7,
      });
      setDictationText('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_err: any) {
      setScribeError('Could not parse dictation. Please check your input and try again.');
    } finally {
      setDictationParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationText, tempUnit, weightUnit]);



  const s = styles(colors);

  // Compute sleep duration preview
  const _sleepDurPreview = (() => {
    if (!sleepModified) return null;
    const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (!timeRe.test(sleepBedtime) || !timeRe.test(sleepWakeTime)) return null;
    const mins = computeSleepMinutes(todayAtTime(sleepBedtime), todayAtTime(sleepWakeTime));
    return formatDuration(mins);
  })();

  return (
    <ScreenContainer>
      {/* Contextual upsell bottom sheet */}
      {UpsellSheet}


      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Go back">
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={s.title}>{l.vitalsTitle}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>

          <Pressable
            onPress={handleDeviceSync}
            disabled={syncing}
            style={({ pressed }) => [s.syncBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Sync health data from device"
          >
            {syncing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[s.syncBtnText, { color: colors.primary }]}>{l.syncBtn}</Text>
            }
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[s.card, { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>Log Vitals</Text>
        </View>
        <View style={[s.card, { marginTop: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
          {/* ── Dictate Button ── */}
          <TouchableOpacity
            style={[s.dictateBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setTimeout(() => dictationInputRef.current?.focus(), 80); }}
            activeOpacity={0.8}
          >
            <Text style={s.dictateBtnText}>{l.dictateAllVitals ?? '🎤  Dictate All Vitals'}</Text>
          </TouchableOpacity>

          {/* ── Dictation Text Box ── */}
          <DictationTipBanner />
          <View style={[s.dictationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.dictationCardHeader}>
              <Text style={[s.dictationCardLabel, { color: colors.foreground }]}>{l.dictateVitalsTitle ?? '🎤  DICTATE VITALS'}</Text>
              <Text style={[s.dictationCardHint, { color: colors.muted }]}>{l.dictateVitalsHint ?? 'Tap field → tap mic on keyboard'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TextInput
                ref={dictationInputRef}
                style={[s.dictationInput, { color: colors.foreground }, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}
                value={dictationText}
                onChangeText={setDictationText}
                placeholder={"Speak or type: 'BP 120/80, HR 72, SpO2 98%, weight 165 lbs, slept 7 hours…'"}
                placeholderTextColor={colors.muted}
                multiline
                returnKeyType="done"
                blurOnSubmit={false}
              />
              {dictationText.trim().length > 0 && (
                <TouchableOpacity
                  style={[s.dictationSendBtn, { backgroundColor: colors.primary }]}
                  onPress={handleDictationSubmit}
                  activeOpacity={0.8}
                >
                  {dictationParsing
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>→</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {dictationParsing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.muted }}>{db.parsing}</Text>
            </View>
          )}
          {scribeResult && (
            <View style={{ backgroundColor: colors.primary + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.primary + '44' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>✓ Scribe result · {scribeResult.confidence} confidence</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>Filled {scribeResult.filledCount}/{scribeResult.totalFields}</Text>
                  <TouchableOpacity onPress={() => { setScribeResult(null); setScribeError(null); }}>
                    <Text style={{ fontSize: 11, color: colors.primary }}>🍎 Try again</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>&quot;{scribeResult.transcript}&quot;</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{scribeResult.reasoning}</Text>
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>Smart Scribe-extracted — please review all fields before saving.</Text>
            </View>
          )}
          {scribeError && (
            <View style={{ backgroundColor: colors.error + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.error + '44', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: colors.error, flex: 1 }}>{scribeError}</Text>
              <TouchableOpacity onPress={() => setScribeError(null)}>
                <Text style={{ fontSize: 12, color: colors.error, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Blood Pressure */}
          <Text style={s.cardTitle}>{l.bloodPressure}</Text>
          <View style={s.fieldsRow}>
            <VitalField label={l.systolic} value={systolic} onChangeText={setSystolic} placeholder={lastBPRecord?.systolic != null ? String(lastBPRecord.systolic) : '120'} unit="mmHg" colors={colors} />
            <VitalField label={l.diastolic} value={diastolic} onChangeText={setDiastolic} placeholder={lastBPRecord?.diastolic != null ? String(lastBPRecord.diastolic) : '80'} unit="mmHg" colors={colors} />
          </View>

          {/* Other Vitals */}
          <Text style={[s.cardTitle, { marginTop: 8 }]}>{l.otherVitals}</Text>
          <View style={s.fieldsRow}>
            <VitalField label={l.heartRate} value={heartRate} onChangeText={setHeartRate} placeholder={lastHRRecord?.heartRate != null ? String(lastHRRecord.heartRate) : '72'} unit="bpm" colors={colors} />
            <VitalField label="HRV" value={hrv} onChangeText={setHrv} placeholder={lastHRVRecord?.hrv != null ? String(lastHRVRecord.hrv) : '45'} unit="ms" colors={colors} />
            <VitalField label={l.spo2} value={spo2} onChangeText={setSpo2} placeholder={lastSpo2Record?.spo2 != null ? String(lastSpo2Record.spo2) : '98'} unit="%" colors={colors} />
            <VitalField label={l.temperature} value={temperature} onChangeText={setTemperature} placeholder={lastTempRecord?.temperature != null ? (tempUnit === 'C' ? String(((lastTempRecord.temperature - 32) * 5 / 9).toFixed(1)) : String(lastTempRecord.temperature)) : (tempUnit === 'C' ? '37.0' : '98.6')} unit={`°${tempUnit}`} colors={colors} />
            <VitalField
              label={l.respRate}
              value={respiratoryRate}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9]/g, '');
                if (cleaned === '' || parseInt(cleaned, 10) <= 60) setRespiratoryRate(cleaned);
              }}
              placeholder={lastRespRecord?.respiratoryRate != null ? String(Math.round(lastRespRecord.respiratoryRate)) : '16'}
              unit="/min"
              colors={colors}
            />
            {/* Inline lower-bound warning for respiratory rate */}
            {respiratoryRate !== '' && parseInt(respiratoryRate, 10) < 4 && (
              <View style={{ width: '100%', paddingHorizontal: 4, marginTop: -6, marginBottom: 8 }}>
                <Text style={{ fontSize: 11, color: colors.warning, fontWeight: '600' }}>
                  ⚠ Minimum is 4 br/min — value will be clamped on save
                </Text>
              </View>
            )}
          </View>

          {/* Steps */}
          <Text style={[s.cardTitle, { marginTop: 8 }]}>{l.activitySection ?? 'Activity'}</Text>
          <View style={s.fieldsRow}>
            <VitalField
              label={l.stepsLabel ?? 'Steps'}
              value={steps}
              onChangeText={setSteps}
              placeholder="8000"
              unit={l.stepsUnit ?? 'steps'}
              colors={colors}
            />
          </View>
          {/* Weight */}
          <View style={[s.sectionHeader, { marginTop: 8 }]}>
            <Text style={s.cardTitle}>{l.weightSection}</Text>
            <View style={[s.unitToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                style={[s.unitBtn, weightUnit === 'kg' && { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (weightUnit !== 'kg') {
                    setWeightUnit('kg');
                    if (weight) { const v = parseFloat(weight); if (!isNaN(v)) setWeight(String(lbsToKg(v))); }
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
              >
                <Text style={[s.unitBtnText, { color: weightUnit === 'kg' ? '#fff' : colors.muted }]}>{l.weightToggleKg}</Text>
              </Pressable>
              <Pressable
                style={[s.unitBtn, weightUnit === 'lbs' && { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (weightUnit !== 'lbs') {
                    setWeightUnit('lbs');
                    if (weight) { const v = parseFloat(weight); if (!isNaN(v)) setWeight(String(kgToLbs(v))); }
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
              >
                <Text style={[s.unitBtnText, { color: weightUnit === 'lbs' ? '#fff' : colors.muted }]}>{l.weightToggleLbs}</Text>
              </Pressable>
            </View>
          </View>
          <View style={s.fieldsRow}>
            <VitalField
              label={weightUnit === 'kg' ? l.weightKgLabel : l.weightLbsLabel}
              value={weight}
              onChangeText={setWeight}
              placeholder={weightUnit === 'kg' ? '70.0' : '154.0'}
              unit={weightUnit}
              colors={colors}
            />
          </View>

          {/* Note */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, marginTop: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l.noteSection ?? 'Note'}</Text>

          </View>
          <TextInput
            style={[s.noteInput, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}
            value={note}
            onChangeText={setNote}
            placeholder={l.notePlaceholder}
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            maxLength={200}
            multiline
            blurOnSubmit={false}
          />          <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? 'left' : 'right', marginTop: -8, marginBottom: 12 }}>{note.length}/200</Text>

          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
          >
            <Text style={s.saveBtnText}>{l.saveEntry}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={s.sectionTitle}>{l.history}</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {/* Sort-by-type toggle */}
            <Pressable
              onPress={() => {
                setVitalsSortMode(m => m === 'date' ? 'type' : 'date');
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: vitalsSortMode === 'type' ? colors.primary + '22' : colors.surface,
                borderWidth: 1, borderColor: vitalsSortMode === 'type' ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: vitalsSortMode === 'type' ? colors.primary : colors.muted }}>
                {vitalsSortMode === 'type' ? '⊞ By Type ✓' : '⊞ By Type'}
              </Text>
            </Pressable>
            <View style={{ width: 1, height: 16, backgroundColor: colors.border }} />
            {(['7d', '30d', 'all'] as const).map(r => (
              <Pressable
                key={r}
                onPress={() => { setVitalsDateRange(r); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={({ pressed }) => [{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: vitalsDateRange === r ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: vitalsDateRange === r ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: vitalsDateRange === r ? '#fff' : colors.muted }}>
                  {r === '7d' ? '7d' : r === '30d' ? '30d' : 'All'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ─── Type filter chips ─────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 6, flexDirection: 'row' }}
        >
          {([
            { key: 'all',  label: 'All' },
            { key: 'bp',   label: 'BP' },
            { key: 'hr',   label: 'HR' },
            { key: 'spo2', label: 'SpO₂' },
            { key: 'temp', label: l.tempLabel ?? 'Temp' },
            { key: 'resp', label: l.respLabel ?? 'Resp' },
            { key: 'hrv',  label: 'HRV' },
          ] as const).map(chip => {
            const active = vitalsTypeFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => {
                  setVitalsTypeFilter(chip.key);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.muted }}>
                  {chip.label}{chipCounts[chip.key] > 0 ? ` (${chipCounts[chip.key]})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* ─── Mini stats bar (shown only when a date range is active) ────── */}
        {vitalsStats && (
          <View style={[s.statsBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {vitalsStats.avgSys !== null && vitalsStats.avgDia !== null && (
              <View style={s.statItem}>
                <Text style={[s.statValue, { color: colors.primary }]}>
                  {vitalsStats.avgSys}/{vitalsStats.avgDia}
                </Text>
                <Text style={[s.statLabel, { color: colors.muted }]}>Avg BP</Text>
              </View>
            )}
            {vitalsStats.avgHR !== null && (
              <View style={s.statItem}>
                <Text style={[s.statValue, { color: '#EF4444' }]}>{vitalsStats.avgHR}</Text>
                <Text style={[s.statLabel, { color: colors.muted }]}>Avg HR</Text>
              </View>
            )}
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: colors.muted }]}>{vitalsStats.count}</Text>
              <Text style={[s.statLabel, { color: colors.muted }]}>Readings</Text>
            </View>
          </View>
        )}

        {vitalsSortMode === 'type' && (() => {
          if (filteredVitalsRecords.length === 0) {
            return <Text style={[s.empty, { marginHorizontal: 16 }]}>{vitalsDateRange === 'all' ? l.vitalsEmpty : 'No records in this period.'}</Text>;
          }
          // Build sections with multi-vital fanout.
          // Each record is placed in ALL matching type buckets so no data is hidden.
          const sectionMap = new Map<string, { record: typeof filteredVitalsRecords[0]; isShared: boolean }[]>();
          for (const r of filteredVitalsRecords) {
            const types = getVitalTypes(r);
            for (const t of types) {
              if (!sectionMap.has(t)) sectionMap.set(t, []);
              sectionMap.get(t)!.push({ record: r, isShared: types.length > 1 });
            }
          }
          // Emit in canonical TYPE_ORDER; unknown types go last
          const sections = [
            ...TYPE_ORDER.filter(t => sectionMap.has(t)).map(t => ({ type: t, data: sectionMap.get(t)! })),
            ...[...sectionMap.entries()].filter(([t]) => !TYPE_ORDER.includes(t)).map(([t, d]) => ({ type: t, data: d })),
          ];
          return (
            <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
              {sections.map(section => {
                const isCollapsed = collapsedSections.has(section.type);
                return (
                  <View key={section.type}>
                    {/* Collapsible section header */}
                    <Pressable
                      onPress={() => toggleSection(section.type)}
                      style={({ pressed }) => [{
                        flexDirection: 'row', alignItems: 'center',
                        marginTop: 14, marginBottom: isCollapsed ? 4 : 6, gap: 8,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          {translateVitalType(section.type)}
                        </Text>
                        {isCollapsed ? (
                          <View style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 22, alignItems: 'center' }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.background }}>{section.data.length}</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 11, color: colors.muted }}>({section.data.length})</Text>
                        )}
                        <Text style={{ fontSize: 10, color: colors.primary }}>{isCollapsed ? '▶' : '▼'}</Text>
                      </View>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    </Pressable>
                    {/* Section rows — hidden when collapsed */}
                    {!isCollapsed && section.data.map(({ record: item, isShared }) => {
                      const hasBP = item.systolic != null || item.diastolic != null;
                      const bpStatus = (item.systolic != null && item.diastolic != null) ? getBPStatus(item.systolic, item.diastolic) : null;
                      const bpColor = bpStatus ? getBPStatusColor(bpStatus, colors as unknown as Record<string, string>) : colors.muted;
                      const weightDisplay = item.weightKg
                        ? item.weightUnit === 'lbs'
                          ? `⚖️ ${kgToLbs(item.weightKg)} lbs`
                          : `⚖️ ${item.weightKg} kg`
                        : null;
                      const hasSleep = item.sleepBedtime && item.sleepWakeTime;
                      // Shared badge: show other types this record also appears in
                      const otherTypes = isShared
                        ? getVitalTypes(item).filter(t => t !== section.type)
                        : [];
                      return (
                        <View key={`${section.type}-${item.id}`} style={s.row}>
                          <View style={s.rowLeft}>
                            {hasBP && (
                              <View style={s.bpRow}>
                                <Text style={s.rowValue}>{item.systolic ?? '--'}/{item.diastolic ?? '--'}</Text>
                                <Text style={s.mmhg}> mmHg</Text>
                                {bpStatus && (
                                  <View style={[s.badge, { backgroundColor: bpColor + '22' }]}>
                                    <Text style={[s.badgeText, { color: bpColor }]}>{getBPStatusLabel(bpStatus)}</Text>
                                  </View>
                                )}
                              </View>
                            )}
                            <View style={s.pillRow}>
                              {item.heartRate       && <Text style={s.pill}>❤️ {item.heartRate} bpm</Text>}
                              {item.hrv             && <Text style={s.pill}>💜 HRV {item.hrv} ms</Text>}
                              {item.spo2            && <Text style={s.pill}>🪱 {item.spo2}% SpO₂</Text>}
                              {item.temperature     && <Text style={s.pill}>🌡️ {tempUnit === 'C' ? fToC(item.temperature).toFixed(1) : item.temperature}°{tempUnit}</Text>}
                              {item.respiratoryRate && <Text style={s.pill}>💨 {Math.round(item.respiratoryRate)}/min</Text>}
                              {weightDisplay        && <Text style={s.pill}>{weightDisplay}</Text>}
                              {hasSleep && (
                                <Text style={s.pill}>
                                  🌙 {formatTimeHHMM(item.sleepBedtime!)}–{formatTimeHHMM(item.sleepWakeTime!)}
                                  {item.sleepTotalMinutes ? ` · ${formatDuration(item.sleepTotalMinutes)}` : ''}
                                  {item.sleepEfficiency ? ` · ${item.sleepEfficiency}% eff` : ''}
                                </Text>
                              )}
                            </View>
                            {otherTypes.length > 0 && (
                              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                                also in: {otherTypes.join(', ')}
                              </Text>
                            )}
                            <Text style={s.rowSub}>{formatDate(item.timestamp)}</Text>
                            {item.note ? <Text style={s.rowNote}>{item.note}</Text> : null}
                          </View>
                          <Pressable
                            onPress={() => handleDelete(item.id)}
                            style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.5 }]}
                          >
                            <IconSymbol name="xmark" size={16} color={colors.error} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          );
        })()}
        {vitalsSortMode === 'date' && <FlatList
          data={filteredVitalsRecords}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.empty}>{vitalsDateRange === 'all' ? l.vitalsEmpty : 'No records in this period.'}</Text>}
          renderItem={({ item }) => {
            const hasBP = item.systolic != null || item.diastolic != null;
            const bpStatus = (item.systolic != null && item.diastolic != null) ? getBPStatus(item.systolic, item.diastolic) : null;
            const bpColor = bpStatus ? getBPStatusColor(bpStatus, colors as unknown as Record<string, string>) : colors.muted;
            const weightDisplay = item.weightKg
              ? item.weightUnit === 'lbs'
                ? `⚖️ ${kgToLbs(item.weightKg)} lbs`
                : `⚖️ ${item.weightKg} kg`
              : null;
            const hasSleep = item.sleepBedtime && item.sleepWakeTime;
            return (
              <View style={s.row}>
                <View style={s.rowLeft}>
                  {hasBP && (
                    <View style={s.bpRow}>
                      <Text style={s.rowValue}>{item.systolic ?? '--'}/{item.diastolic ?? '--'}</Text>
                      <Text style={s.mmhg}> mmHg</Text>
                      {bpStatus && (
                        <View style={[s.badge, { backgroundColor: bpColor + '22' }]}>
                          <Text style={[s.badgeText, { color: bpColor }]}>{getBPStatusLabel(bpStatus)}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={s.pillRow}>
                    {item.heartRate       && <Text style={s.pill}>❤️ {item.heartRate} bpm</Text>}
                    {item.hrv             && <Text style={s.pill}>💜 HRV {item.hrv} ms</Text>}
                    {item.spo2            && <Text style={s.pill}>🫁 {item.spo2}% SpO₂</Text>}
                    {item.temperature     && <Text style={s.pill}>🌡️ {tempUnit === 'C' ? fToC(item.temperature).toFixed(1) : item.temperature}°{tempUnit}</Text>}
                    {item.respiratoryRate && <Text style={s.pill}>💨 {Math.round(item.respiratoryRate)}/min</Text>}
                    {weightDisplay        && <Text style={s.pill}>{weightDisplay}</Text>}
                    {hasSleep && (
                      <Text style={s.pill}>
                        🌙 {formatTimeHHMM(item.sleepBedtime!)}–{formatTimeHHMM(item.sleepWakeTime!)}
                        {item.sleepTotalMinutes ? ` · ${formatDuration(item.sleepTotalMinutes)}` : ''}
                        {item.sleepEfficiency ? ` · ${item.sleepEfficiency}% eff` : ''}
                      </Text>
                    )}
                  </View>
                  <Text style={s.rowSub}>{formatDate(item.timestamp)}</Text>
                  {item.note ? <Text style={s.rowNote}>{item.note}</Text> : null}
                </View>
                <Pressable
                  onPress={() => handleDelete(item.id)}
                  style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.5 }]}
                >
                  <IconSymbol name="xmark" size={16} color={colors.error} />
                </Pressable>
              </View>
            );
          }}
        />}
      </ScrollView>
    </ScreenContainer>
  );
}
const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: c.foreground },
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: (c as any).surfaceRaised ?? c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  cardTitle: { fontSize: 13, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  noteInput: { fontSize: 14, color: c.foreground, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  saveBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  unitToggle: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  unitBtnText: { fontSize: 13, fontWeight: '600' },
  sleepDurRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, marginHorizontal: 4 },
  sleepDurLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sleepDurValue: { fontSize: 18, fontWeight: '700' },
  disclaimer: { fontSize: 11, lineHeight: 15, marginBottom: 6, fontStyle: 'italic' },
  prefillNote: { fontSize: 12, fontWeight: '600' },
  errorText: { fontSize: 13 },
  hintText: { fontSize: 12, lineHeight: 17 },
  syncBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0A7EA412' },
  syncBtnText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 8, marginTop: 8 },
  empty: { color: c.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  // Mini stats bar
  statsBar: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: (c as any).surfaceRaised ?? c.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
  rowLeft: { flex: 1 },
  bpRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  rowValue: { fontSize: 20, fontWeight: '800', color: c.foreground },
  mmhg: { fontSize: 13, color: c.muted, marginTop: 4 },
  badge: { marginLeft: 8, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  pill: { fontSize: 12, color: c.foreground, backgroundColor: c.surface, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  rowNote: { fontSize: 12, color: c.foreground, marginTop: 4, fontStyle: 'italic' },
  deleteBtn: { padding: 8 },
  dictateBtn: {
    borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12,
  },
  dictateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dictationCard: {
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  dictationCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
  },
  dictationCardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dictationCardHint: { fontSize: 11 },
  dictationInput: {
    flex: 1, minHeight: 56, fontSize: 14, lineHeight: 20,
  },
  dictationSendBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
});
