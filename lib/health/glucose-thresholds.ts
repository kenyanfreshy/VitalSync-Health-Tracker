/**
 * Glucose Threshold Configuration
 * Stores user-configurable High / Low alert thresholds and TIR goal for blood glucose.
 * All data is stored locally in AsyncStorage — never sent to any server.
 *
 * Defaults align with ADA 2024 Standards of Care §6.3 (non-pregnant adults):
 *   High: 180 mg/dL (10.0 mmol/L)
 *   Low:  70  mg/dL (3.9  mmol/L)
 *   TIR goal: 70% (≥70% of readings in 70–180 mg/dL range)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const GLUCOSE_THRESHOLD_KEY = '@vsht:glucose_thresholds';

export interface GlucoseThresholdConfig {
  /** Alert threshold for HIGH glucose (mg/dL). Default 180. */
  highMgDl: number;
  /** Alert threshold for LOW glucose (mg/dL). Default 70. */
  lowMgDl: number;
  /** Time-in-Range goal as a percentage (0–100). Default 70. */
  tirGoalPct: number;
  /** Whether high alerts are enabled. */
  alertHigh: boolean;
  /** Whether low alerts are enabled. */
  alertLow: boolean;
  /**
   * Fasting glucose target (mg/dL).
   * ADA 2024 §6.3: <130 mg/dL for most non-pregnant adults.
   */
  fastingTargetMgDl: number;
  /** Whether fasting target guidance is shown. */
  showFastingTarget: boolean;
  /**
   * 2-hour post-meal (postprandial) glucose target (mg/dL).
   * ADA 2024 §6.3: <180 mg/dL at 2 h after meal start.
   */
  postMealTargetMgDl: number;
  /** Whether post-meal target guidance is shown. */
  showPostMealTarget: boolean;
}

export const DEFAULT_GLUCOSE_THRESHOLDS: GlucoseThresholdConfig = {
  highMgDl: 180,
  lowMgDl: 70,
  tirGoalPct: 70,
  alertHigh: true,
  alertLow: true,
  fastingTargetMgDl: 130,
  showFastingTarget: true,
  postMealTargetMgDl: 180,
  showPostMealTarget: true,
};

export async function loadGlucoseThresholds(): Promise<GlucoseThresholdConfig> {
  try {
    const raw = await AsyncStorage.getItem(GLUCOSE_THRESHOLD_KEY);
    if (!raw) return DEFAULT_GLUCOSE_THRESHOLDS;
    return { ...DEFAULT_GLUCOSE_THRESHOLDS, ...JSON.parse(raw) };
  } catch (_unused) {
    return DEFAULT_GLUCOSE_THRESHOLDS;
  }
}

export async function saveGlucoseThresholds(config: GlucoseThresholdConfig): Promise<void> {
  await safeSetItem(GLUCOSE_THRESHOLD_KEY, JSON.stringify(config));
}

/** Classify a reading relative to the user's thresholds. */
export function classifyGlucose(
  mgDl: number,
  thresholds: GlucoseThresholdConfig,
): 'above' | 'in-range' | 'below' {
  if (mgDl > thresholds.highMgDl) return 'above';
  if (mgDl < thresholds.lowMgDl) return 'below';
  return 'in-range';
}

/** Compute Time-in-Range stats for a set of readings. */
export function computeTIR(
  readings: number[],
  thresholds: GlucoseThresholdConfig,
): { abovePct: number; inRangePct: number; belowPct: number; count: number } {
  if (!readings.length) return { abovePct: 0, inRangePct: 0, belowPct: 0, count: 0 };
  let above = 0, inRange = 0, below = 0;
  for (const v of readings) {
    const c = classifyGlucose(v, thresholds);
    if (c === 'above') above++;
    else if (c === 'in-range') inRange++;
    else below++;
  }
  const n = readings.length;
  return {
    abovePct: Math.round((above / n) * 100),
    inRangePct: Math.round((inRange / n) * 100),
    belowPct: Math.round((below / n) * 100),
    count: n,
  };
}
