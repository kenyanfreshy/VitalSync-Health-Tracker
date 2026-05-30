/**
 * Threshold Configuration
 * Defines user-configurable alert thresholds for BP, HRV, Heart Rate, SpO₂,
 * and per-analyte lab value thresholds.
 * All data is stored locally in AsyncStorage — never sent to any server.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LabAnalyteId, REFERENCE_RANGES } from '@/lib/health/lab-types';
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

const THRESHOLD_STORAGE_KEY = '@vsht:thresholds';
const ANALYTE_THRESHOLD_STORAGE_KEY = '@vsht:analyte_thresholds';
const CORRELATION_WINDOW_KEY = '@vsht:correlation_window_hours';

/** Default correlation window: 4 hours */
export const DEFAULT_CORRELATION_WINDOW_HOURS = 4;

/** Load the user-configured correlation window (1–8 hours). */
export async function loadCorrelationWindowHours(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(CORRELATION_WINDOW_KEY);
    if (!raw) return DEFAULT_CORRELATION_WINDOW_HOURS;
    const val = Number(raw);
    return isNaN(val) ? DEFAULT_CORRELATION_WINDOW_HOURS : Math.min(8, Math.max(1, val));
  } catch (_unused) {
    return DEFAULT_CORRELATION_WINDOW_HOURS;
  }
}

/** Save the user-configured correlation window (clamped to 1–8 hours). */
export async function saveCorrelationWindowHours(hours: number): Promise<void> {
  const clamped = Math.min(8, Math.max(1, Math.round(hours)));
  await safeSetItem(CORRELATION_WINDOW_KEY, String(clamped));
}

export interface ThresholdConfig {
  enabled: boolean;

  // Blood Pressure thresholds (mmHg)
  bp: {
    enabled: boolean;
    systolicHigh: number;   // Alert if systolic > this value (e.g. 140)
    systolicLow: number;    // Alert if systolic < this value (e.g. 90)
    diastolicHigh: number;  // Alert if diastolic > this value (e.g. 90)
    diastolicLow: number;   // Alert if diastolic < this value (e.g. 60)
  };

  // HRV thresholds (ms)
  hrv: {
    enabled: boolean;
    low: number;            // Alert if HRV < this value (e.g. 20ms)
  };

  // Heart Rate thresholds (BPM)
  heartRate: {
    enabled: boolean;
    high: number;           // Alert if resting HR > this (e.g. 100 BPM)
    low: number;            // Alert if resting HR < this (e.g. 40 BPM)
  };

  // SpO₂ (blood oxygen saturation) thresholds (%)
  spo2: {
    enabled: boolean;
    low: number;            // Alert if SpO₂ < this value (e.g. 94%)
    high: number;           // Alert if SpO₂ > this value (e.g. 100% — rarely triggered)
  };

  // Blood Glucose thresholds (mg/dL; stored in mg/dL, displayed per unit preference)
  bloodGlucose: {
    enabled: boolean;
    high: number;           // Alert if glucose > this value (ADA default: 180 mg/dL)
    low: number;            // Alert if glucose < this value (ADA default: 70 mg/dL)
  };

  // Body Temperature thresholds (°F; stored in °F, displayed per unit preference)
  temperature: {
    enabled: boolean;
    high: number;           // Alert if temp > this value (e.g. 100.4°F / 38.0°C = fever)
    low: number;            // Alert if temp < this value (e.g. 96.8°F / 36.0°C = hypothermia)
  };

  // Resting Heart Rate thresholds (BPM) — consecutive-day check
  restingHeartRate: {
    enabled: boolean;
    /** Alert if resting HR exceeds this for consecutiveDays in a row (default 80 bpm) */
    high: number;
    /** Number of consecutive days above threshold before alert fires (default 3) */
    consecutiveDays: number;
  };

  // EKG / AFib alert settings
  ekg: {
    /** Whether to fire a notification when a new AFib episode is detected */
    enabled: boolean;
    /** Minimum hours between AFib notifications (1–24 h, default 4) */
    cooldownHours: number;
  };
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  enabled: true,
  bp: {
    enabled: true,
    systolicHigh: 140,
    systolicLow: 90,
    diastolicHigh: 90,
    diastolicLow: 60,
  },
  hrv: {
    enabled: true,
    low: 20,
  },
  heartRate: {
    enabled: true,
    high: 100,
    low: 40,
  },
  spo2: {
    enabled: true,
    low: 94,
    high: 100,
  },
  bloodGlucose: {
    enabled: true,
    high: 180,   // ADA post-meal threshold (mg/dL)
    low: 70,     // ADA hypoglycaemia threshold (mg/dL)
  },
  temperature: {
    enabled: true,
    high: 100.4, // Fever threshold (°F)
    low: 96.8,   // Hypothermia threshold (°F)
  },
  restingHeartRate: {
    enabled: true,
    high: 80,           // Alert if resting HR > 80 bpm for consecutiveDays days
    consecutiveDays: 3, // Palatini et al. 2006 — 3-day persistence threshold
  },
  ekg: {
    enabled: true,
    cooldownHours: 4,
  },
};

