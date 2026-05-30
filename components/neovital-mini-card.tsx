/**
 * NeoVitalMiniCard
 *
 * Dashboard widget that is identical to the NeoVital tab screen, minus the
 * Vital Signs Monitor (LIVE/DEMO simulation panel, speed control, and landscape
 * side panel). It includes:
 *   - Collapsible card wrapper (persisted via AsyncStorage)
 *   - Range chips: 6h / 7d / 30d / 90d (persisted)
 *   - Vital toggle chips for all 6 vitals (persisted)
 *   - Latest value badge grid (6 badges with units)
 *   - Glucose zone legend (when BG is active)
 *   - Full neon SVG chart with data-point dots, gradient fills, glow pulses,
 *     weight goal line, SpO₂ alert diamonds, and tap tooltip
 *   - Export / Share Snapshot button
 *   - Empty state overlay
 */
import { safeFormatDate, safeFormatTime } from '@/lib/utils';
import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, TouchableWithoutFeedback, Platform } from 'react-native';
import Svg, {
  Path,
  Circle,
  Line as SvgLine,
  Rect,
  Defs,
  LinearGradient,
  Stop,
  G,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useRouter } from 'expo-router';
import { useHealth } from '@/lib/health/health-context';
import {
  smoothVitalSeries,
  type RangeKey as SmoothRangeKey,
} from '@/lib/health/smooth-vitals';
import { useSmoothingStrength } from '@/lib/health/smoothing-strength-context';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { WeightGoalEditorSheet } from '@/components/weight-goal-editor-sheet';
import { useDashboardStrings } from '@/hooks';
import * as Haptics from 'expo-haptics';
// ─── Chart constants (match neon-vitals.tsx) ──────────────────────────────────
const PAD_L = 44;
const _PAD_R = 52; // right padding for BG/Wgt Y-axis labels (extra 8px prevents clipping)
const PAD_T = 16;
const PAD_B = 28;
const CHART_H = 220;

// ─── Persistence keys ─────────────────────────────────────────────────────────
const RANGE_KEY     = '@neovital_mini_range_v3';
const COLLAPSED_KEY = '@neovital_mini_collapsed_v3';
const ACTIVE_KEY    = '@neovital_mini_active_v3';

// ─── Vital config (identical to neon-vitals.tsx VITALS) ──────────────────────
interface VitalConfig {
  key: 'hr' | 'bp_sys' | 'bp_dia' | 'spo2' | 'glucose' | 'weight';
  label: string;
  unit: string;
  color: string;
  yMin: number;
  yMax: number;
}
const VITALS: VitalConfig[] = [
  { key: 'hr',      label: 'HR',   unit: 'bpm',   color: '#FF2D78', yMin: 40,  yMax: 180 },
  { key: 'bp_sys',  label: 'SYS',  unit: 'mmHg',  color: '#00C2FF', yMin: 40,  yMax: 200 },
  { key: 'bp_dia',  label: 'DIA',  unit: 'mmHg',  color: '#A78BFA', yMin: 40,  yMax: 200 },
  { key: 'spo2',    label: 'SpO₂', unit: '%',     color: '#34D399', yMin: 85,  yMax: 100 },
  { key: 'glucose', label: 'BG',   unit: 'mg/dL', color: '#F97316', yMin: 60,  yMax: 300 },
  { key: 'weight',  label: 'Wgt',  unit: 'lbs',   color: '#FFD60A', yMin: 80,  yMax: 350 },
];

