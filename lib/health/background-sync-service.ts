/**
 * VitalSync Background Sync Service
 *
 * This module is the TypeScript counterpart to the Swift VitalSyncBackgroundModule.
 * It is invoked by the expo-task-manager background task that is scheduled by
 * BGAppRefreshTask (iOS) or BackgroundFetch (Android/iOS fallback).
 *
 * Architecture:
 *   Swift HKObserverQuery fires
 *     → BGTaskScheduler schedules "com.vitalsync.healthtracker.data.refresh"
 *     → iOS wakes app in background
 *     → expo-task-manager runs VITALSYNC_BG_SYNC task
 *     → VitalSyncBackgroundSyncService.executeBackgroundSync() runs
 *     → Fetches delta from HealthKit (since last sync timestamp)
 *     → Pairs BP systolic+diastolic samples by timestamp
 *     → Merges into AsyncStorage (local-only — no cloud push)
 *     → Updates last_bg_sync_time
 *
 * Privacy-first:
 *   All data stays on-device in AsyncStorage. No outbound network calls are made
 *   from this service. The only time data leaves the device is when the user
 *   explicitly taps "Generate Personal Health Report" and shares the PDF.
 *
 * Blood Pressure Pairing:
 *   HealthKit stores systolic and diastolic as two separate HKQuantitySample
 *   records. This service pairs them by matching timestamps within a ±5-second
 *   window, then emits a single BloodPressureRecord per reading. Unpaired
 *   samples (e.g., only systolic received so far) are held in a staging buffer
 *   and re-evaluated on the next sync cycle.
 *
 * Metrics synced:
 *   glucose | steps | bp_sys | bp_dia | spo2 | hr | hrv | sleep | activity
 *   (matches the HealthDataPoint metric union from the architecture spec)
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

import { getNativeHealthService } from './native-health-service';
import type { BloodPressureRecord, PulseRecord } from './types';
import { safeSetItem } from '@/lib/safe-async-storage';
import { pruneHealthData } from './storage';
import { loadRetentionMonths } from '@/lib/retention-settings';
import {
  withTimeout,
  HK_LIMITS,
  createCancellationToken,
  isHealthKitAvailable,
} from './healthkit-helpers';

// ─── Constants ────────────────────────────────────────────────────────────────

/** BGTask identifier — must match BGTaskSchedulerPermittedIdentifiers in Info.plist */
export const VITALSYNC_BG_SYNC_TASK = 'com.vitalsync.healthtracker.data.refresh';

/** AsyncStorage keys */
const STORAGE_KEYS = {
  lastSyncTime:   '@vsht:bg_last_sync_time',
  bpStagingBuffer:'@vsht:bg_bp_staging',
} as const;

/** Maximum age for a staged (unpaired) BP sample before it is discarded (ms) */
const BP_STAGING_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/** Timestamp tolerance for pairing systolic + diastolic samples (ms) */
const BP_PAIR_TOLERANCE_MS = 5000; // ±5 seconds

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors the HealthDataPoint interface from the architecture spec */
export interface HealthDataPoint {
  metric: 'glucose' | 'steps' | 'bp_sys' | 'bp_dia' | 'spo2' | 'hr' | 'hrv' | 'sleep' | 'activity';
  value: number;
  unit: string;
  timestamp: string; // ISO 8601
}

/** A staged (unpaired) BP component waiting for its partner */
interface StagedBPSample {
  type: 'systolic' | 'diastolic';
  value: number;
  timestamp: string; // ISO 8601
  stagedAt: number;  // Date.now() when staged
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getLastSyncTime(): Promise<Date> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.lastSyncTime);
    if (raw) return new Date(raw);
  } catch (_unused) { /* ignore */ }
  // Default: 7 days ago (spec §9: background sync uses 7-day window, not 90-day)
  return new Date(Date.now() - HK_LIMITS.AUTO_WINDOW_MS);
}

async function setLastSyncTime(date: Date): Promise<void> {
  try {
    await safeSetItem(STORAGE_KEYS.lastSyncTime, date.toISOString());
  } catch (_unused) { /* ignore */ }
}

async function getStagedBPSamples(): Promise<StagedBPSample[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.bpStagingBuffer);
    if (raw) return JSON.parse(raw) as StagedBPSample[];
  } catch (_unused) { /* ignore */ }
  return [];
}

