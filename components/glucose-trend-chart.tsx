/**
 * GlucoseTrendChart
 * SVG line chart with:
 *   - High / Low threshold dashed bands
 *   - Colored dots (red = above, amber = below, green = in-range)
 *   - Time-in-Range bar with % breakdown
 *   - Reading count with a link to threshold alert settings
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useColors, useDashboardStrings } from '@/hooks';
import { GlucoseThresholdConfig, computeTIR } from '@/lib/health/glucose-thresholds';
import { BloodSugarRecord, mgDlToMmol } from '@/lib/health/types';
const CHART_H = 160;
const CHART_PAD_LEFT = 36;
const CHART_PAD_RIGHT = 12;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 24;

interface Props {
  records: BloodSugarRecord[];
  thresholds: GlucoseThresholdConfig;
  unit: 'mg/dL' | 'mmol/L';
  /** Width of the chart container (pass from onLayout) */
  width: number;
}

function convert(mgDl: number, unit: 'mg/dL' | 'mmol/L'): number {
  return unit === 'mmol/L' ? parseFloat(mgDlToMmol(mgDl).toFixed(1)) : mgDl;
}

function dotColor(mgDl: number, thresholds: GlucoseThresholdConfig): string {
  if (mgDl > thresholds.highMgDl) return '#EF4444';
  if (mgDl < thresholds.lowMgDl) return '#F59E0B';
  return '#10B981';
}

