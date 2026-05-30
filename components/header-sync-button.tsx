/**
 * HeaderSyncButton
 *
 * Compact tappable sync pill for the Dashboard header icon row.
 *
 * States:
 *   • Syncing  — spinning ↻ icon + "Syncing…" label in primary colour
 *               + floating tooltip below showing sync.currentStep
 *   • Complete — ✓ icon + "Done" in success colour (fades after 3 s)
 *   • Idle     — ↻ icon + "Xm ago" in muted colour; tap triggers forceSync
 *   • Never    — ↻ icon + "Sync" label; tap triggers forceSync
 *
 * Design: same pill shape as the existing header badges (globeBtn, privacyBadge).
 * Includes a thin animated progress bar along the bottom edge while syncing.
 * Floating tooltip is absolutely positioned below the pill, fades in/out with
 * Animated.timing so it never causes layout shifts.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors, useLang } from '@/hooks';
import type { SyncProgress } from '@/lib/health/types';

interface HeaderSyncButtonProps {
  sync: SyncProgress;
  onSync: () => void;
  lastSyncedAt: string | null;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Sync';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Humanise the raw currentStep string from the health engine */
function humaniseStep(step: string): string {
  if (!step) return 'Importing health data…';
  // Map known step IDs to friendly labels
  const map: Record<string, string> = {
    blood_pressure:   'Importing blood pressure…',
    heart_rate:       'Importing heart rate…',
    hrv:              'Importing HRV…',
    sleep:            'Importing sleep data…',
    steps:            'Importing step count…',
    weight:           'Importing weight…',
    blood_glucose:    'Importing blood glucose…',
    spo2:             'Importing SpO₂…',
    respiratory_rate: 'Importing respiratory rate…',
    temperature:      'Importing temperature…',
    nutrition:        'Importing nutrition…',
    activity:         'Importing activity…',
    done:             'Sync complete ✓',
  };
  // Keep digits so 'spo2' stays 'spo2'; only strip non-alphanumeric/underscore chars
  const key = step.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return map[key] ?? `Importing ${step.replace(/_/g, ' ')}…`;
}

