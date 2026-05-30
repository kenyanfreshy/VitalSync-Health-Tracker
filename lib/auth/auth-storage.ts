/**
 * VitalSync Auth Storage
 * Stores app-lock credentials securely using expo-secure-store.
 * PIN is stored as a SHA-256 hex hash — never in plain text.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { Platform } from 'react-native';

const KEYS = {
  PIN_HASH: 'vitalsync_pin_hash',
  BIOMETRICS_ENABLED: 'vitalsync_biometrics_enabled',
  LOCK_ENABLED: 'vitalsync_lock_enabled',
  LOCK_TIMEOUT: 'vitalsync_lock_timeout',   // seconds; 0 = immediate
  LOCKOUT_UNTIL: 'vitalsync_lockout_until', // ISO timestamp when lockout expires
  FAILED_ATTEMPTS: 'vitalsync_failed_attempts',
  EMERGENCY_NAME: 'vitalsync_emergency_name',
  EMERGENCY_PHONE: 'vitalsync_emergency_phone',
  BIO_REENROLL_DISMISSED: 'vitalsync_bio_reenroll_dismissed',
  MEDICAL_ID: 'vitalsync_medical_id', // JSON blob
  LAST_AUTH_TIME: 'vitalsync_last_auth_time', // ISO timestamp of last successful auth
  // Forgot-PIN recovery lockout (separate from PIN entry lockout)
  RECOVERY_FAILED_ATTEMPTS: 'vitalsync_recovery_failed_attempts',
  RECOVERY_LOCKOUT_UNTIL: 'vitalsync_recovery_lockout_until', // ISO timestamp
  // Install-ID stored in AsyncStorage (cleared on reinstall; SecureStore persists across reinstalls)
  INSTALL_ID: '@vsht:install_id',
};

// ─── SHA-256 hash ─────────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for environments without Web Crypto
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── SecureStore web fallback ─────────────────────────────────────────────────
const memStore: Record<string, string> = {};

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memStore[key] ?? null;
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { memStore[key] = value; return; }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') { delete memStore[key]; return; }
  await SecureStore.deleteItemAsync(key);
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Timeout options in seconds. 0 = lock immediately when backgrounded. */
export type LockTimeout = 0 | 60 | 300 | 900;

export const LOCK_TIMEOUT_OPTIONS: { label: string; value: LockTimeout }[] = [
  { label: 'Immediately', value: 0 },
  { label: 'After 1 minute', value: 60 },
  { label: 'After 5 minutes', value: 300 },
  { label: 'After 15 minutes', value: 900 },
];

export interface AuthConfig {
  lockEnabled: boolean;
  biometricsEnabled: boolean;
  hasPinSet: boolean;
  lockTimeout: LockTimeout;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function loadAuthConfig(): Promise<AuthConfig> {
  const [lockEnabled, biometricsEnabled, pinHash, lockTimeout] = await Promise.all([
    secureGet(KEYS.LOCK_ENABLED),
    secureGet(KEYS.BIOMETRICS_ENABLED),
    secureGet(KEYS.PIN_HASH),
    secureGet(KEYS.LOCK_TIMEOUT),
  ]);
  return {
    lockEnabled: lockEnabled === 'true',
    biometricsEnabled: biometricsEnabled === 'true',
    hasPinSet: !!pinHash,
    lockTimeout: lockTimeout ? (parseInt(lockTimeout, 10) as LockTimeout) : 0,
  };
}

export async function enableLock(useBiometrics: boolean): Promise<void> {
  await secureSet(KEYS.LOCK_ENABLED, 'true');
  await secureSet(KEYS.BIOMETRICS_ENABLED, useBiometrics ? 'true' : 'false');
}

export async function disableLock(): Promise<void> {
  await Promise.all([
    secureDelete(KEYS.LOCK_ENABLED),
    secureDelete(KEYS.BIOMETRICS_ENABLED),
    secureDelete(KEYS.PIN_HASH),
    secureDelete(KEYS.LOCK_TIMEOUT),
    secureDelete(KEYS.LOCKOUT_UNTIL),
    secureDelete(KEYS.FAILED_ATTEMPTS),
  ]);
}

export async function saveLockTimeout(timeout: LockTimeout): Promise<void> {
  await secureSet(KEYS.LOCK_TIMEOUT, String(timeout));
}

export async function savePin(pin: string): Promise<void> {
  const hash = await sha256(pin);
  await secureSet(KEYS.PIN_HASH, hash);
  // Reset lockout on PIN change
  await secureDelete(KEYS.LOCKOUT_UNTIL);
  await secureDelete(KEYS.FAILED_ATTEMPTS);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await secureGet(KEYS.PIN_HASH);
  if (!stored) return false;
  const hash = await sha256(pin);
  return hash === stored;
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await secureSet(KEYS.BIOMETRICS_ENABLED, enabled ? 'true' : 'false');
}

// ─── Lockout tracking ─────────────────────────────────────────────────────────

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_SECONDS = 30;

export interface LockoutStatus {
  isLockedOut: boolean;
  /** Seconds remaining in lockout (0 if not locked out) */
  secondsRemaining: number;
  failedAttempts: number;
}

export async function getLockoutStatus(): Promise<LockoutStatus> {
  const [lockoutUntil, failedStr] = await Promise.all([
    secureGet(KEYS.LOCKOUT_UNTIL),
    secureGet(KEYS.FAILED_ATTEMPTS),
  ]);
  const failedAttempts = failedStr ? parseInt(failedStr, 10) : 0;
  if (!lockoutUntil) return { isLockedOut: false, secondsRemaining: 0, failedAttempts };
  const until = new Date(lockoutUntil).getTime();
  const now = Date.now();
  if (now >= until) {
    // Lockout expired — clear it
    await secureDelete(KEYS.LOCKOUT_UNTIL);
    return { isLockedOut: false, secondsRemaining: 0, failedAttempts };
  }
  return {
    isLockedOut: true,
    secondsRemaining: Math.ceil((until - now) / 1000),
    failedAttempts,
  };
}

export async function recordFailedAttempt(): Promise<LockoutStatus> {
  const current = await secureGet(KEYS.FAILED_ATTEMPTS);
  const attempts = (current ? parseInt(current, 10) : 0) + 1;
  await secureSet(KEYS.FAILED_ATTEMPTS, String(attempts));
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_DURATION_SECONDS * 1000).toISOString();
    await secureSet(KEYS.LOCKOUT_UNTIL, until);
    return {
      isLockedOut: true,
      secondsRemaining: LOCKOUT_DURATION_SECONDS,
      failedAttempts: attempts,
    };
  }
  return { isLockedOut: false, secondsRemaining: 0, failedAttempts: attempts };
}

