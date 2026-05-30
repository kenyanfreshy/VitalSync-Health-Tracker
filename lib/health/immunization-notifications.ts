/**
 * Immunization Next-Dose Notification Scheduler
 *
 * Schedules three local push notifications for each immunization record that has
 * a `nextDoseDate` set:
 *   - 7 days before the next dose date
 *   - 48 hours before the next dose date
 *   - 1 day before the next dose date
 *
 * Notification ID format:
 *   `immun_notif_7d_<recordId>`     — 7-day reminder
 *   `immun_notif_2d_<recordId>`     — 48-hour reminder
 *   `immun_notif_1d_<recordId>`     — 1-day reminder
 *   `immun_notif_snooze_<recordId>` — snoozed reminder
 *
 * Snooze:
 *   Call snoozeImmunizationNotification(recordId, hours) to schedule a one-off
 *   reminder N hours from now (default 24 h). Cancels any existing snooze first.
 *
 * Usage:
 *   scheduleImmunizationNotifications(record)          — call on add or update
 *   cancelImmunizationNotifications(recordId)          — call on delete or mark-taken/skipped
 *   snoozeImmunizationNotification(recordId, hours)    — call from notification action
 *   rescheduleAllImmunizationNotifications(records)    — call on app launch
 */
import { safeFormatDate } from '@/lib/utils';
import { Platform } from 'react-native';
import type { ImmunizationRecord } from './types';
import { scheduleNotification } from '@/lib/notifications/schedule';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWO_DAYS_MS   = 2 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS    = 1 * 24 * 60 * 60 * 1000;

function notifId7d(id: string)     { return `immun_notif_7d_${id}`; }
function notifId2d(id: string)     { return `immun_notif_2d_${id}`; }
function notifId1d(id: string)     { return `immun_notif_1d_${id}`; }
function notifIdSnooze(id: string) { return `immun_notif_snooze_${id}`; }

/**
 * Request notification permissions if not already granted.
 * Returns true if permission is granted.
 */
export async function requestImmunizationNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (_unused) {
    return false;
  }
}

/**
 * Schedule (or reschedule) the 7-day, 48-hour, and 1-day notifications for a record.
 * Silently skips if:
 *  - running on web
 *  - no nextDoseDate is set
 *  - the trigger time is already in the past
 *  - permissions are not granted
 */
export async function scheduleImmunizationNotifications(
  record: ImmunizationRecord,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!record.nextDoseDate) return;

  const nextDoseMs = new Date(record.nextDoseDate).getTime();
  const now = Date.now();

  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;

    // Always cancel existing notifications first (idempotent reschedule)
    await Notifications.cancelScheduledNotificationAsync(notifId7d(record.id)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(notifId2d(record.id)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(notifId1d(record.id)).catch(() => {});

    const nextDoseFormatted = safeFormatDate(record.nextDoseDate, [], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const doseLabel = record.doseNumber ? ` (Dose ${record.doseNumber})` : '';

    // ── 7-day reminder ────────────────────────────────────────────────────────
    const trigger7dMs = nextDoseMs - SEVEN_DAYS_MS;
    if (trigger7dMs > now) {
      await scheduleNotification({
        content: {
          title: '💉 Vaccine Due in 1 Week',
          body: `${record.vaccineName}${doseLabel} is due on ${nextDoseFormatted}.`,
          data: { type: 'immunization', recordId: record.id, reminder: '7d' },
          sound: true,
        },
        trigger: { type: 'date' as any, date: new Date(trigger7dMs) },
      });
    }

    // ── 48-hour reminder ──────────────────────────────────────────────────────
    const trigger2dMs = nextDoseMs - TWO_DAYS_MS;
    if (trigger2dMs > now) {
      await scheduleNotification({
        content: {
          title: '💉 Vaccine Due in 48 Hours',
          body: `${record.vaccineName}${doseLabel} is due on ${nextDoseFormatted}. Tap to snooze.`,
          data: { type: 'immunization', recordId: record.id, reminder: '2d', snoozeable: true },
          sound: true,
          categoryIdentifier: 'VACCINE_REMINDER',
        },
        trigger: { type: 'date' as any, date: new Date(trigger2dMs) },
      });
    }

    // ── 1-day reminder ────────────────────────────────────────────────────────
    const trigger1dMs = nextDoseMs - ONE_DAY_MS;
    if (trigger1dMs > now) {
      await scheduleNotification({
        content: {
          title: '💉 Vaccine Due Tomorrow',
          body: `${record.vaccineName}${doseLabel} is due tomorrow — ${nextDoseFormatted}. Tap to snooze.`,
          data: { type: 'immunization', recordId: record.id, reminder: '1d', snoozeable: true },
          sound: true,
          categoryIdentifier: 'VACCINE_REMINDER',
        },
        trigger: { type: 'date' as any, date: new Date(trigger1dMs) },
      });
    }
  } catch (_unused) {
    // Non-fatal — notification scheduling is best-effort
  }
}

/**
 * Cancel all scheduled notifications for an immunization record (including any snooze).
 * Safe to call even if no notifications were scheduled.
 */
export async function cancelImmunizationNotifications(recordId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(notifId7d(recordId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(notifId2d(recordId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(notifId1d(recordId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(notifIdSnooze(recordId)).catch(() => {});
  } catch (_unused) {
    // Non-fatal
  }
}

/**
 * Snooze a vaccine reminder by scheduling a one-off notification N hours from now.
 * Cancels any existing snooze notification first.
 * @param recordId  The immunization record ID
 * @param vaccineName  Display name for the notification body
 * @param hours  How many hours to snooze (default: 24)
 */
export async function snoozeImmunizationNotification(
  recordId: string,
  vaccineName: string,
  hours = 24,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;
    // Cancel any existing snooze first
    await Notifications.cancelScheduledNotificationAsync(notifIdSnooze(recordId)).catch(() => {});
    const snoozeMs = Date.now() + hours * 60 * 60 * 1000;
    await scheduleNotification({
      content: {
        title: '💉 Vaccine Reminder (Snoozed)',
        body: `${vaccineName} — your snoozed reminder. Don't forget to schedule your dose!`,
        data: { type: 'immunization', recordId, reminder: 'snooze', snoozeable: true },
        sound: true,
        categoryIdentifier: 'VACCINE_REMINDER',
      },
      trigger: { type: 'date' as any, date: new Date(snoozeMs) },
    });
  } catch (_unused) {
    // Non-fatal
  }
}

/**
 * Reschedule all immunization notifications from scratch.
 * Call this on app launch to recover notifications lost after an app reinstall.
 */
export async function rescheduleAllImmunizationNotifications(
  records: ImmunizationRecord[],
): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await requestImmunizationNotificationPermissions();
  if (!granted) return;
  const now = Date.now();
  for (const record of records) {
    if (!record.nextDoseDate) continue;
    const nextDoseMs = new Date(record.nextDoseDate).getTime();
    // Only reschedule if the next dose date is still in the future
    if (nextDoseMs > now) {
      await scheduleImmunizationNotifications(record);
    }
  }
}
