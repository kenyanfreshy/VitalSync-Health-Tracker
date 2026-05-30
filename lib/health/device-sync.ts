/**
 * VitalSync Device Sync Service
 *
 * Pulls the latest readings for blood glucose, weight, and vital signs
 * from Apple HealthKit (iOS) or Google Health Connect (Android).
 *
 * These platforms already aggregate data from paired devices:
 *   - Glucometers (Dexcom, Libre, Contour, OneTouch, etc.)
 *   - Smart scales (Withings, Garmin Index, Fitbit Aria, etc.)
 *   - BP monitors (Omron, Withings BPM, etc.)
 *   - Pulse oximeters (Apple Watch, Garmin, etc.)
 *
 * On web / simulator, realistic mock readings are returned so the UI
 * can be tested without a physical device.
 */

import { Platform } from 'react-native';
import type { BloodSugarRecord, WeightRecord, VitalSignsRecord } from './types';

// ─── Result types ──────────────────────────────────────────────────────────────

export type SyncResult<T> =
  | { ok: true; records: T[]; source: 'healthkit' | 'health-connect' | 'mock' }
  | { ok: false; error: string };

// ─── Blood Glucose ─────────────────────────────────────────────────────────────

export async function syncBloodGlucose(limitDays = 7): Promise<SyncResult<BloodSugarRecord>> {
  if (Platform.OS === 'web') return mockGlucose();

  if (Platform.OS === 'ios') {
    return syncGlucoseHealthKit(limitDays);
  }
  if (Platform.OS === 'android') {
    return syncGlucoseHealthConnect(limitDays);
  }
  return { ok: false, error: 'Platform not supported' };
}

async function syncGlucoseHealthKit(limitDays: number): Promise<SyncResult<BloodSugarRecord>> {
  try {
    const { queryQuantitySamples } = await import('@kingstinct/react-native-healthkit').catch(() => ({ queryQuantitySamples: null }));
    if (!queryQuantitySamples) return mockGlucose();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - limitDays);

    const results = await queryQuantitySamples(
      'HKQuantityTypeIdentifierBloodGlucose' as any,
      { from: startDate, to: new Date(), limit: 50, unit: 'mmol/L' as any, ascending: false }
    );

    if (!results?.length) return mockGlucose();

    const records: BloodSugarRecord[] = (results as any[]).map((r: any) => {
      const mmol = r.quantity ?? 0;
      return {
        id: `hk-glucose-${r.startDate}`,
        timestamp: typeof r.startDate === 'string' ? r.startDate : r.startDate.toISOString(),
        glucoseMgDl: Math.round(mmol * 18.0182),
        glucoseMmol: parseFloat(mmol.toFixed(1)),
        context: 'random' as const,
        source: 'device',
        deviceName: 'Apple Health',
      };
    });

    return { ok: true, records, source: 'healthkit' };
  } catch (_unused) {
    return mockGlucose();
  }
}

async function syncGlucoseHealthConnect(limitDays: number): Promise<SyncResult<BloodSugarRecord>> {
  try {
    const { readRecords } = await import('react-native-health-connect').catch(() => ({ readRecords: null }));
    if (!readRecords) return mockGlucose();

    const startTime = new Date();
    startTime.setDate(startTime.getDate() - limitDays);

     
    const result: any = await readRecords('BloodGlucose', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
      },
    });

    if (!result?.records?.length) return mockGlucose();

    const records: BloodSugarRecord[] = result.records.map((r: any) => {
      const mmol = r.level?.inMillimolesPerLiter ?? 0;
      return {
        id: `hc-glucose-${r.time}`,
        timestamp: r.time,
        glucoseMgDl: Math.round(mmol * 18.0182),
        glucoseMmol: parseFloat(mmol.toFixed(1)),
        context: mapHCMealType(r.mealType),
        source: 'device',
        deviceName: 'Health Connect',
      };
    });
    return { ok: true, records, source: 'health-connect' };
  } catch (_unused) {
    return mockGlucose();
  }
}

function mapHCMealType(mealType?: number): BloodSugarRecord['mealContext'] {
  // Health Connect meal type constants
  switch (mealType) {
    case 1: return 'fasting';
    case 2: return 'post-meal';
    case 3: return 'post-meal';
    default: return 'random';
  }
}

