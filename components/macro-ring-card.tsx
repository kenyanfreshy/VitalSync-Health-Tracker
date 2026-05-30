/**
 * MacroRingCard
 *
 * Collapsible card (same pattern as WeeklyMacroTrendCard / CalorieBurnCard).
 * Header always visible: 🍽️ icon, title, meal count, and kcal goal badge.
 * Tap to expand/collapse the four macro rings, breakdown bar, and disclaimer.
 *
 * Displays today's Calories, Carbs, Fat, and Protein as four arc-progress
 * rings with daily totals vs. recommended targets. Data is derived from
 * SodiumRecord entries that have caloric/macro fields populated (via Smart scan
 * or voice entry).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors, useFoodCameraStrings } from '@/hooks';
import { useMacroGoals } from '@/hooks/use-macro-goals';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { SodiumRecord } from '@/lib/health/types';

// ─── Ring config ──────────────────────────────────────────────────────────────

const RING_SIZE = 72;
const STROKE_WIDTH = 7;

interface RingProps {
  value: number;
  target: number;
  color: string;
  trackColor: string;
  size?: number;
}

function ArcRing({ value, target, color, trackColor, size = RING_SIZE }: RingProps) {
  const r = (size - STROKE_WIDTH) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / target, 1);
  const filled = circ * pct;
  const gap = circ - filled;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={STROKE_WIDTH} fill="none" />
      {value > 0 && (
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={STROKE_WIDTH} fill="none"
          strokeDasharray={`${filled} ${gap}`} strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

// ─── MacroCell ────────────────────────────────────────────────────────────────

interface MacroCellProps {
  label: string;
  emoji: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
}

function MacroCell({ label, emoji, value, target, unit, color, trackColor, textColor, mutedColor }: MacroCellProps) {
  const pct = Math.min(Math.round((value / target) * 100), 100);
  const displayValue = unit === 'kcal' ? Math.round(value).toLocaleString() : Math.round(value);
  const displayTarget = unit === 'kcal' ? target.toLocaleString() : target;

  return (
    <View style={s.cell}>
      <View style={s.ringWrap}>
        <ArcRing value={value} target={target} color={color} trackColor={trackColor} />
        <View style={s.ringCenter}>
          <Text style={[s.ringPct, { color }]}>{pct}%</Text>
        </View>
      </View>
      <Text style={s.cellEmoji}>{emoji}</Text>
      <Text style={[s.cellValue, { color: textColor }]}>{displayValue}</Text>
      <Text style={[s.cellUnit, { color: mutedColor }]}>{unit}</Text>
      <Text style={[s.cellLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[s.cellTarget, { color: mutedColor }]}>of {displayTarget}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface MacroRingCardProps {
  records: SodiumRecord[];
  defaultExpanded?: boolean;
  /** External override from Dashboard Collapse All / Expand All toggle. */
  overrideExpanded?: boolean;
}

