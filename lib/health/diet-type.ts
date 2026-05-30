/**
 * Diet Type Store & Conflict Detection
 *
 * Persists the user's active dietary protocol and provides a conflict
 * detection engine that compares a food entry's nutrients against the
 * protocol's thresholds.
 *
 * Supported protocols:
 *   keto          — very-low-carb, high-fat ketogenic
 *   dash          — low-sodium, high-potassium
 *   vegan         — plant-based, fiber-rich
 *   mediterranean — MUFA/PUFA-heavy, moderate carbs
 *   diabetic      — low glycemic load, controlled carbs
 *   balanced      — standard 50/30/20 macro split (no conflict warnings)
 *   renal         — low-potassium, low-phosphorus, low-sodium (CKD/dialysis)
 *   custom        — user-defined personalized protocol with custom macro targets
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vitalsync/diet_type_v1';
const CUSTOM_DIET_KEY = '@vitalsync/custom_diet_config_v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DietType =
  | 'keto'
  | 'dash'
  | 'vegan'
  | 'mediterranean'
  | 'diabetic'
  | 'balanced'
  | 'renal'
  | 'custom';

/**
 * User-defined configuration for the "Personalized Diet" protocol.
 * All numeric fields are optional — unset fields are treated as "no limit".
 */
export interface CustomDietConfig {
  /** Display name chosen by the user, e.g. "My Bulking Plan" */
  name: string;
  /** Short description, e.g. "High protein, moderate carbs" */
  description: string;
  /** Daily calorie target (kcal) — informational only */
  caloriesKcal?: number;
  /** Maximum daily net carbohydrates (g) */
  maxCarbsG?: number;
  /** Minimum daily protein (g) */
  minProteinG?: number;
  /** Maximum daily fat (g) */
  maxFatG?: number;
  /** Maximum daily sodium (mg) */
  maxSodiumMg?: number;
  /** Minimum daily potassium (mg) */
  minPotassiumMg?: number;
  /** Accent color chosen by user (hex string) */
  color?: string;
}

export const DEFAULT_CUSTOM_DIET: CustomDietConfig = {
  name: 'My Diet',
  description: 'Personalized nutrition protocol',
  caloriesKcal: 2000,
  maxCarbsG: 200,
  minProteinG: 120,
  maxFatG: 65,
  maxSodiumMg: 2300,
  minPotassiumMg: 3500,
  color: '#EC4899',
};

export interface DietTypeOption {
  value: DietType;
  label: string;
  emoji: string;
  description: string;
  /**
   * Action-oriented subtitle shown on the sodium/diet log card.
   * Describes what the user is tracking for this specific protocol.
   */
  cardSubtitle: string;
  /** Whether this diet uses the Bio-Availability prompt */
  useBioAvailability: boolean;
  /**
   * Hex accent color for this diet protocol.
   * Used by Settings, Record, and any other UI that needs a per-diet tint.
   * Matches the theme palette: keto=#F59E0B, dash=#22C55E, vegan=#4ADE80,
   * mediterranean=#0D9488, diabetic=#60A5FA, balanced=#6366F1, renal=#06B6D4,
   * custom=#EC4899.
   */
  color: string;
  /**
   * True if this protocol has clinical potassium restrictions (renal diet).
   * Used by FoodLookupSheet and DashComplianceCard to show renal-specific UI.
   */
  isRenal?: boolean;
  /**
   * True if this is the user-defined personalized protocol.
   * When true, the Settings UI shows a custom editor instead of a static card.
   */
  isCustom?: boolean;
}

