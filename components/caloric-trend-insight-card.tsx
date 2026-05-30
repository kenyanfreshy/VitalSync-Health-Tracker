/**
 * CaloricTrendInsightCard
 *
 * Feeds the last 7 days of DailyNutrients (plus optional BP/glucose context)
 * into the server's analyzeTrends LLM endpoint and surfaces a natural-language
 * clinical insight panel.
 *
 * Usage:
 *   <CaloricTrendInsightCard
 *     sodiumIntake={state.data.sodiumIntake}
 *     bloodPressure={state.data.bloodPressure}
 *     bloodSugar={state.data.bloodSugar}
 *   />
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';

import * as Haptics from 'expo-haptics';
import { useColors, useFoodCameraStrings } from '@/hooks';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { trpc } from '@/lib/trpc';
import { getLastNDaysNutrients } from '@/lib/health/daily-nutrients';
import type { SodiumRecord, BloodPressureRecord, BloodSugarRecord } from '@/lib/health/types';

// Platform-specific branding: Apple Intelligence on iOS, Gemini on Android
const INSIGHT_BRAND = Platform.OS === 'ios' ? 'Apple Intelligence' : Platform.OS === 'android' ? 'Gemini' : 'Smart';
// Platform logo emoji — Apple logo on iOS, Google color dots on Android
const INSIGHT_BRAND_LOGO = Platform.OS === 'ios' ? '' : Platform.OS === 'android' ? '🌐' : '🤖';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrendDirection = 'improving' | 'stable' | 'worsening' | 'mixed';
type RiskLevel = 'low' | 'moderate' | 'high';

interface InsightResult {
  headline: string;
  insight: string;
  recommendations: string[];
  trend_direction: TrendDirection;
  risk_level: RiskLevel;
  disclaimer: string;
  analyzed_days: number;
  avg_calories: number;
  avg_sodium_mg: number;
  avg_glycemic_load: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trendIcon(dir: TrendDirection): 'arrow.up.right' | 'arrow.down.right' | 'minus.circle' | 'arrow.clockwise' {
  switch (dir) {
    case 'improving': return 'arrow.up.right';
    case 'worsening': return 'arrow.down.right';
    case 'stable': return 'minus.circle';
    default: return 'arrow.clockwise';
  }
}

function trendColor(dir: TrendDirection, colors: ReturnType<typeof useColors>): string {
  switch (dir) {
    case 'improving': return colors.success;
    case 'worsening': return colors.error;
    case 'stable': return colors.primary;
    default: return colors.warning;
  }
}

function riskColor(level: RiskLevel, colors: ReturnType<typeof useColors>): string {
  switch (level) {
    case 'low': return colors.success;
    case 'high': return colors.error;
    default: return colors.warning;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  sodiumIntake: SodiumRecord[];
  bloodPressure?: BloodPressureRecord[];
  bloodSugar?: BloodSugarRecord[];
}

export function CaloricTrendInsightCard({ sodiumIntake, bloodPressure, bloodSugar }: Props) {
  const colors = useColors();
  const fc = useFoodCameraStrings();
  const { dietType: userDietType } = useDietType();
  const dietLabel = DIET_TYPE_OPTIONS.find(o => o.value === userDietType)?.label ?? 'Diet';
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeTrends = trpc.caloricTrends.analyzeTrends.useMutation();

  // Build 7-day nutrients from DASH Diet logs
  const last7Days = useMemo(() => getLastNDaysNutrients(sodiumIntake, 7), [sodiumIntake]);

  // Compute optional BP/glucose context averages
  const { avgSystolic, avgDiastolic, avgGlucoseMgDl } = useMemo(() => {
    const bpRecent = (bloodPressure ?? []).slice(-7);
    const bgRecent = (bloodSugar ?? []).slice(-7);

    const avgSys = bpRecent.length
      ? Math.round(bpRecent.reduce((s, r) => s + (r.systolic ?? 0), 0) / bpRecent.length)
      : undefined;
    const avgDia = bpRecent.length
      ? Math.round(bpRecent.reduce((s, r) => s + (r.diastolic ?? 0), 0) / bpRecent.length)
      : undefined;
    const avgBg = bgRecent.length
      ? Math.round(bgRecent.reduce((s, r) => s + r.glucoseMgDl, 0) / bgRecent.length)
      : undefined;

    return { avgSystolic: avgSys, avgDiastolic: avgDia, avgGlucoseMgDl: avgBg };
  }, [bloodPressure, bloodSugar]);

  const handleAnalyze = useCallback(async () => {
    if (last7Days.length === 0) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    try {
      const res = await analyzeTrends.mutateAsync({
        days: last7Days,
        avgSystolic,
        avgDiastolic,
        avgGlucoseMgDl,
      });
      setResult(res as InsightResult);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Analysis failed. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [last7Days, avgSystolic, avgDiastolic, avgGlucoseMgDl, analyzeTrends]);

  // Not enough data
  if (last7Days.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <IconSymbol name="chart.bar.fill" size={16} color={colors.muted} />
          <Text style={[styles.brandLogo, { color: colors.muted }]}>{INSIGHT_BRAND_LOGO}</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{INSIGHT_BRAND} Caloric Trend Analysis</Text>
        </View>
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {(fc.logDietMealPrompt ?? 'Log at least one {diet} meal with nutritional data to unlock {brand} trend analysis.').replace('{diet}', dietLabel).replace('{brand}', INSIGHT_BRAND)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <IconSymbol name="chart.bar.fill" size={16} color={colors.primary} />
        <Text style={[styles.brandLogo, { color: colors.primary }]}>{INSIGHT_BRAND_LOGO}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{INSIGHT_BRAND} Caloric Trend Analysis</Text>
        <View style={[styles.daysBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
          <Text style={[styles.daysBadgeText, { color: colors.primary }]}>
            {last7Days.length}d data
          </Text>
        </View>
      </View>

      {/* Analyze button */}
      {!result && (
        <TouchableOpacity
          style={[
            styles.analyzeBtn,
            { backgroundColor: colors.primary, opacity: analyzeTrends.isPending ? 0.7 : 1 },
          ]}
          onPress={handleAnalyze}
          disabled={analyzeTrends.isPending}
        >
          {analyzeTrends.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <IconSymbol name="sparkles" size={15} color="#fff" />
          )}
          <Text style={styles.analyzeBtnText}>
            {analyzeTrends.isPending ? 'Analysing…' : 'Analyse My Nutrition Trends'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Error */}
      {error ? (
        <View style={[styles.errorRow, { backgroundColor: colors.error + '12', borderColor: colors.error + '44' }]}>
          <IconSymbol name="exclamationmark.circle.fill" size={14} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      {/* Result */}
      {result ? (
        <>
          {/* Trend direction + risk level badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.trendBadge, { backgroundColor: trendColor(result.trend_direction as TrendDirection, colors) + '18', borderColor: trendColor(result.trend_direction as TrendDirection, colors) + '55' }]}>
              <IconSymbol name={trendIcon(result.trend_direction as TrendDirection)} size={13} color={trendColor(result.trend_direction as TrendDirection, colors)} />
              <Text style={[styles.badgeText, { color: trendColor(result.trend_direction as TrendDirection, colors) }]}>
                {result.trend_direction.charAt(0).toUpperCase() + result.trend_direction.slice(1)}
              </Text>
            </View>
            <View style={[styles.trendBadge, { backgroundColor: riskColor(result.risk_level as RiskLevel, colors) + '18', borderColor: riskColor(result.risk_level as RiskLevel, colors) + '55' }]}>
              <Text style={[styles.badgeText, { color: riskColor(result.risk_level as RiskLevel, colors) }]}>
                {result.risk_level.charAt(0).toUpperCase() + result.risk_level.slice(1)} Risk
              </Text>
            </View>
          </View>

          {/* Averages summary row */}
          <View style={[styles.avgRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.avgItem}>
              <Text style={[styles.avgBig, { color: colors.foreground }]}>{result.avg_calories}</Text>
              <Text style={[styles.avgLabel, { color: colors.muted }]}>avg kcal/d</Text>
            </View>
            <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
            <View style={styles.avgItem}>
              <Text style={[styles.avgBig, { color: result.avg_sodium_mg > 2300 ? colors.error : colors.foreground }]}>
                {result.avg_sodium_mg}
              </Text>
              <Text style={[styles.avgLabel, { color: colors.muted }]}>avg mg Na/d</Text>
            </View>
            <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
            <View style={styles.avgItem}>
              <Text style={[styles.avgBig, { color: result.avg_glycemic_load > 80 ? colors.warning : colors.foreground }]}>
                {result.avg_glycemic_load}
              </Text>
              <Text style={[styles.avgLabel, { color: colors.muted }]}>avg GL/d</Text>
            </View>
          </View>

          {/* Headline */}
          <Text style={[styles.headline, { color: colors.foreground }]}>{result.headline}</Text>

          {/* Clinical insight */}
          <Text style={[styles.insight, { color: colors.foreground }]}>{result.insight}</Text>

          {/* Recommendations */}
          {result.recommendations.length > 0 ? (
            <View style={[styles.recsBox, { backgroundColor: colors.primary + '0C', borderColor: colors.primary + '33' }]}>
              <Text style={[styles.recsTitle, { color: colors.primary }]}>Recommendations</Text>
              {result.recommendations.map((rec, i) => (
                <View key={i} style={styles.recRow}>
                  <IconSymbol name="checkmark.circle.fill" size={13} color={colors.success} />
                  <Text style={[styles.recText, { color: colors.foreground }]}>{rec}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Disclaimer */}
          <Text style={[styles.disclaimer, { color: colors.muted }]}>{result.disclaimer}</Text>

          {/* Re-analyse button */}
          <TouchableOpacity
            style={[styles.reanalyzeBtn, { borderColor: colors.primary + '55' }]}
            onPress={() => { setResult(null); handleAnalyze(); }}
            disabled={analyzeTrends.isPending}
          >
            <IconSymbol name="arrow.clockwise" size={13} color={colors.primary} />
            <Text style={[styles.reanalyzeBtnText, { color: colors.primary }]}>Re-analyse</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    fontSize: 14,
    lineHeight: 18,
    marginRight: -2,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  daysBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  daysBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  avgRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  avgItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  avgDivider: {
    width: 1,
  },
  avgBig: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  avgLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  headline: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  insight: {
    fontSize: 14,
    lineHeight: 21,
  },
  recsBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  recsTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  recText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  reanalyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  reanalyzeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
