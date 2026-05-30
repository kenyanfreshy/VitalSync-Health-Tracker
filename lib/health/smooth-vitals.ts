/**
 * smooth-vitals.ts
 *
 * Smoothing utilities for vital-sign data on the NeoVital dashboard cards
 * and the full NeoVital tab screen.
 *
 * ── Smoothing strength ────────────────────────────────────────────────────────
 * Four strength levels control how aggressively readings are averaged:
 *
 *   raw      — no smoothing; raw readings passed through unchanged
 *   light    — narrow buckets / small windows; preserves short-term variation
 *   standard — default; clinically reassuring without hiding genuine trends
 *   heavy    — wide buckets / large windows; maximises trend clarity
 *
 * Bucket sizes by range and strength (smoothVitalSeries):
 *
 *   range │ raw   │ light  │ standard │ heavy
 *   ──────┼───────┼────────┼──────────┼──────────
 *   24h   │ 1 min │ 30 min │ 1 h      │ 2 h
 *   7d    │ 1 min │ 3 h    │ 6 h      │ 12 h
 *   30d   │ 1 min │ 12 h   │ 1 day    │ 2 days
 *   90d   │ 1 min │ 1 day  │ 3 days   │ 7 days
 *
 * Moving-average window sizes by range and strength (smoothSparkline):
 *
 *   range │ raw │ light │ standard │ heavy
 *   ──────┼─────┼───────┼──────────┼──────
 *   24h   │  1  │   2   │    3     │   5
 *   7d    │  1  │   2   │    3     │   5
 *   30d   │  1  │   3   │    5     │   7
 *   90d   │  1  │   5   │    7     │  11
 *
 * ── SpO2 alert detection ──────────────────────────────────────────────────────
 * smoothVitalSeries inspects every raw SpO2 reading BEFORE it is averaged into
 * its bucket. If any reading falls below SPO2_ALERT_THRESHOLD (94%) the bucket
 * is flagged with `spo2Alert: true` so the chart can render a dedicated overlay
 * without the alert being silently averaged away.
 *
 * ── Exports ───────────────────────────────────────────────────────────────────
 *   smoothVitalSeries(points, range, strength?)  — timestamped raw series
 *   smoothSparkline(values, range, strength?)     — pre-aggregated number array
 *   SPO2_ALERT_THRESHOLD                          — 94 (%)
 *   DEFAULT_STRENGTH                              — 'standard'
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export type RangeKey = '24h' | '7d' | '30d' | '90d';

/**
 * Smoothing strength level.
 * - `raw`      — pass-through, no averaging
 * - `light`    — narrow buckets / small windows
 * - `standard` — default, clinically reassuring
 * - `heavy`    — wide buckets / large windows
 */
export type SmoothingStrength = 'raw' | 'light' | 'standard' | 'heavy';

/** Default smoothing strength used when no preference is specified. */
export const DEFAULT_STRENGTH: SmoothingStrength = 'standard';

/**
 * SpO2 alert threshold in display-percent (i.e. 94 means 94%).
 * Any raw reading below this value flags its bucket as `spo2Alert: true`.
 */
export const SPO2_ALERT_THRESHOLD = 94;

/** A single point in a smoothed vital-sign series. */
export interface SmoothedPoint {
  /** ISO timestamp of the bucket midpoint (or original timestamp for raw strength). */
  timestamp: string;
  hr?: number;
  bp_sys?: number;
  bp_dia?: number;
  spo2?: number;
  glucose?: number;
  weight?: number;
  /**
   * True when at least one raw SpO2 reading in this bucket was below
   * SPO2_ALERT_THRESHOLD (94%). The averaged `spo2` value may be ≥94 even
   * when this flag is set, because averaging can mask a transient dip.
   */
  spo2Alert?: boolean;
}

/** Raw input point shape (matches the SeriesPoint used in NeoVital cards). */
export interface RawPoint {
  timestamp: string;
  hr?: number;
  bp_sys?: number;
  bp_dia?: number;
  spo2?: number;
}

// ─── Bucket size tables ───────────────────────────────────────────────────────

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Bucket size in milliseconds: BUCKET_MS[range][strength] */
const BUCKET_MS: Record<RangeKey, Record<SmoothingStrength, number>> = {
  '24h': { raw: MIN,      light: 30 * MIN, standard: HOUR,      heavy: 2 * HOUR  },
  '7d':  { raw: MIN,      light: 3 * HOUR, standard: 6 * HOUR,  heavy: 12 * HOUR },
  '30d': { raw: MIN,      light: 12 * HOUR, standard: DAY,       heavy: 2 * DAY   },
  '90d': { raw: MIN,      light: DAY,       standard: 3 * DAY,   heavy: 7 * DAY   },
};

