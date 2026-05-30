/**
 * Body Composition Detail Screen
 * Weight trend, muscle mass donut chart, BMI indicator.
 */

import React, { useMemo } from 'react';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import { ScrollView, StyleSheet, Text, View, Dimensions, useColorScheme } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { LineChart, normalizeData } from '@/components/charts/line-chart';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { detailStrings } from '@/lib/i18n';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { kgToLbs } from '@/lib/health/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

function DonutChart({ percentage, color, size = 120 }: { percentage: number; color: string; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <Svg width={size} height={size}>
      <G rotation="-90" origin={`${cx}, ${cy}`}>
        <Circle cx={cx} cy={cy} r={radius} stroke="#E0E0E6" strokeWidth={12} fill="none" />
        <Circle
          cx={cx} cy={cy} r={radius}
          stroke={color} strokeWidth={12} fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

function getBMICategory(bmi: number, d: { bmiUnderweight: string; bmiNormal: string; bmiOverweight: string; bmiObese: string }): { label: string; color: string } {
  if (bmi < 18.5) return { label: d.bmiUnderweight, color: '#0EA5E9' };
  if (bmi < 25) return { label: d.bmiNormal, color: '#10B981' };
  if (bmi < 30) return { label: d.bmiOverweight, color: '#F59E0B' };
  return { label: d.bmiObese, color: '#EF4444' };
}

function BodyCompositionDetailInner() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { state } = useHealth();
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  // Merge HealthKit bodyComposition records with manually logged vitalSigns that have weightKg
  const records = useMemo(() => {
    const hkRecords = state.data?.bodyComposition ?? [];
    const manualWeightRecords = (state.data?.vitalSigns ?? [])
      .filter((r) => r.weightKg != null)
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        weightKg: r.weightKg!,
        // manual entries won't have muscle/fat/BMI unless HealthKit provides them
        muscleMassKg: undefined as number | undefined,
        fatMassKg: undefined as number | undefined,
        bmi: undefined as number | undefined,
      }));
    // Merge and sort by timestamp; deduplicate by id
    const seen = new Set<string>();
    return [...hkRecords, ...manualWeightRecords]
      .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [state.data]);
  const latest = records[records.length - 1];

  const weightData = useMemo(() => normalizeData(records.map((r) => r.weightKg)), [records]);

  const musclePercent = latest?.muscleMassKg && latest?.weightKg
    ? (latest.muscleMassKg / latest.weightKg) * 100
    : 0;
  const fatPercent = latest?.fatMassKg && latest?.weightKg
    ? (latest.fatMassKg / latest.weightKg) * 100
    : 0;

  const weeklyDelta = records.length >= 7
    ? (records[records.length - 1].weightKg - records[records.length - 7].weightKg).toFixed(1)
    : null;

  const bmiCategory = latest?.bmi ? getBMICategory(latest.bmi, d) : null;
  const { weightUnit } = useUnitPreferences();
  const displayWeight = (kg: number | undefined) =>
    kg == null ? '—' : weightUnit === 'lbs' ? kgToLbs(kg).toFixed(1) : kg.toFixed(1);

  return (
    <ScreenContainer containerClassName="bg-background">
      <DetailHeader
        title={d.bodyTitle}
        subtitle={`${records.length} ${d.readings}`}
        accentColor={colors.bodyBlue}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ─── Hero ───────────────────────────────────────────────────────── */}
        <View style={[styles.heroCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={[styles.accentBar, { backgroundColor: colors.bodyBlue }]} />
          <View style={styles.heroRow}>
            {/* Weight */}
            <View style={styles.heroLeft}>
              <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.weight}</Text>
              <View style={styles.heroValueRow}>
                <Text style={[styles.heroValue, { color: colors.foreground }]}>
                  {displayWeight(latest?.weightKg)}
                </Text>
                <Text style={[styles.heroUnit, { color: colors.muted }]}>{weightUnit}</Text>
              </View>
              {weeklyDelta !== null && (() => {
                const deltaKg = parseFloat(weeklyDelta);
                const deltaDisplay = weightUnit === 'lbs'
                  ? (deltaKg * 2.20462).toFixed(1)
                  : weeklyDelta;
                return (
                  <Text style={[styles.delta, {
                    color: deltaKg < 0 ? colors.bpGreen : colors.bpAmber,
                  }]}>
                    {deltaKg >= 0 ? '+' : ''}{deltaDisplay} {weightUnit} this week
                  </Text>
                );
              })()}
            </View>

            {/* Donut */}
            <View style={styles.donutWrap}>
              <DonutChart percentage={musclePercent} color={colors.bodyBlue} size={110} />
              <View style={styles.donutCenter}>
                <Text style={[styles.donutValue, { color: colors.foreground }]}>
                  {musclePercent.toFixed(0)}%
                </Text>
                <Text style={[styles.donutLabel, { color: colors.muted }]}>{d.muscle.toLowerCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ─── Weight Trend ────────────────────────────────────────────────── */}
        <View style={[styles.chartCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.06,
        }]}>
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.avgWeight} (30 {d.days30.split(' ')[1] ?? 'days'})</Text>
          <LineChart
            data={weightData}
            width={CHART_WIDTH - 32}
            height={130}
            color={colors.bodyBlue}
            strokeWidth={2.5}
            showGradient
          />
        </View>

        {/* ─── Composition Breakdown ───────────────────────────────────────── */}
        <View style={[styles.breakdownCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.06,
        }]}>
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.compositionBreakdown}</Text>
          <View style={styles.breakdownRow}>
            {[
              { label: d.muscle, value: displayWeight(latest?.muscleMassKg), unit: weightUnit, pct: musclePercent, color: colors.bodyBlue },
              { label: d.fat, value: displayWeight(latest?.fatMassKg), unit: weightUnit, pct: fatPercent, color: colors.bpAmber },
              { label: d.other, value: latest ? displayWeight(latest.weightKg - (latest.muscleMassKg ?? 0) - (latest.fatMassKg ?? 0)) : '—', unit: weightUnit, pct: 100 - musclePercent - fatPercent, color: colors.muted },
            ].map((item) => (
              <View key={item.label} style={styles.breakdownItem}>
                <View style={[styles.breakdownBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.breakdownFill, { height: `${Math.max(item.pct, 2)}%`, backgroundColor: item.color }]} />
                </View>
                <Text style={[styles.breakdownValue, { color: colors.foreground }]}>{item.value}</Text>
                <Text style={[styles.breakdownUnit, { color: colors.muted }]}>{item.unit}</Text>
                <Text style={[styles.breakdownLabel, { color: colors.muted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ─── BMI ────────────────────────────────────────────────────────── */}
        {latest?.bmi && bmiCategory && (
          <View style={[styles.bmiCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
            shadowColor: isDark ? '#000' : colors.shadowBase,
            shadowOpacity: isDark ? 0.45 : 0.06,
          }]}>
            <View style={styles.bmiRow}>
              <View>
                <Text style={[styles.heroLabel, { color: colors.muted }]}>BMI</Text>
                <Text style={[styles.bmiValue, { color: colors.foreground }]}>{latest.bmi}</Text>
              </View>
              <View style={[styles.bmiCategoryBadge, {
                backgroundColor: bmiCategory.color + '20',
                borderColor: bmiCategory.color + '40',
              }]}>
                <Text style={[styles.bmiCategoryText, { color: bmiCategory.color }]}>
                  {bmiCategory.label}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  heroCard: {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, justifyContent: 'space-between' },
  heroLeft: { flex: 1 },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroValue: { fontSize: 48, fontWeight: '800', letterSpacing: -2 },
  heroUnit: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  delta: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  donutWrap: { position: 'relative', width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  donutLabel: { fontSize: 10, fontWeight: '500' },
  chartCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chartTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  breakdownCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 140 },
  breakdownItem: { alignItems: 'center', gap: 4, flex: 1 },
  breakdownBar: { width: 32, height: 100, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' },
  breakdownFill: { width: '100%', borderRadius: 8 },
  breakdownValue: { fontSize: 14, fontWeight: '700' },
  breakdownUnit: { fontSize: 10, fontWeight: '500' },
  breakdownLabel: { fontSize: 11, fontWeight: '500' },
  bmiCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  bmiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bmiValue: { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  bmiCategoryBadge: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  bmiCategoryText: { fontSize: 14, fontWeight: '700' },
});

export default withDetailErrorBoundary(BodyCompositionDetailInner, 'Body Composition');
