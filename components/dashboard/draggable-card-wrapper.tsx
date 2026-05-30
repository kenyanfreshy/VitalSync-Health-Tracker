/**
 * DraggableCardWrapper + DragPlaceholder
 *
 * DraggableCardWrapper wraps a dashboard card with a long-press-to-drag gesture.
 * DragPlaceholder renders a dashed outline in the target slot while dragging.
 *
 * Behaviour:
 *  - Long-press (500 ms) activates drag: card lifts (scale 1.025 + shadow)
 *  - Dragging past 55% of cardHeight commits a swap + Medium haptic
 *  - Boundary (top/bottom) fires Warning haptic
 *  - onDragStateChange reports { isDragging, targetIndex } to parent for placeholder
 *  - Releasing snaps card back to natural position
 *
 * Props for DraggableCardWrapper:
 *  - index             current position (0-based)
 *  - totalCards        total draggable cards
 *  - onMoveUp          move this card one slot up
 *  - onMoveDown        move this card one slot down
 *  - editMode          whether edit-layout mode is active
 *  - onLongPress       called when long-press activates (enter edit mode)
 *  - onDragStateChange called with { isDragging, targetIndex } on drag start/move/end
 *  - cardHeight        estimated card height for threshold (default 220)
 *  - children          card content
 */

import React, { useCallback } from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const LIFT_SCALE = 1.025;
const LIFT_SHADOW_OPACITY = 0.18;
const ANIM_DURATION = 180;

export interface DragState {
  isDragging: boolean;
  /** The slot index where the dragged card will land */
  targetIndex: number;
  /** The original slot index of the card being dragged (used to look up measured height) */
  activeCardIndex: number;
}

export interface DraggableCardWrapperProps {
  index: number;
  totalCards: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  editMode: boolean;
  onLongPress: () => void;
  onDragStateChange?: (state: DragState) => void;
  /** Called with the measured card height when onLayout fires. Use to sync DragPlaceholder height. */
  onHeightMeasured?: (height: number) => void;
  /** Initial estimated height used before onLayout fires (default 220). */
  cardHeight?: number;
  children: React.ReactNode;
}

