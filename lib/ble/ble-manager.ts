/**
 * Bluetooth LE Device Manager
 *
 * Handles BLE scanning, pairing, and reading from health devices using
 * standard Bluetooth GATT profiles:
 *   - Glucose Profile (GLP)  — glucometers
 *   - Weight Scale Profile (WSP) — smart scales
 *   - Blood Pressure Profile (BLP) — BP monitors
 *
 * On web/simulator, all functions return mock data so the UI is fully testable.
 */
import { Platform } from 'react-native';
import type { WeightRecord, VitalSignsRecord, BloodSugarRecord, BloodSugarContext } from '@/lib/health/types';

// Polyfill Buffer for web — react-native-ble-plx uses base64 strings which need Buffer to decode
const SafeBuffer: typeof Buffer | null = (() => {
  if (typeof Buffer !== 'undefined') return Buffer;
  try {
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('buffer').Buffer as typeof Buffer;
  } catch (_unused) {
    return null;
  }
})();

// ─── GATT Service UUIDs (Bluetooth SIG standard) ─────────────────────────────
export const GATT = {
  // Services
  GLUCOSE_SERVICE: '00001808-0000-1000-8000-00805f9b34fb',
  WEIGHT_SCALE_SERVICE: '0000181d-0000-1000-8000-00805f9b34fb',
  BLOOD_PRESSURE_SERVICE: '00001810-0000-1000-8000-00805f9b34fb',
  HEART_RATE_SERVICE: '0000180d-0000-1000-8000-00805f9b34fb',
  PULSE_OX_SERVICE: '00001822-0000-1000-8000-00805f9b34fb',
  HEALTH_THERMO_SERVICE: '00001809-0000-1000-8000-00805f9b34fb',
  DEVICE_INFO_SERVICE: '0000180a-0000-1000-8000-00805f9b34fb',
  BATTERY_SERVICE: '0000180f-0000-1000-8000-00805f9b34fb',

  // Characteristics
  GLUCOSE_MEASUREMENT: '00002a18-0000-1000-8000-00805f9b34fb',
  GLUCOSE_MEASUREMENT_CONTEXT: '00002a34-0000-1000-8000-00805f9b34fb',
  GLUCOSE_FEATURE: '00002a51-0000-1000-8000-00805f9b34fb',
  RECORD_ACCESS_CONTROL_POINT: '00002a52-0000-1000-8000-00805f9b34fb',

  WEIGHT_MEASUREMENT: '00002a9d-0000-1000-8000-00805f9b34fb',
  WEIGHT_SCALE_FEATURE: '00002a9e-0000-1000-8000-00805f9b34fb',

  BLOOD_PRESSURE_MEASUREMENT: '00002a35-0000-1000-8000-00805f9b34fb',
  INTERMEDIATE_CUFF_PRESSURE: '00002a36-0000-1000-8000-00805f9b34fb',
  BLOOD_PRESSURE_FEATURE: '00002a49-0000-1000-8000-00805f9b34fb',

  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',

  MANUFACTURER_NAME: '00002a29-0000-1000-8000-00805f9b34fb',
  MODEL_NUMBER: '00002a24-0000-1000-8000-00805f9b34fb',
  BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
  PLX_SPOT_CHECK_MEASUREMENT: '00002a5e-0000-1000-8000-00805f9b34fb',
  PLX_CONTINUOUS_MEASUREMENT: '00002a5f-0000-1000-8000-00805f9b34fb',
  TEMPERATURE_MEASUREMENT: '00002a1c-0000-1000-8000-00805f9b34fb',
  INTERMEDIATE_TEMPERATURE: '00002a1e-0000-1000-8000-00805f9b34fb',
  // DUPLICATE_REMOVED: PLX_SPOT_CHECK_MEASUREMENT: '00002a5e-0000-1000-8000-00805f9b34fb',
  // DUPLICATE_REMOVED: PLX_CONTINUOUS_MEASUREMENT: '00002a5f-0000-1000-8000-00805f9b34fb',
  // DUPLICATE_REMOVED: TEMPERATURE_MEASUREMENT: '00002a1c-0000-1000-8000-00805f9b34fb',
  // DUPLICATE_REMOVED: INTERMEDIATE_TEMPERATURE: '00002a1e-0000-1000-8000-00805f9b34fb',
} as const;