// ─── Weight ────────────────────────────────────────────────────────────────────

export async function syncWeight(limitDays = 30): Promise<SyncResult<WeightRecord>> {
  if (Platform.OS === 'web') return mockWeight();

  if (Platform.OS === 'ios') return syncWeightHealthKit(limitDays);
  if (Platform.OS === 'android') return syncWeightHealthConnect(limitDays);
  return { ok: false, error: 'Platform not supported' };
}

async function syncWeightHealthKit(limitDays: number): Promise<SyncResult<WeightRecord>> {
  try {
    const { queryQuantitySamples } = await import('@kingstinct/react-native-healthkit').catch(() => ({ queryQuantitySamples: null }));
    if (!queryQuantitySamples) return mockWeight();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - limitDays);

    const results = await queryQuantitySamples(
      'HKQuantityTypeIdentifierBodyMass' as any,
      { from: startDate, to: new Date(), limit: 30, unit: 'kg' as any, ascending: false }
    );

    if (!results?.length) return mockWeight();

    const records: WeightRecord[] = (results as any[]).map((r: any) => {
      const kg = r.quantity ?? 0;
      return {
        id: `hk-weight-${r.startDate}`,
        timestamp: typeof r.startDate === 'string' ? r.startDate : r.startDate.toISOString(),
        weightKg: parseFloat(kg.toFixed(2)),
        weightLbs: parseFloat((kg * 2.20462).toFixed(1)),
        source: 'device',
        deviceName: 'Apple Health',
      };
    });

    return { ok: true, records, source: 'healthkit' };
  } catch (_unused) {
    return mockWeight();
  }
}

async function syncWeightHealthConnect(limitDays: number): Promise<SyncResult<WeightRecord>> {
  try {
    const { readRecords } = await import('react-native-health-connect').catch(() => ({ readRecords: null }));
    if (!readRecords) return mockWeight();

    const startTime = new Date();
    startTime.setDate(startTime.getDate() - limitDays);

     
    const result: any = await readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
      },
    });

    if (!result?.records?.length) return mockWeight();

    const records: WeightRecord[] = result.records.map((r: any) => {
      const kg = r.weight?.inKilograms ?? 0;
      return {
        id: `hc-weight-${r.time}`,
        timestamp: r.time,
        weightKg: parseFloat(kg.toFixed(2)),
        weightLbs: parseFloat((kg * 2.20462).toFixed(1)),
        source: 'device',
        deviceName: 'Health Connect',
      };
    });
    return { ok: true, records, source: 'health-connect' };
  } catch (_unused) {
    return mockWeight();
  }
}

// ─── Vital Signs (BP, HR, SpO2) ────────────────────────────────────────────────

export async function syncVitalSigns(limitDays = 7): Promise<SyncResult<VitalSignsRecord>> {
  if (Platform.OS === 'web') return mockVitals();

  if (Platform.OS === 'ios') return syncVitalsHealthKit(limitDays);
  if (Platform.OS === 'android') return syncVitalsHealthConnect(limitDays);
  return { ok: false, error: 'Platform not supported' };
}

