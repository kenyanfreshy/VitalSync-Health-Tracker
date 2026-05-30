/**
 * SparklineDetailSheet
 *
 * A compact bottom sheet that expands when the user taps the sparkline area
 * on a BentoMetricTile. Shows the 7-day daily values as:
 *   • A header with the metric title, unit, and trend direction
 *   • A row-per-day list with a proportional bar and the numeric value
 *   • A footer note showing the date range
 *
 * Design: matches the tile's accent colour, dark-mode aware, no navigation.
 * Dismiss: tap the backdrop or the close handle.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SparklineDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Metric display name, e.g. "Blood Pressure" */
  title: string;
  /** Unit string, e.g. "mmHg" or "%" */
  unit: string;
  /** Accent colour matching the parent tile */
  accentColor: string;
  /**
   * Array of daily average values, oldest → newest (length ≤ 7).
   * Gaps (days with no data) should be represented as 0 or NaN.
   */
  data: number[];
  /**
   * When true (default), higher values are shown as better (green bar).
   * Set false for BP, resting HR, weight.
   */
  higherIsBetter?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return short day labels for the last N days, oldest first. */
function buildDayLabels(count: number): string[] {
  const labels: string[] = [];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(i === 0 ? 'Today' : DAY_NAMES[d.getDay()]);
  }
  return labels;
}

/** Format a numeric value for display, rounding to 1 decimal if needed. */
function formatValue(v: number, unit: string): string {
  if (!isFinite(v) || v === 0) return '—';
  const rounded = Number.isInteger(v) ? v : parseFloat(v.toFixed(1));
  return `${rounded} ${unit}`;
}

/** Compute trend direction from first and last valid values. */
function getTrend(
  data: number[],
  higherIsBetter: boolean,
): 'improving' | 'declining' | 'flat' {
  const valid = data.filter(v => isFinite(v) && v > 0);
  if (valid.length < 2) return 'flat';
  const first = valid[0];
  const last = valid[valid.length - 1];
  const delta = last - first;
  const threshold = Math.abs(first) * 0.02;
  if (Math.abs(delta) < threshold) return 'flat';
  if (higherIsBetter) return delta > 0 ? 'improving' : 'declining';
  return delta < 0 ? 'improving' : 'declining';
}

const TREND_LABELS: Record<string, string> = {
  improving: '↑ Improving',
  declining: '↓ Declining',
  flat: '→ Stable',
};

const TREND_COLORS: Record<string, string> = {
  improving: '#22C55E',
  declining: '#EF4444',
  flat: '#9BA1A6',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SparklineDetailSheet({
  visible,
  onClose,
  title,
  unit,
  accentColor,
  data,
  higherIsBetter = true,
}: SparklineDetailSheetProps) {
  const colors = useColors();

  // ── Slide-up animation ───────────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const validData = data.filter(v => isFinite(v) && v > 0);
  const maxVal = validData.length > 0 ? Math.max(...validData) : 1;
  const minVal = validData.length > 0 ? Math.min(...validData) : 0;
  const range = maxVal - minVal || 1;
  const dayLabels = buildDayLabels(data.length);
  const trend = getTrend(data, higherIsBetter);
  const trendColor = TREND_COLORS[trend];
  const trendLabel = TREND_LABELS[trend];

  // Date range footer
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (data.length - 1));
  const dateRangeText = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: backdropAnim },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: accentColor + '30',
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.headerUnit, { color: colors.muted }]}>{unit}</Text>
          </View>
          <View style={[styles.trendBadge, { backgroundColor: trendColor + '18', borderColor: trendColor + '44' }]}>
            <Text style={[styles.trendText, { color: trendColor }]}>{trendLabel}</Text>
          </View>
        </View>

        {/* Daily rows */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        >
          {data.map((val, i) => {
            const hasValue = isFinite(val) && val > 0;
            // Bar width: proportional to (val - min) / range, min bar 4%
            const barFraction = hasValue
              ? Math.max(0.04, (val - minVal) / range)
              : 0;
            // Colour: accent for latest, muted for older
            const isLatest = i === data.length - 1;
            const barColor = isLatest ? accentColor : accentColor + '70';

            return (
              <View key={i} style={styles.dayRow}>
                {/* Day label */}
                <Text
                  style={[
                    styles.dayLabel,
                    { color: isLatest ? colors.foreground : colors.muted },
                    isLatest && styles.dayLabelToday,
                  ]}
                >
                  {dayLabels[i]}
                </Text>

                {/* Bar track */}
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  {hasValue && (
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${(barFraction * 100).toFixed(1)}%` as `${number}%`,
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  )}
                </View>

                {/* Value */}
                <Text
                  style={[
                    styles.valueText,
                    { color: hasValue ? (isLatest ? colors.foreground : colors.muted) : colors.border },
                    isLatest && styles.valueTextToday,
                  ]}
                >
                  {formatValue(val, unit)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            {dateRangeText} · Daily averages
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerUnit: {
    fontSize: 13,
    fontWeight: '500',
  },
  trendBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    gap: 10,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayLabel: {
    width: 38,
    fontSize: 12,
    fontWeight: '500',
  },
  dayLabelToday: {
    fontWeight: '700',
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  valueText: {
    width: 72,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
  valueTextToday: {
    fontWeight: '700',
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
  },
});
