/**
 * useUpcomingAppointmentBadge
 *
 * Returns `{ hasBadge, clearBadge }`:
 * - `hasBadge`: true when there is at least one upcoming appointment within the
 *   next 24 hours that has not been dismissed. Refreshes every 60 seconds.
 * - `clearBadge`: call this when the user opens the Appointments screen to
 *   suppress the dot until the next appointment enters the 24h window.
 *
 * The suppression is session-only (not persisted) — the dot reappears on the
 * next app launch if the appointment is still within 24h.
 */

import { useEffect, useState, useCallback } from 'react';
import { useHealth } from '@/lib/health/health-context';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS  = 60 * 1000;

export function useUpcomingAppointmentBadge(): {
  hasBadge: boolean;
  count: number;
  clearBadge: () => void;
} {
  const { state } = useHealth();
  const [suppressed, setSuppressed] = useState(false);
  const [hasBadge, setHasBadge] = useState(false);
  const [count, setCount] = useState(0);

  function compute(isSuppressed: boolean) {
    if (isSuppressed) {
      setHasBadge(false);
      setCount(0);
      return;
    }
    const appointments = state.data?.appointments ?? [];
    const now = Date.now();
    const activeAppts = appointments.filter(a => {
      const apptMs = new Date(a.dateTime).getTime();
      return apptMs > now && apptMs <= now + TWENTY_FOUR_HOURS_MS && !a.reminderDismissed;
    });
    setHasBadge(activeAppts.length > 0);
    setCount(activeAppts.length);
  }

  useEffect(() => {
    compute(suppressed);
    const id = setInterval(() => compute(suppressed), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.data?.appointments, suppressed]);

  const clearBadge = useCallback(() => {
    setSuppressed(true);
  }, []);

  return { hasBadge, count, clearBadge };
}
