/**
 * SwipeableBanner
 *
 * A wrapper that adds directional swipe gestures to any banner/card:
 *   - Swipe LEFT  → dismiss (calls `onDismiss` after animation)
 *   - Swipe RIGHT → snooze  (calls `onSnoozeRequest` to open a duration picker,
 *                            or falls back to `onSnooze` for a fixed duration,
 *                            or falls back to `onDismiss` if neither is provided)
 *
 * Both actions animate the banner off-screen. If `onSnoozeRequest` is provided,
 * the banner slides off and then calls `onSnoozeRequest` — the caller is responsible
 * for showing the duration picker and, if the user cancels, re-showing the banner.
 *
 * A hint label ("← Dismiss" / "Snooze →") fades in as the user drags past half
 * the threshold, giving clear directional affordance.
 *
 * Usage:
 * ```tsx
 * <SwipeableBanner
 *   onDismiss={handleDismiss}
 *   onSnoozeRequest={() => setSnoozeSheetVisible(true)}
 *   snoozeLabel="Snooze"
 * >
 *   <MyBannerContent />
 * </SwipeableBanner>
 * ```
 */

import React, { useCallback } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

/** How far (px) the user must drag before the banner snaps away */
const DISMISS_THRESHOLD = 80;
/** Width to animate off-screen to */
const OFFSCREEN_X = 420;

export interface SwipeableBannerProps {
  /** Called after the left-swipe dismiss animation completes */
  onDismiss: () => void;
  /**
   * Called after the right-swipe animation completes, to open a duration picker.
   * Takes priority over `onSnooze` when both are provided.
   */
  onSnoozeRequest?: () => void;
  /**
   * Called after the right-swipe animation completes (fixed-duration snooze).
   * Used only when `onSnoozeRequest` is not provided.
   * Falls back to `onDismiss` if neither is provided.
   */
  onSnooze?: () => void;
  /** Label shown on the right-swipe hint. Defaults to "Snooze" */
  snoozeLabel?: string;
  /** Label shown on the left-swipe hint. Defaults to "Dismiss" */
  dismissLabel?: string;
  children: React.ReactNode;
}

export function SwipeableBanner({
  onDismiss,
  onSnoozeRequest,
  onSnooze,
  snoozeLabel = 'Snooze',
  dismissLabel = 'Dismiss',
  children,
}: SwipeableBannerProps) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const triggerDismiss = useCallback(() => { onDismiss(); }, [onDismiss]);
  const triggerSnooze  = useCallback(() => {
    if (onSnoozeRequest) {
      onSnoozeRequest();
    } else if (onSnooze) {
      onSnooze();
    } else {
      onDismiss();
    }
  }, [onSnoozeRequest, onSnooze, onDismiss]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate(e => {
      translateX.value = e.translationX;
      // Fade content slightly as user drags
      const progress = Math.min(Math.abs(e.translationX) / DISMISS_THRESHOLD, 1);
      opacity.value = 1 - progress * 0.35;
    })
    .onEnd(e => {
      const dist = e.translationX;
      const shouldAct = Math.abs(dist) > DISMISS_THRESHOLD;

      if (shouldAct) {
        const goRight = dist > 0; // right = snooze, left = dismiss
        const callback = goRight ? triggerSnooze : triggerDismiss;

        if (Platform.OS !== 'web') {
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        }

        translateX.value = withTiming(
          goRight ? OFFSCREEN_X : -OFFSCREEN_X,
          { duration: 220, easing: Easing.out(Easing.cubic) },
          () => { runOnJS(callback)(); },
        );
        opacity.value = withTiming(0, { duration: 200 });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 18, stiffness: 250 });
        opacity.value = withTiming(1, { duration: 150 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  // Hint labels fade in when drag exceeds half the threshold
  const leftHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-DISMISS_THRESHOLD, -DISMISS_THRESHOLD / 2, 0],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const rightHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, DISMISS_THRESHOLD / 2, DISMISS_THRESHOLD],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.wrapper}>
      {/* Left hint — visible on left-swipe (dismiss) */}
      <Reanimated.View style={[styles.hintLeft, leftHintStyle]} pointerEvents="none">
        <Text style={styles.hintTextLeft}>← {dismissLabel}</Text>
      </Reanimated.View>

      {/* Right hint — visible on right-swipe (snooze) */}
      <Reanimated.View style={[styles.hintRight, rightHintStyle]} pointerEvents="none">
        <Text style={styles.hintTextRight}>{snoozeLabel} →</Text>
      </Reanimated.View>

      {/* Draggable content */}
      <GestureDetector gesture={pan}>
        <Reanimated.View style={contentStyle}>
          {children}
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  hintLeft: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 0,
  },
  hintRight: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 0,
  },
  hintTextLeft: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    letterSpacing: 0.3,
  },
  hintTextRight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
    letterSpacing: 0.3,
  },
});
