/**
 * Onboarding State
 * Tracks whether the user has completed the first-launch walkthrough.
 * Stored in AsyncStorage — fully on-device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const ONBOARDING_KEY = '@vsht:hasOnboarded';
const _RESET_KEY = '@vsht:resetOnboarding';

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    return val === 'true';
  } catch (_unused) {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  await safeSetItem(ONBOARDING_KEY, 'true');
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}
