/**
 * NeoVitalMacroGraph — Full NeonVitals-style animated nutrition breakdown card.
 *
 * Visual DNA matches NeonVitals / NutritionChart:
 *  - #050F19 deep navy canvas with #1E3A4A dashed grid
 *  - Neon glow metric bars with shadow halos
 *  - Animated donut arc ring (Protein / Carbs / Fat split)
 *  - Horizontal macro ratio segmented bar with Gold Zone glow overlay
 *  - Particle layer background
 *  - Pill-shaped toggle chips (Today / 7d / 14d / 30d)
 *  - Pulsing status badge
 *  - Smooth spring card-mount animation
 *
 * Data source: diet log records (SodiumRecord[]) aggregated for today + history.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/core';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing as RNEasing,
  TouchableOpacity,
  Linking,
  Platform,
  Pressable,
} from 'react-native';
import Svg, { Circle, G, Defs, Stop, Rect, Path, LinearGradient as SvgLinearGradient, ClipPath } from 'react-native-svg';
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
import * as Haptics from 'expo-haptics';
import { useFoodCameraStrings, useLang } from '@/hooks';
import { dashboardStrings } from '@/lib/i18n';

const AnimatedView = Reanimated.createAnimatedComponent(View);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── NeonVitals colour tokens ─────────────────────────────────────────────────
// Dark-mode constants (unchanged)
const CANVAS_BG_DARK   = '#050F19';
const GRID_COLOR_DARK  = '#1E3A4A';
const CHIP_BG_DARK     = '#0A1520';
const TEXT_DIM_DARK    = '#475569';
const TEXT_BRIGHT_DARK = '#E2E8F0';
// Light-mode constants
const CANVAS_BG_LIGHT   = '#FFFFFF';
const GRID_COLOR_LIGHT  = '#E2E8F0';
const CHIP_BG_LIGHT     = '#F1F5F9';
const TEXT_DIM_LIGHT    = '#64748B';
const TEXT_BRIGHT_LIGHT = '#0F172A';
// Helpers — call these with isDark flag
function canvasBg(isDark: boolean)   { return isDark ? CANVAS_BG_DARK   : CANVAS_BG_LIGHT; }
function gridColor(isDark: boolean)  { return isDark ? GRID_COLOR_DARK  : GRID_COLOR_LIGHT; }
function chipBg(isDark: boolean)     { return isDark ? CHIP_BG_DARK     : CHIP_BG_LIGHT; }
function textDim(isDark: boolean)    { return isDark ? TEXT_DIM_DARK    : TEXT_DIM_LIGHT; }
function textBright(isDark: boolean) { return isDark ? TEXT_BRIGHT_DARK : TEXT_BRIGHT_LIGHT; }
// Keep backward-compat constants pointing to dark defaults (used in static StyleSheet)
const GRID_COLOR  = GRID_COLOR_DARK;
const _TEXT_DIM    = TEXT_DIM_DARK;
const _TEXT_BRIGHT = TEXT_BRIGHT_DARK;
const EMERALD     = '#00FF9D';

// ─── Nutrient colour palette (matches NutritionChart) ────────────────────────
const C = {
  protein:  '#22C55E',
  carbs:    '#F59E0B',
  fat:      '#3B82F6',
  calories: '#8B5CF6',
  fiber:    '#EAB308',
};

// ─── Donut ring constants ─────────────────────────────────────────────────────
const DONUT_SIZE = 120;
const STROKE     = 10;
const RADIUS     = (DONUT_SIZE - STROKE) / 2;
const CIRCUM     = 2 * Math.PI * RADIUS;

// ─── Particle layer ───────────────────────────────────────────────────────────
const PARTICLE_COUNT = 18;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  xRatio: Math.sin(i * 137.5) * 0.5 + 0.5,
  yRatio: Math.cos(i * 97.3)  * 0.5 + 0.5,
  r: 1 + (i % 3) * 0.6,
  opacity: 0.05 + (i % 5) * 0.025,
  color: ['#00F5FF', '#FF2D78', '#7B61FF', '#00FF9D', '#FFB800'][i % 5],
}));

function ParticleLayer({ width, height, isDark = true }: { width: number; height: number; isDark?: boolean }) {
  if (width === 0) return null;
  // In light mode: use soft indigo tint and halve opacity so dots don't overpower white bg
  const lightColors = ['#6366F1', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B'];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        {PARTICLES.map(p => (
          <Circle
            key={p.id}
            cx={p.xRatio * width}
            cy={p.yRatio * height}
            r={p.r * 2}
            fill={isDark ? p.color : lightColors[p.id % 5]}
            opacity={isDark ? p.opacity : p.opacity * 0.5}
          />
        ))}
      </Svg>
    </View>
  );
}

// ─── Animated donut ring ──────────────────────────────────────────────────────
interface DonutSegment {
  color: string;
  pct: number;
  delay: number;
}

function DonutRing({
  segments,
  centerLabel,
  centerSub,
  isDark = true,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerSub: string;
  isDark?: boolean;
}) {
  // Keep a stable array of Animated.Values in a ref so we never call
  // useRef inside a .map() callback (Rules of Hooks violation).
  const animsRef = useRef<Animated.Value[]>([]);
  while (animsRef.current.length < segments.length) {
    animsRef.current.push(new Animated.Value(0));
  }
  const anims = animsRef.current.slice(0, segments.length);

  useEffect(() => {
    const _key = segments.map(s => s.pct).join(',');
    anims.forEach((anim, i) => {
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(segments[i].delay),
        Animated.timing(anim, {
          toValue: segments[i].pct,
          duration: 950,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.map(s => s.pct).join(',')]);

  let cumPct = 0;
  const segData = segments.map((seg, i) => {
    const rotation = -90 + cumPct * 360;
    cumPct += seg.pct;
    return { ...seg, rotation, anim: anims[i] };
  });

  return (
    <View style={{ width: DONUT_SIZE, height: DONUT_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE} style={{ position: 'absolute' }}>
        {/* Track ring */}
        <Circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={RADIUS}
          stroke={gridColor(isDark)}
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Animated segments */}
        {segData.map((seg, i) => {
          const dashoffset = seg.anim.interpolate({
            inputRange:  [0, 1],
            outputRange: [CIRCUM, CIRCUM * (1 - seg.pct)],
          });
          return (
            <G key={i} rotation={seg.rotation} origin={`${DONUT_SIZE / 2},${DONUT_SIZE / 2}`}>
              <AnimatedCircle
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={RADIUS}
                stroke={seg.color}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={CIRCUM}
                strokeDashoffset={dashoffset}
                strokeLinecap="butt"
              />
            </G>
          );
        })}
      </Svg>
      {/* Center text */}
      <View style={{ alignItems: 'center', width: DONUT_SIZE - STROKE * 2 - 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: textBright(isDark), letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {centerLabel}
        </Text>
        <Text style={{ fontSize: 9, color: textDim(isDark), fontWeight: '600', marginTop: 1, textAlign: 'center' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {centerSub}
        </Text>
      </View>
    </View>
  );
}

// ─── Neon glow bar ────────────────────────────────────────────────────────────
interface GlowBarProps {
  pct: number;
  color: string;
  label: string;
  valueLabel: string;
  targetLabel: string;
  delay?: number;
  phaseOffset?: number; // ms to offset the pulse start for cascade wave
  goldStart?: number;
  goldEnd?: number;
  rawValue?: number;   // numeric value for counter animation
  unit?: string;       // unit suffix e.g. 'kcal', 'g'
  onTap?: () => void;  // navigate to history filtered by this macro
  active?: boolean;    // pause animations when tab is not focused
  isDark?: boolean;    // theme flag for text colors
}

// ─── Shared waveform loop ─────────────────────────────────────────────────────
// A single 30fps loop drives all WaveformBar instances instead of one per bar.
// This cuts JS-thread setState calls from ~300/s (5×60fps) to ~30/s (1×30fps).
// ─────────────────────────────────────────────────────────────────────────────
type WaveformTickFn = (now: number) => void;
const _waveformSubscribers = new Set<WaveformTickFn>();
let _waveformRAF: ReturnType<typeof setInterval> | null = null;
function _startSharedWaveformLoop() {
  if (_waveformRAF !== null) return;
  _waveformRAF = setInterval(() => {
    const now = Date.now();
    _waveformSubscribers.forEach(fn => fn(now));
  }, 33); // ~30 fps
}
function _stopSharedWaveformLoop() {
  if (_waveformRAF !== null) { clearInterval(_waveformRAF); _waveformRAF = null; }
}
function subscribeWaveform(fn: WaveformTickFn): () => void {
  _waveformSubscribers.add(fn);
  _startSharedWaveformLoop();
  return () => {
    _waveformSubscribers.delete(fn);
    if (_waveformSubscribers.size === 0) _stopSharedWaveformLoop();
  };
}
// ─── WaveformBar ──────────────────────────────────────────────────────────────
// Animated SVG sine-wave that scrolls horizontally and pulses in amplitude.
// Clipped to pct * trackWidth to create a "living signal bar" effect.
// Uses the shared 30fps loop (subscribeWaveform) — no per-bar setInterval.
// ─────────────────────────────────────────────────────────────────────────────
function WaveformBar({
  pct,
  color,
  delay = 0,
  phaseOffset = 0,
  isOver = false,
  active = true,
  isDark = true,
}: {
  pct: number;
  color: string;
  delay?: number;
  phaseOffset?: number;
  isOver?: boolean;
  active?: boolean;
  isDark?: boolean;
}) {
  // Logical SVG coordinate space
  const TRACK_W = 240;  // viewBox width (px)
  const TRACK_H = 8;    // viewBox height matches track height
  const FREQ    = 0.018; // cycles per logical pixel
  const WAVE_AMP_MAX = 3.2; // max half-amplitude (fits within 8px track)
  const WAVE_AMP_MIN = 1.2; // min half-amplitude during breath-out
  const SCROLL_PERIOD = 1600; // ms for one full horizontal scroll cycle
  const PULSE_DUR = isOver ? 600 : 1800; // ms per amplitude breath half-cycle

  const fillColor = isOver ? '#EF4444' : color;
  const clampedPct = Math.min(pct, 1);

  // JS-side mutable refs (avoid re-render overhead)
  const fillWidthRef  = useRef(0);
  const ampRef        = useRef(0);
  const animStartRef  = useRef(Date.now());

  const [pathD, setPathD] = useState('');
  const [clipW, setClipW] = useState(0);

  // Reset animation start when key inputs change
  useEffect(() => {
    animStartRef.current = Date.now();
    fillWidthRef.current = 0;
    ampRef.current = 0;
    setPathD('');
    setClipW(0);
   
  }, [pct, delay, phaseOffset, isOver]);

  const tickFn = useCallback((now: number) => {
    if (!active) return;
    const elapsed = now - animStartRef.current;
    const fillTarget = clampedPct * TRACK_W;
    const fillDuration = 900;
    const ampDelay = delay + 950 + phaseOffset;

    // ── 1. Fill width ──
    const fillProgress = Math.min((elapsed - delay) / fillDuration, 1);
    const fillEased = fillProgress > 0 ? 1 - Math.pow(1 - fillProgress, 2) : 0;
    fillWidthRef.current = fillEased * fillTarget;

    // ── 2. Amplitude ──
    const ampElapsed = elapsed - ampDelay;
    if (ampElapsed < 0) {
      ampRef.current = 0;
    } else if (ampElapsed < fillDuration) {
      ampRef.current = Math.min(ampElapsed / fillDuration, 1) * WAVE_AMP_MAX;
    } else {
      const breathElapsed = ampElapsed - fillDuration;
      const breathPhase = (breathElapsed % (PULSE_DUR * 2)) / (PULSE_DUR * 2);
      const sineVal = Math.sin(breathPhase * Math.PI * 2 - Math.PI / 2);
      const normalised = (sineVal + 1) / 2;
      ampRef.current = WAVE_AMP_MIN + normalised * (WAVE_AMP_MAX - WAVE_AMP_MIN);
    }

    // ── 3. Scrolling phase ──
    const scrollPhase = ((elapsed % SCROLL_PERIOD) / SCROLL_PERIOD) * Math.PI * 2;

    // ── 4. Build SVG path ──
    const midY = TRACK_H / 2;
    const amp  = ampRef.current;
    const fw   = fillWidthRef.current;

    if (fw < 1) { setPathD(''); setClipW(0); return; }

    let d = `M 0 ${midY.toFixed(2)}`;
    for (let x = 0; x <= TRACK_W; x += 4) { // step 4 (was 2) — halves path points
      const y = midY - amp * Math.sin(x * FREQ * Math.PI * 2 - scrollPhase + phaseOffset * 0.002);
      d += ` L ${x} ${y.toFixed(2)}`;
    }
    d += ` L ${TRACK_W} ${TRACK_H} L 0 ${TRACK_H} Z`;
    setPathD(d);
    setClipW(fw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, clampedPct, delay, phaseOffset, isOver]);

  useEffect(() => {
    if (!active) return;
    return subscribeWaveform(tickFn);
  }, [active, tickFn]);

  // Unique IDs per bar to avoid SVG def collisions
  const gradId = `wg_${color.replace('#', '')}_${phaseOffset}`;
  const clipId = `wc_${color.replace('#', '')}_${phaseOffset}`;

  return (
    <View style={{ flex: 1, height: TRACK_H, borderRadius: 4, overflow: 'hidden', backgroundColor: GRID_COLOR }}>
      <Svg
        width="100%"
        height={TRACK_H}
        viewBox={`0 0 ${TRACK_W} ${TRACK_H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Vertical gradient: bright at wave crest, fade to transparent at trough */}
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity="0.9" />
            <Stop offset="0.45" stopColor={fillColor} stopOpacity="0.5" />
            <Stop offset="1" stopColor={fillColor} stopOpacity={isDark ? '0.1' : '0.25'} />
          </SvgLinearGradient>
          {/* Clip rect: width = animated fill width */}
          <ClipPath id={clipId}>
            <Rect x="0" y="0" width={clipW} height={TRACK_H} />
          </ClipPath>
        </Defs>
        {/* Filled wave body */}
        {pathD ? (
          <Path
            d={pathD}
            fill={`url(#${gradId})`}
            clipPath={`url(#${clipId})`}
          />
        ) : null}
        {/* Bright stroke on the wave crest */}
        {pathD ? (
          <Path
            d={pathD.split(' L ').slice(0, -2).join(' L ')}
            fill="none"
            stroke={fillColor}
            strokeWidth="1"
            clipPath={`url(#${clipId})`}
            opacity={0.95}
          />
        ) : null}
      </Svg>
    </View>
  );
}

function GlowBar({ pct, color, label, valueLabel, targetLabel, delay = 0, phaseOffset = 0, goldStart, goldEnd, rawValue, unit, onTap, active = true, isDark = true }: GlowBarProps) {
  const counterAnim  = useSharedValue(0);
  const [displayVal, setDisplayVal] = useState('0');

  const isOver = pct > 1;
  const fillColor = isOver ? '#EF4444' : color;

  useEffect(() => {
    // Counter animation
    if (rawValue !== undefined) {
      counterAnim.value = 0;
      counterAnim.value = withDelay(
        delay,
        withTiming(rawValue, { duration: 900, easing: Easing.out(Easing.quad) }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue]);

  // Drive the counter display via a JS-side interval synced to the animation
  useEffect(() => {
    if (rawValue === undefined) return;
    const start = Date.now();
    const duration = 900 + delay;
    const target = rawValue;
    const isFloat = unit === 'g' && target % 1 !== 0;
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2); // ease-out-quad
      const current = eased * target;
      setDisplayVal(isFloat ? current.toFixed(1) : String(Math.round(current)));
      if (progress >= 1) clearInterval(timer);
    }, 33); // 30fps — no need for 60fps on a counter
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue]);

  const computedValueLabel = rawValue !== undefined
    ? (unit === 'kcal' ? `${displayVal} kcal` : `${displayVal}${unit ?? ''}`)
    : valueLabel;

  return (
    <View style={s.barRow}>
      {/* Label */}
      <View style={s.barLabelCol}>
        <View style={[s.barDot, { backgroundColor: fillColor, shadowColor: fillColor, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }]} />
        <Text style={[s.barLabel, { color: isOver ? '#EF4444' : textDim(isDark) }]}>{label}</Text>
      </View>
      {/* Waveform track */}
      <View style={s.barTrack}>
        {/* Animated SVG waveform fill (bottom layer) */}
        <WaveformBar
          pct={pct}
          color={color}
          delay={delay}
          phaseOffset={phaseOffset}
          isOver={isOver}
          active={active}
          isDark={isDark}
        />
        {/* Gold Zone overlay (absolute, rendered above waveform) */}
        {goldStart != null && goldEnd != null && (
          <View
            style={[
              s.goldZone,
              {
                left: `${goldStart * 100}%` as any,
                width: `${(goldEnd - goldStart) * 100}%` as any,
                backgroundColor: fillColor + '22',
                borderColor: fillColor + '55',
              },
            ]}
            pointerEvents="none"
          />
        )}
      </View>
      {/* Value */}
      <View style={s.barMeta}>
        <Text style={[s.barValue, { color: isOver ? '#EF4444' : color }]}>{computedValueLabel}</Text>
        <Text style={[s.barTarget, { color: textDim(isDark) }]}>{targetLabel}</Text>
      </View>
    </View>
  );
}

// ─── Macro ratio segmented bar ────────────────────────────────────────────────
function MacroRatioBar({
  proteinPct,
  carbsPct,
  fatPct,
  isDark = true,
  labels = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' },
}: {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  isDark?: boolean;
  labels?: { protein: string; carbs: string; fat: string };
}) {
  const pAnim = useSharedValue(0);
  const cAnim = useSharedValue(0);
  const fAnim = useSharedValue(0);

  useEffect(() => {
    pAnim.value = withDelay(100, withTiming(proteinPct, { duration: 850, easing: Easing.out(Easing.quad) }));
    cAnim.value = withDelay(200, withTiming(carbsPct,   { duration: 850, easing: Easing.out(Easing.quad) }));
    fAnim.value = withDelay(300, withTiming(fatPct,     { duration: 850, easing: Easing.out(Easing.quad) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proteinPct, carbsPct, fatPct]);

  const pStyle = useAnimatedStyle(() => ({ flex: pAnim.value }), [pAnim]);
  const cStyle = useAnimatedStyle(() => ({ flex: cAnim.value }), [cAnim]);
  const fStyle = useAnimatedStyle(() => ({ flex: fAnim.value }), [fAnim]);

  // AMDR Gold Zone: Carbs 45–65%, Protein 15–25%, Fat 20–35%
  const goldZoneActive =
    carbsPct >= 0.45 && carbsPct <= 0.65 &&
    proteinPct >= 0.15 && proteinPct <= 0.25 &&
    fatPct >= 0.20 && fatPct <= 0.35;

  return (
    <View style={{ marginTop: 14, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: textDim(isDark), letterSpacing: 0.8, textTransform: 'uppercase' }}>Macro Ratio</Text>
        {goldZoneActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: EMERALD + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 0.5, borderColor: EMERALD + '55' }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: EMERALD }} />
            <Text style={{ fontSize: 9, fontWeight: '700', color: EMERALD }}>Gold Zone</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 5, overflow: 'hidden', backgroundColor: gridColor(isDark) }}>
        <AnimatedView style={[{ height: '100%', backgroundColor: C.protein, shadowColor: C.protein, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }, pStyle]} />
        <AnimatedView style={[{ height: '100%', backgroundColor: C.carbs,   shadowColor: C.carbs,   shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }, cStyle]} />
        <AnimatedView style={[{ height: '100%', backgroundColor: C.fat,     shadowColor: C.fat,     shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }, fStyle]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
        {[
          { label: labels.protein, pct: proteinPct, color: C.protein },
          { label: labels.carbs,   pct: carbsPct,   color: C.carbs },
          { label: labels.fat,     pct: fatPct,      color: C.fat },
        ].map(m => (
          <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.color }} />
            <Text style={{ fontSize: 9, color: textDim(isDark), fontWeight: '600' }}>
              {m.label} {Math.round(m.pct * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Pulsing badge ────────────────────────────────────────────────────────────
function PulsingBadge({ label, color, isDark = true }: { label: string; color: string; isDark?: boolean }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,  { duration: 750, easing: Easing.inOut(Easing.sin) }),
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
    <AnimatedView style={[s.badge, badgeStyle, { backgroundColor: color + (isDark ? '22' : '33'), borderColor: color + (isDark ? '55' : '88') }]}>
      <View style={[s.badgeDot, { backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }]} />
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </AnimatedView>
  );
}

// ─── Window toggle ────────────────────────────────────────────────────────────
type Window = 'today' | '7d' | '14d' | '30d';
const WINDOW_KEYS: Window[] = ['today', '7d', '14d', '30d'];

function WindowToggle({ window: win, onChange, isDark = true }: { window: Window; onChange: (w: Window) => void; isDark?: boolean }) {
  const activeTabBg = isDark ? '#1E3A4A' : '#E0E7FF';
  const lang = useLang();
  const ds = (dashboardStrings as unknown as Record<string, typeof dashboardStrings.en>)[lang] ?? dashboardStrings.en;
  const WINDOWS: { key: Window; label: string }[] = [
    { key: 'today', label: ds.winToday ?? 'Today' },
    { key: '7d',    label: '7d' },
    { key: '14d',   label: '14d' },
    { key: '30d',   label: '30d' },
  ];
  return (
    <View style={[s.toggleRow, { backgroundColor: chipBg(isDark), borderColor: gridColor(isDark) }]}>
      {WINDOWS.map(opt => {
        const active = win === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(opt.key);
            }}
            style={[
              s.toggleTab,
              active && { backgroundColor: activeTabBg, borderColor: C.calories + '80', borderWidth: 1 },
            ]}
            activeOpacity={0.75}
          >
            <Text style={[
              s.toggleLabel,
              { color: active ? textBright(isDark) : textDim(isDark) },
              active && { fontWeight: '700' },
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export interface MacroGraphData {
  carbsG:       number;
  fiberG:       number;
  proteinG:     number;
  fatG:         number;
  caloriesKcal: number;
  weightKg:     number | null;
}

interface BestDayInfo {
  dateLabel: string;
  score: number;
}

interface NeoVitalMacroGraphProps {
  todayData:   MacroGraphData;
  weekData:    MacroGraphData;   // 7-day daily average
  data14d?:    MacroGraphData;   // 14-day daily average
  data30d?:    MacroGraphData;   // 30-day daily average
  bestDay7d?:  BestDayInfo;
  bestDay14d?: BestDayInfo;
  bestDay30d?: BestDayInfo;
  isDark:      boolean;
  /** Called when user taps a Log Meal action. mode: 'plate' | 'search' */
  onLogMeal?: (mode: 'plate' | 'search') => void;
  /** Number of meals logged today — shown as a badge on the header when collapsed */
  mealCount?: number;
  /** Daily fiber goal in grams. Defaults to 25 g (WHO recommendation) when not provided. */
  fiberGoal?: number;
  /** Called when user taps the fiber ring in the header to open the fiber goal editor. */
  onFiberGoalEdit?: () => void;
  /** Macro goals — calories (kcal), protein/carbs/fat/fiber (g). Persisted by parent via onGoalsChange. */
  macroGoals?: { calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number };
  /** Called when user adjusts a goal via the inline stepper. Parent should persist to AsyncStorage. */
  onGoalsChange?: (goals: { calories: number; protein: number; carbs: number; fat: number; fiber: number }) => void;
  /** When false, forces the card collapsed (Collapse All). When true, forces it expanded. */
  overrideExpanded?: boolean;
}

export function NeoVitalMacroGraph({ todayData, weekData, data14d, data30d, bestDay7d, bestDay14d, bestDay30d, isDark, onLogMeal, mealCount, fiberGoal, onFiberGoalEdit, macroGoals, onGoalsChange, overrideExpanded }: NeoVitalMacroGraphProps) {
  const isFocused = useIsFocused();
  const fc = useFoodCameraStrings();
  const lang = useLang();
  const ds = (dashboardStrings as unknown as Record<string, typeof dashboardStrings.en>)[lang] ?? dashboardStrings.en;
  const [win, setWin] = useState<Window>('7d');
  const [cardWidth, setCardWidth] = useState(0);
  // Collapse state — persisted to AsyncStorage
  const MACRO_COLLAPSE_KEY = '@neovital:macro_collapsed_v1';
  const [localCollapsed, setLocalCollapsed] = useState(true); // default collapsed to reduce initial scroll depth

  useEffect(() => {
    AsyncStorage.getItem(MACRO_COLLAPSE_KEY).then(v => {
      if (v !== null) setLocalCollapsed(v === 'true');
    }).catch(() => {});
  }, []);

  // overrideExpanded=false forces collapsed; overrideExpanded=true forces expanded
  const prevOverrideRef = React.useRef<boolean | undefined>(overrideExpanded);
  useEffect(() => {
    if (overrideExpanded === prevOverrideRef.current) return;
    prevOverrideRef.current = overrideExpanded;
    if (overrideExpanded === false) setLocalCollapsed(true);
    else if (overrideExpanded === true) setLocalCollapsed(false);
  }, [overrideExpanded]);
  const collapsed = localCollapsed;

  const toggleCollapsed = () => {
    setLocalCollapsed(prev => {
      const next = !prev;
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      safeSetItem(MACRO_COLLAPSE_KEY, String(next)).catch(() => {});
      return next;
    });
  };

  // Per-window Best Day dismiss state — persisted to AsyncStorage
  const BEST_DAY_DISMISS_KEY = '@neovital:bestday_dismissed_v1';
  const [dismissedWindows, setDismissedWindows] = useState<Record<string, boolean>>({});

  // Hydrate dismissed state on mount
  useEffect(() => {
    AsyncStorage.getItem(BEST_DAY_DISMISS_KEY).then(v => {
      if (v) setDismissedWindows(JSON.parse(v));
    }).catch(() => {});
   
  }, []);

  const dismissBestDay = (window: string) => {
    setDismissedWindows(prev => {
      const next = { ...prev, [window]: true };
      safeSetItem(BEST_DAY_DISMISS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const activeData: MacroGraphData = (() => {
    if (win === 'today') return todayData;
    if (win === '7d')    return weekData;
    if (win === '14d')   return data14d ?? weekData;
    return data30d ?? weekData;
  })();

  const { carbsG, fiberG, proteinG, fatG, caloriesKcal } = activeData;
  const hasData = carbsG > 0 || proteinG > 0 || fatG > 0 || caloriesKcal > 0;

  // ── Card mount animation ───────────────────────────────────────────────────
  const cardOpacity    = useSharedValue(0);
  const cardTranslateY = useSharedValue(24);

  useEffect(() => {
    cardOpacity.value    = withDelay(80, withTiming(1, { duration: 450 }));
    cardTranslateY.value = withDelay(80, withSpring(0, { damping: 16, stiffness: 120 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity:   cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }), [cardOpacity, cardTranslateY]);

  // ── Reference targets (editable via inline stepper) ──────────────────────────
  const calTarget   = macroGoals?.calories ?? 2000;
  const carbTarget  = macroGoals?.carbs    ?? 300;
  const protTarget  = macroGoals?.protein  ?? 150;
  const fatTarget   = macroGoals?.fat      ?? 65;
  const fiberTarget = macroGoals?.fiber ?? ((fiberGoal != null && fiberGoal > 0) ? fiberGoal : 25);

  // ── Inline stepper state ──────────────────────────────────────────────────────
  type EditableMacro = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
  const [editingMacro, setEditingMacro] = useState<EditableMacro | null>(null);

  const currentGoals = { calories: calTarget, protein: protTarget, carbs: carbTarget, fat: fatTarget, fiber: fiberTarget };

  const adjustGoal = (macro: EditableMacro, delta: number) => {
    const step = macro === 'calories' ? 50 : 5;
    const min  = macro === 'calories' ? 500 : 5;
    const max  = macro === 'calories' ? 5000 : 500;
    const next = Math.max(min, Math.min(max, currentGoals[macro] + delta * step));
    const updated = { ...currentGoals, [macro]: next };
    onGoalsChange?.(updated);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const macroKcal = proteinG * 4 + carbsG * 4 + fatG * 9;
  const safeMacro = macroKcal > 0 ? macroKcal : 1;
  const donutSegments: DonutSegment[] = [
    { color: C.protein, pct: (proteinG * 4) / safeMacro, delay: 100 },
    { color: C.carbs,   pct: (carbsG * 4)   / safeMacro, delay: 220 },
    { color: C.fat,     pct: (fatG * 9)      / safeMacro, delay: 340 },
  ];

  // ── Macro ratio bar ────────────────────────────────────────────────────────
  const proteinPct = (proteinG * 4) / safeMacro;
  const carbsPct   = (carbsG * 4)   / safeMacro;
  const fatPct     = (fatG * 9)     / safeMacro;

  // ── Score ──────────────────────────────────────────────────────────────────
  const score = hasData
    ? Math.round(
        ((Math.min(caloriesKcal / calTarget, 1) * 0.25) +
         (Math.min(proteinG / protTarget, 1)    * 0.30) +
         (Math.min(fiberG / fiberTarget, 1)     * 0.25) +
         (Math.min(fatG / fatTarget, 1)         * 0.20)) * 100,
      )
    : 0;

  const scoreColor = score >= 70 ? C.protein : score >= 40 ? C.carbs : '#94A3B8';

  const centerSub = win === 'today' ? ds.kcalToday : ds.kcalDayAvg.replace('{win}', win);

  const winLabel: Record<Window, string> = {
    today: ds.winToday,
    '7d':  ds.win7d,
    '14d': ds.win14d,
    '30d': ds.win30d,
  };

  // Best Day for the active window
  const activeBestDay: BestDayInfo | undefined = (() => {
    if (win === '7d')  return bestDay7d;
    if (win === '14d') return bestDay14d;
    if (win === '30d') return bestDay30d;
    return undefined;
  })();

  return (
    <AnimatedView
      style={[s.card, cardStyle, {
        marginTop: 4,
        borderColor: isDark ? 'rgba(0,245,255,0.22)' : 'rgba(99,102,241,0.25)',
        shadowColor: isDark ? '#00F5FF' : '#6366F1',
        shadowOpacity: isDark ? 0.22 : 0.12,
      }]}
      onLayout={e => setCardWidth(e.nativeEvent.layout.width)}
    >
      {/* ── NeonVitals deep navy canvas ─────────────────────────────────────── */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: canvasBg(isDark), borderRadius: 20 }]} />
      {/* Particle layer */}
      <ParticleLayer width={cardWidth} height={300} isDark={isDark} />
      {/* ── Glass rim: top specular highlight ──────────────────────────────── */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]} pointerEvents="none">
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(0,245,255,0.35)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
        <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(0,245,255,0.20)', borderTopLeftRadius: 20, borderBottomLeftRadius: 20 }} />
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(0,0,0,0.55)', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }} />
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.40)', borderTopRightRadius: 20, borderBottomRightRadius: 20 }} />
      </View>

          {/* ── Header ────────────────────────────────────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggleCollapsed}
        accessibilityLabel={collapsed ? (ds.expandNutritionA11y ?? 'Expand Nutrition Breakdown') : (ds.collapseNutritionA11y ?? 'Collapse Nutrition Breakdown')}
      >
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={[s.iconBadge, { backgroundColor: C.calories + '22', borderColor: C.calories + '44', borderWidth: 1 }]}>
              <Text style={{ fontSize: 15 }}>📊</Text>
            </View>
            <View>
              <Text style={[s.cardTitle, { color: textBright(isDark) }]}>{ds.nutritionBreakdown}</Text>
              <Text style={[s.cardSub, { color: textDim(isDark) }]}>{winLabel[win]} · {ds.evidenceBasedLabel ?? 'Evidence-Based'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* ── Meals badge + Partial badge stacked vertically ─────────────────────────────────── */}
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {collapsed && mealCount != null && mealCount > 0 && (
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                  backgroundColor: '#8B5CF620', borderWidth: 1, borderColor: '#8B5CF644',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#8B5CF6' }}>
                    {mealCount} {mealCount === 1 ? 'meal' : 'meals'} today
                  </Text>
                </View>
              )}
              {hasData && (
                <PulsingBadge
                  label={score >= 70 ? ds.onTrack : score >= 40 ? ds.partial : ds.logMore}
                  color={scoreColor}
                  isDark={isDark}
                />
              )}
            </View>
            {/* ── Fiber progress ring (tap to edit goal) ──────────────────────────────────────────── */}
            {hasData && (() => {
              const fiberPct = Math.min(fiberG / fiberTarget, 1);
              const RING_SIZE = 36;
              const RING_STROKE = 3;
              const RING_R = (RING_SIZE - RING_STROKE) / 2;
              const RING_CIRCUM = 2 * Math.PI * RING_R;
              const dashoffset = RING_CIRCUM * (1 - fiberPct);
              return (
                <Pressable
                  onPress={onFiberGoalEdit ? () => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onFiberGoalEdit();
                  } : undefined}
                  style={({ pressed }) => ([
                    { alignItems: 'center', justifyContent: 'center', width: RING_SIZE + 8, height: RING_SIZE + 8, borderRadius: (RING_SIZE + 8) / 2 },
                    pressed && { opacity: 0.7 },
                  ])}
                  accessibilityLabel={`Fiber: ${Math.round(fiberPct * 100)}% of ${fiberTarget}g goal. Tap to edit fiber goal.`}
                  accessibilityRole="button"
                >
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: RING_SIZE, height: RING_SIZE }}>
                    <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
                      <Circle
                        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                        stroke={isDark ? '#334155' : '#E2E8F0'}
                        strokeWidth={RING_STROKE} fill="none"
                      />
                      <Circle
                        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                        stroke={C.fiber}
                        strokeWidth={RING_STROKE} fill="none"
                        strokeDasharray={RING_CIRCUM}
                        strokeDashoffset={dashoffset}
                        strokeLinecap="round"
                        rotation={-90}
                        origin={`${RING_SIZE / 2},${RING_SIZE / 2}`}
                      />
                    </Svg>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: C.fiber, lineHeight: 10 }}>
                      {Math.round(fiberPct * 100)}%
                    </Text>
                  </View>
                  {onFiberGoalEdit && (
                    <Text style={{ fontSize: 7, color: C.fiber + 'AA', marginTop: 1, fontWeight: '600' }}>goal</Text>
                  )}
                </Pressable>
              );
            })()}
            <Text style={{ fontSize: 14, color: textDim(isDark), marginRight: 4 }}>
              {collapsed ? '▸' : '▾'}
            </Text>
          </View>
        </View>
       </TouchableOpacity>

      {/* ── Collapsed quick-action row ─────────────────────────────────────── */}
      {collapsed && onLogMeal && (
        <View style={[logMealS.row, { marginTop: 10, marginBottom: 4 }]}>
          <Pressable
            style={({ pressed }) => [logMealS.btn, {
              backgroundColor: isDark ? '#00FF9D14' : '#D1FAE5',
              borderColor: isDark ? '#00FF9D44' : '#6EE7B7',
            }, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLogMeal('plate');
            }}
            accessibilityLabel={ds.scanMeal ?? 'Scan meal with camera'}
            accessibilityRole="button"
          >
            <Text style={logMealS.btnIcon}>📷</Text>
            <Text style={[logMealS.btnLabel, { color: EMERALD }]}>{ds.scanMeal}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [logMealS.btn, {
              backgroundColor: isDark ? '#8B5CF614' : '#EDE9FE',
              borderColor: isDark ? '#8B5CF644' : '#C4B5FD',
            }, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLogMeal('search');
            }}
            accessibilityLabel={ds.searchFood ?? 'Search food to log'}
            accessibilityRole="button"
          >
            <Text style={logMealS.btnIcon}>🔍</Text>
            <Text style={[logMealS.btnLabel, { color: C.calories }]}>{ds.searchFood}</Text>
          </Pressable>
        </View>
      )}

      {!collapsed && (
        <React.Fragment>
      {/* ── Log Meal action row ───────────────────────────────────────────── */}
      {onLogMeal && (
        <View style={logMealS.row}>
          {/* Camera / Plate scan */}
          <Pressable
            style={({ pressed }) => [logMealS.btn, {
              backgroundColor: isDark ? '#00FF9D14' : '#D1FAE5',
              borderColor: isDark ? '#00FF9D44' : '#6EE7B7',
            }, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLogMeal('plate');
            }}
          >
            <Text style={logMealS.btnIcon}>📷</Text>
            <Text style={[logMealS.btnLabel, { color: EMERALD }]}>{ds.scanMeal}</Text>
          </Pressable>

          {/* Text search */}
          <Pressable
            style={({ pressed }) => [logMealS.btn, {
              backgroundColor: isDark ? '#8B5CF614' : '#EDE9FE',
              borderColor: isDark ? '#8B5CF644' : '#C4B5FD',
            }, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLogMeal('search');
            }}
          >
            <Text style={logMealS.btnIcon}>🔍</Text>
            <Text style={[logMealS.btnLabel, { color: C.calories }]}>{ds.searchFood}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Window toggle ───────────────────────────────────────────────────── */}
      <WindowToggle window={win} onChange={setWin} isDark={isDark} />

      {!hasData ? (
        <View style={s.emptyRow}>
          <Text style={{ fontSize: 22 }}>🥗</Text>
          <Text style={[s.emptyText, { color: textDim(isDark) }]}>
            {win === 'today'
              ? ds.logMealToday
              : win === '7d' ? ds.logMeals7d
              : win === '14d' ? ds.logMeals14d
              : ds.logMeals30d}
          </Text>
        </View>
      ) : (
        <>
          {/* ── Donut + legend row ──────────────────────────────────────────── */}
          <View style={s.donutRow}>
            <DonutRing
              segments={donutSegments}
              centerLabel={`${Math.round(caloriesKcal)}`}
              centerSub={centerSub}
              isDark={isDark}
              />
            <View style={s.legend}>
              {[
                { color: C.protein,  label: fc.protein,  value: `${Math.round(proteinG)}g` },
                { color: C.carbs,    label: fc.carbs,    value: `${Math.round(carbsG)}g` },
                { color: C.fat,      label: fc.fat,      value: `${Math.round(fatG)}g` },
                { color: C.fiber,    label: fc.fiber,    value: `${fiberG.toFixed(1)}g` },
              ].map(item => (
                <View key={item.label} style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: item.color, shadowColor: item.color, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }]} />
                  <Text style={[s.legendLabel, { color: textDim(isDark) }]}>{item.label}</Text>
                  <Text style={[s.legendValue, { color: item.color }]}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Macro ratio segmented bar ────────────────────────────────────── */}
          <MacroRatioBar proteinPct={proteinPct} carbsPct={carbsPct} fatPct={fatPct} isDark={isDark}
              />

          {/* ── Divider ─────────────────────────────────────────────────────── */}
          <View style={[s.divider, { backgroundColor: gridColor(isDark) }]} />

          {/* ── Best Day annotation ──────────────────────────────────────────── */}
          {activeBestDay && activeBestDay.score > 0 && !dismissedWindows[win] && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: EMERALD + '12',
              borderWidth: 0.5,
              borderColor: EMERALD + '50',
            }}>
              <Text style={{ fontSize: 14 }}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: EMERALD, letterSpacing: 0.2 }}>
                  Best Day — {activeBestDay.dateLabel}
                </Text>
                <Text style={{ fontSize: 10, color: textDim(isDark), marginTop: 1 }}>
                  Alignment score {activeBestDay.score}/100 · highest in this window
                </Text>
              </View>
              <View style={{
                backgroundColor: EMERALD + '22',
                borderRadius: 8,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderWidth: 0.5,
                borderColor: EMERALD + '55',
              }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: EMERALD }}>{activeBestDay.score}</Text>
              </View>
              {/* Dismiss button */}
              <TouchableOpacity
                onPress={() => dismissBestDay(win)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={ds.dismissBestDayA11y ?? 'Dismiss Best Day callout'}
              >
                <Text style={{ fontSize: 14, color: textDim(isDark), lineHeight: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Inline goal stepper — shown above bars when a bar is tapped ── */}
          {editingMacro && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              paddingHorizontal: 4,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              borderWidth: 0.5,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
            }}>
              <Text style={{ fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', flex: 1, paddingLeft: 8 }}>
                {editingMacro.charAt(0).toUpperCase() + editingMacro.slice(1)} goal
              </Text>
              <TouchableOpacity
                onPress={() => adjustGoal(editingMacro, -1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 18, color: isDark ? '#E5E7EB' : '#374151', fontWeight: '600', lineHeight: 22 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#F3F4F6' : '#111827', minWidth: 64, textAlign: 'center' }}>
                {currentGoals[editingMacro]}{editingMacro === 'calories' ? ' kcal' : 'g'}
              </Text>
              <TouchableOpacity
                onPress={() => adjustGoal(editingMacro, +1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 18, color: isDark ? '#E5E7EB' : '#374151', fontWeight: '600', lineHeight: 22 }}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditingMacro(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ paddingHorizontal: 10 }}
              >
                <Text style={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' }}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* ── Animated neon glow bars ──────────────────────────────────────── */}
          <View style={s.barsSection}>
            <GlowBar
              pct={caloriesKcal / calTarget}
              color={C.calories}
              label={fc.calories}
              valueLabel={`${Math.round(caloriesKcal)} kcal`}
              targetLabel={`${calTarget} kcal`}
              delay={80}
              phaseOffset={0}
              goldStart={0.7}
              goldEnd={1.0}
              rawValue={Math.round(caloriesKcal)}
              unit="kcal"
              active={isFocused}
              isDark={isDark}
              onTap={() => { setEditingMacro(m => m === 'calories' ? null : 'calories'); }}
            />
            <GlowBar
              pct={proteinG / protTarget}
              color={C.protein}
              label={fc.protein}
              valueLabel={`${Math.round(proteinG)}g`}
              targetLabel={`${protTarget}g`}
              delay={160}
              phaseOffset={300}
              goldStart={0.6}
              goldEnd={1.0}
              rawValue={Math.round(proteinG)}
              unit="g"
              active={isFocused}
              isDark={isDark}
              onTap={() => { setEditingMacro(m => m === 'protein' ? null : 'protein'); }}
            />
            <GlowBar
              pct={carbsG / carbTarget}
              color={C.carbs}
              label={fc.carbs}
              valueLabel={`${Math.round(carbsG)}g`}
              targetLabel={`≤${carbTarget}g`}
              delay={240}
              phaseOffset={600}
              rawValue={Math.round(carbsG)}
              unit="g"
              active={isFocused}
              isDark={isDark}
              onTap={() => { setEditingMacro(m => m === 'carbs' ? null : 'carbs'); }}
            />
            <GlowBar
              pct={fatG / fatTarget}
              color={C.fat}
              label={fc.fat}
              valueLabel={`${Math.round(fatG)}g`}
              targetLabel={`≤${fatTarget}g`}
              delay={320}
              phaseOffset={900}
              rawValue={Math.round(fatG)}
              unit="g"
              active={isFocused}
              isDark={isDark}
              onTap={() => { setEditingMacro(m => m === 'fat' ? null : 'fat'); }}
            />
            <GlowBar
              pct={fiberG / fiberTarget}
              color={C.fiber}
              label={fc.fiber}
              valueLabel={`${fiberG.toFixed(1)}g`}
              targetLabel={`${fiberTarget}g`}
              delay={400}
              phaseOffset={1200}
              goldStart={0.6}
              goldEnd={1.0}
              rawValue={fiberG}
              unit="g"
              active={isFocused}
              isDark={isDark}
              onTap={() => { setEditingMacro(m => m === 'fiber' ? null : 'fiber'); }}
            />
          </View>

          {/* ── ADA Carb Quality section ──────────────────────────────────── */}
          <ADACarQualityPanel carbsG={carbsG} fiberG={fiberG} isDark={isDark} ds={ds} />
        </>
      )}
        </React.Fragment>
      )}
    </AnimatedView>
  );
}

// ─── ADA Carb Quality Panel ───────────────────────────────────────────────────
// Source: Maghoul A et al. "Dietary carbohydrate quality index and cardio-metabolic
// risk factors." Int J Vitam Nutr Res. 2024 Jun;94(5-6):377-393.
// DOI: 10.1024/0300-9831/a000794  |  PMID: 38009678
// Systematic review & meta-analysis of 11 studies (n=63,962 subjects).
const CQI_META_URL = 'https://pubmed.ncbi.nlm.nih.gov/38009678/';

function ADACarQualityPanel({ carbsG, fiberG, isDark = true, ds }: { carbsG: number; fiberG: number; isDark?: boolean; ds: typeof dashboardStrings.en }) {
  // Fiber-to-carb ratio: ADA recommends fibre-rich, minimally-processed carbs.
  // ≥ 10 g fiber per 100 g carbs = "Whole / High Quality"
  // 5–10 g fiber per 100 g carbs = fc.minimallyProcessed
  // < 5 g fiber per 100 g carbs  = "Refined / Low Quality"
  const ratio = carbsG > 0 ? (fiberG / carbsG) * 100 : 0;

  type QualityTier = 'whole' | 'minimal' | 'refined' | 'no-data';
  const tier: QualityTier = carbsG < 1 ? 'no-data' : ratio >= 10 ? 'whole' : ratio >= 5 ? 'minimal' : 'refined';

  const tierConfig: Record<QualityTier, { label: string; color: string; icon: string; desc: string }> = {
    whole:    { label: ds.carbQualityIndex,          color: '#00FF9D', icon: '🥦', desc: ds.richInFiber },
    minimal:  { label: ds.carbQualityIndex,          color: '#F59E0B', icon: '🌾', desc: ds.moderateFiber },
    refined:  { label: ds.refinedLowQuality,         color: '#EF4444', icon: '⚠️', desc: ds.lowFiberADA },
    'no-data': { label: ds.noDataLogged,             color: '#475569', icon: '📋', desc: ds.logMealsToSee },
  };

  const cfg = tierConfig[tier];

  // Three ADA carb quality metrics
  const metrics = [
    {
      label: ds.fiberToCarbRatio ?? 'Fiber-to-Carb Ratio',
      value: carbsG > 0 ? `${ratio.toFixed(1)}%` : '—',
      target: '≥ 10%',
      color: ratio >= 10 ? '#00FF9D' : ratio >= 5 ? '#F59E0B' : '#EF4444',
      desc: ds.gFiberPer100gCarbs,
    },
    {
      label: ds.dietaryFiber ?? 'Dietary Fiber',
      value: fiberG > 0 ? `${fiberG.toFixed(1)}g` : '—',
      target: '≥ 25g/day',
      color: fiberG >= 25 ? '#00FF9D' : fiberG >= 15 ? '#F59E0B' : '#EF4444',
      desc: ds.adaChooseFiber,
    },
    {
      label: ds.totalCarbs ?? 'Total Carbs',
      value: carbsG > 0 ? `${Math.round(carbsG)}g` : '—',
      target: '≤ 300g/day',
      color: carbsG <= 300 ? '#00FF9D' : '#EF4444',
      desc: ds.balanceWithProtein,
    },
  ];

  const adaBorder = isDark ? '#1E3A4A' : '#E2E8F0';
  const adaSourceBg = isDark ? '#0A1F3A' : '#F1F5F9';
  const adaSourceBorder = isDark ? '#1E4A7A' : '#CBD5E1';
  const adaSourceText = isDark ? '#60A5FA' : '#2563EB';
  const adaNoteBg = isDark ? '#0A1520' : '#F8FAFC';
  const adaNoteText = isDark ? '#94A3B8' : '#475569';

  return (
    <View style={[adaS.container, { borderTopColor: adaBorder }]}>
      {/* Header row */}
      <View style={adaS.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[adaS.sectionTitle, { color: textBright(isDark) }]}>🌿 {ds.carbQualityIndex}</Text>
          <Text style={[adaS.sectionSub, { color: textDim(isDark) }]}>Maghoul et al. 2024 · Meta-Analysis · PMID 38009678</Text>
        </View>
        <TouchableOpacity
          style={[adaS.sourceBtn, { backgroundColor: adaSourceBg, borderColor: adaSourceBorder }]}
          onPress={() => Linking.openURL(CQI_META_URL)}
          activeOpacity={0.75}
        >
          <Text style={[adaS.sourceBtnText, { color: adaSourceText }]}>Evidence ↗</Text>
        </TouchableOpacity>
      </View>

      {/* Quality tier badge */}
      <View style={[adaS.tierBadge, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '10' }]}>
        <Text style={{ fontSize: 16 }}>{cfg.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[adaS.tierLabel, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={[adaS.tierDesc, { color: textDim(isDark) }]}>{cfg.desc}</Text>
        </View>
        {tier !== 'no-data' && (
          <View style={[adaS.ratioPill, { backgroundColor: cfg.color + '20', borderColor: cfg.color + '50' }]}>
            <Text style={[adaS.ratioText, { color: cfg.color }]}>{ratio.toFixed(0)}%</Text>
          </View>
        )}
      </View>

      {/* Metric rows */}
      {metrics.map(m => (
        <View key={m.label} style={[adaS.metricRow, { borderBottomColor: adaBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[adaS.metricLabel, { color: textBright(isDark) }]}>{m.label}</Text>
            <Text style={[adaS.metricDesc, { color: textDim(isDark) }]}>{m.desc}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={[adaS.metricValue, { color: m.color }]}>{m.value}</Text>
            <Text style={[adaS.metricTarget, { color: textDim(isDark) }]}>{m.target}</Text>
          </View>
        </View>
      ))}

      {/* ADA guidance note */}
      <View style={[adaS.noteRow, { backgroundColor: adaNoteBg, borderColor: adaBorder }]}>
        <Text style={[adaS.noteText, { color: adaNoteText }]}>{ds.adaNoteText}</Text>
      </View>
    </View>
  );
}

const adaS = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#1E3A4A',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.3,
  },
  sectionSub: {
    fontSize: 10,
    color: '#475569',
    marginTop: 1,
  },
  sourceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#0A1F3A',
    borderWidth: 0.5,
    borderColor: '#1E4A7A',
  },
  sourceBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.2,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 0.5,
    marginBottom: 12,
  },
  tierLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  tierDesc: {
    fontSize: 10,
    color: '#475569',
    marginTop: 2,
    lineHeight: 14,
  },
  ratioPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  ratioText: {
    fontSize: 13,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0', // overridden dynamically via isDark
    gap: 8,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
    letterSpacing: 0.1,
  },
  metricDesc: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  metricTarget: {
    fontSize: 9,
    color: '#475569',
    letterSpacing: 0.1,
  },
  noteRow: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#0A1520',
    borderWidth: 0.5,
    borderColor: '#1E3A4A',
  },
  noteText: {
    fontSize: 10,
    color: '#94A3B8',
    lineHeight: 16,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0,245,255,0.22)', // overridden dynamically via isDark
    padding: 16,
    marginBottom: 4,
    shadowColor: '#00F5FF',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  headerLeft: {
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
  cardSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    lineHeight: 14,
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
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 14,
    gap: 2,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 4,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 12,
    borderRadius: 1,
  },
  barsSection: {
    gap: 11,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: 58,
  },
  barDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
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
    height: '100%',
    borderRadius: 4,
  },
  barMeta: {
    width: 62,
    alignItems: 'flex-end',
  },
  barValue: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  barTarget: {
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 12,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    flex: 1,
  },
});

// ─── Log Meal button row styles ───────────────────────────────────────────────
const logMealS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnCamera: {
    backgroundColor: '#00FF9D14',
    borderColor: '#00FF9D44',
  },
  btnSearch: {
    backgroundColor: '#8B5CF614',
    borderColor: '#8B5CF644',
  },
  btnIcon: {
    fontSize: 14,
  },
  btnLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
