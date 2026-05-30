# VitalSync HealthKit Synchronization Audit
**Date:** March 12, 2026 | **Scope:** iOS HealthKit pipeline (permissions → fetch → type mapping → merge → persistence)

---

## Executive Summary

The HealthKit synchronization pipeline is **structurally sound** — the architecture (permissions → `syncAll` → `mergeHealthData` → `SYNC_COMPLETE`) is correct and the SDK is used appropriately for most data types. However, the audit identified **5 bugs** (2 data-corrupting, 3 silent data loss), **1 architectural gap** in the background delivery merge, and several minor issues. The most critical bug is a **SpO2 value inflation** that would produce readings like 9,800% instead of 98%.

---

## Bug Inventory

### Bug 1 — CRITICAL: SpO2 value inflated by 100×
**File:** `lib/health/native-health-service.ts`, lines 348–350  
**Severity:** Data-corrupting

The `fetchHealthKitSpO2` function queries HealthKit with `unit: '%'`. When the SDK converts a raw HealthKit fraction (e.g., `0.98`) to the requested `'%'` unit, it returns `98.0` — a value already in percentage form. The code then applies `Math.round(s.quantity * 100) / 100`, multiplying again by 100, producing `9800` instead of `98`.

```ts
// WRONG — quantity is already in % when unit: '%' is specified
oxygenSaturation: Math.round(s.quantity * 100) / 100,

// CORRECT — just round to 2 decimal places
oxygenSaturation: Math.round(s.quantity * 10) / 10,
```

The same bug applies to the `spo2` alias field on the same lines.

---

### Bug 2 — CRITICAL: ECG classification mapping uses numeric keys against string values
**File:** `lib/health/native-health-service.ts`, lines 396–403  
**Severity:** Data-corrupting (all ECG records classified as `'unclassified'`)

The `@kingstinct/react-native-healthkit` SDK v13 returns `classification` as a **string literal** (`'sinusRhythm'`, `'atrialFibrillation'`, `'inconclusiveLowHeartRate'`, `'inconclusiveHighHeartRate'`, `'inconclusivePoorReading'`, `'inconclusiveOther'`), not a number. The current code maps numeric keys, so `classMap[ecg.classification]` always evaluates to `undefined`, and every ECG record is stored as `'unclassified'`.

Additionally, the SDK field names differ from what the code accesses:

| Code accesses | SDK actual field | Fix |
|---|---|---|
| `ecg.voltageMeasurements` | `ecg.voltages` | Rename |
| `v.quantity` | `v.voltage` (in volts) | Rename + convert V→mV |
| `v.timestamp` (ms offset) | `v.timeSinceSampleStart` (seconds) | Rename + convert s→ms |
| `ecg.samplingFrequency` | `ecg.samplingFrequencyHz` | Rename |
| `ecg.averageHeartRate` | `ecg.averageHeartRateBpm` | Rename |

```ts
// WRONG
const classMap: Record<number, EcgRecord['classification']> = {
  1: 'sinusRhythm', 2: 'atrialFibrillation', ...
};
const classification = classMap[ecg.classification] ?? 'unclassified';

// CORRECT — SDK returns string literals directly
const classMap: Record<string, EcgRecord['classification']> = {
  sinusRhythm: 'sinusRhythm',
  atrialFibrillation: 'atrialFibrillation',
  inconclusiveLowHeartRate: 'inconclusiveLowHR',
  inconclusiveHighHeartRate: 'inconclusiveHighHR',
  inconclusivePoorReading: 'unclassified',
  inconclusiveOther: 'unclassified',
  notSet: 'unclassified',
};
const classification = classMap[ecg.classification] ?? 'unclassified';
const samplingHz = ecg.samplingFrequencyHz ?? 512;
const voltageData = (ecg.voltages ?? []).map((v: any, _i: number) => ({
  timestamp: Math.round(v.timeSinceSampleStart * 1000), // seconds → ms
  voltage: v.voltage * 1000, // volts → mV
}));
const averageBpm = ecg.averageHeartRateBpm ?? undefined;
```

Note: `includeVoltages: true` must be passed in the query options for `ecg.voltages` to be populated at all.

---

### Bug 3 — HIGH: Workout distance and energy fields use wrong accessor pattern
**File:** `lib/health/native-health-service.ts`, lines 456–463  
**Severity:** Silent data loss (distance and calories always `undefined`)

The SDK's `WorkoutSample` type defines `totalDistance` and `totalEnergyBurned` as `Quantity | undefined` (with fields `quantity` and `unit`). The code accesses them via `.sumQuantity.quantity` — a pattern from an older version of the library — which always returns `undefined`.

```ts
// WRONG — .sumQuantity does not exist in SDK v13
const distanceKm = w.totalDistance?.sumQuantity?.quantity
  ? Math.round(w.totalDistance.sumQuantity.quantity / 10) / 100
  : undefined;

// CORRECT — totalDistance is a Quantity with .quantity (in metres by default)
const distanceKm = w.totalDistance?.quantity != null
  ? Math.round(w.totalDistance.quantity / 10) / 100  // metres → km
  : undefined;
const caloriesBurned = w.totalEnergyBurned?.quantity != null
  ? Math.round(w.totalEnergyBurned.quantity)
  : undefined;
```

