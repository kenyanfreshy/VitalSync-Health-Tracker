/**
 * NutritionChart — NeonVitals-style dark glassmorphism macros chart.
 *
 * Visual DNA matches NeonVitals:
 *  - #050F19 deep navy canvas with #1E3A4A dashed grid
 *  - Neon glow metric lines with 0.18-opacity gradient fills
 *  - Pill-shaped toggle chips (#0A1520 bg, neon border on active)
 *  - rgba(5,15,25,0.96) tooltip with cyan shadow glow
 *  - Particle layer background
 *  - GlowPulse animated dot on latest data point
 *
 * Metrics: Calories · Carbs · Protein · Fat · Blood Sugar · Fiber
 * Windows: Today (hourly) · 7d · 14d · 30d
 *
 * Features:
 *  - Nutritional Alignment Score (0–100) with circular ring
 *  - Fiber goal progress ring (25g WHO goal, shown when Fiber chip active)
 *  - Horizontal macro ratio bar (Carbs/Protein/Fat) with Gold Zone glow overlay
 *  - "Best day" emerald annotation marker
 *  - Interactive metric legend toggle row
 *  - Animated line draw-on (strokeDashoffset) when window changes
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View, Animated as RNAnimated, Easing as RNEasing } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
 Easing } from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { aggregateDailyNutrients } from '@/lib/health/daily-nutrients';
import { nutritionColors, nutritionColorsGlow, bloodSugarColor, bloodSugarColorGlow } from '@/constants/nutrition-colors';
import { useCelebrationSounds } from '@/hooks/use-celebration-sounds';
import { trpc } from '@/lib/trpc';

// ─── NeonVitals color tokens ──────────────────────────────────────────────────
const CANVAS_BG      = '#050F19';
const GRID_COLOR     = '#1E3A4A';
const CHIP_BG        = '#0A1520';
const TEXT_DIM       = '#475569';
const TEXT_BRIGHT    = '#E2E8F0';
const BORDER_DIM     = '#1E3A4A';
const TOOLTIP_BG     = 'rgba(5,15,25,0.96)';
const TOOLTIP_BORDER = '#1E3A5A';
const EMERALD        = '#00FF9D';
const CYAN           = '#00F5FF';
const GOLD           = '#FFD700';

// ─── Metric definitions (NeonVitals neon palette) ────────────────────────────
interface MetricDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  glowColor: string;
}

const METRICS: MetricDef[] = [
  { key: 'calories',   label: 'CALORIES',    unit: 'kcal',  color: nutritionColors.calories,   glowColor: nutritionColorsGlow.calories   },
  { key: 'carbs',      label: 'CARBS',       unit: 'g',     color: nutritionColors.carbs,      glowColor: nutritionColorsGlow.carbs      },
  { key: 'protein',    label: 'PROTEIN',     unit: 'g',     color: nutritionColors.protein,    glowColor: nutritionColorsGlow.protein    },
  { key: 'fat',        label: 'FAT',         unit: 'g',     color: nutritionColors.fat,        glowColor: nutritionColorsGlow.fat        },
  { key: 'bloodSugar', label: 'BLOOD SUGAR', unit: 'mg/dL', color: bloodSugarColor, glowColor: bloodSugarColorGlow },
  { key: 'fiber',      label: 'FIBRE',       unit: 'g',     color: nutritionColors.fiber,      glowColor: nutritionColorsGlow.fiber      },
];

const WINDOWS = [
  { label: 'TODAY', days: 0 },
  { label: '7D',    days: 7 },
  { label: '14D',   days: 14 },
  { label: '30D',   days: 30 },
];

// AMDR targets (used for ratio bar Gold Zone)
const MACRO_TARGETS = {
  carbs:   { min: 0.45, max: 0.65 },
  protein: { min: 0.15, max: 0.25 },
  fat:     { min: 0.20, max: 0.35 },
};

const FIBRE_GOAL_G = 25; // WHO daily fiber goal

// ─── Chart layout ─────────────────────────────────────────────────────────────
const PAD_L  = 36;
const PAD_R  = 12;
const PAD_T  = 22;
const PAD_B  = 22;
const CHART_H = 190;

// ─── Particle layer ───────────────────────────────────────────────────────────
const PARTICLE_COUNT = 22;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  xRatio: (Math.sin(i * 137.5) * 0.5 + 0.5),
  y: (Math.cos(i * 97.3) * 0.5 + 0.5) * CHART_H,
  r: 1 + (i % 3) * 0.7,
  opacity: 0.06 + (i % 5) * 0.03,
  color: ['#00F5FF', '#FF2D78', '#7B61FF', '#00FF9D', '#FFB800'][i % 5],
}));

function ParticleLayer({ width }: { width: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={CHART_H}>
        {PARTICLES.map((p) => (
          <Circle key={p.id} cx={p.xRatio * width} cy={p.y} r={p.r * 2} fill={p.color} opacity={p.opacity} />
        ))}
      </Svg>
    </View>
  );
}

// ─── Dashed grid ──────────────────────────────────────────────────────────────
function GridBackground({ plotW, plotH }: { plotW: number; plotH: number }) {
  const cols = 7;
  const rows = 4;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i <= cols; i++) {
    const x = PAD_L + (i / cols) * plotW;
    lines.push(<Line key={`v${i}`} x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke={GRID_COLOR} strokeWidth={0.5} strokeDasharray="3,4" />);
  }
  for (let j = 0; j <= rows; j++) {
    const y = PAD_T + (j / rows) * plotH;
    lines.push(<Line key={`h${j}`} x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={GRID_COLOR} strokeWidth={0.5} strokeDasharray="3,4" />);
  }
  return <>{lines}</>;
}

// ─── GlowPulse ────────────────────────────────────────────────────────────────
function GlowPulse({ color, cx, cy }: { color: string; cx: number; cy: number }) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    scale.value = 1;
    opacity.value = 0.8;
    scale.value = withRepeat(
      withSequence(
        withTiming(2.4, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 600 }),
      ), -1, false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 900 }),
        withTiming(0.8, { duration: 100 }),
      ), -1, false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }), [scale, opacity]);

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        left: cx - 5, top: cy - 5,
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: color,
      }, animStyle]}
      pointerEvents="none"
    />
  );
}

// ─── Animated metric line (draw-on via JS-thread Animated.Value) ─────────────
// NOTE: Using RN Animated (JS thread) instead of Reanimated animatedProps on SVG
// to avoid crashes on native new architecture (Reanimated v4 + SVG animatedProps).

interface AnimatedLineProps {
  d: string;
  color: string;
  pathLength: number;
  drawKey: number;
  delay?: number;
}

function AnimatedMetricLine({ d, color, pathLength, drawKey, delay = 0 }: AnimatedLineProps) {
  const offsetAnim = useRef(new RNAnimated.Value(pathLength)).current;
  const [dashOffset, setDashOffset] = useState(pathLength);

  useEffect(() => {
    offsetAnim.setValue(pathLength);
    setDashOffset(pathLength);
    const listenerId = offsetAnim.addListener(({ value }) => setDashOffset(value));
    const timer = setTimeout(() => {
      RNAnimated.timing(offsetAnim, {
        toValue: 0,
        duration: 600,
        easing: RNEasing.out(RNEasing.cubic),
        useNativeDriver: false,
      }).start();
    }, delay);
    return () => {
      clearTimeout(timer);
      offsetAnim.removeListener(listenerId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, pathLength]);

  return (
    <Path
      d={d}
      stroke={color}
      strokeWidth={1.5}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${pathLength} ${pathLength}`}
      strokeDashoffset={dashOffset}
    />
  );
}

// ─── Path builder (cubic bezier) ─────────────────────────────────────────────
function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

// Approximate path length from points (sum of segment lengths)
function approxPathLength(pts: { x: number; y: number }[]): number {
  if (pts.length < 2) return 100;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.ceil(len) + 10;
}

// ─── Alignment score helpers ──────────────────────────────────────────────────
interface NutritionPoint {
  label: string;
  ts: number;
  calories: number | null;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  bloodSugar: number | null;
  fiber: number | null;
}

function computeDayAlignmentScore(pt: NutritionPoint): number | null {
  const kcal = pt.calories;
  if (!kcal || kcal < 50) return null;
  const carbKcal    = (pt.carbs    ?? 0) * 4;
  const proteinKcal = (pt.protein  ?? 0) * 4;
  const fatKcal     = (pt.fat      ?? 0) * 9;
  const total = carbKcal + proteinKcal + fatKcal || kcal;

  function macroScore(actual: number, min: number, max: number): number {
    const ratio = actual / total;
    if (ratio >= min && ratio <= max) return 33.3;
    const midpoint = (min + max) / 2;
    const range = (max - min) / 2;
    const dist = Math.abs(ratio - midpoint);
    return Math.max(0, 33.3 * (1 - dist / (range * 2)));
  }

  return Math.round(
    macroScore(carbKcal,    MACRO_TARGETS.carbs.min,   MACRO_TARGETS.carbs.max) +
    macroScore(proteinKcal, MACRO_TARGETS.protein.min, MACRO_TARGETS.protein.max) +
    macroScore(fatKcal,     MACRO_TARGETS.fat.min,     MACRO_TARGETS.fat.max),
  );
}

function computeWindowAlignmentScore(points: NutritionPoint[]): number | null {
  const scores = points.map(computeDayAlignmentScore).filter((s): s is number => s !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function scoreColor(score: number): string {
  if (score >= 80) return EMERALD;
  if (score >= 60) return '#FFB800';
  if (score >= 40) return CYAN;
  return '#FF2D78';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'EXCELLENT';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'FAIR';
  return 'POOR';
}

// ─── Macro ratio bar component ────────────────────────────────────────────────
interface MacroRatioBarProps {
  points: NutritionPoint[];
  barWidth: number;
}

function MacroRatioBar({ points, barWidth }: MacroRatioBarProps) {
  // Average macro ratios across window (only days with calorie data)
  const ratios = useMemo(() => {
    const valid = points.filter(p => p.calories && p.calories >= 50);
    if (!valid.length) return null;
    let totalCarbKcal = 0, totalProtKcal = 0, totalFatKcal = 0;
    for (const p of valid) {
      totalCarbKcal    += (p.carbs   ?? 0) * 4;
      totalProtKcal    += (p.protein ?? 0) * 4;
      totalFatKcal     += (p.fat     ?? 0) * 9;
    }
    const total = totalCarbKcal + totalProtKcal + totalFatKcal;
    if (!total) return null;
    return {
      carbs:   totalCarbKcal / total,
      protein: totalProtKcal / total,
      fat:     totalFatKcal  / total,
    };
  }, [points]);

  if (!ratios || barWidth < 10) return null;

  const BAR_H = 12;
  const BAR_R = 6;
  const w = barWidth;

  // Segment widths in px
  const carbW = ratios.carbs   * w;
  const protW = ratios.protein * w;
  const fatW  = ratios.fat     * w;

  // Gold Zone overlay: carbs 45–65%, protein 15–25%, fat 20–35%
  // Show as a semi-transparent gold band across the "ideal" region
  // The bar is: [carbs][protein][fat] left-to-right
  // Gold zone starts at carbs.min and ends at carbs.max
  const goldStart = MACRO_TARGETS.carbs.min * w;
  const goldEnd   = MACRO_TARGETS.carbs.max * w;

  // Segment labels
  const segments = [
    { label: 'C', pct: Math.round(ratios.carbs   * 100), color: nutritionColors.carbs,   w: carbW },
    { label: 'P', pct: Math.round(ratios.protein * 100), color: nutritionColors.protein, w: protW },
    { label: 'F', pct: Math.round(ratios.fat     * 100), color: nutritionColors.fat,     w: fatW  },
  ];

  return (
    <View style={macroBarStyles.wrapper}>
      <View style={macroBarStyles.headerRow}>
        <Text style={macroBarStyles.title}>MACRO RATIO</Text>
        <View style={macroBarStyles.goldZoneBadge}>
          <View style={macroBarStyles.goldDot} />
          <Text style={macroBarStyles.goldZoneText}>GOLD ZONE</Text>
        </View>
      </View>

      {/* Segmented bar */}
      <View style={[macroBarStyles.barTrack, { width: w, height: BAR_H, borderRadius: BAR_R }]}>
        {/* Segments */}
        <View style={{ flexDirection: 'row', width: w, height: BAR_H, borderRadius: BAR_R, overflow: 'hidden' }}>
          {segments.map((seg, i) => (
            <View
              key={seg.label}
              style={{
                width: seg.w,
                height: BAR_H,
                backgroundColor: seg.color + (i === 0 ? 'CC' : i === 1 ? 'BB' : 'AA'),
              }}
            />
          ))}
        </View>

        {/* Gold Zone glow overlay (carbs optimal band) */}
        <View
          style={[
            macroBarStyles.goldZoneOverlay,
            {
              left: goldStart,
              width: goldEnd - goldStart,
              height: BAR_H,
              borderRadius: 3,
            },
          ]}
        />

        {/* Tick marks at AMDR boundaries */}
        {[
          MACRO_TARGETS.carbs.min,
          MACRO_TARGETS.carbs.max,
          MACRO_TARGETS.carbs.max + MACRO_TARGETS.protein.min,
          MACRO_TARGETS.carbs.max + MACRO_TARGETS.protein.max,
        ].map((ratio, i) => (
          <View
            key={i}
            style={[macroBarStyles.tick, { left: ratio * w - 0.5, height: BAR_H + 4, top: -2 }]}
          />
        ))}
      </View>

      {/* Segment labels row */}
      <View style={[macroBarStyles.labelsRow, { width: w }]}>
        {segments.map((seg) => (
          <View key={seg.label} style={{ width: seg.w, alignItems: 'center' }}>
            <Text style={[macroBarStyles.segLabel, { color: seg.color }]}>
              {seg.pct}%
            </Text>
            <Text style={macroBarStyles.segKey}>{seg.label === 'C' ? 'CARBS' : seg.label === 'P' ? 'PROT' : 'FAT'}</Text>
          </View>
        ))}
      </View>

      {/* AMDR range reference */}
      <Text style={macroBarStyles.amdrRef}>
        AMDR: Carbs 45–65% · Protein 15–25% · Fat 20–35%
      </Text>
    </View>
  );
}

