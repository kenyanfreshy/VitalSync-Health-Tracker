/**
 * SpO₂ Detail Screen
 * Shows historical blood oxygen chart with a 95–100% normal range band,
 * stats (avg / min / max), and a reference guide.
 */
import { safeFormatDate } from '@/lib/utils';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { LineChart, normalizeData } from '@/components/charts/line-chart';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { detailStrings } from '@/lib/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;
const CHART_HEIGHT = 160;

type Range = '7d' | '30d' | '90d';

/** Classify SpO₂ reading */
function getSpO2Status(value: number): 'normal' | 'low' | 'critical' {
  if (value >= 95) return 'normal';
  if (value >= 90) return 'low';
  return 'critical';
}

function getSpO2StatusColor(status: 'normal' | 'low' | 'critical', colors: ReturnType<typeof useColors>): string {
  if (status === 'normal') return colors.success;
  if (status === 'low') return colors.warning;
  return colors.error;
}

/**
 * Overlay a horizontal normal-range band (95–100%) on the chart.
 * The chart normalises values to 0–1 based on min/max in the dataset.
 * We compute the y-positions for 95 and 100 using the same normalisation.
 */
function NormalRangeBand({
  width,
  height,
  minVal,
  maxVal,
  color,
  padding = 8,
}: {
  width: number;
  height: number;
  minVal: number;
  maxVal: number;
  color: string;
  padding?: number;
}) {
  const plotH = height - padding * 2;
  const range = maxVal - minVal || 1;
  // y=0 is top in SVG; normalised y=1 → top of chart
  const y95 = padding + (1 - (95 - minVal) / range) * plotH;
  const y100 = padding + (1 - (100 - minVal) / range) * plotH;
  const bandTop = Math.max(padding, Math.min(y95, y100));
  const bandBottom = Math.min(height - padding, Math.max(y95, y100));
  const bandHeight = Math.max(0, bandBottom - bandTop);

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Shaded normal range band */}
      <Rect
        x={padding}
        y={bandTop}
        width={width - padding * 2}
        height={bandHeight}
        fill={color}
        fillOpacity={0.08}
      />
      {/* Top boundary line at 100% */}
      <Line
        x1={padding}
        y1={bandTop}
        x2={width - padding}
        y2={bandTop}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="4 3"
        strokeOpacity={0.5}
      />
      {/* Bottom boundary line at 95% */}
      <Line
        x1={padding}
        y1={bandBottom}
        x2={width - padding}
        y2={bandBottom}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        strokeOpacity={0.7}
      />
      <SvgText
        x={width - padding - 2}
        y={bandBottom - 4}
        fontSize={9}
        fill={color}
        fillOpacity={0.7}
        textAnchor="end"
      >
        95%
      </SvgText>
    </Svg>
  );
}

