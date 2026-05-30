/**
 * migration.ts — Plaintext → Encrypted AsyncStorage migration for VitalSync.
 *
 * Strategy
 * --------
 * On app launch (called from the root layout), this module checks each
 * sensitive AsyncStorage key.  If the stored value is plaintext (not an
 * encrypted envelope), it:
 *
 *   1. Reads the plaintext value.
 *   2. Encrypts and writes the encrypted value to the SAME key.
 *   3. Reads back and verifies the encrypted value decrypts correctly.
 *   4. Only after verification succeeds, the plaintext is considered replaced.
 *
 * If any step fails, the plaintext is left in place and the migration is
 * retried on the next app launch.  The app NEVER crashes due to migration
 * failures — it simply continues with whatever data is available.
 *
 * Dynamic keys (dictation history)
 * ---------------------------------
 * Keys matching the pattern `@vsht:dictation_history:*` are discovered
 * at runtime by scanning all AsyncStorage keys.
 *
 * Migration state
 * ---------------
 * A lightweight flag `@vsht:migration_v1_done` is stored in AsyncStorage
 * (not SecureStore) to skip the scan on subsequent launches once all keys
 * have been migrated.  This flag is NOT sensitive.
 *
 * Safe rollback
 * -------------
 * If the encryption key is unavailable (SecureStore failure), the migration
 * is skipped entirely and the flag is NOT set, so it will retry next launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptedSetItem, encryptedGetItem, isEncrypted, initEncryptionKey } from './encrypted-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Sensitive keys to migrate ────────────────────────────────────────────────

/**
 * Static list of sensitive AsyncStorage keys that must be encrypted.
 * Dynamic keys (e.g. dictation_history:*) are discovered at runtime.
 */
export const SENSITIVE_KEYS: string[] = [
  '@vsht:health_data',
  '@vsht:medications',
  '@vsht:userProfile',
  '@vsht:thresholds',
  '@vsht:glucose_thresholds',
  '@vsht:alertHistory',
  '@vsht:activity_log_v1',
  '@vsht:ice_vault',
  '@vsht:allergies',
  '@vsht:dose_log_archive',
  '@vsht:readiness_history_v1',
  '@vsht:reminder_history',
  '@vsht:smart_reminder_snooze_map',
  '@vsht:pairedBleDevices',
  '@vsht:bleDeviceLabels',
  '@vitalsync/oura_tokens',
  '@vsht:last_ai_scan_preview',
  '@vsht:batch_scribe_pending',
  '@vsht:readiness_baseline',
  '@vsht:labResults',
  '@vsht:immunizations',
  '@vsht:conditions',
  '@vsht:doctors',
  '@vsht:appointments',
  '@vsht:insurance',
  '@vsht:documents',
  '@vsht:food_log',
  '@vsht:water_log',
  '@vsht:sleep_log',
  '@vsht:mood_log',
];

/** Prefix for dynamically-keyed dictation history entries. */
const DICTATION_HISTORY_PREFIX = '@vsht:dictation_history:';

/** AsyncStorage key for the migration completion flag. */
const MIGRATION_FLAG_KEY = '@vsht:migration_v1_done';

// ─── Migration logic ──────────────────────────────────────────────────────────

/**
 * Migrates a single key from plaintext to encrypted storage.
 *
 * Returns:
 *   'skipped'   — key does not exist or is already encrypted
 *   'migrated'  — successfully migrated
 *   'failed'    — migration failed (plaintext preserved)
 */
async function migrateKey(key: string): Promise<'skipped' | 'migrated' | 'failed'> {
  try {
    // Check if already encrypted
    const alreadyEncrypted = await isEncrypted(key);
    if (alreadyEncrypted) return 'skipped';

    // Read plaintext value
    const plaintext = await AsyncStorage.getItem(key);
    if (plaintext === null) return 'skipped'; // key doesn't exist

    // Write encrypted value
    const writeOk = await encryptedSetItem(key, plaintext);
    if (!writeOk) return 'failed';

    // Verify: read back and decrypt
    const readBack = await encryptedGetItem(key);
    if (readBack !== plaintext) {
      // Verification failed — restore plaintext to be safe
      await safeSetItem(key, plaintext);
      return 'failed';
    }

    return 'migrated';
  } catch {
    return 'failed';
  }
}

/**
 * Discovers all dynamic dictation history keys currently in AsyncStorage.
 */
async function discoverDictationKeys(): Promise<string[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys.filter((k) => k.startsWith(DICTATION_HISTORY_PREFIX));
  } catch {
    return [];
  }
}

/**
 * Runs the full migration on app launch.
 *
 * - Safe to call multiple times (idempotent via migration flag).
 * - Never throws — all errors are caught and logged.
 * - Returns a summary object for optional telemetry/debugging.
 */
export async function runStorageMigration(): Promise<{
  alreadyDone: boolean;
  migrated: number;
  skipped: number;
  failed: number;
  failedKeys: string[];
}> {
  const result = { alreadyDone: false, migrated: 0, skipped: 0, failed: 0, failedKeys: [] as string[] };

  try {
    // Check if migration already completed
    const flag = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (flag === '1') {
      result.alreadyDone = true;
      return result;
    }

    // Ensure encryption key is available before starting
    await initEncryptionKey();

    // Build the full list of keys to migrate
    const dictationKeys = await discoverDictationKeys();
    const allKeys = [...SENSITIVE_KEYS, ...dictationKeys];

    // Migrate each key
    for (const key of allKeys) {
      const outcome = await migrateKey(key);
      if (outcome === 'migrated') {
        result.migrated++;
      } else if (outcome === 'skipped') {
        result.skipped++;
      } else {
        result.failed++;
        result.failedKeys.push(key);
      }
    }

    // Only set the completion flag if there were no failures
    if (result.failed === 0) {
      await safeSetItem(MIGRATION_FLAG_KEY, '1');
    }
    // If there were failures, the flag is NOT set — migration retries next launch
  } catch {
    // Swallow all errors — migration failure must never crash the app
  }

  return result;
}

/**
 * Resets the migration flag so the migration runs again on next launch.
 * Use this after a data wipe or key rotation.
 */
export async function resetMigrationFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MIGRATION_FLAG_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Returns true if the migration has been completed successfully.
 */
export async function isMigrationComplete(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    return flag === '1';
  } catch {
    return false;
  }
}