// ─── Series point type ────────────────────────────────────────────────────────
interface SeriesPoint {
  timestamp: string;
  hr?: number;
  bp_sys?: number;
  bp_dia?: number;
  spo2?: number;
  glucose?: number;
  weight?: number;
  spo2Alert?: boolean;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
interface TooltipData {
  x: number;
  y: number;
  timestamp: string;
  values: { vital: VitalConfig; value: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function toY(value: number, yMin: number, yMax: number, plotH: number): number {
  return PAD_T + plotH - ((clamp(value, yMin, yMax) - yMin) / (yMax - yMin)) * plotH;
}
function toX(index: number, total: number, plotW: number): number {
  if (total <= 1) return PAD_L + plotW / 2;
  return PAD_L + (index / (total - 1)) * plotW;
}
function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}
function formatTimestamp(ts: string): string {
  return safeFormatTime(ts, 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function formatDate(ts: string): string {
  return safeFormatDate(ts, 'en-US', { month: 'short', day: 'numeric' });
}

// ─── Particle background ──────────────────────────────────────────────────────
const PARTICLE_COUNT = 28;
const INIT_W = Dimensions.get('window').width - 32;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: (Math.sin(i * 137.5) * 0.5 + 0.5) * INIT_W,
  y: (Math.cos(i * 97.3) * 0.5 + 0.5) * CHART_H,
  r: 1 + (i % 3) * 0.8,
  opacity: 0.08 + (i % 5) * 0.04,
  color: ['#00C2FF', '#FF2D78', '#A78BFA', '#34D399', '#F97316'][i % 5],
}));
function ParticleLayer({ width }: { width: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={CHART_H}>
        {PARTICLES.map((p) => (
          <Circle key={p.id} cx={p.x} cy={p.y} r={p.r * 2} fill={p.color} opacity={p.opacity} />
        ))}
      </Svg>
    </View>
  );
}

// ─── Grid background ──────────────────────────────────────────────────────────
function GridBackground({ width, height, plotW }: { width: number; height: number; plotW: number }) {
  const cols = 8;
  const rows = 5;
  const lines: React.ReactNode[] = [];
  const plotH = height - PAD_T - PAD_B;
  for (let i = 0; i <= cols; i++) {
    const x = PAD_L + (i / cols) * plotW;
    lines.push(
      <SvgLine key={`v${i}`} x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH}
        stroke="#1E3A4A" strokeWidth={0.5} strokeDasharray="3,4" />
    );
  }
  for (let j = 0; j <= rows; j++) {
    const y = PAD_T + (j / rows) * plotH;
    lines.push(
      <SvgLine key={`h${j}`} x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y}
        stroke="#1E3A4A" strokeWidth={0.5} strokeDasharray="3,4" />
    );
  }
  return <>{lines}</>;
}

// ─── Glow pulse animation ─────────────────────────────────────────────────────
function GlowPulse({ color, cx, cy }: { color: string; cx: number; cy: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);
  useEffect(() => {
    scale.value = 1;
    opacity.value = 0.8;
    scale.value = withRepeat(
      withSequence(
        withTiming(2.2, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 900 }),
        withTiming(0.8, { duration: 100 }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }), [scale, opacity]);
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: cx - 6,
          top: cy - 6,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
        },
        animStyle,
      ]}
      pointerEvents="none"
    />
  );
}

// ─── Tooltip component ────────────────────────────────────────────────────────
function Tooltip({ data, screenW }: { data: TooltipData; screenW: number }) {
  const tipW = 160;
  const left = clamp(data.x - tipW / 2, 0, screenW - tipW - 16);
  return (
    <View style={[tipStyles.container, { left, top: data.y - 10 }]}>
      <Text style={tipStyles.time}>{formatTimestamp(data.timestamp)}</Text>
      <Text style={tipStyles.date}>{formatDate(data.timestamp)}</Text>
      {data.values.map((v) => (
        <View key={v.vital.key} style={tipStyles.row}>
          <View style={[tipStyles.dot, { backgroundColor: v.vital.color }]} />
          <Text style={[tipStyles.label, { color: v.vital.color }]}>{v.vital.label}</Text>
          <Text style={tipStyles.value}>{v.value} {v.vital.unit}</Text>
        </View>
      ))}
    </View>
  );
}
const tipStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'rgba(5,15,25,0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3A5A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 160,
    zIndex: 99,
    shadowColor: '#00C2FF',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  time: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', marginBottom: 1 },
  date: { fontSize: 9, color: '#64748B', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 10, fontWeight: '700', width: 36 },
  value: { fontSize: 11, fontWeight: '600', color: '#E2E8F0', flex: 1 },
});

