/**
 * VitalSync AI Provider Abstraction Layer
 *
 * Implements a clean three-tier AI provider routing system:
 *
 *   AIProvider.appleFoundationModels
 *     → Available on iOS 26+ devices that support Apple Intelligence
 *     → Uses the native FoundationModelsModule Swift bridge
 *     → All processing happens on-device or via Apple's privacy-protected systems
 *
 *   AIProvider.gemini
 *     → Fallback for iOS < 26, Android, and unsupported Apple devices
 *     → Uses Google Gemini 2.5-flash via REST API
 *     → Requires EXPO_PUBLIC_GEMINI_API_KEY
 *
 *   AIProvider.unavailable
 *     → Safe state when neither provider is configured or accessible
 *     → App continues to function with rule-based insights only
 *
 * IMPORTANT:
 *   - AI is used ONLY to explain pre-computed statistics in plain language
 *   - AI never invents nutrition facts, diagnoses, or prescribes
 *   - All AI outputs use safe wellness wording (see medical-compliance.ts)
 *   - HealthKit and USDA FoodData Central remain the sole sources of truth
 *
 * Privacy:
 *   - No personal health data is logged
 *   - Only summarized statistics are sent to Gemini (never raw records)
 *   - Apple Foundation Models processes data on-device
 */

import { Platform, NativeModules } from 'react-native';

// ─── Provider Enum ────────────────────────────────────────────────────────────

export enum AIProvider {
  /** Apple Foundation Models (iOS 26+, on-device or Apple privacy-protected) */
  appleFoundationModels = 'appleFoundationModels',
  /** Google Gemini 2.5-flash (fallback for Android + older iOS) */
  gemini = 'gemini',
  /** No AI available — rule-based insights only */
  unavailable = 'unavailable',
}

// ─── Provider Detection ───────────────────────────────────────────────────────

/**
 * Returns true if the native FoundationModelsModule is available.
 * This module is only compiled into iOS builds and only functional on iOS 26+.
 */
function isFoundationModelsNativeAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  // The native module is registered as 'FoundationModelsModule'
  return !!NativeModules.FoundationModelsModule;
}

/**
 * Returns true if a Gemini API key is configured.
 */
function isGeminiConfigured(): boolean {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  return typeof key === 'string' && key.length > 10;
}

/**
 * Selects the best available AI provider for the current device and configuration.
 *
 * Selection order:
 *   1. Apple Foundation Models (iOS 26+ with native module available)
 *   2. Gemini (API key configured)
 *   3. Unavailable (safe fallback)
 */
export function selectAIProvider(): AIProvider {
  if (isFoundationModelsNativeAvailable()) {
    return AIProvider.appleFoundationModels;
  }
  if (isGeminiConfigured()) {
    return AIProvider.gemini;
  }
  return AIProvider.unavailable;
}

// ─── Provider Info ────────────────────────────────────────────────────────────

export interface AIProviderInfo {
  provider: AIProvider;
  /** Human-readable display name for UI attribution */
  displayName: string;
  /** Short attribution string for footer labels */
  attribution: string;
  /** Whether this provider processes data on-device */
  isOnDevice: boolean;
}

export function getAIProviderInfo(provider: AIProvider): AIProviderInfo {
  switch (provider) {
    case AIProvider.appleFoundationModels:
      return {
        provider,
        displayName: 'Apple Intelligence',
        attribution: 'Wellness analysis powered by Apple Intelligence · All analysis performed on-device',
        isOnDevice: true,
      };
    case AIProvider.gemini:
      return {
        provider,
        displayName: 'Google Gemini',
        attribution: 'Nutrition analysis powered by Google Gemini with USDA database.',
        isOnDevice: false,
      };
    case AIProvider.unavailable:
      return {
        provider,
        displayName: 'On-Device Analysis',
        attribution: 'Wellness insights generated on-device · No AI provider configured',
        isOnDevice: true,
      };
  }
}

// ─── Request / Response Types ─────────────────────────────────────────────────

export interface AIAnalysisRequest {
  /** Type of analysis to perform */
  type:
    | 'wellness_summary'
    | 'correlation_explanation'
    | 'nutrition_summary'
    | 'conversational_insight'
    | 'trend_explanation';
  /**
   * Pre-computed statistics to explain.
   * NEVER include raw health records or personally identifiable data.
   * Only pass aggregated/summarized values (averages, trends, counts).
   */
  statistics: Record<string, string | number | boolean | null>;
  /** User's preferred language code (e.g. 'en', 'es', 'fr') */
  languageCode?: string;
  /** Maximum response length in characters */
  maxLength?: number;
}

export interface AIAnalysisResponse {
  /** The generated plain-language explanation */
  text: string;
  /** Which provider generated this response */
  provider: AIProvider;
  /** Whether the response was generated successfully */
  success: boolean;
  /** Error message if success is false */
  error?: string;
  /** Required disclaimer to append to all AI outputs */
  disclaimer: string;
}

// ─── Standard Disclaimers ─────────────────────────────────────────────────────

export const AI_DISCLAIMERS = {
  correlation:
    'Correlation does not prove causation. VitalSync provides wellness information only and does not diagnose, treat, or replace medical advice.',
  wellness:
    'This is a wellness insight, not medical advice. Consult a licensed clinician for health decisions.',
  nutrition:
    'Nutrition values sourced from USDA FoodData Central. AI explanation is for general wellness information only.',
  general:
    'VitalSync provides wellness information only and does not diagnose, treat, or replace medical advice.',
} as const;

export type DisclaimerType = keyof typeof AI_DISCLAIMERS;

export function getDisclaimer(type: DisclaimerType): string {
  return AI_DISCLAIMERS[type];
}