export function GlucoseTrendChart({ records, thresholds, unit, width }: Props) {
  const colors = useColors();
  const router = useRouter();
  const ds = useDashboardStrings();

  const plotW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const plotH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  // Sort oldest → newest, cap at 20 points for legibility
  const sorted = useMemo(() => {
    const r = [...records].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return r.length > 20 ? r.slice(r.length - 20) : r;
  }, [records]);

  const vals = sorted.map(r => r.glucoseMgDl);
  const tir = useMemo(() => computeTIR(vals, thresholds), [vals, thresholds]);

  const yMin = useMemo(() => Math.max(0, Math.min(...vals, thresholds.lowMgDl) - 20), [vals, thresholds]);
  const yMax = useMemo(() => Math.max(...vals, thresholds.highMgDl) + 20, [vals, thresholds]);
  const yRange = yMax - yMin;

  const toX = (i: number) => CHART_PAD_LEFT + (sorted.length <= 1 ? plotW / 2 : (i / (sorted.length - 1)) * plotW);
  const toY = (v: number) => CHART_PAD_TOP + plotH - ((v - yMin) / yRange) * plotH;

  // Build SVG polyline path
  const linePath = sorted.length < 2 ? '' : sorted.reduce((acc, r, i) => {
    const x = toX(i);
    const y = toY(r.glucoseMgDl);
    return acc + (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  }, '');

  // Threshold Y positions
  const highY = toY(thresholds.highMgDl);
  const lowY = toY(thresholds.lowMgDl);

  // Y-axis labels (3 ticks)
  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax];

  const s = styles(colors);

  if (!width || sorted.length === 0) {
    return (
      <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.emptyText, { color: colors.muted }]}>No readings to display</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Chart header */}
      <View style={s.chartHeader}>
        <Text style={[s.chartLabel, { color: colors.muted }]}>
          TREND · {unit.toUpperCase()} · THRESHOLD BAND SHOWN
        </Text>
        <Pressable
          onPress={() => router.push('/settings/thresholds' as any)}
          style={({ pressed }) => [s.alertLink, pressed && { opacity: 0.6 }]}
        >
          <Text style={[s.alertLinkText, { color: colors.primary }]}>
            {tir.count} readings ›
          </Text>
        </Pressable>
      </View>

      {/* SVG Chart */}
      <Svg width={width} height={CHART_H}>
        {/* High threshold dashed line */}
        <Line
          x1={CHART_PAD_LEFT} y1={highY}
          x2={width - CHART_PAD_RIGHT} y2={highY}
          stroke="#EF4444" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7}
        />
        {/* Low threshold dashed line */}
        <Line
          x1={CHART_PAD_LEFT} y1={lowY}
          x2={width - CHART_PAD_RIGHT} y2={lowY}
          stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7}
        />

        {/* Y-axis labels */}
        {yTicks.map((v, i) => (
          <SvgText
            key={i}
            x={CHART_PAD_LEFT - 4}
            y={toY(v) + 4}
            fontSize={9}
            fill={colors.muted}
            textAnchor="end"
          >
            {unit === 'mmol/L' ? mgDlToMmol(v).toFixed(1) : String(Math.round(v))}
          </SvgText>
        ))}

        {/* Threshold value labels */}
        <SvgText x={width - CHART_PAD_RIGHT + 2} y={highY + 4} fontSize={9} fill="#EF4444" textAnchor="start">
          {convert(thresholds.highMgDl, unit)}
        </SvgText>
        <SvgText x={width - CHART_PAD_RIGHT + 2} y={lowY + 4} fontSize={9} fill="#F59E0B" textAnchor="start">
          {convert(thresholds.lowMgDl, unit)}
        </SvgText>

        {/* Line */}
        {linePath ? (
          <Path d={linePath} stroke="#EF4444" strokeWidth={2} fill="none" strokeLinejoin="round" />
        ) : null}

        {/* Dots */}
        {sorted.map((r, i) => (
          <Circle
            key={r.id}
            cx={toX(i)}
            cy={toY(r.glucoseMgDl)}
            r={5}
            fill={dotColor(r.glucoseMgDl, thresholds)}
            stroke={colors.surface}
            strokeWidth={1.5}
          />
        ))}
      </Svg>

      {/* TIR section */}
      <View style={s.tirSection}>
        <View style={s.tirHeader}>
          <Text style={[s.tirLabel, { color: colors.foreground }]}>Time in Range</Text>
          <Pressable
            onPress={() => router.push('/settings/thresholds' as any)}
            style={({ pressed }) => [s.tirGoalBadge, pressed && { opacity: 0.7 },
              tir.inRangePct >= thresholds.tirGoalPct
                ? { backgroundColor: '#10B98122', borderColor: '#10B98155' }
                : { backgroundColor: '#F59E0B22', borderColor: '#F59E0B55' }
            ]}
          >
            <Text style={[s.tirGoalText, {
              color: tir.inRangePct >= thresholds.tirGoalPct ? '#10B981' : '#F59E0B'
            }]}>
              {tir.inRangePct >= thresholds.tirGoalPct ? '✓' : '⚠'} Goal {thresholds.tirGoalPct}%
            </Text>
          </Pressable>
          <Text style={[s.tirCount, { color: colors.muted }]}>{tir.count} readings</Text>
        </View>

        {/* TIR bar */}
        <View style={s.tirBarTrack}>
          {tir.abovePct > 0 && (
            <View style={[s.tirBarSegment, { flex: tir.abovePct, backgroundColor: '#EF4444' }]} />
          )}
          {tir.inRangePct > 0 && (
            <View style={[s.tirBarSegment, { flex: tir.inRangePct, backgroundColor: '#F59E0B' }]} />
          )}
          {tir.belowPct > 0 && (
            <View style={[s.tirBarSegment, { flex: tir.belowPct, backgroundColor: '#10B981' }]} />
          )}
        </View>

        {/* TIR pct labels */}
        <View style={s.tirPctRow}>
          <Text style={[s.tirPct, { color: '#EF4444' }]}>{tir.abovePct}% {ds.tirAbove ?? 'above'}</Text>
          <Text style={[s.tirPct, { color: '#F59E0B' }]}>{tir.inRangePct}% {ds.inRange ?? 'in range'}</Text>
          <Text style={[s.tirPct, { color: '#10B981' }]}>{tir.belowPct}% {ds.tirBelow ?? 'below'}</Text>
        </View>

        {/* Legend */}
        <View style={s.legend}>
          {[
            { color: '#EF4444', label: `High (${convert(thresholds.highMgDl, unit)} ${unit})` },
            { color: '#F59E0B', label: `Low (${convert(thresholds.lowMgDl, unit)} ${unit})` },
            { color: '#10B981', label: ds.inRange ?? 'In range' },
          ].map(l => (
            <View key={l.label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: l.color }]} />
              <Text style={[s.legendText, { color: colors.muted }]}>{l.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = (_colors: ReturnType<typeof import('@/hooks/use-colors').useColors>) =>
  StyleSheet.create({
    container: {
      borderRadius: 16,
      borderWidth: 1,
      marginHorizontal: 16,
      marginBottom: 16,
      overflow: 'hidden',
    },
    emptyText: {
      textAlign: 'center',
      padding: 32,
      fontSize: 14,
    },
    chartHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 4,
      gap: 8,
    },
    chartLabel: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
      flex: 1,
    },
    alertLink: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    alertLinkText: {
      fontSize: 12,
      fontWeight: '600',
    },
    tirSection: {
      paddingHorizontal: 12,
      paddingBottom: 14,
      paddingTop: 4,
    },
    tirHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    tirLabel: {
      fontSize: 13,
      fontWeight: '700',
      flex: 1,
    },
    tirGoalBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    tirGoalText: {
      fontSize: 11,
      fontWeight: '700',
    },
    tirCount: {
      fontSize: 11,
    },
    tirBarTrack: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
      marginBottom: 6,
    },
    tirBarSegment: {
      height: 10,
    },
    tirPctRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    tirPct: {
      fontSize: 11,
      fontWeight: '600',
    },
    legend: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 11,
    },
  });
