/**
 * LogarithmicSodiumCurve
 *
 * Replaces the linear sodium progress bar with a logarithmic curve graph.
 * The curve maps 0 → limitMg on a log₁₀ scale so that the first 500 mg
 * occupy more visual space than the last 500 mg, making early intake clearly
 * visible and the danger zone near the threshold visually compressed.
 *
 * Visual anatomy:
 *  - SVG path: smooth logarithmic curve from left edge to right edge
 *  - Daily limit line: red dashed vertical line at limitMg
 *  - Per-entry threshold line (optional): orange dashed vertical line at
 *    perEntryThresholdMg (e.g. 600 mg for DASH, 800 mg for Mediterranean)
 *  - Current-position dot: animated circle on the curve at todayNa
 *  - Gradient fill: area under the curve up to the current position
 *  - Axis labels: 0, 500, 1000, 1500, 2000, 2300 mg ticks on x-axis
 *  - Status text: colour-coded mg value + percentage of limit
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

const LIMIT_MG = 2300;
const W = 320;
const H = 96;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 16;  // extra top padding for annotation labels
const PAD_B = 24;

const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const X_TICKS = [0, 500, 1000, 1500, 2000, LIMIT_MG];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sodiumToX(mg: number, limitMg: number = LIMIT_MG): number {
  const logMin = Math.log10(1);
  const logMax = Math.log10(limitMg + 1);
  const t = (Math.log10(Math.max(mg, 0) + 1) - logMin) / (logMax - logMin);
  return PAD_L + t * PLOT_W;
}

function sodiumToY(mg: number, limitMg: number = LIMIT_MG): number {
  const logMin = Math.log10(1);
  const logMax = Math.log10(limitMg + 1);
  const t = (Math.log10(Math.max(mg, 0) + 1) - logMin) / (logMax - logMin);
  const yRange = PLOT_H * 0.72;
  return PAD_T + yRange * (1 - Math.cos(t * Math.PI)) / 2;
}

function buildCurvePath(limitMg: number = LIMIT_MG): string {
  const steps = 80;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mg = (i / steps) * limitMg;
    points.push({ x: sodiumToX(mg, limitMg), y: sodiumToY(mg, limitMg) });
  }
  return points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(' ');
}

function buildFillPath(upToMg: number, limitMg: number = LIMIT_MG): string {
  const clampedMg = Math.min(Math.max(upToMg, 0), limitMg);
  const steps = 60;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mg = (i / steps) * clampedMg;
    points.push({ x: sodiumToX(mg, limitMg), y: sodiumToY(mg, limitMg) });
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
  /** Today's total sodium intake in mg */
  todayNaMg: number;
  /** Daily limit in mg (default 2300) */
  limitMg?: number;
  /**
   * Optional per-entry conflict threshold for the active diet protocol.
   * When provided, renders a second dashed orange vertical line so users can
   * see both the per-entry limit and the daily limit at a glance.
   * e.g. 600 for DASH, 800 for Mediterranean.
   */
  perEntryThresholdMg?: number;
  /** Label for the per-entry threshold line (e.g. "DASH", "MED") */
  perEntryLabel?: string;
}

