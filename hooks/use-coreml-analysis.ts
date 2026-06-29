/**
 * useCoreMLAnalysis — React hook for Core ML wellness analysis
 *
 * Provides a clean interface for components to access Core ML wellness scores,
 * recovery trends, anomaly detection, projected A1C, and trend risk flags.
 *
 * Usage:
 *   const { analysis, isLoading } = useCoreMLAnalysis(healthData);
 *
 *   if (analysis) {
 *     const { wellnessScore, recoveryTrend, anomalies, projectedA1C, trendRiskFlags } = analysis;
 *   }
 */

import { useMemo } from 'react';
import { runCoreMLAnalysis } from '@/lib/coreml/wellness-scoring-engine';
import type { CoreMLAnalysisResult } from '@/lib/coreml/wellness-scoring-engine';
import type { HealthData } from '@/lib/health/types';

export interface UseCoreMLAnalysisResult {
  analysis: CoreMLAnalysisResult | null;
  isLoading: boolean;
}

export function useCoreMLAnalysis(data: HealthData | null): UseCoreMLAnalysisResult {
  const analysis = useMemo(() => {
    if (!data) return null;
    return runCoreMLAnalysis(data);
  }, [data]);

  return {
    analysis,
    isLoading: false,
  };
}
