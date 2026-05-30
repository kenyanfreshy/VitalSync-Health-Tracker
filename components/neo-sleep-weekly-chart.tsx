/**
 * NeoSleepWeeklyChart
 *
 * An independent full-width chart showing 7 nights of sleep stage data
 * in the NeoVitals lane style (Deep / Core / REM / Awake).
 *
 * Features:
 *  - Stacked stage bars per night (Deep / Core / REM / Awake)
 *  - Goal dashed line with label
 *  - Sleep Goal Progress ring: SVG arc showing nights-hit / 7
 *  - Best / Worst Night chips below the chart
 *
 * Color palette:
 *   Deep  — indigo  #818CF8 → #4F46E5
 *   Core  — sky     #38BDF8 → #0EA5E9
 *   REM   — cyan    #22D3EE → #06B6D4
 *   Awake — coral   #FF6B8A → #F43F5E
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import Svg, {
  Rect,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Path,
} from 'react-native-svg';
import type { SleepRecord } from '@/lib/health/types';
import type { useColors } from '@/hooks/use-colors';
import { useLang } from '@/hooks';
import { logStrings } from '@/lib/i18n';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 16;
// Full screen width: the chart breaks out of the scroll padding via negative margin
const CHART_W = SCREEN_W - H_PAD * 2;
const DAYS = 7;
const BAR_GAP = 5;
const BAR_W = (CHART_W - BAR_GAP * (DAYS + 1)) / DAYS;
const CHART_H = 110;
const BAR_AREA_H = 80;
const BAR_AREA_TOP = 6;
const LABEL_H = 22;

// Goal progress ring dimensions
const RING_R = 22;
const RING_CX = 22;
const RING_CY = 22;
const RING_STROKE = 5;
const RING_SVG_SIZE = 44;

const STAGE_COLORS = {
  deep:  { from: '#818CF8', to: '#4F46E5' },
  core:  { from: '#38BDF8', to: '#0EA5E9' },
  rem:   { from: '#22D3EE', to: '#06B6D4' },
  awake: { from: '#FF6B8A', to: '#F43F5E' },
} as const;

type StageKey = keyof typeof STAGE_COLORS;
const STAGE_ORDER: StageKey[] = ['deep', 'core', 'rem', 'awake'];

/** Return YYYY-MM-DD for a date offset from today (0 = today) */
export function ymd(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Return a short weekday label for a date offset from today */
export function dayLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
}

/**
 * Build an SVG arc path for the goal progress ring.
 * ratio: 0–1 (fraction of nights that hit the goal)
 */
