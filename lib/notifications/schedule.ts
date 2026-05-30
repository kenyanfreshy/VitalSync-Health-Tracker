/**
 * scheduleNotification — drop-in wrapper around Notifications.scheduleNotificationAsync
 * that automatically injects the correct Android channelId based on notification content.
 *
 * Android 8+ (API 26+) requires a channelId on every scheduled notification.
 * Without it, the schedule call throws "No notification channel found" and the app crashes.
 */

import { Platform } from 'react-native';
import { getNotificationsAsync } from './safe-notifications';

type ScheduleInput = {
  /** Optional notification identifier for cancellation */
  identifier?: string;
  content: {
    title?: string | null;
    body?: string | null;
    data?: Record<string, unknown>;
    sound?: boolean | string | null;
    badge?: number | null;
    [key: string]: unknown;
  };
  trigger?: Record<string, unknown> | null;
};

const HEALTH_ALERT_KEYWORDS = /bp|blood pressure|heart|spo2|oxygen|glucose|sugar|alert|warning|critical|threshold|vital/i;
const APPOINTMENT_KEYWORDS = /appointment|doctor|clinic|specialist|visit|tomorrow|🩺/i;

export function inferChannelId(title: string | undefined | null): string {
  if (!title) return 'reminders';
  if (HEALTH_ALERT_KEYWORDS.test(title)) return 'healthAlerts';
  if (APPOINTMENT_KEYWORDS.test(title)) return 'reminders';
  return 'reminders';
}

/**
 * Schedule a local notification, automatically injecting the correct Android channelId.
 * Use this instead of Notifications.scheduleNotificationAsync throughout the app.
 */
export async function scheduleNotification(input: ScheduleInput): Promise<string | null> {
  const N = await getNotificationsAsync();
  if (!N) return null;
  try {
    if (Platform.OS !== 'android') {
      return await N.scheduleNotificationAsync(input as Parameters<typeof N.scheduleNotificationAsync>[0]);
    }
    const channelId = inferChannelId(input.content.title ?? undefined);
    return await N.scheduleNotificationAsync({
      ...input,
      trigger: input.trigger
        ? { ...(input.trigger as object), channelId }
        : { channelId },
    } as Parameters<typeof N.scheduleNotificationAsync>[0]);
  } catch (_unused) {
    return null;
  }
}
