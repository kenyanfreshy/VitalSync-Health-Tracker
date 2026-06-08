/**
 * EKG Detail Screen — date-range aware, paginated, fully i18n.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { SegmentedControl } from '@/components/segmented-control';
import { useColors } from '@/hooks';
import { useDashboardStrings } from '@/hooks/use-dashboard-strings';
import { useRawLang } from '@/hooks/use-lang';
import { safeFormatDate } from '@/lib/utils';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Dimensions } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText, Line } from 'react-native-svg';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { initAppleHealthKit, _resetRNHCache } from '@/lib/health/rnh-loader';
import {
  fetchEKGPage,
  filterEKGRecords,
  hasAFibRecords,
  computeEKGDistribution,
  getEKGCacheDistribution,
  buildEKGDoctorSummary,
  clearEKGCache,
  EKG_CLASSIFICATIONS,
  EKG_PAGE_SIZE,
  type EKGRecord,
  type EKGClassification,
  type EKGFilter,
  type EKGDistribution,
  type EKGSummaryLabels,
} from '@/lib/health/ekg-store';
import {
  DATE_RANGE_OPTIONS,
  DATE_RANGE_STORAGE_KEY,
  getCutoffTimestamp,
  type DateRangeDays,
} from '@/lib/health/date-range';
import {
  getEKGTallyWithDailyStats,
  type EKGTallyWithDailyStats,
  EKG_ROUTINE_STRIPS_PER_DAY,
} from '@/lib/health/ekg-tally-store';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { useUpsell } from '@/hooks/use-upsell';

const ACCENT = '#EF4444';
const AFIB_COLOR = '#EF4444';
const SINUS_COLOR = '#22C55E';
const SCREEN_W = Dimensions.get('window').width;

// ─── AFib Weekly Trend Bar Chart ──────────────────────────────────────────────
function buildWeeklyAfibBuckets(
  records: EKGRecord[],
  rangeDays: number,
): { label: string; afib: number; sinus: number; other: number }[] {
  const now = Date.now();
  const numWeeks = Math.ceil(rangeDays / 7);
  const buckets = Array.from({ length: numWeeks }, (_, i) => {
    const weekStart = now - (numWeeks - i) * 7 * 24 * 60 * 60 * 1000;
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
    const d = new Date(weekStart);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return { label, weekStart, weekEnd, afib: 0, sinus: 0, other: 0 };
  });
  for (const r of records) {
    const ts = new Date(r.startDate).getTime();
    for (const b of buckets) {
      if (ts >= b.weekStart && ts < b.weekEnd) {
        if (r.classification === 'AtrialFibrillation') b.afib++;
        else if (r.classification === 'SinusRhythm') b.sinus++;
        else b.other++;
        break;
      }
    }
  }
  return buckets.map(({ label, afib, sinus, other }) => ({ label, afib, sinus, other }));
}

function AFibTrendChart({
  records, rangeDays, colors,
}: {
  records: EKGRecord[];
  rangeDays: number;
  colors: ReturnType<typeof useColors>;
}) {
  const buckets = buildWeeklyAfibBuckets(records, rangeDays);
  const hasAny = buckets.some((b) => b.afib + b.sinus + b.other > 0);
  if (!hasAny) return null;

  const W = SCREEN_W - 32;
  const H = 110;
  const PAD = { top: 10, bottom: 28, left: 28, right: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = buckets.length;
  const maxTotal = Math.max(...buckets.map((b) => b.afib + b.sinus + b.other), 1);
  const barW = Math.max(4, (innerW / n) * 0.55);
  const barGap = innerW / n;

  const isDark = colors.background === '#151718' || colors.background.startsWith('#0') || colors.background.startsWith('#1');

  return (
    <Svg width={W} height={H}>
      {/* Y-axis grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = PAD.top + (1 - frac) * innerH;
        const val = Math.round(frac * maxTotal);
        return (
          <React.Fragment key={frac}>
            <Line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke={isDark ? '#2A2A2A' : '#F0F0F0'}
              strokeWidth={0.5}
            />
            <SvgText
              x={PAD.left - 4}
              y={y + 3}
              fontSize={7}
              fill={isDark ? '#555' : '#AAA'}
              textAnchor="end"
            >
              {val}
            </SvgText>
          </React.Fragment>
        );
      })}
      {/* Bars */}
      {buckets.map((b, i) => {
        const cx = PAD.left + i * barGap + barGap / 2;
        const x = cx - barW / 2;
        const totalH = ((b.afib + b.sinus + b.other) / maxTotal) * innerH;
        const afibH = (b.afib / maxTotal) * innerH;
        const sinusH = (b.sinus / maxTotal) * innerH;
        const otherH = (b.other / maxTotal) * innerH;
        const baseY = PAD.top + innerH;
        return (
          <React.Fragment key={i}>
            {/* Other (grey) */}
            {b.other > 0 && (
              <Rect
                x={x} y={baseY - otherH} width={barW} height={otherH}
                fill="#9CA3AF" rx={2}
              />
            )}
            {/* Sinus (green) */}
            {b.sinus > 0 && (
              <Rect
                x={x} y={baseY - otherH - sinusH} width={barW} height={sinusH}
                fill={SINUS_COLOR} rx={2}
              />
            )}
            {/* AFib (red) */}
            {b.afib > 0 && (
              <Rect
                x={x} y={baseY - otherH - sinusH - afibH} width={barW} height={afibH}
                fill={AFIB_COLOR} rx={2}
              />
            )}
            {/* X label */}
            <SvgText
              x={cx}
              y={H - 4}
              fontSize={7}
              fill={isDark ? '#555' : '#AAA'}
              textAnchor="middle"
            >
              {b.label}
            </SvgText>
          </React.Fragment>
        );
      })}
      {/* Baseline */}
      <Line
        x1={PAD.left}
        y1={PAD.top + innerH}
        x2={W - PAD.right}
        y2={PAD.top + innerH}
        stroke={isDark ? '#333' : '#E0E0E0'}
        strokeWidth={0.8}
      />
    </Svg>
  );
}

