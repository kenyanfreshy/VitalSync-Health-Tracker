/**
 * A1C Target Personalisation
 *
 * Stores the user's personal A1C target in AsyncStorage.
 * The target is used by ProjectedA1CCard to show a gap indicator
 * and to colour the gauge relative to the personal goal rather than
 * only the clinical category thresholds.
 *
 * ADA-recommended targets (Standards of Care 2024, §6.6):
 *   - General adult with T2D:  < 7.0%
 *   - Tight control (T1D/T2D): < 6.5%
 *   - Older/complex patients:  < 8.0%
 *   - Non-diabetic normal:     < 5.7%
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const A1C_TARGET_KEY = '@vitalsync/a1c_personal_target';

/** Default target — ADA general adult recommendation */
export const DEFAULT_A1C_TARGET = 7.0;

/** Preset target options shown in the settings picker */
export const A1C_TARGET_PRESETS: { label: string; value: number; description: string }[] = [
  { value: 5.7, label: '< 5.7%', description: 'Non-diabetic normal range' },
  { value: 6.0, label: '< 6.0%', description: 'Tight control — discuss with physician' },
  { value: 6.5, label: '< 6.5%', description: 'ADA tight control (T1D/T2D)' },
  { value: 7.0, label: '< 7.0%', description: 'ADA general adult with T2D' },
  { value: 7.5, label: '< 7.5%', description: 'Moderate target' },
  { value: 8.0, label: '< 8.0%', description: 'ADA older/complex patients' },
];

export async function loadA1CTarget(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(A1C_TARGET_KEY);
    if (!raw) return DEFAULT_A1C_TARGET;
    const val = parseFloat(raw);
    return isNaN(val) || val < 4 || val > 14 ? DEFAULT_A1C_TARGET : val;
  } catch (_unused) {
    return DEFAULT_A1C_TARGET;
  }
}

export async function saveA1CTarget(target: number): Promise<void> {
  await safeSetItem(A1C_TARGET_KEY, String(target));
}

/**
 * Computes the gap between the current projected A1C and the personal target.
 * Returns a positive number if above target, negative if below, zero if on target.
 */
export function computeA1CGap(currentA1C: number, target: number): number {
  return Math.round((currentA1C - target) * 10) / 10;
}

/**
 * Returns a human-readable gap label for display in the card header.
 * e.g. "0.3% above your 6.5% target" or "0.2% below your 7.0% target"
 */
export function getA1CGapLabel(currentA1C: number, target: number): string {
  const gap = computeA1CGap(currentA1C, target);
  const absGap = Math.abs(gap);
  if (absGap < 0.05) return `On target (${target}%)`;
  if (gap > 0) return `${absGap}% above your ${target}% target`;
  return `${absGap}% below your ${target}% target`;
}

/**
 * Returns the gauge colour based on the gap between current A1C and personal target.
 * Green = at/below target, Amber = within 0.5% above, Red = more than 0.5% above.
 */
export function getTargetGaugeColor(currentA1C: number, target: number): string {
  const gap = computeA1CGap(currentA1C, target);
  if (gap <= 0) return '#10B981';      // at or below target — green
  if (gap <= 0.5) return '#F59E0B';   // within 0.5% above — amber
  return '#EF4444';                    // more than 0.5% above — red
}
