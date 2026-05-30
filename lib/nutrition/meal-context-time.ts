import type { SodiumMealContext } from '@/lib/health/types';

/**
 * Returns the most appropriate meal context based on the current hour (local time).
 *
 * Time windows:
 *   05:00–10:59  → breakfast
 *   11:00–13:59  → lunch
 *   14:00–16:59  → snack
 *   17:00–21:59  → dinner
 *   22:00–04:59  → snack (late night / early morning)
 *
 * @param date  Optional Date to use instead of `new Date()` (useful for testing).
 */
export function getMealContextForTime(date: Date = new Date()): SodiumMealContext {
  const h = date.getHours();
  if (h >= 5  && h < 11) return 'breakfast';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 14 && h < 17) return 'snack';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack'; // late night / early morning
}
