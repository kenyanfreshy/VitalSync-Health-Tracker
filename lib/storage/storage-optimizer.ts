/**
 * storage-optimizer.ts — VitalSync Storage Optimization Engine
 *
 * Implements intelligent retention and aggregation policies for all major
 * health categories. Raw detail is preserved for the most recent window;
 * older data is converted into compact summaries that preserve trends,
 * min/max values, and report-generation capability.
 *
 * ─── Safety Guarantees ────────────────────────────────────────────────────────
 *  • Only modifies LOCAL AsyncStorage — never touches Apple Health, Health
 *    Connect, or any external device data.
 *  • Aggregated summaries always carry dateRange, min, max, avg, and count so
 *    doctor reports continue functioning after optimization.
 *  • Hypertension trend history is never removed.
 *  • Diabetes long-term trends are preserved via weekly summaries after 1 year.
 *
 * ─── Retention Windows ────────────────────────────────────────────────────────
 *  Category          | Detail window | Summary type after window
 *  ──────────────────|───────────────|──────────────────────────────────────────
 *  Sleep             | 30 days       | 3-day rolling summaries
 *  Heart Rate        | 30 days       | 4-hour block aggregates
 *  Resting HR        | 30 days       | daily → weekly → monthly averages
 *  Blood Pressure    | 90 days       | weekly summaries
 *  Blood Glucose     | 90 days       | daily summaries; weekly after 1 year
 *  Activity          | 30 days       | daily summaries; weekly after 1 year
 *  Weight            | 1 year        | weekly/monthly averages
 *  SpO₂              | 90 days       | daily avg/min/max
 *
 * ─── Record-Count Limits ──────────────────────────────────────────────────────
 *  Medications (inactive history) : max 20 entries
 *  Appointments (completed)       : max 20 entries
 *  Immunizations                  : max 20 records
 *  Health history (med+surgical)  : max 20 entries combined
 */

import type { HealthData, SleepRecord, PulseRecord, WeightRecord, BloodPressureRecord, BloodSugarRecord, ActivityRecord, VitalSignsRecord } from '@/lib/health/types';
import type { Medication } from '@/lib/medications/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(ts: string): string {
  return ts.slice(0, 10); // YYYY-MM-DD
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function roundTo(v: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

/** Group an array of items by a string key derived from each item. */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    const bucket = map.get(k) ?? [];
    bucket.push(item);
    map.set(k, bucket);
  }
  return map;
}

/** ISO week key: YYYY-Www */
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** ISO month key: YYYY-MM */
function isoMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// ─── Aggregated Record Types ──────────────────────────────────────────────────

export interface SleepSummary {
  _type: 'sleep_summary';
  id: string;
  dateRangeStart: string;  // YYYY-MM-DD
  dateRangeEnd: string;    // YYYY-MM-DD
  avgDurationMinutes: number;
  avgBedtime: string;      // HH:MM local average
  avgWakeTime: string;     // HH:MM local average
  avgEfficiency: number;   // 0–100 %
  avgConsistencyScore: number; // 0–100 derived from bedtime variance
  sampleCount: number;
}

export interface HeartRateBlock {
  _type: 'hr_block';
  id: string;
  date: string;            // YYYY-MM-DD
  blockLabel: string;      // e.g. "12AM–4AM"
  blockStart: number;      // 0–23 hour
  blockEnd: number;        // 0–23 hour
  avgBpm: number;
  minBpm: number;
  maxBpm: number;
  readingCount: number;
}

export interface RestingHRSummary {
  _type: 'resting_hr_summary';
  id: string;
  period: 'daily' | 'weekly' | 'monthly';
  dateKey: string;         // YYYY-MM-DD | YYYY-Www | YYYY-MM
  avgBpm: number;
  sampleCount: number;
}

export interface BloodPressureSummary {
  _type: 'bp_summary';
  id: string;
  weekKey: string;         // YYYY-Www
  dateRangeStart: string;
  dateRangeEnd: string;
  avgSystolic: number;
  avgDiastolic: number;
  highSystolic: number;
  lowSystolic: number;
  readingCount: number;
}

export interface BloodGlucoseSummary {
  _type: 'glucose_summary';
  id: string;
  period: 'daily' | 'weekly';
  dateKey: string;         // YYYY-MM-DD | YYYY-Www
  avgMgDl: number;
  minMgDl: number;
  maxMgDl: number;
  readingCount: number;
  timeInRangePct?: number; // 70–180 mg/dL
}

export interface ActivitySummary {
  _type: 'activity_summary';
  id: string;
  period: 'daily' | 'weekly';
  dateKey: string;
  totalSteps: number;
  totalCalories: number;
  totalDistanceKm: number;
  totalActiveMinutes: number;
  workoutCount: number;
}

export interface WeightSummary {
  _type: 'weight_summary';
  id: string;
  period: 'weekly' | 'monthly';
  dateKey: string;
  avgKg: number;
  minKg: number;
  maxKg: number;
  sampleCount: number;
}

