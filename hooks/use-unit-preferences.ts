/**
 * useUnitPreferences
 *
 * Reads the user's unit preferences from AsyncStorage (@vitalsync/profile_units).
 * Returns stable values that update whenever the hook is first mounted.
 *
 * Stored shape:
 *   { heightUnit: 'cm'|'in', weightUnit: 'kg'|'lbs', tempUnit: 'C'|'F',
 *     glucoseUnit: 'mg/dL'|'mmol/L', distanceUnit: 'km'|'mi' }
 *
 * Usage:
 *   const { weightUnit, glucoseUnit, tempUnit, distanceUnit, heightUnit } = useUnitPreferences();
 */
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { safeSetItem } from '@/lib/safe-async-storage';

export type WeightUnit   = 'kg'    | 'lbs';
export type TempUnit     = 'C'     | 'F';
export type GlucoseUnit  = 'mg/dL' | 'mmol/L';
export type DistanceUnit = 'km'    | 'mi';
export type HeightUnit   = 'cm'    | 'in';

export interface UnitPreferences {
  weightUnit:   WeightUnit;
  tempUnit:     TempUnit;
  glucoseUnit:  GlucoseUnit;
  distanceUnit: DistanceUnit;
  heightUnit:   HeightUnit;
}

export const UNITS_KEY = '@vitalsync/profile_units';
export const UNIT_PREFS_CHANGED_EVENT = 'unitPrefsChanged';

export const UNIT_DEFAULTS: UnitPreferences = {
  weightUnit:   'lbs',
  tempUnit:     'F',
  glucoseUnit:  'mg/dL',
  distanceUnit: 'mi',
  heightUnit:   'in',
};

/**
 * Per-language unit defaults.
 * When a user selects a language, units auto-switch to the regional standard.
 * Users can always override manually in Settings > Units.
 *
 * Imperial (lbs/in/°F/mg/dL/mi): en (US), tl (Philippines)
 * UK metric-ish (kg/cm/°C/mmol/L/km): en-GB — handled by 'en' default + manual override
 * Full metric (kg/cm/°C/mg/dL/km): es, fr, pt, de, it, ko, ja, zh, hi, am, sw, so, hy
 * Arabic metric (kg/cm/°C/mmol/L/km): ar
 * Swahili/East Africa (kg/cm/°C/mmol/L/km): sw
 */
export const LANG_UNIT_DEFAULTS: Record<string, UnitPreferences> = {
  // US English — imperial
  en:  { weightUnit: 'lbs', tempUnit: 'F',  glucoseUnit: 'mg/dL',  distanceUnit: 'mi', heightUnit: 'in' },
  // Spanish — metric, mg/dL (Latin America & Spain)
  es:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // French — metric, mmol/L (France uses mmol/L for glucose)
  fr:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Portuguese — metric, mg/dL (Brazil & Portugal)
  pt:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // Arabic — metric, mmol/L (Middle East & North Africa)
  ar:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Swahili — metric, mmol/L (East Africa)
  sw:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Amharic — metric, mmol/L (Ethiopia)
  am:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Hindi — metric, mg/dL (India)
  hi:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // Chinese — metric, mmol/L (China uses mmol/L)
  zh:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // German — metric, mmol/L (Germany, Austria, Switzerland)
  de:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Italian — metric, mg/dL (Italy)
  it:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // Korean — metric, mg/dL (South Korea)
  ko:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // Japanese — metric, mg/dL (Japan)
  ja:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // Filipino/Tagalog — metric, mg/dL (Philippines)
  tl:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mg/dL',  distanceUnit: 'km', heightUnit: 'cm' },
  // Somali — metric, mmol/L (Somalia)
  so:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Armenian — metric, mmol/L (Armenia)
  hy:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
  // Polish — metric, mmol/L (Poland)
  pl:  { weightUnit: 'kg',  tempUnit: 'C',  glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' },
};

/**
 * Returns the recommended unit defaults for a given language code.
 * Falls back to UNIT_DEFAULTS (US imperial) if language is unknown.
 */
export function getDefaultUnitsForLang(lang: string): UnitPreferences {
  return LANG_UNIT_DEFAULTS[lang] ?? UNIT_DEFAULTS;
}

/**
 * Auto-apply regional unit defaults when the user first selects a language,
 * but only if they have NOT already manually customized their units.
 * Pass `force = true` to override existing preferences (e.g., on first onboarding).
 */
export async function applyLangUnitDefaults(lang: string, force = false): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(UNITS_KEY);
    if (raw && !force) return; // user has already set preferences — don't override
    const defaults = getDefaultUnitsForLang(lang);
    await safeSetItem(UNITS_KEY, JSON.stringify(defaults));
    DeviceEventEmitter.emit(UNIT_PREFS_CHANGED_EVENT, defaults);
  } catch (_) {
    // non-fatal
  }
}

