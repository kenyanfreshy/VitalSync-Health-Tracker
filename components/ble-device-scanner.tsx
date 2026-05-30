/**
 * BLE Device Scanner Bottom Sheet
 *
 * Presents a scan → select → read flow for pairing with nearby health devices.
 * All named BLE devices are shown (no category filter).
 * Unknown devices get a t.connectAndRead button that performs a raw GATT read
 * and shows the results in an inline modal.
 * Previously selected devices are persisted to AsyncStorage as "Paired Devices"
 * and shown at the top of the sheet for one-tap reconnection.
 * Long-pressing a paired device opens a Rename sheet.
 * A sort toggle above the Nearby section switches between RSSI and alphabetical order.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';
import {
  type DeviceCategory,
  type ScannedDevice,
  type RawGattResult,
  scanForDevices,
  connectAndReadDevice,
} from '@/lib/ble/ble-manager';
import { useColors, useLang } from '@/hooks';
import { bleScannerStrings } from '@/lib/i18n';
import { readDeviceByCategory, getAutoReadEnabled, setAutoReadEnabled, deduplicateVitalSigns, bleReadSummary, BLE_DISCLAIMER } from '@/lib/ble/ble-reading-service';
import { useHealth } from '@/lib/health/health-context';
import { useUpsell } from '@/hooks/use-upsell';

const PAIRED_DEVICES_KEY = '@vsht:pairedBleDevices';
const DEVICE_LABELS_KEY  = '@vsht:bleDeviceLabels';   // Record<id, string>
const SORT_PREF_KEY      = '@vsht:bleSortOrder';       // 'rssi' | 'alpha'

type SortOrder = 'rssi' | 'alpha';

interface BleScannerProps {
  visible: boolean;
  category?: DeviceCategory | DeviceCategory[];
  onDeviceSelected: (device: ScannedDevice) => void;
  onClose: () => void;
}

const SIGNAL_BARS = (rssi: number) => {
  if (rssi > -60) return 4;
  if (rssi > -70) return 3;
  if (rssi > -80) return 2;
  return 1;
};

const CATEGORY_LABEL: Record<DeviceCategory | 'unknown', string> = {
  glucometer: 'Glucometer',
  cgm: 'CGM',
  scale: 'Smart Scale',
  'bp-monitor': 'BP Monitor',
  'fitness-tracker': 'Fitness Tracker',
  'heart-rate-monitor': 'Heart Rate Monitor',
  'pulse-oximeter': 'Pulse Oximeter',
  'thermometer': 'Thermometer',
  unknown: 'Unknown',
};

const CATEGORY_ICON: Record<DeviceCategory | 'unknown', string> = {
  glucometer: '🩸',
  cgm: '📡',
  scale: '⚖️',
  'bp-monitor': '💓',
  'fitness-tracker': '⌚',
  'heart-rate-monitor': '❤️',
  'pulse-oximeter': '🫁',
  'thermometer': '🌡️',
  unknown: '📶',
};

// ─── Paired device storage helpers ───────────────────────────────────────────
export async function loadPairedDevices(): Promise<ScannedDevice[]> {
  try {
    const raw = await secureGetItem(PAIRED_DEVICES_KEY);
    return raw ? (JSON.parse(raw) as ScannedDevice[]) : [];
  } catch (_unused) {
    return [];
  }
}

async function savePairedDevice(device: ScannedDevice): Promise<void> {
  try {
    const existing = await loadPairedDevices();
    const filtered = existing.filter((d) => d.id !== device.id);
    const updated = [device, ...filtered].slice(0, 10);
    await secureSetItem(PAIRED_DEVICES_KEY, JSON.stringify(updated));
  } catch (_unused) { /* ignore */ }
}