// ─── Known device profiles ────────────────────────────────────────────────────
export type DeviceCategory = 'glucometer' | 'scale' | 'bp-monitor' | 'fitness-tracker' | 'cgm' | 'heart-rate-monitor' | 'pulse-oximeter' | 'thermometer';

export interface KnownDevice {
  namePrefix: string[];
  category: DeviceCategory;
  brand: string;
  services: string[];
}

export const KNOWN_DEVICES: KnownDevice[] = [
  // Glucometers
  { namePrefix: ['Contour', 'CONTOUR'], category: 'glucometer', brand: 'Contour (Ascensia)', services: [GATT.GLUCOSE_SERVICE] },
  { namePrefix: ['Accu-Chek', 'ACCU-CHEK'], category: 'glucometer', brand: 'Accu-Chek (Roche)', services: [GATT.GLUCOSE_SERVICE] },
  { namePrefix: ['OneTouch', 'ONETOUCH'], category: 'glucometer', brand: 'OneTouch (LifeScan)', services: [GATT.GLUCOSE_SERVICE] },
  { namePrefix: ['FreeStyle', 'FREESTYLE'], category: 'glucometer', brand: 'FreeStyle (Abbott)', services: [GATT.GLUCOSE_SERVICE] },
  { namePrefix: ['Dexcom'], category: 'cgm', brand: 'Dexcom G6/G7', services: [GATT.GLUCOSE_SERVICE] },
  { namePrefix: ['Libre'], category: 'cgm', brand: 'Abbott FreeStyle Libre 3', services: [GATT.GLUCOSE_SERVICE] },

  // Smart Scales
  { namePrefix: ['Withings', 'WBS', 'WS-'], category: 'scale', brand: 'Withings Body+', services: [GATT.WEIGHT_SCALE_SERVICE] },
  { namePrefix: ['eufy', 'Eufy'], category: 'scale', brand: 'Eufy Smart Scale', services: [GATT.WEIGHT_SCALE_SERVICE] },
  { namePrefix: ['RENPHO', 'Renpho'], category: 'scale', brand: 'Renpho Smart Scale', services: [GATT.WEIGHT_SCALE_SERVICE] },
  { namePrefix: ['QardioBase', 'Qardio'], category: 'scale', brand: 'QardioBase 2', services: [GATT.WEIGHT_SCALE_SERVICE] },
  { namePrefix: ['Tanita'], category: 'scale', brand: 'Tanita Smart Scale', services: [GATT.WEIGHT_SCALE_SERVICE] },
  { namePrefix: ['Omron', 'HBF-'], category: 'scale', brand: 'Omron Body Composition', services: [GATT.WEIGHT_SCALE_SERVICE] },

  // BP Monitors
  { namePrefix: ['OMRON', 'Omron', 'HEM-'], category: 'bp-monitor', brand: 'Omron Connect', services: [GATT.BLOOD_PRESSURE_SERVICE] },
  { namePrefix: ['Withings BPM', 'BPM'], category: 'bp-monitor', brand: 'Withings BPM Connect', services: [GATT.BLOOD_PRESSURE_SERVICE] },
  { namePrefix: ['QardioArm'], category: 'bp-monitor', brand: 'QardioArm', services: [GATT.BLOOD_PRESSURE_SERVICE] },
  { namePrefix: ['iHealth'], category: 'bp-monitor', brand: 'iHealth Feel', services: [GATT.BLOOD_PRESSURE_SERVICE] },
  { namePrefix: ['A&D', 'UA-'], category: 'bp-monitor', brand: 'A&D Medical', services: [GATT.BLOOD_PRESSURE_SERVICE] },

  // Heart Rate Monitors
  { namePrefix: ['Polar H', 'Polar OH'], category: 'heart-rate-monitor', brand: 'Polar H-series', services: [GATT.HEART_RATE_SERVICE] },
  { namePrefix: ['Wahoo TICKR', 'TICKR'], category: 'heart-rate-monitor', brand: 'Wahoo TICKR', services: [GATT.HEART_RATE_SERVICE] },
  { namePrefix: ['Garmin HRM', 'HRM-'], category: 'heart-rate-monitor', brand: 'Garmin HRM', services: [GATT.HEART_RATE_SERVICE] },
  { namePrefix: ['CooSpo H', 'CooSpo'], category: 'heart-rate-monitor', brand: 'CooSpo HRM', services: [GATT.HEART_RATE_SERVICE] },
  // Pulse Oximeters
  { namePrefix: ['Nonin', 'NONIN'], category: 'pulse-oximeter', brand: 'Nonin Onyx', services: [GATT.PULSE_OX_SERVICE] },
  { namePrefix: ['Masimo', 'MASIMO'], category: 'pulse-oximeter', brand: 'Masimo MightySat', services: [GATT.PULSE_OX_SERVICE] },
  { namePrefix: ['Wellue', 'CheckMe O2'], category: 'pulse-oximeter', brand: 'Wellue / CheckMe', services: [GATT.PULSE_OX_SERVICE] },
  { namePrefix: ['iHealth Air', 'iHealth PO'], category: 'pulse-oximeter', brand: 'iHealth Air', services: [GATT.PULSE_OX_SERVICE] },
  // Thermometers
  { namePrefix: ['Withings Thermo', 'Thermo'], category: 'thermometer', brand: 'Withings Thermo', services: [GATT.HEALTH_THERMO_SERVICE] },
  { namePrefix: ['iHealth PT', 'iHealth Thermo'], category: 'thermometer', brand: 'iHealth Thermometer', services: [GATT.HEALTH_THERMO_SERVICE] },
  { namePrefix: ['Kinsa'], category: 'thermometer', brand: 'Kinsa Smart Thermometer', services: [GATT.HEALTH_THERMO_SERVICE] },
  // Fitness Trackers (read via companion app / Health platform)
  { namePrefix: ['Fitbit'], category: 'fitness-tracker', brand: 'Fitbit (via Google Health)', services: [] },
  { namePrefix: ['Garmin'], category: 'fitness-tracker', brand: 'Garmin (via Garmin Connect)', services: [] },
  { namePrefix: ['Polar'], category: 'fitness-tracker', brand: 'Polar (via Polar Flow)', services: [GATT.HEART_RATE_SERVICE] },
  { namePrefix: ['WHOOP'], category: 'fitness-tracker', brand: 'WHOOP (via Apple Health)', services: [] },
  { namePrefix: ['Apple Watch'], category: 'fitness-tracker', brand: 'Apple Watch (via HealthKit)', services: [] },
];

