import { safeFormatDate } from '@/lib/utils';
import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * Settings Screen
 * Health permissions, data management, privacy controls, and app info.
 */

import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Pressable, Alert, Platform, Switch, Linking, Modal, AppState, type AppStateStatus, useColorScheme, Animated, LayoutAnimation, UIManager, TextInput, ActivityIndicator, TouchableOpacity, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FloatingWellnessDisclaimer } from '@/components/floating-wellness-disclaimer';
import { ScreenContainer } from '@/components/screen-container';
import { GlassCard } from '@/components/glass-card';
// BLE removed — Apple Health integration only
import { KeyRotationSheet } from '@/components/key-rotation-sheet';
import { EvidenceRefBanner } from '@/components/ui/evidence-ref-banner';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { HR_WINDOW_LABELS, loadHrWindow, saveHrWindow, type HrWindowSize } from '@/lib/health/hr-window-pref';
import { clearVitalSignsData } from '@/lib/health/storage';
import { DIET_TYPE_OPTIONS, type DietType } from '@/lib/health/diet-type';
import { useColors, useLang, useRawLang } from '@/hooks';
import { useThemeContext } from '@/lib/theme-provider';
import { requestHealthPermissions } from '@/lib/health/permissions';
import { CLINICAL_SOURCES_COUNT } from '@/app/settings/clinical-sources';
import { resetOnboarding } from '@/lib/onboarding';
import { showHealthKitToast, showAppToast } from '@/components/healthkit-toast';
import { resetConsent, hasAcceptedCurrentConsent } from '@/components/consent-modal';
import { GDPR_CONSENT_KEY } from '@/app/consent';

import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth/auth-context';
import { DietProtocolTooltip } from '@/components/diet-protocol-tooltip';
import { LOCK_TIMEOUT_OPTIONS, type LockTimeout } from '@/lib/auth/auth-storage';
import { useDataSources } from '@/lib/data-sources/data-sources-context';
import { settingsStrings, settingsExtStrings, setLangOverride, setPreviewLang, getPreviewLang, dietLabelStrings, complianceRingStrings, type Lang } from '@/lib/i18n';
import { useDietDescStrings } from '@/hooks/use-diet-desc-strings';
// expo-updates is native-only; import lazily to avoid web crash at module eval time
import { useTranslationContext, STATIC_LANGS, getTranslationCacheCount } from '@/lib/i18n-ai';
import { applyRTLForLang, isRTLLang } from '@/lib/rtl';
import { getLangFlag } from '@/lib/lang-flags';
import { SMART_SUPPORTED_LANGS, SUPPORTED_LANGUAGES, STATIC_LANG_LIST } from '@/lib/supported-languages';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLabRemindersEnabled, setLabRemindersEnabled } from '@/lib/health/lab-reminders';
import { SetGoalsSheet } from '@/components/set-goals-sheet';
import { useMacroGoals } from '@/hooks/use-macro-goals';
import { CrashLogViewer } from '@/components/crash-log-viewer';
import { copyCrashReport, readCrashLogs, sendCrashReport, shareCrashReport, clearCrashLogs } from '@/lib/crash-logger';
import { clearUnreadAlertCount, getUnreadAlertCount } from '@/lib/notifications/alert-history';
import { clearAnalyteAlertBadge } from '@/lib/notifications/analyte-alert-badge';
import { appEvents } from '@/lib/app-events';
import {
  scheduleReadinessNotificationWithScore,
  cancelReadinessNotification,
} from '@/lib/health/readiness-notification';
import { loadReadinessHistory } from '@/lib/health/readiness-history';
import { WHATS_NEW_SEEN_KEY, LATEST_WHATS_NEW_VERSION } from '@/lib/whats-new-version';
import { useSugarBudget } from '@/hooks/use-sugar-budget';
import { useHrvTarget } from '@/hooks/use-hrv-target';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { useSleepGoal } from '@/hooks/use-sleep-goal';
import {
  loadBedtimeReminderSettings,
  saveBedtimeReminderSettings,
  applyBedtimeReminder,
  formatReminderTime,
  type BedtimeReminderSettings,
} from '@/lib/health/bedtime-reminder';
import { useUnitPreferences, saveUnitPreferences, applyLangUnitDefaults, type DistanceUnit, type HeightUnit, type WeightUnit, type TempUnit, type GlucoseUnit } from '@/hooks/use-unit-preferences';
import { SUGAR_BUDGET_MIN_G, SUGAR_BUDGET_MAX_G, WHO_SUGAR_DEFAULT_G } from '@/lib/health/sugar-budget';
import {
  scheduleSugarNotification as _scheduleSugarNotification,
  cancelSugarNotification as _cancelSugarNotification,
  scheduleGlucoseNotifications,
  cancelGlucoseNotifications,
  type GlucoseReminderMode,
  type AcSlotTimes,
  AC_SLOT_TIMES_KEY,
  AC_DEFAULT_SLOTS,
  GLUCOSE_MODE_LABELS,
  GLUCOSE_MODE_SUBTITLES as _GLUCOSE_MODE_SUBTITLES,
} from '@/lib/health/sugar-notification';
import { HRV_TARGET_ALERT_ENABLED_KEY } from '@/lib/notifications/threshold-checker';
import { NARRATIVE_AUTO_RANGE_WINDOW_KEY, AUTO_RANGE_OFF } from '@/components/clinical-narrative-card';
import { useCustomPreset } from '@/hooks/use-custom-preset';
import { useCelebrationSounds } from '@/hooks/use-celebration-sounds';
import {
  useSmoothingStrength,
} from '@/lib/health/smoothing-strength-context';
import type { SmoothingStrength } from '@/lib/health/smooth-vitals';
import { DICTATION_BANNER_KEY } from '@/components/keyboard-dictation-banner';
import { HINT_SHOWN_KEY } from '@/components/dashboard/collapsible-card';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import { safeSetItem } from '@/lib/safe-async-storage';
import { secureGetItem } from '@/lib/storage/health-storage';
import { getStorageHealthSummary, formatStorageSize, clearStorageTelemetry, type StorageHealthSummary } from '@/lib/storage-telemetry';
import { loadRetentionMonths, saveRetentionMonths, RETENTION_OPTIONS, type RetentionMonths } from '@/lib/retention-settings';
import { getInsightCooldownMs, setInsightCooldownMs, clearAllInsightCooldowns, getAllMetricCooldowns, setMetricCooldownMs, type InsightMetricKey } from '@/lib/health/insight-store';
import { appendConfigAuditEntry } from '@/lib/config-audit-log';
import { useStaleThreshold, STALE_THRESHOLD_OPTIONS, type StaleThresholdHours } from '@/lib/health/stale-threshold';
import { useSubscription } from '@/lib/subscription/subscription-context';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { paywallGuard } from '@/lib/subscription/paywall-guard';
import { intelligenceName } from '@/lib/intelligence';
import { CompactReminderCard } from '@/components/subscription/SmartReminderBanners';
import { useSmartTrialReminder } from '@/hooks/use-smart-trial-reminder';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Smart-translated languages only (derived from shared config in lib/supported-languages.ts) */
const AI_LANGUAGE_OPTIONS: readonly { code: string; label: string; native: string }[] = SMART_SUPPORTED_LANGS;
/** Static built-in languages (derived from shared config in lib/supported-languages.ts) */
const STATIC_LANGUAGE_OPTIONS = STATIC_LANG_LIST;

