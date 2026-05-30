/**
 * KeyRotationSheet — "Reset Encryption Key" bottom sheet for VitalSync.
 *
 * Flow:
 *   1. User opens the sheet from Settings > Privacy & Security.
 *   2. Confirmation step explains what will happen and warns about the risk.
 *   3. User taps "Rotate Key Now" to start.
 *   4. Progress bar animates while each sensitive key is re-encrypted.
 *   5. On success: green confirmation with a summary (N keys re-encrypted).
 *   6. On failure: red error with the count of failed keys; old key is preserved.
 *
 * The sheet is a Modal (not a native bottom sheet) for maximum compatibility.
 * It uses the same visual language as other VitalSync sheets.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { rotateEncryptionKey, type KeyRotationResult } from '@/lib/storage/encrypted-storage';
import { SENSITIVE_KEYS, resetMigrationFlag } from '@/lib/storage/migration';

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetPhase = 'confirm' | 'rotating' | 'success' | 'error';

interface KeyRotationSheetProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KeyRotationSheet({ visible, onClose }: KeyRotationSheetProps) {
  const colors = useColors();
  const [phase, setPhase] = useState<SheetPhase>('confirm');
  const [progress, setProgress] = useState(0); // 0–1
  const [result, setResult] = useState<KeyRotationResult | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateProgress = useCallback((to: number) => {
    Animated.timing(progressAnim, {
      toValue: to,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setProgress(to);
  }, [progressAnim]);

  const handleRotate = useCallback(async () => {
    setPhase('rotating');
    animateProgress(0);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const rotationResult = await rotateEncryptionKey(
      SENSITIVE_KEYS,
      (processed, total) => {
        animateProgress(total > 0 ? processed / total : 0);
      },
    );

    setResult(rotationResult);

    if (rotationResult.success) {
      // Reset migration flag so the migration module re-validates on next launch
      await resetMigrationFlag();
      setPhase('success');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      setPhase('error');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [animateProgress]);

  const handleClose = useCallback(() => {
    // Reset state for next open
    setPhase('confirm');
    setProgress(0);
    progressAnim.setValue(0);
    setResult(null);
    onClose();
  }, [onClose, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const s = styles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={phase === 'rotating' ? undefined : handleClose} />
        <View style={s.sheet}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={[s.iconCircle, {
              backgroundColor: phase === 'success'
                ? colors.success + '20'
                : phase === 'error'
                  ? colors.error + '20'
                  : colors.warning + '20',
            }]}>
              <IconSymbol
                name={
                  phase === 'success'
                    ? 'checkmark.shield.fill'
                    : phase === 'error'
                      ? 'exclamationmark.shield.fill'
                      : 'key.fill'
                }
                size={28}
                color={
                  phase === 'success'
                    ? colors.success
                    : phase === 'error'
                      ? colors.error
                      : colors.warning
                }
              />
            </View>
            <Text style={s.title}>
              {phase === 'success'
                ? 'Key Rotation Complete'
                : phase === 'error'
                  ? 'Key Rotation Failed'
                  : phase === 'rotating'
                    ? 'Rotating Encryption Key…'
                    : 'Reset Encryption Key'}
            </Text>
          </View>

          <ScrollView
            style={s.body}
            contentContainerStyle={s.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Confirm phase ── */}
            {phase === 'confirm' && (
              <>
                <Text style={s.description}>
                  This generates a new AES-256 encryption key and re-encrypts all your health data under it. Use this if you suspect your device has been compromised or after changing your PIN.
                </Text>

                <View style={s.infoBox}>
                  <IconSymbol name="info.circle.fill" size={16} color={colors.primary} />
                  <Text style={s.infoText}>
                    Your data remains on-device throughout. The old key is only discarded after all data is successfully re-encrypted under the new key.
                  </Text>
                </View>

                <View style={s.warningBox}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={16} color={colors.warning} />
                  <Text style={s.warningText}>
                    Do not close the app during key rotation. If rotation is interrupted, your data remains encrypted under the old key and you can try again.
                  </Text>
                </View>

                <View style={s.statRow}>
                  <Text style={s.statLabel}>Keys to rotate</Text>
                  <Text style={s.statValue}>{SENSITIVE_KEYS.length}+ sensitive keys</Text>
                </View>
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Algorithm</Text>
                  <Text style={s.statValue}>AES-256-CTR</Text>
                </View>
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Key storage</Text>
                  <Text style={s.statValue}>iOS Keychain / Android Keystore</Text>
                </View>
              </>
            )}

            {/* ── Rotating phase ── */}
            {phase === 'rotating' && (
              <>
                <Text style={s.description}>
                  Re-encrypting your health data under the new key. This may take a few seconds.
                </Text>
                <View style={s.progressTrack}>
                  <Animated.View
                    style={[s.progressFill, { width: progressWidth, backgroundColor: colors.primary }]}
                  />
                </View>
                <Text style={s.progressLabel}>
                  {Math.round(progress * 100)}% complete
                </Text>
                <View style={s.spinnerRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.spinnerText}>Please keep the app open…</Text>
                </View>
              </>
            )}

            {/* ── Success phase ── */}
            {phase === 'success' && result && (
              <>
                <Text style={s.description}>
                  All sensitive health data has been re-encrypted under a new AES-256 key. The old key has been permanently discarded.
                </Text>
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Keys re-encrypted</Text>
                  <Text style={[s.statValue, { color: colors.success }]}>{result.rotated}</Text>
                </View>
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Keys skipped (empty)</Text>
                  <Text style={s.statValue}>{result.skipped}</Text>
                </View>
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Failed</Text>
                  <Text style={[s.statValue, { color: result.failed > 0 ? colors.error : colors.success }]}>
                    {result.failed}
                  </Text>
                </View>
                <View style={s.infoBox}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
                  <Text style={[s.infoText, { color: colors.success }]}>
                    Your data is now encrypted under a fresh key stored in the device Keychain.
                  </Text>
                </View>
              </>
            )}

            {/* ── Error phase ── */}
            {phase === 'error' && result && (
              <>
                <Text style={s.description}>
                  Key rotation could not be completed. Your data remains encrypted under the original key — nothing has changed.
                </Text>
                {result.error && (
                  <View style={s.errorBox}>
                    <IconSymbol name="exclamationmark.circle.fill" size={16} color={colors.error} />
                    <Text style={s.errorText}>{result.error}</Text>
                  </View>
                )}
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Keys that failed</Text>
                  <Text style={[s.statValue, { color: colors.error }]}>{result.failed}</Text>
                </View>
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Keys re-encrypted</Text>
                  <Text style={s.statValue}>{result.rotated}</Text>
                </View>
                <Text style={[s.description, { marginTop: 12, fontSize: 13 }]}>
                  Try again after restarting the app. If the problem persists, ensure the device Keychain is accessible (check biometric settings).
                </Text>
              </>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={s.actions}>
            {phase === 'confirm' && (
              <>
                <Pressable
                  style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]}
                  onPress={handleClose}
                >
                  <Text style={[s.btnSecondaryText, { color: colors.muted }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.btnPrimary, { backgroundColor: colors.warning }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                  onPress={handleRotate}
                >
                  <IconSymbol name="key.fill" size={16} color="#fff" />
                  <Text style={s.btnPrimaryText}>Rotate Key Now</Text>
                </Pressable>
              </>
            )}

            {phase === 'rotating' && (
              <View style={s.btnDisabled}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={[s.btnSecondaryText, { color: colors.muted, marginLeft: 8 }]}>Rotating…</Text>
              </View>
            )}

            {(phase === 'success' || phase === 'error') && (
              <Pressable
                style={({ pressed }) => [
                  s.btnPrimary,
                  { backgroundColor: phase === 'success' ? colors.success : colors.primary },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                onPress={handleClose}
              >
                <Text style={s.btnPrimaryText}>
                  {phase === 'success' ? 'Done' : 'Close'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: Platform.OS === 'ios' ? 34 : 24,
      maxHeight: '85%',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 24,
      gap: 10,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.foreground,
      textAlign: 'center',
    },
    body: {
      flexShrink: 1,
    },
    bodyContent: {
      paddingHorizontal: 24,
      paddingBottom: 8,
      gap: 12,
    },
    description: {
      fontSize: 14,
      color: colors.muted,
      lineHeight: 21,
    },
    infoBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.primary + '12',
      borderRadius: 12,
      padding: 12,
      alignItems: 'flex-start',
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: colors.primary,
      lineHeight: 19,
    },
    warningBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.warning + '15',
      borderRadius: 12,
      padding: 12,
      alignItems: 'flex-start',
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      color: colors.warning,
      lineHeight: 19,
    },
    errorBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.error + '12',
      borderRadius: 12,
      padding: 12,
      alignItems: 'flex-start',
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      color: colors.error,
      lineHeight: 19,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    statLabel: {
      fontSize: 14,
      color: colors.muted,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.foreground,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginVertical: 8,
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressLabel: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
    },
    spinnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 8,
    },
    spinnerText: {
      fontSize: 13,
      color: colors.muted,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    btnPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
    },
    btnPrimaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    btnSecondary: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnSecondaryText: {
      fontSize: 15,
      fontWeight: '600',
    },
    btnDisabled: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
}