export async function loadThresholds(): Promise<ThresholdConfig> {
  try {
    const raw = await secureGetItem(THRESHOLD_STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch (_unused) {
    return DEFAULT_THRESHOLDS;
  }
}

export async function saveThresholds(config: ThresholdConfig): Promise<void> {
  await secureSetItem(THRESHOLD_STORAGE_KEY, JSON.stringify(config));
}

// ─── Per-Analyte Lab Alert Thresholds ────────────────────────────────────────

/**
 * A custom threshold for a single lab analyte.
 * The user can set a high and/or low bound that overrides the reference range.
 */
export interface AnalyteThreshold {
  analyteId: LabAnalyteId;
  enabled: boolean;
  /** Custom high alert value. If undefined, uses the reference range high. */
  customHigh?: number;
  /** Custom low alert value. If undefined, uses the reference range low. */
  customLow?: number;
  /** Whether to alert when value exceeds customHigh */
  alertHigh: boolean;
  /** Whether to alert when value falls below customLow */
  alertLow: boolean;
}

/** Map of analyteId → AnalyteThreshold */
export type AnalyteThresholdMap = Partial<Record<LabAnalyteId, AnalyteThreshold>>;

export async function loadAnalyteThresholds(): Promise<AnalyteThresholdMap> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTE_THRESHOLD_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AnalyteThresholdMap;
  } catch (_unused) {
    return {};
  }
}

export async function saveAnalyteThresholds(map: AnalyteThresholdMap): Promise<void> {
  await safeSetItem(ANALYTE_THRESHOLD_STORAGE_KEY, JSON.stringify(map));
}

export async function upsertAnalyteThreshold(threshold: AnalyteThreshold): Promise<void> {
  const map = await loadAnalyteThresholds();
  map[threshold.analyteId] = threshold;
  await saveAnalyteThresholds(map);
}

export async function deleteAnalyteThreshold(analyteId: LabAnalyteId): Promise<void> {
  const map = await loadAnalyteThresholds();
  delete map[analyteId];
  await saveAnalyteThresholds(map);
}

// ─── Analyte Alert Snooze ────────────────────────────────────────────────────

const ANALYTE_SNOOZE_KEY = '@vsht:analyte_snooze';

/** Map of analyteId → ISO timestamp when the snooze expires */
export type AnalyteSnoozedMap = Partial<Record<LabAnalyteId, string>>;

export async function loadAnalyteSnoozed(): Promise<AnalyteSnoozedMap> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTE_SNOOZE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AnalyteSnoozedMap;
  } catch (_unused) {
    return {};
  }
}

export async function snoozeAnalyte(analyteId: LabAnalyteId, hours = 24): Promise<void> {
  const map = await loadAnalyteSnoozed();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  map[analyteId] = expiresAt;
  await safeSetItem(ANALYTE_SNOOZE_KEY, JSON.stringify(map));
}

export async function unsnoozeAnalyte(analyteId: LabAnalyteId): Promise<void> {
  const map = await loadAnalyteSnoozed();
  delete map[analyteId];
  await safeSetItem(ANALYTE_SNOOZE_KEY, JSON.stringify(map));
}

export async function isAnalyteSnoozed(analyteId: LabAnalyteId): Promise<boolean> {
  const map = await loadAnalyteSnoozed();
  const expiresAt = map[analyteId];
  if (!expiresAt) return false;
  return new Date(expiresAt) > new Date();
}

/**
 * Check a single analyte value against its configured threshold.
 * Returns a violation object if the value breaches the threshold, or null.
 */
export function checkAnalyteThreshold(
  analyteId: LabAnalyteId,
  value: number,
  threshold: AnalyteThreshold,
): { direction: 'high' | 'low'; customValue: number } | null {
  if (!threshold.enabled) return null;
  const ref = REFERENCE_RANGES[analyteId];
  if (!ref) return null;

  const highBound = threshold.customHigh ?? ref.high;
  const lowBound = threshold.customLow ?? ref.low;

  if (threshold.alertHigh && value > highBound) {
    return { direction: 'high', customValue: highBound };
  }
  if (threshold.alertLow && value < lowBound) {
    return { direction: 'low', customValue: lowBound };
  }
  return null;
}
