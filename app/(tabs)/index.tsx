import { safeFormatDate, safeFormatTime } from '@/lib/utils';
import { scheduleNotification } from '@/lib/notifications/schedule';
import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
/**
 * VitalSync Dashboard — Primary hub screen.
 * Shows 4 tactile vital cards + Force Sync bar + quick actions.
 */
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View, Pressable, Platform, useColorScheme, ActivityIndicator, TextInput, LayoutAnimation, Linking, Modal, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { SUPPORTED_LANGUAGES } from '@/lib/supported-languages';
import { hasAcceptedCurrentConsent } from '@/components/consent-modal';
import { hasAcceptedGdprConsent } from '@/app/consent';
import {
  VitalCardActionSheet,
  triggerVitalCardActionSheet,
  type VitalCardType,
} from '@/components/vital-card-action-sheet';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenContainer } from '@/components/screen-container';
import { VitalCard } from '@/components/vital-card';
import { HealthKitSyncBanner, isFirstHealthKitSync } from '@/components/healthkit-sync-banner';
import { HealthKitUnavailableBanner } from '@/components/healthkit-unavailable-banner';
import { VaccineDueBanner } from '@/components/vaccine-due-banner';
import { SmartReminderOrchestrator } from '@/components/subscription/SmartReminderBanners';
import { SegmentedControl } from '@/components/segmented-control';
import { WeeklySummaryCard } from '@/components/weekly-summary-card';
import { buildClinicalNarrative, urgencyColor } from '@/lib/health/clinical-narrative';
import { ActiveDietProfileCard } from '@/components/active-diet-profile-card';
import { MealIQTrendCard } from '@/components/meal-iq-trend-card';
import { CaloricBalanceMiniCard } from '@/components/caloric-balance-mini-card';
import { CaloriesTrendChart } from '@/components/calories-trend-chart';
import { MacroRingCard } from '@/components/macro-ring-card';
import { CalorieBurnCard } from '@/components/calorie-burn-card';
import { WeeklyMacroTrendChart } from '@/components/weekly-macro-trend-chart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useThemeContext } from '@/lib/theme-provider';
import { useColors, useDashboardStrings, useFoodCameraStrings, useLang, useRawLang } from '@/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { useDataSources } from '@/lib/data-sources/data-sources-context';
import { HeaderSyncButton } from '@/components/header-sync-button';
import { getBPStatus } from '@/lib/health/types';
import {
  DATE_RANGE_OPTIONS,
  DATE_RANGE_STORAGE_KEY,
  computeDashboardAverages,
  type DateRangeDays,
} from '@/lib/health/date-range';
import { homeStrings, logStrings, disclaimerStrings, dashboardStrings, medPdfStrings, setLangOverride, type Lang } from '@/lib/i18n';
import { useT, STATIC_LANGS, useTranslationContext } from '@/lib/i18n-ai';
import { applyRTLForLang, isRTLLang } from '@/lib/rtl';
import { getLangFlag } from '@/lib/lang-flags';
// expo-updates is native-only; imported lazily inside the handler to avoid
// a module evaluation crash on web or in environments without the native module.
import { WeeklyMacroTrendCard } from '@/components/weekly-macro-trend-card';
import { isHealthKitAvailable } from '@/lib/health/permissions';
import { showHealthKitToast } from '@/components/healthkit-toast';
import { loadUserProfile } from '@/lib/user-profile';
import { useUnitPreferences, fToC, applyLangUnitDefaults } from '@/hooks/use-unit-preferences';
import { DailyReadinessGauge } from '@/components/dashboard/daily-readiness-gauge';
import { ReadinessBreakdownSheet } from '@/components/dashboard/readiness-breakdown-sheet';
import { BentoMetricTile } from '@/components/dashboard/bento-metric-tile';
import {
  computeReadinessScore,
  buildSparklineData,
  bpStatusToMetricStatus,
  spo2ToMetricStatus,
  hrToMetricStatus,
  sleepToMetricStatus,
} from '@/lib/health/readiness-score';
import { saveReadinessSnapshot, loadReadinessHistory, getReadinessTrend } from '@/lib/health/readiness-history';
import { WeeklyMacroIntelCard } from '@/components/weekly-macro-intel-card';
import { useMacroGoals } from '@/hooks/use-macro-goals';
import { scheduleReadinessNotificationWithScore } from '@/lib/health/readiness-notification';
import { checkVitalsWeekMilestone } from '@/lib/health/vitals-streak-milestones';
import { getStreakMessages } from '@/lib/tone';
import { EmergencyVaultTile } from '@/components/dashboard/emergency-vault-tile';
import { PlainLanguageLabTranslator } from '@/components/dashboard/plain-language-lab-translator';
import { SmallWinsTracker } from '@/components/dashboard/small-wins-tracker';
import { SectionLabel } from '@/components/dashboard/section-label';
import { CollapsibleCard } from '@/components/dashboard/collapsible-card';
import { MedTodayNotificationCard } from '@/components/dashboard/med-today-notification-card';
import { VaccineDueNotificationCard } from '@/components/dashboard/vaccine-due-notification-card';
import { LogCard } from '@/components/log-card';
import { OnDeviceInsightsCard } from '@/components/dashboard/on-device-insights-card';
// DoctorAppointmentReminder and AppointmentHistoryCard removed — rebuilt in appointments screen
import { WeeklySugarChart } from '@/components/weekly-sugar-chart';
import { NeoSleepDashboardWidget } from '@/components/neo-sleep-dashboard-widget';
import { NeoSleepWeeklyChart } from '@/components/neo-sleep-3d-chart';
import { SmartNutritionCard } from '@/components/smart-nutrition-card';
import { appendReminderHistory, type ReminderCategory } from '@/lib/reminder-history';
import { AiFoodCameraSheet } from '@/components/ai-food-camera-sheet';
import { ConfettiBurst } from '@/components/confetti-burst';
import { NeoVitalMacroGraph, type MacroGraphData } from '@/components/neovital-macro-graph';
import { NeoVitalMiniCard } from '@/components/neovital-mini-card';

import { GlassCard } from '@/components/glass-card';
import { PersonalNarrativeCard } from '@/components/personal-narrative-card';
import { loadMedications, logDose, createDoseLog, logRescheduleEvent, reinstateDose, updateMedication } from '@/lib/medications/storage';
import type { Medication } from '@/lib/medications/types';
import { getAllPharmacies, getOpenTodayHours } from '@/lib/medications/pharmacy-store';
import { useSugarBudget } from '@/hooks/use-sugar-budget';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { useSleepGoal } from '@/hooks/use-sleep-goal';
import { useAdherenceGoal } from '@/hooks/use-adherence-goal';
import Svg, { Circle } from 'react-native-svg';
import ReAnimated, {
  useSharedValue as useRASV,
  useAnimatedStyle as useRAStyle,
  withTiming as withRATiming,
 Easing } from 'react-native-reanimated';
import { computeTIR, loadGlucoseThresholds, DEFAULT_GLUCOSE_THRESHOLDS, type GlucoseThresholdConfig } from '@/lib/health/glucose-thresholds';
import { LogAllVitalsSheet } from '@/components/log-all-vitals-sheet';
import { WeatherBadge } from '@/components/weather-badge';
import { ActivityReadinessCard } from '@/components/dashboard/activity-readiness-card';
import { GlucoseDashboardCard } from '@/components/dashboard/glucose-dashboard-card';
import { SwipeableBanner } from '@/components/swipeable-banner';
import { SnoozeDurationSheet } from '@/components/snooze-duration-sheet';
import { DraggableCardWrapper, DragPlaceholder, type DragState } from '@/components/dashboard/draggable-card-wrapper';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import { useWeatherContext } from '@/lib/weather/weather-context';
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';
import { type GlucoseReminderMode, AC_SLOT_TIMES_KEY, type AcSlotTimes, AC_DEFAULT_SLOTS } from '@/lib/health/sugar-notification';
import { useSubscription } from '@/lib/subscription/subscription-context';
import { paywallGuard } from '@/lib/subscription/paywall-guard';
import { GlucoseEmptyState } from '@/lib/health/health-empty-states';
import { useStaleThreshold } from '@/lib/health/stale-threshold';
import { useDashboardCardOrder, type DashboardCardId } from '@/hooks/use-dashboard-card-order';
import { useDashboardVisibility } from '@/hooks/use-dashboard-visibility';
import { useSnoozeCountdown } from '@/hooks/use-snooze-countdown';
import { EKGDashboardCard } from '@/components/dashboard/ekg-dashboard-card';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { logEvent } from '@/lib/analytics';
// Simple event bus for cross-component communication
const appEvents = { _listeners: {} as Record<string, Function[]>, emit(e: string) { (this._listeners[e] ?? []).forEach(fn => fn()); }, on(e: string, fn: Function) { (this._listeners[e] ??= []).push(fn); return () => { this._listeners[e] = (this._listeners[e] ?? []).filter(f => f !== fn); }; } };


// AnimatedView for MacroBar fill animation (View-only, safe with Reanimated v4)
const AnimatedView = ReAnimated.createAnimatedComponent(View);

