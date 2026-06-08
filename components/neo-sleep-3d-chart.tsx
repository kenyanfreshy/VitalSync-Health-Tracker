/**
 * NeoSleep3DChart
 *
 * High-end immersive 3D sleep visualization built with React Native Skia.
 * Inspired by the NeoSleep design spec:
 *   - Dark #05070A background with circadian gradient wave
 *   - Spline-based 3D ribbon bands per stage (Deep/Core/REM/Awake)
 *   - Neon glow: cyan, violet, soft coral
 *   - Breathing animation (entire graph expands/contracts)
 *   - Floating particles in background
 *   - Light streaks between stage transitions
 *   - Floating glass summary card (time asleep, 3D progress ring, micro-stats)
 *   - Sleep nodes (glass orbs) at REM cycles and deep recovery peaks
 *   - Smart insight overlay labels with light-beam connectors
 *   - Tap node → expand into sleep insight card
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
  PanResponder,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Path,
  Circle,
  Rect,
  Text as SvgText,
  Line,
  G,
  Ellipse,
} from 'react-native-svg';
import type { SleepRecord } from '@/lib/health/types';
import type { useColors } from '@/hooks/use-colors';
import { useRouter } from 'expo-router';
import { useLang } from '@/hooks';
import { logStrings } from '@/lib/i18n';

// Animated SVG Circle for pulsing glow on sleep nodes
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W;
const EDGE_INSET = 28;  // pulsating bubble center inset from right edge
const CHART_H = 340;
const STAGE_AREA_TOP = 60;
const STAGE_AREA_H = 160;
const STAGE_AREA_BOTTOM = STAGE_AREA_TOP + STAGE_AREA_H;
const H_PAD = 52;  // left margin clears stage labels (Awake ~40px wide)
const H_PAD_RIGHT = 52;  // right margin clears pulsing glow halos + Today label
const _PLOT_W = CHART_W - H_PAD - H_PAD_RIGHT;

// Stage vertical bands (Y positions within stage area, bottom-anchored)
// Deep = lowest, Core = mid-low, REM = mid-high, Awake = spikes at top
const STAGE_BANDS = {
  deep:  { yCenter: STAGE_AREA_BOTTOM - 20, thickness: 28, color: '#6D28D9', glow: '#818CF8', label: 'Deep' },
  core:  { yCenter: STAGE_AREA_BOTTOM - 68, thickness: 22, color: '#059669', glow: '#34D399', label: 'Core' },
  rem:   { yCenter: STAGE_AREA_BOTTOM - 110, thickness: 18, color: '#D97706', glow: '#FCD34D', label: 'REM' },
  awake: { yCenter: STAGE_AREA_BOTTOM - 148, thickness: 10, color: '#BE123C', glow: '#FF6B8A', label: 'Awake' },
} as const;

type StageKey = keyof typeof STAGE_BANDS;
const STAGE_ORDER: StageKey[] = ['deep', 'core', 'rem', 'awake'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ymd(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
}

function fmtHrs(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`;
}

/** Cubic bezier spline path through a series of [x, y] points */
function splinePath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cpX = (x0 + x1) / 2;
    d += ` C ${cpX} ${y0}, ${cpX} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

/** Build a closed ribbon path for a stage band */
function ribbonPath(
  pts: [number, number][],
  thickness: number,
): string {
  if (pts.length < 2) return '';
  // Top edge
  const topPts: [number, number][] = pts.map(([x, y]) => [x, y - thickness / 2]);
  // Bottom edge (reversed)
  const botPts: [number, number][] = [...pts].reverse().map(([x, y]) => [x, y + thickness / 2]);

  let d = `M ${topPts[0][0]} ${topPts[0][1]}`;
  for (let i = 0; i < topPts.length - 1; i++) {
    const [x0, y0] = topPts[i];
    const [x1, y1] = topPts[i + 1];
    const cpX = (x0 + x1) / 2;
    d += ` C ${cpX} ${y0}, ${cpX} ${y1}, ${x1} ${y1}`;
  }
  d += ` L ${botPts[0][0]} ${botPts[0][1]}`;
  for (let i = 0; i < botPts.length - 1; i++) {
    const [x0, y0] = botPts[i];
    const [x1, y1] = botPts[i + 1];
    const cpX = (x0 + x1) / 2;
    d += ` C ${cpX} ${y0}, ${cpX} ${y1}, ${x1} ${y1}`;
  }
  d += ' Z';
  return d;
}

/** SVG arc path for progress ring */
function arcPath(ratio: number, r: number, cx: number, cy: number): string {
  if (ratio <= 0) return '';
  if (ratio >= 1) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
  }
  const angle = ratio * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y}`;
}

// ─── Local date helper ──────────────────────────────────────────────────────
/** Returns YYYY-MM-DD in local time from any Date-like value */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Slot = {
  label: string;
  isToday: boolean;
  totalMins: number;
  bedtime: string;
  stages: { deep: number; core: number; rem: number; awake: number };
  efficiency: number;
};

