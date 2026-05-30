/**
 * VitalSync Health Data Types
 * Unified types for both HealthKit (iOS) and Health Connect (Android),
 * plus manual entry types for weight, vital signs, blood sugar, and activity.
 */

// ─── Existing Synced Types ──────────────────────────────────────────────────

// ─── Aggregate Data Container ───────────────────────────────────────────────

import type { LabResult } from './lab-types';

export interface BloodPressureRecord {
  id: string;
  timestamp: string; // ISO 8601
  /** mmHg — null when only diastolic was available */
  systolic: number | null;
  /** mmHg — null when only systolic was available */
  diastolic: number | null;
  source?: string;
  /**
   * Human-readable source name from HKSourceRevision.source.name (Nitro bridge)
   * or sourceName (RCT bridge). Populated for every BP tier so device-written
   * and third-party-app readings can be distinguished from manual entries.
   * Examples: "Health", "Omron Connect", "Apple Watch", "Manual Entry"
   */
  deviceName?: string;
}

export interface PulseRecord {
  id: string;
  timestamp: string;
  bpm: number;
  hrv?: number; // ms (SDNN or RMSSD)
  source?: string;
}

export interface BodyCompositionRecord {
  id: string;
  timestamp: string;
  weightKg: number;
  muscleMassKg?: number;
  fatMassKg?: number;
  leanBodyMassKg?: number;   // HKQuantityTypeIdentifierLeanBodyMass (kg)
  heightM?: number;           // HKQuantityTypeIdentifierHeight (metres)
  bmi?: number;
  source?: string;
}

export interface SleepRecord {
  id: string;
  date: string; // YYYY-MM-DD
  bedtime: string;    // ISO 8601
  wakeTime: string;   // ISO 8601
  totalMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
  coreMinutes?: number;
  efficiency: number; // 0-100 %
  source?: string;
  note?: string; // optional free-text journal note
}



// ─── Manual Entry Types ─────────────────────────────────────────────────────

export interface WeightRecord {
  id: string;
  timestamp: string; // ISO 8601
  weightKg: number;
  weightLbs: number;
  note?: string;
  source: 'manual' | 'device' | 'healthkit' | 'health-connect';
  deviceName?: string;
}

export interface VitalSignsRecord {
  id: string;
  timestamp: string; // ISO 8601
  systolic?: number;        // mmHg
  diastolic?: number;       // mmHg
  heartRate?: number;       // bpm
  hrv?: number;              // ms (SDNN or RMSSD)
  oxygenSaturation?: number; // % oxygen saturation (0-100)
  spo2?: number;            // alias for oxygenSaturation (legacy)
  temperature?: number;     // °F
  respiratoryRate?: number; // breaths/min
  weightKg?: number;        // body weight in kg (moved from weight log)
  weightUnit?: 'kg' | 'lbs'; // display unit preference
  // Sleep fields (manual entry, moved from separate sleep log)
  sleepBedtime?: string;     // ISO 8601 datetime
  sleepWakeTime?: string;    // ISO 8601 datetime
  sleepTotalMinutes?: number; // computed from bedtime/wake
  sleepEfficiency?: number;  // 0-100 %
  note?: string;
  source: 'manual' | 'device' | 'healthkit' | 'health-connect';
  deviceName?: string;
}

export type BloodSugarContext = 'fasting' | 'post-meal' | 'random' | 'bedtime';

export interface BloodSugarRecord {
  id: string;
  timestamp: string; // ISO 8601
  glucoseMgDl: number;  // mg/dL
  glucoseMmol: number;  // mmol/L (derived)
  // device-sync field aliases (mapped to glucoseMgDl/glucoseMmol on import)
  valueMgDl?: number;
  valueMmol?: number;
  context: BloodSugarContext;
  mealContext?: BloodSugarContext; // alias used by device-sync
  note?: string;
  source: 'manual' | 'device' | 'healthkit' | 'health-connect';
  deviceName?: string;
}

export type ActivityType = 'outdoor-run' | 'indoor-run' | 'walk' | 'cycling' | 'workout';

export interface ActivityRecord {
  id: string;
  timestamp: string; // ISO 8601
  type: ActivityType;
  durationMinutes: number;
  distanceKm?: number;
  distanceMiles?: number;
  /** Cumulative walking/running distance in metres (HKQuantityTypeIdentifierDistanceWalkingRunning) */
  distanceWalkingRunningM?: number;
  /** Cumulative cycling distance in metres (HKQuantityTypeIdentifierDistanceCycling) */
  distanceCyclingM?: number;
  steps?: number;
  caloriesBurned?: number;
  avgHeartRate?: number; // bpm
  maxHeartRate?: number; // bpm
  note?: string;
  source: 'manual' | 'healthkit' | 'health-connect';
}

