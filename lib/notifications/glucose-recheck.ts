import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * glucose-recheck.ts
 *
 * Schedules a local notification 2 hours after a high-glycemic-load (GL ≥ 20)
 * meal is saved alongside a blood-glucose reading, reminding the patient to
 * recheck their glucose level.
 *
 * ADA Standards of Care (2024) recommend checking postprandial glucose
 * 1–2 hours after the start of a meal for patients managing diabetes.
 */

import { getNotificationsAsync } from './safe-notifications';
import { Platform } from 'react-native';

/** Stable notification identifier — cancels any pending recheck before scheduling a new one */
const RECHECK_NOTIFICATION_ID = 'glucose-recheck-2h';

/** Delay in milliseconds: 2 hours */
const RECHECK_DELAY_MS = 2 * 60 * 60 * 1000;

export interface GlucoseRecheckOptions {
  /** Glycemic load of the meal just logged */
  glycemicLoad: number;
  /** Food description for a personalised notification body */
  foodDescription?: string | null;
  /** Most recent blood glucose reading in mg/dL, used for context */
  glucoseMgDl?: number | null;
}

/**
 * Schedules a 2-hour recheck reminder if the meal has a high GL (≥ 20).
 * Safe to call on every save — it cancels any pending recheck first so
 * only the most recent high-GL meal triggers a reminder.
 *
 * Does nothing on web (notifications not supported).
 */
export async function scheduleGlucoseRecheckNotification(
  opts: GlucoseRecheckOptions
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (opts.glycemicLoad < 20) return;

  const N = await getNotificationsAsync();
  if (!N) return;

  // Ensure notification permissions are granted
  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') {
    const { status: requested } = await N.requestPermissionsAsync();
    if (requested !== 'granted') return;
  }

  // Cancel any existing pending recheck to avoid stacking
  await N.cancelScheduledNotificationAsync(RECHECK_NOTIFICATION_ID).catch(() => {});

  const mealLabel = opts.foodDescription
    ? `"${opts.foodDescription.slice(0, 40)}${opts.foodDescription.length > 40 ? '…' : ''}"`
    : 'your recent high-GL meal';

  const glucoseContext = opts.glucoseMgDl != null
    ? ` Your last reading was ${opts.glucoseMgDl} mg/dL.`
    : '';

  const fireDate = new Date(Date.now() + RECHECK_DELAY_MS);

  await scheduleNotification({
    content: {
      title: '🩸 Time to Recheck Your Glucose',
      body: `It has been 2 hours since you logged ${mealLabel} (GL ${opts.glycemicLoad} — High).${glucoseContext} Check your blood sugar now to see how the meal affected your levels.`,
      sound: true,
      data: {
        category: 'glucose-recheck',
        glycemicLoad: opts.glycemicLoad,
        scheduledFor: fireDate.toISOString(),
      },
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    },
  });
}

/**
 * Cancels any pending 2-hour glucose recheck notification.
 * Call this if the patient manually rechecks before the timer fires.
 */
export async function cancelGlucoseRecheckNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  const N = await getNotificationsAsync();
  if (!N) return;
  await N.cancelScheduledNotificationAsync(RECHECK_NOTIFICATION_ID).catch(() => {});
}
