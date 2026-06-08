/**
 * Medication reminder notification helpers.
 * Schedules daily repeating notifications for each dose time.
 */

import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import { Platform } from 'react-native';
import type { Medication } from './types';
import { getOpenTodayHours, getAllPharmacies, normalizePharmacyName } from './pharmacy-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

/** Request notification permissions (iOS only needs explicit request). */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const N = await getNotificationsAsync();
  if (!N) return false;
  try {
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch (_unused) {
    return false;
  }
}

/** Cancel all scheduled notifications for a medication. */
export async function cancelMedicationNotifications(
  notificationIds: string[],
): Promise<void> {
  const N = await getNotificationsAsync();
  if (!N) return;
  await Promise.all(
    notificationIds.map((id) =>
      N.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
}

/**
 * Schedule daily repeating notifications for each dose time.
 * Returns the list of scheduled notification IDs.
 */
export async function scheduleMedicationNotifications(
  med: Medication,
): Promise<string[]> {
  if (Platform.OS === 'web') return [];

  // Cancel existing notifications first
  await cancelMedicationNotifications(med.notificationIds);

  const N = await getNotificationsAsync();
  if (!N) return [];

  const ids: string[] = [];

  for (const time of med.scheduleTimes) {
    const [hourStr, minStr] = time.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);
    if (isNaN(hour) || isNaN(minute)) continue;

    try {
      const id = await N.scheduleNotificationAsync({
        content: {
          title: '💊 Medication Reminder',
          body: `Time to take ${med.name} — ${med.dose}`,
          sound: true,
          data: { medicationId: med.id },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });
      ids.push(id);
    } catch (_unused) {
      // Non-fatal — permissions may not be granted yet
    }
  }

  return ids;
}

/**
 * Schedule daily "5 minutes before" reminder notifications for each dose time.
 * These fire 5 minutes before the scheduled dose so the user has time to prepare.
 * Returns the list of scheduled notification IDs.
 */
export async function scheduleEarlyReminderNotifications(
  med: Medication,
): Promise<string[]> {
  if (Platform.OS === 'web') return [];

  const N = await getNotificationsAsync();
  if (!N) return [];

  const ids: string[] = [];

  for (const time of med.scheduleTimes) {
    const [hourStr, minStr] = time.split(':');
    const hour   = parseInt(hourStr, 10);
    const minute = parseInt(minStr,  10);
    if (isNaN(hour) || isNaN(minute)) continue;

    // Subtract 5 minutes, wrapping around midnight
    const totalMin   = hour * 60 + minute - 5;
    const earlyHour  = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
    const earlyMin   = ((totalMin % 60) + 60) % 60;

    try {
      const id = await N.scheduleNotificationAsync({
        content: {
          title: '⏰ Dose in 5 minutes',
          body: `${med.name} — ${med.dose} is due at ${time}`,
          sound: true,
          data: { medicationId: med.id, type: 'early_reminder' },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DAILY,
          hour: earlyHour,
          minute: earlyMin,
        },
      });
      ids.push(id);
    } catch (_unused) {
      // Non-fatal — permissions may not be granted yet
    }
  }

  return ids;
}

/**
 * Schedule a one-time snooze notification for a medication dose.
 * Fires once at the given Date (now + snooze duration).
 * Returns the notification ID, or null if scheduling fails.
 */
export async function scheduleSnoozeNotification(
  med: Medication,
  fireAt: Date,
  title?: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const N = await getNotificationsAsync();
  if (!N) return null;
  try {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: title ?? '⏰ Snoozed Reminder',
        body: `Time to take ${med.name} — ${med.dose}`,
        sound: true,
        data: { medicationId: med.id, type: 'snooze' },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
    return id;
  } catch (_unused) {
    return null;
  }
}

/**
 * Build the refill notification body, optionally including today's pharmacy hours.
 * Also returns pharmacy phone and a Maps deep-link URL for the notification data payload.
 */
async function buildRefillBody(med: Medication): Promise<{
  body: string;
  phone: string | undefined;
  mapUrl: string | undefined;
}> {
  if (!med.pharmacyName) {
    return {
      body: `Time to refill ${med.name} — contact your pharmacy.`,
      phone: undefined,
      mapUrl: undefined,
    };
  }

  // Look up today's hours and address from the saved pharmacy store
  let hoursClause = '';
  let addressClause = '';
  let mapUrl: string | undefined;
  try {
    const store = await getAllPharmacies();
    const key = normalizePharmacyName(med.pharmacyName);
    const entry = store.find((e) => normalizePharmacyName(e.name) === key);
    const todayHours = getOpenTodayHours(entry?.hours);
    if (todayHours) hoursClause = ` Open today: ${todayHours}.`;
    const address = (med as any).pharmacyAddress || entry?.address;
    if (address) {
      addressClause = ` 📍 ${address}.`;
      mapUrl = `maps://?q=${encodeURIComponent(address)}`;
    }
  } catch (_unused) {
    // Non-fatal — pharmacy lookup failure should not block the notification
  }

  const phoneClause = med.pharmacyPhone ? ` at ${med.pharmacyPhone}` : '';
  const body = `Time to refill ${med.name}. Call ${med.pharmacyName}${phoneClause}.${hoursClause}${addressClause}`;
  return { body, phone: med.pharmacyPhone || undefined, mapUrl };
}

/**
 * Schedule a one-time "7 days before refill" advance reminder at 9:00 AM.
 * Fires 7 days before the given refillDate so the user has time to order.
 * Returns the notification ID, or null if scheduling fails or the date is in the past.
 */
export async function scheduleAdvanceRefillNotification(
  med: Medication,
  refillDate: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // Compute the date 7 days before the refill date
  // Support both date-only strings (YYYY-MM-DD) and full ISO datetime strings
  const refill = (() => {
    const d = new Date(refillDate);
    if (!isNaN(d.getTime())) return d;
    return new Date(`${refillDate}T09:00:00`);
  })();
  if (isNaN(refill.getTime())) return null;
  const advanceDate = new Date(refill);
  advanceDate.setDate(advanceDate.getDate() - 7);

  // Don't schedule if the advance date is already in the past
  if (advanceDate <= new Date()) return null;

  const N = await getNotificationsAsync();
  if (!N) return null;

  try {
    const { body: refillBody, phone, mapUrl } = await buildRefillBody(med);
    const id = await N.scheduleNotificationAsync({
      content: {
        title: '⚠️ Refill Due in 7 Days',
        body: `${med.name} refill is due in 7 days — order now to avoid running out. ${refillBody}`,
        sound: true,
        categoryIdentifier: 'refill_reminder',
        data: {
          medicationId: med.id,
          type: 'advance_refill',
          pharmacyPhone: phone,
          mapUrl,
        },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: advanceDate,
      },
    });
    return id;
  } catch (_unused) {
    return null;
  }
}

/**
 * Compute the estimated refill date from a fill date and the medication's
 * quantity + frequency. Returns an ISO date string (YYYY-MM-DD) or null if
 * the inputs are insufficient to make a reliable estimate.
 *
 * Days-supply calculation:
 *   daily             → quantity ÷ 1
 *   twice_daily       → quantity ÷ 2
 *   three_times_daily → quantity ÷ 3
 *   four_times_daily  → quantity ÷ 4
 *   weekly            → quantity × 7
 *   as_needed / custom → not calculable → null
 */
export function computeEstimatedRefillDate(
  fillDate: string,
  quantity: number | null | undefined,
  frequency: string,
): string | null {
  if (!fillDate || !quantity || quantity <= 0) return null;
  const dosesPerDay: Record<string, number> = {
    daily: 1,
    twice_daily: 2,
    three_times_daily: 3,
    four_times_daily: 4,
    weekly: 1 / 7,
  };
  const dpd = dosesPerDay[frequency];
  if (!dpd) return null; // as_needed / custom
  const daysSupply = Math.floor(quantity / dpd);
  if (daysSupply <= 0) return null;
  const fill = new Date(`${fillDate}T00:00:00`);
  if (isNaN(fill.getTime())) return null;
  fill.setDate(fill.getDate() + daysSupply);
  return fill.toISOString().split('T')[0];
}

/**
 * Schedule a "7 days before estimated refill" advance notification when the
 * user has set a refill county (indicating they want county-triggered refill
 * reminders) and a fill date is available.
 *
 * Internally calls `scheduleAdvanceRefillNotification` with the computed date.
 * Returns the notification ID, or null if scheduling is not possible.
 */
export async function scheduleFillDateRefillNotification(
  med: Medication,
  fillDate: string,
  quantity: number | null | undefined,
  frequency: string,
): Promise<string | null> {
  const estimatedRefillDate = computeEstimatedRefillDate(fillDate, quantity, frequency);
  if (!estimatedRefillDate) return null;
  return scheduleAdvanceRefillNotification(med, estimatedRefillDate);
}

/**
 * Schedule a one-time refill reminder notification on the given date at 9:00 AM.
 * Returns the notification ID, or null if scheduling fails.
 */
export async function scheduleRefillReminderNotification(
  med: Medication,
  refillDate: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  // Support both date-only strings (YYYY-MM-DD) and full ISO datetime strings
  const date = (() => {
    const d = new Date(refillDate);
    if (!isNaN(d.getTime())) return d;
    return new Date(`${refillDate}T09:00:00`);
  })();
  if (isNaN(date.getTime()) || date <= new Date()) return null;

  const N = await getNotificationsAsync();
  if (!N) return null;

  try {
    const { body: refillBody, phone, mapUrl } = await buildRefillBody(med);
    const id = await N.scheduleNotificationAsync({
      content: {
        title: '🔴 Refill Reminder',
        body: refillBody,
        sound: true,
        categoryIdentifier: 'refill_reminder',
        data: {
          medicationId: med.id,
          type: 'refill',
          pharmacyPhone: phone,
          mapUrl,
        },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date,
      },
    });
    return id;
  } catch (_unused) {
    return null;
  }
}

const WEEKLY_ADHERENCE_NOTIF_ID_KEY = '@vsht:weekly_adherence_notif_id';

/**
 * Schedule (or reschedule) a weekly adherence check notification.
 * Fires every Sunday at 20:00. The notification is only shown if the
 * caller computes that adherence fell below the user's goal — this
 * function simply schedules the trigger; the actual adherence check
 * happens at schedule time (caller passes the message).
 *
 * Returns the notification ID, or null on failure / web.
 */
export async function scheduleWeeklyAdherenceNotification(
  adherencePct: number,
  goalPct: number,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const N = await getNotificationsAsync();
  if (!N) return null;

  // Cancel any previously scheduled weekly adherence notification
  try {
    const prevId = await AsyncStorage.getItem(WEEKLY_ADHERENCE_NOTIF_ID_KEY);
    if (prevId) await N.cancelScheduledNotificationAsync(prevId).catch(() => {});
  } catch (_unused) {}

  if (adherencePct >= goalPct) return null; // Goal met — no notification needed

  // Schedule for next Sunday at 20:00
  const now = new Date();
  const nextSunday = new Date(now);
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7; // 0 = Sunday; ensure at least 1 day
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(20, 0, 0, 0);

  try {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: '📊 Weekly Adherence Check',
        body: `This week you took ${adherencePct}% of your doses — ${goalPct - adherencePct}% below your ${goalPct}% goal. Tap to review.`,
        sound: true,
        data: {
          type: 'weekly_adherence',
          screen: '/(tabs)/medications',
          adherencePct,
          goalPct,
        },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: nextSunday,
      },
    });

    // Persist the ID so we can cancel/replace it next time
    try {
      await safeSetItem(WEEKLY_ADHERENCE_NOTIF_ID_KEY, id);
    } catch (_unused) {}

    return id;
  } catch (_unused) {
    return null;
  }
}
