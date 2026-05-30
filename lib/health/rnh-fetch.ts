/**
 * rnh-fetch.ts
 *
 * Promise-based wrappers around react-native-health (RCT bridge) callbacks.
 * These are used as a fallback when the Nitro (@kingstinct/react-native-healthkit)
 * bridge is not available — e.g. on some EAS builds where NitroModulesProxy is
 * not yet registered at JS runtime startup.
 *
 * All functions:
 *   • Return [] / 0 immediately if isRNHAvailable() is false (Expo Go, simulator,
 *     missing entitlement, or unlinked native module).
 *   • Call initAppleHealthKit() once before the first real query so the permission
 *     sheet is shown if needed.
 *   • Convert the callback-style RNH API into async/await.
 *
 * FALLBACK STRATEGY (most → least reliable):
 *   1. Named method (e.g. getHeartRateSamples) — typed, unit-aware
 *   2. getSamples({ type: '...' })              — generic but works on all builds
 */

import { isRNHAvailable, initAppleHealthKit } from './rnh-loader';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Promisify a react-native-health callback method. */
function promisify<T>(
  fn: (opts: any, cb: (err: string | object, results: T) => void) => void,
  opts: any,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn(opts, (err, results) => {
      if (err && (typeof err === 'string' ? err.length > 0 : Object.keys(err).length > 0)) {
        reject(new Error(typeof err === 'string' ? err : JSON.stringify(err)));
      } else {
        resolve(results);
      }
    });
  });
}

/** Get the RNH module, ensuring initHealthKit has been called. Returns null if unavailable. */
async function getRNH(): Promise<any | null> {
  if (!isRNHAvailable()) return null;
  const ok = await initAppleHealthKit();
  if (!ok) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-health');
    // react-native-health exports HealthKit as the module root (no .default)
    // but some bundler configs wrap it — handle both shapes.
    const HealthKit = (mod && mod.default && typeof mod.default.getHeartRateSamples === 'function')
      ? mod.default
      : mod;
    if (!HealthKit || typeof HealthKit.getHeartRateSamples !== 'function') {
      console.warn('[RNH] getRNH: module loaded but getHeartRateSamples is not a function — native pod may not be linked');
      return null;
    }
    return HealthKit;
  } catch (e) {
    console.warn('[RNH] getRNH: require(react-native-health) threw:', e);
    return null;
  }
}

/** Format a Date as ISO string for RNH options */
function iso(d: Date): string {
  return d.toISOString();
}

/**
 * Generic getSamples fallback — works on any build where RCTAppleHealthKit is linked.
 * Used when the named method is unavailable or returns empty.
 */
async function getSamplesFallback(
  HK: any,
  type: string,
  since: Date,
  limit = 1000,
  until: Date = new Date(),
): Promise<any[]> {
  if (!HK || typeof HK.getSamples !== 'function') return [];
  try {
    const opts = {
      startDate: iso(since),
      endDate: iso(until),
      type,
      limit,
      ascending: false,
    };
    const results = await promisify<any[]>(HK.getSamples.bind(HK), opts).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as any[][]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn(`[RNH] getSamples(${type}) fallback failed:`, e);
    return [];
  }
}

// ─── Blood Pressure ──────────────────────────────────────────────────────────

export interface RNHBloodPressureSample {
  id?: string;
  startDate: string;
  endDate: string;
  bloodPressureSystolicValue: number;
  bloodPressureDiastolicValue: number;
}

export async function rnhFetchBloodPressure(since: Date, until: Date = new Date()): Promise<RNHBloodPressureSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 50, ascending: false }; // hard cap: 50 BP records per sync
    // .catch() on the promisify call prevents unhandled Promise rejection from propagating
    // to Hermes BoundFunction::_boundCall when the RCT bridge errors (e.g. permission denied).
    const results = await promisify<RNHBloodPressureSample[]>(
      HK.getBloodPressureSamples.bind(HK),
      opts,
    ).catch((e: unknown) => {
      console.warn('[RNH] getBloodPressureSamples promisify rejected:', e);
      return [] as RNHBloodPressureSample[];
    });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getBloodPressureSamples failed:', e);
    return [];
  }
}

