import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, StyleSheet, View, Text, Modal, Pressable, TouchableOpacity } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnreadAlertBadge } from "@/hooks/use-unread-alert-badge";
import { useMedReminderCount } from "@/hooks/use-med-reminder-count";
import { useLabResultsBadge } from "@/hooks/use-lab-results-badge";
import { useUpcomingAppointmentBadge } from "@/hooks/use-upcoming-appointment-badge";
import { useOverdueVaccineBadge } from "@/hooks/use-overdue-vaccine-badge";
import { useStaleSyncBadge } from "@/hooks/use-stale-sync-badge";
import { useRawLang, useLang } from "@/hooks/use-lang";
import { getLangFlag, getLangName } from "@/lib/lang-flags";
import { setLangOverride, settingsExtStrings } from "@/lib/i18n";
import { useTranslationContext } from "@/lib/i18n-ai";
import { WhatsNewSheet } from "@/components/whats-new-sheet";
import { appEvents } from "@/lib/app-events";
import { WHATS_NEW_SEEN_KEY, LATEST_WHATS_NEW_VERSION } from "@/lib/whats-new-version";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { safeSetItem } from '@/lib/safe-async-storage';
import { useSubscription } from '@/lib/subscription/subscription-context';
import { hasCompletedOnboarding } from '@/lib/onboarding';
// expo-updates is native-only; imported lazily to avoid web crash at module eval time

// AsyncStorage key that tracks which version the user has already seen
const LATEST_VERSION = LATEST_WHATS_NEW_VERSION;

/** Orange dot badge shown on the Record tab when an appointment is within 24 hours */
function AppointmentDot() {
  return (
    <View style={apptDotStyles.dot} />
  );
}
const apptDotStyles = StyleSheet.create({
  dot: {
    position: 'absolute',
    bottom: -3,
    right: -5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

/** Red dot badge shown on the Record tab when a vaccine is overdue */
function VaccineDot() {
  return (
    <View style={vaccineDotStyles.dot} />
  );
}
const vaccineDotStyles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -3,
    left: -5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

/** Grey-blue dot badge shown on the Record tab when health data is stale (>24h since last sync) */
function StaleSyncDot() {
  return (
    <View style={staleSyncDotStyles.dot} />
  );
}
const staleSyncDotStyles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -3,
    right: -5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#64748B',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

/** Amber dot badge shown on the Record tab when a vaccine is due within 30 days */
function VaccineDueSoonDot() {
  return (
    <View style={vaccineDueSoonDotStyles.dot} />
  );
}
const vaccineDueSoonDotStyles = StyleSheet.create({
  dot: {
    position: 'absolute',
    bottom: -3,
    left: -5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

/** Orange count badge shown on the Dashboard tab for pending medication reminders */
function MedReminderBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={medBadgeStyles.wrap}>
      <Text style={medBadgeStyles.text}>{count > 9 ? '9+' : String(count)}</Text>
    </View>
  );
}
const medBadgeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
});

/** Blue count badge shown on the Record tab when new lab results have been added */
function LabBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={labBadgeStyles.wrap}>
      <Text style={labBadgeStyles.text}>{count > 9 ? '9+' : String(count)}</Text>
    </View>
  );
}
const labBadgeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -5,
    left: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
});

/** Red dot badge overlaid on the Settings tab icon */
function AlertBadge({ count }: { count: number }) {
  const scale = useSharedValue(count > 0 ? 1 : 0);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > 0 && count !== prevCount.current) {
      // Pop-in: scale 0 → 1.25 → 1.0 over 300ms
      scale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1.25, { duration: 150 }),
        withTiming(1.0, { duration: 120 }),
      );
    } else if (count > 0 && prevCount.current === 0) {
      // First appearance
      scale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1.2, { duration: 180 }),
        withTiming(1.0, { duration: 100 }),
      );
    }
    prevCount.current = count;
  }, [count, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  if (count === 0) return null;
  return (
    <Animated.View style={[badgeStyles.wrap, animStyle]}>
      <Text style={badgeStyles.text}>{count > 9 ? '9+' : String(count)}</Text>
    </Animated.View>
  );
}

