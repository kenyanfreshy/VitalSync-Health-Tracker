/**
 * SnoozeDurationSheet
 *
 * A lightweight bottom sheet that lets the user pick a snooze duration.
 * Appears after a right-swipe on a SwipeableBanner.
 *
 * Usage:
 * ```tsx
 * <SnoozeDurationSheet
 *   visible={sheetVisible}
 *   onSelect={(ms) => snoozeReminderFor(id, ms)}
 *   onDismiss={() => setSheetVisible(false)}
 * />
 * ```
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors } from '@/hooks';

const SNOOZE_OPTIONS: { label: string; ms: number; icon: string }[] = [
  { label: '30 min',  ms: 30 * 60 * 1000,       icon: '⏱' },
  { label: '1 hour',  ms: 60 * 60 * 1000,       icon: '⏰' },
  { label: '2 hours', ms: 2 * 60 * 60 * 1000,   icon: '🕑' },
];

export interface SnoozeDurationSheetProps {
  visible: boolean;
  onSelect: (ms: number) => void;
  onDismiss: () => void;
}

export function SnoozeDurationSheet({
  visible,
  onSelect,
  onDismiss,
}: SnoozeDurationSheetProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(200)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 280,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 200,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  function handleSelect(ms: number) {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSelect(ms);
    onDismiss();
  }

  function handleDismiss() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onDismiss();
  }

  const sheetBg = isDark ? '#1C2028' : '#FFFFFF';
  const handleColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
  const titleColor = isDark ? '#9BA1A6' : '#687076';
  const optionBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
  const optionBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const optionText = colors.foreground;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: sheetBg, transform: [{ translateY: slideAnim }] },
        ]}
        pointerEvents="box-none"
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: handleColor }]} />

        {/* Title */}
        <Text style={[styles.title, { color: titleColor }]}>
          Snooze reminder for…
        </Text>

        {/* Options */}
        <View style={styles.options}>
          {SNOOZE_OPTIONS.map(opt => (
            <Pressable
              key={opt.ms}
              onPress={() => handleSelect(opt.ms)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: optionBg,
                  borderColor: optionBorder,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Snooze for ${opt.label}`}
            >
              <Text style={styles.optionIcon}>{opt.icon}</Text>
              <Text style={[styles.optionLabel, { color: optionText }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Cancel */}
        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.cancelBtn,
            { borderColor: optionBorder, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Cancel snooze"
        >
          <Text style={[styles.cancelText, { color: titleColor }]}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 16,
  },
  options: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  optionIcon: {
    fontSize: 22,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
