/**
 * Record Tab — Unified hub for manual health data entry.
 *
 * Provides cards for logging Vitals, Nutrition, Medications, Lab Results,
 * Appointments, Immunizations, Medical History, and more.
 */
import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MealIQHistoryCard } from '@/components/meal-iq-history-card';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from '@/lib/safe-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
 Easing } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { FloatingWellnessDisclaimer } from '@/components/floating-wellness-disclaimer';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColorScheme, useColors, useRecordsStrings } from '@/hooks';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import { useT } from '@/lib/i18n-ai';
import { trpc } from '@/lib/trpc';
import { RecentEntriesSection } from '@/components/recent-entries-section';
import { UnifiedNutritionCard } from '@/components/unified-nutrition-card';
import { getTodayNutrients } from '@/lib/health/daily-nutrients';
import { PrivacyBanner } from '@/components/privacy-banner';
import { SectionLabel } from '@/components/dashboard/section-label';
import { GlassCard } from '@/components/glass-card';
import { LabTrendMiniChart } from '@/components/dashboard/lab-trend-mini-chart';
import { HeaderSyncButton } from '@/components/header-sync-button';
// BLE removed — Apple Health integration only
import { loadMedications } from '@/lib/medications/storage';
import type { Medication } from '@/lib/medications/types';
import { useUnitPreferences, formatDistance, type DistanceUnit } from '@/hooks/use-unit-preferences';
import { BloodPressureEmptyState, GlucoseEmptyState } from '@/lib/health/health-empty-states';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';

const SCREEN_WIDTH = Dimensions.get('window').width;
/** Horizontal distance (px) the user must drag before the dismiss fires. */
const DISMISS_THRESHOLD = SCREEN_WIDTH * 0.35;

// ─── SwipeToDismiss ──────────────────────────────────────────────────────────

/**
 * Wraps children in a horizontal pan gesture.
 * Swiping left past DISMISS_THRESHOLD slides the card off-screen and calls onDismiss.
 * Releasing before the threshold snaps the card back.
 *
 * The gesture is disabled on web (no touch events).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SwipeToDismiss({
  children,
  onDismiss,
  enabled = true,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
  enabled?: boolean;
}) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const pan = Gesture.Pan()
    .enabled(enabled && Platform.OS !== 'web')
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      // Only allow leftward drag
      translateX.value = Math.min(0, e.translationX);
      // Fade out as the card moves left
      const progress = Math.abs(translateX.value) / DISMISS_THRESHOLD;
      opacity.value = 1 - progress * 0.4;
    })
    .onEnd((e) => {
      if (e.translationX < -DISMISS_THRESHOLD || e.velocityX < -600) {
        // Commit: slide fully off-screen then call onDismiss
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 220, easing: Easing.out(Easing.quad) }, () => {
          runOnJS(onDismiss)();
        });
        opacity.value = withTiming(0, { duration: 200 });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withTiming(1, { duration: 150 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

// ─── Strings ─────────────────────────────────────────────────────────────────

const RECORD_STRINGS = {
  screenTitle: 'Record',
  screenSubtitle: 'Log health data',
  sectionHealthMetrics: 'Health Metrics',
  sectionActivity: 'Activity',
  sectionClinicalRecords: 'Personal Records',
  sectionQuickStats: 'Quick Stats',
  cardWeight: 'Weight',
  cardWeightSub: 'Track body weight over time',
  cardVitals: 'Vital Signs',
  cardVitalsSub: 'BP, HR, SpO2, temperature',
  cardSleep: 'Sleep',
  cardSleepSub: 'Bedtime, wake time & quality',
  latestHours: 'last night',
  cardBloodSugar: 'Blood Sugar',
  cardBloodSugarSub: 'Glucose levels with context',
  cardActivity: 'Activity',
  cardActivitySub: 'Runs, walks, cycling, workouts',
  statWeightEntries: 'Weight\nEntries',
  statVitalEntries: 'Vital Sign\nEntries',
  statGlucoseReadings: 'Glucose\nReadings',
  statActivitiesLogged: 'Activities\nLogged',
  latestLatest: 'latest',
  latestMmhg: 'mmHg',
  latestToday: 'today',
  latestLastSession: 'last session',
  latestActive: 'active',
  vitalsFilterAll: 'All',
  vitalsFilterHealthKit: 'HealthKit',
  vitalsFilterManual: 'Manual',
  glucoseFilterAll: 'All',
  glucoseFilterHealthKit: 'HealthKit',
  glucoseFilterManual: 'Manual',
  projectedA1CPremium: 'Projected A1C — Premium',
  projectedA1CUnlock: 'Unlock estimated A1C trends with a free trial.',
} as const;

// ─── Log card helpers ─────────────────────────────────────────────────────────

/** Returns a human-readable relative time string for a given ISO timestamp. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  return `${diffDay}d ago`;
}

/** Returns an exact wall-clock time string, e.g. "Synced 4:02 AM" */
function syncedAtLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `Synced ${h12}:${m} ${ampm}`;
}

/** Returns a compact source badge string. */
function sourceLabel(source: string): string {
  if (source === 'healthkit') return '🍎 Apple Health';
  if (source === 'health-connect') return '🤖 Health Connect';
  if (source === 'device') return '📡 Device';
  return '✏️ Manual';
}

