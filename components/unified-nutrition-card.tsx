/**
 * UnifiedNutritionCard
 *
 * Consolidates all nutrition-related content into a single collapsible card
 * on the Record screen. Two internal sub-tabs:
 *   1. Diet Log          — opens AiFoodCameraSheet + today's macro budget strip
 *   2. Evidence Insights — EvidenceInsightsPanel (standalone, no duplication)
 *
 * Collapsed by default (per project convention). Tapping the header expands/collapses.
 */

import React, { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/glass-card';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

import { useColors, useRawLang } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import { dietSubtitles, foodCameraStrings } from '@/lib/i18n';
import { getTodayNutrients, DailyNutrients } from '@/lib/health/daily-nutrients';
import { DailyMacroBudgetStrip } from '@/components/dietary-summary-view';
import { EvidenceInsightsPanel } from '@/components/evidence-insights-panel';
import { AiFoodCameraSheet } from '@/components/ai-food-camera-sheet';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { logEvent } from '@/lib/analytics';

const STORAGE_KEY_SUBTAB = '@vsht:nutrition_subtab';
// ─── Sub-tab definitions ──────────────────────────────────────────────────────
type NutritionSubTab = 'diet' | 'insights';
// SUB_TABS labels are resolved at render time via foodCameraStrings (see dietLogTabLabel, insightsTabLabel)
const SUB_TABS: { key: NutritionSubTab; labelKey: 'dietLogTabLabel' | 'insightsTabLabel'; icon: string }[] = [
  { key: 'diet',     labelKey: 'dietLogTabLabel', icon: '🥗' },
  { key: 'insights', labelKey: 'insightsTabLabel', icon: '🔬' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface UnifiedNutritionCardProps {
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
  weightKg?: number | null;
  systolicBP?: number | null;
  diastolicBP?: number | null;
  heartRateBpm?: number | null;
  spo2?: number | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnifiedNutritionCard({
  defaultExpanded = false,
  overrideExpanded,
  weightKg,
  systolicBP,
  diastolicBP,
  heartRateBpm,
  spo2,
}: UnifiedNutritionCardProps) {
  const colors = useColors();
  const { state, forceSync } = useHealth();
  const { dietType } = useDietType();
  const [cameraSheetVisible, setCameraSheetVisible] = useState(false);
  const [cameraInitialMode, setCameraInitialMode] = useState<'home' | 'plate' | 'barcode' | 'search'>('home');
  const { requirePremium: requireScanMealPremium, PremiumGateSheet: ScanMealGateSheet } = usePremiumGate();
  const rawLang = useRawLang();
  const fc = (foodCameraStrings as unknown as Record<string, typeof foodCameraStrings.en>)[rawLang] ?? foodCameraStrings.en;
  const dietOption = DIET_TYPE_OPTIONS.find(o => o.value === dietType);
  const _dietLabel = dietOption ? `${dietOption.label} Diet` : 'Diet';
  const dietEmoji = dietOption?.emoji ?? '🍽️';
  const dietAccent = dietOption?.color ?? '#06B6D4';
  const _dietSubtitleFallback = dietOption?.cardSubtitle ?? 'Track dietary intake for your protocol';
  const _langMap = (dietSubtitles as Record<string, Record<string, string>>)[rawLang] ?? dietSubtitles.en;
  const dietSubtitle = (dietType && _langMap[dietType]) ? _langMap[dietType] : _dietSubtitleFallback;

  const sodiumIntake = state.data?.sodiumIntake ?? [];
  const nutrients: DailyNutrients | null = getTodayNutrients(sodiumIntake);
  const entryCount = nutrients?.entry_count ?? 0;
  const todayKcal = nutrients?.total_calories_kcal ?? 0;

  // ── Expand / collapse ──────────────────────────────────────────────────────
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const isExpanded = overrideExpanded === false ? false : localExpanded;

    // ── Sub-tab (persisted to AsyncStorage) ───────────────────────────────────
  const [activeSubTab, setActiveSubTab] = useState<NutritionSubTab>('diet');

  // Restore last-used sub-tab on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_SUBTAB).then(val => {
      if (val === 'diet' || val === 'insights') {
        setActiveSubTab(val as NutritionSubTab);
      }
    }).catch(() => {});
  }, []);

  const handleSubTabChange = (tab: NutritionSubTab) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSubTab(tab);
    safeSetItem(STORAGE_KEY_SUBTAB, tab).catch(() => {});
  };

  // ── Camera sheet helpers ─────────────────────────────────────────────────────
  const openCameraSheet = (mode: 'home' | 'plate' | 'barcode' | 'search' = 'home') => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCameraInitialMode(mode);
    setCameraSheetVisible(true);
  };

  // ── Chevron animation ──────────────────────────────────────────────────────
  const chevronAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const handleToggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !localExpanded;
    setLocalExpanded(next);
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };
  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <GlassCard accentColor={dietAccent} noPadding style={{ marginBottom: 10 }}>
      {/* ── Header ── */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}
        onPress={handleToggle}
      >
        {/* Left: icon + labels */}
        <View style={[styles.iconBadge, { backgroundColor: dietAccent + '18', borderColor: dietAccent + '44' }]}>
          <Text style={styles.iconText}>{dietEmoji}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{fc.nutritionTabTitle}</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]} numberOfLines={1}>
            {isExpanded
              ? (SUB_TABS.find(t => t.key === activeSubTab) ? fc[SUB_TABS.find(t => t.key === activeSubTab)!.labelKey] : fc.dietLogTabLabel)
              : entryCount > 0
                ? `${entryCount} meal${entryCount !== 1 ? 's' : ''} · ${todayKcal} kcal today`
                : dietSubtitle}
          </Text>
        </View>
        {/* Right: entry badge + chevron */}
        {entryCount > 0 && (
          <View style={[styles.countBadge, { backgroundColor: dietAccent + '18', borderColor: dietAccent + '44' }]}>
            <Text style={[styles.countBadgeText, { color: dietAccent }]}>{entryCount}</Text>
          </View>
        )}
        <Animated.Text style={[styles.chevron, { color: colors.muted, transform: [{ rotate: chevronRotate }] }]}>
          ▾
        </Animated.Text>
      </Pressable>

      {/* ── Expanded content ── */}
      {isExpanded && (
        <>
          {/* Sub-tab selector */}
          <View style={[styles.subTabBar, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            {SUB_TABS.map((tab) => {
              const active = activeSubTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={({ pressed }) => [
                    styles.subTabBtn,
                    active && { borderBottomColor: dietAccent, borderBottomWidth: 2 },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => handleSubTabChange(tab.key)}
                >
                  <Text style={styles.subTabIcon}>{tab.icon}</Text>
                  <Text style={[styles.subTabLabel, { color: active ? dietAccent : colors.muted }]}>
                    {fc[tab.labelKey]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Sub-tab content */}
          <View style={styles.subTabContent}>
            {activeSubTab === 'diet' && (
              <View style={styles.dietPane}>
                {/* Daily macro budget strip */}
                <DailyMacroBudgetStrip sodiumIntake={sodiumIntake} />

                {/* Diet log entry buttons row: open log + camera shortcut */}
                <View style={styles.dietBtnRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.dietLogBtn,
                      { backgroundColor: dietAccent + '14', borderColor: dietAccent + '55', flex: 1 },
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => openCameraSheet('search')}
                  >
                    <Text style={styles.dietLogBtnIcon}>{dietEmoji}</Text>
                    <View style={styles.dietLogBtnText}>
                      <Text style={[styles.dietLogBtnTitle, { color: dietAccent }]}>{fc.logFood}</Text>
                      <Text style={[styles.dietLogBtnSub, { color: colors.muted }]}>{fc.searchPlaceholder}</Text>
                    </View>
                    <Text style={[styles.dietLogBtnArrow, { color: dietAccent }]}>›</Text>
                  </Pressable>

                  {/* Camera shortcut — photograph your plate */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.cameraBtn,
                      { backgroundColor: pressed ? '#10B981' + '30' : '#10B981' + '16', borderColor: '#10B981' + '55' },
                    ]}
                    onPress={requireScanMealPremium(() => openCameraSheet('home'), { feature: fc.scanMealTitle ?? 'Scan Meal' })}
                    accessibilityLabel="Photograph your plate to log a meal"
                  >
                    <Text style={styles.cameraBtnIcon}>📷</Text>
                    <Text style={[styles.cameraBtnLabel, { color: '#10B981' }]}>{fc.scanMeal ?? 'Scan Meal'}</Text>
                  </Pressable>
                </View>

                {/* Today's summary if entries exist */}
                {entryCount > 0 && (
                  <View style={[styles.summaryRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.summaryLabel, { color: colors.muted }]}>{fc.todayLabel}</Text>
                    <View style={styles.summaryPills}>
                      {nutrients && (
                        <>
                          <View style={[styles.pill, { backgroundColor: '#F97316' + '18' }]}>
                            <Text style={[styles.pillText, { color: '#F97316' }]}>{nutrients.total_calories_kcal} kcal</Text>
                          </View>
                          <View style={[styles.pill, { backgroundColor: '#3B82F6' + '18' }]}>
                            <Text style={[styles.pillText, { color: '#3B82F6' }]}>
                              {Math.max(0, nutrients.carbohydrates_g - nutrients.fiber_g).toFixed(0)}g {fc.netCarbsShort}
                            </Text>
                          </View>
                          <View style={[styles.pill, { backgroundColor: '#8B5CF6' + '18' }]}>
                            <Text style={[styles.pillText, { color: '#8B5CF6' }]}>{nutrients.fats_g.toFixed(0)}g {fc.fatShort}</Text>
                          </View>
                          <View style={[styles.pill, { backgroundColor: '#10B981' + '18' }]}>
                            <Text style={[styles.pillText, { color: '#10B981' }]}>{nutrients.protein_g.toFixed(0)}g {fc.protShort}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                )}
              </View>
            )}

              {activeSubTab === 'insights' && (
              <EvidenceInsightsPanel
                systolicBP={systolicBP ?? null}
                diastolicBP={diastolicBP ?? null}
                heartRateBpm={heartRateBpm ?? null}
                spo2={spo2 ?? null}
              />
            )}
          </View>
        </>
      )}

      {/* Smart Food Camera Sheet */}
      <AiFoodCameraSheet
        visible={cameraSheetVisible}
        onClose={() => setCameraSheetVisible(false)}
        initialMode={cameraInitialMode}
        onMealLogged={() => {
          setCameraSheetVisible(false);
          forceSync().catch(() => {});
        }}
        onScanMealPress={
          cameraInitialMode === 'search'
            ? requireScanMealPremium(() => openCameraSheet('home'), { feature: fc.scanMealTitle ?? 'Scan Meal' })
            : undefined
        }
        onBarcodeScanPress={
          cameraInitialMode === 'search'
            ? requireScanMealPremium(() => {
                logEvent('barcode_scan_gate_tap', { source: 'unified_nutrition_card' });
                openCameraSheet('barcode');
              }, { feature: fc.scanBarcodeTitle ?? 'Scan Barcode' })
            : undefined
        }
      />
      {ScanMealGateSheet}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Sub-tab bar
  subTabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabIcon: {
    fontSize: 13,
  },
  subTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  // Sub-tab content
  subTabContent: {
    padding: 12,
  },
  // Diet pane
  dietPane: {
    gap: 12,
  },
  dietLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  dietLogBtnIcon: {
    fontSize: 22,
  },
  dietLogBtnText: {
    flex: 1,
    gap: 2,
  },
  dietLogBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dietLogBtnSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  dietLogBtnArrow: {
    fontSize: 22,
    fontWeight: '300',
  },
  summaryRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 6,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  summaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Camera shortcut button
  dietBtnRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  cameraBtn: {
    width: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  cameraBtnIcon: {
    fontSize: 22,
  },
  cameraBtnLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 12,
  },
});