// ─── Dietary Sodium Types ──────────────────────────────────────────────────

export type SodiumMealContext = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'supplement' | 'other';

export type NutrientSource = 'verified_lab' | 'clinical_estimate' | 'ai_scan';

export interface SodiumRecord {
  id: string;
  timestamp: string;          // ISO 8601
  sodiumMg: number;           // milligrams of sodium
  potassiumMg?: number;       // milligrams of potassium (optional, for Na:K ratio)
  phosphorusMg?: number;      // milligrams of phosphorus (optional, for Renal protocol — NKF limit ≤800–1000 mg/day)
  mealContext: SodiumMealContext;
  foodDescription?: string;   // e.g. "Canned soup + crackers"
  note?: string;
  source: 'manual' | 'ai-photo' | 'barcode-scan' | 'recipe' | 'ai-hub' | 'diet-log';
  /** Telemetry tag: how the nutrient data was obtained */
  nutrientSource?: NutrientSource;
  /** URI of the captured photo (local device path) — stored for visual meal diary in history list */
  photoUri?: string;
  /** When true, addSodium will NOT auto-write to HealthKit — caller is responsible for opt-in confirmation */
  skipHealthKit?: boolean;
  // ── Caloric & diabetic nutrition fields (populated by Smart photo/voice analysis) ──
  calories?: number;          // kcal
  carbsG?: number;            // total carbohydrates (g)
  sugarG?: number;            // total sugars (g)
  fatG?: number;              // total fat (g)
  proteinG?: number;          // protein (g)
  fiberG?: number;            // dietary fiber (g)
  glycemicLoad?: number;      // estimated glycemic load (0–100)
  /** Confidence level from AI photo scan — used to show dot indicator on Recent Scans cards */
  scanConfidence?: 'high' | 'medium' | 'low';
}

// ─── Medical History ────────────────────────────────────────────────────────

export type MedicalHistoryStatus = 'active' | 'resolved' | 'chronic' | 'in_remission';

export interface MedicalHistoryAiScribe {
  voiceTranscript: string;
  aiConfidence: 'high' | 'medium' | 'low';
  disclaimer: string;
}

export interface MedicalHistoryRecord {
  id: string;
  condition: string;                    // e.g. "Type 2 Diabetes Mellitus"
  icdCode?: string;                     // ICD-10 code, e.g. "E11"
  diagnosedDate?: string;               // YYYY-MM-DD
  status: MedicalHistoryStatus;
  treatingPhysician?: string;
  notes?: string;
  createdAt: string;                    // ISO 8601
  updatedAt: string;                    // ISO 8601
  aiScribe?: MedicalHistoryAiScribe;    // set when entry was created via Smart Scribe
  linkedLabResultIds?: string[];        // IDs of LabResult records linked to this condition
}

// ─── Surgical History ────────────────────────────────────────────────────────

export type SurgicalHistoryType = 'elective' | 'emergency' | 'diagnostic' | 'reconstructive' | 'other';

export interface SurgicalHistoryAiScribe {
  voiceTranscript: string;
  aiConfidence: 'high' | 'medium' | 'low';
  disclaimer: string;
}

export interface SurgicalHistoryRecord {
  id: string;
  procedure: string;                    // e.g. "Appendectomy"
  cptCode?: string;                     // CPT procedure code
  surgeryDate?: string;                 // YYYY-MM-DD
  surgeryType: SurgicalHistoryType;
  surgeon?: string;
  facility?: string;                    // hospital or surgical center
  anesthesia?: 'general' | 'regional' | 'local' | 'sedation';
  complications?: string;
  notes?: string;
  createdAt: string;                    // ISO 8601
  updatedAt: string;                    // ISO 8601
  aiScribe?: SurgicalHistoryAiScribe;   // set when entry was created via Smart Scribe
}

// ─── Meal IQ Analysis Record ──────────────────────────────────────────────────

/** A persisted Meal IQ analysis result, saved after the user taps the Brain icon on a meal entry. */
// ─── Immunization Records ──────────────────────────────────────────────────

export type ImmunizationRoute = 'intramuscular' | 'subcutaneous' | 'oral' | 'intranasal' | 'intradermal' | 'other';
export type ImmunizationSite = 'left_arm' | 'right_arm' | 'left_thigh' | 'right_thigh' | 'other';

export interface ImmunizationAiScribe {
  transcript: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  filledCount: number;
  totalFields: number;
}

