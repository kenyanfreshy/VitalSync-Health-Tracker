/**
 * useOverdueVaccineBadge
 *
 * Returns `{ hasBadge, hasDueSoon, clearBadge }`:
 * - `hasBadge`: true when at least one immunization record has a `nextDoseDate`
 *   that is in the past (overdue) and has not been dismissed this session.
 * - `hasDueSoon`: true when at least one immunization record has a `nextDoseDate`
 *   within the next 30 days (but not yet overdue) and has not been dismissed.
 *   Refreshes every 60 seconds to catch midnight rollovers.
 * - `clearBadge`: call this when the user opens the Immunizations screen to
 *   suppress both dots until the next app launch.
 *
 * The suppression is session-only (not persisted) — dots reappear on the
 * next app launch if the vaccine is still overdue or due soon.
 */
import { useEffect, useState, useCallback } from 'react';
import { useHealth } from '@/lib/health/health-context';

const REFRESH_INTERVAL_MS = 60 * 1000;
const DUE_SOON_DAYS = 30;

export function useOverdueVaccineBadge(): {
  hasBadge: boolean;
  hasDueSoon: boolean;
  clearBadge: () => void;
} {
  const { state } = useHealth();
  const [suppressed, setSuppressed] = useState(false);
  const [hasBadge, setHasBadge] = useState(false);
  const [hasDueSoon, setHasDueSoon] = useState(false);

  function compute(isSuppressed: boolean) {
    if (isSuppressed) {
      setHasBadge(false);
      setHasDueSoon(false);
      return;
    }
    const immunizations = state.data?.immunizations ?? [];
    const now = Date.now();
    const dueSoonThreshold = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;

    let overdue = false;
    let dueSoon = false;

    for (const r of immunizations) {
      if (!r.nextDoseDate) continue;
      const dueMs = new Date(r.nextDoseDate + 'T00:00:00').getTime();
      if (dueMs < now) {
        overdue = true;
      } else if (dueMs <= dueSoonThreshold) {
        dueSoon = true;
      }
      // Early exit once both flags are set
      if (overdue && dueSoon) break;
    }

    setHasBadge(overdue);
    setHasDueSoon(dueSoon);
  }

  useEffect(() => {
    compute(suppressed);
    const id = setInterval(() => compute(suppressed), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.immunizations, suppressed]);

  const clearBadge = useCallback(() => {
    setSuppressed(true);
  }, []);

  return { hasBadge, hasDueSoon, clearBadge };
}
