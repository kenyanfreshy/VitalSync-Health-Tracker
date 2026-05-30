/**
 * useMedReminderCount
 *
 * Returns the total number of actionable medication reminders for today:
 *   dueMeds (within ±60 min window) + missedDoses (>120 min past, unlogged) + refillDueMeds (within 7 days)
 *
 * Refreshes every 60 seconds and on mount.
 */
import { useEffect, useState, useCallback } from 'react';
import { loadMedications } from '@/lib/medications/storage';
import { appEvents } from '@/lib/app-events';

const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute
const DUE_WINDOW_MINUTES = 60;
const MISSED_GRACE_MINUTES = 120;
const REFILL_DAYS_WINDOW = 7;

export function useMedReminderCount(): number {
  const [count, setCount] = useState(0);

  const compute = useCallback(async () => {
    try {
      const meds = await loadMedications();
      const now = Date.now();
      const todayKey = new Date().toISOString().split('T')[0];
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

      let total = 0;

      for (const med of meds) {
        if (med.active === false) continue;

        // a) Due doses: within ±60 min window, unlogged
        for (const t of (med.scheduleTimes ?? [])) {
          const [hh, mm] = t.split(':').map(Number);
          const schedMin = hh * 60 + mm;
          const alreadyLogged = (med.doseLogs ?? []).some(
            l => l.date === todayKey && l.scheduledTime === t && (l.status === 'taken' || l.status === 'skipped')
          );
          if (!alreadyLogged && Math.abs(schedMin - nowMinutes) <= DUE_WINDOW_MINUTES) {
            total++;
          }
        }

        // b) Missed doses: >120 min past, unlogged (not yet auto-marked)
        for (const t of (med.scheduleTimes ?? [])) {
          const [hh, mm] = t.split(':').map(Number);
          const schedMin = hh * 60 + mm;
          const pastBy = nowMinutes - schedMin;
          if (pastBy < MISSED_GRACE_MINUTES) continue;
          const alreadyLogged = (med.doseLogs ?? []).some(
            l => l.date === todayKey && l.scheduledTime === t
          );
          if (!alreadyLogged) total++;
        }

        // c) Refill due within 7 days
        if (med.refillReminderDate) {
          const dueMs = new Date(med.refillReminderDate).getTime();
          const daysLeft = (dueMs - now) / (24 * 3600_000);
          if (daysLeft >= 0 && daysLeft <= REFILL_DAYS_WINDOW) total++;
        }
      }

      setCount(total);
    } catch {
      // Non-fatal — badge stays at previous value
    }
  }, []);

  useEffect(() => {
    compute();
    const interval = setInterval(compute, REFRESH_INTERVAL_MS);
    // Instantly recompute when any med reminder is dismissed so the badge clears immediately
    const unsub = appEvents.on('medReminderDismissed', compute);
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [compute]);

  return count;
}