const macroBarStyles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
    marginBottom: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: GRID_COLOR,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 9,
    color: TEXT_DIM,
    fontWeight: '700',
    letterSpacing: 1,
  },
  goldZoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GOLD + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: GOLD + '50',
  },
  goldDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GOLD,
  },
  goldZoneText: {
    fontSize: 8,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  barTrack: {
    position: 'relative',
    backgroundColor: GRID_COLOR,
    overflow: 'visible',
  },
  goldZoneOverlay: {
    position: 'absolute',
    top: 0,
    backgroundColor: GOLD + '28',
    borderWidth: 1,
    borderColor: GOLD + '60',
    shadowColor: GOLD,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  tick: {
    position: 'absolute',
    width: 1,
    backgroundColor: GOLD + '80',
  },
  labelsRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  segLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  segKey: {
    fontSize: 7,
    color: TEXT_DIM,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  amdrRef: {
    fontSize: 8,
    color: TEXT_DIM,
    marginTop: 4,
    letterSpacing: 0.2,
  },
});

// ─── Calorie goal ring ───────────────────────────────────────────────────────
interface CalorieRingProps {
  points: NutritionPoint[];
  goalKcal?: number;
}

function CalorieRing({ points, goalKcal = 2000 }: CalorieRingProps) {
  const avgCal = useMemo(() => {
    const vals = points.map(p => p.calories).filter((v): v is number => v !== null && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [points]);

  if (avgCal === null) return null;

  const pct = Math.min(avgCal / goalKcal, 1);
  const circumference = 2 * Math.PI * 20;
  const color = pct >= 0.9 && pct <= 1.1 ? EMERALD : pct > 1.1 ? '#FF2D78' : '#7B61FF';

  return (
    <View style={fiberRingStyles.wrapper}>
      <Svg width={52} height={52}>
        <Circle cx={26} cy={26} r={20} fill="none" stroke={GRID_COLOR} strokeWidth={4} />
        <Circle
          cx={26} cy={26} r={20}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${pct * circumference} ${circumference}`}
          transform="rotate(-90 26 26)"
        />
      </Svg>
      <View style={fiberRingStyles.inner}>
        <Text style={[fiberRingStyles.value, { color }]}>{Math.round(avgCal / 100) * 100 >= 1000 ? `${(avgCal / 1000).toFixed(1)}k` : Math.round(avgCal).toString()}</Text>
      </View>
      <Text style={fiberRingStyles.label}>CAL</Text>
      <Text style={fiberRingStyles.goal}>/ {goalKcal >= 1000 ? `${goalKcal / 1000}k` : goalKcal} kcal</Text>
    </View>
  );
}

// ─── Macro trend sparklines ───────────────────────────────────────────────────
interface MacroSparklinesProps {
  sodiumRecords: any[];
}

function MacroSparklines({ sodiumRecords }: MacroSparklinesProps) {
  const sparkData = useMemo(() => {
    const allDays = aggregateDailyNutrients(sodiumRecords ?? []);
    const result: { carbs: number | null; protein: number | null; fat: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = allDays.find((x: any) => x.date === key);
      if (!day) { result.push({ carbs: null, protein: null, fat: null }); continue; }
      const carbKcal = (day.carbohydrates_g ?? 0) * 4;
      const protKcal = (day.protein_g ?? 0) * 4;
      const fatKcal  = (day.fats_g ?? 0) * 9;
      const total = carbKcal + protKcal + fatKcal;
      if (!total) { result.push({ carbs: null, protein: null, fat: null }); continue; }
      result.push({
        carbs:   carbKcal / total,
        protein: protKcal / total,
        fat:     fatKcal  / total,
      });
    }
    return result;
  }, [sodiumRecords]);

  const hasAny = sparkData.some(d => d.carbs !== null);
  if (!hasAny) return null;

  const SPARK_W = 56;
  const SPARK_H = 28;
  const BAR_W   = 6;
  const GAP     = 2;

  // Day labels: last 7 days Mon/Tue/Wed...
  const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return DAY_LABELS[d.getDay()];
  });

  const macros: { key: 'carbs' | 'protein' | 'fat'; color: string; label: string; target: { min: number; max: number } }[] = [
    { key: 'carbs',   color: '#00F5FF', label: 'CARBS',  target: MACRO_TARGETS.carbs },
    { key: 'protein', color: '#FFB800', label: 'PROT',   target: MACRO_TARGETS.protein },
    { key: 'fat',     color: '#FF2D78', label: 'FAT',    target: MACRO_TARGETS.fat },
  ];

  return (
    <View style={sparkStyles.wrapper}>
      <Text style={sparkStyles.title}>7-DAY MACRO TREND</Text>
      <View style={sparkStyles.row}>
        {macros.map(macro => {
          const vals = sparkData.map(d => d[macro.key]);
          const maxVal = Math.max(...vals.filter((v): v is number => v !== null), macro.target.max);
          return (
            <View key={macro.key} style={sparkStyles.sparkItem}>
              <Svg width={SPARK_W} height={SPARK_H}>
                {/* Target zone band */}
                <Rect
                  x={0} y={SPARK_H - (macro.target.max / maxVal) * SPARK_H}
                  width={SPARK_W} height={((macro.target.max - macro.target.min) / maxVal) * SPARK_H}
                  fill={GOLD + '18'}
                />
                {/* Bars */}
                {vals.map((v, i) => {
                  if (v === null) return null;
                  const barH = Math.max(2, (v / maxVal) * SPARK_H);
                  const inZone = v >= macro.target.min && v <= macro.target.max;
                  return (
                    <Rect
                      key={i}
                      x={i * (BAR_W + GAP)}
                      y={SPARK_H - barH}
                      width={BAR_W}
                      height={barH}
                      rx={2}
                      fill={inZone ? macro.color : macro.color + '55'}
                    />
                  );
                })}

                {/* Today marker */}
                <Rect x={6 * (BAR_W + GAP)} y={0} width={BAR_W} height={1} rx={0.5} fill="#FFFFFF30" />
              </Svg>
              {/* Day labels row */}
              <View style={{ flexDirection: 'row', gap: GAP }}>
                {dayLabels.map((lbl, i) => (
                  <Text
                    key={i}
                    style={[
                      sparkStyles.dayLabel,
                      { width: BAR_W, color: i === 6 ? macro.color : TEXT_DIM },
                    ]}
                  >
                    {lbl[0]}
                  </Text>
                ))}
              </View>
              <Text style={[sparkStyles.sparkLabel, { color: macro.color }]}>{macro.label}</Text>
            </View>
          );
        })}
        <View style={sparkStyles.legend}>
          <View style={sparkStyles.legendItem}>
            <View style={[sparkStyles.legendSwatch, { backgroundColor: GOLD + '40', borderColor: GOLD + '60', borderWidth: 0.5 }]} />
            <Text style={sparkStyles.legendText}>GOLD ZONE</Text>
          </View>
          <Text style={sparkStyles.legendSub}>Last 7 days</Text>
          <Text style={sparkStyles.legendSub}>Bright = in zone</Text>
        </View>
      </View>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: GRID_COLOR,
  },
  title: {
    fontSize: 9, color: TEXT_DIM, fontWeight: '700', letterSpacing: 1, marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
  },
  sparkItem: {
    alignItems: 'center', gap: 3,
  },
  sparkLabel: {
    fontSize: 8, fontWeight: '700', letterSpacing: 0.5,
  },
  dayLabel: {
    fontSize: 6, fontWeight: '600', textAlign: 'center', letterSpacing: 0,
  },
  legend: {
    flex: 1, justifyContent: 'center', gap: 3, paddingLeft: 4,
  },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  legendSwatch: {
    width: 10, height: 8, borderRadius: 2,
  },
  legendText: {
    fontSize: 8, color: GOLD, fontWeight: '600',
  },
  legendSub: {
    fontSize: 7, color: TEXT_DIM,
  },
});

// ─── Fiber goal ring ──────────────────────────────────────────────────────────
interface FiberRingProps {
  points: NutritionPoint[];
}

function FiberRing({ points }: FiberRingProps) {
  const avgFiber = useMemo(() => {
    const vals = points.map(p => p.fiber).filter((v): v is number => v !== null && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [points]);

  if (avgFiber === null) return null;

  const pct = Math.min(avgFiber / FIBRE_GOAL_G, 1);
  const circumference = 2 * Math.PI * 20; // r=20
  const color = pct >= 1 ? EMERALD : pct >= 0.7 ? '#FFB800' : CYAN;

  return (
    <View style={fiberRingStyles.wrapper}>
      <Svg width={52} height={52}>
        <Circle cx={26} cy={26} r={20} fill="none" stroke={GRID_COLOR} strokeWidth={4} />
        <Circle
          cx={26} cy={26} r={20}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${pct * circumference} ${circumference}`}
          transform="rotate(-90 26 26)"
        />
      </Svg>
      <View style={fiberRingStyles.inner}>
        <Text style={[fiberRingStyles.value, { color }]}>{Math.round(avgFiber)}</Text>
        <Text style={fiberRingStyles.unit}>g</Text>
      </View>
      <Text style={fiberRingStyles.label}>FIBRE</Text>
      <Text style={fiberRingStyles.goal}>/ {FIBRE_GOAL_G}g WHO</Text>
    </View>
  );
}

const fiberRingStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginLeft: 12,
  },
  inner: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 1,
  },
  value: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  unit: {
    fontSize: 8,
    color: TEXT_DIM,
    fontWeight: '600',
    lineHeight: 14,
    alignSelf: 'flex-end',
  },
  label: {
    fontSize: 7,
    color: TEXT_DIM,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  goal: {
    fontSize: 7,
    color: TEXT_DIM,
    letterSpacing: 0.2,
  },
});