// ─── Main component ───────────────────────────────────────────────────────────
export function NeoVitalMiniCard() {
  const { state } = useHealth();
  const { strength } = useSmoothingStrength();
  const { goal: weightGoalLbs, setGoal: setWeightGoal } = useWeightGoal();
  const router = useRouter();
  const ds = useDashboardStrings();
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [goalLineColor, setGoalLineColor] = useState('#FFD60A');
  const goalCelebrated = useRef(false);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const [chartWidth, setChartWidth] = useState(Dimensions.get('window').width - 32);
  // Dynamic right padding: expand when both BG and Wgt axes are shown simultaneously
  // so their label columns fit within the SVG without clipping.
  // Single right axis: PAD_R=52 | Dual right axes: PAD_R=76 (two 22px columns + 8px safety)
  const [activeVitals, setActiveVitalsState] = useState<Set<string>>(
    new Set(VITALS.map((v) => v.key)),
  );
  const bothRightAxes = activeVitals.has('glucose') && activeVitals.has('weight');
  const dynamicPadR = bothRightAxes ? 76 : 52;
  const plotW = chartWidth - PAD_L - dynamicPadR;
  const plotH = CHART_H - PAD_T - PAD_B;

  // ── Persisted state ─────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsedState] = useState(true); // default collapsed until data entered
  const [rangeDays, setRangeDaysState] = useState<0.25 | 7 | 30 | 90>(30);
  // Note: activeVitals is declared above (before plotW) so dynamicPadR can use it
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const chartShotRef = useRef<ViewShot>(null);

  // Load persisted state on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(COLLAPSED_KEY),
      AsyncStorage.getItem(RANGE_KEY),
      AsyncStorage.getItem(ACTIVE_KEY),
    ]).then(([col, rng, act]) => {
      if (col !== null) setCollapsedState(col === 'true');
      if (rng !== null) {
        const n = parseFloat(rng) as 0.25 | 7 | 30 | 90;
        if ([0.25, 7, 30, 90].includes(n)) setRangeDaysState(n);
      }
      if (act !== null) {
        try { setActiveVitalsState(new Set(JSON.parse(act))); } catch {}
      }
    }).catch(() => {});
  }, []);

  const setRange = useCallback((d: 0.25 | 7 | 30 | 90) => {
    setRangeDaysState(d);
    setTooltip(null);
    safeSetItem(RANGE_KEY, String(d)).catch(() => {});
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      safeSetItem(COLLAPSED_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleVital = useCallback((key: string) => {
    setActiveVitalsState((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      safeSetItem(ACTIVE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
    setTooltip(null);
  }, []);

  // ── Series ─────────────────────────────────────────────────────────────────
  const series = useMemo<SeriesPoint[]>(() => {
    const vitalSigns = state.data?.vitalSigns ?? [];
    const bp = state.data?.bloodPressure ?? [];
    const pulse = state.data?.pulse ?? [];
    const bloodSugar = state.data?.bloodSugar ?? [];
    const weightRecs = state.data?.weight ?? [];
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

    const map = new Map<string, SeriesPoint>();
    const roundMin = (ts: string) => {
      const d = new Date(ts);
      d.setSeconds(0, 0);
      return d.toISOString();
    };
    const upsert = (ts: string, patch: Partial<SeriesPoint>) => {
      const key = roundMin(ts);
      const existing = map.get(key) ?? { timestamp: ts };
      map.set(key, { ...existing, ...patch, timestamp: ts });
    };

    for (const r of vitalSigns) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      const patch: Partial<SeriesPoint> = {};
      if (r.heartRate) patch.hr = r.heartRate;
      if (r.systolic) patch.bp_sys = r.systolic;
      if (r.diastolic) patch.bp_dia = r.diastolic;
      const spo2Val = (r as any).oxygenSaturation ?? (r as any).spo2;
      if (spo2Val) patch.spo2 = Math.round(spo2Val);
      upsert(r.timestamp, patch);
    }
    for (const r of bp) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      upsert(r.timestamp, { bp_sys: r.systolic ?? undefined, bp_dia: r.diastolic ?? undefined });
    }
    for (const r of pulse) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      upsert(r.timestamp, { hr: r.bpm });
    }
    for (const r of bloodSugar) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      const mgDl = (r as any).glucoseMgDl ?? ((r as any).glucoseMmol ? Math.round((r as any).glucoseMmol * 18.0182) : undefined);
      if (mgDl) upsert(r.timestamp, { glucose: mgDl });
    }
    for (const r of weightRecs) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      const lbs = (r as any).weightLbs ?? ((r as any).weightKg ? parseFloat(((r as any).weightKg * 2.20462).toFixed(1)) : undefined);
      if (lbs) upsert(r.timestamp, { weight: lbs });
    }

    const raw = Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const rangeKey: SmoothRangeKey =
      rangeDays <= 1 ? '24h'
      : rangeDays <= 7 ? '7d'
      : rangeDays <= 30 ? '30d'
      : '90d';
    return smoothVitalSeries(raw, rangeKey, strength);
  }, [state.data, rangeDays, strength]);

  // ── Dynamic Wgt axis range — computed from observed data ±15% ───────────────
  const wgtRange = useMemo(() => {
    const vals = series.map((s) => s.weight).filter((v): v is number => v !== undefined);
    if (vals.length === 0) return { yMin: 80, yMax: 350 }; // fallback when no data
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = Math.max(hi - lo, 10); // ensure minimum 10 lb span
    const pad = span * 0.15;
    return {
      yMin: Math.max(0, Math.floor(lo - pad)),
      yMax: Math.ceil(hi + pad),
    };
  }, [series]);

  // ── Per-vital point arrays ─────────────────────────────────────────────────
  const vitalPoints = useMemo(() => {
    const result: Record<string, { x: number; y: number; value: number; timestamp: string }[]> = {};
    for (const v of VITALS) {
      // Use dynamic range for weight, static range for all others
      const yMin = v.key === 'weight' ? wgtRange.yMin : v.yMin;
      const yMax = v.key === 'weight' ? wgtRange.yMax : v.yMax;
      const pts = series
        .filter((s) => s[v.key as keyof SeriesPoint] !== undefined)
        .map((s, _, arr) => {
          const allWithKey = arr.filter((a) => a[v.key as keyof SeriesPoint] !== undefined);
          const idx = allWithKey.indexOf(s);
          return {
            x: toX(idx, allWithKey.length, plotW),
            y: toY(s[v.key as keyof SeriesPoint] as number, yMin, yMax, plotH),
            value: s[v.key as keyof SeriesPoint] as number,
            timestamp: s.timestamp,
          };
        });
      result[v.key] = pts;
    }
    return result;
  }, [series, plotW, plotH, wgtRange]);
  // ── X-axis labels────────────────────────────────────────────
  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const count = Math.min(series.length, 6);
    const step = Math.floor((series.length - 1) / Math.max(count - 1, 1));
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.min(i * step, series.length - 1);
      const s = series[idx];
      return {
        x: PAD_L + (idx / Math.max(series.length - 1, 1)) * plotW,
        label: rangeDays === 0.25 ? formatTimestamp(s.timestamp) : formatDate(s.timestamp),
      };
    });
  }, [series, plotW, rangeDays]);

  // ── Y-axis labels ──────────────────────────────────────────────────────────
  const yLabels = useMemo(() => {
    const firstActive = VITALS.find((v) => activeVitals.has(v.key));
    if (!firstActive) return [];
    const steps = 5;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const val = firstActive.yMin + ((firstActive.yMax - firstActive.yMin) * i) / steps;
      const y = toY(val, firstActive.yMin, firstActive.yMax, plotH);
      return { y, label: Math.round(val).toString() };
    });
  }, [activeVitals, plotH]);

  const hasData = series.length > 0;

  // Latest weight reading (for goal delta label and celebration)
  const latestWeight = useMemo(() => {
    for (let i = series.length - 1; i >= 0; i--) {
      const w = (series[i] as any).weight as number | undefined;
      if (w !== undefined) return w;
    }
    return null;
  }, [series]);

  // Goal-reached celebration: flash line green + Success haptic
  useEffect(() => {
    if (latestWeight === null || weightGoalLbs === null) {
      goalCelebrated.current = false;
      return;
    }
    const reached = latestWeight <= weightGoalLbs;
    if (reached && !goalCelebrated.current) {
      goalCelebrated.current = true;
      setGoalLineColor('#22C55E');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const timer = setTimeout(() => setGoalLineColor('#FFD60A'), 1500);
      return () => clearTimeout(timer);
    } else if (!reached) {
      goalCelebrated.current = false;
      setGoalLineColor('#FFD60A');
    }
  }, [latestWeight, weightGoalLbs]);

  // ── Tap handler ────────────────────────────────────────────────────────────
  const handleChartPress = useCallback(
    (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
      const tapX = evt.nativeEvent.locationX;
      if (series.length === 0) { setTooltip(null); return; }
      const idx = series.reduce((best, _s, i) => {
        const x = PAD_L + (i / Math.max(series.length - 1, 1)) * plotW;
        const bestX = PAD_L + (best / Math.max(series.length - 1, 1)) * plotW;
        return Math.abs(x - tapX) < Math.abs(bestX - tapX) ? i : best;
      }, 0);
      const s = series[idx];
      const tipX = PAD_L + (idx / Math.max(series.length - 1, 1)) * plotW;
      const values: TooltipData['values'] = [];
      for (const v of VITALS) {
        if (!activeVitals.has(v.key)) continue;
        const val = s[v.key as keyof SeriesPoint] as number | undefined;
        if (val !== undefined) values.push({ vital: v, value: val });
      }
      if (values.length === 0) { setTooltip(null); return; }
      const avgY = values.reduce((sum, v) => sum + toY(v.value, v.vital.yMin, v.vital.yMax, plotH), 0) / values.length;
      setTooltip({ x: tipX, y: Math.max(PAD_T + 8, avgY - 80), timestamp: s.timestamp, values });
    },
    [series, activeVitals, plotW, plotH],
  );
  const dismissTooltip = useCallback(() => setTooltip(null), []);

  // ── Export snapshot ────────────────────────────────────────────────────────
  const handleExportSnapshot = useCallback(async () => {
    if (!chartShotRef.current || isExporting) return;
    try {
      setIsExporting(true);
      const uri = await (chartShotRef.current as any).capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share VitalSync Monitor Snapshot',
          UTI: 'public.png',
        });
      }
    } catch {}
    finally { setIsExporting(false); }
  }, [isExporting]);

  return (
    <View style={styles.card}>
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <Pressable
        style={styles.cardHeader}
        onPress={toggleCollapsed}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expand NeoVital graph' : 'Collapse NeoVital graph'}
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.cardTitle}>{(ds.vitalMonitor ?? 'Vital Sign Monitor').toUpperCase()}</Text>
          <Text style={styles.cardSub}>
            {hasData
              ? `${series.length} reading${series.length !== 1 ? 's' : ''} · ${rangeDays === 0.25 ? '6h' : `${rangeDays}d`}`
              : (ds.logVitalsToBeginMonitor ?? 'Log vitals to begin')}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: hasData ? '#34D399' : '#FF2D78' }]} />
          <Text style={styles.chevron}>{collapsed ? '›' : '‹'}</Text>
        </View>
      </Pressable>

      {/* ── Range chips (always visible) ─────────────────────────────────── */}
      <View style={styles.rangeRow}>
        {([0.25, 7, 30, 90] as const).map((d) => (
          <Pressable
            key={d}
            style={[
              styles.rangeChip,
              rangeDays === d && styles.rangeChipActive,
            ]}
            onPress={() => setRange(d)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${d === 0.25 ? '6 hours' : `${d} days`} of data`}
            accessibilityState={{ selected: rangeDays === d }}
          >
            <Text style={[styles.rangeText, rangeDays === d && styles.rangeTextActive]}>
              {d === 0.25 ? '6h' : `${d}d`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Collapsible body ──────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          {/* Vital toggle chips — flex row so all 6 fit without clipping */}
          <View style={styles.toggleRow}>
            {VITALS.map((v) => {
              const on = activeVitals.has(v.key);
              return (
                <Pressable
                  key={v.key}
                  style={[
                    styles.toggleChip,
                    on
                      ? { borderColor: v.color, backgroundColor: v.color + '28' }
                      : { borderColor: '#1E3A4A', backgroundColor: '#0A1520', opacity: 0.55 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${on ? 'Hide' : 'Show'} ${v.label}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleVital(v.key)}
                >
                  <View style={[styles.toggleDot, { backgroundColor: on ? v.color : '#334155' }]} />
                  <Text style={[styles.toggleText, { color: on ? v.color : '#475569' }]}>
                    {v.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Chart */}
          <ViewShot ref={chartShotRef} options={{ format: 'png', quality: 0.95 }}>
            <View
              style={[styles.chartCard, { height: CHART_H }]}
              onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
            >
              <ParticleLayer width={chartWidth} />
              <TouchableWithoutFeedback onPress={hasData ? handleChartPress : dismissTooltip}>
                <View style={{ width: chartWidth, height: CHART_H }}>
                  <Svg width={chartWidth} height={CHART_H}>
                    <Defs>
                      {VITALS.map((v) => (
                        <LinearGradient key={v.key} id={`mini_grad_${v.key}`} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={v.color} stopOpacity="0.18" />
                          <Stop offset="1" stopColor={v.color} stopOpacity="0" />
                        </LinearGradient>
                      ))}
                    </Defs>
                    <GridBackground width={chartWidth} height={CHART_H} plotW={plotW} />
                    {/* Left Y-axis labels (first active vital) */}
                    {yLabels.map((l, i) => (
                      <SvgText key={i} x={PAD_L - 6} y={l.y + 4} fontSize={8} fill="#475569" textAnchor="end">
                        {l.label}
                      </SvgText>
                    ))}
                    {/* Right Y-axis dual scale:
                         - BG (mg/dL) at far right column when active
                         - Wgt (lbs) at inset column (PAD_R-22px) when active
                         Both can be shown simultaneously with distinct colors + unit labels */}
                    {activeVitals.has('glucose') && (() => {
                      const gv = VITALS.find((v) => v.key === 'glucose')!;
                      const steps = 4;
                      // BG column: always at the inner edge of the right padding
                      const xPos = chartWidth - dynamicPadR + 4;
                      const colW = dynamicPadR - 4;
                      return (
                        <G key="bg-right-axis">
                          {/* Invisible tap zone — tapping toggles the BG vital line */}
                          <Rect
                            x={xPos - 4}
                            y={0}
                            width={colW}
                            height={CHART_H}
                            fill="transparent"
                            onPress={() => toggleVital('glucose')}
                          />
                          <SvgText x={xPos} y={PAD_T - 2} fontSize={6} fill="#F97316" textAnchor="start" opacity={0.7} fontWeight="700">mg/dL</SvgText>
                          {Array.from({ length: steps + 1 }, (_, i) => {
                            const val = gv.yMin + ((gv.yMax - gv.yMin) * i) / steps;
                            const y = toY(val, gv.yMin, gv.yMax, plotH);
                            return (
                              <SvgText key={`bg_r${i}`} x={xPos} y={y + 4} fontSize={7} fill="#F97316" textAnchor="start" opacity={0.85}>
                                {Math.round(val)}
                              </SvgText>
                            );
                          })}
                        </G>
                      );
                    })()}
                    {activeVitals.has('weight') && (() => {
                      const steps = 4;
                      const bothActive = activeVitals.has('glucose');
                      // When both axes active: Wgt column sits 24px to the right of BG column
                      // dynamicPadR=76 gives room for two 22px columns + 8px safety.
                      // When only Wgt active: dynamicPadR=52, same position as BG-only.
                      const xPos = bothActive ? chartWidth - dynamicPadR + 4 + 24 : chartWidth - dynamicPadR + 4;
                      const colW = bothActive ? dynamicPadR - 28 : dynamicPadR - 4;
                      // Use dynamic range from observed data ±15%
                      const { yMin: wYMin, yMax: wYMax } = wgtRange;
                      return (
                        <G key="wgt-right-axis">
                          {/* Invisible tap zone — tapping toggles the Wgt vital line */}
                          <Rect
                            x={xPos - 4}
                            y={0}
                            width={colW}
                            height={CHART_H}
                            fill="transparent"
                            onPress={() => toggleVital('weight')}
                          />
                          <SvgText x={xPos} y={PAD_T - 2} fontSize={6} fill="#FFD60A" textAnchor="start" opacity={0.7} fontWeight="700">lbs</SvgText>
                          {Array.from({ length: steps + 1 }, (_, i) => {
                            const val = wYMin + ((wYMax - wYMin) * i) / steps;
                            const y = toY(val, wYMin, wYMax, plotH);
                            if (y > PAD_T + plotH + 4) return null;
                            return (
                              <SvgText key={`wgt_r${i}`} x={xPos} y={y + 4} fontSize={7} fill="#FFD60A" textAnchor="start" opacity={0.85}>
                                {Math.round(val)}
                              </SvgText>
                            );
                          })}
                        </G>
                      );
                    })()}
                    {/* X-axis labels */}
                    {xLabels.map((l, i) => (
                      <SvgText key={i} x={l.x} y={CHART_H - 4} fontSize={7} fill="#475569" textAnchor="middle">
                        {l.label}
                      </SvgText>
                    ))}
                    {/* Vital lines with data-point dots */}
                    {VITALS.filter((v) => activeVitals.has(v.key)).map((v) => {
                      const pts = vitalPoints[v.key];
                      if (!pts || pts.length === 0) return null;
                      if (pts.length === 1) {
                        return (
                          <G key={v.key}>
                            <Circle cx={pts[0].x} cy={pts[0].y} r={3.5} fill={v.color} opacity={0.9} />
                            <Circle cx={pts[0].x} cy={pts[0].y} r={1.5} fill="#FFFFFF" opacity={0.8} />
                          </G>
                        );
                      }
                      const d = buildPath(pts);
                      const fillD = d + ` L ${pts[pts.length - 1].x} ${PAD_T + plotH} L ${pts[0].x} ${PAD_T + plotH} Z`;
                      return (
                        <G key={v.key}>
                          <Path d={fillD} fill={`url(#mini_grad_${v.key})`} />
                          <Path d={d} stroke={v.color} strokeWidth={1.5} fill="none"
                            strokeLinecap="round" strokeLinejoin="round" />
                          {pts.map((pt, pi) => (
                            <G key={pi}>
                              <Circle cx={pt.x} cy={pt.y} r={2.5} fill={v.color} opacity={0.85} />
                              <Circle cx={pt.x} cy={pt.y} r={1} fill="#FFFFFF" opacity={0.7} />
                            </G>
                          ))}
                        </G>
                      );
                    })}
                    {/* Weight goal line — uses goalLineColor, delta label, inline editor */}
                    {activeVitals.has('weight') && weightGoalLbs !== null && (() => {
                      const goalY = toY(weightGoalLbs, wgtRange.yMin, wgtRange.yMax, plotH);
                      if (goalY < PAD_T || goalY > PAD_T + plotH) return null;
                      const delta = latestWeight !== null ? Math.round((latestWeight - weightGoalLbs) * 10) / 10 : null;
                      const deltaLabel = delta === null ? '' : delta <= 0 ? '✓ Goal reached!' : `−${delta} lbs to go`;
                      return (
                        <G key="weight-goal">
                          <SvgLine x1={PAD_L} y1={goalY} x2={PAD_L + plotW} y2={goalY}
                            stroke={goalLineColor} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.75} />
                          <SvgText x={PAD_L + 6} y={goalY - 5} fontSize={7} fill={goalLineColor} opacity={0.9} fontWeight="700">
                            {`Goal ${weightGoalLbs} lbs`}
                          </SvgText>
                          {deltaLabel !== '' && (
                            <SvgText x={PAD_L + 6} y={goalY + 12} fontSize={7} fill={goalLineColor} opacity={0.85}>
                              {deltaLabel}
                            </SvgText>
                          )}
                          <SvgText x={PAD_L + plotW - 4} y={goalY - 5} fontSize={7} fill={goalLineColor} opacity={0.7} textAnchor="end">
                            ✏️
                          </SvgText>
                          <Rect
                            x={PAD_L}
                            y={goalY - 10}
                            width={plotW}
                            height={20}
                            fill="transparent"
                            onPress={() => {
                              if (Platform.OS !== 'web') {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }
                              setShowGoalEditor(true);
                            }}
                          />
                        </G>
                      );
                    })()}
                    {/* Tooltip crosshair */}
                    {tooltip && (
                      <SvgLine x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={PAD_T + plotH}
                        stroke="#FFFFFF" strokeWidth={0.8} opacity={0.3} strokeDasharray="4,3" />
                    )}
                  </Svg>
                  {/* Glow pulses */}
                  {VITALS.filter((v) => activeVitals.has(v.key)).map((v) => {
                    const pts = vitalPoints[v.key];
                    if (!pts || pts.length === 0) return null;
                    const last = pts[pts.length - 1];
                    return <GlowPulse key={v.key} color={v.color} cx={last.x} cy={last.y} />;
                  })}
                  {/* Tooltip overlay */}
                  {tooltip && <Tooltip data={tooltip} screenW={chartWidth} />}
                </View>
              </TouchableWithoutFeedback>
              {/* Empty state overlay */}
              {!hasData && (
                <View style={styles.emptyOverlay}>
                  <Text style={styles.emptyIcon}>📡</Text>
                  <Text style={styles.emptyTitle}>{ds.noVitalsInRange ?? 'No vitals in this range'}</Text>
                  <Text style={styles.emptySub}>
                    {ds.logVitalsToSeeMonitor ?? 'Log blood pressure, heart rate, glucose, or weight to see your neon dashboard.'}
                  </Text>
                </View>
              )}
            </View>
          </ViewShot>

          {/* Export snapshot button */}
          <Pressable
            style={[styles.exportBtn, isExporting && styles.exportBtnActive]}
            onPress={handleExportSnapshot}
            disabled={isExporting}
            accessibilityRole="button"
            accessibilityLabel="Export chart snapshot"
          >
            <Text style={styles.exportBtnText}>
              {isExporting ? (ds.capturingSnapshot ?? '⏳ Capturing…') : (ds.shareSnapshot ?? '📸 Share Snapshot')}
            </Text>
          </Pressable>
          {/* Bottom action row: Log all vitals (left) | View Full Monitor (right) */}
          <View style={styles.viewFullRow}>
            <Pressable
              onPress={() => router.push('/log/vitals' as any)}
              accessibilityRole="button"
              accessibilityLabel={ds.logAllVitals ?? 'Log all vitals'}
              style={({ pressed }) => [styles.viewFullBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.viewFullText}>{ds.logAllVitals ?? 'Log all vitals'}</Text>
            </Pressable>
            <View style={styles.viewFullDivider} />
            <Pressable
              onPress={() => router.push('/(tabs)/neon-vitals')}
              accessibilityRole="button"
              accessibilityLabel="View full NeoVital monitor"
              style={({ pressed }) => [styles.viewFullBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.viewFullText}>{ds.viewFullMonitor ?? 'View Full Monitor'}</Text>
              <Text style={styles.viewFullArrow}>›</Text>
            </Pressable>
          </View>
        </>
      )}
      {/* Inline weight goal editor — opens when user taps the goal line */}
      <WeightGoalEditorSheet
        visible={showGoalEditor}
        currentGoal={weightGoalLbs}
        onSave={(newGoal) => setWeightGoal(newGoal)}
        onClear={() => setWeightGoal(null)}
        onClose={() => setShowGoalEditor(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#050F19',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E3A4A',
    shadowColor: '#00C2FF',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.5,
  },
  cardSub: { fontSize: 10, color: '#475569', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  chevron: { fontSize: 18, color: '#475569', fontWeight: '300', lineHeight: 20 },
  // ── Range chips ────────────────────────────────────────────────────────────
  rangeRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
    justifyContent: 'space-between',
  },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    backgroundColor: '#0A1520',
  },
  rangeChipActive: {
    backgroundColor: '#00C2FF12',
    borderColor: '#00C2FF60',
  },
  rangeText: { fontSize: 12, fontWeight: '700', color: '#475569', letterSpacing: 0.5 },
  rangeTextActive: { color: '#00C2FF' },
  // ── Toggle chips ───────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  toggleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#0A1520',
    minWidth: 0,
  },
  toggleDot: { width: 6, height: 6, borderRadius: 3 },
  toggleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  // ── Chart ──────────────────────────────────────────────────────────────────────────────────────
  chartCard: {
    width: '100%',
    backgroundColor: '#050F19',
    overflow: 'hidden',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 15, 25, 0.7)',
    gap: 8,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  emptySub: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
  },
  // ── Export button ──────────────────────────────────────────────────────────
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#00C2FF20',
    backgroundColor: '#00C2FF06',
    paddingVertical: 12,
  },
  exportBtnActive: { opacity: 0.5 },
  exportBtnText: { fontSize: 13, fontWeight: '600', color: '#00C2FF', letterSpacing: 0.3 },
  // ── Bottom action row (Log all vitals | View Full Monitor) ────────────────────────
  viewFullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E3A4A',
  },
  viewFullBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  viewFullDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#1E3A4A',
  },
  viewFullText: { fontSize: 12, fontWeight: '600', color: '#00C2FF', letterSpacing: 0.3 },
  viewFullArrow: { fontSize: 18, color: '#00C2FF', fontWeight: '300', lineHeight: 20 },
});
