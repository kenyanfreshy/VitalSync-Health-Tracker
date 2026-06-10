/**
 * WellnessSummarySection — Weekly & Monthly Wellness Summary
 *
 * Displays historical averages for all tracked vitals over the past 7 days
 * and past 30 days. Uses only observed/logged data — no predictions, no
 * causation language, no medical claims.
 *
 * Design: 3D glossy glassmorphism cards matching the rest of the app.
 * Each metric row has a colored icon, label, value, and a small trend arrow.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/glass-card';
import { useColorScheme, useCorrelationStrings } from '@/hooks';
import type { HealthData } from '@/lib/health/types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetricSummary {
  icon: string;
  label: string;
  value: string;
  unit: string;
  trend: 'up' | 'down' | 'stable' | 'none';
  accentColor: string;
  available: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function cutoffDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Compare current vs previous period to derive a trend direction.
 * threshold: minimum % change to count as up/down (default 3%)
 */
function periodTrend(
  current: number | null,
  previous: number | null,
  threshold = 0.03,
): 'up' | 'down' | 'stable' | 'none' {
  if (current == null) return 'none';
  if (previous == null) return 'stable';
  const delta = (current - previous) / Math.abs(previous);
  if (delta > threshold) return 'up';
  if (delta < -threshold) return 'down';
  return 'stable';
}

function trendArrow(trend: 'up' | 'down' | 'stable' | 'none'): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  if (trend === 'stable') return '→';
  return '';
}

function trendColor(trend: 'up' | 'down' | 'stable' | 'none', accentColor: string, isDark: boolean): string {
  if (trend === 'none') return isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  return accentColor;
}