/** Parse raw JSON from AsyncStorage into a full UnitPreferences object */
export function parseUnitPrefs(raw: string | null): UnitPreferences {
  if (!raw) return UNIT_DEFAULTS;
  try {
    const u = JSON.parse(raw);
    return {
      weightUnit:   u.weightUnit   === 'kg'    ? 'kg'     : 'lbs',
      tempUnit:     u.tempUnit     === 'C'     ? 'C'      : 'F',
      glucoseUnit:  u.glucoseUnit  === 'mmol/L'? 'mmol/L' : 'mg/dL',
      distanceUnit: u.distanceUnit === 'km'    ? 'km'     : 'mi',
      heightUnit:   u.heightUnit   === 'cm'    ? 'cm'     : 'in',
    };
  } catch (_) {
    return UNIT_DEFAULTS;
  }
}

/** Save a partial update to unit preferences and notify all listeners */
export async function saveUnitPreferences(patch: Partial<UnitPreferences>): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(UNITS_KEY);
    const existing = parseUnitPrefs(raw);
    const updated = { ...existing, ...patch };
    await safeSetItem(UNITS_KEY, JSON.stringify(updated));
    // Notify all mounted useUnitPreferences hooks immediately
    DeviceEventEmitter.emit(UNIT_PREFS_CHANGED_EVENT, updated);
  } catch (_) {
    // non-fatal
  }
}

export function useUnitPreferences(): UnitPreferences {
  const [prefs, setPrefs] = useState<UnitPreferences>(UNIT_DEFAULTS);

  useEffect(() => {
    // Load on mount
    AsyncStorage.getItem(UNITS_KEY)
      .then((raw) => setPrefs(parseUnitPrefs(raw)))
      .catch(() => {});

    // Subscribe to live updates from saveUnitPreferences
    const sub = DeviceEventEmitter.addListener(
      UNIT_PREFS_CHANGED_EVENT,
      (updated: UnitPreferences) => setPrefs(updated),
    );
    return () => sub.remove();
  }, []);

  return prefs;
}

// ─── Conversion helpers ────────────────────────────────────────────────────

/** kg → lbs */
export const kgToLbs  = (kg: number)  => Math.round(kg  * 2.20462 * 10) / 10;
/** lbs → kg */
export const lbsToKg  = (lbs: number) => Math.round(lbs / 2.20462 * 100) / 100;
/** cm → inches */
export const cmToIn   = (cm: number)  => Math.round(cm  / 2.54 * 10) / 10;
/** inches → cm */
export const inToCm   = (inches: number) => Math.round(inches * 2.54 * 10) / 10;
/** °C → °F */
export const cToF     = (c: number)   => Math.round((c * 9/5 + 32) * 10) / 10;
/** °F → °C */
export const fToC     = (f: number)   => Math.round(((f - 32) * 5/9) * 10) / 10;
/** mg/dL → mmol/L */
export const mgDlToMmol = (mg: number) => Math.round(mg / 18.0182 * 100) / 100;
/** mmol/L → mg/dL */
export const mmolToMgDl = (mmol: number) => Math.round(mmol * 18.0182);
/** km → miles */
export const kmToMilesConv = (km: number) => Math.round(km * 0.621371 * 100) / 100;
/** miles → km */
export const milesToKmConv = (mi: number) => Math.round(mi / 0.621371 * 100) / 100;

/** Format weight: stores in kg, displays in kg or lbs */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit, decimals = 1): string {
  if (kg == null) return '—';
  const val = unit === 'lbs' ? kgToLbs(kg) : kg;
  return `${val.toFixed(decimals)} ${unit}`;
}

/** Format height: stores in cm, displays in cm or ft′in″ */
export function formatHeight(cm: number | null | undefined, unit: HeightUnit): string {
  if (cm == null) return '—';
  if (unit === 'in') {
    const totalIn = cm / 2.54;
    const ft = Math.floor(totalIn / 12);
    const inches = Math.round(totalIn % 12);
    return `${ft}′${inches}″`;
  }
  return `${Math.round(cm)} cm`;
}

/** Format temperature: stores in °C, displays in °C or °F */
export function formatTemp(c: number | null | undefined, unit: TempUnit, decimals = 1): string {
  if (c == null) return '—';
  const val = unit === 'F' ? cToF(c) : c;
  return `${val.toFixed(decimals)} °${unit}`;
}

/** Format glucose: stores in mg/dL, displays in mg/dL or mmol/L */
export function formatGlucose(mgDl: number | null | undefined, unit: GlucoseUnit, decimals?: number): string {
  if (mgDl == null) return '—';
  if (unit === 'mmol/L') {
    const mmol = mgDlToMmol(mgDl);
    return `${mmol.toFixed(decimals ?? 1)} mmol/L`;
  }
  return `${Math.round(mgDl)} mg/dL`;
}

/** Format distance: stores in km, displays in km or mi */
export function formatDistance(km: number | null | undefined, unit: DistanceUnit, decimals = 2): string {
  if (km == null) return '—';
  const val = unit === 'mi' ? kmToMilesConv(km) : km;
  return `${val.toFixed(decimals)} ${unit}`;
}

/** Save glucose unit preference alongside the other unit prefs (backwards-compat) */
export async function saveGlucoseUnitPreference(unit: GlucoseUnit): Promise<void> {
  return saveUnitPreferences({ glucoseUnit: unit });
}
