import { scheduleNotification } from '@/lib/notifications/schedule';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';

/**
 * sugar-notification.ts
 *
 * Schedules (and cancels) blood glucose / sugar budget reminder notifications.
 *
 * Supported modes:
 *  - 'ac'      Before meals (Ante Cibum) — 3× daily: 07:30, 12:00, 18:00
 *  - 'pc'      Post-meal check (Post Cibum) — 3× daily: 09:30, 14:00, 20:00
 *              (1.5–2h after typical breakfast/lunch/dinner)
 *  - 'hs'      Bedtime (Hora Somni) — 1× daily: 21:30
 *  - '6h'      Every 6 hours — 4× daily: 06:00, 12:00, 18:00, 00:00
 *  - 'custom'  Single daily notification at a user-specified HH:MM time
 */

export type GlucoseReminderMode = 'ac' | 'pc' | 'hs' | '6h' | 'custom';

/** Notification IDs — one per scheduled slot so we can cancel each individually */
const NOTIF_IDS = {
  ac:     ['glucose-ac-0730', 'glucose-ac-1200', 'glucose-ac-1800'],
  pc:     ['glucose-pc-0930', 'glucose-pc-1400', 'glucose-pc-2000'],
  hs:     ['glucose-hs-2130'],
  '6h':   ['glucose-6h-0600', 'glucose-6h-1200', 'glucose-6h-1800', 'glucose-6h-0000'],
  custom: ['glucose-custom'],
};

/** All IDs combined — used for a full cancel sweep */
const ALL_IDS = Object.values(NOTIF_IDS).flat();

/** Default times (hour, minute) for each slot */
const MODE_SLOTS: Record<GlucoseReminderMode, [number, number][]> = {
  ac:     [[7, 30], [12, 0], [18, 0]],
  pc:     [[9, 30], [14, 0], [20, 0]],
  hs:     [[21, 30]],
  '6h':   [[6, 0], [12, 0], [18, 0], [0, 0]],
  custom: [[20, 0]], // overridden by caller
};

/** Human-readable label for each mode */
export const GLUCOSE_MODE_LABELS: Record<GlucoseReminderMode, string> = {
  ac:     'AC — Before Meals (3×/day)',
  pc:     'PC — Post-Meal Check (3×/day)',
  hs:     'HS — Bedtime (1×/day)',
  '6h':   'Every 6 Hours (4×/day)',
  custom: 'Custom Time',
};

/** Short subtitle shown under each mode chip */
export const GLUCOSE_MODE_SUBTITLES: Record<GlucoseReminderMode, string> = {
  ac:     '7:30 AM · 12:00 PM · 6:00 PM',
  pc:     '9:30 AM · 2:00 PM · 8:00 PM',
  hs:     '9:30 PM',
  '6h':   '6 AM · 12 PM · 6 PM · 12 AM',
  custom: 'Set your own time',
};

function buildBody(_label: string): string {
  return `Time to log your blood glucose. Tap to open VitalSync.`;
}

function buildTitle(mode: GlucoseReminderMode, slotIdx: number): string {
  switch (mode) {
    case 'ac': {
      const labels = ['Before Breakfast 🍳', 'Before Lunch 🥗', 'Before Dinner 🍽️'];
      return `🩸 Blood Glucose — ${labels[slotIdx] ?? 'Check'}`;
    }
    case 'pc': {
      const labels = ['After Breakfast 🍳', 'After Lunch 🥗', 'After Dinner 🍽️'];
      return `🩸 Post-Meal Glucose — ${labels[slotIdx] ?? 'Check'}`;
    }
    case 'hs':
      return '🩸 Blood Glucose — Bedtime Check';
    case '6h':
      return '🩸 Blood Glucose — 6-Hour Check';
    case 'custom':
      return '🩸 Blood Glucose Reminder';
  }
}

/**
 * Cancel all glucose reminder notifications.
 */
export async function cancelGlucoseNotifications(): Promise<void> {
  const Notifications = await getNotificationsAsync();
  if (!Notifications) return;
  await Promise.allSettled(
    ALL_IDS.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

/**
 * Per-slot AC time overrides: [breakfast, lunch, dinner] as [hour, minute] pairs.
 * When provided, these replace the default AC slots (07:30, 12:00, 18:00).
 */
export type AcSlotTimes = [[number, number], [number, number], [number, number]];

/** AsyncStorage key for persisting AC slot time overrides */
export const AC_SLOT_TIMES_KEY = '@vitalsync/glucose_ac_slot_times';

/** Default AC slot times */
export const AC_DEFAULT_SLOTS: AcSlotTimes = [[7, 30], [12, 0], [18, 0]];

/**
 * Schedule glucose reminders for the given mode.
 * Cancels all previous glucose notifications first.
 *
 * @param mode          One of 'ac' | 'pc' | 'hs' | '6h' | 'custom'
 * @param customHour    Only used when mode === 'custom' (0–23)
 * @param customMin     Only used when mode === 'custom' (0–59)
 * @param acSlotTimes   Optional per-slot overrides for AC mode (breakfast, lunch, dinner)
 */
export async function scheduleGlucoseNotifications(
  mode: GlucoseReminderMode,
  customHour = 20,
  customMin = 0,
  acSlotTimes?: AcSlotTimes,
): Promise<void> {
  const Notifications = await getNotificationsAsync();
  if (!Notifications) return;

  // Cancel all existing glucose reminders first
  await cancelGlucoseNotifications();

  const slots: [number, number][] =
    mode === 'custom'
      ? [[customHour, customMin]]
      : mode === 'ac' && acSlotTimes
        ? acSlotTimes
        : MODE_SLOTS[mode];

  const ids = NOTIF_IDS[mode];

  await Promise.allSettled(
    slots.map(([hour, minute], idx) =>
      scheduleNotification({
        identifier: ids[idx],
        content: {
          title: buildTitle(mode, idx),
          body: buildBody(mode),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        } as Parameters<typeof Notifications.scheduleNotificationAsync>[0]['trigger'],
      })
    )
  );
}

// ─── Legacy single-time API (kept for backward compatibility) ─────────────────

/** @deprecated Use scheduleGlucoseNotifications('custom', hour, minute) instead */
export async function scheduleSugarNotification(
  hour = 20,
  minute = 0,
  _todayG = 0,
  _budgetG = 25,
): Promise<void> {
  return scheduleGlucoseNotifications('custom', hour, minute);
}

/** @deprecated Use cancelGlucoseNotifications() instead */
export async function cancelSugarNotification(): Promise<void> {
  return cancelGlucoseNotifications();
}
