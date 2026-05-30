/**
 * Readiness Score History — AsyncStorage persistence for daily snapshots.
 *
 * Stores up to 90 daily readiness score snapshots keyed by YYYY-MM-DD.
 * Each snapshot contains the total score and all six component scores.
 *
 * Usage:
 *   await saveReadinessSnapshot(components);
 *   const history = await loadReadinessHistory(30);
 */
import type { ReadinessComponents } from './readiness-score';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

const STORAGE_KEY = '@vsht:readiness_history_v1';
const MAX_SNAPSHOTS = 90;

export interface ReadinessSnapshot {
  date: string; // YYYY-MM-DD
  total: number;
  sleepDuration: number;
  sleepEfficiency: number;
  restingHR: number;
  hrv: number;
  spo2: number;
  bp: number;
}

type SnapshotMap = Record<string, ReadinessSnapshot>;

async function loadSnapshotMap(): Promise<SnapshotMap> {
  try {
    const raw = await secureGetItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SnapshotMap;
  } catch (_unused) {
    return {};
  }
}

async function saveSnapshotMap(map: SnapshotMap): Promise<void> {
  try {
    // Prune to MAX_SNAPSHOTS most recent dates
    const keys = Object.keys(map).sort();
    if (keys.length > MAX_SNAPSHOTS) {
      const toDelete = keys.slice(0, keys.length - MAX_SNAPSHOTS);
      for (const k of toDelete) delete map[k];
    }
    await secureSetItem(STORAGE_KEY, JSON.stringify(map));
  } catch (_unused) {
    // Silently fail — history is non-critical
  }
}

/**
 * Save today's readiness score snapshot.
 * Overwrites any existing snapshot for today.
 */
export async function saveReadinessSnapshot(components: ReadinessComponents): Promise<void> {
  if (!components.hasData) return;
  const today = new Date().toISOString().split('T')[0];
  const map = await loadSnapshotMap();
  map[today] = {
    date: today,
    total: components.total,
    sleepDuration: components.sleepDuration,
    sleepEfficiency: components.sleepEfficiency,
    restingHR: components.restingHR,
    hrv: components.hrv,
    spo2: components.spo2,
    bp: components.bp,
  };
  await saveSnapshotMap(map);
}

/**
 * Load readiness history for the last N days.
 * Returns an array of snapshots sorted oldest → newest.
 * Days with no data are filled with null.
 */
export async function loadReadinessHistory(days: number = 30): Promise<(ReadinessSnapshot | null)[]> {
  const map = await loadSnapshotMap();
  const result: (ReadinessSnapshot | null)[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push(map[dateStr] ?? null);
  }
  return result;
}

/**
 * Build a compact array of { date, score } points for charting.
 * Only includes days that have data (non-null snapshots).
 */
export function buildReadinessTrendPoints(
  history: (ReadinessSnapshot | null)[]
): { date: string; score: number; index: number }[] {
  return history
    .map((snap, idx) => snap ? { date: snap.date, score: snap.total, index: idx } : null)
    .filter((p): p is { date: string; score: number; index: number } => p !== null);
}

/**
 * Compute a 7-day rolling average from history snapshots.
 * Returns an array aligned to the history array (null for days without enough data).
 */
export function computeRollingAverage(
  history: (ReadinessSnapshot | null)[],
  windowSize: number = 7
): (number | null)[] {
  return history.map((_, idx) => {
    const window = history.slice(Math.max(0, idx - windowSize + 1), idx + 1);
    const valid = window.filter((s): s is ReadinessSnapshot => s !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((sum, s) => sum + s.total, 0) / valid.length);
  });
}

/**
 * Get the trend direction for the last N days.
 * Returns 'improving', 'declining', or 'stable'.
 */
export function getReadinessTrend(
  history: (ReadinessSnapshot | null)[],
  lookback: number = 7
): 'improving' | 'declining' | 'stable' {
  const recent = history
    .slice(-lookback)
    .filter((s): s is ReadinessSnapshot => s !== null);
  if (recent.length < 3) return 'stable';
  const first = recent.slice(0, Math.floor(recent.length / 2));
  const last = recent.slice(Math.ceil(recent.length / 2));
  const firstAvg = first.reduce((s, r) => s + r.total, 0) / first.length;
  const lastAvg = last.reduce((s, r) => s + r.total, 0) / last.length;
  const delta = lastAvg - firstAvg;
  if (delta > 5) return 'improving';
  if (delta < -5) return 'declining';
  return 'stable';
}
