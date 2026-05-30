/**
 * SectionLabel — Dashboard section header rendered as a pill-shaped tab chip.
 *
 * Features:
 *  • Distinct premium medical accent color per section
 *  • SF Symbol icon to the left of the label
 *  • Animated background fill transition on expand/collapse (250 ms)
 *  • Count badge with scale-pulse animation on change
 *  • Collapse chevron with rotation animation
 *  • Tap OR long-press to toggle
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { SymbolViewProps } from 'expo-symbols';

interface SectionLabelProps {
  /** Section title in ALL CAPS, e.g. "VITALS" */
  title: string;
  /** Number of cards in this section. Pass undefined to hide the badge. */
  count?: number;
  /**
   * Whether this section is currently collapsed.
   * When provided, a chevron is shown and tap toggles the section.
   */
  collapsed?: boolean;
  /** Called on tap/long-press to toggle the section. */
  onToggle?: () => void;
  /**
   * Premium medical accent color for this section's pill chip.
   * Defaults to the theme primary color if not provided.
   */
  accentColor?: string;
  /**
   * SF Symbol icon name to display inside the chip.
   * e.g. "heart.fill", "bell.fill", "fork.knife"
   */
  icon?: SymbolViewProps['name'];
}

export function SectionLabel({ title, count, collapsed, onToggle, accentColor, icon }: SectionLabelProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  // ── Animated background fill (0 = collapsed/transparent, 1 = expanded/filled) ─
  const fillAnim = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: collapsed ? 0 : 1,
      duration: 250,
      useNativeDriver: false, // backgroundColor cannot use native driver
    }).start();
  }, [collapsed, fillAnim]);

  const animatedBg = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [accent + '00', accent + '22'],
  });
  const animatedBorder = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [accent + '40', accent + '80'],
  });

  // ── Animated scale for count badge pulse ──────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevCount = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prevCount.current === undefined) {
      prevCount.current = count;
      return;
    }
    if (count === prevCount.current) return;
    prevCount.current = count;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [count, scaleAnim]);

  // ── Chevron rotation ───────────────────────────────────────────────────────
  const chevronAnim = useRef(new Animated.Value(collapsed ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: collapsed ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [collapsed, chevronAnim]);

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-90deg'],
  });

  function handlePress() {
    if (!onToggle) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  }

  const isInteractive = !!onToggle;
  const isExpanded = !collapsed;

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={handlePress}
        disabled={!isInteractive}
        style={({ pressed }) => [
          styles.pressable,
          pressed && isInteractive && { opacity: 0.75 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title} section, ${count ?? 0} cards${collapsed ? ', collapsed' : ', expanded'}. Tap to ${collapsed ? 'expand' : 'collapse'}.`}
      >
        <Animated.View
          style={[
            styles.chip,
            {
              backgroundColor: animatedBg,
              borderColor: animatedBorder,
            },
          ]}
        >
          {/* SF Symbol icon */}
          {icon && (
            <IconSymbol
              name={icon}
              size={12}
              color={isExpanded ? accent : accent + 'AA'}
              style={styles.icon}
            />
          )}

          {/* Accent dot (shown when no icon) */}
          {!icon && (
            <View style={[styles.dot, { backgroundColor: accent }]} />
          )}

          {/* Title */}
          <Text
            style={[
              styles.label,
              { color: isExpanded ? accent : accent + 'CC' },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>

          {/* Count badge */}
          {count !== undefined && (
            <Animated.View
              style={[
                styles.badge,
                { backgroundColor: accent + '30', transform: [{ scale: scaleAnim }] },
              ]}
            >
              <Text style={[styles.badgeText, { color: accent }]}>{count}</Text>
            </Animated.View>
          )}

          {/* Collapse chevron */}
          {isInteractive && (
            <Animated.Text
              style={[
                styles.chevron,
                { color: accent + 'CC', transform: [{ rotate: chevronRotate }] },
              ]}
            >
              ▾
            </Animated.Text>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  pressable: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    minWidth: 100,
    maxWidth: '100%',
    flexShrink: 1,
  },
  icon: {
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  badge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  chevron: {
    fontSize: 12,
    flexShrink: 0,
  },
});
