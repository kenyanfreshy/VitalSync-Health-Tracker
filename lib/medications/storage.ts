/**
 * Medication storage helpers.
 * All data is stored locally under "@vsht:medications".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';
import { archiveOverflowLogs } from './dose-log-archive';
import type { Medication, MedicationStore, DoseLog, DoseStatus, RescheduleEvent } from './types';

const STORAGE_KEY = '@vsht:medications';
const DISCLAIMER_KEY = '@vsht:med_disclaimer_accepted';

// ─── Load / Save ─────────────────────────────────────────────────────────────

export async function loadMedications(): Promise<MedicationStore> {
  try {
    const raw = await secureGetItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migrate legacy DoseLog entries (old schema had takenAt + skipped fields)
    return parsed.map((m: any) => ({
      ...m,
      doseLogs: (m.doseLogs ?? []).map((l: any) => {
        if (l.id && l.status) return l; // already new schema
        // Migrate old schema
        const status: DoseStatus = l.skipped ? 'skipped' : 'taken';
        return {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          date: l.takenAt ? l.takenAt.split('T')[0] : new Date().toISOString().split('T')[0],
          scheduledTime: '08:00',
          loggedAt: l.takenAt ?? new Date().toISOString(),
          status,
          note: l.note,
        } as DoseLog;
      }),
    }));
  } catch (_unused) {
    return [];
  }
}

/** Maximum number of dose-log entries retained per medication.
 * Keeping this bounded prevents the AsyncStorage value from growing
 * unboundedly, which triggers an NSException in RNCAsyncStorage._writeManifest
 * on iOS. That exception races with the Hermes GC on iOS 26 Beta and causes
 * a SIGSEGV (KERN_INVALID_ADDRESS) in HiddenClass::findProperty (Thread 9).
 */
const MAX_DOSE_LOGS_PER_MED = 90;

