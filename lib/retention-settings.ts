/**
 * retention-settings.ts
 *
 * Manages the user-configurable data retention window for time-series health
 * data stored in AsyncStorage.  The retention window controls how far back
 * pruneHealthData() keeps records — arrays older than the cutoff are trimmed
 * before every write.
 *
 * Default: 12 months.
 * Options: 6 | 12 | 24 months.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export type RetentionMonths = 6 | 12 | 24;

export const RETENTION_OPTIONS: RetentionMonths[] = [6, 12, 24];
export const DEFAULT_RETENTION_MONTHS: RetentionMonths = 12;

const RETENTION_KEY = '@vsht:data_retention_months';

/** Load the user's retention window preference from AsyncStorage. */
export async function loadRetentionMonths(): Promise<RetentionMonths> {
  try {
    const raw = await AsyncStorage.getItem(RETENTION_KEY);
    if (raw === null) return DEFAULT_RETENTION_MONTHS;
    const parsed = parseInt(raw, 10);
    if (parsed === 6 || parsed === 12 || parsed === 24) return parsed as RetentionMonths;
    return DEFAULT_RETENTION_MONTHS;
  } catch {
    return DEFAULT_RETENTION_MONTHS;
  }
}

/** Persist the user's retention window preference to AsyncStorage. */
export async function saveRetentionMonths(months: RetentionMonths): Promise<void> {
  try {
    await safeSetItem(RETENTION_KEY, String(months));
  } catch (err) {
    console.warn('[VitalSync] Failed to save retention months:', err);
  }
}
