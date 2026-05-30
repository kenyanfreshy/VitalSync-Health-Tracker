/**
 * SegmentedControl
 * A tactile, Skeuo-Minimalist segmented control with animated active pill.
 * Supports dark mode and haptic feedback.
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
  Platform,
  useColorScheme,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

export interface SegmentOption<T extends string | number> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const segmentWidth = useRef(0);
  const activeIndex = options.findIndex((o) => o.value === value);
  const translateX = useRef(new Animated.Value(0)).current;

  function handleLayout(e: LayoutChangeEvent) {
    const totalWidth = e.nativeEvent.layout.width;
    segmentWidth.current = totalWidth / options.length;
    // Snap to current active index without animation on first layout
    translateX.setValue(activeIndex * segmentWidth.current);
  }

  function handlePress(option: SegmentOption<T>, index: number) {
    if (option.value === value) return;

    Animated.spring(translateX, {
      toValue: index * segmentWidth.current,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
      mass: 0.8,
    }).start();

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onChange(option.value);
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.surface : '#EBEBEB',
          borderColor: isDark ? colors.borderStrong : '#D8D8D8',
        },
      ]}
      onLayout={handleLayout}
    >
      {/* Animated active pill */}
      <Animated.View
        style={[
          styles.pill,
          {
            width: `${100 / options.length}%`,
            backgroundColor: isDark ? colors.surfaceHigh : '#FFFFFF',
            shadowColor: isDark ? '#000' : '#000',
            shadowOpacity: isDark ? 0.5 : 0.12,
            transform: [{ translateX }],
          },
        ]}
      />

      {/* Segment labels */}
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            style={styles.segment}
            onPress={() => handlePress(option, index)}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive
                    ? isDark ? colors.foreground : colors.foreground
                    : colors.muted,
                  fontWeight: isActive ? '700' : '500',
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    zIndex: 1,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
});
