/**
 * Meal IQ Weekly Digest Notification
 * Schedules a repeating Sunday evening push notification that summarizes:
 *   - The week's average Meal IQ impact score
 *   - The single highest-impact meal of the week
 *
 * The notification fires every Sunday at 7:00 PM local time.
 * It is cancelled and rescheduled whenever the user toggles the setting.
 */
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import { scheduleNotification } from '@/lib/notifications/schedule';
import { Platform } from 'react-native';
import type { MealIQAnalysisRecord } from './types';

const DIGEST_NOTIFICATION_ID = 'meal_iq_weekly_digest';

// ─── Permission helper ────────────────────────────────────────────────────────

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const N = await getNotificationsAsync();
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch (_unused) {
    return false;
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

/**
 * Schedules (or re-schedules) the weekly Meal IQ digest notification.
 * Fires every Sunday at 19:00 local time.
 * Pass `analyzes` to personalize the notification body with last week's data.
 */
export async function scheduleMealIQDigest(
  analyzes: MealIQAnalysisRecord[]
): Promise<void> {
  if (Platform.OS === 'web') return;

  const hasPermission = await ensurePermission();
  if (!hasPermission) return;

  // Cancel any existing digest notification first
  await cancelMealIQDigest();

  const N = await getNotificationsAsync();
  if (!N) return;

  // Build personalized body from the last 7 days of analyzes
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekAnalyzes = analyzes.filter(a => new Date(a.analyzedAt).getTime() >= sevenDaysAgo);

  let body: string;

  if (weekAnalyzes.length === 0) {
    body = 'Log your meals this week to see your Meal IQ score next Sunday.';
  } else {
    const avgScore =
      weekAnalyzes.reduce((sum, a) => sum + (a.impactScore ?? 0), 0) / weekAnalyzes.length;

    // Find the highest-impact meal
    const topMeal = weekAnalyzes.reduce((best, a) =>
      (a.impactScore ?? 0) > (best.impactScore ?? 0) ? a : best
    );

    const scoreLabel =
      avgScore >= 7 ? 'High Impact 🔴' :
      avgScore >= 4 ? 'Moderate Impact 🟡' :
      'Low Impact 🟢';

    const mealName = topMeal.mealLabel
      ? topMeal.mealLabel.slice(0, 40)
      : 'a logged meal';

    body =
      `Weekly avg: ${avgScore.toFixed(1)}/10 (${scoreLabel}). ` +
      `Highest impact: "${mealName}" (${(topMeal.impactScore ?? 0).toFixed(1)}/10). ` +
      `Tap to review your Meal IQ history.`;
  }

  await scheduleNotification({
    content: {
      title: '🧠 Your Weekly Meal IQ Digest',
      body,
      sound: true,
      data: { type: 'meal_iq_digest', screen: 'records' },
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Sunday (1 = Sunday in expo-notifications)
      hour: 19,
      minute: 0,
    },
  });
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelMealIQDigest(): Promise<void> {
  if (Platform.OS === 'web') return;
  const N = await getNotificationsAsync();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(DIGEST_NOTIFICATION_ID);
  } catch (_unused) {
    // Notification may not exist — ignore
  }
}

// ─── Check if scheduled ───────────────────────────────────────────────────────

export async function isMealIQDigestScheduled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const N = await getNotificationsAsync();
  if (!N) return false;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  return scheduled.some(n => n.identifier === DIGEST_NOTIFICATION_ID);
}
