/**
 * hr-aggregation.ts
 *
 * Aggregates raw PulseRecord samples into 4-hour time buckets.
 * This is a pure utility layer — it does NOT modify the fetch pipeline.
 *
 * Buckets per day:
 *   Block 0: 00:00 – 03:59  (12 AM – 4 AM)
 *   Block 1: 04:00 – 07:59  (4 AM  – 8 AM)
 *   Block 2: 08:00 – 11:59  (8 AM  – 12 PM)
 *   Block 3: 12:00 – 15:59  (12 PM – 4 PM)
 *   Block 4: 16:00 – 19:59  (4 PM  – 8 PM)
 *   Block 5: 20:00 – 23:59  (8 PM  – 12 AM)
 *
 * Usage:
 *   import { aggregateHrTo4HourBuckets, aggregatedToPulseRecords } from '@/lib/health/hr-aggregation';
 *   const buckets = aggregateHrTo4HourBuckets(rawPulseRecords);
 *   const chartPoints = aggregatedToPulseRecords(buckets); // PulseRecord-compatible, max 6/day
 */

import type { PulseRecord } from './types';
import type { HrWindowSize } from './hr-window-pref';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HrBucket {
  /** ISO string of block start (e.g. "2025-03-01T08:00:00.000Z") */
  blockStart: string;
  /** ISO string of block end (exclusive) */
  blockEnd: string;
  /** Average BPM across all samples in this block (rounded) */
  avgBpm: number;
  /** Minimum BPM in this block */
  minBpm: number;
  /** Maximum BPM in this block */
  maxBpm: number;
  /** Number of raw samples in this block */
  sampleCount: number;
  /** Average HRV (ms) if any samples had HRV data */
  avgHrv?: number;
  /** Synthetic PulseRecord id for chart compatibility */
  id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** 4-hour block size in milliseconds */
const BLOCK_MS = 4 * 60 * 60 * 1000;

/** Number of 4-hour blocks per day */
const BLOCKS_PER_DAY = 6;
/** Window size -> block duration in milliseconds */
const WINDOW_MS: Record<string, number> = {
  '1h':    1 * 60 * 60 * 1000,
  '4h':    4 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
};

// ─── In-memory cache ──────────────────────────────────────────────────────────

/**
 * Cache keyed by "YYYY-MM-DD" → HrBucket[].
 * Invalidated when the input array reference changes (checked via size comparison).
 */
const _cache = new Map<string, HrBucket[]>();
let _lastInputSize = -1;

function _invalidateCacheIfNeeded(records: PulseRecord[]): void {
  if (records.length !== _lastInputSize) {
    _cache.clear();
    _lastInputSize = records.length;
  }
}

// ─── Core aggregation ─────────────────────────────────────────────────────────

/**
 * Returns the UTC block-start timestamp (ms) for a given timestamp.
 * Blocks are aligned to UTC midnight in 4-hour increments.
 */
function getBlockStartMs(tsMs: number): number {
  const dayStartMs = tsMs - (tsMs % (24 * 60 * 60 * 1000));
  const offsetInDay = tsMs - dayStartMs;
  const blockIndex = Math.floor(offsetInDay / BLOCK_MS);
  return dayStartMs + blockIndex * BLOCK_MS;
}

/**
 * Aggregates raw PulseRecord[] into HrBucket[].
 * - Empty buckets are omitted (no fake averages).
 * - Results are sorted by blockStart ascending.
 * - Uses in-memory cache keyed by day.
 */
export function aggregateHrTo4HourBuckets(records: PulseRecord[], window: HrWindowSize = '4h'): HrBucket[] {
  const blockMs = WINDOW_MS[window] ?? BLOCK_MS;
  if (!records || records.length === 0) return [];

  _invalidateCacheIfNeeded(records);

  // Group records by day first for cache efficiency
  const byDay = new Map<string, PulseRecord[]>();
  for (const r of records) {
    const day = r.timestamp.slice(0, 10); // "YYYY-MM-DD"
    const arr = byDay.get(day);
    if (arr) arr.push(r);
    else byDay.set(day, [r]);
  }

  const result: HrBucket[] = [];

  for (const [day, dayRecords] of byDay.entries()) {
    // Return cached result for this day if available
    const cached = _cache.get(day);
    if (cached) {
      result.push(...cached);
      continue;
    }

    // Build 4-hour buckets for this day
    const bucketMap = new Map<number, PulseRecord[]>();

    for (const r of dayRecords) {
      const tsMs = new Date(r.timestamp).getTime();
      if (isNaN(tsMs)) continue;
      const blockStartMs = getBlockStartMs(tsMs);
      const arr = bucketMap.get(blockStartMs);
      if (arr) arr.push(r);
      else bucketMap.set(blockStartMs, [r]);
    }

    const dayBuckets: HrBucket[] = [];

    for (const [blockStartMs, samples] of bucketMap.entries()) {
      if (samples.length === 0) continue;

      const bpms = samples.map((s) => s.bpm).filter((b) => b > 0 && b < 300);
      if (bpms.length === 0) continue;

      const avgBpm = Math.round(bpms.reduce((s, v) => s + v, 0) / bpms.length);
      const minBpm = Math.min(...bpms);
      const maxBpm = Math.max(...bpms);

      const hrvValues = samples.map((s) => s.hrv).filter((h): h is number => h != null && h > 0);
      const avgHrv = hrvValues.length
        ? Math.round(hrvValues.reduce((s, v) => s + v, 0) / hrvValues.length)
        : undefined;

      const blockStart = new Date(blockStartMs).toISOString();
      const blockEnd = new Date(blockStartMs + blockMs).toISOString();

      dayBuckets.push({
        id: `hr-bucket-${blockStartMs}`,
        blockStart,
        blockEnd,
        avgBpm,
        minBpm,
        maxBpm,
        sampleCount: samples.length,
        avgHrv,
      });
    }

    // Sort ascending within day
    dayBuckets.sort((a, b) => a.blockStart.localeCompare(b.blockStart));

    _cache.set(day, dayBuckets);
    result.push(...dayBuckets);
  }

  // Final sort across all days
  result.sort((a, b) => a.blockStart.localeCompare(b.blockStart));
  return result;
}

/**
 * Converts HrBucket[] back into PulseRecord[] for chart/report compatibility.
 * Each bucket becomes one PulseRecord with:
 *   - timestamp = blockStart
 *   - bpm = avgBpm
 *   - hrv = avgHrv (if present)
 *   - source = 'aggregated-4h'
 */
export function aggregatedToPulseRecords(buckets: HrBucket[]): PulseRecord[] {
  return buckets.map((b) => ({
    id: b.id,
    timestamp: b.blockStart,
    bpm: b.avgBpm,
    hrv: b.avgHrv,
    source: 'aggregated-4h',
  }));
}

/**
 * Returns the latest real-time HR value from raw records.
 * Preserves the "latest reading" display on the dashboard card.
 */
export function getLatestHrRecord(records: PulseRecord[]): PulseRecord | null {
  if (!records || records.length === 0) return null;
  return records.reduce((latest, r) =>
    r.timestamp > latest.timestamp ? r : latest
  );
}

/**
 * Returns aggregated PulseRecord[] for a specific date range.
 * Filters buckets whose blockStart falls within [startIso, endIso].
 */
export function getAggregatedHrInRange(
  buckets: HrBucket[],
  startIso: string,
  endIso: string
): PulseRecord[] {
  const filtered = buckets.filter(
    (b) => b.blockStart >= startIso && b.blockStart <= endIso
  );
  return aggregatedToPulseRecords(filtered);
}

/**
 * Returns the daily average BPM for each day in the bucket array.
 * Used by the correlation engine (one value per day).
 */
export function getDailyHrAverages(buckets: HrBucket[]): Map<string, number> {
  const byDay = new Map<string, number[]>();
  for (const b of buckets) {
    const day = b.blockStart.slice(0, 10);
    const arr = byDay.get(day);
    if (arr) arr.push(b.avgBpm);
    else byDay.set(day, [b.avgBpm]);
  }
  const result = new Map<string, number>();
  for (const [day, bpms] of byDay.entries()) {
    result.set(day, Math.round(bpms.reduce((s, v) => s + v, 0) / bpms.length));
  }
  return result;
}

/**
 * Clears the aggregation cache.
 * Call this when health data is reset or cleared by the user.
 */
export function clearHrAggregationCache(): void {
  _cache.clear();
  _lastInputSize = -1;
}

/**
 * Returns a human-readable label for a block start ISO string.
 * e.g. "8 AM – 12 PM"
 */
export function formatBlockLabel(blockStartIso: string): string {
  const d = new Date(blockStartIso);
  const h = d.getUTCHours();
  const labels: Record<number, string> = {
    0: '12 AM – 4 AM',
    4: '4 AM – 8 AM',
    8: '8 AM – 12 PM',
    12: '12 PM – 4 PM',
    16: '4 PM – 8 PM',
    20: '8 PM – 12 AM',
  };
  return labels[h] ?? `${h}:00`;
}

/** Number of 4-hour blocks per day (exported for tests) */
export { BLOCKS_PER_DAY };
