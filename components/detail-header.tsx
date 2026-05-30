/**
 * DetailHeader — Consistent back-navigation header for detail screens.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, Platform, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  accentColor?: string;
}

export function DetailHeader({ title, subtitle, accentColor }: DetailHeaderProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const router = useRouter();

  function handleBack() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.backButton,
          {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
            shadowColor: isDark ? '#000' : colors.shadowBase,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0.4 : 0.06,
            shadowRadius: 4,
            elevation: 2,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        onPress={handleBack}
      >
        <IconSymbol name="chevron.left" size={18} color={accentColor ?? colors.primary} />
      </Pressable>

      <View style={styles.titleArea}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleArea: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
});
