/**
 * healthkit-helpers.ts
 *
 * Hermes-safe helper wrappers for every HealthKit native call.
 *
 * Design goals:
 *   1. No private health values in production logs.
 *   2. Every native call is wrapped in try/catch/finally.
 *   3. Timeout protection prevents hung HealthKit queries.
 *   4. Cancellation flag prevents setState after unmount.
 *   5. Array/sample validity guards before any map/filter.
 *   6. Weight unit conversion happens exactly once (kg → lb).
 *
 * Usage:
 *   const result = await safeHealthKitCall('fetchHR', () => HK.getHeartRate(...), []);
 *   const data    = await withTimeout(somePromise, 5000, []);
 *   const sample  = normalizeSample(rawSample);
 *   const ok      = isHealthKitAvailable();
 */

import { Platform, NativeModules } from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard limits per the 13-point specification */
export const HK_LIMITS = {
  /** Max samples per data type per sync */
  MAX_SAMPLES_PER_TYPE: 100,
  /** Max activity/workout records per sync (hard cap) */
  MAX_ACTIVITY_RECORDS: 50,
  /** Max blood pressure records per sync */
  MAX_BP_RECORDS: 50,
  /** Max query window for automatic sync (ms) — 14 days */
  AUTO_WINDOW_MS: 14 * 24 * 60 * 60 * 1000,
  /** Max dashboard sync duration (ms) */
  DASHBOARD_TIMEOUT_MS: 5_000,
  /** Max manual sync duration before fallback (ms) */
  MANUAL_TIMEOUT_MS: 15_000,
  /** Historical import chunk size (ms) */
  HISTORICAL_CHUNK_MS: 7 * 24 * 60 * 60 * 1000,
  /** Max historical import total (ms) */
  HISTORICAL_MAX_MS: 90 * 24 * 60 * 60 * 1000,
  /** Delay between historical chunks (ms) — protects Hermes/JS thread */
  HISTORICAL_CHUNK_DELAY_MS: 500,
  /** Adult weight lower bound (lb) */
  WEIGHT_MIN_LB: 50,
  /** Adult weight upper bound (lb) */
  WEIGHT_MAX_LB: 700,
} as const;

/** First-connection small-window limits per the spec */
export const HK_FIRST_CONNECTION = {
  STEPS_WINDOW_MS:       24 * 60 * 60 * 1000,          // 24 hours
  STEPS_LIMIT:           1,                              // daily summary
  HR_WINDOW_MS:          24 * 60 * 60 * 1000,           // 24 hours
  HR_LIMIT:              100,
  RHR_WINDOW_MS:         7  * 24 * 60 * 60 * 1000,      // 7 days
  RHR_LIMIT:             20,
  HRV_WINDOW_MS:         7  * 24 * 60 * 60 * 1000,
  HRV_LIMIT:             20,
  SLEEP_WINDOW_MS:       7  * 24 * 60 * 60 * 1000,
  SLEEP_LIMIT:           14,
  SPO2_WINDOW_MS:        7  * 24 * 60 * 60 * 1000,
  SPO2_LIMIT:            50,
  RESP_WINDOW_MS:        7  * 24 * 60 * 60 * 1000,
  RESP_LIMIT:            50,
  GLUCOSE_WINDOW_MS:     14 * 24 * 60 * 60 * 1000,      // 14 days
  GLUCOSE_LIMIT:         100,
  WEIGHT_LIMIT:          1,                              // most recent only
  BP_WINDOW_MS:          14 * 24 * 60 * 60 * 1000,
  BP_LIMIT:              50,
  WORKOUT_WINDOW_MS:     14 * 24 * 60 * 60 * 1000,
  WORKOUT_LIMIT:         50,
} as const;

// ─── Environment guards ───────────────────────────────────────────────────────

/**
 * Returns true when:
 *   - Running on iOS (not Android, not web)
 *   - NOT in Expo Go (native module must be present)
 *   - The @kingstinct/react-native-healthkit native module is registered
 *
 * This is the single source of truth for "can we call HealthKit?".
 * Re-exported from healthkit-loader.ts for convenience.
 */
export function isHealthKitAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  // Expo Go does not include native pods — module will be absent
  const modulePresent = !!(NativeModules as any).ReactNativeHealthkit;
  return modulePresent;
}

/**
 * Returns true when the RCT bridge (react-native-health / AppleHealthKit) is
 * available. Used as a secondary path when the Nitro bridge is absent.
 */