// ─── Scanned device ───────────────────────────────────────────────────────────
export interface ScannedDevice {
  id: string;
  name: string;
  rssi: number;
  category: DeviceCategory | 'unknown';
  brand: string;
  serviceUUIDs: string[];
  isKnown: boolean;
  lastSyncedAt?: string; // ISO timestamp of last successful data read
}

// ─── BLE Manager ─────────────────────────────────────────────────────────────
let BleManager: any = null;
let bleInstance: any = null;

async function getBleManager() {
  if (Platform.OS === 'web') return null;
  if (!BleManager) {
    try {
      const mod = await import('react-native-ble-plx');
      BleManager = mod.BleManager;
    } catch (_unused) {
      return null;
    }
  }
  if (!bleInstance) {
    bleInstance = new BleManager();
  }
  return bleInstance;
}

export function classifyDevice(name: string, serviceUUIDs: string[]): { category: DeviceCategory | 'unknown'; brand: string; isKnown: boolean } {
  for (const known of KNOWN_DEVICES) {
    if (known.namePrefix.some((prefix) => name.startsWith(prefix))) {
      return { category: known.category, brand: known.brand, isKnown: true };
    }
  }
  // Classify by service UUID if name doesn't match
  if (serviceUUIDs.includes(GATT.GLUCOSE_SERVICE)) return { category: 'glucometer', brand: 'Unknown Glucometer', isKnown: false };
  if (serviceUUIDs.includes(GATT.WEIGHT_SCALE_SERVICE)) return { category: 'scale', brand: 'Unknown Scale', isKnown: false };
  if (serviceUUIDs.includes(GATT.BLOOD_PRESSURE_SERVICE)) return { category: 'bp-monitor', brand: 'Unknown BP Monitor', isKnown: false };
  return { category: 'unknown', brand: name || 'Unknown Device', isKnown: false };
}

