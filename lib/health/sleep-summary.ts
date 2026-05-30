/**
 * sleep-summary.ts — VitalSync daily sleep consolidation engine.
 *
 * Problem this solves
 * ───────────────────
 * HealthKit returns individual sleep-stage segments (Awake, Core, Deep, REM, InBed)
 * for each night. A single 8-hour night can produce 20–50 raw segments. Without
 * consolidation, repeated syncs inflate the stored record count into the hundreds
 * or thousands, slowing the dashboard and making the sleep count meaningless.
 *
 * What this module does
 * ─────────────────────
 * 1. consolidateSleepRecords()
 *    Takes an array of SleepRecord objects (already stage-aggregated by
 *    native-health-service.ts into one-record-per-night) and merges any
 *    duplicates for the same calendar date into a single DailySleepSummary.
 *    Result: at most ONE summary per calendar day.
 *
 * 2. applyActiveSleepLimit()
 *    Keeps the most recent SLEEP_ACTIVE_LIMIT (30) daily summaries as "active".
 *    Older summaries are marked as candidates for 3-day rollup aggregation.
 *
 * 3. buildThreeDayRollups()
 *    Converts daily summaries older than 30 days into rolling 3-day summaries
 *    for compact long-term storage while preserving trend data for doctor reports.
 *
 * 4. mergeSleepIntoStorage()
 *    Async entry point: loads existing sleep data, merges incoming records,
 *    applies the 30-day active limit, builds rollups, and persists the result.
 *
 * Data integrity guarantees
 * ─────────────────────────
 * - Source data in Apple Health / HealthKit is NEVER modified.
 * - AFib / clinical flags are not touched (sleep module is independent of EKG).
 * - All functions are pure and fail-safe: null/undefined/malformed input returns
 *   sensible defaults without throwing.
 * - No synchronous JSON parsing on the UI thread: all storage I/O is async.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import type { SleepRecord } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of daily sleep summaries kept as "active" (full detail). */
export const SLEEP_ACTIVE_LIMIT = 30;

/** Records older than this many days are eligible for 3-day rollup. */
export const SLEEP_ROLLUP_THRESHOLD_DAYS = 30;

/** AsyncStorage key for the consolidated sleep store. */
export const SLEEP_SUMMARY_KEY = '@vsht:sleep_summaries_v1';

/** AsyncStorage key for the 3-day rollup store. */
export const SLEEP_ROLLUP_KEY = '@vsht:sleep_rollups_v1';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One consolidated sleep summary per calendar day.
 * Replaces raw multi-segment SleepRecord storage.
 */
export interface DailySleepSummary {
  /** YYYY-MM-DD — the calendar date of wake-up (primary key). */
  date: string;
  /** ISO 8601 — earliest bedtime across all sessions for this date. */
  bedtime: string;
  /** ISO 8601 — latest wake time across all sessions for this date. */
  wakeTime: string;
  /** Total sleep duration in minutes (deep + REM + core + light). */
  totalMinutes: number;
  /** Minutes of deep sleep. */
  deepMinutes: number;
  /** Minutes of REM sleep. */
  remMinutes: number;
  /** Minutes of light/core sleep. */
  lightMinutes: number;
  /** Minutes of core sleep (Apple Watch stage). */
  coreMinutes: number;
  /** Minutes awake during the sleep window. */
  awakeMinutes: number;
  /** Sleep efficiency 0–100 %. */
  efficiency: number;
  /** Optional consistency score (0–100) if available from source. */
  consistencyScore?: number;
  /** Source device / app name. */
  source?: string;
  /** ISO 8601 — when this summary was last updated by a sync. */
  lastSyncedAt: string;
  /**
   * If multiple sleep sessions occurred on this date (e.g. nap + night),
   * their individual session windows are stored here for reference.
   */
  sessions?: Array<{
    bedtime: string;
    wakeTime: string;
    totalMinutes: number;
    source?: string;
  }>;
}

/**
 * A rolling 3-day summary for sleep data older than SLEEP_ROLLUP_THRESHOLD_DAYS.
 */
