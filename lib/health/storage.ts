/**
 * VitalSync Local Storage Layer
 * All health data is stored locally using AsyncStorage.
 * No data leaves the device unless the user explicitly generates a Personal Health Report.
 *
 * ─── Schema Versioning ───────────────────────────────────────────────────────
 *
 * Every time a new field is added to HealthData, bump CURRENT_SCHEMA_VERSION
 * and add a migration function to MIGRATIONS keyed by the version it produces.
 *
 * How it works:
 *   1. On load, we read "@vsht:schema_version" from AsyncStorage.
 *   2. We run every migration whose target version is > stored version, in order.
 *   3. After all migrations run we write the new version back to AsyncStorage.
 *   4. Migrations are idempotent — running them on already-migrated data is safe.
 *
 * Adding a new field (example):
 *   1. Add the field to HealthData in types.ts.
 *   2. Add it to emptyHealthData() below.
 *   3. Bump CURRENT_SCHEMA_VERSION by 1.
 *   4. Add a migration function: MIGRATIONS[CURRENT_SCHEMA_VERSION] = (d) => { d.newField ??= []; }.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureSetItem, secureMultiSet, secureGetItem } from '@/lib/storage/health-storage';
import { encryptedRemoveItem } from '@/lib/storage/encrypted-storage';
import { loadRetentionMonths } from '@/lib/retention-settings';
import type { HealthData } from './types';
import { mergeAndAggregateBP } from './bp-aggregation';

// ─── Keys ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "@vsht:health_data";
const SCHEMA_VERSION_KEY = "@vsht:schema_version";

// ─── Schema Version ───────────────────────────────────────────────────────────

/**
 * The schema version this build of the app expects.
 * Increment this whenever HealthData gains new fields and add a migration below.
 */
export const CURRENT_SCHEMA_VERSION = 11;

// ─── Migration Functions ──────────────────────────────────────────────────────

/**
 * Each entry migrates stored data from version (key - 1) to version (key).
 * Mutations are applied in-place on the parsed HealthData object.
 * Migrations MUST be idempotent — running them twice must produce the same result.
 */
type MigrationFn = (data: Record<string, unknown>) => void;

const MIGRATIONS: Record<number, MigrationFn> = {
  /**
   * v1 → v2 (introduced in build with manual-entry + medication + sodium fields):
   * Backfill all 13 array fields that may be absent in data written by v1 builds.
   * v1 builds only persisted: bloodPressure, pulse, bodyComposition, sleep.
   */
  2: (data) => {
    const ensureArray = (key: string) => {
      if (!Array.isArray(data[key])) data[key] = [];
    };
    ensureArray("bloodPressure");
    ensureArray("pulse");
    ensureArray("bodyComposition");
    ensureArray("sleep");
    ensureArray("weight");
    ensureArray("vitalSigns");
    ensureArray("bloodSugar");
    ensureArray("activity");
    ensureArray("sodiumIntake");
    // Ensure scalar fields have safe defaults
    if (data["lastSyncedAt"] === undefined) data["lastSyncedAt"] = null;
  },

  /**
   * v2 → v3: Added labResults array (Lab Tracker feature).
   */
  3: (data) => {
    if (!Array.isArray(data['labResults'])) data['labResults'] = [];
  },
  /**
   * v3 → v4: Schema migration (legacy field cleanup).
   */
  4: (_data) => {
  },
  /**
   * v4 → v5: Added medicalHistory and surgicalHistory arrays.
   */
  5: (data) => {
    if (!Array.isArray(data['medicalHistory'])) data['medicalHistory'] = [];
    if (!Array.isArray(data['surgicalHistory'])) data['surgicalHistory'] = [];
  },
  /**
   * v5 → v6: Added mealIQAnalyses array.
   */
  6: (data) => {
    if (!Array.isArray(data['mealIQAnalyses'])) data['mealIQAnalyses'] = [];
  },
  /**
   * v7 → v8: Added immunizations and appointments arrays.
   * These fields existed in the HealthData type but were missing from emptyHealthData
   * and from all previous migrations, so existing users never had them initialised.
   */
  8: (data) => {
    if (!Array.isArray(data['immunizations'])) data['immunizations'] = [];
    if (!Array.isArray(data['appointments'])) data['appointments'] = [];
  },
  /**
   * v8 → v9: Added allergies array (Allergy Log feature).
   */
  9: (data) => {
    if (!Array.isArray(data['allergies'])) data['allergies'] = [];
  },
  /**
   * v9 → v10: Added allergyStatus field (NKDA / NKA).
   */
  10: (data) => {
    if (data['allergyStatus'] === undefined) data['allergyStatus'] = null;
  },
  /**
   * v10 → v11: Added restingHRSamples array (Resting Heart Rate from Apple Watch).
   */
  11: (data) => {
    if (!Array.isArray(data['restingHRSamples'])) data['restingHRSamples'] = [];
  },
};

