/**
 * components/scribe-confidence-badge.tsx
 *
 * A small coloured badge that indicates how confident the Scribe parser was
 * when auto-filling a form field from a voice transcript.
 *
 * Colours:
 *   high   → green  (#22C55E) — explicit keyword + numeric match
 *   medium → amber  (#F59E0B) — partial keyword or inferred value
 *   low    → slate  (#94A3B8) — fallback / heuristic match
 *
 * Usage:
 *   <ScribeConfidenceBadge confidence="high" />
 *   <ScribeConfidenceBadge confidence={null} />   ← renders nothing
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { FieldConfidence } from '@/lib/scribe/confidence';

interface ScribeConfidenceBadgeProps {
  /** Confidence level returned by the scorer, or null to render nothing. */
  confidence: FieldConfidence | null | undefined;
  /** Optional override label. Defaults to the confidence level string. */
  label?: string;
  /** Additional style overrides for the outer container. */
  style?: object;
}

const CONFIG: Record<FieldConfidence, { bg: string; dot: string; text: string; label: string }> = {
  high: {
    bg: 'rgba(34, 197, 94, 0.12)',
    dot: '#22C55E',
    text: '#16A34A',
    label: 'High',
  },
  medium: {
    bg: 'rgba(245, 158, 11, 0.12)',
    dot: '#F59E0B',
    text: '#D97706',
    label: 'Check',
  },
  low: {
    bg: 'rgba(148, 163, 184, 0.12)',
    dot: '#94A3B8',
    text: '#64748B',
    label: 'Low',
  },
};

export function ScribeConfidenceBadge({
  confidence,
  label,
  style,
}: ScribeConfidenceBadgeProps) {
  if (!confidence) return null;

  const cfg = CONFIG[confidence];
  const displayLabel = label ?? cfg.label;

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }, style]}>
      <View style={[styles.dot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.text, { color: cfg.text }]}>{displayLabel}</Text>
    </View>
  );
}

/**
 * ScribeFieldRow — wraps a label + field value with an optional confidence badge.
 * Renders the badge inline to the right of the label.
 */
interface ScribeFieldRowProps {
  label: string;
  confidence: FieldConfidence | null | undefined;
  children: React.ReactNode;
}

export function ScribeFieldRow({ label, confidence, children }: ScribeFieldRowProps) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {confidence ? <ScribeConfidenceBadge confidence={confidence} style={styles.badgeInline} /> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 4,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  fieldRow: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#687076',
  },
  badgeInline: {
    marginLeft: 2,
  },
});
