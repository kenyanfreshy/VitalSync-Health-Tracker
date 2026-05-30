import { scheduleNotification } from '@/lib/notifications/schedule';
import { loadHealthKit } from './healthkit-loader';
import { pruneHealthData, loadRetentionMonths } from '@/lib/health/storage';
import { isRNHAvailable, initAppleHealthKit } from './rnh-loader';
import {
  rnhFetchBloodPressure,
  rnhFetchHeartRate,
  rnhFetchHRV,
  rnhFetchSpO2,
  rnhFetchBodyTemperature,
  rnhFetchRespiratoryRate,
  rnhFetchSleep,
  rnhFetchWeight,
  rnhFetchBodyFat,
  rnjFetchWorkouts,
  rnjFetchSteps,
  rnhFetchBloodGlucose,
  rnhFetchRestingHeartRate,
} from './rnh-fetch';
/**
 * Native Health Service
 *
 * Provides a unified API for reading health data from:
 *   - Apple HealthKit  (iOS / iPadOS)
 *   - Google Health Connect (Android)
 *
 * On web: all methods return empty arrays / false.
 *
 * Usage:
 *   const svc = getNativeHealthService();
 *   const granted = await svc.requestPermissions();
 *   if (granted) {
 *     const bp = await svc.fetchBloodPressure(since);
 *     const hr = await svc.fetchHeartRate(since);
 *   }
 */

import { Platform } from 'react-native';
import {
  safeHealthKitCall,
  withTimeout,
  ensureArray,
  logSyncStage,
  convertWeightToLb,
  HK_LIMITS,
  createCancellationToken,
  type CancellationToken,
} from './healthkit-helpers';
// NOTE: react-native-health must NOT be imported at the top level.
// A static import causes the AppleHealthKit TurboModule to be registered
// synchronously on the com.meta.react.turbomodulemanager.queue at bundle load
// time. On iOS 26.5 Beta, if the HealthKit entitlement is absent or the module
// initialises before the app is fully ready, it throws an NSException. React
// Native's convertNSExceptionToJSError then crashes with a null-pointer
// dereference (KERN_INVALID_ADDRESS at 0x11 / SIGSEGV). Fix: lazy require()
// inside each method that needs it, guarded by isRNHAvailable().
import type { HealthKitPermissions } from 'react-native-health';
import type {
  BloodPressureRecord,
  PulseRecord,
  SleepRecord,
  BodyCompositionRecord,
  ActivityRecord,
  ActivityType,
  VitalSignsRecord,
  BloodSugarRecord,
} from './types';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Result type ─────────────────────────────────────────────────────────────

export interface NativeHealthSyncResult {
  bloodPressure: BloodPressureRecord[];
  heartRate: PulseRecord[];
  sleep: SleepRecord[];
  bodyComposition: BodyCompositionRecord[];
  activity: ActivityRecord[];
  spO2: VitalSignsRecord[];
  temperature: VitalSignsRecord[];
  respiratoryRate: VitalSignsRecord[];
  steps: number;
  /** Blood glucose samples fetched from HealthKit (iOS) or Health Connect (Android) */
  bloodGlucose: BloodSugarRecord[];
  /** Total walking + running distance in metres for the sync window (DistanceWalkingRunning) */
  distanceWalkingRunningM?: number;
  /** Total cycling distance in metres for the sync window (DistanceCycling) */
  distanceCyclingM?: number;
  /** Resting Heart Rate samples — one per day from Apple Watch (HKQuantityTypeIdentifierRestingHeartRate) */
  restingHRSamples?: PulseRecord[];
  errors: string[];
  /** Per-metric record counts for display in the sync progress UI */
  counts: {
    bloodPressure: number;
    heartRate: number;
    sleep: number;
    bodyComposition: number;
    activity: number;
    spO2: number;
    temperature: number;
    respiratoryRate: number;
    steps: number;
    bloodGlucose: number;
  };
}

// ─── iOS — HealthKit ─────────────────────────────────────────────────────────

// ─── NativeHealthService class ───────────────────────────────────────────────
//
// Class-based architecture with instance-level permission state.
// requestPermissions() uses the RCT bridge (react-native-health) as the
// primary path — this is the ONLY call that shows the iOS system sheet.
// The Nitro bridge is kept as a fallback for Expo Go / missing entitlement.

class NativeHealthServiceImpl implements NativeHealthService {
  private _initialized = false;
  private _permissionGranted = false;
  readonly isAvailable: boolean;
  readonly platform: 'ios' | 'android' | 'web';

  constructor() {
    this.platform = Platform.OS as 'ios' | 'android' | 'web';
    this.isAvailable = this.platform === 'ios' || this.platform === 'android';
  }

  // ─── Permissions ───────────────────────────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    if (this.platform === 'android') return requestHealthConnectPermissions();
    if (this.platform !== 'ios') return false;

    if (this._permissionGranted) {
      console.log('[HealthKit] Permissions already granted (cached)');
      return true;
    }

    console.log('[HealthKit] Requesting permissions...');

    // STEP 1 — PRIMARY: RCT bridge (react-native-health / AppleHealthKit)
    // This is the ONLY path that shows the iOS system permission sheet.
    const grantedRCT = await this._requestViaRCT();
    if (grantedRCT) {
      this._initialized = true;
      this._permissionGranted = true;
      console.log('[HealthKit] Permissions granted ✅ (RCT bridge)');
      return true;
    }

