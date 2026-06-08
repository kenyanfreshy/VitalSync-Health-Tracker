/**
 * Vaccine Schedule Reference Screen
 *
 * Read-only view of the CDC/WHO recommended vaccine schedule.
 * Users can filter by age group or category, and see which vaccines
 * they have already received (gap detection against their records).
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useLang } from '@/hooks/use-lang';
import { vaccineScheduleStrings } from '@/lib/i18n';
import { useHealth } from '@/lib/health/health-context';
import {
  VACCINE_SCHEDULE,
  AGE_GROUP_LABELS,
  CATEGORY_LABELS,
  findScheduleGaps,
  type AgeGroup,
  type VaccineScheduleEntry,
} from '@/lib/health/vaccine-schedule';

// ─── Filter chip ─────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.chip,
        { borderColor: active ? colors.primary : colors.border },
        active && { backgroundColor: colors.primary },
      ]}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Text style={[s.chipText, { color: active ? '#fff' : colors.muted }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Category chip with mini progress ───────────────────────────────────────

function CategoryChip({
  label,
  active,
  onPress,
  colors,
  receivedInCat,
  totalInCat,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  receivedInCat: number;
  totalInCat: number;
}) {
  const pct = totalInCat > 0 ? receivedInCat / totalInCat : 0;
  const fillColor = active ? '#fff' : (pct === 1 ? '#16A34A' : colors.primary);
  const trackColor = active ? 'rgba(255,255,255,0.3)' : colors.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.catChip,
        { borderColor: active ? colors.primary : colors.border },
        active && { backgroundColor: colors.primary },
      ]}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Text style={[s.catChipLabel, { color: active ? '#fff' : colors.foreground }]}>
        {label}
      </Text>
      <Text style={[s.catChipCount, { color: active ? 'rgba(255,255,255,0.85)' : colors.muted }]}>
        {receivedInCat}/{totalInCat}
      </Text>
      {/* Mini fill bar */}
      <View style={[s.catChipTrack, { backgroundColor: trackColor }]}>
        <View
          style={[
            s.catChipFill,
            { backgroundColor: fillColor, width: `${Math.round(pct * 100)}%` as any },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Schedule entry card ──────────────────────────────────────────────────────

function ScheduleCard({
  entry,
  received,
  colors,
  onMarkReceived,
}: {
  entry: VaccineScheduleEntry;
  received: boolean;
  colors: ReturnType<typeof useColors>;
  onMarkReceived?: (entry: VaccineScheduleEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Local optimistic state so the pill animates immediately without waiting for context re-render
  const [localReceived, setLocalReceived] = useState(received);

  // Sync if parent prop changes (e.g. undo or data reload)
  useEffect(() => { setLocalReceived(received); }, [received]);

  // Animated values for the pill transition
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const pillScale  = useRef(new Animated.Value(1)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const animateToReceived = useCallback(() => {
    // 1. Fade + shrink the current pill out
    Animated.parallel([
      Animated.timing(pillOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(pillScale,   { toValue: 0.7, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setLocalReceived(true);
      // 2. Fade + spring the new pill in
      pillOpacity.setValue(0);
      pillScale.setValue(0.7);
      checkScale.setValue(0);
      Animated.parallel([
        Animated.timing(pillOpacity,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(pillScale,    { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180 }),
        Animated.spring(checkScale,   { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 200 }),
      ]).start();
    });
  }, [pillOpacity, pillScale, checkScale]);

  const handleMarkReceived = useCallback(() => {
    if (!onMarkReceived) return;
    animateToReceived();
    onMarkReceived(entry);
  }, [onMarkReceived, entry, animateToReceived]);

  const isReceived = localReceived;

  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      style={[
        s.card,
        {
          backgroundColor: colors.surface,
          borderColor: isReceived ? '#22C55E' : colors.border,
          borderLeftWidth: 4,
          borderLeftColor: isReceived ? '#22C55E' : colors.border,
        },
      ]}
      activeOpacity={0.8}
    >
      {/* Header row */}
      <View style={s.cardHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Animated.Text style={{ fontSize: 16, transform: [{ scale: isReceived ? checkScale : pillScale }] }}>
              {isReceived ? '✅' : '💉'}
            </Animated.Text>
            <Text style={[s.cardName, { color: colors.foreground }]} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={[s.cardAbbr, { color: colors.muted }]}>({entry.abbr})</Text>
          </View>
          <Text style={[s.cardProtects, { color: colors.muted }]} numberOfLines={1}>
            Protects against: {entry.protects}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {/* Animated status pill */}
          <Animated.View
            style={[
              s.sourceBadge,
              { backgroundColor: isReceived ? '#DCFCE7' : colors.background },
              { opacity: pillOpacity, transform: [{ scale: pillScale }] },
            ]}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: isReceived ? '#16A34A' : colors.muted }}>
              {isReceived ? 'RECEIVED ✓' : entry.source}
            </Text>
          </Animated.View>
          <Text style={[s.dosesBadge, { color: colors.muted }]}>
            {entry.primaryDoses} dose{entry.primaryDoses > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Expanded details */}
      {expanded && (
          <View style={[s.expandedBody, { borderTopColor: colors.border }]}>
          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: colors.muted }]}>Recommended at</Text>
            <Text style={[s.detailValue, { color: colors.foreground, flex: 1 }]}>
              {entry.ageGroups.map(g => AGE_GROUP_LABELS[g]).join(', ')}
            </Text>
          </View>
          {entry.boosterNote && (
            <View style={s.detailRow}>
              <Text style={[s.detailLabel, { color: colors.muted }]}>Booster</Text>
              <Text style={[s.detailValue, { color: colors.foreground, flex: 1 }]}>
                {entry.boosterNote}
              </Text>
            </View>
          )}
          {entry.notes && (
            <View style={[s.detailRow, { alignItems: 'flex-start' }]}>
              <Text style={[s.detailLabel, { color: colors.muted }]}>Notes</Text>
              <Text style={[s.detailValue, { color: colors.muted, flex: 1 }]}>
                {entry.notes}
              </Text>
            </View>
          )}
          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: colors.muted }]}>Source</Text>
            <Text style={[s.detailValue, { color: colors.muted }]}>{entry.source}</Text>
          </View>
          {/* Mark Received quick-action — hidden once locally marked */}
          {!isReceived && onMarkReceived && (
            <TouchableOpacity
              onPress={handleMarkReceived}
              style={[s.markReceivedBtn, { backgroundColor: '#22C55E' + '18', borderColor: '#22C55E' + '40' }]}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 14, marginRight: 6 }}>✅</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#16A34A' }}>Mark as Received</Text>
            </TouchableOpacity>
          )}
          {/* Confirmation message shown after marking */}
          {isReceived && localReceived !== received && (
            <Animated.View style={{ opacity: pillOpacity, alignItems: 'center', paddingTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600' }}>Saved to your records ✓</Text>
            </Animated.View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'gaps' | 'received';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as VaccineScheduleEntry['category'][];

export default function VaccineScheduleScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const vss = (vaccineScheduleStrings as unknown as Record<string, typeof vaccineScheduleStrings.en>)[lang] ?? vaccineScheduleStrings.en;
  const { state } = useHealth();

  const administeredNames = useMemo(
    () => (state.data?.immunizations ?? []).map(r => r.vaccineName),
    [state.data?.immunizations],
  );

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedCategory, setSelectedCategory] = useState<VaccineScheduleEntry['category'] | 'all'>('all');

  // Ref for the main FlatList so we can scroll to the first gap
  const listRef = useRef<FlatList<VaccineScheduleEntry>>(null);

  const gaps = useMemo(
    () => findScheduleGaps(VACCINE_SCHEDULE, administeredNames),
    [administeredNames],
  );

  const filteredEntries = useMemo(() => {
    let entries = VACCINE_SCHEDULE;

    if (selectedCategory !== 'all') {
      entries = entries.filter(e => e.category === selectedCategory);
    }

    if (filterMode === 'gaps') {
      const gapIds = new Set(gaps.map(g => g.id));
      entries = entries.filter(e => gapIds.has(e.id));
    } else if (filterMode === 'received') {
      const gapIds = new Set(gaps.map(g => g.id));
      entries = entries.filter(e => !gapIds.has(e.id));
    }

    return entries;
  }, [filterMode, selectedCategory, gaps]);

  const { addImmunization } = useHealth();

  const handleMarkReceived = useCallback((entry: VaccineScheduleEntry) => {
    Alert.alert(
      vss.markAsReceived,
      `${vss.logVaccineConfirm.replace('{name}', entry.name).replace('{abbr}', entry.abbr)}`,
      [
        { text: vss.cancel, style: 'cancel' },
        {
          text: vss.markReceived,
          onPress: async () => {
            try {
              await addImmunization({
                id: `sched-${entry.id}-${Date.now()}`,
                vaccineName: entry.name,
                dateAdministered: new Date().toISOString(),
                doseNumber: 1,
                seriesTotal: entry.primaryDoses,
                notes: `${vss.loggedFromSchedule} (${entry.source})`,
                createdAt: new Date().toISOString(),
              });
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (_unused) {
              Alert.alert(vss.error, vss.couldNotSave);
            }
          },
        },
      ],
    );
  }, [addImmunization]);

  const gapIds = useMemo(() => new Set(gaps.map(g => g.id)), [gaps]);

  const receivedCount = VACCINE_SCHEDULE.length - gaps.length;
  const gapCount = gaps.length;
  const totalCount = VACCINE_SCHEDULE.length;

  // Per-category received/total counts for the mini progress chips
  const categoryStats = useMemo(() => {
    const stats: Record<string, { received: number; total: number }> = { all: { received: receivedCount, total: totalCount } };
    for (const cat of CATEGORIES) {
      const catEntries = VACCINE_SCHEDULE.filter(e => e.category === cat);
      const catReceived = catEntries.filter(e => !gapIds.has(e.id)).length;
      stats[cat] = { received: catReceived, total: catEntries.length };
    }
    return stats;
  }, [gapIds, receivedCount, totalCount]);
  const progressPct = totalCount > 0 ? receivedCount / totalCount : 0;

  // Animated width for the progress bar fill
  const progressAnim = useRef(new Animated.Value(progressPct)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPct,
      duration: 500,
      useNativeDriver: false, // width animation requires JS driver
    }).start();
  }, [progressPct, progressAnim]);

  // Animated scale for the gap counter badge — bounces each time gapCount decrements
  const gapBadgeScale = useRef(new Animated.Value(1)).current;
  const prevGapCount = useRef(gapCount);
  useEffect(() => {
    if (gapCount < prevGapCount.current) {
      // Bounce animation: shrink then spring back
      Animated.sequence([
        Animated.timing(gapBadgeScale, { toValue: 0.7, duration: 80, useNativeDriver: true }),
        Animated.spring(gapBadgeScale, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
      ]).start();
    }
    prevGapCount.current = gapCount;
  }, [gapCount, gapBadgeScale]);

  // Tap handler for the gap badge: switch to Gaps filter and scroll to first gap
  const handleGapBadgePress = useCallback(() => {
    if (gapCount === 0) return; // nothing to do when all received
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // 1. Switch filter to Gaps
    setFilterMode('gaps');
    setSelectedCategory('all');
    // 2. Scroll to index 0 after a short delay so the list re-renders first
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: 0, animated: true, viewOffset: 8 });
    }, 120);
  }, [gapCount]);

  // Header component for the FlatList — avoids nested ScrollView freeze
  const listHeader = useMemo(() => (
    <View>
      {/* Source note */}
      <View style={[s.sourceNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>
          📋 Based on CDC & WHO 2024 recommended immunization schedules. Tap any row to expand details. Always consult your healthcare provider for personalized advice.
        </Text>
      </View>

      {/* Filter mode chips */}
      <View style={s.chipRow}>
        {(['all', 'gaps', 'received'] as FilterMode[]).map(mode => (
          <Chip
            key={mode}
            label={mode === 'all' ? vss.allVaccines : mode === 'gaps' ? `${vss.gaps} (${gapCount})` : `${vss.received} (${receivedCount})`}
            active={filterMode === mode}
            onPress={() => setFilterMode(mode)}
            colors={colors}
          />
        ))}
      </View>

      {/* Category filter chips with mini per-category progress */}
      <FlatList
        horizontal
        data={['all' as const, ...CATEGORIES]}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryRow}
        renderItem={({ item: cat }) => {
          const stats = categoryStats[cat] ?? { received: 0, total: 0 };
          return (
            <CategoryChip
              label={cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
              active={selectedCategory === cat}
              onPress={() => setSelectedCategory(cat)}
              colors={colors}
              receivedInCat={stats.received}
              totalInCat={stats.total}
            />
          );
        }}
      />
    </View>
  ), [colors, filterMode, gapCount, receivedCount, selectedCategory, categoryStats]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/log/immunizations' as any)}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol name="arrow.left" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Vaccine Schedule</Text>
        {/* Live gap counter badge — tappable deep-link to Gaps filter */}
        <TouchableOpacity
          onPress={handleGapBadgePress}
          activeOpacity={gapCount === 0 ? 1 : 0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View
            style={[
              s.gapBadge,
              gapCount === 0
                ? { backgroundColor: '#16A34A' }
                : { backgroundColor: gapCount > 5 ? '#EF4444' : '#F59E0B' },
              { transform: [{ scale: gapBadgeScale }] },
            ]}
          >
            {gapCount === 0 ? (
              <Text style={s.gapBadgeText}>✓ Done</Text>
            ) : (
              <Text style={s.gapBadgeText}>{gapCount} gap{gapCount !== 1 ? 's' : ''} ›</Text>
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Immunisation progress bar */}
      <View style={[s.progressBarTrack, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            s.progressBarFill,
            {
              backgroundColor: progressPct === 1 ? '#16A34A' : colors.primary,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      {/* Completion label */}
      <View style={s.progressLabelRow}>
        <Text style={[s.progressLabel, { color: colors.muted }]}>
          {receivedCount} of {totalCount} vaccines received
        </Text>
        <Text style={[s.progressLabel, { color: progressPct === 1 ? '#16A34A' : colors.primary, fontWeight: '700' }]}>
          {Math.round(progressPct * 100)}%
        </Text>
      </View>

      {/* Summary strip */}
      <View style={[s.summaryStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: '#22C55E' }]}>{receivedCount}</Text>
          <Text style={[s.summaryLabel, { color: colors.muted }]}>Received</Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: gapCount > 0 ? '#EF4444' : colors.foreground }]}>{gapCount}</Text>
          <Text style={[s.summaryLabel, { color: colors.muted }]}>Gaps</Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: colors.foreground }]}>{VACCINE_SCHEDULE.length}</Text>
          <Text style={[s.summaryLabel, { color: colors.muted }]}>Total</Text>
        </View>
      </View>

      {/* Main list — FlatList for virtualized rendering, no nested ScrollView */}
      <FlatList
        ref={listRef}
        data={filteredEntries}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={listHeader}
        onScrollToIndexFailed={() => {
          // Fallback: scroll to top if index is not yet rendered
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
        renderItem={({ item: entry }) => (
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <ScheduleCard
              entry={entry}
              received={!gapIds.has(entry.id)}
              colors={colors}
              onMarkReceived={handleMarkReceived}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>
              {filterMode === 'gaps' ? vss.noGapsFound : vss.noVaccinesInFilter}
            </Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>
              {filterMode === 'gaps'
                ? vss.noGapsDesc
                : vss.tryDifferentFilter}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backText: { fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  summaryStrip: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, marginTop: 2 },
  summaryDivider: { width: 0.5, marginVertical: 4 },
  sourceNote: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, gap: 10 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardAbbr: { fontSize: 12, fontWeight: '500' },
  cardProtects: { fontSize: 12, marginTop: 2 },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dosesBadge: { fontSize: 11 },
  expandedBody: {
    borderTopWidth: 0.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
  },
  detailLabel: { fontSize: 12, width: 90, flexShrink: 0 },
  detailValue: { fontSize: 12, lineHeight: 18 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  markReceivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  gapBadge: {
    minWidth: 60,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  progressBarTrack: {
    height: 4,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  catChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 7,
    marginRight: 8,
    minWidth: 72,
    alignItems: 'center',
    overflow: 'hidden',
  },
  catChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 1,
  },
  catChipCount: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  catChipTrack: {
    height: 3,
    width: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  catChipFill: {
    height: 3,
    borderRadius: 2,
  },
});
