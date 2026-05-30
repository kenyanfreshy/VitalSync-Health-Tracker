/**
 * App Lock Setup Screen — PIN Only
 *
 * Sets up a 6-digit PIN to protect the app.
 * Biometric unlock is not offered here; Face ID is handled at the device/OS level.
 */
import React, { useState, useCallback } from 'react';
import { appendConfigAuditEntry } from '@/lib/config-audit-log';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useAuth } from '@/lib/auth/auth-context';

type Step = 'enter-pin' | 'confirm-pin';
const PIN_LENGTH = 6;

// ─── PIN Dots ─────────────────────────────────────────────────────────────────
function PinDots({ value, length }: { value: string; length: number }) {
  const colors = useColors();
  return (
    <View style={styles.pinDots}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pinDot,
            {
              backgroundColor: i < value.length ? colors.primary : 'transparent',
              borderColor: i < value.length ? colors.primary : colors.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── PIN Pad ──────────────────────────────────────────────────────────────────
function PinPad({ onPress, onDelete }: { onPress: (d: string) => void; onDelete: () => void }) {
  const colors = useColors();
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={styles.pinPad}>
      {keys.map((key, i) => {
        if (key === '') return <View key={i} style={styles.pinKeyEmpty} />;
        const isDelete = key === '⌫';
        return (
          <Pressable
            key={key}
            style={({ pressed }) => [
              styles.pinKey,
              {
                backgroundColor: pressed ? colors.primary + '22' : colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (isDelete) onDelete();
              else onPress(key);
            }}
          >
            <Text style={[styles.pinKeyText, { color: isDelete ? colors.muted : colors.foreground }]}>
              {key}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SetupLockScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setupPinLock } = useAuth();
  const [step, setStep] = useState<Step>('enter-pin');
  const [pin, setPin] = useState('');
  const [confirmedPin, setConfirmedPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePinDigit = useCallback((digit: string) => {
    setError('');
    if (step === 'enter-pin') {
      const next = (pin + digit).slice(0, PIN_LENGTH);
      setPin(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => setStep('confirm-pin'), 150);
      }
    } else if (step === 'confirm-pin') {
      const next = (confirmedPin + digit).slice(0, PIN_LENGTH);
      setConfirmedPin(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handleConfirm(next), 150);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pin, confirmedPin]);

  const handleDelete = useCallback(() => {
    setError('');
    if (step === 'enter-pin') setPin((p) => p.slice(0, -1));
    else if (step === 'confirm-pin') setConfirmedPin((p) => p.slice(0, -1));
  }, [step]);

  const handleConfirm = async (confirmValue: string) => {
    if (confirmValue !== pin) {
      setError('PINs do not match. Try again.');
      setConfirmedPin('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setIsLoading(true);
    try {
      await setupPinLock(pin);
      appendConfigAuditEntry({
        event: 'app_lock_toggled',
        from: 'disabled',
        to: 'enabled',
        note: 'PIN lock enabled',
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (_unused) {
      Alert.alert('Error', 'Failed to set up app lock. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentPin = step === 'enter-pin' ? pin : confirmedPin;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => {
              if (step === 'confirm-pin') {
                setConfirmedPin('');
                setStep('enter-pin');
              } else {
                router.back();
              }
            }}
          >
            <IconSymbol name="chevron.left" size={22} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
          </Pressable>
        </View>

        {/* PIN Entry */}
        <View style={styles.pinContent}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
            <IconSymbol name="lock.fill" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {step === 'enter-pin' ? 'Create a PIN' : 'Confirm PIN'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {step === 'enter-pin'
              ? 'Enter a 6-digit PIN to protect your health data.'
              : 'Enter your PIN again to confirm.'}
          </Text>
          <PinDots value={currentPin} length={PIN_LENGTH} />
          {error ? (
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          ) : null}
          <PinPad onPress={handlePinDigit} onDelete={handleDelete} />
          {isLoading && (
            <Text style={[styles.loadingText, { color: colors.muted }]}>Setting up lock…</Text>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 16 },
  pinContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  pinDots: { flexDirection: 'row', gap: 14, marginTop: 32, marginBottom: 16 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  errorText: { fontSize: 14, marginBottom: 8, textAlign: 'center' },
  pinPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    marginTop: 16,
    gap: 12,
  },
  pinKey: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pinKeyEmpty: { width: 80, height: 80 },
  pinKeyText: { fontSize: 26, fontWeight: '500' },
  loadingText: { marginTop: 16, fontSize: 14 },
});
