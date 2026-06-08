/**
 * ekg-vault.ts — EKG_Vault: dedicated storage partition for EKG waveform data.
 *
 * Architecture
 * ────────────
 * EKG records are deliberately segregated from the standard vitals store
 * (@vsht:health_data) because a single 30-second Apple Watch EKG
 * recording carries ~15 330 voltage data points (≈ 120 KB serialized).
 * Mixing waveform payloads into the vitals blob would push it past the 4 MB
 * per-key hard limit in safe-async-storage.ts within a few dozen recordings.
 *
 * Storage layout
 * ──────────────
 *   @vsht:ekg_vault_meta_v1   — metadata index (classification, HR, date)
 *                                    NO voltage data; safe to read on every render
 *   @vsht:ekg_vault_wave_{id} — per-recording voltage array (lazy-loaded)
 *   @vsht:ekg_vault_quota_v1  — weekly per-classification counters
 *
 * Weekly caps (per ISO week, resets Monday)
 * ─────────────────────────────────────────
 *   SinusRhythm         7
 *   AtrialFibrillation  7
 *   Inconclusive        7
 *   Unclassified        (no cap — low-payload, informational only)
 *
 * Any ingestion attempt beyond these caps returns a ThrottleStatus of
 * 'WeeklyLimitReached' and the record is NOT written.
 *
 * Usage
 * ─────
 *   import { vaultIngestEKG, vaultGetMeta, vaultGetWaveform } from '@/lib/health/ekg-vault';
 *
 *   // Ingest a new EKG record (metadata + optional waveform):
 *   const result = await vaultIngestEKG(record);
 *   if (result.status === 'WeeklyLimitReached') { ... }
 *
 *   // List all stored metadata (no voltage):
 *   const meta = await vaultGetMeta();
 *
 *   // Load waveform for one recording (lazy):
 *   const voltages = await vaultGetWaveform(record.id);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import type { EKGRecord, EKGClassification } from './ekg-store';
import { getISOWeek } from './vitals-throttle';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VaultIngestStatus =
  | 'Accepted'
  | 'WeeklyLimitReached'
  | 'Duplicate'
  | 'StorageError';

export interface VaultIngestResult {
  status: VaultIngestStatus;
  /** Human-readable message for UI display. */
  message: string;
  /** Which classification triggered the limit (when status === 'WeeklyLimitReached'). */
  classification?: EKGClassification;
  /** Current weekly counts at the time of the check. */
  weeklyCounts?: WeeklyEKGCounts;
}

/** Metadata record stored in the vault index (no voltage data). */
export interface EKGVaultMeta {
  id: string;
  startDate: string;
  endDate: string;
  classification: EKGClassification;
  averageHeartRate: number | null;
  samplingFrequency: number | null;
  device: string | null;
  algorithmVersion: number | null;
  /** True if a waveform blob exists under ekg_vault_wave_{id}. */
  hasWaveform: boolean;
  /** ISO timestamp when this record was ingested into the vault. */
  ingestedAt: string;
}

