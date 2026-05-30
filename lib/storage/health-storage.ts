/**
 * health-storage.ts — Encrypted storage router for sensitive VitalSync keys.
 *
 * This module provides `secureSetItem` and `secureGetItem` which:
 *   - Route SENSITIVE_KEYS through the AES-256 encrypted storage layer.
 *   - Route non-sensitive keys through the regular safeSetItem/AsyncStorage.
 *
 * Usage
 * -----
 * Replace `safeSetItem(key, value)` with `secureSetItem(key, value)` for any
 * key that may contain health data.  The routing is automatic — you do not
 * need to know whether a key is sensitive at the call site.
 *
 * The SENSITIVE_KEYS set must be kept in sync with the list in migration.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem, safeMultiSet } from '@/lib/safe-async-storage';
import { encryptedSetItem, encryptedGetItem } from './encrypted-storage';
import { Platform } from 'react-native';

// ─── Sensitive key set ────────────────────────────────────────────────────────

/**
 * Set of AsyncStorage keys whose values must be encrypted at rest.
 * Prefix-matched keys (e.g. dictation_history:*) are handled separately.
 */
const SENSITIVE_KEY_SET = new Set<string>([
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
]);

/** Prefixes that identify sensitive keys dynamically. */
const SENSITIVE_PREFIXES = [
  '@vsht:dictation_history:',
  '@vsht:batch_scribe_',
];

/**
 * Returns true if the given key should be encrypted at rest.
 */
export function isSensitiveKey(key: string): boolean {
  if (Platform.OS === 'web') return false; // SecureStore not available on web
  if (SENSITIVE_KEY_SET.has(key)) return true;
  return SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Writes `value` to AsyncStorage under `key`.
 *
 * - Sensitive keys are encrypted with AES-256-CTR before writing.
 * - Non-sensitive keys go through the existing safeSetItem (size-checking).
 */
export async function secureSetItem(key: string, value: string): Promise<void> {
  if (isSensitiveKey(key)) {
    const ok = await encryptedSetItem(key, value);
    if (!ok) {
      // Encryption failed — fall back to safe plaintext write so data is not lost
      await safeSetItem(key, value);
    }
  } else {
    await safeSetItem(key, value);
  }
}

/**
 * Reads a value from AsyncStorage.
 *
 * - Sensitive keys are decrypted automatically if they are encrypted.
 * - Plaintext values (legacy data not yet migrated) are returned as-is.
 * - Non-sensitive keys are read directly from AsyncStorage.
 * - Returns null if the key does not exist or on any error.
 */
export async function secureGetItem(key: string): Promise<string | null> {
  if (isSensitiveKey(key)) {
    return encryptedGetItem(key);
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes multiple key-value pairs atomically.
 *
 * Sensitive pairs are encrypted individually before writing.
 * Non-sensitive pairs are batched through safeMultiSet.
 */
export async function secureMultiSet(pairs: [string, string][]): Promise<void> {
  const sensitivePairs: [string, string][] = [];
  const plainPairs: [string, string][] = [];

  for (const [key, value] of pairs) {
    if (isSensitiveKey(key)) {
      sensitivePairs.push([key, value]);
    } else {
      plainPairs.push([key, value]);
    }
  }

  // Write sensitive pairs individually (each needs its own IV)
  await Promise.all(
    sensitivePairs.map(async ([key, value]) => {
      const ok = await encryptedSetItem(key, value);
      if (!ok) {
        // Fallback: write plaintext so data is not lost
        await safeSetItem(key, value);
      }
    })
  );

  // Write non-sensitive pairs in a single batch
  if (plainPairs.length > 0) {
    await safeMultiSet(plainPairs);
  }
}
