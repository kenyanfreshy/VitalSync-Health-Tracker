/**
 * ActiveDietProfileCard
 *
 * Displays the user's currently active diet protocol on the dashboard.
 * Features:
 *  - Protocol name, emoji, accent color, description
 *  - "Last changed X days ago" timestamp
 *  - 🔥 Streak counter (consecutive days meeting all protocol targets)
 *  - Nutrient target chips (tap to scroll to DASH diet card)
 *  - Protocol history log sheet (last 10 changes, with optional notes)
 *  - "Change →" link to Settings
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  Share,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useFoodCameraStrings } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import { DIET_TARGETS, computeDayCompliance, DietType as ProfileDietType } from '@/lib/health/diet-profile';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import type { SodiumRecord } from '@/lib/health/types';
import { checkStreakMilestones, STREAK_MILESTONES } from '@/lib/health/diet-streak-milestones';
import { updateStreakRecord } from '@/lib/health/diet-streak-records';
import type { DietType } from '@/lib/health/diet-type';
import { trpc } from '@/lib/trpc';
import { ClinicalCitationsFooter } from '@/components/clinical-citations-footer';

const HISTORY_KEY = '@vitalsync/diet_type_history';
const CHANGED_AT_KEY = '@vitalsync/diet_type_changed_at';
const EXPANDED_KEY = '@vitalsync/diet_profile_card_expanded';
const STREAK_OVERRIDE_KEY = '@vitalsync/diet_streak_override_reset_date';
const BEST_STREAK_KEY = '@vitalsync/diet_streak_best';
const GOAL_KCAL_KEY = '@vitalsync/diet_goal_kcal';
const _MAX_HISTORY = 10;

interface HistoryEntry {
  dietType: string;
  label: string;
  emoji: string;
  changedAt: string; // ISO string
  note?: string;     // optional user note
}

/** Human-readable relative time: "3 days ago", "just now", etc. */
function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMo = Math.floor(diffDays / 30);
  return diffMo === 1 ? '1 month ago' : `${diffMo} months ago`;
}

/** Compute per-day compliance ratio (0–1) for the last N days (today = index 0). */
function computeWeeklyCompliance(
  records: SodiumRecord[],
  dietType: ProfileDietType,
  weightKg: number | null,
  days = 7,
): number[] {
  const now = new Date();
  const result: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const dayRecs = records.filter((r) => {
      const t = new Date(r.timestamp);
      return t >= day && t < nextDay;
    });
    if (dayRecs.length === 0) {
      result.push(-1); // no data
    } else {
      const totalNa = dayRecs.reduce((s, r) => s + r.sodiumMg, 0);
      const totalK  = dayRecs.reduce((s, r) => s + (r.potassiumMg ?? 0), 0);
      const carbsG  = dayRecs.reduce((s, r) => s + (r.carbsG ?? 0), 0);
      const proteinG = dayRecs.reduce((s, r) => s + (r.proteinG ?? 0), 0);
      const { points, maxPoints } = computeDayCompliance(totalNa, totalK, carbsG, proteinG, weightKg, dietType);
      result.push(maxPoints > 0 ? points / maxPoints : 0);
    }
  }
  return result;
}

// ─── Caloric trend mini chart constants ─────────────────────────────────────
const CT_W     = Dimensions.get('window').width - 64;
const _CT_H     = 90;
const CT_PAD_X = 20;
const _CT_PAD_Y = 10;
const CT_SLOT  = (CT_W - CT_PAD_X * 2) / 7;
const _CT_BAR_W = Math.min(28, Math.max(12, Math.floor(CT_SLOT * 0.55)));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ctBarColor(kcal: number, goal: number) {
  if (kcal === 0) return '#9BA1A6';
  if (kcal > goal * 1.1) return '#EF4444';
  if (kcal > goal * 0.9) return '#F59E0B';
  return '#10B981';
}

/** Compute day-by-day compliance for a specific week (weekIndex: 0=current, 1=last week, etc.) */
function computeWeekDayBreakdown(
  records: SodiumRecord[],
  dietType: ProfileDietType,
  weightKg: number | null,
  weekIndex: number,
): { date: Date; label: string; score: number | null; naOk: boolean; kOk: boolean | null; carbsOk: boolean | null; proteinOk: boolean | null }[] {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() - weekIndex * 7);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, d) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + d);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const dayRecs = records.filter((r) => {
      const t = new Date(r.timestamp);
      return t >= day && t < nextDay;
    });
    const label = `${DAY_NAMES[day.getDay()]} ${day.getDate()}`;
    if (dayRecs.length === 0) return { date: day, label, score: null, naOk: false, kOk: null, carbsOk: null, proteinOk: null };
    const totalNa = dayRecs.reduce((s, r) => s + r.sodiumMg, 0);
    const totalK  = dayRecs.reduce((s, r) => s + (r.potassiumMg ?? 0), 0);
    const carbsG  = dayRecs.reduce((s, r) => s + (r.carbsG ?? 0), 0);
    const proteinG = dayRecs.reduce((s, r) => s + (r.proteinG ?? 0), 0);
    const { points, maxPoints, naOk, kOk, carbsOk, proteinOk } = computeDayCompliance(totalNa, totalK, carbsG, proteinG, weightKg, dietType);
    return { date: day, label, score: maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0, naOk, kOk, carbsOk, proteinOk };
  });
}

