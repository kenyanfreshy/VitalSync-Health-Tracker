/**
 * Bluetooth Manager — services/bluetooth-manager.ts
 *
 * High-level BLE scan-and-connect service that:
 *   1. Maintains a device-name allowlist mapped to device categories
 *   2. Routes each matched device to the correct GATT handler in lib/ble/ble-manager.ts
 *   3. Tracks connection state so the dashboard badge can reflect live status
 *   4. Supports background scanning (isBackgroundEnabled: true in app.config.ts)
 *
 * For raw GATT parsing, see lib/ble/ble-manager.ts.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BleManager } from 'react-native-ble-plx';
import {
  classifyDevice,
  readWeightFromDevice,
  readBPFromDevice,
  readGlucoseFromDevice,
  type DeviceCategory,
} from '@/lib/ble/ble-manager';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BleConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export type ConnectedDevice = {
  id: string;
  name: string;
  category: DeviceCategory | 'unknown';
};

export type BleDataCallback = {
  onWeightData?: (records: Awaited<ReturnType<typeof readWeightFromDevice>>) => void;
  onBPData?: (records: Awaited<ReturnType<typeof readBPFromDevice>>) => void;
  onGlucoseData?: (records: Awaited<ReturnType<typeof readGlucoseFromDevice>>) => void;
};

// ─── Device-name allowlist ────────────────────────────────────────────────────
// Maps name fragments → category so scanAndConnect can route to the right handler.
// Extend this list as new clinical monitors are certified.
const DEVICE_ALLOWLIST: { fragment: string; category: DeviceCategory }[] = [
  // Pulse oximeters
  { fragment: 'PulseOx',   category: 'fitness-tracker' },
  { fragment: 'Nonin',     category: 'fitness-tracker' },
  { fragment: 'Masimo',    category: 'fitness-tracker' },
  // Blood pressure monitors
  { fragment: 'BPMonitor', category: 'bp-monitor' },
  { fragment: 'OMRON',     category: 'bp-monitor' },
  { fragment: 'Omron',     category: 'bp-monitor' },
  { fragment: 'HEM-',      category: 'bp-monitor' },
  { fragment: 'Withings BPM', category: 'bp-monitor' },
  { fragment: 'QardioArm', category: 'bp-monitor' },
  { fragment: 'iHealth',   category: 'bp-monitor' },
  { fragment: 'A&D',       category: 'bp-monitor' },
  { fragment: 'UA-',       category: 'bp-monitor' },
  // Smart scales
  { fragment: 'SmartScale', category: 'scale' },
  { fragment: 'Withings',  category: 'scale' },
  { fragment: 'WBS',       category: 'scale' },
  { fragment: 'RENPHO',    category: 'scale' },
  { fragment: 'Renpho',    category: 'scale' },
  { fragment: 'eufy',      category: 'scale' },
  { fragment: 'Eufy',      category: 'scale' },
  { fragment: 'Tanita',    category: 'scale' },
  { fragment: 'QardioBase', category: 'scale' },
  // Glucometers
  { fragment: 'Glucometer', category: 'glucometer' },
  { fragment: 'Contour',   category: 'glucometer' },
  { fragment: 'CONTOUR',   category: 'glucometer' },
  { fragment: 'Accu-Chek', category: 'glucometer' },
  { fragment: 'OneTouch',  category: 'glucometer' },
  { fragment: 'FreeStyle', category: 'glucometer' },
  { fragment: 'Dexcom',    category: 'glucometer' },
  { fragment: 'Libre',     category: 'glucometer' },
];

function matchAllowlist(deviceName: string): DeviceCategory | null {
  for (const entry of DEVICE_ALLOWLIST) {
    if (deviceName.includes(entry.fragment)) return entry.category;
  }
  return null;
}

// ─── Singleton BleManager instance ───────────────────────────────────────────
// Only instantiate on native — BleManager throws on web.
export const manager: BleManager | null =
  Platform.OS !== 'web' ? new BleManager() : null;

// ─── Connection state (subscribe via setConnectionStateListener) ──────────────
let _connectionState: BleConnectionState = 'idle';
let _connectedDevice: ConnectedDevice | null = null;
let _stateListeners: Array<(state: BleConnectionState, device: ConnectedDevice | null) => void> = [];

/** AsyncStorage key for the last successfully connected BLE device name. */
export const LAST_BLE_DEVICE_KEY = '@vsht:last_ble_device';