// ─── Migration Runner ─────────────────────────────────────────────────────────

/**
 * Reads the stored schema version, runs all pending migrations in order,
 * and writes the updated version back. Returns the (possibly mutated) data.
 *
 * @param data  Parsed HealthData from AsyncStorage (mutated in-place).
 * @returns     The stored schema version BEFORE migrations ran (0 = never set).
 */
export async function runMigrations(
  data: Record<string, unknown>
): Promise<{ fromVersion: number; toVersion: number; migrationsRan: number[] }> {
  let storedVersion = 0;
  try {
    const raw = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    if (raw !== null) storedVersion = parseInt(raw, 10) || 0;
  } catch (_unused) {
    // If the key is unreadable, treat as version 0 (run all migrations).
  }

  const migrationsRan: number[] = [];

  for (let v = storedVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (migrate) {
      migrate(data);
      migrationsRan.push(v);
    }
  }

  if (migrationsRan.length > 0) {
    try {
      await safeSetItem(
        SCHEMA_VERSION_KEY,
        String(CURRENT_SCHEMA_VERSION)
      );
    } catch (e) {
      console.warn("[VitalSync] Failed to write schema version:", e);
    }
  }

  return { fromVersion: storedVersion, toVersion: CURRENT_SCHEMA_VERSION, migrationsRan };
}

// ─── Empty Data ───────────────────────────────────────────────────────────────