// ─── Heart Rate ───────────────────────────────────────────────────────────────

export interface RNHHeartRateSample {
  id?: string;
  startDate: string;
  endDate: string;
  value: number;
}

export async function rnhFetchHeartRate(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 1000, ascending: false, unit: 'bpm' };
    let results = await promisify<RNHHeartRateSample[]>(
      HK.getHeartRateSamples.bind(HK),
      opts,
    ).catch(() => [] as RNHHeartRateSample[]);

    // Fallback: getSamples if named method returned empty
    if (!Array.isArray(results) || results.length === 0) {
      console.info('[RNH] getHeartRateSamples returned empty — trying getSamples(HeartRate) fallback');
      const raw = await getSamplesFallback(HK, 'HeartRate', since, 1000, until);
      results = raw.map((s: any) => ({
        id: s.id,
        startDate: s.startDate,
        endDate: s.endDate ?? s.startDate,
        value: typeof s.value === 'number' ? s.value : (s.quantity ?? 0),
      }));
    }
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] rnhFetchHeartRate failed:', e);
    return [];
  }
}

export async function rnhFetchHRV(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 500, ascending: false, unit: 'ms' };
    let results = await promisify<RNHHeartRateSample[]>(
      HK.getHeartRateVariabilitySamples.bind(HK),
      opts,
    ).catch(() => [] as RNHHeartRateSample[]);

    // Fallback: getSamples
    if (!Array.isArray(results) || results.length === 0) {
      console.info('[RNH] getHeartRateVariabilitySamples returned empty — trying getSamples(HeartRateVariability) fallback');
      const raw = await getSamplesFallback(HK, 'HeartRateVariability', since, 500, until);
      results = raw.map((s: any) => ({
        id: s.id,
        startDate: s.startDate,
        endDate: s.endDate ?? s.startDate,
        value: typeof s.value === 'number' ? s.value : (s.quantity ?? 0),
      }));
    }
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] rnhFetchHRV failed:', e);
    return [];
  }
}

// ─── SpO2 ─────────────────────────────────────────────────────────────────────

export async function rnhFetchSpO2(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 500, ascending: false, unit: 'percent' };
    let results = await promisify<RNHHeartRateSample[]>(
      HK.getOxygenSaturationSamples.bind(HK),
      opts,
    ).catch(() => [] as RNHHeartRateSample[]);

    // Fallback: getSamples
    if (!Array.isArray(results) || results.length === 0) {
      console.info('[RNH] getOxygenSaturationSamples returned empty — trying getSamples(BloodOxygen) fallback');
      const raw = await getSamplesFallback(HK, 'BloodOxygen', since, 500, until);
      results = raw.map((s: any) => ({
        id: s.id,
        startDate: s.startDate,
        endDate: s.endDate ?? s.startDate,
        // SpO2 from getSamples comes as 0.0–1.0 fraction; multiply by 100
        value: typeof s.value === 'number'
          ? (s.value <= 1.5 ? s.value * 100 : s.value)
          : (s.quantity != null ? (s.quantity <= 1.5 ? s.quantity * 100 : s.quantity) : 0),
      }));
    }
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] rnhFetchSpO2 failed:', e);
    return [];
  }
}

// ─── Body Temperature ─────────────────────────────────────────────────────────

export async function rnhFetchBodyTemperature(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 200, ascending: false, unit: 'degC' };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getBodyTemperatureSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getBodyTemperatureSamples failed:', e);
    return [];
  }
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

export interface RNHSleepSample {
  id?: string;
  startDate: string;
  endDate: string;
  value: string; // e.g. "INBED", "ASLEEP", "AWAKE", "CORE", "DEEP", "REM"
}

