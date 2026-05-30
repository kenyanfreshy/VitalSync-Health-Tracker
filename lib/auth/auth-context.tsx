/**
 * VitalSync Auth Context
 * Manages app-lock state: setup, lock/unlock, timeout, lockout, change-PIN,
 * emergency contact, and biometric re-enrollment detection.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  loadAuthConfig,
  enableLock,
  disableLock,
  savePin,
  verifyPin,
  setBiometricsEnabled,
  saveLockTimeout,
  getLockoutStatus,
  recordFailedAttempt,
  clearFailedAttempts,
  getEmergencyContact,
  saveEmergencyContact,
  clearEmergencyContact,
  getMedicalID,
  saveMedicalID,
  clearMedicalID,
  getBioReenrollDismissed,
  setBioReenrollDismissed,
  clearBioReenrollDismissed,
  saveLastAuthTime,
  loadLastAuthTime,
  recordRecoveryFailedAttempt,
  clearRecoveryLockout,
  handleFreshInstallIfNeeded,
  getRecoveryLockoutStatus,
  type RecoveryLockoutStatus,
  clearLastAuthTime,
  type AuthConfig,
  type LockTimeout,
  type EmergencyContact,
  type MedicalID,
} from './auth-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiometricType = 'face' | 'fingerprint' | 'none';

interface AuthState {
  isReady: boolean;
  isSetup: boolean;
  isLocked: boolean;
  biometricsEnabled: boolean;
  biometricType: BiometricType;
  biometricsAvailable: boolean;
  lockTimeout: LockTimeout;
  failedAttempts: number;
  isPinLockedOut: boolean;
  lockoutSecondsRemaining: number;
  emergencyContact: EmergencyContact | null;
  medicalId: MedicalID | null;
  /** ISO string of when the app was last locked (for Home tab widget) */
  lastLockedAt: string | null;
  // Forgot-PIN recovery lockout
  isRecoveryLockedOut: boolean;
  recoveryFailedAttempts: number;
  recoveryLockoutSecondsRemaining: number;
}

