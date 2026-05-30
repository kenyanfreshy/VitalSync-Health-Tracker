/**
 * SectionTabBar — shared tab bar matching the Records nutrition tab style.
 *
 * Full-width, equal-column tabs with a 2px bottom-border active indicator.
 * Matches `unified-nutrition-card` subTabBar exactly.
 *
 * Usage:
 * ```tsx
 * <SectionTabBar
 *   tabs={[
 *     { key: 'daily', label: 'Today', icon: '📅' },
 *     { key: 'weekly', label: '7-Day', icon: '📊' },
 *   ]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   accentColor={colors.primary}
 * />
 * ```
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useColors } from '@/hooks';

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
  icon?: string;
}

interface SectionTabBarProps<T extends string = string> {
  tabs: TabDef<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  accentColor?: string;
}

export function SectionTabBar<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  accentColor,
}: SectionTabBarProps<T>) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  return (
    <View
      style={[
        styles.tabBar,
        { borderTopColor: colors.border, borderBottomColor: colors.border },
      ]}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.tabBtn,
              active && { borderBottomColor: accent, borderBottomWidth: 2 },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => onTabChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {tab.icon ? (
              <Text style={styles.tabIcon}>{tab.icon}</Text>
            ) : null}
            <Text style={[styles.tabLabel, { color: active ? accent : colors.muted }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabIcon: {
    fontSize: 13,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
