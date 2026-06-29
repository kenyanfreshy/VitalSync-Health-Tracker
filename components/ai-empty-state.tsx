/**
 * AIEmptyState — Generic empty state component for AI feature failures
 *
 * Renders a clean, informative empty state when an AI feature cannot run due to:
 *   - HealthKit denied
 *   - AI unavailable (Foundation Models / Gemini)
 *   - USDA API failure
 *   - Insufficient data
 *   - Subscription inactive
 *   - Consent missing
 *
 * Usage:
 *   <AIEmptyState
 *     reason="insufficient_data"
 *     message="Log 3 more blood pressure readings to unlock AI analysis."
 *     actionLabel="Log Data"
 *     onAction={() => router.push('/(tabs)/record')}
 *   />
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { SafetyFailureReason } from '@/lib/ai/runtime-safety';
import { getEmptyStateMessage } from '@/lib/ai/runtime-safety';

interface Props {
  /** Machine-readable failure reason — used to pick default title/subtitle/icon */
  reason?: SafetyFailureReason;
  /** Override the default title */
  title?: string;
  /** Override the default subtitle / message */
  message?: string;
  /** Override the default icon */
  icon?: string;
  /** CTA button label */
  actionLabel?: string;
  /** CTA button handler */
  onAction?: () => void;
  /** Additional container style */
  compact?: boolean;
}

export function AIEmptyState({
  reason,
  title,
  message,
  icon,
  actionLabel,
  onAction,
  compact = false,
}: Props) {
  const colors = useColors();

  const defaults = reason ? getEmptyStateMessage(reason) : {
    icon: '✨',
    title: 'AI Insights',
    subtitle: 'AI analysis is not available right now.',
  };

  const displayIcon = icon ?? defaults.icon;
  const displayTitle = title ?? defaults.title;
  const displayMessage = message ?? defaults.subtitle;

  return (
    <View style={[
      styles.container,
      compact && styles.containerCompact,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ]}>
      <Text style={styles.icon}>{displayIcon}</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {displayTitle}
      </Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {displayMessage}
      </Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
          onPress={onAction}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        For informational purposes only. Not medical advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  containerCompact: {
    padding: 16,
    gap: 6,
  },
  icon: {
    fontSize: 36,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  actionBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.7,
  },
});