export const DIET_TYPE_OPTIONS: DietTypeOption[] = [
  {
    value: 'balanced',
    label: 'Balanced',
    emoji: '⚖️',
    description: 'Standard 50/30/20 macro split',
    cardSubtitle: 'Compliance ring targets: Carbs 50% · Protein 20% · Fat 30%',
    useBioAvailability: false,
    color: '#6366F1',
  },
  {
    value: 'keto',
    label: 'Ketogenic',
    emoji: '🥑',
    description: 'Very-low-carb, high-fat protocol',
    cardSubtitle: 'Compliance ring targets: Net Carbs ≤5% · Fat 65–75% · Protein 20–30%',
    useBioAvailability: false,
    color: '#F59E0B',
  },
  {
    value: 'dash',
    label: 'Compliance Diet',
    emoji: '🧂',
    description: 'Low-sodium, high-potassium diet',
    cardSubtitle: 'DASH diet targets: Sodium ≤1,500 mg · Potassium ≥4,700 mg',
    useBioAvailability: false,
    color: '#22C55E',
  },
  {
    value: 'diabetic',
    label: 'Diabetic-Friendly',
    emoji: '🩺',
    description: 'Low glycemic load, controlled carbs',
    cardSubtitle: 'Compliance ring targets: Net Carbs ≤45 g/meal · Glycemic Load ≤20',
    useBioAvailability: false,
    color: '#60A5FA',
  },
  {
    value: 'vegan',
    label: 'Vegan',
    emoji: '🌱',
    description: 'Plant-based, fiber-rich protocol',
    cardSubtitle: 'Compliance ring targets: Fiber ≥25 g · Protein ≥50 g · B12 ≥2.4 µg',
    useBioAvailability: true,
    color: '#4ADE80',
  },
  {
    value: 'mediterranean',
    label: 'Mediterranean',
    emoji: '🫒',
    description: 'MUFA/PUFA-rich, moderate carbs',
    cardSubtitle: 'Compliance ring targets: MUFA/PUFA ≥15% · Carbs 40–50% · Sat Fat ≤8 g',
    useBioAvailability: true,
    color: '#22C55E',
  },
  {
    value: 'renal',
    label: 'Renal',
    emoji: '🫘',
    description: 'Low-potassium, low-phosphorus, low-sodium (CKD/dialysis)',
    cardSubtitle: 'Compliance ring targets: Potassium ≤2,000 mg · Phosphorus ≤800 mg · Sodium ≤1,500 mg',
    useBioAvailability: false,
    color: '#06B6D4',
    isRenal: true,
  },
  {
    value: 'custom',
    label: 'Personalized',
    emoji: '✨',
    description: 'Your own custom macro & nutrient targets',
    cardSubtitle: 'Compliance ring targets: your custom macro & nutrient goals',
    useBioAvailability: false,
    color: '#EC4899',
    isCustom: true,
  },
];

// ─── Conflict Thresholds ──────────────────────────────────────────────────────

/**
 * Per-diet thresholds. A conflict is triggered when a single food entry
 * exceeds the threshold for the active protocol.
 */
export interface DietThresholds {
  /** Maximum net carbs (g) per entry before a conflict is raised */
  maxNetCarbsG?: number;
  /** Maximum sodium (mg) per entry before a conflict is raised */
  maxSodiumMg?: number;
  /** Maximum glycemic load per entry */
  maxGlycemicLoad?: number;
  /** Maximum saturated fat (g) per entry (Mediterranean) */
  maxSatFatG?: number;
}

const THRESHOLDS: Record<DietType, DietThresholds> = {
  keto:          { maxNetCarbsG: 10 },
  dash:          { maxSodiumMg: 600 },
  vegan:         {},  // No hard limits — bio-availability scoring only
  mediterranean: { maxSatFatG: 8, maxSodiumMg: 800 },
  diabetic:      { maxNetCarbsG: 45, maxGlycemicLoad: 20 },
  balanced:      {},  // No conflict warnings
  renal:         { maxSodiumMg: 1500 },  // CKD: ≤1,500 mg Na/day (NKF guideline)
  custom:        {},  // Thresholds are derived from CustomDietConfig at runtime
};

// ─── Conflict Result ──────────────────────────────────────────────────────────

export interface DietConflict {
  /** True when at least one threshold is exceeded */
  hasConflict: boolean;
  /** Human-readable description of the conflict */
  message: string;
  /** Estimated score reduction as a percentage (0–100) */
  scoreReductionPct: number;
  /** Diet-specific impact description */
  impactDescription: string;
  /** The field that triggered the conflict */
  triggerField: 'carbs' | 'sodium' | 'glycemicLoad' | 'satFat' | null;
  /** The value that exceeded the threshold */
  triggerValue: number | null;
  /** The threshold that was exceeded */
  threshold: number | null;
}

/**
 * Checks whether a food entry conflicts with the active dietary protocol.
 *
 * @param dietType      The user's active diet protocol
 * @param netCarbsG     Net carbohydrates in grams (carbs − fiber)
 * @param sodiumMg      Sodium in milligrams
 * @param glycemicLoad  Estimated glycemic load (0–100)
 * @param satFatG       Saturated fat in grams (optional)
 * @param customConfig  Custom diet config (required when dietType === 'custom')
 */
