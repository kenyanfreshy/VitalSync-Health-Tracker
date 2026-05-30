/**
 * DietarySummaryView
 *
 * Displays today's aggregated nutrition breakdown sourced from DASH Diet food logs.
 * Shows fats, carbohydrates, protein, calories (Smart-reported + Atwater formula),
 * glycemic load, sodium, and fiber with ADA/DASH reference targets.
 *
 * Auto-populates on mount and whenever sodiumIntake records change.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, useFoodCameraStrings } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import type { SodiumRecord } from '@/lib/health/types';
import { getTodayNutrients, type DailyNutrients } from '@/lib/health/daily-nutrients';
import { ClinicalCitationsFooter } from '@/components/clinical-citations-footer';

// ─── ADA / DASH reference targets ────────────────────────────────────────────

export const MACRO_TARGETS = {
  calories: 2000,
  carbs_g: 225,
  net_carbs_g: 197,  // carbs - fiber (225 - 28)
  protein_g: 50,
  fat_g: 65,
  fiber_g: 28,
  sodium_mg: 2300,
  glycemic_load: 80,
};

const TARGETS = {
  calories: 2000,       // kcal/day (ADA general adult)
  carbs_g: 225,         // g/day (45% of 2000 kcal)
  protein_g: 50,        // g/day
  fat_g: 65,            // g/day
  fiber_g: 28,          // g/day (ADA recommendation)
  sodium_mg: 2300,      // mg/day (DASH upper limit)
  glycemic_load: 80,    // daily GL target (low-GL diet)
};

// ─── Macro bar ────────────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  unit,
  target,
  color,
  colors,
}: {
  label: string;
  value: number;
  unit: string;
  target: number;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  const pct = Math.min(1, value / target);
  const over = value > target;

  return (
    <View style={styles.macroRow}>
      <View style={styles.macroLabelRow}>
        <Text style={[styles.macroLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.macroValue, { color: over ? colors.error : colors.foreground }]}>
          {value % 1 === 0 ? value : value.toFixed(1)}{unit}
          {over ? ' ⚠' : ''}
        </Text>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.macroFill,
            {
              width: `${Math.round(pct * 100)}%` as `${number}%`,
              backgroundColor: over ? colors.error : color,
            },
          ]}
        />
      </View>
      <Text style={[styles.macroTarget, { color: colors.muted }]}>
        Target: {target}{unit}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DietarySummaryViewProps {
  sodiumIntake: SodiumRecord[];
}

export function DietarySummaryView({ sodiumIntake }: DietarySummaryViewProps) {
  const colors = useColors();
  const fc = useFoodCameraStrings();
  const { dietType: userDietType } = useDietType();
  const dietLabel = DIET_TYPE_OPTIONS.find(o => o.value === userDietType)?.label ?? 'Diet';

  const today: DailyNutrients | null = useMemo(
    () => getTodayNutrients(sodiumIntake),
    [sodiumIntake]
  );

  if (!today) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconSymbol name="fork.knife" size={22} color={colors.muted} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Meals Logged Today</Text>
        <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
          {(fc.noDietDataPrompt ?? 'Log a {diet} meal with Smart photo or voice entry to see your daily nutrition breakdown here.').replace('{diet}', dietLabel)}
        </Text>
      </View>
    );
  }

  // Atwater formula display
  const atwaterStr = `(${today.carbohydrates_g}g × 4) + (${today.protein_g}g × 4) + (${today.fats_g}g × 9) = ${today.calculated_calories_kcal} kcal`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <IconSymbol name="fork.knife" size={16} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{fc.todaysDietarySummary ?? "Today's Dietary Summary"}</Text>
        <View style={[styles.entryBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
          <Text style={[styles.entryBadgeText, { color: colors.primary }]}>
            {today.entry_count} meal{today.entry_count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Calorie summary row */}
      <View style={[styles.calRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.calItem}>
          <Text style={[styles.calBig, { color: colors.foreground }]}>{today.total_calories_kcal}</Text>
          <Text style={[styles.calLabel, { color: colors.muted }]}>kcal (Smart)</Text>
        </View>
        <View style={[styles.calDivider, { backgroundColor: colors.border }]} />
        <View style={styles.calItem}>
          <Text style={[styles.calBig, { color: colors.primary }]}>{today.calculated_calories_kcal}</Text>
          <Text style={[styles.calLabel, { color: colors.muted }]}>kcal (formula)</Text>
        </View>
        <View style={[styles.calDivider, { backgroundColor: colors.border }]} />
        <View style={styles.calItem}>
          <Text style={[styles.calBig, { color: colors.foreground }]}>{TARGETS.calories}</Text>
          <Text style={[styles.calLabel, { color: colors.muted }]}>kcal (target)</Text>
        </View>
      </View>

      {/* Atwater formula note */}
      <Text style={[styles.atwaterNote, { color: colors.muted }]}>
        Formula: {atwaterStr}
      </Text>

      {/* Macro bars */}
      <View style={styles.macros}>
        <MacroBar
          label={fc.carbs ?? 'Carbohydrates'}
          value={today.carbohydrates_g}
          unit="g"
          target={TARGETS.carbs_g}
          color="#F59E0B"
          colors={colors}
        />
        <MacroBar
          label={fc.protein}
          value={today.protein_g}
          unit="g"
          target={TARGETS.protein_g}
          color="#3B82F6"
          colors={colors}
        />
        <MacroBar
          label={fc.fat}
          value={today.fats_g}
          unit="g"
          target={TARGETS.fat_g}
          color="#8B5CF6"
          colors={colors}
        />
        <MacroBar
          label={fc.fiber}
          value={today.fiber_g}
          unit="g"
          target={TARGETS.fiber_g}
          color="#10B981"
          colors={colors}
        />
        <MacroBar
          label={fc.sodium}
          value={today.sodium_mg}
          unit="mg"
          target={TARGETS.sodium_mg}
          color="#EF4444"
          colors={colors}
        />
        <MacroBar
          label={fc.glycemicLoad ?? 'Glycemic Load'}
          value={today.glycemic_load}
          unit=""
          target={TARGETS.glycemic_load}
          color="#F97316"
          colors={colors}
        />
      </View>

      {/* Sugar highlight */}
      {today.sugar_g > 0 ? (
        <View style={[styles.sugarRow, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '44' }]}>
          <IconSymbol name="drop.fill" size={13} color={colors.warning} />
          <Text style={[styles.sugarText, { color: colors.warning }]}>
            Total sugars: {today.sugar_g.toFixed(1)}g
            {today.sugar_g > 50 ? ' — High. Consider reducing simple carbs.' : ''}
          </Text>
        </View>
      ) : null}

      {/* Na:K Ratio + Fiber:Carb Ratio analytics */}
      {(today.potassium_mg > 0 || today.carbohydrates_g > 0) && (() => {
        const naK = today.potassium_mg > 0 ? today.sodium_mg / today.potassium_mg : null;
        const fiberCarb = today.carbohydrates_g > 0 ? today.fiber_g / today.carbohydrates_g : null;

        const naKColor = naK === null ? colors.muted : naK <= 1 ? '#10B981' : naK <= 2 ? '#F59E0B' : '#EF4444';
        const naKLabel = naK === null ? 'N/A' : naK <= 1 ? 'Optimal' : naK <= 2 ? 'Moderate' : 'High';

        const fcColor = fiberCarb === null ? colors.muted : fiberCarb >= 0.15 ? '#10B981' : fiberCarb >= 0.08 ? '#F59E0B' : '#EF4444';
        const fcLabel = fiberCarb === null ? 'N/A' : fiberCarb >= 0.15 ? 'Good' : fiberCarb >= 0.08 ? 'Moderate' : 'Low';

        return (
          <View style={[styles.ratioSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.ratioSectionTitle, { color: colors.muted }]}>PERSONAL RATIOS</Text>
            <View style={styles.ratioGrid}>
              {/* Na:K Ratio */}
              <View style={[styles.ratioCard, { backgroundColor: naKColor + '12', borderColor: naKColor + '40' }]}>
                <Text style={[styles.ratioCardTitle, { color: colors.muted }]}>Na:K Ratio</Text>
                <Text style={[styles.ratioCardValue, { color: naKColor }]}>
                  {naK !== null ? naK.toFixed(2) : '—'}
                </Text>
                <Text style={[styles.ratioCardLabel, { color: naKColor }]}>{naKLabel}</Text>
                <Text style={[styles.ratioCardTarget, { color: colors.muted }]}>Target: ≤1.0</Text>
              </View>
              {/* Fiber:Carb Ratio */}
              <View style={[styles.ratioCard, { backgroundColor: fcColor + '12', borderColor: fcColor + '40' }]}>
                <Text style={[styles.ratioCardTitle, { color: colors.muted }]}>Fiber:Carb</Text>
                <Text style={[styles.ratioCardValue, { color: fcColor }]}>
                  {fiberCarb !== null ? fiberCarb.toFixed(2) : '—'}
                </Text>
                <Text style={[styles.ratioCardLabel, { color: fcColor }]}>{fcLabel}</Text>
                <Text style={[styles.ratioCardTarget, { color: colors.muted }]}>Target: ≥0.15</Text>
              </View>
            </View>
            <Text style={[styles.ratioNote, { color: colors.muted }]}>
              Na:K ratio ≤ 1.0 is a stronger hypertension predictor than sodium alone.
              Fiber:Carb ≥ 0.15 modulates glucose curves and reduces insulin spikes.
            </Text>
          </View>
        );
      })()}

      {/* DASH / ADA guidance note */}
      <View style={[styles.guidanceRow, { backgroundColor: colors.primary + '0C', borderColor: colors.primary + '33' }]}>
        <IconSymbol name="info.circle.fill" size={13} color={colors.primary} />
        <Text style={[styles.guidanceText, { color: colors.primary }]}>
          DASH targets: ≤2,300 mg sodium · ≥28g fiber · ≤80 daily glycemic load
        </Text>
      </View>

      {/* Clinical citations — Guideline 1.4.1 compliance */}
      <ClinicalCitationsFooter compact />
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  entryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  entryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  calRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  calDivider: {
    width: 1,
  },
  calBig: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  calLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  atwaterNote: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  macros: {
    gap: 10,
  },
  macroRow: {
    gap: 3,
  },
  macroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  macroValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  macroTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: {
    height: 6,
    borderRadius: 3,
  },
  macroTarget: {
    fontSize: 11,
  },
  sugarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  sugarText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  guidanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  guidanceText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  // Empty state
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  // Clinical ratios section
  ratioSection: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  ratioSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  ratioGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  ratioCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  ratioCardTitle: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ratioCardValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  ratioCardLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  ratioCardTarget: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  ratioNote: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});

