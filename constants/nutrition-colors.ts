/**
 * Premium Nutrition Color System
 *
 * Semantic mapping for the five macronutrient tiles and chart series:
 *   protein   → Green  (#22C55E)  — muscle, recovery
 *   carbs     → Amber  (#F59E0B)  — energy, glucose
 *   fat       → Blue   (#3B82F6)  — sustained energy, satiety
 *   calories  → Violet (#8B5CF6)  — total intake
 *   fiber     → Yellow (#EAB308)  — digestive health
 *
 * Blood sugar is NOT part of the macro palette — it uses its own
 * dedicated constant `bloodSugarColor` below (blood-red #DC2626).
 */

// ─── Primary (full-saturation, light-mode default) ───────────────────────────
export const nutritionColors = {
  protein:  '#22C55E',  // green-500  — muscle, recovery
  carbs:    '#F59E0B',  // amber-500  — energy, glucose
  fat:      '#3B82F6',  // blue-500   — sustained energy
  calories: '#8B5CF6',  // violet-500 — total intake
  fiber:    '#EAB308',  // yellow-500 — digestive health
} as const;

// ─── Soft / translucent (card backgrounds, badge fills, tile tints) ──────────
export const nutritionColorsSoft = {
  protein:  'rgba(34,197,94,0.15)',
  carbs:    'rgba(245,158,11,0.15)',
  fat:      'rgba(59,130,246,0.15)',
  calories: 'rgba(139,92,246,0.15)',
  fiber:    'rgba(234,179,8,0.15)',
} as const;

// ─── Dark-mode adjusted (deeper tones for dark glassmorphism surfaces) ────────
export const nutritionColorsDark = {
  protein:  '#16A34A',  // green-600
  carbs:    '#D97706',  // amber-600
  fat:      '#1D4ED8',  // blue-700
  calories: '#6D28D9',  // violet-700
  fiber:    '#CA8A04',  // yellow-600
} as const;

// ─── Glow variants (SVG neon glow effects in NutritionChart) ─────────────────
export const nutritionColorsGlow = {
  protein:  'rgba(34,197,94,0.53)',
  carbs:    'rgba(245,158,11,0.53)',
  fat:      'rgba(59,130,246,0.53)',
  calories: 'rgba(139,92,246,0.53)',
  fiber:    'rgba(234,179,8,0.53)',
} as const;

// ─── Blood sugar — separate from the macro palette ───────────────────────────
/** Fixed blood-red used for the Blood Sugar tile, chart line, and legend. */
export const bloodSugarColor     = '#DC2626';           // red-600  — colour of blood
export const bloodSugarColorSoft = 'rgba(220,38,38,0.15)';
export const bloodSugarColorGlow = 'rgba(220,38,38,0.53)';
export const bloodSugarColorDark = '#B91C1C';           // red-700  — dark mode

// ─── Type helpers ─────────────────────────────────────────────────────────────
export type NutritionColorKey = keyof typeof nutritionColors;

/**
 * Returns the primary color for a given nutrition key.
 * Falls back to a neutral grey if the key is not recognised.
 */
export function getNutritionColor(key: string): string {
  return (nutritionColors as Record<string, string>)[key] ?? '#94A3B8';
}

export function getNutritionColorSoft(key: string): string {
  return (nutritionColorsSoft as Record<string, string>)[key] ?? 'rgba(148,163,184,0.15)';
}

export function getNutritionColorGlow(key: string): string {
  return (nutritionColorsGlow as Record<string, string>)[key] ?? 'rgba(148,163,184,0.53)';
}

export function getNutritionColorDark(key: string): string {
  return (nutritionColorsDark as Record<string, string>)[key] ?? '#64748B';
}

// ─── Legacy alias kept for backwards-compat (prefer bloodSugarColor) ─────────
/** @deprecated Use `bloodSugarColor` directly. */
export const bloodSugarColors = {
  normal:   bloodSugarColor,
  elevated: '#F59E0B',  // amber-500
  high:     '#EF4444',  // red-500
  unknown:  '#94A3B8',  // slate-400
} as const;

/**
 * Returns the clinical status color for a blood sugar reading.
 * Note: the tile and chart always use the fixed `bloodSugarColor`;
 * this helper is only for clinical status badges/labels.
 */
export function getBloodSugarColor(mgDl: number | null): string {
  if (mgDl === null) return bloodSugarColors.unknown;
  if (mgDl < 100)   return bloodSugarColors.normal;
  if (mgDl < 126)   return bloodSugarColors.elevated;
  return bloodSugarColors.high;
}
