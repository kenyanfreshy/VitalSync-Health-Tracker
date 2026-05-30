import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * Bedtime Reminder Notification
 *
 * Schedules (or cancels) a nightly recurring local notification **30 minutes
 * before** the user's chosen target bedtime. This lead-time is grounded in
 * circadian-rhythm research: Czeisler et al. (2011, Science) and Walker (2017,
 * "Why We Sleep") both recommend a consistent wind-down routine starting
 * 30–60 min before sleep onset to allow melatonin levels to rise naturally.
 *
 * Storage key: @vitalsync/bedtime_reminder  →  { enabled: boolean, hour: number, minute: number }
 * The stored hour/minute represent the TARGET bedtime; the notification fires
 * at (hour:minute − 30 min).
 */

import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vitalsync/bedtime_reminder';
const NOTIF_ID_KEY = '@vitalsync/bedtime_reminder_notif_id';

export interface BedtimeReminderSettings {
  enabled: boolean;
  hour: number;   // 0-23  — TARGET bedtime hour
  minute: number; // 0-59  — TARGET bedtime minute
}

/**
 * Compute the notification fire time: 30 minutes before the target bedtime.
 * Returns { hour, minute } in 0-23 / 0-59 range.
 */
export function getReminderFireTime(
  targetHour: number,
  targetMinute: number,
): { hour: number; minute: number } {
  const totalMins = targetHour * 60 + targetMinute - 30;
  // Wrap around midnight (e.g. 00:10 bedtime → 23:40 reminder)
  const wrapped = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

const DEFAULT_SETTINGS: BedtimeReminderSettings = {
  enabled: false,
  hour: 22,
  minute: 0,
};

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function loadBedtimeReminderSettings(): Promise<BedtimeReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_unused) {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveBedtimeReminderSettings(
  settings: BedtimeReminderSettings,
): Promise<void> {
  await safeSetItem(STORAGE_KEY, JSON.stringify(settings));
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

/** Cancel any previously scheduled bedtime reminder. */
async function cancelExistingReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(NOTIF_ID_KEY);
    if (id) {
      const N = await getNotificationsAsync();
      if (N) await N.cancelScheduledNotificationAsync(id).catch(() => {});
      await AsyncStorage.removeItem(NOTIF_ID_KEY);
    }
  } catch (_unused) {
    // ignore
  }
}

/**
 * Apply bedtime reminder settings:
 * - If enabled, cancel any existing reminder and schedule a new nightly one
 *   that fires 30 minutes before the target bedtime.
 * - If disabled, cancel any existing reminder.
 *
 * Returns true if a notification was successfully scheduled.
 */
export async function applyBedtimeReminder(
  settings: BedtimeReminderSettings,
): Promise<boolean> {
  await cancelExistingReminder();

  if (!settings.enabled) return false;

  const { hour: fireHour, minute: fireMinute } = getReminderFireTime(
    settings.hour,
    settings.minute,
  );

  try {
    const id = await scheduleNotification({
      content: {
        title: '🌙 Bedtime in 30 minutes',
        body: `Your target bedtime is ${formatReminderTime(settings.hour, settings.minute)}. Time to start winding down — dim the lights and put away screens.`,
        sound: true,
        categoryIdentifier: 'bedtime_reminder',
      },
      trigger: {
        type: (await getNotificationsAsync())?.SchedulableTriggerInputTypes.CALENDAR,
        repeats: true,
        hour: fireHour,
        minute: fireMinute,
      },
    });
    await safeSetItem(NOTIF_ID_KEY, id ?? '');
    return true;
  } catch (_unused) {
    return false;
  }
}

/** Format hour + minute as a human-readable time string (e.g. "10:30 PM") */
export function formatReminderTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
