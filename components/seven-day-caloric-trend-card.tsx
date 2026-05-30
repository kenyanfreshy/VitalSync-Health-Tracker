/**
 * SevenDayCaloricTrendCard — Collapsible Dashboard Card
 *
 * Header always visible: title + 7-day average chip + trend arrow + streak badge.
 * Tap to collapse/expand the bar chart with goal line.
 *
 * Features:
 * - Today's bar has a thin accent-colored border ring for clear identification
 * - Card defaults to expanded for immediate caloric context
 * - Stats row includes a surplus/deficit chip (+X kcal / −X kcal vs goal)
 *   that opens a full daily breakdown modal on tap
 * - Card footer has an inline exercise bonus editor (persisted to AsyncStorage)
 * - Header shows a 🔥 N-day streak badge for consecutive on-target days (±10%)
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ConfettiCannon from 'react-native-confetti-cannon';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  Animated,
} from 'react-native';
import Svg, { Rect, Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import { CaloricBreakdownModal } from '@/components/caloric-breakdown-modal';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { SodiumRecord } from '@/lib/health/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SevenDayCaloricTrendCardProps {
  sodiumRecords: SodiumRecord[];
  goalKcal?: number;
  defaultExpanded?: boolean;
  /** External override from Collapse All / Expand All toggle. */
  overrideExpanded?: boolean;
}

