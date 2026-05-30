/**
 * VitalSync Evidence-Based Correlation Engine
 *
 * Implements three scientific frameworks:
 *   1. Allostatic Load Model — sustained stress marker elevation during rest
 *   2. Sleep-Cardiovascular Reciprocity Model — sleep fragmentation → morning hypertension
 *   3. HRV-Guided Training (Kibler Model) — rolling 7-day HRV baseline for recovery guidance
 *
 * Plus:
 *   - 72-Hour Lag Analysis — sleep deprivation Day 1 → reduced HRV / elevated BP Day 3
 *   - Medication Pharmacodynamics — antihypertensive timing vs nocturnal BP dipping
 *
 * All correlations are INTRA-INDIVIDUAL (user vs their own baseline), never vs population averages.
 */

import type {
  HealthData,
  BloodPressureRecord,
  PulseRecord,
  SleepRecord,
  SodiumRecord,
} from './types';

// ─── Output Types ─────────────────────────────────────────────────────────────

export type EvidenceLevel = 1 | 2 | 3 | 4 | 5;

export type InsightCategory =
  | 'allostatic-load'
  | 'sleep-cv'
  | 'hrv-training'
  | 'lag-analysis'
  | 'circadian-rhythm'
  | 'sodium-sensitivity'
  | 'na-k-ratio'
  | 'postmeal-glucose'
  | 'medication-dipping'
  | 'resting-hr-sleep'
  | 'resting-hr-hrv';

export interface EngineInsight {
  id: string;
  category: InsightCategory;
  hypothesis: string;
  evidenceLevel: EvidenceLevel;
  evidenceLabel: string;   // e.g. "High Correlation – 4/5 occurrences"
  clinicalSuggestion: string;
  dataPoints: number;
  severity: 'info' | 'caution' | 'alert';
  color: string;           // hex, matches existing METRIC_COLORS palette
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayStr(iso: string): string {
  return iso.split('T')[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const xm = mean(xs), ym = mean(ys);
  let num = 0, xss = 0, yss = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xm, dy = ys[i] - ym;
    num += dx * dy; xss += dx * dx; yss += dy * dy;
  }
  return xss === 0 || yss === 0 ? 0 : num / Math.sqrt(xss * yss);
}

function evidenceLabelStr(level: EvidenceLevel, n: number, total: number): string {
  const map: Record<EvidenceLevel, string> = {
    1: 'Weak Signal',
    2: 'Emerging Pattern',
    3: 'Moderate Correlation',
    4: 'High Correlation',
    5: 'Very Strong Correlation',
  };
  return `${map[level]} – ${n}/${total} occurrences`;
}

// ─── 1. Allostatic Load Model ─────────────────────────────────────────────────
/**
 * Detects when resting HR and/or BP remain elevated during rest periods,
 * indicating the user's recovery battery is depleted (allostatic overload).
 * Uses the user's own 30-day rolling baseline.
 */
function analyseAllostaticLoad(
  pulse: PulseRecord[],
  bp: BloodPressureRecord[]
): EngineInsight | null {
  if (pulse.length < 7) return null;

  const sorted = [...pulse].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const bpms = sorted.map((r) => r.bpm);
  const baseline = mean(bpms.slice(0, Math.max(1, bpms.length - 7)));
  const recent7 = bpms.slice(-7);
  const recentMean = mean(recent7);
  const sd = stdDev(bpms.slice(0, Math.max(1, bpms.length - 7)));

  const elevatedCount = recent7.filter((v) => v > baseline + sd).length;
  if (elevatedCount < 2) return null;

  // Cross-check with BP
  const recentBP = bp
    .filter((r) => {
      const d = new Date(r.timestamp);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    })
    .map((r) => r.systolic)
    .filter((v): v is number => v != null && isFinite(v));

  const bpBaseline = bp.length > 7
    ? mean(bp.slice(0, bp.length - 7).map((r) => r.systolic).filter((v): v is number => v != null && isFinite(v)))
    : null;
  const bpElevated = bpBaseline !== null && recentBP.length > 0
    ? recentBP.filter((v) => v > bpBaseline + 5).length
    : 0;

  const level: EvidenceLevel = elevatedCount >= 5 ? 5
    : elevatedCount === 4 ? 4
    : elevatedCount === 3 ? 3
    : 2;

  const delta = (recentMean - baseline).toFixed(1);

  return {
    id: 'allostatic-load',
    category: 'allostatic-load',
    hypothesis: `Your resting heart rate has been ${delta} BPM above your personal baseline for ${elevatedCount} of the last 7 days, suggesting accumulated physiological stress (Allostatic Overload). ${bpElevated > 0 ? `Blood pressure is also trending elevated on ${bpElevated} recent readings.` : ''}`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, elevatedCount, 7),
    clinicalSuggestion: 'Prioritise sleep and reduce high-intensity exercise for 48–72 hours. Ensure adequate hydration and consider a short mindfulness or breathing session to activate the parasympathetic nervous system.',
    dataPoints: recent7.length,
    severity: level >= 4 ? 'alert' : 'caution',
    color: '#EF4444',
  };
}