export async function rnhFetchSleep(since: Date, until: Date = new Date()): Promise<RNHSleepSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 500 };
    let results = await promisify<RNHSleepSample[]>(
      HK.getSleepSamples.bind(HK),
      opts,
    ).catch(() => [] as RNHSleepSample[]);

    // Fallback: getSamples
    if (!Array.isArray(results) || results.length === 0) {
      console.info('[RNH] getSleepSamples returned empty — trying getSamples(SleepAnalysis) fallback');
      const raw = await getSamplesFallback(HK, 'SleepAnalysis', since, 500, until);
      results = raw.map((s: any) => ({
        id: s.id,
        startDate: s.startDate,
        endDate: s.endDate ?? s.startDate,
        value: typeof s.value === 'string' ? s.value.toUpperCase() : 'ASLEEP',
      }));
    }
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] rnhFetchSleep failed:', e);
    return [];
  }
}

// ─── Body Composition (Weight + Body Fat) ────────────────────────────────────

export interface RNHWeightSample {
  id?: string;
  startDate: string;
  endDate: string;
  value: number;
}

export async function rnhFetchWeight(since: Date, until: Date = new Date()): Promise<RNHWeightSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 100, ascending: false, unit: 'kg' };
    const results = await promisify<RNHWeightSample[]>(
      HK.getWeightSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHWeightSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getWeightSamples failed:', e);
    return [];
  }
}

export async function rnhFetchBodyFat(since: Date, until: Date = new Date()): Promise<RNHWeightSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 100, ascending: false, unit: 'percent' };
    const results = await promisify<RNHWeightSample[]>(
      HK.getBodyFatPercentageSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHWeightSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getBodyFatPercentageSamples failed:', e);
    return [];
  }
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export interface RNHWorkoutSample {
  id: string;
  activityId: number;
  activityName: string;
  calories: number;
  distance: number;
  duration: number;
  start: string;
  end: string;
  tracked: boolean;
}

export async function rnjFetchWorkouts(since: Date, until: Date = new Date()): Promise<RNHWorkoutSample[]> {
  const HK = await getRNH();
  if (!HK) return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 50 }; // hard cap: 50 workouts per sync
    const results = await promisify<{ anchor: string; data: RNHWorkoutSample[] }>(
      HK.getAnchoredWorkouts.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as { anchor: string; data: RNHWorkoutSample[] }[]; });
    const r = results as any; return Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r.flatMap((x: any) => x.data ?? []) : []);
  } catch (e) {
    console.warn('[RNH] getAnchoredWorkouts failed:', e);
    return [];
  }
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export async function rnjFetchSteps(since: Date, until: Date = new Date()): Promise<number> {
  const HK = await getRNH();
  if (!HK) return 0;

  // Primary: getStepCount (aggregate)
  try {
    const opts = { startDate: iso(since), endDate: iso(until) };
    const result = await promisify<{ value: number }>(
      HK.getStepCount.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as { value: number }[]; });
    const rv = result as any; if (typeof rv?.value === 'number' && rv.value > 0) {
      return rv.value;
    }
  } catch (e) {
    console.warn('[RNH] getStepCount failed:', e);
  }

  // Fallback: getSamples(StepCount) — sum individual samples
  console.info('[RNH] getStepCount returned 0 — trying getSamples(StepCount) fallback');
  try {
    const raw = await getSamplesFallback(HK, 'StepCount', since, 2000, until);
    const total = raw.reduce((sum: number, s: any) => {
      const v = typeof s.value === 'number' ? s.value : (s.quantity ?? 0);
      return sum + v;
    }, 0);
    return Math.round(total);
  } catch (e) {
    console.warn('[RNH] getSamples(StepCount) fallback failed:', e);
    return 0;
  }
}

// ─── Resting Heart Rate ───────────────────────────────────────────────────────

export async function rnhFetchRestingHeartRate(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getRestingHeartRateSamples !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 200, ascending: false, unit: 'bpm' };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getRestingHeartRateSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getRestingHeartRateSamples failed:', e);
    return [];
  }
}

// ─── Respiratory Rate ─────────────────────────────────────────────────────────

