/**
 * useHrvTarget — persists the user's personal HRV target (ms) in AsyncStorage.
 * Default: 45 ms (a reasonable "Good+" threshold for most adults).
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const KEY = '@vsht:hrv_target_ms';
const DEFAULT_TARGET = 45;

export function useHrvTarget() {
  const [target, setTargetState] = useState<number>(DEFAULT_TARGET);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v !== null) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) setTargetState(n);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setTarget = useCallback((ms: number) => {
    const clamped = Math.max(10, Math.min(200, Math.round(ms)));
    setTargetState(clamped);
    safeSetItem(KEY, String(clamped)).catch(() => {});
  }, []);

  return { target, setTarget, loaded };
}
