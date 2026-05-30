/**
 * Condition Severity
 *
 * Computes a colour-coded severity level (Mild / Moderate / Severe) for a
 * Medical History condition based on the most recent lab values that are linked
 * to that condition.
 *
 * Algorithm:
 *  - Gather all LabResult records whose `linkedConditionId` matches the condition.
 *  - From the most recent result, count how many analytes are outside their
 *    reference range (i.e. status !== 'normal').
 *  - Map the abnormal count to a severity tier:
 *      0 abnormal  → no badge (returns null)
 *      1 abnormal  → Mild
 *      2 abnormal  → Moderate
 *      3+ abnormal → Severe
 *
 * The severity is intentionally conservative — it is a quick at-a-glance
 * indicator only, not a clinical diagnosis.
 */

import { LabResult, getAnalyteStatus } from './lab-types';
export type ConditionSeverity = 'mild' | 'moderate' | 'severe';

export interface ConditionSeverityResult {
  severity: ConditionSeverity;
  abnormalCount: number;
  totalAnalytes: number;
  /** ISO timestamp of the most recent linked lab result */
  latestLabTimestamp: string;
}

/** Colour tokens for each severity level */
export const SEVERITY_COLORS: Record<ConditionSeverity, { bg: string; text: string; border: string }> = {
  mild:     { bg: '#F59E0B20', text: '#D97706', border: '#F59E0B50' },
  moderate: { bg: '#EF444420', text: '#DC2626', border: '#EF444450' },
  severe:   { bg: '#7C3AED20', text: '#6D28D9', border: '#7C3AED50' },
};

/** Human-readable label for each severity level */
export const SEVERITY_LABELS: Record<ConditionSeverity, string> = {
  mild:     'Mild',
  moderate: 'Moderate',
  severe:   'Severe',
};

/**
 * Compute the severity of a condition based on its linked lab results.
 *
 * @param conditionId  The MedicalHistoryRecord.id to check
 * @param allLabResults  All LabResult records from health state
 * @returns  A ConditionSeverityResult, or null if no linked labs or all normal
 */
export function computeConditionSeverity(
  conditionId: string,
  allLabResults: LabResult[],
): ConditionSeverityResult | null {
  // Filter to results linked to this condition
  const linked = allLabResults.filter(r => r.linkedConditionId === conditionId);
  if (linked.length === 0) return null;

  // Use the most recent result
  const latest = linked.reduce((best, r) =>
    new Date(r.timestamp).getTime() > new Date(best.timestamp).getTime() ? r : best,
  );

  const analyteEntries = Object.entries(latest.values).filter(
    ([, v]) => typeof v === 'number',
  ) as [string, number][];

  if (analyteEntries.length === 0) return null;

  const abnormalCount = analyteEntries.filter(([key, value]) => {
    const status = getAnalyteStatus(key as any, value);
    return status !== 'normal';
  }).length;

  if (abnormalCount === 0) return null;

  const severity: ConditionSeverity =
    abnormalCount >= 3 ? 'severe' :
    abnormalCount === 2 ? 'moderate' :
    'mild';

  return {
    severity,
    abnormalCount,
    totalAnalytes: analyteEntries.length,
    latestLabTimestamp: latest.timestamp,
  };
}
