/**
 * VitalSync Health Data Context
 * Provides health data, sync state, and manual entry actions to the entire app.
 */

import React, { createContext, useContext, useEffect, useMemo, useReducer, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DietType } from './diet-type';
import { DIET_TARGETS, DietType as ProfileDietType } from './diet-profile';
import { kgToLbs, HealthData, SyncProgress, WeightRecord, VitalSignsRecord, BloodSugarRecord, ActivityRecord, BloodPressureRecord, PulseRecord, SleepRecord, BodyCompositionRecord, SodiumRecord, MedicalHistoryRecord, SurgicalHistoryRecord, MealIQAnalysisRecord, DoctorAppointment, PrepChecklistItem, ImmunizationRecord, AllergyRecord } from './types';
import type { LabResult } from './lab-types';
import { loadHealthData, saveHealthData, emptyHealthData } from './storage';
import {
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
  scheduleMissedFollowUpNotification,
  cancelMissedFollowUpNotification,
  rescheduleAllAppointmentNotifications,
} from './appointment-notifications';
import {
  rescheduleAllImmunizationNotifications,
} from './immunization-notifications';
import { fetchHealthData, requestHealthPermissions } from './permissions';
import { createCancellationToken } from './healthkit-helpers';
import { _resetRNHCache } from './rnh-loader';
import {
  saveBloodGlucoseToHealthKit,
  saveVitalSignsToHealthKit,
  saveWeightToHealthKit,
  saveSleepToHealthKit,
  saveMealToHealthKit,
} from './healthkit-write';
import { showHealthKitToast } from '@/components/healthkit-toast';
import { detectLang, toStaticLang, logStrings } from '@/lib/i18n';
import { safeSetItem } from '@/lib/safe-async-storage';

/** Returns the localised "Saved to Apple Health ✓" string for the current language. */
function getToastMsg(): string {
  const lang = toStaticLang(detectLang());
  return ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en).savedToHealthKit ?? 'Saved to Apple Health ✓';
}

// ─── State ─────────────────────────────────────────────────────────────────────

interface HealthState {
  data: HealthData | null;
  isLoading: boolean;
  sync: SyncProgress;
  permissionsGranted: boolean;
  /** True when the user has explicitly denied HealthKit/Health Connect access */
  hkPermDenied: boolean;
}

type HealthAction =
  | { type: 'SET_DATA'; payload: HealthData }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PERMISSIONS'; payload: boolean }
  | { type: 'SET_PERMISSIONS_DENIED'; payload: boolean }
  | { type: 'SYNC_START' }
  | { type: 'SYNC_PROGRESS'; payload: { step: string; progress: number } }
  | { type: 'SYNC_COMPLETE'; payload: HealthData }
  | { type: 'SYNC_ERROR'; payload: string }
  | { type: 'ADD_WEIGHT'; payload: WeightRecord }
  | { type: 'DELETE_WEIGHT'; payload: string }
  | { type: 'ADD_VITAL_SIGNS'; payload: VitalSignsRecord }
  | { type: 'DELETE_VITAL_SIGNS'; payload: string }
  | { type: 'ADD_BLOOD_SUGAR'; payload: BloodSugarRecord }
  | { type: 'DELETE_BLOOD_SUGAR'; payload: string }
  | { type: 'ADD_ACTIVITY'; payload: ActivityRecord }
  | { type: 'DELETE_ACTIVITY'; payload: string }
  | { type: 'ADD_SLEEP'; payload: SleepRecord }
  | { type: 'DELETE_SLEEP'; payload: string }
  | { type: 'ADD_SODIUM'; payload: SodiumRecord }
  | { type: 'DELETE_SODIUM'; payload: string }
  | { type: 'ADD_LAB_RESULT'; payload: LabResult }
  | { type: 'UPDATE_LAB_RESULT'; payload: LabResult }
  | { type: 'DELETE_LAB_RESULT'; payload: string }
  | { type: 'ADD_MEDICAL_HISTORY'; payload: MedicalHistoryRecord }
  | { type: 'UPDATE_MEDICAL_HISTORY'; payload: MedicalHistoryRecord }
  | { type: 'DELETE_MEDICAL_HISTORY'; payload: string }
  | { type: 'ADD_SURGICAL_HISTORY'; payload: SurgicalHistoryRecord }
  | { type: 'UPDATE_SURGICAL_HISTORY'; payload: SurgicalHistoryRecord }
  | { type: 'DELETE_SURGICAL_HISTORY'; payload: string }
  | { type: 'ADD_MEAL_IQ_ANALYSIS'; payload: MealIQAnalysisRecord }
  | { type: 'DELETE_MEAL_IQ_ANALYSIS'; payload: string }
  | { type: 'ADD_APPOINTMENT'; payload: DoctorAppointment }
  | { type: 'UPDATE_APPOINTMENT'; payload: DoctorAppointment }
  | { type: 'DELETE_APPOINTMENT'; payload: string }
  | { type: 'ADD_IMMUNIZATION'; payload: ImmunizationRecord }
  | { type: 'UPDATE_IMMUNIZATION'; payload: ImmunizationRecord }
  | { type: 'DELETE_IMMUNIZATION'; payload: string }
  | { type: 'ADD_ALLERGY'; payload: AllergyRecord }
  | { type: 'UPDATE_ALLERGY'; payload: AllergyRecord }
  | { type: 'DELETE_ALLERGY'; payload: string }
  | { type: 'SET_ALLERGY_STATUS'; payload: 'nkda' | 'nka' | null }
  | {
      type: 'MERGE_NATIVE_HEALTH';
      payload: {
        bloodPressure: BloodPressureRecord[];
        heartRate: PulseRecord[];
        sleep: SleepRecord[];
        bodyComposition: BodyCompositionRecord[];
        activity?: ActivityRecord[];
        vitalSigns?: VitalSignsRecord[];
        /** Blood glucose samples from HealthKit (iOS) */
        bloodGlucose?: BloodSugarRecord[];
        /** Resting Heart Rate samples — one per day from Apple Watch */
        restingHRSamples?: PulseRecord[];
      };
    };

