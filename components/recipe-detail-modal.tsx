/**
 * RecipeDetailModal
 *
 * Full-screen modal for a single bio-aligned recipe.
 * Features:
 *  - Hero banner (emoji + gradient + protocol badge)
 *  - Macro ring chart (SVG, four arcs: Protein / Fiber / Carbs / Fat)
 *  - Step-by-step cooking instructions
 *  - Countdown timer (per-step or total cook time)
 *  - Share shopping list button
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Platform,
  Share,
  Animated,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import type { SodiumRecord, SodiumMealContext } from '@/lib/health/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMERALD = '#10B981';
const AMBER   = '#F59E0B';
const BLUE    = '#3B82F6';
const VIOLET  = '#8B5CF6';
const TEAL    = '#14B8A6';
const ROSE    = '#F43F5E';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecipeMacros {
  proteinG: number;
  fiberG: number;
  carbsG: number;
  fatG: number;
  kcal: number;
}

export interface RecipeDetail {
  id: string;
  emoji: string;
  gradientStart: string;
  gradientEnd: string;
  title: string;
  subtitle: string;
  protocol: string;
  macros: RecipeMacros;
  evidenceLink: string;
  evidenceColor: string;
  prepTime: string;
  difficulty: 'Easy' | 'Medium' | 'Advanced';
  ingredients: string[];
  citation: string;
  steps: string[];
  totalMinutes: number;
}

// ─── Macro Ring Chart ─────────────────────────────────────────────────────────

const RING_SIZE  = 140;
const RING_CX    = RING_SIZE / 2;
const RING_CY    = RING_SIZE / 2;
const STROKE     = 10;

interface RingSegment {
  color: string;
  label: string;
  value: number;
  unit: string;
}

function MacroRingChart({ macros }: { macros: RecipeMacros }) {
  // Calories from each macro (for proportional arc sizing)
  const proteinKcal = macros.proteinG * 4;
  const carbsKcal   = macros.carbsG   * 4;
  const fatKcal     = macros.fatG     * 9;
  const fiberKcal   = macros.fiberG   * 2; // ~2 kcal/g soluble fiber
  const total       = proteinKcal + carbsKcal + fatKcal + fiberKcal;

  const segments: RingSegment[] = [
    { color: EMERALD, label: 'Protein', value: macros.proteinG, unit: 'g' },
    { color: BLUE,    label: 'Carbs',   value: macros.carbsG,   unit: 'g' },
    { color: AMBER,   label: 'Fiber',   value: macros.fiberG,   unit: 'g' },
    { color: VIOLET,  label: 'Fat',     value: macros.fatG,     unit: 'g' },
  ];

  const kcalValues = [proteinKcal, carbsKcal, fiberKcal, fatKcal];

  // Build stroke-dasharray arcs on a single circle
  const radii = [52, 40, 28, 16];
  const GAP = 4; // degrees gap between segments

  return (
    <View style={ringStyles.wrapper}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        {segments.map((seg, i) => {
          const r = radii[i];
          const circumference = 2 * Math.PI * r;
          const fraction = total > 0 ? kcalValues[i] / total : 0;
          const dashLen = Math.max(0, circumference * fraction - GAP);
          const gapLen  = circumference - dashLen;
          return (
            <G key={seg.label} rotation="-90" origin={`${RING_CX},${RING_CY}`}>
              {/* Track */}
              <Circle
                cx={RING_CX} cy={RING_CY} r={r}
                stroke={seg.color + '22'}
                strokeWidth={STROKE - 2}
                fill="none"
              />
              {/* Arc */}
              <Circle
                cx={RING_CX} cy={RING_CY} r={r}
                stroke={seg.color}
                strokeWidth={STROKE - 2}
                fill="none"
                strokeDasharray={`${dashLen} ${gapLen}`}
                strokeLinecap="round"
              />
            </G>
          );
        })}
        {/* Centre kcal label */}
      </Svg>
      {/* Centre text overlay */}
      <View style={ringStyles.centre}>
        <Text style={ringStyles.centreKcal}>{macros.kcal}</Text>
        <Text style={ringStyles.centreLabel}>kcal</Text>
      </View>
      {/* Legend */}
      <View style={ringStyles.legend}>
        {segments.map(seg => (
          <View key={seg.label} style={ringStyles.legendRow}>
            <View style={[ringStyles.dot, { backgroundColor: seg.color }]} />
            <Text style={ringStyles.legendLabel}>{seg.label}</Text>
            <Text style={[ringStyles.legendValue, { color: seg.color }]}>
              {seg.value}{seg.unit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 4,
  },
  centre: {
    position: 'absolute',
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreKcal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -0.5,
  },
  centreLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  legendValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});

// ─── Countdown Timer ──────────────────────────────────────────────────────────

function CountdownTimer({ totalMinutes }: { totalMinutes: number }) {
  const [secondsLeft, setSecondsLeft] = useState(totalMinutes * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const reset = useCallback(() => {
    setRunning(false);
    setSecondsLeft(totalMinutes * 60);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [totalMinutes]);

  const toggle = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunning(r => !r);
  }, []);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = 1 - secondsLeft / (totalMinutes * 60);
  const done = secondsLeft === 0;

  return (
    <View style={timerStyles.wrapper}>
      <View style={timerStyles.display}>
        <Text style={[timerStyles.time, done && { color: EMERALD }]}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </Text>
        <Text style={timerStyles.label}>{done ? '✅ Done!' : `of ${totalMinutes} min`}</Text>
      </View>
      {/* Progress bar */}
      <View style={timerStyles.track}>
        <View style={[timerStyles.fill, { width: `${progress * 100}%` as any, backgroundColor: done ? EMERALD : TEAL }]} />
      </View>
      <View style={timerStyles.buttons}>
        <Pressable
          style={({ pressed }) => [timerStyles.btn, { backgroundColor: running ? ROSE + 'CC' : TEAL + 'CC', opacity: pressed ? 0.8 : 1 }]}
          onPress={toggle}
        >
          <Text style={timerStyles.btnText}>{running ? '⏸ Pause' : done ? '✅ Done' : '▶ Start'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [timerStyles.resetBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={reset}
        >
          <Text style={timerStyles.resetText}>↺ Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  display: {
    alignItems: 'center',
    gap: 2,
  },
  time: {
    fontSize: 40,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  resetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  resetText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface RecipeDetailModalProps {
  recipe: RecipeDetail | null;
  visible: boolean;
  onClose: () => void;
  /** Optional callback fired after a meal is successfully logged */
  onMealLogged?: (record: SodiumRecord) => void;
}

export function RecipeDetailModal({ recipe, visible, onClose, onMealLogged }: RecipeDetailModalProps) {
  const isDark = useColorScheme() === 'dark';
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Shopping list checked state
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const toggleCheck = useCallback((idx: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  // ── Log Meal state ────────────────────────────────────────────────────────
  const { addSodium, deleteSodium } = useHealth();
  const [loggedMealId, setLoggedMealId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  // Undo toast state
  const UNDO_SECONDS = 5;
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [undoConfirmed, setUndoConfirmed] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoProgressAnim = useRef(new Animated.Value(1)).current;

  // Reset all log state when a new recipe is opened
  useEffect(() => {
    setLoggedMealId(null);
    setUndoSecondsLeft(0);
    setUndoConfirmed(false);
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
  }, [recipe?.id]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (undoTimerRef.current) clearInterval(undoTimerRef.current); };
  }, []);

  const startUndoCountdown = useCallback((_recordId: string) => {
    setUndoSecondsLeft(UNDO_SECONDS);
    setUndoConfirmed(false);
    // Animate progress bar from full → empty over 5 seconds
    undoProgressAnim.setValue(1);
    Animated.timing(undoProgressAnim, {
      toValue: 0,
      duration: UNDO_SECONDS * 1000,
      useNativeDriver: false,
    }).start();
    // Tick countdown
    undoTimerRef.current = setInterval(() => {
      setUndoSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(undoTimerRef.current!);
          undoTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [undoProgressAnim]);

  const handleUndo = useCallback(async () => {
    if (!loggedMealId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Stop countdown
    if (undoTimerRef.current) { clearInterval(undoTimerRef.current); undoTimerRef.current = null; }
    undoProgressAnim.stopAnimation();
    try {
      await deleteSodium(loggedMealId);
    } catch (_unused) {}
    setLoggedMealId(null);
    setUndoSecondsLeft(0);
    setUndoConfirmed(false);
  }, [loggedMealId, deleteSodium, undoProgressAnim]);

  const handleLogMeal = useCallback(async () => {
    if (!recipe || logging) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLogging(true);
    try {
      // Determine meal context from time of day
      const hour = new Date().getHours();
      const mealContext: SodiumMealContext =
        hour < 10 ? 'breakfast' :
        hour < 14 ? 'lunch' :
        hour < 18 ? 'dinner' :
        'snack';

      const record: SodiumRecord = {
        id: `recipe_${recipe.id}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        sodiumMg: 0,           // DASH recipes are low-sodium by design; no specific value
        mealContext,
        foodDescription: recipe.title,
        note: `Vitals-aligned · ${recipe.protocol} · ${recipe.evidenceLink}`,
        source: 'recipe',
        nutrientSource: 'clinical_estimate',
        calories: recipe.macros.kcal,
        carbsG: recipe.macros.carbsG,
        fatG: recipe.macros.fatG,
        proteinG: recipe.macros.proteinG,
        fiberG: recipe.macros.fiberG,
      };

      await addSodium(record);
      setLoggedMealId(record.id);
      onMealLogged?.(record);
      startUndoCountdown(record.id);
    } catch (_err) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLogging(false);
    }
  }, [recipe, logging, addSodium, onMealLogged, startUndoCountdown]);

  const handleShare = useCallback(async () => {
    if (!recipe) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const list = recipe.ingredients.map(i => `• ${i}`).join('\n');
    const steps = recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const msg = `🌿 ${recipe.title}\n\n🛒 Ingredients:\n${list}\n\n👨‍🍳 Steps:\n${steps}\n\n📊 ${recipe.macros.proteinG}g protein · ${recipe.macros.fiberG}g fiber · ${recipe.macros.kcal} kcal\n\n📚 ${recipe.citation}`;
    try { await Share.share({ message: msg, title: recipe.title }); } catch (_unused) {}
  }, [recipe]);

  if (!recipe) return null;

  const bgColor  = isDark ? '#0F172A' : '#F8FAFC';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const mutedColor = isDark ? '#64748B' : '#94A3B8';
  const surfaceColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const borderColor  = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Scrim */}
      <Pressable
        style={modalStyles.scrim}
        onPress={onClose}
      />
      <Animated.View style={[modalStyles.container, { backgroundColor: bgColor, transform: [{ translateY }] }]}>
        {/* Hero */}
        <View style={[modalStyles.hero, { backgroundColor: recipe.gradientStart }]}>
          <View style={[modalStyles.heroOverlay, { backgroundColor: recipe.gradientEnd + 'BB' }]} />
          <Text style={modalStyles.heroEmoji}>{recipe.emoji}</Text>
          {/* Protocol badge */}
          <View style={[modalStyles.protocolBadge, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
            <Text style={modalStyles.protocolText}>{recipe.protocol}</Text>
          </View>
          {/* Close button */}
          <Pressable
            style={({ pressed }) => [modalStyles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={onClose}
          >
            <Text style={modalStyles.closeBtnText}>✕</Text>
          </Pressable>
          {/* Meta row */}
          <View style={modalStyles.metaRow}>
            <View style={[modalStyles.metaBadge, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
              <Text style={modalStyles.metaText}>⏱ {recipe.prepTime}</Text>
            </View>
            <View style={[modalStyles.metaBadge, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
              <Text style={modalStyles.metaText}>
                {recipe.difficulty === 'Easy' ? '🟢' : recipe.difficulty === 'Medium' ? '🟡' : '🔴'} {recipe.difficulty}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[modalStyles.body, { backgroundColor: bgColor }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={[modalStyles.title, { color: textColor }]}>{recipe.title}</Text>
          <Text style={[modalStyles.subtitle, { color: mutedColor }]}>{recipe.subtitle}</Text>

          {/* Evidence badge */}
          <View style={[modalStyles.evidenceBadge, {
            backgroundColor: recipe.evidenceColor + '18',
            borderColor: recipe.evidenceColor + '44',
          }]}>
            <Text style={modalStyles.evidenceIcon}>🔗</Text>
            <Text style={[modalStyles.evidenceText, { color: recipe.evidenceColor }]}>
              {recipe.evidenceLink}
            </Text>
            <Text style={[modalStyles.citationInline, { color: mutedColor }]}>
              · {recipe.citation}
            </Text>
          </View>

          {/* Macro ring chart */}
          <View style={[modalStyles.section, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor }]}>
            <Text style={[modalStyles.sectionTitle, { color: textColor }]}>Nutritional Breakdown</Text>
            <MacroRingChart macros={recipe.macros} />
          </View>

          {/* Timer */}
          <View style={[modalStyles.section, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor }]}>
            <Text style={[modalStyles.sectionTitle, { color: textColor }]}>Cook Timer</Text>
            <CountdownTimer totalMinutes={recipe.totalMinutes} />
          </View>

          {/* Shopping List (interactive checklist) */}
          <View style={[modalStyles.section, { backgroundColor: surfaceColor, borderColor }]}>
            <View style={modalStyles.sectionHeaderRow}>
              <Text style={[modalStyles.sectionTitle, { color: textColor }]}>🛒 Shopping List</Text>
              <Text style={[modalStyles.checkCount, { color: EMERALD }]}>
                {checkedItems.size}/{recipe.ingredients.length}
              </Text>
            </View>
            {recipe.ingredients.map((ing, i) => {
              const checked = checkedItems.has(i);
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [modalStyles.ingredientRow, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => toggleCheck(i)}
                >
                  <View style={[
                    modalStyles.checkbox,
                    { borderColor: checked ? EMERALD : (isDark ? '#475569' : '#CBD5E1'),
                      backgroundColor: checked ? EMERALD : 'transparent' },
                  ]}>
                    {checked && <Text style={modalStyles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[
                    modalStyles.ingredientText,
                    { color: checked ? (isDark ? '#475569' : '#94A3B8') : (isDark ? '#CBD5E1' : '#334155'),
                      textDecorationLine: checked ? 'line-through' : 'none' },
                  ]}>{ing}</Text>
                </Pressable>
              );
            })}
            {/* Share button inside shopping list */}
            <Pressable
              style={({ pressed }) => [modalStyles.shareInlineBtn, {
                backgroundColor: EMERALD + (pressed ? 'CC' : 'FF'),
                marginTop: 12,
              }]}
              onPress={handleShare}
            >
              <Text style={modalStyles.shareBtnText}>📤 Share Shopping List</Text>
            </Pressable>
          </View>

          {/* Steps */}
          <View style={[modalStyles.section, { backgroundColor: surfaceColor, borderColor }]}>
            <Text style={[modalStyles.sectionTitle, { color: textColor }]}>Step-by-Step Instructions</Text>
            {recipe.steps.map((step, i) => (
              <View key={i} style={modalStyles.stepRow}>
                <View style={[modalStyles.stepNum, { backgroundColor: TEAL + '22', borderColor: TEAL + '44' }]}>
                  <Text style={[modalStyles.stepNumText, { color: TEAL }]}>{i + 1}</Text>
                </View>
                <Text style={[modalStyles.stepText, { color: isDark ? '#CBD5E1' : '#334155' }]}>{step}</Text>
              </View>
            ))}
          </View>

          {/* ── Log Meal CTA ─────────────────────────────────────────────── */}
          <View style={modalStyles.logMealSection}>
            {loggedMealId ? (
              /* ── Undo toast (shown while countdown > 0) or confirmed banner ── */
              undoSecondsLeft > 0 ? (
                <View style={[modalStyles.undoToast, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  {/* Top row: icon + message + undo button */}
                  <View style={modalStyles.undoRow}>
                    <Text style={modalStyles.undoIcon}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[modalStyles.undoTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        Logged to Food Diary
                      </Text>
                      <Text style={[modalStyles.undoSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {recipe.macros.kcal} kcal · {recipe.macros.proteinG}g protein
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        modalStyles.undoBtn,
                        { backgroundColor: AMBER + (pressed ? 'EE' : 'FF') },
                      ]}
                      onPress={handleUndo}
                    >
                      <Text style={modalStyles.undoBtnText}>Undo {undoSecondsLeft}s</Text>
                    </Pressable>
                  </View>
                  {/* Countdown progress bar */}
                  <View style={[modalStyles.undoTrack, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                    <Animated.View
                      style={[
                        modalStyles.undoProgress,
                        {
                          backgroundColor: AMBER,
                          width: undoProgressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                /* Countdown expired — permanent confirmed banner */
                <View style={[modalStyles.loggedBanner, { backgroundColor: EMERALD + '18', borderColor: EMERALD + '44' }]}>
                  <Text style={modalStyles.loggedIcon}>✅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[modalStyles.loggedTitle, { color: EMERALD }]}>Logged to Food Diary</Text>
                    <Text style={[modalStyles.loggedSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      {recipe.macros.kcal} kcal · {recipe.macros.proteinG}g protein · {recipe.macros.fiberG}g fiber
                    </Text>
                  </View>
                </View>
              )
            ) : (
              /* Log button */
              <Pressable
                style={({ pressed }) => [
                  modalStyles.logMealBtn,
                  { backgroundColor: TEAL + (pressed ? 'CC' : 'FF'), opacity: logging ? 0.6 : 1 },
                ]}
                onPress={handleLogMeal}
                disabled={logging}
              >
                <Text style={modalStyles.logMealBtnText}>
                  {logging ? '⏳ Logging…' : '📝 Log This Meal'}
                </Text>
              </Pressable>
            )}
            {!loggedMealId && (
              <Text style={[modalStyles.logMealHint, { color: isDark ? '#475569' : '#94A3B8' }]}>
                Adds {recipe.macros.kcal} kcal to today’s Nutrition Alignment · {recipe.protocol}
              </Text>
            )}
          </View>

        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  hero: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroEmoji: {
    fontSize: 80,
    zIndex: 1,
  },
  protocolBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
  },
  protocolText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  metaRow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 6,
  },
  metaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  body: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: -8,
  },
  evidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    flexWrap: 'wrap',
  },
  evidenceIcon: { fontSize: 12 },
  evidenceText: { fontSize: 12, fontWeight: '700' },
  citationInline: { fontSize: 10, fontWeight: '400', flex: 1 },
  section: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    textTransform: 'uppercase' as const,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ingredientText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: '800',
  },
  stepText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 22,
    flex: 1,
  },
  shareBtn: {
    backgroundColor: EMERALD,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  shareInlineBtn: {
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  checkCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Log Meal CTA
  logMealSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 10,
  },
  logMealBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logMealBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  logMealHint: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  loggedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  loggedIcon: {
    fontSize: 22,
  },
  loggedTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  loggedSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // Undo toast
  undoToast: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  undoIcon: {
    fontSize: 20,
  },
  undoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  undoSub: {
    fontSize: 11,
    marginTop: 1,
  },
  undoBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  undoBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  undoTrack: {
    height: 3,
    width: '100%',
  },
  undoProgress: {
    height: 3,
    borderRadius: 2,
  },
});
