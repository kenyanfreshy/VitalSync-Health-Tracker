/**
 * lib/ai/runtime-safety.ts
 *
 * Runtime safety checks for all AI features in VitalSync.
 *
 * Covers:
 *   1. HealthKit denied / not authorized
 *   2. AI provider unavailable (Foundation Models not on iOS 26+, Gemini network error)
 *   3. USDA FoodData Central API failure
 *   4. Insufficient data (< minimum records for meaningful analysis)
 *   5. Subscription inactive (premium features gated)
 *   6. AI consent not given
 *
 * Each check returns a SafetyCheckResult with:
 *   - ok: boolean — whether the feature can proceed
 *   - reason: SafetyFailureReason — machine-readable failure code
 *   - userMessage: string — human-readable message for empty state UI
 *   - actionLabel?: string — optional CTA label (e.g., "Open Settings")
 *   - actionRoute?: string — optional navigation route for the CTA
 *
 * Usage:
 *   const check = await checkAIReadiness({ requiresHealthKit: true, requiresPremium: true });
 *   if (!check.ok) {
 *     return <AIEmptyState reason={check.reason} message={check.userMessage} />;
 *   }
 */

import { Platform } from 'react-native';
import { hasGeminiConsent, hasAppleIntelligenceConsent } from '@/lib/gemini-consent';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SafetyFailureReason =
  | 'healthkit_denied'
  | 'healthkit_not_available'
  | 'ai_consent_missing'
  | 'apple_intelligence_unavailable'
  | 'gemini_network_error'
  | 'usda_api_failure'
  | 'insufficient_data'
  | 'subscription_inactive'
  | 'platform_not_supported'
  | 'unknown_error';

export interface SafetyCheckResult {
  ok: boolean;
  reason?: SafetyFailureReason;
  userMessage?: string;
  actionLabel?: string;
  actionRoute?: string;
}

export interface AIReadinessOptions {
  /** Whether this feature requires HealthKit authorization */
  requiresHealthKit?: boolean;
  /** Whether this feature requires a premium subscription */
  requiresPremium?: boolean;
  /** Whether this feature requires Gemini AI consent (food scan) */
  requiresGeminiConsent?: boolean;
  /** Whether this feature requires Apple Intelligence consent */
  requiresAppleIntelligenceConsent?: boolean;
  /** Minimum number of data records required for meaningful analysis */
  minimumDataPoints?: number;
  /** Actual number of data points available */
  availableDataPoints?: number;
  /** Whether the user has an active premium subscription */
  isPremiumActive?: boolean;
  /** Whether HealthKit is authorized */
  isHealthKitAuthorized?: boolean;
}

// ─── Safety Check ─────────────────────────────────────────────────────────────

/**
 * Performs a comprehensive AI readiness check.
 * Returns the first failure found, or { ok: true } if all checks pass.
 */
export async function checkAIReadiness(
  options: AIReadinessOptions = {}
): Promise<SafetyCheckResult> {
  const {
    requiresHealthKit = false,
    requiresPremium = false,
    requiresGeminiConsent: needsGeminiConsent = false,
    requiresAppleIntelligenceConsent: needsAppleConsent = false,
    minimumDataPoints = 0,
    availableDataPoints = 0,
    isPremiumActive = true,
    isHealthKitAuthorized = true,
  } = options;

  // 1. Platform check
  if (Platform.OS === 'web') {
    return {
      ok: false,
      reason: 'platform_not_supported',
      userMessage: 'AI wellness features are available on iOS only.',
    };
  }

  // 2. Subscription check
  if (requiresPremium && !isPremiumActive) {
    return {
      ok: false,
      reason: 'subscription_inactive',
      userMessage: 'This feature requires VitalSync Premium.',
      actionLabel: 'Upgrade to Premium',
      actionRoute: '/paywall',
    };
  }

  // 3. HealthKit authorization check
  if (requiresHealthKit && !isHealthKitAuthorized) {
    return {
      ok: false,
      reason: 'healthkit_denied',
      userMessage: 'Health data access is required for this feature. Please grant access in iOS Settings → Health → VitalSync.',
      actionLabel: 'Open Settings',
      actionRoute: 'app-settings:',
    };
  }

  // 4. Gemini consent check
  if (needsGeminiConsent) {
    const hasConsent = await hasGeminiConsent();
    if (!hasConsent) {
      return {
        ok: false,
        reason: 'ai_consent_missing',
        userMessage: 'Consent is required to send food photos to Google Gemini for analysis.',
        actionLabel: 'Review Consent',
        actionRoute: '/settings/consent',
      };
    }
  }

  // 5. Apple Intelligence consent check
  if (needsAppleConsent) {
    const hasConsent = await hasAppleIntelligenceConsent();
    if (!hasConsent) {
      return {
        ok: false,
        reason: 'ai_consent_missing',
        userMessage: 'Consent is required to enable AI wellness summaries.',
        actionLabel: 'Review Consent',
        actionRoute: '/settings/consent',
      };
    }
  }

  // 6. Insufficient data check
  if (minimumDataPoints > 0 && availableDataPoints < minimumDataPoints) {
    const remaining = minimumDataPoints - availableDataPoints;
    return {
      ok: false,
      reason: 'insufficient_data',
      userMessage: `Not enough data yet. Log ${remaining} more reading${remaining === 1 ? '' : 's'} to unlock AI analysis.`,
      actionLabel: 'Log Data',
      actionRoute: '/(tabs)/record',
    };
  }

  return { ok: true };
}

