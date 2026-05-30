/**
 * MealIQTrendCard
 * Dashboard card showing average Meal IQ impact score per day over the last 7 days.
 * Uses the same SVG LineChart pattern as other trend cards in VitalSync.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable, LayoutAnimation } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle} from 'react-native-svg';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCurvePath(points: { x: number; y: number }[], w: number, h: number, pad: number): string {
  if (points.length < 2) return '';
  const xs = points.map((p) => pad + p.x * (w - pad * 2));
  const ys = points.map((p) => h - pad - p.y * (h - pad * 2));
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < points.length; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cpx} ${ys[i - 1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  return d;
}

function buildAreaPath(points: { x: number; y: number }[], w: number, h: number, pad: number): string {
  if (points.length < 2) return '';
  const linePath = buildCurvePath(points, w, h, pad);
  const lastX = pad + points[points.length - 1].x * (w - pad * 2);
  const firstX = pad + points[0].x * (w - pad * 2);
  return `${linePath} L ${lastX} ${h - pad} L ${firstX} ${h - pad} Z`;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Component ────────────────────────────────────────────────────────────────

interface MealIQTrendCardProps {
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
}

export function MealIQTrendCard({ defaultExpanded = false, overrideExpanded }: MealIQTrendCardProps = {}) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const { state } = useHealth();
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = overrideExpanded === false ? false : localExpanded;

  // Persist expanded state
  const EXPANDED_KEY = '@vitalsync/meal_iq_trend_expanded';
  React.useEffect(() => {
    AsyncStorage.getItem(EXPANDED_KEY).then((v) => {
      if (v !== null) setLocalExpanded(v === 'true');
    });
  }, []);

  function handleToggle() {
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
      create: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setLocalExpanded((v) => {
      const next = !v;
      safeSetItem(EXPANDED_KEY, String(next));
      return next;
    });
  }

  const CHART_W = screenWidth - 64; // card padding 16 each side + inner padding
  const CHART_H = 110;
  const PAD = 12;

  // Build 7-day buckets (today = index 6, 6 days ago = index 0)
  const { buckets, hasData, avgScore, trend, lastAnalysisTs } = useMemo(() => {
    const analyses = state.data?.mealIQAnalyses ?? [];
    const now = new Date();
    const days: { date: Date; scores: number[] }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ date: d, scores: [] });
    }

    analyses.forEach((a) => {
      const t = new Date(a.analyzedAt);
      t.setHours(0, 0, 0, 0);
      const idx = days.findIndex((d) => d.date.getTime() === t.getTime());
      if (idx !== -1 && a.impactScore != null) {
        days[idx].scores.push(a.impactScore);
      }
    });

    const buckets = days.map((d) => ({
      label: DAY_LABELS[d.date.getDay()],
      avg: d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) : null,
      count: d.scores.length,
    }));

    const filled = buckets.filter((b) => b.avg != null);
    const hasData = filled.length > 0;
    const avgScore = hasData ? Math.round(filled.reduce((s, b) => s + (b.avg ?? 0), 0) / filled.length) : 0;

    // Trend: compare last 3 days vs previous 3 days
    const recent = filled.slice(-3).map((b) => b.avg ?? 0);
    const older = filled.slice(0, -3).map((b) => b.avg ?? 0);
    const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : null;
    const trend = recentAvg != null && olderAvg != null
      ? recentAvg < olderAvg - 3 ? 'improving' : recentAvg > olderAvg + 3 ? 'worsening' : 'stable'
      : 'stable';

    // Last analysis timestamp
    const sortedTs = [...analyses].sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());
    const lastAnalysisTs = sortedTs.length > 0 ? new Date(sortedTs[0].analyzedAt) : null;
    return { buckets, hasData, avgScore, trend, lastAnalysisTs };
  }, [state.data?.mealIQAnalyses]);

  // Normalize for chart
  const chartPoints = useMemo(() => {
    const filled = buckets.map((b, i) => ({ i, avg: b.avg })).filter((b) => b.avg != null);
    if (filled.length < 2) return [];
    const maxScore = Math.max(...filled.map((b) => b.avg!), 1);
    return filled.map((b) => ({
      x: b.i / 6,
      y: (b.avg! / Math.max(maxScore, 100)),
    }));
  }, [buckets]);

  const linePath = buildCurvePath(chartPoints, CHART_W, CHART_H, PAD);
  const areaPath = buildAreaPath(chartPoints, CHART_W, CHART_H, PAD);

  const trendColor = trend === 'improving' ? '#10B981' : trend === 'worsening' ? '#EF4444' : '#F59E0B';
  const trendLabel = trend === 'improving' ? '↓ Improving' : trend === 'worsening' ? '↑ Worsening' : '→ Stable';

  function formatLastAnalysis(ts: Date | null): string {
    if (!ts) return '';
    const diffMs = Date.now() - ts.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  }
  const trendDesc = trend === 'improving'
    ? 'Meal impact scores are trending down — your dietary choices are improving.'
    : trend === 'worsening'
    ? 'Meal impact scores are trending up — consider reviewing high-impact meals.'
    : 'Meal impact scores are stable this week.';

  const s = styles(colors);

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <Pressable style={s.header} onPress={handleToggle}>
        <View style={s.headerLeft}>
          <Text style={s.emoji}>🧠</Text>
          <View>
            <Text style={[s.title, { color: colors.foreground }]}>Meal IQ Trend</Text>
            <Text style={[s.sub, { color: colors.muted }]}>7-day average impact score</Text>
          </View>
        </View>
        {hasData && (
          <View style={s.headerRight}>
            {lastAnalysisTs && (
              <Text style={[s.lastAnalysisText, { color: colors.muted }]}>
                Last: {formatLastAnalysis(lastAnalysisTs)}
              </Text>
            )}
            {/* Avg score chip */}
            <View style={[s.scoreChip, { backgroundColor: trendColor + '18', borderColor: trendColor + '40' }]}>
              <Text style={[s.scoreChipNum, { color: trendColor }]}>{avgScore}</Text>
              <Text style={[s.scoreChipUnit, { color: colors.muted }]}>avg</Text>
            </View>
            <View style={[s.trendBadge, { backgroundColor: trendColor + '18', borderColor: trendColor + '40' }]}>
              <Text style={[s.trendText, { color: trendColor }]}>{trendLabel}</Text>
            </View>
          </View>
        )}
        <IconSymbol
          name="chevron.right"
          size={14}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {expanded && (
        !hasData ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: colors.muted }]}>
              No Meal IQ analyses yet. Tap 🧠 on a meal entry in your Sodium Log to generate your first analysis.
            </Text>
          </View>
        ) : (
          <>
          {/* Chart */}
          <View style={s.chartWrap}>
            <Svg width={CHART_W} height={CHART_H}>
              <Defs>
                <LinearGradient id="miqGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
                  <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
                </LinearGradient>
              </Defs>
              {/* Baseline */}
              <Line x1={PAD} y1={CHART_H - PAD} x2={CHART_W - PAD} y2={CHART_H - PAD} stroke={colors.border} strokeWidth={0.5} />
              {/* Area fill */}
              {areaPath ? <Path d={areaPath} fill="url(#miqGrad)" /> : null}
              {/* Line */}
              {linePath ? <Path d={linePath} stroke="#8B5CF6" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
              {/* Dots for data points */}
              {chartPoints.map((p, i) => {
                const cx = PAD + p.x * (CHART_W - PAD * 2);
                const cy = CHART_H - PAD - p.y * (CHART_H - PAD * 2);
                return (
                  <Circle key={i} cx={cx} cy={cy} r={4} fill="#8B5CF6" stroke={colors.surface} strokeWidth={1.5} />
                );
              })}
            </Svg>
          </View>

          {/* Day labels */}
          <View style={s.dayRow}>
            {buckets.map((b, i) => (
              <View key={i} style={s.dayCell}>
                <Text style={[s.dayLabel, { color: colors.muted }]}>{b.label}</Text>
                {b.avg != null ? (
                  <Text style={[s.dayScore, { color: b.avg >= 60 ? '#EF4444' : b.avg >= 30 ? '#F59E0B' : '#10B981' }]}>
                    {b.avg}
                  </Text>
                ) : (
                  <Text style={[s.dayScore, { color: colors.border }]}>—</Text>
                )}
              </View>
            ))}
          </View>

          {/* Summary row */}
          <View style={[s.summaryRow, { borderTopColor: colors.border }]}>
            <View style={s.summaryItem}>
              <Text style={[s.summaryValue, { color: colors.foreground }]}>{avgScore}</Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Avg Score</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={[s.summaryItem, { flex: 2 }]}>
              <Text style={[s.summaryDesc, { color: colors.muted }]}>{trendDesc}</Text>
            </View>
          </View>
          </>
        )
      )}
    
    </View>
  );
}

const styles = (_colors: ReturnType<typeof useColors>) => StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 0.5, overflow: 'hidden', marginBottom: 12, marginHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 22 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastAnalysisText: { fontSize: 10, fontWeight: '500' as const },
  trendBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  trendText: { fontSize: 12, fontWeight: '700' },
  scoreChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center' },
  scoreChipNum: { fontSize: 14, fontWeight: '800' },
  scoreChipUnit: { fontSize: 7 },
  chartWrap: { paddingHorizontal: 16 },
  dayRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  dayCell: { flex: 1, alignItems: 'center', gap: 2 },
  dayLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  dayScore: { fontSize: 12, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, marginTop: 4, paddingVertical: 12, paddingHorizontal: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, marginTop: 1 },
  summaryDivider: { width: 0.5, height: 32, marginHorizontal: 12 },
  summaryDesc: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  empty: { padding: 16, paddingTop: 4, paddingBottom: 20 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
