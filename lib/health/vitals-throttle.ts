/**
 * vitals-throttle.ts — Weekly ingestion quota for standard vitals.
 *
 * Architecture
 * ────────────
 * All four throttled metric families share a single lightweight counter object
 * stored under one AsyncStorage key.  The counter is keyed by ISO week string
 * (YYYY-Www) so it resets automatically at the start of every Monday without
 * any scheduled job.
 *
 * Throttled metrics
 * ─────────────────
 *   • sleep          — SleepRecord[]
 *   • bloodPressure  — BloodPressureRecord[]
 *   • heartRate      — PulseRecord[] (HR from BLE / HealthKit)
 *   • restingHR      — PulseRecord[] (resting HR from Apple Watch)
 *
 * Weekly cap: VITALS_WEEKLY_CAP (default 100) records across ALL four families
 * combined.  Individual per-family caps are also enforced (see FAMILY_CAPS).
 *
 * Usage
 * ─────
 *   import { checkVitalsThrottle, recordVitalsIngestion } from '@/lib/health/vitals-throttle';
 *
 *   // Before writing new records:
 *   const result = await checkVitalsThrottle('heartRate', incomingRecords.length);
 *   if (!result.allowed) {
 *     console.warn('[Throttle]', result.reason);
 *     return; // drop the packet
 *   }
 *   // After a successful write:
 *   await recordVitalsIngestion('heartRate', incomingRecords.length);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThrottledMetric = 'sleep' | 'bloodPressure' | 'heartRate' | 'restingHR';

export interface ThrottleCheckResult {
  /** Whether the ingestion is permitted. */
  allowed: boolean;
  /** Human-readable rejection reason when allowed === false. */
  reason?: string;
  /** Records already ingested this week across ALL families. */
  weeklyTotal: number;
  /** Records already ingested this week for this specific family. */
  familyCount: number;
  /** ISO week string that resets on Monday (e.g. "2026-W22"). */
  isoWeek: string;
  /** How many slots remain in the combined weekly budget. */
  remainingTotal: number;
  /** How many slots remain in this family's per-family cap. */
  remainingFamily: number;
}

interface WeeklyCounters {
  /** ISO week key, e.g. "2026-W22" */
  week: string;
  sleep: number;
  bloodPressure: number;
  heartRate: number;
  restingHR: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Combined weekly cap across all four families. */
export const VITALS_WEEKLY_CAP = 100;

/**
 * Per-family caps within the combined 100-record budget.
 * These prevent one noisy sensor from consuming the entire quota.
 */
export const FAMILY_CAPS: Record<ThrottledMetric, number> = {
  sleep:         30,  // ~4 nights/day × 7 = 28 max; 30 gives a small buffer
  bloodPressure: 35,  // ~5 readings/day × 7 = 35
  heartRate:     50,  // most frequent; still capped to prevent BLE floods
  restingHR:     14,  // one per day from Apple Watch; 14 = 2 per day safety margin
};

const THROTTLE_KEY = '@vsht:vitals_throttle_v1';

// ─── ISO week helpers ─────────────────────────────────────────────────────────

/**
 * Returns the ISO 8601 week string for a given date, e.g. "2026-W22".
 * Week 1 is the week containing the first Thursday of the year (ISO 8601).
 */
export function getISOWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function readCounters(): Promise<WeeklyCounters> {
  const currentWeek = getISOWeek();
  try {
    const raw = await AsyncStorage.getItem(THROTTLE_KEY);
    if (!raw) return emptyCounters(currentWeek);
    const stored: WeeklyCounters = JSON.parse(raw);
    // Auto-reset when a new ISO week begins
    if (stored.week !== currentWeek) return emptyCounters(currentWeek);
    return stored;
  } catch {
    return emptyCounters(currentWeek);
  }
}

async function writeCounters(counters: WeeklyCounters): Promise<void> {
  try {
    await safeSetItem(THROTTLE_KEY, JSON.stringify(counters));
  } catch {
    // best-effort — throttle state is non-critical
  }
}

function emptyCounters(week: string): WeeklyCounters {
  return { week, sleep: 0, bloodPressure: 0, heartRate: 0, restingHR: 0 };
}

function weeklyTotal(c: WeeklyCounters): number {
  return c.sleep + c.bloodPressure + c.heartRate + c.restingHR;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether `count` new records of `metric` may be ingested this week.
 *
 * Does NOT mutate the counter — call `recordVitalsIngestion` after a successful
 * write to commit the increment.
 *
 * @param metric   The metric family being ingested.
 * @param count    Number of new records about to be written (default 1).
 */
export async function checkVitalsThrottle(
  metric: ThrottledMetric,
  count = 1,
): Promise<ThrottleCheckResult> {
  const counters = await readCounters();
  const isoWeek = counters.week;
  const total = weeklyTotal(counters);
  const familyCount = counters[metric];
  const familyCap = FAMILY_CAPS[metric];

  const remainingTotal = Math.max(0, VITALS_WEEKLY_CAP - total);
  const remainingFamily = Math.max(0, familyCap - familyCount);

  // Combined budget exhausted
  if (total + count > VITALS_WEEKLY_CAP) {
    return {
      allowed: false,
      reason: `Weekly vitals quota reached (${VITALS_WEEKLY_CAP} records). Resets Monday.`,
      weeklyTotal: total,
      familyCount,
      isoWeek,
      remainingTotal,
      remainingFamily,
    };
  }

  // Per-family cap exhausted
  if (familyCount + count > familyCap) {
    return {
      allowed: false,
      reason: `Weekly ${metric} cap reached (${familyCap} records). Resets Monday.`,
      weeklyTotal: total,
      familyCount,
      isoWeek,
      remainingTotal,
      remainingFamily,
    };
  }

  return {
    allowed: true,
    weeklyTotal: total,
    familyCount,
    isoWeek,
    remainingTotal,
    remainingFamily,
  };
}

/**
 * Commit `count` records of `metric` to the weekly counter.
 * Call this AFTER a successful storage write, not before.
 *
 * @param metric  The metric family that was written.
 * @param count   Number of records that were written (default 1).
 */
export async function recordVitalsIngestion(
  metric: ThrottledMetric,
  count = 1,
): Promise<void> {
  const counters = await readCounters();
  counters[metric] = Math.min(counters[metric] + count, FAMILY_CAPS[metric]);
  await writeCounters(counters);
}

/**
 * Read the current weekly counters for display in the Data Sources / Storage
 * settings screen.
 */
export async function getVitalsThrottleStatus(): Promise<{
  isoWeek: string;
  weeklyTotal: number;
  weeklyCapTotal: number;
  families: Record<ThrottledMetric, { count: number; cap: number; remaining: number }>;
}> {
  const counters = await readCounters();
  const total = weeklyTotal(counters);
  const families = (['sleep', 'bloodPressure', 'heartRate', 'restingHR'] as ThrottledMetric[]).reduce(
    (acc, m) => {
      acc[m] = {
        count: counters[m],
        cap: FAMILY_CAPS[m],
        remaining: Math.max(0, FAMILY_CAPS[m] - counters[m]),
      };
      return acc;
    },
    {} as Record<ThrottledMetric, { count: number; cap: number; remaining: number }>,
  );
  return {
    isoWeek: counters.week,
    weeklyTotal: total,
    weeklyCapTotal: VITALS_WEEKLY_CAP,
    families,
  };
}

/**
 * Reset all counters for the current week.
 * Exposed for testing and the "Reset throttle" developer option in Settings.
 */
export async function resetVitalsThrottle(): Promise<void> {
  await writeCounters(emptyCounters(getISOWeek()));
}