// ─── Compute summaries from HealthData ───────────────────────────────────────
function computeSummaries(data: HealthData, daysBack: number, cs: ReturnType<typeof useCorrelationStrings>): MetricSummary[] {
  const cutoff = cutoffDate(daysBack);
  const prevCutoff = cutoffDate(daysBack * 2); // previous period of equal length

  // ── Blood Pressure ──────────────────────────────────────────────────────────
  const allBP = data.bloodPressure ?? [];
  const bpCurr = allBP.filter(r => new Date(r.timestamp) >= cutoff);
  const bpPrev = allBP.filter(r => { const d = new Date(r.timestamp); return d >= prevCutoff && d < cutoff; });
  const systolicVals = bpCurr.map(r => r.systolic).filter((v): v is number => v != null && v > 0);
  const diastolicVals = bpCurr.map(r => r.diastolic).filter((v): v is number => v != null && v > 0);
  const avgSys = avg(systolicVals);
  const avgDia = avg(diastolicVals);
  const prevSys = avg(bpPrev.map(r => r.systolic).filter((v): v is number => v != null && v > 0));

  // ── Heart Rate ───────────────────────────────────────────────────────────────
  const allPulse = data.pulse ?? [];
  const hrCurr = allPulse.filter(r => new Date(r.timestamp) >= cutoff);
  const hrPrev = allPulse.filter(r => { const d = new Date(r.timestamp); return d >= prevCutoff && d < cutoff; });
  const hrVals = hrCurr.map(r => r.bpm).filter((v): v is number => v != null && v > 0);
  const avgHR = avg(hrVals);
  const prevHR = avg(hrPrev.map(r => r.bpm).filter((v): v is number => v != null && v > 0));

  // ── Sleep ────────────────────────────────────────────────────────────────────
  const allSleep = data.sleep ?? [];
  const sleepCurr = allSleep.filter(r => new Date(r.bedtime) >= cutoff);
  const sleepPrev = allSleep.filter(r => { const d = new Date(r.bedtime); return d >= prevCutoff && d < cutoff; });
  const sleepMins = sleepCurr.map(r => r.totalMinutes ?? 0).filter(v => v > 0);
  const avgSleep = avg(sleepMins);
  const prevSleep = avg(sleepPrev.map(r => r.totalMinutes ?? 0).filter(v => v > 0));

  // ── Blood Sugar ──────────────────────────────────────────────────────────────
  const allBS = data.bloodSugar ?? [];
  const bsCurr = allBS.filter(r => new Date(r.timestamp) >= cutoff);
  const bsPrev = allBS.filter(r => { const d = new Date(r.timestamp); return d >= prevCutoff && d < cutoff; });
  const bsVals = bsCurr.map(r => r.glucoseMgDl).filter((v): v is number => v != null && v > 0);
  const avgBS = avg(bsVals);
  const prevBS = avg(bsPrev.map(r => r.glucoseMgDl).filter((v): v is number => v != null && v > 0));

  // ── Weight ───────────────────────────────────────────────────────────────────
  const allWeight = data.weight ?? [];
  const weightCurr = allWeight.filter(r => new Date(r.timestamp) >= cutoff);
  const weightPrev = allWeight.filter(r => { const d = new Date(r.timestamp); return d >= prevCutoff && d < cutoff; });
  const weightVals = weightCurr.map(r => r.weightLbs > 0 ? r.weightLbs : (r.weightKg ? r.weightKg * 2.205 : 0)).filter(v => v > 0);
  const avgWeight = avg(weightVals);
  const prevWeight = avg(weightPrev.map(r => r.weightLbs > 0 ? r.weightLbs : (r.weightKg ? r.weightKg * 2.205 : 0)).filter(v => v > 0));

  // ── Activity (steps) ─────────────────────────────────────────────────────────
  const allAct = data.activity ?? [];
  const actCurr = allAct.filter(r => new Date(r.timestamp) >= cutoff);
  const actPrev = allAct.filter(r => { const d = new Date(r.timestamp); return d >= prevCutoff && d < cutoff; });
  const stepVals = actCurr.map(r => r.steps ?? 0).filter((v): v is number => v > 0);
  const avgSteps = avg(stepVals);
  const prevSteps = avg(actPrev.map(r => r.steps ?? 0).filter((v): v is number => v > 0));

  // ── Sodium ───────────────────────────────────────────────────────────────────
  const allSodium = data.sodiumIntake ?? [];
  const sodiumCurr = allSodium.filter(r => new Date(r.timestamp) >= cutoff);
  const sodiumPrev = allSodium.filter(r => { const d = new Date(r.timestamp); return d >= prevCutoff && d < cutoff; });
  const sodiumVals = sodiumCurr.map(r => r.sodiumMg).filter((v): v is number => v != null && v > 0);
  const avgSodium = avg(sodiumVals);
  const prevSodium = avg(sodiumPrev.map(r => r.sodiumMg).filter((v): v is number => v != null && v > 0));

  // ── HRV (from pulse records) ─────────────────────────────────────────────────
  const hrvVals = hrCurr.map(r => r.hrv ?? 0).filter(v => v > 0);
  const avgHRV = avg(hrvVals);
  const prevHRV = avg(hrPrev.map(r => r.hrv ?? 0).filter(v => v > 0));

  return [
    {
      icon: '❤️',
      label: cs.wellnessMetricBloodPressure ?? 'Blood Pressure',
      value: avgSys && avgDia ? `${Math.round(avgSys)}/${Math.round(avgDia)}` : '—',
      unit: 'mmHg',
      trend: periodTrend(avgSys, prevSys),
      accentColor: '#F43F5E',
      available: !!avgSys,
    },
    {
      icon: '💓',
      label: cs.wellnessMetricHeartRate ?? 'Heart Rate',
      value: avgHR ? `${Math.round(avgHR)}` : '—',
      unit: 'bpm',
      trend: periodTrend(avgHR, prevHR),
      accentColor: '#EC4899',
      available: !!avgHR,
    },
    {
      icon: '🌙',
      label: cs.wellnessMetricSleep ?? 'Sleep',
      value: avgSleep ? `${(avgSleep / 60).toFixed(1)}` : '—',
      unit: 'hrs',
      trend: periodTrend(avgSleep, prevSleep),
      accentColor: '#8B5CF6',
      available: !!avgSleep,
    },
    {
      icon: '🩸',
      label: cs.wellnessMetricBloodGlucose ?? 'Blood Glucose',
      value: avgBS ? `${Math.round(avgBS)}` : '—',
      unit: 'mg/dL',
      trend: periodTrend(avgBS, prevBS),
      accentColor: '#F59E0B',
      available: !!avgBS,
    },
    {
      icon: '⚖️',
      label: cs.wellnessMetricWeight ?? 'Weight',
      value: avgWeight ? `${avgWeight.toFixed(1)}` : '—',
      unit: 'lbs',
      trend: periodTrend(avgWeight, prevWeight),
      accentColor: '#06B6D4',
      available: !!avgWeight,
    },
    {
      icon: '👟',
      label: cs.wellnessMetricSteps ?? 'Steps',
      value: avgSteps ? `${Math.round(avgSteps).toLocaleString()}` : '—',
      unit: '/day',
      trend: periodTrend(avgSteps, prevSteps),
      accentColor: '#10B981',
      available: !!avgSteps,
    },
    {
      icon: '🧂',
      label: cs.wellnessMetricSodium ?? 'Sodium',
      value: avgSodium ? `${Math.round(avgSodium)}` : '—',
      unit: 'mg',
      trend: periodTrend(avgSodium, prevSodium),
      accentColor: '#F97316',
      available: !!avgSodium,
    },
    {
      icon: '📊',
      label: cs.wellnessMetricHRV ?? 'HRV',
      value: avgHRV ? `${Math.round(avgHRV)}` : '—',
      unit: 'ms',
      trend: periodTrend(avgHRV, prevHRV),
      accentColor: '#6366F1',
      available: !!avgHRV,
    },
  ];
}

