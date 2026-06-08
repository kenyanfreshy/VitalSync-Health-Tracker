import { loadHealthKit } from './healthkit-loader';
/**
 * HealthKit Write-Back Service
 *
 * Saves manually entered health records back to Apple HealthKit so they appear
 * in the Health app and are available to other apps the user has authorized.
 *
 * All functions:
 *   - Are no-ops on Android and web (safe to call unconditionally).
 *   - Swallow errors silently after logging — a write failure must never block
 *     the user's local save flow.
 *   - Use `saveQuantitySample` / `saveCategorySample` / `saveCorrelationSample`
 *     from @kingstinct/react-native-healthkit (the same package used for reads).
 *
 * Blood pressure is a HealthKit *correlation* (HKCorrelationTypeIdentifierBloodPressure)
 * that bundles a systolic and a diastolic quantity sample together.
 *
 * SDK signatures (from @kingstinct/react-native-healthkit):
 *   saveQuantitySample(identifier, unit, value, options?: { start?, end?, metadata? })
 *   saveCategorySample(identifier, value, options?: { start?, end?, metadata? })
 *   saveCorrelationSample(typeIdentifier, samples, options?: { start?, end?, metadata? })
 */

import { Platform } from 'react-native';
import type { BloodSugarRecord, VitalSignsRecord, WeightRecord, SleepRecord, PulseRecord } from './types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getHK() {
  if (Platform.OS !== 'ios') return null;
  return loadHealthKit();
}

function toDate(iso: string): Date {
  return new Date(iso);
}

// ─── Blood Glucose ────────────────────────────────────────────────────────────

/**
 * Writes a blood glucose reading to HealthKit.
 * Unit: mg/dL  (HKUnit: "mg/dL")
 */
