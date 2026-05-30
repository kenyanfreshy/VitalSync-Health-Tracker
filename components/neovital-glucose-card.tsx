/**
 * NeoVitalGlucoseCard
 *
 * Blood glucose trend graph in the NeoVital style:
 * - Dark #050F19 background, particle layer, grid, neon waveform
 * - Amber neon (#FFB800) for glucose line with gradient fill
 * - Context-coloured dots: fasting=amber, post-meal=orange, random=cyan, bedtime=purple
 * - Pulsating GlowPulse dot at latest reading
 * - 24h / 7d / 30d / 90d range tabs
 * - Legend row with latest value in user's unit (mg/dL or mmol/L)
 * - Collapsible, default collapsed, persisted via AsyncStorage
 * - Taps to the blood sugar log screen
 */
import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Svg, {
  Path,
  Circle,
  Line as SvgLine,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useRouter } from 'expo-router';
import { useHealth } from '@/lib/health/health-context';
import { useUnitPreferences, mgDlToMmol } from '@/hooks/use-unit-preferences';
// ─── Chart constants ──────────────────────────────────────────────────────────
const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 20;
const CHART_H = 160;

// ─── Neon colours ─────────────────────────────────────────────────────────────
const GLUCOSE_COLOR = '#FFB800';   // amber neon — main line
const FASTING_COLOR = '#FFB800';   // amber
const POST_MEAL_COLOR = '#FF6B35'; // orange
const RANDOM_COLOR = '#00F5FF';    // cyan
const BEDTIME_COLOR = '#7B61FF';   // purple

// ─── Time range config ────────────────────────────────────────────────────────
type RangeKey = '24h' | '7d' | '30d' | '90d';
const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7  * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
];
const RANGE_STORAGE_KEY = '@neovital_glucose_range_v1';
const COLLAPSED_STORAGE_KEY = '@neovital_glucose_collapsed_v1';

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
function contextColor(ctx: string): string {
  switch (ctx) {
    case 'fasting':   return FASTING_COLOR;
    case 'post-meal': return POST_MEAL_COLOR;
    case 'bedtime':   return BEDTIME_COLOR;
    default:          return RANDOM_COLOR;
  }
}

// ─── Particle layer ───────────────────────────────────────────────────────────
const PARTICLE_COUNT = 18;
const INIT_W = Dimensions.get('window').width - 32;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: (Math.sin(i * 137.5) * 0.5 + 0.5) * INIT_W,
  y: (Math.cos(i * 97.3) * 0.5 + 0.5) * CHART_H,
  r: 0.8 + (i % 3) * 0.6,
  opacity: 0.06 + (i % 5) * 0.03,
  color: [GLUCOSE_COLOR, POST_MEAL_COLOR, RANDOM_COLOR, BEDTIME_COLOR][i % 4],
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
  const cols = 6;
  const rows = 4;
  const lines: React.ReactNode[] = [];
  const plotH = height - PAD_T - PAD_B;
  for (let i = 0; i <= cols; i++) {
    const x = PAD_L + (i / cols) * plotW;
    lines.push(
      <SvgLine key={`v${i}`} x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH}
        stroke="#1E3A4A" strokeWidth={0.5} strokeDasharray="3,4" />,
    );
  }
  for (let i = 0; i <= rows; i++) {
    const y = PAD_T + (i / rows) * plotH;
    lines.push(
      <SvgLine key={`h${i}`} x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y}
        stroke="#1E3A4A" strokeWidth={0.5} strokeDasharray="3,4" />,
    );
  }
  return <Svg style={StyleSheet.absoluteFill} width={width} height={height}>{lines}</Svg>;
}

