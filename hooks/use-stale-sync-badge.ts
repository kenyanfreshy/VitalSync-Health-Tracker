/**
 * useStaleSyncBadge
 *
 * Returns `true` when health data has not been synced in the past 24 hours
 * (or has never been synced). Used to show a dot badge on the Record tab icon.
 *
 * Recalculates every 5 minutes so the badge disappears automatically after
 * the user syncs without requiring a full re-render of the tab layout.
 */
import { useEffect, useState } from 'react';
import { useHealth } from '@/lib/health/health-context';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;       // 5 minutes

function isStale(lastSyncedAt: string | null | undefined): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > STALE_THRESHOLD_MS;
}

export function useStaleSyncBadge(): boolean {
  const { state } = useHealth();
  const lastSyncedAt = state.data?.lastSyncedAt ?? null;
  const [stale, setStale] = useState(() => isStale(lastSyncedAt));

  // Recompute immediately when lastSyncedAt changes (e.g., after a sync)
  useEffect(() => {
    setStale(isStale(lastSyncedAt));
  }, [lastSyncedAt]);

  // Recheck periodically so the badge appears even without a sync event
  useEffect(() => {
    const interval = setInterval(() => {
      setStale(isStale(lastSyncedAt));
    }, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  return stale;
}
