/**
 * Dose Log Archive
 *
 * When saveMedications trims dose logs beyond MAX_DOSE_LOGS_PER_MED (90) entries
 * per medication, the overflow is appended here instead of being silently dropped.
 *
 * Storage key: @vsht:dose_log_archive
 * Shape: Record<medId, DoseLog[]>
 *
 * The archive itself is bounded to MAX_ARCHIVE_LOGS_PER_MED (500) entries per
 * medication to prevent unbounded growth. Entries are deduplicated by log.id so
 * repeated saves never create duplicates.
 *
 * Public API:
 *   archiveOverflowLogs(overflowByMed)  — called by saveMedications
 *   loadDoseLogArchive()                — returns the full archive map
 *   getArchivedLogsForMed(medId)        — returns archived logs for one medication
 *   clearDoseLogArchive()               — wipes the archive (e.g. after export)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';
import type { DoseLog } from './types';

export const ARCHIVE_KEY = '@vsht:dose_log_archive';

/** Maximum archived entries retained per medication. */
const MAX_ARCHIVE_LOGS_PER_MED = 500;

/** Map of medId → archived DoseLog array. */
export type DoseLogArchive = Record<string, DoseLog[]>;

// ─── Load ────────────────────────────────────────────────────────────────────

export async function loadDoseLogArchive(): Promise<DoseLogArchive> {
  try {
    const raw = await secureGetItem(ARCHIVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as DoseLogArchive;
  } catch (_unused) {
    return {};
  }
}

// ─── Archive overflow ────────────────────────────────────────────────────────

/**
 * Append overflow dose logs to the archive.
 *
 * @param overflowByMed  Map of medId → overflow DoseLog[] (the entries that were
 *                       trimmed from the active store during saveMedications).
 */
export async function archiveOverflowLogs(
  overflowByMed: Record<string, DoseLog[]>,
): Promise<void> {
  if (Object.keys(overflowByMed).length === 0) return;

  let archive: DoseLogArchive;
  try {
    archive = await loadDoseLogArchive();
  } catch (_unused) {
    archive = {};
  }

  for (const [medId, overflow] of Object.entries(overflowByMed)) {
    if (!overflow || overflow.length === 0) continue;

    const existing = archive[medId] ?? [];
    // Build a set of already-archived IDs for fast deduplication
    const existingIds = new Set(existing.map((l) => l.id));
    const newEntries = overflow.filter((l) => !existingIds.has(l.id));

    if (newEntries.length === 0) continue;

    const merged = [...existing, ...newEntries];
    // Keep only the most recent MAX_ARCHIVE_LOGS_PER_MED entries
    archive[medId] =
      merged.length > MAX_ARCHIVE_LOGS_PER_MED
        ? merged.slice(-MAX_ARCHIVE_LOGS_PER_MED)
        : merged;
  }

  await secureSetItem(ARCHIVE_KEY, JSON.stringify(archive));
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/** Returns all archived dose logs for a single medication, sorted oldest-first. */
export async function getArchivedLogsForMed(medId: string): Promise<DoseLog[]> {
  const archive = await loadDoseLogArchive();
  return archive[medId] ?? [];
}

// ─── Clear ────────────────────────────────────────────────────────────────────

/** Wipe the entire archive (e.g. after exporting to a health report PDF). */
export async function clearDoseLogArchive(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ARCHIVE_KEY);
  } catch (_unused) {
    // ignore
  }
}
