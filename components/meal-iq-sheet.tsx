/**
 * MealIQSheet
 * Bottom sheet that shows Smart-generated Meal IQ analysis for a sodium/nutrition log entry.
 * Correlates meal nutrients with vitals logged 1–4 hours after eating.
 *
 * Usage:
 *   <MealIQSheet meal={record} visible={show} onClose={() => setShow(false)} />
 */
import { safeFormatTime } from '@/lib/utils';
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { TransparencyCard } from '@/components/transparency-card';
import { useHealth } from '@/lib/health/health-context';
import { trpc } from '@/lib/trpc';
import type { SodiumRecord, BloodPressureRecord, PulseRecord, BloodSugarRecord, MealIQAnalysisRecord } from '@/lib/health/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealIQResult {
  insight: string;
  bpImpact: string;
  hrImpact: string;
  glucoseImpact: string;
  sodiumSensitive: boolean | null;
  glycemicLoad: string;
  keyNutrient: string;
  recommendation: string;
  naKRatio: number | null;
  fiberCarbRatio: number | null;
  disclaimer: string;
}

interface Props {
  meal: SodiumRecord;
  visible: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  elevated: '#EF4444',
  neutral: '#64748B',
  beneficial: '#10B981',
  unknown: '#94A3B8',
  high: '#EF4444',
  moderate: '#F59E0B',
  low: '#10B981',
};

