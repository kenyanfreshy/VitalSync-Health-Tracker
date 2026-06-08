/**
 * nutrition-correlate.ts
 *
 * Evidence-based Nutrition Correlate scoring engine.
 *
 * Scores dietary quality across five time windows using DailyNutrients data
 * pulled from the dashboard's nutrition log (sodiumIntake → aggregateDailyNutrients).
 *
 * Scoring philosophy (from user specification):
 *   - Fiber density is the most reliable positive signal (meta-analytic consensus)
 *   - Protein consistency stabilises postprandial glucose and preserves lean mass
 *   - Ultra-processed food proxy: low fiber:carb ratio + high glycemic load
 *   - Pattern adherence: how many days in the window had sufficient logged data
 *   - Overall dietary quality > single macro target
 *
 * Score: 0–100 integer, split into five sub-dimensions (20 pts each):
 *   1. Fiber density          (fiber_g / calories × 1000, vs. WHO target ~14 g/1000 kcal)
 *   2. Protein consistency    (CV of daily protein_g — lower CV = higher score)
 *   3. Processed-food proxy   (fiber:carb ratio + glycemic load penalty)
 *   4. Pattern adherence      (fraction of window days with ≥1 logged entry)
 *   5. Macro balance          (protein ≥ 15% kcal, fat 25–40% kcal, carbs 40–60% kcal)
 */

import type { DailyNutrients } from './daily-nutrients';

// ─── Public types ─────────────────────────────────────────────────────────────

export type NutritionWindow = '3d' | '7d' | '14d' | '30d' | '3mo';

export interface NutritionWindowMeta {
  key: NutritionWindow;
  label: string;
  days: number;
  purposeShort: string;
  purposeLong: string;
}

export const NUTRITION_WINDOWS: NutritionWindowMeta[] = [
  {
    key: '3d',
    label: '3 Days',
    days: 3,
    purposeShort: 'Early signal',
    purposeLong:
      'Short-range signal — detects immediate patterns such as low fiber, irregular protein, or high reliance on ultra-processed foods. Too short to judge habitual quality with confidence.',
  },
  {
    key: '7d',
    label: '7 Days',
    days: 7,
    purposeShort: 'Weekly adherence',
    purposeLong:
      'Weekly pattern score — captures weekday and weekend variation. First window where Mediterranean-style eating, adequate fiber, and consistent protein distribution can be assessed with reasonable confidence.',
  },
  {
    key: '14d',
    label: '14 Days',
    days: 14,
    purposeShort: 'Habit formation',
    purposeLong:
      'Habit-building window — long enough to see whether a nutrition plan is repeatable, not just aspirational. Rewards consistency and food quality over rigid macro perfection.',
  },
  {
    key: '30d',
    label: '30 Days',
    days: 30,
    purposeShort: 'Lifestyle stability',
    purposeLong:
      'Lifestyle stability window — first strong marker of whether nutrition choices are becoming part of the user\'s routine. Fiber density, minimally processed food intake, and pattern adherence are weighted most heavily here.',
  },
  {
    key: '3mo',
    label: '3 Months',
    days: 90,
    purposeShort: 'Highest-confidence trend',
    purposeLong:
      'True longitudinal nutrition signal — best window for evaluating sustained adherence. Aligns with multi-week to multi-month intervention lengths used in clinical nutrition meta-analyzes. Highest-confidence score for nutrition quality and likely metabolic benefit.',
  },
];

export interface NutritionSubScore {
  /** 0–20 */
  fiber: number;
  /** 0–20 */
  proteinConsistency: number;
  /** 0–20 */
  processedFoodProxy: number;
  /** 0–20 */
  patternAdherence: number;
  /** 0–20 */
  macroBalance: number;
}

