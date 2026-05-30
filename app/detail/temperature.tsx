/**
 * Body Temperature Detail Screen
 * Shows historical temperature chart with a normal-range band (36.1–37.2°C / 97–99°F),
 * stats (avg / min / max / readings), status classification, and a reference guide.
 * Respects the user's °C / °F unit preference stored in AsyncStorage.
 */
import { safeFormatDate } from '@/lib/utils';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import React, { useEffect, useMemo, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
type TempStatus = 'low' | 'normal' | 'fever' | 'high-fever';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert °F → °C */
function fToC(f: number): number {
  return (f - 32) * 5 / 9;
}

/** Convert °C → °F */
function cToF(c: number): number {
  return c * 9 / 5 + 32;
}

/** Classify temperature (input in °C) */
function getTempStatus(tempC: number): TempStatus {
  if (tempC < 36.1) return 'low';
  if (tempC <= 37.2) return 'normal';
  if (tempC <= 38.9) return 'fever';
  return 'high-fever';
}

function getTempStatusColor(status: TempStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case 'normal':    return colors.success;
    case 'low':       return colors.spo2Blue;
    case 'fever':     return colors.warning;
    case 'high-fever':return colors.error;
  }
}

/**
 * Overlay a shaded normal-range band on the chart.
 * Normal range: 36.1–37.2°C (displayed in user unit).
 */
function NormalRangeBand({
  width,
  height,
  minVal,
  maxVal,
  normalLow,
  normalHigh,
  color,
  padding = 8,
}: {
  width: number;
  height: number;
  minVal: number;
  maxVal: number;
  normalLow: number;
  normalHigh: number;
  color: string;
  padding?: number;
}) {
  const plotH = height - padding * 2;
  const range = maxVal - minVal || 1;
  const yLow  = padding + (1 - (normalLow  - minVal) / range) * plotH;
  const yHigh = padding + (1 - (normalHigh - minVal) / range) * plotH;
  const bandTop    = Math.max(padding, Math.min(yHigh, yLow));
  const bandBottom = Math.min(height - padding, Math.max(yHigh, yLow));
  const bandHeight = Math.max(0, bandBottom - bandTop);

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Rect
        x={padding} y={bandTop}
        width={width - padding * 2} height={bandHeight}
        fill={color} fillOpacity={0.08}
      />
      <Line
        x1={padding} y1={bandTop} x2={width - padding} y2={bandTop}
        stroke={color} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5}
      />
      <Line
        x1={padding} y1={bandBottom} x2={width - padding} y2={bandBottom}
        stroke={color} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.7}
      />
      <SvgText
        x={width - padding - 2} y={bandBottom - 4}
        fontSize={9} fill={color} fillOpacity={0.7} textAnchor="end"
      >
        Normal
      </SvgText>
    </Svg>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

