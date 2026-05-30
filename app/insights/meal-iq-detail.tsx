/**
 * Meal IQ Deep-Dive Screen
 *
 * Displays a rich correlation analysis for a Meal IQ Insight or Correlation
 * event from the Personal Narrative. Shows:
 *   - Impact score gauge
 *   - BP and glucose impact summary
 *   - Correlation type explanation
 *   - Time-series chart of glucose or BP over time with meal marker
 *   - Educational insight text
 */
import { safeFormatTime } from '@/lib/utils';
import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { useColors, useLang } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import { bpUrgency, glucoseUrgency } from '@/lib/health/clinical-narrative';
import { disclaimerStrings, mealIqStrings, toStaticLang } from '@/lib/i18n';
// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

interface BarChartProps {
  points: { label: string; value: number; urgency: string }[];
  maxValue: number;
  unit: string;
  accentColor: string;
  mealMarkerIndex?: number;
}

function MiniBarChart({ points, maxValue, unit, accentColor, mealMarkerIndex }: BarChartProps) {
  const colors = useColors();
  if (points.length === 0) {
    return (
      <View style={chartStyles.empty}>
        <Text style={[chartStyles.emptyText, { color: colors.muted }]}>
          No data points recorded in this window
        </Text>
      </View>
    );
  }
  return (
    <View style={chartStyles.container}>
      {points.map((pt, idx) => {
        const pct = Math.min(1, pt.value / maxValue);
        const barColor = pt.urgency === 'normal' ? accentColor
          : pt.urgency === 'elevated' ? '#F59E0B'
          : pt.urgency === 'stage2'   ? '#EF4444'
          : '#7C3AED';
        const isMeal = idx === mealMarkerIndex;
        return (
          <View key={idx} style={chartStyles.barWrap}>
            <Text style={[chartStyles.barValue, { color: colors.foreground }]} numberOfLines={1}>
              {pt.value}
            </Text>
            <View style={[chartStyles.barTrack, { backgroundColor: colors.border }]}>
              <View style={[chartStyles.barFill, { height: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
            </View>
            {isMeal && (
              <View style={[chartStyles.mealMarker, { backgroundColor: '#8B5CF6' }]}>
                <Text style={chartStyles.mealMarkerText}>🍽</Text>
              </View>
            )}
            <Text style={[chartStyles.barLabel, { color: colors.muted }]} numberOfLines={1}>
              {pt.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
    paddingHorizontal: 4,
  },
  barWrap: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: '80%', height: 80, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 4 },
  barValue: { fontSize: 9, marginBottom: 2, fontWeight: '600' },
  barLabel: { fontSize: 8, marginTop: 2, textAlign: 'center' },
  mealMarker: {
    position: 'absolute',
    top: 16,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealMarkerText: { fontSize: 10 },
  empty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13 },
});

// ─── Impact Score Gauge ───────────────────────────────────────────────────────

function ImpactGauge({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const color = clamped >= 70 ? '#EF4444' : clamped >= 40 ? '#F59E0B' : '#22C55E';
  const label = clamped >= 70 ? 'High Impact' : clamped >= 40 ? 'Moderate Impact' : 'Low Impact';
  return (
    <View style={gaugeStyles.wrap}>
      <View style={[gaugeStyles.track, { backgroundColor: color + '22' }]}>
        <View style={[gaugeStyles.fill, { width: `${clamped}%` as any, backgroundColor: color }]} />
      </View>
      <View style={gaugeStyles.row}>
        <Text style={[gaugeStyles.score, { color }]}>{clamped}</Text>
        <Text style={[gaugeStyles.label, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  fill: { height: '100%', borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score: { fontSize: 28, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '600' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MealIQDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    mealLabel?: string;
    insight?: string;
    bpImpact?: string;
    glucoseImpact?: string;
    impactScore?: string;
    correlationType?: string;
    deltaMinutes?: string;
  }>();

  const { state } = useHealth();
  const healthData = state.data;

  const impactScore = Number(params.impactScore ?? 0);
  const deltaMin = Number(params.deltaMinutes ?? 0);
  const corrType = params.correlationType ?? 'meal_iq';

  // Build glucose chart points from last 24h of blood sugar readings
  const glucosePoints = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return (healthData?.bloodSugar ?? [])
      .filter((r: { timestamp: string }) => new Date(r.timestamp).getTime() >= cutoff)
      .sort((a: { timestamp: string }, b: { timestamp: string }) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-12)
      .map((r: { timestamp: string; glucoseMgDl: number }) => ({
        label: safeFormatTime(r.timestamp, [], { hour: '2-digit', minute: '2-digit' }),
        value: r.glucoseMgDl,
        urgency: glucoseUrgency(r.glucoseMgDl),
      }));
  }, [healthData?.bloodSugar]);

  // Build BP chart points from last 24h of vitals
  const bpPoints = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return (healthData?.vitalSigns ?? [])
      .filter((r: { timestamp: string; systolic?: number }) =>
        new Date(r.timestamp).getTime() >= cutoff && r.systolic != null)
      .sort((a: { timestamp: string }, b: { timestamp: string }) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-12)
      .map((r: { timestamp: string; systolic?: number; diastolic?: number }) => ({
        label: safeFormatTime(r.timestamp, [], { hour: '2-digit', minute: '2-digit' }),
        value: r.systolic ?? 0,
        urgency: bpUrgency(r.systolic ?? 0, r.diastolic ?? 80),
      }));
  }, [healthData?.vitalSigns]);

  const showGlucoseChart = corrType === 'meal_glucose_spike' || corrType === 'meal_iq';
  const showBpChart = corrType === 'high_sodium_hypertension' || corrType === 'meal_iq';

  const lang = useLang();
  const s = styles(colors);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <Pressable
            style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Text style={[s.backText, { color: colors.primary }]}>← Back</Text>
          </Pressable>
          <View style={[s.iconWrap, { backgroundColor: '#8B5CF6' + '22' }]}>
            <Text style={{ fontSize: 24 }}>🧠</Text>
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>Meal IQ Insight</Text>
          <Text style={[s.mealLabel, { color: colors.muted }]} numberOfLines={2}>
            {params.mealLabel ?? 'Correlation Analysis'}
          </Text>
        </View>

        {/* Impact Score */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Impact Score</Text>
          <ImpactGauge score={impactScore} />
          {deltaMin > 0 && (
            <Text style={[s.deltaText, { color: colors.muted }]}>
              ⏱ Observation detected {deltaMin} min after the triggering input
            </Text>
          )}
        </View>

        {/* BP & Glucose Impact Summary */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Physiological Impact</Text>
          <View style={s.impactRow}>
            <View style={[s.impactChip, { backgroundColor: '#EF4444' + '18', borderColor: '#EF4444' + '44' }]}>
              <Text style={s.impactIcon}>🩸</Text>
              <View>
                <Text style={[s.impactLabel, { color: colors.muted }]}>Blood Pressure</Text>
                <Text style={[s.impactValue, { color: '#EF4444' }]}>{params.bpImpact ?? 'N/A'}</Text>
              </View>
            </View>
            <View style={[s.impactChip, { backgroundColor: '#F59E0B' + '18', borderColor: '#F59E0B' + '44' }]}>
              <Text style={s.impactIcon}>🩸</Text>
              <View>
                <Text style={[s.impactLabel, { color: colors.muted }]}>Glucose</Text>
                <Text style={[s.impactValue, { color: '#F59E0B' }]}>{params.glucoseImpact ?? 'N/A'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Correlation Type Badge */}
        {corrType !== 'meal_iq' && (
          <View style={[s.card, { backgroundColor: '#8B5CF6' + '11', borderColor: '#8B5CF6' + '44' }]}>
            <Text style={[s.corrTypeTitle, { color: '#8B5CF6' }]}>
              {corrType === 'high_sodium_hypertension'
                ? '🧂 High Sodium → Hypertension Correlation'
                : corrType === 'meal_glucose_spike'
                ? '🍽️ Meal → Postprandial Glucose Spike'
                : '🔗 Physiological Correlation'}
            </Text>
            <Text style={[s.corrTypeBody, { color: colors.muted }]}>
              {corrType === 'high_sodium_hypertension'
                ? 'A high-sodium meal was followed by an elevated blood pressure reading within the configured correlation window. Reducing dietary sodium may help manage blood pressure over time.'
                : corrType === 'meal_glucose_spike'
                ? 'A meal was followed by a postprandial glucose spike. Consider lower-glycemic food choices or timing of physical activity after meals.'
                : 'A physiological correlation was detected between an input event and an observation.'}
            </Text>
          </View>
        )}

        {/* Insight Text */}
        {params.insight && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Personal Insight</Text>
            <Text style={[s.insightText, { color: colors.muted }]}>{params.insight}</Text>
          </View>
        )}

        {/* Glucose Chart */}
        {showGlucoseChart && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Glucose (Last 24h)</Text>
            <Text style={[s.chartHint, { color: colors.muted }]}>
              Normal range: 70–130 mg/dL · 🍽 = meal marker
            </Text>
            <MiniBarChart
              points={glucosePoints}
              maxValue={300}
              unit="mg/dL"
              accentColor="#22C55E"
            />
          </View>
        )}

        {/* BP Chart */}
        {showBpChart && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Systolic BP (Last 24h)</Text>
            <Text style={[s.chartHint, { color: colors.muted }]}>
              Normal: &lt;120 mmHg · Elevated: 120–129 · Stage 2: ≥140
            </Text>
            <MiniBarChart
              points={bpPoints}
              maxValue={200}
              unit="mmHg"
              accentColor="#22C55E"
            />
          </View>
        )}

        {/* Educational Footer */}
        <View style={[s.card, s.footerCard, { backgroundColor: '#8B5CF6' + '0D', borderColor: '#8B5CF6' + '33' }]}>
          <Text style={[s.footerTitle, { color: '#8B5CF6' }]}>{((mealIqStrings as unknown as Record<string, typeof mealIqStrings.en>)[toStaticLang(lang)] ?? mealIqStrings.en).whatCanIDo}</Text>
          <Text style={[s.footerBody, { color: colors.muted }]}>
            {corrType === 'high_sodium_hypertension'
              ? ((mealIqStrings as unknown as Record<string, typeof mealIqStrings.en>)[toStaticLang(lang)] ?? mealIqStrings.en).highSodiumAction
              : corrType === 'meal_glucose_spike'
              ? ((mealIqStrings as unknown as Record<string, typeof mealIqStrings.en>)[toStaticLang(lang)] ?? mealIqStrings.en).mealGlucoseAction
              : ((mealIqStrings as unknown as Record<string, typeof mealIqStrings.en>)[toStaticLang(lang)] ?? mealIqStrings.en).defaultAction}
          </Text>
        </View>

        {/* Medical Disclaimer Footer */}
        <View style={{ marginTop: 16, marginBottom: 8, paddingHorizontal: 4, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', fontStyle: 'italic', lineHeight: 16 }}>
            {((disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en).disclaimer}
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(_colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    header: { alignItems: 'center', marginBottom: 20 },
    backBtn: { alignSelf: 'flex-start', marginBottom: 12 },
    backText: { fontSize: 15, fontWeight: '600' },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
    mealLabel: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    card: {
      borderRadius: 14,
      borderWidth: 0.5,
      padding: 16,
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
    deltaText: { fontSize: 12, marginTop: 4 },
    impactRow: { flexDirection: 'row', gap: 10 },
    impactChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      borderWidth: 0.5,
    },
    impactIcon: { fontSize: 20 },
    impactLabel: { fontSize: 11 },
    impactValue: { fontSize: 14, fontWeight: '700' },
    corrTypeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
    corrTypeBody: { fontSize: 13, lineHeight: 19 },
    insightText: { fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
    chartHint: { fontSize: 11, marginBottom: 10 },
    footerCard: { marginTop: 4 },
    footerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
    footerBody: { fontSize: 13, lineHeight: 20 },
  });
}