function setConnectionState(state: BleConnectionState, device: ConnectedDevice | null = null) {
  _connectionState = state;
  _connectedDevice = device;
  _stateListeners.forEach((fn) => fn(state, device));
  // Persist the device name whenever a connection is established
  if (state === 'connected' && device?.name) {
    AsyncStorage.setItem(LAST_BLE_DEVICE_KEY, device.name).catch(() => {});
  }
}

/** Subscribe to BLE connection state changes (for the dashboard badge). */
export function setConnectionStateListener(
  fn: (state: BleConnectionState, device: ConnectedDevice | null) => void,
): () => void {
  _stateListeners.push(fn);
  // Emit current state immediately so the subscriber can initialise
  fn(_connectionState, _connectedDevice);
  return () => {
    _stateListeners = _stateListeners.filter((l) => l !== fn);
  };
}

/** Returns the current connection state synchronously (for initial render). */
export function getConnectionState(): { state: BleConnectionState; device: ConnectedDevice | null } {
  return { state: _connectionState, device: _connectedDevice };
}

/**
 * Allows external callers (e.g., weight/BP log screens) to push a connection
 * state update so the dashboard badge reflects manual BT sync flows too.
 */
export function notifyBleState(state: BleConnectionState, device: ConnectedDevice | null = null) {
  setConnectionState(state, device);
}

// ─── Core scan-and-connect ────────────────────────────────────────────────────

/**
 * Scans for nearby BLE health devices, connects to the first allowlisted device
 * found, reads its data via the appropriate GATT handler, and fires the relevant
 * data callback.
 *
 * Works in the foreground and (on iOS/Android with background entitlements) in
 * the background when the app is suspended.
 *
 * @param callbacks  Optional handlers for each data type.
 * @param timeoutMs  Stop scanning after this many ms (default 15 s).
 */
export const scanAndConnect = (
  callbacks: BleDataCallback = {},
  timeoutMs = 15000,
): (() => void) => {
  if (!manager) {
    console.log('[BLE] Not available on web — skipping scan');
    return () => {};
  }

  setConnectionState('scanning');
  const stopTimeout = setTimeout(() => {
    manager.stopDeviceScan();
    if (_connectionState === 'scanning') setConnectionState('idle');
  }, timeoutMs);

  manager.startDeviceScan(
    null, // scan all service UUIDs
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        console.log('[BLE] Scan error:', error);
        clearTimeout(stopTimeout);
        setConnectionState('error');
        return;
      }
      if (!device) return;

      const name = device.name ?? device.localName ?? '';
      if (!name) return;

      // Check allowlist first; fall back to GATT service-UUID classification
      const serviceUUIDs: string[] = (device.serviceUUIDs ?? []).map((u: string) => u.toLowerCase());
      const allowedCategory = matchAllowlist(name) ?? classifyDevice(name, serviceUUIDs).category;

      if (allowedCategory === 'unknown' || allowedCategory === 'fitness-tracker') return;

      // Found a health device — stop scanning and connect
      manager.stopDeviceScan();
      clearTimeout(stopTimeout);
      setConnectionState('connecting', { id: device.id, name, category: allowedCategory });

      (async () => {
        try {
          const connected = await device.connect();
          await connected.discoverAllServicesAndCharacteristics();
          setConnectionState('connected', { id: device.id, name, category: allowedCategory });
          console.log(`[BLE] Connected to ${name} (${allowedCategory})`);

          // Route to the correct GATT handler
          if (allowedCategory === 'scale') {
            const records = await readWeightFromDevice(device.id);
            console.log(`[BLE] ⚖️  Weight samples: ${records.length}`);
            callbacks.onWeightData?.(records);
          } else if (allowedCategory === 'bp-monitor') {
            const records = await readBPFromDevice(device.id);
            console.log(`[BLE] 🩺 BP samples: ${records.length}`);
            callbacks.onBPData?.(records);
          } else if (allowedCategory === 'glucometer' || allowedCategory === 'cgm') {
            const records = await readGlucoseFromDevice(device.id);
            console.log(`[BLE] 🩸 Glucose samples: ${records.length}`);
            callbacks.onGlucoseData?.(records);
          }

          // Disconnect after reading — saves battery
          await connected.cancelConnection();
          setConnectionState('idle');
        } catch (connectError) {
          console.log('[BLE] Connection error:', connectError);
          setConnectionState('error');
        }
      })();
    },
  );

  // Return a stop function so callers can cancel the scan early
  return () => {
    manager.stopDeviceScan();
    clearTimeout(stopTimeout);
    if (_connectionState === 'scanning') setConnectionState('idle');
  };
};

/** Destroy the BLE manager on app close to free native resources. */
export function destroyManager() {
  if (manager) {
    manager.destroy();
  }
}
