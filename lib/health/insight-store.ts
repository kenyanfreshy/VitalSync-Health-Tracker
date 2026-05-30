/**
 * InsightStore
 *
 * Manages per-insight cooldown timestamps using AsyncStorage.
 * Prevents the same insight from surfacing repeatedly within the cooldown window.
 *
 * - Default cooldown: 1 hour
 * - Stores: { [insightId]: lastShownISO }
 * - Safe: all operations wrapped in try/catch
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORE_KEY = '@vsht:insight_cooldowns_v1';
export const INSIGHT_COOLDOWN_DURATION_KEY = '@vsht:insight_cooldown_duration_ms';
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// ─── Per-metric cooldown overrides ───────────────────────────────────────────

export type InsightMetricKey = 'systolic' | 'bpm' | 'spo2' | 'sleepHrs' | 'hrv' | 'weight' | 'steps' | 'glucose';

const METRIC_COOLDOWN_KEY_PREFIX = '@vsht:insight_cooldown_metric_';

/**
 * Returns the cooldown duration in ms for a specific metric.
 * Falls back to the global cooldown if no per-metric override is set.
 */
export async function getMetricCooldownMs(metric: InsightMetricKey): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`${METRIC_COOLDOWN_KEY_PREFIX}${metric}`);
    if (raw) {
      const parsed = Number(raw);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // non-fatal
  }
  // Fall back to global cooldown
  return getInsightCooldownMs();
}

/**
 * Persists a per-metric cooldown override in ms.
 * Pass null to remove the override and fall back to the global setting.
 */
export async function setMetricCooldownMs(metric: InsightMetricKey, ms: number | null): Promise<void> {
  try {
    if (ms === null) {
      await AsyncStorage.removeItem(`${METRIC_COOLDOWN_KEY_PREFIX}${metric}`);
    } else {
      await safeSetItem(`${METRIC_COOLDOWN_KEY_PREFIX}${metric}`, String(ms));
    }
  } catch {
    // non-fatal
  }
}

/**
 * Loads all per-metric cooldown overrides as a Record<metric, ms>.
 * Only includes metrics that have an explicit override set.
 */
export async function getAllMetricCooldowns(): Promise<Partial<Record<InsightMetricKey, number>>> {
  const metrics: InsightMetricKey[] = ['systolic', 'bpm', 'spo2', 'sleepHrs', 'hrv', 'weight', 'steps', 'glucose'];
  const result: Partial<Record<InsightMetricKey, number>> = {};
  await Promise.all(metrics.map(async (m) => {
    try {
      const raw = await AsyncStorage.getItem(`${METRIC_COOLDOWN_KEY_PREFIX}${m}`);
      if (raw) {
        const parsed = Number(raw);
        if (!isNaN(parsed) && parsed > 0) result[m] = parsed;
      }
    } catch { /* non-fatal */ }
  }));
  return result;
}

/** Returns the user-configured cooldown duration in ms (defaults to 1 hour). */
export async function getInsightCooldownMs(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(INSIGHT_COOLDOWN_DURATION_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // non-fatal
  }
  return DEFAULT_COOLDOWN_MS;
}

/** Persists the user-configured cooldown duration in ms. */
export async function setInsightCooldownMs(ms: number): Promise<void> {
  try {
    await safeSetItem(INSIGHT_COOLDOWN_DURATION_KEY, String(ms));
  } catch {
    // non-fatal
  }
}

type CooldownMap = Record<string, string>; // insightId → ISO timestamp

let _cache: CooldownMap | null = null;

async function load(): Promise<CooldownMap> {
  if (_cache !== null) return _cache;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    _cache = raw ? (JSON.parse(raw) as CooldownMap) : {};
  } catch {
    _cache = {};
  }
  return _cache;
}

async function save(map: CooldownMap): Promise<void> {
  try {
    _cache = map;
    await safeSetItem(STORE_KEY, JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

/**
 * Returns true if the insight with the given ID is currently in cooldown.
 * An insight is in cooldown if it was last shown within the cooldown window.
 */
export async function isInsightOnCooldown(
  insightId: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<boolean> {
  try {
    const map = await load();
    const lastShown = map[insightId];
    if (!lastShown) return false;
    const elapsed = Date.now() - new Date(lastShown).getTime();
    return elapsed < cooldownMs;
  } catch {
    return false;
  }
}

/**
 * Records that an insight was shown right now, starting its cooldown.
 */
export async function markInsightShown(insightId: string): Promise<void> {
  try {
    const map = await load();
    map[insightId] = new Date().toISOString();
    await save(map);
  } catch {
    // non-fatal
  }
}

/**
 * Clears the cooldown for a specific insight (for testing or manual reset).
 */
export async function clearInsightCooldown(insightId: string): Promise<void> {
  try {
    const map = await load();
    delete map[insightId];
    await save(map);
  } catch {
    // non-fatal
  }
}

/**
 * Clears all insight cooldowns.
 */
export async function clearAllInsightCooldowns(): Promise<void> {
  try {
    _cache = {};
    await AsyncStorage.removeItem(STORE_KEY);
  } catch {
    // non-fatal
  }
}

/**
 * Returns the ISO timestamp when an insight was last shown, or null if never.
 */
export async function getInsightLastShown(insightId: string): Promise<string | null> {
  try {
    const map = await load();
    return map[insightId] ?? null;
  } catch {
    return null;
  }
}