export function LogarithmicSodiumCurve({
  todayNaMg,
  limitMg = LIMIT_MG,
  perEntryThresholdMg,
  perEntryLabel = 'ENTRY',
}: Props) {
  const colors = useColors();

  const clampedNa = Math.min(Math.max(todayNaMg, 0), limitMg);
  const pct = Math.round((todayNaMg / limitMg) * 100);

  const statusColor =
    todayNaMg < 1000 ? '#10B981' :
    todayNaMg < 1800 ? '#F59E0B' :
    '#EF4444';

  // ── JS-thread animated dot position (safe on native new arch) ──────────────
  const animX = useRef(new Animated.Value(sodiumToX(0, limitMg))).current;
  const animY = useRef(new Animated.Value(sodiumToY(0, limitMg))).current;

  // Track current dot position as state so SVG Circle re-renders on change
  const [dotPos, setDotPos] = useState({
    cx: sodiumToX(0, limitMg),
    cy: sodiumToY(0, limitMg),
  });

  useEffect(() => {
    const targetX = sodiumToX(clampedNa, limitMg);
    const targetY = sodiumToY(clampedNa, limitMg);

    // Listener updates state on JS thread — safe for SVG props
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
  }, [clampedNa, limitMg]);

  const fillPath = buildFillPath(clampedNa, limitMg);
  const curvePath = buildCurvePath(limitMg);
  const thresholdX = sodiumToX(limitMg, limitMg);

  // Per-entry threshold line (only if within visible range)
  const showEntryLine =
    perEntryThresholdMg !== undefined &&
    perEntryThresholdMg > 0 &&
    perEntryThresholdMg < limitMg;
  const entryLineX = showEntryLine ? sodiumToX(perEntryThresholdMg!, limitMg) : 0;

  return (
    <View style={styles.container}>
      {/* ── Header row ── */}
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.muted }]}>🧂 SODIUM TELEMETRY</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.valueMg, { color: statusColor }]}>
            {todayNaMg.toLocaleString()} mg
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
            <LinearGradient id="sodiumFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={statusColor} stopOpacity={0.28} />
              <Stop offset="100%" stopColor={statusColor} stopOpacity={0.03} />
            </LinearGradient>
            <LinearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
              <Stop offset="60%" stopColor="#F59E0B" stopOpacity={0.9} />
              <Stop offset="100%" stopColor="#EF4444" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>

          {/* ── Background grid lines ── */}
          {X_TICKS.map((mg) => {
            const x = sodiumToX(mg, limitMg);
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
          {fillPath ? <Path d={fillPath} fill="url(#sodiumFill)" /> : null}

          {/* ── Full logarithmic curve (muted) ── */}
          <Path d={curvePath} fill="none" stroke={colors.border} strokeWidth={1.5} strokeOpacity={0.4} />

          {/* ── Per-entry protocol threshold line (orange) ── */}
          {showEntryLine && (
            <>
              <Line
                x1={entryLineX} y1={PAD_T - 4}
                x2={entryLineX} y2={PAD_T + PLOT_H}
                stroke="#F97316"
                strokeWidth={1.2}
                strokeDasharray="3,3"
                opacity={0.8}
              />
              <SvgText
                x={entryLineX + 3}
                y={PAD_T - 1}
                fontSize={7.5}
                fill="#F97316"
                textAnchor="start"
                opacity={0.9}
              >
                {perEntryLabel}
              </SvgText>
            </>
          )}

          {/* ── Daily limit vertical dashed line (red) ── */}
          <Line
            x1={thresholdX} y1={PAD_T - 4}
            x2={thresholdX} y2={PAD_T + PLOT_H}
            stroke="#EF4444"
            strokeWidth={1.2}
            strokeDasharray="4,3"
            opacity={0.7}
          />
          <SvgText
            x={thresholdX - 2}
            y={PAD_T - 1}
            fontSize={7.5}
            fill="#EF4444"
            textAnchor="end"
            opacity={0.85}
          >
            LIMIT
          </SvgText>

          {/* ── X-axis tick labels ── */}
          {X_TICKS.filter((mg) => mg !== limitMg).map((mg) => {
            const x = sodiumToX(mg, limitMg);
            const label = mg === 0 ? '0' : mg >= 1000 ? `${mg / 1000}k` : `${mg}`;
            return (
              <SvgText
                key={mg}
                x={x} y={H - 4}
                fontSize={8}
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

      {/* ── Legend row ── */}
      <View style={styles.legendRow}>
        <Text style={[styles.limitCaption, { color: colors.muted }]}>
          Daily limit: {limitMg.toLocaleString()} mg · Log₁₀ scale
        </Text>
        {showEntryLine && (
          <Text style={[styles.entryCaption, { color: '#F97316' }]}>
            {perEntryLabel} entry limit: {perEntryThresholdMg!.toLocaleString()} mg
          </Text>
        )}
      </View>
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
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  limitCaption: { fontSize: 9, fontStyle: 'italic', letterSpacing: 0.2 },
  entryCaption: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
});
