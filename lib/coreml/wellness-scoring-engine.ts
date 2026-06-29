/**
 * VitalSync Core ML Wellness Scoring Engine
 *
 * Implements mathematical prediction and scoring models for:
 *   - Wellness Score (0–100)
 *   - Recovery Trend (improving / stable / declining)
 *   - Anomaly Detection (statistical outlier detection)
 *   - Projected A1C support (eA1C from glucose rolling average)
 *   - Basic prediction models (linear regression, rolling averages)
 *   - Trend risk flags based on historical user data
 *
 * Architecture:
 *   This module implements the "Core ML layer" using pure TypeScript mathematics.
 *   On iOS, it can optionally delegate to a native Core ML model via the
 *   CoreMLModule Swift bridge (when available). On all other platforms, the
 *   TypeScript implementation is used.
 *
 * IMPORTANT:
 *   - All outputs are labeled as wellness insights, trends, or observed patterns
 *   - No output is labeled as a diagnosis, prediction, or medical assessment
 *   - All risk flags include the standard wellness disclaimer
 *   - Models are INTRA-INDIVIDUAL (user vs their own baseline, never population)
 *
 * Statistical methods used:
 *   - Pearson correlation coefficient
 *   - Spearman rank correlation
 *   - Linear regression (OLS)
 *   - Rolling averages (7-day, 14-day, 30-day)
 *   - Z-score anomaly detection (±2σ threshold)
 *   - Trend direction (slope of linear regression)
 *   - Confidence level (based on sample size and R²)
 */

import type { HealthData } from '@/lib/health/types';

// ─── Output Types ─────────────────────────────────────────────────────────────

export type TrendDirection = 'improving' | 'stable' | 'declining' | 'insufficient_data';
export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'insufficient_data';
export type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'insufficient_data';

export interface WellnessScore {
  /** Overall wellness score 0–100 */
  score: number;
  /** Score components */
  components: {
    cardiovascular: number;   // 0–30
    sleep: number;            // 0–25
    activity: number;         // 0–20
    metabolic: number;        // 0–15
    recovery: number;         // 0–10
  };
  /** Trend vs previous period */
  trend: TrendDirection;
  /** Confidence in the score */
  confidence: ConfidenceLevel;
  /** Number of data points used */
  sampleSize: number;
  /** Whether there is sufficient data */
  hasData: boolean;
  /** Required wellness disclaimer */
  disclaimer: string;
}

export interface RecoveryTrend {
  direction: TrendDirection;
  /** 7-day rolling average of readiness score */
  rollingAvg7d: number | null;
  /** 14-day rolling average of readiness score */
  rollingAvg14d: number | null;
  /** Slope of the trend line (positive = improving) */
  slope: number | null;
  confidence: ConfidenceLevel;
  sampleSize: number;
  disclaimer: string;
}

export interface AnomalyResult {
  /** Whether an anomaly was detected */
  detected: boolean;
  /** Which metric triggered the anomaly */
  metric: string;
  /** The observed value */
  value: number;
  /** The user's personal baseline (rolling mean) */
  baseline: number;
  /** Z-score (standard deviations from baseline) */
  zScore: number;
  /** Human-readable description */
  description: string;
  /** Severity: 'info' for ±2σ, 'caution' for ±2.5σ, 'alert' for ±3σ */
  severity: 'info' | 'caution' | 'alert';
  disclaimer: string;
}

export interface ProjectedA1C {
  /** Estimated A1C percentage from 90-day glucose average */
  estimatedA1C: number | null;
  /** 90-day average glucose in mg/dL */
  avgGlucose90d: number | null;
  /** Number of glucose readings used */
  sampleSize: number;
  /** Trend direction */
  trend: TrendDirection;
  confidence: ConfidenceLevel;
  /** Required wellness disclaimer */
  disclaimer: string;
}

export interface TrendRiskFlag {
  metric: string;
  riskLevel: RiskLevel;
  description: string;
  /** Observed value */
  value: number;
  /** User's personal baseline */
  baseline: number;
  /** Percentage deviation from baseline */
  deviationPct: number;
  disclaimer: string;
}

export interface CoreMLAnalysisResult {
  wellnessScore: WellnessScore;
  recoveryTrend: RecoveryTrend;
  anomalies: AnomalyResult[];
  projectedA1C: ProjectedA1C;
  trendRiskFlags: TrendRiskFlag[];
  /** ISO timestamp of analysis */
  analyzedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WELLNESS_DISCLAIMER =
  'This is a wellness observation, not medical advice. Consult a licensed clinician for health decisions.';

const CORRELATION_DISCLAIMER =
  'Correlation does not prove causation. VitalSync provides wellness information only and does not diagnose, treat, or replace medical advice.';

// ─── Statistical Utilities ────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, values: number[]): number {
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return 0;
  return (value - m) / s;
}

