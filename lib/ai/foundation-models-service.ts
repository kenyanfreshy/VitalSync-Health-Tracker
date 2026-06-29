/**
 * VitalSync Foundation Models Service
 *
 * Provides wellness analysis using Apple's Foundation Models Framework.
 * Available on iOS 26+ devices that support Apple Intelligence.
 *
 * Architecture:
 *   TypeScript layer → NativeModules.FoundationModelsModule (Swift bridge)
 *   → Foundation Models Framework → On-device or Apple privacy-protected inference
 *
 * Availability:
 *   - Requires iOS 26.0+
 *   - Requires device support for Apple Intelligence
 *   - Checked at runtime via the native module's isAvailable() method
 *   - Gracefully falls back to Gemini if unavailable
 *
 * Privacy:
 *   - All processing happens on-device or through Apple's privacy-protected systems
 *   - No data is sent to third-party servers
 *   - No API keys required
 *
 * All outputs are sanitized through medical-compliance.ts before return.
 */

import { NativeModules, Platform } from 'react-native';
import { AIAnalysisRequest, AIAnalysisResponse, AIProvider, AI_DISCLAIMERS } from './ai-provider';
import { sanitizeAIOutput } from './medical-compliance';

// ─── Native Module Interface ──────────────────────────────────────────────────

interface FoundationModelsNativeModule {
  /** Returns true if Foundation Models are available on this device */
  isAvailable(): Promise<boolean>;
  /** Generates a wellness analysis using Foundation Models */
  generateWellnessInsight(prompt: string, maxTokens: number): Promise<string>;
  /** Returns the model identifier in use */
  getModelIdentifier(): Promise<string>;
}

function getNativeModule(): FoundationModelsNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  const mod = NativeModules.FoundationModelsModule as FoundationModelsNativeModule | undefined;
  return mod ?? null;
}

// ─── Availability Cache ───────────────────────────────────────────────────────

let _availabilityCache: boolean | null = null;

/**
 * Checks if Foundation Models are available on this device.
 * Result is cached after the first check.
 * Returns false if the native module is not present (non-iOS or older iOS).
 */
export async function isFoundationModelsAvailable(): Promise<boolean> {
  if (_availabilityCache !== null) return _availabilityCache;

  const module = getNativeModule();
  if (!module) {
    _availabilityCache = false;
    return false;
  }

  try {
    _availabilityCache = await module.isAvailable();
    return _availabilityCache;
  } catch {
    _availabilityCache = false;
    return false;
  }
}

/** Resets the availability cache (for testing) */
export function resetFoundationModelsCache(): void {
  _availabilityCache = null;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a wellness insight assistant for VitalSync. Provide wellness information only. Never diagnose, treat, cure, or prescribe. Use safe wellness wording: observed pattern, wellness insight, may be associated with, consider discussing with a licensed clinician. Keep responses to 2-4 sentences. Always end with: "This is a wellness observation, not medical advice."`;

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildPrompt(request: AIAnalysisRequest): string {
  const stats = JSON.stringify(request.statistics, null, 2);
  const maxLen = request.maxLength ?? 400;

  const typeInstructions: Record<AIAnalysisRequest['type'], string> = {
    wellness_summary: 'Summarize these wellness statistics in plain language.',
    correlation_explanation:
      'Explain this correlation in plain language. Note that correlation does not prove causation.',
    nutrition_summary:
      'Summarize these nutrition statistics. Note values are from USDA FoodData Central.',
    conversational_insight: 'Provide a brief wellness insight based on these statistics.',
    trend_explanation: 'Explain this wellness trend in plain language.',
  };

  return `${SYSTEM_PROMPT}\n\n${typeInstructions[request.type]}\n\nStatistics:\n${stats}\n\nMax length: ${maxLen} characters.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a wellness analysis using Apple Foundation Models.
 * Returns a safe, sanitized response with the appropriate disclaimer.
 * Never throws — returns an error response on failure.
 */
export async function analyzeWithFoundationModels(
  request: AIAnalysisRequest,
): Promise<AIAnalysisResponse> {
  const module = getNativeModule();

  if (!module) {
    return {
      text: '',
      provider: AIProvider.appleFoundationModels,
      success: false,
      error: 'Foundation Models native module not available',
      disclaimer: AI_DISCLAIMERS.general,
    };
  }

  const available = await isFoundationModelsAvailable();
  if (!available) {
    return {
      text: '',
      provider: AIProvider.appleFoundationModels,
      success: false,
      error: 'Apple Intelligence not available on this device or iOS version',
      disclaimer: AI_DISCLAIMERS.general,
    };
  }

  const prompt = buildPrompt(request);
  const maxTokens = Math.ceil((request.maxLength ?? 400) / 4); // rough token estimate

  try {
    const rawText = await module.generateWellnessInsight(prompt, maxTokens);
    const sanitized = sanitizeAIOutput(rawText);

    const disclaimerMap: Record<AIAnalysisRequest['type'], keyof typeof AI_DISCLAIMERS> = {
      wellness_summary: 'wellness',
      correlation_explanation: 'correlation',
      nutrition_summary: 'nutrition',
      conversational_insight: 'wellness',
      trend_explanation: 'wellness',
    };

    return {
      text: sanitized,
      provider: AIProvider.appleFoundationModels,
      success: true,
      disclaimer: AI_DISCLAIMERS[disclaimerMap[request.type]],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      text: '',
      provider: AIProvider.appleFoundationModels,
      success: false,
      error: `Foundation Models analysis failed: ${message}`,
      disclaimer: AI_DISCLAIMERS.general,
    };
  }
}
