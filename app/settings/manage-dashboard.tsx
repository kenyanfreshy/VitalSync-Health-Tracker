/**
 * Manage Dashboard Screen
 *
 * Lets users:
 *  1. Toggle visibility of each dashboard section (show / hide)
 *  2. Reorder the three primary draggable cards (Vitals, Activity, Glucose)
 *     using ↑ / ↓ buttons (mirrors the in-dashboard Edit Layout flow)
 *
 * Visibility state is persisted via useDashboardVisibility (AsyncStorage).
 * Card order is persisted via useDashboardCardOrder (AsyncStorage).
 */

import React, { useCallback } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { useDashboardVisibility, type DashboardSectionId } from '@/hooks/use-dashboard-visibility';
import { useDashboardCardOrder, type DashboardCardId } from '@/hooks/use-dashboard-card-order';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { settingsExtStrings } from '@/lib/i18n';

// ─── Section metadata ─────────────────────────────────────────────────────────

interface SectionMeta {
  id: DashboardSectionId;
  label: string;
  subtitle: string;
  emoji: string;
  accentColor: string;
}

const SECTION_META: SectionMeta[] = [
  {
    id: 'vitals_mini',
    label: 'Vitals Overview',
    subtitle: 'BP, pulse, SpO₂ and HRV waveform card',
    emoji: '🫀',
    accentColor: '#EF4444',
  },
  {
    id: 'activity_readiness',
    label: 'Activity & Readiness',
    subtitle: 'Steps, calories, distance and readiness score',
    emoji: '🏃',
    accentColor: '#22C55E',
  },
  {
    id: 'glucose',
    label: 'Blood Sugar',
    subtitle: 'Glucose readings, TIR chart and A1C projection',
    emoji: '🩸',
    accentColor: '#DC2626',
  },
  {
    id: 'macro_trend',
    label: 'Nutrition & Macros',
    subtitle: 'Daily macro rings, calorie trend and meal log',
    emoji: '🥗',
    accentColor: '#F59E0B',
  },
  {
    id: 'on_device_insights',
    label: 'Personal Health Insights',
    subtitle: 'On-device alerts, small wins and personalized goal nudges',
    emoji: '💡',
    accentColor: '#6366F1',
  },
  {
    id: 'sleep_section',
    label: 'Sleep',
    subtitle: 'Sleep duration, efficiency and stage breakdown',
    emoji: '🌙',
    accentColor: '#6366F1',
  },
  {
    id: 'nutrition_section',
    label: 'Nutrition Details',
    subtitle: 'Fiber, sodium, micronutrient breakdown',
    emoji: '🥦',
    accentColor: '#10B981',
  },
  {
    id: 'clinical_section',
    label: 'Clinical Narrative',
    subtitle: 'Auto-generated clinical event timeline',
    emoji: '📋',
    accentColor: '#0EA5E9',
  },
  {
    id: 'ice_section',
    label: 'Emergency Vault (ICE)',
    subtitle: 'In-case-of-emergency quick-access tile',
    emoji: '🆘',
    accentColor: '#EF4444',
  },
  {
    id: 'vitals_section',
    label: 'Vitals Detail Section',
    subtitle: 'Expanded BP, HR, SpO₂ and temperature section',
    emoji: '📊',
    accentColor: '#0A7EA4',
  },
  {
    id: 'weather_section',
    label: 'Weather & Environment',
    subtitle: 'Local weather, UV index and air quality',
    emoji: '🌤',
    accentColor: '#06B6D4',
  },
  {
    id: 'ekg_section',
    label: 'EKG Recordings',
    subtitle: 'Apple Watch EKG history with classification breakdown',
    emoji: '🫀',
    accentColor: '#EF4444',
  },
];

