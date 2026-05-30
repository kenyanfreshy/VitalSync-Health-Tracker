/**
 * useSleepGoal — persists the user's personal sleep duration goal (in hours)
 * to AsyncStorage. Defaults to 8 hrs (evidence-based recommendation for adults).
 *
 * Usage:
 *   const { goal, setGoal } = useSleepGoal();
 *   // goal: number (e.g. 8.0)
 *   // setGoal(7.5) → persists and updates state
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const SLEEP_GOAL_KEY = '@vsht:sleep_goal_hrs';
export const DEFAULT_SLEEP_GOAL_HRS = 8;
export const MIN_SLEEP_GOAL_HRS = 4;
export const MAX_SLEEP_GOAL_HRS = 12;

export function useSleepGoal() {
  const [goal, setGoalState] = useState<number>(DEFAULT_SLEEP_GOAL_HRS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SLEEP_GOAL_KEY)
      .then((raw) => {
        if (raw !== null) {
          const v = parseFloat(raw);
          if (!isNaN(v) && v >= MIN_SLEEP_GOAL_HRS && v <= MAX_SLEEP_GOAL_HRS) {
            setGoalState(v);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setGoal = useCallback((hrs: number) => {
    const clamped = Math.min(MAX_SLEEP_GOAL_HRS, Math.max(MIN_SLEEP_GOAL_HRS, hrs));
    const rounded = Math.round(clamped * 2) / 2; // round to nearest 0.5
    setGoalState(rounded);
    safeSetItem(SLEEP_GOAL_KEY, String(rounded)).catch(() => {});
  }, []);

  return { goal, setGoal, loaded };
}