function formatWeight(records: { weightLbs: number; weightKg: number; timestamp: string; source: string }[]): { value: string; label: string; source: string } | undefined {
  if (!records.length) return undefined;
  const r = records[0];
  return {
    value: `${r.weightLbs.toFixed(1)} lbs`,
    label: relativeTime(r.timestamp),
    source: sourceLabel(r.source),
  };
}

function formatLatestSleep(records: { totalMinutes: number; bedtime: string; timestamp: string; source: string }[]): { lines: string[]; label: string; source: string } | undefined {
  if (!records.length) return undefined;
  const r = records[0];
  if (!r.totalMinutes) return undefined;
  const h = Math.floor(r.totalMinutes / 60);
  const m = r.totalMinutes % 60;
  const duration = m > 0 ? `${h}h ${m}m` : `${h}h`;
  return {
    lines: [duration],
    label: relativeTime(r.timestamp),
    source: sourceLabel(r.source),
  };
}

function formatVitals(records: { systolic?: number; diastolic?: number; heartRate?: number; oxygenSaturation?: number; spo2?: number; timestamp: string; source: string }[]): { lines: string[]; label: string; source: string } | undefined {
  if (!records.length) return undefined;
  const lines: string[] = [];
  // BP — find most recent record with BP
  const bpRec = records.find(r => r.systolic != null || r.diastolic != null);
  if (bpRec) {
    const sys = bpRec.systolic != null ? String(bpRec.systolic) : '--';
    const dia = bpRec.diastolic != null ? String(bpRec.diastolic) : '--';
    lines.push(`${sys}/${dia} mmHg`);
  }
  // HR — find most recent record with HR
  const hrRec = records.find(r => r.heartRate);
  if (hrRec) lines.push(`${hrRec.heartRate} bpm`);
  // SpO2
  const spo2Rec = records.find(r => (r.oxygenSaturation ?? r.spo2));
  if (spo2Rec) {
    const val = spo2Rec.oxygenSaturation ?? spo2Rec.spo2!;
    lines.push(`${val.toFixed(0)}% SpO₂`);
  }
  if (!lines.length) return undefined;
  const latest = records[0];
  return {
    lines,
    label: syncedAtLabel(latest.timestamp),
    source: sourceLabel(latest.source),
  };
}


/**
 * Builds a merged vitals record list from all three sources:
 *  - data.vitalSigns  (manual entry + HealthKit spO2/temp/respRate)
 *  - data.bloodPressure (HealthKit / Health Connect BP sync)
 *  - data.pulse        (HealthKit / Health Connect HR sync)
 *
 * Returns a unified array sorted newest-first, shaped to match formatVitals().
 */
function mergeVitalRecords(
  vitalSigns: { systolic?: number; diastolic?: number; heartRate?: number; oxygenSaturation?: number; spo2?: number; timestamp: string; source: string }[],
  bloodPressure: { systolic: number | null; diastolic: number | null; timestamp: string; source?: string }[],
  pulse: { bpm: number; timestamp: string; source?: string }[],
): { systolic?: number; diastolic?: number; heartRate?: number; oxygenSaturation?: number; spo2?: number; timestamp: string; source: string }[] {
  // Convert BloodPressureRecord → unified shape
  const bpMapped = bloodPressure.map(r => ({
    systolic:  r.systolic  != null ? r.systolic  : undefined,
    diastolic: r.diastolic != null ? r.diastolic : undefined,
    timestamp: r.timestamp,
    source: r.source ?? 'healthkit',
  }));
  // Convert PulseRecord → unified shape
  const pulseMapped = pulse.map(r => ({
    heartRate: r.bpm,
    timestamp: r.timestamp,
    source: r.source ?? 'healthkit',
  }));
  // Merge all three sources and sort newest-first
  const all = [...vitalSigns, ...bpMapped, ...pulseMapped];
  all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return all;
}
function formatGlucose(records: { glucoseMgDl: number; context: string; timestamp: string; source: string }[]): { value: string; label: string; source: string } | undefined {
  if (!records.length) return undefined;
  const r = records[0];
  const ctx = r.context === 'fasting' ? 'Fasting' : r.context === 'post-meal' ? 'Post-meal' : r.context === 'bedtime' ? 'Bedtime' : 'Random';
  return {
    value: `${r.glucoseMgDl} mg/dL`,
    label: `${ctx} · ${relativeTime(r.timestamp)}`,
    source: sourceLabel(r.source),
  };
}

function formatLastActivity(
  records: { type: string; durationMinutes: number; distanceKm?: number; distanceMiles?: number; timestamp: string; source: string }[],
  distUnit: DistanceUnit,
): { lines: string[]; label: string; source: string } | undefined {
  if (!records.length) return undefined;
  const r = records[0];
  const typeName = r.type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const lines: string[] = [];
  // Line 1: activity type + duration
  const durationStr = r.durationMinutes >= 60
    ? `${Math.floor(r.durationMinutes / 60)}h ${r.durationMinutes % 60}m`
    : `${r.durationMinutes}m`;
  lines.push(`${typeName} · ${durationStr}`);
  // Line 2: distance (if available)
  const distKm = r.distanceKm ?? (r.distanceMiles != null ? r.distanceMiles / 0.621371 : undefined);
  if (distKm != null && distKm > 0) {
    lines.push(formatDistance(distKm, distUnit, 2));
  }
  return {
    lines,
    label: relativeTime(r.timestamp),
    source: sourceLabel(r.source),
  };
}