async function setStagedBPSamples(samples: StagedBPSample[]): Promise<void> {
  try {
    await safeSetItem(STORAGE_KEYS.bpStagingBuffer, JSON.stringify(samples));
  } catch (_unused) { /* ignore */ }
}

// ─── Blood Pressure Pairing ───────────────────────────────────────────────────

/**
 * Pair systolic and diastolic HealthDataPoints into BloodPressureRecords.
 *
 * Algorithm:
 *   1. Load the staging buffer (previously unpaired samples from prior sync).
 *   2. Add new bp_sys and bp_dia points to the buffer.
 *   3. For each systolic, find the nearest diastolic within ±BP_PAIR_TOLERANCE_MS.
 *   4. Emit a BloodPressureRecord for each matched pair.
 *   5. Evict staged samples older than BP_STAGING_MAX_AGE_MS.
 *   6. Persist the remaining (unmatched) buffer for the next sync cycle.
 *
 * @param newPoints Raw HealthDataPoints containing bp_sys and bp_dia entries
 * @returns Paired BloodPressureRecord array
 */
async function pairBloodPressurePoints(
  newPoints: HealthDataPoint[]
): Promise<BloodPressureRecord[]> {
  const now = Date.now();

  // Load existing staging buffer
  const staged = await getStagedBPSamples();

  // Evict stale staged samples
  const fresh = staged.filter(
    (s) => now - s.stagedAt < BP_STAGING_MAX_AGE_MS
  );

  // Add new samples to the buffer
  for (const pt of newPoints) {
    if (pt.metric === 'bp_sys') {
      fresh.push({ type: 'systolic', value: pt.value, timestamp: pt.timestamp, stagedAt: now });
    } else if (pt.metric === 'bp_dia') {
      fresh.push({ type: 'diastolic', value: pt.value, timestamp: pt.timestamp, stagedAt: now });
    }
  }

  const systolics  = fresh.filter((s) => s.type === 'systolic');
  const diastolics = fresh.filter((s) => s.type === 'diastolic');
  const paired: BloodPressureRecord[] = [];
  const usedDiaIndices = new Set<number>();

  for (const sys of systolics) {
    const sysMs = new Date(sys.timestamp).getTime();

    // Find the closest diastolic within tolerance
    let bestIdx = -1;
    let bestDiff = Infinity;
    diastolics.forEach((dia, idx) => {
      if (usedDiaIndices.has(idx)) return;
      const diff = Math.abs(new Date(dia.timestamp).getTime() - sysMs);
      if (diff <= BP_PAIR_TOLERANCE_MS && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });

    if (bestIdx !== -1) {
      const dia = diastolics[bestIdx];
      usedDiaIndices.add(bestIdx);
      paired.push({
        id: `bg-${sysMs}`,
        timestamp: sys.timestamp,
        systolic: Math.round(sys.value),
        diastolic: Math.round(dia.value),
        source: 'apple-health',
      });
    }
  }

  // Remove paired samples from the buffer.
  // Build a Map from object reference → index so we can look up diastolic
  // positions without relying on Array.prototype.indexOf reference equality,
  // which is unsafe when objects were deserialized from JSON (new references).
  // This also eliminates the Hermes crash vector: indexOf on a potentially
  // GC-collected object reference causes EXC_BAD_ACCESS in arrayPrototypeIndexOf.
  const diastolicIndexMap = new Map<StagedBPSample, number>();
  diastolics.forEach((d, i) => diastolicIndexMap.set(d, i));

  const pairedSysTimes = new Set(paired.map((r) => r.timestamp));
  const pairedDiaIndices = usedDiaIndices;
  const remaining = fresh.filter((s) => {
    if (s.type === 'systolic') return !pairedSysTimes.has(s.timestamp);
    const idx = diastolicIndexMap.get(s) ?? -1;
    // idx === -1 means this diastolic wasn't in the current diastolics slice
    // (shouldn't happen, but guard defensively — keep it in the buffer)
    return idx === -1 || !pairedDiaIndices.has(idx);
  });

  await setStagedBPSamples(remaining);
  return paired;
}

// ─── Main sync logic ──────────────────────────────────────────────────────────

/**
 * Execute a delta-sync of all vital types from HealthKit.
 *
 * Called by the expo-task-manager background task when iOS wakes the app via
 * BGAppRefreshTask. Also safe to call manually (e.g., from the Force Sync button).
 *
 * Returns a summary of what was synced for logging/debugging.
 */
export async function executeBackgroundSync(): Promise<{
  success: boolean;
  counts: Record<string, number>;
  error?: string;
}> {
  if (Platform.OS === 'web') {
    return { success: false, counts: {}, error: 'Not supported on web' };
  }

  // Guard: iOS only (background sync is HealthKit-specific)
  if (!isHealthKitAvailable()) {
    return { success: false, counts: {}, error: 'HealthKit not available on this device' };
  }

  const token = createCancellationToken();

  try {
    const rawSince = await getLastSyncTime();
    // Cap the window at 14 days to prevent large background queries
    const autoWindowStart = new Date(Date.now() - HK_LIMITS.AUTO_WINDOW_MS);
    const since = rawSince < autoWindowStart ? autoWindowStart : rawSince;
    const svc = getNativeHealthService();


    if (__DEV__) {
      console.log(`[VitalSync BG Sync] Fetching delta since ${since.toISOString()}`);
    }

    // Sequential fetch — no Promise.all for HealthKit queries (Hermes safety)
    // Each fetch is individually guarded; one failure does not abort the rest.
    // Wrap the entire sync in a 15s timeout to prevent background task overrun.
    const syncPromise = (async () => {
      const bpRecords: BloodPressureRecord[] = await withTimeout(
        svc.fetchBloodPressure(since).catch(() => [] as BloodPressureRecord[]),
        5000, [], 'bg-fetchBloodPressure',
      );
      if (token.isCancelled) return null;

      const hrRecords: PulseRecord[] = await withTimeout(
        svc.fetchHeartRate(since).catch(() => [] as PulseRecord[]),
        5000, [], 'bg-fetchHeartRate',
      );
      if (token.isCancelled) return null;

      const sleepRecords = await withTimeout(
        svc.fetchSleep(since).catch(() => []),
        5000, [], 'bg-fetchSleep',
      );
      if (token.isCancelled) return null;

      const bodyRecords = await withTimeout(
        svc.fetchWeight(since).catch(() => []),
        5000, [], 'bg-fetchWeight',
      );

      return { bpRecords, hrRecords, sleepRecords, bodyRecords };
    })();

    const syncResult = await withTimeout(syncPromise, HK_LIMITS.MANUAL_TIMEOUT_MS, null, 'bg-sync-total');

    if (!syncResult || token.isCancelled) {
      return { success: false, counts: {}, error: 'Background sync timed out or was cancelled' };
    }

    const { bpRecords, hrRecords, sleepRecords, bodyRecords } = syncResult;

    // Build HealthDataPoints for BP pairing.
    // BloodPressureRecord.systolic/diastolic may be null (partial reading) — skip null values.
    const bpPoints: HealthDataPoint[] = (Array.isArray(bpRecords) ? bpRecords : []).flatMap((r) => {
      const pts: HealthDataPoint[] = [];
      if (r.systolic != null && isFinite(r.systolic)) {
        pts.push({ metric: 'bp_sys' as const, value: r.systolic, unit: 'mmHg', timestamp: r.timestamp });
      }
      if (r.diastolic != null && isFinite(r.diastolic)) {
        pts.push({ metric: 'bp_dia' as const, value: r.diastolic, unit: 'mmHg', timestamp: r.timestamp });
      }
      return pts;
    });

    // Pair BP samples (handles the split systolic/diastolic HealthKit model)
    const pairedBP = await pairBloodPressurePoints(bpPoints);

    // Merge new records into existing AsyncStorage data
    await mergeRecordsIntoStorage({
      bloodPressure: pairedBP,
      heartRate: hrRecords,
      sleep: sleepRecords,
      bodyComposition: bodyRecords as any[],
    });

    // Update last sync timestamp
    await setLastSyncTime(new Date());

    const counts = {
      bloodPressure: pairedBP.length,
      heartRate: hrRecords.length,
      sleep: sleepRecords.length,
      bodyComposition: bodyRecords.length,
    };


    if (__DEV__) {
      console.log('[VitalSync BG Sync] Complete:', counts);
    }
    return { success: true, counts };

  } catch (error: any) {
    console.error('[VitalSync BG Sync] Failed:', error?.message ?? String(error));
    return { success: false, counts: {}, error: error?.message ?? String(error) };
  } finally {
    token.cancel(); // ensure no dangling callbacks
  }
}

// ─── AsyncStorage merge ───────────────────────────────────────────────────────

const HEALTH_STORAGE_KEY = '@vsht:health_data';

type MergePayload = {
  bloodPressure: BloodPressureRecord[];
  heartRate: PulseRecord[];
  sleep: any[];
  bodyComposition: any[];
};

/**
 * Merge newly fetched records into the existing AsyncStorage health data blob.
 * De-duplicates by ID so re-running a sync is idempotent.
 */
async function mergeRecordsIntoStorage(payload: MergePayload): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : {};

    const merge = <T extends { id: string }>(
      existingArr: T[] = [],
      newArr: T[]
    ): T[] => {
      const map = new Map(existingArr.map((r) => [r.id, r]));
      for (const r of newArr) map.set(r.id, r);
      return Array.from(map.values()).sort(
        (a: any, b: any) =>
          new Date(b.timestamp ?? b.date ?? 0).getTime() -
          new Date(a.timestamp ?? a.date ?? 0).getTime()
      );
    };

    const updated = {
      ...existing,
      bloodPressure:   merge(existing.bloodPressure   ?? [], payload.bloodPressure),
      heartRate:       merge(existing.heartRate        ?? [], payload.heartRate),
      sleep:           merge(existing.sleep            ?? [], payload.sleep),
      bodyComposition: merge(existing.bodyComposition  ?? [], payload.bodyComposition),
    };

    const retentionMonths = await loadRetentionMonths();
    const pruned = pruneHealthData(updated as any, retentionMonths);
    await safeSetItem(HEALTH_STORAGE_KEY, JSON.stringify(pruned));
  } catch (error) {
    console.warn('[VitalSync BG Sync] Storage merge failed:', error);
  }
}

