/**
 * On-Device Insight Engine
 *
 * Pure rule-based engine that derives health insights from local HealthKit/manual data.
 * No network calls. No LLM. All logic runs on-device.
 *
 * Each rule:
 *  - Evaluates a condition against the provided health data snapshot
 *  - Returns an InsightItem with human-readable text, severity, and evidence reference IDs
 *
 * For informational purposes only. Not a medical device.
 */

import type { HealthData } from './types';
import { getEvidenceRefs, type EvidenceReference } from './evidence-references';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightSeverity = 'info' | 'caution' | 'alert';

export interface InsightItem {
  /** Stable rule ID — used for cooldown tracking */
  id: string;
  /** One-sentence plain-language observation */
  text: string;
  /** Severity level */
  severity: InsightSeverity;
  /** Evidence reference IDs from evidence-references.ts */
  evidenceIds: string[];
  /** Resolved evidence references (populated by engine) */
  evidence: EvidenceReference[];
  /** Emoji icon for the insight row */
  icon: string;
  /**
   * Which vital metric this insight is about.
   * Used by the Trends tab to pick the correct 7-day sparkline.
   */
  metric?: 'systolic' | 'bpm' | 'spo2' | 'sleepHrs' | 'hrv' | 'weight' | 'steps' | 'glucose';
}

// ─── Helper utilities ─────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function last<T>(arr: T[], n = 1): T[] {
  return arr.slice(-n);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function dayKey(ts: string | Date): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function isWithinDays(ts: string | Date, days: number): boolean {
  return new Date(ts) >= daysAgo(days);
}

// ─── Rule definitions ─────────────────────────────────────────────────────────

type InsightRule = (data: HealthData) => InsightItem | null;

