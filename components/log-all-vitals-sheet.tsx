/**
 * LogAllVitalsSheet
 * ─────────────────
 * A bottom-sheet that lets the user log all vitals in one place:
 *   Blood Pressure · Weight · Blood Sugar · Sleep (REM/Core/Deep/Awake) · HRV
 *
 * Features:
 *  - Section toggle chips to skip sections you don't want to log
 *  - Entry date picker
 *  - Apple Speech (SFSpeechRecognizer) voice-to-form: tap mic → speak →
 *    all sections auto-fill from the transcript via the server LLM
 *  - Save Entry persists each active section to health-context
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { trpc } from '@/lib/trpc';
import { parseVitalsTranscript as parseAllVitalsTranscript } from '@/lib/scribe/parsers';
import { getNativeHealthService } from '@/lib/health/native-health-service';
import { useHealth } from '@/lib/health/health-context';
import { useColorScheme, useColors, useDictationBoxStrings, useLang, useLogAllVitalsStrings } from '@/hooks';
import { MicrophoneIcon } from '@/components/ui/microphone-icon';
import { WaveformBars } from '@/components/ui/waveform-bars';
import ReAnimated, { FadeIn as FadeInAnim, FadeOut as FadeOutAnim } from 'react-native-reanimated';
import type {
  BloodPressureRecord,
  BloodSugarRecord,
  SleepRecord,
  VitalSignsRecord,
  WeightRecord,
} from '@/lib/health/types';
import { KeyboardDictationBanner, type KeyboardDictationBannerHandle } from '@/components/keyboard-dictation-banner';

// ─── Voice Scribe: Apple Keyboard Dictation (crash-free, no TurboModule bridge) ─
// Tap mic → hidden TextInput focuses → iOS keyboard opens with its built-in
// dictation mic key → user speaks (Apple Dictation / Google Voice Typing) →
// text flows via onChangeText → tap Done → parseAllVitalsTranscript pipeline.
// This completely avoids @react-native-voice/voice and its TurboModule bridge
// which caused Hermes Signal 11 / SIGSEGV on iOS 26 Beta New Architecture.
// (ObjCTurboModule → convertNSExceptionToJSError → backtrace_symbols → dladdr
//  → dyld3::MachOLoaded::findClosestSymbol ← SIGSEGV use-after-free).

// ─── Types ───────────────────────────────────────────────────────────────────
type SectionKey = 'bp' | 'weight' | 'sugar' | 'sleep' | 'hrv' | 'voice';

const SECTIONS: { key: SectionKey; label: string; emoji: string; color: string }[] = [
  { key: 'bp',     label: 'Blood Pressure', emoji: '❤️',  color: '#EF4444' },
  { key: 'weight', label: 'Weight',         emoji: '⚖️',  color: '#8B5CF6' },
  { key: 'sugar',  label: 'Blood Sugar',    emoji: '🩸',  color: '#F59E0B' },
  { key: 'sleep',  label: 'Sleep',          emoji: '🌙',  color: '#3B82F6' },
  { key: 'hrv',    label: 'HRV',            emoji: '💚',  color: '#10B981' },
  { key: 'voice',  label: 'Voice',          emoji: '🎤',  color: '#6366F1' },
];

const SUGAR_CONTEXTS = ['fasting', 'post-meal', 'random', 'bedtime'] as const;
const HRV_CONTEXTS   = ['morning', 'night', 'post-exercise', 'resting'] as const;

export interface LogAllVitalsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function minutesToHM(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function LogAllVitalsSheet({ visible, onClose }: LogAllVitalsSheetProps) {
  const insets  = useSafeAreaInsets();
  const _colors  = useColors();
  const scheme  = useColorScheme();
  const db = useDictationBoxStrings();
  const lv = useLogAllVitalsStrings();
  const isDark  = scheme === 'dark';

  const { addVitalSigns, addWeight, addBloodSugar, addSleep } = useHealth();

  // ── Active sections ────────────────────────────────────────────────────────
  const [active, setActive] = useState<Set<SectionKey>>(
    new Set(['bp', 'weight', 'sugar', 'sleep', 'hrv', 'voice'] as SectionKey[])
  );

  // ── Entry date ─────────────────────────────────────────────────────────────
  const [entryDate, setEntryDate] = useState(new Date());
  const bannerRef = useRef<KeyboardDictationBannerHandle>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Blood Pressure ─────────────────────────────────────────────────────────
  const [systolic,  setSystolic]  = useState('');
  const [diastolic, setDiastolic] = useState('');

  // ── Weight ─────────────────────────────────────────────────────────────────
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [weightVal,  setWeightVal]  = useState('');

  // ── Blood Sugar ────────────────────────────────────────────────────────────
  const [sugarUnit,    setSugarUnit]    = useState<'mg/dL' | 'mmol/L'>('mg/dL');
  const [sugarVal,     setSugarVal]     = useState('');
  const [sugarContext, setSugarContext] = useState<typeof SUGAR_CONTEXTS[number]>('fasting');

  // ── Sleep ──────────────────────────────────────────────────────────────────
  const [sleepTotal, setSleepTotal] = useState('');
  const [sleepRem,   setSleepRem]   = useState('');
  const [sleepCore,  setSleepCore]  = useState('');
  const [sleepDeep,  setSleepDeep]  = useState('');
  const [sleepAwake, setSleepAwake] = useState('');

  // ── HRV ───────────────────────────────────────────────────────────────────
  const [hrvVal,     setHrvVal]     = useState('');
  const [hrvContext, setHrvContext] = useState<typeof HRV_CONTEXTS[number]>('morning');

  // ── One-time mic tooltip ──────────────────────────────────────────────────
  // Shows a callout bubble on the very first mic tap so the user knows to look
  // at the keyboard's built-in 🎤 key. Persisted via AsyncStorage so it only
  // ever appears once across all app sessions.
  const MIC_TOOLTIP_KEY = '@vitalsync/mic_tooltip_shown';
  const [showMicTooltip, setShowMicTooltip] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissTooltip = useCallback(() => {
    setShowMicTooltip(false);
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; }
  }, []);

  // Clean up tooltip timer on unmount
  useEffect(() => () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
  }, []);

  // ── Voice scribe ─────────────────────────────────────────────────────
  const [listening,    setListening]    = useState(false);
  const [partialText,  setPartialText]  = useState('');
  const [finalText,    setFinalText]    = useState('');
  const [scribeStatus, setScribeStatus] = useState<'idle' | 'listening' | 'parsing' | 'done' | 'error'>('idle');
  const [scribeReasoning, setScribeReasoning] = useState('');
  const [volumeLevel,  setVolumeLevel]  = useState(0);
  const [recSecs,      setRecSecs]      = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Saving ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // ── Toast animation ────────────────────────────────────────────────────────
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = useCallback(() => {
    setSaved(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSaved(false));
  }, [toastAnim]);

  // ── Apple Health prefill ──────────────────────────────────────────────────
  const [prefilling, setPrefilling] = useState(false);

  const handlePrefillFromHealthKit = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Not Available', 'Apple Health is only available on iOS.');
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPrefilling(true);
      const svc = getNativeHealthService();
      await svc.requestPermissions();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours

      const [bpSamples, weightSamples, glucoseSamples, sleepSamples, hrSamples] = await Promise.allSettled([
        svc.fetchBloodPressure(since),
        svc.fetchWeight(since),
        svc.fetchBloodGlucose(since),
        svc.fetchSleep(since),
        svc.fetchHeartRate(since),
      ]);

      let prefilled = 0;

      // Blood Pressure — latest reading
      if (bpSamples.status === 'fulfilled' && bpSamples.value.length > 0) {
        const latest = bpSamples.value[bpSamples.value.length - 1] as { systolic?: number; diastolic?: number };
        if (latest.systolic && latest.diastolic) {
          setSystolic(String(Math.round(latest.systolic)));
          setDiastolic(String(Math.round(latest.diastolic)));
          prefilled++;
        }
      }

      // Weight — latest reading
      if (weightSamples.status === 'fulfilled' && weightSamples.value.length > 0) {
        const latest = weightSamples.value[weightSamples.value.length - 1] as { weightKg?: number; weightLbs?: number };
        if (latest.weightLbs) {
          setWeightUnit('lbs');
          setWeightVal(String(Math.round(latest.weightLbs * 10) / 10));
          prefilled++;
        } else if (latest.weightKg) {
          setWeightUnit('kg');
          setWeightVal(String(Math.round(latest.weightKg * 10) / 10));
          prefilled++;
        }
      }

      // Blood Glucose — latest reading
      if (glucoseSamples.status === 'fulfilled' && glucoseSamples.value.length > 0) {
        const latest = glucoseSamples.value[glucoseSamples.value.length - 1] as { glucoseMgDl?: number };
        if (latest.glucoseMgDl) {
          setSugarUnit('mg/dL');
          setSugarVal(String(Math.round(latest.glucoseMgDl)));
          prefilled++;
        }
      }

      // Sleep — most recent sleep record
      if (sleepSamples.status === 'fulfilled' && sleepSamples.value.length > 0) {
        const latest = sleepSamples.value[sleepSamples.value.length - 1] as {
          totalMinutes?: number; remMinutes?: number; deepMinutes?: number;
          lightMinutes?: number; coreMinutes?: number; awakeMinutes?: number;
        };
        if (latest.totalMinutes) {
          setSleepTotal(String(latest.totalMinutes));
          if (latest.remMinutes)   setSleepRem(String(latest.remMinutes));
          if (latest.deepMinutes)  setSleepDeep(String(latest.deepMinutes));
          if (latest.lightMinutes || latest.coreMinutes)
            setSleepCore(String(latest.lightMinutes ?? latest.coreMinutes ?? 0));
          if (latest.awakeMinutes) setSleepAwake(String(latest.awakeMinutes));
          prefilled++;
        }
      }

      // HRV — from heart rate records that include hrv field
      if (hrSamples.status === 'fulfilled' && hrSamples.value.length > 0) {
        const withHrv = (hrSamples.value as { hrv?: number }[]).filter(r => r.hrv != null);
        if (withHrv.length > 0) {
          const latest = withHrv[withHrv.length - 1];
          setHrvVal(String(Math.round(latest.hrv!)));
          prefilled++;
        }
      }

      if (prefilled === 0) {
        Alert.alert('No Data Found', 'No health data was found in the last 24 hours. Make sure Apple Health permissions are granted in Settings.');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (_err) {
      Alert.alert('Apple Health Error', 'Could not read health data. Please check permissions in Settings > Privacy > Health.');
    } finally {
      setPrefilling(false);
    }
  }, []);

  // ── Server mutation ────────────────────────────────────────────────────────

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setActive(new Set(['bp', 'weight', 'sugar', 'sleep', 'hrv']));
      setEntryDate(new Date());
      setSystolic(''); setDiastolic('');
      setWeightVal('');
      setSugarVal(''); setSugarContext('fasting');
      setSleepTotal(''); setSleepRem(''); setSleepCore(''); setSleepDeep(''); setSleepAwake('');
      setHrvVal(''); setHrvContext('morning');
      setPartialText(''); setFinalText('');
      setScribeStatus('idle');
      setSaving(false); setSaved(false);
    }
  }, [visible]);

  // ── Hidden TextInput ref for keyboard dictation ─────────────────────────
  const dictationInputRef = useRef<TextInput>(null);
  const [dictationText, setDictationText] = useState('');

  // Animate waveform bars while keyboard is open (simulated activity)
  useEffect(() => {
    if (!listening) { setVolumeLevel(0); return; }
    const id = setInterval(() => setVolumeLevel(Math.random() * 8 + 1), 120);
    return () => clearInterval(id);
  }, [listening]);

  const applyParseResult = useCallback((result: {
    bp: { systolic: number; diastolic: number } | null;
    weight: { weightKg: number; weightLbs: number; unit: 'kg' | 'lbs' } | null;
    bloodSugar: { valueMgDl: number; valueMmol: number; context: string } | null;
    sleep: { totalMinutes: number; remMinutes: number; coreMinutes: number; deepMinutes: number; awakeMinutes: number } | null;
    hrv: { sdnn: number; context: string } | null;
  }) => {
    if (result.bp) {
      setSystolic(String(result.bp.systolic));
      setDiastolic(String(result.bp.diastolic));
    }
    if (result.weight) {
      setWeightUnit(result.weight.unit);
      setWeightVal(String(
        result.weight.unit === 'kg'
          ? result.weight.weightKg.toFixed(1)
          : result.weight.weightLbs.toFixed(1)
      ));
    }
    if (result.bloodSugar) {
      setSugarVal(sugarUnit === 'mg/dL'
        ? String(Math.round(result.bloodSugar.valueMgDl))
        : String(result.bloodSugar.valueMmol.toFixed(1))
      );
      if (SUGAR_CONTEXTS.includes(result.bloodSugar.context as typeof SUGAR_CONTEXTS[number])) {
        setSugarContext(result.bloodSugar.context as typeof SUGAR_CONTEXTS[number]);
      }
    }
    if (result.sleep) {
      setSleepTotal(String(result.sleep.totalMinutes));
      setSleepRem(String(result.sleep.remMinutes));
      setSleepCore(String(result.sleep.coreMinutes));
      setSleepDeep(String(result.sleep.deepMinutes));
      setSleepAwake(String(result.sleep.awakeMinutes));
    }
    if (result.hrv) {
      setHrvVal(String(result.hrv.sdnn));
      if (HRV_CONTEXTS.includes(result.hrv.context as typeof HRV_CONTEXTS[number])) {
        setHrvContext(result.hrv.context as typeof HRV_CONTEXTS[number]);
      }
    }
  }, [sugarUnit]);

  const startListening = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDictationText('');
    setPartialText('');
    setFinalText('');
    setScribeStatus('listening');
    setListening(true);
    setRecSecs(0);
    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    // Focus the hidden TextInput — iOS keyboard opens with its dictation mic key
    setTimeout(() => dictationInputRef.current?.focus(), 80);
    // One-time tooltip: show on first-ever mic tap, auto-dismiss after 4 s
    try {
      const shown = await AsyncStorage.getItem(MIC_TOOLTIP_KEY);
      if (!shown) {
        await safeSetItem(MIC_TOOLTIP_KEY, 'true');
        setShowMicTooltip(true);
        tooltipTimerRef.current = setTimeout(dismissTooltip, 4000);
      }
    } catch (_unused) { /* AsyncStorage failure is non-fatal */ }
  }, [dismissTooltip]);

  const stopListening = useCallback(() => {
    Keyboard.dismiss();
    setListening(false);
    setVolumeLevel(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecSecs(0);
  }, []);

  // Called when user taps Done on keyboard — submit the dictated text
  const submitDictation = useCallback((text: string) => {
    const trimmed = text.trim();
    stopListening();
    if (!trimmed) { setScribeStatus('idle'); return; }
    setFinalText(trimmed);
    setScribeStatus('parsing');
    try {
      const result = parseAllVitalsTranscript(trimmed);
      applyParseResult(result as any);
      setScribeReasoning((result as any).reasoning);
      setScribeStatus('done');
    } catch (_unused) {
      setScribeReasoning('');
      setScribeStatus('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopListening]);

  // ── Max-recording guard (160 s) ──────────────────────────────────────────
  useEffect(() => {
    if (!listening || recSecs < 160) return;
    stopListening();
    Alert.alert('Recording limit reached', 'Maximum recording length is 160 seconds.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSecs, listening]);

  // ── Toggle section ─────────────────────────────────────────────────────────
  const toggleSection = useCallback((key: SectionKey) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Save Entry ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    setSaving(true);
    const ts = entryDate.toISOString();
    const saves: Promise<void>[] = [];

    // Blood Pressure
    if (active.has('bp') && systolic && diastolic) {
      const sys = parseInt(systolic, 10);
      const dia = parseInt(diastolic, 10);
      if (!isNaN(sys) && !isNaN(dia) && sys > 0 && dia > 0) {
        const rec: VitalSignsRecord = {
          id: uid(), timestamp: ts,
          systolic: sys, diastolic: dia,
          source: 'manual',
        };
        saves.push(addVitalSigns(rec));
      }
    }

    // Weight
    if (active.has('weight') && weightVal) {
      const val = parseFloat(weightVal);
      if (!isNaN(val) && val > 0) {
        const kg  = weightUnit === 'kg' ? val : val * 0.453592;
        const lbs = weightUnit === 'lbs' ? val : val * 2.20462;
        const rec: WeightRecord = {
          id: uid(), timestamp: ts,
          weightKg: Math.round(kg * 10) / 10,
          weightLbs: Math.round(lbs * 10) / 10,
          source: 'manual',
        };
        saves.push(addWeight(rec));
      }
    }

    // Blood Sugar
    if (active.has('sugar') && sugarVal) {
      const val = parseFloat(sugarVal);
      if (!isNaN(val) && val > 0) {
        const mgDl  = sugarUnit === 'mg/dL' ? val : val * 18.016;
        const mmol  = sugarUnit === 'mmol/L' ? val : val / 18.016;
        const rec: BloodSugarRecord = {
          id: uid(), timestamp: ts,
          glucoseMgDl: Math.round(mgDl),
          glucoseMmol: Math.round(mmol * 10) / 10,
          context: sugarContext,
          source: 'manual',
        };
        saves.push(addBloodSugar(rec));
      }
    }

    // Sleep
    if (active.has('sleep') && sleepTotal) {
      const total = parseInt(sleepTotal, 10);
      if (!isNaN(total) && total > 0) {
        const rem   = parseInt(sleepRem, 10)   || Math.round(total * 0.20 / 5) * 5;
        const core  = parseInt(sleepCore, 10)  || Math.round(total * 0.50 / 5) * 5;
        const deep  = parseInt(sleepDeep, 10)  || Math.round(total * 0.15 / 5) * 5;
        const awake = parseInt(sleepAwake, 10) || Math.round(total * 0.15 / 5) * 5;
        // Compute bedtime/wake from entryDate (assume wakeTime = entryDate 07:00)
        const wakeTime = new Date(entryDate);
        wakeTime.setHours(7, 0, 0, 0);
        const bedTime = new Date(wakeTime.getTime() - total * 60_000);
        const rec: SleepRecord = {
          id: uid(),
          date: entryDate.toISOString().slice(0, 10),
          bedtime: bedTime.toISOString(),
          wakeTime: wakeTime.toISOString(),
          totalMinutes: total,
          remMinutes: rem,
          lightMinutes: core,   // lightMinutes = Core in Apple Health terminology
          coreMinutes: core,    // optional alias
          deepMinutes: deep,
          awakeMinutes: awake,
          efficiency: total > 0 ? Math.round(((total - awake) / total) * 100) : 0,
          source: 'manual',
        };
        saves.push(addSleep(rec));
      }
    }

    // HRV (stored as VitalSignsRecord with hrv field)
    if (active.has('hrv') && hrvVal) {
      const val = parseInt(hrvVal, 10);
      if (!isNaN(val) && val > 0) {
        const rec: VitalSignsRecord = {
          id: uid(), timestamp: ts,
          hrv: val,
          source: 'manual',
          note: `HRV context: ${hrvContext}`,
        };
        saves.push(addVitalSigns(rec));
      }
    }

    try {
      await Promise.all(saves);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast();
      setTimeout(() => {
        setSaving(false);
        onClose();
      }, 600);
    } catch (_unused) {
      setSaving(false);
      Alert.alert('Save Failed', 'Some entries could not be saved. Please try again.');
    }
  }, [
    active, entryDate, systolic, diastolic, weightVal, weightUnit,
    sugarVal, sugarUnit, sugarContext, sleepTotal, sleepRem, sleepCore,
    sleepDeep, sleepAwake, hrvVal, hrvContext,
    addVitalSigns, addWeight, addBloodSugar, addSleep, showToast, onClose,
  ]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasAnyData = useMemo(() => {
    if (active.has('bp')     && systolic && diastolic) return true;
    if (active.has('weight') && weightVal)             return true;
    if (active.has('sugar')  && sugarVal)              return true;
    if (active.has('sleep')  && sleepTotal)            return true;
    if (active.has('hrv')    && hrvVal)                return true;
    return false;
  }, [active, systolic, diastolic, weightVal, sugarVal, sleepTotal, hrvVal]);

  // ── Styles (dynamic) ───────────────────────────────────────────────────────
  const bg      = isDark ? '#0F172A' : '#FFFFFF';
  const surface = isDark ? '#1E293B' : '#F8FAFC';
  const border  = isDark ? '#334155' : '#E2E8F0';
  const fg      = isDark ? '#F1F5F9' : '#0F172A';
  const muted   = isDark ? '#94A3B8' : '#64748B';
  const inputBg = isDark ? '#1E293B' : '#F1F5F9';

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderLabel = (text: string) => (
    <Text style={[s.fieldLabel, { color: muted }]}>{text}</Text>
  );

  const renderInput = (
    value: string,
    onChangeText: (v: string) => void,
    placeholder: string,
    unit?: string,
    _keyboardType: 'numeric' | 'decimal-pad' = 'numeric',
    flex?: number,
  ) => (
    <View style={[s.inputWrap, { backgroundColor: inputBg, borderColor: border, flex: flex ?? 1 }]}>
      <TextInput
        style={[s.input, { color: fg }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={muted}
        keyboardType="default"
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
      />
      {unit ? <Text style={[s.inputUnit, { color: muted }]}>{unit}</Text> : null}
    </View>
  );

  const renderUnitToggle = (
    options: string[],
    selected: string,
    onSelect: (v: string) => void,
    colors_: string[],
  ) => (
    <View style={s.unitRow}>
      {options.map((opt, i) => {
        const isSelected = opt === selected;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              s.unitChip,
              { borderColor: border, backgroundColor: isSelected ? colors_[i] : inputBg },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(opt);
            }}
            activeOpacity={0.75}
          >
            <Text style={[s.unitChipText, { color: isSelected ? '#fff' : muted }]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderContextChips = (
    options: readonly string[],
    selected: string,
    onSelect: (v: string) => void,
    accentColor: string,
  ) => (
    <View style={s.contextRow}>
      {options.map(opt => {
        const isSelected = opt === selected;
        const label = opt.charAt(0).toUpperCase() + opt.slice(1).replace('-', '-');
        return (
          <TouchableOpacity
            key={opt}
            style={[
              s.contextChip,
              { borderColor: isSelected ? accentColor : border,
                backgroundColor: isSelected ? accentColor : inputBg },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(opt);
            }}
            activeOpacity={0.75}
          >
            <Text style={[s.contextChipText, { color: isSelected ? '#fff' : muted }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[s.header, { borderBottomColor: border, paddingTop: insets.top + 12 }]}>
          <View style={s.handle} />
          <View style={s.headerRow}>
            <Text style={[s.title, { color: fg }]}>Log all vitals</Text>
            <TouchableOpacity onPress={onClose} style={s.skipBtn} activeOpacity={0.7}>
              <Text style={[s.skipText, { color: muted }]}>Toggle sections to skip</Text>
            </TouchableOpacity>
          </View>

          {/* Section chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chipsContent}>
            {SECTIONS.map(sec => {
              const isActive = active.has(sec.key);
              return (
                <TouchableOpacity
                  key={sec.key}
                  style={[
                    s.sectionChip,
                    {
                      backgroundColor: isActive ? sec.color + '22' : inputBg,
                      borderColor: isActive ? sec.color : border,
                    },
                  ]}
                  onPress={() => toggleSection(sec.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.sectionChipEmoji}>{sec.emoji}</Text>
                  <Text style={[s.sectionChipLabel, { color: isActive ? sec.color : muted }]}>{sec.label}</Text>
                  {isActive && <Text style={[s.sectionChipCheck, { color: sec.color }]}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Log from Apple Health ── */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[
                s.appleHealthBtn,
                { backgroundColor: surface, borderColor: border },
                prefilling && { opacity: 0.6 },
              ]}
              onPress={handlePrefillFromHealthKit}
              disabled={prefilling}
              activeOpacity={0.75}
            >
              <Text style={s.appleHealthIcon}>{prefilling ? '⏳' : '♥️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.appleHealthTitle, { color: fg }]}>
                  {prefilling ? 'Reading Apple Health…' : 'Log from Apple Health'}
                </Text>
                <Text style={[s.appleHealthHint, { color: muted }]}>
                  Pre-fill today’s BP, weight, glucose, sleep & HRV
                </Text>
              </View>
              {!prefilling && <Text style={[s.appleHealthArrow, { color: muted }]}>›</Text>}
            </TouchableOpacity>
          )}

          {/* ── Keyboard Dictation Banner ── */}
          <KeyboardDictationBanner ref={bannerRef} />
          {/* ── Voice to Form ── */}
          {active.has('voice') && <View style={[s.scribeBox, { backgroundColor: surface, borderColor: border }]}>
            <View style={s.scribeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.scribeTitle, { color: fg }]}>
                  {scribeStatus === 'listening' ? lv.listening :
                   scribeStatus === 'parsing'   ? `⏳ ${db.parsing}` :
                   scribeStatus === 'done'       ? lv.autofilled :
                   scribeStatus === 'error'      ? lv.tryAgain :
                   lv.voiceToForm}
                </Text>
                <Text style={[s.scribeHint, { color: muted }]}>
                  {scribeStatus === 'idle'
                    ? lv.tapMicHint
                    : scribeStatus === 'listening'
                    ? (dictationText || lv.tapDictateHint)
                    : scribeStatus === 'parsing'
                    ? lv.fillingHint
                    : finalText || ''}
                </Text>
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                {/* One-time tooltip callout bubble */}
                {showMicTooltip && (
                  <ReAnimated.View
                    entering={FadeInAnim.duration(250)}
                    exiting={FadeOutAnim.duration(200)}
                    style={[s.tooltipBubble, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#93C5FD' }]}
                  >
                    <Text style={[s.tooltipText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                      {lv.tooltipHint}
                    </Text>
                    {/* Downward caret pointing at mic button */}
                    <View style={[s.tooltipCaret, { borderTopColor: isDark ? '#1E3A5F' : '#EFF6FF' }]} />
                  </ReAnimated.View>
                )}
                {/* Waveform bars */}
                {listening && (
                  <WaveformBars
                    isActive={listening}
                    volume={volumeLevel}
                    color="#EF4444"
                    height={24}
                  />
                )}
                <TouchableOpacity
                  style={[
                    s.micBtn,
                    { backgroundColor: 'transparent' },
                  ]}
                  onPress={listening ? stopListening : startListening}
                  activeOpacity={0.8}
                  disabled={scribeStatus === 'parsing'}
                >
                  <MicrophoneIcon size={44} isActive={listening} />
                </TouchableOpacity>
                {/* Fade-in partial transcript */}
                {listening && partialText.length > 0 && (
                  <ReAnimated.Text
                    entering={FadeInAnim.duration(200)}
                    exiting={FadeOutAnim.duration(150)}
                    style={[s.partialPreview, { color: muted }]}
                    numberOfLines={2}
                  >
                    {partialText}
                  </ReAnimated.Text>
                )}
                {/* Tap to cancel hint */}
                {listening && (
                  <ReAnimated.Text
                    entering={FadeInAnim.duration(300).delay(400)}
                    exiting={FadeOutAnim.duration(150)}
                    style={[s.cancelHint, { color: muted }]}
                  >
                    Tap mic to cancel
                  </ReAnimated.Text>
                )}
                {/* Duration timer */}
                {listening && (
                  <ReAnimated.Text
                    entering={FadeInAnim.duration(300).delay(600)}
                    exiting={FadeOutAnim.duration(150)}
                    style={[s.durationTimer, { color: recSecs >= 30 ? '#F59E0B' : '#EF4444' }]}
                  >
                    {`${String(Math.floor(recSecs / 60)).padStart(2, '0')}:${String(recSecs % 60).padStart(2, '0')}`}
                  </ReAnimated.Text>
                )}
              </View>
            </View>
            {scribeStatus === 'done' && scribeReasoning ? (
              <Text style={[s.scribeReasoning, { color: muted }]} numberOfLines={2}>
                {scribeReasoning}
              </Text>
            ) : null}
            {/* Hidden TextInput — focused by startListening() to trigger iOS keyboard
                with its built-in dictation mic key. Completely avoids the
                @react-native-voice TurboModule bridge that caused Signal 11 crashes. */}
            <TextInput
              ref={dictationInputRef}
              value={dictationText}
              onChangeText={(t) => {
            if (t.length > 0) bannerRef.current?.dismiss();
                setDictationText(t);
                setPartialText(t); // mirror to live preview
              }}
              onSubmitEditing={(e) => submitDictation(e.nativeEvent.text)}
              onBlur={() => {
                // User dismissed keyboard without tapping Done — submit whatever was typed
                if (listening && dictationText.trim()) {
                  submitDictation(dictationText);
                } else if (listening) {
                  stopListening();
                  setScribeStatus('idle');
                }
              }}
              returnKeyType="done"
              multiline={false}
              blurOnSubmit
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>}

          {/* ── Entry Date ── */}
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: muted }]}>Entry date</Text>
            <TouchableOpacity
              style={[s.dateBtn, { backgroundColor: inputBg, borderColor: border }]}
              onPress={() => setShowDatePicker(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 15, marginRight: 6 }}>📅</Text>
              <Text style={[s.dateText, { color: fg }]}>{fmtDate(entryDate)}</Text>
              <Text style={[s.dateCaret, { color: muted }]}>⌄</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <View style={[s.datePickerRow, { borderColor: border }]}>
                {[-3, -2, -1, 0].map(offset => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset);
                  const isSelected = d.toDateString() === entryDate.toDateString();
                  const label = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : fmtDate(d);
                  return (
                    <TouchableOpacity
                      key={offset}
                      style={[s.dateOption, { backgroundColor: isSelected ? '#22C55E' : inputBg, borderColor: border }]}
                      onPress={() => { setEntryDate(d); setShowDatePicker(false); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.dateOptionText, { color: isSelected ? '#fff' : fg }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Blood Pressure ── */}
          {active.has('bp') && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: '#EF4444' }]}>❤️  Blood Pressure</Text>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  {renderLabel('SYSTOLIC')}
                  {renderInput(systolic, setSystolic, '120', 'mmHg')}
                </View>
                <View style={s.rowGap} />
                <View style={{ flex: 1 }}>
                  {renderLabel('DIASTOLIC')}
                  {renderInput(diastolic, setDiastolic, '80', 'mmHg')}
                </View>
              </View>
            </View>
          )}

          {/* ── Weight ── */}
          {active.has('weight') && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: '#8B5CF6' }]}>⚖️  Weight</Text>
              {renderUnitToggle(['lbs', 'kg'], weightUnit, v => setWeightUnit(v as 'lbs' | 'kg'), ['#8B5CF6', '#8B5CF6'])}
              {renderLabel('BODY WEIGHT')}
              {renderInput(weightVal, setWeightVal, weightUnit === 'lbs' ? '150' : '68', weightUnit, 'decimal-pad')}
            </View>
          )}

          {/* ── Blood Sugar ── */}
          {active.has('sugar') && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: '#F59E0B' }]}>🩸  Blood Sugar</Text>
              {renderUnitToggle(['mg/dL', 'mmol/L'], sugarUnit, v => setSugarUnit(v as 'mg/dL' | 'mmol/L'), ['#F59E0B', '#F59E0B'])}
              {renderLabel('BLOOD GLUCOSE')}
              {renderInput(sugarVal, setSugarVal, sugarUnit === 'mg/dL' ? '100' : '5.6', sugarUnit, 'decimal-pad')}
              {renderLabel('CONTEXT')}
              {renderContextChips(SUGAR_CONTEXTS, sugarContext, v => setSugarContext(v as typeof SUGAR_CONTEXTS[number]), '#F59E0B')}
            </View>
          )}

          {/* ── Sleep ── */}
          {active.has('sleep') && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: '#3B82F6' }]}>🌙  Sleep</Text>
              {renderLabel('TOTAL SLEEP (minutes)')}
              {renderInput(sleepTotal, setSleepTotal, '420', sleepTotal ? minutesToHM(parseInt(sleepTotal, 10) || 0) : 'min')}
              <Text style={[s.sleepSubtitle, { color: muted }]}>Sleep stages (minutes — leave blank to auto-estimate)</Text>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  {renderLabel('REM')}
                  {renderInput(sleepRem, setSleepRem, 'min')}
                </View>
                <View style={s.rowGap} />
                <View style={{ flex: 1 }}>
                  {renderLabel('CORE')}
                  {renderInput(sleepCore, setSleepCore, 'min')}
                </View>
              </View>
              <View style={[s.row, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  {renderLabel('DEEP')}
                  {renderInput(sleepDeep, setSleepDeep, 'min')}
                </View>
                <View style={s.rowGap} />
                <View style={{ flex: 1 }}>
                  {renderLabel('AWAKE')}
                  {renderInput(sleepAwake, setSleepAwake, 'min')}
                </View>
              </View>
              {sleepTotal && !isNaN(parseInt(sleepTotal, 10)) && (
                <View style={[s.sleepSummary, { backgroundColor: '#3B82F6' + '18', borderColor: '#3B82F6' + '44' }]}>
                  <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600' }}>
                    {minutesToHM(parseInt(sleepTotal, 10))} total
                    {sleepRem ? `  ·  REM ${minutesToHM(parseInt(sleepRem, 10))}` : ''}
                    {sleepDeep ? `  ·  Deep ${minutesToHM(parseInt(sleepDeep, 10))}` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── HRV ── */}
          {active.has('hrv') && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: '#10B981' }]}>💚  HRV</Text>
              {renderLabel('SDNN (ms)')}
              {renderInput(hrvVal, setHrvVal, '52', 'ms')}
              {renderLabel('CONTEXT')}
              {renderContextChips(HRV_CONTEXTS, hrvContext, v => setHrvContext(v as typeof HRV_CONTEXTS[number]), '#10B981')}
            </View>
          )}
        </ScrollView>

        {/* ── Save Entry button ── */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 12, borderTopColor: border, backgroundColor: bg }]}>
          <TouchableOpacity
            style={[
              s.saveBtn,
              { opacity: (!hasAnyData || saving) ? 0.5 : 1 },
            ]}
            onPress={handleSave}
            disabled={!hasAnyData || saving}
            activeOpacity={0.85}
          >
            <Text style={s.saveBtnText}>
              {saving ? 'Saving…' : 'Save Entry'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Toast ── */}
        {saved && (
          <Animated.View
            style={[
              s.toast,
              { bottom: insets.bottom + 80, opacity: toastAnim,
                transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
            ]}
          >
            <Text style={s.toastText}>✅ All vitals saved</Text>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    borderBottomWidth: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#94A3B8',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  skipBtn: { padding: 4 },
  skipText: { fontSize: 12, fontWeight: '500' },
  chipsScroll: { marginHorizontal: -4 },
  chipsContent: { paddingHorizontal: 4, gap: 8, flexDirection: 'row' },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 4,
  },
  sectionChipEmoji: { fontSize: 13 },
  sectionChipLabel: { fontSize: 12, fontWeight: '600' },
  sectionChipCheck: { fontSize: 11, fontWeight: '700' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  appleHealthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  appleHealthIcon: { fontSize: 22 },
  appleHealthTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  appleHealthHint: { fontSize: 12, lineHeight: 17 },
  appleHealthArrow: { fontSize: 22, fontWeight: '300' },

  scribeBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  scribeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scribeTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  scribeHint: { fontSize: 12, lineHeight: 17 },
  scribeReasoning: { fontSize: 11, marginTop: 8, lineHeight: 16, fontStyle: 'italic' },
  micBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  micIcon: { fontSize: 20 },
  partialPreview: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 14,
    maxWidth: 90,
    marginTop: 4,
  },
  cancelHint: {
    fontSize: 9,
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 2,
  },
  durationTimer: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },

  fieldLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  input: { flex: 1, fontSize: 17, fontWeight: '500' },
  inputUnit: { fontSize: 13, fontWeight: '500', marginLeft: 6 },

  unitRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  unitChip: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  unitChipText: { fontSize: 13, fontWeight: '600' },

  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  contextChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  contextChipText: { fontSize: 13, fontWeight: '500' },

  row: { flexDirection: 'row', alignItems: 'flex-end' },
  rowGap: { width: 12 },

  sleepSubtitle: { fontSize: 11, marginBottom: 8, marginTop: 4 },
  sleepSummary: {
    marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1,
  },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dateText: { flex: 1, fontSize: 16, fontWeight: '500' },
  dateCaret: { fontSize: 18 },
  datePickerRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginTop: 8, paddingTop: 8, borderTopWidth: 0.5,
  },
  dateOption: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  dateOptionText: { fontSize: 13, fontWeight: '500' },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
  saveBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#22C55E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // One-time mic tooltip callout bubble
  tooltipBubble: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    maxWidth: 200,
    alignItems: 'center',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  tooltipText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
  // Downward-pointing caret triangle below the bubble
  tooltipCaret: {
    position: 'absolute',
    bottom: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // borderTopColor is set inline to match bubble background
  },
});