    // STEP 2 — FALLBACK: Nitro bridge (Expo Go / missing entitlement)
    const grantedFallback = await this._requestViaFallback();
    this._initialized = grantedFallback;
    this._permissionGranted = grantedFallback;
    return grantedFallback;
  }

  /** 🔥 RCT bridge — triggers the iOS system permission sheet */
  private _requestViaRCT(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (!isRNHAvailable()) {
          console.warn('[HealthKit] _requestViaRCT: RCT bridge not available');
          resolve(false);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
        console.log('🔥 Calling AppleHealthKit.initHealthKit');
        const permissions: HealthKitPermissions = {
          permissions: {
            read: [
              AppleHealthKit.Constants.Permissions.HeartRate,
              AppleHealthKit.Constants.Permissions.RestingHeartRate,
              AppleHealthKit.Constants.Permissions.HeartRateVariability,
              AppleHealthKit.Constants.Permissions.StepCount,
              AppleHealthKit.Constants.Permissions.SleepAnalysis,
              AppleHealthKit.Constants.Permissions.BloodPressureSystolic,
              AppleHealthKit.Constants.Permissions.BloodPressureDiastolic,
              AppleHealthKit.Constants.Permissions.BodyMass,
              AppleHealthKit.Constants.Permissions.BodyFatPercentage,
              AppleHealthKit.Constants.Permissions.OxygenSaturation,
              AppleHealthKit.Constants.Permissions.RespiratoryRate,
              AppleHealthKit.Constants.Permissions.BodyTemperature,
              AppleHealthKit.Constants.Permissions.BloodGlucose,
              AppleHealthKit.Constants.Permissions.Workout,
              // EKG — required to read HKElectrocardiogram samples
              AppleHealthKit.Constants.Permissions.Electrocardiogram,
            ],
            write: [],
          },
        };
        AppleHealthKit.initHealthKit(permissions, (error: any) => {
          if (error) {
            console.error('❌ HealthKit permission error:', error);
            resolve(false);
            return;
          }
          console.log('✅ HealthKit permissions granted');
          resolve(true);
        });
      } catch (e) {
        console.warn('[HealthKit] RCT bridge not available:', e);
        resolve(false);
      }
    });
  }

  /**
   * @deprecated Nitro bridge fallback for requestAuthorization is removed.
   * All HealthKit authorization now goes through the RCT bridge (react-native-health)
   * via the explicit user tap in Settings → Health → "Request Permissions".
   * This method is kept as a no-op stub to avoid breaking any callers.
   */
  private async _requestViaFallback(): Promise<boolean> {
    console.warn('[HealthKit] _requestViaFallback: Nitro bridge auth removed — use RCT bridge (initHealthKit) only.');
    return false;
  }

  // ─── Data fetchers ─────────────────────────────────────────────────────────

  async fetchHeartRate(since: Date): Promise<PulseRecord[]> {
    if (this.platform === 'android') return fetchHealthConnectHeartRate(since);
    if (this.platform !== 'ios') return [];
    if (!this._initialized) {
      console.warn('[HealthKit] fetchHeartRate: not initialized — call requestPermissions() first');
      return [];
    }
    return new Promise((resolve) => {
      if (!isRNHAvailable()) { resolve([]); return; }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
      AppleHealthKit.getHeartRateSamples(
        { startDate: since.toISOString() },
        (err: any, results: any) => {
          if (err) {
            console.warn('[HealthKit] HR error:', err);
            resolve([]);
            return;
          }
          console.log('[HealthKit] HR count:', results?.length);
          const mapped: PulseRecord[] = (results || []).map((r: any) => ({
            id: uuid(),
            timestamp: r.startDate,
            bpm: Math.round(r.value),
            source: 'apple-health',
          }));
          resolve(mapped);
        }
      );
    });
  }

  async fetchBloodPressure(since: Date): Promise<BloodPressureRecord[]> {
    if (this.platform === 'ios') return fetchHealthKitBloodPressure(since);
    if (this.platform === 'android') return fetchHealthConnectBloodPressure(since);
    return [];
  }

  async fetchSleep(since: Date): Promise<SleepRecord[]> {
    if (this.platform === 'ios') return fetchHealthKitSleep(since);
    if (this.platform === 'android') return fetchHealthConnectSleep(since);
    return [];
  }

  async fetchBloodGlucose(since: Date): Promise<any[]> {
    if (this.platform !== 'ios') return [];
    if (!this._initialized) {
      console.warn('[HealthKit] fetchBloodGlucose: not initialized — call requestPermissions() first');
      return [];
    }
    return new Promise((resolve) => {
      if (!isRNHAvailable()) { resolve([]); return; }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
      AppleHealthKit.getBloodGlucoseSamples(
        { startDate: since.toISOString() },
        (err: any, results: any) => {
          if (err) {
            console.warn('[HealthKit] Glucose error:', err);
            resolve([]);
            return;
          }
          console.log('[HealthKit] Glucose count:', results?.length);
          resolve(results || []);
        }
      );
    });
  }

  async fetchWeight(_since: Date): Promise<any[]> {
    if (this.platform !== 'ios') return [];
    if (!this._initialized) {
      console.warn('[HealthKit] fetchWeight: not initialized — call requestPermissions() first');
      return [];
    }
    return new Promise((resolve) => {
      if (!isRNHAvailable()) { resolve([]); return; }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
      AppleHealthKit.getLatestWeight(
        {},
        (err: any, result: any) => {
          if (err) {
            console.warn('[HealthKit] Weight error:', err);
            resolve([]);
            return;
          }
          resolve(result ? [result] : []);
        }
      );
    });
  }

  async fetchCalories(since: Date): Promise<any[]> {
    if (this.platform !== 'ios') return [];
    if (!this._initialized) {
      console.warn('[HealthKit] fetchCalories: not initialized — call requestPermissions() first');
      return [];
    }
    return new Promise((resolve) => {
      if (!isRNHAvailable()) { resolve([]); return; }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
      AppleHealthKit.getActiveEnergyBurned(
        { startDate: since.toISOString() },
        (err: any, results: any) => {
          if (err) {
            console.warn('[HealthKit] Calories error:', err);
            resolve([]);
            return;
          }
          console.log('[HealthKit] Calories count:', results?.length);
          resolve(results || []);
        }
      );
    });
  }

  async fetchStepsDirect(since: Date): Promise<number> {
    if (this.platform !== 'ios') return 0;
    if (!this._initialized) {
      console.warn('[HealthKit] fetchStepsDirect: not initialized — call requestPermissions() first');
      return 0;
    }
    return new Promise((resolve) => {
      if (!isRNHAvailable()) { resolve(0); return; }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
      AppleHealthKit.getStepCount(
        { startDate: since.toISOString() },
        (err: any, result: any) => {
          if (err) {
            console.warn('[HealthKit] Steps error:', err);
            resolve(0);
            return;
          }
          resolve(result?.value || 0);
        }
      );
    });
  }

  async syncAll(since?: Date, until?: Date, cancellationToken?: CancellationToken): Promise<NativeHealthSyncResult> {
    // ── Hard limit: automatic sync window capped at 7 days ───────────────────
    // If the caller passes a since date older than 7 days, clamp it.
    // This prevents accidental full-history fetches from crashing Hermes.
    const autoWindowStart = new Date(Date.now() - HK_LIMITS.AUTO_WINDOW_MS);
    const rawSince = since ?? autoWindowStart;
    const sinceDate = rawSince < autoWindowStart ? autoWindowStart : rawSince;
    const untilDate = until ?? new Date();
    const errors: string[] = [];
    const syncStart = Date.now();

    const EMPTY_RESULT: NativeHealthSyncResult = {
      bloodPressure: [], heartRate: [], sleep: [], bodyComposition: [],
      activity: [], spO2: [], temperature: [], respiratoryRate: [],
      steps: 0, bloodGlucose: [], restingHRSamples: [], errors, distanceWalkingRunningM: 0, distanceCyclingM: 0,
      counts: { bloodPressure: 0, heartRate: 0, sleep: 0, bodyComposition: 0,
        activity: 0, spO2: 0, temperature: 0, respiratoryRate: 0, steps: 0, bloodGlucose: 0 },
    };

    // ── Guard 1: iOS only ────────────────────────────────────────────────────
    if (this.platform === 'ios') {
      // ── Guard 2: native module must exist ──────────────────────────────────
      const rnhLinked = isRNHAvailable();
      let nitroOk = false;
      try {
        const HK = await loadHealthKit().catch(() => null);
        const hkDefault = (HK as any)?.default;
        nitroOk = hkDefault != null &&
          typeof hkDefault.isHealthDataAvailable === 'function' &&
          hkDefault.isHealthDataAvailable();
      } catch (_) { /* ignore */ }

      if (!nitroOk && !rnhLinked) {
        console.warn('[HealthKit] syncAll: neither Nitro nor RCT bridge available — skipping data fetch');
        return { ...EMPTY_RESULT, errors: ['HealthKit entitlement not active — neither Nitro nor RCT bridge available'] };
      }

      if (!nitroOk && rnhLinked) {
        console.info('[HealthKit] syncAll: Nitro bridge not available, proceeding via RCT bridge (react-native-health)');
      }

      // ── Guard 3: cancellation check ────────────────────────────────────────
      if (cancellationToken?.isCancelled) return EMPTY_RESULT;

      logSyncStage('syncAll start', 'all', 0);

      // ── Sequential fetch — spec §6: no Promise.all for HealthKit queries ──
      // Updated fetch order: weight → steps/activity → RHR → HR → sleep → BP → glucose → SpO2 → workouts
      // Activity/workout window: hard-capped at 14 days, 50-record limit.
      // BP window: hard-capped at 14 days, 50-record limit.
      // Each fetch is individually guarded; one failure does not abort the rest.

      // Enforce 14-day window for activity and BP (may be stricter than sinceDate)
      const activityWindowStart = new Date(Math.max(sinceDate.getTime(), Date.now() - HK_LIMITS.AUTO_WINDOW_MS));

      // 1. Weight / body composition (most recent)
      let bodyComposition: BodyCompositionRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        bodyComposition = await safeHealthKitCall(
          'fetchBodyComposition',
          () => fetchHealthKitBodyComposition(sinceDate, untilDate),
          [],
        ).catch(e => { errors.push(`Body: ${e.message}`); return []; });
        logSyncStage('syncAll', 'bodyComposition', bodyComposition.length, Date.now() - syncStart);
      }
      // 2. Steps / activity (14-day window)
      let steps: number = 0;
      if (!cancellationToken?.isCancelled) {
        steps = await safeHealthKitCall(
          'fetchSteps',
          () => fetchHealthKitSteps(activityWindowStart, untilDate),
          0,
        ).catch(e => { errors.push(`Steps: ${e.message}`); return 0; });
        logSyncStage('syncAll', 'steps', steps, Date.now() - syncStart);
      }
      // 3a. Resting Heart Rate (last 30 days — one sample per day from Apple Watch)
      // Uses a 30-day window because Apple Watch only writes one RHR sample per day.
      // Limit matches MAX_SAMPLES_PER_TYPE (100) which is more than enough for 30 days.
      let restingHRSamples: PulseRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        const rhWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rhSince = sinceDate < rhWindowStart ? rhWindowStart : sinceDate;
        restingHRSamples = await safeHealthKitCall(
          'fetchRestingHeartRate',
          () => fetchHealthKitRestingHeartRate(rhSince, untilDate),
          [],
        ).catch(e => { errors.push(`RHR: ${e.message}`); return []; });
        restingHRSamples = ensureArray<PulseRecord>(restingHRSamples).slice(0, HK_LIMITS.MAX_SAMPLES_PER_TYPE);
        logSyncStage('syncAll', 'restingHeartRate', restingHRSamples.length, Date.now() - syncStart);
      }
      // 3b. Active Heart Rate
      let heartRate: PulseRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        heartRate = await safeHealthKitCall(
          'fetchHeartRate',
          () => fetchHealthKitHeartRate(sinceDate, untilDate),
          [],
        ).catch(e => { errors.push(`HR: ${e.message}`); return []; });
        // Hard limit: 100 samples
        heartRate = ensureArray<PulseRecord>(heartRate).slice(0, HK_LIMITS.MAX_SAMPLES_PER_TYPE);
        logSyncStage('syncAll', 'heartRate', heartRate.length, Date.now() - syncStart);
      }
      // 4. Sleep (last 7 days)
      let sleep: SleepRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        const sleepWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const sleepSince = sinceDate > sleepWindowStart ? sinceDate : sleepWindowStart;
        sleep = await safeHealthKitCall(
          'fetchSleep',
          () => fetchHealthKitSleep(sleepSince, untilDate),
          [],
        ).catch(e => { errors.push(`Sleep: ${e.message}`); return []; });
        logSyncStage('syncAll', 'sleep', sleep.length, Date.now() - syncStart);
      }
      // 5. Blood pressure (14-day window, 50-record cap)
      let bloodPressure: BloodPressureRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        bloodPressure = await safeHealthKitCall(
          'fetchBloodPressure',
          () => fetchHealthKitBloodPressure(activityWindowStart, untilDate),
          [],
        ).catch(e => { errors.push(`BP: ${e.message}`); return []; });
        // fetchHealthKitBloodPressure enforces the 50-record cap internally; belt-and-suspenders:
        bloodPressure = ensureArray<BloodPressureRecord>(bloodPressure).slice(0, HK_LIMITS.MAX_BP_RECORDS);
        logSyncStage('syncAll', 'bloodPressure', bloodPressure.length, Date.now() - syncStart);
      }
      // 6. Blood glucose (14-day window)
      let bloodGlucose: BloodSugarRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        bloodGlucose = await safeHealthKitCall(
          'fetchBloodGlucose',
          () => fetchHealthKitBloodGlucose(activityWindowStart, untilDate),
          [],
        ).catch(e => { errors.push(`Glucose: ${e.message}`); return []; });
        bloodGlucose = ensureArray<BloodSugarRecord>(bloodGlucose).slice(0, HK_LIMITS.MAX_SAMPLES_PER_TYPE);
        logSyncStage('syncAll', 'bloodGlucose', bloodGlucose.length, Date.now() - syncStart);
      }
      // 7. SpO2 (last 7 days)
      let spO2: VitalSignsRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        const spo2WindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const spo2Since = sinceDate > spo2WindowStart ? sinceDate : spo2WindowStart;
        spO2 = await safeHealthKitCall(
          'fetchSpO2',
          () => fetchHealthKitSpO2(spo2Since, untilDate),
          [],
        ).catch(e => { errors.push(`SpO2: ${e.message}`); return []; });
        spO2 = ensureArray<VitalSignsRecord>(spO2).slice(0, HK_LIMITS.MAX_SAMPLES_PER_TYPE);
        logSyncStage('syncAll', 'spO2', spO2.length, Date.now() - syncStart);
      }
      // 8. Workouts / activity (14-day window, 50-record hard cap)
      let activity: ActivityRecord[] = [];
      if (!cancellationToken?.isCancelled) {
        activity = await safeHealthKitCall(
          'fetchWorkouts',
          () => fetchHealthKitWorkouts(activityWindowStart, untilDate),
          [],
        ).catch(e => { errors.push(`Workouts: ${e.message}`); return []; });
        // Hard cap: 50 activity records per sync — historical import requires manual user action
        activity = ensureArray<ActivityRecord>(activity).slice(0, HK_LIMITS.MAX_ACTIVITY_RECORDS);
        logSyncStage('syncAll', 'activity', activity.length, Date.now() - syncStart);
      }

      // 9. Optional advanced: temperature, respiratory rate, walking/cycling distance
      let temperature: VitalSignsRecord[] = [];
      let respiratoryRate: VitalSignsRecord[] = [];
      let distanceWalkingRunningM = 0;
      let distanceCyclingM = 0;
      if (!cancellationToken?.isCancelled) {
        temperature = await safeHealthKitCall(
          'fetchBodyTemperature',
          () => fetchHealthKitBodyTemperature(sinceDate, untilDate),
          [],
        ).catch(e => { errors.push(`Temp: ${e.message}`); return []; });
        logSyncStage('syncAll', 'temperature', temperature.length, Date.now() - syncStart);
      }
      if (!cancellationToken?.isCancelled) {
        respiratoryRate = await safeHealthKitCall(
          'fetchRespiratoryRate',
          () => fetchHealthKitRespiratoryRate(sinceDate, untilDate),
          [],
        ).catch(e => { errors.push(`RR: ${e.message}`); return []; });
        logSyncStage('syncAll', 'respiratoryRate', respiratoryRate.length, Date.now() - syncStart);
      }
      if (!cancellationToken?.isCancelled) {
        distanceWalkingRunningM = await safeHealthKitCall(
          'fetchDistanceWalkingRunning',
          () => fetchHealthKitDistanceWalkingRunning(sinceDate, untilDate),
          0,
        ).catch(e => { errors.push(`DistWalk: ${e.message}`); return 0; });
      }
      if (!cancellationToken?.isCancelled) {
        distanceCyclingM = await safeHealthKitCall(
          'fetchDistanceCycling',
          () => fetchHealthKitDistanceCycling(sinceDate, untilDate),
          0,
        ).catch(e => { errors.push(`DistCycle: ${e.message}`); return 0; });
      }

      const counts = {
        bloodPressure: bloodPressure.length,
        heartRate: heartRate.length,
        sleep: sleep.length,
        bodyComposition: bodyComposition.length,
        activity: activity.length,
        spO2: spO2.length,
        temperature: temperature.length,
        respiratoryRate: respiratoryRate.length,
        steps: typeof steps === 'number' ? steps : 0,
        bloodGlucose: bloodGlucose.length,
      };

      const totalDuration = Date.now() - syncStart;
      logSyncStage('syncAll complete', 'all', Object.values(counts).reduce((s, v) => s + v, 0), totalDuration);

      const allEmpty = Object.values(counts).every(v => v === 0);
      if (allEmpty) {
        console.warn(
          '[HealthKit] syncAll: ALL types returned 0 results.\n' +
          '  Possible causes:\n' +
          '  1. App is running in Expo Go or on a simulator (HealthKit requires a real device + EAS build)\n' +
          '  2. User denied permissions — check Settings → Health → Data Access & Devices → VitalSync\n' +
          '  3. Apple Health has no data for the queried period (check Health app manually)\n' +
          '  4. The HealthKit entitlement is not active — rebuild via: eas build --platform ios',
        );
      }

      return {
        bloodPressure, heartRate, sleep, bodyComposition, activity,
        spO2, temperature, respiratoryRate, steps, bloodGlucose,
        restingHRSamples,
        distanceWalkingRunningM: typeof distanceWalkingRunningM === 'number' ? distanceWalkingRunningM : 0,
        distanceCyclingM: typeof distanceCyclingM === 'number' ? distanceCyclingM : 0,
        errors, counts,
      };
    }

    if (this.platform === 'android') {
      // Android: sequential fetch (same Hermes-safety principle)
      const bloodPressure = await safeHealthKitCall('fetchBP', () => fetchHealthConnectBloodPressure(sinceDate), []).catch(e => { errors.push(`BP: ${e.message}`); return []; });
      const heartRate     = await safeHealthKitCall('fetchHR', () => fetchHealthConnectHeartRate(sinceDate), []).catch(e => { errors.push(`HR: ${e.message}`); return []; });
      const sleep         = await safeHealthKitCall('fetchSleep', () => fetchHealthConnectSleep(sinceDate), []).catch(e => { errors.push(`Sleep: ${e.message}`); return []; });
      const bodyComposition = await safeHealthKitCall('fetchBody', () => fetchHealthConnectBodyComposition(sinceDate), []).catch(e => { errors.push(`Body: ${e.message}`); return []; });
      const activity      = await safeHealthKitCall('fetchWorkouts', () => fetchHealthConnectWorkouts(sinceDate), []).catch(e => { errors.push(`Workouts: ${e.message}`); return []; });
      const steps         = await safeHealthKitCall('fetchSteps', () => fetchHealthConnectSteps(sinceDate), 0).catch(e => { errors.push(`Steps: ${e.message}`); return 0; });
      return {
        bloodPressure, heartRate, sleep, bodyComposition, activity,
        spO2: [], temperature: [], respiratoryRate: [], steps, bloodGlucose: [],
        errors,
        counts: {
          bloodPressure: bloodPressure.length, heartRate: heartRate.length,
          sleep: sleep.length, bodyComposition: bodyComposition.length,
          activity: activity.length, spO2: 0, temperature: 0,
          respiratoryRate: 0, steps: typeof steps === 'number' ? steps : 0, bloodGlucose: 0,
        },
      };
    }

    return { ...EMPTY_RESULT, errors: ['Not available on web'] };
  }
}