---

### Bug 4 — MEDIUM: Background delivery merge omits SpO2, temperature, and ECG
**File:** `lib/health/native-health-service.ts`, lines 891–896  
**Severity:** Silent data loss during background sync

The `registerHealthKitObservers` background merge writes only 5 fields (`bloodPressure`, `heartRate`, `sleep`, `bodyComposition`, `activity`) to AsyncStorage. The `vitalSigns` array (which holds SpO2 and temperature records) and `ecg` are omitted, so any overnight SpO2, body temperature, or ECG data captured via background delivery is silently discarded.

```ts
// WRONG — vitalSigns and ecg are missing
const merged = {
  ...stored,
  bloodPressure: mergeById(stored.bloodPressure ?? [], fresh.bloodPressure),
  heartRate: mergeById(stored.heartRate ?? [], fresh.heartRate),
  sleep: mergeById(stored.sleep ?? [], fresh.sleep),
  bodyComposition: mergeById(stored.bodyComposition ?? [], fresh.bodyComposition),
  activity: mergeById(stored.activity ?? [], fresh.activity),
};

// CORRECT — include vitalSigns and ecg
const vitalSigns = [
  ...(fresh.spO2 ?? []),
  ...(fresh.temperature ?? []),
] as VitalSignsRecord[];
const merged = {
  ...stored,
  bloodPressure: mergeById(stored.bloodPressure ?? [], fresh.bloodPressure),
  heartRate: mergeById(stored.heartRate ?? [], fresh.heartRate),
  sleep: mergeById(stored.sleep ?? [], fresh.sleep),
  bodyComposition: mergeById(stored.bodyComposition ?? [], fresh.bodyComposition),
  activity: mergeById(stored.activity ?? [], fresh.activity),
  vitalSigns: mergeById(stored.vitalSigns ?? [], vitalSigns),
  ecg: mergeById(stored.ecg ?? [], fresh.ecg ?? []),
};
```

---

### Bug 5 — MEDIUM: ECG query does not request voltage data
**File:** `lib/health/native-health-service.ts`, line 387–390  
**Severity:** Silent data loss (ECG waveform always empty)

The `queryElectrocardiogramSamples` call does not pass `includeVoltages: true`. The SDK defaults to `false`, so `ecg.voltages` is always `undefined` and every ECG record is stored with an empty `samples: []` array.

```ts
// WRONG — voltages not requested
const ecgSamples = await (HK as any).queryElectrocardiogramSamples({
  limit: 20,
  filter: { date: { startDate: since, endDate: new Date() } },
}).catch(() => []);

// CORRECT
const ecgSamples = await HK.queryElectrocardiogramSamples({
  limit: 20,
  includeVoltages: true,
  filter: { date: { startDate: since, endDate: new Date() } },
}).catch(() => []);
```

---

## What Is Working Correctly

The following parts of the pipeline are correctly implemented and require no changes:

| Component | Status |
|---|---|
| `HKElectrocardiogramType` identifier in permissions | Fixed (previous session) |
| `requestAuthorization({ toRead, toShare })` parameter names | Correct |
| Blood pressure correlation query (`queryCorrelationSamples`) | Correct — `r.objects.find(o => o.quantityType === ...)` matches SDK type |
| Heart rate + HRV query and nearest-match join | Correct |
| Sleep stage mapping (HKCategoryValueSleepAnalysis values 0–5) | Correct |
| Body composition (weight, fat %, height, BMI) | Correct |
| Step count aggregation | Correct |
| Body temperature unit (`degC`) and °C→°F conversion | Correct |
| `mergeHealthData` deduplication by `id` | Correct |
| Schema migration runner | Correct |
| `SYNC_COMPLETE` reducer replaces state with merged data | Correct |
| `requestPermissions()` returns `Promise<boolean>` | Fixed (previous session) |
| `handleConnectHealth` uses returned boolean | Fixed (previous session) |
| Android Health Connect blood pressure, heart rate, sleep, body composition | Correct |

---

## Summary Table

| # | Severity | File | Lines | Impact |
|---|---|---|---|---|
| 1 | **Critical** | `native-health-service.ts` | 348–350 | SpO2 reads as 9800% instead of 98% |
| 2 | **Critical** | `native-health-service.ts` | 396–418 | All ECG records: wrong classification, no waveform data, wrong field names |
| 3 | **High** | `native-health-service.ts` | 456–463 | Workout distance and calories always missing |
| 4 | **Medium** | `native-health-service.ts` | 891–896 | Background sync discards SpO2, temperature, ECG |
| 5 | **Medium** | `native-health-service.ts` | 387–390 | ECG voltage waveform never fetched |

All 5 bugs are in a single file (`native-health-service.ts`) and are ready to fix.
