/**
 * Date Range Utilities
 * Filter health data records by a rolling date window and compute averages.
 *
 * IMPORTANT: All timestamp comparisons MUST use numeric milliseconds (Date.getTime()),
 * NOT lexicographic string comparison. HealthKit returns ISO strings with timezone
 * offsets like "2025-05-03T10:00:00.000+00:00", while new Date().toISOString()
 * produces "2025-05-03T10:00:00.000Z". Lexicographically "...+00:00" < "...Z"
 * because '+' (ASCII 43) < 'Z' (ASCII 90), which would incorrectly filter out
 * ALL HealthKit records. Always parse to ms before comparing.
 */

import type { HealthData } from './types';

export type DateRangeDays = 7 | 30 | 90;

export const DATE_RANGE_OPTIONS = [
  { label: '7d', value: 7 as DateRangeDays },
  { label: '30d', value: 30 as DateRangeDays },
  { label: '90d', value: 90 as DateRangeDays },
];

export const DATE_RANGE_STORAGE_KEY = '@vsht:dateRange';

/** Returns the cutoff timestamp (ms) for a given number of days ago */
export function getCutoffTimestamp(days: DateRangeDays): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/** Parse any ISO timestamp string to milliseconds safely */
function tsMs(ts: string | undefined | null): number {
  if (!ts) return 0;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
}

export interface DashboardAverages {
  // Blood Pressure
  systolicAvg: number | null;
  diastolicAvg: number | null;
  bpReadings: number;

  // Pulse / HRV
  bpmAvg: number | null;
  hrvAvg: number | null;
  pulseReadings: number;

  // SpO2 (oxygen saturation) — from vitalSigns
  spo2Avg: number | null;
  spo2Readings: number;

  // Sleep
  sleepEfficiencyAvg: number | null;
  sleepDurationAvg: number | null; // hours
  sleepReadings: number;

  // Body Composition (kept for detail screen / report; no longer on Dashboard card)
  weightAvg: number | null;
  muscleMassAvg: number | null;
  bodyReadings: number;

  // Body Temperature — stored in °F in VitalSignsRecord, averaged in °F
  tempAvgF: number | null;
  tempReadings: number;
}

