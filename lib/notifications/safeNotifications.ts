/**
 * safeNotifications.ts
 *
 * Safe notification service wrapper for VitalSync iOS production builds.
 *
 * ─── CRASH CONTEXT ────────────────────────────────────────────────────────────
 * Build 2.8.31 / iOS New Architecture (Expo Go + TestFlight):
 *
 *   [FATAL] `new NativeEventEmitter()` requires a non-null argument.
 *
 * Root cause:
 *   react-native/Libraries/PushNotificationIOS/PushNotificationIOS.js calls
 *   `new NativeEventEmitter(NativePushNotificationManagerIOS)` at MODULE
 *   EVALUATION TIME. On iOS New Architecture, TurboModuleRegistry.get(
 *   'PushNotificationManager') returns null → invariant throws → app crashes
 *   before React mounts, before any error boundary is active.
 *
 * Three-layer defence already in place:
 *   1. Metro resolver stub  (metro.config.js)   — replaces PushNotificationIOS.js
 *      at bundle time with a safe no-op class.
 *   2. NativeEventEmitter polyfill (_layout.tsx first import)
 *      — monkey-patches the constructor to be null-safe as a safety net.
 *   3. This file — lazy dynamic import of expo-notifications, guarded by a
 *      TurboModuleRegistry check so the import is skipped entirely if the
 *      native module is absent.
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────────
 * All four exported functions are safe to call from any context:
 *   - They never throw.
 *   - They return safe fallback values when notifications are unavailable.
 *   - They log only privacy-safe, non-PHI diagnostic messages.
 *   - They are lazy: expo-notifications is not imported until after app mount.
 *
 * Call initializeNotificationsSafely() once inside a useEffect in _layout.tsx.
 * All other functions can be called at any time after that.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

// ─── Module-level state ───────────────────────────────────────────────────────

let _cached: typeof ExpoNotifications | null = null;
let _failed = false;
let _initialized = false;
let _notificationListeners: { remove: () => void }[] = [];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the native push notification module is available.
 *
 * On iOS New Architecture / Expo Go, PushNotificationManager is null.
 * On Android, the equivalent module is always available.
 * On web, notifications are handled by the browser — not this module.
 */
function isPushNotificationNativeModuleAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') return true;

  // iOS: check TurboModuleRegistry first (New Architecture)
  try {
    if (TurboModuleRegistry) {
      const mod = TurboModuleRegistry.get('PushNotificationManager');
      if (mod === null || mod === undefined) return false;
    }
  } catch {
    // TurboModuleRegistry not available — fall back to legacy NativeModules check
  }

  // Legacy architecture fallback
  return !!(
    NativeModules.PushNotificationManager ||
    NativeModules.RNPushNotification
  );
}

/**
 * Lazily loads expo-notifications. Returns null if the native module is
 * unavailable or if the import fails for any reason.
 */
