/**
 * DietProtocolTooltip
 *
 * Wraps a diet protocol tile with:
 *  1. Tap-and-hold (long press) → shows a popover with full description + nutrition breakdown
 *     The nutrition breakdown is rendered as mini progress bars using the nutrition color system.
 *  2. Pulse animation on the active tile when the grid first mounts
 *
 * Usage:
 *   <DietProtocolTooltip opt={opt} isActive={isActive} colors={colors} isDark={isDark}>
 *     {/* tile content *\/}
 *   </DietProtocolTooltip>
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { DietTypeOption } from '@/lib/health/diet-type';

// ─── Nutrition color system ───────────────────────────────────────────────────
// Matches the established color system used across the app's nutrition charts.
const NUTRIENT_COLORS: Record<string, string> = {
  Carbohydrates: '#F59E0B',
  'Net Carbs':   '#F59E0B',
  Carbs:         '#F59E0B',
  Protein:       '#22C55E',
  Fat:           '#3B82F6',
  'Saturated Fat': '#3B82F6',
  'MUFA/PUFA':   '#3B82F6',
  Fibre:         '#EAB308',
  Fiber:         '#EAB308',
  Calories:      '#8B5CF6',
  Sodium:        '#EF4444',
  Potassium:     '#06B6D4',
  Phosphorus:    '#EC4899',
  'Glycemic Load': '#F97316',
  Iron:          '#A78BFA',
  'Vitamin B12': '#34D399',
  'Glycemic Index': '#F97316',
};

function getNutrientColor(label: string): string {
  return NUTRIENT_COLORS[label] ?? '#9BA1A6';
}

// ─── Per-diet nutrition breakdown ─────────────────────────────────────────────────
// Each row has a label, a display value string, and an optional pct (0–100)
// that drives the progress bar width. When pct is omitted the bar is hidden.
interface MacroRow {
  label: string;
  value: string;
  /** 0–100: percentage fill for the progress bar. Omit to hide bar. */
  pct?: number;
}

const MACRO_BREAKDOWN: Record<string, { rows: MacroRow[]; note?: string }> = {
  balanced: {
    rows: [
      { label: 'Carbohydrates', value: '~50 %', pct: 50 },
      { label: 'Protein',       value: '~20 %', pct: 20 },
      { label: 'Fat',           value: '~30 %', pct: 30 },
    ],
    note: 'Compliance ring targets: Carbs 50% · Protein 20% · Fat 30%. No conflict thresholds — all foods are tracked.',
  },
  keto: {
    rows: [
      { label: 'Fat',       value: '65–75 %', pct: 70 },
      { label: 'Protein',   value: '20–30 %', pct: 25 },
      { label: 'Net Carbs', value: '≤ 5 %',   pct: 5  },
    ],
    note: 'Compliance ring targets: Net Carbs ≤5% · Fat 65–75% · Protein 20–30%. Conflict triggered when a single entry exceeds 10 g net carbs.',
  },
  dash: {
    rows: [
      { label: 'Sodium',    value: '≤ 600 mg / meal', pct: 40 },
      { label: 'Potassium', value: '≥ 4,700 mg / day', pct: 80 },
      { label: 'Fibre',     value: '≥ 30 g / day',     pct: 70 },
    ],
    note: 'Compliance ring targets: Sodium ≤1,500 mg/day · Potassium ≥4,700 mg/day. Conflict triggered when a single entry exceeds 600 mg sodium.',
  },
  diabetic: {
    rows: [
      { label: 'Net Carbs',     value: '≤ 45 g / meal', pct: 35 },
      { label: 'Protein',       value: '15–20 %',        pct: 18 },
      { label: 'Fat',           value: '25–35 %',        pct: 30 },
    ],
    note: 'Compliance ring targets: Net Carbs ≤45 g/meal · Glycemic Load ≤20. Conflict triggered on high-carb or high-GL entries.',
  },
  vegan: {
    rows: [
      { label: 'Protein',    value: '≥ 0.8 g / kg', pct: 20 },
      { label: 'Iron',       value: 'Bio-adjusted',  pct: 55 },
      { label: 'Vitamin B12', value: 'Supplement',   pct: 100 },
    ],
    note: 'Compliance ring targets: Fiber ≥25 g · Protein ≥50 g · B12 ≥2.4 µg. No hard conflict thresholds. Bio-availability scoring applied to iron & zinc.',
  },
  mediterranean: {
    rows: [
      { label: 'Fat',          value: '35–40 %',       pct: 38 },
      { label: 'Carbohydrates', value: '40–50 %',      pct: 45 },
      { label: 'Protein',      value: '15–20 %',       pct: 18 },
    ],
    note: 'Compliance ring targets: MUFA/PUFA ≥15% · Carbs 40–50% · Sat Fat ≤8 g. Conflict triggered on high sat-fat or high-sodium entries.',
  },
  renal: {
    rows: [
      { label: 'Sodium',     value: '≤ 1,500 mg / day', pct: 30 },
      { label: 'Potassium',  value: '≤ 2,000 mg / day', pct: 40 },
      { label: 'Phosphorus', value: '≤ 800 mg / day',   pct: 35 },
    ],
    note: 'Compliance ring targets: Potassium ≤2,000 mg · Phosphorus ≤800 mg · Sodium ≤1,500 mg. Designed for CKD/dialysis patients. Consult your nephrologist for personal targets.',
  },
  custom: {
    rows: [
      { label: 'Calories',      value: 'User-defined', pct: 50 },
      { label: 'Carbohydrates', value: 'User-defined', pct: 50 },
      { label: 'Protein',       value: 'User-defined', pct: 50 },
    ],
    note: 'Compliance ring targets: your custom macro & nutrient goals. Edit your targets in the Personalized Diet editor below.',
  },
};