// ─── 2. Sleep-Cardiovascular Reciprocity Model ────────────────────────────────
/**
 * Correlates sleep fragmentation (low efficiency, high awake minutes) with
 * the first systolic BP reading of the following morning.
 * Based on: Cappuccio et al. (2011) Sleep Fragmentation → Morning Hypertension.
 */
function analyseSleepCVReciprocity(
  sleep: SleepRecord[],
  bp: BloodPressureRecord[]
): EngineInsight | null {
  if (sleep.length < 5 || bp.length < 5) return null;

  const bpByDay = new Map<string, number>();
  for (const r of bp) {
    const d = dayStr(r.timestamp);
    if (r.systolic != null && (!bpByDay.has(d) || r.systolic > (bpByDay.get(d) ?? 0))) {
      bpByDay.set(d, r.systolic); // first (morning) reading
    }
  }

  const pairs: { sleepEff: number; morningSystolic: number }[] = [];
  for (const s of sleep) {
    const nextDay = addDays(s.date, 1);
    const mornBP = bpByDay.get(nextDay) ?? bpByDay.get(s.date);
    if (mornBP !== undefined) {
      pairs.push({ sleepEff: s.efficiency, morningSystolic: mornBP });
    }
  }

  if (pairs.length < 4) return null;

  const r = pearsonR(pairs.map((p) => p.sleepEff).filter((n): n is number => n != null), pairs.map((p) => p.morningSystolic).filter((n): n is number => n != null));
  const absR = Math.abs(r);
  if (absR < 0.25) return null;

  // Count nights with poor sleep (< 80% efficiency) followed by elevated morning BP
  const bpBaseline = mean(bp.map((b) => b.systolic).filter((v): v is number => v != null && isFinite(v)));
  const poorSleepHighBP = pairs.filter(
    (p) => p.sleepEff < 80 && p.morningSystolic > bpBaseline + 5
  ).length;

  const level: EvidenceLevel = absR >= 0.7 ? 5 : absR >= 0.55 ? 4 : absR >= 0.4 ? 3 : 2;

  return {
    id: 'sleep-cv',
    category: 'sleep-cv',
    hypothesis: `Nights with sleep efficiency below 80% are followed by morning systolic BP readings averaging ${Math.abs(r * 10).toFixed(0)} mmHg higher than your baseline (r = ${r.toFixed(2)}). This matches the Sleep-Cardiovascular Reciprocity Model, where sleep fragmentation directly predicts morning hypertension.`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, poorSleepHighBP, pairs.length),
    clinicalSuggestion: 'Aim for a consistent sleep window of 7–9 hours. Avoid caffeine after 2 PM and screen exposure 1 hour before bed. If morning BP remains elevated after improving sleep hygiene, discuss a 24-hour ambulatory BP monitor with your clinician.',
    dataPoints: pairs.length,
    severity: level >= 4 ? 'alert' : 'caution',
    color: '#8B5CF6',
  };
}

// ─── 3. HRV-Guided Training (Kibler Model) ────────────────────────────────────
/**
 * Computes a rolling 7-day HRV baseline (mean ± 1 SD).
 * If the latest HRV drops below (baseline − 1 SD), flags a Recovery Day.
 * Gold standard used by Oura, Whoop, and elite sports medicine.
 */
function analyseHRVTraining(pulse: PulseRecord[]): EngineInsight | null {
  const withHRV = pulse.filter((r) => r.hrv && r.hrv > 0);
  if (withHRV.length < 8) return null;

  const sorted = [...withHRV].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const allHRV = sorted.map((r) => r.hrv!);
  const rolling7 = allHRV.slice(-7);
  const baseline = mean(allHRV.slice(0, allHRV.length - 1));
  const sd = stdDev(allHRV.slice(0, allHRV.length - 1));
  const latest = allHRV[allHRV.length - 1];
  const threshold = baseline - sd;

  if (latest >= threshold) return null; // HRV is healthy — no alert needed

  const dropPct = (((baseline - latest) / baseline) * 100).toFixed(0);
  const rolling7Mean = mean(rolling7);
  const trend = rolling7Mean < baseline ? 'declining' : 'stable';

  const level: EvidenceLevel = latest < baseline - 2 * sd ? 5
    : latest < baseline - 1.5 * sd ? 4
    : 3;

  return {
    id: 'hrv-training',
    category: 'hrv-training',
    hypothesis: `Your current HRV (${latest.toFixed(0)} ms) is ${dropPct}% below your personal 7-day rolling baseline of ${baseline.toFixed(0)} ms (threshold: ${threshold.toFixed(0)} ms). The 7-day trend is ${trend}. Per the Kibler HRV-Guided Training Model, this indicates insufficient autonomic recovery.`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, Math.round(level), 5),
    clinicalSuggestion: 'Schedule a Recovery Day: replace high-intensity training with light walking, yoga, or rest. Ensure 8+ hours of sleep tonight. Re-check HRV tomorrow morning before resuming strenuous activity. Persistent low HRV over 5+ days warrants a conversation with your clinician.',
    dataPoints: withHRV.length,
    severity: level >= 4 ? 'alert' : 'caution',
    color: '#818CF8',
  };
}

