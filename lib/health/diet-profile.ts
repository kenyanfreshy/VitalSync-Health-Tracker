/**
 * DietProfile — per-diet compliance targets for the DASH compliance ring.
 *
 * Each diet type defines its own thresholds for sodium, potassium,
 * carbohydrates, and protein (per kg body weight).
 *
 * Clinical references:
 *   DASH:      NHLBI DASH Eating Plan (2021)
 *   Renal:     KDOQI Nutrition Guidelines (2020)
 *   Ketogenic: Epilepsy Foundation / AHA Low-Carb guidance
 *   Low Carb:  ADA Standards of Medical Care in Diabetes (2023)
 *   Standard:  2020–2025 Dietary Guidelines for Americans
 */

export type DietType = 'standard' | 'dash' | 'renal' | 'ketogenic' | 'low_carb' | 'vegan' | 'mediterranean' | 'balanced' | 'keto' | 'diabetic' | 'custom';

export interface DietTargets {
  /** Maximum daily sodium in mg (lower is stricter) */
  sodiumMaxMg: number;
  /** Minimum daily potassium in mg (null = not tracked for this diet) */
  potassiumMinMg: number | null;
  /** Maximum daily carbohydrates in grams (null = not tracked) */
  carbsMaxG: number | null;
  /** Maximum daily protein in g/kg body weight (null = not tracked) */
  proteinMaxGPerKg: number | null;
  /** Human-readable label */
  label: string;
  /** Short description shown in the UI */
  description: string;
  /** Accent color for this diet type */
  color: string;
  /** Emoji icon */
  emoji: string;
}

export const DIET_TARGETS: Record<DietType, DietTargets> = {
  standard: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 2600,
    carbsMaxG: null,
    proteinMaxGPerKg: null,
    label: 'Standard',
    description: '2020–2025 Dietary Guidelines',
    color: '#64748B',
    emoji: '🍽️',
  },
  dash: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: null,
    proteinMaxGPerKg: null,
    label: 'DASH Diet',
    description: 'Na < 2,300 mg · K ≥ 3,500 mg',
    color: '#10B981',
    emoji: '🥗',
  },
  renal: {
    sodiumMaxMg: 2000,
    potassiumMinMg: null,   // Renal patients limit potassium
    carbsMaxG: null,
    proteinMaxGPerKg: 0.8,
    label: 'Renal',
    description: 'Na < 2,000 mg · K < 2,000 mg · Protein < 0.8 g/kg',
    color: '#06B6D4',
    emoji: '🫘',
  },
  ketogenic: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,   // Keto can deplete electrolytes
    carbsMaxG: 20,
    proteinMaxGPerKg: null,
    label: 'Ketogenic',
    description: 'Carbs < 20 g · K ≥ 3,500 mg',
    color: '#F59E0B',
    emoji: '🥑',
  },
  low_carb: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: 50,
    proteinMaxGPerKg: null,
    label: 'Low Carb',
    description: 'Carbs < 50 g · K ≥ 3,500 mg',
    color: '#8B5CF6',
    emoji: '🥩',
  },
  vegan: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: null,
    proteinMaxGPerKg: null,
    label: 'Vegan',
    description: 'Na < 2,300 mg · K ≥ 3,500 mg · Plant-based',
    color: '#4ADE80',
    emoji: '🌱',
  },
  mediterranean: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: null,
    proteinMaxGPerKg: null,
    label: 'Mediterranean',
    description: 'Na < 2,300 mg · K ≥ 3,500 mg · MUFA/PUFA-rich',
    color: '#22C55E',
    emoji: '🫒',
  },
  balanced: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 2600,
    carbsMaxG: null,
    proteinMaxGPerKg: null,
    label: 'Balanced',
    description: 'Na < 2,300 mg · K ≥ 2,600 mg · 50/30/20 macros',
    color: '#6366F1',
    emoji: '🍽️',
  },
  // Aliases for diet-type.ts values that map to the same targets
  keto: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: 20,
    proteinMaxGPerKg: null,
    label: 'Ketogenic',
    description: 'Carbs < 20 g · K ≥ 3,500 mg',
    color: '#F59E0B',
    emoji: '🥑',
  },
  diabetic: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: 50,
    proteinMaxGPerKg: null,
    label: 'Diabetic',
    description: 'Carbs < 50 g · K ≥ 3,500 mg · ADA 2023',
    color: '#60A5FA',
    emoji: '💉',
  },
  // Personalized diet — targets are user-defined; defaults used as fallback
  custom: {
    sodiumMaxMg: 2300,
    potassiumMinMg: 3500,
    carbsMaxG: 200,
    proteinMaxGPerKg: null,
    label: 'Personalized',
    description: 'User-defined macro & nutrient targets',
    color: '#EC4899',
    emoji: '✨',
  },
};