interface WeeklyEKGCounts {
  week: string;
  SinusRhythm: number;
  AtrialFibrillation: number;
  Inconclusive: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Per-classification weekly caps. */
export const EKG_VAULT_WEEKLY_CAPS: Partial<Record<EKGClassification, number>> = {
  SinusRhythm:        7,
  AtrialFibrillation: 7,
  Inconclusive:       7,
  // Unclassified: no cap
};

/** Maximum total records in the vault metadata index. */
export const EKG_VAULT_MAX_META = 500;

/** Maximum waveform blobs stored (each ~120 KB; 50 × 120 KB = 6 MB). */
export const EKG_VAULT_MAX_WAVEFORMS = 50;

const META_KEY    = '@vsht:ekg_vault_meta_v1';
const QUOTA_KEY   = '@vsht:ekg_vault_quota_v1';
const WAVE_PREFIX = '@vsht:ekg_vault_wave_';

// ─── Quota helpers ────────────────────────────────────────────────────────────

async function readQuota(): Promise<WeeklyEKGCounts> {
  const currentWeek = getISOWeek();
  try {
    const raw = await AsyncStorage.getItem(QUOTA_KEY);
    if (!raw) return emptyQuota(currentWeek);
    const stored: WeeklyEKGCounts = JSON.parse(raw);
    if (stored.week !== currentWeek) return emptyQuota(currentWeek);
    return stored;
  } catch {
    return emptyQuota(currentWeek);
  }
}

async function writeQuota(q: WeeklyEKGCounts): Promise<void> {
  try {
    await safeSetItem(QUOTA_KEY, JSON.stringify(q));
  } catch {
    // best-effort
  }
}

function emptyQuota(week: string): WeeklyEKGCounts {
  return { week, SinusRhythm: 0, AtrialFibrillation: 0, Inconclusive: 0 };
}

/**
 * Check whether a new record with `classification` is within the weekly cap.
 * Returns null if allowed, or a VaultIngestResult if rejected.
 */
async function checkQuota(
  classification: EKGClassification,
): Promise<{ quota: WeeklyEKGCounts; rejection: VaultIngestResult | null }> {
  const quota = await readQuota();
  const cap = EKG_VAULT_WEEKLY_CAPS[classification];

  if (cap === undefined) {
    // Unclassified — no cap
    return { quota, rejection: null };
  }

  const current = quota[classification as keyof Omit<WeeklyEKGCounts, 'week'>] ?? 0;

  if (current >= cap) {
    return {
      quota,
      rejection: {
        status: 'WeeklyLimitReached',
        message: `Weekly Limit Reached — ${classification} cap of ${cap} recordings per week has been met. New EKG data will be accepted again on Monday.`,
        classification,
        weeklyCounts: quota,
      },
    };
  }

  return { quota, rejection: null };
}

async function incrementQuota(
  quota: WeeklyEKGCounts,
  classification: EKGClassification,
): Promise<void> {
  if (classification === 'Unclassified') return; // no cap, no counter
  const key = classification as keyof Omit<WeeklyEKGCounts, 'week'>;
  quota[key] = (quota[key] ?? 0) + 1;
  await writeQuota(quota);
}

// ─── Metadata index helpers ───────────────────────────────────────────────────

async function readMeta(): Promise<EKGVaultMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EKGVaultMeta[];
  } catch {
    return [];
  }
}

async function writeMeta(meta: EKGVaultMeta[]): Promise<void> {
  try {
    await safeSetItem(META_KEY, JSON.stringify(meta));
  } catch {
    // best-effort
  }
}

/**
 * Prune the metadata index to EKG_VAULT_MAX_META entries (oldest first).
 * When a record is pruned from the index, its waveform blob is also deleted.
 */
async function pruneMetaIfNeeded(meta: EKGVaultMeta[]): Promise<EKGVaultMeta[]> {
  if (meta.length <= EKG_VAULT_MAX_META) return meta;
  // Sort newest-first; keep the most recent EKG_VAULT_MAX_META records
  const sorted = [...meta].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  const pruned = sorted.slice(0, EKG_VAULT_MAX_META);
  const removed = sorted.slice(EKG_VAULT_MAX_META);
  // Delete orphaned waveform blobs
  await Promise.allSettled(
    removed.map((r) => AsyncStorage.removeItem(`${WAVE_PREFIX}${r.id}`)),
  );
  return pruned;
}

// ─── Waveform blob helpers ────────────────────────────────────────────────────

/**
 * Persist a waveform voltage array for a single recording.
 * Enforces EKG_VAULT_MAX_WAVEFORMS by evicting the oldest waveform when full.
 */