async function fetchHealthKitBloodPressure(since: Date, until: Date = new Date()): Promise<BloodPressureRecord[]> {
  // Enforce 14-day window and 50-record cap regardless of caller-supplied window
  const windowStart = new Date(Math.max(since.getTime(), Date.now() - HK_LIMITS.AUTO_WINDOW_MS));
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      // Nitro bridge unavailable — fall back to react-native-health (RCT bridge)
      console.info('[HealthKit] Nitro bridge unavailable for BP — trying RCT bridge fallback');
      const rnh = await rnhFetchBloodPressure(windowStart, until);
      const mapped: BloodPressureRecord[] = ensureArray<any>(rnh).map((r: any) => {
        // react-native-health getBloodPressureSamples returns bloodPressureSystolicValue /
        // bloodPressureDiastolicValue as the canonical field names per the RNHBloodPressureSample
        // interface. Some builds may also expose .systolic / .diastolic directly.
        const rawSys = r.bloodPressureSystolicValue ?? (r as any).systolic;
        const rawDia = r.bloodPressureDiastolicValue ?? (r as any).diastolic;
        const sys = rawSys != null && isFinite(Number(rawSys)) && Number(rawSys) > 0
          ? Math.round(Number(rawSys)) : null;
        const dia = rawDia != null && isFinite(Number(rawDia)) && Number(rawDia) > 0
          ? Math.round(Number(rawDia)) : null;
        // Skip records where both values are absent
        if (sys === null && dia === null) return null;
        return {
          id: r.id ?? uuid(),
          timestamp: r.startDate,
          systolic: sys,
          diastolic: dia,
          source: 'Apple Health',
        } as BloodPressureRecord;
      }).filter((r): r is BloodPressureRecord => r !== null);
      return mapped.slice(0, HK_LIMITS.MAX_BP_RECORDS);
    }
    // Nitro bridge: query the BP correlation type (contains both systolic + diastolic objects)
    const results = await HK.queryCorrelationSamples(
      'HKCorrelationTypeIdentifierBloodPressure' as any,
      { from: windowStart, to: until, limit: HK_LIMITS.MAX_BP_RECORDS } as any,
    );
    return ensureArray<any>(results).map((r: any) => {
      const systolicSample = r.objects?.find((o: any) =>
        o.quantityType === 'HKQuantityTypeIdentifierBloodPressureSystolic',
      );
      const diastolicSample = r.objects?.find((o: any) =>
        o.quantityType === 'HKQuantityTypeIdentifierBloodPressureDiastolic',
      );
      const sys = systolicSample?.quantity != null && isFinite(Number(systolicSample.quantity)) && Number(systolicSample.quantity) > 0
        ? Math.round(Number(systolicSample.quantity)) : null;
      const dia = diastolicSample?.quantity != null && isFinite(Number(diastolicSample.quantity)) && Number(diastolicSample.quantity) > 0
        ? Math.round(Number(diastolicSample.quantity)) : null;
      // Skip records where both values are absent
      if (sys === null && dia === null) return null;
      return {
        id: r.uuid ?? uuid(),
        timestamp: (r.startDate instanceof Date ? r.startDate.toISOString() : r.startDate) ?? new Date().toISOString(),
        systolic: sys,
        diastolic: dia,
        source: 'Apple Health',
      } as BloodPressureRecord;
    }).filter((r: BloodPressureRecord | null): r is BloodPressureRecord => r !== null)
      .slice(0, HK_LIMITS.MAX_BP_RECORDS);
  } catch (e) {
    console.warn('[HealthKit] fetchBloodPressure failed:', e);
    return [];
  }
}

