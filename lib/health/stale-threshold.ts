/**
 * Stale-data threshold preference.
 *
 * Controls how many hours must pass before a BentoMetricTile shows
 * the amber "⟳ Sync now" badge instead of the normal "Last: …" badge.
 *
 * Storage key: @vitalsync/stale_threshold_hours
 * Default: 6 hours
 * Allowed values: 3, 6, 12, 24 hours
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = '@vitalsync/stale_threshold_hours';
export const STALE_THRESHOLD_OPTIONS = [3, 6, 12, 24] as const;
export type StaleThresholdHours = (typeof STALE_THRESHOLD_OPTIONS)[number];
export const DEFAULT_STALE_THRESHOLD_HOURS: StaleThresholdHours = 6;

export async function loadStaleThreshold(): Promise<StaleThresholdHours> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STALE_THRESHOLD_HOURS;
    const parsed = parseInt(raw, 10);
    if ((STALE_THRESHOLD_OPTIONS as readonly number[]).includes(parsed)) {
      return parsed as StaleThresholdHours;
    }
    return DEFAULT_STALE_THRESHOLD_HOURS;
  } catch {
    return DEFAULT_STALE_THRESHOLD_HOURS;
  }
}

export async function saveStaleThreshold(hours: StaleThresholdHours): Promise<void> {
  try {
    await safeSetItem(STORAGE_KEY, String(hours));
  } catch {
    // Non-critical
  }
}

/** React hook that reads and persists the stale threshold. */
export function useStaleThreshold() {
  const [hours, setHours] = useState<StaleThresholdHours>(DEFAULT_STALE_THRESHOLD_HOURS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadStaleThreshold().then((v) => {
      setHours(v);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(async (next: StaleThresholdHours) => {
    setHours(next);
    await saveStaleThreshold(next);
  }, []);

  return { hours, loaded, update };
}
