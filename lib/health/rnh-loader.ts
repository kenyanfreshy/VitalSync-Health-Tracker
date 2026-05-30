/**
 * rnh-loader.ts
 *
 * Clean HealthKit permission initialiser and typed fetch helpers using
 * `react-native-health` (AppleHealthKit / RCTAppleHealthKit bridge).
 *
 * WHY react-native-health for permissions:
 *   `@kingstinct/react-native-healthkit` (Nitro/JSI) provides rich query APIs
 *   but its NitroModulesProxy may not be registered at JS startup on some builds.
 *   `react-native-health` (RCT bridge) is reliably linked and `initHealthKit()`
 *   is the only way to trigger the iOS system permission sheet.
 *
 * Permission set (matches user spec):
 *   HeartRate, Steps, BloodPressureSystolic, BloodPressureDiastolic,
 *   Weight (BodyMass), BloodGlucose, ActiveEnergyBurned, SleepAnalysis
 *
 * Usage:
 *   import { initAppleHealthKit, isRNHAvailable } from '@/lib/health/rnh-loader';
 *   const ok = await initAppleHealthKit(); // triggers iOS permission sheet once
 */

import { Platform, NativeModules } from 'react-native';

// ─── RNH_READ_PERMISSIONS (string array for legacy callers) ──────────────────
export const RNH_READ_PERMISSIONS = [
  'HeartRate',
  'Steps',
  'BloodPressureSystolic',
  'BloodPressureDiastolic',
  'Weight',
  'BloodGlucose',
  'ActiveEnergyBurned',
  'SleepAnalysis',
] as const;

export const RNH_WRITE_PERMISSIONS: readonly string[] = [];

// ─── State ────────────────────────────────────────────────────────────────────
let _initResult: boolean | null = null;
let _initPromise: Promise<boolean> | null = null;

/**
 * Returns true if the RCTAppleHealthKit native module is linked AND has the
 * initHealthKit method available. Returns false in Expo Go.
 */
export function isRNHAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  const nativeBridge = NativeModules.AppleHealthKit;
  return !!nativeBridge && typeof nativeBridge.initHealthKit === 'function';
}

/**
 * Calls AppleHealthKit.initHealthKit() which triggers the iOS system permission
 * sheet for all requested types that are still in the "notDetermined" state.
 *
 * - Safe to call multiple times — subsequent calls return the cached result.
 * - Returns true  if initHealthKit succeeded (permissions granted or already set).
 * - Returns false if not on iOS, NativeModule not linked, or user denied.
 */
