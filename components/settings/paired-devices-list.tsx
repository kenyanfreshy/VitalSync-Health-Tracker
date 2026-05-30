/**
 * PairedDevicesList
 *
 * An inline list of BLE-paired devices shown in Settings > Health Data > Bluetooth Devices.
 *
 * Section header:
 *   • Summary banner — "All devices up to date" (green) or "N device(s) need attention" (amber/red)
 *   • Sync All button — iterates over all paired devices and calls readDeviceByCategory sequentially
 *
 * Each row:
 *   • Connection-status dot (green = synced <24 h, amber = >24 h, red = never)
 *   • Category icon + device name (or custom label) + ✏️ tag when renamed
 *   • Category badge (i18n) + "Last synced N h ago" / "Never synced" subtitle (i18n)
 *   • Read Now button (on-demand data pull)
 *   • Forget button (with confirmation alert)
 *
 * Long-pressing a row opens the RenameDeviceSheet (reused from BleScannerSheet).
 *
 * Auto-refreshes every 60 seconds so relative-time labels and status dots stay accurate.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';
import { useLang } from '@/hooks/use-lang';
import { useHealth } from '@/lib/health/health-context';
import { bleScannerStrings } from '@/lib/i18n';
import { secureGetItem, secureSetItem } from '@/lib/storage/health-storage';
import type { ScannedDevice } from '@/lib/ble/ble-manager';
import {
  readDeviceByCategory,
  bleReadSummary,
  deduplicateVitalSigns,
} from '@/lib/ble/ble-reading-service';
import {
  RenameDeviceSheet,
  saveDeviceLabel,
  loadDeviceLabels,
  loadPairedDevices,
  updatePairedDeviceSync,
} from '@/components/ble-device-scanner';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAIRED_DEVICES_KEY = '@vsht:pairedBleDevices';
const AUTO_REFRESH_MS    = 60_000; // 1 minute

// ─── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<string, string> = {
  glucometer:           '🩸',
  cgm:                  '📡',
  scale:                '⚖️',
  'bp-monitor':         '💓',
  'fitness-tracker':    '⌚',
  'heart-rate-monitor': '❤️',
  'pulse-oximeter':     '🫁',
  thermometer:          '🌡️',
  unknown:              '📶',
};

const CATEGORY_I18N_KEY: Record<string, string> = {
  glucometer:           'catGlucometer',
  cgm:                  'catCgm',
  scale:                'catScale',
  'bp-monitor':         'catBpMonitor',
  'fitness-tracker':    'catFitnessTracker',
  'heart-rate-monitor': 'catHeartRateMonitor',
  'pulse-oximeter':     'catPulseOximeter',
  thermometer:          'catThermometer',
  unknown:              'catUnknown',
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusDotColor(lastSyncedAt: string | undefined): string {
  if (!lastSyncedAt) return '#EF4444';
  const age = Date.now() - new Date(lastSyncedAt).getTime();
  if (age < 86_400_000) return '#22C55E';
  return '#F59E0B';
}

/** Returns true if device is considered "up to date" (synced within 24 h) */
function isUpToDate(device: ScannedDevice): boolean {
  if (!device.lastSyncedAt) return false;
  return Date.now() - new Date(device.lastSyncedAt).getTime() < 86_400_000;
}

// ─── Relative time (i18n) ─────────────────────────────────────────────────────