interface AuthContextValue extends AuthState {
  setupBiometricLock: (pin: string) => Promise<void>;
  setupPinLock: (pin: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  changePin: (currentPin: string, newPin: string) => Promise<boolean>;
  /** Verify identity via biometrics then set a brand-new PIN (Forgot PIN recovery). */
  resetPinWithBiometrics: (newPin: string) => Promise<boolean>;
  removeLock: () => Promise<void>;
  lockApp: () => void;
  setLockTimeout: (timeout: LockTimeout) => Promise<void>;
  updateEmergencyContact: (contact: EmergencyContact | null) => Promise<void>;
  callEmergency: () => void;
  updateMedicalID: (id: MedicalID | null) => Promise<void>;
  /** Record a failed biometric attempt for Forgot-PIN recovery; returns updated lockout status. */
  recordRecoveryFailure: () => Promise<RecoveryLockoutStatus>;
  /** Clear recovery lockout after a successful reset. */
  clearRecoveryLockout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isReady: false,
    isSetup: false,
    isLocked: false,
    biometricsEnabled: false,
    biometricType: 'none',
    biometricsAvailable: false,
    lockTimeout: 0,
    failedAttempts: 0,
    isPinLockedOut: false,
    lockoutSecondsRemaining: 0,
    emergencyContact: null,
    medicalId: null,
    lastLockedAt: null,
    isRecoveryLockedOut: false,
    recoveryFailedAttempts: 0,
    recoveryLockoutSecondsRemaining: 0,
  });

  const backgroundedAt = useRef<number | null>(null);
  // Mutex: prevents concurrent LocalAuthentication.authenticateAsync calls
  const biometricAuthInProgress = useRef(false);

  // ── Detect biometric type ─────────────────────────────────────────────────
  async function detectBiometricType(): Promise<{ available: boolean; type: BiometricType }> {
    if (Platform.OS === 'web') return { available: false, type: 'none' };
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) return { available: false, type: 'none' };
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return { available: false, type: 'none' };
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      return { available: true, type: hasFace ? 'face' : 'fingerprint' };
    } catch (_unused) {
      return { available: false, type: 'none' };
    }
  }

  // ── Check biometric re-enrollment ─────────────────────────────────────────
  async function checkBiometricReenrollment(biometricsEnabled: boolean) {
    if (Platform.OS === 'web' || !biometricsEnabled) return;
    try {
      const dismissed = await getBioReenrollDismissed();
      if (dismissed) return;
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        // Biometrics were enabled but are no longer enrolled
        Alert.alert(
          'Face ID / Touch ID Unavailable',
          'Your biometric data is no longer enrolled on this device. Please re-enroll in iOS Settings → Face ID & Passcode to continue using biometric unlock.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openURL('app-settings:'),
            },
            {
              text: 'Dismiss',
              style: 'cancel',
              onPress: () => setBioReenrollDismissed(),
            },
          ],
        );
      } else {
        // Biometrics are back — clear any dismissed flag
        await clearBioReenrollDismissed();
      }
    } catch (_unused) {
      // Ignore errors in re-enrollment check
    }
  }

  // ── Load config on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // Detect fresh install first (clears stale recovery lockout if needed)
        await handleFreshInstallIfNeeded();
        const [config, bio, lockout, recoveryLockout, emergency, medicalId, lastAuthTs] = await Promise.all([
          loadAuthConfig(),
          detectBiometricType(),
          getLockoutStatus(),
          getRecoveryLockoutStatus(),
          getEmergencyContact(),
          getMedicalID(),
          loadLastAuthTime(),
        ]);
        // Skip re-lock if user authenticated within the last 30 seconds before cold launch
        const SKIP_RELOCK_WINDOW_MS = 30_000;
        const recentlyAuthed = lastAuthTs !== null && (Date.now() - lastAuthTs) < SKIP_RELOCK_WINDOW_MS;
        setState({
          isReady: true,
          isSetup: config.lockEnabled,
          isLocked: config.lockEnabled && !recentlyAuthed,
          biometricsEnabled: config.biometricsEnabled,
          biometricType: bio.type,
          biometricsAvailable: bio.available,
          lockTimeout: config.lockTimeout,
          failedAttempts: lockout.failedAttempts,
          isPinLockedOut: lockout.isLockedOut,
          lockoutSecondsRemaining: lockout.secondsRemaining,
          emergencyContact: emergency,
          medicalId,
          lastLockedAt: config.lockEnabled ? new Date().toISOString() : null,
          isRecoveryLockedOut: recoveryLockout.isLockedOut,
          recoveryFailedAttempts: recoveryLockout.failedAttempts,
          recoveryLockoutSecondsRemaining: recoveryLockout.secondsRemaining,
        });
        // Check re-enrollment after state is set
        if (config.biometricsEnabled) {
          checkBiometricReenrollment(config.biometricsEnabled);
        }
      } catch (e) {
        // If SecureStore fails on first launch (e.g. device not yet unlocked),
        // mark as ready with safe defaults so the app is not stuck on a blank screen.
        console.warn('[VitalSync] AuthProvider init failed — falling back to safe defaults:', e);
        setState((prev) => ({ ...prev, isReady: true }));
      }
    }
    init();
  }, []);

  // ── Lockout countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    if (!state.isPinLockedOut) return;
    const interval = setInterval(() => {
      setState((s) => {
        const next = s.lockoutSecondsRemaining - 1;
        if (next <= 0) {
          clearInterval(interval);
          return { ...s, isPinLockedOut: false, lockoutSecondsRemaining: 0, failedAttempts: 0 };
        }
        return { ...s, lockoutSecondsRemaining: next };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isPinLockedOut]);
  // ── Recovery lockout countdown timer ─────────────────────────────────────
  useEffect(() => {
    if (!state.isRecoveryLockedOut) return;
    const interval = setInterval(() => {
      setState((s) => {
        const next = s.recoveryLockoutSecondsRemaining - 1;
        if (next <= 0) {
          clearInterval(interval);
          return { ...s, isRecoveryLockedOut: false, recoveryLockoutSecondsRemaining: 0, recoveryFailedAttempts: 0 };
        }
        return { ...s, recoveryLockoutSecondsRemaining: next };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isRecoveryLockedOut]);

  // ── Lock when app goes to background, respecting timeout ─────────────────
  // IMPORTANT: On iOS, showing the Face ID sheet briefly sends the app to
  // 'inactive' state. We must NOT re-lock in that case. Two guards prevent this:
  //   1. biometricAuthInProgress.current: skip re-lock while Face ID is showing
  //   2. MIN_BACKGROUND_MS: ignore background events shorter than 2 seconds
  //      (Face ID sheet typically causes < 1s inactive period)
  const MIN_BACKGROUND_MS = 2000;
  useEffect(() => {
    if (!state.isSetup) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // Only record background time if we are NOT in the middle of a biometric prompt.
        // The Face ID sheet causes a brief 'inactive' event — ignore it.
        if (!biometricAuthInProgress.current) {
          backgroundedAt.current = Date.now();
          console.log('[AuthContext] App backgrounded at', backgroundedAt.current);
        } else {
          console.log('[AuthContext] AppState inactive skipped - biometric auth in progress');
        }
      } else if (nextState === 'active' && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        const elapsedSec = elapsed / 1000;
        backgroundedAt.current = null;
        console.log('[AuthContext] App foregrounded, elapsed:', elapsedSec.toFixed(1) + 's');
        // Skip re-lock if:
        //   - background duration was too short (likely a Face ID / system sheet)
        //   - biometric auth is currently in progress
        if (elapsed < MIN_BACKGROUND_MS) {
          console.log('[AuthContext] Re-lock skipped - background too brief (<2s)');
        } else if (biometricAuthInProgress.current) {
          console.log('[AuthContext] Re-lock skipped - biometric auth in progress');
        } else if (elapsedSec >= state.lockTimeout) {
          const lockedAt = new Date().toISOString();
          console.log('[AuthContext] Re-locking app after timeout');
          setState((s) => ({ ...s, isLocked: true, lastLockedAt: lockedAt }));
        }
        // Check biometric re-enrollment each time app comes to foreground
        if (state.biometricsEnabled) {
          checkBiometricReenrollment(state.biometricsEnabled);
        }
      }
    });
    return () => sub.remove();
  }, [state.isSetup, state.lockTimeout, state.biometricsEnabled]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setupBiometricLock = useCallback(async (pin: string) => {
    await savePin(pin);
    await enableLock(true);
    setState((s) => ({ ...s, isSetup: true, isLocked: false, biometricsEnabled: true }));
  }, []);

  const setupPinLock = useCallback(async (pin: string) => {
    await savePin(pin);
    await enableLock(false);
    setState((s) => ({ ...s, isSetup: true, isLocked: false, biometricsEnabled: false }));
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    // Mutex: if a biometric prompt is already showing, skip this call.
    // Prevents OS from stacking multiple Face ID sheets on rapid re-renders.
    if (biometricAuthInProgress.current) {
      console.log('[AuthContext] unlockWithBiometrics skipped - already in progress');
      return false;
    }
    biometricAuthInProgress.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock VitalSync',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        console.log('[AuthContext] Biometric auth success');
        await clearFailedAttempts();
        await saveLastAuthTime();
        setState((s) => ({ ...s, isLocked: false, failedAttempts: 0, isPinLockedOut: false }));
        return true;
      }
      console.log('[AuthContext] Biometric auth failed:', result.error);
      return false;
    } catch (e) {
      console.log('[AuthContext] Biometric auth error:', e);
      return false;
    } finally {
      biometricAuthInProgress.current = false;
    }
  }, []);

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const lockoutStatus = await getLockoutStatus();
    if (lockoutStatus.isLockedOut) {
      setState((s) => ({
        ...s,
        isPinLockedOut: true,
        lockoutSecondsRemaining: lockoutStatus.secondsRemaining,
      }));
      return false;
    }

    const ok = await verifyPin(pin);
    if (ok) {
      await clearFailedAttempts();
      await saveLastAuthTime();
      setState((s) => ({
        ...s,
        isLocked: false,
        failedAttempts: 0,
        isPinLockedOut: false,
        lockoutSecondsRemaining: 0,
      }));
      return true;
    }

    const newLockout = await recordFailedAttempt();
    setState((s) => ({
      ...s,
      failedAttempts: newLockout.failedAttempts,
      isPinLockedOut: newLockout.isLockedOut,
      lockoutSecondsRemaining: newLockout.secondsRemaining,
    }));
    return false;
  }, []);

  const changePin = useCallback(async (currentPin: string, newPin: string): Promise<boolean> => {
    const ok = await verifyPin(currentPin);
    if (!ok) return false;
    await savePin(newPin);
    return true;
  }, []);
  /**
   * Forgot-PIN recovery: re-authenticate with biometrics, then set a new PIN.
   * Returns false if biometrics fail or are unavailable.
   */
  const resetPinWithBiometrics = useCallback(async (newPin: string): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your identity to reset your PIN',
        fallbackLabel: '',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (!result.success) return false;
      await savePin(newPin);
      await clearFailedAttempts();
      await saveLastAuthTime();
      setState((s) => ({
        ...s,
        isLocked: false,
        failedAttempts: 0,
        isPinLockedOut: false,
        lockoutSecondsRemaining: 0,
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const removeLock = useCallback(async () => {
    await disableLock();
    await clearLastAuthTime();
    setState((s) => ({
      ...s,
      isSetup: false,
      isLocked: false,
      biometricsEnabled: false,
      failedAttempts: 0,
      isPinLockedOut: false,
      lockoutSecondsRemaining: 0,
      lastLockedAt: null,
    }));
  }, []);

  const lockApp = useCallback(() => {
    const lockedAt = new Date().toISOString();
    setState((s) => ({ ...s, isLocked: true, lastLockedAt: lockedAt }));
  }, []);

  const setLockTimeout = useCallback(async (timeout: LockTimeout) => {
    await saveLockTimeout(timeout);
    setState((s) => ({ ...s, lockTimeout: timeout }));
  }, []);

  const updateEmergencyContact = useCallback(async (contact: EmergencyContact | null) => {
    if (contact) {
      await saveEmergencyContact(contact);
    } else {
      await clearEmergencyContact();
    }
    setState((s) => ({ ...s, emergencyContact: contact }));
  }, []);

  const callEmergency = useCallback(() => {
    const phone = state.emergencyContact?.phone;
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  }, [state.emergencyContact]);

  const updateMedicalID = useCallback(async (id: MedicalID | null) => {
    if (id) {
      await saveMedicalID(id);
    } else {
      await clearMedicalID();
    }
    setState((s) => ({ ...s, medicalId: id }));
  }, []);

  const recordRecoveryFailure = useCallback(async (): Promise<RecoveryLockoutStatus> => {
    const status = await recordRecoveryFailedAttempt();
    setState((s) => ({
      ...s,
      isRecoveryLockedOut: status.isLockedOut,
      recoveryFailedAttempts: status.failedAttempts,
      recoveryLockoutSecondsRemaining: status.secondsRemaining,
    }));
    return status;
  }, []);

  const clearRecoveryLockoutAction = useCallback(async (): Promise<void> => {
    await clearRecoveryLockout();
    setState((s) => ({
      ...s,
      isRecoveryLockedOut: false,
      recoveryFailedAttempts: 0,
      recoveryLockoutSecondsRemaining: 0,
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        setupBiometricLock,
        setupPinLock,
        unlockWithBiometrics,
        unlockWithPin,
        changePin,
        resetPinWithBiometrics,
        removeLock,
        lockApp,
        setLockTimeout,
        updateEmergencyContact,
        callEmergency,
        updateMedicalID,
        recordRecoveryFailure,
        clearRecoveryLockout: clearRecoveryLockoutAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