/** Compute 4-week weekly average compliance scores (0–100) for the last 4 weeks. */
function compute4WeekCompliance(
  records: SodiumRecord[],
  dietType: ProfileDietType,
  weightKg: number | null,
): { label: string; score: number | null }[] {
  const now = new Date();
  return Array.from({ length: 4 }, (_, wi) => {
    // wi=0 → oldest week (3 weeks ago), wi=3 → current week
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - wi * 7);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = `${MONTH_ABBR[weekStart.getMonth()]} ${weekStart.getDate()}`;

    let totalPoints = 0;
    let totalMax = 0;
    let daysWithData = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);
      const dayRecs = records.filter((r) => {
        const t = new Date(r.timestamp);
        return t >= day && t < nextDay;
      });
      if (dayRecs.length === 0) continue;
      daysWithData++;
      const totalNa = dayRecs.reduce((s, r) => s + r.sodiumMg, 0);
      const totalK  = dayRecs.reduce((s, r) => s + (r.potassiumMg ?? 0), 0);
      const carbsG  = dayRecs.reduce((s, r) => s + (r.carbsG ?? 0), 0);
      const proteinG = dayRecs.reduce((s, r) => s + (r.proteinG ?? 0), 0);
      const { points, maxPoints } = computeDayCompliance(totalNa, totalK, carbsG, proteinG, weightKg, dietType);
      totalPoints += points;
      totalMax    += maxPoints;
    }
    return {
      label,
      score: daysWithData > 0 && totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : null,
    };
  }).reverse(); // oldest → newest
}

/** Compute consecutive-day streak from sodiumRecords using computeDayCompliance. */
function computeStreak(
  records: SodiumRecord[],
  dietType: ProfileDietType,
  weightKg: number | null,
): number {
  if (records.length === 0) return 0;
  const now = new Date();
  let streak = 0;
  // Walk backwards from yesterday (today may be incomplete)
  for (let i = 1; i <= 30; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const dayRecs = records.filter((r) => {
      const t = new Date(r.timestamp);
      return t >= day && t < nextDay;
    });
    if (dayRecs.length === 0) break; // gap — streak ends
    const totalNa = dayRecs.reduce((s, r) => s + r.sodiumMg, 0);
    const totalK  = dayRecs.reduce((s, r) => s + (r.potassiumMg ?? 0), 0);
    const carbsG  = dayRecs.reduce((s, r) => s + (r.carbsG ?? 0), 0);
    const proteinG = dayRecs.reduce((s, r) => s + (r.proteinG ?? 0), 0);
    const { points, maxPoints } = computeDayCompliance(totalNa, totalK, carbsG, proteinG, weightKg, dietType);
    if (maxPoints === 0 || points < maxPoints) break; // not fully compliant
    streak++;
  }
  return streak;
}

interface Props {
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
  /** Sodium records for streak computation */
  sodiumRecords?: SodiumRecord[];
  /** Whether the card is pinned to the top of the dashboard */
  isPinned?: boolean;
  /** Called when the user taps the pin/unpin button */
  onTogglePin?: () => void;
  /** Caloric goal in kcal for the embedded 7-Day Caloric Trend. Default 2000. */
  goalKcal?: number;
  /** Exercise caloric bonus from today's activity log. Default 0. */
  exerciseBonusKcal?: number;
}