// ─── Daily Macro Budget Strip ─────────────────────────────────────────────────
// A compact horizontal row of 4 pills showing today's consumed vs. target
// for calories, net carbs, fat, and protein. Designed to sit at the very top
// of the Nutrition log screen so users can see their remaining budget at a glance.

interface BudgetPillProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}

function BudgetPill({ label, consumed, target, unit, color, colors }: BudgetPillProps) {
  const remaining = Math.max(0, target - consumed);
  const over = consumed > target;
  const pct = Math.min(1, consumed / target);
  return (
    <View style={[budgetStyles.pill, { backgroundColor: colors.surface, borderColor: over ? color + '80' : colors.border }]}>
      <Text style={[budgetStyles.pillLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[budgetStyles.pillConsumed, { color: over ? color : colors.foreground }]}>
        {Math.round(consumed)}{unit}
      </Text>
      {/* Mini progress bar */}
      <View style={[budgetStyles.pillTrack, { backgroundColor: colors.border }]}>
        <View style={[budgetStyles.pillFill, { width: `${Math.round(pct * 100)}%` as `${number}%`, backgroundColor: over ? '#EF4444' : color }]} />
      </View>
      <Text style={[budgetStyles.pillRemaining, { color: over ? '#EF4444' : colors.muted }]}>
        {over ? `+${Math.round(consumed - target)}${unit} over` : `${Math.round(remaining)}${unit} left`}
      </Text>
    </View>
  );
}

export function DailyMacroBudgetStrip({ sodiumIntake }: { sodiumIntake: SodiumRecord[] }) {
  const colors = useColors();
  const fc = useFoodCameraStrings();
  const today = useMemo(() => getTodayNutrients(sodiumIntake), [sodiumIntake]);

  const kcal     = today?.total_calories_kcal ?? 0;
  const carbs    = today?.carbohydrates_g ?? 0;
  const fiber    = today?.fiber_g ?? 0;
  const netCarbs = Math.max(0, carbs - fiber);
  const fat      = today?.fats_g ?? 0;
  const protein  = today?.protein_g ?? 0;

  return (
    <View style={budgetStyles.strip}>
      <Text style={[budgetStyles.stripLabel, { color: colors.muted }]}>{fc.macroBudget}</Text>
      <View style={budgetStyles.pillRow}>
        <BudgetPill label={fc.calories} consumed={kcal}     target={MACRO_TARGETS.calories}    unit=" kcal" color="#F97316" colors={colors} />
        <BudgetPill label={fc.netCarbs ?? 'Net Carbs'} consumed={netCarbs} target={MACRO_TARGETS.net_carbs_g} unit="g"     color="#3B82F6" colors={colors} />
        <BudgetPill label={fc.fat}       consumed={fat}      target={MACRO_TARGETS.fat_g}        unit="g"     color="#8B5CF6" colors={colors} />
        <BudgetPill label={fc.protein}   consumed={protein}  target={MACRO_TARGETS.protein_g}    unit="g"     color="#10B981" colors={colors} />
      </View>
    </View>
  );
}

const budgetStyles = StyleSheet.create({
  strip: {
    gap: 8,
    marginBottom: 4,
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 3,
    alignItems: 'center',
  },
  pillLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  pillConsumed: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  pillTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  pillFill: {
    height: 3,
    borderRadius: 2,
  },
  pillRemaining: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 12,
  },
});