export async function clearFailedAttempts(): Promise<void> {
  await secureDelete(KEYS.FAILED_ATTEMPTS);
  await secureDelete(KEYS.LOCKOUT_UNTIL);
}

// ─── Emergency Contact ────────────────────────────────────────────────────────

export interface EmergencyContact {
  name: string;
  phone: string;
}

export async function getEmergencyContact(): Promise<EmergencyContact | null> {
  const [name, phone] = await Promise.all([
    secureGet(KEYS.EMERGENCY_NAME),
    secureGet(KEYS.EMERGENCY_PHONE),
  ]);
  if (!name && !phone) return null;
  return { name: name ?? '', phone: phone ?? '' };
}

export async function saveEmergencyContact(contact: EmergencyContact): Promise<void> {
  await Promise.all([
    secureSet(KEYS.EMERGENCY_NAME, contact.name),
    secureSet(KEYS.EMERGENCY_PHONE, contact.phone),
  ]);
}

export async function clearEmergencyContact(): Promise<void> {
  await Promise.all([
    secureDelete(KEYS.EMERGENCY_NAME),
    secureDelete(KEYS.EMERGENCY_PHONE),
  ]);
}

// ─── Medical ID ──────────────────────────────────────────────────────────────

export interface MedicalID {
  bloodType: string;        // e.g. 'A+', 'O-', 'Unknown'
  allergies: string;        // free text, comma-separated
  conditions: string;       // free text, comma-separated
  medications: string;      // free text summary (separate from tracker)
  organDonor: boolean;
  notes: string;            // any extra info for first responders
}

export const BLOOD_TYPE_OPTIONS = [
  'Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
];

export async function getMedicalID(): Promise<MedicalID | null> {
  const raw = await secureGet(KEYS.MEDICAL_ID);
  if (!raw) return null;
  try { return JSON.parse(raw) as MedicalID; } catch (_unused) { return null; }
}

export async function saveMedicalID(id: MedicalID): Promise<void> {
  await secureSet(KEYS.MEDICAL_ID, JSON.stringify(id));
}

export async function clearMedicalID(): Promise<void> {
  await secureDelete(KEYS.MEDICAL_ID);
}

// ─── Biometric re-enrollment dismissed flag ───────────────────────────────────

export async function getBioReenrollDismissed(): Promise<boolean> {
  const val = await secureGet(KEYS.BIO_REENROLL_DISMISSED);
  return val === 'true';
}

export async function setBioReenrollDismissed(): Promise<void> {
  await secureSet(KEYS.BIO_REENROLL_DISMISSED, 'true');
}

export async function clearBioReenrollDismissed(): Promise<void> {
  await secureDelete(KEYS.BIO_REENROLL_DISMISSED);
}

// ─── Last auth time ───────────────────────────────────────────────────────────

/** Save the current timestamp as the last successful auth time. */
export async function saveLastAuthTime(): Promise<void> {
  await secureSet(KEYS.LAST_AUTH_TIME, new Date().toISOString());
}

/** Load the last successful auth time in ms. Returns null if never authenticated. */
export async function loadLastAuthTime(): Promise<number | null> {
  const val = await secureGet(KEYS.LAST_AUTH_TIME);
  if (!val) return null;
  const ts = new Date(val).getTime();
  return isNaN(ts) ? null : ts;
}

