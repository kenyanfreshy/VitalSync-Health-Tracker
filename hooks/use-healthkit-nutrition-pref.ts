/**
 * useHealthKitNutritionPref
 *
 * Persists the user's last HealthKit nutrition write choice to AsyncStorage
 * so repeat users don't have to decide every meal.
 *
 * Values:
 *   'save'    — user previously tapped "Save to Apple Health"
 *   'skip'    — user previously tapped "Skip"
 *   null      — first time, no preference stored yet
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export type HKNutritionPref = 'save' | 'skip' | null;

const STORAGE_KEY = 'hk_nutrition_pref';

export function useHealthKitNutritionPref() {
  const [pref, setPref] = useState<HKNutritionPref>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'save' || v === 'skip') setPref(v);
      })
      .catch(() => {/* ignore read errors */})
      .finally(() => setLoaded(true));
  }, []);

  const savePref = useCallback((choice: 'save' | 'skip') => {
    setPref(choice);
    safeSetItem(STORAGE_KEY, choice).catch(() => {/* ignore write errors */});
  }, []);

  return { pref, loaded, savePref };
}
