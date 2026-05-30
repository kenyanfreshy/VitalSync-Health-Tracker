/**
 * App Lock Screen
 * Full-screen overlay shown whenever the app is locked.
 * Features:
 * - 6-digit PIN pad unlock
 * - Failed attempt counter (shows remaining attempts)
 * - 30-second lockout after 5 wrong PINs, with countdown + Emergency SOS
 * - Medical ID card always visible (blood type, allergies, conditions)
 * - Emergency Contact call button always visible at bottom
 */
import React, { useCallback, useEffect, useState } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth/auth-context';
import { MAX_FAILED_ATTEMPTS } from '@/lib/auth/auth-storage';

const PIN_LENGTH = 6;

// ─── Styles ───────────────────────────────────────────────────────────────────

const lockStyles = StyleSheet.create({
  // Scroll container
  overlayScroll: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  overlayContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  // App identity section
  top: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  // Medical ID card
  medCard: {
    width: '100%',
    // Background raised from 0.07 → 0.13 for WCAG AA contrast compliance
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  medCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  medCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B30',
    letterSpacing: 1.2,
  },
  medRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  medLabel: {
    fontSize: 12,
    // Raised from 0.5 → 0.65 for WCAG AA 4.5:1 contrast on dark background
    color: 'rgba(255,255,255,0.65)',
    width: 90,
    flexShrink: 0,
  },
  medValue: {
    fontSize: 12,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 17,
  },
  // Biometrics section
  bioSection: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  bioBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  usePinLink: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'underline',
  },
  // PIN section
  pinSection: {
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  pinPrompt: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  attemptsWarning: {
    fontSize: 13,
    color: '#FF6B6B',
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  switchText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  // Lockout state
  lockoutIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,59,48,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  lockoutTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  lockoutSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  lockoutCountdown: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 8,
  },
  sosText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // PIN dots
  pinDots: {
    flexDirection: 'row',
    gap: 14,
    marginVertical: 8,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  // PIN pad
  pinPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 264,
    gap: 12,
    justifyContent: 'center',
    marginTop: 4,
  },
  pinKey: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinKeyEmpty: {
    width: 80,
    height: 80,
  },
  pinKeyText: {
    fontSize: 26,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  // Forgot PIN link
  forgotPinLink: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'underline',
  },
  // Row that holds 'Use Face ID' + 'Forgot PIN?' side by side
  pinFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
  },
  // Emergency contact button
  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: 'rgba(255,59,48,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  emergencyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
});

// ─── PIN Dots ─────────────────────────────────────────────────────────────────

