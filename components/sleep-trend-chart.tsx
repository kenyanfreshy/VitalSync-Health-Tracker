/**
 * SleepTrendChart
 * A 7-day bar chart showing nightly total sleep duration.
 * Bars are color-coded green/amber/red relative to the user's sleep goal.
 * A dashed goal line is drawn at the goal height.
 * Styled with a 3D glass effect consistent with the VitalSync design system.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { SleepRecord } from '@/lib/health/types';
import type { useColors } from '@/hooks/use-colors';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 16; // matches scrollContent padding in log/sleep.tsx
const CHART_WIDTH = SCREEN_W - H_PAD * 2;
const CHART_HEIGHT = 90;
const BAR_AREA_HEIGHT = 68;
const BAR_AREA_TOP = 4;
const LABEL_HEIGHT = 18;
const DAYS = 7;
const BAR_GAP = 6;
const BAR_WIDTH = (CHART_WIDTH - BAR_GAP * (DAYS + 1)) / DAYS;

/** Return a short day label for a date offset from today (0 = today) */
function dayLabel(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetFromToday);
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
}

/** Return YYYY-MM-DD for a date offset from today */
function ymd(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Props = {
  records: SleepRecord[];
  goalHrs: number;
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
};

export function SleepTrendChart({ records, goalHrs, colors, isDark }: Props) {
  const dayMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of records) {
      const key = r.bedtime.slice(0, 10);
      map[key] = (map[key] ?? 0) + r.totalMinutes;
    }
    return map;
  }, [records]);

  const slots = useMemo(() => {
    return Array.from({ length: DAYS }, (_, i) => {
      const offset = DAYS - 1 - i;
      const key = ymd(offset);
      const mins = dayMap[key] ?? 0;
      const hrs = mins / 60;
      return { label: dayLabel(offset), hrs, isToday: offset === 0 };
    });
  }, [dayMap]);

  const maxHrs = Math.max(goalHrs * 1.25, ...slots.map(s => s.hrs), 1);
  const goalY = BAR_AREA_TOP + BAR_AREA_HEIGHT * (1 - goalHrs / maxHrs);

  const avgHrs = useMemo(() => {
    const withData = slots.filter(s => s.hrs > 0);
    if (withData.length === 0) return null;
    return withData.reduce((sum, s) => sum + s.hrs, 0) / withData.length;
  }, [slots]);
  const avgY = avgHrs !== null ? BAR_AREA_TOP + BAR_AREA_HEIGHT * (1 - avgHrs / maxHrs) : null;

  const barColor = (hrs: number): string => {
    if (hrs === 0) return isDark ? '#2D3748' : '#E5E7EB';
    const ratio = hrs / goalHrs;
    if (ratio >= 0.9) return '#22C55E';
    if (ratio >= 0.7) return '#F59E0B';
    return '#EF4444';
  };

  const gradId = (i: number) => `sleepBar${i}`;

  // 3D glass colours
  const glassBg = isDark
    ? 'rgba(30, 41, 59, 0.72)'
    : 'rgba(240, 244, 255, 0.80)';
  const glassBorder = isDark
    ? 'rgba(99, 102, 241, 0.30)'
    : 'rgba(99, 102, 241, 0.22)';
  const shimmer = isDark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(255, 255, 255, 0.55)';
  const shadow = isDark
    ? 'rgba(0, 0, 0, 0.45)'
    : 'rgba(99, 102, 241, 0.12)';

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: glassBg,
        borderColor: glassBorder,
        shadowColor: shadow,
      },
    ]}>
      {/* Top shimmer highlight — 3D glass top edge */}
      <View style={[styles.shimmerTop, { backgroundColor: shimmer }]} />
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: '#3B82F6' }]} />

      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
          7-Night Trend
        </Text>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={[styles.legendText, { color: isDark ? '#94A3B8' : '#64748B' }]}>≥ goal</Text>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B', marginLeft: 8 }]} />
          <Text style={[styles.legendText, { color: isDark ? '#94A3B8' : '#64748B' }]}>partial</Text>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444', marginLeft: 8 }]} />
          <Text style={[styles.legendText, { color: isDark ? '#94A3B8' : '#64748B' }]}>short</Text>
        </View>
      </View>

      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Defs>
          {slots.map((s, i) => (
            <LinearGradient key={i} id={gradId(i)} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={barColor(s.hrs)} stopOpacity="1" />
              <Stop offset="1" stopColor={barColor(s.hrs)} stopOpacity="0.50" />
            </LinearGradient>
          ))}
        </Defs>

        {/* Bars */}
        {slots.map((s, i) => {
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP);
          const barH = s.hrs > 0 ? Math.max(4, BAR_AREA_HEIGHT * (s.hrs / maxHrs)) : 3;
          const y = BAR_AREA_TOP + BAR_AREA_HEIGHT - barH;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={BAR_WIDTH}
              height={barH}
              rx={4}
              ry={4}
              fill={s.hrs > 0 ? `url(#${gradId(i)})` : (isDark ? '#2D3748' : '#E5E7EB')}
              opacity={s.isToday ? 1 : 0.85}
            />
          );
        })}

        {/* Goal dashed line */}
        <Line
          x1={BAR_GAP / 2}
          y1={goalY}
          x2={CHART_WIDTH - BAR_GAP / 2}
          y2={goalY}
          stroke={isDark ? '#60A5FA' : '#3B82F6'}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.7}
        />
        <SvgText
          x={CHART_WIDTH - BAR_GAP / 2}
          y={goalY - 3}
          fontSize={9}
          fill={isDark ? '#60A5FA' : '#3B82F6'}
          textAnchor="end"
          opacity={0.85}
        >
          {`${goalHrs}h goal`}
        </SvgText>

        {/* Weekly average dashed line */}
        {avgY !== null && avgHrs !== null && Math.abs(avgY - goalY) > 5 && (
          <>
            <Line
              x1={BAR_GAP / 2}
              y1={avgY}
              x2={CHART_WIDTH - BAR_GAP / 2}
              y2={avgY}
              stroke={isDark ? '#A78BFA' : '#7C3AED'}
              strokeWidth={1.2}
              strokeDasharray="3 4"
              opacity={0.65}
            />
            <SvgText
              x={BAR_GAP / 2 + 2}
              y={avgY - 3}
              fontSize={9}
              fill={isDark ? '#A78BFA' : '#7C3AED'}
              textAnchor="start"
              opacity={0.85}
            >
              {`avg ${avgHrs.toFixed(1)}h`}
            </SvgText>
          </>
        )}

        {/* Day labels */}
        {slots.map((s, i) => {
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
          return (
            <SvgText
              key={i}
              x={x}
              y={BAR_AREA_TOP + BAR_AREA_HEIGHT + LABEL_HEIGHT - 2}
              fontSize={9.5}
              fill={s.isToday ? '#3B82F6' : (isDark ? '#9CA3AF' : '#6B7280')}
              textAnchor="middle"
              fontWeight={s.isToday ? 'bold' : 'normal'}
            >
              {s.isToday ? 'Today' : s.label}
            </SvgText>
          );
        })}

        {/* Hour labels on bars */}
        {slots.map((s, i) => {
          if (s.hrs === 0) return null;
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
          const barH = Math.max(4, BAR_AREA_HEIGHT * (s.hrs / maxHrs));
          const y = BAR_AREA_TOP + BAR_AREA_HEIGHT - barH - 3;
          const label = s.hrs >= 1 ? `${Math.floor(s.hrs)}h` : `${Math.round(s.hrs * 60)}m`;
          return (
            <SvgText
              key={i}
              x={x}
              y={y}
              fontSize={8}
              fill={isDark ? '#E2E8F0' : '#374151'}
              textAnchor="middle"
              opacity={0.8}
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 6,
    marginBottom: 16,
    overflow: 'hidden',
    // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    // Android elevation
    elevation: 6,
  },
  shimmerTop: {
    height: 1.5,
    width: '70%',
    alignSelf: 'center',
    borderRadius: 1,
    marginBottom: 0,
  },
  accentBar: {
    height: 3,
    width: '100%',
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingTop: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 10,
    marginLeft: 3,
  },
});
