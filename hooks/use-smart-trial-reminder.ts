/**
 * useSmartTrialReminder — React hook wrapping the Smart Reminder Engine.
 *
 * Returns the current reminder state and action callbacks.
 * Refreshes every time the app comes to the foreground.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSubscription } from '@/lib/subscription/subscription-context';
import {
  computeReminderState,
  dismissSoftReminder,
  dismissElegantModal,
  dismissGraceBanner,
  remindMeLater,
  recordReminderShown,
  resetReminderState,
  type ReminderState,
  type ReminderVariant,
} from '@/lib/subscription/smart-reminder-engine';

const DEFAULT_STATE: ReminderState = {
  variant: 'none',
  trialDay: 0,
  daysRemaining: 0,
  softDismissed: false,
  modalDismissed: false,
  graceDismissed: false,
};

export function useSmartTrialReminder() {
  const { isPremium, accessState, trialStartMs } = useSubscription();
  const [state, setState] = useState<ReminderState>(DEFAULT_STATE);

  const refresh = useCallback(async () => {
    // Only show reminders during active trial
    if (isPremium || accessState === 'loading' || !trialStartMs) {
      setState(DEFAULT_STATE);
      return;
    }
    const next = await computeReminderState(trialStartMs);
    setState(next);
  }, [isPremium, accessState, trialStartMs]);

  // Refresh on mount and on foreground resume
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onDismissSoft = useCallback(async () => {
    await dismissSoftReminder();
    refresh();
  }, [refresh]);

  const onDismissModal = useCallback(async () => {
    await dismissElegantModal();
    refresh();
  }, [refresh]);

  const onDismissGrace = useCallback(async () => {
    await dismissGraceBanner();
    refresh();
  }, [refresh]);

  const onRemindLater = useCallback(async () => {
    await remindMeLater();
    refresh();
  }, [refresh]);

  const onShown = useCallback(async () => {
    await recordReminderShown();
  }, []);

  const onReset = useCallback(async () => {
    await resetReminderState();
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    onDismissSoft,
    onDismissModal,
    onDismissGrace,
    onRemindLater,
    onShown,
    onReset,
  };
}
