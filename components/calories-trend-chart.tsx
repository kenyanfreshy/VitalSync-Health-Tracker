/**
 * CaloriesTrendChart
 *
 * 7-day grouped bar chart for diabetic patients showing:
 *   - Daily calorie total (blue bar)
 *   - Daily carbohydrate total (amber bar)
 *   - Daily cumulative glycemic load (orange dot + line overlay)
 *
 * Reference lines:
 *   - 2,000 kcal ADA daily calorie target (blue dashed)
 *   - 180 g ADA carb target (amber dashed)
 *
 * Tapping a day column shows a tooltip with exact values and a
 * plain-English blood-sugar impact note based on the day's GL.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Circle, Text as SvgText, Path } from 'react-native-svg';
import { useColors } from '@/hooks';
import type { SodiumRecord } from '@/lib/health/types';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48;
const CHART_H  = 170;
const PAD_L    = 44;
const PAD_R    = 8;
const PAD_T    = 14;
const PAD_B    = 28;
const PLOT_W   = CHART_W - PAD_L - PAD_R;
const PLOT_H   = CHART_H - PAD_T - PAD_B;

// ADA reference values
const ADA_KCAL  = 2000;   // kcal/day
const ADA_CARBS = 180;    // g/day (45–60 g per meal × 3 meals)
const ADA_GL_HIGH = 100;  // daily GL threshold for "high"

// Chart colours
const CAL_COLOR  = '#0EA5E9';   // sky blue — calories
const CARB_COLOR = '#F59E0B';   // amber — carbs
const GL_COLOR   = '#F97316';   // orange — glycemic load line
const ADA_CAL_COLOR  = '#0EA5E9';
const _ADA_CARB_COLOR = '#F59E0B';

interface DayData {
  label: string;
  dateStr: string;
  kcal: number;
  carbsG: number;
  gl: number;
  sugarG: number;
  fiberG: number;
  proteinG: number;
  fatG: number;
  entryCount: number;
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
    const dayRecs = records.filter(r => r.timestamp.startsWith(dateStr));
    const nutriRecs = dayRecs.filter(r => r.calories != null || r.carbsG != null);
    days.push({
      label,
      dateStr,
      kcal:     dayRecs.reduce((s, r) => s + (r.calories    ?? 0), 0),
      carbsG:   dayRecs.reduce((s, r) => s + (r.carbsG      ?? 0), 0),
      gl:       dayRecs.reduce((s, r) => s + (r.glycemicLoad ?? 0), 0),
      sugarG:   dayRecs.reduce((s, r) => s + (r.sugarG      ?? 0), 0),
      fiberG:   dayRecs.reduce((s, r) => s + (r.fiberG      ?? 0), 0),
      proteinG: dayRecs.reduce((s, r) => s + (r.proteinG    ?? 0), 0),
      fatG:     dayRecs.reduce((s, r) => s + (r.fatG        ?? 0), 0),
      entryCount: nutriRecs.length,
    });
  }
  return days;
}

function glImpact(gl: number): string {
  if (gl === 0) return 'No data';
  if (gl <= 40)  return 'Low glycemic impact';
  if (gl <= 100) return 'Moderate — monitor post-meal glucose';
  return 'High — consider reducing carb portions';
}

function glColor(gl: number): string {
  if (gl === 0) return '#9BA1A6';
  if (gl <= 40)  return '#10B981';
  if (gl <= 100) return '#F59E0B';
  return '#EF4444';
}

interface Props {
  records: SodiumRecord[];
}

export function CaloriesTrendChart({ records }: Props) {
  const colors = useColors();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const days = useMemo(() => buildLast7Days(records), [records]);
  const hasData = days.some(d => d.kcal > 0 || d.carbsG > 0);

  // ── Y-axis: calories scale (left) ──────────────────────────────────────────
  const maxKcal = useMemo(() => {
    const peak = Math.max(...days.map(d => d.kcal), ADA_KCAL);
    return Math.ceil(peak * 1.1 / 500) * 500;
  }, [days]);

  // ── Secondary Y-axis: carbs scale (right, shared plot height) ─────────────
  // We render carbs bars scaled to a max of ADA_CARBS * 1.5 so they fit
  // proportionally alongside calories.
  const maxCarbs = useMemo(() => {
    const peak = Math.max(...days.map(d => d.carbsG), ADA_CARBS);
    return Math.ceil(peak * 1.1 / 50) * 50;
  }, [days]);

  // ── GL line: scale to PLOT_H using ADA_GL_HIGH * 1.5 ─────────────────────
  const maxGL = useMemo(() => {
    const peak = Math.max(...days.map(d => d.gl), ADA_GL_HIGH);
    return Math.ceil(peak * 1.1 / 20) * 20;
  }, [days]);

  function yKcal(v: number) { return PAD_T + PLOT_H - (v / maxKcal) * PLOT_H; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function yCarb(v: number) { return PAD_T + PLOT_H - (v / maxCarbs) * PLOT_H; }
  function yGL(v: number)   { return PAD_T + PLOT_H - (v / maxGL) * PLOT_H; }

  function kLabel(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)); }

  const groupW = PLOT_W / 7;
  const barW   = Math.max(groupW * 0.32, 4);
  const gap    = groupW * 0.04;

  const selected = selectedDay !== null ? days[selectedDay] : null;

  // Build GL polyline path
  const glPath = useMemo(() => {
    const pts = days.map((d, i) => {
      const cx = PAD_L + i * groupW + groupW / 2;
      const cy = yGL(d.gl);
      return `${cx},${cy}`;
    });
    return 'M ' + pts.join(' L ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, maxGL]);

  return (
    <View style={[s.card, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.border }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.cardHeader}>
        <View style={s.titleBlock}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>7-Day Caloric Trend</Text>
          <Text style={[s.cardSub, { color: colors.muted }]}>Calories · Carbs · Glycemic Load</Text>
        </View>
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: CAL_COLOR }]} />
            <Text style={[s.legendLabel, { color: colors.muted }]}>kcal</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: CARB_COLOR }]} />
            <Text style={[s.legendLabel, { color: colors.muted }]}>Carbs</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: GL_COLOR, borderRadius: 2 }]} />
            <Text style={[s.legendLabel, { color: colors.muted }]}>GL</Text>
          </View>
        </View>
      </View>

      {/* ── Tooltip ────────────────────────────────────────────────────────── */}
      {selected && (
        <View style={[s.tooltip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.tooltipHeader}>
            <Text style={[s.tooltipDate, { color: colors.muted }]}>
              {selected.label} · {selected.dateStr}
            </Text>
            {selected.entryCount > 0 && (
              <Text style={[s.tooltipCount, { color: colors.muted }]}>
                {selected.entryCount} Smart-scanned entr{selected.entryCount === 1 ? 'y' : 'ies'}
              </Text>
            )}
          </View>

          {selected.kcal > 0 || selected.carbsG > 0 ? (
            <>
              <View style={s.tooltipGrid}>
                {selected.kcal > 0 && (
                  <View style={s.tooltipCell}>
                    <Text style={[s.tooltipVal, { color: CAL_COLOR }]}>{Math.round(selected.kcal)}</Text>
                    <Text style={[s.tooltipUnit, { color: colors.muted }]}>kcal</Text>
                  </View>
                )}
                {selected.carbsG > 0 && (
                  <View style={s.tooltipCell}>
                    <Text style={[s.tooltipVal, { color: CARB_COLOR }]}>{Math.round(selected.carbsG)}g</Text>
                    <Text style={[s.tooltipUnit, { color: colors.muted }]}>Carbs</Text>
                  </View>
                )}
                {selected.sugarG > 0 && (
                  <View style={s.tooltipCell}>
                    <Text style={[s.tooltipVal, { color: '#EF4444' }]}>{Math.round(selected.sugarG)}g</Text>
                    <Text style={[s.tooltipUnit, { color: colors.muted }]}>Sugar</Text>
                  </View>
                )}
                {selected.fiberG > 0 && (
                  <View style={s.tooltipCell}>
                    <Text style={[s.tooltipVal, { color: '#10B981' }]}>{Math.round(selected.fiberG)}g</Text>
                    <Text style={[s.tooltipUnit, { color: colors.muted }]}>Fiber</Text>
                  </View>
                )}
                {selected.proteinG > 0 && (
                  <View style={s.tooltipCell}>
                    <Text style={[s.tooltipVal, { color: '#8B5CF6' }]}>{Math.round(selected.proteinG)}g</Text>
                    <Text style={[s.tooltipUnit, { color: colors.muted }]}>Protein</Text>
                  </View>
                )}
                {selected.fatG > 0 && (
                  <View style={s.tooltipCell}>
                    <Text style={[s.tooltipVal, { color: colors.foreground }]}>{Math.round(selected.fatG)}g</Text>
                    <Text style={[s.tooltipUnit, { color: colors.muted }]}>Fat</Text>
                  </View>
                )}
              </View>

              {/* GL impact */}
              {selected.gl > 0 && (
                <View style={[s.glBadge, { backgroundColor: glColor(selected.gl) + '18', borderColor: glColor(selected.gl) + '50' }]}>
                  <Text style={[s.glBadgeText, { color: glColor(selected.gl) }]}>
                    GL {Math.round(selected.gl)} · {glImpact(selected.gl)}
                  </Text>
                </View>
              )}

              {/* ADA comparison */}
              {selected.kcal > 0 && (
                <Text style={[s.tooltipAda, { color: colors.muted }]}>
                  ADA target: 1,600–2,400 kcal · {Math.round(selected.carbsG)}g carbs of 180g goal
                  {selected.carbsG > ADA_CARBS ? ' ⚠ over target' : ' ✓'}
                </Text>
              )}
            </>
          ) : (
            <Text style={[s.tooltipEmpty, { color: colors.muted }]}>
              No Smart-scanned nutrition entries for this day.
            </Text>
          )}
        </View>
      )}

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      {!hasData ? (
        <View style={s.emptyState}>
          <Text style={[s.emptyText, { color: colors.muted }]}>
            Scan a food photo or describe a meal by voice to see your 7-day caloric trend.
          </Text>
        </View>
      ) : (
        <Svg width={CHART_W} height={CHART_H}>
          {/* ── Grid lines & Y-axis labels (kcal) ─────────────────────────── */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
            const v = Math.round(maxKcal * frac);
            const y = yKcal(v);
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
                  {kLabel(v)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* ── ADA calorie reference line ─────────────────────────────────── */}
          <Line
            x1={PAD_L} y1={yKcal(ADA_KCAL)} x2={CHART_W - PAD_R} y2={yKcal(ADA_KCAL)}
            stroke={ADA_CAL_COLOR} strokeWidth={1} strokeDasharray="5,3" opacity={0.7}
          />
          <SvgText
            x={CHART_W - PAD_R - 2} y={yKcal(ADA_KCAL) - 3}
            fontSize={8} fill={ADA_CAL_COLOR} textAnchor="end"
          >
            ADA 2k kcal
          </SvgText>

          {/* ── Bars ──────────────────────────────────────────────────────── */}
          {days.map((day, i) => {
            const groupX  = PAD_L + i * groupW;
            const calX    = groupX + gap;
            const carbX   = calX + barW + gap;
            const calH    = (day.kcal   / maxKcal)  * PLOT_H;
            const carbH   = (day.carbsG / maxCarbs)  * PLOT_H;
            const calY    = PAD_T + PLOT_H - calH;
            const carbY   = PAD_T + PLOT_H - carbH;
            const isSel   = selectedDay === i;

            return (
              <React.Fragment key={day.dateStr}>
                {/* Calorie bar */}
                {day.kcal > 0 && (
                  <Rect
                    x={calX} y={calY} width={barW} height={calH}
                    rx={2} fill={CAL_COLOR}
                    opacity={isSel ? 1 : 0.72}
                  />
                )}
                {/* Carb bar */}
                {day.carbsG > 0 && (
                  <Rect
                    x={carbX} y={carbY} width={barW} height={carbH}
                    rx={2} fill={CARB_COLOR}
                    opacity={isSel ? 1 : 0.72}
                  />
                )}
                {/* Day label */}
                <SvgText
                  x={groupX + groupW / 2} y={CHART_H - 6}
                  fontSize={10}
                  fill={isSel ? colors.primary ?? CAL_COLOR : colors.muted}
                  textAnchor="middle"
                  fontWeight={isSel ? '700' : '400'}
                >
                  {day.label}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* ── GL polyline overlay ────────────────────────────────────────── */}
          {days.some(d => d.gl > 0) && (
            <>
              <Path
                d={glPath}
                fill="none"
                stroke={GL_COLOR}
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={0.85}
              />
              {days.map((day, i) => {
                if (day.gl === 0) return null;
                const cx = PAD_L + i * groupW + groupW / 2;
                const cy = yGL(day.gl);
                return (
                  <Circle
                    key={day.dateStr}
                    cx={cx} cy={cy} r={3.5}
                    fill={glColor(day.gl)}
                    stroke={colors.surfaceRaised ?? colors.surface}
                    strokeWidth={1.5}
                  />
                );
              })}
            </>
          )}
        </Svg>
      )}

      {/* ── Tap targets ────────────────────────────────────────────────────── */}
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

      {/* ── Reference legend ───────────────────────────────────────────────── */}
      <View style={s.refRow}>
        <Text style={[s.refItem, { color: ADA_CAL_COLOR }]}>— ADA 2,000 kcal</Text>
        <Text style={[s.refItem, { color: GL_COLOR }]}>● GL (daily total)</Text>
        <Text style={[s.refItem, { color: colors.muted }]}>GL &lt;40 low · 41–100 mod · &gt;100 high</Text>
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
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  titleBlock: { gap: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 10 },
  legend: { flexDirection: 'row', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10 },

  tooltip: {
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, gap: 6,
  },
  tooltipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tooltipDate: { fontSize: 11, fontWeight: '600' },
  tooltipCount: { fontSize: 10, fontStyle: 'italic' },
  tooltipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tooltipCell: { alignItems: 'center', minWidth: 48 },
  tooltipVal: { fontSize: 16, fontWeight: '800' },
  tooltipUnit: { fontSize: 10, fontWeight: '600' },
  glBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  glBadgeText: { fontSize: 12, fontWeight: '700' },
  tooltipAda: { fontSize: 10, fontStyle: 'italic' },
  tooltipEmpty: { fontSize: 12, fontStyle: 'italic' },

  emptyState: {
    height: CHART_H, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  tapRow: { position: 'absolute', flexDirection: 'row' },

  refRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  refItem: { fontSize: 10, fontWeight: '600' },
});