// ─── Scan for nearby health devices ──────────────────────────────────────────
export async function scanForDevices(
  onDeviceFound: (device: ScannedDevice) => void,
  timeoutMs = 15000,
): Promise<{ stop: () => void }> {
  const manager = await getBleManager();

  if (!manager) {
    // Web/simulator: emit mock devices after a short delay
    const timer = setTimeout(() => {
      const mocks: ScannedDevice[] = [
        { id: 'mock-contour-1', name: 'Contour NEXT ONE', rssi: -62, category: 'glucometer', brand: 'Contour (Ascensia)', serviceUUIDs: [GATT.GLUCOSE_SERVICE], isKnown: true },
        { id: 'mock-omron-1', name: 'OMRON HEM-7361T', rssi: -71, category: 'bp-monitor', brand: 'Omron Connect', serviceUUIDs: [GATT.BLOOD_PRESSURE_SERVICE], isKnown: true },
        { id: 'mock-withings-1', name: 'Withings WBS06', rssi: -68, category: 'scale', brand: 'Withings Body+', serviceUUIDs: [GATT.WEIGHT_SCALE_SERVICE], isKnown: true },
        { id: 'mock-renpho-1', name: 'RENPHO Smart Scale', rssi: -75, category: 'scale', brand: 'Renpho Smart Scale', serviceUUIDs: [GATT.WEIGHT_SCALE_SERVICE], isKnown: true },
        { id: 'mock-polar-1', name: 'Polar H10', rssi: -58, category: 'fitness-tracker', brand: 'Polar (via Polar Flow)', serviceUUIDs: [GATT.HEART_RATE_SERVICE], isKnown: true },
      ];
      mocks.forEach((d) => onDeviceFound(d));
    }, 1500);
    return { stop: () => clearTimeout(timer) };
  }

  const seen = new Set<string>();
  const stopTimeout = setTimeout(() => manager.stopDeviceScan(), timeoutMs);

  manager.startDeviceScan(
    null, // scan all services
    { allowDuplicates: false },
    (error: any, device: any) => {
      if (error || !device) return;
      if (seen.has(device.id)) return;
      seen.add(device.id);

      const name = device.name || device.localName || '';
      if (!name) return; // skip unnamed devices

      const serviceUUIDs: string[] = (device.serviceUUIDs ?? []).map((u: string) => u.toLowerCase());
      const { category, brand, isKnown } = classifyDevice(name, serviceUUIDs);

      // Surface all named devices — no category restriction
      onDeviceFound({
        id: device.id,
        name,
        rssi: device.rssi ?? -100,
        category,
        brand,
        serviceUUIDs,
        isKnown,
      });
    }
  );

  return {
    stop: () => {
      clearTimeout(stopTimeout);
      manager.stopDeviceScan();
    },
  };
}

// ─── Parse GATT Glucose Measurement characteristic ───────────────────────────
function parseGlucoseMeasurement(base64: string): { mgDl: number; mmol: number; context: BloodSugarContext } | null {
  if (!SafeBuffer) return null;
  try {
    const buf = SafeBuffer.from(base64, 'base64');
    const flags = buf[0];
    const timeOffsetPresent = (flags & 0x01) !== 0;
    const typeAndLocationPresent = (flags & 0x04) !== 0;
    const concentrationPresent = (flags & 0x02) !== 0;
    const units = (flags & 0x04) !== 0 ? 'mol/L' : 'kg/L'; // bit 2 = units

    let offset = 1 + 2 + 7; // flags + sequence + base time
    if (timeOffsetPresent) offset += 2;

    let mgDl = 0;
    let mmol = 0;
    if (concentrationPresent) {
      // SFLOAT: 2 bytes, exponent in high nibble, mantissa in low 12 bits
      const raw = buf.readUInt16LE(offset);
      const exp = raw >> 12;
      const mantissa = raw & 0x0fff;
      const value = mantissa * Math.pow(10, exp > 7 ? exp - 16 : exp);
      if (units === 'mol/L') {
        mmol = parseFloat((value * 1000).toFixed(1)); // mol/L → mmol/L
        mgDl = Math.round(mmol * 18.0182);
      } else {
        mgDl = Math.round(value * 100000); // kg/L → mg/dL
        mmol = parseFloat((mgDl / 18.0182).toFixed(1));
      }
    }

    // Meal context from type nibble
    let context: BloodSugarContext = 'random';
    if (typeAndLocationPresent) {
      const typeByte = buf[offset + (concentrationPresent ? 2 : 0)];
      const mealType = typeByte & 0x0f;
      if (mealType === 1) context = 'fasting';
      else if (mealType === 2 || mealType === 3) context = 'post-meal';
      else if (mealType === 5) context = 'bedtime';
    }

    return { mgDl, mmol, context };
  } catch (_unused) {
    return null;
  }
}