export async function initAppleHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    console.log('[RNH] initAppleHealthKit: skipped (not iOS)');
    return false;
  }

  if (_initResult === true) {
    console.log('[RNH] initAppleHealthKit: cached success — skipping re-init');
    return true;
  }

  if (_initPromise) {
    console.log('[RNH] initAppleHealthKit: awaiting in-flight init...');
    return _initPromise;
  }

  if (!isRNHAvailable()) {
    console.warn(
      '[RNH] AppleHealthKit NativeModule not found.\n' +
      '  • Expo Go: HealthKit requires a dev/production EAS build.\n' +
      '  • EAS build: ensure HealthKit capability is enabled in your App ID\n' +
      '    on developer.apple.com → Certificates → App IDs → Edit → HealthKit.\n' +
      '  • Rebuild: eas build --platform ios --profile development'
    );
    _initResult = false;
    return false;
  }

  console.log('[RNH] Calling AppleHealthKit.initHealthKit() — will show iOS permission sheet...');

  // Dynamically import to avoid bundling issues on Android/web
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');

  const P = AppleHealthKit.Constants.Permissions;
  const PERMISSIONS = {
    permissions: {
      read: [
        // ── Cardiovascular ────────────────────────────────────────────────
        P.HeartRate,
        P.RestingHeartRate,
        P.HeartRateVariability,
        P.BloodPressureSystolic,
        P.BloodPressureDiastolic,
        // ── Respiratory & Oxygenation ─────────────────────────────────────
        P.OxygenSaturation,
        P.RespiratoryRate,
        // ── Metabolic & Nutritional ───────────────────────────────────────
        P.BloodGlucose,
        P.InsulinDelivery,
        P.Fiber,
        P.ActiveEnergyBurned,
        P.BasalEnergyBurned,
        // ── Activity & Mobility ───────────────────────────────────────────
        P.Steps,
        P.StepCount,
        P.AppleStandTime,
        P.Workout,
        P.DistanceWalkingRunning,
        P.DistanceCycling,
        P.Electrocardiogram,
        P.FlightsClimbed,
        // ── Sleep & Recovery ──────────────────────────────────────────────
        P.SleepAnalysis,
        P.BodyTemperature,
        P.Weight,
        P.BodyFatPercentage,
        // ── Body Composition ───────────────────────────────────────────────
        P.LeanBodyMass,
        P.Height,
        // ── Vo2 Max ───────────────────────────────────────────────────────
        P.Vo2Max,
      ],
      write: [
        P.BloodGlucose,
        P.InsulinDelivery,
        P.Weight,
        P.BodyTemperature,
        P.SleepAnalysis,
      ],
    },
  };

  _initPromise = new Promise<boolean>((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (error: string) => {
      if (error) {
        console.warn('[RNH] initHealthKit error:', error);
        _initResult = false;
        _initPromise = null;
        resolve(false);
      } else {
        console.log('[RNH] initHealthKit: success — permissions granted or already set');
        _initResult = true;
        _initPromise = null;
        resolve(true);
      }
    });
  });

  return _initPromise;
}

/**
 * Check whether HealthKit is available on this device.
 * Returns false in Expo Go, on Android/web, or when the entitlement is missing.
 */
export async function checkRNHAvailability(): Promise<boolean> {
  if (!isRNHAvailable()) return false;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
  return new Promise<boolean>((resolve) => {
    AppleHealthKit.isAvailable((_err: object, result: boolean) => {
      resolve(!!result);
    });
  });
}

/** Reset loader state (for testing or after the user grants permissions in Settings). */
export function _resetRNHCache(): void {
  _initResult = null;
  _initPromise = null;
}

// ─── Typed result interfaces ──────────────────────────────────────────────────

export interface RNHHeartRateSample {
  value: number;       // bpm
  startDate: string;   // ISO 8601
  endDate: string;
  sourceName?: string;
}

export interface RNHBloodPressureSample {
  bloodPressureSystolicValue: number;   // mmHg
  bloodPressureDiastolicValue: number;  // mmHg
  startDate: string;
  endDate: string;
  sourceName?: string;
}

export interface RNHWeightResult {
  value: number;       // kg (when unit: 'kg' is passed)
  startDate: string;
  endDate: string;
}

export interface RNHGlucoseSample {
  value: number;       // mg/dL
  startDate: string;
  endDate: string;
  sourceName?: string;
}

export interface RNHCaloriesSample {
  value: number;       // kcal
  startDate: string;
  endDate: string;
}

export interface RNHStepCountResult {
  value: number;       // total steps in the requested window
  startDate: string;
  endDate: string;
}

export type SleepStage = 'INBED' | 'ASLEEP' | 'AWAKE' | 'DEEP' | 'CORE' | 'REM';

export interface RNHSleepSample {
  value: SleepStage;
  startDate: string;
  endDate: string;
  sourceName?: string;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
// All helpers guard against isRNHAvailable() and resolve [] / null on failure.

/** Fetch heart rate samples. */
export function fetchHKHeartRate(since: Date = new Date(0)): Promise<RNHHeartRateSample[]> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    const options = {
      startDate: since.toISOString(),
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1000,
    };
    AppleHealthKit.getHeartRateSamples(options, (err: string, results: RNHHeartRateSample[]) => {
      if (err) { console.warn('[RNH] getHeartRateSamples error:', err); resolve([]); return; }
      resolve((results ?? []) as RNHHeartRateSample[]);
    });
  });
}

