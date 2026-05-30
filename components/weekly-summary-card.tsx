/**
 * WeeklySummaryCard
 * A collapsible card showing per-metric sparkline trends for the selected date range.
 * Appears below the vital grid on the Dashboard.
 */

import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  useColorScheme,
  ActionSheetIOS,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/glass-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Sparkline } from '@/components/charts/sparkline';
import { useColors } from '@/hooks';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import { HealthData, kgToLbs } from '@/lib/health/types';
import { DateRangeDays, getCutoffTimestamp } from '@/lib/health/date-range';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';

const WEEKLY_SUMMARY_KEY = 'weekly-summary-expanded';

interface MetricSummary {
  label: string;
  unit: string;
  color: string;
  data: (number | null)[];
  latest: number | null | undefined;
  avg: number | null | undefined;
  trend: 'up' | 'down' | 'flat';
}

function computeTrend(data: (number | null)[]): 'up' | 'down' | 'flat' {
  const nums = data.filter((n): n is number => n != null);
  if (nums.length < 2) return 'flat';
  const first = nums.slice(0, Math.ceil(nums.length / 2));
  const last = nums.slice(Math.floor(nums.length / 2));
  const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
  const lastAvg = last.reduce((a, b) => a + b, 0) / last.length;
  const pct = ((lastAvg - firstAvg) / (firstAvg || 1)) * 100;
  if (pct > 1.5) return 'up';
  if (pct < -1.5) return 'down';
  return 'flat';
}