export function DraggableCardWrapper({
  index,
  totalCards,
  onMoveUp,
  onMoveDown,
  editMode,
  onLongPress,
  onDragStateChange,
  onHeightMeasured,
  cardHeight: initialCardHeight = 220,
  children,
}: DraggableCardWrapperProps) {
  // Measure the actual rendered card height via onLayout for accurate swap threshold
  // Use a shared value so the pan worklet can read it on the UI thread
  const measuredHeight = useSharedValue(initialCardHeight);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      measuredHeight.value = h;
      onHeightMeasured?.(h);
    }
  }, [measuredHeight, onHeightMeasured]);

  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const shadowOpacity = useSharedValue(0);
  const isDraggingShared = useSharedValue(false);
  const lastCommittedOffset = useSharedValue(0);
  // Track current target index on the UI thread
  const currentTargetIndex = useSharedValue(index);

  const fireHaptic = useCallback((type: 'light' | 'medium') => {
    if (Platform.OS === 'web') return;
    if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const fireBoundaryHaptic = useCallback(() => {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const notifyDragState = useCallback((dragging: boolean, targetIdx: number) => {
    onDragStateChange?.({ isDragging: dragging, targetIndex: targetIdx, activeCardIndex: index });
  }, [onDragStateChange, index]);

  const commitMoveUp = useCallback(() => {
    onMoveUp();
  }, [onMoveUp]);

  const commitMoveDown = useCallback(() => {
    onMoveDown();
  }, [onMoveDown]);

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      'worklet';
      isDraggingShared.value = true;
      currentTargetIndex.value = index;
      scale.value = withTiming(LIFT_SCALE, { duration: ANIM_DURATION, easing: Easing.out(Easing.quad) });
      shadowOpacity.value = withTiming(LIFT_SHADOW_OPACITY, { duration: ANIM_DURATION });
      lastCommittedOffset.value = 0;
      runOnJS(onLongPress)();
      runOnJS(fireHaptic)('medium');
      runOnJS(notifyDragState)(true, index);
    });

  const pan = Gesture.Pan()
    .activateAfterLongPress(500)
    .onUpdate(e => {
      'worklet';
      if (!isDraggingShared.value) return;
      translateY.value = e.translationY;

      const delta = e.translationY - lastCommittedOffset.value;
      const threshold = measuredHeight.value * 0.55;

      if (delta > threshold) {
        if (index < totalCards - 1) {
          lastCommittedOffset.value += measuredHeight.value;
          const newTarget = Math.min(currentTargetIndex.value + 1, totalCards - 1);
          currentTargetIndex.value = newTarget;
          runOnJS(fireHaptic)('medium');
          runOnJS(commitMoveDown)();
          runOnJS(notifyDragState)(true, newTarget);
        } else {
          runOnJS(fireBoundaryHaptic)();
          lastCommittedOffset.value = e.translationY;
        }
      } else if (delta < -threshold) {
        if (index > 0) {
          lastCommittedOffset.value -= measuredHeight.value;
          const newTarget = Math.max(currentTargetIndex.value - 1, 0);
          currentTargetIndex.value = newTarget;
          runOnJS(fireHaptic)('medium');
          runOnJS(commitMoveUp)();
          runOnJS(notifyDragState)(true, newTarget);
        } else {
          runOnJS(fireBoundaryHaptic)();
          lastCommittedOffset.value = e.translationY;
        }
      }
    })
    .onEnd(() => {
      'worklet';
      isDraggingShared.value = false;
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      scale.value = withTiming(1, { duration: ANIM_DURATION });
      shadowOpacity.value = withTiming(0, { duration: ANIM_DURATION });
      lastCommittedOffset.value = 0;
      runOnJS(notifyDragState)(false, index);
    });

  const composed = Gesture.Simultaneous(longPress, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    shadowOpacity: shadowOpacity.value,
    zIndex: isDraggingShared.value ? 100 : 0,
    elevation: isDraggingShared.value ? 8 : 0,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[styles.wrapper, animatedStyle]} onLayout={handleLayout}>
        {/* Active drag border highlight */}
        {editMode && (
          <View
            style={[styles.dragIndicator, { opacity: isDraggingShared.value ? 1 : 0 }]}
            pointerEvents="none"
          />
        )}
        {/* Drag handle grip icon — visible in edit mode to signal draggability */}
        {editMode && (
          <View style={styles.dragHandle} pointerEvents="none">
            <Text style={styles.dragHandleIcon}>{'≡'}</Text>
          </View>
        )}
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}

// ─── DragPlaceholder ──────────────────────────────────────────────────────────

export interface DragPlaceholderProps {
  /** Height of the placeholder (should match the dragged card's height) */
  height?: number;
  /** Accent colour for the dashed border */
  accentColor?: string;
}

/**
 * Renders a dashed outline placeholder in the target slot while a card is being dragged.
 * Mount this in place of the card that is currently being dragged to its new position.
 */
export function DragPlaceholder({ height = 220, accentColor = '#0a7ea4' }: DragPlaceholderProps) {
  return (
    <View
      style={[
        styles.placeholder,
        {
          height,
          borderColor: accentColor + '80',
        },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  dragIndicator: {
    position: 'absolute',
    inset: 0,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(10, 126, 164, 0.5)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  placeholder: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(10, 126, 164, 0.04)',
  },
  dragHandle: {
    position: 'absolute',
    top: 10,
    right: 14,
    zIndex: 10,
    backgroundColor: 'rgba(10, 126, 164, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    pointerEvents: 'none',
  },
  dragHandleIcon: {
    fontSize: 16,
    color: 'rgba(10, 126, 164, 0.75)',
    fontWeight: '700',
    letterSpacing: 1,
  },
});
