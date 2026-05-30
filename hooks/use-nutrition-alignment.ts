/**
 * useNutritionAlignment
 *
 * Centralized Nutrition Alignment Engine hook.
 *
 * Aggregates ALL SodiumRecord entries from the health context (written by
 * Diet Log, Smart Intake, and Bio-Aligned Recipes) into a unified
 * real-time nutrition model.
 *
 * Features:
 *  - Real-time: re-computes whenever sodiumIntake changes
 *  - Multi-day views: today / 7d / 14d / 30d
 *  - Per-meal breakdown with source badges
 *  - Blood sugar impact classification (Low / Moderate / High)
 *  - Duplicate detection (same foodDescription within 60s)
 *  - Macro goals integration (remaining calories, % progress)
 *
 * Pure utilities (classifyGlycemicLoad, SOURCE_META, detectDuplicates) live in
 * lib/health/nutrition-alignment-utils.ts for testability without React.
 */

import { useMemo } from 'react';
import { useHealth } from '@/lib/health/health-context';
import { useMacroGoals } from '@/hooks/use-macro-goals';
import { getTodayNutrients, getLastNDaysNutrients, DailyNutrients } from '@/lib/health/daily-nutrients';
import type { SodiumRecord } from '@/lib/health/types';
import { classifyGlycemicLoad, detectDuplicates, NutritionSource, BloodSugarImpactInfo } from '@/lib/health/nutrition-alignment-utils';
// Re-export pure utilities so callers can import from one place
export type {
  NutritionSource,
  BloodSugarImpact,
  BloodSugarImpactInfo,
} from '@/lib/health/nutrition-alignment-utils';
export {
  SOURCE_META,
  classifyGlycemicLoad,
  detectDuplicates,
} from '@/lib/health/nutrition-alignment-utils';

// ─── Per-meal entry ───────────────────────────────────────────────────────────

export interface MealEntry {
  id: string;
  timestamp: string;
  foodDescription: string;
  mealContext: SodiumRecord['mealContext'];
  source: NutritionSource;
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
  glycemicLoad: number;
  bloodSugarImpact: BloodSugarImpactInfo;
}

// ─── Alignment summary ────────────────────────────────────────────────────────

export interface NutritionAlignmentSummary {
  /** Aggregated totals for today */
  today: DailyNutrients | null;
  /** Aggregated totals for last 7 days (array, ascending date) */
  last7Days: DailyNutrients[];
  /** Aggregated totals for last 14 days */
  last14Days: DailyNutrients[];
  /** Aggregated totals for last 30 days */
  last30Days: DailyNutrients[];
  /** Today's individual meal entries, sorted newest-first */
  todayMeals: MealEntry[];
  /** Blood sugar impact for today's total glycemic load */
  bloodSugarImpact: BloodSugarImpactInfo;
  /** Remaining calories today (goal − consumed); null if no goal set */
  remainingCalories: number | null;
  /** Macro progress percentages (0–100) */
  progress: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    fiber: number;
  };
  /** Source breakdown for today */
  sourceCounts: Record<NutritionSource, number>;
  /** Total unique food entries today */
  entryCount: number;
  /** Deduped SodiumRecord array — pass to NutritionChart/SmartNutritionCard for consistent data */
  dedupedRecords: SodiumRecord[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNutritionAlignment(): NutritionAlignmentSummary {
  const { state } = useHealth();
  const { goals } = useMacroGoals();

  const sodiumIntake: SodiumRecord[] = state.data?.sodiumIntake ?? [];

  return useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    // Dedup detection — suppress entries with same food logged within 60s
    const dupeIds = detectDuplicates(sodiumIntake);
    const dedupedRecords = sodiumIntake.filter(r => !dupeIds.has(r.id));

    // Aggregated views
    const todayNutrients = getTodayNutrients(dedupedRecords);
    const last7Days  = getLastNDaysNutrients(dedupedRecords, 7);
    const last14Days = getLastNDaysNutrients(dedupedRecords, 14);
    const last30Days = getLastNDaysNutrients(dedupedRecords, 30);

    // Today's individual meal entries (newest first)
    const todayRecords = dedupedRecords
      .filter(r => r.timestamp.startsWith(today))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const todayMeals: MealEntry[] = todayRecords.map(r => {
      const gl = r.glycemicLoad ?? 0;
      return {
        id: r.id,
        timestamp: r.timestamp,
        foodDescription: r.foodDescription ?? 'Unknown food',
        mealContext: r.mealContext,
        source: r.source,
        calories:  r.calories  ?? 0,
        carbsG:    r.carbsG    ?? 0,
        proteinG:  r.proteinG  ?? 0,
        fatG:      r.fatG      ?? 0,
        fiberG:    r.fiberG    ?? 0,
        sodiumMg:  r.sodiumMg  ?? 0,
        glycemicLoad: gl,
        bloodSugarImpact: classifyGlycemicLoad(gl),
      };
    });

    // Blood sugar impact for today's cumulative GL
    const totalGL = todayNutrients?.glycemic_load ?? 0;
    const bloodSugarImpact = classifyGlycemicLoad(totalGL);

    // Remaining calories (null when no goal is set)
    const calorieGoal      = goals?.calories ?? 0;
    const consumedCalories = todayNutrients?.total_calories_kcal ?? 0;
    const remainingCalories = calorieGoal > 0 ? calorieGoal - consumedCalories : null;

    // Macro progress percentages (capped at 100)
    const progress = {
      calories: calorieGoal > 0
        ? Math.min(100, Math.round((consumedCalories / calorieGoal) * 100)) : 0,
      carbs:   (goals?.carbs ?? 0) > 0
        ? Math.min(100, Math.round(((todayNutrients?.carbohydrates_g ?? 0) / goals.carbs) * 100)) : 0,
      protein: (goals?.protein ?? 0) > 0
        ? Math.min(100, Math.round(((todayNutrients?.protein_g ?? 0) / goals.protein) * 100)) : 0,
      fat:     (goals?.fat ?? 0) > 0
        ? Math.min(100, Math.round(((todayNutrients?.fats_g ?? 0) / goals.fat) * 100)) : 0,
      fiber:   ((goals as any)?.fibre ?? 25) > 0
        ? Math.min(100, Math.round(((todayNutrients?.fiber_g ?? 0) / ((goals as any)?.fibre ?? 25)) * 100)) : 0,
    };

    // Source breakdown for today
    const sourceCounts: Record<NutritionSource, number> = {
      'manual': 0, 'ai-photo': 0, 'barcode-scan': 0,
      'recipe': 0, 'ai-hub': 0, 'diet-log': 0,
    };
    for (const r of todayRecords) {
      if (r.source in sourceCounts) {
        sourceCounts[r.source as NutritionSource] += 1;
      }
    }

    return {
      today: todayNutrients,
      last7Days,
      last14Days,
      last30Days,
      todayMeals,
      bloodSugarImpact,
      remainingCalories,
      progress,
      sourceCounts,
      entryCount: todayMeals.length,
      dedupedRecords,
    };
  }, [sodiumIntake, goals]);
}
