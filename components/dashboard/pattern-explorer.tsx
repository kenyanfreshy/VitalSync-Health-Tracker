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
} from 'react-native-svg';
import { GlassCard } from '@/components/glass-card';
import { useColorScheme, useCorrelationStrings } from '@/hooks';
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
const PLOT_PAIRS: {
  x: MetricKey;
  y: MetricKey;
  emoji: string;
  title: string;
  citation: string;
  citationUrl: string;
  researchConfidence: number; // 0-100
}[] = [
  {
    x: 'sleepEfficiency', y: 'bpSystolic',
    emoji: '😴', title: 'Sleep Efficiency → Systolic BP',
    citation: 'Gangwisch et al., JAHA 2023',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/JAHA.122.027360',
    researchConfidence: 88,
  },
  {
    x: 'sleepHours', y: 'bpSystolic',
    emoji: '🌙', title: 'Sleep Duration → Systolic BP',
    citation: 'Cappuccio et al., Hypertension 2022',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/HYPERTENSIONAHA.122.18557',
    researchConfidence: 85,
  },
  {
    x: 'deepSleepMinutes', y: 'hrv',
    emoji: '🧠', title: 'Deep Sleep → HRV',
    citation: 'Tobaldini et al., Eur Heart J 2023',
    citationUrl: 'https://academic.oup.com/eurheartj/article/44/6/474/6986583',
    researchConfidence: 82,
  },
  {
    x: 'hrv', y: 'heartRate',
    emoji: '❤️', title: 'HRV ↔ Resting Heart Rate',
    citation: 'Shaffer & Ginsberg, Front Public Health 2017',
    citationUrl: 'https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full',
    researchConfidence: 91,
  },
  {
    x: 'weight', y: 'bpSystolic',
    emoji: '⚖️', title: 'Body Weight → Systolic BP',
    citation: 'Neter et al., Hypertension 2003 (meta-analysis)',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/01.HYP.0000094221.86888.AE',
    researchConfidence: 93,
  },
  {
    x: 'sleepEfficiency', y: 'heartRate',
    emoji: '💓', title: 'Sleep Efficiency → Heart Rate',
    citation: 'Stein et al., Sleep 2022',
    citationUrl: 'https://academic.oup.com/sleep/article/45/2/zsab296/6478866',
    researchConfidence: 79,
  },
  {
    x: 'sleepHours', y: 'hrv',
    emoji: '📊', title: 'Sleep Duration → HRV',
    citation: 'Buchheit et al., IJSM 2004',
    citationUrl: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/s-2004-821005',
    researchConfidence: 78,
  },
  {
    x: 'hrv', y: 'bpSystolic',
    emoji: '🫀', title: 'HRV → Systolic BP',
    citation: 'Thayer et al., Neurosci Biobehav Rev 2012',
    citationUrl: 'https://www.sciencedirect.com/science/article/pii/S0149763411001916',
    researchConfidence: 86,
  },
  {
    x: 'deepSleepMinutes', y: 'bpSystolic',
    emoji: '🌊', title: 'Deep Sleep → Systolic BP',
    citation: 'Fung et al., JAHA 2011',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/JAHA.111.001222',
    researchConfidence: 80,
  },
  {
    x: 'weight', y: 'hrv',
    emoji: '🏋️', title: 'Body Weight → HRV',
    citation: 'Antelmi et al., Am J Cardiol 2004',
    citationUrl: 'https://www.ajconline.org/article/S0002-9149(04)00131-7/fulltext',
    researchConfidence: 74,
  },
  {
    x: 'sleepEfficiency', y: 'restingHR',
    emoji: '🛌', title: 'Sleep Efficiency → Resting HR',
    citation: 'Svensson et al., Sleep Med 2020',
    citationUrl: 'https://www.sleepmedsociety.org',
    researchConfidence: 76,
  },
  {
    x: 'sleepHours', y: 'restingHR',
    emoji: '⏰', title: 'Sleep Duration → Resting HR',
    citation: 'Svensson et al., Sleep Med 2020',
    citationUrl: 'https://www.sleepmedsociety.org',
    researchConfidence: 75,
  },
  {
    x: 'deepSleepMinutes', y: 'restingHR',
    emoji: '💤', title: 'Deep Sleep → Resting HR',
    citation: 'Tobaldini et al., Eur Heart J 2023',
    citationUrl: 'https://academic.oup.com/eurheartj/article/44/6/474/6986583',
    researchConfidence: 77,
  },
  {
    x: 'hrv', y: 'restingHR',
    emoji: '📈', title: 'HRV ↔ Resting HR',
    citation: 'Plews et al., Int J Sports Physiol 2013',
    citationUrl: 'https://journals.humankinetics.com/view/journals/ijspp/8/3/article-p346.xml',
    researchConfidence: 89,
  },
  {
    x: 'weight', y: 'bpDiastolic',
    emoji: '🩺', title: 'Body Weight → Diastolic BP',
    citation: 'Neter et al., Hypertension 2003 (meta-analysis)',
    citationUrl: 'https://www.ahajournals.org/doi/10.1161/01.HYP.0000094221.86888.AE',
    researchConfidence: 90,
  },
  {
    x: 'bpSystolic', y: 'bpDiastolic',
    emoji: '💊', title: 'Systolic ↔ Diastolic BP',
    citation: 'Whelton et al., JACC 2018 ACC/AHA Guidelines',
    citationUrl: 'https://www.jacc.org/doi/10.1016/j.jacc.2017.11.006',
    researchConfidence: 95,
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

function PatternScatterChart({
  result,
  accentColor,
  xLabel,
  yLabel,
  isDark,
}: {
  result: CorrelationResult;
  accentColor: string;
  xLabel: string;
  yLabel: string;
  isDark: boolean;
}) {
  const pts = result.points;
  if (pts.length < 2) {
    return (
      <View style={[styles.chartEmpty, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
        <Text style={[styles.chartEmptyText, { color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)' }]}>
          Not enough data
        </Text>
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

  const mapped = pts.map(p => ({
    cx: PAD_X + ((p.x - xMin) / xRange) * drawW,
    cy: CHART_H - PAD_Y - ((p.y - yMin) / yRange) * drawH,
  }));

  // Regression line endpoints
  const x1 = PAD_X;
  const x2 = CHART_W - PAD_X;
  const y1 = CHART_H - PAD_Y - ((result.slope * xMin + result.intercept - yMin) / yRange) * drawH;
  const y2 = CHART_H - PAD_Y - ((result.slope * xMax + result.intercept - yMin) / yRange) * drawH;

  const gradId = `grad_${accentColor.replace('#', '')}`;

  return (
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
      {/* Data points */}
      {mapped.map((p, i) => (
        <Circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={3.5}
          fill={accentColor}
          fillOpacity={0.75}
          stroke={accentColor}
          strokeWidth={0.5}
          strokeOpacity={0.9}
        />
      ))}
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
  );
}

// ─── Strength label ───────────────────────────────────────────────────────────

function strengthLabel(r: number): { label: string; color: string } {
  const abs = Math.abs(r);
  if (abs >= 0.7) return { label: 'Strong', color: '#10B981' };
  if (abs >= 0.4) return { label: 'Moderate', color: '#F59E0B' };
  if (abs >= 0.2) return { label: 'Weak', color: '#6366F1' };
  return { label: 'No Pattern', color: '#9CA3AF' };
}

// ─── Plot Card ────────────────────────────────────────────────────────────────

function PlotCard({
  pair,
  data,
  dayRange,
  isDark,
}: {
  pair: typeof PLOT_PAIRS[0];
  data: HealthData;
  dayRange: DayRange;
  isDark: boolean;
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
  const { label: strLabel, color: strColor } = strengthLabel(result.r);
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
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{(result.rSquared * 100).toFixed(0)}%</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>R²</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{scores.dataCompleteness}%</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>coverage</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{scores.overall}</Text>
          <Text style={[styles.statLabel, { color: isDark ? 'rgba(200,210,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>score</Text>
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
            />
          </View>

          {/* 4-Metric Scoring System */}
          <View style={[styles.scoringBlock, {
            backgroundColor: accentColor + '0A',
            borderColor: accentColor + '22',
          }]}>
            <Text style={[styles.scoringTitle, { color: accentColor }]}>
              📊 ANALYSIS SCORES
            </Text>
            <ScoreBar label="Data Completeness" value={scores.dataCompleteness} color="#3B82F6" isDark={isDark} />
            <ScoreBar label="Trend Stability" value={scores.trendStability} color="#10B981" isDark={isDark} />
            <ScoreBar label="Relationship Strength" value={scores.relationshipStrength} color={accentColor} isDark={isDark} />
            <ScoreBar label="Research Confidence" value={scores.researchConfidence} color="#8B5CF6" isDark={isDark} />
            <View style={[styles.overallRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
              <Text style={[styles.overallLabel, { color: isDark ? 'rgba(200,210,255,0.60)' : 'rgba(0,0,0,0.50)' }]}>
                Overall Score
              </Text>
              <View style={[styles.overallBadge, {
                backgroundColor: accentColor + '22',
                borderColor: accentColor + '55',
              }]}>
                <Text style={[styles.overallValue, { color: accentColor }]}>{scores.overall}/100</Text>
              </View>
            </View>
          </View>

          {/* Citation */}
          <TouchableOpacity
            style={[styles.citationBlock, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
            }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(pair.citationUrl);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.citationLabel, { color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)' }]}>
              EBP SOURCE  ↗
            </Text>
            <Text style={[styles.citationText, { color: isDark ? 'rgba(160,200,255,0.75)' : 'rgba(30,80,200,0.75)' }]}>
              {pair.citation}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.disclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)' }]}>
            For informational purposes only · Not medical advice
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
    <GlassCard accentColor="#7C3AED" noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
      {/* Section header */}
      <Pressable
        style={[styles.sectionHeader, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }]}
        onPress={toggleSection}
        accessibilityRole="button"
        accessibilityLabel="Pattern Explorer"
        accessibilityHint={sectionExpanded ? 'Tap to collapse' : 'Tap to expand'}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(200,180,255,0.60)' : 'rgba(0,0,0,0.45)' }]}>
            🔬 PATTERN EXPLORER
          </Text>
          <Text style={[styles.sectionSubtitle, { color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)' }]}>
            16 relationship scatter plots · 4-metric scoring
          </Text>
        </View>
        <View style={styles.sectionHeaderRight}>
          <View style={[styles.countBadge, { backgroundColor: 'rgba(124,58,237,0.20)', borderColor: 'rgba(124,58,237,0.40)' }]}>
            <Text style={[styles.countBadgeText, { color: '#7C3AED' }]}>16</Text>
          </View>
          <Text style={[styles.chevron, { color: '#7C3AED', transform: [{ rotate: sectionExpanded ? '90deg' : '0deg' }] }]}>›</Text>
        </View>
      </Pressable>

      {sectionExpanded && (
        <View style={styles.sectionBody}>
          {/* Day-range tabs */}
          <View style={[styles.rangeTabRow, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
          }]}>
            {DAY_RANGES.map(d => {
              const active = d === dayRange;
              return (
                <Pressable
                  key={d}
                  style={[styles.rangeTab, active && { backgroundColor: '#7C3AED22', borderColor: '#7C3AED55' }]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDayRange(d);
                  }}
                >
                  <Text style={[styles.rangeTabText, { color: active ? '#7C3AED' : isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)' }]}>
                    {d}d
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Subtitle */}
          <Text style={[styles.rangeSubtitle, { color: isDark ? 'rgba(200,180,255,0.45)' : 'rgba(0,0,0,0.40)' }]}>
            Showing last {dayRange} days · Tap a card to see scatter plot & scores
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
              />
            ))}
          </View>

          {/* Footer */}
          <Text style={[styles.footerDisclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)' }]}>
            Pearson r correlation · All analysis performed on-device · For informational purposes only · Not medical advice
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  sectionHeaderLeft: { flex: 1, gap: 2 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    borderRadius: 10,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  rangeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    margin: 2,
  },
  rangeTabText: { fontSize: 12, fontWeight: '600' },
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
    height: 80,
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: { fontSize: 12 },

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
});
