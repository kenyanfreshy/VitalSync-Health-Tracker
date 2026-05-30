/**
 * Background Health Monitor Task
 * Registers a periodic background fetch task that checks health thresholds
 * and fires local notifications for any violations.
 *
 * On iOS: runs ~every 15 minutes when the OS permits (system-controlled interval).
 * On Android: runs at the configured minimum interval (15 minutes minimum).
 * On Web: not supported — gracefully no-ops.
 */

import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { getNotificationsAsync } from './safe-notifications';
import { checkThresholds, dispatchViolationNotifications } from './threshold-checker';

export const HEALTH_MONITOR_TASK = 'VSHT_HEALTH_MONITOR';

// Minimum background fetch interval in seconds (15 minutes)
const BACKGROUND_FETCH_INTERVAL = 15 * 60;

/**
 * Define the background task.
 * This MUST be called at the top level of the app entry point (before any rendering).
 */
export function defineHealthMonitorTask(): void {
  if (Platform.OS === 'web') return;

  // Guard against double-registration (hot reload)
  if (TaskManager.isTaskDefined(HEALTH_MONITOR_TASK)) return;

  TaskManager.defineTask(HEALTH_MONITOR_TASK, async () => {
    try {
      const violations = await checkThresholds();
      if (violations.length > 0) {
        await dispatchViolationNotifications(violations);
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.error('[VitalSync] Background task error:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/**
 * Register the background fetch task with the OS.
 * Call this after notification permissions have been granted.
 */
export async function registerHealthMonitorTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEALTH_MONITOR_TASK);
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(HEALTH_MONITOR_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL,
      stopOnTerminate: false,   // Continue after app is closed (Android)
      startOnBoot: true,        // Resume after device restart (Android)
    });
  } catch (error) {
    console.warn('[VitalSync] Background task registration failed:', error);
  }
}

/**
 * Unregister the background fetch task.
 * Called when the user disables health alerts in Settings.
 */
export async function unregisterHealthMonitorTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEALTH_MONITOR_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(HEALTH_MONITOR_TASK);
    }
  } catch (error) {
    console.warn('[VitalSync] Background task unregistration failed:', error);
  }
}

/**
 * Get the current registration status of the background task.
 */
export async function getHealthMonitorStatus(): Promise<{
  isRegistered: boolean;
  status: BackgroundFetch.BackgroundFetchStatus | null;
}> {
  if (Platform.OS === 'web') return { isRegistered: false, status: null };

  try {
    const [isRegistered, status] = await Promise.all([
      TaskManager.isTaskRegisteredAsync(HEALTH_MONITOR_TASK),
      BackgroundFetch.getStatusAsync(),
    ]);
    return { isRegistered, status };
  } catch (_unused) {
    return { isRegistered: false, status: null };
  }
}

/**
 * Configure notification presentation behavior.
 * Call once at app startup.
 */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  // Use async init to avoid PushNotificationIOS NativeEventEmitter crash on iOS 26 New Arch.
  // getNotificationsAsync() uses dynamic import() which defers module evaluation.
  void getNotificationsAsync().then((N) => {
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    // Android 8+ requires notification channels before any scheduleNotificationAsync call.
    if (Platform.OS === 'android') {
      N.setNotificationChannelAsync('healthAlerts', {
        name: 'Health Alerts',
        importance: N.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
      });
      N.setNotificationChannelAsync('reminders', {
        name: 'Daily Reminders',
        importance: N.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }
  });
}
