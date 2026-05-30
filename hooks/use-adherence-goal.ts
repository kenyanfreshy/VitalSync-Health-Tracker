/**
 * useAdherenceGoal — persists the user's personal medication adherence target (%)
 * to AsyncStorage. Defaults to 90% (evidence-based clinical target).
 *
 * Usage:
 *   const { goal, setGoal, loaded } = useAdherenceGoal();
 *   // goal: number (e.g. 90)
 *   // setGoal(80) → persists and updates state
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const ADHERENCE_GOAL_KEY = '@vsht:adherence_goal_pct';
export const DEFAULT_ADHERENCE_GOAL = 90;
export const MIN_ADHERENCE_GOAL = 50;
export const MAX_ADHERENCE_GOAL = 100;

export function useAdherenceGoal() {
  const [goal, setGoalState] = useState<number>(DEFAULT_ADHERENCE_GOAL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ADHERENCE_GOAL_KEY)
      .then((raw) => {
        if (raw !== null) {
          const v = parseInt(raw, 10);
          if (!isNaN(v) && v >= MIN_ADHERENCE_GOAL && v <= MAX_ADHERENCE_GOAL) {
            setGoalState(v);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setGoal = useCallback((pct: number) => {
    const clamped = Math.min(MAX_ADHERENCE_GOAL, Math.max(MIN_ADHERENCE_GOAL, Math.round(pct)));
    setGoalState(clamped);
    safeSetItem(ADHERENCE_GOAL_KEY, String(clamped)).catch(() => {});
  }, []);

  return { goal, setGoal, loaded };
}
