/**
 * User Profile Storage
 * Stores age and biological sex for age/sex-adjusted health reference ranges.
 * All data is local — never leaves the device.
 */

import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

const PROFILE_KEY = '@vsht:userProfile';

export type BiologicalSex = 'male' | 'female' | 'other' | 'preferNotToSay';

export interface UserProfile {
  age: number | null;           // years
  sex: BiologicalSex | null;
  firstName?: string | null;    // display name used for personalised greeting
  weightKg?: number | null;     // kg (optional, used for BMR)
  heightCm?: number | null;     // cm (optional, used for BMR)
  goalKcal?: number | null;     // daily caloric goal in kcal (default 2000)
  customKcalPreset?: number | null; // user-defined custom preset chip value
  customKcalPresetLabel?: string | null; // optional short label for the custom preset chip
}

export const DEFAULT_PROFILE: UserProfile = {
  age: null,
  sex: null,
  firstName: null,
  goalKcal: null,
  customKcalPreset: null,
  customKcalPresetLabel: null,
};

export async function loadUserProfile(): Promise<UserProfile> {
  try {
    const raw = await secureGetItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch (_unused) {
    return DEFAULT_PROFILE;
  }
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<void> {
  const current = await loadUserProfile();
  const updated = { ...current, ...profile };
  await secureSetItem(PROFILE_KEY, JSON.stringify(updated));
}

// ─── Age/Sex-Adjusted Reference Ranges ───────────────────────────────────────
// Sources: AHA 2017 BP Guidelines, ESC 2018 HRV Reference Values

export interface BPReferenceRange {
  normalSystolicMax: number;
  normalDiastolicMax: number;
  elevatedSystolicMax: number;
  elevatedDiastolicMax: number;
  stage1SystolicMax: number;
  stage1DiastolicMax: number;
}

export interface HRVReferenceRange {
  lowThreshold: number;     // ms — below this is "low"
  normalMin: number;        // ms
  normalMax: number;        // ms
  label: string;            // e.g. "Adult male 30–39"
}

/**
 * Returns age/sex-adjusted BP reference ranges.
 * Falls back to AHA standard adult ranges if profile is incomplete.
 */
export function getBPReferenceRange(_profile: UserProfile): BPReferenceRange {
  // AHA 2017 standard ranges (same for all ages/sexes in current guidelines)
  return {
    normalSystolicMax: 120,
    normalDiastolicMax: 80,
    elevatedSystolicMax: 129,
    elevatedDiastolicMax: 80,
    stage1SystolicMax: 139,
    stage1DiastolicMax: 89,
  };
}

/**
 * Returns age/sex-adjusted HRV reference ranges (RMSSD in ms).
 * Based on ESC 2018 normative data by age decade and sex.
 */
export function getHRVReferenceRange(profile: UserProfile): HRVReferenceRange {
  const age = profile.age;
  const sex = profile.sex;

  // ESC normative RMSSD values (median ± 1 SD) by age group
  // Source: Shaffer & Ginsberg (2017), Frontiers in Public Health
  if (age !== null && age >= 18) {
    const isMale = sex === 'male';
    const isFemale = sex === 'female';

    if (age < 30) {
      return {
        lowThreshold: isFemale ? 32 : 28,
        normalMin: isFemale ? 32 : 28,
        normalMax: isFemale ? 95 : 88,
        label: `${sex ?? 'Adult'} 18–29`,
      };
    } else if (age < 40) {
      return {
        lowThreshold: isFemale ? 28 : 24,
        normalMin: isFemale ? 28 : 24,
        normalMax: isFemale ? 82 : 76,
        label: `${sex ?? 'Adult'} 30–39`,
      };
    } else if (age < 50) {
      return {
        lowThreshold: isMale ? 20 : 22,
        normalMin: isMale ? 20 : 22,
        normalMax: isMale ? 65 : 70,
        label: `${sex ?? 'Adult'} 40–49`,
      };
    } else if (age < 60) {
      return {
        lowThreshold: isMale ? 16 : 18,
        normalMin: isMale ? 16 : 18,
        normalMax: isMale ? 52 : 58,
        label: `${sex ?? 'Adult'} 50–59`,
      };
    } else {
      return {
        lowThreshold: isMale ? 14 : 16,
        normalMin: isMale ? 14 : 16,
        normalMax: isMale ? 44 : 50,
        label: `${sex ?? 'Adult'} 60+`,
      };
    }
  }

  // Generic adult fallback
  return {
    lowThreshold: 20,
    normalMin: 20,
    normalMax: 80,
    label: 'Adult (general)',
  };
}

// ─── Age/Sex-Adjusted Resting HR Reference Ranges ───────────────────────────
// Sources: AHA/ACC 2015 Scientific Statement on Resting Heart Rate;
//          Ostchega et al. (2011) NCHS Data Brief — NHANES normative RHR by age/sex.
export interface RestingHRReferenceRange {
  athleticMax: number;   // bpm — at or below this is "Athletic"
  normalMin: number;     // bpm
  normalMax: number;     // bpm — above this is "Elevated"
  label: string;         // e.g. "Female 40–49"
}

/**
 * Returns age/sex-adjusted resting HR reference ranges (bpm).
 * Based on NHANES normative data (Ostchega 2011) and AHA guidelines.
 * Falls back to AHA standard adult range (60–100 bpm) if profile is incomplete.
 */
export function getRestingHRReferenceRange(profile: UserProfile): RestingHRReferenceRange {
  const age = profile.age;
  const sex = profile.sex;
  const isMale = sex === 'male';
  const isFemale = sex === 'female';

  if (age !== null && age >= 18) {
    if (age < 30) {
      return {
        athleticMax: 59,
        normalMin: 60,
        normalMax: isFemale ? 84 : 82,
        label: `${sex ?? 'Adult'} 18–29`,
      };
    } else if (age < 40) {
      return {
        athleticMax: 59,
        normalMin: 60,
        normalMax: isFemale ? 84 : 82,
        label: `${sex ?? 'Adult'} 30–39`,
      };
    } else if (age < 50) {
      return {
        athleticMax: 59,
        normalMin: 60,
        normalMax: isMale ? 82 : 84,
        label: `${sex ?? 'Adult'} 40–49`,
      };
    } else if (age < 60) {
      return {
        athleticMax: 59,
        normalMin: 60,
        normalMax: isMale ? 82 : 84,
        label: `${sex ?? 'Adult'} 50–59`,
      };
    } else if (age < 70) {
      return {
        athleticMax: 59,
        normalMin: 60,
        normalMax: isMale ? 80 : 83,
        label: `${sex ?? 'Adult'} 60–69`,
      };
    } else {
      return {
        athleticMax: 59,
        normalMin: 60,
        normalMax: isMale ? 79 : 82,
        label: `${sex ?? 'Adult'} 70+`,
      };
    }
  }

  // Generic adult fallback (AHA: 60–100 bpm)
  return {
    athleticMax: 59,
    normalMin: 60,
    normalMax: 100,
    label: 'Adult (general)',
  };
}

/**
 * Async wrapper that loads the user profile and returns an age/sex-adjusted
 * resting HR status object — mirrors getAdjustedHRVStatus in correlation.ts.
 */
export async function getAdjustedRestingHRStatus(
  latestBpm: number
): Promise<{ label: string; status: 'athletic' | 'normal' | 'elevated'; referenceLabel: string }> {
  const profile = await loadUserProfile();
  const range = getRestingHRReferenceRange(profile);
  let status: 'athletic' | 'normal' | 'elevated';
  if (latestBpm <= range.athleticMax) status = 'athletic';
  else if (latestBpm > range.normalMax) status = 'elevated';
  else status = 'normal';
  const label =
    status === 'athletic'
      ? `Athletic range for your age group (≤ ${range.athleticMax} bpm) — excellent cardiovascular fitness`
      : status === 'elevated'
      ? `Above normal for your age group (> ${range.normalMax} bpm) — consider discussing with your doctor`
      : `Normal for your age group (${range.normalMin}–${range.normalMax} bpm)`;
  return { label, status, referenceLabel: range.label };
}

/** Returns a human-readable label for a biological sex value */
export function sexLabel(sex: BiologicalSex | null): string {
  switch (sex) {
    case 'male': return 'Male';
    case 'female': return 'Female';
    case 'other': return 'Other';
    case 'preferNotToSay': return 'Prefer not to say';
    default: return 'Not set';
  }
}
