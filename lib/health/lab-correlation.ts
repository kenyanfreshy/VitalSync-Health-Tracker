/**
 * VitalSync Dynamic Lab Correlation Engine
 *
 * Cross-references abnormal lab values against 24-hour dietary intake
 * from the food log (SodiumRecord) to generate clinical insights.
 *
 * This module provides both a fast local (rule-based) engine and
 * an Smart engine via the server tRPC endpoint.
 */

import type { SodiumRecord } from './types';
import {
  type LabResult,
  type LabCorrelationInsight,
  type LabAnalyteId,
  REFERENCE_RANGES,
  getAnalyteStatus,
} from './lab-types';

// ─── 24h Food Log Aggregation ─────────────────────────────────────────────────

export interface NutrientTotals {
  sodiumMg: number;
  potassiumMg: number;
  carbsG: number;
  sugarG: number;
  fatG: number;
  proteinG: number;
  glycemicLoad: number;
  fiberG: number;
  calories: number;
}

/**
 * Aggregate nutrient totals from food log records within the last 24 hours
 * relative to the lab result's collection timestamp.
 */
export function aggregate24hNutrients(
  sodiumRecords: SodiumRecord[],
  labTimestamp: string,
): NutrientTotals {
  const labTime = new Date(labTimestamp).getTime();
  const cutoff = labTime - 24 * 60 * 60 * 1000;

  const totals: NutrientTotals = {
    sodiumMg: 0,
    potassiumMg: 0,
    carbsG: 0,
    sugarG: 0,
    fatG: 0,
    proteinG: 0,
    glycemicLoad: 0,
    fiberG: 0,
    calories: 0,
  };

  for (const record of sodiumRecords) {
    const t = new Date(record.timestamp).getTime();
    if (t < cutoff || t > labTime) continue;

    totals.sodiumMg += record.sodiumMg ?? 0;
    totals.potassiumMg += record.potassiumMg ?? 0;
    totals.carbsG += record.carbsG ?? 0;
    totals.sugarG += record.sugarG ?? 0;
    totals.fatG += record.fatG ?? 0;
    totals.proteinG += record.proteinG ?? 0;
    totals.glycemicLoad += record.glycemicLoad ?? 0;
    totals.fiberG += record.fiberG ?? 0;
    totals.calories += record.calories ?? 0;
  }

  return totals;
}

// ─── Field → Nutrient Total Mapping ──────────────────────────────────────────

const FIELD_TO_TOTAL: Record<string, keyof NutrientTotals> = {
  sodiumMg: 'sodiumMg',
  potassiumMg: 'potassiumMg',
  carbsG: 'carbsG',
  sugarG: 'sugarG',
  fatG: 'fatG',
  proteinG: 'proteinG',
  glycemicLoad: 'glycemicLoad',
  fiberG: 'fiberG',
  calories: 'calories',
};

// ─── Severity Calculator ──────────────────────────────────────────────────────

function calcSeverity(
  analyteId: LabAnalyteId,
  value: number,
  status: 'low' | 'high',
): 'info' | 'warning' | 'critical' {
  const ref = REFERENCE_RANGES[analyteId];
  if (!ref) return 'info';

  const deviation = status === 'high'
    ? (value - ref.high) / (ref.high || 1)
    : (ref.low - value) / (ref.low || 1);

  if (deviation < 0.1) return 'info';
  if (deviation < 0.3) return 'warning';
  return 'critical';
}

// ─── Local Correlation Engine ─────────────────────────────────────────────────

/**
 * Generate correlation insights locally using the rule-based engine.
 * This runs synchronously and requires no network call.
 */
export function generateLocalCorrelationInsights(
  labResult: LabResult,
  sodiumRecords: SodiumRecord[],
): LabCorrelationInsight[] {
  const totals = aggregate24hNutrients(sodiumRecords, labResult.timestamp);
  const insights: LabCorrelationInsight[] = [];

  for (const [analyteIdStr, value] of Object.entries(labResult.values)) {
    const analyteId = analyteIdStr as LabAnalyteId;
    if (typeof value !== 'number') continue;

    const ref = REFERENCE_RANGES[analyteId];
    if (!ref) continue;

    const status = getAnalyteStatus(analyteId, value);
    if (status === 'normal') continue;

    const correlates = ref.dietaryCorrelates ?? [];

    for (const correlate of correlates) {
      // Only fire if the direction matches the lab status
      if (correlate.direction !== status) continue;

      const totalKey = FIELD_TO_TOTAL[correlate.field];
      if (!totalKey) continue;

      const intake = totals[totalKey];

      // Only fire if intake exceeds the threshold (for 'high') or is below (for 'low')
      const triggered = correlate.direction === 'high'
        ? intake > correlate.threshold
        : intake < correlate.threshold;

      if (!triggered) continue;

      const insightText = correlate.insightTemplate
        .replace('{value}', intake.toFixed(0))
        .replace('{threshold}', correlate.threshold.toFixed(0));

      insights.push({
        analyte: analyteId,
        analyteLabel: ref.label,
        labValue: value,
        unit: ref.unit,
        status,
        nutrient: correlate.nutrient,
        intake24h: Math.round(intake),
        intakeUnit: correlate.unit,
        threshold: correlate.threshold,
        direction: correlate.direction,
        insight: insightText,
        severity: calcSeverity(analyteId, value, status),
      });
    }
  }

  // Deduplicate: keep the highest-severity insight per analyte
  const byAnalyte = new Map<string, LabCorrelationInsight>();
  const severityRank = { critical: 3, warning: 2, info: 1 };
  for (const insight of insights) {
    const existing = byAnalyte.get(insight.analyte);
    if (!existing || severityRank[insight.severity] > severityRank[existing.severity]) {
      byAnalyte.set(insight.analyte, insight);
    }
  }

  return Array.from(byAnalyte.values()).sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity]
  );
}

// ─── Has Food Log Data ────────────────────────────────────────────────────────

/**
 * Returns true if there is at least one food log record within 24h of the lab timestamp.
 */
export function has24hFoodLog(
  sodiumRecords: SodiumRecord[],
  labTimestamp: string,
): boolean {
  const labTime = new Date(labTimestamp).getTime();
  const cutoff = labTime - 24 * 60 * 60 * 1000;
  return sodiumRecords.some(r => {
    const t = new Date(r.timestamp).getTime();
    return t >= cutoff && t <= labTime;
  });
}
