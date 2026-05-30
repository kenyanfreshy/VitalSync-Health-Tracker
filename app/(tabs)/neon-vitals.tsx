/**
 * NeonVitals — Real-time vital signs monitor
 * Dark-mode neon line graphs with glowing effects, particle background,
 * interactive tap tooltips, time-based x-axis, and per-vital toggles.
 */

import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  Pressable,
  Platform } from 'react-native';
import Svg, {
  Path,
  Circle,
  Line,
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
  withTiming,
  withRepeat,
  withSequence,
 Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { useHealth } from '@/lib/health/health-context';
import {
  smoothVitalSeries,
  SPO2_ALERT_THRESHOLD,
  type RangeKey as SmoothRangeKey,
} from '@/lib/health/smooth-vitals';
import { useSmoothingStrength } from '@/lib/health/smoothing-strength-context';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { WeightGoalEditorSheet } from '@/components/weight-goal-editor-sheet';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useLang } from '@/hooks';
import { disclaimerStrings } from '@/lib/i18n';

const PAD_L = 44; // left padding for y-axis labels
const _PAD_R = 52; // right padding for BG/Wgt Y-axis labels (extra 8px prevents clipping)
const PAD_T = 16;
const PAD_B = 28; // bottom padding for x-axis labels

/**
 * Dynamic chart width AND height hook — updates on orientation change.
 * Portrait: 220px tall. Landscape: ~58% of the shorter screen dimension
 * so the chart fills the extra horizontal real estate without overflowing.
 */
const LANDSCAPE_SIDE_PANEL_W = 220; // fixed width for the controls side panel in landscape
const LANDSCAPE_SIDE_PANEL_W_MINIMIZED = 48; // minimized panel width (just the restore button)

const PANEL_MINIMIZED_KEY   = '@vitalsync/neovital_panel_minimized';
const ACTIVE_VITALS_KEY     = '@neovital_mini_active_v3';   // shared with dashboard widget
const RANGE_DAYS_KEY        = '@vitalsync/neovital_range_days';

function useChartDimensions() {
  const getValues = (win: { width: number; height: number }, minimized: boolean) => {
    const isLandscape = win.width > win.height;
    // In landscape: chart column = full width minus side panel; leave 16px padding on each side
    const panelW = minimized ? LANDSCAPE_SIDE_PANEL_W_MINIMIZED : LANDSCAPE_SIDE_PANEL_W;
    const chartW = isLandscape
      ? win.width - panelW - 32
      : win.width - 32;
    const chartH = isLandscape ? Math.round(win.height * 0.88) : 220;
    return { chartW, chartH };
  };
  const [dims, setDims] = React.useState(() => getValues(Dimensions.get('window'), false));
  const [minimized, setMinimizedRaw] = React.useState(false);

  // Load persisted state on mount
  React.useEffect(() => {
    AsyncStorage.getItem(PANEL_MINIMIZED_KEY).then((val) => {
      if (val === 'true') {
        setMinimizedRaw(true);
      }
    }).catch(() => {});
  }, []);

  // Wrap setter to also persist to AsyncStorage
  const setMinimized = React.useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setMinimizedRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(PANEL_MINIMIZED_KEY, next ? 'true' : 'false').catch(() => {});
      return next;
    });
  }, []);

  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(getValues(window, minimized));
    });
    return () => sub.remove();
  }, [minimized]);
  // Re-compute when minimized changes
  React.useEffect(() => {
    setDims(getValues(Dimensions.get('window'), minimized));
  }, [minimized]);
  return { ...dims, minimized, setMinimized };
}

// ─── Vital config ─────────────────────────────────────────────────────────────

interface VitalConfig {
  key: 'hr' | 'bp_sys' | 'bp_dia' | 'spo2' | 'glucose' | 'weight';
  label: string;
  unit: string;
  color: string;
  glowColor: string;
  yMin: number;
  yMax: number;
  /** When set, this vital shares its Y-axis scale with all others in the same group */
  ySharedGroup?: string;
}

const VITALS: VitalConfig[] = [
  { key: 'hr',      label: 'HR',   unit: 'bpm',   color: '#FF2D78', glowColor: '#FF2D7888', yMin: 40,  yMax: 180 },
  // SYS and DIA share the same Y-axis group (40–200 mmHg) so DIA never renders above SYS
  { key: 'bp_sys',  label: 'SYS',  unit: 'mmHg',  color: '#00C2FF', glowColor: '#00C2FF88', yMin: 40,  yMax: 200, ySharedGroup: 'bp' },
  { key: 'bp_dia',  label: 'DIA',  unit: 'mmHg',  color: '#A78BFA', glowColor: '#A78BFA88', yMin: 40,  yMax: 200, ySharedGroup: 'bp' },
  { key: 'spo2',    label: 'SpO2', unit: '%',     color: '#34D399', glowColor: '#34D39988', yMin: 85,  yMax: 100 },
  { key: 'glucose', label: 'BG',   unit: 'mg/dL', color: '#F97316', glowColor: '#F9731688', yMin: 60,  yMax: 300 },
  { key: 'weight',  label: 'Wgt',  unit: 'lbs',   color: '#FFD60A', glowColor: '#FFD60A88', yMin: 80,  yMax: 350 },
];

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
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Particle background ──────────────────────────────────────────────────────

const PARTICLE_COUNT = 28;
const INIT_W = Dimensions.get('window').width;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: (Math.sin(i * 137.5) * 0.5 + 0.5) * INIT_W,
  y: (Math.cos(i * 97.3) * 0.5 + 0.5) * 320,
  r: 1 + (i % 3) * 0.8,
  opacity: 0.08 + (i % 5) * 0.04,
  color: ['#00C2FF', '#FF2D78', '#A78BFA', '#F97316', '#FFD60A'][i % 5],
}));

function ParticleLayer({ width }: { width: number }) {
  // Static particles — no animation hooks needed; opacity baked into PARTICLES
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={320}>
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
      <Line key={`v${i}`} x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH}
        stroke="#1E3A4A" strokeWidth={0.5} strokeDasharray="3,4" />
    );
  }
  for (let j = 0; j <= rows; j++) {
    const y = PAD_T + (j / rows) * plotH;
    lines.push(
      <Line key={`h${j}`} x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y}
        stroke="#1E3A4A" strokeWidth={0.5} strokeDasharray="3,4" />
    );
  }
  return <>{lines}</>;
}

// ─── Series point type ───────────────────────────────────────────────────────
interface SeriesPoint {
  timestamp: string;
  hr?: number;
  bp_sys?: number;
  bp_dia?: number;
  glucose?: number;
  weight?: number;
  spo2?: number;
  temp?: number;
}

// ─── Glow pulse animation ─────────────────────────────────────────────────────

