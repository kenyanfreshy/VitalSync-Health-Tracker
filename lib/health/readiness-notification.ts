import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * readiness-notification.ts
 *
 * Schedules (and cancels) a daily 8 AM push notification that reports
 * today's readiness score and its trend direction vs. yesterday.
 *
 * Notification identifier: 'readiness-daily-score'
 * Default trigger: 08:00 local time, repeating daily.
 */

import type { ReadinessComponents } from './readiness-score';
import { loadReadinessHistory } from './readiness-history';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';

const NOTIFICATION_ID = 'readiness-daily-score';

/** Direction symbol derived from today vs. yesterday's score. */
function trendArrow(today: number, yesterday: number | null): string {
  if (yesterday === null) return '';
  const delta = today - yesterday;
  if (delta >= 3) return ' ↑';
  if (delta <= -3) return ' ↓';
  return ' →';
}

/** Human-readable label for a readiness score. */
function scoreLabel(score: number): string {
  if (score >= 80) return 'Optimal';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Low';
}

/**
 * Schedule (or reschedule) the daily readiness notification.
 * Safe to call multiple times — cancels the previous one first.
 *
 * @param hour   Hour in local time (0–23). Defaults to 8.
 * @param minute Minute in local time (0–59). Defaults to 0.
 */
export async function scheduleReadinessNotification(
  hour = 8,
  minute = 0,
): Promise<void> {
  // Dynamic import keeps the module tree light on web
  const Notifications = await getNotificationsAsync(); if (!Notifications) return;

  // Cancel any previously scheduled instance
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  // We don't know today's score at schedule time, so we use a generic body.
  // The notification content is refreshed each time the user opens the app
  // via scheduleReadinessNotificationWithScore().
  await scheduleNotification({
    content: {
      title: '🩺 Daily Readiness Check',
      body: 'Open VitalSync to see your readiness score for today.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  }).catch(() => {});

}

/**
 * Schedule (or reschedule) the daily readiness notification with a known score.
 * Call this right after computing the readiness score on app launch or after sync.
 */
export async function scheduleReadinessNotificationWithScore(
  readiness: ReadinessComponents,
  hour = 8,
  minute = 0,
): Promise<void> {
  if (!readiness.hasData) return;

  const Notifications = await getNotificationsAsync(); if (!Notifications) return;

  // Cancel any previously scheduled instance
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  // Load yesterday's score for the trend arrow
  const history = await loadReadinessHistory(2);
  const yesterdaySnap = history.length >= 2 ? history[history.length - 2] : null;
  const yesterday = yesterdaySnap?.total ?? null;

  const score = readiness.total;
  const label = scoreLabel(score);
  const arrow = trendArrow(score, yesterday);
  const body = `Your readiness is ${score}${arrow} — ${label}. Tap to see the breakdown.`;

  await scheduleNotification({
    content: {
      title: '🩺 Daily Readiness Score',
      body,
      sound: true,
      data: { screen: 'dashboard', action: 'openReadinessBreakdown' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  }).catch(() => {});
}

/**
 * Cancel the daily readiness notification (e.g. when user disables it in Settings).
 */
export async function cancelReadinessNotification(): Promise<void> {
  const Notifications = await getNotificationsAsync(); if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
}
