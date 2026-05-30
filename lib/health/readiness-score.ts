/**
 * Daily Readiness Score computation.
 *
 * Combines sleep quality, heart rate, SpO2, and blood pressure into a 0–100 score.
 * Based on a simplified version of Whoop/Oura readiness algorithms.
 *
 * Scoring weights:
 *   Sleep duration (25 pts)  — 7–9 hrs = full, <5 or >10 = 0
 *   Sleep efficiency (20 pts) — ≥85% = full, <60% = 0
 *   Resting HR (20 pts)      — 50–70 bpm = full, >100 or <40 = 0
 *   HRV (15 pts)             — ≥50 ms = full, <20 ms = 0
 *   SpO2 (10 pts)            — ≥97% = full, <90% = 0
 *   BP (10 pts)              — Normal = full, Crisis = 0
 */

import { HealthData, getBPStatus } from './types';
export interface ReadinessComponents {
  sleepDuration: number;   // 0–25
  sleepEfficiency: number; // 0–20
  restingHR: number;       // 0–20
  hrv: number;             // 0–15
  spo2: number;            // 0–10
  bp: number;              // 0–10
  total: number;           // 0–100
  hasData: boolean;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function lerp(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function computeReadinessScore(data: HealthData | null): ReadinessComponents {
  const empty: ReadinessComponents = {
    sleepDuration: 0, sleepEfficiency: 0, restingHR: 0,
    hrv: 0, spo2: 0, bp: 0, total: 0, hasData: false,
  };

  if (!data) return empty;

  let hasAnyData = false;
  let sleepDurationScore = 0;
  let sleepEfficiencyScore = 0;
  let restingHRScore = 0;
  let hrvScore = 0;
  let spo2Score = 0;
  let bpScore = 0;

  // ── Sleep Duration (25 pts) ──────────────────────────────────────────────
  const sleepRecords = data.sleep ?? [];
  const manualSleepRecords = (data.vitalSigns ?? []).filter(
    (r) => r.sleepTotalMinutes !== undefined && r.sleepTotalMinutes > 0
  );
  const latestSleepMinutes = sleepRecords.length
    ? sleepRecords[sleepRecords.length - 1].totalMinutes
    : manualSleepRecords.length
      ? manualSleepRecords[manualSleepRecords.length - 1].sleepTotalMinutes!
      : null;

  if (latestSleepMinutes !== null) {
    hasAnyData = true;
    const hrs = latestSleepMinutes / 60;
    // Peak at 7–9 hrs, taper off outside
    if (hrs >= 7 && hrs <= 9) {
      sleepDurationScore = 25;
    } else if (hrs >= 6 && hrs < 7) {
      sleepDurationScore = Math.round(lerp(hrs, 6, 7, 10, 25));
    } else if (hrs > 9 && hrs <= 10) {
      sleepDurationScore = Math.round(lerp(hrs, 9, 10, 25, 15));
    } else if (hrs > 10) {
      sleepDurationScore = Math.round(lerp(hrs, 10, 12, 15, 5));
    } else if (hrs >= 5 && hrs < 6) {
      sleepDurationScore = Math.round(lerp(hrs, 5, 6, 0, 10));
    } else {
      sleepDurationScore = 0;
    }
  }

  // ── Sleep Efficiency (20 pts) ────────────────────────────────────────────
  const latestSleepEfficiency = sleepRecords.length
    ? sleepRecords[sleepRecords.length - 1].efficiency
    : null;

  if (latestSleepEfficiency !== null && latestSleepEfficiency !== undefined) {
    hasAnyData = true;
    sleepEfficiencyScore = Math.round(clamp(lerp(latestSleepEfficiency, 60, 90, 0, 20), 0, 20));
  }

  // ── Resting HR (20 pts) ──────────────────────────────────────────────────
  const pulseRecords = data.pulse ?? [];
  const manualHRRecords = (data.vitalSigns ?? []).filter((r) => r.heartRate !== undefined);
  const latestBpm = pulseRecords.length
    ? pulseRecords[pulseRecords.length - 1].bpm
    : manualHRRecords.length
      ? manualHRRecords[manualHRRecords.length - 1].heartRate!
      : null;

  if (latestBpm !== null) {
    hasAnyData = true;
    // Optimal: 50–70 bpm
    if (latestBpm >= 50 && latestBpm <= 70) {
      restingHRScore = 20;
    } else if (latestBpm > 70 && latestBpm <= 85) {
      restingHRScore = Math.round(lerp(latestBpm, 70, 85, 20, 10));
    } else if (latestBpm > 85 && latestBpm <= 100) {
      restingHRScore = Math.round(lerp(latestBpm, 85, 100, 10, 0));
    } else if (latestBpm >= 40 && latestBpm < 50) {
      restingHRScore = Math.round(lerp(latestBpm, 40, 50, 5, 20));
    } else {
      restingHRScore = 0;
    }
  }

  // ── HRV (15 pts) ─────────────────────────────────────────────────────────
  const latestHrv = pulseRecords.length
    ? pulseRecords[pulseRecords.length - 1].hrv ?? null
    : null;

  if (latestHrv !== null) {
    hasAnyData = true;
    // ≥50 ms = full, <20 ms = 0
    hrvScore = Math.round(clamp(lerp(latestHrv, 20, 60, 0, 15), 0, 15));
  }

  // ── SpO2 (10 pts) ────────────────────────────────────────────────────────
  const spo2Records = (data.vitalSigns ?? []).filter(
    (r) => (r.spo2 !== undefined && r.spo2 > 0) || (r.oxygenSaturation !== undefined && r.oxygenSaturation > 0)
  );
  const latestSpo2 = spo2Records.length
    ? (spo2Records[spo2Records.length - 1].spo2 ?? spo2Records[spo2Records.length - 1].oxygenSaturation ?? null)
    : null;

  if (latestSpo2 !== null) {
    hasAnyData = true;
    // ≥97% = 10, 90–97% = lerp, <90% = 0
    spo2Score = Math.round(clamp(lerp(latestSpo2, 90, 97, 0, 10), 0, 10));
  }

  // ── BP (10 pts) ──────────────────────────────────────────────────────────
  const bpRecords = data.bloodPressure ?? [];
  const manualBPRecords = (data.vitalSigns ?? []).filter(
    (r) => r.systolic !== undefined && r.diastolic !== undefined
  );
  const latestBP = bpRecords.length
    ? bpRecords[bpRecords.length - 1]
    : manualBPRecords.length
      ? { systolic: manualBPRecords[manualBPRecords.length - 1].systolic!, diastolic: manualBPRecords[manualBPRecords.length - 1].diastolic! }
      : null;

  if (latestBP) {
    hasAnyData = true;
    const bpStatus = getBPStatus(latestBP.systolic ?? 0, latestBP.diastolic ?? 0);
    switch (bpStatus) {
      case 'normal':   bpScore = 10; break;
      case 'elevated': bpScore = 7;  break;
      case 'high1':    bpScore = 4;  break;
      case 'high2':    bpScore = 2;  break;
      case 'crisis':   bpScore = 0;  break;
    }
  }

  const total = sleepDurationScore + sleepEfficiencyScore + restingHRScore + hrvScore + spo2Score + bpScore;

  return {
    sleepDuration: sleepDurationScore,
    sleepEfficiency: sleepEfficiencyScore,
    restingHR: restingHRScore,
    hrv: hrvScore,
    spo2: spo2Score,
    bp: bpScore,
    total: hasAnyData ? total : 0,
    hasData: hasAnyData,
  };
}

/**
 * Build 7-day sparkline data for a given metric from the health data.
 * Returns an array of up to 7 values (one per day, oldest first).
 */
export function buildSparklineData(
  data: HealthData | null,
  metric: 'systolic' | 'diastolic' | 'bpm' | 'spo2' | 'sleepHrs' | 'hrv' | 'restingBpm',
  days: number = 7
): number[] {
  if (!data) return [];

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Build a map of day-index → values
  const byDay = new Map<number, number[]>();

  function addToDay(timestamp: string, value: number) {
    const age = Math.floor((now - new Date(timestamp).getTime()) / dayMs);
    if (age >= 0 && age < days) {
      const dayIdx = days - 1 - age; // 0 = oldest, days-1 = today
      if (!byDay.has(dayIdx)) byDay.set(dayIdx, []);
      byDay.get(dayIdx)!.push(value);
    }
  }

  if (metric === 'systolic') {
    for (const r of data.bloodPressure ?? []) addToDay(r.timestamp, r.systolic ?? 0);
    for (const r of data.vitalSigns ?? []) {
      if (r.systolic !== undefined) addToDay(r.timestamp, r.systolic);
    }
  } else if (metric === 'diastolic') {
    for (const r of data.bloodPressure ?? []) addToDay(r.timestamp, r.diastolic ?? 0);
    for (const r of data.vitalSigns ?? []) {
      if (r.diastolic !== undefined) addToDay(r.timestamp, r.diastolic);
    }
  } else if (metric === 'bpm') {
    for (const r of data.pulse ?? []) addToDay(r.timestamp, r.bpm);
    for (const r of data.vitalSigns ?? []) {
      if (r.heartRate !== undefined) addToDay(r.timestamp, r.heartRate!);
    }
  } else if (metric === 'restingBpm') {
    // Resting HR: one HealthKit sample per day from restingHRSamples
    for (const r of data.restingHRSamples ?? []) {
      if (r.bpm > 0) addToDay(r.timestamp, r.bpm);
    }
  } else if (metric === 'spo2') {
    for (const r of data.vitalSigns ?? []) {
      const val = r.spo2 ?? r.oxygenSaturation;
      if (val !== undefined && val > 0) addToDay(r.timestamp, val);
    }
  } else if (metric === 'hrv') {
    for (const r of data.pulse ?? []) {
      if ((r.hrv ?? 0) > 0) addToDay(r.timestamp, r.hrv as number);
    }
    for (const r of data.vitalSigns ?? []) {
      if ((r.hrv ?? 0) > 0) addToDay(r.timestamp, r.hrv as number);
    }
  } else if (metric === 'sleepHrs') {
    for (const r of data.sleep ?? []) {
      addToDay(r.bedtime, r.totalMinutes / 60);
    }
    for (const r of data.vitalSigns ?? []) {
      if (r.sleepTotalMinutes !== undefined && r.sleepTotalMinutes > 0) {
        addToDay(r.timestamp, r.sleepTotalMinutes / 60);
      }
    }
  }

  // Average each day
  const result: number[] = [];
  for (let i = 0; i < days; i++) {
    const vals = byDay.get(i);
    if (vals && vals.length > 0) {
      result.push(parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)));
    } else if (result.length > 0) {
      // Fill gap with last known value
      result.push(result[result.length - 1]);
    }
    // If no data at all yet, skip (will result in empty sparkline)
  }