function relativeTime(iso: string, t: Record<string, any>): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return t.justNow  ?? '< 1 min ago';
  if (mins < 60)  return (t.minAgo  ?? '{n} min ago').replace('{n}', String(mins));
  if (hours < 24) return (t.hAgo    ?? '{n} h ago').replace('{n}', String(hours));
  return (t.dAgo ?? '{n} d ago').replace('{n}', String(days));
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function forgetDevice(id: string): Promise<ScannedDevice[]> {
  try {
    const raw = await secureGetItem(PAIRED_DEVICES_KEY);
    const existing: ScannedDevice[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter((d) => d.id !== id);
    await secureSetItem(PAIRED_DEVICES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PairedDevicesListProps {
  /** Called when the user taps Reconnect — parent should open BleScannerSheet */
  onReconnect: () => void;
  /** Refresh token — increment to force a re-read from storage */
  refreshToken?: number;
  /** Called after a device is forgotten so the parent can update its badge count */
  onDeviceForgotten?: (newCount: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PairedDevicesList({
  onReconnect,
  refreshToken = 0,
  onDeviceForgotten,
}: PairedDevicesListProps) {
  const colors = useColors();
  const lang   = useLang();
  const t      = (bleScannerStrings as unknown as Record<string, any>)[lang] ?? (bleScannerStrings as unknown as Record<string, any>)['en'];
  const { state: healthState, addVitalSigns, addWeight, addBloodSugar } = useHealth();

  const [devices,       setDevices]       = useState<ScannedDevice[]>([]);
  const [labels,        setLabels]        = useState<Record<string, string>>({});
  const [readingId,     setReadingId]     = useState<string | null>(null);
  const [syncingAll,    setSyncingAll]    = useState(false);
  const [statusMsgs,    setStatusMsgs]    = useState<Record<string, string>>({});
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTarget,  setRenameTarget]  = useState<ScannedDevice | null>(null);
  // Tick state forces re-render every minute so relative-time labels update
  const [, setTick] = useState(0);

  const reload = useCallback(async () => {
    const [d, l] = await Promise.all([loadPairedDevices(), loadDeviceLabels()]);
    setDevices(d);
    setLabels(l);
  }, []);

  // Initial load + refresh on external token change
  useEffect(() => { reload(); }, [reload, refreshToken]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      reload();
      setTick((n) => n + 1);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [reload]);

  // ── Per-device status message helpers ──────────────────────────────────────

  function setStatus(id: string, msg: string) {
    setStatusMsgs((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => {
      setStatusMsgs((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }, 5000);
  }

  // ── Core read logic (shared by Read Now and Sync All) ──────────────────────

  async function readOne(device: ScannedDevice): Promise<void> {
    try {
      const result  = await readDeviceByCategory(device);
      const summary = bleReadSummary(result, device.name);
      if (result.type === 'vital-signs') {
        const newRecs = deduplicateVitalSigns(result.records, healthState.data?.vitalSigns ?? []);
        for (const rec of newRecs) await addVitalSigns({ ...rec, deviceName: device.name });
        await updatePairedDeviceSync(device.id);
        setStatus(device.id, `✓ ${summary}`);
      } else if (result.type === 'weight') {
        const existing = healthState.data?.weight ?? [];
        const newRecs  = result.records.filter((r) => !existing.find((e) => e.id === r.id));
        for (const rec of newRecs) await addWeight({ ...rec, deviceName: device.name });
        await updatePairedDeviceSync(device.id);
        setStatus(device.id, `✓ ${summary}`);
      } else if (result.type === 'blood-sugar') {
        const existing = healthState.data?.bloodSugar ?? [];
        const newRecs  = result.records.filter((r) => !existing.find((e) => e.id === r.id));
        for (const rec of newRecs) await addBloodSugar({ ...rec, deviceName: device.name });
        await updatePairedDeviceSync(device.id);
        setStatus(device.id, `✓ ${summary}`);
      } else {
        setStatus(device.id, `⚠ ${summary}`);
      }
    } catch (err: any) {
      setStatus(device.id, `⚠ ${t.syncFailed ?? 'Sync failed'}: ${err?.message ?? ''}`);
    }
  }

  // ── Read Now (single device) ───────────────────────────────────────────────

  async function handleReadNow(device: ScannedDevice) {
    if (readingId || syncingAll) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReadingId(device.id);
    await readOne(device);
    const updated = await loadPairedDevices();
    setDevices(updated);
    setReadingId(null);
  }

  // ── Sync All ───────────────────────────────────────────────────────────────

  async function handleSyncAll() {
    if (readingId || syncingAll || devices.length === 0) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncingAll(true);
    for (const device of devices) {
      setReadingId(device.id);
      await readOne(device);
      setReadingId(null);
    }
    const updated = await loadPairedDevices();
    setDevices(updated);
    setSyncingAll(false);
  }

  // ── Forget ─────────────────────────────────────────────────────────────────

  function handleForget(device: ScannedDevice) {
    const displayName = labels[device.id] ?? device.name;
    const msg = (t.forgetConfirmMsg ?? 'This will remove {name} from your paired devices list.')
      .replace('{name}', displayName);
    Alert.alert(
      t.forgetConfirmTitle ?? 'Forget Device?',
      msg,
      [
        { text: t.forgetConfirmNo ?? 'Cancel', style: 'cancel' },
        {
          text: t.forgetConfirmYes ?? 'Forget',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            const updated = await forgetDevice(device.id);
            setDevices(updated);
            onDeviceForgotten?.(updated.length);
          },
        },
      ],
    );
  }

  // ── Rename ─────────────────────────────────────────────────────────────────

  function handleLongPress(device: ScannedDevice) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRenameTarget(device);
    setRenameVisible(true);
  }

  async function handleRenameSave(label: string) {
    if (!renameTarget) return;
    const updated = await saveDeviceLabel(renameTarget.id, label);
    setLabels(updated);
    setRenameVisible(false);
    setRenameTarget(null);
  }

  // ── Summary banner ─────────────────────────────────────────────────────────

  const attentionCount = devices.filter((d) => !isUpToDate(d)).length;
  const allGood        = attentionCount === 0 && devices.length > 0;
  const bannerColor    = allGood ? '#22C55E' : attentionCount > 0 ? '#F59E0B' : '#9BA1A6';
  const bannerBg       = allGood ? '#22C55E12' : attentionCount > 0 ? '#F59E0B12' : 'transparent';
  const bannerText     = allGood
    ? (t.allUpToDate ?? 'All devices up to date')
    : attentionCount > 0
      ? (t.needsAttention ?? '{n} device(s) need attention').replace('{n}', String(attentionCount))
      : (t.noPairedDevices ?? 'No paired devices');

  const isBusy = !!readingId || syncingAll;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (devices.length === 0) {
    return (
      <View style={[styles.emptyRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {t.noPairedDevices ?? 'No paired devices'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* ── Section header: summary + Sync All ── */}
      <View style={[styles.headerRow, { borderTopColor: colors.border, backgroundColor: bannerBg }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.summaryDot, { backgroundColor: bannerColor }]} />
          <Text style={[styles.summaryText, { color: bannerColor }]} numberOfLines={1}>
            {bannerText}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.syncAllBtn,
            { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
            pressed && { opacity: 0.7 },
            isBusy && { opacity: 0.45 },
          ]}
          onPress={handleSyncAll}
          disabled={isBusy}
          accessibilityLabel={t.syncAll ?? 'Sync All'}
        >
          {syncingAll ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ width: 52 }} />
          ) : (
            <Text style={[styles.syncAllText, { color: colors.primary }]}>
              {t.syncAll ?? 'Sync All'}
            </Text>
          )}
        </Pressable>
      </View>

      {/* ── Device rows ── */}
      {devices.map((device) => {
        const displayName    = labels[device.id] ?? device.name;
        const icon           = CATEGORY_ICON[device.category] ?? '📶';
        const catI18nKey     = CATEGORY_I18N_KEY[device.category];
        const catLabel       = catI18nKey ? (t[catI18nKey] ?? device.category) : device.category;
        const hasCustomLabel = !!labels[device.id];
        const syncLabel      = device.lastSyncedAt
          ? `${t.lastSynced ?? 'Last synced'} ${relativeTime(device.lastSyncedAt, t)}`
          : (t.neverSynced ?? 'Never synced');
        const dotColor       = statusDotColor(device.lastSyncedAt);
        const isReading      = readingId === device.id;
        const statusMsg      = statusMsgs[device.id];

        return (
          <Pressable
            key={device.id}
            onLongPress={() => handleLongPress(device)}
            delayLongPress={500}
            style={({ pressed }) => [
              styles.row,
              { borderTopColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
          >
            {/* Status dot */}
            <View style={[styles.statusDot, { backgroundColor: dotColor }]} />

            {/* Left: icon + name + category badge + last-synced */}
            <View style={styles.rowLeft}>
              <Text style={styles.icon}>{icon}</Text>
              <View style={styles.nameCol}>
                <View style={styles.nameRow}>
                  <Text
                    style={[styles.name, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                  {hasCustomLabel && (
                    <Text style={[styles.renamedTag, { color: colors.muted }]}>✏️</Text>
                  )}
                </View>
                <View style={styles.metaRow}>
                  <View style={[styles.badge, { backgroundColor: '#0EA5E920', borderColor: '#0EA5E940' }]}>
                    <Text style={[styles.badgeText, { color: '#0EA5E9' }]}>{catLabel}</Text>
                  </View>
                  <Text style={[styles.syncLabel, { color: colors.muted }]} numberOfLines={1}>
                    {statusMsg ?? syncLabel}
                  </Text>
                </View>
              </View>
            </View>

            {/* Right: Read Now + Forget */}
            <View style={styles.rowRight}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: '#22C55E15', borderColor: '#22C55E40' },
                  pressed && { opacity: 0.7 },
                  isBusy && { opacity: 0.5 },
                ]}
                onPress={() => handleReadNow(device)}
                disabled={isBusy}
                accessibilityLabel={`${t.readNow ?? 'Read Now'} ${displayName}`}
              >
                {isReading ? (
                  <ActivityIndicator size="small" color="#22C55E" style={{ width: 36 }} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: '#22C55E' }]}>
                    {t.readNow ?? 'Read Now'}
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: '#EF444415', borderColor: '#EF444440' },
                  pressed && { opacity: 0.7 },
                  isBusy && { opacity: 0.5 },
                ]}
                onPress={() => handleForget(device)}
                disabled={isBusy}
                accessibilityLabel={`${t.forget ?? 'Forget'} ${displayName}`}
              >
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>
                  {t.forget ?? 'Forget'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        );
      })}

      {/* Rename sheet — reused from BleScannerSheet */}
      <RenameDeviceSheet
        visible={renameVisible}
        device={renameTarget}
        currentLabel={renameTarget ? (labels[renameTarget.id] ?? renameTarget.name) : ''}
        onSave={handleRenameSave}
        onClose={() => { setRenameVisible(false); setRenameTarget(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  syncAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  syncAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  icon: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  nameCol: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    flexShrink: 1,
  },
  renamedTag: {
    fontSize: 11,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  syncLabel: {
    fontSize: 11,
    flexShrink: 1,
  },
  rowRight: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
