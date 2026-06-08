/**
 * OnDeviceInsightsCard
 *
 * Collapsible GlassCard with three tabs:
 *   🧠 Insights  — evidence-based rules fired on the user's health data
 *   📈 Trends    — 7-day sparkline for the vital that triggered the top insight
 *   🏆 Small Wins — step goal + sleep achievement
 *
 * All computation is on-device; no network calls.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  Platform,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { GlassCard } from '@/components/glass-card';
import { SparklineChart } from '@/components/dashboard/sparkline-chart';
import { useColorScheme, useDashboardStrings } from '@/hooks';
import { runInsightEngine, severityColor, type InsightItem } from '@/lib/health/on-device-insight-engine';
import type { HealthData } from '@/lib/health/types';
import { useUpsell } from '@/hooks/use-upsell';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface WeightGoalBanner {
  achieved: boolean;
  diff: string;
  current: string;
  goal: string;
  unitLabel: string;
}

interface Props {
  data: HealthData;
  /** Maximum number of insights to show. Default: 5 */
  maxItems?: number;
  /** Today's step count (from pedometer / HealthKit) */
  todaySteps?: number | null;
  /** User's daily step goal */
  stepGoal?: number;
  /** Weight goal banner data — rendered as a tappable win row in the Wins tab */
  weightGoalBanner?: WeightGoalBanner | null;
  /** Called when the user taps the weight goal win row */
  onWeightGoalPress?: () => void;
  /** When false, forces the card collapsed (Collapse All). When true, forces it expanded. */
  overrideExpanded?: boolean;
}

// ─── Helpers to extract 7-day sparkline data per metric ──────────────────────

type MetricKey = NonNullable<InsightItem['metric']>;

