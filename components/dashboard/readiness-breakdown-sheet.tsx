/**
 * ReadinessBreakdownSheet
 *
 * A bottom sheet that shows the six component scores driving the Daily Readiness Score.
 * Opens when the user taps the DailyReadinessGauge.
 *
 * Design: Apple Health Pro aesthetic
 * - Dark frosted-glass modal
 * - Drag handle at top
 * - Each component shown as a labeled progress bar with score/max
 * - Animated progress bars fill on mount (staggered)
 * - Color-coded by score quality
 * - Native share button in header
 */
import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  Share } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
 Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { ReadinessComponents } from '@/lib/health/readiness-score';

interface ComponentRow {
  label: string;
  description: string;
  score: number;
  maxScore: number;
  emoji: string;
}

function getBarColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.85) return '#10B981'; // Emerald
  if (pct >= 0.65) return '#3B82F6'; // Blue
  if (pct >= 0.40) return '#F59E0B'; // Amber
  return '#EF4444';                  // Red
}

function getScoreLabel(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.85) return 'Optimal';
  if (pct >= 0.65) return 'Good';
  if (pct >= 0.40) return 'Fair';
  return 'Poor';
}

function buildShareText(components: ReadinessComponents): string {
  const overall = components.total;
  const label =
    overall >= 80 ? 'Optimal' :
    overall >= 60 ? 'Good' :
    overall >= 40 ? 'Fair' : 'Low';

  return (
    `VitalSync Readiness: ${overall}/100 — ${label}\n` +
    `\n` +
    `🌙 Sleep Duration:      ${components.sleepDuration}/25\n` +
    `😴 Sleep Efficiency:    ${components.sleepEfficiency}/20\n` +
    `❤️  Resting Heart Rate:  ${components.restingHR}/20\n` +
    `📈 HRV:                 ${components.hrv}/15\n` +
    `🫁 SpO₂:                ${components.spo2}/10\n` +
    `💧 Blood Pressure:      ${components.bp}/10\n` +
    `\nTracked with VitalSync Personal Health Hub`
  );
}

interface AnimatedBarProps {
  score: number;
  maxScore: number;
  color: string;
  delay: number;
}

function AnimatedBar({ score, maxScore, color, delay }: AnimatedBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      delay,
      withTiming(score / maxScore, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, maxScore, delay]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as `${number}%`,
  }), [width]);

  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, barStyle]} />
    </View>
  );
}

interface ReadinessBreakdownSheetProps {
  visible: boolean;
  onClose: () => void;
  components: ReadinessComponents;
}

export function ReadinessBreakdownSheet({
  visible,
  onClose,
  components,
}: ReadinessBreakdownSheetProps) {
  const rows: ComponentRow[] = [
    {
      label: 'Sleep Duration',
      description: 'Hours of sleep last night',
      score: components.sleepDuration,
      maxScore: 25,
      emoji: '🌙',
    },
    {
      label: 'Sleep Efficiency',
      description: 'Time asleep vs. time in bed',
      score: components.sleepEfficiency,
      maxScore: 20,
      emoji: '😴',
    },
    {
      label: 'Resting Heart Rate',
      description: 'Lower resting HR = better recovery',
      score: components.restingHR,
      maxScore: 20,
      emoji: '❤️',
    },
    {
      label: 'Heart Rate Variability',
      description: 'HRV reflects autonomic balance',
      score: components.hrv,
      maxScore: 15,
      emoji: '📈',
    },
    {
      label: 'Blood Oxygen (SpO₂)',
      description: 'Oxygen saturation during rest',
      score: components.spo2,
      maxScore: 10,
      emoji: '🫁',
    },
    {
      label: 'Blood Pressure',
      description: 'Cardiovascular stress indicator',
      score: components.bp,
      maxScore: 10,
      emoji: '💧',
    },
  ];

  const totalColor = getBarColor(components.total, 100);

  function handleClose() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
  }

  const handleShare = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const message = buildShareText(components);
      await Share.share({ message });
    } catch (_unused) {
      // User cancelled or share not available — silently ignore
    }
  }, [components]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose} />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderLeft}>
            <Text style={styles.sheetTitle}>Readiness Breakdown</Text>
            <Text style={styles.sheetSubtitle}>What&apos;s driving your score today</Text>
          </View>

          <View style={styles.sheetHeaderRight}>
            {/* Share button */}
            <Pressable
              style={({ pressed }) => [
                styles.shareBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleShare}
              accessibilityLabel="Share readiness score"
              accessibilityRole="button"
            >
              <Text style={styles.shareBtnText}>Share</Text>
            </Pressable>

            {/* Total score badge */}
            <View style={[styles.totalBadge, { backgroundColor: totalColor + '22', borderColor: totalColor + '55' }]}>
              <Text style={[styles.totalScore, { color: totalColor }]}>{components.total}</Text>
              <Text style={styles.totalMax}>/100</Text>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {rows.map((row, idx) => {
            const barColor = getBarColor(row.score, row.maxScore);
            const scoreLabel = getScoreLabel(row.score, row.maxScore);
            return (
              <View key={row.label} style={styles.row}>
                {/* Left: emoji + labels */}
                <View style={styles.rowLeft}>
                  <View style={[styles.rowEmoji, { backgroundColor: barColor + '18' }]}>
                    <Text style={styles.emojiText}>{row.emoji}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.rowTitleRow}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      <View style={[styles.scoreBadge, { backgroundColor: barColor + '22' }]}>
                        <Text style={[styles.scoreBadgeText, { color: barColor }]}>{scoreLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowDesc}>{row.description}</Text>
                    {/* Progress bar */}
                    <AnimatedBar
                      score={row.score}
                      maxScore={row.maxScore}
                      color={barColor}
                      delay={idx * 80}
                    />
                  </View>
                </View>
                {/* Right: score / max */}
                <View style={styles.rowRight}>
                  <Text style={[styles.rowScore, { color: barColor }]}>{row.score}</Text>
                  <Text style={styles.rowMax}>/{row.maxScore}</Text>
                </View>
              </View>
            );
          })}

          {/* No data notice */}
          {!components.hasData && (
            <View style={styles.noDataWrap}>
              <Text style={styles.noDataText}>
                Sync health data to see your breakdown.
              </Text>
            </View>
          )}

          {/* Score formula note */}
          <View style={styles.formulaNote}>
            <Text style={styles.formulaNoteText}>
              Score = Sleep Duration (25) + Sleep Efficiency (20) + Resting HR (20) + HRV (15) + SpO₂ (10) + BP (10)
            </Text>
          </View>
        </ScrollView>

        {/* Close button */}
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          onPress={handleClose}
        >
          <Text style={styles.closeBtnText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#111318',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sheetHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  sheetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  shareBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.2,
  },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
  },
  totalScore: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 30,
  },
  totalMax: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowEmoji: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emojiText: {
    fontSize: 18,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  scoreBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rowDesc: {
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 15,
  },
  barTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
    minWidth: 40,
    justifyContent: 'flex-end',
  },
  rowScore: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 20,
  },
  rowMax: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 1,
  },
  noDataWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noDataText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  formulaNote: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  formulaNoteText: {
    fontSize: 10,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.25)',
    lineHeight: 16,
    textAlign: 'center',
  },
  closeBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