async function loadExpoNotifications(): Promise<typeof ExpoNotifications | null> {
  if (_failed) return null;
  if (_cached) return _cached;

  if (!isPushNotificationNativeModuleAvailable()) {
    _failed = true;
    // Privacy-safe: no PHI, no user data
    console.info('[VitalSync:Notifications] Native push module unavailable — notifications disabled.');
    return null;
  }

  try {
    _cached = (await import('expo-notifications')) as typeof ExpoNotifications;
    return _cached;
  } catch (loadErr) {
    _failed = true;
    // Privacy-safe error log — no stack trace, no user data
    console.warn('[VitalSync:Notifications] Failed to load expo-notifications:', (loadErr as Error)?.message ?? 'unknown');
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize notifications safely.
 *
 * - Lazy: expo-notifications is not imported until this function is called.
 * - Idempotent: safe to call multiple times.
 * - Never throws.
 * - Must be called inside a useEffect (after app mount), never at module level.
 *
 * Sets up:
 *   • Notification presentation handler (alert + sound, no badge)
 *   • Android notification channels (Health Alerts + Daily Reminders)
 */
export async function initializeNotificationsSafely(): Promise<void> {
  if (_initialized) return;

  const N = await loadExpoNotifications();
  if (!N) return;

  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Android 8+ requires channels before any scheduleNotificationAsync call
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('healthAlerts', {
        name: 'Health Alerts',
        importance: N.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
      });
      await N.setNotificationChannelAsync('reminders', {
        name: 'Daily Reminders',
        importance: N.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    // Register action categories (best-effort, non-fatal)
    // reason_streak_refill: "Refill Now" button on missed-dose reason-streak notifications
    try {
      await N.setNotificationCategoryAsync('reason_streak_refill', [
        {
          identifier: 'REFILL_NOW',
          buttonTitle: 'Refill Now 🗺️',
          options: { opensAppToForeground: true },
        },
      ]);
    } catch (_unused) { /* non-fatal */ }

    _initialized = true;
    console.info('[VitalSync:Notifications] Initialized successfully.');
  } catch (initErr) {
    // Non-fatal: app continues without notifications
    console.warn('[VitalSync:Notifications] initializeNotificationsSafely failed:', (initErr as Error)?.message ?? 'unknown');
  }
}

/**
 * Request notification permission safely.
 *
 * Returns the permission status string, or 'undetermined' if the native
 * module is unavailable or if the request fails.
 *
 * Never throws.
 */
export async function requestNotificationPermissionSafely(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  const N = await loadExpoNotifications();
  if (!N) return 'undetermined';

  try {
    const { status: existingStatus } = await N.getPermissionsAsync();
    if (existingStatus === 'granted') return 'granted';

    const { status } = await N.requestPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    console.warn('[VitalSync:Notifications] requestNotificationPermissionSafely failed:', (err as Error)?.message ?? 'unknown');
    return 'undetermined';
  }
}

/**
 * Schedule a local notification safely.
 *
 * Returns the notification identifier string on success, or null if the
 * native module is unavailable or if scheduling fails.
 *
 * Never throws. Does not log notification content (PHI protection).
 */
export async function scheduleLocalNotificationSafely(
  input: Parameters<typeof ExpoNotifications.scheduleNotificationAsync>[0],
): Promise<string | null> {
  const N = await loadExpoNotifications();
  if (!N) return null;

  try {
    return await N.scheduleNotificationAsync(input);
  } catch (schedErr) {
    // Log only error type, never notification content (may contain PHI)
    console.warn('[VitalSync:Notifications] scheduleLocalNotificationSafely failed:', (schedErr as Error)?.message ?? 'unknown');
    return null;
  }
}

/**
 * Clean up all active notification listeners.
 *
 * Call this in the cleanup function of the useEffect that adds listeners.
 * Safe to call even if no listeners have been registered.
 *
 * Never throws.
 */
export function cleanupNotificationListeners(): void {
  try {
    _notificationListeners.forEach((sub) => {
      try { sub.remove(); } catch { /* ignore */ }
    });
    _notificationListeners = [];
  } catch (err) {
    console.warn('[VitalSync:Notifications] cleanupNotificationListeners failed:', (err as Error)?.message ?? 'unknown');
  }
}

/**
 * Register a notification received listener safely.
 *
 * Automatically tracked so cleanupNotificationListeners() removes it.
 * Returns a cleanup function for use in useEffect return values.
 *
 * Never throws.
 */
export async function addNotificationReceivedListenerSafely(
  handler: (notification: ExpoNotifications.Notification) => void,
): Promise<() => void> {
  const N = await loadExpoNotifications();
  if (!N) return () => {};

  try {
    const sub = N.addNotificationReceivedListener(handler);
    _notificationListeners.push(sub);
    return () => {
      try { sub.remove(); } catch { /* ignore */ }
      _notificationListeners = _notificationListeners.filter((s) => s !== sub);
    };
  } catch (err) {
    console.warn('[VitalSync:Notifications] addNotificationReceivedListenerSafely failed:', (err as Error)?.message ?? 'unknown');
    return () => {};
  }
}

/**
 * Register a notification response listener safely.
 *
 * Fires when the user taps a notification. Automatically tracked so
 * cleanupNotificationListeners() removes it.
 *
 * Never throws.
 */
export async function addNotificationResponseReceivedListenerSafely(
  handler: (response: ExpoNotifications.NotificationResponse) => void,
): Promise<() => void> {
  const N = await loadExpoNotifications();
  if (!N) return () => {};

  try {
    const sub = N.addNotificationResponseReceivedListener(handler);
    _notificationListeners.push(sub);
    return () => {
      try { sub.remove(); } catch { /* ignore */ }
      _notificationListeners = _notificationListeners.filter((s) => s !== sub);
    };
  } catch (err) {
    console.warn('[VitalSync:Notifications] addNotificationResponseReceivedListenerSafely failed:', (err as Error)?.message ?? 'unknown');
    return () => {};
  }
}

/**
 * Cancel a scheduled notification safely.
 * Never throws.
 */
export async function cancelScheduledNotificationSafely(id: string): Promise<void> {
  const N = await loadExpoNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch { /* ignore */ }
}

/**
 * Cancel all scheduled notifications safely.
 * Never throws.
 */
export async function cancelAllScheduledNotificationsSafely(): Promise<void> {
  const N = await loadExpoNotifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch { /* ignore */ }
}

/**
 * Returns the cached expo-notifications module if already loaded, or null.
 * Use initializeNotificationsSafely() first to trigger the lazy load.
 * @internal
 */
export function getNotificationsSync(): typeof ExpoNotifications | null {
  return _cached;
}