// Card order labels
const CARD_LABELS: Record<DashboardCardId, { label: string; emoji: string }> = {
  vitals:   { label: 'Vitals Overview',      emoji: '🫀' },
  activity: { label: 'Activity & Daily Readiness', emoji: '🏃' },
  glucose:  { label: 'Blood Sugar',          emoji: '🩸' },
  insights: { label: 'Wellness Insights',    emoji: '🧠' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManageDashboardScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const t = ((settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[lang] ?? settingsExtStrings.en);
  const { isPremium: isDashPremium, openPaywall: openDashPaywall } = usePremiumGate();

  const { visibility, hydrated: visHydrated, setCardVisible, resetVisibility } = useDashboardVisibility();
  const { order, moveCard, resetOrder, hydrated: orderHydrated } = useDashboardCardOrder();

  const haptic = useCallback((type: 'light' | 'medium') => {
    if (Platform.OS === 'web') return;
    if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleToggle = useCallback((id: DashboardSectionId, value: boolean) => {
    haptic('light');
    setCardVisible(id, value);
  }, [setCardVisible, haptic]);

  const handleMoveUp = useCallback((id: DashboardCardId) => {
    const idx = order.indexOf(id);
    if (idx > 0) {
      haptic('medium');
      moveCard(id, idx - 1);
    }
  }, [order, moveCard, haptic]);

  const handleMoveDown = useCallback((id: DashboardCardId) => {
    const idx = order.indexOf(id);
    if (idx < order.length - 1) {
      haptic('medium');
      moveCard(id, idx + 1);
    }
  }, [order, moveCard, haptic]);

  const handleResetAll = useCallback(() => {
    haptic('medium');
    resetVisibility();
    resetOrder();
  }, [resetVisibility, resetOrder, haptic]);

  const isLoading = !visHydrated || !orderHydrated;

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t.manageDashboardTitle}</Text>
        <TouchableOpacity
          onPress={handleResetAll}
          style={styles.resetBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Reset all to defaults"
        >
          <Text style={[styles.resetBtnText, { color: colors.primary }]}>{t.reset}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.muted }]}>{t.loading}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Section 1: Card Order ── */}
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t.primaryCardOrder}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>
            {t.primaryCardOrderHint}
            {!isDashPremium && (
              <TouchableOpacity onPress={openDashPaywall} style={{ marginTop: 12, backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 13 }}>{t.dashCustomPremiumTitle ?? 'Dashboard Customisation — Premium'}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{t.unlockReorderingNote ?? 'Unlock full reordering and card management with a free trial.'}</Text>
                </View>
                <Text style={{ color: '#6366F1', fontSize: 16 }}>›</Text>
              </TouchableOpacity>
            )}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {order.map((cardId, idx) => {
              const meta = CARD_LABELS[cardId];
              // Guard: skip any cardId that has no label entry (stale AsyncStorage value)
              if (!meta) return null;
              const isFirst = idx === 0;
              const isLast = idx === order.length - 1;
              return (
                <View
                  key={cardId}
                  style={[
                    styles.orderRow,
                    { borderBottomColor: colors.border },
                    isLast && styles.orderRowLast,
                  ]}
                >
                  {/* Drag handle indicator */}
                  <View style={[styles.orderHandle, { backgroundColor: colors.border }]}>
                    <Text style={[styles.orderHandleText, { color: colors.muted }]}>≡</Text>
                  </View>
                  <Text style={styles.orderEmoji}>{meta.emoji}</Text>
                  <View style={styles.orderTextWrap}>
                    <Text style={[styles.orderLabel, { color: colors.foreground }]}>{meta.label}</Text>
                    <Text style={[styles.orderPos, { color: colors.muted }]}>{t.position} {idx + 1}</Text>
                  </View>
                  {/* Up / Down arrows */}
                  <View style={styles.orderArrows}>
                    <Pressable
                      onPress={() => handleMoveUp(cardId)}
                      disabled={isFirst}
                      style={({ pressed }) => [
                        styles.arrowBtn,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        isFirst && styles.arrowBtnDisabled,
                        pressed && !isFirst && { opacity: 0.6 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${meta.label} up`}
                    >
                      <IconSymbol
                        name="chevron.up"
                        size={14}
                        color={isFirst ? colors.muted : colors.primary}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleMoveDown(cardId)}
                      disabled={isLast}
                      style={({ pressed }) => [
                        styles.arrowBtn,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        isLast && styles.arrowBtnDisabled,
                        pressed && !isLast && { opacity: 0.6 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${meta.label} down`}
                    >
                      <IconSymbol
                        name="chevron.down"
                        size={14}
                        color={isLast ? colors.muted : colors.primary}
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Section 2: Visibility Toggles ── */}
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t.sectionVisibility}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>
            {t.sectionVisibilityHint}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {SECTION_META.map((section, idx) => {
              const isVisible = visibility[section.id] ?? true;
              const isLast = idx === SECTION_META.length - 1;
              return (
                <View
                  key={section.id}
                  style={[
                    styles.visibilityRow,
                    { borderBottomColor: colors.border },
                    isLast && styles.visibilityRowLast,
                  ]}
                >
                  {/* Accent dot */}
                  <View style={[styles.accentDot, { backgroundColor: section.accentColor + '22' }]}>
                    <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                  </View>
                  <View style={styles.visibilityTextWrap}>
                    <Text
                      style={[
                        styles.visibilityLabel,
                        { color: isVisible ? colors.foreground : colors.muted },
                      ]}
                    >
                      {section.label}
                    </Text>
                    <Text style={[styles.visibilitySubtitle, { color: colors.muted }]}>
                      {section.subtitle}
                    </Text>
                  </View>
                  <Switch
                    value={isVisible}
                    onValueChange={(val) => handleToggle(section.id, val)}
                    trackColor={{ false: colors.border, true: section.accentColor + '80' }}
                    thumbColor={isVisible ? section.accentColor : colors.muted}
                    ios_backgroundColor={colors.border}
                    accessibilityLabel={`${isVisible ? 'Hide' : 'Show'} ${section.label}`}
                  />
                </View>
              );
            })}
          </View>

          {/* ── Footer note ── */}
          <View style={[styles.footerNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="info.circle" size={14} color={colors.muted} />
            <Text style={[styles.footerNoteText, { color: colors.muted }]}>
              {t.manageDashboardFooter}
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  resetBtn: {
    paddingHorizontal: 4,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
  },
  scrollContent: {
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
    marginLeft: 4,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 24,
  },
  // ── Card order rows ──
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  orderRowLast: {
    borderBottomWidth: 0,
  },
  orderHandle: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderHandleText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  orderEmoji: {
    fontSize: 20,
  },
  orderTextWrap: {
    flex: 1,
    gap: 1,
  },
  orderLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  orderPos: {
    fontSize: 12,
  },
  orderArrows: {
    flexDirection: 'row',
    gap: 6,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: {
    opacity: 0.35,
  },
  // ── Visibility rows ──
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  visibilityRowLast: {
    borderBottomWidth: 0,
  },
  accentDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionEmoji: {
    fontSize: 18,
  },
  visibilityTextWrap: {
    flex: 1,
    gap: 2,
  },
  visibilityLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  visibilitySubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  // ── Footer ──
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
  },
  footerNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
