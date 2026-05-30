/**
 * components/dictation-tip-banner.tsx
 *
 * One-time informational banner shown the first time a user encounters a
 * dictation-enabled form. Explains that the iOS/Gboard keyboard mic button
 * is used for voice input  -  no server call, fully on-device.
 *
 * Persists dismissal to AsyncStorage so it only appears once per install.
 *
 * Usage:
 *   <DictationTipBanner />
 *
 * The banner auto-hides after the user taps "Got it" or after 12 seconds.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

const STORAGE_KEY = '@vsht:dictation_tip_seen';
const AUTO_DISMISS_MS = 12_000;

export function DictationTipBanner() {
  const colors = useColors();
  const [visible, setVisible] = React.useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entrance animation values
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-16);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (!val) {
        setVisible(true);
        // Animate in
        opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
        translateY.value = withSpring(0, { damping: 16, stiffness: 180 });
        // Auto-dismiss
        timerRef.current = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
      }
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Animate out
    opacity.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
    translateY.value = withTiming(-12, { duration: 220 });
    safeSetItem(STORAGE_KEY, '1');
  }, [opacity, translateY]);

  if (!visible) return null;

  const isIOS = Platform.OS === 'ios';

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      <View style={[styles.banner, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '44' }]}>
        {/* Icon + title row */}
        <View style={styles.headerRow}>
          <Text style={styles.icon}>🎙️</Text>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Voice Dictation is Built In
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              No internet required  -  fully on-device
            </Text>
          </View>
          <Pressable
            onPress={dismiss}
            hitSlop={12}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.5 }]}
          >
            <Text style={[styles.closeText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        </View>

        {/* Step-by-step guide */}
        <View style={styles.steps}>
          {isIOS ? (
            <>
              <StepRow
                step="1"
                text="Tap any text field to open the keyboard"
                colors={colors}
              />
              <StepRow
                step="2"
                text='Tap the microphone key (🎤) on the bottom row of the keyboard'
                colors={colors}
              />
              <StepRow
                step="3"
                text={'Speak naturally - e.g. "Metformin 500mg twice daily"'}
                colors={colors}
              />
              <StepRow
                step="4"
                text="Tap the mic key again or pause to stop"
                colors={colors}
              />
            </>
          ) : (
            <>
              <StepRow
                step="1"
                text="Tap any text field to open Gboard"
                colors={colors}
              />
              <StepRow
                step="2"
                text='Tap the microphone icon (🎤) in the top-right of Gboard'
                colors={colors}
              />
              <StepRow
                step="3"
                text={'Speak your entry - e.g. "Influenza vaccine, lot 12345, left arm"'}
                colors={colors}
              />
              <StepRow
                step="4"
                text="Tap the mic icon again to stop"
                colors={colors}
              />
            </>
          )}
        </View>

        {/* Privacy note */}
        <View style={[styles.privacyRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.privacyText, { color: colors.muted }]}>
            🔒 Dictation runs entirely on your device. No audio is sent to any server.
          </Text>
        </View>

        {/* Dismiss button */}
        <Pressable
          style={({ pressed }) => [
            styles.gotItBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            dismiss();
          }}
        >
          <Text style={styles.gotItText}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// -- Helper sub-component ------------------------------------------------------

function StepRow({
  step,
  text,
  colors,
}: {
  step: string;
  text: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
        <Text style={[styles.stepNum, { color: colors.primary }]}>{step}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

// -- Styles --------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  icon: {
    fontSize: 22,
    lineHeight: 28,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: 2,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  steps: {
    gap: 7,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  privacyRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginBottom: 10,
  },
  privacyText: {
    fontSize: 11,
    lineHeight: 15,
  },
  gotItBtn: {
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 14,
  },
  gotItText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