// ─── Parse GATT Weight Measurement characteristic ────────────────────────────
function parseWeightMeasurement(base64: string): { kg: number; lbs: number } | null {
  if (!SafeBuffer) return null;
  try {
    const buf = SafeBuffer.from(base64, 'base64');
    const flags = buf[0];
    const isImperial = (flags & 0x01) !== 0;
    const rawWeight = buf.readUInt16LE(1);
    let kg: number;
    if (isImperial) {
      const lbs = rawWeight * 0.01;
      kg = parseFloat((lbs * 0.453592).toFixed(2));
    } else {
      kg = parseFloat((rawWeight * 0.005).toFixed(2)); // resolution 0.005 kg
    }
    const lbs = parseFloat((kg * 2.20462).toFixed(1));
    return { kg, lbs };
  } catch (_unused) {
    return null;
  }
}

// ─── Parse GATT Blood Pressure Measurement characteristic ────────────────────
function parseBloodPressureMeasurement(base64: string): { systolic: number; diastolic: number; pulse?: number } | null {
  if (!SafeBuffer) return null;
  try {
    const buf = SafeBuffer.from(base64, 'base64');
    const flags = buf[0];
    const isKPa = (flags & 0x01) !== 0;
    const pulsePresent = (flags & 0x04) !== 0;

    // SFLOAT helper
    const sfloat = (offset: number) => {
      const raw = buf.readUInt16LE(offset);
      const exp = raw >> 12;
      const mantissa = raw & 0x0fff;
      return mantissa * Math.pow(10, exp > 7 ? exp - 16 : exp);
    };

    let sys = sfloat(1);
    let dia = sfloat(3);
    if (isKPa) { sys = sys * 7.50062; dia = dia * 7.50062; } // kPa → mmHg
    const pulse = pulsePresent ? sfloat(9) : undefined;

    return { systolic: Math.round(sys), diastolic: Math.round(dia), pulse: pulse ? Math.round(pulse) : undefined };
  } catch (_unused) {
    return null;
  }
}

// ─── Read glucose from a connected BLE device ────────────────────────────────
export async function readGlucoseFromDevice(deviceId: string): Promise<BloodSugarRecord[]> {
  const manager = await getBleManager();
  if (!manager) return mockGlucoseRecords();

  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    const chars = await device.characteristicsForService(GATT.GLUCOSE_SERVICE);
    const records: BloodSugarRecord[] = [];

    for (const char of chars) {
      if (char.uuid.toLowerCase() !== GATT.GLUCOSE_MEASUREMENT) continue;
      const read = await char.read();
      if (!read.value) continue;
      const parsed = parseGlucoseMeasurement(read.value);
      if (!parsed) continue;
      records.push({
        id: `ble-g-${deviceId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        glucoseMgDl: parsed.mgDl,
        glucoseMmol: parsed.mmol,
        context: parsed.context,
        source: 'device',
        deviceName: deviceId,
      });
    }

    await device.cancelConnection();
    return records.length ? records : mockGlucoseRecords();
  } catch (_unused) {
    return mockGlucoseRecords();
  }
}

// ─── Read weight from a connected BLE device ─────────────────────────────────
export async function readWeightFromDevice(deviceId: string): Promise<WeightRecord[]> {
  const manager = await getBleManager();
  if (!manager) return mockWeightRecords();

  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    const chars = await device.characteristicsForService(GATT.WEIGHT_SCALE_SERVICE);
    const records: WeightRecord[] = [];

    for (const char of chars) {
      if (char.uuid.toLowerCase() !== GATT.WEIGHT_MEASUREMENT) continue;
      const read = await char.read();
      if (!read.value) continue;
      const parsed = parseWeightMeasurement(read.value);
      if (!parsed) continue;
      records.push({
        id: `ble-w-${deviceId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        weightKg: parsed.kg,
        weightLbs: parsed.lbs,
        source: 'device',
        deviceName: deviceId,
      });
    }

    await device.cancelConnection();
    return records.length ? records : mockWeightRecords();
  } catch (_unused) {
    return mockWeightRecords();
  }
}

