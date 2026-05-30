/**
 * NeoVitalVitalsCard
 *
 * A dark-glass vitals overview card styled after the NeoVital reference image:
 *  - 3D glass morphism outer shell (matches GlassCard DNA)
 *  - Deep navy (#050F19) canvas with dashed grid
 *  - Collapsible: tap header to expand/collapse; state persisted to AsyncStorage
 *  - "NeoVital" label + pulsing "All Vitals Normal" status badge
 *  - 24h / 7d / 30d pill chip toggle — filters the wave chart to the chosen range
 *  - Animated multi-line wave chart (HR / BP / SpO2) that pulses continuously
 *  - Touch-to-inspect: tap any point on the chart to see the value callout
 *  - Visible graph edges (axes + tick marks)
 *  - 2×2 metric card grid: Heart Rate, Blood Pressure, SpO2, HRV
 *    Each card is tappable → fires onMetricPress(key) for deep-link navigation
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, PanResponder, Animated, Easing as RNEasing, Pressable, useColorScheme, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Line,
  Circle,
  Text as SvgText,
  Rect,
  ClipPath,
  G,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useHealth } from '@/lib/health/health-context';
import { buildSparklineData } from '@/lib/health/readiness-score';
import { smoothSparkline } from '@/lib/health/smooth-vitals';
import { useSmoothingStrength } from '@/lib/health/smoothing-strength-context';
import { useDashboardStrings } from '@/hooks/use-dashboard-strings';

// ─── Colour palette — mirrors neon-vitals.tsx exactly ──────────────────────────
const CANVAS_BG   = '#050F19';
const GRID_COLOR  = '#1E3A4A';
const HR_COLOR    = '#FF2D78';   // neon pink  (matches NeoVital tab)
const BP_COLOR    = '#00F5FF';   // neon cyan  (matches NeoVital tab SYS)
const SPO2_COLOR  = '#00FF9D';   // neon green (matches NeoVital tab)
const HRV_COLOR   = '#7B61FF';   // neon violet (matches NeoVital tab DIA)

// ─── Time range options ────────────────────────────────────────────────────────
type TimeRange = '24h' | '7d' | '30d';
const TIME_RANGES: { key: TimeRange; label: string; days: number }[] = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d',  label: '7d',  days: 7 },
  { key: '30d', label: '30d', days: 30 },
];

// ─── Metric keys ──────────────────────────────────────────────────────────────
export type NeoVitalMetricKey = 'hr' | 'bp' | 'spo2' | 'hrv';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface NeoVitalVitalsCardProps {
  /** Optional deep-link handler for metric card taps */
  onMetricPress?: (key: NeoVitalMetricKey) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const CHART_H  = 130;
const SCREEN_W = Dimensions.get('window').width;
const CHART_W_FALLBACK = SCREEN_W - 32 - 28;
// CHART_W is now measured at runtime via onLayout — see chartWidth state below.
// This fallback is used only before the first layout event fires.

function normalise(arr: number[]): number[] {
  if (!arr.length) return [];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return arr.map(() => 0.5);
  return arr.map(v => (v - min) / (max - min));
}

function buildPath(points: number[], w: number, h: number, padX = 8, padY = 10): string {
  if (points.length < 2) return '';
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const xs = points.map((_, i) => padX + (i / (points.length - 1)) * usableW);
  const ys = points.map(v => padY + (1 - v) * usableH);
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cpx} ${ys[i - 1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  return d;
}

function buildAreaPath(points: number[], w: number, h: number, padX = 8, padY = 10): string {
  if (points.length < 2) return '';
  const line = buildPath(points, w, h, padX, padY);
  const usableW = w - padX * 2;
  const lastX = padX + usableW;
  return `${line} L ${lastX} ${h} L ${padX} ${h} Z`;
}

function touchToIndex(touchX: number, count: number, w: number, padX = 8): number {
  const usableW = w - padX * 2;
  const idx = Math.round(((touchX - padX) / usableW) * (count - 1));
  return Math.max(0, Math.min(count - 1, idx));
}

function idxToX(idx: number, count: number, w: number, padX = 8): number {
  return padX + (idx / (count - 1)) * (w - padX * 2);
}

function normToY(norm: number, h: number, padY = 10): number {
  return padY + (1 - norm) * (h - padY * 2);
}

function sliceSpark(arr: number[], days: number): number[] {
  if (!arr.length) return arr;
  const n = Math.max(2, Math.min(arr.length, days));
  return arr.slice(-n);
}

// ─── Mini sparkline ────────────────────────────────────────────────────────────
function MiniSparkline({ data, color, w = 60, h = 24 }: { data: number[]; color: string; w?: number; h?: number }) {
  const norm = normalise(data);
  if (norm.length < 2) return <View style={{ width: w, height: h }} />;
  const path = buildPath(norm, w, h, 4, 4);
  return (
    <Svg width={w} height={h}>
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Pulsing badge ─────────────────────────────────────────────────────────────
function PulsingBadge({ ok, label }: { ok: boolean; label: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0,  { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const dotColor  = ok ? '#34D399' : '#F87171';
  const bgColor   = ok ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)';
  const borderCol = ok ? 'rgba(52,211,153,0.45)' : 'rgba(248,113,113,0.45)';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: borderCol, gap: 5 }}>
      <Reanimated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: dotColor }, animStyle]} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: ok ? '#34D399' : '#F87171', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

