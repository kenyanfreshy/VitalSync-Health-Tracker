/**
 * storage-circular-buffer.ts — Circular-buffer pruning engine for VitalSync.
 *
 * Architecture
 * ────────────
 * AsyncStorage on iOS is backed by a flat file per key.  There is no built-in
 * storage quota enforcement — the app will happily write until the device runs
 * out of space.  This module adds three layers of protection:
 *
 *   1. Total storage guard (50 MB)
 *      Scans all @vsht:* keys, sums their serialised byte sizes, and
 *      triggers a pruning pass when the total exceeds STORAGE_SOFT_LIMIT_BYTES.
 *      A hard eviction fires at STORAGE_HARD_LIMIT_BYTES.
 *
 *   2. Per-key circular buffer
 *      For every time-series array key (vitals, EKG meta, food log, etc.) the
 *      buffer keeps at most MAX_RECORDS_PER_KEY entries, dropping the oldest
 *      when the limit is exceeded.  Records are assumed to have a `timestamp`,
 *      `startDate`, or `date` field for ordering.
 *
 *   3. Waveform blob eviction
 *      EKG waveform blobs (@vsht:ekg_vault_wave_*) are the largest objects
 *      in storage.  When the total budget is under pressure, waveform blobs are
 *      evicted oldest-first before any metadata is touched.
 *
 * Usage
 * ─────
 *   import { runCircularBufferPrune } from '@/lib/storage/storage-circular-buffer';
 *
 *   // Call after every batch write (or on app foreground):
 *   await runCircularBufferPrune();
 *
 *   // Check current storage usage without pruning:
 *   const usage = await measureTotalStorageBytes();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Soft limit: trigger a prune pass when total storage exceeds this. */
export const STORAGE_SOFT_LIMIT_BYTES = 40 * 1024 * 1024; // 40 MB

/** Hard limit: aggressive eviction when total storage exceeds this. */
export const STORAGE_HARD_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

/** Maximum records kept per time-series key in the circular buffer. */
export const MAX_RECORDS_PER_KEY: Record<string, number> = {
  '@vsht:health_data':           2000, // combined vitals blob (trimmed internally)
  '@vsht:ekg_cache_v2':           300, // EKG metadata cache
  '@vsht:ekg_vault_meta_v1':      500, // EKG vault index
  '@vsht:food_log':               500,
  '@vsht:water_log':             1000,
  '@vsht:sleep_log':              365,
  '@vsht:mood_log':               365,
  '@vsht:activity_log_v1':        500,
  '@vsht:readiness_history_v1':   365,
  '@vsht:alertHistory':           200,
  '@vsht:reminder_history':       200,
  '@vsht:crash_logs':             100,
};

/** Keys that are never pruned (configuration, credentials, schema). */
const EXEMPT_KEYS = new Set<string>([
  '@vsht:enc_key_v1',
  '@vsht:schema_version',
  '@vsht:data_retention_months',
  '@vsht:hasOnboarded',
  '@vsht:consent_accepted',
  '@vsht:gdprConsentAccepted',
  '@vsht:userProfile',
  '@vsht:thresholds',
  '@vsht:glucose_thresholds',
  '@vsht:pairedBleDevices',
  '@vsht:bleDeviceLabels',
  '@vsht:medications',
  '@vsht:vitals_throttle_v1',
  '@vsht:ekg_vault_quota_v1',
  '@vsht:ekg_daily_count_v1',
]);

const EKG_WAVE_PREFIX = '@vsht:ekg_vault_wave_';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StorageSnapshot {
  totalBytes: number;
  totalMB: number;
  keyCount: number;
  topKeys: { key: string; bytes: number; mb: number }[];
  waveformBytes: number;
  waveformCount: number;
  exceedsSoftLimit: boolean;
  exceedsHardLimit: boolean;
}

export interface PruneResult {
  bytesFreed: number;
  keysModified: string[];
  waveformsEvicted: number;
  snapshotBefore: StorageSnapshot;
  snapshotAfter: StorageSnapshot;
}

// ─── Measurement ──────────────────────────────────────────────────────────────

/**
 * Measure the total serialised size of all @vsht:* keys.
 * Returns a StorageSnapshot with per-key breakdown.
 */
