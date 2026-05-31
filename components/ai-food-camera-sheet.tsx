/**
 * AiFoodCameraSheet
 *
 * A full-featured Smart food logging bottom sheet that replaces the /log/sodium screen.
 * Modes:
 *   1. Plate Scan  — photograph a meal → Apple Vision/LLM → USDA FoodData Central → serving confirm → log
 *                   Clarifai fallback when Vision confidence is low. Server fallback if no food detected.
 *   2. Barcode Scan — native on-device scanner → Open Food Facts → USDA enrichment (low-confidence) → log
 *   3. USDA Search — type a food name → searchFood → pick item(s) → macro preview → log
 *
 * Multi-select (Search mode):
 *   - Tapping a result row toggles it into a "selected" set (checkbox UI).
 *   - A floating Food Tray bar appears when ≥1 item is selected.
 *   - "Review Tray →" opens a tray panel with per-item serving chips and combined totals.
 *   - "Log All" saves each item as a separate SodiumRecord under the same meal context.
 *   - Single-item quick-preview is preserved: tapping when nothing is selected opens the
 *     preview panel immediately (no extra friction for the common case).
 *
 * After logging, entries are written to SodiumRecord via addSodium, which
 * immediately propagates to the Dashboard macro tiles, NeoNutrition graph, and
 * 7-day trend chart via useNutritionAlignment.
 *
 * FIX (Mar 2026): All inner component functions hoisted to module level.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors, useFoodCameraStrings } from '@/hooks';
import { useDietType } from '@/lib/health/diet-type';
import { useHealth } from '@/lib/health/health-context';
import { saveMealToHealthKit } from '@/lib/health/healthkit-write';
import { trpc } from '@/lib/trpc';
import * as SafeImagePicker from '@/lib/safe-image-picker';
import { useHealthKitNutritionPref } from '@/hooks/use-healthkit-nutrition-pref';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { foodCameraStrings } from '@/lib/i18n';
import type { SodiumRecord, SodiumMealContext } from '@/lib/health/types';
import { getMealContextForTime } from '@/lib/nutrition/meal-context-time';
import { sumTrayMacro, toggleTrayItem, updateTrayServing, TrayItem, ServingStep as TrayServingStep } from '@/lib/nutrition/tray-utils';
import { lookupBarcodeOFF } from '@/lib/nutrition/open-food-facts';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { MicrophoneIcon } from '@/components/ui/microphone-icon';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScanMode = 'home' | 'plate' | 'barcode' | 'search';

interface MacroPreview {
  foodDescription: string;
  calories: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  glycemicLoad: number | null;
  sodiumMg: number;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
  source: 'ai-photo' | 'barcode-scan' | 'diet-log';
}

interface SearchResult {
  id: string;
  name: string;
  brand: string;
  serving_size: string;
  serving_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  glycemic_index: number | null;
  clinical_notes: string;
}

/** A tray item is a selected SearchResult with its own serving multiplier */
type TrayItemLocal = TrayItem & { result: SearchResult };

// ─── Serving multipliers ──────────────────────────────────────────────────────
const SERVING_STEPS = [0.5, 1, 1.5, 2] as const;

// ─── AsyncStorage keys ───────────────────────────────────────────────────────
const PREV_ESTIMATE_KEY = '@vitalsync/food_scan_prev_estimate';
const SEARCH_CACHE_KEY = '@vitalsync/food_search_cache_v1';
const SEARCH_CACHE_MAX = 5;

type SearchCacheEntry = { query: string; results: SearchResult[]; ts: number };

async function readSearchCache(): Promise<SearchCacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchCacheEntry[];
  } catch { return []; }
}

async function writeSearchCache(query: string, results: SearchResult[]): Promise<void> {
  try {
    const existing = await readSearchCache();
    // Remove any prior entry for the same query (case-insensitive)
    const filtered = existing.filter(e => e.query.toLowerCase() !== query.toLowerCase());
    const updated: SearchCacheEntry[] = [
      { query, results, ts: Date.now() },
      ...filtered,
    ].slice(0, SEARCH_CACHE_MAX);
    await AsyncStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(updated));
  } catch { /* silent */ }
}
type ServingStep = typeof SERVING_STEPS[number];

// ─── Meal context labels ──────────────────────────────────────────────
const MEAL_CONTEXT_KEYS: { key: SodiumMealContext; fcKey: keyof typeof foodCameraStrings.en; emoji: string }[] = [
  { key: 'breakfast', fcKey: 'breakfast', emoji: '🌅' },
  { key: 'lunch',     fcKey: 'lunch',     emoji: '☀️' },
  { key: 'dinner',    fcKey: 'dinner',    emoji: '🌙' },
  { key: 'snack',     fcKey: 'snack',     emoji: '🍎' },
  { key: 'other',     fcKey: 'otherMeal', emoji: '🍽️' },
];

// ─── Accent colours ───────────────────────────────────────────────────────────
const EMERALD = '#10B981';
const AMBER   = '#F59E0B';
const VIOLET  = '#8B5CF6';
const BLUE    = '#3B82F6';
const ROSE    = '#F43F5E';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applyServing(val: number | null | undefined, mult: number): number | null {
  if (val == null) return null;
  return Math.round(val * mult * 10) / 10;
}

/**
 * Returns a ±% range string for Smart photo estimates.
 * High confidence: ±10%, Medium: ±20%, Low: ±35%
 * Displayed as "Carbs: 42–58 g" to convey estimation uncertainty.
 */
function macroRange(
  val: number | null,
  mult: number,
  confidence?: 'high' | 'medium' | 'low',
): string {
  if (val == null) return '—';
  const v = val * mult;
  const pct = confidence === 'high' ? 0.10 : confidence === 'medium' ? 0.20 : 0.35;
  const lo = Math.max(0, Math.round(v * (1 - pct)));
  const hi = Math.round(v * (1 + pct));
  return `${lo}–${hi}`;
}

function confidenceBadge(c: 'high' | 'medium' | 'low' | undefined, fc: typeof foodCameraStrings.en) {
  if (c === 'high')   return { label: fc.highConfidence ?? 'High confidence', color: EMERALD };
  if (c === 'medium') return { label: fc.mediumConfidence ?? 'Medium confidence', color: AMBER };
  return { label: fc.lowConfidence ?? 'Low confidence', color: ROSE };
}

// sumTrayMacro is imported from lib/nutrition/tray-utils

// ─── Props ────────────────────────────────────────────────────────────────────
interface AiFoodCameraSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Initial mode — defaults to 'home' */
  initialMode?: ScanMode;
  /** Pre-fill the USDA search query when opening in search mode */
  initialSearchQuery?: string;
  /** Called immediately after a meal is successfully logged */
  onMealLogged?: () => void;
  /**
   * Optional override for when the user taps the "Scan Meal" mode tab.
   * If provided, the tap is intercepted and this callback fires instead of
   * switching to scan mode — use this to show a premium gate.
   * When NOT provided, the tab switches mode normally (default behaviour).
   */
  onScanMealPress?: () => void;
  /**
   * Optional override for when the user taps the "Scan Barcode" button.
   * If provided, the tap is intercepted and this callback fires instead of
   * opening the barcode scanner — use this to show a premium gate.
   * When NOT provided, the barcode scanner opens normally (default behaviour).
   */
  onBarcodeScanPress?: () => void;
}

