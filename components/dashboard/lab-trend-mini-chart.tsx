/**
 * LabTrendMiniChart
 *
 * A compact dashboard widget that shows TSH and Vitamin D trends
 * pulled from the user's saved lab results. Each analyte renders:
 *  - Latest value + unit
 *  - Normal / High / Low status badge
 *  - Reference range text
 *  - A small inline sparkline (last 6 readings)
 *  - Tap → navigates to /labs
 *
 * Design: matches the GlassCard aesthetic used elsewhere on the dashboard.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Polyline, Line, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/use-colors';
import { REFERENCE_RANGES, getAnalyteStatus, type LabResult, type LabAnalyteId } from '@/lib/health/lab-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyteTrendConfig {
  analyteId: LabAnalyteId;
  label: string;
  accentColor: string;
}

// The two analytes shown on the dashboard
const TREND_ANALYTES: AnalyteTrendConfig[] = [
  { analyteId: 'tsh',      label: 'TSH',       accentColor: '#0891B2' },
  { analyteId: 'vitaminD', label: 'Vitamin D',  accentColor: '#16A34A' },
];

// ─── Mini Sparkline ───────────────────────────────────────────────────────────

function MiniSparkline({
  values,
  low,
  high,
  color,
  width = 72,
  height = 30,
}: {
  values: number[];
  low: number;
  high: number;
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const minV = Math.min(...values, low * 0.85);
  const maxV = Math.max(...values, high * 1.15);
  const range = maxV - minV || 1;

  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - minV) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const refLowY  = height - ((low  - minV) / range) * height;
  const refHighY = height - ((high - minV) / range) * height;
  const bandTop    = Math.min(refLowY, refHighY);
  const bandHeight = Math.abs(refLowY - refHighY);

  return (
    <Svg width={width} height={height}>
      {/* Normal range shaded band */}
      <Rect x={0} y={bandTop} width={width} height={bandHeight} fill={`${color}18`} />
      {/* Ref range dashed lines */}
      <Line x1={0} y1={refLowY}  x2={width} y2={refLowY}  stroke={color} strokeWidth={0.6} strokeDasharray="2,2" opacity={0.5} />
      <Line x1={0} y1={refHighY} x2={width} y2={refHighY} stroke={color} strokeWidth={0.6} strokeDasharray="2,2" opacity={0.5} />
      {/* Trend line */}
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Single Analyte Row ───────────────────────────────────────────────────────

function AnalyteTrendRow({
  config,
  labResults,
}: {
  config: AnalyteTrendConfig;
  labResults: LabResult[];
}) {
  const colors = useColors();
  const ref = REFERENCE_RANGES[config.analyteId];
  if (!ref) return null;

  // Collect all readings for this analyte, sorted oldest → newest (max 6 for sparkline)
  const readings = useMemo(() => {
    const all: { ts: number; value: number }[] = [];
    for (const r of labResults) {
      const v = r.values[config.analyteId];
      if (typeof v === 'number') {
        all.push({ ts: new Date(r.timestamp).getTime(), value: v });
      }
    }
    all.sort((a, b) => a.ts - b.ts);
    return all;
  }, [labResults, config.analyteId]);

  if (readings.length === 0) return null;

  const latest = readings[readings.length - 1].value;
  const sparkValues = readings.slice(-6).map(r => r.value);
  const status = getAnalyteStatus(config.analyteId, latest);

  const statusColor =
    status === 'high' || status === 'critical' ? colors.error
    : status === 'low' ? colors.accent ?? '#F59E0B'
    : colors.success;

  const statusLabel =
    status === 'high' ? 'High'
    : status === 'critical' ? 'Critical'
    : status === 'low' ? 'Low'
    : 'Normal';

  const isNormal = status === 'normal';

  const refText = ref.low === 0 ? `< ${ref.high}` : `${ref.low}–${ref.high} ${ref.unit}`;
  const displayValue = latest % 1 === 0 ? latest.toFixed(0) : latest.toFixed(2);

  return (
    <View style={[styles.row, { borderColor: isNormal ? colors.border : `${statusColor}40` }]}>
      {/* Left: label + value + status */}
      <View style={styles.rowLeft}>
        <View style={[styles.analyteIconDot, { backgroundColor: `${config.accentColor}20` }]}>
          <Text style={[styles.analyteIconText, { color: config.accentColor }]}>
            {config.label.slice(0, 2)}
          </Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.analyteLabel, { color: colors.muted }]}>{config.label}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.analyteValue, { color: isNormal ? colors.foreground : statusColor }]}>
              {displayValue}
            </Text>
            <Text style={[styles.analyteUnit, { color: colors.muted }]}> {ref.unit}</Text>
          </View>
          <Text style={[styles.refRange, { color: colors.muted }]}>Ref: {refText}</Text>
        </View>
      </View>

      {/* Right: sparkline + status badge */}
      <View style={styles.rowRight}>
        {sparkValues.length >= 2 && (
          <MiniSparkline
            values={sparkValues}
            low={ref.low}
            high={ref.high}
            color={isNormal ? config.accentColor : statusColor}
          />
        )}
        <View style={[styles.statusBadge, { backgroundColor: isNormal ? `${colors.success}18` : `${statusColor}18` }]}>
          <Text style={[styles.statusBadgeText, { color: isNormal ? colors.success : statusColor }]}>
            {statusLabel}
          </Text>
        </View>
        {readings.length > 1 && (
          <Text style={[styles.readingCount, { color: colors.muted }]}>
            {readings.length} readings
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export function LabTrendMiniChart({ labResults }: { labResults: LabResult[] }) {
  const colors = useColors();

  // Only show if there is at least one TSH or Vitamin D reading
  const hasData = useMemo(() => {
    return TREND_ANALYTES.some(cfg =>
      labResults.some(r => typeof r.values[cfg.analyteId] === 'number'),
    );
  }, [labResults]);

  if (!hasData) return null;

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/labs');
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.foreground,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>🔬</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Specialty Lab Trends
          </Text>
        </View>
        <Text style={[styles.headerChevron, { color: colors.muted }]}>›</Text>
      </View>

      {/* Analyte rows */}
      <View style={styles.rows}>
        {TREND_ANALYTES.map(cfg => (
          <AnalyteTrendRow key={cfg.analyteId} config={cfg} labResults={labResults} />
        ))}
      </View>

      {/* Footer hint */}
      <Text style={[styles.footer, { color: colors.muted }]}>
        Tap to view full lab history
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIcon: { fontSize: 16 },
  headerTitle: { fontSize: 14, fontWeight: '700' },
  headerChevron: { fontSize: 18, fontWeight: '300' },

  rows: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  analyteIconDot: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyteIconText: { fontSize: 10, fontWeight: '800' },
  rowMeta: { gap: 1 },
  analyteLabel: { fontSize: 10, fontWeight: '500' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  analyteValue: { fontSize: 18, fontWeight: '700' },
  analyteUnit: { fontSize: 11 },
  refRange: { fontSize: 9, marginTop: 1 },

  rowRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  readingCount: { fontSize: 9 },

  footer: { fontSize: 10, textAlign: 'center', marginTop: 10 },
});