/** Clear the last auth time (called on lock removal). */
export async function clearLastAuthTime(): Promise<void> {
  await secureDelete(KEYS.LAST_AUTH_TIME);
}

// ─── Forgot-PIN recovery lockout ─────────────────────────────────────────────

export const MAX_RECOVERY_ATTEMPTS = 3;
export const RECOVERY_LOCKOUT_DURATION_SECONDS = 600; // 10 minutes

export interface RecoveryLockoutStatus {
  isLockedOut: boolean;
  failedAttempts: number;
  secondsRemaining: number;
}

export async function getRecoveryLockoutStatus(): Promise<RecoveryLockoutStatus> {
  const [attemptsStr, lockoutUntilStr] = await Promise.all([
    secureGet(KEYS.RECOVERY_FAILED_ATTEMPTS),
    secureGet(KEYS.RECOVERY_LOCKOUT_UNTIL),
  ]);
  const failedAttempts = parseInt(attemptsStr ?? '0', 10) || 0;
  if (lockoutUntilStr) {
    const lockoutUntil = new Date(lockoutUntilStr).getTime();
    const now = Date.now();
    if (now < lockoutUntil) {
      return {
        isLockedOut: true,
        failedAttempts,
        secondsRemaining: Math.ceil((lockoutUntil - now) / 1000),
      };
    }
    // Lockout expired — clear it
    await Promise.all([
      secureDelete(KEYS.RECOVERY_FAILED_ATTEMPTS),
      secureDelete(KEYS.RECOVERY_LOCKOUT_UNTIL),
    ]);
    return { isLockedOut: false, failedAttempts: 0, secondsRemaining: 0 };
  }
  return { isLockedOut: false, failedAttempts, secondsRemaining: 0 };
}

export async function recordRecoveryFailedAttempt(): Promise<RecoveryLockoutStatus> {
  const current = await getRecoveryLockoutStatus();
  if (current.isLockedOut) return current;
  const newCount = current.failedAttempts + 1;
  await secureSet(KEYS.RECOVERY_FAILED_ATTEMPTS, String(newCount));
  if (newCount >= MAX_RECOVERY_ATTEMPTS) {
    const lockoutUntil = new Date(
      Date.now() + RECOVERY_LOCKOUT_DURATION_SECONDS * 1000
    ).toISOString();
    await secureSet(KEYS.RECOVERY_LOCKOUT_UNTIL, lockoutUntil);
    return {
      isLockedOut: true,
      failedAttempts: newCount,
      secondsRemaining: RECOVERY_LOCKOUT_DURATION_SECONDS,
    };
  }
  return { isLockedOut: false, failedAttempts: newCount, secondsRemaining: 0 };
}

export async function clearRecoveryLockout(): Promise<void> {
  await Promise.all([
    secureDelete(KEYS.RECOVERY_FAILED_ATTEMPTS),
    secureDelete(KEYS.RECOVERY_LOCKOUT_UNTIL),
  ]);
}

// ─── First-launch / reinstall detection ──────────────────────────────────────
//
// Strategy: on every cold start, compare a UUID stored in AsyncStorage (which
// IS cleared on iOS app reinstall) against a flag stored in SecureStore (which
// PERSISTS across reinstalls on iOS).  If AsyncStorage has no ID, this is a
// fresh install — clear any stale SecureStore recovery lockout data so the user
// is never permanently locked out after reinstalling.

const INSTALL_ID_KEY = KEYS.INSTALL_ID;
const SECURE_INSTALL_ID_KEY = 'vitalsync_secure_install_id';

function generateUUID(): string {
  // Simple RFC-4122 v4 UUID without crypto dependency
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Call once at app startup (before auth config loads).
 * Detects a fresh install by comparing AsyncStorage vs SecureStore install IDs.
 * On a fresh install, clears stale recovery lockout data from SecureStore.
 */
export async function handleFreshInstallIfNeeded(): Promise<void> {
  try {
    // AsyncStorage is wiped on iOS reinstall; SecureStore is not
    const asyncId = await AsyncStorage.getItem(INSTALL_ID_KEY);
    const secureId = await secureGet(SECURE_INSTALL_ID_KEY);

    if (!asyncId) {
      // No AsyncStorage ID → fresh install (or first ever launch)
      const newId = generateUUID();
      await safeSetItem(INSTALL_ID_KEY, newId);
      await secureSet(SECURE_INSTALL_ID_KEY, newId);
      // Clear any stale recovery lockout left from a previous install
      await clearRecoveryLockout();
    } else if (asyncId !== secureId) {
      // IDs diverged (shouldn't normally happen, but heal gracefully)
      await secureSet(SECURE_INSTALL_ID_KEY, asyncId);
      await clearRecoveryLockout();
    }
    // IDs match → normal launch, nothing to do
  } catch {
    // Non-fatal: if storage is unavailable, proceed normally
  }
}
