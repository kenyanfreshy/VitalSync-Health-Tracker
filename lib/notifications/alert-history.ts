/**
 * Alert History Storage
 * Persists a rolling log of threshold violations to AsyncStorage.
 * Capped at MAX_ENTRIES to prevent unbounded growth.
 * All data stays on-device — no server calls.
 */

import { safeFormatDate } from '@/lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

const HISTORY_STORAGE_KEY = '@vsht:alertHistory';
const UNREAD_COUNT_KEY = '@vsht:alertUnreadCount';
const MAX_ENTRIES = 50;

export type AlertCategory = 'bp' | 'hrv' | 'heartRate' | 'spo2' | 'analyte' | 'glucose' | 'restingHR' | 'ekg';

export interface AlertHistoryEntry {
  id: string;
  timestamp: string;       // ISO 8601
  category: AlertCategory;
  title: string;
  body: string;
  value: number;           // The reading that triggered the alert
  unit: string;            // e.g. "mmHg", "ms", "BPM"
  threshold: number;       // The threshold that was crossed
  direction: 'high' | 'low'; // Whether value was above or below threshold
}

export async function loadAlertHistory(): Promise<AlertHistoryEntry[]> {
  try {
    const raw = await secureGetItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AlertHistoryEntry[];
  } catch (_unused) {
    return [];
  }
}

export async function appendAlertHistory(
  entries: AlertHistoryEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const existing = await loadAlertHistory();
    const combined = [...entries, ...existing].slice(0, MAX_ENTRIES);
    await secureSetItem(HISTORY_STORAGE_KEY, JSON.stringify(combined));
  } catch (_unused) {
    // Silently fail — history is non-critical
  }
}

export async function clearAlertHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export async function getUnreadAlertCount(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(UNREAD_COUNT_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch (_unused) {
    return 0;
  }
}

export async function incrementUnreadAlertCount(by = 1): Promise<void> {
  const current = await getUnreadAlertCount();
  await safeSetItem(UNREAD_COUNT_KEY, String(current + by));
}

export async function clearUnreadAlertCount(): Promise<void> {
  await safeSetItem(UNREAD_COUNT_KEY, '0');
}

/** Format a relative time string for display (e.g. "2 hours ago", "Yesterday") */
export function formatAlertAge(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return safeFormatDate(isoTimestamp, 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Map category to a display label */
export const CATEGORY_LABELS: Record<AlertCategory, string> = {
  bp: 'Blood Pressure',
  hrv: 'HRV',
  heartRate: 'Heart Rate',
  spo2: 'SpO₂',
  analyte: 'Lab Analyte',
  glucose: 'Blood Glucose',
  restingHR: 'Resting Heart Rate',
  ekg: 'EKG / Rhythm',
};
