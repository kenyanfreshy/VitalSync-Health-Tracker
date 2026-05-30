/**
 * GlassCard — Shared 3D Liquid Glass container.
 *
 * Provides the same glass shell used by BentoMetricTile and VitalCard,
 * as a generic wrapper for any dashboard card content.
 *
 * Visual layers (inside-out):
 *   1. Outer glass shell  — borderRadius 22, accent-tinted border, drop shadow
 *   2. Glass body gradient — LinearGradient top→bottom (near-white → accent tint)
 *   3. Specular streak    — horizontal gradient fading right (light on glass face)
 *   4. Rim highlights     — 1.5px bright top+left, dark bottom+right edges
 *   5. Accent inner glow  — soft colour bleed at bottom 60%
 *   6. Content slot       — children rendered above all glass layers
 *
 * Props:
 *   accentColor   — domain colour used for border, shadow, glow (default: #0D9488)
 *   style         — additional style for the outer shell (e.g. marginHorizontal)
 *   contentStyle  — additional style for the content padding wrapper
 *   noPadding     — skip the default content padding (use when child handles its own)
 *   onPress       — makes the card tappable
 *   ref           — forwarded to the outer View (for measureInWindow etc.)
 */

import React, { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  useColorScheme,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassCardProps {
  accentColor?: string;
  style?: ViewStyle | ViewStyle[];
  contentStyle?: ViewStyle;
  noPadding?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}

const RADIUS = 22;
const DEFAULT_ACCENT = '#22C55E';

/** Convert a hex colour to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const GlassCard = forwardRef<View, GlassCardProps>(function GlassCard(
  {
    accentColor = DEFAULT_ACCENT,
    style,
    contentStyle,
    noPadding = false,
    onPress,
    onLongPress,
    children,
  },
  ref,
) {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // ── Glass depth shadow ─────────────────────────────────────────────────
  const shadowProps = isDark
    ? {
        shadowColor: accentColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.30,
        shadowRadius: 18,
        elevation: 10,
      }
    : {
        shadowColor: accentColor,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 6,
      };

  // ── Glass body gradient ────────────────────────────────────────────────
  // Dark: solid dark base + translucent white overlay so text is always legible
  const glassBackdropColor = isDark ? '#161B22' : 'transparent';
  const gradientColors = isDark
    ? (['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.10)', hexToRgba(accentColor, 0.22)] as const)
    : (['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.76)', hexToRgba(accentColor, 0.07)] as const);

  // ── Rim colours ────────────────────────────────────────────────────────
  const rimTopColor    = isDark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.95)';
  const rimBottomColor = isDark ? 'rgba(0,0,0,0.40)'       : 'rgba(0,0,0,0.10)';

  // ── Outer border ───────────────────────────────────────────────────────
  const outerBorderColor = isDark
    ? hexToRgba(accentColor, 0.28)
    : hexToRgba(accentColor, 0.16);

  const shell = (
    <View ref={ref} style={[styles.glassShell, { borderColor: outerBorderColor, backgroundColor: glassBackdropColor }, shadowProps, style]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.glassBody}
      >
        {/* ── Top specular streak ─────────────────────────────────────────── */}
        <LinearGradient
          colors={[
            isDark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.90)',
            isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.28)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.specularStreak}
        />

        {/* ── Rim highlights ──────────────────────────────────────────────── */}
        <View style={[styles.rimTop,    { backgroundColor: rimTopColor }]} />
        <View style={[styles.rimLeft,   { backgroundColor: rimTopColor }]} />
        <View style={[styles.rimBottom, { backgroundColor: rimBottomColor }]} />
        <View style={[styles.rimRight,  { backgroundColor: rimBottomColor }]} />

        {/* ── Accent inner glow ───────────────────────────────────────────── */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', hexToRgba(accentColor, isDark ? 0.18 : 0.08)]}
          start={{ x: 0.5, y: 0.4 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.accentGlow}
        />

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <View style={[!noPadding && styles.defaultPadding, contentStyle]}>
          {children}
        </View>
      </LinearGradient>
    </View>
  );

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
      >
        {shell}
      </Pressable>
    );
  }

  return shell;
});

const styles = StyleSheet.create({
  glassShell: {
    borderRadius: RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  glassBody: {
    borderRadius: RADIUS - 1.5,
    overflow: 'hidden',
  },
  specularStreak: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    borderTopLeftRadius: RADIUS - 1.5,
    borderTopRightRadius: RADIUS - 1.5,
  },
  rimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderTopLeftRadius: RADIUS - 1.5,
    borderTopRightRadius: RADIUS - 1.5,
  },
  rimLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 1.5,
    borderTopLeftRadius: RADIUS - 1.5,
    borderBottomLeftRadius: RADIUS - 1.5,
  },
  rimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderBottomLeftRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  rimRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 1.5,
    borderTopRightRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  accentGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '40%',
    borderBottomLeftRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  defaultPadding: {
    padding: 16,
  },
});