// ── Animated sliding-pill unit toggle (top-level component to satisfy Rules of Hooks) ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AnimatedUnitToggle({
  options,
  current,
  tabWidth,
  onSelect,
  accentColor,
  borderColor,
  isDark,
}: {
  options: readonly { v: string; label: string }[];
  current: string;
  tabWidth: number;
  onSelect: (v: string) => void;
  accentColor: string;
  borderColor: string;
  isDark: boolean;
}) {
  const activeIdx = options.findIndex(o => o.v === current);
  const pillX = useSharedValue(activeIdx * tabWidth);
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  const handlePress = useCallback((v: string, idx: number) => {
    pillX.value = withTiming(idx * tabWidth, { duration: 220, easing: Easing.out(Easing.quad) });
    onSelect(v);
  }, [pillX, tabWidth, onSelect]);

  React.useEffect(() => {
    const idx = options.findIndex(o => o.v === current);
    if (idx >= 0) pillX.value = withTiming(idx * tabWidth, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [current, options, tabWidth, pillX]);

  const totalWidth = tabWidth * options.length;
  return (
    <View style={{
      width: totalWidth,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor,
      overflow: 'hidden',
      flexDirection: 'row',
      position: 'relative',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    }}>
      <Reanimated.View
        style={[{
          position: 'absolute',
          top: 0,
          left: 0,
          width: tabWidth,
          height: '100%',
          borderRadius: 9,
          backgroundColor: accentColor + '28',
          borderWidth: 1,
          borderColor: accentColor + '55',
        }, pillStyle]}
      />
      {options.map(({ v, label: optLabel }, idx) => (
        <Pressable
          key={v}
          style={{
            width: tabWidth,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            borderLeftWidth: idx > 0 ? 1 : 0,
            borderLeftColor: borderColor,
          }}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handlePress(v, idx);
          }}
        >
          <Text style={{
            fontSize: 13,
            fontWeight: current === v ? '700' : '500',
            color: current === v ? accentColor : '#9BA1A6',
            textAlign: 'center',
          }}>{optLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Smoothing Strength Row ──────────────────────────────────────────────────
// Standalone component so it can call useSmoothingStrength() at the top level.
function SmoothingStrengthRow() {
  const { strength, setStrength } = useSmoothingStrength();
  const smColors = useColors();
  const smLang = useLang();
  const smSe = (settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[smLang] ?? settingsExtStrings.en;
  const STRENGTH_OPTIONS: { key: SmoothingStrength; label: string; sub: string; color: string }[] = [
    { key: 'raw',      label: smSe.smoothingRaw ?? 'Raw',           sub: smSe.smoothingRawSub ?? 'No smoothing — every reading shown',          color: '#EF4444' },
    { key: 'light',    label: smSe.smoothingLight ?? 'Light',       sub: smSe.smoothingLightSub ?? 'Narrow buckets, preserves variation',       color: '#F59E0B' },
    { key: 'standard', label: smSe.smoothingStandard ?? 'Standard', sub: smSe.smoothingStandardSub ?? 'Default — clinically reassuring',        color: '#22C55E' },
    { key: 'heavy',    label: smSe.smoothingHeavy ?? 'Heavy',       sub: smSe.smoothingHeavySub ?? 'Wide buckets, maximum trend clarity',       color: '#0EA5E9' },
  ];
  const smScheme = useColorScheme() ?? 'light';
  const smIsDark = smScheme === 'dark';
  // Inactive chip border / label — visible on both white and dark backgrounds
  const inactiveBorder = smIsDark ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.35)';
  const inactiveLabel = smIsDark ? '#94A3B8' : '#475569';
  return (
    <View style={{ borderTopWidth: 0.5, borderTopColor: smIsDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)', paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: smIsDark ? '#00F5FF18' : '#0EA5E918', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15 }}>📈</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: smColors.foreground }}>{smSe.vitalWaveformSmoothing ?? 'Vital Waveform Smoothing'}</Text>
          <Text style={{ fontSize: 12, color: smColors.muted, marginTop: 1 }}>{smSe.vitalWaveformSmoothingSub ?? 'Controls how HR and vitals are averaged on charts'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 7, paddingLeft: 42, flexWrap: 'wrap' }}>
        {STRENGTH_OPTIONS.map((opt) => {
          const active = strength === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={({ pressed }) => ({
                flexDirection: 'column', alignItems: 'center',
                paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: active ? opt.color : inactiveBorder,
                backgroundColor: active ? opt.color + (smIsDark ? '22' : '18') : (smIsDark ? 'transparent' : 'rgba(100,116,139,0.06)'),
                opacity: pressed ? 0.7 : 1,
                minWidth: 70,
              })}
              onPress={() => {
                setStrength(opt.key);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Set smoothing to ${opt.label}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? opt.color : inactiveLabel }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* Description of currently active option */}
      {(() => {
        const cur = STRENGTH_OPTIONS.find((o) => o.key === strength);
        return cur ? (
          <Text style={{ fontSize: 11, color: cur.color, paddingLeft: 42, fontStyle: 'italic', opacity: smIsDark ? 0.85 : 1 }}>
            {cur.sub}
          </Text>
        ) : null;
      })()}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const scrollViewRef = useRef<import('react-native').ScrollView | null>(null);
  const { showScrollTop: showSettingsScrollTop, scrollTopOpacity: settingsScrollTopOpacity, handleScroll: handleSettingsScroll, scrollToTop: settingsScrollToTop } = useScrollToTop(scrollViewRef);
  const appearanceRef = useRef<import('react-native').View>(null);
  const privacyRef = useRef<import('react-native').View>(null);
  const { colorScheme, preference, setPreference, isAmoled, scheduledDark, setScheduledDark } = useThemeContext();
  const { state, forceSync, requestPermissions, recheckPermissions, dietType, setDietType } = useHealth();
  const [hrWindow, setHrWindowState] = useState<HrWindowSize>('4h');
  const setHrWindow = async (w: HrWindowSize) => { setHrWindowState(w); await saveHrWindow(w); };
  React.useEffect(() => { loadHrWindow().then(setHrWindowState); }, []);

  // ── Subscription ───────────────────────────────────────────────────────
  const {
    isPremium,
    accessState,
    trialDaysRemaining,
    trialStartMs,
    products: subProducts,
    productsLoading: subProductsLoading,
    restorePurchases: restoreIAPPurchases,
    activeProductId: subActiveProductId,
    subscriptionExpiryMs: subExpiryMs,
    originalPurchaseDateMs: subOriginalPurchaseDateMs,
    autoRenewEnabled: subAutoRenewEnabled,
    isRestoring: subIsRestoring,
    restoreResult: subRestoreResult,
    clearRestoreResult: subClearRestoreResult,
    hasIntroOffer: subHasIntroOffer,
    introOfferDays: subIntroOfferDays,
  } = useSubscription();
  // ── Derived plan display info ─────────────────────────────────────────────
  // activePlanLabel is resolved after se is declared (line ~1351); use a getter below.
  const renewalDateStr = subExpiryMs
    ? new Date(subExpiryMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const originalPurchaseDateStr = subOriginalPurchaseDateMs
    ? new Date(subOriginalPurchaseDateMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  // Stable fallback prices — shown when StoreKit/Play hasn't loaded yet
  const monthlyProduct = subProducts.find((p) => p.id === 'vitalsync.healthtracker.premium_monthly');
  const yearlyProduct  = subProducts.find((p) => p.id === 'vitalsync.healthtracker.premium_annual');
  const monthlyPrice = (monthlyProduct as (typeof monthlyProduct & { localizedPrice?: string }) | undefined)?.localizedPrice ?? '$4.99';
  const yearlyPrice  = (yearlyProduct  as (typeof yearlyProduct  & { localizedPrice?: string }) | undefined)?.localizedPrice ?? '$49.99';

  // ── Search ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const searchLower = searchQuery.toLowerCase().trim();

  // ── Section collapsed state (persisted to AsyncStorage) ─────────────────
  const SECTION_STATE_KEY = '@vsht:settings_sections_v1';
  const [sectionExpanded, setSectionExpanded] = useState<Record<string, boolean>>({
    appearance: true,
    my_profile: true,
    health_data: true,
    stored_data: false,
    privacy: true,
    notifications: true,
    about: true,
    diagnostics: false,
    subscription: true,
  });

  useEffect(() => {
    AsyncStorage.getItem(SECTION_STATE_KEY)
      .then((v) => {
        if (v) {
          try {
            const saved = JSON.parse(v) as Record<string, boolean>;
            setSectionExpanded((prev) => ({ ...prev, ...saved }));
          } catch (_unused) { /* ignore */ }
        }
      })
      .catch(() => {});
   
  }, []);

  // All section keys in display order
  const ALL_SECTION_KEYS = ['appearance', 'subscription', 'health_data', 'my_profile', 'stored_data', 'privacy', 'notifications', 'about', 'diagnostics'] as const;

  const allExpanded = ALL_SECTION_KEYS.every((k) => sectionExpanded[k] !== false);

  const collapseAll = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    const next = Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, false]));
    setSectionExpanded(next);
    safeSetItem(SECTION_STATE_KEY, JSON.stringify(next)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expandAll = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    const next = Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, true]));
    setSectionExpanded(next);
    safeSetItem(SECTION_STATE_KEY, JSON.stringify(next)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSection = useCallback((key: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setSectionExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      safeSetItem(SECTION_STATE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── Smart Scribe highlight duration ─────────────────────────────────────────────────────
  const AI_FILL_HIGHLIGHT_DURATION_KEY = '@vsht:ai_fill_highlight_duration_ms';
  const [dictationBannerReset, setDictationBannerReset] = React.useState(false);

  // Default Report Language — uses shared ReportLangContext for bidirectional sync with Report screen
  const [aiFillHighlightDuration, setAiFillHighlightDurationState] = useState<1000 | 2000 | 5000>(2000);

  useEffect(() => {
    AsyncStorage.getItem(AI_FILL_HIGHLIGHT_DURATION_KEY)
      .then((v) => {
        const n = Number(v);
        if (n === 1000 || n === 2000 || n === 5000) setAiFillHighlightDurationState(n);
      })
      .catch(() => {});
   
  }, []);

  function setAiFillHighlightDuration(ms: 1000 | 2000 | 5000) {
    setAiFillHighlightDurationState(ms);
    safeSetItem(AI_FILL_HIGHLIGHT_DURATION_KEY, String(ms)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }// ── Personal Narrative auto-range window ─────────────────────────────────
  // Options: 5 min (300000), 15 min (900000), 30 min (1800000), Off (0)
  type AutoRangeWindow = 300_000 | 900_000 | 1_800_000 | 0;
  const [narrativeAutoRangeWindow, setNarrativeAutoRangeWindowState] = useState<AutoRangeWindow>(900_000);

  useEffect(() => {
    AsyncStorage.getItem(NARRATIVE_AUTO_RANGE_WINDOW_KEY)
      .then((v) => {
        const n = Number(v);
        if (n === 300_000 || n === 900_000 || n === 1_800_000 || n === AUTO_RANGE_OFF) {
          setNarrativeAutoRangeWindowState(n as AutoRangeWindow);
        }
      })
      .catch(() => {});
   
  }, []);

  function setNarrativeAutoRangeWindow(ms: AutoRangeWindow) {
    setNarrativeAutoRangeWindowState(ms);
    safeSetItem(NARRATIVE_AUTO_RANGE_WINDOW_KEY, String(ms)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // ── Protocol history ─────────────────────────────────────────────────────
  const [dietHistory, setDietHistory] = useState<{ dietType: string; label: string; emoji: string; changedAt: string; note?: string }[]>([]);
  const [showDietHistory, setShowDietHistory] = useState(false);
  const [showDietInfo, setShowDietInfo] = useState<string | null>(null);

  // ── Glucose shortcut chip on streak banner ──────────────────────────────
  const GLUCOSE_CHIP_KEY = '@vitalsync/glucose_chip_enabled';
  const [glucoseChipEnabled, setGlucoseChipEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GLUCOSE_CHIP_KEY).then(v => { if (v !== null) setGlucoseChipEnabled(v === 'true'); }).catch(() => {});
  }, []);

  async function handleGlucoseChipToggle(enabled: boolean) {
    setGlucoseChipEnabled(enabled);
    await safeSetItem(GLUCOSE_CHIP_KEY, String(enabled)).catch(() => {});
    // Auto-suggest AC mode on first enable: if mode is still 'custom' (the default),
    // switch to 'ac' (most clinically relevant for diabetic users) and schedule notifications
    if (enabled && glucoseReminderMode === 'custom') {
      setGlucoseReminderMode('ac');
      await safeSetItem(GLUCOSE_REMINDER_MODE_KEY, 'ac').catch(() => {});
      if (sugarNotifEnabled) {
        scheduleGlucoseNotifications('ac').catch(() => {});
      }
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // ── Readiness score notification ─────────────────────────────────────────
  const READINESS_NOTIF_KEY = '@vitalsync/readiness_notif_enabled';
  const READINESS_NOTIF_TIME_KEY = '@vitalsync/readiness_notif_time';
  const [readinessNotifEnabled, setReadinessNotifEnabled] = useState(false);
  const [readinessNotifTime, setReadinessNotifTime] = useState('08:00');

  useEffect(() => {
    AsyncStorage.getItem(READINESS_NOTIF_KEY).then(v => { if (v) setReadinessNotifEnabled(v === 'true'); }).catch(() => {});
    AsyncStorage.getItem(READINESS_NOTIF_TIME_KEY).then(v => { if (v) setReadinessNotifTime(v); }).catch(() => {});
  }, []);

  async function handleReadinessNotifToggle(enabled: boolean) {
    setReadinessNotifEnabled(enabled);
    await safeSetItem(READINESS_NOTIF_KEY, String(enabled)).catch(() => {});
    if (!enabled) {
      await cancelReadinessNotification();
      return;
    }
    // Load latest readiness snapshot and reschedule with real score if available
    const [hStr, mStr] = readinessNotifTime.split(':');
    const hour = parseInt(hStr ?? '8', 10);
    const minute = parseInt(mStr ?? '0', 10);
    const history = await loadReadinessHistory(1);
    const latest = history[0];
    if (latest) {
      // Build a minimal ReadinessComponents from the snapshot
      const components = {
        total: latest.total,
        sleepDuration: latest.sleepDuration,
        sleepEfficiency: latest.sleepEfficiency,
        restingHR: latest.restingHR,
        hrv: latest.hrv,
        spo2: latest.spo2,
        bp: latest.bp,
        hasData: true,
      };
      await scheduleReadinessNotificationWithScore(components, hour, minute);
    } else {
      // No data yet — schedule generic notification
      const Notifications = await getNotificationsAsync(); if (!Notifications) return;
      await scheduleNotification({
          // identifier: 'readiness-daily-score',
        content: {
          title: '🩺 Daily Readiness Check',
          body: 'Open VitalSync to see your readiness score for today.',
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      }).catch(() => {});
    }
  }

  async function handleReadinessNotifTimeChange(time: string) {
    setReadinessNotifTime(time);
    await safeSetItem(READINESS_NOTIF_TIME_KEY, time).catch(() => {});
    if (readinessNotifEnabled) {
      await handleReadinessNotifToggle(true);
    }
  }

  useEffect(() => {
    AsyncStorage.getItem('@vitalsync/diet_type_history').then((v) => {
      if (v) { try { setDietHistory(JSON.parse(v)); } catch (_unused) { /* ignore */ } }
    });
  }, [dietType]);
  const _permissionsGranted = state.permissionsGranted;
  const { store: dsStore, toggleAutoSync } = useDataSources();
  const autoSync = dsStore.autoSyncOnLaunch;
  const { hours: staleThresholdHours, update: updateStaleThreshold } = useStaleThreshold();
  // BLE removed — Apple Health integration only
  const [notifications, setNotifications] = useState(false);
  const [labRemindersEnabled, setLabRemindersEnabledState] = useState(true);

  // ─── Missed-dose follow-up snooze delay preference ─────────────────────────
  const SNOOZE_DELAY_KEY = '@vitalsync/missed_dose_snooze_delay_mins';
  const SNOOZE_DELAY_OPTIONS: readonly { labelKey: 'snoozeDelay15min' | 'snoozeDelay30min' | 'snoozeDelay1hour'; value: 15 | 30 | 60 }[] = [
    { labelKey: 'snoozeDelay15min', value: 15 },
    { labelKey: 'snoozeDelay30min', value: 30 },
    { labelKey: 'snoozeDelay1hour', value: 60 },
  ] as const;
  const [snoozeDelayMins, setSnoozeDelayMinsState] = useState<15 | 30 | 60>(30);
  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_DELAY_KEY)
      .then(v => {
        const parsed = Number(v);
        if (parsed === 15 || parsed === 30 || parsed === 60) setSnoozeDelayMinsState(parsed);
      })
      .catch(() => {});
   
  }, []);
  const setSnoozeDelayMins = async (mins: 15 | 30 | 60) => {
    setSnoozeDelayMinsState(mins);
    await safeSetItem(SNOOZE_DELAY_KEY, String(mins)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Auto-miss grace period ───────────────────────────────────────────────
  const GRACE_PERIOD_KEY = '@med_auto_miss_grace_hours';
  const [gracePeriodHours, setGracePeriodHoursState] = useState<0 | 1 | 2 | 4>(2);
  useEffect(() => {
    AsyncStorage.getItem(GRACE_PERIOD_KEY)
      .then(v => {
        const parsed = Number(v);
        if ([0, 1, 2, 4].includes(parsed)) setGracePeriodHoursState(parsed as 0 | 1 | 2 | 4);
      })
      .catch(() => {});
   
  }, []);
  const handleGracePeriodChange = async (h: 0 | 1 | 2 | 4) => {
    setGracePeriodHoursState(h);
    await safeSetItem(GRACE_PERIOD_KEY, String(h)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Low-stock threshold ──────────────────────────────────────────────────
  const LOW_STOCK_THRESHOLD_SETTINGS_KEY = '@vsht:low_stock_threshold_v1';
  const LOW_STOCK_OPTIONS: readonly { label: string; value: number }[] = [
    { label: '3 pills', value: 3 },
    { label: '5 pills', value: 5 },
    { label: '7 pills', value: 7 },
    { label: '14 pills', value: 14 },
    { label: '30 pills', value: 30 },
  ] as const;
  const [lowStockThresholdSetting, setLowStockThresholdSettingState] = useState<number>(7);
  useEffect(() => {
    AsyncStorage.getItem(LOW_STOCK_THRESHOLD_SETTINGS_KEY)
      .then(v => {
        const parsed = Number(v);
        if (!isNaN(parsed) && parsed >= 1) setLowStockThresholdSettingState(parsed);
      })
      .catch(() => {});
   
  }, []);
  const handleLowStockThresholdChange = async (pills: number) => {
    setLowStockThresholdSettingState(pills);
    await safeSetItem(LOW_STOCK_THRESHOLD_SETTINGS_KEY, String(pills)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Insight Cooldown Duration ────────────────────────────────────────────────
  const INSIGHT_COOLDOWN_OPTIONS: readonly { label: string; value: number }[] = [
    { label: '1h',  value: 1  * 60 * 60 * 1000 },
    { label: '6h',  value: 6  * 60 * 60 * 1000 },
    { label: '12h', value: 12 * 60 * 60 * 1000 },
    { label: '24h', value: 24 * 60 * 60 * 1000 },
    { label: '48h', value: 48 * 60 * 60 * 1000 },
  ] as const;
  const [insightCooldownMs, setInsightCooldownMsState] = useState<number>(60 * 60 * 1000);
  useEffect(() => {
    getInsightCooldownMs().then(ms => setInsightCooldownMsState(ms)).catch(() => {});
   
  }, []);
  const handleInsightCooldownChange = async (ms: number) => {
    setInsightCooldownMsState(ms);
    await setInsightCooldownMs(ms).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const handleClearInsightHistory = async () => {
    await clearAllInsightCooldowns().catch(() => {});
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ─── Per-metric cooldown overrides ───────────────────────────────────────────
  const METRIC_COOLDOWN_LABELS: Record<InsightMetricKey, string> = {
    systolic: 'Blood Pressure',
    bpm: 'Heart Rate',
    spo2: 'SpO₂',
    sleepHrs: 'Sleep',
    hrv: 'HRV',
    weight: 'Weight',
    steps: 'Steps',
    glucose: 'Glucose',
  };
  const METRIC_COOLDOWN_ICONS: Record<InsightMetricKey, string> = {
    systolic: '♥️', bpm: '❤️', spo2: '💊', sleepHrs: '🛌',
    hrv: '📊', weight: '⚖️', steps: '🚶', glucose: '🩸',
  };
  const METRIC_KEYS: InsightMetricKey[] = ['systolic', 'bpm', 'spo2', 'sleepHrs', 'hrv', 'weight', 'steps', 'glucose'];
  const [metricCooldowns, setMetricCooldownsState] = useState<Partial<Record<InsightMetricKey, number>>>({});
  useEffect(() => {
    getAllMetricCooldowns().then(m => setMetricCooldownsState(m)).catch(() => {});
   
  }, []);
  const handleMetricCooldownChange = async (metric: InsightMetricKey, ms: number | null) => {
    setMetricCooldownsState(prev => {
      const next = { ...prev };
      if (ms === null) delete next[metric]; else next[metric] = ms;
      return next;
    });
    await setMetricCooldownMs(metric, ms).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  // Collapsed by default — persisted to AsyncStorage so the user's preference survives restarts
  const METRIC_COOLDOWN_EXPANDED_KEY = '@vsht:settings_metric_cooldown_expanded';
  const [metricCooldownExpanded, setMetricCooldownExpandedState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(METRIC_COOLDOWN_EXPANDED_KEY)
      .then(v => { if (v === 'true') setMetricCooldownExpandedState(true); })
      .catch(() => {});
   
  }, []);
  const setMetricCooldownExpanded = (updater: boolean | ((prev: boolean) => boolean)) => {
    setMetricCooldownExpandedState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(METRIC_COOLDOWN_EXPANDED_KEY, String(next)).catch(() => {});
      return next;
    });
  };

  // ─── Notification permission status ────────────────────────────────────────────
  // Shows a banner in the Notifications section when the user has denied
  // push notifications at the OS level, with a deep-link to App Settings.
  const [notifPermDenied, setNotifPermDenied] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    getNotificationsAsync().then(Notifications => {
      if (!Notifications) return;
      Notifications.getPermissionsAsync().then(({ status }) => {
        setNotifPermDenied(status === 'denied');
      }).catch(() => {});
    }).catch(() => {});
  }, []);
  // Animated opacity for cardSubtitle fade transition
  const subtitleOpacity = useRef(new Animated.Value(1)).current;

  // Load lab reminders enabled state on mount
  useEffect(() => {
    getLabRemindersEnabled().then(setLabRemindersEnabledState).catch(() => {});
  }, []);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentVersion, setConsentVersion] = useState(0);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [hasNewUpdate, setHasNewUpdate] = useState(false);

  // Load unread alert count on mount so the Mark All Read button knows whether to show
  useEffect(() => {
    getUnreadAlertCount().then(setUnreadAlertCount).catch(() => {});
  }, []);

  // Auto-clear the threshold + analyte alert badge whenever the Settings tab is focused.
  // Crash log count is intentionally kept until the user explicitly clears logs.
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        clearUnreadAlertCount(),
        clearAnalyteAlertBadge(),
      ]).then(() => {
        setUnreadAlertCount(0);
      }).catch(() => {});
    }, [])
  );

  // Check if there is an unseen What's New version
  useEffect(() => {
    AsyncStorage.getItem(WHATS_NEW_SEEN_KEY)
      .then((seen) => setHasNewUpdate(seen !== LATEST_WHATS_NEW_VERSION))
      .catch(() => setHasNewUpdate(true));
  }, []);
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [previewPickerVisible, setPreviewPickerVisible] = useState(false);
  const [activePreviewing, setActivePreviewing] = useState<string | null>(() => getPreviewLang());
  const [goalsSheetVisible, setGoalsSheetVisible] = useState(false);
  const [keyRotationSheetVisible, setKeyRotationSheetVisible] = useState(false);
  const { goals: macroGoals, saveGoals: saveMacroGoals } = useMacroGoals();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [calorieGoalInput, setCalorieGoalInput] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [calorieGoalEditing, setCalorieGoalEditing] = useState(false);
  const [macroSheetVisible, setMacroSheetVisible] = useState(false);
  const [macroInputs, setMacroInputs] = useState({ calories: '2000', carbs: '250', protein: '50', fat: '65' });
  const { preset: customPreset, save: saveCustomPreset } = useCustomPreset();
  const [customPresetNameEditing, setCustomPresetNameEditing] = useState(false);
  const [customPresetNameInput, setCustomPresetNameInput] = useState('');
  const { enabled: celebrationSoundsEnabled, toggle: toggleCelebrationSounds } = useCelebrationSounds();

  // Sync macroInputs when sheet opens
  const openMacroSheet = () => {
    setMacroInputs({
      calories: String(macroGoals.calories),
      carbs: String(macroGoals.carbs),
      protein: String(macroGoals.protein),
      fat: String(macroGoals.fat),
    });
    setMacroSheetVisible(true);
  };
  const { budgetG: sugarBudgetG, setBudgetG: setSugarBudgetG } = useSugarBudget();
  const [sugarBudgetInput, setSugarBudgetInput] = useState('');
  const [sugarBudgetEditing, setSugarBudgetEditing] = useState(false);
  const { target: hrvTarget, setTarget: setHrvTarget } = useHrvTarget();
  const [hrvTargetInput, setHrvTargetInput] = useState('');
  const [hrvTargetEditing, setHrvTargetEditing] = useState(false);

  // ── Weight goal state ───────────────────────────────────────────────────────
  const { goal: weightGoal, setGoal: setWeightGoal } = useWeightGoal();
  const [weightGoalInput, setWeightGoalInput] = useState('');
  const [weightGoalEditing, setWeightGoalEditing] = useState(false);
  // ── Sleep goal state ────────────────────────────────────────────────────────
  const { goal: sleepGoal, setGoal: setSleepGoal } = useSleepGoal();
  const [sleepGoalInput, setSleepGoalInput] = useState('');
  const [sleepGoalEditing, setSleepGoalEditing] = useState(false);
  // Unit-aware helpers: goal is stored in lbs; convert for display/input
  const { weightUnit, tempUnit: unitPrefTemp, glucoseUnit: unitPrefGlucose, distanceUnit: unitPrefDistance, heightUnit: unitPrefHeight } = useUnitPreferences();
  // Local state for the unit picker in Settings (mirrors AsyncStorage)
  const [unitWeight,   setUnitWeight]   = useState<WeightUnit>(weightUnit);
  const [unitTemp,     setUnitTemp]     = useState<TempUnit>(unitPrefTemp);
  const [unitGlucose,  setUnitGlucose]  = useState<GlucoseUnit>(unitPrefGlucose);
  const [unitDistance, setUnitDistance] = useState<DistanceUnit>(unitPrefDistance);
  const [unitHeight,   setUnitHeight]   = useState<HeightUnit>(unitPrefHeight);
  // Sync local state when hook loads from AsyncStorage
  React.useEffect(() => {
    setUnitWeight(weightUnit);
    setUnitTemp(unitPrefTemp);
    setUnitGlucose(unitPrefGlucose);
    setUnitDistance(unitPrefDistance);
    setUnitHeight(unitPrefHeight);
  }, [weightUnit, unitPrefTemp, unitPrefGlucose, unitPrefDistance, unitPrefHeight]);
  async function handleUnitChange<T extends string>(key: keyof import('@/hooks/use-unit-preferences').UnitPreferences, value: T, setter: (v: T) => void, toastMsg?: string, prevValue?: string) {
    appendConfigAuditEntry({ event: 'unit_preference_changed', from: prevValue ?? key, to: value, note: `${key} changed to ${value}` });
    setter(value);
    await saveUnitPreferences({ [key]: value } as any);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (toastMsg) showHealthKitToast(toastMsg);
  }
  // Flash animation shared values for preset buttons
  const flashImperial = useSharedValue(0);
  const flashInternational = useSharedValue(0);
  const flashImperialStyle = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ scale: 1 + flashImperial.value * 0.03 }],
    borderColor: flashImperial.value > 0 ? `rgba(14,165,233,${0.5 + flashImperial.value * 0.5})` : undefined,
  }));
  const flashInternationalStyle = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ scale: 1 + flashInternational.value * 0.03 }],
    borderColor: flashInternational.value > 0 ? `rgba(34,197,94,${0.5 + flashInternational.value * 0.5})` : undefined,
  }));
  const isWeightKg = unitWeight === 'kg';
  const weightGoalDisplay = weightGoal !== null
    ? (isWeightKg ? parseFloat((weightGoal / 2.20462).toFixed(1)) : weightGoal)
    : null;
  const weightGoalUnitLabel = isWeightKg ? 'kg' : 'lbs';

  // ── Sugar notification state ────────────────────────────────────────────────
  const SUGAR_NOTIF_ENABLED_KEY = '@vitalsync/sugar_notif_enabled';
  const SUGAR_NOTIF_TIME_KEY = '@vitalsync/sugar_notif_time';
  const GLUCOSE_REMINDER_MODE_KEY = '@vitalsync/glucose_reminder_mode';
  const [sugarNotifEnabled, setSugarNotifEnabled] = useState(false);
  const [sugarNotifTime, setSugarNotifTime] = useState('20:00');
  const [glucoseReminderMode, setGlucoseReminderMode] = useState<GlucoseReminderMode>('custom');
  // Per-slot AC time overrides: [breakfast, lunch, dinner] as [hour, minute] pairs
  const [acSlotTimes, setAcSlotTimes] = useState<AcSlotTimes>(AC_DEFAULT_SLOTS);
  // Text input values for each AC slot (HH:MM strings)
  const [acSlotInputs, setAcSlotInputs] = useState<[string, string, string]>(['07:30', '12:00', '18:00']);

  useEffect(() => {
    AsyncStorage.getItem(SUGAR_NOTIF_ENABLED_KEY).then(v => { if (v) setSugarNotifEnabled(v === 'true'); }).catch(() => {});
    AsyncStorage.getItem(SUGAR_NOTIF_TIME_KEY).then(v => { if (v) setSugarNotifTime(v); }).catch(() => {});
    AsyncStorage.getItem(GLUCOSE_REMINDER_MODE_KEY).then(v => {
      if (v === 'ac' || v === 'pc' || v === 'hs' || v === '6h' || v === 'custom') setGlucoseReminderMode(v as GlucoseReminderMode);
    }).catch(() => {});
    // Load persisted AC slot times
    AsyncStorage.getItem(AC_SLOT_TIMES_KEY).then(v => {
      if (v) {
        try {
          const parsed = JSON.parse(v) as AcSlotTimes;
          if (Array.isArray(parsed) && parsed.length === 3) {
            setAcSlotTimes(parsed);
            setAcSlotInputs(parsed.map(([h, m]) =>
              `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            ) as [string, string, string]);
          }
        } catch {}
      }
    }).catch(() => {});
  }, []);

  async function handleSugarNotifToggle(enabled: boolean) {
    setSugarNotifEnabled(enabled);
    await safeSetItem(SUGAR_NOTIF_ENABLED_KEY, String(enabled)).catch(() => {});
    if (!enabled) {
      await cancelGlucoseNotifications();
      return;
    }
    // Schedule using the currently selected mode
    if (glucoseReminderMode === 'custom') {
      const [hStr, mStr] = sugarNotifTime.split(':');
      const hour = parseInt(hStr ?? '20', 10);
      const minute = parseInt(mStr ?? '0', 10);
      await scheduleGlucoseNotifications('custom', hour, minute);
    } else if (glucoseReminderMode === 'ac') {
      await scheduleGlucoseNotifications('ac', 20, 0, acSlotTimes);
    } else {
      await scheduleGlucoseNotifications(glucoseReminderMode);
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleGlucoseReminderModeChange(mode: GlucoseReminderMode) {
    setGlucoseReminderMode(mode);
    await safeSetItem(GLUCOSE_REMINDER_MODE_KEY, mode).catch(() => {});
    if (sugarNotifEnabled) {
      if (mode === 'custom') {
        const [hStr, mStr] = sugarNotifTime.split(':');
        const hour = parseInt(hStr ?? '20', 10);
        const minute = parseInt(mStr ?? '0', 10);
        await scheduleGlucoseNotifications('custom', hour, minute);
      } else if (mode === 'ac') {
        await scheduleGlucoseNotifications('ac', 20, 0, acSlotTimes);
      } else {
        await scheduleGlucoseNotifications(mode);
      }
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Handle a change to one of the 3 AC slot times.
   * @param slotIdx  0 = breakfast, 1 = lunch, 2 = dinner
   * @param time     HH:MM string
   */
  async function handleAcSlotTimeChange(slotIdx: 0 | 1 | 2, time: string) {
    const parts = time.split(':');
    const hour = Math.min(23, Math.max(0, parseInt(parts[0] ?? '0', 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(parts[1] ?? '0', 10) || 0));
    const newSlots: AcSlotTimes = [...acSlotTimes] as AcSlotTimes;
    newSlots[slotIdx] = [hour, minute];
    setAcSlotTimes(newSlots);
    const newInputs: [string, string, string] = [...acSlotInputs] as [string, string, string];
    newInputs[slotIdx] = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    setAcSlotInputs(newInputs);
    await safeSetItem(AC_SLOT_TIMES_KEY, JSON.stringify(newSlots)).catch(() => {});
    if (sugarNotifEnabled && glucoseReminderMode === 'ac') {
      await scheduleGlucoseNotifications('ac', 20, 0, newSlots);
    }
  }

  async function handleSugarNotifTimeChange(time: string) {
    setSugarNotifTime(time);
    await safeSetItem(SUGAR_NOTIF_TIME_KEY, time).catch(() => {});
    if (sugarNotifEnabled && glucoseReminderMode === 'custom') {
      const [hStr, mStr] = time.split(':');
      const hour = parseInt(hStr ?? '20', 10);
      const minute = parseInt(mStr ?? '0', 10);
      await scheduleGlucoseNotifications('custom', hour, minute);
    }
  }

  // ── Bedtime reminder state ─────────────────────────────────────────────────
  const [bedtimeReminder, setBedtimeReminder] = useState<BedtimeReminderSettings>({
    enabled: false,
    hour: 22,
    minute: 0,
  });

  useEffect(() => {
    loadBedtimeReminderSettings().then((saved) => {
      // Smart pre-fill: if the user has never saved a reminder time (still at default 22:00),
      // compute their average bedtime from the last 7 nights and use that instead.
      const isDefaultTime = saved.hour === 22 && saved.minute === 0;
      if (isDefaultTime) {
        const sleepRecords = state.data?.sleep ?? [];
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recent = sleepRecords
          .filter((r) => r.bedtime && new Date(r.bedtime).getTime() >= sevenDaysAgo);
        if (recent.length >= 2) {
          // Average bedtime in minutes from midnight (post-midnight normalized)
          const bedtimeMins = recent.map((r) => {
            const d = new Date(r.bedtime!);
            let m = d.getHours() * 60 + d.getMinutes();
            if (m <= 4 * 60) m += 24 * 60; // post-midnight normalize
            return m;
          });
          const avgMins = Math.round(bedtimeMins.reduce((a, b) => a + b, 0) / bedtimeMins.length);
          // Convert back to 0-23 hour range
          const normMins = avgMins % (24 * 60);
          const smartHour = Math.floor(normMins / 60);
          const smartMinute = normMins % 60;
          setBedtimeReminder({ ...saved, hour: smartHour, minute: smartMinute });
          return;
        }
      }
      setBedtimeReminder(saved);
    }).catch(() => {});
  }, [state.data]);

  async function handleBedtimeReminderToggle(enabled: boolean) {
    const next = { ...bedtimeReminder, enabled };
    setBedtimeReminder(next);
    await saveBedtimeReminderSettings(next);
    await applyBedtimeReminder(next);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (enabled) showHealthKitToast(`Bedtime reminder set for ${formatReminderTime(next.hour, next.minute)}`);
  }

  async function handleBedtimeReminderTimeChange(hour: number, minute: number) {
    const next = { ...bedtimeReminder, hour, minute };
    setBedtimeReminder(next);
    await saveBedtimeReminderSettings(next);
    if (next.enabled) await applyBedtimeReminder(next);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // ── HRV target alert toggle ─────────────────────────────────────────────────
  const [hrvAlertEnabled, setHrvAlertEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(HRV_TARGET_ALERT_ENABLED_KEY)
      .then(v => { if (v !== null) setHrvAlertEnabled(v === 'true'); })
      .catch(() => {});
  }, []);

  async function handleHrvAlertToggle(enabled: boolean) {
    setHrvAlertEnabled(enabled);
    await safeSetItem(HRV_TARGET_ALERT_ENABLED_KEY, String(enabled)).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const [crashLogCount, setCrashLogCount] = useState(0);
  const [storageHealth, setStorageHealth] = useState<StorageHealthSummary | null>(null);
  const [retentionMonths, setRetentionMonths] = useState<RetentionMonths>(12);
  const [crashLogVisible, setCrashLogVisible] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const promptClearAfterShare = () => {
    Alert.alert(
      'Clear Logs?',
      'Clear logs now that they\'ve been shared?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearCrashLogs();
            setCrashLogCount(0);
          },
        },
      ]
    );
  };
  const auth = useAuth();
  const _biometricLabel = auth.biometricType === 'face' ? 'Face ID' : auth.biometricType === 'fingerprint' ? 'Touch ID' : 'Biometrics';

  // ── Load consent state ────────────────────────────────────────────────────
  const loadConsentState = React.useCallback(async () => {
    try {
      const accepted = await hasAcceptedCurrentConsent();
      setConsentAccepted(accepted);
      // Read the raw stored version for display
      const raw = await AsyncStorage.getItem('@vsht:consent_accepted').catch(() => null);
      if (raw !== null) {
        const v = raw === 'true' ? 1 : parseInt(raw, 10);
        setConsentVersion(isNaN(v) ? 0 : v);
      } else {
        setConsentVersion(0);
      }
    } catch (_unused) {
      setConsentAccepted(false);
    }
  }, []);
  useEffect(() => { loadConsentState(); }, [loadConsentState]);

  // Last background sync row removed — user controls sync manually

  // ── Load crash log count ──────────────────────────────────────────────────
  const loadCrashLogCount = React.useCallback(() => {
    readCrashLogs().then((logs) => setCrashLogCount(logs.length)).catch(() => {});
  }, []);
  useEffect(() => { loadCrashLogCount(); }, [loadCrashLogCount]);

  // ── Load storage health summary ──────────────────────────────────────────────
  const loadStorageHealth = React.useCallback(() => {
    getStorageHealthSummary().then(setStorageHealth).catch(() => {});
  }, []);
  useEffect(() => { loadStorageHealth(); }, [loadStorageHealth]);
  // ── Load retention months preference ─────────────────────────────────────
  useEffect(() => {
    loadRetentionMonths().then(setRetentionMonths).catch(() => {});
  }, []);
  // ── AppState listener: refresh HealthKit permissions when user returns from Settings ──
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      // Detect transition from background/inactive → active (i.e. user returned from Settings)
      if (
        (appStateRef.current === 'background' || appStateRef.current === 'inactive') &&
        nextState === 'active'
      ) {
        // Re-run the permissions check so the badge and Re-connect button update automatically
        // Use recheckPermissions (read-only) NOT requestPermissions — calling
        // requestPermissions() here triggers initAppleHealthKit() + enableAllBackgroundDelivery()
        // while the iOS sheet is still animating, causing a SIGSEGV crash on iOS 26.x.
        recheckPermissions().catch(() => {});
        // Refresh consent state (user may have accepted/revoked from the Consent screen)
        loadConsentState();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [recheckPermissions, loadConsentState]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleRequestPermissions() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Health permissions are only available on iPhone and iPad.');
      return;
    }


    // Request permissions directly — iOS will show the system permission sheet
    // for any types not yet determined. For types already denied, the user must
    // go to iOS Settings manually; we open app-settings: only after the request
    // completes and access is still not granted.
    try {
      const granted = await requestHealthPermissions();
      if (granted) {
        // Success — context will update permissionsGranted automatically
        if ((Platform.OS as string) !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        showHealthKitToast('Apple Health connected ✓');
      } else {
        // Still not granted — try to open directly to the Health privacy page
        // (iOS 16+: App-prefs:Privacy&path=HEALTH), then fall back to the
        // generic app settings pane, then show a manual instruction alert.
        const healthPrivacyUrl = 'App-prefs:Privacy&path=HEALTH';
        const appSettingsUrl = 'app-settings:';
        const canOpenHealth = await Linking.canOpenURL(healthPrivacyUrl).catch(() => false);
        if (canOpenHealth) {
          await Linking.openURL(healthPrivacyUrl);
        } else {
          const canOpenSettings = await Linking.canOpenURL(appSettingsUrl).catch(() => false);
          if (canOpenSettings) {
            await Linking.openURL(appSettingsUrl);
          } else {
            Alert.alert(
              'Enable in Settings',
              'Go to Settings → Privacy & Security → Health → VitalSync and enable all permissions.',
              [{ text: 'OK' }]
            );
          }
        }
      }
    } catch (e) {
      // If we're in Expo Go or the native module is absent, show a helpful message
      // rather than a generic error. The native HealthKit module is only available
      // in a production or development build (EAS Build), not in Expo Go.
      const msg = e instanceof Error ? e.message : String(e);
      const isExpoGo = msg.includes('NativeModules') || msg.includes('native module') ||
        msg.includes('ReactNativeHealthkit') || msg.includes('AppleHealthKit') ||
        msg.includes('is not a function') || msg.includes('undefined is not');
      if (isExpoGo) {
        Alert.alert(
          'Build Required',
          'Health permissions require a development or production build. They are not available in Expo Go.\n\nScan the QR code with a custom dev build to enable HealthKit.',
          [{ text: 'OK' }]
        );
      } else {
        // Genuine error — log it and show a retry prompt
        console.warn('[VitalSync] Permission request error:', e);
        Alert.alert(
          'Permission Error',
          'Could not request health permissions. Please close the app, reopen it, and try again.\n\nIf the problem persists, go to Settings → Privacy & Security → Health → VitalSync.',
          [{ text: 'OK' }]
        );
      }
    }
  }

  function handleResetLayout() {
    Alert.alert(
      'Reset Dashboard Layout',
      'This will collapse the Carbohydrate Quality Index and Protein Bio-Availability cards and restore the Best Day callout for all windows. Your health data is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                '@ebp_cqi_collapsed',
                '@ebp_protein_collapsed',
                '@neovital:bestday_dismissed_v1',
              ]);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              Alert.alert('Layout Reset', 'Dashboard layout has been restored to defaults.');
            } catch (_unused) {
              Alert.alert('Error', 'Failed to reset layout.');
            }
          },
        },
      ]
    );
  }

  function handleClearData() {
    Alert.alert(
      t.clearVitalSignsData,
      t.clearVitalSignsDataConfirm,
      [
        { text: t.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: t.clearVitalSignsDataConfirmBtn ?? 'Clear Vital Signs',
          style: 'destructive',
          onPress: () => {
            // Second confirmation: cannot be undone
            Alert.alert(
              t.clearVitalSignsDataTitle2 ?? 'Are you sure?',
              t.clearVitalSignsDataConfirm2 ?? 'This action cannot be undone.',
              [
                { text: t.cancel ?? 'Cancel', style: 'cancel' },
                {
                  text: t.clearVitalSignsDataConfirmBtn2 ?? 'Delete Vital Signs Data',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const result = await clearVitalSignsData();
                      // Record audit log event
                      appendConfigAuditEntry({
                        event: 'vital_signs_data_cleared',
                        note: `Vital signs data cleared from Settings. Keys removed: ${result.removed}. Errors: ${result.errors.length}`,
                      }).catch(() => {});
                      if (Platform.OS !== 'web') {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }
                      Alert.alert(
                        t.clearVitalSignsDone ?? 'Done',
                        t.clearVitalSignsDoneMsg ?? 'Vital signs data has been cleared. Your settings, reminders, language, and preferences are unchanged.',
                      );
                    } catch (_e) {
                      Alert.alert('Error', 'Failed to clear vital signs data. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  function SettingsRow({
    icon,
    label,
    subtitle,
    onPress,
    onLongPress,
    rightElement,
    iconColor,
    destructive,
    disabled,
    badge: _badge,
  }: {
    icon: string;
    label: string;
    subtitle?: string;
    onPress?: () => void;
    onLongPress?: () => void;
    rightElement?: React.ReactNode;
    iconColor?: string;
    destructive?: boolean;
    disabled?: boolean;
    badge?: string;
  }) {
    const isDisabled = disabled || (!onPress && !rightElement && !onLongPress);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.settingsRow,
          { borderColor: colors.border, opacity: isDisabled ? 0.45 : pressed && (onPress ?? onLongPress) ? 0.7 : 1 },
        ]}
        onPress={isDisabled ? undefined : onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        disabled={isDisabled}
      >
        <View style={[styles.rowIconWrap, { backgroundColor: (iconColor ?? colors.primary) + '18' }]}>
          <IconSymbol
            name={icon as any}
            size={16}
            color={destructive ? colors.error : (iconColor ?? colors.primary)}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: destructive ? colors.error : colors.foreground }]}>
            {label}
          </Text>
          {subtitle && (
            <Text style={[styles.rowSub, { color: colors.muted }]}>{subtitle}</Text>
          )}
        </View>
        {rightElement ?? (
          onPress && <IconSymbol name="chevron.right" size={14} color={colors.muted} />
        )}
      </Pressable>
    );
  }

  // ── Section header — collapsible with animated chevron, AsyncStorage-persisted ──
  function CollapsibleSection({
    title,
    children,
    badge,
    keywords = [],
    sectionKey,
    defaultExpanded: _defaultExpanded,
    accentColor,
  }: {
    title: string;
    sectionKey?: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    badge?: string;
    keywords?: string[];
    accentColor?: string;
  }) {
    // When search is active, always show matching sections fully expanded
    const isSearching = Boolean(searchLower);
    if (isSearching) {
      const haystack = [title, ...keywords].join(' ').toLowerCase();
      if (!haystack.includes(searchLower)) return null;
    }

    const isExpanded = isSearching
      ? true
      : sectionKey !== undefined
        ? (sectionExpanded[sectionKey] ?? true)
        : true;

    return (
      <>
        {/* Hairline divider above each section */}
        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
        <Pressable
          style={({ pressed }) => [
            styles.sectionHeaderRow,
            { opacity: pressed && !!sectionKey ? 0.7 : 1 },
          ]}
          onPress={sectionKey ? () => toggleSection(sectionKey) : undefined}
          accessibilityRole="button"
          accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${title} section`}
          accessibilityState={{ expanded: isExpanded }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.sectionHeader, { color: accentColor ?? colors.muted }]}>{title.toUpperCase()}</Text>
            {badge !== undefined && (
              <View style={[styles.badge, { backgroundColor: colors.muted + '18', borderColor: colors.muted + '30', marginBottom: 2 }]}>
                <Text style={[styles.badgeText, { color: colors.muted, fontWeight: '600' }]}>{badge}</Text>
              </View>
            )}
          </View>
          {sectionKey && !isSearching && (
            <IconSymbol
              name={isExpanded ? 'chevron.up' : 'chevron.down'}
              size={14}
              color={accentColor ?? colors.muted}
            />
          )}
        </Pressable>
        {isExpanded && children}
      </>
    );
  }

  const lang = useLang();
  const rawLang = useRawLang();
  const t = ((settingsStrings as unknown as Record<string, typeof settingsStrings.en>)[lang] ?? settingsStrings.en);
  const se = (settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[lang] ?? settingsExtStrings.en;

  // ── Subscription plan label (i18n) ───────────────────────────────────────
  const activePlanLabel =
    subActiveProductId === 'vitalsync.healthtracker.premium_annual'
      ? (se.currentPlanAnnual ?? 'VitalSync Premium Annual')
      : subActiveProductId === 'vitalsync.healthtracker.premium_monthly'
      ? (se.currentPlanMonthly ?? 'VitalSync Premium Monthly')
      : (se.currentPlanFree ?? 'Free Plan');

  // ── Restore result feedback ─────────────────────────────────────────────
  useEffect(() => {
    if (subRestoreResult === 'success') {
      Alert.alert(
        se.restorePurchases ?? 'Restore Purchases',
        se.restoreSuccessMsg ?? 'Subscription restored successfully.',
        [{ text: 'OK', onPress: subClearRestoreResult }]
      );
    } else if (subRestoreResult === 'no_subscription') {
      Alert.alert(
        se.restorePurchases ?? 'Restore Purchases',
        se.restoreNoSubMsg ?? 'No active subscription found.',
        [{ text: 'OK', onPress: subClearRestoreResult }]
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subRestoreResult]);
  const dietDesc = useDietDescStrings();
  const isRTL = isRTLLang(rawLang);
  const { isTranslating, clearCache } = useTranslationContext();
  const [translationCacheCount, setTranslationCacheCount] = useState<number>(0);
  // Load the translation cache count on mount and after clearing
  const refreshCacheCount = useCallback(async () => {
    const count = await getTranslationCacheCount();
    setTranslationCacheCount(count);
  }, []);
  useEffect(() => { void refreshCacheCount(); }, [refreshCacheCount]);

  // ─── Auto-miss grace period options (depends on se for i18n) ────────────────
  const GRACE_PERIOD_OPTIONS: readonly { label: string; value: 0 | 1 | 2 | 4 }[] = [
    { label: '1h', value: 1 },
    { label: '2h', value: 2 },
    { label: '4h', value: 4 },
    { label: se.neverLabel ?? 'Never', value: 0 },
  ] as const;

  // Resolve the native name of the current language for the header badge
  const currentLangNative = (() => {
    if (!rawLang || rawLang === 'en') return null; // Don't show badge for English (default)
    const langEntry = SUPPORTED_LANGUAGES.find(o => o.code === rawLang);
    return langEntry?.native ?? rawLang.toUpperCase();
  })();

  const dataStats = state.data ? {
    bp: (state.data.bloodPressure ?? []).length,
    pulse: (state.data.pulse ?? []).length,
    body: (state.data.bodyComposition ?? []).length,
    sleep: (state.data.sleep ?? []).length,
    spo2: (state.data.vitalSigns ?? []).filter(r => (r.spo2 ?? r.oxygenSaturation) != null).length,
    glucose: (state.data.bloodSugar ?? []).length,
  } : null;

  const totalRecords = dataStats
    ? dataStats.bp + dataStats.pulse + dataStats.body + dataStats.sleep + dataStats.spo2 + dataStats.glucose
    : 0;

  // Scroll to appearance section when navigated with ?section=appearance
  useEffect(() => {
    if (sectionParam === 'appearance') {
      // Ensure appearance section is expanded
      setSectionExpanded(prev => ({ ...prev, appearance: true }));
      // Delay scroll to allow layout to settle
      const t = setTimeout(() => {
        appearanceRef.current?.measureLayout(
          scrollViewRef.current as any,
          (_x, y) => { scrollViewRef.current?.scrollTo({ y: y - 16, animated: true }); },
          () => {}
        );
      }, 350);
      return () => clearTimeout(t);
    } else if (sectionParam === 'privacy') {
      // Ensure privacy section is expanded and scroll to it
      setSectionExpanded(prev => ({ ...prev, privacy: true }));
      const t = setTimeout(() => {
        privacyRef.current?.measureLayout(
          scrollViewRef.current as any,
          (_x, y) => { scrollViewRef.current?.scrollTo({ y: y - 16, animated: true }); },
          () => {}
        );
      }, 350);
      return () => clearTimeout(t);
    }
   
  }, [sectionParam]);

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView ref={scrollViewRef} onScroll={handleSettingsScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Wellness disclaimer moved to floating overlay — see below */}
        {/* ─── Header ───────────────────────────────────────────────────────── */}
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Collapse All / Expand All — hidden while search is active */}
            {!searchLower && (
              <Pressable
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  borderWidth: 0.5,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                })}
                onPress={allExpanded ? collapseAll : expandAll}
                accessibilityLabel={allExpanded ? 'Collapse all sections' : 'Expand all sections'}
                accessibilityRole="button"
              >
                <IconSymbol
                  name={allExpanded ? 'chevron.up' : 'chevron.down'}
                  size={11}
                  color={colors.muted}
                />
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted }}>
                  {allExpanded ? (se.collapseAll ?? 'Collapse All') : (se.expandAll ?? 'Expand All')}
                </Text>
              </Pressable>
            )}
            {currentLangNative && (
              <View style={[styles.langBadge, { backgroundColor: '#22C55E22', borderColor: '#22C55E55' }]}>
                <IconSymbol name="globe" size={11} color="#22C55E" />
                <Text style={[styles.langBadgeText, { color: '#22C55E' }]} numberOfLines={1}>
                  {currentLangNative}
                </Text>
                {isTranslating && (
                  <ActivityIndicator size="small" color="#22C55E" style={{ marginLeft: 2 }} />
                )}
              </View>
            )}
          </View>
        </View>
          {/* ─── Search bar ───────────────────────────────────────────── */}
        <View style={[styles.searchBarWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={15} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={se.searchSettings ?? 'Search settings…'}
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              onPress={() => setSearchQuery('')}
            >
              <IconSymbol name="xmark.circle.fill" size={15} color={colors.muted} />
            </Pressable>
          )}
        </View>
        {/* ─── Appearance ────────────────────────────────────────────── */}
        <View ref={appearanceRef}>
        <CollapsibleSection title={se.appearanceSection ?? 'Appearance'} sectionKey="appearance" accentColor="#8B5CF6" keywords={['theme', 'dark mode', 'light mode', 'amoled', 'schedule', 'language', 'locale', 'translation']}>
        <GlassCard
          accentColor="#8B5CF6"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          {/* ── Theme preference chips: Light / Dark / System ── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: colors.sleepPurple + '18' }]}>
                <IconSymbol name="moon.fill" size={16} color={colors.sleepPurple} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.themeLabel ?? 'Theme'}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>
                  {preference === 'system' ? (se.themeFollowsDevice ?? 'Follows device setting') : preference === 'amoled' ? (se.themeAmoledActive ?? 'AMOLED black active') : colorScheme === 'dark' ? (se.themeDarkActive ?? 'Dark theme active') : (se.themeLightActive ?? 'Light theme active')}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 46 }}>
              {(['light', 'dark', 'system'] as const).map((pref) => {
                const meta = { light: { icon: 'sun.max.fill' as const, color: '#F59E0B', label: se.themeLight ?? 'Light' }, dark: { icon: 'moon.fill' as const, color: colors.sleepPurple, label: se.themeDark ?? 'Dark' }, system: { icon: 'iphone' as const, color: '#0EA5E9', label: se.themeSystem ?? 'System' } }[pref];
                const isActive = preference === pref;
                return (
                  <Pressable
                    key={pref}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: 20, borderWidth: 1.5,
                      borderColor: isActive ? meta.color : colors.border,
                      backgroundColor: isActive ? meta.color + '18' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                    onPress={() => {
                      appendConfigAuditEntry({ event: 'app_theme_changed', from: preference, to: pref, note: `Theme changed from ${preference} to ${pref}` });
                      setPreference(pref);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <IconSymbol name={meta.icon} size={13} color={isActive ? meta.color : colors.muted} />
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '400', color: isActive ? meta.color : colors.muted }}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* ── AMOLED pure-black toggle ── */}
          <SettingsRow
            icon="circle.lefthalf.filled"
            iconColor="#9BA1A6"
            label={se.amoledBlack ?? "AMOLED Black"}
            subtitle={isAmoled ? (se.pureBlackOledActive ?? 'Pure-black OLED palette active') : (se.deeperBlacksForOled ?? 'Deeper blacks for OLED screens')}
            rightElement={
              <Switch
                value={preference === 'amoled'}
                onValueChange={(v) => {
                  const next = v ? 'amoled' : 'dark';
                  appendConfigAuditEntry({ event: 'app_theme_changed', from: preference, to: next, note: `AMOLED black ${v ? 'enabled' : 'disabled'}` });
                  setPreference(next);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                trackColor={{ false: colors.border, true: '#9BA1A640' }}
                thumbColor={preference === 'amoled' ? '#9BA1A6' : colors.muted}
              />
            }
          />
          {/* ── Scheduled dark mode ── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' }}>
              <View style={[styles.rowIconWrap, { backgroundColor: '#F59E0B18' }]}>
                <IconSymbol name="moon.stars.fill" size={16} color="#F59E0B" />
              </View>
              <View style={[styles.rowText, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.scheduledDarkMode ?? 'Scheduled Dark Mode'}</Text>
                  {scheduledDark.enabled && (() => {
                    const nowMins   = new Date().getHours() * 60 + new Date().getMinutes();
                    const startMins = scheduledDark.startHour * 60 + scheduledDark.startMin;
                    const endMins   = scheduledDark.endHour   * 60 + scheduledDark.endMin;
                    const isActive  = startMins <= endMins
                      ? nowMins >= startMins && nowMins < endMins
                      : nowMins >= startMins || nowMins < endMins;
                    return isActive ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.3 }}>{se.scheduledDarkModeActive ?? 'Active now'}</Text>
                      </View>
                    ) : null;
                  })()}
                </View>
                <Text style={[styles.rowSub, { color: colors.muted }]}>
                  {scheduledDark.enabled
                    ? `${String(scheduledDark.startHour).padStart(2,'0')}:${String(scheduledDark.startMin).padStart(2,'0')} → ${String(scheduledDark.endHour).padStart(2,'0')}:${String(scheduledDark.endMin).padStart(2,'0')}`
                    : (se.scheduledDarkModeOff ?? 'Auto-switch to dark at set times')}
                </Text>
              </View>
              <Switch
                value={scheduledDark.enabled}
                onValueChange={(v) => {
                  setScheduledDark({ ...scheduledDark, enabled: v });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                trackColor={{ false: colors.border, true: '#F59E0B40' }}
                thumbColor={scheduledDark.enabled ? '#F59E0B' : colors.muted}
              />
            </View>
            {scheduledDark.enabled && (
              <View style={{ paddingLeft: 46, gap: 8, width: '100%' }}>
                {(['start', 'end'] as const).map((bound) => {
                  const hourKey = bound === 'start' ? 'startHour' : 'endHour';
                  const minKey  = bound === 'start' ? 'startMin'  : 'endMin';
                  const hourVal = scheduledDark[hourKey];
                  const minVal  = scheduledDark[minKey];
                  return (
                    <View key={bound} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.muted, width: 40 }}>{bound === 'start' ? (se.scheduledDarkFrom ?? 'From') : (se.scheduledDarkUntil ?? 'Until')}</Text>
                      {([{ val: hourVal, key: hourKey, max: 23, step: 1 }, { val: minVal, key: minKey, max: 59, step: 15 }] as const).map(({ val, key, max, step }, idx) => (
                        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Pressable
                            style={({ pressed }) => [{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                            onPress={() => setScheduledDark({ ...scheduledDark, [key]: (val - step + max + 1) % (max + 1) })}
                          >
                            <IconSymbol name="minus" size={12} color={colors.muted} />
                          </Pressable>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground, width: 28, textAlign: 'center' }}>{String(val).padStart(2, '0')}</Text>
                          <Pressable
                            style={({ pressed }) => [{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                            onPress={() => setScheduledDark({ ...scheduledDark, [key]: (val + step) % (max + 1) })}
                          >
                            <IconSymbol name="plus" size={12} color={colors.muted} />
                          </Pressable>
                          {idx === 0 && <Text style={{ fontSize: 15, fontWeight: '700', color: colors.muted }}>:</Text>}
                        </View>
                      ))}
                    </View>
                  );
                })}
                <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>{se.scheduledDarkOvernightNote ?? 'Overnight ranges supported (e.g. 22:00 → 07:00)'}</Text>
                {/* Reset to Defaults */}
                <Pressable
                  onPress={() => {
                    setScheduledDark({ enabled: true, startHour: 22, startMin: 0, endHour: 7, endMin: 0 });
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start',
                    paddingHorizontal: 14, paddingVertical: 7,
                    borderRadius: 20, borderWidth: 1.5,
                    borderColor: colors.primary + '60',
                    backgroundColor: colors.primary + '12',
                    opacity: pressed ? 0.7 : 1,
                    marginTop: 4,
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>{se.scheduledDarkReset ?? '↺ Reset to 22:00 – 07:00'}</Text>
                </Pressable>
              </View>
            )}
          </View>
          <SettingsRow
            icon="globe"
            iconColor="#22C55E"
            label={t.language}
            subtitle={isTranslating ? '🌐 Translating...' : (SUPPORTED_LANGUAGES.find((o) => o.code === lang)?.native ?? t.languageAuto)}
            onPress={() => router.push('/settings/language' as any)}
            rightElement={<IconSymbol name="chevron.right" size={16} color={colors.muted} />}
          />
          {/* ── Language Preview Mode (QA) ── */}
          <SettingsRow
            icon="eye"
            iconColor="#8B5CF6"
            label={se.langPreviewTitle ?? 'Language Preview'}
            subtitle={
              activePreviewing
                ? `${se.langPreviewActive ?? 'Previewing'}: ${activePreviewing.toUpperCase()} — ${se.langPreviewTapToExit ?? 'Tap to exit'}`
                : se.langPreviewSubtitle ?? 'QA: preview any language without changing your setting'
            }
            onPress={() => setPreviewPickerVisible(true)}
            rightElement={
              activePreviewing ? (
                <Pressable
                  style={{ backgroundColor: colors.error + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                  onPress={() => {
                    setPreviewLang(null);
                    setActivePreviewing(null);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>{se.langPreviewExit ?? 'Exit'}</Text>
                </Pressable>
              ) : (
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              )
            }
          />
          {/* ── Vital Waveform Smoothing ── */}
          <SmoothingStrengthRow />

          {/* ── Smart Scribe highlight duration ── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: '#F59E0B18' }]}>
                <Text style={{ fontSize: 14 }}>✨</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.smartScribeHighlight ?? 'Smart Scribe Highlight Duration'}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>{se.smartScribeHighlightSub ?? 'How long fields flash yellow after Vision Scan auto-fills a form'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 46 }}>
              {([1000, 2000, 5000] as const).map((ms) => {
                const label = ms === 1000 ? '1s' : ms === 2000 ? '2s' : '5s';
                const isActive = aiFillHighlightDuration === ms;
                return (
                  <Pressable
                    key={ms}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16, paddingVertical: 7,
                      borderRadius: 20, borderWidth: 1.5,
                      borderColor: isActive ? '#F59E0B' : colors.border,
                      backgroundColor: isActive ? '#F59E0B18' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                    onPress={() => setAiFillHighlightDuration(ms)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '400', color: isActive ? '#F59E0B' : colors.muted }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Color Code Guide ── */}
          <Pressable
            style={({ pressed }) => [styles.settingsRow, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/settings/color-legend' as any);
            }}
            accessibilityRole="button"
            accessibilityLabel="Color Code Guide"
          >
            <View style={[styles.rowIconWrap, { backgroundColor: '#0D948818' }]}>
              <IconSymbol name="circle.fill" size={16} color="#22C55E" />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.colorCodeGuide ?? 'Color Code Guide'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>{se.colorCodeGuideSub ?? 'What every color means across all tabs and sections'}</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>

          {/* ── Personal Narrative auto-range window ── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: '#8B5CF618' }]}>
                <Text style={{ fontSize: 14 }}>🧠</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.personalNarrativeRange ?? 'Personal Narrative Auto-Range'}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>{se.personalNarrativeRangeSub ?? 'Auto-select Last 1 hr after logging vitals — for how long'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 46, flexWrap: 'wrap' }}>
              {([300_000, 900_000, 1_800_000, 0] as const).map((ms) => {
                const label = ms === 0 ? (se.personalNarrativeOff ?? 'Off') : ms === 300_000 ? (se.personalNarrative5min ?? '5 min') : ms === 900_000 ? (se.personalNarrative15min ?? '15 min') : (se.personalNarrative30min ?? '30 min');
                const isActive = narrativeAutoRangeWindow === ms;
                const activeColor = ms === 0 ? colors.muted : '#8B5CF6';
                return (
                  <Pressable
                    key={ms}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16, paddingVertical: 7,
                      borderRadius: 20, borderWidth: 1.5,
                      borderColor: isActive ? activeColor : colors.border,
                      backgroundColor: isActive ? activeColor + '18' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                    onPress={() => setNarrativeAutoRangeWindow(ms)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '400', color: isActive ? activeColor : colors.muted }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* ── Reset Keyboard Dictation Tip ── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: '#0EA5E918' }]}>
              <Text style={{ fontSize: 14 }}>🎤</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.resetKeyboardTip ?? 'Reset Keyboard Tip'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>{se.resetKeyboardTipSub ?? 'Show the dictation mic tip again on next log screen'}</Text>
            </View>
            <Pressable
              onPress={async () => {
                await AsyncStorage.removeItem(DICTATION_BANNER_KEY);
                setDictationBannerReset(true);
                setTimeout(() => setDictationBannerReset(false), 2000);
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showAppToast('Keyboard tip will show again ✓');
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: 20, borderWidth: 1.5,
                borderColor: dictationBannerReset ? '#22C55E' : colors.primary,
                backgroundColor: dictationBannerReset ? '#22C55E18' : colors.primary + '14',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: dictationBannerReset ? '#22C55E' : colors.primary }}>
                {dictationBannerReset ? (se.resetKeyboardTipDone ?? 'Reset ✓') : (se.resetLabel ?? 'Reset')}
              </Text>
            </Pressable>
          </View>
        </GlassCard>
        {/* ── HR Chart Resolution ── */}
        <GlassCard accentColor="#EF4444" noPadding style={{ marginHorizontal: 16, marginTop: 12 }}>
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: colors.heartRed + '18' }]}>
                <IconSymbol name="waveform.path.ecg" size={16} color={colors.heartRed} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.hrChartResolution ?? 'HR Chart Resolution'}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>
                  {HR_WINDOW_LABELS[hrWindow as HrWindowSize]}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 46 }}>
              {(['1h', '4h', 'daily'] as HrWindowSize[]).map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setHrWindow(w)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: hrWindow === w ? (colors.heartRed + '20') : colors.surface,
                    borderWidth: 1,
                    borderColor: hrWindow === w ? (colors.heartRed + '60') : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: hrWindow === w ? '700' : '400', color: hrWindow === w ? colors.heartRed : colors.muted }}>
                    {w === '1h' ? '1 hr' : w === '4h' ? '4 hr' : 'Daily'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassCard>
        <EvidenceRefBanner
          accentColor="#8B5CF6"
          heading="Circadian & Chronobiology"
          refs={[
            { label: 'Circadian Rhythm & Sleep (NIH)', url: 'https://www.nigms.nih.gov/education/fact-sheets/Pages/circadian-rhythms.aspx', badge: 'NIH' },
            { label: 'Blue Light & Melatonin (PMID 23509952)', url: 'https://pubmed.ncbi.nlm.nih.gov/23509952/', badge: 'PMID' },
          ]}
        />
        </CollapsibleSection>

        <CollapsibleSection title={se.manageSubscription} sectionKey="subscription" accentColor="#6366F1" keywords={['subscription', 'trial', 'premium', 'billing', 'plan', 'upgrade', 'restore']}>
          <GlassCard accentColor="#6366F1" noPadding style={{ marginHorizontal: 16 }}>

            {/* ── Current Plan card ───────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
                {se.subscriptionPlan ?? 'Current Plan'}
              </Text>

              {/* Plan name */}
              {accessState === 'trial_active' ? (
                <Text style={{ fontSize: 17, fontWeight: '700', color: '#6366F1', marginBottom: 4 }}>
                  {(se.freeTrialDays ?? 'Free Trial — {n} day{s} remaining').replace('{n}', String(trialDaysRemaining)).replace('{s}', trialDaysRemaining === 1 ? '' : 's')}
                </Text>
              ) : (
                <Text style={{ fontSize: 17, fontWeight: '700', color: accessState === 'subscribed' ? '#6366F1' : colors.foreground, marginBottom: 4 }}>
                  {activePlanLabel}
                </Text>
              )}

              {/* Status row */}
              {accessState === 'subscribed' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 5 }} />
                  <Text style={{ fontSize: 13, color: '#22C55E', fontWeight: '600' }}>
                    {se.statusActive ?? 'Active'}
                  </Text>
                </View>
              )}
              {accessState === 'expired' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.error, marginRight: 5 }} />
                  <Text style={{ fontSize: 13, color: colors.error, fontWeight: '600' }}>
                    {se.statusExpired ?? 'Expired'}
                  </Text>
                </View>
              )}

              {/* Renewal date */}
              {accessState === 'subscribed' && renewalDateStr && (
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
                  {se.renewsLabel ?? 'Renews'}: {renewalDateStr}
                </Text>
              )}

              {/* Original purchase date */}
              {originalPurchaseDateStr && accessState === 'subscribed' && (
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  {se.purchasedLabel ?? 'Purchased'}: {originalPurchaseDateStr}
                </Text>
              )}

              {/* Auto-renew status */}
              {subAutoRenewEnabled !== null && accessState === 'subscribed' && (
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  {se.autoRenewLabel ?? 'Auto-Renew'}: {subAutoRenewEnabled ? (se.autoRenewOn ?? 'On') : (se.autoRenewOff ?? 'Off')}
                </Text>
              )}

              {/* Free version sub-label */}
              {!isPremium && accessState !== 'trial_active' && (
                <Text style={{ fontSize: 12, color: accessState === 'expired' ? colors.error : colors.muted, marginTop: 4 }}>
                  {accessState === 'expired'
                    ? (t.trialExpiredLabel ?? 'Trial expired — subscribe to restore premium access')
                    : subProductsLoading
                    ? (t.loadingPlansLabel ?? 'Loading plans…')
                    : subHasIntroOffer && subIntroOfferDays
                      ? (t.monthlyYearlySub ?? 'Monthly {monthly}/mo · Yearly {yearly}/yr — includes {days}-day free trial').replace('{monthly}', monthlyPrice).replace('{yearly}', yearlyPrice).replace('{days}', String(subIntroOfferDays))
                      : (t.monthlyYearlySubNoTrial ?? 'Monthly {monthly}/mo · Yearly {yearly}/yr').replace('{monthly}', monthlyPrice).replace('{yearly}', yearlyPrice)}
                </Text>
              )}
            </View>

            {/* ── Upgrade / Start Trial ───────────────────────────────────────────── */}
            {!isPremium && (
              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => paywallGuard.tryPush(() => { router.push('/paywall' as Parameters<typeof router.push>[0]); })}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#6366F1' }}>
                  {accessState === 'expired'
                    ? (t.subscribeNowLabel ?? 'Subscribe Now')
                    : subHasIntroOffer && subIntroOfferDays
                      ? (t.startTrialLabel ?? 'Start {days}-Day Free Trial').replace('{days}', String(subIntroOfferDays))
                      : (t.subscribeToPremium ?? 'Subscribe to Premium')}
                </Text>
                <Text style={{ fontSize: 18, color: '#6366F1' }}>›</Text>
              </TouchableOpacity>
            )}

            {/* ── Open Apple/Google subscription management ───────────────────────── */}
            <TouchableOpacity
              style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('itms-apps://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/manageSubscriptions').catch(() =>
                    Linking.openURL('https://apps.apple.com/account/subscriptions')
                  );
                } else {
                  Linking.openURL('https://play.google.com/store/account/subscriptions');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, color: colors.foreground }}>
                {se.openAppleSubscriptions ?? 'Manage in App Store'}
              </Text>
              <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
            </TouchableOpacity>

            {/* ── Restore purchases ─────────────────────────────────────────────────────── */}
            <TouchableOpacity
              style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              onPress={async () => {
                if (!subIsRestoring) {
                  await restoreIAPPurchases();
                }
              }}
              activeOpacity={subIsRestoring ? 1 : 0.7}
              disabled={subIsRestoring}
            >
              {subIsRestoring ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#6366F1" />
                  <Text style={{ fontSize: 15, color: '#6366F1' }}>
                    {se.restoringLabel ?? 'Restoring…'}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 15, color: colors.foreground }}>{se.restorePurchases ?? 'Restore Purchases'}</Text>
              )}
              {!subIsRestoring && <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>}
            </TouchableOpacity>

          </GlassCard>
        </CollapsibleSection>

        <CollapsibleSection title={t.sectionHealthData} sectionKey="health_data" accentColor="#EF4444" keywords={['health', 'apple health', 'healthkit', 'health connect', 'sync', 'permissions', 'data sources', 'bluetooth', 'device', 'glucose', 'weight', 'blood pressure', 'wearable']}>
        <GlassCard
          accentColor="#EF4444"
          noPadding
          style={{ marginHorizontal: 16 }}
        >



          <SettingsRow
            icon="checkmark.shield.fill"
            iconColor={colors.primary}
            label={se.healthPermissionDetails}
            subtitle={se.healthPermissionDetailsSub}
            onPress={() => router.push('/settings/healthkit-permissions')}
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {state.permissionsGranted ? (
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                    backgroundColor: colors.success + '20',
                    borderWidth: 1,
                    borderColor: colors.success + '40',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>Connected</Text>
                  </View>
                ) : state.hkPermDenied ? (
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                    backgroundColor: colors.error + '20',
                    borderWidth: 1,
                    borderColor: colors.error + '40',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.error }}>Denied</Text>
                  </View>
                ) : (
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                    backgroundColor: colors.warning + '20',
                    borderWidth: 1,
                    borderColor: colors.warning + '40',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.warning }}>Not Set Up</Text>
                  </View>
                )}
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </View>
            }
          />
          {/* Data Sources row removed — use Health Permission Details for HealthKit access */}
          <SettingsRow
            icon="arrow.clockwise"
            iconColor={colors.primary}
            label={t.autoSync}
            subtitle={t.autoSyncSub}
            rightElement={
              <Switch
                value={autoSync}
                onValueChange={(v) => toggleAutoSync(v)}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={autoSync ? colors.primary : colors.muted}
              />
            }
          />
          {/* Stale-data threshold selector */}
          <SettingsRow
            icon="clock.fill"
            iconColor="#F59E0B"
            label={se.syncReminderThreshold}
            subtitle={`${se.syncReminderThresholdSub ?? "Show ⋯ Sync now badge after"} ${staleThresholdHours}h`}
            rightElement={
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {STALE_THRESHOLD_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => updateStaleThreshold(opt as StaleThresholdHours)}
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: staleThresholdHours === opt ? '#F59E0B' : colors.border,
                      backgroundColor: staleThresholdHours === opt ? '#F59E0B20' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: staleThresholdHours === opt ? '#F59E0B' : colors.muted }}>
                      {opt}h
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />

          <SettingsRow
            icon="doc.text.fill"
            iconColor="#10B981"
            label={se.evidenceSources}
            subtitle={se.evidenceSourcesSub}
            onPress={() => router.push('/settings/clinical-sources' as any)}
            rightElement={<IconSymbol name="chevron.right" size={14} color={colors.muted} />}
          />
          <SettingsRow
            icon="building.2.fill"
            iconColor="#22C55E"
            label={se.savedPharmacies}
            subtitle={se.savedPharmaciesSub}
            onPress={() => router.push('/settings/pharmacies' as any)}
            rightElement={<IconSymbol name="chevron.right" size={14} color={colors.muted} />}
          />


        </GlassCard>
        <EvidenceRefBanner
          accentColor="#EF4444"
          heading={se.wearableAccuracyHealthKit ?? "Wearable Accuracy & HealthKit"}
          refs={[
            { label: 'AHA Wearable Device Accuracy 2019', url: 'https://pubmed.ncbi.nlm.nih.gov/31154804/', badge: 'AHA' },
            { label: 'Apple HealthKit Privacy Docs', url: 'https://developer.apple.com/documentation/healthkit/protecting_user_privacy', badge: 'Apple' },
            { label: 'ADA Blood Glucose Monitoring 2024', url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S85/153945/', badge: 'ADA' },
          ]}
        />
        </CollapsibleSection>
        </View>

        <CollapsibleSection title={se.myProfileSection ?? 'My Profile'} sectionKey="my_profile" accentColor="#0EA5E9" keywords={['profile', 'age', 'sex', 'gender', 'goals', 'macros', 'calories', 'diet', 'protocol', 'nutrition']}>
        <GlassCard
          accentColor="#0EA5E9"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          <SettingsRow
            icon="person.fill"
            iconColor="#805AD5"
            label={se.editProfile}
            subtitle={se.editProfileSub}
            onPress={() => router.push('/settings/profile' as any)}
            rightElement={<IconSymbol name="chevron.right" size={16} color={colors.muted} />}
          />
          <SettingsRow
            icon="flame.fill"
            iconColor="#F97316"
            label={se.setMyGoals}
            subtitle={`${macroGoals.calories.toLocaleString()} kcal · ${macroGoals.carbs}g C · ${macroGoals.fat}g F · ${macroGoals.protein}g P`}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setGoalsSheetVisible(true);
            }}
            rightElement={<IconSymbol name="chevron.right" size={16} color={colors.muted} />}
          />

          {/* ─── Macro Goals Quick-Edit ───────────────────────────────────────── */}
          <SettingsRow
            icon="flame.fill"
            iconColor="#F97316"
            label={se.dailyMacroGoals}
            subtitle={`${macroGoals.calories.toLocaleString()} kcal · C ${macroGoals.carbs}g · P ${macroGoals.protein}g · F ${macroGoals.fat}g`}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openMacroSheet();
            }}
            rightElement={<IconSymbol name="chevron.right" size={16} color={colors.muted} />}
          />

          {/* Macro Goals Bottom Sheet */}
          {/* Macro Goals Sheet — moved outside ScrollView; see below */}

          {/* ─── Daily Sugar Budget ──────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: '#F59E0B18' }]}>
              <Text style={{ fontSize: 16 }}>🍬</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.dailySugarBudget ?? 'Daily Sugar Budget'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {(se.dailySugarBudgetSub ?? 'WHO default: {default}g · Your target: {target}g/day').replace('{default}', String(WHO_SUGAR_DEFAULT_G)).replace('{target}', String(sugarBudgetG))}
              </Text>
            </View>
            {sugarBudgetEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  style={[
                    styles.rowLabel,
                    {
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: '#F59E0B',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      minWidth: 60,
                      textAlign: 'center',
                    },
                  ]}
                  value={sugarBudgetInput}
                  onChangeText={setSugarBudgetInput}
                  keyboardType="default"
                  returnKeyType="done"
                  autoFocus
                  onSubmitEditing={async () => {
                    const v = parseFloat(sugarBudgetInput);
                    if (!isNaN(v) && v >= SUGAR_BUDGET_MIN_G && v <= SUGAR_BUDGET_MAX_G) {
                      await setSugarBudgetG(v);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', `Enter a value between ${SUGAR_BUDGET_MIN_G}g and ${SUGAR_BUDGET_MAX_G}g.`);
                    }
                    setSugarBudgetEditing(false);
                  }}
                />
                <Text style={{ color: colors.muted, fontSize: 12 }}>g/day</Text>
                <Pressable
                  onPress={async () => {
                    const v = parseFloat(sugarBudgetInput);
                    if (!isNaN(v) && v >= SUGAR_BUDGET_MIN_G && v <= SUGAR_BUDGET_MAX_G) {
                      await setSugarBudgetG(v);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', `Enter a value between ${SUGAR_BUDGET_MIN_G}g and ${SUGAR_BUDGET_MAX_G}g.`);
                    }
                    setSugarBudgetEditing(false);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>✓</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSugarBudgetEditing(false)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setSugarBudgetInput(String(sugarBudgetG));
                  setSugarBudgetEditing(true);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: '#F59E0B18',
                  borderWidth: 1,
                  borderColor: '#F59E0B40',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 13 }}>
                  {sugarBudgetG}g ✏️
                </Text>
              </Pressable>
            )}
          </View>

          {/* ─── Personal HRV Target ─────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: '#00F5FF12' }]}>
              <Text style={{ fontSize: 16 }}>💙</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.personalHrvTarget ?? 'Personal HRV Target'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {(se.personalHrvTargetSub ?? 'Shown as cyan reference line on HRV chart · Current: {value} ms').replace('{value}', String(hrvTarget))}
              </Text>
            </View>
            {hrvTargetEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  style={[
                    styles.rowLabel,
                    {
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: '#00F5FF',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      minWidth: 60,
                      textAlign: 'center',
                    },
                  ]}
                  value={hrvTargetInput}
                  onChangeText={setHrvTargetInput}
                  keyboardType="default"
                  returnKeyType="done"
                  autoFocus
                  onSubmitEditing={() => {
                    const v = parseInt(hrvTargetInput, 10);
                    if (!isNaN(v) && v >= 10 && v <= 200) {
                      setHrvTarget(v);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', 'Enter a value between 10 ms and 200 ms.');
                    }
                    setHrvTargetEditing(false);
                  }}
                />
                <Text style={{ color: colors.muted, fontSize: 12 }}>ms</Text>
                <Pressable
                  onPress={() => {
                    const v = parseInt(hrvTargetInput, 10);
                    if (!isNaN(v) && v >= 10 && v <= 200) {
                      setHrvTarget(v);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', 'Enter a value between 10 ms and 200 ms.');
                    }
                    setHrvTargetEditing(false);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>✓</Text>
                </Pressable>
                <Pressable
                  onPress={() => setHrvTargetEditing(false)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setHrvTargetInput(String(hrvTarget));
                  setHrvTargetEditing(true);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: '#00F5FF12',
                  borderWidth: 1,
                  borderColor: '#00F5FF40',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: '#00F5FF', fontWeight: '700', fontSize: 13 }}>
                  {hrvTarget} ms ✏️
                </Text>
              </Pressable>
            )}
          </View>

          {/* ─── Weight Goal ─────────────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: '#34D39912' }]}>
              <Text style={{ fontSize: 16 }}>🎯</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.weightGoal ?? 'Weight Goal'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {weightGoalDisplay !== null
                  ? (se.weightGoalSub ?? 'Shown as a green reference line on NeonVitals chart · Current: {value} {unit}').replace('{value}', String(weightGoalDisplay)).replace('{unit}', weightGoalUnitLabel)
                  : ((se.weightGoalSub ?? 'Shown as a green reference line on NeonVitals chart · Current: {value} {unit}').split(' · ')[0] + ' · ' + (se.weightGoalNotSet ?? 'Not set'))}
              </Text>
            </View>
            {weightGoalEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  style={[
                    styles.rowLabel,
                    {
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: '#34D399',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      minWidth: 60,
                      textAlign: 'center',
                    },
                  ]}
                  value={weightGoalInput}
                  onChangeText={setWeightGoalInput}
                  keyboardType="default"
                  returnKeyType="done"
                  autoFocus
                  onSubmitEditing={() => {
                    const v = parseFloat(weightGoalInput);
                    const minVal = isWeightKg ? 20 : 50;
                    const maxVal = isWeightKg ? 250 : 550;
                    if (!isNaN(v) && v >= minVal && v <= maxVal) {
                      // Always store in lbs internally
                      const inLbs = isWeightKg ? v * 2.20462 : v;
                      setWeightGoal(parseFloat(inLbs.toFixed(1)));
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', `Enter a weight between ${minVal} and ${maxVal} ${weightGoalUnitLabel}.`);
                    }
                    setWeightGoalEditing(false);
                  }}
                />
                <Text style={{ color: colors.muted, fontSize: 12 }}>{weightGoalUnitLabel}</Text>
                <Pressable
                  onPress={() => {
                    const v = parseFloat(weightGoalInput);
                    const minVal = isWeightKg ? 20 : 50;
                    const maxVal = isWeightKg ? 250 : 550;
                    if (!isNaN(v) && v >= minVal && v <= maxVal) {
                      const inLbs = isWeightKg ? v * 2.20462 : v;
                      setWeightGoal(parseFloat(inLbs.toFixed(1)));
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', `Enter a weight between ${minVal} and ${maxVal} ${weightGoalUnitLabel}.`);
                    }
                    setWeightGoalEditing(false);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>✓</Text>
                </Pressable>
                <Pressable
                  onPress={() => setWeightGoalEditing(false)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  // Pre-fill with display value (converted to user's unit)
                  setWeightGoalInput(weightGoalDisplay !== null ? String(weightGoalDisplay) : '');
                  setWeightGoalEditing(true);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: '#34D39912',
                  borderWidth: 1,
                  borderColor: '#34D39940',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: '#34D399', fontWeight: '700', fontSize: 13 }}>
                  {weightGoalDisplay !== null ? `${weightGoalDisplay} ${weightGoalUnitLabel} ✏️` : 'Set Goal'}
                </Text>
              </Pressable>
            )}
          </View>

          {/* ─── Sleep Duration Goal ──────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: colors.sleepPurple + '18' }]}>
              <IconSymbol name="moon.fill" size={16} color={colors.sleepPurple} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.sleepDurationGoal ?? 'Sleep Duration Goal'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {(se.sleepDurationGoalSub ?? 'Used by the 7-night insight card · Current: {value} hrs').replace('{value}', String(sleepGoal))}
              </Text>
            </View>
            {sleepGoalEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  style={[
                    styles.rowLabel,
                    {
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.sleepPurple,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      minWidth: 60,
                      textAlign: 'center',
                    },
                  ]}
                  value={sleepGoalInput}
                  onChangeText={setSleepGoalInput}
                  keyboardType="default"
                  returnKeyType="done"
                  autoFocus
                  onSubmitEditing={() => {
                    const v = parseFloat(sleepGoalInput);
                    if (!isNaN(v) && v >= 4 && v <= 12) {
                      setSleepGoal(v);
                      showHealthKitToast(`Sleep goal updated to ${Math.round(v * 2) / 2} hrs`);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', 'Enter a sleep goal between 4 and 12 hours.');
                    }
                    setSleepGoalEditing(false);
                  }}
                />
                <Text style={{ color: colors.muted, fontSize: 12 }}>hrs</Text>
                <Pressable
                  onPress={() => {
                    const v = parseFloat(sleepGoalInput);
                    if (!isNaN(v) && v >= 4 && v <= 12) {
                      setSleepGoal(v);
                      showHealthKitToast(`Sleep goal updated to ${Math.round(v * 2) / 2} hrs`);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Alert.alert('Invalid value', 'Enter a sleep goal between 4 and 12 hours.');
                    }
                    setSleepGoalEditing(false);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: colors.sleepPurple, fontWeight: '700', fontSize: 13 }}>✓</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSleepGoalEditing(false)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setSleepGoalInput(String(sleepGoal));
                  setSleepGoalEditing(true);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: colors.sleepPurple + '12',
                  borderWidth: 1,
                  borderColor: colors.sleepPurple + '40',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: colors.sleepPurple, fontWeight: '700', fontSize: 13 }}>
                  {sleepGoal} hrs ✏️
                </Text>
              </Pressable>
            )}
          </View>
          {/* ─── Quick preset chips for sleep goal ──────────────────────────── */}
          {!sleepGoalEditing && (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' }}>
              {[6, 7, 7.5, 8, 9].map((hrs) => (
                <Pressable
                  key={hrs}
                  onPress={() => {
                    setSleepGoal(hrs);
                    showHealthKitToast(`Sleep goal set to ${hrs} hrs`);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: sleepGoal === hrs ? colors.sleepPurple : colors.sleepPurple + '12',
                    borderWidth: 1,
                    borderColor: colors.sleepPurple + (sleepGoal === hrs ? 'ff' : '40'),
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: sleepGoal === hrs ? '#fff' : colors.sleepPurple, fontWeight: '600', fontSize: 12 }}>
                    {hrs}h
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
           {/* ─── Bedtime Reminder Notification ─────────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, alignItems: 'flex-start' }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: colors.sleepPurple + '18', marginTop: 2 }]}>
              <Text style={{ fontSize: 16 }}>🌙</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.bedtimeReminder ?? 'Bedtime Reminder'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {bedtimeReminder.enabled
                  ? `Notifies 30 min before ${formatReminderTime(bedtimeReminder.hour, bedtimeReminder.minute)} target`
                  : (se.bedtimeReminderOff ?? 'Get a wind-down nudge 30 min before your target bedtime')}
              </Text>
              {/* Circadian rhythm citation */}
              <Pressable
                onPress={() => Linking.openURL('https://pubmed.ncbi.nlm.nih.gov/21700875/')}
                style={{ marginTop: 2 }}
              >
                <Text style={{ fontSize: 10, color: colors.sleepPurple, textDecorationLine: 'underline' }}>
                  Czeisler et al., Science 2011 — circadian sleep timing
                </Text>
              </Pressable>
            </View>
            <Switch
              value={bedtimeReminder.enabled}
              onValueChange={handleBedtimeReminderToggle}
              trackColor={{ false: colors.border, true: colors.sleepPurple + '60' }}
              thumbColor={bedtimeReminder.enabled ? colors.sleepPurple : colors.muted}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            />
          </View>
          {bedtimeReminder.enabled && (
            <View style={[styles.settingsRow, { borderColor: colors.border, alignItems: 'flex-start' }]}>
              <View style={[styles.rowIconWrap, { backgroundColor: colors.sleepPurple + '18', marginTop: 2 }]}>
                <Text style={{ fontSize: 16 }}>⏰</Text>
              </View>
              <View style={[styles.rowText, { gap: 8 }]}>
                {/* Label + time chips on the same horizontal line */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground, marginRight: 4 }]}>{se.targetBedtime ?? 'Target Bedtime'}</Text>
                  {([[21, 0, '9 PM'], [21, 30, '9:30'], [22, 0, '10 PM'], [22, 30, '10:30'], [23, 0, '11 PM']] as [number, number, string][]).map(([h, m, label]) => {
                    const active = bedtimeReminder.hour === h && bedtimeReminder.minute === m;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => handleBedtimeReminderTimeChange(h, m)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 16,
                          backgroundColor: active ? colors.sleepPurple : colors.sleepPurple + '12',
                          borderWidth: 1,
                          borderColor: colors.sleepPurple + (active ? 'ff' : '40'),
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ color: active ? '#fff' : colors.sleepPurple, fontWeight: '600', fontSize: 11 }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.rowSub, { color: colors.muted }]}>{se.bedtimeReminderFires ?? 'Reminder fires 30 min before this time'}</Text>
              </View>
            </View>
          )}

          {/* ─── Blood Glucose Reminder Notification ───────────────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: '#DC262618' }]}>
              <Text style={{ fontSize: 16 }}>🩸</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.bloodGlucoseReminder ?? se.glucoseReminderLabel ?? 'Blood Glucose Reminder'}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {sugarNotifEnabled
                  ? glucoseReminderMode === 'custom'
                    ? `${se.glucoseCustomDaily ?? 'Custom — daily at'} ${sugarNotifTime}`
                    : GLUCOSE_MODE_LABELS[glucoseReminderMode]
                  : (se.bloodGlucoseReminderOff ?? se.glucoseReminderTapToEnable ?? 'Tap to enable glucose check reminders')}
              </Text>
            </View>
            <Switch
              value={sugarNotifEnabled}
              onValueChange={handleSugarNotifToggle}
              trackColor={{ false: colors.border, true: '#DC262660' }}
              thumbColor={sugarNotifEnabled ? '#DC2626' : colors.muted}
            />
          </View>
          {sugarNotifEnabled && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>{se.reminderSchedule ?? se.glucoseReminderScheduleTitle ?? 'Reminder Schedule'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {(['ac', 'pc', 'hs', '6h', 'custom'] as GlucoseReminderMode[]).map((mode) => {
                  const active = glucoseReminderMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => handleGlucoseReminderModeChange(mode)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: active ? '#DC2626' : colors.border,
                        backgroundColor: active
                          ? (isDark ? '#DC262625' : '#FEE2E2')
                          : (isDark ? colors.surface : '#F9FAFB'),
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#DC2626' : colors.muted }}>
                        {mode === 'ac' ? (se.glucoseModeAC ?? 'AC — Before Meals') : mode === 'pc' ? (se.glucoseModePC ?? 'PC — Post-Meal') : mode === 'hs' ? (se.glucoseModeHS ?? 'HS — Bedtime') : mode === '6h' ? (se.glucoseMode6h ?? se.glucoseMode6H ?? 'Every 6 Hours') : (se.glucoseModeCustom ?? 'Custom Time')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: (glucoseReminderMode === 'custom' || glucoseReminderMode === 'ac') ? 10 : 0 }}>
                {glucoseReminderMode === 'ac' && 'Adjust each meal slot below (±30 min from default)'}
                {glucoseReminderMode === 'pc' && '🍽️ 9:30 AM · 2:00 PM · 8:00 PM (1–2h after meals)'}
                {glucoseReminderMode === 'hs' && '🌙 9:30 PM'}
                {glucoseReminderMode === '6h' && '⏰ 6:00 AM · 12:00 PM · 6:00 PM · 12:00 AM'}
                {glucoseReminderMode === 'custom' && 'Enter your preferred time (HH:MM)'}
              </Text>
              {/* AC per-slot time editors */}
              {glucoseReminderMode === 'ac' && (
                <View style={{ gap: 8, marginBottom: 4 }}>
                  {(['Breakfast 🍳', 'Lunch 🥗', 'Dinner 🍽️'] as const).map((label, idx) => {
                    const defaultTimes = ['07:30', '12:00', '18:00'];
                    return (
                      <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 13, color: colors.foreground, flex: 1 }}>{label}</Text>
                        <TextInput
                          style={{
                            color: colors.foreground,
                            borderWidth: 1.5,
                            borderColor: '#DC2626',
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 5,
                            minWidth: 80,
                            textAlign: 'center',
                            fontSize: 14,
                            fontWeight: '600',
                          }}
                          value={acSlotInputs[idx as 0 | 1 | 2]}
                          onChangeText={(v) => {
                            const newInputs: [string, string, string] = [...acSlotInputs] as [string, string, string];
                            newInputs[idx as 0 | 1 | 2] = v;
                            setAcSlotInputs(newInputs);
                          }}
                          onBlur={() => handleAcSlotTimeChange(idx as 0 | 1 | 2, acSlotInputs[idx as 0 | 1 | 2])}
                          onSubmitEditing={() => handleAcSlotTimeChange(idx as 0 | 1 | 2, acSlotInputs[idx as 0 | 1 | 2])}
                          placeholder={defaultTimes[idx]}
                          placeholderTextColor={colors.muted}
                          keyboardType="default"
                          returnKeyType="done"
                        />
                      </View>
                    );
                  })}
                  {/* Reset to defaults button */}
                  <Pressable
                    onPress={async () => {
                      setAcSlotTimes(AC_DEFAULT_SLOTS);
                      setAcSlotInputs(['07:30', '12:00', '18:00']);
                      await safeSetItem(AC_SLOT_TIMES_KEY, JSON.stringify(AC_DEFAULT_SLOTS)).catch(() => {});
                      if (sugarNotifEnabled) await scheduleGlucoseNotifications('ac', 20, 0, AC_DEFAULT_SLOTS);
                    }}
                    style={({ pressed }) => ({
                      alignSelf: 'flex-start',
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: isDark ? '#DC262615' : '#FEF2F2',
                      borderWidth: 1,
                      borderColor: isDark ? '#DC262640' : '#FECACA',
                      opacity: pressed ? 0.7 : 1,
                      marginTop: 2,
                    })}
                  >
                    <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>Reset to defaults</Text>
                  </Pressable>
                </View>
              )}
              {glucoseReminderMode === 'custom' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground, flex: 1 }}>Reminder time</Text>
                  <TextInput
                    style={{
                      color: colors.foreground,
                      borderWidth: 1.5,
                      borderColor: '#DC2626',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      minWidth: 80,
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                    value={sugarNotifTime}
                    onChangeText={(v) => setSugarNotifTime(v)}
                    onBlur={() => handleSugarNotifTimeChange(sugarNotifTime)}
                    onSubmitEditing={() => handleSugarNotifTimeChange(sugarNotifTime)}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.muted}
                    keyboardType="default"
                    returnKeyType="done"
                  />
                </View>
              )}
            </View>
          )}

          {/* ─── Diet Profile Selector ──────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: '#10B981' + '18' }]}>
                <IconSymbol name="fork.knife" size={16} color="#10B981" />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.dietProfile}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>{(se[`dietSub${dietType.charAt(0).toUpperCase() + dietType.slice(1)}` as keyof typeof se] as string | undefined) ?? se.dietProfileSub}</Text>
              </View>
            </View>
            {/* 2-column tile grid with tap-and-hold tooltip + pulse animation */}
            <View style={{ gap: 10, width: '100%' }}>
              {Array.from({ length: Math.ceil(DIET_TYPE_OPTIONS.length / 2) }, (_, rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 10 }}>
                  {DIET_TYPE_OPTIONS.slice(rowIdx * 2, rowIdx * 2 + 2).map((opt) => {
                    const isActive = dietType === opt.value;
                    const cardAccent = opt.color;
                    const _dietLabels = (dietLabelStrings as unknown as Record<string, typeof dietLabelStrings.en>)[lang] ?? dietLabelStrings.en;
                    const _translatedLabel = _dietLabels[opt.value] ?? opt.label;
                    const tileStyle = {
                      flex: 1,
                      borderRadius: 14,
                      borderWidth: isActive ? 1.5 : 1,
                      padding: 12,
                      gap: 4,
                      shadowOffset: { width: 0, height: isActive ? 8 : 1 },
                      shadowRadius: isActive ? 16 : 4,
                      elevation: isActive ? 8 : 1,
                      backgroundColor: isActive
                        ? cardAccent + (isDark ? '22' : '12')
                        : isDark ? colors.surface : '#F7F7F7',
                      borderColor: isActive ? cardAccent : colors.border,
                      ...(isActive ? { shadowColor: cardAccent, shadowOpacity: 0.25 } : {}),
                    };
                    return (
                      <DietProtocolTooltip
                        key={opt.value}
                        opt={opt}
                        isActive={isActive}
                        shouldPulse={isActive}
                        colors={colors}
                        isDark={isDark}
                        tileStyle={tileStyle}
                                                onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setShowDietInfo(null);
                          Animated.timing(subtitleOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
                            setDietType(opt.value as DietType);
                            Animated.timing(subtitleOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
                          });
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                          {isActive && (
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, backgroundColor: cardAccent + '20', borderColor: cardAccent + '50' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: cardAccent }}>{se.dietActive ?? 'Active'}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: -0.1, color: isActive ? cardAccent : colors.foreground }}>
                          {_translatedLabel}
                        </Text>
                        <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted }} numberOfLines={2}>
                          {(dietDesc as any)[opt.value]?.description ?? opt.description}
                        </Text>
                        {(() => {
                          const dietHintKey = `dietInfoHint${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}` as keyof typeof se;
                          const hintText = se[dietHintKey] as string | undefined;
                          if (!hintText) return null;
                          const badgeAccent = opt.color;
                          const isOpen = showDietInfo === opt.value;
                          return (
                            <>
                              <Pressable
                                onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDietInfo(isOpen ? null : opt.value); }}
                                style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, backgroundColor: badgeAccent + '15', borderColor: badgeAccent + '40', opacity: pressed ? 0.7 : 1 })}
                              >
                                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: badgeAccent }}>ⓘ</Text>
                              </Pressable>
                              {isOpen && (
                                <View style={{ marginTop: 4, padding: 8, borderRadius: 8, backgroundColor: badgeAccent + '12', borderWidth: 1, borderColor: badgeAccent + '30' }}>
                                  <Text style={{ fontSize: 10, lineHeight: 14, color: badgeAccent, fontWeight: '500' }}>{hintText}</Text>
                                </View>
                              )}
                            </>
                          );
                        })()}
                        {opt.useBioAvailability && (
                          <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, backgroundColor: '#10B98115', borderColor: '#10B98140' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: '#10B981' }}>{se.bioAvailability ?? 'Bio-Availability'}</Text>
                          </View>
                        )}
                        {opt.isCustom && (
                          <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, backgroundColor: '#EC489915', borderColor: '#EC489940' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: '#EC4899' }}>{se.personalized ?? 'Personalized'}</Text>
                          </View>
                        )}
                      </DietProtocolTooltip>
                    );
                  })}
                </View>
              ))}
            </View>
            {/* Active diet name preview */}
            {(() => {
              const active = DIET_TYPE_OPTIONS.find(o => o.value === dietType);
              if (!active) return null;
              // Use the color field co-located on DietTypeOption
              const dietAccent = active.color ?? colors.primary;
              return (
                <View style={{ paddingLeft: 46, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{se.dietActiveProtocol ?? 'Active protocol:'}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: dietAccent + '18', borderWidth: 1, borderColor: dietAccent + '44' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: dietAccent }}>{active.emoji} {active.label}</Text>
                    </View>
                  </View>
                  <Animated.Text style={{ fontSize: 11, color: colors.muted, lineHeight: 15, opacity: subtitleOpacity }}>{(dietDesc as any)[active.value]?.cardSubtitle ?? active.cardSubtitle}</Animated.Text>
                </View>
              );
            })()}
            {/* View protocol history row */}
            {dietHistory.length > 0 && (
              <Pressable
                onPress={() => setShowDietHistory(true)}
                style={({ pressed }) => ([
                  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, opacity: pressed ? 0.6 : 1 },
                ])}
                accessibilityRole="button"
                accessibilityLabel={se.viewProtocolHistory ?? 'View protocol history'}
              >
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.muted + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 15 }}>📋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>{se.viewProtocolHistory ?? 'View protocol history'}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{dietHistory.length} change{dietHistory.length !== 1 ? 's' : ''} recorded</Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
            )}


            {/* Protocol History Modal */}
            <Modal
              visible={showDietHistory}
              animationType="slide"
              transparent
              onRequestClose={() => setShowDietHistory(false)}
            >
              <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowDietHistory(false)} />
              <View style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '65%', paddingTop: 8, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Protocol History</Text>
                  <Pressable onPress={() => setShowDietHistory(false)}>
                    <Text style={{ fontSize: 15, color: colors.muted }}>Done</Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                  {dietHistory.map((entry, i) => {
                    const now = Date.now();
                    const then = new Date(entry.changedAt).getTime();
                    const diffMs = now - then;
                    const diffMin = Math.floor(diffMs / 60_000);
                    const rel = diffMin < 1 ? 'just now' : diffMin < 60 ? `${diffMin} min ago` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago` : diffMin < 43200 ? `${Math.floor(diffMin / 1440)}d ago` : safeFormatDate(entry.changedAt);
                    const opt = DIET_TYPE_OPTIONS.find(o => o.value === entry.dietType);
                    const accent = opt?.color ?? colors.primary;
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent, marginRight: 12, marginTop: 4 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{entry.emoji} {entry.label}</Text>
                          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{rel} · {safeFormatDate(entry.changedAt)}</Text>
                          {entry.note ? <Text style={{ fontSize: 12, color: colors.foreground, fontStyle: 'italic', marginTop: 3 }}>📝 {entry.note}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </Modal>
          </View>

          {/* ─── Measurement Units ──────────────────────────────────────────── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: '#0EA5E918' }]}>
                <Text style={{ fontSize: 16 }}>📐</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{se.measurementUnits ?? 'Measurement Units'}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>{se.measurementUnitsSub ?? 'Tap a column to apply all units at once'}</Text>
              </View>
            </View>

            {/* ── Two-column unit grid matching sketch ── */}
            {(() => {
              const UNIT_ROWS: { label: string; accent: string; usVal: string; usLabel: string; intlVal: string; intlLabel: string; key: keyof import('@/hooks/use-unit-preferences').UnitPreferences; setter: (v: any) => void }[] = [
                { label: se.unitWeight ?? 'Weight',       accent: '#3B82F6', usVal: 'lbs',   usLabel: 'lbs',    intlVal: 'kg',     intlLabel: 'kg',     key: 'weightUnit',   setter: setUnitWeight },
                { label: se.unitHeight ?? 'Height',       accent: '#22C55E', usVal: 'in',    usLabel: 'in',     intlVal: 'cm',     intlLabel: 'cm',     key: 'heightUnit',   setter: setUnitHeight },
                { label: se.unitTemperature ?? 'Temperature',  accent: '#F59E0B', usVal: 'F',     usLabel: '°F',     intlVal: 'C',      intlLabel: '°C',     key: 'tempUnit',     setter: setUnitTemp },
                { label: se.unitBloodGlucose ?? 'Blood Glucose',accent: '#EF4444', usVal: 'mg/dL', usLabel: 'mg/dL',  intlVal: 'mmol/L', intlLabel: 'mmol/L', key: 'glucoseUnit',  setter: setUnitGlucose },
                { label: se.unitDistance ?? 'Distance',     accent: '#8B5CF6', usVal: 'mi',    usLabel: 'mi',     intlVal: 'km',     intlLabel: 'km',     key: 'distanceUnit', setter: setUnitDistance },
              ];
              const currentVals: Record<string, string> = {
                weightUnit: unitWeight, heightUnit: unitHeight, tempUnit: unitTemp, glucoseUnit: unitGlucose, distanceUnit: unitDistance,
              };
              const isAllImperial = unitWeight === 'lbs' && unitTemp === 'F' && unitGlucose === 'mg/dL' && unitDistance === 'mi' && unitHeight === 'in';
              const isAllIntl = unitWeight === 'kg' && unitTemp === 'C' && unitGlucose === 'mmol/L' && unitDistance === 'km' && unitHeight === 'cm';

              const COL_W = 104; // width of each unit column (wide enough for mmol/L)
              const LABEL_W = 110; // width of row label

              // Column-wide tint colors
              const imperialTint = isAllImperial ? (isDark ? 'rgba(14,165,233,0.08)' : 'rgba(14,165,233,0.06)') : 'transparent';
              const intlTint = isAllIntl ? (isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)') : 'transparent';

              return (
                <View style={{ width: '100%', alignItems: 'center' }}>
                  {/* Column headers — tapping applies the full preset */}
                  <View style={{ flexDirection: 'row', marginBottom: 6, alignItems: 'center', justifyContent: 'center' }}>
                    {/* US Imperial header — left side */}
                    <Reanimated.View style={[{ width: COL_W, marginRight: 8 }, flashImperialStyle]}>
                      <Pressable
                        style={[{
                          paddingVertical: 11,
                          paddingHorizontal: 6,
                          borderRadius: 12,
                          alignItems: 'center',
                          borderWidth: 1.5,
                        },
                          isAllImperial
                            ? { backgroundColor: '#0EA5E920', borderColor: '#0EA5E9' }
                            : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.border }
                        ]}
                        onPress={async () => {
                          // Atomic save — all 5 units in a single AsyncStorage write to avoid race conditions
                          appendConfigAuditEntry({ event: 'unit_preference_changed', from: `${unitWeight}/${unitTemp}/${unitGlucose}/${unitDistance}/${unitHeight}`, to: 'lbs/F/mg∕dL/mi/in', note: 'Applied US Imperial preset' });
                          setUnitWeight('lbs'); setUnitTemp('F'); setUnitGlucose('mg/dL'); setUnitDistance('mi'); setUnitHeight('in');
                          await saveUnitPreferences({ weightUnit: 'lbs', tempUnit: 'F', glucoseUnit: 'mg/dL', distanceUnit: 'mi', heightUnit: 'in' });
                          flashImperial.value = withSequence(
                            withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
                            withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }),
                          );
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          showHealthKitToast('Units updated to US Imperial 🇺🇸');
                        }}
                      >
                        <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: 2 }}>🇺🇸</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isAllImperial ? '#0EA5E9' : colors.foreground, textAlign: 'center' }}>{se.imperialLabel ?? 'Imperial'}</Text>
                      </Pressable>
                    </Reanimated.View>
                    {/* Label spacer between headers */}
                    <View style={{ width: LABEL_W + 16 }} />
                    {/* International header — aligned with Intl column */}
                    <Reanimated.View style={[{ width: COL_W }, flashInternationalStyle]}>
                      <Pressable
                        style={[{
                          paddingVertical: 11,
                          paddingHorizontal: 6,
                          borderRadius: 12,
                          alignItems: 'center',
                          borderWidth: 1.5,
                        },
                          isAllIntl
                            ? { backgroundColor: '#22C55E20', borderColor: '#22C55E' }
                            : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.border }
                        ]}
                        onPress={async () => {
                          // Atomic save — all 5 units in a single AsyncStorage write to avoid race conditions
                          appendConfigAuditEntry({ event: 'unit_preference_changed', from: `${unitWeight}/${unitTemp}/${unitGlucose}/${unitDistance}/${unitHeight}`, to: 'kg/C/mmol∕L/km/cm', note: 'Applied International preset' });
                          setUnitWeight('kg'); setUnitTemp('C'); setUnitGlucose('mmol/L'); setUnitDistance('km'); setUnitHeight('cm');
                          await saveUnitPreferences({ weightUnit: 'kg', tempUnit: 'C', glucoseUnit: 'mmol/L', distanceUnit: 'km', heightUnit: 'cm' });
                          // Flash animation
                          flashInternational.value = withSequence(
                            withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
                            withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }),
                          );
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          showHealthKitToast('Units updated to International 🌍');
                        }}
                      >
                        <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: 2 }}>🌍</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isAllIntl ? '#22C55E' : colors.foreground, textAlign: 'center' }}>{se.internationalLabel ?? 'International'}</Text>
                      </Pressable>
                    </Reanimated.View>
                  </View>

                  {/* Unit rows — label | US box | Intl box */}
                  {UNIT_ROWS.map(({ label, accent, usVal, usLabel, intlVal, intlLabel, key, setter }) => {
                    const current = currentVals[key];
                    const usActive = current === usVal;
                    const intlActive = current === intlVal;
                    return (
                      <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'center' }}>
                        {/* US unit box — left-aligned with column tint */}
                        <Pressable
                          style={[{
                            width: COL_W,
                            height: 40,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1.5,
                            marginRight: 8,
                            backgroundColor: usActive ? `${accent}20` : imperialTint,
                          },
                            usActive
                              ? { borderColor: accent }
                              : { borderColor: isAllImperial ? 'rgba(14,165,233,0.25)' : colors.border }
                          ]}
                          onPress={() => handleUnitChange(key, usVal as any, setter, `${label} set to ${usLabel}`, currentVals[key])}
                        >
                          <Text style={{ fontSize: 14, fontWeight: usActive ? '700' : '500', color: usActive ? accent : colors.muted }}>{usLabel}</Text>
                        </Pressable>
                        {/* Row label — fixed width so it never overflows on small screens */}
                        <View style={{ width: LABEL_W, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
                          <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: 'center' }}>{label}</Text>
                        </View>
                        {/* Intl unit box — right-aligned with column tint */}
                        <Pressable
                          style={[{
                            width: COL_W,
                            height: 40,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1.5,
                            marginLeft: 8,
                            backgroundColor: intlActive ? `${accent}20` : intlTint,
                          },
                            intlActive
                              ? { borderColor: accent }
                              : { borderColor: isAllIntl ? 'rgba(34,197,94,0.25)' : colors.border }
                          ]}
                          onPress={() => handleUnitChange(key, intlVal as any, setter, `${label} set to ${intlLabel}`, currentVals[key])}
                        >
                          <Text style={{ fontSize: 14, fontWeight: intlActive ? '700' : '500', color: intlActive ? accent : colors.muted }}>{intlLabel}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              );
             })()}
          </View>
        </GlassCard>
        <EvidenceRefBanner
          accentColor="#0EA5E9"
          heading="Nutrition & Metabolic Guidelines"
          refs={[
            { label: 'WHO BMI Classification', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight', badge: 'WHO' },
            { label: 'ADA Calorie & Macro Targets 2024', url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S77/153946/', badge: 'ADA' },
            { label: 'Mifflin-St Jeor BMR (PMID 2305711)', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/', badge: 'PMID' },
            { label: 'WHO Free Sugars Guideline', url: 'https://www.who.int/publications/i/item/9789241549028', badge: 'WHO' },
          ]}
        />
        </CollapsibleSection>

        <CollapsibleSection title={t.sectionStoredData} sectionKey="stored_data" accentColor="#22C55E" defaultExpanded={false} badge={totalRecords > 0 ? `${totalRecords} records` : undefined} keywords={['stored', 'records', 'clear', 'delete', 'export', 'csv', 'data']}>
        <GlassCard
          accentColor="#22C55E"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          <View style={[styles.dataGrid, { borderColor: colors.border }]}>
            {[
              { label: 'BP Readings', value: dataStats?.bp ?? 0, color: colors.bpGreen },
              { label: 'Pulse', value: dataStats?.pulse ?? 0, color: colors.heartRed },
              { label: 'Weight', value: dataStats?.body ?? 0, color: colors.bodyBlue },
              { label: 'Sleep', value: dataStats?.sleep ?? 0, color: colors.sleepPurple },
              { label: 'SpO₂', value: dataStats?.spo2 ?? 0, color: '#06B6D4' },
              { label: 'Glucose', value: dataStats?.glucose ?? 0, color: '#DC2626' },
            ].map((item) => (
              <View key={item.label} style={[styles.dataCell, { borderColor: colors.border }]}>
                <Text style={[styles.dataCellValue, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.dataCellLabel, { color: colors.muted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
          <SettingsRow
            icon="slider.horizontal.3"
            iconColor="#6366F1"
            label="Data Management"
            subtitle="Choose which categories VitalSync tracks, syncs, and stores"
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/settings/data-management' as any);
            }}
            rightElement={<IconSymbol name="chevron.right" size={14} color={colors.muted} />}
          />
          <SettingsRow
            icon="square.grid.2x2.fill"
            iconColor="#0A7EA4"
            label={se.manageDashboard}
            subtitle={se.manageDashboardSub ?? 'Show/hide sections and reorder primary cards'}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/settings/manage-dashboard' as any);
            }}
            rightElement={<IconSymbol name="chevron.right" size={14} color={colors.muted} />}
          />
          <SettingsRow
            icon="arrow.counterclockwise"
            iconColor={colors.primary}
            label={se.resetDashboardLayout}
            subtitle={se.resetDashboardSub ?? 'Collapse EBP cards and restore Best Day callouts to defaults'}
            onPress={handleResetLayout}
          />
          <SettingsRow
            icon="xmark"
            iconColor={colors.error}
            label={t.clearVitalSignsData}
            subtitle={t.clearVitalSignsDataSub}
            onPress={handleClearData}
            destructive
          />
        </GlassCard>
        <EvidenceRefBanner
          accentColor="#22C55E"
          heading={se.dataMinimisationStorage ?? "Data Minimisation & On-Device Storage"}
          refs={[
            { label: 'HIPAA Health Data Privacy (HHS)', url: 'https://www.hhs.gov/hipaa/for-individuals/guidance-materials-for-consumers/index.html', badge: 'HIPAA' },
            { label: 'Apple On-Device Privacy Overview', url: 'https://www.apple.com/privacy/docs/A_Day_in_the_Life_of_Your_Data.pdf', badge: 'Apple' },
          ]}
        />
        </CollapsibleSection>

        <CollapsibleSection title={t.sectionPrivacy} sectionKey="privacy" accentColor="#22C55E" keywords={['privacy', 'lock', 'biometric', 'face id', 'pin', 'timeout', 'emergency', 'medical id', 'local', 'consent', 'security', 'passcode']}>
        <GlassCard
          accentColor="#22C55E"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          <SettingsRow
            icon="lock.shield.fill"
            iconColor={colors.primary}
            label={t.appLock}
            subtitle={
              auth.isSetup
                ? 'PIN lock enabled'
                : t.appLockSub
            }
            onLongPress={
              Platform.OS === 'ios'
                ? () => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (auth.isSetup) {
                      // Lock the app immediately — Face ID will prompt on next foreground
                      auth.lockApp();
                      showAppToast('App lock activated');
                    } else {
                      router.push('/auth/setup-lock');
                    }
                  }
                : undefined
            }
            rightElement={
              auth.isSetup ? (
                <Pressable
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => {
                    Alert.alert(
                      'Remove App Lock',
                      'Are you sure you want to remove the app lock?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: async () => {
                            appendConfigAuditEntry({ event: 'app_lock_toggled', from: 'enabled', to: 'disabled', note: 'App lock removed' });
                            await auth.removeLock();
                            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={{ color: colors.error, fontSize: 14, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              ) : null
            }
          />
          {auth.isSetup && (
            <SettingsRow
              icon="timer"
              iconColor={colors.warning}
              label={se.lockTimeout}
              subtitle={LOCK_TIMEOUT_OPTIONS.find(o => o.value === auth.lockTimeout)?.label ?? 'Immediately'}
              rightElement={
                <Pressable
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => {
                    const options = LOCK_TIMEOUT_OPTIONS.map(o => ({
                      text: o.label,
                      onPress: () => auth.setLockTimeout(o.value as LockTimeout),
                    }));
                    Alert.alert(se.lockTimeout ?? 'Lock Timeout', se.lockTimeoutMsg ?? 'How long before the app re-locks after going to background?', [
                      ...options,
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Change</Text>
                </Pressable>
              }
            />
          )}
          {auth.isSetup && (
            <SettingsRow
              icon="key.fill"
              iconColor={colors.primary}
              label={se.changePIN}
              subtitle={se.changePINSub}
              rightElement={
                <Pressable
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => router.push('/auth/change-pin')}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Change</Text>
                </Pressable>
              }
            />
          )}

          {/* ── Face ID App Access Instructions ─────────────────────── */}
          {Platform.OS === 'ios' && (
            <View style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <IconSymbol name="faceid" size={18} color={colors.primary} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.faceIdAccessTitle ?? 'Face ID App Access'}</Text>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: isRTL ? 'right' : 'left' }}>
                {se.faceIdAccessInstructions ?? 'To use Face ID with VitalSync, long press the VitalSync app icon before opening the app and enable Face ID access from your device options if available.'}
              </Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2, textAlign: isRTL ? 'right' : 'left' }}>
                {se.faceIdAccessAvailability ?? 'Availability may depend on your device, iOS version, and system settings. VitalSync does not store your Face ID data.'}
              </Text>
            </View>
          )}
          <SettingsRow
            icon="phone.fill"
            iconColor="#FF3B30"
            label={t.emergencyContact}
            subtitle={
              auth.emergencyContact
                ? `${auth.emergencyContact.name} · ${auth.emergencyContact.phone}`
                : 'Shown on lock screen for urgent access'
            }
            rightElement={
              <Pressable
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                onPress={() => {
                  Alert.prompt(
                    auth.emergencyContact ? 'Edit Emergency Contact' : 'Add Emergency Contact',
                    'Enter name',
                    (name) => {
                      if (!name) return;
                      Alert.prompt(
                        'Phone Number',
                        'Enter phone number',
                        (phone) => {
                          if (!phone) return;
                          auth.updateEmergencyContact({ name: name.trim(), phone: phone.trim() });
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        },
                        'plain-text',
                        auth.emergencyContact?.phone ?? '',
                      );
                    },
                    'plain-text',
                    auth.emergencyContact?.name ?? '',
                  );
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                  {auth.emergencyContact ? 'Edit' : 'Add'}
                </Text>
              </Pressable>
            }
          />
          <SettingsRow
            icon="cross.fill"
            iconColor="#FF3B30"
            label={t.medicalId}
            subtitle={
              auth.medicalId
                ? `Blood: ${auth.medicalId.bloodType}${auth.medicalId.allergies ? ' · Allergies on file' : ''}`
                : t.medicalIdSub
            }
            rightElement={
              <Pressable
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                onPress={() => router.push('/auth/medical-id' as any)}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                  {auth.medicalId ? t.edit : t.setUp}
                </Text>
              </Pressable>
            }
          />
          <SettingsRow
            icon="lock.fill"
            iconColor={colors.bpGreen}
            label={t.localStorageOnly}
            subtitle={t.localStorageOnlySub}
            rightElement={
              <View style={[styles.badge, { backgroundColor: colors.bpGreen + '20', borderColor: colors.bpGreen + '40' }]}>
                <Text style={[styles.badgeText, { color: colors.bpGreen }]}>{t.on}</Text>
              </View>
            }
          />
          <SettingsRow
            icon="shield.fill"
            iconColor={colors.primary}
            label={t.outboundDataPolicy}
            subtitle={t.outboundDataPolicySub}
            rightElement={
              <View style={[styles.badge, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{t.active}</Text>
              </View>
            }
          />
          <SettingsRow
            icon="lock.shield.fill"
            iconColor='#10B981'
            label="Data & Privacy"
            subtitle={se.dataPrivacySub ?? 'On-device storage, what leaves your device, and how to delete your data'}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/settings/data-privacy' as any);
            }}
          />
          <SettingsRow
            icon="checkmark.shield.fill"
            iconColor={colors.bpGreen}
            label={se.consentDataUseLabel ?? 'Consent & Data Use'}
            subtitle={
              consentAccepted
                ? `${t.consentDataUse ?? 'Accepted'} · v${consentVersion}`
                : (se.consentDataUseReview ?? 'Review your data consent agreement')
            }
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/consent' as any);
            }}
            rightElement={
              <View style={[styles.badge, {
                backgroundColor: consentAccepted
                  ? colors.bpGreen + '20'
                  : colors.warning + '20',
                borderColor: consentAccepted
                  ? colors.bpGreen + '40'
                  : colors.warning + '40',
              }]}>
                <Text style={[styles.badgeText, {
                  color: consentAccepted ? colors.bpGreen : colors.warning,
                }]}>
                  {consentAccepted ? 'Accepted' : 'Review'}
                </Text>
              </View>
            }
          />
          {/* Data Retention Window */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground, marginBottom: 4 }}>{se.dataRetentionWindow ?? 'Data Retention Window'}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, marginBottom: 10 }}>
              {se.dataRetentionWindowSub ?? 'Time-series health data older than this is trimmed before each save. Lab results, medical history, and immunizations are always kept.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RETENTION_OPTIONS.map((opt) => {
                const active = retentionMonths === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={async () => {
                      const prev = retentionMonths;
                      setRetentionMonths(opt);
                      await saveRetentionMonths(opt);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (prev !== opt) appendConfigAuditEntry({ event: 'data_retention_changed', from: `${prev} months`, to: `${opt} months` }).catch(() => {});
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: active ? '600' : '400',
                      color: active ? '#fff' : colors.foreground,
                    }}>
                      {opt} mo
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />
          {/* Reset Encryption Key */}
          <SettingsRow
            icon="key.fill"
            iconColor={colors.warning}
            label={se.resetEncryptionKey}
            subtitle={se.resetEncryptionKeySub}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setKeyRotationSheetVisible(true);
            }}
          />
          {/* Delete All My Data — GDPR/CCPA right to erasure */}
          <SettingsRow
            icon="trash.fill"
            iconColor={colors.error}
            label={se.deleteAllMyData}
            subtitle={se.deleteAllDataSub ?? 'Permanently erase all your data and reset the app'}
            destructive
            onPress={() => {
              Alert.alert(
                '⚠️ Delete All My Data',
                'This will permanently erase ALL locally stored data including health records, settings, onboarding state, consent, biometric lock, and preferences.\n\nThis action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Everything',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        // Clear ALL AsyncStorage keys
                        await AsyncStorage.clear();
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        // Navigate to consent/onboarding as if fresh install
                        router.replace('/consent' as any);
                      } catch (_e) {
                        Alert.alert('Error', 'Failed to delete data. Please try again.');
                      }
                    },
                  },
                ]
              );
            }}
          />
          {/* Manage Consent — GDPR right to review/withdraw */}
          <ManageConsentRow />
          <SettingsRow
            icon="arrow.triangle.2.circlepath"
            iconColor={colors.warning}
            label={se.clearTranslationCache}
            subtitle={translationCacheCount > 0 ? `${se.clearTranslationCacheSub} (${translationCacheCount} cached)` : se.clearTranslationCacheSub}
            onPress={() => {
              Alert.alert(
                se.clearTranslationCacheAlertTitle ?? 'Clear Translation Cache',
                se.clearTranslationCacheAlertBody ?? 'This will delete all cached Apple Intelligence or Gemini for Android translations for every language and re-translate from scratch the next time each language is used. Continue?',
                [
                  { text: se.clearTranslationCacheAlertCancel ?? 'Cancel', style: 'cancel' },
                  {
                    text: se.clearTranslationCacheAlertConfirm ?? 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      await clearCache(); // no argument = clear all languages
                      await refreshCacheCount(); // update badge
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert(se.clearTranslationCacheAlertTitle ?? 'Done', se.clearTranslationCacheAlertDone ?? 'All translation caches cleared. Strings will be re-translated on next use.');
                    },
                  },
                ]
              );
            }}
          />
          {/* Reset Onboarding Hints */}
          <SettingsRow
            icon="lightbulb.fill"
            iconColor="#F59E0B"
            label={se.resetOnboardingHints}
            subtitle={se.resetOnboardingHintsSub}
            onPress={() => {
              Alert.alert(
                'Reset Onboarding Hints',
                'This will restore all first-launch tips and guided hints so they appear again on next use.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset Hints',
                    onPress: async () => {
                      try {
                        await AsyncStorage.multiRemove([
                          HINT_SHOWN_KEY,
                          DICTATION_BANNER_KEY,
                        ]);
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showAppToast('Onboarding hints reset');
                      } catch (_e) {
                        Alert.alert('Error', 'Failed to reset hints. Please try again.');
                      }
                    },
                  },
                ]
              );
            }}
          />
        </GlassCard>
        <EvidenceRefBanner
          accentColor="#22C55E"
          heading={se.biometricSecurityPrivacy ?? "Biometric Security & Data Privacy"}
          refs={[
            { label: 'NIST Biometric Authentication (SP 800-76)', url: 'https://csrc.nist.gov/publications/detail/sp/800-76/2/final', badge: 'NIST' },
            { label: 'Apple Face ID Security Guide', url: 'https://support.apple.com/guide/security/face-id-and-touch-id-sec067eb0c9b/web', badge: 'Apple' },
          ]}
        />
        </CollapsibleSection>

        <CollapsibleSection title={t.sectionNotifications} sectionKey="notifications" accentColor="#F59E0B" keywords={['notifications', 'alerts', 'threshold', 'reminders', 'lab', 'push', 'readiness', 'whats new']}>
        {notifPermDenied && (
          <Pressable
            style={[{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              marginHorizontal: 0, marginBottom: 8,
              paddingHorizontal: 14, paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: isDark ? '#7C2D1220' : '#FFF7ED',
              borderWidth: 1,
              borderColor: isDark ? '#F9731640' : '#FED7AA',
            }]}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel={se.notificationsBlocked ?? 'Notifications are blocked. Tap to open App Settings and enable them.'}
          >
            <Text style={{ fontSize: 20 }}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#FB923C' : '#9A3412' }}>
                Notifications Blocked
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                Push notifications are disabled in iOS Settings. Tap to enable them.
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        )}
        <GlassCard
          accentColor="#F59E0B"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          <SettingsRow
            icon="bolt.fill"
            iconColor={colors.bpAmber}
            label={se.thresholdAlerts}
            subtitle={se.thresholdAlertsSub}
            onPress={() => router.push('/settings/thresholds' as any)}
          />
          <SettingsRow
            icon="bolt.fill"
            iconColor={colors.muted}
            label={se.healthAlertsLegacy}
            subtitle={se.healthAlertsLegacySub}
            rightElement={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: colors.border, true: colors.bpAmber + '60' }}
                thumbColor={notifications ? colors.bpAmber : colors.muted}
              />
            }
          />
          <SettingsRow
            icon="testtube.2"
            iconColor={colors.primary}
            label={se.labResultReminders}
            subtitle={`Notify when a panel is due again (CMP: 90d, Lipid: 180d)`}
            rightElement={
              <Switch
                value={labRemindersEnabled}
                onValueChange={async (val) => {
                  setLabRemindersEnabledState(val);
                  await setLabRemindersEnabled(val);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={labRemindersEnabled ? colors.primary : colors.muted}
              />
            }
          />
          {/* Celebration Sounds toggle */}
          <SettingsRow
            icon="music.note"
            iconColor="#FFB800"
            label={se.celebrationSounds}
            subtitle={se.celebrationSoundsSub}
            rightElement={
              <Switch
                value={celebrationSoundsEnabled}
                onValueChange={async () => {
                  await toggleCelebrationSounds();
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: colors.border, true: '#FFB80060' }}
                thumbColor={celebrationSoundsEnabled ? '#FFB800' : colors.muted}
              />
            }
          />

          {/* Daily Readiness Score notification row */}
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#10B98118', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
              <Text style={{ fontSize: 15 }}>🩺</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.dailyReadinessScore ?? 'Daily Readiness Score'}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.dailyReadinessScoreSub ?? 'Morning notification with your score and trend'}</Text>
              {readinessNotifEnabled && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.muted, marginRight: 6 }}>Time:</Text>
                  <TextInput
                    value={readinessNotifTime}
                    onChangeText={setReadinessNotifTime}
                    onBlur={() => handleReadinessNotifTimeChange(readinessNotifTime)}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.muted}
                    keyboardType="default"
                    returnKeyType="done"
                    onSubmitEditing={() => handleReadinessNotifTimeChange(readinessNotifTime)}
                    style={{ fontSize: 12, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, minWidth: 50, paddingVertical: 1 }}
                  />
                </View>
              )}
            </View>
            <Switch
              value={readinessNotifEnabled}
              onValueChange={async (v) => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await handleReadinessNotifToggle(v);
              }}
              trackColor={{ false: colors.border, true: '#10B981' }}
              thumbColor={readinessNotifEnabled ? '#fff' : colors.muted}
            />
          </View>

          {/* HRV Target Alert toggle + inline stepper */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            {/* Toggle row */}
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#7B61FF18', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
                <Text style={{ fontSize: 15 }}>💙</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.hrvTargetAlert}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.hrvTargetAlertSub}</Text>
              </View>
              <Switch
                value={hrvAlertEnabled}
                onValueChange={handleHrvAlertToggle}
                trackColor={{ false: colors.border, true: '#7B61FF60' }}
                thumbColor={hrvAlertEnabled ? '#7B61FF' : colors.muted}
              />
            </View>
            {/* Inline ±5 ms stepper */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginLeft: 42, backgroundColor: isDark ? 'rgba(123,97,255,0.10)' : '#EDE9FE', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: isDark ? '#C4B5FD' : '#5B21B6', fontWeight: '600' }}>7-day avg target</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Pressable
                  onPress={() => { setHrvTarget(Math.max(10, hrvTarget - 5)); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 8, backgroundColor: pressed ? (isDark ? 'rgba(123,97,255,0.4)' : '#DDD6FE') : (isDark ? 'rgba(123,97,255,0.18)' : '#EDE9FE'), alignItems: 'center', justifyContent: 'center' })}
                  accessibilityRole="button" accessibilityLabel={se.decreaseHRVTarget ?? 'Decrease HRV target by 5 ms'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#C4B5FD' : '#5B21B6', lineHeight: 24 }}>−</Text>
                </Pressable>
                <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#C4B5FD' : '#5B21B6', minWidth: 52, textAlign: 'center' }}>{hrvTarget} ms</Text>
                <Pressable
                  onPress={() => { setHrvTarget(Math.min(120, hrvTarget + 5)); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 8, backgroundColor: pressed ? (isDark ? 'rgba(123,97,255,0.4)' : '#DDD6FE') : (isDark ? 'rgba(123,97,255,0.18)' : '#EDE9FE'), alignItems: 'center', justifyContent: 'center' })}
                  accessibilityRole="button" accessibilityLabel={se.increaseHRVTarget ?? 'Increase HRV target by 5 ms'}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#C4B5FD' : '#5B21B6', lineHeight: 24 }}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>


          {/* Glucose shortcut chip on streak banner */}
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(148,163,184,0.12)' }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#DC262618', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
              <Text style={{ fontSize: 15 }}>🩸</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.showGlucoseShortcut ?? 'Show Glucose Shortcut'}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.showGlucoseShortcutSub ?? 'Show a "Log glucose →" chip on the weekly streak banner.'}</Text>
            </View>
            <Switch
              value={glucoseChipEnabled}
              onValueChange={handleGlucoseChipToggle}
              trackColor={{ false: colors.border, true: '#DC262660' }}
              thumbColor={glucoseChipEnabled ? '#DC2626' : colors.muted}
            />
          </View>

          {unreadAlertCount > 0 && (
            <SettingsRow
              icon="checkmark.circle.fill"
              iconColor={colors.success}
              label={se.markAllAlertsRead ?? "Mark All Alerts as Read"}
              subtitle={`${unreadAlertCount} unread alert${unreadAlertCount !== 1 ? 's' : ''} — tap to clear badge`}
              onPress={async () => {
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await clearUnreadAlertCount();
                setUnreadAlertCount(0);
              }}
            />
          )}
          {/* ─── Auto-Miss Grace Period ────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(148,163,184,0.12)' }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#EF444418', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
                <Text style={{ fontSize: 15 }}>⏱️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.autoMarkMissed ?? 'Auto-Mark Missed After'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.autoMarkMissedSub ?? 'Grace period before a skipped dose is automatically logged as missed. "Never" disables auto-marking.'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {GRACE_PERIOD_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleGracePeriodChange(opt.value)}
                  style={[{
                    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1.5,
                    backgroundColor: gracePeriodHours === opt.value
                      ? (isDark ? '#EF444420' : '#FEE2E2')
                      : (isDark ? '#1E2022' : '#F5F5F5'),
                    borderColor: gracePeriodHours === opt.value ? '#EF4444' : colors.border,
                  }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: gracePeriodHours === opt.value }}
                  accessibilityLabel={`Auto-mark missed after ${opt.label}`}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: gracePeriodHours === opt.value ? '700' : '400',
                    color: gracePeriodHours === opt.value ? '#EF4444' : colors.muted,
                  }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ─── Missed-Dose Follow-Up Delay ────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#F59E0B18', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
                <Text style={{ fontSize: 15 }}>⏰</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.missedDoseFollowUpTitle ?? 'Missed-Dose Follow-Up Delay'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.missedDoseFollowUpNote ?? 'How long after a reminder fires before a Did you take it? notification is sent'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SNOOZE_DELAY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => setSnoozeDelayMins(opt.value)}
                  style={[{
                    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1.5,
                    backgroundColor: snoozeDelayMins === opt.value
                      ? (isDark ? '#F59E0B20' : '#FEF3C7')
                      : (isDark ? '#1E2022' : '#F5F5F5'),
                    borderColor: snoozeDelayMins === opt.value ? '#F59E0B' : colors.border,
                  }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: snoozeDelayMins === opt.value }}
                  accessibilityLabel={`Set missed-dose follow-up delay to ${se[opt.labelKey] ?? opt.labelKey}`}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: snoozeDelayMins === opt.value ? '700' : '400',
                    color: snoozeDelayMins === opt.value ? '#F59E0B' : colors.muted,
                  }}>{se[opt.labelKey] ?? opt.labelKey}</Text>
                </Pressable>
              ))}
            </View>
          </View>          {/* ─── Low Stock Threshold (stepper 5–30 pills) ──────────────────────────── */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(148,163,184,0.12)' }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#22C55E18', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
                <Text style={{ fontSize: 15 }}>💊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.lowStockThreshold ?? 'Low Stock Alert Threshold'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.lowStockThresholdSub ?? 'Show a refill badge on medication cards when quantity falls at or below this level'}</Text>
              </View>
            </View>
            {/* +/− stepper */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 42, backgroundColor: isDark ? 'rgba(34,197,94,0.10)' : '#DCFCE7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: isDark ? '#4ADE80' : '#166534', fontWeight: '600' }}>{se.lowStockPills ?? 'Refill when ≤ N pills'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Pressable
                  onPress={() => { handleLowStockThresholdChange(Math.max(5, lowStockThresholdSetting - 1)); }}
                  style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 8, backgroundColor: pressed ? (isDark ? 'rgba(34,197,94,0.4)' : '#BBF7D0') : (isDark ? 'rgba(34,197,94,0.18)' : '#DCFCE7'), alignItems: 'center', justifyContent: 'center' })}
                  accessibilityRole="button" accessibilityLabel={se.decreaseLowStock ?? 'Decrease low stock threshold'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#4ADE80' : '#166534', lineHeight: 24 }}>−</Text>
                </Pressable>
                <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#4ADE80' : '#166534', minWidth: 52, textAlign: 'center' }}>{lowStockThresholdSetting} pills</Text>
                <Pressable
                  onPress={() => { handleLowStockThresholdChange(Math.min(30, lowStockThresholdSetting + 1)); }}
                  style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 8, backgroundColor: pressed ? (isDark ? 'rgba(34,197,94,0.4)' : '#BBF7D0') : (isDark ? 'rgba(34,197,94,0.18)' : '#DCFCE7'), alignItems: 'center', justifyContent: 'center' })}
                  accessibilityRole="button" accessibilityLabel={se.increaseLowStock ?? 'Increase low stock threshold'}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#4ADE80' : '#166534', lineHeight: 24 }}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ─── Insight Cooldown Duration ─────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(148,163,184,0.12)' }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#8B5CF618', alignItems: 'center', justifyContent: 'center', ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }) }}>
                <Text style={{ fontSize: 15 }}>💡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{se.insightRepeat ?? 'On-Device Insight Repeat'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textAlign: isRTL ? 'right' : 'left' }}>{se.insightRepeatSub ?? 'How often the same insight can resurface on your dashboard'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {INSIGHT_COOLDOWN_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleInsightCooldownChange(opt.value)}
                  style={[{
                    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1.5,
                    backgroundColor: insightCooldownMs === opt.value
                      ? (isDark ? '#8B5CF620' : '#EDE9FE')
                      : (isDark ? '#1E2022' : '#F5F5F5'),
                    borderColor: insightCooldownMs === opt.value ? '#8B5CF6' : colors.border,
                  }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: insightCooldownMs === opt.value }}
                  accessibilityLabel={`Show same insight every ${opt.label}`}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: insightCooldownMs === opt.value ? '700' : '400',
                    color: insightCooldownMs === opt.value ? '#8B5CF6' : colors.muted,
                  }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={handleClearInsightHistory}
              style={({ pressed }) => ({
                marginTop: 10,
                paddingVertical: 9,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: pressed
                  ? (isDark ? '#1E2022' : '#F5F5F5')
                  : 'transparent',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.2)',
              })}
              accessibilityRole="button"
              accessibilityLabel="Clear all insight history so all insights can resurface immediately"
            >
              <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '500' }}>{se.clearInsightHistory ?? '↺  Clear All Insight History'}</Text>
            </Pressable>
          </View>

          {/* ─── Per-Metric Cooldown Overrides (collapsible) ──────────────────────────── */}
          <View style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(148,163,184,0.12)' }}>
            {/* Tappable header row */}
            <Pressable
              onPress={() => {
                setMetricCooldownExpanded(v => !v);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 12,
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel={metricCooldownExpanded ? 'Collapse per-metric cooldown overrides' : 'Expand per-metric cooldown overrides'}
              accessibilityState={{ expanded: metricCooldownExpanded }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#8B5CF618', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 15 }}>⏱</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>{se.perMetricCooldown ?? 'Per-Metric Cooldown Override'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Set a different repeat interval for individual metric insights. “Global” uses the setting above.</Text>
              </View>
              {/* Active overrides count badge */}
              {Object.keys(metricCooldowns).length > 0 && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#8B5CF620', borderWidth: 1, borderColor: '#8B5CF644', marginRight: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>{Object.keys(metricCooldowns).length} custom</Text>
                </View>
              )}
              <Text style={{ fontSize: 13, color: colors.muted }}>{metricCooldownExpanded ? '▾' : '▸'}</Text>
            </Pressable>

            {/* Expandable metric rows */}
            {metricCooldownExpanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            {METRIC_KEYS.map(metric => {
              const activeMs = metricCooldowns[metric] ?? null;
              return (
                <View key={metric} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                    <Text style={{ fontSize: 13, marginRight: 6 }}>{METRIC_COOLDOWN_ICONS[metric]}</Text>
                    <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '500', flex: 1 }}>{METRIC_COOLDOWN_LABELS[metric]}</Text>
                    {activeMs !== null && (
                      <Pressable
                        onPress={() => handleMetricCooldownChange(metric, null)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: '#8B5CF6', fontWeight: '600' }}>{se.resetLabel ?? 'Reset'}</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {/* “Global” pill — clears the override */}
                    <Pressable
                      onPress={() => handleMetricCooldownChange(metric, null)}
                      style={[{
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                        borderWidth: 1.5,
                        backgroundColor: activeMs === null
                          ? (isDark ? '#8B5CF620' : '#EDE9FE')
                          : (isDark ? '#1E2022' : '#F5F5F5'),
                        borderColor: activeMs === null ? '#8B5CF6' : colors.border,
                      }]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: activeMs === null }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: activeMs === null ? '700' : '400', color: activeMs === null ? '#8B5CF6' : colors.muted }}>{se.globalLabel ?? 'Global'}</Text>
                    </Pressable>
                    {INSIGHT_COOLDOWN_OPTIONS.map(opt => (
                      <Pressable
                        key={opt.value}
                        onPress={() => handleMetricCooldownChange(metric, opt.value)}
                        style={[{
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                          borderWidth: 1.5,
                          backgroundColor: activeMs === opt.value
                            ? (isDark ? '#8B5CF620' : '#EDE9FE')
                            : (isDark ? '#1E2022' : '#F5F5F5'),
                          borderColor: activeMs === opt.value ? '#8B5CF6' : colors.border,
                        }]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: activeMs === opt.value }}
                        accessibilityLabel={`Show ${METRIC_COOLDOWN_LABELS[metric]} insights every ${opt.label}`}
                      >
                        <Text style={{ fontSize: 11, fontWeight: activeMs === opt.value ? '700' : '400', color: activeMs === opt.value ? '#8B5CF6' : colors.muted }}>{opt.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
            </View>
            )}
          </View>

        </GlassCard>
        <EvidenceRefBanner
          accentColor="#F59E0B"
          heading={se.healthAlertThresholdsBanner ?? "Health Alert Thresholds"}
          refs={[
            { label: 'AHA/ACC BP Guideline 2017 (PMID 29133354)', url: 'https://pubmed.ncbi.nlm.nih.gov/29133354/', badge: 'AHA' },
            { label: 'ADA Glycaemic Goals 2024 §6.3', url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S85/153945/', badge: 'ADA' },
            { label: 'Task Force HRV Standards (PMID 8737210)', url: 'https://pubmed.ncbi.nlm.nih.gov/8737210/', badge: 'PMID' },
            { label: 'WHO SpO₂ Normal Range', url: 'https://www.who.int/docs/default-source/documents/pulse-oximetry/who-ps-pulse-oximetry-training-manual-en.pdf', badge: 'WHO' },
          ]}
        />
        </CollapsibleSection>

        <CollapsibleSection title={t.sectionAbout} sectionKey="about" accentColor="#0EA5E9" keywords={['about', 'version', 'support', 'privacy policy', 'onboarding', 'reset', 'help', 'feedback']}>
        <GlassCard
          accentColor="#0EA5E9"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          {/* Help & Support — first row so users can find it easily */}
          <SettingsRow
            icon="questionmark.circle.fill"
            iconColor="#0EA5E9"
            label={se.helpAndSupport}
            subtitle={se.helpAndSupportSub}
            onPress={async () => {
              const supportUrl = 'https://vitalsyncpersonalwellnesshub.com';
              const supportEmail = 'mailto:support@vitalsyncpersonalwellnesshub.com';
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              try {
                if (Platform.OS !== 'web') {
                  const { openBrowserAsync } = await import('expo-web-browser');
                  await openBrowserAsync(supportUrl);
                } else {
                  await Linking.openURL(supportUrl);
                }
              } catch (_unused) {
                await Linking.openURL(supportEmail);
              }
            }}
          />
          {/* What's New — opens changelog page and clears the badge dot */}
          <SettingsRow
            icon="sparkles"
            iconColor="#F59E0B"
            label={se.whatsNew}
            subtitle={hasNewUpdate ? 'New update available — tap to see what changed' : se.whatsNewSub}
            rightElement={
              hasNewUpdate ? (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginRight: 4 }} />
              ) : undefined
            }
            onPress={async () => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Clear the badge immediately
              setHasNewUpdate(false);
              safeSetItem(WHATS_NEW_SEEN_KEY, LATEST_WHATS_NEW_VERSION).catch(() => {});
              // Also trigger the in-app What's New sheet
              appEvents.emit('openWhatsNew');
            }}
          />
          {/* Rate the App — expo-store-review */}
          <SettingsRow
            icon="star.fill"
            iconColor="#FBBF24"
            label={se.rateVitalSync}
            subtitle={se.rateVitalSyncSub}
            onPress={async () => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              try {
                const StoreReview = await import('expo-store-review');
                const isAvailable = await StoreReview.isAvailableAsync();
                if (isAvailable) {
                  await StoreReview.requestReview();
                } else {
                  const storeUrl = Platform.OS === 'ios'
                    ? 'https://apps.apple.com/app/id6504192558'
                    : 'https://play.google.com/store/apps/details?id=space.manus.vitalsync';
                  await Linking.openURL(storeUrl);
                }
              } catch (_unused) {
                // Silently ignore if store review is unavailable
              }
            }}
          />
          {/* Share the App — React Native Share API */}
          <SettingsRow
            icon="square.and.arrow.up"
            iconColor="#22C55E"
            label={se.shareVitalSync}
            subtitle={se.shareVitalSyncSub}
            onPress={async () => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const storeUrl = Platform.OS === 'android'
                ? 'https://play.google.com/store/apps/details?id=space.manus.vitalsync'
                : 'https://apps.apple.com/app/id6504192558';
              await Share.share({
                title: 'VitalSync — Personal Wellness Hub',
                message: `I've been using VitalSync to track my health data privately on-device. Check it out: ${storeUrl}`,
                url: storeUrl,
              });
            }}
          />
          {/* Contact Support — pre-filled mailto with app version */}
          <SettingsRow
            icon="envelope.fill"
            iconColor="#8B5CF6"
            label={se.contactSupport}
            subtitle="support@vitalsyncpersonalwellnesshub.com"
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const ver = Constants.expoConfig?.version ?? '1.0.0';
              const build = Platform.OS === 'ios'
                ? (Constants.expoConfig?.ios?.buildNumber ?? '')
                : Platform.OS === 'android'
                  ? String(Constants.expoConfig?.android?.versionCode ?? '')
                  : '';
              const versionStr = `v${ver}${build ? ` (${build})` : ''}`;
              const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
              const subject = encodeURIComponent(`VitalSync Support — ${versionStr} ${os}`);
              const body = encodeURIComponent(`Hi VitalSync Support,\n\nApp version: ${versionStr}\nPlatform: ${os}\n\nIssue description:\n`);
              Linking.openURL(`mailto:support@vitalsyncpersonalwellnesshub.com?subject=${subject}&body=${body}`);
            }}
          />
          {/* App Store Link */}
          <SettingsRow
            icon="arrow.up.right"
            iconColor="#0EA5E9"
            label={se.viewOnAppStore}
            subtitle={Platform.OS === 'android' ? 'Google Play Store' : 'Apple App Store'}
            onPress={async () => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const storeUrl = Platform.OS === 'android'
                ? 'https://play.google.com/store/apps/details?id=space.manus.vitalsync'
                : 'https://apps.apple.com/app/id6504192558';
              await Linking.openURL(storeUrl);
            }}
          />
          <SettingsRow
            icon="info.circle"
            iconColor={colors.primary}
            label={t.aboutVitalSync}
            subtitle={(() => {
              const ver = Constants.expoConfig?.version ?? '1.0.0';
              const build = Platform.OS === 'ios'
                ? Constants.expoConfig?.ios?.buildNumber
                : Platform.OS === 'android'
                  ? String(Constants.expoConfig?.android?.versionCode ?? '')
                  : undefined;
              return `Privacy-First Health Aggregator · v${ver}${build ? ` (${build})` : ''}`;
            })()}
            onPress={() => router.push('/settings/about' as any)}
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: '#805AD618', borderWidth: 1, borderColor: '#805AD630' }}>
                  <Text style={{ fontSize: 11 }}>🎓</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#805AD5' }}>Harvard</Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </View>
            }
          />
          <SettingsRow
            icon="lock.shield.fill"
            iconColor="#6366F1"
            label={se.termsPrivacy}
            subtitle="vitalsyncpersonalwellnesshub.com/article/privacy-policy"
            onPress={async () => {
              const { openBrowserAsync } = await import('expo-web-browser');
              const policyUrl = 'https://vitalsyncpersonalwellnesshub.com/article/privacy-policy';
              if (Platform.OS === 'web') {
                await Linking.openURL(policyUrl);
              } else {
                await openBrowserAsync(policyUrl, {
                  presentationStyle: 'pageSheet' as any,
                  toolbarColor: '#22C55E',
                });
              }
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
          <SettingsRow
            icon="arrow.counterclockwise"
            iconColor={colors.bpAmber}
            label={se.resetOnboarding}
            subtitle={se.resetOnboardingSub}
            onPress={() => {
              Alert.alert(
                se.resetOnboarding,
                'This will show the first-launch walkthrough again on next app start.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                      await resetOnboarding();
                      await resetConsent();
                      if (Platform.OS !== 'web') {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }
                      router.replace('/onboarding' as any);
                    },
                  },
                ]
              );
             }}
          />
        </GlassCard>
        <EvidenceRefBanner
          accentColor="#0EA5E9"
          heading={se.evidenceLibrary}
          refs={[
            { label: 'PubMed Central (NIH)', url: 'https://pubmed.ncbi.nlm.nih.gov/', badge: 'PubMed' },
            { label: 'AHA Journals', url: 'https://www.ahajournals.org/', badge: 'AHA' },
            { label: 'WHO Guidelines', url: 'https://www.who.int/publications/guidelines', badge: 'WHO' },
            { label: 'ADA Standards of Care 2024', url: 'https://diabetesjournals.org/care/issue/47/Supplement_1', badge: 'ADA' },
          ]}
          style={{ marginBottom: 8 }}
        />
        </CollapsibleSection>

        <CollapsibleSection title={se.diagnostics} sectionKey="diagnostics" accentColor="#64748B" defaultExpanded={false} keywords={['diagnostics', 'crash', 'logs', 'error', 'debug', 'report', 'developer']}>
        <GlassCard
          accentColor="#64748B"
          noPadding
          style={{ marginHorizontal: 16 }}
        >
          {/* Storage Health */}
          {(() => {
            if (!storageHealth || storageHealth.topKeys.length === 0) {
              return (
                <SettingsRow
                  icon="chart.xyaxis.line"
                  iconColor={colors.muted}
                  label={se.storageHealth ?? "Storage Health"}
                  subtitle={se.storageHealthSub ?? "No size telemetry yet — data will appear after the first large write"}
                  onPress={loadStorageHealth}
                />
              );
            }
            const { topKeys, hasWarning, warningKeys } = storageHealth;
            return (
              <View style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
                borderWidth: hasWarning ? 1 : 0,
                borderColor: hasWarning ? colors.warning : 'transparent',
                borderRadius: hasWarning ? 10 : 0,
                margin: hasWarning ? 8 : 0,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <IconSymbol name="chart.xyaxis.line" size={16} color={hasWarning ? colors.warning : colors.muted} />
                  <Text style={{ fontSize: 14, fontWeight: '600', marginLeft: 8, color: hasWarning ? colors.warning : colors.foreground }}>
                    {se.storageHealth ?? 'Storage Health'}
                  </Text>
                  <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 12 }}>
                    <Pressable
                      onPress={async () => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        await clearStorageTelemetry();
                        loadStorageHealth();
                        showAppToast('Telemetry history cleared');
                      }}
                    >
                      <Text style={{ fontSize: 12, color: colors.muted }}>Clear</Text>
                    </Pressable>
                    <Pressable onPress={loadStorageHealth}>
                      <Text style={{ fontSize: 12, color: colors.primary }}>Refresh</Text>
                    </Pressable>
                  </View>
                </View>
                {topKeys.map((k) => {
                  const isOver = k.latestKB >= 2048;
                  const maxVal = Math.max(...k.sparkline, 1);
                  return (
                    <View key={k.key} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ fontSize: 12, color: isOver ? colors.warning : colors.foreground, fontWeight: '500' }}>
                          {k.label}{isOver ? ' ⚠' : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: isOver ? colors.warning : colors.muted }}>
                          {formatStorageSize(k.latestKB)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', height: 16, gap: 1, alignItems: 'flex-end' }}>
                        {k.sparkline.map((val, idx) => (
                          <View
                            key={idx}
                            style={{
                              flex: 1,
                              height: val === 0 ? 2 : Math.max(2, Math.round((val / maxVal) * 16)),
                              borderRadius: 1,
                              backgroundColor: isOver
                                ? (idx === 29 ? colors.warning : colors.warning + '66')
                                : (idx === 29 ? colors.primary : colors.primary + '55'),
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
                {hasWarning && (
                  <View style={{ marginTop: 4, padding: 8, backgroundColor: colors.warning + '22', borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.warning, fontWeight: '500' }}>
                      {warningKeys.join(', ')} {warningKeys.length === 1 ? 'exceeds' : 'exceed'} 2 MB.
                      Reduce your retention window in Settings → Privacy to keep storage healthy.
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}
          <SettingsRow
            icon="heart.text.square.fill"
            iconColor="#EF4444"
            label={se.healthkitDiagnostics ?? "HealthKit Diagnostics"}
            subtitle={se.healthkitDiagnosticsSub ?? "Run bridge checks and live data pulls"}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/settings/healthkit-debug');
            }}
          />
          <SettingsRow
            icon="exclamationmark.triangle.fill"
            iconColor="#F59E0B"
            label={se.errorLogs ?? "Error Logs"}
            subtitle={crashLogCount > 0 ? `${crashLogCount} entr${crashLogCount === 1 ? 'y' : 'ies'} stored locally · tap to view` : 'No errors recorded'}
            badge={crashLogCount > 0 ? String(crashLogCount) : undefined}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/settings/crash-logs');
            }}
          />
          <SettingsRow
            icon="paperplane.fill"
            iconColor="#3B82F6"
            label={se.sendCrashReport ?? "Send Crash Report"}
            subtitle={
              crashLogCount > 0
                ? `Email ${crashLogCount} log entr${crashLogCount === 1 ? 'y' : 'ies'} to support`
                : 'No logs to send'
            }
            onPress={async () => {
              if (crashLogCount === 0) return;
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsSendingReport(true);
              const logs = await readCrashLogs();
              const version = Constants.expoConfig?.version ?? '1.0.0';
              await sendCrashReport(logs, version);
              setIsSendingReport(false);
              promptClearAfterShare();
            }}
            disabled={crashLogCount === 0 || isSendingReport}
          />
          <SettingsRow
            icon="doc.on.clipboard.fill"
            iconColor="#6366F1"
            label={se.copyToClipboard ?? "Copy to Clipboard"}
            subtitle={
              copyDone
                ? 'Copied! Paste into any app'
                : crashLogCount > 0
                ? `Copy ${crashLogCount} log entr${crashLogCount === 1 ? 'y' : 'ies'} to clipboard`
                : 'No logs to copy'
            }
            onPress={async () => {
              if (crashLogCount === 0) return;
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsCopying(true);
              const logs = await readCrashLogs();
              const version = Constants.expoConfig?.version ?? '1.0.0';
              const ok = await copyCrashReport(logs, version);
              setIsCopying(false);
              if (ok) {
                setCopyDone(true);
                setTimeout(() => setCopyDone(false), 2500);
                setTimeout(() => promptClearAfterShare(), 400);
              }
            }}
            disabled={crashLogCount === 0 || isCopying}
          />
          <SettingsRow
            icon="square.and.arrow.up"
            iconColor="#16A34A"
            label={se.shareLabel ?? "Share"}
            subtitle={
              crashLogCount > 0
                ? `Share ${crashLogCount} log entr${crashLogCount === 1 ? 'y' : 'ies'} via any app`
                : 'No logs to share'
            }
            onPress={async () => {
              if (crashLogCount === 0) return;
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsSharing(true);
              const logs = await readCrashLogs();
              const version = Constants.expoConfig?.version ?? '1.0.0';
              const shared = await shareCrashReport(logs, version);
              setIsSharing(false);
              if (shared) promptClearAfterShare();
            }}
            disabled={crashLogCount === 0 || isSharing}
          />
        </GlassCard>
        </CollapsibleSection>
        <CrashLogViewer
          visible={crashLogVisible}
          onClose={() => { setCrashLogVisible(false); loadCrashLogCount(); }}
          onLogsCleared={loadCrashLogCount}
        />

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ─── Language Picker Modal ──────────────────────────────────────────── */}
      <Modal
        visible={langPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangPickerVisible(false)}
      >
        <Pressable
          style={styles.langOverlay}
          onPress={() => setLangPickerVisible(false)}
        />
        <View style={[styles.langSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.langHandle, { backgroundColor: colors.border }]} />

          {/* Header row with title and translating indicator */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, gap: 8 }}>
            <Text style={[styles.langTitle, { color: colors.foreground, marginBottom: 0 }]}>{t.languagePickerTitle}</Text>
            {isTranslating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>{t.translatingLabel ?? 'Translating…'}</Text>
              </View>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ gap: 4, paddingBottom: 8 }}
          >
            {/* Auto (device language) */}
            <Pressable
              style={({ pressed }) => [
                styles.langOption,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                (lang as string) === 'auto' && { backgroundColor: colors.primary + '12' },
              ]}
              onPress={async () => {
                const needsRestart = await applyRTLForLang(null);
                await setLangOverride(null);
                setLangPickerVisible(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (needsRestart) {
                  Alert.alert(
                    t.restartRequired ?? 'Restart Required',
                    'The layout direction has changed. Reload now to apply the new layout.',
                    [
                      { text: t.later ?? 'Later', style: 'cancel' },
                      {
                        text: t.reloadApp ?? 'Reload App',
                        onPress: async () => {
                          try { const U = await import('expo-updates'); await U.reloadAsync(); } catch (_unused) { /* dev mode — no-op */ }
                        },
                      },
                    ]
                  );
                }
              }}
            >
              <Text style={[styles.langOptionNative, { color: colors.foreground }]}>📱 {t.languageAuto}</Text>
            </Pressable>

            {/* Static built-in languages — derived from canonical SUPPORTED_LANGUAGES */}
            {STATIC_LANGUAGE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.code}
                style={({ pressed }) => [
                  styles.langOption,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  lang === opt.code && { backgroundColor: colors.primary + '12' },
                ]}
                onPress={async () => {
                  const needsRestart = await applyRTLForLang(opt.code);
                  await setLangOverride(opt.code as Lang);
                  // Auto-apply regional unit defaults (only if user hasn't customized units yet)
                  await applyLangUnitDefaults(opt.code);
                  setLangPickerVisible(false);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (needsRestart) {
                    Alert.alert(
                      t.restartRequired ?? 'Restart Required',
                      'The layout direction has changed. Reload now to apply the new layout.',
                      [
                        { text: t.later ?? 'Later', style: 'cancel' },
                        {
                          text: t.reloadApp ?? 'Reload App',
                          onPress: async () => {
                            try { const U = await import('expo-updates'); await U.reloadAsync(); } catch (_unused) { /* dev mode — no-op */ }
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <View style={styles.langOptionRow}>
                  <Text style={{ fontSize: 20, marginRight: 4 }}>{getLangFlag(opt.code)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.langOptionNative, { color: colors.foreground }]}>{opt.native}</Text>
                    <Text style={[styles.langOptionLabel, { color: colors.muted }]}>{opt.label}</Text>
                  </View>
                </View>
                {lang === opt.code && (
                  <IconSymbol name="checkmark" size={16} color={colors.primary} />
                )}
              </Pressable>
            ))}

            {/* Smart-translated languages separator */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>{intelligenceName.toUpperCase()}</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            </View>

            {/* Smart-translated languages */}
            {AI_LANGUAGE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.code}
                style={({ pressed }) => [
                  styles.langOption,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  lang === opt.code && { backgroundColor: colors.primary + '12' },
                ]}
                onPress={async () => {
                  const needsRestart = await applyRTLForLang(opt.code);
                  await setLangOverride(opt.code as Lang);
                  // Auto-apply regional unit defaults (only if user hasn't customized units yet)
                  await applyLangUnitDefaults(opt.code);
                  setLangPickerVisible(false);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (needsRestart) {
                    Alert.alert(
                      isRTLLang(opt.code) ? (t.rtlLayoutEnabled ?? 'RTL Layout Enabled') : (t.restartRequired ?? 'Restart Required'),
                      isRTLLang(opt.code)
                        ? `${opt.label} uses right-to-left layout. Reload now to apply the new direction.`
                        : 'The layout direction has changed. Reload now to apply the new layout.',
                      [
                        { text: t.later ?? 'Later', style: 'cancel' },
                        {
                          text: t.reloadApp ?? 'Reload App',
                          onPress: async () => {
                            try { const U = await import('expo-updates'); await U.reloadAsync(); } catch (_unused) { /* dev mode — no-op */ }
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <View style={styles.langOptionRow}>
                  <Text style={{ fontSize: 20, marginRight: 4 }}>{getLangFlag(opt.code)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.langOptionNative, { color: colors.foreground }]}>{opt.native}</Text>
                    <Text style={[styles.langOptionLabel, { color: colors.muted }]}>{opt.label}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isRTLLang(opt.code) && (
                    <View style={{ backgroundColor: '#8B5CF6' + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ color: '#8B5CF6', fontSize: 9, fontWeight: '700' }}>RTL</Text>
                    </View>
                  )}
                  {lang === opt.code && (
                    <IconSymbol name="checkmark" size={16} color={colors.primary} />
                  )}
                  {lang !== opt.code && (
                    <View style={{ backgroundColor: '#0EA5E9' + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ color: '#0EA5E9', fontSize: 9, fontWeight: '700' }}>Smart</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
       </Modal>
      {/* ─── Language Preview Picker Modal ─────────────────────────────────────── */}
      <Modal
        visible={previewPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewPickerVisible(false)}
      >
        <Pressable
          style={styles.langOverlay}
          onPress={() => setPreviewPickerVisible(false)}
        />
        <View style={[styles.langSheet, { backgroundColor: isDark ? '#0A1520' : '#FFFFFF' }]}>
          <View style={styles.langHandle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 }}>
            <Text style={[styles.langSheetTitle, { color: colors.foreground }]}>
              {se.langPreviewTitle ?? 'Language Preview'}
            </Text>
            {activePreviewing && (
              <Pressable
                style={{ backgroundColor: colors.error + '22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                onPress={() => {
                  setPreviewLang(null);
                  setActivePreviewing(null);
                  setPreviewPickerVisible(false);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>{se.langPreviewExit ?? 'Exit Preview'}</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 20, paddingBottom: 10 }}>
            {se.langPreviewPickerHint ?? 'Tap a language to preview. Your real language setting is unchanged.'}
          </Text>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 20 }}>
            {SUPPORTED_LANGUAGES.map((opt) => (
              <Pressable
                key={opt.code}
                style={({ pressed }) => [
                  styles.langOption,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  activePreviewing === opt.code && { backgroundColor: colors.primary + '12' },
                ]}
                onPress={() => {
                  setPreviewLang(opt.code);
                  setActivePreviewing(opt.code);
                  setPreviewPickerVisible(false);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={styles.langOptionRow}>
                  <Text style={{ fontSize: 20, marginRight: 4 }}>{getLangFlag(opt.code)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.langOptionNative, { color: colors.foreground }]}>{opt.native}</Text>
                    <Text style={[styles.langOptionLabel, { color: colors.muted }]}>{opt.label}</Text>
                  </View>
                </View>
                {activePreviewing === opt.code && (
                  <IconSymbol name="checkmark" size={16} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
      {/* ─── Daily Macro Goals Sheet (outside ScrollView so overlay covers full screen) ─── */}
      {macroSheetVisible && (
        <View style={[macroSheetStyles.overlay]}>
          <Pressable style={macroSheetStyles.backdrop} onPress={() => setMacroSheetVisible(false)} />
          <View style={[macroSheetStyles.sheet, { backgroundColor: isDark ? '#0A1520' : '#FFFFFF' }]}>
            <View style={macroSheetStyles.handle} />
            <Text style={[macroSheetStyles.title, { color: colors.foreground }]}>Daily Macro Goals</Text>
            <Text style={[macroSheetStyles.subtitle, { color: colors.muted }]}>Fine-tune your daily nutrition targets</Text>

            {/* Preset chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {/* Custom "My Plan" chip — long-press to rename */}
              <Pressable
                onPress={() => {
                  setMacroInputs({
                    calories: String(customPreset.calories),
                    carbs:    String(customPreset.carbs),
                    protein:  String(customPreset.protein),
                    fat:      String(customPreset.fat),
                  });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                onLongPress={() => {
                  setCustomPresetNameInput(customPreset.name);
                  setCustomPresetNameEditing(true);
                }}
                style={({ pressed }) => ([
                  macroSheetStyles.presetChip,
                  macroInputs.calories === String(customPreset.calories) &&
                  macroInputs.carbs    === String(customPreset.carbs)    &&
                  macroInputs.protein  === String(customPreset.protein)  &&
                  macroInputs.fat      === String(customPreset.fat) && macroSheetStyles.presetChipActive,
                  { opacity: pressed ? 0.75 : 1, borderColor: '#10B981' },
                ])}
              >
                <Text style={macroSheetStyles.presetEmoji}>✏️</Text>
                <Text style={[macroSheetStyles.presetLabel, { color: '#10B981' }]}>{customPreset.name}</Text>
              </Pressable>

              {([
                { id: 'balanced',     emoji: '⚖️', label: 'Balanced',      goals: { calories: 2000, carbs: 250, fat: 65,  protein: 100 } },
                { id: 'vegan_athlete',emoji: '🌱', label: 'Vegan Athlete',  goals: { calories: 2400, carbs: 300, fat: 53,  protein: 180 } },
                { id: 'high_protein', emoji: '🥩', label: 'High-Protein',   goals: { calories: 2000, carbs: 150, fat: 65,  protein: 200 } },
                { id: 'low_carb',     emoji: '🥑', label: 'Low-Carb',       goals: { calories: 1800, carbs: 50,  fat: 120, protein: 135 } },
                { id: 'weight_loss',  emoji: '📉', label: 'Weight Loss',    goals: { calories: 1500, carbs: 169, fat: 50,  protein: 94  } },
                { id: 'endurance',    emoji: '🏃', label: 'Endurance',      goals: { calories: 2800, carbs: 420, fat: 62,  protein: 140 } },
              ]).map(preset => {
                const isActive =
                  macroInputs.calories === String(preset.goals.calories) &&
                  macroInputs.carbs    === String(preset.goals.carbs)    &&
                  macroInputs.protein  === String(preset.goals.protein)  &&
                  macroInputs.fat      === String(preset.goals.fat);
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      setMacroInputs({
                        calories: String(preset.goals.calories),
                        carbs:    String(preset.goals.carbs),
                        protein:  String(preset.goals.protein),
                        fat:      String(preset.goals.fat),
                      });
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={({ pressed }) => ([
                      macroSheetStyles.presetChip,
                      isActive && macroSheetStyles.presetChipActive,
                      { opacity: pressed ? 0.75 : 1 },
                    ])}
                  >
                    <Text style={macroSheetStyles.presetEmoji}>{preset.emoji}</Text>
                    <Text style={[macroSheetStyles.presetLabel, isActive && { color: '#7B61FF' }]}>{preset.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Macro input rows */}
            {([
              { key: 'calories' as const, label: 'Calories', unit: 'kcal', color: '#7B61FF', min: 500,  max: 10000 },
              { key: 'carbs'    as const, label: ((complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en).carbs,   unit: 'g',    color: '#00F5FF', min: 10,   max: 1500  },
              { key: 'protein'  as const, label: ((complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en).protein, unit: 'g',    color: '#FFB800', min: 10,   max: 500   },
              { key: 'fat'      as const, label: ((complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en).fat,     unit: 'g',    color: '#FF2D78', min: 5,    max: 500   },
            ] as const).map(({ key, label, unit, color }) => (
              <View key={key} style={macroSheetStyles.inputRow}>
                <View style={[macroSheetStyles.colorDot, { backgroundColor: color + '30', borderColor: color + '60' }]}>
                  <View style={[macroSheetStyles.colorDotInner, { backgroundColor: color }]} />
                </View>
                <Text style={[macroSheetStyles.inputLabel, { color: colors.foreground }]}>{label}</Text>
                <View style={macroSheetStyles.inputWrap}>
                  <TextInput
                    style={[macroSheetStyles.input, { color: colors.foreground, borderColor: color + '60' }]}
                    value={macroInputs[key]}
                    onChangeText={(v) => setMacroInputs(prev => ({ ...prev, [key]: v }))}
                    keyboardType="default"
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <Text style={[macroSheetStyles.inputUnit, { color: colors.muted }]}>{unit}</Text>
                </View>
              </View>
            ))}

            {/* Rename My Plan modal */}
            {customPresetNameEditing && (
              <View style={[macroSheetStyles.renameRow, { borderColor: '#10B98140' }]}>
                <TextInput
                  style={[macroSheetStyles.renameInput, { color: colors.foreground, borderColor: '#10B98160' }]}
                  value={customPresetNameInput}
                  onChangeText={setCustomPresetNameInput}
                  placeholder={se.presetName ?? 'Preset name'}
                  placeholderTextColor={colors.muted}
                  maxLength={24}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={async () => {
                    const name = customPresetNameInput.trim() || 'My Plan';
                    await saveCustomPreset({ ...customPreset, name });
                    setCustomPresetNameEditing(false);
                  }}
                />
                <Pressable
                  onPress={async () => {
                    const name = customPresetNameInput.trim() || 'My Plan';
                    await saveCustomPreset({ ...customPreset, name });
                    setCustomPresetNameEditing(false);
                  }}
                  style={({ pressed }) => [macroSheetStyles.renameSaveBtn, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={macroSheetStyles.renameSaveText}>Save</Text>
                </Pressable>
              </View>
            )}

            {/* Save as My Plan shortcut */}
            <Pressable
              onPress={async () => {
                const cal  = parseInt(macroInputs.calories, 10);
                const carb = parseInt(macroInputs.carbs, 10);
                const prot = parseInt(macroInputs.protein, 10);
                const fat  = parseInt(macroInputs.fat, 10);
                if (!isNaN(cal) && !isNaN(carb) && !isNaN(prot) && !isNaN(fat)) {
                  await saveCustomPreset({ ...customPreset, calories: cal, carbs: carb, protein: prot, fat });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              style={({ pressed }) => [macroSheetStyles.savePlanBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={macroSheetStyles.savePlanText}>{`\u270F\uFE0F Save as ${customPreset.name}`}</Text>
            </Pressable>

            {/* Action buttons */}
            <View style={macroSheetStyles.actions}>
              <Pressable
                onPress={() => setMacroSheetVisible(false)}
                style={({ pressed }) => [macroSheetStyles.cancelBtn, { opacity: pressed ? 0.6 : 1, borderColor: colors.border }]}
              >
                <Text style={[macroSheetStyles.cancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const cal  = parseInt(macroInputs.calories, 10);
                  const carb = parseInt(macroInputs.carbs, 10);
                  const prot = parseInt(macroInputs.protein, 10);
                  const fat  = parseInt(macroInputs.fat, 10);
                  if (isNaN(cal) || cal < 500 || cal > 10000) { Alert.alert('Invalid', 'Calories must be 500–10,000 kcal'); return; }
                  if (isNaN(carb) || carb < 10 || carb > 1500)  { Alert.alert('Invalid', 'Carbs must be 10–1,500 g'); return; }
                  if (isNaN(prot) || prot < 10 || prot > 500)   { Alert.alert('Invalid', 'Protein must be 10–500 g'); return; }
                  if (isNaN(fat)  || fat  < 5  || fat  > 500)   { Alert.alert('Invalid', 'Fat must be 5–500 g'); return; }
                  await saveMacroGoals({ ...macroGoals, calories: cal, carbs: carb, protein: prot, fat });
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setMacroSheetVisible(false);
                }}
                style={({ pressed }) => [macroSheetStyles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={macroSheetStyles.saveText}>Save Goals</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ─── Set My Goals Sheet ─────────────────────────────────────────────── */}
      <SetGoalsSheet
        visible={goalsSheetVisible}
        onClose={() => setGoalsSheetVisible(false)}
      />
      <ScrollToTopButton opacity={settingsScrollTopOpacity} visible={showSettingsScrollTop} onPress={settingsScrollToTop} />
      {/* Floating wellness disclaimer — absolute overlay, stays visible while scrolling */}
      <FloatingWellnessDisclaimer bottomOffset={80} position="bottom" />
      {/* Key Rotation sheet — Settings > Privacy & Security > Reset Encryption Key */}
      <KeyRotationSheet
        visible={keyRotationSheetVisible}
        onClose={() => setKeyRotationSheetVisible(false)}
      />

    </ScreenContainer>
  );

  /**
   * Shows the GDPR/CCPA consent acceptance timestamp and lets users re-open
   * the consent screen to review or withdraw consent.
   * Defined inside SettingsScreen so it can access the nested SettingsRow component.
   */
  function ManageConsentRow() {
    const consentRouter = useRouter();
    const _consentColors = useColors();
    const [acceptedAt, setAcceptedAt] = React.useState<string | null>(null);

    React.useEffect(() => {
      AsyncStorage.getItem(GDPR_CONSENT_KEY)
        .then((raw) => {
          if (!raw) { setAcceptedAt(null); return; }
          try {
            const parsed = JSON.parse(raw) as { acceptedAt?: string };
            if (parsed.acceptedAt) {
              const d = new Date(parsed.acceptedAt);
              setAcceptedAt(d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
            }
          } catch (_unused) {
            setAcceptedAt(null);
          }
        })
        .catch(() => setAcceptedAt(null));
    }, []);

    return (
      <SettingsRow
        icon="shield.lefthalf.filled"
        iconColor="#6366F1"
        label={se.managePrivacyConsent ?? "Manage Privacy Consent"}
        subtitle={
          acceptedAt
            ? `Accepted on ${acceptedAt} · Tap to review or withdraw`
            : 'Review your privacy consent agreement'
        }
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          consentRouter.push('/consent' as any);
        }}
        rightElement={
          <View style={{
            paddingHorizontal: 8, paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: acceptedAt ? '#6366F120' : '#F59E0B20',
            borderWidth: 1,
            borderColor: acceptedAt ? '#6366F140' : '#F59E0B40',
          }}>
            <Text style={{
              fontSize: 11, fontWeight: '600',
              color: acceptedAt ? '#6366F1' : '#F59E0B',
            }}>
              {acceptedAt ? 'Accepted' : 'Pending'}
            </Text>
          </View>
        }
      />
    );
  }
}

const styles = StyleSheet.create({
  content: { paddingBottom: 16 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 20,
    paddingVertical: 4,
    minHeight: 36,
  },
  section: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 11, fontWeight: '400' },
  dataGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 12, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dataCell: {
    flex: 1, minWidth: '28%', alignItems: 'center', gap: 2,
    paddingVertical: 8, borderRadius: 8,
  },
  dataCellValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  dataCellLabel: { fontSize: 10, fontWeight: '500' },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  sourcesCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 14, borderWidth: 1, padding: 16, gap: 12,
  },
  sourcesTitle: { fontSize: 13, fontWeight: '700' },
  sourcesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
    alignItems: 'center',
  },
  sourceName: { fontSize: 12, fontWeight: '700' },
  sourcePlatform: { fontSize: 9, fontWeight: '500' },
  lastSyncRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  lastSyncDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  lastSyncLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
  lastSyncTime: { fontSize: 11, fontWeight: '400', marginTop: 1 },
  ownershipCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1.5,
    padding: 18, gap: 12,
  },
  ownershipHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ownershipIcon: { fontSize: 22 },
  ownershipTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, flex: 1 },
  ownershipBody: { fontSize: 13, lineHeight: 20 },
  ownershipPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ownershipPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  ownershipPillText: { fontSize: 11, fontWeight: '700' },
  langOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  langSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: 40,
    gap: 4,
  },
  langHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  langSheetTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  langTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  langOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  langOptionNative: { fontSize: 16, fontWeight: '600' },
  langOptionLabel: { fontSize: 13 },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 160,
  },
  langBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: 0,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 8,
  },
});

const macroSheetStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#3F4A5A',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4,
  },
  subtitle: {
    fontSize: 12, fontWeight: '500', marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
  },
  colorDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  colorDotInner: {
    width: 12, height: 12, borderRadius: 6,
  },
  inputLabel: {
    flex: 1, fontSize: 14, fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  input: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, fontWeight: '700',
    minWidth: 80, textAlign: 'center',
  },
  inputUnit: {
    fontSize: 12, fontWeight: '500', minWidth: 28,
  },
  actions: {
    flexDirection: 'row', gap: 12, marginTop: 8,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, alignItems: 'center',
  },
  cancelText: {
    fontSize: 14, fontWeight: '600',
  },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#7B61FF', alignItems: 'center',
  },
  saveText: {
    fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3,
  },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#2A3A4A',
    backgroundColor: '#0A1520',
  },
  presetChipActive: {
    borderColor: '#7B61FF80',
    backgroundColor: '#7B61FF18',
  },
  presetEmoji: { fontSize: 14 },
  presetLabel: {
    fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.2,
  },
  renameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 8, marginBottom: 8,
  },
  renameInput: {
    flex: 1, borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 13, fontWeight: '600',
  },
  renameSaveBtn: {
    backgroundColor: '#10B981', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  renameSaveText: {
    fontSize: 12, fontWeight: '800', color: '#FFFFFF',
  },
  savePlanBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B98112',
    borderWidth: 1, borderColor: '#10B98140',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 12,
  },
  savePlanText: {
    fontSize: 12, fontWeight: '700', color: '#10B981', letterSpacing: 0.2,
  },
});