type SleepNode = {
  x: number;
  y: number;
  stage: StageKey;
  label: string;
  insight: string;
};

type Props = {
  records: SleepRecord[];
  goalHrs: number;
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
  /** Compact mode: shorter chart height for dashboard widget embedding */
  compact?: boolean;
  /**
   * Explicit container width in px. When provided the chart SVG is sized to
   * this value instead of the full device screen width, preventing right-edge
   * clipping when the chart is embedded inside a card with horizontal margins.
   * Defaults to Dimensions.get('window').width (full-width, e.g. sleep log).
   */
  containerWidth?: number;
};

// ─── Component ────────────────────────────────────────────────────────────────

// Physiological descriptions for each stage
const STAGE_TOOLTIPS: Record<StageKey, { title: string; body: string; color: string }> = {
  deep:  { title: 'Deep Sleep (N3)', color: '#818CF8', body: 'The most restorative stage. Growth hormone is released, muscles repair, and the immune system strengthens. Low deep sleep is linked to fatigue and poor recovery.' },
  core:  { title: 'Core Sleep (N2)', color: '#34D399', body: 'Light NREM sleep where the brain consolidates memories and regulates body temperature. Sleep spindles during this stage protect sleep continuity.' },
  rem:   { title: 'REM Sleep', color: '#FCD34D', body: 'Rapid Eye Movement sleep drives emotional regulation, creativity, and memory integration. Most vivid dreaming occurs here. Low REM is linked to mood instability.' },
  awake: { title: 'Awake Periods', color: '#FF6B8A', body: 'Brief awakenings are normal (5–10 min/night). Elevated awake time may indicate sleep apnea, stress, or environmental disruption.' },
};

