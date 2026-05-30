/**
 * BiometricLockScreen
 * Full-screen lock overlay shown when biometric protection is enabled.
 * Automatically triggers the authentication prompt on mount.
 * Shows a manual "Unlock" button for re-triggering after cancellation.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import {
  authenticateWithBiometrics,
  getBiometricCapability,
  type BiometricCapability,
} from '@/lib/biometric/biometric-lock';

interface BiometricLockScreenProps {
  onUnlocked: () => void;
}

export function BiometricLockScreen({ onUnlocked }: BiometricLockScreenProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const triggerAuth = useCallback(async () => {
    setIsAuthenticating(true);
    setErrorMessage(null);

    const result = await authenticateWithBiometrics('Unlock VitalSync to access your health data');

    setIsAuthenticating(false);

    if (result.success) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onUnlocked();
    } else {
      setErrorMessage(result.error ?? 'Authentication failed. Tap to try again.');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [onUnlocked]);

  useEffect(() => {
    // Haptic feedback when lock screen appears
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    getBiometricCapability()
      .then((cap) => {
        setCapability(cap);
        // Auto-trigger on mount
        triggerAuth();
      })
      .catch((e) => {
        console.warn('[VitalSync] getBiometricCapability failed:', e);
        // Fall back to manual unlock button
        setCapability({ available: false, biometricType: 'none', enrolledLevel: 'none' });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconName =
    capability?.biometricType === 'faceId' ? 'faceid' :
    capability?.biometricType === 'fingerprint' ? 'touchid' :
    'lock.fill';

  const biometricLabel =
    capability?.biometricType === 'faceId' ? 'Face ID' :
    capability?.biometricType === 'fingerprint' ? 'Touch ID' :
    'Biometrics';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? '#0A0A0F' : '#FBFBFB' },
      ]}
    >
      {/* App name */}
      <Text style={[styles.appName, { color: colors.foreground }]}>VitalSync</Text>
      <Text style={[styles.tagline, { color: colors.muted }]}>Your health data is protected</Text>

      {/* Lock icon */}
      <View
        style={[
          styles.iconRing,
          {
            backgroundColor: colors.primary + (isDark ? '22' : '12'),
            borderColor: colors.primary + (isDark ? '40' : '25'),
          },
        ]}
      >
        <IconSymbol
          name={iconName as any}
          size={44}
          color={colors.primary}
        />
      </View>

      {/* Status text */}
      {isAuthenticating ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.statusText, { color: colors.muted }]}>
            Waiting for {biometricLabel}…
          </Text>
        </View>
      ) : errorMessage ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
      ) : null}

      {/* Unlock button */}
      {!isAuthenticating && (
        <Pressable
          style={({ pressed }) => [
            styles.unlockButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: pressed ? 0 : 0.3,
              shadowRadius: 10,
              elevation: pressed ? 0 : 6,
              transform: [{ translateY: pressed ? 2 : 0 }],
            },
          ]}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            triggerAuth();
          }}
        >
          <IconSymbol name={iconName as any} size={18} color="#FFFFFF" />
          <Text style={styles.unlockButtonText}>
            Unlock with {biometricLabel}
          </Text>
        </Pressable>
      )}

      {/* Privacy note */}
      <View style={[styles.privacyNote, { borderColor: colors.border }]}>
        <IconSymbol name="shield.fill" size={12} color={colors.bpGreen} />
        <Text style={[styles.privacyText, { color: colors.muted }]}>
          All health data is stored locally on this device
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 32,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: -8,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 16,
  },
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 8,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  privacyText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
