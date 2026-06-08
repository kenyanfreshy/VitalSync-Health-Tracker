/**
 * Blood Sugar Log Screen
 * Manual glucose entry with mg/dL ↔ mmol/L toggle and context (fasting, post-meal, etc.)
 *
 * Layout: single FlatList with ListHeaderComponent so the entry form, nutrition summary,
 * A1C target picker, and Projected A1C card all scroll together with the history list.
 * This prevents the history and Projected A1C card from being cut off.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang, useRTL } from '@/hooks';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import {
  mgDlToMmol,
  getBloodSugarStatus,
  type BloodSugarRecord,
  type BloodSugarContext,
} from '@/lib/health/types';
import { syncBloodGlucose, requestDeviceSyncPermissions } from '@/lib/health/device-sync';
import { BleScannerSheet } from '@/components/ble-device-scanner';
import { readDeviceByCategory, deduplicateBloodSugar, bleReadSummary } from '@/lib/ble/ble-reading-service';
import { notifyBleState } from '@/services/bluetooth-manager';
import { logStrings, complianceRingStrings, recordsStrings } from '@/lib/i18n';
import { cancelGlucoseRecheckNotification } from '@/lib/notifications/glucose-recheck';
import { checkThresholds, dispatchViolationNotifications } from '@/lib/notifications/threshold-checker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveGlucoseUnitPreference } from '@/hooks/use-unit-preferences';
import { ProjectedA1CCard } from '@/components/projected-a1c-card';
import { loadA1CTarget, saveA1CTarget, A1C_TARGET_PRESETS, DEFAULT_A1C_TARGET } from '@/lib/health/a1c-target';
import { GlucoseTrendChart } from '@/components/glucose-trend-chart';
import {
  loadGlucoseThresholds,
  DEFAULT_GLUCOSE_THRESHOLDS,
  type GlucoseThresholdConfig,
} from '@/lib/health/glucose-thresholds';
import { useUpsell } from '@/hooks/use-upsell';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';

const RECHECK_STORAGE_KEY = '@vsht:glucose_recheck';
const UNITS_KEY = '@vitalsync/profile_units';

type Unit = 'mg/dL' | 'mmol/L';

const STATUS_COLORS: Record<string, string> = {
  normal: '#10B981',
  prediabetes: '#F59E0B',
  high: '#EF4444',
  low: '#3B82F6',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function BloodSugarLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const lang = useLang();
  const isRTL = useRTL();
  const l = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const rs = ((recordsStrings as unknown as Record<string, typeof recordsStrings.en>)[lang] ?? recordsStrings.en);
  const { checkAndShow: checkUpsell, UpsellSheet } = useUpsell();
  const { isPremium: isA1CPremium, requirePremium: requireA1CPremium, PremiumGateSheet: A1CGateSheet } = usePremiumGate();
  const { state, addBloodSugar, deleteBloodSugar } = useHealth();
  const { dietType: userDietType } = useDietType();
  const dietOption = DIET_TYPE_OPTIONS.find(o => o.value === userDietType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = state.data?.bloodSugar ?? [];

  // Today's nutrition from DASH Diet (sodium/nutrition) records
  const todayNutrition = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const recs = (state.data?.sodiumIntake ?? []).filter(
      r => r.calories != null && new Date(r.timestamp) >= today
    );
    if (!recs.length) return null;
    return {
      calories: recs.reduce((s, r) => s + (r.calories ?? 0), 0),
      carbsG: recs.reduce((s, r) => s + (r.carbsG ?? 0), 0),
      sugarG: recs.reduce((s, r) => s + (r.sugarG ?? 0), 0),
      fatG: recs.reduce((s, r) => s + (r.fatG ?? 0), 0),
      proteinG: recs.reduce((s, r) => s + (r.proteinG ?? 0), 0),
      fiberG: recs.reduce((s, r) => s + (r.fiberG ?? 0), 0),
      glycemicLoad: recs.reduce((s, r) => s + (r.glycemicLoad ?? 0), 0),
      mealCount: recs.length,
    };
  }, [state.data?.sodiumIntake]);

  const [unit, setUnit] = useState<Unit>('mg/dL');
  const [a1cTarget, setA1CTarget] = useState<number>(DEFAULT_A1C_TARGET);
  const [showA1CTargetPicker, setShowA1CTargetPicker] = useState(false);

  // Load persisted A1C target and glucose thresholds on mount
  useEffect(() => {
    loadA1CTarget().then(setA1CTarget).catch(() => {});
    loadGlucoseThresholds().then(setGlucoseThresholds).catch(() => {});
  }, []);
  // Load persisted glucose unit preference on mount
  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const u = JSON.parse(raw);
        if (u.glucoseUnit === 'mmol/L') setUnit('mmol/L');
      } catch (_unused) {}
    }).catch(() => {});
  }, []);

  const [value, setValue] = useState('');
  // Pre-fill context from quick-entry route param (e.g. ?context=post-meal)
  const { context: contextParam } = useLocalSearchParams<{ context?: string }>();
  const VALID_CONTEXTS: BloodSugarContext[] = ['fasting', 'post-meal', 'random', 'bedtime'];
  const initialContext: BloodSugarContext =
    VALID_CONTEXTS.includes(contextParam as BloodSugarContext)
      ? (contextParam as BloodSugarContext)
      : 'fasting';
  const [context, setContext] = useState<BloodSugarContext>(initialContext);
  const [note, setNote] = useState('');
  const [syncing, setSyncing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [cgmImporting, setCgmImporting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [cgmImportCount, setCgmImportCount] = useState<number | null>(null);
  const [glucoseThresholds, setGlucoseThresholds] = useState<GlucoseThresholdConfig>(DEFAULT_GLUCOSE_THRESHOLDS);
  const [chartWidth, setChartWidth] = useState(0);
  const [bleVisible, setBleVisible] = useState(false);
  const { requirePremium: requireBlePremium, PremiumGateSheet: BleGateSheet } = usePremiumGate();
  const [bleConnecting, setBleConnecting] = useState(false);

  // Tracks which record ID has a pending 2-hour recheck notification
  const [pendingRecheckId, setPendingRecheckId] = useState<string | null>(null);
  const [recheckFireTime, setRecheckFireTime] = useState<Date | null>(null);

  // Restore persisted recheck state on cold launch
  useEffect(() => {
    AsyncStorage.getItem(RECHECK_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { id, fireTime } = JSON.parse(raw) as { id: string; fireTime: string };
        const fire = new Date(fireTime);
        if (fire.getTime() > Date.now()) {
          setPendingRecheckId(id);
          setRecheckFireTime(fire);
        } else {
          AsyncStorage.removeItem(RECHECK_STORAGE_KEY);
        }
      } catch (_unused) {
        AsyncStorage.removeItem(RECHECK_STORAGE_KEY);
      }
    });
  }, []);

  // ── Device sync handlers ──────────────────────────────────────────────────────

  const handleDeviceSync = useCallback(async () => {
    setSyncing(true);
    try {
      const hasPermission = await requestDeviceSyncPermissions();
      if (!hasPermission) {
        Alert.alert(l.permissionRequired, l.bsPermissionMsg);
        return;
      }
      const result = await syncBloodGlucose(7);
      if (!result.ok) {
        Alert.alert(l.syncFailed, result.error);
        return;
      }
      const existingIds = new Set(records.map((r) => r.id));
      const newRecords = result.records.filter((r) => !existingIds.has(r.id));
      if (!newRecords.length) {
        Alert.alert(l.upToDate, l.noNewBs);
        return;
      }
      for (const rec of newRecords) {
        await addBloodSugar(rec);
      }
      const sourceName = result.source === 'health-connect' ? l.healthConnectSource : l.glucometerSource;
      Alert.alert(l.syncedViaBle, l.syncedMsg(newRecords.length, sourceName));
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Immediate glucose threshold check after BLE import
        checkThresholds()
          .then((violations) => {
            const gv = violations.filter((v) => v.category === 'glucose');
            if (gv.length > 0) dispatchViolationNotifications(gv).catch(() => {});
          })
          .catch(() => {});
      }
    } finally {
      setSyncing(false);
    }
  }, [records, addBloodSugar, l]);

  const _handleCGMImport = useCallback(async () => {
    setCgmImporting(true);
    setCgmImportCount(null);
    try {
      const hasPermission = await requestDeviceSyncPermissions();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'HealthKit access is needed to import CGM data.');
        return;
      }
      const result = await syncBloodGlucose(30);
      if (!result.ok) {
        Alert.alert(l.importFailed ?? 'Import Failed', result.error);
        return;
      }
      const existingIds = new Set(records.map((r) => r.id));
      const newRecords = result.records.filter((r) => !existingIds.has(r.id));
      const skipped = result.records.length - newRecords.length;
      for (const rec of newRecords) {
        await addBloodSugar(rec);
      }
      setCgmImportCount(newRecords.length);
      if (newRecords.length === 0) {
        Alert.alert(l.alreadyUpToDate ?? 'Already Up to Date', `No new CGM readings found. ${skipped > 0 ? `${skipped} duplicate${skipped > 1 ? 's' : ''} skipped.` : ''}`);
      } else {
        Alert.alert(
          l.cgmImportComplete ?? 'CGM Import Complete',
          `Imported ${newRecords.length} reading${newRecords.length > 1 ? 's' : ''} from the last 30 days.${skipped > 0 ? ` (${skipped} duplicate${skipped > 1 ? 's' : ''} skipped)` : ''}`,
        );
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Immediate glucose threshold check after CGM import
          checkThresholds()
            .then((violations) => {
              const gv = violations.filter((v) => v.category === 'glucose');
              if (gv.length > 0) dispatchViolationNotifications(gv).catch(() => {});
            })
            .catch(() => {});
        }
      }
    } finally {
      setCgmImporting(false);
    }
  }, [records, addBloodSugar]);

  const handleSave = useCallback(async () => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      Alert.alert(l.invalidBs, l.invalidBsMsg);
      return;
    }
    const mgDl = unit === 'mg/dL' ? num : Math.round(num * 18.0182);
    const mmol = unit === 'mmol/L' ? num : mgDlToMmol(num);

    const record: BloodSugarRecord = {
      id: `bs-${Date.now()}`,
      timestamp: new Date().toISOString(),
      glucoseMgDl: mgDl,
      glucoseMmol: mmol,
      context,
      note: note.trim() || undefined,
      source: 'manual',
    };
    await addBloodSugar(record);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Immediate threshold check — mirrors analyte-threshold-checker pattern
    // Run non-blocking so the UI responds instantly
    if (Platform.OS !== 'web') {
      checkThresholds()
        .then((violations) => {
          const glucoseViolations = violations.filter((v) => v.category === 'glucose');
          if (glucoseViolations.length > 0) {
            dispatchViolationNotifications(glucoseViolations).catch(() => {});
          }
        })
        .catch(() => {});
    }

    setValue('');
    setNote('');
    // Contextual upsell: fire after 5th glucose reading (free users only)
    setTimeout(() => { checkUpsell('glucose_third_log').catch(() => {}); }, 600);
  }, [value, unit, context, note, addBloodSugar, l]);

  // Auto-clear the cancel pill once the notification has fired
  useEffect(() => {
    if (!recheckFireTime || !pendingRecheckId) return;
    const delay = recheckFireTime.getTime() - Date.now();
    if (delay <= 0) {
      setPendingRecheckId(null);
      setRecheckFireTime(null);
      AsyncStorage.removeItem(RECHECK_STORAGE_KEY);
      return;
    }
    const t = setTimeout(() => {
      setPendingRecheckId(null);
      setRecheckFireTime(null);
      AsyncStorage.removeItem(RECHECK_STORAGE_KEY);
    }, delay);
    return () => clearTimeout(t);
  }, [recheckFireTime, pendingRecheckId]);

  const handleCancelRecheck = useCallback(async () => {
    await cancelGlucoseRecheckNotification();
    await AsyncStorage.removeItem(RECHECK_STORAGE_KEY);
    setPendingRecheckId(null);
    setRecheckFireTime(null);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(l.reminderCancelled ?? 'Reminder Cancelled', l.reminderCancelledMsg ?? 'The 2-hour glucose recheck reminder has been cancelled.');
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(l.deleteEntry, l.deleteBsMsg, [
      { text: l.cancel, style: 'cancel' },
      {
        text: l.delete, style: 'destructive', onPress: () => {
          deleteBloodSugar(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteBloodSugar, l]);

  const handleBleDeviceSelected = async (device: import('@/lib/ble/ble-manager').ScannedDevice) => {
    setBleVisible(false);
    setBleConnecting(true);
    notifyBleState('connecting', { id: device.id, name: device.name, category: device.category });
    try {
      const result = await readDeviceByCategory(device);
      if (result.type === 'blood-sugar') {
        notifyBleState('connected', { id: device.id, name: device.name, category: device.category });
        const newRecords = deduplicateBloodSugar(result.records, records);
        for (const rec of newRecords) { await addBloodSugar({ ...rec, deviceName: device.name }); }
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(l.syncedViaBle, bleReadSummary(result, device.name));
      } else if (result.type === 'unsupported') {
        notifyBleState('idle');
        Alert.alert(l.deviceNotSupported, result.reason);
      } else if (result.type === 'no-service') {
        notifyBleState('error');
        Alert.alert(l.noHealthService, bleReadSummary(result, device.name));
      } else {
        notifyBleState('error');
        Alert.alert(l.bleError, bleReadSummary(result, device.name));
      }
    } catch (_unused) {
      notifyBleState('error');
      Alert.alert(l.bleError, l.bleErrorMsg);
    } finally {
      setBleConnecting(false);
      setTimeout(() => notifyBleState('idle'), 3000);
    }
  };

  const s = styles(colors);

  // ── Scroll-to-top & date-range filter ────────────────────────────────────────
  const flatListRef = useRef<FlatList<BloodSugarRecord>>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopOpacity = useRef(new Animated.Value(0)).current;
  type DateRange = '7d' | '30d' | 'all';
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const filteredRecords = useMemo(() => {
    if (dateRange === 'all') return records;
    const cutoff = Date.now() - (dateRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    return records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
  }, [records, dateRange]);

  const glucoseStats = useMemo(() => {
    if (dateRange === 'all' || filteredRecords.length === 0) return null;
    const vals = filteredRecords.map(r => r.glucoseMgDl);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { avg, min, max, count: vals.length };
  }, [filteredRecords, dateRange]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldShow = y > 300;
    if (shouldShow !== showScrollTop) {
      setShowScrollTop(shouldShow);
      Animated.timing(scrollTopOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showScrollTop, scrollTopOpacity]);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ── ListHeaderComponent — everything above the history rows ─────────────────
  const ListHeader = useMemo(() => (
    <View>
      {/* ─── Entry Card ─────────────────────────────────────────────────── */}
      <View style={s.card}>
        {/* Unit Toggle */}
        <View style={s.unitRow}>
          {([l.unitMgdl, l.unitMmol] as Unit[]).map(u => (
            <Pressable
              key={u}
              onPress={() => { setUnit(u as Unit); setValue(''); saveGlucoseUnitPreference(u as Unit).catch(() => {}); }}
              style={({ pressed }) => [s.unitBtn, unit === u && s.unitBtnActive, pressed && { opacity: 0.7 }]}
            >
              <Text style={[s.unitLabel, unit === u && s.unitLabelActive]}>{u}</Text>
            </Pressable>
          ))}
        </View>

        {/* Value Input */}
        <View style={s.inputRow}>
          <TextInput
            style={s.valueInput}
            value={value}
            onChangeText={setValue}
            placeholder={unit === 'mg/dL' ? '95' : '5.3'}
            placeholderTextColor={colors.muted}
            keyboardType="default"
            returnKeyType="done"
            maxLength={6}
          />
          <Text style={s.unitSuffix}>{unit}</Text>
        </View>

        {/* Context Selector */}
        <Text style={s.contextLabel}>{l.contextLabel}</Text>
        <View style={s.contextRow}>
          {([
            { value: 'fasting', label: l.ctxFasting },
            { value: 'post-meal', label: l.ctxPostMeal },
            { value: 'random', label: l.ctxRandom },
            { value: 'bedtime', label: l.ctxBedtime },
          ] as { value: BloodSugarContext; label: string }[]).map(c => (
            <Pressable
              key={c.value}
              onPress={() => setContext(c.value)}
              style={({ pressed }) => [s.contextBtn, context === c.value && s.contextBtnActive, pressed && { opacity: 0.7 }]}
            >
              <Text style={[s.contextBtnText, context === c.value && s.contextBtnTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.muted, marginBottom: 6 }}>Notes</Text>
        <TextInput
          style={s.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder={l.notePlaceholder}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          maxLength={80}
        />
        <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: -10, marginBottom: 10 }}>{note.length}/80</Text>

        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
        >
          <Text style={s.saveBtnText}>{l.saveEntry}</Text>
        </Pressable>

        {/* Privacy note */}
        <View style={s.privacyNote}>
          <IconSymbol name="lock.fill" size={11} color="#10B981" />
          <Text style={s.privacyNoteText}>Blood sugar data stays on this device</Text>
        </View>
      </View>

      {/* ─── Today's Nutrition Summary ──────────────────────────────────── */}
      {todayNutrition && (() => {
        const gl = todayNutrition.glycemicLoad;
        const glColor = gl >= 20 ? '#EF4444' : gl >= 11 ? '#F59E0B' : '#10B981';
        const glLabel = gl >= 20 ? (l.highGL ?? 'High GL') : gl >= 11 ? (l.mediumGL ?? 'Medium GL') : (l.lowGL ?? 'Low GL');
        const carbTarget = 225;
        const calTarget = 2000;
        return (
          <View style={[s.nutritionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.nutritionCardHeader}>
              <Text style={[s.nutritionCardTitle, { color: colors.foreground }]}>🍽️ {l.todaysNutrition ?? "Today's Nutrition"}</Text>
              <View style={[s.nutritionGlBadge, { backgroundColor: glColor + '22', borderColor: glColor + '55' }]}>
                <Text style={[s.nutritionGlBadgeText, { color: glColor }]}>{glLabel} · {Math.round(gl)}</Text>
              </View>
            </View>
            <Text style={[s.nutritionSub, { color: colors.muted }]}>
              From {todayNutrition.mealCount} {dietOption?.label ?? 'Diet'} {todayNutrition.mealCount === 1 ? (l.mealFromEntry ?? 'entry') : (l.mealFromEntries ?? 'entries')} today
            </Text>
            <View style={s.macroGrid}>
              {[
                { label: l.caloriesLabel ?? 'Calories', value: `${Math.round(todayNutrition.calories)}`, unit: 'kcal', target: calTarget, color: '#3B82F6' },
                { label: ((complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en).carbs, value: `${Math.round(todayNutrition.carbsG)}`, unit: 'g', target: carbTarget, color: '#F59E0B' },
                { label: l.sugarLabel ?? 'Sugar', value: `${Math.round(todayNutrition.sugarG)}`, unit: 'g', target: 25, color: '#EF4444' },
                { label: ((complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en).fat, value: `${Math.round(todayNutrition.fatG)}`, unit: 'g', target: 65, color: '#8B5CF6' },
                { label: ((complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en).protein, value: `${Math.round(todayNutrition.proteinG)}`, unit: 'g', target: 50, color: '#10B981' },
                { label: l.fiberLabel ?? 'Fiber', value: `${Math.round(todayNutrition.fiberG)}`, unit: 'g', target: 28, color: '#06B6D4' },
              ].map(m => (
                <View key={m.label} style={[s.macroTile, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[s.macroValue, { color: m.color }]}>{m.value}<Text style={[s.macroUnit, { color: colors.muted }]}> {m.unit}</Text></Text>
                  <Text style={[s.macroLabel, { color: colors.muted }]}>{m.label}</Text>
                  <View style={[s.macroBar, { backgroundColor: colors.border }]}>
                    <View style={[s.macroBarFill, { backgroundColor: m.color, width: `${Math.min(100, (parseFloat(m.value) / m.target) * 100)}%` as any }]} />
                  </View>
                </View>
              ))}
            </View>
            {todayNutrition.sugarG > 25 && (
              <View style={[s.sugarWarning, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
                <Text style={[s.sugarWarningText, { color: '#EF4444' }]}>
                  {l.sugarWarningText(Math.round(todayNutrition.sugarG))}
                </Text>
              </View>
            )}
          </View>
        );
      })()}

      {/* ─── A1C Target Setting ──────────────────────────────────────────── */}
      <View style={[s.a1cTargetRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.a1cTargetLabel, { color: colors.foreground }]}>{l.myA1cTarget ?? 'My A1C Target'}</Text>
          <Text style={[s.a1cTargetSub, { color: colors.muted }]}>ADA Standards of Care 2024 §6.6</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            s.a1cTargetBtn,
            { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => setShowA1CTargetPicker(v => !v)}
        >
          <Text style={[s.a1cTargetBtnText, { color: colors.primary }]}>{'< '}{a1cTarget}%</Text>
          <IconSymbol name="chevron.right" size={11} color={colors.primary}
            style={{ transform: [{ rotate: showA1CTargetPicker ? '90deg' : '0deg' }] }} />
        </Pressable>
      </View>
      {showA1CTargetPicker && (
        <View style={[s.a1cPresetList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {A1C_TARGET_PRESETS.map(preset => (
            <Pressable
              key={preset.value}
              style={({ pressed }) => [
                s.a1cPresetItem,
                { borderBottomColor: colors.border },
                a1cTarget === preset.value && { backgroundColor: colors.primary + '12' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                setA1CTarget(preset.value);
                saveA1CTarget(preset.value).catch(() => {});
                setShowA1CTargetPicker(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.a1cPresetLabel, { color: a1cTarget === preset.value ? colors.primary : colors.foreground }]}>
                  {preset.label}
                </Text>
                <Text style={[s.a1cPresetDesc, { color: colors.muted }]}>{preset.description}</Text>
              </View>
              {a1cTarget === preset.value && (
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>✓</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* ─── Projected A1C (premium-gated) ────────────────────────────────── */}
      {isA1CPremium ? (
        <ProjectedA1CCard
          bloodSugarRecords={records}
          defaultWindowDays={30}
          defaultExpanded={false}
          a1cTarget={a1cTarget}
        />
      ) : (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={requireA1CPremium(() => {}, { feature: 'Projected A1C' })}
          style={[s.a1cLockedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={s.a1cLockedIconWrap}>
            <Text style={{ fontSize: 22 }}>🩸</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.a1cLockedTitle, { color: colors.primary }]}>{rs.projectedA1CPremium}</Text>
            <Text style={[s.a1cLockedSub, { color: colors.muted }]}>{rs.projectedA1CUnlock}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[s.a1cTryFreeBtn, { backgroundColor: colors.primary }]}>
              <Text style={s.a1cTryFreeTxt}>{rs.projectedA1CTryFree ?? 'Try free →'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <IconSymbol name="lock.fill" size={11} color={colors.muted} />
              <IconSymbol name="chevron.right" size={12} color={colors.muted} />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* ─── CGM Info Banner (non-interactive) ──────────────── */}
      <View style={[s.cgmImportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cgmImportLeft}>
          <Text style={s.cgmImportIcon}>📲</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.cgmImportTitle, { color: colors.foreground }]}>{l.cgmImportTitle}</Text>
            <Text style={[s.cgmImportSub, { color: colors.muted }]}>
              {l.cgmImportSub}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 16 }}>ℹ️</Text>
      </View>

      {/* ─── History section title + date-range filter ────────────────────── */}
      <View style={s.historyHeader}>
        <Text style={s.sectionTitle}>{l.history}</Text>
        <View style={s.rangeRow}>
          {(['7d', '30d', 'all'] as const).map(r => (
            <Pressable
              key={r}
              onPress={() => setDateRange(r)}
              style={({ pressed }) => [
                s.rangeBtn,
                dateRange === r && { backgroundColor: colors.primary },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[s.rangeBtnText, dateRange === r && { color: '#fff' }]}>
                {r === '7d' ? (l.period7d ?? '7d') : r === '30d' ? (l.period30d ?? '30d') : (l.periodAll ?? 'All')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ─── Glucose Trend Chart with threshold bands + TIR bar ────────── */}
      <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)}>
        {chartWidth > 0 && (
          <GlucoseTrendChart
            records={filteredRecords}
            thresholds={glucoseThresholds}
            unit={unit}
            width={chartWidth}
          />
        )}
      </View>

      {/* ─── Mini stats bar (shown only when a date range is active) ────── */}
      {glucoseStats && (
        <View style={[s.statsBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: l.statsAvg ?? 'Avg', value: unit === 'mmol/L' ? mgDlToMmol(glucoseStats.avg).toFixed(1) : String(glucoseStats.avg), color: colors.primary },
            { label: l.statsMin ?? 'Min', value: unit === 'mmol/L' ? mgDlToMmol(glucoseStats.min).toFixed(1) : String(glucoseStats.min), color: '#10B981' },
            { label: l.statsMax ?? 'Max', value: unit === 'mmol/L' ? mgDlToMmol(glucoseStats.max).toFixed(1) : String(glucoseStats.max), color: '#EF4444' },
            { label: l.readingsLabel ?? 'Readings', value: String(glucoseStats.count), color: colors.muted },
          ].map(stat => (
            <View key={stat.label} style={s.statItem}>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[s.statLabel, { color: colors.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [
    unit, value, context, note, todayNutrition, a1cTarget, showA1CTargetPicker,
    records, colors, l, dietOption, s, dateRange, glucoseStats,
    handleSave, setUnit, setValue, setContext, setNote, setShowA1CTargetPicker, setDateRange,
    glucoseThresholds, chartWidth, setChartWidth,
  ]);

  return (
    <ScreenContainer>
      {/* Contextual upsell bottom sheet */}
      {UpsellSheet}
      {/* Projected A1C premium gate sheet — render as expression (never as <A1CGateSheet />
           because PremiumGateSheet is React.ReactElement|null; calling it as a JSX element
           when null causes maybeHijackSafeAreaProvider crash on iOS 26.5 / Hermes) */}
      {A1CGateSheet}
      {/* Bluetooth premium gate */}
      {BleGateSheet}

      <BleScannerSheet
        visible={bleVisible}
        category={['glucometer', 'cgm']}
        onDeviceSelected={handleBleDeviceSelected}
        onClose={() => setBleVisible(false)}
      />

      {/* Header — fixed above the scrollable list */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}>
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={s.title}>{l.bloodSugarTitle}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* BT button */}
          <Pressable
            onPress={requireBlePremium(() => setBleVisible(true), { feature: 'Bluetooth Devices' })}
            disabled={bleConnecting}
            style={({ pressed }) => [s.syncBtn, { backgroundColor: '#0A7EA422' }, pressed && { opacity: 0.6 }]}
          >
            {bleConnecting
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[s.syncBtnText, { color: colors.primary }]}>📶 BT</Text>
            }
          </Pressable>
          {/* Health sync button */}
          <Pressable
            onPress={handleDeviceSync}
            disabled={syncing}
            style={({ pressed }) => [s.syncBtn, pressed && { opacity: 0.6 }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[s.syncBtnText, { color: colors.primary }]}>{l.syncBtn}</Text>
            }
          </Pressable>
        </View>
      </View>

      {/* Single FlatList — header contains form + A1C sections, data rows are history */}
      <FlatList
        ref={flatListRef}
        data={filteredRecords}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListEmptyComponent={
          <Text style={s.empty}>{dateRange === 'all' ? l.bloodSugarEmpty : (l.noReadingsPeriod ?? 'No readings in this period.')}</Text>
        }
        renderItem={({ item }) => {
          const status = getBloodSugarStatus(item.glucoseMgDl, item.context);
          const statusColor = STATUS_COLORS[status];
          const ctxMap: Record<string, string> = {
            fasting: l.ctxFasting, 'post-meal': l.ctxPostMeal, random: l.ctxRandom, bedtime: l.ctxBedtime,
          };
          const contextLabel = ctxMap[item.context] ?? item.context;
          const statusLabels: Record<string, string> = {
            normal: l.statusNormal, prediabetes: l.statusPrediabetes, high: l.statusHigh, low: l.statusLow,
          };
          const hasPendingRecheck = pendingRecheckId === item.id;
          const renderRightActions = () => (
            <Pressable
              onPress={() => handleDelete(item.id)}
              style={[s.swipeDeleteBtn, { backgroundColor: colors.error }]}
            >
              <IconSymbol name="trash" size={20} color="#fff" />
              <Text style={s.swipeDeleteText}>Delete</Text>
            </Pressable>
          );
          return (
            <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={s.rowTopRow}>
                  <Text style={s.rowValue}>
                    {unit === l.unitMgdl
                      ? `${item.glucoseMgDl} ${l.unitMgdl}`
                      : `${item.glucoseMmol?.toFixed(1) ?? mgDlToMmol(item.glucoseMgDl).toFixed(1)} ${l.unitMmol}`}
                  </Text>
                  <View style={[s.badge, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[s.badgeText, { color: statusColor }]}>{statusLabels[status] ?? status}</Text>
                  </View>
                </View>
                <Text style={s.contextChip}>{contextLabel}</Text>
                <Text style={s.rowSub}>{formatDate(item.timestamp)}</Text>
                {item.note ? <Text style={s.rowNote}>{item.note}</Text> : null}
                {hasPendingRecheck && recheckFireTime && (
                  <View style={s.recheckPillRow}>
                    <Pressable
                      onPress={handleCancelRecheck}
                      style={({ pressed }) => [
                        s.cancelRecheckBtn,
                        { backgroundColor: colors.warning + '18', borderColor: colors.warning + '50' },
                        pressed && { opacity: 0.65 },
                      ]}
                    >
                      <Text style={[s.cancelRecheckText, { color: colors.warning }]}>
                        {l.recheckReminderAt(recheckFireTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}  {l.cancelReminder}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setContext('post-meal');
                        setValue('');
                        setNote('');
                      }}
                      style={({ pressed }) => [
                        s.logNewBtn,
                        { backgroundColor: colors.primary + '18', borderColor: colors.primary + '50' },
                        pressed && { opacity: 0.65 },
                      ]}
                    >
                      <Text style={[s.logNewBtnText, { color: colors.primary }]}>
                        {l.logNewReading}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <Pressable
                onPress={() => handleDelete(item.id)}
                style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.5 }]}
              >
                <IconSymbol name="xmark" size={16} color={colors.error} />
              </Pressable>
            </View>
            </Swipeable>
          );
        }}
      />

      {/* Floating scroll-to-top button */}
      <Animated.View
        style={[
          s.scrollTopBtn,
          { backgroundColor: colors.primary, opacity: scrollTopOpacity },
          { pointerEvents: showScrollTop ? 'auto' : 'none' } as any,
        ]}
      >
        <Pressable
          onPress={scrollToTop}
          style={({ pressed }) => [{ padding: 12 }, pressed && { opacity: 0.75 }]}
        >
          <IconSymbol name="chevron.up" size={18} color="#fff" />
        </Pressable>
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: c.foreground },
  listContent: { paddingBottom: 48 },
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: c.surfaceRaised, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  // Form
  unitRow: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 10, padding: 3, marginBottom: 14, alignSelf: 'flex-start' },
  unitBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  unitBtnActive: { backgroundColor: c.primary },
  unitLabel: { fontSize: 13, fontWeight: '600', color: c.muted },
  unitLabelActive: { color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  valueInput: { flex: 1, fontSize: 36, fontWeight: '700', color: c.foreground, paddingVertical: 4 },
  unitSuffix: { fontSize: 16, color: c.muted, marginLeft: 8 },
  contextLabel: { fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  contextBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  contextBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  contextBtnText: { fontSize: 13, fontWeight: '600', color: c.muted },
  contextBtnTextActive: { color: '#fff' },
  noteInput: { fontSize: 14, color: c.foreground, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  saveBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  privacyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 },
  privacyNoteText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  // History
  sectionTitle: { fontSize: 15, fontWeight: '700', color: c.foreground, marginHorizontal: 16, marginBottom: 10 },
  empty: { textAlign: 'center', color: c.muted, fontSize: 14, marginTop: 32, marginHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.surfaceRaised, borderRadius: 12, padding: 14, marginBottom: 8, marginHorizontal: 16, borderWidth: 1, borderColor: c.border },
  rowLeft: { flex: 1 },
  rowTopRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  rowValue: { fontSize: 20, fontWeight: '700', color: c.foreground },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  contextChip: { fontSize: 12, color: c.muted, marginTop: 4 },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 4 },
  rowNote: { fontSize: 12, color: c.muted, marginTop: 4, fontStyle: 'italic' },
  deleteBtn: { padding: 8 },
  syncBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  syncBtnText: { fontSize: 14, fontWeight: '600' },
  // Cancel recheck button
  recheckPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  cancelRecheckBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  cancelRecheckText: { fontSize: 12, fontWeight: '600' },
  logNewBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  logNewBtnText: { fontSize: 12, fontWeight: '700' },
  // Nutrition summary card
  nutritionCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, padding: 16 },
  nutritionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  nutritionCardTitle: { fontSize: 15, fontWeight: '700' },
  nutritionSub: { fontSize: 12, marginBottom: 12 },
  nutritionGlBadge: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  nutritionGlBadgeText: { fontSize: 11, fontWeight: '700' },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  macroTile: { width: '30%', borderRadius: 10, borderWidth: 1, padding: 8, alignItems: 'center' },
  macroValue: { fontSize: 16, fontWeight: '700' },
  macroUnit: { fontSize: 10, fontWeight: '400' },
  macroLabel: { fontSize: 10, marginTop: 2, marginBottom: 4 },
  macroBar: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: 4, borderRadius: 2 },
  sugarWarning: { borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 4 },
  sugarWarningText: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  // Projected A1C locked card (free users)
  a1cLockedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 8, marginTop: 4,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  a1cLockedIconWrap: {
    width: 40, height: 40, borderRadius: 11,
    backgroundColor: 'rgba(10,126,164,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  a1cLockedTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  a1cLockedSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  a1cTryFreeBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  a1cTryFreeTxt: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },
  // A1C Target picker
  a1cTargetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8, marginTop: 4,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  a1cTargetLabel: { fontSize: 14, fontWeight: '700' },
  a1cTargetSub: { fontSize: 11, marginTop: 1 },
  a1cTargetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
  },
  a1cTargetBtnText: { fontSize: 14, fontWeight: '800' },
  a1cPresetList: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  a1cPresetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  a1cPresetLabel: { fontSize: 14, fontWeight: '700' },
  a1cPresetDesc: { fontSize: 11, marginTop: 1 },
  // Mini stats bar
  statsBar: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  // CGM Import row
  cgmImportRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  cgmImportLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cgmImportIcon: { fontSize: 22 },
  cgmImportTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  cgmImportSub: { fontSize: 12, lineHeight: 16 },
  // History header + date-range filter
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10 },
  rangeRow: { flexDirection: 'row', gap: 4 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  rangeBtnText: { fontSize: 12, fontWeight: '700', color: c.muted },
  // Scroll-to-top FAB
  scrollTopBtn: {
    position: 'absolute', bottom: 24, right: 20,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
    elevation: 4,
  },
  // Swipe-to-delete
  swipeDeleteBtn: {
    justifyContent: 'center', alignItems: 'center',
    width: 80, marginBottom: 8, marginRight: 16, borderRadius: 12,
  },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4 },
});
