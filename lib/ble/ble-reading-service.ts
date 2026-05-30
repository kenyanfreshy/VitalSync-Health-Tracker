/**
 * ble-reading-service.ts
 *
 * Unified BLE read-after-connect layer for VitalSync.
 * Routes to the correct GATT read function based on device category,
 * handles deduplication, and persists the auto-read preference.
 *
 * Disclaimer: Bluetooth readings are for personal tracking only.
 * VitalSync does not provide medical advice, diagnosis, or treatment.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  DeviceCategory,
  ScannedDevice,
  readBPFromDevice,
  readGlucoseFromDevice,
  readWeightFromDevice,
  readHeartRateFromDevice,
  readSpO2FromDevice,
  readTemperatureFromDevice,
} from './ble-manager';
import type { VitalSignsRecord, WeightRecord, BloodSugarRecord } from '@/lib/health/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_READ_KEY = '@vitalsync/ble_auto_read';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BleReadResult =
  | { type: 'vital-signs'; records: VitalSignsRecord[] }
  | { type: 'weight'; records: WeightRecord[] }
  | { type: 'blood-sugar'; records: BloodSugarRecord[] }
  | { type: 'unsupported'; reason: string }
  | { type: 'no-service'; deviceName: string }
  | { type: 'error'; message: string };

/** Categories that have a direct GATT read implementation */
const SUPPORTED_CATEGORIES: DeviceCategory[] = [
  'bp-monitor',
  'glucometer',
  'cgm',
  'scale',
  'heart-rate-monitor',
  'pulse-oximeter',
  'thermometer',
];

// ─── Auto-read preference ─────────────────────────────────────────────────────