export async function saveMedications(meds: MedicationStore): Promise<void> {
  // Collect overflow logs (entries beyond the cap) for archival before trimming.
  const overflowByMed: Record<string, DoseLog[]> = {};
  for (const m of meds) {
    if (Array.isArray(m.doseLogs) && m.doseLogs.length > MAX_DOSE_LOGS_PER_MED) {
      overflowByMed[m.id] = m.doseLogs.slice(0, m.doseLogs.length - MAX_DOSE_LOGS_PER_MED);
    }
  }
  // Archive overflow asynchronously — do not await so it never blocks the save.
  if (Object.keys(overflowByMed).length > 0) {
    archiveOverflowLogs(overflowByMed).catch((err) =>
      console.warn('[saveMedications] archiveOverflowLogs failed:', err),
    );
  }

  // Trim doseLogs to the most recent MAX_DOSE_LOGS_PER_MED entries so the
  // serialised payload stays well under the ~6 MB RNCAsyncStorage per-key cap.
  const trimmed = meds.map(m => ({
    ...m,
    doseLogs: Array.isArray(m.doseLogs) && m.doseLogs.length > MAX_DOSE_LOGS_PER_MED
      ? m.doseLogs.slice(-MAX_DOSE_LOGS_PER_MED)
      : (m.doseLogs ?? []),
  }));
  const payload = JSON.stringify(trimmed);
  // Guard: if the serialised payload exceeds 4 MB, drop the oldest half of
  // dose logs across all medications and retry once before giving up.
  if (payload.length > 4 * 1024 * 1024) {
    const reduced = trimmed.map(m => ({
      ...m,
      doseLogs: Array.isArray(m.doseLogs)
        ? m.doseLogs.slice(-Math.floor(MAX_DOSE_LOGS_PER_MED / 2))
        : [],
    }));
    try {
      await secureSetItem(STORAGE_KEY, JSON.stringify(reduced));
    } catch (_err) {
      // Last resort: persist without dose logs to keep medication definitions intact.
      const minimal = trimmed.map(m => ({ ...m, doseLogs: [] }));
      try { await secureSetItem(STORAGE_KEY, JSON.stringify(minimal)); } catch (_unused) { /* ignore */ }
    }
    return;
  }
  try {
    await secureSetItem(STORAGE_KEY, payload);
  } catch (_err) {
    // Fallback: strip dose logs and retry so medication definitions are never lost.
    const minimal = trimmed.map(m => ({ ...m, doseLogs: [] }));
    try { await secureSetItem(STORAGE_KEY, JSON.stringify(minimal)); } catch (_unused) { /* ignore */ }
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function addMedication(
  meds: MedicationStore,
  med: Medication,
): Promise<MedicationStore> {
  const updated = [...meds, med];
  await saveMedications(updated);
  return updated;
}

export async function updateMedication(
  meds: MedicationStore,
  updated: Medication,
): Promise<MedicationStore> {
  const next = meds.map((m) => (m.id === updated.id ? updated : m));
  await saveMedications(next);
  return next;
}

export async function deleteMedication(
  meds: MedicationStore,
  id: string,
): Promise<MedicationStore> {
  const next = meds.filter((m) => m.id !== id);
  await saveMedications(next);
  return next;
}

// ─── Dose Logging ────────────────────────────────────────────────────────────

/** Create a new DoseLog entry with a unique ID. */
export function createDoseLog(
  date: string,
  scheduledTime: string,
  status: DoseStatus,
  note?: string,
): DoseLog {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date,
    scheduledTime,
    loggedAt: new Date().toISOString(),
    status,
    note,
  };
}

export async function logDose(
  meds: MedicationStore,
  id: string,
  log: DoseLog,
): Promise<MedicationStore> {
  const next = meds.map((m) => {
    if (m.id !== id) return m;
    // Remove any existing log for the same date+scheduledTime to avoid duplicates
    const filtered = m.doseLogs.filter(
      (l) => !(l.date === log.date && l.scheduledTime === log.scheduledTime),
    );
    const newLogs = [...filtered, log];
    const newQuantity =
      m.quantity !== null && log.status === 'taken'
        ? Math.max(0, m.quantity - 1)
        : m.quantity;
    return { ...m, doseLogs: newLogs, quantity: newQuantity };
  });
  await saveMedications(next);
  return next;
}

/**
 * Remove a dose log entry by its ID (used for Undo Taken within the grace window).
 * Also restores the quantity decrement that was applied when the dose was logged.
 */
export async function removeDoseLog(
  meds: MedicationStore,
  medId: string,
  logId: string,
): Promise<MedicationStore> {
  const next = meds.map((m) => {
    if (m.id !== medId) return m;
    const removed = m.doseLogs.find((l) => l.id === logId);
    const newLogs = m.doseLogs.filter((l) => l.id !== logId);
    // Restore the quantity that was decremented when the dose was logged as taken
    const newQuantity =
      m.quantity !== null && removed?.status === 'taken'
        ? m.quantity + 1
        : m.quantity;
    return { ...m, doseLogs: newLogs, quantity: newQuantity };
  });
  await saveMedications(next);
  return next;
}

/**
 * Record a reschedule event in the dose log for today's dose at the given scheduledTime.
 * If no log entry exists for today+scheduledTime, a placeholder entry is created.
 */
export async function logRescheduleEvent(
  meds: MedicationStore,
  medId: string,
  originalTime: string,
  newTime: string,
  reason?: string,
): Promise<MedicationStore> {
  const today = new Date().toISOString().split('T')[0];
  const event: RescheduleEvent = {
    rescheduledAt: new Date().toISOString(),
    originalTime,
    newTime,
    reason,
  };
  const next = meds.map((m) => {
    if (m.id !== medId) return m;
    // Find or create a log entry for today+originalTime
    const existingIdx = m.doseLogs.findIndex(
      (l) => l.date === today && l.scheduledTime === originalTime,
    );
    let newLogs: DoseLog[];
    if (existingIdx >= 0) {
      newLogs = m.doseLogs.map((l, i) =>
        i === existingIdx
          ? { ...l, rescheduleHistory: [...(l.rescheduleHistory ?? []), event] }
          : l,
      );
    } else {
      // Create a placeholder log entry to carry the reschedule history
      const placeholder: DoseLog = {
        id: `log_rs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: today,
        scheduledTime: originalTime,
        loggedAt: new Date().toISOString(),
        status: 'skipped',
        note: `Rescheduled to ${newTime}${reason ? ` (${reason})` : ''}`,
        rescheduleHistory: [event],
      };
      newLogs = [...m.doseLogs, placeholder];
    }
    // Persist the new time into scheduleTimes so tomorrow's reminder fires at the new time
    const updatedScheduleTimes = (m.scheduleTimes ?? []).map((t) =>
      t === originalTime ? newTime : t
    );
    // Deduplicate in case newTime already exists in the list
    const dedupedTimes = Array.from(new Set(updatedScheduleTimes)).sort();
    return { ...m, doseLogs: newLogs, scheduleTimes: dedupedTimes };
  });
  await saveMedications(next);
  return next;
}

/** Reinstate a missed or skipped dose — updates the log entry with reinstated time. */
export async function reinstateDose(
  meds: MedicationStore,
  medId: string,
  logId: string,
  reinstatedTime: string, // HH:MM
): Promise<MedicationStore> {
  const next = meds.map((m) => {
    if (m.id !== medId) return m;
    const newLogs = m.doseLogs.map((l) => {
      if (l.id !== logId) return l;
      return {
        ...l,
        status: 'taken' as DoseStatus,
        reinstatedAt: new Date().toISOString(),
        reinstatedTime,
      };
    });
    // Decrement quantity if we're reinstating a missed/skipped dose
    const original = m.doseLogs.find((l) => l.id === logId);
    const newQuantity =
      m.quantity !== null && original && original.status !== 'taken'
        ? Math.max(0, m.quantity - 1)
        : m.quantity;
    return { ...m, doseLogs: newLogs, quantity: newQuantity };
  });
  await saveMedications(next);
  return next;
}

/**
 * Update the time on an existing dose log entry.
 * For taken doses, updates reinstatedTime (the actual time taken).
 * For other statuses, updates scheduledTime.
 */
export async function updateDoseTime(
  meds: MedicationStore,
  medId: string,
  logId: string,
  newTime: string, // HH:MM
): Promise<MedicationStore> {
  const next = meds.map((m) => {
    if (m.id !== medId) return m;
    const newLogs = m.doseLogs.map((l) => {
      if (l.id !== logId) return l;
      if (l.status === 'taken') {
        return { ...l, reinstatedTime: newTime, reinstatedAt: l.reinstatedAt ?? new Date().toISOString() };
      }
      return { ...l, scheduledTime: newTime };
    });
    return { ...m, doseLogs: newLogs };
  });
  await saveMedications(next);
  return next;
}

// ─── Disclaimer ─────────────────────────────────────────────────────────────

export async function loadDisclaimerAccepted(): Promise<boolean> {
  const val = await AsyncStorage.getItem(DISCLAIMER_KEY);
  return val === 'true';
}

export async function saveDisclaimerAccepted(): Promise<void> {
  await safeSetItem(DISCLAIMER_KEY, 'true');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns dose logs for today (local date). */
export function getTodayLogs(med: Medication): DoseLog[] {
  const today = new Date().toISOString().split('T')[0];
  return med.doseLogs.filter((l) => l.date === today);
}

/** Returns how many taken doses were logged today. */
export function getTodayTakenCount(med: Medication): number {
  return getTodayLogs(med).filter((l) => l.status === 'taken').length;
}

/** Returns the expected number of doses per day based on frequency. */
export function getDailyDoseCount(med: Medication): number {
  switch (med.frequency) {
    case 'twice_daily': return 2;
    case 'three_times_daily': return 3;
    case 'four_times_daily': return 4;
    case 'weekly': return 1;
    case 'as_needed': return 0;
    case 'custom': return med.scheduleTimes.length;
    default: return 1; // daily
  }
}

/** Returns overall adherence rate (0–1) over the last 30 days. */
export function getAdherenceRate(med: Medication): number {
  const dailyCount = getDailyDoseCount(med);
  if (dailyCount === 0) return 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const recentTaken = med.doseLogs.filter(
    (l) => l.status === 'taken' && new Date(l.loggedAt) >= cutoff,
  );
  const expected = dailyCount * 30;
  return Math.min(1, recentTaken.length / expected);
}

/**
 * Compute missed doses: scheduled times today that have no log entry yet
 * and whose window has passed (more than 60 min ago).
 */
export function getMissedDosesToday(med: Medication): { scheduledTime: string }[] {
  if (!med.active) return [];
  const today = new Date().toISOString().split('T')[0];
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const todayLogs = med.doseLogs.filter((l) => l.date === today);

  return med.scheduleTimes
    .filter((t) => {
      const [hh, mm] = t.split(':').map(Number);
      const schedMin = hh * 60 + mm;
      const alreadyLogged = todayLogs.some((l) => l.scheduledTime === t);
      // Missed = window has passed (>60 min ago) and not yet logged
      return !alreadyLogged && nowMinutes - schedMin > 60;
    })
    .map((t) => ({ scheduledTime: t }));
}

/**
 * Compute due doses: scheduled times today that are due now or coming up
 * within the next 60 minutes, and have not yet been logged.
 * Window: from 60 min ago (already overdue but not yet missed) up to 60 min ahead.
 */
export function getDueDosesToday(med: Medication): { scheduledTime: string; minutesUntil: number }[] {
  if (!med.active) return [];
  const today = new Date().toISOString().split('T')[0];
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const todayLogs = med.doseLogs.filter((l) => l.date === today);

  return med.scheduleTimes
    .filter((t) => {
      const [hh, mm] = t.split(':').map(Number);
      const schedMin = hh * 60 + mm;
      const alreadyLogged = todayLogs.some((l) => l.scheduledTime === t);
      // Due = within 60 min ago (overdue but not missed) OR up to 60 min ahead
      const diff = schedMin - nowMinutes;
      return !alreadyLogged && diff >= -60 && diff <= 60;
    })
    .map((t) => {
      const [hh, mm] = t.split(':').map(Number);
      return { scheduledTime: t, minutesUntil: hh * 60 + mm - nowMinutes };
    });
}

/** Creates a new Medication with sensible defaults. */
export function createMedication(
  overrides: Partial<Medication> & { name: string; dose: string },
): Medication {
  return {
    id: `med_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    form: 'tablet',
    frequency: 'daily',
    scheduleTimes: ['08:00'],
    quantity: 30,
    refillAt: 7,
    color: '#22C55E',
    notes: '',
    addedAt: new Date().toISOString(),
    active: true,
    doseLogs: [],
    notificationIds: [],
    ...overrides,
  };
}
