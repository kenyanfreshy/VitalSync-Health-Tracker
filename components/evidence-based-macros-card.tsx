/**
 * EvidenceBasedMacrosCard
 *
 * Premium 'Evidence-Based Macros' card for vegan athletes.
 *
 * Features:
 * - Horizontal Segmented Progress Bar (Protein | Fats | Carbs) — animated fill on mount
 * - Gold Zone overlay — semi-transparent amber glow with repeating opacity pulse
 *   marking the 1.6–2.2 g/kg vegan athlete protein target (Morton et al. 2018)
 * - Gold Zone tap-to-explain inline tooltip with evidence citation
 * - 7-day sparkline + weekly average inside each macro legend item
 * - Tappable legend items → MacroFoodBreakdownSheet (with Share button)
 * - Micro-labels for Fiber density and Saturated Fat density
 * - 24-hour meal timing heatmap (dot-plot, color-coded by meal type)
 * - Weekly Gold Zone streak row (7-day dot indicator)
 * - Custom macro goals via macroGoals prop (from useMacroGoals)
 * - Dark glassmorphism background with emerald + violet accents
 * - Section header: "NUTRITIONAL ALIGNMENT"
 * - "Log a Meal →" deep-link button when no data
 */

import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react';

import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

import { useColorScheme, useColors, useFoodCameraStrings } from '@/hooks';
import { logEvent } from '@/lib/analytics';
import type { DailyNutrients } from '@/lib/health/daily-nutrients';
import type { SodiumRecord } from '@/lib/health/types';
import type { MacroGoals } from '@/hooks/use-macro-goals';
import { SparklineChart } from '@/components/dashboard/sparkline-chart';
import { MacroFoodBreakdownSheet } from '@/components/macro-food-breakdown-sheet';
import { MacroGoalsSheet } from '@/components/macro-goals-sheet';
import { WeeklyMacroTrendSheet } from '@/components/weekly-macro-trend-sheet';
import { AiFoodCameraSheet } from '@/components/ai-food-camera-sheet';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';

// ─── Evidence-based vegan athlete targets (Morton et al. 2018; ISSN 2017) ───
const VEGAN_TARGETS = {
  proteinMinGPerKg: 1.6,
  proteinMaxGPerKg: 2.2,
  fatMinPct:   0.20,
  fatMaxPct:   0.35,
  carbsMinPct: 0.45,
  carbsMaxPct: 0.65,
  fiberOptimalG: 38,
  satFatMaxPct: 0.10,
};

// ─── Accent palette ─────────────────────────────────────────────────────────
const EMERALD   = '#10B981';
const VIOLET    = '#8B5CF6';
const AMBER     = '#F59E0B';
const GOLD_ZONE = '#F59E0B26';
const GOLD_GLOW = '#F59E0B40';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function proteinGPerKgStatus(proteinG: number, weightKg: number | null): string {
  if (!weightKg) return 'unknown';
  const gPerKg = proteinG / weightKg;
  if (gPerKg >= VEGAN_TARGETS.proteinMinGPerKg && gPerKg <= VEGAN_TARGETS.proteinMaxGPerKg) return 'optimal';
  if (gPerKg >= VEGAN_TARGETS.proteinMinGPerKg * 0.85) return 'near';
  if (gPerKg < VEGAN_TARGETS.proteinMinGPerKg) return 'below';
  return 'above';
}

function alignmentStatus(pct: number, min: number, max: number): string {
  if (pct >= min && pct <= max) return 'optimal';
  if (pct < min) return 'below';
  return 'above';
}

const STATUS_COLOR: Record<string, string> = {
  optimal: EMERALD,
  near:    AMBER,
  below:   '#3B82F6',
  above:   '#EF4444',
  unknown: '#6B7280',
};

const STATUS_LABEL: Record<string, string> = {
  optimal: 'Optimal',
  near:    'Near Target',
  below:   'Below Target',
  above:   'Above Target',
  unknown: '—',
};

// ─── Props ───────────────────────────────────────────────────────────────────
const EXPANDED_KEY = 'nutritional-alignment-expanded';