/** Blue "What's New" dot badge — purely visual, no touch handler.
 * Previously this was a TouchableOpacity which intercepted every Settings tab press
 * and opened the What's New sheet as a false positive. The sheet is now opened via
 * the Settings screen header button or the long-press tooltip on the gear icon.
 */
function UpdateBadge({ show, onPress: _onPress }: { show: boolean; onPress?: () => void }) {
  if (!show) return null;
  return (
    <View style={badgeStyles.updateDotHitArea} pointerEvents="none">
      <View style={badgeStyles.updateDot} />
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  updateDotHitArea: {
    position: 'absolute',
    top: -6,
    left: -6,
    padding: 4,
  },
  updateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

/** Purple "X days left" trial countdown chip shown on Settings tab when trial ≤ 3 days remaining */
function TrialCountdownBadge({ daysLeft }: { daysLeft: number }) {
  const scale = useSharedValue(daysLeft > 0 ? 1 : 0);
  const prevDays = useRef(daysLeft);

  useEffect(() => {
    if (daysLeft > 0 && prevDays.current === 0) {
      // First appearance: pop-in animation
      scale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1.4, { duration: 160 }),
        withTiming(1.0, { duration: 120 }),
      );
    } else if (daysLeft > 0 && prevDays.current !== daysLeft) {
      // Day count changed while already visible: subtle bounce
      scale.value = withSequence(
        withTiming(1.25, { duration: 140 }),
        withTiming(1.0, { duration: 110 }),
      );
    } else if (daysLeft > 0 && scale.value === 0) {
      // Mount with daysLeft already > 0 (e.g. initial render)
      scale.value = withTiming(1, { duration: 200 });
    }
    prevDays.current = daysLeft;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysLeft]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  if (daysLeft <= 0) return null;
  return (
    <Animated.View style={[trialBadgeStyles.wrap, animStyle]}>
      <Text style={trialBadgeStyles.text}>{daysLeft}d</Text>
    </Animated.View>
  );
}
const trialBadgeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: -5,
    right: -8,
    minWidth: 18,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 11,
  },
});

/** Settings tab icon with gear + alert badge + update dot + animated language flag overlay + long-press tooltip */
function SettingsTabIcon({
  color,
  size,
  unreadAlerts,
  onWhatsNewPress,
  hasUpdate,
  trialDaysLeft,
}: {
  color: string;
  size: number;
  unreadAlerts: number;
  onWhatsNewPress: () => void;
  hasUpdate: boolean;
  trialDaysLeft: number;
}) {
  const rawLang = useRawLang();
  const flag = rawLang !== 'en' ? getLangFlag(rawLang) : null;
  const langName = rawLang !== 'en' ? getLangName(rawLang) : null;
  const isDark = useColorScheme() === 'dark';

  // Animated scale for flag overlay — bounces in when language changes
  const flagScale = useSharedValue(0);
  const prevLang = useRef(rawLang);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (rawLang !== prevLang.current) {
      prevLang.current = rawLang;
      if (rawLang !== 'en') {
        flagScale.value = withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1.4, { duration: 180 }),
          withTiming(1, { duration: 120 }),
        );
      } else {
        flagScale.value = withTiming(0, { duration: 150 });
      }
    } else if (rawLang !== 'en' && flagScale.value === 0) {
      flagScale.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawLang]);

  useEffect(() => {
    if (rawLang !== 'en') {
      flagScale.value = withTiming(1, { duration: 250 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedFlagStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flagScale.value }],
  }), [flagScale]);

  const handleSwitchToEnglish = async () => {
    setShowTooltip(false);
    await setLangOverride('en');
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={{ position: 'relative' }}
        onLongPress={() => {
          if (langName) {
            setShowTooltip(true);
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }
        }}
        delayLongPress={400}
        activeOpacity={1}
      >
        <IconSymbol size={size} name="gearshape.fill" color={color} />
        <AlertBadge count={unreadAlerts} />
        <UpdateBadge show={hasUpdate} onPress={onWhatsNewPress} />
        <TrialCountdownBadge daysLeft={trialDaysLeft} />
        {flag && (
          <Animated.View style={[flagStyles.wrap, animatedFlagStyle]}>
            <Text style={flagStyles.emoji}>{flag}</Text>
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* Long-press tooltip */}
      {showTooltip && langName && (
        <Modal
          transparent
          animationType="fade"
          visible={showTooltip}
          onRequestClose={() => setShowTooltip(false)}
        >
          <Pressable
            style={tooltipStyles.overlay}
            onPress={() => setShowTooltip(false)}
          >
            <View style={[tooltipStyles.bubble, {
              backgroundColor: isDark ? '#1E293B' : '#0F172A',
              shadowColor: isDark ? '#22C55E' : '#000',
            }]}>
              <Text style={tooltipStyles.flag}>{flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={tooltipStyles.label}>Active language</Text>
                <Text style={tooltipStyles.name}>{langName}</Text>
                {/* Switch to English quick action */}
                <TouchableOpacity
                  onPress={handleSwitchToEnglish}
                  activeOpacity={0.7}
                  style={tooltipStyles.switchBtn}
                >
                  <Text style={tooltipStyles.switchText}>🇺🇸 Switch to English</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const flagStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: -5,
    right: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emoji: {
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
});

const tooltipStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 90,
    paddingRight: 16,
    backgroundColor: 'transparent',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 200,
  },
  flag: {
    fontSize: 28,
    marginTop: 2,
  },
  label: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  switchBtn: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'flex-start',
  },
  switchText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
});