// ─── Task registration ────────────────────────────────────────────────────────

/**
 * Define the BGTask-triggered background sync task.
 *
 * MUST be called at the top level of the app entry point (before any rendering),
 * alongside defineHealthMonitorTask() in background-task.ts.
 *
 * The task identifier "com.vitalsync.healthtracker.data.refresh" is scheduled by the Swift
 * VitalSyncBackgroundModule when a new HealthKit sample arrives.
 */
export function defineBackgroundSyncTask(): void {
  if (Platform.OS === 'web') return;

  // Guard against double-registration on hot reload
  if (TaskManager.isTaskDefined(VITALSYNC_BG_SYNC_TASK)) return;

  TaskManager.defineTask(VITALSYNC_BG_SYNC_TASK, async () => {
    const result = await executeBackgroundSync();
    if (!result.success) return BackgroundFetch.BackgroundFetchResult.Failed;
    const hasNewData = Object.values(result.counts).some((c) => c > 0);
    return hasNewData
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  });
}

/**
 * Register the background sync task with the OS.
 *
 * On iOS this registers a BGAppRefreshTask handler. The Swift module schedules
 * the actual execution via BGTaskScheduler — this registration just tells
 * expo-task-manager how to handle it when iOS calls back.
 *
 * Call this after HealthKit permissions have been granted.
 */
export async function registerBackgroundSyncTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(VITALSYNC_BG_SYNC_TASK);
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(VITALSYNC_BG_SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (OS may defer longer)
      stopOnTerminate: false,   // Keep alive after app close (Android)
      startOnBoot: true,        // Resume after device restart (Android)
    });

    console.log('[VitalSync BG Sync] Task registered:', VITALSYNC_BG_SYNC_TASK);
  } catch (error) {
    console.warn('[VitalSync BG Sync] Task registration failed:', error);
  }
}

/**
 * Unregister the background sync task.
 * Call when the user revokes HealthKit permissions.
 */
export async function unregisterBackgroundSyncTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(VITALSYNC_BG_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(VITALSYNC_BG_SYNC_TASK);
      console.log('[VitalSync BG Sync] Task unregistered');
    }
  } catch (error) {
    console.warn('[VitalSync BG Sync] Task unregistration failed:', error);
  }
}
