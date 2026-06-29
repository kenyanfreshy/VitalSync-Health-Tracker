/**
 * VitalSync App Intents Registry
 *
 * Defines all Siri / Apple Intelligence intents supported by VitalSync.
 * Each intent maps to a deep-link route that the app handles via Expo Router.
 *
 * Intents are registered in the native Swift layer (AppIntentsModule.swift)
 * and bridged to JavaScript via NativeModules.AppIntentsModule.
 *
 * Supported intents:
 *   - ShowWellnessSummary     → /analytics (wellness summary section)
 *   - ShowBloodPressureTrend  → /analytics (blood pressure chart)
 *   - ShowSleepSummary        → /analytics (sleep section)
 *   - ShowNutritionSummary    → /nutrition (nutrition tab)
 *   - ShowHealthReport        → /report (report screen)
 *   - OpenCorrelateTab        → /analytics (correlate section)
 *   - SetHealthReminder       → /settings/reminders
 *   - ShowDashboard           → / (home dashboard)
 *
 * Deep-link format: vitalsync://intent/<intentId>?<params>
 *
 * Privacy:
 *   - Intents do not expose health data to Siri servers
 *   - Only navigation actions are triggered (no data is sent to Apple)
 *   - All intent responses are generated on-device
 */

import { NativeModules, Platform, Linking } from 'react-native';

// ─── Intent Types ─────────────────────────────────────────────────────────────

export type IntentId =
  | 'ShowWellnessSummary'
  | 'ShowBloodPressureTrend'
  | 'ShowSleepSummary'
  | 'ShowNutritionSummary'
  | 'ShowHealthReport'
  | 'OpenCorrelateTab'
  | 'SetHealthReminder'
  | 'ShowDashboard';

export interface IntentDefinition {
  id: IntentId;
  /** Display name shown in Siri suggestions */
  displayName: string;
  /** Short description for Shortcuts app */
  description: string;
  /** SF Symbol icon name */
  sfSymbol: string;
  /** Deep-link path within the app */
  deepLinkPath: string;
  /** Example Siri phrases */
  examplePhrases: string[];
  /** Whether this intent requires a subscription */
  requiresPremium: boolean;
}

export const INTENT_REGISTRY: Record<IntentId, IntentDefinition> = {
  ShowWellnessSummary: {
    id: 'ShowWellnessSummary',
    displayName: 'Show Wellness Summary',
    description: 'View your personalized wellness summary in VitalSync',
    sfSymbol: 'heart.text.square.fill',
    deepLinkPath: '/(tabs)/analytics?section=wellness',
    examplePhrases: [
      'Show my wellness summary',
      'How am I doing health-wise?',
      'Open VitalSync wellness summary',
    ],
    requiresPremium: false,
  },
  ShowBloodPressureTrend: {
    id: 'ShowBloodPressureTrend',
    displayName: 'Show Blood Pressure Trend',
    description: 'View your blood pressure trend in VitalSync',
    sfSymbol: 'waveform.path.ecg',
    deepLinkPath: '/(tabs)/analytics?section=bloodpressure',
    examplePhrases: [
      'Show my blood pressure trend',
      'How is my blood pressure trending?',
      'Open blood pressure chart in VitalSync',
    ],
    requiresPremium: false,
  },
  ShowSleepSummary: {
    id: 'ShowSleepSummary',
    displayName: 'Show Sleep Summary',
    description: 'View your sleep patterns in VitalSync',
    sfSymbol: 'moon.zzz.fill',
    deepLinkPath: '/(tabs)/analytics?section=sleep',
    examplePhrases: [
      'Show my sleep summary',
      'How did I sleep last night?',
      'Open sleep data in VitalSync',
    ],
    requiresPremium: false,
  },
  ShowNutritionSummary: {
    id: 'ShowNutritionSummary',
    displayName: 'Show Nutrition Summary',
    description: 'View your nutrition tracking in VitalSync',
    sfSymbol: 'fork.knife.circle.fill',
    deepLinkPath: '/(tabs)/nutrition',
    examplePhrases: [
      'Show my nutrition summary',
      'What did I eat today?',
      'Open nutrition tracking in VitalSync',
    ],
    requiresPremium: false,
  },
  ShowHealthReport: {
    id: 'ShowHealthReport',
    displayName: 'Show Health Report',
    description: 'View your health report in VitalSync',
    sfSymbol: 'doc.text.fill',
    deepLinkPath: '/report',
    examplePhrases: [
      'Show my health report',
      'Open VitalSync report',
      'Generate my wellness report',
    ],
    requiresPremium: true,
  },
  OpenCorrelateTab: {
    id: 'OpenCorrelateTab',
    displayName: 'Open Correlate Tab',
    description: 'View health correlations in VitalSync',
    sfSymbol: 'chart.dots.scatter',
    deepLinkPath: '/(tabs)/analytics?section=correlate',
    examplePhrases: [
      'Show health correlations',
      'Open correlate tab in VitalSync',
      'What health patterns are correlated?',
    ],
    requiresPremium: true,
  },
  SetHealthReminder: {
    id: 'SetHealthReminder',
    displayName: 'Set Health Reminder',
    description: 'Set a health tracking reminder in VitalSync',
    sfSymbol: 'bell.fill',
    deepLinkPath: '/settings/reminders',
    examplePhrases: [
      'Set a health reminder in VitalSync',
      'Remind me to log my blood pressure',
      'Add a wellness reminder',
    ],
    requiresPremium: false,
  },
  ShowDashboard: {
    id: 'ShowDashboard',
    displayName: 'Show Dashboard',
    description: 'Open VitalSync dashboard',
    sfSymbol: 'square.grid.2x2.fill',
    deepLinkPath: '/(tabs)',
    examplePhrases: [
      'Open VitalSync',
      'Show my health dashboard',
      'Open VitalSync dashboard',
    ],
    requiresPremium: false,
  },
};

