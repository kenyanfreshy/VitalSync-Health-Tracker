/**
 * Diet Streak Records — per-protocol all-time best streak storage.
 *
 * Stores a map of DietType → best streak (days) in AsyncStorage.
 * Updated whenever the current streak for a given protocol exceeds the stored record.
 *
 * Storage key: @vitalsync/diet_streak_records
 *   Value: JSON object, e.g. { "keto": 14, "dash": 7, "balanced": 3 }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DietType } from './diet-type';
import { safeSetItem } from '@/lib/safe-async-storage';

const RECORDS_KEY = '@vitalsync/diet_streak_records';

export type StreakRecords = Partial<Record<DietType, number>>;

/** Load all per-protocol streak records. */
export async function loadStreakRecords(): Promise<StreakRecords> {
  try {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StreakRecords;
  } catch (_unused) {
    return {};
  }
}

/** Save all per-protocol streak records. */
export async function saveStreakRecords(records: StreakRecords): Promise<void> {
  try {
    await safeSetItem(RECORDS_KEY, JSON.stringify(records));
  } catch (_unused) {
    // non-critical
  }
}

/**
 * Update the best streak for a given protocol if the current streak exceeds it.
 * Returns true if a new record was set.
 */
export async function updateStreakRecord(
  dietType: DietType,
  currentStreak: number,
): Promise<boolean> {
  if (currentStreak <= 0) return false;
  const records = await loadStreakRecords();
  const previous = records[dietType] ?? 0;
  if (currentStreak > previous) {
    records[dietType] = currentStreak;
    await saveStreakRecords(records);
    return true;
  }
  return false;
}

/** Reset the best streak record for a specific protocol. */
export async function resetStreakRecord(dietType: DietType): Promise<void> {
  const records = await loadStreakRecords();
  delete records[dietType];
  await saveStreakRecords(records);
}
