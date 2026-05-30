/**
 * NeoSleepDashboardWidget
 *
 * Compact 3-night sleep visualization for the Dashboard home screen.
 * Wrapped in the same 3D glass shell (GlassCard) used across all Dashboard cards.
 *
 * Visual design:
 *   - GlassCard with indigo accent (#6366F1) — matches the sleep purple brand
 *   - Header row: "Sleep" label + chronotype emoji + "View all →" chevron
 *   - 3-column mini-chart: one column per night (last 3 nights, oldest → newest)
 *     • Stacked stage bars (Deep / Core / REM / Awake) with neon colours
 *     • Pulsing glow orb on the best-deep-sleep night
 *     • Day label + total hours below each bar
 *   - Footer row: avg hours, avg efficiency, goal progress pill
 *   - Tap anywhere → navigate to full Sleep tab
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useColorScheme,
  Modal,
  Pressable,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import {
  Rect,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/glass-card';
import { NeoSleepWeeklyChart } from '@/components/neo-sleep-3d-chart';
import type { SleepRecord } from '@/lib/health/types';
import {
  DEFAULT_SLEEP_GOAL_HRS,
  MIN_SLEEP_GOAL_HRS,
  MAX_SLEEP_GOAL_HRS,
} from '@/hooks/use-sleep-goal';

// Animated SVG circle for the pulsing glow orb
const _AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#6366F1';        // indigo — sleep brand colour
const BAR_W  = 28;               // width of each stage bar column
const BAR_MAX_H = 96;            // max bar height in px
const _STAGE_COLORS = {
  deep:  { fill: '#6D28D9', glow: '#818CF8' },
  core:  { fill: '#0369A1', glow: '#38BDF8' },
  rem:   { fill: '#0E7490', glow: '#22D3EE' },
  awake: { fill: '#BE123C', glow: '#FF6B8A' },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ymd(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yest.';
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fmtHrs(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NightSlot {
  label: string;
  totalMins: number;
  stages: { deep: number; core: number; rem: number; awake: number };
  efficiency: number;
}

interface Props {
  records: SleepRecord[];
  goalHrs: number;
  onPress: () => void;
  onLogSleep?: () => void;
  onViewChart?: () => void;
  onSetGoal?: (hrs: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NeoSleepDashboardWidget({
  records,
  goalHrs,
  onPress,
  onLogSleep,
  onViewChart,
  onSetGoal,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // ── Collapse state (chart collapsed by default) ─────────────────────────
  const [chartExpanded, setChartExpanded] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;

  // Reanimated height for smooth collapse/expand
  const bodyHeight = useSharedValue(0);
  const measuredBodyHeight = useRef(0);

  const bodyAnimStyle = useAnimatedStyle(() => ({
    height: bodyHeight.value,
    overflow: 'hidden' as const,
  }));

  const toggleChart = useCallback(() => {
    const expanding = !chartExpanded;
    setChartExpanded(expanding);
    const targetH = expanding ? measuredBodyHeight.current : 0;
    bodyHeight.value = withTiming(targetH, {
      duration: 300,
      easing: Easing.inOut(Easing.quad),
    });
    Animated.spring(chevronAnim, { toValue: expanding ? 1 : 0, useNativeDriver: true, damping: 16, stiffness: 260 }).start();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [chartExpanded, chevronAnim, bodyHeight]);

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  // ── Context menu state ───────────────────────────────────────────────────
  const [menuVisible, setMenuVisible] = useState(false);
  const [goalStep, setGoalStep] = useState(false);   // true = show goal stepper
  const [draftGoal, setDraftGoal] = useState(goalHrs);

  // Spring-in animation for the menu sheet
  const menuScale = useRef(new Animated.Value(0.88)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;

  const openMenu = useCallback(() => {
    setDraftGoal(goalHrs);
    setGoalStep(false);
    setMenuVisible(true);
    menuScale.setValue(0.88);
    menuOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(menuScale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 280 }),
      Animated.timing(menuOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [goalHrs, menuScale, menuOpacity]);

  const closeMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(menuScale, { toValue: 0.92, duration: 140, useNativeDriver: true }),
      Animated.timing(menuOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setMenuVisible(false);
      setGoalStep(false);
    });
  }, [menuScale, menuOpacity]);

  // ── Build last-3-night slots ─────────────────────────────────────────────
  const slots: NightSlot[] = useMemo(() => {
    const dayMap: Record<string, SleepRecord> = {};
    for (const r of records) {
      const key = r.date ?? r.bedtime?.slice(0, 10) ?? '';
      if (!key) continue;
      if (!dayMap[key] || r.bedtime > dayMap[key].bedtime) dayMap[key] = r;
    }
    // offsets 2, 1, 0 → oldest first so chart reads left→right = past→present
    return [2, 1, 0].map(offset => {
      const key = ymd(offset);
      const rec = dayMap[key] ?? null;
      const totalMins = rec?.totalMinutes ?? 0;
      const deepMins  = rec?.deepMinutes  ?? 0;
      const remMins   = rec?.remMinutes   ?? 0;
      const awakeMins = rec?.awakeMinutes ?? 0;
      const coreMins  = rec?.coreMinutes != null
        ? rec.coreMinutes
        : Math.max(0, totalMins - deepMins - remMins - awakeMins);
      return {
        label: dayLabel(offset),
        totalMins,
        stages: { deep: deepMins, core: coreMins, rem: remMins, awake: awakeMins },
        efficiency: rec?.efficiency ?? 0,
      };
    });
  }, [records]);

  const hasData = slots.some(s => s.totalMins > 0);
  const _maxMins = Math.max(goalHrs * 60, ...slots.map(s => s.totalMins), 1);

  // ── Summary stats ────────────────────────────────────────────────────────
  const { avgHrs, avgEff, goalNights } = useMemo(() => {
    const withData = slots.filter(s => s.totalMins > 0);
    const avg = withData.length
      ? parseFloat((withData.reduce((s, r) => s + r.totalMins, 0) / withData.length / 60).toFixed(1))
      : null;
    const eff = withData.filter(s => s.efficiency > 0);
    const avgEffVal = eff.length
      ? Math.round(eff.reduce((s, r) => s + r.efficiency, 0) / eff.length)
      : null;
    const met = withData.filter(s => s.totalMins / 60 >= goalHrs).length;
    return { avgHrs: avg, avgEff: avgEffVal, goalNights: met };
  }, [slots, goalHrs]);

  // ── Best deep-sleep night index (for pulsing orb) ────────────────────────
  const _bestDeepIdx = useMemo(() => {
    let best = -1;
    let bestDeep = 0;
    slots.forEach((s, i) => {
      if (s.stages.deep > bestDeep) { bestDeep = s.stages.deep; best = i; }
    });
    return bestDeep > 45 ? best : -1;
  }, [slots]);

  // ── Pulsing glow animation for best-deep orb ─────────────────────────────
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1400, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const _pulseR  = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [9, 14] });
  const _pulseOp = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  // ── Colours ──────────────────────────────────────────────────────────────
  const labelColor  = isDark ? '#94A3B8' : '#64748B';
  const _valueColor  = isDark ? '#E2E8F0' : '#1E293B';
  const _mutedColor  = isDark ? '#475569' : '#94A3B8';
  const _emptyColor  = isDark ? '#1E293B' : '#F1F5F9';

  // ── SVG bar chart dimensions ──────────────────────────────────────────────
  const _SVG_W = BAR_W * 3 + 32; // 3 bars + 2 gaps of 16
  const _SVG_H = BAR_MAX_H + 4;
  const _barXs = [0, BAR_W + 16, (BAR_W + 16) * 2];

  return (
    <>
    <GlassCard
      accentColor={ACCENT}
      onPress={onPress}
      onLongPress={openMenu}
      style={styles.card}
      noPadding
    >
      <View style={styles.inner}>
        {/* ── Header (tap to expand/collapse) ─────────────────────────────── */}
        <Pressable
          onPress={toggleChart}
          style={styles.header}
          accessibilityRole="button"
          accessibilityLabel={`Sleep section, ${chartExpanded ? 'expanded' : 'collapsed'}. Tap to ${chartExpanded ? 'collapse' : 'expand'}.`}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.headerEmoji}>🌙</Text>
            <View>
              <Text style={[styles.headerTitle, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>
                Sleep
              </Text>
              <Text style={[styles.headerSub, { color: labelColor }]}>
                {chartExpanded ? 'Last 3 nights' : (hasData && avgHrs != null ? `Avg ${avgHrs}h · tap to expand` : 'Tap to expand')}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Animated.Text style={[styles.viewAll, { color: isDark ? '#818CF8' : '#6366F1', transform: [{ rotate: chevronRotate }] }]}>
              ⌃
            </Animated.Text>
          </View>
        </Pressable>

        {/* ── Animated collapsible body (chart + footer) ──────────────────────── */}
        <Reanimated.View style={bodyAnimStyle}>
          {/* Inner view: measured once to get natural height */}
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && measuredBodyHeight.current === 0) {
                measuredBodyHeight.current = h;
              }
            }}
          >
            <View style={styles.neoChartWrap} pointerEvents="none">
              <NeoSleepWeeklyChart
                records={records}
                goalHrs={goalHrs}
                colors={{} as any}
                isDark={isDark}
                compact
              />
            </View>

            {hasData && (
          <View style={[styles.footer, { borderTopColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }]}>
            {/* Avg hours */}
            <View style={styles.footerStat}>
              <Text style={[styles.footerValue, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>
                {avgHrs != null ? `${avgHrs}h` : '—'}
              </Text>
              <Text style={[styles.footerLabel, { color: labelColor }]}>Avg</Text>
            </View>

            {/* Divider */}
            <View style={[styles.footerDivider, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }]} />

            {/* Avg efficiency */}
            <View style={styles.footerStat}>
              <Text style={[styles.footerValue, {
                color: avgEff == null ? labelColor
                  : avgEff >= 85 ? (isDark ? '#4ADE80' : '#16A34A')
                  : avgEff >= 70 ? (isDark ? '#FBBF24' : '#D97706')
                  : (isDark ? '#F87171' : '#DC2626'),
              }]}>
                {avgEff != null ? `${avgEff}%` : '—'}
              </Text>
              <Text style={[styles.footerLabel, { color: labelColor }]}>Eff.</Text>
            </View>

            {/* Divider */}
            <View style={[styles.footerDivider, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }]} />

            {/* Goal nights pill */}
            <View style={styles.footerStat}>
              <View style={[
                styles.goalPill,
                {
                  backgroundColor: goalNights === 3
                    ? (isDark ? 'rgba(74,222,128,0.15)' : 'rgba(22,163,74,0.10)')
                    : (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)'),
                  borderColor: goalNights === 3
                    ? (isDark ? 'rgba(74,222,128,0.35)' : 'rgba(22,163,74,0.25)')
                    : (isDark ? 'rgba(99,102,241,0.30)' : 'rgba(99,102,241,0.20)'),
                },
              ]}>
                <Text style={[styles.goalPillText, {
                  color: goalNights === 3
                    ? (isDark ? '#4ADE80' : '#16A34A')
                    : (isDark ? '#818CF8' : '#6366F1'),
                }]}>
                  {goalNights}/3 goal met
                </Text>
              </View>
              <Text style={[styles.footerLabel, { color: labelColor }]}>≥{goalHrs}h</Text>
            </View>
          </View>
            )}
          </View>{/* end inner measurement View */}
        </Reanimated.View>{/* end animated body */}
      </View>
    </GlassCard>

    {/* ── Long-press context menu ────────────────────────────────────────────── */}
    <Modal
      visible={menuVisible}
      transparent
      animationType="none"
      onRequestClose={closeMenu}
    >
      {/* Backdrop */}
      <Pressable
        style={styles.menuBackdrop}
        onPress={closeMenu}
        accessibilityLabel="Close menu"
      />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.menuSheet,
          {
            backgroundColor: isDark ? '#161B22' : '#FFFFFF',
            borderColor: isDark ? 'rgba(99,102,241,0.28)' : 'rgba(99,102,241,0.16)',
            transform: [{ scale: menuScale }],
            opacity: menuOpacity,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.menuHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />

        {/* Header */}
        <View style={styles.menuHeader}>
          <Text style={styles.menuEmoji}>🌙</Text>
          <Text style={[styles.menuTitle, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>Sleep</Text>
        </View>

        {!goalStep ? (
          /* ── Action list ──────────────────────────────────────────────── */
          <View style={styles.menuActions}>
            {/* Log sleep */}
            <TouchableOpacity
              style={[styles.menuRow, { borderBottomColor: isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.10)' }]}
              onPress={() => {
                closeMenu();
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onLogSleep?.();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuRowIcon, { backgroundColor: 'rgba(99,102,241,0.14)' }]}>
                <Text style={styles.menuRowEmoji}>✏️</Text>
              </View>
              <View style={styles.menuRowText}>
                <Text style={[styles.menuRowTitle, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>Log sleep</Text>
                <Text style={[styles.menuRowSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Record tonight’s sleep</Text>
              </View>
              <Text style={[styles.menuChevron, { color: isDark ? '#4F46E5' : '#6366F1' }]}>›</Text>
            </TouchableOpacity>

            {/* View weekly chart */}
            <TouchableOpacity
              style={[styles.menuRow, { borderBottomColor: isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.10)' }]}
              onPress={() => {
                closeMenu();
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onViewChart?.();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuRowIcon, { backgroundColor: 'rgba(99,102,241,0.14)' }]}>
                <Text style={styles.menuRowEmoji}>📊</Text>
              </View>
              <View style={styles.menuRowText}>
                <Text style={[styles.menuRowTitle, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>View weekly chart</Text>
                <Text style={[styles.menuRowSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>7-night sleep analysis</Text>
              </View>
              <Text style={[styles.menuChevron, { color: isDark ? '#4F46E5' : '#6366F1' }]}>›</Text>
            </TouchableOpacity>

            {/* Set sleep goal */}
            <TouchableOpacity
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setGoalStep(true);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuRowIcon, { backgroundColor: 'rgba(99,102,241,0.14)' }]}>
                <Text style={styles.menuRowEmoji}>🎯</Text>
              </View>
              <View style={styles.menuRowText}>
                <Text style={[styles.menuRowTitle, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>Set sleep goal</Text>
                <Text style={[styles.menuRowSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Current: {goalHrs}h per night</Text>
              </View>
              <Text style={[styles.menuChevron, { color: isDark ? '#4F46E5' : '#6366F1' }]}>›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Goal stepper ───────────────────────────────────────────────── */
          <View style={styles.goalStepperWrap}>
            <Text style={[styles.goalStepperLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Sleep goal per night
            </Text>
            <View style={styles.goalStepperRow}>
              {/* Decrement */}
              <TouchableOpacity
                style={[styles.stepperBtn, {
                  backgroundColor: draftGoal <= MIN_SLEEP_GOAL_HRS ? (isDark ? '#1E293B' : '#F1F5F9') : 'rgba(99,102,241,0.14)',
                  borderColor: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.20)',
                }]}
                onPress={() => {
                  const next = Math.max(MIN_SLEEP_GOAL_HRS, Math.round((draftGoal - 0.5) * 2) / 2);
                  setDraftGoal(next);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                disabled={draftGoal <= MIN_SLEEP_GOAL_HRS}
                activeOpacity={0.7}
              >
                <Text style={[styles.stepperBtnText, { color: draftGoal <= MIN_SLEEP_GOAL_HRS ? (isDark ? '#334155' : '#CBD5E1') : (isDark ? '#818CF8' : '#6366F1') }]}>−</Text>
              </TouchableOpacity>

              {/* Value */}
              <View style={styles.stepperValue}>
                <Text style={[styles.stepperValueText, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>{draftGoal}h</Text>
                <Text style={[styles.stepperValueSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  {draftGoal < 7 ? 'Below recommended' : draftGoal <= 9 ? 'Recommended' : 'Above recommended'}
                </Text>
              </View>

              {/* Increment */}
              <TouchableOpacity
                style={[styles.stepperBtn, {
                  backgroundColor: draftGoal >= MAX_SLEEP_GOAL_HRS ? (isDark ? '#1E293B' : '#F1F5F9') : 'rgba(99,102,241,0.14)',
                  borderColor: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.20)',
                }]}
                onPress={() => {
                  const next = Math.min(MAX_SLEEP_GOAL_HRS, Math.round((draftGoal + 0.5) * 2) / 2);
                  setDraftGoal(next);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                disabled={draftGoal >= MAX_SLEEP_GOAL_HRS}
                activeOpacity={0.7}
              >
                <Text style={[styles.stepperBtnText, { color: draftGoal >= MAX_SLEEP_GOAL_HRS ? (isDark ? '#334155' : '#CBD5E1') : (isDark ? '#818CF8' : '#6366F1') }]}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Save / Cancel */}
            <View style={styles.goalStepperBtns}>
              <TouchableOpacity
                style={[styles.goalCancelBtn, { borderColor: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.20)' }]}
                onPress={() => setGoalStep(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.goalCancelText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.goalSaveBtn, { backgroundColor: isDark ? '#4F46E5' : '#6366F1' }]}
                onPress={() => {
                  onSetGoal?.(draftGoal);
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  closeMenu();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.goalSaveText}>Save {draftGoal}h goal</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  inner: {
    padding: 16,
    gap: 12,
  },

  // NeoSleep chart embed
  neoChartWrap: {
    marginHorizontal: -16,
    marginTop: -4,
    marginBottom: -4,
    overflow: 'visible',
    borderRadius: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerRight: {},
  viewAll: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Chart
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  barCol: {
    alignItems: 'center',
    gap: 4,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  barLabelToday: {
    fontWeight: '800',
  },
  barHrs: {
    fontSize: 9,
    fontWeight: '600',
  },

  // Legend
  legend: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 11,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 0,
  },
  footerStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  footerValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  footerDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 4,
  },
  goalPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  goalPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Context menu ────────────────────────────────────────────────────────────────────────────
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  menuSheet: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 40,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingBottom: 16,
    overflow: 'hidden',
    // Glass shadow
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 14,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(99,102,241,0.14)',
  },
  menuEmoji: {
    fontSize: 20,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  menuActions: {
    paddingTop: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowEmoji: {
    fontSize: 18,
  },
  menuRowText: {
    flex: 1,
    gap: 1,
  },
  menuRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuRowSub: {
    fontSize: 11,
    fontWeight: '400',
  },
  menuChevron: {
    fontSize: 18,
    fontWeight: '300',
  },

  // ── Goal stepper ────────────────────────────────────────────────────────────────────────────
  goalStepperWrap: {
    padding: 20,
    gap: 16,
  },
  goalStepperLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  goalStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
  },
  stepperValue: {
    alignItems: 'center',
    minWidth: 80,
    gap: 2,
  },
  stepperValueText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  stepperValueSub: {
    fontSize: 10,
    fontWeight: '500',
  },
  goalStepperBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  goalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  goalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  goalSaveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  goalSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
