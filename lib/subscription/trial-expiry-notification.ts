/**
 * Trial Expiry Notification Scheduler
 *
 * Schedules a single local push notification 24 hours before the user's
 * 2-week free trial ends, reminding them to subscribe before they lose access.
 *
 * Notification ID: "vitalsync_trial_expiry"
 *
 * Usage:
 *   scheduleTrialExpiryNotification(trialExpiryMs)  — call when trial starts
 *   cancelTrialExpiryNotification()                 — call when user subscribes
 */

import { Platform } from "react-native";
import { scheduleNotification } from "@/lib/notifications/schedule";
import { getNotificationsAsync } from "@/lib/notifications/safe-notifications";

const NOTIF_ID = "vitalsync_trial_expiry";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule (or reschedule) the trial expiry reminder.
 * Fires 24 hours before `trialExpiryMs`.
 * Silently skips if:
 *  - running on web
 *  - the trigger time is not in the future
 *  - notification permissions are not granted
 */
export async function scheduleTrialExpiryNotification(
  trialExpiryMs: number,
): Promise<void> {
  if (Platform.OS === "web") return;

  const triggerMs = trialExpiryMs - TWENTY_FOUR_HOURS_MS;
  if (triggerMs <= Date.now()) return; // already past the 24h window

  try {
    const N = await getNotificationsAsync();
    if (!N) return;

    // Cancel any existing trial expiry notification before rescheduling
    await N.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});

    await scheduleNotification({
      content: {
        title: "Your free trial ends tomorrow",
        body: "Subscribe now to keep your health data, trends, and reports fully accessible.",
        data: { screen: "paywall", notifId: NOTIF_ID },
        sound: true,
      },
      trigger: {
        type: "date",
        date: new Date(triggerMs),
      } as Record<string, unknown>,
    });
  } catch (_unused) {
    // Notification scheduling is best-effort; never crash the app
  }
}

/**
 * Cancel the trial expiry notification.
 * Call this when the user subscribes or restores a purchase.
 */
export async function cancelTrialExpiryNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const N = await getNotificationsAsync();
    if (!N) return;
    await N.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});
  } catch (_unused) {}
}
