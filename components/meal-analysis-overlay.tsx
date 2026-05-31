/**
 * MealAnalysisOverlay — Premium live analysis experience for food scan.
 *
 * Features:
 *  - Food image always visible (never blank)
 *  - Animated spinner with pulse
 *  - Rotating status text (8 phases, 2s each)
 *  - Live recognition card with step-by-step progress animation
 *  - Floating food detection labels (animate in as foods are detected)
 *  - Progress bar 0–100%
 *  - Timeout protection: 10s warning → 20s auto-retry → 30s recovery options
 *  - Glassmorphism design matching VitalSync premium language
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const EMERALD = '#10B981';
const VIOLET  = '#8B5CF6';
const BLUE    = '#3B82F6';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnalysisStep =
  | 'image_received'
  | 'ai_started'
  | 'detecting_foods'
  | 'estimating_portions'
  | 'calculating_nutrition';

export type AnalysisStepState = 'pending' | 'active' | 'done';

export interface DetectedFoodLabel {
  name: string;
  category: string;
  /** Approximate position on the image (0–1 range) */
  x?: number;
  y?: number;
}

export interface MealAnalysisOverlayProps {
  /** URI of the captured food image — must be set before showing overlay */
  imageUri: string;
  /** Current step states — drives the recognition card */
  stepStates: Record<AnalysisStep, AnalysisStepState>;
  /** Detected food labels to float over the image */
  detectedFoods?: DetectedFoodLabel[];
  /** 0–100 progress value */
  progress: number;
  /** Whether analysis is still running */
  isAnalysing: boolean;
  /** Whether we are using the USDA fallback */
  usingFallback?: boolean;
  /** Elapsed seconds since analysis started */
  elapsedSeconds: number;
  /** Called when user taps "Retry Scan" */
  onRetry: () => void;
  /** Called when user taps "Food Search" */
  onFoodSearch: () => void;
  /** Called when user taps "Manual Entry" */
  onManualEntry: () => void;
  isDark: boolean;
}

// ── Rotating status messages ──────────────────────────────────────────────────

const STATUS_MESSAGES = [
  'Identifying foods…',
  'Estimating portions…',
  'Calculating calories…',
  'Calculating protein…',
  'Calculating carbohydrates…',
  'Calculating fats…',
  'Validating nutrition data…',
  'Preparing report…',
];

// ── Recognition card steps ────────────────────────────────────────────────────

