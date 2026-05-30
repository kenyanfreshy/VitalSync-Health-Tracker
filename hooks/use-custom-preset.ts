import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { safeSetItem } from '@/lib/safe-async-storage';

const KEY = '@vitalsync/custom_macro_preset';

export interface CustomPreset {
  name: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

const DEFAULT: CustomPreset = {
  name: 'My Plan',
  calories: 2000,
  carbs: 250,
  protein: 100,
  fat: 65,
};

export function useCustomPreset() {
  const [preset, setPreset] = useState<CustomPreset>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((val) => {
      if (val) {
        try { setPreset(JSON.parse(val)); } catch (_) {}
      }
      setLoaded(true);
    });
  }, []);

  const save = useCallback(async (next: CustomPreset) => {
    setPreset(next);
    await safeSetItem(KEY, JSON.stringify(next));
  }, []);

  return { preset, loaded, save };
}
