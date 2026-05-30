/**
 * ekg-tally-store.ts — VitalSync EKG tally layer.
 *
 * Problem this solves
 * ───────────────────
 * The existing ekg-store.ts keeps the full EKGRecord (including voltage data
 * references) for every recording up to the tier limit. This means the dashboard
 * count and the history screen count are both limited by the storage cap — users
 * with many routine Sinus Rhythm recordings hit the cap quickly and stop seeing
 * new recordings.
 *
 * The spec requires:
 * 1. The TALLY (total count per classification) must always reflect ALL recordings
 *    ever fetched, not just the ones retained in the strip cache.
 * 2. Only the most recent 5 ROUTINE (non-AFib) strips per calendar day are kept
 *    in the strip cache. Older routine strips are counted in the tally but their
 *    full EKGRecord is discarded.
 * 3. AFib recordings are ALWAYS retained in the strip cache regardless of the
 *    daily routine limit. They are too clinically significant to discard.
 * 4. The dashboard card must show the tally count (not the cache count) so the
 *    number never decreases after a sync.
 *
 * Architecture
 * ────────────
 * ┌─────────────────────────────────────────────────────────┐
 * │  EKGTally (AsyncStorage: @vsht:ekg_tally_v1)       │
 * │  { total, sinusRhythm, atrialFibrillation,              │
 * │    inconclusive, unclassified, latestDate }             │
 * │  Updated on every ingest. Never decremented.            │
 * └─────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Strip cache (existing @vsht:ekg_cache_v2)         │
 * │  Retains: ALL AFib + max 5 routine/day                  │
 * │  Used for: waveform viewer, history list                │
 * └─────────────────────────────────────────────────────────┘
 *
 * Integration
 * ───────────
 * Call ingestEKGRecords() from the existing fetchEKGPage() path instead of
 * (or after) appendToCache(). The function handles both the tally update and
 * the strip-cache pruning in one atomic operation.
 *
 * The dashboard card should call getEKGTally() instead of getEKGCacheDistribution()
 * so it shows the full historical count.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import type { EKGRecord, EKGDistribution, EKGClassification } from './ekg-store';

// ─── Constants ────────────────────────────────────────────────────────────────

/** AsyncStorage key for the persistent EKG tally. */
export const EKG_TALLY_KEY = '@vsht:ekg_tally_v1';

/** AsyncStorage key for the strip cache (same as ekg-store.ts CACHE_KEY). */
const STRIP_CACHE_KEY = '@vsht:ekg_cache_v2';

/**
 * Maximum number of ROUTINE (non-AFib) strips retained per calendar day.
 * AFib strips are always retained regardless of this limit.
 */
export const EKG_ROUTINE_STRIPS_PER_DAY = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Persistent tally of all EKG recordings ever fetched.
 * This count never decreases — it represents the full historical record.
 */
export interface EKGTally {
  /** Total recordings ever seen. */
  total: number;
  sinusRhythm: number;
  atrialFibrillation: number;
  inconclusive: number;
  unclassified: number;
  /** ISO string of the most recent recording's startDate. */
  latestDate: string | null;
  /** ISO string of when the tally was last updated. */
  lastUpdatedAt: string;
}

/**
 * Result of an ingest operation.
 */
export interface EKGIngestResult {
  /** Number of new records added to the tally. */
  newTallyCount: number;
  /** Number of strips added to the strip cache. */
  newStripCount: number;
  /** Number of routine strips pruned from the cache (daily limit enforcement). */
  prunedStripCount: number;
  /** Updated tally after the ingest. */
  tally: EKGTally;
}

// ─── Strip cache helpers ──────────────────────────────────────────────────────

/** The strip cache stores a CacheEntry wrapper around the records array. */
interface CacheEntry {
  records: EKGRecord[];
  savedAt: number;
}

async function readStripCache(): Promise<EKGRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STRIP_CACHE_KEY);
    if (!raw) return [];
    const parsed: CacheEntry | EKGRecord[] = JSON.parse(raw);
    // Handle both the wrapped CacheEntry format and a bare array (legacy).
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray((parsed as CacheEntry).records)) {
      return (parsed as CacheEntry).records;
    }
    return [];
  } catch {
    return [];
  }
}