export interface NutritionCorrelateResult {
  window: NutritionWindow;
  /** 0–100 composite score */
  score: number;
  /** Qualitative tier */
  tier: 'strong' | 'moderate' | 'developing' | 'insufficient-data';
  /** Sub-dimension scores (each 0–20) */
  subScores: NutritionSubScore;
  /** Number of days in the window that had logged data */
  loggedDays: number;
  /** Total days in the window */
  windowDays: number;
  /** Human-readable interpretation */
  interpretation: string;
  /** The strongest positive signal found */
  topStrength: string | null;
  /** The most actionable area for improvement */
  topOpportunity: string | null;
  /** Average daily values for display */
  averages: {
    calories: number;
    protein_g: number;
    fiber_g: number;
    carbs_g: number;
    fat_g: number;
    glycemic_load: number;
  };
}

// ─── Scoring constants ────────────────────────────────────────────────────────

/** WHO/meta-analytic fiber density target: 14 g per 1000 kcal */
const FIBER_DENSITY_TARGET = 14; // g / 1000 kcal

/** Coefficient of variation threshold for "consistent" protein: CV ≤ 0.25 = full score */
const PROTEIN_CV_GOOD = 0.25;
const PROTEIN_CV_POOR = 0.60;

/** Fiber:carb ratio threshold for "minimally processed" proxy: ≥ 0.10 = full score */
const FIBER_CARB_GOOD = 0.10;
const FIBER_CARB_POOR = 0.03;

/** Glycemic load penalty: daily GL ≥ 20 = high-processed signal */
const GL_HIGH = 20;
const GL_LOW = 8;

