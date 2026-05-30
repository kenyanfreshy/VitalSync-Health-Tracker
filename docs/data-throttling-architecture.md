# VitalSync — Data Throttling & Storage Segregation Architecture

**Version:** 2.11.0  
**Author:** Manus AI  
**Date:** 2026-05-28  
**Status:** Implemented

---

## 1. Executive Summary

This document describes the architectural design and implementation of four tightly integrated subsystems introduced in VitalSync v2.11.0:

1. **Vitals Throttle** — a weekly quota engine that limits ingestion of Sleep, Blood Pressure, Heart Rate, and Resting HR records to a maximum of 100 total records per ISO week, with per-family sub-quotas.
2. **EKG_Vault** — a dedicated, segregated storage partition for EKG waveform data with strict weekly per-classification caps (7 Sinus Rhythm / 7 AFib / 7 Inconclusive).
3. **Storage Circular Buffer** — an automated pruning engine that enforces a 50 MB total device-storage ceiling and evicts the oldest records when the limit is approached.
4. **Wiring Layer** — integration points in `mergeHealthData()` and `appendToCache()` that make all three subsystems transparent to the rest of the codebase.

---

## 2. Design Principles

The following principles guided every decision in this design.

**Fail-open, warn loudly.** No throttle or vault rejection must crash the app or silently corrupt existing data. Every rejection is logged to the console and, where applicable, surfaced to the UI.

**Atomic counter commits.** Quota counters are written to AsyncStorage only *after* a successful `saveHealthData()` call. A failed write therefore never increments the quota, preventing phantom quota consumption.

**Segregation by payload size.** EKG records contain up to 15,000 voltage data points per recording. Mixing them with the standard vitals blob would cause the `@vitalsync:health_data` key to grow unboundedly. The EKG_Vault uses its own isolated AsyncStorage key (`@vitalsync:ekg_vault_v1`) and its own weekly-counter key.

**Circular buffer as last resort.** The circular buffer prune runs asynchronously after every `mergeHealthData()` call. It is a safety net, not the primary size-control mechanism. The primary controls are the retention-window prune (already in `saveHealthData`) and the weekly quotas.

---

## 3. Module Map

```
lib/
├── health/
│   ├── storage.ts              ← Wiring: throttle + circular buffer called here
│   ├── vitals-throttle.ts      ← NEW: weekly quota engine (Sleep/BP/HR/RestingHR)
│   ├── ekg-store.ts            ← Wiring: vault ingestion called in appendToCache()
│   └── ekg-vault.ts            ← NEW: EKG_Vault store + weekly classification caps
└── storage/
    └── storage-circular-buffer.ts  ← NEW: 50 MB guard + circular buffer pruning
```

---

## 4. Vitals Throttle (`lib/health/vitals-throttle.ts`)

### 4.1 Data Model

The throttle persists a single JSON object under the key `@vitalsync:vitals_throttle_v1`:

```ts
interface VitalsThrottleState {
  weekKey: string;          // ISO week identifier: "2026-W22"
  totalCount: number;       // Records accepted this week across all families
  familyCounts: {
    sleep:         number;
    bloodPressure: number;
    heartRate:     number;
    restingHR:     number;
  };
}
```

The `weekKey` is derived from the ISO 8601 week number. When `weekKey` differs from the current week, the entire state is reset to zero before any check proceeds.

### 4.2 Quota Constants

| Metric Family | Weekly Cap | Shared Weekly Total Cap |
|---|---|---|
| Sleep | 25 records | 100 (all families combined) |
| Blood Pressure | 25 records | 100 |
| Heart Rate (pulse) | 25 records | 100 |
| Resting HR | 25 records | 100 |

The total cap of 100 is enforced across all four families combined. A single family can consume at most 25 of those 100 slots, preventing any one source from monopolising the budget.

### 4.3 Check / Record Pattern

The API follows a two-phase pattern to ensure atomicity:

```ts
// Phase 1: check (read-only, does NOT mutate state)
const result = await checkVitalsThrottle('heartRate', incomingBatch.length);
if (!result.allowed) {
  // result.remainingTotal and result.remainingFamily indicate partial budget
}

// Phase 2: record (write-only, called after a successful save)
await recordVitalsIngestion('heartRate', acceptedCount);
```

This pattern guarantees that a storage failure between check and record never double-counts records.

### 4.4 Integration Point

`mergeHealthData()` in `lib/health/storage.ts` calls `throttleArray()` for each of the four metric families before constructing the merged object. The throttled arrays replace the raw `incoming.*` arrays in the merge. Counter commits run via `Promise.allSettled()` after `saveHealthData()` succeeds.