export interface ThreeDaySleepRollup {
  /** YYYY-MM-DD — start date of the 3-day window. */
  startDate: string;
  /** YYYY-MM-DD — end date of the 3-day window. */
  endDate: string;
  /** Average total sleep duration in minutes. */
  avgTotalMinutes: number;
  /** Average bedtime as HH:MM (local time). */
  avgBedtime: string;
  /** Average wake time as HH:MM (local time). */
  avgWakeTime: string;
  /** Average sleep efficiency 0–100 %. */
  avgEfficiency: number;
  /** Average consistency score, if available. */
  avgConsistencyScore?: number;
  /** Trend direction based on totalMinutes change across the window. */
  trendDirection: 'improving' | 'stable' | 'declining';
  /** Number of days included in this rollup (1–3). */
  dayCount: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD from an ISO string, returning '' on failure. */
function toDateKey(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** Parse an ISO string to ms, returning 0 on failure. */
function toMs(iso: string | undefined | null): number {
  if (!iso) return 0;
  try {
    const ms = new Date(iso).getTime();
    return isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
}

/** Format a Date as HH:MM (24-hour local time). */
function toHHMM(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Average an array of numbers, returning 0 for empty arrays. */
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/**
 * Average an array of HH:MM strings by converting to minutes-since-midnight,
 * averaging, then converting back. Handles midnight crossings naively.
 */
function avgHHMM(times: string[]): string {
  if (times.length === 0) return '00:00';
  const minutes = times.map((t) => {
    const [h, m] = t.split(':').map(Number);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  });
  const mean = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
  const h = Math.floor(mean / 60) % 24;
  const m = mean % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ─── Core consolidation ───────────────────────────────────────────────────────

/**
 * Consolidate an array of SleepRecord objects into one DailySleepSummary per
 * calendar date. Multiple records for the same date are merged; their stage
 * minutes are summed and efficiency is recomputed.
 *
 * This is the primary deduplication step. It handles:
 * - Multiple HealthKit stage segments already grouped by native-health-service.ts
 * - Repeated syncs that re-fetch the same night
 * - Naps (stored as sessions inside the daily summary)
 *
 * @param records  Raw SleepRecord array from HealthKit / manual entry / Oura.
 * @returns        Map of YYYY-MM-DD → DailySleepSummary (one per date).
 */
export function consolidateSleepRecords(
  records: SleepRecord[],
): Map<string, DailySleepSummary> {
  const byDate = new Map<string, DailySleepSummary>();

  for (const r of records) {
    if (!r || typeof r !== 'object') continue;

    // Use the record's explicit date field, falling back to the wake-time date.
    const dateKey = r.date || toDateKey(r.wakeTime) || toDateKey(r.bedtime);
    if (!dateKey) continue;

    const existing = byDate.get(dateKey);

    if (!existing) {
      // First record for this date — create a new summary.
      const totalMinutes = Math.max(0, r.totalMinutes ?? 0);
      const awakeMinutes = Math.max(0, r.awakeMinutes ?? 0);
      const efficiency =
        r.efficiency != null
          ? r.efficiency
          : totalMinutes > 0
          ? Math.round((totalMinutes / (totalMinutes + awakeMinutes)) * 100)
          : 0;

      byDate.set(dateKey, {
        date: dateKey,
        bedtime: r.bedtime ?? '',
        wakeTime: r.wakeTime ?? '',
        totalMinutes,
        deepMinutes: Math.max(0, r.deepMinutes ?? 0),
        remMinutes: Math.max(0, r.remMinutes ?? 0),
        lightMinutes: Math.max(0, r.lightMinutes ?? 0),
        coreMinutes: Math.max(0, r.coreMinutes ?? 0),
        awakeMinutes,
        efficiency,
        source: r.source,
        lastSyncedAt: new Date().toISOString(),
        sessions: [
          {
            bedtime: r.bedtime ?? '',
            wakeTime: r.wakeTime ?? '',
            totalMinutes,
            source: r.source,
          },
        ],
      });
    } else {
      // Merge into existing summary: extend the bedtime/wakeTime window,
      // sum stage minutes, recompute efficiency.
      const earlierBedtime =
        toMs(r.bedtime) > 0 && (toMs(existing.bedtime) === 0 || toMs(r.bedtime) < toMs(existing.bedtime))
          ? r.bedtime
          : existing.bedtime;
      const laterWakeTime =
        toMs(r.wakeTime) > 0 && toMs(r.wakeTime) > toMs(existing.wakeTime)
          ? r.wakeTime
          : existing.wakeTime;

      const deepMinutes = existing.deepMinutes + Math.max(0, r.deepMinutes ?? 0);
      const remMinutes = existing.remMinutes + Math.max(0, r.remMinutes ?? 0);
      const lightMinutes = existing.lightMinutes + Math.max(0, r.lightMinutes ?? 0);
      const coreMinutes = existing.coreMinutes + Math.max(0, r.coreMinutes ?? 0);
      const awakeMinutes = existing.awakeMinutes + Math.max(0, r.awakeMinutes ?? 0);
      const totalMinutes = deepMinutes + remMinutes + lightMinutes + coreMinutes;
      const efficiency =
        totalMinutes > 0
          ? Math.round((totalMinutes / (totalMinutes + awakeMinutes)) * 100)
          : existing.efficiency;

      const sessions = [
        ...(existing.sessions ?? []),
        {
          bedtime: r.bedtime ?? '',
          wakeTime: r.wakeTime ?? '',
          totalMinutes: Math.max(0, r.totalMinutes ?? 0),
          source: r.source,
        },
      ];

      byDate.set(dateKey, {
        ...existing,
        bedtime: earlierBedtime,
        wakeTime: laterWakeTime,
        totalMinutes,
        deepMinutes,
        remMinutes,
        lightMinutes,
        coreMinutes,
        awakeMinutes,
        efficiency,
        lastSyncedAt: new Date().toISOString(),
        sessions,
      });
    }
  }

  return byDate;
}

/**
 * Merge incoming SleepRecord[] into an existing DailySleepSummary map.
 * Existing summaries for a date are updated (not replaced) so that a repeated
 * sync updates the summary rather than creating a duplicate.
 *
 * @param existing  Current summaries (from storage).
 * @param incoming  New records from the latest HealthKit / manual sync.
 * @returns         Updated map with incoming data merged in.
 */
export function mergeSleepSummaries(
  existing: Map<string, DailySleepSummary>,
  incoming: SleepRecord[],
): Map<string, DailySleepSummary> {
  if (!incoming || incoming.length === 0) return existing;

  // Build a map from the incoming records.
  const incomingMap = consolidateSleepRecords(incoming);

  // Merge: for each incoming date, if a summary already exists, merge the
  // sessions and recompute totals; otherwise insert the new summary.
  const merged = new Map(existing);
  for (const [date, incomingSummary] of incomingMap.entries()) {
    const existingSummary = merged.get(date);
    if (!existingSummary) {
      merged.set(date, incomingSummary);
    } else {
      // Re-merge by treating the existing summary as a SleepRecord.
      const existingAsRecord: SleepRecord = {
        id: `existing-${date}`,
        date,
        bedtime: existingSummary.bedtime,
        wakeTime: existingSummary.wakeTime,
        totalMinutes: existingSummary.totalMinutes,
        deepMinutes: existingSummary.deepMinutes,
        remMinutes: existingSummary.remMinutes,
        lightMinutes: existingSummary.lightMinutes,
        awakeMinutes: existingSummary.awakeMinutes,
        coreMinutes: existingSummary.coreMinutes,
        efficiency: existingSummary.efficiency,
        source: existingSummary.source,
      };
      const incomingAsRecord: SleepRecord = {
        id: `incoming-${date}`,
        date,
        bedtime: incomingSummary.bedtime,
        wakeTime: incomingSummary.wakeTime,
        totalMinutes: incomingSummary.totalMinutes,
        deepMinutes: incomingSummary.deepMinutes,
        remMinutes: incomingSummary.remMinutes,
        lightMinutes: incomingSummary.lightMinutes,
        awakeMinutes: incomingSummary.awakeMinutes,
        coreMinutes: incomingSummary.coreMinutes ?? 0,
        efficiency: incomingSummary.efficiency,
        source: incomingSummary.source,
      };
      const remerged = consolidateSleepRecords([existingAsRecord, incomingAsRecord]);
      const mergedSummary = remerged.get(date);
      if (mergedSummary) {
        // Preserve sessions from both sides.
        mergedSummary.sessions = [
          ...(existingSummary.sessions ?? []),
          ...(incomingSummary.sessions ?? []),
        ];
        merged.set(date, mergedSummary);
      }
    }
  }

  return merged;
}

// ─── Active limit ─────────────────────────────────────────────────────────────

/**
 * Split a summary map into "active" (most recent SLEEP_ACTIVE_LIMIT days)
 * and "archive" (everything older).
 *
 * @returns  { active, archive } — both as arrays sorted newest-first.
 */
export function splitActiveSleepSummaries(summaries: Map<string, DailySleepSummary>): {
  active: DailySleepSummary[];
  archive: DailySleepSummary[];
} {
  const all = Array.from(summaries.values()).sort(
    (a, b) => toMs(b.wakeTime || b.date) - toMs(a.wakeTime || a.date),
  );
  const active = all.slice(0, SLEEP_ACTIVE_LIMIT);
  const archive = all.slice(SLEEP_ACTIVE_LIMIT);
  return { active, archive };
}

// ─── 3-day rollup ─────────────────────────────────────────────────────────────

/**
 * Build rolling 3-day summaries from an array of DailySleepSummary objects.
 * Input is sorted oldest-first; output groups are non-overlapping 3-day windows.
 *
 * @param summaries  Daily summaries to aggregate (typically the "archive" set).
 * @returns          Array of ThreeDaySleepRollup, sorted newest-first.
 */
export function buildThreeDayRollups(
  summaries: DailySleepSummary[],
): ThreeDaySleepRollup[] {
  if (!summaries || summaries.length === 0) return [];

  // Sort oldest-first for windowing.
  const sorted = [...summaries].sort(
    (a, b) => toMs(a.wakeTime || a.date) - toMs(b.wakeTime || b.date),
  );

  const rollups: ThreeDaySleepRollup[] = [];
  let i = 0;

  while (i < sorted.length) {
    const window = sorted.slice(i, i + 3);
    const dayCount = window.length;

    const totalMinutes = window.map((s) => s.totalMinutes);
    const efficiencies = window.map((s) => s.efficiency);
    const bedtimes = window
      .map((s) => s.bedtime)
      .filter(Boolean)
      .map((iso) => toHHMM(new Date(iso)));
    const wakeTimes = window
      .map((s) => s.wakeTime)
      .filter(Boolean)
      .map((iso) => toHHMM(new Date(iso)));
    const consistencyScores = window
      .map((s) => s.consistencyScore)
      .filter((v): v is number => v != null);

    // Trend: compare first half vs second half of the window.
    const firstHalf = totalMinutes.slice(0, Math.ceil(dayCount / 2));
    const secondHalf = totalMinutes.slice(Math.ceil(dayCount / 2));
    const firstAvg = avg(firstHalf);
    const secondAvg = avg(secondHalf);
    const diff = secondAvg - firstAvg;
    const trendDirection: ThreeDaySleepRollup['trendDirection'] =
      diff > 10 ? 'improving' : diff < -10 ? 'declining' : 'stable';

    rollups.push({
      startDate: window[0].date,
      endDate: window[window.length - 1].date,
      avgTotalMinutes: avg(totalMinutes),
      avgBedtime: avgHHMM(bedtimes),
      avgWakeTime: avgHHMM(wakeTimes),
      avgEfficiency: avg(efficiencies),
      avgConsistencyScore: consistencyScores.length > 0 ? avg(consistencyScores) : undefined,
      trendDirection,
      dayCount,
    });

    i += 3;
  }

  // Return newest-first.
  return rollups.reverse();
}

// ─── Async storage layer ──────────────────────────────────────────────────────

/** Load persisted daily summaries from AsyncStorage. */
export async function loadSleepSummaries(): Promise<Map<string, DailySleepSummary>> {
  try {
    const raw = await AsyncStorage.getItem(SLEEP_SUMMARY_KEY);
    if (!raw) return new Map();
    const arr: DailySleepSummary[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Map();
    return new Map(arr.map((s) => [s.date, s]));
  } catch {
    return new Map();
  }
}

/** Persist active daily summaries to AsyncStorage. */
export async function saveSleepSummaries(
  summaries: DailySleepSummary[],
): Promise<void> {
  try {
    await safeSetItem(SLEEP_SUMMARY_KEY, JSON.stringify(summaries));
  } catch {
    // best-effort
  }
}

/** Load persisted 3-day rollups from AsyncStorage. */
export async function loadSleepRollups(): Promise<ThreeDaySleepRollup[]> {
  try {
    const raw = await AsyncStorage.getItem(SLEEP_ROLLUP_KEY);
    if (!raw) return [];
    const arr: ThreeDaySleepRollup[] = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Persist 3-day rollups to AsyncStorage. */
export async function saveSleepRollups(
  rollups: ThreeDaySleepRollup[],
): Promise<void> {
  try {
    await safeSetItem(SLEEP_ROLLUP_KEY, JSON.stringify(rollups));
  } catch {
    // best-effort
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface SleepMergeResult {
  /** Active daily summaries (most recent SLEEP_ACTIVE_LIMIT days). */
  activeSummaries: DailySleepSummary[];
  /** 3-day rollups for older data. */
  rollups: ThreeDaySleepRollup[];
  /** Total number of daily summaries (active + archived before rollup). */
  totalDays: number;
  /** Number of incoming records that were merged. */
  mergedCount: number;
}

/**
 * Full async pipeline: load existing sleep data, merge incoming records,
 * apply the 30-day active limit, build 3-day rollups for older data,
 * and persist everything.
 *
 * This is the function to call from the HealthKit sync path instead of
 * directly writing raw SleepRecord[] to the health data blob.
 *
 * @param incomingRecords  Fresh SleepRecord[] from the latest sync.
 * @returns                Summary of what was stored.
 */
export async function mergeSleepIntoStorage(
  incomingRecords: SleepRecord[],
): Promise<SleepMergeResult> {
  try {
    // 1. Load existing summaries.
    const existing = await loadSleepSummaries();

    // 2. Merge incoming records into the existing summaries.
    const merged = mergeSleepSummaries(existing, incomingRecords ?? []);

    // 3. Split into active (≤30 days) and archive (>30 days).
    const { active, archive } = splitActiveSleepSummaries(merged);

    // 4. Build 3-day rollups for the archive.
    const rollups = buildThreeDayRollups(archive);

    // 5. Persist.
    await Promise.all([saveSleepSummaries(active), saveSleepRollups(rollups)]);

    return {
      activeSummaries: active,
      rollups,
      totalDays: merged.size,
      mergedCount: incomingRecords?.length ?? 0,
    };
  } catch (err) {
    console.warn('[SleepSummary] mergeSleepIntoStorage error:', err);
    return {
      activeSummaries: [],
      rollups: [],
      totalDays: 0,
      mergedCount: 0,
    };
  }
}

/**
 * Convert active DailySleepSummary[] back to SleepRecord[] for compatibility
 * with existing UI components that expect SleepRecord[].
 *
 * This is a lossy conversion (sessions are flattened), but it preserves all
 * fields needed by the dashboard, detail screen, and doctor report.
 */
export function summariesToSleepRecords(
  summaries: DailySleepSummary[],
): SleepRecord[] {
  return summaries.map((s, i) => ({
    id: `sleep-summary-${s.date}-${i}`,
    date: s.date,
    bedtime: s.bedtime,
    wakeTime: s.wakeTime,
    totalMinutes: s.totalMinutes,
    deepMinutes: s.deepMinutes,
    remMinutes: s.remMinutes,
    lightMinutes: s.lightMinutes,
    coreMinutes: s.coreMinutes,
    awakeMinutes: s.awakeMinutes,
    efficiency: s.efficiency,
    source: s.source,
  }));
}

/**
 * Get the active sleep count for display on the dashboard.
 * Returns the number of daily summaries stored (max SLEEP_ACTIVE_LIMIT).
 */
export async function getActiveSleepCount(): Promise<number> {
  try {
    const summaries = await loadSleepSummaries();
    return summaries.size;
  } catch {
    return 0;
  }
}

/**
 * Returns a lightweight stats snapshot for the Storage Optimization screen.
 * - detailCount: number of daily summaries in the active window (max 30)
 * - summaryCount: number of 3-day rollups stored
 * - lastConsolidatedAt: ISO timestamp of the most recently created rollup, or null
 */
export async function getSleepSummaryStats(): Promise<{
  detailCount: number;
  summaryCount: number;
  lastConsolidatedAt: string | null;
}> {
  try {
    const [summaries, rollups] = await Promise.all([
      loadSleepSummaries(),
      loadSleepRollups(),
    ]);
    const lastRollup = rollups.length > 0
      ? rollups.reduce((latest, r) =>
          r.endDate > latest.endDate ? r : latest
        )
      : null;
    return {
      detailCount: summaries.size,
      summaryCount: rollups.length,
      lastConsolidatedAt: lastRollup ? lastRollup.endDate : null,
    };
  } catch {
    return { detailCount: 0, summaryCount: 0, lastConsolidatedAt: null };
  }
}
