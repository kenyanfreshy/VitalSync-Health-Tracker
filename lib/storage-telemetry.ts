/**
 * storage-telemetry.ts
 *
 * Reads size telemetry entries from the crash logger (written by safeSetItem
 * when a write exceeds 500 KB) and provides a summary for the Storage Health
 * row in Settings → Diagnostics.
 *
 * Telemetry entries are crash log entries whose message starts with
 * '[StorageSize]'.  Each entry has the form:
 *   [StorageSize] key="@vsht:health_data" size=1234 KB — TELEMETRY
 *
 * getStorageHealthSummary() returns the top-3 keys by latest size, each with
 * a 30-day sparkline (one data point per calendar day).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// Must match the key used by crash-logger.ts (note: 'crash_logs', not 'crash_log')
const CRASH_LOG_KEY = '@vsht:crash_logs';

/**
 * Session-once deduplication: only emit one telemetry entry per key per session.
 * Prevents the background sync observer from flooding the crash log with
 * identical [StorageSize] entries every 2 seconds.
 */
const _telemetryEmittedThisSession = new Set<string>();

/** Reset the session dedup set (exposed for testing). */
export function _resetTelemetrySessionForTesting(): void {
  _telemetryEmittedThisSession.clear();
}

export interface StorageKeySnapshot {
  key: string;
  label: string;
  latestKB: number;
  sparkline: number[];
}

export interface StorageHealthSummary {
  topKeys: StorageKeySnapshot[];
  hasWarning: boolean;
  warningKeys: string[];
}

interface CrashEntry {
  timestamp: string;
  message: string;
  [key: string]: unknown;
}

function parseTelemetryEntry(entry: CrashEntry): { key: string; sizeKB: number; date: string } | null {
  if (!entry.message?.startsWith('[StorageSize]')) return null;
  const keyMatch = entry.message.match(/key="([^"]+)"/);
  const sizeMatch = entry.message.match(/size=(\d+)\s*KB/);
  if (!keyMatch || !sizeMatch) return null;
  const date = entry.timestamp?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return { key: keyMatch[1], sizeKB: parseInt(sizeMatch[1], 10), date };
}

function formatLabel(key: string): string {
  const parts = key.split(':');
  return parts[parts.length - 1] ?? key;
}

function buildSparkline(entries: { date: string; sizeKB: number }[], today: Date): number[] {
  const result = new Array(30).fill(0);
  for (const e of entries) {
    const d = new Date(e.date);
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
    if (diffDays >= 0 && diffDays < 30) {
      const idx = 29 - diffDays;
      result[idx] = Math.max(result[idx], e.sizeKB);
    }
  }
  return result;
}

export async function getStorageHealthSummary(): Promise<StorageHealthSummary> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    if (!raw) return { topKeys: [], hasWarning: false, warningKeys: [] };
    const entries: CrashEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return { topKeys: [], hasWarning: false, warningKeys: [] };
    const parsed = entries.map(parseTelemetryEntry).filter((e): e is NonNullable<typeof e> => e !== null);
    if (parsed.length === 0) return { topKeys: [], hasWarning: false, warningKeys: [] };
    const byKey = new Map<string, { date: string; sizeKB: number }[]>();
    for (const e of parsed) {
      if (!byKey.has(e.key)) byKey.set(e.key, []);
      byKey.get(e.key)!.push({ date: e.date, sizeKB: e.sizeKB });
    }
    const today = new Date();
    const snapshots: StorageKeySnapshot[] = [];
    for (const [key, entries] of byKey) {
      const latestKB = Math.max(...entries.map((e) => e.sizeKB));
      snapshots.push({ key, label: formatLabel(key), latestKB, sparkline: buildSparkline(entries, today) });
    }
    snapshots.sort((a, b) => b.latestKB - a.latestKB);
    const topKeys = snapshots.slice(0, 3);
    const WARNING_THRESHOLD_KB = 2048;
    const warningKeys = topKeys.filter((k) => k.latestKB >= WARNING_THRESHOLD_KB).map((k) => k.label);
    return { topKeys, hasWarning: warningKeys.length > 0, warningKeys };
  } catch {
    return { topKeys: [], hasWarning: false, warningKeys: [] };
  }
}

/**
 * Emit a [StorageSize] telemetry entry for the given key.
 * Session-once: if this key has already been emitted this session, the call is a no-op.
 * This is the canonical telemetry emitter — safe-async-storage should call this
 * instead of logCrash directly to avoid flooding the crash log.
 */
export async function emitStorageTelemetry(key: string, sizeBytes: number): Promise<void> {
  if (_telemetryEmittedThisSession.has(key)) return;
  _telemetryEmittedThisSession.add(key);
  try {
    const { logCrash } = await import('@/lib/crash-logger');
    await logCrash({
      type: 'Manual',
      message: `[StorageSize] key="${key}" size=${(sizeBytes / 1024).toFixed(0)} KB — TELEMETRY`,
    });
  } catch {
    // Non-fatal
  }
}

export function formatStorageSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

/**
 * Remove all [StorageSize] telemetry entries from the crash log.
 * Non-telemetry entries (real errors) are preserved.
 */
export async function clearStorageTelemetry(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    if (!raw) return;
    const entries: CrashEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    const filtered = entries.filter((e) => !e.message?.startsWith('[StorageSize]'));
    await safeSetItem(CRASH_LOG_KEY, JSON.stringify(filtered));
  } catch {
    // Non-fatal
  }
}