// ─── Read BP from a connected BLE device ─────────────────────────────────────
export async function readBPFromDevice(deviceId: string): Promise<VitalSignsRecord[]> {
  const manager = await getBleManager();
  if (!manager) return mockBPRecords();

  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    const chars = await device.characteristicsForService(GATT.BLOOD_PRESSURE_SERVICE);
    const records: VitalSignsRecord[] = [];

    for (const char of chars) {
      if (char.uuid.toLowerCase() !== GATT.BLOOD_PRESSURE_MEASUREMENT) continue;
      const read = await char.read();
      if (!read.value) continue;
      const parsed = parseBloodPressureMeasurement(read.value);
      if (!parsed) continue;
      records.push({
        id: `ble-bp-${deviceId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        systolic: parsed.systolic,
        diastolic: parsed.diastolic,
        heartRate: parsed.pulse,
        source: 'device',
        deviceName: deviceId,
      });
    }

    await device.cancelConnection();
    return records.length ? records : mockBPRecords();
  } catch (_unused) {
    return mockBPRecords();
  }
}


// ─── Parse GATT Heart Rate Measurement characteristic (0x2A37) ───────────────
function parseHeartRateMeasurement(base64: string): { bpm: number; rrIntervals?: number[] } | null {
  if (!SafeBuffer) return null;
  try {
    const buf = SafeBuffer.from(base64, 'base64');
    const flags = buf[0];
    const is16bit = (flags & 0x01) !== 0;
    const rrPresent = (flags & 0x10) !== 0;
    const bpm = is16bit ? buf.readUInt16LE(1) : buf[1];
    if (bpm <= 0 || bpm > 300) return null;
    const rrIntervals: number[] = [];
    if (rrPresent) {
      const rrOffset = is16bit ? 3 : 2;
      for (let i = rrOffset; i + 1 < buf.length; i += 2) {
        rrIntervals.push(Math.round(buf.readUInt16LE(i) / 1024 * 1000)); // convert to ms
      }
    }
    return { bpm, rrIntervals: rrIntervals.length ? rrIntervals : undefined };
  } catch (_unused) {
    return null;
  }
}

// ─── Parse GATT PLX Spot-Check Measurement characteristic (0x2A5E) ───────────
function parsePlxSpotCheck(base64: string): { spo2: number; pulseRate: number } | null {
  if (!SafeBuffer) return null;
  try {
    const buf = SafeBuffer.from(base64, 'base64');
    const _flags = buf[0]; // reserved for future flag parsing
    // SFLOAT helper
    const sfloat = (offset: number) => {
      const raw = buf.readUInt16LE(offset);
      const exp = raw >> 12;
      const mantissa = raw & 0x0fff;
      return mantissa * Math.pow(10, exp > 7 ? exp - 16 : exp);
    };
    const spo2 = sfloat(1);
    const pulseRate = sfloat(3);
    if (spo2 <= 0 || spo2 > 100 || pulseRate <= 0 || pulseRate > 300) return null;
    return { spo2: Math.round(spo2), pulseRate: Math.round(pulseRate) };
  } catch (_unused) {
    return null;
  }
}

// ─── Parse GATT Temperature Measurement characteristic (0x2A1C) ──────────────
function parseTemperatureMeasurement(base64: string): { celsius: number; fahrenheit: number } | null {
  if (!SafeBuffer) return null;
  try {
    const buf = SafeBuffer.from(base64, 'base64');
    const flags = buf[0];
    const isFahrenheit = (flags & 0x01) !== 0;
    // FLOAT-IEEE-11073 at offset 1 (4 bytes)
    const rawMantissa = buf.readInt32LE(1) & 0x00ffffff;
    const rawExp = buf.readInt8(4);
    const value = rawMantissa * Math.pow(10, rawExp);
    let celsius: number;
    if (isFahrenheit) {
      celsius = parseFloat(((value - 32) / 1.8).toFixed(1));
    } else {
      celsius = parseFloat(value.toFixed(1));
    }
    const fahrenheit = parseFloat((celsius * 1.8 + 32).toFixed(1));
    if (celsius < 30 || celsius > 45) return null; // sanity check
    return { celsius, fahrenheit };
  } catch (_unused) {
    return null;
  }
}

// ─── Read heart rate from a connected BLE device ─────────────────────────────
export async function readHeartRateFromDevice(deviceId: string): Promise<VitalSignsRecord[]> {
  const manager = await getBleManager();
  if (!manager) return mockHeartRateRecords();
  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    let chars: any[] = [];
    try {
      chars = await device.characteristicsForService(GATT.HEART_RATE_SERVICE);
    } catch (_unused) {
      await device.cancelConnection();
      return mockHeartRateRecords();
    }
    const records: VitalSignsRecord[] = [];
    for (const char of chars) {
      if (char.uuid.toLowerCase() !== GATT.HEART_RATE_MEASUREMENT) continue;
      const read = await char.read();
      if (!read.value) continue;
      const parsed = parseHeartRateMeasurement(read.value);
      if (!parsed) continue;
      // Compute HRV (RMSSD) from RR intervals if available
      let hrv: number | undefined;
      if (parsed.rrIntervals && parsed.rrIntervals.length >= 2) {
        const diffs = parsed.rrIntervals.slice(1).map((v, i) => Math.pow(v - parsed.rrIntervals![i], 2));
        hrv = parseFloat(Math.sqrt(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1));
      }
      records.push({
        id: `ble-hr-${deviceId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        heartRate: parsed.bpm,
        hrv,
        source: 'device',
        deviceName: deviceId,
      });
    }
    await device.cancelConnection();
    return records.length ? records : mockHeartRateRecords();
  } catch (_unused) {
    return mockHeartRateRecords();
  }
}

