/**
 * Storage Optimization Screen
 *
 * Shows the current storage health score, per-category breakdown,
 * EKG tally vs retained strips, sleep summary status, and a button
 * to run the full optimization pass.
 *
 * Route: /settings/storage-optimization
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import {
  loadStorageMetrics,
  runAndPersistOptimization,
  loadLastOptimizedAt,
} from '@/lib/storage/storage-optimizer-store';
import type { StorageMetrics, StorageHealthScore } from '@/lib/storage/storage-optimizer';

// ─── Health score helpers ─────────────────────────────────────────────────────

const SCORE_META: Record<StorageHealthScore, { label: string; color: string; icon: 'checkmark.circle.fill' | 'exclamationmark.triangle.fill' | 'xmark.circle.fill' }> = {
  excellent:  { label: 'Excellent',   color: '#22C55E', icon: 'checkmark.circle.fill' },
  good:       { label: 'Good',        color: '#3B82F6', icon: 'checkmark.circle.fill' },
  moderate:   { label: 'Moderate',    color: '#F59E0B', icon: 'exclamationmark.triangle.fill' },
  high_usage: { label: 'High Usage',  color: '#EF4444', icon: 'xmark.circle.fill' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  colors,
}: {
  category: StorageMetrics['categories'][number];
  colors: ReturnType<typeof useColors>;
}) {
  const saved = category.estimatedSavedBytes;
  return (
    <View style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
      <View style={styles.categoryLeft}>
        <Text style={[styles.categoryName, { color: colors.foreground }]}>
          {category.label}
        </Text>
        <Text style={[styles.categorySub, { color: colors.muted }]}>
          {category.detailRecords} detail · {category.summaryRecords} summaries
        </Text>
      </View>
      <View style={styles.categoryRight}>
        {saved > 0 ? (
          <Text style={[styles.savedBadge, { color: '#22C55E' }]}>
            −{formatBytes(saved)}
          </Text>
        ) : (
          <Text style={[styles.savedBadge, { color: colors.muted }]}>—</Text>
        )}
        <View style={[
          styles.optimizedDot,
          { backgroundColor: category.isOptimized ? '#22C55E' : colors.border },
        ]} />
      </View>
    </View>
  );
}

// ─── EKG tally section ────────────────────────────────────────────────────────

function EKGTallySection({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [data, setData] = useState<import('@/lib/health/ekg-tally-store').EKGTallyWithDailyStats | null>(null);

  useEffect(() => {
    import('@/lib/health/ekg-tally-store')
      .then(({ getEKGTallyWithDailyStats }) => getEKGTallyWithDailyStats().then(setData))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const { tally, routineStripsToday, dailyRoutineLimit, routineStripsRemaining } = data;

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>EKG Recordings</Text>
      <View style={styles.tallyGrid}>
        <View style={styles.tallyCell}>
          <Text style={[styles.tallyValue, { color: colors.foreground }]}>{tally.total}</Text>
          <Text style={[styles.tallyLabel, { color: colors.muted }]}>Total tracked</Text>
        </View>
        <View style={styles.tallyCell}>
          <Text style={[styles.tallyValue, { color: '#EF4444' }]}>{tally.atrialFibrillation}</Text>
          <Text style={[styles.tallyLabel, { color: colors.muted }]}>Atrial Fibrillation (always kept)</Text>
        </View>
        <View style={styles.tallyCell}>
          <Text style={[styles.tallyValue, { color: '#22C55E' }]}>{tally.sinusRhythm}</Text>
          <Text style={[styles.tallyLabel, { color: colors.muted }]}>Sinus rhythm</Text>
        </View>
        <View style={styles.tallyCell}>
          <Text style={[styles.tallyValue, { color: '#F59E0B' }]}>{tally.inconclusive}</Text>
          <Text style={[styles.tallyLabel, { color: colors.muted }]}>Inconclusive</Text>
        </View>
      </View>
      {/* Daily routine strip budget */}
      <View style={[styles.budgetRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.budgetLabel, { color: colors.foreground }]}>Today's routine strips</Text>
        <Text style={[styles.budgetValue, {
          color: routineStripsToday >= dailyRoutineLimit ? '#EF4444' : '#22C55E',
        }]}>
          {routineStripsToday} / {dailyRoutineLimit}
        </Text>
      </View>
      {routineStripsRemaining === 0 ? (
        <Text style={[styles.tallyNote, { color: '#B45309' }]}>
          Daily routine strip limit reached. New routine readings are being summarized in the tally only.
          Atrial Fibrillation recordings are always retained.
        </Text>
      ) : (
        <Text style={[styles.tallyNote, { color: colors.muted }]}>
          {routineStripsRemaining} routine strip{routineStripsRemaining !== 1 ? 's' : ''} remaining today.
          Routine strips beyond the daily limit are counted in the tally but not stored as full waveforms.
        </Text>
      )}
    </View>
  );
}

// ─── Sleep summary section ────────────────────────────────────────────────────

