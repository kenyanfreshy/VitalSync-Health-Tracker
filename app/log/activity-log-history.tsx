/**
 * Activity Log History Screen
 *
 * Lists all persisted ActivityLogRecord entries logged via the
 * Clinical Input Exercise-Calorie Logic prompt.
 * Displays modality icon, duration, RPE, EPOC, MET, and caloric bonus.
 * Supports long-press delete with confirmation alert.
 */

import React, { useCallback, useState } from 'react';
import { SYSTEM_FONT_MONO as MONO } from '@/lib/_core/fonts';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { logStrings } from '@/lib/i18n';
import {
  useActivityLog,
  activityLogToCSV,
  type ActivityLogRecord,
  type ActivityModality,
} from '@/lib/health/activity-log';

// ─── Modality config ──────────────────────────────────────────────────────────

function getModalityConfig(l: { aerobic?: string; anaerobic?: string; hiit?: string }): Record<
  ActivityModality,
  { icon: string; label: string; color: string }
> {
  return {
    aerobic: { icon: '🏃', label: l.aerobic ?? 'AEROBIC', color: '#22C55E' },
    anaerobic: { icon: '🏋️', label: l.anaerobic ?? 'ANAEROBIC', color: '#EF4444' },
    hiit: { icon: '⚡', label: l.hiit ?? 'HIIT', color: '#F59E0B' },
  };
}

const FUEL_LABEL: Record<string, string> = {
  lipid_dominant: 'Lipid-Dominant',
  carb_dominant: 'Carb-Dominant',
  mixed: 'Mixed',
};

// ─── RPE colour scale ─────────────────────────────────────────────────────────

