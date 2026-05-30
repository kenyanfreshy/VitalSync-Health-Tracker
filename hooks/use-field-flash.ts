/**
 * useFieldFlash
 * Returns a map of animated border-color values keyed by field name.
 * Call `flash(fieldNames)` after a form is filled to trigger a green border
 * animation on each named field.
 *
 * Usage:
 *   const { flashStyle, flash } = useFieldFlash(['name', 'date', 'doctor']);
 *   // After fill:
 *   flash(['name', 'date']);
 *   // In JSX:
 *   <TextInput style={[styles.input, flashStyle('name')]} ... />
 */
import { useRef, useCallback } from 'react';
import { Animated } from 'react-native';

const FLASH_COLOR_ON = '#22C55E';   // green-500
const FLASH_DURATION_IN = 120;      // ms to go green
const FLASH_HOLD = 700;             // ms to hold green
const FLASH_DURATION_OUT = 400;     // ms to fade back

export function useFieldFlash(fieldNames: string[]) {
  // One Animated.Value per field (0 = normal, 1 = green)
  const animMap = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(fieldNames.map((k) => [k, new Animated.Value(0)])),
  );

  /**
   * Trigger the green flash on the specified fields.
   * If `fields` is omitted, all registered fields flash.
   */
  const flash = useCallback((fields?: string[]) => {
    const targets = fields ?? fieldNames;
    targets.forEach((key) => {
      const anim = animMap.current[key];
      if (!anim) return;
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: FLASH_DURATION_IN, useNativeDriver: false }),
        Animated.delay(FLASH_HOLD),
        Animated.timing(anim, { toValue: 0, duration: FLASH_DURATION_OUT, useNativeDriver: false }),
      ]).start();
    });
  }, [fieldNames]);

  /**
   * Returns an animated style object for a given field.
   * Interpolates borderColor from the theme border to green and back.
   */
  const flashStyle = useCallback(
    (key: string, normalBorderColor: string = 'transparent') => {
      const anim = animMap.current[key];
      if (!anim) return {};
      return {
        borderColor: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [normalBorderColor, FLASH_COLOR_ON],
        }),
        borderWidth: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2],
        }),
      };
    },
    [],
  );

  return { flash, flashStyle };
}
