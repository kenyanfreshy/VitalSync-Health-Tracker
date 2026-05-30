/**
 * EBP Clinical Nutrition Cards
 *
 * Evidence-Based Practice cards for:
 *   1. Carbohydrate Quality Index  — 10:1 carb-to-fiber ratio (Lancet Public Health / WHO 2024)
 *   2. Protein Bio-Availability    — g/kg body weight (2025-2030 Dietary Guidelines for Americans)
 *
 * Data source: diet log records (SodiumRecord[] from useHealth), aggregated for today.
 * Animation style: NeoVital — spring-driven animated arc rings, glowing fill bars,
 *   pulsing status badges, and smooth mount fade-in.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFoodCameraStrings, useDashboardStrings } from '@/hooks';
import { safeSetItem } from '@/lib/safe-async-storage';
import { GlassCard } from '@/components/glass-card';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Animated,
  Easing as RNEasing,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const AnimatedView = Reanimated.createAnimatedComponent(View);

// ─── Color tokens ─────────────────────────────────────────────────────
const CARB_COLOR    = '#F59E0B'; // amber  — carbohydrates
const FIBER_COLOR   = '#EAB308'; // yellow — fiber
const PROTEIN_COLOR = '#22C55E'; // green  — protein
const PROTEIN_WARN  = '#EF4444'; // muted red — severely low protein
const OPTIMAL_GLOW  = 'rgba(34,197,94,0.25)';
const WARN_GLOW     = 'rgba(245,158,11,0.25)';
const SEVERE_GLOW   = 'rgba(239,68,68,0.20)';

// ─── Animated accent divider ─────────────────────────────────────────────────
function AccentDivider({ color }: { color: string }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }), [opacity]);
  return (
    <AnimatedView
      style={[{ height: 0.5, backgroundColor: color }, style]}
    />
  );
}

// ─── Animated Arc Ring ────────────────────────────────────────────────────────
const RING_SIZE = 88;
const STROKE    = 7;
const RADIUS    = (RING_SIZE - STROKE) / 2;
const CIRCUM    = 2 * Math.PI * RADIUS;

interface ArcRingProps {
  progress: number;   // 0–1
  color: string;
  glowColor: string;
  label: string;
  valueText: string;
  subText: string;
  isDark: boolean;
  delay?: number;
  /** When true, the SVG track ring pulses amber to signal a warning state */
  warnPulse?: boolean;
}

