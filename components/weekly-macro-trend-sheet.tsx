/**
 * WeeklyMacroTrendSheet
 *
 * Bottom sheet that shows a 7-day bar chart for a single macro (protein, fat, or carbs).
 * Opened when the user taps a sparkline in the MacroLegendItem inside EvidenceBasedMacrosCard.
 *
 * Features:
 *  - 7-day grouped bar chart (one bar per day, coloured by macro)
 *  - Goal line overlay (dashed, from macroGoals prop)
 *  - Day labels (Mon, Tue, … Today)
 *  - Today's value highlighted
 *  - 7-day average badge
 *  - Tap a bar to see exact value for that day
 */

import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useColorScheme, useColors } from '@/hooks';
import type { DailyNutrients } from '@/lib/health/daily-nutrients';
import type { MacroGoals } from '@/hooks/use-macro-goals';

// ─── Accent palette ───────────────────────────────────────────────────────────
const EMERALD = '#10B981';
const VIOLET  = '#8B5CF6';
const AMBER   = '#F59E0B';

const MACRO_CONFIG = {
  protein: { label: 'Protein', color: EMERALD, unit: 'g', field: 'protein_g' as keyof DailyNutrients, goalField: 'protein' as keyof MacroGoals },
  fat:     { label: 'Fat',     color: VIOLET,  unit: 'g', field: 'fats_g'    as keyof DailyNutrients, goalField: 'fat'     as keyof MacroGoals },
  carbs:   { label: 'Carbs',   color: AMBER,   unit: 'g', field: 'carbohydrates_g' as keyof DailyNutrients, goalField: 'carbs' as keyof MacroGoals },
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_HEIGHT = 180;
const BAR_GAP = 6;

interface WeeklyMacroTrendSheetProps {
  visible: boolean;
  macro: 'protein' | 'fat' | 'carbs' | null;
  weeklyNutrients: (DailyNutrients | null)[];
  macroGoals?: MacroGoals | null;
  onClose: () => void;
}

export function WeeklyMacroTrendSheet({
  visible,
  macro,
  weeklyNutrients,
  macroGoals,
  onClose,
}: WeeklyMacroTrendSheetProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const cfg = macro ? MACRO_CONFIG[macro] : null;

  // ── Build 7-day data ─────────────────────────────────────────────────────
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const label = i === 6 ? 'Today' : dayNames[d.getDay()];
      const nutrient = weeklyNutrients[i];
      const value = cfg && nutrient ? (nutrient[cfg.field] as number) ?? 0 : 0;
      return { label, value, date: d.toISOString().split('T')[0], isToday: i === 6 };
    });
  }, [weeklyNutrients, cfg]);

  const maxValue = useMemo(() => {
    const goal = cfg && macroGoals ? (macroGoals[cfg.goalField] as number) ?? 0 : 0;
    return Math.max(...days.map(d => d.value), goal, 1);
  }, [days, cfg, macroGoals]);

  const goalValue = cfg && macroGoals ? (macroGoals[cfg.goalField] as number) ?? 0 : 0;
  const goalLineY = goalValue > 0 ? CHART_HEIGHT - (goalValue / maxValue) * CHART_HEIGHT : null;

  const weeklyAvg = useMemo(() => {
    const vals = days.filter(d => d.value > 0).map(d => d.value);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [days]);

  const cardBg = isDark ? '#1A1B22' : '#FFFFFF';
  const surfaceBg = isDark ? '#23242E' : '#F5F5F7';
  const barBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  if (!cfg) return null;

  const barWidth = (SCREEN_WIDTH - 40 - 32 - BAR_GAP * 6) / 7;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: cardBg }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={[s.colorDot, { backgroundColor: cfg.color }]} />
              <Text style={[s.title, { color: colors.foreground }]}>
                7-Day {cfg.label} Trend
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [s.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={onClose}
            >
              <Text style={[s.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          {/* Weekly average badge */}
          {weeklyAvg !== null && (
            <View style={[s.avgBadge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '40' }]}>
              <Text style={[s.avgBadgeText, { color: cfg.color }]}>
                7-day avg: {weeklyAvg.toFixed(1)}{cfg.unit}
              </Text>
              {goalValue > 0 && (
                <Text style={[s.avgBadgeGoal, { color: colors.muted }]}>
                  {' '}· Goal: {goalValue}{cfg.unit}
                </Text>
              )}
            </View>
          )}

          {/* Selected day callout */}
          {selectedIndex !== null && (
            <View style={[s.callout, { backgroundColor: surfaceBg }]}>
              <Text style={[s.calloutDay, { color: colors.muted }]}>{days[selectedIndex].label}</Text>
              <Text style={[s.calloutValue, { color: cfg.color }]}>
                {days[selectedIndex].value > 0
                  ? `${days[selectedIndex].value.toFixed(1)}${cfg.unit}`
                  : 'No data'}
              </Text>
              {goalValue > 0 && days[selectedIndex].value > 0 && (
                <Text style={[s.calloutDiff, { color: days[selectedIndex].value >= goalValue ? EMERALD : colors.muted }]}>
                  {days[selectedIndex].value >= goalValue
                    ? `+${(days[selectedIndex].value - goalValue).toFixed(1)}g above goal`
                    : `${(goalValue - days[selectedIndex].value).toFixed(1)}g below goal`}
                </Text>
              )}
            </View>
          )}

          {/* Bar chart */}
          <ScrollView
            horizontal={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.chartContainer}
          >
            <View style={[s.chart, { height: CHART_HEIGHT }]}>
              {/* Goal line */}
              {goalLineY !== null && (
                <View
                  style={[
                    s.goalLine,
                    {
                      top: goalLineY,
                      borderColor: cfg.color + '60',
                    },
                  ]}
                  pointerEvents="none"
                >
                  <View style={[s.goalLineDash, { borderColor: cfg.color + '60' }]} />
                  <Text style={[s.goalLineLabel, { color: cfg.color }]}>
                    Goal {goalValue}{cfg.unit}
                  </Text>
                </View>
              )}

              {/* Bars */}
              <View style={s.barsRow}>
                {days.map((day, i) => {
                  const barH = day.value > 0 ? Math.max((day.value / maxValue) * CHART_HEIGHT, 4) : 0;
                  const isSelected = selectedIndex === i;
                  const isToday = day.isToday;
                  return (
                    <Pressable
                      key={i}
                      style={[s.barCol, { width: barWidth }]}
                      onPress={() => setSelectedIndex(isSelected ? null : i)}
                    >
                      {/* Bar track */}
                      <View style={[s.barTrack, { height: CHART_HEIGHT, backgroundColor: barBg }]}>
                        {/* Filled bar */}
                        {barH > 0 && (
                          <View
                            style={[
                              s.bar,
                              {
                                height: barH,
                                backgroundColor: isSelected
                                  ? cfg.color
                                  : isToday
                                    ? cfg.color + 'CC'
                                    : cfg.color + '70',
                              },
                            ]}
                          />
                        )}
                      </View>
                      {/* Day label */}
                      <Text
                        style={[
                          s.dayLabel,
                          {
                            color: isToday ? cfg.color : colors.muted,
                            fontWeight: isToday ? '700' : '400',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Y-axis labels */}
            <View style={s.yAxisRow}>
              {[0, 0.25, 0.5, 0.75, 1].reverse().map((frac, i) => (
                <Text key={i} style={[s.yAxisLabel, { color: colors.muted }]}>
                  {Math.round(maxValue * frac)}{cfg.unit}
                </Text>
              ))}
            </View>

            {/* Data table */}
            <View style={[s.table, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
              <View style={[s.tableHeader, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                <Text style={[s.tableHeaderCell, { color: colors.muted, flex: 2 }]}>Day</Text>
                <Text style={[s.tableHeaderCell, { color: colors.muted, flex: 1, textAlign: 'right' }]}>{cfg.label}</Text>
                {goalValue > 0 && (
                  <Text style={[s.tableHeaderCell, { color: colors.muted, flex: 1, textAlign: 'right' }]}>vs Goal</Text>
                )}
              </View>
              {days.map((day, i) => {
                const diff = goalValue > 0 && day.value > 0 ? day.value - goalValue : null;
                return (
                  <View
                    key={i}
                    style={[
                      s.tableRow,
                      {
                        backgroundColor: day.isToday ? cfg.color + '10' : 'transparent',
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      },
                    ]}
                  >
                    <Text style={[s.tableCell, { color: day.isToday ? cfg.color : colors.foreground, flex: 2, fontWeight: day.isToday ? '700' : '400' }]}>
                      {day.label}
                    </Text>
                    <Text style={[s.tableCell, { color: day.value > 0 ? colors.foreground : colors.muted, flex: 1, textAlign: 'right' }]}>
                      {day.value > 0 ? `${day.value.toFixed(1)}g` : '—'}
                    </Text>
                    {goalValue > 0 && (
                      <Text style={[s.tableCell, { color: diff === null ? colors.muted : diff >= 0 ? EMERALD : '#EF4444', flex: 1, textAlign: 'right' }]}>
                        {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}g`}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  avgBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  avgBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  avgBadgeGoal: {
    fontSize: 12,
    fontWeight: '400',
  },
  callout: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  calloutDay: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calloutValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  calloutDiff: {
    fontSize: 12,
    fontWeight: '500',
  },
  chartContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  chart: {
    position: 'relative',
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
    gap: 6,
  },
  goalLineDash: {
    flex: 1,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  goalLineLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BAR_GAP,
    height: CHART_HEIGHT,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  barCol: {
    alignItems: 'center',
    gap: 4,
  },
  barTrack: {
    flex: 1,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    borderRadius: 6,
    width: '100%',
  },
  dayLabel: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
  },
  yAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  yAxisLabel: {
    fontSize: 9,
  },
  table: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableCell: {
    fontSize: 13,
  },
});
