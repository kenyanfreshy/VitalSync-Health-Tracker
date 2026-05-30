/**
 * types/vitals.d.ts
 *
 * Canonical TypeScript interfaces for every vital-sign object passed to
 * dashboard widgets, detail screens, and the PDF report generator.
 *
 * Design principles:
 *   • Every sample carries `value`, `unit`, and `timestamp` so widgets have a
 *     uniform contract regardless of the underlying data source.
 *   • Source-specific fields (e.g. `systolic`/`diastolic` for BP) are added as
 *     named extensions of the base `VitalSample` interface.
 *   • All timestamps are ISO 8601 strings — convert to Date only at render time.
 *   • `source` is always present so the UI can show a provenance badge.
 */

// ─── Data source provenance ───────────────────────────────────────────────────

/** Where a reading originated. */
export type VitalSource =
  | 'manual'
  | 'device'
  | 'healthkit'
  | 'health-connect';

// ─── Base sample ─────────────────────────────────────────────────────────────

/**
 * The minimal shape every vital widget expects.
 * Widgets that only need a single scalar (e.g. a sparkline) can accept
 * `VitalSample` directly without knowing the concrete sub-type.
 */
export interface VitalSample {
  /** Unique record identifier (UUID). */
  id: string;
  /** Primary numeric value for this reading. */
  value: number;
  /** Human-readable unit string, e.g. "bpm", "mmHg", "kg", "%". */
  unit: string;
  /** ISO 8601 datetime string, e.g. "2026-04-07T08:30:00.000Z". */
  timestamp: string;
  /** Where the reading came from. */
  source: VitalSource;
  /** Optional device or app name shown in the provenance badge. */
  deviceName?: string;
}

// ─── Heart Rate ───────────────────────────────────────────────────────────────

/**
 * A single heart-rate sample.
 * `value` = beats per minute (bpm).
 */
export interface HeartRateSample extends VitalSample {
  unit: 'bpm';
  /** Heart-rate variability (SDNN or RMSSD) in milliseconds, when available. */
  hrv?: number;
  /** Resting heart rate, when the reading was taken at rest. */
  isResting?: boolean;
}

// ─── Blood Pressure ───────────────────────────────────────────────────────────

/**
 * A single blood-pressure reading.
 * `value` = systolic pressure (mmHg) — used as the primary scalar for charts.
 */
export interface BloodPressureSample extends VitalSample {
  unit: 'mmHg';
  /** Systolic pressure in mmHg (mirrors `value` for clarity). */
  systolic: number;
  /** Diastolic pressure in mmHg. */
  diastolic: number;
}

// ─── Oxygen Saturation (SpO₂) ────────────────────────────────────────────────

/**
 * A single SpO₂ reading.
 * `value` = percentage (0–100).
 */
export interface OxygenSaturationSample extends VitalSample {
  unit: '%';
}

// ─── Respiratory Rate ─────────────────────────────────────────────────────────

/**
 * A single respiratory-rate reading.
 * `value` = breaths per minute.
 */
export interface RespiratoryRateSample extends VitalSample {
  unit: 'breaths/min';
}

// ─── Body Temperature ────────────────────────────────────────────────────────

/**
 * A single body-temperature reading.
 * `value` is always stored in °F internally; convert to °C at render time if
 * the user's locale preference requires it.
 */
export interface BodyTemperatureSample extends VitalSample {
  unit: '°F';
}

// ─── Blood Glucose ───────────────────────────────────────────────────────────

/** Meal context for a blood-glucose reading. */
export type BloodGlucoseContext = 'fasting' | 'post-meal' | 'random' | 'bedtime';

/**
 * A single blood-glucose reading.
 * `value` = mg/dL (primary storage unit).
 */
export interface BloodGlucoseSample extends VitalSample {
  unit: 'mg/dL';
  /** Derived mmol/L value (glucoseMgDl / 18.018). */
  valueMmol: number;
  /** Clinical context for interpreting the reading. */
  context: BloodGlucoseContext;
}

// ─── Body Weight ─────────────────────────────────────────────────────────────

/**
 * A single body-weight measurement.
 * `value` = kilograms (primary storage unit).
 */
