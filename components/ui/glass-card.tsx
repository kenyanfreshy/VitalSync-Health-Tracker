/**
 * GlassCard — VitalSync Premium Glassmorphism Card
 *
 * A translucent card with:
 *  - Semi-transparent dark/light background
 *  - Subtle border highlight (top-left glass edge)
 *  - Optional glow accent colour
 *  - Press-depth animation (scale + shadow)
 *  - Optional gradient top-edge stripe
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  type PressableProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '@/hooks';

export type GlowColor = 'green' | 'blue' | 'red' | 'amber' | 'purple' | 'none';

interface GlassCardProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  /** Accent glow colour applied to the top border stripe and shadow */
  glow?: GlowColor;
  /** Extra style for the outer pressable */
  style?: ViewStyle;
  /** Extra style for the inner content container */
  contentStyle?: ViewStyle;
  /** Disable press animation (for non-interactive cards) */
  static?: boolean;
  /** Show a 1 px gradient top-edge stripe in the glow colour */
  topStripe?: boolean;
}

const GLOW_MAP: Record<GlowColor, { border: string; shadow: string; stripe: string }> = {
  green:  { border: 'rgba(34,197,94,0.35)',  shadow: 'rgba(34,197,94,0.20)',  stripe: '#22C55E' },
  blue:   { border: 'rgba(56,189,248,0.35)', shadow: 'rgba(56,189,248,0.20)', stripe: '#38BDF8' },
  red:    { border: 'rgba(244,63,94,0.35)',  shadow: 'rgba(244,63,94,0.20)',  stripe: '#F43F5E' },
  amber:  { border: 'rgba(245,158,11,0.35)', shadow: 'rgba(245,158,11,0.20)', stripe: '#F59E0B' },
  purple: { border: 'rgba(167,139,250,0.35)',shadow: 'rgba(167,139,250,0.20)',stripe: '#A78BFA' },
  none:   { border: 'rgba(255,255,255,0.10)',shadow: 'rgba(0,0,0,0.30)',      stripe: 'transparent' },
};

export function GlassCard({
  children,
  glow = 'none',
  style,
  contentStyle,
  static: isStatic = false,
  topStripe = false,
  onPress,
  ...rest
}: GlassCardProps) {
  const colors = useColors();
  const glowTokens = GLOW_MAP[glow];

  const scale = useSharedValue(1);
  const shadowOpacity = useSharedValue(0.25);

  const handlePressIn = useCallback(() => {
    if (isStatic) return;
    scale.value = withTiming(0.975, { duration: 80, easing: Easing.out(Easing.quad) });
    shadowOpacity.value = withTiming(0.10, { duration: 80 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatic]);

  const handlePressOut = useCallback(() => {
    if (isStatic) return;
    scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    shadowOpacity.value = withTiming(0.25, { duration: 180 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatic]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isDark = colors.background === '#0D1117' || colors.background.startsWith('#0');

  const cardBg = isDark ? 'rgba(22,27,34,0.72)' : 'rgba(255,255,255,0.62)';
  const cardBorder = glow !== 'none' ? glowTokens.border : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)');

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            shadowColor: glow !== 'none' ? glowTokens.shadow : '#000',
            shadowOpacity: pressed ? 0.10 : 0.28,
          },
        ]}
        {...rest}
      >
        {/* Top-edge glow stripe */}
        {topStripe && glow !== 'none' && (
          <View
            style={[
              styles.topStripe,
              { backgroundColor: glowTokens.stripe },
            ]}
          />
        )}

        {/* Glass highlight — top-left corner shimmer */}
        <View style={styles.glassHighlight} pointerEvents="none" />

        {/* Content */}
        <View style={[styles.content, contentStyle]}>
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
  topStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    opacity: 0.85,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '60%',
    height: '40%',
    borderTopLeftRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    pointerEvents: 'none',
  },
  content: {
    padding: 16,
  },
});
