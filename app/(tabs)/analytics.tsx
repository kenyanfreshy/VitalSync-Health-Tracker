/**
 * Correlation Engine Screen
 * Evidence-based health insight cards + scatter plot + regression line.
 * Scientific models: Allostatic Load, Sleep-CV Reciprocity, HRV-Guided Training (Kibler),
 * 72-Hour Lag Analysis, Circadian Rhythm, Medication Pharmacodynamics.
 *
 * Share feature: each insight card has a share button that formats the
 * Hypothesis + Evidence Level + Clinical Suggestion as plain text and opens
 * the native share sheet (or copies to clipboard on web).
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Pressable,
  Modal,
  FlatList,
  useColorScheme,
  Animated,
  Platform,
  LayoutAnimation,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FloatingWellnessDisclaimer } from '@/components/floating-wellness-disclaimer';
import { ScreenContainer } from '@/components/screen-container';
import { useRTL } from '@/hooks/use-rtl';
import { GlassCard } from '@/components/glass-card';
import { SectionLabel } from '@/components/dashboard/section-label';
import { useHealth } from '@/lib/health/health-context';
import { HR_WINDOW_SHORT, loadHrWindow, type HrWindowSize } from '@/lib/health/hr-window-pref';
import { useColors, useCorrelationStrings, useLang } from '@/hooks';
import { disclaimerStrings, settingsStrings } from '@/lib/i18n';
import { intelligenceName, interpolate } from '@/lib/intelligence';
import {
  computeCorrelation,
  METRIC_LABELS,
  METRIC_COLORS,
  type MetricKey,
} from '@/lib/health/correlation';
import {
  runCorrelationEngine,
  type EngineInsight,
  type EvidenceLevel,
} from '@/lib/health/correlation-engine';
import { shareInsight } from '@/lib/health/share-insight';
import { fetchEKGFirstPage, type EKGRecord } from '@/lib/health/ekg-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NutritionCorrelateCard } from '@/components/nutrition-correlate-card';
import { useMacroGoals } from '@/hooks/use-macro-goals';
import { CaloricTrendInsightCard } from '@/components/caloric-trend-insight-card';
import { WeeklyMacroIntelCard } from '@/components/weekly-macro-intel-card';
import { ReadinessHistoryChart } from '@/components/readiness-history-chart';
import { InsightEngine } from '@/components/dashboard/insight-engine';
import { WellnessSummarySection } from '@/components/dashboard/wellness-summary';
import { PatternExplorer } from '@/components/dashboard/pattern-explorer';
import { CorrelationTrendChart } from '@/components/correlation-trend-chart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { safeSetItem } from '@/lib/safe-async-storage';
import { router } from 'expo-router';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { useSubscription } from '@/lib/subscription/subscription-context';
import { Linking } from 'react-native';
import { CORRELATION_REFS, getRefsForCategories, type PeerRef } from '@/lib/health/peer-review-refs';

// Nutrition section peer-review refs (pre-computed at module level)
const NUTRITION_CORRELATE_REFS = CORRELATION_REFS['correlate'] ?? [];
const NUTRITION_DIABETIC_REFS  = CORRELATION_REFS['nutrition'] ?? [];
const NUTRITION_CALORIC_REFS   = CORRELATION_REFS['caloric'] ?? [];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_SIZE = SCREEN_WIDTH - 64;
const PAD = 40;

const METRIC_PAIRS: [MetricKey, MetricKey][] = [
  ['sleepEfficiency', 'bpSystolic'],
  ['sleepHours', 'bpSystolic'],
  ['deepSleepMinutes', 'hrv'],
  ['weight', 'bpSystolic'],
  ['hrv', 'heartRate'],
  ['sleepEfficiency', 'heartRate'],
  // Resting HR correlation pairs
  ['sleepEfficiency', 'restingHR'],
  ['sleepHours', 'restingHR'],
  ['deepSleepMinutes', 'restingHR'],
  ['hrv', 'restingHR'],
  // AFib correlation pairs
  ['afibCount', 'hrv'],
  ['afibCount', 'sleepEfficiency'],
  ['afibCount', 'sleepHours'],
  ['afibCount', 'heartRate'],
];

const ALL_METRICS = Object.keys(METRIC_LABELS) as MetricKey[];

const CATEGORY_ICONS: Record<EngineInsight['category'], string> = {
  'allostatic-load': '⚡',
  'sleep-cv': '🫀',
  'hrv-training': '📈',
  'lag-analysis': '⏱',
  'circadian-rhythm': '🌙',
  'medication-dipping': '💊',
  'sodium-sensitivity': '🧂',
  'na-k-ratio': '⚖️',
  'postmeal-glucose': '🩸',
  'resting-hr-sleep': '🌙',
  'resting-hr-hrv': '❤️',
};

function getCategoryTitles(cs: {
  allostaticLoad?: string; sleepCv?: string; hrvTraining?: string; lagAnalysis?: string;
  circadianRhythm?: string; medicationDipping?: string; sodiumSensitivity?: string;
  naKRatio?: string; postmealGlucose?: string; restingHrSleep?: string; restingHrHrv?: string;
}): Record<EngineInsight['category'], string> {
  return {
    'allostatic-load': cs.allostaticLoad ?? 'Allostatic Load',
    'sleep-cv': cs.sleepCv ?? 'Sleep-CV Reciprocity',
    'hrv-training': cs.hrvTraining ?? 'HRV Recovery (Kibler)',
    'lag-analysis': cs.lagAnalysis ?? '72-Hour Lag Effect',
    'circadian-rhythm': cs.circadianRhythm ?? 'Circadian Rhythm',
    'medication-dipping': cs.medicationDipping ?? 'Medication Dipping',
    'sodium-sensitivity': cs.sodiumSensitivity ?? 'Compile Diet Sodium Sensitivity',
    'na-k-ratio': cs.naKRatio ?? 'Na:K Ratio (INTERSALT)',
    'postmeal-glucose': cs.postmealGlucose ?? 'Post-Meal Glucose Correlation',
    'resting-hr-sleep': cs.restingHrSleep ?? 'Sleep → Resting HR',
    'resting-hr-hrv': cs.restingHrHrv ?? 'HRV ↔ Resting HR',
  };
}

// ─── Evidence dots ────────────────────────────────────────────────────────────

function EvidenceDots({ level }: { level: EvidenceLevel; color: string }) {
  return (
    <View style={styles.evidenceDots}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[styles.evidenceDot, { opacity: i <= level ? 1 : 0.2 }]}
        />
      ))}
    </View>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────

function ShareToast({ visible, usedClipboard }: { visible: boolean; usedClipboard: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.toastText}>
        {usedClipboard ? '📋 Copied to clipboard' : '✓ Shared successfully'}
      </Text>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const analyticsScrollRef = useRef<import('react-native').ScrollView | null>(null);
  const { showScrollTop: showAnalyticsScrollTop, scrollTopOpacity: analyticsScrollTopOpacity, handleScroll: handleAnalyticsScroll, scrollToTop: analyticsScrollToTop } = useScrollToTop(analyticsScrollRef);
  const colors = useColors();
  const { isPremium: isAnalyticsPremium, openPaywall: openAnalyticsPaywall } = usePremiumGate();
  const { hasIntroOffer, introOfferDays } = useSubscription();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const lang = useLang();
  const ds = (disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en;
  const cs = useCorrelationStrings();
  const analyticsCta = hasIntroOffer && introOfferDays
    ? (cs.premiumCta ?? `Start ${introOfferDays}-Day Free Trial`).replace('{days}', String(introOfferDays))
    : (cs.subscribeToPremium ?? 'Subscribe to Premium');
  const isRTL = useRTL();
  const { state, dietType } = useHealth();
  const [hrWindow, setHrWindow] = useState<HrWindowSize>("4h");
  React.useEffect(() => { loadHrWindow().then(setHrWindow); }, []);
  // EKG records for AFib episode count metric
  const [ekgRecords, setEkgRecords] = useState<EKGRecord[]>([]);
  React.useEffect(() => {
    fetchEKGFirstPage().then((r) => setEkgRecords(r.records)).catch(() => {});
  }, []);
  /** Returns the display label for a metric, using the active HR window for heartRate */
  const getMetricLabel = (m: MetricKey): string => {
    if (m === 'heartRate') return `Heart Rate (${HR_WINDOW_SHORT[hrWindow]})`;
    if (m === 'restingHR') return 'Resting HR (bpm)';
    return METRIC_LABELS[m];
  };
  const [xMetric, setXMetric] = useState<MetricKey>('sleepEfficiency');
  const [yMetric, setYMetric] = useState<MetricKey>('bpSystolic');
  const [showXPicker, setShowXPicker] = useState(false);
  const [showYPicker, setShowYPicker] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastClipboard, setToastClipboard] = useState(false);
  const [dashExpanded, setDashExpanded] = useState(true);
  const [diabeticExpanded, setDiabeticExpanded] = useState(true);
  const [dashDietExpanded, setDashDietExpanded] = useState(true);
  const [circadianLagTab, setCircadianLagTab] = useState<'circadian' | 'lag'>('circadian');
  // Reanimated shared value: 0 = circadian, 1 = lag
  const circadianLagProgress = useSharedValue(0);
  // Nutrition tab fade animation
  const nutritionTabOpacity = useSharedValue(1);
  const nutritionTabAnimStyle = useAnimatedStyle(() => ({
    opacity: nutritionTabOpacity.value,
  }));
  const [nutritionMergedExpanded, setNutritionMergedExpanded] = useState(false);
  const [observedExpanded, setObservedExpanded] = useState(false);
  const [nutritionTab, setNutritionTab] = useState<'correlate' | 'diabetic' | 'caloric' | 'macro'>('correlate');
  const [bestNutritionStreak, setBestNutritionStreak] = useState(0);

  // Persist nutritionTab across sessions
  const NUTRITION_TAB_KEY = '@vitalsync/nutrition_active_tab_v1';
  const NUTRITION_BEST_STREAK_KEY = '@vitalsync/nutrition_best_streak_v1';
  useEffect(() => {
    AsyncStorage.getItem(NUTRITION_TAB_KEY).then(v => {
      if (v === 'correlate' || v === 'diabetic' || v === 'caloric' || v === 'macro') setNutritionTab(v as 'correlate' | 'diabetic' | 'caloric' | 'macro');
    }).catch(() => {});
    AsyncStorage.getItem(NUTRITION_BEST_STREAK_KEY).then(v => {
      if (v) setBestNutritionStreak(parseInt(v, 10) || 0);
    }).catch(() => {});
  }, []);
  const { goals: macroGoals } = useMacroGoals();

  // Persist collapsed/expanded state across app restarts
  const CORRELATE_STATE_KEY = '@vitalsync/correlate_sections_v2';
  useEffect(() => {
    AsyncStorage.getItem(CORRELATE_STATE_KEY).then(v => {
      if (v) {
        try {
          const s = JSON.parse(v);
          if (typeof s.dash === 'boolean') setDashExpanded(s.dash);
          if (typeof s.diabetic === 'boolean') setDiabeticExpanded(s.diabetic);
          if (typeof s.dashDiet === 'boolean') setDashDietExpanded(s.dashDiet);
        } catch (_unused) { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  function persistSections(dash: boolean, diabetic: boolean, dashDiet: boolean) {
    safeSetItem(CORRELATE_STATE_KEY, JSON.stringify({ dash, diabetic, dashDiet })).catch(() => {});
  }
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [committedX, setCommittedX] = useState<MetricKey>('sleepEfficiency');
  const [committedY, setCommittedY] = useState<MetricKey>('bpSystolic');
  function toggleSection(setter: React.Dispatch<React.SetStateAction<boolean>>, key: 'dash' | 'diabetic' | 'dashDiet') {
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
      create: { type: 'easeInEaseOut', property: 'opacity' },
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter((v) => {
      const next = !v;
      const d = key === 'dash' ? next : dashExpanded;
      const di = key === 'diabetic' ? next : diabeticExpanded;
      const dd = key === 'dashDiet' ? next : dashDietExpanded;
      persistSections(d, di, dd);
      return next;
    });
  }

  // ── Scatter plot correlation ──────────────────────────────────────────────
  // Augment state.data with _ekgRecords so the afibCount metric can be extracted
  const dataWithEKG = useMemo(() => {
    if (!state.data) return null;
    return { ...state.data, _ekgRecords: ekgRecords };
  }, [state.data, ekgRecords]);
  const result = useMemo(() => {
    if (!dataWithEKG) return null;
    return computeCorrelation(dataWithEKG as any, committedX, committedY);
  }, [dataWithEKG, committedX, committedY]);

  function runAnalysis() {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Simulate a brief analysis delay for UX feedback, then commit the selected metrics
    setTimeout(() => {
      setCommittedX(xMetric);
      setCommittedY(yMetric);
      setIsAnalyzing(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 800);
  }

  const normalizedPoints = useMemo(() => {
    if (!result || !result.points.length) return [];
    const xs = result.points.map((p) => p.x);
    const ys = result.points.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const drawW = CHART_SIZE - PAD * 2;
    const drawH = CHART_SIZE - PAD * 2;
    return result.points.map((p) => ({
      // For RTL: mirror the X coordinate so the axis reads right-to-left
      cx: isRTL
        ? CHART_SIZE - PAD - ((p.x - xMin) / xRange) * drawW
        : PAD + ((p.x - xMin) / xRange) * drawW,
      cy: CHART_SIZE - PAD - ((p.y - yMin) / yRange) * drawH,
      date: p.date,
    }));
  }, [result, isRTL]);

  const regressionLine = useMemo(() => {
    if (!result || !result.points.length) return null;
    const xs = result.points.map((p) => p.x);
    const ys = result.points.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const _xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const drawW = CHART_SIZE - PAD * 2;
    const drawH = CHART_SIZE - PAD * 2;
    const y1 = result.slope * xMin + result.intercept;
    const y2 = result.slope * xMax + result.intercept;
    // For RTL: swap x1/x2 so the regression line mirrors correctly
    return {
      x1: isRTL ? CHART_SIZE - PAD : PAD,
      y1: CHART_SIZE - PAD - ((y1 - yMin) / yRange) * drawH,
      x2: isRTL ? PAD : PAD + drawW,
      y2: CHART_SIZE - PAD - ((y2 - yMin) / yRange) * drawH,
    };
  }, [result, isRTL]);

  const strengthColor = result
    ? result.strength === 'strong' ? colors.bpGreen
    : result.strength === 'moderate' ? colors.bpAmber
    : result.strength === 'weak' ? colors.muted
    : colors.border
    : colors.border;

  // ── Evidence-based insights ───────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!state.data) return [];
    return runCorrelationEngine(state.data);
  }, [state.data]);

  const hasData = state.data && (
    (state.data.pulse ?? []).length > 0 ||
    (state.data.bloodPressure ?? []).length > 0 ||
    (state.data.sleep ?? []).length > 0
  );

  // ── Nutrition header badge values ─────────────────────────────────────────
  const { todayNutritionCount, todayCaloriesKcal, nutritionStreak } = useMemo(() => {
    const allRecords = state.data?.sodiumIntake ?? [];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayRecs = allRecords.filter(r => new Date(r.timestamp) >= todayStart);
    const count = todayRecs.length;
    const kcal = Math.round(todayRecs.reduce((s, r) => s + (r.calories ?? 0), 0));

    // Compute consecutive days with at least one entry (streak)
    let streak = 0;
    if (count > 0) {
      // today counts as day 1
      streak = 1;
      let checkDate = new Date(todayStart);
      checkDate.setDate(checkDate.getDate() - 1);
      while (true) {
        const nextDay = new Date(checkDate); nextDay.setDate(nextDay.getDate() + 1);
        const hasEntry = allRecords.some(r => {
          const d = new Date(r.timestamp);
          return d >= checkDate && d < nextDay;
        });
        if (!hasEntry) break;
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }
    // Update best streak in AsyncStorage if current streak is a new record
    if (streak > 0) {
      AsyncStorage.getItem('@vitalsync/nutrition_best_streak_v1').then(v => {
        const prev = parseInt(v ?? '0', 10) || 0;
        if (streak > prev) {
          safeSetItem('@vitalsync/nutrition_best_streak_v1', String(streak))
            .then(() => setBestNutritionStreak(streak))
            .catch(() => {});
        }
      }).catch(() => {});
    }
    return { todayNutritionCount: count, todayCaloriesKcal: kcal, nutritionStreak: streak };
  }, [state.data?.sodiumIntake]);

  // ── Observed Historical Patterns data density (for header badge) ────────────
  const { observedHasData, observedHasLowData, observedUniqueDays } = useMemo(() => {
    if (!state.data) return { observedHasData: false, observedHasLowData: false, observedUniqueDays: 0 };
    // Count unique days across all primary trend metrics: pulse, sleep, bloodPressure
    const daySet = new Set<string>();
    const addDays = (records: Array<{ timestamp: string | number | Date }>) => {
      records.forEach(r => {
        const d = new Date(r.timestamp);
        daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      });
    };
    addDays(state.data.pulse ?? []);
    // SleepRecord uses .date (YYYY-MM-DD) not .timestamp
    (state.data.sleep ?? []).forEach(r => {
      const d = new Date(r.date);
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    addDays(state.data.bloodPressure ?? []);
    const uniqueDays = daySet.size;
    return {
      observedHasData: uniqueDays > 0,
      observedHasLowData: uniqueDays > 0 && uniqueDays < 7,
      observedUniqueDays: uniqueDays,
    };
  }, [state.data]);

  // ── Nutrition data density (for empty-state logic) ──────────────────────
  const { nutritionHasData, nutritionHasLowData, nutritionUniqueDays } = useMemo(() => {
    const allRecords = state.data?.sodiumIntake ?? [];
    const uniqueDays = new Set(
      allRecords.map(r => {
        const d = new Date(r.timestamp);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    ).size;
    return {
      nutritionHasData: uniqueDays > 0,
      nutritionHasLowData: uniqueDays > 0 && uniqueDays < 7,
      nutritionUniqueDays: uniqueDays,
    };
    }, [state.data?.sodiumIntake]);
  // ── Macro data density (for Macro tab empty-state logic) ─────────────────
  const { macroHasData, macroHasLowData, macroUniqueDays } = useMemo(() => {
    const allRecords = (state.data?.sodiumIntake ?? []).filter(
      r => (r.proteinG ?? 0) > 0 || (r.carbsG ?? 0) > 0 || (r.fatG ?? 0) > 0
    );
    const uniqueDays = new Set(
      allRecords.map(r => {
        const d = new Date(r.timestamp);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    ).size;
    return {
      macroHasData: uniqueDays > 0,
      macroHasLowData: uniqueDays > 0 && uniqueDays < 7,
      macroUniqueDays: uniqueDays,
    };
  }, [state.data?.sodiumIntake]);
  // ── Share handler ─────────────────────────────────────────────────────────
  const handleShare = useCallback(async (insight: EngineInsight) => {
    if (sharingId) return; // prevent double-tap
    setSharingId(insight.id);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const result = await shareInsight(insight);
    setSharingId(null);
    if (result.success) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setToastClipboard(result.usedClipboard ?? false);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2800);
    }
  }, [sharingId]);

  // ── Metric Picker Modal ───────────────────────────────────────────────────
  function MetricPicker({ visible, onClose, onSelect, current }: {
    visible: boolean;
    onClose: () => void;
    onSelect: (m: MetricKey) => void;
    current: MetricKey;
  }) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View style={[styles.modalSheet, {
            backgroundColor: isDark ? colors.surfaceHigh : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
          }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Metric</Text>
            <FlatList
              data={ALL_METRICS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.metricOption,
                    { borderColor: isDark ? colors.borderStrong : colors.border },
                    item === current && { backgroundColor: METRIC_COLORS[item] + (isDark ? '25' : '15') },
                  ]}
                  onPress={() => { onSelect(item); onClose(); }}
                >
                  <View style={[styles.metricDot, { backgroundColor: METRIC_COLORS[item] }]} />
                  <Text style={[styles.metricOptionText, {
                    color: item === current ? METRIC_COLORS[item] : colors.foreground,
                    fontWeight: item === current ? '700' : '500',
                  }]}>
                    {getMetricLabel(item)}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView ref={analyticsScrollRef} onScroll={handleAnalyticsScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Wellness disclaimer moved to floating overlay — see below */}

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>{cs.correlationEngine}</Text>
          {!isAnalyticsPremium && (
            <View style={{ backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 12, padding: 14, marginTop: 8, marginHorizontal: 4 }}>
              <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 14, marginBottom: 4 }}>{cs.premiumFeatureTitle ?? '🔒 Premium Feature'}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{cs.premiumFeatureSub ?? 'Advanced correlations between your vitals, nutrition, sleep, and activity are available with VitalSync Premium.'}</Text>
              <TouchableOpacity onPress={openAnalyticsPaywall} style={{ marginTop: 10, backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{analyticsCta}</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {cs.evidenceSubtitle}
          </Text>
        </View>

        {/* ─── Wellness Summary (above Observed Historical Patterns) ──────── */}
        <View style={{ height: 14 }} />
        {state.data && <WellnessSummarySection data={state.data} />}

        {/* ─── Observed Historical Patterns ─ LogCard style ──────────────── */}
        <View style={{ height: 10 }} />
        <GlassCard accentColor="#64748B" noPadding style={{ marginHorizontal: 16, marginBottom: 10 }}>
          <Pressable
            style={styles.logCardHeader}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              LayoutAnimation.configureNext({ duration: 220, update: { type: 'easeInEaseOut' }, create: { type: 'easeInEaseOut', property: 'opacity' }, delete: { type: 'easeInEaseOut', property: 'opacity' } });
              setObservedExpanded(v => !v);
            }}
            accessibilityRole="button"
          >
            <View style={styles.logCardIconWrap}>
              <Text style={{ fontSize: 24 }}>📈</Text>
            </View>
            <View style={styles.logCardContent}>
              <Text style={[styles.logCardTitle, { color: colors.foreground }]}>{cs.observedPatternsLabel ?? 'Observed Historical Patterns'}</Text>
              <Text style={[styles.logCardSubtitle, { color: colors.muted }]}>{cs.observedPatternsSubtitle ?? 'Trend lines · 30-day rolling correlations'}</Text>
            </View>
            {/* Progress badge — visible when collapsed so users see data-building progress */}
            {(observedHasLowData || !observedHasData) && (
              <View style={[styles.observedProgressBadge, { borderColor: '#3B82F6' + '40', backgroundColor: '#3B82F6' + '12' }]}>
                <Text style={[styles.observedProgressText, { color: '#3B82F6' }]}>
                  {(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', String(observedUniqueDays))}
                </Text>
              </View>
            )}
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </Pressable>
          {observedExpanded && (
            <View style={{ paddingBottom: 12 }}>
              <CorrelationTrendChart data={state.data ?? null} days={30} />
            </View>
          )}
        </GlassCard>
        <View style={{ height: 4 }} />
        {/* ─── Nutrition Analysis — LogCard style ─────────────────────────── */}
        <GlassCard accentColor="#10B981" noPadding style={{ marginHorizontal: 16, marginBottom: 10 }}>
          {/* ── Collapsible header — matches Record tab LogCard style exactly ── */}
          <Pressable
            style={styles.logCardHeader}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              LayoutAnimation.configureNext({
                duration: 220,
                update: { type: 'easeInEaseOut' },
                delete: { type: 'easeInEaseOut', property: 'opacity' },
                create: { type: 'easeInEaseOut', property: 'opacity' },
              });
              setNutritionMergedExpanded(v => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel={cs.nutritionAnalysis}
            accessibilityHint={nutritionMergedExpanded ? (cs.tapToCollapse ?? 'Tap to collapse') : (cs.tapToExpand ?? 'Tap to expand')}
          >
            <View style={styles.logCardIconWrap}>
              <Text style={{ fontSize: 24 }}>🥗</Text>
            </View>
            <View style={styles.logCardContent}>
              <Text style={[styles.logCardTitle, { color: colors.foreground }]}>{cs.nutritionAnalysis}</Text>
              <Text style={[styles.logCardSubtitle, { color: colors.muted }]}>
                {todayNutritionCount > 0
                  ? `${todayNutritionCount} ${todayNutritionCount === 1 ? 'entry' : 'entries'}${todayCaloriesKcal > 0 ? ` · ${todayCaloriesKcal.toLocaleString()} kcal` : ''}${nutritionStreak >= 2 ? ` · 🔥 ${nutritionStreak}d streak` : ''}`
                  : (cs.noEntriesToday ?? 'No entries today')}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </Pressable>

          {/* ── Four-tab switcher always visible ── */}
          <View style={[styles.nutritionTabRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
            {([
              { key: 'correlate', label: cs.tabCorrelate,  color: '#10B981' },
              { key: 'diabetic',  label: cs.tabDiabetic,   color: '#0EA5E9' },
              { key: 'caloric',   label: cs.tabCaloric,    color: '#F59E0B' },
              { key: 'macro',     label: cs.tabMacro ?? '\u{1F96C} Macros', color: '#8B5CF6' },
            ] as const).map(({ key, label, color }) => {
              const active = nutritionTab === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.nutritionTabChip, {
                    flex: 1,
                    backgroundColor: active ? color + '20' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                    borderColor: active ? color + '60' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                  }]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    nutritionTabOpacity.value = withTiming(0, { duration: 100, easing: Easing.out(Easing.quad) }, () => {
                      nutritionTabOpacity.value = withTiming(1, { duration: 180, easing: Easing.in(Easing.quad) });
                    });
                    setNutritionTab(key);
                    safeSetItem('@vitalsync/nutrition_active_tab_v1', key).catch(() => {});
                    if (!nutritionMergedExpanded) {
                      LayoutAnimation.configureNext({ duration: 220, update: { type: 'easeInEaseOut' }, create: { type: 'easeInEaseOut', property: 'opacity' } });
                      setNutritionMergedExpanded(true);
                    }
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.nutritionTabLabel, { color: active ? color : colors.muted, fontWeight: active ? '700' : '500' }]}>
                    {label}
                  </Text>
                  {active && (
                    <View style={[styles.nutritionTabUnderline, { backgroundColor: color }]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {nutritionMergedExpanded && (
            <View>
              {/* ── Tab content (Reanimated fade on switch) ── */}
              <Reanimated.View style={nutritionTabAnimStyle}>
              {nutritionTab === 'correlate' && (
                <View>
                  {/* ── Correlate empty / low-data states ── */}
                  {!nutritionHasData ? (
                    <View style={[styles.nutritionEmptyState, { marginHorizontal: 16, marginBottom: 12, backgroundColor: isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)', borderColor: '#10B981' + '30' }]}>
                      <Text style={styles.nutritionEmptyIcon}>🥗</Text>
                      <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.noNutritionDataTitle ?? 'No Nutrition Data Yet'}</Text>
                      <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                        {cs.noNutritionDataBody ?? 'Log meals to see your nutrition correlate score and dietary quality patterns here.'}
                      </Text>
                      <View style={[styles.nutritionEmptyProgressBadge, { borderColor: '#10B981' + '40', backgroundColor: '#10B981' + '12' }]}>
                        <Text style={[styles.nutritionEmptyProgressText, { color: '#10B981' }]}>{(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', '0')}</Text>
                      </View>
                      <Pressable
                        style={[styles.nutritionEmptyCTA, { backgroundColor: '#10B981' + '20', borderColor: '#10B981' + '50' }]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push('/(tabs)/log');
                        }}
                      >
                        <Text style={[styles.nutritionEmptyCTAText, { color: '#10B981' }]}>{cs.logMealCta ?? '+ Log a Meal'}</Text>
                      </Pressable>
                    </View>
                  ) : nutritionHasLowData ? (
                    <View style={[styles.nutritionEmptyState, { marginHorizontal: 16, marginBottom: 12, backgroundColor: isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)', borderColor: '#10B981' + '30' }]}>
                      <Text style={styles.nutritionEmptyIcon}>📈</Text>
                      <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.buildingNutritionTitle ?? 'Building Your Nutrition Pattern'}</Text>
                      <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                        {cs.buildingNutritionBody ?? 'Keep logging meals — your nutrition correlate score becomes available after 7 days of data.'}
                      </Text>
                      <View style={[styles.nutritionEmptyProgressBadge, { borderColor: '#10B981' + '40', backgroundColor: '#10B981' + '12' }]}>
                        <Text style={[styles.nutritionEmptyProgressText, { color: '#10B981' }]}>{(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', String(nutritionUniqueDays))}</Text>
                      </View>
                      <View style={[styles.nutritionEmptyProgressBar, { backgroundColor: '#10B981' + '20' }]}>
                        <View style={[styles.nutritionEmptyProgressFill, { backgroundColor: '#10B981', width: `${Math.min(Math.round((nutritionUniqueDays / 7) * 100), 100)}%` as `${number}%` }]} />
                      </View>
                    </View>
                  ) : null}
                  {nutritionHasData && (
                  <NutritionCorrelateCard
                    sodiumRecords={state.data?.sodiumIntake ?? []}
                    collapsed={!dashExpanded}
                    onToggle={() => toggleSection(setDashExpanded, 'dash')}
                  />)}
                  {NUTRITION_CORRELATE_REFS.length > 0 && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 4 }}>
                      <Text style={[styles.citationLabel, { color: colors.muted }]}>References:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {NUTRITION_CORRELATE_REFS.map((ref, idx) => (
                          <Pressable
                            key={ref.id}
                            onPress={() => ref.url ? Linking.openURL(ref.url) : undefined}
                            style={[styles.citationBadge, { borderColor: '#10B98160', backgroundColor: '#10B98115' }]}
                          >
                            <Text style={[styles.citationBadgeText, { color: '#10B981' }]}>[{idx + 1}] {ref.shortRef}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {nutritionTab === 'diabetic' && (() => {
                const sodiumRecords = state.data?.sodiumIntake ?? [];
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const todayRecords = sodiumRecords.filter(r => new Date(r.timestamp) >= today);
                const todayCal   = todayRecords.reduce((s, r) => s + (r.calories ?? 0), 0);
                const todayCarbs = todayRecords.reduce((s, r) => s + (r.carbsG ?? 0), 0);
                const todaySugar = todayRecords.reduce((s, r) => s + (r.sugarG ?? 0), 0);
                const todayFiber = todayRecords.reduce((s, r) => s + (r.fiberG ?? 0), 0);
                const todayFat   = todayRecords.reduce((s, r) => s + (r.fatG ?? 0), 0);
                const todayProt  = todayRecords.reduce((s, r) => s + (r.proteinG ?? 0), 0);
                const todayGL    = todayRecords.filter(r => r.glycemicLoad != null).reduce((s, r) => s + (r.glycemicLoad ?? 0), 0);
                const hasNutrition = todayCal > 0 || todayCarbs > 0;
                const carbPct  = todayCal > 0 ? Math.round((todayCarbs * 4 / todayCal) * 100) : 0;
                const fatPct   = todayCal > 0 ? Math.round((todayFat   * 9 / todayCal) * 100) : 0;
                const protPct  = todayCal > 0 ? Math.round((todayProt  * 4 / todayCal) * 100) : 0;
                const glColor  = todayGL <= 10 ? '#10B981' : todayGL <= 19 ? '#F59E0B' : '#EF4444';
                const glLabel  = todayGL <= 10 ? (cs.lowGL ?? 'Low') : todayGL <= 19 ? (cs.mediumGL ?? 'Medium') : (cs.highGL ?? 'High');
                const sugarWarn = todaySugar > 25;
                return (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, gap: 12 }}>
                    {!hasNutrition ? (
                      <View style={[styles.nutritionEmptyState, { backgroundColor: isDark ? 'rgba(14,165,233,0.07)' : 'rgba(14,165,233,0.05)', borderColor: '#0EA5E9' + '30' }]}>
                        <Text style={styles.nutritionEmptyIcon}>🥗</Text>
                        <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.noEntriesToday ?? 'No entries logged today'}</Text>
                        <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                          Log a meal to see your caloric &amp; glycemic summary here.
                        </Text>
                        <Pressable
                          style={[styles.nutritionEmptyCTA, { backgroundColor: '#0EA5E9' + '20', borderColor: '#0EA5E9' + '50' }]}
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/(tabs)/log');
                          }}
                        >
                          <Text style={[styles.nutritionEmptyCTAText, { color: '#0EA5E9' }]}>{cs.logMealCta ?? '+ Log a Meal'}</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <View style={styles.diabeticHeader}>
                          <Text style={[styles.diabeticTitle, { color: '#0EA5E9' }]}>🩺 {cs.caloricGlycemicSummary ?? "Today's Caloric & Glycemic Summary"}</Text>
                          <Text style={[styles.diabeticSub, { color: colors.muted }]}>
                            {(cs.entriesLogged ?? '{n} entr{suffix} logged')
                              .replace('{n}', String(todayRecords.length))
                              .replace('{suffix}', todayRecords.length === 1 ? 'y' : 'ies')}
                          </Text>
                        </View>
                        {todayCal > 0 && (
                          <View style={[styles.diabeticCalRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.diabeticCalValue, { color: colors.foreground }]}>{Math.round(todayCal)}</Text>
                            <View>
                              <Text style={[styles.diabeticCalLabel, { color: colors.muted }]}>{cs.kcalToday ?? 'kcal today'}</Text>
                              <Text style={[styles.diabeticCalSub, { color: colors.muted }]}>
                                {macroGoals.calories > 0
                                  ? (cs.yourGoal ?? 'Your goal: {cal} kcal/day ({pct}%)')
                                      .replace('{cal}', macroGoals.calories.toLocaleString())
                                      .replace('{pct}', String(Math.round((todayCal / macroGoals.calories) * 100)))
                                  : (cs.adaTarget ?? 'ADA target: 1,600–2,400 kcal/day')}
                              </Text>
                            </View>
                          </View>
                        )}
                        {todayCal > 0 && (
                          <View style={styles.macroBarWrap}>
                            <View style={styles.macroBarTrack}>
                              <View style={[styles.macroBarSeg, { flex: carbPct, backgroundColor: '#F59E0B' }]} />
                              <View style={[styles.macroBarSeg, { flex: fatPct,  backgroundColor: '#8B5CF6' }]} />
                              <View style={[styles.macroBarSeg, { flex: protPct, backgroundColor: '#10B981' }]} />
                            </View>
                            <View style={[styles.macroLegend, isRTL && { flexDirection: 'row-reverse' }]}>
                              <Text style={[styles.macroLegendItem, { color: '#F59E0B' }]}>■ Carbs {carbPct}%</Text>
                              <Text style={[styles.macroLegendItem, { color: '#8B5CF6' }]}>■ Fat {fatPct}%</Text>
                              <Text style={[styles.macroLegendItem, { color: '#10B981' }]}>■ Protein {protPct}%</Text>
                            </View>
                          </View>
                        )}
                        <View style={styles.diabeticMetricRow}>
                          {todayCarbs > 0 && (
                            <View style={[styles.diabeticMetric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                              <Text style={[styles.diabeticMetricValue, { color: '#F59E0B' }]}>{Math.round(todayCarbs)}g</Text>
                              <Text style={[styles.diabeticMetricLabel, { color: colors.muted }]}>Carbs</Text>
                            </View>
                          )}
                          {todaySugar > 0 && (
                            <View style={[styles.diabeticMetric, {
                              backgroundColor: sugarWarn ? '#EF444410' : colors.surface,
                              borderColor: sugarWarn ? '#EF444450' : colors.border,
                            }]}>
                              <Text style={[styles.diabeticMetricValue, { color: sugarWarn ? '#EF4444' : colors.foreground }]}>
                                {Math.round(todaySugar)}g
                              </Text>
                              <Text style={[styles.diabeticMetricLabel, { color: colors.muted }]}>Sugar{sugarWarn ? ' ⚠' : ''}</Text>
                            </View>
                          )}
                          {todayFiber > 0 && (
                            <View style={[styles.diabeticMetric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                              <Text style={[styles.diabeticMetricValue, { color: '#10B981' }]}>{Math.round(todayFiber)}g</Text>
                              <Text style={[styles.diabeticMetricLabel, { color: colors.muted }]}>Fiber</Text>
                            </View>
                          )}
                          {todayGL > 0 && (
                            <View style={[styles.diabeticMetric, { backgroundColor: glColor + '15', borderColor: glColor + '50' }]}>
                              <Text style={[styles.diabeticMetricValue, { color: glColor }]}>{Math.round(todayGL)}</Text>
                              <Text style={[styles.diabeticMetricLabel, { color: colors.muted }]}>GL {glLabel}</Text>
                            </View>
                          )}
                        </View>
                        <View style={[styles.adaBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Text style={[styles.adaTitle, { color: colors.foreground }]}>ADA Guidance</Text>
                          <Text style={[styles.adaLine, { color: colors.muted }]}>
                            • Carbs: 45–60 g per meal (135–180 g/day) · Fiber: ≥25 g/day
                          </Text>
                          <Text style={[styles.adaLine, { color: colors.muted }]}>
                            • Added sugar: &lt;25 g/day · Glycemic Load: keep daily total &lt;100
                          </Text>
                          {sugarWarn && (
                            <Text style={[styles.adaWarn, { color: '#EF4444' }]}>
                              ⚠ Today&apos;s sugar ({Math.round(todaySugar)} g) exceeds the ADA 25 g/day limit.
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.diabeticDisclaimer, { color: colors.muted }]}>
                          {ds.smartScanDisclaimer ?? 'Based on Smart-scanned entries only. Values are estimates — for informational purposes only.'}
                        </Text>
                        {NUTRITION_DIABETIC_REFS.length > 0 && (
                          <View style={{ marginTop: 8, gap: 4 }}>
                            <Text style={[styles.citationLabel, { color: colors.muted }]}>References:</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {NUTRITION_DIABETIC_REFS.map((ref, idx) => (
                                <Pressable
                                  key={ref.id}
                                  onPress={() => ref.url ? Linking.openURL(ref.url) : undefined}
                                  style={[styles.citationBadge, { borderColor: '#0EA5E960', backgroundColor: '#0EA5E915' }]}
                                >
                                  <Text style={[styles.citationBadgeText, { color: '#0EA5E9' }]}>[{idx + 1}] {ref.shortRef}</Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                );
              })()}

              {nutritionTab === 'caloric' && (
                <View>
                  {/* ── Caloric empty / low-data states ── */}
                  {!nutritionHasData ? (
                    <View style={[styles.nutritionEmptyState, { marginHorizontal: 16, marginBottom: 12, backgroundColor: isDark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)', borderColor: '#F59E0B' + '30' }]}>
                      <Text style={styles.nutritionEmptyIcon}>📊</Text>
                      <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.noCaloricDataTitle ?? 'No Caloric Data Yet'}</Text>
                      <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                        {cs.noCaloricDataBody ?? 'Log meals with calorie information to see your caloric trend analysis here.'}
                      </Text>
                      <View style={[styles.nutritionEmptyProgressBadge, { borderColor: '#F59E0B' + '40', backgroundColor: '#F59E0B' + '12' }]}>
                        <Text style={[styles.nutritionEmptyProgressText, { color: '#F59E0B' }]}>{(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', '0')}</Text>
                      </View>
                      <Pressable
                        style={[styles.nutritionEmptyCTA, { backgroundColor: '#F59E0B' + '20', borderColor: '#F59E0B' + '50' }]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push('/(tabs)/log');
                        }}
                      >
                        <Text style={[styles.nutritionEmptyCTAText, { color: '#F59E0B' }]}>{cs.logMealCta ?? '+ Log a Meal'}</Text>
                      </Pressable>
                    </View>
                  ) : nutritionHasLowData ? (
                    <View style={[styles.nutritionEmptyState, { marginHorizontal: 16, marginBottom: 12, backgroundColor: isDark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)', borderColor: '#F59E0B' + '30' }]}>
                      <Text style={styles.nutritionEmptyIcon}>📈</Text>
                      <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.buildingCaloricTitle ?? 'Building Your Caloric Trend'}</Text>
                      <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                        {cs.buildingCaloricBody ?? 'Keep logging meals — caloric trend analysis becomes available after 7 days of data.'}
                      </Text>
                      <View style={[styles.nutritionEmptyProgressBadge, { borderColor: '#F59E0B' + '40', backgroundColor: '#F59E0B' + '12' }]}>
                        <Text style={[styles.nutritionEmptyProgressText, { color: '#F59E0B' }]}>{(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', String(nutritionUniqueDays))}</Text>
                      </View>
                      <View style={[styles.nutritionEmptyProgressBar, { backgroundColor: '#F59E0B' + '20' }]}>
                        <View style={[styles.nutritionEmptyProgressFill, { backgroundColor: '#F59E0B', width: `${Math.min(Math.round((nutritionUniqueDays / 7) * 100), 100)}%` as `${number}%` }]} />
                      </View>
                    </View>
                  ) : null}
                  {nutritionHasData && (
                  <CaloricTrendInsightCard
                    sodiumIntake={state.data?.sodiumIntake ?? []}
                    bloodPressure={state.data?.bloodPressure ?? []}
                    bloodSugar={state.data?.bloodSugar ?? []}
                  />)}
                  {NUTRITION_CALORIC_REFS.length > 0 && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 4 }}>
                      <Text style={[styles.citationLabel, { color: colors.muted }]}>References:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {NUTRITION_CALORIC_REFS.map((ref, idx) => (
                          <Pressable
                            key={ref.id}
                            onPress={() => ref.url ? Linking.openURL(ref.url) : undefined}
                            style={[styles.citationBadge, { borderColor: '#F59E0B60', backgroundColor: '#F59E0B15' }]}
                          >
                            <Text style={[styles.citationBadgeText, { color: '#F59E0B' }]}>[{idx + 1}] {ref.shortRef}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {nutritionTab === 'macro' && (
                <View>
                  {/* ── Macro empty / low-data states ── */}
                  {!macroHasData ? (
                    <View style={[styles.nutritionEmptyState, { marginHorizontal: 16, marginBottom: 12, backgroundColor: isDark ? 'rgba(139,92,246,0.07)' : 'rgba(139,92,246,0.05)', borderColor: '#8B5CF6' + '30' }]}>
                      <Text style={styles.nutritionEmptyIcon}>🥦</Text>
                      <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.noMacroDataTitle ?? 'No Macro Data Yet'}</Text>
                      <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                        {cs.noMacroDataBody ?? 'Log meals with macro information to see your daily macro breakdown here.'}
                      </Text>
                      <View style={[styles.nutritionEmptyProgressBadge, { borderColor: '#8B5CF6' + '40', backgroundColor: '#8B5CF6' + '12' }]}>
                        <Text style={[styles.nutritionEmptyProgressText, { color: '#8B5CF6' }]}>{(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', '0')}</Text>
                      </View>
                      <Pressable
                        style={[styles.nutritionEmptyCTA, { backgroundColor: '#8B5CF6' + '20', borderColor: '#8B5CF6' + '50' }]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push('/(tabs)/log');
                        }}
                      >
                        <Text style={[styles.nutritionEmptyCTAText, { color: '#8B5CF6' }]}>{cs.logMealCta ?? '+ Log a Meal'}</Text>
                      </Pressable>
                    </View>
                  ) : macroHasLowData ? (
                    <View style={[styles.nutritionEmptyState, { marginHorizontal: 16, marginBottom: 12, backgroundColor: isDark ? 'rgba(139,92,246,0.07)' : 'rgba(139,92,246,0.05)', borderColor: '#8B5CF6' + '30' }]}>
                      <Text style={styles.nutritionEmptyIcon}>📈</Text>
                      <Text style={[styles.nutritionEmptyTitle, { color: colors.foreground }]}>{cs.buildingMacroTitle ?? 'Building Your Macro Profile'}</Text>
                      <Text style={[styles.nutritionEmptyBody, { color: colors.muted }]}>
                        {cs.buildingMacroBody ?? 'Keep logging meals — macro breakdown becomes available after 7 days of data.'}
                      </Text>
                      <View style={[styles.nutritionEmptyProgressBadge, { borderColor: '#8B5CF6' + '40', backgroundColor: '#8B5CF6' + '12' }]}>
                        <Text style={[styles.nutritionEmptyProgressText, { color: '#8B5CF6' }]}>{(cs.daysProgressLabel ?? '{n} / 7 days').replace('{n}', String(macroUniqueDays))}</Text>
                      </View>
                      <View style={[styles.nutritionEmptyProgressBar, { backgroundColor: '#8B5CF6' + '20' }]}>
                        <View style={[styles.nutritionEmptyProgressFill, { backgroundColor: '#8B5CF6', width: `${Math.min(Math.round((macroUniqueDays / 7) * 100), 100)}%` as `${number}%` }]} />
                      </View>
                    </View>
                  ) : null}
                  {macroHasData && (
                    <WeeklyMacroIntelCard
                      sodiumRecords={state.data?.sodiumIntake ?? []}
                      bloodSugarRecords={state.data?.bloodSugar ?? []}
                      weightRecords={state.data?.weight ?? []}
                      vitalSignsRecords={state.data?.vitalSigns ?? []}
                      activityRecords={state.data?.activity ?? []}
                      dietProtocol={dietType ?? 'standard'}
                      weightKg={state.data?.bodyComposition?.[0]?.weightKg ?? null}
                    />
                  )}
                </View>
              )}
              </Reanimated.View>
            </View>
          )}
        </GlassCard>
        {/* ─── Insight Engine ─────────────────────────────────────────── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {state.data && <InsightEngine data={state.data} />}

        {/* ─── Pattern Explorer ─────────────────────────────────────────── */}
        <View style={{ height: 10 }} />
        {state.data && <PatternExplorer data={state.data} />}

        {/* ─── REMOVED: Custom Correlation Explorer (replaced by InsightEngine) ─── */}
        {false && (
        <>
        {/* ─── Quick Pairs ─────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pairsScroll}>
          {METRIC_PAIRS.map(([x, y], i) => (
            <Pressable
              key={i}
              style={[styles.pairChip, {
                backgroundColor: xMetric === x && yMetric === y
                  ? colors.accent + (isDark ? '28' : '20')
                  : isDark ? colors.surface : colors.surfaceRaised,
                borderColor: xMetric === x && yMetric === y
                  ? colors.accent + (isDark ? '60' : '50')
                  : isDark ? colors.borderStrong : colors.border,
              }]}
              onPress={() => { setXMetric(x); setYMetric(y); }}
            >
              <Text style={[styles.pairChipText, {
                color: xMetric === x && yMetric === y ? colors.accent : colors.muted,
              }]}>
                {getMetricLabel(x).split(' ')[0]} vs {getMetricLabel(y).split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ─── Metric Selectors ────────────────────────────────────────────── */}
        <View style={styles.selectorRow}>
          <Pressable
            style={[styles.metricSelector, {
              backgroundColor: isDark ? colors.surface : colors.surfaceRaised,
              borderColor: METRIC_COLORS[xMetric] + (isDark ? '80' : '60'),
            }]}
            onPress={() => setShowXPicker(true)}
          >
            <View style={[styles.axisLabel, { backgroundColor: METRIC_COLORS[xMetric] + '20' }]}>
              <Text style={[styles.axisLabelText, { color: METRIC_COLORS[xMetric] }]}>X</Text>
            </View>
            <Text style={[styles.selectorText, { color: colors.foreground }]} numberOfLines={2}>
              {getMetricLabel(xMetric)}
            </Text>
          </Pressable>

          <View style={styles.vsLabel}>
            <Text style={[styles.vsText, { color: colors.muted }]}>vs</Text>
          </View>

          <Pressable
            style={[styles.metricSelector, {
              backgroundColor: isDark ? colors.surface : colors.surfaceRaised,
              borderColor: METRIC_COLORS[yMetric] + (isDark ? '80' : '60'),
            }]}
            onPress={() => setShowYPicker(true)}
          >
            <View style={[styles.axisLabel, { backgroundColor: METRIC_COLORS[yMetric] + '20' }]}>
              <Text style={[styles.axisLabelText, { color: METRIC_COLORS[yMetric] }]}>Y</Text>
            </View>
            <Text style={[styles.selectorText, { color: colors.foreground }]} numberOfLines={2}>
              {getMetricLabel(yMetric)}
            </Text>
          </Pressable>
        </View>

        {/* ─── Scatter Plot ────────────────────────────────────────────────── */}
        <View style={[styles.chartCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
        }]}>
          <Svg width={CHART_SIZE} height={CHART_SIZE}>
            <Rect width={CHART_SIZE} height={CHART_SIZE} fill="transparent" />
            {[0.25, 0.5, 0.75].map((t) => (
              <React.Fragment key={t}>
                <Line
                  x1={PAD + t * (CHART_SIZE - PAD * 2)} y1={PAD}
                  x2={PAD + t * (CHART_SIZE - PAD * 2)} y2={CHART_SIZE - PAD}
                  stroke={colors.border} strokeWidth={1} strokeDasharray="3,3"
                />
                <Line
                  x1={PAD} y1={PAD + t * (CHART_SIZE - PAD * 2)}
                  x2={CHART_SIZE - PAD} y2={PAD + t * (CHART_SIZE - PAD * 2)}
                  stroke={colors.border} strokeWidth={1} strokeDasharray="3,3"
                />
              </React.Fragment>
            ))}
            <Line x1={PAD} y1={PAD} x2={PAD} y2={CHART_SIZE - PAD} stroke={colors.muted} strokeWidth={1.5} />
            <Line x1={PAD} y1={CHART_SIZE - PAD} x2={CHART_SIZE - PAD} y2={CHART_SIZE - PAD} stroke={colors.muted} strokeWidth={1.5} />
            {regressionLine != null && result != null && result?.strength !== 'none' && (
              <Line
                x1={regressionLine!.x1} y1={regressionLine!.y1}
                x2={regressionLine!.x2} y2={regressionLine!.y2}
                stroke={strengthColor} strokeWidth={2} strokeDasharray="6,4" opacity={0.7}
              />
            )}
            {normalizedPoints.map((pt, i) => (
              <Circle key={i} cx={pt.cx} cy={pt.cy} r={5} fill={METRIC_COLORS[xMetric]} opacity={0.75} />
            ))}
            {/* X-axis label: centerd for LTR, right-aligned for RTL */}
            <SvgText
              x={isRTL ? CHART_SIZE - PAD : CHART_SIZE / 2}
              y={CHART_SIZE - 6}
              textAnchor={isRTL ? 'end' : 'middle'}
              fill={colors.muted}
              fontSize={9}
            >
              {getMetricLabel(xMetric)}
            </SvgText>
            {/* Y-axis label: left for LTR, right for RTL */}
            <SvgText
              x={isRTL ? CHART_SIZE - 4 : 4}
              y={CHART_SIZE / 2}
              textAnchor={isRTL ? 'start' : 'start'}
              fill={colors.muted}
              fontSize={9}
              rotation={isRTL ? 90 : -90}
              originX={isRTL ? CHART_SIZE - 4 : 4}
              originY={CHART_SIZE / 2}
            >
              {getMetricLabel(yMetric)}
            </SvgText>
          </Svg>
        </View>

        {/* ─── Correlation Score ───────────────────────────────────────────── */}
        {result != null && (
          <View style={[styles.scoreCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
          }]}>
            <View style={styles.scoreRow}>
              <View style={styles.scoreLeft}>
                <Text style={[styles.scoreLabel, { color: colors.muted }]}>PEARSON r</Text>
                <Text style={[styles.scoreValue, { color: strengthColor }]}>
                  {result!.r.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
              <View style={styles.scoreRight}>
                <Text style={[styles.scoreLabel, { color: colors.muted }]}>R²</Text>
                <Text style={[styles.scoreValueSm, { color: colors.foreground }]}>
                  {(result!.rSquared * 100).toFixed(0)}%
                </Text>
                <Text style={[styles.scoreSubLabel, { color: colors.muted }]}>variance explained</Text>
              </View>
              <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
              <View style={styles.scoreRight}>
                <Text style={[styles.scoreLabel, { color: colors.muted }]}>STRENGTH</Text>
                <View style={[styles.strengthBadge, { backgroundColor: strengthColor + '20', borderColor: strengthColor + '40' }]}>
                  <Text style={[styles.strengthText, { color: strengthColor }]}>
                    {result!.strength.charAt(0).toUpperCase() + result!.strength.slice(1)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ─── Classic Insight ─────────────────────────────────────────────── */}
        {result != null && (
          <View style={[styles.classicInsightCard, {
            backgroundColor: colors.accent + (isDark ? '22' : '10'),
            borderColor: colors.accent + (isDark ? '40' : '25'),
          }]}>
            <Text style={[styles.classicInsightTitle, { color: colors.accent }]}>Pattern Analysis</Text>
            <Text style={[styles.classicInsightText, { color: colors.foreground }]}>
              {result!.insight}
            </Text>
            <Text style={[styles.classicInsightDisclaimer, { color: colors.muted }]}>
              {(ds.dataPointsDisclaimer ?? 'Based on {n} data points · For informational purposes only').replace('{n}', String(result!.points.length))}
            </Text>
          </View>
        )}

        {/* ─── Run Analysis button ─────────────────────────────────── */}
        <Pressable
          style={[styles.runAnalysisBtn, isAnalyzing && styles.runAnalysisBtnActive]}
          onPress={runAnalysis}
          disabled={isAnalyzing}
          accessibilityRole="button"
          accessibilityLabel={isAnalyzing ? (cs.analyzing ?? 'Analyzing…') : (cs.runAnalysis ?? 'Run Analysis')}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.runAnalysisBtnText}>Analyzing…</Text>
            </>
          ) : (
            <Text style={styles.runAnalysisBtnText}>Run Analysis</Text>
          )}
        </Pressable>
        <View style={{ height: 8 }} />
        </>
        )}
        <View style={{ height: 24 }} />

        {/* Medical Disclaimer Footer */}
        <GlassCard accentColor="#64748B" style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={[styles.disclaimerText, { color: colors.muted, textAlign: 'center' }]}>
            {((disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en).disclaimer}
          </Text>
        </GlassCard>

        {/* ─── Peer-Review References Footer ──────────────────────────────── */}
        {insights.length > 0 && (() => {
          const footerRefs = getRefsForCategories(insights.map(i => i.category));
          if (!footerRefs.length) return null;
          return (
            <GlassCard accentColor="#818CF8" style={{ marginHorizontal: 16, marginBottom: 24 }}>
              <Text style={[styles.insightSectionLabel, { color: '#818CF8', marginBottom: 10 }]}>PEER-REVIEWED REFERENCES</Text>
              {footerRefs.map((ref, idx) => (
                <Pressable key={ref.id} onPress={() => ref.url ? Linking.openURL(ref.url) : undefined} style={{ marginBottom: 8 }}>
                  <Text style={[styles.refNumber, { color: '#818CF8' }]}>[{idx + 1}]</Text>
                  <Text style={[styles.refText, { color: colors.foreground }]}>{ref.fullRef}</Text>
                  <Text style={[styles.refSummary, { color: colors.muted }]}>{ref.summary}</Text>
                </Pressable>
              ))}
            </GlassCard>
          );
        })()}
      </ScrollView>
      <ScrollToTopButton opacity={analyticsScrollTopOpacity} visible={showAnalyticsScrollTop} onPress={analyticsScrollToTop} />
      {/* Floating wellness disclaimer — absolute overlay, stays visible while scrolling */}
      <FloatingWellnessDisclaimer bottomOffset={80} position="bottom" />

      {/* ─── Toast ───────────────────────────────────────────────────────── */}
      <ShareToast visible={toastVisible} usedClipboard={toastClipboard} />

      <MetricPicker visible={showXPicker} onClose={() => setShowXPicker(false)} onSelect={setXMetric} current={xMetric} />
      <MetricPicker visible={showYPicker} onClose={() => setShowYPicker(false)} onSelect={setYMetric} current={yMetric} />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { paddingBottom: 16 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 4 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontWeight: '400' },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    paddingHorizontal: 20, marginBottom: 10, marginTop: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 20 },
  explorerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 8,
  },
  explorerChevron: {
    fontSize: 20, fontWeight: '600', lineHeight: 24,
  },
  // ── Record-tab-matching LogCard header styles ──────────────────────────
  logCardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  logCardIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  logCardContent: { flex: 1 },
  logCardTitle: { fontSize: 16, fontWeight: '700' },
  logCardSubtitle: { fontSize: 12, marginTop: 2 },

  // Empty state
  emptyCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    padding: 24, alignItems: 'center', gap: 10, marginBottom: 16,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },

  // Insight cards
  insightCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12,
    gap: 12, marginBottom: 12,
  },
  insightHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  insightIconBadge: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  insightIcon: { fontSize: 20 },
  insightHeaderText: { flex: 1, gap: 4 },
  insightCategory: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  evidenceDots: { flexDirection: 'row', gap: 3 },
  evidenceDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#818CF8',
  },
  evidenceLabel: { fontSize: 10, fontWeight: '500' },
  severityBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  severityText: { fontSize: 10, fontWeight: '700' },
  insightSection: { gap: 6 },
  insightSectionLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  insightBody: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
  clinicalSection: {
    borderLeftWidth: 3, paddingLeft: 12, borderRadius: 4, padding: 10,
  },
  dataPointsLabel: { fontSize: 10, fontStyle: 'italic', marginTop: 4 },
  insightDisclaimer: { fontSize: 10, fontStyle: 'italic', marginTop: 6, lineHeight: 14, opacity: 0.7 },

  // Footer row: expand hint + share button
  insightFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 4,
  },
  expandHintBtn: { flex: 1 },
  expandHint: { fontSize: 11, fontWeight: '500' },

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  shareBtnIcon: { fontSize: 13, fontWeight: '800' },
  shareBtnLabel: { fontSize: 12, fontWeight: '700' },

  // Toast
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: '#1C2333', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  toastText: { color: '#E8EAF2', fontSize: 13, fontWeight: '600' },

  // Quick pairs
  pairsScroll: { paddingLeft: 16, marginBottom: 14 },
  pairChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8,
  },
  pairChipText: { fontSize: 12, fontWeight: '600' },

  // Selectors
  selectorRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, marginBottom: 14,
  },
  metricSelector: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1.5, padding: 12,
  },
  axisLabel: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  axisLabelText: { fontSize: 12, fontWeight: '800' },
  selectorText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 15 },
  vsLabel: { paddingHorizontal: 4 },
  vsText: { fontSize: 13, fontWeight: '600' },

  // Chart
  chartCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', alignItems: 'center', marginBottom: 12,
  },

  // Score card
  scoreCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreLeft: { flex: 1, alignItems: 'center', gap: 4 },
  scoreRight: { flex: 1, alignItems: 'center', gap: 4 },
  scoreDivider: { width: 1, height: 50, marginHorizontal: 8 },
  scoreLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  scoreValue: { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  scoreValueSm: { fontSize: 24, fontWeight: '700' },
  scoreSubLabel: { fontSize: 9, fontWeight: '400' },
  strengthBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  strengthText: { fontSize: 12, fontWeight: '700' },

  // Classic insight
  classicInsightCard: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 16, gap: 8,
  },
  classicInsightTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  classicInsightText: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  classicInsightDisclaimer: { fontSize: 10, fontWeight: '400', fontStyle: 'italic' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1,
    padding: 20, maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  metricOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metricDot: { width: 10, height: 10, borderRadius: 5 },
  metricOptionText: { fontSize: 14 },

  // Diabetic nutrition summary card
  diabeticCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, marginHorizontal: 16, marginBottom: 8 },
  diabeticHeader: { gap: 2 },
  diabeticTitle: { fontSize: 15, fontWeight: '800' },
  diabeticSub: { fontSize: 11, fontStyle: 'italic' },
  diabeticCalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  diabeticCalValue: { fontSize: 40, fontWeight: '900', lineHeight: 44 },
  diabeticCalLabel: { fontSize: 13, fontWeight: '600' },
  diabeticCalSub: { fontSize: 10, fontStyle: 'italic' },
  macroBarWrap: { gap: 6 },
  macroBarTrack: { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden' },
  macroBarSeg: { height: 10 },
  macroLegend: { flexDirection: 'row', gap: 12 },
  macroLegendItem: { fontSize: 11, fontWeight: '700' },
  diabeticMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  diabeticMetric: {
    minWidth: 72, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 3,
  },
  diabeticMetricValue: { fontSize: 18, fontWeight: '800' },
  diabeticMetricLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  adaBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 5 },
  adaTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  adaLine: { fontSize: 11, lineHeight: 17 },
  adaWarn: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  diabeticDisclaimer: { fontSize: 10, fontStyle: 'italic', textAlign: 'center' },

  // Nutrition Analysis three-tab switcher
  nutritionTabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  nutritionTabChip: {
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    overflow: 'hidden',
  },
  nutritionTabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  nutritionTabUnderline: {
    height: 2,
    width: '60%',
    borderRadius: 1,
    marginTop: 4,
  },
  // Diabetic empty state
  nutritionEmptyState: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  nutritionEmptyIcon: { fontSize: 36 },
  nutritionEmptyTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  nutritionEmptyBody: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  nutritionEmptyCTA: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  nutritionEmptyCTAText: { fontSize: 13, fontWeight: '700' },
  nutritionEmptyProgressBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, marginTop: 2 },
  nutritionEmptyProgressText: { fontSize: 11, fontWeight: '700' },
  nutritionEmptyProgressBar: { width: '80%', height: 4, borderRadius: 2, overflow: 'hidden' as const, marginTop: 2 },
  nutritionEmptyProgressFill: { height: 4, borderRadius: 2 },
  observedProgressBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 },
  observedProgressText: { fontSize: 10, fontWeight: '700' },
  // Nutrition Analysis header badge
  nutritionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  nutritionBadgeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },

  // Run Analysis button
  runAnalysisBtn: {
    marginHorizontal: 16, marginTop: 4, borderRadius: 14,
    backgroundColor: '#22C55E', paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  runAnalysisBtnActive: { opacity: 0.75 },
  runAnalysisBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
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

  // Citation badges (inline within expanded insight cards)
  citationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  citationLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  citationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  citationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // References footer list
  refNumber: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  refText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
  },
  refSummary: {
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