function SpO2DetailInner() {
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
    return (state.data?.vitalSigns ?? [])
      .filter((r) => r.timestamp >= cutoff && (r.spo2 != null || r.oxygenSaturation != null))
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        value: r.spo2 ?? r.oxygenSaturation ?? 0,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [state.data, range]);

  const latest = records[records.length - 1];
  const latestStatus = latest ? getSpO2Status(latest.value) : null;
  const latestStatusColor = latestStatus ? getSpO2StatusColor(latestStatus, colors) : colors.muted;

  const chartData = useMemo(() => normalizeData(records.map((r) => r.value)), [records]);

  const allValues = records.map((r) => r.value);
  const avgSpO2 = allValues.length
    ? Math.round((allValues.reduce((s, v) => s + v, 0) / allValues.length) * 10) / 10
    : 0;
  const minSpO2 = allValues.length ? Math.min(...allValues) : 0;
  const maxSpO2 = allValues.length ? Math.max(...allValues) : 0;

  // For the normal range band we need the actual min/max of the dataset
  const chartMin = allValues.length ? Math.min(...allValues, 90) : 90;
  const chartMax = allValues.length ? Math.max(...allValues, 100) : 100;

  const accentColor = colors.spo2Blue;

  return (
    <ScreenContainer containerClassName="bg-background">
      <DetailHeader
        title={d.spo2Title}
        subtitle={`${records.length} ${d.readings}`}
        accentColor={accentColor}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ─── Primary Reading ─────────────────────────────────────────────── */}
        <View style={[styles.heroCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.spo2Latest}</Text>
          <View style={styles.heroValueRow}>
            <Text style={[styles.heroValue, { color: colors.foreground }]}>
              {latest ? `${latest.value}` : '—'}
            </Text>
            <Text style={[styles.heroUnit, { color: colors.muted }]}>%</Text>
          </View>
          {latestStatus && (
            <View style={[styles.statusBadge, {
              backgroundColor: latestStatusColor + '20',
              borderColor: latestStatusColor + '40',
            }]}>
              <Text style={[styles.statusText, { color: latestStatusColor }]}>
                {latestStatus === 'normal'
                  ? d.spo2StatusNormal
                  : latestStatus === 'low'
                  ? d.spo2StatusLow
                  : d.spo2StatusCritical}
              </Text>
            </View>
          )}
          {latest && (
            <Text style={[styles.timestamp, { color: colors.muted }]}>
              {safeFormatDate(latest.timestamp, undefined, {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          )}
        </View>

        {/* ─── Range Selector ──────────────────────────────────────────────── */}
        <View style={[styles.rangeRow, {
          backgroundColor: colors.surface,
          borderColor: isDark ? colors.borderStrong : colors.border,
        }]}>
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <Pressable
              key={r}
              style={[styles.rangeButton, range === r && { backgroundColor: accentColor + '20' }]}
              onPress={() => setRange(r)}
            >
              <Text style={[styles.rangeText, { color: range === r ? accentColor : colors.muted }]}>
                {r === '7d' ? d.days7 : r === '30d' ? d.days30 : d.days90}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ─── Chart with Normal Range Band ────────────────────────────────── */}
        <View style={[styles.chartCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>SpO₂</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBand, { backgroundColor: accentColor }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{d.spo2NormalRange} (95–100%)</Text>
            </View>
          </View>

          {records.length > 0 ? (
            <View style={{ position: 'relative' }}>
              <LineChart
                data={chartData}
                width={CHART_WIDTH - 32}
                height={CHART_HEIGHT}
                color={accentColor}
                strokeWidth={2.5}
                showGradient
                showDots={records.length <= 20}
              />
              <NormalRangeBand
                width={CHART_WIDTH - 32}
                height={CHART_HEIGHT}
                minVal={chartMin}
                maxVal={chartMax}
                color={accentColor}
              />
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>{d.noData}</Text>
            </View>
          )}
        </View>

        {/* ─── Stats Row ───────────────────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          {[
            { label: d.spo2Avg, value: records.length ? `${avgSpO2}` : '—', unit: '%' },
            { label: d.spo2Min, value: records.length ? `${minSpO2}` : '—', unit: '%' },
            { label: d.spo2Max, value: records.length ? `${maxSpO2}` : '—', unit: '%' },
            { label: d.readings, value: `${records.length}`, unit: '' },
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

        {/* ─── Reference Guide ─────────────────────────────────────────────── */}
        <View style={[styles.guideCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <Text style={[styles.guideTitle, { color: colors.foreground }]}>{d.spo2NormalRange}</Text>
          {[
            { label: d.spo2StatusNormal, range: '95–100%', color: colors.success },
            { label: d.spo2StatusLow,    range: '90–94%',  color: colors.warning },
            { label: d.spo2StatusCritical, range: '< 90%', color: colors.error },
          ].map((item) => (
            <View key={item.label} style={styles.guideRow}>
              <View style={[styles.guideDot, { backgroundColor: item.color }]} />
              <Text style={[styles.guideLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.guideRange, { color: colors.muted }]}>{item.range}</Text>
            </View>
          ))}
          <Text style={[styles.guideNote, { color: colors.muted }]}>{d.spo2NormalText}</Text>
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
  heroValue: { fontSize: 72, fontWeight: '800', letterSpacing: -3 },
  heroUnit: { fontSize: 20, fontWeight: '500', marginBottom: 8 },
  statusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, marginTop: 10,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
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
  chartLegend: { flexDirection: 'row', gap: 16, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendBand: { width: 16, height: 8, borderRadius: 2, opacity: 0.3 },
  legendText: { fontSize: 11, fontWeight: '500' },
  emptyChart: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCell: {
    width: '47%', borderRadius: 12, borderWidth: 1, padding: 12,
    alignItems: 'center', gap: 2,
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  statUnit: { fontSize: 10, fontWeight: '500' },
  statLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  guideCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  guideTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  guideDot: { width: 10, height: 10, borderRadius: 5 },
  guideLabel: { fontSize: 13, fontWeight: '600', width: 80 },
  guideRange: { fontSize: 12, fontWeight: '400', flex: 1 },
  guideNote: { fontSize: 12, lineHeight: 17, marginTop: 8, fontStyle: 'italic' },
});

export default withDetailErrorBoundary(SpO2DetailInner, 'Blood Oxygen (SpO₂)');