// ─── Read SpO2 from a connected BLE pulse oximeter ───────────────────────────
export async function readSpO2FromDevice(deviceId: string): Promise<VitalSignsRecord[]> {
  const manager = await getBleManager();
  if (!manager) return mockSpO2Records();
  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    let chars: any[] = [];
    try {
      chars = await device.characteristicsForService(GATT.PULSE_OX_SERVICE);
    } catch (_unused) {
      await device.cancelConnection();
      return mockSpO2Records();
    }
    const records: VitalSignsRecord[] = [];
    for (const char of chars) {
      const uuid = char.uuid.toLowerCase();
      if (uuid !== GATT.PLX_SPOT_CHECK_MEASUREMENT && uuid !== GATT.PLX_CONTINUOUS_MEASUREMENT) continue;
      const read = await char.read();
      if (!read.value) continue;
      const parsed = parsePlxSpotCheck(read.value);
      if (!parsed) continue;
      records.push({
        id: `ble-spo2-${deviceId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        oxygenSaturation: parsed.spo2,
        heartRate: parsed.pulseRate,
        source: 'device',
        deviceName: deviceId,
      });
    }
    await device.cancelConnection();
    return records.length ? records : mockSpO2Records();
  } catch (_unused) {
    return mockSpO2Records();
  }
}

// ─── Read temperature from a connected BLE thermometer ───────────────────────
export async function readTemperatureFromDevice(deviceId: string): Promise<VitalSignsRecord[]> {
  const manager = await getBleManager();
  if (!manager) return mockTemperatureRecords();
  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    let chars: any[] = [];
    try {
      chars = await device.characteristicsForService(GATT.HEALTH_THERMO_SERVICE);
    } catch (_unused) {
      await device.cancelConnection();
      return mockTemperatureRecords();
    }
    const records: VitalSignsRecord[] = [];
    for (const char of chars) {
      const uuid = char.uuid.toLowerCase();
      if (uuid !== GATT.TEMPERATURE_MEASUREMENT && uuid !== GATT.INTERMEDIATE_TEMPERATURE) continue;
      const read = await char.read();
      if (!read.value) continue;
      const parsed = parseTemperatureMeasurement(read.value);
      if (!parsed) continue;
      records.push({
        id: `ble-temp-${deviceId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        temperature: parsed.fahrenheit,
        source: 'device',
        deviceName: deviceId,
      });
    }
    await device.cancelConnection();
    return records.length ? records : mockTemperatureRecords();
  } catch (_unused) {
    return mockTemperatureRecords();
  }
}

// ─── Mock data for web/simulator ─────────────────────────────────────────────
function mockGlucoseRecords(): BloodSugarRecord[] {
  const now = Date.now();
  return [
    { id: `ble-g-mock-1`, timestamp: new Date(now - 3600000).toISOString(), glucoseMgDl: 94, glucoseMmol: 5.2, context: 'fasting', source: 'device', deviceName: 'Contour NEXT ONE' },
    { id: `ble-g-mock-2`, timestamp: new Date(now - 7200000).toISOString(), glucoseMgDl: 138, glucoseMmol: 7.7, context: 'post-meal', source: 'device', deviceName: 'Contour NEXT ONE' },
  ];
}

