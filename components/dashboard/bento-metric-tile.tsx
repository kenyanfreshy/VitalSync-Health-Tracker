/**
 * BentoMetricTile — 3D Liquid Glass vital metric tile.
 *
 * Visual recipe (Apple liquid-glass design language):
 *
 *   LIGHT MODE
 *   ─────────────────────────────────────────────────────────────────────────
 *   • Outer glass shell: 1.5px border, accent-tinted at 20% opacity
 *   • Drop shadow: accent-tinted, 6px Y offset, 14px blur radius
 *   • Glass body gradient: rgba(255,255,255,0.82) → rgba(255,255,255,0.60)
 *     → accent at 8% opacity (top → bottom)
 *   • Top specular streak: bright horizontal gradient fading right
 *   • Rim highlights: 1.5px bright top+left edges, dark bottom+right edges
 *   • Inner accent glow: soft colour bleed at bottom 60% of tile
 *
 *   DARK MODE
 *   ─────────────────────────────────────────────────────────────────────────
 *   • Same structure, darker glass fill (rgba(255,255,255,0.10) → 0.06)
 *   • Stronger accent bleed at bottom (18% opacity)
 *   • Deeper drop shadow (35% opacity, 18px blur)
 *   • Specular streak at 22% white
 *
 *   PRESS FEEDBACK
 *   ─────────────────────────────────────────────────────────────────────────
 *   • Scale 0.96 on press-in, spring back to 1.0 on press-out
 *   • Light haptic on press-in
 *
 *   STATUS PILL
 *   ─────────────────────────────────────────────────────────────────────────
 *   • Glow-pulse animation on status change (scale + opacity sequence)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  useColorScheme,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SparklineChart } from './sparkline-chart';
import { SparklineDetailSheet } from './sparkline-detail-sheet';
import { useDashboardStrings } from '@/hooks';

export type MetricStatus = 'optimal' | 'stable' | 'improving' | 'warning' | 'critical';

const STATUS_COLORS: Record<MetricStatus, { color: string; bgColor: string }> = {
  optimal:   { color: '#10B981', bgColor: 'rgba(16,185,129,0.15)' },
  stable:    { color: '#F59E0B', bgColor: 'rgba(245,158,11,0.15)' },
  improving: { color: '#3B82F6', bgColor: 'rgba(59,130,246,0.15)' },
  warning:   { color: '#F97316', bgColor: 'rgba(249,115,22,0.15)' },
  critical:  { color: '#EF4444', bgColor: 'rgba(239,68,68,0.15)'  },
};

type IconName =
  | 'heart.fill'
  | 'drop.fill'
  | 'lungs.fill'
  | 'moon.fill'
  | 'thermometer'
  | 'bolt.fill'
  | 'figure.stand'
  | 'bed.double.fill'
  | 'waveform.path.ecg';

interface BentoMetricTileProps {
  title: string;
  icon: IconName;
  accentColor: string;
  primaryValue: string;
  primaryUnit?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  /** Optional third row below the secondary row (e.g. Resting HR) */
  tertiaryLabel?: string;
  tertiaryValue?: string;
  /** Trend arrow shown inline after tertiaryValue: 'up' | 'down' | 'stable' */
  tertiaryTrend?: 'up' | 'down' | 'stable';
  status?: MetricStatus;
  sparklineData?: number[];
  /**
   * Optional secondary sparkline series (e.g. diastolic BP). Rendered as a
   * dashed softer line sharing the same Y-axis scale as sparklineData.
   */
  sparklineSecondaryData?: number[];
  /**
   * When true (default), rising sparkline values = improving (green).
   * Set to false for metrics where lower is better (BP, resting HR, weight).
   */
  higherIsBetter?: boolean;
  isLoading?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Full width tile (spans both columns) */
  fullWidth?: boolean;
  /** ISO timestamp of the most recent record for this metric */
  lastSyncedAt?: string | null;
  /** Called when user taps the Sync Now button (shown when data is stale) */
  onSyncPress?: () => void;
  /** Hours after which data is considered stale. Defaults to 6. */
  staleThresholdHours?: number;
  /**
   * Human-readable metric title shown in the sparkline detail sheet.
   * Defaults to `title` if not provided.
   */
  sparklineTitle?: string;
  /**
   * Unit string shown in the sparkline detail sheet, e.g. "mmHg" or "%".
   * Defaults to `primaryUnit` if not provided.
   */
  sparklineUnit?: string;
  /**
   * When provided, tapping the sparkline calls this instead of opening the
   * built-in SparklineDetailSheet. Use to render a custom detail sheet.
   */
  onSparklinePress?: () => void;
  /**
   * When true, shows a pulsing accent-coloured dot next to the last-synced badge
   * to indicate a recent (within 24 h) reading.
   */
  showLiveDot?: boolean;
  /**
   * When true, shows a compact "Last: X days ago" label below the primary value.
   * Requires lastSyncedAt to be set.
   */
  showLastRecorded?: boolean;
  /**
   * When provided, renders a scrolling dual-line waveform (systolic + diastolic)
   * just below the tile title. Pass [systolicValues, diastolicValues] arrays.
   */
  headerWaveformData?: [number[], number[]];
  /**
   * When true, renders a scrolling sine-wave trace below the tile title.
   * Ideal for heart rate and SpO₂ tiles.
   */
  showSineWaveform?: boolean;
  /**
   * When true, renders a slow, low-amplitude sine-wave trace below the tile title.
   * Ideal for the sleep tile.
   */
  showSleepWaveform?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