async function fetchHealthKitHeartRate(since: Date, until: Date = new Date()): Promise<PulseRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      // Nitro bridge unavailable — fall back to react-native-health (RCT bridge)
      console.info('[HealthKit] Nitro bridge unavailable for HR — trying RCT bridge fallback');
      // Sequential fetch — no Promise.all for HealthKit queries (Hermes safety)
      const hrSamples = await rnhFetchHeartRate(since, until);
      const hrvSamples = await rnhFetchHRV(since, until);
      const hrvMap = new Map<number, number>();
      for (const h of hrvSamples) {
        hrvMap.set(new Date(h.startDate).getTime(), h.value);
      }
      return hrSamples.map((s) => {
        const ts = new Date(s.startDate).getTime();
        let closestHrv: number | undefined;
        let minDiff = 5 * 60 * 1000;
        for (const [t, v] of hrvMap.entries()) {
          const diff = Math.abs(t - ts);
          if (diff < minDiff) { minDiff = diff; closestHrv = v; }
        }
        return {
          id: s.id ?? uuid(),
          timestamp: s.startDate,
          bpm: Math.round(s.value),
          hrv: closestHrv !== undefined ? Math.round(closestHrv) : undefined,
          source: 'Apple Health',
        } as PulseRecord;
      });
    }
    // Sequential fetch — no Promise.all for HealthKit queries (Hermes safety)
    const hrSamples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate' as any, {
      limit: 100, // hard limit per spec §7
      unit: 'count/min',
      from: since,
      to: until,
    });
    const hrvSamples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN' as any, {
      limit: 100,
      unit: 'ms',
      from: since,
      to: until,
    }).catch(() => [] as any[]);

    // Build a map of HRV by nearest timestamp (within 5 min)
    const hrvMap = new Map<number, number>();
    for (const h of (hrvSamples as any[])) {
      const t = new Date(h.startDate).getTime();
      hrvMap.set(t, h.quantity);
    }

    return (hrSamples as any[]).map((s: any) => {
      const ts = new Date(s.startDate).getTime();
      // Find closest HRV reading within 5 minutes
      let closestHrv: number | undefined;
      let minDiff = 5 * 60 * 1000;
      for (const [t, v] of hrvMap.entries()) {
        const diff = Math.abs(t - ts);
        if (diff < minDiff) { minDiff = diff; closestHrv = v; }
      }
      return {
        id: s.uuid ?? uuid(),
        timestamp: (s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate) ?? new Date().toISOString(),
        bpm: Math.round(s.quantity),
        hrv: closestHrv !== undefined ? Math.round(closestHrv) : undefined,
        source: 'Apple Health',
      } as PulseRecord;
    });
  } catch (e) {
    console.warn('[HealthKit] fetchHeartRate failed:', e);
    return [];
  }
}

// ─── Resting Heart Rate ──────────────────────────────────────────────────────
async function fetchHealthKitRestingHeartRate(since: Date, until: Date = new Date()): Promise<PulseRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      // Nitro bridge unavailable — fall back to react-native-health (RCT bridge)
      console.info('[HealthKit] Nitro bridge unavailable for Resting HR — trying RCT bridge fallback');
      const samples = await rnhFetchRestingHeartRate(since, until);
      return samples.map((s) => ({
        id: s.id ?? uuid(),
        timestamp: s.startDate,
        bpm: Math.round(s.value),
        source: 'Apple Health (Resting)',
      } as PulseRecord));
    }
    // Nitro bridge: queryQuantitySamples for RestingHeartRate
    // Apple Watch writes one sample per day — limit 100 is well above any 30-day window.
    const samples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate' as any, {
      limit: 100,
      unit: 'count/min',
      from: since,
      to: until,
    });
    return (samples as any[]).map((s: any) => ({
      id: s.uuid ?? uuid(),
      timestamp: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
      bpm: Math.round(s.quantity ?? s.value ?? 0),
      source: 'Apple Health (Resting)',
    } as PulseRecord));
  } catch (e) {
    console.warn('[HealthKit] fetchRestingHeartRate failed:', e);
    return [];
  }
}

async function fetchHealthKitSleep(since: Date, until: Date = new Date()): Promise<SleepRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for Sleep — trying RCT bridge fallback');
      const rnh = await rnhFetchSleep(since, until);
      // RNH sleep samples: value is a string like 'INBED', 'ASLEEP', 'CORE', 'DEEP', 'REM', 'AWAKE'
      const nights = new Map<string, typeof rnh>();
      for (const s of rnh) {
        const key = new Date(s.endDate).toISOString().slice(0, 10);
        if (!nights.has(key)) nights.set(key, []);
        nights.get(key)!.push(s);
      }
      const records: SleepRecord[] = [];
      for (const [date, segs] of nights.entries()) {
        if (segs.length === 0) continue;
        const bedtime = segs.reduce((min, s) => new Date(s.startDate) < new Date(min.startDate) ? s : min, segs[0]);
        const wakeTime = segs.reduce((max, s) => new Date(s.endDate) > new Date(max.endDate) ? s : max, segs[0]);
        let deepMinutes = 0, remMinutes = 0, lightMinutes = 0, coreMinutes = 0, awakeMinutes = 0;
        for (const s of segs) {
          const mins = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
          const v = (s.value ?? '').toUpperCase();
          if (v === 'DEEP') deepMinutes += mins;
          else if (v === 'REM') remMinutes += mins;
          else if (v === 'CORE') coreMinutes += mins;
          else if (v === 'ASLEEP') lightMinutes += mins;
          else if (v === 'AWAKE') awakeMinutes += mins;
        }
        const totalMinutes = deepMinutes + remMinutes + coreMinutes + lightMinutes;
        const efficiency = totalMinutes > 0 ? Math.round((totalMinutes / (totalMinutes + awakeMinutes)) * 100) : 0;
        records.push({
          id: uuid(), date,
          bedtime: bedtime.startDate,
          wakeTime: wakeTime.endDate,
          totalMinutes: Math.round(totalMinutes),
          deepMinutes: Math.round(deepMinutes),
          remMinutes: Math.round(remMinutes),
          lightMinutes: Math.round(lightMinutes),
          coreMinutes: Math.round(coreMinutes),
          awakeMinutes: Math.round(awakeMinutes),
          efficiency,
          source: 'Apple Health',
        });
      }
      return records;
    }
    const samples = await HK.queryCategorySamples(
      'HKCategoryTypeIdentifierSleepAnalysis' as any,
      { limit: 500, from: since, to: until },
    );

    // Group samples by night (date of wakeTime)
    const nights = new Map<string, any[]>();
    for (const s of (samples as any[])) {
      const wakeDate = new Date(s.endDate);
      // Attribute to the calendar date of wake-up
      const key = wakeDate.toISOString().slice(0, 10);
      if (!nights.has(key)) nights.set(key, []);
      nights.get(key)!.push(s);
    }

    const records: SleepRecord[] = [];
    for (const [date, segs] of nights.entries()) {
      const bedtime = segs.reduce((min: any, s: any) =>
        new Date(s.startDate) < new Date(min.startDate) ? s : min, segs[0]);
      const wakeTime = segs.reduce((max: any, s: any) =>
        new Date(s.endDate) > new Date(max.endDate) ? s : max, segs[0]);

      let deepMinutes = 0, remMinutes = 0, lightMinutes = 0, coreMinutes = 0, awakeMinutes = 0;
      for (const s of segs) {
        const mins = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
        // HKCategoryValueSleepAnalysis: 0=inBed, 1=asleep, 2=awake, 3=core, 4=deep, 5=rem
        switch (s.value) {
          case 4: deepMinutes += mins; break;
          case 5: remMinutes += mins; break;
          case 3: coreMinutes += mins; break;
          case 1: lightMinutes += mins; break;
          case 2: awakeMinutes += mins; break;
        }
      }
      const totalMinutes = deepMinutes + remMinutes + coreMinutes + lightMinutes;
      const efficiency = totalMinutes > 0
        ? Math.round((totalMinutes / (totalMinutes + awakeMinutes)) * 100)
        : 0;

      records.push({
        id: uuid(),
        date,
        bedtime: (bedtime.startDate instanceof Date ? bedtime.startDate.toISOString() : bedtime.startDate),
        wakeTime: (wakeTime.endDate instanceof Date ? wakeTime.endDate.toISOString() : wakeTime.endDate),
        totalMinutes: Math.round(totalMinutes),
        deepMinutes: Math.round(deepMinutes),
        remMinutes: Math.round(remMinutes),
        lightMinutes: Math.round(lightMinutes),
        coreMinutes: Math.round(coreMinutes),
        awakeMinutes: Math.round(awakeMinutes),
        efficiency,
        source: 'Apple Health',
      });
    }
    return records;
  } catch (e) {
    console.warn('[HealthKit] fetchSleep failed:', e);
    return [];
  }
}