function ArcRing({ progress, color, glowColor, label, valueText, subText, isDark, delay = 0, warnPulse = false }: ArcRingProps) {
  const animProg    = useSharedValue(0);
  const scale       = useSharedValue(0.7);
  const opacity     = useSharedValue(0);
  // Pulsing track opacity for warning state (driven by Reanimated)
  const trackOpacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value  = withDelay(delay, withTiming(1, { duration: 350 }));
    scale.value    = withDelay(delay, withSpring(1, { damping: 14, stiffness: 120 }));
    animProg.value = withDelay(delay, withTiming(Math.min(progress, 1), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  useEffect(() => {
    if (warnPulse) {
      trackOpacity.value = withRepeat(
        withSequence(
          withTiming(0.72, { duration: 680, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.18, { duration: 680, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      trackOpacity.value = withTiming(0.3, { duration: 300 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warnPulse]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }), [opacity, scale]);

  // Animated track overlay opacity (for warn pulse)
  const trackOverlayStyle = useAnimatedStyle(() => ({
    opacity: trackOpacity.value,
  }), [trackOpacity]);

  // Derive strokeDashoffset from animProg inside a worklet-safe way
  // We use a JS-driven Animated.Value for the SVG stroke since SVG props
  // cannot be driven by Reanimated shared values directly on native.
  const svgProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(svgProgress, {
      toValue: Math.min(progress, 1),
      duration: 900 + delay,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: false,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const strokeDashoffset = svgProgress.interpolate({
    inputRange:  [0, 1],
    outputRange: [CIRCUM, 0],
  });

  return (
    <AnimatedView style={[styles.arcContainer, containerStyle]}>
      {/* Glow backdrop */}
      <View style={[styles.arcGlow, { backgroundColor: glowColor }]} />
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Defs>
          <RadialGradient id={`grd-${label}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* Track — static base */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          stroke={isDark ? '#1E293B' : '#E2E8F0'}
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Warn-pulse amber overlay on the track (opacity animated via wrapper) */}
        {warnPulse && (
          <AnimatedView style={[{ position: 'absolute', top: 0, left: 0 }, trackOverlayStyle]}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke={CARB_COLOR}
                strokeWidth={STROKE}
                fill="none"
              />
            </Svg>
          </AnimatedView>
        )}
        {/* Animated fill */}
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={CIRCUM}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      {/* Centre text */}
      <View style={styles.arcCenter}>
        <Text style={[styles.arcValue, { color: color }]}>{valueText}</Text>
        <Text style={[styles.arcSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>{subText}</Text>
      </View>
      <Text style={[styles.arcLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{label}</Text>
    </AnimatedView>
  );
}

// Animated SVG Circle (JS Animated API — safe for SVG props)
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Animated Glow Bar ────────────────────────────────────────────────────────
interface GlowBarProps {
  pct: number;        // 0–1
  color: string;
  label: string;
  valueLabel: string;
  targetLabel: string;
  isDark: boolean;
  delay?: number;
  showGoldZone?: boolean;
  goldZoneStart?: number; // 0–1
  goldZoneEnd?: number;   // 0–1
}

function GlowBar({ pct, color, label, valueLabel, targetLabel, isDark, delay = 0, showGoldZone, goldZoneStart = 0, goldZoneEnd = 1 }: GlowBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(Math.min(pct, 1), {
      duration: 800,
      easing: Easing.out(Easing.quad),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as any,
  }), [width]);

  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
        {/* Gold zone overlay */}
        {showGoldZone && (
          <View
            style={[
              styles.goldZone,
              {
                left: `${goldZoneStart * 100}%` as any,
                width: `${(goldZoneEnd - goldZoneStart) * 100}%` as any,
                backgroundColor: color + '28',
                borderColor: color + '60',
              },
            ]}
          />
        )}
        {/* Animated fill with glow shadow */}
        <AnimatedView
          style={[
            styles.barFill,
            fillStyle,
            {
              backgroundColor: color,
              shadowColor: color,
              shadowOpacity: 0.6,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            },
          ]}
        />
      </View>
      <View style={styles.barMeta}>
        <Text style={[styles.barValue, { color: color }]}>{valueLabel}</Text>
        <Text style={[styles.barTarget, { color: isDark ? '#475569' : '#94A3B8' }]}>{targetLabel}</Text>
      </View>
    </View>
  );
}

// ─── Pulsing Status Badge ─────────────────────────────────────────────────────
function PulsingBadge({ label, color, isDark }: { label: string; color: string; isDark: boolean }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,  { duration: 700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }), [pulse]);

  return (
    <AnimatedView
      style={[
        styles.badge,
        badgeStyle,
        { backgroundColor: color + '22', borderColor: color + '55' },
      ]}
    >
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color: color }]}>{label}</Text>
    </AnimatedView>
  );
}

// ─── Card Fade-in wrapper ─────────────────────────────────────────────────────
function FadeCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value    = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 140 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }), [opacity, translateY]);

  return <AnimatedView style={style}>{children}</AnimatedView>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export interface EBPNutritionData {
  /** Total carbohydrates (g) from today's diet log */
  carbsG: number;
  /** Total dietary fiber (g) from today's diet log */
  fiberG: number;
  /** Total protein (g) from today's diet log */
  proteinG: number;
  /** User's body weight in kg (from latest bodyComposition record) */
  weightKg: number | null;
}

interface EBPNutritionCardsProps {
  data: EBPNutritionData;
  isDark: boolean;
}

const EBP_CQI_KEY     = '@ebp_cqi_collapsed';
const EBP_PROTEIN_KEY = '@ebp_protein_collapsed';

export function EBPNutritionCards({ data, isDark }: EBPNutritionCardsProps) {
  const fc = useFoodCameraStrings();
  const ds = useDashboardStrings();
  const { carbsG, fiberG, proteinG, weightKg } = data;
  // Default to collapsed (evidence-based insights guideline)
  const [cqiCollapsed, setCqiCollapsedRaw] = useState(true);
  const [proteinCollapsed, setProteinCollapsedRaw] = useState(true);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.multiGet([EBP_CQI_KEY, EBP_PROTEIN_KEY]).then(pairs => {
      const cqiVal     = pairs[0][1];
      const proteinVal = pairs[1][1];
      // null means first launch — keep default (collapsed)
      if (cqiVal !== null)     setCqiCollapsedRaw(cqiVal === 'true');
      if (proteinVal !== null) setProteinCollapsedRaw(proteinVal === 'true');
    }).catch(() => {/* ignore storage errors */});
  }, []);

  const setCqiCollapsed = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setCqiCollapsedRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(EBP_CQI_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const setProteinCollapsed = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setProteinCollapsedRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(EBP_PROTEIN_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── EBP Calculations ────────────────────────────────────────────────────────
  // 1. Carb Quality Index: carb-to-fiber ratio. Target ≤ 10:1
  //    Ref: Lancet Public Health / WHO Systematic Review (2024)
  const hasNutrData = carbsG > 0 || fiberG > 0 || proteinG > 0;
  const safeFiber   = fiberG > 0 ? fiberG : 0.1; // avoid /0
  const carbFiberRatio = carbsG / safeFiber;
  const isOptimalCarb  = carbFiberRatio <= 10;
  // Progress: 0 = ratio 20+ (worst), 1 = ratio ≤10 (optimal)
  const carbQualityPct = Math.max(0, Math.min(1, 1 - (carbFiberRatio - 10) / 20));
  // For the bar: fiber progress toward 25g WHO daily goal
  const fiberPct = Math.min(fiberG / 25, 1);
  // Carb bar: progress toward 300g reference (upper bound for context)
  const carbPct  = Math.min(carbsG / 300, 1);

  // 2. Protein Bio-Availability: g/kg body weight. Target 1.2–1.6 g/kg
  //    Ref: 2025-2030 Dietary Guidelines for Americans
  const safeWeight    = weightKg ?? 75; // fallback 75 kg if no weight logged
  const proteinPerKg  = proteinG / safeWeight;
  const isOptimalProt = proteinPerKg >= 1.2;
  // Progress: 0 = 0 g/kg, 1 = 1.6 g/kg (upper optimal)
  const _proteinPct    = Math.min(proteinPerKg / 1.6, 1.2); // allow slight over to show excess

  const _cardBg     = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.96)';
  const _cardBorder = isDark ? 'rgba(30,41,59,0.8)'  : 'rgba(226,232,240,0.9)';
  const titleColor = isDark ? '#E2E8F0' : '#1E293B';
  const mutedColor = isDark ? '#64748B' : '#94A3B8';

  if (!hasNutrData) {
    return (
      <FadeCard delay={100}>
        <GlassCard accentColor="#94A3B8" noPadding style={[styles.card, { marginTop: 12 }]}>
          <View style={[styles.emptyRow, { padding: 16 }]}>
            <Text style={{ fontSize: 20 }}>🥗</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: titleColor }]}>{ds.nutritionBreakdown}</Text>
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                {ds.logMealToCqi ?? 'Log a meal to see your Carb Quality Index and Protein Bio-Availability scores.'}
              </Text>
            </View>
          </View>
        </GlassCard>
      </FadeCard>
    );
  }

  return (
    <>
      {/* ── Card 1: Carbohydrate Quality Index ─────────────────────────────── */}
      <FadeCard delay={80}>
        <GlassCard accentColor={CARB_COLOR} noPadding style={[styles.card, { marginTop: 12 }]}>
          {/* Header — tappable to collapse */}
          <TouchableOpacity
            onPress={() => setCqiCollapsed(v => !v)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={cqiCollapsed ? 'Expand Carbohydrate Quality Index' : 'Collapse Carbohydrate Quality Index'}
          >
            <View style={[styles.cardHeader, styles.cardPadH]}>
              <View style={styles.cardTitleRow}>
                <View style={[styles.iconBadge, { backgroundColor: CARB_COLOR + '22' }]}>
                  <Text style={{ fontSize: 14 }}>🌾</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: titleColor }]}>Carbohydrate Quality Index</Text>
                  <Text style={[styles.cardSubtitle, { color: mutedColor }]}>10:1 Carb-to-Fiber Ratio · WHO 2024</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PulsingBadge
                  label={isOptimalCarb ? 'Optimal' : 'Refined'}
                  color={isOptimalCarb ? '#22C55E' : '#F59E0B'}
                  isDark={isDark}
                />
                <Text style={{ fontSize: 16, color: mutedColor, marginLeft: 2 }}>
                  {cqiCollapsed ? '▸' : '▾'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Accent divider — fades in when expanded */}
          {!cqiCollapsed && <AccentDivider color={CARB_COLOR} />}

          {/* Arc ring + bars row — hidden when collapsed */}
          {!cqiCollapsed && (
            <>
              <View style={[styles.metricsRow, styles.cardPadH]}>
                <ArcRing
                  progress={carbQualityPct}
                  color={isOptimalCarb ? '#22C55E' : CARB_COLOR}
                  glowColor={isOptimalCarb ? OPTIMAL_GLOW : WARN_GLOW}
                  label="Quality"
                  valueText={`${carbFiberRatio.toFixed(1)}`}
                  subText=":1"
                  isDark={isDark}
                  delay={120}
                  warnPulse={!isOptimalCarb}
                />
                <View style={styles.barsColumn}>
                  <GlowBar
                    pct={carbPct}
                    color={CARB_COLOR}
                    label={fc.carbs}
                    valueLabel={`${Math.round(carbsG)}g`}
                    targetLabel="≤300g ref"
                    isDark={isDark}
                    delay={200}
                  />
                  <GlowBar
                    pct={fiberPct}
                    color={FIBER_COLOR}
                    label={fc.fiber}
                    valueLabel={`${fiberG.toFixed(1)}g`}
                    targetLabel="25g WHO"
                    isDark={isDark}
                    delay={300}
                    showGoldZone
                    goldZoneStart={0.6}
                    goldZoneEnd={1.0}
                  />
                </View>
              </View>

              {/* Target description */}
              <Text style={[styles.description, styles.cardPadH, { color: mutedColor }]}>
                Target: ≤ 10:1 ratio for metabolic health. Your ratio: {carbFiberRatio.toFixed(1)}:1
                {isOptimalCarb ? ' ✓ within optimal range.' : ' — increase fiber-rich foods.'}
              </Text>

              {/* Source link */}
              <TouchableOpacity
                onPress={() => Linking.openURL('https://pubmed.ncbi.nlm.nih.gov/37116487/')}
                activeOpacity={0.7}
                style={[styles.cardPadH, { paddingBottom: 4 }]}
              >
                <Text style={[styles.link, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                  Source: New Metrics of Carb Quality (Lancet 2024) →
                </Text>
              </TouchableOpacity>
            </>
          )}
        </GlassCard>
      </FadeCard>

      {/* ── Card 2: Protein Bio-Availability ────────────────────────────────── */}
      <FadeCard delay={200}>
        <GlassCard accentColor={PROTEIN_COLOR} noPadding style={[styles.card, { marginTop: 10 }]}>
          {/* Header — tappable to collapse */}
          <TouchableOpacity
            onPress={() => setProteinCollapsed(v => !v)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={proteinCollapsed ? 'Expand Protein Bio-Availability' : 'Collapse Protein Bio-Availability'}
          >
            <View style={[styles.cardHeader, styles.cardPadH]}>
              <View style={styles.cardTitleRow}>
                <View style={[styles.iconBadge, { backgroundColor: PROTEIN_COLOR + '22' }]}>
                  <Text style={{ fontSize: 14 }}>💪</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: titleColor }]}>Protein Bio-Availability</Text>
                  <Text style={[styles.cardSubtitle, { color: mutedColor }]}>g/kg body weight · DGA 2025-2030</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PulsingBadge
                  label={isOptimalProt ? 'Adequate' : 'Low'}
                  color={isOptimalProt ? '#22C55E' : '#94A3B8'}
                  isDark={isDark}
                />
                <Text style={{ fontSize: 16, color: mutedColor, marginLeft: 2 }}>
                  {proteinCollapsed ? '▸' : '▾'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Accent divider — fades in when expanded */}
          {!proteinCollapsed && <AccentDivider color={PROTEIN_COLOR} />}

          {/* Arc ring + bar row — hidden when collapsed */}
          {!proteinCollapsed && (
            <>
              <View style={[styles.metricsRow, styles.cardPadH]}>
                <ArcRing
                  progress={Math.min(proteinPerKg / 1.6, 1)}
                  color={proteinPerKg < 0.8 ? PROTEIN_WARN : isOptimalProt ? PROTEIN_COLOR : '#94A3B8'}
                  glowColor={proteinPerKg < 0.8 ? SEVERE_GLOW : isOptimalProt ? OPTIMAL_GLOW : 'rgba(148,163,184,0.15)'}
                  label="g/kg"
                  valueText={proteinPerKg.toFixed(2)}
                  subText="g/kg"
                  isDark={isDark}
                  delay={240}
                  warnPulse={proteinPerKg < 0.8}
                />
                <View style={styles.barsColumn}>
                  <GlowBar
                    pct={Math.min(proteinPerKg / 1.6, 1)}
                    color={PROTEIN_COLOR}
                    label={fc.protein}
                    valueLabel={`${Math.round(proteinG)}g`}
                    targetLabel={weightKg ? `${(weightKg * 1.2).toFixed(0)}–${(weightKg * 1.6).toFixed(0)}g` : '1.2–1.6 g/kg'}
                    isDark={isDark}
                    delay={320}
                    showGoldZone
                    goldZoneStart={1.2 / 1.6}
                    goldZoneEnd={1.0}
                  />
                  {weightKg == null && (
                    <Text style={[styles.weightNote, { color: mutedColor }]}>
                      Log your weight for personalised g/kg targets.
                    </Text>
                  )}
                </View>
              </View>

              {/* Target description */}
              <Text style={[styles.description, styles.cardPadH, { color: mutedColor }]}>
                Target: 1.2–1.6 g/kg for muscle protein synthesis.
                {weightKg
                  ? ` Your weight: ${weightKg.toFixed(1)} kg · intake: ${proteinPerKg.toFixed(2)} g/kg.`
                  : ' Log your weight to personalise this target.'}
              </Text>

              {/* Source link */}
              <TouchableOpacity
                onPress={() => Linking.openURL('https://www.acc.org/latest-in-cardiology/articles/2026/01/27/16/22/how-do-the-2025-2030-dietary-guidelines-for-americans-measure-up-for-cardiovascular-health')}
                activeOpacity={0.7}
                style={[styles.cardPadH, { paddingBottom: 4 }]}
              >
                <Text style={[styles.link, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                  Source: 2025-2030 Dietary Guidelines for Americans →
                </Text>
              </TouchableOpacity>
            </>
          )}
        </GlassCard>
      </FadeCard>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  /** Accent-coloured hairline divider — now handled by AccentDivider component */
  divider: {
    height: 0.5,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  cardInner: {
    padding: 16,
  },
  /** Applied to header, metrics row, description, link — matches NeoVitalMacroGraph padding */
  cardPadH: {
    paddingHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    lineHeight: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
    paddingBottom: 4,
  },
  arcContainer: {
    alignItems: 'center',
    width: RING_SIZE,
  },
  arcGlow: {
    position: 'absolute',
    width: RING_SIZE * 1.2,
    height: RING_SIZE * 1.2,
    borderRadius: RING_SIZE * 0.6,
    top: -RING_SIZE * 0.1,
    left: -RING_SIZE * 0.1,
  },
  arcCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 20,
  },
  arcSub: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: -1,
    lineHeight: 12,
  },
  arcLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  barsColumn: {
    flex: 1,
    gap: 10,
  },
  barRow: {
    gap: 4,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  goldZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: 4,
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  barMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  barValue: {
    fontSize: 10,
    fontWeight: '700',
  },
  barTarget: {
    fontSize: 10,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
    marginTop: 2,
  },
  link: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 10,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  weightNote: {
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
  },
});
