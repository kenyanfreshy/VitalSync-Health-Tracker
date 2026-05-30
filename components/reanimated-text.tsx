/**
 * ReanimatedText
 *
 * Renders an animated integer value using Reanimated's useAnimatedProps.
 * Uses an Animated TextInput (editable=false) to work around the Reanimated
 * text node limitation on native platforms.
 *
 * Usage:
 * ```tsx
 * const count = useSharedValue(0);
 * count.value = withTiming(42, { duration: 600 });
 * <ReanimatedText value={count} color="#8B5CF6" fontSize={30} fontWeight="800" />
 * ```
 */
import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ReanimatedTextProps {
  value: SharedValue<number>;
  color?: string;
  fontSize?: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800' | '900' | 'bold' | 'normal';
}

export function ReanimatedText({
  value,
  color = '#FFFFFF',
  fontSize = 30,
  fontWeight = '800',
}: ReanimatedTextProps) {
  const animatedProps = useAnimatedProps(() => ({
    text: String(Math.round(value.value)),
    defaultValue: String(Math.round(value.value)),
  }));

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      underlineColorAndroid="transparent"
      style={[
        styles.base,
        { color, fontSize, fontWeight },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    textAlign: 'center',
    minWidth: 40,
  },
});