/** Compute dashboard averages for the given date range */
export function computeDashboardAverages(
  data: HealthData | null,
  days: DateRangeDays
): DashboardAverages {
  const empty: DashboardAverages = {
    systolicAvg: null, diastolicAvg: null, bpReadings: 0,
    bpmAvg: null, hrvAvg: null, pulseReadings: 0,
    spo2Avg: null, spo2Readings: 0,
    sleepEfficiencyAvg: null, sleepDurationAvg: null, sleepReadings: 0,
    weightAvg: null, muscleMassAvg: null, bodyReadings: 0,
    tempAvgF: null, tempReadings: 0,
  };

  if (!data) return empty;

  // Use numeric ms comparison — avoids the lexicographic "+00:00" vs "Z" bug
  const cutoffMs = getCutoffTimestamp(days);

  // ── Blood Pressure ─────────────────────────────────────────────────────────
  const vitalSignsInRange = (data.vitalSigns ?? []).filter(
    (r) => tsMs(r.timestamp) >= cutoffMs
  );

  const bpFromVitals = vitalSignsInRange
    .filter((r) => r.systolic !== undefined && r.diastolic !== undefined)
    .map((r) => ({ systolic: r.systolic!, diastolic: r.diastolic!, timestamp: r.timestamp }));

  const bpRecords = [
    ...(data.bloodPressure ?? []).filter((r) => tsMs(r.timestamp) >= cutoffMs),
    ...bpFromVitals,
  ];

  const bpWithSystolic = bpRecords.filter((r) => r.systolic != null);
  const bpWithDiastolic = bpRecords.filter((r) => r.diastolic != null);
  const systolicAvg = bpWithSystolic.length
    ? Math.round(bpWithSystolic.reduce((s, r) => s + (r.systolic ?? 0), 0) / bpWithSystolic.length)
    : null;
  const diastolicAvg = bpWithDiastolic.length
    ? Math.round(bpWithDiastolic.reduce((s, r) => s + (r.diastolic ?? 0), 0) / bpWithDiastolic.length)
    : null;

  // ── Pulse / HRV ────────────────────────────────────────────────────────────
  const pulseFromVitals = vitalSignsInRange
    .filter((r) => r.heartRate !== undefined)
    .map((r) => ({ bpm: r.heartRate!, hrv: undefined as number | undefined, timestamp: r.timestamp }));

  const pulseRecords = [
    ...(data.pulse ?? []).filter((r) => tsMs(r.timestamp) >= cutoffMs),
    ...pulseFromVitals,
  ];

  const bpmAvg = pulseRecords.length
    ? Math.round(pulseRecords.reduce((s, r) => s + r.bpm, 0) / pulseRecords.length)
    : null;
  const hrvRecords = pulseRecords.filter((r) => r.hrv !== undefined);
  const hrvAvg = hrvRecords.length
    ? Math.round(hrvRecords.reduce((s, r) => s + (r.hrv ?? 0), 0) / hrvRecords.length)
    : null;

  // ── SpO2 ───────────────────────────────────────────────────────────────────
  const spo2Records = vitalSignsInRange.filter(
    (r) => (r.spo2 !== undefined && r.spo2 > 0) || (r.oxygenSaturation !== undefined && r.oxygenSaturation > 0)
  );
  const spo2Avg = spo2Records.length
    ? Math.round(
        spo2Records.reduce((s, r) => s + (r.spo2 ?? r.oxygenSaturation ?? 0), 0) / spo2Records.length
      )
    : null;

  // ── Body Composition ───────────────────────────────────────────────────────
  const bodyRecords = (data.bodyComposition ?? []).filter((r) => tsMs(r.timestamp) >= cutoffMs);
  const weightAvg = bodyRecords.length
    ? parseFloat((bodyRecords.reduce((s, r) => s + r.weightKg, 0) / bodyRecords.length).toFixed(1))
    : null;
  const muscleMassRecords = bodyRecords.filter((r) => r.muscleMassKg !== undefined);
  const muscleMassAvg = muscleMassRecords.length
    ? parseFloat(
        (muscleMassRecords.reduce((s, r) => s + (r.muscleMassKg ?? 0), 0) / muscleMassRecords.length).toFixed(1)
      )
    : null;

  // ── Sleep ──────────────────────────────────────────────────────────────────
  // SleepRecord uses `bedtime` (ISO) for range filtering
  const sleepRecords = (data.sleep ?? []).filter((r) => tsMs(r.bedtime) >= cutoffMs);

  const sleepFromVitals = vitalSignsInRange
    .filter((r) => r.sleepTotalMinutes !== undefined && r.sleepTotalMinutes > 0)
    .map((r) => ({
      totalMinutes: r.sleepTotalMinutes!,
      efficiency: r.sleepEfficiency ?? null,
    }));

  const allSleepDurations = [
    ...sleepRecords.map((r) => r.totalMinutes),
    ...sleepFromVitals.map((r) => r.totalMinutes),
  ];
  const sleepDurationAvg = allSleepDurations.length
    ? parseFloat(
        (allSleepDurations.reduce((s, v) => s + v, 0) / allSleepDurations.length / 60).toFixed(1)
      )
    : null;

  const allSleepEfficiencies = [
    ...sleepRecords.map((r) => r.efficiency),
    ...sleepFromVitals.filter((r) => r.efficiency !== null).map((r) => r.efficiency as number),
  ];
  const sleepEfficiencyAvg = allSleepEfficiencies.length
    ? Math.round(allSleepEfficiencies.reduce((s, v) => s + v, 0) / allSleepEfficiencies.length)
    : null;

  const sleepReadingsMerged = allSleepDurations.length;

  // ── Body Temperature ──────────────────────────────────────────────────────
  const tempRecords = vitalSignsInRange.filter(
    (r) => r.temperature !== undefined && r.temperature > 0
  );
  const tempAvgF = tempRecords.length
    ? parseFloat(
        (tempRecords.reduce((s, r) => s + (r.temperature ?? 0), 0) / tempRecords.length).toFixed(1)
      )
    : null;

  return {
    systolicAvg, diastolicAvg, bpReadings: bpRecords.length,
    bpmAvg, hrvAvg, pulseReadings: pulseRecords.length,
    spo2Avg, spo2Readings: spo2Records.length,
    sleepEfficiencyAvg, sleepDurationAvg, sleepReadings: sleepReadingsMerged,
    weightAvg, muscleMassAvg, bodyReadings: bodyRecords.length,
    tempAvgF, tempReadings: tempRecords.length,
  };
}
