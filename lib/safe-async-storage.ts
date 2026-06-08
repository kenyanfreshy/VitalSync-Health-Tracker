/**
 * safeAsyncStorage — crash-safe AsyncStorage wrappers for VitalSync.
 *
 * Background
 * ----------
 * On iOS, RNCAsyncStorage._writeManifest throws an NSException when a value
 * exceeds the ~6 MB per-key cap (or when the underlying file write fails).
 * On iOS 26 Beta that exception is caught by the React TurboModule bridge and
 * re-thrown as a JS error via convertNSExceptionToJSError, which calls
 * jsi::Object::setProperty while the Hermes GC (HadesGC) is concurrently
 * compacting the heap on a background thread.  The GC's HiddenClass::findProperty
 * dereferences a pointer that has already been moved → KERN_INVALID_ADDRESS →
 * SIGSEGV on Thread 9.
 *
 * Fix
 * ---
 * 1. safeSetItem / safeMultiSet check the serialized size before writing.
 *    If the value exceeds SIZE_TELEMETRY_BYTES (500 KB) a telemetry entry is
 *    logged to the crash logger.
 *    If the value exceeds SIZE_ALERT_BYTES (3 MB) a push notification is fired
 *    to warn the user before the hard limit is reached.
 *    If the value exceeds SIZE_HARD_LIMIT (4 MB) the write is skipped entirely
 *    to avoid triggering the NSException.
 * 2. Every write is wrapped in try/catch so that any remaining exception is
 *    swallowed and logged rather than propagated to the TurboModule bridge.
 *
 * Usage
 * -----
 *   import { safeSetItem, safeMultiSet } from '@/lib/safe-async-storage';
 *
 *   // Drop-in replacement for AsyncStorage.setItem:
 *   await safeSetItem('@myapp:key', JSON.stringify(data));
 *
 *   // Drop-in replacement for AsyncStorage.multiSet:
 *   await safeMultiSet([['@myapp:a', valA], ['@myapp:b', valB]]);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleNotificationSafe } from '@/lib/notifications/safe-notifications';

/** Log size telemetry when a single value exceeds this size (bytes). */
const SIZE_TELEMETRY_BYTES = 500 * 1024; // 500 KB

/** Warn in console when a single value exceeds this size (bytes). */
const SIZE_WARN_BYTES = 900 * 1024; // 900 KB

/** Fire a push notification warning when a key exceeds this size (bytes). */
const SIZE_ALERT_BYTES = 3 * 1024 * 1024; // 3 MB

/** Refuse to write values larger than this to avoid the iOS NSException. */
const SIZE_HARD_LIMIT = 4 * 1024 * 1024; // 4 MB

/**
 * Throttle: only fire one push notification per key per session to avoid
 * spamming the user if the same large key is written repeatedly.
 */
const _alertedKeys = new Set<string>();

/** Friendly label for a storage key (strips the @vsht: prefix). */
function keyLabel(key: string): string {
  return key.replace(/^@vitalsync[:/]/, '').replace(/_/g, ' ');
}

/**
 * Emit size telemetry via the session-once emitter in storage-telemetry.ts.
 * Session-once deduplication prevents flooding the crash log when the same
 * large key is written repeatedly (e.g. background sync every 2 seconds).
 * Lazy import avoids a circular dependency:
 *   safe-async-storage → storage-telemetry → crash-logger → safe-async-storage
 */
async function emitSizeTelemetry(key: string, sizeBytes: number): Promise<void> {
  try {
    const { emitStorageTelemetry } = await import('@/lib/storage-telemetry');
    await emitStorageTelemetry(key, sizeBytes);
  } catch (_unused) {
    // Non-fatal — telemetry is best-effort
  }
}

/**
 * Fire a push notification warning when a key exceeds 3 MB.
 * Uses scheduleNotificationSafe so it no-ops gracefully if notifications
 * are unavailable (Expo Go, New Arch without the native pod).
 */
async function emitStorageSizeAlert(key: string, sizeBytes: number): Promise<void> {
  if (_alertedKeys.has(key)) return; // already alerted this session
  _alertedKeys.add(key);

  try {
    await scheduleNotificationSafe({
      content: {
        title: 'Storage Warning',
        body:
          `"${keyLabel(key)}" is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB — ` +
          'approaching the 4 MB limit. Reduce your data retention window in ' +
          'Settings → Privacy to prevent data loss.',
        data: { type: 'storage_size_alert', key, sizeBytes },
      },
      trigger: null, // deliver immediately
    });
  } catch (_unused) {
    // Non-fatal — notification is best-effort
  }
}