export interface ImmunizationRecord {
  id: string;
  vaccineName: string;           // e.g. "Influenza (Flu)", "COVID-19 mRNA"
  vaccineType?: string;          // e.g. "mRNA", "Live attenuated", "Inactivated"
  manufacturer?: string;         // e.g. "Pfizer-BioNTech", "Moderna"
  lotNumber?: string;
  dateAdministered: string;      // ISO date YYYY-MM-DD
  doseNumber?: number;           // e.g. 1, 2, 3 (for multi-dose series)
  seriesTotal?: number;          // e.g. 2 for a 2-dose series
  nextDoseDate?: string;         // ISO date for booster/next dose
  /** Status of the next scheduled dose: 'pending' (default), 'taken', or 'skipped' */
  nextDoseStatus?: 'pending' | 'taken' | 'skipped';
  administeredBy?: string;       // Clinic/provider name
  site?: ImmunizationSite;
  route?: ImmunizationRoute;
  notes?: string;
  reactions?: string;            // Any adverse reactions noted
  aiScribe?: ImmunizationAiScribe;
  /** Pharmacy / clinic name where vaccine can be obtained for next dose */
  pharmacyName?: string;
  /** Pharmacy phone number for tap-to-call (e.g. "+1-800-555-1234") */
  pharmacyPhone?: string;
  /** Pharmacy address for tap-for-directions */
  pharmacyAddress?: string;
  createdAt: string;             // ISO timestamp
  updatedAt?: string;
}

// ─── Doctor Appointments ────────────────────────────────────────────────────

export interface DoctorAppointment {
  id: string;
  /** ISO 8601 datetime string, e.g. "2026-03-26T14:30:00" */
  dateTime: string;
  /** Doctor or specialist name */
  doctorName: string;
  /** Specialty or clinic, e.g. "Cardiology", "Primary Care" */
  specialty?: string;
  /** Location / clinic name */
  location?: string;
  /** Optional prep notes */
  notes?: string;
  /** Whether the 24h reminder has been dismissed */
  reminderDismissed?: boolean;
  /** Prep checklist items — each item has a label and a checked state */
  prepChecklist?: PrepChecklistItem[];
  /** Recurrence interval for follow-up appointments */
  recurrence?: 'none' | 'monthly' | 'every3months' | 'every6months' | 'yearly';
  /** Referring doctor, e.g. "Dr. Johnson (Primary Care)" */
  referredBy?: string;
  /** Outcome logged for a missed/past appointment */
  missedOutcome?: 'attended' | 'missed' | 'cancelled' | 'rebooked';
  /** Free-text note logged when marking outcome */
  outcomeNote?: string;
  /** Original ISO 8601 datetime before the appointment was rescheduled */
  originalDateTime?: string;
  /** ISO 8601 timestamp of when the reschedule was recorded */
  rescheduledAt?: string;
}

export interface PrepChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface MealIQAnalysisRecord {
  id: string;                    // UUID
  mealId: string;                // ID of the SodiumRecord that was analyzed
  mealLabel: string;             // foodDescription or mealContext label
  analyzedAt: string;            // ISO 8601 timestamp of when analysis was run
  insight: string;               // LLM-generated insight text
  bpImpact: string;              // e.g. "BP rose 12 mmHg after this meal"
  hrImpact: string;              // e.g. "Heart rate elevated by 8 bpm"
  glucoseImpact: string;         // e.g. "Glucose rose 40 mg/dL post-meal"
  sodiumSensitive: boolean | null;
  glycemicLoad: string;          // e.g. "High glycemic load (GL 28)"
  keyNutrient: string;           // e.g. "Sodium 2,400 mg"
  recommendation: string;        // LLM recommendation
  naKRatio: number | null;       // Na:K ratio for this meal
  fiberCarbRatio: number | null; // Fiber:Carb ratio for this meal
  disclaimer: string;            // Safety disclaimer from LLM
  // Derived numeric deltas for sorting/PDF export
  bpDeltaSystolic?: number;      // mmHg change in systolic BP post-meal
  glucoseDeltaMgDl?: number;     // mg/dL change in glucose post-meal
  impactScore?: number;          // 0-100 composite impact score for sorting
}

// ─── Allergy Records ────────────────────────────────────────────────────────

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';
export type AllergyCategory = 'drug' | 'food' | 'environmental' | 'insect' | 'latex' | 'other';

export interface AllergyAiScribe {
  transcript: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  filledCount: number;
  totalFields: number;
}

export interface AllergyRecord {
  id: string;
  /** Name of the allergen, e.g. "Penicillin", "Peanuts", "Latex" */
  allergen: string;
  /** Category of allergen */
  category: AllergyCategory;
  /** Reaction description, e.g. "Hives", "Anaphylaxis", "Rash" */
  reaction?: string;
  /** Severity of the allergic reaction */
  severity: AllergySeverity;
  /** ISO date YYYY-MM-DD when allergy was first identified */
  onsetDate?: string;
  /** Additional notes */
  notes?: string;
  /** Set when entry was created via Smart Scribe */
  aiScribe?: AllergyAiScribe;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}
