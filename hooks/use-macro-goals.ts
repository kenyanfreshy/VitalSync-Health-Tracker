/**
 * useMacroGoals
 *
 * Loads and persists the user's custom daily macro targets to AsyncStorage.
 * Falls back to standard 2,000 kcal/day reference values when no custom
 * targets have been set.
 *
 * Default targets:
 *   Calories  2,000 kcal
 *   Carbs       250 g   (50% of 2,000 kcal)
 *   Fat          65 g   (30% of 2,000 kcal)
 *   Protein      50 g   (10% of 2,000 kcal)
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vitalsync/macro_goals_v1';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface MacroGoals {
  calories: number;
  carbs: number;
  fat: number;
  protein: number;
  /** Daily fibre target in grams (WHO recommends 25 g) */
  fibre?: number;
  activityLevel?: ActivityLevel;
  /** Custom g/kg protein Gold Zone range (vegan athlete default: 1.6–2.2) */
  proteinMinGPerKg?: number;
  proteinMaxGPerKg?: number;
}

export const DEFAULT_MACRO_GOALS: MacroGoals = {
  calories: 2000,
  carbs: 250,
  fat: 65,
  protein: 50,
  fibre: 25,
  activityLevel: 'sedentary',
};

/** TDEE multipliers from Harris-Benedict activity factors */
export const ACTIVITY_LEVEL_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:   1.2,   // desk job, little/no exercise
  light:       1.375, // light exercise 1-3 days/week
  moderate:    1.55,  // moderate exercise 3-5 days/week
  active:      1.725, // hard exercise 6-7 days/week
  very_active: 1.9,   // physical job + hard daily exercise
};

export const ACTIVITY_LEVEL_OPTIONS: { value: ActivityLevel; label: string; emoji: string; description: string }[] = [
  { value: 'sedentary',   label: 'Sedentary',   emoji: '🪑', description: 'Desk job, little or no exercise' },
  { value: 'light',       label: 'Lightly Active', emoji: '🚶', description: 'Light exercise 1–3 days/week' },
  { value: 'moderate',    label: 'Moderately Active', emoji: '🏃', description: 'Moderate exercise 3–5 days/week' },
  { value: 'active',      label: 'Very Active', emoji: '🏋️', description: 'Hard exercise 6–7 days/week' },
  { value: 'very_active', label: 'Athlete',     emoji: '⚡', description: 'Physical job + hard daily training' },
];

/** Preset diet profiles users can choose from */
export const MACRO_PRESETS: { id: string; label: string; emoji: string; description: string; goals: MacroGoals }[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    emoji: '⚖️',
    description: '50% carbs · 30% fat · 20% protein',
    goals: { calories: 2000, carbs: 250, fat: 65, protein: 100 },
  },
  {
    id: 'high_protein',
    label: 'High-Protein',
    emoji: '🥩',
    description: '30% carbs · 30% fat · 40% protein',
    goals: { calories: 2000, carbs: 150, fat: 65, protein: 200 },
  },
  {
    id: 'low_carb',
    label: 'Low-Carb',
    emoji: '🥑',
    description: '10% carbs · 60% fat · 30% protein',
    goals: { calories: 1800, carbs: 50, fat: 120, protein: 135 },
  },
  {
    id: 'diabetic',
    label: 'Diabetic-Friendly',
    emoji: '🩺',
    description: '40% carbs · 35% fat · 25% protein',
    goals: { calories: 1800, carbs: 180, fat: 70, protein: 113 },
  },
  {
    id: 'weight_loss',
    label: 'Weight Loss',
    emoji: '📉',
    description: '45% carbs · 30% fat · 25% protein',
    goals: { calories: 1500, carbs: 169, fat: 50, protein: 94 },
  },
  {
    id: 'vegan_athlete',
    label: 'Vegan Athlete',
    emoji: '🌱',
    description: '50% carbs · 20% fat · 30% protein · 1.6–2.2 g/kg',
    goals: { calories: 2400, carbs: 300, fat: 53, protein: 180, proteinMinGPerKg: 1.6, proteinMaxGPerKg: 2.2 },
  },
  {
    id: 'endurance',
    label: 'Endurance',
    emoji: '🏃',
    description: '60% carbs · 20% fat · 20% protein · 1.2–1.6 g/kg',
    goals: { calories: 2800, carbs: 420, fat: 62, protein: 140, proteinMinGPerKg: 1.2, proteinMaxGPerKg: 1.6 },
  },
  {
    id: 'strength',
    label: 'Strength',
    emoji: '🏋️',
    description: '40% carbs · 25% fat · 35% protein · 1.8–2.5 g/kg',
    goals: { calories: 2600, carbs: 260, fat: 72, protein: 228, proteinMinGPerKg: 1.8, proteinMaxGPerKg: 2.5 },
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    emoji: '⚙️',
    description: '45% carbs · 30% fat · 25% protein · 1.2–1.6 g/kg',
    goals: { calories: 2000, carbs: 225, fat: 67, protein: 125, proteinMinGPerKg: 1.2, proteinMaxGPerKg: 1.6 },
  },
];

export function useMacroGoals() {
  const [goals, setGoals] = useState<MacroGoals>(DEFAULT_MACRO_GOALS);
  const [loading, setLoading] = useState(true);

  // Load persisted goals on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<MacroGoals>;
          setGoals({
            calories: parsed.calories ?? DEFAULT_MACRO_GOALS.calories,
            carbs: parsed.carbs ?? DEFAULT_MACRO_GOALS.carbs,
            fat: parsed.fat ?? DEFAULT_MACRO_GOALS.fat,
            protein: parsed.protein ?? DEFAULT_MACRO_GOALS.protein,
            fibre: parsed.fibre ?? DEFAULT_MACRO_GOALS.fibre,
            activityLevel: parsed.activityLevel ?? DEFAULT_MACRO_GOALS.activityLevel,
            proteinMinGPerKg: parsed.proteinMinGPerKg,
            proteinMaxGPerKg: parsed.proteinMaxGPerKg,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveGoals = useCallback(async (next: MacroGoals) => {
    setGoals(next);
    await safeSetItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetGoals = useCallback(async () => {
    setGoals(DEFAULT_MACRO_GOALS);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { goals, loading, saveGoals, resetGoals };
}