export async function saveBloodGlucoseToHealthKit(record: BloodSugarRecord): Promise<void> {
  const HK = await getHK();
  if (!HK) return;
  try {
    const ts = toDate(record.timestamp);
    await (HK as any).saveQuantitySample(
      'HKQuantityTypeIdentifierBloodGlucose',
      'mg/dL',
      record.glucoseMgDl,
      {
        start: ts,
        end: ts,
        // HealthKit metadata: meal context maps to HKMetadataKeyBloodGlucoseMealTime
        metadata: { HKMetadataKeyBloodGlucoseMealTime: mealTimeValue(record.context) },
      },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveBloodGlucose failed:', e);
  }
}

/** Maps VitalSync meal context to HealthKit HKBloodGlucoseMealTime integer values */
function mealTimeValue(context: BloodSugarRecord['context']): number {
  switch (context) {
    case 'fasting':   return 1; // HKBloodGlucoseMealTimePreprandial
    case 'post-meal': return 2; // HKBloodGlucoseMealTimePostprandial
    default:          return 0; // unspecified
  }
}

// ─── Blood Pressure ───────────────────────────────────────────────────────────

/**
 * Writes a blood pressure reading to HealthKit as a correlation sample
 * (HKCorrelationTypeIdentifierBloodPressure) bundling systolic + diastolic.
 */
export async function saveBloodPressureToHealthKit(record: VitalSignsRecord): Promise<void> {
  if (!record.systolic || !record.diastolic) return;
  const HK = await getHK();
  if (!HK) return;
  try {
    const ts = toDate(record.timestamp);
    await (HK as any).saveCorrelationSample(
      'HKCorrelationTypeIdentifierBloodPressure',
      [
        {
          startDate: ts,
          endDate: ts,
          quantityType: 'HKQuantityTypeIdentifierBloodPressureSystolic',
          quantity: record.systolic,
          unit: 'mmHg',
        },
        {
          startDate: ts,
          endDate: ts,
          quantityType: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
          quantity: record.diastolic,
          unit: 'mmHg',
        },
      ],
      { start: ts, end: ts },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveBloodPressure failed:', e);
  }
}

// ─── Heart Rate ───────────────────────────────────────────────────────────────

/**
 * Writes a heart rate reading to HealthKit.
 * Unit: count/min
 */
export async function saveHeartRateToHealthKit(record: VitalSignsRecord): Promise<void> {
  if (!record.heartRate) return;
  const HK = await getHK();
  if (!HK) return;
  try {
    const ts = toDate(record.timestamp);
    await (HK as any).saveQuantitySample(
      'HKQuantityTypeIdentifierHeartRate',
      'count/min',
      record.heartRate,
      { start: ts, end: ts },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveHeartRate failed:', e);
  }
}

// ─── Oxygen Saturation (SpO2) ─────────────────────────────────────────────────

/**
 * Writes an oxygen saturation reading to HealthKit.
 * Unit: % (stored as 0–1 fraction in HealthKit)
 */
export async function saveOxygenSaturationToHealthKit(record: VitalSignsRecord): Promise<void> {
  const spo2 = record.oxygenSaturation ?? record.spo2;
  if (!spo2) return;
  const HK = await getHK();
  if (!HK) return;
  try {
    const ts = toDate(record.timestamp);
    // HealthKit stores SpO2 as a fraction (0.0–1.0), not a percentage
    await (HK as any).saveQuantitySample(
      'HKQuantityTypeIdentifierOxygenSaturation',
      '%',
      spo2 / 100,
      { start: ts, end: ts },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveOxygenSaturation failed:', e);
  }
}

// ─── Weight (Body Mass) ───────────────────────────────────────────────────────

/**
 * Writes a body mass (weight) reading to HealthKit.
 * Unit: kg
 */
export async function saveWeightToHealthKit(record: WeightRecord): Promise<void> {
  const HK = await getHK();
  if (!HK) return;
  try {
    const ts = toDate(record.timestamp);
    await (HK as any).saveQuantitySample(
      'HKQuantityTypeIdentifierBodyMass',
      'kg',
      record.weightKg,
      { start: ts, end: ts },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveWeight failed:', e);
  }
}

// ─── Heart Rate Variability ───────────────────────────────────────────────────

/**
 * Writes an HRV (SDNN) reading to HealthKit.
 * Unit: ms
 */
export async function saveHRVToHealthKit(record: PulseRecord): Promise<void> {
  if (!record.hrv) return;
  const HK = await getHK();
  if (!HK) return;
  try {
    const ts = toDate(record.timestamp);
    await (HK as any).saveQuantitySample(
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'ms',
      record.hrv,
      { start: ts, end: ts },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveHRV failed:', e);
  }
}

// ─── Sleep Analysis ───────────────────────────────────────────────────────────

/**
 * Writes a sleep session to HealthKit as a category sample.
 * Uses HKCategoryValueSleepAnalysisAsleepUnspecified (value = 1) for the full
 * session duration; individual stage breakdown is not written back since
 * HealthKit requires separate samples per stage.
 */
export async function saveSleepToHealthKit(record: SleepRecord): Promise<void> {
  const HK = await getHK();
  if (!HK) return;
  try {
    const start = toDate(record.bedtime);
    const end = toDate(record.wakeTime);
    // HKCategoryValueSleepAnalysisAsleepUnspecified = 1
    await (HK as any).saveCategorySample(
      'HKCategoryTypeIdentifierSleepAnalysis',
      1,
      { start, end },
    );
  } catch (e) {
    console.warn('[HealthKit Write] saveSleep failed:', e);
  }
}

// ─── Convenience: save a full VitalSigns record ───────────────────────────────

/**
 * Writes all non-null vitals from a VitalSignsRecord to HealthKit in parallel.
 * Safe to call for any record — fields that are undefined are skipped.
 */
export async function saveVitalSignsToHealthKit(record: VitalSignsRecord): Promise<void> {
  // Sequential — no Promise.all for HealthKit write calls (Hermes BoundFunction safety)
  await saveBloodPressureToHealthKit(record);
  await saveHeartRateToHealthKit(record);
  await saveOxygenSaturationToHealthKit(record);
}

// ─── Nutrition / Meal Write-Back ──────────────────────────────────────────────

/**
 * Nutrition sample descriptor for a single HealthKit quantity type.
 * Used internally by saveMealToHealthKit.
 */
interface NutritionSample {
  type: string;  // HKQuantityTypeIdentifier string
  unit: string;  // HKUnit string
  value: number; // quantity in the given unit
}

/**
 * Writes a meal (SodiumRecord) back to Apple HealthKit as individual dietary
 * quantity samples. Each macro/micro-nutrient is saved as a separate sample
 * with the same start/end timestamp as the meal entry.
 *
 * Supported fields (all optional — missing fields are silently skipped):
 *   calories   → HKQuantityTypeIdentifierDietaryEnergyConsumed (kcal)
 *   proteinG   → HKQuantityTypeIdentifierDietaryProtein        (g)
 *   carbsG     → HKQuantityTypeIdentifierDietaryCarbohydrates  (g)
 *   fatG       → HKQuantityTypeIdentifierDietaryFatTotal       (g)
 *   fiberG     → HKQuantityTypeIdentifierDietaryFiber          (g)
 *   sodiumMg   → HKQuantityTypeIdentifierDietarySodium         (mg)
 *   potassiumMg→ HKQuantityTypeIdentifierDietaryPotassium      (mg)
 *
 * This triggers HealthKit background delivery on other devices that have
 * registered observers for these types (e.g. Apple Watch, other health apps).
 *
 * @param meal - A SodiumRecord from VitalSync's nutrition log
 * @returns Number of samples successfully written to HealthKit
 */
export async function saveMealToHealthKit(
  meal: {
    timestamp: string;
    sodiumMg: number;
    potassiumMg?: number;
    calories?: number;
    carbsG?: number;
    fatG?: number;
    proteinG?: number;
    fiberG?: number;
    foodDescription?: string;
  }
): Promise<number> {
  const HK = await getHK();
  if (!HK) return 0;

  const ts = toDate(meal.timestamp);

  // Build the list of samples to write — only include fields that are present
  // and have a positive value (HealthKit rejects zero or negative quantities)
  const samples: NutritionSample[] = [];

  if (meal.calories && meal.calories > 0) {
    samples.push({ type: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', unit: 'kcal', value: meal.calories });
  }
  if (meal.proteinG && meal.proteinG > 0) {
    samples.push({ type: 'HKQuantityTypeIdentifierDietaryProtein', unit: 'g', value: meal.proteinG });
  }
  if (meal.carbsG && meal.carbsG > 0) {
    samples.push({ type: 'HKQuantityTypeIdentifierDietaryCarbohydrates', unit: 'g', value: meal.carbsG });
  }
  if (meal.fatG && meal.fatG > 0) {
    samples.push({ type: 'HKQuantityTypeIdentifierDietaryFatTotal', unit: 'g', value: meal.fatG });
  }
  if (meal.fiberG && meal.fiberG > 0) {
    samples.push({ type: 'HKQuantityTypeIdentifierDietaryFiber', unit: 'g', value: meal.fiberG });
  }
  if (meal.sodiumMg && meal.sodiumMg > 0) {
    // HealthKit stores sodium in mg
    samples.push({ type: 'HKQuantityTypeIdentifierDietarySodium', unit: 'mg', value: meal.sodiumMg });
  }
  if (meal.potassiumMg && meal.potassiumMg > 0) {
    samples.push({ type: 'HKQuantityTypeIdentifierDietaryPotassium', unit: 'mg', value: meal.potassiumMg });
  }

  if (samples.length === 0) return 0;

  // Sequential loop — no Promise.allSettled for HealthKit write calls (Hermes BoundFunction safety)
  // Individual failures are caught and logged but do not block the others.
  const results: PromiseSettledResult<unknown>[] = [];
  for (const s of samples) {
    try {
      const val = await (HK as any).saveQuantitySample(
        s.type,
        s.unit,
        s.value,
        {
          start: ts,
          end: ts,
          // Optional metadata: food description for the Health app's nutrition log
          ...(meal.foodDescription
            ? { metadata: { HKMetadataKeyFoodType: meal.foodDescription } }
            : {}),
        },
      );
      results.push({ status: 'fulfilled', value: val });
    } catch (e) {
      results.push({ status: 'rejected', reason: e });
    }
  }

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed    = results.filter((r) => r.status === 'rejected');

  if (failed.length > 0) {
    failed.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[HealthKit Write] saveMeal sample[${i}] (${samples[i]?.type}) failed:`, r.reason);
      }
    });
  }

  if (succeeded > 0) {
    console.info(
      `[HealthKit Write] saveMeal: wrote ${succeeded}/${samples.length} nutrition samples` +
      (meal.foodDescription ? ` for "${meal.foodDescription}"` : '')
    );
  }

  return succeeded;
}