export function NeoSleepWeeklyChart({ records, goalHrs, compact = false, containerWidth }: Props) {
  const lang = useLang();
  const t = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const CHART_HEIGHT = compact ? 240 : CHART_H;
  // Use measured/provided width; fall back to full screen width for standalone screens
  const chartW = containerWidth ?? SCREEN_W;
  const plotW_dyn = chartW - H_PAD - H_PAD_RIGHT;
  const [selectedNode, setSelectedNode] = useState<SleepNode | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageKey | null>(null);
  const router = useRouter();
  const breathAnim = useRef(new Animated.Value(1)).current;
  // Right-edge pulse animation
  const edgePulseAnim = useRef(new Animated.Value(0)).current;
  // Tooltip spring animation (scale + opacity)
  const tooltipScale = useRef(new Animated.Value(0.85)).current;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  // Tooltip swipe-to-dismiss (horizontal pan)
  const tooltipTranslateX = useRef(new Animated.Value(0)).current;
  const tooltipPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => tooltipTranslateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 40) {
          // Swipe far enough — slide out and dismiss
          Animated.timing(tooltipTranslateX, {
            toValue: g.dx > 0 ? 300 : -300,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            tooltipTranslateX.setValue(0);
            setSelectedStage(null);
          });
        } else {
          // Snap back
          Animated.spring(tooltipTranslateX, {
            toValue: 0,
            tension: 200,
            friction: 20,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;
  const particleAnim = useRef(new Animated.Value(0)).current;
  // Per-stage ribbon flash animations (brief opacity spike on tap)
  const ribbonFlashAnims = useRef(
    Object.fromEntries(STAGE_ORDER.map(s => [s, new Animated.Value(0)])) as Record<StageKey, Animated.Value>,
  ).current;

  const triggerRibbonFlash = useCallback((stage: StageKey) => {
    const anim = ribbonFlashAnims[stage];
    anim.setValue(1);
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [ribbonFlashAnims]);

  // Per-node pulse animations (up to 12 nodes; extras are ignored)
  const nodePulseAnims = useRef(
    Array.from({ length: 12 }, () => new Animated.Value(0)),
  ).current;

  // Dedicated pulse animation for the latest night's nodes (brighter, faster)
  const latestNodePulseAnim = useRef(new Animated.Value(0)).current;

  // Tooltip spring-in animation — triggers whenever selectedStage changes
  useEffect(() => {
    if (selectedStage) {
      tooltipScale.setValue(0.85);
      tooltipOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(tooltipScale, {
          toValue: 1,
          tension: 200,
          friction: 18,
          useNativeDriver: true,
        }),
        Animated.timing(tooltipOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedStage, tooltipScale, tooltipOpacity]);

  // Right-edge pulse animation — vertical glow bar at the right margin
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(edgePulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(edgePulseAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: false,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [edgePulseAnim]);

  // Breathing animation — subtle scale pulse every 4 seconds
  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1.012,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );
    breathe.start();
    return () => breathe.stop();
  }, [breathAnim]);

  // Particle drift animation
  useEffect(() => {
    const drift = Animated.loop(
      Animated.timing(particleAnim, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      }),
    );
    drift.start();
    return () => drift.stop();
  }, [particleAnim]);

  // Start per-node pulsing glow animations — each node gets a staggered loop
  useEffect(() => {
    const animations = nodePulseAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 300), // stagger so nodes don't all pulse in sync
          Animated.timing(anim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: false, // SVG props can't use native driver
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 1400,
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [nodePulseAnims]);

  // Latest-night node pulse — faster, brighter cycle to draw the eye
  useEffect(() => {
    const latestPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(latestNodePulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(latestNodePulseAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: false,
        }),
      ]),
    );
    latestPulse.start();
    return () => latestPulse.stop();
  }, [latestNodePulseAnim]);

  // Build 7-day slots
  const slots: Slot[] = useMemo(() => {
    const dayMap: Record<string, SleepRecord> = {};
    for (const r of records) {
      // Always derive key from local time to avoid UTC-offset date mismatch
      const key = r.date ?? localDateStr(new Date(r.bedtime));
      if (!dayMap[key] || r.bedtime > dayMap[key].bedtime) dayMap[key] = r;
    }
    return Array.from({ length: 7 }, (_, i) => {
      const offset = 6 - i;
      const key = ymd(offset);
      const rec = dayMap[key] ?? null;
      const totalMins = rec?.totalMinutes ?? 0;
      const deepMins = rec?.deepMinutes ?? 0;
      const remMins = rec?.remMinutes ?? 0;
      const awakeMins = rec?.awakeMinutes ?? 0;
      const coreMins = rec?.coreMinutes != null
        ? rec.coreMinutes
        : Math.max(0, totalMins - deepMins - remMins - awakeMins);
      return {
        label: offset === 0 ? 'Today' : dayLabel(offset),
        isToday: offset === 0,
        totalMins,
        bedtime: rec?.bedtime ?? '',
        stages: { deep: deepMins, core: coreMins, rem: remMins, awake: awakeMins },
        efficiency: rec?.efficiency ?? 0,
      };
    });
  }, [records]);

  const hasData = slots.some(s => s.totalMins > 0);
  const maxMins = Math.max(goalHrs * 60 * 1.25, ...slots.map(s => s.totalMins), 1);

  // X positions for each slot (evenly spaced) — derived from runtime chartW
  const slotX = useMemo(() =>
    slots.map((_, i) => H_PAD + (i / (slots.length - 1)) * plotW_dyn),
    [slots, plotW_dyn],
  );

  // Build ribbon control points for each stage
  const stageRibbons = useMemo(() => {
    return STAGE_ORDER.map(stage => {
      const band = STAGE_BANDS[stage];
      const pts: [number, number][] = slots.map((slot, i) => {
        const stageMins = slot.stages[stage];
        const ratio = slot.totalMins > 0 ? stageMins / maxMins : 0;
        // Vertical displacement: more minutes → ribbon moves toward center of stage area
        const displacement = ratio * (STAGE_AREA_H * 0.3);
        return [slotX[i], band.yCenter - displacement];
      });
      return { stage, band, pts };
    });
  }, [slots, slotX, maxMins]);

  // Sleep nodes — key moments in the timeline
  const sleepNodes = useMemo((): SleepNode[] => {
    const nodes: SleepNode[] = [];
    slots.forEach((slot, i) => {
      if (slot.totalMins === 0) return;
      const x = slotX[i];
      // Deep sleep recovery peak
      if (slot.stages.deep > 60) {
        nodes.push({
          x,
          y: STAGE_BANDS.deep.yCenter - 14,
          stage: 'deep',
          label: '🌑',
          insight: `Deep sleep: ${fmtHrs(slot.stages.deep)} — Recovery peak on ${slot.label}`,
        });
      }
      // REM cycle node
      if (slot.stages.rem > 45) {
        nodes.push({
          x,
          y: STAGE_BANDS.rem.yCenter - 10,
          stage: 'rem',
          label: '✦',
          insight: `REM: ${fmtHrs(slot.stages.rem)} — Memory consolidation active`,
        });
      }
      // Micro-awakening node
      if (slot.stages.awake > 20) {
        nodes.push({
          x,
          y: STAGE_BANDS.awake.yCenter - 8,
          stage: 'awake',
          label: '⚡',
          insight: `Awake: ${fmtHrs(slot.stages.awake)} — Fragmented sleep on ${slot.label}`,
        });
      }
    });
    return nodes;
  }, [slots, slotX]);

  // Smart insight labels (shown for the most recent night with data)
  const _aiInsights = useMemo(() => {
    const latest = [...slots].reverse().find(s => s.totalMins > 0);
    if (!latest) return [];
    const insights: { text: string; x: number; y: number; color: string }[] = [];
    const latestIdx = slots.indexOf(latest);
    const x = slotX[latestIdx];

    if (latest.stages.rem > latest.totalMins * 0.2) {
      insights.push({ text: 'REM recovery optimal', x: Math.min(x + 8, CHART_W - 120), y: STAGE_BANDS.rem.yCenter - 28, color: '#22D3EE' });
    }
    if (latest.stages.deep < latest.totalMins * 0.1 && latest.totalMins > 0) {
      insights.push({ text: 'Fragmented deep sleep', x: Math.min(x + 8, CHART_W - 130), y: STAGE_BANDS.deep.yCenter - 28, color: '#818CF8' });
    }
    if (latest.efficiency >= 85) {
      insights.push({ text: `Efficiency: ${latest.efficiency}%`, x: Math.min(x + 8, CHART_W - 120), y: STAGE_AREA_TOP + 10, color: '#22C55E' });
    }
    return insights;
  }, [slots, slotX]);

  // Summary stats
  const totalMinsLatest = useMemo(() => {
    const latest = [...slots].reverse().find(s => s.totalMins > 0);
    return latest?.totalMins ?? 0;
  }, [slots]);

  const avgEfficiency = useMemo(() => {
    const withData = slots.filter(s => s.totalMins > 0);
    if (!withData.length) return 0;
    return Math.round(withData.reduce((s, r) => s + r.efficiency, 0) / withData.length);
  }, [slots]);

  const avgDeepPct = useMemo(() => {
    const withData = slots.filter(s => s.totalMins > 0);
    if (!withData.length) return 0;
    const totalDeep = withData.reduce((s, r) => s + r.stages.deep, 0);
    const totalAll = withData.reduce((s, r) => s + r.totalMins, 0);
    return totalAll > 0 ? Math.round((totalDeep / totalAll) * 100) : 0;
  }, [slots]);

  const avgRemPct = useMemo(() => {
    const withData = slots.filter(s => s.totalMins > 0);
    if (!withData.length) return 0;
    const totalRem = withData.reduce((s, r) => s + r.stages.rem, 0);
    const totalAll = withData.reduce((s, r) => s + r.totalMins, 0);
    return totalAll > 0 ? Math.round((totalRem / totalAll) * 100) : 0;
  }, [slots]);

  const goalNights = useMemo(() =>
    slots.filter(s => s.totalMins > 0 && s.totalMins / 60 >= goalHrs * 0.9).length,
    [slots, goalHrs],
  );

  // Index of the latest night that has data (used for latest-node pulse)
  const latestSlotIndex = useMemo(() => {
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].totalMins > 0) return i;
    }
    return -1;
  }, [slots]);

  // Per-stage 7-night averages (minutes)
  const stageAvgMins = useMemo(() => {
    const withData = slots.filter(s => s.totalMins > 0);
    if (!withData.length) return { deep: 0, core: 0, rem: 0, awake: 0 };
    const sum = withData.reduce(
      (acc, s) => ({
        deep: acc.deep + s.stages.deep,
        core: acc.core + s.stages.core,
        rem: acc.rem + s.stages.rem,
        awake: acc.awake + s.stages.awake,
      }),
      { deep: 0, core: 0, rem: 0, awake: 0 },
    );
    const n = withData.length;
    return {
      deep: Math.round(sum.deep / n),
      core: Math.round(sum.core / n),
      rem: Math.round(sum.rem / n),
      awake: Math.round(sum.awake / n),
    };
  }, [slots]);

  const _ringColor = goalNights >= 5 ? '#22C55E' : goalNights >= 3 ? '#F59E0B' : '#EF4444';
  const _ringArc = arcPath(goalNights / 7, 22, 26, 26);

  const handleNodeTap = useCallback((node: SleepNode) => {
    setSelectedNode(prev => prev?.x === node.x && prev?.stage === node.stage ? null : node);
  }, []);

  // Circadian gradient wave points — derived from runtime chartW
  const circadianPts: [number, number][] = [
    [0, STAGE_AREA_BOTTOM + 30],
    [chartW * 0.15, STAGE_AREA_BOTTOM + 10],
    [chartW * 0.35, STAGE_AREA_BOTTOM + 40],
    [chartW * 0.55, STAGE_AREA_BOTTOM + 15],
    [chartW * 0.75, STAGE_AREA_BOTTOM + 45],
    [chartW, STAGE_AREA_BOTTOM + 25],
  ];
  const circadianPath = splinePath(circadianPts);

  // Floating particles (positions derived from runtime chartW)
  const particles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: (i * 53 + 17) % chartW,
      y: STAGE_AREA_TOP + (i * 37 + 11) % STAGE_AREA_H,
      r: 1 + (i % 3) * 0.5,
      opacity: 0.15 + (i % 4) * 0.08,
    })),
    [chartW],
  );

  return (
    <View style={styles.outerContainer}>
      <Animated.View style={[styles.container, { height: CHART_HEIGHT, transform: [{ scale: breathAnim }] }]}>
        <Svg width={chartW} height={CHART_HEIGHT}>
          <Defs>
            {/* Background gradient */}
            <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#05070A" stopOpacity="1" />
              <Stop offset="0.6" stopColor="#080C18" stopOpacity="1" />
              <Stop offset="1" stopColor="#0A0F1E" stopOpacity="1" />
            </LinearGradient>

            {/* Circadian rhythm gradient */}
            <LinearGradient id="circadianGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#1E1040" stopOpacity="0.6" />
              <Stop offset="0.3" stopColor="#2D1B69" stopOpacity="0.4" />
              <Stop offset="0.6" stopColor="#1E3A5F" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#0F2027" stopOpacity="0.6" />
            </LinearGradient>

            {/* Stage ribbon gradients */}
            <LinearGradient id="deepGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#4C1D95" stopOpacity="0.7" />
              <Stop offset="0.5" stopColor="#6D28D9" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#4C1D95" stopOpacity="0.7" />
            </LinearGradient>
            <LinearGradient id="coreGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#065F46" stopOpacity="0.7" />
              <Stop offset="0.5" stopColor="#059669" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#065F46" stopOpacity="0.7" />
            </LinearGradient>
            <LinearGradient id="remGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#92400E" stopOpacity="0.7" />
              <Stop offset="0.5" stopColor="#D97706" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#92400E" stopOpacity="0.7" />
            </LinearGradient>
            <LinearGradient id="awakeGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#9F1239" stopOpacity="0.7" />
              <Stop offset="0.5" stopColor="#BE123C" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#9F1239" stopOpacity="0.7" />
            </LinearGradient>

            {/* Glow radial gradients for nodes */}
            <RadialGradient id="deepNodeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#818CF8" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#818CF8" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="coreNodeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#34D399" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#34D399" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="remNodeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FCD34D" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#FCD34D" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="awakeNodeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FF6B8A" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#FF6B8A" stopOpacity="0" />
            </RadialGradient>

            {/* Glass card gradient */}
            <LinearGradient id="glassCard" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.03" />
            </LinearGradient>

            {/* Shimmer highlight */}
            <LinearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.06" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* ── Background ── */}
          <Rect x="0" y="0" width={chartW} height={CHART_HEIGHT} fill="url(#bgGrad)" rx="20" />

          {/* Circadian rhythm background wave */}
          <Path
            d={`${circadianPath} L ${chartW} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`}
            fill="url(#circadianGrad)"
          />

          {/* Shimmer overlay */}
          <Rect x="0" y="0" width={chartW} height={CHART_HEIGHT} fill="url(#shimmer)" rx="20" />

          {/* ── Floating particles ─────────────────────────────────────── */}
          {particles.map(p => (
            <Circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill="#818CF8"
              opacity={p.opacity}
            />
          ))}

          {/* ── Stage ribbons ──────────────────────────────────────────── */}
          {stageRibbons.map(({ stage, band, pts }) => {
            const gradId = `${stage}Grad`;
            const path = ribbonPath(pts, band.thickness);
            if (!path) return null;
            // Dim non-selected ribbons when a stage tooltip is open
            const dimmed = selectedStage !== null && selectedStage !== stage;
            const baseRibbonOpacity = dimmed ? 0.22 : 0.88;
            const glowOpacity  = dimmed ? 0.04 : 0.12;
            const edgeOpacity  = dimmed ? 0.15 : 0.6;
            // Flash: interpolate 0→1 flash anim adds up to +0.12 extra opacity
            const _flashBoost = ribbonFlashAnims[stage].interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.12],
            });
            // We can't add Animated.Value to a static number in SVG opacity directly;
            // use an Animated.View wrapper with absolute positioning as a flash overlay
            const _isFlashing = ribbonFlashAnims[stage];
            return (
              <G key={stage}>
                {/* Glow shadow */}
                <Path
                  d={path}
                  fill={band.glow}
                  opacity={glowOpacity}
                  transform={`translate(0, 3)`}
                />
                {/* Main ribbon */}
                <Path d={path} fill={`url(#${gradId})`} opacity={baseRibbonOpacity} />
                {/* Top edge highlight */}
                <Path
                  d={splinePath(pts.map(([x, y]) => [x, y - band.thickness / 2] as [number, number]))}
                  stroke={band.glow}
                  strokeWidth={1.5}
                  fill="none"
                  opacity={edgeOpacity}
                />
              </G>
            );
          })}

          {/* ── Light streaks between stages ───────────────────────────── */}
          {slots.map((slot, i) => {
            if (slot.totalMins === 0 || i === 0) return null;
            const x = slotX[i];
            const prevX = slotX[i - 1];
            return (
              <G key={`streak-${i}`}>
                <Line
                  x1={prevX} y1={STAGE_BANDS.deep.yCenter}
                  x2={x} y2={STAGE_BANDS.rem.yCenter}
                  stroke="#818CF8"
                  strokeWidth={0.5}
                  opacity={0.15}
                />
                <Line
                  x1={prevX} y1={STAGE_BANDS.rem.yCenter}
                  x2={x} y2={STAGE_BANDS.core.yCenter}
                  stroke="#FCD34D"
                  strokeWidth={0.5}
                  opacity={0.12}
                />
              </G>
            );
          })}

          {/* ── Day labels ─────────────────────────────────────────────── */}
          {slots.map((slot, i) => (
            <SvgText
              key={`label-${i}`}
              x={slotX[i]}
              y={STAGE_AREA_BOTTOM + 18}
              textAnchor="middle"
              fontSize={slot.isToday ? 11 : 10}
              fontWeight={slot.isToday ? '700' : '500'}
              fill={slot.isToday ? '#22D3EE' : '#CBD5E1'}
            >
              {slot.label}
            </SvgText>
          ))}

          {/* ── Hours labels ───────────────────────────────────────────── */}
          {slots.map((slot, i) => {
            if (slot.totalMins === 0) return null;
            const hrs = (slot.totalMins / 60).toFixed(1);
            return (
              <SvgText
                key={`hrs-${i}`}
                x={slotX[i]}
                y={STAGE_BANDS.awake.yCenter - STAGE_BANDS.awake.thickness / 2 - 6}
                textAnchor="middle"
                fontSize={9}
                fontWeight="600"
                fill="#E2E8F0"
              >
                {hrs}h
              </SvgText>
            );
          })}

          {/* Stage legend removed — replaced by pill chips below the chart */}

          {/* ── Sleep nodes (glass orbs with pulsing glow) ─────────── */}
          {sleepNodes.map((node, i) => {
            const isSelected = selectedNode?.x === node.x && selectedNode?.stage === node.stage;
            const glowId = `${node.stage}NodeGlow`;
            // Nodes on the latest slot use the dedicated faster pulse; others use staggered
            const isLatestNight = latestSlotIndex >= 0 && Math.abs(node.x - slotX[latestSlotIndex]) < 2;
            const pulseAnim = isLatestNight ? latestNodePulseAnim : nodePulseAnims[i % nodePulseAnims.length];
            const pulseRMin = isLatestNight ? 12 : (isSelected ? 12 : 10);
            const pulseRMax = isLatestNight ? 22 : (isSelected ? 16 : 16);
            const pulseOpMin = isLatestNight ? 0.6 : (isSelected ? 0.5 : 0.22);
            const pulseOpMid = isLatestNight ? 0.85 : (isSelected ? 0.65 : 0.45);
            const pulseR = pulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [pulseRMin, pulseRMax],
            });
            const pulseOpacity = pulseAnim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [pulseOpMin, pulseOpMid, pulseOpMin],
            });
            return (
              <G key={`node-${i}`}>
                {/* Pulsing outer glow halo (AnimatedCircle) */}
                <AnimatedCircle
                  cx={node.x}
                  cy={node.y}
                  r={pulseR}
                  fill={`url(#${glowId})`}
                  opacity={pulseOpacity}
                />
                {/* Static inner glow */}
                <Circle cx={node.x} cy={node.y} r={isSelected ? 10 : (isLatestNight ? 9 : 7)} fill={`url(#${glowId})`} opacity={isSelected ? 0.35 : (isLatestNight ? 0.28 : 0.18)} />
                {/* Glass sphere */}
                <Circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 7 : (isLatestNight ? 6 : 5)}
                  fill={STAGE_BANDS[node.stage].glow}
                  opacity={isSelected ? 0.9 : (isLatestNight ? 0.85 : 0.65)}
                  stroke="#FFFFFF"
                  strokeWidth={isLatestNight ? 1 : 0.5}
                  strokeOpacity={isLatestNight ? 0.5 : 0.3}
                />
                {/* Node icon */}
                <SvgText
                  x={node.x}
                  y={node.y + 3}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#FFFFFF"
                  opacity={0.9}
                >
                  {node.label}
                </SvgText>
              </G>
            );
          })}

          {/* ── Right-edge pulsating glow bar ── */}
          <AnimatedCircle
            cx={chartW - EDGE_INSET}
            cy={STAGE_AREA_TOP + STAGE_AREA_H / 2}
            r={edgePulseAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 22] }) as unknown as number}
            fill="#818CF8"
            opacity={edgePulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.55, 0] }) as unknown as number}
          />
          <AnimatedCircle
            cx={chartW - EDGE_INSET}
            cy={STAGE_AREA_TOP + STAGE_AREA_H / 2}
            r={edgePulseAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 12] }) as unknown as number}
            fill="#C4B5FD"
            opacity={edgePulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.75, 0] }) as unknown as number}
          />

          {/* ── Glass border ── */}
          <Rect
            x={0.5}
            y={0.5}
            width={chartW - 1}
            height={CHART_HEIGHT - 1}
            rx={19.5}
            stroke="#818CF8"
            strokeWidth={0.8}
            strokeOpacity={0.25}
            fill="none"
          />
          {/* Top edge refraction highlight */}
          <Rect
            x={12}
            y={1}
            width={chartW - 24}
            height={2}
            rx={1}
            fill="#FFFFFF"
            opacity={0.06}
          />
        </Svg>

        {/* ── Tap zones for sleep nodes ─────────────────────────────── */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {sleepNodes.map((node, i) => (
            <TouchableOpacity
              key={`tap-${i}`}
              style={[
                styles.nodeTapZone,
                { left: node.x - 16, top: node.y - 16 },
              ]}
              onPress={() => handleNodeTap(node)}
              activeOpacity={0.7}
            />
          ))}
        </View>
      </Animated.View>
      {/* ── Floating glass summary card ────────────────────────────────── */}
      <View style={styles.summaryCard}>
        {/* Time asleep */}
        <View style={styles.summaryCenter}>
          <Text style={styles.timeAsleep}>
            {totalMinsLatest > 0 ? fmtHrs(totalMinsLatest) : '—'}
          </Text>
          <Text style={styles.timeLabel}>Last night</Text>
        </View>

        {/* Micro-stats */}
        <View style={styles.microStats}>
          <View style={styles.microStat}>
            <Text style={[styles.microVal, { color: '#818CF8' }]}>{avgDeepPct}%</Text>
            <Text style={styles.microLabel}>Deep</Text>
          </View>
          <View style={styles.microStat}>
            <Text style={[styles.microVal, { color: '#FCD34D' }]}>{avgRemPct}%</Text>
            <Text style={styles.microLabel}>REM</Text>
          </View>
          <View style={styles.microStat}>
            <Text style={[styles.microVal, { color: '#22C55E' }]}>{avgEfficiency > 0 ? `${avgEfficiency}%` : '—'}</Text>
            <Text style={styles.microLabel}>Eff.</Text>
          </View>
        </View>
      </View>

      {/* ── Stage label tap zones (absolute overlay over SVG left margin) ── */}
      {STAGE_ORDER.map((stage) => {
        const band = STAGE_BANDS[stage];
        const isActive = selectedStage === stage;
        return (
          <TouchableOpacity
            key={`tap-${stage}`}
            style={[
              styles.stageTapZone,
              { top: band.yCenter - 10 },
              isActive && { backgroundColor: band.glow + '18', borderRadius: 6 },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const Haptics = require('expo-haptics');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              triggerRibbonFlash(stage);
              setSelectedStage(prev => prev === stage ? null : stage);
              setSelectedNode(null);
            }}
            activeOpacity={0.7}
          />
        );
      })}

      {/* ── Ribbon flash overlays (Animated.View per stage, absolute) ─────── */}
      {STAGE_ORDER.map((stage) => {
        const band = STAGE_BANDS[stage];
        const halfH = Math.max(band.thickness / 2 + 8, 18);
        return (
          <Animated.View
            key={`flash-${stage}`}
            pointerEvents="none"
            style={[
              styles.ribbonTapZone,
              {
                top: band.yCenter - halfH,
                height: halfH * 2,
                backgroundColor: band.glow,
                opacity: ribbonFlashAnims[stage].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.25],
                }),
              },
            ]}
          />
        );
      })}

      {/* ── Ribbon tap zones (full-width, over SVG, one per stage) ─────── */}
      {STAGE_ORDER.map((stage) => {
        const band = STAGE_BANDS[stage];
        const halfH = Math.max(band.thickness / 2 + 8, 18);
        return (
          <TouchableOpacity
            key={`ribbon-tap-${stage}`}
            style={[
              styles.ribbonTapZone,
              { top: band.yCenter - halfH, height: halfH * 2 },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const Haptics = require('expo-haptics');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              triggerRibbonFlash(stage);
              setSelectedStage(prev => prev === stage ? null : stage);
              setSelectedNode(null);
            }}
            activeOpacity={0.01}
          />
        );
      })}

      {/* ── Stage physiological tooltip (spring-scale + fade-in) ─────────── */}
      {selectedStage && (() => {
        const tip = STAGE_TOOLTIPS[selectedStage];
        return (
          <Animated.View
            style={[
              styles.stageTooltip,
              { borderColor: tip.color + '50' },
              { opacity: tooltipOpacity, transform: [{ scale: tooltipScale }, { translateX: tooltipTranslateX }] },
            ]}
            {...tooltipPan.panHandlers}
          >
            <View style={styles.stageTooltipHeader}>
              <View style={[styles.stageTooltipDot, { backgroundColor: tip.color }]} />
              <Text style={[styles.stageTooltipTitle, { color: tip.color }]}>{tip.title}</Text>
              <TouchableOpacity onPress={() => setSelectedStage(null)} style={styles.insightClose}>
                <Text style={styles.insightCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.stageTooltipBody}>{tip.body}</Text>
            <TouchableOpacity
              onPress={() => {
                setSelectedStage(null);
                router.push({ pathname: '/detail/sleep-science', params: { stage: selectedStage! } });
              }}
              activeOpacity={0.7}
              style={styles.learnMoreBtn}
            >
              <Text style={[styles.learnMoreText, { color: tip.color }]}>Learn more →</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })()}

      {selectedNode && (
        <View style={styles.insightCard}>
          <View style={[styles.insightDot, { backgroundColor: STAGE_BANDS[selectedNode.stage].glow }]} />
          <Text style={styles.insightText}>{selectedNode.insight}</Text>
          <TouchableOpacity onPress={() => setSelectedNode(null)} style={styles.insightClose}>
            <Text style={styles.insightCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Colour-coded legend pill chips (3D glass tab) ──────────────────────────────────────────────────── */}
      <View style={styles.glassTab}>
        {/* Top-edge refraction highlight */}
        <View style={styles.glassTabHighlight} />
        <View style={styles.legendRow}>
        {STAGE_ORDER.map((stage) => {
          const band = STAGE_BANDS[stage];
          const isActive = selectedStage === stage;
          return (
            <TouchableOpacity
              key={`chip-${stage}`}
              style={[
                styles.legendChip,
                { backgroundColor: isActive ? band.color : band.color + '30', borderColor: band.glow + (isActive ? 'FF' : '60') },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const Haptics = require('expo-haptics');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                triggerRibbonFlash(stage);
                setSelectedStage(prev => prev === stage ? null : stage);
                setSelectedNode(null);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.legendChipDot, { backgroundColor: band.glow }]} />
              <Text style={[styles.legendChipText, { color: isActive ? '#FFFFFF' : band.glow }]}>{band.label}</Text>
            </TouchableOpacity>
          );
        })}
        </View>

        {/* ── Per-stage weekly average bar ──────────────────────────────────────────────────── */}
        {hasData && (
          <View style={styles.avgBarSection}>
            <Text style={styles.avgBarTitle}>{t.sevenNightAvg ?? '7-NIGHT AVG'}</Text>
            {STAGE_ORDER.map((stage) => {
              const band = STAGE_BANDS[stage];
              const avgMins = stageAvgMins[stage];
              const maxAvg = Math.max(1, ...STAGE_ORDER.map(s => stageAvgMins[s]));
              const barFrac = Math.min(1, avgMins / maxAvg);
              return (
                <View key={`avg-${stage}`} style={styles.avgBarRow}>
                  <Text style={[styles.avgBarLabel, { color: band.glow }]}>{band.label}</Text>
                  <View style={styles.avgBarTrack}>
                    <View
                      style={[
                        styles.avgBarFill,
                        {
                          width: `${Math.round(barFrac * 100)}%` as `${number}%`,
                          backgroundColor: band.color,
                          shadowColor: band.glow,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.avgBarValue, { color: band.glow }]}>
                    {avgMins > 0 ? fmtHrs(avgMins) : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View> {/* end glassTab */}

      {/* ── No data state ───────────────────────────────────────────────────── */}
      {!hasData && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>{t.logFirstSleep ?? 'Log your first sleep to see the 3D visualization'}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: -16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'visible',
  },
  container: {
    // width is now driven by the SVG's own width (chartW prop), not a fixed screen constant
    backgroundColor: '#05070A',
    borderRadius: 20,
    overflow: 'visible',
  },
  nodeTapZone: {
    position: 'absolute',
    width: 32,
    height: 32,
  },
  stageTapZone: {
    position: 'absolute',
    left: 0,
    width: 50,
    height: 22,
  },
  ribbonTapZone: {
    position: 'absolute',
    left: H_PAD,
    right: 0,
  },
  stageTooltip: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: 'rgba(15, 20, 40, 0.92)',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  stageTooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageTooltipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageTooltipTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  stageTooltipBody: {
    fontSize: 12,
    lineHeight: 18,
    color: '#CBD5E1',
    fontWeight: '400',
  },
  learnMoreBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  learnMoreText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  summaryCard: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(129,140,248,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ringWrap: {
    alignItems: 'center',
    marginRight: 12,
  },
  ringCaption: {
    fontSize: 7,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  summaryCenter: {
    flex: 1,
    alignItems: 'center',
  },
  timeAsleep: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  timeLabel: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 1,
  },
  microStats: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 12,
  },
  microStat: {
    alignItems: 'center',
  },
  microVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  microLabel: {
    fontSize: 7,
    color: '#6B7280',
    marginTop: 1,
  },
  insightCard: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 14, 26, 0.9)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(129,140,248,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  insightText: {
    flex: 1,
    fontSize: 11,
    color: '#D1D5DB',
    lineHeight: 16,
  },
  insightClose: {
    padding: 4,
  },
  insightCloseText: {
    fontSize: 11,
    color: '#6B7280',
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 20,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  // 3D glass tab container for legend + avg bar
  glassTab: {
    backgroundColor: 'rgba(10, 12, 20, 0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(129,140,248,0.20)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    // Glass shadow
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  glassTabHighlight: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 20,
    marginBottom: 2,
  },
  // Legend pill chips
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  legendChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Per-stage weekly average bar
  avgBarSection: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 6,
  },
  avgBarTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  avgBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avgBarLabel: {
    width: 36,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
  avgBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  avgBarFill: {
    height: '100%',
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  avgBarValue: {
    width: 38,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
});