export function MacroRingCard({
  records,
  defaultExpanded = false,
  overrideExpanded,
}: MacroRingCardProps) {
  const colors = useColors();
  const fc = useFoodCameraStrings();
  const isDark = useColorScheme() === 'dark';
  const { goals: TARGETS } = useMacroGoals();
  const [expanded, setExpanded] = useCardExpanded('macro-ring', defaultExpanded, overrideExpanded);

  // Compute today's macro totals from sodium records
  const todayMacros = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    const todayRecs = records.filter(r => new Date(r.timestamp) >= cutoff);

    return todayRecs.reduce(
      (acc, r) => ({
        calories: acc.calories + (r.calories ?? 0),
        carbs: acc.carbs + (r.carbsG ?? 0),
        fat: acc.fat + (r.fatG ?? 0),
        protein: acc.protein + (r.proteinG ?? 0),
        hasData: acc.hasData || r.calories != null || r.carbsG != null || r.fatG != null || r.proteinG != null,
        mealCount: acc.mealCount + (r.calories != null || r.carbsG != null ? 1 : 0),
      }),
      { calories: 0, carbs: 0, fat: 0, protein: 0, hasData: false, mealCount: 0 }
    );
  }, [records]);

  // Don't render if no macro data exists at all
  if (!todayMacros.hasData) return null;

  const trackColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FAFAFA';

  const CAL_COLOR = '#F97316';
  const CARB_COLOR = '#3B82F6';
  const FAT_COLOR = '#A855F7';
  const PROT_COLOR = '#10B981';

  const _calPct = Math.min(Math.round((todayMacros.calories / TARGETS.calories) * 100), 100);

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

  return (
    <View style={[s.card, { backgroundColor: cardBg, borderColor: dividerColor }]}>
      {/* ── Header (always visible) ── */}
      <Pressable
        style={s.header}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`Today\u2019s Macros: ${Math.round(todayMacros.calories).toLocaleString()} of ${TARGETS.calories.toLocaleString()} kcal`}
        accessibilityHint={expanded ? 'Tap to collapse macro details' : 'Tap to expand macro details'}
      >
        <Text style={s.headerEmoji}>🍽️</Text>
        <View style={s.headerText}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Today&apos;s Macros</Text>
          <Text style={[s.headerSub, { color: colors.muted }]}>
            {todayMacros.mealCount > 0
              ? `${todayMacros.mealCount} meal${todayMacros.mealCount === 1 ? '' : 's'} logged`
              : 'No meals logged today'}
          </Text>
        </View>

        {/* Calorie progress chip */}
        <View style={[s.chip, { backgroundColor: CAL_COLOR + '18', borderColor: CAL_COLOR + '40' }]}>
          <Text style={[s.chipNum, { color: CAL_COLOR }]}>
            {Math.round(todayMacros.calories).toLocaleString()}
          </Text>
          <Text style={[s.chipUnit, { color: colors.muted }]}>/ {TARGETS.calories.toLocaleString()} kcal</Text>
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
        <View style={[s.body, { borderTopColor: dividerColor }]}>
          {/* Four macro rings */}
          <View style={s.grid}>
            <MacroCell
              label={fc.calories} emoji="🔥"
              value={todayMacros.calories} target={TARGETS.calories} unit="kcal"
              color={CAL_COLOR} trackColor={trackColor}
              textColor={colors.foreground} mutedColor={colors.muted}
            />
            <MacroCell
              label={fc.carbs} emoji="🌾"
              value={todayMacros.carbs} target={TARGETS.carbs} unit="g"
              color={CARB_COLOR} trackColor={trackColor}
              textColor={colors.foreground} mutedColor={colors.muted}
            />
            <MacroCell
              label={fc.fat} emoji="🥑"
              value={todayMacros.fat} target={TARGETS.fat} unit="g"
              color={FAT_COLOR} trackColor={trackColor}
              textColor={colors.foreground} mutedColor={colors.muted}
            />
            <MacroCell
              label={fc.protein} emoji="🥩"
              value={todayMacros.protein} target={TARGETS.protein} unit="g"
              color={PROT_COLOR} trackColor={trackColor}
              textColor={colors.foreground} mutedColor={colors.muted}
            />
          </View>

          {/* Caloric breakdown bar */}
          {todayMacros.calories > 0 && (
            <View style={s.breakdownWrap}>
              <View style={[s.breakdownTrack, { backgroundColor: trackColor }]}>
                {todayMacros.carbs > 0 && (
                  <View style={[s.breakdownSegment, { flex: todayMacros.carbs * 4, backgroundColor: CARB_COLOR }]} />
                )}
                {todayMacros.fat > 0 && (
                  <View style={[s.breakdownSegment, { flex: todayMacros.fat * 9, backgroundColor: FAT_COLOR }]} />
                )}
                {todayMacros.protein > 0 && (
                  <View style={[s.breakdownSegment, {
                    flex: todayMacros.protein * 4, backgroundColor: PROT_COLOR,
                    borderTopRightRadius: 4, borderBottomRightRadius: 4,
                  }]} />
                )}
              </View>
              <View style={s.breakdownLegend}>
                <Text style={[s.legendItem, { color: CARB_COLOR }]}>
                  🌾 {Math.round((todayMacros.carbs * 4 / Math.max(todayMacros.calories, 1)) * 100)}% carbs
                </Text>
                <Text style={[s.legendItem, { color: FAT_COLOR }]}>
                  🥑 {Math.round((todayMacros.fat * 9 / Math.max(todayMacros.calories, 1)) * 100)}% fat
                </Text>
                <Text style={[s.legendItem, { color: PROT_COLOR }]}>
                  🥩 {Math.round((todayMacros.protein * 4 / Math.max(todayMacros.calories, 1)) * 100)}% protein
                </Text>
              </View>
            </View>
          )}

          <Text style={[s.disclaimer, { color: colors.muted }]}>
            Targets based on 2,000 kcal/day reference values · estimates only · not medical advice
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 18, borderWidth: 1, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  headerEmoji: { fontSize: 22 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  headerSub: { fontSize: 11, marginTop: 1 },
  chip: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  chipNum: { fontSize: 13, fontWeight: '800' },
  chipUnit: { fontSize: 9 },
  body: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: 8, paddingTop: 14, paddingBottom: 8,
  },
  cell: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  ringWrap: {
    position: 'relative', width: RING_SIZE, height: RING_SIZE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 12, fontWeight: '800', letterSpacing: -0.3 },
  cellEmoji: { fontSize: 14 },
  cellValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  cellUnit: { fontSize: 10, fontWeight: '500' },
  cellLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  cellTarget: { fontSize: 9, fontWeight: '400' },
  breakdownWrap: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  breakdownTrack: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
  breakdownSegment: { height: 8 },
  breakdownLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  legendItem: { fontSize: 10, fontWeight: '600' },
  disclaimer: { fontSize: 10, textAlign: 'center', paddingBottom: 12, paddingHorizontal: 16, lineHeight: 15 },
});