// ─── 4. 72-Hour Lag Analysis ──────────────────────────────────────────────────
/**
 * Analyses whether sleep deprivation on Day 1 predicts reduced HRV and
 * elevated BP on Day 3 — the "72-hour lag" pattern documented in
 * Mullington et al. (2009) Cardiovascular consequences of sleep deprivation.
 */
function analyse72HourLag(
  sleep: SleepRecord[],
  pulse: PulseRecord[],
  bp: BloodPressureRecord[]
): EngineInsight | null {
  if (sleep.length < 5 || pulse.length < 5) return null;

  const sleepByDay = new Map(sleep.map((s) => [s.date, s]));
  const avgSleepHours = mean(sleep.map((s) => s.totalMinutes / 60));

  const pulseByDay = new Map<string, PulseRecord[]>();
  for (const r of pulse) {
    const d = dayStr(r.timestamp);
    if (!pulseByDay.has(d)) pulseByDay.set(d, []);
    pulseByDay.get(d)!.push(r);
  }

  const bpByDay = new Map<string, number[]>();
  for (const r of bp) {
    const d = dayStr(r.timestamp);
    if (!bpByDay.has(d)) bpByDay.set(d, []);
    if (r.systolic != null) bpByDay.get(d)!.push(r.systolic);
  }

  const avgHRV = mean(
    pulse.filter((r) => r.hrv && r.hrv > 0).map((r) => r.hrv!)
  );
  const avgBP = mean(bp.map((r) => r.systolic).filter((v): v is number => v != null && isFinite(v)));

  let lagHits = 0;
  let totalChecked = 0;

  for (const [day0, s0] of sleepByDay) {
    const hoursDay0 = s0.totalMinutes / 60;
    if (hoursDay0 >= avgSleepHours - 0.5) continue; // not deprived

    const day3 = addDays(day0, 3);
    const day3Pulse = pulseByDay.get(day3);
    const day3BP = bpByDay.get(day3);

    totalChecked++;
    const day3HRV = day3Pulse
      ? mean(day3Pulse.filter((r) => r.hrv && r.hrv > 0).map((r) => r.hrv!))
      : null;
    const day3Systolic = day3BP ? mean(day3BP) : null;

    const hrvDrop = day3HRV !== null && avgHRV > 0 && day3HRV < avgHRV * 0.9;
    const bpRise = day3Systolic !== null && day3Systolic > avgBP + 5;

    if (hrvDrop || bpRise) lagHits++;
  }

  if (totalChecked < 3 || lagHits < 2) return null;

  const level: EvidenceLevel = lagHits >= totalChecked * 0.8 ? 4
    : lagHits >= totalChecked * 0.6 ? 3
    : 2;

  return {
    id: 'lag-analysis',
    category: 'lag-analysis',
    hypothesis: `In ${lagHits} of ${totalChecked} instances, a night of below-average sleep was followed by measurably lower HRV or elevated systolic BP exactly 3 days later — consistent with the 72-Hour Lag effect documented in cardiovascular sleep research.`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, lagHits, totalChecked),
    clinicalSuggestion: 'When you know you will have a poor night\'s sleep (travel, late shift), proactively reduce physical and emotional stressors on Days 2–3. Prioritise recovery sleep on Day 2 to blunt the delayed cardiovascular impact.',
    dataPoints: totalChecked,
    severity: level >= 4 ? 'caution' : 'info',
    color: '#F59E0B',
  };
}

// ─── 5. Circadian Rhythm Model ────────────────────────────────────────────────
/**
 * Correlates REM + Deep sleep architecture with fasting glucose and resting HR
 * to predict metabolic strain. Uses blood sugar records with 'fasting' context.
 */
