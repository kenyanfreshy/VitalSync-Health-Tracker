/**
 * SectionCard — Shared elevated card container.
 *
 * Provides consistent Skeuo-Minimalist depth across all screens.
 * Light: white raised card with soft drop shadow.
 * Dark:  surfaceRaised (#1E2229) with stronger shadow + inner highlight.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, useColorScheme } from 'react-native';
import { useColors } from '@/hooks';

interface SectionCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Elevation level: 1=surface, 2=raised (default), 3=high */
  elevation?: 1 | 2 | 3;
  /** Skip the inner top-highlight strip */
  noHighlight?: boolean;
}

export function SectionCard({
  children,
  style,
  elevation = 2,
  noHighlight = false,
}: SectionCardProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const bgColor =
    elevation === 1 ? colors.surface
    : elevation === 3 ? colors.surfaceHigh
    : colors.surfaceRaised;

  const shadowProps: ViewStyle = isDark
    ? {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: elevation === 1 ? 2 : elevation === 3 ? 8 : 4 },
        shadowOpacity: elevation === 1 ? 0.35 : elevation === 3 ? 0.55 : 0.45,
        shadowRadius: elevation === 1 ? 6 : elevation === 3 ? 16 : 10,
        elevation: elevation * 3,
      }
    : {
        shadowColor: colors.shadowBase,
        shadowOffset: { width: 0, height: elevation },
        shadowOpacity: 0.07,
        shadowRadius: elevation * 3,
        elevation: elevation,
      };

  const borderColor = isDark ? colors.borderStrong : colors.border;
  const highlightColor = isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.9)';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bgColor, borderColor },
        shadowProps,
        style,
      ]}
    >
      {/* Inner top highlight — simulates physical card edge */}
      {!noHighlight && (
        <View style={[styles.innerHighlight, { backgroundColor: highlightColor }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 1,
  },
});
