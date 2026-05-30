/**
 * NutritionCorrelateCard
 *
 * Displays the Nutrition Correlate panel in the Correlate tab.
 * Five time-window tabs (3d / 7d / 14d / 30d / 3mo), each showing:
 *   - Composite score bar (0–100) with tier colour
 *   - Five sub-dimension bars (fiber, protein consistency, processed-food proxy,
 *     pattern adherence, macro balance)
 *   - Average daily macro summary
 *   - Evidence-based interpretation text
 *
 * Data source: sodiumIntake records → aggregateDailyNutrients → scoreNutritionWindow
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { GlassCard } from '@/components/glass-card';
import { SectionLabel } from '@/components/dashboard/section-label';
import { useColors, useFoodCameraStrings } from '@/hooks';
import { aggregateDailyNutrients } from '@/lib/health/daily-nutrients';
import {
  scoreNutritionWindow,
  NUTRITION_WINDOWS,
  type NutritionWindow,
  type NutritionCorrelateResult,
} from '@/lib/health/nutrition-correlate';
import type { SodiumRecord } from '@/lib/health/types';

// ─── Colour constants (Nutrition Color System) ────────────────────────────────

const C = {
  fiber:    '#EAB308',  // yellow
  protein:  '#22C55E',  // green
  carbs:    '#F59E0B',  // orange
  fat:      '#3B82F6',  // blue
  calories: '#8B5CF6',  // purple
  accent:   '#06B6D4',  // cyan — matches the existing Correlate tab accent
};

const TIER_COLOR: Record<NutritionCorrelateResult['tier'], string> = {
  'strong':            '#22C55E',
  'moderate':          '#F59E0B',
  'developing':        '#EF4444',
  'insufficient-data': '#64748B',
};

const TIER_LABEL: Record<NutritionCorrelateResult['tier'], string> = {
  'strong':            'Strong',
  'moderate':          'Moderate',
  'developing':        'Developing',
  'insufficient-data': 'Insufficient Data',
};

// ─── Sub-dimension metadata ───────────────────────────────────────────────────

const SUB_META = [
  { key: 'fiber',              label: 'Fiber Density',        color: C.fiber,   icon: '🌾' },
  { key: 'proteinConsistency', label: 'Protein Consistency',  color: C.protein, icon: '🥩' },
  { key: 'processedFoodProxy', label: 'Whole-Food Quality',   color: '#10B981', icon: '🥦' },
  { key: 'patternAdherence',   label: 'Pattern Adherence',    color: C.accent,  icon: '📅' },
  { key: 'macroBalance',       label: 'Macro Balance',        color: C.carbs,   icon: '⚖️' },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({
  value,
  max = 100,
  color,
  height = 8,
  showGoldZone = false,
}: {
  value: number;
  max?: number;
  color: string;
  height?: number;
  showGoldZone?: boolean;
}) {
  const pct = Math.min(value / max, 1);
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      {/* Gold zone glow (70–100% = "strong") */}
      {showGoldZone && (
        <View
          style={[
            styles.goldZone,
            { left: '70%', width: '30%', height, borderRadius: height / 2 },
          ]}
        />
      )}
      <View
        style={[
          styles.barFill,
          { width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color },
        ]}
      />
    </View>
  );
}

function SubDimensionRow({
  label,
  icon,
  value,
  color,
}: {
  label: string;
  icon: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.subRow}>
      <Text style={styles.subIcon}>{icon}</Text>
      <View style={styles.subLabelWrap}>
        <Text style={styles.subLabel}>{label}</Text>
        <ScoreBar value={value} max={20} color={color} height={5} />
      </View>
      <Text style={[styles.subScore, { color }]}>{value}<Text style={styles.subMax}>/20</Text></Text>
    </View>
  );
}

