/**
 * useAIWellnessInsight — React hook for AI-powered wellness analysis
 *
 * Provides a clean interface for components to request AI wellness insights.
 * Handles:
 *   - Provider selection (Foundation Models → Gemini → rule-based)
 *   - Consent gate (checks if user has granted AI analysis consent)
 *   - Loading / error states
 *   - Caching (avoids re-requesting the same analysis within 1 hour)
 *   - Medical compliance (all outputs sanitized)
 *
 * Usage:
 *   const { insight, isLoading, error, providerInfo, requestInsight } = useAIWellnessInsight();
 *
 *   // Trigger analysis
 *   requestInsight({ type: 'wellness_summary', statistics: { avgSystolic: 118 } });
 *
 *   // Display result
 *   if (insight) {
 *     <Text>{insight.text}</Text>
 *     <Text>{insight.disclaimer}</Text>  // ALWAYS show disclaimer
 *     <Text>{providerInfo.attribution}</Text>
 *   }
 */

import { useState, useCallback, useRef } from 'react';
import { analyzeWellness } from '@/lib/ai/ai-analysis-service';
import { selectAIProvider, getAIProviderInfo, AIProvider, AIProviderInfo } from '@/lib/ai/ai-provider';
import type { AIAnalysisRequest, AIAnalysisResponse } from '@/lib/ai/ai-provider';
import { hasGeminiConsent } from '@/lib/gemini-consent';

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  response: AIAnalysisResponse;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const insightCache = new Map<string, CacheEntry>();

function getCacheKey(request: AIAnalysisRequest): string {
  return `${request.type}:${JSON.stringify(request.statistics)}`;
}

function getCached(request: AIAnalysisRequest): AIAnalysisResponse | null {
  const key = getCacheKey(request);
  const entry = insightCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    insightCache.delete(key);
    return null;
  }
  return entry.response;
}

function setCache(request: AIAnalysisRequest, response: AIAnalysisResponse): void {
  insightCache.set(getCacheKey(request), { response, timestamp: Date.now() });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAIWellnessInsightResult {
  /** The latest AI analysis response */
  insight: AIAnalysisResponse | null;
  /** True while an analysis is in progress */
  isLoading: boolean;
  /** Error message if the last request failed */
  error: string | null;
  /** Information about the active AI provider */
  providerInfo: AIProviderInfo;
  /** Whether AI consent has been granted */
  hasConsent: boolean;
  /** Trigger a new analysis request */
  requestInsight: (request: AIAnalysisRequest) => Promise<void>;
  /** Clear the current insight */
  clearInsight: () => void;
}

export function useAIWellnessInsight(): UseAIWellnessInsightResult {
  const [insight, setInsight] = useState<AIAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const abortRef = useRef(false);

  const provider = selectAIProvider();
  const providerInfo = getAIProviderInfo(provider);

  const requestInsight = useCallback(async (request: AIAnalysisRequest) => {
    // Check consent
    const consentGranted = await hasGeminiConsent();
    setHasConsent(consentGranted);

    if (!consentGranted) {
      setError('AI analysis requires consent. Enable it in Settings > Privacy & Consent.');
      return;
    }

    // Check cache
    const cached = getCached(request);
    if (cached) {
      setInsight(cached);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const response = await analyzeWellness(request);

      if (abortRef.current) return; // Component unmounted

      setInsight(response);

      if (response.success) {
        setCache(request, response);
      } else {
        setError(response.error ?? 'Analysis unavailable');
      }
    } catch (err) {
      if (abortRef.current) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Analysis failed: ${message}`);
    } finally {
      if (!abortRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const clearInsight = useCallback(() => {
    setInsight(null);
    setError(null);
    abortRef.current = true;
  }, []);

  // Load consent status on mount
  useState(() => {
    hasGeminiConsent().then(setHasConsent);
  });

  return {
    insight,
    isLoading,
    error,
    providerInfo,
    hasConsent,
    requestInsight,
    clearInsight,
  };
}
