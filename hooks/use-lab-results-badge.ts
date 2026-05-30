/**
 * useLabResultsBadge
 *
 * Tracks whether new lab results have been added since the user last visited
 * the Labs screen. The badge count is set when a lab result is saved and
 * cleared when the user opens the Labs screen.
 *
 * Persisted via AsyncStorage so the badge survives app restarts.
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vsht:newLabResultsCount';

export function useLabResultsBadge() {
  const [newCount, setNewCount] = useState(0);

  // Load persisted count on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        const n = val ? parseInt(val, 10) : 0;
        if (!isNaN(n) && n > 0) setNewCount(n);
      })
      .catch(() => {});
  }, []);

  /** Call this when a new lab result is saved. */
  const markNewLabResult = useCallback(() => {
    setNewCount((prev) => {
      const next = prev + 1;
      safeSetItem(STORAGE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  /** Call this when the user opens the Labs screen. */
  const clearLabBadge = useCallback(() => {
    setNewCount(0);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  return { newCount, markNewLabResult, clearLabBadge };
}
