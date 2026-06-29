/**
 * ProjectedA1CCard
 * Estimates HbA1c using the ADAG (A1C-Derived Average Glucose) formula:
 *   Estimated A1C (%) = (Average Blood Glucose [mg/dL] + 46.7) / 28.7
 *
 * Reference: Nathan DM et al. "Translating the A1C Assay Into Estimated Average Glucose Values."
 * Diabetes Care 2008;31(8):1473–1478. (ADAG study)
 *
 * Features:
 * - ADAG formula with mmol/L → mg/dL auto-conversion (×18.01)
 * - Configurable data window: 30d (default), 60d, 90d
 * - Postprandial spike callout: warns when latest post-meal reading is ≥20% above 30d average
 * - 30-day A1C trend line chart (daily snapshots stored in AsyncStorage)
 * - Risk zone colour bar (Normal / Pre-Diabetes / Diabetes / High)
 * - ADA/AHA citations per risk category
 * - Safety disclaimer
 */
import React, { useMemo, useState, useEffect } from 'react';
import { TransparencyCard } from '@/components/transparency-card';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Svg, { Circle, Polyline, Line, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useReportStrings } from '@/hooks';
import type { BloodSugarRecord } from '@/lib/health/types';
import {
  loadA1CSnapshots,
  saveA1CSnapshot,
  clearA1CSnapshots,
  buildTrendSeries,
  type A1CSnapshot,
} from '@/lib/health/a1c-snapshots';
import {
  getA1CGapLabel,
  getTargetGaugeColor,
} from '@/lib/health/a1c-target';

// ─── ADAG Formula ─────────────────────────────────────────────────────────────

const MMOL_TO_MGDL = 18.01;

export function toMgDl(value: number, unit: 'mg/dL' | 'mmol/L' = 'mg/dL'): number {
  return unit === 'mmol/L' ? value * MMOL_TO_MGDL : value;
}

export function computeEstimatedA1C(avgGlucoseMgDl: number): number {
  return Math.round(((avgGlucoseMgDl + 46.7) / 28.7) * 10) / 10;
}

// ─── Risk categories ──────────────────────────────────────────────────────────

interface A1CCategory {
  label: string;
  color: string;
  description: string;
  range: string;
  aha: string;
}

function getA1CCategory(a1c: number): A1CCategory {
  if (a1c < 5.7) return {
    label: 'Normal',
    color: '#10B981',
    description: 'Below pre-diabetes threshold — maintain healthy habits',
    range: '< 5.7%',
    aha: 'ADA Standards of Care 2024, Table 2.2',
  };
  if (a1c < 6.5) return {
    label: 'Pre-Diabetes',
    color: '#F59E0B',
    description: 'Elevated — lifestyle changes recommended (diet, exercise)',
    range: '5.7 – 6.4%',
    aha: 'ADA Standards of Care 2024 §2.3; AHA 2023',
  };
  if (a1c < 8.0) return {
    label: 'Diabetes Range',
    color: '#EF4444',
    description: 'Meets diabetes threshold — speak with a healthcare provider',
    range: '≥ 6.5%',
    aha: 'ADA Standards of Care 2024 §2.4',
  };
  return {
    label: 'Significantly Elevated',
    color: '#DC2626',
    description: 'Well above target — urgent personal review recommended',
    range: '≥ 8.0%',
    aha: 'ADA Standards of Care 2024 §6.6',
  };
}

// ─── DASH / ADA diet tips for postprandial spikes ─────────────────────────────

interface DietTip {
  headline: string;
  body: string;
  citation: string;
}

function getPostprandialTip(spikePercent: number): DietTip {
  if (spikePercent >= 50) {
    return {
      headline: 'High Glycaemic Load Detected',
      body: 'This spike is significantly above your baseline. The DASH diet recommends replacing refined carbohydrates with high-fiber whole grains (≥25 g/day), legumes, and non-starchy vegetables to blunt post-meal glucose peaks.',
      citation: 'Sacks FM et al. NEJM 2001; ADA Standards of Care 2024 §5.2',
    };
  }
  if (spikePercent >= 30) {
    return {
      headline: 'Elevated Post-Meal Glucose',
      body: 'Consider reducing portion sizes of high-glycaemic foods. The ADA recommends pairing carbohydrates with protein or healthy fat (e.g. olive oil, nuts) to slow glucose absorption and reduce post-meal spikes.',
      citation: 'ADA Standards of Care 2024 §5.3; Willett WC et al. NEJM 2002',
    };
  }
  return {
    headline: 'Post-Meal Spike Above Baseline',
    body: 'Your post-meal reading is noticeably above your 30-day average. The DASH/Mediterranean approach suggests choosing low-glycaemic index foods, increasing soluble fiber intake, and taking a short walk after meals to improve insulin sensitivity.',
    citation: 'DASH: Appel LJ et al. NEJM 1997; ADA 2024 §5.2',
  };
}

