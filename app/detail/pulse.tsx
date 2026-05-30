/**
 * Pulse & HRV Detail Screen
 *
 * Sub-tabs:
 *   • Active HR  — BPM line chart + HRV bar chart + stats (existing content)
 *   • Resting HR — Daily resting HR line chart + stats (new)
 *
 * Both tabs share the same 1h / 4h / daily aggregation window controlled via
 * the global hrWindow preference (same as Settings → HR Chart Resolution).
 */
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import {
  ScrollView, StyleSheet, Text, View, Dimensions,
  useColorScheme, PanResponder, Pressable,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { LineChart, normalizeData } from '@/components/charts/line-chart';
import { HrvTrendChart } from '@/components/charts/bar-chart';
import { SectionTabBar } from '@/components/section-tab-bar';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { detailStrings } from '@/lib/i18n';
import { useHrvTarget } from '@/hooks/use-hrv-target';
import { HR_WINDOW_SHORT, type HrWindowSize, loadHrWindow, saveHrWindow } from '@/lib/health/hr-window-pref';
import { aggregateHrTo4HourBuckets, aggregatedToPulseRecords, getLatestHrRecord, type HrBucket } from '@/lib/health/hr-aggregation';
import { getAdjustedRestingHRStatus, loadUserProfile } from '@/lib/user-profile';
import { useRouter } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

type HrTab = 'active' | 'resting';

// ─── Shared window selector chip row ─────────────────────────────────────────
function WindowChips({
  hrWindow,
  setHrWindow,
  accentColor,
}: {
  hrWindow: HrWindowSize;
  setHrWindow: (w: HrWindowSize) => void;
  accentColor: string;
}) {
  const colors = useColors();
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  const WINDOWS: HrWindowSize[] = ['1h', '4h', 'daily'];
  const LABELS: Record<HrWindowSize, string> = { '1h': '1 hr', '4h': '4 hr', daily: d.dailyWindow };
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
      {WINDOWS.map((w) => {
        const active = hrWindow === w;
        return (
          <Pressable
            key={w}
            onPress={() => setHrWindow(w)}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 16,
              backgroundColor: active ? accentColor + '20' : colors.surface,
              borderWidth: 1,
              borderColor: active ? accentColor + '60' : colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: active ? '700' : '500',
              color: active ? accentColor : colors.muted,
            }}>
              {LABELS[w]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Active HR tab content ────────────────────────────────────────────────────
function ActiveHRTab() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { state } = useHealth();

  // Local hrWindow state — loaded from AsyncStorage, persisted on change
  const [hrWindow, setHrWindowState] = useState<HrWindowSize>('4h');
  useEffect(() => {
    loadHrWindow().then(setHrWindowState).catch(() => {});
  }, []);
  const setHrWindow = (w: HrWindowSize) => {
    setHrWindowState(w);
    saveHrWindow(w).catch(() => {});
  };

  // Compute aggregated HR records locally from state.data
  const aggregatedHeartRate = useMemo<HrBucket[]>(() => {
    const raw = state.data?.pulse ?? [];
    return aggregateHrTo4HourBuckets(raw, hrWindow);
  }, [state.data?.pulse, hrWindow]);

  const aggregatedHrRecords = useMemo(() =>
    aggregatedToPulseRecords(aggregatedHeartRate),
  [aggregatedHeartRate]);

  const latestHrRecord = useMemo(() =>
    getLatestHrRecord(state.data?.pulse ?? []),
  [state.data?.pulse]);
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  const { target: hrvTarget } = useHrvTarget();

  const records = useMemo(() => {
    const manualRecords = (state.data?.vitalSigns ?? [])
      .filter((r) => r.heartRate !== undefined)
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        bpm: r.heartRate!,
        hrv: undefined as number | undefined,
        source: 'manual' as const,
      }));
    return [...aggregatedHrRecords, ...manualRecords].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [aggregatedHrRecords, state.data?.vitalSigns]);

  const latest = latestHrRecord ?? records[records.length - 1];
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
  const bpmData = useMemo(() => normalizeData(records.map((r) => r.bpm)), [records]);

  function formatBucketRange(blockStart: string, blockEnd: string): string {
    const fmt = (iso: string) => {
      const dt = new Date(iso);
      const h = dt.getHours();
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12} ${ampm}`;
    };
    return `${fmt(blockStart)} – ${fmt(blockEnd)}`;
  }

  const selectedBucket = selectedBucketIndex !== null
    ? (aggregatedHeartRate[selectedBucketIndex] ?? null)
    : null;

  const avgBpm = records.length
    ? Math.round(records.reduce((s, r) => s + r.bpm, 0) / records.length)
    : 0;
  const avgHrv = records.length
    ? Math.round(records.reduce((s, r) => s + (r.hrv ?? 0), 0) / records.length)
    : 0;
  const minBpm = records.length ? Math.min(...records.map((r) => r.bpm)) : 0;
  const maxBpm = records.length ? Math.max(...records.map((r) => r.bpm)) : 0;

  function getHrvZone(hrv: number): { label: string; color: string } {
    if (hrv >= 50) return { label: d.hrvZoneExcellent, color: colors.bpGreen };
    if (hrv >= 35) return { label: d.hrvZoneGood, color: colors.primary };
    if (hrv >= 20) return { label: d.hrvZoneFair, color: colors.bpAmber };
    return { label: d.hrvZoneLow, color: colors.error };
  }
  const hrvZone = latest?.hrv ? getHrvZone(latest.hrv) : null;

  const [adjustedHRV, setAdjustedHRV] = useState<{
    label: string;
    status: 'low' | 'normal' | 'high';
    referenceLabel: string;
  } | null>(null);

  const [hrvRange, setHrvRange] = useState<7 | 30 | 90 | 'all'>('all');
  const [selectedHrvIndex, setSelectedHrvIndex] = useState<number | null>(null);

  const handleHrvRangeChange = (r: 7 | 30 | 90 | 'all') => {
    setHrvRange(r);
    setSelectedHrvIndex(null);
  };
  const handleHrvBarPress = (i: number) => {
    setSelectedHrvIndex((prev) => (prev === i ? null : i));
  };

  const filteredHrvCount = useMemo(() => {
    const withHrv = records.filter((r) => (r.hrv ?? 0) > 0);
    if (hrvRange === 'all') return Math.min(withHrv.length, 90);
    const cutoff = Date.now() - (hrvRange as number) * 24 * 60 * 60 * 1000;
    return Math.min(withHrv.filter((r) => new Date(r.timestamp).getTime() >= cutoff).length, 90);
  }, [records, hrvRange]);

  const swipeStartX = useRef<number | null>(null);
  const hrvSwipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
      onPanResponderGrant: (evt) => { swipeStartX.current = evt.nativeEvent.locationX; },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 12) return;
        const dir = g.dx < 0 ? 1 : -1;
        setSelectedHrvIndex((prev) => {
          if (filteredHrvCount === 0) return null;
          if (prev === null) return dir > 0 ? 0 : filteredHrvCount - 1;
          const next = prev + dir;
          if (next < 0 || next >= filteredHrvCount) return prev;
          return next;
        });
      },
    }),
  ).current;

  useEffect(() => {
    if (latest?.hrv) {
      import('@/lib/health/correlation').then(({ getAdjustedHRVStatus }) => {
        getAdjustedHRVStatus(latest.hrv!).then(setAdjustedHRV).catch(() => {});
      });
    }
  }, [latest?.hrv]);

  return (
    <>
      {/* Hero */}
      <View style={[styles.heroCard, {
        backgroundColor: colors.surfaceRaised,
        borderColor: isDark ? colors.borderStrong : colors.border,
        shadowColor: isDark ? '#000' : colors.shadowBase,
        shadowOpacity: isDark ? 0.45 : 0.07,
      }]}>
        <View style={[styles.accentBar, { backgroundColor: colors.heartRed }]} />
        <View style={styles.heroRow}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.heartRate}</Text>
            <View style={styles.heroValueRow}>
              <Text style={[styles.heroValue, { color: colors.foreground }]}>{latest?.bpm ?? '—'}</Text>
              <Text style={[styles.heroUnit, { color: colors.muted }]}>bpm</Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.heroRight}>
            <Text style={[styles.heroLabel, { color: colors.muted }]}>{d.hrv}</Text>
            <View style={styles.heroValueRow}>
              <Text style={[styles.heroValueMed, { color: colors.foreground }]}>{latest?.hrv ?? '—'}</Text>
              <Text style={[styles.heroUnit, { color: colors.muted }]}>ms</Text>
            </View>
            {hrvZone && (
              <View style={[styles.zoneBadge, { backgroundColor: hrvZone.color + '20', borderColor: hrvZone.color + '40' }]}>
                <Text style={[styles.zoneText, { color: hrvZone.color }]}>{hrvZone.label}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* BPM Chart */}
      <View style={[styles.chartCard, {
        backgroundColor: colors.surfaceRaised,
        borderColor: isDark ? colors.borderStrong : colors.border,
        shadowColor: isDark ? '#000' : colors.shadowBase,
        shadowOpacity: isDark ? 0.45 : 0.06,
      }]}>
        <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.hrChart}</Text>
        <WindowChips hrWindow={hrWindow} setHrWindow={setHrWindow} accentColor={colors.heartRed} />
        {selectedBucket ? (
          <Pressable
            onPress={() => setSelectedBucketIndex(null)}
            style={{
              marginBottom: 8,
              backgroundColor: colors.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.heartRed + '40',
              paddingVertical: 8,
              paddingHorizontal: 12,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heartRed }}>
              {formatBucketRange(selectedBucket.blockStart, selectedBucket.blockEnd)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>avg {selectedBucket.avgBpm} bpm</Text>
            <Text style={{ fontSize: 12, color: colors.bpGreen }}>min {selectedBucket.minBpm}</Text>
            <Text style={{ fontSize: 12, color: colors.bpAmber }}>max {selectedBucket.maxBpm}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {selectedBucket.sampleCount} sample{selectedBucket.sampleCount !== 1 ? 's' : ''}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>{d.tapToDismiss}</Text>
          </Pressable>
        ) : (
          records.length > 0 && (
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
              {d.tapDataPointDetail}
            </Text>
          )
        )}
        <LineChart
          data={bpmData}
          width={CHART_WIDTH - 32}
          height={140}
          color={colors.heartRed}
          strokeWidth={2}
          showGradient
          showDots={records.length <= 12}
          selectedIndex={selectedBucketIndex ?? undefined}
          onPointPress={(i) => setSelectedBucketIndex(i === selectedBucketIndex ? null : i)}
        />
        <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, textAlign: 'right' }}>
          {HR_WINDOW_SHORT[hrWindow]}
        </Text>
      </View>

      {/* HRV Trend Chart */}
      {records.some((r) => (r.hrv ?? 0) > 0) && (
        <View style={[styles.chartCard, {
          backgroundColor: colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.45 : 0.06,
        }]}>
          <View style={styles.chartTitleRow}>
            <Text style={[styles.chartTitle, { color: colors.foreground, marginBottom: 0 }]}>{d.hrvChart}</Text>
            <View style={styles.hrvRangeRow}>
              {([7, 30, 90, 'all'] as (7 | 30 | 90 | 'all')[]).map((r) => (
                <View
                  key={String(r)}
                  style={[styles.hrvRangeChip, {
                    backgroundColor: hrvRange === r ? colors.accent + '25' : 'transparent',
                    borderColor: hrvRange === r ? colors.accent + '60' : colors.border,
                  }]}
                >
                  <Text
                    style={[styles.hrvRangeText, { color: hrvRange === r ? colors.accent : colors.muted }]}
                    onPress={() => handleHrvRangeChange(r)}
                  >
                    {r === 'all' ? 'All' : `${r}d`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ marginTop: 44 }} {...hrvSwipePanResponder.panHandlers}>
            <HrvTrendChart
              records={records}
              width={CHART_WIDTH - 32}
              height={130}
              rangeDays={hrvRange}
              selectedIndex={selectedHrvIndex}
              onBarPress={handleHrvBarPress}
              referenceLineColor={colors.bpGreen}
              personalTargetMs={hrvTarget}
            />
          </View>
          <View style={[styles.hrvLegend, { marginTop: 8 }]}>
            <View style={styles.hrvLegendItem}>
              <View style={[styles.hrvLegendLine, { backgroundColor: '#FFFFFF', opacity: 0.7 }]} />
              <Text style={[styles.hrvLegendText, { color: colors.muted }]}>7-day avg</Text>
            </View>
            <View style={styles.hrvLegendItem}>
              <View style={[styles.hrvLegendLine, { backgroundColor: colors.bpGreen, opacity: 0.5 }]} />
              <Text style={[styles.hrvLegendText, { color: colors.muted }]}>35 ms threshold</Text>
            </View>
            <View style={styles.hrvLegendItem}>
              <View style={[styles.hrvLegendLine, { backgroundColor: '#00F5FF', opacity: 0.8 }]} />
              <Text style={[styles.hrvLegendText, { color: colors.muted }]}>Target ({hrvTarget} ms)</Text>
            </View>
          </View>
          {filteredHrvCount > 1 && (
            <Text style={[styles.hrvSwipeHint, { color: colors.muted }]}>
              Swipe left / right to step through readings
            </Text>
          )}
          <View style={[styles.hrvLegend, { marginTop: 4 }]}>
            {[
              { color: '#10B981', label: '≥50 ms Excellent' },
              { color: '#6366F1', label: '≥35 ms Good' },
              { color: '#F59E0B', label: '≥20 ms Fair' },
              { color: '#EF4444', label: '<20 ms Low' },
            ].map((z) => (
              <View key={z.label} style={styles.hrvLegendItem}>
                <View style={[styles.hrvLegendDot, { backgroundColor: z.color }]} />
                <Text style={[styles.hrvLegendText, { color: colors.muted }]}>{z.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {[
          { label: d.avgBpm, value: `${avgBpm}`, color: colors.heartRed },
          { label: d.avgHrv, value: `${avgHrv} ms`, color: colors.accent },
          { label: d.minBpm, value: `${minBpm}`, color: colors.bpGreen },
          { label: d.maxBpm, value: `${maxBpm}`, color: colors.bpAmber },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCell, {
            backgroundColor: isDark ? colors.surface : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
            shadowColor: isDark ? '#000' : colors.shadowBase,
            shadowOpacity: isDark ? 0.35 : 0.05,
          }]}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Adjusted HRV Reference */}
      {adjustedHRV && (
        <View style={[styles.infoCard, {
          backgroundColor:
            adjustedHRV.status === 'low' ? colors.error + (isDark ? '22' : '10') :
            adjustedHRV.status === 'high' ? colors.bpGreen + (isDark ? '22' : '10') :
            colors.accent + (isDark ? '22' : '10'),
          borderColor:
            adjustedHRV.status === 'low' ? colors.error + (isDark ? '40' : '25') :
            adjustedHRV.status === 'high' ? colors.bpGreen + (isDark ? '40' : '25') :
            colors.accent + (isDark ? '40' : '25'),
        }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>
            Age-Adjusted HRV · {adjustedHRV.referenceLabel}
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>{adjustedHRV.label}</Text>
        </View>
      )}

      {/* HRV Info */}
      <View style={[styles.infoCard, {
        backgroundColor: colors.accent + (isDark ? '22' : '10'),
        borderColor: colors.accent + (isDark ? '40' : '25'),
      }]}>
        <Text style={[styles.infoTitle, { color: colors.foreground }]}>{d.aboutHrv}</Text>
        <Text style={[styles.infoText, { color: colors.muted }]}>{d.aboutHrvText}</Text>
      </View>
    </>
  );
}

// ─── Resting HR tab content ───────────────────────────────────────────────────
function RestingHRTab() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);
  const router = useRouter();
  const { state } = useHealth();

  // Local hrWindow state — loaded from AsyncStorage, persisted on change
  const [hrWindow, setHrWindowState] = useState<HrWindowSize>('4h');
  useEffect(() => {
    loadHrWindow().then(setHrWindowState).catch(() => {});
  }, []);
  const setHrWindow = (w: HrWindowSize) => {
    setHrWindowState(w);
    saveHrWindow(w).catch(() => {});
  };

  // Compute aggregated resting HR records locally from state.data
  const aggregatedRestingHrRecords = useMemo(() => {
    const raw = state.data?.restingHRSamples ?? [];
    const buckets = aggregateHrTo4HourBuckets(raw, hrWindow);
    return aggregatedToPulseRecords(buckets);
  }, [state.data?.restingHRSamples, hrWindow]);

  const records = aggregatedRestingHrRecords;
  const latestRestingHrRecord = useMemo(() =>
    getLatestHrRecord(state.data?.restingHRSamples ?? []),
  [state.data?.restingHRSamples]);
  const latest = latestRestingHrRecord ?? (records.length ? records[records.length - 1] : null);

  const bpmData = useMemo(() => normalizeData(records.map((r) => r.bpm)), [records]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 7-day average computed from raw daily samples
  const sevenDayAvg = useMemo(() => {
    const raw = state.data?.restingHRSamples ?? [];
    if (raw.length === 0) return null;
    const sorted = [...raw].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const window7 = sorted.slice(-7);
    return Math.round(window7.reduce((s, r) => s + r.bpm, 0) / window7.length);
  }, [state.data?.restingHRSamples]);

  const latestBpm = latest?.bpm ?? null;
  const trendDelta = latestBpm != null && sevenDayAvg != null ? latestBpm - sevenDayAvg : null;
  const trendArrow = trendDelta == null ? null : trendDelta > 2 ? '↑' : trendDelta < -2 ? '↓' : null;
  const trendColor = trendArrow === '↑' ? colors.error : colors.bpGreen;

  const avgBpm = records.length
    ? Math.round(records.reduce((s, r) => s + r.bpm, 0) / records.length)
    : 0;
  const minBpm = records.length ? Math.min(...records.map((r) => r.bpm)) : 0;
  const maxBpm = records.length ? Math.max(...records.map((r) => r.bpm)) : 0;

  function getRestingZone(bpm: number): { label: string; color: string } {
    if (bpm < 60) return { label: 'Athletic', color: colors.bpGreen };
    if (bpm <= 100) return { label: 'Normal', color: colors.primary };
    return { label: 'Elevated', color: colors.error };
  }
  const zone = latestBpm != null ? getRestingZone(latestBpm) : null;

  // Age/sex-adjusted reference — mirrors adjustedHRV in ActiveHRTab
  const [adjustedRestingHR, setAdjustedRestingHR] = useState<{
    label: string;
    status: 'athletic' | 'normal' | 'elevated';
    referenceLabel: string;
  } | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    loadUserProfile().then((p) => {
      setProfileIncomplete(p.age == null || p.sex == null);
    }).catch(() => {});
    if (latestBpm != null) {
      getAdjustedRestingHRStatus(latestBpm)
        .then(setAdjustedRestingHR)
        .catch(() => {});
    }
  }, [latestBpm]);

  return (
    <>
      {/* Hero */}
      <View style={[styles.heroCard, {
        backgroundColor: colors.surfaceRaised,
        borderColor: isDark ? colors.borderStrong : colors.border,
        shadowColor: isDark ? '#000' : colors.shadowBase,
        shadowOpacity: isDark ? 0.45 : 0.07,
      }]}>
        <View style={[styles.accentBar, { backgroundColor: '#8B5CF6' }]} />
        <View style={styles.heroRow}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroLabel, { color: colors.muted }]}>RESTING HR</Text>
            <View style={styles.heroValueRow}>
              <Text style={[styles.heroValue, { color: colors.foreground }]}>{latestBpm ?? '—'}</Text>
              <Text style={[styles.heroUnit, { color: colors.muted }]}>bpm</Text>
              {trendArrow && (
                <Text style={{ fontSize: 22, fontWeight: '700', color: trendColor, marginBottom: 4 }}>
                  {trendArrow}
                </Text>
              )}
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.heroRight}>
            <Text style={[styles.heroLabel, { color: colors.muted }]}>7-DAY AVG</Text>
            <View style={styles.heroValueRow}>
              <Text style={[styles.heroValueMed, { color: colors.foreground }]}>
                {sevenDayAvg ?? '—'}
              </Text>
              {sevenDayAvg != null && (
                <Text style={[styles.heroUnit, { color: colors.muted }]}>bpm</Text>
              )}
            </View>
            {zone && (
              <View style={[styles.zoneBadge, { backgroundColor: zone.color + '20', borderColor: zone.color + '40' }]}>
                <Text style={[styles.zoneText, { color: zone.color }]}>{zone.label}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Resting HR chart */}
      <View style={[styles.chartCard, {
        backgroundColor: colors.surfaceRaised,
        borderColor: isDark ? colors.borderStrong : colors.border,
        shadowColor: isDark ? '#000' : colors.shadowBase,
        shadowOpacity: isDark ? 0.45 : 0.06,
      }]}>
        <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.restingHRTrend}</Text>
        <WindowChips hrWindow={hrWindow} setHrWindow={setHrWindow} accentColor="#8B5CF6" />
        {sevenDayAvg != null && (
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
            {d.sevenDayAvgBpm}{' '}
            <Text style={{ fontWeight: '700', color: '#8B5CF6' }}>{sevenDayAvg} bpm</Text>
          </Text>
        )}
        {records.length > 0 ? (
          <LineChart
            data={bpmData}
            width={CHART_WIDTH - 32}
            height={140}
            color="#8B5CF6"
            showDots={records.length <= 30}
            showGradient
            onPointPress={(i) => setSelectedIndex((prev) => (prev === i ? null : i))}
            selectedIndex={selectedIndex ?? undefined}
          />
        ) : (
          <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              No resting HR data — sync Apple Health to populate
            </Text>
          </View>
        )}
        {selectedIndex != null && records[selectedIndex] && (
          <Pressable
            onPress={() => setSelectedIndex(null)}
            style={{
              marginTop: 8,
              backgroundColor: colors.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#8B5CF640',
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.foreground }}>
              {new Date(records[selectedIndex].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
              {records[selectedIndex].bpm} bpm resting
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1, opacity: 0.6 }}>Tap to dismiss</Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, textAlign: 'right' }}>
          {HR_WINDOW_SHORT[hrWindow]}
        </Text>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {[
          { label: d.avgLabel, value: `${avgBpm}`, color: '#8B5CF6' },
          { label: d.sevenDayAvgBpm ?? '7-Day Avg', value: sevenDayAvg != null ? `${sevenDayAvg}` : '—', color: colors.primary },
          { label: 'Min', value: `${minBpm}`, color: colors.bpGreen },
          { label: 'Max', value: `${maxBpm}`, color: colors.bpAmber },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCell, {
            backgroundColor: isDark ? colors.surface : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
            shadowColor: isDark ? '#000' : colors.shadowBase,
            shadowOpacity: isDark ? 0.35 : 0.05,
          }]}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Age-adjusted reference card — mirrors Adjusted HRV card on Active HR tab */}
      {adjustedRestingHR && (
        <View style={[styles.infoCard, {
          backgroundColor:
            adjustedRestingHR.status === 'elevated' ? colors.error + (isDark ? '22' : '10') :
            adjustedRestingHR.status === 'athletic' ? colors.bpGreen + (isDark ? '22' : '10') :
            '#8B5CF6' + (isDark ? '22' : '10'),
          borderColor:
            adjustedRestingHR.status === 'elevated' ? colors.error + (isDark ? '40' : '25') :
            adjustedRestingHR.status === 'athletic' ? colors.bpGreen + (isDark ? '40' : '25') :
            '#8B5CF6' + (isDark ? '40' : '25'),
        }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>
            {d.ageAdjustedRestingHR} · {adjustedRestingHR.referenceLabel}
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>{adjustedRestingHR.label}</Text>
          {/* Profile-incomplete nudge */}
          {profileIncomplete && (
            <Pressable
              onPress={() => router.push('/settings/profile' as never)}
              style={({ pressed }) => ({
                marginTop: 10,
                paddingVertical: 7,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: isDark ? '#F59E0B22' : '#FEF3C7',
                borderWidth: 1,
                borderColor: isDark ? '#F59E0B40' : '#FDE68A',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 13, color: '#D97706' }}>{'⚠️'}</Text>
              <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 15 }}>
                Profile incomplete — ranges may be generic.{' '}
                <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Set age &amp; sex in Profile</Text>
              </Text>
              <Text style={{ fontSize: 11, color: '#D97706' }}>›</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Info card */}
      <View style={[styles.infoCard, {
        backgroundColor: '#8B5CF6' + (isDark ? '22' : '10'),
        borderColor: '#8B5CF6' + (isDark ? '40' : '25'),
      }]}>
        <Text style={[styles.infoTitle, { color: colors.foreground }]}>{d.aboutRestingHR}</Text>
        <Text style={[styles.infoText, { color: colors.muted }]}>
          {d.restingHRDesc}
        </Text>
      </View>
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
function PulseDetailInner() {
  const colors = useColors();
  const { state } = useHealth();
  const lang = useLang();
  const d = ((detailStrings as unknown as Record<string, typeof detailStrings.en>)[lang] ?? detailStrings.en);

  const [activeTab, setActiveTab] = useState<HrTab>('active');

  const totalActiveRecords = useMemo(() => {
    const pulseCount = (state.data?.pulse ?? []).length;
    const manualCount = (state.data?.vitalSigns ?? []).filter((r) => r.heartRate !== undefined).length;
    return pulseCount + manualCount;
  }, [state.data?.pulse, state.data?.vitalSigns]);

  const restingCount = state.data?.restingHRSamples?.length ?? 0;

  const subtitle = activeTab === 'active'
    ? `${totalActiveRecords} ${d.readings}`
    : `${restingCount} day${restingCount !== 1 ? 's' : ''}`;

  return (
    <ScreenContainer containerClassName="bg-background">
      <DetailHeader
        title={d.pulseTitle}
        subtitle={subtitle}
        accentColor={colors.heartRed}
      />
      <SectionTabBar
        tabs={[
          { key: 'active',  label: d.activeHRTab,  icon: '💓' },
          { key: 'resting', label: d.restingHRTab, icon: '🌙' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        accentColor={colors.heartRed}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {activeTab === 'active' ? <ActiveHRTab /> : <RestingHRTab />}
        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  heroCard: {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  heroLeft: { flex: 1 },
  heroRight: { flex: 1, paddingLeft: 16 },
  divider: { width: 1, height: 60, marginHorizontal: 8 },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroValue: { fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  heroValueMed: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  heroUnit: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  zoneBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, marginTop: 6,
  },
  zoneText: { fontSize: 11, fontWeight: '700' },
  chartCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chartTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCell: {
    flex: 1, minWidth: '45%', borderRadius: 12, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3, elevation: 1,
  },
  statValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: '500' },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6, marginBottom: 12 },
  infoTitle: { fontSize: 13, fontWeight: '700' },
  infoText: { fontSize: 12, lineHeight: 18 },
  hrvLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  hrvLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hrvLegendDot: { width: 8, height: 8, borderRadius: 4 },
  hrvLegendLine: { width: 16, height: 2, borderRadius: 1 },
  hrvLegendText: { fontSize: 10, fontWeight: '600' },
  hrvRefNote: { fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  hrvRangeRow: { flexDirection: 'row', gap: 4 },
  hrvRangeChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  hrvRangeText: { fontSize: 11, fontWeight: '700' },
  hrvSwipeHint: { fontSize: 10, textAlign: 'center', marginTop: 4, opacity: 0.6 },
});

export default withDetailErrorBoundary(PulseDetailInner, 'Pulse & HRV');