export type { LabResult };

export interface HealthData {
  bloodPressure: BloodPressureRecord[];
  pulse: PulseRecord[];
  bodyComposition: BodyCompositionRecord[];
  sleep: SleepRecord[];
  lastSyncedAt: string | null;
  // Manual entry data
  weight: WeightRecord[];
  vitalSigns: VitalSignsRecord[];
  bloodSugar: BloodSugarRecord[];
  activity: ActivityRecord[];
  // Cumulative step count for today (from HealthKit StepCount or Health Connect)
  steps?: number;
  /** Latest resting heart rate in bpm (from HKQuantityTypeIdentifierRestingHeartRate) */
  restingHR?: number | null;
  /**
   * Resting HR raw samples as PulseRecord[] (last 30 days, one per day from Apple Watch).
   * Stored in the same shape as `pulse` so aggregateHrTo4HourBuckets can be reused
   * for the 1h / 4h / daily window controls on the Resting HR detail tab.
   */
  restingHRSamples?: PulseRecord[];
  // Active energy burned today in kcal (from HealthKit ActiveEnergyBurned)
  activeCaloriesBurned?: number;
  // Dietary sodium (DASH sensitivity model)
  sodiumIntake: SodiumRecord[];
  // Lab results (CMP, CBC, Mg, Phos, Lipid, A1C)
  labResults: LabResult[];
  // Medical & Surgical History
  medicalHistory: MedicalHistoryRecord[];
  surgicalHistory: SurgicalHistoryRecord[];
  // Meal IQ analyses (persisted post-meal analysis results)
  mealIQAnalyses?: MealIQAnalysisRecord[];
  // Doctor appointments
  appointments?: DoctorAppointment[];
  // Immunization records
  immunizations?: ImmunizationRecord[];
  // Allergy records
  allergies?: AllergyRecord[];
  /** NKDA = No Known Drug Allergies, NKA = No Known Allergies (null = not set) */
  allergyStatus?: 'nkda' | 'nka' | null;
  // Medications (local-only, loaded from AsyncStorage)
  medications?: import('@/lib/medications/types').Medication[];
}

export type VitalType = 'bloodPressure' | 'pulse' | 'bodyComposition' | 'sleep';

export interface SyncProgress {
  isRunning: boolean;
  progress: number; // 0-1
  currentStep: string;
  completedSteps: VitalType[];
  error?: string;
}

// ─── Status Helpers ─────────────────────────────────────────────────────────

export type BPStatus = 'normal' | 'elevated' | 'high1' | 'high2' | 'crisis';

export function getBPStatus(systolic: number, diastolic: number): BPStatus {
  if (systolic >= 180 || diastolic >= 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90) return 'high2';
  if (systolic >= 130 || diastolic >= 80) return 'high1';
  if (systolic >= 120) return 'elevated';
  return 'normal';
}

export function getBPStatusLabel(status: BPStatus): string {
  switch (status) {
    case 'normal': return 'Normal';
    case 'elevated': return 'Elevated';
    case 'high1': return 'High Stage 1';
    case 'high2': return 'High Stage 2';
    case 'crisis': return 'Crisis';
  }
}

export function getBPStatusColor(status: BPStatus, palette: Record<string, string>): string {
  switch (status) {
    case 'normal': return palette.bpGreen;
    case 'elevated': return palette.bpAmber;
    case 'high1': return palette.warning;
    case 'high2': return palette.error;
    case 'crisis': return palette.heartRed;
  }
}

export function getBloodSugarStatus(
  mgDl: number,
  context: BloodSugarContext
): 'normal' | 'prediabetes' | 'high' | 'low' {
  if (mgDl < 70) return 'low';
  if (context === 'fasting') {
    if (mgDl < 100) return 'normal';
    if (mgDl < 126) return 'prediabetes';
    return 'high';
  }
  if (context === 'post-meal') {
    if (mgDl < 140) return 'normal';
    if (mgDl < 200) return 'prediabetes';
    return 'high';
  }
  // random / bedtime
  if (mgDl < 140) return 'normal';
  if (mgDl < 200) return 'prediabetes';
  return 'high';
}

// ─── Unit Conversion Helpers ────────────────────────────────────────────────

export function mgDlToMmol(mgDl: number): number {
  return Math.round((mgDl / 18.0182) * 10) / 10;
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10;
}

export function kmToMiles(km: number): number {
  return Math.round(km * 0.621371 * 100) / 100;
}

export function milesToKm(miles: number): number {
  return Math.round((miles / 0.621371) * 100) / 100;
}

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}

export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5 / 9) * 10) / 10;
}
