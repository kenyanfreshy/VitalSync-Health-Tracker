/**
 * useSugarBudget — React hook for reading and updating the user's
 * custom daily sugar budget (default: 25 g/day WHO limit).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  loadSugarBudget,
  saveSugarBudget,
  WHO_SUGAR_DEFAULT_G,
} from '@/lib/health/sugar-budget';

export interface UseSugarBudgetResult {
  /** Current daily sugar budget in grams */
  budgetG: number;
  /** True while the initial load is in progress */
  loading: boolean;
  /** Update and persist the budget */
  setBudgetG: (grams: number) => Promise<void>;
}

export function useSugarBudget(): UseSugarBudgetResult {
  const [budgetG, setBudgetGState] = useState<number>(WHO_SUGAR_DEFAULT_G);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSugarBudget().then((v) => {
      setBudgetGState(v);
      setLoading(false);
    });
  }, []);

  const setBudgetG = useCallback(async (grams: number) => {
    await saveSugarBudget(grams);
    setBudgetGState(grams);
  }, []);

  return { budgetG, loading, setBudgetG };
}