/** Animated macro progress bar — animates fill from 0 → pct on mount */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MacroBar({ label, value, goal, color, isDark }: { label: string; value: number; goal: number; color: string; isDark: boolean }) {
  const pct = Math.min(value / Math.max(goal, 1), 1);
  const over = value > goal;
  const fillColor = over ? '#EF4444' : color;
  const width = useRASV(0);
  const animStyle = useRAStyle(() => ({ width: `${width.value * 100}%` as any }), [width]);
  useEffect(() => {
    width.value = withRATiming(pct, { duration: 400, easing: Easing.out(Easing.quad) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B', width: 38 }}>{label}</Text>
      <View style={{ flex: 1, height: 5, backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
        <AnimatedView style={[{ height: 5, backgroundColor: fillColor, borderRadius: 3 }, animStyle]} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '600', color: over ? '#EF4444' : (isDark ? '#94A3B8' : '#64748B'), width: 54, textAlign: 'right' }}>
        {Math.round(value)}g / {goal}g
      </Text>
    </View>
  );
}

// Stable English strings for Smart translation (defined outside component to avoid re-renders)
// Only include pure string values (no functions) for useT compatibility
const HOME_EN: Record<string, string> = homeStrings.en;

// All languages for the quick picker — derived from canonical SUPPORTED_LANGUAGES
const ALL_LANG_OPTIONS = SUPPORTED_LANGUAGES.map(l => ({
  code: l.code,
  label: l.label,
  native: l.native,
  ai: !l.isStatic,
}));

/**
 * Format an ISO timestamp as a human-readable relative time (e.g. "2 hrs ago", "just now").
 * Used by the Quick Entry card to show when each vital was last logged.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatTimeAgo(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

/**
 * StepRingCell — SVG arc ring for step progress (JS-thread animation via state).
 * Long-press to open the step goal picker sheet.
 */
function StepRingCell({
  todaySteps,
  stepGoal,
  borderColor,
  onLongPress,
  ringRef,
  stepsLabel,
}: {
  todaySteps: number | null;
  stepGoal: number;
  borderColor: string;
  onLongPress: () => void;
  ringRef?: React.RefObject<View | null>;
  stepsLabel?: string;
}) {
  const R = 14;
  const STROKE = 3;
  const circumference = 2 * Math.PI * R;
  const targetProgress = todaySteps != null ? Math.min(todaySteps / stepGoal, 1) : 0;
  const stepColor = targetProgress >= 1 ? '#10B981' : targetProgress >= 0.5 ? '#F59E0B' : '#6366F1';
  // Use JS-thread Animated.Value to avoid Reanimated SVG animatedProps crash on native
  const animProgress = useRef(new Animated.Value(0)).current;
  const [dashArray, setDashArray] = useState(`0 ${circumference}`);
  useEffect(() => {
    animProgress.setValue(0);
    const listener = animProgress.addListener(({ value }) => {
      const dash = value * circumference;
      const gap = circumference - dash;
      setDashArray(`${dash} ${gap}`);
    });
    Animated.timing(animProgress, {
      toValue: targetProgress,
      duration: 600,
      useNativeDriver: false,
    }).start();
    return () => animProgress.removeListener(listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProgress]);
  return (
    <TouchableOpacity
      style={{ flex: 1.4, alignItems: 'center' }}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Steps: ${todaySteps ?? 0} of ${stepGoal}. Long press to change goal.`}
    >
      <Text style={{ fontSize: 11, color: '#687076', fontWeight: '500', marginBottom: 4 }}>{stepsLabel ?? 'Steps'}</Text>
      <View ref={ringRef} style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
        <Svg width={36} height={36} style={{ position: 'absolute' }}>
          <Circle cx={18} cy={18} r={R} stroke={borderColor} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={18} cy={18} r={R}
            stroke={stepColor}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            rotation={-90}
            origin="18,18"
            strokeDasharray={dashArray}
          />
        </Svg>
        <Text style={{ fontSize: 9, fontWeight: '700', color: stepColor }}>
          {todaySteps != null ? (todaySteps >= 1000 ? `${(todaySteps/1000).toFixed(1)}k` : String(todaySteps)) : '—'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}


/**
 * FiberRingCell — SVG arc ring for daily fiber vs. WHO 25g goal (JS-thread animation).
 */
function FiberRingCell({
  todayFiber,
  borderColor: _borderColor,
  onPress,
  onLongPress,
}: {
  todayFiber: number | null;
  borderColor: string;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const ds = useDashboardStrings();
  const [showFiberTooltip, setShowFiberTooltip] = React.useState(false);
  const tooltipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const SIZE = 48;
  const R = 19;
  const STROKE = 4.5;
  const circumference = 2 * Math.PI * R;
  const FIBRE_GOAL = 25; // WHO recommendation g/day
  const targetProgress = todayFiber != null ? Math.min(todayFiber / FIBRE_GOAL, 1) : 0;
  const pct = Math.round(targetProgress * 100);
  const fiberColor = targetProgress >= 1 ? '#10B981' : targetProgress >= 0.6 ? '#34D399' : targetProgress >= 0.3 ? '#EAB308' : '#6366F1';
  const trackColor = fiberColor + '28'; // 16% opacity track
  // Use JS-thread Animated.Value to avoid Reanimated SVG animatedProps crash on native
  const animProgress = useRef(new Animated.Value(0)).current;
  const [dashArray, setDashArray] = useState(`0 ${circumference}`);
  useEffect(() => {
    animProgress.setValue(0);
    const listener = animProgress.addListener(({ value }) => {
      const dash = value * circumference;
      const gap = circumference - dash;
      setDashArray(`${dash} ${gap}`);
    });
    Animated.timing(animProgress, {
      toValue: targetProgress,
      duration: 600,
      useNativeDriver: false,
    }).start();
    return () => animProgress.removeListener(listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProgress]);
  const handleFiberTap = React.useCallback(() => {
    if (showFiberTooltip) {
      // Second tap dismisses tooltip and opens food log
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      setShowFiberTooltip(false);
      onPress?.();
      return;
    }
    // First tap: show tooltip, auto-dismiss after 2.5s then open food log
    setShowFiberTooltip(true);
    tooltipTimer.current = setTimeout(() => {
      setShowFiberTooltip(false);
      onPress?.();
    }, 2500);
  }, [showFiberTooltip, onPress]);

  React.useEffect(() => {
    return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
  }, []);

  return (
    <View style={{ flex: 1.4, alignItems: 'center' }}>
      {/* Inline tooltip callout */}
      {showFiberTooltip && (
        <View style={{
          position: 'absolute',
          bottom: 52,
          left: '50%',
          transform: [{ translateX: -80 }],
          width: 160,
          backgroundColor: '#1E293B',
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 8,
          zIndex: 999,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 8,
        }}>
          <Text style={{ fontSize: 11, color: '#F1F5F9', fontWeight: '700', marginBottom: 2 }}>
            Daily Fiber Ring
          </Text>
          <Text style={{ fontSize: 10, color: '#94A3B8', lineHeight: 14 }}>
            Tracks dietary fiber vs. your {FIBRE_GOAL}g WHO goal. Tap again to log food.
          </Text>
          {/* Tooltip arrow */}
          <View style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            marginLeft: -6,
            width: 12,
            height: 12,
            backgroundColor: '#1E293B',
            transform: [{ rotate: '45deg' }],
          }} />
        </View>
      )}
      <TouchableOpacity
        style={{ alignItems: 'center' }}
        onPress={handleFiberTap}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Fiber: ${todayFiber ?? 0}g of ${FIBRE_GOAL}g WHO goal. Long-press to edit goal.`}
      >
        <Text style={{ fontSize: 11, color: '#687076', fontWeight: '500', marginBottom: 4 }}>Fiber</Text>
        <View style={{ alignItems: 'center', justifyContent: 'center', width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
            {/* Background track */}
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              stroke={trackColor}
              strokeWidth={STROKE}
              fill="none"
            />
            {/* Progress arc */}
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              stroke={fiberColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              rotation={-90}
              origin={`${SIZE / 2},${SIZE / 2}`}
              strokeDasharray={dashArray}
            />
          </Svg>
          {/* Center label: grams when data present, dash when not */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: todayFiber != null && todayFiber >= 10 ? 8 : 9, fontWeight: '800', color: fiberColor, lineHeight: 11 }}>
              {todayFiber != null ? `${todayFiber}g` : '—'}
            </Text>
            {todayFiber != null && (
              <Text style={{ fontSize: 7, fontWeight: '600', color: fiberColor + 'CC', lineHeight: 9 }}>{pct}%</Text>
            )}
          </View>
        </View>
        <Text style={{ fontSize: 8, color: '#687076', marginTop: 1 }}>/ {FIBRE_GOAL}g {ds.fiberGoalLabel ?? 'goal'}</Text>
      </TouchableOpacity>
    </View>
  );
}
// ─── Pulsing Dot ─────────────────────────────────────────────────────────────
// Small indicator dot that pulses (scale 1→1.3→1) when mounted (tile activated).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PulsingDot({ color }: { color: string }) {
  const scale = useRASV(1);
  useEffect(() => {
    scale.value = withRATiming(1.3, { duration: 150 }, () => {
      scale.value = withRATiming(1, { duration: 150 });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dotStyle = useRAStyle(() => ({
    transform: [{ scale: scale.value }],
  }), []);
  return (
    <ReAnimated.View
      style={[
        { position: 'absolute', top: 7, right: 7, width: 5, height: 5, borderRadius: 2.5, backgroundColor: color },
        dotStyle,
      ]}
    />
  );
}

// ─── Animated Macro Tile ─────────────────────────────────────────────────────
// Top-level component so it can use Reanimated hooks safely.

// ─── Animated Prep Check Item ────────────────────────────────────────────────
// Uses JS-thread Animated (not Reanimated) so it works safely when rendered
// inside an IIFE or deeply nested inline render function on the Dashboard.
function PrepCheckItem({
  item,
  isDark,
  onToggle,
}: {
  item: { id: string; label: string; checked: boolean };
  isDark: boolean;
  onToggle: (id: string) => void;
}) {
  const progress = React.useRef(new Animated.Value(item.checked ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: item.checked ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.checked]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
      <TouchableOpacity
        onPress={() => onToggle(item.id)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
        activeOpacity={0.7}
      >
        {/* Checkbox */}
        <View
          style={{
            width: 16, height: 16, borderRadius: 4,
            borderWidth: 1.5,
            borderColor: item.checked
              ? (isDark ? '#4ADE80' : '#16A34A')
              : (isDark ? '#93C5FD' : '#3B82F6'),
            backgroundColor: item.checked
              ? (isDark ? '#16A34A40' : '#DCFCE7')
              : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {item.checked && (
            <Text style={{ fontSize: 9, color: isDark ? '#4ADE80' : '#16A34A', fontWeight: '900' }}>✓</Text>
          )}
        </View>
        {/* Label with animated opacity + strikethrough */}
        <Animated.Text
          style={{
            fontSize: 12,
            flex: 1,
            color: item.checked
              ? (isDark ? '#93C5FD60' : '#6B7280')
              : (isDark ? '#BFDBFE' : '#1E40AF'),
            textDecorationLine: item.checked ? 'line-through' : 'none',
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
          }}
        >
          {item.label}
        </Animated.Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { preference: _themePreference, colorScheme: resolvedScheme, setPreference: setThemePreference } = useThemeContext();
  const router = useRouter();
  const { state, forceSync: healthForceSync, requestPermissions: _requestPermissions, recheckPermissions, dietType: _dietType, updateImmunization, updateAppointment, addVitalSigns, addWeight, addBloodSugar } = useHealth();
  const auth = useAuth();
  const { isSyncing, lastGlobalSyncAt } = useDataSources();
  // Shared weather context — also used by WeatherDashboardCard
  const { refresh: refreshWeather } = useWeatherContext();
  // Combined pull-to-refresh: health sync + weather refresh in parallel
  const forceSync = useCallback(async () => {
    await Promise.all([healthForceSync(), refreshWeather()]);
  }, [healthForceSync, refreshWeather]);
  const { data, isLoading, sync, permissionsGranted } = state;
  // ─── Language + i18n (hoisted to top to prevent TDZ crash) ──────────────────
  // IMPORTANT: lang/rawLang/ds must be declared before ANY useMemo/useCallback
  // that references ds.* — otherwise React Compiler hoisting causes a TDZ crash.
  const lang = useLang();
  const rawLang = useRawLang();
  const isRTL = isRTLLang(rawLang);
  const hAI = useT(HOME_EN);
  const h = (STATIC_LANGS.has(rawLang)
    ? ((homeStrings as unknown as Record<string, typeof homeStrings.en>)[lang] ?? homeStrings.en)
    : hAI) as unknown as typeof homeStrings.en;
  const l = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const ds = useDashboardStrings();
  const fc = useFoodCameraStrings();
  // ─────────────────────────────────────────────────────────────────────────────
  const { weightUnit, tempUnit, glucoseUnit, distanceUnit } = useUnitPreferences();
  const { goals: macroGoals, saveGoals } = useMacroGoals();
  const { budgetG: _sugarBudgetG } = useSugarBudget();
  const { goal: _sleepGoalHrs, setGoal: _setSleepGoalHrs } = useSleepGoal();
  const { goal: adherenceGoal, setGoal: _setAdherenceGoal } = useAdherenceGoal();
  // ─── Centralized Nutrition Alignment Engine ────────────────────────────────────────────
  // Single source of truth for nutrition totals across all log sources.
  // Deduplicates entries and provides real-time totals.
  const { goal: weightGoalLbs } = useWeightGoal();
  const { hours: staleThresholdHours } = useStaleThreshold();

  // ─── Weight goal progress banner ─────────────────────────────────────────
  const weightGoalBanner = useMemo(() => {
    if (weightGoalLbs === null) return null;
    const latest = data?.weight?.slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    if (!latest) return null;
    // Use the correct field based on user's unit preference
    // Weight goal is stored in lbs; convert if user prefers kg
    const isKg = weightUnit === 'kg';
    const latestInUnit = isKg ? latest.weightKg : latest.weightLbs;
    const goalInUnit = isKg ? weightGoalLbs / 2.20462 : weightGoalLbs;
    const unitLabel = isKg ? 'kg' : 'lbs';
    const threshold = isKg ? 2.3 : 5; // ~5 lbs in kg
    const diff = Math.abs(latestInUnit - goalInUnit);
    if (diff > threshold) return null;
    const achieved = diff <= (isKg ? 0.25 : 0.5);
    const direction = latestInUnit > goalInUnit ? 'above' : 'below';
    return {
      diff: String(parseFloat(diff.toFixed(isKg ? 2 : 1))),
      achieved,
      direction,
      current: String(parseFloat(latestInUnit.toFixed(isKg ? 1 : 0))),
      goal: String(parseFloat(goalInUnit.toFixed(isKg ? 1 : 0))),
      unitLabel,
    };
  }, [data?.weight, weightGoalLbs, weightUnit]);


  // ─── Medications state (for smart reminders + personal summary) ──────────────
  const [medications, setMedications] = useState<Medication[]>([]);
  // snoozeMap: { [reminderId]: snoozeUntilTimestamp } — declared early to avoid TDZ with React Compiler
  const [snoozedReminderMap, setSnoozedReminderMap] = useState<Record<string, number>>({});
  // Pharmacy name → {phone, address, hours} lookup map (for refill reminder card)
  const [pharmacyMap, setPharmacyMap] = useState<Record<string, { phone?: string; address?: string; hours?: string }>>({}); 
  useFocusEffect(
    useCallback(() => {
      loadMedications().then(setMedications).catch(() => {});
      getAllPharmacies().then(list => {
        const map: Record<string, { phone?: string; address?: string; hours?: string }> = {};
        for (const p of list) {
          if (p.name) map[p.name.toLowerCase().trim()] = { phone: p.phone, address: p.address, hours: p.hours };
        }
        setPharmacyMap(map);
      }).catch(() => {});
    }, [])
  );

  // ── Auto-mark missed doses after 2-hour grace period ─────────────────────────
  // Runs on focus and every 5 minutes while the dashboard is visible.
  // Any dose scheduled past the user-configured grace period with no log entry gets auto-logged as 'missed'.
  // Grace period is read from AsyncStorage (default 2h; 0 = Never).
  useEffect(() => {
    async function autoMarkMissed() {
      const rawGrace = await AsyncStorage.getItem('@med_auto_miss_grace_hours').catch(() => null);
      const graceHours = rawGrace !== null ? Number(rawGrace) : 2;
      if (graceHours === 0) return; // user disabled auto-marking
      const MISSED_GRACE_MINUTES = graceHours * 60;
      const meds = await loadMedications();
      const todayKey = new Date().toISOString().split('T')[0];
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      let updated = [...meds];
      let changed = false;
      for (const med of meds) {
        if (med.active === false) continue;
        for (const t of (med.scheduleTimes ?? [])) {
          const [hh, mm] = t.split(':').map(Number);
          const schedMin = hh * 60 + mm;
          const pastBy = nowMinutes - schedMin;
          if (pastBy < MISSED_GRACE_MINUTES) continue; // still in grace window
          const alreadyLogged = (med.doseLogs ?? []).some(
            l => l.date === todayKey && l.scheduledTime === t
          );
          if (alreadyLogged) continue;
          // Auto-log as missed
          // logDose, createDoseLog imported at top level
          const missedLog = createDoseLog(todayKey, t, 'missed');
          updated = await logDose(updated, med.id, missedLog);
          changed = true;
        }
      }
      if (changed) setMedications(updated);
    }
    autoMarkMissed();
    const interval = setInterval(autoMarkMissed, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const dashScrollRef = useRef<ScrollView>(null);
  const { showScrollTop: showDashScrollTop, scrollTopOpacity: dashScrollTopOpacity, handleScroll: handleDashScrollTop, scrollToTop: dashScrollToTop } = useScrollToTop(dashScrollRef);
  // Y-offsets for each section (measured via onLayout on the section View wrappers)
  const sectionOffsets = useRef<Record<string, number>>({
    vitals: 0, reminders: 0, nutrition: 0, wellness: 0, clinical: 0, ice: 0,
  });
  // X-offsets for each chip in the strip (measured via onLayout on each chip)
  const _chipOffsets = useRef<Record<string, number>>({
    vitals: 0, reminders: 0, nutrition: 0, wellness: 0, clinical: 0, ice: 0,
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeSection, setActiveSection] = useState<string>('reminders');
  const SECTION_KEYS_ORDER = ['reminders', 'nutrition', 'wellness', 'clinical', 'ice', 'vitals'] as const;
  function handleDashScroll(scrollY: number) {
    const offsets = sectionOffsets.current;
    // Find the last section whose offset is <= current scroll position + 120px threshold
    let active = 'reminders';
    for (const key of SECTION_KEYS_ORDER) {
      if (offsets[key] <= scrollY + 120) active = key;
    }
    setActiveSection(prev => {
      if (prev === active) return prev;
      return active;
    });
  }
  // Map from section key → its collapse setter
  // Populated after the state declarations below; defined here as a ref so
  // jumpToSection can reference it without a stale closure.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function jumpToSection(key: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    safeSetItem(ACTIVE_SECTION_KEY, key).catch(() => {});

    // Scroll after a short delay so LayoutAnimation has time to expand the section
    setTimeout(() => {
      const y = sectionOffsets.current[key] ?? 0;
      dashScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }, 150);
  }


const ACTIVE_SECTION_KEY = '@vsht:active_section';
const STEP_GOAL_KEY = '@vsht:daily_step_goal';
const DEFAULT_STEP_GOAL = 8000;
const DIST_UNITS_KEY = '@vsht:distance_units';
const GOAL_REACHED_KEY = '@vsht:step_goal_reached_date';
const BEST_STREAK_KEY = '@vsht:quick_entry_best_streak';
const _STREAK_CONFETTI_DATE_KEY = '@vsht:streak_confetti_date';
const NUDGE_DISMISS_KEY = '@vsht:todays_goal_nudge_dismiss_date';
const LAST_AI_SCAN_KEY = '@vsht:last_ai_scan_preview';
const SMART_REMINDER_DISMISSED_KEY = '@vsht:smart_reminder_dismissed_ids';
const BP_LAST_DISMISSED_KEY = '@vsht:bp_last_dismissed_at';
const SMART_REMINDER_SNOOZE_KEY = '@vsht:smart_reminder_snooze_map';
const CONFIRMED_APPT_IDS_KEY = '@vsht:confirmed_appt_ids';
const SMART_REMINDER_LAST_RESET_DATE_KEY = '@vsht:smart_reminder_last_reset_date';
// TTL-aware dismissed reminders: stores { id: expiresAtMs } pairs
const SMART_REMINDER_DISMISSED_TTL_KEY = '@vsht:smart_reminder_dismissed_ttl_v2';
const DISMISSED_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Reason-streak banners stay dismissed for 7 days (until the streak changes)
const REASON_STREAK_DISMISSED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const _ACTIVE_NUTR_METRICS_KEY = '@vsht:active_nutr_metrics_v1';
const LAST_MEAL_LOGGED_KEY = '@vsht:last_meal_logged_ts';
const SECTION_COLLAPSE_KEY = '@vsht:section_collapse_v1';
const CLINICAL_TAB_KEY     = '@vsht:clinical_tab_idx_v1';
const WEEKLY_CHECKIN_DISMISS_KEY = '@vsht:weekly_checkin_dismiss_date';
const GLUCOSE_CHIP_KEY = '@vitalsync/glucose_chip_enabled';
const GLUCOSE_REMINDER_MODE_KEY = '@vitalsync/glucose_reminder_mode';
const TRIAL_BANNER_DISMISSED_DATE_KEY = '@vsht:trial_banner_dismissed_date';
// Expired-trial banner: stores ISO timestamp of last dismissal; hidden for 7 days after dismiss
const EXPIRED_BANNER_DISMISSED_AT_KEY = '@vsht:expired_banner_dismissed_at';
// AsyncStorage key that stores the scheduled notification ID for trial expiry
const TRIAL_EXPIRY_NOTIF_ID_KEY = '@vsht:trial_expiry_notif_id';
// Smart Reminders upsell nudge: stores ISO timestamp of last paywall open; card hidden for 24h
const SMART_REMINDERS_NUDGE_DISMISSED_KEY = '@vsht:smart_reminders_nudge_dismissed_at';
// Tracks which reason-streak keys have already triggered a local notification
const REASON_STREAK_NOTIF_KEY = '@vsht:reason_streak_notif_sent_v1';



  // Incremented each time the user long-presses the ICE Vault Quick-Jump chip
  // — watched by EmergencyVaultTile to open its edit modal
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [iceEditTrigger, setIceEditTrigger] = useState(0);

  // ─── Inline tab strip index for PERSONAL section ─────────────────────────────
  const [clinicalTabIdx, setClinicalTabIdx] = useState(0);

  // Restore last-selected clinical tab on mount
  useEffect(() => {
    AsyncStorage.getItem(CLINICAL_TAB_KEY).then(v => {
      if (v != null) {
        const idx = parseInt(v, 10);
        if (!isNaN(idx)) setClinicalTabIdx(idx);
      }
    }).catch(() => {});
   
  }, []);

  // ─── Per-section collapse state (long-press to toggle) ────────────────────────
  const [clinicalCollapsed, setClinicalCollapsed] = useState(true);
  const [iceCollapsed, setIceCollapsed] = useState(true);
  const [vitalsCollapsed, setVitalsCollapsed] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showLogAllVitals, setShowLogAllVitals] = useState(false);
  const [nutritionCollapsed, setNutritionCollapsed] = useState(true);
  const [sleepCollapsed, setSleepCollapsed] = useState(true);
  const [weatherCollapsed, setWeatherCollapsed] = useState(true);
  // Override for PersonalNarrativeCard (Collapse All / Expand All button)
  const [narrativeOverride, setNarrativeOverride] = React.useState<boolean | undefined>(undefined);

  // Persist & restore section collapse state
  useEffect(() => {
    AsyncStorage.getItem(SECTION_COLLAPSE_KEY).then(v => {
      if (!v) return;
      try {
        const s = JSON.parse(v);
        if (s.clinical  != null) setClinicalCollapsed(s.clinical);
        if (s.ice       != null) setIceCollapsed(s.ice);
        if (s.vitals    != null) setVitalsCollapsed(s.vitals);
        if (s.nutrition != null) setNutritionCollapsed(s.nutrition);
        if (s.sleep     != null) setSleepCollapsed(s.sleep);
        if (s.weather   != null) setWeatherCollapsed(s.weather);
      } catch (_unused) {}
    }).catch(() => {});
   
  }, []);

  function toggleSection(key: 'clinical' | 'ice' | 'vitals' | 'nutrition' | 'sleep' | 'weather') {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = { clinical: clinicalCollapsed, ice: iceCollapsed, vitals: vitalsCollapsed, nutrition: nutritionCollapsed, sleep: sleepCollapsed, weather: weatherCollapsed };
    next[key] = !next[key];
    setClinicalCollapsed(next.clinical);
    setIceCollapsed(next.ice);
    setVitalsCollapsed(next.vitals);
    setNutritionCollapsed(next.nutrition);
    setSleepCollapsed(next.sleep);
    setWeatherCollapsed(next.weather);
    safeSetItem(SECTION_COLLAPSE_KEY, JSON.stringify(next)).catch(() => {});
  }
  // ─── Collapse all sections when user navigates away from dashboard ──────────
  useFocusEffect(
    React.useCallback(() => {
      // When screen gains focus: restore persisted state (already handled by useEffect above)
      return () => {
        // When screen loses focus: collapse all sections
        const allCollapsed = { clinical: true, ice: true, vitals: true, nutrition: true, sleep: true, weather: true };
        setClinicalCollapsed(true);
        setIceCollapsed(true);
        setVitalsCollapsed(true);
        setNutritionCollapsed(true);
        setSleepCollapsed(true);
        setWeatherCollapsed(true);
        safeSetItem(SECTION_COLLAPSE_KEY, JSON.stringify(allCollapsed)).catch(() => {});
      };
    }, [])
  );

  // ─── Auto-expand nutrition tab when user has diet entries ──────────────────
  useFocusEffect(
    React.useCallback(() => {
      const dietEntries = data?.sodiumIntake ?? [];
      if (dietEntries.length > 0) {
        setNutritionCollapsed(false);
        // Persist the expanded state so it stays expanded
        AsyncStorage.getItem(SECTION_COLLAPSE_KEY).then(v => {
          try {
            const s = v ? JSON.parse(v) : {};
            s.nutrition = false;
            safeSetItem(SECTION_COLLAPSE_KEY, JSON.stringify(s)).catch(() => {});
          } catch (_unused) {}
        }).catch(() => {});
      }
    }, [data?.sodiumIntake])
  );


  // ─── Dashboard card order (drag-to-reorder) ─────────────────────────────────
  const { order: cardOrder, moveCard, resetOrder: resetCardOrder } = useDashboardCardOrder();
  // ─── Dashboard section visibility ────────────────────────────────────────────
  const { isVisible: isSectionVisible } = useDashboardVisibility();
  // Sync weather_section visibility → weatherCollapsed (collapse weather when hidden)
  useEffect(() => {
    if (!isSectionVisible('weather_section')) setWeatherCollapsed(true);
  }, [isSectionVisible]);
  const [editLayoutMode, setEditLayoutMode] = useState(false);
  const [editLayoutResetConfirm, setEditLayoutResetConfirm] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Measured heights per card slot index — updated via onHeightMeasured from DraggableCardWrapper
  const cardHeights = React.useRef<Record<number, number>>({});
  const editLayoutTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const editLayoutResetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetEditLayoutTimer = useCallback(() => {
    if (editLayoutTimerRef.current) clearTimeout(editLayoutTimerRef.current);
    editLayoutTimerRef.current = setTimeout(() => setEditLayoutMode(false), 8000);
  }, []);
  useEffect(() => {
    return () => {
      if (editLayoutTimerRef.current) clearTimeout(editLayoutTimerRef.current);
      if (editLayoutResetTimerRef.current) clearTimeout(editLayoutResetTimerRef.current);
    };
  }, []);
  const handleCardLongPress = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditLayoutMode(true);
    resetEditLayoutTimer();
  }, [resetEditLayoutTimer]);
  const handleMoveCardUp = useCallback((id: DashboardCardId) => {
    const idx = cardOrder.indexOf(id);
    if (idx > 0) {
      moveCard(id, idx - 1);
      resetEditLayoutTimer();
      if (Platform.OS !== 'web') {
        // Medium haptic when card reaches the top position; Light otherwise
        const willBeFirst = idx - 1 === 0;
        Haptics.impactAsync(willBeFirst
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      // Already at top — give a brief Medium bump to signal the boundary
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [cardOrder, moveCard, resetEditLayoutTimer]);
  const handleMoveCardDown = useCallback((id: DashboardCardId) => {
    const idx = cardOrder.indexOf(id);
    if (idx < cardOrder.length - 1) {
      moveCard(id, idx + 1);
      resetEditLayoutTimer();
      if (Platform.OS !== 'web') {
        // Medium haptic when card reaches the bottom position; Light otherwise
        const willBeLast = idx + 1 === cardOrder.length - 1;
        Haptics.impactAsync(willBeLast
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      // Already at bottom — give a brief Medium bump to signal the boundary
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [cardOrder, moveCard, resetEditLayoutTimer]);
  const handleResetCardOrder = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetCardOrder();
    setEditLayoutResetConfirm(true);
    if (editLayoutResetTimerRef.current) clearTimeout(editLayoutResetTimerRef.current);
    editLayoutResetTimerRef.current = setTimeout(() => setEditLayoutResetConfirm(false), 1800);
    resetEditLayoutTimer();
  }, [resetCardOrder, resetEditLayoutTimer]);

  // ─── Meal-log confetti ─────────────────────────────────────────────────────────────────
  const [showMealConfetti, setShowMealConfetti] = useState(false);
  const [mealConfettiOrigin, setMealConfettiOrigin] = useState({ x: 0, y: 0 });
  const macroCardRef = useRef<View>(null);

  // Restore last active Quick-Jump chip on mount
  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_SECTION_KEY).then(v => {
      if (v) setActiveSection(v);
    }).catch(() => {});
  }, []);


  // Dynamic SMART REMINDERS count

  // ─── WELLNESS section card visibility tracking (drives the badge count) ──────
  // Each of the 3 WELLNESS cards reports its visibility; we sum them for the badge.
  const wellnessVisibilityRef = useRef({ lab: true, wins: true, history: false });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [wellnessCount, setWellnessCount] = useState(2); // lab + wins always visible; history hidden until appointments exist
  const _updateWellnessCount = useCallback((key: 'lab' | 'wins' | 'history', visible: boolean) => {
    wellnessVisibilityRef.current = { ...wellnessVisibilityRef.current, [key]: visible };
    const { lab, wins, history } = wellnessVisibilityRef.current;
    setWellnessCount([lab, wins, history].filter(Boolean).length);
  }, []);


  // ─── Pin diet card to top ─────────────────────────────────────────────────
  const PIN_DIET_KEY = '@vitalsync/diet_card_pinned';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [dietCardPinned, setDietCardPinned] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(PIN_DIET_KEY).then((v) => {
      if (v === 'true') setDietCardPinned(true);
    }).catch(() => {});
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function toggleDietPin() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDietCardPinned((v) => {
      const next = !v;
      safeSetItem(PIN_DIET_KEY, String(next)).catch(() => {});
      return next;
    });
  }

  // ─── User caloric goal + first name (re-read on every tab focus) ───────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [goalKcal, setGoalKcal] = useState(2000);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  // ─── First-visit-of-day tracking for "Welcome back" greeting ────────────────────────────
  // On first tab visit of the day: show "Welcome back, [Name]" for 4 seconds,
  // then fade to the time-of-day salutation. On subsequent visits: show salutation directly.
  const LAST_VISIT_KEY = '@vitalsync/last_dashboard_visit_date';
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const greetingOpacity = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      const today = new Date().toDateString();
      Promise.all([
        loadUserProfile(),
        AsyncStorage.getItem(LAST_VISIT_KEY),
      ]).then(([p, lastVisit]) => {
        if (p.goalKcal != null && p.goalKcal > 0) setGoalKcal(p.goalKcal);
        setUserFirstName(p.firstName ?? null);
        const isFirst = lastVisit !== today;
        if (isFirst) {
          safeSetItem(LAST_VISIT_KEY, today).catch(() => {});
          setShowWelcomeBack(true);
          // After 3.5 s fade out "Welcome back" and show time-of-day greeting
          const timer = setTimeout(() => {
            Animated.timing(greetingOpacity, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }).start(() => {
              setShowWelcomeBack(false);
              Animated.timing(greetingOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }).start();
            });
          }, 3500);
          return () => clearTimeout(timer);
        } else {
          setShowWelcomeBack(false);
          greetingOpacity.setValue(1);
        }
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // ─── Greeting text (switches between Welcome back and time-of-day) ─────────────────────────
  const greetingText = useMemo(() => {
    if (showWelcomeBack) {
      const wb = ds.welcomeBack ?? 'Welcome back';
      return userFirstName ? `${wb}, ${userFirstName}` : wb;
    }
    const hour = new Date().getHours();
    const salutation = hour < 12 ? (ds.greetingMorning ?? 'Good morning') : hour < 17 ? (ds.greetingAfternoon ?? 'Good afternoon') : (ds.greetingEvening ?? 'Good evening');
    return userFirstName ? `${salutation}, ${userFirstName}` : salutation;
  }, [showWelcomeBack, userFirstName, ds]);

  // ─── Reload last Smart scan preview when returning from the sodium log screen ─
  useFocusEffect(
    useCallback(() => {
      secureGetItem(LAST_AI_SCAN_KEY).then(v => {
        if (v) {
          try { setLastAiScan(JSON.parse(v)); } catch (_unused) {}
        }
      }).catch(() => {});
    }, [])
  );

  // ─── First-sync import banner (declared early — used in useFocusEffect below) ──
  // isFirstSync is true only until the first HealthKit sync completes and
  // the FIRST_SYNC_SEEN_KEY flag is written to AsyncStorage.
  const [isFirstSync, setIsFirstSync] = useState(false);

  // ─── Fresh vital log detection (auto-select "Last 1 hr" on Personal Narrative) ─
  // Reads the user-configured window from AsyncStorage (default 15 min, 0 = Off).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [freshVitalLog, setFreshVitalLog] = useState(false);
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        AsyncStorage.getItem('@vsht:last_vital_log_ts'),
        AsyncStorage.getItem('@vsht:narrative_auto_range_window_ms'),
      ]).then(([ts, windowStr]) => {
        if (!ts) { setFreshVitalLog(false); return; }
        // Parse the user-configured window; default to 15 min if not set
        const windowMs = windowStr !== null ? Number(windowStr) : 15 * 60 * 1000;
        if (windowMs === 0) { setFreshVitalLog(false); return; } // feature disabled
        const elapsed = Date.now() - parseInt(ts, 10);
        setFreshVitalLog(elapsed < windowMs);
      }).catch(() => setFreshVitalLog(false));
    }, [])
  );
  // ─── Detect meal-log flag set by AiFoodCameraSheet and fire confetti ───────────────────────
  useFocusEffect(
    useCallback(() => {
      // Do not fire meal confetti during the first-sync window — refs may not
      // be mounted yet and the animation would be confusing on first launch.
      if (isFirstSync) return;
      AsyncStorage.getItem(LAST_MEAL_LOGGED_KEY).then(v => {
        if (!v) return;
        const elapsed = Date.now() - parseInt(v, 10);
        if (elapsed < 8000) {
          // Meal was logged within the last 8 s (user just returned from food sheet)
          AsyncStorage.removeItem(LAST_MEAL_LOGGED_KEY).catch(() => {});
          if (macroCardRef.current) {
            macroCardRef.current.measure((_x, _y, _w, _h, px, py) => {
              setMealConfettiOrigin({ x: (px ?? 0) + 80, y: (py ?? 0) + 40 });
              setShowMealConfetti(true);
            });
          } else {
            // Fallback: use screen center when the ref is not yet attached
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { width, height } = require('react-native').Dimensions.get('window');
            setMealConfettiOrigin({ x: width / 2, y: height * 0.4 });
            setShowMealConfetti(true);
          }
        }
      }).catch(() => {});
    }, [isFirstSync, LAST_MEAL_LOGGED_KEY])
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [permBannerDismissed, setPermBannerDismissed] = useState(false);

  // ─── Re-check health permissions when app returns to foreground ──────────
  // Covers the case where the user grants/revokes access in iOS Settings and
  // returns to the app — permission state updates immediately without needing
  // to exit and re-enter the app.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppState } = require('react-native');
    let lastState = AppState.currentState;
    const sub = AppState.addEventListener('change', async (nextState: string) => {
      if (lastState !== 'active' && nextState === 'active') {
        // Brief defer so iOS has finished animating the permission sheet
        await new Promise<void>(resolve => setTimeout(resolve, 600));
        await recheckPermissions();
      }
      lastState = nextState;
    });
    return () => sub.remove();
  }, [recheckPermissions]);
  // ─── Glucose thresholds (TIR goal etc.) ──────────────────────────────────
  const [glucoseThresholds, setGlucoseThresholds] = useState<GlucoseThresholdConfig>(DEFAULT_GLUCOSE_THRESHOLDS);
  useEffect(() => {
    loadGlucoseThresholds().then(setGlucoseThresholds).catch(() => {});
  }, []);
  // ─── HealthKit direct-fetch state (populated after permission grant) ─────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hkGlucose, setHkGlucose] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hkWeight, setHkWeight] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hkCalories, setHkCalories] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hkSteps, setHkSteps] = useState<number>(0);
  // Track whether HealthKit is actually available on this device (real device + entitlement)
  const [hkAvailable, setHkAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios') { setHkAvailable(false); return; }
    isHealthKitAvailable().then(setHkAvailable).catch(() => setHkAvailable(false));
  }, []);
  // Only show "Not Connected" banner when HealthKit IS available but permissions not yet granted.
  // When HealthKit is unavailable (Expo Go / Simulator), the HealthKitUnavailableBanner handles it.
  const _showHealthBanner = !permissionsGranted && !permBannerDismissed && Platform.OS !== 'web' && hkAvailable === true;
  // ─── First-launch empty state ─────────────────────────────────────────────
  // True only when the user has no health records at all (first launch or
  // after a full data wipe). Hides once any record is present.
  const hasAnyData = useMemo(() => {
    if (!data) return false;
    return (
      (data.bloodPressure?.length ?? 0) > 0 ||
      (data.pulse?.length ?? 0) > 0 ||
      (data.vitalSigns?.length ?? 0) > 0 ||
      (data.bloodSugar?.length ?? 0) > 0 ||
      (data.bodyComposition?.length ?? 0) > 0 ||
      (data.sleep?.length ?? 0) > 0
    );
  }, [data]);
  const showFirstLaunchEmpty = !isLoading && !hasAnyData && permissionsGranted;
  // ─── Subscription state (for trial banner) ─────────────────────────────────
  const { trialDaysRemaining, accessState: subAccessState, trialExpiryMs, isPremium: isSmartReminderPremium } = useSubscription();
  // ─── Scan a Meal premium gate ─────────────────────────────────────────────
  const { requirePremium: requireScanMealPremium, PremiumGateSheet: ScanMealGateSheet } = usePremiumGate();
  // ─── Smart Reminders premium gate ────────────────────────────────────────
  const { requirePremium: requireSmartRemindersPremium, openPaywall: openSmartRemindersPaywall, PremiumGateSheet: SmartRemindersGateSheet } = usePremiumGate();
  // ─── Bluetooth premium gate ──────────────────────────────────────────────────
  // Trial banner: dismissed state (keyed to today's date, resets daily)
  const [trialBannerDismissedDate, setTrialBannerDismissedDate] = useState<string | null>(null);
  // Expired-trial banner: stores ISO timestamp of dismissal; hidden for 7 days
  const [expiredBannerDismissedAt, setExpiredBannerDismissedAt] = useState<string | null>(null);
  // Smart Reminders upsell nudge dismissed timestamp (ISO); card hidden for 24 h after paywall open
  const [smartRemindersNudgeDismissedAt, setSmartRemindersNudgeDismissedAt] = useState<string | null>(null);

  // ─── First-sync import banner (useEffects — declaration moved above) ─────────
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    isFirstHealthKitSync().then(setIsFirstSync).catch(() => {});
  }, []);
  // When permissions become granted for the first time in this session,
  // re-check the flag so the banner activates immediately.
  useEffect(() => {
    if (!permissionsGranted || Platform.OS !== 'ios') return;
    isFirstHealthKitSync().then(setIsFirstSync).catch(() => {});
  }, [permissionsGranted]);
  // Once the sync finishes, clear the isFirstSync flag in component state
  // (the banner component itself writes AsyncStorage and animates out).
  useEffect(() => {
    if (!isFirstSync) return;
    if (!sync.isRunning && sync.progress === 1) {
      // Small delay so the banner can finish its exit animation
      const t = setTimeout(() => setIsFirstSync(false), 1200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.isRunning, sync.progress]);





  // ─── Language picker state
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const { isTranslating } = useTranslationContext();

  // ─── Action sheet state
  const [actionSheet, setActionSheet] = useState<{
    visible: boolean;
    vitalType: VitalCardType;
    vitalLabel: string;
    latestValue: string;
  }>({ visible: false, vitalType: 'blood-pressure', vitalLabel: '', latestValue: '' });

  function openActionSheet(vitalType: VitalCardType, vitalLabel: string, latestValue: string) {
    triggerVitalCardActionSheet(vitalType, vitalLabel, latestValue, () =>
      setActionSheet({ visible: true, vitalType, vitalLabel, latestValue })
    );
  }

  // ─── Onboarding gate ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      hasCompletedOnboarding(),
      hasAcceptedCurrentConsent(),
      hasAcceptedGdprConsent(),
    ])
      .then(([done, consentCurrent, gdprAccepted]) => {
        // Show GDPR/CCPA consent banner first if not yet accepted
        if (!gdprAccepted) {
          router.replace('/consent' as any);
          return;
        }
        // Route to onboarding if the user has not completed it OR if they
        // accepted an older consent version that needs re-acknowledgement.
        if (!done || !consentCurrent) router.replace('/onboarding' as any);
      })
      .catch((e) => {
        // If AsyncStorage is unavailable, skip onboarding rather than crashing.
        console.warn('[VitalSync] onboarding gate check failed:', e);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Date range filter ────────────────────────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRangeDays>(30);
  const [breakdownVisible, setBreakdownVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DATE_RANGE_STORAGE_KEY)
      .then((v) => {
        if (v) {
          setDateRange(Number(v) as DateRangeDays);
        } else {
          // First launch: default to 30 days and persist so future loads are consistent
          safeSetItem(DATE_RANGE_STORAGE_KEY, '30').catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  function handleDateRangeChange(days: DateRangeDays) {
    setDateRange(days);
    safeSetItem(DATE_RANGE_STORAGE_KEY, String(days)).catch(() => {});
  }

  const averages = useMemo(
    () => computeDashboardAverages(data ?? null, dateRange),
    [data, dateRange]
  );

  // ── Weekly caloric average (last 7 days of Smart-scanned nutrition records) ─────────────────
  const weeklyCalAvg = useMemo(() => {
    const recs = data?.sodiumIntake ?? [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = recs.filter(r => r.calories != null && new Date(r.timestamp).getTime() >= cutoff);
    if (!recent.length) return null;
    // Sum calories per day then average across days
    const byDay = new Map<string, number>();
    for (const r of recent) {
      const d = r.timestamp.split('T')[0];
      byDay.set(d, (byDay.get(d) ?? 0) + (r.calories ?? 0));
    }
    const total = Array.from(byDay.values()).reduce((a, b) => a + b, 0);
    return Math.round(total / byDay.size);
  }, [data]);

  // ─── Derived vitals ──────────────────────────────────────────────────────────

  const latestBP = useMemo(() => {
    // Merge HealthKit + manual vitalSigns BP records, return the most recent
    const hkBP = data?.bloodPressure ?? [];
    const manualBP = (data?.vitalSigns ?? [])
      .filter((r) => r.systolic != null || r.diastolic != null)
      .map((r) => ({ id: r.id, timestamp: r.timestamp, systolic: r.systolic ?? null, diastolic: r.diastolic ?? null }));
    // Use numeric ms comparison — avoids the HealthKit "+00:00" vs "Z" lexicographic bug
    const all = [...hkBP, ...manualBP].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return all.length ? all[all.length - 1] : null;
  }, [data]);

  const latestPulse = useMemo(() => {
    // Merge HealthKit + manual vitalSigns pulse records, return the most recent
    const hkPulse = data?.pulse ?? [];
    const manualPulse = (data?.vitalSigns ?? [])
      .filter((r) => r.heartRate !== undefined)
      .map((r) => ({ id: r.id, timestamp: r.timestamp, bpm: r.heartRate!, hrv: undefined as number | undefined }));
    // Use numeric ms comparison — avoids the HealthKit "+00:00" vs "Z" lexicographic bug
    const all = [...hkPulse, ...manualPulse].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return all.length ? all[all.length - 1] : null;
  }, [data]);

  const latestBody = useMemo(() => {
    if (!data?.bodyComposition?.length) return null;
    return data.bodyComposition[data.bodyComposition.length - 1];
  }, [data]);

  const latestSleep = useMemo(() => {
    // Deduplicate sleep records by date: if a user logs sleep via both the Vitals Log
    // and the dedicated Sleep Log on the same day, keep only the most-recently saved
    // entry per date, then return the entry from the most recent date.
    const allSleepRecords = data?.sleep ?? [];
    if (allSleepRecords.length) {
      // Group by date (YYYY-MM-DD), keep the record with the latest wakeTime per date
      const byDate = new Map<string, typeof allSleepRecords[0]>();
      for (const rec of allSleepRecords) {
        const dateKey = rec.date ?? rec.wakeTime?.slice(0, 10) ?? '';
        const existing = byDate.get(dateKey);
        if (!existing || rec.wakeTime > existing.wakeTime) {
          byDate.set(dateKey, rec);
        }
      }
      // Return the entry from the most recent date
      const deduplicated = Array.from(byDate.values()).sort(
        (a, b) => (b.wakeTime ?? '').localeCompare(a.wakeTime ?? '')
      );
      return deduplicated[0] ?? null;
    }
    // Fallback: vitalSigns entries with sleep fields (pre-wiring compat)
    const manualSleep = (data?.vitalSigns ?? [])
      .filter((r) => r.sleepTotalMinutes !== undefined && r.sleepTotalMinutes > 0)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (!manualSleep.length) return null;
    const r = manualSleep[0];
    // Return a shape compatible with SleepRecord so the card can render it
    return {
      id: r.id,
      timestamp: r.timestamp,
      date: r.timestamp.slice(0, 10),
      bedtime: r.sleepBedtime ?? r.timestamp,
      wakeTime: r.sleepWakeTime ?? r.timestamp,
      totalMinutes: r.sleepTotalMinutes!,
      efficiency: r.sleepEfficiency ?? 0,
      deepMinutes: 0,
      remMinutes: 0,
      lightMinutes: r.sleepTotalMinutes!,
      awakeMinutes: 0,
      source: 'manual',
    };
  }, [data]);

  // Latest SpO2 from vitalSigns (most recent entry with spo2 or oxygenSaturation)
  const latestSpO2Record = useMemo(() => {
    const records = (data?.vitalSigns ?? [])
      .filter((r) => (r.spo2 !== undefined && r.spo2 > 0) || (r.oxygenSaturation !== undefined && r.oxygenSaturation > 0))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return records.length ? records[0] : null;
  }, [data]);
  const latestSpO2 = latestSpO2Record ? (latestSpO2Record.spo2 ?? latestSpO2Record.oxygenSaturation ?? null) : null;

  // ─── Last-synced timestamps for each VitalCard ────────────────────────────
  const bpLastSyncedAt    = latestBP?.timestamp ?? null;
  const bpIsLive = bpLastSyncedAt ? (Date.now() - new Date(bpLastSyncedAt).getTime()) < 24 * 60 * 60 * 1000 : false;
  const pulseLastSyncedAt = latestPulse?.timestamp ?? null;
  const hrIsLive = pulseLastSyncedAt ? (Date.now() - new Date(pulseLastSyncedAt).getTime()) < 24 * 60 * 60 * 1000 : false;
  const spo2LastSyncedAt  = latestSpO2Record?.timestamp ?? null;
  const spo2IsLive = spo2LastSyncedAt ? (Date.now() - new Date(spo2LastSyncedAt).getTime()) < 24 * 60 * 60 * 1000 : false;
  // SleepRecord: for the Quick Entry "last logged" badge, use the wakeTime of the most
  // recent sleep session. wakeTime is always a real clock time (e.g. "6:30 AM today"),
  // whereas bedtime may be the previous evening, making the relative label more accurate.
  // Fall back to bedtime if wakeTime is somehow absent.
  const sleepLastSyncedAt = latestSleep
    ? (latestSleep.wakeTime ?? latestSleep.bedtime ?? null)
    : null;
  const sleepIsLive = sleepLastSyncedAt ? (Date.now() - new Date(sleepLastSyncedAt).getTime()) < 24 * 60 * 60 * 1000 : false;

  // BP trend: compare last 2 readings
  const _bpTrend = useMemo(() => {
    // Use merged BP records (HealthKit + manual) for trend calculation
    const hkBP = data?.bloodPressure ?? [];
    const manualBP = (data?.vitalSigns ?? [])
      .filter((r) => r.systolic != null || r.diastolic != null)
      .map((r) => ({ id: r.id, timestamp: r.timestamp, systolic: r.systolic ?? null, diastolic: r.diastolic ?? null }));
    const allBP = [...hkBP, ...manualBP].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (allBP.length < 2) return 'stable';
    const prev = allBP[allBP.length - 2];
    const curr = allBP[allBP.length - 1];
    if (curr.systolic == null || prev.systolic == null) return 'stable';
    const delta = curr.systolic - prev.systolic;
    if (delta > 3) return 'up';
    if (delta < -3) return 'down';
    return 'stable';
  }, [data]);

  // Weight trend
  const _weightTrend = useMemo(() => {
    if (!data?.bodyComposition || data.bodyComposition.length < 2) return 'stable';
    const prev = data.bodyComposition[data.bodyComposition.length - 2];
    const curr = data.bodyComposition[data.bodyComposition.length - 1];
    const delta = curr.weightKg - prev.weightKg;
    if (delta > 0.2) return 'up';
    if (delta < -0.2) return 'down';
    return 'stable';
  }, [data]);

  // Resting HR trend: today's value vs 7-day average (threshold: 2 bpm to avoid noise)
  const restingHrTrend = useMemo<'up' | 'down' | 'stable'>(() => {
    const samples = data?.restingHRSamples ?? [];
    if (samples.length < 2) return 'stable';
    // Sort ascending by timestamp
    const sorted = [...samples].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latest = sorted[sorted.length - 1].bpm;
    // 7-day average: use up to the last 7 samples (one per day)
    const window7 = sorted.slice(-7);
    const avg7 = window7.reduce((s, r) => s + r.bpm, 0) / window7.length;
    const delta = latest - avg7;
    if (delta > 2) return 'up';
    if (delta < -2) return 'down';
    return 'stable';
  }, [data?.restingHRSamples]);

  const bpStatus = latestBP
    ? getBPStatus(latestBP.systolic ?? 0, latestBP.diastolic ?? 0)
    : null;

  // ─── Daily Readiness Score ──────────────────────────────────────────────────
  const readiness = useMemo(() => computeReadinessScore(data ?? null), [data]);

  // ─── Readiness trend badge (7-day direction) + yesterday score ───────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [readinessTrend, setReadinessTrend] = useState<'improving' | 'declining' | 'stable' | null>(null);
  const [yesterdayReadinessScore, setYesterdayReadinessScore] = useState<number | null>(null);
  useEffect(() => {
    loadReadinessHistory(7).then(history => {
      const trend = getReadinessTrend(history, 7);
      setReadinessTrend(trend);
      // history is ordered oldest→newest over 7 days; index 5 = yesterday (index 6 = today)
      const yesterdaySnapshot = history[history.length - 2] ?? null;
      setYesterdayReadinessScore(yesterdaySnapshot?.total ?? null);
    }).catch(() => {});
  }, []);

  // ─── Auto-save readiness snapshot whenever sync completes ────────────────────
  // isSyncing transitions false → true → false on each sync cycle.
  // We capture the snapshot on the trailing edge (false after true).
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    if (wasSyncingRef.current && !isSyncing && readiness.hasData) {
      // Persist today's snapshot and refresh the morning notification body
      saveReadinessSnapshot(readiness).catch(() => {});
      scheduleReadinessNotificationWithScore(readiness).catch(() => {});
      // Refresh trend badge after new snapshot
      loadReadinessHistory(7).then(h => setReadinessTrend(getReadinessTrend(h, 7))).catch(() => {});
    }
    wasSyncingRef.current = isSyncing;
  }, [isSyncing, readiness]);

  const _latestWeightKg = useMemo(
    () => data?.bodyComposition?.length
      ? data.bodyComposition[data.bodyComposition.length - 1].weightKg
      : null,
    [data],
  );

  // ─── Quick-entry last-logged timestamps ──────────────────────────────────
  // Weight: prefer data.weight (manual entries via /log/weight) over data.bodyComposition
  // (HealthKit-synced). Take the most recent timestamp across both sources.
  const _latestWeightTimestamp = useMemo(() => {
    const manualTs = (data?.weight ?? []).reduce<string | null>((best, r) => {
      if (!best) return r.timestamp;
      return r.timestamp > best ? r.timestamp : best;
    }, null);
    const hkTs = data?.bodyComposition?.length
      ? data.bodyComposition
          .slice()
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].timestamp
      : null;
    if (!manualTs && !hkTs) return null;
    if (!manualTs) return hkTs;
    if (!hkTs) return manualTs;
    return manualTs > hkTs ? manualTs : hkTs;
  }, [data]);
  const latestGlucoseTimestamp = useMemo(
    () => {
      const recs = data?.bloodSugar ?? [];
      return recs.length ? recs[recs.length - 1].timestamp : null;
    },
    [data],
  );
  // ─── Latest glucose value (mg/dL) from health context — newest-first ─────
  const _latestGlucoseMgDl = useMemo(() => {
    const recs = (data?.bloodSugar ?? []).slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return recs.length ? recs[0].glucoseMgDl : null;
  }, [data]);

  // ─── Today's TIR (Time-in-Range) for the Dashboard ring ───────────────────
  const _todayTIR = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayRecs = (data?.bloodSugar ?? []).filter(
      (r) => (r.timestamp ?? '').slice(0, 10) === todayKey
    );
    const vals = todayRecs.map((r) => r.glucoseMgDl).filter((v) => v > 0);
    return computeTIR(vals, glucoseThresholds);
  }, [data, glucoseThresholds]);

  // ─── Latest weight from health context with unit conversion ──────────────
  const _latestWeightDisplay = useMemo(() => {
    const recs = (data?.bodyComposition ?? []).slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    if (!recs.length) return null;
    const kg = recs[0].weightKg;
    return weightUnit === 'kg'
      ? `${kg.toFixed(1)} kg`
      : `${(kg * 2.20462).toFixed(1)} lbs`;
  }, [data, weightUnit]);

  // ─── Bump tickerNow on focus so Smart Reminders (including pre-dose vital chips) re-evaluate
  // immediately when the user returns from a vitals / blood-sugar log screen.
  // Also detect whether a fresh BP or glucose reading was just logged so we can show
  // the brief "logged ✓" confirmation chip before the pre-dose chip disappears.
  const prevBpTsRef = useRef<string | null>(null);
  const prevGlucoseTsRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setTickerNow(Date.now());
      // Detect a newly logged BP or glucose reading (timestamp changed since last focus)
      const currentBpTs = bpLastSyncedAt;
      const currentGlucoseTs = latestGlucoseTimestamp;
      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
      const _bpFresh = !!currentBpTs && new Date(currentBpTs) >= todayMidnight && currentBpTs !== prevBpTsRef.current;
      const _glucoseFresh = !!currentGlucoseTs && new Date(currentGlucoseTs) >= todayMidnight && currentGlucoseTs !== prevGlucoseTsRef.current;
      prevBpTsRef.current = currentBpTs;
      prevGlucoseTsRef.current = currentGlucoseTs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bpLastSyncedAt, latestGlucoseTimestamp, data])
  );

  // Latest HRV timestamp (from vitalSigns records that have hrv > 0))
  const _latestHrvTimestamp = useMemo(() => {
    const recs = (data?.vitalSigns ?? []).filter(r => (r.hrv ?? 0) > 0);
    if (!recs.length) return null;
    return recs.reduce((latest, r) =>
      new Date(r.timestamp) > new Date(latest) ? r.timestamp : latest,
      recs[0].timestamp
    );
  }, [data]);

  /**
   * Returns the colour for a quick-entry timestamp based on staleness.
   * BP/Glucose: amber after 12h, red after 24h.
   * Weight/Sleep/HRV: amber after 24h, red after 48h.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function timestampColor(isoTimestamp: string | null, thresholdAmberMs: number, thresholdRedMs: number, isDarkMode: boolean): string {
    if (!isoTimestamp) return isDarkMode ? '#475569' : '#94A3B8'; // muted — not logged
    const age = Date.now() - new Date(isoTimestamp).getTime();
    if (age >= thresholdRedMs)   return '#EF4444'; // red
    if (age >= thresholdAmberMs) return '#F59E0B'; // amber
    return isDarkMode ? '#22C55E' : '#16A34A';     // green — fresh
  }

  /**
   * Counts consecutive calendar days (ending today) on which ALL FIVE vitals
   * (BP, glucose, weight, sleep, HRV) have at least one logged record.
   */
  const quickEntryStreak = useMemo(() => {
    const dayKey = (ts: string) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const bpDays    = new Set((data?.bloodPressure ?? []).map(r => dayKey(r.timestamp)));
    const gluDays   = new Set((data?.bloodSugar    ?? []).map(r => dayKey(r.timestamp)));
    const wtDays    = new Set((data?.bodyComposition ?? []).map(r => dayKey(r.timestamp)));
    const slpDays   = new Set((data?.sleep ?? []).map(r => dayKey(r.wakeTime)));
    const hrvDays   = new Set((data?.vitalSigns ?? []).filter(r => (r.hrv ?? 0) > 0).map(r => dayKey(r.timestamp)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (bpDays.has(k) && gluDays.has(k) && wtDays.has(k) && slpDays.has(k) && hrvDays.has(k)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [data]);

  // ─── 7-day sparkline data ────────────────────────────────────────────────
  const bpSparkline = useMemo(() => buildSparklineData(data ?? null, 'systolic', 7), [data]);
  const bpDiastolicSparkline = useMemo(() => buildSparklineData(data ?? null, 'diastolic', 7), [data]);
  const _hrSparkline = useMemo(() => buildSparklineData(data ?? null, 'bpm', 7), [data]);
  const hrvSparkline = useMemo(() => buildSparklineData(data ?? null, 'hrv', 7), [data]);
  // ─── Personal Narrative urgency for Quick-Jump badge ────────────────────
  const _clinicalNarrativeUrgency = useMemo(() => {
    if (!data) return 'normal' as const;
    const events = buildClinicalNarrative(data);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEvents = events.filter(e => new Date(e.timestamp) >= todayStart);
    return todayEvents.reduce<'normal'|'elevated'|'stage2'|'crisis'>((acc, e) => {
      const order = ['normal','elevated','stage2','crisis'] as const;
      // Guard: e.urgency should always be set by buildClinicalNarrative, but
      // defensive null-coalescing prevents EXC_BAD_ACCESS in Hermes indexOf
      // if a malformed event object ever reaches this reducer.
      const urgency = e.urgency ?? 'normal';
      return order.indexOf(urgency) > order.indexOf(acc) ? urgency : acc;
    }, 'normal');
  }, [data]);

  const spo2Sparkline = useMemo(() => buildSparklineData(data ?? null, 'spo2', 7), [data]);
  const sleepSparkline = useMemo(() => buildSparklineData(data ?? null, 'sleepHrs', 7), [data]);
  // ─── 30-day resting HR sparkline for Dashboard HR card ───────────────────
  const restingHrSparkline30d = useMemo(() => buildSparklineData(data ?? null, 'restingBpm', 30), [data]);
  // ─── 24h / 30d sparkline data for NeoVital range toggle ─────────────────
  const _hrSparkline24h   = useMemo(() => buildSparklineData(data ?? null, 'bpm', 1), [data]);
  const _bpSparkline24h   = useMemo(() => buildSparklineData(data ?? null, 'systolic', 1), [data]);
  const _spo2Sparkline24h = useMemo(() => buildSparklineData(data ?? null, 'spo2', 1), [data]);
  const _hrvSparkline24h  = useMemo(() => buildSparklineData(data ?? null, 'hrv', 1), [data]);
  const _hrSparkline30d   = useMemo(() => buildSparklineData(data ?? null, 'bpm', 30), [data]);
  const _bpSparkline30d   = useMemo(() => buildSparklineData(data ?? null, 'systolic', 30), [data]);
  const _spo2Sparkline30d = useMemo(() => buildSparklineData(data ?? null, 'spo2', 30), [data]);
  const _hrvSparkline30d  = useMemo(() => buildSparklineData(data ?? null, 'hrv', 30), [data]);

  // ─── 7-day HRV average for summary card ──────────────────────────────────
  const hrv7DayAvg = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pulseRecs = data?.pulse ?? [];
    const vitalRecs = (data?.vitalSigns ?? []).map((r) => ({ hrv: r.hrv ?? null, timestamp: r.timestamp }));
    const allHrv = [...pulseRecs, ...vitalRecs]
      .filter((r) => (r.hrv ?? 0) > 0 && new Date(r.timestamp).getTime() >= cutoff)
      .map((r) => r.hrv as number);
    if (!allHrv.length) return null;
    return Math.round(allHrv.reduce((s, v) => s + v, 0) / allHrv.length);
  }, [data]);

  // ─── Today's steps and active calories (from activity records) ──────────────
  const todaySteps = useMemo(() => {
    // Prefer the scalar steps field stored by HealthKit syncAll (most accurate)
    if (typeof data?.steps === 'number' && data.steps > 0) return data.steps;
    // Fall back to summing steps across today's activity records (manual entries)
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const recs = (data?.activity ?? []).filter(r => new Date(r.timestamp) >= start);
    const total = recs.reduce((s, r) => s + (r.steps ?? 0), 0);
    return total > 0 ? total : null;
  }, [data?.steps, data?.activity]);

  const todayCalories = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const recs = (data?.activity ?? []).filter(r => new Date(r.timestamp) >= start);
    const total = recs.reduce((s, r) => s + (r.caloriesBurned ?? 0), 0);
    return total > 0 ? Math.round(total) : null;
  }, [data]);

  const todayFiber = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const recs = data?.sodiumIntake ?? [];
    const todayRecs = recs.filter((r: any) => (r.timestamp ?? r.date ?? '').slice(0, 10) === todayStr);
    if (!todayRecs.length) return null;
    // SodiumRecord stores fiber as camelCase fiberG; also accept legacy snake_case variants
    const total = todayRecs.reduce((sum: number, r: any) =>
      sum + (r.fiberG ?? r.fiber_g ?? r.fiber_g ?? r.dietary_fiber_g ?? 0), 0);
    return total > 0 ? Math.round(total * 10) / 10 : null;
  }, [data?.sodiumIntake]);

  const todayDistanceKm = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const recs = (data?.activity ?? []).filter(r => new Date(r.timestamp) >= start);
    const total = recs.reduce((s, r) => s + (r.distanceKm ?? 0), 0);
    return total > 0 ? Math.round(total * 100) / 100 : null;
  }, [data]);

  // ─── Daily step goal (configurable, persisted) ──────────────────────────
  const [stepGoal, setStepGoal] = useState<number>(DEFAULT_STEP_GOAL);
  const [stepGoalSheetVisible, setStepGoalSheetVisible] = useState(false);
  const [distanceUnits, setDistanceUnits] = useState<'km'|'mi'>('mi');
  useEffect(() => {
    AsyncStorage.getItem(STEP_GOAL_KEY).then(v => {
      if (v) setStepGoal(parseInt(v, 10) || DEFAULT_STEP_GOAL);
    }).catch(() => {});
    AsyncStorage.getItem(DIST_UNITS_KEY).then(v => {
      if (v === 'mi' || v === 'km') setDistanceUnits(v);
    }).catch(() => {});
  }, []);
  const handleSetStepGoal = useCallback((goal: number) => {
    setStepGoal(goal);
    setStepGoalSheetVisible(false);
    safeSetItem(STEP_GOAL_KEY, String(goal)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  const handleToggleDistanceUnits = useCallback(() => {
    setDistanceUnits(u => {
      const next = u === 'km' ? 'mi' : 'km';
      safeSetItem(DIST_UNITS_KEY, next).catch(() => {});
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return next;
    });
  }, []);

  // ─── Best streak persistence & streak confetti ──────────────────────
  const [bestStreak, setBestStreak] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [nudgeLoaded, setNudgeLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lastAiScan, setLastAiScan] = useState<{ description: string; calories: number | null } | null>(null);
  const [cameraSheetVisible, setCameraSheetVisible] = useState(false);
  const [cameraInitialMode, setCameraInitialMode] = useState<'home' | 'plate' | 'barcode' | 'search'>('home');
  // Pre-fill search query for FiberRingCell long-press (high-fiber nudge)
  const [fiberSearchPrefill, setFiberSearchPrefill] = useState<string | undefined>(undefined);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<Set<string>>(new Set());
  // Timestamp (ms) of the last time the BP reminder was dismissed without logging
  const [bpLastDismissedAt, setBpLastDismissedAt] = useState<number>(0);
  // Snooze duration sheet visibility for the glucose smart reminder
  const [snoozeSheetVisible, setSnoozeSheetVisible] = useState(false);
  // Component-level snooze handler — must live AFTER setSnoozedReminderMap to avoid TDZ
  const snoozeGlucoseReminder = useCallback((ms: number) => {
    const id = 'glucose-smart-reminder-today';
    const until = Date.now() + ms;
    setSnoozedReminderMap(prev => {
      const next = { ...prev, [id]: until };
      secureSetItem(SMART_REMINDER_SNOOZE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [setSnoozedReminderMap]);
  // Live countdown for the glucose snooze badge — updates every 60 s at component scope
  // (hooks cannot be called inside IIFEs, so this must live here)
  const GLUCOSE_REMINDER_ID = 'glucose-smart-reminder-today';
  const glucoseLiveSnoozeUntil = snoozedReminderMap[GLUCOSE_REMINDER_ID] ?? 0;
  const glucoseLiveMinsLeft = useSnoozeCountdown(glucoseLiveSnoozeUntil);
  // confirmedApptIds: appointments the user has confirmed attendance for
  const [confirmedApptIds, setConfirmedApptIds] = useState<Set<string>>(new Set());
  // expandedPrepChecklists: set of appointment IDs whose prep checklist is expanded on the Smart Reminder card
  const [expandedPrepChecklists, setExpandedPrepChecklists] = useState<Set<string>>(new Set());
  // calledRefillIds: med IDs where the user just tapped "Call to Refill" — shows "✓ Called" for 2s
  const [calledRefillIds, setCalledRefillIds] = useState<Set<string>>(new Set());
  // Inline reschedule input state for missed-dose cards (cross-platform, replaces Alert.prompt)
  const [rescheduleInputId, setRescheduleInputId] = useState<string | null>(null);
  const [rescheduleInputValue, setRescheduleInputValue] = useState<string>('');
  // Missed-dose reason picker: which card is showing the reason sheet
  const [missedReasonId, setMissedReasonId] = useState<string | null>(null);
  // Pending missed-dose data waiting for reason selection
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pendingMissedDose, setPendingMissedDose] = useState<{ remId: string; medId: string; medName: string; scheduledTime: string } | null>(null);
  // "Other…" free-text reason input for missed-dose picker
  const [otherReasonText, setOtherReasonText] = useState<string>('');
  const [showOtherReasonInput, setShowOtherReasonInput] = useState<boolean>(false);
  // Reschedule confirmation toast
  const [rescheduleToastMsg, setRescheduleToastMsg] = useState<string | null>(null);
  const rescheduleToastOpacity = useRef(new Animated.Value(0)).current;
  const showRescheduleToast = (msg: string) => {
    setRescheduleToastMsg(msg);
    Animated.sequence([
      Animated.timing(rescheduleToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(rescheduleToastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setRescheduleToastMsg(null));
  };
  // Live ticker: re-renders reminders every 30 s so countdowns stay accurate
  const [tickerNow, setTickerNow] = useState(() => Date.now());
  // Weekly check-in banner: dismissed for the current Monday once user logs any vital
  const [weeklyCheckinDismissed, setWeeklyCheckinDismissed] = useState(false);
  // Glucose shortcut chip on streak banner (off by default; enabled in Settings for diabetic users)
  const [glucoseChipEnabled, setGlucoseChipEnabled] = useState(false);
  // Personal Narrative time-window state: '1h' | '6h' | 'today' | '7d'
  const [cnWindow, setCnWindow] = useState<'1h'|'6h'|'today'|'7d'>('today');
  // Fiber goal editor modal
  const [fiberGoalEditorVisible, setFiberGoalEditorVisible] = useState(false);
  const [fiberGoalEditorValue, setFiberGoalEditorValue] = useState('');
  // Goal editor state — which tile is being long-pressed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [goalEditorTile, setGoalEditorTile] = useState<{
    label: string; metricKey: string; goalKey: keyof import('@/hooks/use-macro-goals').MacroGoals | null; unit: string; color: string; currentGoal: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [goalEditorValue, setGoalEditorValue] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [goalToastMsg, setGoalToastMsg] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showNutrLegend, setShowNutrLegend] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [adherenceGoalEditorVisible, setAdherenceGoalEditorVisible] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [adherenceGoalEditorValue, setAdherenceGoalEditorValue] = useState('');
  const goalToastOpacity = useRef(new Animated.Value(0)).current;
  const _showGoalToast = (msg: string) => {
    setGoalToastMsg(msg);
    Animated.sequence([
      Animated.timing(goalToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(goalToastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setGoalToastMsg(null));
  // ─── BLE connection state (for Quick Entry badge) ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  }, []);

  const _quickEntryCardRef = useRef<View>(null);
  const weeklyBannerRef = useRef<ViewShot>(null);
  const prevStreakRef = useRef<number | null>(null);
  const milestoneNotifSentRef = useRef<number>(0); // tracks last bestStreak for which notif was sent

  // Load glucose chip preference from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(GLUCOSE_CHIP_KEY).then(v => {
      if (v !== null) setGlucoseChipEnabled(v === 'true');
    }).catch(() => {});
  }, []);

  // Load glucose reminder mode from AsyncStorage on mount (mirrors Settings value)
  const [glucoseReminderMode, setGlucoseReminderMode] = useState<GlucoseReminderMode>('custom');
  useEffect(() => {
    AsyncStorage.getItem(GLUCOSE_REMINDER_MODE_KEY).then(v => {
      if (v) setGlucoseReminderMode(v as GlucoseReminderMode);
    }).catch(() => {});
  }, []);

  // Load AC per-slot time overrides from AsyncStorage on mount
  const [acSlotTimes, setAcSlotTimes] = useState<AcSlotTimes>(AC_DEFAULT_SLOTS);
  useEffect(() => {
    AsyncStorage.getItem(AC_SLOT_TIMES_KEY).then(v => {
      if (v) {
        try {
          const parsed = JSON.parse(v) as AcSlotTimes;
          if (Array.isArray(parsed) && parsed.length === 3) setAcSlotTimes(parsed);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Load weekly check-in dismiss state — keyed to the Monday of the current week
  useEffect(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysFromMon);
    weekStart.setHours(0, 0, 0, 0);
    const mondayKey = weekStart.toISOString().slice(0, 10);
    AsyncStorage.getItem(WEEKLY_CHECKIN_DISMISS_KEY).then(v => {
      setWeeklyCheckinDismissed(v === mondayKey);
    }).catch(() => {});
  }, []);

  // Load trial banner dismissed date from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(TRIAL_BANNER_DISMISSED_DATE_KEY).then(v => {
      if (v) setTrialBannerDismissedDate(v);
    }).catch(() => {});
  }, []);

  // Load expired-trial banner dismissed timestamp from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(EXPIRED_BANNER_DISMISSED_AT_KEY).then(v => {
      if (v) setExpiredBannerDismissedAt(v);
    }).catch(() => {});
  }, []);

  // Load Smart Reminders nudge dismissed timestamp from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(SMART_REMINDERS_NUDGE_DISMISSED_KEY).then(v => {
      if (v) setSmartRemindersNudgeDismissedAt(v);
    }).catch(() => {});
  }, []);
  // Schedule (or reschedule) a local push notification at the exact trial expiry moment.
  // Runs whenever trialExpiryMs changes (e.g. after subscription context loads).
  // Cancels any previously scheduled notification before creating a new one.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!trialExpiryMs || subAccessState !== 'trial_active') return;
    const expiryDate = new Date(trialExpiryMs);
    if (expiryDate.getTime() <= Date.now()) return; // already expired

    let cancelled = false;
    (async () => {
      try {
        const { scheduleNotificationSafe, cancelNotificationSafe, getNotificationsAsync } = await import('@/lib/notifications/safe-notifications');
        const N = await getNotificationsAsync();
        if (!N || cancelled) return;

        // Cancel any previously scheduled trial-expiry notification
        const prevId = await AsyncStorage.getItem(TRIAL_EXPIRY_NOTIF_ID_KEY);
        if (prevId) {
          await cancelNotificationSafe(prevId);
        }

        // Request permission if not already granted
        const { status } = await N.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await N.requestPermissionsAsync();
          if (newStatus !== 'granted') return;
        }

        if (cancelled) return;

        // Schedule the notification at the exact expiry moment
        const notifId = await scheduleNotificationSafe({
          content: {
            title: '🔒 Your VitalSync trial has ended',
            body: 'Subscribe now to restore full access to all premium health features.',
            sound: true,
            data: { action: 'open_paywall' },
          },
          trigger: { type: 'date', date: expiryDate } as any,
        });

        if (notifId && !cancelled) {
          await safeSetItem(TRIAL_EXPIRY_NOTIF_ID_KEY, notifId);
        }
      } catch (_unused) {
        // Non-fatal — notification scheduling is best-effort
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialExpiryMs, subAccessState]);

  // NOTE: The weekly check-in banner is no longer auto-dismissed when the user logs today.
  // It now shows every day as a streak card and the "Log now →" chip disappears once logged.
  // The banner is only dismissed via the ✕ button or by the user tapping dismiss.

  // Fire a "Perfect Week" push notification when the user logs vitals all 7 days
  useEffect(() => {
    if (!data) return;
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysFromMon);
    weekStart.setHours(0, 0, 0, 0);
    const daysElapsed = daysFromMon + 1;
    const dayKey = (ts: string) => ts.slice(0, 10);
    let daysLogged = 0;
    for (let i = 0; i < daysElapsed; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      const k = d.toISOString().slice(0, 10);
      const hasAny = (
        (data?.vitalSigns    ?? []).some(r => dayKey(r.timestamp) === k) ||
        (data?.bloodPressure ?? []).some(r => dayKey(r.timestamp) === k) ||
        (data?.bloodSugar    ?? []).some(r => dayKey(r.timestamp) === k) ||
        (data?.weight        ?? []).some(r => dayKey(r.timestamp) === k) ||
        (data?.bodyComposition ?? []).some(r => dayKey(r.timestamp) === k) ||
        (data?.sleep         ?? []).some(r => dayKey(r.wakeTime) === k)
      );
      if (hasAny) daysLogged++;
    }
    checkVitalsWeekMilestone(daysLogged, daysElapsed).catch(() => {});
  }, [data]);

  // Load persisted best streak, nudge dismiss state, and last Smart scan on mount
  useEffect(() => {
    AsyncStorage.getItem(BEST_STREAK_KEY).then(v => {
      if (v) setBestStreak(parseInt(v, 10) || 0);
    }).catch(() => {});
    // Load nudge dismiss date — dismissed for today if stored date matches today
    AsyncStorage.getItem(NUDGE_DISMISS_KEY).then(v => {
      const today = new Date().toDateString();
      setNudgeDismissed(v === today);
      setNudgeLoaded(true);
    }).catch(() => { setNudgeLoaded(true); });
    // Load last Smart scan preview
    secureGetItem(LAST_AI_SCAN_KEY).then(v => {
      if (v) {
        try { setLastAiScan(JSON.parse(v)); } catch (_unused) {}
      }
    }).catch(() => {});
  }, []);

  // Load dismissed smart reminder IDs + snooze map from AsyncStorage.
  // Also perform midnight auto-reset: if the stored last-reset date is before today,
  // clear the dismissed IDs for daily reminders (vitals + blood sugar) so they
  // reappear each morning. Appointment and medication dismissals are NOT reset daily.
  useEffect(() => {
    const today = new Date().toDateString();
    Promise.all([
      AsyncStorage.getItem(SMART_REMINDER_DISMISSED_KEY),
      AsyncStorage.getItem(SMART_REMINDER_DISMISSED_TTL_KEY),
      secureGetItem(SMART_REMINDER_SNOOZE_KEY),
      AsyncStorage.getItem(SMART_REMINDER_LAST_RESET_DATE_KEY),
      AsyncStorage.getItem(CONFIRMED_APPT_IDS_KEY),
      AsyncStorage.getItem(BP_LAST_DISMISSED_KEY),
    ]).then(([dismissedRaw, dismissedTtlRaw, snoozeRaw, lastResetDate, confirmedRaw, bpDismissRaw]) => {
      if (bpDismissRaw) {
        const ts = parseInt(bpDismissRaw, 10);
        if (!isNaN(ts)) setBpLastDismissedAt(ts);
      }
      let dismissed: string[] = [];
      if (dismissedRaw) {
        try { dismissed = JSON.parse(dismissedRaw); } catch (_unused) {}
      }
      // Midnight auto-reset: strip daily reminder IDs if a new day has started
      const DAILY_REMINDER_IDS = ['vitals-reminder-today', 'blood-sugar-reminder-today'];
      if (lastResetDate !== today) {
        dismissed = dismissed.filter(id => !DAILY_REMINDER_IDS.includes(id));
        safeSetItem(SMART_REMINDER_DISMISSED_KEY, JSON.stringify(dismissed)).catch(() => {});
        safeSetItem(SMART_REMINDER_LAST_RESET_DATE_KEY, today).catch(() => {});
      }
      // Merge TTL-aware dismissed IDs (prune expired ones)
      const now = Date.now();
      let ttlMap: Record<string, number> = {};
      if (dismissedTtlRaw) {
        try { ttlMap = JSON.parse(dismissedTtlRaw); } catch (_unused) {}
      }
      const prunedTtlMap: Record<string, number> = {};
      for (const [id, expiresAt] of Object.entries(ttlMap)) {
        if (expiresAt > now) {
          prunedTtlMap[id] = expiresAt;
          if (!dismissed.includes(id)) dismissed.push(id);
        }
      }
      // Persist pruned TTL map if any entries were removed
      if (Object.keys(prunedTtlMap).length !== Object.keys(ttlMap).length) {
        safeSetItem(SMART_REMINDER_DISMISSED_TTL_KEY, JSON.stringify(prunedTtlMap)).catch(() => {});
      }
      setDismissedReminderIds(new Set(dismissed));
      // Load snooze map and prune expired snoozes
      if (snoozeRaw) {
        try {
          const raw: Record<string, number> = JSON.parse(snoozeRaw);
          const now = Date.now();
          const pruned: Record<string, number> = {};
          for (const [id, until] of Object.entries(raw)) {
            if (until > now) pruned[id] = until;
          }
          setSnoozedReminderMap(pruned);
        } catch (_unused) {}
      }
      // Load confirmed appointment IDs
      if (confirmedRaw) {
        try {
          const arr: string[] = JSON.parse(confirmedRaw);
          setConfirmedApptIds(new Set(arr));
        } catch (_unused) {}
      }
    }).catch(() => {});
  }, []);

  // 30-second ticker: keeps reminder countdowns live and auto-dismisses elapsed windows
  useEffect(() => {
    const id = setInterval(() => setTickerNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Update best streak and fire confetti when streak increments
  useEffect(() => {
    if (quickEntryStreak === 0) { prevStreakRef.current = 0; return; }
    const prev = prevStreakRef.current;
    prevStreakRef.current = quickEntryStreak;
    // Skip confetti/notification on the very first render (prev === null means
    // this is the initial value set on mount, not a real streak increment).
    if (prev === null) return;
    // Update best streak & fire milestone notification
    if (quickEntryStreak > bestStreak) {
      const newBest = quickEntryStreak;
      setBestStreak(newBest);
      safeSetItem(BEST_STREAK_KEY, String(newBest)).catch(() => {});
      // Fire milestone notification only once per new best (not on initial load)
      if (prev !== null && milestoneNotifSentRef.current !== newBest && Platform.OS !== 'web') {
        milestoneNotifSentRef.current = newBest;
        (async () => {
          try {
            const Notifications = await getNotificationsAsync(); if (!Notifications) return;
            await scheduleNotification({
              content: {
                title: `New record! ${newBest}-day streak 🔥`,
                body: `You’ve logged all 5 vitals for ${newBest} consecutive days. Keep it up!`,
                sound: true,
              },
              trigger: null, // immediate
            });
          } catch (_unused) { /* notifications not permitted */ }
        })();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickEntryStreak]);

  // ─── Goal reached confetti ──────────────────────────────────────────
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiOrigin, setConfettiOrigin] = useState({ x: 0, y: 0 });
  const stepRingRef = useRef<View>(null);
  const prevStepsRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevStepsRef.current;
    prevStepsRef.current = todaySteps;
    // Never fire confetti on the very first data arrival (prev === null means
    // this is the initial mount / first sync — the user has not "crossed" the
    // goal during this session; they just opened the app with existing data).
    if (prev === null) return;
    if (todaySteps == null || todaySteps < stepGoal) return;
    // Already past goal — check if we just crossed it this session
    if (prev >= stepGoal) return; // already celebrated
    // Check if already celebrated today
    const today = new Date().toDateString();
    AsyncStorage.getItem(GOAL_REACHED_KEY).then(stored => {
      if (stored === today) return; // already fired today
      safeSetItem(GOAL_REACHED_KEY, today).catch(() => {});
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Measure step ring position for confetti origin
      if (stepRingRef.current) {
        stepRingRef.current.measureInWindow((x, y, w, h) => {
          setConfettiOrigin({ x: x + w / 2, y: y + h / 2 });
          setShowConfetti(true);
        });
      } else {
        // Fallback to center of screen
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { width, height } = require('react-native').Dimensions.get('window');
        setConfettiOrigin({ x: width / 2, y: height * 0.35 });
        setShowConfetti(true);
      }
    }).catch(() => {});
  }, [todaySteps, stepGoal]);

  // ── Reason-streak local notification ──────────────────────────────────────
  // Fires once per unique reason when the streak first hits 3 consecutive entries.
  // Uses AsyncStorage to avoid re-firing across sessions.
  const reasonStreakNotifAlerts = React.useMemo(() => {
    const allMissedWithNote: { date: string; note: string }[] = [];
    for (const med of medications) {
      for (const log of (med.doseLogs ?? [])) {
        if ((log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt && log.note) {
          allMissedWithNote.push({ date: log.date, note: log.note.trim() });
        }
      }
    }
    allMissedWithNote.sort((a, b) => b.date.localeCompare(a.date));
    const alerts: { reason: string; count: number }[] = [];
    const seenReasons = new Set<string>();
    for (const { note } of allMissedWithNote) {
      if (seenReasons.has(note)) continue;
      seenReasons.add(note);
      let run = 0;
      for (const entry of allMissedWithNote) {
        if (entry.note === note) run++;
        else if (run > 0) break;
      }
      if (run >= 3) alerts.push({ reason: note, count: run });
    }
    return alerts;
  }, [medications]);

  useEffect(() => {
    if (!reasonStreakNotifAlerts.length) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(REASON_STREAK_NOTIF_KEY);
        const sentSet: Record<string, boolean> = raw ? JSON.parse(raw) : {};
        let changed = false;
        for (const { reason, count } of reasonStreakNotifAlerts) {
          const key = `${reason.toLowerCase().trim().slice(0, 60)}_${count}`;
          if (sentSet[key]) continue;
          sentSet[key] = true;
          changed = true;
          const isRefill = /ran out|refill|supply/i.test(reason);
          const title = isRefill
            ? '💊 Refill Reminder'
            : '⚠️ Missed Dose Pattern';
          const body = isRefill
            ? `You've missed doses ${count} times due to "${reason}" — time to refill?`
            : `You've missed doses ${count} times due to "${reason}" — consider speaking with your doctor.`;
          await scheduleNotification({
            content: {
              title,
              body,
              data: { type: 'reason_streak', reason },
              // Attach "Refill Now" action button for supply-related reason streaks (iOS)
              ...(isRefill ? { categoryIdentifier: 'reason_streak_refill' } : {}),
            },
            trigger: null,
          });
        }
        if (changed) await safeSetItem(REASON_STREAK_NOTIF_KEY, JSON.stringify(sentSet));
      } catch (_unused) {}
    })();
  }, [reasonStreakNotifAlerts]);

  // ── Clear dismissed reason-streak IDs when streak resets ──────────────────
  // When reasonStreakAlerts changes (e.g., a reason no longer appears 3+ times),
  // remove the old dismissed IDs from the TTL map so the banner can reappear
  // for any new streak that forms.
  const prevReasonStreakKeysRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const currentKeys = new Set(
      (reasonStreakNotifAlerts ?? []).map(({ reason }: { reason: string }) => `reason-streak-${reason}`)
    );
    const prevKeys = prevReasonStreakKeysRef.current;
    // Find keys that were in the previous streak but are no longer active
    const removedKeys = [...prevKeys].filter(k => !currentKeys.has(k));
    if (removedKeys.length > 0) {
      // Remove from dismissed set and TTL map so they can reappear for new streaks
      setDismissedReminderIds(prev => {
        const next = new Set(prev);
        removedKeys.forEach(k => next.delete(k));
        safeSetItem(SMART_REMINDER_DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
      AsyncStorage.getItem(SMART_REMINDER_DISMISSED_TTL_KEY).then(raw => {
        let ttlMap: Record<string, number> = {};
        if (raw) { try { ttlMap = JSON.parse(raw); } catch (_unused) {} }
        removedKeys.forEach(k => { delete ttlMap[k]; });
        safeSetItem(SMART_REMINDER_DISMISSED_TTL_KEY, JSON.stringify(ttlMap)).catch(() => {});
      }).catch(() => {});
    }
    prevReasonStreakKeysRef.current = currentKeys;
  }, [reasonStreakNotifAlerts]);

  const sleepHours = latestSleep
    ? (latestSleep.totalMinutes / 60).toFixed(1)
    : null;

  // lang/rawLang/h/l/ds already declared at top of component (hoisted to prevent TDZ crash)

  function navigate(path: string) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(path as never);
  }

  return (
    <View style={{ flex: 1 }}>
    <ScreenContainer containerClassName="bg-background" style={{ backgroundColor: isDark ? '#0D1117' : undefined }}>
      <ScrollView
        ref={dashScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { handleDashScroll(e.nativeEvent.contentOffset.y); handleDashScrollTop(e); }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={forceSync}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
         {/* ─── Header ─────────────────────────────────────────────────────── */}
         <View style={[styles.header, { paddingBottom: 6 }]}>
           {/* ─── Icon row: Health dot, Sync, Globe, NeoVital, Clinical, Privacy ─── */}
          <View style={[styles.headerRight, { flex: 1 }]}>

            <HeaderSyncButton
              sync={sync}
              onSync={forceSync}
              lastSyncedAt={data?.lastSyncedAt ?? lastGlobalSyncAt}
            />
        {/* Globe language quick-access button */}
            <TouchableOpacity
              style={[styles.globeBtn, { backgroundColor: '#22C55E22', borderColor: '#22C55E66' }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLangPickerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <IconSymbol name="globe" size={14} color="#22C55E" />
              {isTranslating && (
                <View style={[styles.globeTranslatingDot, { backgroundColor: '#22C55E' }]} />
              )}
            </TouchableOpacity>

            {/* Theme shortcut button — tap: go to settings, long-press: toggle light/dark */}
            <TouchableOpacity
              style={[styles.themeShortcutBtn, {
                backgroundColor: isDark ? '#F59E0B18' : '#FEF3C7',
                borderColor: isDark ? '#F59E0B55' : '#FCD34D',
                marginLeft: 6,
              }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/settings?section=appearance' as any);
              }}
              onLongPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const next = resolvedScheme === 'dark' ? 'light' : 'dark';
                setThemePreference(next);
              }}
              delayLongPress={400}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open theme settings. Long press to toggle light/dark."
            >
              <Text style={{ fontSize: 13, lineHeight: 16 }}>
                {resolvedScheme === 'dark' ? '🌙' : '☀️'}
              </Text>
            </TouchableOpacity>



            <View style={[styles.privacyBadge, { backgroundColor: colors.bpGreen + '18', borderColor: colors.bpGreen + '40' }]}>
              <IconSymbol name="lock.fill" size={11} color={colors.bpGreen} />
              <Text style={[styles.privacyText, { color: colors.bpGreen }]}>{h.localOnly}</Text>
            </View>
          </View>
          {/* ─── Greeting row — full width below icon row ─── */}
          <View style={{ marginTop: 8 }}>
            <Animated.Text style={[styles.appName, { color: colors.foreground, opacity: greetingOpacity }]}>{greetingText}</Animated.Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {safeFormatDate(Date.now(), rawLang === 'zh' ? 'zh-CN' : rawLang === 'ar' ? 'ar-SA' : rawLang === 'hi' ? 'hi-IN' : rawLang === 'ja' ? 'ja-JP' : rawLang === 'ko' ? 'ko-KR' : rawLang === 'de' ? 'de-DE' : rawLang === 'fr' ? 'fr-FR' : rawLang === 'es' ? 'es-ES' : rawLang === 'pt' ? 'pt-BR' : rawLang === 'it' ? 'it-IT' : rawLang === 'tl' ? 'fil-PH' : rawLang === 'sw' ? 'sw-KE' : rawLang === 'am' ? 'am-ET' : rawLang === 'so' ? 'so-SO' : rawLang === 'hy' ? 'hy-AM' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* ─── Language Quick Picker Modal ─────────────────────────────────── */}
        <Modal
          visible={langPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => { setLangPickerVisible(false); setLangSearch(''); }}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
            activeOpacity={1}
            onPress={() => { setLangPickerVisible(false); setLangSearch(''); }}
          />
          <View style={[styles.langSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.langSheetHandle, { backgroundColor: colors.border }]} />
        {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 8 }}>
              <Text style={[styles.langSheetTitle, { color: colors.foreground, flex: 1, paddingHorizontal: 0, paddingVertical: 0 }]}>{ds.selectLanguage}</Text>
              {isTranslating && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>{ds.translatingLabel}</Text>
                </View>
              )}
            </View>
        {/* Search bar */}
            <View style={[
              styles.langSearchBar,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <Text style={{ fontSize: 15, color: colors.muted }}>🔍</Text>
              <TextInput
                style={[styles.langSearchInput, { color: colors.foreground }]}
                placeholder={ds.langSearchPlaceholder ?? 'Search language…'}
                placeholderTextColor={colors.muted}
                value={langSearch}
                onChangeText={setLangSearch}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              {ALL_LANG_OPTIONS.filter((opt) => {
                if (!langSearch.trim()) return true;
                const q = langSearch.toLowerCase();
                return (
                  opt.native.toLowerCase().includes(q) ||
                  opt.label.toLowerCase().includes(q) ||
                  opt.code.toLowerCase().includes(q)
                );
              }).map((opt) => (
                <TouchableOpacity
                  key={opt.code}
                  style={[styles.langSheetRow, {
                    borderColor: colors.border,
                    backgroundColor: rawLang === opt.code ? colors.primary + '25' : 'transparent',
                  }]}
                  onPress={async () => {
                    const needsRestart = await applyRTLForLang(opt.code);
                    await setLangOverride(opt.code as Lang);
                    // Auto-apply regional unit defaults (only if user hasn't customized units yet)
                    await applyLangUnitDefaults(opt.code);
                    setLangPickerVisible(false);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (needsRestart) {
                      Alert.alert(
                        isRTLLang(opt.code) ? 'RTL Layout Enabled' : 'Restart Required',
                        isRTLLang(opt.code)
                          ? `${opt.label} uses right-to-left layout. Reload now to apply.`
                          : 'The layout direction has changed. Reload now to apply.',
                        [
                          { text: 'Later', style: 'cancel' },
                          { text: 'Reload App', onPress: async () => { try { const Updates = await import('expo-updates'); await Updates.reloadAsync(); } catch (_unused) { /* dev */ } } },
                        ]
                      );
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 22 }}>{getLangFlag(opt.code)}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.foreground }}>{opt.native}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{opt.label}</Text>
                    {opt.ai && (
                      <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                        <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '700' }}>Smart</Text>
                      </View>
                    )}
                    {isRTLLang(opt.code) && (
                      <View style={{ backgroundColor: '#8B5CF6' + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                        <Text style={{ color: '#8B5CF6', fontSize: 9, fontWeight: '700' }}>RTL</Text>
                      </View>
                    )}
                  </View>
                  {rawLang === opt.code && (
                    <IconSymbol name="checkmark" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              {/* No results empty state */}
              {langSearch.trim() !== '' && ALL_LANG_OPTIONS.filter((opt) => {
                const q = langSearch.toLowerCase();
                return (
                  opt.native.toLowerCase().includes(q) ||
                  opt.label.toLowerCase().includes(q) ||
                  opt.code.toLowerCase().includes(q)
                );
              }).length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
                  <Text style={{ fontSize: 36 }}>🔍</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.foreground }}>{ds.langNoFound ?? 'No languages found'}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                    {(ds.langNoMatch ?? 'No match for') + ' "' + langSearch + '"'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.langClearBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => {
                      setLangSearch('');
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>{ds.langClearSearch ?? 'Clear search'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>

        {/* ─── App Lock Status Widget ──────────────────────────────────────── */}
        {auth.isSetup && (
          <Pressable
            style={({ pressed }) => [styles.lockWidget, {
              backgroundColor: isDark ? colors.surface : '#F0FDF4',
              borderColor: colors.bpGreen + '50',
              opacity: pressed ? 0.8 : 1,
            }]}
            onPress={() => router.push('/(tabs)/settings' as any)}
          >
            <View style={[styles.lockWidgetIcon, { backgroundColor: colors.bpGreen + '20' }]}>
              <IconSymbol name="lock.shield.fill" size={16} color={colors.bpGreen} />
            </View>
            <View style={styles.lockWidgetText}>
              <Text style={[styles.lockWidgetTitle, { color: colors.foreground }]}>
                {h.dataSecurity}
              </Text>
              <Text style={[styles.lockWidgetSub, { color: colors.muted }]}>
                {auth.biometricsEnabled
                  ? (auth.biometricType === 'face' ? h.faceIdPin : h.fingerprintPin)
                  : h.pinLock}{auth.lastLockedAt
                  ? ` · ${h.lastLocked} ${safeFormatTime(auth.lastLockedAt, lang === 'zh' ? 'zh-CN' : lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US', { hour: 'numeric', minute: '2-digit' })}`
                  : ''}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        )}

        {/* ─── HealthKit Sync Banner ─────────────────────────────────────── */}
        <HealthKitSyncBanner sync={sync} isFirstSync={isFirstSync} />
        {/* ─── Vaccine Due / Overdue Banner ────────────────────────────── */}
        <VaccineDueBanner />
        <SmartReminderOrchestrator />
        {/* ─── First-Launch Empty State ─────────────────────────────────── */}
        {showFirstLaunchEmpty && (
          <GlassCard accentColor="#22C55E" noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
              <View style={[styles.healthBannerIcon, { backgroundColor: '#22C55E20' }]}>
                <Text style={{ fontSize: 22 }}>🩺</Text>
              </View>
              <View style={styles.healthBannerText}>
                <Text style={[styles.healthBannerTitle, { color: colors.foreground }]}>
                  Welcome to VitalSync
                </Text>
                <Text style={[styles.healthBannerSubtitle, { color: colors.muted }]}>
                  Tap any card to log your first reading, or use the Log tab to get started.
                </Text>
              </View>
            </View>
          </GlassCard>
        )}
        {/* ─── Smart Reminders Section ──────────────────────────────────────── */}
        <View onLayout={(e) => { sectionOffsets.current.reminders = e.nativeEvent.layout.y; }} collapsable={false} />
        {(() => {
          // Use tickerNow so this block re-evaluates every 30 s for live countdowns
          const now = tickerNow;
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);

          // ── Lead-time windows ─────────────────────────────────────────────────
          const APPT_LEAD_MS   = 24 * 3600_000;  // 24 h before appointment

          // ── Countdown formatter ───────────────────────────────────────────────
          const fmtCountdown = (msUntil: number): string => {
            if (msUntil <= 0) return 'Now';
            const h = Math.floor(msUntil / 3600_000);
            const m = Math.floor((msUntil % 3600_000) / 60_000);
            if (h > 0) return `${h}h ${m}m`;
            return `${m}m`;
          };

          // Dismiss a single reminder ID (used internally)
          // For medication reminders, also writes a 24-hour TTL entry so the card
          // disappears immediately but reappears the next day.
          const dismissReminder = (id: string, category: ReminderCategory = 'blood_pressure', label = '') => {
            // For BP reminders, record dismiss timestamp so the adaptive window can re-trigger 30 min later
            if (id === 'vitals-reminder-today') {
              const ts = Date.now();
              setBpLastDismissedAt(ts);
              safeSetItem(BP_LAST_DISMISSED_KEY, String(ts)).catch(() => {});
            }
            setDismissedReminderIds(prev => {
              const next = new Set(prev);
              next.add(id);
              safeSetItem(SMART_REMINDER_DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
              return next;
            });
            // Write TTL entry for medication reminders so they expire after 24 hours
            if (category === 'medication') {
              AsyncStorage.getItem(SMART_REMINDER_DISMISSED_TTL_KEY).then(raw => {
                let ttlMap: Record<string, number> = {};
                if (raw) { try { ttlMap = JSON.parse(raw); } catch (_unused) {} }
                ttlMap[id] = Date.now() + DISMISSED_TTL_MS;
                safeSetItem(SMART_REMINDER_DISMISSED_TTL_KEY, JSON.stringify(ttlMap)).catch(() => {});
              }).catch(() => {});
            }
            appendReminderHistory({ category, label, completedAt: new Date().toISOString(), snoozed: false }).catch(() => {});
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            appEvents.emit('medReminderDismissed'); // instantly clear tab badge
          };
          // Dismiss ALL IDs in a category so the next action falls off too
          const _dismissCategory = (ids: string[], category: ReminderCategory = 'appointment', label = '') => {
            setDismissedReminderIds(prev => {
              const next = new Set(prev);
              ids.forEach(id => next.add(id));
              safeSetItem(SMART_REMINDER_DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
              return next;
            });
            // Write TTL entries for medication reminders
            if (category === 'medication') {
              AsyncStorage.getItem(SMART_REMINDER_DISMISSED_TTL_KEY).then(raw => {
                let ttlMap: Record<string, number> = {};
                if (raw) { try { ttlMap = JSON.parse(raw); } catch (_unused) {} }
                const expiresAt = Date.now() + DISMISSED_TTL_MS;
                ids.forEach(id => { ttlMap[id] = expiresAt; });
                safeSetItem(SMART_REMINDER_DISMISSED_TTL_KEY, JSON.stringify(ttlMap)).catch(() => {});
              }).catch(() => {});
            }
            appendReminderHistory({ category, label, completedAt: new Date().toISOString(), snoozed: false }).catch(() => {});
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            appEvents.emit('medReminderDismissed'); // instantly clear tab badge
          };
          // Helper: snooze a reminder for a given duration (ms)
          const snoozeReminderFor = (id: string, ms: number) => {
            const until = Date.now() + ms;
            setSnoozedReminderMap(prev => {
              const next = { ...prev, [id]: until };
              secureSetItem(SMART_REMINDER_SNOOZE_KEY, JSON.stringify(next)).catch(() => {});
              return next;
            });
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          };
          // Helper: snooze a reminder for 1 hour (legacy shorthand)
          const snoozeReminder = (id: string) => snoozeReminderFor(id, 60 * 60 * 1000);
          // Snooze ALL IDs in a category for 15 minutes (long-press Done)
          const snoozeCategory = (ids: string[]) => {
            const until = Date.now() + 15 * 60 * 1000; // 15 minutes
            setSnoozedReminderMap(prev => {
              const next = { ...prev };
              ids.forEach(id => { next[id] = until; });
              secureSetItem(SMART_REMINDER_SNOOZE_KEY, JSON.stringify(next)).catch(() => {});
              return next;
            });
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          };
          // Helper: check if a reminder is currently snoozed
          const isSnoozed = (id: string) => {
            const until = snoozedReminderMap[id];
            return until !== undefined && until > now;
          };

          // ── 1. Upcoming appointments — show ALL future appointments ─────────────
          const upcomingAppts = (data?.appointments ?? [])
            .filter((a: any) => {
              const t = new Date(a.dateTime).getTime();
              // Only show appointments within the next 24 hours
              const hoursUntil = (t - now) / 3_600_000;
              return hoursUntil >= 0 && hoursUntil <= 24;
            })
            .sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
            .slice(0, 5);

          // ── 3. BP reminder — show in 30-min windows if not logged today ───────
          const bpLoggedToday = bpLastSyncedAt && new Date(bpLastSyncedAt) >= todayStart;
          const vitalsReminderId = 'vitals-reminder-today';
          const bpWindowOpen = (() => {
            const nowDate = new Date(now);
            const totalMin = nowDate.getHours() * 60 + nowDate.getMinutes();
            // Fixed clinical windows: 07:30–08:00 and 19:30–20:00
            const inFixedWindow = (totalMin >= 7 * 60 + 30 && totalMin < 8 * 60) ||
                                  (totalMin >= 19 * 60 + 30 && totalMin < 20 * 60);
            // Adaptive window: re-opens 30–60 min after the user dismissed without logging
            // This allows the reminder to adapt to the user's actual measurement schedule
            const elapsed = bpLastDismissedAt > 0 ? now - bpLastDismissedAt : -1;
            const inAdaptiveWindow = elapsed >= 30 * 60 * 1000 && elapsed < 60 * 60 * 1000;
            return inFixedWindow || inAdaptiveWindow;
          })();
          // When BP is logged, clear the adaptive dismiss timestamp so it doesn't re-trigger
          if (bpLoggedToday && bpLastDismissedAt > 0) {
            setBpLastDismissedAt(0);
            safeSetItem(BP_LAST_DISMISSED_KEY, '0').catch(() => {});
          }
          const showVitalsReminder = !bpLoggedToday && bpWindowOpen && !dismissedReminderIds.has(vitalsReminderId) && !isSnoozed(vitalsReminderId);

          // ── 4. Blood sugar — show in 30-min post-meal windows if not logged ───
          const glucoseLoggedToday = latestGlucoseTimestamp && new Date(latestGlucoseTimestamp) >= todayStart;
          const bsReminderId = 'blood-sugar-reminder-today';
          const bsWindowOpen = (() => {
            const nowDate = new Date(now);
            const totalMin = nowDate.getHours() * 60 + nowDate.getMinutes();
            return [[8 * 60, 8 * 60 + 30], [13 * 60, 13 * 60 + 30], [19 * 60, 19 * 60 + 30]]
              .some(([s, e]) => totalMin >= s && totalMin < e);
          })();
          const showBSReminder = !glucoseLoggedToday && bsWindowOpen && !dismissedReminderIds.has(bsReminderId) && !isSnoozed(bsReminderId);

          // ── 4b. Glucose Smart Reminder — shown during 30-min windows at user's chosen mode slots
          const glucoseSmartReminderId = 'glucose-smart-reminder-today';
          // Slot definitions — AC uses user's custom per-slot times if set
          const GLUCOSE_MODE_SLOTS: Record<GlucoseReminderMode, [number, number][]> = {
            ac:     acSlotTimes,   // user-customisable per-slot times
            pc:     [[9, 30], [14, 0], [20, 0]], // post-meal: ~1.5h after breakfast/lunch/dinner
            hs:     [[21, 30]],
            '6h':   [[6, 0], [12, 0], [18, 0], [0, 0]],
            custom: [[20, 0]], // fallback; real custom time not read here
          };
          const activeSlots = GLUCOSE_MODE_SLOTS[glucoseReminderMode] ?? GLUCOSE_MODE_SLOTS.custom;
          const glucoseSmartWindowOpen = (() => {
            const nowDate = new Date(now);
            const totalMin = nowDate.getHours() * 60 + nowDate.getMinutes();
            // Show during a 30-minute window starting at each slot
            return activeSlots.some(([h, m]) => {
              const slotMin = h * 60 + m;
              return totalMin >= slotMin && totalMin < slotMin + 30;
            });
          })();
          const showGlucoseSmartReminder =
            glucoseChipEnabled &&
            !glucoseLoggedToday &&
            glucoseSmartWindowOpen &&
            !dismissedReminderIds.has(glucoseSmartReminderId) &&
            !isSnoozed(glucoseSmartReminderId);

          // Snooze badge: show when the glucose smart reminder is snoozed
          const glucoseSnoozeUntil = snoozedReminderMap[glucoseSmartReminderId] ?? 0;
          const glucoseSnoozeMinsLeft = glucoseSnoozeUntil > now
            ? Math.ceil((glucoseSnoozeUntil - now) / 60_000)
            : 0;
          const showGlucoseSnoozeBadge =
            glucoseChipEnabled &&
            !glucoseLoggedToday &&
            !dismissedReminderIds.has(glucoseSmartReminderId) &&
            glucoseSnoozeMinsLeft > 0;

          // Countdown chip: minutes remaining in the current active slot window
          const glucoseACCountdown = (() => {
            const nowDate = new Date(now);
            const totalMin = nowDate.getHours() * 60 + nowDate.getMinutes();
            for (const [h, m] of activeSlots) {
              const slotMin = h * 60 + m;
              const remaining = slotMin + 30 - totalMin;
              if (totalMin >= slotMin && totalMin < slotMin + 30) return remaining; // mins left in window
            }
            return null;
          })();

          // Last logged blood sugar timestamp for the card subtitle
          const glucoseLastLoggedLabel = (() => {
            const records = data?.bloodSugar ?? [];
            if (!records.length) return 'Never logged';
            const latest = records.reduce((a: any, b: any) =>
              new Date(a.timestamp ?? a.date ?? 0).getTime() > new Date(b.timestamp ?? b.date ?? 0).getTime() ? a : b
            );
            const ts = new Date(latest.timestamp ?? (latest as any).date ?? 0).getTime();
            if (!ts) return 'Never logged';
            const diffDays = Math.floor((now - ts) / (24 * 3600_000));
            if (diffDays === 0) return 'Last: earlier today';
            if (diffDays === 1) return 'Last: yesterday';
            return `Last: ${diffDays} days ago`;
          })();

          // ── 5. Vaccine / immunization reminders ──────────────────────────────
          // 48hr card: fires when 1 < daysLeft ≤ 2, auto-dismisses after 30 min via snooze TTL.
          // 24hr card: fires when daysLeft ≤ 1, stays until user explicitly dismisses.
          const VACCINE_LEAD_DAYS = 2;
          const VAX_48HR_AUTO_DISMISS_MS = 30 * 60 * 1000; // 30 minutes
          const upcomingVaccines = (data?.immunizations ?? [])
            .filter((r: any) => {
              if (!r.nextDoseDate) return false;
              const dueMs = new Date(r.nextDoseDate).getTime();
              const daysLeft = (dueMs - now) / (24 * 3600_000);
              return daysLeft >= 0 && daysLeft <= VACCINE_LEAD_DAYS;
            })
            .sort((a: any, b: any) => new Date(a.nextDoseDate).getTime() - new Date(b.nextDoseDate).getTime())
            .slice(0, 3);
          // Category ID arrays — used by dismissCategory so Done on one card clears the whole category
          const _allApptIds = upcomingAppts.map((a: any) => `appt-${a.id}`);

          // ── 6. Medication reminders ────────────────────────────────────────────
          // a) Refill reminders: quantity < 7 pills
          const lowStockMeds = medications.filter((m: any) => m.active !== false && typeof m.quantity === 'number' && m.quantity < 7 && m.quantity >= 0);
          // b) 1-hour dose window: any scheduled time within ±60 min of now that hasn't been logged yet
          const nowMs = now;
          const nowMinutes = new Date(nowMs).getHours() * 60 + new Date(nowMs).getMinutes();
          const dueMeds = medications.filter((m: any) => {
            if (m.active === false) return false;
            const todayKey = new Date().toISOString().split('T')[0];
            // Include med if ANY of its scheduled times is due and unlogged
            return (m.scheduleTimes ?? []).some((t: any) => {
              const [hh, mm] = t.split(':').map(Number);
              const schedMin = hh * 60 + mm;
              const alreadyLogged = (m.doseLogs ?? []).some(
                (l: any) => l.date === todayKey && l.scheduledTime === t && (l.status === 'taken' || l.status === 'skipped')
              );
              return !alreadyLogged && Math.abs(schedMin - nowMinutes) <= 60;
            });
          });
          // c) Missed doses: scheduled times >60 min in the past with no log entry today
          const missedDoses: { med: typeof medications[0]; scheduledTime: string }[] = [];
          medications.forEach(m => {
            if (m.active === false) return;
            const todayKey = new Date().toISOString().split('T')[0];
            (m.scheduleTimes ?? []).forEach(t => {
              const [hh, mm] = t.split(':').map(Number);
              const schedMin = hh * 60 + mm;
              const pastBy = nowMinutes - schedMin;
              if (pastBy <= 60) return; // not yet missed (still in window or future)
              const alreadyLogged = (m.doseLogs ?? []).some(
                (l: any) => l.date === todayKey && l.scheduledTime === t
              );
              if (!alreadyLogged) missedDoses.push({ med: m, scheduledTime: t });
            });
          });
          // d) Skipped doses: doses logged as skipped today (can be reinstated)
          const skippedDoses: { med: typeof medications[0]; scheduledTime: string; logId: string }[] = [];
          medications.forEach(m => {
            if (m.active === false) return;
            const todayKey = new Date().toISOString().split('T')[0];
            (m.doseLogs ?? []).forEach(l => {
              if (l.date === todayKey && l.status === 'skipped') {
                skippedDoses.push({ med: m, scheduledTime: l.scheduledTime, logId: l.id });
              }
            });
          });
          // e) Refill-date reminders: refillReminderDate within 7 days
          const refillDueMeds = medications.filter((m: any) => {
            if (m.active === false || !m.refillReminderDate) return false;
            const dueMs = new Date(m.refillReminderDate).getTime();
            const daysLeft = (dueMs - now) / (24 * 3600_000);
            return daysLeft >= 0 && daysLeft <= 7;
          });
          const hasMedReminders = lowStockMeds.length > 0 || dueMeds.length > 0 || missedDoses.length > 0 || skippedDoses.length > 0 || refillDueMeds.length > 0;

          // ── Missed dose streak alert — any med missed 3+ consecutive days ─────────
          const missedStreakMeds: { name: string; streak: number }[] = [];
          const activeMedsForStreak = medications.filter((m: any) => m.active !== false && (m.scheduleTimes ?? []).length > 0);
          for (const med of activeMedsForStreak) {
            let streak = 0;
            for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
              const d = new Date();
              d.setDate(d.getDate() - dayOffset);
              const dayKey = d.toISOString().split('T')[0];
              const hadMissedThatDay = (med.doseLogs ?? []).some(
                (l: any) => l.date === dayKey && l.status === 'missed'
              );
              if (hadMissedThatDay) { streak++; } else { break; }
            }
            if (streak >= 3) missedStreakMeds.push({ name: med.name, streak });
          }

          // ── Reason streak alert — same reason appears 3+ consecutive times ────────
          const reasonStreakAlerts: { reason: string; count: number; action: string }[] = [];
          {
            // Collect all missed/skipped logs with notes, sorted by date desc
            const allMissedWithNote: { date: string; note: string }[] = [];
            for (const med of medications) {
              for (const log of (med.doseLogs ?? [])) {
                if ((log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt && log.note) {
                  allMissedWithNote.push({ date: log.date, note: log.note.trim() });
                }
              }
            }
            allMissedWithNote.sort((a, b) => b.date.localeCompare(a.date));
            // For each unique reason, count how many of the most-recent entries match it consecutively from position 0
            const seenReasons = new Set<string>();
            for (const { note } of allMissedWithNote) {
              if (seenReasons.has(note)) continue;
              seenReasons.add(note);
              let run = 0;
              for (const entry of allMissedWithNote) {
                if (entry.note === note) run++;
                else if (run > 0) break; // streak broken by a different reason
              }
              if (run >= 3) {
                const actionHint =
                  note.toLowerCase().includes('ran out') || note.toLowerCase().includes('refill') || note.toLowerCase().includes('supply')
                    ? ds.reasonStreakRefillHint
                    : note.toLowerCase().includes('side effect') || note.toLowerCase().includes('nausea') || note.toLowerCase().includes('pain')
                      ? ds.reasonStreakSideEffectHint
                      : note.toLowerCase().includes('forgot') || note.toLowerCase().includes('forget')
                        ? ds.reasonStreakForgotHint
                        : ds.reasonStreakDefaultHint;
                reasonStreakAlerts.push({ reason: note, count: run, action: actionHint });
              }
            }
          }

          // ── 7. Missed appointments — past appointments not dismissed ─────────
          const MISSED_APPT_WINDOW_DAYS = 7; // surface missed appts up to 7 days ago
          const missedAppts = (data?.appointments ?? [])
            .filter((a: any) => {
              const t = new Date(a.dateTime).getTime();
              const ageMs = now - t;
              const missedId = `missed-appt-${a.id}`;
              return t < now
                && ageMs <= MISSED_APPT_WINDOW_DAYS * 24 * 3600_000
                && !a.reminderDismissed
                && !dismissedReminderIds.has(missedId);
            })
            .sort((a: any, b: any) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
            .slice(0, 3);
          // Appointment and medication reminders are premium-only
          const showApptReminders = isSmartReminderPremium;
          const showMedReminders = isSmartReminderPremium;
          const hasAnyReminder = (showApptReminders && (upcomingAppts.length > 0 || missedAppts.length > 0)) || showVitalsReminder || showBSReminder || showGlucoseSmartReminder || upcomingVaccines.length > 0 || (showMedReminders && hasMedReminders) || (showMedReminders && reasonStreakAlerts.length > 0) || !isSmartReminderPremium;

          return (
            <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
              {/* Section header — always visible */}
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>🔔 {ds.smartReminders}</Text>
              </View>
              {/* ─── Monday Weekly Summary Banner ───────────────────────────────── */}
              {(() => {
                if (weeklyCheckinDismissed) return null;
                const today = new Date();
                const todayKey = today.toISOString().slice(0, 10);
                // Find the Monday of the current week (or today if Monday)
                const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon … 6=Sat
                const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sun wraps to 6
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - daysFromMon);
                weekStart.setHours(0, 0, 0, 0);
                // daysElapsed: how many days have started this week (1 on Mon, 2 on Tue … 7 on Sun)
                const daysElapsed = daysFromMon + 1;
                const dayKey = (ts: string) => ts.slice(0, 10);
                let daysLogged = 0;
                for (let i = 0; i < daysElapsed; i++) {
                  const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
                  const k = d.toISOString().slice(0, 10);
                  const hasAny = (
                    (data?.vitalSigns    ?? []).some(r => dayKey(r.timestamp) === k) ||
                    (data?.bloodPressure ?? []).some(r => dayKey(r.timestamp) === k) ||
                    (data?.bloodSugar    ?? []).some(r => dayKey(r.timestamp) === k) ||
                    (data?.weight        ?? []).some(r => dayKey(r.timestamp) === k) ||
                    (data?.bodyComposition ?? []).some(r => dayKey(r.timestamp) === k) ||
                    (data?.sleep         ?? []).some(r => dayKey(r.wakeTime) === k)
                  );
                  if (hasAny) daysLogged++;
                }
                // Determine if user already logged today
                const loggedToday = (
                  (data?.vitalSigns    ?? []).some(r => dayKey(r.timestamp) === todayKey) ||
                  (data?.bloodPressure ?? []).some(r => dayKey(r.timestamp) === todayKey) ||
                  (data?.bloodSugar    ?? []).some(r => dayKey(r.timestamp) === todayKey) ||
                  (data?.weight        ?? []).some(r => dayKey(r.timestamp) === todayKey) ||
                  (data?.bodyComposition ?? []).some(r => dayKey(r.timestamp) === todayKey) ||
                  (data?.sleep         ?? []).some(r => dayKey(r.wakeTime) === todayKey)
                );
                const isMonday = dayOfWeek === 1;
                // On Monday: recap last week's count (Mon = first day, daysElapsed=1, so show last week summary)
                const isRecapDay = isMonday && daysLogged === 0 && daysElapsed === 1;
                // Choose emoji based on streak quality
                const streakRatio = daysLogged / Math.max(daysElapsed, 1);
                const emoji = daysLogged === daysElapsed ? '🌟' : streakRatio >= 0.7 ? '👏' : loggedToday ? '✅' : '📊';
                // Build the headline and sub-text
                const headline = isRecapDay ? (ds.weeklyCheckIn ?? 'Weekly Check-In') : (ds.streakTitle ?? "This Week's Streak");
                const subText = isRecapDay
                  ? (ds.streakLastWeek ?? `You logged vitals on ${daysLogged} of 7 days last week.`).replace('{n}', String(daysLogged))
                  : (ds.streakDaysLogged ?? `${daysLogged} of ${daysElapsed} day${daysElapsed === 1 ? '' : 's'} logged so far this week.`).replace('{n}', String(daysLogged)).replace('{total}', String(daysElapsed)).replace('{s}', daysElapsed === 1 ? '' : 's');
                const _toneMsg = getStreakMessages(rawLang);
                const motivator = daysLogged === daysElapsed
                  ? (daysElapsed === 7 ? (ds.streakPerfect ?? _toneMsg.perfectWeek) : (ds.streakAlive ?? _toneMsg.logToday(daysLogged)))
                  : loggedToday ? (ds.streakGreat ?? ' Great — you logged today!')
                  : daysLogged === 0 ? (ds.streakStart ?? _toneMsg.startToday)
                  : (ds.streakLog ?? _toneMsg.logToday(daysLogged));
                return (
                  <ViewShot ref={weeklyBannerRef} options={{ format: 'png', quality: 0.95 }} style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 2 }}>
                    <GlassCard accentColor="#22C55E" noPadding>
                      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: loggedToday ? 10 : 8 }}>
                        {/* Top row: emoji + text (tappable → Record tab) + share + dismiss */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Pressable
                            onPress={() => {
                              router.push({ pathname: '/(tabs)/record', params: { filterCategory: 'All' } } as any);
                              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, opacity: pressed ? 0.75 : 1 })}
                            accessibilityRole="button"
                            accessibilityLabel="View today's entries in Record tab"
                          >
                            <Text style={{ fontSize: 20 }}>{emoji}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#4ADE80' : '#166534', marginBottom: 1 }}>{headline}</Text>
                              <Text style={{ fontSize: 12, color: isDark ? '#86EFAC' : '#15803D', lineHeight: 16 }}>
                                {subText}<Text style={{ fontWeight: '700' }}></Text>{motivator}
                              </Text>
                            </View>
                          </Pressable>
                          {Platform.OS !== 'web' && (
                            <Pressable
                              onPress={async () => {
                                try {
                                  if (!weeklyBannerRef.current) return;
                                  const uri = await (weeklyBannerRef.current as any).capture();
                                  const canShare = await Sharing.isAvailableAsync();
                                  if (canShare) {
                                    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share weekly streak' });
                                  }
                                } catch (_unused) {}
                              }}
                              style={({ pressed }) => ({
                                opacity: pressed ? 0.5 : 1,
                                padding: 6,
                                borderRadius: 8,
                                backgroundColor: isDark ? '#166534' + '40' : '#BBF7D0',
                              })}
                              accessibilityRole="button"
                              accessibilityLabel="Share weekly streak"
                            >
                              <Text style={{ fontSize: 14 }}>📤</Text>
                            </Pressable>
                          )}
                          {/* ✕ Dismiss */}
                          <Pressable
                            onPress={() => {
                              // Persist dismiss keyed to the current week's Monday date
                              const mondayKey = weekStart.toISOString().slice(0, 10);
                              setWeeklyCheckinDismissed(true);
                              safeSetItem(WEEKLY_CHECKIN_DISMISS_KEY, mondayKey).catch(() => {});
                              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            style={({ pressed }) => ({
                              opacity: pressed ? 0.4 : 0.7,
                              padding: 6,
                              borderRadius: 8,
                            })}
                            accessibilityRole="button"
                            accessibilityLabel="Dismiss streak card"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={{ fontSize: 16, color: isDark ? '#4ADE80' : '#166534', fontWeight: '600' }}>✕</Text>
                          </Pressable>
                        </View>
                        {/* Chip row — shown when user hasn’t logged today or glucose chip is enabled */}
                        {(!loggedToday || (glucoseChipEnabled && !(data?.bloodSugar ?? []).some(r => r.timestamp.slice(0, 10) === todayKey))) && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginLeft: 30 }}>
                            {/* "Log now →" chip — shown when user hasn't logged any vital today */}
                            {!loggedToday && (
                              <Pressable
                                onPress={() => {
                                  router.push({ pathname: '/(tabs)/record', params: { filterCategory: 'Vitals' } } as any);
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 12,
                                  paddingVertical: 5,
                                  borderRadius: 20,
                                  backgroundColor: pressed
                                    ? (isDark ? '#22C55E' : '#0F766E')
                                    : (isDark ? '#14B8A6' : '#22C55E'),
                                })}
                                accessibilityRole="button"
                                accessibilityLabel="Log vitals now"
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{ds.logNow ?? 'Log now →'}</Text>
                              </Pressable>
                            )}
                            {/* "Log glucose →" chip — shown only when glucose chip is enabled and no blood sugar logged today */}
                            {glucoseChipEnabled && !(data?.bloodSugar ?? []).some(r => r.timestamp.slice(0, 10) === todayKey) && (
                              <Pressable
                                onPress={() => {
                                  router.push('/log/blood-sugar' as any);
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 12,
                                  paddingVertical: 5,
                                  borderRadius: 20,
                                  backgroundColor: pressed
                                    ? (isDark ? '#B91C1C' : '#991B1B')
                                    : (isDark ? '#DC2626' : '#B91C1C'),
                                })}
                                accessibilityRole="button"
                                accessibilityLabel="Log blood glucose now"
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Log glucose →</Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    </GlassCard>
                  </ViewShot>
                );
              })()}


              {/* ─── Trial Ends Banner ─────────────────────────────────────────── */}
              {(() => {
                // Only show during trial_active state with days remaining
                if (subAccessState !== 'trial_active') return null;
                if (!trialDaysRemaining || trialDaysRemaining <= 0) return null;
                // Time windows: 8:00–8:30 AM or 6:00–6:30 PM
                const nowDate = new Date(tickerNow);
                const totalMin = nowDate.getHours() * 60 + nowDate.getMinutes();
                const inWindow =
                  (totalMin >= 8 * 60 && totalMin < 8 * 60 + 30) ||
                  (totalMin >= 18 * 60 && totalMin < 18 * 60 + 30);
                if (!inWindow) return null;
                // Dismissed today? Compare stored date to today's ISO date
                const todayDateStr = new Date().toISOString().slice(0, 10);
                if (trialBannerDismissedDate === todayDateStr) return null;
                const daysLabel = trialDaysRemaining === 1 ? '1 day' : `${trialDaysRemaining} days`;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      paywallGuard.tryPush(() => { router.push('/paywall' as any); });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: isDark ? '#1C1A2E' : '#F5F3FF',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#7C3AED50' : '#DDD6FE',
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>⏳</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#A78BFA' : '#5B21B6', lineHeight: 18 }}>
                        Trial ends in {daysLabel}
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#7C6FAA' : '#7C3AED', lineHeight: 15, marginTop: 1 }}>
                        Tap to upgrade and keep full access
                      </Text>
                    </View>
                    <TouchableOpacity
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => {
                        const todayKey = new Date().toISOString().slice(0, 10);
                        setTrialBannerDismissedDate(todayKey);
                        safeSetItem(TRIAL_BANNER_DISMISSED_DATE_KEY, todayKey).catch(() => {});
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ fontSize: 16, color: isDark ? '#7C6FAA' : '#7C3AED', fontWeight: '600', lineHeight: 20 }}>×</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })()}

              {/* Expired-trial persistent banner — no time window, dismissible for 7 days */}
              {(() => {
                if (subAccessState !== 'expired') return null;
                // Check 7-day TTL: hide if dismissed within the last 7 days
                if (expiredBannerDismissedAt) {
                  const dismissedMs = new Date(expiredBannerDismissedAt).getTime();
                  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
                  if (!isNaN(dismissedMs) && Date.now() - dismissedMs < sevenDaysMs) return null;
                }
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      paywallGuard.tryPush(() => { router.push('/paywall' as any); });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: isDark ? '#1E1A14' : '#FEF3C7',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#D9770650' : '#FCD34D',
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>🔒</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FBBF24' : '#92400E', lineHeight: 18 }}>
                        Your trial has ended
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#B45309' : '#B45309', lineHeight: 15, marginTop: 1 }}>
                        Subscribe now to restore full access
                      </Text>
                    </View>
                    <TouchableOpacity
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => {
                        const now = new Date().toISOString();
                        setExpiredBannerDismissedAt(now);
                        safeSetItem(EXPIRED_BANNER_DISMISSED_AT_KEY, now).catch(() => {});
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ fontSize: 16, color: isDark ? '#B45309' : '#92400E', fontWeight: '600', lineHeight: 20 }}>×</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })()}

              {!hasAnyReminder && (
                <View style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: isDark ? '#14532D30' : '#DCFCE7',
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: isDark ? '#16A34A50' : '#BBF7D0',
                }}>
                  <Text style={{ fontSize: 13 }}>✅</Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#4ADE80' : '#15803D', fontWeight: '700', letterSpacing: 0.2 }}>{ds.allClear ?? getStreakMessages(rawLang).allClear}</Text>
                </View>
              )}

              {/* ── Smart Reminders premium upsell nudge (free users only) ── */}
              {!isSmartReminderPremium && !(smartRemindersNudgeDismissedAt && Date.now() - new Date(smartRemindersNudgeDismissedAt).getTime() < 24 * 60 * 60 * 1000) && (
                <View
                  style={{
                    backgroundColor: isDark ? '#1e1a2e' : '#F5F3FF',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: isDark ? '#7C3AED40' : '#DDD6FE',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: isDark ? '#7C3AED30' : '#EDE9FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20 }}>🔔</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#A78BFA' : '#5B21B6', lineHeight: 18 }}>
                        {ds.smartRemindersUpsellTitle ?? 'Smart Reminders — Premium'}
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#7C6FAA' : '#7C3AED', lineHeight: 15, marginTop: 1 }}>
                        {ds.smartRemindersUpsellSub ?? 'Medication doses, appointment alerts & refill reminders.'}
                      </Text>
                    </View>
                  </View>
                  {/* CTA row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => {
                        logEvent('smart_reminders_trial_tap', { source: 'dashboard_nudge' });
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        const _nudgeDismissTs = new Date().toISOString();
                        setSmartRemindersNudgeDismissedAt(_nudgeDismissTs);
                        safeSetItem(SMART_REMINDERS_NUDGE_DISMISSED_KEY, _nudgeDismissTs).catch(() => {});
                        openSmartRemindersPaywall();
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: isDark ? '#7C3AED' : '#6D28D9',
                        borderRadius: 8,
                        paddingVertical: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{ds.smartRemindersStartTrial ?? 'Start Free Trial'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        logEvent('smart_reminders_learn_more_tap', { source: 'dashboard_nudge' });
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const _learnMoreDismissTs = new Date().toISOString();
                        setSmartRemindersNudgeDismissedAt(_learnMoreDismissTs);
                        safeSetItem(SMART_REMINDERS_NUDGE_DISMISSED_KEY, _learnMoreDismissTs).catch(() => {});
                        openSmartRemindersPaywall();
                      }}
                      style={{ paddingHorizontal: 4, paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 11, color: isDark ? '#A78BFA' : '#7C3AED', fontWeight: '600' }}>{ds.smartRemindersLearnMore ?? 'Learn more ›'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {showApptReminders && upcomingAppts.map((appt: any) => {
                const apptId = `appt-${appt.id}`;
                if (dismissedReminderIds.has(apptId) || isSnoozed(apptId)) return null;
                const apptDate = new Date(appt.dateTime);
                const msUntil = apptDate.getTime() - now;
                const timeLabel = apptDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateLabel = (() => {
                  const isToday = apptDate >= todayStart && apptDate.getTime() < todayStart.getTime() + 86400_000;
                  const isTomorrow = apptDate.getTime() >= todayStart.getTime() + 86400_000 && apptDate.getTime() < todayStart.getTime() + 2 * 86400_000;
                  return isToday ? `${ds.apptDateToday ?? 'Today'} ${timeLabel}` : isTomorrow ? `${ds.apptDateTomorrow ?? 'Tomorrow'} ${timeLabel}` : apptDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                })();
                // Within-24h enhancements: show location + collapsible prep checklist
                const isWithin24h = msUntil > 0 && msUntil <= APPT_LEAD_MS;
                const allPrepItems: any[] = isWithin24h ? (appt.prepChecklist ?? []) : [];
                const uncheckedPrepItems = allPrepItems.filter((item: any) => !item.checked);
                const isPrepExpanded = expandedPrepChecklists.has(appt.id);
                const togglePrepExpanded = () => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPrepChecklists(prev => {
                    const next = new Set(prev);
                    if (next.has(appt.id)) next.delete(appt.id);
                    else next.add(appt.id);
                    return next;
                  });
                };
                const handleTogglePrepItem = async (itemId: string) => {
                  const updatedChecklist = (appt.prepChecklist ?? []).map((item: any) =>
                    item.id === itemId ? { ...item, checked: !item.checked } : item
                  );
                  await updateAppointment({ ...appt, prepChecklist: updatedChecklist });
                  // Success haptic when all items are now checked
                  const allChecked = updatedChecklist.every((item: any) => item.checked);
                  if (Platform.OS !== 'web') {
                    if (allChecked) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                  }
                };
                return (
                  <View
                    key={apptId}
                    style={{
                      backgroundColor: isDark ? '#1A1F3A' : '#EFF6FF',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: isWithin24h ? 1.5 : 1,
                      borderColor: isWithin24h
                        ? (isDark ? '#3B82F680' : '#93C5FD')
                        : (isDark ? '#2563EB40' : '#BFDBFE'),
                    }}
                  >
                    {/* Top row: icon + info + countdown */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => router.push('/log/appointments' as any)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <Text style={{ fontSize: 20 }}>📅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#93C5FD' : '#1D4ED8' }} numberOfLines={1}>{appt.doctorName || 'Appointment'}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{appt.specialty ? `${appt.specialty} · ` : ''}{dateLabel}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#2563EB25' : '#DBEAFE' }}>
                        <Text style={{ fontSize: 11, color: isDark ? '#93C5FD' : '#1D4ED8', fontWeight: '700' }}>⏱ {fmtCountdown(msUntil)}</Text>
                      </View>
                    </TouchableOpacity>
                    {/* Location row — shown when within 24h */}
                    {isWithin24h && !!appt.location && (
                       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                         <Text style={{ fontSize: 12 }}>📍</Text>
                         <Text style={{ fontSize: 11, color: isDark ? '#93C5FD' : '#1D4ED8', flex: 1 }} numberOfLines={1}>{appt.location}</Text>
                         <TouchableOpacity
                           onPress={() => {
                             const encoded = encodeURIComponent(appt.location ?? '');
                             // Try Apple Maps first (iOS), fall back to Google Maps
                             const appleUrl = `maps://?q=${encoded}`;
                             const googleUrl = `https://maps.google.com/?q=${encoded}`;
                             Linking.canOpenURL(appleUrl).then(supported => {
                               Linking.openURL(supported ? appleUrl : googleUrl);
                             }).catch(() => Linking.openURL(googleUrl));
                             if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                           }}
                           style={{
                             paddingHorizontal: 8, paddingVertical: 3,
                             borderRadius: 8,
                             backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#EFF6FF',
                             borderWidth: 1,
                             borderColor: isDark ? 'rgba(59,130,246,0.35)' : '#BFDBFE',
                           }}
                           hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                         >
                           <Text style={{ fontSize: 10, color: isDark ? '#93C5FD' : '#1D4ED8', fontWeight: '600' }}>{ds.apptDirections}</Text>
                         </TouchableOpacity>
                       </View>
                     )}
                    {/* Collapsible prep checklist — shown when within 24h and items exist */}
                    {allPrepItems.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        {/* Collapse/expand header */}
                        <TouchableOpacity
                          onPress={togglePrepExpanded}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE',
                            borderRadius: isPrepExpanded ? 8 : 8,
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            borderBottomLeftRadius: isPrepExpanded ? 0 : 8,
                            borderBottomRightRadius: isPrepExpanded ? 0 : 8,
                          }}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#93C5FD' : '#1D4ED8', flex: 1 }}>
                            📋 {(ds.apptPrepRemaining ?? 'Prep — {unchecked}/{total} remaining').replace('{unchecked}', String(uncheckedPrepItems.length)).replace('{total}', String(allPrepItems.length))}
                          </Text>
                          <Text style={{ fontSize: 11, color: isDark ? '#93C5FD' : '#1D4ED8', fontWeight: '700' }}>
                            {isPrepExpanded ? '▾' : '▸'}
                          </Text>
                        </TouchableOpacity>
                        {/* Expanded checklist items */}
                        {isPrepExpanded && (
                          <View style={{
                            backgroundColor: isDark ? '#162A4A' : '#EFF6FF',
                            borderRadius: 8,
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderWidth: 1,
                            borderTopWidth: 0,
                            borderColor: isDark ? '#1E3A5F' : '#BFDBFE',
                          }}>
                            {allPrepItems.map((item: any) => (
                              <PrepCheckItem
                                key={item.id}
                                item={item}
                                isDark={isDark}
                                onToggle={handleTogglePrepItem}
                              />
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                    {/* Action buttons row */}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                      {/* Reschedule button — deep-links to edit form */}
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          router.push({ pathname: '/log/appointments', params: { rescheduleId: appt.id } } as any);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#2563EB25' : '#DBEAFE', borderWidth: 1, borderColor: isDark ? '#2563EB60' : '#BFDBFE', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#93C5FD' : '#1D4ED8', fontWeight: '700' }}>{ds.apptReschedule}</Text>
                      </TouchableOpacity>
                      {/* Confirm Attendance button */}
                      {!confirmedApptIds.has(appt.id) ? (
                        <TouchableOpacity
                          onPress={async () => {
                            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setConfirmedApptIds(prev => {
                              const next = new Set(prev);
                              next.add(appt.id);
                              safeSetItem(CONFIRMED_APPT_IDS_KEY, JSON.stringify([...next])).catch(() => {});
                              return next;
                            });
                            showHealthKitToast(`${appt.doctorName || 'Appointment'} confirmed ✓`);
                            // Schedule a 24-hour push notification reminder
                            if (Platform.OS !== 'web') {
                              try {
                                const Notifications = await getNotificationsAsync(); if (!Notifications) return;
                                const { status } = await Notifications.requestPermissionsAsync();
                                if (status === 'granted') {
                                  const triggerMs = new Date(appt.dateTime).getTime() - 24 * 3600_000;
                                  if (triggerMs > Date.now()) {
                                    await Notifications.scheduleNotificationAsync({
                                      content: {
                                        title: ds.apptTomorrow,
                                        body: `${appt.doctorName || 'Your appointment'}${appt.specialty ? ` (${appt.specialty})` : ''} is tomorrow at ${safeFormatTime(appt.dateTime, [], { hour: '2-digit', minute: '2-digit' })}.`,
                                        sound: true,
                                      },
                                      trigger: { type: 'date', date: new Date(triggerMs) } as any,
                                    });
                                  }
                                }
                              } catch (_unused) {}
                            }
                          }}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#7C3AED25' : '#EDE9FE', borderWidth: 1, borderColor: isDark ? '#7C3AED60' : '#C4B5FD', alignItems: 'center' }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={{ fontSize: 11, color: isDark ? '#A78BFA' : '#5B21B6', fontWeight: '700' }}>{ds.apptConfirm}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#7C3AED18' : '#F5F3FF', borderWidth: 1, borderColor: isDark ? '#7C3AED40' : '#DDD6FE', alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: isDark ? '#A78BFA99' : '#7C3AED99', fontWeight: '700' }}>{ds.apptConfirmed}</Text>
                        </View>
                      )}
                      {/* Done button */}
                      <TouchableOpacity
                        onPress={() => dismissReminder(apptId, 'appointment', appt.doctorName || 'Appointment')}
                        onLongPress={() => snoozeReminder(apptId)}
                        delayLongPress={500}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#16A34A30' : '#DCFCE7', borderWidth: 1, borderColor: isDark ? '#16A34A60' : '#BBF7D0', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>{ds.bpDone ?? 'Done ✓'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Missed appointment cards */}
              {showApptReminders && missedAppts.map((appt: any) => {
                const missedId = `missed-appt-${appt.id}`;
                const apptDate = new Date(appt.dateTime);
                const daysAgo = Math.floor((now - apptDate.getTime()) / (24 * 3600_000));
                const daysAgoLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
                const timeLabel = apptDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <View
                    key={missedId}
                    style={{
                      backgroundColor: isDark ? '#2D1A0A' : '#FFFBEB',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#D97706' + '50' : '#FDE68A',
                    }}
                  >
                    {/* Top row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>📅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#FCD34D' : '#92400E' }} numberOfLines={1}>
                          {appt.doctorName || 'Appointment'}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          {appt.specialty ? `${appt.specialty} · ` : ''}{daysAgoLabel} at {timeLabel}
                        </Text>
                      </View>
                      {/* Amber "Missed" badge */}
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#D97706' + '30' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D97706' + '60' : '#FCD34D' }}>
                        <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>{ds.apptMissedBadge}</Text>
                      </View>
                    </View>
                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      {/* Log outcome */}
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          router.push('/log/appointments' as any);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#D97706' + '25' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D97706' + '60' : '#FCD34D', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 12, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>📝 Log outcome</Text>
                      </TouchableOpacity>
                      {/* Dismiss */}
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setDismissedReminderIds(prev => {
                            const next = new Set(prev);
                            next.add(missedId);
                            safeSetItem(SMART_REMINDER_DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
                            return next;
                          });
                        }}
                        style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {/* Vital signs reminder */}
              {showVitalsReminder && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push('/log/vitals' as any)}
                  style={{
                    backgroundColor: isDark ? '#1A1A2E' : '#FFF7ED',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderWidth: 1,
                    borderColor: isDark ? '#EA580C40' : '#FED7AA',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>❤️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#FB923C' : '#9A3412' }}>{ds.takeBP ?? 'Take blood pressure'}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{ds.bpNotLogged ?? 'BP not logged'} · {ds.bpWindowOpen ?? '30-min window open'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {/* 30-min window chip */}
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#EA580C25' : '#FEF3C7' }}>
                      <Text style={{ fontSize: 11, color: isDark ? '#FB923C' : '#92400E', fontWeight: '700' }}>{ds.bpWindow30m ?? '⏱ 30m'}</Text>
                    </View>
                    {/* Done button */}
                    <TouchableOpacity
                      onPress={() => dismissReminder(vitalsReminderId, 'blood_pressure', 'Blood Pressure Check')}
                      onLongPress={() => snoozeCategory([vitalsReminderId])}
                      delayLongPress={500}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDark ? '#16A34A30' : '#DCFCE7', borderWidth: 1, borderColor: isDark ? '#16A34A60' : '#BBF7D0' }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>{ds.bpDone ?? 'Done ✓'}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )}
              {/* Vaccine / immunization smart notification cards — 48 hr lookahead */}
              {upcomingVaccines.map((vax: any) => {
                const vaxId = `vax-${vax.id}`;
                if (dismissedReminderIds.has(vaxId) || isSnoozed(vaxId)) return null;
                const dueMs = new Date(vax.nextDoseDate).getTime();
                const daysLeft = Math.ceil((dueMs - now) / (24 * 3600_000));
                // 48hr card: auto-snooze for 30 min on first render so it disappears
                // and re-fires 30 min later. 24hr card stays until explicit dismiss.
                const is48hrCard = daysLeft > 1;
                const vaxSnoozeKey = `vax-48hr-init-${vax.id}`;
                if (is48hrCard && !snoozedReminderMap[vaxId]) {
                  // Schedule the 30-min auto-dismiss only once (guard with a separate snooze key)
                  if (!snoozedReminderMap[vaxSnoozeKey]) {
                    // Auto-snooze the 48hr card for 30 minutes on first appearance
                    snoozeReminderFor(vaxId, VAX_48HR_AUTO_DISMISS_MS);
                    // Mark that we've already set the auto-snooze so we don't reset it on re-render
                    snoozeReminderFor(vaxSnoozeKey, VAX_48HR_AUTO_DISMISS_MS + 1000);
                    return null;
                  }
                }
                return (
                  <VaccineDueNotificationCard
                    key={vaxId}
                    record={vax}
                    daysLeft={daysLeft}
                    onActionComplete={async (updated) => {
                      await updateImmunization(updated);
                    }}
                    onDismiss={() => dismissReminder(vaxId, 'immunization', vax.vaccineName)}
                  />
                );
              })}
              {/* Blood sugar reminder */}
              {/* ── Adherence card is now in the Medications tab ── */}
              {false && (() => {
                // Compute 7-day adherence: count scheduled doses that were taken (not missed/skipped)
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() - 6);
                let totalScheduled = 0;
                let totalTaken = 0;
                for (let d = 0; d < 7; d++) {
                  const day = new Date(weekStart);
                  day.setDate(weekStart.getDate() + d);
                  const dayKey = day.toISOString().split('T')[0];
                  const isToday = dayKey === new Date().toISOString().split('T')[0];
                  const dayNowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : 24 * 60;
                  for (const med of medications.filter((m: any) => m.active !== false && (m.scheduleTimes ?? []).length > 0)) {
                    for (const t of (med.scheduleTimes ?? [])) {
                      const [hh, mm] = t.split(':').map(Number);
                      const schedMin = hh * 60 + mm;
                      if (isToday && schedMin > dayNowMin + 60) continue; // not yet due today
                      totalScheduled++;
                      const taken = (med.doseLogs ?? []).some(
                        (l: any) => l.date === dayKey && l.scheduledTime === t && l.status === 'taken'
                      );
                      if (taken) totalTaken++;
                    }
                  }
                }
                if (totalScheduled === 0) return null;
                const pct = Math.round((totalTaken / totalScheduled) * 100);
                const barColor = pct >= 80 ? (isDark ? '#4ADE80' : '#16A34A') : pct >= 50 ? (isDark ? '#FBBF24' : '#D97706') : (isDark ? '#F87171' : '#DC2626');
                const bgColor = pct >= 80 ? (isDark ? '#052E16' : '#F0FDF4') : pct >= 50 ? (isDark ? '#451A03' : '#FFFBEB') : (isDark ? '#450A0A' : '#FFF1F2');
                const borderColor = pct >= 80 ? (isDark ? '#16A34A50' : '#BBF7D0') : pct >= 50 ? (isDark ? '#D9770650' : '#FDE68A') : (isDark ? '#DC262650' : '#FECDD3');

                // 7-day bar chart data
                const dayBars = Array.from({ length: 7 }, (_, d) => {
                  const day = new Date(weekStart);
                  day.setDate(weekStart.getDate() + d);
                  const dayKey = day.toISOString().split('T')[0];
                  const isToday = dayKey === new Date().toISOString().split('T')[0];
                  const dayNowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : 24 * 60;
                  let dayScheduled = 0, dayTaken = 0, dayMissed = 0, daySkipped = 0;
                  for (const med of medications.filter((m: any) => m.active !== false && (m.scheduleTimes ?? []).length > 0)) {
                    for (const t of (med.scheduleTimes ?? [])) {
                      const [hh, mm] = t.split(':').map(Number);
                      if (isToday && (hh * 60 + mm) > dayNowMin + 60) continue;
                      dayScheduled++;
                      const log = (med.doseLogs ?? []).find((l: any) => l.date === dayKey && l.scheduledTime === t);
                      if (log?.status === 'taken') dayTaken++;
                      else if (log?.status === 'missed') dayMissed++;
                      else if (log?.status === 'skipped') daySkipped++;
                    }
                  }
                  const label = ['Su','Mo','Tu','We','Th','Fr','Sa'][day.getDay()];
                  return { label, dayScheduled, dayTaken, dayMissed, daySkipped, isToday };
                });
                const maxBarDoses = Math.max(...dayBars.map(b => b.dayScheduled), 1);
                const BAR_H = 40;

                // ── 4-week rolling sparkline (weekly % per week, oldest → newest) ──
                const weeklySparkline = Array.from({ length: 4 }, (_, wi) => {
                  // wi=0 is 4 weeks ago, wi=3 is current week
                  const wStart = new Date();
                  wStart.setDate(wStart.getDate() - (3 - wi) * 7 - 6);
                  let wSched = 0, wTaken = 0;
                  for (let dd = 0; dd < 7; dd++) {
                    const day = new Date(wStart);
                    day.setDate(wStart.getDate() + dd);
                    const dayKey = day.toISOString().split('T')[0];
                    const isToday2 = dayKey === new Date().toISOString().split('T')[0];
                    const dayNowMin2 = isToday2 ? (new Date().getHours() * 60 + new Date().getMinutes()) : 24 * 60;
                    for (const med of medications.filter((m: any) => m.active !== false && (m.scheduleTimes ?? []).length > 0)) {
                      for (const t of (med.scheduleTimes ?? [])) {
                        const [hh2, mm2] = t.split(':').map(Number);
                        if (isToday2 && (hh2 * 60 + mm2) > dayNowMin2 + 60) continue;
                        wSched++;
                        if ((med.doseLogs ?? []).some((l: any) => l.date === dayKey && l.scheduledTime === t && l.status === 'taken')) wTaken++;
                      }
                    }
                  }
                  return wSched > 0 ? Math.round((wTaken / wSched) * 100) : null;
                });
                const _sparkMax = Math.max(...weeklySparkline.filter((v): v is number => v !== null), adherenceGoal, 1);
                const _SPARK_H = 28;
                const _SPARK_W = 48;

                const goalMet = pct >= adherenceGoal;
                const goalBarColor = goalMet ? (isDark ? '#4ADE80' : '#16A34A') : (isDark ? '#FBBF24' : '#D97706');

                return (
                  <View
                    key="adherence-card"
                    style={{
                      backgroundColor: bgColor,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor,
                    }}
                  >
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 16, marginRight: 6 }}>📊</Text>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/(tabs)/medications', params: { filter: 'history' } } as any)}
                        activeOpacity={0.7}
                        style={{ flex: 1 }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: barColor }}>
                          {pct}% adherence this week
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setAdherenceGoalEditorValue(String(adherenceGoal));
                          setAdherenceGoalEditorVisible(true);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                        style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <Text style={{ fontSize: 10, color: goalBarColor, fontWeight: '700' }}>Goal: {adherenceGoal}%</Text>
                        <Text style={{ fontSize: 9, color: colors.muted }}>✏️</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Dual progress bar: actual vs goal */}
                    <View style={{ marginBottom: 8 }}>
                      <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', position: 'relative' }}>
                        {/* Actual adherence fill */}
                        <View style={{ height: 7, borderRadius: 4, backgroundColor: barColor, width: `${pct}%` as any }} />
                      </View>
                      {/* Goal marker line */}
                      <View style={{ position: 'absolute', left: `${adherenceGoal}%` as any, top: 0, width: 2, height: 7, backgroundColor: isDark ? '#FFFFFF60' : '#00000040', borderRadius: 1 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                        <Text style={{ fontSize: 9, color: colors.muted }}>{totalTaken} of {totalScheduled} doses taken</Text>
                        <Text style={{ fontSize: 9, color: goalMet ? (isDark ? '#4ADE80' : '#16A34A') : (isDark ? '#FBBF24' : '#D97706'), fontWeight: '600' }}>
                          {goalMet ? `✓ Goal met (${adherenceGoal}%)` : `${adherenceGoal - pct}% below goal`}
                        </Text>
                      </View>
                    </View>
                    {/* 7-day stacked bar chart */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: BAR_H + 18 }}>
                      {dayBars.map((bar, i) => {
                        const takenH = bar.dayScheduled > 0 ? (bar.dayTaken / maxBarDoses) * BAR_H : 0;
                        const missedH = bar.dayScheduled > 0 ? (bar.dayMissed / maxBarDoses) * BAR_H : 0;
                        const skippedH = bar.dayScheduled > 0 ? (bar.daySkipped / maxBarDoses) * BAR_H : 0;
                        const emptyH = BAR_H - takenH - missedH - skippedH;
                        return (
                          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                            <View style={{ width: '100%', height: BAR_H, justifyContent: 'flex-end', borderRadius: 3, overflow: 'hidden', backgroundColor: colors.border + '40' }}>
                              {emptyH > 0 && <View style={{ height: emptyH }} />}
                              {skippedH > 0 && <View style={{ height: skippedH, backgroundColor: isDark ? '#FBBF24' : '#D97706' }} />}
                              {missedH > 0 && <View style={{ height: missedH, backgroundColor: isDark ? '#F87171' : '#DC2626' }} />}
                              {takenH > 0 && <View style={{ height: takenH, backgroundColor: isDark ? '#4ADE80' : '#16A34A' }} />}
                            </View>
                            <Text style={{ fontSize: 9, color: bar.isToday ? barColor : colors.muted, fontWeight: bar.isToday ? '700' : '400', marginTop: 2 }}>
                              {bar.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    {/* Legend + Share button row */}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? '#4ADE80' : '#16A34A' }} />
                        <Text style={{ fontSize: 9, color: colors.muted }}>Taken</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? '#F87171' : '#DC2626' }} />
                        <Text style={{ fontSize: 9, color: colors.muted }}>Missed</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? '#FBBF24' : '#D97706' }} />
                        <Text style={{ fontSize: 9, color: colors.muted }}>Skipped</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      {Platform.OS !== 'web' && <TouchableOpacity
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          // Generate weekly adherence share PDF
                          try {
                            const SharingMod = Sharing;
                            const FileSystemMod = FileSystem;
                            const dateStr = new Date().toISOString().slice(0, 10);
                            const mL = (medPdfStrings as unknown as Record<string, Record<string, string>>)[lang] ?? medPdfStrings.en;
                            // Build bar chart rows
                            const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'short' });
                            const chartRows = dayBars.map(bar => {
                              const takenPct = bar.dayScheduled > 0 ? Math.round((bar.dayTaken / bar.dayScheduled) * 100) : 0;
                              const statusColor = takenPct >= adherenceGoal ? '#16A34A' : takenPct >= 50 ? '#D97706' : '#DC2626';
                              const barWidth = bar.dayScheduled > 0 ? Math.round((bar.dayTaken / maxBarDoses) * 100) : 0;
                              return `<tr>
                                <td style="font-weight:${bar.isToday ? '700' : '400'};color:${bar.isToday ? '#0a7ea4' : '#111'}">${bar.label}${bar.isToday ? ` (${todayLabel})` : ''}</td>
                                <td>${bar.dayScheduled}</td>
                                <td style="color:#16A34A">${bar.dayTaken}</td>
                                <td style="color:#DC2626">${bar.dayMissed}</td>
                                <td style="color:#D97706">${bar.daySkipped}</td>
                                <td>
                                  <div style="display:flex;align-items:center;gap:6px">
                                    <div style="flex:1;height:10px;background:#eee;border-radius:5px;overflow:hidden">
                                      <div style="height:10px;width:${barWidth}%;background:${statusColor};border-radius:5px"></div>
                                    </div>
                                    <span style="font-weight:700;color:${statusColor};min-width:32px">${takenPct}%</span>
                                  </div>
                                </td>
                              </tr>`;
                            }).join('');
                            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
                              body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:600px;margin:0 auto}
                              h1{color:#0a7ea4;font-size:20px;margin-bottom:4px}
                              .sub{color:#666;font-size:12px;margin-bottom:20px}
                              .summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
                              .stat{text-align:center;padding:10px 16px;border-radius:8px;background:#f5f5f5;min-width:80px}
                              .stat-val{font-size:22px;font-weight:700}
                              .stat-lbl{font-size:10px;color:#666;margin-top:2px}
                              .goal-row{padding:10px 14px;border-radius:8px;background:${pct >= adherenceGoal ? '#F0FDF4' : '#FFFBEB'};border:1px solid ${pct >= adherenceGoal ? '#BBF7D0' : '#FDE68A'};margin-bottom:20px;font-size:13px}
                              table{width:100%;border-collapse:collapse;font-size:12px}
                              th{background:#0a7ea4;color:#fff;padding:8px 6px;text-align:left}
                              td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:middle}
                              tr:nth-child(even) td{background:#f9f9f9}
                              .footer{margin-top:20px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:10px}
                            </style></head><body>
                              <h1>${mL.weeklyReportTitle}</h1>
                              <div class="sub">${mL.generatedOn} ${new Date().toLocaleDateString()} · 7-day window ending today</div>
                              <div class="goal-row">
                                <strong>${mL.adherenceGoal}: ${adherenceGoal}%</strong> &nbsp;·&nbsp;
                                ${mL.thisWeek}: <strong style="color:${pct >= adherenceGoal ? '#16A34A' : '#D97706'}">${pct}%</strong> &nbsp;·&nbsp;
                                ${pct >= adherenceGoal ? mL.goalMet : `${adherenceGoal - pct}% ${mL.belowGoal}`}
                              </div>
                              <div class="summary">
                                <div class="stat"><div class="stat-val" style="color:#0a7ea4">${pct}%</div><div class="stat-lbl">${mL.statAdherence}</div></div>
                                <div class="stat"><div class="stat-val" style="color:#16A34A">${totalTaken}</div><div class="stat-lbl">${mL.statTaken}</div></div>
                                <div class="stat"><div class="stat-val" style="color:#DC2626">${dayBars.reduce((s, b) => s + b.dayMissed, 0)}</div><div class="stat-lbl">${mL.statMissed}</div></div>
                                <div class="stat"><div class="stat-val" style="color:#D97706">${dayBars.reduce((s, b) => s + b.daySkipped, 0)}</div><div class="stat-lbl">${mL.statSkipped}</div></div>
                                <div class="stat"><div class="stat-val">${totalScheduled}</div><div class="stat-lbl">${mL.statTotal}</div></div>
                              </div>
                              <table>
                                <thead><tr><th>${mL.colDay}</th><th>${mL.colScheduled}</th><th>${mL.statTaken}</th><th>${mL.statMissed}</th><th>${mL.statSkipped}</th><th>${mL.colDailyRate}</th></tr></thead>
                                <tbody>${chartRows}</tbody>
                              </table>
                              <div class="footer">${mL.weeklyFooter}</div>
                            </body></html>`;
                            const { uri: rawUri } = await Print.printToFileAsync({ html, base64: false });
                            const namedUri = `${FileSystemMod.cacheDirectory}VitalSync_Weekly_Adherence_${dateStr}.pdf`;
                            await FileSystemMod.copyAsync({ from: rawUri, to: namedUri });
                            // Delete the raw temp file from Print.printToFileAsync immediately
                            FileSystemMod.deleteAsync(rawUri, { idempotent: true }).catch(() => {});
                            const canShare = await SharingMod.isAvailableAsync();
                            if (canShare) {
                              await SharingMod.shareAsync(namedUri, { mimeType: 'application/pdf', dialogTitle: 'Share Weekly Adherence Summary', UTI: 'com.adobe.pdf' });
                              // Delete the named PDF after sharing to prevent health data lingering in cache
                              FileSystemMod.deleteAsync(namedUri, { idempotent: true }).catch(() => {});
                            } else {
                              Alert.alert('PDF Saved', `Weekly summary saved to: ${namedUri}`);
                            }
                            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          } catch (_e) {
                            Alert.alert('Error', 'Failed to generate weekly summary PDF.');
                          }
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? '#0a7ea425' : '#E0F2FE', borderWidth: 1, borderColor: isDark ? '#0a7ea460' : '#BAE6FD', flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <Text style={{ fontSize: 9, color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '700' }}>⬆ Share</Text>
                      </TouchableOpacity>}
                    </View>
                    {pct < 80 && (
                      <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
                        {pct < 50 ? 'Low adherence — consider speaking with your pharmacist.' : 'Getting there — try setting reminders for missed doses.'}
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* ── All medications done for today — summary card ── */}


              {/* ── Medication dose window reminders — smart notification cards ── */}
              {showMedReminders && dueMeds.slice(0, 5).map(med => {
                // Collect all unlogged due times for this medication
                const todayKey = new Date().toISOString().split('T')[0];
                const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
                const dueTimes = (med.scheduleTimes ?? []).filter(t => {
                  const [hh, mm] = t.split(':').map(Number);
                  const schedMin = hh * 60 + mm;
                  const alreadyLogged = (med.doseLogs ?? []).some(
                    l => l.date === todayKey && l.scheduledTime === t && (l.status === 'taken' || l.status === 'skipped')
                  );
                  return !alreadyLogged && Math.abs(schedMin - nowMinutes) <= 60;
                });
                return dueTimes.map(scheduledTime => {
                  const remId = `med-dose-${med.id}-${scheduledTime}`;
                  if (dismissedReminderIds.has(remId) || isSnoozed(remId)) return null;
                  return (
                    <MedTodayNotificationCard
                      key={remId}
                      med={med}
                      scheduledTime={scheduledTime}
                      onActionComplete={(updatedMeds) => setMedications(updatedMeds)}
                      onDismiss={() => dismissReminder(remId, 'medication' as any, med.name)}
                      onSnooze={(ms) => snoozeReminderFor(remId, ms)}
                    />
                  );
                });
              })}

              {/* ── Missed dose streak alert ── */}
              {showMedReminders && missedStreakMeds.length > 0 && missedStreakMeds.map(({ name, streak }) => (
                <View
                  key={`streak-${name}`}
                  style={{
                    backgroundColor: isDark ? '#450A0A' : '#FFF1F2',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    borderWidth: 1,
                    borderColor: isDark ? '#DC262650' : '#FECDD3',
                  }}
                >
                  <Text style={{ fontSize: 20, marginTop: 1 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F87171' : '#B91C1C' }}>
                      {name} missed {streak} days in a row
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 15 }}>
                      Please contact your doctor or pharmacist if you are having trouble taking this medication consistently.
                    </Text>
                  </View>
                </View>
              ))}

              {/* ── Reason streak alert banners ── */}
              {showMedReminders && reasonStreakAlerts.slice(0, 3).map(({ reason, count, action }) => {
                const alertId = `reason-streak-${reason}`;
                if (dismissedReminderIds.has(alertId)) return null;
                const isRefill = reason.toLowerCase().includes('ran out') || reason.toLowerCase().includes('refill') || reason.toLowerCase().includes('supply');
                const isSideEffect = reason.toLowerCase().includes('side effect') || reason.toLowerCase().includes('nausea') || reason.toLowerCase().includes('pain');
                const accentColor = isRefill ? '#F59E0B' : isSideEffect ? '#EF4444' : '#8B5CF6';
                const bgColor = isRefill
                  ? (isDark ? '#451A0340' : '#FFFBEB')
                  : isSideEffect
                    ? (isDark ? '#450A0A40' : '#FFF1F2')
                    : (isDark ? '#2E1065' + '40' : '#F5F3FF');
                const borderColor = accentColor + (isDark ? '50' : '60');
                return (
                  <View
                    key={alertId}
                    style={{
                      backgroundColor: bgColor,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: borderColor,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Text style={{ fontSize: 18, marginTop: 1 }}>{isRefill ? '💊' : isSideEffect ? '⚠️' : '💡'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor }}>
                          “{reason}” — {count}× in a row
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 15 }}>
                          {action}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      {isRefill && (
                        <TouchableOpacity
                          onPress={() => router.push('/(tabs)/medications' as any)}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: accentColor + '20', borderWidth: 1, borderColor: accentColor + '50', alignItems: 'center' }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={{ fontSize: 11, color: accentColor, fontWeight: '700' }}>{h.viewMedications}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          // Use 7-day TTL for reason-streak dismissals
                          setDismissedReminderIds(prev => {
                            const next = new Set(prev);
                            next.add(alertId);
                            safeSetItem(SMART_REMINDER_DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
                            return next;
                          });
                          AsyncStorage.getItem(SMART_REMINDER_DISMISSED_TTL_KEY).then(raw => {
                            let ttlMap: Record<string, number> = {};
                            if (raw) { try { ttlMap = JSON.parse(raw); } catch (_unused) {} }
                            ttlMap[alertId] = Date.now() + REASON_STREAK_DISMISSED_TTL_MS;
                            safeSetItem(SMART_REMINDER_DISMISSED_TTL_KEY, JSON.stringify(ttlMap)).catch(() => {});
                          }).catch(() => {});
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#1E2022' : '#F5F5F5', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{h.dismiss}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* ── Missed dose reminder cards ── */}
              {showMedReminders && missedDoses.slice(0, 5).map(({ med, scheduledTime }) => {
                const remId = `med-missed-${med.id}-${scheduledTime}`;
                if (dismissedReminderIds.has(remId) || isSnoozed(remId)) return null;
                const [hh, mm] = (scheduledTime ?? '00:00').split(':').map(Number);
                const _schedDate = new Date(); _schedDate.setHours(isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm, 0, 0);
                const timeLabel = safeFormatTime(_schedDate, [], { hour: '2-digit', minute: '2-digit' });
                return (
                  <View
                    key={remId}
                    style={{
                      backgroundColor: isDark ? '#1A0A0A' : '#FFF1F2',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#EF444440' : '#FECACA',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>💊</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#F87171' : '#DC2626' }}>
                          Missed dose: {med.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          Scheduled {timeLabel} · Not logged
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#EF444425' : '#FEE2E2' }}>
                        <Text style={{ fontSize: 11, color: isDark ? '#F87171' : '#DC2626', fontWeight: '700' }}>{ds.doseMissedBtn}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                      {/* Taken */}
                      <TouchableOpacity
                        onPress={async () => {
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          const reloadMeds = loadMedications;
                          const currentMeds = await reloadMeds();
                          const today = new Date().toISOString().split('T')[0];
                          const doseLog = createDoseLog(today, scheduledTime, 'taken');
                          const updatedMeds = await logDose(currentMeds, (med as any).id, doseLog);
                          setMedications(updatedMeds);
                          dismissReminder(remId, 'medication' as any, `Taken ${med.name}`);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#14532D40' : '#DCFCE7', borderWidth: 1, borderColor: isDark ? '#16A34A60' : '#BBF7D0', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>{ds.doseTakenBtn}</Text>
                      </TouchableOpacity>
                      {/* Missed — opens inline reason picker */}
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setPendingMissedDose({ remId, medId: (med as any).id, medName: med.name, scheduledTime });
                          setMissedReasonId(missedReasonId === remId ? null : remId);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#7F1D1D30' : '#FEF2F2', borderWidth: 1, borderColor: isDark ? '#EF444440' : '#FECACA', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#F87171' : '#DC2626', fontWeight: '700' }}>{ds.doseMissedBtn}</Text>
                      </TouchableOpacity>
                      {/* Inline reason picker */}
                      {missedReasonId === remId && (
                        <View style={{ marginTop: 8, backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, marginBottom: 6 }}>Why was this dose missed?</Text>
                          {(['Forgot', 'Side effects', 'Ran out', 'Felt better'] as const).map((reason) => (
                            <TouchableOpacity
                              key={reason}
                              onPress={async () => {
                                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                const reloadMeds = loadMedications;
                                const currentMeds = await reloadMeds();
                                const today = new Date().toISOString().split('T')[0];
                                const doseLog = createDoseLog(today, scheduledTime, 'missed', reason);
                                const updatedMeds = await logDose(currentMeds, (med as any).id, doseLog);
                                setMedications(updatedMeds);
                                setMissedReasonId(null);
                                setPendingMissedDose(null);
                                setShowOtherReasonInput(false);
                                setOtherReasonText('');
                                dismissReminder(remId, 'medication' as any, `Missed ${med.name}: ${reason}`);
                              }}
                              style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7, marginBottom: 4, backgroundColor: isDark ? '#374151' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB' }}
                            >
                              <Text style={{ fontSize: 12, color: isDark ? '#F9FAFB' : '#111827' }}>{reason}</Text>
                            </TouchableOpacity>
                          ))}
                          {/* Other… chip */}
                          <TouchableOpacity
                            onPress={() => {
                              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setShowOtherReasonInput(prev => !prev);
                              setOtherReasonText('');
                            }}
                            style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7, marginBottom: 4, backgroundColor: showOtherReasonInput ? (isDark ? '#1D4ED830' : '#EFF6FF') : (isDark ? '#374151' : '#FFFFFF'), borderWidth: 1, borderColor: showOtherReasonInput ? (isDark ? '#3B82F680' : '#BFDBFE') : (isDark ? '#4B5563' : '#E5E7EB') }}
                          >
                            <Text style={{ fontSize: 12, color: showOtherReasonInput ? (isDark ? '#93C5FD' : '#1D4ED8') : (isDark ? '#F9FAFB' : '#111827') }}>Other…</Text>
                          </TouchableOpacity>
                          {showOtherReasonInput && (
                            <View style={{ marginTop: 4, gap: 6 }}>
                              <TextInput
                                value={otherReasonText}
                                onChangeText={setOtherReasonText}
                                placeholder="Describe the reason…"
                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                returnKeyType="done"
                                maxLength={80}
                                autoFocus
                                style={{ borderWidth: 1, borderColor: isDark ? '#374151' : '#D1D5DB', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: isDark ? '#F9FAFB' : '#111827', backgroundColor: isDark ? '#111827' : '#FFFFFF' }}
                              />
                              <TouchableOpacity
                                onPress={async () => {
                                  const trimmed = otherReasonText.trim();
                                  if (!trimmed) return;
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  const reloadMeds = loadMedications;
                                  const currentMeds = await reloadMeds();
                                  const today = new Date().toISOString().split('T')[0];
                                  const doseLog = createDoseLog(today, scheduledTime, 'missed', trimmed);
                                  const updatedMeds = await logDose(currentMeds, (med as any).id, doseLog);
                                  setMedications(updatedMeds);
                                  setMissedReasonId(null);
                                  setPendingMissedDose(null);
                                  setShowOtherReasonInput(false);
                                  setOtherReasonText('');
                                  dismissReminder(remId, 'medication' as any, `Missed ${med.name}: ${trimmed}`);
                                }}
                                style={{ paddingVertical: 7, borderRadius: 7, backgroundColor: isDark ? '#1D4ED840' : '#DBEAFE', alignItems: 'center', opacity: otherReasonText.trim().length === 0 ? 0.4 : 1 }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#93C5FD' : '#1D4ED8' }}>{ds.apptConfirm}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          <TouchableOpacity onPress={() => { setMissedReasonId(null); setPendingMissedDose(null); setShowOtherReasonInput(false); setOtherReasonText(''); }} style={{ marginTop: 2, alignItems: 'center' }}>
                            <Text style={{ fontSize: 11, color: colors.muted }}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {/* Reschedule */}
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setRescheduleInputValue(scheduledTime ?? '');
                          setRescheduleInputId(rescheduleInputId === remId ? null : remId);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D9770640' : '#FDE68A', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>{ds.doseRescheduleBtn}</Text>
                      </TouchableOpacity>
                      {rescheduleInputId === remId && (
                        <View style={{ marginTop: 6 }}>
                          {Platform.OS === 'ios' ? (
                            /* iOS: native spinner time picker */
                            <View>
                              <DateTimePicker
                                value={(() => {
                                  const [hIos, mIos] = (rescheduleInputValue || scheduledTime || '00:00').split(':').map(Number);
                                  const d = new Date(); d.setHours(isNaN(hIos) ? 0 : hIos, isNaN(mIos) ? 0 : mIos, 0, 0); return d;
                                })()}
                                mode="time"
                                display="spinner"
                                themeVariant={isDark ? 'dark' : 'light'}
                                onChange={(_evt: any, date?: Date) => {
                                  if (date) {
                                    const h = String(date.getHours()).padStart(2, '0');
                                    const m = String(date.getMinutes()).padStart(2, '0');
                                    setRescheduleInputValue(`${h}:${m}`);
                                  }
                                }}
                                style={{ height: 120 }}
                              />
                              <TouchableOpacity
                                onPress={async () => {
                                  const fmt = rescheduleInputValue || scheduledTime || '00:00';
                                  const reloadMeds2 = loadMedications;
                                  const currentMeds2 = await reloadMeds2();
                                  const updatedMeds2 = await logRescheduleEvent(currentMeds2, (med as any).id, scheduledTime, fmt, 'user reschedule');
                                  setMedications(updatedMeds2);
                                  setRescheduleInputId(null);
                                  dismissReminder(remId, 'medication' as any, `Rescheduled ${med.name}`);
                                  // Show confirmation toast
                                  const [fmtH, fmtM] = fmt.split(':').map(Number);
                                  const fmtDate = new Date(); fmtDate.setHours(fmtH, fmtM, 0, 0);
                                  const fmtLabel = fmtDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                  showRescheduleToast(`Rescheduled to ${fmtLabel}`);
                                }}
                                style={{ marginTop: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: isDark ? '#D9770640' : '#FDE68A', alignItems: 'center' }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FCD34D' : '#92400E' }}>{h.confirmReschedule}</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            /* Android / Web: text input fallback */
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <TextInput
                                value={rescheduleInputValue}
                                onChangeText={setRescheduleInputValue}
                                placeholder="HH:MM"
                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                keyboardType="numbers-and-punctuation"
                                returnKeyType="done"
                                maxLength={5}
                                style={{ flex: 1, borderWidth: 1, borderColor: isDark ? '#374151' : '#D1D5DB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, color: isDark ? '#F9FAFB' : '#111827', backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }}
                                onSubmitEditing={async () => {
                                  const match = rescheduleInputValue.trim().match(/^(\d{1,2}):(\d{2})$/);
                                  if (!match) { Alert.alert('Invalid time', 'Please enter time as HH:MM'); return; }
                                  const hh2 = parseInt(match[1], 10); const mm2 = parseInt(match[2], 10);
                                  if (hh2 > 23 || mm2 > 59) { Alert.alert('Invalid time', 'Hours 0-23, minutes 0-59'); return; }
                                  const fmt = `${String(hh2).padStart(2, '0')}:${String(mm2).padStart(2, '0')}`;
                                  const reloadMeds2 = loadMedications;
                                  const currentMeds2 = await reloadMeds2();
                                  const updatedMeds2 = await logRescheduleEvent(currentMeds2, (med as any).id, scheduledTime, fmt, 'user reschedule');
                                  setMedications(updatedMeds2);
                                  setRescheduleInputId(null);
                                  dismissReminder(remId, 'medication' as any, `Rescheduled ${med.name}`);
                                  const fmtDateSub = new Date(); fmtDateSub.setHours(hh2, mm2, 0, 0);
                                  showRescheduleToast(`Rescheduled to ${fmtDateSub.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
                                }}
                              />
                              <TouchableOpacity
                                onPress={async () => {
                                  const match = rescheduleInputValue.trim().match(/^(\d{1,2}):(\d{2})$/);
                                  if (!match) { Alert.alert('Invalid time', 'Please enter time as HH:MM'); return; }
                                  const hh2 = parseInt(match[1], 10); const mm2 = parseInt(match[2], 10);
                                  if (hh2 > 23 || mm2 > 59) { Alert.alert('Invalid time', 'Hours 0-23, minutes 0-59'); return; }
                                  const fmt = `${String(hh2).padStart(2, '0')}:${String(mm2).padStart(2, '0')}`;
                                  const reloadMeds2 = loadMedications;
                                  const currentMeds2 = await reloadMeds2();
                                  const updatedMeds2 = await logRescheduleEvent(currentMeds2, (med as any).id, scheduledTime, fmt, 'user reschedule');
                                  setMedications(updatedMeds2);
                                  setRescheduleInputId(null);
                                  dismissReminder(remId, 'medication' as any, `Rescheduled ${med.name}`);
                                  const fmtDateBtn = new Date(); fmtDateBtn.setHours(hh2, mm2, 0, 0);
                                  showRescheduleToast(`Rescheduled to ${fmtDateBtn.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
                                }}
                                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: isDark ? '#D9770640' : '#FDE68A' }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#FCD34D' : '#92400E' }}>Save</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* ── Refill-date reminder cards (refillReminderDate within 7 days) ── */}
              {showMedReminders && refillDueMeds.slice(0, 3).map(med => {
                const remId = `med-refill-date-${med.id}`;
                if (dismissedReminderIds.has(remId) || isSnoozed(remId)) return null;
                const dueMs = new Date(med.refillReminderDate!).getTime();
                const daysLeft = Math.ceil((dueMs - now) / (24 * 3600_000));
                const daysLabel = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
                return (
                  <View
                    key={remId}
                    style={{
                      backgroundColor: isDark ? '#1C0A00' : '#FFF7ED',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#EA580C40' : '#FED7AA',
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => router.push('/(tabs)/medications' as any)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <Text style={{ fontSize: 20 }}>⚠️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#FB923C' : '#9A3412' }}>
                          {ds.refillDueLabel.replace('{when}', daysLabel).replace('{name}', med.name)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          {ds.refillDueSub.replace('{date}', safeFormatDate(med.refillReminderDate!, [], { weekday: 'short', month: 'short', day: 'numeric' }))}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#EA580C25' : '#FFEDD5' }}>
                        <Text style={{ fontSize: 11, color: isDark ? '#FB923C' : '#C2410C', fontWeight: '700' }}>{daysLeft}d</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => router.push('/(tabs)/medications' as any)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#EA580C25' : '#FFEDD5', borderWidth: 1, borderColor: isDark ? '#EA580C60' : '#FED7AA', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#FB923C' : '#C2410C', fontWeight: '700' }}>💊 View Meds</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => snoozeReminderFor(remId, 60 * 60 * 1000)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D9770640' : '#FDE68A', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>1h</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => snoozeReminderFor(remId, 3 * 60 * 60 * 1000)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D9770640' : '#FDE68A', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>3h</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(8, 0, 0, 0);
                          snoozeReminderFor(remId, tomorrow.getTime() - Date.now());
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D9770640' : '#FDE68A', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>{ds.apptDateTomorrow ?? 'Tomorrow'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dismissReminder(remId, 'medication' as any, `Refill ${med.name}`)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#16A34A30' : '#DCFCE7', borderWidth: 1, borderColor: isDark ? '#16A34A60' : '#BBF7D0', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>{ds.bpDone ?? 'Done ✓'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* ── Low-stock refill reminder cards ── */}
              {showMedReminders && lowStockMeds.slice(0, 3).map(med => {
                const remId = `med-refill-${med.id}`;
                if (dismissedReminderIds.has(remId) || isSnoozed(remId)) return null;
                const qty = med.quantity ?? 0;
                const threshold = med.refillAt ?? 7;
                const supplyPct = threshold > 0 ? Math.min(Math.round((qty / threshold) * 100), 100) : 0;
                const urgency = qty <= 2 ? 'critical' : qty <= Math.floor(threshold / 2) ? 'urgent' : 'low';
                const urgencyColor = urgency === 'critical' ? (isDark ? '#F87171' : '#DC2626') : urgency === 'urgent' ? (isDark ? '#FB923C' : '#EA580C') : (isDark ? '#FBBF24' : '#D97706');
                const urgencyBg = urgency === 'critical' ? (isDark ? '#450A0A' : '#FFF1F2') : urgency === 'urgent' ? (isDark ? '#431407' : '#FFF7ED') : (isDark ? '#451A03' : '#FFFBEB');
                const urgencyBorder = urgency === 'critical' ? (isDark ? '#EF444440' : '#FECDD3') : urgency === 'urgent' ? (isDark ? '#EA580C40' : '#FED7AA') : (isDark ? '#D9770640' : '#FDE68A');
                const urgencyLabel = urgency === 'critical' ? '🔴 Critical' : urgency === 'urgent' ? '🟠 Low Supply' : '🟡 Refill Soon';
                return (
                  <View
                    key={remId}
                    style={{
                      backgroundColor: urgencyBg,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: urgencyBorder,
                    }}
                  >
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Text style={{ fontSize: 20 }}>💊</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: urgencyColor }}>
                          {urgencyLabel}: {med.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          {ds.refillDoseRemaining.replace('{qty}', String(qty)).replace('{unit}', qty === 1 ? 'dose' : 'doses').replace('{threshold}', String(threshold))}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: urgency === 'critical' ? (isDark ? '#EF444425' : '#FEE2E2') : (isDark ? '#EA580C25' : '#FFEDD5') }}>
                        <Text style={{ fontSize: 11, color: urgencyColor, fontWeight: '700' }}>{ds.refillDaysLeft.replace('{qty}', String(qty))}</Text>
                      </View>
                    </View>
                    {/* Supply level bar */}
                    <View style={{ marginBottom: 10 }}>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                        <View style={{ height: 5, borderRadius: 3, backgroundColor: urgencyColor, width: `${supplyPct}%` as any }} />
                      </View>
                      <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>
                        {ds.refillSupplyPct.replace('{pct}', String(supplyPct))}
                      </Text>
                    </View>
                    {/* Pharmacy contact row */}
                    {(med.pharmacyName || med.pharmacyPhone || med.pharmacyAddress) && (() => {
                      const storeEntry = med.pharmacyName ? pharmacyMap[med.pharmacyName.toLowerCase().trim()] : undefined;
                      const address = med.pharmacyAddress || storeEntry?.address;
                      const pharmacyLabel = med.pharmacyName || 'Pharmacy';
                      const todayHours = storeEntry?.hours ? getOpenTodayHours(storeEntry.hours) : undefined;
                      const isClosedToday = todayHours?.toLowerCase() === 'closed';
                      return (
                        <View style={{ marginBottom: 8, backgroundColor: isDark ? '#0F172A50' : '#FFFFFF80', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}>
                          {/* Pharmacy name + hours + map button row */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 10, color: colors.muted, flex: 1 }} numberOfLines={1}>
                              🏥 {pharmacyLabel}
                            </Text>
                            {todayHours && (
                              <View style={{ backgroundColor: isClosedToday ? (isDark ? '#450A0A40' : '#FEE2E2') : (isDark ? '#14532D40' : '#DCFCE7'), borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: isClosedToday ? (isDark ? '#EF444440' : '#FCA5A5') : (isDark ? '#16A34A40' : '#86EFAC') }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: isClosedToday ? (isDark ? '#F87171' : '#DC2626') : (isDark ? '#4ADE80' : '#15803D') }}>
                                  {isClosedToday ? ds.refillClosedToday : ds.refillOpenHours.replace('{hours}', todayHours ?? '')}
                                </Text>
                              </View>
                            )}
                            {/* Map button — right side of pharmacy row */}
                            {address ? (
                              <TouchableOpacity
                                onPress={async () => {
                                  const encoded = encodeURIComponent(address);
                                  const appleUrl = `maps://?q=${encoded}`;
                                  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
                                  if (Platform.OS === 'ios') {
                                    Linking.canOpenURL(appleUrl).then(ok => {
                                      Linking.openURL(ok ? appleUrl : googleUrl);
                                    }).catch(() => Linking.openURL(googleUrl));
                                  } else {
                                    const geoUrl = `geo:0,0?q=${encoded}`;
                                    Linking.canOpenURL(geoUrl).then(ok => {
                                      Linking.openURL(ok ? geoUrl : googleUrl);
                                    }).catch(() => Linking.openURL(googleUrl));
                                  }
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  // Auto-log refill request date on this medication
                                  try {
                                    const reloadMeds4 = loadMedications;
                                    const currentMeds4 = await reloadMeds4();
                                    const today4 = new Date().toISOString().split('T')[0];
                                    const updatedMeds4 = await (updateMedication as any)(currentMeds4, (med as any).id, { refillRequestedDate: today4 });
                                    setMedications(updatedMeds4);
                                  } catch (_unused) {}
                                }}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isDark ? '#1A3A2A' : '#F0FDF4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: isDark ? '#16A34A40' : '#BBF7D0' }}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Text style={{ fontSize: 11 }}>🗺️</Text>
                                <Text style={{ fontSize: 10, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>{ds.mapsBtn}</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                    {/* Pharmacy name label above action buttons — shown when no full pharmacy contact row above */}
                    {!(med.pharmacyName || med.pharmacyPhone || med.pharmacyAddress) && (() => {
                      const pharmPhone2 = (med as any).pharmacyPhone || (pharmacyMap[(med as any).pharmacyName] as any)?.phone;
                      if (!pharmPhone2) return null;
                      const pharmLabel2 = (med as any).pharmacyName || 'Pharmacy';
                      return (
                        <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 6 }} numberOfLines={1}>
                          📍 {pharmLabel2}
                        </Text>
                      );
                    })()}
                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {/* Call to Refill — only shown when pharmacy phone is available */}
                      {(() => {
                        const pharmPhone = (med as any).pharmacyPhone || (pharmacyMap[(med as any).pharmacyName] as any)?.phone;
                        if (!pharmPhone) return null;
                        const wasCalled = calledRefillIds.has((med as any).id);
                        return (
                          <TouchableOpacity
                            onPress={async () => {
                              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              Linking.openURL(`tel:${pharmPhone.replace(/\D/g, '')}`);
                              // Show "✓ Called" for 2 seconds
                              setCalledRefillIds(prev => new Set([...prev, (med as any).id]));
                              setTimeout(() => {
                                setCalledRefillIds(prev => { const next = new Set(prev); next.delete((med as any).id); return next; });
                              }, 2000);
                              // Auto-log the refill request date on the medication
                              try {
                                const reloadMeds3 = loadMedications;
                                const currentMeds3 = await reloadMeds3();
                                const today3 = new Date().toISOString().split('T')[0];
                                const updatedMeds3 = await (updateMedication as any)(currentMeds3, (med as any).id, { refillRequestedDate: today3 });
                                setMedications(updatedMeds3);
                              } catch (_unused) {}
                            }}
                            style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: wasCalled ? (isDark ? '#14532D' : '#DCFCE7') : (isDark ? '#1A3A2A' : '#F0FDF4'), borderWidth: 1, borderColor: wasCalled ? (isDark ? '#16A34A80' : '#86EFAC') : (isDark ? '#16A34A40' : '#BBF7D0'), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          >
                            <Text style={{ fontSize: 11 }}>{wasCalled ? '✓' : '📞'}</Text>
                            <Text style={{ fontSize: 11, color: wasCalled ? (isDark ? '#4ADE80' : '#15803D') : (isDark ? '#4ADE80' : '#166534'), fontWeight: '700' }}>{wasCalled ? ds.refillCalledBtn : ds.refillCallBtn}</Text>
                          </TouchableOpacity>
                        );
                      })()}
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push('/(tabs)/medications' as any);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: urgency === 'critical' ? (isDark ? '#450A0A40' : '#FEE2E2') : (isDark ? '#431407' + '40' : '#FFEDD5'), borderWidth: 1, borderColor: urgencyBorder, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11 }}>💊</Text>
                        <Text style={{ fontSize: 11, color: urgencyColor, fontWeight: '700' }}>{h.updateSupply}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => snoozeReminder(remId)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{ds.refillSnooze1h}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dismissReminder(remId, 'medication' as any, `Refill ${med.name}`)}
                        style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{h.dismiss}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* ── Skipped dose cards (can reinstate) ── */}
              {showMedReminders && skippedDoses.slice(0, 3).map(({ med, scheduledTime, logId }) => {
                const remId = `med-skipped-${med.id}-${scheduledTime}`;
                if (dismissedReminderIds.has(remId) || isSnoozed(remId)) return null;
                const [hh, mm] = scheduledTime.split(':').map(Number);
                const timeLabel = safeFormatTime(new Date().setHours(hh, mm, 0, 0), [], { hour: '2-digit', minute: '2-digit' });
                return (
                  <View
                    key={remId}
                    style={{
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#64748B40' : '#CBD5E1',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>⏭️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#94A3B8' : '#475569' }}>
                          Skipped: {med.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          {timeLabel} dose skipped · Tap to reinstate
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#64748B25' : '#F1F5F9' }}>
                        <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', fontWeight: '700' }}>Skipped</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={async () => {
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          const reloadMeds = loadMedications;
                          const currentMeds2 = await reloadMeds();
                          const updatedMeds2 = await reinstateDose(currentMeds2, (med as any).id, logId, new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
                          setMedications(updatedMeds2);
                          dismissReminder(remId, 'medication' as any, `Reinstated ${med.name}`);
                        }}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#14532D40' : '#DCFCE7', borderWidth: 1, borderColor: isDark ? '#16A34A60' : '#BBF7D0', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>↺ Reinstate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dismissReminder(remId, 'medication' as any, `Skipped ${med.name}`)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#1C1030' : '#F5F3FF', borderWidth: 1, borderColor: isDark ? '#7C3AED40' : '#DDD6FE', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#A78BFA' : '#6D28D9', fontWeight: '700' }}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* ── Missed-dose streak warnings (≥3 consecutive missed doses) ── */}
              {medications.filter((m: any) => {
                if (m.active === false) return false;
                // Count consecutive missed doses across last 7 days
                const today = new Date();
                let consecutive = 0;
                for (let d = 0; d < 7; d++) {
                  const date = new Date(today);
                  date.setDate(today.getDate() - d);
                  const dateKey = date.toISOString().split('T')[0];
                  const dayLogs = ((m as any).doseLogs ?? []).filter((l: any) => l.date === dateKey);
                  const hasMissed = dayLogs.some((l: any) => l.status === 'missed');
                  const hasTaken = dayLogs.some((l: any) => l.status === 'taken');
                  if (hasMissed && !hasTaken) consecutive++;
                  else if (hasTaken) break; // streak broken
                  else if (d > 0) break; // no log at all on a past day — stop
                }
                return consecutive >= 3;
              }).map(med => {
                const streakId = `adherence-streak-${med.id}`;
                if (dismissedReminderIds.has(streakId)) return null;
                const today = new Date();
                let consecutive = 0;
                for (let d = 0; d < 7; d++) {
                  const date = new Date(today);
                  date.setDate(today.getDate() - d);
                  const dateKey = date.toISOString().split('T')[0];
                  const dayLogs = ((med as any).doseLogs ?? []).filter((l: any) => l.date === dateKey);
                  const hasMissed = dayLogs.some((l: any) => l.status === 'missed');
                  const hasTaken = dayLogs.some((l: any) => l.status === 'taken');
                  if (hasMissed && !hasTaken) consecutive++;
                  else if (hasTaken) break;
                  else if (d > 0) break;
                }
                return (
                  <View
                    key={streakId}
                    style={{
                      backgroundColor: isDark ? '#1A0A0A' : '#FFF1F2',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1.5,
                      borderColor: isDark ? '#EF444440' : '#FECDD3',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>⚠️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FCA5A5' : '#9F1239' }}>{ds.adherenceConcern.replace('{name}', med.name)}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{ds.adherenceConcernBody.replace('{count}', String(consecutive))}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => router.push('/(tabs)/medications' as any)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#450A0A40' : '#FEE2E2', borderWidth: 1, borderColor: isDark ? '#EF444460' : '#FECACA', alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: isDark ? '#F87171' : '#DC2626', fontWeight: '700' }}>{h.viewMedication}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dismissReminder(streakId, 'medication' as any, `Adherence concern ${med.name}`)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: isDark ? '#1E2022' : '#F5F5F5', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{h.dismiss}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* ── See all medications footer link ── */}
              {medications.filter((m: any) => m.active !== false).length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({ pathname: '/(tabs)/medications', params: { filter: 'today' } } as any);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingVertical: 4,
                    paddingHorizontal: 2,
                    marginBottom: 4,
                    gap: 4,
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                >
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>{ds.seeAllMedicationsToday}</Text>
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>→</Text>
                </TouchableOpacity>
              )}
              {showBSReminder && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push('/log/blood-sugar' as any)}
                  style={{
                    backgroundColor: isDark ? '#1A1A2E' : '#FFF1F2',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderWidth: 1,
                    borderColor: isDark ? '#E11D4840' : '#FECDD3',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🩸</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#FB7185' : '#9F1239' }}>{ds.checkBloodSugar}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{ds.glucoseNotLoggedToday} · {ds.tapToLogGlucose}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {/* 30-min window chip */}
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#E11D4825' : '#FFF1F2' }}>
                      <Text style={{ fontSize: 11, color: isDark ? '#FB7185' : '#9F1239', fontWeight: '700' }}>⏱ 30m</Text>
                    </View>
                    {/* Done button */}
                    <TouchableOpacity
                      onPress={() => dismissReminder(bsReminderId, 'blood_sugar', 'Blood Sugar Check')}
                      onLongPress={() => snoozeCategory([bsReminderId])}
                      delayLongPress={500}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDark ? '#16A34A30' : '#DCFCE7', borderWidth: 1, borderColor: isDark ? '#16A34A60' : '#BBF7D0' }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700' }}>{ds.bpDone ?? 'Done ✓'}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )}
              {/* Glucose empty state — shown when no glucose has ever been logged (not just today) */}
              {!isLoading && data && (data.bloodSugar ?? []).length === 0 && (
                <GlucoseEmptyState
                  variant="dashboard"
                  onLog={() => router.push('/log/blood-sugar' as any)}
                  onSync={forceSync}
                />  
              )}

              {/* ── Glucose Smart Reminder — shown during 30-min windows at user's chosen mode slots */}
              {showGlucoseSmartReminder && (
                <SwipeableBanner
                  onDismiss={() => dismissReminder(glucoseSmartReminderId, 'blood_sugar', 'Evening Glucose Check')}
                  onSnoozeRequest={() => setSnoozeSheetVisible(true)}
                  snoozeLabel="Snooze"
                  dismissLabel="Dismiss"
                >
                <View
                  style={{
                    backgroundColor: isDark ? '#1C1020' : '#FFF7ED',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: isDark ? '#DC262640' : '#FED7AA',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 20 }}>📊</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FB923C' : '#9A3412' }}>
                          {glucoseReminderMode === 'ac' ? (ds.preMealGlucoseCheck ?? 'Pre-Meal Glucose Check')
                            : glucoseReminderMode === 'pc' ? (ds.postMealGlucoseCheck ?? 'Post-Meal Glucose Check')
                            : glucoseReminderMode === 'hs' ? (ds.bedtimeGlucoseCheck ?? 'Bedtime Glucose Check')
                            : glucoseReminderMode === '6h' ? (ds.glucoseCheck ?? 'Glucose Check')
                            : (ds.glucoseReminder ?? 'Glucose Reminder')}
                        </Text>
                        {/* Countdown chip — minutes remaining in the current slot window */}
                        {glucoseACCountdown !== null && (
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: isDark ? '#E11D4825' : '#FFF1F2', borderWidth: 1, borderColor: isDark ? '#FB923C40' : '#FECACA' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#FB923C' : '#9F1239' }}>⏱ {glucoseACCountdown}m left</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {glucoseLastLoggedLabel} · {glucoseReminderMode === 'ac' ? (ds.logBeforeMeal ?? 'Log before your meal') : glucoseReminderMode === 'pc' ? (ds.logAfterMeal ?? 'Log 1–2h after your meal') : glucoseReminderMode === 'hs' ? (ds.logBeforeBed ?? 'Log before bed') : (ds.timeToLogGlucose ?? 'Time to log your glucose')}
                      </Text>
                    </View>
                    {/* Dismiss × button */}
                    <TouchableOpacity
                      onPress={() => dismissReminder(glucoseSmartReminderId, 'blood_sugar', 'Evening Glucose Check')}
                      style={{ padding: 6 }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={{ fontSize: 14, color: colors.muted }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Action chips */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() => router.push('/log/blood-sugar' as any)}
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: isDark ? '#DC262630' : '#FEE2E2',
                        borderWidth: 1,
                        borderColor: isDark ? '#DC262660' : '#FECACA',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#FB923C' : '#9A3412' }}>{ds.logGlucoseBtn ?? 'Log glucose →'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => dismissReminder(glucoseSmartReminderId, 'blood_sugar', 'Evening Glucose Check')}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: isDark ? '#FFFFFF10' : '#F3F4F6',
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{ds.dismissBtn ?? 'Dismiss'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                </SwipeableBanner>
              )}
              {/* Snooze badge chip — shown when glucose reminder is snoozed (live countdown via glucoseLiveMinsLeft) */}
              {showGlucoseSnoozeBadge && glucoseLiveMinsLeft > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isDark ? '#92400E20' : '#FEF3C7',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: isDark ? '#F59E0B40' : '#FDE68A',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14 }}>⏸</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FBBF24' : '#92400E' }}>
                      {(ds.snoozedRemaining ?? 'Snoozed · {time} remaining').replace('{time}', glucoseLiveMinsLeft < 60 ? `${glucoseLiveMinsLeft}m` : `${Math.floor(glucoseLiveMinsLeft / 60)}h${glucoseLiveMinsLeft % 60 > 0 ? ` ${glucoseLiveMinsLeft % 60}m` : ''}`)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => dismissReminder(glucoseSmartReminderId, 'blood_sugar', 'Evening Glucose Check')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: isDark ? '#FBBF24' : '#92400E', fontWeight: '700' }}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}

        {/* ─── Upcoming Vaccine Card ─────────────────────────────────────────────── */}
        {(() => {
          const now = Date.now();
          const immunizations = data?.immunizations ?? [];
          // Find the soonest upcoming next dose
          const upcoming = immunizations
            .filter(r => r.nextDoseDate)
            .map(r => ({ ...r, nextDoseMs: new Date(r.nextDoseDate!).getTime() }))
            .filter(r => r.nextDoseMs > now)
            .sort((a, b) => a.nextDoseMs - b.nextDoseMs)[0];
          if (!upcoming) return null;
          const daysLeft = Math.ceil((upcoming.nextDoseMs - now) / (24 * 3600_000));
          const urgentColor = daysLeft <= 1 ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#22C55E';
          const urgentBg = daysLeft <= 1 ? 'rgba(239,68,68,0.1)' : daysLeft <= 7 ? 'rgba(245,158,11,0.1)' : 'rgba(13,148,136,0.1)';
          const doseLabel = upcoming.doseNumber
            ? ` · Dose ${upcoming.doseNumber}${upcoming.seriesTotal ? `/${upcoming.seriesTotal}` : ''}`
            : '';
          return (
<TouchableOpacity
              onPress={() => router.push('/log/immunizations' as any)}
              style={[
                styles.vaccineCard,
                { backgroundColor: colors.surface, borderColor: urgentColor + '40' },
              ]}
              activeOpacity={0.8}
            >
              <View style={[styles.vaccineIcon, { backgroundColor: urgentBg }]}>
                <Text style={{ fontSize: 20 }}>💉</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: urgentColor, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 }}>
                  {daysLeft === 0 ? 'Due Today' : daysLeft === 1 ? 'Due Tomorrow' : `Due in ${daysLeft} days`}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }} numberOfLines={1}>
                  {upcoming.vaccineName}{doseLabel}
                </Text>
                {upcoming.nextDoseDate && (
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
                    {safeFormatDate(upcoming.nextDoseDate, [], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                )}
              </View>
              {/* Mark as Received button */}
              <TouchableOpacity
                onPress={async () => {
                  Alert.alert(
                    'Mark as Received',
                    `Log ${upcoming.vaccineName} as administered today?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Confirm',
                        onPress: async () => {
                          const today = new Date().toISOString().split('T')[0];
                          await updateImmunization({
                            ...upcoming,
                            dateAdministered: today,
                            nextDoseDate: undefined,
                          });
                          if (Platform.OS !== 'web') {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          }
                        },
                      },
                    ],
                  );
                }}
                style={[styles.vaccineMarkBtn, { backgroundColor: urgentColor + '20', borderColor: urgentColor + '60' }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: urgentColor }}>✓ Received</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })()}

        {/* ─── NeoVital Mini Graph Card (compact waveform, taps to full NeoVital screen) ─── */}
        {/* Drag-to-reorder: edit layout banner shown when editLayoutMode is active */}
        {editLayoutMode && (
          <View>
            <View style={[styles.editLayoutBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
              <Text style={[styles.editLayoutText, { color: colors.primary }]}>
                {editLayoutResetConfirm ? '✓ Order reset to default' : '✦ Edit Layout — use ↑↓ to reorder'}
              </Text>
              <TouchableOpacity
                onPress={() => { if (editLayoutTimerRef.current) clearTimeout(editLayoutTimerRef.current); setEditLayoutMode(false); router.push('/settings/manage-dashboard' as any); }}
                style={[styles.editLayoutDoneBtn, { backgroundColor: '#8B5CF620', borderColor: '#8B5CF650', marginRight: 6 }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Manage all dashboard sections"
                accessibilityRole="button"
              >
                <Text style={[styles.editLayoutDoneText, { color: '#8B5CF6' }]}>Manage</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleResetCardOrder}
                style={[styles.editLayoutDoneBtn, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '50', marginRight: 6 }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Reset card order to default"
                accessibilityRole="button"
              >
                <Text style={[styles.editLayoutDoneText, { color: colors.warning }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (editLayoutTimerRef.current) clearTimeout(editLayoutTimerRef.current); setEditLayoutMode(false); }}
                style={[styles.editLayoutDoneBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '50' }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Done editing layout"
                accessibilityRole="button"
              >
                <Text style={[styles.editLayoutDoneText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}


        {/* ─── NeoVital Monitor (Vital Monitor graph) ─────────────────────── */}
        {isSectionVisible('vitals_mini') && (
          <NeoVitalMiniCard />
        )}

        {/* ─── Date Range Filter ────────────────────────────────────────────── */}
        <View style={styles.rangeFilterRow}>
          {/* Title (left) + kcal badge (right) on the same row */}
          {weeklyCalAvg != null && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 }}>
              <View style={[styles.calBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                <Text style={[styles.calBadgeText, { color: colors.primary }]} numberOfLines={1}>
                  {l.weeklyCalAvgLabel(weeklyCalAvg)}
                </Text>
              </View>
            </View>
          )}
          {/* Segment control — full width below the title */}
          <SegmentedControl
            options={DATE_RANGE_OPTIONS}
            value={dateRange}
            onChange={handleDateRangeChange}
          />
        </View>
                {/* ─── Bento-Box Metric Grid ───────────────────────────────────────────── */}
        {isSectionVisible('vitals_section') && (
        <>
        <View style={styles.bentoGrid}>
          <View style={styles.bentoRow}>
            <BentoMetricTile
              title={ds.bloodPressure}
              icon="drop.fill"
              accentColor={colors.bpGreen}
              primaryValue={
                averages.systolicAvg !== null && averages.diastolicAvg !== null
                  ? `${averages.systolicAvg}/${averages.diastolicAvg}`
                  : latestBP ? `${latestBP.systolic ?? '--'}/${latestBP.diastolic ?? '--'}` : '—'
              }
              primaryUnit="mmHg"
              secondaryLabel={averages.bpReadings > 0 ? `${averages.bpReadings} ${h.readings}` : undefined}
              secondaryValue={averages.bpReadings > 0 ? `avg ${dateRange}d` : undefined}
              status={bpStatusToMetricStatus(bpStatus)}
              sparklineData={bpSparkline}
              sparklineSecondaryData={bpDiastolicSparkline}
              higherIsBetter={false}
              headerWaveformData={[bpSparkline, bpDiastolicSparkline]}
              isLoading={isLoading || isFirstSync}
              lastSyncedAt={bpLastSyncedAt}
              showLiveDot={bpIsLive}
              showLastRecorded
              onSyncPress={forceSync}
              staleThresholdHours={staleThresholdHours}
              onPress={() => navigate('/detail/blood-pressure')}
              onLongPress={() => openActionSheet(
                'blood-pressure',
                'Blood Pressure',
                latestBP ? `${latestBP.systolic ?? '--'}/${latestBP.diastolic ?? '--'} mmHg` : '—'
              )}
            />
            <BentoMetricTile
              title={ds.pulseHrv}
              icon="heart.fill"
              accentColor={colors.heartRed}
              primaryValue={averages.bpmAvg !== null ? String(averages.bpmAvg) : latestPulse ? String(latestPulse.bpm) : '—'}
              primaryUnit="bpm"
              secondaryLabel={h.hrvAvg}
              secondaryValue={
                averages.hrvAvg !== null
                  ? `${averages.hrvAvg} ms`
                  : latestPulse?.hrv ? `${latestPulse.hrv} ms` : undefined
              }
              tertiaryLabel={data?.restingHR != null ? 'Resting' : undefined}
              tertiaryValue={data?.restingHR != null ? `${data.restingHR} bpm` : undefined}
              tertiaryTrend={data?.restingHR != null ? restingHrTrend : undefined}
              status={hrToMetricStatus(averages.bpmAvg ?? (latestPulse?.bpm ?? null))}
              sparklineData={restingHrSparkline30d.length >= 3 ? restingHrSparkline30d : hrvSparkline}
              higherIsBetter={false}
              isLoading={isLoading}
              lastSyncedAt={pulseLastSyncedAt}
              onSyncPress={forceSync}
              staleThresholdHours={staleThresholdHours}
              showSineWaveform
              showLiveDot={hrIsLive}
              showLastRecorded
              onPress={() => navigate('/detail/pulse')}
              onLongPress={() => openActionSheet(
                'pulse',
                'Pulse & HRV',
                latestPulse ? `${latestPulse.bpm} bpm` : '\u2014'
              )}
            />
          </View>
         {/* Row 2: SpO2 + Sleep */}
          {isSectionVisible('sleep_section') && <View style={styles.bentoRow}>
            <BentoMetricTile
              title={ds.spo2}
              icon="lungs.fill"
              accentColor={colors.spo2Blue}
              primaryValue={
                averages.spo2Avg !== null
                  ? String(averages.spo2Avg)
                  : latestSpO2 !== null
                    ? String(latestSpO2)
                    : '—'
              }
              primaryUnit="%"
              secondaryLabel={averages.spo2Readings > 0 ? `${averages.spo2Readings} ${h.readings}` : undefined}
              status={spo2ToMetricStatus(averages.spo2Avg ?? latestSpO2)}
              sparklineData={spo2Sparkline}
              higherIsBetter={true}
              isLoading={isLoading}
              lastSyncedAt={spo2LastSyncedAt}
              onSyncPress={forceSync}
              staleThresholdHours={staleThresholdHours}
              showSineWaveform
              showLiveDot={spo2IsLive}
              showLastRecorded
              onPress={() => navigate('/detail/spo2')}
              onLongPress={() => openActionSheet(
                'spo2',
                'SpO\u2082',
                latestSpO2 !== null ? `${latestSpO2}%` : '—'
              )}
            />
            <BentoMetricTile
              title={ds.sleep}
              icon="moon.fill"
              accentColor={colors.sleepPurple}
              primaryValue={
                averages.sleepDurationAvg !== null
                  ? String(averages.sleepDurationAvg)
                  : sleepHours ?? '—'
              }
              primaryUnit="hrs"
              secondaryLabel={h.efficiencyAvg}
              secondaryValue={
                averages.sleepEfficiencyAvg !== null
                  ? `${averages.sleepEfficiencyAvg}%`
                  : latestSleep && latestSleep.efficiency > 0 ? `${latestSleep.efficiency}%` : undefined
              }
              status={sleepToMetricStatus(
                averages.sleepDurationAvg ?? (sleepHours ? parseFloat(sleepHours) : null)
              )}
              sparklineData={sleepSparkline}
              higherIsBetter={true}
              isLoading={isLoading}
              lastSyncedAt={sleepLastSyncedAt}
              showSleepWaveform
              showLiveDot={sleepIsLive}
              onSyncPress={forceSync}
              staleThresholdHours={staleThresholdHours}
              onPress={() => navigate('/detail/sleep')}
              onLongPress={() => openActionSheet(
                'sleep',
                'Sleep',
                latestSleep ? `${(latestSleep.totalMinutes / 60).toFixed(1)} hrs` : '—'
              )}
            />
                    </View>}
          {/* Row 3: EKG tile — full-width */}
          {isSectionVisible('ekg_section') && (
            <View style={styles.bentoRow}>
              <EKGDashboardCard />
            </View>
          )}
        </View>
        <>
                        {/* ─── Empty-state nudge: shown only when all four vital tiles have no data ─── */}
         {!isLoading && averages.bpReadings === 0 && averages.pulseReadings === 0 && averages.sleepReadings === 0 && averages.spo2Readings === 0 && !latestBP && !latestPulse && !latestSleep && latestSpO2 === null && (
           <GlassCard
             accentColor="#94A3B8"
             style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 8, alignItems: 'center', gap: 10 }}
           >
            <Text style={{ fontSize: 22 }}>📋</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground, textAlign: 'center' }}>
              {ds.noVitalsLogged}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18 }}>
              {ds.noVitalsLoggedSub}{Platform.OS === 'ios' ? ' Or tap Force Sync to pull from Apple Health.' : ''}
            </Text>
            {/* Quick-log row */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
              {[
                { label: ds.quickLogBP, route: '/log/vitals' },
                { label: ds.quickLogHR, route: '/log/vitals' },
                { label: ds.quickLogSleep, route: '/log/sleep' },
                { label: ds.quickLogSpo2, route: '/log/vitals' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.75}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 20,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
           </GlassCard>
          )}
         {/* ─── Today at a Glance Strip─────────────────────────────────────── */}
        {(() => {
          const sleepHrs = latestSleep ? (latestSleep.totalMinutes / 60).toFixed(1) : null;
          const sleepEff = latestSleep && latestSleep.efficiency > 0 ? latestSleep.efficiency : null;
          const calConsumed = (data?.sodiumIntake ?? []).filter((r: any) => (r.timestamp ?? r.date ?? '').slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((s: number, r: any) => s + (r.total_calories_kcal ?? r.calories_kcal ?? r.calories ?? 0), 0) || null;
          const calGoal = macroGoals.calories > 0 ? macroGoals.calories : null;
          const calBalance = (calConsumed != null && calGoal != null) ? calGoal - calConsumed : null;
          const steps = todaySteps;
          const stepGoalVal = stepGoal;
          const stepsColor = steps != null && steps >= stepGoalVal ? '#22C55E' : isDark ? '#93C5FD' : '#2563EB';
          const calColor = calBalance == null ? (isDark ? '#94A3B8' : '#64748B')
            : calBalance >= 0 ? (isDark ? '#4ADE80' : '#16A34A')
            : (isDark ? '#F87171' : '#DC2626');
          const sleepColor = sleepEff == null ? (isDark ? '#94A3B8' : '#64748B')
            : sleepEff >= 85 ? (isDark ? '#4ADE80' : '#16A34A')
            : sleepEff >= 70 ? (isDark ? '#FBBF24' : '#D97706')
            : (isDark ? '#F87171' : '#DC2626');
          return (
            <GlassCard accentColor="#6366F1" noPadding style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 4, shadowColor: isDark ? '#6366F1' : '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.35 : 0.18, shadowRadius: 14, elevation: 10, borderWidth: 1, borderTopColor: isDark ? 'rgba(165,180,252,0.25)' : 'rgba(99,102,241,0.22)', borderLeftColor: isDark ? 'rgba(165,180,252,0.12)' : 'rgba(99,102,241,0.12)', borderRightColor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.08)', borderBottomColor: isDark ? 'rgba(30,27,75,0.6)' : 'rgba(79,70,229,0.15)' }}>            
            <View style={{ flexDirection: 'row' }}>
              {/* Steps */}
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}
                onPress={() => navigate('/log/activity')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Steps today: ${steps ?? 0}`}
              >
                <Text style={{ fontSize: 18 }}>🦶</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: stepsColor, marginTop: 3 }}>
                  {steps != null
                    ? (steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : String(steps))
                    : hkSteps > 0
                      ? (hkSteps >= 1000 ? `${(hkSteps / 1000).toFixed(1)}k` : String(hkSteps))
                      : '—'}
                </Text>
                <Text style={{ fontSize: 10, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '500', marginTop: 1 }}>{ds.steps}</Text>
                {steps != null && stepGoalVal > 0 && (
                  <Text style={{ fontSize: 9, color: stepsColor, fontWeight: '600', marginTop: 1 }}>
                    {Math.round((steps / stepGoalVal) * 100)}{ds.stepsGoalPct ?? '% goal'}
                  </Text>
                )}
              </TouchableOpacity>
              {/* Divider */}
              <View style={{ width: 0.5, backgroundColor: isDark ? '#1E293B' : '#E2E8F0', marginVertical: 10 }} />
              {/* Calorie Balance */}
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}
                onPress={requireScanMealPremium(() => { setCameraInitialMode('home'); setCameraSheetVisible(true); }, { feature: fc.scanMealTitle ?? 'Scan a Meal' })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Calorie balance: ${calBalance != null ? calBalance : 'unknown'} kcal`}
              >
                <Text style={{ fontSize: 18 }}>🔥</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: calColor, marginTop: 3 }}>
                  {calBalance != null
                    ? (calBalance >= 0 ? `+${calBalance}` : String(calBalance))
                    : hkCalories != null
                      ? `${Math.round(hkCalories)} kcal`
                      : '—'}
                </Text>
                <Text style={{ fontSize: 10, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '500', marginTop: 1 }}>{ds.calLeft}</Text>
                {calConsumed != null && calGoal != null && (
                  <Text style={{ fontSize: 9, color: isDark ? '#64748B' : '#94A3B8', marginTop: 1 }}>
                    {calConsumed} / {calGoal}
                  </Text>
                )}
              </TouchableOpacity>
              {/* Divider */}
              <View style={{ width: 0.5, backgroundColor: isDark ? '#1E293B' : '#E2E8F0', marginVertical: 10 }} />
              {/* Sleep */}
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}
                onPress={() => navigate('/log/sleep')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Last sleep: ${sleepHrs ?? 'none'} hours`}
              >
                <Text style={{ fontSize: 18 }}>😴</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: sleepColor, marginTop: 3 }}>
                  {sleepHrs != null ? `${sleepHrs}h` : '—'}
                </Text>
                <Text style={{ fontSize: 10, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '500', marginTop: 1 }}>{ds.sleep}</Text>
                {sleepEff != null && (
                  <Text style={{ fontSize: 9, color: sleepColor, fontWeight: '600', marginTop: 1 }}>
                    {sleepEff}% {l.sleepEffLabel}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            </GlassCard>
          );
        })()}
        {/* ─── Readiness Breakdown Sheet ─── */}
        <ReadinessBreakdownSheet
          visible={breakdownVisible}
          onClose={() => setBreakdownVisible(false)}
          components={readiness}
        />


        {/* Render the four primary health cards in user-defined order */}
        {cardOrder.map((cardId, cardIdx) => {
          const cardContent = cardId === 'vitals' ? null : cardId === 'activity' ? (
            <ActivityReadinessCard
              collapsed={weatherCollapsed}
              onToggle={() => toggleSection('weather')}
              readinessScore={readiness.hasData ? readiness.total : 0}
              readinessLoading={isLoading || !readiness.hasData}
              readinessHasData={readiness.hasData}
              sleepHrs={averages.sleepDurationAvg ?? null}
              sleepEff={averages.sleepEfficiencyAvg}
              bpSystolic={averages.systolicAvg ?? (latestBP?.systolic ?? null)}
              onReadinessPress={() => setBreakdownVisible(true)}
              todaySteps={todaySteps}
              todayDistanceKm={todayDistanceKm}
              todayCalories={todayCalories}
              todayFiber={todayFiber}
              distanceUnits={distanceUnits}
              yesterdayReadinessScore={yesterdayReadinessScore}
              renderActivityRow={() => (
                (todaySteps == null && todayCalories == null) ? (
                  <TouchableOpacity
                    onPress={() => navigate('/log/activity')}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Log today's activity"
                  >
                    <Text style={{ fontSize: 22 }}>🏃</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>{ds.noActivityLogged}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{ds.tapToLog}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '700' }}>Log →</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    gap: 0,
                  }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '500', marginBottom: 2 }}>Today</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>
                        {safeFormatDate(Date.now(), 'en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <View style={{ width: 0.5, height: 36, backgroundColor: colors.border }} />
                    <StepRingCell
                      todaySteps={todaySteps}
                      stepGoal={stepGoal}
                      borderColor={colors.border}
                      ringRef={stepRingRef as React.RefObject<View>}
                      stepsLabel={ds.steps}
                      onLongPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setStepGoalSheetVisible(true);
                      }}
                    />
                    <View style={{ width: 0.5, height: 36, backgroundColor: colors.border }} />
                    <TouchableOpacity
                      style={{ flex: 1, alignItems: 'center' }}
                      onPress={handleToggleDistanceUnits}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Distance in ${distanceUnits}. Tap to toggle units.`}
                    >
                      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '500', marginBottom: 2 }}>Distance</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: todayDistanceKm ? '#6366F1' : colors.muted }}>
                        {todayDistanceKm != null
                          ? distanceUnits === 'km'
                            ? `${todayDistanceKm}`
                            : `${Math.round(todayDistanceKm * 0.621371 * 10) / 10}`
                          : '—'}
                      </Text>
                      <Text style={{ fontSize: 9, color: todayDistanceKm ? '#6366F1' : colors.muted, fontWeight: '600' }}>
                        {distanceUnits}
                      </Text>
                    </TouchableOpacity>
                    <View style={{ width: 0.5, height: 36, backgroundColor: colors.border }} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '500', marginBottom: 2 }}>{h.activeCal}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: todayCalories ? '#F59E0B' : colors.muted }}>
                        {todayCalories != null ? `${todayCalories}` : '—'}
                      </Text>
                      {todayCalories != null && (
                        <Text style={{ fontSize: 9, color: colors.muted }}>kcal</Text>
                      )}
                    </View>
                    <View style={{ width: 0.5, height: 36, backgroundColor: colors.border }} />
                    <FiberRingCell
                      todayFiber={todayFiber}
                      borderColor={colors.border}
                      onPress={requireScanMealPremium(() => { setCameraInitialMode('home'); setCameraSheetVisible(true); }, { feature: fc.scanMealTitle ?? 'Scan a Meal' })}
                      onLongPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setFiberGoalEditorValue(String(macroGoals.fiber ?? 25));
                        setFiberGoalEditorVisible(true);
                      }}
                    />
                  </View>
                )
              )}
            />
          ) : cardId === 'insights' ? null : (
            /* cardId === 'glucose' */
            <GlucoseDashboardCard />
          );
          // Show a dashed placeholder at the target slot while this card is being dragged
          const isBeingDragged = dragState?.isDragging && dragState.targetIndex === cardIdx;
          // Use the measured height of the active card for the placeholder (falls back to 220)
          const placeholderHeight = dragState?.activeCardIndex !== undefined
            ? (cardHeights.current[dragState.activeCardIndex] ?? 220)
            : 220;
          return (
            <React.Fragment key={cardId}>
            {isBeingDragged && <DragPlaceholder height={placeholderHeight} />}
            <DraggableCardWrapper
              index={cardIdx}
              totalCards={cardOrder.length}
              onMoveUp={() => handleMoveCardUp(cardId)}
              onMoveDown={() => handleMoveCardDown(cardId)}
              editMode={editLayoutMode}
              onLongPress={handleCardLongPress}
              onDragStateChange={setDragState}
              onHeightMeasured={(h) => { cardHeights.current[cardIdx] = h; }}
              cardHeight={220}
            >
              {cardContent}
              {/* Edit mode: ↑↓ accessibility buttons (complement to drag gesture) */}
              {editLayoutMode && (
                <View style={styles.cardReorderOverlay} pointerEvents="box-none">
                  {cardIdx > 0 && (
                    <TouchableOpacity
                      onPress={() => handleMoveCardUp(cardId)}
                      style={[styles.reorderArrowBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Move card up"
                      accessibilityRole="button"
                    >
                      <Text style={[styles.reorderArrowText, { color: colors.primary }]}>↑</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.reorderDragHandle}>
                    {[0,1,2,3,4,5].map(i => (
                      <View key={i} style={[styles.reorderDot, { backgroundColor: colors.primary }]} />
                    ))}
                  </View>
                  {cardIdx < cardOrder.length - 1 && (
                    <TouchableOpacity
                      onPress={() => handleMoveCardDown(cardId)}
                      style={[styles.reorderArrowBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Move card down"
                      accessibilityRole="button"
                    >
                      <Text style={[styles.reorderArrowText, { color: colors.primary }]}>↓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </DraggableCardWrapper>
            </React.Fragment>
          );
        })}

                {/* ═══════════════════════════════════════════════════════════════════
            PREMIUM DASHBOARD SECTIONS
            ═══════════════════════════════════════════════════════════════════ */}




        {/* Action Sheet (Android/Web) */}
        <VitalCardActionSheet
          visible={actionSheet.visible}
          vitalType={actionSheet.vitalType}
          vitalLabel={actionSheet.vitalLabel}
          latestValue={actionSheet.latestValue}
          onClose={() => setActionSheet((s) => ({ ...s, visible: false }))}
        />
        {/* CaloricBalanceMiniCard and WeeklyMacroTrendCard removed — caloric balance and
             macro trends are not primary outcomes in DASH or Mediterranean meta-analyzes.
             Evidence-based Tier 1 metrics (BP, Na:K, HbA1c, weight) are shown above. */}

        {/* ─── EBP Clinical Nutrition Cards ──────────────────────────────────────────────── */}
        {isSectionVisible('macro_trend') && (() => {
          const todayKey = new Date().toDateString();
          const todayMeals = (data?.sodiumIntake ?? []).filter(
            (r: any) => new Date(r.timestamp).toDateString() === todayKey
          );
          const carbsG   = todayMeals.reduce((s: number, r: any) => s + (r.carbsG   ?? 0), 0);
          const fiberG   = todayMeals.reduce((s: number, r: any) => s + (r.fiberG   ?? 0), 0);
          const proteinG = todayMeals.reduce((s: number, r: any) => s + (r.proteinG ?? 0), 0);
          const fatG     = todayMeals.reduce((s: number, r: any) => s + (r.fatG     ?? 0), 0);
          const caloriesKcal = todayMeals.reduce((s: number, r: any) => s + (r.calories ?? 0), 0);
          const allMeals = data?.sodiumIntake ?? [];
          const buildWindowAvg = (nDays: number) => {
            const days: Record<string, any[]> = {};
            const now = new Date();
            for (let i = 0; i < nDays; i++) {
              const d = new Date(now);
              d.setDate(d.getDate() - i);
              days[d.toDateString()] = [];
            }
            (allMeals as any[]).forEach((r: any) => {
              const k = new Date(r.timestamp).toDateString();
              if (days[k]) days[k].push(r);
            });
            const activeDays = Object.values(days).filter(arr => arr.length > 0);
            const n = activeDays.length || 1;
            const sum = (field: string) =>
              activeDays.reduce((s, arr) => s + arr.reduce((a: number, r: any) => a + (r[field] ?? 0), 0), 0) / n;
            return {
              carbsG:       sum('carbsG'),
              fiberG:       sum('fiberG'),
              proteinG:     sum('proteinG'),
              fatG:         sum('fatG'),
              caloriesKcal: sum('calories'),
              weightKg:     latestBody?.weightKg ?? null,
            };
          };
          const weeklyMacro = buildWindowAvg(7);
          const macro14d    = buildWindowAvg(14);
          const macro30d    = buildWindowAvg(30);
          const computeDayScore = (meals: any[]): number => {
            const cal  = meals.reduce((s: number, r: any) => s + (r.calories  ?? 0), 0);
            const prot = meals.reduce((s: number, r: any) => s + (r.proteinG  ?? 0), 0);
            const fib  = meals.reduce((s: number, r: any) => s + (r.fiberG    ?? 0), 0);
            const fat  = meals.reduce((s: number, r: any) => s + (r.fatG      ?? 0), 0);
            if (cal < 50) return 0;
            const calGoal = macroGoals.calories > 0 ? macroGoals.calories : 2000;
            const protGoal = macroGoals.protein > 0 ? macroGoals.protein : 150;
            const fibGoal = (macroGoals.fiber ?? 25) > 0 ? (macroGoals.fiber ?? 25) : 25;
            const fatGoal = macroGoals.fat > 0 ? macroGoals.fat : 65;
            return Math.round(
              (Math.min(cal / calGoal, 1)   * 0.25 +
               Math.min(prot / protGoal, 1) * 0.30 +
               Math.min(fib / fibGoal, 1)   * 0.25 +
               Math.min(fat / fatGoal, 1)   * 0.20) * 100,
            );
          };
          const findBestDay = (nDays: number): { dateLabel: string; score: number } | null => {
            const buckets: Record<string, any[]> = {};
            const now = new Date();
            for (let i = 0; i < nDays; i++) {
              const d = new Date(now);
              d.setDate(d.getDate() - i);
              buckets[d.toDateString()] = [];
            }
            (allMeals as any[]).forEach((r: any) => {
              const k = new Date(r.timestamp).toDateString();
              if (buckets[k]) buckets[k].push(r);
            });
            let best: { dateLabel: string; score: number } | null = null;
            Object.entries(buckets).forEach(([key, meals]) => {
              if (meals.length === 0) return;
              const score = computeDayScore(meals);
              if (!best || score > best.score) {
                const d = new Date(key);
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                best = { dateLabel: label, score };
              }
            });
            return best;
          };
          const bestDay7d  = findBestDay(7);
          const bestDay14d = findBestDay(14);
          const bestDay30d = findBestDay(30);
          const macroData: MacroGraphData = {
            carbsG, fiberG, proteinG, fatG, caloriesKcal,
            weightKg: latestBody?.weightKg ?? null,
          };
          return (
            <>
              <NeoVitalMacroGraph
                todayData={macroData}
                weekData={weeklyMacro}
                data14d={macro14d}
                data30d={macro30d}
                bestDay7d={bestDay7d ?? undefined}
                bestDay14d={bestDay14d ?? undefined}
                bestDay30d={bestDay30d ?? undefined}
                isDark={isDark}
                mealCount={todayMeals.length}
                macroGoals={{
                  calories: macroGoals.calories > 0 ? macroGoals.calories : 2000,
                  protein:  macroGoals.protein  > 0 ? macroGoals.protein  : 150,
                  carbs:    macroGoals.carbs    > 0 ? macroGoals.carbs    : 300,
                  fat:      macroGoals.fat      > 0 ? macroGoals.fat      : 65,
                  fiber:    (macroGoals.fiber ?? 25) > 0 ? (macroGoals.fiber ?? 25) : 25,
                }}
                onGoalsChange={async (g) => {
                  await saveGoals({ ...macroGoals, calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat, fiber: g.fiber });
                }}
                fiberGoal={macroGoals.fiber ?? 25}
                onFiberGoalEdit={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setFiberGoalEditorValue(String(macroGoals.fiber ?? 25));
                  setFiberGoalEditorVisible(true);
                }}
                onLogMeal={(mode) => {
                  if (mode === 'plate') {
                    requireScanMealPremium(() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setCameraInitialMode('plate');
                      setCameraSheetVisible(true);
                    }, { feature: fc.scanMealTitle ?? 'Scan a Meal' })();
                  } else {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setCameraInitialMode('search');
                    setCameraSheetVisible(true);
                  }
                }}
                overrideExpanded={narrativeOverride}
              />
            </>
          );
        })()}

        {/* ─── On-Device Insights ──────────────────────────────────────────── */}
        {isSectionVisible('on_device_insights') && data && (
          <OnDeviceInsightsCard
            data={data}
            maxItems={5}
            todaySteps={todaySteps}
            stepGoal={stepGoal}
            weightGoalBanner={weightGoalBanner}
            onWeightGoalPress={() => navigate('/log/weight')}
            overrideExpanded={narrativeOverride}
          />
        )}
        {/* Nutrition restored */}

        {/* ─── Step Goal Picker Sheet ────────────────────────────────────────────── */}
        <Modal
          visible={stepGoalSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setStepGoalSheetVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
            activeOpacity={1}
            onPress={() => setStepGoalSheetVisible(false)}
          />
          <View style={{
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 36,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#48484A' : '#C7C7CC', alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#FFFFFF' : '#000000', marginBottom: 4 }}>{h.dailyStepGoal}</Text>
            <Text style={{ fontSize: 13, color: isDark ? '#8E8E93' : '#6C6C70', marginBottom: 20 }}>
              Current: {stepGoal.toLocaleString()} steps
            </Text>
            {([6000, 8000, 10000, 12000] as const).map((goal) => {
              const isSelected = stepGoal === goal;
              const label = goal >= 1000 ? `${goal / 1000}k` : String(goal);
              const desc = goal === 6000 ? h.lightActivity : goal === 8000 ? h.recommended : goal === 10000 ? h.activeLifestyle : h.highPerformance;
              return (
                <TouchableOpacity
                  key={goal}
                  onPress={() => handleSetStepGoal(goal)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    marginBottom: 8,
                    backgroundColor: isSelected ? (isDark ? '#1D3A5F' : '#EBF5FF') : (isDark ? '#2C2C2E' : '#F2F2F7'),
                    borderWidth: isSelected ? 1.5 : 0,
                    borderColor: isSelected ? '#0891B2' : 'transparent',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: isSelected ? '#0891B2' : (isDark ? '#FFFFFF' : '#000000') }}>
                      {label} steps
                    </Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#8E8E93' : '#6C6C70', marginTop: 2 }}>{desc}</Text>
                  </View>
                  {isSelected && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#0891B2', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Modal>
        {/* ─── Fiber Goal Editor Sheet ────────────────────────────────────────────────── */}
        <Modal
          visible={fiberGoalEditorVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFiberGoalEditorVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
            activeOpacity={1}
            onPress={() => setFiberGoalEditorVisible(false)}
          />
          <View style={{
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 36,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#48484A' : '#C7C7CC', alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#FFFFFF' : '#000000', marginBottom: 2 }}>{h.dailyFiberGoal}</Text>
            <Text style={{ fontSize: 13, color: isDark ? '#8E8E93' : '#6C6C70', marginBottom: 20 }}>
              Current: {macroGoals.fiber ?? 25} g · WHO recommends 25 g/day
            </Text>
            {/* Preset options */}
            {([{ g: 21, label: '21 g', desc: 'Minimum — IOM adequate intake (women)' },
               { g: 25, label: '25 g', desc: 'WHO recommended daily intake' },
               { g: 38, label: '38 g', desc: 'IOM adequate intake (men / athletes)' }] as const).map(opt => {
              const isSelected = (macroGoals.fiber ?? 25) === opt.g;
              return (
                <TouchableOpacity
                  key={opt.g}
                  onPress={async () => {
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await saveGoals({ ...macroGoals, fiber: opt.g });
                    setFiberGoalEditorVisible(false);
                  }}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    marginBottom: 8,
                    backgroundColor: isSelected ? (isDark ? '#1A2E1A' : '#ECFDF5') : (isDark ? '#2C2C2E' : '#F2F2F7'),
                    borderWidth: isSelected ? 1.5 : 0,
                    borderColor: isSelected ? '#EAB308' : 'transparent',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: isSelected ? '#EAB308' : (isDark ? '#FFFFFF' : '#000000') }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#8E8E93' : '#6C6C70', marginTop: 2 }}>{opt.desc}</Text>
                  </View>
                  {isSelected && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#EAB308', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#000', fontSize: 12, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            {/* Custom value input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <TextInput
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  color: colors.foreground,
                }}
                value={fiberGoalEditorValue}
                onChangeText={setFiberGoalEditorValue}
                keyboardType="default"
                placeholder="Custom (g)"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                onSubmitEditing={async () => {
                  const v = parseInt(fiberGoalEditorValue, 10);
                  if (!isNaN(v) && v > 0 && v <= 200) {
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await saveGoals({ ...macroGoals, fiber: v });
                    setFiberGoalEditorVisible(false);
                  }
                }}
              />
              <TouchableOpacity
                onPress={async () => {
                  const v = parseInt(fiberGoalEditorValue, 10);
                  if (!isNaN(v) && v > 0 && v <= 200) {
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await saveGoals({ ...macroGoals, fiber: v });
                    setFiberGoalEditorVisible(false);
                  }
                }}
                style={{ backgroundColor: '#EAB308', borderRadius: 12, paddingHorizontal: 18, height: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {/* Adherence goal editor is now in the Medications tab */}

        {/* ─── 7-Day HRV Summary Card (above Daily Readiness) — hidden per user request ──────────────────── */}
        {false && hrv7DayAvg !== null && (
          <GlassCard accentColor="#00F5FF" onPress={() => navigate('/detail/pulse')} noPadding style={styles.hrv7Card}>
            <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 }}
            onPress={() => navigate('/detail/pulse')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`7-day average HRV: ${hrv7DayAvg} milliseconds`}
          >
            <View style={styles.hrv7Left}>
              <View style={[styles.hrv7IconWrap, { backgroundColor: '#00F5FF18' }]}>
                <Text style={{ fontSize: 18 }}>💙</Text>
              </View>
              <View>
                <Text style={[styles.hrv7Label, { color: colors.muted }]}>{ds.sevenDayAvgLabel} HRV</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Text style={[styles.hrv7Value, { color: '#00F5FF' }]}>{hrv7DayAvg}</Text>
                  <Text style={[styles.hrv7Unit, { color: colors.muted }]}>ms</Text>
                </View>
              </View>
            </View>
            <View style={styles.hrv7Right}>
              <Text style={[styles.hrv7Zone, {
                color: (hrv7DayAvg ?? 0) >= 50 ? '#10B981' : (hrv7DayAvg ?? 0) >= 35 ? '#6366F1' : (hrv7DayAvg ?? 0) >= 20 ? '#F59E0B' : '#EF4444',
              }]}>
                {(hrv7DayAvg ?? 0) >= 50 ? ds.hrvExcellentLabel : (hrv7DayAvg ?? 0) >= 35 ? ds.hrvGoodLabel : (hrv7DayAvg ?? 0) >= 20 ? ds.hrvFairLabel : ds.hrvLowLabel}
              </Text>
              <IconSymbol name="chevron.right" size={14} color={colors.muted} />
            </View>
            </TouchableOpacity>
          </GlassCard>
        )}
        </>
        </>)}

        {/* ─── Section divider ───────────────────────────────────────── */}
        <View style={{ height: 6 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 6 }} />
        <View onLayout={(e) => { sectionOffsets.current.clinical = e.nativeEvent.layout.y; }} />
        {/* ─── PERSONAL section content (always visible) ─────────────────── */}
        {isSectionVisible('clinical_section') && state.data && (() => {
          const events = buildClinicalNarrative(state.data!);
          // Compute window cutoff based on cnWindow state
          const _now = Date.now();
          const cnCutoff = cnWindow === '1h' ? _now - 60 * 60 * 1000
            : cnWindow === '6h' ? _now - 6 * 60 * 60 * 1000
            : cnWindow === '7d' ? _now - 7 * 24 * 60 * 60 * 1000
            : (() => { const _d = new Date(); _d.setHours(0,0,0,0); return _d.getTime(); })();
          const windowEvents = events.filter(e => new Date(e.timestamp).getTime() >= cnCutoff);
          const highestUrgency = windowEvents.reduce<'normal'|'elevated'|'stage2'|'crisis'>((acc, e) => {
            const order = ['normal','elevated','stage2','crisis'] as const;
            // Guard: defensive null-coalescing prevents EXC_BAD_ACCESS in Hermes
            // indexOf if a malformed event object ever reaches this reducer.
            const urgency = e.urgency ?? 'normal';
            return order.indexOf(urgency) > order.indexOf(acc) ? urgency : acc;
          }, 'normal');
          const urgColor = urgencyColor(highestUrgency);

          // ── Vital signs snapshot for the summary row ──────────────────────
          const cnVitalRecs = (state.data!.vitalSigns ?? []);
          const latestCnVital = cnVitalRecs.length
            ? [...cnVitalRecs].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
            : null;
          // Latest BP (merge vitalSigns + latestBP from outer scope)
          const cnSystolic  = latestCnVital?.systolic  ?? latestBP?.systolic  ?? null;
          const cnDiastolic = latestCnVital?.diastolic ?? latestBP?.diastolic ?? null;
          // Latest HR (merge vitalSigns + latestPulse from outer scope)
          const cnHR = latestCnVital?.heartRate ?? latestPulse?.bpm ?? null;
          // Latest SpO2
          const cnSpO2 = latestCnVital?.spo2 ?? latestCnVital?.oxygenSaturation ?? latestSpO2 ?? null;
          // Latest Temp (°F)
          const cnTemp = latestCnVital?.temperature ?? null;
          // Latest Respiratory Rate
          const cnRR = latestCnVital?.respiratoryRate ?? null;

          // Colour helpers for vital tiles
          const bpTileColor = (sys: number | null, dia: number | null) => {
            if (sys === null) return colors.muted;
            if (sys >= 180 || (dia ?? 0) >= 120) return '#DC2626'; // crisis
            if (sys >= 160 || (dia ?? 0) >= 100) return '#EF4444'; // stage 2
            if (sys >= 140 || (dia ?? 0) >= 90)  return '#F59E0B'; // stage 1
            if (sys >= 130 || (dia ?? 0) >= 80)  return '#FBBF24'; // elevated
            return '#22C55E'; // normal
          };
          const hrTileColor = (hr: number | null) => {
            if (hr === null) return colors.muted;
            if (hr < 50 || hr > 110) return '#EF4444';
            if (hr < 60 || hr > 100) return '#F59E0B';
            return '#22C55E';
          };
          const spo2TileColor = (v: number | null) => {
            if (v === null) return colors.muted;
            if (v < 90) return '#DC2626';
            if (v < 94) return '#EF4444';
            if (v < 96) return '#F59E0B';
            return '#22C55E';
          };
          const tempTileColor = (v: number | null) => {
            if (v === null) return colors.muted;
            if (v >= 103 || v < 96) return '#EF4444';
            if (v >= 100.4) return '#F59E0B';
            return '#22C55E';
          };
          const rrTileColor = (v: number | null) => {
            if (v === null) return colors.muted;
            if (v > 25 || v < 10) return '#EF4444';
            if (v > 20) return '#F59E0B';
            return '#22C55E';
          };

          const cnVitalTiles: { label: string; value: string; color: string }[] = [];
          if (cnSystolic !== null && cnDiastolic !== null)
            cnVitalTiles.push({ label: 'BP', value: `${cnSystolic}/${cnDiastolic}`, color: bpTileColor(cnSystolic, cnDiastolic) });
          if (cnHR !== null)
            cnVitalTiles.push({ label: 'HR', value: `${cnHR}`, color: hrTileColor(cnHR) });
          if (cnSpO2 !== null)
            cnVitalTiles.push({ label: 'SpO₂', value: `${cnSpO2}%`, color: spo2TileColor(cnSpO2) });
          if (cnTemp !== null)
            cnVitalTiles.push({ label: 'Temp', value: tempUnit === 'C' ? `${fToC(cnTemp).toFixed(1)}°C` : `${cnTemp.toFixed(1)}°F`, color: tempTileColor(cnTemp) });
          if (cnRR !== null)
            cnVitalTiles.push({ label: 'RR', value: `${Math.round(cnRR)}`, color: rrTileColor(cnRR) });

          const CN_WINDOWS: { key: '1h'|'6h'|'today'|'7d'; label: string }[] = [
            { key: '1h',    label: '1 hr' },
            { key: '6h',    label: '6 hr' },
            { key: 'today', label: ds.todayLabel },
            { key: '7d',    label: '7d' },
          ];
          return (
            <GlassCard
              accentColor={urgColor}
              noPadding
              style={{ marginHorizontal: 16, marginBottom: 8 }}
            >
              <View style={{ padding: 14 }}>
              {/* Time-window pill row */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                {CN_WINDOWS.map(w => {
                  const active = cnWindow === w.key;
                  return (
                    <TouchableOpacity
                      key={w.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setCnWindow(w.key);
                      }}
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 4,
                        borderRadius: 20,
                        backgroundColor: active ? urgColor + '22' : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? urgColor + '80' : colors.border,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Personal Narrative ${w.label} window`}
                    >
                      <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? urgColor : colors.muted }}>
                        {w.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: urgColor }} />
                  <Text style={{ fontSize: 11, color: urgColor, fontWeight: '600' }}>
                    {windowEvents.length} {windowEvents.length !== 1 ? (ds.eventLabelPlural ?? 'events') : (ds.eventLabel ?? 'event')}
                  </Text>
                </View>
              </View>
              {/* Vital signs compact tile row */}
              {cnVitalTiles.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {cnVitalTiles.map(tile => (
                    <View
                      key={tile.label}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 10,
                        backgroundColor: tile.color + '18',
                        borderWidth: 1,
                        borderColor: tile.color + '50',
                      }}
                    >
                      <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '500' }}>{tile.label}</Text>
                      <Text style={{ fontSize: 12, color: tile.color, fontWeight: '700' }}>{tile.value}</Text>
                    </View>
                  ))}
                  {/* Color guide text link */}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/settings/color-legend', params: { section: 'Universal Status Colors' } } as any)}
                    accessibilityRole="button"
                    accessibilityLabel="Understanding Color Codes"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ alignSelf: 'center' }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' }}>{h.colorGuide}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {cnVitalTiles.length === 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 2 }}>
                  <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>No vital signs recorded yet</Text>
                </View>
              )}
              {/* Summary tap row */}
              <TouchableOpacity
                onPress={() => navigate('/detail/clinical-narrative')}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: urgColor + '12',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: urgColor + '40',
                  gap: 10,
                }}
                accessibilityRole="button"
                accessibilityLabel="Open Personal Narrative detail"
              >
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: urgColor }}>
                  {ds.personalNarrative}
                </Text>
                <Text style={{ fontSize: 13, color: urgColor + '99' }}>›</Text>
              </TouchableOpacity>
              </View>
            </GlassCard>
          );
        })()}
        {isSectionVisible('nutrition_section') && (() => {
          // Medication today summary for CTABS
          const todayKey = new Date().toISOString().split('T')[0];
          const activeMeds = medications.filter((m: any) => m.active !== false);
          const takenToday = activeMeds.reduce((acc, m) => acc + ((m as any).doseLogs ?? []).filter((l: any) => l.date === todayKey && l.status === 'taken').length, 0);
          const skippedToday = activeMeds.reduce((acc, m) => acc + ((m as any).doseLogs ?? []).filter((l: any) => l.date === todayKey && l.status === 'skipped').length, 0);
          const medValue = activeMeds.length > 0 ? `${takenToday} taken · ${skippedToday} skipped` : '—';
          const medSub = activeMeds.length > 0 ? `${activeMeds.length} active med${activeMeds.length !== 1 ? 's' : ''}` : 'No medications';
          const CTABS = [
            { label: ds.meds,  icon: '💊', color: '#7C3AED',
              value: medValue,
              sub: medSub,
              route: '/(tabs)/record' as const },
            { label: ds.labs,  icon: '🧪', color: '#2563EB',
              value: (data?.labResults ?? []).length
                ? `${(data!.labResults ?? []).length} result${(data!.labResults ?? []).length !== 1 ? 's' : ''}` : '—',
              sub: (data?.labResults ?? []).length ? 'on file' : 'No data',
              route: '/labs' as const },
            { label: ds.appts, icon: '🗓️', color: '#0ECFB8',
              value: (() => { const u = (data?.appointments ?? []).filter((a: any) => new Date(a.dateTime).getTime() > Date.now()); return u.length ? `${u.length} upcoming` : '—'; })(),
              sub: (() => { const u = (data?.appointments ?? []).filter((a: any) => new Date(a.dateTime).getTime() > Date.now()); return u.length ? 'scheduled' : 'No data'; })(),
              route: '/log/appointments' as const },
          ];
          const activeTab = CTABS[clinicalTabIdx] ?? CTABS[0];
          return (
            <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, paddingBottom: 8 }}>
                {CTABS.map((t, i) => {
                  const on = clinicalTabIdx === i;
                  return (
                    <TouchableOpacity key={t.label}
                      onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setClinicalTabIdx(i); safeSetItem(CLINICAL_TAB_KEY, String(i)).catch(() => {}); }}
                      style={[styles.inlineTab, { flex: 1, borderColor: on ? t.color + '80' : colors.border, backgroundColor: on ? t.color + '12' : colors.surface }]}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: 13 }}>{t.icon}</Text>
                      <Text style={[styles.inlineTabLabel, { color: on ? t.color : colors.muted }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <GlassCard accentColor={activeTab.color} noPadding onPress={() => navigate(activeTab.route)}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                  <View style={[styles.inlineTabCardIcon, { backgroundColor: activeTab.color + '18' }]}>
                    <Text style={{ fontSize: 22 }}>{activeTab.icon}</Text>
                  </View>
                  {activeTab.value === '—' && activeTab.label === ds.labs ? (
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.inlineTabCardTitle, { color: colors.foreground }]}>{ds.noLabResults}</Text>
                      <Text style={[styles.inlineTabCardSub, { color: colors.muted }]}>Log blood work and panel results to track trends.</Text>
                      <TouchableOpacity
                        onPress={() => navigate('/labs')}
                        style={{ marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: activeTab.color + '20', borderWidth: 1, borderColor: activeTab.color + '60' }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: activeTab.color }}>{ds.addLabResult}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : activeTab.value === '—' && activeTab.label === ds.appts ? (
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.inlineTabCardTitle, { color: colors.foreground }]}>{ds.noUpcomingAppts}</Text>
                      <Text style={[styles.inlineTabCardSub, { color: colors.muted }]}>Stay on top of your care — schedule your next visit.</Text>
                      <TouchableOpacity
                        onPress={() => navigate('/log/appointments')}
                        style={{ marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: activeTab.color + '20', borderWidth: 1, borderColor: activeTab.color + '60' }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: activeTab.color }}>{ds.scheduleAppt}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inlineTabCardTitle, { color: colors.foreground }]}>{activeTab.label}</Text>
                      <Text style={[styles.inlineTabCardValue, { color: activeTab.color }]}>{activeTab.value}</Text>
                      <Text style={[styles.inlineTabCardSub, { color: colors.muted }]}>{activeTab.sub}</Text>
                    </View>
                  )}
                  <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                </View>
              </GlassCard>
            </View>
          );
        })()}

        {/* ─── Personal Narrative Card ───────────────────────────────────── */}
        <PersonalNarrativeCard medications={medications} data={data ?? null} overrideExpanded={narrativeOverride} />


        {/* ─── Section divider ───────────────────────────────────────── */}
        <View style={{ height: 6 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 6 }} />
        {/* ─── Emergency Vault (ICE) Tile ────────────────────────────────────── */}
        {isSectionVisible('ice_section') && (
          <View onLayout={(e) => { sectionOffsets.current.ice = e.nativeEvent.layout.y; }}>
            <EmergencyVaultTile editTrigger={iceEditTrigger} />
          </View>
        )}
        {/* ─── Privacy Summary Card ────────────────────────────── */}
        <GlassCard accentColor="#10B981" onPress={() => router.push('/settings/data-privacy' as any)} noPadding style={styles.privacySummaryCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 }}>
          <View style={styles.privacySummaryLeft}>
            <IconSymbol name="lock.shield.fill" size={18} color="#10B981" />
            <View style={styles.privacySummaryText}>
              <Text style={[styles.privacySummaryTitle, { color: '#10B981' }]}>
                {ds.allDataOnDevice}
              </Text>
              <Text style={[styles.privacySummaryDesc, { color: colors.muted }]}>
                {lastGlobalSyncAt
                  ? `Last HealthKit sync · ${safeFormatTime(lastGlobalSyncAt, [], { hour: '2-digit', minute: '2-digit' })}`
                  : ds.noServerDataStays}
              </Text>
            </View>
          </View>
          <IconSymbol name="chevron.right" size={14} color="#10B981" />
          </View>
        </GlassCard>

        {/* Reference Only Footer — Personal Health Hub */}
        <View style={[styles.referenceOnlyFooter, { backgroundColor: isDark ? 'rgba(15,25,41,0.85)' : 'rgba(239,246,255,0.9)', borderTopColor: isDark ? 'rgba(96,165,250,0.35)' : 'rgba(59,130,246,0.3)', borderLeftColor: isDark ? 'rgba(96,165,250,0.18)' : 'rgba(59,130,246,0.15)', borderRightColor: isDark ? 'rgba(30,58,95,0.5)' : 'rgba(191,219,254,0.6)', borderBottomColor: isDark ? 'rgba(15,25,41,0.9)' : 'rgba(147,197,253,0.4)', shadowColor: isDark ? '#1E40AF' : '#3B82F6', shadowOffset: { width: 0, height: 5 }, shadowOpacity: isDark ? 0.3 : 0.15, shadowRadius: 12, elevation: 8 }]}>
          <View style={styles.referenceOnlyBadge}>
            <Text style={styles.referenceOnlyBadgeText}>{ds.referenceOnly}</Text>
          </View>
          <Text style={[styles.disclaimerText, { color: colors.muted, textAlign: 'left', fontStyle: 'normal' }]}>
            {((disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en).disclaimer}
          </Text>
          <View style={styles.referenceOnlyLinks}>
            <TouchableOpacity
              onPress={() => router.push('/settings/data-privacy' as any)}
              accessibilityRole="link"
              accessibilityLabel={ds.dataAndPrivacy ?? 'Open Data & Privacy settings'}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={{ fontSize: 11, color: '#3B82F6', textDecorationLine: 'underline', fontWeight: '500' }}>
                {ds.dataAndPrivacy}
              </Text>
            </TouchableOpacity>

          </View>
        </View>

          {/* Weight Goal Progress Banner moved to On-Device Insights → Wins tab */}


      </ScrollView>
    </ScreenContainer>
    {/* Goal Reached Confetti Overlay */}
    {showConfetti && (
      <ConfettiBurst
        originX={confettiOrigin.x}
        originY={confettiOrigin.y}
        onDone={() => setShowConfetti(false)}
      />
    )}

    {/* Meal Log Confetti Overlay */}
    {showMealConfetti && (
      <ConfettiBurst
        originX={mealConfettiOrigin.x}
        originY={mealConfettiOrigin.y}
        onDone={() => setShowMealConfetti(false)}
      />
    )}

    {/* Smart Food Camera Sheet */}
    <AiFoodCameraSheet
      visible={cameraSheetVisible}
      onClose={() => { setCameraSheetVisible(false); setFiberSearchPrefill(undefined); }}
      initialMode={cameraInitialMode}
      initialSearchQuery={fiberSearchPrefill}
      onMealLogged={() => {
        safeSetItem(LAST_MEAL_LOGGED_KEY, String(Date.now())).catch(() => {});
      }}
    />
    {ScanMealGateSheet}
    {SmartRemindersGateSheet}
    <ScrollToTopButton opacity={dashScrollTopOpacity} visible={showDashScrollTop} onPress={dashScrollToTop} />
    {/* Reschedule confirmation toast */}
    {rescheduleToastMsg !== null && (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 90,
          right: 20,
          backgroundColor: isDark ? '#1F2937' : '#111827',
          borderRadius: 10,
          paddingVertical: 10,
          paddingHorizontal: 16,
          alignItems: 'center',
          opacity: rescheduleToastOpacity,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 6,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{rescheduleToastMsg}</Text>
      </Animated.View>
    )}
    {/* BLE Device Scanner sheet — opened from header Bluetooth button */}
    {/* Snooze Duration Picker — opened after right-swipe on glucose smart reminder */}
    <SnoozeDurationSheet
      visible={snoozeSheetVisible}
      onSelect={snoozeGlucoseReminder}
      onDismiss={() => setSnoozeSheetVisible(false)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
    opacity: 0.7,
  },
  header: {
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  /** Compact health data pill in the header pill row */
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  healthPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthPillLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  healthPillValue: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  privacyText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 4,
  },
  vaccineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  vaccineIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaccineMarkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeFilterRow: {
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 4,
  },
  segmentWrapper: {
    flex: 1,
    maxWidth: 220,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 16,
  },
  bentoGrid: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionSubtitle: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 16,
    flexShrink: 1,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 4,
    opacity: 0.25,
  },
  jumpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  jumpChipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  hrv7Card: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
  },
  hrv7Left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hrv7IconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hrv7Label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  hrv7Value: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  hrv7Unit: {
    fontSize: 13,
    fontWeight: '600',
  },
  hrv7Right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hrv7Zone: {
    fontSize: 13,
    fontWeight: '700',
  },
  lockWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  lockWidgetIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockWidgetText: { flex: 1 },
  lockWidgetTitle: { fontSize: 13, fontWeight: '600' },
  lockWidgetSub: { fontSize: 11, marginTop: 1 },
  healthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  healthBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  healthBannerText: {
    flex: 1,
    gap: 2,
  },
  healthBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  healthBannerSubtitle: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
  },
  healthBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  healthBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  healthBannerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  healthBannerDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  calBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  globeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  neonMonitorBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  themeShortcutBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeTranslatingDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  langSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  langSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  langSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  langSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  langSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  langSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  langClearBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  disclaimerFooter: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.15)',
    backgroundColor: 'rgba(150,150,150,0.05)',
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  referenceOnlyFooter: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    gap: 8,
  },
  referenceOnlyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3B82F620',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#3B82F640',
  },
  referenceOnlyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#3B82F6',
  },
  referenceOnlyLinks: {
    flexDirection: 'row',
    gap: 16,
  },
  privacySummaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  privacySummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  privacySummaryText: { gap: 1, flex: 1 },
  privacySummaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  privacySummaryDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  weightGoalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  weightGoalBannerIcon: {
    fontSize: 22,
  },
  weightGoalBannerText: {
    flex: 1,
    gap: 2,
  },
  weightGoalBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  weightGoalBannerSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  // ─── Premium card / tile styles ─────────────────────────────────────────────────
  premiumMetricTile: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minHeight: 100,
  },
  premiumGlassCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  premiumSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  // ─── Inline tab strip styles (VITALS / WELLNESS / PERSONAL) ───────────────────────
  inlineTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  inlineTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  inlineTabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  inlineTabCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineTabCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  inlineTabCardValue: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 1,
  },
  inlineTabCardSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  // ─── Drag-to-reorder styles ──────────────────────────────────────────────────
  editLayoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  editLayoutText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  editLayoutDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 10,
  },
  editLayoutDoneText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardReorderOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
  },
  reorderArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderArrowText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  reorderDragHandle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    paddingHorizontal: 6,
  },
  reorderDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
});

