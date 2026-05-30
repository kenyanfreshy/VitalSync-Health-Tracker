/**
 * useSnoozeCountdown
 *
 * Returns a live `minsLeft` value that counts down from a snooze expiry
 * timestamp to 0. Updates every 60 seconds so the badge label stays fresh
 * without hammering the JS thread.
 *
 * When `snoozeUntil` is 0 or in the past, `minsLeft` is 0 and the interval
 * is not started (no-op).
 *
 * Usage:
 * ```ts
 * const minsLeft = useSnoozeCountdown(snoozedReminderMap['glucose-smart-reminder-today'] ?? 0);
 * ```
 */

import { useEffect, useState } from 'react';

function calcMinsLeft(snoozeUntil: number): number {
  if (!snoozeUntil) return 0;
  const diff = snoozeUntil - Date.now();
  return diff > 0 ? Math.ceil(diff / 60_000) : 0;
}

export function useSnoozeCountdown(snoozeUntil: number): number {
  const [minsLeft, setMinsLeft] = useState(() => calcMinsLeft(snoozeUntil));

  useEffect(() => {
    // Recompute immediately when snoozeUntil changes
    const initial = calcMinsLeft(snoozeUntil);
    setMinsLeft(initial);

    if (initial <= 0) return; // Nothing to count down

    // Tick every 60 s; also schedule a precise tick at the exact expiry second
    const intervalId = setInterval(() => {
      const remaining = calcMinsLeft(snoozeUntil);
      setMinsLeft(remaining);
      if (remaining <= 0) clearInterval(intervalId);
    }, 60_000);

    // Precise expiry: fire once at the exact ms the snooze ends
    const msUntilExpiry = snoozeUntil - Date.now();
    const expiryId = msUntilExpiry > 0
      ? setTimeout(() => setMinsLeft(0), msUntilExpiry)
      : null;

    return () => {
      clearInterval(intervalId);
      if (expiryId !== null) clearTimeout(expiryId);
    };
  }, [snoozeUntil]);

  return minsLeft;
}
