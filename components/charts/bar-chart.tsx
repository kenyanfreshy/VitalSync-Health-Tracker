/**
 * BarChart — Simple SVG bar chart for sleep stages and HRV visualization.
 */

import { safeFormatDate } from '@/lib/utils';
import React, { useMemo } from 'react';
import { View, Text as RNText, TouchableWithoutFeedback } from 'react-native';
import Svg, { Rect, G, Text as SvgText, Polyline, Circle } from 'react-native-svg';

interface BarSegment {
  value: number;
  color: string;
}

interface BarDataPoint {
  segments: BarSegment[];
  label?: string;
}

interface BarChartProps {
  data: BarDataPoint[];
  width: number;
  height: number;
  barRadius?: number;
  gap?: number;
  padding?: number;
}

export function StackedBarChart({
  data,
  width,
  height,
  barRadius = 4,
  gap = 4,
  padding = 8,
}: BarChartProps) {
  const bars = useMemo(() => {
    const barCount = data.length;
    const totalWidth = width - padding * 2;
    const barWidth = (totalWidth - gap * (barCount - 1)) / barCount;
    const maxTotal = Math.max(...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)));

    return data.map((d, i) => {
      const total = d.segments.reduce((s, seg) => s + seg.value, 0);
      const barH = ((total / (maxTotal || 1)) * (height - padding * 2));
      const x = padding + i * (barWidth + gap);
      let yOffset = height - padding;

      return {
        x,
        barWidth,
        segments: d.segments.map((seg) => {
          const segH = (seg.value / (total || 1)) * barH;
          yOffset -= segH;
          return { ...seg, y: yOffset, h: segH };
        }),
      };
    });
  }, [data, width, height, gap, padding]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {bars.map((bar, bi) => (
          <G key={bi}>
            {bar.segments.map((seg, si) => (
              <Rect
                key={si}
                x={bar.x}
                y={seg.y}
                width={bar.barWidth}
                height={Math.max(seg.h, 1)}
                fill={seg.color}
                rx={si === bar.segments.length - 1 ? barRadius : 0}
                ry={si === bar.segments.length - 1 ? barRadius : 0}
              />
            ))}
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** HRV-specific bar chart with zone coloring, reference line, rolling average, and tap-to-inspect */
export interface HrvTrendChartProps {
  /** Array of { hrv, timestamp } — only entries with hrv > 0 are rendered */
  records: { hrv?: number | null; timestamp: string }[];
  width: number;
  height?: number;
  /** Days to show: 7 | 30 | 90 | 'all'. Default: 'all' (capped at 90 bars) */
  rangeDays?: 7 | 30 | 90 | 'all';
  /** Index of the currently selected bar (for tooltip) */
  selectedIndex?: number | null;
  /** Called when a bar is pressed with its index */
  onBarPress?: (index: number) => void;
  /** Color for the "Good" reference line (default: green) */
  referenceLineColor?: string;
  /** Personal HRV target in ms — renders a second reference line in cyan */
  personalTargetMs?: number | null;
}

/**
 * HrvTrendChart renders HRV values as zone-colored bars:
 *  ≥50 ms  → green (Excellent)
 *  ≥35 ms  → indigo (Good)
 *  ≥20 ms  → amber (Fair)
 *  <20 ms  → red   (Low)
 *
 * Features:
 *  - Green reference line at 35 ms (Good threshold)
 *  - 7-day rolling average polyline overlay
 *  - Tap any bar to see a tooltip with exact value + date
 *  - Date labels every ~7 bars
 */
export function HrvTrendChart({
  records,
  width,
  height = 130,
  rangeDays = 'all',
  selectedIndex = null,
  onBarPress,
  referenceLineColor = '#10B981',
  personalTargetMs = null,
}: HrvTrendChartProps) {
  const LABEL_AREA = 18;
  const PADDING = 8;
  const GAP = 3;
  const REFERENCE_HRV = 35;
  const MAX_BARS = 90;

  // 1. Filter by date range then cap at MAX_BARS
  const filtered = useMemo(() => {
    const withHrv = records.filter((r) => (r.hrv ?? 0) > 0);
    if (rangeDays === 'all') return withHrv.slice(-MAX_BARS);
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return withHrv.filter((r) => new Date(r.timestamp).getTime() >= cutoff).slice(-MAX_BARS);
  }, [records, rangeDays]);

  // 2. Derived chart geometry
  const chartH = height - LABEL_AREA - PADDING;
  const maxVal = useMemo(
    () => Math.max(...filtered.map((r) => r.hrv!), REFERENCE_HRV + 10, 1),
    [filtered],
  );

  const barWidth = useMemo(() => {
    const count = filtered.length;
    if (count === 0) return 0;
    return Math.max((width - PADDING * 2 - GAP * (count - 1)) / count, 2);
  }, [filtered.length, width]);

  const bars = useMemo(() => {
    return filtered.map((r, i) => {
      const hrv = r.hrv!;
      const barH = (hrv / maxVal) * chartH;
      const color =
        hrv >= 50 ? '#10B981' :
        hrv >= 35 ? '#6366F1' :
        hrv >= 20 ? '#F59E0B' :
        '#EF4444';
      const showLabel = i % Math.max(Math.ceil(filtered.length / 6), 1) === 0 || i === filtered.length - 1;
      const dateLabel = showLabel
        ? safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric' })
        : '';
      const cx = PADDING + i * (barWidth + GAP) + barWidth / 2;
      return {
        x: PADDING + i * (barWidth + GAP),
        y: PADDING + chartH - barH,
        w: barWidth,
        h: Math.max(barH, 2),
        color,
        dateLabel,
        cx,
        cy: PADDING + chartH - barH,
        hrv,
        timestamp: r.timestamp,
      };
    });
  }, [filtered, barWidth, chartH, maxVal]);

  // 3. Reference line Y
  const refLineY = PADDING + chartH - (REFERENCE_HRV / maxVal) * chartH;

  // 4. 7-day rolling average polyline points
  const avgPoints = useMemo(() => {
    if (filtered.length < 2) return '';
    return filtered.map((_, i) => {
      const windowStart = Math.max(0, i - 6);
      const slice = filtered.slice(windowStart, i + 1);
      const avg = slice.reduce((s, r) => s + r.hrv!, 0) / slice.length;
      const cx = PADDING + i * (barWidth + GAP) + barWidth / 2;
      const cy = PADDING + chartH - (avg / maxVal) * chartH;
      return `${cx},${cy}`;
    }).join(' ');
  }, [filtered, barWidth, chartH, maxVal]);

  if (filtered.length === 0) return null;

  const selected = selectedIndex !== null && selectedIndex >= 0 && selectedIndex < bars.length
    ? bars[selectedIndex]
    : null;

  return (
    <View style={{ width }}>
      {/* Tooltip above chart */}
      {selected && (
        <View style={[
          hrvStyles.tooltip,
          {
            left: Math.min(Math.max(selected.cx - 52, 0), width - 108),
            backgroundColor: selected.color + 'EE',
          },
        ]}>
          <RNText style={hrvStyles.tooltipValue}>{selected.hrv} ms</RNText>
          <RNText style={hrvStyles.tooltipDate}>
            {safeFormatDate(selected.timestamp, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </RNText>
        </View>
      )}
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          {/* Reference line at 35 ms */}
          <Rect
            x={PADDING}
            y={refLineY}
            width={width - PADDING * 2}
            height={1}
            fill={referenceLineColor}
            opacity={0.4}
          />
          {/* Personal target line */}
          {personalTargetMs !== null && personalTargetMs > 0 && (() => {
            const targetY = PADDING + chartH - (Math.min(personalTargetMs, maxVal) / maxVal) * chartH;
            return (
              <Rect
                x={PADDING}
                y={targetY}
                width={width - PADDING * 2}
                height={1.5}
                fill="#00F5FF"
                opacity={0.7}
              />
            );
          })()}
          {/* Bars */}
          {bars.map((bar, i) => (
            <Rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              fill={bar.color}
              rx={3}
              ry={3}
              opacity={selectedIndex === null || selectedIndex === i ? 0.85 : 0.35}
            />
          ))}
          {/* 7-day rolling average line */}
          {avgPoints.length > 0 && (
            <Polyline
              points={avgPoints}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              strokeOpacity={0.7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {/* Highlight dot on selected bar */}
          {selected && (
            <Circle
              cx={selected.cx}
              cy={selected.cy}
              r={4}
              fill={selected.color}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          )}
          {/* Date labels */}
          {bars
            .filter((b) => b.dateLabel)
            .map((bar, i) => (
              <SvgText
                key={i}
                x={bar.cx}
                y={height - 3}
                fontSize={8}
                fill="#94A3B8"
                textAnchor="middle"
              >
                {bar.dateLabel}
              </SvgText>
            ))}
        </Svg>
        {/* Invisible tap targets over each bar */}
        {onBarPress && bars.map((bar, i) => (
          <TouchableWithoutFeedback key={i} onPress={() => onBarPress(i)}>
            <View style={{
              position: 'absolute',
              left: bar.x,
              top: 0,
              width: Math.max(bar.w, 12),
              height: height - LABEL_AREA,
            }} />
          </TouchableWithoutFeedback>
        ))}
      </View>
    </View>
  );
}

const hrvStyles = {
  tooltip: {
    position: 'absolute' as const,
    top: -44,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center' as const,
    width: 108,
    zIndex: 10,
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  tooltipDate: {
    fontSize: 10,
    color: '#FFFFFF',
    opacity: 0.85,
    lineHeight: 14,
  },
};

interface SimpleBarChartProps {
  values: number[];
  color: string;
  width: number;
  height: number;
  gap?: number;
  padding?: number;
  barRadius?: number;
}

export function SimpleBarChart({
  values,
  color,
  width,
  height,
  gap = 3,
  padding = 8,
  barRadius = 3,
}: SimpleBarChartProps) {
  const bars = useMemo(() => {
    const count = values.length;
    const totalWidth = width - padding * 2;
    const barWidth = (totalWidth - gap * (count - 1)) / count;
    const maxVal = Math.max(...values, 1);

    return values.map((v, i) => {
      const barH = (v / maxVal) * (height - padding * 2);
      return {
        x: padding + i * (barWidth + gap),
        y: height - padding - barH,
        w: barWidth,
        h: Math.max(barH, 2),
      };
    });
  }, [values, width, height, gap, padding]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {bars.map((bar, i) => (
          <Rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            fill={color}
            rx={barRadius}
            ry={barRadius}
          />
        ))}
      </Svg>
    </View>
  );
}