/** Minimum logged-days fraction to produce a reliable score */
const MIN_ADHERENCE_FOR_RELIABLE = 0.5;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function stddev(vals: number[], avg: number): number {
  if (vals.length < 2) return 0;
  const variance = vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Linear interpolation: maps value in [lo, hi] to [0, 1] */
function linearScore(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return clamp((v - lo) / (hi - lo), 0, 1);
}

// ─── Sub-dimension scorers (each returns 0–20) ────────────────────────────────

function scoreFiber(days: DailyNutrients[]): number {
  if (!days.length) return 0;
  const densities = days
    .filter(d => d.total_calories_kcal > 100) // ignore near-zero calorie days
    .map(d => (d.fiber_g / d.total_calories_kcal) * 1000);
  if (!densities.length) return 0;
  const avg = mean(densities);
  return Math.round(linearScore(avg, 0, FIBER_DENSITY_TARGET) * 20);
}

function scoreProteinConsistency(days: DailyNutrients[]): number {
  const vals = days.filter(d => d.protein_g > 0).map(d => d.protein_g);
  if (vals.length < 2) return vals.length === 1 ? 10 : 0; // single day = partial credit
  const avg = mean(vals);
  if (avg === 0) return 0;
  const cv = stddev(vals, avg) / avg;
  // Lower CV = better consistency → higher score
  const score = 1 - linearScore(cv, PROTEIN_CV_GOOD, PROTEIN_CV_POOR);
  return Math.round(score * 20);
}

function scoreProcessedFoodProxy(days: DailyNutrients[]): number {
  if (!days.length) return 0;
  const validDays = days.filter(d => d.carbohydrates_g > 5);
  if (!validDays.length) return 0;

  // Fiber:carb ratio component (higher = more whole food)
  const fiberCarbRatios = validDays.map(d => d.fiber_g / d.carbohydrates_g);
  const avgFCR = mean(fiberCarbRatios);
  const fcrScore = linearScore(avgFCR, FIBER_CARB_POOR, FIBER_CARB_GOOD);

  // Glycemic load component (lower = less processed)
  const glDays = validDays.filter(d => d.glycemic_load > 0);
  const glScore = glDays.length
    ? 1 - linearScore(mean(glDays.map(d => d.glycemic_load)), GL_LOW, GL_HIGH)
    : 0.5; // no GL data → neutral

  const combined = glDays.length
    ? (fcrScore * 0.6 + glScore * 0.4)
    : fcrScore;

  return Math.round(combined * 20);
}

function scorePatternAdherence(days: DailyNutrients[], windowDays: number): number {
  const fraction = days.length / windowDays;
  return Math.round(clamp(fraction, 0, 1) * 20);
}

function scoreMacroBalance(days: DailyNutrients[]): number {
  if (!days.length) return 0;
  const validDays = days.filter(d => d.total_calories_kcal > 100);
  if (!validDays.length) return 0;

  let score = 0;
  for (const d of validDays) {
    const cal = d.total_calories_kcal;
    const protPct = (d.protein_g * 4) / cal;
    const fatPct = (d.fats_g * 9) / cal;
    const carbPct = (d.carbohydrates_g * 4) / cal;

    // Protein ≥ 15% kcal
    const protOk = protPct >= 0.15 ? 1 : protPct / 0.15;
    // Fat 25–40% kcal (penalise extremes)
    const fatOk = fatPct >= 0.25 && fatPct <= 0.40 ? 1 : fatPct < 0.25 ? fatPct / 0.25 : 1 - (fatPct - 0.40) / 0.20;
    // Carbs 40–60% kcal
    const carbOk = carbPct >= 0.40 && carbPct <= 0.60 ? 1 : carbPct < 0.40 ? carbPct / 0.40 : 1 - (carbPct - 0.60) / 0.20;

    score += (protOk + clamp(fatOk, 0, 1) + clamp(carbOk, 0, 1)) / 3;
  }

  return Math.round((score / validDays.length) * 20);
}

// ─── Interpretation text ──────────────────────────────────────────────────────

function buildInterpretation(
  tier: NutritionCorrelateResult['tier'],
  window: NutritionWindow,
  sub: NutritionSubScore,
  loggedDays: number,
  windowDays: number,
): string {
  const meta = NUTRITION_WINDOWS.find(w => w.key === window)!;

  if (tier === 'insufficient-data') {
    return `Only ${loggedDays} of ${windowDays} days logged in this window. Log meals consistently to unlock your ${meta.purposeShort.toLowerCase()} score.`;
  }

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (sub.fiber >= 14) strengths.push('strong fiber density');
  else if (sub.fiber < 8) gaps.push('low fiber intake');

  if (sub.proteinConsistency >= 14) strengths.push('consistent protein distribution');
  else if (sub.proteinConsistency < 8) gaps.push('irregular protein intake');

  if (sub.processedFoodProxy >= 14) strengths.push('low ultra-processed food exposure');
  else if (sub.processedFoodProxy < 8) gaps.push('high reliance on ultra-processed foods');

  if (sub.macroBalance >= 14) strengths.push('well-balanced macros');
  else if (sub.macroBalance < 8) gaps.push('macro imbalance');

  const tierText =
    tier === 'strong' ? 'Your nutrition pattern is well-aligned with evidence-backed dietary quality markers.' :
    tier === 'moderate' ? 'Your nutrition pattern shows good adherence with room for improvement.' :
    'Your nutrition pattern is developing — consistency over time will strengthen this score.';

  const strengthText = strengths.length
    ? ` Strengths: ${strengths.join(', ')}.`
    : '';
  const gapText = gaps.length
    ? ` Focus areas: ${gaps.join(', ')}.`
    : '';

  return `${meta.purposeShort} — ${tierText}${strengthText}${gapText}`;
}

function findTopStrength(sub: NutritionSubScore): string | null {
  const entries: [string, number][] = [
    ['Fiber density', sub.fiber],
    ['Protein consistency', sub.proteinConsistency],
    ['Whole-food quality', sub.processedFoodProxy],
    ['Macro balance', sub.macroBalance],
    ['Pattern adherence', sub.patternAdherence],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] >= 14 ? entries[0][0] : null;
}

function findTopOpportunity(sub: NutritionSubScore): string | null {
  const entries: [string, number][] = [
    ['Increase daily fiber intake', sub.fiber],
    ['Distribute protein more evenly across meals', sub.proteinConsistency],
    ['Reduce ultra-processed food exposure', sub.processedFoodProxy],
    ['Log meals more consistently', sub.patternAdherence],
    ['Rebalance macronutrient ratios', sub.macroBalance],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][1] < 14 ? entries[0][0] : null;
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Scores nutrition quality for a given time window.
 *
 * @param allDays   All DailyNutrients entries (from aggregateDailyNutrients)
 * @param window    Which time window to score
 */
export function scoreNutritionWindow(
  allDays: DailyNutrients[],
  window: NutritionWindow,
): NutritionCorrelateResult {
  const meta = NUTRITION_WINDOWS.find(w => w.key === window)!;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - meta.days + 1);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const days = allDays.filter(d => d.date >= cutoffStr);

  const loggedDays = days.length;
  const windowDays = meta.days;

  // Insufficient data guard
  if (loggedDays === 0 || loggedDays / windowDays < MIN_ADHERENCE_FOR_RELIABLE * 0.5) {
    return {
      window,
      score: 0,
      tier: 'insufficient-data',
      subScores: { fiber: 0, proteinConsistency: 0, processedFoodProxy: 0, patternAdherence: 0, macroBalance: 0 },
      loggedDays,
      windowDays,
      interpretation: `No data logged in this window. Start logging meals to see your ${meta.purposeShort.toLowerCase()} score.`,
      topStrength: null,
      topOpportunity: 'Log meals consistently to unlock this score',
      averages: { calories: 0, protein_g: 0, fiber_g: 0, carbs_g: 0, fat_g: 0, glycemic_load: 0 },
    };
  }

  const sub: NutritionSubScore = {
    fiber: scoreFiber(days),
    proteinConsistency: scoreProteinConsistency(days),
    processedFoodProxy: scoreProcessedFoodProxy(days),
    patternAdherence: scorePatternAdherence(days, windowDays),
    macroBalance: scoreMacroBalance(days),
  };

  const score = clamp(
    sub.fiber + sub.proteinConsistency + sub.processedFoodProxy + sub.patternAdherence + sub.macroBalance,
    0,
    100,
  );

  const tier: NutritionCorrelateResult['tier'] =
    score >= 70 ? 'strong' :
    score >= 45 ? 'moderate' :
    'developing';

  const averages = {
    calories: Math.round(mean(days.map(d => d.total_calories_kcal))),
    protein_g: Math.round(mean(days.map(d => d.protein_g)) * 10) / 10,
    fiber_g: Math.round(mean(days.map(d => d.fiber_g)) * 10) / 10,
    carbs_g: Math.round(mean(days.map(d => d.carbohydrates_g)) * 10) / 10,
    fat_g: Math.round(mean(days.map(d => d.fats_g)) * 10) / 10,
    glycemic_load: Math.round(mean(days.map(d => d.glycemic_load)) * 10) / 10,
  };

  return {
    window,
    score,
    tier,
    subScores: sub,
    loggedDays,
    windowDays,
    interpretation: buildInterpretation(tier, window, sub, loggedDays, windowDays),
    topStrength: findTopStrength(sub),
    topOpportunity: findTopOpportunity(sub),
    averages,
  };
}

/**
 * Scores all five time windows at once.
 */
export function scoreAllNutritionWindows(
  allDays: DailyNutrients[],
): Record<NutritionWindow, NutritionCorrelateResult> {
  return {
    '3d':  scoreNutritionWindow(allDays, '3d'),
    '7d':  scoreNutritionWindow(allDays, '7d'),
    '14d': scoreNutritionWindow(allDays, '14d'),
    '30d': scoreNutritionWindow(allDays, '30d'),
    '3mo': scoreNutritionWindow(allDays, '3mo'),
  };
}
