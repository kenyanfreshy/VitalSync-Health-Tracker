/**
 * A1C Snapshot Storage
 * Stores one projected A1C snapshot per calendar day in AsyncStorage.
 * Used to render a 30-day A1C trend line chart in ProjectedA1CCard.
 *
 * Storage key: @vitalsync/a1c_snapshots_v1
 * Format: { [dateKey: string (YYYY-MM-DD)]: number (eA1C %) }
 * Retention: 90 days (older entries are pruned automatically on write).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vitalsync/a1c_snapshots_v1';
const RETENTION_DAYS = 90;

export interface A1CSnapshot {
  date: string;   // YYYY-MM-DD
  a1c: number;    // eA1C percentage, e.g. 6.2
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Load all stored snapshots, sorted oldest → newest. */
export async function loadA1CSnapshots(): Promise<A1CSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const map: Record<string, number> = JSON.parse(raw);
    return Object.entries(map)
      .map(([date, a1c]) => ({ date, a1c }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (_unused) {
    return [];
  }
}

/**
 * Persist today's projected A1C value.
 * Overwrites any existing entry for today.
 * Prunes entries older than RETENTION_DAYS.
 */
export async function saveA1CSnapshot(a1c: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};

    // Write today's value
    map[todayKey()] = a1c;

    // Prune old entries
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    for (const key of Object.keys(map)) {
      if (key < cutoffKey) delete map[key];
    }

    await safeSetItem(STORAGE_KEY, JSON.stringify(map));
  } catch (_unused) {
    // Non-critical — silently ignore storage errors
  }
}

/** Remove all stored A1C snapshots (used by "Clear A1C history" action). */
export async function clearA1CSnapshots(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (_unused) {
    // Non-critical
  }
}

/**
 * Return the last N days of snapshots as an array of (date, a1c) pairs.
 * Days with no snapshot are filled with null.
 */
export function buildTrendSeries(
  snapshots: A1CSnapshot[],
  days: number,
): { date: string; a1c: number | null }[] {
  const map = new Map(snapshots.map((s) => [s.date, s.a1c]));
  const result: { date: string; a1c: number | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, a1c: map.get(key) ?? null });
  }
  return result;
}
