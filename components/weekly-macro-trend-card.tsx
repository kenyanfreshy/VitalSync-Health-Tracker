/**
 * WeeklyMacroTrendCard — Collapsible Dashboard Card
 *
 * Header always visible: title + today's P/F/C summary chips.
 * Expanded body contains:
 *  1. 7-day macro bar chart + legend
 *  2. 7-Day Caloric Trend (bar chart + stats row)
 *  3. Quick Actions (Correlation Engine + Personal Health Report)
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  TouchableOpacity,
} from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import type { SodiumRecord } from '@/lib/health/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyMacroTrendCardProps {
  sodiumRecords: SodiumRecord[];
  proteinGoalG?: number;
  fatGoalG?: number;
  carbsGoalG?: number;
  /** Caloric goal in kcal. Default 2000. */
  goalKcal?: number;

  defaultExpanded?: boolean;
  /** External override from Collapse All / Expand All toggle. */
  overrideExpanded?: boolean;
  /** Called when user taps "Correlation Engine" quick action. */
  onCorrelationEngine?: () => void;
  /** Called when user taps "Personal Health Report" quick action. */
  onDoctorReport?: () => void;
}

interface DayMacros {
  label: string;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const PROTEIN_COLOR = '#38BDF8';
const FAT_COLOR     = '#F59E0B';
const CARBS_COLOR   = '#10B981';

// ─── Macro chart constants ────────────────────────────────────────────────────

const CHART_W = 260;
const CHART_H = 100;
const PAD_X   = 20;
const PAD_Y   = 10;
const BAR_GAP = 2;

// ─── Caloric trend chart constants ───────────────────────────────────────────

const CT_W      = 260;
const CT_H      = 90;
const CT_PAD_X  = 20;
const CT_PAD_Y  = 10;
const CT_BAR_W  = 22;

function ctBarColor(kcal: number, goal: number): string {
  if (kcal <= 0) return '#9BA1A6';
  if (kcal > goal * 1.1) return '#EF4444';
  if (kcal > goal * 0.9) return '#F59E0B';
  return '#10B981';
}



// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklyMacroTrendCard({
  sodiumRecords,
  proteinGoalG = 150,
  fatGoalG = 65,
  carbsGoalG = 250,
  goalKcal = 2000,
  defaultExpanded = false,
  overrideExpanded,
  onCorrelationEngine,
  onDoctorReport,
}: WeeklyMacroTrendCardProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useCardExpanded('weekly-macro-trend', defaultExpanded, overrideExpanded);

  // ── 7-day macro data ──────────────────────────────────────────────────────
  const days: DayMacros[] = useMemo(() => {
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: DayMacros[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toDateString();
      const dayRecs = sodiumRecords.filter(
        (r) => new Date(r.timestamp).toDateString() === dateStr,
      );
      result.push({
        label: DAY_LABELS[d.getDay()],
        proteinG: dayRecs.reduce((s, r) => s + (r.proteinG ?? 0), 0),
        fatG: dayRecs.reduce((s, r) => s + (r.fatG ?? 0), 0),
        carbsG: dayRecs.reduce((s, r) => s + (r.carbsG ?? 0), 0),
      });
    }
    return result;
  }, [sodiumRecords]);

  // ── 7-day caloric trend data ──────────────────────────────────────────────
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



  // ── Macro chart geometry ──────────────────────────────────────────────────
  const today    = days[days.length - 1];
  const maxVal   = Math.max(
    ...days.flatMap((d) => [d.proteinG, d.fatG, d.carbsG]),
    proteinGoalG, fatGoalG, carbsGoalG, 1,
  );
  const usableW  = CHART_W - PAD_X * 2;
  const usableH  = CHART_H - PAD_Y * 2;
  const groupW   = usableW / 7;
  const barW     = (groupW - BAR_GAP * 4) / 3;

  function barH(val: number) { return (val / maxVal) * usableH; }
  function barX(dayIdx: number, barIdx: number) {
    return PAD_X + dayIdx * groupW + BAR_GAP + barIdx * (barW + BAR_GAP);
  }
  function barY(val: number) { return PAD_Y + usableH - barH(val); }

  // ── Caloric trend chart geometry ──────────────────────────────────────────
  const maxKcal   = Math.max(...caloricDays.map((d) => d.kcal), goalKcal, 1);
  const ctUsableH = CT_H - CT_PAD_Y * 2;
  const ctStep    = (CT_W - CT_PAD_X * 2) / 7;
  const toY       = (k: number) => CT_PAD_Y + ctUsableH - (k / maxKcal) * ctUsableH;
  const ctBarX    = (i: number) => CT_PAD_X + i * ctStep + (ctStep - CT_BAR_W) / 2;
  const trendColor = (() => {
    const first3 = caloricDays.slice(0, 3).reduce((s, d) => s + d.kcal, 0) / 3;
    const last3  = caloricDays.slice(4, 7).reduce((s, d) => s + d.kcal, 0) / 3;
    if (last3 > first3 + 50) return '#EF4444';
    if (last3 < first3 - 50) return '#10B981';
    return '#F59E0B';
  })();

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

  const hasCaloricData = caloricDays.some((d) => d.kcal > 0);

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* ── Header (always visible) ── */}
      <Pressable style={s.header} onPress={handleToggle}>
        <View style={[s.iconWrap, { backgroundColor: PROTEIN_COLOR + '18' }]}>
          <Text style={{ fontSize: 14 }}>📊</Text>
        </View>
        <View style={s.headerText}>
          <Text style={[s.title, { color: colors.foreground }]}>Nutrition & Actions</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>Macros · Calories · Quick Links</Text>
        </View>
        {/* Today's P/F/C chips */}
        <View style={s.chipRow}>
          <View style={[s.chip, { backgroundColor: PROTEIN_COLOR + '18', borderColor: PROTEIN_COLOR + '40' }]}>
            <Text style={[s.chipLabel, { color: PROTEIN_COLOR }]}>P</Text>
            <Text style={[s.chipVal, { color: PROTEIN_COLOR }]}>{Math.round(today.proteinG)}g</Text>
          </View>
          <View style={[s.chip, { backgroundColor: FAT_COLOR + '18', borderColor: FAT_COLOR + '40' }]}>
            <Text style={[s.chipLabel, { color: FAT_COLOR }]}>F</Text>
            <Text style={[s.chipVal, { color: FAT_COLOR }]}>{Math.round(today.fatG)}g</Text>
          </View>
          <View style={[s.chip, { backgroundColor: CARBS_COLOR + '18', borderColor: CARBS_COLOR + '40' }]}>
            <Text style={[s.chipLabel, { color: CARBS_COLOR }]}>C</Text>
            <Text style={[s.chipVal, { color: CARBS_COLOR }]}>{Math.round(today.carbsG)}g</Text>
          </View>
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

          {/* ── Section 1: 7-Day Macro Bar Chart ── */}
          <Text style={[s.sectionTitle, { color: colors.muted }]}>7-DAY MACRO TREND</Text>
          <View style={s.chartWrap}>
            <Svg width={CHART_W} height={CHART_H}>
              <Line x1={PAD_X} y1={PAD_Y + usableH} x2={CHART_W - PAD_X} y2={PAD_Y + usableH} stroke={colors.border} strokeWidth={1} />
              {[
                { val: proteinGoalG, color: PROTEIN_COLOR },
                { val: fatGoalG,     color: FAT_COLOR },
                { val: carbsGoalG,   color: CARBS_COLOR },
              ].map(({ val, color }) => (
                <Line key={color} x1={PAD_X} y1={barY(val)} x2={CHART_W - PAD_X} y2={barY(val)} stroke={color + '40'} strokeWidth={1} strokeDasharray="3,3" />
              ))}
              {days.map((d, i) => {
                const isToday = i === 6;
                return (
                  <React.Fragment key={i}>
                    <Rect x={barX(i, 0)} y={barY(d.proteinG)} width={barW} height={barH(d.proteinG)} fill={PROTEIN_COLOR + (isToday ? 'FF' : '80')} rx={2} />
                    <Rect x={barX(i, 1)} y={barY(d.fatG)}     width={barW} height={barH(d.fatG)}     fill={FAT_COLOR     + (isToday ? 'FF' : '80')} rx={2} />
                    <Rect x={barX(i, 2)} y={barY(d.carbsG)}   width={barW} height={barH(d.carbsG)}   fill={CARBS_COLOR   + (isToday ? 'FF' : '80')} rx={2} />
                    <SvgText x={barX(i, 1) + barW / 2} y={CHART_H - 1} textAnchor="middle" fontSize={8} fill={isToday ? colors.foreground : colors.muted} fontWeight={isToday ? '700' : '400'}>{d.label}</SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>
          <View style={s.legend}>
            {[
              { label: 'Protein', color: PROTEIN_COLOR, goal: proteinGoalG, val: today.proteinG },
              { label: 'Fat',     color: FAT_COLOR,     goal: fatGoalG,     val: today.fatG },
              { label: 'Carbs',   color: CARBS_COLOR,   goal: carbsGoalG,   val: today.carbsG },
            ].map(({ label, color, goal, val }) => (
              <View key={label} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: color }]} />
                <Text style={[s.legendLabel, { color: colors.muted }]}>{label}</Text>
                <Text style={[s.legendVal, { color }]}>{Math.round(val)}g</Text>
                <Text style={[s.legendGoal, { color: colors.muted }]}>/ {goal}g</Text>
              </View>
            ))}
          </View>

          {/* ── Section 2: 7-Day Caloric Trend ── */}
          {hasCaloricData && (
            <>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <Text style={[s.sectionTitle, { color: colors.muted }]}>7-DAY CALORIC TREND</Text>
              <View style={s.chartWrap}>
                <Svg width={CT_W} height={CT_H}>
                  <Line x1={CT_PAD_X} y1={CT_PAD_Y + ctUsableH} x2={CT_W - CT_PAD_X} y2={CT_PAD_Y + ctUsableH} stroke={colors.border} strokeWidth={1} />
                  <Line x1={CT_PAD_X} y1={toY(goalKcal)} x2={CT_W - CT_PAD_X} y2={toY(goalKcal)} stroke="#10B98160" strokeWidth={1.5} strokeDasharray="4,3" />
                  <SvgText x={CT_W - CT_PAD_X + 2} y={toY(goalKcal) + 4} fontSize={7} fill="#10B981">GOAL</SvgText>
                  {caloricDays.map((d, i) => {
                    const h   = d.kcal > 0 ? (d.kcal / maxKcal) * ctUsableH : 2;
                    const x   = ctBarX(i);
                    const bY  = d.kcal > 0 ? toY(d.kcal) : CT_PAD_Y + ctUsableH - 2;
                    const bc  = ctBarColor(d.kcal, goalKcal);
                    return (
                      <React.Fragment key={i}>
                        <Rect x={x} y={bY} width={CT_BAR_W} height={h} fill={bc + (d.isToday ? 'FF' : '70')} rx={3} />
                        <SvgText x={x + CT_BAR_W / 2} y={CT_H - 1} textAnchor="middle" fontSize={8} fill={d.isToday ? colors.foreground : '#9BA1A6'} fontWeight={d.isToday ? '700' : '400'}>{d.label}</SvgText>
                        {d.kcal > 0 && <SvgText x={x + CT_BAR_W / 2} y={bY - 3} textAnchor="middle" fontSize={7} fill={bc} fontWeight="700">{Math.round(d.kcal)}</SvgText>}
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </View>
              <View style={[s.caloricStatsRow, { borderTopColor: colors.border }]}>
                <View style={s.caloricStatItem}>
                  <Text style={[s.caloricStatLabel, { color: colors.muted }]}>7-Day Avg</Text>
                  <Text style={[s.caloricStatVal, { color: trendColor }]}>{caloricAvg > 0 ? `${caloricAvg} kcal` : '—'}</Text>
                </View>
                <View style={s.caloricStatItem}>
                  <Text style={[s.caloricStatLabel, { color: colors.muted }]}>Daily Goal</Text>
                  <Text style={[s.caloricStatVal, { color: colors.foreground }]}>{goalKcal} kcal</Text>
                </View>
                <View style={s.caloricStatItem}>
                  <Text style={[s.caloricStatLabel, { color: colors.muted }]}>vs. Goal</Text>
                  <Text style={[s.caloricStatVal, { color: caloricAvg > 0 ? (caloricAvg > goalKcal ? '#EF4444' : '#10B981') : '#9BA1A6' }]}>
                    {caloricAvg > 0 ? `${caloricAvg > goalKcal ? '+' : ''}${caloricAvg - goalKcal} kcal` : '—'}
                  </Text>
                </View>
              </View>
            </>
          )}


          {/* ── Section 4: Quick Actions ── */}
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Text style={[s.sectionTitle, { color: colors.muted }]}>QUICK ACTIONS</Text>
          <View style={s.quickActionsRow}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
              onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onCorrelationEngine?.(); }}
              activeOpacity={0.75}
            >
              <View style={[s.actionIcon, { backgroundColor: colors.primary + '20' }]}>
                <IconSymbol name="chart.bar.fill" size={18} color={colors.primary} />
              </View>
              <Text style={[s.actionTitle, { color: colors.foreground }]}>Correlation Engine</Text>
              <Text style={[s.actionSub, { color: colors.muted }]}>Find patterns in your vitals</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDoctorReport?.(); }}
              activeOpacity={0.75}
            >
              <View style={[s.actionIcon, { backgroundColor: colors.muted + '20' }]}>
                <IconSymbol name="doc.text.fill" size={18} color={colors.muted} />
              </View>
              <Text style={[s.actionTitle, { color: colors.foreground }]}>Personal Health Report</Text>
              <Text style={[s.actionSub, { color: colors.muted }]}>Generate & export PDF</Text>
            </TouchableOpacity>
          </View>

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
  chipRow: { flexDirection: 'row', gap: 4 },
  chip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 3, alignItems: 'center' },
  chipLabel: { fontSize: 8, fontWeight: '700' },
  chipVal: { fontSize: 10, fontWeight: '800' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  chartWrap: { alignItems: 'center' },
  legend: { flexDirection: 'row', justifyContent: 'space-around' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10 },
  legendVal: { fontSize: 11, fontWeight: '700' },
  legendGoal: { fontSize: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  // Caloric trend stats
  caloricStatsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8,
  },
  caloricStatItem: { alignItems: 'center', gap: 2 },
  caloricStatLabel: { fontSize: 10 },
  caloricStatVal: { fontSize: 12, fontWeight: '800' },
  // Caloric balance gauge
  balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gaugeStatsCol: { flex: 1, gap: 7 },
  gaugeStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gaugeStatDot: { width: 7, height: 7, borderRadius: 4 },
  gaugeStatLabel: { fontSize: 10, flex: 1 },
  gaugeStatVal: { fontSize: 11, fontWeight: '700' },
  gaugeNoData: { fontSize: 10, fontStyle: 'italic', marginTop: 2 },
  // Quick actions
  quickActionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    padding: 10, gap: 4,
  },
  actionIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  actionTitle: { fontSize: 12, fontWeight: '700' },
  actionSub: { fontSize: 10 },
});