  return result;
}

/**
 * Map a BP status to a MetricStatus for the bento tile.
 */
export function bpStatusToMetricStatus(
  status: 'normal' | 'elevated' | 'high1' | 'high2' | 'crisis' | null
): 'optimal' | 'stable' | 'improving' | 'warning' | 'critical' | undefined {
  if (!status) return undefined;
  switch (status) {
    case 'normal':   return 'optimal';
    case 'elevated': return 'stable';
    case 'high1':    return 'warning';
    case 'high2':    return 'critical';
    case 'crisis':   return 'critical';
  }
}

/**
 * Determine SpO2 MetricStatus.
 */
export function spo2ToMetricStatus(
  spo2: number | null
): 'optimal' | 'stable' | 'improving' | 'warning' | 'critical' | undefined {
  if (spo2 === null) return undefined;
  if (spo2 >= 97) return 'optimal';
  if (spo2 >= 95) return 'stable';
  if (spo2 >= 90) return 'warning';
  return 'critical';
}

/**
 * Determine HR MetricStatus.
 */
export function hrToMetricStatus(
  bpm: number | null
): 'optimal' | 'stable' | 'improving' | 'warning' | 'critical' | undefined {
  if (bpm === null) return undefined;
  if (bpm >= 50 && bpm <= 70) return 'optimal';
  if (bpm >= 45 && bpm <= 85) return 'stable';
  if (bpm >= 40 && bpm <= 100) return 'warning';
  return 'critical';
}

/**
 * Determine Sleep MetricStatus based on hours.
 */
export function sleepToMetricStatus(
  hours: number | null
): 'optimal' | 'stable' | 'improving' | 'warning' | 'critical' | undefined {
  if (hours === null) return undefined;
  if (hours >= 7 && hours <= 9) return 'optimal';
  if (hours >= 6 && hours < 7) return 'stable';
  if (hours >= 5 && hours < 6) return 'warning';
  return 'critical';
}