// ─── Native Module Interface ──────────────────────────────────────────────────

interface AppIntentsNativeModule {
  /** Registers all intents with the system (call on app launch) */
  registerIntents(intentIds: string[]): Promise<void>;
  /** Donates an intent interaction (improves Siri suggestions) */
  donateInteraction(intentId: string): Promise<void>;
  /** Returns the intent ID that launched the app (if any) */
  getLaunchIntent(): Promise<string | null>;
}

function getNativeModule(): AppIntentsNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  const mod = NativeModules.AppIntentsModule as AppIntentsNativeModule | undefined;
  return mod ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registers all VitalSync App Intents with the iOS system.
 * Call this once on app launch (in the root layout).
 * No-op on non-iOS platforms.
 */
export async function registerAppIntents(): Promise<void> {
  const module = getNativeModule();
  if (!module) return;

  try {
    const intentIds = Object.keys(INTENT_REGISTRY);
    await module.registerIntents(intentIds);
  } catch {
    // Non-critical — app continues normally without Siri integration
  }
}

/**
 * Donates an intent interaction to improve Siri suggestions.
 * Call when the user performs an action that corresponds to an intent.
 * No-op on non-iOS platforms.
 */
export async function donateIntentInteraction(intentId: IntentId): Promise<void> {
  const module = getNativeModule();
  if (!module) return;

  try {
    await module.donateInteraction(intentId);
  } catch {
    // Non-critical
  }
}

/**
 * Returns the intent ID that launched the app via Siri/Shortcuts.
 * Returns null if the app was launched normally.
 * No-op on non-iOS platforms.
 */
export async function getLaunchIntent(): Promise<IntentId | null> {
  const module = getNativeModule();
  if (!module) return null;

  try {
    const intentId = await module.getLaunchIntent();
    return intentId as IntentId | null;
  } catch {
    return null;
  }
}

/**
 * Navigates to the deep-link path for a given intent.
 * Uses Expo Linking to open the in-app URL.
 */
export async function navigateToIntent(intentId: IntentId): Promise<void> {
  const intent = INTENT_REGISTRY[intentId];
  if (!intent) return;

  try {
    // Use Expo Router's deep-link scheme
    const url = `vitalsync://intent/${intentId}`;
    await Linking.openURL(url);
  } catch {
    // Fallback: intent navigation will be handled by the router
  }
}

/**
 * Returns the deep-link path for a given intent ID.
 * Used by the router to handle intent deep-links.
 */
export function getIntentDeepLinkPath(intentId: IntentId): string | null {
  return INTENT_REGISTRY[intentId]?.deepLinkPath ?? null;
}