// ─── MetricRow ────────────────────────────────────────────────────────────────
function MetricRow({ metric, isDark }: { metric: MetricSummary; isDark: boolean }) {
  const textColor = isDark ? '#E8EEFF' : '#0F172A';
  const mutedColor = isDark ? 'rgba(180,200,255,0.45)' : 'rgba(0,0,0,0.45)';
  const rowBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[styles.metricRow, { backgroundColor: rowBg, borderColor }]}>
      {/* Icon + label */}
      <View style={styles.metricLeft}>
        <View style={[styles.metricIconWrap, { backgroundColor: metric.accentColor + '18' }]}>
          <Text style={styles.metricIcon}>{metric.icon}</Text>
        </View>
        <Text style={[styles.metricLabel, { color: mutedColor }]}>{metric.label}</Text>
      </View>
      {/* Value + trend */}
      <View style={styles.metricRight}>
        {metric.available ? (
          <>
            <Text style={[styles.metricValue, { color: textColor }]}>{metric.value}</Text>
            <Text style={[styles.metricUnit, { color: mutedColor }]}>{metric.unit}</Text>
            {metric.trend !== 'none' && (
              <Text style={[styles.metricTrend, { color: trendColor(metric.trend, metric.accentColor, isDark) }]}>
                {trendArrow(metric.trend)}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.metricNoData, { color: mutedColor }]}>—</Text>
        )}
      </View>
    </View>
  );
}

// ─── WellnessSummarySection ───────────────────────────────────────────────────
interface WellnessSummarySectionProps {
  data: HealthData;
}

export function WellnessSummarySection({ data }: WellnessSummarySectionProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const cs = useCorrelationStrings();
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');
  const [expanded, setExpanded] = useState(false);

  const daysBack = activeTab === 'weekly' ? 7 : 30;
  const summaries = useMemo(() => computeSummaries(data, daysBack, cs), [data, daysBack, cs]);
  const availableCount = summaries.filter(m => m.available).length;

  const textColor = isDark ? '#E8EEFF' : '#0F172A';
  const mutedColor = isDark ? 'rgba(180,200,255,0.45)' : 'rgba(0,0,0,0.45)';
  const tabActiveBg = isDark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.12)';
  const tabInactiveBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const tabActiveColor = isDark ? '#A5B4FC' : '#4338CA';
  const tabInactiveColor = mutedColor;

  return (
    <GlassCard accentColor="#6366F1" noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
      {/* Section header */}
      <Pressable
        style={[styles.sectionHeader, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }]}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(e => !e);
        }}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(180,200,255,0.55)' : 'rgba(0,0,0,0.45)' }]}>
            📊 {cs.wellnessSummaryLabel ?? 'WELLNESS SUMMARY'}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: mutedColor }]}>
            {availableCount > 0
              ? `${availableCount} ${cs.wellnessSummaryMetrics ?? 'metrics tracked'} · ${activeTab === 'weekly' ? (cs.wellnessSummaryWeekly ?? 'Last 7 days') : (cs.wellnessSummaryMonthly ?? 'Last 30 days')}`
              : (cs.wellnessSummaryNoData ?? 'Log data to see your summary')}
          </Text>
        </View>
        <Text style={[styles.sectionChevron, {
          color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
          transform: [{ rotate: expanded ? '90deg' : '0deg' }],
        }]}>›</Text>
      </Pressable>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Tab switcher */}
          <View style={styles.tabRow}>
            {(['weekly', 'monthly'] as const).map(tab => {
              const active = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: active ? tabActiveBg : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                      borderColor: active ? tabActiveColor + '60' : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab(tab);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, { color: active ? tabActiveColor : tabInactiveColor, fontWeight: active ? '700' : '500' }]}>
                    {tab === 'weekly' ? (cs.wellnessSummaryWeekly ?? 'Last 7 Days') : (cs.wellnessSummaryMonthly ?? 'Last 30 Days')}
                  </Text>
                  {active && (
                    <View style={[styles.tabUnderline, { backgroundColor: tabActiveColor }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Period label */}
          <Text style={[styles.periodLabel, { color: mutedColor }]}>
            {cs.wellnessSummaryHistoricalAvg ?? 'Historical averages — observed data only'}
          </Text>

          {/* Metric rows */}
          <View style={styles.metricsContainer}>
            {summaries.map((metric, i) => (
              <MetricRow key={i} metric={metric} isDark={isDark} />
            ))}
          </View>

          {/* Disclaimer */}
          <Text style={[styles.disclaimer, { color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)' }]}>
            {cs.wellnessSummaryDisclaimer ?? 'Averages based on your logged data. For informational purposes only — not medical advice.'}
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
  sectionChevron: {
    fontSize: 20,
    fontWeight: '300',
  },
  expandedContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabText: {
    fontSize: 12,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  tabUnderline: {
    height: 2,
    width: '50%',
    borderRadius: 1,
    marginTop: 4,
  },
  periodLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  metricsContainer: {
    gap: 6,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  metricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  metricIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIcon: {
    fontSize: 15,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  metricRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '500',
  },
  metricTrend: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricNoData: {
    fontSize: 15,
    fontWeight: '400',
  },
  disclaimer: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 14,
  },
});
