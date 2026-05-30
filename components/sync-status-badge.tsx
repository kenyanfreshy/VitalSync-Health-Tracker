/**
 * SyncStatusBadge
 *
 * Shows a subtle animated spinner while a sync is in progress, and a
 * "Last synced X min ago" label when idle. Renders nothing if no sync
 * has ever occurred and none is in progress.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks';

interface SyncStatusBadgeProps {
  isSyncing: boolean;
  lastSyncedAt: string | null;
}

function formatRelativeTime(isoDate: string): string {
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

export function SyncStatusBadge({ isSyncing, lastSyncedAt }: SyncStatusBadgeProps) {
  const colors = useColors();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Live-updating relative time label
  const [relativeTime, setRelativeTime] = useState<string | null>(
    lastSyncedAt ? formatRelativeTime(lastSyncedAt) : null
  );

  useEffect(() => {
    if (!lastSyncedAt) { setRelativeTime(null); return; }
    setRelativeTime(formatRelativeTime(lastSyncedAt));
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncedAt));
    }, 30_000); // update every 30s
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  // Spin animation while syncing
  useEffect(() => {
    if (isSyncing) {
      loopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      spinAnim.setValue(0);
    }
    return () => { loopRef.current?.stop(); };
  }, [isSyncing, spinAnim]);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!isSyncing && !relativeTime) return null;

  return (
    <View style={styles.container}>
      {isSyncing ? (
        <>
          <Animated.Text
            style={[styles.icon, { color: colors.primary, transform: [{ rotate }] }]}
          >
            ↻
          </Animated.Text>
          <Text style={[styles.label, { color: colors.primary }]}>Syncing…</Text>
        </>
      ) : (
        <>
          <Text style={[styles.icon, { color: colors.muted }]}>✓</Text>
          <Text style={[styles.label, { color: colors.muted }]}>
            {relativeTime}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  icon: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
});
