/**
 * ReadinessHistoryChart
 *
 * A full SVG line chart showing the Daily Readiness Score over 7 or 30 days.
 *
 * Design: Apple Health Pro aesthetic
 * - Deep obsidian card background with glassmorphism border
 * - Gradient fill under the line (emerald → transparent)
 * - Reference zone bands: Poor (0-40 red), Fair (40-65 amber), Good (65-85 blue), Optimal (85-100 emerald)
 * - Rolling 7-day average overlay (dashed white line)
 * - 7d / 30d segment toggle
 * - Day labels on X axis, score labels on Y axis
 * - Tap a data point to see exact score tooltip
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Svg, {
  Path,
  Circle,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  loadReadinessHistory,
  buildReadinessTrendPoints,
  computeRollingAverage,
  getReadinessTrend,
  type ReadinessSnapshot,
} from '@/lib/health/readiness-history';
import { GlassCard } from '@/components/glass-card';
import { useCorrelationStrings } from '@/hooks';

const SCREEN_W = Dimensions.get('window').width;
const CARD_PADDING = 16;
const CHART_W = SCREEN_W - CARD_PADDING * 2 - 32; // 32 = 16px each side margin
const CHART_H = 160;
const PAD_L = 32;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

// Score thresholds
const SCORE_MIN = 0;
const SCORE_MAX = 100;

// Zone colors (semi-transparent)
const ZONE_POOR    = 'rgba(239,68,68,0.06)';
const ZONE_FAIR    = 'rgba(245,158,11,0.06)';
const ZONE_GOOD    = 'rgba(59,130,246,0.06)';
const ZONE_OPTIMAL = 'rgba(16,185,129,0.06)';

function scoreToY(score: number): number {
  return PAD_T + (1 - (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * PLOT_H;
}

function indexToX(idx: number, total: number): number {
  if (total <= 1) return PAD_L + PLOT_W / 2;
  return PAD_L + (idx / (total - 1)) * PLOT_W;
}

function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX} ${prev.y} ${cpX} ${curr.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildFillPath(points: { x: number; y: number }[], _chartH: number): string {
  if (points.length < 2) return '';
  const linePath = buildLinePath(points);
  const lastX = points[points.length - 1].x;
  const firstX = points[0].x;
  const bottom = PAD_T + PLOT_H;
  return `${linePath} L ${lastX} ${bottom} L ${firstX} ${bottom} Z`;
}

function getScoreColor(score: number): string {
  if (score >= 85) return '#10B981';
  if (score >= 65) return '#3B82F6';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function getTrendLabel(
  trend: 'improving' | 'declining' | 'stable',
  cs: ReturnType<typeof useCorrelationStrings>
): { text: string; color: string } {
  switch (trend) {
    case 'improving': return { text: cs.trendImproving, color: '#10B981' };
    case 'declining': return { text: cs.trendDeclining, color: '#EF4444' };
    case 'stable':    return { text: cs.trendStable,    color: '#F59E0B' };
  }
}

type Period = '7d' | '30d';

export function ReadinessHistoryChart() {
  const cs = useCorrelationStrings();
  const [period, setPeriod] = useState<Period>('7d');
  const [history, setHistory] = useState<(ReadinessSnapshot | null)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const days = period === '7d' ? 7 : 30;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadReadinessHistory(days).then((h) => {
      if (!cancelled) {
        setHistory(h);
        setIsLoading(false);
        setSelectedIdx(null);
      }
    });
    return () => { cancelled = true; };
  }, [days]);

  const trendPoints = useMemo(() => buildReadinessTrendPoints(history), [history]);
  const rollingAvg = useMemo(() => computeRollingAverage(history, 7), [history]);
  const trend = useMemo(() => getReadinessTrend(history, 7), [history]);
  const trendLabel = getTrendLabel(trend, cs);

  const hasData = trendPoints.length > 0;

  // Build SVG points for the main line
  const linePoints = useMemo(() =>
    trendPoints.map((p) => ({
      x: indexToX(p.index, days),
      y: scoreToY(p.score),
      score: p.score,
      date: p.date,
      index: p.index,
    })),
    [trendPoints, days]
  );

  // Build rolling average line points (only where data exists)
  const avgLinePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    rollingAvg.forEach((avg, idx) => {
      if (avg !== null) {
        pts.push({ x: indexToX(idx, days), y: scoreToY(avg) });
      }
    });
    return pts;
  }, [rollingAvg, days]);

  // X-axis labels: show every N days
  const xLabels = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    const step = days === 7 ? 1 : 5;
    const now = new Date();
    for (let i = 0; i < days; i += step) {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const label = days === 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      labels.push({ x: indexToX(i, days), label });
    }
    return labels;
  }, [days]);

  // Y-axis labels
  const yLabels = [0, 40, 65, 85, 100];

  const selectedPoint = selectedIdx !== null
    ? linePoints.find((p) => p.index === selectedIdx) ?? null
    : null;

  const handlePointPress = useCallback((idx: number) => {
    setSelectedIdx((prev) => prev === idx ? null : idx);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Latest score for the header
  const latestScore = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1].score : null;
  const latestColor = latestScore !== null ? getScoreColor(latestScore) : '#FFFFFF';

  return (
    <GlassCard accentColor="#10B981" noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {/* Title removed — shown by SectionLabel in the parent analytics screen */}
          {latestScore !== null && (
            <View style={styles.latestRow}>
              <Text style={[styles.latestScore, { color: latestColor }]}>{latestScore}</Text>
              <Text style={styles.latestLabel}> today</Text>
              <View style={[styles.trendBadge, { backgroundColor: latestColor + '22' }]}>
                <Text style={[styles.trendBadgeText, { color: latestColor }]}>{trendLabel.text}</Text>
              </View>
            </View>
          )}
        </View>
        {/* Period toggle */}
        <View style={styles.toggle}>
          {(['7d', '30d'] as Period[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.toggleBtn, period === p && styles.toggleBtnActive]}
              onPress={() => {
                setPeriod(p);
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
            >
              <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Chart */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
        </View>
      ) : !hasData ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{cs.readinessNoData}</Text>
          <Text style={styles.emptySubtext}>{cs.readinessNoDataSub}</Text>
        </View>
      ) : (
        <Svg width={CHART_W} height={CHART_H} style={styles.svg}>
          <Defs>
            <LinearGradient id="readinessFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
              <Stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Zone bands */}
          <Rect x={PAD_L} y={scoreToY(100)} width={PLOT_W} height={scoreToY(85) - scoreToY(100)} fill={ZONE_OPTIMAL} />
          <Rect x={PAD_L} y={scoreToY(85)} width={PLOT_W} height={scoreToY(65) - scoreToY(85)} fill={ZONE_GOOD} />
          <Rect x={PAD_L} y={scoreToY(65)} width={PLOT_W} height={scoreToY(40) - scoreToY(65)} fill={ZONE_FAIR} />
          <Rect x={PAD_L} y={scoreToY(40)} width={PLOT_W} height={scoreToY(0) - scoreToY(40)} fill={ZONE_POOR} />

          {/* Y-axis grid lines + labels */}
          {yLabels.map((score) => (
            <React.Fragment key={score}>
              <Line
                x1={PAD_L} y1={scoreToY(score)}
                x2={PAD_L + PLOT_W} y2={scoreToY(score)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <SvgText
                x={PAD_L - 4}
                y={scoreToY(score) + 4}
                textAnchor="end"
                fontSize={9}
                fill="rgba(255,255,255,0.25)"
                fontWeight="600"
              >
                {score}
              </SvgText>
            </React.Fragment>
          ))}

          {/* X-axis labels */}
          {xLabels.map(({ x, label }) => (
            <SvgText
              key={label + x}
              x={x}
              y={CHART_H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="rgba(255,255,255,0.3)"
              fontWeight="500"
            >
              {label}
            </SvgText>
          ))}

          {/* Fill area under line */}
          {linePoints.length >= 2 && (
            <Path
              d={buildFillPath(linePoints, CHART_H)}
              fill="url(#readinessFill)"
            />
          )}

          {/* Main score line */}
          {linePoints.length >= 2 && (
            <Path
              d={buildLinePath(linePoints)}
              stroke="#10B981"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Rolling average dashed line */}
          {avgLinePoints.length >= 2 && (
            <Path
              d={buildLinePath(avgLinePoints)}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          )}

          {/* Data point dots */}
          {linePoints.map((pt) => {
            const isSelected = selectedIdx === pt.index;
            const dotColor = getScoreColor(pt.score);
            return (
              <React.Fragment key={pt.index}>
                {isSelected && (
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={10}
                    fill={dotColor}
                    opacity={0.15}
                  />
                )}
                <Circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? 5 : 3.5}
                  fill={dotColor}
                  stroke="rgba(10,11,15,0.8)"
                  strokeWidth={1.5}
                  onPress={() => handlePointPress(pt.index)}
                />
              </React.Fragment>
            );
          })}

          {/* Tooltip for selected point */}
          {selectedPoint && (() => {
            const tipW = 52;
            const tipH = 28;
            const tipX = Math.min(
              Math.max(selectedPoint.x - tipW / 2, PAD_L),
              PAD_L + PLOT_W - tipW
            );
            const tipY = selectedPoint.y - tipH - 8;
            const scoreColor = getScoreColor(selectedPoint.score);
            const dateLabel = safeFormatDate(selectedPoint.date + 'T12:00:00', 'en-US', { month: 'short', day: 'numeric' });
            return (
              <React.Fragment>
                <Rect x={tipX} y={tipY} width={tipW} height={tipH} rx={8} fill="rgba(20,22,30,0.95)" stroke={scoreColor + '55'} strokeWidth={1} />
                <SvgText x={tipX + tipW / 2} y={tipY + 11} textAnchor="middle" fontSize={14} fontWeight="800" fill={scoreColor}>{selectedPoint.score}</SvgText>
                <SvgText x={tipX + tipW / 2} y={tipY + 23} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)">{dateLabel}</SvgText>
              </React.Fragment>
            );
          })()}
        </Svg>
      )}

      {/* Legend */}
      {hasData && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendText}>Score</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDash, { borderColor: 'rgba(255,255,255,0.3)' }]} />
            <Text style={styles.legendText}>7-day avg</Text>
          </View>
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)',
  },
  latestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  latestScore: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  latestLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 2,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  svg: {
    alignSelf: 'center',
  },
  loadingWrap: {
    height: CHART_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    height: CHART_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  emptySubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    paddingLeft: PAD_L,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendDash: {
    width: 16,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.3)',
  },
});