async function fetchHealthKitBodyComposition(since: Date, until: Date = new Date()): Promise<BodyCompositionRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for BodyComp — trying RCT bridge fallback');
      // Sequential fetch — no Promise.all for HealthKit queries (Hermes safety)
      const weightSamples = await rnhFetchWeight(since, until);
      const fatSamples = await rnhFetchBodyFat(since, until);
      return weightSamples.map((s) => {
        const weightKg = s.value;
        const ts = new Date(s.startDate).getTime();
        let fatPct: number | undefined;
        let minDiff = 24 * 60 * 60 * 1000;
        for (const f of fatSamples) {
          const diff = Math.abs(new Date(f.startDate).getTime() - ts);
          if (diff < minDiff) { minDiff = diff; fatPct = f.value; }
        }
        return {
          id: s.id ?? uuid(),
          timestamp: s.startDate,
          weightKg: Math.round(weightKg * 10) / 10,
          fatMassKg: fatPct !== undefined ? Math.round(weightKg * fatPct / 100 * 10) / 10 : undefined,
          source: 'Apple Health',
        } as BodyCompositionRecord;
      });
    }
    // Sequential fetch — no Promise.all for HealthKit queries (Hermes safety)
    const weightSamples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierBodyMass' as any, {
      limit: 100, unit: 'kg', from: since, to: until,
    });
    const fatSamples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage' as any, {
      limit: 100, unit: '%', from: since, to: until,
    }).catch(() => [] as any[]);
    const heightSamples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierHeight' as any, {
      limit: 10, unit: 'm', from: since, to: until,
    }).catch(() => [] as any[]);
    const leanMassSamples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierLeanBodyMass' as any, {
      limit: 10, unit: 'kg', from: since, to: until,
    }).catch(() => [] as any[]);

    const latestHeight: number | undefined = (heightSamples as any[]).length > 0
      ? (heightSamples as any[]).slice(-1)[0].quantity
      : undefined;
    const latestLeanMass: number | undefined = (leanMassSamples as any[]).length > 0
      ? (leanMassSamples as any[]).slice(-1)[0].quantity
      : undefined;

    return (weightSamples as any[]).reduce((acc: BodyCompositionRecord[], s: any) => {
      const weightKg = s.quantity;
      // Guard: weight must be a finite positive number
      if (!isFinite(weightKg) || weightKg <= 0) return acc;
      // Weight unit safety: convertWeightToLb validates the 50–700 lb range
      const weightLb = convertWeightToLb(weightKg, 'kg');
      if (weightLb === null) return acc; // outside plausible adult range — skip

      const heightM = latestHeight;
      const bmi = heightM ? Math.round((weightKg / (heightM * heightM)) * 10) / 10 : undefined;
      // Find closest fat % reading within 24 hours
      const ts = new Date(s.startDate).getTime();
      let fatPct: number | undefined;
      let minDiff = 24 * 60 * 60 * 1000;
      for (const f of (fatSamples as any[])) {
        const diff = Math.abs(new Date(f.startDate).getTime() - ts);
        if (diff < minDiff) { minDiff = diff; fatPct = f.quantity; }
      }
      acc.push({
        id: s.uuid ?? uuid(),
        timestamp: (s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate) ?? new Date().toISOString(),
        weightKg: Math.round(weightKg * 10) / 10,
        fatMassKg: fatPct !== undefined ? Math.round(weightKg * fatPct / 100 * 10) / 10 : undefined,
        leanBodyMassKg: latestLeanMass !== undefined ? Math.round(latestLeanMass * 10) / 10 : undefined,
        heightM: heightM !== undefined ? Math.round(heightM * 1000) / 1000 : undefined,
        bmi,
        source: 'Apple Health',
      } as BodyCompositionRecord);
      return acc;
    }, []);
  } catch (e) {
    console.warn('[HealthKit] fetchBodyComposition failed:', e);
    return [];
  }
}

async function fetchHealthKitSteps(since: Date, until: Date = new Date()): Promise<number> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for Steps — trying RCT bridge fallback');
      return rnjFetchSteps(since, until);
    }
    const samples = await HK.queryQuantitySamples('HKQuantityTypeIdentifierStepCount' as any, {
      limit: 100, // hard limit per spec §7
      unit: 'count',
      from: since, to: until,
    });
    return (samples as any[]).reduce((sum: number, s: any) => sum + (s.quantity ?? 0), 0);
  } catch (e) {
    console.warn('[HealthKit] fetchSteps failed:', e);
    return 0;
  }
}

async function fetchHealthKitSpO2(since: Date, until: Date = new Date()): Promise<VitalSignsRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for SpO2 — trying RCT bridge fallback');
      const rnh = await rnhFetchSpO2(since, until);
      return rnh.map((s) => ({
        id: s.id ?? uuid(),
        timestamp: s.startDate,
        // RNH getOxygenSaturationSamples returns HKUnit.percent() fraction (0.0–1.0); multiply by 100 for display
        oxygenSaturation: Math.round(s.value <= 1.5 ? s.value * 100 : s.value),
        spo2: Math.round(s.value <= 1.5 ? s.value * 100 : s.value),
        source: 'healthkit' as const,
      } as VitalSignsRecord));
    }
    const samples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierOxygenSaturation' as any,
      { limit: 100, unit: '%', from: since, to: until }, // hard limit per spec §7
    );
    return (samples as any[]).map((s: any) => {
      // @kingstinct/react-native-healthkit: HKUnit.percent() returns fraction (0.0–1.0).
      // Guard with <= 1.5 to prevent double-conversion if a future SDK version changes this.
      const rawFraction = typeof s.quantity === 'number' ? s.quantity : 0;
      const spo2PercentDisplay = Math.round(rawFraction <= 1.5 ? rawFraction * 100 : rawFraction);
      return {
        id: s.uuid ?? uuid(),
        timestamp: (s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate) ?? new Date().toISOString(),
        oxygenSaturation: spo2PercentDisplay, // % (0–100) — converted from HKUnit.percent() fraction
        spo2: spo2PercentDisplay,
        source: 'healthkit' as const,
      } as VitalSignsRecord;
    });
  } catch (e) {
    console.warn('[HealthKit] fetchSpO2 failed:', e);
    return [];
  }
}

async function fetchHealthKitBodyTemperature(since: Date, until: Date = new Date()): Promise<VitalSignsRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for BodyTemp — trying RCT bridge fallback');
      const rnh = await rnhFetchBodyTemperature(since, until);
      return rnh.map((s) => {
        const tempF = Math.round((s.value * 9 / 5 + 32) * 10) / 10;
        return {
          id: s.id ?? uuid(),
          timestamp: s.startDate,
          temperature: tempF,
          source: 'healthkit' as const,
        } as VitalSignsRecord;
      });
    }
    const samples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierBodyTemperature' as any,
      // HealthKit stores body temperature in °C by default
      { limit: 100, unit: 'degC', from: since, to: until }, // hard limit per spec §7
    );
    return (samples as any[]).map((s: any) => {
      // Convert °C → °F for internal storage (VitalSignsRecord.temperature is in °F)
      const tempF = Math.round((s.quantity * 9 / 5 + 32) * 10) / 10;
      return {
        id: s.uuid ?? uuid(),
        timestamp: (s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate) ?? new Date().toISOString(),
        temperature: tempF,
        source: 'healthkit' as const,
      } as VitalSignsRecord;
    });
  } catch (e) {
    console.warn('[HealthKit] fetchBodyTemperature failed:', e);
    return [];
  }
}

// ─── Respiratory Rate ────────────────────────────────────────────────────────

async function fetchHealthKitRespiratoryRate(since: Date, until: Date = new Date()): Promise<VitalSignsRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for RR — trying RCT bridge fallback');
      const rnh = await rnhFetchRespiratoryRate(since, until);
      return rnh.map((s) => ({
        id: s.id ?? uuid(),
        timestamp: s.startDate,
        respiratoryRate: Math.round(s.value * 10) / 10,
        source: 'healthkit' as const,
      } as VitalSignsRecord));
    }
    const samples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierRespiratoryRate' as any,
      { limit: 100, unit: 'count/min', from: since, to: until }, // hard limit per spec §7
    );
    return (samples as any[]).map((s: any) => ({
      id: s.uuid ?? uuid(),
      timestamp: (s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate) ?? new Date().toISOString(),
      respiratoryRate: Math.round(s.quantity * 10) / 10, // breaths/min
      source: 'healthkit' as const,
    } as VitalSignsRecord));
  } catch (e) {
    console.warn('[HealthKit] fetchRespiratoryRate failed:', e);
    return [];
  }
}


// ─── Blood Glucose ────────────────────────────────────────────────────────────

async function fetchHealthKitBloodGlucose(since: Date, until: Date = new Date()): Promise<BloodSugarRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      // Nitro bridge unavailable — fall back to react-native-health (RCT bridge)
      console.info('[HealthKit] Nitro bridge unavailable for BloodGlucose — trying RCT bridge fallback');
      const rnh = await rnhFetchBloodGlucose(since, until);
      return rnh.map((s) => ({
        id: s.id ?? uuid(),
        timestamp: s.startDate,
        // react-native-health returns mmol/L when unit:'mmolPerL' is specified
        glucoseMmol: parseFloat((s.value).toFixed(2)),
        glucoseMgDl: Math.round(s.value * 18.0182),
        context: 'random' as const,
        source: 'healthkit' as const,
        deviceName: 'Apple Health',
      } as BloodSugarRecord));
    }
    // Nitro bridge: query using the exact HKUnit molar-mass string for blood glucose.
    // 'mmol/L' is NOT a valid HKUnit — iOS requires the molar mass encoded as
    // 'mmol<180.15588000005408>/l'. Passing the wrong unit throws NSException → SIGABRT.
    const samples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierBloodGlucose' as any,
      { limit: 100, unit: 'mmol<180.15588000005408>/l' as any, from: since, to: until, ascending: false }, // hard limit per spec §7
    );
    return (samples as any[]).map((s: any) => {
      const mmol = parseFloat((s.quantity ?? 0).toFixed(2));
      return {
        id: s.uuid ?? uuid(),
        timestamp: (s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate) ?? new Date().toISOString(),
        glucoseMmol: mmol,
        glucoseMgDl: Math.round(mmol * 18.0182),
        context: 'random' as const,
        source: 'healthkit' as const,
        deviceName: 'Apple Health',
      } as BloodSugarRecord;
    });
  } catch (e) {
    console.warn('[HealthKit] fetchHealthKitBloodGlucose failed:', e);
    return [];
  }
}

// ─── HealthKit workout type mapping ─────────────────────────────────────────

// HKWorkoutActivityType numeric values → ActivityType
const HK_WORKOUT_MAP: Record<number, ActivityType> = {
  37: 'outdoor-run',  // HKWorkoutActivityTypeRunning
  38: 'indoor-run',   // HKWorkoutActivityTypeRunning (indoor flag)
  52: 'walk',         // HKWorkoutActivityTypeWalking
  13: 'cycling',      // HKWorkoutActivityTypeCycling
  35: 'workout',      // HKWorkoutActivityTypeTraditionalStrengthTraining
  20: 'workout',      // HKWorkoutActivityTypeFunctionalStrengthTraining
  63: 'workout',      // HKWorkoutActivityTypeHighIntensityIntervalTraining
};