export function ActiveDietProfileCard({
  defaultExpanded = false,
  overrideExpanded,
  sodiumRecords = [],
  isPinned = false,
  onTogglePin,
  goalKcal = 2000,
  exerciseBonusKcal = 0,
}: Props) {
  const colors = useColors();
  const fc = useFoodCameraStrings();
  const router = useRouter();
  const { dietType: globalDietType, state } = useHealth();
  const generateReportMutation = trpc.diet.generateReport.useMutation();
  const weightKg = (state.data?.weight?.[0]?.weightKg as number | undefined) ?? null;

  // Cast to diet-profile DietType (superset)
  const dietType = (globalDietType as ProfileDietType) ?? 'balanced';
  const targets = DIET_TARGETS[dietType] ?? DIET_TARGETS['balanced'];

  const [expanded, setExpanded] = useState(defaultExpanded);
  // overrideExpanded=false (section collapsed) forces card closed;
  // overrideExpanded=true (section expanded) defers to card's own state.
  const isExpanded = overrideExpanded === false ? false : expanded;

  // Load persisted expanded state on mount
  useEffect(() => {
    AsyncStorage.getItem(EXPANDED_KEY).then((v) => {
      if (v !== null) setExpanded(v === 'true');
    }).catch(() => {});
  }, []);

  // Streak override: user can manually reset the streak
  const [streakResetDate, setStreakResetDate] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(STREAK_OVERRIDE_KEY).then((v) => {
      if (v) setStreakResetDate(v);
    }).catch(() => {});
  }, []);

  function handleLongPressBestStreak() {
    if (bestStreak === 0) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Alert.alert(
      'Reset Best Streak?',
      `Your all-time best is ${bestStreak} day${bestStreak !== 1 ? 's' : ''}. Clear this record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setBestStreak(0);
            safeSetItem(BEST_STREAK_KEY, '0').catch(() => {});
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ],
    );
  }

  function handleLongPressStreak() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Alert.alert(
      'Reset Streak?',
      `Your current streak is ${streak} day${streak !== 1 ? 's' : ''}. Reset it to zero?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const today = new Date().toISOString().slice(0, 10);
            setStreakResetDate(today);
            safeSetItem(STREAK_OVERRIDE_KEY, today).catch(() => {});
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ],
    );
  }

  // Last-changed timestamp
  const [changedAt, setChangedAt] = useState<string | null>(null);
  // Protocol history
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  // Note editing state (for history entries)
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(CHANGED_AT_KEY).then((v) => {
      if (v) setChangedAt(v);
    });
    AsyncStorage.getItem(HISTORY_KEY).then((v) => {
      if (v) {
        try { setHistory(JSON.parse(v)); } catch (_unused) { /* ignore */ }
      }
    });
  }, [dietType]);

  // Best streak record
  const [bestStreak, setBestStreak] = useState<number>(0);
  useEffect(() => {
    AsyncStorage.getItem(BEST_STREAK_KEY).then((v) => {
      if (v) setBestStreak(parseInt(v, 10) || 0);
    }).catch(() => {});
  }, []);

  // Streak computation
  const rawStreak = useMemo(
    () => computeStreak(sodiumRecords, dietType, weightKg),
    [sodiumRecords, dietType, weightKg],
  );
  // If user manually reset the streak today, show 0 until tomorrow
  const streak = useMemo(() => {
    if (!streakResetDate) return rawStreak;
    const today = new Date().toISOString().slice(0, 10);
    // Reset date is today or later → streak is 0
    if (streakResetDate >= today) return 0;
    return rawStreak;
  }, [rawStreak, streakResetDate]);

  // Update best streak when current streak exceeds it + fire milestone notifications + update per-protocol record
  useEffect(() => {
    if (streak > bestStreak) {
      setBestStreak(streak);
      safeSetItem(BEST_STREAK_KEY, String(streak)).catch(() => {});
    }
    // Check milestone notifications (7, 14, 30-day)
    checkStreakMilestones(streak, targets.emoji, targets.label).catch(() => {});
    // Update per-protocol streak record in leaderboard
    updateStreakRecord(globalDietType as DietType, streak).catch(() => {});
  }, [streak]); // eslint-disable-line react-hooks/exhaustive-deps

  // 7-day compliance sparkline data
  const weeklyCompliance = useMemo(
    () => computeWeeklyCompliance(sodiumRecords, dietType, weightKg),
    [sodiumRecords, dietType, weightKg],
  );

  // 4-week compliance history
  const fourWeekCompliance = useMemo(
    () => compute4WeekCompliance(sodiumRecords, dietType, weightKg),
    [sodiumRecords, dietType, weightKg],
  );

  // 7-day caloric trend data
  const caloricDays = useMemo(() => {
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const dateStr = d.toDateString();
      const kcal = sodiumRecords
        .filter((r) => new Date(r.timestamp).toDateString() === dateStr)
        .reduce((s, r) => s + (r.calories ?? 0), 0);
      return { label: DAY_LABELS[d.getDay()], kcal, isToday: i === 6 };
    });
  }, [sodiumRecords]);

  const caloricAvg = useMemo(() => {
    const withData = caloricDays.filter((d) => d.kcal > 0);
    return withData.length ? Math.round(withData.reduce((s, d) => s + d.kcal, 0) / withData.length) : 0;
  }, [caloricDays]);

  // ── Week drill-down state ──
  // weekDrillIndex: the 4-week array index (0=oldest, 3=current) the user tapped
  const [weekDrillIndex, setWeekDrillIndex] = useState<number | null>(null);
  const weekDrillDays = useMemo(() => {
    if (weekDrillIndex === null) return [];
    // fourWeekCompliance is ordered oldest→newest (index 0=oldest, 3=current)
    // weekIndex for computeWeekDayBreakdown: 0=current week, 1=last week, etc.
    const weekIndexFromNow = 3 - weekDrillIndex;
    return computeWeekDayBreakdown(sodiumRecords, dietType, weightKg, weekIndexFromNow);
  }, [weekDrillIndex, sodiumRecords, dietType, weightKg]);

  // ── Inline kcal goal editor state ──
  const [localGoalKcal, setLocalGoalKcal] = useState<number>(goalKcal);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  // Load persisted goal override on mount
  useEffect(() => {
    AsyncStorage.getItem(GOAL_KCAL_KEY).then((v) => {
      if (v) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) setLocalGoalKcal(n);
      }
    }).catch(() => {});
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleLongPressGoal() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoalInput(String(localGoalKcal));
    setEditingGoal(true);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function commitGoalEdit() {
    const n = parseInt(goalInput, 10);
    if (!isNaN(n) && n >= 500 && n <= 10000) {
      setLocalGoalKcal(n);
      safeSetItem(GOAL_KCAL_KEY, String(n)).catch(() => {});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setEditingGoal(false);
  }

  // ── PDF export state ──
  const [exportingPdf, setExportingPdf] = useState(false);

  // Milestone badges: which milestones has the user earned for the current streak?
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [firedMilestones, setFiredMilestones] = useState<Set<number>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('@vitalsync/diet_streak_milestones_fired').then((v) => {
      if (v) {
        try { setFiredMilestones(new Set(JSON.parse(v) as number[])); } catch (_unused) { /* ignore */ }
      }
    }).catch(() => {});
  }, [streak]);

  function toggle() {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpanded((v) => {
      const next = !v;
      safeSetItem(EXPANDED_KEY, String(next)).catch(() => {});
      return next;
    });
  }

  function handleChipPress() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  async function handleShare() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const streakLine = streak > 0 ? `\n🔥 Current streak: ${streak} day${streak !== 1 ? 's' : ''}` : '';
    const bestLine = bestStreak > 0 ? `\n🏆 Best streak: ${bestStreak} day${bestStreak !== 1 ? 's' : ''}` : '';
    const message = `${targets.emoji} I'm following the ${targets.label} protocol on VitalSync!${streakLine}${bestLine}\n\nTarget: ${targets.description}`;
    try {
      await Share.share({ message });
    } catch (_unused) {
      // user cancelled or share failed
    }
  }

  async function handleExportPdf() {
    if (exportingPdf) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExportingPdf(true);
    try {
      const result = await generateReportMutation.mutateAsync({
        protocol:       targets.label,
        emoji:          targets.emoji,
        currentStreak:  streak,
        bestStreak,
        goalKcal:       localGoalKcal,
        caloricAvg,
        fourWeekScores: fourWeekCompliance,
        generatedAt:    new Date().toISOString(),
      });
      await Share.share({ message: `VitalSync Diet Report: ${result.url}`, url: result.url });
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? 'Could not generate PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  }

  async function saveNote(idx: number, note: string) {
    const updated = history.map((e, i) => i === idx ? { ...e, note: note.trim() || undefined } : e);
    setHistory(updated);
    setEditingNoteIdx(null);
    await safeSetItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
  }

  // Build nutrient target chips
  const chips: { label: string; color: string }[] = [];
  chips.push({ label: `Na ≤ ${targets.sodiumMaxMg.toLocaleString()} mg`, color: '#10B981' });
  if (targets.potassiumMinMg !== null) {
    chips.push({ label: `K ≥ ${targets.potassiumMinMg.toLocaleString()} mg`, color: '#F59E0B' });
  }
  if (targets.carbsMaxG !== null) {
    chips.push({ label: `Carbs ≤ ${targets.carbsMaxG} g`, color: '#8B5CF6' });
  }
  if (targets.proteinMaxGPerKg !== null) {
    chips.push({ label: `Protein ≤ ${targets.proteinMaxGPerKg} g/kg`, color: '#06B6D4' });
  }

  const s = styles(colors, targets.color);

  return (
    <View style={s.card}>
      {/* ── Header (always visible) ── */}
      <Pressable
        style={s.header}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`Active diet: ${targets.label}. Tap to ${isExpanded ? 'collapse' : 'expand'}`}
      >
        {/* Left: emoji + label */}
        <View style={s.headerLeft}>
          <View style={[s.emojiWrap, { backgroundColor: targets.color + '20' }]}>
            <Text style={s.emoji}>{targets.emoji}</Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={[s.sectionLabel, { color: colors.muted }]}>ACTIVE DIET PROTOCOL</Text>
            <View style={s.nameRow}>
              <Text style={[s.dietName, { color: targets.color }]}>{targets.label}</Text>
              {streak > 0 && (
                <Pressable
                  onLongPress={handleLongPressStreak}
                  style={[s.streakBadge, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B50' }]}
                  accessibilityLabel={`${streak}-day streak. Long press to reset.`}
                  accessibilityHint="Long press to reset the streak counter"
                >
                  <Text style={s.streakText}>🔥 {streak}d streak</Text>
                </Pressable>
              )}
            </View>
            {bestStreak > 0 && (
              <Pressable
                onLongPress={handleLongPressBestStreak}
                accessibilityLabel={`All-time best streak: ${bestStreak} days. Long press to reset.`}
                accessibilityHint="Long press to clear the all-time best streak record"
              >
                <Text style={[s.bestStreak, { color: colors.muted }]}>
                  Best: {bestStreak}d
                </Text>
              </Pressable>
            )}
            {/* Milestone badge row — lit up in protocol accent when earned */}
            {STREAK_MILESTONES.length > 0 && (
              <View style={s.milestoneBadgeRow}>
                {([7, 14, 30] as const).map((days, idx) => {
                  const icons = ['🥉', '🥈', '🥇'];
                  const earned = bestStreak >= days;
                  return (
                    <View
                      key={days}
                      style={[
                        s.milestoneBadge,
                        earned
                          ? { backgroundColor: targets.color + '20', borderColor: targets.color + '60' }
                          : { backgroundColor: colors.border + '20', borderColor: colors.border },
                      ]}
                    >
                      <Text style={[s.milestoneBadgeIcon, { opacity: earned ? 1 : 0.3 }]}>
                        {icons[idx]}
                      </Text>
                      <Text style={[s.milestoneBadgeDays, { color: earned ? targets.color : colors.muted }]}>
                        {days}d
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {changedAt && (
              <Text style={[s.lastChanged, { color: colors.muted }]}>
                Set {relativeTime(changedAt)}
              </Text>
            )}
          </View>
        </View>
        {/* Right: pin button + chevron */}
        <View style={s.headerRight}>
          {onTogglePin && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onTogglePin();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={isPinned ? 'Unpin diet card from top' : 'Pin diet card to top'}
              style={s.pinBtn}
            >
              <Text style={[s.pinIcon, { color: isPinned ? targets.color : colors.muted }]}>
                {isPinned ? '📌' : '📍'}
              </Text>
            </TouchableOpacity>
          )}
          <IconSymbol
            name="chevron.right"
            size={16}
            color={colors.muted}
            style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
          />
        </View>
      </Pressable>

      {/* ── Collapsed summary row (visible only when collapsed) ── */}
      {!isExpanded && (
        <View style={s.collapsedSummary}>
          <Text style={[s.collapsedSummaryText, { color: colors.muted }]} numberOfLines={1}>
            {targets.emoji} {targets.label}
            {streak > 0 ? `  ·  🔥 ${streak}-day streak` : ''}
            {changedAt ? `  ·  Set ${relativeTime(changedAt)}` : ''}
          </Text>
        </View>
      )}

      {/* ── Expanded body ── */}
      {isExpanded && (
        <View style={[s.body, { borderTopColor: colors.border }]}>
          {/* Description */}
          <Text style={[s.description, { color: colors.muted }]}>{targets.description}</Text>

          {/* Nutrient target chips — tapping scrolls to compliance card */}
          <View style={s.chipsRow}>
            {chips.map((chip, i) => (
              <TouchableOpacity
                key={i}
                onPress={handleChipPress}
                activeOpacity={0.75}
              >
                <View style={[s.chip, { backgroundColor: chip.color + '18', borderColor: chip.color + '50' }]}>
                  <Text style={[s.chipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* 7-day compliance sparkline */}
          {weeklyCompliance.some(v => v >= 0) && (
            <View style={s.sparklineWrap}>
              <Text style={[s.sparklineLabel, { color: colors.muted }]}>{targets.label ? (fc.sevenDayAdherence ?? '7-day {diet} adherence').replace('{diet}', targets.label) : '7-day adherence'}</Text>
              <View style={s.sparklineBars}>
                {weeklyCompliance.map((ratio, i) => {
                  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                  const today = new Date().getDay(); // 0=Sun
                  // Map bar index (0=oldest, 6=today) to day-of-week label
                  const dayOffset = (today - 1 - (6 - i) + 7) % 7;
                  const label = DAY_LABELS[dayOffset] ?? '';
                  const isToday = i === 6;
                  const barH = ratio < 0 ? 4 : Math.max(4, Math.round(ratio * 36));
                  const barColor = ratio < 0
                    ? colors.border
                    : ratio >= 1
                      ? targets.color
                      : ratio >= 0.5
                        ? targets.color + 'AA'
                        : targets.color + '44';
                  return (
                    <View key={i} style={s.sparklineBarCol}>
                      <View style={[s.sparklineBarTrack]}>
                        <View
                          style={[
                            s.sparklineBar,
                            {
                              height: barH,
                              backgroundColor: barColor,
                              borderRadius: 3,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[
                        s.sparklineDayLabel,
                        { color: isToday ? targets.color : colors.muted, fontWeight: isToday ? '700' : '400' },
                      ]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── 4-Week Compliance History ── */}
          {fourWeekCompliance.some((w) => w.score !== null) && (
            <View style={[s.sectionBlock, { borderTopColor: colors.border }]}>
              <Text style={[s.sectionBlockTitle, { color: colors.muted }]}>4-WEEK COMPLIANCE</Text>
              <View style={s.fourWeekRow}>
                {fourWeekCompliance.map((w, i) => {
                  const isLatest = i === fourWeekCompliance.length - 1;
                  const scoreColor = w.score === null ? colors.muted
                    : w.score >= 80 ? '#10B981'
                    : w.score >= 60 ? '#F59E0B'
                    : '#EF4444';
                  return (
                    <TouchableOpacity
                      key={i}
                      style={s.fourWeekItem}
                      onPress={() => { setWeekDrillIndex(i); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.fourWeekLabel, { color: colors.muted }]}>{w.label}</Text>
                      <View style={[s.fourWeekBadge, {
                        backgroundColor: w.score !== null ? scoreColor + '18' : colors.surface,
                        borderColor: w.score !== null ? scoreColor + '50' : colors.border,
                        borderWidth: isLatest ? 1.5 : 1,
                      }]}>
                        <Text style={[s.fourWeekScore, { color: w.score !== null ? scoreColor : colors.muted }]}>
                          {w.score !== null ? `${w.score}%` : '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Footer row */}
          <View style={s.footerRow}>
            {/* History button */}
            {history.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowHistory(true)}
                activeOpacity={0.7}
                style={s.historyBtn}
              >
                <Text style={[s.historyBtnText, { color: colors.muted }]}>
                  History ({history.length})
                </Text>
              </TouchableOpacity>
            )}
            {/* Share button */}
            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.7}
              style={s.historyBtn}
            >
              <Text style={[s.historyBtnText, { color: colors.muted }]}>🔗 Share
              </Text>
            </TouchableOpacity>
            {/* Records link */}
            <TouchableOpacity
              onPress={() => router.push('/diet/streak-records' as any)}
              activeOpacity={0.7}
              style={s.historyBtn}
            >
              <Text style={[s.historyBtnText, { color: colors.muted }]}>🏆 Records</Text>
            </TouchableOpacity>
            {/* Export PDF button */}
            <TouchableOpacity
              onPress={handleExportPdf}
              activeOpacity={0.7}
              style={s.historyBtn}
              disabled={exportingPdf}
            >
              <Text style={[s.historyBtnText, { color: exportingPdf ? colors.muted : targets.color }]}>
                {exportingPdf ? '⏳ Exporting…' : '📄 Export PDF'}
              </Text>
            </TouchableOpacity>
            {/* Change link */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/settings' as any)}
              activeOpacity={0.7}
              style={{ marginLeft: 'auto' }}
            >
              <Text style={[s.changeLink, { color: targets.color }]}>Change →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Clinical citations — Guideline 1.4.1 compliance */}
      {isExpanded && <ClinicalCitationsFooter compact />}

      {/* ── Protocol History Sheet ── */}
      <Modal
        visible={showHistory}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHistory(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Pressable style={s.overlay} onPress={() => setShowHistory(false)} />
          <View style={[s.sheet, { backgroundColor: colors.surface }]}>
            {/* Sheet header */}
            <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>Protocol History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} activeOpacity={0.7}>
                <Text style={[s.sheetClose, { color: colors.muted }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              {history.length === 0 ? (
                <Text style={[s.emptyText, { color: colors.muted }]}>No history yet.</Text>
              ) : (
                history.map((entry, i) => {
                  const entryTargets = DIET_TARGETS[entry.dietType as ProfileDietType] ?? DIET_TARGETS['balanced'];
                  const isEditing = editingNoteIdx === i;
                  return (
                    <View
                      key={i}
                      style={[s.historyRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={[s.historyDot, { backgroundColor: entryTargets.color }]} />
                      <View style={s.historyText}>
                        <Text style={[s.historyLabel, { color: colors.foreground }]}>
                          {entry.emoji} {entry.label}
                        </Text>
                        <Text style={[s.historyDate, { color: colors.muted }]}>
                          {relativeTime(entry.changedAt)} · {safeFormatDate(entry.changedAt)}
                        </Text>
                        {/* Note display / edit */}
                        {isEditing ? (
                          <View style={s.noteEditRow}>
                            <TextInput
                              style={[s.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                              value={noteText}
                              onChangeText={setNoteText}
                              placeholder="Add a note (e.g. Doctor recommended)"
                              placeholderTextColor={colors.muted}
                              autoFocus
                              maxLength={120}
                              returnKeyType="done"
                              onSubmitEditing={() => saveNote(i, noteText)}
                            />
                            <TouchableOpacity onPress={() => saveNote(i, noteText)} activeOpacity={0.7} style={s.noteSaveBtn}>
                              <Text style={[s.noteSaveTxt, { color: targets.color }]}>Save</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => { setEditingNoteIdx(i); setNoteText(entry.note ?? ''); }}
                            activeOpacity={0.7}
                            style={s.noteBtn}
                          >
                            <Text style={[s.noteText, { color: entry.note ? colors.foreground : colors.muted }]}>
                              {entry.note ? `📝 ${entry.note}` : '+ Add note'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Week Drill-Down Modal ── */}
      <Modal
        visible={weekDrillIndex !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setWeekDrillIndex(null)}
      >
        <Pressable style={s.overlay} onPress={() => setWeekDrillIndex(null)} />
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.foreground }]}>
              {weekDrillIndex !== null ? fourWeekCompliance[weekDrillIndex]?.label ?? 'Week' : 'Week'} — Day Breakdown
            </Text>
            <TouchableOpacity onPress={() => setWeekDrillIndex(null)} activeOpacity={0.7}>
              <Text style={[s.sheetClose, { color: colors.muted }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {weekDrillDays.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.muted }]}>No data for this week.</Text>
            ) : (
              weekDrillDays.map((day, di) => {
                const scoreColor = day.score === null ? colors.muted
                  : day.score >= 80 ? '#10B981'
                  : day.score >= 60 ? '#F59E0B'
                  : '#EF4444';
                return (
                  <View key={di} style={[s.drillRow, { borderBottomColor: colors.border }]}>
                    <View style={s.drillLeft}>
                      <Text style={[s.drillDayLabel, { color: colors.foreground }]}>{day.label}</Text>
                      {day.score === null ? (
                        <Text style={[s.drillNoData, { color: colors.muted }]}>No data logged</Text>
                      ) : (
                        <View style={s.drillChips}>
                          {day.naOk !== null && (
                            <View style={[s.drillChip, { backgroundColor: day.naOk ? '#10B98118' : '#EF444418', borderColor: day.naOk ? '#10B981' : '#EF4444' }]}>
                              <Text style={[s.drillChipText, { color: day.naOk ? '#10B981' : '#EF4444' }]}>Na {day.naOk ? '✓' : '✗'}</Text>
                            </View>
                          )}
                          {day.kOk !== null && (
                            <View style={[s.drillChip, { backgroundColor: day.kOk ? '#10B98118' : '#EF444418', borderColor: day.kOk ? '#10B981' : '#EF4444' }]}>
                              <Text style={[s.drillChipText, { color: day.kOk ? '#10B981' : '#EF4444' }]}>K {day.kOk ? '✓' : '✗'}</Text>
                            </View>
                          )}
                          {day.carbsOk !== null && (
                            <View style={[s.drillChip, { backgroundColor: day.carbsOk ? '#10B98118' : '#EF444418', borderColor: day.carbsOk ? '#10B981' : '#EF4444' }]}>
                              <Text style={[s.drillChipText, { color: day.carbsOk ? '#10B981' : '#EF4444' }]}>Carbs {day.carbsOk ? '✓' : '✗'}</Text>
                            </View>
                          )}
                          {day.proteinOk !== null && (
                            <View style={[s.drillChip, { backgroundColor: day.proteinOk ? '#10B98118' : '#EF444418', borderColor: day.proteinOk ? '#10B981' : '#EF4444' }]}>
                              <Text style={[s.drillChipText, { color: day.proteinOk ? '#10B981' : '#EF4444' }]}>Protein {day.proteinOk ? '✓' : '✗'}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                    <View style={[s.drillBadge, {
                      backgroundColor: day.score !== null ? scoreColor + '18' : colors.background,
                      borderColor: day.score !== null ? scoreColor + '60' : colors.border,
                    }]}>
                      <Text style={[s.drillScore, { color: day.score !== null ? scoreColor : colors.muted }]}>
                        {day.score !== null ? `${day.score}%` : '—'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// Expose openHistory for external use (Settings row)
export function openDietHistory() {
  // This is handled by the component's internal state; external callers should
  // use the showHistory prop pattern or navigate to the dashboard.
}

function styles(colors: ReturnType<typeof useColors>, _accentColor: string) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pinBtn: {
      padding: 2,
    },
    pinIcon: {
      fontSize: 16,
    },
    emojiWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    emoji: {
      fontSize: 22,
    },
    titleBlock: {
      flex: 1,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    dietName: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    streakBadge: {
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    streakText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#F59E0B',
    },
    lastChanged: {
      fontSize: 11,
      marginTop: 2,
    },
    bestStreak: {
      fontSize: 10,
      marginTop: 1,
      fontStyle: 'italic',
    },
    collapsedSummary: {
      paddingHorizontal: 16,
      paddingBottom: 10,
      paddingTop: 2,
    },
    collapsedSummaryText: {
      fontSize: 12,
      lineHeight: 17,
    },
    body: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    description: {
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 12,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 14,
    },
    chip: {
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginBottom: 12,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    historyBtn: {
      paddingVertical: 2,
    },
    historyBtnText: {
      fontSize: 12,
    },
    changeLink: {
      fontSize: 13,
      fontWeight: '600',
    },
    // Modal / sheet
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '65%',
      paddingTop: 8,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '700',
    },
    sheetClose: {
      fontSize: 15,
    },
    emptyText: {
      textAlign: 'center',
      marginTop: 32,
      fontSize: 14,
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 12,
      marginTop: 4,
    },
    historyText: {
      flex: 1,
    },
    historyLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    historyDate: {
      fontSize: 12,
      marginTop: 2,
    },
    noteBtn: {
      marginTop: 4,
    },
    noteText: {
      fontSize: 12,
      fontStyle: 'italic',
    },
    noteEditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      gap: 8,
    },
    noteInput: {
      flex: 1,
      fontSize: 13,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    noteSaveBtn: {
      paddingHorizontal: 4,
    },
    noteSaveTxt: {
      fontSize: 13,
      fontWeight: '600',
    },
    // Milestone badge row
    milestoneBadgeRow: {
      flexDirection: 'row',
      gap: 5,
      marginTop: 5,
      marginBottom: 2,
    },
    milestoneBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 2,
      gap: 3,
    },
    milestoneBadgeIcon: {
      fontSize: 11,
    },
    milestoneBadgeDays: {
      fontSize: 10,
      fontWeight: '600',
    },
    // 7-day compliance sparkline
    sparklineWrap: {
      marginTop: 2,
      marginBottom: 14,
    },
    sparklineLabel: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    sparklineBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
    },
    sparklineBarCol: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    sparklineBarTrack: {
      height: 36,
      width: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sparklineBar: {
      width: '100%',
      minHeight: 4,
    },
    sparklineDayLabel: {
      fontSize: 9,
    },
    // Shared section block (caloric trend, 4-week compliance)
    sectionBlock: {
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    sectionBlockTitle: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    // Caloric trend stats row
    caloricStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    caloricStatItem: { alignItems: 'center', gap: 2 },
    caloricStatLabel: { fontSize: 9 },
    caloricStatVal: { fontSize: 12, fontWeight: '700' },
    // 4-week compliance row
    fourWeekRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
    },
    fourWeekItem: { flex: 1, alignItems: 'center', gap: 4 },
    fourWeekLabel: { fontSize: 9, fontWeight: '600' },
    fourWeekBadge: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
    },
    fourWeekScore: { fontSize: 14, fontWeight: '800' },
    // Week drill-down modal rows
    drillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    drillLeft: { flex: 1, gap: 6 },
    drillDayLabel: { fontSize: 14, fontWeight: '600' },
    drillNoData: { fontSize: 12 },
    drillChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    drillChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    drillChipText: { fontSize: 11, fontWeight: '600' },
    drillBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
    },
    drillScore: { fontSize: 15, fontWeight: '800' },
    // Inline goal editor
    goalEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    goalEditInput: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 12,
      fontWeight: '700',
      width: 64,
      textAlign: 'center',
    },
    goalEditSave: { fontSize: 18, fontWeight: '700' },
    // Caloric Balance Gauge (embedded)
    gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
    gaugeStatsCol: { flex: 1, gap: 8 },
    gaugeStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    gaugeStatDot: { width: 8, height: 8, borderRadius: 4 },
    gaugeStatLabel: { fontSize: 11, flex: 1 },
    gaugeStatVal: { fontSize: 12, fontWeight: '700' },
    gaugeNoData: { fontSize: 10, fontStyle: 'italic', marginTop: 4 },
    gaugeStatusBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
    gaugeStatusText: { fontSize: 10, fontWeight: '800' },
  });
}
