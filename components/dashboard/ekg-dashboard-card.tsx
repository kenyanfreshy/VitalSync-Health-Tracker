/**
 * EKGDashboardCard — Full-width card showing EKG recording counts by classification.
 *
 * Before tap: Shows AFib, Sinus, and Inconclusive recording counts as tappable rows.
 * Tapping a row navigates to /detail/ekg with that classification pre-selected as filter.
 * Tapping the card header navigates to /detail/ekg (all recordings).
 *
 * Visual: Uses GlassCard (same 3D liquid-glass shell as the glucose card).
 * Header: Animated scrolling PQRST sparkline + "Last: X days ago" timestamp.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEKGPage } from '@/lib/health/ekg-store';
import { useFocusEffect } from 'expo-router';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  type EKGDistribution,
} from '@/lib/health/ekg-store';
import { getEKGTally } from '@/lib/health/ekg-tally-store';
import { useDashboardStrings } from '@/hooks/use-dashboard-strings';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { GlassCard } from '@/components/glass-card';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, ClipPath, Rect } from 'react-native-svg';

const AFIB_COLOR         = '#EF4444';
const SINUS_COLOR        = '#22C55E';
const INCONCLUSIVE_COLOR = '#F59E0B';

// EKG accent: red (AFib dominant) in both modes
const ACCENT_LIGHT = '#EF4444';
const ACCENT_DARK  = '#F87171';

// ── Sparkline constants ────────────────────────────────────────────────────────
// Two PQRST complexes tiled side-by-side in a 144×20 viewBox.
// The animation translates the SVG left by 72 units (one complex width) over 2 s,
// then loops — creating the illusion of continuous scrolling.
const TILE_W = 72;
const SVG_H  = 20;
// One PQRST complex: baseline → P → Q → R spike → S → T → baseline
const COMPLEX =
  'M0,14 L8,14 L11,12 L14,14 L16,16 L18,2 L20,20 L22,14 L26,11 L30,14 L40,14 ' +
  'L43,12 L46,14 L48,16 L50,2 L52,20 L54,14 L58,11 L62,14 L72,14';
// Three complexes tiled so the scroll loop is seamless
const EKG_TILED_PATH =
  COMPLEX + ' ' +
  COMPLEX.replace(/(-?\d+\.?\d*),/g, (_, x) => `${parseFloat(x) + TILE_W},`) + ' ' +
  COMPLEX.replace(/(-?\d+\.?\d*),/g, (_, x) => `${parseFloat(x) + TILE_W * 2},`);

// ── Relative-time helper ───────────────────────────────────────────────────────
function relativeDate(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)    return 'just now';
  if (diffMin < 60)   return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)     return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1)    return 'yesterday';
  if (diffD < 7)      return `${diffD} days ago`;
  const diffW = Math.floor(diffD / 7);
  if (diffW === 1)    return '1 week ago';
  if (diffW < 5)      return `${diffW} weeks ago`;
  const diffMo = Math.floor(diffD / 30);
  return `${diffMo} month${diffMo !== 1 ? 's' : ''} ago`;
}

// ── Animated scrolling sparkline ──────────────────────────────────────────────
function EKGSparkline({ accent }: { accent: string }) {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -TILE_W,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [translateX]);

  return (
    // Clip to exactly one tile width so the path never overflows
    <View style={{ width: TILE_W, height: SVG_H, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateX }] }}>
        {/* Render 3 tile-widths so the loop is seamless */}
        <Svg width={TILE_W * 3} height={SVG_H} viewBox={`0 0 ${TILE_W * 3} ${SVG_H}`}>
          <Defs>
            <SvgLinearGradient id="ekgScrollGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"   stopColor={accent} stopOpacity={0.25} />
              <Stop offset="0.3" stopColor={accent} stopOpacity={0.85} />
              <Stop offset="0.7" stopColor={accent} stopOpacity={0.85} />
              <Stop offset="1"   stopColor={accent} stopOpacity={0.25} />
            </SvgLinearGradient>
          </Defs>
          <Path
            d={EKG_TILED_PATH}
            stroke="url(#ekgScrollGrad)"
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function EKGDashboardCard() {
  const ds = useDashboardStrings();
  const colors = useColors();
  const { requirePremium, PremiumGateSheet } = usePremiumGate();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;

  // Tally-based distribution — reflects ALL recordings ever fetched, not just
  // the strips retained in the cache after the daily routine limit is applied.
  // This means the count never decreases after a sync.
  const [fullDist, setFullDist] = useState<EKGDistribution | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tallyDist = await getEKGTally();
      setFullDist(tallyDist);
    } catch {
      setFullDist(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload every time the Dashboard tab comes into focus so the count stays
  // in sync after the user visits the EKG detail screen and new records are cached.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dist: EKGDistribution = fullDist ?? {
    total: 0, sinusRhythm: 0, atrialFibrillation: 0, inconclusive: 0, unclassified: 0, latestDate: null,
  };
  const totalDist = dist;
  const hasData = dist.total > 0;

  // "Last: X days ago" label derived from the most recent record's startDate
  const lastLabel: string | null = dist.latestDate ? relativeDate(dist.latestDate) : null;

  // Live dot: show when most recent recording is within 24 hours
  const isLive: boolean = dist.latestDate
    ? (Date.now() - new Date(dist.latestDate).getTime()) < 24 * 60 * 60 * 1000
    : false;

  // Pulsing opacity for the live dot
  const liveDotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLive) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(liveDotOpacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isLive, liveDotOpacity]);

  // Sync Now: trigger a fresh HealthKit fetch without navigating away
  const [syncing, setSyncing] = useState(false);
  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSyncing(true);
    try {
      await fetchEKGPage(undefined, undefined, true);
      await load();
    } catch { /* silent */ } finally {
      setSyncing(false);
    }
  }, [syncing, load]);

  function navigate(filter?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (filter) {
      router.push((`/detail/ekg?filter=${encodeURIComponent(filter)}`) as any);
    } else {
      router.push('/detail/ekg' as any);
    }
  }

  const rows = [
    {
      key: 'AtrialFibrillation',
      label: ds.ekgAtrialFibrillation ?? 'AFib',
      count: dist.atrialFibrillation,
      color: AFIB_COLOR,
    },
    {
      key: 'SinusRhythm',
      label: ds.ekgSinusRhythm ?? 'Sinus',
      count: dist.sinusRhythm,
      color: SINUS_COLOR,
    },
    {
      key: 'Inconclusive',
      label: ds.ekgInconclusive ?? 'Inconclusive',
      count: dist.inconclusive,
      color: INCONCLUSIVE_COLOR,
    },
  ];

  const headerBorderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  return (
    <>
      <GlassCard
        accentColor={accent}
        noPadding
        style={styles.cardShell}
      >
        {/* ── Header ── */}
        <Pressable
          style={({ pressed }) => [
            styles.header,
            { borderBottomColor: headerBorderColor },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigate()}
          accessibilityRole="button"
          accessibilityLabel="EKG recordings"
        >
          <View style={styles.headerLeft}>
            {/* Icon badge with red glow ring */}
            <View style={[styles.iconWrap, { backgroundColor: accent + '22', borderWidth: 1, borderColor: accent + '55' }]}>
              <IconSymbol name="waveform.path.ecg" size={16} color={accent} />
            </View>

            {/* Title + animated sparkline + last-recorded timestamp */}
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {ds.ekgCard ?? 'EKG'}
              </Text>
              {/* Animated scrolling PQRST waveform */}
              <EKGSparkline accent={accent} />
              {/* Last-recorded timestamp + pulsing live dot */}
              {!loading && lastLabel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {isLive && (
                    <Animated.View
                      style={[
                        styles.liveDot,
                        { backgroundColor: accent, opacity: liveDotOpacity },
                      ]}
                    />
                  )}
                  <Text style={[styles.lastLabel, { color: colors.muted }]}>
                    {ds.ekgLast ?? 'Last:'} {lastLabel}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.headerRight}>
            {/* Sync Now shortcut */}
            <Pressable
              onPress={(e) => { (e as any).stopPropagation?.(); handleSyncNow(); }}
              hitSlop={8}
              accessibilityLabel="Sync EKG now"
              accessibilityRole="button"
              style={({ pressed }) => [styles.syncBtn, { opacity: pressed || syncing ? 0.5 : 1 }]}
            >
              <Text style={[styles.syncBtnText, { color: accent }]}>
                {syncing ? '…' : '↻'}
              </Text>
            </Pressable>
            {!loading && hasData && (
              <Text style={[styles.totalBadge, { color: colors.muted }]}>
                {totalDist.total}{' '}
                {totalDist.total === 1
                  ? (ds.ekgRecording ?? 'recording')
                  : (ds.ekgRecordings ?? 'recordings')}
              </Text>
            )}
            <IconSymbol name="chevron.right" size={13} color={colors.muted} />
          </View>
        </Pressable>

        {/* ── Count rows ── */}
        {loading ? (
          <View style={styles.loadingRow}>
            <Text style={[styles.loadingText, { color: colors.muted }]}>…</Text>
          </View>
        ) : !hasData ? (
          <View style={styles.emptyRow}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {ds.ekgNoRecordings ?? 'No EKG recordings yet'}
            </Text>
          </View>
        ) : (
          <View style={styles.rowsContainer}>
            {rows.map((row, idx) => (
              <Pressable
                key={row.key}
                style={({ pressed }) => [
                  styles.countRow,
                  idx < rows.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
                  },
                  pressed && { backgroundColor: row.color + '12' },
                ]}
                onPress={(e) => {
                  (e as any).stopPropagation?.();
                  navigate(row.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}: ${row.count} recorded`}
              >
                <View style={[styles.dot, { backgroundColor: row.color }]} />
                <Text style={[styles.rowLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {row.label}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    { backgroundColor: row.color + '18', borderColor: row.color + '40' },
                  ]}
                >
                  <Text style={[styles.countText, { color: row.color }]}>{row.count}</Text>
                </View>
                <Text style={[styles.recordedLabel, { color: colors.muted }]}>
                  {ds.ekgRecorded ?? 'recorded'}
                </Text>
                <IconSymbol name="chevron.right" size={12} color={colors.muted} style={{ marginLeft: 2 }} />
              </Pressable>
            ))}
          </View>
        )}
      </GlassCard>
      {PremiumGateSheet}
    </>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  lastLabel: {
    fontSize: 10,
    fontWeight: '400',
    marginTop: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 1,
  },
  syncBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  syncBtnText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  totalBadge: {
    fontSize: 11,
    fontWeight: '500',
  },
  rowsContainer: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
  },
  recordedLabel: {
    fontSize: 11,
    fontWeight: '400',
  },
  loadingRow: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
  },
  emptyRow: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