const CARD_STEPS: { key: AnalysisStep; label: string }[] = [
  { key: 'image_received',       label: 'Image received' },
  { key: 'ai_started',           label: 'Analyzing food' },
  { key: 'detecting_foods',      label: 'Detecting food items' },
  { key: 'estimating_portions',  label: 'Estimating portions' },
  { key: 'calculating_nutrition',label: 'Calculating nutrition' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function RecognitionCardRow({
  label,
  state,
  isDark,
}: {
  label: string;
  state: AnalysisStepState;
  isDark: boolean;
}) {
  const fadeAnim = useRef(new Animated.Value(state === 'pending' ? 0.4 : 1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: state === 'pending' ? 0.4 : 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [state]);

  const icon = state === 'done' ? '✓' : state === 'active' ? '⏳' : '⏳';
  const iconColor = state === 'done' ? EMERALD : state === 'active' ? '#FBBF24' : (isDark ? '#475569' : '#94A3B8');
  const textColor = state === 'pending' ? (isDark ? '#475569' : '#94A3B8') : (isDark ? '#E2E8F0' : '#1E293B');

  return (
    <Animated.View style={[styles.cardRow, { opacity: fadeAnim }]}>
      <Text style={[styles.cardRowIcon, { color: iconColor }]}>{icon}</Text>
      <Text style={[styles.cardRowLabel, { color: textColor }]}>{label}</Text>
    </Animated.View>
  );
}

function FloatingFoodLabel({
  label,
  index,
}: {
  label: DetectedFoodLabel;
  index: number;
}) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * 400;
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1,  duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0,  duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // Distribute labels across the image area
  const positions = [
    { top: '18%', left: '8%'  },
    { top: '38%', right: '8%' },
    { top: '58%', left: '12%' },
    { top: '22%', right: '10%'},
    { top: '72%', right: '12%'},
  ];
  const pos = positions[index % positions.length];

  return (
    <Animated.View
      style={[
        styles.floatingLabel,
        pos as any,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Text style={styles.floatingLabelName}>{label.name}</Text>
      <Text style={styles.floatingLabelCategory}>{label.category}</Text>
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MealAnalysisOverlay({
  imageUri,
  stepStates,
  detectedFoods = [],
  progress,
  isAnalysing,
  usingFallback = false,
  elapsedSeconds,
  onRetry,
  onFoodSearch,
  onManualEntry,
  isDark,
}: MealAnalysisOverlayProps) {
  // Rotating status text
  const [statusIdx, setStatusIdx] = useState(0);
  const statusFade = useRef(new Animated.Value(1)).current;

  // Spinner pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Progress bar width
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Spinner rotation
  const spinAnim = useRef(new Animated.Value(0)).current;

  // ── Animations ──────────────────────────────────────────────────────────────

  // Rotate status text every 2 seconds
  useEffect(() => {
    if (!isAnalysing) return;
    const interval = setInterval(() => {
      Animated.timing(statusFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length);
        Animated.timing(statusFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isAnalysing]);

  // Pulse the spinner ring
  useEffect(() => {
    if (!isAnalysing) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isAnalysing]);

  // Spin the ring
  useEffect(() => {
    if (!isAnalysing) return;
    const spin = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    spin.start();
    return () => spin.stop();
  }, [isAnalysing]);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ── Timeout state ────────────────────────────────────────────────────────────
  const showSlowWarning  = elapsedSeconds >= 10 && elapsedSeconds < 20 && isAnalysing;
  const showRecovery     = elapsedSeconds >= 30 && isAnalysing;

  // ── Render ───────────────────────────────────────────────────────────────────
  const bg = isDark ? '#0F172A' : '#F8FAFC';
  const cardBg = isDark ? 'rgba(30,32,34,0.92)' : 'rgba(255,255,255,0.92)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#E2E8F0' : '#1E293B';
  const mutedColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* ── Food image (always visible) ─────────────────────────────────────── */}
      <View style={styles.imageWrapper}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        {/* Dark gradient overlay */}
        <View style={styles.imageDarkOverlay} />

        {/* Corner scan brackets */}
        <View style={[styles.corner, styles.cornerTL, { borderColor: EMERALD }]} />
        <View style={[styles.corner, styles.cornerTR, { borderColor: EMERALD }]} />
        <View style={[styles.corner, styles.cornerBL, { borderColor: EMERALD }]} />
        <View style={[styles.corner, styles.cornerBR, { borderColor: EMERALD }]} />

        {/* Floating food detection labels */}
        {detectedFoods.map((food, i) => (
          <FloatingFoodLabel key={`${food.name}-${i}`} label={food} index={i} />
        ))}

        {/* Spinner overlay on image */}
        {isAnalysing && (
          <View style={styles.spinnerOnImage}>
            <Animated.View
              style={[
                styles.spinnerRing,
                { borderColor: EMERALD, transform: [{ rotate: spinInterpolate }, { scale: pulseAnim }] },
              ]}
            />
            <View style={styles.spinnerInner}>
              <ActivityIndicator color={EMERALD} size="large" />
            </View>
          </View>
        )}
      </View>

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      <View style={styles.progressBarTrack}>
        <Animated.View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: EMERALD,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      <View style={styles.progressLabelRow}>
        <Text style={[styles.progressPct, { color: EMERALD }]}>{Math.round(progress)}%</Text>
        <Text style={[styles.progressPhase, { color: mutedColor }]}>
          {progress < 25 ? 'Image received' :
           progress < 50 ? 'Food recognition' :
           progress < 75 ? 'Portion estimation' :
           progress < 100 ? 'Macro calculations' :
           'Nutrition report ready'}
        </Text>
      </View>

      {/* ── Analyzing title + rotating status ───────────────────────────────── */}
      <View style={styles.titleArea}>
        <Text style={[styles.analysingTitle, { color: textColor }]}>Analyzing Your Meal</Text>
        <Animated.Text style={[styles.analysingStatus, { color: EMERALD, opacity: statusFade }]}>
          {STATUS_MESSAGES[statusIdx]}
        </Animated.Text>
      </View>

      {/* ── USDA fallback notice ─────────────────────────────────────────────── */}
      {usingFallback && (
        <View style={[styles.fallbackBadge, { backgroundColor: BLUE + '22', borderColor: BLUE + '44' }]}>
          <Text style={[styles.fallbackText, { color: BLUE }]}>Using backup nutrition database…</Text>
        </View>
      )}

      {/* ── 10-second slow warning ───────────────────────────────────────────── */}
      {showSlowWarning && (
        <View style={[styles.warningBadge, { backgroundColor: '#F59E0B22', borderColor: '#F59E0B44' }]}>
          <Text style={[styles.warningText, { color: '#F59E0B' }]}>Still analyzing your meal…</Text>
        </View>
      )}

      {/* ── Recognition card ────────────────────────────────────────────────── */}
      <View style={[styles.recognitionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>Food Recognition Status</Text>
        {CARD_STEPS.map(step => (
          <RecognitionCardRow
            key={step.key}
            label={step.label}
            state={stepStates[step.key]}
            isDark={isDark}
          />
        ))}
      </View>

      {/* ── 30-second recovery options ───────────────────────────────────────── */}
      {showRecovery && (
        <View style={[styles.recoveryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.recoveryTitle, { color: textColor }]}>
            Analysis is taking longer than expected.
          </Text>
          <View style={styles.recoveryButtons}>
            <Pressable
              style={({ pressed }) => [styles.recoveryBtn, { backgroundColor: EMERALD, opacity: pressed ? 0.8 : 1 }]}
              onPress={onRetry}
            >
              <Text style={styles.recoveryBtnText}>Retry Scan</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.recoveryBtn, { backgroundColor: VIOLET, opacity: pressed ? 0.8 : 1 }]}
              onPress={onFoodSearch}
            >
              <Text style={styles.recoveryBtnText}>Food Search</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.recoveryBtn, { backgroundColor: BLUE, opacity: pressed ? 0.8 : 1 }]}
              onPress={onManualEntry}
            >
              <Text style={styles.recoveryBtnText}>Manual Entry</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 16,
  },

  // Image
  imageWrapper: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    position: 'relative',
    // Shadow / elevation
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // Corner brackets
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderWidth: 2.5,
  },
  cornerTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0 },

  // Spinner on image
  spinnerOnImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  spinnerInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating food labels
  floatingLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.5)',
    maxWidth: 130,
  },
  floatingLabelName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  floatingLabelCategory: {
    color: EMERALD,
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
  },

  // Progress bar
  progressBarTrack: {
    height: 5,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 3,
    marginHorizontal: 4,
    marginBottom: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressPhase: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Title area
  titleArea: {
    alignItems: 'center',
    marginBottom: 10,
    gap: 3,
  },
  analysingTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  analysingStatus: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Fallback / warning badges
  fallbackBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 8,
    alignSelf: 'center',
  },
  fallbackText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 8,
    alignSelf: 'center',
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Recognition card
  recognitionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    // Glassmorphism shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  cardRowIcon: {
    fontSize: 14,
    width: 18,
    textAlign: 'center',
  },
  cardRowLabel: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Recovery card
  recoveryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  recoveryTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 20,
  },
  recoveryButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  recoveryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  recoveryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