async function fetchHealthKitWorkouts(since: Date, until: Date = new Date()): Promise<ActivityRecord[]> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.info('[HealthKit] Nitro bridge unavailable for Workouts — trying RCT bridge fallback');
      const rnh = await rnjFetchWorkouts(since, until);
      return rnh.map((w) => {
        const actType: ActivityType = HK_WORKOUT_MAP[w.activityId] ?? 'workout';
        return {
          id: w.id ?? uuid(),
          timestamp: w.start,
          type: actType,
          durationMinutes: Math.max(1, Math.round(w.duration / 60)),
          caloriesBurned: w.calories > 0 ? Math.round(w.calories) : undefined,
          distanceKm: w.distance > 0 ? Math.round(w.distance / 1000 * 100) / 100 : undefined,
          source: 'healthkit',
        } as ActivityRecord;
      }).filter((r) => r.durationMinutes > 0);
    }
    const workouts = await HK.queryWorkoutSamples({
      limit: HK_LIMITS.MAX_ACTIVITY_RECORDS, // hard cap: 50 workouts per sync
      from: since, to: until,
    });
    return (workouts as any[]).map((w: any) => {
      const activityTypeNum: number = w.workoutActivityType ?? 37;
      // Detect indoor vs outdoor run via metadata
      let actType: ActivityType = HK_WORKOUT_MAP[activityTypeNum] ?? 'workout';
      if (activityTypeNum === 37 && w.metadata?.HKIndoorWorkout) actType = 'indoor-run';

      const durationMinutes = Math.round((w.duration ?? 0) / 60);
      // SDK v13: totalDistance and totalEnergyBurned are Quantity objects ({ quantity, unit })
      // not nested as .sumQuantity — access .quantity directly
      const distanceKm = w.totalDistance?.quantity != null
        ? Math.round(w.totalDistance.quantity / 10) / 100  // metres → km
        : undefined;
      const distanceMiles = distanceKm !== undefined
        ? Math.round(distanceKm * 0.621371 * 100) / 100
        : undefined;
      const caloriesBurned = w.totalEnergyBurned?.quantity != null
        ? Math.round(w.totalEnergyBurned.quantity)
        : undefined;
      return {
        id: w.uuid ?? uuid(),
        timestamp: (w.startDate instanceof Date ? w.startDate.toISOString() : w.startDate) ?? new Date().toISOString(),
        type: actType,
        durationMinutes: durationMinutes > 0 ? durationMinutes : 1,
        distanceKm,
        distanceMiles,
        caloriesBurned,
        source: 'healthkit',
      } as ActivityRecord;
    }).filter((r: ActivityRecord) => r.durationMinutes > 0);
  } catch (e) {
    console.warn('[HealthKit] fetchWorkouts failed:', e);
    return [];
  }
}

// ─── Android — Health Connect ─────────────────────────────────────────────────

async function requestHealthConnectPermissions(): Promise<boolean> {
  try {
    const HC = await import('react-native-health-connect');
    const initialized = await HC.initialize();
    if (!initialized) return false;
    const permissions = await HC.requestPermission([
      { accessType: 'read', recordType: 'BloodPressure' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'BodyFat' },
      { accessType: 'read', recordType: 'Height' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'OxygenSaturation' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'write', recordType: 'HeartRate' },
      { accessType: 'write', recordType: 'Weight' },
      { accessType: 'write', recordType: 'Steps' },
    ]);
    return permissions.length > 0;
  } catch (e) {
    console.warn('[HealthConnect] requestPermission failed:', e);
    return false;
  }
}

function hcTimeFilter(since: Date) {
  return {
    operator: 'between' as const,
    startTime: since.toISOString(),
    endTime: new Date().toISOString(),
  };
}

async function fetchHealthConnectBloodPressure(since: Date): Promise<BloodPressureRecord[]> {
  try {
    const HC = await import('react-native-health-connect');
    const { records } = await HC.readRecords('BloodPressure', { timeRangeFilter: hcTimeFilter(since) });
    return (records as any[]).map((r: any) => ({
      id: r.metadata?.id ?? uuid(),
      timestamp: r.time,
      systolic: Math.round(r.systolic?.inMillimetersOfMercury ?? 0),
      diastolic: Math.round(r.diastolic?.inMillimetersOfMercury ?? 0),
      source: 'Health Connect',
    })).filter((r: BloodPressureRecord) => (r.systolic ?? 0) > 0);
  } catch (e) {
    console.warn('[HealthConnect] fetchBloodPressure failed:', e);
    return [];
  }
}

async function fetchHealthConnectHeartRate(since: Date): Promise<PulseRecord[]> {
  try {
    const HC = await import('react-native-health-connect');
    // Sequential fetch — no Promise.all for Health Connect queries (Hermes safety)
    const hrResult = await HC.readRecords('HeartRate', { timeRangeFilter: hcTimeFilter(since) });
    const hrvResult = await HC.readRecords('HeartRateVariabilityRmssd', { timeRangeFilter: hcTimeFilter(since) }).catch(() => ({ records: [] }));

    const hrvMap = new Map<number, number>();
    for (const h of (hrvResult.records as any[])) {
      hrvMap.set(new Date(h.time).getTime(), h.heartRateVariabilityMillis);
    }

    return (hrResult.records as any[]).flatMap((r: any) =>
      (r.samples ?? [{ time: r.time, beatsPerMinute: r.beatsPerMinute }]).map((s: any) => {
        const ts = new Date(s.time).getTime();
        let closestHrv: number | undefined;
        let minDiff = 5 * 60 * 1000;
        for (const [t, v] of hrvMap.entries()) {
          const diff = Math.abs(t - ts);
          if (diff < minDiff) { minDiff = diff; closestHrv = v; }
        }
        return {
          id: uuid(),
          timestamp: s.time,
          bpm: s.beatsPerMinute,
          hrv: closestHrv !== undefined ? Math.round(closestHrv) : undefined,
          source: 'Health Connect',
        } as PulseRecord;
      })
    );
  } catch (e) {
    console.warn('[HealthConnect] fetchHeartRate failed:', e);
    return [];
  }
}

async function fetchHealthConnectSleep(since: Date): Promise<SleepRecord[]> {
  try {
    const HC = await import('react-native-health-connect');
    const { records } = await HC.readRecords('SleepSession', { timeRangeFilter: hcTimeFilter(since) });
    return (records as any[]).map((r: any) => {
      let deepMinutes = 0, remMinutes = 0, lightMinutes = 0, coreMinutes = 0, awakeMinutes = 0;
      for (const stage of (r.stages ?? [])) {
        const mins = (new Date(stage.endTime).getTime() - new Date(stage.startTime).getTime()) / 60000;
        // StageType: 1=awake, 2=sleeping, 3=out-of-bed, 4=light/core, 5=deep, 6=rem
        switch (stage.stage) {
          case 5: deepMinutes += mins; break;
          case 6: remMinutes += mins; break;
          case 4: coreMinutes += mins; break;
          case 2: lightMinutes += mins; break;
          case 1: awakeMinutes += mins; break;
        }
      }
      const totalMinutes = deepMinutes + remMinutes + coreMinutes + lightMinutes;
      const efficiency = totalMinutes > 0
        ? Math.round((totalMinutes / (totalMinutes + awakeMinutes)) * 100)
        : 0;
      return {
        id: r.metadata?.id ?? uuid(),
        date: r.startTime.slice(0, 10),
        bedtime: r.startTime,
        wakeTime: r.endTime,
        totalMinutes: Math.round(totalMinutes),
        deepMinutes: Math.round(deepMinutes),
        remMinutes: Math.round(remMinutes),
        lightMinutes: Math.round(lightMinutes),
        coreMinutes: Math.round(coreMinutes),
        awakeMinutes: Math.round(awakeMinutes),
        efficiency,
        source: 'Health Connect',
      } as SleepRecord;
    });
  } catch (e) {
    console.warn('[HealthConnect] fetchSleep failed:', e);
    return [];
  }
}

async function fetchHealthConnectBodyComposition(since: Date): Promise<BodyCompositionRecord[]> {
  try {
    const HC = await import('react-native-health-connect');
    // Sequential fetch — no Promise.all for Health Connect queries (Hermes safety)
    const weightResult = await HC.readRecords('Weight', { timeRangeFilter: hcTimeFilter(since) });
    const fatResult = await HC.readRecords('BodyFat', { timeRangeFilter: hcTimeFilter(since) }).catch(() => ({ records: [] }));
    const heightResult = await HC.readRecords('Height', { timeRangeFilter: hcTimeFilter(since) }).catch(() => ({ records: [] }));

    const latestHeight = (heightResult.records as any[]).length > 0
      ? (heightResult.records as any[]).slice(-1)[0].height?.inMeters
      : undefined;

    return (weightResult.records as any[]).map((r: any) => {
      const weightKg = r.weight?.inKilograms ?? 0;
      const bmi = latestHeight ? Math.round((weightKg / (latestHeight * latestHeight)) * 10) / 10 : undefined;
      const ts = new Date(r.time).getTime();
      let fatPct: number | undefined;
      let minDiff = 24 * 60 * 60 * 1000;
      for (const f of (fatResult.records as any[])) {
        const diff = Math.abs(new Date(f.time).getTime() - ts);
        if (diff < minDiff) { minDiff = diff; fatPct = f.percentage; }
      }
      return {
        id: r.metadata?.id ?? uuid(),
        timestamp: r.time,
        weightKg: Math.round(weightKg * 10) / 10,
        fatMassKg: fatPct !== undefined ? Math.round(weightKg * fatPct / 100 * 10) / 10 : undefined,
        bmi,
        source: 'Health Connect',
      } as BodyCompositionRecord;
    });
  } catch (e) {
    console.warn('[HealthConnect] fetchBodyComposition failed:', e);
    return [];
  }
}

