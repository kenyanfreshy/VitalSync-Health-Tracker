/**
 * SleepStageDonut — Compact stage breakdown donut chart
 *
 * Renders a small SVG donut showing the proportion of each sleep stage
 * (Deep / REM / Core / Awake) for a single night. Uses the same NeoVitals
 * color palette as SleepStageChart so the two visuals feel cohesive.
 *
 * Renders nothing when no stage data is present (all values are 0 or undefined).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { SleepRecord } from '@/lib/health/types';

// ─── Color palette (matches SleepStageChart) ─────────────────────────────────
const STAGE_COLORS = {
  deep:  '#6366F1',   // indigo
  rem:   '#22D3EE',   // cyan
  core:  '#38BDF8',   // sky
  awake: '#F87171',   // coral
} as const;

const STAGE_LABELS: { key: keyof typeof STAGE_COLORS; label: string }[] = [
  { key: 'deep',  label: 'Deep'  },
  { key: 'rem',   label: 'REM'   },
  { key: 'core',  label: 'Core'  },
  { key: 'awake', label: 'Awake' },
];

// ─── Donut math ───────────────────────────────────────────────────────────────
const SIZE   = 72;
const STROKE = 10;
const R      = (SIZE - STROKE) / 2;
const CIRC   = 2 * Math.PI * R;
const CX     = SIZE / 2;
const CY     = SIZE / 2;

interface Segment {
  key: keyof typeof STAGE_COLORS;
  label: string;
  minutes: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

function buildSegments(record: SleepRecord): Segment[] {
  const raw = {
    deep:  record.deepMinutes  ?? 0,
    rem:   record.remMinutes   ?? 0,
    core:  record.coreMinutes  ?? 0,
    awake: record.awakeMinutes ?? 0,
  };
  const total = raw.deep + raw.rem + raw.core + raw.awake;
  if (total === 0) return [];

  const segments: Segment[] = [];
  let offset = 0; // dashOffset starts at 0 (top of circle, rotated -90° via transform)

  for (const { key, label } of STAGE_LABELS) {
    const mins = raw[key];
    if (mins <= 0) {
      // Still need to advance offset even for zero-length segments
      continue;
    }
    const fraction = mins / total;
    const dash = fraction * CIRC;
    const gap  = CIRC - dash;
    segments.push({
      key,
      label,
      minutes: mins,
      color: STAGE_COLORS[key],
      dashArray: `${dash} ${gap}`,
      dashOffset: CIRC - offset,
    });
    offset += dash;
  }

  return segments;
}

// ─── Legend item ──────────────────────────────────────────────────────────────
function LegendItem({ color, label, minutes }: { color: string; label: string; minutes: number }) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View>
        <Text style={[styles.legendLabel, { color: '#94A3B8' }]}>{label}</Text>
        <Text style={[styles.legendTime, { color: '#CBD5E1' }]}>{timeStr}</Text>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  record: SleepRecord;
  isDark?: boolean;
}

export function SleepStageDonut({ record, isDark = false }: Props) {
  const segments = useMemo(() => buildSegments(record), [record]);

  // Don't render if no stage data
  if (segments.length === 0) return null;

  const totalStageMinutes = segments.reduce((s, seg) => s + seg.minutes, 0);
  const totalHrs = Math.floor(totalStageMinutes / 60);
  const totalMins = totalStageMinutes % 60;
  const centerLabel = totalHrs > 0 ? `${totalHrs}h\n${totalMins}m` : `${totalMins}m`;

  const textColor = isDark ? '#E2E8F0' : '#1E293B';
  const mutedColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={styles.container}>
      {/* Donut SVG */}
      <View style={styles.donutWrap}>
        <Svg width={SIZE} height={SIZE}>
          {/* Background track */}
          <Circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
            strokeWidth={STROKE}
          />
          {/* Stage segments */}
          <G rotation="-90" origin={`${CX}, ${CY}`}>
            {segments.map((seg) => (
              <Circle
                key={seg.key}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="round"
              />
            ))}
          </G>
        </Svg>
        {/* Center label */}
        <View style={styles.centerLabel}>
          <Text style={[styles.centerText, { color: textColor }]} numberOfLines={2}>
            {centerLabel}
          </Text>
          <Text style={[styles.centerSub, { color: mutedColor }]}>stages</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {segments.map((seg) => (
          <LegendItem
            key={seg.key}
            color={seg.color}
            label={seg.label}
            minutes={seg.minutes}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  donutWrap: {
    width: SIZE,
    height: SIZE,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  centerSub: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 1,
  },
  legend: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    minWidth: 60,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 3,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  legendTime: {
    fontSize: 10,
    lineHeight: 14,
  },
});