async function writeWaveform(id: string, voltages: number[]): Promise<void> {
  try {
    // Count existing waveform keys
    const allKeys = await AsyncStorage.getAllKeys();
    const waveKeys = allKeys.filter((k) => k.startsWith(WAVE_PREFIX));

    if (waveKeys.length >= EKG_VAULT_MAX_WAVEFORMS) {
      // Evict the oldest waveform (lexicographic sort on key is a reasonable proxy
      // since keys contain the HealthKit UUID which is time-ordered on Apple devices)
      const meta = await readMeta();
      const metaById = new Map(meta.map((m) => [m.id, m]));
      // Sort wave keys by startDate of their corresponding meta record
      const sorted = waveKeys.sort((a, b) => {
        const idA = a.replace(WAVE_PREFIX, '');
        const idB = b.replace(WAVE_PREFIX, '');
        const dateA = metaById.get(idA)?.startDate ?? '';
        const dateB = metaById.get(idB)?.startDate ?? '';
        return dateA.localeCompare(dateB); // oldest first
      });
      await AsyncStorage.removeItem(sorted[0]);
      // Mark the evicted record as having no waveform in the meta index
      const evictedId = sorted[0].replace(WAVE_PREFIX, '');
      const updatedMeta = meta.map((m) =>
        m.id === evictedId ? { ...m, hasWaveform: false } : m,
      );
      await writeMeta(updatedMeta);
    }

    await safeSetItem(`${WAVE_PREFIX}${id}`, JSON.stringify(voltages));
  } catch {
    // Waveform storage is best-effort — metadata is always written
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ingest a new EKG record into the vault.
 *
 * Steps:
 *   1. Check weekly per-classification quota.
 *   2. Check for duplicate (same id already in meta index).
 *   3. Write metadata to the index.
 *   4. Optionally write waveform blob if voltages are present.
 *   5. Increment the weekly quota counter.
 *
 * @param record   Full EKGRecord from ekg-store.ts (may include voltages).
 */
export async function vaultIngestEKG(record: EKGRecord): Promise<VaultIngestResult> {
  // 1. Quota check
  const { quota, rejection } = await checkQuota(record.classification);
  if (rejection) return rejection;

  // 2. Duplicate check
  const meta = await readMeta();
  if (meta.some((m) => m.id === record.id)) {
    return {
      status: 'Duplicate',
      message: `EKG record ${record.id} is already in the vault.`,
    };
  }

  // 3. Build metadata entry (strip voltage data)
  const entry: EKGVaultMeta = {
    id: record.id,
    startDate: record.startDate,
    endDate: record.endDate,
    classification: record.classification,
    averageHeartRate: record.averageHeartRate,
    samplingFrequency: record.samplingFrequency,
    device: record.device,
    algorithmVersion: record.algorithmVersion,
    hasWaveform: Array.isArray(record.voltageMeasurements) && record.voltageMeasurements.length > 0,
    ingestedAt: new Date().toISOString(),
  };

  // 4. Persist waveform blob (if present)
  if (entry.hasWaveform && record.voltageMeasurements) {
    await writeWaveform(record.id, record.voltageMeasurements);
  }

  // 5. Write metadata index (newest-first, pruned to cap)
  const updatedMeta = await pruneMetaIfNeeded([entry, ...meta]);
  await writeMeta(updatedMeta);

  // 6. Increment quota counter
  await incrementQuota(quota, record.classification);

  return {
    status: 'Accepted',
    message: `EKG record accepted (${record.classification}).`,
    weeklyCounts: quota,
  };
}

/**
 * Return all EKG vault metadata records, newest-first.
 * Does NOT include voltage data — call vaultGetWaveform() for that.
 */
export async function vaultGetMeta(): Promise<EKGVaultMeta[]> {
  return readMeta();
}

/**
 * Return the voltage array for a single recording, or null if not stored.
 * This is the lazy-load path — only call when the user opens a waveform view.
 */
export async function vaultGetWaveform(id: string): Promise<number[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${WAVE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as number[];
  } catch {
    return null;
  }
}

/**
 * Delete a single EKG record from the vault (metadata + waveform blob).
 */
export async function vaultDeleteRecord(id: string): Promise<void> {
  const meta = await readMeta();
  await writeMeta(meta.filter((m) => m.id !== id));
  await AsyncStorage.removeItem(`${WAVE_PREFIX}${id}`);
}

/**
 * Return the current weekly quota status for display in Settings.
 */
export async function vaultGetQuotaStatus(): Promise<{
  isoWeek: string;
  caps: typeof EKG_VAULT_WEEKLY_CAPS;
  counts: WeeklyEKGCounts;
  remaining: Partial<Record<EKGClassification, number>>;
}> {
  const quota = await readQuota();
  const remaining: Partial<Record<EKGClassification, number>> = {};
  for (const [cls, cap] of Object.entries(EKG_VAULT_WEEKLY_CAPS)) {
    const key = cls as keyof Omit<WeeklyEKGCounts, 'week'>;
    remaining[cls as EKGClassification] = Math.max(0, cap - (quota[key] ?? 0));
  }
  return { isoWeek: quota.week, caps: EKG_VAULT_WEEKLY_CAPS, counts: quota, remaining };
}

/**
 * Wipe all vault data (metadata index + all waveform blobs + quota counters).
 * Used by the "Delete All My Data" flow in Settings → Privacy.
 */
export async function vaultClearAll(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const waveKeys = allKeys.filter((k) => k.startsWith(WAVE_PREFIX));
    await AsyncStorage.multiRemove([META_KEY, QUOTA_KEY, ...waveKeys]);
  } catch {
    // best-effort
  }
}

/**
 * Reset only the weekly quota counters (for testing / developer menu).
 */
export async function vaultResetQuota(): Promise<void> {
  await writeQuota(emptyQuota(getISOWeek()));
}