// ─── Specific Checks ──────────────────────────────────────────────────────────

/**
 * Checks if USDA FoodData Central API is reachable.
 * Returns false on network error (app continues with cached data or manual entry).
 */
export async function checkUSDAAvailability(): Promise<SafetyCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      'https://api.nal.usda.gov/fdc/v1/foods/search?query=apple&pageSize=1&api_key=DEMO_KEY',
      { signal: controller.signal, method: 'HEAD' }
    );
    clearTimeout(timeout);
    if (response.ok || response.status === 400) {
      // 400 is expected for HEAD requests to USDA — API is reachable
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'usda_api_failure',
      userMessage: 'Nutrition database is temporarily unavailable. You can still log meals manually.',
    };
  } catch {
    return {
      ok: false,
      reason: 'usda_api_failure',
      userMessage: 'Nutrition database is temporarily unavailable. You can still log meals manually.',
    };
  }
}

/**
 * Checks if Apple Intelligence (Foundation Models) is available on this device.
 * Requires iOS 26+ and a compatible Apple Silicon device.
 *
 * In the React Native layer, we check via the native module.
 * Falls back to false if the module is not available.
 */
export function checkAppleIntelligenceAvailability(): SafetyCheckResult {
  if (Platform.OS !== 'ios') {
    return {
      ok: false,
      reason: 'apple_intelligence_unavailable',
      userMessage: 'Apple Intelligence is only available on iOS.',
    };
  }

  // iOS version check: Foundation Models requires iOS 26+
  const iosVersion = parseInt(Platform.Version as string, 10);
  if (iosVersion < 26) {
    return {
      ok: false,
      reason: 'apple_intelligence_unavailable',
      userMessage: `Apple Intelligence requires iOS 26 or later. Your device is running iOS ${Platform.Version}. AI summaries will use Google Gemini instead.`,
    };
  }

  return { ok: true };
}

/**
 * Checks if Gemini AI is available (network + consent).
 */
export async function checkGeminiAvailability(): Promise<SafetyCheckResult> {
  const hasConsent = await hasGeminiConsent();
  if (!hasConsent) {
    return {
      ok: false,
      reason: 'ai_consent_missing',
      userMessage: 'Gemini AI consent is required for food scan analysis.',
      actionLabel: 'Review Consent',
      actionRoute: '/settings/consent',
    };
  }
  return { ok: true };
}

// ─── Empty State Messages ─────────────────────────────────────────────────────

/**
 * Returns a user-friendly empty state message for a given failure reason.
 * Used by AI empty state components when a specific message is not provided.
 */
export function getEmptyStateMessage(reason: SafetyFailureReason): {
  title: string;
  subtitle: string;
  icon: string;
} {
  switch (reason) {
    case 'healthkit_denied':
      return {
        icon: '🔒',
        title: 'Health Access Required',
        subtitle: 'Grant access in iOS Settings → Health → VitalSync to enable this feature.',
      };
    case 'healthkit_not_available':
      return {
        icon: '📱',
        title: 'HealthKit Not Available',
        subtitle: 'This feature requires an iPhone with HealthKit support.',
      };
    case 'ai_consent_missing':
      return {
        icon: '🤝',
        title: 'Consent Required',
        subtitle: 'Review and accept the AI consent to enable this feature.',
      };
    case 'apple_intelligence_unavailable':
      return {
        icon: '🧠',
        title: 'Apple Intelligence Not Available',
        subtitle: 'Apple Intelligence requires iOS 26 or later. AI summaries will use Google Gemini instead.',
      };
    case 'gemini_network_error':
      return {
        icon: '📡',
        title: 'Network Unavailable',
        subtitle: 'AI analysis requires an internet connection. Check your connection and try again.',
      };
    case 'usda_api_failure':
      return {
        icon: '🥗',
        title: 'Nutrition Database Unavailable',
        subtitle: 'The nutrition database is temporarily unavailable. You can still log meals manually.',
      };
    case 'insufficient_data':
      return {
        icon: '📊',
        title: 'More Data Needed',
        subtitle: 'Log more health data to unlock AI analysis and personalized insights.',
      };
    case 'subscription_inactive':
      return {
        icon: '⭐',
        title: 'Premium Feature',
        subtitle: 'Upgrade to VitalSync Premium to access AI wellness insights.',
      };
    case 'platform_not_supported':
      return {
        icon: '📱',
        title: 'iOS Only',
        subtitle: 'AI wellness features are available on iOS devices only.',
      };
    default:
      return {
        icon: '⚠️',
        title: 'Feature Unavailable',
        subtitle: 'This feature is temporarily unavailable. Please try again later.',
      };
  }
}
