/**
 * SectionHeader — VitalSync consistent section heading
 *
 * Usage:
 *   <SectionHeader title="Today's Vitals" subtitle="Last updated 2 min ago" accent="green" />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useColors } from '@/hooks';

type AccentColor = 'green' | 'blue' | 'red' | 'amber' | 'purple' | 'none';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  accent?: AccentColor;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
}

const ACCENT_MAP: Record<AccentColor, string> = {
  green:  '#22C55E',
  blue:   '#38BDF8',
  red:    '#F43F5E',
  amber:  '#F59E0B',
  purple: '#A78BFA',
  none:   'transparent',
};

export function SectionHeader({
  title,
  subtitle,
  accent = 'none',
  rightElement,
  style,
}: SectionHeaderProps) {
  const colors = useColors();
  const accentColor = ACCENT_MAP[accent];

  return (
    <View style={[styles.container, style]}>
      <View style={styles.left}>
        {accent !== 'none' && (
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        )}
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {rightElement && <View style={styles.right}>{rightElement}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accentBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    marginRight: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  right: {
    marginLeft: 12,
  },
});
