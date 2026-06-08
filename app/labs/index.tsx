/**
 * Lab History + Correlation Screen
 *
 * Glassmorphism clinical design:
 * - Frosted glass result cards with status indicators
 * - Trend sparklines per analyte
 * - Dynamic Lab Correlation insight cards
 * - Panel filter tabs
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Line } from 'react-native-svg';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { useLabResultsBadge } from '@/hooks/use-lab-results-badge';
import { labsStrings } from '@/lib/i18n';
import { useHealth } from '@/lib/health/health-context';
import { ConditionLinkSheet } from '@/components/condition-link-sheet';
import { trpc } from '@/lib/trpc';
import {
  LAB_PANEL_LABELS,
  LAB_PANEL_SHORT,
  PANEL_ANALYTES,
  REFERENCE_RANGES,
  getAnalyteStatus,
  type LabPanelId,
  type LabAnalyteId,
  type LabResult,
  type LabCorrelationInsight,
} from '@/lib/health/lab-types';
import {
  generateLocalCorrelationInsights,
  has24hFoodLog,
} from '@/lib/health/lab-correlation';
import { exportLabsAsCsv, type ExportResult } from '@/lib/health/lab-export';
import { PrivacyBanner } from '@/components/privacy-banner';

const PANELS: LabPanelId[] = ['CMP', 'CBC', 'MG', 'PHOS', 'LIPID', 'A1C', 'THYROID', 'IRON', 'VITAMINS', 'SPECIALTY'];

const PANEL_COLORS: Record<LabPanelId, string> = {
  CMP:      '#2563EB',
  CBC:      '#7C3AED',
  MG:       '#22C55E',
  PHOS:     '#D97706',
  LIPID:    '#DC2626',
  A1C:      '#DB2777',
  THYROID:  '#0891B2', // cyan-600 — thyroid/endocrine
  IRON:     '#B45309', // amber-700 — iron/blood
  VITAMINS: '#16A34A', // green-600 — vitamins/nutrients
  SPECIALTY:'#7C3AED', // violet — specialty markers
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({
  values,
  width = 60,
  height = 24,
  color,
  low,
  high,
}: {
  values: number[];
  width?: number;
  height?: number;
  color: string;
  low: number;
  high: number;
}) {
  if (values.length < 2) return null;

  const minV = Math.min(...values, low);
  const maxV = Math.max(...values, high);
  const range = maxV - minV || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - minV) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Reference range band y positions
  const refLowY = height - ((low - minV) / range) * height;
  const refHighY = height - ((high - minV) / range) * height;

  return (
    <Svg width={width} height={height}>
      {/* Reference range lines */}
      <Line x1={0} y1={refLowY} x2={width} y2={refLowY} stroke={color} strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4} />
      <Line x1={0} y1={refHighY} x2={width} y2={refHighY} stroke={color} strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4} />
      {/* Trend line */}
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Analyte Value Cell ───────────────────────────────────────────────────────

function AnalyteCell({
  analyteId,
  value,
  historicalValues,
  accentColor,
}: {
  analyteId: LabAnalyteId;
  value: number;
  historicalValues: number[];
  accentColor: string;
}) {
  const colors = useColors();
  const ref = REFERENCE_RANGES[analyteId];
  if (!ref) return null;

  const status = getAnalyteStatus(analyteId, value);
  const statusColor = status === 'high'
    ? colors.error
    : status === 'low'
      ? colors.accent
      : status === 'normal'
        ? colors.success
        : colors.muted;

  // Format reference range text compactly
  const refText = ref.low === 0
    ? `< ${ref.high}`
    : `${ref.low}–${ref.high}`;
  const statusLabel = status === 'high' ? 'High' : status === 'low' ? 'Low' : status === 'critical' ? 'Critical' : null;

  return (
    <View style={[styles.analyteCell, { borderColor: status !== 'normal' && status !== 'unknown' ? `${statusColor}60` : colors.border, borderWidth: status !== 'normal' && status !== 'unknown' ? 1.5 : StyleSheet.hairlineWidth }]}>
      <View style={styles.analyteCellTop}>
        <Text style={[styles.analyteCellAbbr, { color: colors.muted }]}>{ref.abbr}</Text>
        {statusLabel && (
          <View style={[styles.analyteCellBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.analyteCellBadgeText, { color: statusColor }]}>
              {statusLabel === 'High' ? 'H' : statusLabel === 'Low' ? 'L' : '!'}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.analyteCellValue, { color: status !== 'normal' ? statusColor : colors.foreground }]}>
        {value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}
      </Text>
      <Text style={[styles.analyteCellUnit, { color: colors.muted }]}>{ref.unit}</Text>
      {/* Reference range row */}
      <Text style={[styles.analyteCellRefRange, { color: status !== 'normal' && status !== 'unknown' ? `${statusColor}CC` : colors.muted }]}>
        Ref: {refText}
      </Text>
      {statusLabel && (
        <Text style={[styles.analyteCellStatusLabel, { color: statusColor }]}>{statusLabel}</Text>
      )}
      {historicalValues.length >= 2 && (
        <View style={styles.analyteCellSparkline}>
          <Sparkline
            values={historicalValues}
            color={status !== 'normal' ? statusColor : accentColor}
            low={ref.low}
            high={ref.high}
          />
        </View>
      )}
    </View>
  );
}