export async function rnhFetchRespiratoryRate(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getRespiratoryRateSamples !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 200, ascending: false };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getRespiratoryRateSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getRespiratoryRateSamples failed:', e);
    return [];
  }
}

// ─── VO2 Max ──────────────────────────────────────────────────────────────────
export async function rnhFetchVO2Max(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getVo2MaxSamples !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 100, ascending: false };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getVo2MaxSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getVo2MaxSamples failed:', e);
    return [];
  }
}

// ─── Blood Glucose ────────────────────────────────────────────────────────────
export async function rnhFetchBloodGlucose(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getBloodGlucoseSamples !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 500, ascending: false, unit: 'mmolPerL' };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getBloodGlucoseSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getBloodGlucoseSamples failed:', e);
    return [];
  }
}

// ─── Insulin Delivery ─────────────────────────────────────────────────────────
export async function rnhFetchInsulinDelivery(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getInsulinDeliverySamples !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 200, ascending: false };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getInsulinDeliverySamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getInsulinDeliverySamples failed:', e);
    return [];
  }
}

// ─── Dietary Fiber ────────────────────────────────────────────────────────────
export async function rnhFetchDietaryFiber(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getFiberSamples !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 200, ascending: false };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getFiberSamples.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getFiberSamples failed:', e);
    return [];
  }
}

// ─── Active Energy Burned ─────────────────────────────────────────────────────
export async function rnhFetchActiveEnergyBurned(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getActiveEnergyBurned !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 500, ascending: false, unit: 'kcal' };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getActiveEnergyBurned.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getActiveEnergyBurned failed:', e);
    return [];
  }
}

// ─── Basal Energy Burned ──────────────────────────────────────────────────────
export async function rnhFetchBasalEnergyBurned(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getBasalEnergyBurned !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 500, ascending: false, unit: 'kcal' };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getBasalEnergyBurned.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getBasalEnergyBurned failed:', e);
    return [];
  }
}

// ─── Apple Stand Time ─────────────────────────────────────────────────────────
export async function rnhFetchStandTime(since: Date, until: Date = new Date()): Promise<RNHHeartRateSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getAppleStandTime !== 'function') return [];
  try {
    const opts = { startDate: iso(since), endDate: iso(until), limit: 200, ascending: false };
    const results = await promisify<RNHHeartRateSample[]>(
      HK.getAppleStandTime.bind(HK),
      opts,
    ).catch((e: unknown) => { console.warn('[RNH] promisify rejected:', e); return [] as RNHHeartRateSample[]; });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] getAppleStandTime failed:', e);
    return [];
  }
}
// ─── EKG / Electrocardiogram ──────────────────────────────────────────────────
export interface RNHEKGSample {
  id?: string;
  uuid?: string;
  startDate: string;
  endDate: string;
  classification?: string;
  averageHeartRate?: number;
  samplingFrequency?: number;
  device?: string;
  algorithmVersion?: number;
}

/**
 * Fetch EKG (electrocardiogram) samples from react-native-health.
 * Returns up to `limit` samples in descending date order.
 * Requires the com.apple.developer.healthkit.electrocardiogram entitlement
 * and the Electrocardiogram read permission.
 */
export async function rnhFetchElectrocardiogram(
  since: Date,
  until: Date = new Date(),
  limit = 10,
): Promise<RNHEKGSample[]> {
  const HK = await getRNH();
  if (!HK || typeof HK.getElectrocardiogramSamples !== 'function') return [];
  try {
    const opts = {
      startDate: since.toISOString(),
      endDate: until.toISOString(),
      limit,
      ascending: false,
    };
    const results = await promisify<RNHEKGSample[]>(
      HK.getElectrocardiogramSamples.bind(HK),
      opts,
    ).catch((e: unknown) => {
      console.warn('[RNH] getElectrocardiogramSamples failed:', e);
      return [] as RNHEKGSample[];
    });
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[RNH] rnhFetchElectrocardiogram failed:', e);
    return [];
  }
}