const rules: InsightRule[] = [

  // ── Blood Pressure: Stage 2 Hypertension ─────────────────────────────────
  (data) => {
    const bpRecs = [...(data.bloodPressure ?? []), ...(data.vitalSigns ?? []).filter((r: any) => r.systolic)]
      .filter((r: any) => isWithinDays(r.timestamp, 7))
      .slice(-5);
    if (bpRecs.length < 2) return null;
    const systolics = bpRecs.map((r: any) => r.systolic ?? 0).filter(Boolean);
    const diastolics = bpRecs.map((r: any) => r.diastolic ?? 0).filter(Boolean);
    const avgSys = Math.round(avg(systolics));
    const avgDia = Math.round(avg(diastolics));
    if (avgSys >= 140 || avgDia >= 90) {
      return {
        id: 'bp_stage2',
        text: `BP trending high · avg ${avgSys}/${avgDia} mmHg over last ${bpRecs.length} readings — Stage 2 range per AHA guidelines`,
        severity: 'alert',
        icon: '🩺',
        metric: 'systolic',
        evidenceIds: ['aha_bp_2017', 'jnc8'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Blood Pressure: Stage 1 Hypertension ─────────────────────────────────
  (data) => {
    const bpRecs = [...(data.bloodPressure ?? []), ...(data.vitalSigns ?? []).filter((r: any) => r.systolic)]
      .filter((r: any) => isWithinDays(r.timestamp, 7))
      .slice(-5);
    if (bpRecs.length < 2) return null;
    const systolics = bpRecs.map((r: any) => r.systolic ?? 0).filter(Boolean);
    const diastolics = bpRecs.map((r: any) => r.diastolic ?? 0).filter(Boolean);
    const avgSys = Math.round(avg(systolics));
    const avgDia = Math.round(avg(diastolics));
    if ((avgSys >= 130 && avgSys < 140) || (avgDia >= 80 && avgDia < 90)) {
      return {
        id: 'bp_stage1',
        text: `BP in Stage 1 range · avg ${avgSys}/${avgDia} mmHg — consistent logging helps track trends`,
        severity: 'caution',
        icon: '🩺',
        metric: 'systolic',
        evidenceIds: ['aha_bp_2017', 'aha_bp_2021'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Blood Pressure: Optimal ───────────────────────────────────────────────
  (data) => {
    const bpRecs = [...(data.bloodPressure ?? []), ...(data.vitalSigns ?? []).filter((r: any) => r.systolic)]
      .filter((r: any) => isWithinDays(r.timestamp, 7))
      .slice(-3);
    if (bpRecs.length < 2) return null;
    const systolics = bpRecs.map((r: any) => r.systolic ?? 0).filter(Boolean);
    const diastolics = bpRecs.map((r: any) => r.diastolic ?? 0).filter(Boolean);
    const avgSys = Math.round(avg(systolics));
    const avgDia = Math.round(avg(diastolics));
    if (avgSys < 120 && avgDia < 80) {
      return {
        id: 'bp_optimal',
        text: `BP in optimal range · avg ${avgSys}/${avgDia} mmHg — within AHA normal targets`,
        severity: 'info',
        icon: '💚',
        metric: 'systolic',
        evidenceIds: ['aha_bp_2017'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Fasting Glucose: Elevated ─────────────────────────────────────────────
  (data) => {
    const recs = (data.bloodSugar ?? [])
      .filter((r: any) => isWithinDays(r.timestamp, 7))
      .filter((r: any) => r.context === 'fasting' || r.context === 'Fasting')
      .slice(-4);
    if (!recs.length) return null;
    const values = recs.map((r: any) => r.mgDl ?? r.value ?? 0).filter(Boolean);
    const avgGlucose = Math.round(avg(values));
    if (avgGlucose >= 126) {
      return {
        id: 'glucose_fasting_high',
        text: `Fasting glucose averaging ${avgGlucose} mg/dL — above ADA diagnostic threshold of 126 mg/dL`,
        severity: 'alert',
        icon: '🩸',
        metric: 'glucose',
        evidenceIds: ['ada_2024', 'glucose_cv_risk'],
        evidence: [],
      };
    }
    if (avgGlucose >= 100) {
      return {
        id: 'glucose_fasting_impaired',
        text: `Fasting glucose averaging ${avgGlucose} mg/dL — in impaired fasting range (100–125 mg/dL) per ADA`,
        severity: 'caution',
        icon: '🩸',
        metric: 'glucose',
        evidenceIds: ['ada_2024'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Post-Meal Glucose: Elevated ───────────────────────────────────────────
  (data) => {
    const recs = (data.bloodSugar ?? [])
      .filter((r: any) => isWithinDays(r.timestamp, 7))
      .filter((r: any) => r.context === 'postMeal' || r.context === 'Post-Meal' || r.context === 'post_meal')
      .slice(-4);
    if (!recs.length) return null;
    const values = recs.map((r: any) => r.mgDl ?? r.value ?? 0).filter(Boolean);
    const avgGlucose = Math.round(avg(values));
    if (avgGlucose >= 180) {
      return {
        id: 'glucose_postmeal_high',
        text: `Post-meal glucose averaging ${avgGlucose} mg/dL — above ADA 2-hour target of 180 mg/dL`,
        severity: 'alert',
        icon: '🩸',
        metric: 'glucose',
        evidenceIds: ['ada_postmeal', 'glucose_cv_risk'],
        evidence: [],
      };
    }
    if (avgGlucose >= 140) {
      return {
        id: 'glucose_postmeal_elevated',
        text: `Post-meal glucose averaging ${avgGlucose} mg/dL — above non-diabetic target of 140 mg/dL`,
        severity: 'caution',
        icon: '🩸',
        metric: 'glucose',
        evidenceIds: ['ada_postmeal'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Sleep: Insufficient ───────────────────────────────────────────────────
  (data) => {
    const sleepRecs = (data.sleep ?? [])
      .filter((r: any) => isWithinDays(r.startTime ?? r.timestamp, 7))
      .slice(-5);
    if (sleepRecs.length < 3) return null;
    const hours = sleepRecs
      .map((r: any) => (r.totalMinutes ?? r.durationMinutes ?? 0) / 60)
      .filter(h => h > 0);
    if (!hours.length) return null;
    const avgHrs = Math.round(avg(hours) * 10) / 10;
    if (avgHrs < 6) {
      return {
        id: 'sleep_insufficient',
        text: `Averaging ${avgHrs} hrs sleep — below 7h AASM recommendation; associated with elevated BP and immune risk`,
        severity: 'alert',
        icon: '🌙',
        metric: 'sleepHrs',
        evidenceIds: ['aasm_sleep', 'sleep_meta_2019', 'sleep_bp'],
        evidence: [],
      };
    }
    if (avgHrs < 7) {
      return {
        id: 'sleep_low',
        text: `Averaging ${avgHrs} hrs sleep — slightly below the 7h AASM recommendation`,
        severity: 'caution',
        icon: '🌙',
        metric: 'sleepHrs',
        evidenceIds: ['aasm_sleep', 'sleep_meta_2019'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Sleep: Good ───────────────────────────────────────────────────────────
  (data) => {
    const sleepRecs = (data.sleep ?? [])
      .filter((r: any) => isWithinDays(r.startTime ?? r.timestamp, 7))
      .slice(-5);
    if (sleepRecs.length < 3) return null;
    const hours = sleepRecs
      .map((r: any) => (r.totalMinutes ?? r.durationMinutes ?? 0) / 60)
      .filter(h => h > 0);
    if (!hours.length) return null;
    const avgHrs = Math.round(avg(hours) * 10) / 10;
    if (avgHrs >= 7 && avgHrs <= 9) {
      return {
        id: 'sleep_good',
        text: `Averaging ${avgHrs} hrs sleep — within the 7–9h AASM recommended range`,
        severity: 'info',
        icon: '💚',
        metric: 'sleepHrs',
        evidenceIds: ['aasm_sleep'],
        evidence: [],
      };
    }
    return null;
  },

  // ── HRV: Low ─────────────────────────────────────────────────────────────
  (data) => {
    const hrvRecs = (data.vitalSigns ?? [])
      .filter((r: any) => (r.hrv ?? 0) > 0 && isWithinDays(r.timestamp, 7))
      .slice(-5);
    if (hrvRecs.length < 2) return null;
    const values = hrvRecs.map((r: any) => r.hrv as number);
    const avgHrv = Math.round(avg(values));
    if (avgHrv < 20) {
      return {
        id: 'hrv_low',
        text: `HRV averaging ${avgHrv} ms — low range; associated with reduced autonomic resilience`,
        severity: 'caution',
        icon: '💙',
        metric: 'hrv',
        evidenceIds: ['hrv_meta_2020'],
        evidence: [],
      };
    }
    if (avgHrv >= 50) {
      return {
        id: 'hrv_excellent',
        text: `HRV averaging ${avgHrv} ms — excellent range; high HRV correlates with autonomic health`,
        severity: 'info',
        icon: '💚',
        metric: 'hrv',
        evidenceIds: ['hrv_meta_2020'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Resting Heart Rate: Elevated ─────────────────────────────────────────
  (data) => {
    const pulseRecs = [
      ...(data.pulse ?? []),
      ...(data.vitalSigns ?? []).filter((r: any) => r.heartRate ?? r.pulse),
    ]
      .filter((r: any) => isWithinDays(r.timestamp, 7))
      .slice(-5);
    if (pulseRecs.length < 2) return null;
    const values = pulseRecs.map((r: any) => r.heartRate ?? r.pulse ?? r.bpm ?? 0).filter(Boolean);
    const avgHr = Math.round(avg(values));
    if (avgHr > 100) {
      return {
        id: 'rhr_elevated',
        text: `Resting HR averaging ${avgHr} bpm — above normal range (60–100 bpm)`,
        severity: 'caution',
        icon: '❤️',
        metric: 'bpm',
        evidenceIds: ['rhr_trend'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Activity: Low Step Count ──────────────────────────────────────────────
  (data) => {
    const activityRecs = (data.activity ?? [])
      .filter((r: any) => isWithinDays(r.timestamp ?? r.date, 7))
      .slice(-7);
    if (activityRecs.length < 3) return null;
    const stepValues = activityRecs.map((r: any) => r.steps ?? 0).filter(s => s > 0);
    if (!stepValues.length) return null;
    const avgSteps = Math.round(avg(stepValues));
    if (avgSteps < 5000) {
      return {
        id: 'activity_low_steps',
        text: `Averaging ${avgSteps.toLocaleString()} steps/day — below the 7,000-step threshold associated with reduced mortality risk`,
        severity: 'caution',
        icon: '🏃',
        metric: 'steps',
        evidenceIds: ['steps_meta', 'who_activity_2023'],
        evidence: [],
      };
    }
    if (avgSteps >= 7000) {
      return {
        id: 'activity_good_steps',
        text: `Averaging ${avgSteps.toLocaleString()} steps/day — meeting the 7,000+ step target associated with improved outcomes`,
        severity: 'info',
        icon: '💚',
        metric: 'steps',
        evidenceIds: ['steps_meta'],
        evidence: [],
      };
    }
    return null;
  },

  // ── SpO2: Low ─────────────────────────────────────────────────────────────
  (data) => {
    const spo2Recs = (data.vitalSigns ?? [])
      .filter((r: any) => (r.oxygenSaturation ?? r.spo2 ?? 0) > 0 && isWithinDays(r.timestamp, 3))
      .slice(-3);
    if (!spo2Recs.length) return null;
    const values = spo2Recs.map((r: any) => r.oxygenSaturation ?? r.spo2 ?? 0).filter(Boolean);
    const avgSpo2 = Math.round(avg(values) * 10) / 10;
    if (avgSpo2 < 95) {
      return {
        id: 'spo2_low',
        text: `SpO₂ averaging ${avgSpo2}% — below the 95% normal threshold per ATS guidelines`,
        severity: 'alert',
        icon: '🫁',
        metric: 'spo2',
        evidenceIds: ['spo2_normal'],
        evidence: [],
      };
    }
    return null;
  },

  // ── Weight: Rapid Change ──────────────────────────────────────────────────
  (data) => {
    const weightRecs = (data.weight ?? [])
      .filter((r: any) => isWithinDays(r.timestamp, 30))
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (weightRecs.length < 3) return null;
    const first = weightRecs[0];
    const lastRec = weightRecs[weightRecs.length - 1];
    const firstKg: number = first.weightKg ?? 0;
    const lastKg: number = lastRec.weightKg ?? 0;
    if (!firstKg || !lastKg) return null;
    const changePct = Math.abs((lastKg - firstKg) / firstKg) * 100;
    if (changePct >= 3) {
      const direction = lastKg > firstKg ? 'increase' : 'decrease';
      return {
        id: 'weight_rapid_change',
        text: `Weight ${direction} of ${changePct.toFixed(1)}% over 30 days — rapid changes may warrant clinical review`,
        severity: 'caution',
        icon: '⚖️',
        metric: 'weight',
        evidenceIds: ['weight_trend'],
        evidence: [],
      };
    }
    return null;
  },
];

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Runs all insight rules against the provided health data snapshot.
 * Returns a list of triggered insights with evidence references resolved.
 *
 * @param data - The current health data snapshot from HealthContext
 * @param maxItems - Maximum number of insights to return (default: 5)
 */
export function runInsightEngine(
  data: HealthData,
  maxItems = 5,
): InsightItem[] {
  const results: InsightItem[] = [];

  for (const rule of rules) {
    if (results.length >= maxItems) break;
    try {
      const item = rule(data);
      if (!item) continue;
      // Resolve evidence references
      item.evidence = getEvidenceRefs(item.evidenceIds);
      // Deduplicate by ID
      if (!results.find(r => r.id === item.id)) {
        results.push(item);
      }
    } catch {
      // Rule errors are non-fatal
    }
  }

  // Sort: alerts first, then cautions, then info
  const order: Record<InsightSeverity, number> = { alert: 0, caution: 1, info: 2 };
  results.sort((a, b) => order[a.severity] - order[b.severity]);

  return results;
}

/** Returns the accent colour for a given severity level */
export function severityColor(severity: InsightSeverity): string {
  switch (severity) {
    case 'alert':   return '#F87171';
    case 'caution': return '#FBBF24';
    case 'info':    return '#10B981';
  }
}
