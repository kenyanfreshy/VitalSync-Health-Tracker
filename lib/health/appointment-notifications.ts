import { safeFormatDate, safeFormatTime } from '@/lib/utils';
import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * Appointment Notification Scheduler
 *
 * Schedules two local push notifications per appointment:
 *
 * 1. 24-hour reminder  — fires 24h before the appointment.
 *    Notification ID: `appt_notif_<appointmentId>`
 *    Body includes doctor name, specialty, date/time, location,
 *    and a summary of any unchecked prep checklist items.
 *
 * 2. Missed follow-up  — fires 1h after the appointment time
 *    if no outcome has been logged yet.
 *    Notification ID: `appt_missed_<appointmentId>`
 *    Deep-links to /log/appointments?tab=missed so the user can
 *    quickly log whether they attended, rescheduled, or missed.
 *
 * Usage:
 *   scheduleAppointmentNotification(appt)       — call on add or update
 *   cancelAppointmentNotification(apptId)       — call on delete
 *   scheduleMissedFollowUpNotification(appt)    — call on add or update
 *   cancelMissedFollowUpNotification(apptId)    — call on delete or when outcome is logged
 *   rescheduleAllAppointmentNotifications(appts) — call on app launch
 */

import { Platform } from 'react-native';
import type { DoctorAppointment } from './types';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Deterministic notification ID for the 24h reminder. */
function notifId(apptId: string): string {
  return `appt_notif_${apptId}`;
}

/** Deterministic notification ID for the missed follow-up. */
function missedNotifId(apptId: string): string {
  return `appt_missed_${apptId}`;
}

/**
 * Build a compact checklist summary string for unchecked prep items.
 * Returns empty string if all items are checked or there are no items.
 * Example: "📋 Prep: Bring insurance card, Fast 8h before"
 */
function buildChecklistSummary(appt: DoctorAppointment): string {
  const unchecked = (appt.prepChecklist ?? []).filter(item => !item.checked);
  if (unchecked.length === 0) return '';
  const labels = unchecked.slice(0, 3).map(item => item.label).join(', ');
  const extra = unchecked.length > 3 ? ` +${unchecked.length - 3} more` : '';
  return `\n📋 Prep: ${labels}${extra}`;
}

/**
 * Request notification permissions if not already granted.
 * Returns true if permission is granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
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
 * Schedule (or reschedule) a 24h reminder notification before the appointment.
 * Includes doctor name, specialty, date/time, location, and unchecked prep items.
 * Silently skips if:
 *  - running on web
 *  - the trigger time (24h before) is not in the future
 *  - permissions are not granted
 */
export async function scheduleAppointmentNotification(
  appt: DoctorAppointment,
): Promise<void> {
  if (Platform.OS === 'web') return;

  const apptMs = new Date(appt.dateTime).getTime();
  const triggerMs = apptMs - TWENTY_FOUR_HOURS_MS;
  const now = Date.now();

  if (triggerMs <= now) return;

  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;

    // Cancel any existing 24h reminder for this appointment first
    await Notifications.cancelScheduledNotificationAsync(notifId(appt.id)).catch(() => {});

    const triggerDate = new Date(triggerMs);

    const specialtyLine = appt.specialty ? ` (${appt.specialty})` : '';
    const timeLine = safeFormatTime(appt.dateTime, [], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateLine = safeFormatDate(appt.dateTime, [], {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const locationLine = appt.location ? `\n📍 ${appt.location}` : '';
    const checklistLine = buildChecklistSummary(appt);

    await scheduleNotification({
      content: {
        title: '🩺 Appointment Tomorrow',
        body: `Dr. ${appt.doctorName}${specialtyLine} — ${dateLine} at ${timeLine}${locationLine}${checklistLine}`,
        data: { type: 'appointment', appointmentId: appt.id },
        sound: true,
      },
      trigger: {
        type: 'date' as any,
        date: triggerDate,
      },
    });
  } catch (_unused) {
    // Non-fatal — notification scheduling is best-effort
  }
}

/**
 * Cancel the scheduled 24h reminder for an appointment.
 * Safe to call even if no notification was scheduled.
 */
export async function cancelAppointmentNotification(apptId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(notifId(apptId)).catch(() => {});
  } catch (_unused) {
    // Non-fatal
  }
}

/**
 * Schedule a missed follow-up notification 1 hour after the appointment time.
 * Fires only if no outcome has been logged (missedOutcome is unset).
 * Deep-links to /log/appointments?tab=missed so the user can quickly log attendance.
 *
 * Silently skips if:
 *  - running on web
 *  - the appointment is already in the past by more than 1h
 *  - an outcome is already logged
 */
export async function scheduleMissedFollowUpNotification(
  appt: DoctorAppointment,
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Don't schedule if an outcome is already recorded
  if (appt.missedOutcome) return;

  const apptMs = new Date(appt.dateTime).getTime();
  const triggerMs = apptMs + ONE_HOUR_MS;
  const now = Date.now();

  if (triggerMs <= now) return;

  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;

    // Cancel any existing missed follow-up for this appointment first
    await Notifications.cancelScheduledNotificationAsync(missedNotifId(appt.id)).catch(() => {});

    const triggerDate = new Date(triggerMs);
    const timeLine = safeFormatTime(appt.dateTime, [], {
      hour: '2-digit',
      minute: '2-digit',
    });

    await scheduleNotification({
      content: {
        title: '📋 How did your appointment go?',
        body: `Your ${appt.doctorName ? `appointment with Dr. ${appt.doctorName}` : 'appointment'} was at ${timeLine}. Tap to log whether you attended, rescheduled, or missed it.`,
        data: {
          type: 'appointment_followup',
          source: 'appt-missed-followup',
          appointmentId: appt.id,
          apptId: appt.id,
          deepLink: '/log/appointments?tab=missed',
        },
        sound: true,
      },
      trigger: {
        type: 'date' as any,
        date: triggerDate,
      },
    });
  } catch (_unused) {
    // Non-fatal
  }
}

/**
 * Cancel the scheduled missed follow-up notification for an appointment.
 * Call this when:
 *  - the appointment is deleted
 *  - an outcome is logged (attended / missed / cancelled / rebooked)
 */
export async function cancelMissedFollowUpNotification(apptId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await getNotificationsAsync(); if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(missedNotifId(apptId)).catch(() => {});
  } catch (_unused) {
    // Non-fatal
  }
}

/**
 * Reschedule all appointment notifications from scratch.
 * Call this on app launch to recover any notifications lost after an app reinstall.
 */
export async function rescheduleAllAppointmentNotifications(
  appointments: DoctorAppointment[],
): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const now = Date.now();
  for (const appt of appointments) {
    const triggerMs = new Date(appt.dateTime).getTime() - TWENTY_FOUR_HOURS_MS;
    if (triggerMs > now && !appt.reminderDismissed) {
      await scheduleAppointmentNotification(appt);
    }
    // Also reschedule missed follow-up if appointment is in the future and no outcome yet
    const followUpMs = new Date(appt.dateTime).getTime() + ONE_HOUR_MS;
    if (followUpMs > now && !appt.missedOutcome) {
      await scheduleMissedFollowUpNotification(appt);
    }
  }
}
