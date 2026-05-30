/**
 * /settings/crash-logs — Dedicated Crash Log Viewer screen.
 *
 * Displays all locally persisted crash/error log entries with:
 *   - Type badge (colour-coded by severity)
 *   - Timestamp
 *   - Error message
 *   - Expandable stack trace
 *   - Expandable component stack
 *
 * Header actions: Copy All · Share All · Clear All
 * All data comes from AsyncStorage via crash-logger.ts — no network calls.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useColors, useLang } from '@/hooks';
import { crashStrings } from '@/lib/i18n';
import {
  clearCrashLogs,
  copyCrashReport,
  readCrashLogs,
  shareCrashReport,
  type CrashEntry,
} from '@/lib/crash-logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<CrashEntry['type'], string> = {
  RenderError: '#EF4444',
  UnhandledRejection: '#F97316',
  NativeError: '#DC2626',
  Warning: '#F59E0B',
  Manual: '#6366F1',
};

// TYPE_LABELS are built dynamically inside CrashLogsScreen using crashStrings

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (_unused) {
    return iso;
  }
}

// ─── LogRow ───────────────────────────────────────────────────────────────────

interface LogRowProps {
  entry: CrashEntry;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
}

function LogRow({ entry, isDark, colors }: LogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const lang = useLang();
  const cs = (crashStrings as unknown as Record<string, typeof crashStrings['en']>)[lang] ?? crashStrings.en;
  const TYPE_LABELS: Record<CrashEntry['type'], string> = {
    RenderError: cs.renderError,
    UnhandledRejection: cs.unhandledRejection,
    NativeError: cs.nativeError,
    Warning: cs.warning,
    Manual: cs.manual,
  };
  const typeColor = TYPE_COLORS[entry.type] ?? '#6B7280';

  return (
    <Pressable
      onPress={() => setExpanded(e => !e)}
      style={[
        styles.logRow,
        {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderColor: isDark ? '#1E293B' : '#E2E8F0',
          borderLeftColor: typeColor,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${TYPE_LABELS[entry.type]}: ${entry.message}. Tap to ${expanded ? 'collapse' : 'expand'}.`}
    >
      {/* Header row */}
      <View style={styles.logRowHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '20', borderColor: typeColor + '60' }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>
            {TYPE_LABELS[entry.type]}
          </Text>
        </View>
        <Text style={[styles.timestamp, { color: colors.muted }]}>
          {formatTimestamp(entry.timestamp)}
        </Text>
        <Text style={[styles.expandChevron, { color: colors.muted }]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </View>

      {/* Message */}
      <Text
        style={[styles.logMessage, { color: colors.foreground }]}
        numberOfLines={expanded ? undefined : 2}
      >
        {entry.message}
      </Text>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedSection}>
          {entry.appVersion && (
            <Text style={[styles.metaLine, { color: colors.muted }]}>
              App version: {entry.appVersion}
            </Text>
          )}
          {entry.stack ? (
            <View style={[styles.stackBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <Text style={[styles.stackLabel, { color: colors.muted }]}>Stack trace</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.stackText, { color: isDark ? '#94A3B8' : '#475569' }]}>
                  {entry.stack}
                </Text>
              </ScrollView>
            </View>
          ) : null}
          {entry.componentStack ? (
            <View style={[styles.stackBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', marginTop: 8 }]}>
              <Text style={[styles.stackLabel, { color: colors.muted }]}>Component stack</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.stackText, { color: isDark ? '#94A3B8' : '#475569' }]}>
                  {entry.componentStack}
                </Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CrashLogsScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const cs = (crashStrings as unknown as Record<string, typeof crashStrings['en']>)[lang] ?? crashStrings.en;
  const insets = useSafeAreaInsets();
  const isDark = (colors.background as string).startsWith('#0') || colors.background === '#151718';

  const [logs, setLogs] = useState<CrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const entries = await readCrashLogs();
    setLogs(entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleCopy = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopying(true);
    const ok = await copyCrashReport(logs, appVersion);
    setCopying(false);
    if (ok) {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2500);
    }
  }, [logs, appVersion]);

  const handleShare = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSharing(true);
    await shareCrashReport(logs, appVersion);
    setSharing(false);
  }, [logs, appVersion]);

  const handleClear = useCallback(() => {
    if (logs.length === 0) return;
    Alert.alert(
      cs.clearTitle,
      cs.clearMsg,
      [
        { text: cs.cancel, style: 'cancel' },
        {
          text: cs.clearConfirm,
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await clearCrashLogs();
            setLogs([]);
          },
        },
      ],
    );
  }, [logs]);

  const renderItem = useCallback(
    ({ item }: { item: CrashEntry }) => (
      <LogRow entry={item} isDark={isDark} colors={colors} />
    ),
    [isDark, colors],
  );

  const keyExtractor = useCallback(
    (item: CrashEntry, index: number) => `${item.timestamp}-${index}`,
    [],
  );

  const ListEmpty = (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>✅</Text>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No errors recorded</Text>
      <Text style={[styles.emptyBody, { color: colors.muted }]}>
        The app has not logged any errors. Errors will appear here automatically if they occur.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0D1117' : '#F8FAFC', paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backChevron, { color: colors.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Crash Logs</Text>
        {/* Action buttons */}
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleCopy}
            disabled={copying || logs.length === 0}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={cs.copyAll}
          >
            {copying
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.headerActionText, { color: copyDone ? '#22C55E' : (logs.length === 0 ? colors.muted : colors.primary) }]}>
                  {copyDone ? '✓' : cs.copy}
                </Text>
            }
          </Pressable>
          <Pressable
            onPress={handleShare}
            disabled={sharing || logs.length === 0}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={cs.shareAll}
          >
            {sharing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.headerActionText, { color: logs.length === 0 ? colors.muted : colors.primary }]}>{cs.shareAll.split(' ')[0]}</Text>
            }
          </Pressable>
          <Pressable
            onPress={handleClear}
            disabled={logs.length === 0}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={cs.clearAll}
          >
            <Text style={[styles.headerActionText, { color: logs.length === 0 ? colors.muted : '#EF4444' }]}>{cs.clearAll.split(' ')[0]}</Text>
          </Pressable>
        </View>
      </View>

      {/* Subtitle */}
      <View style={[styles.subtitleRow, { borderBottomColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {logs.length > 0
            ? `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'} · stored locally · tap any row to expand`
            : cs.onDevice}
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginLeft: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAction: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 40,
    alignItems: 'center',
  },
  headerActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 12,
    gap: 8,
    paddingBottom: 40,
  },
  // Log row
  logRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 12,
    gap: 6,
  },
  logRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  timestamp: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
  },
  expandChevron: {
    fontSize: 10,
    fontWeight: '600',
  },
  logMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  expandedSection: {
    marginTop: 4,
    gap: 4,
  },
  metaLine: {
    fontSize: 11,
    lineHeight: 14,
  },
  stackBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  stackLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stackText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
