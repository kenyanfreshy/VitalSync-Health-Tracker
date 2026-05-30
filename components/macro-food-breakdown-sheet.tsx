/**
 * MacroFoodBreakdownSheet
 *
 * Bottom sheet that shows today's top food contributors for a selected macro
 * (Protein, Fats, or Carbs). Pulls from SodiumRecord entries which carry
 * proteinG, fatG, carbsG, and foodDescription fields.
 *
 * Design: Apple Health Pro glassmorphism aesthetic — dark background,
 * emerald/violet/amber accents, animated slide-up entry.
 */

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColorScheme, useColors } from '@/hooks';
import type { SodiumRecord } from '@/lib/health/types';

// ─── Accent palette ─────────────────────────────────────────────────────────
const EMERALD = '#10B981';
const VIOLET  = '#8B5CF6';
const AMBER   = '#F59E0B';

const MACRO_CONFIG = {
  protein: {
    label: 'Protein',
    unit: 'g',
    color: EMERALD,
    field: 'proteinG' as keyof SodiumRecord,
    icon: '🥦',
    description: 'Builds and repairs muscle tissue. Target: 1.6–2.2 g/kg body weight.',
  },
  fat: {
    label: 'Fats',
    unit: 'g',
    color: VIOLET,
    field: 'fatG' as keyof SodiumRecord,
    icon: '🥑',
    description: 'Supports hormones and fat-soluble vitamins. Target: 20–35% of calories.',
  },
  carbs: {
    label: 'Carbohydrates',
    unit: 'g',
    color: AMBER,
    field: 'carbsG' as keyof SodiumRecord,
    icon: '🌾',
    description: 'Primary energy source for athletic performance. Target: 45–65% of calories.',
  },
};

export interface MacroFoodBreakdownSheetProps {
  visible: boolean;
  macro: 'protein' | 'fat' | 'carbs' | null;
  sodiumRecords: SodiumRecord[];
  onClose: () => void;
}

interface FoodEntry {
  label: string;
  value: number;
  mealContext: string;
  timestamp: string;
}

function getTodayEntries(records: SodiumRecord[], field: keyof SodiumRecord): FoodEntry[] {
  const today = new Date().toISOString().split('T')[0];
  return records
    .filter(r => r.timestamp.startsWith(today) && typeof r[field] === 'number' && (r[field] as number) > 0)
    .map(r => ({
      label: r.foodDescription ?? r.mealContext.charAt(0).toUpperCase() + r.mealContext.slice(1),
      value: r[field] as number,
      mealContext: r.mealContext,
      timestamp: r.timestamp,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // top 8 contributors
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_unused) {
    return '';
  }
}

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch:     '☀️',
  dinner:    '🌙',
  snack:     '🍎',
  supplement:'💊',
  other:     '🍽️',
};

export function MacroFoodBreakdownSheet({
  visible,
  macro,
  sodiumRecords,
  onClose,
}: MacroFoodBreakdownSheetProps) {
  const colors = useColors();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const config = macro ? MACRO_CONFIG[macro] : null;

  const entries = useMemo(() => {
    if (!config) return [];
    return getTodayEntries(sodiumRecords, config.field);
  }, [config, sodiumRecords]);

  const totalToday = useMemo(
    () => entries.reduce((s, e) => s + e.value, 0),
    [entries],
  );

  const handleShare = useCallback(async () => {
    if (!config || entries.length === 0) return;
    const lines = entries
      .map(e => `${e.label} ${e.value.toFixed(1)}${config.unit}`)
      .join(' · ');
    const message = `${config.label} today: ${lines} — Total ${totalToday.toFixed(1)}${config.unit}\n\nTracked with VitalSync`;
    try {
      await Share.share({ message });
    } catch (_unused) {
      // user dismissed share sheet
    }
  }, [config, entries, totalToday]);

  const cardBg     = isDark ? 'rgba(14,16,22,0.97)' : 'rgba(248,250,252,0.97)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  if (!visible && !macro) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            transform: [{ translateY: slideAnim }],
            // Glow shadow matching macro color
            shadowColor: config?.color ?? EMERALD,
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: isDark ? 0.3 : 0.1,
            shadowRadius: 20,
            elevation: 20,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }]} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetIcon}>{config?.icon ?? '🍽️'}</Text>
            <View>
              <Text style={[styles.sheetSectionLabel, { color: config?.color ?? EMERALD }]}>
                TODAY&apos;S TOP SOURCES
              </Text>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {config?.label ?? ''} Breakdown
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {entries.length > 0 && (
              <Pressable
                style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.6 : 1, borderColor: (config?.color ?? EMERALD) + '50', backgroundColor: (config?.color ?? EMERALD) + '15' }]}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share nutrition breakdown"
              >
                <Text style={[styles.shareBtnText, { color: config?.color ?? EMERALD }]}>Share</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={onClose}
            >
              <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* Total badge */}
        {totalToday > 0 && config && (
          <View style={[styles.totalBadge, { backgroundColor: config.color + '18', borderColor: config.color + '40' }]}>
            <Text style={[styles.totalBadgeText, { color: config.color }]}>
              {totalToday.toFixed(1)}{config.unit} total today
            </Text>
          </View>
        )}

        {/* Description */}
        {config && (
          <Text style={[styles.macroDescription, { color: colors.muted }]}>
            {config.description}
          </Text>
        )}

        {/* Food list */}
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🥗</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No meals logged today
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Log a meal to see your {config?.label.toLowerCase()} sources
              </Text>
            </View>
          ) : (
            entries.map((entry, i) => {
              const barFrac = totalToday > 0 ? entry.value / totalToday : 0;
              return (
                <View
                  key={`${entry.timestamp}-${i}`}
                  style={[
                    styles.foodRow,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <View style={styles.foodRowTop}>
                    <Text style={styles.mealEmoji}>
                      {MEAL_EMOJI[entry.mealContext] ?? '🍽️'}
                    </Text>
                    <View style={styles.foodLabelCol}>
                      <Text style={[styles.foodLabel, { color: colors.foreground }]} numberOfLines={1}>
                        {entry.label}
                      </Text>
                      <Text style={[styles.foodTime, { color: colors.muted }]}>
                        {entry.mealContext.charAt(0).toUpperCase() + entry.mealContext.slice(1)} · {formatTime(entry.timestamp)}
                      </Text>
                    </View>
                    <Text style={[styles.foodValue, { color: config?.color ?? EMERALD }]}>
                      {entry.value.toFixed(1)}{config?.unit}
                    </Text>
                  </View>
                  {/* Mini progress bar */}
                  <View style={[styles.miniBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                    <View
                      style={[
                        styles.miniBarFill,
                        {
                          width: `${(barFrac * 100).toFixed(1)}%` as any,
                          backgroundColor: config?.color ?? EMERALD,
                          opacity: 0.75,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Bottom safe area padding */}
        <View style={{ height: Platform.OS === 'ios' ? 34 : 16 }} />
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '78%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  shareBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetIcon: {
    fontSize: 28,
  },
  sheetSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
    marginTop: 2,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  totalBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  totalBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  macroDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  listScroll: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 8,
  },
  foodRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  foodRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  foodLabelCol: {
    flex: 1,
    gap: 1,
  },
  foodLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  foodTime: {
    fontSize: 11,
    fontWeight: '400',
  },
  foodValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  miniBarTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