---

## 5. EKG_Vault (`lib/health/ekg-vault.ts`)

### 5.1 Storage Segregation

EKG data is stored in a completely separate AsyncStorage key from the standard vitals blob:

| Store | AsyncStorage Key | Contents |
|---|---|---|
| Vitals Store | `@vitalsync:health_data` | BP, HR, Sleep, Weight, etc. |
| **EKG_Vault** | `@vitalsync:ekg_vault_v1` | EKG records (metadata + waveform refs) |
| EKG Weekly Counter | `@vitalsync:ekg_vault_weekly_v1` | Per-classification weekly counts |

This segregation means the vitals blob never grows due to EKG activity, and EKG data can be pruned, exported, or cleared independently.

### 5.2 Weekly Classification Caps

```ts
const EKG_VAULT_WEEKLY_CAPS = {
  SinusRhythm:       7,
  AtrialFibrillation: 7,
  Inconclusive:      7,
  Unclassified:      0,   // Unclassified records are never stored
} as const;
```

The `Unclassified` cap of 0 ensures that noise records from a poor sensor contact are never persisted, protecting storage from low-quality data.

### 5.3 Ingestion Result

Every call to `vaultIngestEKG(record)` returns a `VaultIngestResult`:

```ts
type VaultIngestStatus =
  | 'Accepted'           // Record written to vault
  | 'Duplicate'          // Record already in vault (idempotent)
  | 'WeeklyLimitReached' // Classification cap exhausted for this week
  | 'Rejected';          // Unclassified or other hard rejection

interface VaultIngestResult {
  status: VaultIngestStatus;
  classification: EKGClassification;
  weekKey: string;
  remainingThisWeek: number;  // How many more of this classification are allowed
}
```

The `WeeklyLimitReached` status is what the EKG screen should surface as "Weekly Limit Reached" in the UI when a user attempts a new EKG recording.

### 5.4 Integration Point

`appendToCache()` in `lib/health/ekg-store.ts` now iterates over every incoming record and calls `vaultIngestEKG()`. Only records with `Accepted` or `Duplicate` status proceed to the existing tier-retention and date-retention pipeline. Records with `WeeklyLimitReached` are dropped and logged.

---

## 6. Storage Circular Buffer (`lib/storage/storage-circular-buffer.ts`)

### 6.1 Architecture

The circular buffer is not a true ring buffer in memory. It is a **storage-size-aware eviction policy** that operates on AsyncStorage keys. The term "circular buffer" refers to the behaviour: when total storage exceeds the ceiling, the oldest records are evicted until storage falls below the target, creating a sliding window of the most recent data.

### 6.2 Size Estimation

AsyncStorage does not expose a native `getSize()` API. Size is estimated by summing the byte length of all key-value pairs retrieved via `AsyncStorage.getAllKeys()` and `AsyncStorage.multiGet()`. This is an approximation (UTF-16 encoding overhead is not accounted for) but is accurate to within ±5% for typical JSON payloads.

### 6.3 Eviction Strategy

The eviction strategy is applied per-key, targeting the keys most likely to contain large time-series arrays:

| Priority | Key Pattern | Eviction Method |
|---|---|---|
| 1 (highest) | `@vitalsync:health_data` | Trim oldest 20% of each time-series array |
| 2 | `@vitalsync:ekg_vault_v1` | Trim oldest 20% of EKG records |
| 3 | `@vitalsync:ekg_cache_v2` | Trim oldest 20% of EKG cache |
| 4 (lowest) | Other large keys | Remove entire key |

The 20% trim factor is chosen to avoid thrashing (repeatedly hitting the ceiling on every sync) while minimising data loss.

### 6.4 Thresholds

```ts
const STORAGE_CEILING_BYTES  = 50 * 1024 * 1024;  // 50 MB hard ceiling
const STORAGE_TARGET_BYTES   = 40 * 1024 * 1024;  // 40 MB target after prune
const STORAGE_WARNING_BYTES  = 45 * 1024 * 1024;  // 45 MB warning threshold
```

The 10 MB gap between ceiling and target prevents the prune from running on every subsequent sync after the first eviction.

### 6.5 Execution Model

`runCircularBufferPrune()` is called asynchronously at the end of `mergeHealthData()`:

```ts
runCircularBufferPrune().catch(() => { /* non-fatal */ });
```

It is fire-and-forget. A failure in the prune engine never blocks a health data write. The function is also idempotent: if storage is below `STORAGE_WARNING_BYTES`, it returns immediately without reading any data.

---

## 7. Data Flow Diagram

