import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * CalorieBurnCard
 *
 * Collapsible card (same pattern as WeeklyMacroTrendCard / SevenDayCaloricTrendCard).
 * Header always visible: title + today's net kcal chip.
 * Tap to expand/collapse the full breakdown and 7-day chart.
 *
 * Displays caloric burn vs. intake aggregated from ALL logged sources:
 *   - Calories BURNED: BMR baseline (Mifflin-St Jeor) + ActivityRecord.caloriesBurned
 *   - Calories CONSUMED: SodiumRecord.calories (Smart photo / voice / manual DASH log)
 */

import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { getNotifications } from '@/lib/notifications/safe-notifications';
import * as Haptics from 'expo-haptics';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import type { ActivityRecord, SodiumRecord } from '@/lib/health/types';
import { useColors } from '@/hooks';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import { useBMR } from '@/lib/health/bmr';
import { useMacroGoals, ACTIVITY_LEVEL_MULTIPLIERS } from '@/hooks/use-macro-goals';
import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALERT_SEEN_KEY = '@vitalsync/calorie_alert_seen_v1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function shortDay(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  burned: number;      // kcal burned (BMR + activity)
  consumed: number;    // kcal consumed from food log
  activityKcal: number;
}

export interface CalorieBurnCardProps {
  activityRecords: ActivityRecord[];
  sodiumRecords: SodiumRecord[];
  defaultExpanded?: boolean;
  /** External override from Dashboard Collapse All / Expand All toggle. */
  overrideExpanded?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalorieBurnCard({
  activityRecords,
  sodiumRecords,
  defaultExpanded = false,
  overrideExpanded,
}: CalorieBurnCardProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useCardExpanded('calorie-burn', defaultExpanded, overrideExpanded);

  const { bmr, isEstimated: bmrEstimated, loading: bmrLoading, weightKg: bmrWeightKg } = useBMR();

  // Read user's preferred weight unit from AsyncStorage
  const [weightUnit, setWeightUnit] = React.useState<'kg' | 'lbs'>('kg');
  React.useEffect(() => {
    AsyncStorage.getItem('@vitalsync/profile_units').then(raw => {
      if (!raw) return;
      try {
        const u = JSON.parse(raw);
        if (u.weightUnit === 'lbs') setWeightUnit('lbs');
      } catch (_unused) { /* ignore */ }
    }).catch(() => {});
  }, []);

  const weightDisplay = React.useMemo(() => {
    if (!bmrWeightKg || bmrWeightKg === 0) return null;
    if (weightUnit === 'lbs') {
      const lbs = Math.round(bmrWeightKg * 2.20462 * 10) / 10;
      return `based on ${lbs} lbs`;
    }
    return `based on ${bmrWeightKg} kg`;
  }, [bmrWeightKg, weightUnit]);

  const { goals, saveGoals } = useMacroGoals();
  const [goalEditVisible, setGoalEditVisible] = React.useState(false);
  const [goalInput, setGoalInput] = React.useState('');

  // Apply TDEE activity multiplier to BMR
  const activityMultiplier = ACTIVITY_LEVEL_MULTIPLIERS[goals.activityLevel ?? 'sedentary'];
  const tdee = bmr > 0 ? Math.round(bmr * activityMultiplier) : 0;
  const alertFiredRef = useRef(false);

  const days = useMemo(() => getLast7Days(), []);

  // Aggregate activity-burned calories per day
  const activityByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of activityRecords) {
      if (!r.caloriesBurned) continue;
      const key = toDateKey(r.timestamp);
      map[key] = (map[key] ?? 0) + r.caloriesBurned;
    }
    return map;
  }, [activityRecords]);

  // Aggregate consumed calories per day from DASH diet log
  const consumedByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of sodiumRecords) {
      if (!r.calories) continue;
      const key = toDateKey(r.timestamp);
      map[key] = (map[key] ?? 0) + r.calories;
    }
    return map;
  }, [sodiumRecords]);

  // Build 7-day dataset — add BMR to each day's burn total
  const dayData: DayData[] = useMemo(() => {
    if (bmrLoading || bmr === 0) return days.map(date => ({
      date,
      burned: activityByDay[date] ?? 0,
      consumed: consumedByDay[date] ?? 0,
      activityKcal: activityByDay[date] ?? 0,
    }));

    return days.map(date => {
      const actKcal = activityByDay[date] ?? 0;
      return {
        date,
        burned: tdee + actKcal,
        consumed: Math.round(consumedByDay[date] ?? 0),
        activityKcal: actKcal,
      };
    });
  }, [days, bmr, bmrLoading, activityByDay, consumedByDay, tdee]);

  // Today's values
  const today = todayKey();
  const todayData = dayData.find(d => d.date === today) ?? { burned: bmr, consumed: 0, activityKcal: 0, date: today };
  const todayBurned = Math.round(todayData.burned);
  const todayConsumed = Math.round(todayData.consumed);
  const todayNet = todayConsumed - todayBurned;

  // 7-day averages
  const daysWithConsume = dayData.filter(d => d.consumed > 0);
  const avgBurned = tdee > 0 ? tdee + Math.round(
    dayData.reduce((s, d) => s + d.activityKcal, 0) / 7
  ) : 0;
  const avgConsumed = daysWithConsume.length > 0
    ? Math.round(daysWithConsume.reduce((s, d) => s + d.consumed, 0) / daysWithConsume.length)
    : 0;

  const hasAnyData = bmr > 0 || daysWithConsume.length > 0;

  // ── Calorie goal alert ─────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (alertFiredRef.current) return;
    if (todayConsumed === 0) return;
    if (goals.calories === 0) return;
    if (todayConsumed <= goals.calories) return;

    async function maybeFireAlert() {
      try {
        const seen = await AsyncStorage.getItem(ALERT_SEEN_KEY);
        if (seen === today) return;

        const _perms = await getNotifications()?.getPermissionsAsync();
        const status = _perms?.status;
        if (status !== 'granted') return;

        const surplus = todayConsumed - goals.calories;
        await scheduleNotification({
          content: {
            title: '🔥 Calorie Goal Exceeded',
            body: `You've consumed ${todayConsumed.toLocaleString()} kcal today — ${surplus.toLocaleString()} kcal over your ${goals.calories.toLocaleString()} kcal goal.`,
            sound: true,
            data: { type: 'calorie-alert' },
          },
          trigger: null,
        });

        await safeSetItem(ALERT_SEEN_KEY, today);
        alertFiredRef.current = true;
      } catch (_unused) {
        // Notifications unavailable — fail silently
      }
    }

    maybeFireAlert();
  }, [todayConsumed, goals.calories, today]);

  // ── Derived colours ────────────────────────────────────────────────────────
  const burnColor = '#F97316';     // orange
  const consumeColor = '#3B82F6';  // blue
  const netPositiveColor = '#EF4444'; // red = surplus
  const netNegativeColor = '#22C55E'; // green = deficit
  const netColor = todayNet > 50 ? netPositiveColor : todayNet < -50 ? netNegativeColor : colors.muted;

  // ── Collapse toggle ────────────────────────────────────────────────────────
  function handleToggle() {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded(!expanded);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // ── Chart constants ────────────────────────────────────────────────────────
  const CHART_W = 320;
  const CHART_H = 120;
  const BAR_AREA_H = 90;
  const LABEL_H = 20;
  const BAR_GROUP_W = CHART_W / 7;
  const BAR_W = (BAR_GROUP_W - 8) / 2;
  const maxVal = Math.max(...dayData.map(d => Math.max(d.burned, d.consumed)), 500);

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* ── Header (always visible) ── */}
      <Pressable style={s.header} onPress={handleToggle}>
        <View style={[s.iconWrap, { backgroundColor: burnColor + '18' }]}>
          <Text style={{ fontSize: 14 }}>🔥</Text>
        </View>
        <View style={s.headerText}>
          <Text style={[s.title, { color: colors.foreground }]}>Caloric Balance</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>Burned vs. consumed</Text>
        </View>

        {/* Net kcal chip */}
        <View style={[s.chip, { backgroundColor: netColor + '18', borderColor: netColor + '40' }]}>
          <Text style={[s.chipNum, { color: netColor }]}>
            {(todayBurned > 0 || todayConsumed > 0)
              ? `${todayNet > 0 ? '+' : ''}${todayNet.toLocaleString()}`
              : '—'}
          </Text>
          {(todayBurned > 0 || todayConsumed > 0) && (
            <Text style={[s.chipUnit, { color: colors.muted }]}>kcal</Text>
          )}
        </View>

        {/* Surplus / deficit badge */}
        {(todayBurned > 0 || todayConsumed > 0) && (
          <View style={[s.statusBadge, { backgroundColor: netColor + '18', borderColor: netColor + '40' }]}>
            <Text style={[s.statusText, { color: netColor }]}>
              {todayNet > 50 ? 'SURPLUS' : todayNet < -50 ? 'DEFICIT' : 'BALANCED'}
            </Text>
          </View>
        )}

        {/* Pencil: quick-edit calorie goal */}
        <Pressable
          style={[s.pencilBtn, { backgroundColor: colors.primary + '15' }]}
          onPress={(e) => {
            e.stopPropagation?.();
            setGoalInput(String(goals.calories));
            setGoalEditVisible(true);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          hitSlop={8}
        >
          <IconSymbol name="pencil" size={13} color={colors.primary} />
        </Pressable>
        <IconSymbol
          name="chevron.right"
          size={14}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {/* ── Calorie goal quick-edit modal ── */}
      <Modal
        visible={goalEditVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalEditVisible(false)}
      >
        <Pressable
          style={s.modalOverlay}
          onPress={() => setGoalEditVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={[s.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>Daily Calorie Goal</Text>
              <Text style={[s.modalSub, { color: colors.muted }]}>Set your target kcal for the day</Text>
              <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[s.goalInput, { color: colors.foreground }]}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="default"
                  returnKeyType="done"
                  maxLength={5}
                  autoFocus
                  onSubmitEditing={() => {
                    const n = parseInt(goalInput, 10);
                    if (!isNaN(n) && n > 0) saveGoals({ ...goals, calories: n });
                    setGoalEditVisible(false);
                  }}
                  placeholderTextColor={colors.muted}
                  placeholder={String(goals.calories)}
                />
                <Text style={[s.inputUnit, { color: colors.muted }]}>kcal</Text>
              </View>
              <View style={s.modalActions}>
                <Pressable
                  style={[s.modalBtn, s.modalBtnCancel, { borderColor: colors.border }]}
                  onPress={() => setGoalEditVisible(false)}
                >
                  <Text style={[s.modalBtnText, { color: colors.muted }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.modalBtn, s.modalBtnSave, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    const n = parseInt(goalInput, 10);
                    if (!isNaN(n) && n > 0) saveGoals({ ...goals, calories: n });
                    setGoalEditVisible(false);
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                >
                  <Text style={[s.modalBtnText, { color: '#fff' }]}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={[s.body, { borderTopColor: colors.border }]}>
          {/* BMR note */}
          {bmr > 0 && (
            <View style={s.bmrRow}>
              <Text style={[s.bmrBadge, { color: colors.muted, borderColor: colors.border }]}>
                BMR {bmr.toLocaleString()} kcal{bmrEstimated ? '*' : ''}
              </Text>
              <Text style={[s.bmrNote, { color: colors.muted }]}>
                Burned = {bmrEstimated ? 'est. ' : ''}BMR {bmr.toLocaleString()} ×{activityMultiplier} (TDEE) + activity
                {bmrEstimated ? '  · * avg adult values' : ''}
              </Text>
              {weightDisplay && (
                <Text style={[s.bmrNote, { color: colors.muted }]}>{weightDisplay}</Text>
              )}
            </View>
          )}

          {/* Today's summary row */}
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <View style={[s.dot, { backgroundColor: burnColor }]} />
              <Text style={[s.summaryValue, { color: colors.foreground }]}>
                {todayBurned > 0 ? todayBurned.toLocaleString() : '—'}
              </Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Burned</Text>
              {todayData.activityKcal > 0 && (
                <Text style={[s.avgSub, { color: colors.muted }]}>
                  +{Math.round(todayData.activityKcal).toLocaleString()} activity
                </Text>
              )}
              {avgBurned > 0 && (
                <Text style={[s.avgSub, { color: colors.muted }]}>{avgBurned.toLocaleString()} avg/day</Text>
              )}
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <View style={s.summaryItem}>
              <View style={[s.dot, { backgroundColor: consumeColor }]} />
              <Text style={[s.summaryValue, { color: colors.foreground }]}>
                {todayConsumed > 0 ? todayConsumed.toLocaleString() : '—'}
              </Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Consumed</Text>
              {avgConsumed > 0 && (
                <Text style={[s.avgSub, { color: colors.muted }]}>{avgConsumed.toLocaleString()} avg/day</Text>
              )}
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <View style={s.summaryItem}>
              <Text style={[s.summaryValue, { color: netColor }]}>
                {todayBurned > 0 || todayConsumed > 0
                  ? `${todayNet > 0 ? '+' : ''}${todayNet.toLocaleString()}`
                  : '—'}
              </Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Net kcal</Text>
              <Text style={[s.avgSub, { color: netColor }]}>
                {todayNet > 50 ? 'surplus' : todayNet < -50 ? 'deficit' : ''}
              </Text>
            </View>
          </View>

          {/* 7-Day Bar Chart */}
          {hasAnyData ? (
            <View style={s.chartContainer}>
              <Svg width={CHART_W} height={CHART_H}>
                {[0.25, 0.5, 0.75, 1].map((frac) => {
                  const y = BAR_AREA_H * (1 - frac);
                  return (
                    <Line key={frac} x1={0} y1={y} x2={CHART_W} y2={y}
                      stroke={colors.border} strokeWidth={0.5} />
                  );
                })}
                {dayData.map((d, i) => {
                  const groupX = i * BAR_GROUP_W + 4;
                  const burnH = d.burned > 0 ? (d.burned / maxVal) * BAR_AREA_H : 0;
                  const consumeH = d.consumed > 0 ? (d.consumed / maxVal) * BAR_AREA_H : 0;
                  const isToday = d.date === today;
                  return (
                    <React.Fragment key={d.date}>
                      {burnH > 0 && (
                        <Rect x={groupX} y={BAR_AREA_H - burnH} width={BAR_W} height={burnH}
                          rx={3} fill={isToday ? burnColor : burnColor + '88'} />
                      )}
                      {consumeH > 0 && (
                        <Rect x={groupX + BAR_W + 2} y={BAR_AREA_H - consumeH}
                          width={BAR_W} height={consumeH}
                          rx={3} fill={isToday ? consumeColor : consumeColor + '88'} />
                      )}
                      <SvgText
                        x={groupX + BAR_GROUP_W / 2 - 4}
                        y={BAR_AREA_H + LABEL_H - 4}
                        fontSize={10}
                        fill={isToday ? colors.foreground : colors.muted}
                        fontWeight={isToday ? 'bold' : 'normal'}
                        textAnchor="middle"
                      >
                        {shortDay(d.date)}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </View>
          ) : (
            <View style={s.emptyState}>
              <Text style={[s.emptyText, { color: colors.muted }]}>
                Log a workout or scan a meal to see your caloric balance
              </Text>
            </View>
          )}

          {/* Legend */}
          {hasAnyData && (
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: burnColor }]} />
                <Text style={[s.legendLabel, { color: colors.muted }]}>Burned (BMR + activity)</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: consumeColor }]} />
                <Text style={[s.legendLabel, { color: colors.muted }]}>Consumed (food log)</Text>
              </View>
            </View>
          )}

          {/* Goal hint */}
          {goals.calories > 0 && todayConsumed > 0 && (
            <Text style={[s.goalHint, { color: colors.muted }]}>
              Daily goal: {goals.calories.toLocaleString()} kcal
              {todayConsumed > goals.calories
                ? `  ·  ⚠️ ${(todayConsumed - goals.calories).toLocaleString()} kcal over`
                : `  ·  ${(goals.calories - todayConsumed).toLocaleString()} kcal remaining`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: 18, borderWidth: 1, marginHorizontal: 16, marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
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
  statusBadge: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: '800' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  bmrRow: { gap: 2 },
  bmrBadge: {
    fontSize: 11, fontWeight: '500', borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start',
  },
  bmrNote: { fontSize: 11, lineHeight: 16 },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  summaryValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 11, fontWeight: '500' },
  avgSub: { fontSize: 10, marginTop: 1, textAlign: 'center' },
  divider: { width: 1, height: 60, marginHorizontal: 4, alignSelf: 'center' },
  chartContainer: { alignItems: 'center' },
  emptyState: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11 },
  goalHint: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  // Pencil quick-edit
  pencilBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // Goal edit modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalSheet: { width: '100%', maxWidth: 340, borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  modalSub: { fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  goalInput: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  inputUnit: { fontSize: 14, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnCancel: { borderWidth: 1 },
  modalBtnSave: {},
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
