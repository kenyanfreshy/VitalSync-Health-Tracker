/**
 * useUnreadAlertBadge
 * Provides the current unread alert count and a function to clear it.
 * Used by the tab bar to show/hide the red badge on the Settings tab.
 *
 * Sources:
 *  - General threshold alerts (alert-history)
 *  - Analyte threshold alerts (analyte-alert-badge)
 *  - Crash logs (crash-logger)
 *
 * Performance note: the AppState 'active' listener is debounced by 300ms so
 * rapid tab-switch events don't trigger multiple concurrent AsyncStorage reads
 * on the JS thread, which was causing the tab navigation freeze.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getUnreadAlertCount,
  clearUnreadAlertCount,
} from '@/lib/notifications/alert-history';
import {
  getAnalyteAlertBadgeCount,
  clearAnalyteAlertBadge,
} from '@/lib/notifications/analyte-alert-badge';
import { readCrashLogs } from '@/lib/crash-logger';

export function useUnreadAlertBadge() {
  const [count, setCount] = useState(0);
  const [crashCount, setCrashCount] = useState(0);
  const [analyteCount, setAnalyteCount] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const [alertCount, analyteBadge, logs] = await Promise.all([
      getUnreadAlertCount().catch(() => 0),
      getAnalyteAlertBadgeCount().catch(() => 0),
      readCrashLogs().catch(() => []),
    ]);
    setCrashCount(logs.length);
    setAnalyteCount(analyteBadge);
    setCount(alertCount + analyteBadge + logs.length);
  }, []);

  // Debounced refresh: coalesces rapid AppState 'active' events (e.g. from tab
  // switches) into a single async read, preventing JS thread contention.
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(refresh, 300);
  }, [refresh]);

  /** Clear general + analyte alert counts; keep crash log count in badge. */
  const clearBadge = useCallback(async () => {
    await Promise.all([clearUnreadAlertCount(), clearAnalyteAlertBadge()]);
    setAnalyteCount(0);
    setCount(crashCount); // keep crash log count until logs are cleared
  }, [crashCount]);

  /** Clear only the analyte portion of the badge (called from Threshold Alerts screen). */
  const clearAnalyteBadge = useCallback(async () => {
    await clearAnalyteAlertBadge();
    setAnalyteCount(0);
    setCount(prev => Math.max(0, prev - analyteCount));
  }, [analyteCount]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') debouncedRefresh();
    });
    return () => {
      sub.remove();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [refresh, debouncedRefresh]);

  return { count, crashCount, analyteCount, clearBadge, clearAnalyteBadge, refresh };
}
