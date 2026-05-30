/**
 * SodiumTrendChart
 *
 * 7-day bar chart showing daily sodium (Na) and potassium (K) intake.
 * Reference lines:
 *   - 2,300 mg FDA sodium limit (red dashed)
 *   - 1,500 mg AHA sodium target (amber dashed)
 *   - 3,500 mg WHO potassium target (green dashed)
 *
 * Each day shows two side-by-side bars: Na (coral) and K (teal).
 * Tapping a day shows a tooltip with exact values and Na:K ratio.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks';
import type { SodiumRecord } from '@/lib/health/types';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48;   // 24px padding each side
const CHART_H  = 160;
const PAD_L    = 44;               // left axis labels
const PAD_R    = 8;
const PAD_T    = 12;
const PAD_B    = 28;               // day labels
const PLOT_W   = CHART_W - PAD_L - PAD_R;
const PLOT_H   = CHART_H - PAD_T - PAD_B;

// Reference lines (mg)
const REF_FDA  = 2300;
const REF_AHA  = 1500;
const REF_WHO_K = 3500;

// Color constants
const NA_COLOR = '#EF4444';   // coral-red for sodium
const K_COLOR  = '#10B981';   // teal-green for potassium
const FDA_COLOR = '#EF4444';
const AHA_COLOR = '#F59E0B';
const WHO_COLOR = '#10B981';

interface DayData {
  label: string;   // e.g. "Mon"
  dateStr: string; // YYYY-MM-DD
  naMg: number;
  kMg: number;
}

function buildLast7Days(records: SodiumRecord[]): DayData[] {
  const days: DayData[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dateStr = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
    const dayRecords = records.filter(r => r.timestamp.startsWith(dateStr));
    const naMg = dayRecords.reduce((s, r) => s + r.sodiumMg, 0);
    const kMg  = dayRecords.reduce((s, r) => s + (r.potassiumMg ?? 0), 0);
    days.push({ label, dateStr, naMg, kMg });
  }
  return days;
}

interface Props {
  records: SodiumRecord[];
}

export function SodiumTrendChart({ records }: Props) {
  const colors = useColors();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const days = useMemo(() => buildLast7Days(records), [records]);
  const hasData = days.some(d => d.naMg > 0 || d.kMg > 0);

  // Compute y-axis max: highest of (max Na, max K, REF_WHO_K + 10%)
  const maxVal = useMemo(() => {
    const maxNa = Math.max(...days.map(d => d.naMg), REF_FDA);
    const maxK  = Math.max(...days.map(d => d.kMg),  REF_WHO_K);
    return Math.ceil(Math.max(maxNa, maxK) * 1.1 / 500) * 500;
  }, [days]);

  function yPos(mg: number): number {
    return PAD_T + PLOT_H - (mg / maxVal) * PLOT_H;
  }

  function yLabel(mg: number): string {
    return mg >= 1000 ? `${(mg / 1000).toFixed(1)}k` : String(mg);
  }

  // Bar geometry: 7 groups, 2 bars each
  const groupW = PLOT_W / 7;
  const barW   = Math.max(groupW * 0.32, 4);
  const gap    = groupW * 0.04;

  const selected = selectedDay !== null ? days[selectedDay] : null;

  return (
    <View style={[s.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {/* Header */}
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>7-Day Na & K Trend</Text>
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: NA_COLOR }]} />
            <Text style={[s.legendLabel, { color: colors.muted }]}>Sodium</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: K_COLOR }]} />
            <Text style={[s.legendLabel, { color: colors.muted }]}>Potassium</Text>
          </View>
        </View>
      </View>

      {/* Tooltip */}
      {selected && (
        <View style={[s.tooltip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.tooltipDate, { color: colors.muted }]}>{selected.label} · {selected.dateStr}</Text>
          <View style={s.tooltipRow}>
            <Text style={[s.tooltipVal, { color: NA_COLOR }]}>🧂 {selected.naMg.toLocaleString()} mg Na</Text>
            <Text style={[s.tooltipVal, { color: K_COLOR  }]}>🍌 {selected.kMg.toLocaleString()} mg K</Text>
          </View>
          {selected.kMg > 0 && (
            <Text style={[s.tooltipRatio, { color: colors.muted }]}>
              Na:K = {(selected.naMg / selected.kMg).toFixed(2)}
              {(selected.naMg / selected.kMg) < 2 ? ' ✓ Good' : (selected.naMg / selected.kMg) < 3.5 ? ' ◈ Borderline' : ' ⚠ Elevated'}
            </Text>
          )}
        </View>
      )}

      {/* Chart */}
      {!hasData ? (
        <View style={s.emptyState}>
          <Text style={[s.emptyText, { color: colors.muted }]}>
            Log sodium and potassium entries to see your 7-day trend.
          </Text>
        </View>
      ) : (
        <Svg width={CHART_W} height={CHART_H}>
          {/* Y-axis grid lines and labels */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
            const mg = Math.round(maxVal * frac);
            const y  = yPos(mg);
            return (
              <React.Fragment key={frac}>
                <Line
                  x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y}
                  stroke={colors.border} strokeWidth={0.5} strokeDasharray="3,3"
                />
                <SvgText
                  x={PAD_L - 4} y={y + 4}
                  fontSize={9} fill={colors.muted} textAnchor="end"
                >
                  {yLabel(mg)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Reference lines */}
          {/* FDA 2300 */}
          <Line
            x1={PAD_L} y1={yPos(REF_FDA)} x2={CHART_W - PAD_R} y2={yPos(REF_FDA)}
            stroke={FDA_COLOR} strokeWidth={1} strokeDasharray="5,3" opacity={0.7}
          />
          <SvgText x={CHART_W - PAD_R - 2} y={yPos(REF_FDA) - 3} fontSize={8} fill={FDA_COLOR} textAnchor="end">
            FDA 2.3k
          </SvgText>

          {/* AHA 1500 */}
          <Line
            x1={PAD_L} y1={yPos(REF_AHA)} x2={CHART_W - PAD_R} y2={yPos(REF_AHA)}
            stroke={AHA_COLOR} strokeWidth={1} strokeDasharray="5,3" opacity={0.7}
          />
          <SvgText x={CHART_W - PAD_R - 2} y={yPos(REF_AHA) - 3} fontSize={8} fill={AHA_COLOR} textAnchor="end">
            AHA 1.5k
          </SvgText>

          {/* WHO K target 3500 */}
          {maxVal >= REF_WHO_K && (
            <>
              <Line
                x1={PAD_L} y1={yPos(REF_WHO_K)} x2={CHART_W - PAD_R} y2={yPos(REF_WHO_K)}
                stroke={WHO_COLOR} strokeWidth={1} strokeDasharray="5,3" opacity={0.7}
              />
              <SvgText x={PAD_L + 2} y={yPos(REF_WHO_K) - 3} fontSize={8} fill={WHO_COLOR} textAnchor="start">
                K target 3.5k
              </SvgText>
            </>
          )}

          {/* Bars */}
          {days.map((day, i) => {
            const groupX = PAD_L + i * groupW;
            const naX = groupX + gap;
            const kX  = naX + barW + gap;
            const naH = (day.naMg / maxVal) * PLOT_H;
            const kH  = (day.kMg  / maxVal) * PLOT_H;
            const naY = PAD_T + PLOT_H - naH;
            const kY  = PAD_T + PLOT_H - kH;
            const isSelected = selectedDay === i;

            return (
              <React.Fragment key={day.dateStr}>
                {/* Na bar */}
                {day.naMg > 0 && (
                  <Rect
                    x={naX} y={naY} width={barW} height={naH}
                    rx={2} fill={NA_COLOR}
                    opacity={isSelected ? 1 : 0.75}
                  />
                )}
                {/* K bar */}
                {day.kMg > 0 && (
                  <Rect
                    x={kX} y={kY} width={barW} height={kH}
                    rx={2} fill={K_COLOR}
                    opacity={isSelected ? 1 : 0.75}
                  />
                )}
                {/* Day label */}
                <SvgText
                  x={groupX + groupW / 2} y={CHART_H - 6}
                  fontSize={10} fill={isSelected ? colors.accent : colors.muted}
                  textAnchor="middle" fontWeight={isSelected ? '700' : '400'}
                >
                  {day.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      )}

      {/* Tap targets for each day column */}
      {hasData && (
        <View style={[s.tapRow, { top: PAD_T, height: PLOT_H + PAD_B, left: PAD_L }]}>
          {days.map((_, i) => (
            <Pressable
              key={i}
              style={{ width: groupW, height: PLOT_H + PAD_B }}
              onPress={() => setSelectedDay(selectedDay === i ? null : i)}
            />
          ))}
        </View>
      )}

      {/* Reference legend */}
      <View style={s.refRow}>
        <Text style={[s.refItem, { color: FDA_COLOR }]}>— FDA 2,300 mg</Text>
        <Text style={[s.refItem, { color: AHA_COLOR }]}>— AHA 1,500 mg</Text>
        <Text style={[s.refItem, { color: WHO_COLOR }]}>— K target 3,500 mg</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    marginBottom: 16, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11 },

  tooltip: {
    borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8, gap: 4,
  },
  tooltipDate: { fontSize: 11 },
  tooltipRow: { flexDirection: 'row', gap: 16 },
  tooltipVal: { fontSize: 13, fontWeight: '700' },
  tooltipRatio: { fontSize: 11 },

  emptyState: {
    height: CHART_H, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  tapRow: {
    position: 'absolute', flexDirection: 'row',
  },

  refRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6,
  },
  refItem: { fontSize: 10, fontWeight: '600' },
});