export const DIET_TYPE_OPTIONS: { value: DietType; label: string; emoji: string; color: string; cardSubtitle: string }[] = [
  { value: 'standard',     label: 'Standard',     emoji: '🍽️', color: '#64748B', cardSubtitle: 'Track macros & caloric balance across all food groups' },
  { value: 'dash',         label: 'DASH Diet',    emoji: '🥗', color: '#10B981', cardSubtitle: 'Track dietary sodium & potassium for DASH Diet analysis' },
  { value: 'renal',        label: 'Renal',        emoji: '🫘', color: '#06B6D4', cardSubtitle: 'Track potassium, phosphorus & fluid intake for renal health' },
  { value: 'ketogenic',    label: 'Ketogenic',    emoji: '🥑', color: '#F59E0B', cardSubtitle: 'Track net carbs & fat intake to maintain ketosis' },
  { value: 'low_carb',     label: 'Low Carb',     emoji: '🥩', color: '#8B5CF6', cardSubtitle: 'Track carbohydrate intake to stay within low-carb targets' },
  { value: 'vegan',        label: 'Vegan',        emoji: '🌱', color: '#4ADE80', cardSubtitle: 'Plant-based protocol with sodium & potassium targets' },
  { value: 'mediterranean',label: 'Mediterranean',emoji: '🫒', color: '#22C55E', cardSubtitle: 'MUFA/PUFA-rich protocol with electrolyte targets' },
  { value: 'balanced',     label: 'Balanced',     emoji: '🍽️', color: '#6366F1', cardSubtitle: 'Standard 50/30/20 macro split with sodium limits' },
];

/**
 * Renal diet potassium MAXIMUM (patients must stay BELOW this).
 * Separate from the standard minimum because for renal patients,
 * high potassium is dangerous (hyperkalemia risk).
 */
export const RENAL_POTASSIUM_MAX_MG = 2000;

/**
 * Compute a compliance score (0–100) for a single day's nutrition log
 * against a given diet profile.
 *
 * @param sodiumMg    Total sodium consumed today
 * @param potassiumMg Total potassium consumed today (0 if not logged)
 * @param carbsG      Total carbohydrates consumed today (0 if not logged)
 * @param proteinG    Total protein consumed today (0 if not logged)
 * @param weightKg    User's body weight in kg (for protein g/kg calculation)
 * @param dietType    The active diet type
 * @returns           Object with points earned, max points, and per-criterion results
 */
export function computeDayCompliance(
  sodiumMg: number,
  potassiumMg: number,
  carbsG: number,
  proteinG: number,
  weightKg: number | null,
  dietType: DietType,
): {
  points: number;
  maxPoints: number;
  naOk: boolean;
  kOk: boolean | null;
  carbsOk: boolean | null;
  proteinOk: boolean | null;
} {
  const targets = DIET_TARGETS[dietType];
  let points = 0;
  let maxPoints = 0;

  // ── Sodium ──────────────────────────────────────────────────────────────────
  const naOk = sodiumMg <= targets.sodiumMaxMg;
  if (naOk) points++;
  maxPoints++;

  // ── Potassium ────────────────────────────────────────────────────────────────
  let kOk: boolean | null = null;
  if (dietType === 'renal') {
    // Renal: potassium must be BELOW max (hyperkalemia risk)
    if (potassiumMg > 0) {
      kOk = potassiumMg <= RENAL_POTASSIUM_MAX_MG;
      if (kOk) points++;
      maxPoints++;
    }
  } else if (targets.potassiumMinMg !== null && potassiumMg > 0) {
    kOk = potassiumMg >= targets.potassiumMinMg;
    if (kOk) points++;
    maxPoints++;
  }

  // ── Carbohydrates ────────────────────────────────────────────────────────────
  let carbsOk: boolean | null = null;
  if (targets.carbsMaxG !== null && carbsG > 0) {
    carbsOk = carbsG <= targets.carbsMaxG;
    if (carbsOk) points++;
    maxPoints++;
  }

  // ── Protein (g/kg) ───────────────────────────────────────────────────────────
  let proteinOk: boolean | null = null;
  if (targets.proteinMaxGPerKg !== null && proteinG > 0 && weightKg && weightKg > 0) {
    const maxProteinG = targets.proteinMaxGPerKg * weightKg;
    proteinOk = proteinG <= maxProteinG;
    if (proteinOk) points++;
    maxPoints++;
  }

  return { points, maxPoints, naOk, kOk, carbsOk, proteinOk };
}
