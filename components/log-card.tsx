/**
 * LogCard — shared card component used on both the Records screen and Dashboard sections.
 *
 * Features:
 * - Icon pill + title + subtitle + optional latest-value badge
 * - "Tap to add your first entry" empty-state prompt when no data
 * - Right-swipe gesture (>60 px) to trigger onSwipeToLog (quick-add shortcut)
 *   Falls back to onPress tap when no swipe handler is provided.
 */
import React, { useCallback } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

// ─── Constants ────────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 64;
const ACTION_REVEAL_WIDTH = 72;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LogCardProps {
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  latestValue?: string;
  latestLabel?: string;
  /** Tap to navigate to the log/detail screen */
  onPress?: () => void;
  /**
   * Right-swipe shortcut to open the quick-add entry sheet.
   * When provided, a teal "Add" action strip is revealed on swipe.
   * When omitted, the card is tap-only (no swipe affordance).
   */
  onSwipeToLog?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LogCard({
  title,
  subtitle,
  icon,
  accentColor,
  latestValue,
  latestLabel,
  onPress,
  onSwipeToLog,
}: LogCardProps) {
  const colors = useColors();
  const translateX = useSharedValue(0);
  const actionOpacity = useSharedValue(0);

  const triggerSwipe = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSwipeToLog?.();
  }, [onSwipeToLog]);

  const pan = Gesture.Pan()
    .enabled(!!onSwipeToLog && Platform.OS !== 'web')
    .activeOffsetX([10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = Math.min(SWIPE_THRESHOLD * 2, Math.max(0, e.translationX));
      actionOpacity.value = Math.min(1, translateX.value / SWIPE_THRESHOLD);
    })
    .onEnd((e) => {
      if (e.translationX >= SWIPE_THRESHOLD || e.velocityX > 500) {
        translateX.value = withTiming(ACTION_REVEAL_WIDTH, { duration: 120 }, () => {
          runOnJS(triggerSwipe)();
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
          actionOpacity.value = withTiming(0, { duration: 200 });
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        actionOpacity.value = withTiming(0, { duration: 150 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: actionOpacity.value,
  }));

  return (
    <View style={{ marginBottom: 8, position: 'relative' }}>
      {/* Action strip revealed on right-swipe */}
      {onSwipeToLog ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: ACTION_REVEAL_WIDTH,
              borderRadius: 14,
              backgroundColor: '#22C55E',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            },
            actionStyle,
          ]}
          pointerEvents="none"
        >
          <Text style={{ fontSize: 18 }}>＋</Text>
          <Text style={{ fontSize: 9, color: '#fff', fontWeight: '600', letterSpacing: 0.3 }}>
            ADD
          </Text>
        </Animated.View>
      ) : null}

      {/* Card */}
      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <Pressable
            onPress={() => {
              if (translateX.value < 8) onPress?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={title}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {/* Icon pill */}
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: accentColor + '18',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20 }}>{icon}</Text>
            </View>

            {/* Text content */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: colors.foreground,
                  lineHeight: 20,
                }}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  lineHeight: 16,
                }}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            </View>

            {/* Latest value badge OR empty-state prompt */}
            {latestValue ? (
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: accentColor,
                    lineHeight: 18,
                  }}
                >
                  {latestValue}
                </Text>
                {latestLabel ? (
                  <Text style={{ fontSize: 10, color: colors.muted, lineHeight: 14 }}>
                    {latestLabel}
                  </Text>
                ) : null}
              </View>
            ) : (
              /* Empty-state dashed pill */
              <View
                style={{
                  borderWidth: 1,
                  borderColor: accentColor + '55',
                  borderStyle: 'dashed',
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  alignItems: 'center',
                  maxWidth: 90,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: accentColor,
                    fontWeight: '500',
                    textAlign: 'center',
                    lineHeight: 14,
                  }}
                >
                  Tap to add{'\n'}first entry
                </Text>
              </View>
            )}

            {/* Swipe hint chevron */}
            {onSwipeToLog ? (
              <Text style={{ fontSize: 11, color: colors.muted, marginLeft: -4 }}>›</Text>
            ) : null}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
