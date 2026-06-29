/**
 * AIWellnessInsightCard
 *
 * Displays an AI-generated wellness insight with:
 *   - Provider attribution (Apple Intelligence or Google Gemini)
 *   - Required medical disclaimer
 *   - Loading state
 *   - Error state with graceful fallback
 *   - Consent gate (prompts user to enable AI analysis if not consented)
 *
 * Used in:
 *   - Analytics screen (correlation explanations)
 *   - Wellness Summary section (weekly/monthly summary)
 *   - Nutrition tab (meal quality explanation)
 *
 * IMPORTANT: This component always displays result.disclaimer.
 * Never suppress the disclaimer — it is required for App Store compliance.
 */

import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/glass-card';
import { useColors } from '@/hooks/use-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAIWellnessInsight } from '@/hooks/use-ai-wellness-insight';
import { AIProvider } from '@/lib/ai/ai-provider';
import type { AIAnalysisRequest } from '@/lib/ai/ai-provider';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIWellnessInsightCardProps {
  /** The analysis request to run */
  request: AIAnalysisRequest;
  /** Card title */
  title?: string;
  /** Accent color for the glass card */
  accentColor?: string;
  /** Whether to auto-trigger the analysis on mount */
  autoAnalyze?: boolean;
  /** Called when the user taps "Enable AI Analysis" */
  onConsentRequired?: () => void;
}

// ─── Provider Badge ───────────────────────────────────────────────────────────

function ProviderBadge({ provider, isDark }: { provider: AIProvider; isDark: boolean }) {
  const badgeConfig = {
    [AIProvider.appleFoundationModels]: {
      emoji: '',
      label: 'Apple Intelligence',
      color: isDark ? '#A5B4FC' : '#4338CA',
      bg: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)',
    },
    [AIProvider.gemini]: {
      emoji: '✦',
      label: 'Google Gemini',
      color: isDark ? '#93C5FD' : '#1D4ED8',
      bg: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)',
    },
    [AIProvider.unavailable]: {
      emoji: '⚙',
      label: 'On-Device Analysis',
      color: isDark ? '#6B7280' : '#9CA3AF',
      bg: isDark ? 'rgba(107,114,128,0.18)' : 'rgba(107,114,128,0.10)',
    },
  };

  const config = badgeConfig[provider];

  return (
    <View style={[styles.providerBadge, { backgroundColor: config.bg }]}>
      {config.emoji ? (
        <Text style={[styles.providerEmoji, { color: config.color }]}>{config.emoji}</Text>
      ) : null}
      <Text style={[styles.providerLabel, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AIWellnessInsightCard({
  request,
  title = 'AI Wellness Insight',
  accentColor = '#6366F1',
  autoAnalyze = false,
  onConsentRequired,
}: AIWellnessInsightCardProps) {
  const colors = useColors();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const { insight, isLoading, error, providerInfo, hasConsent, requestInsight } =
    useAIWellnessInsight();

  // Auto-trigger on mount if requested
  useEffect(() => {
    if (autoAnalyze) {
      requestInsight(request);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze]);

  const textColor = isDark ? '#E8EEFF' : '#0F172A';
  const mutedColor = isDark ? 'rgba(180,200,255,0.45)' : 'rgba(0,0,0,0.45)';

  // ── Consent required state ────────────────────────────────────────────────
  if (!hasConsent && !isLoading) {
    return (
      <GlassCard accentColor={accentColor} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.titleEmoji}>✦</Text>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        </View>
        <Text style={[styles.consentText, { color: mutedColor }]}>
          Enable AI analysis to receive personalized wellness insights powered by{' '}
          {providerInfo.displayName}.
        </Text>
        <Pressable
          style={[styles.consentButton, { backgroundColor: accentColor + '22', borderColor: accentColor + '60' }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onConsentRequired?.();
          }}
        >
          <Text style={[styles.consentButtonText, { color: accentColor }]}>
            Enable AI Analysis
          </Text>
        </Pressable>
      </GlassCard>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <GlassCard accentColor={accentColor} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.titleEmoji}>✦</Text>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={[styles.loadingText, { color: mutedColor }]}>
            Analyzing your wellness data...
          </Text>
        </View>
      </GlassCard>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !insight) {
    return (
      <GlassCard accentColor={accentColor} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.titleEmoji}>✦</Text>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        </View>
        <Text style={[styles.errorText, { color: mutedColor }]}>
          AI analysis is temporarily unavailable. Your wellness data is still being tracked.
        </Text>
        <Pressable
          style={[styles.retryButton, { borderColor: accentColor + '40' }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            requestInsight(request);
          }}
        >
          <Text style={[styles.retryText, { color: accentColor }]}>Retry</Text>
        </Pressable>
      </GlassCard>
    );
  }

  // ── Empty state (no insight yet) ──────────────────────────────────────────
  if (!insight) {
    return (
      <GlassCard accentColor={accentColor} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.titleEmoji}>✦</Text>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        </View>
        <Pressable
          style={[styles.analyzeButton, { backgroundColor: accentColor + '22', borderColor: accentColor + '60' }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            requestInsight(request);
          }}
        >
          <Text style={[styles.analyzeButtonText, { color: accentColor }]}>
            Generate Wellness Insight
          </Text>
        </Pressable>
      </GlassCard>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  return (
    <GlassCard accentColor={accentColor} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.titleEmoji}>✦</Text>
        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        <ProviderBadge provider={insight.provider} isDark={isDark} />
      </View>

      <Text style={[styles.insightText, { color: textColor }]}>
        {insight.text}
      </Text>

      {/* Required disclaimer — never suppress */}
      <Text style={[styles.disclaimer, { color: mutedColor }]}>
        {insight.disclaimer}
      </Text>

      {/* Attribution */}
      <Text style={[styles.attribution, { color: mutedColor }]}>
        {providerInfo.attribution}
      </Text>

      {/* Refresh button */}
      <Pressable
        style={styles.refreshRow}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          requestInsight(request);
        }}
      >
        <Text style={[styles.refreshText, { color: accentColor }]}>Refresh insight</Text>
      </Pressable>
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  titleEmoji: {
    fontSize: 18,
    color: '#6366F1',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
  },
  providerEmoji: {
    fontSize: 10,
  },
  providerLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  insightText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10,
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 6,
    fontStyle: 'italic',
  },
  attribution: {
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
  },
  refreshRow: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  consentText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  consentButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  consentButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  analyzeButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  analyzeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