function GlowPulse({ color, cx, cy }: { color: string; cx: number; cy: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  // Re-run whenever cx/cy change (e.g. on orientation change or new data point)
  // so the animation restarts at the new dot position instead of freezing.
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

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipData {
  x: number;
  y: number;
  timestamp: string;
  values: { vital: VitalConfig; value: number }[];
}

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

// ─── Snapshot watermark overlay ─────────────────────────────────────────────

interface SnapshotWatermarkProps {
  latestValues: Record<string, number | undefined>;
  rangeDays: number;
  isLive: boolean;
  seriesCount: number;
  footer?: string;
}

function SnapshotWatermark({ latestValues, rangeDays, isLive, seriesCount, footer }: SnapshotWatermarkProps) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const rangeLabel = rangeDays === 0.25 ? '6 hours' : `${rangeDays} days`;
  const modeLabel = isLive ? 'LIVE SIMULATION' : `${seriesCount} readings · last ${rangeLabel}`;

  const vitalRows: { key: string; label: string; unit: string; color: string }[] = [
    { key: 'hr',      label: 'HR',   unit: 'bpm',   color: '#FF2D78' },
    { key: 'bp_sys',  label: 'SYS',  unit: 'mmHg',  color: '#00C2FF' },
    { key: 'bp_dia',  label: 'DIA',  unit: 'mmHg',  color: '#A78BFA' },
    { key: 'spo2',    label: 'SpO2', unit: '%',     color: '#34D399' },
    { key: 'glucose', label: 'BG',   unit: 'mg/dL', color: '#F97316' },
    { key: 'weight',  label: 'Wgt',  unit: 'lbs',   color: '#FFD60A' },
  ];

  return (
    <View style={wmStyles.overlay} pointerEvents="none">
      {/* Top-left: VS logo + wordmark */}
      <View style={wmStyles.topLeft}>
        <View style={wmStyles.logoMark}>
          <Text style={wmStyles.logoMarkText}>VS</Text>
        </View>
        <View>
          <Text style={wmStyles.brandName}>VitalSync</Text>
          <Text style={wmStyles.brandSub}>Personal Health Hub</Text>
        </View>
      </View>

      {/* Top-right: capture timestamp + mode */}
      <View style={wmStyles.topRight}>
        <Text style={wmStyles.tsDate}>{dateStr}</Text>
        <Text style={wmStyles.tsTime}>{timeStr}</Text>
        <Text style={wmStyles.tsMode}>{modeLabel}</Text>
      </View>

      {/* Bottom bar: vital readings summary */}
      <View style={wmStyles.bottomBar}>
        <View style={wmStyles.vitalRow}>
          {vitalRows.map((v) => {
            const val = latestValues[v.key];
            return (
              <View key={v.key} style={wmStyles.vitalItem}>
                <Text style={[wmStyles.vitalLabel, { color: v.color }]}>{v.label}</Text>
                <Text style={wmStyles.vitalValue}>
                  {val !== undefined ? val : '—'}
                </Text>
                <Text style={[wmStyles.vitalUnit, { color: v.color + 'AA' }]}>{v.unit}</Text>
              </View>
            );
          })}
        </View>
        <Text style={wmStyles.disclaimer}>
          {footer ?? 'Generated by VitalSync Personal Health Hub · For informational purposes only · Not a substitute for advice from a healthcare professional'}
        </Text>
      </View>
    </View>
  );
}

const wmStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'space-between',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    backgroundColor: 'rgba(5,15,25,0.72)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#00C2FF30',
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#00C2FF18',
    borderWidth: 1,
    borderColor: '#00C2FF60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#00C2FF',
    letterSpacing: 0.5,
  },
  brandName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 8,
    fontWeight: '600',
    color: '#00C2FF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  topRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(5,15,25,0.72)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#1E3A4A',
  },
  tsDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.3,
  },
  tsTime: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00C2FF',
    letterSpacing: 0.5,
  },
  tsMode: {
    fontSize: 8,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  bottomBar: {
    backgroundColor: 'rgba(5,15,25,0.85)',
    borderTopWidth: 1,
    borderTopColor: '#1E3A4A',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  vitalRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  vitalItem: {
    alignItems: 'center',
    gap: 1,
  },
  vitalLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  vitalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  vitalUnit: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  disclaimer: {
    fontSize: 7.5,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 11,
    // color intentionally omitted — neon screen always has dark bg
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NeonVitals() {
  const neonScrollRef = React.useRef<import('react-native').ScrollView | null>(null);
  const { showScrollTop: showNeonScrollTop, scrollTopOpacity: neonScrollTopOpacity, handleScroll: handleNeonScroll, scrollToTop: neonScrollToTop } = useScrollToTop(neonScrollRef);
  const { state } = useHealth();
  const { strength } = useSmoothingStrength();
  const _neonLang = useLang();
  const _neonDs = (disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[_neonLang] ?? disclaimerStrings.en;
  const { chartW, chartH, minimized: panelMinimized, setMinimized: setPanelMinimized } = useChartDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Declare activeVitals before plotW so dynamicPadR can reference it
  const [activeVitals, setActiveVitalsRaw] = useState<Set<string>>(
    new Set(VITALS.map((v) => v.key)),
  );
  // Dynamic right padding: 76px when both BG and Wgt axes are active (two 22px columns + 8px safety)
  // 52px when only one right axis is shown
  const bothRightAxes = activeVitals.has('glucose') && activeVitals.has('weight');
  const dynamicPadR = bothRightAxes ? 76 : 52;
  const plotW = chartW - PAD_L - dynamicPadR;
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [rangeDays, setRangeDaysRaw] = useState<0.25 | 7 | 30 | 90>(30);
  const [isLive, setIsLive] = useState(false);

  // ── Load persisted activeVitals and rangeDays from AsyncStorage ──────────────
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ACTIVE_VITALS_KEY),
      AsyncStorage.getItem(RANGE_DAYS_KEY),
    ]).then(([act, rng]) => {
      if (act !== null) {
        try {
          const keys = JSON.parse(act) as string[];
          const valid = keys.filter((k) => VITALS.some((v) => v.key === k));
          if (valid.length > 0) setActiveVitalsRaw(new Set(valid));
        } catch {}
      }
      if (rng !== null) {
        const n = parseFloat(rng) as 0.25 | 7 | 30 | 90;
        if ([0.25, 7, 30, 90].includes(n)) setRangeDaysRaw(n);
      }
    }).catch(() => {});
  }, []);
  // ── Stable setters that persist to AsyncStorage ───────────────────────────
  const setActiveVitals = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setActiveVitalsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(ACTIVE_VITALS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  const setRangeDays = useCallback((d: 0.25 | 7 | 30 | 90) => {
    setRangeDaysRaw(d);
    safeSetItem(RANGE_DAYS_KEY, String(d)).catch(() => {});
  }, []);
  // ── Auto-select 6h if user has logged vitals within the last 6 hours ─────────
  useEffect(() => {
    const sixHoursAgo = Date.now() - 0.25 * 24 * 60 * 60 * 1000;
    const allRecords = [
      ...(state.data?.vitalSigns ?? []),
      ...(state.data?.bloodPressure ?? []),
      ...(state.data?.pulse ?? []),
      ...(state.data?.bloodSugar ?? []),
      ...(state.data?.weight ?? []),
    ];
    const hasRecentData = allRecords.some(
      (r) => new Date((r as any).timestamp).getTime() >= sixHoursAgo,
    );
    if (hasRecentData) {
      setRangeDays(0.25);
    }
  // Only run once on mount — intentionally omit state.data from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ── Pinch-to-zoom: maps pinch scale to the nearest rangeDays bucket ────────
  // Scale > 1 (spread) = zoom in (smaller range), scale < 1 (pinch) = zoom out.
  // Snaps to the ordered set [0.25, 7, 30, 90] with haptic feedback on change.
  const RANGE_STEPS: (0.25 | 7 | 30 | 90)[] = [0.25, 7, 30, 90];
  const pinchBaseRange = useRef<0.25 | 7 | 30 | 90>(30);
  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchBaseRange.current = rangeDays;
    })
    .onUpdate((e) => {
      const scale = e.scale;
      const baseIdx = RANGE_STEPS.indexOf(pinchBaseRange.current);
      // Spread fingers (scale > 1) = zoom in = smaller range index
      // Pinch fingers (scale < 1) = zoom out = larger range index
      let delta = 0;
      if (scale > 1.4) delta = -1;
      else if (scale > 1.15) delta = -1;
      else if (scale < 0.7) delta = 1;
      else if (scale < 0.85) delta = 1;
      const newIdx = Math.max(0, Math.min(RANGE_STEPS.length - 1, baseIdx + delta));
      const newRange = RANGE_STEPS[newIdx];
      if (newRange !== rangeDays) {
        setRangeDays(newRange);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    });

  const [liveSpeed, setLiveSpeed] = useState<0.5 | 1 | 2>(1);
  const [isExporting, setIsExporting] = useState(false);
  const chartShotRef = useRef<ViewShot>(null);
  const watermarkShotRef = useRef<ViewShot>(null);
  const { goal: weightGoalLbs, setGoal: setWeightGoal } = useWeightGoal();
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  // Goal line colour: yellow normally, flashes green on goal-reached
  const [goalLineColor, setGoalLineColor] = useState('#FFD60A');
  // Track whether we already fired the celebration for the current goal
  const goalCelebrated = useRef(false);

  // Blood sugar zone thresholds (mg/dL)
  const _GLUCOSE_HIGH = 180;   // hyperglycemia
  const _GLUCOSE_TARGET_HI = 130; // pre-meal target upper
  const _GLUCOSE_TARGET_LO = 70;  // pre-meal target lower

  // ── Landscape detection (derived from chart dimensions) ──────────────────────
  // Declared early so handleExportSnapshot can reference it
  const isLandscapeEarly = chartW > chartH + 32;

  const handleExportSnapshot = useCallback(async () => {
    // In landscape, capture the full watermarked view; in portrait, capture chart only
    const ref = isLandscapeEarly ? watermarkShotRef : chartShotRef;
    if (!ref.current || isExporting) return;
    try {
      setIsExporting(true);
      const uri = await (ref.current as any).capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share VitalSync Monitor Snapshot',
          UTI: 'public.png',
        });
      }
    } catch (_e) {
      // Silently ignore share cancellation
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, isLandscapeEarly]);

  // ── Landscape mode: unlock on mount, restore portrait on unmount ────────────────
  const navigation = useNavigation();
  const isLandscape = isLandscapeEarly; // alias for readability throughout the component

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // Hide tab bar in landscape, restore in portrait
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (navigation as any).setOptions({
      tabBarStyle: isLandscape
        ? { display: 'none' }
        : undefined,
    });
  }, [isLandscape, navigation]);

  // ── Live simulation state ─────────────────────────────────────────────────
  const [simPoints, setSimPoints] = useState<SeriesPoint[]>([]);
  const simRef = useRef<{
    hr: number; bp_sys: number; bp_dia: number; spo2: number; glucose: number; weight: number;
  }>({
    hr: 72, bp_sys: 120, bp_dia: 78, spo2: 97, glucose: 95, weight: 165,
  });

  // Seed simulation with last real reading if available
  useEffect(() => {
    if (!isLive) { setSimPoints([]); return; }
    const last = series[series.length - 1];
    if (last) {
      simRef.current = {
        hr:      last.hr      ?? simRef.current.hr,
        bp_sys:  last.bp_sys  ?? simRef.current.bp_sys,
        bp_dia:  last.bp_dia  ?? simRef.current.bp_dia,
        spo2:    last.spo2    ?? simRef.current.spo2,
        glucose: last.glucose ?? simRef.current.glucose,
        weight:  last.weight  ?? simRef.current.weight,
      };
    }
    // Seed with 20 historical points so the chart isn't empty on toggle
    const seed = Array.from({ length: 20 }, (_, i) => {
      const ts = new Date(Date.now() - (20 - i) * 3000).toISOString();
      const jitter = (range: number) => (Math.random() - 0.5) * range;
      return {
        timestamp: ts,
        hr:      Math.round(simRef.current.hr      + jitter(6)),
        bp_sys:  Math.round(simRef.current.bp_sys  + jitter(10)),
        bp_dia:  Math.round(simRef.current.bp_dia  + jitter(8)),
        spo2:    Math.min(100, Math.max(85, Math.round(simRef.current.spo2 + jitter(2)))),
        glucose: Math.round(simRef.current.glucose + jitter(8)),
        weight:  parseFloat((simRef.current.weight + jitter(0.3)).toFixed(1)),
      };
    });
    setSimPoints(seed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  // Tick: add a new simulated reading every 2 seconds
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      const walk = (v: number, step: number, lo: number, hi: number) => {
        const next = v + (Math.random() - 0.5) * step;
        return Math.max(lo, Math.min(hi, parseFloat(next.toFixed(1))));
      };
      const cur = simRef.current;
      // Ensure simulated DIA is always below SYS (realistic BP)
      const rawSys = Math.round(walk(cur.bp_sys, 6, 90, 180));
      const rawDia = Math.round(walk(cur.bp_dia, 4, 50, Math.min(rawSys - 10, 120)));
      const next = {
        hr:      Math.round(walk(cur.hr,      4,   45,  160)),
        bp_sys:  rawSys,
        bp_dia:  rawDia,
        spo2:    Math.min(100, Math.max(85, Math.round(walk(cur.spo2, 1, 85, 100)))),
        glucose: Math.round(walk(cur.glucose, 5,   65,  280)),
        weight:  parseFloat(walk(cur.weight,  0.2, 100, 330).toFixed(1)),
      };
      simRef.current = next;
      const ts = new Date().toISOString();
      setSimPoints((prev) => {
        const updated = [...prev, { timestamp: ts, ...next }];
        // Keep last 60 points so chart stays readable
        return updated.length > 60 ? updated.slice(updated.length - 60) : updated;
      });
      setTooltip(null);
    }, Math.round(2000 / liveSpeed));
    return () => clearInterval(id);
  }, [isLive, liveSpeed]);

  // ── Build unified time-series from vitalSigns ──────────────────────────────
  // When live mode is active, use simulated data instead of real data
  const series = useMemo(() => {
    if (isLive) return simPoints;
    const vitalSigns = state.data?.vitalSigns ?? [];
    const bp = state.data?.bloodPressure ?? [];
    const pulse = state.data?.pulse ?? [];
    const bloodSugar = state.data?.bloodSugar ?? [];
    const weightRecs = state.data?.weight ?? [];

    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

    // Merge all sources into a unified map keyed by ISO timestamp (minute-rounded)
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

    // vitalSigns records (HR, BP, SpO2)
    for (const r of vitalSigns) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      const patch: Partial<SeriesPoint> = {};
      if (r.heartRate) patch.hr = r.heartRate;
      if (r.systolic != null) patch.bp_sys = r.systolic;
      if (r.diastolic != null) patch.bp_dia = r.diastolic;
      const spo2Val = r.oxygenSaturation ?? r.spo2;
      if (spo2Val) patch.spo2 = Math.round(spo2Val);
      upsert(r.timestamp, patch);
    }

    // HealthKit BP
    for (const r of bp) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      upsert(r.timestamp, {
          ...(r.systolic != null ? { bp_sys: r.systolic } : {}),
          ...(r.diastolic != null ? { bp_dia: r.diastolic } : {}),
        });
    }

    // HealthKit pulse
    for (const r of pulse) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      upsert(r.timestamp, { hr: r.bpm });
    }

    // Blood sugar records
    for (const r of bloodSugar) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      const mgDl = r.glucoseMgDl ?? (r.glucoseMmol ? Math.round(r.glucoseMmol * 18.0182) : undefined);
      if (mgDl) upsert(r.timestamp, { glucose: mgDl });
    }

    // Weight records (convert kg to lbs for display)
    for (const r of weightRecs) {
      if (new Date(r.timestamp).getTime() < cutoff) continue;
      const lbs = r.weightLbs ?? (r.weightKg ? parseFloat((r.weightKg * 2.20462).toFixed(1)) : undefined);
      if (lbs) upsert(r.timestamp, { weight: lbs });
    }

    const raw = Array.from(map.values()).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );

    // Map rangeDays to a RangeKey for the smoothing utility.
    // 0.25 days = 6 hours → treat as '24h' (narrowest bucket).
    const rangeKey: SmoothRangeKey =
      rangeDays <= 1 ? '24h'
      : rangeDays <= 7 ? '7d'
      : rangeDays <= 30 ? '30d'
      : '90d';

    return smoothVitalSeries(raw, rangeKey, strength);
  }, [state.data, rangeDays, isLive, simPoints, strength]);

  const plotH = chartH - PAD_T - PAD_B;

  // ── Dynamic Wgt axis range — computed from observed data ±15% ───────────────
  const wgtRange = useMemo(() => {
    const vals = series.map((s) => (s as any).weight as number | undefined).filter((v): v is number => v !== undefined);
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
      // Filter once outside .map() to avoid O(n²) re-filtering on every element
      // and to eliminate the Hermes crash vector: calling indexOf on a fresh array
      // created inside .map() returns -1 (reference mismatch) and can trigger
      // EXC_BAD_ACCESS in arrayPrototypeIndexOf when the GC has collected the ref.
      const filteredSeries = series.filter((s) => s[v.key as keyof typeof s] !== undefined);
      const pts = filteredSeries.map((s, idx) => ({
            x: toX(idx, filteredSeries.length, plotW),
            y: toY(s[v.key as keyof typeof s] as number, yMin, yMax, plotH),
            value: s[v.key as keyof typeof s] as number,
            timestamp: s.timestamp,
          }));
      result[v.key] = pts;
    }
    return result;
  }, [series, plotW, plotH, wgtRange]);

  // ── SpO2 alert points: buckets where a pre-average reading was <94% ────────
  // These are rendered as amber diamond markers on the chart so clinicians can
  // see transient dips that may have been averaged away in the smoothed line.
  const spo2AlertPoints = useMemo(() => {
    // Only compute when SpO2 is an active vital (not in the VITALS config by
    // default, but spo2Alert metadata is always available from smoothVitalSeries).
    return series
      .filter((s) => (s as { spo2Alert?: boolean }).spo2Alert)
      .map((s, _, _arr) => {
        const idx = series.indexOf(s);
        // Place the marker at the top of the SpO2 yMin band (y = PAD_T + plotH)
        // so it appears at the bottom of the chart regardless of which vitals
        // are visible — this avoids overlapping with the actual vital lines.
        const x = PAD_L + (idx / Math.max(series.length - 1, 1)) * plotW;
        const y = PAD_T + plotH - 8; // 8px above the bottom axis
        return { x, y, timestamp: s.timestamp };
      });
  }, [series, plotW, plotH]);

  // ── X-axis labels (up to 6 evenly spaced timestamps) ──────────────────────
  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const count = Math.min(series.length, 6);
    const step = Math.floor((series.length - 1) / Math.max(count - 1, 1));
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.min(i * step, series.length - 1);
      const s = series[idx];
      return {
        x: PAD_L + (idx / Math.max(series.length - 1, 1)) * plotW,
        // In 6h mode use HH:mm; otherwise use short date
        label: rangeDays === 0.25 ? formatTimestamp(s.timestamp) : formatDate(s.timestamp),
      };
    });
  }, [series, plotW, rangeDays]);

  // ── Y-axis labels for the first active vital ───────────────────────────────
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

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleChartPress = useCallback(
    (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
      const tapX = evt.nativeEvent.locationX;
      if (series.length === 0) {
        setTooltip(null);
        return;
      }
      // Find closest timestamp index
      const idx = series.reduce((best, s, i) => {
        const x = PAD_L + (i / Math.max(series.length - 1, 1)) * plotW;
        const bestX = PAD_L + (best / Math.max(series.length - 1, 1)) * plotW;
        return Math.abs(x - tapX) < Math.abs(bestX - tapX) ? i : best;
      }, 0);

      const s = series[idx];
      const tipX = PAD_L + (idx / Math.max(series.length - 1, 1)) * plotW;
      const values: TooltipData['values'] = [];

      for (const v of VITALS) {
        if (!activeVitals.has(v.key)) continue;
        const val = s[v.key as keyof typeof s] as number | undefined;
        if (val !== undefined) values.push({ vital: v, value: val });
      }

      if (values.length === 0) {
        setTooltip(null);
        return;
      }

      // Average y of active vitals at this point for tooltip placement
      const avgY = values.reduce((sum, v) => sum + toY(v.value, v.vital.yMin, v.vital.yMax, plotH), 0) / values.length;

      setTooltip({ x: tipX, y: Math.max(PAD_T + 8, avgY - 80), timestamp: s.timestamp, values });
    },
    [series, activeVitals, plotW, plotH],
  );

  const dismissTooltip = useCallback(() => setTooltip(null), []);

  // ── Latest values for header badges ───────────────────────────────────────
  const latestValues = useMemo(() => {
    // Walk backwards through the series to find the most recent non-undefined
    // value for each vital independently — some vitals (e.g. weight, glucose)
    // are logged far less frequently than HR/BP so the last series point may
    // not have them.
    const result: Record<string, number> = {};
    for (const v of VITALS) {
      for (let i = series.length - 1; i >= 0; i--) {
        const val = (series[i] as unknown as Record<string, number | undefined>)[v.key];
        if (val !== undefined) {
          result[v.key] = val;
          break;
        }
      }
    }
    return result;
  }, [series]);

  const hasData = series.length > 0;

  // Latest weight reading (for goal delta label and celebration)
  const latestWeight = latestValues['weight'] ?? null;

  // Goal-reached celebration: flash line green + Success haptic
  useEffect(() => {
    if (latestWeight === null || weightGoalLbs === null) {
      goalCelebrated.current = false;
      return;
    }
    const reached = latestWeight <= weightGoalLbs;
    if (reached && !goalCelebrated.current) {
      goalCelebrated.current = true;
      // Flash green for 1.5s then revert to yellow
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

  // ── Controls panel (reused in both portrait and landscape) ─────────────────
  const ControlsPanel = useCallback(() => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={
        isLandscape
          ? [styles.sidePanelContent, { paddingTop: Math.max(insets.top + 8, 12) }]
          : undefined
      }
    >
      {/* Header (compact in landscape) */}
      <View style={[styles.header, isLandscape && styles.headerCompact]}>
        <View>
          <Text style={[styles.headerTitle, isLandscape && { fontSize: 12 }]}>VITAL MONITOR</Text>
          <Text style={[styles.headerSub, isLandscape && { fontSize: 9 }]}>
            {isLive
              ? `LIVE · ${simPoints.length} pts`
              : hasData
                ? `${series.length} readings · last ${rangeDays}d`
                : 'No data — log vitals to begin'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            style={[styles.liveBtn, isLive && styles.liveBtnActive]}
            onPress={() => setIsLive((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={isLive ? 'Stop live simulation' : 'Start live simulation'}
          >
            <View style={[styles.liveDot, { backgroundColor: isLive ? '#FF2D78' : '#334155' }]} />
            <Text style={[styles.liveBtnText, { color: isLive ? '#FF2D78' : '#475569' }]}>
              {isLive ? 'LIVE' : 'DEMO'}
            </Text>
          </Pressable>
          <View style={[styles.statusDot, { backgroundColor: isLive ? '#FF2D78' : hasData ? '#34D399' : '#FF2D78' }]} />
        </View>
      </View>

      {/* Speed control */}
      {isLive && (
        <View style={styles.speedRow}>
          <Text style={styles.speedLabel}>SPEED</Text>
          {([0.5, 1, 2] as const).map((s) => (
            <Pressable
              key={s}
              style={[
                styles.speedChip,
                liveSpeed === s && styles.speedChipActive,
                liveSpeed === s && { borderColor: '#FF2D7880' },
              ]}
              onPress={() => setLiveSpeed(s)}
              accessibilityRole="button"
              accessibilityLabel={`Set speed to ${s}x`}
              accessibilityState={{ selected: liveSpeed === s }}
            >
              <Text style={[styles.speedText, liveSpeed === s && { color: '#FF2D78' }]}>
                {s}×
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Range chips */}
      <View style={styles.rangeRow}>
        {([0.25, 7, 30, 90] as const).map((d) => (
          <Pressable
            key={d}
            style={[
              styles.rangeChip,
              rangeDays === d && styles.rangeChipActive,
              rangeDays === d && { borderColor: '#00C2FF60' },
            ]}
            onPress={() => { setRangeDays(d); setTooltip(null); }}
            accessibilityRole="button"
            accessibilityLabel={`Show ${d === 0.25 ? '6 hours' : `${d} days`} of data`}
            accessibilityState={{ selected: rangeDays === d }}
          >
            <Text style={[styles.rangeText, rangeDays === d && { color: '#00C2FF' }]}>
              {d === 0.25 ? '6h' : `${d}d`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Vital toggle chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toggleRow}>
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
              onPress={() => {
                setActiveVitals((prev) => {
                  const next = new Set(prev);
                  if (next.has(v.key) && next.size > 1) next.delete(v.key);
                  else next.add(v.key);
                  return next;
                });
                setTooltip(null);
              }}
            >
              <View style={[styles.toggleDot, { backgroundColor: on ? v.color : '#334155' }]} />
              <Text style={[styles.toggleText, { color: on ? v.color : '#475569' }]}>
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Latest value badges */}
      <View style={[styles.badgeGrid, isLandscape && styles.badgeGridLandscape]}>
        {VITALS.map((v) => {
          const val = latestValues[v.key];
          const on = activeVitals.has(v.key);
          return (
            <View
              key={v.key}
              style={[
                styles.badge,
                isLandscape && styles.badgeLandscape,
                {
                  borderColor: on ? v.color + '50' : '#1E3A4A',
                  backgroundColor: on ? v.color + '0C' : '#0A1520',
                  opacity: on ? 1 : 0.45,
                },
              ]}
            >
              <Text style={[styles.badgeLabel, { color: on ? v.color : '#475569' }]}>
                {v.label}
              </Text>
              <Text style={[styles.badgeValue, isLandscape && { fontSize: 16 }, { color: on ? '#FFFFFF' : '#334155' }]}>
                {val !== undefined ? val : '—'}
              </Text>
              <Text style={[styles.badgeUnit, { color: on ? v.color + 'AA' : '#334155' }]}>
                {v.unit}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Glucose zone legend */}
      {activeVitals.has('glucose') && (
        <View style={styles.glucoseLegendRow}>
          <Text style={styles.glucoseLegendTitle}>Blood Sugar Zones</Text>
          <View style={styles.glucoseLegendItems}>
            <View style={styles.glucoseLegendItem}>
              <View style={[styles.glucoseLegendDot, { backgroundColor: '#FF3B30' }]} />
              <Text style={styles.glucoseLegendLabel}>{'> 180 mg/dL  High'}</Text>
            </View>
            <View style={styles.glucoseLegendItem}>
              <View style={[styles.glucoseLegendDot, { backgroundColor: '#FFD60A' }]} />
              <Text style={styles.glucoseLegendLabel}>70–130 mg/dL  Target</Text>
            </View>
            <View style={styles.glucoseLegendItem}>
              <View style={[styles.glucoseLegendDot, { backgroundColor: '#FF2D78' }]} />
              <Text style={styles.glucoseLegendLabel}>Other</Text>
            </View>
          </View>
        </View>
      )}

      {!hasData && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyTitle}>No vitals in this range</Text>
          <Text style={styles.emptySub}>
            Log blood pressure, heart rate, glucose, or weight to see your neon dashboard.
          </Text>
        </View>
      )}
    </ScrollView>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [isLandscape, isLive, simPoints.length, hasData, series.length, rangeDays, liveSpeed, activeVitals, latestValues, tooltip, weightGoalLbs, insets.top]);

  return (
    <ScreenContainer
      containerClassName="bg-background"
      edges={isLandscape ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      {/* Dark background */}
      <View style={styles.darkBg} />

      {isLandscape ? (
        /* ── LANDSCAPE: chart left, controls right ────────────────────────── */
        <ViewShot
          ref={watermarkShotRef}
          options={{ format: 'png', quality: 0.95 }}
          style={styles.landscapeContainer}
        >
          {/* Branded watermark overlay — absolutely positioned, captured in snapshot */}
          <SnapshotWatermark
            latestValues={latestValues}
            rangeDays={rangeDays}
            isLive={isLive}
            seriesCount={series.length}
            footer={_neonDs.neonVitalsFooter}
          />
          {/* Chart column */}
          <View style={styles.landscapeChartCol}>
            <ViewShot ref={chartShotRef} options={{ format: 'png', quality: 0.95 }}>
            <View style={[styles.chartCard, { height: chartH, width: chartW, borderRadius: 0, marginBottom: 0 }]}>
              <ParticleLayer width={chartW} />
              <TouchableWithoutFeedback onPress={hasData ? handleChartPress : dismissTooltip}>
                <GestureDetector gesture={pinchGesture}>
                <View style={{ width: chartW, height: chartH }}>
                  <Svg width={chartW} height={chartH}>
                    <Defs>
                      {VITALS.map((v) => (
                        <LinearGradient key={v.key} id={`grad_ls_${v.key}`} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={v.color} stopOpacity="0.18" />
                          <Stop offset="1" stopColor={v.color} stopOpacity="0" />
                        </LinearGradient>
                      ))}
                    </Defs>
                    <GridBackground width={chartW} height={chartH} plotW={plotW} />
                    {yLabels.map((l, i) => (
                      <SvgText key={i} x={PAD_L - 6} y={l.y + 4} fontSize={8} fill="#475569" textAnchor="end">
                        {l.label}
                      </SvgText>
                    ))}
                    {/* Right Y-axis dual scale:
                         BG (mg/dL) at inner right column | Wgt (lbs) at outer column when both active
                         dynamicPadR=68 when both active (two 22px columns), 44 otherwise */}
                    {activeVitals.has('glucose') && (() => {
                      const gv = VITALS.find((v) => v.key === 'glucose')!;
                      const steps = 4;
                      const xPos = chartW - dynamicPadR + 4;
                      const colW = dynamicPadR - 4;
                      return (
                        <G key="bg-right-axis">
                          {/* Invisible tap zone — tapping toggles the BG vital line */}
                          <Rect
                            x={xPos - 4}
                            y={0}
                            width={colW}
                            height={chartH}
                            fill="transparent"
                            onPress={() => setActiveVitals((prev) => {
                              const next = new Set(prev);
                              if (next.has('glucose') && next.size > 1) next.delete('glucose');
                              else next.add('glucose');
                              return next;
                            })}
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
                      const xPos = bothActive ? chartW - dynamicPadR + 4 + 24 : chartW - dynamicPadR + 4;
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
                            height={chartH}
                            fill="transparent"
                            onPress={() => setActiveVitals((prev) => {
                              const next = new Set(prev);
                              if (next.has('weight') && next.size > 1) next.delete('weight');
                              else next.add('weight');
                              return next;
                            })}
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
                    {xLabels.map((l, i) => (
                      <SvgText key={i} x={l.x} y={chartH - 4} fontSize={7} fill="#475569" textAnchor="middle">
                        {l.label}
                      </SvgText>
                    ))}
                    {VITALS.filter((v) => activeVitals.has(v.key)).map((v) => {
                      const pts = vitalPoints[v.key];
                      if (pts.length === 0) return null;
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
                          <Path d={fillD} fill={`url(#grad_ls_${v.key})`} />
                          <Path d={d} stroke={v.color} strokeWidth={1.5} fill="none"
                            strokeLinecap="round" strokeLinejoin="round" />
                          {/* Data point dots on every reading */}
                          {pts.map((pt, pi) => (
                            <G key={pi}>
                              <Circle cx={pt.x} cy={pt.y} r={2.5} fill={v.color} opacity={0.85} />
                              <Circle cx={pt.x} cy={pt.y} r={1} fill="#FFFFFF" opacity={0.7} />
                            </G>
                          ))}
                        </G>
                      );
                    })}
                    {/* Weight goal line (landscape) — uses goalLineColor, delta label, inline editor */}
                    {activeVitals.has('weight') && weightGoalLbs !== null && (() => {
                      const goalY = toY(weightGoalLbs, wgtRange.yMin, wgtRange.yMax, plotH);
                      if (goalY < PAD_T || goalY > PAD_T + plotH) return null;
                      const delta = latestWeight !== null ? Math.round((latestWeight - weightGoalLbs) * 10) / 10 : null;
                      const deltaLabel = delta === null ? '' : delta <= 0 ? '✓ Goal reached!' : `−${delta} lbs to go`;
                      return (
                        <G key="weight-goal-ls">
                          <Line x1={PAD_L} y1={goalY} x2={PAD_L + plotW} y2={goalY}
                            stroke={goalLineColor} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.75} />
                          <SvgText x={PAD_L + 6} y={goalY - 5} fontSize={7} fill={goalLineColor} opacity={0.9} fontWeight="700">
                            Goal {weightGoalLbs} lbs
                          </SvgText>
                          {deltaLabel !== '' && (
                            <SvgText x={PAD_L + 6} y={goalY + 12} fontSize={7} fill={goalLineColor} opacity={0.85}>
                              {deltaLabel}
                            </SvgText>
                          )}
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
                          <SvgText x={PAD_L + plotW - 4} y={goalY - 5} fontSize={7} fill={goalLineColor} opacity={0.7} textAnchor="end">
                            ✏️
                          </SvgText>
                        </G>
                      );
                    })()}
                    {/* SpO₂ alert diamonds (landscape) */}
                    {spo2AlertPoints.map((pt, i) => (
                      <G key={`spo2a_ls_${i}`}>
                        <Path
                          d={`M ${pt.x} ${pt.y - 5} L ${pt.x + 4} ${pt.y} L ${pt.x} ${pt.y + 5} L ${pt.x - 4} ${pt.y} Z`}
                          fill="#F59E0B"
                          opacity={0.85}
                        />
                      </G>
                    ))}
                    {spo2AlertPoints.length > 0 && (
                      <SvgText x={PAD_L + 4} y={PAD_T + plotH - 14} fontSize={7} fill="#F59E0B" opacity={0.75}>
                        ◆ SpO₂ &lt;{SPO2_ALERT_THRESHOLD}% detected
                      </SvgText>
                    )}
                    {tooltip && (
                      <Line x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={PAD_T + plotH}
                        stroke="#FFFFFF" strokeWidth={0.8} opacity={0.3} strokeDasharray="4,3" />
                    )}
                  </Svg>
                  {VITALS.filter((v) => activeVitals.has(v.key)).map((v) => {
                    const pts = vitalPoints[v.key];
                    if (pts.length === 0) return null;
                    const last = pts[pts.length - 1];
                    return <GlowPulse key={v.key} color={v.color} cx={last.x} cy={last.y} />;
                  })}
                   {tooltip && <Tooltip data={tooltip} screenW={chartW} />}
                 </View>
                 </GestureDetector>
               </TouchableWithoutFeedback>
             </View>
             </ViewShot>
          </View>
          {/* Controls side panel — collapsible in landscape */}
          <View style={[
            styles.landscapeSidePanel,
            panelMinimized && styles.landscapeSidePanelMinimized,
          ]}>
            {!panelMinimized && (
              <>
                <ControlsPanel />
                {/* Export snapshot button in landscape side panel */}
                <Pressable
                  style={[styles.exportBtn, styles.exportBtnLandscape, isExporting && styles.exportBtnActive]}
                  onPress={handleExportSnapshot}
                  disabled={isExporting}
                  accessibilityRole="button"
                  accessibilityLabel="Export branded snapshot"
                >
                  <Text style={styles.exportBtnText}>
                    {isExporting ? '⏳ Capturing…' : '📸 Share Snapshot'}
                  </Text>
                </Pressable>
              </>
            )}
            {/* Minimize / restore toggle button — always at bottom-right corner */}
            <Pressable
              style={[
                styles.panelToggleBtn,
                !panelMinimized && styles.panelToggleBtnExpanded,
              ]}
              onPress={() => setPanelMinimized((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={panelMinimized ? 'Expand vital monitor panel' : 'Minimize vital monitor panel'}
            >
              <Text style={styles.panelToggleBtnText}>
                {panelMinimized ? '▶' : '◀'}
              </Text>
            </Pressable>
          </View>
        </ViewShot>
      ) : (
        /* ── PORTRAIT: use shared ControlsPanel + chart ──────────── */
        <ScrollView
          ref={neonScrollRef}
          onScroll={handleNeonScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top + 8, 16) + 144 }]}
        >
          <ControlsPanel />
          {/* ── Chart card ─────────────────────────────────────────── */}
          <ViewShot ref={chartShotRef} options={{ format: 'png', quality: 0.95 }}>
          <View style={[styles.chartCard, { height: chartH }]}>
            <ParticleLayer width={chartW} />
            <TouchableWithoutFeedback onPress={hasData ? handleChartPress : dismissTooltip}>
              <GestureDetector gesture={pinchGesture}>
              <View style={{ width: chartW, height: chartH }}>
                <Svg width={chartW} height={chartH}>
                  <Defs>
                    {VITALS.map((v) => (
                      <LinearGradient key={v.key} id={`grad_${v.key}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={v.color} stopOpacity="0.18" />
                        <Stop offset="1" stopColor={v.color} stopOpacity="0" />
                      </LinearGradient>
                    ))}
                  </Defs>
                  <GridBackground width={chartW} height={chartH} plotW={plotW} />
                  {yLabels.map((l, i) => (
                    <SvgText key={i} x={PAD_L - 6} y={l.y + 4} fontSize={8} fill="#475569" textAnchor="end">
                      {l.label}
                    </SvgText>
                  ))}
                  {xLabels.map((l, i) => (
                    <SvgText key={i} x={l.x} y={chartH - 4} fontSize={7} fill="#475569" textAnchor="middle">
                      {l.label}
                    </SvgText>
                  ))}
                  {VITALS.filter((v) => activeVitals.has(v.key)).map((v) => {
                    const pts = vitalPoints[v.key];
                    if (pts.length === 0) return null;
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
                        <Path d={fillD} fill={`url(#grad_${v.key})`} />
                        <Path d={d} stroke={v.color} strokeWidth={1.5} fill="none"
                          strokeLinecap="round" strokeLinejoin="round" />
                        {/* Data point dots on every reading */}
                        {pts.map((pt, pi) => (
                          <G key={pi}>
                            <Circle cx={pt.x} cy={pt.y} r={2.5} fill={v.color} opacity={0.85} />
                            <Circle cx={pt.x} cy={pt.y} r={1} fill="#FFFFFF" opacity={0.7} />
                          </G>
                        ))}
                      </G>
                    );
                  })}
                  {/* Weight goal line — yellow dashed, tappable, uses dynamic wgtRange */}
                  {activeVitals.has('weight') && weightGoalLbs !== null && (() => {
                    const goalY = toY(weightGoalLbs, wgtRange.yMin, wgtRange.yMax, plotH);
                    if (goalY < PAD_T || goalY > PAD_T + plotH) return null;
                    // Delta label: "−X lbs to go" or "✓ Goal reached!"
                    const delta = latestWeight !== null ? Math.round((latestWeight - weightGoalLbs) * 10) / 10 : null;
                    const deltaLabel = delta === null ? '' : delta <= 0 ? '✓ Goal reached!' : `−${delta} lbs to go`;
                    return (
                      <G key="weight-goal">
                        {/* Dashed goal line — colour driven by goalLineColor state */}
                        <Line x1={PAD_L} y1={goalY} x2={PAD_L + plotW} y2={goalY}
                          stroke={goalLineColor} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.75} />
                        {/* "Goal X lbs" label */}
                        <SvgText x={PAD_L + 6} y={goalY - 5} fontSize={7} fill={goalLineColor} opacity={0.9} fontWeight="700">
                          Goal {weightGoalLbs} lbs
                        </SvgText>
                        {/* Delta progress label */}
                        {deltaLabel !== '' && (
                          <SvgText x={PAD_L + 6} y={goalY + 12} fontSize={7} fill={goalLineColor} opacity={0.85}>
                            {deltaLabel}
                          </SvgText>
                        )}
                        {/* Invisible tap zone — opens inline goal editor */}
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
                        {/* Edit hint at right edge */}
                        <SvgText x={PAD_L + plotW - 4} y={goalY - 5} fontSize={7} fill={goalLineColor} opacity={0.7} textAnchor="end">
                          ✏️
                        </SvgText>
                      </G>
                    );
                  })()}
                  {/* SpO₂ alert diamonds: pre-average readings below 94% */}
                  {spo2AlertPoints.map((pt, i) => (
                    <G key={`spo2a_${i}`}>
                      {/* Diamond shape via rotated square */}
                      <Path
                        d={`M ${pt.x} ${pt.y - 5} L ${pt.x + 4} ${pt.y} L ${pt.x} ${pt.y + 5} L ${pt.x - 4} ${pt.y} Z`}
                        fill="#F59E0B"
                        opacity={0.85}
                      />
                    </G>
                  ))}
                  {spo2AlertPoints.length > 0 && (
                    <SvgText x={PAD_L + 4} y={PAD_T + plotH - 14} fontSize={7} fill="#F59E0B" opacity={0.75}>
                      ◆ SpO₂ &lt;{SPO2_ALERT_THRESHOLD}% detected
                    </SvgText>
                  )}
                  {tooltip && (
                    <Line x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={PAD_T + plotH}
                      stroke="#FFFFFF" strokeWidth={0.8} opacity={0.3} strokeDasharray="4,3" />
                  )}
                </Svg>
                {VITALS.filter((v) => activeVitals.has(v.key)).map((v) => {
                  const pts = vitalPoints[v.key];
                  if (pts.length === 0) return null;
                  const last = pts[pts.length - 1];
                  return <GlowPulse key={v.key} color={v.color} cx={last.x} cy={last.y} />;
                })}
                {tooltip && <Tooltip data={tooltip} screenW={chartW} />}
              </View>
              </GestureDetector>
            </TouchableWithoutFeedback>
          </View>
          </ViewShot>
          {/* Export snapshot */}
          <Pressable
            style={[styles.exportBtn, isExporting && styles.exportBtnActive]}
            onPress={handleExportSnapshot}
            disabled={isExporting}
            accessibilityRole="button"
            accessibilityLabel="Export chart snapshot"
          >
            <Text style={styles.exportBtnText}>
              {isExporting ? '⏳ Capturing…' : '📸 Share Snapshot'}
            </Text>
          </Pressable>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ── Dashboard back button ─────────────────────────────────────────── */}
      <Pressable
        style={[
          styles.dashboardBackBtn,
          isLandscape
            ? { bottom: Math.max(insets.bottom + 12, 16), left: 16 }
            : { bottom: Math.max(insets.bottom + 72, 88), right: 16 },
        ]}
        onPress={() => router.replace('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel="Return to Dashboard"
      >
        <Text style={styles.dashboardBackBtnText}>⌂ Dashboard</Text>
      </Pressable>
      <ScrollToTopButton opacity={neonScrollTopOpacity} visible={showNeonScrollTop} onPress={neonScrollToTop} />
      {/* Inline weight goal editor — opens when user taps the goal line */}
      <WeightGoalEditorSheet
        visible={showGoalEditor}
        currentGoal={weightGoalLbs}
        onSave={(newGoal) => setWeightGoal(newGoal)}
        onClear={() => setWeightGoal(null)}
        onClose={() => setShowGoalEditor(false)}
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  darkBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050F19',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    // extra top padding is added dynamically via insets.top in the ScrollView contentContainerStyle
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: '#F97316',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  liveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    backgroundColor: '#0A1520',
  },
  liveBtnActive: {
    borderColor: '#FF2D7860',
    backgroundColor: '#FF2D7810',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    backgroundColor: '#0A1520',
  },
  rangeChipActive: {
    backgroundColor: '#00C2FF12',
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
  },
  toggleRow: {
    marginBottom: 12,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    backgroundColor: '#0A1520',
  },
  toggleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chartCard: {
    width: '100%',
    // height is set dynamically via inline style; this fallback is overridden at runtime
    height: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    backgroundColor: '#050F19',
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#00C2FF',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    flex: 1,
    minWidth: '28%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  badgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  badgeValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  badgeUnit: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    // color intentionally omitted — neon screen always has dark bg
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
    // color intentionally omitted — neon screen always has dark bg
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  speedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.8,
    marginRight: 4,
  },
  speedChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E3A4A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#0A1520',
  },
  speedChipActive: {
    backgroundColor: '#FF2D7812',
  },
  speedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00C2FF30',
    backgroundColor: '#00C2FF08',
    paddingVertical: 10,
    marginBottom: 12,
  },
  exportBtnActive: {
    opacity: 0.5,
  },
  exportBtnLandscape: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 8,
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00C2FF',
    letterSpacing: 0.3,
  },
  glucoseLegendRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9731630',
    backgroundColor: '#F9731608',
    padding: 10,
    marginBottom: 12,
  },
  glucoseLegendTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F97316',
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  glucoseLegendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  glucoseLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  glucoseLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  glucoseLegendLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  // ── Landscape layout ──────────────────────────────────────────────────────────────────
  landscapeContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  landscapeChartCol: {
    flex: 1,
    // width is constrained by useChartDimensions; flex:1 fills remaining space after side panel
  },
  landscapeSidePanel: {
    flex: 0,
    width: LANDSCAPE_SIDE_PANEL_W,
    borderLeftWidth: 1,
    borderLeftColor: '#1E3A4A',
    backgroundColor: '#050F19',
    flexDirection: 'column',
    justifyContent: 'space-between', // push toggle button to bottom
  },
  landscapeSidePanelMinimized: {
    width: LANDSCAPE_SIDE_PANEL_W_MINIMIZED,
    alignItems: 'center',
    backgroundColor: 'transparent', // transparent when minimized to avoid black bar
    borderLeftWidth: 0, // no border when minimized
    justifyContent: 'flex-end', // push toggle button to bottom
  },
  panelToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0A1520',
    borderWidth: 1,
    borderColor: '#00C2FF40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12, // bottom margin instead of top
  },
  panelToggleBtnExpanded: {
    alignSelf: 'flex-end', // right-align when panel is expanded
    marginRight: 8,
    marginBottom: 12,
  },
  panelToggleBtnText: {
    fontSize: 12,
    color: '#00C2FF',
    fontWeight: '700',
  },
  sidePanelContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 0,
    // paddingTop is added dynamically via insets.top in the ScrollView contentContainerStyle
  },
  headerCompact: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A4A',
  },
  badgeGridLandscape: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: 4,
  },
  badgeLandscape: {
    flex: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  // ── Dashboard back button ──────────────────────────────────────────────────
  dashboardBackBtn: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00C2FF50',
    backgroundColor: 'rgba(5,15,25,0.88)',
    shadowColor: '#00C2FF',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  dashboardBackBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00C2FF',
    letterSpacing: 0.6,
  },
});