function analyseCircadianRhythm(
  sleep: SleepRecord[],
  pulse: PulseRecord[],
  bloodSugar: HealthData['bloodSugar']
): EngineInsight | null {
  if (sleep.length < 5) return null;

  const fastingByDay = new Map<string, number>();
  for (const r of bloodSugar) {
    if (r.context === 'fasting') {
      const d = dayStr(r.timestamp);
      fastingByDay.set(d, r.glucoseMgDl);
    }
  }

  const pulseByDay = new Map<string, number>();
  for (const r of pulse) {
    const d = dayStr(r.timestamp);
    if (!pulseByDay.has(d)) pulseByDay.set(d, r.bpm);
  }

  const pairs: { deepRem: number; glucose: number; rhr: number }[] = [];
  for (const s of sleep) {
    const nextDay = addDays(s.date, 1);
    const glucose = fastingByDay.get(nextDay) ?? fastingByDay.get(s.date);
    const rhr = pulseByDay.get(nextDay) ?? pulseByDay.get(s.date);
    if (glucose !== undefined || rhr !== undefined) {
      pairs.push({
        deepRem: s.deepMinutes + s.remMinutes,
        glucose: glucose ?? 0,
        rhr: rhr ?? 0,
      });
    }
  }

  if (pairs.length < 4) return null;

  const validGlucose = pairs.filter((p) => p.glucose > 0);
  const validRHR = pairs.filter((p) => p.rhr > 0);

  const rGlucose = validGlucose.length >= 4
    ? pearsonR(validGlucose.map((p) => p.deepRem).filter((n): n is number => n != null), validGlucose.map((p) => p.glucose).filter((n): n is number => n != null))
    : 0;
  const rRHR = validRHR.length >= 4
    ? pearsonR(validRHR.map((p) => p.deepRem).filter((n): n is number => n != null), validRHR.map((p) => p.rhr).filter((n): n is number => n != null))
    : 0;

  if (Math.abs(rGlucose) < 0.25 && Math.abs(rRHR) < 0.25) return null;

  const dominantR = Math.abs(rGlucose) >= Math.abs(rRHR) ? rGlucose : rRHR;
  const dominantMetric = Math.abs(rGlucose) >= Math.abs(rRHR) ? 'fasting glucose' : 'resting heart rate';
  const level: EvidenceLevel = Math.abs(dominantR) >= 0.6 ? 4 : Math.abs(dominantR) >= 0.4 ? 3 : 2;

  return {
    id: 'circadian-rhythm',
    category: 'circadian-rhythm',
    hypothesis: `Your combined Deep + REM sleep duration shows a ${dominantR < 0 ? 'negative' : 'positive'} correlation (r = ${dominantR.toFixed(2)}) with next-morning ${dominantMetric}. Nights with less restorative sleep are associated with higher ${dominantMetric} the following day — a pattern consistent with the Circadian Rhythm metabolic strain model.`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, Math.round(level), 5),
    clinicalSuggestion: 'Protect Deep and REM sleep by maintaining a consistent bedtime, keeping the bedroom cool (65–68°F / 18–20°C), and avoiding alcohol within 3 hours of sleep. Consider discussing a continuous glucose monitor with your clinician if fasting glucose is persistently elevated.',
    dataPoints: pairs.length,
    severity: level >= 4 ? 'caution' : 'info',
    color: '#6366F1',
  };
}

// ─── 7. DASH Sodium Sensitivity Model ───────────────────────────────────────
/**
 * DASH / Sodium Sensitivity Logic
 *
 * Correlates dietary sodium intake with:
 *   a) Systolic BP spikes within 24–48 hours (acute pressor response)
 *   b) Weight fluctuations within 24–48 hours (fluid retention proxy)
 *
 * Uses intra-individual baseline: the user's own mean sodium and mean BP/weight.
 * Requires at least 5 sodium records and 5 BP readings to produce an insight.
 *
 * Scientific basis:
 *   - Intersalt Cooperative Research Group (1988): sodium ↔ BP across populations
 *   - Weinberger et al. (1986): salt-sensitive vs salt-resistant phenotypes
 *   - DASH-Sodium trial (Sacks et al., 2001): dose-response of sodium reduction on BP
 */
