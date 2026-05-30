import { safeFormatDate } from '@/lib/utils';
import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * WeeklyMacroTrendChart
 *
 * 7-day stacked bar chart showing daily macro composition (Carbs / Fat / Protein)
 * with a calorie burn line overlay (TDEE + activity).
 *
 * Data sources:
 *   - Macros: SodiumRecord.calories / carbs / fat / protein (DASH diet log)
 *   - Burn line: BMR × activity multiplier + ActivityRecord.caloriesBurned
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, useColorScheme, Pressable, Share, Platform } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { getNotifications } from '@/lib/notifications/safe-notifications';
import type { ActivityRecord, SodiumRecord } from '@/lib/health/types';
import { useBMR } from '@/lib/health/bmr';
import { useMacroGoals, ACTIVITY_LEVEL_MULTIPLIERS } from '@/hooks/use-macro-goals';

const MACRO_ALERT_KEY = '@vitalsync/macro_progress_alert_v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
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

interface DayMacros {
  date: string;
  calories: number;
  carbs: number;    // g
  fat: number;      // g
  protein: number;  // g
  burned: number;   // kcal (TDEE + activity)
}

interface WeeklyMacroTrendChartProps {
  sodiumRecords: SodiumRecord[];
  activityRecords: ActivityRecord[];
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const CARB_COLOR = '#3B82F6';
const FAT_COLOR = '#A855F7';
const PROT_COLOR = '#10B981';
const BURN_COLOR = '#F97316';

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklyMacroTrendChart({ sodiumRecords, activityRecords }: WeeklyMacroTrendChartProps) {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const { bmr, loading: _bmrLoading } = useBMR();
  const { goals } = useMacroGoals();
  const activityMultiplier = ACTIVITY_LEVEL_MULTIPLIERS[goals.activityLevel ?? 'sedentary'];
  const tdee = bmr > 0 ? Math.round(bmr * activityMultiplier) : 0;

  const days = useMemo(() => getLast7Days(), []);
  const today = days[6];
  const macroAlertFiredRef = useRef(false);

  // Aggregate macros per day
  const macrosByDay = useMemo(() => {
    const map: Record<string, { calories: number; carbs: number; fat: number; protein: number }> = {};
    for (const r of sodiumRecords) {
      const key = toDateKey(r.timestamp);
      if (!map[key]) map[key] = { calories: 0, carbs: 0, fat: 0, protein: 0 };
      map[key].calories += r.calories ?? 0;
      map[key].carbs += r.carbsG ?? 0;
      map[key].fat += r.fatG ?? 0;
      map[key].protein += r.proteinG ?? 0;
    }
    return map;
  }, [sodiumRecords]);

  // Aggregate activity burn per day
  const activityByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of activityRecords) {
      if (!r.caloriesBurned) continue;
      const key = toDateKey(r.timestamp);
      map[key] = (map[key] ?? 0) + r.caloriesBurned;
    }
    return map;
  }, [activityRecords]);

  // Build 7-day dataset
  const dayData: DayMacros[] = useMemo(() =>
    days.map(date => {
      const m = macrosByDay[date] ?? { calories: 0, carbs: 0, fat: 0, protein: 0 };
      const actKcal = activityByDay[date] ?? 0;
      return {
        date,
        calories: Math.round(m.calories),
        carbs: Math.round(m.carbs),
        fat: Math.round(m.fat),
        protein: Math.round(m.protein),
        burned: tdee + actKcal,
      };
    }),
    [days, macrosByDay, activityByDay, tdee]
  );

  const hasAnyMacros = dayData.some(d => d.carbs > 0 || d.fat > 0 || d.protein > 0);

  // ── Macro progress alert at 8 PM ─────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (macroAlertFiredRef.current) return;

    const todayData = dayData[6];
    if (!todayData) return;

    const now = new Date();
    const hour = now.getHours();
    // Only fire between 20:00 and 23:59
    if (hour < 20) return;

    const proteinGoal = goals.protein ?? 0;
    const carbsGoal = goals.carbs ?? 0;
    const fatGoal = goals.fat ?? 0;
    if (proteinGoal === 0 && carbsGoal === 0 && fatGoal === 0) return;

    // Check which macros are below 60% of their target
    const lowMacros: string[] = [];
    if (proteinGoal > 0 && todayData.protein < proteinGoal * 0.6) lowMacros.push(`🥩 Protein (${todayData.protein}g / ${proteinGoal}g)`);
    if (carbsGoal > 0 && todayData.carbs < carbsGoal * 0.6) lowMacros.push(`🌾 Carbs (${todayData.carbs}g / ${carbsGoal}g)`);
    if (fatGoal > 0 && todayData.fat < fatGoal * 0.6) lowMacros.push(`🥑 Fat (${todayData.fat}g / ${fatGoal}g)`);

    if (lowMacros.length === 0) return;

    async function maybeFireMacroAlert() {
      try {
        const todayKey = now.toISOString().slice(0, 10);
        const seen = await AsyncStorage.getItem(MACRO_ALERT_KEY);
        if (seen === todayKey) return;

        const _p = await getNotifications()?.getPermissionsAsync(); const status = _p?.status;
        if (status !== 'granted') return;

        await scheduleNotification({
          content: {
            title: '📊 Macro Check-In',
            body: `Still below 60% on: ${lowMacros.join(', ')}. Consider a snack before bed!`,
            sound: true,
            data: { type: 'macro-alert' },
          },
          trigger: null,
        });

        await safeSetItem(MACRO_ALERT_KEY, todayKey);
        macroAlertFiredRef.current = true;
      } catch (_unused) {
        // Notifications unavailable — fail silently
      }
    }

    maybeFireMacroAlert();
  }, [dayData, goals]);

  // ── Share weekly report ────────────────────────────────────────────────────
  async function handleShare() {
    const lines = [
      '📊 Weekly Macro Report — VitalSync',
      `Generated: ${safeFormatDate(Date.now())}`,
      '',
      'Date       | Carbs  | Fat    | Protein | Calories',
      '-----------|--------|--------|---------|----------',
      ...dayData.map(d => {
        const cal = Math.round(d.carbs * 4 + d.fat * 9 + d.protein * 4);
        return `${d.date} | ${String(d.carbs + 'g').padEnd(6)} | ${String(d.fat + 'g').padEnd(6)} | ${String(d.protein + 'g').padEnd(7)} | ${cal} kcal`;
      }),
      '',
      `Goals: Carbs ${goals.carbs}g · Fat ${goals.fat}g · Protein ${goals.protein}g · ${goals.calories} kcal/day`,
    ];
    try {
      await Share.share({ message: lines.join('\n'), title: 'Weekly Macro Report' });
    } catch (_unused) {
      // Share cancelled or unavailable
    }
  }

  // Chart geometry
  const CHART_W = 320;
  const BAR_AREA_H = 100;
  const LABEL_H = 20;
  const CHART_H = BAR_AREA_H + LABEL_H;
  const BAR_W = (CHART_W / 7) - 8;
  const BAR_GAP = 4;

  // Scale: max of consumed kcal or burn line
  const maxKcal = Math.max(
    ...dayData.map(d => {
      const carbKcal = d.carbs * 4;
      const fatKcal = d.fat * 9;
      const protKcal = d.protein * 4;
      return Math.max(carbKcal + fatKcal + protKcal, d.burned);
    }),
    500
  );

  // Build burn line points
  const burnPoints = dayData.map((d, i) => {
    const x = i * (CHART_W / 7) + BAR_GAP + BAR_W / 2;
    const y = d.burned > 0 ? BAR_AREA_H - (d.burned / maxKcal) * BAR_AREA_H : -1;
    return { x, y, valid: d.burned > 0 };
  });
  const burnPolyline = burnPoints
    .filter(p => p.valid)
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  const cardBg = isDark ? '#1e2022' : '#ffffff';
  const borderCol = isDark ? '#334155' : '#E5E7EB';
  const mutedCol = isDark ? '#9BA1A6' : '#687076';
  const textCol = isDark ? '#ECEDEE' : '#11181C';
  const gridCol = isDark ? '#334155' : '#E5E7EB';

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: textCol }]}>📊 Weekly Macro Trend</Text>
          <Text style={[styles.subtitle, { color: mutedCol }]}>7-day intake composition</Text>
        </View>
        {hasAnyMacros && (
          <Pressable
            style={({ pressed }) => [styles.shareBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', opacity: pressed ? 0.6 : 1 }]}
            onPress={handleShare}
          >
            <Text style={[styles.shareBtnText, { color: mutedCol }]}>📤 Share</Text>
          </Pressable>
        )}
      </View>

      {hasAnyMacros ? (
        <>
          <View style={styles.chartContainer}>
            <Svg width={CHART_W} height={CHART_H}>
              {/* Grid lines */}
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const y = BAR_AREA_H * (1 - frac);
                return (
                  <Line
                    key={frac}
                    x1={0} y1={y}
                    x2={CHART_W} y2={y}
                    stroke={gridCol}
                    strokeWidth={0.5}
                  />
                );
              })}

              {/* Stacked bars */}
              {dayData.map((d, i) => {
                const x = i * (CHART_W / 7) + BAR_GAP;
                const isToday = d.date === today;
                const alpha = isToday ? 'FF' : '99';

                const carbKcal = d.carbs * 4;
                const fatKcal = d.fat * 9;
                const protKcal = d.protein * 4;
                const totalKcal = carbKcal + fatKcal + protKcal;

                if (totalKcal === 0) {
                  return (
                    <SvgText
                      key={d.date}
                      x={x + BAR_W / 2}
                      y={BAR_AREA_H + LABEL_H - 4}
                      fontSize={10}
                      fill={mutedCol}
                      textAnchor="middle"
                    >
                      {shortDay(d.date)}
                    </SvgText>
                  );
                }

                const carbH = (carbKcal / maxKcal) * BAR_AREA_H;
                const fatH = (fatKcal / maxKcal) * BAR_AREA_H;
                const protH = (protKcal / maxKcal) * BAR_AREA_H;

                let yOffset = BAR_AREA_H;

                return (
                  <React.Fragment key={d.date}>
                    {/* Protein (bottom) */}
                    {protH > 0 && (() => {
                      yOffset -= protH;
                      return (
                        <Rect
                          x={x} y={yOffset}
                          width={BAR_W} height={protH}
                          rx={protH === carbH + fatH + protH ? 3 : 0}
                          fill={PROT_COLOR + alpha}
                        />
                      );
                    })()}
                    {/* Fat (middle) */}
                    {fatH > 0 && (() => {
                      yOffset -= fatH;
                      return (
                        <Rect
                          x={x} y={yOffset}
                          width={BAR_W} height={fatH}
                          fill={FAT_COLOR + alpha}
                        />
                      );
                    })()}
                    {/* Carbs (top) */}
                    {carbH > 0 && (() => {
                      const topY = yOffset - carbH;
                      return (
                        <Rect
                          x={x} y={topY}
                          width={BAR_W} height={carbH}
                          rx={3}
                          fill={CARB_COLOR + alpha}
                        />
                      );
                    })()}
                    {/* Day label */}
                    <SvgText
                      x={x + BAR_W / 2}
                      y={BAR_AREA_H + LABEL_H - 4}
                      fontSize={10}
                      fill={isToday ? textCol : mutedCol}
                      fontWeight={isToday ? 'bold' : 'normal'}
                      textAnchor="middle"
                    >
                      {shortDay(d.date)}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {/* Burn line overlay */}
              {burnPolyline.length > 0 && (
                <Polyline
                  points={burnPolyline}
                  fill="none"
                  stroke={BURN_COLOR}
                  strokeWidth={2}
                  strokeDasharray="4,3"
                />
              )}
              {/* Burn line dots */}
              {burnPoints.filter(p => p.valid).map((p, i) => (
                <Circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={BURN_COLOR}
                />
              ))}
            </Svg>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CARB_COLOR }]} />
              <Text style={[styles.legendLabel, { color: mutedCol }]}>Carbs</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: FAT_COLOR }]} />
              <Text style={[styles.legendLabel, { color: mutedCol }]}>Fat</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PROT_COLOR }]} />
              <Text style={[styles.legendLabel, { color: mutedCol }]}>Protein</Text>
            </View>
            {tdee > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { borderColor: BURN_COLOR }]} />
                <Text style={[styles.legendLabel, { color: mutedCol }]}>Burn (TDEE)</Text>
              </View>
            )}
          </View>

          {/* Today's nutrition breakdown */}
          {(() => {
            const t = dayData[6];
            if (!t || (t.carbs === 0 && t.fat === 0 && t.protein === 0)) return null;
            return (
              <View style={[styles.todayRow, { borderTopColor: borderCol }]}>
                <Text style={[styles.todayLabel, { color: mutedCol }]}>Today</Text>
                <View style={styles.todayPills}>
                  {t.carbs > 0 && (
                    <View style={[styles.pill, { backgroundColor: CARB_COLOR + '18', borderColor: CARB_COLOR + '40' }]}>
                      <Text style={[styles.pillText, { color: CARB_COLOR }]}>🌾 {t.carbs}g</Text>
                    </View>
                  )}
                  {t.fat > 0 && (
                    <View style={[styles.pill, { backgroundColor: FAT_COLOR + '18', borderColor: FAT_COLOR + '40' }]}>
                      <Text style={[styles.pillText, { color: FAT_COLOR }]}>🥑 {t.fat}g</Text>
                    </View>
                  )}
                  {t.protein > 0 && (
                    <View style={[styles.pill, { backgroundColor: PROT_COLOR + '18', borderColor: PROT_COLOR + '40' }]}>
                      <Text style={[styles.pillText, { color: PROT_COLOR }]}>🥩 {t.protein}g</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: mutedCol }]}>
            Scan or log meals to see your weekly macro composition
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
  },
  chartContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLine: {
    width: 14,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendLabel: {
    fontSize: 11,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    flexWrap: 'wrap',
  },
  todayLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  todayPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  shareBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