function rpeColor(rpe: number): string {
  if (rpe <= 3) return '#22C55E';
  if (rpe <= 6) return '#F59E0B';
  return '#EF4444';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RecordRowProps {
  record: ActivityLogRecord;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}

function RecordRow({ record, onDelete, colors }: RecordRowProps) {
  const _rowLang = useLang();
  const l = (logStrings as unknown as Record<string, typeof logStrings.en>)[_rowLang] ?? logStrings.en;
  const MODALITY_CONFIG = getModalityConfig(l);
  const cfg = MODALITY_CONFIG[record.activityModality] ?? MODALITY_CONFIG.aerobic;
  const s = rowStyles(colors);

  function handleLongPress() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      (l.deleteEntry ?? 'Delete Entry'),
      `Remove this ${cfg.label} session from the telemetry log?`,
      [
        { text: l.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: l.delete ?? 'Delete',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onDelete(record.id);
          },
        },
      ]
    );
  }

  return (
    <Pressable
      onLongPress={handleLongPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
    >
      {/* ── Modality icon ── */}
      <View style={[s.iconWrap, { backgroundColor: cfg.color + '18' }]}>
        <Text style={s.icon}>{cfg.icon}</Text>
      </View>

      {/* ── Main content ── */}
      <View style={s.body}>
        {/* Header row */}
        <View style={s.headerRow}>
          <View style={[s.modalityBadge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[s.modalityText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={s.timestamp}>{formatTimestamp(record.timestamp)}</Text>
        </View>

        {/* Primary metrics row */}
        <View style={s.metricsRow}>
          <MetricChip label={l.durationLabel ?? "DURATION"} value={`${record.durationMin} min`} color={cfg.color} colors={colors} />
          <MetricChip label="RPE" value={`${record.rpe}/10`} color={rpeColor(record.rpe)} colors={colors} />
          <MetricChip label="MET" value={`${record.activityMET.toFixed(1)}`} color={colors.primary} colors={colors} />
        </View>

        {/* EPOC / caloric row */}
        <View style={s.epocRow}>
          <View style={s.epocBlock}>
            <Text style={s.epocLabel}>EPOC</Text>
            <Text style={s.epocValue}>{Math.round(record.epocKcal)} kcal</Text>
          </View>
          <View style={s.epocDivider} />
          <View style={s.epocBlock}>
            <Text style={s.epocLabel}>CALORIC BONUS</Text>
            <Text style={[s.epocValue, { color: '#22C55E' }]}>+{Math.round(record.exerciseCaloricBonus)} kcal</Text>
          </View>
          {record.fuelSource && (
            <>
              <View style={s.epocDivider} />
              <View style={s.epocBlock}>
                <Text style={s.epocLabel}>FUEL</Text>
                <Text style={s.epocValue}>{FUEL_LABEL[record.fuelSource] ?? record.fuelSource}</Text>
              </View>
            </>
          )}
        </View>

        {/* Delete hint */}
        <Text style={s.deleteHint}>Hold to delete</Text>
      </View>
    </Pressable>
  );
}

interface MetricChipProps {
  label: string;
  value: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}

function MetricChip({ label, value, color, colors }: MetricChipProps) {
  const s = chipStyles(colors);
  return (
    <View style={s.chip}>
      <Text style={s.chipLabel}>{label}</Text>
      <Text style={[s.chipValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ colors }: { colors: ReturnType<typeof useColors> }) {
  const s = emptyStyles(colors);
  return (
    <View style={s.container}>
      <Text style={s.icon}>⚡</Text>
      <Text style={s.title}>[NO_TELEMETRY_RECORDS]</Text>
      <Text style={s.body}>
        Exercise sessions logged via the Activity Log{'\n'}
        Exercise-Calorie Logic prompt will appear here.
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ActivityLogHistoryScreen() {
  const _alhLang = useLang();
  const l = (logStrings as unknown as Record<string, typeof logStrings.en>)[_alhLang] ?? logStrings.en;
  const MODALITY_CONFIG = getModalityConfig(l);
  const colors = useColors();
  const router = useRouter();
  const { records, isLoading, deleteRecord, refresh } = useActivityLog();
  const [isExporting, setIsExporting] = useState(false);

  const s = styles(colors);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteRecord(id);
    },
    [deleteRecord]
  );

  async function handleExportCSV() {
    if (records.length === 0) {
      Alert.alert('No Data', 'No activity records to export.');
      return;
    }
    setIsExporting(true);
    try {
      const csv = activityLogToCSV(records);
      await Share.share({
        title: 'VitalSync_ActivityLog.csv',
        message: csv,
      });
    } catch (_unused) {
      // User cancelled share — no action needed
    } finally {
      setIsExporting(false);
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: ActivityLogRecord }) => (
      <RecordRow record={item} onDelete={handleDelete} colors={colors} />
    ),
    [handleDelete, colors]
  );

  const keyExtractor = useCallback((item: ActivityLogRecord) => item.id, []);

  return (
    <ScreenContainer>
      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
        >
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={20} color={colors.primary} />
          <Text style={s.backText}>Log</Text>
        </Pressable>

        <View style={s.titleBlock}>
          <Text style={s.title}>[EXERCISE_TELEMETRY]</Text>
          <Text style={s.subtitle}>Activity Log History</Text>
        </View>

        <Pressable
          onPress={handleExportCSV}
          style={({ pressed }) => [s.exportBtn, pressed && { opacity: 0.7 }]}
          disabled={isExporting || records.length === 0}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.exportText, records.length === 0 && { opacity: 0.4 }]}>
              ⬆ CSV
            </Text>
          )}
        </Pressable>
      </View>

      {/* ── Summary bar ── */}
      {records.length > 0 && (
        <View style={s.summaryBar}>
          <SummaryChip
            label={l.sessions ?? "SESSIONS"}
            value={String(records.length)}
            color={colors.primary}
            colors={colors}
          />
          <SummaryChip
            label={l.totalEpoc ?? "TOTAL EPOC"}
            value={`${Math.round(records.reduce((s, r) => s + r.epocKcal, 0))} kcal`}
            color="#22C55E"
            colors={colors}
          />
          <SummaryChip
            label={l.avgRpe ?? "AVG RPE"}
            value={(records.reduce((s, r) => s + r.rpe, 0) / records.length).toFixed(1)}
            color={rpeColor(records.reduce((s, r) => s + r.rpe, 0) / records.length)}
            colors={colors}
          />
        </View>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>LOADING_TELEMETRY...</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            s.list,
            records.length === 0 && s.listEmpty,
          ]}
          ListEmptyComponent={<EmptyState colors={colors} />}
          onRefresh={refresh}
          refreshing={isLoading}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

// ─── Summary chip ─────────────────────────────────────────────────────────────

function SummaryChip({
  label,
  value,
  color,
  colors,
}: {
  label: string;
  value: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 10,
        paddingVertical: 8,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 9, fontFamily: MONO, color: colors.muted, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color, marginTop: 2, fontFamily: MONO }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingRight: 8,
    },
    backText: {
      fontSize: 15,
      color: c.primary,
      fontWeight: '600',
    },
    titleBlock: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      fontSize: 12,
      fontFamily: MONO,
      color: '#4ADE80',
      letterSpacing: 0.5,
      fontWeight: '700',
    },
    subtitle: {
      fontSize: 15,
      fontWeight: '800',
      color: c.foreground,
      marginTop: 2,
    },
    exportBtn: {
      paddingLeft: 8,
      paddingVertical: 4,
    },
    exportText: {
      fontSize: 13,
      fontFamily: MONO,
      color: c.primary,
      fontWeight: '700',
    },
    summaryBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    list: {
      padding: 16,
      paddingBottom: 40,
    },
    listEmpty: {
      flex: 1,
      justifyContent: 'center',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 12,
      fontFamily: MONO,
      color: c.muted,
      letterSpacing: 0.5,
    },
  });

const rowStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      backgroundColor: c.surfaceRaised,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      alignSelf: 'flex-start',
    },
    icon: { fontSize: 24 },
    body: { flex: 1 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    modalityBadge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    modalityText: {
      fontSize: 10,
      fontWeight: '800',
      fontFamily: MONO,
      letterSpacing: 0.8,
    },
    timestamp: {
      fontSize: 11,
      color: c.muted,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
    },
    epocRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 6,
    },
    epocBlock: {
      flex: 1,
      alignItems: 'center',
    },
    epocLabel: {
      fontSize: 9,
      fontFamily: MONO,
      color: c.muted,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    epocValue: {
      fontSize: 13,
      fontWeight: '700',
      color: c.foreground,
      fontFamily: MONO,
    },
    epocDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.border,
      marginHorizontal: 4,
    },
    deleteHint: {
      fontSize: 10,
      color: c.muted,
      textAlign: 'right',
      opacity: 0.6,
    },
  });

const chipStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    chip: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 8,
      paddingVertical: 5,
      paddingHorizontal: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipLabel: {
      fontSize: 8,
      fontFamily: MONO,
      color: c.muted,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    chipValue: {
      fontSize: 13,
      fontWeight: '700',
      fontFamily: MONO,
    },
  });

const emptyStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
    },
    icon: {
      fontSize: 48,
      marginBottom: 16,
    },
    title: {
      fontSize: 13,
      fontFamily: MONO,
      color: '#4ADE80',
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    body: {
      fontSize: 14,
      color: c.muted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
