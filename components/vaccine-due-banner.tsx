/**
 * VaccineDueBanner
 *
 * A dismissible yellow strip shown on the Dashboard when any immunization
 * record has a `nextDoseDate` that is overdue or due within 30 days.
 * Tapping the banner navigates to the Immunizations screen.
 *
 * Dismissal is session-only — the banner reappears on next app launch if
 * the vaccine is still due/overdue.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useHealth } from '@/lib/health/health-context';
import { useColors } from '@/hooks';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function computeBannerState(immunizations: { nextDoseDate?: string }[]): {
  hasOverdue: boolean;
  hasDueSoon: boolean;
  overdueCount: number;
  dueSoonCount: number;
} {
  const now = Date.now();
  let overdueCount = 0;
  let dueSoonCount = 0;
  for (const r of immunizations) {
    if (!r.nextDoseDate) continue;
    const ms = new Date(r.nextDoseDate + 'T00:00:00').getTime();
    if (ms < now) {
      overdueCount++;
    } else if (ms - now <= THIRTY_DAYS_MS) {
      dueSoonCount++;
    }
  }
  return {
    hasOverdue: overdueCount > 0,
    hasDueSoon: dueSoonCount > 0,
    overdueCount,
    dueSoonCount,
  };
}

export function VaccineDueBanner() {
  const router = useRouter();
  const colors = useColors();
  const { state } = useHealth();
  const [dismissed, setDismissed] = useState(false);

  const { hasOverdue, hasDueSoon, overdueCount, dueSoonCount } = useMemo(
    () => computeBannerState(state.data?.immunizations ?? []),
    [state.data?.immunizations],
  );

  if (dismissed || (!hasOverdue && !hasDueSoon)) return null;

  const isDark = colors.background === '#151718';
  const isOverdue = hasOverdue;

  // Colours: red-tinted for overdue, amber for due-soon
  const bgColor = isOverdue
    ? (isDark ? '#3B0A0A' : '#FEF2F2')
    : (isDark ? '#2D1A00' : '#FFFBEB');
  const borderColor = isOverdue
    ? (isDark ? '#7F1D1D80' : '#FCA5A580')
    : (isDark ? '#78350F80' : '#FCD34D80');
  const iconColor = isOverdue ? '#EF4444' : '#F59E0B';
  const textColor = isOverdue
    ? (isDark ? '#FCA5A5' : '#B91C1C')
    : (isDark ? '#FCD34D' : '#92400E');

  const _totalCount = overdueCount + dueSoonCount;
  const label = isOverdue
    ? `${overdueCount} vaccine${overdueCount !== 1 ? 's' : ''} overdue${dueSoonCount > 0 ? ` · ${dueSoonCount} due soon` : ''}`
    : `${dueSoonCount} vaccine${dueSoonCount !== 1 ? 's' : ''} due within 30 days`;

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/log/immunizations' as any);
  };

  const handleDismiss = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        s.banner,
        { backgroundColor: bgColor, borderColor },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to view immunizations.`}
    >
      <Text style={[s.icon, { color: iconColor }]}>
        {isOverdue ? '⚠️' : '💉'}
      </Text>
      <View style={s.textCol}>
        <Text style={[s.title, { color: textColor }]}>
          {isOverdue ? 'Vaccine Overdue' : 'Vaccine Due Soon'}
        </Text>
        <Text style={[s.sub, { color: textColor }]} numberOfLines={1}>
          {label} · Tap to view
        </Text>
      </View>
      {/* Dismiss X */}
      <Pressable
        onPress={handleDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={s.dismissBtn}
        accessibilityLabel="Dismiss vaccine banner"
      >
        <Text style={[s.dismissText, { color: textColor }]}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  icon: {
    fontSize: 20,
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  sub: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  dismissBtn: {
    paddingLeft: 8,
    flexShrink: 0,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
