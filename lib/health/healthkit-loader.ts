/**
 * healthkit-loader.ts
 *
 * Safe loader for `@kingstinct/react-native-healthkit` (JSI/Turbo bridge).
 *
 * ─── CRITICAL DESIGN RULE ────────────────────────────────────────────────────
 * Authorization and data fetching are STRICTLY SEPARATED:
 *
 *   • loadHealthKit()      — returns the cached module for DATA READS only.
 *                            NEVER calls requestAuthorization().
 *                            Returns null if the module has not been authorized yet.
 *
 *   • authorizeHealthKit() — calls requestAuthorization() via the @kingstinct bridge.
 *                            ONLY called from the explicit user tap in
 *                            Settings → Health → "Request Permissions".
 *                            NEVER called automatically on launch or data sync.
 *
 * This separation prevents the SIGABRT crash on iOS 26 Beta where
 * _throwIfAuthorizationDisallowedForSharing fires when requestAuthorization is
 * called from a background thread (e.g. during syncAll on app launch).
 *
 * KEY DISTINCTION:
 *   • @kingstinct/react-native-healthkit v14.x → uses `requestAuthorization({ toRead, toShare })`
 *                                                and `global.NitroModulesProxy` for availability
 *   • react-native-health (RCT bridge)          → uses `initHealthKit()` callback
 *
 *   This file handles the Kingstinct module ONLY. The RCT bridge is handled
 *   separately in rnh-loader.ts / rnh-fetch.ts.
 */

import { Platform, NativeModules, AppState } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

// undefined = not yet attempted; null = attempted and failed / unavailable
let _cached: HealthKitModule | null | undefined = undefined;
let _isInitialized = false;

// ─── Permission type lists ────────────────────────────────────────────────────
// These are HKQuantityTypeIdentifier / HKCategoryTypeIdentifier strings accepted
// by @kingstinct/react-native-healthkit's requestAuthorization().
// ─── READ permissions ─────────────────────────────────────────────────────────
// All types the app reads from Apple Health.
// NOTE: HKWorkoutTypeIdentifier is READ-ONLY — it cannot appear in the write
// array without the com.apple.developer.healthkit.workout-processing entitlement.
// Passing it in the write array causes _throwIfAuthorizationDisallowedForSharing
// to SIGABRT on iOS 26 Beta. It is safe here (read only).
export const HK_READ_TYPES: string[] = [
  // Cardiovascular
  'HKCorrelationTypeIdentifierBloodPressure',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  // Metabolic
  'HKQuantityTypeIdentifierBloodGlucose',
  // Body composition
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierHeight',
  // Activity
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  // Respiratory
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  // Temperature
  'HKQuantityTypeIdentifierBodyTemperature',
  // Sleep
  'HKCategoryTypeIdentifierSleepAnalysis',
  // Workouts — READ ONLY (no write entitlement)
  'HKWorkoutTypeIdentifier',
  // EKG — HKElectrocardiogramType maps to HKAppleElectrocardiogramType
  // Read via @kingstinct queryElectrocardiogramSamples (no sub-entitlement needed)
  'HKElectrocardiogramType',
];

export const HK_WRITE_TYPES: string[] = [
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKQuantityTypeIdentifierBloodGlucose',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKCategoryTypeIdentifierSleepAnalysis',
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when running on iOS AND the @kingstinct/react-native-healthkit
 * native module is registered.
 *
 * @kingstinct/react-native-healthkit v14.x uses the Nitro bridge and registers
 * its modules via `global.NitroModulesProxy`. Falls back to checking
 * NativeModules.ReactNativeHealthkit for older v8 builds.
 *
 * This module is NOT present in Expo Go — only in EAS/development builds
 * with native pods linked (eas build --platform ios).
 */
export const isHealthKitAvailable = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  // v14: Nitro bridge registers under global.NitroModulesProxy
  const nitroPresent = !!(global as any).NitroModulesProxy;
  // v8 legacy: registered under NativeModules.ReactNativeHealthkit
  const legacyPresent = !!(NativeModules as any).ReactNativeHealthkit;
  if (!nitroPresent && !legacyPresent) {
    // Module not registered: running in Expo Go or native pods not linked.
    // Callers should fall back to the RCT bridge (react-native-health).
    return false;
  }
  return true;
};