// Health Connect ExerciseSession type → ActivityType
const HC_EXERCISE_MAP: Record<number, ActivityType> = {
  79: 'outdoor-run',   // EXERCISE_TYPE_RUNNING
  56: 'indoor-run',    // EXERCISE_TYPE_RUNNING_TREADMILL
  75: 'walk',          // EXERCISE_TYPE_WALKING
  8:  'cycling',       // EXERCISE_TYPE_BIKING
  7:  'cycling',       // EXERCISE_TYPE_BIKING_STATIONARY
  97: 'workout',       // EXERCISE_TYPE_WEIGHTLIFTING
  64: 'workout',       // EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
  80: 'workout',       // EXERCISE_TYPE_STRENGTH_TRAINING
};

async function fetchHealthConnectWorkouts(since: Date): Promise<ActivityRecord[]> {
  try {
    const HC = await import('react-native-health-connect');
    const { records } = await HC.readRecords('ExerciseSession', { timeRangeFilter: hcTimeFilter(since) });
    return (records as any[]).map((r: any) => {
      const exerciseType: number = r.exerciseType ?? 79;
      const actType: ActivityType = HC_EXERCISE_MAP[exerciseType] ?? 'workout';
      const startMs = new Date(r.startTime).getTime();
      const endMs = new Date(r.endTime).getTime();
      const durationMinutes = Math.round((endMs - startMs) / 60000);
      return {
        id: r.metadata?.id ?? uuid(),
        timestamp: r.startTime,
        type: actType,
        durationMinutes: durationMinutes > 0 ? durationMinutes : 1,
        note: r.title ?? undefined,
        source: 'health-connect',
      } as ActivityRecord;
    }).filter((r: ActivityRecord) => r.durationMinutes > 0);
  } catch (e) {
    console.warn('[HealthConnect] fetchWorkouts failed:', e);
    return [];
  }
}

async function fetchHealthConnectSteps(since: Date): Promise<number> {
  try {
    const HC = await import('react-native-health-connect');
    const { records } = await HC.readRecords('Steps', { timeRangeFilter: hcTimeFilter(since) });
    return (records as any[]).reduce((sum: number, r: any) => sum + (r.count ?? 0), 0);
  } catch (e) {
    console.warn('[HealthConnect] fetchSteps failed:', e);
    return 0;
  }
}

// ─── Unified public API ───────────────────────────────────────────────────────

export interface NativeHealthService {
  isAvailable: boolean;
  platform: 'ios' | 'android' | 'web';
  requestPermissions(): Promise<boolean>;
  /** Fetch heart-rate samples since the given date. Used for post-grant confirmation. */
  fetchHeartRate(since: Date): Promise<PulseRecord[]>;
  /** Fetch blood pressure samples since the given date. */
  fetchBloodPressure(since: Date): Promise<BloodPressureRecord[]>;
  /** Fetch sleep records since the given date. */
  fetchSleep(since: Date): Promise<SleepRecord[]>;
  /** Fetch blood glucose samples since the given date. */
  fetchBloodGlucose(since: Date): Promise<any[]>;
  /** Fetch latest body weight. */
  fetchWeight(since: Date): Promise<any[]>;
  /** Fetch active energy burned since the given date. */
  fetchCalories(since: Date): Promise<any[]>;
  /** Fetch total step count since the given date. */
  fetchStepsDirect(since: Date): Promise<number>;
  syncAll(since?: Date, until?: Date, cancellationToken?: CancellationToken): Promise<NativeHealthSyncResult>;
}

// ─── Singleton ───────────────────────────────────────────────────────────────
let _service: NativeHealthService | null = null;
export function getNativeHealthService(): NativeHealthService {
  if (!_service) _service = new NativeHealthServiceImpl();
  return _service;
}


// ─── HealthKit Background Delivery ──────────────────────────────────────────
//
// Background delivery lets HealthKit wake the app (or trigger a background
// task) when new data arrives for a subscribed type — even when the app is
// not in the foreground.
//
// How it works:
//   1. `enableHealthKitBackgroundDelivery()` calls HK.enableBackgroundDelivery()
//      for each type we care about. This only needs to be called once; the OS
//      remembers the registration across launches.
//   2. `registerHealthKitObservers()` calls HK.subscribeToChanges() for each
//      type. The callback fires when HealthKit has new data. We respond by
//      running a targeted sync (last 24 h) and merging the result into
//      AsyncStorage so the next foreground launch picks it up immediately.
//   3. Both functions are called from `HealthKitBackgroundBridge` (a null-
//      rendering React component mounted in `app/_layout.tsx`) after the
//      HealthProvider is ready and permissions have been granted.
//
// Limitations:
//   - Background delivery is iOS-only. On Android and web these are no-ops.
//   - The OS controls when the background wakeup actually fires; it is not
//      guaranteed to be immediate.
//   - We cannot call React context hooks here (this is a plain module), so
//      we write directly to AsyncStorage using the same key the storage layer
//      uses, then dispatch a custom event that the HealthProvider can listen
//      to if it is already in memory.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotifications } from '@/lib/notifications/safe-notifications';
import { safeSetItem } from '@/lib/safe-async-storage';

/** The AsyncStorage key used by lib/health/storage.ts — MUST match the key in that file */
const HEALTH_DATA_KEY = '@vsht:health_data';
/** AsyncStorage key for the last successful background HealthKit sync timestamp (ISO string) */
export const LAST_BG_SYNC_KEY = '@vsht:last_hk_bg_sync';

/**
 * Data types to observe for background delivery.
 * Grouped by update frequency:
 *   - Immediate (frequency = 1): time-sensitive vitals — wake as soon as new data arrives
 *   - Hourly   (frequency = 2): body composition, nutrition — batch once per hour
 */
const BACKGROUND_DELIVERY_TYPES_IMMEDIATE = [
  // Cardiovascular
  'HKCorrelationTypeIdentifierBloodPressure',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierPeripheralPerfusionIndex',
  // Metabolic
  'HKQuantityTypeIdentifierBloodGlucose',
  'HKQuantityTypeIdentifierInsulinDelivery',
  // Respiratory & vitals
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierBodyTemperature',
  // Sleep (written by Apple Watch at end of session)
  'HKCategoryTypeIdentifierSleepAnalysis',
  // Activity
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKWorkoutTypeIdentifier',
] as const;

const BACKGROUND_DELIVERY_TYPES_HOURLY = [
  // Body composition
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyMassIndex',
  'HKQuantityTypeIdentifierWaistCircumference',
  'HKQuantityTypeIdentifierHeight',
  // Fitness
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierFlightsClimbed',
  // Nutrition
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryFatTotal',
  'HKQuantityTypeIdentifierDietaryFatSaturated',
  'HKQuantityTypeIdentifierDietaryFiber',
  'HKQuantityTypeIdentifierDietarySodium',
  'HKQuantityTypeIdentifierDietaryPotassium',
  'HKQuantityTypeIdentifierDietaryCalcium',
  'HKQuantityTypeIdentifierDietaryMagnesium',
  'HKQuantityTypeIdentifierDietaryOmega3FattyAcids',
  'HKQuantityTypeIdentifierDietaryCaffeine',
  'HKQuantityTypeIdentifierDietaryWater',
] as const;

/** Combined list used by the observer registration loop */
const BACKGROUND_DELIVERY_TYPES = [
  ...BACKGROUND_DELIVERY_TYPES_IMMEDIATE,
  ...BACKGROUND_DELIVERY_TYPES_HOURLY,
] as const;

/** Cleanup functions returned by subscribeToChanges */
type UnsubscribeFn = () => void;
let _bgUnsubscribers: UnsubscribeFn[] = [];
let _bgDeliveryEnabled = false;
let _bgDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedBackgroundSync(syncFn: () => void, delayMs = 2000) {
  if (_bgDebounceTimer) clearTimeout(_bgDebounceTimer);
  _bgDebounceTimer = setTimeout(() => {
    _bgDebounceTimer = null;
    syncFn();
  }, delayMs);
}

/**
 * Enable HealthKit background delivery for all observed types.
 * Call once after permissions are granted (idempotent — safe to call again).
 * iOS only; no-op on Android/web.
 */
export async function enableHealthKitBackgroundDelivery(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (_bgDeliveryEnabled) return;
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.warn(
        '[HealthKit] Native module not available. This is expected in Expo Go and on the simulator — HealthKit requires a physical device with an EAS dev/production build.'
      );
      return;
    }

    // HKUpdateFrequency: immediate = 1, hourly = 2
    // Immediate types: cardiovascular, metabolic, respiratory, sleep, activity
    // Hourly types: body composition, fitness, nutrition (changes slowly)
    // Sequential loop — no Promise.all for HealthKit calls (Hermes BoundFunction safety)
    for (const type of BACKGROUND_DELIVERY_TYPES_IMMEDIATE) {
      await HK.enableBackgroundDelivery(type as any, 1 as any).catch((e: unknown) =>
        console.warn(`[HealthKit BG] enableBackgroundDelivery(${type}) failed:`, e),
      );
    }
    for (const type of BACKGROUND_DELIVERY_TYPES_HOURLY) {
      await HK.enableBackgroundDelivery(type as any, 2 as any).catch((e: unknown) =>
        console.warn(`[HealthKit BG] enableBackgroundDelivery(${type}) failed:`, e),
      );
    }

    _bgDeliveryEnabled = true;
    console.info(
      `[HealthKit BG] Background delivery enabled: ${BACKGROUND_DELIVERY_TYPES_IMMEDIATE.length} immediate + ` +
      `${BACKGROUND_DELIVERY_TYPES_HOURLY.length} hourly types`
    );
  } catch (e) {
    console.warn('[HealthKit BG] enableHealthKitBackgroundDelivery failed:', e);
  }
}

/**
 * Register HealthKit change observers for all background-delivery types.
 * When a change fires, we run a 24-hour sync and merge new records into
 * AsyncStorage so they are available on the next foreground launch.
 *
 * Returns an unsubscribe function that removes all observers.
 * iOS only; no-op on Android/web.
 */