export function isRCTHealthKitAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  return !!(NativeModules as any).AppleHealthKit &&
    typeof (NativeModules as any).AppleHealthKit.initHealthKit === 'function';
}

// ─── withTimeout ─────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a timeout. If the promise does not resolve within `ms`
 * milliseconds, the fallback value is returned instead of throwing.
 *
 * Hermes-safe: no unhandled rejection, no setState after timeout fires.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        if (__DEV__) {
          console.warn(`[HealthKit] withTimeout: "${label ?? 'call'}" timed out after ${ms}ms — returning fallback`);
        }
        resolve(fallback);
      }
    }, ms);

    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (__DEV__) {
            console.warn(`[HealthKit] withTimeout: "${label ?? 'call'}" rejected:`, err);
          }
          resolve(fallback);
        }
      },
    );
  });
}

// ─── safeHealthKitCall ────────────────────────────────────────────────────────

/**
 * Wraps every native HealthKit call in:
 *   - try/catch/finally
 *   - safe error logging (no private health values)
 *   - fallback return on any error
 *
 * Usage:
 *   const samples = await safeHealthKitCall('fetchHeartRate', () => HK.getHR(...), []);
 */
export async function safeHealthKitCall<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    // Safe log: name + error type only, no health values
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[HealthKit] ${name} failed: ${msg}`);
    return fallback;
  }
}

// ─── normalizeSample ─────────────────────────────────────────────────────────

export interface RawHealthSample {
  value?: number | null;
  quantity?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  uuid?: string | null;
  id?: string | null;
  unit?: string | null;
  [key: string]: unknown;
}

export interface NormalizedSample {
  value: number;
  startDate: string;
  endDate: string;
  id: string;
  unit: string;
  raw: RawHealthSample;
}

/**
 * Validates and normalizes a raw HealthKit sample before use.
 * Returns null if the sample is missing required fields or has invalid data.
 *
 * Guards:
 *   - value/quantity must be a finite number
 *   - startDate must be parseable as a date
 *   - endDate defaults to startDate when absent
 */
export function normalizeSample(sample: unknown): NormalizedSample | null {
  if (sample == null || typeof sample !== 'object') return null;

  const s = sample as RawHealthSample;

  // Value: prefer .quantity (Nitro bridge) then .value (RCT bridge)
  const rawValue = s.quantity ?? s.value;
  if (rawValue == null || !isFinite(Number(rawValue))) return null;
  const value = Number(rawValue);

  // Start date
  const rawStart = s.startDate;
  if (!rawStart) return null;
  const startMs = new Date(rawStart as string).getTime();
  if (!isFinite(startMs)) return null;
  const startDate = new Date(startMs).toISOString();

  // End date — default to startDate
  const rawEnd = s.endDate;
  const endMs = rawEnd ? new Date(rawEnd as string).getTime() : startMs;
  const endDate = isFinite(endMs) ? new Date(endMs).toISOString() : startDate;

  // ID
  const id = (s.uuid ?? s.id ?? `hk-${startMs}-${Math.random().toString(36).slice(2)}`);

  return {
    value,
    startDate,
    endDate,
    id: String(id),
    unit: String(s.unit ?? ''),
    raw: s,
  };
}

// ─── Weight unit safety ───────────────────────────────────────────────────────

/**
 * Convert a HealthKit body mass value to pounds exactly once.
 *
 * HealthKit (via @kingstinct) returns body mass in kg when unit='kg'.
 * The RCT bridge (react-native-health) also returns kg by default.
 *
 * Rules:
 *   - If value is clearly already in lb (> 100 and unit hints 'lb'), return as-is.
 *   - Otherwise treat as kg and convert once.
 *   - If result is outside the adult range (50–700 lb), return null (flag for review).
 *
 * @param valueKg  Raw value from HealthKit (assumed kg unless unitHint says lb)
 * @param unitHint Optional unit string from the sample ('kg', 'lb', 'lbs', 'pound', etc.)
 * @returns Weight in pounds, or null if outside plausible adult range
 */
export function convertWeightToLb(
  valueKg: number,
  unitHint?: string | null,
): number | null {
  if (!isFinite(valueKg) || valueKg <= 0) return null;

  const hint = (unitHint ?? '').toLowerCase();
  const alreadyLb = hint === 'lb' || hint === 'lbs' || hint === 'pound' || hint === 'pounds';

  const lb = alreadyLb ? valueKg : valueKg * 2.20462;
  const rounded = Math.round(lb * 10) / 10;

  if (rounded < HK_LIMITS.WEIGHT_MIN_LB || rounded > HK_LIMITS.WEIGHT_MAX_LB) {
    if (__DEV__) {
      console.warn(
        `[HealthKit] convertWeightToLb: value ${rounded} lb is outside plausible adult range ` +
        `(${HK_LIMITS.WEIGHT_MIN_LB}–${HK_LIMITS.WEIGHT_MAX_LB} lb) — returning null`,
      );
    }
    return null;
  }

  return rounded;
}

// ─── Safe logging ─────────────────────────────────────────────────────────────

/**
 * Log a sync stage/type/count/duration safely.
 * Never logs actual health values in production.
 */
export function logSyncStage(
  stage: string,
  type: string,
  count: number,
  durationMs?: number,
): void {
  if (__DEV__) {
    const dur = durationMs != null ? ` (${durationMs}ms)` : '';
    console.log(`[HealthKit Sync] ${stage} | ${type}: ${count} records${dur}`);
  }
}

// ─── Array guard ──────────────────────────────────────────────────────────────

/**
 * Ensures a value is an array before mapping/filtering.
 * Returns an empty array if the value is null, undefined, or not an array.
 */
export function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

// ─── Cancellation token ───────────────────────────────────────────────────────

/**
 * Simple cancellation token for Hermes-safe async operations.
 *
 * Usage:
 *   const token = createCancellationToken();
 *   // ... later, in cleanup:
 *   token.cancel();
 *   // In async code:
 *   if (token.isCancelled) return fallback;
 */
export interface CancellationToken {
  readonly isCancelled: boolean;
  cancel(): void;
}

export function createCancellationToken(): CancellationToken {
  let cancelled = false;
  return {
    get isCancelled() { return cancelled; },
    cancel() { cancelled = true; },
  };
}

// ─── Historical sync helper ───────────────────────────────────────────────────

/**
 * Generate an array of 7-day chunk windows for historical import.
 *
 * @param totalDays  Total days to import (max 90)
 * @returns Array of { from, to } date pairs, oldest-first
 */
export function buildHistoricalChunks(
  totalDays: number,
): Array<{ from: Date; to: Date }> {
  const clampedDays = Math.min(totalDays, 90);
  const chunkDays = 7;
  const now = Date.now();
  const chunks: Array<{ from: Date; to: Date }> = [];

  for (let offset = clampedDays; offset > 0; offset -= chunkDays) {
    const chunkSize = Math.min(offset, chunkDays);
    const to   = new Date(now - (offset - chunkSize) * 24 * 60 * 60 * 1000);
    const from = new Date(now - offset * 24 * 60 * 60 * 1000);
    chunks.push({ from, to });
  }

  return chunks;
}

// ─── Safe data helpers ────────────────────────────────────────────────────────

/**
 * Returns the input if it is a non-null array, otherwise returns an empty array.
 * Prevents crashes when HealthKit returns undefined/null instead of [].
 */
export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Returns the input if it is a finite number, otherwise returns the fallback.
 * Prevents NaN/Infinity from propagating through averages and reduce calls.
 */
export function safeNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

/**
 * Safe reduce that guards against empty arrays and non-finite intermediate values.
 * Returns the fallback if the array is empty or all values are non-finite.
 */
export function safeReduce<T>(
  arr: T[] | null | undefined,
  fn: (acc: number, item: T) => number,
  fallback: number,
): number {
  const safe = Array.isArray(arr) ? arr : [];
  if (safe.length === 0) return fallback;
  const result = safe.reduce(fn, 0);
  return isFinite(result) ? result : fallback;
}

/**
 * Downsample an array to at most `maxPoints` evenly-spaced items.
 * Prevents chart components from rendering thousands of data points which
 * causes Hermes GC pressure and ShadowView layout crashes.
 *
 * @param data      Source array (any type)
 * @param maxPoints Maximum number of points to return (default 200)
 * @returns         Downsampled array; original array if already within limit
 */
export function downsampleData<T>(data: T[] | null | undefined, maxPoints = 200): T[] {
  const arr = Array.isArray(data) ? data : [];
  if (arr.length <= maxPoints) return arr;
  const step = arr.length / maxPoints;
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}