/**
 * DATA-READ LOADER — returns the cached @kingstinct module for data queries.
 *
 * ⚠️  NEVER calls requestAuthorization(). If the module has not been
 *     authorized yet (user has not tapped "Request Permissions"), this returns
 *     null and the caller should degrade gracefully (show empty state).
 *
 * Use authorizeHealthKit() from the explicit user-tap handler to request auth.
 *
 * Returns null on Android, web, or when the native bridge is unavailable.
 */
export async function loadHealthKit(): Promise<HealthKitModule | null> {
  if (Platform.OS !== 'ios') return null;
  if (!isHealthKitAvailable()) return null;

  // Return cached result if already loaded (success or failure)
  if (_cached !== undefined) return _cached;

  // Load the module without requesting authorization
  try {
    const hk = await import('@kingstinct/react-native-healthkit');
    if (!hk) {
      console.warn('[VitalSync] HealthKit module loaded but is empty');
      _cached = null;
      return null;
    }
    // Cache the module — it is safe to use for reads even before requestAuthorization
    // (queries will return empty arrays if the user has not granted access yet)
    _cached = hk;
    return hk;
  } catch (err) {
    console.warn('[VitalSync] Failed to load HealthKit module:', err);
    _cached = null;
    return null;
  }
}

/**
 * AUTHORIZATION — requests HealthKit permissions via @kingstinct bridge.
 *
 * ⚠️  MUST only be called from an explicit user interaction (button tap).
 *     NEVER call this automatically on app launch, data sync, or component mount.
 *
 * Uses `requestAuthorization({ toRead, toShare })` — the v14 API.
 * NOTE: Do NOT call `initHealthKit()` here — that is the react-native-health
 * (RCT bridge) API and will throw on the Kingstinct module.
 *
 * iOS 26 Beta strictly enforces that HKHealthStore.requestAuthorization must
 * be called from the MAIN THREAD. This function uses setTimeout(cb, 0) as a
 * trampoline to ensure the call lands on the main thread.
 *
 * Returns true on success, false if unavailable or if the user denies access.
 * Idempotent — subsequent calls return the cached result immediately.
 */
export const authorizeHealthKit = async (): Promise<boolean> => {
  if (!isHealthKitAvailable()) return false;
  if (_isInitialized && _cached !== null && _cached !== undefined) return true;

  try {
    // Dynamic import so Metro never resolves the native module on Android/web
    const hk = await import('@kingstinct/react-native-healthkit');

    if (!hk) {
      console.warn('[VitalSync] HealthKit module loaded but is empty');
      _cached = null;
      return false;
    }

    // ─── v14 API: requestAuthorization({ toRead, toShare }) ──────────────────
    // v8 used: requestAuthorization(readArray, writeArray)  ← old, no longer used
    // v14 uses: requestAuthorization({ toRead: [...], toShare: [...] })
    const authPayload = {
      toRead: HK_READ_TYPES as any,
      toShare: HK_WRITE_TYPES as any,
    };

    // ─── Main-thread dispatch ────────────────────────────────────────────────
    // iOS 26 Beta (New Architecture) strictly enforces that
    // HKHealthStore.requestAuthorization must be called from the MAIN THREAD.
    //
    // setTimeout(cb, 0) schedules the callback on the JS thread's next tick,
    // which is the main thread when called from a user touch handler (button onPress).
    await new Promise<void>((resolve, reject) => {
      const doRequest = () => {
        if (AppState.currentState !== 'active') {
          console.warn('[VitalSync] requestAuthorization deferred: AppState is', AppState.currentState);
          const sub = AppState.addEventListener('change', (nextState: string) => {
            if (nextState === 'active') {
              sub.remove();
              setTimeout(async () => {
                try {
                  // v14: named export requestAuthorization({ toRead, toShare })
                  await (hk as any).requestAuthorization(authPayload);
                  resolve();
                } catch (e) { reject(e); }
              }, 0);
            }
          });
          return;
        }
        setTimeout(async () => {
          try {
            await (hk as any).requestAuthorization(authPayload);
            resolve();
          } catch (e) { reject(e); }
        }, 0);
      };
      doRequest();
    });

    // ─── Post-auth verification ("Success Trap" guard) ────────────────────────
    // requestAuthorization() resolves even when the user denies every permission.
    // Attempt to read the most recent heart-rate sample as a lightweight probe:
    //   • Returns a sample  → at least read access was granted → treat as success.
    //   • Returns null      → user denied or no data yet; still cache the module
    //                         so callers can degrade gracefully rather than retry.
    // Note: absence of a sample does NOT mean auth failed — a new user with no
    // HR data will also return null. This is a best-effort signal, not a gate.
    try {
      const probeFn = (hk as any).getMostRecentQuantitySample;
      if (typeof probeFn === 'function') {
        const probe = await probeFn(
          'HKQuantityTypeIdentifierHeartRate' as any,
          'count/min' as any,
        );
        if (__DEV__) {
          console.log(
            '[VitalSync] HealthKit auth probe:',
            probe ? `✅ sample found (${(probe as any).quantity} bpm)` : '⚠️ no sample (new user or denied)',
          );
        }
      }
    } catch (probeErr) {
      // Non-fatal — probe failure does not block the auth flow.
      if (__DEV__) console.warn('[VitalSync] HealthKit probe error (non-fatal):', probeErr);
    }

    _isInitialized = true;
    _cached = hk;
    return true;
  } catch (err) {
    console.warn('[VitalSync] Failed to authorise HealthKit:', err);
    _cached = null;
    return false;
  }
};