/** Fetch blood pressure samples. */
export function fetchHKBloodPressure(since: Date = new Date(0)): Promise<RNHBloodPressureSample[]> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    const options = {
      startDate: since.toISOString(),
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1000,
    };
    AppleHealthKit.getBloodPressureSamples(options, (err: string, results: RNHBloodPressureSample[]) => {
      if (err) { console.warn('[RNH] getBloodPressureSamples error:', err); resolve([]); return; }
      resolve((results ?? []) as RNHBloodPressureSample[]);
    });
  });
}

/** Fetch latest body weight in kg. */
export function fetchHKLatestWeight(): Promise<RNHWeightResult | null> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve(null); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AppleHealthKit.getLatestWeight({ unit: 'kg' as any }, (err: string, result: RNHWeightResult) => {
      if (err) { console.warn('[RNH] getLatestWeight error:', err); resolve(null); return; }
      resolve(result ?? null);
    });
  });
}

/** Fetch blood glucose samples in mg/dL. */
export function fetchHKBloodGlucose(since: Date = new Date(0)): Promise<RNHGlucoseSample[]> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    const options = {
      startDate: since.toISOString(),
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1000,
    };
    AppleHealthKit.getBloodGlucoseSamples(options, (err: string, results: RNHGlucoseSample[]) => {
      if (err) { console.warn('[RNH] getBloodGlucoseSamples error:', err); resolve([]); return; }
      resolve((results ?? []) as RNHGlucoseSample[]);
    });
  });
}

/** Fetch active energy burned samples. */
export function fetchHKActiveCalories(options?: { startDate?: Date; endDate?: Date }): Promise<RNHCaloriesSample[]> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    const startDate = options?.startDate ?? new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = options?.endDate ?? new Date();
    AppleHealthKit.getActiveEnergyBurned(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      (err: string, results: RNHCaloriesSample[]) => {
        if (err) { console.warn('[RNH] getActiveEnergyBurned error:', err); resolve([]); return; }
        resolve((results ?? []) as RNHCaloriesSample[]);
      }
    );
  });
}

/** Fetch step count for a date window. */
export function fetchHKStepCount(options?: { startDate?: Date; endDate?: Date }): Promise<number> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve(0); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    const startDate = options?.startDate ?? new Date(new Date().setHours(0, 0, 0, 0));
    AppleHealthKit.getStepCount(
      { startDate: startDate.toISOString(), date: new Date().toISOString() },
      (err: string, result: { value: number }) => {
        if (err) { console.warn('[RNH] getStepCount error:', err); resolve(0); return; }
        resolve(result?.value ?? 0);
      }
    );
  });
}

/** Fetch sleep samples for the last N days. */
export function fetchHKSleepSamples(days: number = 7): Promise<RNHSleepSample[]> {
  return new Promise((resolve) => {
    if (!isRNHAvailable()) { resolve([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    const options = {
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
    };
    AppleHealthKit.getSleepSamples(options, (err: string, results: RNHSleepSample[]) => {
      if (err) { console.warn('[RNH] getSleepSamples error:', err); resolve([]); return; }
      resolve((results ?? []) as RNHSleepSample[]);
    });
  });
}

/**
 * Aggregate sleep samples to get total sleep hours for last night.
 * Counts ASLEEP, CORE, DEEP, REM stages from midnight onwards.
 */
export function getTotalSleepForLastNight(samples: RNHSleepSample[]): number {
  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  const sleepChunks = samples.filter(s =>
    new Date(s.startDate) > yesterday &&
    (s.value === 'ASLEEP' || s.value === 'CORE' || s.value === 'DEEP' || s.value === 'REM')
  );
  const totalMinutes = sleepChunks.reduce((acc, sample) => {
    const duration =
      (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 1000 / 60;
    return acc + duration;
  }, 0);
  return parseFloat((totalMinutes / 60).toFixed(1));
}
