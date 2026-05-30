import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export const WEIGHT_GOAL_KEY = '@vsht:weight_goal_lbs';

/**
 * Persists a personal weight goal (in lbs) to AsyncStorage.
 * Returns null when no goal has been set.
 */
export function useWeightGoal() {
  const [goal, setGoalState] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(WEIGHT_GOAL_KEY)
      .then((v) => { if (v !== null) setGoalState(parseFloat(v)); })
      .catch(() => {});
  }, []);

  const setGoal = useCallback(async (value: number | null) => {
    setGoalState(value);
    if (value === null) {
      await AsyncStorage.removeItem(WEIGHT_GOAL_KEY).catch(() => {});
    } else {
      await safeSetItem(WEIGHT_GOAL_KEY, String(value)).catch(() => {});
    }
  }, []);

  return { goal, setGoal };
}
