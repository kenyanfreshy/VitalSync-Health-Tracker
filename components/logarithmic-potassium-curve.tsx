/**
 * LogarithmicPotassiumCurve
 *
 * Mirrors the LogarithmicSodiumCurve design but for potassium intake.
 * Uses a log₁₀ scale with a green-to-yellow gradient fill, and a green
 * dashed target line at 3,500 mg (the recommended daily potassium intake).
 *
 * Visual anatomy:
 *  - SVG path: smooth logarithmic curve from 0 → TARGET_MG
 *  - Target line: green dashed vertical line at targetMg
 *  - Current-position dot: animated circle on the curve at todayKMg
 *  - Gradient fill: green-to-yellow area under the curve up to current value
 *  - Axis labels: 0, 500, 1000, 1500, 2000, 2500, 3000, 3500 mg ticks
 *  - Status text: colour-coded mg value + percentage of target
 *
 * NOTE: The animated dot uses JS-thread Animated.Value (not Reanimated animatedProps)
 * to avoid the Reanimated v4 + react-native-svg crash on native new architecture.
 */

import { Easing } from 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks';

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_MG = 3500;
const W = 320;
const H = 90;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 24;

const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const X_TICKS = [0, 500, 1000, 1500, 2000, 2500, 3000, TARGET_MG];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kToX(mg: number, targetMg: number = TARGET_MG): number {
  const logMin = Math.log10(1);
  const logMax = Math.log10(targetMg + 1);
  const t = (Math.log10(Math.max(mg, 0) + 1) - logMin) / (logMax - logMin);
  return PAD_L + t * PLOT_W;
}

function kToY(mg: number, targetMg: number = TARGET_MG): number {
  const logMin = Math.log10(1);
  const logMax = Math.log10(targetMg + 1);
  const t = (Math.log10(Math.max(mg, 0) + 1) - logMin) / (logMax - logMin);
  const yRange = PLOT_H * 0.72;
  return PAD_T + yRange * (1 - Math.cos(t * Math.PI)) / 2;
}

function buildCurvePath(targetMg: number = TARGET_MG): string {
  const steps = 80;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mg = (i / steps) * targetMg;
    points.push({ x: kToX(mg, targetMg), y: kToY(mg, targetMg) });
  }
  return points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(' ');
}

function buildFillPath(upToMg: number, targetMg: number = TARGET_MG): string {
  const clampedMg = Math.min(Math.max(upToMg, 0), targetMg);
  const steps = 60;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mg = (i / steps) * clampedMg;
    points.push({ x: kToX(mg, targetMg), y: kToY(mg, targetMg) });
  }
  if (points.length === 0) return '';
  const startX = points[0].x;
  const endX = points[points.length - 1].x;
  const bottomY = PAD_T + PLOT_H + 2;
  return (
    points.map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ') +
    ` L ${endX.toFixed(1)} ${bottomY} L ${startX.toFixed(1)} ${bottomY} Z`
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Today's total potassium intake in mg */
  todayKMg: number;
  /** Daily target in mg (default 3500) */
  targetMg?: number;
}