const IMPACT_LABELS: Record<string, string> = {
  elevated: 'Elevated',
  neutral: 'Neutral',
  beneficial: 'Beneficial',
  unknown: 'Unknown',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

function ImpactBadge({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const color = IMPACT_COLORS[value] ?? '#94A3B8';
  return (
    <View style={[badgeStyles.wrap, { borderColor: colors.border }]}>
      <Text style={[badgeStyles.label, { color: colors.muted }]}>{label}</Text>
      <View style={[badgeStyles.pill, { backgroundColor: color + '20' }]}>
        <Text style={[badgeStyles.value, { color }]}>{IMPACT_LABELS[value] ?? value}</Text>
      </View>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 4, padding: 8, borderRadius: 10, borderWidth: 0.5 },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  value: { fontSize: 12, fontWeight: '700' },
});

// ─── Component ────────────────────────────────────────────────────────────────

export function MealIQSheet({ meal, visible, onClose }: Props) {
  const colors = useColors();
  const { state, addMealIQAnalysis } = useHealth();
  const [result, setResult] = useState<MealIQResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeMutation = trpc.health.analyzeMealImpact.useMutation();

  // Collect vitals logged 0–4 hours before and 1–4 hours after the meal
  const getCorrelatedVitals = useCallback(() => {
    const mealTime = new Date(meal.timestamp).getTime();
    const BEFORE_WINDOW_MS = 60 * 60 * 1000;       // 1 hour before
    const AFTER_WINDOW_MS = 4 * 60 * 60 * 1000;    // 4 hours after
    const MIN_AFTER_MS = 15 * 60 * 1000;            // at least 15 min after

    type VitalEntry = { type: 'bloodPressure' | 'heartRate' | 'bloodSugar'; value: string; timestamp: string; minutesAfterMeal?: number };

    const vitalsAfter: VitalEntry[] = [];
    const vitalsBefore: VitalEntry[] = [];

    // Blood pressure
    (state.data?.bloodPressure ?? []).forEach((r: BloodPressureRecord) => {
      const t = new Date(r.timestamp).getTime();
      const delta = t - mealTime;
      if (delta >= MIN_AFTER_MS && delta <= AFTER_WINDOW_MS) {
        vitalsAfter.push({
          type: 'bloodPressure',
          value: `${r.systolic}/${r.diastolic}`,
          timestamp: r.timestamp,
          minutesAfterMeal: Math.round(delta / 60000),
        });
      } else if (delta >= -BEFORE_WINDOW_MS && delta < 0) {
        vitalsBefore.push({ type: 'bloodPressure', value: `${r.systolic}/${r.diastolic}`, timestamp: r.timestamp });
      }
    });

    // Heart rate
    (state.data?.pulse ?? []).forEach((r: PulseRecord) => {
      const t = new Date(r.timestamp).getTime();
      const delta = t - mealTime;
      if (delta >= MIN_AFTER_MS && delta <= AFTER_WINDOW_MS) {
        vitalsAfter.push({
          type: 'heartRate',
          value: `${r.bpm}bpm`,
          timestamp: r.timestamp,
          minutesAfterMeal: Math.round(delta / 60000),
        });
      } else if (delta >= -BEFORE_WINDOW_MS && delta < 0) {
        vitalsBefore.push({ type: 'heartRate', value: `${r.bpm}bpm`, timestamp: r.timestamp });
      }
    });

    // Blood sugar
    (state.data?.bloodSugar ?? []).forEach((r: BloodSugarRecord) => {
      const t = new Date(r.timestamp).getTime();
      const delta = t - mealTime;
      if (delta >= MIN_AFTER_MS && delta <= AFTER_WINDOW_MS) {
        vitalsAfter.push({
          type: 'bloodSugar',
          value: `${r.glucoseMgDl}mg/dL`,
          timestamp: r.timestamp,
          minutesAfterMeal: Math.round(delta / 60000),
        });
      } else if (delta >= -BEFORE_WINDOW_MS && delta < 0) {
        vitalsBefore.push({ type: 'bloodSugar', value: `${r.glucoseMgDl}mg/dL`, timestamp: r.timestamp });
      }
    });

    return { vitalsAfter, vitalsBefore };
  }, [meal.timestamp, state.data]);

  // Run analysis when sheet opens
  useEffect(() => {
    if (!visible) return;
    setResult(null);
    setError(null);

    const { vitalsAfter, vitalsBefore } = getCorrelatedVitals();

    analyzeMutation.mutate(
      {
        meal: {
          name: meal.foodDescription ?? undefined,
          sodiumMg: meal.sodiumMg,
          potassiumMg: meal.potassiumMg ?? undefined,
          carbsG: meal.carbsG ?? undefined,
          fiberG: meal.fiberG ?? undefined,
          proteinG: meal.proteinG ?? undefined,
          fatG: meal.fatG ?? undefined,
          calories: meal.calories ?? undefined,
          timestamp: meal.timestamp,
        },
        vitalsAfter: vitalsAfter as any,
        vitalsBefore: vitalsBefore as any,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          // Persist the analysis so it appears in Meal IQ history and PDF reports
          const mealLabel = meal.foodDescription ?? meal.mealContext ?? 'Meal';
          // Derive numeric deltas for sorting/PDF
          const bpAfterValues = vitalsAfter
            .filter(v => v.type === 'bloodPressure')
            .map(v => parseInt(v.value.split('/')[0], 10))
            .filter(n => !isNaN(n));
          const bpBeforeValues = vitalsBefore
            .filter(v => v.type === 'bloodPressure')
            .map(v => parseInt(v.value.split('/')[0], 10))
            .filter(n => !isNaN(n));
          const bpDeltaSystolic = bpAfterValues.length > 0 && bpBeforeValues.length > 0
            ? Math.round(bpAfterValues.reduce((a, b) => a + b, 0) / bpAfterValues.length -
                bpBeforeValues.reduce((a, b) => a + b, 0) / bpBeforeValues.length)
            : undefined;
          const glucAfterValues = vitalsAfter
            .filter(v => v.type === 'bloodSugar')
            .map(v => parseInt(v.value, 10))
            .filter(n => !isNaN(n));
          const glucBeforeValues = vitalsBefore
            .filter(v => v.type === 'bloodSugar')
            .map(v => parseInt(v.value, 10))
            .filter(n => !isNaN(n));
          const glucoseDeltaMgDl = glucAfterValues.length > 0 && glucBeforeValues.length > 0
            ? Math.round(glucAfterValues.reduce((a, b) => a + b, 0) / glucAfterValues.length -
                glucBeforeValues.reduce((a, b) => a + b, 0) / glucBeforeValues.length)
            : undefined;
          const impactScore = Math.min(100, Math.round(
            (bpDeltaSystolic != null ? Math.abs(bpDeltaSystolic) * 2 : 0) +
            (glucoseDeltaMgDl != null ? Math.abs(glucoseDeltaMgDl) * 0.5 : 0) +
            (data.sodiumSensitive ? 20 : 0) +
            (data.glycemicLoad === 'high' ? 15 : data.glycemicLoad === 'moderate' ? 8 : 0)
          ));
          const record: MealIQAnalysisRecord = {
            id: `miq_${meal.id}_${Date.now()}`,
            mealId: meal.id,
            mealLabel,
            analyzedAt: new Date().toISOString(),
            insight: data.insight,
            bpImpact: data.bpImpact,
            hrImpact: data.hrImpact,
            glucoseImpact: data.glucoseImpact,
            sodiumSensitive: data.sodiumSensitive,
            glycemicLoad: data.glycemicLoad,
            keyNutrient: data.keyNutrient,
            recommendation: data.recommendation,
            naKRatio: data.naKRatio,
            fiberCarbRatio: data.fiberCarbRatio,
            disclaimer: data.disclaimer,
            bpDeltaSystolic,
            glucoseDeltaMgDl,
            impactScore,
          };
          addMealIQAnalysis(record);
        },
        onError: (err) => setError(err.message),
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const s = styles(colors);

  const mealLabel = meal.foodDescription ?? meal.mealContext ?? 'Meal';
  const mealTime = safeFormatTime(meal.timestamp, 'en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View style={s.headerLeft}>
            <Text style={{ fontSize: 20 }}>🧠</Text>
            <View>
              <Text style={[s.headerTitle, { color: colors.foreground }]}>Meal IQ</Text>
              <Text style={[s.headerSub, { color: colors.muted }]}>{mealLabel} · {mealTime}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.closeBtn, { backgroundColor: colors.surface }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.closeBtnText, { color: colors.muted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {/* Loading state */}
          {analyzeMutation.isPending && !result && (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[s.loadingText, { color: colors.muted }]}>
                Analyzing meal impact…
              </Text>
              <Text style={[s.loadingSubText, { color: colors.muted }]}>
                Correlating nutrition with your vitals
              </Text>
            </View>
          )}

          {/* Error state */}
          {error && (
            <View style={[s.errorWrap, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}>
              <Text style={[s.errorTitle, { color: '#EF4444' }]}>Analysis unavailable</Text>
              <Text style={[s.errorText, { color: colors.muted }]}>{error}</Text>
            </View>
          )}

          {/* Result */}
          {result && (
            <>
              {/* Insight card */}
              <View style={[s.insightCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
                <Text style={{ fontSize: 24, marginBottom: 8 }}>🧠</Text>
                <Text style={[s.insightText, { color: colors.foreground }]}>{result.insight}</Text>
              </View>

              {/* Impact grid */}
              <View style={s.impactGrid}>
                <ImpactBadge label="Blood Pressure" value={result.bpImpact} />
                <ImpactBadge label="Heart Rate" value={result.hrImpact} />
                <ImpactBadge label="Glucose" value={result.glucoseImpact} />
              </View>
              <View style={[s.impactGrid, { marginTop: 8 }]}>
                <ImpactBadge label="Glycemic Load" value={result.glycemicLoad} />
                {result.sodiumSensitive !== null ? (
                  <ImpactBadge
                    label="Na Sensitivity"
                    value={result.sodiumSensitive ? 'elevated' : 'neutral'}
                  />
                ) : (
                  <ImpactBadge label="Na Sensitivity" value="unknown" />
                )}
                <ImpactBadge label="Key Nutrient" value={result.keyNutrient} />
              </View>

              {/* Ratios */}
              {(result.naKRatio !== null || result.fiberCarbRatio !== null) && (
                <View style={[s.ratiosCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[s.ratiosTitle, { color: colors.muted }]}>PERSONAL RATIOS</Text>
                  {result.naKRatio !== null && (
                    <View style={s.ratioRow}>
                      <Text style={[s.ratioLabel, { color: colors.foreground }]}>Na:K Ratio</Text>
                      <Text style={[s.ratioValue, {
                        color: result.naKRatio <= 1 ? '#10B981' : result.naKRatio <= 2 ? '#F59E0B' : '#EF4444',
                      }]}>
                        {result.naKRatio.toFixed(2)}
                      </Text>
                      <Text style={[s.ratioTarget, { color: colors.muted }]}>
                        {result.naKRatio <= 1 ? '✓ Optimal (≤1)' : result.naKRatio <= 2 ? '⚠ Moderate' : '✗ High (>2)'}
                      </Text>
                    </View>
                  )}
                  {result.fiberCarbRatio !== null && (
                    <View style={s.ratioRow}>
                      <Text style={[s.ratioLabel, { color: colors.foreground }]}>Fiber:Carb Ratio</Text>
                      <Text style={[s.ratioValue, {
                        color: result.fiberCarbRatio >= 0.15 ? '#10B981' : result.fiberCarbRatio >= 0.08 ? '#F59E0B' : '#EF4444',
                      }]}>
                        {result.fiberCarbRatio.toFixed(2)}
                      </Text>
                      <Text style={[s.ratioTarget, { color: colors.muted }]}>
                        {result.fiberCarbRatio >= 0.15 ? '✓ Good (≥0.15)' : result.fiberCarbRatio >= 0.08 ? '⚠ Moderate' : '✗ Low (<0.08)'}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Recommendation */}
              <View style={[s.recommendCard, { backgroundColor: '#10B98112', borderColor: '#10B98140' }]}>
                <Text style={[s.recommendLabel, { color: '#10B981' }]}>RECOMMENDATION</Text>
                <Text style={[s.recommendText, { color: colors.foreground }]}>{result.recommendation}</Text>
              </View>

              {/* Disclaimer */}
              <Text style={[s.disclaimer, { color: colors.muted }]}>{result.disclaimer}</Text>
              <TransparencyCard variant="nutritionAnalysis" style={{ marginTop: 8 }} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Meal IQ Brain Icon Button ─────────────────────────────────────────────────

interface MealIQButtonProps {
  meal: SodiumRecord;
  size?: number;
}

export function MealIQButton({ meal, size = 18 }: MealIQButtonProps) {
  const colors = useColors();
  const [showSheet, setShowSheet] = useState(false);

  // Only show the brain icon if the meal has some nutritional data
  const hasData = meal.sodiumMg > 0 || meal.carbsG != null || meal.potassiumMg != null;
  if (!hasData) return null;

  return (
    <>
      <TouchableOpacity
        style={[mealIQBtnStyles.btn, { backgroundColor: colors.primary + '18' }]}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowSheet(true);
        }}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ fontSize: size - 2 }}>🧠</Text>
      </TouchableOpacity>
      <MealIQSheet
        meal={meal}
        visible={showSheet}
        onClose={() => setShowSheet(false)}
      />
    </>
  );
}

const mealIQBtnStyles = StyleSheet.create({
  btn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (_c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '600' },
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  loadingWrap: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  loadingSubText: { fontSize: 13, textAlign: 'center' },
  errorWrap: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 8 },
  errorTitle: { fontSize: 14, fontWeight: '700' },
  errorText: { fontSize: 13, lineHeight: 18 },
  insightCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'flex-start',
  },
  insightText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  impactGrid: { flexDirection: 'row', gap: 8 },
  ratiosCard: {
    borderRadius: 12, borderWidth: 0.5, padding: 14, gap: 10,
  },
  ratiosTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  ratioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratioLabel: { fontSize: 13, flex: 1 },
  ratioValue: { fontSize: 15, fontWeight: '800' },
  ratioTarget: { fontSize: 11 },
  recommendCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  recommendLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  recommendText: { fontSize: 14, lineHeight: 20 },
  disclaimer: { fontSize: 11, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
});