export function HeaderSyncButton({ sync, onSync, lastSyncedAt }: HeaderSyncButtonProps) {
  const colors = useColors();
  const _lang = useLang();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // Spinning animation
  const spinAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Scale feedback on press
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Tooltip fade animation
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipVisible = useRef(false);

  // Live relative time label
  const [relativeTime, setRelativeTime] = useState(() => formatRelativeTime(lastSyncedAt));

  // Frozen tooltip label — keep the last non-empty step so the tooltip
  // doesn't flicker to blank between step transitions
  const [tooltipLabel, setTooltipLabel] = useState('');

  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastSyncedAt));
    if (!lastSyncedAt) return;
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncedAt));
    }, 30_000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  // Spin while syncing
  useEffect(() => {
    if (sync.isRunning) {
      loopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      spinAnim.setValue(0);
    }
    return () => { loopRef.current?.stop(); };
  }, [sync.isRunning, spinAnim]);

  // Progress bar
  useEffect(() => {
    if (sync.isRunning) {
      Animated.timing(progressAnim, {
        toValue: sync.progress,
        duration: 400,
        useNativeDriver: false,
      }).start();
    } else if (sync.progress === 1) {
      Animated.timing(progressAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
      setTimeout(() => {
        Animated.timing(progressAnim, { toValue: 0, duration: 600, useNativeDriver: false }).start();
      }, 1500);
    } else {
      progressAnim.setValue(0);
    }
  }, [sync.progress, sync.isRunning, progressAnim]);

  // Tooltip: fade in when syncing starts, update label on each step,
  // fade out when sync stops
  useEffect(() => {
    if (sync.isRunning) {
      // Update label (keep previous if step is empty)
      if (sync.currentStep) {
        setTooltipLabel(humaniseStep(sync.currentStep));
      }
      if (!tooltipVisible.current) {
        tooltipVisible.current = true;
        Animated.timing(tooltipOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    } else {
      if (tooltipVisible.current) {
        tooltipVisible.current = false;
        Animated.timing(tooltipOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [sync.isRunning, sync.currentStep, tooltipOpacity]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const isComplete = !sync.isRunning && sync.progress === 1;
  const isSyncing = sync.isRunning;

  const accentColor = isSyncing
    ? colors.primary
    : isComplete
      ? colors.success
      : colors.muted;

  const bgColor = isSyncing
    ? (colors.primary + '18')
    : isComplete
      ? (colors.success + '18')
      : (colors.muted + '14');

  const borderColor = isSyncing
    ? (colors.primary + '50')
    : isComplete
      ? (colors.success + '50')
      : (colors.muted + '35');

  function handlePress() {
    if (isSyncing) return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSync();
  }

  const iconLabel = isSyncing ? '↻' : isComplete ? '✓' : '↻';

  return (
    // Outer wrapper must NOT clip so the tooltip can overflow downward
    <View style={styles.wrapper}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPress={handlePress}
          disabled={isSyncing}
          style={[
            styles.pill,
            {
              backgroundColor: bgColor,
              borderColor,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isSyncing ? 'Syncing health data' : 'Sync health data'}
          accessibilityHint={isSyncing ? undefined : 'Double-tap to force sync'}
        >
          {/* Icon */}
          <Animated.Text
            style={[
              styles.icon,
              { color: accentColor },
              isSyncing && { transform: [{ rotate }] },
            ]}
          >
            {iconLabel}
          </Animated.Text>

          {/* Label */}
          <Text style={[styles.label, { color: accentColor }]} numberOfLines={1}>
            {isSyncing
              ? 'Syncing…'
              : isComplete
                ? (_lang === 'es' ? 'Listo' : _lang === 'fr' ? 'Terminé' : _lang === 'de' ? 'Fertig' : _lang === 'pt' ? 'Concluído' : _lang === 'zh' ? '完成' : _lang === 'ar' ? 'تم' : _lang === 'ja' ? '完了' : _lang === 'ko' ? '완료' : _lang === 'it' ? 'Fatto' : _lang === 'ru' ? 'Готово' : _lang === 'pl' ? 'Gotowe' : _lang === 'nl' ? 'Klaar' : _lang === 'tr' ? 'Tamam' : _lang === 'sv' ? 'Klar' : _lang === 'no' ? 'Ferdig' : _lang === 'hi' ? 'हो गया' : _lang === 'he' ? 'בוצע' : _lang === 'uk' ? 'Готово' : _lang === 'hy' ? 'Կատարված' : 'Done')
                : relativeTime}
          </Text>

          {/* Progress bar along bottom edge */}
          {(isSyncing || isComplete) && (
            <Animated.View
              style={[
                styles.progressBar,
                {
                  backgroundColor: accentColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }) as any,
                },
              ]}
            />
          )}
        </Pressable>
      </Animated.View>

      {/* ── Floating tooltip ─────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tooltip,
          {
            backgroundColor: isDark ? 'rgba(15,17,25,0.92)' : 'rgba(255,255,255,0.96)',
            borderColor: isDark
              ? `${colors.primary}40`
              : `${colors.primary}28`,
            opacity: tooltipOpacity,
          },
        ]}
      >
        {/* Tiny caret pointing up toward the pill */}
        <View style={[
          styles.tooltipCaret,
          { borderBottomColor: isDark ? 'rgba(15,17,25,0.92)' : 'rgba(255,255,255,0.96)' },
        ]} />
        <Text
          style={[styles.tooltipText, { color: isDark ? colors.primary : colors.primary }]}
          numberOfLines={1}
        >
          {tooltipLabel}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // Must NOT set overflow:hidden so tooltip can overflow downward
    position: 'relative',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  icon: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    maxWidth: 64,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 1,
  },

  // Floating tooltip
  tooltip: {
    position: 'absolute',
    top: '100%',
    // Center horizontally under the pill — marginTop accounts for caret
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    // Prevent wrapping
    minWidth: 160,
    maxWidth: 240,
    alignItems: 'center',
    // Ensure it floats above sibling header elements
    zIndex: 999,
  },
  tooltipCaret: {
    position: 'absolute',
    top: -5,
    // Center the caret
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
