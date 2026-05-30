/**
 * Sugar Budget — user-configurable daily free-sugar target.
 *
 * Default: 25 g/day (WHO recommendation for free sugars, 2015).
 * Users can override this in Settings > Nutrition to reflect their
 * personal clinical target (e.g. 15 g/day for a diabetic protocol).
 *
 * Storage key: @vitalsync/sugar_budget_g
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const SUGAR_BUDGET_KEY = '@vitalsync/sugar_budget_g';

/** WHO default free-sugar limit (g/day) */
export const WHO_SUGAR_DEFAULT_G = 25;

/** Minimum allowed budget (g) */
export const SUGAR_BUDGET_MIN_G = 5;

/** Maximum allowed budget (g) */
export const SUGAR_BUDGET_MAX_G = 200;

/**
 * Load the user's daily sugar budget from AsyncStorage.
 * Returns WHO_SUGAR_DEFAULT_G if not set.
 */
export async function loadSugarBudget(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SUGAR_BUDGET_KEY);
    if (raw == null) return WHO_SUGAR_DEFAULT_G;
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < SUGAR_BUDGET_MIN_G) return WHO_SUGAR_DEFAULT_G;
    return Math.min(parsed, SUGAR_BUDGET_MAX_G);
  } catch (_unused) {
    return WHO_SUGAR_DEFAULT_G;
  }
}

/**
 * Persist the user's daily sugar budget.
 * Clamps to [SUGAR_BUDGET_MIN_G, SUGAR_BUDGET_MAX_G].
 */
export async function saveSugarBudget(grams: number): Promise<void> {
  const clamped = Math.max(SUGAR_BUDGET_MIN_G, Math.min(SUGAR_BUDGET_MAX_G, grams));
  await safeSetItem(SUGAR_BUDGET_KEY, String(clamped));
}
