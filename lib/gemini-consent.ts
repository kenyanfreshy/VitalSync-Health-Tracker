/**
 * lib/gemini-consent.ts
 *
 * Manages user consent for AI features that process health data:
 *
 *   1. Google Gemini AI — Food photo analysis (image leaves device → Google servers)
 *   2. Apple Intelligence / Foundation Models — On-device wellness summaries
 *      (iOS 26+, data stays on device, but requires explicit user consent per
 *       Apple's privacy guidelines and App Review rule 5.1.1)
 *
 * Storage keys:
 *   @vsht:gemini_ai_consent         — '1' (accepted) | absent (not yet accepted)
 *   @vsht:apple_intelligence_consent — '1' (accepted) | absent (not yet accepted)
 *
 * Usage:
 *   // Gemini (food scan)
 *   const ok = await hasGeminiConsent();
 *   if (!ok) { /* show Gemini consent dialog *\/ }
 *   await markGeminiConsent();
 *   await revokeGeminiConsent();
 *
 *   // Apple Intelligence (wellness summaries)
 *   const ok = await hasAppleIntelligenceConsent();
 *   if (!ok) { /* show Apple Intelligence consent dialog *\/ }
 *   await markAppleIntelligenceConsent();
 *   await revokeAppleIntelligenceConsent();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const GEMINI_CONSENT_KEY = '@vsht:gemini_ai_consent';
const APPLE_INTELLIGENCE_CONSENT_KEY = '@vsht:apple_intelligence_consent';

// ─── In-memory caches ─────────────────────────────────────────────────────────

/** null = not yet read, true/false = cached value */
let _geminiCache: boolean | null = null;
let _appleIntelligenceCache: boolean | null = null;

// ─── Gemini AI Consent (Food Scan) ────────────────────────────────────────────

/**
 * Returns true if the user has already consented to Gemini AI food analysis.
 * Uses an in-memory cache after the first AsyncStorage read.
 */
export async function hasGeminiConsent(): Promise<boolean> {
  if (_geminiCache !== null) return _geminiCache;
  try {
    const val = await AsyncStorage.getItem(GEMINI_CONSENT_KEY);
    _geminiCache = val === '1';
    return _geminiCache;
  } catch {
    return false;
  }
}

/**
 * Marks Gemini AI consent as accepted.
 * Call this after the user taps "I Agree" in the Gemini consent dialog.
 */
export async function markGeminiConsent(): Promise<void> {
  _geminiCache = true;
  try {
    await AsyncStorage.setItem(GEMINI_CONSENT_KEY, '1');
  } catch {
    // Non-fatal: consent will be re-requested on next scan attempt
  }
}

/**
 * Revokes Gemini AI consent.
 * Call this from Settings → Privacy → AI Consent → Revoke Food Scan Consent.
 * After revocation, the consent dialog will be shown again on the next scan.
 */
export async function revokeGeminiConsent(): Promise<void> {
  _geminiCache = false;
  try {
    await AsyncStorage.removeItem(GEMINI_CONSENT_KEY);
  } catch {
    // Non-fatal
  }
}

/**
 * Synchronously checks the in-memory Gemini consent cache.
 * Returns null if the cache has not been populated yet.
 */
export function getGeminiConsentCached(): boolean | null {
  return _geminiCache;
}

// ─── Apple Intelligence Consent (Foundation Models / Wellness Summaries) ──────

/**
 * Returns true if the user has consented to Apple Intelligence wellness analysis.
 *
 * Apple Intelligence / Foundation Models runs entirely on-device (iOS 26+).
 * No health data is sent to Apple servers. However, explicit consent is still
 * required per Apple's privacy guidelines (App Review rule 5.1.1) because the
 * feature processes sensitive health data.
 *
 * Uses an in-memory cache after the first AsyncStorage read.
 */
export async function hasAppleIntelligenceConsent(): Promise<boolean> {
  if (_appleIntelligenceCache !== null) return _appleIntelligenceCache;
  try {
    const val = await AsyncStorage.getItem(APPLE_INTELLIGENCE_CONSENT_KEY);
    _appleIntelligenceCache = val === '1';
    return _appleIntelligenceCache;
  } catch {
    return false;
  }
}

/**
 * Marks Apple Intelligence consent as accepted.
 * Call this after the user taps "Enable" in the Apple Intelligence consent dialog.
 */
export async function markAppleIntelligenceConsent(): Promise<void> {
  _appleIntelligenceCache = true;
  try {
    await AsyncStorage.setItem(APPLE_INTELLIGENCE_CONSENT_KEY, '1');
  } catch {
    // Non-fatal
  }
}

/**
 * Revokes Apple Intelligence consent.
 * Call this from Settings → Privacy → AI Consent → Revoke Apple Intelligence Consent.
 * After revocation, the AI wellness insight card will show a "Enable AI Insights" prompt.
 */
export async function revokeAppleIntelligenceConsent(): Promise<void> {
  _appleIntelligenceCache = false;
  try {
    await AsyncStorage.removeItem(APPLE_INTELLIGENCE_CONSENT_KEY);
  } catch {
    // Non-fatal
  }
}

/**
 * Synchronously checks the in-memory Apple Intelligence consent cache.
 * Returns null if the cache has not been populated yet.
 */
export function getAppleIntelligenceConsentCached(): boolean | null {
  return _appleIntelligenceCache;
}

// ─── Bulk Consent Utilities ───────────────────────────────────────────────────

/**
 * Loads both consent states from AsyncStorage in a single batch call.
 * Call this once on app launch to warm the in-memory caches.
 */
export async function loadAllConsentStates(): Promise<{
  gemini: boolean;
  appleIntelligence: boolean;
}> {
  try {
    const [geminiVal, appleVal] = await AsyncStorage.multiGet([
      GEMINI_CONSENT_KEY,
      APPLE_INTELLIGENCE_CONSENT_KEY,
    ]);
    _geminiCache = geminiVal[1] === '1';
    _appleIntelligenceCache = appleVal[1] === '1';
    return {
      gemini: _geminiCache,
      appleIntelligence: _appleIntelligenceCache,
    };
  } catch {
    return { gemini: false, appleIntelligence: false };
  }
}

/**
 * Revokes ALL AI consent (Gemini + Apple Intelligence).
 * Call this from Settings → Privacy → Revoke All AI Consent.
 */
export async function revokeAllAIConsent(): Promise<void> {
  _geminiCache = false;
  _appleIntelligenceCache = false;
  try {
    await AsyncStorage.multiRemove([GEMINI_CONSENT_KEY, APPLE_INTELLIGENCE_CONSENT_KEY]);
  } catch {
    // Non-fatal
  }
}
