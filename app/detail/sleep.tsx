/**
 * Sleep Detail Screen
 * Sleep stage breakdown, efficiency score, stacked bar chart.
 */

import { safeFormatDate, safeFormatTime } from '@/lib/utils';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Dimensions, useColorScheme, TextInput, Pressable } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { StackedBarChart } from '@/components/charts/bar-chart';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { detailStrings } from '@/lib/i18n';
import { useSleepGoal } from '@/hooks/use-sleep-goal';
import Svg, { Line, Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

function SleepDetailInner() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { state } = useHealth();
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  const { goal: sleepGoalHrs } = useSleepGoal();
  const [searchQuery, setSearchQuery] = useState('');
  const records = useMemo(() => {
    const hkSleep = state.data?.sleep ?? [];
    // Merge manually logged vitalSigns entries that have sleepTotalMinutes
    const manualSleep = (state.data?.vitalSigns ?? [])
      .filter((r) => r.sleepTotalMinutes !== undefined && r.sleepTotalMinutes > 0)
      .map((r) => ({
        id: r.id,
        date: r.timestamp.slice(0, 10),
        bedtime: r.sleepBedtime ?? r.timestamp,
        wakeTime: r.sleepWakeTime ?? r.timestamp,
        totalMinutes: r.sleepTotalMinutes!,
        efficiency: r.sleepEfficiency ?? 0,
        deepMinutes: 0,
        remMinutes: 0,
        lightMinutes: r.sleepTotalMinutes!,
        awakeMinutes: 0,
        source: 'manual',
      }));
    // Merge, deduplicate by id, sort by bedtime ascending
    const seen = new Set<string>();
    return [...hkSleep, ...manualSleep]
      .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .sort((a, b) => a.bedtime.localeCompare(b.bedtime));
  }, [state.data]);
  const latest = records[records.length - 1];

  // Last 14 records for chart — also track which are manual for badge overlay
  const last14 = useMemo(() => records.slice(-14), [records]);

  const chartData = useMemo(() => {
    return last14.map((r) => ({
      segments: [
        { value: r.awakeMinutes, color: colors.error + '80' },
        { value: r.lightMinutes, color: colors.sleepPurple + '60' },
        { value: r.remMinutes, color: colors.sleepPurple },
        { value: r.deepMinutes, color: colors.accent },
      ],
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, colors]);

  const avgEfficiency = records.length
    ? Math.round(records.reduce((s, r) => s + r.efficiency, 0) / records.length)
    : 0;
  const avgHours = records.length
    ? (records.reduce((s, r) => s + r.totalMinutes, 0) / records.length / 60).toFixed(1)
    : '0';
  // Include any record that has real stage data — including manually logged entries
  // that now have deepMinutes/remMinutes from the vitals log stage fields
  const stageRecords = records.filter((r) => r.deepMinutes > 0 || r.remMinutes > 0);

  // Filtered records for the history list (search by note keyword)
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [...records].reverse(); // most recent first
    return [...records]
      .filter((r) => {
        const note = (r as { note?: string }).note ?? '';
        return note.toLowerCase().includes(q);
      })
      .reverse();
  }, [records, searchQuery]);

  // Goal line: compute the Y fraction for the user's sleep goal on the chart
  // The chart's max value is the tallest bar; we need the goal in minutes
  const sleepGoalMinutes = sleepGoalHrs * 60;
  const chartMaxMinutes = last14.length
    ? Math.max(...last14.map((r) => r.totalMinutes), sleepGoalMinutes)
    : sleepGoalMinutes;
  const chartH = 120;
  const chartPad = 8;
  const goalLineY = chartH - chartPad - ((sleepGoalMinutes / (chartMaxMinutes || 1)) * (chartH - chartPad * 2));
  const avgDeepMin = stageRecords.length
    ? Math.round(stageRecords.reduce((s, r) => s + r.deepMinutes, 0) / stageRecords.length)
    : 0;
  const avgRemMin = stageRecords.length
    ? Math.round(stageRecords.reduce((s, r) => s + r.remMinutes, 0) / stageRecords.length)
    : 0;

  function formatTime(iso: string): string {
    return safeFormatTime(iso, 'en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function getEfficiencyLabel(eff: number): { label: string; color: string } {
    if (eff >= 90) return { label: d.sleepExcellent, color: colors.bpGreen };
    if (eff >= 80) return { label: d.sleepGood, color: colors.primary };
    if (eff >= 70) return { label: d.sleepFair, color: colors.bpAmber };
    return { label: d.sleepPoor, color: colors.error };
  }

  const effLabel = latest ? getEfficiencyLabel(latest.efficiency) : null;

  return (
    <ScreenContainer containerClassName="bg-background">
      <DetailHeader
        title={d.sleepTitle}
        subtitle={`${records.length} ${d.readings}`}
        accentColor={colors.sleepPurple}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ─── Hero ───────────────────────────────────────────────────────── */}
        <View style={[styles.heroCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={[styles.accentBar, { backgroundColor: colors.sleepPurple }]} />
          <View style={styles.heroRow}>
            <View style={styles.heroLeft}>
              <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.lastNight}</Text>
              <View style={styles.heroValueRow}>
                <Text style={[styles.heroValue, { color: colors.foreground }]}>
                  {latest ? (latest.totalMinutes / 60).toFixed(1) : '—'}
                </Text>
                <Text style={[styles.heroUnit, { color: colors.muted }]}>hrs</Text>
              </View>
              {latest && (
                <Text style={[styles.bedtimeText, { color: colors.muted }]}>
                  {formatTime(latest.bedtime)} → {formatTime(latest.wakeTime)}
                </Text>
              )}
            </View>
            <View style={styles.efficiencyCircle}>
              <View style={[styles.effCircleOuter, { borderColor: effLabel?.color ?? colors.sleepPurple }]}>
                <Text style={[styles.effValue, { color: colors.foreground }]}>
                  {latest?.efficiency ?? '—'}%
                </Text>
                <Text style={[styles.effLabel, { color: colors.muted }]}>{d.sleepEfficiency.toLowerCase()}</Text>
              </View>
              {effLabel && (
                <Text style={[styles.effZone, { color: effLabel.color }]}>{effLabel.label}</Text>
              )}
            </View>
          </View>
        </View>

        {/* ─── Stage Breakdown ─────────────────────────────────────────────── */}
        {latest && (
          <View style={[styles.stagesCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
            shadowColor: isDark ? '#000' : colors.shadowBase,
            shadowOpacity: isDark ? 0.45 : 0.06,
          }]}>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.stageBreakdown}</Text>
            <View style={styles.stagesRow}>
              {[
                { label: d.deep, minutes: latest.deepMinutes, color: colors.accent },
                { label: d.rem, minutes: latest.remMinutes, color: colors.sleepPurple },
                { label: d.light, minutes: latest.lightMinutes, color: colors.sleepPurple + '60' },
                { label: d.awake, minutes: latest.awakeMinutes, color: colors.error + '80' },
              ].map((stage) => (
                <View key={stage.label} style={styles.stageItem}>
                  <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
                  <Text style={[styles.stageMinutes, { color: colors.foreground }]}>
                    {stage.minutes}m
                  </Text>
                  <Text style={[styles.stageLabel, { color: colors.muted }]}>{stage.label}</Text>
                </View>
              ))}
            </View>

            {/* Visual stage bar */}
            <View style={styles.stageBarContainer}>
              {[
                { minutes: latest.deepMinutes, color: colors.accent },
                { minutes: latest.remMinutes, color: colors.sleepPurple },
                { minutes: latest.lightMinutes, color: colors.sleepPurple + '60' },
                { minutes: latest.awakeMinutes, color: colors.error + '80' },
              ].map((seg, i) => (
                <View
                  key={i}
                  style={[
                    styles.stageBarSeg,
                    {
                      flex: seg.minutes,
                      backgroundColor: seg.color,
                      borderRadius: i === 0 ? 4 : i === 3 ? 4 : 0,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        {/* ─── 14-Night Chart ──────────────────────────────────────────────── */}
        <View style={[styles.chartCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.06,
        }]}>
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>14-Night Sleep History · Goal: {sleepGoalHrs}h</Text>
          <View style={styles.chartLegend}>
            {[
              { label: d.deep, color: colors.accent },
              { label: d.rem, color: colors.sleepPurple },
              { label: d.light, color: colors.sleepPurple + '60' },
              { label: d.awake, color: colors.error + '80' },
            ].map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                <Text style={[styles.legendText, { color: colors.muted }]}>{l.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ position: 'relative' }}>
            <StackedBarChart
              data={chartData}
              width={CHART_WIDTH - 32}
              height={chartH}
            />
            {/* Goal line overlay */}
            <Svg
              width={CHART_WIDTH - 32}
              height={chartH}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              <Line
                x1={chartPad}
                y1={goalLineY}
                x2={CHART_WIDTH - 32 - chartPad}
                y2={goalLineY}
                stroke={colors.sleepPurple}
                strokeWidth={1.5}
                strokeDasharray="4,3"
                opacity={0.7}
              />
            </Svg>
          </View>
          {/* Day-of-week labels + optional manual badge below each bar */}
          <View style={[styles.badgeRow, { width: CHART_WIDTH - 32, marginTop: 6 }]}>
            {last14.map((r, i) => {
              const dow = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(r.wakeTime).getDay()];
              const isManual = r.source === 'manual';
              return (
                <View key={i} style={styles.badgeCell}>
                  <Text style={[styles.dowLabel, { color: isManual ? colors.muted : colors.muted + 'aa' }]}>{dow}</Text>
                  {isManual && (
                    <View style={[styles.manualBadge, { backgroundColor: colors.muted + '25' }]}>
                      <Text style={[styles.manualBadgeText, { color: colors.muted }]}>M</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {last14.some((r) => r.source === 'manual') && (
            <Text style={[styles.manualLegendNote, { color: colors.muted }]}>
              M = manually logged in Vitals
            </Text>
          )}
        </View>

        {/* ─── Averages ────────────────────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          {[
            { label: d.avgDuration, value: `${avgHours}h`, color: colors.sleepPurple, source: d.healthKitManual },
            { label: d.avgEfficiency, value: `${avgEfficiency}%`, color: colors.bpGreen, source: d.healthKitManual },
            { label: d.avgDeep, value: `${avgDeepMin}m`, color: colors.accent, source: d.healthKitOnly },
            { label: d.avgRem, value: `${avgRemMin}m`, color: colors.sleepPurple, source: d.healthKitOnly },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statCell, {
              backgroundColor: isDark ? colors.surface : colors.surfaceRaised,
              borderColor: isDark ? colors.borderStrong : colors.border,
              shadowColor: isDark ? '#000' : colors.shadowBase,
              shadowOpacity: isDark ? 0.35 : 0.05,
            }]}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
              <Text style={[styles.statSource, { color: colors.muted }]}>{stat.source}</Text>
            </View>
          ))}
        </View>

        {/* ─── Bedtime Consistency Sparkline ─────────────────────────────── */}
        {(() => {
          // Build last-14 bedtime dots on a 24h axis (20:00–04:00 window)
          const bedtimeRecords = records
            .filter((r) => r.bedtime && r.bedtime.length > 10)
            .slice(-14);
          if (bedtimeRecords.length < 3) return null;

          // Convert bedtime ISO → minutes from 20:00 (window: 20:00–04:00 = 480 min)
          const WINDOW_START = 20 * 60; // 20:00 in minutes from midnight
          const WINDOW_MINS = 8 * 60;   // 8-hour window (20:00–04:00)
          const dotW = (CHART_WIDTH - 32);
          const dotH = 56;
          const DOT_R = 4;

          const points = bedtimeRecords.map((r) => {
            const d = new Date(r.bedtime);
            let mins = d.getHours() * 60 + d.getMinutes();
            // Normalise post-midnight (00:00–04:00 inclusive) to 24h+ range
            if (mins <= 4 * 60) mins += 24 * 60;
            // Clamp to window
            const clamped = Math.min(Math.max(mins, WINDOW_START), WINDOW_START + WINDOW_MINS);
            const x = ((clamped - WINDOW_START) / WINDOW_MINS) * (dotW - DOT_R * 2) + DOT_R;
            const y = dotH / 2;
            return { x, y, mins, r };
          });

          // Compute SD for colour
          const mean = points.reduce((s, p) => s + p.mins, 0) / points.length;
          const sd = Math.round(Math.sqrt(points.reduce((s, p) => s + (p.mins - mean) ** 2, 0) / points.length));
          const dotColor = sd <= 30 ? colors.success : sd <= 60 ? colors.warning : colors.error;

          // Y-axis labels
          const axisLabels = ['8pm', '10pm', '12am', '2am', '4am'];

          return (
            <View style={[styles.chartCard, {
              backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
              borderColor: isDark ? colors.borderStrong : colors.border,
              shadowColor: isDark ? '#000' : colors.shadowBase,
              shadowOpacity: isDark ? 0.45 : 0.06,
              marginBottom: 12,
            }]}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>
                Bedtime Drift · Last {bedtimeRecords.length} Nights
              </Text>
              <Text style={[{ fontSize: 11, color: colors.muted, marginBottom: 10 }]}>
                Each dot is one night&apos;s bedtime on a 8pm–4am axis
              </Text>
              <Svg width={dotW} height={dotH + 20}>
                {/* Axis line */}
                <Line x1={DOT_R} y1={dotH / 2} x2={dotW - DOT_R} y2={dotH / 2}
                  stroke={colors.border} strokeWidth={1} />
                {/* Hour tick marks */}
                {axisLabels.map((lbl, i) => {
                  const tx = (i / (axisLabels.length - 1)) * (dotW - DOT_R * 2) + DOT_R;
                  return (
                    <React.Fragment key={lbl}>
                      <Line x1={tx} y1={dotH / 2 - 4} x2={tx} y2={dotH / 2 + 4}
                        stroke={colors.border} strokeWidth={1} />
                    </React.Fragment>
                  );
                })}
                {/* Bedtime dots */}
                {points.map((p, i) => (
                  <React.Fragment key={i}>
                    {/* Connecting line to next dot */}
                    {i < points.length - 1 && (
                      <Line
                        x1={p.x} y1={p.y}
                        x2={points[i + 1].x} y2={points[i + 1].y}
                        stroke={dotColor + '40'} strokeWidth={1.5}
                      />
                    )}
                  </React.Fragment>
                ))}
                {points.map((p, i) => {
                  const isLatest = i === points.length - 1;
                  return (
                    <React.Fragment key={`dot-${i}`}>
                      {/* Outer ring for latest dot */}
                      {isLatest && (
                        <Circle cx={p.x} cy={p.y} r={DOT_R + 3}
                          fill="none" stroke={dotColor} strokeWidth={1.5} opacity={0.5} />
                      )}
                      <Circle
                        cx={p.x} cy={p.y} r={DOT_R}
                        fill={isLatest ? dotColor : dotColor + 'aa'}
                      />
                    </React.Fragment>
                  );
                })}
              </Svg>
              {/* Axis labels row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                {axisLabels.map((lbl) => (
                  <Text key={lbl} style={{ fontSize: 9, color: colors.muted, fontWeight: '500' }}>{lbl}</Text>
                ))}
              </View>
              {/* Consistency badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                <Text style={{ fontSize: 11, color: dotColor, fontWeight: '700' }}>
                  {sd <= 30 ? `±${sd}m · Consistent bedtime` : sd <= 60 ? `±${sd}m · Moderate variation` : `±${sd}m · Variable bedtime`}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* ─── History List with Note Search ───────────────────────────── */}
        {records.length > 0 && (
          <View style={[styles.chartCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
            shadowColor: isDark ? '#000' : colors.shadowBase,
            shadowOpacity: isDark ? 0.45 : 0.06,
            marginBottom: 12,
          }]}>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>Sleep History</Text>
            {/* Search bar */}
            <View style={[styles.searchBar, {
              backgroundColor: isDark ? colors.surface : colors.background,
              borderColor: isDark ? colors.borderStrong : colors.border,
            }]}>
              <Text style={{ fontSize: 14, color: colors.muted, marginRight: 6 }}>🔍</Text>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by note keyword…"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>✕</Text>
                </Pressable>
              )}
            </View>
            {/* Results count */}
            {searchQuery.length > 0 && (
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
                {filteredRecords.length} result{filteredRecords.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
              </Text>
            )}
            {/* Entry list */}
            {filteredRecords.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 16 }}>
                No entries match &quot;{searchQuery}&quot;
              </Text>
            ) : (
              filteredRecords.slice(0, 30).map((r) => {
                const note = (r as { note?: string }).note;
                const hrs = (r.totalMinutes / 60).toFixed(1);
                const effInfo = getEfficiencyLabel(r.efficiency);
                return (
                  <View key={r.id} style={[styles.historyRow, {
                    borderBottomColor: isDark ? colors.borderStrong : colors.border,
                  }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.foreground }}>
                        {safeFormatDate(r.wakeTime, 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                        {formatTime(r.bedtime)} → {formatTime(r.wakeTime)}
                      </Text>
                      {note ? (
                        <Text style={{ fontSize: 11, color: colors.sleepPurple, fontStyle: 'italic', marginTop: 3 }}>
                          📝 {note}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.sleepPurple }}>{hrs}h</Text>
                      {r.efficiency > 0 && (
                        <Text style={{ fontSize: 11, fontWeight: '600', color: effInfo.color }}>{r.efficiency}%</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  heroCard: {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, justifyContent: 'space-between' },
  heroLeft: { flex: 1 },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroValue: { fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  heroUnit: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  bedtimeText: { fontSize: 12, marginTop: 4 },
  efficiencyCircle: { alignItems: 'center', gap: 6 },
  effCircleOuter: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  effValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  effLabel: { fontSize: 9, fontWeight: '500' },
  effZone: { fontSize: 11, fontWeight: '700' },
  stagesCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  chartTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  stagesRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  stageItem: { alignItems: 'center', gap: 4 },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  stageMinutes: { fontSize: 16, fontWeight: '700' },
  stageLabel: { fontSize: 10, fontWeight: '500' },
  stageBarContainer: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 },
  stageBarSeg: { height: '100%' },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  chartLegend: { flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: {
    flex: 1, minWidth: '45%', borderRadius: 12, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: '500' },
  // Manual entry badge row below the 14-night chart
  badgeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  badgeCell: {
    flex: 1,
    alignItems: 'center',
  },
  manualBadge: {
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  manualBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dowLabel: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  manualLegendNote: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
    fontStyle: 'italic',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  statSource: {
    fontSize: 9,
    fontWeight: '400',
    fontStyle: 'italic',
    marginTop: 1,
    opacity: 0.7,
  },
});

export default withDetailErrorBoundary(SleepDetailInner, 'Sleep');
