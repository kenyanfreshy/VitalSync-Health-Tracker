/**
 * MomentumCard
 *
 * Displays today's step progress, streak, and a smart motivation message.
 * Designed to sit below the WeatherBadge on the Activity screen.
 *
 * No medical advice. Lifestyle guidance only.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, useLang } from '@/hooks';
import { logStrings } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MomentumCardProps {
  steps?: number | null;
  goal?: number | null;
  streak?: number | null;
  message: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MomentumCard({ steps, goal, streak, message }: MomentumCardProps) {
  const colors = useColors();
  const lang = useLang();
  const l = (logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en;
  const ACCENT = '#22C55E'; // green-500

  const stepsNum = steps ?? 0;
  const goalNum  = goal  ?? 10000;
  const progress = Math.min(stepsNum / goalNum, 1);
  const remaining = Math.max(goalNum - stepsNum, 0);

  const stepsLabel = useMemo(() => {
    if (stepsNum >= 1000) return `${(stepsNum / 1000).toFixed(1)}k`;
    return String(stepsNum);
  }, [stepsNum]);

  const goalLabel = useMemo(() => {
    if (goalNum >= 1000) return `${(goalNum / 1000).toFixed(0)}k`;
    return String(goalNum);
  }, [goalNum]);

  const remainingLabel = useMemo(() => {
    if (remaining >= 1000) return `${(remaining / 1000).toFixed(1)}k`;
    return String(remaining);
  }, [remaining]);

  const pct = Math.round(progress * 100);
  const goalReached = stepsNum >= goalNum;

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.surface,
        borderColor: ACCENT + '44',
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 5,
      },
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚡</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{l.momentumLabel}</Text>
        {(streak ?? 0) > 0 && (
          <View style={[styles.streakBadge, { backgroundColor: '#F97316' + '22', borderColor: '#F97316' + '55' }]}>
            <Text style={styles.streakText}>🔥 {streak}d streak</Text>
          </View>
        )}
      </View>

      {/* Progress row */}
      <View style={styles.progressRow}>
        <View style={styles.progressLeft}>
          <Text style={[styles.stepsValue, { color: goalReached ? ACCENT : colors.foreground }]}>
            {stepsLabel}
          </Text>
          <Text style={[styles.stepsGoal, { color: colors.muted }]}>/ {goalLabel} steps</Text>
        </View>
        <View style={styles.progressRight}>
          <Text style={[styles.pctLabel, { color: goalReached ? ACCENT : colors.muted }]}>
            {goalReached ? '✓ Goal reached' : `${remainingLabel} to go`}
          </Text>
          <Text style={[styles.pctNum, { color: goalReached ? ACCENT : colors.foreground }]}>
            {pct}%
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${pct}%` as any,
              backgroundColor: goalReached ? ACCENT : '#60A5FA',
            },
          ]}
        />
      </View>

      {/* Smart message */}
      <View style={[styles.messageRow, { backgroundColor: ACCENT + '10', borderColor: ACCENT + '33' }]}>
        <Text style={[styles.messageText, { color: ACCENT }]}>{message}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  headerIcon:  { fontSize: 18 },
  headerTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2, flex: 1 },
  streakBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  streakText: { fontSize: 11, fontWeight: '700', color: '#F97316' },
  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  progressLeft:  { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  progressRight: { alignItems: 'flex-end', gap: 2 },
  stepsValue:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  stepsGoal:     { fontSize: 13 },
  pctLabel:      { fontSize: 11 },
  pctNum:        { fontSize: 16, fontWeight: '700' },
  // Bar
  barTrack: {
    marginHorizontal: 14,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  // Message
  messageRow: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