export interface BodyWeightSample extends VitalSample {
  unit: 'kg';
  /** Pounds equivalent (weightKg × 2.20462). */
  valueLbs: number;
  /** Body-fat percentage, when recorded alongside weight. */
  bodyFatPct?: number;
  /** Body mass index, when height is known. */
  bmi?: number;
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

/**
 * A single night's sleep summary.
 * `value` = total sleep duration in minutes.
 * `timestamp` = ISO 8601 bedtime (start of the sleep window).
 */
export interface SleepSample extends VitalSample {
  unit: 'min';
  /** ISO 8601 wake time. */
  wakeTime: string;
  /** Deep-sleep minutes. */
  deepMinutes: number;
  /** REM-sleep minutes. */
  remMinutes: number;
  /** Light-sleep minutes. */
  lightMinutes: number;
  /** Awake minutes during the sleep window. */
  awakeMinutes: number;
  /** Core-sleep minutes (Apple Watch stage). */
  coreMinutes?: number;
  /** Sleep efficiency as a percentage (0–100). */
  efficiency: number;
}

// ─── Activity ────────────────────────────────────────────────────────────────

/** Recognised workout / activity types. */
export type ActivityKind =
  | 'outdoor-run'
  | 'indoor-run'
  | 'walk'
  | 'cycling'
  | 'workout';

/**
 * A single activity session.
 * `value` = active calories burned (kcal).
 * `timestamp` = ISO 8601 start time.
 */
export interface ActivitySample extends VitalSample {
  unit: 'kcal';
  /** Workout category. */
  kind: ActivityKind;
  /** Duration in minutes. */
  durationMinutes: number;
  /** Distance in kilometres, when applicable. */
  distanceKm?: number;
  /** Step count, when available. */
  steps?: number;
  /** Average heart rate during the session (bpm). */
  avgHeartRate?: number;
  /** Peak heart rate during the session (bpm). */
  maxHeartRate?: number;
}

// ─── HRV (standalone) ────────────────────────────────────────────────────────

/**
 * A standalone heart-rate variability reading (SDNN).
 * `value` = milliseconds.
 */
export interface HRVSample extends VitalSample {
  unit: 'ms';
}

// ─── Step Count ──────────────────────────────────────────────────────────────

/**
 * A step-count sample, typically aggregated over a day.
 * `value` = step count.
 * `timestamp` = ISO 8601 start of the aggregation window.
 */
export interface StepCountSample extends VitalSample {
  unit: 'steps';
  /** End of the aggregation window (ISO 8601). */
  windowEnd?: string;
}

// ─── Union & discriminated helpers ───────────────────────────────────────────

/**
 * Union of all concrete vital sample types.
 * Use this when a component can accept any vital reading.
 */
export type AnySample =
  | HeartRateSample
  | BloodPressureSample
  | OxygenSaturationSample
  | RespiratoryRateSample
  | BodyTemperatureSample
  | BloodGlucoseSample
  | BodyWeightSample
  | SleepSample
  | ActivitySample
  | HRVSample
  | StepCountSample;

/**
 * Maps a vital-type key to its concrete sample interface.
 * Useful for generic widget props: `VitalSampleMap[T]` gives the exact type.
 *
 * @example
 * function VitalCard<T extends VitalTypeKey>(props: { type: T; sample: VitalSampleMap[T] }) { ... }
 */
export interface VitalSampleMap {
  heartRate: HeartRateSample;
  bloodPressure: BloodPressureSample;
  oxygenSaturation: OxygenSaturationSample;
  respiratoryRate: RespiratoryRateSample;
  bodyTemperature: BodyTemperatureSample;
  bloodGlucose: BloodGlucoseSample;
  bodyWeight: BodyWeightSample;
  sleep: SleepSample;
  activity: ActivitySample;
  hrv: HRVSample;
  stepCount: StepCountSample;
}

/** String literal union of all vital-type keys. */
export type VitalTypeKey = keyof VitalSampleMap;

// ─── Widget prop helpers ──────────────────────────────────────────────────────

/**
 * Minimum props contract for any vital-display widget.
 * Extend this for widget-specific extras (e.g. `showTrend`, `onPress`).
 *
 * @example
 * interface HeartRateCardProps extends VitalWidgetProps<HeartRateSample> {
 *   showHRV?: boolean;
 * }
 */
export interface VitalWidgetProps<T extends VitalSample = VitalSample> {
  /** The most recent sample to display. `null` = loading / no data. */
  sample: T | null;
  /** Whether a data fetch is in progress. */
  isLoading?: boolean;
  /** Error message to surface in the widget, if any. */
  error?: string | null;
}