/**
 * Safe replacement for `AsyncStorage.getItem`.
 * Swallows errors and returns null instead of throwing, so callers
 * don't need individual try/catch blocks.
 */
export async function safeGetItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (err) {
    console.warn(`[safeAsyncStorage] getItem("${key}") failed:`, err);
    return null;
  }
}

/**
 * Safe replacement for `AsyncStorage.setItem`.
 * - Logs size telemetry if the value exceeds 500 KB.
 * - Warns in console if the value exceeds 900 KB.
 * - Fires a push notification if the value exceeds 3 MB.
 * - Skips the write (and logs an error) if the value exceeds 4 MB.
 * - Wraps the write in try/catch so exceptions never reach the TurboModule bridge.
 */
export async function safeSetItem(key: string, value: string): Promise<void> {
  const size = value.length; // UTF-16 code units ≈ bytes for ASCII/Latin content

  if (size > SIZE_HARD_LIMIT) {
    console.error(
      `[safeAsyncStorage] SKIPPED write to "${key}": value is ${(size / 1024).toFixed(0)} KB, ` +
      `which exceeds the ${SIZE_HARD_LIMIT / 1024 / 1024} MB hard limit. ` +
      'Trim the data before saving to prevent iOS SIGSEGV.',
    );
    // Still emit telemetry so the Storage Health row surfaces this key
    void emitSizeTelemetry(key, size);
    return;
  }

  if (size > SIZE_ALERT_BYTES) {
    console.warn(
      `[safeAsyncStorage] ALERT: "${key}" is ${(size / 1024 / 1024).toFixed(1)} MB — ` +
      'approaching the 4 MB hard limit. Firing push notification.',
    );
    void emitSizeTelemetry(key, size);
    void emitStorageSizeAlert(key, size);
  } else if (size > SIZE_WARN_BYTES) {
    console.warn(
      `[safeAsyncStorage] Large write to "${key}": ${(size / 1024).toFixed(0)} KB. ` +
      'Consider trimming historical data to stay under 900 KB.',
    );
    void emitSizeTelemetry(key, size);
  } else if (size > SIZE_TELEMETRY_BYTES) {
    void emitSizeTelemetry(key, size);
  }

  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    console.error(`[safeAsyncStorage] setItem("${key}") failed:`, err);
  }
}

/**
 * Safe replacement for `AsyncStorage.multiSet`.
 * Each pair is size-checked independently; oversized pairs are dropped.
 * Wraps the write in try/catch so exceptions never reach the TurboModule bridge.
 */
export async function safeMultiSet(pairs: [string, string][]): Promise<void> {
  const safe: [string, string][] = [];
  for (const [key, value] of pairs) {
    const size = value.length;
    if (size > SIZE_HARD_LIMIT) {
      console.error(
        `[safeAsyncStorage] SKIPPED multiSet pair "${key}": value is ${(size / 1024).toFixed(0)} KB, ` +
        `which exceeds the ${SIZE_HARD_LIMIT / 1024 / 1024} MB hard limit.`,
      );
      void emitSizeTelemetry(key, size);
      continue;
    }
    if (size > SIZE_ALERT_BYTES) {
      console.warn(
        `[safeAsyncStorage] ALERT: multiSet pair "${key}" is ${(size / 1024 / 1024).toFixed(1)} MB.`,
      );
      void emitSizeTelemetry(key, size);
      void emitStorageSizeAlert(key, size);
    } else if (size > SIZE_WARN_BYTES) {
      console.warn(
        `[safeAsyncStorage] Large multiSet pair "${key}": ${(size / 1024).toFixed(0)} KB.`,
      );
      void emitSizeTelemetry(key, size);
    } else if (size > SIZE_TELEMETRY_BYTES) {
      void emitSizeTelemetry(key, size);
    }
    safe.push([key, value]);
  }
  if (safe.length === 0) return;
  try {
    await AsyncStorage.multiSet(safe);
  } catch (err) {
    console.error('[safeAsyncStorage] multiSet failed:', err);
  }
}

/**
 * Safe replacement for `AsyncStorage.removeItem`.
 * Wraps the call in try/catch.
 */
export async function safeRemoveItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.error(`[safeAsyncStorage] removeItem("${key}") failed:`, err);
  }
}

/**
 * Exposed for testing: reset the per-session alert deduplication set.
 */
export function _resetAlertedKeysForTesting(): void {
  _alertedKeys.clear();
}