interface DayCalories {
  label: string;
  date: string;
  kcal: number;
  isToday: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXERCISE_BONUS_KEY = '@vitalsync/exercise_bonus_kcal_v1';
const FREEZE_KEY         = '@vitalsync/streak_freeze_v1';
// Freeze token: { available: boolean, lastRechargeTs: number }
interface FreezeToken { available: boolean; lastRechargeTs: number; }

const CHART_W  = Dimensions.get('window').width - 64;
const CHART_H  = 110;
const PAD_X    = 24;
const PAD_Y    = 12;
const SLOT_W   = (CHART_W - PAD_X * 2) / 7;
const BAR_W    = Math.min(32, Math.max(14, Math.floor(SLOT_W * 0.55)));
const RING_INSET = 1;

// ─── Component ────────────────────────────────────────────────────────────────

export function SevenDayCaloricTrendCard({
  sodiumRecords,
  goalKcal = 2000,
  defaultExpanded = true,
  overrideExpanded,
}: SevenDayCaloricTrendCardProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useCardExpanded('seven-day-caloric-trend', defaultExpanded, overrideExpanded);

  // ── Exercise bonus (persisted) ────────────────────────────────────────────
  const [exerciseBonusKcal, setExerciseBonusKcal] = useState(0);
  const [bonusInput, setBonusInput] = useState('');
  const [editingBonus, setEditingBonus] = useState(false);
  const bonusInputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem(EXERCISE_BONUS_KEY)
      .then((v) => { if (v !== null) setExerciseBonusKcal(parseInt(v, 10) || 0); })
      .catch(() => {});
  }, []);

  function openBonusEditor() {
    setBonusInput(exerciseBonusKcal > 0 ? String(exerciseBonusKcal) : '');
    setEditingBonus(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => bonusInputRef.current?.focus(), 80);
  }

  function commitBonus() {
    const val = Math.max(0, parseInt(bonusInput, 10) || 0);
    setExerciseBonusKcal(val);
    safeSetItem(EXERCISE_BONUS_KEY, String(val)).catch(() => {});
    setEditingBonus(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function clearBonus() {
    setExerciseBonusKcal(0);
    safeSetItem(EXERCISE_BONUS_KEY, '0').catch(() => {});
    setEditingBonus(false);
  }

  const adjustedGoal = goalKcal + exerciseBonusKcal;

  // ── Streak freeze token ────────────────────────────────────────────────────────────────────────────────────
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const [freeze, setFreeze] = useState<FreezeToken>({ available: true, lastRechargeTs: Date.now() });
  useEffect(() => {
    AsyncStorage.getItem(FREEZE_KEY)
      .then((raw) => {
        if (!raw) return;
        const stored: FreezeToken = JSON.parse(raw);
        // Auto-recharge if 7 days have passed since last recharge
        const recharged = !stored.available && Date.now() - stored.lastRechargeTs >= SEVEN_DAYS_MS;
        if (recharged) {
          const updated: FreezeToken = { available: true, lastRechargeTs: Date.now() };
          setFreeze(updated);
          safeSetItem(FREEZE_KEY, JSON.stringify(updated)).catch(() => {});
        } else {
          setFreeze(stored);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useFreeze() {
    if (!freeze.available) return;
    Alert.alert(
      'Use Streak Freeze?',
      'This will protect your streak for one missed day. Your freeze will recharge in 7 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use Freeze 🧊',
          onPress: () => {
            const updated: FreezeToken = { available: false, lastRechargeTs: Date.now() };
            setFreeze(updated);
            safeSetItem(FREEZE_KEY, JSON.stringify(updated)).catch(() => {});
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ],
    );
  }

  // Days until recharge
  const freezeDaysLeft = freeze.available
    ? 0
    : Math.max(0, Math.ceil((SEVEN_DAYS_MS - (Date.now() - freeze.lastRechargeTs)) / (24 * 60 * 60 * 1000)));

  // Tooltip for the freeze chip (long-press)
  const [freezeTooltipVisible, setFreezeTooltipVisible] = useState(false);
  const freezeTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showFreezeTooltip() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFreezeTooltipVisible(true);
    if (freezeTooltipTimer.current) clearTimeout(freezeTooltipTimer.current);
    freezeTooltipTimer.current = setTimeout(() => setFreezeTooltipVisible(false), 2500);
  }
  useEffect(() => () => { if (freezeTooltipTimer.current) clearTimeout(freezeTooltipTimer.current); }, []);

  // ── Day data ──────────────────────────────────────────────────────────────
  const days: DayCalories[] = useMemo(() => {
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const dateStr = d.toDateString();
      const kcal = sodiumRecords
        .filter((r) => new Date(r.timestamp).toDateString() === dateStr)
        .reduce((s, r) => s + (r.calories ?? 0), 0);
      return {
        label: DAY_LABELS[d.getDay()],
        date: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`,
        kcal,
        isToday: i === 6,
      };
    });
  }, [sodiumRecords]);

  const avg = useMemo(() => {
    const withData = days.filter((d) => d.kcal > 0);
    if (!withData.length) return 0;
    return Math.round(withData.reduce((s, d) => s + d.kcal, 0) / withData.length);
  }, [days]);

  // ── Streak: consecutive days (from today backwards) within ±10% of goal ──
  const streak = useMemo(() => {
    const lo = adjustedGoal * 0.9;
    const hi = adjustedGoal * 1.1;
    let count = 0;
    // Walk from today backwards; stop at first day with no data or out of range
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.kcal <= 0) break;
      if (d.kcal >= lo && d.kcal <= hi) count++;
      else break;
    }
    return count;
  }, [days, adjustedGoal]);

  // ── Streak milestone toast ────────────────────────────────────────────────
  const STREAK_MILESTONES = [3, 7, 14];
  const MILESTONE_KEY = '@vitalsync/streak_last_milestone_v1';
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track highest earned milestone for the badge history row
  const [highestMilestone, setHighestMilestone] = useState(0);
  // Earned dates per milestone: { 3: 'Mar 8', 7: 'Mar 14', 14: 'Apr 1' }
  const EARNED_DATES_KEY = '@vitalsync/streak_milestone_dates_v1';
  const [earnedDates, setEarnedDates] = useState<Record<number, string>>({});
  useEffect(() => {
    AsyncStorage.getItem(MILESTONE_KEY)
      .then((raw) => { if (raw) setHighestMilestone(parseInt(raw, 10) || 0); })
      .catch(() => {});
    AsyncStorage.getItem(EARNED_DATES_KEY)
      .then((raw) => { if (raw) setEarnedDates(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  // Confetti cannon ref — fired when 14-day milestone is earned
  const confettiRef = useRef<ConfettiCannon>(null);
  // Separate smaller cannon for replay (tap on earned 14-day badge)
  const confettiReplayRef = useRef<ConfettiCannon>(null);
  // Layout position of the 14-day badge for confetti origin
  const [confettiOrigin, setConfettiOrigin] = useState<{ x: number; y: number }>({ x: -10, y: 0 });

  // Tooltip for unearned milestone badges (long-press)
  const [tooltipMilestone, setTooltipMilestone] = useState<number | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBadgeTooltip(m: number) {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipMilestone(m);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    tooltipTimer.current = setTimeout(() => setTooltipMilestone(null), 2500);
  }

  // Cleanup tooltip timer on unmount
  useEffect(() => () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }, []);

  // Tap-to-celebrate: amber pulse animation on earned badges
  // One Animated.Value per milestone (3, 7, 14) — keyed by milestone value
  const pulseAnims = useRef<Record<number, Animated.Value>>(
    Object.fromEntries(STREAK_MILESTONES.map((m) => [m, new Animated.Value(1)]))
  ).current;

  async function shareMilestone(m: number) {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Your device does not support file sharing.');
        return;
      }
      const text = `🔥 ${m}-day caloric streak on VitalSync!\n\nI hit a ${m}-day streak staying within my daily calorie goal. Tracking my nutrition with VitalSync: Personal Health Hub.`;
      const fileUri = FileSystem.cacheDirectory + `milestone_${m}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: `Share your 🔥${m}-day streak!` });
    } catch (_unused) {
      // User dismissed share sheet — no-op
    }
  }

  function celebrateBadge(m: number) {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const anim = pulseAnims[m];
    if (!anim) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.25, duration: 120, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.9,  duration: 80,  useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1.15, duration: 100, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1.0,  duration: 120, useNativeDriver: true }),
    ]).start();
    // Replay confetti for the 14-day badge (smaller burst)
    if (m === 14 && Platform.OS !== 'web') {
      setTimeout(() => confettiReplayRef.current?.start(), 80);
    }

  }

  const showMilestoneToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setMilestoneToast(msg);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    toastTimer.current = setTimeout(() => setMilestoneToast(null), 3500);
  }, []);

  // Fire once per milestone crossing (persisted so it only fires once per milestone)
  useEffect(() => {
    if (streak === 0) return;
    const milestone = STREAK_MILESTONES.find((m) => streak === m);
    if (!milestone) return;
    AsyncStorage.getItem(MILESTONE_KEY)
      .then((raw) => {
        const lastMilestone = raw ? parseInt(raw, 10) : 0;
        if (milestone > lastMilestone) {
          safeSetItem(MILESTONE_KEY, String(milestone)).catch(() => {});
          setHighestMilestone(milestone);
          showMilestoneToast(`🔥 ${milestone}-day streak!`);
          // Store earned date for the badge subtitle
          const now = new Date();
          const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const dateStr = `${MONTH_ABBR[now.getMonth()]} ${now.getDate()}`;
          AsyncStorage.getItem(EARNED_DATES_KEY)
            .then((raw) => {
              const prev: Record<number, string> = raw ? JSON.parse(raw) : {};
              const updated = { ...prev, [milestone]: dateStr };
              setEarnedDates(updated);
              return safeSetItem(EARNED_DATES_KEY, JSON.stringify(updated));
            })
            .catch(() => {});
          // Fire confetti for the 14-day milestone
          if (milestone === 14) {
            setTimeout(() => confettiRef.current?.start(), 300);
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak]);

  // Reset milestone key when the adjusted goal changes so milestones re-fire against the new target
  const prevAdjustedGoalRef = useRef(adjustedGoal);
  const isFirstGoalRender = useRef(true);
  useEffect(() => {
    if (isFirstGoalRender.current) {
      isFirstGoalRender.current = false;
      return;
    }
    if (prevAdjustedGoalRef.current !== adjustedGoal) {
      prevAdjustedGoalRef.current = adjustedGoal;
      AsyncStorage.removeItem(MILESTONE_KEY).catch(() => {});
      setHighestMilestone(0);
      Alert.alert(
        'Streak Milestones Reset',
        'Your calorie goal changed, so streak milestones have been reset. Keep going to earn them again!',
        [{ text: 'Got it' }],
      );
    }
  }, [adjustedGoal]);

  // Cleanup toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function dismissToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setMilestoneToast(null);
  }

  // ── Surplus/deficit ───────────────────────────────────────────────────────
  const balanceDelta = avg > 0 ? avg - adjustedGoal : null;
  const balanceColor =
    balanceDelta === null ? '#9BA1A6'
    : balanceDelta > 0    ? '#EF4444'
    : balanceDelta < 0    ? '#10B981'
    :                       '#F59E0B';
  const balanceLabel =
    balanceDelta === null ? '—'
    : balanceDelta > 0    ? `+${balanceDelta} kcal`
    : balanceDelta < 0    ? `${balanceDelta} kcal`
    :                       'On goal';

  // ── Trend ─────────────────────────────────────────────────────────────────
  const trend = useMemo(() => {
    const first3 = days.slice(0, 3).reduce((s, d) => s + d.kcal, 0) / 3;
    const last3  = days.slice(4, 7).reduce((s, d) => s + d.kcal, 0) / 3;
    if (last3 > first3 + 50) return 'up';
    if (last3 < first3 - 50) return 'down';
    return 'flat';
  }, [days]);

  const trendColor = trend === 'up' ? '#EF4444' : trend === 'down' ? '#10B981' : '#F59E0B';
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  // ── Chart geometry ────────────────────────────────────────────────────────
  const maxKcal = Math.max(...days.map((d) => d.kcal), adjustedGoal, 1);
  const usableW = CHART_W - PAD_X * 2;
  const usableH = CHART_H - PAD_Y * 2;
  const step    = usableW / 7;

  function toY(kcal: number) {
    return PAD_Y + usableH - (kcal / maxKcal) * usableH;
  }
  function barX(i: number) {
    return PAD_X + i * step + (step - BAR_W) / 2;
  }

  const trendPoints = days
    .map((d, i) => `${PAD_X + i * step + step / 2},${toY(d.kcal)}`)
    .join(' ');

  function barColor(kcal: number) {
    if (kcal === 0) return colors.border;
    if (kcal > adjustedGoal * 1.1) return '#EF4444';
    if (kcal > adjustedGoal * 0.9) return '#F59E0B';
    return '#10B981';
  }

  // ── Breakdown modal ───────────────────────────────────────────────────────
  const [breakdownVisible, setBreakdownVisible] = useState(false);

  // ── Toggle ────────────────────────────────────────────────────────────────
  function handleToggle() {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded(!expanded);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <>
      {/* ── Confetti cannon for 14-day milestone (first earn) ── */}
      {Platform.OS !== 'web' && (
        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={confettiOrigin}
          autoStart={false}
          fadeOut
          explosionSpeed={350}
          fallSpeed={3000}
          colors={['#F59E0B', '#FBBF24', '#FCD34D', '#10B981', '#38BDF8']}
        />
      )}
      {/* ── Smaller replay confetti for 14-day badge tap ── */}
      {Platform.OS !== 'web' && (
        <ConfettiCannon
          ref={confettiReplayRef}
          count={40}
          origin={confettiOrigin}
          autoStart={false}
          fadeOut
          explosionSpeed={280}
          fallSpeed={2500}
          colors={['#F59E0B', '#FBBF24', '#FCD34D', '#10B981', '#38BDF8']}
        />
      )}
      {/* ── Streak milestone toast (tap to dismiss) ── */}
      {milestoneToast !== null && (
        <Pressable style={s.milestoneToast} onPress={dismissToast}>
          <Text style={s.milestoneToastText}>{milestoneToast}</Text>
          <Text style={[s.milestoneToastText, { fontSize: 10, opacity: 0.75, marginLeft: 6 }]}>✕</Text>
        </Pressable>
      )}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* ── Header ── */}
        <Pressable style={s.header} onPress={handleToggle}>
          <View style={[s.iconWrap, { backgroundColor: trendColor + '18' }]}>
            <Text style={{ fontSize: 14 }}>📈</Text>
          </View>
          <View style={s.headerText}>
            <Text style={[s.title, { color: colors.foreground }]}>7-Day Caloric Trend</Text>
            <Text style={[s.subtitle, { color: colors.muted }]}>Daily intake vs. goal</Text>
          </View>
          {/* 7-day average chip */}
          <View style={[s.chip, { backgroundColor: trendColor + '18', borderColor: trendColor + '40' }]}>
            <Text style={[s.chipNum, { color: trendColor }]}>{avg > 0 ? avg : '—'}</Text>
            {avg > 0 && <Text style={[s.chipUnit, { color: colors.muted }]}>avg kcal</Text>}
          </View>
          {/* Streak badge — only shown when streak ≥ 1 */}
          {streak >= 1 && (
            <View style={[s.streakBadge, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
              <Text style={s.streakEmoji}>🔥</Text>
              <Text style={[s.streakNum, { color: '#F59E0B' }]}>{streak}</Text>
            </View>
          )}
          {/* Streak freeze chip */}
          <View style={{ position: 'relative' }}>
            <Pressable
              onPress={useFreeze}
              onLongPress={showFreezeTooltip}
              style={[
                s.freezeChip,
                freeze.available
                  ? { backgroundColor: '#0EA5E918', borderColor: '#0EA5E940' }
                  : { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.55 },
              ]}
              accessibilityLabel={freeze.available ? 'Streak freeze available' : `Streak freeze recharges in ${freezeDaysLeft} day${freezeDaysLeft === 1 ? '' : 's'}`}
              accessibilityHint={freeze.available ? 'Tap to use your streak freeze' : 'Long-press to see recharge countdown'}
            >
              <Text style={s.freezeEmoji}>🧊</Text>
              {!freeze.available && freezeDaysLeft > 0 && (
                <Text style={[s.freezeDays, { color: colors.muted }]}>{freezeDaysLeft}d</Text>
              )}
            </Pressable>
            {freezeTooltipVisible && (
              <View style={[s.freezeTooltip, { backgroundColor: colors.foreground }]}>
                <Text style={[s.freezeTooltipText, { color: colors.background }]}>
                  {freeze.available
                    ? '🧊 Tap to protect your streak for one missed day'
                    : `Recharges in ${freezeDaysLeft} day${freezeDaysLeft === 1 ? '' : 's'}`}
                </Text>
                <View style={[s.freezeTooltipCaret, { borderTopColor: colors.foreground }]} />
              </View>
            )}
          </View>
          {/* Trend arrow */}
          <View style={[s.trendBadge, { backgroundColor: trendColor + '18', borderColor: trendColor + '40' }]}>
            <Text style={[s.trendArrow, { color: trendColor }]}>{trendArrow}</Text>
          </View>
          <IconSymbol
            name="chevron.right"
            size={14}
            color={colors.muted}
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
        </Pressable>

        {/* ── Expanded body ── */}
        {expanded && (
          <View style={[s.body, { borderTopColor: colors.border }]}>
            {/* Bar chart */}
            <View style={s.chartWrap}>
              <Svg width={CHART_W} height={CHART_H}>
                <Line
                  x1={PAD_X} y1={PAD_Y + usableH}
                  x2={CHART_W - PAD_X} y2={PAD_Y + usableH}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <Line
                  x1={PAD_X} y1={toY(adjustedGoal)}
                  x2={CHART_W - PAD_X} y2={toY(adjustedGoal)}
                  stroke="#10B98160"
                  strokeWidth={1.5}
                  strokeDasharray="4,3"
                />
                <SvgText x={CHART_W - PAD_X + 2} y={toY(adjustedGoal) + 4} fontSize={7} fill="#10B981">
                  GOAL
                </SvgText>
                {days.map((d, i) => {
                  const h = d.kcal > 0 ? (d.kcal / maxKcal) * usableH : 2;
                  const x = barX(i);
                  const y = toY(d.kcal);
                  const bc = barColor(d.kcal);
                  const barY = d.kcal > 0 ? y : PAD_Y + usableH - 2;
                  return (
                    <React.Fragment key={i}>
                      <Rect
                        x={x} y={barY}
                        width={BAR_W} height={h}
                        fill={bc + (d.isToday ? 'FF' : '70')}
                        rx={3}
                      />
                      {d.isToday && d.kcal > 0 && (
                        <Rect
                          x={x + RING_INSET} y={barY + RING_INSET}
                          width={BAR_W - RING_INSET * 2} height={h - RING_INSET * 2}
                          fill="none"
                          stroke={bc}
                          strokeWidth={1.5}
                          rx={2}
                        />
                      )}
                      <SvgText
                        x={x + BAR_W / 2} y={CHART_H - 1}
                        textAnchor="middle" fontSize={8}
                        fill={d.isToday ? colors.foreground : colors.muted}
                        fontWeight={d.isToday ? '700' : '400'}
                      >
                        {d.label}
                      </SvgText>
                      {d.kcal > 0 && (
                        <SvgText
                          x={x + BAR_W / 2} y={y - 3}
                          textAnchor="middle" fontSize={7}
                          fill={bc} fontWeight="700"
                        >
                          {Math.round(d.kcal)}
                        </SvgText>
                      )}
                    </React.Fragment>
                  );
                })}
                {days.some((d) => d.kcal > 0) && (
                  <Polyline
                    points={trendPoints}
                    fill="none"
                    stroke={trendColor + '80'}
                    strokeWidth={1.5}
                    strokeDasharray="3,2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {days.map((d, i) =>
                  d.kcal > 0 ? (
                    <Circle
                      key={i}
                      cx={PAD_X + i * step + step / 2}
                      cy={toY(d.kcal)}
                      r={d.isToday ? 4 : 2.5}
                      fill={barColor(d.kcal)}
                      stroke="#fff"
                      strokeWidth={d.isToday ? 1.5 : 1}
                    />
                  ) : null,
                )}
              </Svg>
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Text style={[s.statLabel, { color: colors.muted }]}>7-Day Avg</Text>
                <Text style={[s.statVal, { color: trendColor }]}>{avg > 0 ? `${avg} kcal` : '—'}</Text>
              </View>
              <View style={s.statItem}>
                <Text style={[s.statLabel, { color: colors.muted }]}>Daily Goal</Text>
                <Text style={[s.statVal, { color: colors.foreground }]}>{adjustedGoal} kcal</Text>
              </View>
              {/* Tappable surplus/deficit chip → opens breakdown modal */}
              <Pressable
                style={s.statItem}
                onPress={() => {
                  if (avg > 0) {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBreakdownVisible(true);
                  }
                }}
              >
                <Text style={[s.statLabel, { color: colors.muted }]}>vs. Goal</Text>
                <View style={[s.balanceChip, { backgroundColor: balanceColor + '18', borderColor: balanceColor + '50' }]}>
                  <Text style={[s.balanceText, { color: balanceColor }]}>{balanceLabel}</Text>
                  {avg > 0 && (
                    <IconSymbol name="chevron.right" size={9} color={balanceColor} style={{ marginLeft: 2 }} />
                  )}
                </View>
              </Pressable>
              <View style={s.statItem}>
                <Text style={[s.statLabel, { color: colors.muted }]}>Trend</Text>
                <Text style={[s.statVal, { color: trendColor }]}>{trendArrow} {trend.toUpperCase()}</Text>
              </View>
            </View>

            {/* Legend */}
            <View style={s.legend}>
              {[
                { color: '#10B981', label: 'On target' },
                { color: '#F59E0B', label: 'Near limit' },
                { color: '#EF4444', label: 'Over goal' },
              ].map(({ color, label }) => (
                <View key={label} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: color }]} />
                  <Text style={[s.legendText, { color: colors.muted }]}>{label}</Text>
                </View>
              ))}
            </View>

            {/* ── Milestone badge history ── */}
            <View style={[s.milestoneBadgeRow, { borderTopColor: colors.border }]}>
              <Text style={[s.milestoneBadgeLabel, { color: colors.muted }]}>Milestones</Text>
              {STREAK_MILESTONES.map((m) => {
                const earned = highestMilestone >= m;
                return (
                  <View
                    key={m}
                    style={s.milestoneBadgeWrap}
                    onLayout={m === 14 ? (e) => {
                      const { x, y, width, height } = e.nativeEvent.layout;
                      setConfettiOrigin({ x: x + width / 2, y: y + height / 2 });
                    } : undefined}
                  >
                    <Animated.View style={{ transform: [{ scale: pulseAnims[m] ?? 1 }] }}>
                      <Pressable
                        onPress={() => earned && celebrateBadge(m)}
                        onLongPress={() => earned ? shareMilestone(m) : showBadgeTooltip(m)}
                        accessibilityLabel={
                          earned
                            ? `Earned: ${m}-day streak milestone`
                            : `Locked: ${m}-day streak milestone`
                        }
                        accessibilityHint={
                          earned
                            ? 'Double-tap to celebrate'
                            : 'Long-press to learn how to unlock'
                        }
                        accessibilityRole="button"
                        style={[
                          s.milestoneBadge,
                          earned
                            ? { backgroundColor: '#F59E0B22', borderColor: '#F59E0B60' }
                            : { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[s.milestoneBadgeEmoji, { opacity: earned ? 1 : 0.3 }]}>🔥</Text>
                        <Text style={[s.milestoneBadgeNum, { color: earned ? '#F59E0B' : colors.muted }]}>{m}</Text>
                        {earned && earnedDates[m] && (
                          <Text style={[s.milestoneBadgeDateText, { color: colors.muted }]}>{earnedDates[m]}</Text>
                        )}
                      </Pressable>
                    </Animated.View>
                    {/* Tooltip */}
                    {tooltipMilestone === m && (
                      <View style={[s.badgeTooltip, { backgroundColor: colors.foreground }]}>
                        <Text style={[s.badgeTooltipText, { color: colors.background }]}>
                          Reach a {m}-day streak to unlock
                        </Text>
                        {/* Caret */}
                        <View style={[s.badgeTooltipCaret, { borderTopColor: colors.foreground }]} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* ── Exercise bonus footer ── */}
            <View style={[s.bonusRow, { borderTopColor: colors.border }]}>
              {editingBonus ? (
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={s.bonusEditRow}
                >
                  <Text style={s.bonusEmoji}>🏃</Text>
                  <TextInput
                    ref={bonusInputRef}
                    style={[s.bonusInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={bonusInput}
                    onChangeText={setBonusInput}
                    keyboardType="default"
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    returnKeyType="done"
                    onSubmitEditing={commitBonus}
                    maxLength={4}
                  />
                  <Text style={[s.bonusUnit, { color: colors.muted }]}>kcal bonus</Text>
                  <Pressable onPress={commitBonus} style={[s.bonusConfirm, { backgroundColor: '#10B98120' }]}>
                    <IconSymbol name="checkmark" size={13} color="#10B981" />
                  </Pressable>
                  {exerciseBonusKcal > 0 && (
                    <Pressable onPress={clearBonus} style={[s.bonusConfirm, { backgroundColor: '#EF444420' }]}>
                      <IconSymbol name="xmark" size={13} color="#EF4444" />
                    </Pressable>
                  )}
                </KeyboardAvoidingView>
              ) : (
                <Pressable style={s.bonusDisplayRow} onPress={openBonusEditor}>
                  <Text style={s.bonusEmoji}>🏃</Text>
                  <Text style={[s.bonusDisplayText, { color: exerciseBonusKcal > 0 ? '#38BDF8' : colors.muted }]}>
                    {exerciseBonusKcal > 0
                      ? `+${exerciseBonusKcal} kcal exercise bonus`
                      : 'Add exercise bonus'}
                  </Text>
                  <IconSymbol name="pencil" size={11} color={colors.muted} style={{ marginLeft: 4 }} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ── Breakdown modal ── */}
      <CaloricBreakdownModal
        visible={breakdownVisible}
        onClose={() => setBreakdownVisible(false)}
        days={days}
        adjustedGoal={adjustedGoal}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: 20, borderWidth: 0.5, marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 16, paddingBottom: 12,
  },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  chip: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  chipNum: { fontSize: 14, fontWeight: '800' },
  chipUnit: { fontSize: 7 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 4,
  },
  streakEmoji: { fontSize: 11 },
  streakNum: { fontSize: 12, fontWeight: '800' },
  freezeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 4,
  },
  freezeEmoji: { fontSize: 11 },
  freezeDays: { fontSize: 10, fontWeight: '700' },
  freezeTooltip: {
    position: 'absolute', bottom: 36, left: '50%',
    transform: [{ translateX: -70 }],
    width: 140, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    zIndex: 99,
  },
  freezeTooltipText: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
  freezeTooltipCaret: {
    position: 'absolute', bottom: -6, left: '50%',
    transform: [{ translateX: -5 }],
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  trendBadge: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  trendArrow: { fontSize: 14, fontWeight: '800' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  chartWrap: { alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 6 },
  statItem: { alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 10 },
  statVal: { fontSize: 13, fontWeight: '700' },
  balanceChip: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 2,
    marginTop: 1, flexDirection: 'row', alignItems: 'center',
  },
  balanceText: { fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', justifyContent: 'space-around' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10 },
  // Exercise bonus footer
  bonusRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10, paddingBottom: 2,
  },
  bonusDisplayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4,
  },
  bonusEmoji: { fontSize: 13 },
  bonusDisplayText: { fontSize: 12, fontWeight: '500' },
  bonusEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4,
  },
  bonusInput: {
    width: 60, height: 30, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, fontSize: 13, fontWeight: '700',
    textAlign: 'center',
  },
  bonusUnit: { fontSize: 12, flex: 1 },
  bonusConfirm: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  milestoneBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10, paddingBottom: 4,
  },
  milestoneBadgeLabel: { fontSize: 10, marginRight: 4 },
  milestoneBadgeWrap: { position: 'relative' },
  milestoneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  milestoneBadgeEmoji: { fontSize: 11 },
  milestoneBadgeNum: { fontSize: 12, fontWeight: '800' },
  milestoneBadgeDateText: { fontSize: 9, marginLeft: 2, opacity: 0.8 },
  badgeTooltip: {
    position: 'absolute',
    bottom: '130%',
    left: '50%',
    transform: [{ translateX: -60 }],
    width: 120,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  badgeTooltipText: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  badgeTooltipCaret: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    transform: [{ translateX: -5 }],
    width: 0, height: 0,
    borderLeftWidth: 5, borderLeftColor: 'transparent',
    borderRightWidth: 5, borderRightColor: 'transparent',
    borderTopWidth: 6,
  },
  milestoneToast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0BEE',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  milestoneToastText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
});
