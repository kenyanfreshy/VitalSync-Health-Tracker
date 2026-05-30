/**
 * MicrophoneIcon — uses the user-supplied flat microphone image asset.
 *
 * Idle   → green circle (mic-idle.png)
 * Active → red circle   (mic-active.png) + subtle scale-pulse animation
 *
 * Usage:
 *   <MicrophoneIcon size={48} />              — green (idle)
 *   <MicrophoneIcon size={48} isActive />     — red + pulse (recording)
 */

import React, { useEffect } from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

/**
 * StopIcon — a simple square stop icon shown during recording.
 * Kept for backward compatibility with ScribeButton.
 */
import Svg, { Rect } from 'react-native-svg';

const MIC_IDLE   = require('@/assets/images/mic-idle.png');
const MIC_ACTIVE = require('@/assets/images/mic-active.png');

interface MicrophoneIconProps {
  /** Icon size in dp (width = height). Default 44. */
  size?: number;
  /** When true, shows the red active variant with pulse animation. Default false. */
  isActive?: boolean;
  style?: StyleProp<ImageStyle>;
}

export function MicrophoneIcon({
  size = 44,
  isActive = false,
  style,
}: MicrophoneIconProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isActive) {
      scale.value = withRepeat(
        withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 150 });
    }
  }, [isActive, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <Image
        source={isActive ? MIC_ACTIVE : MIC_IDLE}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export function StopIcon({ size = 24, color = '#EF4444' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={5} width={14} height={14} rx={2} ry={2} fill={color} />
    </Svg>
  );
}
