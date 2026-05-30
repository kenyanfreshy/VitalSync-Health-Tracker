/**
 * useDietType
 *
 * Thin wrapper around the global HealthContext that exposes the active
 * dietary protocol and a setter.
 *
 * Previously this hook managed its own AsyncStorage state independently of
 * the health context, which meant that a diet change in the Diet Profile
 * settings screen was NOT reflected on the Dashboard or other screens until
 * the app was restarted.
 *
 * Now it delegates entirely to useHealth(), making the health context the
 * single source of truth. Any call to setDietType() — from Settings, from
 * the Diet Profile screen, from the sodium log screen, or from anywhere else
 * — immediately updates every consumer that calls useDietType() or useHealth().
 */

import { useHealth } from '@/lib/health/health-context';
import type { DietType } from '@/lib/health/diet-type';

export function useDietType() {
  const { dietType, setDietType } = useHealth();

  // Wrap setDietType so callers that pass a plain string (not awaited) still work.
  // The health context's setDietType already persists to AsyncStorage.
  const setDietTypeCompat = (next: DietType | string) => {
    return setDietType(next as DietType);
  };

  return {
    dietType,
    loading: false,          // health context loads synchronously from its own state
    setDietType: setDietTypeCompat,
  };
}