function getSparklineData(data: HealthData, metric: MetricKey): { values: number[]; label: string; unit: string } {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  switch (metric) {
    case 'systolic': {
      const recs = [...(data?.bloodPressure ?? []), ...(data?.vitalSigns ?? [])]
        .filter(r => {
          const ts = new Date('timestamp' in r ? r.timestamp : '').getTime();
          const val = 'systolic' in r ? r.systolic : undefined;
          return ts >= sevenDaysAgo && typeof val === 'number' && val > 0;
        })
        .sort((a, b) => new Date((a as any).timestamp).getTime() - new Date((b as any).timestamp).getTime());
      const values = recs.map(r => ('systolic' in r ? r.systolic : 0) as number).filter(Boolean);
      return { values, label: 'Systolic BP', unit: 'mmHg' };
    }
    case 'bpm': {
      const recs = (data?.vitalSigns ?? [])
        .filter(r => {
          const ts = new Date(r.timestamp).getTime();
          return ts >= sevenDaysAgo && typeof r.heartRate === 'number' && r.heartRate > 0;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { values: recs.map(r => r.heartRate!), label: 'Heart Rate', unit: 'bpm' };
    }
    case 'spo2': {
      const recs = (data?.vitalSigns ?? [])
        .filter(r => {
          const ts = new Date(r.timestamp).getTime();
          const val = r.spo2 ?? (r as any).oxygenSaturation;
          return ts >= sevenDaysAgo && typeof val === 'number' && val > 0;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { values: recs.map(r => r.spo2 ?? (r as any).oxygenSaturation ?? 0), label: 'SpO₂', unit: '%' };
    }
    case 'sleepHrs': {
      const recs = (data?.sleep ?? [])
        .filter(r => {
          const ts = new Date(r.date ?? '').getTime();
          return ts >= sevenDaysAgo && typeof r.totalMinutes === 'number' && r.totalMinutes > 0;
        })
        .sort((a, b) => new Date(a.date ?? '').getTime() - new Date(b.date ?? '').getTime());
      return { values: recs.map(r => Math.round((r.totalMinutes / 60) * 10) / 10), label: 'Sleep', unit: 'hrs' };
    }
    case 'hrv': {
      const recs = (data?.vitalSigns ?? [])
        .filter(r => {
          const ts = new Date(r.timestamp).getTime();
          return ts >= sevenDaysAgo && typeof r.hrv === 'number' && r.hrv > 0;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { values: recs.map(r => r.hrv!), label: 'HRV', unit: 'ms' };
    }
    case 'weight': {
      const recs = (data?.weight ?? [])
        .filter(r => {
          const ts = new Date(r.timestamp).getTime();
          return ts >= sevenDaysAgo && typeof r.weightKg === 'number' && r.weightKg > 0;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { values: recs.map(r => Math.round(r.weightKg * 10) / 10), label: 'Weight', unit: 'kg' };
    }
    case 'glucose': {
      const recs = (data?.bloodSugar ?? [])
        .filter((r: any) => {
          const ts = new Date(r.timestamp ?? r.date ?? '').getTime();
          return ts >= sevenDaysAgo && typeof r.value === 'number' && r.value > 0;
        })
        .sort((a: any, b: any) =>
          new Date(a.timestamp ?? a.date ?? '').getTime() - new Date(b.timestamp ?? b.date ?? '').getTime(),
        );
      return { values: (recs as any[]).map((r: any) => r.value), label: 'Glucose', unit: 'mg/dL' };
    }
    case 'steps': {
      // steps is a single number in HealthData, so we can't build a 7-day series from it directly
      return { values: [], label: 'Steps', unit: 'steps' };
    }
    default:
      return { values: [], label: '', unit: '' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OnDeviceInsightsCard({ data, maxItems = 5, todaySteps = null, stepGoal = 10000, weightGoalBanner, onWeightGoalPress, overrideExpanded }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const { checkAndShow: checkUpsell } = useUpsell();
  const [localExpanded, setLocalExpanded] = useState(false);
  // overrideExpanded=false forces collapsed; overrideExpanded=true forces expanded
  const prevOverrideRef = React.useRef<boolean | undefined>(overrideExpanded);
  React.useEffect(() => {
    if (overrideExpanded === prevOverrideRef.current) return;
    prevOverrideRef.current = overrideExpanded;
    if (overrideExpanded === false) setLocalExpanded(false);
    else if (overrideExpanded === true) setLocalExpanded(true);
  }, [overrideExpanded]);
  const expanded = localExpanded;
  const setExpanded = setLocalExpanded;
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'trends' | 'wins'>('insights');

  const items: InsightItem[] = useMemo(
    () => runInsightEngine(data, maxItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  // Determine the primary metric from the top insight
  const primaryMetric: MetricKey | null = useMemo(() => {
    const first = items.find(i => i.metric);
    return first?.metric ?? null;
  }, [items]);

  // Build sparkline data for the primary metric
  const sparkline = useMemo(() => {
    if (!primaryMetric) return null;
    return getSparklineData(data, primaryMetric);
  }, [data, primaryMetric]);

  // Build Small Wins list
  const wins: { icon: string; text: string; color: string }[] = useMemo(() => {
    const list: { icon: string; text: string; color: string }[] = [];
    if (todaySteps !== null) {
      const pct = Math.min(100, Math.round((todaySteps / stepGoal) * 100));
      list.push({
        icon: '🏃',
        text: `Step goal · ${pct}% (${todaySteps.toLocaleString()}/${stepGoal.toLocaleString()})`,
        color: pct >= 100 ? '#10B981' : '#6366F1',
      });
    }
    const recs = data?.sleep ?? [];
    if (recs.length) {
      const last = [...recs].sort((a: any, b: any) =>
        new Date(b.startTime ?? b.timestamp ?? b.date ?? 0).getTime() -
        new Date(a.startTime ?? a.timestamp ?? a.date ?? 0).getTime(),
      )[0];
      const hrs = last?.totalMinutes ? Math.round((last.totalMinutes / 60) * 10) / 10 : null;
      if (hrs !== null) {
        const ok = hrs >= 7;
        list.push({
          icon: '🌙',
          text: `Last sleep · ${hrs} hrs${ok ? ' ✓' : ' (below 7h goal)'}`,
          color: ok ? '#10B981' : '#F59E0B',
        });
      }
    }
    return list;
  }, [data, todaySteps, stepGoal]);

  const hasInsights = items.length > 0;
  const hasWins = wins.length > 0 || !!weightGoalBanner;
  const hasTrends = sparkline !== null && sparkline.values.length >= 2;

  // Hooks must be called unconditionally — before any early return
  const ds = useDashboardStrings();

  if (!hasInsights && !hasWins) return null;

  // Collect unique citations across all visible items
  const allCitations = items
    .flatMap(i => i.evidence)
    .filter((c, idx, arr) => arr.findIndex(x => x.id === c.id) === idx);

  const dividerColor = isDark ? '#1E293B' : '#E2E8F0';
  const mutedColor = isDark ? '#64748B' : '#94A3B8';
  const textColor = isDark ? '#E2E8F0' : '#1E293B';
  const tabActiveBg = isDark ? '#1E293B' : '#F1F5F9';

  // Determine which tabs to show
  const tabs: { key: 'insights' | 'trends' | 'wins'; label: string }[] = [];
  if (hasInsights) tabs.push({ key: 'insights', label: `🧠 ${ds.insights}` });
  if (hasTrends) tabs.push({ key: 'trends', label: `📈 ${ds.trends ?? 'Trends'}` });
  if (hasWins) tabs.push({ key: 'wins', label: `🏆 ${ds.wins}` });

  const sparklineWidth = SCREEN_WIDTH - 80;

  return (
    <GlassCard accentColor="#6366F1" style={styles.card}>
      {/* ── Header (always visible, tap to expand) ── */}
      <TouchableOpacity
        onPress={() => {
          const nextExpanded = !expanded;
          setExpanded(e => !e);
          // Contextual upsell: fire when user opens the insights panel (free users only)
          if (nextExpanded) {
            setTimeout(() => { checkUpsell('insights_tap').catch(() => {}); }, 600);
          }
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={expanded
          ? 'Collapse Personal Health Insights'
          : 'Expand Personal Health Insights'
        }
        style={styles.header}
      >
        <View style={[styles.iconWrap, { backgroundColor: '#6366F120', borderWidth: 1, borderColor: '#6366F155' }]}>
          <Text style={styles.headerIcon}>🧠</Text>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
          <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
            {ds.personalHealthInsights ?? ds.appleIntelligenceInsights ?? 'Personal Health Insights'}
          </Text>

        </View>
        <View style={styles.badgeRow}>
          <View style={styles.evidenceBadge}>
            <Text style={styles.evidenceBadgeText}>Evidence-Based</Text>
          </View>
          <Text style={[styles.chevron, { color: mutedColor }]}>
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* ── Collapsed tab row: always visible, tapping a tab expands to that section ── */}
      {!expanded && (
        <View style={[styles.collapsedTabRow, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
          <TouchableOpacity
            style={[styles.collapsedTab, activeTab === 'insights' && { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
            onPress={() => { setActiveTab('insights'); setExpanded(true); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View Insights"
          >
            <Text style={[styles.collapsedTabText, { color: activeTab === 'insights' ? '#6366F1' : (isDark ? '#64748B' : '#94A3B8') }]}>
              🧠 {ds.insights}
            </Text>
          </TouchableOpacity>
          <View style={[styles.collapsedTabDivider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />
          <TouchableOpacity
            style={[styles.collapsedTab, activeTab === 'wins' && { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
            onPress={() => { setActiveTab('wins'); setExpanded(true); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View Wins"
          >
            <Text style={[styles.collapsedTabText, { color: activeTab === 'wins' ? '#F59E0B' : (isDark ? '#64748B' : '#94A3B8') }]}>
              🏆 {ds.wins}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Expanded content ── */}
      {expanded && (
        <View style={{ marginTop: 12 }}>

          {/* ── Tab bar ── */}
          {tabs.length > 1 && (
            <View style={[styles.tabBar, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: dividerColor }]}>
              {tabs.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && { backgroundColor: tabActiveBg }]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.tabText,
                    {
                      color: activeTab === tab.key
                        ? (tab.key === 'wins' ? '#10B981' : tab.key === 'trends' ? '#0EA5E9' : '#6366F1')
                        : mutedColor,
                    },
                  ]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Insights tab ── */}
          {activeTab === 'insights' && hasInsights && (
            <View style={{ marginTop: 8 }}>
              {items.map((item, i) => {
                const dotColor = severityColor(item.severity);
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.insightRow,
                      i < items.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: dividerColor },
                    ]}
                  >
                    <View style={styles.insightContent}>
                      <View style={[styles.dot, { backgroundColor: dotColor }]} />
                      <Text style={[styles.insightText, { color: dotColor }]}>
                        {item.id === 'bp_optimal'
                          ? `${ds.bpInOptimalRange ?? 'BP in optimal range'} · avg ${item.text.match(/(\d+\/\d+)/)?.[1] ?? ''} mmHg — ${ds.bpAHANormal ?? 'AHA Normal: <120/80 mmHg'}`
                          : item.text}
                      </Text>
                    </View>
                    {item.evidence.length > 0 && (
                      <View style={styles.citationRow}>
                        {item.evidence.map(c => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => c.url && Linking.openURL(c.url).catch(() => {})}
                            style={[
                              styles.citationChip,
                              { backgroundColor: c.color + '15', borderColor: c.color + '50' },
                            ]}
                            accessibilityRole="link"
                            accessibilityLabel={`Open ${c.badge}`}
                          >
                            <Text style={[styles.citationText, { color: c.color }]}>{c.badge}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* ── Evidence sources footer ── */}
              <TouchableOpacity
                onPress={() => setSourcesExpanded(e => !e)}
                style={[styles.sourcesToggle, { borderTopColor: dividerColor }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.sourcesLabel, { color: mutedColor }]}>
                  🔬 Evidence Based Sources
                </Text>
                <Text style={[styles.sourcesChevron, { color: mutedColor }]}>
                  {sourcesExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {sourcesExpanded && (
                <View style={styles.sourcesBody}>
                  <Text style={[styles.sourcesDesc, { color: mutedColor }]}>
                    All insights are grounded in peer-reviewed guidelines and meta-analyzes.
                  </Text>
                  <View style={styles.sourcesChips}>
                    {allCitations.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => c.url && Linking.openURL(c.url).catch(() => {})}
                        style={[
                          styles.sourceChip,
                          { backgroundColor: c.color + '15', borderColor: c.color + '60' },
                        ]}
                        accessibilityRole="link"
                        accessibilityLabel={`Open ${c.badge}`}
                      >
                        <Text style={[styles.sourceChipText, { color: c.color }]}>{c.badge} ↗</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.disclaimer, { color: isDark ? '#4B5563' : '#9CA3AF' }]}>
                    ⚕️ For informational purposes only. Always speak with a qualified healthcare provider before making health decisions.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Trends tab ── */}
          {activeTab === 'trends' && hasTrends && sparkline && (
            <View style={{ marginTop: 12 }}>
              {/* Metric header */}
              <View style={styles.trendsHeader}>
                <Text style={[styles.trendsTitle, { color: textColor }]}>
                  {sparkline.label} — Last 7 Days
                </Text>
                <View style={[styles.trendsBadge, { backgroundColor: '#0EA5E920', borderColor: '#0EA5E950' }]}>
                  <Text style={[styles.trendsBadgeText, { color: '#0EA5E9' }]}>{sparkline.unit}</Text>
                </View>
              </View>

              {/* Sparkline */}
              <View style={[styles.sparklineContainer, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: dividerColor }]}>
                <SparklineChart
                  data={sparkline.values}
                  width={sparklineWidth}
                  height={72}
                  strokeColor="#0EA5E9"
                  accentColor="#38BDF8"
                />
              </View>

              {/* Min / Max / Latest + Trend Arrow row */}
              {(() => {
                const vals = sparkline.values;
                const minVal = Math.min(...vals);
                const maxVal = Math.max(...vals);
                const latest = vals[vals.length - 1];
                const first = vals[0];
                const diff = latest - first;
                const pctChange = first !== 0 ? Math.abs(diff / first) * 100 : 0;
                const trendArrow = pctChange < 2 ? '\u2192' : diff > 0 ? '\u2191' : '\u2193';
                const trendLabel = pctChange < 2 ? 'Stable' : diff > 0 ? 'Rising' : 'Falling';
                const trendColor = pctChange < 2 ? '#64748B' : diff > 0 ? '#EF4444' : '#10B981';
                return (
                  <>
                    <View style={styles.trendsStats}>
                      {[
                        { label: 'Min', value: minVal.toFixed(1) },
                        { label: 'Latest', value: latest.toFixed(1) },
                        { label: 'Max', value: maxVal.toFixed(1) },
                      ].map(stat => (
                        <View key={stat.label} style={styles.trendsStat}>
                          <Text style={[styles.trendsStatValue, { color: textColor }]}>{stat.value}</Text>
                          <Text style={[styles.trendsStatLabel, { color: mutedColor }]}>{stat.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={[styles.trendArrowRow, { backgroundColor: trendColor + '18', borderColor: trendColor + '40' }]}>
                      <Text style={[styles.trendArrowText, { color: trendColor }]}>{trendArrow}  {trendLabel}</Text>
                      <Text style={[styles.trendArrowSub, { color: mutedColor }]}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)} {sparkline.unit} vs 7 days ago
                      </Text>
                    </View>
                  </>
                );
              })()}

              {/* Insight context */}
              {items[0] && (
                <View style={[styles.trendsInsightRow, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: dividerColor }]}>
                  <View style={[styles.dot, { backgroundColor: severityColor(items[0].severity), marginTop: 2 }]} />
                  <Text style={[styles.trendsInsightText, { color: severityColor(items[0].severity) }]}>
                    {items[0].text}
                  </Text>
                </View>
              )}

              <Text style={[styles.trendsFooter, { color: isDark ? '#4B5563' : '#9CA3AF' }]}>
                Showing up to 7 days of logged data · All computation on-device
              </Text>
            </View>
          )}

          {/* ── Small Wins tab ── */}
          {activeTab === 'wins' && hasWins && (
            <View style={{ marginTop: 8 }}>
              {wins.map((w, i) => (
                <View
                  key={i}
                  style={[
                    styles.winRow,
                    (i < wins.length - 1 || !!weightGoalBanner) && { borderBottomWidth: 0.5, borderBottomColor: dividerColor },
                  ]}
                >
                  <Text style={styles.winIcon}>{w.icon}</Text>
                  <Text style={[styles.winText, { color: w.color }]}>{w.text}</Text>
                </View>
              ))}
              {/* Weight goal win row — tappable, navigates to weight log */}
              {weightGoalBanner && (
                <TouchableOpacity
                  onPress={onWeightGoalPress}
                  activeOpacity={0.75}
                  style={[styles.winRow, { justifyContent: 'space-between' }]}
                  accessibilityRole="button"
                  accessibilityLabel={weightGoalBanner.achieved ? 'Weight goal reached' : `Almost there — ${weightGoalBanner.diff} ${weightGoalBanner.unitLabel} to your goal`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                    <Text style={styles.winIcon}>{weightGoalBanner.achieved ? '🏆' : '🎯'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.winText, { color: weightGoalBanner.achieved ? '#10B981' : '#F59E0B' }]}>
                        {weightGoalBanner.achieved
                          ? 'Weight goal reached!'
                          : `Almost there — ${weightGoalBanner.diff} ${weightGoalBanner.unitLabel} to goal`}
                      </Text>
                      <Text style={{ fontSize: 10, color: isDark ? '#6B7280' : '#9CA3AF', marginTop: 1 }}>
                        {`Current: ${weightGoalBanner.current} ${weightGoalBanner.unitLabel} · Goal: ${weightGoalBanner.goal} ${weightGoalBanner.unitLabel} · Tap to view`}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: isDark ? '#6B7280' : '#9CA3AF', marginLeft: 4 }}>›</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.winsFooter, { color: isDark ? '#4B5563' : '#9CA3AF' }]}>
                Keep logging to unlock more wins 🎯
              </Text>
            </View>
          )}

        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 4,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  evidenceBadge: {
    backgroundColor: '#6366F120',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#6366F140',
  },
  evidenceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366F1',
  },

  chevron: {
    fontSize: 10,
  },
  // ── Tabs ──
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Insights ──
  insightRow: {
    paddingVertical: 10,
    gap: 6,
  },
  insightContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 4,
    flexShrink: 0,
  },
  insightText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    flex: 1,
  },
  citationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingLeft: 15,
  },
  citationChip: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  citationText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 0.5,
  },
  sourcesLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  sourcesChevron: {
    fontSize: 10,
  },
  sourcesBody: {
    marginTop: 8,
    gap: 8,
  },
  sourcesDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  sourcesChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourceChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  sourceChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  // ── Trends ──
  trendsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trendsTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  trendsBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  trendsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sparklineContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    overflow: 'hidden',
  },
  trendsStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    marginBottom: 10,
  },
  trendsStat: {
    alignItems: 'center',
    gap: 2,
  },
  trendsStatValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  trendsStatLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  trendArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  trendArrowText: {
    fontSize: 14,
    fontWeight: '700',
  },
  trendArrowSub: {
    fontSize: 11,
    fontWeight: '400',
  },
  trendsInsightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  trendsInsightText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    flex: 1,
  },
  trendsFooter: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  // ── Small Wins ──
  winRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  winIcon: {
    fontSize: 18,
  },
  winText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  winsFooter: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  collapsedTabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 10,
  },
  collapsedTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  collapsedTabText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  collapsedTabDivider: {
    width: 1,
    marginVertical: 8,
  },
});