export async function getAutoReadEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(AUTO_READ_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setAutoReadEnabled(enabled: boolean): Promise<void> {
  try {
    await safeSetItem(AUTO_READ_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

// ─── Deduplication helpers ────────────────────────────────────────────────────

/**
 * Build a fingerprint string for a vital-signs record to detect duplicates.
 * Uses deviceName + rounded-minute timestamp + key values.
 */
function vitalFingerprint(r: VitalSignsRecord): string {
  const minuteTs = r.timestamp.slice(0, 16); // "YYYY-MM-DDTHH:MM"
  const parts = [
    r.deviceName ?? '',
    minuteTs,
    r.heartRate ?? '',
    r.systolic ?? '',
    r.diastolic ?? '',
    r.oxygenSaturation ?? '',
    r.temperature ?? '',
  ];
  return parts.join('|');
}

function weightFingerprint(r: WeightRecord): string {
  const minuteTs = r.timestamp.slice(0, 16);
  return `${r.deviceName ?? ''}|${minuteTs}|${r.weightKg}`;
}

function sugarFingerprint(r: BloodSugarRecord): string {
  const minuteTs = r.timestamp.slice(0, 16);
  return `${r.deviceName ?? ''}|${minuteTs}|${r.glucoseMgDl}`;
}

export function deduplicateVitalSigns(
  incoming: VitalSignsRecord[],
  existing: VitalSignsRecord[]
): VitalSignsRecord[] {
  const existingIds = new Set(existing.map((r) => r.id));
  const existingFingerprints = new Set(existing.map(vitalFingerprint));
  return incoming.filter(
    (r) => !existingIds.has(r.id) && !existingFingerprints.has(vitalFingerprint(r))
  );
}

export function deduplicateWeight(
  incoming: WeightRecord[],
  existing: WeightRecord[]
): WeightRecord[] {
  const existingIds = new Set(existing.map((r) => r.id));
  const existingFingerprints = new Set(existing.map(weightFingerprint));
  return incoming.filter(
    (r) => !existingIds.has(r.id) && !existingFingerprints.has(weightFingerprint(r))
  );
}

export function deduplicateBloodSugar(
  incoming: BloodSugarRecord[],
  existing: BloodSugarRecord[]
): BloodSugarRecord[] {
  const existingIds = new Set(existing.map((r) => r.id));
  const existingFingerprints = new Set(existing.map(sugarFingerprint));
  return incoming.filter(
    (r) => !existingIds.has(r.id) && !existingFingerprints.has(sugarFingerprint(r))
  );
}

// ─── Main read dispatcher ─────────────────────────────────────────────────────

/**
 * Read health data from a connected BLE device, routing to the correct
 * GATT read function based on the device's category.
 *
 * Returns a typed BleReadResult that the caller can use to save data
 * and display appropriate UI.
 */
export async function readDeviceByCategory(
  device: ScannedDevice
): Promise<BleReadResult> {
  const category = device.category as DeviceCategory | 'unknown';

  if (category === 'unknown' || !SUPPORTED_CATEGORIES.includes(category as DeviceCategory)) {
    return {
      type: 'unsupported',
      reason: `${device.name} does not expose a supported health service. Supported devices: BP monitors, glucometers, smart scales, heart rate monitors, pulse oximeters, and thermometers.`,
    };
  }

  try {
    switch (category) {
      case 'bp-monitor': {
        const records = await readBPFromDevice(device.id);
        if (!records.length) return { type: 'no-service', deviceName: device.name };
        return {
          type: 'vital-signs',
          records: records.map((r) => ({ ...r, deviceName: r.deviceName ?? device.name, source: 'device' as const })),
        };
      }

      case 'glucometer':
      case 'cgm': {
        const records = await readGlucoseFromDevice(device.id);
        if (!records.length) return { type: 'no-service', deviceName: device.name };
        return {
          type: 'blood-sugar',
          records: records.map((r) => ({ ...r, deviceName: r.deviceName ?? device.name, source: 'device' as const })),
        };
      }

      case 'scale': {
        const records = await readWeightFromDevice(device.id);
        if (!records.length) return { type: 'no-service', deviceName: device.name };
        return {
          type: 'weight',
          records: records.map((r) => ({ ...r, deviceName: r.deviceName ?? device.name, source: 'device' as const })),
        };
      }

      case 'heart-rate-monitor': {
        const records = await readHeartRateFromDevice(device.id);
        if (!records.length) return { type: 'no-service', deviceName: device.name };
        return {
          type: 'vital-signs',
          records: records.map((r) => ({ ...r, deviceName: r.deviceName ?? device.name, source: 'device' as const })),
        };
      }

      case 'pulse-oximeter': {
        const records = await readSpO2FromDevice(device.id);
        if (!records.length) return { type: 'no-service', deviceName: device.name };
        return {
          type: 'vital-signs',
          records: records.map((r) => ({ ...r, deviceName: r.deviceName ?? device.name, source: 'device' as const })),
        };
      }

      case 'thermometer': {
        const records = await readTemperatureFromDevice(device.id);
        if (!records.length) return { type: 'no-service', deviceName: device.name };
        return {
          type: 'vital-signs',
          records: records.map((r) => ({ ...r, deviceName: r.deviceName ?? device.name, source: 'device' as const })),
        };
      }

      default:
        return {
          type: 'unsupported',
          reason: `No read implementation for category: ${category}`,
        };
    }
  } catch (err: any) {
    return {
      type: 'error',
      message: err?.message ?? 'Failed to read from device. Ensure it is powered on and in range.',
    };
  }
}

// ─── Human-readable result summary ───────────────────────────────────────────

export function bleReadSummary(result: BleReadResult, deviceName: string): string {
  switch (result.type) {
    case 'vital-signs':
      return `Imported ${result.records.length} reading${result.records.length !== 1 ? 's' : ''} from ${deviceName}.`;
    case 'weight':
      return `Imported ${result.records.length} weight reading${result.records.length !== 1 ? 's' : ''} from ${deviceName}.`;
    case 'blood-sugar':
      return `Imported ${result.records.length} glucose reading${result.records.length !== 1 ? 's' : ''} from ${deviceName}.`;
    case 'no-service':
      return `${deviceName} is connected but no readable health service was found. The device may require its companion app.`;
    case 'unsupported':
      return result.reason;
    case 'error':
      return result.message;
  }
}

// ─── BLE disclaimer text ──────────────────────────────────────────────────────
export const BLE_DISCLAIMER =
  'Bluetooth readings are for personal tracking only. VitalSync does not provide medical advice, diagnosis, or treatment.';
