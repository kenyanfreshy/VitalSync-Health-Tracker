/**
 * Reminder History — persists a timestamped log of every "Done ✓" tap
 * so users can review what they completed today from the Log tab.
 *
 * Storage key: @vsht:reminder_history
 * Max entries: 100 (oldest pruned first)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

const STORAGE_KEY = '@vsht:reminder_history';
const MAX_ENTRIES = 100;

export type ReminderCategory = 'appointment' | 'blood_pressure' | 'blood_sugar' | 'medication' | 'immunization';

export interface ReminderHistoryEntry {
  /** Unique entry ID */
  id: string;
  /** ISO timestamp of the Done tap */
  completedAt: string;
  /** Category of the reminder */
  category: ReminderCategory;
  /** Human-readable label (e.g. "Dr. Smith — Cardiology", "Metformin 500mg") */
  label: string;
  /** Whether this was a snooze (true) or a permanent dismiss (false) */
  snoozed: boolean;
}

/** Load the full history from AsyncStorage */
export async function loadReminderHistory(): Promise<ReminderHistoryEntry[]> {
  try {
    const raw = await secureGetItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReminderHistoryEntry[];
  } catch (_unused) {
    return [];
  }
}

/** Append a new entry and prune to MAX_ENTRIES */
export async function appendReminderHistory(entry: Omit<ReminderHistoryEntry, 'id'>): Promise<void> {
  try {
    const existing = await loadReminderHistory();
    const newEntry: ReminderHistoryEntry = {
      ...entry,
      id: `rh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES);
    await secureSetItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (_unused) {
    // silently fail — history is non-critical
  }
}

/** Clear all history */
export async function clearReminderHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Helper: get only today's entries */
export function filterToday(entries: ReminderHistoryEntry[]): ReminderHistoryEntry[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return entries.filter(e => new Date(e.completedAt) >= todayStart);
}

/** Category display metadata */
export const CATEGORY_META: Record<ReminderCategory, { label: string; emoji: string; color: string }> = {
  appointment:    { label: 'Appointment',    emoji: '🏥', color: '#3B82F6' },
  blood_pressure: { label: 'Blood Pressure', emoji: '❤️', color: '#F97316' },
  blood_sugar:    { label: 'Blood Sugar',    emoji: '🩸', color: '#EF4444' },
  medication:     { label: 'Medication',     emoji: '💊', color: '#8B5CF6' },
  immunization:   { label: 'Immunization',   emoji: '💉', color: '#0D9488' },
};
