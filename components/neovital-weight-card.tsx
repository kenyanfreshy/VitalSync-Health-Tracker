/**
 * NeoVitalWeightCard
 *
 * Weight trend graph in the NeoVital style:
 * - Dark #050F19 background, particle layer, grid, neon waveform
 * - Purple neon (#A855F7) for weight line with gradient fill
 * - Lighter 7-day moving average line in dim purple
 * - Pulsating GlowPulse dot at latest reading
 * - 24h / 7d / 30d / 90d range tabs
 * - Legend row with latest value in user's unit (kg or lbs)
 * - Collapsible, default collapsed, persisted via AsyncStorage
 * - Taps to the weight log screen
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
import { useUnitPreferences } from '@/hooks/use-unit-preferences';

// ─── Chart constants ──────────────────────────────────────────────────────────
const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 20;
const CHART_H = 160;

// ─── Neon colours ─────────────────────────────────────────────────────────────
const WEIGHT_COLOR = '#A855F7';   // purple neon — main line
const AVG_COLOR = '#6D28D9';      // dim purple — 7-day moving average

// ─── Time range config ────────────────────────────────────────────────────────
type RangeKey = '24h' | '7d' | '30d' | '90d';
const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7  * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
];
const RANGE_STORAGE_KEY = '@neovital_weight_range_v1';
const COLLAPSED_STORAGE_KEY = '@neovital_weight_collapsed_v1';

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

/** Simple 7-point moving average */
function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, start + window);
    const slice = values.slice(start, end);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
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
  color: [WEIGHT_COLOR, AVG_COLOR, '#00F5FF', '#FF2D78'][i % 4],
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
export function NeoVitalWeightCard() {
  const router = useRouter();
  const { state } = useHealth();
  const { weightUnit } = useUnitPreferences();

  const [chartWidth, setChartWidth] = useState(Dimensions.get('window').width - 32);
  const handleChartLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) setChartWidth(w);
  }, []);

  const plotW = chartWidth - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  // ── Persisted state ─────────────────────────────────────────────────────────
  const [range, setRangeState] = useState<RangeKey>('30d');
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
    () => RANGES.find((r) => r.key === range)?.ms ?? 30 * 24 * 60 * 60 * 1000,
    [range],
  );

  interface WeightPoint {
    timestamp: string;
    kg: number;
    display: number; // in user's unit
  }

  const series = useMemo<WeightPoint[]>(() => {
    const records = state.data?.weight ?? [];
    const cutoff = Date.now() - rangeMs;
    return records
      .filter((r) => new Date(r.timestamp).getTime() >= cutoff && r.weightKg != null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((r) => ({
        timestamp: r.timestamp,
        kg: r.weightKg,
        display: weightUnit === 'lbs' ? r.weightLbs ?? r.weightKg * 2.20462 : r.weightKg,
      }));
  }, [state.data?.weight, rangeMs, weightUnit]);

  const hasData = series.length > 0;

  // ── Dynamic Y range (tight around actual data) ──────────────────────────────
  const { yMin, yMax } = useMemo(() => {
    if (series.length === 0) {
      return weightUnit === 'lbs'
        ? { yMin: 100, yMax: 300 }
        : { yMin: 40, yMax: 150 };
    }
    const vals = series.map((s) => s.display);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.15, weightUnit === 'lbs' ? 5 : 2);
    return { yMin: lo - pad, yMax: hi + pad };
  }, [series, weightUnit]);

  // ── Chart points ────────────────────────────────────────────────────────────
  const chartPoints = useMemo(() =>
    series.map((s, idx) => ({
      x: toX(idx, series.length, plotW),
      y: toY(s.display, yMin, yMax, plotH),
    })),
  [series, plotW, plotH, yMin, yMax]);

  // ── 7-day moving average points ─────────────────────────────────────────────
  const avgPoints = useMemo(() => {
    if (series.length < 3) return [];
    const avgs = movingAverage(series.map((s) => s.display));
    return avgs.map((avg, idx) => ({
      x: toX(idx, series.length, plotW),
      y: toY(avg, yMin, yMax, plotH),
    }));
  }, [series, plotW, plotH, yMin, yMax]);

  const latestPoint = chartPoints[chartPoints.length - 1];
  const latestRecord = series[series.length - 1];

  // ── Latest display value ────────────────────────────────────────────────────
  const latestDisplay = useMemo(() => {
    if (!latestRecord) return null;
    return weightUnit === 'lbs'
      ? `${latestRecord.display.toFixed(1)} lbs`
      : `${latestRecord.display.toFixed(1)} kg`;
  }, [latestRecord, weightUnit]);

  // ── Y-axis labels ────────────────────────────────────────────────────────────
  const yLabels = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps }, (_, i) => {
      const val = yMin + ((yMax - yMin) / steps) * (i + 0.5);
      return {
        val,
        label: weightUnit === 'lbs' ? `${Math.round(val)}` : `${val.toFixed(0)}`,
      };
    });
  }, [yMin, yMax, weightUnit]);

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
        accessibilityLabel={collapsed ? 'Expand weight trend' : 'Collapse weight trend'}
        style={({ pressed }) => [styles.cardHeader, { opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.cardTitle}>WEIGHT TREND</Text>
          <Text style={styles.cardSub}>
            {hasData
              ? `${series.length} reading${series.length !== 1 ? 's' : ''} · ${range}`
              : 'Log weight to begin'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: hasData ? WEIGHT_COLOR : '#FF2D78' }]} />
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
            onPress={() => router.push('/log/weight')}
            accessibilityRole="button"
            accessibilityLabel="Open weight log"
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
                  <LinearGradient id="weight_grad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={WEIGHT_COLOR} stopOpacity="0.18" />
                    <Stop offset="1" stopColor={WEIGHT_COLOR} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <GridBackground width={chartWidth} height={CHART_H} plotW={plotW} />
                {/* Y-axis labels */}
                {yLabels.map((yl) => {
                  const y = toY(yl.val, yMin, yMax, plotH);
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
                {/* Weight line with gradient fill */}
                {chartPoints.length >= 2 && (() => {
                  const d = buildPath(chartPoints);
                  const fillD = `${d} L ${chartPoints[chartPoints.length - 1].x} ${PAD_T + plotH} L ${chartPoints[0].x} ${PAD_T + plotH} Z`;
                  return (
                    <G>
                      <Path d={fillD} fill="url(#weight_grad)" />
                      <Path d={d} stroke={WEIGHT_COLOR} strokeWidth={1.5} fill="none"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </G>
                  );
                })()}
                {/* 7-day moving average line */}
                {avgPoints.length >= 2 && (
                  <Path
                    d={buildPath(avgPoints)}
                    stroke={AVG_COLOR}
                    strokeWidth={1}
                    fill="none"
                    strokeDasharray="4,3"
                    strokeLinecap="round"
                    opacity={0.7}
                  />
                )}
              </Svg>
              {/* Pulsating glow at latest reading */}
              {latestPoint && (
                <GlowPulse color={WEIGHT_COLOR} cx={latestPoint.x} cy={latestPoint.y} />
              )}
            </View>
            {/* Empty state */}
            {!hasData && (
              <View style={styles.emptyOverlay}>
                <Text style={styles.emptyText}>No weight readings yet</Text>
                <Text style={styles.emptyHint}>Log your weight to see your trend</Text>
              </View>
            )}
          </Pressable>

          {/* Legend row */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: WEIGHT_COLOR }]} />
              <Text style={styles.legendLabel}>Weight</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { backgroundColor: AVG_COLOR }]} />
              <Text style={styles.legendLabel}>7d avg</Text>
            </View>
            {latestDisplay != null && (
              <View style={[styles.legendItem, { marginLeft: 'auto' }]}>
                <Text style={[styles.legendValue, { color: WEIGHT_COLOR }]}>{latestDisplay}</Text>
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
    borderColor: '#2D1B4E',
    shadowColor: WEIGHT_COLOR,
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
  rangeTabActive: { backgroundColor: `${WEIGHT_COLOR}12`, borderColor: `${WEIGHT_COLOR}60` },
  rangeTabText: { fontSize: 11, fontWeight: '700', color: '#475569', letterSpacing: 0.5 },
  rangeTabTextActive: { color: WEIGHT_COLOR },
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
    borderTopColor: '#2D1B4E',
    flexWrap: 'wrap',
    backgroundColor: '#050F19',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendDash: { width: 12, height: 2, borderRadius: 1 },
  legendLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.5 },
  legendValue: { fontSize: 10, fontWeight: '700' },
  legendTapHint: { marginLeft: 'auto' },
  legendTapText: { fontSize: 9, color: '#334155', fontStyle: 'italic' },
});
