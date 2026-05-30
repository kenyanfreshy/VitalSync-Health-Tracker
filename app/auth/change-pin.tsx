/**
 * Change PIN Screen
 * Verifies the current PIN, then allows setting a new 6-digit PIN.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useAuth } from '@/lib/auth/auth-context';
import { useColors } from '@/hooks';
import { rotateEncryptionKey } from '@/lib/storage/encrypted-storage';
import { SENSITIVE_KEYS, resetMigrationFlag } from '@/lib/storage/migration';

const PIN_LENGTH = 6;

type Step = 'verify' | 'new' | 'confirm';

function PinDots({ value, error }: { value: string; error: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.pinDots}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pinDot,
            {
              backgroundColor: i < value.length
                ? (error ? colors.error : colors.primary)
                : 'transparent',
              borderColor: i < value.length
                ? (error ? colors.error : colors.primary)
                : colors.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

function PinPad({
  onPress,
  onDelete,
  disabled,
}: {
  onPress: (d: string) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
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
                backgroundColor: pressed && !disabled
                  ? colors.primary + '22'
                  : colors.surface,
                borderColor: colors.border,
                opacity: disabled ? 0.4 : 1,
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
            <Text style={[styles.pinKeyText, { color: colors.foreground }, isDelete && { fontSize: 22 }]}>
              {key}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ChangePinScreen() {
  const colors = useColors();
  const { changePin } = useAuth();

  const [step, setStep] = useState<Step>('verify');
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // Store current PIN and new PIN safely across steps using refs (avoids stale closure issues)
  const currentPinRef = useRef('');
  const newPinRef = useRef('');

  const stepConfig: Record<Step, { title: string; subtitle: string }> = {
    verify: { title: 'Enter Current PIN', subtitle: 'Verify your identity before changing your PIN' },
    new:    { title: 'Enter New PIN', subtitle: 'Choose a new 6-digit PIN' },
    confirm:{ title: 'Confirm New PIN', subtitle: 'Enter your new PIN again to confirm' },
  };

  // Clear error after delay
  useEffect(() => {
    if (!hasError) return;
    const t = setTimeout(() => { setHasError(false); setPin(''); }, 700);
    return () => clearTimeout(t);
  }, [hasError]);

  const handleDigit = useCallback(async (digit: string) => {
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);

    if (next.length < PIN_LENGTH) return;

    if (step === 'verify') {
      currentPinRef.current = next;
      setPin('');
      setStep('new');
    } else if (step === 'new') {
      newPinRef.current = next;
      setPin('');
      setStep('confirm');
    } else if (step === 'confirm') {
      if (next !== newPinRef.current) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setHasError(true);
        setErrorMsg('PINs do not match. Try again.');
        newPinRef.current = '';
        setStep('new');
      } else {
        const ok = await changePin(currentPinRef.current, next);
        if (ok) {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Silently rotate the encryption key after a successful PIN change.
          // This ensures health data is re-encrypted under a fresh AES-256 key.
          // Rotation is fire-and-forget — failure is non-blocking.
          rotateEncryptionKey(SENSITIVE_KEYS)
            .then((result) => {
              if (result.success) resetMigrationFlag().catch(() => {});
            })
            .catch(() => {});
          router.back();
        } else {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setHasError(true);
          setErrorMsg('Current PIN is incorrect. Please try again.');
          currentPinRef.current = '';
          newPinRef.current = '';
          setPin('');
          setStep('verify');
        }
      }
    }
  }, [pin, step, changePin]);

  const handleDelete = useCallback(() => {
    setPin((p) => p.slice(0, -1));
  }, []);

  const { title, subtitle } = stepConfig[step];

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backText, { color: colors.primary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Change PIN</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepDots}>
        {(['verify', 'new', 'confirm'] as Step[]).map((s, i) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              {
                backgroundColor: s === step
                  ? colors.primary
                  : (['verify', 'new', 'confirm'].indexOf(step) > i)
                    ? colors.primary + '60'
                    : colors.border,
              },
            ]}
          />
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>

        {hasError && errorMsg ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{errorMsg}</Text>
        ) : null}

        <PinDots value={pin} error={hasError} />
        <PinPad onPress={handleDigit} onDelete={handleDelete} disabled={false} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 70 },
  backText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  stepDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  content: { flex: 1, alignItems: 'center', paddingTop: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, marginBottom: 4 },
  errorText: { fontSize: 13, marginTop: 4, marginBottom: 4 },
  pinDots: { flexDirection: 'row', gap: 14, marginTop: 24, marginBottom: 8 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  pinPad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, marginTop: 24, gap: 12 },
  pinKey: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pinKeyEmpty: { width: 80, height: 80 },
  pinKeyText: { fontSize: 26, fontWeight: '400' },
});
