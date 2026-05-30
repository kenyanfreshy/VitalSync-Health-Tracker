/**
 * VitalSync RTL Utility
 *
 * Manages right-to-left layout direction for RTL languages (Arabic, Hebrew).
 *
 * React Native's I18nManager.forceRTL() requires an app restart to take effect.
 * This module:
 *  1. Detects whether the current language is RTL.
 *  2. Persists the RTL preference to AsyncStorage.
 *  3. Applies I18nManager.forceRTL() on app startup (before first render).
 *  4. Provides a helper to check whether a restart is needed after a language change.
 */

import { I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

/** BCP-47 language codes that use right-to-left script. */
export const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

const RTL_PREF_KEY = '@vsht:rtl_enabled';

/** Returns true if the given language code is RTL. */
export function isRTLLang(lang: string): boolean {
  return RTL_LANGS.has(lang) || RTL_LANGS.has(lang.split('-')[0]);
}

/**
 * Load the persisted RTL preference and apply it via I18nManager.
 * Call this once at app startup (before any rendering).
 * No-op on web (I18nManager is not available).
 */
export async function initRTL(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const stored = await AsyncStorage.getItem(RTL_PREF_KEY);
    const shouldBeRTL = stored === 'true';
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.forceRTL(shouldBeRTL);
      // Note: the app must be restarted for this to take visual effect.
    }
  } catch (_unused) {
    // ignore
  }
}

/**
 * Persist the RTL preference for the given language.
 * Returns true if the RTL direction changed (restart required).
 */
export async function applyRTLForLang(lang: string | null): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const shouldBeRTL = lang ? isRTLLang(lang) : false;
  const currentlyRTL = I18nManager.isRTL;

  try {
    await safeSetItem(RTL_PREF_KEY, String(shouldBeRTL));
  } catch (_unused) {
    // ignore
  }

  if (currentlyRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    return true; // restart required
  }
  return false;
}