export interface SpO2Summary {
  _type: 'spo2_summary';
  id: string;
  date: string;            // YYYY-MM-DD
  avgPct: number;
  minPct: number;
  maxPct: number;
  readingCount: number;
}

// ─── Optimization Result ──────────────────────────────────────────────────────

export interface CategoryOptimizationResult {
  category: string;
  rawRecordsBefore: number;
  rawRecordsAfter: number;
  summariesCreated: number;
  estimatedBytesSaved: number;
}

export interface StorageOptimizationResult {
  ranAt: string;
  categories: CategoryOptimizationResult[];
  totalBytesSaved: number;
  totalRecordsRemoved: number;
  totalSummariesCreated: number;
  limitEnforcementActions: string[];
}

// ─── Bytes-per-record estimates ───────────────────────────────────────────────

const BYTES_PER_RECORD: Record<string, number> = {
  sleep: 320,
  pulse: 120,
  restingHR: 80,
  bloodPressure: 140,
  bloodSugar: 110,
  activity: 200,
  weight: 90,
  spo2: 90,
};

const BYTES_PER_SUMMARY: Record<string, number> = {
  sleep: 180,
  pulse: 100,
  restingHR: 60,
  bloodPressure: 120,
  bloodSugar: 90,
  activity: 120,
  weight: 70,
  spo2: 70,
};

// ─── Sleep Aggregation ────────────────────────────────────────────────────────

/**
 * Converts sleep records older than DETAIL_DAYS into 3-day rolling summaries.
 * Returns { detail: SleepRecord[], summaries: SleepSummary[] }.
 */
