/**
 * LineChart — Lightweight SVG line chart for health trend visualization.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

interface DataPoint {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  rawValue?: number;
}

interface LineChartProps {
  data: DataPoint[];
  width: number;
  height: number;
  color: string;
  secondaryData?: DataPoint[];
  secondaryColor?: string;
  showDots?: boolean;
  showGradient?: boolean;
  strokeWidth?: number;
  padding?: number;
  /** Called with the index of the tapped data point */
  onPointPress?: (index: number) => void;
  /** Index of the currently selected point (shows highlight ring) */
  selectedIndex?: number;
}

function buildPath(points: DataPoint[], w: number, h: number, pad: number): string {
  if (points.length < 2) return '';
  const xs = points.map((p) => pad + p.x * (w - pad * 2));
  const ys = points.map((p) => h - pad - p.y * (h - pad * 2));

  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < points.length; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cpx} ${ys[i - 1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  return d;
}

function buildAreaPath(points: DataPoint[], w: number, h: number, pad: number): string {
  if (points.length < 2) return '';
  const linePath = buildPath(points, w, h, pad);
  const lastX = pad + points[points.length - 1].x * (w - pad * 2);
  const firstX = pad + points[0].x * (w - pad * 2);
  return `${linePath} L ${lastX} ${h - pad} L ${firstX} ${h - pad} Z`;
}

export function LineChart({
  data,
  width,
  height,
  color,
  secondaryData,
  secondaryColor,
  showDots = false,
  showGradient = true,
  strokeWidth = 2,
  padding = 8,
  onPointPress,
  selectedIndex,
}: LineChartProps) {
  const primaryPath = useMemo(() => buildPath(data, width, height, padding), [data, width, height, padding]);
  const areaPath = useMemo(() => buildAreaPath(data, width, height, padding), [data, width, height, padding]);
  const secondaryPath = useMemo(
    () => secondaryData ? buildPath(secondaryData, width, height, padding) : '',
    [secondaryData, width, height, padding]
  );

  const gradientId = `grad-${color.replace('#', '')}`;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Area fill */}
        {showGradient && areaPath && (
          <Path d={areaPath} fill={`url(#${gradientId})`} />
        )}

        {/* Secondary line (dashed) */}
        {secondaryPath && secondaryColor && (
          <Path
            d={secondaryPath}
            stroke={secondaryColor}
            strokeWidth={strokeWidth}
            strokeDasharray="4,3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Primary line */}
        {primaryPath && (
          <Path
            d={primaryPath}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Dots + touch hit areas */}
        {data.map((p, i) => {
          const cx = padding + p.x * (width - padding * 2);
          const cy = height - padding - p.y * (height - padding * 2);
          const isSelected = selectedIndex === i;
          return (
            <React.Fragment key={i}>
              {/* Invisible hit area (24×24) for easy tapping */}
              {onPointPress && (
                <Rect
                  x={cx - 12}
                  y={cy - 12}
                  width={24}
                  height={24}
                  fill="transparent"
                  onPress={() => onPointPress(i)}
                />
              )}
              {/* Visible dot — always shown when there are few points or a point is selected */}
              {(showDots || isSelected) && (
                <>
                  {isSelected && (
                    <Circle cx={cx} cy={cy} r={8} fill={color} opacity={0.18} />
                  )}
                  <Circle cx={cx} cy={cy} r={isSelected ? 5 : 3} fill={color} />
                </>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

/**
 * Normalize an array of numbers to 0-1 range for chart rendering.
 */
export function normalizeData(values: number[]): DataPoint[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => ({
    x: i / (values.length - 1 || 1),
    y: (v - min) / range,
    rawValue: v,
  }));
}
