/**
 * BMR (Basal Metabolic Rate) Utility
 *
 * Uses the Mifflin-St Jeor equation — the most clinically validated formula
 * for estimating resting energy expenditure in adults.
 *
 *   Men:   BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age) + 5
 *   Women: BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age) − 161
 *   Other: average of male/female estimates
 *
 * Inputs are sourced from:
 *   - Age / Sex : UserProfile (AsyncStorage)
 *   - Weight    : latest BodyCompositionRecord.weightKg  (HealthKit / manual)
 *   - Height    : latest BodyCompositionRecord.heightM   (HealthKit / manual)
 *                 Falls back to average adult height when unavailable.
 *
 * Reference: Mifflin MD et al. (1990), J Am Diet Assoc.
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadUserProfile, type BiologicalSex } from '@/lib/user-profile';
import { loadHealthData } from '@/lib/health/storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Pure calculation ─────────────────────────────────────────────────────────

export interface BMRInputs {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: BiologicalSex | null;
}

export interface BMRResult {
  bmr: number;           // kcal/day resting
  inputs: BMRInputs;
  isEstimated: boolean;  // true when any input was imputed from averages
}

export function calculateBMR(inputs: BMRInputs): number {
  const { weightKg, heightCm, ageYears, sex } = inputs;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === 'male') return Math.round(base + 5);
  if (sex === 'female') return Math.round(base - 161);
  // 'other' / 'preferNotToSay' / null → average of both
  return Math.round((base + 5 + base - 161) / 2);
}

// ─── Data resolver ────────────────────────────────────────────────────────────

/** Average adult fallback values when profile data is incomplete */
const FALLBACK_WEIGHT_KG = 70;
const FALLBACK_HEIGHT_CM = 170;
const FALLBACK_AGE = 35;

export async function resolveBMRInputs(): Promise<{ inputs: BMRInputs; isEstimated: boolean }> {
  const [profile, healthData] = await Promise.all([
    loadUserProfile(),
    loadHealthData(),
  ]);

  let isEstimated = false;

  // Age
  const ageYears = profile.age ?? (isEstimated = true, FALLBACK_AGE);

  // Sex
  const sex = profile.sex ?? null;

  // Weight — prefer profile direct entry, then body composition, then manual weight log
  let weightKg: number = 0;
  if (profile.weightKg && profile.weightKg > 0) {
    weightKg = profile.weightKg;
  } else {
    const latestBody = (healthData?.bodyComposition ?? [])
      .slice()
      .sort((a: { timestamp: string }, b: { timestamp: string }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    weightKg = latestBody?.weightKg ?? 0;
    if (!weightKg) {
      const latestWeight = (healthData?.weight ?? [])
        .slice()
        .sort((a: { timestamp: string }, b: { timestamp: string }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      weightKg = latestWeight?.weightKg ?? 0;
    }
  }
  if (!weightKg) {
    weightKg = FALLBACK_WEIGHT_KG;
    isEstimated = true;
  }

  // Height — prefer profile direct entry, then HealthKit body composition heightM field
  let heightCm: number = 0;
  if (profile.heightCm && profile.heightCm > 0) {
    heightCm = profile.heightCm;
  } else {
    const latestBody2 = (healthData?.bodyComposition ?? [])
      .slice()
      .sort((a: { timestamp: string }, b: { timestamp: string }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    const heightM = (latestBody2 as any)?.heightM ?? 0;
    heightCm = heightM > 0 ? Math.round(heightM * 100) : 0;
  }
  if (!heightCm) {
    heightCm = FALLBACK_HEIGHT_CM;
    isEstimated = true;
  }

  return {
    inputs: { weightKg, heightCm, ageYears, sex },
    isEstimated,
  };
}

// ─── React hook ───────────────────────────────────────────────────────────────

const BMR_CACHE_KEY = '@vitalsync/bmr_cache_v1';

interface BMRCache {
  bmr: number;
  inputs: BMRInputs;
  isEstimated: boolean;
  computedAt: string; // ISO
}

export function useBMR(): { bmr: number; isEstimated: boolean; loading: boolean; weightKg: number } {
  const [result, setResult] = useState<{ bmr: number; isEstimated: boolean; weightKg: number }>({
    bmr: 0,
    isEstimated: true,
    weightKg: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function compute() {
      try {
        // Check cache (valid for 24 hours)
        const raw = await AsyncStorage.getItem(BMR_CACHE_KEY);
        if (raw) {
          const cache: BMRCache = JSON.parse(raw);
          const age = new Date().getTime() - new Date(cache.computedAt).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            if (!cancelled) setResult({ bmr: cache.bmr, isEstimated: cache.isEstimated, weightKg: cache.inputs?.weightKg ?? 0 });
            setLoading(false);
            return;
          }
        }

        const { inputs, isEstimated } = await resolveBMRInputs();
        const bmr = calculateBMR(inputs);

        const cache: BMRCache = {
          bmr,
          inputs,
          isEstimated,
          computedAt: new Date().toISOString(),
        };
        await safeSetItem(BMR_CACHE_KEY, JSON.stringify(cache));

        if (!cancelled) setResult({ bmr, isEstimated, weightKg: inputs.weightKg });
      } catch (_unused) {
        // Fallback: use average adult BMR
        if (!cancelled) setResult({ bmr: 1700, isEstimated: true, weightKg: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, []);

  return { ...result, loading };
}
