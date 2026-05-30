/**
 * DailyReadinessGauge — Quick-Entry style card with collapsible gauge + entry chips.
 *
 * Layout mirrors the Vitals Quick Entry card:
 *  - GlassCard (noPadding, accentColor = readiness colour)
 *  - Header row: "DAILY READINESS" label · compact score badge · collapse chevron
 *  - Expanded body: arc gauge + status pill + sub-metrics row
 *  - Entry chips row (always visible): BP · Glucose · Weight · Sleep · Activity
 *
 * Arc animation uses JS-thread Animated.Value to avoid Reanimated v4 + SVG crash.
 */
import { Easing } from 'react-native-reanimated';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/glass-card';
import { useColorScheme } from '@/hooks';
import { useRouter } from 'expo-router';

// ─── Arc geometry ─────────────────────────────────────────────────────────────
const SIZE = 160;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 62;
const STROKE_WIDTH = 9;
const START_ANGLE_DEG = 150;
const SWEEP_DEG = 240;
const ARC_LENGTH = (SWEEP_DEG / 360) * 2 * Math.PI * RADIUS;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const TRACK_PATH = describeArc(CX, CY, RADIUS, START_ANGLE_DEG, START_ANGLE_DEG + SWEEP_DEG);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getReadinessLabel(score: number): string {
  if (score >= 85) return 'Optimal';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function getReadinessColor(score: number): string {
  if (score >= 85) return '#10B981';
  if (score >= 65) return '#3B82F6';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

// ─── Entry chip definitions ───────────────────────────────────────────────────
const ENTRY_CHIPS = [
  { key: 'bp',      emoji: '❤️',  label: 'BP',      color: '#EF4444', route: '/log/vitals'      },
  { key: 'glucose', emoji: '🩸',  label: 'Glucose', color: '#F59E0B', route: '/log/blood-sugar' },
  { key: 'weight',  emoji: '⚖️',  label: 'Weight',  color: '#6366F1', route: '/log/weight'      },
  { key: 'sleep',   emoji: '🌙',  label: 'Sleep',   color: '#8B5CF6', route: '/log/sleep'       },
  { key: 'activity', emoji: '🏃',  label: 'Activity', color: '#F97316', route: '/log/activity'    },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────
interface DailyReadinessGaugeProps {
  score: number;
  isLoading?: boolean;
  onPress?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DailyReadinessGauge({ score, isLoading = false, onPress }: DailyReadinessGaugeProps) {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const router = useRouter();

  // ── Arc animation ──────────────────────────────────────────────────────────
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [filledLength, setFilledLength] = useState(0);

  useEffect(() => {
    if (isLoading) return;
    const id = progressAnim.addListener(({ value }) => setFilledLength(value * ARC_LENGTH));
    Animated.timing(progressAnim, {
      toValue: score / 100,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progressAnim.removeListener(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, isLoading]);

  // ── Collapse state (expanded by default) ──────────────────────────────────
  const [expanded, setExpanded] = useState(true);
  const chevronAnim = useRef(new Animated.Value(1)).current;

  const toggle = useCallback(() => {
    const toValue = expanded ? 0 : 1;
    setExpanded(v => !v);
    Animated.spring(chevronAnim, { toValue, useNativeDriver: true, damping: 16, stiffness: 260 }).start();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [expanded, chevronAnim]);

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const accentColor = getReadinessColor(score);
  const label = getReadinessLabel(score);

  // Colour tokens
  const mutedText   = isDark ? 'rgba(148,163,184,0.9)'  : 'rgba(100,116,139,0.85)';
  const mutedText2  = isDark ? 'rgba(148,163,184,0.5)'  : 'rgba(100,116,139,0.5)';
  const bodyText    = isDark ? '#E2E8F0' : '#1E293B';
  const dividerCol  = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.07)';
  const chipDivider = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.06)';
  const percentColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const subLabelColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const subDividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <GlassCard accentColor={accentColor} noPadding style={styles.cardShell}>

      {/* ── Header row ────────────────────────────────────────────────────── */}
      <Pressable
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`Daily Readiness section, ${expanded ? 'expanded' : 'collapsed'}. Tap to ${expanded ? 'collapse' : 'expand'}.`}
      >
        {/* Left: label */}
        <Text style={[styles.headerLabel, { color: mutedText }]}>Daily Readiness</Text>

        {/* Centre: compact score badge */}
        <View style={[styles.scoreBadge, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
          {isLoading ? (
            <Text style={[styles.scoreBadgeText, { color: mutedText2 }]}>—</Text>
          ) : (
            <Text style={[styles.scoreBadgeText, { color: accentColor }]}>{score} · {label}</Text>
          )}
        </View>

        {/* Right: chevron */}
        <Animated.Text style={[styles.chevron, { color: mutedText2, transform: [{ rotate: chevronRotate }] }]}>▾</Animated.Text>
      </Pressable>

      {/* ── Expanded body: arc gauge + sub-metrics ────────────────────────── */}
      {expanded && (
        <View style={[styles.gaugeBody, { borderTopColor: dividerCol }]}>
          {/* Arc gauge */}
          <View style={styles.gaugeWrap}>
            <Svg width={SIZE} height={SIZE * 0.72} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Defs>
                <LinearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#EF4444" />
                  <Stop offset="50%" stopColor="#F59E0B" />
                  <Stop offset="100%" stopColor="#10B981" />
                </LinearGradient>
              </Defs>
              <Path
                d={TRACK_PATH}
                stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d={TRACK_PATH}
                stroke="url(#gaugeGrad)"
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${filledLength} ${ARC_LENGTH}`}
              />
            </Svg>
            <View style={styles.scoreOverlay}>
              {isLoading ? (
                <Text style={[styles.scoreDash, { color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }]}>—</Text>
              ) : (
                <>
                  <Text style={[styles.scoreNumber, { color: accentColor }]}>{score}</Text>
                  <Text style={[styles.scorePercent, { color: percentColor }]}>/ 100</Text>
                </>
              )}
            </View>
          </View>

          {/* Sub-metrics row */}
          <View style={styles.subRow}>
            <SubMetric label="Sleep" value={score >= 65 ? 'Good' : 'Fair'} color={score >= 65 ? '#3B82F6' : '#F59E0B'} labelColor={subLabelColor} />
            <View style={[styles.subDivider, { backgroundColor: subDividerColor }]} />
            <SubMetric label="HRV" value={score >= 75 ? 'Optimal' : 'Stable'} color={score >= 75 ? '#10B981' : '#F59E0B'} labelColor={subLabelColor} />
            <View style={[styles.subDivider, { backgroundColor: subDividerColor }]} />
            <SubMetric label="BP" value={score >= 70 ? 'Stable' : 'Monitor'} color={score >= 70 ? '#F59E0B' : '#EF4444'} labelColor={subLabelColor} />
          </View>

          {/* "Tap for breakdown" hint */}
          {onPress && (
            <TouchableOpacity
              style={styles.breakdownBtn}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.breakdownBtnText, { color: accentColor }]}>View breakdown →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Entry chips row (always visible) ─────────────────────────────── */}
      <View style={[styles.chipsRow, { borderTopColor: dividerCol }]}>
        {ENTRY_CHIPS.map((chip, idx) => (
          <TouchableOpacity
            key={chip.key}
            style={[
              styles.chip,
              idx < ENTRY_CHIPS.length - 1 && { borderRightWidth: 0.5, borderRightColor: chipDivider },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(chip.route as any);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Log ${chip.label}`}
          >
            <View style={[
              styles.chipIcon,
              { backgroundColor: chip.color + (isDark ? '38' : '22'), borderColor: chip.color + (isDark ? '55' : '40') },
            ]}>
              <Text style={styles.chipEmoji}>{chip.emoji}</Text>
            </View>
            <Text style={[styles.chipLabel, { color: bodyText }]}>{chip.label}</Text>
            <View style={[styles.chipPlus, { backgroundColor: chip.color }]}>
              <Text style={styles.chipPlusText}>+</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

    </GlassCard>
  );
}

// ─── SubMetric helper ─────────────────────────────────────────────────────────
function SubMetric({ label, value, color, labelColor }: { label: string; value: string; color: string; labelColor: string }) {
  return (
    <View style={styles.subMetric}>
      <Text style={[styles.subLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.subValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  cardShell: {
    marginHorizontal: 16,
    marginBottom: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  chevron: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 16,
  },

  // Gauge body
  gaugeBody: {
    alignItems: 'center',
    paddingBottom: 12,
    borderTopWidth: 0.5,
  },
  gaugeWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: SIZE,
    height: SIZE * 0.72,
    marginTop: 4,
  },
  scoreOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 6,
  },
  scoreNumber: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 50,
  },
  scoreDash: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 50,
  },
  scorePercent: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: -4,
  },

  // Sub-metrics
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  subMetric: {
    alignItems: 'center',
    flex: 1,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  subDivider: {
    width: 1,
    height: 24,
  },

  // Breakdown button
  breakdownBtn: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  breakdownBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Entry chips
  chipsRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    gap: 4,
  },
  chipIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipPlus: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPlusText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
    lineHeight: 16,
  },
});