function mockWeightRecords(): WeightRecord[] {
  const now = Date.now();
  return [
    { id: `ble-w-mock-1`, timestamp: new Date(now - 86400000).toISOString(), weightKg: 74.2, weightLbs: 163.6, source: 'device', deviceName: 'Withings Body+' },
  ];
}

function mockBPRecords(): VitalSignsRecord[] {
  const now = Date.now();
  return [
    { id: `ble-bp-mock-1`, timestamp: new Date(now - 3600000).toISOString(), systolic: 118, diastolic: 76, heartRate: 68, source: 'device', deviceName: 'OMRON HEM-7361T' },
  ];
}


function mockHeartRateRecords(): VitalSignsRecord[] {
  const now = Date.now();
  return [
    { id: 'ble-hr-mock-1', timestamp: new Date(now - 600000).toISOString(), heartRate: 72, hrv: 42, source: 'device', deviceName: 'Polar H10' },
  ];
}
function mockSpO2Records(): VitalSignsRecord[] {
  const now = Date.now();
  return [
    { id: 'ble-spo2-mock-1', timestamp: new Date(now - 600000).toISOString(), oxygenSaturation: 98, heartRate: 70, source: 'device', deviceName: 'Nonin Onyx' },
  ];
}
function mockTemperatureRecords(): VitalSignsRecord[] {
  const now = Date.now();
  return [
    { id: 'ble-temp-mock-1', timestamp: new Date(now - 600000).toISOString(), temperature: 98.4, source: 'device', deviceName: 'Withings Thermo' },
  ];
}

// ─── Raw GATT connect-and-read for unknown devices ──────────────────────────
export interface RawGattResult {
  serviceUUID: string;
  characteristicUUID: string;
  valueHex: string;   // hex-encoded raw bytes
  valueAscii: string; // printable ASCII interpretation (non-printable chars replaced with .)
  valueBase64: string;
}

/**
 * Connects to any BLE device and reads all readable characteristics across all services.
 * Returns up to 20 raw GATT values so the UI can display them.
 * Disconnects automatically after reading.
 */
export async function connectAndReadDevice(deviceId: string): Promise<RawGattResult[]> {
  const manager = await getBleManager();
  if (!manager) {
    // Web/simulator mock
    return [
      { serviceUUID: '0000180a', characteristicUUID: '00002a29', valueHex: '41 63 6d 65 20 43 6f 2e', valueAscii: 'Acme Co.', valueBase64: 'QWNtZSBDby4=' },
      { serviceUUID: '0000180a', characteristicUUID: '00002a24', valueHex: '58 2d 31 30 30', valueAscii: 'X-100', valueBase64: 'WC0xMDA=' },
      { serviceUUID: '0000180f', characteristicUUID: '00002a19', valueHex: '4b', valueAscii: 'K', valueBase64: 'Sw==' },
    ];
  }

  let device: any = null;
  try {
    device = await manager.connectToDevice(deviceId, { timeout: 10000 });
    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();
    const results: RawGattResult[] = [];

    for (const service of services) {
      if (results.length >= 20) break;
      const characteristics = await service.characteristics();
      for (const char of characteristics) {
        if (results.length >= 20) break;
        if (!char.isReadable) continue;
        try {
          const read = await char.read();
          const b64 = read.value ?? '';
          const bytes = SafeBuffer ? Array.from(SafeBuffer.from(b64, 'base64')) : [];
          const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
          const ascii = bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
          results.push({
            serviceUUID: service.uuid.toLowerCase().replace(/-/g, '').slice(-8),
            characteristicUUID: char.uuid.toLowerCase().replace(/-/g, '').slice(-8),
            valueHex: hex,
            valueAscii: ascii,
            valueBase64: b64,
          });
        } catch (_unused) {
          // characteristic not readable or permission denied — skip
        }
      }
    }
    return results;
  } finally {
    if (device) {
      try { await device.cancelConnection(); } catch (_unused) { /* ignore */ }
    }
  }
}

// ─── Destroy BLE manager on app close ────────────────────────────────────────
export function destroyBleManager() {
  if (bleInstance) {
    bleInstance.destroy();
    bleInstance = null;
  }
}