export async function registerHealthKitObservers(): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {};

  // Remove any existing observers first (hot-reload safety)
  _bgUnsubscribers.forEach((fn) => { try { fn(); } catch (_) {} });
  _bgUnsubscribers = [];

  // ─── Weak-ref / cancellation token ──────────────────────────────────────────
  // On iOS 26 Beta (New Architecture), HealthKit observer callbacks fire on a
  // private HealthKit background queue. Calling TurboModule void methods
  // (scheduleNotificationAsync, AsyncStorage.setItem) directly from that queue
  // triggers ObjCTurboModule::performVoidMethodInvocation to throw a C++
  // exception that propagates to abort() → SIGABRT.
  //
  // Fix: use a shared cancellation flag (equivalent to [weak self] in Swift)
  // and defer all bridge calls via setImmediate so they execute on the JS
  // thread's next tick rather than on the HealthKit background queue.
  let _cancelled = false;

  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.warn(
        '[HealthKit] Native module not available. This is expected in Expo Go and on the simulator — HealthKit requires a physical device with an EAS dev/production build.'
      );
      return () => {};
    }
    const service = getNativeHealthService();

    for (const type of BACKGROUND_DELIVERY_TYPES) {
      const unsubscribe = await HK.subscribeToChanges(type as any, () => {
        // Guard: if observers were unregistered before this callback fired, skip.
        if (_cancelled) return;

        // Defer all bridge/TurboModule calls to the JS event loop tick so they
        // run on the correct thread (main JS thread) rather than the HealthKit
        // background queue that delivered this callback.
        setImmediate(async () => {
          if (_cancelled) return;
          try {
            // Fetch last 24 hours of data for the changed type
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const fresh = await service.syncAll(since);
            if (_cancelled) return;

            // Merge into AsyncStorage
            const raw = await AsyncStorage.getItem(HEALTH_DATA_KEY);
            if (!raw || _cancelled) return; // App has never been opened; skip merge

            const stored = JSON.parse(raw);

            // Deduplicate by id — new records win
            function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
              const map = new Map<string, T>(existing.map((r) => [r.id, r]));
              for (const r of incoming) map.set(r.id, r);
              return Array.from(map.values());
            }

            // Combine SpO2 + temperature into vitalSigns (same mapping as fetchHealthData in permissions.ts)
            const freshVitalSigns = [
              ...(fresh.spO2 ?? []),
              ...(fresh.temperature ?? []),
            ];
            const merged = {
              ...stored,
              bloodPressure: mergeById(stored.bloodPressure ?? [], fresh.bloodPressure),
              heartRate: mergeById(stored.heartRate ?? [], fresh.heartRate),
              sleep: mergeById(stored.sleep ?? [], fresh.sleep),
              bodyComposition: mergeById(stored.bodyComposition ?? [], fresh.bodyComposition),
              activity: mergeById(stored.activity ?? [], fresh.activity),
              vitalSigns: mergeById(stored.vitalSigns ?? [], freshVitalSigns),
            };
            // Enforce retention policy to prevent unbounded health_data growth.
            // Uses the same retentionMonths setting as background-sync-service.ts.
            const retentionMonths = await loadRetentionMonths();
            const pruned = pruneHealthData(merged as any, retentionMonths);
            await safeSetItem(HEALTH_DATA_KEY, JSON.stringify(pruned));
            // Persist the last-sync timestamp for the Settings badge
            await safeSetItem(LAST_BG_SYNC_KEY, new Date().toISOString()).catch(() => {});

            if (_cancelled) return;

            // Fire a rich local notification with per-type count breakdown
            const typeCounts: Array<[string, number]> = (
              [
                ['BP', (fresh.bloodPressure ?? []).length],
                ['HR', (fresh.heartRate ?? []).length],
                ['Sleep', (fresh.sleep ?? []).length],
                ['Body', (fresh.bodyComposition ?? []).length],
                ['Activity', (fresh.activity ?? []).length],
                ['SpO\u2082', (fresh.spO2 ?? []).length],
                ['Temp', (fresh.temperature ?? []).length],
              ] as Array<[string, number]>
            ).filter(([, n]) => n > 0);
            const newCount = typeCounts.reduce((s, [, n]) => s + n, 0);
            if (newCount > 0) {
              const breakdown = typeCounts.map(([label, n]) => `${n} ${label}`).join(' \u00b7 ');
              const title =
                newCount === 1
                  ? 'Apple Health \u2014 1 new reading'
                  : `Apple Health \u2014 ${newCount} new readings`;
              // Null-guard: scheduleNotification requires the notifications
              // TurboModule to be available. Wrap in try/catch so a missing
              // module (e.g. first launch before permission grant) does not
              // propagate an uncaught C++ exception through the bridge.
              try {
                await scheduleNotification({
                  content: {
                    title,
                    body: breakdown,
                    sound: false,
                    data: { source: 'healthkit-background', counts: Object.fromEntries(typeCounts) },
                  },
                  trigger: null,
                });
              } catch (_) {
                // Notification scheduling failed (module unavailable or permission denied) — non-fatal.
              }
            }
          } catch (e) {
            console.warn(`[HealthKit BG] observer merge failed for ${type}:`, e);
          }
        });
      });
      _bgUnsubscribers.push(unsubscribe as unknown as UnsubscribeFn);
    }
  } catch (e) {
    console.warn('[HealthKit BG] registerHealthKitObservers failed:', e);
  }

  return () => {
    _cancelled = true;
    _bgUnsubscribers.forEach((fn) => { try { fn(); } catch (_) {} });
    _bgUnsubscribers = [];
  };
}

// ─── New metrics: Walking/Running Distance & Cycling Distance ────────────────
// Reference: QuantityTypeIdentifier.DistanceWalkingRunning / .DistanceCycling
// Both use HKUnit.meter() — values are in metres.

/**
 * Fetch total walking + running distance in metres for the given window.
 * Uses QuantityTypeIdentifier.DistanceWalkingRunning (string:
 * 'HKQuantityTypeIdentifierDistanceWalkingRunning') with unit 'm'.
 */
export async function fetchHealthKitDistanceWalkingRunning(
  since: Date,
  until: Date = new Date(),
): Promise<number> {
  try {
    const HK = await loadHealthKit();
    if (!HK) return 0;
    const samples = await (HK as any).queryQuantitySamples(
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      { limit: 1000, unit: 'm', from: since, to: until },
    );
    return (samples as any[]).reduce((sum: number, s: any) => sum + (s.quantity ?? 0), 0);
  } catch (e) {
    console.warn('[HealthKit] fetchDistanceWalkingRunning failed:', e);
    return 0;
  }
}

/**
 * Fetch total cycling distance in metres for the given window.
 * Uses QuantityTypeIdentifier.DistanceCycling (string:
 * 'HKQuantityTypeIdentifierDistanceCycling') with unit 'm'.
 */
export async function fetchHealthKitDistanceCycling(
  since: Date,
  until: Date = new Date(),
): Promise<number> {
  try {
    const HK = await loadHealthKit();
    if (!HK) return 0;
    const samples = await (HK as any).queryQuantitySamples(
      'HKQuantityTypeIdentifierDistanceCycling',
      { limit: 1000, unit: 'm', from: since, to: until },
    );
    return (samples as any[]).reduce((sum: number, s: any) => sum + (s.quantity ?? 0), 0);
  } catch (e) {
    console.warn('[HealthKit] fetchDistanceCycling failed:', e);
    return 0;
  }
}

/**
 * syncClinicalMetrics — convenience export matching the reference implementation.
 *
 * Fetches Height, LeanBodyMass (most-recent), and 24-hour walking/cycling
 * distances using the exact QuantityTypeIdentifier strings that Apple's
 * HealthKit expects. Wraps all async calls in try/catch — safe to call
 * without prior authorization (returns nulls / zeros on failure).
 *
 * Usage:
 *   const result = await syncClinicalMetrics();
 *   if (result.success) {
 *     console.log(result.data.walkingMeters, result.data.cyclingMeters);
 *   }
 */
export async function syncClinicalMetrics(): Promise<{
  success: boolean;
  data?: {
    height: { value: number; unit: string } | null;
    leanBodyMass: { value: number; unit: string } | null;
    walkingMeters: number;
    cyclingMeters: number;
  };
  error?: unknown;
}> {
  try {
    const HK = await loadHealthKit();
    if (!HK) {
      console.warn('[VitalSync] syncClinicalMetrics: HealthKit unavailable');
      return { success: false, error: 'HealthKit unavailable' };
    }

    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);

    // Sequential fetch — no Promise.all for HealthKit queries (Hermes safety)
    // Static: most-recent height
    const height = await (HK as any).getMostRecentQuantitySample(
      'HKQuantityTypeIdentifierHeight',
      'm',
    ).catch(() => null);
    // Static: most-recent lean body mass
    const leanMass = await (HK as any).getMostRecentQuantitySample(
      'HKQuantityTypeIdentifierLeanBodyMass',
      'kg',
    ).catch(() => null);
    // Cumulative: last 24 h walking/running distance
    const walking = await (HK as any).queryQuantitySamples(
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      { limit: 1000, unit: 'm', from: dayAgo },
    ).catch(() => [] as any[]);
    // Cumulative: last 24 h cycling distance
    const cycling = await (HK as any).queryQuantitySamples(
      'HKQuantityTypeIdentifierDistanceCycling',
      { limit: 1000, unit: 'm', from: dayAgo },
    ).catch(() => [] as any[]);

    const totalWalkingMeters = (walking as any[]).reduce((sum, s) => sum + (s.quantity ?? 0), 0);
    const totalCyclingMeters = (cycling as any[]).reduce((sum, s) => sum + (s.quantity ?? 0), 0);

    return {
      success: true,
      data: {
        height: height ? { value: height.quantity, unit: height.unit ?? 'm' } : null,
        leanBodyMass: leanMass ? { value: leanMass.quantity, unit: leanMass.unit ?? 'kg' } : null,
        walkingMeters: Math.round(totalWalkingMeters),
        cyclingMeters: Math.round(totalCyclingMeters),
      },
    };
  } catch (error) {
    console.error('[VitalSync] syncClinicalMetrics error:', error);
    return { success: false, error };
  }
}
