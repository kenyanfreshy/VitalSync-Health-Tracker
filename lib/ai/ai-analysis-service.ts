/**
 * VitalSync Unified AI Analysis Service
 *
 * Single entry point for all AI-powered wellness analysis.
 * Automatically routes requests to the best available provider:
 *
 *   1. Apple Foundation Models (iOS 26+, on-device)
 *   2. Google Gemini (fallback for older iOS + Android)
 *   3. Rule-based fallback (when neither AI provider is available)
 *
 * Usage:
 *   import { analyzeWellness } from '@/lib/ai/ai-analysis-service';
 *
 *   const result = await analyzeWellness({
 *     type: 'wellness_summary',
 *     statistics: { avgSystolic: 118, avgDiastolic: 76, sampleSize: 14 },
 *   });
 *
 *   if (result.success) {
 *     showText(result.text);
 *     showDisclaimer(result.disclaimer);
 *   }
 *
 * IMPORTANT: Always display result.disclaimer alongside result.text.
 */

import {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIProvider,
  AI_DISCLAIMERS,
  selectAIProvider,
} from './ai-provider';
import { analyzeWithFoundationModels, isFoundationModelsAvailable } from './foundation-models-service';
import { analyzeWithGemini } from './gemini-ai-service';

// ─── Rule-Based Fallback ──────────────────────────────────────────────────────

function generateRuleBasedResponse(request: AIAnalysisRequest): AIAnalysisResponse {
  const stats = request.statistics;

  let text = '';

  switch (request.type) {
    case 'wellness_summary': {
      const parts: string[] = [];
      if (typeof stats.avgSystolic === 'number') {
        parts.push(`Average blood pressure: ${stats.avgSystolic}/${stats.avgDiastolic ?? '?'} mmHg`);
      }
      if (typeof stats.avgHRV === 'number') {
        parts.push(`Average HRV: ${stats.avgHRV} ms`);
      }
      if (typeof stats.avgSleepHrs === 'number') {
        parts.push(`Average sleep: ${stats.avgSleepHrs.toFixed(1)} hours`);
      }
      if (typeof stats.readinessScore === 'number') {
        parts.push(`Readiness score: ${stats.readinessScore}/100`);
      }
      text =
        parts.length > 0
          ? `Your wellness data summary: ${parts.join('; ')}. This is a wellness observation, not medical advice.`
          : 'Continue logging your wellness data to receive personalized insights.';
      break;
    }

    case 'correlation_explanation': {
      const r = typeof stats.pearsonR === 'number' ? stats.pearsonR.toFixed(2) : '—';
      const metricA = stats.metricA ?? 'Metric A';
      const metricB = stats.metricB ?? 'Metric B';
      text = `Your data shows an observed association (r = ${r}) between ${metricA} and ${metricB}. Correlation does not prove causation. This is a wellness observation, not medical advice.`;
      break;
    }

    case 'nutrition_summary': {
      const calories = stats.avgCalories ?? '—';
      const protein = stats.avgProteinG ?? '—';
      text = `Your nutrition data shows an average of ${calories} kcal and ${protein}g protein per day. Values are sourced from USDA FoodData Central. This is a wellness observation, not medical advice.`;
      break;
    }

    case 'trend_explanation': {
      const metric = stats.metricName ?? 'metric';
      const direction = stats.trendDirection ?? 'stable';
      text = `Your ${metric} shows a ${direction} trend over the observed period. This is a wellness observation, not medical advice.`;
      break;
    }

    case 'conversational_insight':
    default:
      text =
        'Keep logging your wellness data consistently for more personalized insights. This is a wellness observation, not medical advice.';
      break;
  }

  return {
    text,
    provider: AIProvider.unavailable,
    success: true,
    disclaimer: AI_DISCLAIMERS.general,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Analyzes wellness statistics using the best available AI provider.
 *
 * Provider selection:
 *   1. Apple Foundation Models (iOS 26+)
 *   2. Gemini (fallback)
 *   3. Rule-based (offline fallback)
 *
 * Never throws. Returns a safe response even on complete failure.
 */
export async function analyzeWellness(
  request: AIAnalysisRequest,
): Promise<AIAnalysisResponse> {
  const selectedProvider = selectAIProvider();

  // Try Apple Foundation Models first
  if (selectedProvider === AIProvider.appleFoundationModels) {
    const available = await isFoundationModelsAvailable();
    if (available) {
      const result = await analyzeWithFoundationModels(request);
      if (result.success) return result;
      // Foundation Models failed — fall through to Gemini
    }
  }

  // Try Gemini
  if (
    selectedProvider === AIProvider.gemini ||
    selectedProvider === AIProvider.appleFoundationModels
  ) {
    const result = await analyzeWithGemini(request);
    if (result.success) return result;
    // Gemini failed — fall through to rule-based
  }

  // Rule-based fallback
  return generateRuleBasedResponse(request);
}

/**
 * Convenience wrapper: generates a wellness summary from a health data snapshot.
 * Accepts pre-computed statistics (never raw records).
 */
export async function generateWellnessSummary(stats: {
  avgSystolic?: number;
  avgDiastolic?: number;
  avgHRV?: number;
  avgSleepHrs?: number;
  readinessScore?: number;
  sampleDays?: number;
  languageCode?: string;
}): Promise<AIAnalysisResponse> {
  return analyzeWellness({
    type: 'wellness_summary',
    statistics: stats,
    languageCode: stats.languageCode,
  });
}

/**
 * Convenience wrapper: explains a correlation finding.
 * Accepts pre-computed Pearson r, sample size, and metric names.
 */
export async function explainCorrelation(stats: {
  metricA: string;
  metricB: string;
  pearsonR: number;
  sampleSize: number;
  dateRange?: string;
  confidenceLevel?: string;
  languageCode?: string;
}): Promise<AIAnalysisResponse> {
  return analyzeWellness({
    type: 'correlation_explanation',
    statistics: stats,
    languageCode: stats.languageCode,
  });
}

/**
 * Convenience wrapper: generates a nutrition summary.
 * Accepts USDA-sourced nutrition statistics only.
 */
export async function generateNutritionSummary(stats: {
  avgCalories?: number;
  avgProteinG?: number;
  avgCarbsG?: number;
  avgFatG?: number;
  avgFiberG?: number;
  sampleDays?: number;
  languageCode?: string;
}): Promise<AIAnalysisResponse> {
  return analyzeWellness({
    type: 'nutrition_summary',
    statistics: stats,
    languageCode: stats.languageCode,
  });
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { AIProvider, selectAIProvider, getAIProviderInfo } from './ai-provider';
export type { AIAnalysisRequest, AIAnalysisResponse, AIProviderInfo } from './ai-provider';
export { isFoundationModelsAvailable } from './foundation-models-service';
export { sanitizeAIOutput, validateAIOutput, appendDisclaimer } from './medical-compliance';
