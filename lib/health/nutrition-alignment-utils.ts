/**
 * nutrition-alignment-utils.ts
 *
 * Pure utility functions and constants for the Nutrition Alignment Engine.
 * These are extracted from use-nutrition-alignment.ts so they can be
 * imported in both the hook (React context) and unit tests (Node environment)
 * without pulling in React or health context dependencies.
 */

import type { SodiumRecord } from './types';

// ─── Source display metadata ──────────────────────────────────────────────────

export type NutritionSource = SodiumRecord['source'];

export const SOURCE_META: Record<NutritionSource, { label: string; emoji: string; color: string }> = {
  'manual':       { label: 'Manual Entry',        emoji: '✏️',  color: '#6B7280' },
  'ai-photo':     { label: 'Smart Photo Scan',        emoji: '📷',  color: '#8B5CF6' },
  'barcode-scan': { label: 'Barcode Scan',         emoji: '📦',  color: '#3B82F6' },
  'recipe':       { label: 'Bio-Aligned Recipe',   emoji: '🌿',  color: '#22C55E' },
  'ai-hub':       { label: 'Smart Intake',      emoji: '🤖',  color: '#0EA5E9' },
  'diet-log':     { label: 'Diet Log',             emoji: '📋',  color: '#F59E0B' },
};

// ─── Blood sugar impact ───────────────────────────────────────────────────────

export type BloodSugarImpact = 'low' | 'moderate' | 'high';

export interface BloodSugarImpactInfo {
  level: BloodSugarImpact;
  label: string;
  color: string;
  description: string;
  glycemicLoad: number;
}

/**
 * Classifies a total daily glycemic load into Low / Moderate / High blood sugar impact.
 *
 * Thresholds based on Harvard School of Public Health GL classification:
 *  - Low:      GL < 10
 *  - Moderate: GL 10–19
 *  - High:     GL ≥ 20
 */
export function classifyGlycemicLoad(gl: number): BloodSugarImpactInfo {
  if (gl < 10) {
    return {
      level: 'low',
      label: 'Low Impact',
      color: '#22C55E',
      description: 'Minimal blood sugar response expected',
      glycemicLoad: gl,
    };
  }
  if (gl < 20) {
    return {
      level: 'moderate',
      label: 'Moderate Impact',
      color: '#F59E0B',
      description: 'Moderate blood sugar response — monitor if diabetic',
      glycemicLoad: gl,
    };
  }
  return {
    level: 'high',
    label: 'High Impact',
    color: '#EF4444',
    description: 'High glycemic load — consider lower-GL alternatives',
    glycemicLoad: gl,
  };
}

// ─── Dedup helper ─────────────────────────────────────────────────────────────

/**
 * Detects duplicate entries: same foodDescription logged within 60 seconds.
 * Returns a Set of IDs to suppress (keeps the first occurrence).
 */
export function detectDuplicates(records: SodiumRecord[]): Set<string> {
  const seen = new Map<string, string>(); // key → first id
  const dupes = new Set<string>();
  for (const r of records) {
    if (!r.foodDescription) continue;
    const key = r.foodDescription.toLowerCase().trim();
    const existing = seen.get(key);
    if (existing) {
      const existingRecord = records.find(x => x.id === existing);
      if (existingRecord) {
        const existingTs = new Date(existingRecord.timestamp).getTime();
        const ts = new Date(r.timestamp).getTime();
        if (Math.abs(ts - existingTs) < 60_000) {
          dupes.add(r.id);
          continue;
        }
      }
    }
    seen.set(key, r.id);
  }
  return dupes;
}
