/**
 * Smart Reminder Engine — VitalSync v2.9.59
 *
 * Centralised scheduling logic for trial-conversion reminders.
 *
 * Schedule:
 *   Day 7  — PassiveBanner (always visible, low-friction)
 *   Day 10 — SoftReminder (once-only, dismissible)
 *   Day 12 — CompactCard in Settings subscription section
 *   Day 14 — ElegantModal shown after a task completes
 *   Day 15 — GraceBanner at top of dashboard (last soft nudge)
 *   Day 16+ — Restrictions activate (handled by subscription-context)
 *
 * Rules:
 *   - Max 1 reminder per 24 hours
 *   - "Remind Me Later" defers by 24 hours
 *   - Dismissal persisted in AsyncStorage via safe wrappers
 */
import { safeSetItem, safeGetItem, safeRemoveItem } from '@/lib/safe-async-storage';

const KEY_DISMISSED_SOFT    = '@vsht:smart_reminder_soft_dismissed';
const KEY_DISMISSED_MODAL   = '@vsht:smart_reminder_modal_dismissed';
const KEY_DISMISSED_GRACE   = '@vsht:smart_reminder_grace_dismissed';
const KEY_LAST_SHOWN_AT     = '@vsht:smart_reminder_last_shown_ms';
const KEY_REMIND_LATER_AT   = '@vsht:smart_reminder_remind_later_ms';

export type ReminderVariant =
  | 'passive_banner'
  | 'soft_reminder'
  | 'compact_card'
  | 'elegant_modal'
  | 'grace_banner'
  | 'none';

export interface ReminderState {
  variant: ReminderVariant;
  trialDay: number;
  daysRemaining: number;
  softDismissed: boolean;
  modalDismissed: boolean;
  graceDismissed: boolean;
}

const MS_PER_DAY = 86_400_000;
const COOLDOWN_MS = MS_PER_DAY;

export async function computeReminderState(
  trialStartMs: number,
  nowMs: number = Date.now()
): Promise<ReminderState> {
  const trialDay = Math.floor((nowMs - trialStartMs) / MS_PER_DAY) + 1;
  const daysRemaining = Math.max(0, 15 - trialDay + 1);

  const [
    softDismissedRaw,
    modalDismissedRaw,
    graceDismissedRaw,
    lastShownAtRaw,
    remindLaterAtRaw,
  ] = await Promise.all([
    safeGetItem(KEY_DISMISSED_SOFT),
    safeGetItem(KEY_DISMISSED_MODAL),
    safeGetItem(KEY_DISMISSED_GRACE),
    safeGetItem(KEY_LAST_SHOWN_AT),
    safeGetItem(KEY_REMIND_LATER_AT),
  ]);

  const softDismissed  = softDismissedRaw  === 'true';
  const modalDismissed = modalDismissedRaw === 'true';
  const graceDismissed = graceDismissedRaw === 'true';
  const lastShownAt    = lastShownAtRaw    ? parseInt(lastShownAtRaw, 10)  : 0;
  const remindLaterAt  = remindLaterAtRaw  ? parseInt(remindLaterAtRaw, 10) : 0;

  const inCooldown = (nowMs - lastShownAt) < COOLDOWN_MS;
  const deferred   = remindLaterAt > 0 && (nowMs - remindLaterAt) < COOLDOWN_MS;

  if (trialDay >= 15 && !graceDismissed && !deferred) {
    return { variant: 'grace_banner', trialDay, daysRemaining, softDismissed, modalDismissed, graceDismissed };
  }
  if (trialDay === 14 && !modalDismissed && !inCooldown && !deferred) {
    return { variant: 'elegant_modal', trialDay, daysRemaining, softDismissed, modalDismissed, graceDismissed };
  }
  if (trialDay === 12 || trialDay === 13) {
    return { variant: 'compact_card', trialDay, daysRemaining, softDismissed, modalDismissed, graceDismissed };
  }
  if ((trialDay === 10 || trialDay === 11) && !softDismissed && !inCooldown && !deferred) {
    return { variant: 'soft_reminder', trialDay, daysRemaining, softDismissed, modalDismissed, graceDismissed };
  }
  if (trialDay >= 7) {
    return { variant: 'passive_banner', trialDay, daysRemaining, softDismissed, modalDismissed, graceDismissed };
  }
  return { variant: 'none', trialDay, daysRemaining, softDismissed, modalDismissed, graceDismissed };
}

export async function dismissSoftReminder(): Promise<void> {
  await safeSetItem(KEY_DISMISSED_SOFT, 'true');
  await safeSetItem(KEY_LAST_SHOWN_AT, String(Date.now()));
}
export async function dismissElegantModal(): Promise<void> {
  await safeSetItem(KEY_DISMISSED_MODAL, 'true');
  await safeSetItem(KEY_LAST_SHOWN_AT, String(Date.now()));
}
export async function dismissGraceBanner(): Promise<void> {
  await safeSetItem(KEY_DISMISSED_GRACE, 'true');
  await safeSetItem(KEY_LAST_SHOWN_AT, String(Date.now()));
}
export async function remindMeLater(): Promise<void> {
  await safeSetItem(KEY_REMIND_LATER_AT, String(Date.now()));
  await safeSetItem(KEY_LAST_SHOWN_AT, String(Date.now()));
}
export async function recordReminderShown(): Promise<void> {
  await safeSetItem(KEY_LAST_SHOWN_AT, String(Date.now()));
}
export async function resetReminderState(): Promise<void> {
  await safeRemoveItem(KEY_DISMISSED_SOFT);
  await safeRemoveItem(KEY_DISMISSED_MODAL);
  await safeRemoveItem(KEY_DISMISSED_GRACE);
  await safeRemoveItem(KEY_LAST_SHOWN_AT);
  await safeRemoveItem(KEY_REMIND_LATER_AT);
}