// ─── Pulsating glow dot ───────────────────────────────────────────────────────
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
          left: cx - 5,
          top: cy - 5,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
        },
        animStyle,
      ]}
      pointerEvents="none"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function NeoVitalGlucoseCard() {
  const router = useRouter();
  const { state } = useHealth();
  const { glucoseUnit } = useUnitPreferences();

  const [chartWidth, setChartWidth] = useState(Dimensions.get('window').width - 32);
  const handleChartLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) setChartWidth(w);
  }, []);

  const plotW = chartWidth - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  // ── Persisted state ─────────────────────────────────────────────────────────
  const [range, setRangeState] = useState<RangeKey>('7d');
  const [collapsed, setCollapsedState] = useState(true);

  useEffect(() => {
    AsyncStorage.multiGet([RANGE_STORAGE_KEY, COLLAPSED_STORAGE_KEY])
      .then(([[, r], [, c]]) => {
        if (r && ['24h', '7d', '30d', '90d'].includes(r)) setRangeState(r as RangeKey);
        if (c !== null) setCollapsedState(c === 'true');
      })
      .catch((_) => {});
  }, []);

  const setRange = useCallback((r: RangeKey) => {
    setRangeState(r);
    safeSetItem(RANGE_STORAGE_KEY, r).catch((_) => {});
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      safeSetItem(COLLAPSED_STORAGE_KEY, String(next)).catch((_) => {});
      return next;
    });
  }, []);

  // ── Range-aware series ──────────────────────────────────────────────────────
  const rangeMs = useMemo(
    () => RANGES.find((r) => r.key === range)?.ms ?? 7 * 24 * 60 * 60 * 1000,
    [range],
  );

  // Y-axis range in mg/dL (we always store in mg/dL)
  const Y_MIN_MGDL = 40;
  const Y_MAX_MGDL = 400;

  interface GlucosePoint {
    timestamp: string;
    mgDl: number;
    context: string;
  }

  const series = useMemo<GlucosePoint[]>(() => {
    const records = state.data?.bloodSugar ?? [];
    const cutoff = Date.now() - rangeMs;
    return records
      .filter((r) => new Date(r.timestamp).getTime() >= cutoff && r.glucoseMgDl != null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((r) => ({
        timestamp: r.timestamp,
        mgDl: r.glucoseMgDl,
        context: r.context ?? 'random',
      }));
  }, [state.data?.bloodSugar, rangeMs]);

  const hasData = series.length > 0;

  // ── Chart points ────────────────────────────────────────────────────────────
  const chartPoints = useMemo(() =>
    series.map((s, idx) => ({
      x: toX(idx, series.length, plotW),
      y: toY(s.mgDl, Y_MIN_MGDL, Y_MAX_MGDL, plotH),
      color: contextColor(s.context),
    })),
  [series, plotW, plotH]);

  const latestPoint = chartPoints[chartPoints.length - 1];
  const latestRecord = series[series.length - 1];

  // ── Latest display value ────────────────────────────────────────────────────
  const latestDisplay = useMemo(() => {
    if (!latestRecord) return null;
    if (glucoseUnit === 'mmol/L') {
      return `${mgDlToMmol(latestRecord.mgDl).toFixed(1)} mmol/L`;
    }
    return `${Math.round(latestRecord.mgDl)} mg/dL`;
  }, [latestRecord, glucoseUnit]);

  // ── Y-axis labels ────────────────────────────────────────────────────────────
  const yLabels = useMemo(() => {
    if (glucoseUnit === 'mmol/L') {
      return [
        { mgDl: 54,  label: '3.0' },
        { mgDl: 126, label: '7.0' },
        { mgDl: 198, label: '11' },
        { mgDl: 270, label: '15' },
      ];
    }
    return [
      { mgDl: 70,  label: '70' },
      { mgDl: 140, label: '140' },
      { mgDl: 250, label: '250' },
      { mgDl: 360, label: '360' },
    ];
  }, [glucoseUnit]);

  // ── X-axis labels ────────────────────────────────────────────────────────────
  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const count = Math.min(series.length, 4);
    const step = Math.floor((series.length - 1) / Math.max(count - 1, 1));
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.min(i * step, series.length - 1);
      const s = series[idx];
      const d = new Date(s.timestamp);
      const label = range === '24h'
        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { x: PAD_L + (idx / Math.max(series.length - 1, 1)) * plotW, label };
    });
  }, [series, plotW, range]);

  return (
    <View style={styles.card}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Pressable
        onPress={toggleCollapsed}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expand glucose trend' : 'Collapse glucose trend'}
        style={({ pressed }) => [styles.cardHeader, { opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.cardTitle}>GLUCOSE TREND</Text>
          <Text style={styles.cardSub}>
            {hasData
              ? `${series.length} reading${series.length !== 1 ? 's' : ''} · ${range}`
              : 'Log blood sugar to begin'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: hasData ? GLUCOSE_COLOR : '#FF2D78' }]} />
          <Text style={styles.chevron}>{collapsed ? '›' : '‹'}</Text>
        </View>
      </Pressable>

      {/* ── Range tabs ─────────────────────────────────────────────────────── */}
      <View style={styles.rangeTabs}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.rangeTab, range === r.key && styles.rangeTabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.rangeTabText, range === r.key && styles.rangeTabTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Collapsible body ───────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          <Pressable
            onPress={() => router.push('/log/blood-sugar')}
            accessibilityRole="button"
            accessibilityLabel="Open blood sugar log"
            onLayout={handleChartLayout}
            style={({ pressed }) => [
              styles.chartContainer,
              { height: CHART_H, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <ParticleLayer width={chartWidth} />
            <View style={{ width: chartWidth, height: CHART_H }}>
              <Svg width={chartWidth} height={CHART_H}>
                <Defs>
                  <LinearGradient id="glucose_grad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={GLUCOSE_COLOR} stopOpacity="0.18" />
                    <Stop offset="1" stopColor={GLUCOSE_COLOR} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <GridBackground width={chartWidth} height={CHART_H} plotW={plotW} />
                {/* Y-axis labels */}
                {yLabels.map((yl) => {
                  const y = toY(yl.mgDl, Y_MIN_MGDL, Y_MAX_MGDL, plotH);
                  return (
                    <SvgText key={yl.label} x={PAD_L - 4} y={y + 3} fontSize={7} fill="#475569" textAnchor="end">
                      {yl.label}
                    </SvgText>
                  );
                })}
                {/* X-axis labels */}
                {xLabels.map((l, i) => (
                  <SvgText key={i} x={l.x} y={CHART_H - 4} fontSize={6} fill="#475569" textAnchor="middle">
                    {l.label}
                  </SvgText>
                ))}
                {/* Glucose line */}
                {chartPoints.length >= 2 && (() => {
                  const d = buildPath(chartPoints);
                  const fillD = `${d} L ${chartPoints[chartPoints.length - 1].x} ${PAD_T + plotH} L ${chartPoints[0].x} ${PAD_T + plotH} Z`;
                  return (
                    <G>
                      <Path d={fillD} fill="url(#glucose_grad)" />
                      <Path d={d} stroke={GLUCOSE_COLOR} strokeWidth={1.5} fill="none"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </G>
                  );
                })()}
                {/* Context-coloured dots at each reading */}
                {chartPoints.map((pt, i) => (
                  <Circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill={pt.color} opacity={0.85} />
                ))}
              </Svg>
              {/* Pulsating glow at latest reading */}
              {latestPoint && (
                <GlowPulse color={GLUCOSE_COLOR} cx={latestPoint.x} cy={latestPoint.y} />
              )}
            </View>
            {/* Empty state */}
            {!hasData && (
              <View style={styles.emptyOverlay}>
                <Text style={styles.emptyText}>No glucose readings yet</Text>
                <Text style={styles.emptyHint}>Log blood sugar to see your trend</Text>
              </View>
            )}
          </Pressable>

          {/* Legend row */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: FASTING_COLOR }]} />
              <Text style={styles.legendLabel}>Fasting</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: POST_MEAL_COLOR }]} />
              <Text style={styles.legendLabel}>Post-meal</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: RANDOM_COLOR }]} />
              <Text style={styles.legendLabel}>Random</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: BEDTIME_COLOR }]} />
              <Text style={styles.legendLabel}>Bedtime</Text>
            </View>
            {latestDisplay != null && (
              <View style={[styles.legendItem, { marginLeft: 'auto' }]}>
                <Text style={[styles.legendValue, { color: GLUCOSE_COLOR }]}>{latestDisplay}</Text>
              </View>
            )}
            <View style={styles.legendTapHint}>
              <Text style={styles.legendTapText}>Tap chart →</Text>
            </View>
          </View>
        </>
      )}
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
    borderColor: '#2A1E00',
    shadowColor: GLUCOSE_COLOR,
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
  rangeTabs: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  rangeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#0A1520',
    borderWidth: 1,
    borderColor: '#1E3A4A',
  },
  rangeTabActive: { backgroundColor: `${GLUCOSE_COLOR}12`, borderColor: `${GLUCOSE_COLOR}60` },
  rangeTabText: { fontSize: 11, fontWeight: '700', color: '#475569', letterSpacing: 0.5 },
  rangeTabTextActive: { color: GLUCOSE_COLOR },
  chartContainer: {
    position: 'relative',
    backgroundColor: '#050F19',
    alignSelf: 'stretch',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 15, 25, 0.7)',
  },
  emptyText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginBottom: 4 },
  emptyHint: { fontSize: 11, color: '#475569', textAlign: 'center', paddingHorizontal: 32 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A1E00',
    flexWrap: 'wrap',
    backgroundColor: '#050F19',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.5 },
  legendValue: { fontSize: 10, fontWeight: '700' },
  legendTapHint: { marginLeft: 'auto' },
  legendTapText: { fontSize: 9, color: '#334155', fontStyle: 'italic' },
});