// ─── Correlation Insight Card ─────────────────────────────────────────────────

function InsightCard({ insight }: { insight: LabCorrelationInsight }) {
  const colors = useColors();
  const severityColor = insight.severity === 'critical'
    ? colors.error
    : insight.severity === 'warning'
      ? colors.warning
      : colors.primary;

  const severityIcon = insight.severity === 'critical' ? '⚠' : insight.severity === 'warning' ? '⚡' : 'ℹ';

  return (
    <View style={[styles.insightCard, { backgroundColor: `${severityColor}10`, borderColor: `${severityColor}30` }]}>
      <View style={styles.insightHeader}>
        <Text style={[styles.insightIcon]}>{severityIcon}</Text>
        <View style={styles.insightHeaderText}>
          <Text style={[styles.insightAnalyte, { color: severityColor }]}>
            {insight.analyteLabel} {insight.status === 'high' ? '▲' : '▼'} {insight.labValue} {insight.unit}
          </Text>
          <Text style={[styles.insightNutrient, { color: colors.muted }]}>
            {insight.nutrient}: {insight.intake24h.toLocaleString()} {insight.intakeUnit} in 24h
          </Text>
        </View>
      </View>
      <Text style={[styles.insightText, { color: colors.foreground }]}>{insight.insight}</Text>
    </View>
  );
}

// ─── Lab Result Card ──────────────────────────────────────────────────────────