```
Bluetooth / HealthKit / Manual Entry
            │
            ▼
    mergeHealthData(incoming)
            │
            ├─► throttleArray('bloodPressure', incoming.bloodPressure)
            │         │
            │         └─► checkVitalsThrottle()  ──► [quota full] ──► drop / truncate
            │
            ├─► throttleArray('heartRate', incoming.pulse)
            ├─► throttleArray('sleep', incoming.sleep)
            ├─► throttleArray('restingHR', incoming.restingHRSamples)
            │
            ▼
    Build merged HealthData object
            │
            ▼
    saveHealthData(merged)
      └─► pruneHealthData() (retention window)
      └─► secureMultiSet() → AsyncStorage
            │
            ▼
    recordVitalsIngestion() × 4   ← commit counters after successful write
            │
            ▼
    runCircularBufferPrune()       ← async, fire-and-forget
      └─► estimateStorageSize()
      └─► [> 45 MB] evictOldestRecords()


EKG Fetch (fetchEKGPage)
            │
            ▼
    appendToCache(newRecords)
            │
            ├─► vaultIngestEKG(record) for each record
            │         │
            │         ├─► [Accepted]          → proceed to cache pipeline
            │         ├─► [Duplicate]         → proceed (idempotent)
            │         └─► [WeeklyLimitReached] → drop, log warning
            │
            ▼
    dedupeRecords → applyDateRetention → applyTierRetention
            │
            ▼
    safeSetItem('@vitalsync:ekg_cache_v2', ...)
```

---

## 8. Public API Reference

### 8.1 Vitals Throttle

```ts
// Check whether `count` new records of `metric` are within quota
checkVitalsThrottle(
  metric: 'sleep' | 'bloodPressure' | 'heartRate' | 'restingHR',
  count: number
): Promise<VitalsThrottleCheckResult>

// Commit `count` accepted records to the quota counter
recordVitalsIngestion(
  metric: 'sleep' | 'bloodPressure' | 'heartRate' | 'restingHR',
  count: number
): Promise<void>

// Read current quota state (for Settings / Debug screens)
getVitalsThrottleState(): Promise<VitalsThrottleState>

// Reset all counters (used in clearVitalSignsData)
resetVitalsThrottle(): Promise<void>
```

### 8.2 EKG_Vault

```ts
// Attempt to ingest one EKG record into the vault
vaultIngestEKG(record: EKGRecord): Promise<VaultIngestResult>

// Read all records from the vault
readEKGVault(): Promise<EKGRecord[]>

// Get weekly counts per classification
getEKGVaultWeeklyCounts(): Promise<EKGVaultWeeklyState>

// Clear the entire vault (used in clearVitalSignsData)
clearEKGVault(): Promise<void>
```

### 8.3 Storage Circular Buffer

```ts
// Estimate total AsyncStorage usage in bytes
estimateStorageSize(): Promise<number>

// Run the prune cycle (no-op if below warning threshold)
runCircularBufferPrune(): Promise<CircularBufferPruneResult>

interface CircularBufferPruneResult {
  triggered: boolean;       // Whether eviction actually ran
  beforeBytes: number;
  afterBytes: number;
  evictedKeys: string[];
}
```

---

## 9. Settings & Observability

The following AsyncStorage keys are used by the new subsystems and should be included in any diagnostic export:

| Key | Purpose |
|---|---|
| `@vitalsync:vitals_throttle_v1` | Weekly vitals quota state |
| `@vitalsync:ekg_vault_v1` | EKG_Vault records |
| `@vitalsync:ekg_vault_weekly_v1` | EKG weekly classification counts |

All three keys are included in `VITAL_SIGNS_KEYS` in `storage.ts` so they are cleared by `clearVitalSignsData()`.

---

## 10. Testing Checklist

Before shipping v2.11.0 to TestFlight, the following scenarios should be validated manually or via unit tests:

| Scenario | Expected Behaviour |
|---|---|
| Ingest 100 HR records in one week | Records 1–100 accepted; record 101 dropped with console warning |
| Ingest 26 BP records (25 family cap) | Records 1–25 accepted; record 26 dropped even if total < 100 |
| New ISO week starts | All counters reset; fresh 100-record budget available |
| Ingest 8th SinusRhythm EKG in one week | 8th record returns `WeeklyLimitReached`; cache unchanged |
| Ingest duplicate EKG record | Returns `Duplicate`; no double-count in vault or cache |
| Storage exceeds 45 MB | `runCircularBufferPrune()` evicts oldest 20% of health_data arrays |
| Storage below 45 MB | `runCircularBufferPrune()` returns `{ triggered: false }` immediately |
| `clearVitalSignsData()` called | Throttle counters, vault, and weekly EKG counts all cleared |
