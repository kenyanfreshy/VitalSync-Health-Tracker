/**
 * storage-optimizer-store.ts
 *
 * Async persistence layer for the Storage Optimization Engine.
 *
 * Responsibilities:
 *  1. Run the full optimization pass against the live HealthData and persist
 *     the trimmed data + summaries to AsyncStorage.
 *  2. Load persisted summaries for the doctor report and Storage Optimization
 *     screen without re-running the full pass.
 *  3. Track the last-run timestamp and expose it to the UI.
 *  4. Provide a lightweight metrics snapshot for the Storage Optimization screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { loadHealthData, saveHealthData } from '@/lib/health/storage';
import { loadMedications, saveMedications } from '@/lib/medications/storage';
import {
  runStorageOptimization,
  enforceMedicationLimit,
  computeStorageHealthScore,
  OPTIMIZER_KEYS,
  type StorageOptimizationResult,
  type StorageMetrics,
  type SleepSummary,
  type HeartRateBlock,
  type RestingHRSummary,
  type BloodPressureSummary,
  type BloodGlucoseSummary,
  type ActivitySummary,
  type WeightSummary,
  type SpO2Summary,
} from './storage-optimizer';

// ─── Run Full Optimization ────────────────────────────────────────────────────

/**
 * Runs the full optimization pass:
 *  1. Loads current HealthData and medications.
 *  2. Aggregates time-series arrays into compact summaries.
 *  3. Enforces record-count limits for medications, appointments,
 *     immunizations, and health history.
 *  4. Persists the trimmed HealthData back to the main storage key.
 *  5. Persists all summaries to their dedicated optimizer keys.
 *  6. Updates the last-run timestamp and metrics snapshot.
 *
 * Returns the full optimization result for display in the UI.
 */
export async function runAndPersistOptimization(): Promise<StorageOptimizationResult> {
  // 1. Load live data
  const [healthData, medications] = await Promise.all([
    loadHealthData(),
    loadMedications(),
  ]);

  // 2. Run aggregation + limit enforcement on health data
  const { optimizedData, result, summaries } = runStorageOptimization(healthData);

  // 3. Enforce medication history limit (max 20 inactive)
  const medLimit = enforceMedicationLimit(medications);
  const trimmedMedications = [...medLimit.active, ...medLimit.recentHistory];
  if (medLimit.archivedHistory.length > 0) {
    result.limitEnforcementActions.push(
      `Archived ${medLimit.archivedHistory.length} oldest inactive medication(s) (limit: 20)`,
    );
  }

  // 4. Persist trimmed health data (overwrites main blob)
  await saveHealthData(optimizedData);

  // 5. Persist trimmed medications
  await saveMedications(trimmedMedications);

  // 6. Persist summaries to dedicated keys
  await Promise.all([
    safeSetItem(OPTIMIZER_KEYS.SLEEP_SUMMARIES, JSON.stringify(summaries.sleep)),
    safeSetItem(OPTIMIZER_KEYS.HR_BLOCKS, JSON.stringify(summaries.hrBlocks)),
    safeSetItem(OPTIMIZER_KEYS.RESTING_HR_SUMMARIES, JSON.stringify(summaries.restingHR)),
    safeSetItem(OPTIMIZER_KEYS.BP_SUMMARIES, JSON.stringify(summaries.bloodPressure)),
    safeSetItem(OPTIMIZER_KEYS.GLUCOSE_SUMMARIES, JSON.stringify(summaries.bloodGlucose)),
    safeSetItem(OPTIMIZER_KEYS.ACTIVITY_SUMMARIES, JSON.stringify(summaries.activity)),
    safeSetItem(OPTIMIZER_KEYS.WEIGHT_SUMMARIES, JSON.stringify(summaries.weight)),
    safeSetItem(OPTIMIZER_KEYS.SPO2_SUMMARIES, JSON.stringify(summaries.spo2)),
    safeSetItem(OPTIMIZER_KEYS.LAST_RUN, result.ranAt),
  ]);

  // 7. Build and persist metrics snapshot
  const metrics = buildMetricsSnapshot(result, summaries);
  await safeSetItem(OPTIMIZER_KEYS.METRICS, JSON.stringify(metrics));

  return result;
}

// ─── Load Summaries ───────────────────────────────────────────────────────────

export async function loadSleepSummaries(): Promise<SleepSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.SLEEP_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadHRBlocks(): Promise<HeartRateBlock[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.HR_BLOCKS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadRestingHRSummaries(): Promise<RestingHRSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.RESTING_HR_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadBPSummaries(): Promise<BloodPressureSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.BP_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadGlucoseSummaries(): Promise<BloodGlucoseSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.GLUCOSE_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadActivitySummaries(): Promise<ActivitySummary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.ACTIVITY_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadWeightSummaries(): Promise<WeightSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.WEIGHT_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadSpO2Summaries(): Promise<SpO2Summary[]> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.SPO2_SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function loadLastOptimizedAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OPTIMIZER_KEYS.LAST_RUN);
  } catch { return null; }
}

export async function loadStorageMetrics(): Promise<StorageMetrics | null> {
  try {
    const raw = await AsyncStorage.getItem(OPTIMIZER_KEYS.METRICS);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── Metrics Snapshot Builder ─────────────────────────────────────────────────

function buildMetricsSnapshot(
  result: StorageOptimizationResult,
  summaries: {
    sleep: SleepSummary[];
    hrBlocks: HeartRateBlock[];
    restingHR: RestingHRSummary[];
    bloodPressure: BloodPressureSummary[];
    bloodGlucose: BloodGlucoseSummary[];
    activity: ActivitySummary[];
    weight: WeightSummary[];
    spo2: SpO2Summary[];
  },
): StorageMetrics {
  const LABEL_MAP: Record<string, string> = {
    sleep: 'Sleep',
    heartRate: 'Heart Rate',
    restingHR: 'Resting HR',
    bloodPressure: 'Blood Pressure',
    bloodGlucose: 'Blood Glucose',
    activity: 'Activity',
    weight: 'Weight',
    spo2: 'SpO₂',
  };

  const SUMMARY_COUNT_MAP: Record<string, number> = {
    sleep: summaries.sleep.length,
    heartRate: summaries.hrBlocks.length,
    restingHR: summaries.restingHR.length,
    bloodPressure: summaries.bloodPressure.length,
    bloodGlucose: summaries.bloodGlucose.length,
    activity: summaries.activity.length,
    weight: summaries.weight.length,
    spo2: summaries.spo2.length,
  };

  const estimatedTotalBytes = result.categories.reduce(
    (s, c) => s + c.rawRecordsAfter * 120, // rough average per record
    0,
  );

  return {
    estimatedTotalBytes,
    estimatedSavedBytes: result.totalBytesSaved,
    healthScore: computeStorageHealthScore(estimatedTotalBytes),
    lastOptimizedAt: result.ranAt,
    categories: result.categories.map((c) => ({
      name: c.category,
      label: LABEL_MAP[c.category] ?? c.category,
      isOptimized: c.summariesCreated > 0,
      estimatedSavedBytes: c.estimatedBytesSaved,
      detailRecords: c.rawRecordsAfter,
      summaryRecords: SUMMARY_COUNT_MAP[c.category] ?? 0,
    })),
  };
}
