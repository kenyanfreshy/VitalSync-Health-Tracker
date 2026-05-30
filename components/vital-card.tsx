/**
 * VitalCard — 3D Liquid Glass vital tile.
 *
 * Visual recipe (inspired by Apple's liquid glass design language):
 *   - Outer glass shell: thick rounded rect with a bright top-left specular rim
 *     and a darker bottom-right shadow rim — simulates a glass slab edge.
 *   - Inner glass body: LinearGradient from near-white at top to the accent
 *     tint at ~8% opacity at bottom, creating a translucent liquid-fill look.
 *   - Top specular streak: a narrow bright white gradient bar that fades left→right,
 *     mimicking light catching the top face of the glass.
 *   - Bottom inner shadow: a thin dark strip at the base of the inner face.
 *   - Outer drop shadow: deep shadow with accent-tinted colour for depth.
 *   - Dark mode: deeper glass with stronger glow, accent colour bleeds through
 *     the glass more visibly.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatRelativeTime } from '@/lib/utils';

type IconName =
  | 'heart.fill'
  | 'bed.double.fill'
  | 'figure.stand'
  | 'drop.fill'
  | 'lungs.fill'
  | 'bolt.fill'
  | 'moon.fill'
  | 'thermometer';

interface VitalCardProps {
  title: string;
  icon: IconName;
  accentColor: string;
  glowColor?: string;
  primaryValue: string;
  primaryUnit?: string;
  secondaryValue?: string;
  secondaryLabel?: string;
  statusBadge?: { label: string; color: string };
  trend?: 'up' | 'down' | 'stable';
  /** ISO timestamp of the most recent reading for this metric */
  lastSyncedAt?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  isLoading?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Convert a hex colour to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function VitalCard({
  title,
  icon,
  accentColor,
  glowColor,
  primaryValue,
  primaryUnit,
  secondaryValue,
  secondaryLabel,
  statusBadge,
  trend,
  lastSyncedAt,
  onPress,
  onLongPress,
  isLoading = false,
}: VitalCardProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withTiming(0.96, { duration: 80 });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function handlePressOut() {
    scale.value = withTiming(1, { duration: 180 });
  }

  const trendIcon = trend === 'up' ? 'arrow.up.right' : trend === 'down' ? 'arrow.down.right' : 'minus.circle';
  const trendColor = trend === 'up' ? colors.bpAmber : trend === 'down' ? colors.bpGreen : colors.muted;

  const effectiveGlow = glowColor ?? accentColor;

  // ── Glass depth shadow ───────────────────────────────────────────────────
  // The outer shadow is tinted with the accent colour for a "glowing glass" feel.
  const shadowProps = isDark
    ? {
        shadowColor: effectiveGlow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
        elevation: 10,
      }
    : {
        shadowColor: effectiveGlow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: 6,
      };

  // ── Glass body gradient colours ──────────────────────────────────────────
  // Light mode: near-white top → accent-tinted translucent bottom
  // Dark mode:  dark glass top → deeper accent-tinted bottom
  const glassTopLight = 'rgba(255,255,255,0.82)';
  const glassMidLight = 'rgba(255,255,255,0.60)';
  const glassBottomLight = hexToRgba(accentColor, 0.08);

  const glassTopDark = 'rgba(255,255,255,0.10)';
  const glassMidDark = 'rgba(255,255,255,0.06)';
  const glassBottomDark = hexToRgba(accentColor, 0.18);

  const gradientColors = isDark
    ? ([glassTopDark, glassMidDark, glassBottomDark] as const)
    : ([glassTopLight, glassMidLight, glassBottomLight] as const);

  // ── Glass rim border colours ─────────────────────────────────────────────
  // Top-left rim: bright specular highlight (white)
  // Bottom-right rim: darker shadow edge
  // We simulate this with a multi-stop border by layering two thin absolute Views.
  const rimTopColor = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)';
  const rimBottomColor = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.10)';

  // Outer border: glass edge — a gradient-like effect via two nested borders
  const outerBorderColor = isDark
    ? hexToRgba(accentColor, 0.30)
    : hexToRgba(accentColor, 0.18);

  // ── Icon badge glass tint ────────────────────────────────────────────────
  const iconBadgeBg = isDark
    ? hexToRgba(accentColor, 0.22)
    : hexToRgba(accentColor, 0.14);

  const a11yLabel = primaryValue
    ? `${title}: ${primaryValue}${primaryUnit ? ' ' + primaryUnit : ''}${statusBadge ? ', ' + statusBadge.label : ''}`
    : title;

  return (
    <AnimatedPressable
      style={[animStyle, styles.cardWrapper]}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={onPress ? 'Tap to view details' : undefined}
    >
      {/* ── Outer glass shell — provides the rim shadow and border ─────────── */}
      <View
        style={[
          styles.glassShell,
          {
            borderColor: outerBorderColor,
          },
          shadowProps,
        ]}
      >
        {/* ── Glass body — LinearGradient fill ──────────────────────────────── */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.glassBody}
        >
          {/* ── Top specular streak — bright light catching the glass face ──── */}
          <LinearGradient
            colors={[
              isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.90)',
              isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.specularStreak}
          />

          {/* ── Top rim highlight — bright left/top edge of glass slab ──────── */}
          <View style={[styles.rimTop, { backgroundColor: rimTopColor }]} />
          <View style={[styles.rimLeft, { backgroundColor: rimTopColor }]} />

          {/* ── Bottom rim shadow — darker right/bottom edge ─────────────────── */}
          <View style={[styles.rimBottom, { backgroundColor: rimBottomColor }]} />
          <View style={[styles.rimRight, { backgroundColor: rimBottomColor }]} />

          {/* ── Accent inner glow — soft colour bleed at bottom of glass ─────── */}
          <LinearGradient
            colors={[
              'rgba(0,0,0,0)',
              hexToRgba(accentColor, isDark ? 0.20 : 0.10),
            ]}
            start={{ x: 0.5, y: 0.4 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.accentGlow}
          />

          {/* ── Card content ─────────────────────────────────────────────────── */}
          <View style={styles.content}>
            {/* ── Header row ─────────────────────────────────────────────────── */}
            <View style={styles.header}>
              <View style={[styles.iconBadge, { backgroundColor: iconBadgeBg }]}>
                <IconSymbol name={icon} size={16} color={accentColor} />
              </View>
              <Text
                style={[styles.title, { color: isDark ? colors.muted : colors.foregroundSub }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {title}
              </Text>
              {trend && (
                <IconSymbol name={trendIcon} size={14} color={trendColor} />
              )}
            </View>

            {/* ── Primary value ──────────────────────────────────────────────── */}
            {isLoading ? (
              <View style={[styles.skeletonPrimary, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]} />
            ) : (
              <View style={styles.valueRow}>
                <Text
                  style={[styles.primaryValue, { color: isDark ? colors.foreground : colors.foreground }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {primaryValue}
                  {primaryUnit ? (
                    <Text style={[styles.unit, { color: colors.muted }]}> {primaryUnit}</Text>
                  ) : null}
                </Text>
              </View>
            )}

            {/* ── Secondary value ────────────────────────────────────────────── */}
            {(secondaryValue || isLoading) && (
              <View style={styles.secondaryRow}>
                {isLoading ? (
                  <View style={[styles.skeletonSecondary, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]} />
                ) : (
                  <Text
                    style={[styles.secondaryText, { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {secondaryLabel ? `${secondaryLabel} ` : ''}
                    <Text style={[styles.secondaryValueInline, { color: colors.foregroundSub ?? colors.foreground }]}>
                      {secondaryValue}
                    </Text>
                  </Text>
                )}
              </View>
            )}

            {/* ── Status badge ───────────────────────────────────────────────── */}
            {statusBadge && !isLoading && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: hexToRgba(statusBadge.color, isDark ? 0.20 : 0.12),
                    borderColor: hexToRgba(statusBadge.color, isDark ? 0.45 : 0.30),
                  },
                ]}
              >
                <Text style={[styles.badgeText, { color: statusBadge.color }]} numberOfLines={1}>
                  {statusBadge.label}
                </Text>
              </View>
            )}

            {/* ── Last synced timestamp ──────────────────────────────────────── */}
            {!isLoading && (() => {
              const rel = formatRelativeTime(lastSyncedAt);
              if (!rel) return null;
              const isStale = lastSyncedAt
                ? Date.now() - new Date(lastSyncedAt).getTime() > 86_400_000
                : false;
              const timestampColor = isStale ? colors.warning : colors.muted;
              return (
                <View style={styles.syncedAtRow}>
                  {isStale && (
                    <IconSymbol
                      name="exclamationmark.triangle.fill"
                      size={9}
                      color={timestampColor}
                      style={styles.syncedAtIcon}
                    />
                  )}
                  <Text
                    style={[styles.syncedAt, { color: timestampColor }]}
                    numberOfLines={1}
                  >
                    {rel}
                  </Text>
                </View>
              );
            })()}

            {/* ── Chevron ────────────────────────────────────────────────────── */}
            <View style={styles.chevronContainer}>
              <IconSymbol name="chevron.right" size={12} color={isDark ? 'rgba(255,255,255,0.30)' : hexToRgba(accentColor, 0.50)} />
            </View>
          </View>
        </LinearGradient>
      </View>
    </AnimatedPressable>
  );
}

const RADIUS = 22;

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    minWidth: 0,
  },
  // ── Outer glass shell ────────────────────────────────────────────────────
  // Provides the glass edge border and the drop shadow.
  glassShell: {
    borderRadius: RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  // ── Glass body ───────────────────────────────────────────────────────────
  // LinearGradient fills the entire shell.
  glassBody: {
    borderRadius: RADIUS - 1.5,
    overflow: 'hidden',
  },
  // ── Top specular streak ──────────────────────────────────────────────────
  // Horizontal gradient that fades right — simulates light on the glass face.
  specularStreak: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    borderTopLeftRadius: RADIUS - 1.5,
    borderTopRightRadius: RADIUS - 1.5,
  },
  // ── Glass rim highlights ─────────────────────────────────────────────────
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
  // ── Accent inner glow ────────────────────────────────────────────────────
  accentGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    borderBottomLeftRadius: RADIUS - 1.5,
    borderBottomRightRadius: RADIUS - 1.5,
  },
  // ── Content layer (sits above all glass effects) ─────────────────────────
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  valueRow: {
    marginBottom: 4,
  },
  primaryValue: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  unit: {
    fontSize: 12,
    fontWeight: '500',
  },
  secondaryRow: {
    marginBottom: 6,
  },
  secondaryText: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  secondaryValueInline: {
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chevronContainer: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  skeletonPrimary: {
    height: 36,
    width: '70%',
    borderRadius: 8,
    marginBottom: 6,
  },
  skeletonSecondary: {
    height: 14,
    width: '50%',
    borderRadius: 6,
  },
  syncedAtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    marginBottom: 2,
  },
  syncedAtIcon: {
    // keeps the icon vertically aligned with the text baseline
  },
  syncedAt: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.2,
    opacity: 0.85,
  },
});