// ─── Time range pill chip ──────────────────────────────────────────────────────
function RangePill({ label, active, onPress, isDark }: { label: string; active: boolean; onPress: () => void; isDark: boolean }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, { damping: 12, stiffness: 220 }),
    );
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Reanimated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.rangePill,
          active
            ? { backgroundColor: HR_COLOR, borderColor: HR_COLOR }
            : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderColor: isDark ? 'rgba(0,229,255,0.18)' : 'rgba(0,0,0,0.12)' },
        ]}
      >
        <Text style={[
          styles.rangePillText,
          { color: active ? '#050F19' : (isDark ? 'rgba(148,163,184,0.8)' : 'rgba(100,116,139,0.8)') },
        ]}>
          {label}
        </Text>
      </Pressable>
    </Reanimated.View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function NeoVitalVitalsCard({
  onMetricPress,
}: NeoVitalVitalsCardProps) {
  const scheme = useColorScheme() ?? 'dark';
  const isDark = scheme === 'dark';
  const [chartWidth, setChartWidth] = useState(CHART_W_FALLBACK);

  // ── Self-fetch: same pattern as neon-vitals.tsx ───────────────────────────
  const { state } = useHealth();
  const healthData = state.data;
  const { strength } = useSmoothingStrength();

  // Sparklines — recompute whenever state.data changes (covers manual entries + HealthKit sync)
  const hrSparkline     = useMemo(() => buildSparklineData(healthData ?? null, 'bpm',      7),  [healthData]);
  const bpSparkline     = useMemo(() => buildSparklineData(healthData ?? null, 'systolic', 7),  [healthData]);
  const spo2Sparkline   = useMemo(() => buildSparklineData(healthData ?? null, 'spo2',     7),  [healthData]);
  const hrvSparkline    = useMemo(() => buildSparklineData(healthData ?? null, 'hrv',      7),  [healthData]);
  const hrSparkline24h  = useMemo(() => buildSparklineData(healthData ?? null, 'bpm',      1),  [healthData]);
  const bpSparkline24h  = useMemo(() => buildSparklineData(healthData ?? null, 'systolic', 1),  [healthData]);
  const spo2Sparkline24h = useMemo(() => buildSparklineData(healthData ?? null, 'spo2',    1),  [healthData]);
  const hrSparkline30d   = useMemo(() => buildSparklineData(healthData ?? null, 'bpm',      30), [healthData]);
  const bpSparkline30d   = useMemo(() => buildSparklineData(healthData ?? null, 'systolic', 30), [healthData]);
  const spo2Sparkline30d = useMemo(() => buildSparklineData(healthData ?? null, 'spo2',     30), [healthData]);
  const hrvSparkline24h  = useMemo(() => buildSparklineData(healthData ?? null, 'hrv',       1), [healthData]);
  const hrvSparkline30d  = useMemo(() => buildSparklineData(healthData ?? null, 'hrv',      30), [healthData]);

  // Latest values — merge HealthKit + manual vitalSigns (mirrors neon-vitals.tsx pattern)
  const latestBP = useMemo(() => {
    const hkBP = healthData?.bloodPressure ?? [];
    const manualBP = (healthData?.vitalSigns ?? [])
      .filter(r => r.systolic !== undefined && r.diastolic !== undefined)
      .map(r => ({ id: r.id, timestamp: r.timestamp, systolic: r.systolic!, diastolic: r.diastolic! }));
    const all = [...hkBP, ...manualBP].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return all.length ? all[all.length - 1] : null;
  }, [healthData]);

  const latestPulse = useMemo(() => {
    const hkPulse = healthData?.pulse ?? [];
    const manualPulse = (healthData?.vitalSigns ?? [])
      .filter(r => r.heartRate !== undefined)
      .map(r => ({ id: r.id, timestamp: r.timestamp, bpm: r.heartRate!, hrv: undefined as number | undefined }));
    const all = [...hkPulse, ...manualPulse].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return all.length ? all[all.length - 1] : null;
  }, [healthData]);

  const latestSpO2 = useMemo(() => {
    const records = (healthData?.vitalSigns ?? [])
      .filter(r => (r.spo2 !== undefined && r.spo2 > 0) || (r.oxygenSaturation !== undefined && r.oxygenSaturation > 0))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (!records.length) return null;
    return records[0].spo2 ?? records[0].oxygenSaturation ?? null;
  }, [healthData]);

  const latestHRV = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pulseRecs = healthData?.pulse ?? [];
    const vitalRecs = (healthData?.vitalSigns ?? []).map(r => ({ hrv: r.hrv ?? null, timestamp: r.timestamp }));
    const allHrv = [...pulseRecs, ...vitalRecs]
      .filter(r => (r.hrv ?? 0) > 0 && new Date(r.timestamp).getTime() >= cutoff)
      .map(r => r.hrv as number);
    if (!allHrv.length) return null;
    return Math.round(allHrv.reduce((s, v) => s + v, 0) / allHrv.length);
  }, [healthData]);

  const latestHR    = latestPulse?.bpm ?? null;
  const latestBPSys = latestBP?.systolic ?? null;
  const latestBPDia = latestBP?.diastolic ?? null;

  const statusOk = (
    (latestBP == null || ((latestBP.systolic ?? 0) < 130 && (latestBP.diastolic ?? 0) < 85)) &&
    (latestPulse == null || (latestPulse.bpm >= 50 && latestPulse.bpm <= 100)) &&
    (latestSpO2 == null || latestSpO2 >= 95)
  );
  const ds = useDashboardStrings();
  const statusLabel = (
    (latestBP != null && ((latestBP.systolic ?? 0) >= 130 || (latestBP.diastolic ?? 0) >= 85))
      ? ((ds as any).statusBpElevated ?? 'BP Elevated')
      : (latestPulse != null && (latestPulse.bpm < 50 || latestPulse.bpm > 100))
      ? ((ds as any).statusHrOutOfRange ?? 'HR Out of Range')
      : (latestSpO2 != null && latestSpO2 < 95)
      ? ((ds as any).statusSpo2Low ?? 'SpO2 Low')
      : ((ds as any).statusAllVitalsNormal ?? 'All Vitals Normal')
  );

  // ── Collapsible state + AsyncStorage persistence ──────────────────────────
  const STORAGE_KEY = '@vsht:card_collapsed/neovital-vitals';
  const [collapsed, setCollapsed] = useState(true); // default collapsed to reduce initial scroll depth
  const [hydrated, setHydrated]   = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw !== null) setCollapsed(raw === 'true'); })
      .catch(() => {})
      .finally(() => setHydrated(true));
   
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    safeSetItem(STORAGE_KEY, String(collapsed)).catch(() => {});
  }, [collapsed, hydrated]);

  // Reanimated accordion
  const naturalHeight = useSharedValue(0);
  const isCollapsedSV = useSharedValue(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { isCollapsedSV.value = collapsed ? 1 : 0; }, [collapsed]);
  const derivedAccordion = useDerivedValue(() =>
    withTiming(naturalHeight.value * (1 - isCollapsedSV.value), {
      duration: 260,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    })
  );
  const accordionStyle = useAnimatedStyle(() => ({
    height: derivedAccordion.value,
    overflow: 'hidden' as const,
  }));

  // Chevron rotation (RN Animated for native driver)
  const chevronAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: collapsed ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);
  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-90deg'],
  });

  function handleCollapseToggle() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollapsed(prev => !prev);
  }

  // ── Time range state — persisted to AsyncStorage ──────────────────────────────
  const RANGE_STORAGE_KEY = '@vsht:neovital_time_range';
  const [range, setRange] = useState<TimeRange>('7d');
  // Load persisted range on mount
  useEffect(() => {
    AsyncStorage.getItem(RANGE_STORAGE_KEY)
      .then(raw => { if (raw === '24h' || raw === '7d' || raw === '30d') setRange(raw as TimeRange); })
      .catch(() => {});
   
  }, []);
  // Persist range whenever it changes
  const handleRangeChange = useCallback((newRange: TimeRange) => {
    setRange(newRange);
    safeSetItem(RANGE_STORAGE_KEY, newRange).catch(() => {});
  }, []);

  // ── Resolve sparkline arrays for the selected range ───────────────────────
  const resolvedHR = useMemo(() => {
    if (range === '24h') return hrSparkline24h && hrSparkline24h.length >= 2 ? hrSparkline24h : sliceSpark(hrSparkline, 1);
    if (range === '30d') return hrSparkline30d && hrSparkline30d.length >= 2 ? hrSparkline30d : hrSparkline;
    return hrSparkline;
  }, [range, hrSparkline, hrSparkline24h, hrSparkline30d]);

  const resolvedBP = useMemo(() => {
    if (range === '24h') return bpSparkline24h && bpSparkline24h.length >= 2 ? bpSparkline24h : sliceSpark(bpSparkline, 1);
    if (range === '30d') return bpSparkline30d && bpSparkline30d.length >= 2 ? bpSparkline30d : bpSparkline;
    return bpSparkline;
  }, [range, bpSparkline, bpSparkline24h, bpSparkline30d]);

  const resolvedSpO2 = useMemo(() => {
    if (range === '24h') return spo2Sparkline24h && spo2Sparkline24h.length >= 2 ? spo2Sparkline24h : sliceSpark(spo2Sparkline, 1);
    if (range === '30d') return spo2Sparkline30d && spo2Sparkline30d.length >= 2 ? spo2Sparkline30d : spo2Sparkline;
    return spo2Sparkline;
  }, [range, spo2Sparkline, spo2Sparkline24h, spo2Sparkline30d]);
  // ── HRV sparkline — wired for all three ranges ────────────────────────────────
  const resolvedHRV = useMemo(() => {
    if (range === '24h') return hrvSparkline24h && hrvSparkline24h.length >= 2 ? hrvSparkline24h : sliceSpark(hrvSparkline, 1);
    if (range === '30d') return hrvSparkline30d && hrvSparkline30d.length >= 2 ? hrvSparkline30d : hrvSparkline;
    return hrvSparkline;
  }, [range, hrvSparkline, hrvSparkline24h, hrvSparkline30d]);

  // ── Normalise sparklines (with moving-average smoothing applied first) ──────
  const hrNorm   = useMemo(() => normalise(smoothSparkline(resolvedHR.length   >= 2 ? resolvedHR   : [60, 65, 70, 68, 72, 70, 72], range, strength)), [resolvedHR, range, strength]);
  const bpNorm   = useMemo(() => normalise(smoothSparkline(resolvedBP.length   >= 2 ? resolvedBP   : [115, 118, 120, 116, 118, 119, 118], range, strength)), [resolvedBP, range, strength]);
  const spo2Norm = useMemo(() => normalise(smoothSparkline(resolvedSpO2.length >= 2 ? resolvedSpO2 : [97, 98, 97, 98, 99, 98, 98], range, strength)), [resolvedSpO2, range, strength]);

  // ── Pulsating wave animation ──────────────────────────────────────────────
  const wavePhase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(wavePhase, { toValue: 1, duration: 2200, easing: RNEasing.inOut(RNEasing.sin), useNativeDriver: false }),
        Animated.timing(wavePhase, { toValue: 0, duration: 2200, easing: RNEasing.inOut(RNEasing.sin), useNativeDriver: false }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  const phaseRef = useRef(0);
  useEffect(() => {
    const listener = wavePhase.addListener(({ value }) => { phaseRef.current = value; });
    return () => wavePhase.removeListener(listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedPaths = useMemo(() => {
    const ph = phaseRef.current;
    const cw = chartWidth;
    const shift = (series: number[], amplitude: number, freq: number) =>
      series.map((v, i) => Math.max(0, Math.min(1, v + amplitude * Math.sin(2 * Math.PI * (i / series.length + ph * freq)))));
    return {
      hr:       buildPath(shift(hrNorm,   0.06, 1.0), cw, CHART_H),
      bp:       buildPath(shift(bpNorm,   0.05, 0.8), cw, CHART_H),
      spo2:     buildPath(shift(spo2Norm, 0.04, 1.2), cw, CHART_H),
      hrArea:   buildAreaPath(shift(hrNorm,   0.06, 1.0), cw, CHART_H),
      bpArea:   buildAreaPath(shift(bpNorm,   0.05, 0.8), cw, CHART_H),
      spo2Area: buildAreaPath(shift(spo2Norm, 0.04, 1.2), cw, CHART_H),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, hrNorm, bpNorm, spo2Norm, chartWidth]);

  // ── Touch callout ─────────────────────────────────────────────────────────
  const [callout, setCallout] = useState<{ x: number; idx: number } | null>(null);
  const calloutOpacity = useSharedValue(0);
  const calloutScale   = useSharedValue(0.8);

  const showCallout = useCallback((touchX: number) => {
    const count = Math.max(hrNorm.length, bpNorm.length, spo2Norm.length);
    if (count < 2) return;
    const idx = touchToIndex(touchX, count, chartWidth);
    const x   = idxToX(idx, count, chartWidth);
    setCallout({ x, idx });
    calloutOpacity.value = withTiming(1, { duration: 150 });
    calloutScale.value   = withSpring(1, { damping: 12, stiffness: 220 });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrNorm, bpNorm, spo2Norm, chartWidth]);

  const hideCallout = useCallback(() => {
    calloutOpacity.value = withTiming(0, { duration: 200 });
    calloutScale.value   = withTiming(0.8, { duration: 200 });
    setTimeout(() => setCallout(null), 220);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant:    (e) => showCallout(e.nativeEvent.locationX),
    onPanResponderMove:     (e) => showCallout(e.nativeEvent.locationX),
    onPanResponderRelease:  () => hideCallout(),
    onPanResponderTerminate: () => hideCallout(),
  }), [showCallout, hideCallout]);

  const calloutAnimStyle = useAnimatedStyle(() => ({
    opacity: calloutOpacity.value,
    transform: [{ scale: calloutScale.value }],
  }));

  const calloutValues = useMemo(() => {
    if (!callout) return null;
    const { idx } = callout;
    return {
      hr:   resolvedHR[idx]   ?? null,
      bp:   resolvedBP[idx]   ?? null,
      spo2: resolvedSpO2[idx] ?? null,
    };
  }, [callout, resolvedHR, resolvedBP, resolvedSpO2]);

  // ── Card mount animation ──────────────────────────────────────────────────
  const mountScale   = useSharedValue(0.96);
  const mountOpacity = useSharedValue(0);
  useEffect(() => {
    mountScale.value   = withDelay(100, withSpring(1, { damping: 14, stiffness: 160 }));
    mountOpacity.value = withDelay(100, withTiming(1, { duration: 350 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mountOpacity.value,
    transform: [{ scale: mountScale.value }],
  }));

  // ── Chart width — measured via onLayout so it works at any nesting depth ──
  const handleChartLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) setChartWidth(w);
  }, []);

  // ── Glass shell colours — light when collapsed in light mode, dark when expanded ──
  // When collapsed in light mode: use clean white card; when expanded (or dark mode): use NeoVital dark
  const isLightCollapsed = collapsed && !isDark;
  const outerBorder = isLightCollapsed ? '#E2E8F0' : '#1E3A4A';
  const shadowColor  = isLightCollapsed ? '#94A3B8' : '#00F5FF';
  const shellBg      = isLightCollapsed ? '#FFFFFF' : CANVAS_BG;

  // Re-measure on orientation change
  const { width: screenWidth } = useWindowDimensions();

  // ── Grid lines — 5 rows matching NeoVital tab ───────────────────────────
  const gridLines = [0.2, 0.4, 0.6, 0.8].map(frac => ({ y: 10 + frac * (CHART_H - 20) }));

  // ── Tick labels ───────────────────────────────────────────────────────────
  const tickLabels = useMemo(() => {
    if (range === '24h') return ['Now'];
    if (range === '30d') return ['-30d', '-25d', '-20d', '-15d', '-10d', '-5d', 'Now'];
    return ['-6d', '-5d', '-4d', '-3d', '-2d', '-1d', 'Now'];
  }, [range]);

  // ── Metric cards data ─────────────────────────────────────────────────────
  const metricCards: { label: string; value: string; unit: string; trend: string; color: string; spark: number[]; icon: string; metricKey: NeoVitalMetricKey }[] = [
    {
      label: 'Heart Rate',
      value: latestHR !== null ? `${latestHR}` : '—',
      unit:  'bpm',
      trend: latestHR !== null ? (latestHR <= 100 && latestHR >= 60 ? '↑ Optimal' : latestHR > 100 ? '↑ High' : '↓ Low') : '',
      color: HR_COLOR,
      spark: hrSparkline,
      icon:  '♥',
      metricKey: 'hr',
    },
    {
      label: 'Blood Pressure',
      value: latestBPSys !== null && latestBPDia !== null ? `${latestBPSys}/${latestBPDia}` : '—',
      unit:  'mmHg',
      trend: latestBPSys !== null ? (latestBPSys < 120 ? '→ Normal' : latestBPSys < 130 ? '↑ Elevated' : '↑ High') : '',
      color: BP_COLOR,
      spark: bpSparkline,
      icon:  '⬆',
      metricKey: 'bp',
    },
    {
      label: 'SpO2',
      value: latestSpO2 !== null ? `${Math.round(latestSpO2)}` : '—',
      unit:  '%',
      trend: latestSpO2 !== null ? (latestSpO2 >= 95 ? '→ Stable' : '↓ Low') : '',
      color: SPO2_COLOR,
      spark: spo2Sparkline,
      icon:  '◎',
      metricKey: 'spo2',
    },
    {
      label: 'HRV',
      value: latestHRV !== null ? `${latestHRV}` : '—',
      unit:  'ms',
      trend: latestHRV !== null ? (latestHRV >= 50 ? '→ Variability' : latestHRV >= 30 ? '→ Fair' : '↓ Low') : '',
      color: HRV_COLOR,
      spark: resolvedHRV,
      icon:  '〜',
      metricKey: 'hrv',
    },
  ];

  if (!hydrated) return null;

  return (
    <Reanimated.View style={[mountStyle, { marginHorizontal: 16, marginTop: 14, marginBottom: 4 }]}>
      {/* ── Outer shell — flat dark canvas matching NeoVital tab ─────────────── */}
      <View style={[
        styles.glassShell,
        {
          borderColor: outerBorder,
          shadowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 4,
        },
      ]}>
        <View style={[styles.glassBody, { backgroundColor: shellBg }]}>

          {/* ── Card content ──────────────────────────────────────────────── */}
          <View style={styles.content}>
            {/* Particle background — hidden in light-collapsed mode */}
            {!isLightCollapsed && (
            <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: RADIUS - 1.5 }]} pointerEvents="none">
              {NEOVITAL_PARTICLES.map((p) => (
                <View
                  key={p.id}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: p.x,
                    top: p.y,
                    width: p.r * 2,
                    height: p.r * 2,
                    borderRadius: p.r,
                    backgroundColor: p.color,
                    opacity: p.opacity,
                  }}
                />
              ))}
            </View>
            )}

            {/* ── Collapsible header row ─────────────────────────────────── */}
            <Pressable
              onPress={handleCollapseToggle}
              onLongPress={handleCollapseToggle}
              delayLongPress={350}
              style={({ pressed }) => [
                styles.headerRow,
                collapsed && { marginBottom: 0 },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`NeoVital Vital Signs, ${collapsed ? 'collapsed' : 'expanded'}. Tap to ${collapsed ? 'expand' : 'collapse'}.`}
            >
              <View>
                <Text style={[styles.brandLabel, { color: isLightCollapsed ? 'rgba(100,116,139,0.65)' : isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)' }]}>NeoVital</Text>
                <Text style={[styles.sectionTitle, { color: isLightCollapsed ? '#0F172A' : isDark ? '#E2E8F0' : '#0F172A' }]}>Vital Signs</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!collapsed && <PulsingBadge ok={statusOk} label={statusLabel} />}
                <Animated.Text style={[styles.chevronText, { color: isLightCollapsed ? '#64748B' : HR_COLOR + 'CC', transform: [{ rotate: chevronRotate }] }]}>
                  ▾
                </Animated.Text>
              </View>
            </Pressable>

            {/* ── Accordion body ────────────────────────────────────────── */}
            {/* Ghost measurement view: fires onLayout even when accordion is height=0.
                Uses a fixed estimated height to avoid re-rendering the heavy SVG chart:
                  range pills row ~36px + chart ~130px + metric grid ~200px + padding ~14px = ~380px.
                key tied to screenWidth forces re-measure on orientation change. */}
            <View
              key={`neo-ghost-${screenWidth}`}
              pointerEvents="none"
              style={{ position: 'absolute', opacity: 0, left: 0, right: 0, top: 0 }}
              onLayout={e => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && naturalHeight.value !== h) naturalHeight.value = h;
              }}
            >
              <View style={{ height: 380 }} />
            </View>
            <Reanimated.View style={accordionStyle}>
              <View>

                {/* Time range pill chips */}
                <View style={styles.rangeRow}>
                  {TIME_RANGES.map(tr => (
                    <RangePill
                      key={tr.key}
                      label={tr.label}
                      active={range === tr.key}
                      onPress={() => handleRangeChange(tr.key)}
                      isDark={isDark}
                    />
                  ))}
                  <View style={{ flex: 1 }} />
                  {[
                    { label: 'HR', color: HR_COLOR },
                    { label: 'BP', color: BP_COLOR },
                    { label: 'SpO2', color: SPO2_COLOR },
                  ].map(l => (
                    <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 14, height: 2.5, borderRadius: 2, backgroundColor: l.color }} />
                      <Text style={{ fontSize: 8, color: l.color, fontWeight: '600' }}>{l.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Wave chart — or empty state when no data has been logged yet */}
                {(resolvedHR.length < 2 && resolvedBP.length < 2 && resolvedSpO2.length < 2) ? (
                  <View style={[styles.chartContainer, { backgroundColor: CANVAS_BG, alignItems: 'center', justifyContent: 'center', minHeight: CHART_H }]}>
                    <Text style={{ fontSize: 28, marginBottom: 8 }}>📊</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(148,163,184,0.85)', letterSpacing: 0.2 }}>No data yet</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>Log your first vital signs to see the chart</Text>
                  </View>
                ) : (
                <View
                  style={[styles.chartContainer, { backgroundColor: CANVAS_BG }]}
                  onLayout={handleChartLayout}
                  {...panResponder.panHandlers}
                >
                  <Svg width={chartWidth} height={CHART_H}>
                    <Defs>
                      <SvgLinearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={HR_COLOR}   stopOpacity="0.28" />
                        <Stop offset="1" stopColor={HR_COLOR}   stopOpacity="0.02" />
                      </SvgLinearGradient>
                      <SvgLinearGradient id="bpGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={BP_COLOR}   stopOpacity="0.22" />
                        <Stop offset="1" stopColor={BP_COLOR}   stopOpacity="0.02" />
                      </SvgLinearGradient>
                      <SvgLinearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={SPO2_COLOR} stopOpacity="0.20" />
                        <Stop offset="1" stopColor={SPO2_COLOR} stopOpacity="0.02" />
                      </SvgLinearGradient>
                      <ClipPath id="chartClip">
                        <Rect x="0" y="0" width={chartWidth} height={CHART_H} />
                      </ClipPath>
                    </Defs>

                    {/* Dashed grid lines — matches NeoVital tab */}
                    {gridLines.map((gl, i) => (
                      <Line
                        key={i}
                        x1={8} y1={gl.y} x2={chartWidth - 8} y2={gl.y}
                        stroke={GRID_COLOR}
                        strokeWidth={0.5}
                        strokeDasharray="3,4"
                      />
                    ))}

                    {/* Visible axes — matches NeoVital tab */}
                    <Line x1={8} y1={CHART_H - 10} x2={chartWidth - 8} y2={CHART_H - 10} stroke="rgba(148,163,184,0.18)" strokeWidth={0.8} />
                    <Line x1={8} y1={10} x2={8} y2={CHART_H - 10} stroke="rgba(148,163,184,0.18)" strokeWidth={0.8} />

                    {/* Tick marks on bottom axis */}
                    {tickLabels.map((label, i) => {
                      const x = 8 + (i / (tickLabels.length - 1)) * (chartWidth - 16);
                      return (
                        <G key={i}>
                          <Line x1={x} y1={CHART_H - 10} x2={x} y2={CHART_H - 6} stroke="rgba(148,163,184,0.3)" strokeWidth={0.8} />
                          <SvgText x={x} y={CHART_H - 1} fontSize={7} fill="rgba(148,163,184,0.45)" textAnchor="middle">
                            {label}
                          </SvgText>
                        </G>
                      );
                    })}

                    <G clipPath="url(#chartClip)">
                      {/* Area fills */}
                      {/* Area fills — 0.18→0 gradient matching NeoVital tab */}
                      <Path d={animatedPaths.spo2Area} fill="url(#spo2Grad)" />
                      <Path d={animatedPaths.bpArea}   fill="url(#bpGrad)" />
                      <Path d={animatedPaths.hrArea}   fill="url(#hrGrad)" />

                      {/* Lines — strokeWidth 1.5 matching NeoVital tab */}
                      <Path d={animatedPaths.spo2} stroke={SPO2_COLOR} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      <Path d={animatedPaths.bp}   stroke={BP_COLOR}   strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      <Path d={animatedPaths.hr}   stroke={HR_COLOR}   strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

                      {/* Touch crosshair */}
                      {callout && (
                        <G>
                          <Line
                            x1={callout.x} y1={10}
                            x2={callout.x} y2={CHART_H - 10}
                            stroke="rgba(255,255,255,0.35)"
                            strokeWidth={1}
                            strokeDasharray="3,3"
                          />
                          {hrNorm.length > 0 && (
                            <Circle
                              cx={callout.x}
                              cy={normToY(hrNorm[Math.min(callout.idx, hrNorm.length - 1)], CHART_H)}
                              r={4} fill={HR_COLOR} stroke="#050F19" strokeWidth={1.5}
                            />
                          )}
                          {bpNorm.length > 0 && (
                            <Circle
                              cx={callout.x}
                              cy={normToY(bpNorm[Math.min(callout.idx, bpNorm.length - 1)], CHART_H)}
                              r={4} fill={BP_COLOR} stroke="#050F19" strokeWidth={1.5}
                            />
                          )}
                          {spo2Norm.length > 0 && (
                            <Circle
                              cx={callout.x}
                              cy={normToY(spo2Norm[Math.min(callout.idx, spo2Norm.length - 1)], CHART_H)}
                              r={4} fill={SPO2_COLOR} stroke="#050F19" strokeWidth={1.5}
                            />
                          )}
                        </G>
                      )}
                    </G>
                  </Svg>

                  {/* Touch callout bubble */}
                  {callout && calloutValues && (
                    <Reanimated.View
                      style={[
                        styles.calloutBubble,
                        calloutAnimStyle,
                        { left: Math.min(Math.max(callout.x - 44, 4), chartWidth - 96), top: 8 },
                      ]}
                      pointerEvents="none"
                    >
                      {calloutValues.hr   !== null && <Text style={[styles.calloutLine, { color: HR_COLOR }]}>HR {calloutValues.hr} bpm</Text>}
                      {calloutValues.bp   !== null && <Text style={[styles.calloutLine, { color: BP_COLOR }]}>SYS {calloutValues.bp} mmHg</Text>}
                      {calloutValues.spo2 !== null && <Text style={[styles.calloutLine, { color: SPO2_COLOR }]}>SpO₂ {calloutValues.spo2}%</Text>}
                    </Reanimated.View>
                  )}
                </View>
                )}

                {/* 2×2 Metric grid */}
                <View style={styles.metricGrid}>
                  {metricCards.map((card) => (
                    <Pressable
                      key={card.label}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onMetricPress?.(card.metricKey);
                      }}
                      style={({ pressed }) => [
                        styles.metricCard,
                        {
                          backgroundColor: '#0A1520',
                          borderColor: card.color + '33',
                          opacity: pressed ? 0.75 : 1,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(148,163,184,0.75)', letterSpacing: 0.3 }}>{card.label}</Text>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: card.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 9, color: card.color }}>{card.icon}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: card.color, lineHeight: 26, letterSpacing: -0.5 }}>{card.value}</Text>
                      <Text style={{ fontSize: 9, color: 'rgba(148,163,184,0.55)', marginBottom: 4 }}>{card.unit}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 8, color: card.color, fontWeight: '600', opacity: 0.85 }} numberOfLines={1}>{card.trend}</Text>
                        <MiniSparkline data={card.spark} color={card.color} w={52} h={20} />
                      </View>
                      {onMetricPress && (
                        <Text style={{ fontSize: 7, color: card.color, opacity: 0.45, textAlign: 'right', marginTop: 2 }}>{(ds as any).tapToView ?? 'tap to view ›'}</Text>
                      )}
                    </Pressable>
                  ))}
                </View>

              </View>
            </Reanimated.View>

          </View>
        </View>
      </View>
    </Reanimated.View>
  );
}