function PinDots({ value, error }: { value: string; error: boolean }) {
  return (
    <View style={lockStyles.pinDots}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            lockStyles.pinDot,
            {
              backgroundColor: i < value.length
                ? (error ? '#FF6B6B' : '#FFFFFF')
                : 'transparent',
              borderColor: i < value.length
                ? (error ? '#FF6B6B' : '#FFFFFF')
                : 'rgba(255,255,255,0.35)',
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── PIN Pad ──────────────────────────────────────────────────────────────────

function PinPad({
  onPress,
  onDelete,
  disabled,
}: {
  onPress: (d: string) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={lockStyles.pinPad}>
      {keys.map((key, i) => {
        if (key === '') return <View key={i} style={lockStyles.pinKeyEmpty} />;
        const isDelete = key === '⌫';
        return (
          <Pressable
            key={key}
            style={({ pressed }) => [
              lockStyles.pinKey,
              {
                backgroundColor: pressed && !disabled
                  ? 'rgba(255,255,255,0.28)'
                  : 'rgba(255,255,255,0.12)',
                opacity: disabled ? 0.35 : 1,
              },
            ]}
            onPress={() => {
              if (disabled) return;
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (isDelete) onDelete();
              else onPress(key);
            }}
            disabled={disabled}
          >
            <Text style={[lockStyles.pinKeyText, isDelete && { fontSize: 22 }]}>{key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Medical ID Card ──────────────────────────────────────────────────────────

function MedicalIDCard({ medicalId }: { medicalId: NonNullable<ReturnType<typeof useAuth>['medicalId']> }) {
  const rows: { label: string; value: string }[] = [];

  if (medicalId.bloodType && medicalId.bloodType !== 'Unknown') {
    rows.push({ label: 'Blood', value: medicalId.bloodType });
  }
  if (medicalId.allergies) {
    rows.push({ label: 'Allergies', value: medicalId.allergies });
  }
  if (medicalId.conditions) {
    rows.push({ label: 'Conditions', value: medicalId.conditions });
  }
  if (medicalId.medications) {
    rows.push({ label: 'Medications', value: medicalId.medications });
  }
  if (medicalId.organDonor) {
    rows.push({ label: 'Organ Donor', value: 'Yes' });
  }
  if (medicalId.notes) {
    rows.push({ label: 'Notes', value: medicalId.notes });
  }

  if (rows.length === 0) return null;

  return (
    <View style={lockStyles.medCard}>
      <View style={lockStyles.medCardHeader}>
        <IconSymbol name="cross.fill" size={12} color="#FF3B30" />
        <Text style={lockStyles.medCardTitle}>MEDICAL ID</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={lockStyles.medRow}>
          <Text style={lockStyles.medLabel}>{row.label}</Text>
          <Text style={lockStyles.medValue} numberOfLines={2}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Lock Screen ──────────────────────────────────────────────────────────────

export function AppLockScreen() {
  const {
    unlockWithPin,
    failedAttempts,
    isPinLockedOut,
    lockoutSecondsRemaining,
    emergencyContact,
    callEmergency,
    medicalId,
    isRecoveryLockedOut: _isRecoveryLockedOut,
    recoveryFailedAttempts: _recoveryFailedAttempts,
    recoveryLockoutSecondsRemaining: _recoveryLockoutSecondsRemaining,
    recordRecoveryFailure: _recordRecoveryFailure,
    clearRecoveryLockout,
  } = useAuth();

  const [pin, setPin] = useState('');
  const [_showPin, _setShowPin] = useState(false);
  const [hasError, setHasError] = useState(false);
  // ── Forgot PIN recovery state ────────────────────────────────────────
  // 'idle' → 'new_pin' (entering new PIN) → 'confirm_pin' (confirming)
  type RecoveryStep = 'idle' | 'new_pin' | 'confirm_pin';
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('idle');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryError, setRecoveryError] = useState(false);
    // PIN-only lock — no automatic biometric prompts
  const tagline = 'Enter your PIN to continue';
  const attemptsLeft = MAX_FAILED_ATTEMPTS - failedAttempts;
  // ── Fade-out on unlock ───────────────────────────────────────────────
  const fadeOpacity = useSharedValue(1);
  const animatedContainerStyle = useAnimatedStyle(() => ({ opacity: fadeOpacity.value }));
  const fadeOutAndUnlock = useCallback(() => {
    fadeOpacity.value = withTiming(0, { duration: 280 });
  }, [fadeOpacity]);





  // Clear error highlight after a short delay
  useEffect(() => {
    if (!hasError) return;
    const t = setTimeout(() => { setHasError(false); setPin(''); }, 600);
    return () => clearTimeout(t);
  }, [hasError]);

  const handleDigit = useCallback(async (digit: string) => {
    if (isPinLockedOut) return;
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      const ok = await unlockWithPin(next);
      if (ok) {
        fadeOutAndUnlock();
      } else {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setHasError(true);
      }
    }
  }, [pin, unlockWithPin, isPinLockedOut, fadeOutAndUnlock]);

  const handleDelete = useCallback(() => {
    if (isPinLockedOut) return;
    if (recoveryStep === 'new_pin') {
      setRecoveryPin((p) => p.slice(0, -1));
      return;
    }
    if (recoveryStep === 'confirm_pin') {
      setRecoveryConfirm((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => p.slice(0, -1));
  }, [isPinLockedOut, recoveryStep]);

  const handleForgotPin = useCallback(() => {
    Alert.alert(
      'Forgot PIN',
      'To reset your PIN, go to your device Settings → General → iPhone Storage → VitalSync → Delete App, then reinstall. Your health data is stored locally and will be cleared.',
      [{ text: 'OK' }],
    );
  }, []);

  const handleRecoveryDigit = useCallback(async (digit: string) => {
    if (recoveryStep === 'new_pin') {
      const next = (recoveryPin + digit).slice(0, PIN_LENGTH);
      setRecoveryPin(next);
      if (next.length === PIN_LENGTH) {
        // Move to confirm step
        setRecoveryConfirm('');
        setRecoveryStep('confirm_pin');
      }
    } else if (recoveryStep === 'confirm_pin') {
      const next = (recoveryConfirm + digit).slice(0, PIN_LENGTH);
      setRecoveryConfirm(next);
      if (next.length === PIN_LENGTH) {
        if (next !== recoveryPin) {
          // PINs don't match — shake and restart confirm step
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setRecoveryError(true);
          setTimeout(() => {
            setRecoveryError(false);
            setRecoveryConfirm('');
            setRecoveryStep('confirm_pin');
          }, 600);
          return;
        }
        // PINs match — save and unlock
        const ok = false; // PIN recovery requires app reinstall
        if (ok) {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await clearRecoveryLockout();
          setRecoveryStep('idle');
          fadeOutAndUnlock();
        } else {
          Alert.alert('Reset Failed', 'Could not reset your PIN. Please try again.');
          setRecoveryStep('idle');
        }
      }
    }
  }, [recoveryStep, recoveryPin, recoveryConfirm, clearRecoveryLockout, fadeOutAndUnlock]);

  const hasMedicalId = medicalId && (
    (medicalId.bloodType && medicalId.bloodType !== 'Unknown') ||
    medicalId.allergies ||
    medicalId.conditions ||
    medicalId.medications ||
    medicalId.organDonor ||
    medicalId.notes
  );

  return (
    <Animated.View style={[{ flex: 1 }, animatedContainerStyle]}>
    <ScrollView
      style={lockStyles.overlayScroll}
      contentContainerStyle={lockStyles.overlayContent}
      scrollEnabled={hasMedicalId ? true : false}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="light-content" />

      {/* App identity */}
      <View style={lockStyles.top}>
        <View style={lockStyles.appIcon}>
          <IconSymbol name="lock.fill" size={32} color="#FFFFFF" />
        </View>
        <Text style={lockStyles.appName}>VitalSync</Text>
        <Text style={lockStyles.tagline}>{tagline}</Text>
      </View>

      {/* Medical ID card — always visible */}
      {hasMedicalId && medicalId && (
        <MedicalIDCard medicalId={medicalId} />
      )}



      {/* Recovery flow — shown when user taps Forgot PIN */}
      {recoveryStep !== 'idle' && (
        <View style={lockStyles.pinSection}>
          <Text style={lockStyles.pinPrompt}>
            {recoveryStep === 'new_pin' ? 'Enter a new PIN' : 'Confirm your new PIN'}
          </Text>
          {recoveryStep === 'confirm_pin' && recoveryError && (
            <Text style={lockStyles.attemptsWarning}>PINs don’t match — try again</Text>
          )}
          <PinDots
            value={recoveryStep === 'new_pin' ? recoveryPin : recoveryConfirm}
            error={recoveryError}
          />
          <PinPad onPress={handleRecoveryDigit} onDelete={handleDelete} disabled={false} />
          <Pressable
            style={lockStyles.switchBtn}
            onPress={() => { setRecoveryStep('idle'); setRecoveryPin(''); setRecoveryConfirm(''); }}
          >
            <Text style={lockStyles.switchText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* PIN pad */}
      {recoveryStep === 'idle' && (
        <View style={lockStyles.pinSection}>
          {isPinLockedOut ? (
            <>
              <View style={lockStyles.lockoutIcon}>
                <Text style={{ fontSize: 36 }}>🔒</Text>
              </View>
              <Text style={lockStyles.lockoutTitle}>Too Many Attempts</Text>
              <Text style={lockStyles.lockoutSubtitle}>Try again in</Text>
              <Text style={lockStyles.lockoutCountdown}>{lockoutSecondsRemaining}s</Text>

              {/* Emergency SOS — shown during lockout */}
              {emergencyContact && (
                <Pressable
                  style={({ pressed }) => [lockStyles.sosBtn, { opacity: pressed ? 0.75 : 1 }]}
                  onPress={callEmergency}
                >
                  <IconSymbol name="phone.fill" size={16} color="#FFFFFF" />
                  <Text style={lockStyles.sosText}>Emergency SOS — Call {emergencyContact.name}</Text>
                </Pressable>
              )}



              <PinDots value="" error={false} />
              <PinPad onPress={handleDigit} onDelete={handleDelete} disabled={true} />
            </>
          ) : (
            <>
              <Text style={lockStyles.pinPrompt}>Enter your PIN</Text>

              {failedAttempts > 0 && attemptsLeft > 0 && (
                <Text style={lockStyles.attemptsWarning}>
                  {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                </Text>
              )}

              <PinDots value={pin} error={hasError} />

              <PinPad onPress={handleDigit} onDelete={handleDelete} disabled={false} />

              <View style={lockStyles.pinFooterRow}>
                <Pressable
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  onPress={handleForgotPin}
                >
                  <Text style={lockStyles.forgotPinLink}>Forgot PIN?</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}

      {/* Emergency Contact button — always visible at bottom */}
      {emergencyContact && !isPinLockedOut && (
        <Pressable
          style={({ pressed }) => [lockStyles.emergencyBtn, { opacity: pressed ? 0.75 : 1 }]}
          onPress={callEmergency}
        >
          <IconSymbol name="phone.fill" size={16} color="#FFFFFF" />
          <Text style={lockStyles.emergencyText}>
            Call {emergencyContact.name}
          </Text>
        </Pressable>
      )}
    </ScrollView>
    </Animated.View>
  );
}