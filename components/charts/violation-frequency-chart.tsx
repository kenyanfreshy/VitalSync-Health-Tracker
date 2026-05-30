/**
 * ViolationFrequencyChart
 * Mini bar chart showing threshold violations per day over the last 30 days.
 * Each bar is color-coded by the dominant vital category for that day.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, G } from 'react-native-svg';
import { useColorScheme, useColors } from '@/hooks';
import type { AlertHistoryEntry } from '@/lib/notifications/alert-history';

interface DayBucket {
  date: string;       // YYYY-MM-DD
  count: number;
  dominantColor: string;
}

interface Props {
  history: AlertHistoryEntry[];
  width?: number;
  height?: number;
}

const VITAL_COLORS: Record<string, string> = {
  bp:        '#10B981',
  hrv:       '#818CF8',
  heartRate: '#EF4444',
  spo2:      '#0EA5E9',
  glucose:   '#DC2626',
  analyte:   '#2563EB',
};

const LEGEND_ITEMS: { key: string; label: string; color: string }[] = [
  { key: 'bp',        label: 'BP',      color: '#10B981' },
  { key: 'hrv',       label: 'HRV',     color: '#818CF8' },
  { key: 'heartRate', label: 'HR',      color: '#EF4444' },
  { key: 'spo2',      label: 'SpO₂',    color: '#0EA5E9' },
  { key: 'glucose',   label: 'Glucose', color: '#DC2626' },
  { key: 'analyte',   label: 'Lab',     color: '#2563EB' },
];

function buildDayBuckets(history: AlertHistoryEntry[], days = 30): DayBucket[] {
  const now = new Date();
  const buckets: DayBucket[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    buckets.push({ date: key, count: 0, dominantColor: '#94A3B8' });
  }

  // Tally violations per day
  const countMap = new Map<string, { count: number; colorCounts: Record<string, number> }>();
  for (const entry of history) {
    const day = entry.timestamp.split('T')[0];
    if (!countMap.has(day)) countMap.set(day, { count: 0, colorCounts: {} });
    const bucket = countMap.get(day)!;
    bucket.count++;
    const color = VITAL_COLORS[entry.category] ?? '#94A3B8';
    bucket.colorCounts[color] = (bucket.colorCounts[color] ?? 0) + 1;
  }

  for (const bucket of buckets) {
    const data = countMap.get(bucket.date);
    if (data) {
      bucket.count = data.count;
      // Pick the color with the most violations on this day
      const dominant = Object.entries(data.colorCounts).sort((a, b) => b[1] - a[1])[0];
      if (dominant) bucket.dominantColor = dominant[0];
    }
  }

  return buckets;
}

export function ViolationFrequencyChart({ history, width = 320, height = 80 }: Props) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const buckets = useMemo(() => buildDayBuckets(history, 30), [history]);
  const maxCount = useMemo(() => Math.max(1, ...buckets.map((b) => b.count)), [buckets]);

  const BAR_COUNT = buckets.length;
  const GAP = 2;
  const barWidth = (width - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
  const chartHeight = height - 20; // reserve 20px for day labels

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        <G>
          {buckets.map((bucket, i) => {
            const barH = bucket.count === 0 ? 2 : Math.max(4, (bucket.count / maxCount) * chartHeight);
            const x = i * (barWidth + GAP);
            const y = chartHeight - barH;
            const isToday = i === BAR_COUNT - 1;

            return (
              <G key={bucket.date}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={barWidth / 3}
                  fill={bucket.count === 0
                    ? (isDark ? '#2D3748' : '#E2E8F0')
                    : bucket.dominantColor + (isDark ? 'CC' : 'DD')}
                />
                {/* Today indicator dot */}
                {isToday && (
                  <Rect
                    x={x + barWidth / 2 - 2}
                    y={chartHeight + 6}
                    width={4}
                    height={4}
                    rx={2}
                    fill={colors.primary}
                  />
                )}
              </G>
            );
          })}
        </G>
      </Svg>

      {/* X-axis labels: first, mid, last */}
      <View style={[styles.labels, { width }]}>
        <Text style={[styles.label, { color: colors.muted }]}>
          {formatShortDate(buckets[0]?.date)}
        </Text>
        <Text style={[styles.label, { color: colors.muted }]}>
          {formatShortDate(buckets[Math.floor(BAR_COUNT / 2)]?.date)}
        </Text>
        <Text style={[styles.label, { color: colors.muted }]}>Today</Text>
      </View>

      {/* Colour legend — only show categories present in this history slice */}
      {(() => {
        const presentCats = new Set(history.map((e) => e.category));
        const visibleItems = (LEGEND_ITEMS.filter((item) => presentCats.has(item.key as any)) as any[])
        if (visibleItems.length === 0) return null;
        return (
          <View style={[styles.legend, { width }]}>
            {visibleItems.map((item) => (
              <View key={item.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={[styles.legendText, { color: colors.muted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        );
      })()}
    </View>
  );
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