/** Format an ISO timestamp as a compact "Mar 15" or localised "Today"/"Yesterday" badge label */
function formatSyncBadge(iso: string, todayLabel: string, yesterdayLabel: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toDateString();
  const yestStr = new Date(now.getTime() - 86_400_000).toDateString();
  if (d.toDateString() === todayStr) return todayLabel;
  if (d.toDateString() === yestStr) return yesterdayLabel;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


// ── Sine-wave Header Waveform ─────────────────────────────────────────────────
// Scrolling sine-wave trace for HR and SpO₂ tiles.
// Uses RNAnimated (not Reanimated) + react-native-svg, same pattern as EKGSparkline.
const SINE_TILE_W = 72;
const SINE_SVG_H  = 18;
const SINE_STEPS  = 40;

function buildSinePath(tileOffset = 0): string {
  const pts: string[] = [];
  for (let i = 0; i <= SINE_STEPS; i++) {
    const t = i / SINE_STEPS;
    const x = tileOffset + t * SINE_TILE_W;
    const y = (SINE_SVG_H / 2) + Math.sin(t * Math.PI * 4) * (SINE_SVG_H * 0.35);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return 'M' + pts.join(' L');
}

const SINE_TILED_PATH = [0, 1, 2].map(i => buildSinePath(i * SINE_TILE_W)).join(' ');

function SineHeaderWaveform({ accent }: { accent: string }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.timing(translateX, {
        toValue: -SINE_TILE_W,
        duration: 2500,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [translateX]);
  const gradId = `sineWaveGrad_${accent.replace('#', '')}`;
  return (
    <View style={{ width: SINE_TILE_W, height: SINE_SVG_H, overflow: 'hidden', marginTop: 2 }}>
      <RNAnimated.View style={{ transform: [{ translateX }] }}>
        <Svg width={SINE_TILE_W * 3} height={SINE_SVG_H} viewBox={`0 0 ${SINE_TILE_W * 3} ${SINE_SVG_H}`}>
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"   stopColor={accent} stopOpacity={0.10} />
              <Stop offset="0.3" stopColor={accent} stopOpacity={0.75} />
              <Stop offset="0.7" stopColor={accent} stopOpacity={0.75} />
              <Stop offset="1"   stopColor={accent} stopOpacity={0.10} />
            </SvgLinearGradient>
          </Defs>
          <Path d={SINE_TILED_PATH} stroke={`url(#${gradId})`} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </RNAnimated.View>
    </View>
  );
}

// ── BP Dual-line Header Waveform ──────────────────────────────────────────────
// Systolic (solid) + diastolic (dashed, phase-shifted) for the BP tile.
const BP_TILE_W = 72;
const BP_SVG_H  = 18;
const BP_STEPS  = 40;

function buildBPSinePath(tileOffset = 0, phaseShift = 0, amplitudeRatio = 0.38): string {
  const pts: string[] = [];
  for (let i = 0; i <= BP_STEPS; i++) {
    const t = i / BP_STEPS;
    const x = tileOffset + t * BP_TILE_W;
    const y = (BP_SVG_H / 2) + Math.sin(t * Math.PI * 4 + phaseShift) * (BP_SVG_H * amplitudeRatio);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return 'M' + pts.join(' L');
}

const BP_SYS_PATH = [0, 1, 2].map(i => buildBPSinePath(i * BP_TILE_W, 0, 0.40)).join(' ');
const BP_DIA_PATH = [0, 1, 2].map(i => buildBPSinePath(i * BP_TILE_W, Math.PI, 0.18)).join(' ');

function BPHeaderWaveform({ accent }: { accent: string; systolicData: number[]; diastolicData: number[] }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.timing(translateX, {
        toValue: -BP_TILE_W,
        duration: 2500,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [translateX]);
  const gradId = `bpWaveGrad_${accent.replace('#', '')}`;
  return (
    <View style={{ width: BP_TILE_W, height: BP_SVG_H, overflow: 'hidden', marginTop: 2 }}>
      <RNAnimated.View style={{ transform: [{ translateX }] }}>
        <Svg width={BP_TILE_W * 3} height={BP_SVG_H} viewBox={`0 0 ${BP_TILE_W * 3} ${BP_SVG_H}`}>
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"   stopColor={accent} stopOpacity={0.10} />
              <Stop offset="0.3" stopColor={accent} stopOpacity={0.75} />
              <Stop offset="0.7" stopColor={accent} stopOpacity={0.75} />
              <Stop offset="1"   stopColor={accent} stopOpacity={0.10} />
            </SvgLinearGradient>
          </Defs>
          <Path d={BP_SYS_PATH} stroke={`url(#${gradId})`} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={BP_DIA_PATH} stroke="#60A5FA" strokeWidth={1} strokeOpacity={0.55} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2" />
        </Svg>
      </RNAnimated.View>
    </View>
  );
}

// ── Sleep-wave Header Waveform ────────────────────────────────────────────────
// Slow, low-amplitude sine wave for the sleep tile.
const SLEEP_TILE_W = 72;
const SLEEP_SVG_H  = 14;
const SLEEP_STEPS  = 60;

function buildSleepPath(tileOffset = 0): string {
  const pts: string[] = [];
  for (let i = 0; i <= SLEEP_STEPS; i++) {
    const t = i / SLEEP_STEPS;
    const x = tileOffset + t * SLEEP_TILE_W;
    const y = (SLEEP_SVG_H / 2) + Math.sin(t * Math.PI * 2) * (SLEEP_SVG_H * 0.18);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return 'M' + pts.join(' L');
}

const SLEEP_TILED_PATH = [0, 1, 2].map(i => buildSleepPath(i * SLEEP_TILE_W)).join(' ');

function SleepHeaderWaveform({ accent }: { accent: string }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.timing(translateX, {
        toValue: -SLEEP_TILE_W,
        duration: 4000,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [translateX]);
  const gradId = `sleepWaveGrad_${accent.replace('#', '')}`;
  return (
    <View style={{ width: SLEEP_TILE_W, height: SLEEP_SVG_H, overflow: 'hidden', marginTop: 2 }}>
      <RNAnimated.View style={{ transform: [{ translateX }] }}>
        <Svg width={SLEEP_TILE_W * 3} height={SLEEP_SVG_H} viewBox={`0 0 ${SLEEP_TILE_W * 3} ${SLEEP_SVG_H}`}>
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"   stopColor={accent} stopOpacity={0.08} />
              <Stop offset="0.3" stopColor={accent} stopOpacity={0.60} />
              <Stop offset="0.7" stopColor={accent} stopOpacity={0.60} />
              <Stop offset="1"   stopColor={accent} stopOpacity={0.08} />
            </SvgLinearGradient>
          </Defs>
          <Path d={SLEEP_TILED_PATH} stroke={`url(#${gradId})`} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </RNAnimated.View>
    </View>
  );
}

// ── Live Dot ──────────────────────────────────────────────────────────────────
// Pulsing accent dot shown when the most recent reading is within 24 hours.
function LiveDot({ accent }: { accent: string }) {
  const opacity = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 0.25, duration: 700, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 1, duration: 700, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return (
    <RNAnimated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: accent },
        { opacity },
      ]}
    />
  );
}

/** Convert a hex colour to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const RADIUS = 24;

export function BentoMetricTile({
  title,
  icon,
  accentColor,
  primaryValue,
  primaryUnit,
  secondaryLabel,
  secondaryValue,
  tertiaryLabel,
  tertiaryValue,
  tertiaryTrend,
  status,
  sparklineData,
  sparklineSecondaryData,
  isLoading = false,
  onPress,
  onLongPress,
  fullWidth = false,
  higherIsBetter = true,
  lastSyncedAt,
  onSyncPress,
  staleThresholdHours = 6,
  sparklineTitle,
  sparklineUnit,
  onSparklinePress,
  showLiveDot = false,
  showLastRecorded = false,
  headerWaveformData,
  showSineWaveform = false,
  showSleepWaveform = false,
}: BentoMetricTileProps) {
  const [sparklineSheetVisible, setSparklineSheetVisible] = useState(false);
  // Stale if last sync was older than the configured threshold
  const isStale = React.useMemo(() => {
    if (!lastSyncedAt) return false;
    return Date.now() - new Date(lastSyncedAt).getTime() > staleThresholdHours * 60 * 60 * 1000;
  }, [lastSyncedAt, staleThresholdHours]);
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // ── Press scale animation ──────────────────────────────────────────────
  const scale = useSharedValue(1);
  const tileAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  function handlePressIn() {
    scale.value = withTiming(0.96, { duration: 80 });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function handlePressOut() {
    scale.value = withTiming(1, { duration: 180 });
  }

  // ── Status pill glow-pulse animation ──────────────────────────────────
  const prevStatusRef = useRef<MetricStatus | undefined>(undefined);
  const pillOpacity = useSharedValue(1);
  const pillScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === undefined || prev === status) return;

    pillScale.value = withSequence(
      withTiming(1.12, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(1.0,  { duration: 200, easing: Easing.in(Easing.quad) })
    );
    glowOpacity.value = withSequence(
      withTiming(1,   { duration: 100 }),
      withDelay(180, withTiming(0, { duration: 250 }))
    );
    pillOpacity.value = withSequence(
      withTiming(0.6, { duration: 80 }),
      withTiming(1.0, { duration: 200 })
    );

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const pillAnimStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
    transform: [{ scale: pillScale.value }],
  }), [pillOpacity, pillScale]);

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }), [glowOpacity]);

  const ds = useDashboardStrings();
  const STATUS_LABELS: Record<MetricStatus, string> = {
    optimal:   ds.statusOptimal   ?? 'Optimal',
    stable:    ds.statusStable    ?? 'Stable',
    improving: ds.statusImproving ?? 'Improving',
    warning:   ds.statusWarning   ?? 'Warning',
    critical:  ds.statusCritical  ?? 'Critical',
  };
  const statusCfg = status
    ? { label: STATUS_LABELS[status], ...STATUS_COLORS[status] }
    : null;

  // ── Glass depth shadow ─────────────────────────────────────────────────
  const shadowProps = isDark
    ? {
        shadowColor: accentColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
        elevation: 10,
      }
    : {
        shadowColor: accentColor,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: 6,
      };

  // ── Glass body gradient ────────────────────────────────────────────────
  const glassTopLight    = 'rgba(255,255,255,0.82)';
  const glassMidLight    = 'rgba(255,255,255,0.60)';
  const glassBottomLight = hexToRgba(accentColor, 0.08);

  const glassTopDark     = 'rgba(255,255,255,0.10)';
  const glassMidDark     = 'rgba(255,255,255,0.06)';
  const glassBottomDark  = hexToRgba(accentColor, 0.18);

  const gradientColors = isDark
    ? ([glassTopDark, glassMidDark, glassBottomDark] as const)
    : ([glassTopLight, glassMidLight, glassBottomLight] as const);

  // ── Rim colours ────────────────────────────────────────────────────────
  const rimTopColor    = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)';
  const rimBottomColor = isDark ? 'rgba(0,0,0,0.55)'       : 'rgba(0,0,0,0.10)';

  // ── Outer border ───────────────────────────────────────────────────────
  const outerBorderColor = isDark
    ? hexToRgba(accentColor, 0.30)
    : hexToRgba(accentColor, 0.18);

  // ── Icon badge ─────────────────────────────────────────────────────────
  const iconBadgeBg = isDark
    ? hexToRgba(accentColor, 0.22)
    : hexToRgba(accentColor, 0.14);

  // ── Text colours ───────────────────────────────────────────────────────
  const titleColor         = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.45)';
  const primaryValueColor  = isDark ? '#FFFFFF'                 : '#18181E';
  const primaryUnitColor   = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)';
  const secondaryLabelColor = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.35)';
  const secondaryValueColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  const skeletonBg          = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  // ── Skeleton pulse animation ───────────────────────────────────────────
  const skeletonOpacity = useSharedValue(1);
  useEffect(() => {
    if (isLoading) {
      skeletonOpacity.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0,  { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      skeletonOpacity.value = withTiming(1, { duration: 150 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);
  const skeletonAnimStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
  }), [skeletonOpacity]);

  return (
    <>
    <AnimatedPressable
      style={[
        styles.tileWrapper,
        fullWidth && styles.tileFullWidth,
        tileAnimStyle,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {/* ── Outer glass shell ─────────────────────────────────────────────── */}
      <View
        style={[
          styles.glassShell,
          { borderColor: outerBorderColor },
          shadowProps,
        ]}
      >
        {/* ── Glass body gradient ───────────────────────────────────────────── */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.glassBody}
        >
          {/* ── Top specular streak ───────────────────────────────────────────── */}
          <LinearGradient
            colors={[
              isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.90)',
              isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.specularStreak}
          />

          {/* ── Rim highlights ────────────────────────────────────────────────── */}
          <View style={[styles.rimTop,    { backgroundColor: rimTopColor }]} />
          <View style={[styles.rimLeft,   { backgroundColor: rimTopColor }]} />
          <View style={[styles.rimBottom, { backgroundColor: rimBottomColor }]} />
          <View style={[styles.rimRight,  { backgroundColor: rimBottomColor }]} />

          {/* ── Accent inner glow ─────────────────────────────────────────────── */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', hexToRgba(accentColor, isDark ? 0.20 : 0.10)]}
            start={{ x: 0.5, y: 0.4 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.accentGlow}
          />

          {/* ── Content ───────────────────────────────────────────────────────── */}
          <View style={styles.content}>
            {/* Top row: icon + status pill */}
            <View style={styles.topRow}>
              <View style={[styles.iconWrap, { backgroundColor: iconBadgeBg, borderWidth: 1, borderColor: hexToRgba(accentColor, isDark ? 0.40 : 0.30) }]}>
                <IconSymbol name={icon} size={16} color={accentColor} />
              </View>

              {statusCfg && (
                <View style={styles.pillWrapper}>
                  {/* Glow halo behind the pill */}
                  <AnimatedView
                    style={[
                      styles.pillGlow,
                      { backgroundColor: statusCfg.color + '40' },
                      glowAnimStyle,
                    ]}
                  />
                  {/* The pill itself */}
                  <AnimatedView
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusCfg.bgColor, borderColor: statusCfg.color + '55' },
                      pillAnimStyle,
                    ]}
                  >
                    <Text style={[styles.statusText, { color: statusCfg.color }]}>
                      {statusCfg.label}
                    </Text>
                  </AnimatedView>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={[styles.tileTitle, { color: titleColor }]} numberOfLines={1}>
              {title}
            </Text>
            {/* Scrolling BP dual-line waveform */}
            {headerWaveformData ? (
              <BPHeaderWaveform
                systolicData={headerWaveformData[0]}
                diastolicData={headerWaveformData[1]}
                accent={accentColor}
              />
            ) : null}
            {/* Scrolling sine-wave trace (heart rate / SpO₂) */}
            {showSineWaveform && !headerWaveformData && (
              <SineHeaderWaveform accent={accentColor} />
            )}
            {/* Slow restful sine-wave trace (sleep tile) */}
            {showSleepWaveform && !headerWaveformData && !showSineWaveform && (
              <SleepHeaderWaveform accent={accentColor} />
            )}
            {/* Last recorded label below waveform */}
            {showLastRecorded && lastSyncedAt && (
              <Text style={{ fontSize: 9.5, color: accentColor, opacity: 0.75, marginTop: 1, letterSpacing: 0.1 }}>
                Last: {formatSyncBadge(lastSyncedAt, ds.today ?? 'Today', ds.yesterday ?? 'Yesterday')}
              </Text>
            )}

            {/* Primary value */}
            <View style={styles.valueRow}>
              {isLoading ? (
                <Animated.View style={[styles.skeletonPrimary, { backgroundColor: skeletonBg }, skeletonAnimStyle]} />
              ) : (
                <>
                  <Text
                    style={[styles.primaryValue, { color: primaryValueColor }]}
                    numberOfLines={1}
                  >
                    {primaryValue}
                  </Text>
                  {primaryUnit && (
                    <Text style={[styles.primaryUnit, { color: primaryUnitColor }]}>
                      {primaryUnit}
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Secondary label + value */}
            {(secondaryLabel || secondaryValue) && (
              <View style={styles.secondaryRow}>
                {secondaryLabel && (
                  <Text style={[styles.secondaryLabel, { color: secondaryLabelColor }]} numberOfLines={1}>
                    {secondaryLabel}
                  </Text>
                )}
                {secondaryValue && (
                  <Text style={[styles.secondaryValue, { color: secondaryValueColor }]} numberOfLines={1}>
                    {secondaryValue}
                  </Text>
                )}
              </View>
            )}

            {/* Tertiary label + value + trend arrow (e.g. Resting HR) */}
            {(tertiaryLabel || tertiaryValue) && (
              <View style={styles.secondaryRow}>
                {tertiaryLabel && (
                  <Text style={[styles.secondaryLabel, { color: secondaryLabelColor }]} numberOfLines={1}>
                    {tertiaryLabel}
                  </Text>
                )}
                {tertiaryValue && (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                    <Text style={[styles.secondaryValue, { color: secondaryValueColor }]} numberOfLines={1}>
                      {tertiaryValue}
                    </Text>
                    {tertiaryTrend && tertiaryTrend !== 'stable' && (
                      <Text style={[
                        styles.secondaryValue,
                        {
                          color: tertiaryTrend === 'up' ? '#EF4444' : '#22C55E',
                          fontSize: 11,
                          fontWeight: '700',
                        },
                      ]}>
                        {tertiaryTrend === 'up' ? '↑' : '↓'}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Sparkline + last-synced badge row */}
            <View style={styles.bottomRow}>
              {lastSyncedAt ? (
                isStale && onSyncPress ? (
                  <Pressable
                    onPress={onSyncPress}
                    style={({ pressed }) => ([
                      styles.syncBadge,
                      { borderColor: '#F59E0B55', backgroundColor: '#F59E0B18', opacity: pressed ? 0.7 : 1 },
                    ])}
                  >
                    <Text style={[styles.syncBadgeText, { color: '#F59E0B' }]}>
                      ⟳ {ds.iceSyncNow ?? 'Sync now'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {showLiveDot && (
                      <LiveDot accent={accentColor} />
                    )}
                    <View style={[styles.syncBadge, { borderColor: accentColor + '33', backgroundColor: accentColor + '11' }]}>
                      <Text style={[styles.syncBadgeText, { color: accentColor }]}>
                        Last: {formatSyncBadge(lastSyncedAt, ds.today ?? 'Today', ds.yesterday ?? 'Yesterday')}
                      </Text>
                    </View>
                  </View>
                )
              ) : (
                <View />
              )}
              {sparklineData && sparklineData.length >= 2 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    if (onSparklinePress) { onSparklinePress(); } else { setSparklineSheetVisible(true); }
                  }}
                  hitSlop={8}
                  accessibilityLabel="View 7-day trend detail"
                  accessibilityRole="button"
                >
                  <SparklineChart
                    data={sparklineData}
                    secondaryData={sparklineSecondaryData}
                    width={fullWidth ? 140 : 80}
                    height={28}
                    strokeColor={accentColor + '55'}
                    accentColor={accentColor}
                    strokeWidth={1.5}
                    higherIsBetter={higherIsBetter}
                    showTrendColor
                  />
                </Pressable>
              )}
            </View>
          </View>
        </LinearGradient>
      </View>
    </AnimatedPressable>
    {sparklineData && sparklineData.length >= 2 && (
      <SparklineDetailSheet
        visible={sparklineSheetVisible}
        onClose={() => setSparklineSheetVisible(false)}
        title={sparklineTitle ?? title}
        unit={sparklineUnit ?? primaryUnit ?? ''}
        accentColor={accentColor}
        data={sparklineData}
        higherIsBetter={higherIsBetter}
      />
    )}
  </>
  );
}

const styles = StyleSheet.create({
  tileWrapper: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  tileFullWidth: {
    flex: 0,
    width: '100%',
  },
  // ── Outer glass shell ──────────────────────────────────────────────────
  glassShell: {
    borderRadius: RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
    minHeight: 168,
    flex: 1,
  },
  // ── Glass body ─────────────────────────────────────────────────────────
  glassBody: {
    flex: 1,
    borderRadius: RADIUS - 1.5,
    overflow: 'hidden',
  },
  // ── Top specular streak ────────────────────────────────────────────────
  specularStreak: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    borderTopLeftRadius: RADIUS - 1.5,
    borderTopRightRadius: RADIUS - 1.5,
  },
  // ── Rim highlights ─────────────────────────────────────────────────────
  rimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderTopLeftRadius: RADIUS - 1.5,
    borderTopRightRadius: RADIUS - 1.5,
  },
  rimLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 1.5,
    borderTopLeftRadius: RADIUS - 1.5,
    borderBottomLeftRadius: RADIUS - 1.5,
  },
  rimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderBottomLeftRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  rimRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 1.5,
    borderTopRightRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  // ── Accent inner glow ──────────────────────────────────────────────────
  accentGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    borderBottomLeftRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  // ── Content ────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillGlow: {
    position: 'absolute',
    top: -6,
    left: -10,
    right: -10,
    bottom: -6,
    borderRadius: 24,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    flex: 1,
  },
  primaryValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 32,
    flexShrink: 1,
  },
  primaryUnit: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 3,
    flexShrink: 0,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 2,
    minHeight: 16,
  },
  secondaryLabel: {
    fontSize: 10,
    fontWeight: '400',
    flexShrink: 1,
  },
  secondaryValue: {
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 0,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  syncBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-end',
  },
  syncBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  skeletonPrimary: {
    height: 32,
    width: '70%',
    borderRadius: 8,
    flex: 1,
  },
  valueDash: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 32,
    color: 'rgba(255,255,255,0.2)',
  },
});