const initialSync: SyncProgress = {
  isRunning: false,
  progress: 0,
  currentStep: '',
  completedSteps: [],
};

/**
 * Safe date comparison for sort comparators.
 * Returns 0 for invalid/missing dates so they don't corrupt the sort order.
 * Prevents NaN propagation when a date string is empty or malformed.
 */
function safeDateMs(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const ms = new Date(dateStr).getTime();
  return isNaN(ms) ? 0 : ms;
}

function healthReducer(state: HealthState, action: HealthAction): HealthState {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, data: action.payload, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_PERMISSIONS':
      return { ...state, permissionsGranted: action.payload };
    case 'SET_PERMISSIONS_DENIED':
      return { ...state, hkPermDenied: action.payload };
    case 'SYNC_START':
      return { ...state, sync: { ...initialSync, isRunning: true, currentStep: 'Initializing...' } };
    case 'SYNC_PROGRESS':
      return {
        ...state,
        sync: { ...state.sync, currentStep: action.payload.step, progress: action.payload.progress },
      };
    case 'SYNC_COMPLETE':
      return {
        ...state,
        data: action.payload,
        sync: { ...initialSync, isRunning: false, progress: 1, currentStep: 'Complete' },
      };
    case 'SYNC_ERROR':
      return { ...state, sync: { ...state.sync, isRunning: false, error: action.payload } };

    // ── Manual Entry ──────────────────────────────────────────────────────────
    case 'ADD_WEIGHT':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          weight: [action.payload, ...(state.data.weight ?? [])].sort(
            (a, b) => safeDateMs(b.timestamp) - safeDateMs(a.timestamp)
          ),
        },
      };
    case 'DELETE_WEIGHT':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, weight: (state.data.weight ?? []).filter(r => r.id !== action.payload) } };

    case 'ADD_VITAL_SIGNS':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          vitalSigns: [action.payload, ...(state.data.vitalSigns ?? [])].sort(
            (a, b) => safeDateMs(b.timestamp) - safeDateMs(a.timestamp)
          ),
        },
      };
    case 'DELETE_VITAL_SIGNS':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, vitalSigns: (state.data.vitalSigns ?? []).filter(r => r.id !== action.payload) } };

    case 'ADD_BLOOD_SUGAR':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          bloodSugar: [action.payload, ...(state.data.bloodSugar ?? [])].sort(
            (a, b) => safeDateMs(b.timestamp) - safeDateMs(a.timestamp)
          ),
        },
      };
    case 'DELETE_BLOOD_SUGAR':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, bloodSugar: (state.data.bloodSugar ?? []).filter(r => r.id !== action.payload) } };

    case 'ADD_ACTIVITY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          activity: [action.payload, ...(state.data.activity ?? [])].sort(
            (a, b) => safeDateMs(b.timestamp) - safeDateMs(a.timestamp)
          ),
        },
      };
    case 'DELETE_ACTIVITY':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, activity: (state.data.activity ?? []).filter(r => r.id !== action.payload) } };

    // ── Sleep Actions ─────────────────────────────────────────────────────────────────────────
    case 'ADD_SLEEP':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          sleep: [action.payload, ...(state.data.sleep ?? [])]
            .sort((a, b) => safeDateMs(b.bedtime) - safeDateMs(a.bedtime)),
        },
      };
    case 'DELETE_SLEEP':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, sleep: (state.data.sleep ?? []).filter(r => r.id !== action.payload) } };
    // ── Sodium Intake Actions ─────────────────────────────────────────────────────
    case 'ADD_SODIUM':     if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          sodiumIntake: [action.payload, ...(state.data.sodiumIntake ?? [])].sort(
            (a, b) => safeDateMs(b.timestamp) - safeDateMs(a.timestamp)
          ),
        },
      };
    case 'DELETE_SODIUM':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          sodiumIntake: (state.data.sodiumIntake ?? []).filter(r => r.id !== action.payload),
        },
      };
    // ── Lab Result Actions ───────────────────────────────────────────────────────────────────
    case 'ADD_LAB_RESULT':     if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          labResults: [action.payload, ...(state.data.labResults ?? [])].sort(
            (a, b) => safeDateMs(b.timestamp) - safeDateMs(a.timestamp)
          ),
        },
      };
    case 'UPDATE_LAB_RESULT':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          labResults: (state.data.labResults ?? []).map(r => r.id === action.payload.id ? action.payload : r),
        },
      };
    case 'DELETE_LAB_RESULT':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          labResults: (state.data.labResults ?? []).filter(r => r.id !== action.payload),
        },
      };
    case 'ADD_MEDICAL_HISTORY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          medicalHistory: [action.payload, ...(state.data.medicalHistory ?? [])].sort(
            (a, b) => safeDateMs(b.updatedAt) - safeDateMs(a.updatedAt)
          ),
        },
      };
    case 'UPDATE_MEDICAL_HISTORY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          medicalHistory: (state.data.medicalHistory ?? []).map(r =>
            r.id === action.payload.id ? action.payload : r
          ),
        },
      };
    case 'DELETE_MEDICAL_HISTORY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          medicalHistory: (state.data.medicalHistory ?? []).filter(r => r.id !== action.payload),
        },
      };
    case 'ADD_SURGICAL_HISTORY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          surgicalHistory: [action.payload, ...(state.data.surgicalHistory ?? [])].sort(
            (a, b) => safeDateMs(b.updatedAt) - safeDateMs(a.updatedAt)
          ),
        },
      };
    case 'UPDATE_SURGICAL_HISTORY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          surgicalHistory: (state.data.surgicalHistory ?? []).map(r =>
            r.id === action.payload.id ? action.payload : r
          ),
        },
      };
    case 'DELETE_SURGICAL_HISTORY':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          surgicalHistory: (state.data.surgicalHistory ?? []).filter(r => r.id !== action.payload),
        },
      };

    case 'ADD_APPOINTMENT':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, appointments: [...(state.data.appointments ?? []), action.payload].sort((a, b) => safeDateMs(a.dateTime) - safeDateMs(b.dateTime)) } };
    case 'UPDATE_APPOINTMENT':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, appointments: (state.data.appointments ?? []).map(r => r.id === action.payload.id ? action.payload : r) } };
    case 'DELETE_APPOINTMENT':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, appointments: (state.data.appointments ?? []).filter(r => r.id !== action.payload) } };
    case 'ADD_IMMUNIZATION':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, immunizations: [...(state.data.immunizations ?? []), action.payload].sort((a, b) => safeDateMs(b.dateAdministered) - safeDateMs(a.dateAdministered)) } };
    case 'UPDATE_IMMUNIZATION':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, immunizations: (state.data.immunizations ?? []).map(r => r.id === action.payload.id ? action.payload : r) } };
    case 'DELETE_IMMUNIZATION':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, immunizations: (state.data.immunizations ?? []).filter(r => r.id !== action.payload) } };
    case 'ADD_ALLERGY':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, allergies: [action.payload, ...(state.data.allergies ?? [])] } };
    case 'UPDATE_ALLERGY':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, allergies: (state.data.allergies ?? []).map(r => r.id === action.payload.id ? action.payload : r) } };
    case 'DELETE_ALLERGY':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, allergies: (state.data.allergies ?? []).filter(r => r.id !== action.payload) } };
    case 'SET_ALLERGY_STATUS':
      if (!state.data) return state;
      return { ...state, data: { ...state.data, allergyStatus: action.payload } };
    case 'ADD_MEAL_IQ_ANALYSIS':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          mealIQAnalyzes: [...(state.data.mealIQAnalyzes ?? []), action.payload],
        },
      };

    case 'DELETE_MEAL_IQ_ANALYSIS':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          mealIQAnalyzes: (state.data.mealIQAnalyzes ?? []).filter(r => r.id !== action.payload),
        },
      };
    case 'MERGE_NATIVE_HEALTH': {
      if (!state.data) return state;
      const { bloodPressure, heartRate, sleep, bodyComposition, activity = [], vitalSigns = [], bloodGlucose = [], restingHRSamples = [] } = action.payload;
      // Dual-key dedup: match by id (stable Nitro bridge UUIDs) OR by timestamp
      // (fallback for RCT bridge records where id is generated randomly each sync).
      // A record is considered a duplicate if EITHER its id OR its primary timestamp
      // already exists in the stored array.
      const bpKeys = new Set((state.data.bloodPressure ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      const pulseKeys = new Set((state.data.pulse ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      const sleepKeys = new Set((state.data.sleep ?? []).flatMap(r => [r.id, r.bedtime].filter(Boolean)));
      const bodyKeys = new Set((state.data.bodyComposition ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      const activityKeys = new Set((state.data.activity ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      const vitalKeys = new Set((state.data.vitalSigns ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      const glucoseKeys = new Set((state.data.bloodSugar ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      const restingHRKeys = new Set((state.data.restingHRSamples ?? []).flatMap(r => [r.id, r.timestamp].filter(Boolean)));
      return {
        ...state,
        data: {
          ...state.data,
          lastSyncedAt: new Date().toISOString(),
          bloodPressure: [
            ...(state.data.bloodPressure ?? []),
            ...(bloodPressure ?? []).filter(r => !bpKeys.has(r.id) && !bpKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          pulse: [
            ...(state.data.pulse ?? []),
            ...(heartRate ?? []).filter(r => !pulseKeys.has(r.id) && !pulseKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          sleep: [
            ...(state.data.sleep ?? []),
            ...(sleep ?? []).filter(r => !sleepKeys.has(r.id) && !sleepKeys.has(r.bedtime)),
          ].sort((a, b) => new Date(b.bedtime).getTime() - new Date(a.bedtime).getTime()),
          bodyComposition: [
            ...(state.data.bodyComposition ?? []),
            ...(bodyComposition ?? []).filter(r => !bodyKeys.has(r.id) && !bodyKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          activity: [
            ...(state.data.activity ?? []),
            ...(activity ?? []).filter(r => !activityKeys.has(r.id) && !activityKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          vitalSigns: [
            ...(state.data.vitalSigns ?? []),
            ...(vitalSigns ?? []).filter(r => !vitalKeys.has(r.id) && !vitalKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          // Blood glucose: deduplicate by id + timestamp, then sort newest-first
          bloodSugar: [
            ...(state.data.bloodSugar ?? []),
            ...(bloodGlucose ?? []).filter(r => !glucoseKeys.has(r.id) && !glucoseKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          // Resting HR: deduplicate by id + timestamp, then sort newest-first
          // Apple Watch writes one sample per day — keep the freshest 30-day window.
          restingHRSamples: [
            ...(state.data.restingHRSamples ?? []),
            ...(restingHRSamples ?? []).filter(r => !restingHRKeys.has(r.id) && !restingHRKeys.has(r.timestamp)),
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 100),
        },
      };
    }

    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface HealthContextValue {
  state: HealthState;
  forceSync: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  /** Re-check native HealthKit authorization status without showing the iOS permission sheet.
   *  Dispatches SET_PERMISSIONS / SET_PERMISSIONS_DENIED and updates AsyncStorage.
   *  Safe to call on Android/web — resolves immediately with false. */
  recheckPermissions: () => Promise<boolean>;
  mergeNativeHealth: (data: {
    bloodPressure: BloodPressureRecord[];
    heartRate: PulseRecord[];
    sleep: SleepRecord[];
    bodyComposition: BodyCompositionRecord[];
    activity?: ActivityRecord[];
    vitalSigns?: VitalSignsRecord[];
    bloodGlucose?: BloodSugarRecord[];
    restingHRSamples?: PulseRecord[];
  }) => void;
  addWeight: (record: WeightRecord) => Promise<void>;
  deleteWeight: (id: string) => Promise<void>;
  addVitalSigns: (record: VitalSignsRecord) => Promise<void>;
  deleteVitalSigns: (id: string) => Promise<void>;
  addBloodSugar: (record: BloodSugarRecord) => Promise<void>;
  deleteBloodSugar: (id: string) => Promise<void>;
  addActivity: (record: ActivityRecord) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  addSleep: (record: SleepRecord) => Promise<void>;
  deleteSleep: (id: string) => Promise<void>;
  addSodium: (record: SodiumRecord) => Promise<void>;
  deleteSodium: (id: string) => Promise<void>;
  addLabResult: (record: LabResult) => Promise<void>;
  updateLabResult: (record: LabResult) => Promise<void>;
  deleteLabResult: (id: string) => Promise<void>;
  addMedicalHistory: (record: MedicalHistoryRecord) => Promise<void>;
  updateMedicalHistory: (record: MedicalHistoryRecord) => Promise<void>;
  deleteMedicalHistory: (id: string) => Promise<void>;
  addSurgicalHistory: (record: SurgicalHistoryRecord) => Promise<void>;
  updateSurgicalHistory: (record: SurgicalHistoryRecord) => Promise<void>;
  deleteSurgicalHistory: (id: string) => Promise<void>;
  addMealIQAnalysis: (record: MealIQAnalysisRecord) => Promise<void>;
  deleteMealIQAnalysis: (id: string) => Promise<void>;
  addAppointment: (record: DoctorAppointment) => Promise<void>;
  updateAppointment: (record: DoctorAppointment) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  addImmunization: (record: ImmunizationRecord) => Promise<void>;
  updateImmunization: (record: ImmunizationRecord) => Promise<void>;
  deleteImmunization: (id: string) => Promise<void>;
  addAllergy: (record: AllergyRecord) => Promise<void>;
  updateAllergy: (record: AllergyRecord) => Promise<void>;
  deleteAllergy: (id: string) => Promise<void>;
  /** Set or clear the NKDA / NKA status flag */
  setAllergyStatus: (status: 'nkda' | 'nka' | null) => Promise<void>;
  /** Active diet type for compliance scoring */
  dietType: DietType;
  setDietType: (type: DietType) => Promise<void>;
}

const HealthContext = createContext<HealthContextValue | null>(null);

// Unified with diet-type.ts saveDietType/loadDietType so onboarding and Settings share the same persisted value
const DIET_TYPE_STORAGE_KEY = '@vitalsync/diet_type_v1';
// Persisted flag: true when the user has explicitly denied HealthKit access.
// Survives app restarts so the cold-launch bridge skips re-requesting.
const HK_PERM_DENIED_KEY = '@vsht:hk_perm_denied_v1';
// Persisted flag: true when the user has previously granted HealthKit access.
// Used to restore permissionsGranted on cold launch without re-requesting.
const HK_PERM_GRANTED_KEY = '@vsht:hk_perm_granted_v1';
const DIET_HISTORY_KEY = '@vitalsync/diet_type_history';
const MAX_DIET_HISTORY = 10;

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [dietType, setDietTypeState] = useState<DietType>('balanced');
  const [state, dispatch] = useReducer(healthReducer, {
    // Pre-populate with empty data so dispatches (e.g. addMedicalHistory) are never
    // silently swallowed by the `if (!state.data) return state` null-guard while
    // loadHealthData() is still resolving on first launch.
    data: emptyHealthData(),
    isLoading: true,
    sync: initialSync,
    permissionsGranted: false,
    hkPermDenied: false,
  });

  // Load persisted diet type on mount
  useEffect(() => {
    AsyncStorage.getItem(DIET_TYPE_STORAGE_KEY)
      .then(v => { if (v) setDietTypeState(v as DietType); })
      .catch(() => {});
  }, []);

  // Load persisted hkPermDenied flag on mount
  useEffect(() => {
    AsyncStorage.getItem(HK_PERM_DENIED_KEY)
      .then(v => { if (v === 'true') dispatch({ type: 'SET_PERMISSIONS_DENIED', payload: true }); })
      .catch(() => {});
  }, []);

  // Restore permissionsGranted on cold launch.
  // Step 1 (fast path): read the persisted AsyncStorage flag immediately so the UI
  //   doesn't flash "denied" before the native bridge is ready.
  // Step 2 (authoritative path): after all interactions settle (InteractionManager) + 600ms
  //   defer, verify the real iOS HealthKit authorization status. This corrects the flag if
  //   the user revoked access in Settings → Health since the last launch.
  // The defer is critical: @kingstinct/react-native-healthkit uses Nitro Modules (JSI C++
  //   bridge). On a cold iOS launch the NitroModulesProxy may not be registered yet when
  //   the first useEffect fires. Calling loadHealthKit() too early crashes the app.
  useEffect(() => {
    let cancelled = false;

    async function fastPathRestore() {
      try {
        const [persisted, flowCompleted] = await Promise.all([
          AsyncStorage.getItem(HK_PERM_GRANTED_KEY).catch(() => null),
          AsyncStorage.getItem('@vitalsync/hk_flow_completed').catch(() => null),
        ]);
        if (!cancelled && (persisted === 'true' || flowCompleted === '1')) {
          dispatch({ type: 'SET_PERMISSIONS', payload: true });
          dispatch({ type: 'SET_PERMISSIONS_DENIED', payload: false });
          // Ensure the granted key is set so future cold launches also fast-path correctly.
          if (flowCompleted === '1' && persisted !== 'true') {
            await safeSetItem(HK_PERM_GRANTED_KEY, 'true').catch(() => {});
            await AsyncStorage.removeItem(HK_PERM_DENIED_KEY).catch(() => {});
          }
        }
      } catch (_) {
        // ignore
      }
    }

    async function authoritativeCheck() {
      // Only run on iOS — HealthKit is not available on Android or web.
      const { Platform } = require('react-native') as typeof import('react-native');
      if (Platform.OS !== 'ios') return;

      try {
        const { loadHealthKit } = await import('./healthkit-loader');
        const HK = await loadHealthKit().catch(() => null);
        if (!HK || cancelled) return;

        // isHealthDataAvailable() is safe to call synchronously after loadHealthKit() succeeds.
        if (!HK.isHealthDataAvailable()) return;

        // authorizationStatusFor: 0=notDetermined, 1=sharingDenied, 2=sharingAuthorized
        // Guard with typeof check in case the method is missing in older package versions.
        if (typeof (HK as any).authorizationStatusFor !== 'function') return;

        const hrStatus = (HK as any).authorizationStatusFor('HKQuantityTypeIdentifierHeartRate');
        const bpStatus = (HK as any).authorizationStatusFor('HKQuantityTypeIdentifierBloodPressureSystolic');
        const isGranted = hrStatus === 2 || bpStatus === 2;
        const isDenied = hrStatus === 1 && bpStatus === 1;

        if (cancelled) return;
        dispatch({ type: 'SET_PERMISSIONS', payload: isGranted });
        dispatch({ type: 'SET_PERMISSIONS_DENIED', payload: isDenied });

        if (isGranted) {
          await safeSetItem(HK_PERM_GRANTED_KEY, 'true').catch(() => {});
          await AsyncStorage.removeItem(HK_PERM_DENIED_KEY).catch(() => {});
        } else if (isDenied) {
          await AsyncStorage.removeItem(HK_PERM_GRANTED_KEY).catch(() => {});
          await safeSetItem(HK_PERM_DENIED_KEY, 'true').catch(() => {});
        }
      } catch (_) {
        // Silently ignore — user can always tap "Request Permissions" manually.
      }
    }

    // Run fast path immediately (AsyncStorage only, no native bridge).
    fastPathRestore();

    // Defer the authoritative native check until after all JS interactions settle
    // + an extra 600ms to ensure the Nitro C++ bridge is fully registered.
    const { InteractionManager } = require('react-native') as typeof import('react-native');
    const handle = InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(authoritativeCheck, 600);
      return () => clearTimeout(timer);
    });

    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, []);

  const setDietType = useCallback(async (type: DietType) => {
    setDietTypeState(type);
    await safeSetItem(DIET_TYPE_STORAGE_KEY, type).catch(() => {});
    // Keep DashComplianceCard clinical diet in sync with the global protocol.
    // Map the 8 global DietType values to the diet-profile DietType values used by the card.
    const GLOBAL_TO_PERSONAL: Record<string, string> = {
      dash:          'dash',
      renal:         'renal',
      keto:          'ketogenic',
      diabetic:      'low_carb',
      mediterranean: 'standard',
      vegan:         'standard',
      balanced:      'standard',
      custom:        'custom',  // Personalized diet uses 'custom' in diet-profile.ts
    };
    const clinical = GLOBAL_TO_PERSONAL[type] ?? 'standard';
    await safeSetItem('@vitalsync/clinical_diet_type', clinical).catch(() => {});
    // Record timestamp of protocol change so the sparkline can draw a change marker
    const now = new Date().toISOString();
    await safeSetItem('@vitalsync/diet_type_changed_at', now).catch(() => {});
    // Append to protocol history log (capped at MAX_DIET_HISTORY entries)
    try {
      const raw = await AsyncStorage.getItem(DIET_HISTORY_KEY);
      const history: { dietType: string; label: string; emoji: string; changedAt: string }[] = raw ? JSON.parse(raw) : [];
      const profileType = (type as ProfileDietType);
      const t = DIET_TARGETS[profileType] ?? DIET_TARGETS['balanced'];
      history.unshift({ dietType: type, label: t.label, emoji: t.emoji, changedAt: now });
      if (history.length > MAX_DIET_HISTORY) history.length = MAX_DIET_HISTORY;
      await safeSetItem(DIET_HISTORY_KEY, JSON.stringify(history));
    } catch (_) { /* ignore */ }
  }, []);

  // Load persisted data on mount
  useEffect(() => {
    // Cancellation flag prevents setState after unmount (Hermes BoundFunction crash fix)
    let cancelled = false;
    dispatch({ type: 'SET_LOADING', payload: true });
    loadHealthData()
      .then((data) => {
        if (cancelled) return;
        dispatch({ type: 'SET_DATA', payload: data });
        // Reschedule appointment notifications after app launch (recovers after reinstall)
        if (data.appointments?.length) {
          rescheduleAllAppointmentNotifications(data.appointments);
        }
        // Reschedule immunization next-dose notifications after app launch
        if (data.immunizations?.length) {
          rescheduleAllImmunizationNotifications(data.immunizations);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        // If AsyncStorage is corrupted or unavailable, fall back to empty data
        // so the app is not stuck on a loading screen.
        console.warn('[VitalSync] HealthProvider failed to load data — using empty state:', e);
        import('./storage').then(({ emptyHealthData }) => {
          if (!cancelled) dispatch({ type: 'SET_DATA', payload: emptyHealthData() });
        }).catch(() => { if (!cancelled) dispatch({ type: 'SET_LOADING', payload: false }); });
      });
    return () => { cancelled = true; };
  }, []);

  // Persist whenever data changes — debounced by 500ms so rapid dispatches
  // (e.g. a HealthKit sync merging 50 records) don't block the JS thread with
  // repeated JSON.stringify + AsyncStorage writes during tab navigation.
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.data) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveHealthData(state.data!).catch(console.warn);
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.data]);

  const recheckPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') return false;
    try {
      // Fast-path: if the user completed the HK authorization flow, treat as granted.
      // authorizationStatusFor() returns 0 (notDetermined) for read-only types, so the
      // native check alone can leave hkPermDenied=true even after a successful auth flow.
      const flowCompleted = await AsyncStorage.getItem('@vitalsync/hk_flow_completed').catch(() => null);
      if (flowCompleted === '1') {
        dispatch({ type: 'SET_PERMISSIONS', payload: true });
        dispatch({ type: 'SET_PERMISSIONS_DENIED', payload: false });
        await safeSetItem(HK_PERM_GRANTED_KEY, 'true').catch(() => {});
        await AsyncStorage.removeItem(HK_PERM_DENIED_KEY).catch(() => {});
        return true;
      }
      const { loadHealthKit } = await import('./healthkit-loader');
      const HK = await loadHealthKit().catch(() => null);
      if (!HK) return false;
      if (!HK.isHealthDataAvailable()) return false;
      if (typeof (HK as any).authorizationStatusFor !== 'function') return false;

      const hrStatus = (HK as any).authorizationStatusFor('HKQuantityTypeIdentifierHeartRate');
      const bpStatus = (HK as any).authorizationStatusFor('HKQuantityTypeIdentifierBloodPressureSystolic');
      const isGranted = hrStatus === 2 || bpStatus === 2;
      const isDenied = hrStatus === 1 && bpStatus === 1;

      dispatch({ type: 'SET_PERMISSIONS', payload: isGranted });
      dispatch({ type: 'SET_PERMISSIONS_DENIED', payload: isDenied });

      if (isGranted) {
        await safeSetItem(HK_PERM_GRANTED_KEY, 'true').catch(() => {});
        await AsyncStorage.removeItem(HK_PERM_DENIED_KEY).catch(() => {});
      } else if (isDenied) {
        await AsyncStorage.removeItem(HK_PERM_GRANTED_KEY).catch(() => {});
        await safeSetItem(HK_PERM_DENIED_KEY, 'true').catch(() => {});
      }
      return isGranted;
    } catch (_) {
      return false;
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const perms = await requestHealthPermissions();
    // HealthPermissions values are 'granted' | 'denied' | 'notDetermined' | 'unavailable'
    const allGranted = typeof perms === 'boolean'
      ? perms
      : Object.values(perms).every((v) => v === 'granted');
    // Mark as denied when all types are denied (user explicitly revoked or refused access)
    const allDenied = typeof perms !== 'boolean'
      && Object.values(perms).every((v) => v === 'denied');
    dispatch({ type: 'SET_PERMISSIONS', payload: allGranted });
    dispatch({ type: 'SET_PERMISSIONS_DENIED', payload: allDenied });
    // Persist the denied flag so the cold-launch bridge skips re-requesting on restart.
    // Clear it when permissions are granted (user re-enabled access in Settings).
    if (allGranted) {
      safeSetItem(HK_PERM_GRANTED_KEY, 'true').catch(() => {});
      AsyncStorage.removeItem(HK_PERM_DENIED_KEY).catch(() => {});
      // Reset the RNH init cache so the next forceSync() calls initHealthKit() fresh
      // with the newly granted permissions instead of returning the stale false result.
      _resetRNHCache();
    } else {
      AsyncStorage.removeItem(HK_PERM_GRANTED_KEY).catch(() => {});
      safeSetItem(HK_PERM_DENIED_KEY, String(allDenied)).catch(() => {});
    }
    return allGranted;
  }, []);

  const forceSync = useCallback(async () => {
    dispatch({ type: 'SYNC_START' });
    // Create a per-sync cancellation token so a second forceSync() call can
    // cancel any in-flight HealthKit queries from the previous call.
    const token = createCancellationToken();
    try {
      const freshData = await fetchHealthData(
        (step, progress) => {
          dispatch({ type: 'SYNC_PROGRESS', payload: { step, progress } });
        },
        token,
      );
      // freshData is guaranteed to be non-null (falls back to cached data on timeout)
      dispatch({ type: 'SYNC_COMPLETE', payload: freshData });
    } catch (e) {
      // On unexpected error, keep existing data — do not clear it
      dispatch({ type: 'SYNC_ERROR', payload: String(e) });
    } finally {
      token.cancel(); // release any dangling HealthKit callbacks
    }
  }, []);

  // ── Manual Entry Actions ────────────────────────────────────────────────────

  const addWeight = useCallback(async (record: WeightRecord) => {
    dispatch({ type: 'ADD_WEIGHT', payload: record });
    // Write-back to HealthKit (iOS only, no-op on Android/web, errors swallowed)
    if (record.source === 'manual') {
      saveWeightToHealthKit(record)
        .then(() => showHealthKitToast(getToastMsg()))
        .catch(() => {});
    }
  }, []);

  const deleteWeight = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_WEIGHT', payload: id });
  }, []);

  const addVitalSigns = useCallback(async (record: VitalSignsRecord) => {
    dispatch({ type: 'ADD_VITAL_SIGNS', payload: record });
    // Mirror weight into the weight history so the Weight tab stays in sync
    if (record.weightKg !== undefined && record.weightKg > 0) {
      const weightRecord: WeightRecord = {
        id: `w-vs-${record.id}`,
        timestamp: record.timestamp,
        weightKg: parseFloat(record.weightKg.toFixed(2)),
        weightLbs: parseFloat(kgToLbs(record.weightKg).toFixed(1)),
        note: record.note,
        source: record.source as WeightRecord['source'],
        deviceName: record.deviceName,
      };
      dispatch({ type: 'ADD_WEIGHT', payload: weightRecord });
    }
    // Write-back to HealthKit (iOS only, no-op on Android/web, errors swallowed)
    if (record.source === 'manual') {
      saveVitalSignsToHealthKit(record)
        .then(() => showHealthKitToast(getToastMsg()))
        .catch(() => {});
    }
  }, []);

  const deleteVitalSigns = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_VITAL_SIGNS', payload: id });
    // Remove the mirrored weight record (if any) that was created from this vitals entry
    dispatch({ type: 'DELETE_WEIGHT', payload: `w-vs-${id}` });
  }, []);

  const addBloodSugar = useCallback(async (record: BloodSugarRecord) => {
    dispatch({ type: 'ADD_BLOOD_SUGAR', payload: record });
    // Write-back to HealthKit (iOS only, no-op on Android/web, errors swallowed)
    if (record.source === 'manual') {
      saveBloodGlucoseToHealthKit(record)
        .then(() => showHealthKitToast(getToastMsg()))
        .catch(() => {});
    }
  }, []);

  const deleteBloodSugar = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_BLOOD_SUGAR', payload: id });
  }, []);

  const addActivity = useCallback(async (record: ActivityRecord) => {
    dispatch({ type: 'ADD_ACTIVITY', payload: record });
  }, []);

  const deleteActivity = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_ACTIVITY', payload: id });
  }, []);



  // ── Sleep Actions ──────────────────────────────────────────────────────────────────────────────────────
  const addSleep = useCallback(async (record: SleepRecord) => {
    dispatch({ type: 'ADD_SLEEP', payload: record });
    // Write-back to HealthKit (iOS only, no-op on Android/web, errors swallowed)
    if (record.source === 'manual') {
      saveSleepToHealthKit(record)
        .then(() => showHealthKitToast(getToastMsg()))
        .catch(() => {});
    }
  }, []);
  const deleteSleep = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_SLEEP', payload: id });
  }, []);
  // ── Sodium Actions ──────────────────────────────────────────────────────────────────────────────────
  const addSodium = useCallback(async (record: SodiumRecord) => {
    dispatch({ type: 'ADD_SODIUM', payload: record });
    // Write nutrition data back to Apple HealthKit unless the caller has opted out
    // (skipHealthKit = true) to handle the confirmation prompt themselves.
    // Fire-and-forget — a HealthKit write failure must never block the local save.
    if (!record.skipHealthKit) {
      saveMealToHealthKit(record).catch((e) =>
        console.warn('[HealthKit Write] saveMeal fire-and-forget error:', e)
      );
    }
  }, []);

  const deleteSodium = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_SODIUM', payload: id });
  }, []);
  // ── Lab Result Actions ───────────────────────────────────────────────────────────────────
  const addLabResult = useCallback(async (record: LabResult) => {
    dispatch({ type: 'ADD_LAB_RESULT', payload: record });
  }, []);
  const updateLabResult = useCallback(async (record: LabResult) => {
    dispatch({ type: 'UPDATE_LAB_RESULT', payload: record });
  }, []);
  const deleteLabResult = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_LAB_RESULT', payload: id });
  }, []);

  // ── Medical History Actions ──────────────────────────────────────────────────
  const addMedicalHistory = useCallback(async (record: MedicalHistoryRecord) => {
    dispatch({ type: 'ADD_MEDICAL_HISTORY', payload: record });
  }, []);
  const updateMedicalHistory = useCallback(async (record: MedicalHistoryRecord) => {
    dispatch({ type: 'UPDATE_MEDICAL_HISTORY', payload: record });
  }, []);
  const deleteMedicalHistory = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_MEDICAL_HISTORY', payload: id });
  }, []);

  // ── Surgical History Actions ─────────────────────────────────────────────────
  const addSurgicalHistory = useCallback(async (record: SurgicalHistoryRecord) => {
    dispatch({ type: 'ADD_SURGICAL_HISTORY', payload: record });
  }, []);
  const updateSurgicalHistory = useCallback(async (record: SurgicalHistoryRecord) => {
    dispatch({ type: 'UPDATE_SURGICAL_HISTORY', payload: record });
  }, []);
  const deleteSurgicalHistory = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_SURGICAL_HISTORY', payload: id });
  }, []);

  // ── Meal IQ Analysis Actions ───────────────────────────────────────────────────────────────────────────────────
  const addMealIQAnalysis = useCallback(async (record: MealIQAnalysisRecord) => {
    dispatch({ type: 'ADD_MEAL_IQ_ANALYSIS', payload: record });
  }, []);
  const deleteMealIQAnalysis = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_MEAL_IQ_ANALYSIS', payload: id });
  }, []);

  // ── Doctor Appointment Actions ──────────────────────────────────────────────
  const addAppointment = useCallback(async (record: DoctorAppointment) => {
    dispatch({ type: 'ADD_APPOINTMENT', payload: record });
    scheduleAppointmentNotification(record);
    scheduleMissedFollowUpNotification(record);
  }, []);
  const updateAppointment = useCallback(async (record: DoctorAppointment) => {
    dispatch({ type: 'UPDATE_APPOINTMENT', payload: record });
    if (record.reminderDismissed) {
      cancelAppointmentNotification(record.id);
    } else {
      scheduleAppointmentNotification(record);
    }
    // If an outcome was just logged, cancel the missed follow-up; otherwise reschedule it
    if (record.missedOutcome) {
      cancelMissedFollowUpNotification(record.id);
    } else {
      scheduleMissedFollowUpNotification(record);
    }
  }, []);
  const deleteAppointment = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_APPOINTMENT', payload: id });
    cancelAppointmentNotification(id);
    cancelMissedFollowUpNotification(id);
  }, []);

  // ── Immunization Actions ──────────────────────────────────────────────────
  const addImmunization = useCallback(async (record: ImmunizationRecord) => {
    dispatch({ type: 'ADD_IMMUNIZATION', payload: record });
  }, []);
  const updateImmunization = useCallback(async (record: ImmunizationRecord) => {
    dispatch({ type: 'UPDATE_IMMUNIZATION', payload: record });
  }, []);
  const deleteImmunization = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_IMMUNIZATION', payload: id });
  }, []);

  const addAllergy = useCallback(async (record: AllergyRecord) => {
    dispatch({ type: 'ADD_ALLERGY', payload: record });
  }, []);
  const updateAllergy = useCallback(async (record: AllergyRecord) => {
    dispatch({ type: 'UPDATE_ALLERGY', payload: record });
  }, []);
  const deleteAllergy = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_ALLERGY', payload: id });
  }, []);
  const setAllergyStatus = useCallback(async (status: 'nkda' | 'nka' | null) => {
    dispatch({ type: 'SET_ALLERGY_STATUS', payload: status });
  }, []);

  const mergeNativeHealth = useCallback((data: {
    bloodPressure: BloodPressureRecord[];
    heartRate: PulseRecord[];
    sleep: SleepRecord[];
    bodyComposition: BodyCompositionRecord[];
    activity?: ActivityRecord[];
    vitalSigns?: VitalSignsRecord[];
    bloodGlucose?: BloodSugarRecord[];
    restingHRSamples?: PulseRecord[];
  }) => {
    dispatch({ type: 'MERGE_NATIVE_HEALTH', payload: data });
  }, []);

  // Memoize the context value so that stable function references don't cause
  // every useHealth() consumer to re-render when unrelated state changes.
  // Only re-creates when state or dietType changes — all action callbacks are
  // already stable (useCallback with [] deps).
  const contextValue = useMemo<HealthContextValue>(() => ({
    state,
    forceSync,
    requestPermissions,
    recheckPermissions,
    mergeNativeHealth,
    addWeight,
    deleteWeight,
    addVitalSigns,
    deleteVitalSigns,
    addBloodSugar,
    deleteBloodSugar,
    addActivity,
    deleteActivity,
    addSleep,
    deleteSleep,
    addSodium,
    deleteSodium,
    addLabResult,
    updateLabResult,
    deleteLabResult,
    addMedicalHistory,
    updateMedicalHistory,
    deleteMedicalHistory,
    addSurgicalHistory,
    updateSurgicalHistory,
    deleteSurgicalHistory,
    addMealIQAnalysis,
    deleteMealIQAnalysis,
    addAppointment,
    updateAppointment,
    deleteAppointment,
    addImmunization,
    updateImmunization,
    deleteImmunization,
    addAllergy,
    updateAllergy,
    deleteAllergy,
    setAllergyStatus,
    dietType,
    setDietType,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, dietType]);

  return (
    <HealthContext.Provider
      value={contextValue}
    >
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used within HealthProvider');
  return ctx;
}