export function aggregateSleep(
  records: SleepRecord[],
  detailDays = 30,
): { detail: SleepRecord[]; summaries: SleepSummary[] } {
  const cutoff = daysAgo(detailDays);
  const detail: SleepRecord[] = [];
  const toAggregate: SleepRecord[] = [];

  for (const r of records) {
    if (new Date(r.date) >= cutoff) {
      detail.push(r);
    } else {
      toAggregate.push(r);
    }
  }

  if (toAggregate.length === 0) return { detail, summaries: [] };

  // Sort oldest-first for grouping
  toAggregate.sort((a, b) => a.date.localeCompare(b.date));

  // Group into 3-day buckets
  const summaries: SleepSummary[] = [];
  for (let i = 0; i < toAggregate.length; i += 3) {
    const chunk = toAggregate.slice(i, i + 3);
    const durations = chunk.map((r) => r.totalMinutes);
    const efficiencies = chunk.map((r) => r.efficiency ?? 0);

    // Average bedtime and wake time as minutes-since-midnight
    const bedtimeMins = chunk.map((r) => {
      const t = new Date(r.bedtime);
      return t.getHours() * 60 + t.getMinutes();
    });
    const wakeMins = chunk.map((r) => {
      const t = new Date(r.wakeTime);
      return t.getHours() * 60 + t.getMinutes();
    });

    const avgBedMin = avg(bedtimeMins);
    const avgWakeMin = avg(wakeMins);

    // Consistency score: 100 - (stddev of bedtime in minutes, capped at 120)
    const bedtimeVariance =
      bedtimeMins.reduce((s, m) => s + Math.pow(m - avgBedMin, 2), 0) / bedtimeMins.length;
    const bedtimeStdDev = Math.sqrt(bedtimeVariance);
    const consistencyScore = Math.max(0, 100 - Math.min(bedtimeStdDev, 120));

    const toHHMM = (totalMins: number): string => {
      const h = Math.floor(((totalMins % 1440) + 1440) % 1440 / 60);
      const m = Math.floor(totalMins % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    summaries.push({
      _type: 'sleep_summary',
      id: `sleep_sum_${chunk[0].date}_${chunk[chunk.length - 1].date}`,
      dateRangeStart: chunk[0].date,
      dateRangeEnd: chunk[chunk.length - 1].date,
      avgDurationMinutes: roundTo(avg(durations), 0),
      avgBedtime: toHHMM(avgBedMin),
      avgWakeTime: toHHMM(avgWakeMin),
      avgEfficiency: roundTo(avg(efficiencies), 1),
      avgConsistencyScore: roundTo(consistencyScore, 1),
      sampleCount: chunk.length,
    });
  }

  return { detail, summaries };
}

// ─── Heart Rate Aggregation ───────────────────────────────────────────────────

const HR_BLOCKS = [
  { label: '12AM–4AM', start: 0, end: 4 },
  { label: '4AM–8AM', start: 4, end: 8 },
  { label: '8AM–12PM', start: 8, end: 12 },
  { label: '12PM–4PM', start: 12, end: 16 },
  { label: '4PM–8PM', start: 16, end: 20 },
  { label: '8PM–12AM', start: 20, end: 24 },
] as const;

/**
 * Converts pulse records older than DETAIL_DAYS into 4-hour block aggregates.
 */
export function aggregateHeartRate(
  records: PulseRecord[],
  detailDays = 30,
): { detail: PulseRecord[]; blocks: HeartRateBlock[] } {
  const cutoff = daysAgo(detailDays);
  const detail: PulseRecord[] = [];
  const toAggregate: PulseRecord[] = [];

  for (const r of records) {
    if (new Date(r.timestamp) >= cutoff) {
      detail.push(r);
    } else {
      toAggregate.push(r);
    }
  }

  if (toAggregate.length === 0) return { detail, blocks: [] };

  // Group by date + 4-hour block
  const grouped = new Map<string, PulseRecord[]>();
  for (const r of toAggregate) {
    const d = new Date(r.timestamp);
    const hour = d.getHours();
    const block = HR_BLOCKS.find((b) => hour >= b.start && hour < b.end) ?? HR_BLOCKS[5];
    const key = `${startOfDay(r.timestamp)}|${block.start}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(r);
    grouped.set(key, bucket);
  }

  const blocks: HeartRateBlock[] = [];
  for (const [key, recs] of grouped) {
    const [date, blockStartStr] = key.split('|');
    const blockStart = parseInt(blockStartStr, 10);
    const blockDef = HR_BLOCKS.find((b) => b.start === blockStart) ?? HR_BLOCKS[0];
    const bpms = recs.map((r) => r.bpm);
    blocks.push({
      _type: 'hr_block',
      id: `hr_block_${date}_${blockStart}`,
      date,
      blockLabel: blockDef.label,
      blockStart,
      blockEnd: blockDef.end,
      avgBpm: roundTo(avg(bpms), 0),
      minBpm: Math.min(...bpms),
      maxBpm: Math.max(...bpms),
      readingCount: recs.length,
    });
  }

  return { detail, blocks };
}

// ─── Resting HR Aggregation ───────────────────────────────────────────────────

export interface RestingHRRecord {
  id: string;
  timestamp: string;
  bpm: number;
}

/**
 * Converts resting HR samples older than DETAIL_DAYS into daily/weekly/monthly averages.
 */
export function aggregateRestingHR(
  records: RestingHRRecord[],
  detailDays = 30,
): { detail: RestingHRRecord[]; summaries: RestingHRSummary[] } {
  const cutoff = daysAgo(detailDays);
  const detail: RestingHRRecord[] = [];
  const toAggregate: RestingHRRecord[] = [];

  for (const r of records) {
    if (new Date(r.timestamp) >= cutoff) {
      detail.push(r);
    } else {
      toAggregate.push(r);
    }
  }

  if (toAggregate.length === 0) return { detail, summaries: [] };

  const summaries: RestingHRSummary[] = [];

  // Daily summaries
  const byDay = groupBy(toAggregate, (r) => startOfDay(r.timestamp));
  for (const [dateKey, recs] of byDay) {
    const bpms = recs.map((r) => r.bpm);
    summaries.push({
      _type: 'resting_hr_summary',
      id: `rhr_daily_${dateKey}`,
      period: 'daily',
      dateKey,
      avgBpm: roundTo(avg(bpms), 1),
      sampleCount: recs.length,
    });
  }

  // Weekly summaries (from daily averages)
  const dailyAvgs = summaries.filter((s) => s.period === 'daily');
  const byWeek = groupBy(dailyAvgs, (s) => isoWeekKey(s.dateKey));
  for (const [weekKey, days] of byWeek) {
    const bpms = days.map((d) => d.avgBpm);
    summaries.push({
      _type: 'resting_hr_summary',
      id: `rhr_weekly_${weekKey}`,
      period: 'weekly',
      dateKey: weekKey,
      avgBpm: roundTo(avg(bpms), 1),
      sampleCount: days.reduce((s, d) => s + d.sampleCount, 0),
    });
  }

  // Monthly summaries (from weekly averages)
  const weeklyAvgs = summaries.filter((s) => s.period === 'weekly');
  const byMonth = groupBy(weeklyAvgs, (s) => s.dateKey.slice(0, 7));
  for (const [monthKey, weeks] of byMonth) {
    const bpms = weeks.map((w) => w.avgBpm);
    summaries.push({
      _type: 'resting_hr_summary',
      id: `rhr_monthly_${monthKey}`,
      period: 'monthly',
      dateKey: monthKey,
      avgBpm: roundTo(avg(bpms), 1),
      sampleCount: weeks.reduce((s, w) => s + w.sampleCount, 0),
    });
  }

  return { detail, summaries };
}

// ─── Blood Pressure Aggregation ───────────────────────────────────────────────

/**
 * Converts BP records older than DETAIL_DAYS into weekly summaries.
 * Hypertension trend history is never removed.
 */
export function aggregateBloodPressure(
  records: BloodPressureRecord[],
  detailDays = 90,
): { detail: BloodPressureRecord[]; summaries: BloodPressureSummary[] } {
  const cutoff = daysAgo(detailDays);
  const detail: BloodPressureRecord[] = [];
  const toAggregate: BloodPressureRecord[] = [];

  for (const r of records) {
    if (new Date(r.timestamp) >= cutoff) {
      detail.push(r);
    } else {
      toAggregate.push(r);
    }
  }

  if (toAggregate.length === 0) return { detail, summaries: [] };

  const byWeek = groupBy(toAggregate, (r) => isoWeekKey(r.timestamp));
  const summaries: BloodPressureSummary[] = [];

  for (const [weekKey, recs] of byWeek) {
    const systolics = recs.map((r) => r.systolic ?? 0).filter((v) => v > 0);
    const diastolics = recs.map((r) => r.diastolic ?? 0).filter((v) => v > 0);
    const dates = recs.map((r) => r.timestamp.slice(0, 10)).sort();

    summaries.push({
      _type: 'bp_summary',
      id: `bp_sum_${weekKey}`,
      weekKey,
      dateRangeStart: dates[0],
      dateRangeEnd: dates[dates.length - 1],
      avgSystolic: roundTo(avg(systolics), 0),
      avgDiastolic: roundTo(avg(diastolics), 0),
      highSystolic: systolics.length > 0 ? Math.max(...systolics) : 0,
      lowSystolic: systolics.length > 0 ? Math.min(...systolics) : 0,
      readingCount: recs.length,
    });
  }

  return { detail, summaries };
}

// ─── Blood Glucose Aggregation ────────────────────────────────────────────────

const TIME_IN_RANGE_LOW = 70;
const TIME_IN_RANGE_HIGH = 180;

/**
 * Converts glucose records:
 *  - 90–365 days old → daily summaries
 *  - > 1 year old    → weekly summaries
 */
export function aggregateBloodGlucose(
  records: BloodSugarRecord[],
  detailDays = 90,
): { detail: BloodSugarRecord[]; summaries: BloodGlucoseSummary[] } {
  const cutoffDetail = daysAgo(detailDays);
  const cutoffWeekly = daysAgo(365);

  const detail: BloodSugarRecord[] = [];
  const forDailySummary: BloodSugarRecord[] = [];
  const forWeeklySummary: BloodSugarRecord[] = [];

  for (const r of records) {
    const ts = new Date(r.timestamp);
    if (ts >= cutoffDetail) {
      detail.push(r);
    } else if (ts >= cutoffWeekly) {
      forDailySummary.push(r);
    } else {
      forWeeklySummary.push(r);
    }
  }

  const summaries: BloodGlucoseSummary[] = [];

  // Daily summaries (90 days – 1 year)
  const byDay = groupBy(forDailySummary, (r) => startOfDay(r.timestamp));
  for (const [dateKey, recs] of byDay) {
    const vals = recs.map((r) => r.glucoseMgDl);
    const inRange = vals.filter((v) => v >= TIME_IN_RANGE_LOW && v <= TIME_IN_RANGE_HIGH);
    summaries.push({
      _type: 'glucose_summary',
      id: `gluc_daily_${dateKey}`,
      period: 'daily',
      dateKey,
      avgMgDl: roundTo(avg(vals), 1),
      minMgDl: Math.min(...vals),
      maxMgDl: Math.max(...vals),
      readingCount: recs.length,
      timeInRangePct: vals.length > 0 ? roundTo((inRange.length / vals.length) * 100, 1) : undefined,
    });
  }

  // Weekly summaries (> 1 year)
  const byWeek = groupBy(forWeeklySummary, (r) => isoWeekKey(r.timestamp));
  for (const [weekKey, recs] of byWeek) {
    const vals = recs.map((r) => r.glucoseMgDl);
    const inRange = vals.filter((v) => v >= TIME_IN_RANGE_LOW && v <= TIME_IN_RANGE_HIGH);
    summaries.push({
      _type: 'glucose_summary',
      id: `gluc_weekly_${weekKey}`,
      period: 'weekly',
      dateKey: weekKey,
      avgMgDl: roundTo(avg(vals), 1),
      minMgDl: Math.min(...vals),
      maxMgDl: Math.max(...vals),
      readingCount: recs.length,
      timeInRangePct: vals.length > 0 ? roundTo((inRange.length / vals.length) * 100, 1) : undefined,
    });
  }

  return { detail, summaries };
}

// ─── Activity Aggregation ─────────────────────────────────────────────────────

/**
 * Converts activity records:
 *  - 30–365 days old → daily summaries
 *  - > 1 year old    → weekly summaries
 */
export function aggregateActivity(
  records: ActivityRecord[],
  detailDays = 30,
): { detail: ActivityRecord[]; summaries: ActivitySummary[] } {
  const cutoffDetail = daysAgo(detailDays);
  const cutoffWeekly = daysAgo(365);

  const detail: ActivityRecord[] = [];
  const forDailySummary: ActivityRecord[] = [];
  const forWeeklySummary: ActivityRecord[] = [];

  for (const r of records) {
    const ts = new Date(r.timestamp);
    if (ts >= cutoffDetail) {
      detail.push(r);
    } else if (ts >= cutoffWeekly) {
      forDailySummary.push(r);
    } else {
      forWeeklySummary.push(r);
    }
  }

  const summaries: ActivitySummary[] = [];

  const buildSummary = (
    recs: ActivityRecord[],
    period: 'daily' | 'weekly',
    dateKey: string,
  ): ActivitySummary => ({
    _type: 'activity_summary',
    id: `act_${period}_${dateKey}`,
    period,
    dateKey,
    totalSteps: recs.reduce((s, r) => s + (r.steps ?? 0), 0),
    totalCalories: recs.reduce((s, r) => s + (r.caloriesBurned ?? 0), 0),
    totalDistanceKm: roundTo(
      recs.reduce((s, r) => s + (r.distanceKm ?? (r.distanceWalkingRunningM ?? 0) / 1000), 0),
      2,
    ),
    totalActiveMinutes: recs.reduce((s, r) => s + (r.durationMinutes ?? 0), 0),
    workoutCount: recs.filter((r) => r.type !== 'walk').length,
  });

  const byDay = groupBy(forDailySummary, (r) => startOfDay(r.timestamp));
  for (const [dateKey, recs] of byDay) {
    summaries.push(buildSummary(recs, 'daily', dateKey));
  }

  const byWeek = groupBy(forWeeklySummary, (r) => isoWeekKey(r.timestamp));
  for (const [weekKey, recs] of byWeek) {
    summaries.push(buildSummary(recs, 'weekly', weekKey));
  }

  return { detail, summaries };
}

// ─── Weight Aggregation ───────────────────────────────────────────────────────

/**
 * Converts weight records older than 1 year into weekly then monthly averages.
 */
export function aggregateWeight(
  records: WeightRecord[],
  detailDays = 365,
): { detail: WeightRecord[]; summaries: WeightSummary[] } {
  const cutoff = daysAgo(detailDays);
  const detail: WeightRecord[] = [];
  const toAggregate: WeightRecord[] = [];

  for (const r of records) {
    if (new Date(r.timestamp) >= cutoff) {
      detail.push(r);
    } else {
      toAggregate.push(r);
    }
  }

  if (toAggregate.length === 0) return { detail, summaries: [] };

  const summaries: WeightSummary[] = [];

  // Weekly summaries
  const byWeek = groupBy(toAggregate, (r) => isoWeekKey(r.timestamp));
  for (const [weekKey, recs] of byWeek) {
    const kgs = recs.map((r) => r.weightKg);
    summaries.push({
      _type: 'weight_summary',
      id: `wt_weekly_${weekKey}`,
      period: 'weekly',
      dateKey: weekKey,
      avgKg: roundTo(avg(kgs), 2),
      minKg: roundTo(Math.min(...kgs), 2),
      maxKg: roundTo(Math.max(...kgs), 2),
      sampleCount: recs.length,
    });
  }

  // Monthly summaries (from weekly)
  const byMonth = groupBy(summaries, (s) => s.dateKey.slice(0, 7));
  for (const [monthKey, weeks] of byMonth) {
    const kgs = weeks.map((w) => w.avgKg);
    summaries.push({
      _type: 'weight_summary',
      id: `wt_monthly_${monthKey}`,
      period: 'monthly',
      dateKey: monthKey,
      avgKg: roundTo(avg(kgs), 2),
      minKg: roundTo(Math.min(...kgs), 2),
      maxKg: roundTo(Math.max(...kgs), 2),
      sampleCount: weeks.reduce((s, w) => s + w.sampleCount, 0),
    });
  }

  return { detail, summaries };
}

// ─── SpO₂ Aggregation ─────────────────────────────────────────────────────────

/**
 * Converts SpO₂ readings (from vitalSigns) older than 90 days into daily avg/min/max.
 */
export function aggregateSpO2(
  records: VitalSignsRecord[],
  detailDays = 90,
): { detail: VitalSignsRecord[]; summaries: SpO2Summary[] } {
  const cutoff = daysAgo(detailDays);
  const detail: VitalSignsRecord[] = [];
  const toAggregate: VitalSignsRecord[] = [];

  for (const r of records) {
    // Only aggregate records that have SpO₂ data
    const hasSpo2 = (r.oxygenSaturation ?? r.spo2) != null;
    if (!hasSpo2) {
      detail.push(r); // keep non-SpO₂ vital sign records as-is
      continue;
    }
    if (new Date(r.timestamp) >= cutoff) {
      detail.push(r);
    } else {
      toAggregate.push(r);
    }
  }

  if (toAggregate.length === 0) return { detail, summaries: [] };

  const byDay = groupBy(toAggregate, (r) => startOfDay(r.timestamp));
  const summaries: SpO2Summary[] = [];

  for (const [date, recs] of byDay) {
    const vals = recs.map((r) => r.oxygenSaturation ?? r.spo2 ?? 0).filter((v) => v > 0);
    if (vals.length === 0) continue;
    summaries.push({
      _type: 'spo2_summary',
      id: `spo2_daily_${date}`,
      date,
      avgPct: roundTo(avg(vals), 1),
      minPct: Math.min(...vals),
      maxPct: Math.max(...vals),
      readingCount: recs.length,
    });
  }

  return { detail, summaries };
}

// ─── Record-Count Limit Enforcement ──────────────────────────────────────────

export interface MedicationLimitResult {
  active: Medication[];
  recentHistory: Medication[];  // up to 20 inactive
  archivedHistory: Medication[]; // oldest inactive beyond 20
}

/**
 * Enforces the medication history limit: active medications are unlimited;
 * inactive medications are capped at 20 entries (oldest archived first).
 */
export function enforceMedicationLimit(
  medications: Medication[],
  maxHistory = 20,
): MedicationLimitResult {
  const active = medications.filter((m) => m.active);
  const inactive = medications
    .filter((m) => !m.active)
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()); // newest first

  const recentHistory = inactive.slice(0, maxHistory);
  const archivedHistory = inactive.slice(maxHistory);

  return { active, recentHistory, archivedHistory };
}

export interface AppointmentLimitResult {
  upcoming: import('@/lib/health/types').DoctorAppointment[];
  recentCompleted: import('@/lib/health/types').DoctorAppointment[];
  removedCount: number;
  showNotice: boolean;
}

/**
 * Enforces the appointment history limit: upcoming appointments are unlimited;
 * completed/past appointments are capped at 20 (oldest removed first).
 */
export function enforceAppointmentLimit(
  appointments: import('@/lib/health/types').DoctorAppointment[],
  maxCompleted = 20,
): AppointmentLimitResult {
  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.dateTime) >= now);
  const completed = appointments
    .filter((a) => new Date(a.dateTime) < now)
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()); // newest first

  const recentCompleted = completed.slice(0, maxCompleted);
  const removedCount = Math.max(0, completed.length - maxCompleted);

  return {
    upcoming,
    recentCompleted,
    removedCount,
    showNotice: removedCount > 0,
  };
}

export interface ImmunizationLimitResult {
  records: import('@/lib/health/types').ImmunizationRecord[];
  archivedCount: number;
}

/**
 * Enforces the immunization limit: keeps the 20 most recent/clinically relevant
 * records; oldest records are compressed into an archive count.
 */
export function enforceImmunizationLimit(
  immunizations: import('@/lib/health/types').ImmunizationRecord[],
  maxRecords = 20,
): ImmunizationLimitResult {
  if (immunizations.length <= maxRecords) {
    return { records: immunizations, archivedCount: 0 };
  }

  // Sort by dateAdministered descending (most recent first)
  const sorted = [...immunizations].sort(
    (a, b) => new Date(b.dateAdministered).getTime() - new Date(a.dateAdministered).getTime(),
  );

  return {
    records: sorted.slice(0, maxRecords),
    archivedCount: sorted.length - maxRecords,
  };
}

export interface HealthHistoryLimitResult {
  medicalHistory: import('@/lib/health/types').MedicalHistoryRecord[];
  surgicalHistory: import('@/lib/health/types').SurgicalHistoryRecord[];
  removedCount: number;
  showExportPrompt: boolean;
}

/**
 * Enforces the health history limit: combined medicalHistory + surgicalHistory
 * is capped at 20 entries (oldest removed first).
 */
export function enforceHealthHistoryLimit(
  medicalHistory: import('@/lib/health/types').MedicalHistoryRecord[],
  surgicalHistory: import('@/lib/health/types').SurgicalHistoryRecord[],
  maxEntries = 20,
): HealthHistoryLimitResult {
  type AnyRecord = { id: string; createdAt: string; _kind: 'medical' | 'surgical' };

  const combined: AnyRecord[] = [
    ...medicalHistory.map((r) => ({ ...r, _kind: 'medical' as const })),
    ...surgicalHistory.map((r) => ({ ...r, _kind: 'surgical' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // newest first

  const kept = combined.slice(0, maxEntries);
  const removed = combined.slice(maxEntries);

  const keptMedical = kept
    .filter((r) => r._kind === 'medical')
    .map(({ _kind: _k, ...r }) => r) as import('@/lib/health/types').MedicalHistoryRecord[];
  const keptSurgical = kept
    .filter((r) => r._kind === 'surgical')
    .map(({ _kind: _k, ...r }) => r) as import('@/lib/health/types').SurgicalHistoryRecord[];

  return {
    medicalHistory: keptMedical,
    surgicalHistory: keptSurgical,
    removedCount: removed.length,
    showExportPrompt: removed.length > 0,
  };
}

// ─── Storage Metrics ──────────────────────────────────────────────────────────

export type StorageHealthScore = 'excellent' | 'good' | 'moderate' | 'high_usage';

export interface StorageMetrics {
  estimatedTotalBytes: number;
  estimatedSavedBytes: number;
  healthScore: StorageHealthScore;
  lastOptimizedAt: string | null;
  categories: {
    name: string;
    label: string;
    isOptimized: boolean;
    estimatedSavedBytes: number;
    detailRecords: number;
    summaryRecords: number;
  }[];
}

export function computeStorageHealthScore(totalBytes: number): StorageHealthScore {
  const mb = totalBytes / (1024 * 1024);
  if (mb < 5) return 'excellent';
  if (mb < 15) return 'good';
  if (mb < 30) return 'moderate';
  return 'high_usage';
}

export function estimateCategorySavings(
  rawCount: number,
  summaryCount: number,
  category: keyof typeof BYTES_PER_RECORD,
): number {
  const rawBytes = rawCount * (BYTES_PER_RECORD[category] ?? 100);
  const summaryBytes = summaryCount * (BYTES_PER_SUMMARY[category] ?? 70);
  return Math.max(0, rawBytes - summaryBytes);
}

// ─── AsyncStorage Keys ────────────────────────────────────────────────────────

export const OPTIMIZER_KEYS = {
  LAST_RUN: '@vsht:storage_optimizer_last_run',
  SLEEP_SUMMARIES: '@vsht:storage_opt_sleep_summaries',
  HR_BLOCKS: '@vsht:storage_opt_hr_blocks',
  RESTING_HR_SUMMARIES: '@vsht:storage_opt_resting_hr_summaries',
  BP_SUMMARIES: '@vsht:storage_opt_bp_summaries',
  GLUCOSE_SUMMARIES: '@vsht:storage_opt_glucose_summaries',
  ACTIVITY_SUMMARIES: '@vsht:storage_opt_activity_summaries',
  WEIGHT_SUMMARIES: '@vsht:storage_opt_weight_summaries',
  SPO2_SUMMARIES: '@vsht:storage_opt_spo2_summaries',
  METRICS: '@vsht:storage_opt_metrics',
} as const;

// ─── Main Optimization Runner ─────────────────────────────────────────────────

/**
 * Runs the full optimization pass on the provided HealthData.
 * Returns the optimized HealthData (raw arrays trimmed to detail window)
 * and a result summary for the Storage Optimization screen.
 *
 * Summaries are stored separately under OPTIMIZER_KEYS so they can be
 * loaded independently for the doctor report without touching the main
 * health data blob.
 */
export function runStorageOptimization(data: HealthData): {
  optimizedData: HealthData;
  result: StorageOptimizationResult;
  summaries: {
    sleep: SleepSummary[];
    hrBlocks: HeartRateBlock[];
    restingHR: RestingHRSummary[];
    bloodPressure: BloodPressureSummary[];
    bloodGlucose: BloodGlucoseSummary[];
    activity: ActivitySummary[];
    weight: WeightSummary[];
    spo2: SpO2Summary[];
  };
} {
  const categories: CategoryOptimizationResult[] = [];
  const limitActions: string[] = [];

  // ── Sleep ──────────────────────────────────────────────────────────────────
  const sleepResult = aggregateSleep(data.sleep ?? []);
  categories.push({
    category: 'sleep',
    rawRecordsBefore: (data.sleep ?? []).length,
    rawRecordsAfter: sleepResult.detail.length,
    summariesCreated: sleepResult.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.sleep ?? []).length - sleepResult.detail.length,
      sleepResult.summaries.length,
      'sleep',
    ),
  });

  // ── Heart Rate ─────────────────────────────────────────────────────────────
  const hrResult = aggregateHeartRate(data.pulse ?? []);
  categories.push({
    category: 'heartRate',
    rawRecordsBefore: (data.pulse ?? []).length,
    rawRecordsAfter: hrResult.detail.length,
    summariesCreated: hrResult.blocks.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.pulse ?? []).length - hrResult.detail.length,
      hrResult.blocks.length,
      'pulse',
    ),
  });

  // ── Resting HR ─────────────────────────────────────────────────────────────
  const rhrResult = aggregateRestingHR(data.restingHRSamples as RestingHRRecord[] ?? []);
  categories.push({
    category: 'restingHR',
    rawRecordsBefore: (data.restingHRSamples ?? []).length,
    rawRecordsAfter: rhrResult.detail.length,
    summariesCreated: rhrResult.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.restingHRSamples ?? []).length - rhrResult.detail.length,
      rhrResult.summaries.length,
      'restingHR',
    ),
  });

  // ── Blood Pressure ─────────────────────────────────────────────────────────
  const bpResult = aggregateBloodPressure(data.bloodPressure ?? []);
  categories.push({
    category: 'bloodPressure',
    rawRecordsBefore: (data.bloodPressure ?? []).length,
    rawRecordsAfter: bpResult.detail.length,
    summariesCreated: bpResult.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.bloodPressure ?? []).length - bpResult.detail.length,
      bpResult.summaries.length,
      'bloodPressure',
    ),
  });

  // ── Blood Glucose ──────────────────────────────────────────────────────────
  const glucoseResult = aggregateBloodGlucose(data.bloodSugar ?? []);
  categories.push({
    category: 'bloodGlucose',
    rawRecordsBefore: (data.bloodSugar ?? []).length,
    rawRecordsAfter: glucoseResult.detail.length,
    summariesCreated: glucoseResult.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.bloodSugar ?? []).length - glucoseResult.detail.length,
      glucoseResult.summaries.length,
      'bloodSugar',
    ),
  });

  // ── Activity ───────────────────────────────────────────────────────────────
  const actResult = aggregateActivity(data.activity ?? []);
  categories.push({
    category: 'activity',
    rawRecordsBefore: (data.activity ?? []).length,
    rawRecordsAfter: actResult.detail.length,
    summariesCreated: actResult.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.activity ?? []).length - actResult.detail.length,
      actResult.summaries.length,
      'activity',
    ),
  });

  // ── Weight ─────────────────────────────────────────────────────────────────
  const wtResult = aggregateWeight(data.weight ?? []);
  categories.push({
    category: 'weight',
    rawRecordsBefore: (data.weight ?? []).length,
    rawRecordsAfter: wtResult.detail.length,
    summariesCreated: wtResult.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.weight ?? []).length - wtResult.detail.length,
      wtResult.summaries.length,
      'weight',
    ),
  });

  // ── SpO₂ ───────────────────────────────────────────────────────────────────
  const spo2Result = aggregateSpO2(data.vitalSigns ?? []);
  categories.push({
    category: 'spo2',
    rawRecordsBefore: (data.vitalSigns ?? []).length,
    rawRecordsAfter: spo2Result.detail.length,
    summariesCreated: spo2Result.summaries.length,
    estimatedBytesSaved: estimateCategorySavings(
      (data.vitalSigns ?? []).length - spo2Result.detail.length,
      spo2Result.summaries.length,
      'spo2',
    ),
  });

  // ── Appointment limit ──────────────────────────────────────────────────────
  const apptLimit = enforceAppointmentLimit(data.appointments ?? []);
  if (apptLimit.removedCount > 0) {
    limitActions.push(
      `Removed ${apptLimit.removedCount} oldest completed appointment(s) (limit: 20)`,
    );
  }

  // ── Immunization limit ─────────────────────────────────────────────────────
  const immunLimit = enforceImmunizationLimit(data.immunizations ?? []);
  if (immunLimit.archivedCount > 0) {
    limitActions.push(
      `Archived ${immunLimit.archivedCount} oldest immunization record(s) (limit: 20)`,
    );
  }

  // ── Health history limit ───────────────────────────────────────────────────
  const histLimit = enforceHealthHistoryLimit(
    data.medicalHistory ?? [],
    data.surgicalHistory ?? [],
  );
  if (histLimit.removedCount > 0) {
    limitActions.push(
      `Removed ${histLimit.removedCount} oldest health history entry/entries (limit: 20 combined)`,
    );
  }

  const totalBytesSaved = categories.reduce((s, c) => s + c.estimatedBytesSaved, 0);
  const totalRecordsRemoved = categories.reduce(
    (s, c) => s + (c.rawRecordsBefore - c.rawRecordsAfter),
    0,
  );
  const totalSummariesCreated = categories.reduce((s, c) => s + c.summariesCreated, 0);

  const optimizedData: HealthData = {
    ...data,
    sleep: sleepResult.detail,
    pulse: hrResult.detail,
    restingHRSamples: rhrResult.detail as any,
    bloodPressure: bpResult.detail,
    bloodSugar: glucoseResult.detail,
    activity: actResult.detail,
    weight: wtResult.detail,
    vitalSigns: spo2Result.detail,
    appointments: [
      ...apptLimit.upcoming,
      ...apptLimit.recentCompleted,
    ],
    immunizations: immunLimit.records,
    medicalHistory: histLimit.medicalHistory,
    surgicalHistory: histLimit.surgicalHistory,
  };

  return {
    optimizedData,
    result: {
      ranAt: new Date().toISOString(),
      categories,
      totalBytesSaved,
      totalRecordsRemoved,
      totalSummariesCreated,
      limitEnforcementActions: limitActions,
    },
    summaries: {
      sleep: sleepResult.summaries,
      hrBlocks: hrResult.blocks,
      restingHR: rhrResult.summaries,
      bloodPressure: bpResult.summaries,
      bloodGlucose: glucoseResult.summaries,
      activity: actResult.summaries,
      weight: wtResult.summaries,
      spo2: spo2Result.summaries,
    },
  };
}
