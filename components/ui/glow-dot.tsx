/**
 * GlowDot — Ambient glow accent for screen backgrounds
 *
 * Renders a blurred radial glow at a specified position.
 * Used to add depth to the dark background without being distracting.
 *
 * Usage:
 *   <GlowDot color="green" size={300} top={-80} right={-60} opacity={0.18} />
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

type GlowColor = 'green' | 'blue' | 'red' | 'amber' | 'purple';

interface GlowDotProps {
  color?: GlowColor;
  size?: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  opacity?: number;
}

const COLOR_MAP: Record<GlowColor, string> = {
  green:  '#22C55E',
  blue:   '#38BDF8',
  red:    '#F43F5E',
  amber:  '#F59E0B',
  purple: '#A78BFA',
};

export function GlowDot({
  color = 'green',
  size = 280,
  top,
  bottom,
  left,
  right,
  opacity = 0.15,
}: GlowDotProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: COLOR_MAP[color],
          opacity,
          top,
          bottom,
          left,
          right,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    // Simulate blur with a large border radius and low opacity
    // On iOS/Android the shadow creates a soft glow effect
    shadowColor: 'transparent',
    // We use opacity + large radius to simulate a soft radial glow
  },
});
