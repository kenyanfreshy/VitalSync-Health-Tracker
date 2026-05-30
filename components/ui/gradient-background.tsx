/**
 * GradientBackground — VitalSync Deep Gunmetal Screen Background
 *
 * Renders a three-stop vertical gradient derived from the logo's dark metallic body.
 * Dark mode: #0D1117 → #0F1A2E → #0D1117  (subtle blue-tinted midpoint)
 * Light mode: #F0F4F8 → #EBF0F7 → #F0F4F8
 *
 * Usage:
 *   <GradientBackground>
 *     <ScreenContainer edges={["top","left","right"]}>
 *       ...
 *     </ScreenContainer>
 *   </GradientBackground>
 */

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks';

interface GradientBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Override gradient colours (dark mode) */
  darkColors?: readonly [string, string, string];
  /** Override gradient colours (light mode) */
  lightColors?: readonly [string, string, string];
}

const DARK_GRADIENT: readonly [string, string, string] = ['#0D1117', '#0F1A2E', '#0D1117'];
const LIGHT_GRADIENT: readonly [string, string, string] = ['#F0F4F8', '#EBF0F7', '#F0F4F8'];

export function GradientBackground({
  children,
  style,
  darkColors = DARK_GRADIENT,
  lightColors = LIGHT_GRADIENT,
}: GradientBackgroundProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={colors}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
