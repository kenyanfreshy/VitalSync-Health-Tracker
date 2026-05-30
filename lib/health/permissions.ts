/**
 * VitalSync Health Permissions Bridge
 * Handles HealthKit (iOS) and Health Connect (Android) permission requests.
 * On web, permissions are simulated (always granted).
 *
 * iOS: Uses @kingstinct/react-native-healthkit exclusively.
 *      requestAuthorization(read[], write[]) triggers the iOS system permission sheet.
 * Android: Uses react-native-health-connect.
 */

import { Platform } from 'react-native';
import type { HealthData, WeightRecord } from './types';
import { mergeHealthData, loadHealthData } from './storage';
import { getNativeHealthService } from './native-health-service';
import { enableAllBackgroundDelivery } from './healthkit-background-delivery';
import {
  withTimeout,
  HK_LIMITS,
  createCancellationToken,
  type CancellationToken,
} from './healthkit-helpers';

export type PermissionStatus = 'granted' | 'denied' | 'notDetermined' | 'unavailable';

export interface HealthPermissions {
  bloodPressure: PermissionStatus;
  heartRate: PermissionStatus;
  hrv: PermissionStatus;
  bodyMass: PermissionStatus;
  bodyFatPercentage: PermissionStatus;
  leanBodyMass: PermissionStatus;
  sleep: PermissionStatus;
}

const DEFAULT_PERMISSIONS: HealthPermissions = {
  bloodPressure: 'notDetermined',
  heartRate: 'notDetermined',
  hrv: 'notDetermined',
  bodyMass: 'notDetermined',
  bodyFatPercentage: 'notDetermined',
  leanBodyMass: 'notDetermined',
  sleep: 'notDetermined',
};

/**
 * Request all required health permissions.
 * Returns the resulting permission statuses.
 */
export async function requestHealthPermissions(): Promise<HealthPermissions> {
  if (Platform.OS === 'web') {
    return simulateGranted();
  }
  if (Platform.OS === 'ios') {
    return requestHealthKitPermissions();
  }
  if (Platform.OS === 'android') {
    return requestHealthConnectPermissions();
  }
  return DEFAULT_PERMISSIONS;
}

/**
 * Returns true if HealthKit is available on this device.
 * Returns false if:
 *   - Not running on iOS
 *   - The HealthKit entitlement is missing from the provisioning profile
 *   - Running on an iPad without HealthKit (pre-iPadOS 17)
 */
export async function isHealthKitAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  // HOTFIX (Build 2.7.56 DoA crash):
  // @kingstinct/react-native-healthkit evaluates NativeModules.ReactNativeHealthkit
  // at MODULE LOAD TIME. If the native module is absent (e.g. Expo Go, or an iOS
  // build where the HealthKit pod was not linked), the module's top-level .bind()
  // calls throw: TypeError: undefined is not a function — before React mounts.
  // Guard: check NativeModules BEFORE doing the dynamic import so we never
  // trigger the module evaluation when the native bridge is absent.
  const { NativeModules } = require('react-native');
  if (!(NativeModules as any).ReactNativeHealthkit) return false;
  try {
    // isHealthDataAvailable is a named export from @kingstinct
    const { isHealthDataAvailable } = await import('@kingstinct/react-native-healthkit').catch(() => ({ isHealthDataAvailable: null }));
    if (!isHealthDataAvailable) return false;
    return isHealthDataAvailable();
  } catch (_) {
    return false;
  }
}

async function requestHealthKitPermissions(): Promise<HealthPermissions> {
  try {
    console.log('[VitalSync] requestHealthKitPermissions: checking availability...');

    // ── Auth via RCT bridge ONLY ─────────────────────────────────────────────────
    // @kingstinct/react-native-healthkit (Nitro bridge) crashes on iOS 26 Beta
    // when requestAuthorization is called — the native Swift implementation throws
    // _throwIfAuthorizationDisallowedForSharing:types: regardless of thread.
    //
    // react-native-health (RCT bridge / NativeModules.AppleHealthKit) is confirmed
    // working (green checkmark in diagnostics) and is used exclusively for auth.
    // The Nitro bridge is still used for all data reads after auth is granted.
    const { NativeModules } = await import('react-native');
    const rctAvailable = !!NativeModules.AppleHealthKit &&
      typeof NativeModules.AppleHealthKit.initHealthKit === 'function';

    if (rctAvailable) {
      console.log('[VitalSync] Using RCT bridge (react-native-health) for requestAuthorization...');
      const { initAppleHealthKit } = await import('./rnh-loader');
      const ok = await initAppleHealthKit();
      console.log(`[VitalSync] initAppleHealthKit() result: ${ok}`);
      // Defer background delivery setup by 2 s to avoid racing the iOS
      // permission sheet dismissal animation (Nitro bridge crash).
      setTimeout(() => {
        enableAllBackgroundDelivery().catch((e) =>
          console.warn('[VitalSync] Background delivery setup error:', e)
        );
      }, 2000);
      return ok ? simulateGranted() : simulateDenied();
    }

    // ── Neither bridge available ────────────────────────────────────────────────
    console.warn(
      '[VitalSync] HealthKit not available.\n' +
      '  Possible causes:\n' +
      '  • Running in Expo Go (requires EAS dev/production build)\n' +
      '  • HealthKit capability not enabled in Apple Developer Portal\n' +
      '  • Running on iPad without HealthKit (pre-iPadOS 17)\n' +
      '  • Entitlement missing from provisioning profile'
    );
    return simulateDenied();
  } catch (e) {
    console.warn('[VitalSync] HealthKit requestAuthorization error:', e);
    return simulateDenied();
  }
}

