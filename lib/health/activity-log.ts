/**
 * VitalSync Activity Log
 *
 * Persists exercise sessions logged via the Clinical Input
 * Exercise-Calorie Logic prompt to AsyncStorage.
 * Each record captures Activity Modality, Duration, RPE, and the
 * computed EPOC (Excess Post-exercise Oxygen Consumption) estimate.
 *
 * Data stays on-device — never synced to any external server.
 */

import { useState, useEffect, useCallback } from 'react';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityModality = 'anaerobic' | 'aerobic' | 'hiit';

export interface ActivityLogRecord {
  id: string;
  timestamp: string;            // ISO 8601
  activityModality: ActivityModality;
  durationMin: number;
  rpe: number;                  // 1-10 Rate of Perceived Exertion
  epocKcal: number;             // EPOC estimate in kcal
  activityMET: number;          // MET value of the activity
  exerciseCaloricBonus: number; // Total caloric ceiling adjustment (base + EPOC)
  fuelSource?: 'lipid_dominant' | 'carb_dominant' | 'mixed';
  note?: string;
}

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = '@vsht:activity_log_v1';

// ─── Persistence helpers ──────────────────────────────────────────────────────

export async function loadActivityLog(): Promise<ActivityLogRecord[]> {
  try {
    const raw = await secureGetItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ActivityLogRecord[];
  } catch (_unused) {
    return [];
  }
}

export async function saveActivityLog(records: ActivityLogRecord[]): Promise<void> {
  try {
    await secureSetItem(STORAGE_KEY, JSON.stringify(records));
  } catch (_unused) {
    // Silently ignore storage errors — data will be re-entered on next session
  }
}

export async function appendActivityRecord(record: ActivityLogRecord): Promise<void> {
  const existing = await loadActivityLog();
  await saveActivityLog([...existing, record]);
}

export async function deleteActivityRecord(id: string): Promise<void> {
  const existing = await loadActivityLog();
  await saveActivityLog(existing.filter((r) => r.id !== id));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseActivityLogReturn {
  records: ActivityLogRecord[];
  isLoading: boolean;
  addRecord: (record: Omit<ActivityLogRecord, 'id' | 'timestamp'>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useActivityLog(): UseActivityLogReturn {
  const [records, setRecords] = useState<ActivityLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const data = await loadActivityLog();
    // Sort newest first
    setRecords(data.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRecord = useCallback(async (partial: Omit<ActivityLogRecord, 'id' | 'timestamp'>) => {
    const record: ActivityLogRecord = {
      ...partial,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    await appendActivityRecord(record);
    setRecords((prev) => [record, ...prev]);
  }, []);

  const deleteRecord = useCallback(async (id: string) => {
    await deleteActivityRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { records, isLoading, addRecord, deleteRecord, refresh };
}

// ─── CSV export helper ────────────────────────────────────────────────────────

export function activityLogToCSV(records: ActivityLogRecord[]): string {
  const headers = [
    'timestamp',
    'activity_modality',
    'duration_min',
    'rpe',
    'epoc_kcal',
    'activity_met',
    'exercise_caloric_bonus_kcal',
    'fuel_source',
    'note',
  ].join(',');

  const rows = records.map((r) =>
    [
      r.timestamp,
      r.activityModality,
      r.durationMin,
      r.rpe,
      r.epocKcal,
      r.activityMET,
      r.exerciseCaloricBonus,
      r.fuelSource ?? '',
      (r.note ?? '').replace(/,/g, ';'),
    ].join(',')
  );

  return [headers, ...rows].join('\n');
}