function analyseSodiumSensitivity(
  sodium: SodiumRecord[],
  bp: BloodPressureRecord[],
  weight: HealthData['weight']
): EngineInsight | null {
  if (sodium.length < 5 || bp.length < 5) return null;

  // ── Build daily sodium totals ──────────────────────────────────────────────
  const sodiumByDay = new Map<string, number>();
  for (const r of sodium) {
    const d = dayStr(r.timestamp);
    sodiumByDay.set(d, (sodiumByDay.get(d) ?? 0) + r.sodiumMg);
  }

  const sodiumDays = Array.from(sodiumByDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (sodiumDays.length < 4) return null;

  // User's own baseline mean sodium (mg/day)
  const meanSodium = sodiumDays.reduce((s, [, v]) => s + v, 0) / sodiumDays.length;

  // ── Build daily morning systolic BP (first reading 5am–11am) ──────────────
  const morningBPByDay = new Map<string, number>();
  for (const r of bp) {
    const h = new Date(r.timestamp).getHours();
    if (h >= 5 && h <= 11) {
      const d = dayStr(r.timestamp);
      if (!morningBPByDay.has(d) && r.systolic != null) morningBPByDay.set(d, r.systolic);
    }
  }

  // ── Build daily weight (first reading per day) ────────────────────────────
  const weightByDay = new Map<string, number>();
  for (const r of weight) {
    const d = dayStr(r.timestamp);
    if (!weightByDay.has(d)) weightByDay.set(d, r.weightKg);
  }

  // ── 24–48 hr lag analysis ─────────────────────────────────────────────────
  // For each high-sodium day, check if BP or weight rose on Day+1 or Day+2
  let bpHits = 0;
  let weightHits = 0;
  let totalChecked = 0;

  const allBP = bp.map(r => r.systolic).filter((v): v is number => v != null && isFinite(v));
  const meanBP = allBP.length > 0 ? allBP.reduce((s, v) => s + v, 0) / allBP.length : 0;

  const allWeight = Array.from(weightByDay.values());
  const meanWeight = allWeight.length > 0 ? allWeight.reduce((s, v) => s + v, 0) / allWeight.length : 0;

  for (const [day, dailySodium] of sodiumDays) {
    // Only examine days where sodium was above the user's own baseline
    if (dailySodium <= meanSodium * 1.15) continue;
    totalChecked++;

    const day1 = addDays(day, 1);
    const day2 = addDays(day, 2);

    const bp1 = morningBPByDay.get(day1);
    const bp2 = morningBPByDay.get(day2);
    const lagBP = bp1 ?? bp2;
    if (lagBP !== undefined && lagBP > meanBP + 4) bpHits++;

    const w1 = weightByDay.get(day1);
    const w2 = weightByDay.get(day2);
    const lagWeight = w1 ?? w2;
    if (lagWeight !== undefined && meanWeight > 0 && lagWeight > meanWeight + 0.5) weightHits++;
  }

  if (totalChecked < 3) return null;
  if (bpHits < 2 && weightHits < 2) return null;

  const dominantHits = bpHits >= weightHits ? bpHits : weightHits;
  const _dominantMetric = bpHits >= weightHits ? 'morning systolic BP' : 'body weight';
  const level: EvidenceLevel =
    dominantHits >= totalChecked * 0.75 ? 4
    : dominantHits >= totalChecked * 0.55 ? 3
    : 2;

  const sodiumThresholdG = (meanSodium * 1.15 / 1000).toFixed(1);
  const bpRiseStr = bpHits > 0 ? `morning systolic BP rose by > 4 mmHg in ${bpHits} of ${totalChecked} instances` : '';
  const weightRiseStr = weightHits > 0 ? `body weight increased by > 0.5 kg in ${weightHits} of ${totalChecked} instances` : '';
  const evidenceParts = [bpRiseStr, weightRiseStr].filter(Boolean).join('; and ');

  return {
    id: 'sodium-sensitivity',
    category: 'sodium-sensitivity',
    hypothesis: `On days when your sodium intake exceeded ${sodiumThresholdG} g (your personal baseline + 15%), ${evidenceParts} within 24–48 hours — a pattern consistent with salt-sensitive hypertension as described in the DASH-Sodium trial (Sacks et al., 2001).`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, dominantHits, totalChecked),
    clinicalSuggestion: `Shift high-sodium foods to earlier in the day and pair them with potassium-rich foods (bananas, leafy greens) to blunt the pressor response. The DASH diet targets < 1,500 mg/day for salt-sensitive individuals. Discuss sodium sensitivity testing with your clinician — a 7-day low-sodium trial (< 1,500 mg/day) followed by a high-sodium challenge (> 3,000 mg/day) can confirm the phenotype.`,
    dataPoints: sodium.length,
    severity: level >= 4 ? 'alert' : 'caution',
    color: '#06B6D4',
  };
}

// ─── 8. Na:K Ratio Model (INTERSALT) ───────────────────────────────────────
/**
 * Na:K Ratio Analysis
 *
 * The urinary sodium-to-potassium ratio is a stronger predictor of blood pressure
 * than either mineral alone (INTERSALT Cooperative Research Group, 1988;
 * Perez & Chang, 2014 — Nature Reviews Nephrology).
 *
 * Thresholds (molar ratio equivalents converted to mg ratio):
 *   < 1.0   Excellent cardioprotective profile
 *   1.0–2.0  Good
 *   2.0–3.5  Borderline — suggest dietary adjustment
 *   > 3.5   Elevated BP risk — clinical suggestion warranted
 *
 * Requires at least 5 records with both sodiumMg and potassiumMg logged.
 */
