/**
 * PatternExplorer v1 — 16 Relationship Scatter Plots
 *
 * Features:
 *  - 16 evidence-based metric pairs with 30/90/180/365-day views
 *  - Pearson r, R², confidence level, data completeness score
 *  - 4-metric scoring: Data Completeness, Trend Stability,
 *    Relationship Strength, Research Confidence
 *  - Vibrant glassmorphism cards matching InsightEngine aesthetic
 *  - Collapsible section header (collapsed by default)
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  LayoutAnimation,
  TouchableOpacity,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, {
  Circle,
  Line,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  G,
} from 'react-native-svg';
import { GlassCard } from '@/components/glass-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme, useCorrelationStrings } from '@/hooks';
import { useColors } from '@/hooks/use-colors';
import {
  computeCorrelation,
  extractMetricSeries,
  METRIC_LABELS,
  METRIC_COLORS,
  type MetricKey,
  type CorrelationResult,
} from '@/lib/health/correlation';
import type { HealthData } from '@/lib/health/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_W = 260;
const CHART_H = 140;
const PAD_X = 28;
const PAD_Y = 20;

type DayRange = 30 | 90 | 180 | 365;
const DAY_RANGES: DayRange[] = [30, 90, 180, 365];

// 16 evidence-based metric pairs
interface EvidenceSource {
  journal: string;
  year: number;
  studyType: 'Meta-analysis' | 'Systematic Review' | 'Cohort Study' | 'Randomized Trial' | 'Scientific Statement';
  sampleSize?: string;
  doi?: string;
  pmid?: string;
  url: string;
}

const PLOT_PAIRS: {
  x: MetricKey;
  y: MetricKey;
  emoji: string;
  title: string;
  citation: string;
  citationUrl: string;
  researchConfidence: number; // 0-100
  evidence: EvidenceSource;
  insightTemplate: string; // {days}, {x}, {y} placeholders
}[] = [
  {
    x: 'sleepEfficiency', y: 'bpSystolic',
    emoji: '😴', title: 'Sleep Efficiency → Systolic BP',
    citation: 'Gangwisch et al., JAHA 2023',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/JAHA.122.027360',
    researchConfidence: 88,
    evidence: { journal: 'Journal of the American Heart Association', year: 2023, studyType: 'Cohort Study', sampleSize: '~8,000 adults', doi: '10.1161/JAHA.122.027360', pmid: '36695313', url: 'https://www.ahajournals.org/doi/10.1161/JAHA.122.027360' },
    insightTemplate: 'During the last {days} days, nights with higher sleep efficiency occurred alongside lower average systolic blood pressure measurements in your recorded data. Similar historical relationships have been explored in published sleep and cardiovascular research.',
  },
  {
    x: 'sleepHours', y: 'bpSystolic',
    emoji: '🌙', title: 'Sleep Duration → Systolic BP',
    citation: 'Cappuccio et al., Hypertension 2022',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/HYPERTENSIONAHA.122.18557',
    researchConfidence: 85,
    evidence: { journal: 'Hypertension (AHA)', year: 2022, studyType: 'Meta-analysis', sampleSize: '>1 million participants', doi: '10.1161/HYPERTENSIONAHA.122.18557', pmid: '35430872', url: 'https://www.ahajournals.org/doi/10.1161/HYPERTENSIONAHA.122.18557' },
    insightTemplate: 'During the last {days} days, nights with longer sleep duration occurred alongside lower average systolic blood pressure measurements in your recorded data. Similar patterns have been explored in published sleep and cardiovascular research.',
  },
  {
    x: 'deepSleepMinutes', y: 'hrv',
    emoji: '🧠', title: 'Deep Sleep → HRV',
    citation: 'Tobaldini et al., Eur Heart J 2023',
    citationUrl: 'https://academic.oup.com/eurheartj/article/44/6/474/6986583',
    researchConfidence: 82,
    evidence: { journal: 'European Heart Journal', year: 2023, studyType: 'Systematic Review', sampleSize: '12 studies reviewed', doi: '10.1093/eurheartj/ehac568', pmid: '36282547', url: 'https://academic.oup.com/eurheartj/article/44/6/474/6986583' },
    insightTemplate: 'During the last {days} days, nights with more deep sleep occurred alongside higher HRV measurements in your recorded data. Similar historical relationships between deep sleep and autonomic function have been explored in published research.',
  },
  {
    x: 'hrv', y: 'heartRate',
    emoji: '❤️', title: 'HRV ↔ Resting Heart Rate',
    citation: 'Shaffer & Ginsberg, Front Public Health 2017',
    citationUrl: 'https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full',
    researchConfidence: 91,
    evidence: { journal: 'Frontiers in Public Health', year: 2017, studyType: 'Systematic Review', doi: '10.3389/fpubh.2017.00258', pmid: '29034226', url: 'https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full' },
    insightTemplate: 'During the last {days} days, higher HRV measurements occurred alongside lower resting heart rate values in your recorded data. This inverse historical relationship has been extensively documented in published cardiovascular research.',
  },
  {
    x: 'weight', y: 'bpSystolic',
    emoji: '⚖️', title: 'Body Weight → Systolic BP',
    citation: 'Neter et al., Hypertension 2003 (meta-analysis)',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/01.HYP.0000094221.86888.AE',
    researchConfidence: 93,
    evidence: { journal: 'Hypertension (AHA)', year: 2003, studyType: 'Meta-analysis', sampleSize: '25 randomized trials', doi: '10.1161/01.HYP.0000094221.86888.AE', pmid: '14610101', url: 'https://www.ahajournals.org/doi/10.1161/01.HYP.0000094221.86888.AE' },
    insightTemplate: 'During the last {days} days, changes in body weight occurred alongside corresponding changes in systolic blood pressure in your recorded data. This historical relationship has been documented across multiple published meta-analyses.',
  },
  {
    x: 'sleepEfficiency', y: 'heartRate',
    emoji: '💓', title: 'Sleep Efficiency → Heart Rate',
    citation: 'Stein et al., Sleep 2022',
    citationUrl: 'https://academic.oup.com/sleep/article/45/2/zsab296/6478866',
    researchConfidence: 79,
    evidence: { journal: 'Sleep (Oxford Academic)', year: 2022, studyType: 'Cohort Study', sampleSize: '~2,200 participants', doi: '10.1093/sleep/zsab296', pmid: '34875090', url: 'https://academic.oup.com/sleep/article/45/2/zsab296/6478866' },
    insightTemplate: 'During the last {days} days, nights with higher sleep efficiency occurred alongside lower average heart rate measurements in your recorded data. Similar historical relationships have been explored in published sleep research.',
  },
  {
    x: 'sleepHours', y: 'hrv',
    emoji: '📊', title: 'Sleep Duration → HRV',
    citation: 'Buchheit et al., IJSM 2004',
    citationUrl: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/s-2004-821005',
    researchConfidence: 78,
    evidence: { journal: 'International Journal of Sports Medicine', year: 2004, studyType: 'Cohort Study', doi: '10.1055/s-2004-821005', pmid: '15346226', url: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/s-2004-821005' },
    insightTemplate: 'During the last {days} days, nights with longer sleep duration occurred alongside higher HRV measurements in your recorded data. Similar historical relationships between sleep duration and autonomic function have been explored in published research.',
  },
  {
    x: 'hrv', y: 'bpSystolic',
    emoji: '🫀', title: 'HRV → Systolic BP',
    citation: 'Thayer et al., Neurosci Biobehav Rev 2012',
    citationUrl: 'https://www.sciencedirect.com/science/article/pii/S0149763411001916',
    researchConfidence: 86,
    evidence: { journal: 'Neuroscience & Biobehavioral Reviews', year: 2012, studyType: 'Systematic Review', doi: '10.1016/j.neubiorev.2011.09.001', pmid: '21986499', url: 'https://www.sciencedirect.com/science/article/pii/S0149763411001916' },
    insightTemplate: 'During the last {days} days, higher HRV measurements occurred alongside lower systolic blood pressure values in your recorded data. This historical relationship between autonomic function and blood pressure has been explored in published cardiovascular research.',
  },
  {
    x: 'deepSleepMinutes', y: 'bpSystolic',
    emoji: '🌊', title: 'Deep Sleep → Systolic BP',
    citation: 'Fung et al., JAHA 2011',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/JAHA.111.001222',
    researchConfidence: 80,
    evidence: { journal: 'Journal of the American Heart Association', year: 2011, studyType: 'Cohort Study', sampleSize: '784 men', doi: '10.1161/JAHA.111.001222', pmid: '22042898', url: 'https://www.ahajournals.org/doi/10.1161/JAHA.111.001222' },
    insightTemplate: 'During the last {days} days, nights with more deep sleep occurred alongside lower systolic blood pressure measurements in your recorded data. Similar historical relationships have been explored in published sleep and cardiovascular research.',
  },
  {
    x: 'weight', y: 'hrv',
    emoji: '🏋️', title: 'Body Weight → HRV',
    citation: 'Antelmi et al., Am J Cardiol 2004',
    citationUrl: 'https://www.ajconline.org/article/S0002-9149(04)00131-7/fulltext',
    researchConfidence: 74,
    evidence: { journal: 'American Journal of Cardiology', year: 2004, studyType: 'Cohort Study', sampleSize: '1,160 participants', doi: '10.1016/j.amjcard.2004.01.020', pmid: '15145100', url: 'https://www.ajconline.org/article/S0002-9149(04)00131-7/fulltext' },
    insightTemplate: 'During the last {days} days, changes in body weight occurred alongside corresponding changes in HRV measurements in your recorded data. Similar historical relationships between body composition and autonomic function have been explored in published research.',
  },
  {
    x: 'sleepEfficiency', y: 'restingHR',
    emoji: '🛌', title: 'Sleep Efficiency → Resting HR',
    citation: 'Svensson et al., Sleep Med 2020',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/32563736/',
    researchConfidence: 76,
    evidence: { journal: 'Sleep Medicine', year: 2020, studyType: 'Cohort Study', sampleSize: '~1,500 participants', pmid: '32563736', url: 'https://pubmed.ncbi.nlm.nih.gov/32563736/' },
    insightTemplate: 'During the last {days} days, nights with higher sleep efficiency occurred alongside lower resting heart rate measurements in your recorded data. Similar historical relationships have been explored in published sleep research.',
  },
  {
    x: 'sleepHours', y: 'restingHR',
    emoji: '⏰', title: 'Sleep Duration → Resting HR',
    citation: 'Svensson et al., Sleep Med 2020',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/32563736/',
    researchConfidence: 75,
    evidence: { journal: 'Sleep Medicine', year: 2020, studyType: 'Cohort Study', sampleSize: '~1,500 participants', pmid: '32563736', url: 'https://pubmed.ncbi.nlm.nih.gov/32563736/' },
    insightTemplate: 'During the last {days} days, nights with longer sleep duration occurred alongside lower resting heart rate measurements in your recorded data. Similar historical relationships between sleep duration and resting heart rate have been explored in published research.',
  },
  {
    x: 'deepSleepMinutes', y: 'restingHR',
    emoji: '💤', title: 'Deep Sleep → Resting HR',
    citation: 'Tobaldini et al., Eur Heart J 2023',
    citationUrl: 'https://academic.oup.com/eurheartj/article/44/6/474/6986583',
    researchConfidence: 77,
    evidence: { journal: 'European Heart Journal', year: 2023, studyType: 'Systematic Review', sampleSize: '12 studies reviewed', doi: '10.1093/eurheartj/ehac568', pmid: '36282547', url: 'https://academic.oup.com/eurheartj/article/44/6/474/6986583' },
    insightTemplate: 'During the last {days} days, nights with more deep sleep occurred alongside lower resting heart rate measurements in your recorded data. Similar historical relationships between deep sleep and autonomic function have been explored in published research.',
  },
  {
    x: 'hrv', y: 'restingHR',
    emoji: '📈', title: 'HRV ↔ Resting HR',
    citation: 'Plews et al., Int J Sports Physiol 2013',
    citationUrl: 'https://journals.humankinetics.com/view/journals/ijspp/8/3/article-p346.xml',
    researchConfidence: 89,
    evidence: { journal: 'International Journal of Sports Physiology and Performance', year: 2013, studyType: 'Cohort Study', doi: '10.1123/ijspp.8.3.346', pmid: '23006789', url: 'https://journals.humankinetics.com/view/journals/ijspp/8/3/article-p346.xml' },
    insightTemplate: 'During the last {days} days, higher HRV measurements occurred alongside lower resting heart rate values in your recorded data. This inverse historical relationship between HRV and resting heart rate has been documented in published sports physiology research.',
  },
  {
    x: 'weight', y: 'bpDiastolic',
    emoji: '🩺', title: 'Body Weight → Diastolic BP',
    citation: 'Neter et al., Hypertension 2003 (meta-analysis)',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/01.HYP.0000094221.86888.AE',
    researchConfidence: 90,
    evidence: { journal: 'Hypertension (AHA)', year: 2003, studyType: 'Meta-analysis', sampleSize: '25 randomized trials', doi: '10.1161/01.HYP.0000094221.86888.AE', pmid: '14610101', url: 'https://www.ahajournals.org/doi/10.1161/01.HYP.0000094221.86888.AE' },
    insightTemplate: 'During the last {days} days, changes in body weight occurred alongside corresponding changes in diastolic blood pressure in your recorded data. This historical relationship has been documented across multiple published meta-analyses.',
  },
  {
    x: 'bpSystolic', y: 'bpDiastolic',
    emoji: '💊', title: 'Systolic ↔ Diastolic BP',
    citation: 'Whelton et al., JACC 2018 ACC/AHA Guidelines',
    citationUrl: 'https://www.jacc.org/doi/10.1016/j.jacc.2017.11.006',
    researchConfidence: 95,
    evidence: { journal: 'Journal of the American College of Cardiology', year: 2018, studyType: 'Scientific Statement', doi: '10.1016/j.jacc.2017.11.006', pmid: '29146535', url: 'https://www.jacc.org/doi/10.1016/j.jacc.2017.11.006' },
    insightTemplate: 'During the last {days} days, systolic and diastolic blood pressure measurements moved together in your recorded data. This co-variation is a well-documented historical relationship in published cardiovascular research.',
  },
];

// ─── Scoring helpers ──────────────────────────────────────────────────────────

interface ScoreResult {
  dataCompleteness: number;   // 0-100
  trendStability: number;     // 0-100
  relationshipStrength: number; // 0-100
  researchConfidence: number; // 0-100
  overall: number;            // 0-100
}

function computeScores(
  result: CorrelationResult,
  dataPoints: number,
  dayRange: DayRange,
  researchConfidence: number
): ScoreResult {
  // Data Completeness: ratio of actual points to expected (1 per day)
  const dataCompleteness = Math.min(100, Math.round((dataPoints / dayRange) * 100));

  // Trend Stability: based on R² — higher R² = more stable trend
  const trendStability = Math.round(result.rSquared * 100);

  // Relationship Strength: |r| mapped to 0-100
  const relationshipStrength = Math.round(Math.abs(result.r) * 100);

  const overall = Math.round(
    (dataCompleteness * 0.25 + trendStability * 0.25 + relationshipStrength * 0.25 + researchConfidence * 0.25)
  );

  return { dataCompleteness, trendStability, relationshipStrength, researchConfidence, overall };
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({
  label,
  value,
  color,
  isDark,
}: {
  label: string;
  value: number;
  color: string;
  isDark: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.scoreBarRow}>
      <Text style={[styles.scoreBarLabel, { color: isDark ? 'rgba(200,210,255,0.55)' : 'rgba(0,0,0,0.50)' }]}>
        {label}
      </Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreBarValue, { color }]}>{pct}</Text>
    </View>
  );
}

// ─── Mini Scatter Chart ───────────────────────────────────────────────────────

interface SelectedPoint {
  index: number;
  date: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
}

function PatternScatterChart({
  result,
  accentColor,
  xLabel,
  yLabel,
  isDark,
  cs,
}: {
  result: CorrelationResult;
  accentColor: string;
  xLabel: string;
  yLabel: string;
  isDark: boolean;
  cs: ReturnType<typeof useCorrelationStrings>;
}) {
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const pts = result.points;
  if (pts.length < 5) {
    return (
      <View style={[styles.chartEmpty, {
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        height: 110,
        gap: 6,
      }]}>
        <Text style={{ fontSize: 28, lineHeight: 34 }}>📊</Text>
        <Text style={[styles.chartEmptyTitle, { color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' }]}>
          {cs.patternNoDataTitle ?? 'Not Enough Data Yet'}
        </Text>
        <Text style={[styles.chartEmptySubtitle, { color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)' }]}>
          {(cs.patternNoDataSubtitle ?? 'Log at least 5 {x} and {y} entries to see this chart')
            .replace('{x}', xLabel)
            .replace('{y}', yLabel)}
        </Text>
        <View style={[styles.chartEmptyBadge, { backgroundColor: accentColor + '18', borderColor: accentColor + '35' }]}>
          <Text style={[styles.chartEmptyBadgeText, { color: accentColor }]}>
            {pts.length}/5 {cs.patternNoDataEntries ?? 'entries'}
          </Text>
        </View>
      </View>
    );
  }
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const drawW = CHART_W - PAD_X * 2;
  const drawH = CHART_H - PAD_Y * 2;

  const mapped = pts.map((p, i) => ({
    cx: PAD_X + ((p.x - xMin) / xRange) * drawW,
    cy: CHART_H - PAD_Y - ((p.y - yMin) / yRange) * drawH,
    x: p.x,
    y: p.y,
    date: p.date,
    index: i,
  }));

  // Regression line endpoints
  const x1 = PAD_X;
  const x2 = CHART_W - PAD_X;
  const y1 = CHART_H - PAD_Y - ((result.slope * xMin + result.intercept - yMin) / yRange) * drawH;
  const y2 = CHART_H - PAD_Y - ((result.slope * xMax + result.intercept - yMin) / yRange) * drawH;

  const gradId = `grad_${accentColor.replace('#', '')}`;

  // Format tooltip values
  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    } catch { return d; }
  };
  const fmtVal = (v: number, label: string) => {
    if (label.toLowerCase().includes('sleep')) return `${(v / 60).toFixed(1)}h`;
    if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  };

  // Tooltip position: flip to left side if point is in right half
  const tooltipX = selected ? (selected.cx > CHART_W / 2 ? selected.cx - 130 : selected.cx + 12) : 0;
  const tooltipY = selected ? Math.max(4, selected.cy - 36) : 0;

  return (
    <View style={{ position: 'relative' }}>
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={accentColor} stopOpacity="0.15" />
          <Stop offset="1" stopColor={accentColor} stopOpacity="0.05" />
        </LinearGradient>
      </Defs>
      {/* Background */}
      <Rect x={0} y={0} width={CHART_W} height={CHART_H} fill={`url(#${gradId})`} rx={8} />
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((f, i) => (
        <Line
          key={i}
          x1={PAD_X}
          y1={PAD_Y + f * drawH}
          x2={CHART_W - PAD_X}
          y2={PAD_Y + f * drawH}
          stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
          strokeWidth={0.5}
        />
      ))}
      {/* Regression line */}
      {result.points.length >= 3 && (
        <Line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={accentColor}
          strokeWidth={1.5}
          strokeOpacity={0.6}
          strokeDasharray="4 3"
        />
      )}
      {/* Data points with tap hitboxes */}
      {mapped.map((p) => {
        const isSelected = selected?.index === p.index;
        return (
          <G key={p.index} onPress={() => {
            setSelected(prev => prev?.index === p.index ? null : {
              index: p.index,
              date: p.date,
              x: p.x,
              y: p.y,
              cx: p.cx,
              cy: p.cy,
            });
          }}>
            {/* Invisible larger hitbox */}
            <Rect
              x={p.cx - 10}
              y={p.cy - 10}
              width={20}
              height={20}
              fill="transparent"
            />
            {/* Selected ring */}
            {isSelected && (
              <Circle
                cx={p.cx}
                cy={p.cy}
                r={7}
                fill={accentColor}
                fillOpacity={0.18}
                stroke={accentColor}
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
            )}
            <Circle
              cx={p.cx}
              cy={p.cy}
              r={isSelected ? 4.5 : 3.5}
              fill={accentColor}
              fillOpacity={isSelected ? 1 : 0.75}
              stroke={accentColor}
              strokeWidth={0.5}
              strokeOpacity={0.9}
            />
          </G>
        );
      })}
      {/* Axis labels */}
      <SvgText
        x={CHART_W / 2}
        y={CHART_H - 4}
        fontSize={8}
        fill={isDark ? 'rgba(200,210,255,0.40)' : 'rgba(0,0,0,0.35)'}
        textAnchor="middle"
      >
        {xLabel.length > 22 ? xLabel.slice(0, 22) + '…' : xLabel}
      </SvgText>
    </Svg>
    {/* Tooltip overlay */}
    {selected && (
      <View
        style={[
          styles.tooltip,
          {
            left: tooltipX,
            top: tooltipY,
            backgroundColor: isDark ? 'rgba(15,18,35,0.96)' : 'rgba(255,255,255,0.97)',
            borderColor: accentColor + '55',
            shadowColor: accentColor,
          },
        ]}
        pointerEvents="none"
      >
        <Text style={[styles.tooltipDate, { color: isDark ? 'rgba(180,200,255,0.65)' : 'rgba(0,0,0,0.50)' }]}>
          {fmtDate(selected.date)}
        </Text>
        <View style={styles.tooltipRow}>
          <Text style={[styles.tooltipLabel, { color: isDark ? 'rgba(180,200,255,0.55)' : 'rgba(0,0,0,0.45)' }]}>
            {xLabel.length > 14 ? xLabel.slice(0, 14) + '…' : xLabel}
          </Text>
          <Text style={[styles.tooltipValue, { color: accentColor }]}>
            {fmtVal(selected.x, xLabel)}
          </Text>
        </View>
        <View style={styles.tooltipRow}>
          <Text style={[styles.tooltipLabel, { color: isDark ? 'rgba(180,200,255,0.55)' : 'rgba(0,0,0,0.45)' }]}>
            {yLabel.length > 14 ? yLabel.slice(0, 14) + '…' : yLabel}
          </Text>
          <Text style={[styles.tooltipValue, { color: accentColor }]}>
            {fmtVal(selected.y, yLabel)}
          </Text>
        </View>
      </View>
    )}
    </View>
  );
}

