/**
 * Biometric Lock Module
 * Manages the "Require Biometrics" setting and authentication flow.
 * Uses expo-local-authentication for Face ID / Fingerprint / PIN fallback.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { safeSetItem } from '@/lib/safe-async-storage';

const BIOMETRIC_ENABLED_KEY = '@vitalsync/biometric_enabled';

// ─── Storage helpers ──────────────────────────────────────────────────────────

export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  } catch (_unused) {
    return false;
  }
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await safeSetItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

// ─── Device capability check ──────────────────────────────────────────────────

export interface BiometricCapability {
  available: boolean;
  biometricType: 'faceId' | 'fingerprint' | 'iris' | 'none';
  enrolledLevel: 'none' | 'weak' | 'strong';
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === 'web') {
    return { available: false, biometricType: 'none', enrolledLevel: 'none' };
  }

  try {
    // Dynamic import to avoid web crashes
    const LocalAuth = await import('expo-local-authentication');

    const hasHardware = await LocalAuth.hasHardwareAsync();
    if (!hasHardware) {
      return { available: false, biometricType: 'none', enrolledLevel: 'none' };
    }

    const isEnrolled = await LocalAuth.isEnrolledAsync();
    if (!isEnrolled) {
      return { available: false, biometricType: 'none', enrolledLevel: 'none' };
    }

    const supportedTypes = await LocalAuth.supportedAuthenticationTypesAsync();
    const SecurityLevel = LocalAuth.SecurityLevel;
    const AuthType = LocalAuth.AuthenticationType;

    let biometricType: BiometricCapability['biometricType'] = 'fingerprint';
    if (supportedTypes.includes(AuthType.FACIAL_RECOGNITION)) {
      biometricType = 'faceId';
    } else if (supportedTypes.includes(AuthType.IRIS)) {
      biometricType = 'iris';
    }

    const level = await LocalAuth.getEnrolledLevelAsync();
    const enrolledLevel: BiometricCapability['enrolledLevel'] =
      level === SecurityLevel.SECRET ? 'strong' :
      level === SecurityLevel.BIOMETRIC_WEAK ? 'weak' : 'none';

    return { available: true, biometricType, enrolledLevel };
  } catch (_unused) {
    return { available: false, biometricType: 'none', enrolledLevel: 'none' };
  }
}

// ─── Authentication prompt ────────────────────────────────────────────────────

export interface AuthResult {
  success: boolean;
  error?: string;
}

export async function authenticateWithBiometrics(
  reason = 'Authenticate to access VitalSync'
): Promise<AuthResult> {
  if (Platform.OS === 'web') {
    // Web: biometrics not available, auto-pass
    return { success: true };
  }

  try {
    const LocalAuth = await import('expo-local-authentication');

    const result = await LocalAuth.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    const errorMsg =
      result.error === 'user_cancel' ? 'Authentication cancelled.' :
      result.error === 'user_fallback' ? 'Fallback selected.' :
      result.error === 'lockout' ? 'Too many failed attempts. Try again later.' :
      'Authentication failed.';

    return { success: false, error: errorMsg };
  } catch (_err) {
    return { success: false, error: 'Biometric authentication unavailable.' };
  }
}