// ─── Waveform SVG ─────────────────────────────────────────────────────────────
function WaveformSVG({ color, voltageMeasurements }: { color: string; voltageMeasurements?: number[][] | null }) {
  const W = 64;
  const H = 28;
  const midY = H / 2;
  let points: string;
  if (voltageMeasurements && voltageMeasurements.length >= 4) {
    const vals = voltageMeasurements.map((v) => (Array.isArray(v) ? v[1] ?? 0 : 0));
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const step = W / (vals.length - 1);
    points = vals
      .map((v, i) => {
        const x = i * step;
        const y = H - ((v - minV) / range) * (H - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  } else {
    points = [
      `0,${midY}`, `8,${midY}`, `12,${midY - 2}`, `14,${midY + 4}`,
      `16,${midY - 10}`, `18,${midY + 6}`, `20,${midY - 2}`, `22,${midY}`,
      `28,${midY}`, `32,${midY - 3}`, `34,${midY + 2}`, `36,${midY}`,
      `44,${midY}`, `48,${midY - 2}`, `50,${midY + 3}`, `52,${midY}`, `64,${midY}`,
    ].join(' ');
  }
  return (
    <Svg width={W} height={H}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
const DONUT_R = 38;
const DONUT_CX = 54;
const DONUT_CY = 54;
const DONUT_STROKE = 12;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_R;

interface DonutSlice { classification: EKGClassification; count: number; color: string; }

function DonutChart({ dist, ds, colors }: {
  dist: EKGDistribution;
  ds: ReturnType<typeof useDashboardStrings>;
  colors: ReturnType<typeof useColors>;
}) {
  const slices: DonutSlice[] = ([
    { classification: 'SinusRhythm' as EKGClassification, count: dist.sinusRhythm, color: '#22C55E' },
    { classification: 'AtrialFibrillation' as EKGClassification, count: dist.atrialFibrillation, color: '#EF4444' },
    { classification: 'Inconclusive' as EKGClassification, count: dist.inconclusive, color: '#F59E0B' },
    { classification: 'Unclassified' as EKGClassification, count: dist.unclassified, color: '#94A3B8' },
  ] as DonutSlice[]).filter((s) => s.count > 0);
  const total = dist.total || 1;
  let offset = 0;
  const labels: Record<EKGClassification, string> = {
    SinusRhythm: ds.ekgSinusRhythm,
    AtrialFibrillation: ds.ekgAtrialFibrillation,
    Inconclusive: ds.ekgInconclusive,
    Unclassified: ds.ekgUnclassified,
  };
  return (
    <View style={styles.donutContainer}>
      <Svg width={108} height={108}>
        <Circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none"
          stroke="#E5E7EB" strokeWidth={DONUT_STROKE} opacity={0.3} />
        {slices.map((s) => {
          const fraction = s.count / total;
          const dash = fraction * DONUT_CIRCUMFERENCE;
          const gap = DONUT_CIRCUMFERENCE - dash;
          const rotation = (offset / total) * 360 - 90;
          offset += s.count;
          return (
            <G key={s.classification} rotation={rotation} origin={`${DONUT_CX},${DONUT_CY}`}>
              <Circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none"
                stroke={s.color} strokeWidth={DONUT_STROKE}
                strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
            </G>
          );
        })}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={[styles.donutTotal, { color: colors.foreground }]}>{dist.total}</Text>
        <Text style={[styles.donutTotalLabel, { color: colors.muted }]}>{ds.ekgRecordings}</Text>
      </View>
      <View style={styles.donutLegend}>
        {slices.map((s) => (
          <View key={s.classification} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendLabel, { color: colors.muted }]}>
              {labels[s.classification]}: {s.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({ label, active, color, onPress, colors }: {
  label: string; active: boolean; color: string;
  onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[
      styles.chip,
      { backgroundColor: active ? color + '22' : colors.surface, borderColor: active ? color : colors.border },
    ]}>
      <Text style={[styles.chipText, { color: active ? color : colors.muted, fontWeight: active ? '600' : '400' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Classification badge ─────────────────────────────────────────────────────
function ClassificationBadge({ classification, ds }: {
  classification: EKGClassification; ds: ReturnType<typeof useDashboardStrings>;
}) {
  const meta = EKG_CLASSIFICATIONS[classification];
  const label =
    classification === 'SinusRhythm' ? ds.ekgSinusRhythm
    : classification === 'AtrialFibrillation' ? ds.ekgAtrialFibrillation
    : classification === 'Inconclusive' ? ds.ekgInconclusive
    : ds.ekgUnclassified;
  return (
    <View style={[styles.badge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{label}</Text>
    </View>
  );
}

// ─── Single EKG row ───────────────────────────────────────────────────────────
function EKGListRow({ record, ds, locale, colors, onPress }: {
  record: EKGRecord; ds: ReturnType<typeof useDashboardStrings>;
  locale: string; colors: ReturnType<typeof useColors>;
  onPress: (record: EKGRecord) => void;
}) {
  const meta = EKG_CLASSIFICATIONS[record.classification];
  const dateStr = safeFormatDate(record.startDate, locale, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <TouchableOpacity
      onPress={() => onPress(record)}
      activeOpacity={0.75}
      style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.waveformContainer}>
        <WaveformSVG color={meta.color} voltageMeasurements={record.voltageMeasurements} />
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={[styles.rowDate, { color: colors.foreground }]} numberOfLines={1}>{dateStr}</Text>
          <ClassificationBadge classification={record.classification} ds={ds} />
        </View>
        {record.averageHeartRate != null && (
          <Text style={[styles.rowSub, { color: colors.muted }]}>
            {ds.ekgAvgHR}: {record.averageHeartRate} bpm
          </Text>
        )}
        {record.device != null && (
          <Text style={[styles.rowSub, { color: colors.muted }]} numberOfLines={1}>
            {ds.ekgDevice}: {record.device}
          </Text>
        )}
      </View>
      {/* Tap indicator */}
      <IconSymbol name="chevron.right" size={14} color={colors.muted} />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
function EKGDetailScreenInner() {
  const colors = useColors();
  const ds = useDashboardStrings();
  const locale = useRawLang();
  const router = useRouter();
  const { checkAndShow: checkUpsell, UpsellSheet } = useUpsell();

  function handleRowPress(record: EKGRecord) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push((`/detail/ekg-waveform?id=${encodeURIComponent(record.id)}`) as any);
    // Contextual upsell: fire after 3rd EKG view (free users only)
    setTimeout(() => { checkUpsell('ekg_tap').catch(() => {}); }, 600);
  }

  // ── Date range (shared AsyncStorage key with Dashboard) ───────────────────
  // rangeReady: true once AsyncStorage has been read, so loadFirstPage only
  // fires after the correct initial rangeDays is known. This prevents the race
  // condition where fetchingRef blocks the second load when rangeDays changes
  // from the default (30) to the persisted value.
  const [rangeDays, setRangeDays] = useState<DateRangeDays>(30);
  const [rangeReady, setRangeReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DATE_RANGE_STORAGE_KEY).then((val) => {
      const parsed = val ? parseInt(val, 10) : NaN;
      if (parsed === 7 || parsed === 30 || parsed === 90) {
        setRangeDays(parsed as DateRangeDays);
      }
      // Signal that the range is ready — loadFirstPage will now fire once
      // with the correct value.
      setRangeReady(true);
    });
  }, []);

  function handleRangeChange(days: DateRangeDays) {
    setRangeDays(days);
    safeSetItem(DATE_RANGE_STORAGE_KEY, String(days));
  }

  // ── Pagination state ──────────────────────────────────────────────────────
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const [allRecords, setAllRecords] = useState<EKGRecord[]>([]);
  const [filter, setFilter] = useState<EKGFilter>(
    (filterParam === 'AtrialFibrillation' || filterParam === 'SinusRhythm' || filterParam === 'Inconclusive')
      ? (filterParam as EKGFilter)
      : 'all'
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [grantingEkg, setGrantingEkg] = useState(false);
  // true after user tapped Grant and initAppleHealthKit() succeeded but 0 records returned
  const [ekgPermGranted, setEkgPermGranted] = useState(false);
  // timestamp of the most recent successful fetchEKGPage call
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  // Full-cache total (all-time) — used in the header subtitle so it matches the dashboard badge.
  // Pre-populated from the cache on mount so the count is visible immediately.
  const [fullCacheTotal, setFullCacheTotal] = useState<number | null>(null);
  const [dailyStats, setDailyStats] = useState<EKGTallyWithDailyStats | null>(null);

  useEffect(() => {
    // Use tally-based total so the count reflects ALL recordings ever fetched,
    // not just the strips retained in the cache after the daily routine limit.
    import('@/lib/health/ekg-tally-store')
      .then(({ getEKGTally }) => getEKGTally().then((t) => setFullCacheTotal(t.total)))
      .catch(() => getEKGCacheDistribution().then((d) => setFullCacheTotal(d.total)).catch(() => {}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cursorRef = useRef<string | undefined>(undefined);
  const fetchingRef = useRef(false);

  // ── Load first page (re-runs when rangeDays changes) ──────────────────────
  const loadFirstPage = useCallback(async (forceRefresh = false) => {
    // Don't start until AsyncStorage has resolved the initial rangeDays
    if (!rangeReady && !forceRefresh) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    cursorRef.current = undefined;
    setAllRecords([]);
    setHasMore(true);
    try {
      const rsd = new Date(getCutoffTimestamp(rangeDays));
      const result = await fetchEKGPage(undefined, rsd, forceRefresh, 'premium');
      setAllRecords(result.records);
      cursorRef.current = result.nextCursor ?? undefined;
      setHasMore(result.hasMore);
      setLastSyncedAt(new Date());
      // Refresh full-cache total and daily stats so the header subtitle and
      // summarization notices stay in sync after each fetch.
      try {
        const stats = await getEKGTallyWithDailyStats();
        setFullCacheTotal(stats.tally.total);
        setDailyStats(stats);
      } catch {
        try {
          const cacheDist = await getEKGCacheDistribution();
          setFullCacheTotal(cacheDist.total);
        } catch { /* best-effort */ }
      }
    } catch {
      setAllRecords([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, rangeReady]);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  const handleClearAllEKGs = useCallback(() => {
    Alert.alert(
      'Clear EKG Cache',
      'This removes all locally cached EKG recordings. Your data in Apple Health is not affected. You can re-sync at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await clearEKGCache();
            setAllRecords([]);
            setHasMore(false);
            cursorRef.current = undefined;
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, []);

  const handleRefresh = useCallback(async () => {
    if (fetchingRef.current) return;
    setRefreshing(true);
    setEkgPermGranted(false);
    cursorRef.current = undefined;
    // Reset the RNH init cache on manual refresh so that if EKG permission was
    // granted in iOS Settings between sessions, the next initAppleHealthKit()
    // call will re-run and pick up the new authorization state.
    _resetRNHCache();
    await loadFirstPage(true);
    setRefreshing(false);
  }, [loadFirstPage]);

  const loadNextPage = useCallback(async () => {
    if (fetchingRef.current || !hasMore || !cursorRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const rsd = new Date(getCutoffTimestamp(rangeDays));
      const cursor = cursorRef.current ? new Date(cursorRef.current) : undefined;
      const result = await fetchEKGPage(cursor, rsd, false, 'premium');
      if (result.records.length > 0) {
        setAllRecords((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          return [...prev, ...result.records.filter((r) => !existingIds.has(r.id))];
        });
      }
      cursorRef.current = result.nextCursor ?? undefined;
      setHasMore(result.hasMore);
      // Refresh full-cache total so the header badge stays in sync after paging.
      // Use tally-based total so summarized records are counted even if their strips were pruned.
      try {
        const { getEKGTally } = await import('@/lib/health/ekg-tally-store');
        const tally = await getEKGTally();
        setFullCacheTotal(tally.total);
      } catch {
        try {
          const cacheDist = await getEKGCacheDistribution();
          setFullCacheTotal(cacheDist.total);
        } catch {
          // Non-fatal — badge will still show allRecords.length
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [hasMore, rangeDays]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = filterEKGRecords(allRecords, filter);
  const afibPresent = hasAFibRecords(allRecords);
  const dist = computeEKGDistribution(allRecords);

  const FILTERS: { key: EKGFilter; label: string; color: string }[] = [
    { key: 'all', label: ds.ekgFilterAll, color: ACCENT },
    { key: 'AtrialFibrillation', label: ds.ekgFilterAfib, color: '#EF4444' },
    { key: 'SinusRhythm', label: ds.ekgFilterSinus, color: '#22C55E' },
    { key: 'Inconclusive', label: ds.ekgFilterInconclusive, color: '#F59E0B' },
  ];

  function handleFilterPress(key: EKGFilter) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilter(key);
  }

  async function handleShare() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const headerLabel = ds.ekgShareSummaryHeader.replace('{days}', String(rangeDays));
    const summaryLabels: EKGSummaryLabels = {
      sinusRhythm: ds.ekgSinusRhythm,
      atrialFibrillation: ds.ekgAtrialFibrillation,
      inconclusive: ds.ekgInconclusive,
      unclassified: ds.ekgUnclassified,
      avgHR: ds.ekgAvgHR,
      recordings: ds.ekgRecordings,
      disclaimer: ds.ekgDisclaimer,
    };
    const summary = buildEKGDoctorSummary(allRecords, headerLabel, summaryLabels, rangeDays);
    await Clipboard.setStringAsync(summary);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  }

  // ── List header ───────────────────────────────────────────────────────────
  const ListHeader = (
    <View>
      <View style={styles.rangePickerRow}>
        <SegmentedControl options={DATE_RANGE_OPTIONS} value={rangeDays} onChange={handleRangeChange} />
      </View>
      {allRecords.length > 0 && !loading && (
        <React.Fragment>
          <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>{ds.ekgDistributionTitle}</Text>
            <DonutChart dist={dist} ds={ds} colors={colors} />
          </View>
          <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 8 }]}>
            <View style={styles.chartTitleRow}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>
                {ds.ekgAfibTrendTitle ?? 'Weekly Classification Trend'}
              </Text>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: AFIB_COLOR }]} />
                <Text style={[styles.legendLabel, { color: colors.muted }]}>{ds.ekgLegendAfib ?? 'AFib'}</Text>
                <View style={[styles.legendDot, { backgroundColor: SINUS_COLOR }]} />
                <Text style={[styles.legendLabel, { color: colors.muted }]}>{ds.ekgLegendSinus ?? 'Sinus'}</Text>
                <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
                <Text style={[styles.legendLabel, { color: colors.muted }]}>{ds.ekgLegendOtherLabel ?? 'Other'}</Text>
              </View>
            </View>
            <AFibTrendChart records={allRecords} rangeDays={rangeDays} colors={colors} />
          </View>
        </React.Fragment>
      )}
      {afibPresent && (
        <View style={[styles.afibBanner, { backgroundColor: '#EF444411', borderColor: '#EF444433' }]}>
          <Text style={[styles.afibBannerText, { color: '#EF4444' }]}>{'⚠ '}{ds.ekgAfibAlert}</Text>
        </View>
      )}
      {allRecords.length > 0 && !loading && (
        <TouchableOpacity onPress={handleShare} activeOpacity={0.75}
          style={[styles.shareBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.shareBtnText, { color: copyFeedback ? '#22C55E' : ACCENT }]}>
            {copyFeedback ? ds.ekgShareCopied : ds.ekgShareBtn}
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <FilterChip key={f.key} label={f.label} active={filter === f.key}
            color={f.color} onPress={() => handleFilterPress(f.key)} colors={colors} />
        ))}
      </View>
      {/* ── Inline summarization notices (non-blocking, per spec §4) ── */}
      {dailyStats !== null && dailyStats.routineStripsToday >= EKG_ROUTINE_STRIPS_PER_DAY && (
        <View style={[styles.summarizationNotice, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
          <Text style={[styles.summarizationNoticeText, { color: '#B45309' }]}>
            {'⚡ Daily EKG storage limit reached. Routine readings are being summarized.'}
          </Text>
        </View>
      )}
      {dailyStats !== null && dailyStats.routineStripsToday > 0 && dailyStats.routineStripsToday < EKG_ROUTINE_STRIPS_PER_DAY && (
        <View style={[styles.summarizationNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.summarizationNoticeText, { color: colors.muted }]}>
            {'Some routine EKG strips were summarized to save storage.'}
          </Text>
        </View>
      )}
    </View>
  );

  // ── List footer ───────────────────────────────────────────────────────────
  const ListFooter = (
    <View>
      {loadingMore && (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color={ACCENT} />
        </View>
      )}
      <View style={[styles.disclaimer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.disclaimerText, { color: colors.muted }]}>{ds.ekgDisclaimer}</Text>
      </View>
    </View>
  );

  return (
    <ScreenContainer>
      {/* Contextual upsell bottom sheet */}
      {UpsellSheet}

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <DetailHeader
            title={ds.ekgCard}
            subtitle={lastSyncedAt
              ? (() => {
                  const diffMs = Date.now() - lastSyncedAt.getTime();
                  const diffMin = Math.floor(diffMs / 60000);
                  const diffH = Math.floor(diffMs / 3600000);
                  const diffD = Math.floor(diffMs / 86400000);
                  const ago = diffMin < 1
                    ? ds.ekgJustNow
                    : diffH < 1
                      ? ds.ekgMinAgo.replace('{n}', String(diffMin))
                      : diffD < 1
                        ? ds.ekgHAgo.replace('{n}', String(diffH))
                        : ds.ekgDAgo.replace('{n}', String(diffD));
                  // Show all-time total alongside the sync time so it matches the dashboard badge
                  const totalLabel = fullCacheTotal !== null && fullCacheTotal > 0
                    ? ` · ${fullCacheTotal} ${fullCacheTotal === 1 ? (ds.ekgRecording ?? 'recording') : (ds.ekgRecordings ?? 'recordings')}`
                    : '';
                  return `${ds.ekgLastSynced}: ${ago}${totalLabel}`;
                })()
              : fullCacheTotal !== null && fullCacheTotal > 0
                ? `${fullCacheTotal} ${fullCacheTotal === 1 ? (ds.ekgRecording ?? 'recording') : (ds.ekgRecordings ?? 'recordings')}`
                : `${allRecords.length}${hasMore ? '+' : ''} ${ds.ekgRecordings}`
            }
          />
        </View>
        {allRecords.length > 0 && (
          <TouchableOpacity
            onPress={handleClearAllEKGs}
            activeOpacity={0.7}
            style={styles.clearCacheBtn}
          >
            <Text style={styles.clearCacheBtnText}>{ds.ekgClearCache ?? 'Clear Cache'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : filtered.length === 0 && allRecords.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.rangePickerRow}>
            <SegmentedControl options={DATE_RANGE_OPTIONS} value={rangeDays} onChange={handleRangeChange} />
          </View>
          <Text style={[styles.emptyText, { color: colors.muted }]}>{ds.ekgNoData}</Text>
          {Platform.OS === 'ios' && (
            <View style={[styles.permBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {ekgPermGranted ? (
                <>
                  <Text style={[styles.permBannerTitle, { color: colors.foreground }]}>
                    ✅ EKG Access Granted
                  </Text>
                  <Text style={[styles.permBannerBody, { color: colors.muted }]}>
                    {ds.ekgNoEkgYet}
                  </Text>
                </>
              ) : (
                <>
              <Text style={[styles.permBannerTitle, { color: colors.foreground }]}>{ds.ekgGrantAccessTitle}</Text>
              <Text style={[styles.permBannerBody, { color: colors.muted }]}>{ds.ekgGrantAccessBody}</Text>
              <TouchableOpacity
                style={[styles.permBannerBtn, { backgroundColor: ACCENT, opacity: grantingEkg ? 0.6 : 1 }]}
                activeOpacity={0.75}
                disabled={grantingEkg}
                onPress={async () => {
                  if (Platform.OS !== 'ios') return;
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGrantingEkg(true);
                  try {
                    // Reset the in-memory init cache so initAppleHealthKit() calls
                    // initHealthKit() again — this is required to show the iOS
                    // permission sheet for Electrocardiogram if it was never requested
                    // in a previous session (the cache would otherwise short-circuit).
                    _resetRNHCache();
                    console.log('[EKG] Grant button: cache reset, calling initAppleHealthKit...');
                    const ok = await initAppleHealthKit();
                    console.log('[EKG] Grant button: initAppleHealthKit result:', ok);
                    if (ok) {
                      await loadFirstPage(true);
                      // If still no records after granting, show the secondary message
                      setEkgPermGranted(true);
                    } else {
                      await loadFirstPage(true);
                    }
                  } finally {
                    setGrantingEkg(false);
                  }
                }}
              >
                <Text style={styles.permBannerBtnText}>
                  {grantingEkg ? '…' : ds.ekgGrantAccessBtn}
                </Text>
              </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          renderItem={({ item }) => (
            <EKGListRow record={item} ds={ds} locale={locale} colors={colors} onPress={handleRowPress} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListFooterComponent={ListFooter}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.5}
          windowSize={5}
          initialNumToRender={10}
          maxToRenderPerBatch={EKG_PAGE_SIZE}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
              tintColor={ACCENT} colors={[ACCENT]} />
          }
        />
      )}
    </ScreenContainer>
  );
}

export default function EKGDetailScreen() {
  const { isPremium, requirePremium, PremiumGateSheet } = usePremiumGate({ fullScreen: true });
  React.useEffect(() => {
    if (!isPremium) {
      requirePremium(() => {}, { feature: 'EKG Analysis' })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);
  if (!isPremium) {
    return <>{PremiumGateSheet}</>;
  }
  return <EKGDetailScreenInner />;
}
// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rangePickerRow: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  chartCard: { marginHorizontal: 16, marginBottom: 12, marginTop: 8, borderRadius: 16, borderWidth: 1, padding: 14 },
  chartTitle: { fontSize: 13, fontWeight: '600', marginBottom: 12, letterSpacing: 0.2 },
  donutContainer: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  donutCenter: { position: 'absolute', left: 0, width: 108, height: 108, alignItems: 'center', justifyContent: 'center' },
  donutTotal: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  donutTotalLabel: { fontSize: 10, fontWeight: '400', lineHeight: 13 },
  donutLegend: { flex: 1, gap: 6 },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, lineHeight: 16 },
  afibBanner: { marginHorizontal: 16, marginBottom: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  afibBannerText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  shareBtn: { marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  shareBtnText: { fontSize: 14, fontWeight: '600' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, lineHeight: 18 },
  listContent: { paddingBottom: 32 },
  listRow: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  waveformContainer: { width: 64, height: 28 },
  rowInfo: { flex: 1, gap: 3 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowDate: { fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  rowSub: { fontSize: 12, lineHeight: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  loadMoreContainer: { paddingVertical: 16, alignItems: 'center' },
  disclaimer: { margin: 16, borderRadius: 12, borderWidth: 1, padding: 12 },
  disclaimerText: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  summarizationNotice: { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  summarizationNoticeText: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permBanner: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 16, gap: 8, marginTop: 8 },
  permBannerTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  permBannerBody: { fontSize: 13, lineHeight: 19 },
  permBannerBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  permBannerBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 12 },
  clearCacheBtn: { marginTop: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440' },
  clearCacheBtnText: { fontSize: 12, fontWeight: '600', color: '#EF4444', lineHeight: 16 },
});
