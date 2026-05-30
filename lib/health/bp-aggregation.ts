/**
 * bp-aggregation.ts
 *
 * Blood Pressure daily aggregation rules:
 *
 *   1. Cap at 4 readings per calendar day (chronological order, keep first 4).
 *   2. If a day has ≥ 3 readings:
 *        - Keep readings 1 and 2 as individual records.
 *        - Average readings 3 … N (up to reading 4 after the cap) into a single
 *          record whose timestamp is that of reading 3, and whose source is tagged
 *          as "averaged".
 *   3. If a day has 1 or 2 readings: pass through unchanged.
 *
 * This matches clinical BP measurement guidelines (AHA / ESC) where the first
 * two readings establish a baseline and subsequent readings are averaged to
 * reduce white-coat variability.
 */

import type { BloodPressureRecord } from './types';

/** Maximum readings fetched / stored per calendar day. */
export const BP_MAX_PER_DAY = 4;

/**
 * Returns the YYYY-MM-DD date key for a record, in LOCAL time.
 * Using local time matches how users think about "today's readings".
 */
function dayKey(timestamp: string): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Round a float to one decimal place (standard clinical precision for mmHg).
 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Average a set of BP records into a single record.
 *
 * - `timestamp` is taken from the first record in the set (reading 3).
 * - `id` is derived from the first record's id suffixed with `-avg`.
 * - `source` is set to `"averaged"`.
 * - Null systolic / diastolic values are excluded from the average; if ALL
 *   values for a component are null the averaged record also carries null.
 */
function averageRecords(records: BloodPressureRecord[]): BloodPressureRecord {
  const systolicValues = records
    .map((r) => r.systolic)
    .filter((v): v is number => v !== null && v !== undefined);
  const diastolicValues = records
    .map((r) => r.diastolic)
    .filter((v): v is number => v !== null && v !== undefined);

  return {
    id: `${records[0].id}-avg`,
    timestamp: records[0].timestamp,
    systolic:
      systolicValues.length > 0
        ? round1(systolicValues.reduce((a, b) => a + b, 0) / systolicValues.length)
        : null,
    diastolic:
      diastolicValues.length > 0
        ? round1(diastolicValues.reduce((a, b) => a + b, 0) / diastolicValues.length)
        : null,
    source: 'averaged',
  };
}

/**
 * Apply the per-day cap and 3rd-reading averaging rule to an array of
 * `BloodPressureRecord` objects.
 *
 * Input records may be in any order; they are sorted chronologically before
 * processing and the output preserves chronological order.
 *
 * @param records  Raw BP records (any order, any date range).
 * @returns        Aggregated records with at most `BP_MAX_PER_DAY` inputs per
 *                 day and readings 3+ averaged into a single record.
 */
export function aggregateBPByDay(
  records: BloodPressureRecord[],
): BloodPressureRecord[] {
  if (records.length === 0) return [];

  // 1. Sort chronologically (oldest first).
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // 2. Group by calendar day.
  const byDay = new Map<string, BloodPressureRecord[]>();
  for (const record of sorted) {
    const key = dayKey(record.timestamp);
    const existing = byDay.get(key);
    if (existing) {
      existing.push(record);
    } else {
      byDay.set(key, [record]);
    }
  }

  // 3. Apply cap + averaging per day, then flatten.
  const result: BloodPressureRecord[] = [];

  for (const [, dayRecords] of byDay) {
    // Already sorted chronologically because we sorted the full array first.

    // Cap: keep at most BP_MAX_PER_DAY readings.
    const capped = dayRecords.slice(0, BP_MAX_PER_DAY);

    if (capped.length <= 2) {
      // 1 or 2 readings — pass through unchanged.
      result.push(...capped);
    } else {
      // ≥ 3 readings: keep readings 1 and 2, average readings 3+.
      result.push(capped[0]);
      result.push(capped[1]);
      const toAverage = capped.slice(2); // readings 3 and 4 (after cap)
      result.push(averageRecords(toAverage));
    }
  }

  return result;
}

/**
 * Convenience wrapper: apply `aggregateBPByDay` after merging a new batch of
 * records into an existing array.  Deduplicates by `id` before aggregating.
 *
 * @param existing  Currently stored BP records.
 * @param incoming  Newly fetched BP records.
 * @returns         Merged, deduplicated, and aggregated records.
 */
export function mergeAndAggregateBP(
  existing: BloodPressureRecord[],
  incoming: BloodPressureRecord[],
): BloodPressureRecord[] {
  // Deduplicate by id (prefer incoming version).
  const byId = new Map<string, BloodPressureRecord>();
  for (const r of existing) byId.set(r.id, r);
  for (const r of incoming) byId.set(r.id, r);
  return aggregateBPByDay(Array.from(byId.values()));
}