// ─── Mini progress bar ────────────────────────────────────────────────────────
function MacroBar({ label, value, pct, isDark }: MacroRow & { isDark: boolean }) {
  const color = getNutrientColor(label);
  const bgColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const fillColor = color;

  return (
    <View style={barStyles.row}>
      <View style={barStyles.labelRow}>
        <View style={[barStyles.dot, { backgroundColor: color }]} />
        <Text style={[barStyles.label, { color: isDark ? '#ECEDEE' : '#11181C' }]}>{label}</Text>
        <Text style={[barStyles.value, { color }]}>{value}</Text>
      </View>
      {pct !== undefined && (
        <View style={[barStyles.track, { backgroundColor: bgColor }]}>
          <View
            style={[
              barStyles.fill,
              {
                width: `${Math.min(Math.max(pct, 2), 100)}%` as any,
                backgroundColor: fillColor,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: {
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  opt: DietTypeOption;
  isActive: boolean;
  /** Whether this is the first tile to receive the pulse (only active tile pulses) */
  shouldPulse: boolean;
  colors: {
    foreground: string;
    muted: string;
    surface: string;
    border: string;
    background: string;
  };
  isDark: boolean;
  children: React.ReactNode;
  /** Forwarded onPress handler */
  onPress: () => void;
  /** Forwarded style (the tile card style) */
  tileStyle: object | object[];
}

export function DietProtocolTooltip({
  opt,
  isActive,
  shouldPulse,
  colors,
  isDark,
  children,
  onPress,
  tileStyle,
}: Props) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasPulsed = useRef(false);

  // ── Pulse on mount (active tile only) ──────────────────────────────────────
  useEffect(() => {
    if (!shouldPulse || hasPulsed.current) return;
    hasPulsed.current = true;
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 150, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.97, duration: 100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 100, useNativeDriver: true }),
      ]).start();
    }, 300);
    return () => clearTimeout(timer);
  }, [shouldPulse, pulseAnim]);

  const macro = MACRO_BREAKDOWN[opt.value] ?? MACRO_BREAKDOWN.balanced;
  const cardAccent = opt.color;

  return (
    <>
      <Animated.View style={{ width: '48%', transform: [{ scale: pulseAnim }] }}>
        <Pressable
          style={({ pressed }) => [tileStyle, { opacity: pressed ? 0.8 : 1 }]}
          onPress={onPress}
          onLongPress={() => {
            if (Platform.OS !== 'web') {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const Haptics = require('expo-haptics');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch (_unused) {}
            }
            setTooltipVisible(true);
          }}
          delayLongPress={400}
          accessibilityHint="Hold to see protocol details"
        >
          {children}
        </Pressable>
      </Animated.View>

      {/* ── Tooltip Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={tooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(false)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={() => setTooltipVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.popover,
                  {
                    backgroundColor: isDark ? '#1C1F21' : '#FFFFFF',
                    borderColor: cardAccent + '44',
                    shadowColor: cardAccent,
                  },
                ]}
              >
                {/* Header */}
                <View style={[styles.popoverHeader, { borderBottomColor: cardAccent + '30' }]}>
                  <Text style={styles.popoverEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.popoverTitle, { color: cardAccent }]}>{opt.label}</Text>
                    <Text style={[styles.popoverDesc, { color: colors.muted }]}>{opt.description}</Text>
                  </View>
                  {isActive && (
                    <View style={[styles.activeBadge, { backgroundColor: cardAccent + '20', borderColor: cardAccent + '50' }]}>
                      <Text style={[styles.activeBadgeText, { color: cardAccent }]}>Active</Text>
                    </View>
                  )}
                </View>

                {/* Macro breakdown — mini progress bars */}
                <Text style={[styles.sectionHeading, { color: colors.muted }]}>MACRO / NUTRIENT TARGETS</Text>
                {macro.rows.map((row) => (
                  <MacroBar key={row.label} {...row} isDark={isDark} />
                ))}

                {/* Note */}
                {macro.note && (
                  <Text style={[styles.noteText, { color: colors.muted }]}>{macro.note}</Text>
                )}

                {/* Tags */}
                <View style={styles.tagRow}>
                  {opt.useBioAvailability && (
                    <View style={[styles.tag, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}>
                      <Text style={[styles.tagText, { color: '#10B981' }]}>Bio-Availability Scoring</Text>
                    </View>
                  )}
                  {opt.isCustom && (
                    <View style={[styles.tag, { backgroundColor: '#EC489915', borderColor: '#EC489940' }]}>
                      <Text style={[styles.tagText, { color: '#EC4899' }]}>Personalized</Text>
                    </View>
                  )}
                  {opt.isRenal && (
                    <View style={[styles.tag, { backgroundColor: '#06B6D415', borderColor: '#06B6D440' }]}>
                      <Text style={[styles.tagText, { color: '#06B6D4' }]}>CKD / Dialysis</Text>
                    </View>
                  )}
                </View>

                {/* Dismiss hint */}
                <Text style={[styles.dismissHint, { color: colors.muted }]}>Tap anywhere to dismiss</Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popover: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
    gap: 4,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  popoverEmoji: {
    fontSize: 32,
    lineHeight: 38,
  },
  popoverTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  popoverDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 2,
  },
  noteText: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    fontStyle: 'italic',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dismissHint: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 14,
    letterSpacing: 0.2,
  },
});