function arcPath(ratio: number, r: number, cx: number, cy: number): string {
  if (ratio <= 0) return '';
  if (ratio >= 1) {
    // Full circle: two half-arcs
    return [
      `M ${cx} ${cy - r}`,
      `A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`,
      'Z',
    ].join(' ');
  }
  const angle = ratio * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y}`;
}

type Slot = {
  label: string;
  isToday: boolean;
  totalMins: number;
  stages: { deep: number; core: number; rem: number; awake: number };
  hrs: number;
};

/** Build 7 day slots from records */
export function buildSlots(records: SleepRecord[]): Slot[] {
  const dayMap: Record<string, SleepRecord> = {};
  for (const r of records) {
    const key = r.bedtime.slice(0, 10);
    const existing = dayMap[key];
    if (!existing || r.bedtime > existing.bedtime) {
      dayMap[key] = r;
    }
  }
  return Array.from({ length: DAYS }, (_, i) => {
    const offset = DAYS - 1 - i; // 6 → 0
    const key = ymd(offset);
    const record = dayMap[key] ?? null;
    const totalMins = record?.totalMinutes ?? 0;
    const deepMins = record?.deepMinutes ?? 0;
    const remMins = record?.remMinutes ?? 0;
    const coreMins = record?.coreMinutes != null
      ? record.coreMinutes
      : Math.max(0, totalMins - deepMins - remMins - (record?.awakeMinutes ?? 0));
    const awakeMins = record?.awakeMinutes ?? 0;
    return {
      label: offset === 0 ? 'Today' : dayLabel(offset),
      isToday: offset === 0,
      totalMins,
      stages: { deep: deepMins, core: coreMins, rem: remMins, awake: awakeMins },
      hrs: totalMins / 60,
    };
  });
}

/** Count how many nights hit >= 90% of goal */
export function countGoalNights(slots: Slot[], goalHrs: number): number {
  return slots.filter(s => s.hrs > 0 && s.hrs / goalHrs >= 0.9).length;
}

/** Return the slot with the most sleep (best night) among nights with data */
export function bestNight(slots: Slot[]): Slot | null {
  const withData = slots.filter(s => s.totalMins > 0);
  if (withData.length === 0) return null;
  return withData.reduce((a, b) => (a.hrs >= b.hrs ? a : b));
}

/** Return the slot with the least sleep (worst night) among nights with data */
export function worstNight(slots: Slot[]): Slot | null {
  const withData = slots.filter(s => s.totalMins > 0);
  if (withData.length === 0) return null;
  return withData.reduce((a, b) => (a.hrs <= b.hrs ? a : b));
}

// ─── Chronotype inference ────────────────────────────────────────────────────

export type Chronotype = 'early_bird' | 'intermediate' | 'night_owl' | null;

export interface ChronotypeResult {
  type: Chronotype;
  emoji: string;
  label: string;
  description: string;
  avgBedtimeHour: number | null; // decimal hour, e.g. 22.5 = 10:30 PM
}

/**
 * Infer chronotype from an array of bedtime ISO strings.
 * Classification based on MCTQ (Munich Chronotype Questionnaire) thresholds:
 *   Early Bird:    avg bedtime < 22:00 (10 PM)
 *   Intermediate:  avg bedtime 22:00 – 23:30
 *   Night Owl:     avg bedtime > 23:30 (11:30 PM)
 * Bedtimes after midnight (00:00–05:59) are treated as the previous night
 * by adding 24 to the hour so they sort correctly.
 */
export function inferChronotype(bedtimes: string[], strings?: typeof logStrings['en']): ChronotypeResult {
  const validHours = bedtimes
    .map(bt => {
      const timePart = bt.includes('T') ? bt.split('T')[1] : bt;
      const [hStr, mStr] = timePart.split(':');
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr ?? '0', 10);
      // Treat 00:00–05:59 as late-night (add 24) so average is correct
      if (h >= 0 && h < 6) h += 24;
      return h + m / 60;
    })
    .filter(h => !isNaN(h));

  if (validHours.length === 0) {
    return { type: null, emoji: '', label: '', description: '', avgBedtimeHour: null };
  }

  const avg = validHours.reduce((a, b) => a + b, 0) / validHours.length;
  // Normalise back to 0–24 range for display
  const displayHour = avg >= 24 ? avg - 24 : avg;

  if (avg < 22) {
    return {
      type: 'early_bird',
      emoji: '🐦',
      label: strings?.chronotypeEarlyBird ?? 'Early Bird',
      description: strings?.earlyBirdDesc ?? 'You tend to sleep before 10 PM — aligned with natural dawn light cycles.',
      avgBedtimeHour: displayHour,
    };
  } else if (avg <= 23.5) {
    return {
      type: 'intermediate',
      emoji: '🌙',
      label: strings?.chronotypeIntermediate ?? 'Intermediate',
      description: strings?.intermediateDesc ?? 'Your bedtime falls in the typical range for most adults (10–11:30 PM).',
      avgBedtimeHour: displayHour,
    };
  } else {
    return {
      type: 'night_owl',
      emoji: '🦉',
      label: strings?.chronotypeNightOwl ?? 'Night Owl',
      description: strings?.nightOwlDesc ?? 'You tend to sleep after 11:30 PM — your circadian rhythm runs late.',
      avgBedtimeHour: displayHour,
    };
  }
}

/** Format a decimal hour as HH:MM AM/PM, e.g. 22.5 → "10:30 PM" */
export function formatHour(h: number): string {
  const totalMins = Math.round(h * 60);
  const hours24 = Math.floor(totalMins / 60) % 24;
  const mins = totalMins % 60;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

type Props = {
  records: SleepRecord[];
  goalHrs: number;
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
};

export function NeoSleepWeeklyChart({ records, goalHrs, colors, isDark }: Props) {
  const lang = useLang();
  const t = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const slots = useMemo(() => buildSlots(records), [records]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Chronotype inference from actual bedtime strings
  const chronotype = useMemo(() => {
    const bedtimes = records
      .filter(r => r.bedtime)
      .map(r => r.bedtime)
      // pass t for translated labels
      // (reassigned below in inferChronotype call)
      // Only past 7 nights
      .filter(bt => {
        const key = bt.slice(0, 10);
        const sevenDaysAgo = ymd(6);
        return key >= sevenDaysAgo;
      });
    return inferChronotype(bedtimes, t);
  }, [records, t]);

  const maxHrs = Math.max(goalHrs * 1.2, ...slots.map(s => s.hrs), 1);
  const goalY = BAR_AREA_TOP + BAR_AREA_H * (1 - goalHrs / maxHrs);

  const hasAnyData = slots.some(s => s.totalMins > 0);
  const hasStageData = slots.some(s => s.stages.deep > 0 || s.stages.rem > 0);

  // Goal progress ring
  const goalNights = useMemo(() => countGoalNights(slots, goalHrs), [slots, goalHrs]);
  const goalRatio = goalNights / DAYS;
  const ringColor = goalNights >= 5 ? '#22C55E' : goalNights >= 3 ? '#F59E0B' : '#EF4444';
  const ringArc = arcPath(goalRatio, RING_R - RING_STROKE / 2, RING_CX, RING_CY);

  // Best / Worst night
  const best = useMemo(() => bestNight(slots), [slots]);
  const worst = useMemo(() => worstNight(slots), [slots]);

  // 3D glass colours
  const glassBg = isDark
    ? 'rgba(10, 14, 26, 0.82)'
    : 'rgba(238, 242, 255, 0.88)';
  const borderColor = isDark ? 'rgba(129,140,248,0.30)' : 'rgba(99,102,241,0.22)';
  const shimmerColor = isDark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(255, 255, 255, 0.60)';
  const shadowColor = isDark ? 'rgba(0,0,0,0.50)' : 'rgba(99,102,241,0.14)';
  const axisText = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const emptyBarColor = isDark ? '#1E2535' : '#E5E7EB';
  const chipBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const _chipBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  function hrsChip(slot: Slot): string {
    const h = Math.floor(slot.hrs);
    const m = slot.totalMins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: glassBg,
        borderColor,
        shadowColor,
      },
    ]}>
      {/* Top shimmer highlight — 3D glass top edge */}
      <View style={[styles.shimmerTop, { backgroundColor: shimmerColor }]} />
      {/* NeoVitals accent bar */}
      <View style={[styles.accentBar, { backgroundColor: '#818CF8' }]} />

      {/* Header row: title + legend + goal ring */}
      <View style={styles.header}>
        {/* Left: title + subtitle */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
            {t.logSleepTitle ?? 'NeoSleep · 7-Night Overview'}
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {hasStageData ? (t.stageBreakdownPerNight ?? 'Stage breakdown per night') : (t.totalSleepPerNight ?? 'Total sleep per night')}
          </Text>
          {/* Stage legend */}
          <View style={[styles.legend, { marginTop: 6 }]}>
            {STAGE_ORDER.map(key => (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: STAGE_COLORS[key].from }]} />
                <Text style={[styles.legendLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Right: Goal Progress Ring */}
        <View style={styles.ringWrap}>
          <Svg width={RING_SVG_SIZE} height={RING_SVG_SIZE}>
            {/* Track circle */}
            <Circle
              cx={RING_CX}
              cy={RING_CY}
              r={RING_R - RING_STROKE / 2}
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Progress arc */}
            {goalRatio > 0 && (
              <Path
                d={ringArc}
                stroke={ringColor}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
              />
            )}
          </Svg>
          {/* Centre label */}
          <View style={styles.ringLabel}>
            <Text style={[styles.ringCount, { color: ringColor }]}>{goalNights}</Text>
            <Text style={[styles.ringOf, { color: isDark ? '#94A3B8' : '#64748B' }]}>/7</Text>
          </View>
          <Text style={[styles.ringCaption, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {t.nightsOnGoal ?? 'nights\non goal'}
          </Text>
          {/* Chronotype chip */}
          {chronotype.type !== null && (
            <View style={[
              styles.chronoChip,
              {
                backgroundColor: isDark ? 'rgba(129,140,248,0.12)' : 'rgba(99,102,241,0.08)',
                borderColor: isDark ? 'rgba(129,140,248,0.30)' : 'rgba(99,102,241,0.22)',
              },
            ]}>
              <Text style={styles.chronoEmoji}>{chronotype.emoji}</Text>
              <Text style={[styles.chronoLabel, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>
                {chronotype.label}
              </Text>
            </View>
          )}
        </View>
      </View>
      {/* Chronotype description row */}
      {chronotype.type !== null && (
        <View style={[
          styles.chronoRow,
          { borderTopColor: isDark ? 'rgba(129,140,248,0.12)' : 'rgba(99,102,241,0.10)' },
        ]}>
          <Text style={styles.chronoEmojiBig}>{chronotype.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.chronoRowLabel, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>
              {chronotype.label}
              {chronotype.avgBedtimeHour !== null && ` · avg bedtime ${formatHour(chronotype.avgBedtimeHour)}`}
            </Text>
            <Text style={[styles.chronoRowDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {chronotype.description}
            </Text>
          </View>
        </View>
      )}

      {/* Tap tooltip */}
      {selectedIdx !== null && slots[selectedIdx] && slots[selectedIdx].totalMins > 0 && (() => {
        const s = slots[selectedIdx];
        const h = Math.floor(s.hrs);
        const m = s.totalMins % 60;
        const hrsStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        const tooltipBg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.97)';
        const tooltipBorder = isDark ? 'rgba(129,140,248,0.35)' : 'rgba(99,102,241,0.25)';
        const stages = [
          { key: 'deep', label: 'Deep', color: '#818CF8' },
          { key: 'rem', label: 'REM', color: '#22D3EE' },
          { key: 'core', label: 'Core', color: '#38BDF8' },
          { key: 'awake', label: 'Awake', color: '#FF6B8A' },
        ] as const;
        return (
          <View style={[styles.tooltip, { backgroundColor: tooltipBg, borderColor: tooltipBorder }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.tooltipTitle, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
                {s.label}{s.isToday ? ' (Today)' : ''} · {hrsStr}
              </Text>
              <Pressable
                onPress={() => setSelectedIdx(null)}
                style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 2 }]}
              >
                <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>✕</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {stages.map(({ key, label, color }) => {
                const mins = s.stages[key];
                if (mins <= 0) return null;
                const pct = Math.round((mins / s.totalMins) * 100);
                const stageH = Math.floor(mins / 60);
                const stageM = mins % 60;
                const stageStr = stageH > 0 ? `${stageH}h ${stageM}m` : `${stageM}m`;
                return (
                  <View key={key} style={styles.tooltipStageRow}>
                    <View style={[styles.tooltipDot, { backgroundColor: color }]} />
                    <Text style={[styles.tooltipStageLabel, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                      {label}
                    </Text>
                    <Text style={[styles.tooltipStageVal, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
                      {stageStr} ({pct}%)
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {!hasAnyData ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>
            No sleep data for the past 7 nights.{`\n`}Log your first entry above.
          </Text>
        </View>
      ) : (
        <>
          <View style={{ position: 'relative', width: CHART_W, height: CHART_H }}>
          <Svg width={CHART_W} height={CHART_H}>
            <Defs>
              {STAGE_ORDER.map(key => (
                <LinearGradient key={key} id={`neo_${key}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={STAGE_COLORS[key].from} stopOpacity="1" />
                  <Stop offset="1" stopColor={STAGE_COLORS[key].to} stopOpacity="0.75" />
                </LinearGradient>
              ))}
            </Defs>

            {/* Bars */}
            {slots.map((slot, i) => {
              const x = BAR_GAP + i * (BAR_W + BAR_GAP);
              if (slot.totalMins === 0) {
                return (
                  <Rect
                    key={i}
                    x={x}
                    y={BAR_AREA_TOP + BAR_AREA_H - 3}
                    width={BAR_W}
                    height={3}
                    rx={2}
                    fill={emptyBarColor}
                    opacity={0.5}
                  />
                );
              }

              const totalBarH = Math.max(6, BAR_AREA_H * (slot.hrs / maxHrs));
              const barBottom = BAR_AREA_TOP + BAR_AREA_H;

              if (!hasStageData || (slot.stages.deep === 0 && slot.stages.rem === 0)) {
                return (
                  <Rect
                    key={i}
                    x={x}
                    y={barBottom - totalBarH}
                    width={BAR_W}
                    height={totalBarH}
                    rx={4}
                    fill="url(#neo_deep)"
                    opacity={slot.isToday ? 1 : 0.8}
                  />
                );
              }

              const stageOrder: StageKey[] = ['awake', 'core', 'rem', 'deep'];
              let yOffset = barBottom;
              return (
                <React.Fragment key={i}>
                  {stageOrder.map(key => {
                    const stageMins = slot.stages[key];
                    if (stageMins <= 0) return null;
                    const segH = Math.max(2, totalBarH * (stageMins / slot.totalMins));
                    yOffset -= segH;
                    return (
                      <Rect
                        key={key}
                        x={x}
                        y={yOffset}
                        width={BAR_W}
                        height={segH}
                        rx={key === 'deep' ? 4 : 0}
                        fill={`url(#neo_${key})`}
                        opacity={slot.isToday ? 1 : 0.82}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Selected bar glow ring */}
            {selectedIdx !== null && slots[selectedIdx]?.totalMins > 0 && (() => {
              const i = selectedIdx;
              const x = BAR_GAP + i * (BAR_W + BAR_GAP);
              const totalBarH = Math.max(6, BAR_AREA_H * (slots[i].hrs / maxHrs));
              const barBottom = BAR_AREA_TOP + BAR_AREA_H;
              const ringPad = 3;
              return (
                <Rect
                  key="glow-ring"
                  x={x - ringPad}
                  y={barBottom - totalBarH - ringPad}
                  width={BAR_W + ringPad * 2}
                  height={totalBarH + ringPad * 2}
                  rx={6}
                  fill="none"
                  stroke="#818CF8"
                  strokeWidth={2}
                  strokeOpacity={0.85}
                  strokeDasharray="0"
                />
              );
            })()}

            {/* Goal dashed line */}
            <Line
              x1={BAR_GAP / 2}
              y1={goalY}
              x2={CHART_W - BAR_GAP / 2}
              y2={goalY}
              stroke="#818CF8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.65}
            />
            <SvgText
              x={CHART_W - BAR_GAP}
              y={goalY - 3}
              fontSize={8.5}
              fill="#818CF8"
              textAnchor="end"
              opacity={0.85}
            >
              {`${goalHrs}h goal`}
            </SvgText>

            {/* Day labels + hour labels */}
            {slots.map((slot, i) => {
              const cx = BAR_GAP + i * (BAR_W + BAR_GAP) + BAR_W / 2;
              const labelColor = slot.isToday ? '#818CF8' : axisText;
              const hrLabel = slot.hrs >= 1
                ? `${Math.floor(slot.hrs)}h`
                : slot.hrs > 0
                  ? `${Math.round(slot.hrs * 60)}m`
                  : '';
              const barH = slot.totalMins > 0
                ? Math.max(6, BAR_AREA_H * (slot.hrs / maxHrs))
                : 0;
              const hrY = BAR_AREA_TOP + BAR_AREA_H - barH - 3;

              return (
                <React.Fragment key={i}>
                  <SvgText
                    x={cx}
                    y={BAR_AREA_TOP + BAR_AREA_H + LABEL_H - 4}
                    fontSize={9}
                    fill={labelColor}
                    textAnchor="middle"
                    fontWeight={slot.isToday ? 'bold' : 'normal'}
                  >
                    {slot.label}
                  </SvgText>
                  {hrLabel.length > 0 && (
                    <SvgText
                      x={cx}
                      y={hrY}
                      fontSize={8}
                      fill={isDark ? '#CBD5E1' : '#374151'}
                      textAnchor="middle"
                      opacity={0.85}
                    >
                      {hrLabel}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
          </Svg>
          {/* Invisible tap zones overlaid on SVG */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
            {slots.map((slot, i) => {
              const x = BAR_GAP + i * (BAR_W + BAR_GAP);
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    left: x,
                    top: 0,
                    width: BAR_W + BAR_GAP,
                    height: CHART_H,
                    backgroundColor: pressed && slot.totalMins > 0 ? 'rgba(129,140,248,0.12)' : 'transparent',
                    borderRadius: 4,
                  })}
                  onPress={() => {
                    if (slot.totalMins > 0) {
                      setSelectedIdx(prev => (prev === i ? null : i));
                    }
                  }}
                />
              );
            })}
          </View>
          </View>

          {/* Best / Worst Night chips */}
          {(best || worst) && (
            <View style={[styles.chipRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
              {best && (
                <View style={[styles.chip, { backgroundColor: chipBg, borderColor: '#22C55E40' }]}>
                  <Text style={styles.chipEmoji}>🏆</Text>
                  <View>
                    <Text style={[styles.chipLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{t.bestChip ?? 'Best'}</Text>
                    <Text style={[styles.chipValue, { color: '#22C55E' }]}>
                      {best.label} · {hrsChip(best)}
                    </Text>
                  </View>
                </View>
              )}
              {worst && best && worst.label !== best.label && (
                <View style={[styles.chip, { backgroundColor: chipBg, borderColor: '#EF444440' }]}>
                  <Text style={styles.chipEmoji}>📉</Text>
                  <View>
                    <Text style={[styles.chipLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{t.shortestChip ?? 'Shortest'}</Text>
                    <Text style={[styles.chipValue, { color: '#EF4444' }]}>
                      {worst.label} · {hrsChip(worst)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
    // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    // Android elevation
    elevation: 7,
  },
  shimmerTop: {
    height: 1.5,
    width: '70%',
    alignSelf: 'center',
    borderRadius: 1,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    marginTop: 1,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  // Goal progress ring
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SVG_SIZE,
    height: RING_SVG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 0,
  },
  ringCount: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  ringOf: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 2,
  },
  ringCaption: {
    fontSize: 8.5,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 12,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  // Best / Worst chips
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipEmoji: {
    fontSize: 16,
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  // Chronotype chip (inside ring column)
  chronoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 5,
  },
  chronoEmoji: {
    fontSize: 11,
  },
  chronoLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  // Chronotype description row (below header, above chart)
  chronoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chronoEmojiBig: {
    fontSize: 18,
    lineHeight: 22,
  },
  chronoRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  chronoRowDesc: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  // Tap tooltip
  tooltip: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tooltipStageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: '45%',
  },
  tooltipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  tooltipStageLabel: {
    fontSize: 10,
    fontWeight: '500',
    width: 32,
  },
  tooltipStageVal: {
    fontSize: 10,
    fontWeight: '600',
  },
});