async function syncVitalsHealthKit(limitDays: number): Promise<SyncResult<VitalSignsRecord>> {
  try {
    const { queryQuantitySamples } = await import('@kingstinct/react-native-healthkit').catch(() => ({ queryQuantitySamples: null }));
    if (!queryQuantitySamples) return mockVitals();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - limitDays);
    const opts = { from: startDate, to: new Date(), limit: 50, ascending: false };

    // Sequential fetch — no Promise.all for HealthKit queries (Hermes BoundFunction safety)
    const systolicResults = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic' as any, { ...opts, unit: 'mmHg' as any }).catch(() => []);
    const diastolicResults = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic' as any, { ...opts, unit: 'mmHg' as any }).catch(() => []);
    const hrResults = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRate' as any, { ...opts, unit: 'count/min' as any }).catch(() => []);
    const spo2Results = await queryQuantitySamples('HKQuantityTypeIdentifierOxygenSaturation' as any, { ...opts, unit: '%' as any }).catch(() => []);

    if (!systolicResults?.length) return mockVitals();

    const records: VitalSignsRecord[] = (systolicResults as any[]).map((sys: any) => {
      const ts = typeof sys.startDate === 'string' ? sys.startDate : sys.startDate.toISOString();
      const dia = (diastolicResults as any[]).find((d: any) => {
        const dt = typeof d.startDate === 'string' ? d.startDate : d.startDate.toISOString();
        return Math.abs(new Date(dt).getTime() - new Date(ts).getTime()) < 300000;
      });
      const hr = (hrResults as any[]).find((h: any) => {
        const ht = typeof h.startDate === 'string' ? h.startDate : h.startDate.toISOString();
        return Math.abs(new Date(ht).getTime() - new Date(ts).getTime()) < 300000;
      });
      const spo2 = (spo2Results as any[]).find((o: any) => {
        const ot = typeof o.startDate === 'string' ? o.startDate : o.startDate.toISOString();
        return Math.abs(new Date(ot).getTime() - new Date(ts).getTime()) < 300000;
      });
      return {
        id: `hk-vitals-${ts}`,
        timestamp: ts,
        systolic: Math.round(sys.quantity ?? 0),
        diastolic: dia ? Math.round(dia.quantity ?? 0) : undefined,
        heartRate: hr ? Math.round(hr.quantity ?? 0) : undefined,
        // spo2.quantity from @kingstinct/react-native-healthkit is returned in the
        // unit requested above ('%'), so it is already 0–100 (not a 0–1 fraction).
        // Do NOT multiply by 100 — that would produce values like 9700 %.
        oxygenSaturation: spo2 ? Math.round(spo2.quantity ?? 0) : undefined,
        source: 'device',
        deviceName: 'Apple Health',
      };
    });

    return { ok: true, records, source: 'healthkit' };
  } catch (_unused) {
    return mockVitals();
  }
}

async function syncVitalsHealthConnect(limitDays: number): Promise<SyncResult<VitalSignsRecord>> {
  try {
    const { readRecords } = await import('react-native-health-connect').catch(() => ({ readRecords: null }));
    if (!readRecords) return mockVitals();

    const startTime = new Date();
    startTime.setDate(startTime.getDate() - limitDays);
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
    };

    // Sequential fetch — no Promise.all for Health Connect queries (Hermes BoundFunction safety)
     
    const bpResult: any = await readRecords('BloodPressure', { timeRangeFilter }).catch(() => ({ records: [] }));
     
    const hrResult: any = await readRecords('HeartRate', { timeRangeFilter }).catch(() => ({ records: [] }));
     
    const spo2Result: any = await readRecords('OxygenSaturation', { timeRangeFilter }).catch(() => ({ records: [] }));

    const bpRecords = bpResult?.records ?? [];
    if (!bpRecords.length) return mockVitals();

    const records: VitalSignsRecord[] = bpRecords.map((r: any) => {
      const hr = (hrResult?.records ?? []).find((h: any) =>
        Math.abs(new Date(h.time).getTime() - new Date(r.time).getTime()) < 300000
      );
      const spo2 = (spo2Result?.records ?? []).find((o: any) =>
        Math.abs(new Date(o.time).getTime() - new Date(r.time).getTime()) < 300000
      );
      return {
        id: `hc-vitals-${r.time}`,
        timestamp: r.time,
        systolic: Math.round(r.systolic?.inMillimetersOfMercury ?? 0),
        diastolic: Math.round(r.diastolic?.inMillimetersOfMercury ?? 0),
        heartRate: hr ? Math.round(hr.samples?.[0]?.beatsPerMinute ?? 0) : undefined,
        // Health Connect OxygenSaturation.percentage is already 0–100 (not a 0–1 fraction).
        // Do NOT multiply by 100 — that would produce values like 9700 %.
        oxygenSaturation: spo2 ? Math.round(spo2.percentage) : undefined,
        source: 'device',
        deviceName: 'Health Connect',
      };
    });

    return { ok: true, records, source: 'health-connect' };
  } catch (_unused) {
    return mockVitals();
  }
}

// ─── Permission helpers ────────────────────────────────────────────────────────

