/**
 * safe-notifications.ts
 *
 * Lazy, guarded wrapper around expo-notifications.
 *
 * WHY THIS EXISTS:
 * On React Native New Architecture (iOS 26+), `PushNotificationManager` is no
 * longer registered as a TurboModule. When `expo-notifications` is imported —
 * even via async dynamic `import()` — Metro evaluates the module synchronously
 * during the bundle's module graph resolution. Inside that evaluation,
 * `PushNotificationIOS.js` calls:
 *
 *   new NativeEventEmitter(NativeModules.PushNotificationManager)
 *
 * `NativeModules.PushNotificationManager` is `null` on New Arch / Expo Go →
 * FATAL: `new NativeEventEmitter() requires a non-null argument`.
 *
 * THE FIX:
 * 1. Check `NativeModules.PushNotificationManager` (or the TurboModule
 *    equivalent) BEFORE attempting to load expo-notifications.
 * 2. If the native module is absent, mark as failed immediately and skip
 *    the import entirely — no crash, notifications silently no-op.
 * 3. Use async dynamic `import()` so the check runs after native init.
 *
 * All public helpers are async. Call them inside useEffect / async handlers only.
 */

import { NativeModules, Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

let _cached: typeof ExpoNotifications | null = null;
let _failed = false;

/**
 * Returns true if the native push notification module is available.
 * On iOS New Architecture / Expo Go, PushNotificationManager is null.
 */
function isPushNotificationNativeModuleAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') return true; // Android doesn't use PushNotificationIOS
  // iOS: check if PushNotificationManager TurboModule is available
  // On New Architecture without the native pod, this will be null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TurboModuleRegistry } = require('react-native');
    if (TurboModuleRegistry) {
      const mod = TurboModuleRegistry.get('PushNotificationManager');
      if (mod === null || mod === undefined) return false;
    }
  } catch (_unused) {
    // TurboModuleRegistry not available — fall back to NativeModules check
  }
  // Legacy arch check
  return !!(NativeModules.PushNotificationManager || NativeModules.RNPushNotification);
}

/**
 * Returns the expo-notifications module, or null if the native module is
 * unavailable (e.g. Expo Go, New Arch without the native pod linked).
 * Safe to call from any async context.
 */
export async function getNotificationsAsync(): Promise<typeof ExpoNotifications | null> {
  if (_failed) return null;
  if (_cached) return _cached;

  // Guard: skip import entirely if the native module isn't available.
  // This prevents the PushNotificationIOS NativeEventEmitter(null) crash.
  if (!isPushNotificationNativeModuleAvailable()) {
    _failed = true;
    return null;
  }

  try {
    _cached = await import('expo-notifications') as typeof ExpoNotifications;
    return _cached;
  } catch (_unused) {
    _failed = true;
    return null;
  }
}

/**
 * Synchronous accessor — returns the cached module if already loaded, or null.
 * Use `getNotificationsAsync()` for first-time access.
 * @deprecated Prefer getNotificationsAsync() for all new code.
 */
export function getNotifications(): typeof ExpoNotifications | null {
  return _cached;
}

/**
 * Convenience: schedule a notification safely. No-ops if the module is unavailable.
 */
export async function scheduleNotificationSafe(
  input: Parameters<typeof ExpoNotifications.scheduleNotificationAsync>[0],
): Promise<string | null> {
  const N = await getNotificationsAsync();
  if (!N) return null;
  try {
    return await N.scheduleNotificationAsync(input);
  } catch (_unused) {
    return null;
  }
}

/**
 * Convenience: cancel a notification safely. No-ops if the module is unavailable.
 */
export async function cancelNotificationSafe(id: string): Promise<void> {
  const N = await getNotificationsAsync();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch (_unused) {}
}

/**
 * Convenience: cancel all notifications safely. No-ops if the module is unavailable.
 */
export async function cancelAllNotificationsSafe(): Promise<void> {
  const N = await getNotificationsAsync();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch (_unused) {}
}
