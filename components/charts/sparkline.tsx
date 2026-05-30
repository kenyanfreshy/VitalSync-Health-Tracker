/**
 * Sparkline
 * A minimal SVG polyline chart — no axes, no labels.
 * Used in the Weekly Summary card for at-a-glance trend visualization.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  showGradient?: boolean;
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = '#22C55E',
  strokeWidth = 1.8,
  showGradient = true,
}: SparklineProps) {
  const points = useMemo(() => {
    if (!data || data.length < 2) return '';

    const validData = data.filter((v) => typeof v === 'number' && isFinite(v));
    if (validData.length < 2) return '';

    const min = Math.min(...validData);
    const max = Math.max(...validData);
    const range = max - min || 1;

    const padX = strokeWidth;
    const padY = strokeWidth + 1;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    return validData
      .map((v, i) => {
        const x = padX + (i / (validData.length - 1)) * usableW;
        const y = padY + (1 - (v - min) / range) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height, strokeWidth]);

  if (!points) {
    return <View style={{ width, height }} />;
  }

  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <Svg width={width} height={height}>
      {showGradient && (
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.18" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
      )}
      {showGradient && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={`url(#${gradientId})`}
        />
      )}
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
