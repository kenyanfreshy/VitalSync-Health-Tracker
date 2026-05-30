/**
 * ReadinessBanner — compact horizontal readiness strip for the top of the dashboard.
 *
 * Shows a thin animated progress bar, a colour-coded score badge, a status label,
 * and three sub-metric chips (Sleep, BP, Glucose). Tapping opens the full breakdown sheet.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/glass-card';
import { useColorScheme, useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getReadinessColor(score: number): string {
  if (score >= 85) return '#10B981';
  if (score >= 65) return '#3B82F6';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function getReadinessLabel(score: number): string {
  if (score >= 85) return 'Optimal';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function getReadinessEmoji(score: number): string {
  if (score >= 85) return '🟢';
  if (score >= 65) return '🔵';
  if (score >= 40) return '🟡';
  return '🔴';
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ReadinessBannerProps {
  score: number;
  isLoading?: boolean;
  hasData?: boolean;
  /** Sleep duration in hours */
  sleepHrs?: number | null;
  /** Sleep efficiency 0–100 */
  sleepEff?: number | null;
  /** Latest systolic BP */
  bpSystolic?: number | null;
  /** Latest glucose mg/dL */
  glucose?: number | null;
  onPress?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ReadinessBanner({
  score,
  isLoading = false,
  hasData = false,
  sleepHrs,
  sleepEff,
  bpSystolic,
  glucose,
  onPress,
}: ReadinessBannerProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLoading || !hasData) {
      progressAnim.setValue(0);
      return;
    }
    Animated.timing(progressAnim, {
      toValue: score / 100,
      duration: 900,
      useNativeDriver: false,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, isLoading, hasData]);

  const accentColor = hasData ? getReadinessColor(score) : colors.muted;
  const label = hasData ? getReadinessLabel(score) : 'No data';
  const emoji = hasData ? getReadinessEmoji(score) : '⚪';

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Sub-metric chips
  const chips: { icon: string; value: string; color: string }[] = [];
  if (sleepHrs != null) {
    chips.push({ icon: '🌙', value: `${sleepHrs.toFixed(1)}h`, color: '#8B5CF6' });
  }
  if (bpSystolic != null) {
    chips.push({ icon: '❤️', value: `${Math.round(bpSystolic)} sys`, color: '#EF4444' });
  }
  if (glucose != null) {
    chips.push({ icon: '🩸', value: `${Math.round(glucose)} mg/dL`, color: '#F59E0B' });
  }

  return (
    <GlassCard
      accentColor={accentColor}
      noPadding
      style={styles.card}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        style={({ pressed }) => [styles.inner, pressed && { opacity: 0.82 }]}
        accessibilityRole="button"
        accessibilityLabel={`Daily Readiness: ${hasData ? score + ' — ' + label : 'No data yet'}`}
      >
        {/* Left: score badge */}
        <View style={[styles.scoreBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '50' }]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <>
              <Text style={[styles.scoreNum, { color: accentColor }]}>
                {hasData ? score : '—'}
              </Text>
              <Text style={[styles.scoreMax, { color: accentColor + 'AA' }]}>/100</Text>
            </>
          )}
        </View>

        {/* Centre: label + bar + chips */}
        <View style={styles.centre}>
          <View style={styles.labelRow}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>DAILY READINESS</Text>
            <Text style={styles.statusEmoji}>{emoji}</Text>
            <Text style={[styles.statusLabel, { color: accentColor }]}>{label}</Text>
          </View>

          {/* Progress bar */}
          <View style={[styles.track, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
            <Animated.View style={[styles.fill, { width: barWidth, backgroundColor: accentColor }]} />
          </View>

          {/* Sub-metric chips */}
          {chips.length > 0 && (
            <View style={styles.chipsRow}>
              {chips.map((chip) => (
                <View key={chip.icon} style={[styles.chip, { backgroundColor: chip.color + '18' }]}>
                  <Text style={styles.chipIcon}>{chip.icon}</Text>
                  <Text style={[styles.chipText, { color: chip.color }]}>{chip.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Right: chevron */}
        <View style={styles.chevronWrap}>
          <IconSymbol name="chevron.right" size={14} color={colors.muted} />
        </View>
      </Pressable>
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  scoreBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoreNum: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  scoreMax: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  centre: {
    flex: 1,
    gap: 5,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusEmoji: {
    fontSize: 10,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  track: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipIcon: {
    fontSize: 10,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  chevronWrap: {
    flexShrink: 0,
  },
});
