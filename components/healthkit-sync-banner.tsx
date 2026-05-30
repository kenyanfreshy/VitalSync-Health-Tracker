/**
 * HealthKitSyncBanner
 *
 * A subtle, non-blocking banner that appears on the Dashboard during the
 * automatic post-permission sync triggered on first launch. It:
 *
 *  - Slides in from the top with a fade when a first-sync begins
 *  - Shows an animated pulsing heart icon + "Importing from Apple Health…" label
 *  - Displays the current sync step (e.g. "Blood Pressure", "Heart Rate…")
 *  - Shows a thin progress bar that fills as sync.progress advances
 *  - Automatically slides out and fades when the sync completes
 *  - Persists a flag to AsyncStorage so it never reappears after the first sync
 *
 * The banner is distinct from the ForceSyncBar (which is always visible).
 * It only appears when:
 *   1. The user just granted HealthKit permissions (isFirstSync = true), AND
 *   2. sync.isRunning = true
 *
 * Usage:
 *   <HealthKitSyncBanner sync={sync} isFirstSync={isFirstSync} />
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { markFirstSyncSeen } from '@/lib/health/first-sync-tracker';
import { useColorScheme, useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { SyncProgress } from '@/lib/health/types';
// Pure logic lives in a separate module so it can be tested without React Native UI
export {
  FIRST_SYNC_SEEN_KEY,
  markFirstSyncSeen,
  isFirstHealthKitSync,
} from '@/lib/health/first-sync-tracker';

// ─── Component ───────────────────────────────────────────────────────────────

interface HealthKitSyncBannerProps {
  sync: SyncProgress;
  /** True only on the very first sync after permissions are granted. */
  isFirstSync: boolean;
}

export function HealthKitSyncBanner({ sync, isFirstSync }: HealthKitSyncBannerProps) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';

  // ── Visibility state ──────────────────────────────────────────────────────
  // We track whether the banner should be rendered at all (mounted) separately
  // from whether it is visually visible (animated in). This lets us animate
  // out before unmounting.
  const [mounted, setMounted] = useState(false);
  const hasMarkedSeen = useRef(false);

  // ── Animated values ───────────────────────────────────────────────────────
  const translateY = useRef(new Animated.Value(-80)).current; // slides in from top
  const opacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartPulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // ── Mount / unmount logic ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isFirstSync) return;
    if (Platform.OS === 'web') return; // banner is iOS-specific

    if (sync.isRunning) {
      // Mount and slide in
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 160,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      // Start heart pulse loop
      heartPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(heartScale, { toValue: 1.18, duration: 500, useNativeDriver: true }),
          Animated.timing(heartScale, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])
      );
      heartPulseLoop.current.start();
    } else if (mounted) {
      // Sync finished — stop pulse, slide out, then unmount
      heartPulseLoop.current?.stop();
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -80,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false);
        // Mark as seen so it never reappears
        if (!hasMarkedSeen.current) {
          hasMarkedSeen.current = true;
          markFirstSyncSeen();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.isRunning, isFirstSync]);

  // ── Progress bar animation ────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: sync.progress,
      duration: 400,
      useNativeDriver: false, // width is not supported by native driver
    }).start();
  }, [sync.progress, progressAnim]);

  if (!mounted || !isFirstSync || Platform.OS === 'web') return null;

  // ── Derived step label ────────────────────────────────────────────────────
  const stepLabel = sync.currentStep
    ? sync.currentStep.length > 32
      ? sync.currentStep.slice(0, 32) + '…'
      : sync.currentStep
    : 'Connecting to Apple Health…';

  // ── Colors ────────────────────────────────────────────────────────────────
  const bannerBg = isDark ? '#0A1F1C' : '#F0FDF9';
  const bannerBorder = isDark ? colors.primary + '40' : colors.primary + '50';
  const iconBg = isDark ? colors.primary + '25' : colors.primary + '18';
  const progressTrackBg = isDark ? colors.primary + '20' : colors.primary + '15';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bannerBg,
          borderColor: bannerBorder,
          shadowColor: isDark ? colors.primary : colors.shadowBase,
          shadowOpacity: isDark ? 0.35 : 0.08,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Importing from Apple Health. ${stepLabel}`}
    >
      {/* ── Progress bar (top edge) ────────────────────────────────────────── */}
      <View style={[styles.progressTrack, { backgroundColor: progressTrackBg }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.primary,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              shadowColor: isDark ? colors.primary : 'transparent',
              shadowOpacity: isDark ? 0.9 : 0,
              shadowRadius: isDark ? 4 : 0,
            },
          ]}
        />
      </View>

      {/* ── Content row ───────────────────────────────────────────────────── */}
      <View style={styles.row}>
        {/* Pulsing heart icon */}
        <Animated.View
          style={[
            styles.iconContainer,
            { backgroundColor: iconBg, transform: [{ scale: heartScale }] },
          ]}
        >
          <IconSymbol name="heart.fill" size={18} color={colors.primary} />
        </Animated.View>

        {/* Text block */}
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.primary }]}>
            Importing from Apple Health…
          </Text>
          <Text style={[styles.step, { color: colors.muted }]} numberOfLines={1}>
            {stepLabel}
          </Text>
        </View>

        {/* Completion percentage */}
        <Text style={[styles.pct, { color: colors.primary }]}>
          {Math.round(sync.progress * 100)}%
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 11,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  step: {
    fontSize: 11,
    fontWeight: '400',
  },
  pct: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    flexShrink: 0,
  },
});