// ─── Weekly Heatmap ─────────────────────────────────────────────────────────
interface HeatmapDot {
  score: number | null;
  dayLetter: string;
  isToday: boolean;
  dateKey: string;
  calories: number | null;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
}

function WeeklyHeatmap({ sodiumRecords, onLogMeal }: { sodiumRecords: any[]; onLogMeal?: (date: string) => void }) {
  const [activeDot, setActiveDot] = useState<number | null>(null);
  const [show30, setShow30] = useState(false);

  // Build N-day dots (7 or 30)
  const buildDots = useCallback((n: number): HeatmapDot[] => {
    const allDays = aggregateDailyNutrients(sodiumRecords ?? []);
    const DAY_LABELS = ['S','M','T','W','T','F','S'];
    return Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (n - 1 - i));
      const key = d.toISOString().slice(0, 10);
      const day = allDays.find((x: any) => x.date === key);
      const dayLetter = DAY_LABELS[d.getDay()];
      const isToday = i === n - 1;
      if (!day) return { score: null, dayLetter, isToday, dateKey: key, calories: null, carbs: null, protein: null, fat: null };
      const carbKcal = (day.carbohydrates_g ?? 0) * 4;
      const protKcal = (day.protein_g ?? 0) * 4;
      const fatKcal  = (day.fats_g ?? 0) * 9;
      const total = carbKcal + protKcal + fatKcal;
      const carbs   = day.carbohydrates_g || null;
      const protein = day.protein_g || null;
      const fat     = day.fats_g || null;
      const calories = day.total_calories_kcal || day.calculated_calories_kcal || null;
      if (!total) return { score: null, dayLetter, isToday, dateKey: key, calories, carbs, protein, fat };
      const pt: NutritionPoint = { label: key, ts: d.getTime(), calories, carbs, protein, fat, bloodSugar: null, fiber: null };
      const score = computeDayAlignmentScore(pt);
      return { score, dayLetter, isToday, dateKey: key, calories, carbs, protein, fat };
    });
  }, [sodiumRecords]);

  const dots = useMemo<HeatmapDot[]>(() => buildDots(show30 ? 30 : 7), [buildDots, show30]);

  const activeData = activeDot !== null ? dots[activeDot] : null;

  // Determine top macro for the active dot
  const topMacro = activeData ? (() => {
    const macros = [
      { name: 'Carbs', g: activeData.carbs ?? 0, color: '#00F5FF' },
      { name: 'Protein', g: activeData.protein ?? 0, color: '#FFB800' },
      { name: 'Fat', g: activeData.fat ?? 0, color: '#FF2D78' },
    ];
    return macros.reduce((a, b) => b.g > a.g ? b : a, macros[0]);
  })() : null;

  const renderDot = (d: HeatmapDot, i: number) => {
    const color = d.score === null
      ? '#1E3A4A'
      : d.score >= 80 ? '#10B981'
      : d.score >= 50 ? '#FFB800'
      : '#FF2D78';
    const isActive = activeDot === i;
    return (
      <TouchableOpacity
        key={i}
        onPress={() => {
          setActiveDot(activeDot === i ? null : i);
          if (Platform.OS !== 'web') {
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const Haptics = require('expo-haptics');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (_unused) {}
          }
        }}
        activeOpacity={0.7}
        style={show30 ? heatmapStyles.dotWrap30 : heatmapStyles.dotWrap}
      >
        <View style={[
          show30 ? heatmapStyles.dot30 : heatmapStyles.dot,
          { backgroundColor: color },
          d.isToday && heatmapStyles.dotToday,
          isActive && { transform: [{ scale: 1.3 }] },
        ]} />
        {!show30 && (
          <Text style={[heatmapStyles.dotLabel, d.isToday && { color: CYAN }, isActive && { color: color }]}>{d.dayLetter}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {/* 7-day row or 30-day grid */}
      {show30 ? (
        <View style={{ marginBottom: 4 }}>
          {/* Month label */}
          {(() => {
            const now = new Date();
            const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            return (
              <Text style={{ fontSize: 10, color: CYAN, fontWeight: '700', textAlign: 'center', marginBottom: 5, letterSpacing: 0.5 }}>
                {monthLabel.toUpperCase()}
              </Text>
            );
          })()}
          {/* Day-of-week header */}
          <View style={{ flexDirection: 'row', marginBottom: 3, paddingHorizontal: 2 }}>
            {['S','M','T','W','T','F','S'].map((l, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: '#4A7A8A', fontWeight: '600' }}>{l}</Text>
            ))}
          </View>
          {/* 5 rows × 6 cols = 30 days (pad start to align to week) */}
          {(() => {
            // Pad the 30-day array to start on a Sunday
            const firstDate = new Date();
            firstDate.setDate(firstDate.getDate() - 29);
            const startDow = firstDate.getDay(); // 0=Sun
            const padded: (HeatmapDot | null)[] = [
              ...Array(startDow).fill(null),
              ...dots,
            ];
            const rows: (HeatmapDot | null)[][] = [];
            for (let r = 0; r < padded.length; r += 7) rows.push(padded.slice(r, r + 7));
            return rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', marginBottom: 3 }}>
                {Array.from({ length: 7 }, (_, ci) => {
                  const cell = row[ci];
                  if (!cell) return <View key={ci} style={{ flex: 1 }} />;
                  const dotIdx = dots.indexOf(cell);
                  return <View key={ci} style={{ flex: 1, alignItems: 'center' }}>{renderDot(cell, dotIdx)}</View>;
                })}
              </View>
            ));
          })()}
        </View>
      ) : (
        <View style={heatmapStyles.row}>
          {dots.map((d, i) => renderDot(d, i))}
          <View style={heatmapStyles.legend}>
            <View style={[heatmapStyles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={heatmapStyles.legendText}>Gold</Text>
            <View style={[heatmapStyles.legendDot, { backgroundColor: '#FFB800' }]} />
            <Text style={heatmapStyles.legendText}>Partial</Text>
            <View style={[heatmapStyles.legendDot, { backgroundColor: '#1E3A4A' }]} />
            <Text style={heatmapStyles.legendText}>No data</Text>
          </View>
        </View>
      )}

      {/* Show 30 days toggle */}
      <TouchableOpacity
        onPress={() => { setShow30(v => !v); setActiveDot(null); }}
        activeOpacity={0.7}
        style={{ alignSelf: 'center', marginBottom: 4, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#0A1520', borderWidth: 0.5, borderColor: '#1E3A4A' }}
      >
        <Text style={{ fontSize: 9, color: CYAN, fontWeight: '600' }}>{show30 ? '▲ Show 7 days' : '▼ Show 30 days'}</Text>
      </TouchableOpacity>

      {/* Day-detail popover */}
      {activeData && (
        <View style={heatmapStyles.popover}>
          <View style={heatmapStyles.popoverHeader}>
            <Text style={heatmapStyles.popoverDate}>{activeData.dateKey}</Text>
            {activeData.score !== null && (
              <View style={[heatmapStyles.popoverScoreBadge, {
                backgroundColor: (activeData.score >= 80 ? '#10B981' : activeData.score >= 50 ? '#FFB800' : '#FF2D78') + '20',
              }]}>
                <Text style={[heatmapStyles.popoverScore, {
                  color: activeData.score >= 80 ? '#10B981' : activeData.score >= 50 ? '#FFB800' : '#FF2D78',
                }]}>{activeData.score}/100</Text>
              </View>
            )}
          </View>
          {activeData.score === null ? (
            <Text style={heatmapStyles.popoverNoData}>No nutrition data logged</Text>
          ) : (
            <View style={heatmapStyles.popoverBody}>
              <View style={heatmapStyles.popoverMacroRow}>
                {activeData.calories !== null && (
                  <Text style={heatmapStyles.popoverMacro}>
                    <Text style={{ color: '#7B61FF' }}>● </Text>{Math.round(activeData.calories)} kcal
                  </Text>
                )}
                {topMacro && topMacro.g > 0 && (
                  <Text style={heatmapStyles.popoverMacro}>
                    <Text style={{ color: topMacro.color }}>● </Text>Top: {topMacro.name} {Math.round(topMacro.g)}g
                  </Text>
                )}
              </View>
            </View>
          )}
          <TouchableOpacity
            style={heatmapStyles.popoverLogBtn}
            activeOpacity={0.75}
            onPress={() => {
              setActiveDot(null);
              if (onLogMeal && activeData) onLogMeal(activeData.dateKey);
            }}
          >
            <Text style={heatmapStyles.popoverLogText}>+ Log meal</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const heatmapStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    marginTop: 2,
  },
  dotWrap: { alignItems: 'center', gap: 2 },
  dotWrap30: { alignItems: 'center' },
  dot: {
    width: 10, height: 10, borderRadius: 5,
  },
  dot30: {
    width: 8, height: 8, borderRadius: 4,
  },
  dotToday: {
    borderWidth: 1.5, borderColor: CYAN,
  },
  dotLabel: {
    fontSize: 7, fontWeight: '600', color: TEXT_DIM,
  },
  legend: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4,
  },
  legendDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  legendText: {
    fontSize: 7, color: TEXT_DIM, fontWeight: '500',
  },
  popover: {
    backgroundColor: 'rgba(5,15,25,0.96)',
    borderWidth: 1,
    borderColor: '#00F5FF30',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  popoverHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  popoverDate: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5,
  },
  popoverScoreBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  popoverScore: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.3,
  },
  popoverNoData: {
    fontSize: 11, color: TEXT_DIM, fontStyle: 'italic', marginBottom: 6,
  },
  popoverBody: { marginBottom: 8 },
  popoverMacroRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  popoverMacro: { fontSize: 11, color: '#CBD5E1', fontWeight: '600' },
  popoverLogBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#00F5FF18',
    borderWidth: 1,
    borderColor: '#00F5FF40',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  popoverLogText: {
    fontSize: 11, fontWeight: '700', color: CYAN, letterSpacing: 0.3,
  },
});

// ─── Streak Confetti ────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#00F5FF', '#FFB800', '#FF2D78', '#10B981', '#7B61FF', '#FFD700'];

interface ConfettiParticle {
  x: number; y: number; r: number; color: string; vy: number; vx: number; opacity: number;
}

// Single animated confetti dot — JS-thread Animated.Value (safe on native new arch)
function ConfettiDot({ x, startY, r, color, opacity, delay }: {
  x: number; startY: number; r: number; color: string; opacity: number; delay: number;
}) {
  const cyAnim = useRef(new RNAnimated.Value(startY)).current;
  const alphaAnim = useRef(new RNAnimated.Value(opacity)).current;
  const [dotCy, setDotCy] = useState(startY);
  const [dotAlpha, setDotAlpha] = useState(opacity);

  useEffect(() => {
    const idCy = cyAnim.addListener(({ value }) => setDotCy(value));
    const idAlpha = alphaAnim.addListener(({ value }) => setDotAlpha(value));

    RNAnimated.parallel([
      RNAnimated.timing(cyAnim, {
        toValue: startY + 130,
        duration: 1800 + delay * 0.4,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: false,
      }),
      RNAnimated.timing(alphaAnim, {
        toValue: 0,
        duration: 2200 + delay * 0.3,
        easing: RNEasing.in(RNEasing.quad),
        useNativeDriver: false,
      }),
    ]).start();

    return () => {
      cyAnim.removeListener(idCy);
      alphaAnim.removeListener(idAlpha);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Circle cx={x} cy={dotCy} r={r} fill={color} opacity={dotAlpha} />;
}

function StreakConfetti({ streak, soundEnabled = true }: { streak: number; soundEnabled?: boolean }) {
  // Play milestone chime on mount (only if celebration sounds are enabled)
  useEffect(() => {
    if (!soundEnabled) return;
    let player: any;
    (async () => {
      try {
        const { setAudioModeAsync, createAudioPlayer } = await import('expo-audio');
        await setAudioModeAsync({ playsInSilentMode: true });
         
        player = createAudioPlayer(require('../assets/audio/streak-chime.wav'));
        player.play();
      } catch (_unused) {
        // expo-audio unavailable or audio permission denied — fail silently
      }
    })();
    return () => {
      try { player?.remove?.(); } catch (_unused) {}
    };
  }, [soundEnabled]);

  const particles = useMemo<ConfettiParticle[]>(() => {
    return Array.from({ length: 40 }, () => ({
      x: 10 + Math.random() * 280,
      y: -20 - Math.random() * 30,
      r: 3 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      vy: 0, vx: 0,
      opacity: 0.8 + Math.random() * 0.2,
    }));
  }, []);

  return (
    <View style={confettiStyles.container}>
      <Svg width="100%" height="100%" viewBox="0 0 300 120">
        {particles.map((p, i) => (
          <ConfettiDot
            key={i}
            x={p.x}
            startY={p.y}
            r={p.r}
            color={p.color}
            opacity={p.opacity}
            delay={i * 30}
          />
        ))}
      </Svg>
      <View style={confettiStyles.badge}>
        <Text style={confettiStyles.badgeEmoji}>🔥</Text>
        <Text style={confettiStyles.badgeText}>{streak} Day{streak > 1 ? 's' : ''} Gold Zone!</Text>
      </View>
    </View>
  );
}

const confettiStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 120,
    zIndex: 100,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5,15,25,0.92)',
    borderWidth: 1,
    borderColor: '#FFD70060',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#FFD700',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  badgeEmoji: { fontSize: 18 },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 0.5,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────
interface NutritionChartProps {
  onLogMeal?: (date: string) => void;
  sodiumRecords: any[];
  bloodSugarRecords: any[];
  calorieGoal?: number;
  /** Controlled set of active metric keys. When provided, the chart uses this
   *  instead of its internal toggle state. */
  activeMetrics?: Set<string>;
  /** Called when the user taps a metric chip inside the chart (if the legend
   *  row is still visible). Not needed when tiles drive the state externally. */
  onToggleMetric?: (key: string) => void;
}

export function NutritionChart({ sodiumRecords, bloodSugarRecords, calorieGoal = 2000, onLogMeal, activeMetrics: activeMetricsProp, onToggleMetric }: NutritionChartProps) {
  "use no memo"; // Opt out of React Compiler auto-memoization so Set prop changes always trigger re-render
  const { enabled: celebrationSoundsEnabled } = useCelebrationSounds();
  const [sharingLoading, setSharingLoading] = useState(false);
  const streakShareMutation = trpc.streakShareCard.useMutation();
  const [windowIdx, setWindowIdx] = useState(1);
  const [drawKey, setDrawKey] = useState(0);
  const [activeMetricsInternal, setActiveMetricsInternal] = useState<Set<string>>(
    new Set(['calories', 'carbs', 'bloodSugar'])
  );
  // Use controlled prop when provided, otherwise fall back to internal state
  const activeMetrics = activeMetricsProp ?? activeMetricsInternal;
  const _setActiveMetrics = (updater: (prev: Set<string>) => Set<string>) => {
    if (activeMetricsProp !== undefined) {
      // Controlled mode: delegate to parent via onToggleMetric (not used here)
      return;
    }
    setActiveMetricsInternal(updater);
  };
  const [tooltip, setTooltip] = useState<{ x: number; ptIdx: number } | null>(null);
  const [chartW, setChartW] = useState(300);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartW(e.nativeEvent.layout.width);
  }, []);

  const plotW = chartW - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  // ─── Build data points ────────────────────────────────────────────────
  const points = useMemo<NutritionPoint[]>(() => {
    const { days } = WINDOWS[windowIdx];

    if (days === 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayNutRecs = (sodiumRecords ?? []).filter(
        (r: any) => (r.timestamp ?? r.date ?? '').slice(0, 10) === todayStr
      );
      const todayBsRecs = (bloodSugarRecords ?? []).filter(
        (r: any) => (r.timestamp ?? '').slice(0, 10) === todayStr
      );
      const hours: NutritionPoint[] = [];
      for (let h = 0; h <= new Date().getHours(); h++) {
        const hStr = String(h).padStart(2, '0');
        const nutH = todayNutRecs.filter((r: any) => (r.timestamp ?? '').slice(11, 13) === hStr);
        const bsH  = todayBsRecs.filter((r: any) => (r.timestamp ?? '').slice(11, 13) === hStr);
        const cal  = nutH.reduce((s: number, r: any) => s + (r.total_calories_kcal ?? r.calculated_calories_kcal ?? 0), 0);
        const carb = nutH.reduce((s: number, r: any) => s + (r.carbohydrates_g ?? r.carbs_g ?? 0), 0);
        const prot = nutH.reduce((s: number, r: any) => s + (r.protein_g ?? 0), 0);
        const fat  = nutH.reduce((s: number, r: any) => s + (r.fats_g ?? 0), 0);
        const fib  = nutH.reduce((s: number, r: any) => s + (r.fiber_g ?? 0), 0);
        const bs   = bsH.length ? Math.round(bsH.reduce((s: number, r: any) => s + (r.value ?? r.mgDl ?? 0), 0) / bsH.length) : null;
        hours.push({
          label: `${h}h`, ts: new Date().setHours(h, 0, 0, 0),
          calories: cal || null, carbs: carb || null, protein: prot || null,
          fat: fat || null, bloodSugar: bs, fiber: fib || null,
        });
      }
      return hours;
    }

    const allDays = aggregateDailyNutrients(sodiumRecords ?? []);
    const result: NutritionPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayNut = allDays.find((x: any) => x.date === key);
      const dayBsRecs = (bloodSugarRecords ?? []).filter(
        (r: any) => (r.timestamp ?? '').slice(0, 10) === key
      );
      const bs = dayBsRecs.length
        ? Math.round(dayBsRecs.reduce((s: number, r: any) => s + (r.value ?? r.mgDl ?? 0), 0) / dayBsRecs.length)
        : null;
      const label = days <= 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
        : String(d.getDate());
      result.push({
        label, ts: d.getTime(),
        calories: dayNut ? (dayNut.total_calories_kcal || dayNut.calculated_calories_kcal || null) : null,
        carbs:    dayNut ? (dayNut.carbohydrates_g || null) : null,
        protein:  dayNut ? (dayNut.protein_g || null) : null,
        fat:      dayNut ? (dayNut.fats_g || null) : null,
        bloodSugar: bs,
        fiber:    dayNut ? (dayNut.fiber_g ?? null) : null,
      });
    }
    return result;
  }, [windowIdx, sodiumRecords, bloodSugarRecords]);

  const hasData = points.some(p => p.calories || p.carbs || p.protein || p.fat || p.bloodSugar || p.fiber);

  // ─── Alignment score ──────────────────────────────────────────────────
  const alignmentScore = useMemo(() => computeWindowAlignmentScore(points), [points]);

  // ─── Best day ─────────────────────────────────────────────────────────
  const bestDayIdx = useMemo(() => {
    if (WINDOWS[windowIdx].days === 0) return null;
    let best: number | null = null;
    let bestScore = -1;
    points.forEach((p, i) => {
      const s = computeDayAlignmentScore(p);
      if (s !== null && s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }, [points, windowIdx]);

  // ─── Per-metric scales ────────────────────────────────────────────────
  const metricScales = useMemo(() => {
    const scales: Record<string, { min: number; max: number }> = {};
    for (const m of METRICS) {
      const vals = points.map(p => (p as any)[m.key] as number | null).filter((v): v is number => v !== null);
      if (!vals.length) { scales[m.key] = { min: 0, max: 1 }; continue; }
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const pad = (mx - mn) * 0.15 || 10;
      scales[m.key] = { min: Math.max(0, mn - pad), max: mx + pad };
    }
    return scales;
  }, [points]);

  // ─── SVG coordinates ──────────────────────────────────────────────────
  const metricPoints = useMemo(() => {
    const n = points.length;
    if (n === 0) return {} as Record<string, { x: number; y: number }[]>;
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const m of METRICS) {
      const { min, max } = metricScales[m.key];
      result[m.key] = points
        .map((p, i) => {
          const v = (p as any)[m.key] as number | null;
          if (v === null) return null;
          const x = n === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW;
          const y = PAD_T + plotH - ((v - min) / (max - min || 1)) * plotH;
          return { x, y };
        })
        .filter((pt): pt is { x: number; y: number } => pt !== null);
    }
    return result;
  }, [points, metricScales, plotW, plotH]);

  // ─── Best day X ───────────────────────────────────────────────────────
  const bestDayX = useMemo(() => {
    if (bestDayIdx === null) return null;
    const n = points.length;
    if (n === 0) return null;
    return n === 1 ? PAD_L + plotW / 2 : PAD_L + (bestDayIdx / (n - 1)) * plotW;
  }, [bestDayIdx, points.length, plotW]);

  // ─── Y-axis labels ────────────────────────────────────────────────────
  const yLabels = useMemo(() => {
    const { min, max } = metricScales['calories'];
    return [0, 0.5, 1].map(t => ({
      y: PAD_T + plotH - t * plotH,
      label: Math.round(min + t * (max - min)).toString(),
    }));
  }, [metricScales, plotH]);

  // ─── X-axis labels ────────────────────────────────────────────────────
  const xLabels = useMemo(() => {
    const n = points.length;
    if (n === 0) return [];
    const count = Math.min(n, 7);
    const step = Math.max(1, Math.floor((n - 1) / Math.max(count - 1, 1)));
    return points
      .filter((_, i) => i % step === 0 || i === n - 1)
      .map((p) => {
        const i = points.indexOf(p);
        const x = n === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW;
        return { x, label: p.label };
      });
  }, [points, plotW]);

  // ─── Touch handler ────────────────────────────────────────────────────
  const handleChartPress = useCallback((evt: any) => {
    const n = points.length;
    if (n === 0) return;
    const touchX: number = evt?.nativeEvent?.locationX ?? 0;
    const clampedX = Math.max(PAD_L, Math.min(PAD_L + plotW, touchX));
    const t = (clampedX - PAD_L) / plotW;
    const idx = Math.round(t * (n - 1));
    const x = n === 1 ? PAD_L + plotW / 2 : PAD_L + (idx / (n - 1)) * plotW;
    setTooltip({ x, ptIdx: idx });
    if (Platform.OS !== 'web') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (_unused) {}
    }
  }, [points, plotW]);

  const _dismissTooltip = useCallback(() => setTooltip(null), []);
  const tooltipPt = tooltip ? points[tooltip.ptIdx] : null;

  // Fiber chip active?
  const fiberActive = activeMetrics.has('fiber');
  const caloriesActive = activeMetrics.has('calories');

  // ─── Streak celebration confetti ───────────────────────────────────────────
  const [confettiActive, setConfettiActive] = useState(false);
  const [celebratedStreak, setCelebratedStreak] = useState(0);

  // ─── Gold Zone streak ─────────────────────────────────────────────────
  const goldZoneStreak = useMemo(() => {
    // Use last 30 days of data to compute streak
    const allDays = aggregateDailyNutrients(sodiumRecords ?? []);
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = allDays.find((x: any) => x.date === key);
      if (!day) break;
      const carbKcal = (day.carbohydrates_g ?? 0) * 4;
      const protKcal = (day.protein_g ?? 0) * 4;
      const fatKcal  = (day.fats_g ?? 0) * 9;
      const total = carbKcal + protKcal + fatKcal;
      if (!total) break;
      const pt: NutritionPoint = {
        label: key, ts: d.getTime(),
        calories: day.total_calories_kcal || day.calculated_calories_kcal || null,
        carbs: day.carbohydrates_g || null,
        protein: day.protein_g || null,
        fat: day.fats_g || null,
        bloodSugar: null, fiber: null,
      };
      const s = computeDayAlignmentScore(pt);
      if (s !== null && s >= 80) streak++; else break;
    }
    return streak;
  }, [sodiumRecords]);

  // Fire celebration on milestone streaks (3, 7, 14)
  useEffect(() => {
    const MILESTONES = [3, 7, 14];
    if (MILESTONES.includes(goldZoneStreak) && goldZoneStreak !== celebratedStreak) {
      setCelebratedStreak(goldZoneStreak);
      setConfettiActive(true);
      if (Platform.OS !== 'web') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Haptics = require('expo-haptics');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_unused) {}
      }
      // Auto-dismiss confetti after 2.5s
      const t = setTimeout(() => setConfettiActive(false), 2500);
      return () => clearTimeout(t);
    }
  }, [goldZoneStreak, celebratedStreak]);

  return (
    <View style={styles.wrapper}>

      {/* ── Nutritional Alignment Score + Fiber Ring ─────────────────────── */}
      {alignmentScore !== null && (
        <View style={styles.scoreRow}>
          <View style={styles.scoreLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <Text style={styles.scoreSectionLabel}>NUTRITIONAL ALIGNMENT</Text>
              {goldZoneStreak >= 1 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakText}>🔥 {goldZoneStreak}d streak</Text>
                </View>
              )}
              {goldZoneStreak >= 7 && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={async () => {
                    if (sharingLoading) return;
                    setSharingLoading(true);
                    try {
                      const endDate = safeFormatDate(Date.now(), 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const startDate = safeFormatDate(Date.now() - (goldZoneStreak - 1) * 86400000, 'en-US', { month: 'short', day: 'numeric' });
                      const { url } = await streakShareMutation.mutateAsync({
                        streakDays: goldZoneStreak,
                        alignmentScore,
                        startDate,
                        endDate,
                      });
                      // eslint-disable-next-line @typescript-eslint/no-require-imports
                      const Sharing = require('expo-sharing');
                      const canShare = await Sharing.isAvailableAsync();
                      if (canShare) {
                        await Sharing.shareAsync(url, { mimeType: 'image/png', dialogTitle: 'Share your Gold Zone streak' });
                      } else {
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        const { Alert, Linking } = require('react-native');
                        Alert.alert('🏆 Streak Card Ready', 'Tap Open to view your streak card.', [
                          { text: 'Open', onPress: () => Linking.openURL(url) },
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      }
                    } catch (_unused) {
                      // eslint-disable-next-line @typescript-eslint/no-require-imports
                      const { Alert } = require('react-native');
                      Alert.alert('🏆 Streak', `${goldZoneStreak}-day Gold Zone streak! Alignment: ${alignmentScore}/100`);
                    } finally {
                      setSharingLoading(false);
                    }
                  }}
                  style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#FFB80020', borderWidth: 0.5, borderColor: '#FFB800' }}
                >
                  <Text style={{ fontSize: 9, color: '#FFB800', fontWeight: '700' }}>{sharingLoading ? '…' : 'Share ↗'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Weekly heatmap row */}
             <WeeklyHeatmap sodiumRecords={sodiumRecords} onLogMeal={onLogMeal} />
            <View style={styles.scoreValueRow}>
              <Text style={[styles.scoreNumber, { color: scoreColor(alignmentScore) }]}>
                {alignmentScore}
              </Text>
              <Text style={styles.scoreOutOf}>/100</Text>
              <View style={[styles.scoreBadge, { backgroundColor: scoreColor(alignmentScore) + '20' }]}>
                <Text style={[styles.scoreBadgeText, { color: scoreColor(alignmentScore) }]}>
                  {scoreLabel(alignmentScore)}
                </Text>
              </View>
            </View>
            <Text style={styles.scoreSubtext}>AMDR macro ratio targets</Text>
          </View>

          {/* Rings row: Alignment + optional Fiber */}
          <View style={styles.ringsRow}>
            {/* Alignment ring */}
            <View style={styles.scoreRingWrap}>
              <Svg width={52} height={52}>
                <Circle cx={26} cy={26} r={20} fill="none" stroke={GRID_COLOR} strokeWidth={4} />
                <Circle
                  cx={26} cy={26} r={20}
                  fill="none"
                  stroke={scoreColor(alignmentScore)}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={`${(alignmentScore / 100) * 125.7} 125.7`}
                  transform="rotate(-90 26 26)"
                />
              </Svg>
              <View style={styles.scoreRingInner}>
                <Text style={[styles.scoreRingNum, { color: scoreColor(alignmentScore) }]}>
                  {alignmentScore}
                </Text>
              </View>
            </View>

            {/* Calorie ring (only when Calories chip is active) */}
            {caloriesActive && <CalorieRing points={points} goalKcal={calorieGoal} />}

            {/* Fiber ring (only when Fiber chip is active) */}
            {fiberActive && <FiberRing points={points} />}
          </View>
        </View>
      )}

      {/* ── Macro Ratio Bar ───────────────────────────────────────────────── */}
      <MacroRatioBar points={points} barWidth={chartW} />

      {/* ── Macro Trend Sparklines ───────────────────────────────────────── */}
      <MacroSparklines sodiumRecords={sodiumRecords} />

      {/* ── Streak Celebration Confetti ────────────────────────────────── */}
      {confettiActive && (
        <View style={confettiStyles.overlay} pointerEvents="none">
          <StreakConfetti streak={goldZoneStreak} soundEnabled={celebrationSoundsEnabled} />
        </View>
      )}

      {/* ── Time-window selector ─────────────────────────────────────────── */}
      <View style={styles.windowRow}>
        {WINDOWS.map((w, i) => (
          <TouchableOpacity
            key={w.label}
            onPress={() => {
              setWindowIdx(i);
              setTooltip(null);
              setDrawKey(k => k + 1);
            }}
            style={[
              styles.windowChip,
              windowIdx === i && styles.windowChipActive,
              windowIdx === i && { borderColor: CYAN + '60' },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.windowChipText, windowIdx === i && { color: CYAN }]}>
              {w.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Chart card ───────────────────────────────────────────────────── */}
      <View onLayout={onLayout} style={styles.chartCard}>
        <ParticleLayer width={chartW} />

        {!hasData ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyTitle}>No nutrition data</Text>
            <Text style={styles.emptySub}>Log meals to see your neon macros chart</Text>
          </View>
        ) : (
          <TouchableWithoutFeedback onPress={handleChartPress}>
            <View style={{ width: chartW, height: CHART_H }}>
              <Svg width={chartW} height={CHART_H}>
                <Defs>
                  {METRICS.map(m => (
                    <LinearGradient key={m.key} id={`grad_nc3_${m.key}`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={m.color} stopOpacity="0.18" />
                      <Stop offset="1" stopColor={m.color} stopOpacity="0" />
                    </LinearGradient>
                  ))}
                </Defs>

                {/* Dashed grid */}
                <GridBackground plotW={plotW} plotH={plotH} />

                {/* Y-axis labels */}
                {yLabels.map((l, i) => (
                  <SvgText key={`yl${i}`} x={PAD_L - 6} y={l.y + 4} fontSize={8} fill={TEXT_DIM} textAnchor="end">
                    {l.label}
                  </SvgText>
                ))}

                {/* X-axis labels */}
                {xLabels.map((l, i) => (
                  <SvgText key={`xl${i}`} x={l.x} y={CHART_H - 4} fontSize={7} fill={TEXT_DIM} textAnchor="middle">
                    {l.label}
                  </SvgText>
                ))}

                {/* Best day highlight */}
                {bestDayX !== null && (
                  <G>
                    <Rect x={bestDayX - 7} y={PAD_T} width={14} height={plotH} fill={EMERALD} opacity={0.06} rx={3} />
                    <Line x1={bestDayX} y1={PAD_T} x2={bestDayX} y2={PAD_T + plotH} stroke={EMERALD} strokeWidth={1} opacity={0.5} strokeDasharray="3,3" />
                    <Rect x={Math.min(bestDayX - 14, chartW - 32)} y={3} width={28} height={13} fill={EMERALD} rx={3} opacity={0.9} />
                    <SvgText x={Math.min(bestDayX, chartW - 18)} y={13} fontSize={7} fill="#050F19" textAnchor="middle" fontWeight="800">BEST</SvgText>
                    <Circle cx={bestDayX} cy={PAD_T + plotH} r={4} fill={EMERALD} opacity={0.9} />
                  </G>
                )}

                {/* Gradient fill areas (static, behind animated lines) */}
                {METRICS.filter(m => activeMetrics.has(m.key)).map(m => {
                  const pts = metricPoints[m.key];
                  if (!pts || pts.length < 2) return null;
                  const d = buildPath(pts);
                  const fillD = `${d} L ${pts[pts.length - 1].x} ${PAD_T + plotH} L ${pts[0].x} ${PAD_T + plotH} Z`;
                  return <Path key={`fill_${m.key}`} d={fillD} fill={`url(#grad_nc3_${m.key})`} />;
                })}

                {/* Animated metric lines (draw-on) */}
                {METRICS.filter(m => activeMetrics.has(m.key)).map((m, idx) => {
                  const pts = metricPoints[m.key];
                  if (!pts || pts.length === 0) return null;
                  if (pts.length === 1) {
                    return <Circle key={m.key} cx={pts[0].x} cy={pts[0].y} r={3} fill={m.color} />;
                  }
                  const d = buildPath(pts);
                  const pathLen = approxPathLength(pts);
                  return (
                    <AnimatedMetricLine
                      key={`${m.key}_${drawKey}`}
                      d={d}
                      color={m.color}
                      pathLength={pathLen}
                      drawKey={drawKey}
                      delay={idx * 60}
                    />
                  );
                })}

                {/* Crosshair */}
                {tooltip && (
                  <Line
                    x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={PAD_T + plotH}
                    stroke="#FFFFFF" strokeWidth={0.8} opacity={0.3} strokeDasharray="4,3"
                  />
                )}

                {/* Crosshair dots */}
                {tooltip && METRICS.filter(m => activeMetrics.has(m.key)).map(m => {
                  const pts = metricPoints[m.key];
                  if (!pts || pts.length === 0) return null;
                  const closest = pts.reduce((a, b) =>
                    Math.abs(a.x - tooltip.x) < Math.abs(b.x - tooltip.x) ? a : b
                  );
                  return <Circle key={m.key} cx={closest.x} cy={closest.y} r={3.5} fill={m.color} stroke={CANVAS_BG} strokeWidth={1.5} />;
                })}
              </Svg>

              {/* GlowPulse on latest data point */}
              {METRICS.filter(m => activeMetrics.has(m.key)).map(m => {
                const pts = metricPoints[m.key];
                if (!pts || pts.length === 0) return null;
                const last = pts[pts.length - 1];
                return <GlowPulse key={m.key} color={m.color} cx={last.x} cy={last.y} />;
              })}

              {/* Tooltip */}
              {tooltip && tooltipPt && (
                <View style={[
                  styles.tooltip,
                  { left: Math.min(tooltip.x + 8, chartW - 128), top: 8 },
                ]}>
                  <Text style={styles.tooltipLabel}>{tooltipPt.label}</Text>
                  {(() => {
                    const dayScore = computeDayAlignmentScore(tooltipPt);
                    if (dayScore === null) return null;
                    return (
                      <View style={styles.tooltipScoreRow}>
                        <Text style={styles.tooltipScoreKey}>ALIGNMENT</Text>
                        <Text style={[styles.tooltipScoreVal, { color: scoreColor(dayScore) }]}>{dayScore}/100</Text>
                      </View>
                    );
                  })()}
                  {METRICS.filter(m => activeMetrics.has(m.key)).map(m => {
                    const val = (tooltipPt as any)[m.key];
                    if (val === null || val === undefined) return null;
                    return (
                      <View key={m.key} style={styles.tooltipRow}>
                        <View style={[styles.tooltipDot, { backgroundColor: m.color }]} />
                        <Text style={[styles.tooltipKey, { color: m.color }]}>{m.label}</Text>
                        <Text style={styles.tooltipVal}>
                          {Math.round(val)}{' '}
                          <Text style={styles.tooltipUnit}>{m.unit}</Text>
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        )}
      </View>


    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: GRID_COLOR,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  scoreLeft: { flex: 1 },
  scoreSectionLabel: {
    fontSize: 9, color: TEXT_DIM, fontWeight: '700', letterSpacing: 1, marginBottom: 3,
  },
  scoreValueRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 5,
  },
  scoreNumber: {
    fontSize: 28, fontWeight: '800', lineHeight: 32,
  },
  scoreOutOf: {
    fontSize: 11, color: TEXT_DIM, fontWeight: '600',
  },
  scoreBadge: {
    marginLeft: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  scoreBadgeText: {
    fontSize: 9, fontWeight: '800', letterSpacing: 0.5,
  },
  scoreSubtext: {
    fontSize: 9, color: TEXT_DIM, marginTop: 2, letterSpacing: 0.3,
  },
  ringsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
  },
  scoreRingWrap: {
    width: 52, height: 52, alignItems: 'center', justifyContent: 'center',
  },
  scoreRingInner: {
    position: 'absolute', alignItems: 'center',
  },
  scoreRingNum: {
    fontSize: 13, fontWeight: '800',
  },
  streakBadge: {
    backgroundColor: '#FF6B0020',
    borderWidth: 0.5,
    borderColor: '#FF6B0060',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  streakText: {
    fontSize: 9,
    color: '#FF6B00',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  windowRow: {
    flexDirection: 'row', gap: 8, marginBottom: 10,
  },
  windowChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER_DIM, backgroundColor: CHIP_BG,
  },
  windowChipActive: {
    backgroundColor: CYAN + '12',
  },
  windowChipText: {
    fontSize: 11, fontWeight: '700', color: TEXT_DIM, letterSpacing: 0.5,
  },
  chartCard: {
    width: '100%', height: CHART_H, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER_DIM, backgroundColor: CANVAS_BG,
    overflow: 'hidden', marginBottom: 12,
    shadowColor: CYAN, shadowOpacity: 0.08, shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  emptyIcon: { fontSize: 24 },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: TEXT_DIM },
  emptySub: { fontSize: 10, color: TEXT_DIM, textAlign: 'center', paddingHorizontal: 24 },
  tooltip: {
    position: 'absolute', backgroundColor: TOOLTIP_BG, borderRadius: 12,
    borderWidth: 1, borderColor: TOOLTIP_BORDER,
    paddingHorizontal: 10, paddingVertical: 8, width: 120, zIndex: 99,
    shadowColor: CYAN, shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  tooltipLabel: { fontSize: 11, fontWeight: '700', color: TEXT_BRIGHT, marginBottom: 4 },
  tooltipScoreRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
    paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER_DIM,
  },
  tooltipScoreKey: { fontSize: 8, color: TEXT_DIM, fontWeight: '700', letterSpacing: 0.3 },
  tooltipScoreVal: { fontSize: 9, fontWeight: '800' },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  tooltipDot: { width: 6, height: 6, borderRadius: 3 },
  tooltipKey: { fontSize: 9, fontWeight: '700', flex: 1, letterSpacing: 0.3 },
  tooltipVal: { fontSize: 9, fontWeight: '600', color: TEXT_BRIGHT },
  tooltipUnit: { fontSize: 8, color: TEXT_DIM, fontWeight: '400' },
  legendSection: {
    paddingTop: 8, borderTopWidth: 0.5, borderTopColor: GRID_COLOR,
  },
  legendSectionLabel: {
    fontSize: 9, color: TEXT_DIM, fontWeight: '700', letterSpacing: 1, marginBottom: 8,
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  legendChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, backgroundColor: CHIP_BG,
  },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  legendChipUnit: { fontSize: 8, color: TEXT_DIM, letterSpacing: 0.2 },
});