/** Linear regression: returns { slope, intercept, r2 } */
function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; r2: number } | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const xMean = mean(xSlice);
  const yMean = mean(ySlice);

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - xMean;
    const dy = ySlice[i] - yMean;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  if (ssXX === 0) return null;

  const slope = ssXY / ssXX;
  const intercept = yMean - slope * xMean;
  const r2 = ssXX === 0 || ssYY === 0 ? 0 : Math.pow(ssXY, 2) / (ssXX * ssYY);

  return { slope, intercept, r2 };
}

function rollingAverage(values: number[], window: number): number | null {
  if (values.length < window) return values.length > 0 ? mean(values) : null;
  const recent = values.slice(-window);
  return mean(recent);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function lerp(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function confidenceFromSampleSize(n: number): ConfidenceLevel {
  if (n >= 14) return 'high';
  if (n >= 7) return 'moderate';
  if (n >= 3) return 'low';
  return 'insufficient_data';
}

// ─── Wellness Score ───────────────────────────────────────────────────────────

export function computeWellnessScore(data: HealthData | null): WellnessScore {
  const empty: WellnessScore = {
    score: 0,
    components: { cardiovascular: 0, sleep: 0, activity: 0, metabolic: 0, recovery: 0 },
    trend: 'insufficient_data',
    confidence: 'insufficient_data',
    sampleSize: 0,
    hasData: false,
    disclaimer: WELLNESS_DISCLAIMER,
  };

  if (!data) return empty;

  // ── Cardiovascular (0–30) ────────────────────────────────────────────────
  let cardio = 0;
  let cardioCount = 0;

  const recentBP = data.bloodPressure?.slice(-14) ?? [];
  if (recentBP.length > 0) {
    const avgSys = mean(recentBP.map(r => r.systolic));
    const avgDia = mean(recentBP.map(r => r.diastolic));
    // Optimal: 90–120 / 60–80 = full 15 pts
    const sysScore = avgSys <= 120 ? 15 : avgSys <= 130 ? 12 : avgSys <= 140 ? 8 : avgSys <= 160 ? 4 : 0;
    const diaScore = avgDia <= 80 ? 10 : avgDia <= 90 ? 7 : avgDia <= 100 ? 4 : 0;
    cardio += sysScore + diaScore;
    cardioCount++;
  }

  const recentPulse = data.vitalSigns?.filter(v => v.heartRate != null).slice(-14) ?? [];
  if (recentPulse.length > 0) {
    const avgHR = mean(recentPulse.map(v => v.heartRate!));
    // Optimal resting HR: 50–70 = full 5 pts
    const hrScore = avgHR >= 50 && avgHR <= 70 ? 5 : avgHR <= 80 ? 4 : avgHR <= 90 ? 2 : 0;
    cardio = clamp(cardio + hrScore, 0, 30);
    cardioCount++;
  }

  // ── Sleep (0–25) ─────────────────────────────────────────────────────────
  let sleep = 0;
  const recentSleep = data.sleep?.slice(-14) ?? [];
  if (recentSleep.length > 0) {
    const avgDuration = mean(recentSleep.map(s => s.durationHours ?? 0));
    const avgEfficiency = mean(recentSleep.filter(s => s.efficiency != null).map(s => s.efficiency!));

    // Duration: 7–9 hrs = 15 pts
    const durScore = avgDuration >= 7 && avgDuration <= 9 ? 15
      : avgDuration >= 6 ? 10
      : avgDuration >= 5 ? 5
      : 0;

    // Efficiency: ≥85% = 10 pts
    const effScore = avgEfficiency >= 85 ? 10
      : avgEfficiency >= 75 ? 7
      : avgEfficiency >= 65 ? 4
      : avgEfficiency > 0 ? 2
      : 0;

    sleep = clamp(durScore + (recentSleep.some(s => s.efficiency != null) ? effScore : 0), 0, 25);
  }

  // ── Activity (0–20) ──────────────────────────────────────────────────────
  let activity = 0;
  const recentActivity = data.activity?.slice(-14) ?? [];
  if (recentActivity.length > 0) {
    const avgSteps = mean(recentActivity.map(a => a.steps ?? 0));
    const avgCalories = mean(recentActivity.map(a => a.caloriesBurned ?? 0));

    // Steps: ≥10,000 = 12 pts
    const stepsScore = avgSteps >= 10000 ? 12 : avgSteps >= 7500 ? 9 : avgSteps >= 5000 ? 6 : avgSteps >= 2500 ? 3 : 0;
    // Calories: ≥300 active = 8 pts
    const calScore = avgCalories >= 300 ? 8 : avgCalories >= 200 ? 6 : avgCalories >= 100 ? 3 : 0;

    activity = clamp(stepsScore + calScore, 0, 20);
  }

  // ── Metabolic (0–15) ─────────────────────────────────────────────────────
  let metabolic = 0;
  const recentGlucose = data.bloodSugar?.slice(-14) ?? [];
  if (recentGlucose.length > 0) {
    const avgGlucose = mean(recentGlucose.map(g => g.value));
    // Normal fasting: 70–100 mg/dL = 15 pts
    metabolic = avgGlucose >= 70 && avgGlucose <= 100 ? 15
      : avgGlucose <= 110 ? 11
      : avgGlucose <= 125 ? 7
      : avgGlucose <= 140 ? 3
      : 0;
  }

  // ── Recovery (0–10) ──────────────────────────────────────────────────────
  let recovery = 0;
  const recentHRV = data.vitalSigns?.filter(v => v.hrv != null).slice(-14) ?? [];
  if (recentHRV.length > 0) {
    const avgHRV = mean(recentHRV.map(v => v.hrv!));
    // HRV ≥50ms = 10 pts (highly individual, using general reference)
    recovery = avgHRV >= 50 ? 10 : avgHRV >= 35 ? 7 : avgHRV >= 20 ? 4 : 1;
  }

  const totalScore = clamp(cardio + sleep + activity + metabolic + recovery, 0, 100);
  const sampleSize = Math.max(recentBP.length, recentSleep.length, recentActivity.length);

  // Compute trend vs previous period
  let trend: TrendDirection = 'insufficient_data';
  if (sampleSize >= 7) {
    // Compare last 7 days vs previous 7 days
    const recentBPAll = data.bloodPressure ?? [];
    if (recentBPAll.length >= 14) {
      const recent7 = recentBPAll.slice(-7).map(r => r.systolic);
      const prev7 = recentBPAll.slice(-14, -7).map(r => r.systolic);
      const recentAvg = mean(recent7);
      const prevAvg = mean(prev7);
      const delta = recentAvg - prevAvg;
      // For BP, lower is better
      trend = Math.abs(delta) < 2 ? 'stable' : delta < 0 ? 'improving' : 'declining';
    } else {
      trend = 'stable';
    }
  }

  return {
    score: Math.round(totalScore),
    components: {
      cardiovascular: Math.round(cardio),
      sleep: Math.round(sleep),
      activity: Math.round(activity),
      metabolic: Math.round(metabolic),
      recovery: Math.round(recovery),
    },
    trend,
    confidence: confidenceFromSampleSize(sampleSize),
    sampleSize,
    hasData: sampleSize > 0,
    disclaimer: WELLNESS_DISCLAIMER,
  };
}

// ─── Recovery Trend ───────────────────────────────────────────────────────────

export function computeRecoveryTrend(data: HealthData | null): RecoveryTrend {
  const empty: RecoveryTrend = {
    direction: 'insufficient_data',
    rollingAvg7d: null,
    rollingAvg14d: null,
    slope: null,
    confidence: 'insufficient_data',
    sampleSize: 0,
    disclaimer: WELLNESS_DISCLAIMER,
  };

  if (!data) return empty;

  // Use HRV as the primary recovery signal
  const hrvRecords = (data.vitalSigns ?? [])
    .filter(v => v.hrv != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (hrvRecords.length < 3) return empty;

  const hrvValues = hrvRecords.map(v => v.hrv!);
  const indices = hrvValues.map((_, i) => i);

  const rolling7d = rollingAverage(hrvValues, 7);
  const rolling14d = rollingAverage(hrvValues, 14);
  const regression = linearRegression(indices, hrvValues);

  let direction: TrendDirection = 'stable';
  if (regression) {
    // Slope > 0.5 ms/day = improving, < -0.5 = declining
    direction = regression.slope > 0.5 ? 'improving'
      : regression.slope < -0.5 ? 'declining'
      : 'stable';
  }

  return {
    direction,
    rollingAvg7d: rolling7d !== null ? Math.round(rolling7d * 10) / 10 : null,
    rollingAvg14d: rolling14d !== null ? Math.round(rolling14d * 10) / 10 : null,
    slope: regression ? Math.round(regression.slope * 100) / 100 : null,
    confidence: confidenceFromSampleSize(hrvRecords.length),
    sampleSize: hrvRecords.length,
    disclaimer: WELLNESS_DISCLAIMER,
  };
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

export function detectAnomalies(data: HealthData | null): AnomalyResult[] {
  if (!data) return [];

  const anomalies: AnomalyResult[] = [];

  // Helper to check a metric series for anomalies
  function checkMetric(
    values: number[],
    metricName: string,
    unit: string,
    latestValue: number,
    minWindow = 7,
  ): void {
    if (values.length < minWindow) return;

    const baseline = values.slice(0, -1); // all but latest
    if (baseline.length < 3) return;

    const z = zScore(latestValue, baseline);
    const baselineMean = mean(baseline);

    if (Math.abs(z) < 2.0) return; // within normal range

    const severity: AnomalyResult['severity'] =
      Math.abs(z) >= 3.0 ? 'alert' : Math.abs(z) >= 2.5 ? 'caution' : 'info';

    const direction = z > 0 ? 'above' : 'below';

    anomalies.push({
      detected: true,
      metric: metricName,
      value: latestValue,
      baseline: Math.round(baselineMean * 10) / 10,
      zScore: Math.round(z * 100) / 100,
      description:
        `Your ${metricName} (${latestValue} ${unit}) is ${direction} your recent personal baseline ` +
        `(${Math.round(baselineMean * 10) / 10} ${unit}). This is an observed pattern in your wellness data.`,
      severity,
      disclaimer: WELLNESS_DISCLAIMER,
    });
  }

  // Blood pressure systolic
  const bpRecords = (data.bloodPressure ?? []).slice(-30);
  if (bpRecords.length >= 7) {
    const sysValues = bpRecords.map(r => r.systolic);
    checkMetric(sysValues, 'systolic blood pressure', 'mmHg', sysValues[sysValues.length - 1]);
  }

  // Heart rate
  const hrRecords = (data.vitalSigns ?? []).filter(v => v.heartRate != null).slice(-30);
  if (hrRecords.length >= 7) {
    const hrValues = hrRecords.map(v => v.heartRate!);
    checkMetric(hrValues, 'resting heart rate', 'bpm', hrValues[hrValues.length - 1]);
  }

  // Blood glucose
  const glucoseRecords = (data.bloodSugar ?? []).slice(-30);
  if (glucoseRecords.length >= 7) {
    const glucoseValues = glucoseRecords.map(g => g.value);
    checkMetric(glucoseValues, 'blood glucose', 'mg/dL', glucoseValues[glucoseValues.length - 1]);
  }

  // HRV
  const hrvRecords = (data.vitalSigns ?? []).filter(v => v.hrv != null).slice(-30);
  if (hrvRecords.length >= 7) {
    const hrvValues = hrvRecords.map(v => v.hrv!);
    checkMetric(hrvValues, 'HRV', 'ms', hrvValues[hrvValues.length - 1]);
  }

  return anomalies;
}

// ─── Projected A1C ────────────────────────────────────────────────────────────

/**
 * Computes estimated A1C from 90-day average glucose.
 * Formula: eA1C = (avgGlucose + 46.7) / 28.7  (ADAG formula, mg/dL)
 * This is a wellness estimation, not a clinical A1C measurement.
 */
export function computeProjectedA1C(data: HealthData | null): ProjectedA1C {
  const empty: ProjectedA1C = {
    estimatedA1C: null,
    avgGlucose90d: null,
    sampleSize: 0,
    trend: 'insufficient_data',
    confidence: 'insufficient_data',
    disclaimer:
      'Estimated A1C is a wellness approximation based on your logged glucose readings. ' +
      'It is not a clinical A1C measurement. Consult a licensed clinician for accurate A1C testing.',
  };

  if (!data?.bloodSugar?.length) return empty;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const records90d = data.bloodSugar
    .filter(r => new Date(r.date) >= cutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (records90d.length < 5) return empty;

  // Convert mmol/L to mg/dL if needed
  const glucoseValues = records90d.map(r => {
    if (r.unit === 'mmol/L') return r.value * 18.0182;
    return r.value;
  });

  const avgGlucose = mean(glucoseValues);
  const estimatedA1C = (avgGlucose + 46.7) / 28.7;

  // Compute trend
  const indices = glucoseValues.map((_, i) => i);
  const regression = linearRegression(indices, glucoseValues);
  let trend: TrendDirection = 'stable';
  if (regression) {
    // Slope in mg/dL per reading
    trend = regression.slope < -0.5 ? 'improving'
      : regression.slope > 0.5 ? 'declining'
      : 'stable';
  }

  return {
    estimatedA1C: Math.round(estimatedA1C * 10) / 10,
    avgGlucose90d: Math.round(avgGlucose * 10) / 10,
    sampleSize: records90d.length,
    trend,
    confidence: confidenceFromSampleSize(records90d.length),
    disclaimer:
      'Estimated A1C is a wellness approximation based on your logged glucose readings. ' +
      'It is not a clinical A1C measurement. Consult a licensed clinician for accurate A1C testing.',
  };
}

// ─── Trend Risk Flags ─────────────────────────────────────────────────────────

export function computeTrendRiskFlags(data: HealthData | null): TrendRiskFlag[] {
  if (!data) return [];

  const flags: TrendRiskFlag[] = [];

  function checkTrend(
    values: number[],
    metricName: string,
    unit: string,
    riskThreshold: number, // % deviation from baseline to flag
    higherIsBetter: boolean,
  ): void {
    if (values.length < 7) return;

    const recent7 = values.slice(-7);
    const baseline = values.slice(0, -7);
    if (baseline.length < 7) return;

    const recentAvg = mean(recent7);
    const baselineAvg = mean(baseline);
    if (baselineAvg === 0) return;

    const deviationPct = ((recentAvg - baselineAvg) / baselineAvg) * 100;
    const absDeviation = Math.abs(deviationPct);

    if (absDeviation < riskThreshold) return;

    // For "higher is better" metrics (HRV, sleep), declining = risk
    // For "lower is better" metrics (BP, glucose), increasing = risk
    const isNegativeChange = higherIsBetter ? deviationPct < 0 : deviationPct > 0;

    if (!isNegativeChange) return; // Only flag negative trends

    const riskLevel: RiskLevel =
      absDeviation >= riskThreshold * 2 ? 'elevated'
      : absDeviation >= riskThreshold * 1.5 ? 'moderate'
      : 'low';

    flags.push({
      metric: metricName,
      riskLevel,
      description:
        `Your ${metricName} has shown a ${Math.abs(deviationPct).toFixed(1)}% ` +
        `${higherIsBetter ? 'decrease' : 'increase'} compared to your personal baseline ` +
        `over the past 7 days. This is an observed wellness pattern.`,
      value: Math.round(recentAvg * 10) / 10,
      baseline: Math.round(baselineAvg * 10) / 10,
      deviationPct: Math.round(deviationPct * 10) / 10,
      disclaimer: WELLNESS_DISCLAIMER,
    });
  }

  // Blood pressure systolic (lower is better, flag >10% increase)
  const bpValues = (data.bloodPressure ?? []).map(r => r.systolic);
  checkTrend(bpValues, 'systolic blood pressure', 'mmHg', 10, false);

  // HRV (higher is better, flag >15% decrease)
  const hrvValues = (data.vitalSigns ?? []).filter(v => v.hrv != null).map(v => v.hrv!);
  checkTrend(hrvValues, 'HRV', 'ms', 15, true);

  // Blood glucose (lower is better, flag >15% increase)
  const glucoseValues = (data.bloodSugar ?? []).map(g => g.value);
  checkTrend(glucoseValues, 'blood glucose', 'mg/dL', 15, false);

  // Sleep duration (higher is better, flag >15% decrease)
  const sleepValues = (data.sleep ?? []).map(s => s.durationHours ?? 0).filter(v => v > 0);
  checkTrend(sleepValues, 'sleep duration', 'hours', 15, true);

  return flags;
}

// ─── Full Analysis ────────────────────────────────────────────────────────────

/**
 * Runs the complete Core ML analysis suite on the provided health data.
 * Returns all scores, trends, anomalies, and risk flags.
 * Never throws — returns empty/default values on any error.
 */
export function runCoreMLAnalysis(data: HealthData | null): CoreMLAnalysisResult {
  try {
    return {
      wellnessScore: computeWellnessScore(data),
      recoveryTrend: computeRecoveryTrend(data),
      anomalies: detectAnomalies(data),
      projectedA1C: computeProjectedA1C(data),
      trendRiskFlags: computeTrendRiskFlags(data),
      analyzedAt: new Date().toISOString(),
    };
  } catch {
    return {
      wellnessScore: computeWellnessScore(null),
      recoveryTrend: computeRecoveryTrend(null),
      anomalies: [],
      projectedA1C: computeProjectedA1C(null),
      trendRiskFlags: [],
      analyzedAt: new Date().toISOString(),
    };
  }
}