function SleepSummarySection({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [stats, setStats] = useState<{
    detailCount: number; summaryCount: number; lastConsolidatedAt: string | null;
  } | null>(null);

  useEffect(() => {
    import('@/lib/health/sleep-summary')
      .then(({ getSleepSummaryStats }) => getSleepSummaryStats().then(setStats))
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sleep Records</Text>
      <View style={styles.tallyGrid}>
        <View style={styles.tallyCell}>
          <Text style={[styles.tallyValue, { color: colors.foreground }]}>{stats.detailCount}</Text>
          <Text style={[styles.tallyLabel, { color: colors.muted }]}>Detail records</Text>
        </View>
        <View style={styles.tallyCell}>
          <Text style={[styles.tallyValue, { color: '#3B82F6' }]}>{stats.summaryCount}</Text>
          <Text style={[styles.tallyLabel, { color: colors.muted }]}>3-day summaries</Text>
        </View>
      </View>
      {stats.lastConsolidatedAt && (
        <Text style={[styles.tallyNote, { color: colors.muted }]}>
          Last consolidated: {formatDate(stats.lastConsolidatedAt)}
        </Text>
      )}
      <Text style={[styles.tallyNote, { color: colors.muted }]}>
        Records older than 30 days are consolidated into 3-day summaries to reduce storage.
        The most recent 30 days are always kept as full detail records.
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function StorageOptimizationScreen() {
  const colors = useColors();
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [m, lr] = await Promise.all([
        loadStorageMetrics(),
        loadLastOptimizedAt(),
      ]);
      setMetrics(m);
      setLastRun(lr);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRunOptimization = useCallback(async () => {
    Alert.alert(
      'Run Storage Optimization',
      'This will consolidate old health records into compact summaries and enforce record limits. Your data in Apple Health is not affected. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Optimize',
          onPress: async () => {
            setRunning(true);
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            try {
              await runAndPersistOptimization();
              await loadData();
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              Alert.alert('Optimization Complete', 'Your health data has been optimized successfully.');
            } catch (err) {
              Alert.alert('Error', 'Optimization failed. Please try again.');
            } finally {
              setRunning(false);
            }
          },
        },
      ],
    );
  }, [loadData]);

  const score = metrics?.healthScore ?? 'excellent';
  const scoreMeta = SCORE_META[score];

  return (
    <ScreenContainer>
      <DetailHeader title="Storage Optimization" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Health Score Card */}
          <View style={[styles.scoreCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.scoreRow}>
              <IconSymbol name={scoreMeta.icon} size={32} color={scoreMeta.color} />
              <View style={styles.scoreText}>
                <Text style={[styles.scoreLabel, { color: scoreMeta.color }]}>
                  {scoreMeta.label}
                </Text>
                <Text style={[styles.scoreSub, { color: colors.muted }]}>
                  Storage health score
                </Text>
              </View>
            </View>
            {metrics && (
              <View style={styles.scoreStats}>
                <View style={styles.scoreStat}>
                  <Text style={[styles.scoreStatValue, { color: colors.foreground }]}>
                    {formatBytes(metrics.estimatedTotalBytes)}
                  </Text>
                  <Text style={[styles.scoreStatLabel, { color: colors.muted }]}>Estimated size</Text>
                </View>
                <View style={styles.scoreStat}>
                  <Text style={[styles.scoreStatValue, { color: '#22C55E' }]}>
                    {formatBytes(metrics.estimatedSavedBytes)}
                  </Text>
                  <Text style={[styles.scoreStatLabel, { color: colors.muted }]}>Saved so far</Text>
                </View>
              </View>
            )}
            <Text style={[styles.lastRun, { color: colors.muted }]}>
              Last optimized: {formatDate(lastRun)}
            </Text>
          </View>

          {/* EKG Tally */}
          <EKGTallySection colors={colors} />

          {/* Sleep Summary */}
          <SleepSummarySection colors={colors} />

          {/* Per-category breakdown */}
          {metrics && metrics.categories.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Category Breakdown</Text>
              {metrics.categories.map((cat) => (
                <CategoryRow key={cat.name} category={cat} colors={colors} />
              ))}
            </View>
          )}

          {/* Run button */}
          <TouchableOpacity
            onPress={handleRunOptimization}
            disabled={running}
            activeOpacity={0.8}
            style={[styles.runButton, { backgroundColor: running ? colors.border : colors.primary }]}
          >
            {running ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={[styles.runButtonText, { color: colors.background }]}>
                Run Optimization
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            Optimization consolidates records older than the detail window into compact summaries.
            No data is deleted from Apple Health. Archived doctor-report data is never removed.
          </Text>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  scoreCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreText: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scoreSub: {
    fontSize: 13,
    marginTop: 2,
  },
  scoreStats: {
    flexDirection: 'row',
    gap: 24,
  },
  scoreStat: {
    gap: 2,
  },
  scoreStatValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  scoreStatLabel: {
    fontSize: 12,
  },
  lastRun: {
    fontSize: 12,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryLeft: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
  },
  categorySub: {
    fontSize: 12,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savedBadge: {
    fontSize: 13,
    fontWeight: '600',
  },
  optimizedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tallyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tallyCell: {
    minWidth: '40%',
    gap: 2,
  },
  tallyValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tallyLabel: {
    fontSize: 12,
  },
  tallyNote: {
    fontSize: 12,
    lineHeight: 17,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  budgetLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  budgetValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  runButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runButtonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