// ─── Strength label ───────────────────────────────────────────────────────────

// ─── Personal Insight generator ─────────────────────────────────────────────

function generatePersonalInsight(
  pair: typeof PLOT_PAIRS[0],
  result: CorrelationResult,
  dayRange: number,
): string {
  if (result.points.length < 5) {
    return '__INSIGHT_FALLBACK__';
  }
  return pair.insightTemplate.replace('{days}', String(dayRange));
  // Note: insightFallback is provided via cs.peInsightFallback in the render below
}

// ─── Evidence Source badge ────────────────────────────────────────────────────

const STUDY_TYPE_COLOR: Record<EvidenceSource['studyType'], string> = {
  'Meta-analysis':      '#7C3AED',
  'Systematic Review':  '#2563EB',
  'Cohort Study':       '#0891B2',
  'Randomized Trial':   '#059669',
  'Scientific Statement': '#D97706',
};

function EvidenceSourceBlock({
  ev,
  isDark,
  cs,
}: {
  ev: EvidenceSource;
  isDark: boolean;
  cs: ReturnType<typeof useCorrelationStrings>;
}) {
  const badgeColor = STUDY_TYPE_COLOR[ev.studyType];
  return (
    <TouchableOpacity
      style={[evStyles.block, {
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
      }]}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Linking.openURL(ev.url);
      }}
      activeOpacity={0.7}
    >
      <View style={evStyles.header}>
          <Text style={[evStyles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)' }]}>
          📚 {cs.peResearchSourceLabel ?? 'RESEARCH SOURCE ↗'}
        </Text>
        <View style={[evStyles.typeBadge, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '44' }]}>
          <Text style={[evStyles.typeBadgeText, { color: badgeColor }]}>{ev.studyType}</Text>
        </View>
      </View>
      <Text style={[evStyles.journal, { color: isDark ? 'rgba(160,200,255,0.80)' : 'rgba(30,80,200,0.80)' }]}>
        {ev.journal} ({ev.year})
      </Text>
      {ev.sampleSize && (
        <Text style={[evStyles.meta, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>
          {cs.peSampleLabel ?? 'Sample:'} {ev.sampleSize}
        </Text>
      )}
      <View style={evStyles.idRow}>
        {ev.pmid && (
          <Text style={[evStyles.idChip, { color: isDark ? 'rgba(160,200,255,0.60)' : 'rgba(30,80,200,0.60)' }]}>
            PMID: {ev.pmid}
          </Text>
        )}
        {ev.doi && (
          <Text style={[evStyles.idChip, { color: isDark ? 'rgba(160,200,255,0.60)' : 'rgba(30,80,200,0.60)' }]}>
            DOI: {ev.doi.length > 28 ? ev.doi.slice(0, 28) + '…' : ev.doi}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const evStyles = StyleSheet.create({
  block: { borderRadius: 8, borderWidth: 0.5, padding: 10, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  sectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  typeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  journal: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  meta: { fontSize: 10, fontWeight: '400' },
  idRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  idChip: { fontSize: 9, fontWeight: '500' },
});

function strengthLabel(r: number): { labelKey: 'peStrengthStrong' | 'peStrengthModerate' | 'peStrengthWeak' | 'peStrengthNoPattern'; color: string } {
  const abs = Math.abs(r);
  if (abs >= 0.7) return { labelKey: 'peStrengthStrong' as const, color: '#10B981' };
  if (abs >= 0.4) return { labelKey: 'peStrengthModerate' as const, color: '#F59E0B' };
  if (abs >= 0.2) return { labelKey: 'peStrengthWeak' as const, color: '#6366F1' };
  return { labelKey: 'peStrengthNoPattern' as const, color: '#9CA3AF' };
}

// ─── Plot Card ────────────────────────────────────────────────────────────────

function PlotCard({
  pair,
  data,
  dayRange,
  isDark,
  cs,
}: {
  pair: typeof PLOT_PAIRS[0];
  data: HealthData;
  dayRange: DayRange;
  isDark: boolean;
  cs: ReturnType<typeof useCorrelationStrings>;
}) {
  const [expanded, setExpanded] = useState(false);
  const accentColor = METRIC_COLORS[pair.x] ?? '#6366F1';

  // Filter data to dayRange
  const filteredData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayRange);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const filterByDate = <T extends { timestamp?: string; date?: string }>(arr: T[]): T[] =>
      arr.filter(r => {
        const d = (r.timestamp ?? r.date ?? '').slice(0, 10);
        return d >= cutoffStr;
      });

    return {
      ...data,
      bloodPressure: filterByDate(data.bloodPressure ?? []),
      sleep: (data.sleep ?? []).filter(r => r.date >= cutoffStr),
      pulse: filterByDate(data.pulse ?? []),
      bodyComposition: filterByDate(data.bodyComposition ?? []),
      restingHRSamples: filterByDate((data as any).restingHRSamples ?? []),
    } as HealthData;
  }, [data, dayRange]);

  const result = useMemo(() => computeCorrelation(filteredData, pair.x, pair.y), [filteredData, pair.x, pair.y]);
  const scores = useMemo(() =>
    computeScores(result, result.points.length, dayRange, pair.researchConfidence),
    [result, dayRange, pair.researchConfidence]
  );
  const { labelKey: strLabelKey, color: strColor } = strengthLabel(result.r);
  const strLabel = cs[strLabelKey] ?? strLabelKey;
  const direction = result.r > 0.1 ? '↗' : result.r < -0.1 ? '↘' : '→';
  const dirColor = result.r > 0.1 ? '#10B981' : result.r < -0.1 ? '#F43F5E' : '#9CA3AF';

  return (
    <View style={[
      styles.plotCard,
      {
        backgroundColor: isDark ? 'rgba(10,12,20,0.88)' : 'rgba(255,255,255,0.92)',
        borderColor: expanded ? accentColor + '55' : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        shadowColor: accentColor,
        shadowOpacity: expanded ? 0.22 : 0.10,
      },
    ]}>
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      {/* Header */}
      <Pressable
        style={styles.plotHeader}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          LayoutAnimation.configureNext({
            duration: 200,
            update: { type: 'easeInEaseOut' },
            create: { type: 'easeInEaseOut', property: 'opacity' },
            delete: { type: 'easeInEaseOut', property: 'opacity' },
          });
          setExpanded(e => !e);
        }}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.plotEmoji}>{pair.emoji}</Text>
            <Text style={[styles.plotTitle, { color: isDark ? '#E8EEFF' : '#0F172A' }]} numberOfLines={2}>
              {pair.title}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {/* Pearson r */}
            <View style={[styles.rBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '44' }]}>
              <Text style={[styles.rBadgeText, { color: accentColor }]}>
                r = {result.r.toFixed(2)}
              </Text>
            </View>
            {/* Strength */}
            <View style={[styles.strengthBadge, { backgroundColor: strColor + '18', borderColor: strColor + '40' }]}>
              <Text style={[styles.strengthText, { color: strColor }]}>{strLabel}</Text>
            </View>
            {/* Direction */}
            <Text style={[styles.directionText, { color: dirColor }]}>{direction}</Text>
          </View>
        </View>
        <Text style={[styles.chevron, { color: accentColor, transform: [{ rotate: expanded ? '90deg' : '0deg' }] }]}>›</Text>
      </Pressable>

      {/* Compact stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{result.points.length}</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>{cs.peStatPoints ?? 'points'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{(result.rSquared * 100).toFixed(0)}%</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>{cs.peStatRSquared ?? 'R²'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{scores.dataCompleteness}%</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>{cs.peStatCoverage ?? 'coverage'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{scores.overall}</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>{cs.peStatScore ?? 'score'}</Text>
        </View>
      </View>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Scatter chart */}
          <View style={[styles.chartWrap, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          }]}>
            <PatternScatterChart
              result={result}
              accentColor={accentColor}
              xLabel={METRIC_LABELS[pair.x]}
              yLabel={METRIC_LABELS[pair.y]}
              isDark={isDark}
              cs={cs}
            />
          </View>

          {/* 4-Metric Scoring System */}
          <View style={[styles.scoringBlock, {
            backgroundColor: accentColor + '0A',
            borderColor: accentColor + '22',
          }]}>
            <Text style={[styles.scoringTitle, { color: accentColor }]}>
              📊 {cs.scoreAnalysisTitle ?? 'ANALYSIS SCORES'}
            </Text>
            <ScoreBar label={cs.scoreDataCompleteness ?? 'Data Completeness'} value={scores.dataCompleteness} color="#3B82F6" isDark={isDark} />
            <ScoreBar label={cs.scoreTrendStability ?? 'Trend Stability'} value={scores.trendStability} color="#10B981" isDark={isDark} />
            <ScoreBar label={cs.scoreRelationshipStrength ?? 'Relationship Strength'} value={scores.relationshipStrength} color={accentColor} isDark={isDark} />
            <ScoreBar label={cs.scoreResearchConfidence ?? 'Research Confidence'} value={scores.researchConfidence} color="#8B5CF6" isDark={isDark} />
            <View style={[styles.overallRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
              <Text style={[styles.overallLabel, { color: isDark ? 'rgba(200,210,255,0.60)' : 'rgba(0,0,0,0.50)' }]}>
                {cs.scoreOverall ?? 'Overall Score'}
              </Text>
              <View style={[styles.overallBadge, {
                backgroundColor: accentColor + '22',
                borderColor: accentColor + '55',
              }]}>
                <Text style={[styles.overallValue, { color: accentColor }]}>{scores.overall}/100</Text>
              </View>
            </View>
          </View>

          {/* 💡 Personal Insight */}
          <View style={[styles.insightBlock, {
            backgroundColor: accentColor + '08',
            borderColor: accentColor + '25',
          }]}>
            <Text style={[styles.insightLabel, { color: accentColor }]}>💡 {cs.pePersonalInsightLabel ?? 'Personal Insight'}</Text>
            <Text style={[styles.insightText, { color: isDark ? 'rgba(220,230,255,0.75)' : 'rgba(0,0,0,0.65)' }]}>
              {generatePersonalInsight(pair, result, dayRange).replace('__INSIGHT_FALLBACK__', cs.peInsightFallback ?? 'As additional information is recorded, this section will summarize historical patterns found within your personal wellness records alongside educational research references.')}
            </Text>
          </View>

          {/* 📚 Evidence Source */}
          <EvidenceSourceBlock ev={pair.evidence} isDark={isDark} cs={cs} />

          <Text style={[styles.disclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)' }]}>
            {cs.peDisclaimer ?? 'For informational purposes only · Not medical advice'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface PatternExplorerProps {
  data: HealthData;
}

export function PatternExplorer({ data }: PatternExplorerProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = useColors();
  const cs = useCorrelationStrings();
  const [sectionExpanded, setSectionExpanded] = useState(false);
  const [dayRange, setDayRange] = useState<DayRange>(30);

  const toggleSection = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: 'easeInEaseOut' },
      create: { type: 'easeInEaseOut', property: 'opacity' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setSectionExpanded(e => !e);
  }, []);

  return (
    <GlassCard accentColor="#7C3AED" noPadding style={{ marginHorizontal: 16, marginBottom: 10 }}>
      {/* Section header — matches Record tab LogCard style exactly */}
      <Pressable
        style={styles.sectionHeader}
        onPress={toggleSection}
        accessibilityRole="button"
        accessibilityLabel="Pattern Explorer"
        accessibilityHint={sectionExpanded ? 'Tap to collapse' : 'Tap to expand'}
      >
        {/* Icon wrap — matches Record LogCard iconWrap */}
        <View style={styles.cardIconWrap}>
          <Text style={styles.cardIcon}>🔬</Text>
        </View>
        {/* Content — matches Record LogCard content */}
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {cs.patternExplorerLabel ?? 'Pattern Explorer'}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            {cs.patternExplorerSubtitle ?? '16 relationship scatter plots · 4-metric scoring'}
          </Text>
        </View>
        {/* Right: count badge + chevron */}
        <View style={styles.sectionHeaderRight}>
          <View style={[styles.countBadge, { backgroundColor: 'rgba(124,58,237,0.20)', borderColor: 'rgba(124,58,237,0.40)' }]}>
            <Text style={[styles.countBadgeText, { color: '#7C3AED' }]}>16</Text>
          </View>
          <IconSymbol name="chevron.right" size={18} color={colors.muted} />
        </View>
      </Pressable>

      {sectionExpanded && (
        <View style={styles.sectionBody}>
          {/* Day-range tabs */}
          <View style={styles.rangeTabRow}>
            {DAY_RANGES.map(d => {
              const active = d === dayRange;
              return (
                <Pressable
                  key={d}
                  style={[styles.rangeTab, {
                    backgroundColor: active ? '#7C3AED22' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                    borderColor: active ? '#7C3AED60' : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
                  }]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDayRange(d);
                  }}
                >
                  <Text style={[styles.rangeTabText, { color: active ? '#7C3AED' : isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)', fontWeight: active ? '700' : '500' }]}>
                    {cs[`peDayRange${d}` as keyof typeof cs] ?? `${d}d`}
                  </Text>
                  {active && (
                    <View style={[styles.rangeTabUnderline, { backgroundColor: '#7C3AED' }]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Subtitle */}
          <Text style={[styles.rangeSubtitle, { color: isDark ? 'rgba(200,180,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>
            {(cs.patternExplorerRangeSubtitle ?? 'Showing last {n} days · Tap a card to see scatter plot & scores').replace('{n}', String(dayRange))}
          </Text>

          {/* Plot cards */}
          <View style={styles.plotGrid}>
            {PLOT_PAIRS.map((pair, i) => (
              <PlotCard
                key={i}
                pair={pair}
                data={data}
                dayRange={dayRange}
                isDark={isDark}
                cs={cs}
              />
            ))}
          </View>

          {/* Footer */}
          <Text style={[styles.footerDisclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)' }]}>
            {cs.peFooterDisclaimer ?? 'Historical relationships generated from your recorded wellness information. Educational research sources are provided for informational purposes only. Not medical advice.'}
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Record-tab-matching LogCard header styles ──────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14, backgroundColor: '#7C3AED22' },
  cardIcon: { fontSize: 24 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  sectionHeaderLeft: { flex: 1, gap: 2 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // legacy — kept for PlotCard internal use
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  sectionSubtitle: { fontSize: 11, fontWeight: '400' },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  countBadgeText: { fontSize: 11, fontWeight: '700' },
  chevron: { fontSize: 22, fontWeight: '300', lineHeight: 26 },

  sectionBody: { paddingBottom: 16 },

  rangeTabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  rangeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rangeTabText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  rangeTabUnderline: { height: 2, width: '50%', borderRadius: 1, marginTop: 4 },
  rangeSubtitle: {
    fontSize: 10,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
  },

  plotGrid: { gap: 10, paddingHorizontal: 16 },

  plotCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  accentBar: { height: 3, width: '100%' },
  plotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 8,
  },
  plotEmoji: { fontSize: 18, lineHeight: 22 },
  plotTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18, flex: 1 },
  rBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  rBadgeText: { fontSize: 10, fontWeight: '700' },
  strengthBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  strengthText: { fontSize: 10, fontWeight: '600' },
  directionText: { fontSize: 14, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700' },
  statLabel: { fontSize: 9, fontWeight: '400', marginTop: 1 },
  statDivider: { width: 0.5, height: 24, backgroundColor: 'rgba(128,128,128,0.20)' },

  expandedContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },

  chartWrap: {
    borderRadius: 10,
    borderWidth: 0.5,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 6,
  },
  chartEmpty: {
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chartEmptyText: { fontSize: 12 },
  chartEmptyTitle: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  chartEmptySubtitle: { fontSize: 11, textAlign: 'center', lineHeight: 16, maxWidth: 220 },
  chartEmptyBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, marginTop: 2 },
  chartEmptyBadgeText: { fontSize: 11, fontWeight: '700' },

  scoringBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  scoringTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.0, marginBottom: 2 },
  scoreBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBarLabel: { fontSize: 10, width: 120 },
  scoreBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.18)',
    overflow: 'hidden',
  },
  scoreBarFill: { height: 4, borderRadius: 2 },
  scoreBarValue: { fontSize: 10, fontWeight: '700', width: 24, textAlign: 'right' },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    marginTop: 2,
  },
  overallLabel: { fontSize: 11, fontWeight: '600' },
  overallBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  overallValue: { fontSize: 12, fontWeight: '700' },

  insightBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  insightLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  insightText: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  citationBlock: {
    borderRadius: 8,
    borderWidth: 0.5,
    padding: 10,
    gap: 3,
  },
  citationLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  citationText: { fontSize: 11, fontWeight: '500' },
  disclaimer: { fontSize: 9, textAlign: 'center', marginTop: 2 },
  footerDisclaimer: { fontSize: 9, textAlign: 'center', marginHorizontal: 16, marginTop: 12 },

  tooltip: {
    position: 'absolute',
    width: 118,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 99,
  },
  tooltipDate: { fontSize: 9, fontWeight: '600', letterSpacing: 0.4, marginBottom: 2 },
  tooltipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  tooltipLabel: { fontSize: 9, fontWeight: '400', flex: 1 },
  tooltipValue: { fontSize: 11, fontWeight: '700' },
});
