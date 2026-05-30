/**
 * Lab Result Reminder Service
 * Schedules a one-time push notification when a lab panel result is due again,
 * based on the last recorded result date and the recommended re-test interval
 * for each panel type.
 *
 * Recommended intervals (evidence-based):
 *  CMP  — 90 days  (quarterly metabolic panel)
 *  CBC  — 90 days  (quarterly blood count)
 *  LIPID — 180 days (semi-annual lipid panel)
 *  A1C  — 90 days  (quarterly for diabetes management)
 *  MG   — 90 days  (quarterly magnesium)
 *  PHOS — 90 days  (quarterly phosphorus)
 */
import { getNotificationsAsync, scheduleNotificationSafe } from '@/lib/notifications/safe-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LabPanelId, LAB_PANEL_LABELS } from './lab-types';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Recommended intervals in days ───────────────────────────────────────────

export const LAB_REMINDER_INTERVALS: Record<LabPanelId, number> = {
  CMP: 90,
  CBC: 90,
  LIPID: 180,
  A1C: 90,
  MG: 90,
  PHOS: 90,
};

const STORAGE_KEY = 'lab_reminders_enabled';
const NOTIF_PREFIX = 'lab_due_';

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestLabNotificationPermission(): Promise<boolean> {
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

// ─── Enabled flag ─────────────────────────────────────────────────────────────

export async function getLabRemindersEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    return val !== 'false'; // default on
  } catch (_unused) {
    return true;
  }
}

export async function setLabRemindersEnabled(enabled: boolean): Promise<void> {
  await safeSetItem(STORAGE_KEY, enabled ? 'true' : 'false');
  if (!enabled) {
    await cancelAllLabReminders();
  }
}

// ─── Schedule a reminder for one panel ────────────────────────────────────────

/**
 * Schedules a one-time notification for when the given panel is due again.
 * Cancels any existing reminder for this panel first.
 *
 * @param panel  The lab panel type (e.g. 'CMP')
 * @param lastResultTimestamp  ISO 8601 string of the most recent result date
 */
export async function scheduleLabPanelReminder(
  panel: LabPanelId,
  lastResultTimestamp: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const enabled = await getLabRemindersEnabled();
  if (!enabled) return;
  const hasPermission = await requestLabNotificationPermission();
  if (!hasPermission) return;

  // Cancel existing reminder for this panel
  await cancelLabPanelReminder(panel);

  const intervalDays = LAB_REMINDER_INTERVALS[panel];
  const lastDate = new Date(lastResultTimestamp);
  const dueDate = new Date(lastDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  // Only schedule if due date is in the future
  if (dueDate.getTime() <= Date.now()) return;

  const panelLabel = LAB_PANEL_LABELS[panel];
  const identifier = `${NOTIF_PREFIX}${panel}`;

   
  await scheduleNotificationSafe({
    identifier,
    content: {
      title: `🧪 ${panelLabel} Due`,
      body: `Your ${panelLabel} is due — last result was ${intervalDays} days ago. Consider scheduling a lab visit.`,
      data: { panel, type: 'lab-reminder' },
      sound: true,
    },
    trigger: { type: 'date', date: dueDate } as any,
  });
}

// ─── Cancel reminder for one panel ────────────────────────────────────────────

export async function cancelLabPanelReminder(panel: LabPanelId): Promise<void> {
  if (Platform.OS === 'web') return;
  const N = await getNotificationsAsync();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(`${NOTIF_PREFIX}${panel}`);
  } catch (_unused) {
    // Ignore if not found
  }
}

// ─── Cancel all lab reminders ─────────────────────────────────────────────────

export async function cancelAllLabReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  const N = await getNotificationsAsync();
  if (!N) return;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  const labNotifs = scheduled.filter(n => n.identifier.startsWith(NOTIF_PREFIX));
  await Promise.all(labNotifs.map(n => N.cancelScheduledNotificationAsync(n.identifier)));
}

// ─── Reschedule all panels from latest results ────────────────────────────────

/**
 * Given a map of panel → latest result timestamp, reschedules all lab reminders.
 * Call this after any lab result is saved.
 */
export async function rescheduleAllLabReminders(
  latestByPanel: Partial<Record<LabPanelId, string>>,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const enabled = await getLabRemindersEnabled();
  if (!enabled) return;
  for (const [panel, timestamp] of Object.entries(latestByPanel)) {
    if (timestamp) {
      await scheduleLabPanelReminder(panel as LabPanelId, timestamp);
    }
  }
}
