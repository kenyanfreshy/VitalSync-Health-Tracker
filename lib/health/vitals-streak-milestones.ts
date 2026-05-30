/**
 * Vitals Streak Milestone Notifications
 *
 * Fires a local push notification when the user logs vitals on every day of
 * the current ISO week (Mon–Sun, 7 of 7 days).  The notification fires at
 * most once per week — deduped by the Monday date key of the current week.
 *
 * Storage key: @vitalsync/vitals_streak_week_notif_sent
 *   Value: ISO date string of the Monday for which the notification was sent,
 *          e.g. "2026-04-27"
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { safeSetItem } from '@/lib/safe-async-storage';
import { scheduleNotification } from '@/lib/notifications/schedule';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';

const WEEK_NOTIF_SENT_KEY = '@vitalsync/vitals_streak_week_notif_sent';

/** Returns the ISO date string (YYYY-MM-DD) for the Monday of the current week. */
function currentWeekMondayKey(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

/**
 * Call this whenever the weekly vitals day-count changes.
 *
 * @param daysLogged   Number of days in the current week where any vital was logged
 * @param daysElapsed  Number of days that have started this week (1 on Mon … 7 on Sun)
 */
export async function checkVitalsWeekMilestone(
  daysLogged: number,
  daysElapsed: number,
): Promise<void> {
  // Only fire when the user has logged all elapsed days AND we're at least on day 7
  if (daysLogged < 7 || daysElapsed < 7) return;

  // Web doesn't support push notifications
  if (Platform.OS === 'web') return;

  const mondayKey = currentWeekMondayKey();

  try {
    const lastSent = await AsyncStorage.getItem(WEEK_NOTIF_SENT_KEY);
    if (lastSent === mondayKey) return; // already fired this week

    // Check notification permission before scheduling
    const Notifications = await getNotificationsAsync();
    if (!Notifications) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await scheduleNotification({
      content: {
        title: 'Perfect Week! 🎉',
        body: "You logged vitals every day this week. That's 7 of 7 — keep the momentum going!",
        sound: true,
      },
      trigger: null, // fire immediately
    });

    await safeSetItem(WEEK_NOTIF_SENT_KEY, mondayKey);
  } catch (_unused) {
    // Non-critical — never throw
  }
}
