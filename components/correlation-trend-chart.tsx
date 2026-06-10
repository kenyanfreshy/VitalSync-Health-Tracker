/**
 * CorrelationTrendChart — Module 2: Correlation Engine (Pattern Observer)
 *
 * A dual-axis trend viewer for Vitals vs. Activity/Meds using victory-native v36.
 *
 * Design principles:
 *  - Labels all insights as "Observed Historical Patterns" — never "Analysis" or "Diagnosis"
 *  - Footer: "Historical data patterns provided for informational purposes only.
 *             Correlations do not imply medical causation."
 *  - Passive reference framing throughout
 *  - Blue/gray reference theme (no red hard-stop colors)
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  Pressable,
  Share,
  Linking,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { GlassCard } from '@/components/glass-card';
import {
  VictoryChart,
  VictoryLine,
  VictoryAxis,
  VictoryGroup,
  VictoryScatter,
  VictoryTheme,
} from 'victory-native';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, { Circle } from 'react-native-svg';
import { useColors, useCorrelationStrings } from '@/hooks';
import type { HealthData } from '@/lib/health/types';
import { CORRELATION_REFS } from '@/lib/health/peer-review-refs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;
const CHART_HEIGHT = 220;

// ─── Metric definitions ───────────────────────────────────────────────────────

export type TrendMetricKey =
  | 'heartRate'
  | 'systolicBP'
  | 'diastolicBP'
  | 'respiratoryRate'
  | 'hrv'
  | 'sleepHours'
  | 'stepCount'
  | 'bloodGlucose'
  | 'weight';

const TREND_METRIC_LABELS: Record<TrendMetricKey, string> = {
  heartRate:       'Heart Rate (bpm)',
  systolicBP:      'Systolic BP (mmHg)',
  diastolicBP:     'Diastolic BP (mmHg)',
  respiratoryRate: 'Resp. Rate (br/min)',
  hrv:             'HRV (ms)',
  sleepHours:      'Sleep (hrs)',
  stepCount:       'Steps (k)',
  bloodGlucose:    'Blood Glucose (mg/dL)',
  weight:          'Weight (kg)',
};

const TREND_METRIC_COLORS: Record<TrendMetricKey, string> = {
  heartRate:       '#EF4444',
  systolicBP:      '#3B82F6',
  diastolicBP:     '#6366F1',
  respiratoryRate: '#06B6D4',
  hrv:             '#10B981',
  sleepHours:      '#8B5CF6',
  stepCount:       '#F59E0B',
  bloodGlucose:    '#F97316',
  weight:          '#64748B',
};

const METRIC_PAIRS: [TrendMetricKey, TrendMetricKey][] = [
  ['heartRate', 'sleepHours'],
  ['systolicBP', 'sleepHours'],
  ['heartRate', 'stepCount'],
  ['bloodGlucose', 'stepCount'],
  ['hrv', 'sleepHours'],
  ['respiratoryRate', 'heartRate'],
];

// ─── Data extraction helpers ──────────────────────────────────────────────────

function extractMetricSeries(
  data: HealthData | null,
  metric: TrendMetricKey,
  days = 30,
): { x: Date; y: number }[] {
  if (!data) return [];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  switch (metric) {
    case 'heartRate':
      return (data.pulse ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && r.bpm != null)
        .map(r => ({ x: new Date(r.timestamp), y: r.bpm! }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'systolicBP':
      return (data.bloodPressure ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && r.systolic != null)
        .map(r => ({ x: new Date(r.timestamp), y: r.systolic! }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'diastolicBP':
      return (data.bloodPressure ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && r.diastolic != null)
        .map(r => ({ x: new Date(r.timestamp), y: r.diastolic! }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'respiratoryRate':
      return (data.vitalSigns ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && (r as any).respiratoryRate != null)
        .map(r => ({ x: new Date(r.timestamp), y: (r as any).respiratoryRate! }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'hrv':
      return (data.pulse ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && (r as any).hrv != null)
        .map(r => ({ x: new Date(r.timestamp), y: (r as any).hrv! }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'sleepHours':
      return (data.sleep ?? [])
        .filter(r => new Date(r.date) >= cutoff && r.totalMinutes != null)
        .map(r => ({ x: new Date(r.date), y: Math.round((r.totalMinutes! / 60) * 10) / 10 }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'stepCount':
      return (data.activity ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && r.steps != null)
        .map(r => ({ x: new Date(r.timestamp), y: Math.round(r.steps! / 100) / 10 })) // in thousands
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'bloodGlucose':
      return (data.bloodSugar ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff)
        .map(r => ({
          x: new Date(r.timestamp),
          // glucoseMgDl is the canonical field; valueMgDl is the legacy alias
          y: (r as any).glucoseMgDl ?? (r as any).valueMgDl ?? (r as any).value ?? 0,
        }))
        .filter(r => r.y > 0)
        .sort((a, b) => a.x.getTime() - b.x.getTime());

    case 'weight': {
      // Weight can land in either data.weight[] (manual) or data.bodyComposition[] (HealthKit sync)
      const weightFromWeight = (data.weight ?? [])
        .filter(r => new Date(r.timestamp) >= cutoff && r.weightKg != null)
        .map(r => ({ x: new Date(r.timestamp), y: r.weightKg }));
      const weightFromBodyComp = (data.bodyComposition ?? [])
        .filter((r: any) => new Date(r.timestamp) >= cutoff && (r.weightKg ?? r.weight) != null)
        .map((r: any) => ({ x: new Date(r.timestamp), y: r.weightKg ?? r.weight }));
      // Merge both sources, deduplicate by day, prefer manual entry
      const weightMap = new Map<string, { x: Date; y: number }>();
      [...weightFromBodyComp, ...weightFromWeight].forEach(p => {
        const key = p.x.toDateString();
        if (!weightMap.has(key)) weightMap.set(key, p);
      });
      return Array.from(weightMap.values()).sort((a, b) => a.x.getTime() - b.x.getTime());
    }

    default:
      return [];
  }
}

/** Normalize a series to 0–100 scale for dual-axis overlay */
function normalize(series: { x: Date; y: number }[]): { x: Date; y: number }[] {
  if (series.length === 0) return [];
  const ys = series.map(p => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  return series.map(p => ({ x: p.x, y: ((p.y - min) / range) * 100 }));
}

/**
 * Generate a plain-language, quantified insight sentence from two aligned series.
 * Strategy: split X values at the median, compute mean Y for each half,
 * then phrase the difference in concrete units.
 */
function generatePlainInsight(
  primarySeries: { x: Date; y: number }[],
  secondarySeries: { x: Date; y: number }[],
  primaryMetric: TrendMetricKey,
  secondaryMetric: TrendMetricKey,
  pearsonR: number | null,
): string | null {
  if (pearsonR == null || Math.abs(pearsonR) < 0.2) return null;
  if (primarySeries.length < 3 || secondarySeries.length < 3) return null;

  // Match by day
  const aMap = new Map(primarySeries.map(p => [p.x.toDateString(), p.y]));
  const pairs: [number, number][] = [];
  for (const pb of secondarySeries) {
    const ya = aMap.get(pb.x.toDateString());
    if (ya != null) pairs.push([ya, pb.y]);
  }
  if (pairs.length < 5) return null;

  // Sort by primary (X) value
  pairs.sort((a, b) => a[0] - b[0]);
  const mid = Math.floor(pairs.length / 2);
  const lowHalf  = pairs.slice(0, mid);
  const highHalf = pairs.slice(mid);

  const meanYLow  = lowHalf.reduce((s, p) => s + p[1], 0) / lowHalf.length;
  const meanYHigh = highHalf.reduce((s, p) => s + p[1], 0) / highHalf.length;

  const yDiff = Math.abs(meanYHigh - meanYLow);
  const direction = pearsonR > 0 ? 'higher' : 'lower';

  // Metric-specific unit labels and threshold descriptions
  const UNIT: Partial<Record<TrendMetricKey, string>> = {
    heartRate:       'bpm',
    systolicBP:      'mmHg',
    diastolicBP:     'mmHg',
    hrv:             'ms',
    sleepHours:      'h',
    stepCount:       'k steps',
    bloodGlucose:    'mg/dL',
    weight:          'kg',
    respiratoryRate: 'br/min',
  };

  const THRESHOLD_LABEL: Partial<Record<TrendMetricKey, (val: number) => string>> = {
    sleepHours:  v => `<${v.toFixed(1)} h sleep`,
    stepCount:   v => `<${v.toFixed(1)}k steps/day`,
    bloodGlucose: v => `>${v.toFixed(0)} mg/dL glucose`,
    heartRate:   v => `>${v.toFixed(0)} bpm HR`,
    systolicBP:  v => `>${v.toFixed(0)} mmHg systolic`,
    weight:      v => `>${v.toFixed(1)} kg weight`,
    hrv:         v => `<${v.toFixed(0)} ms HRV`,
  };

  const METRIC_SHORT: Partial<Record<TrendMetricKey, string>> = {
    heartRate:       'heart rate',
    systolicBP:      'systolic BP',
    diastolicBP:     'diastolic BP',
    hrv:             'HRV',
    sleepHours:      'sleep duration',
    stepCount:       'step count',
    bloodGlucose:    'blood glucose',
    weight:          'weight',
    respiratoryRate: 'respiratory rate',
  };

  const yUnit  = UNIT[secondaryMetric] ?? '';
  const xThreshFn = THRESHOLD_LABEL[primaryMetric];
  const yShort = METRIC_SHORT[secondaryMetric] ?? TREND_METRIC_LABELS[secondaryMetric].split(' (')[0];

  // Threshold: use the median of X values as the split point
  const xMedian = pairs[mid][0];
  const xThresh = xThreshFn ? xThreshFn(xMedian) : `low ${METRIC_SHORT[primaryMetric] ?? ''}` ;

  if (yDiff < 0.5) return null; // difference too small to be meaningful

  return `On days with ${xThresh}, your ${yShort} tends to be ${yDiff.toFixed(1)} ${yUnit} ${direction} on average (${pairs.length} matched days).`;
}

/** Compute Pearson r for two series matched by nearest date */
function computePearsonR(
  a: { x: Date; y: number }[],
  b: { x: Date; y: number }[],
): number | null {
  if (a.length < 5 || b.length < 5) return null;
  // Match by day
  const aMap = new Map(a.map(p => [p.x.toDateString(), p.y]));
  const pairs: [number, number][] = [];
  for (const pb of b) {
    const ya = aMap.get(pb.x.toDateString());
    if (ya != null) pairs.push([ya, pb.y]);
  }
  if (pairs.length < 5) return null;
  const n = pairs.length;
  const meanA = pairs.reduce((s, p) => s + p[0], 0) / n;
  const meanB = pairs.reduce((s, p) => s + p[1], 0) / n;
  const num = pairs.reduce((s, p) => s + (p[0] - meanA) * (p[1] - meanB), 0);
  const denA = Math.sqrt(pairs.reduce((s, p) => s + (p[0] - meanA) ** 2, 0));
  const denB = Math.sqrt(pairs.reduce((s, p) => s + (p[1] - meanB) ** 2, 0));
  if (denA === 0 || denB === 0) return null;
  return num / (denA * denB);
}

function rLabel(r: number | null): string {
  if (r == null) return 'Insufficient data';
  const abs = Math.abs(r);
  const dir = r > 0 ? 'positive' : 'negative';
  if (abs >= 0.7) return `Strong ${dir} pattern (r = ${r.toFixed(2)})`;
  if (abs >= 0.4) return `Moderate ${dir} pattern (r = ${r.toFixed(2)})`;
  if (abs >= 0.2) return `Weak ${dir} pattern (r = ${r.toFixed(2)})`;
  return `No clear pattern (r = ${r.toFixed(2)})`;
}

// ─── Metric selector chip ─────────────────────────────────────────────────────

// Colour-coded correlation strength arc component
function CorrelationArc({ r, color, size = 20 }: { r: number | null; color: string; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const abs = r != null ? Math.abs(r) : 0;
  // Fill arc proportionally to |r|, capped at 1
  const fillRatio = Math.min(abs, 1);
  const strokeDashoffset = circumference * (1 - fillRatio);
  // Colour: green for strong, amber for moderate, red for weak, gray for none
  const arcColor = r == null || abs < 0.2
    ? (color + '40')
    : abs >= 0.7 ? '#22C55E'
    : abs >= 0.4 ? '#F59E0B'
    : '#EF4444';
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      {/* Track */}
      <Circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color + '20'} strokeWidth={2.5} fill="none"
      />
      {/* Fill arc */}
      <Circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={arcColor} strokeWidth={2.5} fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function MetricChip({
  metric,
  selected,
  color,
  onPress,
  isDark,
  dataDays,
  pearsonR,
}: {
  metric: TrendMetricKey;
  selected: boolean;
  color: string;
  onPress: () => void;
  isDark: boolean;
  dataDays?: number;
  pearsonR?: number | null;
}) {
  return (
    <TouchableOpacity
      style={[
        chipStyles.chip,
        {
          backgroundColor: selected ? color + '20' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
          borderColor: selected ? color + '60' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Correlation strength arc — only shown when this chip is selected */}
      {selected && pearsonR !== undefined ? (
        <CorrelationArc r={pearsonR ?? null} color={color} size={18} />
      ) : (
        <View style={[chipStyles.dot, { backgroundColor: selected ? color : (isDark ? '#475569' : '#94A3B8') }]} />
      )}
      <Text style={[chipStyles.label, { color: selected ? color : (isDark ? '#94A3B8' : '#64748B') }]}>
        {TREND_METRIC_LABELS[metric].split(' (')[0]}
      </Text>
      {dataDays !== undefined && (
        <View style={[
          chipStyles.badge,
          { backgroundColor: dataDays > 0 ? color + '30' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') },
        ]}>
          <Text style={[
            chipStyles.badgeText,
            { color: dataDays > 0 ? color : (isDark ? '#64748B' : '#94A3B8') },
          ]}>
            {dataDays > 0 ? `${dataDays}d` : '—'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: { fontSize: 11, fontWeight: '600' },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface CorrelationTrendChartProps {
  data: HealthData | null;
  /** Number of days to look back (default 30) */
  days?: number;
}

const DAY_OPTIONS = [3, 7, 30] as const;
type DayOption = typeof DAY_OPTIONS[number];

export function CorrelationTrendChart({ data, days = 30 }: CorrelationTrendChartProps) {
  const colors = useColors();
  const cs = useCorrelationStrings();
  const isDark = (colors.background as string).startsWith('#0') ||
    (colors.background as string).startsWith('#1');

  const [primaryMetric, setPrimaryMetric]   = useState<TrendMetricKey>('heartRate');
  const [secondaryMetric, setSecondaryMetric] = useState<TrendMetricKey>('sleepHours');
  const [activePairIdx, setActivePairIdx]   = useState(0);
  const [selectedDays, setSelectedDays]     = useState<DayOption>(days as DayOption ?? 30);
  const [patternsCollapsed, setPatternsCollapsed] = useState(true); // default collapsed to reduce initial scroll depth
  const [patternsHydrated, setPatternsHydrated] = useState(false);

  // Restore persisted collapse state for patterns section
  useEffect(() => {
    AsyncStorage.getItem('@vitalsync/correlate_patterns_collapsed_v1')
      .then(raw => { if (raw !== null) setPatternsCollapsed(raw === 'true'); })
      .catch(() => {})
      .finally(() => setPatternsHydrated(true));
  }, []);

  // Persist patterns collapsed state
  useEffect(() => {
    if (!patternsHydrated) return;
    safeSetItem('@vitalsync/correlate_patterns_collapsed_v1', String(patternsCollapsed)).catch(() => {});
  }, [patternsCollapsed, patternsHydrated]);

  // Reanimated accordion for patterns section
  const patternsNaturalHeight = useSharedValue(0);
  const patternsCollapsedSV = useSharedValue(patternsCollapsed ? 1 : 0);
  useEffect(() => {
    patternsCollapsedSV.value = patternsCollapsed ? 1 : 0;
  }, [patternsCollapsed, patternsCollapsedSV]);
  const patternsDerivedHeight = useDerivedValue(() =>
    withTiming(
      patternsNaturalHeight.value * (1 - patternsCollapsedSV.value),
      { duration: 260, easing: Easing.bezier(0.4, 0, 0.2, 1) }
    )
  );
  const patternsAnimatedStyle = useAnimatedStyle(() => ({
    height: patternsDerivedHeight.value,
    overflow: 'hidden' as const,
  }));

  // Chevron rotation for patterns toggle
  const patternsChevronAnim = useRef(new Animated.Value(patternsCollapsed ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(patternsChevronAnim, {
      toValue: patternsCollapsed ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [patternsCollapsed, patternsChevronAnim]);
  const patternsChevronRotate = patternsChevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-90deg'],
  });

  function togglePatterns() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPatternsCollapsed(prev => !prev);
  }

  // Restore persisted day filter + metric selectors + preset index on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('@correlate_day_filter'),
      AsyncStorage.getItem('@correlate_primary_metric'),
      AsyncStorage.getItem('@correlate_secondary_metric'),
      AsyncStorage.getItem('@correlate_preset_idx'),
    ]).then(([dayVal, primVal, secVal, presetVal]) => {
      if (dayVal && [3, 7, 30].includes(Number(dayVal))) {
        setSelectedDays(Number(dayVal) as DayOption);
      }
      const validKeys = Object.keys(TREND_METRIC_LABELS) as TrendMetricKey[];
      if (primVal && validKeys.includes(primVal as TrendMetricKey)) {
        setPrimaryMetric(primVal as TrendMetricKey);
      }
      if (secVal && validKeys.includes(secVal as TrendMetricKey)) {
        setSecondaryMetric(secVal as TrendMetricKey);
      }
      if (presetVal !== null) {
        const idx = Number(presetVal);
        if (idx >= 0 && idx < METRIC_PAIRS.length) {
          setActivePairIdx(idx);
        }
      }
    });
  }, [])

  // Persist day filter whenever it changes
  const handleDaySelect = useCallback((d: DayOption) => {
    setSelectedDays(d);
    safeSetItem('@correlate_day_filter', String(d));
  }, []);

  // Persist primary/secondary metric whenever they change
  const handlePrimarySelect = useCallback((m: TrendMetricKey) => {
    setPrimaryMetric(m);
    safeSetItem('@correlate_primary_metric', m);
  }, []);

  const handleSecondarySelect = useCallback((m: TrendMetricKey) => {
    setSecondaryMetric(m);
    safeSetItem('@correlate_secondary_metric', m);
  }, []);

  const primarySeries   = useMemo(() => extractMetricSeries(data, primaryMetric, selectedDays),   [data, primaryMetric, selectedDays]);
  const secondarySeries = useMemo(() => extractMetricSeries(data, secondaryMetric, selectedDays), [data, secondaryMetric, selectedDays]);

  // Pre-compute data density (unique days with data) for every metric — used by the badge on each chip
  const dataDaysMap = useMemo(() => {
    if (!data) return {} as Record<TrendMetricKey, number>;
    return Object.fromEntries(
      (Object.keys(TREND_METRIC_LABELS) as TrendMetricKey[]).map(m => [
        m,
        new Set(
          extractMetricSeries(data, m, selectedDays).map(p => p.x.toDateString())
        ).size,
      ])
    ) as Record<TrendMetricKey, number>;
  }, [data, selectedDays]);

  const normPrimary   = useMemo(() => normalize(primarySeries),   [primarySeries]);
  const normSecondary = useMemo(() => normalize(secondarySeries), [secondarySeries]);

  const pearsonR = useMemo(() => computePearsonR(primarySeries, secondarySeries), [primarySeries, secondarySeries]);

  const plainInsight = useMemo(
    () => generatePlainInsight(primarySeries, secondarySeries, primaryMetric, secondaryMetric, pearsonR),
    [primarySeries, secondarySeries, primaryMetric, secondaryMetric, pearsonR],
  );

  const primaryColor   = TREND_METRIC_COLORS[primaryMetric];
  const secondaryColor = TREND_METRIC_COLORS[secondaryMetric];

  // Show chart if either series has at least 1 data point; the 3-point minimum is enforced per-series in the chart render
  const hasData = normPrimary.length >= 1 || normSecondary.length >= 1;
  // Unique days with data for the selected metrics
  const primaryUniqueDays = useMemo(
    () => new Set(primarySeries.map(p => p.x.toDateString())).size,
    [primarySeries],
  );
  const secondaryUniqueDays = useMemo(
    () => new Set(secondarySeries.map(p => p.x.toDateString())).size,
    [secondarySeries],
  );
  const maxUniqueDays = Math.max(primaryUniqueDays, secondaryUniqueDays);
  // Low-data state: has some data but fewer than 7 unique days
  const hasLowData = hasData && maxUniqueDays < 7;

  const textPri  = isDark ? '#E2E8F0' : '#1E293B';
  const textMuted = isDark ? '#94A3B8' : '#64748B';
  const border   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const accent   = '#3B82F6';

  function selectPreset(idx: number) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePairIdx(idx);
    safeSetItem('@correlate_preset_idx', String(idx));
    handlePrimarySelect(METRIC_PAIRS[idx][0]);
    handleSecondarySelect(METRIC_PAIRS[idx][1]);
  }

  // Victory theme override
  const victoryTheme = {
    ...VictoryTheme.grayscale,
    axis: {
      ...VictoryTheme.grayscale.axis,
      style: {
        axis: { stroke: border },
        grid: { stroke: 'transparent' },
        tickLabels: { fill: textMuted, fontSize: 8, fontWeight: '500' },
        axisLabel: { fill: textMuted, fontSize: 9 },
      },
    },
  };

  // Scatter-plot view mode: 'trend' (dual-axis line) or 'scatter' (XY scatter with regression)
  const [viewMode, setViewMode] = useState<'trend' | 'scatter'>('trend');
  // Persist viewMode to AsyncStorage so the user's preference is restored on next launch
  useEffect(() => {
    AsyncStorage.getItem('@vitalsync/correlate_view_mode_v1').then(v => {
      if (v === 'trend' || v === 'scatter') setViewMode(v);
    }).catch(() => {});
  }, []);
  const handleViewModeChange = useCallback((mode: 'trend' | 'scatter') => {
    setViewMode(mode);
    safeSetItem('@vitalsync/correlate_view_mode_v1', mode).catch(() => {});
  }, []);

  // Build scatter data: pair up primary & secondary by matching day
  const scatterData = useMemo(() => {
    if (primarySeries.length < 3 || secondarySeries.length < 3) return [];
    const secMap = new Map(secondarySeries.map(p => [p.x.toDateString(), p.y]));
    return primarySeries
      .filter(p => secMap.has(p.x.toDateString()))
      .map(p => ({ x: p.y, y: secMap.get(p.x.toDateString())! }));
  }, [primarySeries, secondarySeries]);

  // Linear regression line for scatter mode
  const regressionLine = useMemo(() => {
    if (scatterData.length < 3) return [];
    const n = scatterData.length;
    const sumX = scatterData.reduce((s, p) => s + p.x, 0);
    const sumY = scatterData.reduce((s, p) => s + p.y, 0);
    const sumXY = scatterData.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = scatterData.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return [];
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const xs = scatterData.map(p => p.x);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    return [{ x: minX, y: slope * minX + intercept }, { x: maxX, y: slope * maxX + intercept }];
  }, [scatterData]);

  return (
    <GlassCard
      accentColor={accent}
      noPadding
      style={ctStyles.glassContainer}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Pressable
        onPress={togglePatterns}
        style={({ pressed }) => [ctStyles.header, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={`Observed Historical Patterns section, ${patternsCollapsed ? 'collapsed' : 'expanded'}. Tap to ${patternsCollapsed ? 'expand' : 'collapse'}.`}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[ctStyles.sectionLabel, { color: accent }]}>
            📊 {cs.observedPatterns.toUpperCase()}
          </Text>
          {/* Metric pair label + r-value badge — reference-image style */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[ctStyles.title, { color: textPri, fontSize: 15 }]}>
              {TREND_METRIC_LABELS[primaryMetric].split(' (')[0]}{' '}
              <Text style={{ color: textMuted, fontWeight: '400' }}>vs</Text>{' '}
              {TREND_METRIC_LABELS[secondaryMetric].split(' (')[0]}
            </Text>
            {pearsonR != null && (
              <View style={[
                ctStyles.rValueBadge,
                {
                  backgroundColor: Math.abs(pearsonR) >= 0.7 ? '#22C55E20'
                    : Math.abs(pearsonR) >= 0.4 ? '#F59E0B20'
                    : '#EF444420',
                  borderColor: Math.abs(pearsonR) >= 0.7 ? '#22C55E60'
                    : Math.abs(pearsonR) >= 0.4 ? '#F59E0B60'
                    : '#EF444460',
                },
              ]}>
                <Text style={[
                  ctStyles.rValueText,
                  {
                    color: Math.abs(pearsonR) >= 0.7 ? '#22C55E'
                      : Math.abs(pearsonR) >= 0.4 ? '#F59E0B'
                      : '#EF4444',
                  },
                ]}>
                  r={pearsonR.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
          {/* View mode toggle: Trend / Scatter */}
          {!patternsCollapsed && (
            <View style={ctStyles.viewModeRow}>
              {(['trend', 'scatter'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    ctStyles.viewModeChip,
                    {
                      backgroundColor: viewMode === mode
                        ? accent + '22'
                        : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                      borderColor: viewMode === mode
                        ? accent + '60'
                        : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                    },
                  ]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleViewModeChange(mode);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[
                    ctStyles.viewModeText,
                    { color: viewMode === mode ? accent : textMuted, fontWeight: viewMode === mode ? '700' : '500' },
                  ]}>
                    {mode === 'trend' ? '📈 Trend' : '✦ Scatter'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        {/* ── 3d / 7d / 30d filter ───────────────────────────────────────── */}
        <View style={ctStyles.dayFilterRow}>
          {DAY_OPTIONS.map(d => {
            const active = selectedDays === d;
            return (
              <TouchableOpacity
                key={d}
                style={[
                  ctStyles.dayFilterChip,
                  {
                    backgroundColor: active ? accent + '22' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                    borderColor: active ? accent + '70' : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleDaySelect(d);
                }}
                activeOpacity={0.75}
              >
                <Text style={[
                  ctStyles.dayFilterText,
                  { color: active ? accent : textMuted, fontWeight: active ? '700' : '500' },
                ]}>
                  {d}d
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {/* Share button */}
        <TouchableOpacity
          onPress={async (e) => {
            e.stopPropagation?.();
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const primaryLabel = TREND_METRIC_LABELS[primaryMetric].split(' (')[0];
            const secondaryLabel = TREND_METRIC_LABELS[secondaryMetric].split(' (')[0];
            const rStr = pearsonR != null ? ` (r = ${pearsonR.toFixed(2)})` : '';
            const strengthLabel = pearsonR == null ? cs.pdfNoData
              : Math.abs(pearsonR) >= 0.7 ? cs.pdfStrong
              : Math.abs(pearsonR) >= 0.4 ? cs.pdfModerate
              : Math.abs(pearsonR) >= 0.2 ? cs.pdfWeak
              : cs.pdfNoPattern;
            const dirLabel = pearsonR != null && Math.abs(pearsonR) >= 0.2
              ? (pearsonR > 0 ? cs.pdfPositive : cs.pdfNegative) : '';
            const insightText = plainInsight ?? `No significant correlation detected between ${primaryLabel} and ${secondaryLabel}.`;
            const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            // Build PDF HTML
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
              body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:40px;color:#11181C;line-height:1.6}
              h1{font-size:22px;font-weight:700;color:#1D4ED8;margin-bottom:4px}
              h2{font-size:15px;font-weight:600;color:#374151;margin:24px 0 8px}
              .badge{display:inline-block;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:6px;padding:3px 10px;font-size:13px;font-weight:600;margin-bottom:16px}
              .metric-row{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 16px;margin-bottom:12px}
              .metric-label{font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em}
              .metric-value{font-size:18px;font-weight:700;color:#111827;margin-top:2px}
              .insight-box{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 16px;margin:16px 0}
              .disclaimer{font-size:11px;color:#9CA3AF;margin-top:32px;border-top:1px solid #E5E7EB;padding-top:12px}
            </style></head><body>
              <h1>VitalSync — ${cs.observedPatterns}</h1>
              <div class="badge">${selectedDays}-day window · Generated ${today}</div>
              <h2>${cs.pdfMetricsCompared}</h2>
              <div class="metric-row"><div class="metric-label">${cs.pdfPrimary}</div><div class="metric-value">${primaryLabel}</div></div>
              <div class="metric-row"><div class="metric-label">${cs.pdfSecondary}</div><div class="metric-value">${secondaryLabel}</div></div>
              <h2>${cs.pdfCorrelationStrength}</h2>
              <div class="metric-row"><div class="metric-label">${cs.pdfPearsonR}</div><div class="metric-value">${pearsonR != null ? pearsonR.toFixed(3) : 'N/A'}</div></div>
              <div class="metric-row"><div class="metric-label">${cs.pdfInterpretation}</div><div class="metric-value">${strengthLabel}${dirLabel ? ' ' + dirLabel : ''}</div></div>
              <h2>${cs.pdfPlainLanguageSummary}</h2>
              <div class="insight-box">${insightText}</div>
              <div class="disclaimer">${cs.pdfDisclaimer}</div>
            </body></html>`;
            try {
              if (Platform.OS === 'web') {
                // Web: fall back to text share
                await Share.share({ message: `VitalSync — ${cs.observedPatterns}\n\n${primaryLabel} vs ${secondaryLabel}${rStr}\n\n${insightText}\n\nLast ${selectedDays} days of data.\n\n${cs.pdfDisclaimer}`, title: 'VitalSync Pattern Export' });
              } else {
                const { uri } = await Print.printToFileAsync({ html, base64: false });
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Pattern Report', UTI: 'com.adobe.pdf' });
                } else {
                  // Fallback to text share if sharing unavailable
                  await Share.share({ message: `VitalSync — ${cs.observedPatterns}\n\n${primaryLabel} vs ${secondaryLabel}${rStr}\n\n${insightText}\n\nLast ${selectedDays} days of data.`, title: 'VitalSync Pattern Export' });
                }
              }
            } catch (_unused) { /* user cancelled */ }
          }}
          style={ctStyles.shareBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={[ctStyles.shareBtnText, { color: accent }]}>⬆</Text>
        </TouchableOpacity>
        {/* Collapse chevron */}
        <Animated.Text style={[ctStyles.collapseChevron, { color: accent + 'CC', transform: [{ rotate: patternsChevronRotate }] }]}>
          ▾
        </Animated.Text>
        </View>
      </Pressable>

      {/* ── Collapsible body ─────────────────────────────────────────────────── */}
      <Reanimated.View style={patternsAnimatedStyle}>
        <View
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && patternsNaturalHeight.value !== h) patternsNaturalHeight.value = h;
          }}
        >

      {/* ── Preset pair chips ───────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ctStyles.presetRow}
      >
        {METRIC_PAIRS.map(([a, b], i) => (
          <TouchableOpacity
            key={i}
            style={[
              ctStyles.presetChip,
              {
                backgroundColor: activePairIdx === i
                  ? accent + '18'
                  : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                borderColor: activePairIdx === i
                  ? accent + '50'
                  : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
              },
            ]}
            onPress={() => selectPreset(i)}
            activeOpacity={0.7}
          >
            <Text style={[ctStyles.presetChipText, { color: activePairIdx === i ? accent : textMuted }]}>
              {TREND_METRIC_LABELS[a].split(' (')[0]} vs {TREND_METRIC_LABELS[b].split(' (')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Metric selectors ────────────────────────────────────────────────── */}
      <View style={ctStyles.selectorRow}>
        <View style={ctStyles.selectorGroup}>
          <Text style={[ctStyles.selectorLabel, { color: textMuted }]}>PRIMARY (left axis)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={ctStyles.chipRow}>
              {(Object.keys(TREND_METRIC_LABELS) as TrendMetricKey[]).map(m => (
                <MetricChip
                  key={m}
                  metric={m}
                  selected={primaryMetric === m}
                  color={TREND_METRIC_COLORS[m]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handlePrimarySelect(m);
                  }}
                  isDark={isDark}
                  dataDays={dataDaysMap[m] ?? 0}
                  pearsonR={primaryMetric === m ? pearsonR : undefined}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={ctStyles.selectorGroup}>
          <Text style={[ctStyles.selectorLabel, { color: textMuted }]}>SECONDARY (right axis)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={ctStyles.chipRow}>
              {(Object.keys(TREND_METRIC_LABELS) as TrendMetricKey[]).map(m => (
                <MetricChip
                  key={m}
                  metric={m}
                  selected={secondaryMetric === m}
                  color={TREND_METRIC_COLORS[m]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleSecondarySelect(m);
                  }}
                  isDark={isDark}
                  dataDays={dataDaysMap[m] ?? 0}
                  pearsonR={secondaryMetric === m ? pearsonR : undefined}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      {!hasData ? (
        /* ── No data at all ───────────────────────────────────────────────────────── */
        <View style={ctStyles.emptyState}>
          <Text style={ctStyles.emptyIcon}>📊</Text>
          <Text style={[ctStyles.emptyTitle, { color: textPri }]}>
            {cs.patternNoDataTitle ?? 'No Data Yet'}
          </Text>
          <Text style={[ctStyles.emptyText, { color: textMuted }]}>
            {cs.patternNoDataSubtitle
              ? cs.patternNoDataSubtitle
                  .replace('{x}', TREND_METRIC_LABELS[primaryMetric].split(' (')[0])
                  .replace('{y}', TREND_METRIC_LABELS[secondaryMetric].split(' (')[0])
              : `Log ${TREND_METRIC_LABELS[primaryMetric].split(' (')[0]} or ${TREND_METRIC_LABELS[secondaryMetric].split(' (')[0]} to see trend patterns.`}
          </Text>
          <View style={[ctStyles.emptyProgressBadge, { borderColor: accent + '40', backgroundColor: accent + '12' }]}>
            <Text style={[ctStyles.emptyProgressText, { color: accent }]}>0 / 7 days</Text>
          </View>
        </View>
      ) : hasLowData ? (
        /* ── Building pattern: < 7 unique days ───────────────────────────────────── */
        <View style={ctStyles.emptyState}>
          <Text style={ctStyles.emptyIcon}>📈</Text>
          <Text style={[ctStyles.emptyTitle, { color: textPri }]}>
            {cs.observedPatternsLowDataTitle ?? 'Building Your Pattern'}
          </Text>
          <Text style={[ctStyles.emptyText, { color: textMuted }]}>
            {cs.observedPatternsLowDataSubtitle
              ? cs.observedPatternsLowDataSubtitle
                  .replace('{x}', TREND_METRIC_LABELS[primaryMetric].split(' (')[0])
                  .replace('{y}', TREND_METRIC_LABELS[secondaryMetric].split(' (')[0])
              : `Keep logging \u2014 patterns emerge after 7 days of ${TREND_METRIC_LABELS[primaryMetric].split(' (')[0]} and ${TREND_METRIC_LABELS[secondaryMetric].split(' (')[0]}.`}
          </Text>
          {/* Progress badge: n / 7 days */}
          <View style={[ctStyles.emptyProgressBadge, { borderColor: accent + '40', backgroundColor: accent + '12' }]}>
            <Text style={[ctStyles.emptyProgressText, { color: accent }]}>
              {maxUniqueDays} / 7 days
            </Text>
          </View>
          {/* Mini progress bar */}
          <View style={[ctStyles.emptyProgressBar, { backgroundColor: accent + '20' }]}>
            <View
              style={[
                ctStyles.emptyProgressFill,
                { backgroundColor: accent, width: `${Math.min(Math.round((maxUniqueDays / 7) * 100), 100)}%` as `${number}%` },
              ]}
            />
          </View>
        </View>
      ) : viewMode === 'scatter' ? (
        /* ── Scatter-plot mode (reference-image style) ─────────────────────────── */
        <View style={ctStyles.chartWrapper}>
          {scatterData.length < 3 ? (
            <View style={ctStyles.emptyState}>
              <Text style={ctStyles.emptyIcon}>✦</Text>
              <Text style={[ctStyles.emptyTitle, { color: textPri }]}>Need Overlapping Days</Text>
              <Text style={[ctStyles.emptyText, { color: textMuted }]}>
                Log both metrics on the same days to see the scatter correlation.
              </Text>
            </View>
          ) : (
            <VictoryChart
              width={CHART_WIDTH}
              height={CHART_HEIGHT}
              theme={victoryTheme}
              padding={{ top: 20, bottom: 44, left: 44, right: 20 }}
            >
              <VictoryAxis
                label={TREND_METRIC_LABELS[primaryMetric].split(' (')[0]}
                style={{
                  axis: { stroke: border },
                  tickLabels: { fill: textMuted, fontSize: 8 },
                  axisLabel: { fill: primaryColor, fontSize: 9, fontWeight: '700', padding: 28 },
                  grid: { stroke: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', strokeDasharray: '3,3' },
                }}
              />
              <VictoryAxis
                dependentAxis
                label={TREND_METRIC_LABELS[secondaryMetric].split(' (')[0]}
                style={{
                  axis: { stroke: border },
                  tickLabels: { fill: textMuted, fontSize: 8 },
                  axisLabel: { fill: secondaryColor, fontSize: 9, fontWeight: '700', padding: 32 },
                  grid: { stroke: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', strokeDasharray: '3,3' },
                }}
              />
              <VictoryScatter
                data={scatterData}
                size={5}
                style={{
                  data: {
                    fill: (({ datum }: { datum: { x: number; y: number } }) => {
                      const hue = Math.round((datum.x / 100) * 280);
                      return `hsl(${hue},80%,60%)`;
                    }) as any,
                    opacity: 0.85,
                  },
                }}
              />
              {regressionLine.length === 2 && (
                <VictoryLine
                  data={regressionLine}
                  style={{
                    data: {
                      stroke: pearsonR != null && pearsonR > 0 ? primaryColor : secondaryColor,
                      strokeWidth: 2.5,
                      opacity: 0.9,
                    },
                  }}
                />
              )}
            </VictoryChart>
          )}
          <View style={ctStyles.legend}>
            <View style={ctStyles.legendItem}>
              <View style={[ctStyles.legendLine, { backgroundColor: primaryColor }]} />
              <Text style={[ctStyles.legendLabel, { color: textMuted }]}>X: {TREND_METRIC_LABELS[primaryMetric].split(' (')[0]}</Text>
            </View>
            <View style={ctStyles.legendItem}>
              <View style={[ctStyles.legendLine, { backgroundColor: secondaryColor }]} />
              <Text style={[ctStyles.legendLabel, { color: textMuted }]}>Y: {TREND_METRIC_LABELS[secondaryMetric].split(' (')[0]}</Text>
            </View>
          </View>
        </View>
      ) : (
        /* ── Trend mode (dual-axis line chart) ─────────────────────────────────── */
        <View style={ctStyles.chartWrapper}>
          <VictoryChart
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            theme={victoryTheme}
            padding={{ top: 20, bottom: 40, left: 40, right: 40 }}
            domain={{ y: [0, 100] }}
          >
            <VictoryAxis
              tickFormat={(t: Date) => {
                try {
                  const d = new Date(t);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                } catch { return ''; }
              }}
              tickCount={5}
              style={{
                axis: { stroke: border },
                tickLabels: { fill: textMuted, fontSize: 8 },
                grid: { stroke: 'transparent' },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(t: number) => `${Math.round(t)}%`}
              tickCount={5}
              style={{
                axis: { stroke: border },
                tickLabels: { fill: textMuted, fontSize: 8 },
                grid: { stroke: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', strokeDasharray: '3,3' },
              }}
            />
            {normPrimary.length >= 2 && (
              <VictoryGroup data={normPrimary}>
                <VictoryLine style={{ data: { stroke: primaryColor, strokeWidth: 2 } }} />
                <VictoryScatter size={3} style={{ data: { fill: primaryColor } }} />
              </VictoryGroup>
            )}
            {normSecondary.length >= 2 && (
              <VictoryGroup data={normSecondary}>
                <VictoryLine style={{ data: { stroke: secondaryColor, strokeWidth: 2, strokeDasharray: '5,3' } }} />
                <VictoryScatter size={3} style={{ data: { fill: secondaryColor } }} />
              </VictoryGroup>
            )}
          </VictoryChart>
          <View style={ctStyles.legend}>
            <View style={ctStyles.legendItem}>
              <View style={[ctStyles.legendLine, { backgroundColor: primaryColor }]} />
              <Text style={[ctStyles.legendLabel, { color: textMuted }]}>{TREND_METRIC_LABELS[primaryMetric]}</Text>
            </View>
            <View style={ctStyles.legendItem}>
              <View style={[ctStyles.legendDash, { borderColor: secondaryColor }]} />
              <Text style={[ctStyles.legendLabel, { color: textMuted }]}>{TREND_METRIC_LABELS[secondaryMetric]}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Pattern summary ─────────────────────────────────────────────────── */}
      {hasData && (
        <View style={[ctStyles.patternBox, { backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)', borderColor: accent + '25' }]}>
          <Text style={[ctStyles.patternLabel, { color: accent }]}>
            OBSERVED PATTERN
          </Text>
          <Text style={[ctStyles.patternText, { color: textPri }]}>
            {rLabel(pearsonR)}
          </Text>
          <Text style={[ctStyles.patternSub, { color: textMuted }]}>
            Between {TREND_METRIC_LABELS[primaryMetric].split(' (')[0]} and{' '}
            {TREND_METRIC_LABELS[secondaryMetric].split(' (')[0]} over the last {selectedDays} days.
          </Text>
        </View>
      )}

      {/* ── Plain-language insight card ─────────────────────────────────────── */}
      {hasData && plainInsight != null && (
        <View style={[
          ctStyles.plainInsightCard,
          {
            backgroundColor: isDark ? 'rgba(16,185,129,0.09)' : 'rgba(16,185,129,0.07)',
            borderColor: '#10B981' + (isDark ? '40' : '30'),
          },
        ]}>
          {/* Icon + label row */}
          <View style={ctStyles.plainInsightHeader}>
            <Text style={ctStyles.plainInsightIcon}>💡</Text>
            <Text style={[ctStyles.plainInsightLabel, { color: '#10B981' }]}>PLAIN-LANGUAGE SUMMARY</Text>
          </View>
          {/* Main sentence */}
          <Text style={[ctStyles.plainInsightText, { color: textPri }]}>
            {plainInsight}
          </Text>
          {/* Disclaimer */}
          <Text style={[ctStyles.plainInsightDisclaimer, { color: textMuted }]}>
            Observed pattern only — not a health diagnosis. Consult your doctor before making health decisions.
          </Text>
        </View>
      )}

      {/* ── Peer-review reference badges ─────────────────────────────────────── */}
      {(() => {
        const refKeys = ['bp-activity', 'sleep-hrv', 'glucose-activity', 'bp-sleep'];
        const allRefs = refKeys.flatMap(k => CORRELATION_REFS[k] ?? []).filter((r, i, a) => a.findIndex(x => x.id === r.id) === i).slice(0, 4);
        if (allRefs.length === 0) return null;
        return (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: textMuted, fontWeight: '600', letterSpacing: 0.3 }}>EBP REFS:</Text>
            {allRefs.map((ref, idx) => (
              <Pressable
                key={ref.id}
                onPress={() => ref.url ? Linking.openURL(ref.url) : undefined}
                style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(56,189,248,0.35)', backgroundColor: 'rgba(56,189,248,0.08)' }}
              >
                <Text style={{ fontSize: 10, color: '#38BDF8', fontWeight: '600' }}>[{idx + 1}] {ref.shortRef}</Text>
              </Pressable>
            ))}
          </View>
        );
      })()}
      {/* ── Compliance footer ────────────────────────────────────────────────── */}
      <View style={[ctStyles.footer, { borderTopColor: border }]}>
        <Text style={[ctStyles.footerText, { color: textMuted }]}>
          Historical data patterns provided for informational purposes only. Correlations do not imply medical causation. Not a diagnostic tool.
        </Text>
      </View>

        </View>
      </Reanimated.View>
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ctStyles = StyleSheet.create({
  glassContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: { fontSize: 16, fontWeight: '700' },
  daysBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  daysBadgeText: { fontSize: 11, fontWeight: '700' },
  dayFilterRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dayFilterChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 34,
    alignItems: 'center',
  },
  dayFilterText: { fontSize: 11, letterSpacing: 0.2 },
  presetRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
    flexDirection: 'row',
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  presetChipText: { fontSize: 11, fontWeight: '600' },
  selectorRow: { paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  selectorGroup: { gap: 4 },
  selectorLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'nowrap' },
  chartWrapper: { paddingHorizontal: 0 },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendDash: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed' },
  legendLabel: { fontSize: 10, fontWeight: '500' },
  emptyState: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  emptyProgressBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  emptyProgressText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  emptyProgressBar: {
    width: 160,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden' as const,
    marginTop: 8,
  },
  emptyProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  patternBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  patternLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  collapseChevron: { fontSize: 14, flexShrink: 0 },
  rValueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  rValueText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  viewModeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  viewModeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewModeText: { fontSize: 11, letterSpacing: 0.2 },
  shareBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shareBtnText: { fontSize: 14, lineHeight: 18 },
  patternText: { fontSize: 14, fontWeight: '700' },
  patternSub: { fontSize: 11, lineHeight: 16 },
  footer: {
    borderTopWidth: 0.5,
    padding: 12,
  },
  footerText: {
    fontSize: 10,
    lineHeight: 15,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // Plain-language insight card
  plainInsightCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  plainInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  plainInsightIcon: {
    fontSize: 16,
  },
  plainInsightLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  plainInsightText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  plainInsightDisclaimer: {
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
  },
});