export default function TabLayout() {
  const colors = useColors();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;
  const unreadAlerts = useUnreadAlertBadge();
  const { newCount: newLabCount } = useLabResultsBadge();
  const { hasBadge: hasUpcomingAppt, count: upcomingApptCount } = useUpcomingAppointmentBadge();
  const { hasBadge: hasOverdueVaccine, hasDueSoon: hasVaccineDueSoon } = useOverdueVaccineBadge();
  const isSyncStale = useStaleSyncBadge();
  const medReminderCount = useMedReminderCount();
  const lang = useLang();
  const se = settingsExtStrings[lang as keyof typeof settingsExtStrings] ?? settingsExtStrings.en;
  const { trialDaysRemaining, accessState: trialAccessState, isPremium: isTabBadgePremium } = useSubscription();
  // Show the trial badge only when trial_active with ≤3 days left
  const trialDaysLeft = (trialAccessState === 'trial_active' && trialDaysRemaining !== null && trialDaysRemaining <= 3)
    ? trialDaysRemaining
    : 0;

  // ── What's New state ────────────────────────────────────────────────────────
  // hasUpdate: true when expo-updates reports a new version OR the user hasn't
  // seen the latest release notes yet (first install / after an update).
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    let autoShowTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      // Check if user has already seen the latest release notes
      let isNewVersion = false;
      try {
        const seen = await AsyncStorage.getItem(WHATS_NEW_SEEN_KEY);
        if (seen !== LATEST_VERSION) {
          // Haven't seen this version yet — show the blue dot
          setHasUpdate(true);
          isNewVersion = true;
        }
      } catch (_unused) {
        // AsyncStorage unavailable — show dot anyway
        setHasUpdate(true);
        isNewVersion = true;
      }

      // Auto-show the sheet once per update for returning users who have
      // already completed onboarding. Delay 1.2 s so the tab bar finishes
      // mounting before the sheet animates in.
      if (isNewVersion) {
        try {
          const done = await hasCompletedOnboarding();
          if (done) {
            autoShowTimer = setTimeout(() => setShowWhatsNew(true), 1200);
          }
        } catch (_unused) {
          // Non-fatal — user can tap the dot manually
        }
      }

      // Also check expo-updates for an OTA update
      if (Platform.OS !== 'web') {
        try {
          const Updates = await import('expo-updates');
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) setHasUpdate(true);
        } catch (_unused) {
          // Dev mode or no update channel — silently ignore
        }
      }
    })();
    return () => { if (autoShowTimer) clearTimeout(autoShowTimer); };
  }, []);

  const handleWhatsNewPress = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowWhatsNew(true);
  }, []);

  // Subscribe to cross-component events so the Settings screen can open the sheet
  useEffect(() => {
    const unsub = appEvents.on('openWhatsNew', handleWhatsNewPress);
    return unsub;
  }, [handleWhatsNewPress]);

  const handleWhatsNewClose = useCallback(async () => {
    setShowWhatsNew(false);
    // Mark this version as seen so the dot disappears
    setHasUpdate(false);
    try {
      await safeSetItem(WHATS_NEW_SEEN_KEY, LATEST_VERSION);
    } catch (_unused) {
      // ignore
    }
  }, []);

  // ── Tab bar styling ─────────────────────────────────────────────────────────
  const tabBg = isDark
    ? 'rgba(14, 26, 22, 0.97)'
    : 'rgba(240, 252, 250, 0.98)';
  const tabBorder = isDark ? 'rgba(13, 148, 136, 0.18)' : 'rgba(13, 148, 136, 0.15)';

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            paddingTop: 10,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: tabBg,
            borderTopColor: tabBorder,
            borderTopWidth: 1,
            shadowColor: isDark ? '#22C55E' : '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: isDark ? 0.12 : 0.04,
            shadowRadius: 12,
            elevation: 8,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            letterSpacing: 0.3,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: se.tabDashboard,
            tabBarIcon: ({ color, size }) => (
              <View style={{ position: 'relative' }}>
                <IconSymbol size={size ?? 24} name="house.fill" color={color} />
                {isTabBadgePremium && <MedReminderBadge count={medReminderCount} />}
                <TrialCountdownBadge daysLeft={trialDaysLeft} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="record"
          options={{
            title: se.tabRecord,
            tabBarIcon: ({ color, size }) => (
              <View style={{ position: 'relative' }}>
                <IconSymbol size={size ?? 24} name="square.and.pencil" color={color} />
                <LabBadge count={newLabCount} />
                {isTabBadgePremium && hasUpcomingAppt && upcomingApptCount <= 1 && <AppointmentDot />}
                {isTabBadgePremium && upcomingApptCount > 1 && (
                  <View style={{
                    position: 'absolute', bottom: -4, right: -7,
                    minWidth: 16, height: 16, borderRadius: 8,
                    backgroundColor: '#F59E0B',
                    alignItems: 'center', justifyContent: 'center',
                    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#FFFFFF',
                  }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700', lineHeight: 12 }}>
                      {upcomingApptCount > 9 ? '9+' : String(upcomingApptCount)}
                    </Text>
                  </View>
                )}
                {hasOverdueVaccine && <VaccineDot />}
                {!hasOverdueVaccine && hasVaccineDueSoon && <VaccineDueSoonDot />}
                {isSyncStale && <StaleSyncDot />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="weather"
          options={{ href: null }}
        />
        {/* Hidden tabs — kept in router but not shown in tab bar */}
        <Tabs.Screen name="log" options={{ href: null }} />
        <Tabs.Screen name="neon-vitals" options={{ href: null }} />
        <Tabs.Screen
          name="analytics"
          options={{
            title: se.tabCorrelate,
            tabBarIcon: ({ color, size }) => (
              <IconSymbol size={size ?? 24} name="chart.bar.fill" color={color} />
            ),
          }}
        />
        {/* Medications moved into Personal Records section of Record tab */}
        <Tabs.Screen name="medications" options={{ href: null }} />
        <Tabs.Screen
          name="report"
          options={{
            title: se.tabHealthReport,
            tabBarIcon: ({ color, size }) => (
              <IconSymbol size={size ?? 24} name="doc.text.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: se.tabSettings,
            tabBarIcon: ({ color, size }) => (
              <SettingsTabIcon
                color={color}
                size={size ?? 24}
                unreadAlerts={unreadAlerts.count}
                onWhatsNewPress={handleWhatsNewPress}
                hasUpdate={hasUpdate}
                trialDaysLeft={trialDaysLeft}
              />
            ),
          }}
        />
      </Tabs>

      {/* What's New bottom sheet — rendered outside Tabs so it overlays everything */}
      <WhatsNewSheet visible={showWhatsNew} onClose={handleWhatsNewClose} />
    </>
  );
}
