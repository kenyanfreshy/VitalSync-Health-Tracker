/**
 * First-sync tracker — pure AsyncStorage helpers.
 *
 * Extracted from the HealthKitSyncBanner component so these functions can be
 * imported and tested in Vitest (Node environment) without pulling in any
 * React Native UI components (which contain JSX and cannot be parsed by Vite).
 *
 * NOTE: Uses AsyncStorage directly (not safeSetItem) so that:
 * 1. The Vitest test environment does not pull in safe-async-storage →
 *    safe-notifications.ts → react-native (which Rollup cannot parse).
 * 2. The value written here is always tiny (the string "1"), so the size-guard
 *    logic in safeSetItem adds no value.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FIRST_SYNC_SEEN_KEY = '@vsht:first_healthkit_sync_seen_v1';

/** Call this to mark the first sync as seen so the banner never reappears. */
export async function markFirstSyncSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_SYNC_SEEN_KEY, '1');
  } catch (_unused) {
    // Non-fatal
  }
}

/** Returns true if the first-sync banner has never been shown before. */
export async function isFirstHealthKitSync(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(FIRST_SYNC_SEEN_KEY);
    return val === null;
  } catch (_unused) {
    return false;
  }
}
