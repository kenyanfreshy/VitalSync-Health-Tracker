/**
 * LabTrendSparkline
 * Shows a mini sparkline chart for each analyte linked to a Medical History condition.
 * Renders one row per analyte with: label, latest value, status badge, and a small SVG trend line.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import { REFERENCE_RANGES, getAnalyteStatus, PANEL_ANALYTES, LAB_PANEL_LABELS, LabAnalyteId, LabPanelId, LabResult } from '@/lib/health/lab-types';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface LabTrendSparklineProps {
  conditionId: string;
}

interface AnalyteSeries {
  analyteId: LabAnalyteId;
  panel: LabPanelId;
  points: { timestamp: number; value: number }[];
  latest: number;
  status: 'normal' | 'low' | 'high';
  unit: string;
  refLow: number;
  refHigh: number;
}

function buildSparklinePath(
  points: { timestamp: number; value: number }[],
  refLow: number,
  refHigh: number,
  w: number,
  h: number,
  pad: number,
): string {
  if (points.length < 2) return '';
  const minT = points[0].timestamp;
  const maxT = points[points.length - 1].timestamp;
  const rangeT = maxT - minT || 1;
  // Use 20% margin around reference range for Y scale
  const margin = (refHigh - refLow) * 0.4;
  const minV = refLow - margin;
  const maxV = refHigh + margin;
  const rangeV = maxV - minV || 1;
  const xs = points.map(p => pad + ((p.timestamp - minT) / rangeT) * (w - pad * 2));
  const ys = points.map(p => h - pad - ((p.value - minV) / rangeV) * (h - pad * 2));
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < points.length; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cpx} ${ys[i - 1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  return d;
}

function buildRefBandY(
  refLow: number,
  refHigh: number,
  w: number,
  h: number,
  pad: number,
): { y1: number; y2: number } {
  const margin = (refHigh - refLow) * 0.4;
  const minV = refLow - margin;
  const maxV = refHigh + margin;
  const rangeV = maxV - minV || 1;
  const y1 = h - pad - ((refHigh - minV) / rangeV) * (h - pad * 2);
  const y2 = h - pad - ((refLow - minV) / rangeV) * (h - pad * 2);
  return { y1, y2 };
}

const SPARKLINE_W = 80;
const SPARKLINE_H = 36;
const SPARKLINE_PAD = 4;

export function LabTrendSparkline({ conditionId }: LabTrendSparklineProps) {
  const colors = useColors();
  const { state } = useHealth();
  const [expanded, setExpanded] = useState(false);

  // Gather all lab results linked to this condition
  const linkedResults: LabResult[] = useMemo(() => {
    return (state.data?.labResults ?? [])
      .filter((lr: LabResult) => lr.linkedConditionId === conditionId)
      .sort((a: LabResult, b: LabResult) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }, [state.data?.labResults, conditionId]);

  // Build per-analyte time series
  const series: AnalyteSeries[] = useMemo(() => {
    if (linkedResults.length === 0) return [];
    const map = new Map<LabAnalyteId, { timestamp: number; value: number }[]>();
    for (const lr of linkedResults) {
      const ts = new Date(lr.timestamp).getTime();
      for (const [key, val] of Object.entries(lr.values)) {
        if (typeof val !== 'number') continue;
        const id = key as LabAnalyteId;
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push({ timestamp: ts, value: val });
      }
    }
    const result: AnalyteSeries[] = [];
    for (const [analyteId, points] of map.entries()) {
      if (points.length === 0) continue;
      const ref = REFERENCE_RANGES[analyteId];
      if (!ref) continue;
      const latest = points[points.length - 1].value;
      const status = getAnalyteStatus(analyteId, latest);
      // Determine which panel this analyte belongs to
      let panel: LabPanelId = 'CMP';
      for (const [p, analytes] of Object.entries(PANEL_ANALYTES)) {
        if ((analytes as string[]).includes(analyteId)) { panel = p as LabPanelId; break; }
      }
      result.push({
        analyteId,
        panel,
        points,
        latest,
        status,
        unit: ref.unit,
        refLow: ref.low,
        refHigh: ref.high,
      });
    }
    // Sort: abnormal first, then by analyte name
    return result.sort((a: AnalyteSeries, b: AnalyteSeries) => {
      const aAbnormal = a.status !== 'normal' ? 0 : 1;
      const bAbnormal = b.status !== 'normal' ? 0 : 1;
      if (aAbnormal !== bAbnormal) return aAbnormal - bAbnormal;
      return a.analyteId.localeCompare(b.analyteId);
    });
  }, [linkedResults]);

  if (linkedResults.length === 0) return null;

  const displaySeries = expanded ? series : series.slice(0, 3);

  const statusColor = (status: 'normal' | 'low' | 'high') => {
    if (status === 'high') return colors.error;
    if (status === 'low') return '#F59E0B';
    return colors.success;
  };

  const statusLabel = (status: 'normal' | 'low' | 'high') => {
    if (status === 'high') return 'HIGH';
    if (status === 'low') return 'LOW';
    return 'NORMAL';
  };

  return (
    <View style={[s.container, { borderTopColor: colors.border }]}>
      <Pressable
        style={({ pressed }) => [s.header, { opacity: pressed ? 0.7 : 1 }]}
        onPress={() => setExpanded(e => !e)}
      >
        <View style={s.headerLeft}>
          <IconSymbol name="chart.line.uptrend.xyaxis" size={14} color={colors.primary} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            Linked Lab Trends
          </Text>
          <View style={[s.countBadge, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[s.countText, { color: colors.primary }]}>{linkedResults.length}</Text>
          </View>
        </View>
        <IconSymbol
          name={expanded ? 'chevron.up' : 'chevron.down'}
          size={14}
          color={colors.muted}
        />
      </Pressable>

      {expanded && (
        <View style={s.body}>
          {displaySeries.map(s2 => {
            const sparkPath = buildSparklinePath(
              s2.points, s2.refLow, s2.refHigh,
              SPARKLINE_W, SPARKLINE_H, SPARKLINE_PAD,
            );
            const { y1, y2 } = buildRefBandY(
              s2.refLow, s2.refHigh,
              SPARKLINE_W, SPARKLINE_H, SPARKLINE_PAD,
            );
            const lineColor = statusColor(s2.status);
            const isAbnormal = s2.status !== 'normal';
            return (
              <View
                key={s2.analyteId}
                style={[
                  row.container,
                  {
                    backgroundColor: isAbnormal
                      ? lineColor + '0D'
                      : colors.surface,
                    borderColor: isAbnormal ? lineColor + '44' : colors.border,
                  },
                ]}
              >
                {/* Left: label + latest value */}
                <View style={row.left}>
                  <Text style={[row.analyte, { color: colors.foreground }]}>
                    {s2.analyteId.charAt(0).toUpperCase() + s2.analyteId.slice(1)}
                  </Text>
                  <Text style={[row.panel, { color: colors.muted }]}>
                    {LAB_PANEL_LABELS[s2.panel]}
                  </Text>
                  <View style={row.valueRow}>
                    <Text style={[row.value, { color: lineColor }]}>
                      {s2.latest.toFixed(1)}
                    </Text>
                    <Text style={[row.unit, { color: colors.muted }]}> {s2.unit}</Text>
                  </View>
                  <View style={[row.badge, { backgroundColor: lineColor + '22' }]}>
                    <Text style={[row.badgeText, { color: lineColor }]}>
                      {statusLabel(s2.status)}
                    </Text>
                  </View>
                </View>

                {/* Right: sparkline */}
                <View style={row.chart}>
                  {s2.points.length >= 2 ? (
                    <Svg width={SPARKLINE_W} height={SPARKLINE_H}>
                      <Defs>
                        <LinearGradient id={`grad-${s2.analyteId}`} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={lineColor} stopOpacity="0.25" />
                          <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
                        </LinearGradient>
                      </Defs>
                      {/* Reference range band */}
                      <Rect
                        x={SPARKLINE_PAD}
                        y={y1}
                        width={SPARKLINE_W - SPARKLINE_PAD * 2}
                        height={Math.max(y2 - y1, 1)}
                        fill={colors.success + '22'}
                      />
                      {/* Trend line */}
                      <Path
                        d={sparkPath}
                        stroke={lineColor}
                        strokeWidth={1.5}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  ) : (
                    <View style={row.singlePoint}>
                      <Text style={[row.singlePointText, { color: colors.muted }]}>
                        1 reading
                      </Text>
                    </View>
                  )}
                  <Text style={[row.rangeText, { color: colors.muted }]}>
                    Ref: {s2.refLow}–{s2.refHigh} {s2.unit}
                  </Text>
                </View>
              </View>
            );
          })}

          {series.length > 3 && (
            <Pressable
              style={({ pressed }) => [s.showMore, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => setExpanded(e => !e)}
            >
              <Text style={[s.showMoreText, { color: colors.primary }]}>
                {expanded && displaySeries.length === series.length
                  ? 'Show less'
                  : `Show ${series.length - 3} more analytes`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  countBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
  },
  body: {
    marginTop: 6,
    gap: 6,
  },
  showMore: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

const row = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 8,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  analyte: {
    fontSize: 12,
    fontWeight: '600',
  },
  panel: {
    fontSize: 10,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  unit: {
    fontSize: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chart: {
    alignItems: 'center',
    gap: 2,
  },
  rangeText: {
    fontSize: 8,
    textAlign: 'center',
  },
  singlePoint: {
    width: SPARKLINE_W,
    height: SPARKLINE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singlePointText: {
    fontSize: 10,
  },
});