async function requestHealthConnectPermissions(): Promise<HealthPermissions> {
  try {
    const { initialize, requestPermission } = await import('react-native-health-connect').catch(() => ({
      initialize: null,
      requestPermission: null,
    }));

    if (!initialize || !requestPermission) {
      console.warn('[VitalSync] react-native-health-connect not available');
      return simulateGranted();
    }

    const isInitialized = await initialize();
    if (!isInitialized) {
      return simulateDenied();
    }

    const grantedPermissions = await requestPermission([
      // Vitals
      { accessType: 'read', recordType: 'BloodPressure' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
      { accessType: 'read', recordType: 'OxygenSaturation' },
      { accessType: 'read', recordType: 'BloodGlucose' },
      // Body composition
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'LeanBodyMass' },
      { accessType: 'read', recordType: 'BodyFat' },
      { accessType: 'read', recordType: 'Height' },
      // Activity & distance
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      // Sleep
      { accessType: 'read', recordType: 'SleepSession' },
    ]);

    const granted = grantedPermissions.length > 0;
    return granted ? simulateGranted() : simulateDenied();
  } catch (e) {
    console.warn('[VitalSync] Health Connect error:', e);
    return simulateGranted(); // Fallback to mock in emulator
  }
}

function simulateGranted(): HealthPermissions {
  return {
    bloodPressure: 'granted',
    heartRate: 'granted',
    hrv: 'granted',
    bodyMass: 'granted',
    bodyFatPercentage: 'granted',
    leanBodyMass: 'granted',
    sleep: 'granted',
  };
}

function simulateDenied(): HealthPermissions {
  return {
    bloodPressure: 'denied',
    heartRate: 'denied',
    hrv: 'denied',
    bodyMass: 'denied',
    bodyFatPercentage: 'denied',
    leanBodyMass: 'denied',
    sleep: 'denied',
  };
}

/**
 * Fetch fresh health data from the native health API.
 * On web, returns the existing stored data unchanged (no mock data in production).
 */
