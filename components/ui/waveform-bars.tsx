/**
 * WaveformBars
 *
 * A row of 5 animated bars that visualize microphone volume.
 *
 * - When `isActive` is false: bars sit at their minimum height (idle).
 * - When `isActive` is true and `volume` is 0: a gentle idle shimmer plays.
 * - When `isActive` is true and `volume` > 0: bars scale proportionally to
 *   the volume level (0–160 range from @react-native-voice/voice).
 *
 * Usage:
 *   <WaveformBars isActive={isListening} volume={volumeLevel} color="#22C55E" />
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

interface WaveformBarsProps {
  /** Whether the mic is actively recording. Controls shimmer vs. volume-driven animation. */
  isActive: boolean;
  /**
   * Volume level from @react-native-voice/voice (0–160 range).
   * Pass 0 when not recording or when no volume data is available.
   */
  volume?: number;
  /** Bar colour. Defaults to #22C55E (green). Changes to red when isActive. */
  color?: string;
  /** Height of the container in dp. Bars scale within this space. Default 28. */
  height?: number;
}

// Bar configuration: each bar has a different base height and shimmer phase offset
const BAR_CONFIG = [
  { baseH: 6,  shimmerTo: 14, delay: 0   },
  { baseH: 10, shimmerTo: 22, delay: 80  },
  { baseH: 16, shimmerTo: 28, delay: 40  },
  { baseH: 10, shimmerTo: 22, delay: 120 },
  { baseH: 6,  shimmerTo: 14, delay: 60  },
] as const;

const _MAX_HEIGHT = 28;
const MIN_HEIGHT = 4;

function Bar({
  baseH,
  shimmerTo,
  isActive,
  volume,
  color,
  maxH,
}: {
  baseH: number;
  shimmerTo: number;
  isActive: boolean;
  volume: number;
  color: string;
  maxH: number;
}) {
  const h = useSharedValue(baseH);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(h);
      h.value = withTiming(MIN_HEIGHT, { duration: 200 });
      return;
    }

    if (volume > 0) {
      // Map volume (0–160) to bar height range (MIN_HEIGHT – maxH)
      const ratio = Math.min(volume / 160, 1);
      // Each bar gets a slightly different multiplier so they don't all move identically
      const barRatio = Math.min(ratio * (baseH / 8 + 0.5), 1);
      const targetH = MIN_HEIGHT + barRatio * (maxH - MIN_HEIGHT);
      cancelAnimation(h);
      h.value = withTiming(targetH, { duration: 80, easing: Easing.out(Easing.quad) });
    } else {
      // Idle shimmer
      h.value = withRepeat(
        withSequence(
          withTiming(shimmerTo, { duration: 400 + baseH * 20, easing: Easing.inOut(Easing.ease) }),
          withTiming(baseH,     { duration: 400 + baseH * 20, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    }
  }, [isActive, volume, baseH, shimmerTo, maxH, h]);

  const animStyle = useAnimatedStyle(() => ({
    height: h.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, width: 4, borderRadius: 2 },
        animStyle,
      ]}
    />
  );
}

export function WaveformBars({
  isActive,
  volume = 0,
  color = '#22C55E',
  height = 28,
}: WaveformBarsProps) {
  return (
    <View style={[styles.container, { height }]}>
      {BAR_CONFIG.map((cfg, i) => (
        <Bar
          key={i}
          baseH={cfg.baseH}
          shimmerTo={cfg.shimmerTo}
          isActive={isActive}
          volume={volume}
          color={color}
          maxH={height}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bar: {
    borderRadius: 2,
  },
});