async function writeStripCache(records: EKGRecord[]): Promise<void> {
  try {
    const entry: CacheEntry = { records, savedAt: Date.now() };
    await safeSetItem(STRIP_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // best-effort
  }
}

// ─── Tally helpers ────────────────────────────────────────────────────────────

/** Load the persistent tally from AsyncStorage. */
export async function loadEKGTally(): Promise<EKGTally> {
  try {
    const raw = await AsyncStorage.getItem(EKG_TALLY_KEY);
    if (!raw) return emptyTally();
    const parsed: EKGTally = JSON.parse(raw);
    if (typeof parsed?.total !== 'number') return emptyTally();
    return parsed;
  } catch {
    return emptyTally();
  }
}

/** Persist the tally to AsyncStorage. */
export async function saveEKGTally(tally: EKGTally): Promise<void> {
  try {
    await safeSetItem(EKG_TALLY_KEY, JSON.stringify(tally));
  } catch {
    // best-effort
  }
}

function emptyTally(): EKGTally {
  return {
    total: 0,
    sinusRhythm: 0,
    atrialFibrillation: 0,
    inconclusive: 0,
    unclassified: 0,
    latestDate: null,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Convert an EKGTally to the EKGDistribution shape expected by the dashboard. */
export function tallyToDistribution(tally: EKGTally): EKGDistribution {
  return {
    total: tally.total,
    sinusRhythm: tally.sinusRhythm,
    atrialFibrillation: tally.atrialFibrillation,
    inconclusive: tally.inconclusive,
    unclassified: tally.unclassified,
    latestDate: tally.latestDate,
  };
}

/**
 * Get the current EKG tally as an EKGDistribution for the dashboard card.
 * Falls back to the strip cache distribution if the tally is empty (first run).
 */
export async function getEKGTally(): Promise<EKGDistribution> {
  const tally = await loadEKGTally();
  if (tally.total > 0) return tallyToDistribution(tally);

  // Fallback: compute from strip cache (first run before tally is populated).
  try {
    const strips = await readStripCache();
    if (strips.length === 0) return tallyToDistribution(emptyTally());
    return computeDistributionFromStrips(strips);
  } catch {
    return tallyToDistribution(emptyTally());
  }
}

// ─── Classification helpers ───────────────────────────────────────────────────

function classifyRecord(r: EKGRecord): EKGClassification {
  return r.classification ?? 'Unclassified';
}

function isAFib(r: EKGRecord): boolean {
  return classifyRecord(r) === 'AtrialFibrillation';
}

function isRoutine(r: EKGRecord): boolean {
  return !isAFib(r);
}

/**
 * Extract YYYY-MM-DD in LOCAL time from a record's startDate.
 * The spec requires local date boundaries so a recording at 11 PM local time
 * counts against today's local budget, not tomorrow's UTC bucket.
 */
function recordDateKey(r: EKGRecord): string {
  if (!r.startDate) return '';
  try {
    const d = new Date(r.startDate);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

/** Get today's local date key (YYYY-MM-DD). */
export function todayLocalKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO string of midnight at the start of tomorrow (local time) — the next daily reset. */
export function nextDailyResetISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function computeDistributionFromStrips(strips: EKGRecord[]): EKGDistribution {
  const dist: EKGDistribution = {
    total: strips.length,
    sinusRhythm: 0,
    atrialFibrillation: 0,
    inconclusive: 0,
    unclassified: 0,
    latestDate: null,
  };
  let latestMs = 0;
  for (const r of strips) {
    const cls = classifyRecord(r);
    if (cls === 'SinusRhythm') dist.sinusRhythm++;
    else if (cls === 'AtrialFibrillation') dist.atrialFibrillation++;
    else if (cls === 'Inconclusive') dist.inconclusive++;
    else dist.unclassified++;
    if (r.startDate) {
      const ms = new Date(r.startDate).getTime();
      if (!isNaN(ms) && ms > latestMs) {
        latestMs = ms;
        dist.latestDate = r.startDate;
      }
    }
  }
  return dist;
}

// ─── Strip-cache pruning ──────────────────────────────────────────────────────

/**
 * Apply the daily routine strip limit to a set of EKGRecord[].
 *
 * Rules:
 * - AFib records are ALWAYS kept.
 * - For each calendar day, keep only the most recent EKG_ROUTINE_STRIPS_PER_DAY
 *   routine (non-AFib) strips. Older routine strips for that day are discarded.
 *
 * @param records  Full set of strips (existing cache + new).
 * @returns        Pruned set with the daily routine limit applied.
 */
export function applyDailyRoutineLimit(records: EKGRecord[]): {
  retained: EKGRecord[];
  pruned: EKGRecord[];
} {
  // Separate AFib (always keep) from routine.
  const afibRecords = records.filter(isAFib);
  const routineRecords = records.filter(isRoutine);

  // Group routine records by calendar date, sorted newest-first within each group.
  const byDate = new Map<string, EKGRecord[]>();
  for (const r of routineRecords) {
    const key = recordDateKey(r);
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(r);
  }

  const retainedRoutine: EKGRecord[] = [];
  const prunedRoutine: EKGRecord[] = [];

  for (const [, dayRecords] of byDate.entries()) {
    // Sort newest-first by startDate.
    const sorted = [...dayRecords].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
    retainedRoutine.push(...sorted.slice(0, EKG_ROUTINE_STRIPS_PER_DAY));
    prunedRoutine.push(...sorted.slice(EKG_ROUTINE_STRIPS_PER_DAY));
  }

  // Sort final retained set newest-first.
  const retained = [...afibRecords, ...retainedRoutine].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );

  return { retained, pruned: prunedRoutine };
}

// ─── Tally update ─────────────────────────────────────────────────────────────

/**
 * Update the persistent tally with a set of new records.
 * Only records whose IDs are not already known are counted.
 *
 * @param existing  Current tally.
 * @param newRecords  Records to add to the tally.
 * @param knownIds  Set of record IDs already in the tally.
 * @returns  Updated tally and the count of genuinely new records.
 */
export function updateTally(
  existing: EKGTally,
  newRecords: EKGRecord[],
  knownIds: Set<string>,
): { tally: EKGTally; newCount: number } {
  const updated = { ...existing };
  let newCount = 0;
  let latestMs = existing.latestDate ? new Date(existing.latestDate).getTime() : 0;

  for (const r of newRecords) {
    if (knownIds.has(r.id)) continue;
    knownIds.add(r.id);
    newCount++;
    updated.total++;

    const cls = classifyRecord(r);
    if (cls === 'SinusRhythm') updated.sinusRhythm++;
    else if (cls === 'AtrialFibrillation') updated.atrialFibrillation++;
    else if (cls === 'Inconclusive') updated.inconclusive++;
    else updated.unclassified++;

    if (r.startDate) {
      const ms = new Date(r.startDate).getTime();
      if (!isNaN(ms) && ms > latestMs) {
        latestMs = ms;
        updated.latestDate = r.startDate;
      }
    }
  }

  updated.lastUpdatedAt = new Date().toISOString();
  return { tally: updated, newCount };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Ingest a batch of EKGRecord objects from a HealthKit sync.
 *
 * This function:
 * 1. Loads the existing tally and strip cache.
 * 2. Updates the tally with any genuinely new records (by ID).
 * 3. Merges new records into the strip cache.
 * 4. Applies the daily routine strip limit (5 routine/day; AFib always retained).
 * 5. Persists both the updated tally and the pruned strip cache.
 *
 * @param incomingRecords  New EKGRecord[] from the latest HealthKit fetch.
 * @returns                Summary of what changed.
 */
export async function ingestEKGRecords(
  incomingRecords: EKGRecord[],
): Promise<EKGIngestResult> {
  if (!incomingRecords || incomingRecords.length === 0) {
    const tally = await loadEKGTally();
    return { newTallyCount: 0, newStripCount: 0, prunedStripCount: 0, tally };
  }

  try {
    // 1. Load existing state.
    const [tally, existingStrips] = await Promise.all([
      loadEKGTally(),
      readStripCache(),
    ]);

    // Build a set of all IDs already in the tally.
    // Since the tally only stores counts (not IDs), we derive known IDs from
    // the strip cache. Records pruned from the cache are still counted in the
    // tally, so we use a separate "seen IDs" key to avoid double-counting.
    // For simplicity in v1, we use the strip cache IDs as a proxy for known IDs.
    // This means records pruned from the cache could be double-counted on re-sync.
    // The TALLY_SEEN_IDS_KEY below prevents this.
    const seenIdsRaw = await AsyncStorage.getItem(EKG_TALLY_SEEN_IDS_KEY);
    const knownIds: Set<string> = seenIdsRaw
      ? new Set(JSON.parse(seenIdsRaw) as string[])
      : new Set(existingStrips.map((r) => r.id));

    // 2. Update the tally.
    const { tally: updatedTally, newCount } = updateTally(tally, incomingRecords, knownIds);

    // 3. Merge new records into the strip cache (deduplicate by ID).
    const existingIds = new Set(existingStrips.map((r) => r.id));
    const genuinelyNewStrips = incomingRecords.filter((r) => !existingIds.has(r.id));
    const mergedStrips = [...existingStrips, ...genuinelyNewStrips];

    // 4. Apply the daily routine strip limit.
    const { retained, pruned } = applyDailyRoutineLimit(mergedStrips);

    // 5. Persist everything.
    await Promise.all([
      saveEKGTally(updatedTally),
      writeStripCache(retained),
      safeSetItem(EKG_TALLY_SEEN_IDS_KEY, JSON.stringify(Array.from(knownIds))),
    ]);

    return {
      newTallyCount: newCount,
      newStripCount: genuinelyNewStrips.length,
      prunedStripCount: pruned.length,
      tally: updatedTally,
    };
  } catch (err) {
    console.warn('[EKGTallyStore] ingestEKGRecords error:', err);
    const tally = await loadEKGTally();
    return { newTallyCount: 0, newStripCount: 0, prunedStripCount: 0, tally };
  }
}

/** AsyncStorage key for the set of all EKG record IDs ever seen (for tally dedup). */
export const EKG_TALLY_SEEN_IDS_KEY = '@vsht:ekg_tally_seen_ids_v1';

/**
 * Reset the tally and seen-IDs set (for testing / "Delete All Data").
 */
export async function clearEKGTally(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([EKG_TALLY_KEY, EKG_TALLY_SEEN_IDS_KEY]);
  } catch {
    // best-effort
  }
}

/**
 * Rebuild the tally from the current strip cache.
 * Use this as a migration step on first launch after upgrading to this module.
 */
export async function rebuildTallyFromCache(): Promise<EKGTally> {
  try {
    const strips = await readStripCache();
    if (strips.length === 0) return emptyTally();

    const tally = emptyTally();
    const knownIds = new Set<string>();
    const { tally: rebuilt } = updateTally(tally, strips, knownIds);
    await Promise.all([
      saveEKGTally(rebuilt),
      safeSetItem(EKG_TALLY_SEEN_IDS_KEY, JSON.stringify(strips.map((r) => r.id))),
    ]);
    return rebuilt;
  } catch {
    return emptyTally();
  }
}

// ─── Daily stats helper ───────────────────────────────────────────────────────

/**
 * Extended tally info including today's routine strip count and next reset time.
 * Used by the Storage & Sync settings panel.
 */
export interface EKGTallyWithDailyStats {
  tally: EKGTally;
  /** Number of routine strips stored today (local date). */
  routineStripsToday: number;
  /** Max routine strips per day. */
  dailyRoutineLimit: number;
  /** Routine strips remaining today before the limit is reached. */
  routineStripsRemaining: number;
  /** ISO string of midnight tomorrow (local) — when the daily budget resets. */
  nextResetAt: string;
}

/**
 * Returns the EKG tally plus today's routine strip count and next reset time.
 * Used by Settings → Data Sources → Storage & Sync.
 */
export async function getEKGTallyWithDailyStats(): Promise<EKGTallyWithDailyStats> {
  const [tally, strips] = await Promise.all([loadEKGTally(), readStripCache()]);
  const todayKey = todayLocalKey();
  const routineStripsToday = strips.filter(
    (r) => isRoutine(r) && recordDateKey(r) === todayKey,
  ).length;
  const routineStripsRemaining = Math.max(0, EKG_ROUTINE_STRIPS_PER_DAY - routineStripsToday);
  return {
    tally,
    routineStripsToday,
    dailyRoutineLimit: EKG_ROUTINE_STRIPS_PER_DAY,
    routineStripsRemaining,
    nextResetAt: nextDailyResetISO(),
  };
}