export async function measureTotalStorageBytes(): Promise<StorageSnapshot> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const vsKeys = allKeys.filter((k) => k.startsWith('@vitalsync'));

    if (vsKeys.length === 0) {
      return {
        totalBytes: 0, totalMB: 0, keyCount: 0, topKeys: [],
        waveformBytes: 0, waveformCount: 0,
        exceedsSoftLimit: false, exceedsHardLimit: false,
      };
    }

    const pairs = await AsyncStorage.multiGet(vsKeys);
    const keySizes: { key: string; bytes: number }[] = [];
    let totalBytes = 0;
    let waveformBytes = 0;
    let waveformCount = 0;

    for (const [key, value] of pairs) {
      const bytes = value ? new TextEncoder().encode(value).length : 0;
      totalBytes += bytes;
      keySizes.push({ key, bytes });
      if (key.startsWith(EKG_WAVE_PREFIX)) {
        waveformBytes += bytes;
        waveformCount++;
      }
    }

    keySizes.sort((a, b) => b.bytes - a.bytes);
    const topKeys = keySizes.slice(0, 10).map((k) => ({
      key: k.key,
      bytes: k.bytes,
      mb: parseFloat((k.bytes / (1024 * 1024)).toFixed(2)),
    }));

    return {
      totalBytes,
      totalMB: parseFloat((totalBytes / (1024 * 1024)).toFixed(2)),
      keyCount: vsKeys.length,
      topKeys,
      waveformBytes,
      waveformCount,
      exceedsSoftLimit: totalBytes > STORAGE_SOFT_LIMIT_BYTES,
      exceedsHardLimit: totalBytes > STORAGE_HARD_LIMIT_BYTES,
    };
  } catch {
    return {
      totalBytes: 0, totalMB: 0, keyCount: 0, topKeys: [],
      waveformBytes: 0, waveformCount: 0,
      exceedsSoftLimit: false, exceedsHardLimit: false,
    };
  }
}

// ─── Timestamp extractor ──────────────────────────────────────────────────────

/**
 * Extract a sortable timestamp (ms) from a record object.
 * Checks common field names used across VitalSync data models.
 */
function extractTimestampMs(record: unknown): number {
  if (!record || typeof record !== 'object') return 0;
  const r = record as Record<string, unknown>;
  const raw =
    r['timestamp'] ??
    r['startDate'] ??
    r['date'] ??
    r['createdAt'] ??
    r['ingestedAt'] ??
    r['recordedAt'];
  if (typeof raw === 'string') return new Date(raw).getTime() || 0;
  if (typeof raw === 'number') return raw;
  return 0;
}

// ─── Per-key circular buffer ──────────────────────────────────────────────────

/**
 * Apply the circular buffer to a single JSON array key.
 * Keeps the most recent `maxRecords` entries (sorted by timestamp).
 * Returns the number of bytes freed, or 0 if no pruning was needed.
 */
async function pruneArrayKey(key: string, maxRecords: number): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return 0;

    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return 0; }

    // Handle top-level objects that wrap an array (e.g. health_data)
    let arr: unknown[];
    let wrapper: Record<string, unknown> | null = null;
    let wrapperKey: string | null = null;

    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // Find the largest array field in the object
      const obj = parsed as Record<string, unknown>;
      let maxLen = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v) && v.length > maxLen) {
          maxLen = v.length;
          wrapperKey = k;
        }
      }
      if (!wrapperKey) return 0;
      arr = obj[wrapperKey] as unknown[];
      wrapper = obj;
    } else {
      return 0;
    }

    if (arr.length <= maxRecords) return 0;

    // Sort newest-first, keep top `maxRecords`
    const sorted = [...arr].sort((a, b) => extractTimestampMs(b) - extractTimestampMs(a));
    const trimmed = sorted.slice(0, maxRecords);

    let newValue: string;
    if (wrapper && wrapperKey) {
      newValue = JSON.stringify({ ...wrapper, [wrapperKey]: trimmed });
    } else {
      newValue = JSON.stringify(trimmed);
    }

    const bytesBefore = new TextEncoder().encode(raw).length;
    const bytesAfter  = new TextEncoder().encode(newValue).length;

    await safeSetItem(key, newValue);
    return Math.max(0, bytesBefore - bytesAfter);
  } catch {
    return 0;
  }
}

// ─── Waveform eviction ────────────────────────────────────────────────────────

/**
 * Evict the oldest `count` EKG waveform blobs.
 * Updates the EKG vault meta index to mark evicted records as hasWaveform=false.
 * Returns total bytes freed.
 */
