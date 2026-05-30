/**
 * ForceSyncBar — Tactile sync button with real-time animated progress bar.
 *
 * Dark mode: deeper surface, stronger shadow, progress bar with a subtle glow.
 * Light mode: soft card shadow, clean white surface.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, Platform, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
 Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { SyncProgress } from '@/lib/health/types';

interface ForceSyncBarProps {
  sync: SyncProgress;
  onSync: () => void;
  lastSyncedAt: string | null;
}

export function ForceSyncBar({ sync, onSync, lastSyncedAt }: ForceSyncBarProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const progressWidth = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  // Animate progress bar width
  useEffect(() => {
    if (sync.isRunning) {
      progressWidth.value = withTiming(sync.progress, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
    } else if (sync.progress === 1) {
      progressWidth.value = withTiming(1, { duration: 200 });
      setTimeout(() => {
        progressWidth.value = withTiming(0, { duration: 600 });
      }, 1500);
    } else {
      progressWidth.value = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.progress, sync.isRunning]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%` as any,
  }), [progressWidth]);

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }), [buttonScale]);

  function handlePress() {
    if (sync.isRunning) return;
    buttonScale.value = withSpring(0.96, { damping: 15 });
    setTimeout(() => {
      buttonScale.value = withSpring(1, { damping: 15 });
    }, 100);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSync();
  }

  function formatLastSync(iso: string | null): string {
    if (!iso) return 'Never synced';
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  }

  const isComplete = !sync.isRunning && sync.progress === 1;

  const progressColor = isComplete ? colors.success : colors.primary;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.5 : 0.08,
          shadowRadius: isDark ? 12 : 6,
        },
      ]}
    >
      {/* ── Progress bar track ────────────────────────────────────────────── */}
      <View style={[styles.progressTrack, { backgroundColor: isDark ? colors.border : colors.border }]}>
        <Animated.View
          style={[
            styles.progressFill,
            progressStyle,
            {
              backgroundColor: progressColor,
              // Glow effect in dark mode
              shadowColor: isDark ? progressColor : 'transparent',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: isDark ? 0.8 : 0,
              shadowRadius: isDark ? 6 : 0,
            },
          ]}
        />
      </View>

      {/* ── Content row ──────────────────────────────────────────────────── */}
      <View style={styles.row}>
        {/* Status text */}
        <View style={styles.statusArea}>
          {sync.isRunning ? (
            <>
              <Text style={[styles.statusLabel, { color: colors.primary }]}>Syncing...</Text>
              <Text style={[styles.stepText, { color: colors.muted }]} numberOfLines={1}>
                {sync.currentStep}
              </Text>
            </>
          ) : isComplete ? (
            <>
              <Text style={[styles.statusLabel, { color: colors.success }]}>Sync Complete</Text>
              <Text style={[styles.stepText, { color: colors.muted }]}>All vitals updated</Text>
            </>
          ) : (
            <>
              <Text style={[styles.statusLabel, { color: colors.foreground }]}>Health Data</Text>
              <Text style={[styles.stepText, { color: colors.muted }]}>
                Last sync: {formatLastSync(lastSyncedAt)}
              </Text>
            </>
          )}
        </View>

        {/* Sync button */}
        <Animated.View style={buttonAnimStyle}>
          <Pressable
            style={({ pressed }) => [
              styles.syncButton,
              {
                backgroundColor: sync.isRunning
                  ? (isDark ? colors.border : colors.border)
                  : colors.primary,
                opacity: pressed ? 0.85 : 1,
                // Glow on active button in dark mode
                shadowColor: isDark && !sync.isRunning ? colors.primary : 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: isDark && !sync.isRunning ? 0.6 : 0,
                shadowRadius: isDark && !sync.isRunning ? 8 : 0,
              },
            ]}
            onPress={handlePress}
            disabled={sync.isRunning}
          >
            <IconSymbol
              name="arrow.clockwise"
              size={14}
              color={sync.isRunning ? colors.muted : '#FFFFFF'}
            />
            <Text
              style={[
                styles.syncButtonText,
                { color: sync.isRunning ? colors.muted : '#FFFFFF' },
              ]}
            >
              {sync.isRunning ? 'Syncing' : 'Force Sync'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  statusArea: {
    flex: 1,
    gap: 2,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  stepText: {
    fontSize: 11,
    fontWeight: '400',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