// ─── Log Card component ───────────────────────────────────────────────────────

interface LatestSnapshot {
  /** Primary value line(s) — e.g. ["120/80 mmHg", "72 bpm"] or ["185.0 lbs"] */
  lines: string[];
  /** Relative timestamp — e.g. "2h ago" */
  label: string;
  /** Source badge — e.g. "🍎 Apple Health" */
  source: string;
}

interface LogCardProps {
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  /** Rich latest snapshot (preferred over legacy latestValue) */
  latest?: LatestSnapshot;
  /** Legacy single-value display (used for Sleep & Activity) */
  latestValue?: string;
  latestLabel?: string;
  /** Optional small description line shown below the subtitle in italic */
  description?: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}

function LogCard({ title, subtitle, icon, accentColor, latest, latestValue, latestLabel, description, onPress, colors }: LogCardProps) {
  return (
    <GlassCard
      accentColor={accentColor}
      onPress={onPress}
      style={{ marginBottom: 10 }}
      contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}
    >
      <View style={[lcStyles.iconWrap, { backgroundColor: accentColor + '22' }]}>
        <Text style={lcStyles.icon}>{icon}</Text>
      </View>
      <View style={lcStyles.content}>
        <Text style={[lcStyles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[lcStyles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        {description ? <Text style={[lcStyles.description, { color: accentColor + 'BB' }]}>{description}</Text> : null}
      </View>
      {latest ? (
        <View style={lcStyles.latest}>
          {latest.lines.map((line, i) => (
            <Text key={i} style={[
              lcStyles.latestValue,
              { color: accentColor, fontSize: i === 0 ? 14 : 12, fontWeight: i === 0 ? '700' : '600', marginTop: i > 0 ? 1 : 0 }
            ]}>{line}</Text>
          ))}
          <Text style={[lcStyles.latestLabel, { color: colors.muted }]}>{latest.label}</Text>
          <Text style={[lcStyles.latestSource, { color: accentColor + '99' }]}>{latest.source}</Text>
        </View>
      ) : latestValue ? (
        <View style={lcStyles.latest}>
          <Text style={[lcStyles.latestValue, { color: accentColor }]}>{latestValue}</Text>
          {latestLabel ? <Text style={[lcStyles.latestLabel, { color: colors.muted }]}>{latestLabel}</Text> : null}
        </View>
      ) : null}
      <IconSymbol name="chevron.right" size={18} color={colors.muted} />
    </GlassCard>
  );
}

const lcStyles = StyleSheet.create({
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  icon: { fontSize: 24 },
  content: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  description: { fontSize: 11, fontStyle: 'italic' as const, marginTop: 3 },
  latest: { alignItems: 'flex-end', marginRight: 8, maxWidth: 130 },
  latestValue: { fontSize: 14, fontWeight: '700' },
  latestLabel: { fontSize: 11, marginTop: 1 },
  latestSource: { fontSize: 10, marginTop: 1 },
});

// cardStyles removed — LogCard now uses GlassCard + lcStyles

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RecordScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollToNutrition?: string; scrollToImmunizations?: string; filterCategory?: string }>();
  const { state, forceSync } = useHealth();
  const data = state.data;
  const sync = state.sync;
  const t = useT(RECORD_STRINGS);
  const rs = useRecordsStrings();

  // ── Pull-to-refresh handler ──────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await forceSync();
    } catch (_e) {
      // errors handled inside forceSync
    } finally {
      setIsRefreshing(false);
    }
  }, [forceSync]);
  const { distanceUnit } = useUnitPreferences();
  const { dietType: userDietType } = useDietType();
  const dietOption = DIET_TYPE_OPTIONS.find(o => o.value === userDietType);
  const _dietLabel = dietOption ? `${dietOption.label} Diet` : 'Diet';
  const _dietEmoji = dietOption?.emoji ?? '🍽️';
  const _dietSubtitle = dietOption?.cardSubtitle ?? 'Track dietary intake for your protocol';
  const dietAccent = dietOption?.color ?? '#06B6D4';
  // ── Active card selection (drives dynamic header title) ──────────────────
  const [activeCardName, setActiveCardName] = useState<string | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);

  // Load medications on focus so the badge count stays current
  useFocusEffect(
    useCallback(() => {
      loadMedications().then(setMedications).catch(() => {});
    }, [])
  );

  // Helper: tap a card → update header title → navigate
  function navigateCard(name: string, path: string) {
    setActiveCardName(name);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  }
  // ── Scroll-to-Nutrition (triggered after meal log) ──────────────────────
  const scrollRef = useRef<ScrollView | null>(null);
  const { showScrollTop: showRecordScrollTop, scrollTopOpacity: recordScrollTopOpacity, handleScroll: handleRecordScroll, scrollToTop: recordScrollToTop } = useScrollToTop(scrollRef);
  const nutritionYRef = useRef<number>(0);
  const immunizationsYRef = useRef<number>(0);
  const [nutritionForceExpanded, setNutritionForceExpanded] = useState<boolean | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (params.scrollToNutrition === '1') {
        setNutritionForceExpanded(true);
        const timer = setTimeout(() => {
          scrollRef.current?.scrollTo({ y: nutritionYRef.current, animated: true });
          // Clear the param so re-focusing doesn't re-trigger
          router.setParams({ scrollToNutrition: undefined } as any);
        }, 350);
        return () => clearTimeout(timer);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.scrollToNutrition])
  );

  // ── Scroll-to-Immunizations (triggered after vaccine save) ───────────────
  useFocusEffect(
    useCallback(() => {
      if (params.scrollToImmunizations === '1') {
        const timer = setTimeout(() => {
          scrollRef.current?.scrollTo({ y: immunizationsYRef.current, animated: true });
          router.setParams({ scrollToImmunizations: undefined } as any);
        }, 350);
        return () => clearTimeout(timer);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.scrollToImmunizations])
  );

  // ── Diet-change toast ────────────────────────────────────────────────────
  const [dietToast, setDietToast] = useState<string | null>(null);
  const dietToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDietRef = useRef<string>(userDietType);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const toastOpacity = useRef(new (require('react-native').Animated.Value)(0)).current;

  // Fire toast whenever userDietType changes (e.g. user changed it in Settings)
  useEffect(() => {
    if (prevDietRef.current !== userDietType && dietOption) {
      prevDietRef.current = userDietType;
      const msg = `Protocol updated to ${dietOption.emoji} ${dietOption.label}`;
      setDietToast(msg);
      // Fade in
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native').Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      // Auto-dismiss after 3 s
      if (dietToastTimer.current) clearTimeout(dietToastTimer.current);
      dietToastTimer.current = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('react-native').Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setDietToast(null));
      }, 3000);
    }
  }, [userDietType, dietOption, toastOpacity]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (dietToastTimer.current) clearTimeout(dietToastTimer.current); };
  }, []);

  // When the tab comes into focus: reset header title + auto-sync if stale
  const AUTO_SYNC_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  useFocusEffect(
    useCallback(() => {
      setActiveCardName(null);
      // Auto-sync silently if last sync was > 30 minutes ago or never
      const lastSynced = data?.lastSyncedAt ?? null;
      const isStaleEnough = !lastSynced ||
        (Date.now() - new Date(lastSynced).getTime() > AUTO_SYNC_THRESHOLD_MS);
      if (isStaleEnough && !sync.isRunning) {
        forceSync().catch(() => {}); // silent — errors handled inside forceSync
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.lastSyncedAt, sync.isRunning, forceSync])
  );

  // ── Last-synced relative timestamp (updates every 30s) ───────────────────
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);

  useEffect(() => {
    function computeLabel() {
      const ts = data?.lastSyncedAt ?? null;
      if (!ts) { setLastSyncedLabel(null); return; }
      const diffMs = Date.now() - new Date(ts).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) { setLastSyncedLabel('Last synced just now'); return; }
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) { setLastSyncedLabel(`Last synced ${diffMin}m ago`); return; }
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) { setLastSyncedLabel(`Last synced ${diffHr}h ago`); return; }
      const diffDay = Math.floor(diffHr / 24);
      setLastSyncedLabel(`Last synced ${diffDay}d ago`);
    }
    computeLabel();
    const interval = setInterval(computeLabel, 30_000);
    return () => clearInterval(interval);
  }, [data?.lastSyncedAt]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function navigate(path: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  }

  // Dynamic header: "Record" when nothing is selected, card name otherwise
  const headerTitle = activeCardName ?? rs.screenTitle;
  const headerSub = activeCardName ? `Log ${activeCardName}` : rs.screenSubtitle;

  const s = logStyles(colors);

  // ── Vitals source filter (persisted to AsyncStorage) ────────────────
  const VITALS_FILTER_KEY = '@vsht:vitalsSourceFilter';
  const GLUCOSE_FILTER_KEY = '@vsht:glucoseSourceFilter';
  const [vitalsSourceFilter, setVitalsSourceFilterRaw] = useState<'all' | 'healthkit' | 'manual'>('all');
  const [glucoseSourceFilter, setGlucoseSourceFilterRaw] = useState<'all' | 'healthkit' | 'manual'>('all');
  // Load persisted filter preferences on mount
  useEffect(() => {
    AsyncStorage.getItem(VITALS_FILTER_KEY).then(v => {
      if (v === 'healthkit' || v === 'manual') setVitalsSourceFilterRaw(v);
    }).catch(() => {});
    AsyncStorage.getItem(GLUCOSE_FILTER_KEY).then(v => {
      if (v === 'healthkit' || v === 'manual') setGlucoseSourceFilterRaw(v);
    }).catch(() => {});
   
  }, []);
  const setVitalsSourceFilter = useCallback((f: 'all' | 'healthkit' | 'manual') => {
    setVitalsSourceFilterRaw(f);
    safeSetItem(VITALS_FILTER_KEY, f).catch(() => {});
  }, []);
  const setGlucoseSourceFilter = useCallback((f: 'all' | 'healthkit' | 'manual') => {
    setGlucoseSourceFilterRaw(f);
    safeSetItem(GLUCOSE_FILTER_KEY, f).catch(() => {});
  }, []);
  const allVitalRecords = useMemo(
    () => data ? mergeVitalRecords(data.vitalSigns ?? [], data.bloodPressure ?? [], data.pulse ?? []) : [],
    [data]
  );
  // Counts per source for chip labels
  const vitalsHKCount = useMemo(
    () => allVitalRecords.filter(r => r.source === 'healthkit' || r.source === 'health-connect' || r.source === 'device').length,
    [allVitalRecords]
  );
  const vitalsManualCount = useMemo(
    () => allVitalRecords.filter(r => r.source === 'manual').length,
    [allVitalRecords]
  );
  const showVitalsFilter = vitalsHKCount > 0 && vitalsManualCount > 0;
  const filteredVitalRecords = useMemo(() => {
    if (vitalsSourceFilter === 'all') return allVitalRecords;
    if (vitalsSourceFilter === 'healthkit')
      return allVitalRecords.filter(r => r.source === 'healthkit' || r.source === 'health-connect' || r.source === 'device');
    return allVitalRecords.filter(r => r.source === 'manual');
  }, [allVitalRecords, vitalsSourceFilter]);
  // ── Glucose source filter (persisted to AsyncStorage) ────────────────
  const allGlucoseRecords = useMemo(
    () => data?.bloodSugar ?? [],
    [data]
  );
  const glucoseHKCount = useMemo(
    () => allGlucoseRecords.filter(r => r.source === 'healthkit' || r.source === 'health-connect' || r.source === 'device').length,
    [allGlucoseRecords]
  );
  const glucoseManualCount = useMemo(
    () => allGlucoseRecords.filter(r => r.source === 'manual').length,
    [allGlucoseRecords]
  );
  const showGlucoseFilter = glucoseHKCount > 0 && glucoseManualCount > 0;
  const filteredGlucoseRecords = useMemo(() => {
    if (glucoseSourceFilter === 'all') return allGlucoseRecords;
    if (glucoseSourceFilter === 'healthkit')
      return allGlucoseRecords.filter(r => r.source === 'healthkit' || r.source === 'health-connect' || r.source === 'device');
    return allGlucoseRecords.filter(r => r.source === 'manual');
  }, [allGlucoseRecords, glucoseSourceFilter]);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNAnimated = require('react-native').Animated;

  return (
    <ScreenContainer>
      {/* ─── Diet-change toast ─────────────────────────────────────────────── */}
      {dietToast && (
        <RNAnimated.View
          style={{
            position: 'absolute', top: 56, alignSelf: 'center', zIndex: 999,
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
            backgroundColor: dietAccent + 'EE',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 6,
            opacity: toastOpacity,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: -0.2 }}>{dietToast}</Text>
          <Pressable
            onPress={() => {
              RNAnimated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setDietToast(null));
              if (dietToastTimer.current) clearTimeout(dietToastTimer.current);
            }}
            style={{ marginLeft: 2 }}
          >
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>✕</Text>
          </Pressable>
        </RNAnimated.View>
      )}

        {/* ─── Header ──────────────────────────────────────────────────────── */}
      <View style={[s.header, { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{headerTitle}</Text>
            <Text style={s.headerSub}>{headerSub}</Text>
            {lastSyncedLabel && !sync.isRunning && (
              <Text style={[
                s.headerSub,
                { fontSize: 11, marginTop: 2, color: colors.muted, opacity: 0.7 }
              ]}>
                {lastSyncedLabel}
              </Text>
            )}
            {sync.isRunning && (
              <Text style={[
                s.headerSub,
                { fontSize: 11, marginTop: 2, color: colors.primary, opacity: 0.9 }
              ]}>
                Syncing health data…
              </Text>
            )}
          </View>
          <View style={{ paddingTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HeaderSyncButton
              sync={sync}
              onSync={forceSync}
              lastSyncedAt={data?.lastSyncedAt ?? null}
            />
          </View>
      </View>

      {/* ─── Renal Protocol Banner ───────────────────────────────────────── */}
      {userDietType === 'renal' && (
        <View style={{
          marginHorizontal: 16,
          marginBottom: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: '#06B6D418',
          borderWidth: 1,
          borderColor: '#06B6D440',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}>
          <Text style={{ fontSize: 18 }}>🫘</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#06B6D4' }}>{rs.renalProtocolActive}</Text>
            <Text style={{ fontSize: 11, color: '#06B6D4BB', marginTop: 1 }}>Potassium & phosphorus limits apply — tap Diet card to log intake</Text>
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        onScroll={handleRecordScroll}
        scrollEventThrottle={16}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            title="Syncing health data…"
            titleColor={colors.muted}
          />
        }
      >

        {/* ── Health Metrics ──────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>{rs.sectionHealthMetrics}</Text>
        {/* ── Vitals source filter chips — only shown when both HealthKit and manual records exist ── */}
        {showVitalsFilter && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, marginTop: -4 }}>
            {(['all', 'healthkit', 'manual'] as const).map((f) => {
              const baseLabel = f === 'all' ? rs.filterAll : f === 'healthkit' ? rs.filterHealthKit : rs.filterManual;
              const count = f === 'all' ? allVitalRecords.length : f === 'healthkit' ? vitalsHKCount : vitalsManualCount;
              const label = `${baseLabel} (${count})`;
              const isActive = vitalsSourceFilter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setVitalsSourceFilter(f);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: isActive ? '#EF4444' : colors.border,
                    backgroundColor: isActive ? '#EF444422' : colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500', color: isActive ? '#EF4444' : colors.muted }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <LogCard title={rs.cardWeight} subtitle={rs.cardWeightSub} icon="⚖️" accentColor="#0EA5E9"
          latest={data ? (() => { const w = formatWeight(data.weight ?? []); return w ? { lines: [w.value], label: w.label, source: w.source } : undefined; })() : undefined}
          onPress={() => navigateCard(rs.cardWeight, '/log/weight')} colors={colors} />
        <LogCard title={rs.cardVitals} subtitle={rs.cardVitalsSub} icon="❤️" accentColor="#EF4444"
          latest={formatVitals(filteredVitalRecords)}
          onPress={() => navigateCard(rs.cardVitals, '/log/vitals')} colors={colors} />
        {/* BP empty state — shown when no BP readings exist */}
        {!sync.isRunning && data &&
          filteredVitalRecords.filter(r => r.systolic != null || r.diastolic != null).length === 0 &&
          (data.bloodPressure ?? []).length === 0 && (
          <BloodPressureEmptyState
            onLog={() => navigateCard(rs.cardVitals, '/log/vitals')}
            onSync={forceSync}
          />
        )}
        <LogCard title={rs.cardSleep} subtitle={rs.cardSleepSub} icon="🌙" accentColor="#8B5CF6"
          latest={data ? formatLatestSleep((data.sleep as any) ?? []) : undefined}
          onPress={() => navigateCard(rs.cardSleep, '/log/sleep')} colors={colors} />
        {/* Glucose source filter chips — only shown when both HealthKit and manual records exist */}
        {showGlucoseFilter && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, marginTop: 2 }}>
            {(['all', 'healthkit', 'manual'] as const).map((f) => {
              const baseLabel = f === 'all' ? rs.filterAll : f === 'healthkit' ? rs.filterHealthKit : rs.filterManual;
              const count = f === 'all' ? allGlucoseRecords.length : f === 'healthkit' ? glucoseHKCount : glucoseManualCount;
              const label = `${baseLabel} (${count})`;
              const isActive = glucoseSourceFilter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGlucoseSourceFilter(f);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: isActive ? '#F43F5E' : colors.border,
                    backgroundColor: isActive ? '#F43F5E22' : colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500', color: isActive ? '#F43F5E' : colors.muted }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <LogCard title={rs.cardBloodSugar} subtitle={rs.cardBloodSugarSub} icon="🩸" accentColor="#F43F5E"
          latest={(() => { const g = formatGlucose(filteredGlucoseRecords); return g ? { lines: [g.value], label: g.label, source: g.source } : undefined; })()}
          onPress={() => navigateCard(rs.cardBloodSugar, '/log/blood-sugar')} colors={colors} />
        {/* Glucose empty state — shown when no glucose readings exist */}
        {!sync.isRunning && data && filteredGlucoseRecords.length === 0 && (
          <GlucoseEmptyState
            variant="dashboard"
            onLog={() => navigateCard(rs.cardBloodSugar, '/log/blood-sugar')}
            onSync={forceSync}
          />
        )}
        {/* ── Section Divider: Health Metrics → Activity ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {/* ── Activity ─────────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 0 }]}>{rs.sectionActivity}</Text>
        <LogCard title={rs.cardActivity} subtitle={rs.cardActivitySub} icon="🏃" accentColor="#22C55E"
          latest={data ? formatLastActivity(data.activity ?? [], distanceUnit) : undefined}
          onPress={() => navigateCard(rs.cardActivity, '/log/activity')} colors={colors} />
        {/* ── Section Divider: Activity → Nutrition ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {/* ── Nutrition (unified) ─────────────────────────────────────────────────────────────────────────────────────── */}
        <Text
          style={[s.sectionTitle, { marginTop: 0 }]}
          onLayout={(e) => { nutritionYRef.current = e.nativeEvent.layout.y; }}
        >{rs.cardNutrition}</Text>
        <UnifiedNutritionCard
          defaultExpanded={false}
          overrideExpanded={nutritionForceExpanded}
          weightKg={(() => { const w = (data?.weight ?? []); return w.length ? w[0].weightKg : null; })()}
          systolicBP={(() => {
            const synced = (data?.bloodPressure ?? []).find(r => r.systolic != null);
            if (synced) return synced.systolic;
            return (data?.vitalSigns ?? []).find(v => v.systolic)?.systolic ?? null;
          })()}
          diastolicBP={(() => {
            const synced = (data?.bloodPressure ?? []).find(r => r.diastolic != null);
            if (synced) return synced.diastolic;
            return (data?.vitalSigns ?? []).find(v => v.diastolic)?.diastolic ?? null;
          })()}
          heartRateBpm={(() => {
            const synced = (data?.pulse ?? []).find(r => r.bpm != null);
            if (synced) return synced.bpm;
            return (data?.vitalSigns ?? []).find(v => v.heartRate)?.heartRate ?? null;
          })()}
          spo2={(() => { const v = (data?.vitalSigns ?? []).find(v => v.oxygenSaturation ?? v.spo2); return v?.oxygenSaturation ?? v?.spo2 ?? null; })()}
        />
        {/* ── Section Divider: Nutrition → Personal Records ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {/* ── Personal Records (Lab Results + Appointments + Immunizations + Medications) ── */}
        {(() => {
          // Dynamic badge: count only cards that have at least one data entry
          const hasLabs          = (data?.labResults ?? []).length > 0;
          const hasAppts         = (data?.appointments ?? []).filter(a => new Date(a.dateTime).getTime() > Date.now()).length > 0;
          const hasImmunizations = (data?.immunizations ?? []).length > 0;
          const hasAllergies     = (data?.allergies ?? []).length > 0;
          const hasMeds          = (medications ?? []).length > 0;
          const filledCount      = [hasMeds, hasLabs, hasAppts, hasImmunizations, hasAllergies].filter(Boolean).length;
          // Show total cards (5) when no data yet; once data arrives, show how many have data
          const badgeCount       = filledCount > 0 ? filledCount : 5;
          return (
            <SectionLabel
              title={rs.personalRecordsTitle}
              count={badgeCount}
              accentColor="#0891B2"
              icon="cross.case.fill"
            />
          );
        })()}
        <LogCard
          title={rs.cardAllergies}
          subtitle={rs.cardAllergiesSub}
          icon="⚠️"
          accentColor="#DC2626"
          latestValue={(data?.allergies ?? []).length
            ? `${(data?.allergies ?? []).length} ${(data?.allergies ?? []).length !== 1 ? rs.latestAllergies : rs.latestAllergyOne}` : undefined}
          latestLabel={(data?.allergies ?? []).length ? rs.latestOnFile : undefined}
          onPress={() => navigateCard(rs.cardAllergies, '/log/allergies')} colors={colors} />
        <LogCard
          title={rs.cardMedications}
          subtitle={rs.cardMedicationsSub}
          icon="💊"
          accentColor="#7C3AED"
          latestValue={(medications ?? []).length
            ? `${(medications ?? []).filter(m => m.active).length} ${rs.latestActive}` : undefined}
          latestLabel={(medications ?? []).length ? rs.latestMedications : undefined}
          onPress={() => navigateCard(rs.cardMedications, '/medications')} colors={colors} />
        <LogCard title={rs.cardLabTracker} subtitle={rs.cardLabTrackerSub} icon="🧪" accentColor="#2563EB"
          latestValue={(data?.labResults ?? []).length
            ? `${(data?.labResults ?? []).length} ${rs.latestResults}` : undefined}
          latestLabel={(data?.labResults ?? []).length ? rs.latestOnFile : undefined}
          onPress={() => navigateCard(rs.cardLabTracker, '/labs')} colors={colors} />
        {(data?.labResults ?? []).length > 0 && (
          <LabTrendMiniChart labResults={data!.labResults ?? []} />
        )}
        <LogCard
          title={rs.cardDoctorAppts}
          subtitle={rs.cardDoctorApptsSub}
          icon="🗓️"
          accentColor="#0ECFB8"
          latestValue={(() => {
            const upcoming = (data?.appointments ?? []).filter(a => new Date(a.dateTime).getTime() > Date.now());
            return upcoming.length ? `${upcoming.length} ${rs.latestUpcoming}` : undefined;
          })()}
          latestLabel={(data?.appointments ?? []).filter(a => new Date(a.dateTime).getTime() > Date.now()).length ? rs.latestScheduled : undefined}
          onPress={() => navigateCard(rs.cardDoctorAppts, '/log/appointments')}
          colors={colors}
        />

        {/* ── Section Divider: Personal Records → Medical & Surgical History ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {/* ── Medical & Surgical History ─────────────────────────────── */}
        {(() => {
          const hasMedHx  = (data?.medicalHistory ?? []).length > 0;
          const hasSurgHx = (data?.surgicalHistory ?? []).length > 0;
          const filledCount = [hasMedHx, hasSurgHx].filter(Boolean).length;
          const badgeCount  = filledCount > 0 ? filledCount : 2;
          return (
            <SectionLabel
              title={rs.medSurgHistoryTitle}
              count={badgeCount}
              accentColor="#0EA5E9"
              icon="stethoscope"
            />
          );
        })()}
        <View style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#10B981' + '35' }}>
          <PrivacyBanner />
        </View>
        <LogCard
          title={rs.cardMedHistory}
          subtitle={rs.cardMedHistorySub}
          icon="🩺"
          accentColor="#0EA5E9"
          latestValue={(data?.medicalHistory ?? []).length
            ? `${(data?.medicalHistory ?? []).length} ${rs.latestConditions}` : undefined}
          latestLabel={(data?.medicalHistory ?? []).length ? rs.latestOnFile : undefined}
          onPress={() => navigateCard(rs.cardMedHistory, '/log/medical-history')} colors={colors} />
        <LogCard
          title={rs.cardSurgHistory}
          subtitle={rs.cardSurgHistorySub}
          icon="✂️"
          accentColor="#8B5CF6"
          latestValue={(data?.surgicalHistory ?? []).length
            ? `${(data?.surgicalHistory ?? []).length} ${rs.latestProcedures}` : undefined}
          latestLabel={(data?.surgicalHistory ?? []).length ? rs.latestOnFile : undefined}
          onPress={() => navigateCard(rs.cardSurgHistory, '/log/surgical-history')} colors={colors} />
        <View onLayout={(e) => { immunizationsYRef.current = e.nativeEvent.layout.y; }}>
          <LogCard
            title={rs.cardImmunizations}
            subtitle={rs.cardImmunizationsSub}
            icon="💉"
            accentColor="#22C55E"
            latestValue={(data?.immunizations ?? []).length
              ? `${(data?.immunizations ?? []).length} ${rs.latestRecords}` : undefined}
            latestLabel={(data?.immunizations ?? []).length ? rs.latestOnFile : undefined}
            onPress={() => navigateCard(rs.cardImmunizations, '/log/immunizations')} colors={colors} />
        </View>

        {/* Allergies moved above Medications — see Personal Records section above */}

        {/* Meal IQ History moved into UnifiedNutritionCard — see Meal IQ sub-tab */}

        {/* ── Section Divider: Medical History → Quick Stats ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {/* ── Quick Stats ──────────────────────────────────────────────────────────────────────── */}
        {data && ((data.weight ?? []).length > 0 || (data.bloodSugar ?? []).length > 0 || (data.activity ?? []).length > 0) && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 8 }]}>{rs.sectionQuickStats}</Text>
            <View style={s.statsGrid}>
              {(data.weight ?? []).length > 0 && (
                <GlassCard accentColor="#8B5CF6" noPadding style={s.statCard}>
                  <View style={s.statContent}>
                    <Text style={s.statEmoji}>⚖️</Text>
                    <Text style={[s.statValue, { color: '#8B5CF6' }]}>{(data.weight ?? []).length}</Text>
                    <Text style={s.statLabel}>{rs.statWeights}</Text>
                  </View>
                </GlassCard>
              )}
              {((data.vitalSigns ?? []).length + (data.bloodPressure ?? []).length + (data.pulse ?? []).length) > 0 && (
                <GlassCard accentColor="#06B6D4" noPadding style={s.statCard}>
                  <View style={s.statContent}>
                    <Text style={s.statEmoji}>💓</Text>
                    <Text style={[s.statValue, { color: '#06B6D4' }]}>{(data.vitalSigns ?? []).length + (data.bloodPressure ?? []).length + (data.pulse ?? []).length}</Text>
                    <Text style={s.statLabel}>{rs.statVitalSigns}</Text>
                  </View>
                </GlassCard>
              )}
              {(data.bloodSugar ?? []).length > 0 && (
                <GlassCard accentColor="#DC2626" noPadding style={s.statCard}>
                  <View style={s.statContent}>
                    <Text style={s.statEmoji}>🩸</Text>
                    <Text style={[s.statValue, { color: '#DC2626' }]}>{(data.bloodSugar ?? []).length}</Text>
                    <Text style={s.statLabel}>{rs.statGlucose}</Text>
                  </View>
                </GlassCard>
              )}
              {(data.activity ?? []).length > 0 && (
                <GlassCard accentColor="#22C55E" noPadding style={s.statCard}>
                  <View style={s.statContent}>
                    <Text style={s.statEmoji}>🏃</Text>
                    <Text style={[s.statValue, { color: '#22C55E' }]}>{(data.activity ?? []).length}</Text>
                    <Text style={s.statLabel}>{rs.statActivities}</Text>
                  </View>
                </GlassCard>
              )}
            </View>
          </>
        )}

        {/* ── Section Divider: Quick Stats → Recent Entries ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />
        {/* ── Recent Entries ─────────────────────────────────────────────────── */}
        <RecentEntriesSection externalFilter={params.filterCategory as any} />

        <View style={{ height: 40 }} />
      </ScrollView>
      <ScrollToTopButton opacity={recordScrollTopOpacity} visible={showRecordScrollTop} onPress={recordScrollToTop} />
      {/* Floating wellness disclaimer — absolute overlay, stays visible while scrolling */}
      <FloatingWellnessDisclaimer bottomOffset={80} position="bottom" />
    </ScreenContainer>
  );
}

// ─── Log section styles ───────────────────────────────────────────────────────

const logStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: c.foreground },
  headerSub: { fontSize: 14, color: c.muted, marginTop: 2 },
  collapseToggle: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, marginLeft: 8 },
  collapseToggleText: { fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: {
    flex: 1,
    minWidth: '44%',
  },
  statContent: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  statEmoji: { fontSize: 22, marginBottom: 4, textAlign: 'center' },
  statValue: { fontSize: 30, fontWeight: '800', color: c.primary },
  statLabel: { fontSize: 12, color: c.muted, textAlign: 'center', marginTop: 4, lineHeight: 16 },
});