export function detectDietConflict(
  dietType: DietType,
  netCarbsG: number | null,
  sodiumMg: number | null,
  glycemicLoad: number | null,
  satFatG: number | null = null,
  customConfig?: CustomDietConfig | null,
): DietConflict {
  const noConflict: DietConflict = {
    hasConflict: false,
    message: '',
    scoreReductionPct: 0,
    impactDescription: '',
    triggerField: null,
    triggerValue: null,
    threshold: null,
  };

  // ── Custom / Personalized diet ────────────────────────────────────────────
  if (dietType === 'custom' && customConfig) {
    // Check carbs
    if (
      customConfig.maxCarbsG !== undefined &&
      netCarbsG !== null &&
      netCarbsG > customConfig.maxCarbsG
    ) {
      const excess = netCarbsG - customConfig.maxCarbsG;
      const reduction = Math.min(Math.round((excess / customConfig.maxCarbsG) * 15), 40);
      return {
        hasConflict: true,
        message: `Net Carbohydrates: ${netCarbsG}g exceeds your personalized carb limit (${customConfig.maxCarbsG}g)`,
        scoreReductionPct: reduction,
        impactDescription: `Consider a lower-carb alternative to stay within your daily target`,
        triggerField: 'carbs',
        triggerValue: netCarbsG,
        threshold: customConfig.maxCarbsG,
      };
    }
    // Check sodium
    if (
      customConfig.maxSodiumMg !== undefined &&
      sodiumMg !== null &&
      sodiumMg > customConfig.maxSodiumMg
    ) {
      const excess = sodiumMg - customConfig.maxSodiumMg;
      const reduction = Math.min(Math.round((excess / customConfig.maxSodiumMg) * 12), 35);
      return {
        hasConflict: true,
        message: `Sodium: ${sodiumMg.toLocaleString()} mg exceeds your personalized sodium limit (${customConfig.maxSodiumMg.toLocaleString()} mg)`,
        scoreReductionPct: reduction,
        impactDescription: `High sodium may impact your personalized nutrition goals`,
        triggerField: 'sodium',
        triggerValue: sodiumMg,
        threshold: customConfig.maxSodiumMg,
      };
    }
    return noConflict;
  }

  const t = THRESHOLDS[dietType];

  // Keto: net carbs threshold
  if (
    dietType === 'keto' &&
    t.maxNetCarbsG !== undefined &&
    netCarbsG !== null &&
    netCarbsG > t.maxNetCarbsG
  ) {
    const excess = netCarbsG - t.maxNetCarbsG;
    const reduction = Math.min(Math.round((excess / t.maxNetCarbsG) * 14.2), 40);
    const ketosisExitMin = Math.round(45 * (netCarbsG / t.maxNetCarbsG));
    return {
      hasConflict: true,
      message: `Net Carbohydrates: ${netCarbsG}g exceeds the Ketosis Threshold (${t.maxNetCarbsG}g)`,
      scoreReductionPct: reduction,
      impactDescription: `Predicted Ketosis Exit in: ~${ketosisExitMin} minutes`,
      triggerField: 'carbs',
      triggerValue: netCarbsG,
      threshold: t.maxNetCarbsG,
    };
  }

  // DASH: sodium threshold
  if (
    dietType === 'dash' &&
    t.maxSodiumMg !== undefined &&
    sodiumMg !== null &&
    sodiumMg > t.maxSodiumMg
  ) {
    const excess = sodiumMg - t.maxSodiumMg;
    const reduction = Math.min(Math.round((excess / t.maxSodiumMg) * 12), 35);
    return {
      hasConflict: true,
      message: `Sodium: ${sodiumMg.toLocaleString()} mg exceeds the Compile Diet Sodium Threshold (${t.maxSodiumMg.toLocaleString()} mg)`,
      scoreReductionPct: reduction,
      impactDescription: `Elevated Na:K ratio risk — consider a high-potassium food to offset`,
      triggerField: 'sodium',
      triggerValue: sodiumMg,
      threshold: t.maxSodiumMg,
    };
  }

  // Diabetic: carbs + glycemic load
  if (dietType === 'diabetic') {
    if (
      t.maxNetCarbsG !== undefined &&
      netCarbsG !== null &&
      netCarbsG > t.maxNetCarbsG
    ) {
      const reduction = Math.min(Math.round(((netCarbsG - t.maxNetCarbsG) / t.maxNetCarbsG) * 18), 40);
      return {
        hasConflict: true,
        message: `Net Carbohydrates: ${netCarbsG}g exceeds the Diabetic Carb Threshold (${t.maxNetCarbsG}g)`,
        scoreReductionPct: reduction,
        impactDescription: `Post-meal glucose spike risk — consider reducing portion or substituting with lower-GL alternatives`,
        triggerField: 'carbs',
        triggerValue: netCarbsG,
        threshold: t.maxNetCarbsG,
      };
    }
    if (
      t.maxGlycemicLoad !== undefined &&
      glycemicLoad !== null &&
      glycemicLoad > t.maxGlycemicLoad
    ) {
      const reduction = Math.min(Math.round(((glycemicLoad - t.maxGlycemicLoad) / t.maxGlycemicLoad) * 15), 30);
      return {
        hasConflict: true,
        message: `Glycemic Load: ${glycemicLoad} exceeds the Diabetic GL Threshold (${t.maxGlycemicLoad})`,
        scoreReductionPct: reduction,
        impactDescription: `High blood glucose impact — monitor post-meal readings`,
        triggerField: 'glycemicLoad',
        triggerValue: glycemicLoad,
        threshold: t.maxGlycemicLoad,
      };
    }
  }

  // Renal: sodium threshold (potassium is handled by FoodLookupSheet using RENAL_POTASSIUM_MAX_MG)
  if (
    dietType === 'renal' &&
    t.maxSodiumMg !== undefined &&
    sodiumMg !== null &&
    sodiumMg > t.maxSodiumMg
  ) {
    const excess = sodiumMg - t.maxSodiumMg;
    const reduction = Math.min(Math.round((excess / t.maxSodiumMg) * 15), 40);
    return {
      hasConflict: true,
      message: `Sodium: ${sodiumMg.toLocaleString()} mg exceeds the Renal Sodium Limit (${t.maxSodiumMg.toLocaleString()} mg)`,
      scoreReductionPct: reduction,
      impactDescription: `High sodium increases fluid retention risk in CKD — consult your care team`,
      triggerField: 'sodium',
      triggerValue: sodiumMg,
      threshold: t.maxSodiumMg,
    };
  }

  // Mediterranean: saturated fat + sodium
  if (dietType === 'mediterranean') {
    if (
      t.maxSatFatG !== undefined &&
      satFatG !== null &&
      satFatG > t.maxSatFatG
    ) {
      const reduction = Math.min(Math.round(((satFatG - t.maxSatFatG) / t.maxSatFatG) * 10), 25);
      return {
        hasConflict: true,
        message: `Saturated Fat: ${satFatG}g exceeds the Mediterranean SFA Threshold (${t.maxSatFatG}g)`,
        scoreReductionPct: reduction,
        impactDescription: `Elevated LDL risk — favour MUFA/PUFA sources (olive oil, fish, avocado)`,
        triggerField: 'satFat',
        triggerValue: satFatG,
        threshold: t.maxSatFatG,
      };
    }
    if (
      t.maxSodiumMg !== undefined &&
      sodiumMg !== null &&
      sodiumMg > t.maxSodiumMg
    ) {
      const reduction = Math.min(Math.round(((sodiumMg - t.maxSodiumMg) / t.maxSodiumMg) * 10), 25);
      return {
        hasConflict: true,
        message: `Sodium: ${sodiumMg.toLocaleString()} mg exceeds the Mediterranean Sodium Threshold (${t.maxSodiumMg.toLocaleString()} mg)`,
        scoreReductionPct: reduction,
        impactDescription: `High sodium conflicts with cardiovascular benefits of Mediterranean diet`,
        triggerField: 'sodium',
        triggerValue: sodiumMg,
        threshold: t.maxSodiumMg,
      };
    }
  }

  return noConflict;
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

export async function loadDietType(): Promise<DietType> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && DIET_TYPE_OPTIONS.some((d) => d.value === raw)) {
      return raw as DietType;
    }
  } catch (_unused) {
    // ignore
  }
  return 'balanced';
}

export async function saveDietType(diet: DietType): Promise<void> {
  await safeSetItem(STORAGE_KEY, diet);
}

// ─── Custom Diet Config helpers ───────────────────────────────────────────────

export async function loadCustomDietConfig(): Promise<CustomDietConfig> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_DIET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CustomDietConfig>;
      return { ...DEFAULT_CUSTOM_DIET, ...parsed };
    }
  } catch (_unused) {
    // ignore
  }
  return { ...DEFAULT_CUSTOM_DIET };
}

export async function saveCustomDietConfig(config: CustomDietConfig): Promise<void> {
  await safeSetItem(CUSTOM_DIET_KEY, JSON.stringify(config));
}