async function removePairedDevice(id: string): Promise<ScannedDevice[]> {
  try {
    const existing = await loadPairedDevices();
    const updated = existing.filter((d) => d.id !== id);
    await secureSetItem(PAIRED_DEVICES_KEY, JSON.stringify(updated));
    return updated;
  } catch (_unused) {
    return [];
  }
}
export async function updatePairedDeviceSync(id: string): Promise<void> {
  try {
    const existing = await loadPairedDevices();
    const updated = existing.map((d) =>
      d.id === id ? { ...d, lastSyncedAt: new Date().toISOString() } : d
    );
    await secureSetItem(PAIRED_DEVICES_KEY, JSON.stringify(updated));
  } catch (_unused) { /* ignore */ }
}

// ─── Device label helpers ─────────────────────────────────────────────────────
export async function loadDeviceLabels(): Promise<Record<string, string>> {
  try {
    const raw = await secureGetItem(DEVICE_LABELS_KEY);
    return raw ? (JSON.parse(String(raw)) as Record<string, string>) : {};
  } catch (_unused) {
    return {};
  }
}

export async function saveDeviceLabel(id: string, label: string): Promise<Record<string, string>> {
  try {
    const existing = await loadDeviceLabels();
    const updated = { ...existing, [id]: label };
    await secureSetItem(DEVICE_LABELS_KEY, JSON.stringify(updated));
    return updated;
  } catch (_unused) {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function removeDeviceLabel(id: string): Promise<Record<string, string>> {
  try {
    const existing = await loadDeviceLabels();
    const { [id]: _removed, ...rest } = existing;
    await secureSetItem(DEVICE_LABELS_KEY, JSON.stringify(rest));
    return rest;
  } catch (_unused) {
    return {};
  }
}

// ─── Rename Device Bottom Sheet ───────────────────────────────────────────────
export function RenameDeviceSheet({
  visible,
  device,
  currentLabel,
  onSave,
  onClose,
}: {
  visible: boolean;
  device: ScannedDevice | null;
  currentLabel: string;
  onSave: (label: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const lang = useLang();
  const t = (bleScannerStrings as unknown as Record<string, typeof bleScannerStrings.en>)[lang] ?? bleScannerStrings['en'];
  const [value, setValue] = useState(currentLabel);

  useEffect(() => {
    if (visible) setValue(currentLabel);
  }, [visible, currentLabel]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed) onSave(trimmed);
    else onClose();
  };

  if (!device) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={renameStyles.overlay} onPress={onClose} />
      <View style={[renameStyles.sheet, {
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + 20,
      }]}>
        <View style={[renameStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[renameStyles.title, { color: colors.foreground }]}>{t.renameDevice ?? 'Rename Device'}</Text>
        <Text style={[renameStyles.subtitle, { color: colors.muted }]} numberOfLines={1}>
          {device.name}
        </Text>
        <TextInput
          style={[renameStyles.input, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.foreground,
          }]}
          value={value}
          onChangeText={setValue}
          placeholder={device.name}
          placeholderTextColor={colors.muted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          maxLength={40}
        />
        <View style={renameStyles.btnRow}>
          <Pressable
            style={[renameStyles.btn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
            onPress={onClose}
          >
            <Text style={[renameStyles.btnText, { color: colors.foreground }]}>{t.cancel ?? 'Cancel'}</Text>
          </Pressable>
          <Pressable
            style={[renameStyles.btn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
          >
            <Text style={[renameStyles.btnText, { color: colors.background }]}>{t.save ?? 'Save'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Raw GATT Result Modal ────────────────────────────────────────────────────
function RawGattModal({
  visible,
  deviceName,
  results,
  loading,
  error,
  onClose,
}: {
  visible: boolean;
  deviceName: string;
  results: RawGattResult[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const lang = useLang();
  const t = (bleScannerStrings as unknown as Record<string, typeof bleScannerStrings.en>)[lang] ?? bleScannerStrings['en'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={rawStyles.overlay} onPress={onClose} />
      <View style={[rawStyles.sheet, {
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + 16,
      }]}>
        <View style={[rawStyles.handle, { backgroundColor: colors.border }]} />
        <View style={rawStyles.header}>
          <Text style={[rawStyles.title, { color: colors.foreground }]} numberOfLines={1}>
            {deviceName}
          </Text>
          <Pressable onPress={onClose} style={({ pressed }) => [rawStyles.closeBtn, pressed && { opacity: 0.6 }]}>
            <Text style={[rawStyles.closeBtnText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        </View>
        <Text style={[rawStyles.subtitle, { color: colors.muted }]}>{t.rawGatt ?? 'Raw GATT Characteristics'}</Text>

        {loading && (
          <View style={rawStyles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[rawStyles.loadingText, { color: colors.muted }]}>{t.connectingReading ?? 'Connecting & reading…'}</Text>
          </View>
        )}
        {error && !loading && (
          <View style={rawStyles.center}>
            <Text style={rawStyles.errorIcon}>⚠️</Text>
            <Text style={[rawStyles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}
        {!loading && !error && results.length === 0 && (
          <View style={rawStyles.center}>
            <Text style={rawStyles.errorIcon}>🔍</Text>
            <Text style={[rawStyles.errorText, { color: colors.muted }]}>No readable characteristics found.</Text>
          </View>
        )}
        {!loading && results.length > 0 && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
            {results.map((r, i) => (
              <View key={i} style={[rawStyles.resultRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={rawStyles.resultUUIDs}>
                  <Text style={[rawStyles.uuidLabel, { color: colors.muted }]}>Service</Text>
                  <Text style={[rawStyles.uuidValue, { color: colors.foreground }]}>{r.serviceUUID}</Text>
                  <Text style={[rawStyles.uuidLabel, { color: colors.muted, marginTop: 4 }]}>Characteristic</Text>
                  <Text style={[rawStyles.uuidValue, { color: colors.foreground }]}>{r.characteristicUUID}</Text>
                </View>
                <View style={[rawStyles.resultValues, { borderTopColor: colors.border }]}>
                  <Text style={[rawStyles.valueLabel, { color: colors.muted }]}>ASCII</Text>
                  <Text style={[rawStyles.valueText, { color: colors.primary }]}>{r.valueAscii || '—'}</Text>
                  <Text style={[rawStyles.valueLabel, { color: colors.muted, marginTop: 4 }]}>Hex</Text>
                  <Text style={[rawStyles.valueText, { color: colors.foreground, fontFamily: 'monospace' }]}>{r.valueHex || '—'}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Scanner Sheet ───────────────────────────────────────────────────────
export function BleScannerSheet({ visible, onDeviceSelected, onClose }: BleScannerProps) {
  const colors = useColors();
  const lang = useLang();
  const t = (bleScannerStrings as unknown as Record<string, typeof bleScannerStrings.en>)[lang] ?? bleScannerStrings['en'];
  const insets = useSafeAreaInsets();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pairedDevices, setPairedDevices] = useState<ScannedDevice[]>([]);
  const [deviceLabels, setDeviceLabels] = useState<Record<string, string>>({});
  const [sortOrder, setSortOrder] = useState<SortOrder>('rssi');
  const stopRef = useRef<(() => void) | null>(null);
  const slideAnim = useRef(new Animated.Value(400)).current;

  // Raw GATT modal state
  const [rawModalVisible, setRawModalVisible] = useState(false);
  const [rawDevice, setRawDevice] = useState<ScannedDevice | null>(null);
  const [rawResults, setRawResults] = useState<RawGattResult[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  // Rename sheet state
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameDevice, setRenameDevice] = useState<ScannedDevice | null>(null);
  // Auto-read toggle
  const [autoRead, setAutoRead] = useState(false);
  const [readingDevice, setReadingDevice] = useState<string | null>(null);
  const [readStatusMsg, setReadStatusMsg] = useState<string | null>(null);
  const { state: healthState, addVitalSigns, addWeight, addBloodSugar } = useHealth();

  const { checkAndShow: checkUpsell } = useUpsell();

  useEffect(() => {
    if (visible) {
      setDevices([]);
      loadPairedDevices().then(setPairedDevices).catch(() => {});
      loadDeviceLabels().then(setDeviceLabels).catch(() => {});
      AsyncStorage.getItem(SORT_PREF_KEY).then((v) => {
        if (v === 'alpha' || v === 'rssi') setSortOrder(v);
      }).catch(() => {});
      getAutoReadEnabled().then(setAutoRead).catch(() => {});
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      startScan();
      // Contextual upsell: fire on BLE device scan attempt (free users only)
      setTimeout(() => { checkUpsell('ble_device_tap').catch(() => {}); }, 1000);
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 250, useNativeDriver: true }).start();
      stopRef.current?.();
      setScanning(false);
    }
    return () => { stopRef.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const startScan = useCallback(async () => {
    setScanning(true);
    setDevices([]);
    const handle = await scanForDevices((device) => {
      setDevices((prev) => {
        if (prev.find((d) => d.id === device.id)) return prev;
        return [...prev, device];
      });
    }, 15000);
    stopRef.current = handle.stop;
    setTimeout(() => setScanning(false), 15000);
  }, []);

  const sortedDevices = React.useMemo(() => {
    if (sortOrder === 'alpha') {
      return [...devices].sort((a, b) => {
        const la = (deviceLabels[a.id] ?? a.name).toLowerCase();
        const lb = (deviceLabels[b.id] ?? b.name).toLowerCase();
        return la.localeCompare(lb);
      });
    }
    return [...devices].sort((a, b) => b.rssi - a.rssi);
  }, [devices, sortOrder, deviceLabels]);

  const handleSortToggle = useCallback((order: SortOrder) => {
    setSortOrder(order);
    safeSetItem(SORT_PREF_KEY, order).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSelect = useCallback(async (device: ScannedDevice) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setConnecting(device.id);
    await savePairedDevice(device);
    setPairedDevices(await loadPairedDevices());
    await new Promise((r) => setTimeout(r, 600));
    setConnecting(null);
    onDeviceSelected(device);
  }, [onDeviceSelected]);

  const handleConnectAndRead = useCallback(async (device: ScannedDevice) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setRawDevice(device);
    setRawResults([]);
    setRawError(null);
    setRawLoading(true);
    setRawModalVisible(true);
    try {
      const results = await connectAndReadDevice(device.id);
      setRawResults(results);
    } catch (err: any) {
      setRawError(err?.message ?? 'Failed to connect. Make sure the device is in range and not connected to another host.');
    } finally {
      setRawLoading(false);
    }
  }, []);

  const handleRemovePaired = useCallback(async (id: string) => {
    const updated = await removePairedDevice(id);
    setPairedDevices(updated);
  }, []);

  const handleLongPressPaired = useCallback((device: ScannedDevice) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRenameDevice(device);
    setRenameVisible(true);
  }, []);

  const handleRenameSave = useCallback(async (label: string) => {
    if (!renameDevice) return;
    const updated = await saveDeviceLabel(renameDevice.id, label);
    setDeviceLabels(updated);
    setRenameVisible(false);
    setRenameDevice(null);
  }, [renameDevice]);

  const handleReadNow = async (device: ScannedDevice) => {
    if (readingDevice) return;
    setReadingDevice(device.id);
    setReadStatusMsg(null);
    try {
      const result = await readDeviceByCategory(device);
      const summary = bleReadSummary(result, device.name);
      if (result.type === 'vital-signs') {
        const newRecords = deduplicateVitalSigns(result.records, healthState.data?.vitalSigns ?? []);
        for (const rec of newRecords) { await addVitalSigns({ ...rec, deviceName: device.name }); }
        await updatePairedDeviceSync(device.id);
        setPairedDevices(await loadPairedDevices());
        setReadStatusMsg(`✓ ${summary}`);
      } else if (result.type === 'weight') {
        const existing = healthState.data?.weight ?? [];
        const newRecords = result.records.filter((r) => !existing.find((e) => e.id === r.id));
        for (const rec of newRecords) { await addWeight({ ...rec, deviceName: device.name }); }
        await updatePairedDeviceSync(device.id);
        setPairedDevices(await loadPairedDevices());
        setReadStatusMsg(`✓ ${summary}`);
      } else if (result.type === 'blood-sugar') {
        const existing = healthState.data?.bloodSugar ?? [];
        const newRecords = result.records.filter((r) => !existing.find((e) => e.id === r.id));
        for (const rec of newRecords) { await addBloodSugar({ ...rec, deviceName: device.name }); }
        await updatePairedDeviceSync(device.id);
        setPairedDevices(await loadPairedDevices());
        setReadStatusMsg(`✓ ${summary}`);
      } else {
        setReadStatusMsg(`⚠ ${summary}`);
      }
    } catch (err: any) {
      setReadStatusMsg(`⚠ ${err?.message ?? 'Read failed'}`);
    } finally {
      setReadingDevice(null);
      setTimeout(() => setReadStatusMsg(null), 5000);
    }
  };

  const handleAutoReadToggle = async (val: boolean) => {
    setAutoRead(val);
    await setAutoReadEnabled(val);
  };

  const renderDevice = ({ item, isPaired = false }: { item: ScannedDevice; isPaired?: boolean }) => {
    const bars = SIGNAL_BARS(item.rssi);
    const isConnecting = connecting === item.id;
    const isUnknown = item.category === 'unknown';
    const displayName = deviceLabels[item.id] ?? item.name;
    const hasCustomLabel = !!deviceLabels[item.id];

    return (
      <Pressable
        onLongPress={isPaired ? () => handleLongPressPaired(item) : undefined}
        delayLongPress={500}
        style={({ pressed }) => [
          styles.deviceRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
          isPaired && pressed && { opacity: 0.75 },
        ]}
      >
        <Text style={styles.deviceIcon}>{CATEGORY_ICON[item.category]}</Text>
        <View style={styles.deviceInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.deviceName, { color: colors.foreground }]} numberOfLines={1}>
              {displayName}
            </Text>
            {hasCustomLabel && (
              <Text style={[styles.renamedTag, { color: colors.muted, borderColor: colors.border }]}>✏️</Text>
            )}
          </View>
          {hasCustomLabel && (
            <Text style={[styles.deviceBrand, { color: colors.muted }]}>{item.name}</Text>
          )}
          {!hasCustomLabel && (
            <Text style={[styles.deviceBrand, { color: colors.muted }]}>{item.brand}</Text>
          )}
          <View style={styles.deviceMeta}>
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{CATEGORY_LABEL[item.category]}</Text>
            </View>
            {item.isKnown && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success + '22' }]}>
                <Text style={[styles.verifiedText, { color: colors.success }]}>✓ Supported</Text>
              </View>
            )}
            {isPaired && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.verifiedText, { color: colors.primary }]}>⭐ Paired</Text>
              </View>
            )}
          </View>
          {/* Action buttons */}
          <View style={styles.actionRow}>
            {!isUnknown && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: isConnecting ? 0.6 : 1 }]}
                onPress={() => handleSelect(item)}
                disabled={!!connecting}
              >
                {isConnecting
                  ? <ActivityIndicator size="small" color={colors.background} />
                  : <Text style={[styles.actionBtnText, { color: colors.background }]}>{t.select ?? 'Select'}</Text>
                }
              </Pressable>
            )}
            <Pressable
              style={[styles.actionBtn, {
                backgroundColor: isUnknown ? colors.primary : colors.surface,
                borderWidth: isUnknown ? 0 : 1,
                borderColor: colors.border,
                opacity: isConnecting ? 0.6 : 1,
              }]}
              onPress={() => handleConnectAndRead(item)}
              disabled={!!connecting}
            >
              <Text style={[styles.actionBtnText, { color: isUnknown ? colors.background : colors.foreground }]}>
                {isUnknown ? t.connectAndRead : t.connectAndRead}
              </Text>
            </Pressable>
            {isPaired && item.category !== 'unknown' && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '40', opacity: readingDevice === item.id ? 0.6 : 1 }]}
                onPress={() => handleReadNow(item)}
                disabled={!!readingDevice}
              >
                {readingDevice === item.id
                  ? <ActivityIndicator size="small" color={colors.success} />
                  : <Text style={[styles.actionBtnText, { color: colors.success }]}>{t.readNow ?? 'Read Now'}</Text>
                }
              </Pressable>
            )}
            {isPaired && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.error + '18', borderWidth: 1, borderColor: colors.error + '40' }]}
                onPress={() => handleRemovePaired(item.id)}
              >
                <Text style={[styles.actionBtnText, { color: colors.error }]}>{t.remove ?? 'Remove'}</Text>
              </Pressable>
            )}
          </View>
          {isPaired && readStatusMsg && (
            <Text style={[styles.longPressHint, { color: readStatusMsg.startsWith('✓') ? colors.success : colors.warning }]}>{readStatusMsg}</Text>
          )}
          {isPaired && !readStatusMsg && (
            <Text style={[styles.longPressHint, { color: colors.muted }]}>{t.longPressRename ?? 'Long-press to rename'}</Text>
          )}
        </View>
        {/* Signal bars (only for live scan devices) */}
        {!isPaired && (
          <View style={styles.signalContainer}>
            {isConnecting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.signalBars}>
                {[1, 2, 3, 4].map((b) => (
                  <View
                    key={b}
                    style={[
                      styles.signalBar,
                      { height: 4 + b * 3, backgroundColor: b <= bars ? colors.primary : colors.border },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>{t.title}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                {scanning ? t.scanning : `${devices.length} device${devices.length !== 1 ? 's' : ''} found`}
              </Text>
            </View>
            {scanning && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* ── My Devices (Paired) ── */}
            {pairedDevices.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t.pairedDevices.toUpperCase()}</Text>
                <View style={{ gap: 10 }}>
                  {pairedDevices.map((d) => (
                    <View key={d.id}>{renderDevice({ item: d, isPaired: true })}</View>
                  ))}
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </View>
            )}

            {/* ── Sort toggle + Nearby section ── */}
            <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
              <View style={styles.nearbyHeader}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>{(t.nearby ?? 'NEARBY').toUpperCase()}</Text>
                <View style={styles.sortChips}>
                  <Pressable
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: sortOrder === 'rssi' ? colors.primary : colors.surface,
                        borderColor: sortOrder === 'rssi' ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleSortToggle('rssi')}
                  >
                    <Text style={[styles.sortChipText, { color: sortOrder === 'rssi' ? colors.background : colors.muted }]}>
                      📶 Signal
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: sortOrder === 'alpha' ? colors.primary : colors.surface,
                        borderColor: sortOrder === 'alpha' ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleSortToggle('alpha')}
                  >
                    <Text style={[styles.sortChipText, { color: sortOrder === 'alpha' ? colors.background : colors.muted }]}>
                      A–Z Name
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* ── Live scan results ── */}
            <FlatList
              data={sortedDevices}
              keyExtractor={(d) => d.id}
              renderItem={({ item }) => renderDevice({ item })}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  {scanning ? (
                    <>
                      <Text style={[styles.emptyIcon]}>📡</Text>
                      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t.scanning}</Text>
                      <Text style={[styles.emptyBody, { color: colors.muted }]}>
                        Make sure your device is powered on and in pairing mode.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.emptyIcon}>🔍</Text>
                      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t.noDevicesFound}</Text>
                      <Text style={[styles.emptyBody, { color: colors.muted }]}>
                        Ensure Bluetooth is enabled and your device is nearby.
                      </Text>
                      <Pressable
                        style={[styles.rescanBtn, { backgroundColor: colors.primary }]}
                        onPress={startScan}
                      >
                        <Text style={[styles.rescanText, { color: colors.background }]}>{t.scanAgain ?? 'Scan Again'}</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              }
            />
          </ScrollView>

          {/* Auto-read toggle */}
          <View style={[styles.autoReadRow, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.autoReadLabel, { color: colors.foreground }]}>{t.autoRead ?? 'Auto-read when connected'}</Text>
              <Text style={[styles.autoReadSub, { color: colors.muted }]}>{t.autoReadSub ?? 'Automatically import readings after pairing'}</Text>
            </View>
            <Switch
              value={autoRead}
              onValueChange={handleAutoReadToggle}
              trackColor={{ false: colors.border, true: colors.primary + '88' }}
              thumbColor={autoRead ? colors.primary : colors.muted}
            />
          </View>
          {/* Disclaimer */}
          <View style={[styles.disclaimerBar, { backgroundColor: colors.warning + '15', borderTopColor: colors.warning + '40' }]}>
            <Text style={[styles.disclaimerText, { color: colors.warning }]}>⚕ {BLE_DISCLAIMER}</Text>
          </View>
          {/* Hint */}
          <View style={[styles.hint, { borderTopColor: colors.border }]}>
            <Text style={[styles.hintText, { color: colors.muted }]}>
              Supported: BP monitors · Glucometers · Smart scales · Heart rate monitors · Pulse oximeters · Thermometers
            </Text>
          </View>
        </Animated.View>
      </Modal>

      {/* Raw GATT result modal */}
      <RawGattModal
        visible={rawModalVisible}
        deviceName={rawDevice?.name ?? ''}
        results={rawResults}
        loading={rawLoading}
        error={rawError}
        onClose={() => setRawModalVisible(false)}
      />

      {/* Rename device sheet */}
      <RenameDeviceSheet
        visible={renameVisible}
        device={renameDevice}
        currentLabel={renameDevice ? (deviceLabels[renameDevice.id] ?? renameDevice.name) : ''}
        onSave={handleRenameSave}
        onClose={() => { setRenameVisible(false); setRenameDevice(null); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', minHeight: 320,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  divider: { height: 0.5, marginVertical: 12 },
  nearbyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sortChips: { flexDirection: 'row', gap: 6 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  sortChipText: { fontSize: 11, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 14,
    borderRadius: 14, borderWidth: 1,
  },
  deviceIcon: { fontSize: 26, marginRight: 12, marginTop: 2 },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  renamedTag: { fontSize: 11, borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  deviceBrand: { fontSize: 12 },
  deviceMeta: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  categoryText: { fontSize: 11, fontWeight: '600' },
  verifiedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  verifiedText: { fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  longPressHint: { fontSize: 10, marginTop: 4 },
  signalContainer: { width: 36, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  signalBar: { width: 4, borderRadius: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  rescanBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  rescanText: { fontSize: 14, fontWeight: '600' },
  hint: { borderTopWidth: 0.5, paddingHorizontal: 20, paddingTop: 12 },
  hintText: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  autoReadRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  autoReadLabel: { fontSize: 14, fontWeight: '600' },
  autoReadSub: { fontSize: 11, marginTop: 1 },
  disclaimerBar: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  disclaimerText: { fontSize: 10, lineHeight: 14, textAlign: 'center' },
});

const rawStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '75%', minHeight: 280,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  subtitle: { fontSize: 12, paddingHorizontal: 20, marginBottom: 8 },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 16, fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  loadingText: { fontSize: 13, marginTop: 12 },
  errorIcon: { fontSize: 36, marginBottom: 12 },
  errorText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  resultRow: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  resultUUIDs: { padding: 12 },
  uuidLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  uuidValue: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  resultValues: { padding: 12, borderTopWidth: 0.5 },
  valueLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  valueText: { fontSize: 13, fontWeight: '500', marginTop: 2 },
});

const renameStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 16,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '600' },
});
