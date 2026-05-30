/**
 * TranslatingToast
 * A floating pill shown at the bottom of the screen while Smart translation is in progress.
 * Rendered inside the root layout so it persists across all tab screens.
 * The globe icon spins continuously using react-native-reanimated while translating.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
 Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslationContext } from '@/lib/i18n-ai';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';

export function TranslatingToast() {
  const { isTranslating } = useTranslationContext();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Fade + slide animation (Animated API — works with pointerEvents="none")
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // Spinning rotation (Reanimated)
  const rotation = useSharedValue(0);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }), [rotation]);

  useEffect(() => {
    if (isTranslating) {
      // Start spin
      rotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1, // infinite
        false,
      );
      // Fade in
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      // Stop spin gracefully
      cancelAnimation(rotation);
      // Fade out
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isTranslating]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          bottom: insets.bottom + (Platform.OS === 'web' ? 16 : 72), // above tab bar
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: colors.foreground + 'F0', shadowColor: colors.foreground }]}>
        {/* Spinning globe */}
        <Reanimated.View style={[styles.spinnerWrap, spinStyle]}>
          <IconSymbol name="globe" size={15} color={colors.background} />
        </Reanimated.View>
        <Text style={[styles.label, { color: colors.background }]}>Translating…</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  spinnerWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
