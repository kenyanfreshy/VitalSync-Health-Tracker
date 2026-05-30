/**
 * HealthKit Background Delivery
 *
 * Enables HealthKit background delivery for all vital types that VitalSync
 * reads. When a new sample is written to Apple Health (by Apple Watch, a
 * third-party app, or manual entry), iOS wakes VitalSync in the background
 * and calls the registered observer query callback so the app can sync the
 * latest data and fire threshold alerts without the user needing to open it.
 *
 * Requirements (already handled by withHealthKit.js config plugin):
 *   - com.apple.developer.healthkit                    = true
 *   - com.apple.developer.healthkit.background-delivery = true
 *
 * How it works:
 *   1. Call enableAllBackgroundDelivery() once after HealthKit authorization.
 *   2. For each type, HK.enableBackgroundDelivery(type, frequency) tells iOS
 *      to wake the app at most `frequency` often when new data arrives.
 *   3. The background task (VITALSYNC_HK_BACKGROUND) is defined via
 *      expo-task-manager and re-runs checkThresholds() + syncs new data.
 *
 * Frequency constants (HKUpdateFrequency):
 *   immediate = 1  — woken as soon as new data is available (Apple Watch HR)
 *   hourly    = 2  — batched, at most once per hour (nutrition, weight)
 *   daily     = 3  — batched, at most once per day
 *   weekly    = 4  — batched, at most once per week
 *
 * Apple note: "immediate" does NOT mean real-time streaming. iOS still
 * coalesces wakeups and may delay by several minutes under battery pressure.
 */

import { Platform } from 'react-native';
import { loadHealthKit } from './healthkit-loader';

// ─── Frequency constants ──────────────────────────────────────────────────────
// Mirrors HKUpdateFrequency in HealthKit.framework
const IMMEDIATE = 1;
const HOURLY    = 2;

// ─── Types to enable ─────────────────────────────────────────────────────────
// Grouped by clinical importance and update frequency.

/** High-priority types: wake the app as soon as new data arrives. */
const IMMEDIATE_TYPES: string[] = [
  // Cardiovascular — most time-sensitive
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKCorrelationTypeIdentifierBloodPressure',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  // Metabolic — CGM users need near-real-time glucose
  'HKQuantityTypeIdentifierBloodGlucose',
  // Respiratory & vitals
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierBodyTemperature',
  // Activity (step count updates frequently from Apple Watch)
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  // Sleep (written by Apple Watch at end of sleep session)
  'HKCategoryTypeIdentifierSleepAnalysis',
  // Workouts
  'HKWorkoutTypeIdentifier',
];

/** Lower-priority types: batch updates at most once per hour. */
const HOURLY_TYPES: string[] = [
  // Body composition (changes slowly)
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyMassIndex',
  'HKQuantityTypeIdentifierWaistCircumference',
  'HKQuantityTypeIdentifierHeight',
  // Fitness
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierFlightsClimbed',
  // Nutrition — logged per meal, hourly batching is sufficient
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryFatTotal',
  'HKQuantityTypeIdentifierDietaryFatSaturated',
  'HKQuantityTypeIdentifierDietaryFiber',
  'HKQuantityTypeIdentifierDietarySodium',
  'HKQuantityTypeIdentifierDietaryPotassium',
  'HKQuantityTypeIdentifierDietaryCalcium',
  'HKQuantityTypeIdentifierDietaryMagnesium',
  'HKQuantityTypeIdentifierDietaryOmega3FattyAcids',
  'HKQuantityTypeIdentifierDietaryCaffeine',
  'HKQuantityTypeIdentifierDietaryWater',
  // Insulin
  'HKQuantityTypeIdentifierInsulinDelivery',
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enable HealthKit background delivery for all vital and nutrition types.
 *
 * Call this once, immediately after `requestHealthKitPermissions()` succeeds.
 * Safe to call multiple times — HealthKit ignores duplicate registrations.
 *
 * @returns The number of types successfully enabled.
 */
export async function enableAllBackgroundDelivery(): Promise<number> {
  if (Platform.OS !== 'ios') return 0;

  const HK = await loadHealthKit().catch(() => null);
  if (!HK) {
    console.warn('[VitalSync] Background delivery: HealthKit not available');
    return 0;
  }

  // enableBackgroundDelivery is available in @kingstinct/react-native-healthkit v13+
  if (typeof (HK as any).enableBackgroundDelivery !== 'function') {
    console.warn(
      '[VitalSync] Background delivery: enableBackgroundDelivery not found in SDK. ' +
      'Ensure @kingstinct/react-native-healthkit ≥ 13 is installed.'
    );
    return 0;
  }

  let enabled = 0;
  const errors: string[] = [];

  // Sequential loops — no Promise.all for HealthKit calls (Hermes BoundFunction safety)
  // Enable immediate types
  for (const type of IMMEDIATE_TYPES) {
    try {
      await (HK as any).enableBackgroundDelivery(type, IMMEDIATE);
      enabled++;
    } catch (e: any) {
      // Log but do not throw — a single type failure must not block the rest
      errors.push(`${type}: ${e?.message ?? e}`);
    }
  }

  // Enable hourly types
  for (const type of HOURLY_TYPES) {
    try {
      await (HK as any).enableBackgroundDelivery(type, HOURLY);
      enabled++;
    } catch (e: any) {
      errors.push(`${type}: ${e?.message ?? e}`);
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[VitalSync] Background delivery: ${errors.length} type(s) failed to enable:\n` +
      errors.join('\n')
    );
  }

  console.info(
    `[VitalSync] Background delivery enabled for ${enabled}/${IMMEDIATE_TYPES.length + HOURLY_TYPES.length} types`
  );

  return enabled;
}

/**
 * Disable HealthKit background delivery for all types.
 * Call this when the user turns off all health alerts in Settings.
 */
export async function disableAllBackgroundDelivery(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const HK = await loadHealthKit().catch(() => null);
  if (!HK) return;

  if (typeof (HK as any).disableAllBackgroundDelivery !== 'function') return;

  try {
    await (HK as any).disableAllBackgroundDelivery();
    console.info('[VitalSync] Background delivery disabled for all types');
  } catch (e) {
    console.warn('[VitalSync] Background delivery: disableAll failed:', e);
  }
}