// ─── MacroTile (module-level) ─────────────────────────────────────────────────
interface MacroTileProps {
  label: string;
  value: number | null;
  unit: string;
  color: string;
  mutedColor: string;
}
function MacroTile({ label, value, unit, color, mutedColor }: MacroTileProps) {
  return (
    <View style={[styles.macroTile, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <Text style={[styles.macroTileValue, { color }]}>
        {value != null ? (Number.isInteger(value) ? value : value.toFixed(1)) : '—'}
      </Text>
      <Text style={[styles.macroTileUnit, { color: mutedColor }]}>{unit}</Text>
      <Text style={[styles.macroTileLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

// ─── ServingStepper (module-level) ────────────────────────────────────────────
interface ServingStepperProps {
  servingMult: ServingStep;
  setServingMult: (s: ServingStep) => void;
  /** Custom gram weight — overrides the multiplier chips when set */
  customGrams: string;
  setCustomGrams: (g: string) => void;
  /** Reference serving weight in grams (from USDA), used to compute multiplier from gram input */
  referenceWeightG?: number | null;
  isDark: boolean;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
}
function ServingStepper({
  servingMult,
  setServingMult,
  customGrams,
  setCustomGrams,
  referenceWeightG,
  isDark,
  mutedColor,
  fc,
}: ServingStepperProps) {
  // Determine if custom gram input is active (non-empty and valid number)
  const gramValue = parseFloat(customGrams);
  const gramActive = customGrams.trim() !== '' && !isNaN(gramValue) && gramValue > 0;

  return (
    <View style={styles.servingRow}>
      <Text style={[styles.servingLabel, { color: mutedColor }]}>{fc.servingSizeLabel ?? 'Serving size'}</Text>
      <View style={styles.servingBtns}>
        {SERVING_STEPS.map((s) => (
          <Pressable
            key={s}
            style={({ pressed }) => [
              styles.servingBtn,
              {
                backgroundColor: !gramActive && servingMult === s
                  ? EMERALD + '22'
                  : isDark ? '#1E293B' : '#F1F5F9',
                borderColor: !gramActive && servingMult === s ? EMERALD : (isDark ? '#334155' : '#CBD5E1'),
              },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setServingMult(s);
              setCustomGrams(''); // clear custom gram input when chip is tapped
            }}
          >
            <Text style={[styles.servingBtnText, { color: !gramActive && servingMult === s ? EMERALD : mutedColor }]}>
              ×{s}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* Custom gram input */}
      <View style={[styles.gramInputRow, { marginTop: 8 }]}>
        <Text style={[styles.servingLabel, { color: mutedColor, marginRight: 8 }]}>{fc.orLabel ?? 'or'}</Text>
        <View style={[
          styles.gramInputWrap,
          {
            backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
            borderColor: gramActive ? EMERALD : (isDark ? '#334155' : '#CBD5E1'),
          },
        ]}>
          <TextInput
            style={[styles.gramInput, { color: gramActive ? EMERALD : mutedColor }]}
            value={customGrams}
            onChangeText={setCustomGrams}
            placeholder="180"
            placeholderTextColor={mutedColor + '80'}
            keyboardType="default"
            returnKeyType="done"
            maxLength={5}
          />
          <Text style={[styles.gramUnit, { color: mutedColor }]}>g</Text>
        </View>
        {referenceWeightG && gramActive ? (
          <Text style={[styles.gramHint, { color: mutedColor }]}>
            ×{(gramValue / referenceWeightG).toFixed(2)} serving
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── MealContextPicker (module-level) ─────────────────────────────────────────
interface MealContextPickerProps {
  mealCtx: SodiumMealContext;
  setMealCtx: (ctx: SodiumMealContext) => void;
  isDark: boolean;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
}
function MealContextPicker({ mealCtx, setMealCtx, isDark, mutedColor, fc }: MealContextPickerProps) {
  return (
    <View style={styles.mealCtxRow}>
      <Text style={[styles.servingLabel, { color: mutedColor }]}>{fc.mealContextLabel ?? 'Meal'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mealCtxScroll}>
        {MEAL_CONTEXT_KEYS.map((ctx) => (
          <Pressable
            key={ctx.key}
            style={({ pressed }) => [
              styles.mealCtxBtn,
              {
                backgroundColor: mealCtx === ctx.key
                  ? VIOLET + '22'
                  : isDark ? '#1E293B' : '#F1F5F9',
                borderColor: mealCtx === ctx.key ? VIOLET : (isDark ? '#334155' : '#CBD5E1'),
              },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMealCtx(ctx.key);
            }}
          >
            <Text style={styles.mealCtxEmoji}>{ctx.emoji}</Text>
            <Text style={[styles.mealCtxLabel, { color: mealCtx === ctx.key ? VIOLET : mutedColor }]}>
              {(fc as any)[ctx.fcKey] ?? ctx.fcKey}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── MacroPreviewPanel (module-level) ─────────────────────────────────────────
interface MacroPreviewPanelProps {
  preview: MacroPreview;
  servingMult: ServingStep;
  setServingMult: (s: ServingStep) => void;
  customGrams: string;
  setCustomGrams: (g: string) => void;
  referenceWeightG?: number | null;
  mealCtx: SodiumMealContext;
  setMealCtx: (ctx: SodiumMealContext) => void;
  logging: boolean;
  logged: boolean;
  onLog: () => void;
  onLogMore?: () => void;
  onDone?: () => void;
  loggedSummary?: string;
  onSearchByName?: (name: string) => void;
  onScanAgain?: () => void;
  onKeepEstimate?: () => void;
  onScanAnother?: () => void;
  onHealthKitSave?: () => void;
  onHealthKitSkip?: () => void;
  showHealthKitPrompt?: boolean;
  isDark: boolean;
  foregroundColor: string;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
}
function MacroPreviewPanel({
  preview,
  servingMult,
  setServingMult,
  customGrams,
  setCustomGrams,
  referenceWeightG,
  mealCtx,
  setMealCtx,
  logging,
  logged,
  onLog,
  onLogMore,
  onDone,
  loggedSummary,
  onSearchByName,
  onScanAgain,
  onKeepEstimate,
  onScanAnother,
  onHealthKitSave,
  onHealthKitSkip,
  showHealthKitPrompt,
  isDark,
  foregroundColor,
  mutedColor,
  fc,
}: MacroPreviewPanelProps) {
  const badge = confidenceBadge(preview.confidence, fc);
  const gramValue = parseFloat(customGrams);
  const gramActive = customGrams.trim() !== '' && !isNaN(gramValue) && gramValue > 0;
  const effectiveMult: number = gramActive ? gramValue / 100 : servingMult;
  const noMacros = preview.calories == null && preview.carbsG == null && preview.proteinG == null;
  return (
    <View style={[styles.previewPanel, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
      {/* Food name + confidence */}
      <View style={styles.previewHeader}>
        <Text style={[styles.previewFoodName, { color: foregroundColor }]} numberOfLines={2}>
          {preview.foodDescription}
        </Text>
        <View style={[styles.confidenceBadge, { backgroundColor: badge.color + '18', borderColor: badge.color + '44' }]}>
          <Text style={[styles.confidenceBadgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>

      {/* Macro tiles grid */}
      <View style={styles.macroGrid}>
        <MacroTile label={fc.calories} value={applyServing(preview.calories, effectiveMult)} unit="kcal" color={VIOLET} mutedColor={mutedColor} />
        <MacroTile label={fc.carbs}    value={applyServing(preview.carbsG, effectiveMult)}   unit="g"    color={AMBER}  mutedColor={mutedColor} />
        <MacroTile label={fc.protein}  value={applyServing(preview.proteinG, effectiveMult)} unit="g"    color={EMERALD} mutedColor={mutedColor} />
        <MacroTile label={fc.fat}      value={applyServing(preview.fatG, effectiveMult)}      unit="g"    color={BLUE}   mutedColor={mutedColor} />
        <MacroTile label={fc.fiber}    value={applyServing(preview.fiberG, effectiveMult)}   unit="g"    color="#EAB308" mutedColor={mutedColor} />
        <MacroTile label={fc.sugar}    value={applyServing(preview.sugarG, effectiveMult)}   unit="g"    color={ROSE}   mutedColor={mutedColor} />
      </View>

      {/* Glycemic load */}
      {preview.glycemicLoad != null && (
        <View style={styles.glRow}>
          <Text style={[styles.glLabel, { color: mutedColor }]}>{fc.glycemicLoad ?? 'Glycemic Load'}</Text>
          <View style={[styles.glBadge, {
            backgroundColor: preview.glycemicLoad < 10 ? EMERALD + '18' : preview.glycemicLoad < 20 ? AMBER + '18' : ROSE + '18',
            borderColor: preview.glycemicLoad < 10 ? EMERALD + '44' : preview.glycemicLoad < 20 ? AMBER + '44' : ROSE + '44',
          }]}>
            <Text style={[styles.glValue, {
              color: preview.glycemicLoad < 10 ? EMERALD : preview.glycemicLoad < 20 ? AMBER : ROSE,
            }]}>
              {preview.glycemicLoad} {preview.glycemicLoad < 10 ? `· ${fc.glLow ?? 'Low'}` : preview.glycemicLoad < 20 ? `· ${fc.glMedium ?? 'Medium'}` : `· ${fc.glHigh ?? 'High'}`}
            </Text>
          </View>
        </View>
      )}

      {/* Macro range display — Smart photo estimates only */}
      {preview.source === 'ai-photo' && !noMacros && (
        <View style={[styles.rangeBox, { backgroundColor: BLUE + '0D', borderColor: BLUE + '30' }]}>
          <Text style={[styles.rangeTitle, { color: BLUE }]}>{fc.estimatedRangesTitle ?? 'ESTIMATED RANGES'} {(fc.estimatedRangesPct ?? '±{pct}%').replace('{pct}', preview.confidence === 'high' ? '10' : preview.confidence === 'medium' ? '20' : '35')}</Text>
          <View style={styles.rangeRow}>
            <Text style={[styles.rangeItem, { color: AMBER }]}>{fc.carbs ?? 'Carbs'}: {macroRange(preview.carbsG, effectiveMult, preview.confidence)} g</Text>
            <Text style={[styles.rangeItem, { color: EMERALD }]}>{fc.protein ?? 'Protein'}: {macroRange(preview.proteinG, effectiveMult, preview.confidence)} g</Text>
            <Text style={[styles.rangeItem, { color: BLUE }]}>{fc.fat ?? 'Fat'}: {macroRange(preview.fatG, effectiveMult, preview.confidence)} g</Text>
          </View>
          <Text style={[styles.rangeDisclaimer, { color: mutedColor }]}>
            {fc.estimatedRangesDisclaimer ?? 'Estimated ranges only. Not a nutritional prescription. Values may vary by preparation method and portion.'}
          </Text>
        </View>
      )}

      {/* Smart reasoning */}
      {preview.reasoning ? (
        <Text style={[styles.reasoning, { color: mutedColor }]} numberOfLines={2}>
          💡 {preview.reasoning}
        </Text>
      ) : null}

      {/* Scan Again shortcut — shown only for low/medium-confidence AI photo scans, hidden after Keep Estimate */}
      {(preview.confidence === 'low' || preview.confidence === 'medium') && onScanAgain && !logged && (
        <ScanAgainConfirmRow
          fc={fc}
          isDark={isDark}
          mutedColor={mutedColor}
          onScanAgain={onScanAgain}
          onKeepEstimate={onKeepEstimate}
        />
      )}
      {/* USDA no-match quick action */}
      {noMacros && onSearchByName ? (
        <View style={[styles.noMacrosBox, { backgroundColor: AMBER + '0D', borderColor: AMBER + '30' }]}>
          <Text style={[styles.noMacrosText, { color: mutedColor }]}>
            {fc.usdaNoMacrosDesc ?? 'USDA had no macro data for this item. Search by name for accurate values.'}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.searchUsdaBtn,
              { backgroundColor: AMBER + '18', borderColor: AMBER + '44', opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSearchByName(preview.foodDescription);
            }}
          >
            <Text style={[styles.searchUsdaBtnText, { color: AMBER }]}>
              {(fc.searchUsdaFor ?? '🔍 Search USDA for') + ' \"' + preview.foodDescription.slice(0, 28) + (preview.foodDescription.length > 28 ? '…' : '') + '\" →'}
            </Text>
          </Pressable>
        </View>
      ) : null}

       {/* Serving stepper */}
      <ServingStepper
        servingMult={servingMult}
        setServingMult={setServingMult}
        customGrams={customGrams}
        setCustomGrams={setCustomGrams}
        referenceWeightG={referenceWeightG}
        isDark={isDark}
        mutedColor={mutedColor}
        fc={fc}
      />
      {/* Meal context */}
      <MealContextPicker mealCtx={mealCtx} setMealCtx={setMealCtx} isDark={isDark} mutedColor={mutedColor} fc={fc} />

      {/* Log button */}
      <Pressable
        style={({ pressed }) => [
          styles.logBtn,
          { backgroundColor: logged ? '#22C55E' : EMERALD, opacity: pressed || logging || logged ? 0.8 : 1 },
        ]}
        onPress={onLog}
        disabled={logging || logged}
      >
        {logging
          ? <ActivityIndicator color="#FFFFFF" size="small" />
          : logged
            ? <Text style={styles.logBtnText}>{fc.savedLabel ?? '✓ Saved'}</Text>
            : <Text style={styles.logBtnText}>{fc.logThisMeal ?? 'Log This Meal →'}</Text>
        }
      </Pressable>

      {/* Inline success banner — replaces Alert */}
      {logged && (onLogMore || onDone) && (
        <View style={[styles.successBanner, { backgroundColor: isDark ? '#052e16' : '#f0fdf4', borderColor: '#22C55E44' }]}>
          <Text style={[styles.successBannerTitle, { color: '#22C55E' }]}>{fc.loggedLabel ?? '✓ Logged!'}</Text>
          {loggedSummary ? (
            <Text style={[styles.successBannerSummary, { color: mutedColor }]} numberOfLines={2}>{loggedSummary}</Text>
          ) : null}
          {/* Apple Health inline prompt — shown on iOS when preference not yet set */}
          {showHealthKitPrompt && (onHealthKitSave || onHealthKitSkip) && (
            <View style={[styles.hkPromptRow, { borderColor: isDark ? '#1E3A5F' : '#BFDBFE', backgroundColor: isDark ? '#0C1A2E' : '#EFF6FF' }]}>
              <Text style={[styles.hkPromptLabel, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>♥ {fc.addToAppleHealth ?? 'Add to Apple Health'}?</Text>
              <View style={styles.hkPromptBtns}>
                {onHealthKitSave && (
                  <Pressable
                    style={({ pressed }) => [styles.hkPromptBtn, { backgroundColor: '#1D4ED8', opacity: pressed ? 0.8 : 1 }]}
                    onPress={onHealthKitSave}
                  >
                    <Text style={styles.hkPromptBtnText}>{fc.addToAppleHealth ?? 'Add to Apple Health'}</Text>
                  </Pressable>
                )}
                {onHealthKitSkip && (
                  <Pressable
                    style={({ pressed }) => [styles.hkPromptBtn, styles.hkPromptBtnOutline, { borderColor: isDark ? '#334155' : '#CBD5E1', opacity: pressed ? 0.7 : 1 }]}
                    onPress={onHealthKitSkip}
                  >
                    <Text style={[styles.hkPromptBtnText, { color: mutedColor }]}>{fc.skipAppleHealth ?? 'Skip'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          <View style={styles.successBannerActions}>
            {onLogMore && (
              <Pressable
                style={({ pressed }) => [styles.successActionBtn, styles.successActionBtnOutline, { borderColor: EMERALD, opacity: pressed ? 0.7 : 1 }]}
                onPress={onLogMore}
              >
                <Text style={[styles.successActionBtnText, { color: EMERALD }]}>{fc.logMoreBtn ?? '+ Log More'}</Text>
              </Pressable>
            )}
            {onScanAnother && (
              <Pressable
                style={({ pressed }) => [styles.successActionBtn, styles.successActionBtnOutline, { borderColor: EMERALD + 'AA', opacity: pressed ? 0.7 : 1 }]}
                onPress={onScanAnother}
              >
                <Text style={[styles.successActionBtnText, { color: EMERALD }]}>{fc.scanAnotherItem ?? '📷 Scan another item →'}</Text>
              </Pressable>
            )}
            {onDone && (
              <Pressable
                style={({ pressed }) => [styles.successActionBtn, { backgroundColor: EMERALD, opacity: pressed ? 0.8 : 1 }]}
                onPress={onDone}
              >
                <Text style={[styles.successActionBtnText, { color: '#FFFFFF' }]}>{fc.doneBtn ?? 'Done'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── TrayReviewPanel (module-level) ───────────────────────────────────────────
interface TrayReviewPanelProps {
  trayItems: TrayItemLocal[];
  mealCtx: SodiumMealContext;
  setMealCtx: (ctx: SodiumMealContext) => void;
  logging: boolean;
  logged: boolean;
  onUpdateServing: (id: string, mult: ServingStep) => void;
  onRemoveItem: (id: string) => void;
  onLogAll: () => void;
  onLogMore?: () => void;
  onDone?: () => void;
  loggedSummary?: string;
  onHealthKitSave?: () => void;
  onHealthKitSkip?: () => void;
  showHealthKitPrompt?: boolean;
  isDark: boolean;
  foregroundColor: string;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
}
function TrayReviewPanel({
  trayItems,
  mealCtx,
  setMealCtx,
  logging,
  logged,
  onUpdateServing,
  onRemoveItem,
  onLogAll,
  onLogMore,
  onDone,
  loggedSummary,
  onHealthKitSave,
  onHealthKitSkip,
  showHealthKitPrompt,
  isDark,
  foregroundColor,
  mutedColor,
  fc,
}: TrayReviewPanelProps) {
  const totalKcal    = sumTrayMacro(trayItems, 'calories');
  const totalProtein = sumTrayMacro(trayItems, 'protein_g');
  const totalCarbs   = sumTrayMacro(trayItems, 'carbs_g');
  const totalFat     = sumTrayMacro(trayItems, 'fat_g');

  return (
    <View style={styles.trayPanel}>
      {/* Combined totals bar */}
      <View style={[styles.trayTotalsBar, { backgroundColor: isDark ? '#0F172A' : '#F0FDF4', borderColor: EMERALD + '44' }]}>
        <Text style={[styles.trayTotalsTitle, { color: EMERALD }]}>
          {trayItems.length} item{trayItems.length !== 1 ? 's' : ''} selected
        </Text>
        <View style={styles.trayTotalsMacros}>
          <Text style={[styles.trayTotalsMacroText, { color: VIOLET }]}>{totalKcal} kcal</Text>
          <Text style={[styles.trayTotalsSep, { color: mutedColor }]}>·</Text>
          <Text style={[styles.trayTotalsMacroText, { color: EMERALD }]}>{totalProtein}g P</Text>
          <Text style={[styles.trayTotalsSep, { color: mutedColor }]}>·</Text>
          <Text style={[styles.trayTotalsMacroText, { color: AMBER }]}>{totalCarbs}g C</Text>
          <Text style={[styles.trayTotalsSep, { color: mutedColor }]}>·</Text>
          <Text style={[styles.trayTotalsMacroText, { color: BLUE }]}>{totalFat}g F</Text>
        </View>
      </View>

      {/* Per-item cards */}
      {trayItems.map((item) => (
        <View
          key={item.result.id}
          style={[styles.trayItemCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}
        >
          {/* Header row: name + remove */}
          <View style={styles.trayItemHeader}>
            <Text style={[styles.trayItemName, { color: foregroundColor }]} numberOfLines={2}>
              {item.result.name}
              {item.result.brand !== 'Generic' ? ` (${item.result.brand})` : ''}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.trayRemoveBtn, pressed && { opacity: 0.6 }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRemoveItem(item.result.id);
              }}
            >
              <Text style={styles.trayRemoveBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Serving sub-row */}
          <Text style={[styles.trayItemServing, { color: mutedColor }]}>
            {item.result.serving_size}
          </Text>

          {/* Inline macro summary */}
          <View style={styles.trayItemMacroRow}>
            <Text style={[styles.trayItemMacroChip, { color: VIOLET }]}>
              {Math.round(item.result.calories * item.servingMult)} kcal
            </Text>
            <Text style={[styles.trayItemMacroChip, { color: EMERALD }]}>
              {Math.round(item.result.protein_g * item.servingMult)}g P
            </Text>
            <Text style={[styles.trayItemMacroChip, { color: AMBER }]}>
              {Math.round(item.result.carbs_g * item.servingMult)}g C
            </Text>
            <Text style={[styles.trayItemMacroChip, { color: BLUE }]}>
              {Math.round(item.result.fat_g * item.servingMult)}g F
            </Text>
          </View>

          {/* Per-item serving chips */}
          <View style={styles.trayServingRow}>
            <Text style={[styles.servingLabel, { color: mutedColor }]}>Serving</Text>
            <View style={styles.servingBtns}>
              {SERVING_STEPS.map((s) => (
                <Pressable
                  key={s}
                  style={({ pressed }) => [
                    styles.servingBtn,
                    {
                      backgroundColor: item.servingMult === s
                        ? EMERALD + '22'
                        : isDark ? '#1E293B' : '#F1F5F9',
                      borderColor: item.servingMult === s ? EMERALD : (isDark ? '#334155' : '#CBD5E1'),
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onUpdateServing(item.result.id, s);
                  }}
                >
                  <Text style={[styles.servingBtnText, { color: item.servingMult === s ? EMERALD : mutedColor }]}>
                    ×{s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ))}

      {/* Meal context picker */}
      <MealContextPicker mealCtx={mealCtx} setMealCtx={setMealCtx} isDark={isDark} mutedColor={mutedColor} fc={fc} />

      {/* Log all button */}
      <Pressable
        style={({ pressed }) => [
          styles.logBtn,
          { backgroundColor: logged ? '#22C55E' : EMERALD, opacity: pressed || logging || logged ? 0.8 : 1 },
        ]}
        onPress={onLogAll}
        disabled={logging || logged}
      >
        {logging
          ? <ActivityIndicator color="#FFFFFF" size="small" />
          : logged
            ? <Text style={styles.logBtnText}>✓ All Saved</Text>
            : <Text style={styles.logBtnText}>Log All {trayItems.length} Foods →</Text>
        }
      </Pressable>

      {/* Inline success banner — replaces Alert */}
      {logged && (onLogMore || onDone) && (
        <View style={[styles.successBanner, { backgroundColor: isDark ? '#052e16' : '#f0fdf4', borderColor: '#22C55E44' }]}>
          <Text style={[styles.successBannerTitle, { color: '#22C55E' }]}>✓ {trayItems.length} Food{trayItems.length !== 1 ? 's' : ''} Logged!</Text>
          {loggedSummary ? (
            <Text style={[styles.successBannerSummary, { color: mutedColor }]} numberOfLines={2}>{loggedSummary}</Text>
          ) : null}
          {/* Apple Health inline prompt — shown on iOS when preference not yet set */}
          {showHealthKitPrompt && (onHealthKitSave || onHealthKitSkip) && (
            <View style={[styles.hkPromptRow, { borderColor: isDark ? '#1E3A5F' : '#BFDBFE', backgroundColor: isDark ? '#0C1A2E' : '#EFF6FF' }]}>
              <Text style={[styles.hkPromptLabel, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>♥ {fc.addToAppleHealth ?? 'Add to Apple Health'}?</Text>
              <View style={styles.hkPromptBtns}>
                {onHealthKitSave && (
                  <Pressable
                    style={({ pressed }) => [styles.hkPromptBtn, { backgroundColor: '#1D4ED8', opacity: pressed ? 0.8 : 1 }]}
                    onPress={onHealthKitSave}
                  >
                    <Text style={styles.hkPromptBtnText}>{fc.addToAppleHealth ?? 'Add to Apple Health'}</Text>
                  </Pressable>
                )}
                {onHealthKitSkip && (
                  <Pressable
                    style={({ pressed }) => [styles.hkPromptBtn, styles.hkPromptBtnOutline, { borderColor: isDark ? '#334155' : '#CBD5E1', opacity: pressed ? 0.7 : 1 }]}
                    onPress={onHealthKitSkip}
                  >
                    <Text style={[styles.hkPromptBtnText, { color: mutedColor }]}>{fc.skipAppleHealth ?? 'Skip'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          <View style={styles.successBannerActions}>
            {onLogMore && (
              <Pressable
                style={({ pressed }) => [styles.successActionBtn, styles.successActionBtnOutline, { borderColor: EMERALD, opacity: pressed ? 0.7 : 1 }]}
                onPress={onLogMore}
              >
                <Text style={[styles.successActionBtnText, { color: EMERALD }]}>{fc.logMoreBtn ?? '+ Log More'}</Text>
              </Pressable>
            )}
            {onDone && (
              <Pressable
                style={({ pressed }) => [styles.successActionBtn, { backgroundColor: EMERALD, opacity: pressed ? 0.8 : 1 }]}
                onPress={onDone}
              >
                <Text style={[styles.successActionBtnText, { color: '#FFFFFF' }]}>{fc.doneBtn ?? 'Done'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── RecentMealsList (module-level) ───────────────────────────────────────────
type SodiumRecordLike = {
  id: string;
  timestamp?: string;
  mealContext?: SodiumMealContext;
  foodDescription?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sodiumMg: number;
  /** Confidence level from AI photo scan — drives the dot indicator on Recent Scans cards */
  scanConfidence?: 'high' | 'medium' | 'low';
};
// ─── RecentScansSection (module-level) ───────────────────────────────────────
// ─── ScanAgainConfirmRow (module-level) ───────────────────────────────────────────────
interface ScanAgainConfirmRowProps {
  fc: typeof foodCameraStrings.en;
  isDark: boolean;
  mutedColor: string;
  onScanAgain: () => void;
  onKeepEstimate?: () => void;
}
function ScanAgainConfirmRow({ fc, isDark, mutedColor, onScanAgain, onKeepEstimate }: ScanAgainConfirmRowProps) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.scanAgainBtn,
          { backgroundColor: ROSE + '12', borderColor: ROSE + '44', opacity: pressed ? 0.75 : 1 },
        ]}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setConfirming(true);
        }}
      >
        <View style={styles.scanAgainContent}>
          <Text style={styles.scanAgainIcon}>📷</Text>
          <View style={styles.scanAgainTextWrap}>
            <Text style={[styles.scanAgainTitle, { color: ROSE }]}>
              {fc.scanAgainBtn ?? 'Scan Again'}
            </Text>
            <Text style={[styles.scanAgainSub, { color: mutedColor }]}>
              {fc.scanAgainSub ?? 'Retake photo — current estimate stays until replaced'}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={[styles.scanAgainConfirmRow, { borderColor: ROSE + '44', backgroundColor: ROSE + '0A' }]}>
      <Text style={[styles.scanAgainConfirmLabel, { color: ROSE }]}>
        {fc.scanAgainConfirmLabel ?? 'Keep current estimate or retake?'}
      </Text>
      <View style={styles.scanAgainConfirmBtns}>
        <Pressable
          style={({ pressed }) => [styles.scanAgainConfirmBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', opacity: pressed ? 0.7 : 1 }]}
          onPress={() => { setConfirming(false); onKeepEstimate?.(); }}
        >
          <Text style={[styles.scanAgainConfirmBtnText, { color: mutedColor }]}>
            {fc.scanAgainKeep ?? 'Keep Estimate'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.scanAgainConfirmBtn, { backgroundColor: ROSE + '18', opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onScanAgain();
          }}
        >
          <Text style={[styles.scanAgainConfirmBtnText, { color: ROSE }]}>
            {fc.scanAgainRetake ?? 'Retake Photo'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface RecentScansSectionProps {
  recentMeals: SodiumRecordLike[];
  isDark: boolean;
  foregroundColor: string;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
  onReLog: (meal: SodiumRecordLike) => void;
  /** Previous estimate fallback chip — shown after tapping Scan Again */
  prevEstimate?: { kcal: number; name: string } | null;
}
function RecentScansSection({ recentMeals, isDark, foregroundColor, mutedColor, fc, onReLog, prevEstimate }: RecentScansSectionProps) {
  const scans = recentMeals.slice(0, 3);
  if (scans.length === 0 && prevEstimate == null) return null;
  return (
    <View style={styles.recentScansSection}>
      {/* Previous estimate chip — shown after tapping Scan Again */}
      {prevEstimate != null && (
        <View style={[styles.prevEstimateChip, { backgroundColor: AMBER + '14', borderColor: AMBER + '44' }]}>
          <Text style={[styles.prevEstimateText, { color: AMBER }]}>
            {(fc.prevEstimateChip ?? 'Previous estimate: {kcal} kcal — {name}')
              .replace('{kcal}', String(Math.round(prevEstimate.kcal)))
              .replace('{name}', prevEstimate.name.slice(0, 24) + (prevEstimate.name.length > 24 ? '…' : ''))}
          </Text>
        </View>
      )}
      {scans.length > 0 && (
      <Text style={[styles.recentScansHeader, { color: mutedColor }]}>
        {fc.recentScansTitle ?? 'Recent Scans'}
      </Text>
      )}
      <View style={styles.recentScanCards}>
        {scans.map((meal) => {
          const ctxEmoji = MEAL_CONTEXT_KEYS.find(c => c.key === meal.mealContext)?.emoji ?? '🍽️';
          const confDotColor = meal.scanConfidence === 'high' ? EMERALD
            : meal.scanConfidence === 'medium' ? AMBER
            : meal.scanConfidence === 'low' ? ROSE
            : null;
          return (
            <View
              key={meal.id}
              style={[styles.recentScanCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}
            >
              <Text style={styles.recentScanEmoji}>{ctxEmoji}</Text>
              <Text style={[styles.recentScanName, { color: foregroundColor }]} numberOfLines={2}>
                {meal.foodDescription ?? 'Meal'}
              </Text>
              {meal.calories != null && (
                <View style={styles.recentScanKcalRow}>
                  <Text style={[styles.recentScanKcal, { color: VIOLET }]}>
                    {Math.round(meal.calories)} kcal
                  </Text>
                  {confDotColor != null && (
                    <View style={[styles.confDot, { backgroundColor: confDotColor }]} />
                  )}
                </View>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.reLogBtn,
                  { backgroundColor: EMERALD + '18', borderColor: EMERALD + '55' },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onReLog(meal);
                }}
              >
                <Text style={[styles.reLogBtnText, { color: EMERALD }]}>
                  {fc.reLogBtn ?? 'Re-log'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface RecentMealsListProps {
  recentMeals: SodiumRecordLike[];
  swipedId: string | null;
  setSwipedId: (id: string | null) => void;
  deleteSodium: (id: string) => void;
  isDark: boolean;
  foregroundColor: string;
  mutedColor: string;
}
function RecentMealsList({ recentMeals, swipedId, setSwipedId, deleteSodium, isDark, foregroundColor, mutedColor }: RecentMealsListProps) {
  if (recentMeals.length === 0) return null;
  return (
    <View style={styles.recentSection}>
      <Text style={[styles.recentHeader, { color: mutedColor }]}>Recent Meals</Text>
      {recentMeals.map((meal) => {
        const isSwiped = swipedId === meal.id;
        const mealTime = meal.timestamp
          ? (() => {
              const d = new Date(meal.timestamp);
              const now = new Date();
              const diffMs = now.getTime() - d.getTime();
              const diffH = Math.floor(diffMs / 3600000);
              const diffM = Math.floor(diffMs / 60000);
              if (diffM < 1) return 'just now';
              if (diffM < 60) return `${diffM}m ago`;
              if (diffH < 24) return `${diffH}h ago`;
              return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            })()
          : '';
        const ctxEmoji = MEAL_CONTEXT_KEYS.find(c => c.key === meal.mealContext)?.emoji ?? '🍽️';
        return (
          <View key={meal.id} style={styles.recentItemWrap}>
            {/* Main row */}
            <Pressable
              style={({ pressed }) => [
                styles.recentItem,
                { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' },
                pressed && { opacity: 0.85 },
                isSwiped && { marginRight: 72 },
              ]}
              onPress={() => { if (isSwiped) setSwipedId(null); }}
              onLongPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSwipedId(isSwiped ? null : meal.id);
              }}
              delayLongPress={400}
            >
              <Text style={styles.recentItemEmoji}>{ctxEmoji}</Text>
              <View style={styles.recentItemContent}>
                <Text style={[styles.recentItemName, { color: foregroundColor }]} numberOfLines={1}>
                  {meal.foodDescription ?? 'Meal'}
                </Text>
                <Text style={[styles.recentItemMeta, { color: mutedColor }]}>
                  {[meal.calories != null ? `${Math.round(meal.calories)} kcal` : null,
                    meal.proteinG != null ? `${Math.round(meal.proteinG)}g P` : null,
                    meal.carbsG != null ? `${Math.round(meal.carbsG)}g C` : null,
                    meal.fatG != null ? `${Math.round(meal.fatG)}g F` : null,
                  ].filter(Boolean).join(' · ') || `${meal.sodiumMg}mg Na`}
                </Text>
              </View>
              <Text style={[styles.recentItemTime, { color: mutedColor }]}>{mealTime}</Text>
            </Pressable>
            {/* Delete button revealed by long-press */}
            {isSwiped && (
              <Pressable
                style={({ pressed }) => [
                  styles.recentDeleteBtn,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  deleteSodium(meal.id);
                  setSwipedId(null);
                }}
              >
                <Text style={styles.recentDeleteIcon}>🗑️</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── HomeScreen (module-level) ────────────────────────────────────────────────
interface HomeScreenProps {
  scanning: boolean;
  openingCamera?: boolean;
  mode: ScanMode;
  onPlateScan: () => void;
  onBarcodeScan: () => void;
  recentMeals: SodiumRecordLike[];
  swipedId: string | null;
  setSwipedId: (id: string | null) => void;
  deleteSodium: (id: string) => void;
  isDark: boolean;
  foregroundColor: string;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
  onReLog: (meal: SodiumRecordLike) => void;
  prevEstimate?: { kcal: number; name: string } | null;
  scanBtnSpinAnim?: Animated.Value;
}
function HomeScreen({ scanning, openingCamera, mode, onPlateScan, onBarcodeScan, recentMeals, swipedId, setSwipedId, deleteSodium, isDark, foregroundColor, mutedColor, fc, onReLog, prevEstimate, scanBtnSpinAnim }: HomeScreenProps) {
  return (
    <>
      <View style={styles.homeGrid}>
        {/* Plate Scan */}
        <Pressable
          style={({ pressed }) => [
            styles.homeBtn,
            { backgroundColor: EMERALD + '14', borderColor: EMERALD + '55', flex: 1 },
            pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
          ]}
          onPress={onPlateScan}
          disabled={scanning}
        >
          {(scanning || openingCamera) && scanBtnSpinAnim ? (
            <>
              <Animated.Text
                style={[
                  styles.homeBtnIcon,
                  {
                    transform: [{
                      rotate: scanBtnSpinAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    }],
                  },
                ]}
              >
                📷
              </Animated.Text>
              <Text style={[styles.homeBtnTitle, { color: EMERALD }]}>{fc.scanMealTitle ?? 'Scan Meal'}</Text>
              <Text style={[styles.homeBtnSub, { color: EMERALD + 'AA', fontSize: 10 }]}>Opening camera…</Text>
            </>
          ) : (
            <>
              <Text style={styles.homeBtnIcon}>📷</Text>
              <Text style={[styles.homeBtnTitle, { color: EMERALD }]}>{fc.scanMealTitle ?? 'Scan Meal'}</Text>
              <Text style={[styles.homeBtnSub, { color: mutedColor }]}>{fc.scanMealSub ?? 'Photograph a meal to estimate nutrition'}</Text>
            </>
          )}
        </Pressable>

        {/* Barcode Scan */}
        <Pressable
          style={({ pressed }) => [
            styles.homeBtn,
            { backgroundColor: BLUE + '14', borderColor: BLUE + '55', flex: 1 },
            pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
          ]}
          onPress={onBarcodeScan}
          disabled={scanning}
        >
          {scanning && mode === 'home' ? (
            <ActivityIndicator color={BLUE} size="large" />
          ) : (
            <>
              <Text style={styles.homeBtnIcon}>🔲</Text>
              <Text style={[styles.homeBtnTitle, { color: BLUE }]}>{fc.scanBarcodeTitle ?? 'Scan Barcode'}</Text>
              <Text style={[styles.homeBtnSub, { color: mutedColor }]}>{fc.scanBarcodeSub ?? 'Packaged food labels'}</Text>
            </>
          )}
        </Pressable>
      </View>
      <RecentScansSection
        recentMeals={recentMeals}
        isDark={isDark}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        fc={fc}
        onReLog={onReLog}
        prevEstimate={prevEstimate}
      />
      <RecentMealsList
        recentMeals={recentMeals}
        swipedId={swipedId}
        setSwipedId={setSwipedId}
        deleteSodium={deleteSodium}
        isDark={isDark}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
      />
    </>
  );
}

// ─── SearchScreen (module-level) ──────────────────────────────────────────────
interface SearchScreenProps {
  initialQuery: string;
  scanning: boolean;
  /** Recent search queries from AsyncStorage cache — shown as chips when search bar is empty+focused */
  recentQueries: string[];
  /** Active diet protocol (e.g. 'diabetic', 'renal') — used to highlight aligned result cards */
  activeDietProtocol?: string;
  searchResults: SearchResult[];
  selectedResult: SearchResult | null;
  trayItems: TrayItemLocal[];
  preview: MacroPreview | null;
  servingMult: ServingStep;
  setServingMult: (s: ServingStep) => void;
  customGrams: string;
  setCustomGrams: (g: string) => void;
  referenceWeightG?: number | null;
  mealCtx: SodiumMealContext;
  setMealCtx: (ctx: SodiumMealContext) => void;
  logging: boolean;
  logged: boolean;
  showTray: boolean;
  onLog: () => void;
  onLogAll: () => void;
  onLogMore?: () => void;
  onDone?: () => void;
  loggedSummary?: string;
  onSearchByName?: (name: string) => void;
  onHealthKitSave?: () => void;
  onHealthKitSkip?: () => void;
  showHealthKitPrompt?: boolean;
  onSubmitSearch: (query: string, setLocalText: (t: string) => void) => void;
  onSelectResult: (item: SearchResult) => void;
  onToggleTrayItem: (item: SearchResult) => void;
  onUpdateTrayServing: (id: string, mult: ServingStep) => void;
  onRemoveTrayItem: (id: string) => void;
  onOpenTray: () => void;
  onClearSearch: () => void;
  onVoiceSearch: (onTranscript: (t: string) => void) => void;
  micPulse: Animated.Value;
  isDark: boolean;
  foregroundColor: string;
  mutedColor: string;
  fc: typeof foodCameraStrings.en;
}
function SearchScreen({
  initialQuery,
  scanning,
  recentQueries,
  activeDietProtocol,
  searchResults,
  selectedResult,
  trayItems,
  preview,
  servingMult,
  setServingMult,
  customGrams,
  setCustomGrams,
  referenceWeightG,
  mealCtx,
  setMealCtx,
  logging,
  logged,
  showTray,
  onLog,
  onLogAll,
  onLogMore,
  onDone,
  loggedSummary,
  onSearchByName,
  onHealthKitSave,
  onHealthKitSkip,
  showHealthKitPrompt,
  onSubmitSearch,
  onSelectResult,
  onToggleTrayItem,
  onUpdateTrayServing,
  onRemoveTrayItem,
  onOpenTray,
  onClearSearch,
  onVoiceSearch,
  micPulse,
  isDark,
  foregroundColor,
  mutedColor,
  fc,
}: SearchScreenProps) {
  const [localText, setLocalText] = React.useState(initialQuery);
  const [inputFocused, setInputFocused] = React.useState(false);
  const submitSearch = useCallback(() => {
    const q = localText.trim();
    if (!q) return;
    onSubmitSearch(q, setLocalText);
    Keyboard.dismiss();
  }, [localText, onSubmitSearch]);

  // Show recent chips when bar is empty + focused and no results yet
  const showRecentChips = inputFocused && localText.trim().length === 0 && recentQueries.length > 0 && searchResults.length === 0 && !scanning;

  // Detect diet alignment from clinical_notes
  const isDietAligned = (notes: string): boolean => {
    if (!activeDietProtocol || !notes) return false;
    const n = notes.toLowerCase();
    // Positive alignment keywords
    const positives = ['excellent', 'good for', 'suitable', 'recommended', 'aligned', 'beneficial', 'ideal', 'safe', 'low gi', 'low-gi', 'high protein', 'low sodium', 'low phosphorus', 'low potassium', 'heart-healthy', 'diabetic-friendly', 'renal-friendly'];
    // Negative conflict keywords — if present, NOT aligned
    const negatives = ['avoid', 'conflict', 'caution', 'high gi', 'high-gi', 'not recommended', 'limit', 'restrict', 'contraindicated', 'high sodium', 'high phosphorus', 'high potassium'];
    const hasPositive = positives.some(p => n.includes(p));
    const hasNegative = negatives.some(p => n.includes(p));
    return hasPositive && !hasNegative;
  };

  const dietBadgeLabel = activeDietProtocol
    ? `✓ ${activeDietProtocol.charAt(0).toUpperCase() + activeDietProtocol.slice(1)}-friendly`
    : '';

  return (
    <View style={styles.searchPane}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: inputFocused ? VIOLET : (isDark ? '#334155' : '#CBD5E1') }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: foregroundColor }]}
          placeholder="Search food (e.g. 'grilled salmon 150g')"
          placeholderTextColor={mutedColor}
          value={localText}
          onChangeText={setLocalText}
          onSubmitEditing={submitSearch}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          returnKeyType="search"
          autoFocus={false}
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
        />
        {localText.length > 0 && (
          <Pressable onPress={() => { setLocalText(''); onClearSearch(); }}>
            <Text style={[styles.clearBtn, { color: mutedColor }]}>✕</Text>
          </Pressable>
        )}
      </View>
      {/* ── Recent search chips (shown when empty + focused) ── */}
      {showRecentChips && (
        <View style={styles.recentChipsContainer}>
          <Text style={[styles.recentChipsLabel, { color: mutedColor }]}>Recent searches</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentChipsScroll}>
            {recentQueries.map((q) => (
              <Pressable
                key={q}
                style={({ pressed }) => [
                  styles.recentChip,
                  { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#CBD5E1', opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => {
                  setLocalText(q);
                  setInputFocused(false);
                  onSubmitSearch(q, setLocalText);
                  Keyboard.dismiss();
                }}
              >
                <Text style={[styles.recentChipText, { color: foregroundColor }]}>🕐 {q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}


      {/* Powered-by badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4, marginBottom: 2 }}>
        <Text style={{ fontSize: 10, color: mutedColor }}>🤖 AI-powered · USDA Reference Values</Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.searchSubmitBtn,
          { backgroundColor: VIOLET, opacity: pressed || scanning ? 0.8 : 1 },
        ]}
        onPress={submitSearch}
        disabled={scanning || !localText.trim()}
      >
        {scanning
          ? <ActivityIndicator color="#FFFFFF" size="small" />
          : <Text style={styles.searchSubmitBtnText}>{fc.searchUsdaDatabase ?? 'Search USDA Database'}</Text>
        }
      </Pressable>

      {/* ── Tray Review Panel ── */}
      {showTray && trayItems.length > 0 && (
        <TrayReviewPanel
          trayItems={trayItems}
          mealCtx={mealCtx}
          setMealCtx={setMealCtx}
          logging={logging}
          logged={logged}
          onUpdateServing={onUpdateTrayServing}
          onRemoveItem={onRemoveTrayItem}
          onLogAll={onLogAll}
          onLogMore={onLogMore}
          onDone={onDone}
          loggedSummary={loggedSummary}
          onHealthKitSave={onHealthKitSave}
          onHealthKitSkip={onHealthKitSkip}
          showHealthKitPrompt={showHealthKitPrompt}
          isDark={isDark}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          fc={fc}
        />
      )}

      {/* ── Shimmer loading skeleton (shown while LLM/USDA search is in progress) ── */}
      {scanning && !preview && !showTray && (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.shimmerCard,
                { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', opacity: 1 - i * 0.15 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={[styles.shimmerLine, { width: '70%', backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
                <View style={[styles.shimmerLine, { width: '45%', marginTop: 6, backgroundColor: isDark ? '#2D3748' : '#EDF2F7' }]} />
              </View>
              <View style={[styles.shimmerPill, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
            </View>
          ))}
        </View>
      )}
      {/* ── No results empty state ── */}
      {searchResults.length === 0 && !scanning && initialQuery.trim().length > 0 && !preview && !showTray && (
        <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: foregroundColor, marginBottom: 4 }}>No results found</Text>
          <Text style={{ fontSize: 13, color: mutedColor, textAlign: 'center' }}>
            No matches found for "{initialQuery}". Try a more specific term (e.g. "grilled salmon 150g" or "oatmeal with banana").
          </Text>
        </View>
      )}

      {/* ── Results list (with multi-select checkboxes) ── */}
      {searchResults.length > 0 && !preview && !showTray && (
        <View style={styles.resultsList}>
          <Text style={[styles.resultsHeader, { color: mutedColor }]}>
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — tap to select, long-press for multi-select
          </Text>
          {searchResults.map((item) => {
            const isSelected = trayItems.some(t => t.result.id === item.id);
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.resultItem,
                  {
                    backgroundColor: isSelected
                      ? EMERALD + '14'
                      : selectedResult?.id === item.id
                        ? VIOLET + '14'
                        : isDark ? '#0F172A' : '#FFFFFF',
                    borderColor: isSelected
                      ? EMERALD + '77'
                      : selectedResult?.id === item.id
                        ? VIOLET + '55'
                        : isDark ? '#1E293B' : '#E2E8F0',
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => {
                  // If nothing is in the tray yet, open single-item preview (fast path)
                  if (trayItems.length === 0 && !isSelected) {
                    onSelectResult(item);
                  } else {
                    // Multi-select mode: toggle item in/out of tray
                    onToggleTrayItem(item);
                  }
                }}
                onLongPress={() => {
                  // Long-press always enters multi-select mode
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onToggleTrayItem(item);
                }}
                delayLongPress={300}
              >
                {/* Checkbox */}
                <View style={[
                  styles.resultCheckbox,
                  {
                    backgroundColor: isSelected ? EMERALD : 'transparent',
                    borderColor: isSelected ? EMERALD : (isDark ? '#475569' : '#CBD5E1'),
                  },
                ]}>
                  {isSelected && <Text style={styles.resultCheckmark}>✓</Text>}
                </View>

                <View style={styles.resultItemLeft}>
                  <Text style={[styles.resultItemName, { color: foregroundColor }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.resultItemSub, { color: mutedColor }]} numberOfLines={1}>
                    {item.brand !== 'Generic' ? `${item.brand} · ` : ''}{item.serving_size}
                  </Text>
                  {/* Diet-aligned badge */}
                  {isDietAligned(item.clinical_notes) && (
                    <View style={[styles.dietBadge, { backgroundColor: EMERALD + '22', borderColor: EMERALD + '55' }]}>
                      <Text style={[styles.dietBadgeText, { color: EMERALD }]}>{dietBadgeLabel}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.resultItemRight}>
                  <Text style={[styles.resultItemKcal, { color: VIOLET }]}>{item.calories}</Text>
                  <Text style={[styles.resultItemKcalUnit, { color: mutedColor }]}>kcal</Text>
                </View>
              </Pressable>
            );
          })}

          {/* Floating tray bar — appears when ≥1 item selected */}
          {trayItems.length > 0 && (
            <Pressable
              style={({ pressed }) => [
                styles.trayBar,
                { backgroundColor: EMERALD, opacity: pressed ? 0.88 : 1 },
              ]}
              onPress={onOpenTray}
            >
              <View style={styles.trayBarBadge}>
                <Text style={styles.trayBarBadgeText}>{trayItems.length}</Text>
              </View>
              <Text style={styles.trayBarText}>
                Review Tray · {sumTrayMacro(trayItems, 'calories')} kcal
              </Text>
              <Text style={styles.trayBarArrow}>→</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Macro preview after single-item selection */}
      {preview && !showTray && (
        <MacroPreviewPanel
          preview={preview}
          servingMult={servingMult}
          setServingMult={setServingMult}
          customGrams={customGrams}
          setCustomGrams={setCustomGrams}
          referenceWeightG={referenceWeightG}
          mealCtx={mealCtx}
          setMealCtx={setMealCtx}
          logging={logging}
          logged={logged}
          onLog={onLog}
          onLogMore={onLogMore}
          onDone={onDone}
          loggedSummary={loggedSummary}
          onSearchByName={onSearchByName}
          onHealthKitSave={onHealthKitSave}
          onHealthKitSkip={onHealthKitSkip}
          showHealthKitPrompt={showHealthKitPrompt}
          isDark={isDark}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          fc={fc}
        />
      )}
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AiFoodCameraSheet({
  visible,
  onClose,
  initialMode = 'home',
  initialSearchQuery,
  onMealLogged,
  onScanMealPress,
  onBarcodeScanPress,
}: AiFoodCameraSheetProps) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const fc = useFoodCameraStrings();
  const { addSodium, deleteSodium, state: healthState } = useHealth();
  const recentMeals = (healthState.data?.sodiumIntake ?? []).slice(0, 5);
  const { dietType } = useDietType();

  // tRPC mutations
  // analysePhotoMutation kept for server-side fallback (dev/sandbox only)
  const analysePhotoMutation   = trpc.nutrition.analysePhoto.useMutation();
  // lookupBarcodeMutation kept for fallback; primary path now uses Open Food Facts
  const _lookupBarcodeMutation  = trpc.nutrition.lookupBarcode.useMutation();
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  // Server-side food search via tRPC (uses built-in LLM + USDA reference values)
  const searchFoodMutation = trpc.nutritionAI.searchFood.useMutation();
  // Voice search: keyboard dictation only — no server recording
  const searchInputRef = useRef<TextInput>(null);
  const { pref: hkPref, savePref: saveHkPref } = useHealthKitNutritionPref();

  // ── State ──────────────────────────────────────────────────────────────────
  const [hkToast, setHkToast]             = useState(false);
  const [lowConfToast, setLowConfToast]   = useState(false);
  const [prevEstimate, setPrevEstimate]   = useState<{ kcal: number; name: string } | null>(null);
  const [mode, setMode]                   = useState<ScanMode>(initialMode);
  const [scanning, setScanning]           = useState(false);
  const [capturedUri, setCapturedUri]     = useState<string | null>(null);
  const [showScanComplete, setShowScanComplete] = useState(false);
  const [openingCamera, setOpeningCamera]  = useState(false);
  const [sessionLogCount, setSessionLogCount] = useState(0);
  const [_keepEstimateTapped, setKeepEstimateTapped] = useState(false);
  const [preview, setPreview]             = useState<MacroPreview | null>(null);
  const [servingMult, setServingMult]     = useState<ServingStep>(1);
  const [customGrams, setCustomGrams]     = useState<string>('');
  const [referenceWeightG, setReferenceWeightG] = useState<number | null>(null);
  const [mealCtx, setMealCtx]             = useState<SodiumMealContext>('other');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [logging, setLogging]             = useState(false);
  const [logged,  setLogged]              = useState(false);
  const [loggedSummary, setLoggedSummary]  = useState<string | undefined>(undefined);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  // Multi-select tray state
  const [trayItems, setTrayItems]   = useState<TrayItemLocal[]>([]);
  const [showTray, setShowTray]     = useState(false);

  // Apple Health inline prompt state (replaces Alert.alert for first-time HK pref)
  const [showHkPrompt, setShowHkPrompt] = useState(false);
  const pendingHkCallback = useRef<(() => void) | null>(null);
  // Recent search queries loaded from AsyncStorage cache
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  // Load recent queries whenever the sheet becomes visible
  useEffect(() => {
    if (!visible) return;
    readSearchCache().then((cache) => {
      setRecentQueries(cache.map(e => e.query));
    });
  }, [visible]);

  // Load persisted prevEstimate (30-min TTL)
  useEffect(() => {
    AsyncStorage.getItem(PREV_ESTIMATE_KEY).then((v) => {
      if (!v) return;
      try {
        const parsed = JSON.parse(v) as { kcal: number; name: string; ts: number };
        const ageMs = Date.now() - (parsed.ts ?? 0);
        if (ageMs < 30 * 60 * 1000) {
          setPrevEstimate({ kcal: parsed.kcal, name: parsed.name });
        } else {
          AsyncStorage.removeItem(PREV_ESTIMATE_KEY).catch(() => {});
        }
      } catch (_) { /* ignore */ }
    }).catch(() => {});
  }, []);

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(0)).current;
  const micPulse = useRef(new Animated.Value(1)).current;
  // Scanner ring spin animation
  const scanSpinAnim = useRef(new Animated.Value(0)).current;
  const scanCompleteAnim = useRef(new Animated.Value(0)).current;
  const scanBtnSpinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setPreview(null);
      setCapturedUri(null);
      setOpeningCamera(false);
      setShowScanComplete(false);
      setServingMult(1);
      setCustomGrams('');
      setReferenceWeightG(null);
      setLogged(false);   // ← reset so user can log again after reopening
      setLoggedSummary(undefined);
      setSessionLogCount(0);
      setKeepEstimateTapped(false);
      setShowHkPrompt(false);
      pendingHkCallback.current = null;
      setMealCtx(getMealContextForTime()); // ← auto-select based on time of day
      setSearchQuery(initialSearchQuery ?? '');
      setSearchResults([]);
      setSelectedResult(null);
      setTrayItems([]);
      setShowTray(false);
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialMode, initialSearchQuery]);

  // No recording animation needed — mic button just focuses the search TextInput

  // Start/stop scanner ring spin based on scanning state
  useEffect(() => {
    if (scanning) {
      scanSpinAnim.setValue(0);
      Animated.loop(
        Animated.timing(scanSpinAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      scanSpinAnim.stopAnimation();
    }
  }, [scanning, scanSpinAnim]);

  // Spin the scan button icon while scanning or opening camera
  useEffect(() => {
    if (scanning || openingCamera) {
      scanBtnSpinAnim.setValue(0);
      Animated.loop(
        Animated.timing(scanBtnSpinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      scanBtnSpinAnim.stopAnimation();
      scanBtnSpinAnim.setValue(0);
    }
  }, [scanning, openingCamera, scanBtnSpinAnim]);

  // Animate scan-complete popup in
  useEffect(() => {
    if (showScanComplete) {
      scanCompleteAnim.setValue(0);
      Animated.spring(scanCompleteAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 12,
      }).start();
    } else {
      scanCompleteAnim.setValue(0);
    }
  }, [showScanComplete, scanCompleteAnim]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  // ── Plate scan — Apple Vision → USDA FoodData Central (privacy-first) ────────
  // Pipeline:
  //   1. Apple Vision / server multimodal LLM → food labels (on-device / our server)
  //   2. Clarifai fallback if Vision confidence is low
  //   3. USDA FoodData Central → lab-verified macros (direct REST, no proxy)
  //   4. Serving confirmation UI (×0.5 / ×1 / ×1.5 / ×2 multiplier)
  //   5. HealthKit write-back fires automatically via addSodium → saveMealToHealthKit
  const handlePlateScan = useCallback(async () => {
    if (onScanMealPress) {
      // Parent has provided a premium gate — fire it instead of opening the camera
      onScanMealPress();
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpeningCamera(true);
    try {
      const perm = await SafeImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setOpeningCamera(false);
        Alert.alert('Camera Access', 'Please allow camera access in Settings to scan meals.');
        return;
      }
      const result = await SafeImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        base64: true,
        allowsEditing: false,
      });
      setOpeningCamera(false);
      if (result.canceled || !result.assets?.[0]?.base64) return;
      // Store the captured photo URI for the scanner overlay
      const capturedPhotoUri = result.assets[0].uri;
      setCapturedUri(capturedPhotoUri);
      setScanning(true);

      // Step 1: Recognise food via Gemini Vision (primary) → fallback chain
      const { recogniseAndLookup } = await import('@/lib/nutrition/apple-vision-food');
      const { recognition, usdaItem } = await recogniseAndLookup(result.assets[0].base64);

      // No food detected at all (all Gemini attempts failed)
      if (!usdaItem && !recognition.primaryFood) {
        setPreview({
          foodDescription: 'Meal photo',
          calories: null,
          carbsG: null,
          proteinG: null,
          fatG: null,
          fiberG: null,
          sugarG: null,
          glycemicLoad: null,
          sodiumMg: 0,
          confidence: 'low',
          reasoning: 'Could not identify food items. Try a clearer, well-lit photo or search by name.',
          source: 'ai-photo',
        });
        setCapturedUri(null);
        setMode('plate');
        setLowConfToast(true);
        setTimeout(() => setLowConfToast(false), 4000);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      let builtPreview: MacroPreview;
      if (usdaItem) {
        // Step 2a: Gemini returned direct nutrition data (synthetic USDA item)
        setReferenceWeightG(usdaItem.servingWeightG ?? 100);
        const servingNote = usdaItem.servingDescription
          ? `Serving: ${usdaItem.servingDescription}`
          : 'Estimated values for this meal';
        builtPreview = {
          foodDescription: usdaItem.description,
          calories: usdaItem.calories,
          carbsG: usdaItem.carbsG,
          proteinG: usdaItem.proteinG,
          fatG: usdaItem.fatG,
          fiberG: usdaItem.fiberG,
          sugarG: usdaItem.sugarG,
          glycemicLoad: usdaItem.glycemicLoad,
          sodiumMg: usdaItem.sodiumMg ?? 0,
          confidence: usdaItem.confidence,
          reasoning: `${recognition.summary}\n${servingNote}`,
          source: 'ai-photo',
        };
      } else {
        // Step 2b: Vision detected food but no nutrition data
        builtPreview = {
          foodDescription: recognition.primaryFood || 'Detected meal',
          calories: null,
          carbsG: null,
          proteinG: null,
          fatG: null,
          fiberG: null,
          sugarG: null,
          glycemicLoad: null,
          sodiumMg: 0,
          confidence: 'low',
          reasoning: `${recognition.summary}\nSearch by name for accurate macros.`,
          source: 'ai-photo',
        };
      }
      // Store preview — MacroPreviewPanel renders inline below the photo
      setPreview(builtPreview);
      setMode('plate');
      // Show low-confidence toast when confidence is low
      const finalConf = usdaItem ? usdaItem.confidence : 'low';
      if (finalConf === 'low') {
        setLowConfToast(true);
        setTimeout(() => setLowConfToast(false), 4000);
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setOpeningCamera(false);
      Alert.alert('Scan Failed', err?.message ?? 'Could not analyse the photo. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setScanning(false);
    }
  }, [onScanMealPress]);

  // ── Barcode scan — native on-device scanner → Open Food Facts API ──────────
  const handleBarcodeScan = useCallback(() => {
    if (onBarcodeScanPress) {
      // Parent has provided a gate — fire it instead of opening the scanner
      onBarcodeScanPress();
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowBarcodeScanner(true);
  }, [onBarcodeScanPress]);

  const handleBarcodeDetected = useCallback(async (barcodeValue: string) => {
    setShowBarcodeScanner(false);
    setScanning(true);
    try {
      // Primary: Open Food Facts (3M+ products, community-maintained)
      const scan = await lookupBarcodeOFF(barcodeValue);
      if (!scan) throw new Error('Could not look up barcode. Try searching by name.');

      // Enrichment: if OFF confidence is low, try USDA for better macro data
      let finalScan = scan;
      if (scan.confidence === 'low' && scan.productName) {
        try {
          const { lookupBestUsdaMatch } = await import('@/lib/nutrition/usda-fdc');
          const usdaItem = await lookupBestUsdaMatch(scan.productName);
          if (usdaItem && usdaItem.confidence !== 'low') {
            finalScan = {
              ...scan,
              calories: usdaItem.calories ?? scan.calories,
              carbsG: usdaItem.carbsG ?? scan.carbsG,
              proteinG: usdaItem.proteinG ?? scan.proteinG,
              fatG: usdaItem.fatG ?? scan.fatG,
              fiberG: usdaItem.fiberG ?? scan.fiberG,
              sugarG: usdaItem.sugarG ?? scan.sugarG,
              sodiumMg: usdaItem.sodiumMg ?? scan.sodiumMg,
              potassiumMg: usdaItem.potassiumMg ?? scan.potassiumMg,
              glycemicLoad: usdaItem.glycemicLoad ?? scan.glycemicLoad,
              confidence: usdaItem.confidence,
              reasoning: `${scan.reasoning} (enriched with USDA ${usdaItem.source})`,
            };
          }
        } catch (_unused) {
          // USDA enrichment failure is non-fatal
        }
      }

      setPreview({
        foodDescription: finalScan.foodDescription || 'Scanned product',
        calories: finalScan.calories ?? null,
        carbsG: finalScan.carbsG ?? null,
        proteinG: finalScan.proteinG ?? null,
        fatG: finalScan.fatG ?? null,
        fiberG: finalScan.fiberG ?? null,
        sugarG: finalScan.sugarG ?? null,
        glycemicLoad: finalScan.glycemicLoad ?? null,
        sodiumMg: finalScan.sodiumMg ?? 0,
        confidence: finalScan.confidence,
        reasoning: finalScan.reasoning,
        source: 'barcode-scan',
      });
      setMode('barcode');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Scan Failed', err?.message ?? 'Could not read the barcode. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setScanning(false);
    }
  }, []);

  // ── USDA search (with AsyncStorage cache for last 5 queries) ──────────────
  const handleSubmitSearch = useCallback((query: string, _setLocalText: (t: string) => void) => {
    if (!query.trim()) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const trimmedQuery = query.trim();
    setSearchQuery(trimmedQuery);
    setSelectedResult(null);
    setPreview(null);
    setTrayItems([]);
    setShowTray(false);

    // Check AsyncStorage cache first — instant results for repeat searches
    readSearchCache().then((cache) => {
      const hit = cache.find(e => e.query.toLowerCase() === trimmedQuery.toLowerCase());
      if (hit && hit.results.length > 0) {
        // Cache hit: show results immediately, no spinner
        setSearchResults(hit.results);
        return;
      }

      // Cache miss: call server
      setScanning(true);
      setSearchResults([]);
      // Pass the user's active diet protocol so the LLM can prioritise aligned foods
      const activeDietProtocol = dietType && dietType !== 'balanced' ? dietType : undefined;
      searchFoodMutation.mutateAsync({ query: trimmedQuery, dietProtocol: activeDietProtocol })
        .then((res) => {
          const results = res.results as SearchResult[];
          setSearchResults(results);
          if (results.length > 0) {
            // Persist to cache for instant repeat searches
            writeSearchCache(trimmedQuery, results);
            // Refresh recent queries list so the new query appears as a chip immediately
            readSearchCache().then((updated) => setRecentQueries(updated.map(e => e.query)));
          }
        })
        .catch((err: any) => {
          const msg: string = err?.message ?? '';
          if (msg.toLowerCase().includes('no results') || msg.toLowerCase().includes('not found')) {
            setSearchResults([]);
          } else {
            Alert.alert('Search failed', 'Could not connect to the nutrition database. Please check your network and try again.');
          }
        })
        .finally(() => {
          setScanning(false);
        });
    });
  }, [searchFoodMutation, dietType]);

  // Single-item quick-preview (fast path when tray is empty)
  const handleSelectSearchResult = useCallback((item: SearchResult) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedResult(item);
    // Wire reference weight so gram input hint shows on search path
    // serving_g is the gram weight of the reference serving (e.g. 85 for chicken breast)
    setReferenceWeightG(item.serving_g > 0 ? item.serving_g : 100);
    setCustomGrams('');
    setServingMult(1);
    setPreview({
      foodDescription: `${item.name}${item.brand !== 'Generic' ? ` (${item.brand})` : ''} — ${item.serving_size}`,
      calories: item.calories,
      carbsG: item.carbs_g,
      proteinG: item.protein_g,
      fatG: item.fat_g,
      fiberG: item.fiber_g,
      sugarG: null,
      glycemicLoad: item.glycemic_index,
      sodiumMg: item.sodium_mg,
      confidence: 'high',
      reasoning: item.clinical_notes,
      source: 'diet-log',
    });
  }, []);

  // Toggle item in/out of multi-select tray
  const handleToggleTrayItem = useCallback((item: SearchResult) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTrayItems(prev => toggleTrayItem(prev as any, item) as TrayItemLocal[]);
    // Clear single-item preview if user switches to multi-select
    setPreview(null);
    setSelectedResult(null);
  }, []);

  const handleUpdateTrayServing = useCallback((id: string, mult: ServingStep) => {
    setTrayItems(prev => updateTrayServing(prev as any, id, mult as TrayServingStep) as TrayItemLocal[]);
  }, []);

  const handleRemoveTrayItem = useCallback((id: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTrayItems(prev => {
      const next = prev.filter(t => t.result.id !== id);
      if (next.length === 0) setShowTray(false);
      return next;
    });
  }, []);

  const handleOpenTray = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowTray(true);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setPreview(null);
    setTrayItems([]);
    setShowTray(false);
  }, []);

  // ── Log More: reset form and stay in search ────────────────────────────────────────────
  const handleLogMore = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogged(false);
    setLoggedSummary(undefined);
    setPreview(null);
    setSelectedResult(null);
    setSearchQuery('');
    setSearchResults([]);
    setServingMult(1);
    setCustomGrams('');
    setTrayItems([]);
    setShowTray(false);
    setShowHkPrompt(false);
    pendingHkCallback.current = null;
    setMode('search');
  }, []);

  // ── Done: close the sheet ──────────────────────────────────────────────
  const handleDone = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // ── Log single food (camera / single-item search) ──────────────────────────
  const handleLog = useCallback(async () => {
    if (!preview || logged) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLogging(true);
    try {
      const record: SodiumRecord = {
        id: `sn-ai-${Date.now()}`,
        timestamp: new Date().toISOString(),
        sodiumMg: Math.round((preview.sodiumMg ?? 0) * servingMult),
        mealContext: mealCtx,
        foodDescription: preview.foodDescription,
        source: preview.source,
        nutrientSource: 'ai_scan',
        calories: applyServing(preview.calories, servingMult) ?? undefined,
        carbsG:   applyServing(preview.carbsG, servingMult) ?? undefined,
        sugarG:   applyServing(preview.sugarG, servingMult) ?? undefined,
        fatG:     applyServing(preview.fatG, servingMult) ?? undefined,
        proteinG: applyServing(preview.proteinG, servingMult) ?? undefined,
        fiberG:   applyServing(preview.fiberG, servingMult) ?? undefined,
        glycemicLoad: preview.glycemicLoad ?? undefined,
        scanConfidence: preview.confidence,
        // Skip auto-write so we can show the opt-in confirmation below
        skipHealthKit: true,
      };
      await addSodium(record);
      setLogged(true);
      setSessionLogCount(c => c + 1);
      setPrevEstimate(null); // clear fallback chip once successfully logged
      AsyncStorage.removeItem(PREV_ESTIMATE_KEY).catch(() => {});
      onMealLogged?.();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const kcal = applyServing(preview.calories, servingMult);
      const prot = applyServing(preview.proteinG, servingMult);
      const carb = applyServing(preview.carbsG, servingMult);
      const fat  = applyServing(preview.fatG, servingMult);
      const summaryLine = `${kcal ?? '?'} kcal · ${prot?.toFixed(0) ?? '?'}g protein · ${carb?.toFixed(0) ?? '?'}g carbs · ${fat?.toFixed(0) ?? '?'}g fat`;
      setLoggedSummary(summaryLine);

      // On iOS show HealthKit opt-in prompt inline in the success banner
      const doHkWrite = (rec: SodiumRecord) => {
        saveMealToHealthKit(rec)
          .then(() => {
            setHkToast(true);
            setTimeout(() => setHkToast(false), 2500);
          })
          .catch((e) => console.warn('[HealthKit Write] opt-in write error:', e));
      };

      if (Platform.OS === 'ios' && hkPref !== 'save' && hkPref !== 'skip') {
        // First time — show inline prompt inside the success banner
        pendingHkCallback.current = () => doHkWrite(record);
        setShowHkPrompt(true);
      } else if (Platform.OS === 'ios' && hkPref === 'save') {
        doHkWrite(record);
      }
    } catch (err: any) {
      Alert.alert('Log Failed', err?.message ?? 'Could not save the meal. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLogging(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, servingMult, mealCtx, logged, addSodium, onClose, onMealLogged, hkPref, saveHkPref]);

  // ── Log all tray items ─────────────────────────────────────────────────────
  const handleLogAll = useCallback(async () => {
    if (trayItems.length === 0 || logged) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLogging(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        trayItems.map((item, idx) => {
          const r = item.result;
          const m = item.servingMult;
          const record: SodiumRecord = {
            id: `sn-tray-${Date.now()}-${idx}`,
            timestamp: now,
            sodiumMg: Math.round(r.sodium_mg * m),
            mealContext: mealCtx,
            foodDescription: `${r.name}${r.brand !== 'Generic' ? ` (${r.brand})` : ''}`,
            source: 'diet-log',
            nutrientSource: 'ai_scan',
            calories: Math.round(r.calories * m),
            carbsG:   Math.round(r.carbs_g * m * 10) / 10,
            fatG:     Math.round(r.fat_g * m * 10) / 10,
            proteinG: Math.round(r.protein_g * m * 10) / 10,
            fiberG:   Math.round(r.fiber_g * m * 10) / 10,
            glycemicLoad: r.glycemic_index ?? undefined,
          };
          return addSodium(record);
        })
      );
      setLogged(true);
      setSessionLogCount(c => c + trayItems.length);
      onMealLogged?.();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const totalKcal = sumTrayMacro(trayItems, 'calories');
      const totalP    = sumTrayMacro(trayItems, 'protein_g');
      const totalC    = sumTrayMacro(trayItems, 'carbs_g');
      const totalF    = sumTrayMacro(trayItems, 'fat_g');
      const summaryMsg = `${totalKcal} kcal · ${totalP}g protein · ${totalC}g carbs · ${totalF}g fat`;
      setLoggedSummary(summaryMsg);

      // Build combined record for HealthKit (sum of all tray items)
      const combinedRecord: SodiumRecord = {
        id: `sn-tray-hk-${Date.now()}`,
        timestamp: new Date().toISOString(),
        sodiumMg: trayItems.reduce((s, i) => s + Math.round(i.result.sodium_mg * i.servingMult), 0),
        mealContext: mealCtx,
        foodDescription: trayItems.map((i) => i.result.name).join(', '),
        source: 'diet-log',
        nutrientSource: 'ai_scan',
        calories: totalKcal,
        carbsG: totalC,
        fatG: totalF,
        proteinG: totalP,
        fiberG: Math.round(sumTrayMacro(trayItems, 'fiber_g') * 10) / 10,
        skipHealthKit: true,
      };

      const doTrayHkWrite = () => {
        saveMealToHealthKit(combinedRecord)
          .then(() => {
            setHkToast(true);
            setTimeout(() => setHkToast(false), 2500);
          })
          .catch((e) => console.warn('[HealthKit Write] tray write error:', e));
      };

      if (Platform.OS === 'ios' && hkPref !== 'save' && hkPref !== 'skip') {
        // First time — show inline prompt inside the success banner
        pendingHkCallback.current = () => doTrayHkWrite();
        setShowHkPrompt(true);
      } else if (Platform.OS === 'ios' && hkPref === 'save') {
        doTrayHkWrite();
      }
    } catch (err: any) {
      Alert.alert('Log Failed', err?.message ?? 'Could not save the meals. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLogging(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayItems, mealCtx, logged, addSodium, onClose, onMealLogged, hkPref, saveHkPref]);

  // ── Voice search handler (keyboard dictation — no server) ───────────────
  // Tapping the mic button focuses the search TextInput so the user can tap
  // the keyboard's built-in dictation key (iOS mic / Gboard voice input).
  const handleVoiceSearch = useCallback((_onTranscript: (t: string) => void) => {
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);
  // ── Main render ────────────────────────────────────────────────────────────
  if (!visible) return null;

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              transform: [{ translateY }],
              // Expand to full screen during scan flow (also when camera is opening)
              ...(scanning || capturedUri || openingCamera ? { maxHeight: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
            },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            {(preview || showTray || (mode === 'search' && searchResults.length > 0)) ? (
              <Pressable
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  if (showTray) {
                    setShowTray(false);
                  } else if (preview) {
                    setPreview(null);
                    setSelectedResult(null);
                  } else {
                    setSearchResults([]);
                    setTrayItems([]);
                  }
                }}
              >
                <Text style={[styles.backBtnText, { color: colors.muted }]}>{fc.backBtn ?? '‹ Back'}</Text>
              </Pressable>
            ) : (
              <View style={{ width: 48 }} />
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {mode === 'search' ? `🔍 ${fc.foodSearchTitle ?? 'Food Search'}` : `📷 ${fc.scanMealTitle ?? 'Scan Meal'}`}
              </Text>
              {sessionLogCount > 0 && (
                <View style={{ backgroundColor: '#10B981' + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#10B981' + '55' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>
                    {sessionLogCount === 1
                      ? (fc.itemsLogged ?? '1 item logged')
                      : (fc.itemsLoggedPlural ?? '{n} items logged').replace('{n}', String(sessionLogCount))}
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
              onPress={onClose}
            >
              <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          {/* Mode toggle: Camera / Search */}
          <View style={[styles.modeToggle, { borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
            <Pressable
              style={({ pressed }) => [
                styles.modeToggleBtn,
                mode !== 'search' && { borderBottomColor: EMERALD, borderBottomWidth: 2 },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                if (onScanMealPress) {
                  // Parent has provided a gate — fire it instead of switching mode
                  onScanMealPress();
                } else {
                  setMode('home'); setPreview(null); setSearchResults([]); setTrayItems([]); setShowTray(false);
                }
              }}
            >
              <Text style={[styles.modeToggleBtnText, { color: mode !== 'search' ? EMERALD : colors.muted }]}>
                📷 {fc.scanMealTitle ?? 'Scan Meal'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modeToggleBtn,
                mode === 'search' && { borderBottomColor: VIOLET, borderBottomWidth: 2 },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => { setMode('search'); setPreview(null); }}
            >
              <Text style={[styles.modeToggleBtnText, { color: mode === 'search' ? VIOLET : colors.muted }]}>
                🔍 {fc.foodSearchTitle ?? 'Search'}
              </Text>
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {mode === 'search' ? (
              <SearchScreen
                initialQuery={searchQuery}
                scanning={scanning}
                recentQueries={recentQueries}
                activeDietProtocol={dietType && dietType !== 'balanced' ? dietType : undefined}
                searchResults={searchResults}
                selectedResult={selectedResult}
                trayItems={trayItems}
                preview={preview}
                servingMult={servingMult}
                setServingMult={setServingMult}
                customGrams={customGrams}
                setCustomGrams={setCustomGrams}
                referenceWeightG={referenceWeightG}
                mealCtx={mealCtx}
                setMealCtx={setMealCtx}
                logging={logging}
                logged={logged}
                showTray={showTray}
                onLog={handleLog}
                onLogAll={handleLogAll}
                onLogMore={handleLogMore}
                onDone={handleDone}
                loggedSummary={loggedSummary}
                onSearchByName={(name) => {
                  setPreview(null);
                  setCustomGrams('');
                  handleSubmitSearch(name, () => {});
                }}
                onHealthKitSave={() => {
                  saveHkPref('save');
                  pendingHkCallback.current?.();
                  pendingHkCallback.current = null;
                  setShowHkPrompt(false);
                }}
                onHealthKitSkip={() => {
                  saveHkPref('skip');
                  pendingHkCallback.current = null;
                  setShowHkPrompt(false);
                }}
                showHealthKitPrompt={showHkPrompt}
                onSubmitSearch={handleSubmitSearch}
                onSelectResult={handleSelectSearchResult}
                onToggleTrayItem={handleToggleTrayItem}
                onUpdateTrayServing={handleUpdateTrayServing}
                onRemoveTrayItem={handleRemoveTrayItem}
                onOpenTray={handleOpenTray}
                onClearSearch={handleClearSearch}
                onVoiceSearch={handleVoiceSearch}
                micPulse={micPulse}
                isDark={isDark}
                foregroundColor={colors.foreground}
                mutedColor={colors.muted}
                fc={fc}
              />
            ) : (
              <>
                {!preview && !capturedUri ? (
                  <>
                    <HomeScreen
                      scanning={scanning}
                      openingCamera={openingCamera}
                      mode={mode}
                      onPlateScan={handlePlateScan}
                      onBarcodeScan={handleBarcodeScan}
                      recentMeals={recentMeals}
                      swipedId={swipedId}
                      setSwipedId={setSwipedId}
                      deleteSodium={deleteSodium}
                      isDark={isDark}
                      foregroundColor={colors.foreground}
                      mutedColor={colors.muted}
                      prevEstimate={prevEstimate}
                      fc={fc}
                      scanBtnSpinAnim={scanBtnSpinAnim}
                      onReLog={async (meal) => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        const record: SodiumRecord = {
                          id: `sn-relog-${Date.now()}`,
                          timestamp: new Date().toISOString(),
                          sodiumMg: meal.sodiumMg,
                          mealContext: meal.mealContext ?? 'other',
                          foodDescription: meal.foodDescription,
                          source: 'ai-photo',
                          nutrientSource: 'ai_scan',
                          calories: meal.calories,
                          carbsG: meal.carbsG,
                          fatG: meal.fatG,
                          proteinG: meal.proteinG,
                          skipHealthKit: true,
                        };
                        await addSodium(record);
                        onMealLogged?.();
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        setHkToast(true);
                        setTimeout(() => setHkToast(false), 2000);
                      }}
                    />
                    {/* Photo + scanner overlay — shown while scanning or after analysis */}
                    {capturedUri ? (
                      <View style={styles.scanPhotoContainer}>
                        <Image
                          source={{ uri: capturedUri }}
                          style={styles.scanPhoto}
                          resizeMode="cover"
                        />
                        {/* Dark overlay */}
                        <View style={styles.scanPhotoOverlay} />
                        {/* Corner brackets */}
                        <View style={[styles.scanCorner, styles.scanCornerTL, { borderColor: EMERALD }]} />
                        <View style={[styles.scanCorner, styles.scanCornerTR, { borderColor: EMERALD }]} />
                        <View style={[styles.scanCorner, styles.scanCornerBL, { borderColor: EMERALD }]} />
                        <View style={[styles.scanCorner, styles.scanCornerBR, { borderColor: EMERALD }]} />
                        {/* Spinning ring — only while scanning */}
                        {scanning && (
                          <Animated.View
                            style={[
                              styles.scanRing,
                              {
                                borderColor: EMERALD,
                                transform: [{
                                  rotate: scanSpinAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0deg', '360deg'],
                                  }),
                                }],
                              },
                            ]}
                          />
                        )}
                        {/* Inner static ring */}
                        <View style={[styles.scanRingInner, { borderColor: scanning ? EMERALD + '44' : EMERALD + '22' }]} />
                        {/* Status badge — only while scanning */}
                        {scanning && (
                          <View style={styles.scanStatusBadge}>
                            <ActivityIndicator color={EMERALD} size="small" style={{ marginRight: 6 }} />
                            <Text style={styles.scanStatusText}>
                              {fc.identifyingFood ?? 'Analysing meal…'}
                            </Text>
                          </View>
                        )}
                        {/* Done badge — when analysis complete */}
                        {!scanning && preview && (
                          <View style={[styles.scanStatusBadge, { backgroundColor: EMERALD + 'DD' }]}>
                            <Text style={[styles.scanStatusText, { color: '#FFFFFF' }]}>✓ {fc.analysisComplete ?? 'Analysis complete'}</Text>
                          </View>
                        )}
                      </View>
                    ) : scanning ? (
                      <View style={styles.scanningOverlay}>
                        <ActivityIndicator color={EMERALD} size="large" />
                        <Text style={[styles.scanningText, { color: colors.muted }]}>
                          {fc.identifyingFood ?? 'Identifying food…'}
                        </Text>
                      </View>
                    ) : null}

                    {/* Log Meal + button — shown while scanning (disabled) */}
                    {scanning && (
                      <View style={[styles.logMealPendingBtn, { backgroundColor: EMERALD + '22', borderColor: EMERALD + '44' }]}>
                        <ActivityIndicator color={EMERALD} size="small" style={{ marginRight: 8 }} />
                        <Text style={[styles.logMealPendingText, { color: EMERALD }]}>
                          {fc.logMealPlus ?? 'Log Meal +'}
                        </Text>
                      </View>
                    )}

                    {openingCamera && (
                      <View style={styles.scanningOverlay}>
                        <ActivityIndicator color={EMERALD} size="large" />
                        <Text style={[styles.scanningText, { color: colors.muted }]}>
                          {fc.openingCamera ?? 'Opening camera…'}
                        </Text>
                      </View>
                    )}
                  </>
                ) : null}

                {/* MacroPreviewPanel — shown inline below the photo when analysis is done */}
                {preview && (
                  <MacroPreviewPanel
                    preview={preview}
                    servingMult={servingMult}
                    setServingMult={setServingMult}
                    customGrams={customGrams}
                    setCustomGrams={setCustomGrams}
                    referenceWeightG={referenceWeightG}
                    mealCtx={mealCtx}
                    setMealCtx={setMealCtx}
                    logging={logging}
                    logged={logged}
                    onLog={handleLog}
                    onLogMore={handleLogMore}
                    onDone={handleDone}
                    loggedSummary={loggedSummary}
                    onHealthKitSave={() => {
                      saveHkPref('save');
                      pendingHkCallback.current?.();
                      pendingHkCallback.current = null;
                      setShowHkPrompt(false);
                    }}
                    onHealthKitSkip={() => {
                      saveHkPref('skip');
                      pendingHkCallback.current = null;
                      setShowHkPrompt(false);
                    }}
                    showHealthKitPrompt={showHkPrompt}
                    onSearchByName={(name) => {
                      setMode('search');
                      setPreview(null);
                      setCapturedUri(null);
                      setCustomGrams('');
                      handleSubmitSearch(name, () => {});
                    }}
                    onScanAgain={() => {
                      if (preview?.calories != null) {
                        setPrevEstimate({ kcal: preview.calories, name: preview.foodDescription });
                      }
                      setPreview(null);
                      setCapturedUri(null);
                      setKeepEstimateTapped(false);
                      setMode('home');
                      setOpeningCamera(true);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const isBarcode = preview?.source === 'barcode-scan';
                      setTimeout(() => {
                        setOpeningCamera(false);
                        if (isBarcode) handleBarcodeScan();
                        else handlePlateScan();
                      }, 150);
                    }}
                    onKeepEstimate={() => setKeepEstimateTapped(true)}
                    onScanAnother={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPreview(null);
                      setCapturedUri(null);
                      setLogged(false);
                      setLoggedSummary(undefined);
                      setServingMult(1);
                      setCustomGrams('');
                      setMode('home');
                      setOpeningCamera(true);
                      setTimeout(() => {
                        setOpeningCamera(false);
                        handlePlateScan();
                      }, 150);
                    }}
                    isDark={isDark}
                    foregroundColor={colors.foreground}
                    mutedColor={colors.muted}
                    fc={fc}
                  />
                )}
              </>
            )}

            {/* Bottom spacer */}
            <View style={{ height: 32 }} />
          </ScrollView>

          {/* HealthKit save toast */}
          {hkToast && (
            <View style={styles.hkToast} pointerEvents="none">
              <Text style={styles.hkToastText}>♥️ Saved to Apple Health ✓</Text>
            </View>
          )}
          {/* Low-confidence warning toast */}
          {lowConfToast && (
            <Pressable
              style={styles.lowConfToast}
              onPress={() => setLowConfToast(false)}
            >
              <Text style={styles.lowConfToastIcon}>⚠️</Text>
              <Text style={styles.lowConfToastText}>
                {fc.lowConfidenceWarning ?? 'Low confidence estimate — consider searching by name for accuracy'}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Native barcode scanner — full-screen modal, reads barcode on-device then calls Open Food Facts */}
    <BarcodeScannerModal
      visible={showBarcodeScanner}
      onBarcode={handleBarcodeDetected}
      onClose={() => setShowBarcodeScanner(false)}
    />


    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  backBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 48,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  modeToggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modeToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  // Scroll content
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    padding: 16,
    gap: 14,
  },
  // Home grid
  homeGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  homeBtn: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    minHeight: 140,
    justifyContent: 'center',
  },
  homeBtnIcon: {
    fontSize: 36,
  },
  homeBtnTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  homeBtnSub: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  // Scanning overlay
  scanningOverlay: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  scanningText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Photo scanner overlay
  scanPhotoContainer: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  scanPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  scanPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  // Corner brackets
  scanCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 3,
  },
  scanCornerTL: {
    top: 16,
    left: 16,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  scanCornerTR: {
    top: 16,
    right: 16,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  scanCornerBL: {
    bottom: 16,
    left: 16,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
  },
  scanCornerBR: {
    bottom: 16,
    right: 16,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 4,
  },
  // Spinning ring
  scanRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  scanRingInner: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
  },
  // Status badge
  scanStatusBadge: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  scanStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Scan-complete popup
  scanCompleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanCompleteSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 24,
  },
  scanCompleteIconRow: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  scanCompleteIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCompleteFoodName: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 10,
  },
  scanCompleteCalChip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 20,
    gap: 2,
  },
  scanCompleteCalText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scanCompleteLogBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  scanCompleteLogBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  scanCompleteDetailsBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  scanCompleteDetailsBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // Log Meal pending button (shown while scanning)
  logMealPendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 12,
  },
  logMealPendingText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  // Macro preview panel
  previewPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  previewHeader: {
    gap: 6,
  },
  previewFoodName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  confidenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  confidenceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Macro tiles
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  macroTile: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  macroTileValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  macroTileUnit: {
    fontSize: 10,
    fontWeight: '600',
  },
  macroTileLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Glycemic load
  glRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  glBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  glValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Smart reasoning
  reasoning: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  // Macro range display
  rangeBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 6,
    marginBottom: 8,
  },
  rangeTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rangeItem: {
    fontSize: 12,
    fontWeight: '700',
  },
  rangeDisclaimer: {
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
  },
  // Serving stepper
  servingRow: {
    gap: 8,
  },
  servingLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  servingBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  servingBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  servingBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Gram-based custom serving input
  gramInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gramInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 80,
  },
  gramInput: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'right',
    padding: 0,
  },
  gramUnit: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  gramHint: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  // USDA no-match quick action
  noMacrosBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginBottom: 4,
  },
  noMacrosText: {
    fontSize: 12,
    lineHeight: 17,
  },
  searchUsdaBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  searchUsdaBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Meal context
  mealCtxRow: {
    gap: 8,
  },
  mealCtxScroll: {
    gap: 8,
  },
  mealCtxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  mealCtxEmoji: {
    fontSize: 13,
  },
  mealCtxLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Log button
  logBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  successBanner: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  successBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  successBannerSummary: {
    fontSize: 13,
    lineHeight: 18,
  },
  successBannerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  successActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successActionBtnOutline: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  successActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Apple Health inline prompt (inside success banner)
  hkPromptRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  hkPromptLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  hkPromptBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  hkPromptBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hkPromptBtnOutline: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  hkPromptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  // Search
  searchPane: {
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
    height: 44,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 44,
  },
  clearBtn: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  voiceHint: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  confidenceBadgeRow: {
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  searchSubmitBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  resultsList: {
    gap: 8,
  },
  // Shimmer skeleton styles
  shimmerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  shimmerLine: {
    height: 12,
    borderRadius: 6,
  },
  shimmerPill: {
    width: 48,
    height: 24,
    borderRadius: 12,
  },
  resultsHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  // Multi-select checkbox
  resultCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultCheckmark: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 16,
  },
  resultItemLeft: {
    flex: 1,
    gap: 2,
  },
  resultItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultItemSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  // Diet-aligned badge on result cards
  dietBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  dietBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Recent search chips
  recentChipsContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  recentChipsLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2,
  },
  recentChipsScroll: {
    gap: 8,
    paddingRight: 4,
  },
  recentChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  recentChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  resultItemRight: {
    alignItems: 'flex-end',
  },
  resultItemKcal: {
    fontSize: 16,
    fontWeight: '800',
  },
  resultItemKcalUnit: {
    fontSize: 9,
    fontWeight: '600',
  },
  // Floating tray bar
  trayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 4,
    gap: 10,
  },
  trayBarBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBarBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  trayBarText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  trayBarArrow: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Tray review panel
  trayPanel: {
    gap: 12,
  },
  trayTotalsBar: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  trayTotalsTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  trayTotalsMacros: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  trayTotalsMacroText: {
    fontSize: 14,
    fontWeight: '800',
  },
  trayTotalsSep: {
    fontSize: 12,
  },
  trayItemCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  trayItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  trayItemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  trayRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF444422',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trayRemoveBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: ROSE,
  },
  trayItemServing: {
    fontSize: 11,
    lineHeight: 15,
  },
  trayItemMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trayItemMacroChip: {
    fontSize: 12,
    fontWeight: '700',
  },
  trayServingRow: {
    gap: 6,
  },
  // Recent Meals
  recentSection: {
    gap: 8,
    marginTop: 4,
  },
  recentHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  recentItemWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  recentItemEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  recentItemContent: {
    flex: 1,
    gap: 2,
  },
  recentItemName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  recentItemMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  recentItemTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  recentDeleteBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 64,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentDeleteIcon: {
    fontSize: 20,
  },
  // HealthKit save toast
  hkToast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  hkToastText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Low-confidence warning toast
  lowConfToast: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 16,
    backgroundColor: '#92400E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  lowConfToastIcon: {
    fontSize: 16,
    lineHeight: 22,
  },
  lowConfToastText: {
    flex: 1,
    color: '#FEF3C7',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  // Recent Scans section
  recentScansSection: {
    gap: 8,
    marginTop: 8,
  },
  recentScansHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  recentScanCards: {
    flexDirection: 'row',
    gap: 8,
  },
  recentScanCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 4,
    alignItems: 'flex-start',
  },
  recentScanEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  recentScanName: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  recentScanKcal: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  reLogBtn: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  reLogBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Previous estimate chip
  prevEstimateChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 4,
  },
  prevEstimateText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  // Confidence dot + kcal row
  recentScanKcalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // Scan Again confirmation row
  scanAgainConfirmRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
    gap: 10,
  },
  scanAgainConfirmLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  scanAgainConfirmBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  scanAgainConfirmBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  scanAgainConfirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  // Scan Again button
  scanAgainBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  scanAgainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanAgainIcon: {
    fontSize: 22,
    lineHeight: 28,
  },
  scanAgainTextWrap: {
    flex: 1,
    gap: 2,
  },
  scanAgainTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  scanAgainSub: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
});