function MacroStat({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={styles.macroStat}>
      <Text style={[styles.macroValue, { color }]}>{value > 0 ? value : '—'}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  sodiumRecords: SodiumRecord[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export function NutritionCorrelateCard({ sodiumRecords, collapsed = true, onToggle }: Props) {
  const colors = useColors();
  const fc = useFoodCameraStrings();
  const [activeWindow, setActiveWindow] = useState<NutritionWindow>('7d');

  const allDays = useMemo(
    () => aggregateDailyNutrients(sodiumRecords),
    [sodiumRecords],
  );

  const result = useMemo(
    () => scoreNutritionWindow(allDays, activeWindow),
    [allDays, activeWindow],
  );

  const tierColor = TIER_COLOR[result.tier];
  const windowMeta = NUTRITION_WINDOWS.find(w => w.key === activeWindow)!;

  return (
    <GlassCard accentColor={C.accent} noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
      <SectionLabel
        title="NUTRITION CORRELATE"
        accentColor={C.accent}
        collapsed={collapsed}
        onToggle={onToggle}
      />

      {!collapsed && (
        <View style={styles.body}>
          {/* ── Intro blurb ── */}
          <Text style={[styles.intro, { color: colors.muted }]}>
            Measures how consistently your intake aligns with evidence-backed dietary quality patterns.
            Emphasises fiber density, whole-food quality, protein consistency, and sustainable adherence.
          </Text>

          {/* ── Window tabs ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {NUTRITION_WINDOWS.map((w) => {
              const isActive = w.key === activeWindow;
              return (
                <Pressable
                  key={w.key}
                  style={({ pressed }) => [
                    styles.tab,
                    isActive && { borderColor: C.accent, backgroundColor: C.accent + '18' },
                    !isActive && { borderColor: 'rgba(148,163,184,0.2)', backgroundColor: 'transparent' },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => setActiveWindow(w.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.tabLabel, { color: isActive ? C.accent : colors.muted }]}>
                    {w.label}
                  </Text>
                  <Text style={[styles.tabSub, { color: isActive ? C.accent + 'CC' : colors.muted + '80' }]}>
                    {w.purposeShort}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── Composite score ── */}
          <View style={styles.scoreSection}>
            <View style={styles.scoreHeader}>
              <View>
                <Text style={[styles.scoreNumber, { color: tierColor }]}>{result.score}</Text>
                <Text style={[styles.scoreDenom, { color: colors.muted }]}>/100</Text>
              </View>
              <View style={styles.scoreMeta}>
                <View style={[styles.tierBadge, { backgroundColor: tierColor + '22', borderColor: tierColor + '44' }]}>
                  <Text style={[styles.tierLabel, { color: tierColor }]}>{TIER_LABEL[result.tier]}</Text>
                </View>
                <Text style={[styles.loggedDays, { color: colors.muted }]}>
                  {result.loggedDays}/{result.windowDays} days logged
                </Text>
              </View>
            </View>
            <ScoreBar value={result.score} max={100} color={tierColor} height={10} showGoldZone />
            <Text style={[styles.purposeText, { color: colors.muted }]}>{windowMeta.purposeLong}</Text>
          </View>

          {/* ── Sub-dimension bars ── */}
          {result.tier !== 'insufficient-data' && (
            <View style={styles.subSection}>
              <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>Score Breakdown</Text>
              {SUB_META.map((s) => (
                <SubDimensionRow
                  key={s.key}
                  label={s.label}
                  icon={s.icon}
                  value={result.subScores[s.key]}
                  color={s.color}
                />
              ))}
            </View>
          )}

          {/* ── Average macro summary ── */}
          {result.tier !== 'insufficient-data' && result.averages.calories > 0 && (
            <View style={[styles.macroSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>
                Avg Daily Intake ({windowMeta.label})
              </Text>
              <View style={styles.macroGrid}>
                <MacroStat label={fc.calories} value={result.averages.calories} unit="kcal" color={C.calories} />
                <MacroStat label={fc.protein}  value={result.averages.protein_g} unit="g" color={C.protein} />
                <MacroStat label={fc.fiber}    value={result.averages.fiber_g}   unit="g" color={C.fiber} />
                <MacroStat label={fc.carbs}    value={result.averages.carbs_g}   unit="g" color={C.carbs} />
                <MacroStat label={fc.fat}      value={result.averages.fat_g}     unit="g" color={C.fat} />
              </View>
            </View>
          )}

          {/* ── Interpretation ── */}
          <View style={[styles.interpretSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.interpretText, { color: colors.muted }]}>
              {result.interpretation}
            </Text>
            {result.topStrength && (
              <View style={[styles.signalRow, { backgroundColor: '#22C55E18' }]}>
                <Text style={styles.signalIcon}>✅</Text>
                <Text style={[styles.signalText, { color: '#22C55E' }]}>{result.topStrength}</Text>
              </View>
            )}
            {result.topOpportunity && (
              <View style={[styles.signalRow, { backgroundColor: '#F59E0B18' }]}>
                <Text style={styles.signalIcon}>💡</Text>
                <Text style={[styles.signalText, { color: '#F59E0B' }]}>{result.topOpportunity}</Text>
              </View>
            )}
          </View>

          {/* ── Evidence disclaimer ── */}
          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            Scoring reflects peer-reviewed meta-analytic evidence on dietary quality patterns.
            Not a substitute for clinical dietary assessment.
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  intro: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  // Window tabs
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    minWidth: 72,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabSub: {
    fontSize: 10,
    marginTop: 2,
  },
  // Composite score
  scoreSection: {
    gap: 8,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 52,
    letterSpacing: -1,
  },
  scoreDenom: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  scoreMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loggedDays: {
    fontSize: 11,
  },
  purposeText: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Score bar
  barTrack: {
    width: '100%',
    backgroundColor: 'rgba(148,163,184,0.15)',
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  goldZone: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderWidth: 0,
  },
  // Sub-dimensions
  subSection: {
    gap: 10,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  subLabelWrap: {
    flex: 1,
    gap: 4,
  },
  subLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  subScore: {
    fontSize: 14,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  subMax: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '400',
  },
  // Macro grid
  macroSection: {
    borderTopWidth: 0.5,
    paddingTop: 12,
    gap: 10,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  macroStat: {
    alignItems: 'center',
    minWidth: 56,
    flex: 1,
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  macroUnit: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  macroLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },
  // Interpretation
  interpretSection: {
    borderTopWidth: 0.5,
    paddingTop: 12,
    gap: 8,
  },
  interpretText: {
    fontSize: 12,
    lineHeight: 18,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  signalIcon: {
    fontSize: 13,
  },
  signalText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  // Disclaimer
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    opacity: 0.6,
  },
});