// ─── Particle layer — same positions/colors as NeoVital tab ─────────────────
const NV_PARTICLE_COUNT = 18;
const NV_SCREEN_W = Dimensions.get('window').width - 32;
const NEOVITAL_PARTICLES = Array.from({ length: NV_PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: (Math.sin(i * 137.5) * 0.5 + 0.5) * NV_SCREEN_W,
  y: (Math.cos(i * 97.3) * 0.5 + 0.5) * 300,
  r: 1 + (i % 3) * 0.8,
  opacity: 0.08 + (i % 5) * 0.04,
  color: ['#00F5FF', '#FF2D78', '#7B61FF', '#00FF9D', '#FFB800'][i % 5],
}));

// ─── Styles ────────────────────────────────────────────────────────────────────
const RADIUS = 20;
const styles = StyleSheet.create({
  glassShell: {
    borderRadius: RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  glassBody: {
    borderRadius: RADIUS - 1.5,
    overflow: 'hidden',
    backgroundColor: CANVAS_BG,
  },
  content: {
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 1,
    color: 'rgba(148,163,184,0.7)',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: '#E2E8F0',
  },
  chevronText: {
    fontSize: 16,
    flexShrink: 0,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  rangePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    backgroundColor: '#0A1520',
  },
  rangePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  chartContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    backgroundColor: CANVAS_BG,
    shadowColor: '#00F5FF',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  calloutBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(5,15,25,0.96)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#1E3A5A',
    gap: 1,
    minWidth: 88,
    shadowColor: '#00F5FF',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  calloutLine: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    backgroundColor: '#0A1520',
  },
});