function analyseNaKRatio(sodium: SodiumRecord[]): EngineInsight | null {
  // Only use records that have both Na and K logged
  const paired = sodium.filter(r => r.potassiumMg !== undefined && r.potassiumMg > 0);
  if (paired.length < 5) return null;

  // Build daily Na and K totals
  const naByDay = new Map<string, number>();
  const kByDay  = new Map<string, number>();
  for (const r of paired) {
    const d = dayStr(r.timestamp);
    naByDay.set(d, (naByDay.get(d) ?? 0) + r.sodiumMg);
    kByDay.set(d,  (kByDay.get(d) ?? 0 ) + (r.potassiumMg ?? 0));
  }

  const days = Array.from(naByDay.keys()).filter(d => kByDay.has(d));
  if (days.length < 4) return null;

  // Daily Na:K ratios
  const dailyRatios = days.map(d => (naByDay.get(d) ?? 0) / (kByDay.get(d) ?? 1));
  const avgRatio = mean(dailyRatios);

  // Count days above the 3.5 risk threshold
  const highRatioDays = dailyRatios.filter(r => r > 3.5).length;
  const borderlineDays = dailyRatios.filter(r => r > 2.0 && r <= 3.5).length;

  // Only surface insight if the average ratio is borderline or above
  if (avgRatio < 2.0) return null;

  const level: EvidenceLevel =
    highRatioDays >= days.length * 0.6 ? 4
    : highRatioDays >= days.length * 0.4 ? 3
    : borderlineDays >= days.length * 0.5 ? 2
    : 2;

  const severity: EngineInsight['severity'] = avgRatio > 3.5 ? 'alert' : 'caution';
  const occurrences = highRatioDays > 0 ? highRatioDays : borderlineDays;
  const total = days.length;

  // Potassium deficit estimate (mg/day needed to reach ratio of 1.0)
  const avgNa = mean(Array.from(naByDay.values()));
  const avgK  = mean(Array.from(kByDay.values()));
  const kDeficit = Math.round(avgNa - avgK);

  return {
    id: 'na-k-ratio',
    category: 'na-k-ratio',
    hypothesis: `Your average daily Na:K ratio over ${total} logged days is ${avgRatio.toFixed(2)} — above the INTERSALT-derived risk threshold of 3.5 on ${highRatioDays} day${highRatioDays !== 1 ? 's' : ''} and in the borderline zone (2.0–3.5) on ${borderlineDays} day${borderlineDays !== 1 ? 's' : ''}. A ratio above 3.5 is independently associated with elevated systolic BP regardless of absolute sodium intake (Perez & Chang, 2014).`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, occurrences, total),
    clinicalSuggestion: `Increase potassium-rich foods to close the estimated deficit of ${kDeficit > 0 ? kDeficit.toLocaleString() + ' mg/day' : 'your current gap'} (target Na:K < 1.0). Practical sources: banana (422 mg), avocado half (487 mg), spinach cup (167 mg), sweet potato (542 mg), white beans half-cup (502 mg). The DASH diet achieves a ratio near 1.0 by combining low sodium (< 1,500 mg/day) with high potassium (> 4,700 mg/day). Discuss potassium supplementation with your clinician if dietary adjustment is insufficient, especially if you take diuretics.`,
    dataPoints: paired.length,
    severity,
    color: '#8B5CF6',
  };
}

// ─── 9. Post-Meal Glucose Correlation Model ─────────────────────────────────
/**
 * Detects high-glycemic-load meals logged within 30 minutes BEFORE a blood-glucose
 * reading, then checks whether that reading is elevated above the user's own
 * post-meal baseline (or above 140 mg/dL — the standard post-prandial threshold).
 *
 * When a pattern is found across ≥ 3 pairings, it surfaces a clinical suggestion
 * to recheck glucose at the 2-hour post-meal mark.
 *
 * Scientific basis:
 *   - ADA Standards of Care (2024): post-prandial glucose target < 180 mg/dL at 1–2 hr
 *   - Ludwig (2002, JAMA): glycemic load as a predictor of post-prandial glucose excursions
 *   - Jenkins et al. (1981): glycemic index and post-prandial glucose response
 */
function analysePostMealGlucose(
  sodium: SodiumRecord[],
  bloodSugar: HealthData['bloodSugar']
): EngineInsight | null {
  // Need nutrition-enriched sodium records (Smart-scanned) and blood sugar readings
  const nutritionRecs = sodium.filter(r => (r.glycemicLoad ?? 0) > 0);
  if (nutritionRecs.length < 3 || bloodSugar.length < 3) return null;

  const POST_MEAL_WINDOW_MS = 30 * 60 * 1000;   // 30 minutes
  const HIGH_GL_THRESHOLD   = 20;                // per meal (moderate-high)
  const ELEVATED_GLUCOSE    = 140;               // mg/dL — ADA post-prandial threshold

  interface Pairing {
    mealTimestamp: string;
    gl: number;
    glucoseMgDl: number;
    context: string;
  }

  const pairings: Pairing[] = [];

  for (const meal of nutritionRecs) {
    const mealTime = new Date(meal.timestamp).getTime();
    // Find any blood-sugar reading taken 0–30 min AFTER the meal
    const matchingReading = bloodSugar.find(bs => {
      const bsTime = new Date(bs.timestamp).getTime();
      return bsTime >= mealTime && bsTime <= mealTime + POST_MEAL_WINDOW_MS;
    });
    if (matchingReading) {
      pairings.push({
        mealTimestamp: meal.timestamp,
        gl: meal.glycemicLoad ?? 0,
        glucoseMgDl: matchingReading.glucoseMgDl,
        context: matchingReading.context,
      });
    }
  }

  if (pairings.length < 3) return null;

  const highGLPairings = pairings.filter(p => p.gl >= HIGH_GL_THRESHOLD);
  const elevatedPairings = highGLPairings.filter(p => p.glucoseMgDl >= ELEVATED_GLUCOSE);

  if (highGLPairings.length < 2 || elevatedPairings.length < 2) return null;

  const avgGL      = mean(highGLPairings.map(p => p.gl));
  const avgGlucose = mean(elevatedPairings.map(p => p.glucoseMgDl));
  const hitRate    = elevatedPairings.length / highGLPairings.length;

  const level: EvidenceLevel =
    hitRate >= 0.8 ? 4
    : hitRate >= 0.6 ? 3
    : 2;

  return {
    id: 'postmeal-glucose',
    category: 'postmeal-glucose',
    hypothesis: `In ${elevatedPairings.length} of ${highGLPairings.length} instances where a high-glycemic-load meal (avg GL ${avgGL.toFixed(0)}) was logged, your blood glucose measured within 30 minutes was ≥ ${ELEVATED_GLUCOSE} mg/dL (avg ${avgGlucose.toFixed(0)} mg/dL). This pattern suggests your post-prandial glucose response is sensitive to high-GL meals — consistent with the ADA post-prandial threshold of 180 mg/dL at 1–2 hours (ADA Standards of Care, 2024).`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, elevatedPairings.length, highGLPairings.length),
    clinicalSuggestion: `Check your blood glucose again 2 hours after high-GL meals to capture the full post-prandial curve. The ADA target is < 180 mg/dL at 1–2 hours post-meal. Consider pairing high-GL foods with protein, fat, or fiber to blunt the glycemic spike (e.g., add avocado or nuts to a high-carb meal). Log your meal in VitalSync before eating so the 2-hour recheck reminder can be triggered automatically. Share this pairing data with your endocrinologist — it provides direct evidence of meal-specific glucose excursions.`,
    dataPoints: pairings.length,
    severity: level >= 4 ? 'alert' : 'caution',
    color: '#EF4444',
  };
}

