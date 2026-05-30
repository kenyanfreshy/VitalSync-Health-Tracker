/**
 * Pure AsyncStorage helpers for the HealthKit Unavailable Banner.
 * Extracted into a separate module so they can be unit-tested without
 * triggering Vite's JSX/NativeWind parse errors on React Native components.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export const HK_UNAVAILABLE_BANNER_DISMISSED_KEY =
  '@vsht:hk_unavailable_banner_dismissed';

/** Returns true if the user has already dismissed the banner. */
export async function isHKUnavailableBannerDismissed(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(HK_UNAVAILABLE_BANNER_DISMISSED_KEY);
    return val === '1';
  } catch (_unused) {
    return false;
  }
}

/** Persists the dismissal flag so the banner never shows again. */
export async function markHKUnavailableBannerDismissed(): Promise<void> {
  try {
    await safeSetItem(HK_UNAVAILABLE_BANNER_DISMISSED_KEY, '1');
  } catch (_unused) {
    // Silently ignore — worst case the banner shows again next launch
  }
}
