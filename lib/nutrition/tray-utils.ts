/**
 * Tray utilities for the multi-food selection feature in AiFoodCameraSheet.
 *
 * Extracted to a standalone module so pure logic can be unit-tested
 * without importing React Native / JSX.
 */

export interface TraySearchResult {
  id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
}

export type ServingStep = 0.5 | 1 | 1.5 | 2;

export interface TrayItem {
  result: TraySearchResult;
  servingMult: ServingStep;
}

type MacroField = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sodium_mg';

/**
 * Sum a numeric macro field across all tray items, applying each item's
 * serving multiplier. Returns a rounded integer.
 */
export function sumTrayMacro(items: TrayItem[], field: MacroField): number {
  return Math.round(
    items.reduce((acc, item) => acc + (item.result[field] ?? 0) * item.servingMult, 0),
  );
}

/**
 * Toggle an item in/out of the tray.
 * - If the item is already present, it is removed.
 * - If the item is new, it is added with servingMult = 1.
 */
export function toggleTrayItem(tray: TrayItem[], item: TraySearchResult): TrayItem[] {
  const exists = tray.some(t => t.result.id === item.id);
  if (exists) return tray.filter(t => t.result.id !== item.id);
  return [...tray, { result: item, servingMult: 1 }];
}

/**
 * Update the serving multiplier for a single tray item by id.
 * Returns a new array (immutable update).
 */
export function updateTrayServing(tray: TrayItem[], id: string, mult: ServingStep): TrayItem[] {
  return tray.map(t => t.result.id === id ? { ...t, servingMult: mult } : t);
}
