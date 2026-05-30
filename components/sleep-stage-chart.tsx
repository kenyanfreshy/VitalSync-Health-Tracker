/**
 * SleepStageChart — NeoVitals Edition
 *
 * A vibrant, dark-glassmorphism sleep stage chart rendered with react-native-svg.
 * Four lanes (Awake / REM / Core / Deep) with rich gradient fills, glow accents,
 * and a neon-on-dark aesthetic inspired by NeoVitals / modern health wearable UIs.
 *
 * Color palette:
 *   Deep  — indigo/violet  #6366F1 → #4F46E5  (slow-wave, restorative)
 *   Core  — sky blue       #38BDF8 → #0EA5E9  (light NREM)
 *   REM   — electric cyan  #22D3EE → #06B6D4  (dream sleep)
 *   Awake — coral/rose     #F87171 → #EF4444  (wakefulness)
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Text as SvgText,
  Line,
  Defs,
  LinearGradient,
  Stop,
  G,
  Circle,
} from 'react-native-svg';
import type { SleepRecord } from '@/lib/health/types';

// ─── Color palette ────────────────────────────────────────────────────────────

const LANE_COLORS = {
  awake: { from: '#FF6B8A', to: '#F43F5E', label: '#FF6B8A', glow: 'rgba(244,63,94,0.35)' },
  rem:   { from: '#22D3EE', to: '#06B6D4', label: '#22D3EE', glow: 'rgba(6,182,212,0.35)'  },
  core:  { from: '#38BDF8', to: '#0EA5E9', label: '#38BDF8', glow: 'rgba(14,165,233,0.30)' },
  deep:  { from: '#818CF8', to: '#4F46E5', label: '#818CF8', glow: 'rgba(99,102,241,0.40)' },
};

const LANES: { key: keyof typeof LANE_COLORS; label: string; emoji: string }[] = [
  { key: 'awake', label: 'Awake', emoji: '☀️' },
  { key: 'rem',   label: 'REM',   emoji: '💤' },
  { key: 'core',  label: 'Core',  emoji: '🌊' },
  { key: 'deep',  label: 'Deep',  emoji: '🌑' },
];

// ─── Layout constants ─────────────────────────────────────────────────────────

const LANE_H       = 30;
const LANE_GAP     = 8;
const LABEL_W      = 52;
const AXIS_H       = 22;
const PADDING_TOP  = 6;
const PADDING_SIDE = 6;
const BAR_RADIUS   = 8;
const TICK_COUNT   = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatMins(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Segment builder ──────────────────────────────────────────────────────────

interface Segment {
  lane: keyof typeof LANE_COLORS;
  startMin: number;
  durationMin: number;
}

function buildSegments(record: SleepRecord): Segment[] {
  const total = record.totalMinutes ?? 0;
  const deep  = Math.min(record.deepMinutes  ?? 0, total);
  const rem   = Math.min(record.remMinutes   ?? 0, total - deep);
  const awake = Math.min(record.awakeMinutes ?? 0, total - deep - rem);
  const core  = record.coreMinutes != null
    ? Math.min(record.coreMinutes, total - deep - rem - awake)
    : Math.max(0, total - deep - rem - awake);

  const segs: Segment[] = [];
  let cursor = 0;
  const push = (lane: keyof typeof LANE_COLORS, dur: number) => {
    if (dur > 0) { segs.push({ lane, startMin: cursor, durationMin: dur }); cursor += dur; }
  };

  // Realistic sleep architecture: deep → core → rem → deep → core → rem → core → awake
  const d1 = Math.round(deep  * 0.55);
  const d2 = deep - d1;
  const r1 = Math.round(rem   * 0.45);
  const r2 = rem - r1;
  const c1 = Math.round(core  * 0.35);
  const c2 = Math.round(core  * 0.30);
  const c3 = core - c1 - c2;

  push('deep',  d1);
  push('core',  c1);
  push('rem',   r1);
  push('deep',  d2);
  push('core',  c2);
  push('rem',   r2);
  push('core',  c3);
  push('awake', awake);

  return segs.filter(s => s.durationMin > 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SleepStageChartProps {
  record: SleepRecord;
  width?: number;
  isDark?: boolean;
}

export function SleepStageChart({ record, width = 320, isDark = true }: SleepStageChartProps) {
  const total = record.totalMinutes ?? 0;
  // All hooks must be called unconditionally (Rules of Hooks)
  const chartW = width - LABEL_W - PADDING_SIDE * 2;
  const chartH = LANES.length * LANE_H + (LANES.length - 1) * LANE_GAP;
  const svgH   = PADDING_TOP + chartH + AXIS_H + 4;

  const segments = useMemo(() => buildSegments(record), [record]);
  const safeTotal = Math.max(total, 1);
  const toX      = (mins: number) => (mins / safeTotal) * chartW;
  const laneIdx: Record<string, number> = { awake: 0, rem: 1, core: 2, deep: 3 };

  const ticks = useMemo(() => {
    const result: { x: number; label: string }[] = [];
    const bedMs    = new Date(record.bedtime).getTime();
    const interval = total / (TICK_COUNT - 1);
    for (let i = 0; i < TICK_COUNT; i++) {
      const mins = i * interval;
      result.push({
        x: toX(mins),
        label: formatHHMM(new Date(bedMs + mins * 60000).toISOString()),
      });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.bedtime, total]);

  // Early return after all hooks are declared
  if (total <= 0) return null;

  // Derived core minutes for summary
  const coreDisplay = record.coreMinutes != null
    ? record.coreMinutes
    : Math.max(0, total - (record.deepMinutes ?? 0) - (record.remMinutes ?? 0) - (record.awakeMinutes ?? 0));

  const bg       = isDark ? '#0A0E1A' : '#EEF2FF';
  const gridLine = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const axisText = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.30)';
  const laneText = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.50)';
  const trackFill = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const textPrimary = isDark ? '#F9FAFB' : '#111827';
  const textMuted   = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)';

  return (
    <View style={[styles.wrapper, { backgroundColor: bg, width }]}>
      {/* Neon accent border top */}
      <View style={styles.accentBorder} />

      {/* Summary header */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: textPrimary }]}>
            {formatMins(total)}
          </Text>
          <Text style={[styles.summaryLabel, { color: textMuted }]}>Total</Text>
        </View>
        {(record.deepMinutes ?? 0) > 0 && (
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: LANE_COLORS.deep.label }]}>
              {formatMins(record.deepMinutes ?? 0)}
            </Text>
            <Text style={[styles.summaryLabel, { color: textMuted }]}>Deep</Text>
          </View>
        )}
        {(record.remMinutes ?? 0) > 0 && (
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: LANE_COLORS.rem.label }]}>
              {formatMins(record.remMinutes ?? 0)}
            </Text>
            <Text style={[styles.summaryLabel, { color: textMuted }]}>REM</Text>
          </View>
        )}
        {coreDisplay > 0 && (
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: LANE_COLORS.core.label }]}>
              {formatMins(coreDisplay)}
            </Text>
            <Text style={[styles.summaryLabel, { color: textMuted }]}>Core</Text>
          </View>
        )}
        {(record.awakeMinutes ?? 0) > 0 && (
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: LANE_COLORS.awake.label }]}>
              {formatMins(record.awakeMinutes ?? 0)}
            </Text>
            <Text style={[styles.summaryLabel, { color: textMuted }]}>Awake</Text>
          </View>
        )}
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: textPrimary }]}>
            {record.efficiency}%
          </Text>
          <Text style={[styles.summaryLabel, { color: textMuted }]}>Eff.</Text>
        </View>
      </View>

      {/* SVG chart */}
      <Svg width={width} height={svgH}>
        <Defs>
          {LANES.map(({ key }) => (
            <LinearGradient key={key} id={`grad_${key}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0"   stopColor={LANE_COLORS[key].from} stopOpacity="1"    />
              <Stop offset="1"   stopColor={LANE_COLORS[key].to}   stopOpacity="0.80" />
            </LinearGradient>
          ))}
          {/* Glow gradients (horizontal, for neon edge effect) */}
          {LANES.map(({ key }) => (
            <LinearGradient key={`glow_${key}`} id={`glow_${key}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"   stopColor={LANE_COLORS[key].from} stopOpacity="0"    />
              <Stop offset="0.1" stopColor={LANE_COLORS[key].from} stopOpacity="0.6"  />
              <Stop offset="0.9" stopColor={LANE_COLORS[key].to}   stopOpacity="0.6"  />
              <Stop offset="1"   stopColor={LANE_COLORS[key].to}   stopOpacity="0"    />
            </LinearGradient>
          ))}
        </Defs>

        <G x={PADDING_SIDE + LABEL_W} y={PADDING_TOP}>
          {/* Vertical grid lines */}
          {ticks.map((tick, i) => (
            <Line
              key={i}
              x1={tick.x} y1={0}
              x2={tick.x} y2={chartH}
              stroke={gridLine}
              strokeWidth={1}
              strokeDasharray="3,5"
            />
          ))}

          {/* Lane background tracks */}
          {LANES.map(({ key }, i) => {
            const trackY = i * (LANE_H + LANE_GAP) + (LANE_H - 6) / 2;
            return (
              <Rect
                key={key}
                x={0} y={trackY}
                width={chartW} height={6}
                rx={3}
                fill={trackFill}
              />
            );
          })}

          {/* Segments with glow underlay */}
          {segments.map((seg, idx) => {
            const li  = laneIdx[seg.lane];
            const x   = toX(seg.startMin);
            const w   = Math.max(toX(seg.durationMin), BAR_RADIUS * 2);
            const y   = li * (LANE_H + LANE_GAP);
            return (
              <G key={idx}>
                {/* Glow underlay (slightly larger, blurred via opacity) */}
                <Rect
                  x={x - 2} y={y + 2}
                  width={w + 4} height={LANE_H - 4}
                  rx={BAR_RADIUS + 2}
                  fill={LANE_COLORS[seg.lane].glow}
                />
                {/* Main bar */}
                <Rect
                  x={x} y={y}
                  width={w} height={LANE_H}
                  rx={BAR_RADIUS}
                  fill={`url(#grad_${seg.lane})`}
                />
                {/* Top highlight (glass sheen) */}
                <Rect
                  x={x + 2} y={y + 2}
                  width={Math.max(w - 4, 4)} height={LANE_H / 3}
                  rx={BAR_RADIUS - 2}
                  fill="rgba(255,255,255,0.18)"
                />
              </G>
            );
          })}
        </G>

        {/* Lane labels (left column) with colored dots */}
        {LANES.map(({ key, label }, i) => {
          const y = PADDING_TOP + i * (LANE_H + LANE_GAP) + LANE_H / 2 + 4;
          return (
            <G key={key}>
              <Circle
                cx={PADDING_SIDE + 6}
                cy={y - 4}
                r={3}
                fill={LANE_COLORS[key].label}
              />
              <SvgText
                x={PADDING_SIDE + LABEL_W - 4}
                y={y}
                textAnchor="end"
                fontSize={10}
                fontWeight="600"
                fill={laneText}
              >
                {label}
              </SvgText>
            </G>
          );
        })}

        {/* Time axis */}
        {ticks.map((tick, i) => (
          <SvgText
            key={i}
            x={PADDING_SIDE + LABEL_W + tick.x}
            y={PADDING_TOP + chartH + AXIS_H - 4}
            textAnchor="middle"
            fontSize={9}
            fill={axisText}
          >
            {tick.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 0,
    paddingBottom: 4,
  },
  accentBorder: {
    height: 2,
    backgroundColor: '#6366F1',
    opacity: 0.7,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
