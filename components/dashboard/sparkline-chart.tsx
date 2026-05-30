/**
 * SparklineChart — Miniature 7-day trend line for BentoMetricTile.
 *
 * Design: Apple Health aesthetic
 * ─────────────────────────────────────────────────────────────────────────────
 * • Smooth cubic-bezier stroke through daily data points
 * • Gradient fill area below the primary line (accent colour fading to transparent)
 * • Optional secondary line (e.g. diastolic BP) rendered as a softer dashed overlay
 *   sharing the same Y-axis scale as the primary line
 * • Trend-direction colour:
 *     improving  → green  (#22C55E)
 *     declining  → red    (#EF4444)
 *     flat       → accent colour passed in (default)
 * • Accent dot at the most-recent data point
 * • Animated fade-in on mount (opacity 0 → 1 over 400 ms)
 * • Flat/empty state: dashed horizontal baseline at mid-height
 *
 * Props
 * ─────────────────────────────────────────────────────────────────────────────
 * data            number[]   Primary daily values, oldest first. Needs ≥ 2 points.
 * secondaryData   number[]   Optional secondary series (e.g. diastolic). Shares scale with primary.
 * secondaryColor  string     Stroke colour for the secondary line. Default: '#60A5FA' (blue-400).
 * width           number     SVG canvas width  (default 80)
 * height          number     SVG canvas height (default 32)
 * strokeColor     string     Fallback stroke colour when trend is neutral
 * accentColor     string     Fill gradient start colour + dot colour
 * strokeWidth     number     Line stroke width (default 1.5)
 * higherIsBetter  boolean    When true, rising = improving (green). Set false for BP, resting HR, weight.
 * showTrendColor  boolean    Enable/disable trend-direction colouring. Default true.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, ClipPath, Rect } from 'react-native-svg';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a smooth cubic-bezier SVG path through an array of {x,y} points. */
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = ((prev.x + curr.x) / 2).toFixed(2);
    d += ` C ${cpX} ${prev.y.toFixed(2)} ${cpX} ${curr.y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }
  return d;
}

/** Build a closed fill path: line path + vertical drop to bottom + back to start. */
function buildFillPath(
  points: { x: number; y: number }[],
  bottomY: number
): string {
  if (points.length < 2) return '';
  const linePath = buildSmoothPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${linePath} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} L ${first.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
}

/** Compute trend direction from first and last values. */
function getTrendDirection(
  data: number[],
  higherIsBetter: boolean
): 'improving' | 'declining' | 'flat' {
  if (data.length < 2) return 'flat';
  const first = data[0];
  const last = data[data.length - 1];
  const delta = last - first;
  const threshold = Math.abs(first) * 0.02; // 2% change threshold to avoid noise
  if (Math.abs(delta) < threshold) return 'flat';
  if (higherIsBetter) return delta > 0 ? 'improving' : 'declining';
  return delta < 0 ? 'improving' : 'declining';
}

const TREND_COLORS = {
  improving: '#22C55E',
  declining: '#EF4444',
  flat: null, // use accentColor
} as const;

/** Map a value array to SVG points using a shared min/max scale. */
function mapToPoints(
  values: number[],
  sharedMin: number,
  sharedMax: number,
  width: number,
  height: number,
  padX: number,
  padY: number
): { x: number; y: number }[] {
  const range = sharedMax - sharedMin || 1;
  return values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * (width - padX * 2),
    y: padY + (1 - (v - sharedMin) / range) * (height - padY * 2),
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SparklineChartProps {
  data: number[];
  /** Optional secondary series (e.g. diastolic BP). Shares the same Y-axis scale as `data`. */
  secondaryData?: number[];
  /** Stroke colour for the secondary line. Defaults to '#60A5FA' (blue-400). */
  secondaryColor?: string;
  width?: number;
  height?: number;
  strokeColor?: string;
  accentColor?: string;
  strokeWidth?: number;
  /** When true (default), rising values = improving (green). Set false for BP, resting HR, weight. */
  higherIsBetter?: boolean;
  /** Enable trend-direction colour. Default true. */
  showTrendColor?: boolean;
}

export function SparklineChart({
  data,
  secondaryData,
  secondaryColor = '#60A5FA',
  width = 80,
  height = 32,
  strokeColor = 'rgba(255,255,255,0.25)',
  accentColor = '#10B981',
  strokeWidth = 1.5,
  higherIsBetter = true,
  showTrendColor = true,
}: SparklineChartProps) {
  // ── Fade-in animation ────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ── Empty / flat state ───────────────────────────────────────────────────
  if (!data || data.length < 2) {
    // Dashed baseline at mid-height
    const midY = (height / 2).toFixed(2);
    const dashPath = `M 4 ${midY} L ${(width - 4).toFixed(2)} ${midY}`;
    return (
      <Animated.View style={{ width, height, opacity: fadeAnim }}>
        <Svg width={width} height={height}>
          <Path
            d={dashPath}
            stroke={strokeColor}
            strokeWidth={1}
            strokeDasharray="3,3"
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    );
  }

  // ── Compute shared Y-axis scale (primary + secondary together) ───────────
  const padX = 4;
  const padY = 4;

  const allValues = secondaryData && secondaryData.length >= 2
    ? [...data, ...secondaryData]
    : data;
  const sharedMin = Math.min(...allValues);
  const sharedMax = Math.max(...allValues);

  const bottomY = height - padY;

  const primaryPoints = mapToPoints(data, sharedMin, sharedMax, width, height, padX, padY);
  const linePath = buildSmoothPath(primaryPoints);
  const fillPath = buildFillPath(primaryPoints, bottomY);
  const lastPoint = primaryPoints[primaryPoints.length - 1];

  // Secondary line (diastolic)
  const hasSecondary = secondaryData && secondaryData.length >= 2;
  const secondaryPoints = hasSecondary
    ? mapToPoints(secondaryData!, sharedMin, sharedMax, width, height, padX, padY)
    : null;
  const secondaryLinePath = secondaryPoints ? buildSmoothPath(secondaryPoints) : null;

  // ── Trend colour ─────────────────────────────────────────────────────────
  const trend = getTrendDirection(data, higherIsBetter);
  const trendColor = showTrendColor
    ? (TREND_COLORS[trend] ?? accentColor)
    : accentColor;

  // Unique IDs for SVG defs (avoid collisions when multiple tiles render)
  const gradId = `sg_${accentColor.replace(/[^a-z0-9]/gi, '')}_${width}`;
  const clipId = `sc_${accentColor.replace(/[^a-z0-9]/gi, '')}_${width}`;

  return (
    <Animated.View style={{ width, height, opacity: fadeAnim }}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Vertical fill gradient: accent at top → transparent at bottom */}
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={trendColor} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={trendColor} stopOpacity={0.0} />
          </LinearGradient>
          {/* Clip to the SVG bounds */}
          <ClipPath id={clipId}>
            <Rect x="0" y="0" width={width} height={height} />
          </ClipPath>
        </Defs>

        {/* Gradient fill area (primary only) */}
        <Path
          d={fillPath}
          fill={`url(#${gradId})`}
          clipPath={`url(#${clipId})`}
        />

        {/* Secondary stroke line (e.g. diastolic) — dashed, softer */}
        {secondaryLinePath && (
          <Path
            d={secondaryLinePath}
            stroke={secondaryColor}
            strokeWidth={1}
            strokeOpacity={0.6}
            strokeDasharray="3 2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* Primary stroke line */}
        <Path
          d={linePath}
          stroke={trendColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath={`url(#${clipId})`}
        />

        {/* Accent dot at latest primary data point */}
        <Circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2.5}
          fill={trendColor}
        />
      </Svg>
    </Animated.View>
  );
}