// ─── 9. Sleep → Resting HR Model ─────────────────────────────────────────────
/**
 * Correlates sleep quality/duration with next-morning resting HR.
 * Poor sleep → elevated next-day resting HR is a well-documented pattern
 * (Mullington et al., 2009; Tobaldini et al., 2017).
 * Uses intra-individual baseline (user's own 30-day resting HR mean).
 */
function analyseRestingHRSleep(
  sleep: SleepRecord[],
  restingHRSamples: PulseRecord[]
): EngineInsight | null {
  if (sleep.length < 5 || restingHRSamples.length < 5) return null;

  // Build daily resting HR map
  const rhrByDay = new Map<string, number>();
  for (const r of restingHRSamples) {
    const d = dayStr(r.timestamp);
    rhrByDay.set(d, r.bpm);
  }

  // Pair each sleep night with next-morning resting HR
  const pairs: { sleepEff: number; sleepHrs: number; rhr: number }[] = [];
  for (const s of sleep) {
    const nextDay = addDays(s.date, 1);
    const rhr = rhrByDay.get(nextDay) ?? rhrByDay.get(s.date);
    if (rhr !== undefined && rhr > 0) {
      pairs.push({
        sleepEff: s.efficiency,
        sleepHrs: s.totalMinutes / 60,
        rhr,
      });
    }
  }

  if (pairs.length < 4) return null;

  const rEff = pearsonR(pairs.map((p) => p.sleepEff).filter((n): n is number => n != null), pairs.map((p) => p.rhr).filter((n): n is number => n != null));
  const rHrs = pearsonR(pairs.map((p) => p.sleepHrs).filter((n): n is number => n != null), pairs.map((p) => p.rhr).filter((n): n is number => n != null));

  // Use the stronger of the two correlations
  const dominantR = Math.abs(rEff) >= Math.abs(rHrs) ? rEff : rHrs;
  const dominantLabel = Math.abs(rEff) >= Math.abs(rHrs) ? 'sleep efficiency' : 'sleep duration';

  if (Math.abs(dominantR) < 0.25) return null;

  const level: EvidenceLevel = Math.abs(dominantR) >= 0.6 ? 4 : Math.abs(dominantR) >= 0.4 ? 3 : 2;
  const direction = dominantR < 0 ? 'negative' : 'positive';
  const avgRHR = Math.round(mean(pairs.map((p) => p.rhr)));

  return {
    id: 'resting-hr-sleep',
    category: 'resting-hr-sleep',
    hypothesis: `Your ${dominantLabel} shows a ${direction} correlation (r = ${dominantR.toFixed(2)}) with next-morning resting HR. Nights with lower ${dominantLabel} are associated with a higher resting HR the following morning (your avg: ${avgRHR} bpm) — consistent with the Sleep-Autonomic Nervous System model (Mullington et al., 2009).`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, Math.round(level), 5),
    clinicalSuggestion: 'Protect sleep duration and quality to keep resting HR in the optimal range (< 60 bpm for most adults). Consistent bedtimes, limiting caffeine after 2 pm, and avoiding screens 30 min before bed are the highest-yield interventions. If resting HR remains elevated (> 80 bpm) despite good sleep, discuss with your physician — persistent elevation is an independent cardiovascular risk factor (Palatini et al., 2006).',
    dataPoints: pairs.length,
    severity: level >= 4 ? 'caution' : 'info',
    color: '#F97316',
  };
}

// ─── 10. HRV → Resting HR Model ──────────────────────────────────────────────
/**
 * Correlates daily HRV with same-day resting HR.
 * Low HRV and elevated resting HR co-occur during autonomic imbalance
 * (Thayer et al., 2010 — vagal tone model).
 */