/** Moving-average half-window: SPARKLINE_WINDOW[range][strength] */
const SPARKLINE_WINDOW: Record<RangeKey, Record<SmoothingStrength, number>> = {
  '24h': { raw: 1, light: 2, standard: 3, heavy: 5  },
  '7d':  { raw: 1, light: 2, standard: 3, heavy: 5  },
  '30d': { raw: 1, light: 3, standard: 5, heavy: 7  },
  '90d': { raw: 1, light: 5, standard: 7, heavy: 11 },
};

type VitalKey = 'hr' | 'bp_sys' | 'bp_dia' | 'spo2';
const VITAL_KEYS: VitalKey[] = ['hr', 'bp_sys', 'bp_dia', 'spo2'];

// ─── smoothVitalSeries ────────────────────────────────────────────────────────

/**
 * Smooth a raw vital-sign series by averaging values within time buckets.
 *
 * SpO2 readings below SPO2_ALERT_THRESHOLD (94%) are flagged on the output
 * bucket via `spo2Alert: true` BEFORE averaging, so the chart can render an
 * alert overlay even when the bucket average is ≥94%.
 *
 * @param points    Raw series, sorted ascending by timestamp.
 * @param range     Active time range key.
 * @param strength  Smoothing strength level. Defaults to 'standard'.
 * @returns         Averaged series, sorted ascending by bucket midpoint.
 */
export function smoothVitalSeries(
  points: RawPoint[],
  range: RangeKey,
  strength: SmoothingStrength = DEFAULT_STRENGTH,
): SmoothedPoint[] {
  if (points.length === 0) return [];

  const bucketMs = BUCKET_MS[range][strength];

  // For raw strength with 1-minute buckets, most readings land in their own
  // bucket — effectively a pass-through that still normalises timestamps to
  // bucket midpoints and applies the SpO2 alert check.

  type BucketEntry = {
    sums: Partial<Record<VitalKey, number>>;
    counts: Partial<Record<VitalKey, number>>;
    spo2Alert: boolean;
  };

  const acc = new Map<number, BucketEntry>();

  for (const p of points) {
    const t = new Date(p.timestamp).getTime();
    const bucketIdx = Math.floor(t / bucketMs);

    if (!acc.has(bucketIdx)) {
      acc.set(bucketIdx, { sums: {}, counts: {}, spo2Alert: false });
    }
    const entry = acc.get(bucketIdx)!;

    for (const key of VITAL_KEYS) {
      const v = p[key];
      if (v != null && isFinite(v)) {
        entry.sums[key] = (entry.sums[key] ?? 0) + v;
        entry.counts[key] = (entry.counts[key] ?? 0) + 1;

        // Pre-average SpO2 alert: flag if any raw reading is below threshold
        if (key === 'spo2' && v < SPO2_ALERT_THRESHOLD) {
          entry.spo2Alert = true;
        }
      }
    }
  }

  const result: SmoothedPoint[] = [];
  const sortedBuckets = Array.from(acc.keys()).sort((a, b) => a - b);

  for (const bucketIdx of sortedBuckets) {
    const entry = acc.get(bucketIdx)!;
    const midpointMs = (bucketIdx + 0.5) * bucketMs;
    const point: SmoothedPoint = {
      timestamp: new Date(midpointMs).toISOString(),
    };
    for (const key of VITAL_KEYS) {
      const count = entry.counts[key];
      const sum = entry.sums[key];
      if (count != null && count > 0 && sum != null) {
        point[key] = Math.round(sum / count);
      }
    }
    if (entry.spo2Alert) {
      point.spo2Alert = true;
    }
    result.push(point);
  }

  return result;
}

// ─── smoothSparkline ──────────────────────────────────────────────────────────

/**
 * Smooth a pre-aggregated sparkline (array of numbers) using a centred
 * moving average. Suitable for `buildSparklineData` output where each
 * element already represents a daily average.
 *
 * @param values    Pre-aggregated numeric series (oldest first).
 * @param range     Active time range key.
 * @param strength  Smoothing strength level. Defaults to 'standard'.
 * @returns         Smoothed series of the same length, values rounded to integers.
 */
export function smoothSparkline(
  values: number[],
  range: RangeKey,
  strength: SmoothingStrength = DEFAULT_STRENGTH,
): number[] {
  if (values.length < 2) return values;

  const half = Math.floor(SPARKLINE_WINDOW[range][strength] / 2);
  if (half === 0) return values; // raw strength — pass through unchanged

  return values.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j];
    return Math.round(sum / (hi - lo + 1));
  });
}