export async function fetchHealthData(
  onProgress?: (step: string, progress: number) => void,
  cancellationToken?: CancellationToken,
): Promise<HealthData> {
  if (Platform.OS === 'web') {
    // Web: return whatever is already stored — no mock data in production.
    return loadHealthData();
  }

  const svc = getNativeHealthService();
  const token = cancellationToken ?? createCancellationToken();

  // Load existing cached data first so the UI can render immediately
  // even if HealthKit is slow or unavailable.
  const cachedData = await loadHealthData().catch(() => null);

  // Per-type steps with incremental progress (0.10 → 1.00)
  const STEPS: Array<[string, number]> = [
    ['Blood Pressure', 0.10],
    ['Heart Rate & HRV', 0.25],
    ['Body Composition', 0.40],
    ['Sleep Data', 0.55],
    ['SpO₂ & Temperature', 0.68],
    ['Activity & Workouts', 0.90],
    ['Finalising…', 1.00],
  ];

  // Emit the first step immediately so the banner appears before the network call
  onProgress?.(STEPS[0][0], STEPS[0][1]);

  // ── Auto sync window: 7 days (spec §6) ────────────────────────────────────
  // The dashboard auto-sync uses a 5s timeout (spec §5).
  // If the sync times out, the cached data is returned unchanged —
  // old valid data is NEVER cleared on a sync failure.
  const syncFrom = new Date(Date.now() - HK_LIMITS.AUTO_WINDOW_MS);
  const syncUntil = new Date();

  let result: Awaited<ReturnType<typeof svc.syncAll>> | null = null;
  try {
    result = await withTimeout(
      svc.syncAll(syncFrom, syncUntil, token),
      HK_LIMITS.DASHBOARD_TIMEOUT_MS,
      null,
      'fetchHealthData-syncAll',
    );
  } catch (_) {
    result = null;
  }

  // If sync failed or timed out, return cached data unchanged
  if (!result || token.isCancelled) {
    if (cachedData) return cachedData;
    return loadHealthData();
  }

  // Walk through remaining steps to give the banner meaningful progress ticks
  for (let i = 1; i < STEPS.length; i++) {
    if (token.isCancelled) break;
    onProgress?.(STEPS[i][0], STEPS[i][1]);
    // Small yield so React can re-render between steps
    await new Promise<void>((r) => setTimeout(r, 60));
  }

  // Bridge HealthKit bodyComposition records into the weight array so the
  // NeoVital graph (which reads state.data.weight) reflects real HealthKit data.
  // Each BodyCompositionRecord with a weightKg value becomes a WeightRecord.
  const weightFromHealthKit: WeightRecord[] = (result.bodyComposition ?? [])
    .filter((r) => r.weightKg != null && r.weightKg > 0)
    .map((r) => ({
      id: `hk-wt-${r.id}`,
      timestamp: r.timestamp,
      weightKg: r.weightKg,
      weightLbs: parseFloat((r.weightKg * 2.20462).toFixed(1)),
      source: 'healthkit' as const,
      deviceName: r.source ?? 'Apple Health',
    }));

  // Bridge HealthKit cumulative distance (DistanceWalkingRunning + DistanceCycling) into
  // a synthetic ActivityRecord dated today so todayDistanceKm on the dashboard reflects
  // real HealthKit data. The id is deterministic (date-based) so mergeById deduplicates
  // correctly on repeated syncs within the same day.
  const todayIso = new Date().toISOString();
  const todayDateStr = todayIso.slice(0, 10); // YYYY-MM-DD
  const walkingM = result.distanceWalkingRunningM ?? 0;
  const cyclingM = result.distanceCyclingM ?? 0;
  const totalDistanceKm = Math.round((walkingM + cyclingM) / 10) / 100; // metres → km, 2dp
  const distanceActivityRecords = totalDistanceKm > 0
    ? [{
        id: `hk-dist-${todayDateStr}`,
        timestamp: todayIso,
        type: 'walking' as const,
        durationMinutes: 0,
        distanceKm: totalDistanceKm,
        distanceMiles: Math.round(totalDistanceKm * 0.621371 * 100) / 100,
        distanceWalkingRunningM: walkingM,
        distanceCyclingM: cyclingM,
        source: 'healthkit' as const,
      }]
    : [];

  // Merge native results into stored data (deduplicates by id)
  return mergeHealthData({
    bloodPressure: result.bloodPressure,
    pulse: result.heartRate,
    sleep: result.sleep,
    bodyComposition: result.bodyComposition,
    // Merge workout-based activity records with the cumulative distance record
    activity: [...(result.activity ?? []), ...(distanceActivityRecords as any[])],
    vitalSigns: [
      ...(result.spO2 ?? []),
      ...(result.temperature ?? []),
      ...(result.respiratoryRate ?? []),
    ],
    // bloodGlucose from HealthKit is stored under the bloodSugar key in HealthData
    bloodSugar: result.bloodGlucose ?? [],
    // Bridge HealthKit body mass data into the weight array for NeoVital graph
    weight: weightFromHealthKit,
    // Cumulative step count from HealthKit StepCount (scalar, not an array)
    steps: typeof result.steps === 'number' && result.steps > 0 ? result.steps : undefined,
    // Active calories burned from HealthKit (fetched via fetchCalories in syncAll)
    activeCaloriesBurned: undefined, // populated by background sync when available
    // Resting Heart Rate: pass the freshest window from Apple Watch
    // (one sample per day written by watchOS). The scalar `restingHR` is derived
    // from the most-recent sample so the dashboard tile and readiness score stay
    // current without a separate fetch.
    restingHRSamples: result.restingHRSamples ?? [],
    restingHR: (() => {
      const samples = result.restingHRSamples;
      if (!Array.isArray(samples) || samples.length === 0) return undefined;
      // Sort newest-first and pick the most-recent valid bpm
      const sorted = [...samples].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      const bpm = sorted[0]?.bpm;
      return typeof bpm === 'number' && bpm > 0 ? bpm : undefined;
    })(),
  });
}
