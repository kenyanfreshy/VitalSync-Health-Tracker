/**
 * GlassButton — VitalSync Premium Button
 *
 * Variants:
 *  - primary   : Vital Green filled with subtle glow
 *  - secondary : Electric Blue filled
 *  - ghost     : Transparent with glass border
 *  - danger    : Pulse Red filled
 *  - outline   : Border only, no fill
 */

import React, { useCallback } from 'react';
import {
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
  Platform,
 Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface GlassButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; border: string; text: string; shadow: string }> = {
  primary:   { bg: '#22C55E', border: '#16A34A', text: '#FFFFFF', shadow: 'rgba(34,197,94,0.45)' },
  secondary: { bg: '#38BDF8', border: '#0EA5E9', text: '#0D1117', shadow: 'rgba(56,189,248,0.40)' },
  ghost:     { bg: 'rgba(22,27,34,0.60)', border: 'rgba(255,255,255,0.14)', text: '#F0F2FA', shadow: 'rgba(0,0,0,0.30)' },
  danger:    { bg: '#F43F5E', border: '#E11D48', text: '#FFFFFF', shadow: 'rgba(244,63,94,0.40)' },
  outline:   { bg: 'transparent', border: '#22C55E', text: '#22C55E', shadow: 'rgba(34,197,94,0.20)' },
};

const SIZE_STYLES: Record<ButtonSize, { paddingH: number; paddingV: number; fontSize: number; radius: number }> = {
  sm: { paddingH: 14, paddingV: 8,  fontSize: 13, radius: 10 },
  md: { paddingH: 20, paddingV: 12, fontSize: 15, radius: 14 },
  lg: { paddingH: 28, paddingV: 16, fontSize: 17, radius: 18 },
};

export function GlassButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = false,
}: GlassButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.96, { duration: 70, easing: Easing.out(Easing.quad) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }, [onPress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animStyle, fullWidth && styles.fullWidth, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[
          styles.button,
          {
            backgroundColor: v.bg,
            borderColor: v.border,
            borderRadius: s.radius,
            paddingHorizontal: s.paddingH,
            paddingVertical: s.paddingV,
            shadowColor: v.shadow,
            opacity: disabled ? 0.45 : 1,
          },
          fullWidth && styles.fullWidth,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={v.text} />
        ) : (
          <View style={styles.row}>
            {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
            <Text style={[styles.label, { color: v.text, fontSize: s.fontSize }, textStyle]}>
              {label}
            </Text>
            {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  fullWidth: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
