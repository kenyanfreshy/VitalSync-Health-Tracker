import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * Diet Streak Milestone Notifications
 *
 * Fires a push notification when the user hits a streak milestone (7, 14, 30 days).
 * Tracks which milestones have already been celebrated so each fires only once per
 * continuous streak.  The celebrated-milestones set is reset whenever the streak
 * drops back to zero (i.e. the user starts a new streak from scratch).
 *
 * Storage key: @vitalsync/diet_streak_milestones_fired
 *   Value: JSON array of numbers, e.g. [7, 14]
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import { safeSetItem } from '@/lib/safe-async-storage';

const MILESTONES_FIRED_KEY = '@vitalsync/diet_streak_milestones_fired';

/** Milestone days at which to celebrate. */
export const STREAK_MILESTONES = [7, 14, 30] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/** Load the set of milestones already fired for the current streak. */
async function loadFiredMilestones(): Promise<Set<number>> {
  try {
    const raw = await AsyncStorage.getItem(MILESTONES_FIRED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr);
  } catch (_unused) {
    return new Set();
  }
}

/** Persist the updated set of fired milestones. */
async function saveFiredMilestones(set: Set<number>): Promise<void> {
  try {
    await safeSetItem(MILESTONES_FIRED_KEY, JSON.stringify([...set]));
  } catch (_unused) {
    // non-critical
  }
}

/**
 * Call this whenever the streak value changes.
 * - If streak === 0 → clear the fired-milestones set (new streak starting).
 * - If streak matches a milestone that hasn't been fired yet → fire it.
 *
 * @param streak  Current streak day count
 * @param emoji   Protocol emoji (e.g. "🥑")
 * @param label   Protocol label (e.g. "Ketogenic")
 */
export async function checkStreakMilestones(
  streak: number,
  emoji: string,
  label: string,
): Promise<void> {
  // Web doesn't support push notifications — skip silently
  if (Platform.OS === 'web') return;

  if (streak === 0) {
    // Reset fired milestones so they can fire again on the next streak
    await saveFiredMilestones(new Set());
    return;
  }

  const fired = await loadFiredMilestones();

  // Check each milestone in ascending order
  for (const milestone of STREAK_MILESTONES) {
    if (streak >= milestone && !fired.has(milestone)) {
      // Fire the notification
      await fireMilestoneNotification(milestone, emoji, label);
      fired.add(milestone);
    }
  }

  await saveFiredMilestones(fired);
}

async function fireMilestoneNotification(
  milestone: number,
  emoji: string,
  label: string,
): Promise<void> {
  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await scheduleNotification({
      content: {
        title: `🔥 ${milestone}-Day Streak!`,
        body: `Amazing! You've hit ${milestone} days on your ${emoji} ${label} protocol. Keep it up!`,
        sound: true,
      },
      trigger: null, // fire immediately
    });
  } catch (_unused) {
    // Notification scheduling is non-critical
  }
}