export interface EvidenceBasedMacrosCardProps {
  nutrients: DailyNutrients | null;
  weightKg: number | null;
  isLoading?: boolean;
  sodiumRecords?: SodiumRecord[];
  macroGoals?: MacroGoals | null;
  /** Last 7 days of DailyNutrients (index 0 = oldest, 6 = today) */
  weeklyNutrients?: (DailyNutrients | null)[];
  /** When provided, overrides the local expanded state (used by global Collapse All). */
  overrideExpanded?: boolean;
}

// ─── Main component ──────────────────────────────────────────────────────────
export function EvidenceBasedMacrosCard({
  nutrients: macros,
  weightKg,
  isLoading = false,
  sodiumRecords = [],
  macroGoals,
  weeklyNutrients = [],
  overrideExpanded,
}: EvidenceBasedMacrosCardProps) {
  const colors  = useColors();
  const scheme  = useColorScheme() ?? 'light';
  const isDark  = scheme === 'dark';
  const fc = useFoodCameraStrings();
  const [cameraSheetVisible, setCameraSheetVisible] = React.useState(false);
  const { requirePremium: requireScanMealPremium, PremiumGateSheet: ScanMealGateSheet } = usePremiumGate();

  // ── Collapsible state (with AsyncStorage persistence) ───────────────────
  const [localExpanded, setLocalExpanded] = useState(true);
  // Resolve: overrideExpanded takes precedence when set by global toggle
  const isExpanded = overrideExpanded === false ? false : localExpanded;

  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.getItem(EXPANDED_KEY).then(v => {
      if (v !== null) setLocalExpanded(v === 'true');
    }).catch(() => {});
  }, []);

  const toggleExpanded = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setLocalExpanded(v => {
      const next = !v;
      safeSetItem(EXPANDED_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── Sheet state ─────────────────────────────────────────────────────────
  const [sheetMacro, setSheetMacro] = useState<'protein' | 'fat' | 'carbs' | null>(null);
  const openSheet = useCallback((macro: 'protein' | 'fat' | 'carbs') => {
    setSheetMacro(macro);
  }, []);
  const [goalsSheetVisible, setGoalsSheetVisible] = useState(false);
  const [trendMacro, setTrendMacro] = useState<'protein' | 'fat' | 'carbs' | null>(null);

  // ── Gold Zone tooltip state ──────────────────────────────────────────────
  const [goldZoneExpanded, setGoldZoneExpanded] = useState(false);

  // ── Custom g/kg targets (fall back to VEGAN_TARGETS if not set) ──────────
  const effectiveMinGPerKg = macroGoals?.proteinMinGPerKg ?? VEGAN_TARGETS.proteinMinGPerKg;
  const effectiveMaxGPerKg = macroGoals?.proteinMaxGPerKg ?? VEGAN_TARGETS.proteinMaxGPerKg;

  // ── Derived status ───────────────────────────────────────────────────────
  const proteinStatus = macros ? proteinGPerKgStatus(macros.protein_g, weightKg) : 'unknown';
  const _fatKcal      = macros ? macros.fats_g * 9 : 0;
  const _totalKcalFat = macros ? macros.calculated_calories_kcal : 1;
  const fatStatus     = macros ? alignmentStatus(_fatKcal / _totalKcalFat, VEGAN_TARGETS.fatMinPct, VEGAN_TARGETS.fatMaxPct) : 'unknown';
  const _carbKcal     = macros ? macros.carbohydrates_g * 4 : 0;
  const carbStatus    = macros ? alignmentStatus(_carbKcal / _totalKcalFat, VEGAN_TARGETS.carbsMinPct, VEGAN_TARGETS.carbsMaxPct) : 'unknown';

  // ── Gold Zone fractions ──────────────────────────────────────────────────
  const goldStart = macros && weightKg && macros.calculated_calories_kcal > 0
    ? clamp((effectiveMinGPerKg * weightKg * 4) / macros.calculated_calories_kcal, 0, 1)
    : 0.18;
  const goldEnd = macros && weightKg && macros.calculated_calories_kcal > 0
    ? clamp((effectiveMaxGPerKg * weightKg * 4) / macros.calculated_calories_kcal, 0, 1)
      : 0.28;

  // ── Fiber & sat fat micro-labels ───────────────────────────────────────────────
  const fiberDensity = macros && macros.calculated_calories_kcal > 0
    ? `${((macros.fiber_g / macros.calculated_calories_kcal) * 1000).toFixed(1)} g/1000 kcal`
    : '—';
  const fiberStatus = macros ? (macros.fiber_g >= VEGAN_TARGETS.fiberOptimalG ? 'optimal' : 'low') : 'unknown';

  // ── Phosphorus micro-label (NKF renal limit ≤800–1000 mg/day) ──────────────────
  const PHOSPHORUS_RENAL_LIMIT = 800; // mg/day — NKF conservative threshold
  const phosphorusMg = macros?.phosphorus_mg ?? 0;
  const phosphorusValue = phosphorusMg > 0 ? `${Math.round(phosphorusMg)} mg` : '—';
  const phosphorusStatus = phosphorusMg === 0
    ? 'unknown'
    : phosphorusMg <= PHOSPHORUS_RENAL_LIMIT
      ? 'optimal'
      : phosphorusMg <= PHOSPHORUS_RENAL_LIMIT * 1.25
        ? 'near'
        : 'above';
  const ROSE = '#F43F5E';
  const phosphorusColor = phosphorusStatus === 'optimal' ? EMERALD
    : phosphorusStatus === 'near' ? AMBER
    : phosphorusStatus === 'above' ? ROSE
    : '#6B7280';

  // ── Glassmorphism card background ────────────────────────────────────────
  const cardBg     = isDark ? 'rgba(16,18,24,0.82)' : 'rgba(255,255,255,0.72)';
  const cardBorder = isDark ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.18)';

  const [barWidth, setBarWidth] = useState(0);

  // ── Animated bar fill ────────────────────────────────────────────────────
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [barAnim]);

  // ── Gold Zone pulse animation ────────────────────────────────────────────
  const goldPulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goldPulse, { toValue: 1.0, duration: 1000, useNativeDriver: true }),
        Animated.timing(goldPulse, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [goldPulse]);

  // ── 7-day sparkline data ─────────────────────────────────────────────────
  const proteinSparkline = useMemo(
    () => weeklyNutrients.map(n => n?.protein_g ?? 0),
    [weeklyNutrients],
  );
  const fatSparkline = useMemo(
    () => weeklyNutrients.map(n => n?.fats_g ?? 0),
    [weeklyNutrients],
  );
  const carbsSparkline = useMemo(
    () => weeklyNutrients.map(n => n?.carbohydrates_g ?? 0),
    [weeklyNutrients],
  );

  // ── 7-day weekly averages ────────────────────────────────────────────────
  const weeklyAvgProtein = useMemo(() => {
    const vals = proteinSparkline.filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [proteinSparkline]);
  const weeklyAvgFat = useMemo(() => {
    const vals = fatSparkline.filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [fatSparkline]);
  const weeklyAvgCarbs = useMemo(() => {
    const vals = carbsSparkline.filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [carbsSparkline]);

  // ── Segment widths ───────────────────────────────────────────────────────
  const totalKcal  = macros?.calculated_calories_kcal ?? 0;
  const proteinPct  = totalKcal > 0 ? (macros!.protein_g * 4) / totalKcal : 0;
  const fatPct      = totalKcal > 0 ? (macros!.fats_g * 9) / totalKcal : 0;
  const carbsPct    = totalKcal > 0 ? (macros!.carbohydrates_g * 4) / totalKcal : 0;

  const proteinW = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth * proteinPct] });
  const fatW     = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth * fatPct] });
  const carbsW   = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth * carbsPct] });

  const goldStartPx = barWidth * goldStart;
  const goldWidthPx = barWidth * (goldEnd - goldStart);

  return (
    <>
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            shadowColor: VIOLET,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.35 : 0.12,
            shadowRadius: 16,
            elevation: 6,
          },
        ]}
      >
        {/* ── Section header — tappable to collapse/expand ───────────────── */}
        <Pressable
          style={({ pressed }) => [styles.headerRow, { opacity: pressed ? 0.75 : 1 }]}
          onPress={toggleExpanded}
        >
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>
            NUTRITIONAL ALIGNMENT
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.badge, { backgroundColor: VIOLET + '20', borderColor: VIOLET + '50' }]}>
              <Text style={[styles.badgeText, { color: VIOLET }]}>Vegan Athlete</Text>
            </View>
            {/* Gear icon — opens MacroGoalsSheet */}
            <Pressable
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 2 })}
              onPress={e => { e.stopPropagation?.(); setGoalsSheetVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel="Edit macro goals"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 14, color: colors.muted }}>⚙️</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '600' }}>
              {isExpanded ? '▲' : '▼'}
            </Text>
          </View>
        </Pressable>

        {/* ── Compact summary pill row (shown when collapsed) ──────────────── */}
        {!isExpanded && macros && (
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: EMERALD + '20', borderColor: EMERALD + '40' }]}>
              <Text style={[styles.pillText, { color: EMERALD }]}>
                P {macros.protein_g.toFixed(0)}g
              </Text>
            </View>
            <Text style={[styles.pillDot, { color: colors.muted }]}>·</Text>
            <View style={[styles.pill, { backgroundColor: VIOLET + '20', borderColor: VIOLET + '40' }]}>
              <Text style={[styles.pillText, { color: VIOLET }]}>
                F {macros.fats_g.toFixed(0)}g
              </Text>
            </View>
            <Text style={[styles.pillDot, { color: colors.muted }]}>·</Text>
            <View style={[styles.pill, { backgroundColor: AMBER + '20', borderColor: AMBER + '40' }]}>
              <Text style={[styles.pillText, { color: AMBER }]}>
                C {macros.carbohydrates_g.toFixed(0)}g
              </Text>
            </View>
            <Text style={[styles.pillDot, { color: colors.muted }]}>·</Text>
            <Text style={[styles.pillKcal, { color: colors.muted }]}>
              {macros.calculated_calories_kcal.toFixed(0)} kcal
            </Text>
          </View>
        )}

        {/* ── Collapsible body ─────────────────────────────────────────────── */}
        {isExpanded && (<>

        {/* ── Horizontal segmented bar ────────────────────────────────────── */}
        <View
          style={[styles.barTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
          onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        >
          {/* Protein segment */}
          <Animated.View style={[styles.barSegment, { width: proteinW, backgroundColor: EMERALD }]} />
          {/* Fat segment */}
          <Animated.View style={[styles.barSegment, { width: fatW, backgroundColor: VIOLET }]} />
          {/* Carbs segment */}
          <Animated.View style={[styles.barSegment, { width: carbsW, backgroundColor: AMBER }]} />

          {/* Gold Zone overlay */}
          {barWidth > 0 && (
            <Animated.View
              style={[
                styles.goldZone,
                {
                  left: goldStartPx,
                  width: goldWidthPx,
                  backgroundColor: GOLD_ZONE,
                  borderColor: GOLD_GLOW,
                  opacity: goldPulse,
                },
              ]}
            />
          )}
        </View>

        {/* ── Gold Zone label row (tappable) ──────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [styles.goldZoneLabelRow, pressed && { opacity: 0.7 }]}
          onPress={() => setGoldZoneExpanded(v => !v)}
          accessibilityRole="button"
          accessibilityLabel="Gold Zone explanation"
        >
          <View style={[styles.goldDot, { backgroundColor: AMBER }]} />
          <Text style={[styles.goldZoneLabel, { color: AMBER }]}>
            Gold Zone: {effectiveMinGPerKg}–{effectiveMaxGPerKg} g/kg protein
          </Text>
          <Text style={[styles.goldZoneChevron, { color: AMBER }]}>
            {goldZoneExpanded ? '▲' : '▼'}
          </Text>
        </Pressable>

        {/* ── Gold Zone tooltip ───────────────────────────────────────────── */}
        {goldZoneExpanded && (
          <View style={[styles.goldZoneTooltip, { backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)', borderColor: AMBER + '30' }]}>
            <Text style={[styles.goldZoneTooltipTitle, { color: AMBER }]}>
              Evidence-Based Protein Target
            </Text>
            <Text style={[styles.goldZoneTooltipBody, { color: colors.muted }]}>
              For vegan athletes, 1.6–2.2 g/kg/day optimizes muscle protein synthesis while accounting for lower digestibility of plant proteins (DIAAS ~0.7–0.9 vs. animal ~1.0).{'\n\n'}
              Distributing intake across 4–5 meals (≥0.4 g/kg each) maximizes leucine-triggered MPS.
            </Text>
            <Text style={[styles.goldZoneTooltipCite, { color: colors.muted }]}>
              Morton et al. (2018) Br J Sports Med · ISSN Position Stand (2017) · van Vliet et al. (2015)
            </Text>
          </View>
        )}

        {/* ── Macro legend ────────────────────────────────────────────────── */}
        <View style={styles.legendRow}>
          <MacroLegendItem
            color={EMERALD}
            label={fc.protein}
            value={macros ? `${macros.protein_g.toFixed(0)}g` : '—'}
            pct={macros && macros.calculated_calories_kcal > 0 ? (macros.protein_g * 4) / macros.calculated_calories_kcal : null}
            status={proteinStatus}
            subLabel={macros && weightKg ? `${(macros.protein_g / weightKg).toFixed(1)} g/kg` : undefined}
            sparklineData={proteinSparkline}
            weeklyAvg={weeklyAvgProtein}
            isDark={isDark}
            onPress={() => openSheet('protein')}
            onSparklinePress={() => setTrendMacro('protein')}
          />
          <MacroLegendItem
            color={VIOLET}
            label="Fats"
            value={macros ? `${macros.fats_g.toFixed(0)}g` : '—'}
            pct={macros && macros.calculated_calories_kcal > 0 ? (macros.fats_g * 9) / macros.calculated_calories_kcal : null}
            status={fatStatus}
            sparklineData={fatSparkline}
            weeklyAvg={weeklyAvgFat}
            isDark={isDark}
            onPress={() => openSheet('fat')}
            onSparklinePress={() => setTrendMacro('fat')}
          />
          <MacroLegendItem
            color={AMBER}
            label={fc.carbs}
            value={macros ? `${macros.carbohydrates_g.toFixed(0)}g` : '—'}
            pct={macros && macros.calculated_calories_kcal > 0 ? (macros.carbohydrates_g * 4) / macros.calculated_calories_kcal : null}
            status={carbStatus}
            sparklineData={carbsSparkline}
            weeklyAvg={weeklyAvgCarbs}
            isDark={isDark}
            onPress={() => openSheet('carbs')}
            onSparklinePress={() => setTrendMacro('carbs')}
          />
        </View>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }]} />

        {/* ── Micro-labels ────────────────────────────────────────────────── */}
        <View style={styles.microRow}>
          <MicroLabel
            label="Fiber Density"
            value={fiberDensity}
            color={fiberStatus === 'optimal' ? EMERALD : AMBER}
            note={macros ? `${macros.fiber_g.toFixed(0)}g total` : undefined}
          />
          <MicroLabel
            label="Saturated Fat"
            value="< 10% target"
            color={VIOLET}
          />
          <MicroLabel
            label="Phosphorus"
            value={phosphorusValue}
            color={phosphorusColor}
            note={phosphorusMg > 0 ? `NKF limit ≤800 mg` : undefined}
          />
        </View>

        {/* ── No-data / loading ───────────────────────────────────────────── */}
        {!macros && !isLoading && (
          <View style={styles.noDataRow}>
            <Text style={[styles.noDataText, { color: colors.muted }]}>
              Log a meal to see your macro alignment
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.logMealBtn,
                {
                  backgroundColor: isDark ? EMERALD + '20' : EMERALD + '15',
                  borderColor: isDark ? EMERALD + '50' : EMERALD + '40',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={requireScanMealPremium(() => setCameraSheetVisible(true), { feature: fc.scanMealTitle ?? 'Scan Meal' })}
              accessibilityRole="button"
            >
              <Text style={[styles.logMealBtnText, { color: EMERALD }]}>+ Log a Meal →</Text>
            </Pressable>
          </View>
        )}
        {isLoading && (
          <Text style={[styles.noDataText, { color: colors.muted }]}>
            Loading nutrition data…
          </Text>
        )}

        {/* ── 24-hour meal timing heatmap ─────────────────────────────────── */}
        {sodiumRecords.length > 0 && (
          <MealTimingHeatmap sodiumRecords={sodiumRecords} isDark={isDark} />
        )}

        {/* ── Weekly Gold Zone streak row ─────────────────────────────────── */}
        <WeeklyGoldZoneStreak
          sodiumRecords={sodiumRecords}
          weightKg={weightKg}
          minGPerKg={effectiveMinGPerKg}
          maxGPerKg={effectiveMaxGPerKg}
          isDark={isDark}
        />

        {/* ── Evidence footnote ───────────────────────────────────────────── */}
        <Text style={[styles.footnote, { color: colors.muted }]}>
          Targets: Morton et al. 2018 · ISSN Position Stand 2017 · AMDR
        </Text>

        </>)}
      </View>

      {/* ── Food Breakdown Sheet ────────────────────────────────────────── */}
      <MacroFoodBreakdownSheet
        visible={sheetMacro !== null}
        macro={sheetMacro}
        sodiumRecords={sodiumRecords}
        onClose={() => setSheetMacro(null)}
      />

      {/* ── Macro Goals Sheet ───────────────────────────────────────────── */}
      <MacroGoalsSheet
        visible={goalsSheetVisible}
        onClose={() => setGoalsSheetVisible(false)}
      />

      {/* ── Weekly Macro Trend Sheet ───────────────────────────────────────── */}
      <WeeklyMacroTrendSheet
        visible={trendMacro !== null}
        macro={trendMacro}
        weeklyNutrients={weeklyNutrients}
        macroGoals={macroGoals}
        onClose={() => setTrendMacro(null)}
      />

      {/* ── Smart Food Camera Sheet ──────────────────────────────────────────────────────────────── */}
      <AiFoodCameraSheet
        visible={cameraSheetVisible}
        onClose={() => setCameraSheetVisible(false)}
        onScanMealPress={requireScanMealPremium(() => {}, { feature: fc.scanMealTitle ?? 'Scan Meal' })}
        onBarcodeScanPress={requireScanMealPremium(() => {
          logEvent('barcode_scan_gate_tap', { source: 'evidence_macros_card' });
        }, { feature: fc.scanBarcodeTitle ?? 'Scan Barcode' })}
      />
      {ScanMealGateSheet}
    </>
  );
}