function avg(arr: (number | null | undefined)[]): number | null {
  const nums = arr.filter((n): n is number => n != null);
  if (!nums.length) return null;
  return parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

function buildMetrics(
  data: HealthData | null | undefined,
  days: DateRangeDays,
  colors: ReturnType<typeof useColors>,
  weightUnit: 'kg' | 'lbs' = 'kg'
): MetricSummary[] {
  if (!data) return [];
  const cutoffISO = new Date(getCutoffTimestamp(days)).toISOString();

  // Blood Pressure — systolic series
  const bpSeries = (data.bloodPressure ?? [])
    .filter((r) => r.timestamp >= cutoffISO)
    .map((r) => r.systolic);

  // Pulse — BPM series
  const pulseSeries = (data.pulse ?? [])
    .filter((r) => r.timestamp >= cutoffISO)
    .map((r) => r.bpm);

  // HRV series
  const hrvSeries = (data.pulse ?? [])
    .filter((r) => r.timestamp >= cutoffISO && r.hrv !== undefined)
    .map((r) => r.hrv as number);

  // Weight series — respect user unit preference
  const weightSeries = (data.bodyComposition ?? [])
    .filter((r) => r.timestamp >= cutoffISO)
    .map((r) => weightUnit === 'lbs' ? parseFloat(kgToLbs(r.weightKg).toFixed(1)) : r.weightKg);

  // Sleep efficiency series
  const sleepSeries = (data.sleep ?? [])
    .filter((r) => r.bedtime >= cutoffISO)
    .map((r) => r.efficiency);

  return [
    {
      label: 'Systolic BP',
      unit: 'mmHg',
      color: colors.bpGreen,
      data: bpSeries,
      latest: bpSeries.at(-1) ?? null,
      avg: avg((bpSeries).filter((n): n is number => n != null)),
      trend: computeTrend(bpSeries),
    },
    {
      label: 'Heart Rate',
      unit: 'bpm',
      color: colors.heartRed,
      data: pulseSeries,
      latest: pulseSeries.at(-1) ?? null,
      avg: avg((pulseSeries).filter((n): n is number => n != null)),
      trend: computeTrend(pulseSeries),
    },
    {
      label: 'HRV',
      unit: 'ms',
      color: colors.accent,
      data: hrvSeries,
      latest: hrvSeries.at(-1) ?? null,
      avg: avg((hrvSeries).filter((n): n is number => n != null)),
      trend: computeTrend(hrvSeries),
    },
    {
      label: 'Weight',
      unit: weightUnit,
      color: colors.bodyBlue,
      data: weightSeries,
      latest: weightSeries.at(-1) ?? null,
      avg: avg((weightSeries).filter((n): n is number => n != null)),
      trend: computeTrend(weightSeries),
    },
    {
      label: 'Sleep Eff.',
      unit: '%',
      color: colors.sleepPurple,
      data: sleepSeries,
      latest: sleepSeries.at(-1) ?? null,
      avg: avg((sleepSeries).filter((n): n is number => n != null)),
      trend: computeTrend(sleepSeries),
    },
  ].filter((m) => m.data.length >= 2); // Only show metrics with enough data
}

interface WeeklySummaryCardProps {
  data: HealthData | null | undefined;
  dateRange: DateRangeDays;
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
}

export function WeeklySummaryCard({ data, dateRange, defaultExpanded = false, overrideExpanded }: WeeklySummaryCardProps) {
  const colors = useColors();
  const { dietType, setDietType } = useDietType();
  const activeDiet = DIET_TYPE_OPTIONS.find(o => o.value === dietType);

  function handleProtocolLongPress() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const options = DIET_TYPE_OPTIONS.map(o => `${o.emoji}  ${o.label}`);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Switch Dietary Protocol',
          options: [...options, 'Cancel'],
          cancelButtonIndex: options.length,
        },
        (idx) => {
          if (idx < options.length) {
            setDietType(DIET_TYPE_OPTIONS[idx].value);
          }
        }
      );
    } else {
      // Android / web: Alert with buttons for each option
      Alert.alert(
        'Switch Dietary Protocol',
        'Choose a protocol to activate:',
        [
          ...DIET_TYPE_OPTIONS.map(o => ({
            text: `${o.emoji}  ${o.label}`,
            onPress: () => setDietType(o.value),
            style: (o.value === dietType ? 'default' : 'default') as 'default',
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = overrideExpanded === false ? false : localExpanded;
  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.getItem(WEEKLY_SUMMARY_KEY).then(v => {
      if (v !== null) setLocalExpanded(v === 'true');
    }).catch(() => {});
  }, []);
  const { weightUnit } = useUnitPreferences();

  const metrics = buildMetrics(data, dateRange, colors, weightUnit);

  // Compute last-night sleep hours for the collapsed header chip
  const lastNightSleepHours = React.useMemo(() => {
    if (!data?.sleep?.length) return null;
    // Find the most recent sleep record
    const sorted = [...data.sleep].sort((a, b) =>
      b.bedtime.localeCompare(a.bedtime)
    );
    const latest = sorted[0];
    if (!latest) return null;
    const mins = latest.totalMinutes ?? (() => {
      // Fallback: derive from bedtime/wakeTime
      const bed = new Date(latest.bedtime).getTime();
      const wake = new Date(latest.wakeTime).getTime();
      return isNaN(bed) || isNaN(wake) ? null : Math.round((wake - bed) / 60000);
    })();
    if (mins == null || mins <= 0) return null;
    return parseFloat((mins / 60).toFixed(1));
  }, [data]);

  // Compute last-synced label from the most recent entry across all data types
  const lastSyncedLabel = React.useMemo(() => {
    if (!data) return null;
    const timestamps: string[] = [
      ...(data.bloodPressure ?? []).map(r => r.timestamp),
      ...(data.pulse ?? []).map(r => r.timestamp),
      ...(data.bodyComposition ?? []).map(r => r.timestamp),
      ...(data.sleep ?? []).map(r => r.bedtime),
    ];
    if (!timestamps.length) return null;
    const latest = new Date(timestamps.sort().at(-1)!);
    const diffMs = Date.now() - latest.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return diffMin <= 1 ? 'just now' : `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  }, [data]);

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setLocalExpanded((v) => {
      const next = !v;
      safeSetItem(WEEKLY_SUMMARY_KEY, String(next)).catch(() => {});
      return next;
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const trendIcon = (t: 'up' | 'down' | 'flat') =>
    t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
  const trendColor = (t: 'up' | 'down' | 'flat', color: string) =>
    t === 'flat' ? colors.muted : color;

  return (
    <GlassCard
      accentColor={colors.primary}
      noPadding
      style={styles.card}
    >
      {/* Header */}
      <Pressable style={styles.header} onPress={handleToggle}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
          <IconSymbol name="chart.bar.fill" size={14} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {dateRange}d Summary
        </Text>
        <Text style={[styles.metaCount, { color: colors.muted }]}>
          {metrics.length} metrics{lastSyncedLabel ? ` · ${lastSyncedLabel}` : ''}
        </Text>
        {!expanded && lastNightSleepHours !== null && (
          <View style={[styles.sleepChip, { backgroundColor: colors.sleepPurple + '18', borderColor: colors.sleepPurple + '40' }]}>
            <Text style={[styles.sleepChipText, { color: colors.sleepPurple }]}>
              {`🌙 ${lastNightSleepHours} hrs`}
            </Text>
          </View>
        )}
        {activeDiet && (
          <Pressable
            onLongPress={handleProtocolLongPress}
            delayLongPress={400}
            style={({ pressed }) => [
              styles.protocolBadge,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.protocolBadgeText, { color: colors.muted }]}>
              {activeDiet.emoji} {activeDiet.label}
            </Text>
          </Pressable>
        )}
        <IconSymbol
          name="chevron.right"
          size={14}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {/* Compact summary pills — shown when collapsed */}
      {!expanded && metrics.length > 0 && (
        <View style={[styles.compactRow, { borderTopColor: isDark ? colors.borderStrong : colors.border }]}>
          {metrics.slice(0, 4).map((m) => (
            <View key={m.label} style={[styles.compactPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.compactLabel, { color: colors.muted }]}>{m.label.replace('Systolic ', '')}</Text>
              <Text style={[styles.compactValue, { color: m.color }]}>
                {m.latest != null ? `${m.latest}` : '—'}
                <Text style={[styles.compactUnit, { color: colors.muted }]}> {m.unit}</Text>
              </Text>
            </View>
          ))}
        </View>
      )}
      {/* Body — sparkline rows */}
      {expanded && metrics.length > 0 && (
        <View
          style={[
            styles.body,
            { borderTopColor: isDark ? colors.borderStrong : colors.border },
          ]}
        >
          {metrics.map((m, idx) => (
            <View
              key={m.label}
              style={[
                styles.row,
                {
                  borderBottomColor: isDark ? colors.borderStrong : colors.border,
                  borderBottomWidth: idx < metrics.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              {/* Label + avg */}
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                  {m.label}
                </Text>
                <Text style={[styles.rowAvg, { color: colors.muted }]}>
                  avg {m.avg ?? '—'} {m.unit}
                </Text>
              </View>

              {/* Sparkline */}
              <Sparkline
                data={m.data.filter((n): n is number => n != null)}
                width={72}
                height={26}
                color={m.color}
                strokeWidth={1.6}
                showGradient
              />

              {/* Latest + trend */}
              <View style={styles.rowRight}>
                <Text style={[styles.rowLatest, { color: m.color }]}>
                  {m.latest ?? '—'}
                </Text>
                <Text
                  style={[
                    styles.rowTrend,
                    { color: trendColor(m.trend, m.color) },
                  ]}
                >
                  {trendIcon(m.trend)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {expanded && metrics.length === 0 && (
        <View
          style={[
            styles.emptyBody,
            { borderTopColor: isDark ? colors.borderStrong : colors.border },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Not enough data for the selected range. Sync your device to populate trends.
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  metaCount: {
    fontSize: 11,
    fontWeight: '500',
    marginRight: 2,
  },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  rowLeft: {
    flex: 1,
    minWidth: 80,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowAvg: {
    fontSize: 10,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
  rowLatest: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  rowTrend: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  emptyBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  protocolBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
  },
  protocolBadgeText: { fontSize: 10, fontWeight: '600' },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  compactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  compactPill: {
    flex: 1,
    minWidth: '22%',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  compactLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  compactValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  compactUnit: {
    fontSize: 10,
    fontWeight: '400',
  },
  sleepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sleepChipText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