export function LogarithmicPotassiumCurve({ todayKMg, targetMg = TARGET_MG }: Props) {
  const colors = useColors();

  const clampedK = Math.min(Math.max(todayKMg, 0), targetMg * 1.2); // allow slight over-target
  const pct = Math.round((todayKMg / targetMg) * 100);

  // Potassium: green when meeting target, yellow when halfway, red when very low
  const statusColor =
    todayKMg >= targetMg * 0.8 ? '#10B981' :
    todayKMg >= targetMg * 0.4 ? '#F59E0B' :
    '#EF4444';

  // ── JS-thread animated dot position (safe on native new arch) ──────────────
  const animX = useRef(new Animated.Value(kToX(0, targetMg))).current;
  const animY = useRef(new Animated.Value(kToY(0, targetMg))).current;

  const [dotPos, setDotPos] = useState({
    cx: kToX(0, targetMg),
    cy: kToY(0, targetMg),
  });

  useEffect(() => {
    const targetX = kToX(Math.min(clampedK, targetMg), targetMg);
    const targetY = kToY(Math.min(clampedK, targetMg), targetMg);

    const idX = animX.addListener(({ value }) => {
      setDotPos(prev => ({ ...prev, cx: value }));
    });
    const idY = animY.addListener(({ value }) => {
      setDotPos(prev => ({ ...prev, cy: value }));
    });

    Animated.parallel([
      Animated.timing(animX, {
        toValue: targetX,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animY, {
        toValue: targetY,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    return () => {
      animX.removeListener(idX);
      animY.removeListener(idY);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedK, targetMg]);

  const fillPath = buildFillPath(clampedK, targetMg);
  const curvePath = buildCurvePath(targetMg);
  const targetX = kToX(targetMg, targetMg);

  return (
    <View style={styles.container}>
      {/* ── Header row ── */}
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.muted }]}>🍌 POTASSIUM TELEMETRY</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.valueMg, { color: statusColor }]}>
            {todayKMg.toLocaleString()} mg
          </Text>
          <Text style={[styles.valuePct, { color: colors.muted }]}>
            {' '}/ {pct}%
          </Text>
        </View>
      </View>

      {/* ── SVG Graph ── */}
      <View style={styles.svgWrap}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            {/* Green-to-yellow gradient fill */}
            <LinearGradient id="potassiumFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={statusColor} stopOpacity={0.28} />
              <Stop offset="100%" stopColor={statusColor} stopOpacity={0.03} />
            </LinearGradient>
            {/* Horizontal gradient for the curve (green → yellow → green) */}
            <LinearGradient id="kCurveStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#EF4444" stopOpacity={0.9} />
              <Stop offset="40%" stopColor="#F59E0B" stopOpacity={0.9} />
              <Stop offset="100%" stopColor="#10B981" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>

          {/* ── Background grid lines ── */}
          {X_TICKS.map((mg) => {
            const x = kToX(mg, targetMg);
            return (
              <Line
                key={mg}
                x1={x} y1={PAD_T} x2={x} y2={PAD_T + PLOT_H}
                stroke={colors.border}
                strokeWidth={0.5}
                strokeDasharray={mg === 0 ? undefined : '3,3'}
                opacity={0.5}
              />
            );
          })}

          {/* ── Fill area under curve up to current value ── */}
          {fillPath ? <Path d={fillPath} fill="url(#potassiumFill)" /> : null}

          {/* ── Full logarithmic curve (muted) ── */}
          <Path d={curvePath} fill="none" stroke={colors.border} strokeWidth={1.5} strokeOpacity={0.4} />

          {/* ── Target vertical dashed line (green) ── */}
          <Line
            x1={targetX} y1={PAD_T - 4}
            x2={targetX} y2={PAD_T + PLOT_H}
            stroke="#10B981"
            strokeWidth={1.2}
            strokeDasharray="4,3"
            opacity={0.75}
          />
          <SvgText
            x={targetX - 2}
            y={PAD_T - 1}
            fontSize={7.5}
            fill="#10B981"
            textAnchor="end"
            opacity={0.9}
          >
            TARGET
          </SvgText>

          {/* ── X-axis tick labels ── */}
          {X_TICKS.filter((mg) => mg !== targetMg).map((mg) => {
            const x = kToX(mg, targetMg);
            const label = mg === 0 ? '0' : mg >= 1000 ? `${mg / 1000}k` : `${mg}`;
            return (
              <SvgText
                key={mg}
                x={x} y={H - 4}
                fontSize={7.5}
                fill={colors.muted}
                textAnchor="middle"
                opacity={0.7}
              >
                {label}
              </SvgText>
            );
          })}

          {/* ── Current-position dot (JS-thread state, no Reanimated animatedProps) ── */}
          <Circle cx={dotPos.cx} cy={dotPos.cy} r={5} fill={statusColor} stroke="#fff" strokeWidth={1.5} />
          <Circle cx={dotPos.cx} cy={dotPos.cy} r={9} fill="none" stroke={statusColor} strokeWidth={1} opacity={0.3} />
        </Svg>
      </View>

      {/* ── Caption ── */}
      <Text style={[styles.caption, { color: colors.muted }]}>
        Daily target: {targetMg.toLocaleString()} mg · Log₁₀ scale
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  valueMg: { fontSize: 16, fontWeight: '800' },
  valuePct: { fontSize: 12, fontWeight: '600' },
  svgWrap: { alignSelf: 'stretch' },
  caption: { fontSize: 9, fontStyle: 'italic', letterSpacing: 0.2 },
});