// ─── MacroLegendItem ─────────────────────────────────────────────────────────
interface MacroLegendItemProps {
  color: string;
  label: string;
  value: string;
  pct: number | null;
  status: string;
  subLabel?: string;
  sparklineData: number[];
  weeklyAvg: number | null;
  isDark: boolean;
  onPress: () => void;
  onSparklinePress?: () => void;
}

function MacroLegendItem({
  color, label, value, pct, status, subLabel, sparklineData, weeklyAvg, isDark, onPress, onSparklinePress,
}: MacroLegendItemProps) {
  const statusColor = STATUS_COLOR[status] ?? '#6B7280';
  const statusLabel = STATUS_LABEL[status] ?? '';
  const hasSparkline = sparklineData.some(v => v > 0);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.legendItem,
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} breakdown`}
    >
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>{label}</Text>
      <Text style={[styles.legendValue, { color: isDark ? '#F9FAFB' : '#111827' }]}>{value}</Text>
      {pct !== null && (
        <Text style={[styles.legendPct, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
          {(pct * 100).toFixed(0)}%
        </Text>
      )}
      {subLabel && (
        <Text style={[styles.legendSub, { color }]}>{subLabel}</Text>
      )}
      {/* 7-day sparkline — tap to open 7-day trend sheet */}
      {hasSparkline ? (
        <Pressable
          onPress={onSparklinePress ?? onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`View 7-day ${label} trend`}
        >
          <SparklineChart
            data={sparklineData}
            width={64}
            height={24}
            strokeColor={color + '60'}
            accentColor={color}
            strokeWidth={1.5}
          />
        </Pressable>
      ) : (
        <View style={{ width: 64, height: 24 }} />
      )}
      {/* 7-day average row */}
      {weeklyAvg !== null ? (
        <Text style={[styles.weeklyAvgText, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
          Avg {weeklyAvg.toFixed(0)}g/day
        </Text>
      ) : (
        <View style={{ height: 13 }} />
      )}
      <View style={[styles.statusPill, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
        <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </Pressable>
  );
}

// ─── MicroLabel ──────────────────────────────────────────────────────────────
interface MicroLabelProps {
  label: string;
  value: string;
  color: string;
  note?: string;
}

function MicroLabel({ label, value, color, note }: MicroLabelProps) {
  return (
    <View style={styles.microLabel}>
      <Text style={[styles.microLabelTitle, { color: color + 'CC' }]}>{label}</Text>
      <Text style={[styles.microLabelValue, { color }]}>{value}</Text>
      {note && <Text style={[styles.microLabelNote, { color: color + '80' }]}>{note}</Text>}
    </View>
  );
}

// ─── MealTimingHeatmap ───────────────────────────────────────────────────────
const MEAL_COLORS: Record<string, string> = {
  breakfast: '#F59E0B',
  lunch:     '#10B981',
  dinner:    '#8B5CF6',
  snack:     '#3B82F6',
  other:     '#6B7280',
};

interface MealTimingHeatmapProps {
  sodiumRecords: SodiumRecord[];
  isDark: boolean;
}

function MealTimingHeatmap({ sodiumRecords, isDark }: MealTimingHeatmapProps) {
  const today = new Date().toDateString();

  const slots = useMemo<(string | null)[]>(() => {
    const arr: (string | null)[] = Array(24).fill(null);
    sodiumRecords.forEach((r) => {
      if (!r.timestamp) return;
      const d = new Date(r.timestamp);
      if (d.toDateString() !== today) return;
      const hour = d.getHours();
      const ctx = (r.mealContext ?? 'other').toLowerCase();
      arr[hour] = ctx;
    });
    return arr;
  }, [sodiumRecords, today]);

  const hasMeals = slots.some(Boolean);
  if (!hasMeals) return null;

  const dotBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

  return (
    <View style={heatmapStyles.container}>
      <Text style={[heatmapStyles.label, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
        MEAL TIMING TODAY
      </Text>
      <View style={heatmapStyles.grid}>
        {slots.map((ctx, hour) => (
          <View
            key={hour}
            style={[
              heatmapStyles.dot,
              { backgroundColor: ctx ? (MEAL_COLORS[ctx] ?? MEAL_COLORS.other) : dotBg },
            ]}
          />
        ))}
      </View>
      <View style={heatmapStyles.axisRow}>
        {['12a', '6a', '12p', '6p', '12a'].map((lbl, i) => (
          <Text key={i} style={[heatmapStyles.axisLabel, { color: isDark ? '#4B5563' : '#9CA3AF' }]}>
            {lbl}
          </Text>
        ))}
      </View>
      <View style={heatmapStyles.legendRow}>
        {Object.entries(MEAL_COLORS).filter(([k]) => k !== 'other').map(([ctx, color]) => (
          <View key={ctx} style={heatmapStyles.legendItem}>
            <View style={[heatmapStyles.legendDot, { backgroundColor: color }]} />
            <Text style={[heatmapStyles.legendLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
              {ctx.charAt(0).toUpperCase() + ctx.slice(1)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const heatmapStyles = StyleSheet.create({
  container: { marginTop: 12 },
  label:     { fontSize: 9, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6 },
  grid:      { flexDirection: 'row', flexWrap: 'nowrap', gap: 2 },
  dot:       { flex: 1, height: 8, borderRadius: 2 },
  axisRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { fontSize: 8 },
  legendRow: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel:{ fontSize: 9 },
});

// ─── WeeklyGoldZoneStreak ────────────────────────────────────────────────────
interface WeeklyGoldZoneStreakProps {
  sodiumRecords: SodiumRecord[];
  weightKg: number | null;
  minGPerKg: number;
  maxGPerKg: number;
  isDark: boolean;
}

function WeeklyGoldZoneStreak({
  sodiumRecords,
  weightKg,
  minGPerKg,
  maxGPerKg,
  isDark,
}: WeeklyGoldZoneStreakProps) {
  const result = useMemo(() => {
    if (!weightKg) return null;
    const minG = minGPerKg * weightKg;
    const maxG = maxGPerKg * weightKg;
    const today = new Date();
    const days: boolean[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toDateString();
      const dayRecords = sodiumRecords.filter((r) => {
        if (!r.timestamp) return false;
        return new Date(r.timestamp).toDateString() === dateStr;
      });
      const totalProtein = dayRecords.reduce((sum, r) => sum + (r.proteinG ?? 0), 0);
      days.push(totalProtein >= minG && totalProtein <= maxG);
    }
    const count = days.filter(Boolean).length;
    return { count, days };
  }, [sodiumRecords, weightKg, minGPerKg, maxGPerKg]);

  if (!result) return null;

  const { count, days } = result;
  const pct = count / 7;
  const streakColor = pct >= 0.7 ? '#10B981' : pct >= 0.4 ? '#F59E0B' : '#EF4444';

  return (
    <View style={streakStyles.container}>
      <View style={streakStyles.row}>
        <Text style={[streakStyles.label, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
          WEEKLY GOLD ZONE
        </Text>
        <Text style={[streakStyles.count, { color: streakColor }]}>
          {count}/7 days
        </Text>
      </View>
      <View style={streakStyles.dots}>
        {days.map((hit, i) => (
          <View
            key={i}
            style={[
              streakStyles.dot,
              {
                backgroundColor: hit
                  ? streakColor
                  : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const streakStyles = StyleSheet.create({
  container: { marginTop: 10, marginBottom: 2 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  label:     { fontSize: 9, fontWeight: '600', letterSpacing: 0.8 },
  count:     { fontSize: 11, fontWeight: '700' },
  dots:      { flexDirection: 'row', gap: 4 },
  dot:       { width: 10, height: 10, borderRadius: 5 },
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pillDot: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 16,
  },
  pillKcal: {
    fontSize: 11,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 6,
    position: 'relative',
  },
  barSegment: {
    height: '100%',
  },
  goldZone: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 4,
    borderWidth: 1,
  },
  goldZoneLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  goldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  goldZoneLabel: {
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  goldZoneChevron: {
    fontSize: 8,
    fontWeight: '700',
  },
  goldZoneTooltip: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  goldZoneTooltipTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  goldZoneTooltipBody: {
    fontSize: 11,
    lineHeight: 16,
  },
  goldZoneTooltipCite: {
    fontSize: 9,
    letterSpacing: 0.2,
    fontStyle: 'italic',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 4,
  },
  legendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  legendValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  legendPct: {
    fontSize: 10,
  },
  legendSub: {
    fontSize: 9,
    fontWeight: '600',
  },
  weeklyAvgText: {
    fontSize: 9,
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 3,
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  microRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  microLabel: {
    flex: 1,
    gap: 1,
  },
  microLabelTitle: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  microLabelValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  microLabelNote: {
    fontSize: 9,
  },
  noDataRow: {
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  noDataText: {
    fontSize: 12,
    textAlign: 'center',
  },
  logMealBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  logMealBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 9,
    letterSpacing: 0.2,
    textAlign: 'right',
    marginTop: 2,
  },
});