function TemperatureDetailInner() {
  const colors     = useColors();
  const scheme     = useColorScheme() ?? 'light';
  const isDark     = scheme === 'dark';
  const { state }  = useHealth();
  const lang       = useLang();
  const d          = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  const accentColor = colors.tempOrange;

  const [range, setRange]     = useState<Range>('30d');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');

  // Load unit preference
  useEffect(() => {
    AsyncStorage.getItem('@vitalsync/profile_units').then(raw => {
      if (!raw) return;
      try {
        const u = JSON.parse(raw);
        setTempUnit(u.tempUnit === 'F' ? 'F' : 'C');
      } catch (_unused) { /* ignore */ }
    }).catch(() => {});
  }, []);

  // Filter records in range; temperature stored in °F in VitalSignsRecord
  const records = useMemo(() => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return (state.data?.vitalSigns ?? [])
      .filter((r) => r.timestamp >= cutoff && r.temperature != null && r.temperature > 0)
      .map((r) => {
        const tempF = r.temperature!;
        const tempC = fToC(tempF);
        const displayVal = tempUnit === 'F' ? tempF : tempC;
        return { id: r.id, timestamp: r.timestamp, tempC, displayVal };
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [state.data, range, tempUnit]);

  const latest = records[records.length - 1];
  const latestStatus = latest ? getTempStatus(latest.tempC) : null;
  const latestStatusColor = latestStatus ? getTempStatusColor(latestStatus, colors) : colors.muted;

  const allDisplay = records.map((r) => r.displayVal);
  const avgTemp = allDisplay.length
    ? parseFloat((allDisplay.reduce((s, v) => s + v, 0) / allDisplay.length).toFixed(1))
    : null;
  const minTemp = allDisplay.length ? Math.min(...allDisplay) : null;
  const maxTemp = allDisplay.length ? Math.max(...allDisplay) : null;

  const chartData = useMemo(() => normalizeData(allDisplay), [allDisplay]);

  // Normal range in display unit
  const normalLow  = tempUnit === 'F' ? cToF(36.1) : 36.1;
  const normalHigh = tempUnit === 'F' ? cToF(37.2) : 37.2;
  const chartMin = allDisplay.length ? Math.min(...allDisplay, normalLow  - 0.5) : normalLow  - 1;
  const chartMax = allDisplay.length ? Math.max(...allDisplay, normalHigh + 0.5) : normalHigh + 1;

  const unitLabel = `°${tempUnit}`;

  const statusLabel = (s: TempStatus | null): string => {
    if (!s) return '';
    switch (s) {
      case 'normal':    return d.tempStatusNormal;
      case 'low':       return d.tempStatusLow;
      case 'fever':     return d.tempStatusFever;
      case 'high-fever':return d.tempStatusHighFever;
    }
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <DetailHeader
        title={d.tempTitle}
        subtitle={`${records.length} ${d.readings}`}
        accentColor={accentColor}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ─── Primary Reading ──────────────────────────────────────────────── */}
        <View style={[styles.heroCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.tempLatest}</Text>
          <View style={styles.heroValueRow}>
            <Text style={[styles.heroValue, { color: colors.foreground }]}>
              {latest ? latest.displayVal.toFixed(1) : '—'}
            </Text>
            <Text style={[styles.heroUnit, { color: colors.muted }]}>{unitLabel}</Text>
          </View>
          {latestStatus && (
            <View style={[styles.statusBadge, {
              backgroundColor: latestStatusColor + '20',
              borderColor: latestStatusColor + '40',
            }]}>
              <Text style={[styles.statusText, { color: latestStatusColor }]}>
                {statusLabel(latestStatus)}
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

        {/* ─── Range Selector ───────────────────────────────────────────────── */}
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

        {/* ─── Chart with Normal Range Band ─────────────────────────────────── */}
        <View style={[styles.chartCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{d.tempChart}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBand, { backgroundColor: accentColor }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>
                {d.tempNormalRange} ({tempUnit === 'C' ? '36.1–37.2°C' : '97–99°F'})
              </Text>
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
                normalLow={normalLow}
                normalHigh={normalHigh}
                color={accentColor}
              />
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>{d.noData}</Text>
            </View>
          )}
        </View>

        {/* ─── Stats Row ────────────────────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          {[
            { label: d.tempAvg,  value: avgTemp !== null ? `${avgTemp}` : '—',  unit: unitLabel },
            { label: d.tempMin,  value: minTemp !== null ? `${minTemp.toFixed(1)}` : '—', unit: unitLabel },
            { label: d.tempMax,  value: maxTemp !== null ? `${maxTemp.toFixed(1)}` : '—', unit: unitLabel },
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

        {/* ─── Reference Guide ──────────────────────────────────────────────── */}
        <View style={[styles.guideCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.07,
        }]}>
          <Text style={[styles.guideTitle, { color: colors.foreground }]}>{d.tempNormalRange}</Text>
          {[
            { label: d.tempStatusLow,      range: tempUnit === 'C' ? '< 36.1°C' : '< 97.0°F',     color: colors.spo2Blue },
            { label: d.tempStatusNormal,   range: tempUnit === 'C' ? '36.1–37.2°C' : '97.0–99.0°F', color: colors.success },
            { label: d.tempStatusFever,    range: tempUnit === 'C' ? '37.3–38.9°C' : '99.1–102.0°F', color: colors.warning },
            { label: d.tempStatusHighFever,range: tempUnit === 'C' ? '> 38.9°C' : '> 102.0°F',    color: colors.error },
          ].map((row) => (
            <View key={row.label} style={styles.guideRow}>
              <View style={[styles.guideDot, { backgroundColor: row.color }]} />
              <Text style={[styles.guideLabel, { color: colors.foreground }]}>{row.label}</Text>
              <Text style={[styles.guideRange, { color: colors.muted }]}>{row.range}</Text>
            </View>
          ))}
          <Text style={[styles.guideNote, { color: colors.muted }]}>{d.tempNormalText}</Text>
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 16 },

  heroCard: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: 2 },
  heroLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8, marginLeft: 12 },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  heroValue: { fontSize: 52, fontWeight: '700', lineHeight: 56 },
  heroUnit: { fontSize: 20, fontWeight: '500', marginBottom: 8 },
  statusBadge: {
    alignSelf: 'flex-start', marginLeft: 12, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  timestamp: { fontSize: 12, marginTop: 6, marginLeft: 12 },

  rangeRow: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    overflow: 'hidden',
  },
  rangeButton: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  rangeText: { fontSize: 13, fontWeight: '600' },

  chartCard: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3,
  },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendBand: { width: 16, height: 8, borderRadius: 2, opacity: 0.3 },
  legendText: { fontSize: 11 },
  emptyChart: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: {
    flex: 1, minWidth: 70, borderRadius: 12, borderWidth: 1,
    padding: 12, alignItems: 'center',
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statUnit: { fontSize: 11, marginTop: 1 },
  statLabel: { fontSize: 10, marginTop: 4, textAlign: 'center' },

  guideCard: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3,
    gap: 10,
  },
  guideTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guideDot: { width: 10, height: 10, borderRadius: 5 },
  guideLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  guideRange: { fontSize: 12 },
  guideNote: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});

export default withDetailErrorBoundary(TemperatureDetailInner, 'Body Temperature');