/** Empty health data for first-time users — no mock/demo data in production. */
export function emptyHealthData(): HealthData {
  return {
    bloodPressure: [],
    pulse: [],
    bodyComposition: [],
    sleep: [],
    lastSyncedAt: null,
    weight: [],
    vitalSigns: [],
    bloodSugar: [],
    activity: [],
    sodiumIntake: [],
    labResults: [],
    medicalHistory: [],
    surgicalHistory: [],
    mealIQAnalyses: [],
    appointments: [],
    immunizations: [],
    allergies: [],
    allergyStatus: null,
    restingHRSamples: [],
  };
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadHealthData(): Promise<HealthData> {
  try {
    // Use secureGetItem to transparently decrypt if the data is encrypted.
    const raw = await secureGetItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Run any pending schema migrations before returning data to the app.
      const { migrationsRan } = await runMigrations(parsed);
      if (migrationsRan.length > 0) {
        // Persist the migrated data immediately so the next load is clean.
        await secureSetItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed as unknown as HealthData;
    }
  } catch (e) {
    console.warn("[VitalSync] Failed to load health data:", e);
  }
  // First launch: write schema version immediately so no migrations run next time.
  try {
    await safeSetItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
  } catch (_unused) {
    // Best-effort
  }
  return emptyHealthData();
}


// ─── Prune ────────────────────────────────────────────────────────────────────
/**
 * Trim time-series arrays in a HealthData blob to the specified retention window.
 *
 * Arrays pruned (high-volume, time-stamped):
 *   bloodPressure, pulse, bodyComposition, weight, vitalSigns, bloodSugar,
 *   activity, sodiumIntake, sleep, mealIQAnalyses
 *
 * Arrays preserved (permanent clinical records):
 *   labResults, medicalHistory, surgicalHistory, immunizations, allergies,
 *   appointments (future appointments must never be pruned)
 *
 * @param data          The HealthData object to prune (mutated in-place).
 * @param retentionMonths  Number of months to retain (default: 12).
 */
export function pruneHealthData(data: HealthData, retentionMonths = 12): HealthData {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);
  const cutoffMs = cutoff.getTime();

  function trimByTimestamp<T extends { timestamp: string }>(arr: T[] | undefined): T[] {
    if (!arr) return [];
    return arr.filter((r) => new Date(r.timestamp).getTime() >= cutoffMs);
  }
  function trimByDate<T extends { date: string }>(arr: T[] | undefined): T[] {
    if (!arr) return [];
    return arr.filter((r) => new Date(r.date).getTime() >= cutoffMs);
  }
  function trimByAnalyzedAt<T extends { analyzedAt: string }>(arr: T[] | undefined): T[] {
    if (!arr) return [];
    return arr.filter((r) => new Date(r.analyzedAt).getTime() >= cutoffMs);
  }

  return {
    ...data,
    bloodPressure:   trimByTimestamp(data.bloodPressure),
    pulse:           trimByTimestamp(data.pulse),
    bodyComposition: trimByTimestamp(data.bodyComposition),
    weight:          trimByTimestamp(data.weight),
    vitalSigns:      trimByTimestamp(data.vitalSigns),
    bloodSugar:      trimByTimestamp(data.bloodSugar),
    activity:        trimByTimestamp(data.activity),
    sodiumIntake:    trimByTimestamp(data.sodiumIntake),
    sleep:           trimByDate(data.sleep),
    mealIQAnalyses:  trimByAnalyzedAt(data.mealIQAnalyses),
    // Resting HR: keep the freshest 30 days (Apple Watch writes one per day)
    restingHRSamples: trimByTimestamp(data.restingHRSamples as any),
    // Preserved arrays (not pruned)
    labResults:      data.labResults,
    medicalHistory:  data.medicalHistory,
    surgicalHistory: data.surgicalHistory,
    immunizations:   data.immunizations,
    allergies:       data.allergies,
    allergyStatus:   data.allergyStatus,
    appointments:    data.appointments,
  };
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveHealthData(data: HealthData): Promise<void> {
  try {
    // Prune time-series arrays to the user's retention window before writing.
    const retentionMonths = await loadRetentionMonths();
    const pruned = pruneHealthData(data, retentionMonths);
    // Use secureMultiSet: STORAGE_KEY is sensitive and will be encrypted;
    // SCHEMA_VERSION_KEY is non-sensitive and goes through safeSetItem.
    await secureMultiSet([
      [STORAGE_KEY, JSON.stringify(pruned)],
      [SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION)],
    ]);
  } catch (e) {
    console.warn("[VitalSync] Failed to save health data:", e);
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

/**
 * VITAL SIGNS ONLY — keys that contain raw vital sign readings, caches, and
 * trend data. This list intentionally excludes settings, preferences, reminders,
 * account state, medications, nutrition logs, and clinical records.
 *
 * Preserved (not cleared):
 *   - @vsht:lang_override, colorScheme, scheduledDark, rtl_enabled
 *   - @vsht:hasOnboarded, consent_accepted, gdprConsentAccepted
 *   - @vsht:enc_key_v1, migration_v1_done (encryption infrastructure)
 *   - @vsht:pairedBleDevices, bleDeviceLabels (BLE device trust)
 *   - @vsht:medications, dose_log_archive (medication management)
 *   - @vsht:reminder_history, smart_reminder_* (reminders)
 *   - @vsht:doctors, appointments, insurance, immunizations, conditions
 *   - @vsht:food_log, water_log, mood_log (nutrition / lifestyle logs)
 *   - @vsht:userProfile, ice_vault (identity / emergency)
 *   - @vsht:thresholds, glucose_thresholds, analyte_thresholds (alert config)
 *   - @vsht:insight_cooldown_*, config_audit_log_v1 (app config)
 *   - @vsht:install_id, whatsNewSeenVersion, appReviewState
 */
export const VITAL_SIGNS_KEYS: string[] = [
  // ── Core health data blob (all vital sign arrays live here) ──
  '@vsht:health_data',
  '@vsht:schema_version',
  // ── Readiness / HRV trend ──
  '@vsht:readiness_history_v1',
  '@vsht:readiness_baseline',
  // ── Activity log (step/workout cache) ──
  '@vsht:activity_log_v1',
  // ── Background sync staging buffers ──
  '@vsht:bg_bp_staging',
  '@vsht:bg_last_sync_time',
  '@vsht:last_hk_bg_sync',
  // ── AI scan / trend preview cache ──
  '@vsht:last_ai_scan_preview',
  // ── Batch scribe drafts (unprocessed vital entry drafts) ──
  '@vsht:batch_scribe_pending',
  // ── Notification cooldown timestamps for vital-sign alerts ──
  // (NOT the threshold config — that is a user setting)
  '@vsht:hrv_target_notif_last',
  '@vsht:glucose_high_notif_last',
  '@vsht:glucose_low_notif_last',
  '@vsht:glucose_recheck',
  // ── Alert history (fired threshold alerts log) ──
  '@vsht:alertHistory',
  '@vsht:alertUnreadCount',
  '@vsht:alertHistoryFilter',
  // ── Source filter UI state (resets to 'all' after clear) ──
  '@vsht:vitalsSourceFilter',
  '@vsht:glucoseSourceFilter',
  // ── HealthKit / Health Connect sync state ──
  '@vsht:first_healthkit_sync_seen_v1',
  '@vsht:hk_perm_granted_v1',
  '@vsht:hk_perm_denied_v1',
  '@vsht:hk_unavailable_banner_dismissed',
  // ── Oura OAuth tokens (synced vital data source) ──
  '@vitalsync/oura_tokens',
  // ── Dictation history entries are dynamically keyed — handled below ──
];

/** Prefix for dynamically-keyed dictation history entries. */
const DICTATION_HISTORY_PREFIX = '@vsht:dictation_history:';

/**
 * Clears ONLY locally stored vital signs data.
 *
 * This function:
 *   - Removes all keys listed in VITAL_SIGNS_KEYS from both plaintext and
 *     encrypted storage.
 *   - Removes all dynamically-keyed dictation history entries.
 *   - Does NOT touch settings, preferences, reminders, medications, nutrition,
 *     clinical records, BLE paired devices, account state, or encryption keys.
 *   - Does NOT call AsyncStorage.clear() — no global wipe.
 *   - Clears only the local app cache for HealthKit/Health Connect synced data;
 *     source data in Apple Health or Android Health Connect is untouched.
 *
 * Returns an object with the count of keys removed and any errors encountered.
 */
export async function clearVitalSignsData(): Promise<{ removed: number; errors: string[] }> {
  const errors: string[] = [];
  let removed = 0;

  // 1. Remove static vital-signs keys from both encrypted and plaintext storage.
  for (const key of VITAL_SIGNS_KEYS) {
    try {
      // Remove from encrypted layer (no-op if not encrypted)
      await encryptedRemoveItem(key);
      // Remove from plaintext AsyncStorage (no-op if not present)
      await AsyncStorage.removeItem(key);
      removed++;
    } catch (e) {
      errors.push(`${key}: ${String(e)}`);
    }
  }

  // 2. Remove all dynamically-keyed dictation history entries.
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const dictationKeys = allKeys.filter((k) => k.startsWith(DICTATION_HISTORY_PREFIX));
    if (dictationKeys.length > 0) {
      for (const k of dictationKeys) {
        await encryptedRemoveItem(k).catch(() => {});
      }
      await AsyncStorage.multiRemove(dictationKeys);
      removed += dictationKeys.length;
    }
  } catch (e) {
    errors.push(`dictation_history: ${String(e)}`);
  }

  if (errors.length > 0) {
    console.warn('[VitalSync] clearVitalSignsData completed with errors:', errors.length);
  }

  return { removed, errors };
}

/**
 * @deprecated Use clearVitalSignsData() for scoped vital-signs-only deletion.
 * This function is retained for the "Delete All My Data" nuclear option in Settings.
 */
export async function clearHealthData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEY, SCHEMA_VERSION_KEY]);
  } catch (e) {
    console.warn('[VitalSync] Failed to clear health data:', e);
  }
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export async function mergeHealthData(incoming: Partial<HealthData>): Promise<HealthData> {
  const existing = await loadHealthData();

  // Helper: merge two arrays by id, keeping existing records and appending new ones
  function mergeById<T extends { id: string }>(existingArr: T[], incomingArr: T[] | undefined): T[] {
    if (!incomingArr || incomingArr.length === 0) return existingArr;
    const existingIds = new Set(existingArr.map((r) => r.id));
    return [...existingArr, ...incomingArr.filter((r) => !existingIds.has(r.id))];
  }

  // BP merge: deduplicate by id, then apply the 4-per-day cap and
  // 3rd-reading averaging rule via mergeAndAggregateBP.
  function mergeBPByTimestamp(
    existingArr: HealthData['bloodPressure'],
    incomingArr: HealthData['bloodPressure'] | undefined,
  ): HealthData['bloodPressure'] {
    if (!incomingArr || incomingArr.length === 0) return existingArr;
    return mergeAndAggregateBP(existingArr, incomingArr);
  }

  const merged: HealthData = {
    bloodPressure: mergeBPByTimestamp(existing.bloodPressure, incoming.bloodPressure),
    pulse: mergeById(existing.pulse, incoming.pulse),
    bodyComposition: mergeById(existing.bodyComposition, incoming.bodyComposition),
    sleep: mergeById(existing.sleep, incoming.sleep),
    lastSyncedAt: new Date().toISOString(),
    weight: mergeById(existing.weight ?? [], incoming.weight),
    vitalSigns: mergeById(existing.vitalSigns ?? [], incoming.vitalSigns),
    bloodSugar: mergeById(existing.bloodSugar ?? [], incoming.bloodSugar),
    activity: mergeById(existing.activity ?? [], incoming.activity),
    // Scalar fields: prefer incoming value if present (it's always the most recent sync result)
    steps: incoming.steps !== undefined ? incoming.steps : existing.steps,
    activeCaloriesBurned: incoming.activeCaloriesBurned !== undefined ? incoming.activeCaloriesBurned : existing.activeCaloriesBurned,
    restingHR: incoming.restingHR !== undefined ? incoming.restingHR : existing.restingHR,
    // restingHRSamples: always replace with the freshest 30-day window from the latest sync
    restingHRSamples: incoming.restingHRSamples !== undefined ? incoming.restingHRSamples : existing.restingHRSamples,
    sodiumIntake: mergeById(existing.sodiumIntake ?? [], incoming.sodiumIntake),
    labResults: mergeById(existing.labResults ?? [], incoming.labResults),
    medicalHistory: incoming.medicalHistory ?? existing.medicalHistory ?? [],
    surgicalHistory: incoming.surgicalHistory ?? existing.surgicalHistory ?? [],
    mealIQAnalyses: mergeById(existing.mealIQAnalyses ?? [], incoming.mealIQAnalyses),
    appointments: mergeById(existing.appointments ?? [], incoming.appointments),
    immunizations: mergeById(existing.immunizations ?? [], incoming.immunizations),
    allergies: mergeById(existing.allergies ?? [], incoming.allergies),
    allergyStatus: incoming.allergyStatus !== undefined ? incoming.allergyStatus : existing.allergyStatus,
  };
  await saveHealthData(merged);
  return merged;
}