// ─── Window options ───────────────────────────────────────────────────────────

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
];

// ─── Sparkline (weekly avg glucose) ──────────────────────────────────────────

const SPARK_W = 160;
const SPARK_H = 36;

function GlucoseSparkline({ weeks, color }: { weeks: (number | null)[]; color: string }) {
  const valid = weeks.filter((v): v is number => v !== null);
  if (valid.length < 2) return null;
  const minV = Math.min(...valid) - 10;
  const maxV = Math.max(...valid) + 10;
  const range = maxV - minV || 1;
  const points = weeks
    .map((v, i) => {
      if (v === null) return null;
      const x = (i / (weeks.length - 1)) * SPARK_W;
      const y = SPARK_H - ((v - minV) / range) * SPARK_H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
  return (
    <Svg width={SPARK_W} height={SPARK_H}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── 30-day A1C trend line chart ──────────────────────────────────────────────

const TREND_W = 280;
const TREND_H = 72;
const TREND_PAD_L = 36;
const TREND_PAD_B = 18;

function A1CTrendChart({
  series,
  color,
  textColor,
  gridColor,
}: {
  series: { date: string; a1c: number | null }[];
  color: string;
  textColor: string;
  gridColor: string;
}) {
  const valid = series.filter((s): s is { date: string; a1c: number } => s.a1c !== null);
  if (valid.length < 2) return null;

  const vals = valid.map((s) => s.a1c);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const rangeV = maxV - minV || 0.5;

  const chartW = TREND_W - TREND_PAD_L;
  const chartH = TREND_H - TREND_PAD_B;

  // Map each point to SVG coords
  const points = series
    .map((s, i) => {
      if (s.a1c === null) return null;
      const x = TREND_PAD_L + (i / (series.length - 1)) * chartW;
      const y = chartH - ((s.a1c - minV) / rangeV) * chartH * 0.85 + 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');

  // Y-axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV].map((v) => ({
    val: Math.round(v * 10) / 10,
    y: chartH - ((v - minV) / rangeV) * chartH * 0.85 + 4,
  }));

  // X-axis: first and last date labels
  const firstDate = series[0].date.slice(5);   // MM-DD
  const lastDate = series[series.length - 1].date.slice(5);

  return (
    <Svg width={TREND_W} height={TREND_H}>
      {/* Grid lines */}
      {yLabels.map((yl) => (
        <Line
          key={yl.val}
          x1={TREND_PAD_L}
          y1={yl.y}
          x2={TREND_W}
          y2={yl.y}
          stroke={gridColor}
          strokeWidth={0.5}
          strokeDasharray="3,3"
        />
      ))}
      {/* Y-axis labels */}
      {yLabels.map((yl) => (
        <SvgText
          key={yl.val}
          x={TREND_PAD_L - 4}
          y={yl.y + 4}
          fontSize={8}
          fill={textColor}
          textAnchor="end"
        >
          {yl.val}%
        </SvgText>
      ))}
      {/* Trend line */}
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* X-axis date labels */}
      <SvgText x={TREND_PAD_L} y={TREND_H - 2} fontSize={8} fill={textColor} textAnchor="start">
        {firstDate}
      </SvgText>
      <SvgText x={TREND_W} y={TREND_H - 2} fontSize={8} fill={textColor} textAnchor="end">
        {lastDate}
      </SvgText>
    </Svg>
  );
}

// ─── Circular gauge ───────────────────────────────────────────────────────────

const GAUGE_SIZE = 92;
const STROKE = 9;
const RADIUS = (GAUGE_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const A1C_MIN = 4;
const A1C_MAX = 14;

function A1CGauge({ a1c, color, trackColor }: { a1c: number; color: string; trackColor: string }) {
  const progress = Math.min(Math.max((a1c - A1C_MIN) / (A1C_MAX - A1C_MIN), 0), 1);
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const cx = GAUGE_SIZE / 2;
  const cy = GAUGE_SIZE / 2;
  return (
    <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
      <Circle cx={cx} cy={cy} r={RADIUS} stroke={trackColor} strokeWidth={STROKE} fill="none" />
      <Circle
        cx={cx} cy={cy} r={RADIUS}
        stroke={color} strokeWidth={STROKE} fill="none"
        strokeDasharray={`${CIRCUMFERENCE}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx}, ${cy}`}
      />
    </Svg>
  );
}

// ─── Risk zone bar ────────────────────────────────────────────────────────────

const RISK_ZONES = [
  { label: 'Normal', start: 4, end: 5.7, color: '#10B981' },
  { label: 'Pre-DM', start: 5.7, end: 6.5, color: '#F59E0B' },
  { label: 'DM', start: 6.5, end: 8.0, color: '#EF4444' },
  { label: 'High', start: 8.0, end: 14, color: '#DC2626' },
];
const RISK_TOTAL = 14 - 4;

function RiskZoneBar({ a1c }: { a1c: number }) {
  const markerPct = Math.min(Math.max((a1c - 4) / RISK_TOTAL, 0), 1) * 100;
  return (
    <View style={rz.wrap}>
      <View style={rz.bar}>
        {RISK_ZONES.map((z) => (
          <View
            key={z.label}
            style={[
              rz.segment,
              {
                flex: (z.end - z.start) / RISK_TOTAL,
                backgroundColor: z.color + '55',
                borderColor: z.color + '88',
              },
            ]}
          />
        ))}
        <View style={[rz.marker, { left: `${markerPct}%` as any }]} />
      </View>
      <View style={rz.labels}>
        {RISK_ZONES.map((z) => (
          <Text
            key={z.label}
            style={[rz.zoneLabel, { flex: (z.end - z.start) / RISK_TOTAL, color: z.color }]}
          >
            {z.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const rz = StyleSheet.create({
  wrap: { gap: 4 },
  bar: { height: 10, flexDirection: 'row', borderRadius: 6, overflow: 'visible', position: 'relative' },
  segment: { borderWidth: 0.5, borderRadius: 0 },
  marker: {
    position: 'absolute', top: -3, width: 3, height: 16,
    backgroundColor: '#fff', borderRadius: 2,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 3, marginLeft: -1.5,
  },
  labels: { flexDirection: 'row' },
  zoneLabel: { fontSize: 8, fontWeight: '700', textAlign: 'center' },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  bloodSugarRecords: BloodSugarRecord[];
  defaultWindowDays?: 30 | 60 | 90;
  defaultExpanded?: boolean;
  /** Personal A1C target (e.g. 6.5 or 7.0). When provided, the gauge colour
   * and header subtitle reflect the gap between current A1C and this target. */
  a1cTarget?: number;
}

export function ProjectedA1CCard({
  bloodSugarRecords,
  defaultWindowDays = 30,
  defaultExpanded = false,
  a1cTarget,
}: Props) {
  const colors = useColors();
  const rs = useReportStrings();
  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [windowDays, setWindowDays] = useState<number>(defaultWindowDays);
  const [snapshots, setSnapshots] = useState<A1CSnapshot[]>([]);

  // ── Load stored A1C snapshots on mount ────────────────────────────────────
  useEffect(() => {
    loadA1CSnapshots().then(setSnapshots).catch(() => {});
  }, []);

  function handleToggle() {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded((v) => !v);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // ── Core 30-day calculation ───────────────────────────────────────────────
  const result = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const windowRecords = bloodSugarRecords.filter(
      (r) => new Date(r.timestamp).getTime() >= cutoff,
    );

    if (windowRecords.length === 0) {
      return {
        hasData: false,
        avgMgDl: 0,
        avgMmol: 0,
        a1c: 0,
        count: 0,
        category: null,
        weeklyAvgs: [] as (number | null)[],
      };
    }

    const mgDlValues = windowRecords.map((r) =>
      r.glucoseMgDl > 0 ? r.glucoseMgDl : toMgDl(r.glucoseMmol, 'mmol/L'),
    );
    const avgMgDl = mgDlValues.reduce((s, v) => s + v, 0) / mgDlValues.length;
    const avgMmol = avgMgDl / MMOL_TO_MGDL;
    const a1c = computeEstimatedA1C(avgMgDl);
    const category = getA1CCategory(a1c);

    const numWeeks = Math.ceil(windowDays / 7);
    const now = Date.now();
    const weeklyAvgs: (number | null)[] = [];
    for (let w = numWeeks - 1; w >= 0; w--) {
      const wEnd = now - w * 7 * 24 * 60 * 60 * 1000;
      const wStart = wEnd - 7 * 24 * 60 * 60 * 1000;
      const wVals = windowRecords
        .filter((r) => {
          const t = new Date(r.timestamp).getTime();
          return t >= wStart && t < wEnd;
        })
        .map((r) => (r.glucoseMgDl > 0 ? r.glucoseMgDl : toMgDl(r.glucoseMmol, 'mmol/L')));
      weeklyAvgs.push(wVals.length > 0 ? wVals.reduce((s, v) => s + v, 0) / wVals.length : null);
    }

    return {
      hasData: true,
      avgMgDl: Math.round(avgMgDl),
      avgMmol: Math.round(avgMmol * 10) / 10,
      a1c,
      count: windowRecords.length,
      category,
      weeklyAvgs,
    };
  }, [bloodSugarRecords, windowDays]);

  // ── Persist today's snapshot whenever the A1C value changes ──────────────
  useEffect(() => {
    if (!result.hasData) return;
    saveA1CSnapshot(result.a1c).then(() => {
      loadA1CSnapshots().then(setSnapshots).catch(() => {});
    }).catch(() => {});
  }, [result.a1c, result.hasData]);

  // ── 30-day trend series ───────────────────────────────────────────────────
  const trendSeries = useMemo(() => buildTrendSeries(snapshots, 30), [snapshots]);

  // ── Postprandial spike detection ──────────────────────────────────────────
  const postprandialAlert = useMemo(() => {
    if (!result.hasData || result.avgMgDl === 0) return null;

    // Find the most recent post-meal reading within the last 6 hours
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const recentPostMeal = bloodSugarRecords
      .filter((r) => r.context === 'post-meal' && new Date(r.timestamp).getTime() >= sixHoursAgo)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (recentPostMeal.length === 0) return null;

    const latest = recentPostMeal[0];
    const latestMgDl = latest.glucoseMgDl > 0 ? latest.glucoseMgDl : toMgDl(latest.glucoseMmol, 'mmol/L');
    const spikePercent = ((latestMgDl - result.avgMgDl) / result.avgMgDl) * 100;

    // Only alert if ≥20% above 30-day average
    if (spikePercent < 20) return null;

    // Compute how much this spike shifts the projected A1C
    // Simplified: if we replaced the average with the spike value for 1 reading out of count
    const hypotheticalAvg = (result.avgMgDl * result.count + (latestMgDl - result.avgMgDl)) / result.count;
    const hypotheticalA1C = computeEstimatedA1C(hypotheticalAvg);
    const a1cDelta = Math.round((hypotheticalA1C - result.a1c) * 100) / 100;

    return {
      latestMgDl: Math.round(latestMgDl),
      spikePercent: Math.round(spikePercent),
      a1cDelta,
      tip: getPostprandialTip(spikePercent),
    };
  }, [bloodSugarRecords, result]);

  const category = result.category;
  // When a personal target is set and we have data, override the gauge colour
  // to reflect whether the user is at/below/above their target.
  const displayColor = (a1cTarget != null && result.hasData)
    ? getTargetGaugeColor(result.a1c, a1cTarget)
    : (category?.color ?? colors.primary);
  const trackColor = colors.border ?? '#E5E7EB';
  const gapLabel = (a1cTarget != null && result.hasData)
    ? getA1CGapLabel(result.a1c, a1cTarget)
    : null;

  return (
    <View style={[s.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {/* ── Header ── */}
      <Pressable style={s.header} onPress={handleToggle}>
        <View style={[s.iconWrap, { backgroundColor: displayColor + '22' }]}>
          <Text style={{ fontSize: 15 }}>🩸</Text>
        </View>
        <View style={s.headerText}>
          <Text style={[s.title, { color: colors.foreground }]}>{rs.projectedA1C ?? 'Logged A1C & Trend Tracking'}</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>
            {rs.a1cFormula ?? 'ADAG formula'} · {windowDays}d · {result.count} {rs.a1cReadings?.toLowerCase() ?? 'readings'}
          </Text>
          {gapLabel && (
            <Text style={[s.gapLabel, { color: displayColor }]} numberOfLines={1}>
              {gapLabel}
            </Text>
          )}
        </View>
        {result.hasData && category ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[s.a1cPill, { backgroundColor: displayColor + '18', borderColor: displayColor + '40' }]}>
              <Text style={[s.a1cNum, { color: displayColor }]}>{result.a1c}%</Text>
            </View>
            <View style={[s.gradeBadge, { backgroundColor: displayColor + '18', borderColor: displayColor + '40' }]}>
              <Text style={[s.gradeText, { color: displayColor }]}>{category.label}</Text>
            </View>
          </View>
        ) : (
          <Text style={[s.noDataPill, { color: colors.muted }]}>No data</Text>
        )}
        <IconSymbol
          name="chevron.right"
          size={13}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {/* ── Postprandial spike callout (shown even when collapsed) ── */}
      {postprandialAlert && (
        <View style={[s.spikeCallout, { backgroundColor: '#EF444412', borderColor: '#EF444440' }]}>
          <View style={s.spikeCalloutHeader}>
            <Text style={s.spikeIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.spikeTitle, { color: '#EF4444' }]}>
                {postprandialAlert.tip.headline}
              </Text>
              <Text style={[s.spikeStats, { color: '#EF4444' }]}>
                Post-meal: {postprandialAlert.latestMgDl} mg/dL
                {' '}(+{postprandialAlert.spikePercent}% above avg
                {postprandialAlert.a1cDelta > 0
                  ? ` · eA1C impact: +${postprandialAlert.a1cDelta}%`
                  : ''})
              </Text>
            </View>
          </View>
          <Text style={[s.spikeBody, { color: colors.foreground }]}>
            {postprandialAlert.tip.body}
          </Text>
          <Text style={[s.spikeCitation, { color: colors.muted }]}>
            {postprandialAlert.tip.citation}
          </Text>
        </View>
      )}

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={[s.body, { borderTopColor: colors.border }]}>

          {/* Window selector */}
          <View style={s.windowRow}>
            <Text style={[s.windowLabel, { color: colors.muted }]}>DATA WINDOW</Text>
            <View style={s.windowChips}>
              {WINDOW_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.days}
                  style={[
                    s.windowChip,
                    { borderColor: windowDays === opt.days ? displayColor : colors.border },
                    windowDays === opt.days && { backgroundColor: displayColor + '18' },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setWindowDays(opt.days);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.windowChipText, { color: windowDays === opt.days ? displayColor : colors.muted }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {!result.hasData ? (
            <View style={s.emptyWrap}>
              <Text style={[s.emptyText, { color: colors.muted }]}>
                Log blood glucose readings to see your projected A1C
              </Text>
              <TouchableOpacity
                style={[s.logBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                onPress={() => router.push('/log/blood-sugar' as any)}
                activeOpacity={0.7}
              >
                <Text style={[s.logBtnText, { color: colors.primary }]}>Log Blood Sugar →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Gauge + stats ── */}
              <View style={s.gaugeRow}>
                <View style={s.gaugeWrap}>
                  <A1CGauge a1c={result.a1c} color={displayColor} trackColor={trackColor} />
                  <View style={s.gaugeCenter}>
                    <Text style={[s.gaugeNum, { color: displayColor }]}>{result.a1c}%</Text>
                    <Text style={[s.gaugeSub, { color: colors.muted }]}>eA1C</Text>
                  </View>
                </View>
                <View style={s.statsCol}>
                  <View style={s.statRow}>
                    <View style={[s.statDot, { backgroundColor: displayColor }]} />
                    <Text style={[s.statLabel, { color: colors.muted }]}>Avg Glucose</Text>
                    <Text style={[s.statVal, { color: colors.foreground }]}>{result.avgMgDl} mg/dL</Text>
                  </View>
                  <View style={s.statRow}>
                    <View style={[s.statDot, { backgroundColor: '#64748B' }]} />
                    <Text style={[s.statLabel, { color: colors.muted }]}>Avg (mmol/L)</Text>
                    <Text style={[s.statVal, { color: colors.foreground }]}>{result.avgMmol} mmol/L</Text>
                  </View>
                  <View style={s.statRow}>
                    <View style={[s.statDot, { backgroundColor: '#64748B' }]} />
                    <Text style={[s.statLabel, { color: colors.muted }]}>{rs.a1cReadings ?? 'Readings'}</Text>
                    <Text style={[s.statVal, { color: colors.foreground }]}>{result.count}</Text>
                  </View>
                  <View style={s.statRow}>
                    <View style={[s.statDot, { backgroundColor: displayColor }]} />
                    <Text style={[s.statLabel, { color: colors.muted }]}>{rs.a1cRiskCategory ?? 'Target Range'}</Text>
                    <Text style={[s.statVal, { color: displayColor }]}>{category?.range}</Text>
                  </View>
                  <Pressable onPress={() => router.push('/log/blood-sugar' as any)}>
                    <Text style={[s.tapHint, { color: colors.primary }]}>+ Log reading →</Text>
                  </Pressable>
                </View>
              </View>

              {/* ── Risk zone bar ── */}
              <RiskZoneBar a1c={result.a1c} />

              {/* ── Category description banner ── */}
              {category && (
                <View style={[s.categoryBanner, { backgroundColor: displayColor + '12', borderColor: displayColor + '30' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.categoryLabel, { color: displayColor }]}>{category.label}</Text>
                    <Text style={[s.categoryRange, { color: displayColor }]}>{category.range}</Text>
                  </View>
                  <Text style={[s.categoryDesc, { color: colors.foreground }]}>{category.description}</Text>
                  <Text style={[s.categoryRef, { color: colors.muted }]}>{category.aha}</Text>
                </View>
              )}

              {/* ── 30-day A1C trend chart ── */}
              {trendSeries.filter((s) => s.a1c !== null).length >= 2 && (
                <View style={[s.trendSection, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                  <View style={s.trendHeader}>
                    <Text style={[s.trendTitle, { color: colors.muted }]}>{rs.a1cTrend ?? '30-DAY A1C TREND'}</Text>
                    <Text style={[s.trendSubtitle, { color: colors.muted }]}>
                      Daily snapshots · {trendSeries.filter((s) => s.a1c !== null).length} data points
                    </Text>
                  </View>
                  <A1CTrendChart
                    series={trendSeries}
                    color={displayColor}
                    textColor={colors.muted}
                    gridColor={colors.border ?? '#E5E7EB'}
                  />
                  {/* Trend direction badge */}
                  {(() => {
                    const validPts = trendSeries.filter((s): s is { date: string; a1c: number } => s.a1c !== null);
                    if (validPts.length < 4) return null;
                    const first = validPts[0].a1c;
                    const last = validPts[validPts.length - 1].a1c;
                    const delta = last - first;
                    const isImproving = delta < -0.1;
                    const isWorsening = delta > 0.1;
                    const trendColor = isImproving ? '#10B981' : isWorsening ? '#EF4444' : '#F59E0B';
                    const trendLabel = isImproving
                      ? `↓ ${rs.a1cTrendImproving ?? 'Improving'} (${delta.toFixed(1)}% over 30d)`
                      : isWorsening
                      ? `↑ ${rs.a1cTrendRising ?? 'Rising'} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}% over 30d)`
                      : `→ ${rs.a1cTrendStable ?? 'Stable'}`;
                    return (
                      <View style={[s.trendBadge, { backgroundColor: trendColor + '18', borderColor: trendColor + '40' }]}>
                        <Text style={[s.trendBadgeText, { color: trendColor }]}>{trendLabel}</Text>
                      </View>
                    );
                  })()}
                </View>
              )}

              {/* ── Weekly glucose sparkline ── */}
              {result.weeklyAvgs.filter((v) => v !== null).length >= 2 && (
                <View style={[s.sparkSection, { borderTopColor: colors.border }]}>
                  <Text style={[s.sparkTitle, { color: colors.muted }]}>WEEKLY AVG GLUCOSE (mg/dL)</Text>
                  <GlucoseSparkline weeks={result.weeklyAvgs} color={displayColor} />
                </View>
              )}

              {/* ── ADAG formula reference ── */}
              <View style={[s.formulaBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.formulaTitle, { color: colors.muted }]}>ADAG FORMULA</Text>
                <Text style={[s.formulaText, { color: colors.foreground }]}>
                  eA1C (%) = (Avg Glucose [mg/dL] + 46.7) ÷ 28.7
                </Text>
                <Text style={[s.formulaConvert, { color: colors.muted }]}>
                  mmol/L → mg/dL: multiply by 18.01 before applying formula
                </Text>
                <Text style={[s.formulaRef, { color: colors.muted }]}>
                  Nathan DM et al. Diabetes Care 2008;31(8):1473–1478
                </Text>
              </View>
            </>
          )}

          {/* ── Safety disclaimer ── */}
          <View style={[s.disclaimerBox, { backgroundColor: '#F59E0B12', borderColor: '#F59E0B40' }]}>
            <Text style={s.disclaimerIcon}>⚠️</Text>
            <Text style={[s.disclaimerText, { color: colors.muted }]}>
              Your logged A1C trend is calculated from your glucose readings and is{' '}
              <Text style={{ fontWeight: '700' }}>not a substitute</Text> for a laboratory
              hemoglobin A1C test. Consult your physician for personalized guidance.
            </Text>
          </View>

          {/* ── Clear A1C history footer ── */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                'Clear A1C History',
                'This will delete all stored A1C trend snapshots. Your glucose readings will not be affected. Use this after a significant lifestyle change to start a fresh trend.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear History',
                    style: 'destructive',
                    onPress: async () => {
                      await clearA1CSnapshots();
                      setSnapshots([]);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    },
                  },
                ],
              );
            }}
            style={[s.clearHistoryBtn, { borderColor: colors.border }]}
          >
            <Text style={[s.clearHistoryText, { color: '#EF4444' }]}>🗑 Clear A1C History</Text>
            <Text style={[s.clearHistoryHint, { color: colors.muted }]}>Resets trend after lifestyle change</Text>
          </TouchableOpacity>
        </View>
      )}
      <TransparencyCard variant="projectedA1C" style={{ marginTop: 8 }} />
  </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, marginHorizontal: 16, marginBottom: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 13 },
  iconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  gapLabel: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  a1cPill: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4, alignItems: 'center' },
  a1cNum: { fontSize: 15, fontWeight: '800' },
  gradeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  gradeText: { fontSize: 10, fontWeight: '800' },
  noDataPill: { fontSize: 12, fontStyle: 'italic' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 14 },

  // Postprandial spike callout
  spikeCallout: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  spikeCalloutHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  spikeIcon: { fontSize: 16, marginTop: 1 },
  spikeTitle: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  spikeStats: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  spikeBody: { fontSize: 12, lineHeight: 18 },
  spikeCitation: { fontSize: 10, fontStyle: 'italic' },

  // Window selector
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  windowLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  windowChips: { flexDirection: 'row', gap: 6 },
  windowChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  windowChipText: { fontSize: 11, fontWeight: '600' },

  // Empty state
  emptyWrap: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  logBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  logBtnText: { fontSize: 13, fontWeight: '700' },

  // Gauge
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  gaugeWrap: { width: GAUGE_SIZE, height: GAUGE_SIZE, alignItems: 'center', justifyContent: 'center' },
  gaugeCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  gaugeNum: { fontSize: 22, fontWeight: '900', lineHeight: 26 },
  gaugeSub: { fontSize: 9, fontWeight: '600' },
  statsCol: { flex: 1, gap: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 7, height: 7, borderRadius: 3.5 },
  statLabel: { fontSize: 11, flex: 1 },
  statVal: { fontSize: 12, fontWeight: '700' },
  tapHint: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  // Category banner
  categoryBanner: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 3 },
  categoryLabel: { fontSize: 12, fontWeight: '800' },
  categoryRange: { fontSize: 11, fontWeight: '600' },
  categoryDesc: { fontSize: 12, lineHeight: 17 },
  categoryRef: { fontSize: 10, fontStyle: 'italic', marginTop: 2 },

  // 30-day trend chart
  trendSection: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  trendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trendTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  trendSubtitle: { fontSize: 9 },
  trendBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  trendBadgeText: { fontSize: 11, fontWeight: '700' },

  // Sparkline
  sparkSection: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  sparkTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  // Formula box
  formulaBox: { borderRadius: 10, borderWidth: 0.5, padding: 10, gap: 3 },
  formulaTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  formulaText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
  formulaConvert: { fontSize: 11, lineHeight: 16 },
  formulaRef: { fontSize: 10, fontStyle: 'italic' },

  // Disclaimer
  disclaimerBox: { borderRadius: 10, borderWidth: 1, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  disclaimerIcon: { fontSize: 14, marginTop: 1 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },

  // Clear A1C history footer
  clearHistoryBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 2,
  },
  clearHistoryText: { fontSize: 13, fontWeight: '600' },
  clearHistoryHint: { fontSize: 11 },
});