/**
 * @deprecated Use authorizeHealthKit() for explicit auth, loadHealthKit() for data reads.
 * Kept for backward compatibility — delegates to authorizeHealthKit().
 */
export const initializeHealthKit = authorizeHealthKit;

/**
 * Synchronous accessor — returns the cached HealthKit module after
 * `loadHealthKit()` has been called at least once.
 *
 * Returns null when unavailable or not yet loaded.
 */
export const getHealthKit = (): HealthKitModule | null => {
  if (!isHealthKitAvailable()) return null;
  return _cached ?? null;
};

/** Reset the loader cache (for testing). */
export function _resetHealthKitCache(): void {
  _cached = undefined;
  _isInitialized = false;
}

// ─── Resting Heart Rate — single-shot fetch ──────────────────────────────────
/**
 * Fetch the single most-recent Resting Heart Rate sample from Apple Health.
 *
 * Design decisions:
 *  • Uses `getMostRecentQuantitySample` (one network round-trip, no pagination).
 *  • Falls back to `queryQuantitySamples` with limit=1 if the former is absent
 *    (Nitro bridge v14 always has it; kept for forward-compat).
 *  • Returns `null` — never throws — so callers can safely `await` without
 *    try/catch and degrade gracefully when HealthKit is unavailable or the
 *    user has no Apple Watch data.
 *  • Respects the existing auth/load separation: only calls `loadHealthKit()`
 *    (data-read path), never `authorizeHealthKit()`.
 *  • Safe to call from any context (background task, readiness score, BLE
 *    health monitor) — will return null on Android/web/Expo Go without error.
 *
 * @returns Most-recent resting HR in bpm, or null if unavailable.
 */
export async function fetchLatestRestingHeartRate(): Promise<number | null> {
  try {
    const HK = await loadHealthKit();
    if (!HK) return null;

    // ── Primary path: getMostRecentQuantitySample (single round-trip) ────────
    const getMostRecent = (HK as any).getMostRecentQuantitySample;
    if (typeof getMostRecent === 'function') {
      const sample = await getMostRecent(
        'HKQuantityTypeIdentifierRestingHeartRate',
        'count/min',
      ).catch(() => null);
      if (sample != null) {
        const bpm = Math.round(sample.quantity ?? sample.value ?? 0);
        return bpm > 0 ? bpm : null;
      }
    }

    // ── Fallback path: queryQuantitySamples with limit=1 (newest-first) ──────
    const querySamples = (HK as any).queryQuantitySamples;
    if (typeof querySamples === 'function') {
      const samples: any[] = await querySamples(
        'HKQuantityTypeIdentifierRestingHeartRate',
        {
          limit: 1,
          unit: 'count/min',
          ascending: false,
        },
      ).catch(() => []);
      if (Array.isArray(samples) && samples.length > 0) {
        const bpm = Math.round(samples[0].quantity ?? samples[0].value ?? 0);
        return bpm > 0 ? bpm : null;
      }
    }

    return null;
  } catch (err) {
    if (__DEV__) {
      console.warn('[VitalSync] fetchLatestRestingHeartRate failed (non-fatal):', err);
    }
    return null;
  }
}