function LabResultCard({
  result,
  allResults,
  onDelete,
  onCorrelate,
  onLink,
  isCorrelating,
  insights,
  hasFoodLog,
  isHighlighted,
}: {
  result: LabResult;
  allResults: LabResult[];
  onDelete: (id: string) => void;
  onCorrelate: (result: LabResult) => void;
  onLink: (result: LabResult) => void;
  isCorrelating: boolean;
  insights: LabCorrelationInsight[];
  hasFoodLog: boolean;
  isHighlighted?: boolean;
}) {
  const colors = useColors();
  const _lang = useLang();
  const _ls = labsStrings[_lang as keyof typeof labsStrings] ?? labsStrings.en;
  const [expanded, setExpanded] = useState(isHighlighted ?? false);
  // Auto-expand when highlighted (navigated from Medical History)
  useEffect(() => {
    if (isHighlighted) setExpanded(true);
  }, [isHighlighted]);
  const accentColor = PANEL_COLORS[result.panel];
  const analytes = PANEL_ANALYTES[result.panel];

  // Build historical values for sparklines (same panel, same analyte, sorted by time)
  const samePanel = allResults
    .filter(r => r.panel === result.panel)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const getHistory = (analyteId: LabAnalyteId) =>
    samePanel
      .map(r => r.values[analyteId])
      .filter((v): v is number => typeof v === 'number');

  const date = new Date(result.timestamp);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const abnormalCount = analytes.filter(a => {
    const v = result.values[a];
    return typeof v === 'number' && getAnalyteStatus(a, v) !== 'normal';
  }).length;

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.surfaceRaised, borderColor: isHighlighted ? accentColor : `${accentColor}30`, borderWidth: isHighlighted ? 2 : 1, shadowColor: colors.shadowBase }]}>
      {/* Accent bar */}
      <View style={[styles.resultAccentBar, { backgroundColor: accentColor }]} />

      {/* Header */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(e => !e);
        }}
        style={styles.resultHeader}
      >
        <View style={styles.resultHeaderLeft}>
          <View style={[styles.resultPanelBadge, { backgroundColor: `${accentColor}20` }]}>
            <Text style={[styles.resultPanelBadgeText, { color: accentColor }]}>
              {LAB_PANEL_SHORT[result.panel]}
            </Text>
          </View>
          <View style={styles.resultHeaderMeta}>
            <Text style={[styles.resultDate, { color: colors.foreground }]}>{dateStr}</Text>
            {result.labName && (
              <Text style={[styles.resultLabName, { color: colors.muted }]}>{result.labName}</Text>
            )}
          </View>
        </View>
        <View style={styles.resultHeaderRight}>
          {abnormalCount > 0 && (
            <View style={[styles.resultAbnormalBadge, { backgroundColor: `${colors.error}20` }]}>
              <Text style={[styles.resultAbnormalText, { color: colors.error }]}>
                {abnormalCount} {_ls.abnormalLabel ?? 'abnormal'}
              </Text>
            </View>
          )}
          <Text style={[styles.resultChevron, { color: colors.muted }]}>
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </Pressable>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.resultExpanded}>
          {/* Analyte grid */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.analytesGrid}>
              {analytes.map(analyteId => {
                const v = result.values[analyteId];
                if (typeof v !== 'number') return null;
                return (
                  <AnalyteCell
                    key={analyteId}
                    analyteId={analyteId}
                    value={v}
                    historicalValues={getHistory(analyteId)}
                    accentColor={accentColor}
                  />
                );
              })}
            </View>
          </ScrollView>

          {/* Correlation section */}
          {hasFoodLog && (
            <View style={styles.correlationSection}>
              <View style={styles.correlationHeader}>
                <IconSymbol name="chart.line.uptrend.xyaxis" size={14} color={colors.primary} />
                <Text style={[styles.correlationTitle, { color: colors.foreground }]}>
                  {_ls.dynamicCorrelation ?? 'Dynamic Lab Correlation'}
                </Text>
                {isCorrelating && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />}
              </View>
              {insights.length > 0
                ? insights.map((insight, i) => <InsightCard key={i} insight={insight} />)
                : !isCorrelating && (
                  <Pressable
                    onPress={() => onCorrelate(result)}
                    style={({ pressed }) => [
                      styles.correlateButton,
                      { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30`, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.correlateButtonText, { color: colors.primary }]}>
                      {_ls.analyzeAgainst ?? 'Analyze against 24h food log'}
                    </Text>
                  </Pressable>
                )
              }
            </View>
          )}

          {/* Actions */}
          <View style={[styles.resultActions, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => onCorrelate(result)}
              disabled={isCorrelating || !hasFoodLog}
              style={({ pressed }) => [
                styles.resultActionBtn,
                { opacity: pressed || !hasFoodLog ? 0.5 : 1 },
              ]}
            >
              <IconSymbol name="chart.xyaxis.line" size={14} color={colors.primary} />
              <Text style={[styles.resultActionText, { color: colors.primary }]}>{_ls.reCorrelate ?? 'Re-correlate'}</Text>
            </Pressable>
            <Pressable
              onPress={() => onLink(result)}
              style={({ pressed }) => [styles.resultActionBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="link" size={14} color={result.linkedConditionId ? colors.success : colors.muted} />
              <Text style={[styles.resultActionText, { color: result.linkedConditionId ? colors.success : colors.muted }]}>
                {result.linkedConditionId ? _ls.linked : _ls.linkCondition}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Alert.alert(_ls.deleteResult, _ls.deleteResultMsg, [
                  { text: _ls.cancel, style: 'cancel' },
                  { text: _ls.delete, style: 'destructive', onPress: () => onDelete(result.id) },
                ]);
              }}
              style={({ pressed }) => [styles.resultActionBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="trash" size={14} color={colors.error} />
              <Text style={[styles.resultActionText, { color: colors.error }]}>{_ls.delete}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LabsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const lang = useLang();
  const ls = labsStrings[lang as keyof typeof labsStrings] ?? labsStrings.en;
  const { state, deleteLabResult } = useHealth();
  const { clearLabBadge } = useLabResultsBadge();

  // Clear the badge when the user opens the Labs screen
  useEffect(() => {
    clearLabBadge();
  }, [clearLabBadge]);

  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const [filterPanel, setFilterPanel] = useState<LabPanelId | 'ALL'>('ALL');
  const [correlatingId, setCorrelatingId] = useState<string | null>(null);
  const [insightMap, setInsightMap] = useState<Record<string, LabCorrelationInsight[]>>({});
  const [linkingResult, setLinkingResult] = useState<LabResult | null>(null);
  const [linkSheetVisible, setLinkSheetVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Track which result to highlight (navigated from Medical History)
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightId ?? null);
  useEffect(() => {
    if (highlightId) {
      setHighlightedId(highlightId);
      const t = setTimeout(() => setHighlightedId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [highlightId]);

  const correlateMutation = trpc.lab.correlate.useMutation();

  const labResults: LabResult[] = (state.data?.labResults ?? []).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const handleExportCsv = useCallback(async () => {
    if (labResults.length === 0) {
      Alert.alert(ls.noData, ls.noDataMsg);
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExporting(true);
    try {
      const result: ExportResult = await exportLabsAsCsv(labResults);
      if (result === 'clipboard') {
        Alert.alert(ls.copiedTitle, ls.copiedMsg, [{ text: ls.ok ?? 'OK' }]);
      } else if (result === 'failed') {
        Alert.alert(ls.exportUnavailable, ls.exportUnavailableMsg);
      }
      // 'shared' — share sheet handled natively, no alert needed
    } catch (_unused) {
      Alert.alert(ls.exportFailed, ls.exportFailedMsg);
    } finally {
      setIsExporting(false);
    }
  }, [labResults]);

  const filtered = filterPanel === 'ALL'
    ? labResults
    : labResults.filter(r => r.panel === filterPanel);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sodiumRecords = state.data?.sodiumIntake ?? [];

  const handleCorrelate = useCallback(async (result: LabResult) => {
    // First try local engine
    const localInsights = generateLocalCorrelationInsights(result, sodiumRecords);

    if (localInsights.length > 0) {
      setInsightMap(prev => ({ ...prev, [result.id]: localInsights }));
      return;
    }

    // Fall back to Smart engine
    setCorrelatingId(result.id);
    try {
      const res = await correlateMutation.mutateAsync({
        labResult: {
          id: result.id,
          timestamp: result.timestamp,
          panel: result.panel,
          values: result.values as Record<string, number | null>,
          source: result.source,
          labName: result.labName,
        },
        sodiumRecords24h: sodiumRecords
          .filter(r => {
            const labTime = new Date(result.timestamp).getTime();
            const t = new Date(r.timestamp).getTime();
            return t >= labTime - 86400000 && t <= labTime;
          })
          .map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            sodiumMg: r.sodiumMg,
            potassiumMg: r.potassiumMg,
            carbsG: r.carbsG,
            sugarG: r.sugarG,
            fatG: r.fatG,
            proteinG: r.proteinG,
            glycemicLoad: r.glycemicLoad,
            fiberG: r.fiberG,
            calories: r.calories,
          })),
      });
      setInsightMap(prev => ({ ...prev, [result.id]: res.insights as LabCorrelationInsight[] }));
    } catch (_unused) {
      Alert.alert(ls.correlationFailed, ls.correlationFailedMsg);
    } finally {
      setCorrelatingId(null);
    }
  }, [correlateMutation, sodiumRecords]);

  const handleLink = useCallback((result: LabResult) => {
    setLinkingResult(result);
    setLinkSheetVisible(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteLabResult(id);
    setInsightMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [deleteLabResult]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          <Text style={[styles.headerBackText, { color: colors.primary }]}>{(ls as any).backLabel}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{ls.labResultsTitle}</Text>
        <View style={styles.headerActions}>
          {labResults.length > 0 && (
            <Pressable
              onPress={handleExportCsv}
              disabled={isExporting}
              style={({ pressed }) => [styles.headerExport, { borderColor: colors.border, opacity: pressed || isExporting ? 0.6 : 1 }]}
            >
              {isExporting
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <IconSymbol name="square.and.arrow.up" size={16} color={colors.primary} />}
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/labs/entry')}
            style={({ pressed }) => [styles.headerAdd, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="plus" size={16} color="#fff" />
            <Text style={styles.headerAddText}>{ls.allLabel ? '+' : '+'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Panel Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterBarContent}
      >
        {(['ALL', ...PANELS] as (LabPanelId | 'ALL')[]).map(panel => {
          const isActive = filterPanel === panel;
          const color = panel === 'ALL' ? colors.primary : PANEL_COLORS[panel];
          return (
            <Pressable
              key={panel}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterPanel(panel);
              }}
              style={({ pressed }) => [
                styles.filterChip,
                {
                  backgroundColor: isActive ? color : colors.surface,
                  borderColor: isActive ? color : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: isActive ? '#fff' : colors.muted }]}>
                {panel === 'ALL' ? ls.allLabel : panel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Privacy Banner */}
      <PrivacyBanner />

      {/* Content */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="cross.case.fill" size={48} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{ls.labResultsTitle}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            {ls.tapAddToEnter}
          </Text>
          <Pressable
            onPress={() => router.push('/labs/entry')}
            style={({ pressed }) => [
              styles.emptyButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.emptyButtonText}>{ls.addLabResultBtn}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          renderItem={({ item }) => (
            <LabResultCard
              result={item}
              allResults={labResults}
              onDelete={handleDelete}
              onCorrelate={handleCorrelate}
              onLink={handleLink}
              isCorrelating={correlatingId === item.id}
              insights={insightMap[item.id] ?? []}
              hasFoodLog={has24hFoodLog(sodiumRecords, item.timestamp)}
              isHighlighted={highlightedId === item.id}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
      <ConditionLinkSheet
        visible={linkSheetVisible}
        labResult={linkingResult}
        onClose={() => setLinkSheetVisible(false)}
        onLinked={() => setLinkSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  headerBackText: { fontSize: 16, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerExport: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerAddText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  filterBar: { maxHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  filterBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  list: { padding: 16 },

  // Result card
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  resultAccentBar: { height: 3 },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  resultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  resultPanelBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  resultPanelBadgeText: { fontSize: 12, fontWeight: '700' },
  resultHeaderMeta: { gap: 2 },
  resultDate: { fontSize: 14, fontWeight: '600' },
  resultLabName: { fontSize: 12 },
  resultHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultAbnormalBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  resultAbnormalText: { fontSize: 11, fontWeight: '600' },
  resultChevron: { fontSize: 12 },

  resultExpanded: { paddingHorizontal: 14, paddingBottom: 14 },
  analytesGrid: { flexDirection: 'row', gap: 8, paddingVertical: 4 },

  // Analyte cell
  analyteCell: {
    width: 88,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  analyteCellTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  analyteCellAbbr: { fontSize: 10, fontWeight: '600' },
  analyteCellBadge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  analyteCellBadgeText: { fontSize: 9, fontWeight: '700' },
  analyteCellValue: { fontSize: 15, fontWeight: '700' },
  analyteCellUnit: { fontSize: 9 },
  analyteCellRefRange: { fontSize: 8, textAlign: 'center', marginTop: 1 },
  analyteCellStatusLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  analyteCellSparkline: { marginTop: 4 },

  // Correlation
  correlationSection: { marginTop: 12, gap: 8 },
  correlationHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  correlationTitle: { fontSize: 13, fontWeight: '600' },
  correlateButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  correlateButtonText: { fontSize: 13, fontWeight: '600' },

  // Insight card
  insightCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  insightIcon: { fontSize: 16, lineHeight: 20 },
  insightHeaderText: { flex: 1, gap: 2 },
  insightAnalyte: { fontSize: 13, fontWeight: '700' },
  insightNutrient: { fontSize: 11 },
  insightText: { fontSize: 12, lineHeight: 17 },

  // Actions
  resultActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resultActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultActionText: { fontSize: 13, fontWeight: '500' },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  emptyButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
