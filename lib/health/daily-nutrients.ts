/**
 * DailyNutrients — aggregated macro model for a single calendar day.
 *
 * Aggregates ALL SodiumRecord entries that represent a food log event — whether
 * logged via the Nutrition log (Smart photo scan, voice, manual entry) or the Diet
 * log (DASH, Mediterranean, Renal, etc.). Both logging paths write SodiumRecord
 * entries into the same `sodiumIntake` array in HealthData.
 *
 * Inclusion criteria (any of the following):
 *   - Has at least one macro field (calories, carbsG, fatG, proteinG)
 *   - Has sodium or potassium data AND a foodDescription (i.e. a named food entry)
 *   - Has a mealContext other than 'supplement' (explicit food log)
 *
 * Calorie formula (Atwater):
 *   TotalCalories = (carbohydrates_g × 4) + (protein_g × 4) + (fats_g × 9)
 *
 * The formula-derived value (calculated_calories_kcal) is provided alongside
 * the Smart-reported value (total_calories_kcal) so the UI can show both.
 */

import type { SodiumRecord } from './types';

export interface DailyNutrients {
  date: string;                   // YYYY-MM-DD
  fats_g: number;                 // total fat (g)
  carbohydrates_g: number;        // total carbohydrates (g)
  protein_g: number;              // total protein (g)
  sugar_g: number;                // total sugars (g)
  fiber_g: number;                // dietary fiber (g)
  sodium_mg: number;              // sodium (mg)
  potassium_mg: number;           // potassium (mg)
  total_calories_kcal: number;    // Smart-reported calories (sum of all entries)
  calculated_calories_kcal: number; // Atwater formula: (carbs×4)+(protein×4)+(fats×9)
  glycemic_load: number;          // sum of per-entry GL values
  phosphorus_mg: number;          // total phosphorus (mg) — NKF renal limit ≤800–1000 mg/day
  entry_count: number;            // number of food log entries for the day
  /** How many entries came from each source for transparency */
  sources: {
    withMacros: number;           // entries that had at least one macro field
    sodiumOnly: number;           // entries with only sodium/potassium (no macros)
    dietLog: number;              // entries from the Diet log (non-supplement mealContext, no macros)
  };
}

/**
 * Returns true if a SodiumRecord represents a food log entry that should
 * contribute to the daily nutrition totals.
 *
 * Accepts entries from BOTH the Nutrition log and the Diet log:
 *   1. Any entry with at least one macro field (calories, carbs, fat, protein)
 *   2. Any named food entry (has foodDescription) with sodium/potassium data
 *   3. Any entry with a meal context (breakfast/lunch/dinner/snack/other) that
 *      has sodium data — these are explicit diet log entries
 */
function isFoodEntry(r: SodiumRecord): boolean {
  // Has at least one macro field → always include
  const hasMacros =
    (r.calories != null && r.calories > 0) ||
    (r.carbsG != null && r.carbsG > 0) ||
    (r.fatG != null && r.fatG > 0) ||
    (r.proteinG != null && r.proteinG > 0);
  if (hasMacros) return true;

  // Named food entry with sodium/potassium → include (Diet log entries often only have Na/K)
  const hasNaK = (r.sodiumMg != null && r.sodiumMg > 0) || (r.potassiumMg != null && r.potassiumMg > 0);
  if (hasNaK && r.foodDescription && r.foodDescription.trim().length > 0) return true;

  // Explicit meal context (not supplement) with any sodium data → include
  if (hasNaK && r.mealContext !== 'supplement') return true;

  return false;
}

/**
 * Aggregates an array of SodiumRecord entries into per-day DailyNutrients objects.
 * Includes ALL food log entries from both the Nutrition log and the Diet log.
 * Days are returned in ascending date order.
 */
export function aggregateDailyNutrients(records: SodiumRecord[]): DailyNutrients[] {
  const byDay = new Map<string, DailyNutrients>();

  for (const r of records) {
    if (!isFoodEntry(r)) continue;

    const date = r.timestamp.split('T')[0]; // YYYY-MM-DD

    if (!byDay.has(date)) {
      byDay.set(date, {
        date,
        fats_g: 0,
        carbohydrates_g: 0,
        protein_g: 0,
        sugar_g: 0,
        fiber_g: 0,
        sodium_mg: 0,
        potassium_mg: 0,
        total_calories_kcal: 0,
        calculated_calories_kcal: 0,
        glycemic_load: 0,
        phosphorus_mg: 0,
        entry_count: 0,
        sources: { withMacros: 0, sodiumOnly: 0, dietLog: 0 },
      });
    }

    const day = byDay.get(date)!;
    day.fats_g += r.fatG ?? 0;
    day.carbohydrates_g += r.carbsG ?? 0;
    day.protein_g += r.proteinG ?? 0;
    day.sugar_g += r.sugarG ?? 0;
    day.fiber_g += r.fiberG ?? 0;
    day.sodium_mg += r.sodiumMg ?? 0;
    day.potassium_mg += r.potassiumMg ?? 0;
    day.total_calories_kcal += r.calories ?? 0;
    day.glycemic_load += r.glycemicLoad ?? 0;
    day.phosphorus_mg += r.phosphorusMg ?? 0;
    day.entry_count += 1;

    // Track source breakdown
    const hasMacros =
      (r.calories != null && r.calories > 0) ||
      (r.carbsG != null && r.carbsG > 0) ||
      (r.fatG != null && r.fatG > 0) ||
      (r.proteinG != null && r.proteinG > 0);
    if (hasMacros) {
      day.sources.withMacros += 1;
    } else if (r.mealContext !== 'supplement') {
      day.sources.dietLog += 1;
    } else {
      day.sources.sodiumOnly += 1;
    }
  }

  // Compute Atwater formula calories for each day
  for (const day of byDay.values()) {
    day.calculated_calories_kcal = Math.round(
      day.carbohydrates_g * 4 + day.protein_g * 4 + day.fats_g * 9
    );
    // Round to 1 decimal
    day.fats_g = Math.round(day.fats_g * 10) / 10;
    day.carbohydrates_g = Math.round(day.carbohydrates_g * 10) / 10;
    day.protein_g = Math.round(day.protein_g * 10) / 10;
    day.sugar_g = Math.round(day.sugar_g * 10) / 10;
    day.fiber_g = Math.round(day.fiber_g * 10) / 10;
    day.glycemic_load = Math.round(day.glycemic_load * 10) / 10;
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Returns the DailyNutrients for today, or null if no entries exist.
 * Aggregates from ALL food log sources (Nutrition log + Diet log).
 */
export function getTodayNutrients(records: SodiumRecord[]): DailyNutrients | null {
  const today = new Date().toISOString().split('T')[0];
  const all = aggregateDailyNutrients(records);
  return all.find(d => d.date === today) ?? null;
}

/**
 * Returns the last N days of DailyNutrients (including days with no data as gaps).
 * Only days that have entries are returned — gaps are omitted.
 */
export function getLastNDaysNutrients(records: SodiumRecord[], days = 7): DailyNutrients[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return aggregateDailyNutrients(records).filter(d => d.date >= cutoffStr);
}
