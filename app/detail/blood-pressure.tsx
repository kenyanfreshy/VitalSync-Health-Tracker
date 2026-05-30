/**
 * Blood Pressure Detail Screen
 * Shows historical BP chart, systolic/diastolic trends, stats, and source badges.
 */

import { safeFormatDate } from '@/lib/utils';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Dimensions, Pressable, useColorScheme } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { LineChart, normalizeData } from '@/components/charts/line-chart';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { getBPStatus, getBPStatusLabel, getBPStatusColor } from '@/lib/health/types';
import { detailStrings } from '@/lib/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;
const CHART_HEIGHT = 160;

type Range = '7d' | '30d' | '90d';

/** Map a raw source string to a short, user-friendly display label. */
function formatSourceLabel(source: string | undefined): string {
  if (!source) return 'Manual';
  const s = source.toLowerCase();
  if (s.includes('withings')) return 'Withings';
  if (s.includes('omron')) return 'Omron';
  if (s.includes('qardio')) return 'QardioArm';
  if (s.includes('ihealth')) return 'iHealth';
  if (s.includes('beurer')) return 'Beurer';
  if (s.includes('microlife')) return 'Microlife';
  if (s.includes('health') && s.includes('apple')) return 'Apple Health';
  if (s === 'apple health') return 'Apple Health';
  if (s === 'manual') return 'Manual';
  // Capitalise first word for unknown sources
  return source.split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Pick a subtle accent colour for a source badge. */
function sourceBadgeColor(label: string): string {
  switch (label) {
    case 'Withings':    return '#0066CC';
    case 'Omron':       return '#E63946';
    case 'QardioArm':  return '#7B2FBE';
    case 'iHealth':     return '#0A7EA4';
    case 'Beurer':      return '#2E7D32';
    case 'Microlife':   return '#C62828';
    case 'Apple Health': return '#FF2D55';
    default:            return '#687076'; // muted grey for Manual / unknown
  }
}

function BloodPressureDetailInner() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { state } = useHealth();
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  const [range, setRange] = useState<Range>('30d');

  const records = useMemo(() => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    // Merge HealthKit bloodPressure records with manually logged vitalSigns that have BP values
    const hkRecords = (state.data?.bloodPressure ?? []).filter((r) => r.timestamp >= cutoff);
    const manualRecords = (state.data?.vitalSigns ?? [])
      .filter((r) => r.timestamp >= cutoff && (r.systolic != null || r.diastolic != null))
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        systolic: r.systolic ?? null,
        diastolic: r.diastolic ?? null,
        source: 'manual',
      }));
    return [...hkRecords, ...manualRecords].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [state.data, range]);

  const latest = records[records.length - 1];
  const bpStatus = latest ? getBPStatus(latest.systolic ?? 0, latest.diastolic ?? 0) : null;
  const latestSourceLabel = formatSourceLabel((latest as any)?.deviceName ?? (latest as any)?.source);
  const latestSourceColor = sourceBadgeColor(latestSourceLabel);

  const systolicData = useMemo(() => normalizeData(records.map((r) => r.systolic ?? 0)), [records]);
  const diastolicData = useMemo(() => normalizeData(records.map((r) => r.diastolic ?? 0)), [records]);

  // Only average records that have the value (null = partial reading)
  const sysRecords = records.filter((r) => r.systolic != null);
  const diaRecords = records.filter((r) => r.diastolic != null);
  const avgSystolic = sysRecords.length
    ? Math.round(sysRecords.reduce((s, r) => s + r.systolic!, 0) / sysRecords.length)
    : 0;
  const avgDiastolic = diaRecords.length
    ? Math.round(diaRecords.reduce((s, r) => s + r.diastolic!, 0) / diaRecords.length)
    : 0;
  const minSystolic = sysRecords.length ? Math.min(...sysRecords.map((r) => r.systolic!)) : 0;
  const maxSystolic = sysRecords.length ? Math.max(...sysRecords.map((r) => r.systolic!)) : 0;
  const pulsePressureAvg = avgSystolic > 0 && avgDiastolic > 0 ? avgSystolic - avgDiastolic : 0;

  // ── Source breakdown: count readings per device/app ──────────────────────
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      const label = formatSourceLabel((r as any).deviceName ?? (r as any).source);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [records]);

  return (
    <ScreenContainer containerClassName="bg-background">
      <DetailHeader
        title={d.bpTitle}
        subtitle={`${records.length} ${d.readings}`}
        accentColor={colors.bpGreen}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ─── Primary Reading ─────────────────────────────────────────────── */}
        <View style={[styles.heroCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={[styles.accentBar, { backgroundColor: colors.bpGreen }]} />
          <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.latestReading}</Text>
          <View style={styles.heroValueRow}>
            <Text style={[styles.heroValue, { color: colors.foreground }]}>
              {latest ? `${latest.systolic ?? '--'}` : '—'}
            </Text>
            <Text style={[styles.heroSeparator, { color: colors.muted }]}>/</Text>
            <Text style={[styles.heroValueSmall, { color: colors.foreground }]}>
              {latest ? `${latest.diastolic ?? '--'}` : '—'}
            </Text>
            <Text style={[styles.heroUnit, { color: colors.muted }]}>mmHg</Text>
          </View>

          {/* Status badge + source badge row */}
          <View style={styles.badgeRow}>
            {bpStatus && (
              <View style={[styles.statusBadge, {
                backgroundColor: getBPStatusColor(bpStatus, colors as Record<string, string>) + '20',
                borderColor: getBPStatusColor(bpStatus, colors as Record<string, string>) + '40',
              }]}>
                <Text style={[styles.statusText, { color: getBPStatusColor(bpStatus, colors as Record<string, string>) }]}>
                  {getBPStatusLabel(bpStatus)}
                </Text>
              </View>
            )}
            {latest && (
              <View style={[styles.sourceBadge, {
                backgroundColor: latestSourceColor + '18',
                borderColor: latestSourceColor + '35',
              }]}>
                <View style={[styles.sourceDot, { backgroundColor: latestSourceColor }]} />
                <Text style={[styles.sourceText, { color: latestSourceColor }]}>
                  {latestSourceLabel}
                </Text>
              </View>
            )}
          </View>

          {latest && (
            <Text style={[styles.timestamp, { color: colors.muted }]}>
              {safeFormatDate(latest.timestamp)}
            </Text>
          )}
        </View>

        {/* ─── Range Selector ──────────────────────────────────────────────── */}
        <View style={[styles.rangeRow, { backgroundColor: isDark ? colors.surface : colors.surface, borderColor: isDark ? colors.borderStrong : colors.border }]}>
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <Pressable
              key={r}
              style={[
                styles.rangeButton,
                range === r && { backgroundColor: colors.bpGreen + '20' },
              ]}
              onPress={() => setRange(r)}
            >
              <Text style={[
                styles.rangeText,
                { color: range === r ? colors.bpGreen : colors.muted },
              ]}>
                {r === '7d' ? d.days7 : r === '30d' ? d.days30 : d.days90}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ─── Chart ───────────────────────────────────────────────────────── */}
        <View style={[styles.chartCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.bpGreen }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{d.systolic}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { backgroundColor: colors.bodyBlue }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{d.diastolic}</Text>
            </View>
          </View>
          <LineChart
            data={systolicData}
            secondaryData={diastolicData}
            secondaryColor={colors.bodyBlue}
            width={CHART_WIDTH - 32}
            height={CHART_HEIGHT}
            color={colors.bpGreen}
            strokeWidth={2.5}
            showGradient
          />
        </View>

        {/* ─── Stats Row ───────────────────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          {[
            { label: d.avgSystolic, value: `${avgSystolic}`, unit: 'mmHg', source: undefined },
            { label: d.avgDiastolic, value: `${avgDiastolic}`, unit: 'mmHg', source: undefined },
            { label: d.minSystolic, value: `${minSystolic}`, unit: 'mmHg', source: undefined },
            { label: d.maxSystolic, value: `${maxSystolic}`, unit: 'mmHg', source: undefined },
            { label: d.pulsePressure, value: `${pulsePressureAvg}`, unit: 'mmHg', source: undefined },
            { label: d.readings, value: `${records.length}`, unit: '', source: undefined },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statCell, {
              backgroundColor: isDark ? colors.surface : colors.surfaceRaised,
              borderColor: isDark ? colors.borderStrong : colors.border,
              shadowColor: isDark ? '#000' : colors.shadowBase,
              shadowOpacity: isDark ? 0.35 : 0.05,
            }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
              <Text style={[styles.statUnit, { color: colors.muted }]}>{stat.unit}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ─── Data Sources ────────────────────────────────────────────────── */}
        {sourceCounts.length > 0 && (
          <View style={[styles.sourcesCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
          }]}>
            <Text style={[styles.sourcesTitle, { color: colors.foreground }]}>{d.dataSources}</Text>
            <View style={styles.sourcePills}>
              {sourceCounts.map(([label, count]) => {
                const color = sourceBadgeColor(label);
                return (
                  <View key={label} style={[styles.sourcePill, {
                    backgroundColor: color + '18',
                    borderColor: color + '35',
                  }]}>
                    <View style={[styles.sourceDot, { backgroundColor: color }]} />
                    <Text style={[styles.sourcePillText, { color: color }]}>
                      {label}
                    </Text>
                    <Text style={[styles.sourcePillCount, { color: color + 'CC' }]}>
                      {count}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ─── Recent Readings ─────────────────────────────────────────────── */}
        {records.length > 0 && (
          <View style={[styles.historyCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
          }]}>
            <Text style={[styles.sourcesTitle, { color: colors.foreground }]}>{d.recentReadings ?? 'Recent Readings'}</Text>
            {[...records].reverse().slice(0, 10).map((r) => {
              const srcLabel = formatSourceLabel((r as any).deviceName ?? (r as any).source);
              const srcColor = sourceBadgeColor(srcLabel);
              const isDevice = srcLabel !== 'Manual';
              return (
                <View key={r.id} style={[styles.historyRow, { borderBottomColor: isDark ? colors.borderStrong : colors.border }]}>
                  <View style={styles.historyLeft}>
                    <Text style={[styles.historyValue, { color: colors.foreground }]}>
                      {r.systolic ?? '--'}<Text style={[styles.historySep, { color: colors.muted }]}>/</Text>{r.diastolic ?? '--'}
                    </Text>
                    <Text style={[styles.historyUnit, { color: colors.muted }]}>mmHg</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyDate, { color: colors.muted }]}>{safeFormatDate(r.timestamp)}</Text>
                    <View style={[styles.historySourceBadge, {
                      backgroundColor: srcColor + (isDevice ? '18' : '10'),
                      borderColor: srcColor + (isDevice ? '35' : '25'),
                    }]}>
                      <View style={[styles.historySourceDot, { backgroundColor: srcColor }]} />
                      <Text style={[styles.historySourceText, { color: srcColor }]}>{srcLabel}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {/* ─── BP Reference Guide ──────────────────────────────────────────── */}
        <View style={[styles.guideCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <Text style={[styles.guideTitle, { color: colors.foreground }]}>{d.bpReference}</Text>
          {[
            { label: d.bpNormal, range: '< 120/80', color: colors.bpGreen },
            { label: d.bpElevated, range: '120–129 / < 80', color: colors.bpAmber },
            { label: d.bpHigh1, range: '130–139 / 80–89', color: colors.warning },
            { label: d.bpHigh2, range: '≥ 140 / ≥ 90', color: colors.error },
            { label: d.bpCrisis, range: '> 180 / > 120', color: colors.heartRed },
          ].map((item) => (
            <View key={item.label} style={styles.guideRow}>
              <View style={[styles.guideDot, { backgroundColor: item.color }]} />
              <Text style={[styles.guideLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.guideRange, { color: colors.muted }]}>{item.range}</Text>
            </View>
          ))}
        </View>

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
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6, marginBottom: 8 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroValue: { fontSize: 56, fontWeight: '800', letterSpacing: -2 },
  heroSeparator: { fontSize: 36, fontWeight: '300' },
  heroValueSmall: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  heroUnit: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  statusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  sourceDot: { width: 6, height: 6, borderRadius: 3 },
  sourceText: { fontSize: 11, fontWeight: '600' },
  timestamp: { fontSize: 11, marginTop: 8 },
  rangeRow: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    padding: 4, marginBottom: 12, gap: 4,
  },
  rangeButton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  rangeText: { fontSize: 12, fontWeight: '600' },
  chartCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chartLegend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDash: { width: 16, height: 2, borderRadius: 1 },
  legendText: { fontSize: 11, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCell: {
    width: '31%', borderRadius: 12, borderWidth: 1, padding: 12,
    alignItems: 'center', gap: 2,
  },
  statValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  statUnit: { fontSize: 10, fontWeight: '500' },
  statLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  sourcesCard: {
    borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12,
  },
  sourcesTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  sourcePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourcePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  sourcePillText: { fontSize: 12, fontWeight: '600' },
  sourcePillCount: { fontSize: 11, fontWeight: '500' },
  guideCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  guideTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  guideDot: { width: 10, height: 10, borderRadius: 5 },
  guideLabel: { fontSize: 13, fontWeight: '600', width: 90 },
  guideRange: { fontSize: 12, fontWeight: '400', flex: 1 },
  historyCard: {
    borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12,
  },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  historyValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  historySep: { fontSize: 16, fontWeight: '300' },
  historyUnit: { fontSize: 11, fontWeight: '500', marginLeft: 4 },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyDate: { fontSize: 11, fontWeight: '400' },
  historySourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  historySourceDot: { width: 5, height: 5, borderRadius: 2.5 },
  historySourceText: { fontSize: 10, fontWeight: '600' },
});

export default withDetailErrorBoundary(BloodPressureDetailInner, 'Blood Pressure');
