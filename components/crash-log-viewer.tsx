/**
 * CrashLogViewer
 *
 * A full-screen modal that shows locally persisted crash/error logs.
 * No network calls — all data comes from AsyncStorage via the crash-logger lib.
 * Accessible from Settings → Diagnostics → View Error Logs.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks';
import Constants from 'expo-constants';
import { clearCrashLogs, copyCrashReport, readCrashLogs, sendCrashReport, shareCrashReport, type CrashEntry } from '@/lib/crash-logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const TYPE_COLORS: Record<CrashEntry['type'], string> = {
  RenderError: '#EF4444',
  UnhandledRejection: '#F97316',
  NativeError: '#DC2626',
  Warning: '#F59E0B',
  Manual: '#6366F1',
};

// ─── Single log row ───────────────────────────────────────────────────────────

interface LogRowProps {
  entry: CrashEntry;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
}

function LogRow({ entry, isDark, colors }: LogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = TYPE_COLORS[entry.type] ?? '#6B7280';

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={({ pressed }) => [
        styles.logRow,
        {
          backgroundColor: isDark ? colors.surfaceRaised : '#FFFFFF',
          borderColor: isDark ? colors.borderStrong : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Header row */}
      <View style={styles.logRowHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '22', borderColor: typeColor + '55' }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>{entry.type}</Text>
        </View>
        <Text style={[styles.logTimestamp, { color: colors.muted }]}>
          {formatTimestamp(entry.timestamp)}
        </Text>
      </View>

      {/* Message */}
      <Text
        style={[styles.logMessage, { color: colors.foreground }]}
        numberOfLines={expanded ? undefined : 2}
      >
        {entry.message}
      </Text>

      {/* Stack trace (only when expanded) */}
      {expanded && (entry.stack || entry.componentStack) && (
        <ScrollView
          horizontal
          style={[styles.stackBox, { backgroundColor: isDark ? '#0D1117' : '#F3F4F6' }]}
          showsHorizontalScrollIndicator
        >
          <Text style={styles.stackText}>
            {[entry.stack, entry.componentStack].filter(Boolean).join('\n\n--- Component Stack ---\n')}
          </Text>
        </ScrollView>
      )}

      {/* Expand hint */}
      <Text style={[styles.expandHint, { color: colors.muted }]}>
        {expanded ? 'Tap to collapse' : 'Tap to expand'}
      </Text>
    </Pressable>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface CrashLogViewerProps {
  visible: boolean;
  onClose: () => void;
  /** Called after crash logs are cleared so the parent can refresh the badge count */
  onLogsCleared?: () => void;
}

export function CrashLogViewer({ visible, onClose, onLogsCleared }: CrashLogViewerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = colors.background === '#0D1117' || colors.background === '#151718';

  const [logs, setLogs] = useState<CrashEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const entries = await readCrashLogs();
    setLogs(entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) loadLogs();
  }, [visible, loadLogs]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const [copied, setCopied] = useState(false);

  const promptClearAfterShare = () => {
    Alert.alert(
      'Clear Logs?',
      'Clear logs now that they\'ve been shared?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearCrashLogs();
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setLogs([]);
            onLogsCleared?.();
          },
        },
      ]
    );
  };

  const handleCopy = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const ok = await copyCrashReport(logs, appVersion);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setTimeout(() => promptClearAfterShare(), 400);
    }
  };

  const handleSend = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await sendCrashReport(logs, appVersion);
    promptClearAfterShare();
  };

  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const shared = await shareCrashReport(logs, appVersion);
    if (shared) promptClearAfterShare();
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Error Logs',
      'This will permanently delete all locally stored error logs. Your health data is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearCrashLogs();
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setLogs([]);
            onLogsCleared?.();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#0D1117' : '#F5F6FA',
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Error Logs</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {logs.length === 0 ? 'No errors recorded' : `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'} · stored locally`}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {logs.length > 0 && (
              <>
                <Pressable
                  onPress={handleCopy}
                  style={({ pressed }) => [styles.copyBtn, copied && styles.copyBtnDone, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.copyBtnText, copied && styles.copyBtnTextDone]}>
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.shareBtnText}>🔗 Share</Text>
                </Pressable>
                <Pressable
                  onPress={handleSend}
                  style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.sendBtnText}>📤 Send</Text>
                </Pressable>
                <Pressable
                  onPress={handleClear}
                  style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.clearBtnText}>Clear</Text>
                </Pressable>
              </>
            )}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, { backgroundColor: isDark ? '#1E2A3A' : '#E5E7EB' }, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.closeBtnText, { color: colors.foreground }]}>Done</Text>
            </Pressable>
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No errors logged</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              VitalSync has not recorded any errors on this device. Logs appear here if the app
              encounters a crash or unhandled exception.
            </Text>
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item, i) => `${item.timestamp}-${i}`}
            renderItem={({ item }) => (
              <LogRow entry={item} isDark={isDark} colors={colors} />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Privacy note */}
        <Text style={[styles.privacyNote, { color: colors.muted }]}>
          All logs are stored locally on this device only. Nothing is sent to any server.
        </Text>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  copyBtnDone: {
    backgroundColor: '#D1FAE5',
  },
  copyBtnText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  copyBtnTextDone: {
    color: '#059669',
  },
  shareBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
  },
  shareBtnText: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '600',
  },
  sendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  sendBtnText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    gap: 10,
    paddingBottom: 12,
  },
  logRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  logRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  typeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  logTimestamp: {
    fontSize: 11,
  },
  logMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  stackBox: {
    borderRadius: 8,
    padding: 10,
    maxHeight: 180,
    marginTop: 4,
  },
  stackText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  expandHint: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
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
    textAlign: 'center',
    lineHeight: 21,
  },
  privacyNote: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
