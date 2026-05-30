/**
 * Diet Streak Records Screen
 *
 * Shows the user's all-time best streak for every diet protocol they have
 * ever tried, sorted by best streak descending.  The active protocol is
 * highlighted.  Each row also shows which milestone badges have been earned.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { logStrings } from '@/lib/i18n';
import { useHealth } from '@/lib/health/health-context';
import { DIET_TYPE_OPTIONS, DietType } from '@/lib/health/diet-type';
import {
  loadStreakRecords,
  resetStreakRecord,
  type StreakRecords,
} from '@/lib/health/diet-streak-records';
import { STREAK_MILESTONES } from '@/lib/health/diet-streak-milestones';

const MILESTONE_BADGES: { days: number; icon: string; label: string }[] = [
  { days: 7,  icon: '🥉', label: '7d'  },
  { days: 14, icon: '🥈', label: '14d' },
  { days: 30, icon: '🥇', label: '30d' },
];

export default function StreakRecordsScreen() {
  const colors = useColors();
  const router = useRouter();
  const lang = useLang();
  const l = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const { dietType: activeDietType } = useHealth();

  const [records, setRecords] = useState<StreakRecords>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await loadStreakRecords();
    setRecords(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Build rows: all protocols that have at least 1 day recorded, plus the
  // active protocol even if it has no record yet.
  const rows = DIET_TYPE_OPTIONS
    .map((opt) => ({
      ...opt,
      best: records[opt.value as DietType] ?? 0,
      isActive: opt.value === activeDietType,
    }))
    .filter((r) => r.best > 0 || r.isActive)
    .sort((a, b) => {
      // Active protocol always first; then sort by best streak descending
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return b.best - a.best;
    });

  const totalDays = Object.values(records).reduce((s, v) => s + (v ?? 0), 0);
  const protocolsAttempted = Object.keys(records).length;

  function handleLongPress(dietType: DietType, label: string, best: number) {
    if (best === 0) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Alert.alert(
      `Reset ${label} Record?`,
      `Clear the ${best}-day best streak for ${label}?`,
      [
        { text: l.streakResetCancel, style: 'cancel' },
        {
          text: l.streakResetConfirm,
          style: 'destructive',
          onPress: async () => {
            await resetStreakRecord(dietType);
            await load();
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ],
    );
  }

  const s = styles(colors);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.backBtn}
          activeOpacity={0.7}
        >
          <IconSymbol name="chevron.right" size={18} color={colors.foreground} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Personal Records</Text>
          <Text style={[s.headerSub, { color: colors.muted }]}>All-time best streak per protocol</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary banner */}
        <View style={[s.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: colors.foreground }]}>{protocolsAttempted}</Text>
            <Text style={[s.summaryLabel, { color: colors.muted }]}>Protocols tried</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: colors.foreground }]}>{totalDays}</Text>
            <Text style={[s.summaryLabel, { color: colors.muted }]}>Total streak days</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: colors.foreground }]}>
              {Math.max(0, ...Object.values(records).map(v => v ?? 0))}
            </Text>
            <Text style={[s.summaryLabel, { color: colors.muted }]}>All-time best</Text>
          </View>
        </View>

        {/* Protocol rows */}
        {rows.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={[s.emptyIcon]}>🏆</Text>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No records yet</Text>
            <Text style={[s.emptyBody, { color: colors.muted }]}>
              Start logging meals against your active protocol to build a streak!
            </Text>
          </View>
        ) : (
          rows.map((row) => {
            const isTopRecord = row.best === Math.max(...rows.map(r => r.best)) && row.best > 0;
            return (
              <TouchableOpacity
                key={row.value}
                onLongPress={() => handleLongPress(row.value as DietType, row.label, row.best)}
                activeOpacity={0.85}
                style={[
                  s.row,
                  {
                    backgroundColor: colors.surface,
                    borderColor: row.isActive ? row.color + '60' : colors.border,
                    borderWidth: row.isActive ? 1.5 : 1,
                  },
                ]}
                accessibilityLabel={`${row.label}: ${row.best} day best streak. Long press to reset.`}
              >
                {/* Left: emoji + name */}
                <View style={[s.rowIconWrap, { backgroundColor: row.color + '18' }]}>
                  <Text style={s.rowEmoji}>{row.emoji}</Text>
                </View>
                <View style={s.rowBody}>
                  <View style={s.rowTopLine}>
                    <Text style={[s.rowLabel, { color: row.isActive ? row.color : colors.foreground }]}>
                      {row.label}
                    </Text>
                    {row.isActive && (
                      <View style={[s.activePill, { backgroundColor: row.color + '20', borderColor: row.color + '50' }]}>
                        <Text style={[s.activePillText, { color: row.color }]}>Active</Text>
                      </View>
                    )}
                    {isTopRecord && row.best > 0 && (
                      <View style={[s.topPill, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B50' }]}>
                        <Text style={[s.topPillText]}>👑 Best</Text>
                      </View>
                    )}
                  </View>

                  {/* Milestone badges */}
                  <View style={s.badgeRow}>
                    {MILESTONE_BADGES.map((b) => {
                      const earned = row.best >= b.days;
                      return (
                        <View
                          key={b.days}
                          style={[
                            s.badge,
                            earned
                              ? { backgroundColor: row.color + '20', borderColor: row.color + '60' }
                              : { backgroundColor: colors.border + '30', borderColor: colors.border },
                          ]}
                        >
                          <Text style={[s.badgeIcon, { opacity: earned ? 1 : 0.3 }]}>{b.icon}</Text>
                          <Text style={[s.badgeDays, { color: earned ? row.color : colors.muted }]}>
                            {b.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Right: streak count */}
                <View style={s.rowRight}>
                  {row.best > 0 ? (
                    <>
                      <Text style={[s.streakNum, { color: row.isActive ? row.color : colors.foreground }]}>
                        {row.best}
                      </Text>
                      <Text style={[s.streakUnit, { color: colors.muted }]}>days</Text>
                    </>
                  ) : (
                    <Text style={[s.streakUnit, { color: colors.muted }]}>—</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={[s.hint, { color: colors.muted }]}>
          Long-press any row to reset that protocol&apos;s record.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function styles(_colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      gap: 12,
    },
    backBtn: {
      padding: 4,
    },
    headerCenter: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    headerSub: {
      fontSize: 12,
      marginTop: 1,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingBottom: 40,
      gap: 10,
    },
    summaryCard: {
      flexDirection: 'row',
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 16,
      marginBottom: 6,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    summaryLabel: {
      fontSize: 10,
      marginTop: 2,
      textAlign: 'center',
    },
    summaryDivider: {
      width: 1,
      marginVertical: 4,
    },
    emptyState: {
      alignItems: 'center',
      paddingTop: 48,
      paddingHorizontal: 32,
      gap: 8,
    },
    emptyIcon: {
      fontSize: 48,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    emptyBody: {
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      padding: 12,
      gap: 12,
    },
    rowIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowEmoji: {
      fontSize: 22,
    },
    rowBody: {
      flex: 1,
      gap: 6,
    },
    rowTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    rowLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    activePill: {
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    activePillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    topPill: {
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    topPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#F59E0B',
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 2,
      gap: 3,
    },
    badgeIcon: {
      fontSize: 11,
    },
    badgeDays: {
      fontSize: 10,
      fontWeight: '600',
    },
    rowRight: {
      alignItems: 'center',
      minWidth: 40,
    },
    streakNum: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -1,
    },
    streakUnit: {
      fontSize: 10,
      marginTop: -2,
    },
    hint: {
      fontSize: 11,
      textAlign: 'center',
      marginTop: 8,
      fontStyle: 'italic',
    },
  });
}