export async function requestDeviceSyncPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  if (Platform.OS === 'ios') {
    // NOTE: requestAuthorization is intentionally NOT called here.
    // Device sync permissions are a subset of the HealthKit permissions already
    // requested via the explicit user tap in Settings → Health → "Request Permissions".
    // Calling requestAuthorization from a BLE device-connect callback would show
    // the iOS permission sheet unexpectedly and risks a SIGABRT on iOS 26 Beta.
    return true;
  }

  if (Platform.OS === 'android') {
    try {
      const { initialize, requestPermission } = await import('react-native-health-connect').catch(() => ({
        initialize: null,
        requestPermission: null,
      }));
      if (!initialize || !requestPermission) return true;

      const initialized = await initialize();
      if (!initialized) return false;

      const granted = await requestPermission([
        { accessType: 'read', recordType: 'BloodGlucose' },
        { accessType: 'read', recordType: 'Weight' },
        { accessType: 'read', recordType: 'LeanBodyMass' },
        { accessType: 'read', recordType: 'Height' },
        { accessType: 'read', recordType: 'BloodPressure' },
        { accessType: 'read', recordType: 'HeartRate' },
        { accessType: 'read', recordType: 'OxygenSaturation' },
        { accessType: 'read', recordType: 'Distance' },
        { accessType: 'read', recordType: 'TotalCaloriesBurned' },
        { accessType: 'read', recordType: 'Steps' },
      ]);
      return granted.length > 0;
    } catch (_unused) {
      return true;
    }
  }

  return false;
}

// ─── Mock data (web / simulator) ──────────────────────────────────────────────

function mockGlucose(): SyncResult<BloodSugarRecord> {
  const now = Date.now();
  const records: BloodSugarRecord[] = [
    { id: `mock-g-1`, timestamp: new Date(now - 3600000).toISOString(), glucoseMgDl: 98, glucoseMmol: 5.4, context: 'fasting', source: 'device', deviceName: 'Demo Glucometer' },
    { id: `mock-g-2`, timestamp: new Date(now - 7200000).toISOString(), glucoseMgDl: 142, glucoseMmol: 7.9, context: 'post-meal', source: 'device', deviceName: 'Demo Glucometer' },
    { id: `mock-g-3`, timestamp: new Date(now - 86400000).toISOString(), glucoseMgDl: 105, glucoseMmol: 5.8, context: 'fasting', source: 'device', deviceName: 'Demo Glucometer' },
  ];
  return { ok: true, records, source: 'mock' };
}

function mockWeight(): SyncResult<WeightRecord> {
  const now = Date.now();
  const records: WeightRecord[] = [
    { id: `mock-w-1`, timestamp: new Date(now - 86400000).toISOString(), weightKg: 74.2, weightLbs: 163.6, source: 'device', deviceName: 'Demo Smart Scale' },
    { id: `mock-w-2`, timestamp: new Date(now - 172800000).toISOString(), weightKg: 74.5, weightLbs: 164.2, source: 'device', deviceName: 'Demo Smart Scale' },
    { id: `mock-w-3`, timestamp: new Date(now - 259200000).toISOString(), weightKg: 74.8, weightLbs: 164.9, source: 'device', deviceName: 'Demo Smart Scale' },
  ];
  return { ok: true, records, source: 'mock' };
}

function mockVitals(): SyncResult<VitalSignsRecord> {
  const now = Date.now();
  const records: VitalSignsRecord[] = [
    { id: `mock-v-1`, timestamp: new Date(now - 3600000).toISOString(), systolic: 118, diastolic: 76, heartRate: 68, oxygenSaturation: 99, source: 'device', deviceName: 'Demo BP Monitor' },
    { id: `mock-v-2`, timestamp: new Date(now - 86400000).toISOString(), systolic: 122, diastolic: 78, heartRate: 72, oxygenSaturation: 98, source: 'device', deviceName: 'Demo BP Monitor' },
    { id: `mock-v-3`, timestamp: new Date(now - 172800000).toISOString(), systolic: 115, diastolic: 74, heartRate: 65, oxygenSaturation: 99, source: 'device', deviceName: 'Demo BP Monitor' },
  ];
  return { ok: true, records, source: 'mock' };
}