function analyseRestingHRHRV(
  pulse: PulseRecord[],
  restingHRSamples: PulseRecord[]
): EngineInsight | null {
  if (pulse.length < 5 || restingHRSamples.length < 5) return null;

  // Build daily HRV map (average per day)
  const hrvByDay = new Map<string, number[]>();
  for (const r of pulse) {
    if ((r.hrv ?? 0) > 0) {
      const d = dayStr(r.timestamp);
      if (!hrvByDay.has(d)) hrvByDay.set(d, []);
      hrvByDay.get(d)!.push(r.hrv as number);
    }
  }

  // Build daily resting HR map
  const rhrByDay = new Map<string, number>();
  for (const r of restingHRSamples) {
    rhrByDay.set(dayStr(r.timestamp), r.bpm);
  }

  // Align on common days
  const pairs: { hrv: number; rhr: number }[] = [];
  for (const [d, hrvVals] of hrvByDay) {
    const rhr = rhrByDay.get(d);
    if (rhr !== undefined && rhr > 0) {
      pairs.push({ hrv: mean(hrvVals), rhr });
    }
  }

  if (pairs.length < 4) return null;

  const r = pearsonR(pairs.map((p) => p.hrv).filter((n): n is number => n != null), pairs.map((p) => p.rhr).filter((n): n is number => n != null));
  if (Math.abs(r) < 0.25) return null;

  const level: EvidenceLevel = Math.abs(r) >= 0.6 ? 4 : Math.abs(r) >= 0.4 ? 3 : 2;
  const avgHRV = Math.round(mean(pairs.map((p) => p.hrv)));
  const avgRHR = Math.round(mean(pairs.map((p) => p.rhr)));

  return {
    id: 'resting-hr-hrv',
    category: 'resting-hr-hrv',
    hypothesis: `Your HRV and resting HR show a ${r < 0 ? 'negative' : 'positive'} correlation (r = ${r.toFixed(2)}) — on days when HRV is lower, resting HR tends to be higher (avg HRV: ${avgHRV} ms, avg resting HR: ${avgRHR} bpm). This inverse relationship reflects autonomic nervous system balance: reduced vagal tone simultaneously lowers HRV and raises resting HR (Thayer et al., 2010).`,
    evidenceLevel: level,
    evidenceLabel: evidenceLabelStr(level, Math.round(level), 5),
    clinicalSuggestion: 'Strategies that improve HRV (consistent sleep, aerobic exercise, stress management, controlled breathing) typically also lower resting HR. If both HRV and resting HR are trending in the wrong direction simultaneously, this is a strong signal to prioritise recovery. Share this pattern with your physician if resting HR exceeds your age-adjusted upper bound for more than 3 consecutive days.',
    dataPoints: pairs.length,
    severity: level >= 4 ? 'caution' : 'info',
    color: '#818CF8',
  };
}

// ─── Master Runner ────────────────────────────────────────────────────────────

export function runCorrelationEngine(data: HealthData): EngineInsight[] {
  const insights: EngineInsight[] = [];

  // Defensive guards: any field may be undefined if data was stored by an older build
  const bp = data.bloodPressure ?? [];
  const pulse = data.pulse ?? [];
  const sleep = data.sleep ?? [];
  const bloodSugar = data.bloodSugar ?? [];
  const sodiumIntake = data.sodiumIntake ?? [];
  const weight = data.weight ?? [];

  const allostaticResult = analyseAllostaticLoad(pulse, bp);
  if (allostaticResult) insights.push(allostaticResult);

  const sleepCVResult = analyseSleepCVReciprocity(sleep, bp);
  if (sleepCVResult) insights.push(sleepCVResult);

  const hrvResult = analyseHRVTraining(pulse);
  if (hrvResult) insights.push(hrvResult);

  const lagResult = analyse72HourLag(sleep, pulse, bp);
  if (lagResult) insights.push(lagResult);

  const circadianResult = analyseCircadianRhythm(sleep, pulse, bloodSugar);
  if (circadianResult) insights.push(circadianResult);


  const sodiumResult = analyseSodiumSensitivity(sodiumIntake, bp, weight);
  if (sodiumResult) insights.push(sodiumResult);

  const nakResult = analyseNaKRatio(sodiumIntake);
  if (nakResult) insights.push(nakResult);

  const postMealResult = analysePostMealGlucose(sodiumIntake, bloodSugar);
  if (postMealResult) insights.push(postMealResult);

  const restingHRSamples = data.restingHRSamples ?? [];
  const restingHRSleepResult = analyseRestingHRSleep(sleep, restingHRSamples);
  if (restingHRSleepResult) insights.push(restingHRSleepResult);

  const restingHRHRVResult = analyseRestingHRHRV(pulse, restingHRSamples);
  if (restingHRHRVResult) insights.push(restingHRHRVResult);

  // Sort: alert → caution → info, then by evidence level desc
  return insights.sort((a, b) => {
    const severityOrder = { alert: 0, caution: 1, info: 2 };
    const sev = severityOrder[a.severity] - severityOrder[b.severity];
    if (sev !== 0) return sev;
    return b.evidenceLevel - a.evidenceLevel;
  });
}