async function evictOldestWaveforms(count: number): Promise<number> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const waveKeys = allKeys.filter((k) => k.startsWith(EKG_WAVE_PREFIX));
    if (waveKeys.length === 0) return 0;

    // Load meta to sort by startDate
    const metaRaw = await AsyncStorage.getItem('@vsht:ekg_vault_meta_v1');
    const meta: { id: string; startDate: string; hasWaveform: boolean }[] =
      metaRaw ? JSON.parse(metaRaw) : [];
    const metaById = new Map(meta.map((m) => [m.id, m]));

    const sorted = waveKeys.sort((a, b) => {
      const idA = a.replace(EKG_WAVE_PREFIX, '');
      const idB = b.replace(EKG_WAVE_PREFIX, '');
      const dateA = metaById.get(idA)?.startDate ?? '';
      const dateB = metaById.get(idB)?.startDate ?? '';
      return dateA.localeCompare(dateB); // oldest first
    });

    const toEvict = sorted.slice(0, count);
    let bytesFreed = 0;

    for (const key of toEvict) {
      const raw = await AsyncStorage.getItem(key);
      if (raw) bytesFreed += new TextEncoder().encode(raw).length;
      await AsyncStorage.removeItem(key);
      // Mark as no waveform in meta
      const id = key.replace(EKG_WAVE_PREFIX, '');
      const entry = metaById.get(id);
      if (entry) entry.hasWaveform = false;
    }

    // Persist updated meta
    if (meta.length > 0) {
      await safeSetItem('@vsht:ekg_vault_meta_v1', JSON.stringify(meta));
    }

    return bytesFreed;
  } catch {
    return 0;
  }
}

// ─── Main pruning pass ────────────────────────────────────────────────────────

/**
 * Run a full circular-buffer pruning pass.
 *
 * Strategy:
 *   1. Measure current storage usage.
 *   2. If below soft limit → apply per-key circular buffer caps only.
 *   3. If above soft limit → also evict oldest waveform blobs (up to 10 at a time).
 *   4. If still above hard limit → evict all waveform blobs, then apply aggressive
 *      per-key caps (50% of normal limits).
 *
 * @param force  Run even if storage is below the soft limit.
 */
export async function runCircularBufferPrune(force = false): Promise<PruneResult> {
  const snapshotBefore = await measureTotalStorageBytes();
  const keysModified: string[] = [];
  let bytesFreed = 0;
  let waveformsEvicted = 0;

  const shouldPrune = force || snapshotBefore.exceedsSoftLimit;
  if (!shouldPrune) {
    const snapshotAfter = snapshotBefore;
    return { bytesFreed: 0, keysModified: [], waveformsEvicted: 0, snapshotBefore, snapshotAfter };
  }

  // Step 1: Apply per-key circular buffer caps
  for (const [key, maxRecords] of Object.entries(MAX_RECORDS_PER_KEY)) {
    if (EXEMPT_KEYS.has(key)) continue;
    const freed = await pruneArrayKey(key, maxRecords);
    if (freed > 0) {
      bytesFreed += freed;
      keysModified.push(key);
    }
  }

  // Step 2: If above soft limit, evict oldest waveform blobs
  if (snapshotBefore.exceedsSoftLimit && snapshotBefore.waveformCount > 0) {
    const evictCount = snapshotBefore.exceedsHardLimit
      ? snapshotBefore.waveformCount   // evict ALL waveforms at hard limit
      : Math.min(10, snapshotBefore.waveformCount);
    const waveFreed = await evictOldestWaveforms(evictCount);
    bytesFreed += waveFreed;
    waveformsEvicted += evictCount;
  }

  // Step 3: If still above hard limit, apply aggressive 50% caps
  if (snapshotBefore.exceedsHardLimit) {
    for (const [key, maxRecords] of Object.entries(MAX_RECORDS_PER_KEY)) {
      if (EXEMPT_KEYS.has(key)) continue;
      const aggressiveCap = Math.floor(maxRecords * 0.5);
      const freed = await pruneArrayKey(key, aggressiveCap);
      if (freed > 0) {
        bytesFreed += freed;
        if (!keysModified.includes(key)) keysModified.push(key);
      }
    }
  }

  const snapshotAfter = await measureTotalStorageBytes();

  return { bytesFreed, keysModified, waveformsEvicted, snapshotBefore, snapshotAfter };
}

/**
 * Convenience: run a prune pass and return a human-readable summary string.
 * Suitable for logging to the crash log or displaying in the Storage Health screen.
 */
export async function pruneAndSummarise(): Promise<string> {
  const result = await runCircularBufferPrune();
  if (result.bytesFreed === 0) {
    return `[CircularBuffer] No pruning needed. Total: ${result.snapshotBefore.totalMB} MB`;
  }
  const freedMB = (result.bytesFreed / (1024 * 1024)).toFixed(2);
  return (
    `[CircularBuffer] Freed ${freedMB} MB. ` +
    `Keys modified: ${result.keysModified.length}. ` +
    `Waveforms evicted: ${result.waveformsEvicted}. ` +
    `Storage: ${result.snapshotBefore.totalMB} MB → ${result.snapshotAfter.totalMB} MB`
  );
}
