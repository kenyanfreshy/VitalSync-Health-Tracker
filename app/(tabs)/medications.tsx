/**
 * Medications Screen — three-tab layout inside the Record tab's Personal Records section.
 *
 * Tab 1 · Today      — doses due now (±30 min), missed doses, skipped doses
 * Tab 2 · History    — full dose log; reinstate missed/skipped by editing time
 * Tab 3 · My Meds    — full medication list with pharmacy, dates, on-device side effects, FDA interactions
 *
 * Data is stored locally — never sent to the cloud.
 */

import { safeFormatDate } from '@/lib/utils';
import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Animated as RNAnimated,
} from 'react-native';
import * as SafeImagePicker from '@/lib/safe-image-picker';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { GlassCard } from '@/components/glass-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme, useColors, useLang, useRawLang } from '@/hooks';
import { medicationStrings, medPdfStrings, routeLabels } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { parseMedicationTranscript } from '@/lib/scribe/parsers';
import { extractTextFromImage, isSupported as isOCRSupported } from 'expo-text-extractor';
import { ErrorBoundary } from "@/components/error-boundary";
import {
  loadMedications,
  addMedication,
  updateMedication,
  deleteMedication,
  logDose,
  reinstateDose,
  loadDisclaimerAccepted,
  saveDisclaimerAccepted,
  createMedication,
  createDoseLog,
  getTodayTakenCount,
  getDailyDoseCount,
  getAdherenceRate,
  getDueDosesToday,
  getMissedDosesToday,
  logRescheduleEvent,
  removeDoseLog,
  updateDoseTime,
} from '@/lib/medications/storage';
import {
  requestNotificationPermissions,
  scheduleMedicationNotifications,
  scheduleEarlyReminderNotifications,
  cancelMedicationNotifications,
  scheduleRefillReminderNotification,
  scheduleAdvanceRefillNotification,
  scheduleFillDateRefillNotification,
  scheduleSnoozeNotification,
  scheduleWeeklyAdherenceNotification,
} from '@/lib/medications/notifications';
import { Medication, MedicationStore, MedicationForm, MedicationFrequency, MedicationRoute, DoseLog, SideEffect, DrugInteraction, ROUTE_EMOJI, ROUTE_LABELS, ALL_ROUTES } from '@/lib/medications/types';
// ScrollableCalendar and TimePickerDrum replaced with TextInput for dictation compatibility
import {
  PharmacyAutocomplete,
  type PharmacyAutocompleteHandle,
} from '@/components/pharmacy-autocomplete';
import { upsertPharmacy, getPreferredPharmacy, getOpenTodayHours, getAllPharmacies, normalizePharmacyName, parseAllDayHours, searchPharmacies } from '@/lib/medications/pharmacy-store';
import { recordTransferRequest, getLastTransferDate, formatTransferDate } from '@/lib/medications/transfer-guard';
// KeyboardDictationBanner removed — dictation uses live text box
import { parsePrescriptionScanText } from '@/lib/medications/prescription-scan-parser';
import { mergeParsedMedication } from '@/lib/medications/merge-parsed-medication';
import { parseNaturalDate } from '@/lib/medications/parse-date';
import Animated, { withSequence, withTiming, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useHealth } from '@/lib/health/health-context';
import type { AllergyRecord } from '@/lib/health/types';
import { useDictationHistory } from '@/hooks/use-dictation-history';
import { useFieldFlash } from '@/hooks/use-field-flash';
import { DictationBox } from '@/components/dictation-box';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { OcrReviewCard, type OcrReviewField } from '@/components/ocr-review-card';
import { DictationTipBanner } from '@/components/dictation-tip-banner';
import { DateTimePickerField } from '@/components/date-time-picker-field';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import { useAdherenceGoal } from '@/hooks/use-adherence-goal';
import { lookupIndication } from '@/lib/medications/indication-lookup';
import { isRTLLang } from '@/lib/rtl';
import Svg, { Defs, Pattern, Rect, Line } from 'react-native-svg';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { useSubscription } from '@/lib/subscription/subscription-context';
import { useUpsell } from '@/hooks/use-upsell';
import { logEvent } from '@/lib/analytics';
import { MedicalScanAnalysisOverlay, type ScanStep } from '@/components/medical-scan-analysis-overlay';

const MED_ACTIVE_TAB_KEY = '@vsht:med_active_tab';

const INITIAL_RX_STEPS: import('@/components/medical-scan-analysis-overlay').ScanStep[] = [
  { id: 'capture',  label: 'Image captured',             status: 'pending' },
  { id: 'upload',   label: 'Analyzing prescription',     status: 'pending' },
  { id: 'reading',  label: 'Reading prescription label', status: 'pending' },
  { id: 'extract',  label: 'Extracting medication fields', status: 'pending' },
  { id: 'validate', label: 'Validating extracted data',  status: 'pending' },
];
const LOW_STOCK_THRESHOLD_KEY = '@vsht:low_stock_threshold_v1';

// ─── Constants ───────────────────────────────────────────────────────────────
const MED_COLORS = [
  '#22C55E', '#3B82F6', '#8B5CF6', '#EF4444',
  '#F59E0B', '#22C55E', '#EC4899', '#06B6D4',
];
const FORMS: MedicationForm[] = [
  'tablet', 'capsule', 'liquid', 'injection',
  'patch', 'inhaler', 'drops', 'other',
];
const FREQUENCIES: MedicationFrequency[] = [
  'daily', 'twice_daily', 'three_times_daily', 'four_times_daily',
  'weekly', 'as_needed', 'custom',
];

type TabId = 'today' | 'history' | 'mymeds';

// ─── MedFlashOverlay ─────────────────────────────────────────────────────────
// Extracted into its own component so that useAnimatedStyle is called at the
// top level of a function component, not inside a FlatList renderItem callback.
function MedFlashOverlay({ flashAnim }: { flashAnim: ReturnType<typeof useSharedValue<number>> }) {
  const flashStyle = useAnimatedStyle(() => ({
    position: 'absolute', inset: 0, borderRadius: 16, zIndex: 10, pointerEvents: 'none' as const,
    backgroundColor: `rgba(34,197,94,${flashAnim.value * 0.22})`,
    borderWidth: flashAnim.value > 0.05 ? 1.5 : 0,
    borderColor: `rgba(34,197,94,${flashAnim.value * 0.7})`,
  }));
  return <Animated.View style={flashStyle} />;
}

// ─── Disclaimer Banner ───────────────────────────────────────────────────────
function DisclaimerBanner({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [disclaimerLang] = useLang();
  const disclaimerT = (medicationStrings as unknown as Record<string, typeof medicationStrings.en>)[disclaimerLang] ?? medicationStrings.en;
  return (
    <View style={[bannerStyles.banner, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '44' }]}>
      <IconSymbol name="exclamationmark.triangle.fill" size={14} color={colors.warning} />
      <Text style={[bannerStyles.text, { color: colors.muted }]}>
        {disclaimerT.caregiverDisclaimer}
      </Text>
    </View>
  );
}
const bannerStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  text: { flex: 1, fontSize: 11, lineHeight: 16 },
});

// ─── Swipeable Dose Card ─────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 72;
const ACTION_REVEAL_W = 80;

function SwipeableDoseCard({
  children,
  onMarkTaken,
  onMarkSkipped,
  onDelete,
  onEditTime,
  style,
}: {
  children: React.ReactNode;
  onMarkTaken: () => void;
  onMarkSkipped: () => void;
  onDelete?: () => void;
  onEditTime?: () => void;
  style?: object;
}) {
  const translateX = useSharedValue(0);
  const leftOpacity = useSharedValue(0);  // right-swipe → Mark Taken (green)
  const rightOpacity = useSharedValue(0); // left-swipe  → Skip (orange)

  const _swipeLang = useLang();
  const _swipeT = ((medicationStrings as unknown as Record<string, typeof medicationStrings.en>)[_swipeLang] ?? medicationStrings.en);
  const swipeTakenLabel = _swipeT.swipeTaken ?? 'TAKEN';
  const swipeSkipLabel = _swipeT.swipeSkip ?? 'SKIP';
  const triggerTaken = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onMarkTaken();
  }, [onMarkTaken]);

  const triggerSkip = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMarkSkipped();
  }, [onMarkSkipped]);

  const triggerDelete = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    onDelete?.();
  }, [onDelete]);

  const pan = Gesture.Pan()
    .enabled(Platform.OS !== 'web')
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      const tx = e.translationX;
      if (tx > 0) {
        // Right swipe → Mark Taken
        translateX.value = Math.min(SWIPE_THRESHOLD * 1.5, tx);
        leftOpacity.value = Math.min(1, tx / SWIPE_THRESHOLD);
        rightOpacity.value = 0;
      } else {
        // Left swipe → Skip
        translateX.value = Math.max(-SWIPE_THRESHOLD * 1.5, tx);
        rightOpacity.value = Math.min(1, -tx / SWIPE_THRESHOLD);
        leftOpacity.value = 0;
      }
    })
    .onEnd((e) => {
      const tx = e.translationX;
      const vx = e.velocityX;
      const deleteThreshold = SWIPE_THRESHOLD * 2.2; // far left = delete
      if (tx >= SWIPE_THRESHOLD || vx > 600) {
        // Commit Mark Taken
        translateX.value = withTiming(ACTION_REVEAL_W, { duration: 120 }, () => {
          runOnJS(triggerTaken)();
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
          leftOpacity.value = withTiming(0, { duration: 200 });
        });
      } else if ((tx <= -deleteThreshold || vx < -900) && onDelete !== undefined) {
        // Far left swipe → Delete
        translateX.value = withTiming(-ACTION_REVEAL_W * 2, { duration: 120 }, () => {
          runOnJS(triggerDelete)();
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
          rightOpacity.value = withTiming(0, { duration: 200 });
        });
      } else if (tx <= -SWIPE_THRESHOLD || vx < -600) {
        // Commit Skip
        translateX.value = withTiming(-ACTION_REVEAL_W, { duration: 120 }, () => {
          runOnJS(triggerSkip)();
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
          rightOpacity.value = withTiming(0, { duration: 200 });
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        leftOpacity.value = withTiming(0, { duration: 150 });
        rightOpacity.value = withTiming(0, { duration: 150 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const leftActionStyle = useAnimatedStyle(() => ({ opacity: leftOpacity.value }));
  const rightActionStyle = useAnimatedStyle(() => ({ opacity: rightOpacity.value }));

  return (
    <View style={[{ position: 'relative', marginBottom: 10 }, style]}>
      {/* Green action — Mark Taken (right swipe, revealed on left) */}
      <Animated.View
        style={[swipeStyles.actionLeft, leftActionStyle]}
        pointerEvents="none"
      >
        <Text style={swipeStyles.actionIcon}>✓</Text>
        <Text style={swipeStyles.actionLabel}>{swipeTakenLabel}</Text>
      </Animated.View>

      {/* Left-swipe actions: Skip (orange) + Delete (red if onDelete provided) */}
      <Animated.View
        style={[swipeStyles.actionRight, rightActionStyle]}
        pointerEvents="none"
      >
        {onDelete ? (
          <>
            <View style={swipeStyles.actionRightHalf}>
              <Text style={swipeStyles.actionIcon}>→</Text>
              <Text style={swipeStyles.actionLabel}>{swipeSkipLabel}</Text>
            </View>
            <View style={[swipeStyles.actionRightHalf, { backgroundColor: '#DC2626' }]}>
              <Text style={swipeStyles.actionIcon}>🗑</Text>
              <Text style={swipeStyles.actionLabel}>DELETE</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={swipeStyles.actionIcon}>→</Text>
            <Text style={swipeStyles.actionLabel}>SKIP</Text>
          </>
        )}
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <Pressable
            onLongPress={onEditTime}
            delayLongPress={400}
            style={{ flex: 1 }}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  actionLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: ACTION_REVEAL_W, borderRadius: 16,
    backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  actionRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: ACTION_REVEAL_W * 2, borderRadius: 16,
    backgroundColor: '#EA580C',
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
  },
  actionRightHalf: {
    flex: 1, height: '100%',
    alignItems: 'center', justifyContent: 'center', gap: 2,
    borderRadius: 16,
  },
  actionIcon: { fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
  actionLabel: { fontSize: 9, color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.5 },
});

// ─── Today Tab ───────────────────────────────────────────────────────────────
function TodayTab({
  meds,
  colors,
  t,
  onMarkTaken,
  onMarkSkipped,
  onMarkMissed,
  onReschedule,
  onDeleteDose,
  onEditDoseTime,
  highlightedDoseKey,
}: {
  meds: MedicationStore;
  colors: ReturnType<typeof useColors>;
  t: typeof medicationStrings['en'];
  onMarkTaken: (medId: string, scheduledTime: string) => void;
  onMarkSkipped: (medId: string, scheduledTime: string) => void;
  onMarkMissed: (medId: string, scheduledTime: string) => void;
  onReschedule: (medId: string, scheduledTime: string) => void;
  onDeleteDose?: (medId: string, logId: string) => void;
  onEditDoseTime?: (medId: string, logId: string, currentTime: string) => void;
  /** Key of the dose card to highlight after a reschedule (format: medId-scheduledTime) */
  highlightedDoseKey?: string | null;
}) {
  // Severity filter for the interaction warnings banner
  const [severityFilter, setSeverityFilter] = useState<'all' | 'major' | 'moderate' | 'minor'>('all');

  // Collect cross-medication interaction warnings from active meds
  const interactionWarnings: { pair: string; severity: string; description: string }[] = [];
  const activeMeds = meds.filter((m) => m.active);
  const seenPairs = new Set<string>();
  for (const med of activeMeds) {
    if (!med.drugInteractions) continue;
    for (const ix of med.drugInteractions) {
      // Check if any other active med is named in the interaction
      for (const other of activeMeds) {
        if (other.id === med.id) continue;
        const otherName = other.name.toLowerCase();
        const ixDesc = (ix.description ?? '').toLowerCase();
        const ixDrug = (ix.drug ?? '').toLowerCase();
        if (ixDesc.includes(otherName) || ixDrug.includes(otherName)) {
          const pairKey = [med.id, other.id].sort().join('-');
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            interactionWarnings.push({
              pair: `${med.name} + ${other.name}`,
              severity: ix.severity ?? 'moderate',
              description: ix.description ?? 'Potential drug interaction detected.',
            });
          }
        }
      }
    }
  }
  const today = new Date().toISOString().split('T')[0];

  // Build due, missed, skipped lists
  const dueDoses: { med: Medication; scheduledTime: string; minutesUntil: number }[] = [];
  const missedDoses: { med: Medication; scheduledTime: string }[] = [];
  const skippedDoses: { med: Medication; log: DoseLog }[] = [];

  for (const med of meds.filter((m) => m.active)) {
    for (const d of getDueDosesToday(med)) {
      dueDoses.push({ med, scheduledTime: d.scheduledTime, minutesUntil: d.minutesUntil });
    }
    for (const d of getMissedDosesToday(med)) {
      missedDoses.push({ med, scheduledTime: d.scheduledTime });
    }
    for (const log of med.doseLogs.filter(
      (l) => l.date === today && l.status === 'skipped',
    )) {
      skippedDoses.push({ med, log });
    }
  }

  const isEmpty = dueDoses.length === 0 && missedDoses.length === 0 && skippedDoses.length === 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
    >
      <DisclaimerBanner colors={colors} />

      {/* Drug interaction warnings — filter chips + banner rows */}
      {interactionWarnings.length > 0 && (
        <View style={styles.severityFilterRow}>
          {(['all', 'major', 'moderate', 'minor'] as const).map((level) => {
            const isActive = severityFilter === level;
            const chipColor =
              level === 'major' ? colors.error
              : level === 'moderate' ? colors.warning
              : level === 'minor' ? colors.success
              : colors.primary;
            return (
              <Pressable
                key={level}
                onPress={() => setSeverityFilter(level)}
                style={[styles.severityChip, {
                  backgroundColor: isActive ? chipColor : 'transparent',
                  borderColor: chipColor,
                }]}
              >
                <Text style={[styles.severityChipText, {
                  color: isActive ? '#FFFFFF' : chipColor,
                }]}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {interactionWarnings
        .filter((w) => severityFilter === 'all' || w.severity === severityFilter)
        .map((w, i) => (
        <View key={i} style={[styles.interactionBanner, {
          backgroundColor: w.severity === 'major' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
          borderColor: w.severity === 'major' ? colors.error : colors.warning,
        }]}>
          <Text style={styles.interactionIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <View style={styles.interactionHeaderRow}>
              <Text style={[styles.interactionSeverityBadge, {
                backgroundColor: w.severity === 'major' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)',
                color: w.severity === 'major' ? colors.error : colors.warning,
              }]}>
                {w.severity.toUpperCase()}
              </Text>
              <Text style={[styles.interactionPair, { color: colors.foreground }]}>
                {w.pair}
              </Text>
            </View>
            <Text style={[styles.interactionDesc, { color: colors.muted }]}>{w.description}</Text>
            <View style={[styles.interactionDisclaimerBox, { borderColor: w.severity === 'major' ? colors.error : colors.warning }]}>
              <Text style={styles.interactionDisclaimerIcon}>👨‍⚕️</Text>
              <Text style={[styles.interactionDisclaimerText, { color: colors.foreground }]}>
                {t.interactionImportant ?? 'Important'}: 
                {t.interactionWarning ?? 'This interaction may be significant. Do not adjust or stop your medications without first consulting your pharmacist or healthcare provider.'}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {isEmpty && (
        <View style={styles.emptyState}>
          <IconSymbol name="checkmark.circle.fill" size={48} color={colors.success} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up!</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            No doses due right now. Check back later.
          </Text>
        </View>
      )}

      {/* Due now */}
      {dueDoses.length > 0 && (
        <>
          <View style={styles.sectionLabelRow}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>DUE NOW</Text>
            {dueDoses.length > 1 && (
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  dueDoses.forEach(({ med, scheduledTime }) => onMarkTaken(med.id, scheduledTime));
                }}
                style={({ pressed }) => [
                  styles.markAllBtn,
                  { backgroundColor: pressed ? '#16A34ACC' : '#22C55E' },
                ]}
              >
                <IconSymbol name="checkmark.circle.fill" size={13} color="#FFFFFF" />
                {t.markAllTaken}
              </Pressable>
            )}
          </View>
          {dueDoses.map(({ med, scheduledTime, minutesUntil }) => {
            const isUpcoming = minutesUntil > 0;
            const badgeLabel = isUpcoming
              ? `In ${minutesUntil}m`
              : minutesUntil === 0 ? 'Now' : 'Overdue';
            const badgeColor = isUpcoming ? colors.warning : minutesUntil === 0 ? colors.success : colors.error;
            // Count how many times this dose slot has been snoozed today
            const snoozeCount = (() => {
              const log = med.doseLogs.find(
                (l) => l.date === today && l.scheduledTime === scheduledTime,
              );
              return (log?.rescheduleHistory ?? []).filter((e) => e.reason === 'snooze').length;
            })();
            return (
              <SwipeableDoseCard
                key={`${med.id}-${scheduledTime}`}
                onMarkTaken={() => onMarkTaken(med.id, scheduledTime)}
                onMarkSkipped={() => onMarkSkipped(med.id, scheduledTime)}
                onDelete={onDeleteDose ? () => {
                  const log = med.doseLogs.find(l => l.scheduledTime === scheduledTime);
                  if (log) onDeleteDose(med.id, log.id);
                } : undefined}
                onEditTime={onEditDoseTime ? () => {
                  const log = med.doseLogs.find(l => l.scheduledTime === scheduledTime);
                  if (log) onEditDoseTime(med.id, log.id, log.scheduledTime);
                } : undefined}
              >
                <GlassCard accentColor={isUpcoming ? colors.warning : med.color} style={styles.doseCardInner}>
                  <View style={styles.doseCardHeader}>
                    <View style={[styles.colorDot, { backgroundColor: med.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.medName, { color: colors.foreground }]}>{med.name}</Text>
                      <Text style={[styles.medDose, { color: colors.muted }]}>
                        {med.dose} · {scheduledTime}
                      </Text>
                    </View>
                    {snoozeCount > 0 && (
                      <View style={[styles.snoozeBadge, { backgroundColor: colors.warning + '22' }]}>
                        <Text style={[styles.snoozeBadgeText, { color: colors.warning }]}>
                          {t.snoozedCount.replace('{n}', String(snoozeCount))}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.dueBadge, { backgroundColor: badgeColor + '22' }]}>
                      <Text style={[styles.dueBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.cardButtons}>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        onMarkTaken(med.id, scheduledTime);
                      }}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: med.color + (pressed ? 'CC' : 'FF') },
                      ]}
                    >
                      <IconSymbol name="checkmark.circle.fill" size={16} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>{t.markTaken}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onMarkSkipped(med.id, scheduledTime);
                      }}
                      style={({ pressed }) => [
                        styles.skipBtn,
                        { borderColor: colors.border, backgroundColor: pressed ? colors.surface : 'transparent' },
                      ]}
                    >
                      <Text style={[styles.skipBtnText, { color: colors.muted }]}>{t.markSkipped}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onReschedule(med.id, scheduledTime);
                      }}
                      style={({ pressed }) => [
                        styles.skipBtn,
                        { borderColor: colors.primary + '66', backgroundColor: pressed ? colors.primary + '22' : 'transparent' },
                      ]}
                    >
                      <Text style={[styles.skipBtnText, { color: colors.primary }]}>{t.reschedule ?? 'Reschedule'}</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              </SwipeableDoseCard>
            );
          })}
        </>
      )}

      {/* Missed */}
      {missedDoses.length > 0 && (
        <>
          <View style={styles.sectionLabelRow}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t.sectionMissed ?? 'MISSED'}</Text>
            {missedDoses.length > 1 && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    missedDoses.forEach(({ med, scheduledTime }) => onMarkTaken(med.id, scheduledTime));
                  }}
                  style={({ pressed }) => [
                    styles.markAllBtn,
                    { backgroundColor: pressed ? colors.error + 'CC' : colors.error },
                  ]}
                >
                  <IconSymbol name="checkmark.circle.fill" size={13} color="#FFFFFF" />
                  {t.markAllTaken}
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    missedDoses.forEach(({ med, scheduledTime }) => onMarkSkipped(med.id, scheduledTime));
                  }}
                  style={({ pressed }) => [
                    styles.markAllBtn,
                    { backgroundColor: pressed ? colors.warning + 'CC' : colors.warning },
                  ]}
                >
                  <IconSymbol name="xmark.circle.fill" size={13} color="#FFFFFF" />
                  {t.skipAll}
                </Pressable>
              </View>
            )}
          </View>
          {missedDoses.map(({ med, scheduledTime }) => {
            const doseKey = `${med.id}-${scheduledTime}`;
            const isHighlighted = highlightedDoseKey === doseKey;
            return (
              <SwipeableDoseCard
                key={`missed-${doseKey}`}
                onMarkTaken={() => onMarkTaken(med.id, scheduledTime)}
                onMarkSkipped={() => onMarkSkipped(med.id, scheduledTime)}
                onDelete={onDeleteDose ? () => {
                  const log = med.doseLogs.find(l => l.scheduledTime === scheduledTime);
                  if (log) onDeleteDose(med.id, log.id);
                } : undefined}
                onEditTime={onEditDoseTime ? () => {
                  const log = med.doseLogs.find(l => l.scheduledTime === scheduledTime);
                  if (log) onEditDoseTime(med.id, log.id, log.scheduledTime);
                } : undefined}
              >
                <GlassCard
                  accentColor={isHighlighted ? colors.primary : colors.error}
                  style={[
                    styles.doseCardInner,
                    isHighlighted && { borderColor: colors.primary, borderWidth: 2 },
                  ]}
                >
                  <View style={styles.doseCardHeader}>
                    <View style={[styles.colorDot, { backgroundColor: isHighlighted ? colors.primary : colors.error }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.medName, { color: colors.foreground }]}>{med.name}</Text>
                      <Text style={[styles.medDose, { color: colors.muted }]}>
                        {med.dose} · {t.scheduledLabel.replace('{time}', scheduledTime)}
                      </Text>
                    </View>
                    <View style={[styles.dueBadge, { backgroundColor: (isHighlighted ? colors.primary : colors.error) + '22' }]}>
                      <Text style={[styles.dueBadgeText, { color: isHighlighted ? colors.primary : colors.error }]}>
                        {isHighlighted ? t.statusRescheduled : t.statusMissed}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardButtons}>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        onMarkTaken(med.id, scheduledTime);
                      }}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: colors.primary + (pressed ? 'CC' : 'FF') },
                      ]}
                    >
                      <IconSymbol name="checkmark.circle.fill" size={16} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>Mark Taken</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        onMarkMissed(med.id, scheduledTime);
                      }}
                      style={({ pressed }) => [
                        styles.skipBtn,
                        { borderColor: colors.error + '88', backgroundColor: pressed ? colors.error + '22' : 'transparent' },
                      ]}
                    >
                      <Text style={[styles.skipBtnText, { color: colors.error }]}>Mark Missed</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onMarkSkipped(med.id, scheduledTime)}
                      style={({ pressed }) => [
                        styles.skipBtn,
                        { borderColor: colors.border, backgroundColor: pressed ? colors.surface : 'transparent' },
                      ]}
                    >
                      <Text style={[styles.skipBtnText, { color: colors.muted }]}>Skip</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              </SwipeableDoseCard>
            );
          })}
        </>
      )}

      {/* Skipped today */}
      {skippedDoses.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t.sectionSkipped ?? 'SKIPPED TODAY'}</Text>
          {skippedDoses.map(({ med, log }) => (
            <SwipeableDoseCard
              key={log.id}
              onMarkTaken={() => {}}
              onMarkSkipped={() => {}}
              onDelete={onDeleteDose ? () => onDeleteDose(med.id, log.id) : undefined}
              onEditTime={onEditDoseTime ? () => onEditDoseTime(med.id, log.id, log.scheduledTime) : undefined}
              style={{ marginBottom: 10 }}
            >
              <GlassCard accentColor={colors.warning} style={styles.doseCard}>
                <View style={styles.doseCardHeader}>
                  <View style={[styles.colorDot, { backgroundColor: colors.warning }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.medName, { color: colors.foreground }]}>{med.name}</Text>
                    <Text style={[styles.medDose, { color: colors.muted }]}>
                      {med.dose} · Skipped at {log.scheduledTime}
                    </Text>
                  </View>
                  <View style={[styles.dueBadge, { backgroundColor: colors.warning + '22' }]}>
                    <Text style={[styles.dueBadgeText, { color: colors.warning }]}>{t.statusSkipped}</Text>
                  </View>
                </View>
              </GlassCard>
            </SwipeableDoseCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────
type HistoryFilter = 'all' | 'taken' | 'skipped' | 'missed' | 'rescheduled';
const MED_HISTORY_FILTER_KEY = '@vsht:med_history_filter';

const HISTORY_FILTER_CHIPS: { id: HistoryFilter; emoji: string }[] = [
  { id: 'all',          emoji: '📋' },
  { id: 'taken',        emoji: '✅' },
  { id: 'skipped',      emoji: '⏭️' },
  { id: 'missed',       emoji: '⚠️' },
  { id: 'rescheduled',  emoji: '🔄' },
];
function getFilterChipLabel(id: HistoryFilter, t: typeof medicationStrings['en']): string {
  if (id === 'taken') return t.statusTaken;
  if (id === 'skipped') return t.statusSkipped;
  if (id === 'missed') return t.statusMissed;
  if (id === 'rescheduled') return t.statusRescheduled;
  return t.filterAll ?? 'All';
}

function HistoryTab({
  meds,
  colors,
  onReinstate,
  onDeleteDose,
  onEditDoseTime,
  scrollRef,
  onScroll,
  initialFilter = 'all',
  initialDateStart,
  initialDateEnd,
}: {
  meds: MedicationStore;
  colors: ReturnType<typeof useColors>;
  onReinstate: (medId: string, logId: string, time: string) => void;
  onDeleteDose?: (medId: string, logId: string) => void;
  onEditDoseTime?: (medId: string, logId: string, currentTime: string) => void;
  scrollRef?: React.RefObject<import('react-native').FlatList<any> | null>;
  onScroll?: (event: any) => void;
  initialFilter?: HistoryFilter;
  initialDateStart?: string; // YYYY-MM-DD
  initialDateEnd?: string;   // YYYY-MM-DD
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const histLang = useLang();
  const histRawLang = useRawLang();
  const histIsRTL = isRTLLang(histRawLang);
  const histT = ((medicationStrings as unknown as Record<string, typeof medicationStrings.en>)[histLang] ?? medicationStrings.en);
  const [reinstateLogId, setReinstateLogId] = useState<string | null>(null);
  const [reinstateMedId, setReinstateMedId] = useState<string | null>(null);
  const [reinstateTime, setReinstateTime] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>(initialFilter);
  const [historyDateStart, setHistoryDateStart] = useState<string | null>(initialDateStart ?? null);
  const [historyDateEnd, setHistoryDateEnd] = useState<string | null>(initialDateEnd ?? null);
  // Reason analytics date-range filter: 'week' | 'month' | 'all'
  const [reasonDateRange, setReasonDateRange] = useState<'week' | 'month' | 'all'>('month');
  // Reasons chart collapsed by default (per collapsible guideline)
  const [reasonsCollapsed, setReasonsCollapsed] = useState(true);

  // Load persisted filter on mount (only when parent hasn't set a specific initialFilter)
  useEffect(() => {
    if (initialFilter !== 'all') return; // parent override takes priority
    AsyncStorage.getItem(MED_HISTORY_FILTER_KEY).then(v => {
      if (v === 'all' || v === 'taken' || v === 'skipped' || v === 'missed' || v === 'rescheduled') {
        setHistoryFilter(v as HistoryFilter);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync if parent changes the initial filter (e.g. after a Taken/Skipped action)
  useEffect(() => {
    setHistoryFilter(initialFilter);
  }, [initialFilter]);

  // Persist filter selection
  const setHistoryFilterPersisted = useCallback((f: HistoryFilter) => {
    setHistoryFilter(f);
    safeSetItem(MED_HISTORY_FILTER_KEY, f).catch(() => {});
  }, []);

  // Flatten all logs sorted by date desc
  const allLogs = useMemo(() => {
    const entries: { med: Medication; log: DoseLog }[] = [];
    for (const med of meds) {
      for (const log of med.doseLogs) {
        entries.push({ med, log });
      }
    }
    return entries.sort(
      (a, b) => new Date(b.log.loggedAt).getTime() - new Date(a.log.loggedAt).getTime(),
    );
  }, [meds]);

  // Per-filter counts (over all logs, ignoring date range, for chip labels)
  const filterCounts = useMemo(() => ({
    all: allLogs.length,
    taken: allLogs.filter(e => e.log.status === 'taken' || e.log.reinstatedAt).length,
    skipped: allLogs.filter(e => e.log.status === 'skipped' && !e.log.reinstatedAt).length,
    missed: allLogs.filter(e => e.log.status === 'missed' && !e.log.reinstatedAt).length,
    rescheduled: allLogs.filter(e => (e.log.rescheduleHistory ?? []).some(r => r.reason !== 'snooze')).length,
  }), [allLogs]);

  // Apply filter + optional date range
  const filteredLogs = useMemo(() => {
    let logs = allLogs;
    if (historyFilter === 'taken') logs = logs.filter(e => e.log.status === 'taken' || e.log.reinstatedAt);
    else if (historyFilter === 'skipped') logs = logs.filter(e => e.log.status === 'skipped' && !e.log.reinstatedAt);
    else if (historyFilter === 'missed') logs = logs.filter(e => e.log.status === 'missed' && !e.log.reinstatedAt);
    else if (historyFilter === 'rescheduled') logs = logs.filter(e => (e.log.rescheduleHistory ?? []).some(r => r.reason !== 'snooze'));
    if (historyDateStart) logs = logs.filter(e => e.log.date >= historyDateStart!);
    if (historyDateEnd) logs = logs.filter(e => e.log.date <= historyDateEnd!);
    return logs;
  }, [allLogs, historyFilter, historyDateStart, historyDateEnd]);

  const statusColor = (status: string) => {
    if (status === 'taken') return colors.success;
    if (status === 'skipped') return colors.warning;
    return colors.error;
  };

  const statusLabel = (log: DoseLog) => {
    if (log.reinstatedAt) return histT.statusReinstated;
    if (log.status === 'taken') return histT.statusTaken;
    if (log.status === 'skipped') return histT.statusSkipped;
    return histT.statusMissed;
  };

  const [sharingReport, setSharingReport] = React.useState(false);

  const generateCaregiverReport = React.useCallback(async () => {
    setSharingReport(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const recentLogs: { med: Medication; log: DoseLog }[] = [];
      for (const med of meds) {
        for (const log of med.doseLogs) {
          if (log.date >= cutoffStr) recentLogs.push({ med, log });
        }
      }
      recentLogs.sort((a, b) => new Date(b.log.loggedAt).getTime() - new Date(a.log.loggedAt).getTime());
      const taken = recentLogs.filter(e => e.log.status === 'taken' || e.log.reinstatedAt).length;
      const missed = recentLogs.filter(e => e.log.status === 'missed' && !e.log.reinstatedAt).length;
      const skipped = recentLogs.filter(e => e.log.status === 'skipped' && !e.log.reinstatedAt).length;
      const total = recentLogs.length;
      const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
      const rows = recentLogs.map(({ med, log }) => {
        const statusLabel = log.reinstatedAt ? histT.statusReinstated : log.status === 'taken' ? histT.statusTaken : log.status === 'skipped' ? histT.statusSkipped : histT.statusMissed;
        const statusColor = log.reinstatedAt || log.status === 'taken' ? '#16A34A' : log.status === 'skipped' ? '#D97706' : '#DC2626';
        const reschedules = (log.rescheduleHistory ?? []).filter(e => e.reason !== 'snooze');
        return `<tr>
          <td>${log.date}</td>
          <td>${log.scheduledTime}</td>
          <td style="font-weight:600">${med.name}</td>
          <td>${med.dose ?? ''}</td>
          <td style="color:${statusColor};font-weight:700">${statusLabel}</td>
          <td>${log.note ?? ''}</td>
          <td>${reschedules.map(r => `${r.originalTime}→${r.newTime}`).join(', ')}</td>
        </tr>`;
      }).join('');
      const mL1 = (medPdfStrings as unknown as Record<string, typeof medPdfStrings.en>)[histLang] ?? medPdfStrings.en;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{color:#0a7ea4;font-size:22px;margin-bottom:4px}
        .sub{color:#666;font-size:13px;margin-bottom:20px}
        .summary{display:flex;gap:24px;margin-bottom:20px}
        .stat{text-align:center;padding:12px 20px;border-radius:8px;background:#f5f5f5}
        .stat-val{font-size:24px;font-weight:700}
        .stat-lbl{font-size:11px;color:#666;margin-top:2px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#0a7ea4;color:#fff;padding:8px 6px;text-align:left}
        td{padding:7px 6px;border-bottom:1px solid #eee}
        tr:nth-child(even) td{background:#f9f9f9}
        .footer{margin-top:24px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}
      </style></head><body>
        <h1>${mL1.reportTitle}</h1>
        <div class="sub">${mL1.generatedOn} ${new Date().toLocaleDateString()} · Last 30 days (${cutoffStr} – ${new Date().toISOString().split('T')[0]})</div>
        <div class="summary">
          <div class="stat"><div class="stat-val" style="color:#0a7ea4">${pct}%</div><div class="stat-lbl">${mL1.statAdherence}</div></div>
          <div class="stat"><div class="stat-val" style="color:#16A34A">${taken}</div><div class="stat-lbl">${mL1.statTaken}</div></div>
          <div class="stat"><div class="stat-val" style="color:#DC2626">${missed}</div><div class="stat-lbl">${mL1.statMissed}</div></div>
          <div class="stat"><div class="stat-val" style="color:#D97706">${skipped}</div><div class="stat-lbl">${mL1.statSkipped}</div></div>
          <div class="stat"><div class="stat-val">${total}</div><div class="stat-lbl">${mL1.statTotal}</div></div>
        </div>
        <table>
          <thead><tr><th>${mL1.colDate}</th><th>${mL1.colTime}</th><th>${mL1.colMedication}</th><th>${mL1.colDose}</th><th>${mL1.colStatus}</th><th>${mL1.colNote}</th><th>${mL1.colRescheduled}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">${mL1.footer}</div>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Medication Report' });
        // Delete temp PDF after sharing to prevent health data lingering in cache
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } catch (_e) {
      // silently fail
    } finally {
      setSharingReport(false);
    }
  }, [meds]);

  return (
    <View style={{ flex: 1 }}>
      {/* ── Filter chip row + Share Report button ────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row',
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        alignItems: 'center',
      }}>
        {/* Scrollable chip strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          style={{ flex: 1 }}
        >
          {HISTORY_FILTER_CHIPS.map(chip => {
            const active = historyFilter === chip.id;
            const chipColor = chip.id === 'taken' ? colors.success
              : chip.id === 'skipped' ? colors.warning
              : chip.id === 'missed' ? colors.error
              : chip.id === 'rescheduled' ? '#0EA5E9'
              : colors.primary;
            const count = filterCounts[chip.id];
            return (
              <Pressable
                key={chip.id}
                onPress={() => {
                  setHistoryFilterPersisted(chip.id);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: active ? chipColor : colors.border,
                  backgroundColor: active ? chipColor + '20' : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 12 }}>{chip.emoji}</Text>
                <Text style={{
                  fontSize: 12,
                  fontWeight: active ? '700' : '400',
                  color: active ? chipColor : colors.muted,
                }}>{getFilterChipLabel(chip.id, histT)} ({count})</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* Share Report button — fixed on the right */}
        <View style={{ paddingRight: 12, paddingLeft: 4 }}>
          <Pressable
            onPress={generateCaregiverReport}
            disabled={sharingReport}
            accessibilityLabel={sharingReport ? 'Generating report…' : 'Share adherence report'}
            accessibilityRole="button"
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: pressed ? colors.primary + '20' : 'transparent',
              opacity: sharingReport ? 0.5 : 1,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Text style={{ fontSize: sharingReport ? 10 : 14 }}>{sharingReport ? '⏳' : '📤'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Active date range banner */}
      {(historyDateStart || historyDateEnd) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: isDark ? '#0a7ea425' : '#E0F2FE', borderBottomWidth: 0.5, borderBottomColor: isDark ? '#0a7ea460' : '#BAE6FD', gap: 8 }}>
          <Text style={{ fontSize: 11, color: isDark ? '#38BDF8' : '#0369A1', flex: 1 }}>
            📅 Showing {historyDateStart ?? '…'} → {historyDateEnd ?? '…'}
          </Text>
          <TouchableOpacity
            onPress={() => { setHistoryDateStart(null); setHistoryDateEnd(null); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 11, color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '700' }}>✕ Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reinstate time modal */}
      <Modal
        visible={!!reinstateLogId}
        transparent
        animationType="fade"
        onRequestClose={() => setReinstateLogId(null)}
      >
        <View style={styles.overlayBg}>
          <View style={[styles.reinstateCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.reinstateTitle, { color: colors.foreground }]}>
              Edit Dose Time
            </Text>
            <Text style={[styles.reinstateSubtitle, { color: colors.muted }]}>
              Enter the time you actually took this dose (HH:MM)
            </Text>
            <TextInput
              value={reinstateTime}
              onChangeText={setReinstateTime}
              placeholder="HH:MM"
              placeholderTextColor={colors.muted}
              style={[styles.reinstateInput, {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              }]}
              returnKeyType="done"
              autoFocus
            />
            <View style={styles.reinstateButtons}>
              <Pressable
                onPress={() => setReinstateLogId(null)}
                style={[styles.reinstateCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.reinstateCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (reinstateLogId && reinstateMedId && reinstateTime.match(/^\d{1,2}:\d{2}$/)) {
                    onReinstate(reinstateMedId, reinstateLogId, reinstateTime);
                    setReinstateLogId(null);
                  }
                }}
                style={[styles.reinstateConfirmBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.reinstateConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Missed dose reason analytics ── */}
      {(() => {
        // Compute cutoff date based on selected date-range filter
        const now2 = new Date();
        let reasonCutoffStr: string | null = null;
        if (reasonDateRange === 'week') {
          const c = new Date(now2); c.setDate(c.getDate() - 7);
          reasonCutoffStr = c.toISOString().split('T')[0];
        } else if (reasonDateRange === 'month') {
          const c = new Date(now2); c.setDate(c.getDate() - 30);
          reasonCutoffStr = c.toISOString().split('T')[0];
        }
        const reasonCounts: Record<string, number> = {};
        let totalWithReason = 0;
        let totalMissedSkipped = 0;
        for (const { log } of allLogs) {
          if ((log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt) {
            if (reasonCutoffStr && log.date < reasonCutoffStr) continue;
            totalMissedSkipped++;
            if (log.note) {
              const reason = log.note.trim();
              reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
              totalWithReason++;
            }
          }
        }
        // Compute previous-period counts for trend arrows
        const prevReasonCounts: Record<string, number> = {};
        if (reasonDateRange !== 'all') {
          // Previous period: same length, immediately before current period
          const periodDays = reasonDateRange === 'week' ? 7 : 30;
          const prevEnd = new Date(now2); prevEnd.setDate(prevEnd.getDate() - periodDays);
          const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - periodDays);
          const prevEndStr = prevEnd.toISOString().split('T')[0];
          const prevStartStr = prevStart.toISOString().split('T')[0];
          for (const { log } of allLogs) {
            if ((log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt) {
              if (log.date < prevStartStr || log.date > prevEndStr) continue;
              if (log.note) {
                const r = log.note.trim();
                prevReasonCounts[r] = (prevReasonCounts[r] ?? 0) + 1;
              }
            }
          }
        }
        const reasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
        if (totalMissedSkipped === 0 && reasons.length === 0) return null;
        const maxCount = reasons.length > 0 ? reasons[0][1] : 1;
        // Colour palette for bars
        const barColors = ['#EF4444', '#F97316', '#EAB308', '#8B5CF6', '#3B82F6'];
        const rangeChips: { id: 'week' | 'month' | 'all'; label: string }[] = [
          { id: 'week', label: histT.skipReasonRangeWeek },
          { id: 'month', label: histT.skipReasonRangeMonth },
          { id: 'all', label: histT.skipReasonRangeAll },
        ];
        const rangeLabel = reasonDateRange === 'week' ? histT.skipReasonLast7 : reasonDateRange === 'month' ? histT.skipReasonLast30 : histT.skipReasonRangeAll;
        return (
          <View style={{
            marginHorizontal: 16,
            marginBottom: 12,
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <TouchableOpacity
              onPress={() => setReasonsCollapsed(c => !c)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={reasonsCollapsed ? 'Expand reasons chart' : 'Collapse reasons chart'}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: reasonsCollapsed ? 0 : 8, gap: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.foreground, flex: 1 }}>
                {histT.skipReasonChartTitle}
              </Text>
              <View style={{ backgroundColor: colors.error + '20', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.error }}>{totalMissedSkipped} doses</Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.muted, transform: [{ rotate: reasonsCollapsed ? '0deg' : '90deg' }] }}>›</Text>
            </TouchableOpacity>
            {/* Date-range filter chips — only shown when expanded */}
            {!reasonsCollapsed && (<>
            {/* Date-range filter chips */}
            <View style={{ flexDirection: histIsRTL ? 'row-reverse' : 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {rangeChips.map(chip => {
                const isActive = reasonDateRange === chip.id;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    onPress={() => setReasonDateRange(chip.id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 20,
                      borderWidth: 1,
                      backgroundColor: isActive ? colors.primary : 'transparent',
                      borderColor: isActive ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: isActive ? '#FFFFFF' : colors.muted }}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {reasons.length === 0 ? (
              <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>{histT.skipReasonNone} ({rangeLabel.toLowerCase()}) — add notes when marking doses missed or skipped.</Text>
            ) : (
              reasons.slice(0, 5).map(([reason, count], idx) => {
                const pct = Math.round((count / totalMissedSkipped) * 100);
                const barW = Math.round((count / maxCount) * 100);
                const bc = barColors[idx % barColors.length];
                // Trend vs previous period
                const prevCount = prevReasonCounts[reason] ?? 0;
                const trendDiff = count - prevCount;
                const trendArrow = reasonDateRange === 'all'
                  ? null
                  : trendDiff > 0
                    ? { symbol: '↑', color: '#EF4444', label: `+${trendDiff}` }
                    : trendDiff < 0
                      ? { symbol: '↓', color: '#10B981', label: `${trendDiff}` }
                      : { symbol: '→', color: '#9CA3AF', label: '±0' };
                return (
                  <View key={reason} style={{ marginBottom: 7 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.foreground, flex: 1 }} numberOfLines={1}>{reason}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        {trendArrow && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: trendArrow.color + '18', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: trendArrow.color }}>{trendArrow.symbol}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: trendArrow.color }}>{trendArrow.label}</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: 10, color: colors.muted }}>{pct}%</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: bc }}>{count}×</Text>
                      </View>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: bc, width: `${barW}%` as any }} />
                    </View>
                  </View>
                );
              })
            )}
            {totalMissedSkipped > 0 && totalWithReason < totalMissedSkipped && (
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>
                {totalMissedSkipped - totalWithReason} {histT.skipReasonDosesWithout}
              </Text>
            )}
            </>)}
          </View>
        );
      })()}

      <FlatList
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        data={filteredLogs}
        keyExtractor={(item) => item.log.id}
        contentContainerStyle={styles.tabContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            <DisclaimerBanner colors={colors} />
            {/* ── Refill Requested Events ─────────────────────────────── */}
            {historyFilter === 'all' && meds.some(m => (m as any).refillRequestedDate) && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, marginBottom: 6 }}>REFILL EVENTS</Text>
                {meds
                  .filter(m => (m as any).refillRequestedDate)
                  .sort((a, b) => ((b as any).refillRequestedDate ?? '').localeCompare((a as any).refillRequestedDate ?? ''))
                  .map(m => (
                    <View
                      key={`refill-${m.id}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 12,
                        marginBottom: 6,
                        backgroundColor: colors.surface,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0EA5E9' }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>{m.name}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          Refill requested · {(m as any).refillRequestedDate}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#0EA5E9' + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#0EA5E9' }}>🗺️ Refill</Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="clock.fill" size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {historyFilter === 'all' ? 'No history yet' : `No ${historyFilter} doses`}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              {historyFilter === 'all'
                ? 'Dose logs will appear here after you mark doses taken or skipped.'
                : `No doses marked as ${historyFilter} yet.`}
            </Text>
          </View>
        }
        renderItem={({ item: { med, log } }) => {
          const sc = statusColor(log.reinstatedAt ? 'taken' : log.status);
          const label = statusLabel(log);
          const canReinstate = (log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt;
          // Count snooze events for this log entry
          const histSnoozeCount = (log.rescheduleHistory ?? []).filter((e: any) => e.reason === 'snooze').length;
          const renderRightActions = () => (
            <Pressable
              onPress={() => {
                if (onDeleteDose) {
                  Alert.alert('Delete Entry', 'Remove this dose log entry?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDeleteDose(med.id, log.id) },
                  ]);
                }
              }}
              style={[styles.historyDeleteAction, { backgroundColor: colors.error }]}
            >
              <Text style={{ fontSize: 18, color: '#fff' }}>🗑</Text>
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700', marginTop: 2 }}>DELETE</Text>
            </Pressable>
          );
          return (
            <ReanimatedSwipeable
              key={log.id}
              renderRightActions={renderRightActions}
              overshootRight={false}
              friction={2}
            >
            <Pressable
              onPress={() => {
                if (onEditDoseTime) {
                  setReinstateMedId(med.id);
                  setReinstateLogId(log.id);
                  setReinstateTime(log.reinstatedTime ?? log.scheduledTime);
                } else if (canReinstate) {
                  setReinstateMedId(med.id);
                  setReinstateLogId(log.id);
                  setReinstateTime('');
                }
              }}
            >
            <View style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.historyDot, { backgroundColor: sc }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyMedName, { color: colors.foreground }]}>{med.name}</Text>
                <Text style={[styles.historyMeta, { color: colors.muted }]}>
                  {log.date} · {log.scheduledTime}
                  {log.reinstatedAt ? ` · Taken at ${log.reinstatedTime}` : ''}
                  {log.note ? ` · ${log.note}` : ''}
                </Text>
                {histSnoozeCount > 0 && (
                  <View style={[styles.snoozeBadge, { backgroundColor: colors.warning + '22', alignSelf: 'flex-start', marginTop: 4 }]}>
                    <Text style={[styles.snoozeBadgeText, { color: colors.warning }]}>
                      {histT.snoozedCount.replace('{n}', String(histSnoozeCount))}
                    </Text>
                  </View>
                )}
                {(log.rescheduleHistory ?? []).filter((e: any) => e.reason !== 'snooze').map((ev: any, idx: number) => (
                  <View
                    key={`reschedule-${idx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 4,
                      backgroundColor: colors.primary + '15',
                      borderRadius: 6,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ fontSize: 10 }}>🔄</Text>
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>
                      Rescheduled {ev.originalTime} → {ev.newTime}
                    </Text>
                    {ev.reason ? (
                      <Text style={{ fontSize: 10, color: colors.muted }}>· {ev.reason}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <View style={styles.historyRight}>
                <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                  <Text style={[styles.statusBadgeText, { color: sc }]}>{label}</Text>
                </View>
                {canReinstate && (
                  <Pressable
                    onPress={() => {
                      setReinstateMedId(med.id);
                      setReinstateLogId(log.id);
                      setReinstateTime('');
                    }}
                    style={({ pressed }) => [styles.reinstateBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[styles.reinstateBtnText, { color: colors.primary }]}>Edit</Text>
                  </Pressable>
                )}
              </View>
            </View>
            </Pressable>
            </ReanimatedSwipeable>
          );
        }}
      />
    </View>
  );
}

// ─── My Medications Tab ───────────────────────────────────────────────────────
function MyMedsTab({
  meds,
  colors,
  t,
  onEdit,
  onDelete,
  onRefreshAI,
  onUpdateMed,
  allergies = [],
  newMedId,
  lowStockThreshold = 7,
}: {
  meds: MedicationStore;
  colors: ReturnType<typeof useColors>;
  t: typeof medicationStrings['en'];
  onEdit: (med: Medication) => void;
  onDelete: (id: string) => void;
  onRefreshAI: (med: Medication) => void;
  onUpdateMed: (updated: Medication) => Promise<void>;
  allergies?: AllergyRecord[];
  newMedId?: string | null;
  lowStockThreshold?: number;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Flash animation for newly saved medication row
  const flashAnim = useSharedValue(0);
  const prevNewMedId = React.useRef<string | null | undefined>(null);
  React.useEffect(() => {
    if (newMedId && newMedId !== prevNewMedId.current) {
      prevNewMedId.current = newMedId;
      flashAnim.value = 0;
      flashAnim.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(1, { duration: 800 }),
        withTiming(0, { duration: 600 }),
      );
    }
  }, [newMedId, flashAnim]);
  // Map of normalized pharmacy name → today's hours string (or 'Closed')
  const [pharmacyHoursMap, setPharmacyHoursMap] = useState<Record<string, string | undefined>>({});
  // Full week hours per pharmacy name key
  const [pharmacyFullHoursMap, setPharmacyFullHoursMap] = useState<Record<string, (string | undefined)[] | undefined>>({});
  // Which med's pharmacy hours row is expanded
  const [expandedPharmacyHoursId, setExpandedPharmacyHoursId] = useState<string | null>(null); 
  // Map of medicationId → last transfer request date label (e.g. "Apr 3")
  const [lastTransferMap, setLastTransferMap] = useState<Record<string, string>>({});
  // Refill threshold editor state
  const [refillThresholdMed, setRefillThresholdMed] = useState<Medication | null>(null);
  const [refillThresholdValue, setRefillThresholdValue] = useState('7');
  // Pharmacy editor state (inline Set Pharmacy row in expanded card)
  const [pharmacyEditorMedId, setPharmacyEditorMedId] = useState<string | null>(null);
  const [pharmacyEditorName, setPharmacyEditorName] = useState('');
  const [pharmacyEditorPhone, setPharmacyEditorPhone] = useState('');
  const [pharmacyEditorAddress, setPharmacyEditorAddress] = useState('');
  const [pharmacyEditorHours, setPharmacyEditorHours] = useState('');
  const [pharmacySuggestions, setPharmacySuggestions] = useState<any[]>([]);

  useEffect(() => {
    getAllPharmacies().then((entries) => {
      const todayMap: Record<string, string | undefined> = {};
      const fullMap: Record<string, (string | undefined)[] | undefined> = {};
      for (const entry of entries) {
        const key = normalizePharmacyName(entry.name);
        todayMap[key] = getOpenTodayHours(entry.hours);
        fullMap[key] = parseAllDayHours(entry.hours);
      }
      setPharmacyHoursMap(todayMap);
      setPharmacyFullHoursMap(fullMap);
    }).catch(() => {});
  }, [meds]);

  const refreshTransferDates = useCallback(async () => {
    const map: Record<string, string> = {};
    await Promise.all(
      meds.map(async (med) => {
        const d = await getLastTransferDate(med.id);
        if (d) map[med.id] = formatTransferDate(d);
      })
    );
    setLastTransferMap(map);
  }, [meds]);

  useEffect(() => { refreshTransferDates(); }, [refreshTransferDates]);

  return (
    <>
    <FlatList
      data={meds}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<DisclaimerBanner colors={colors} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <IconSymbol name="pills.fill" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t.emptyTitle}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>{t.emptySubtitle}</Text>
        </View>
      }
      renderItem={({ item: med }) => {
        const expanded = expandedId === med.id;
        const adherence = getAdherenceRate(med);
        const isLowStock = med.quantity !== null && med.quantity <= med.refillAt;
        // Closed-today detection: look up today's hours for this med's pharmacy
        const pharmKey = med.pharmacyName ? normalizePharmacyName(med.pharmacyName) : null;
        const todayHours = pharmKey ? pharmacyHoursMap[pharmKey] : undefined;
        const isClosedToday = todayHours?.toLowerCase() === 'closed';
        const fullWeekHours = pharmKey ? pharmacyFullHoursMap[pharmKey] : undefined;
        const isHoursExpanded = expandedPharmacyHoursId === med.id;

        const isNew = med.id === newMedId;
        return (
          <View style={{ position: 'relative' }}>
          {isNew && <MedFlashOverlay flashAnim={flashAnim} />}
          <GlassCard accentColor={med.color} style={styles.myMedCard}>
            {/* Header row */}
            <TouchableOpacity
              onPress={() => setExpandedId(expanded ? null : med.id)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <View style={[styles.colorDot, { backgroundColor: med.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.medName, { color: colors.foreground }]}>{med.name}</Text>
                      {med.route ? (
                        <View style={[styles.routeBadge, { backgroundColor: med.color + '22' }]}>
                          <Text style={styles.routeBadgeText}>{ROUTE_EMOJI[med.route as keyof typeof ROUTE_EMOJI] ?? '💊'}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.medDose, { color: colors.muted }]}>
                      {med.dose}
                      {med.form !== 'other' ? ` · ${med.form}` : ''}
                      {med.active ? '' : ' · Inactive'}
                    </Text>
                    {med.indication ? (
                      <View style={[styles.indicationChip, { backgroundColor: 'rgba(13,148,136,0.12)', borderColor: 'rgba(13,148,136,0.3)' }]}>
                        <Text style={[styles.indicationChipText, { color: '#22C55E' }]}>{med.indication}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => onEdit(med)}
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                  >
                    <IconSymbol name="pencil" size={16} color={colors.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(med.id)}
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                  >
                    <IconSymbol name="trash" size={16} color={colors.error} />
                  </Pressable>
                  <IconSymbol
                    name={expanded ? 'chevron.up' : 'chevron.down'}
                    size={14}
                    color={colors.muted}
                  />
                </View>
              </View>
            </TouchableOpacity>

            {/* Quick stats */}
            <View style={styles.statsRow}>
              {med.quantity !== null && (
                <View style={styles.statChip}>
                  <IconSymbol name="pills.fill" size={11} color={isLowStock ? colors.warning : colors.muted} />
                  <Text style={[styles.statText, { color: isLowStock ? colors.warning : colors.muted }]}>
                    {isLowStock ? `${med.quantity} left — refill soon` : `${med.quantity} left`}
                  </Text>
                </View>
              )}
              <View style={styles.statChip}>
                <IconSymbol name="chart.bar.fill" size={11} color={colors.muted} />
                <Text style={[styles.statText, { color: colors.muted }]}>
                  {Math.round(adherence * 100)}% adherence
                </Text>
              </View>
              {/* ── Refill lifecycle badge (tappable → opens pharmacy map) ── */}
              {(() => {
                const reqDate = (med as any).refillRequestedDate as string | undefined;
                const refillReminderTs = med.refillReminderDate
                  ? (new Date(med.refillReminderDate).getTime() || new Date(med.refillReminderDate + 'T00:00:00').getTime())
                  : null;
                const daysUntilRefill = refillReminderTs != null
                  ? Math.ceil((refillReminderTs - Date.now()) / 86400000)
                  : null;
                const isLowStockLocal = med.quantity != null && med.quantity <= (lowStockThreshold ?? 7);
                const pharmAddr = (med as any).pharmacyAddress as string | undefined;

                // Opens pharmacy map and auto-logs refillRequestedDate
                const openPharmacyMap = async () => {
                  if (!pharmAddr) return;
                  const encoded = encodeURIComponent(pharmAddr);
                  const appleUrl = `maps://?q=${encoded}`;
                  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
                  if (Platform.OS === 'ios') {
                    Linking.canOpenURL(appleUrl).then(ok => Linking.openURL(ok ? appleUrl : googleUrl)).catch(() => Linking.openURL(googleUrl));
                  } else if (Platform.OS === 'android') {
                    const geoUrl = `geo:0,0?q=${encoded}`;
                    Linking.canOpenURL(geoUrl).then(ok => Linking.openURL(ok ? geoUrl : googleUrl)).catch(() => Linking.openURL(googleUrl));
                  } else {
                    Linking.openURL(googleUrl).catch(() => {});
                  }
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Auto-log refill request date
                  try {
                    const currentMeds5 = await loadMedications();
                    const today5 = new Date().toISOString().split('T')[0];
                    const updatedMeds5 = await (updateMedication as any)(currentMeds5, (med as any).id, { refillRequestedDate: today5 });
                    setPharmacySuggestions(updatedMeds5);
                  } catch (_unused) {}
                };

                // Priority: Refill Requested > Refill Due > In Stock
                if (reqDate) {
                  const reqLabel = (() => {
                    try {
                      const d = new Date(reqDate);
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    } catch { return reqDate; }
                  })();
                  return (
                    <TouchableOpacity
                      onPress={pharmAddr ? openPharmacyMap : undefined}
                      activeOpacity={pharmAddr ? 0.7 : 1}
                      style={[styles.refillLifecycleBadge, { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' }]}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.refillLifecycleBadgeText, { color: '#3B82F6' }]}>🗺️ Refill requested · {reqLabel}{pharmAddr ? ' ↗' : ''}</Text>
                    </TouchableOpacity>
                  );
                }
                if (daysUntilRefill != null && daysUntilRefill <= 7 && daysUntilRefill >= 0) {
                  return (
                    <TouchableOpacity
                      onPress={pharmAddr ? openPharmacyMap : undefined}
                      activeOpacity={pharmAddr ? 0.7 : 1}
                      style={[styles.refillLifecycleBadge, { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)' }]}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.refillLifecycleBadgeText, { color: '#EF4444' }]}>⚠️ Refill due {daysUntilRefill === 0 ? 'today' : `in ${daysUntilRefill}d`}{pharmAddr ? ' ↗' : ''}</Text>
                    </TouchableOpacity>
                  );
                }
                if (med.quantity != null && !isLowStockLocal) {
                  return (
                    <View style={[styles.refillLifecycleBadge, { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.30)' }]}>
                      <Text style={[styles.refillLifecycleBadgeText, { color: '#22C55E' }]}>✓ {t.inStock}</Text>
                    </View>
                  );
                }
                return null;
              })()}
              {!!med.refillReminderDate && (() => {
                const refillDate = new Date(med.refillReminderDate).getTime()
                  ? new Date(med.refillReminderDate)
                  : new Date(med.refillReminderDate + 'T00:00:00');
                const hasTime = med.refillReminderDate.includes('T') && med.refillReminderDate.length > 10;
                return (
                  <View style={[styles.statChip, { backgroundColor: colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }]}>
                    <Text style={[styles.statText, { color: colors.warning }]}>
                      🔔 Refill by {safeFormatDate(refillDate.toISOString(), undefined, {
                        month: 'short', day: 'numeric',
                        ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
                      })}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Expanded details */}
            {expanded && (
              <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
                {/* Pharmacy */}
                {(med.pharmacyName || med.pharmacyPhone || (med as any).pharmacyAddress) && (
                  <View style={styles.detailRow}>
                    <IconSymbol name="building.2.fill" size={14} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      {med.pharmacyName && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[styles.detailText, { color: colors.foreground }]}>
                            {med.pharmacyName}
                          </Text>
                          {isClosedToday && (
                            <View style={styles.closedBadge}>
                              <Text style={styles.closedBadgeText}>Closed Today</Text>
                            </View>
                          )}
                          {todayHours && !isClosedToday && (
                            <Text style={[styles.hoursChip, { color: '#22C55E' }]}>
                              🟢 {todayHours}
                            </Text>
                          )}
                          {fullWeekHours && (
                            <TouchableOpacity
                              onPress={() => setExpandedPharmacyHoursId(isHoursExpanded ? null : med.id)}
                              style={{ marginLeft: 4 }}
                            >
                              <Text style={{ fontSize: 11, color: colors.primary }}>
                                {isHoursExpanded ? 'Hide hours ▲' : 'All hours ▼'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {/* Collapsible full-week hours table */}
                      {isHoursExpanded && fullWeekHours && (
                        <View style={[styles.weekHoursTable, { borderColor: colors.border }]}>
                          {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map((day, idx) => {
                            const todayDayIdx = new Date().getDay();
                            const isToday = idx === todayDayIdx;
                            const hrs = fullWeekHours[idx];
                            return (
                              <View key={day} style={[
                                styles.weekHoursRow,
                                isToday && { backgroundColor: 'rgba(10,126,164,0.07)' },
                              ]}>
                                <Text style={[
                                  styles.weekHoursDayLabel,
                                  { color: isToday ? colors.primary : colors.muted },
                                  isToday && { fontWeight: '700' },
                                ]}>{day}</Text>
                                <Text style={[
                                  styles.weekHoursValue,
                                  { color: hrs && hrs.toLowerCase() !== 'closed' ? colors.foreground : colors.error },
                                ]}>
                                  {hrs ?? 'Closed'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {(med as any).pharmacyAddress ? (
                        <TouchableOpacity
                          onPress={() => {
                            const q = encodeURIComponent((med as any).pharmacyAddress);
                            Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() => {});
                          }}
                          style={styles.callPharmacyBtn}
                        >
                          <Text style={[styles.callPharmacyText, { color: colors.muted }]}>
                            📍 {(med as any).pharmacyAddress}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {med.pharmacyPhone && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`tel:${med.pharmacyPhone}`).catch(() => {})}
                          style={styles.callPharmacyBtn}
                        >
                          <Text style={[styles.callPharmacyText, { color: colors.primary }]}>
                            📞 {med.pharmacyPhone}  ·  Call Pharmacy
                          </Text>
                        </TouchableOpacity>
                      )}
                      {/* Transfer Request — opens pre-composed SMS to the pharmacy */}
                      {med.pharmacyPhone && (
                        <View style={{ marginTop: 4 }}>
                          <TouchableOpacity
                            onPress={async () => {
                              const body = encodeURIComponent(
                                `Hi, I'd like to request a transfer for my prescription: ${med.name}${med.dose ? ` ${med.dose}` : ''}. Please contact my current pharmacy to arrange the transfer. Thank you.`
                              );
                              const sep = Platform.OS === 'ios' ? '&' : '?';
                              await Linking.openURL(`sms:${med.pharmacyPhone}${sep}body=${body}`).catch(() => {});
                              // Record the transfer date and refresh the display
                              await recordTransferRequest(med.id);
                              await refreshTransferDates();
                            }}
                            style={styles.callPharmacyBtn}
                          >
                            <Text style={[styles.callPharmacyText, { color: '#8B5CF6' }]}>
                              💬 Request Transfer
                            </Text>
                          </TouchableOpacity>
                          {lastTransferMap[med.id] && (
                            <Text style={[styles.lastRequestedNote, { color: colors.muted }]}>
                              Last requested: {lastTransferMap[med.id]}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* ── Set Pharmacy inline editor ── */}
                {pharmacyEditorMedId === med.id ? (
                  <View style={{ marginBottom: 8, padding: 10, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.foreground, marginBottom: 6 }}>🏥 Set Pharmacy</Text>
                    {/* Name field with autocomplete suggestions */}
                    <TextInput
                      value={pharmacyEditorName}
                      onChangeText={async (t) => {
                        setPharmacyEditorName(t);
                        if (t.trim().length >= 2) {
                          const s = await searchPharmacies(t).catch(() => []);
                          setPharmacySuggestions(s.slice(0, 4));
                        } else {
                          setPharmacySuggestions([]);
                        }
                      }}
                      placeholder={t.pharmacyNamePlaceholder ?? 'Pharmacy name'}
                      placeholderTextColor={colors.muted}
                      style={{ fontSize: 13, color: colors.foreground, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}
                      returnKeyType="next"
                    />
                    {pharmacySuggestions.length > 0 && (
                      <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 7, borderWidth: 1, borderColor: colors.border, marginBottom: 4, overflow: 'hidden' }}>
                        {pharmacySuggestions.map((s, si) => (
                          <TouchableOpacity
                            key={si}
                            onPress={() => {
                              setPharmacyEditorName(s.name);
                              setPharmacyEditorPhone(s.phone || '');
                              setPharmacyEditorAddress(s.address || '');
                              setPharmacyEditorHours(s.hours || '');
                              setPharmacySuggestions([]);
                            }}
                            style={{ paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: si < pharmacySuggestions.length - 1 ? 1 : 0, borderBottomColor: colors.border }}
                          >
                            <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '600' }}>{s.name}</Text>
                            {s.phone ? <Text style={{ fontSize: 11, color: colors.muted }}>{s.phone}</Text> : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <TextInput
                      value={pharmacyEditorPhone}
                      onChangeText={setPharmacyEditorPhone}
                      placeholder={t.phoneNumberPlaceholder ?? 'Phone number'}
                      placeholderTextColor={colors.muted}
                      keyboardType="phone-pad"
                      style={{ fontSize: 13, color: colors.foreground, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}
                      returnKeyType="next"
                    />
                    <TextInput
                      value={pharmacyEditorAddress}
                      onChangeText={setPharmacyEditorAddress}
                      placeholder={t.streetAddressPlaceholder ?? 'Street address'}
                      placeholderTextColor={colors.muted}
                      style={{ fontSize: 13, color: colors.foreground, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}
                      returnKeyType="next"
                    />
                    <TextInput
                      value={pharmacyEditorHours}
                      onChangeText={setPharmacyEditorHours}
                      placeholder={t.hoursPlaceholder ?? 'Hours e.g. "Mon-Fri 9AM-9PM"'}
                      placeholderTextColor={colors.muted}
                      style={{ fontSize: 13, color: colors.foreground, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}
                      returnKeyType="done"
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={async () => {
                          if (!pharmacyEditorName.trim()) return;
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          // Upsert into pharmacy store
                          await upsertPharmacy(pharmacyEditorName, pharmacyEditorPhone, pharmacyEditorAddress, pharmacyEditorHours).catch(() => {});
                          // Update the medication record with the new pharmacy fields
                          const updated: Medication = {
                            ...med,
                            pharmacyName: pharmacyEditorName.trim(),
                            pharmacyPhone: pharmacyEditorPhone.trim() || undefined,
                            pharmacyAddress: pharmacyEditorAddress.trim() || undefined,
                          };
                          onUpdateMed(updated);
                          // Refresh pharmacy hours map
                          getAllPharmacies().then((entries) => {
                            const todayMap: Record<string, string | undefined> = {};
                            const fullMap: Record<string, (string | undefined)[] | undefined> = {};
                            for (const entry of entries) {
                              const key = normalizePharmacyName(entry.name);
                              todayMap[key] = getOpenTodayHours(entry.hours);
                              fullMap[key] = parseAllDayHours(entry.hours);
                            }
                            setPharmacyHoursMap(todayMap);
                            setPharmacyFullHoursMap(fullMap);
                          }).catch(() => {});
                          setPharmacyEditorMedId(null);
                          setPharmacySuggestions([]);
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '700' }}>Save Pharmacy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setPharmacyEditorMedId(null); setPharmacySuggestions([]); }}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700' }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setPharmacyEditorName(med.pharmacyName || '');
                      setPharmacyEditorPhone(med.pharmacyPhone || '');
                      setPharmacyEditorAddress((med as any).pharmacyAddress || '');
                      setPharmacyEditorHours('');
                      setPharmacySuggestions([]);
                      setPharmacyEditorMedId(med.id);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? '#0F172A50' : '#F8FAFC' }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={{ fontSize: 12 }}>🏥</Text>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600', flex: 1 }}>
                      {med.pharmacyName ? `Edit: ${med.pharmacyName}` : 'Set Pharmacy'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>›</Text>
                  </TouchableOpacity>
                )}

                {/* Start / End dates */}
                {(med.startDate || med.endDate) && (
                  <View style={styles.detailRow}>
                    <IconSymbol name="calendar" size={14} color={colors.primary} />
                    <Text style={[styles.detailText, { color: colors.foreground }]}>
                      {med.startDate ?? '—'} → {med.endDate ?? 'Ongoing'}
                    </Text>
                  </View>
                )}

                {/* Rx Number + Refills Remaining */}
                {(!!med.rxNumber || med.refillsRemaining !== undefined) && (
                  <View style={styles.detailRow}>
                    <IconSymbol name="number" size={14} color={colors.primary} />
                    <Text style={[styles.detailText, { color: colors.foreground }]}>
                      {med.rxNumber ? `Rx #${med.rxNumber}` : ''}
                      {med.rxNumber && med.refillsRemaining !== undefined ? '  ·  ' : ''}
                      {med.refillsRemaining !== undefined ? `${med.refillsRemaining} refill${med.refillsRemaining !== 1 ? 's' : ''} left` : ''}
                    </Text>
                  </View>
                )}

                {/* Notes */}
                {!!med.notes && (
                  <View style={styles.detailRow}>
                    <IconSymbol name="note.text" size={14} color={colors.primary} />
                    <Text style={[styles.detailText, { color: colors.foreground }]}>{med.notes}</Text>
                  </View>
                )}

                {/* Side Effects */}
                <View style={styles.aiSection}>
                  <View style={styles.aiSectionHeader}>
                    <IconSymbol name="sparkles" size={14} color={colors.primary} />
                    <Text style={[styles.aiSectionTitle, { color: colors.foreground }]}>Side Effects</Text>
                    <Pressable
                      onPress={() => onRefreshAI(med)}
                      style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[styles.refreshBtnText, { color: colors.primary }]}>
                        {med.sideEffects ? 'Refresh' : 'Load Smart Data'}
                      </Text>
                    </Pressable>
                  </View>
                  {med.sideEffects && med.sideEffects.length > 0 ? (
                    <>
                      {(['common', 'uncommon', 'rare'] as const).map((freq) => {
                        const effects = med.sideEffects!.filter((s) => s.frequency === freq);
                        if (!effects.length) return null;
                        return (
                          <View key={freq} style={styles.sideEffectGroup}>
                            <Text style={[styles.sideEffectFreq, { color: colors.muted }]}>
                              {freq.charAt(0).toUpperCase() + freq.slice(1)}
                            </Text>
                            {effects.map((s, i) => (
                              <View key={i} style={styles.sideEffectRow}>
                                <View style={[styles.sideEffectDot, {
                                  backgroundColor: freq === 'common' ? colors.warning : freq === 'uncommon' ? colors.primary : colors.error,
                                }]} />
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.sideEffectName, { color: colors.foreground }]}>{s.name}</Text>
                                  {s.description && (
                                    <Text style={[styles.sideEffectDesc, { color: colors.muted }]}>{s.description}</Text>
                                  )}
                                </View>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </>
                  ) : (
                    <Text style={[styles.aiPlaceholder, { color: colors.muted }]}>
                      Tap &quot;Load Smart Data&quot; to generate side effects for {med.name}.
                    </Text>
                  )}
                </View>

                {/* Drug Interactions */}
                <View style={styles.aiSection}>
                  <View style={styles.aiSectionHeader}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={14} color={colors.error} />
                    <Text style={[styles.aiSectionTitle, { color: colors.foreground }]}>Drug Interactions</Text>
                  </View>
                  {med.drugInteractions && med.drugInteractions.length > 0 ? (
                    <>
                      {med.drugInteractions.map((ix, i) => (
                        <View key={i} style={[styles.interactionRow, { borderLeftColor: ix.severity === 'major' ? colors.error : ix.severity === 'moderate' ? colors.warning : colors.muted }]}>
                          <View style={styles.interactionHeader}>
                            <Text style={[styles.interactionDrug, { color: colors.foreground }]}>{ix.drug}</Text>
                            <View style={[styles.severityBadge, {
                              backgroundColor: ix.severity === 'major' ? colors.error + '22' : ix.severity === 'moderate' ? colors.warning + '22' : colors.muted + '22',
                            }]}>
                              <Text style={[styles.severityText, {
                                color: ix.severity === 'major' ? colors.error : ix.severity === 'moderate' ? colors.warning : colors.muted,
                              }]}>
                                {ix.severity} · {ix.source.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.interactionDesc, { color: colors.muted }]}>{ix.description}</Text>
                        </View>
                      ))}
                    </>
                  ) : (
                    <Text style={[styles.aiPlaceholder, { color: colors.muted }]}>
                      Tap &quot;Load Smart Data&quot; on Side Effects to also check interactions with your other medications.
                    </Text>
                  )}
                </View>

                {/* Refill Threshold — inline +/- stepper */}
                <View style={[styles.detailRow, { alignItems: 'center' }]}>
                  <IconSymbol name="pills.fill" size={14} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailText, { color: colors.foreground }]}>Refill reminder</Text>
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>Alert when supply drops to this level</Text>
                  </View>
                  {/* Inline stepper */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderRadius: 10, borderWidth: 1, borderColor: isDark ? '#D9770660' : '#FDE68A', overflow: 'hidden' }}>
                    <TouchableOpacity
                      onPress={async () => {
                        const current = med.refillAt ?? 7;
                        if (current <= 1) return;
                        const updated: Medication = { ...med, refillAt: current - 1 };
                        await onUpdateMed(updated);
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#FCD34D' : '#92400E', lineHeight: 18 }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FCD34D' : '#92400E', minWidth: 28, textAlign: 'center' }}>{med.refillAt ?? 7}</Text>
                    <TouchableOpacity
                      onPress={async () => {
                        const current = med.refillAt ?? 7;
                        if (current >= 90) return;
                        const updated: Medication = { ...med, refillAt: current + 1 };
                        await onUpdateMed(updated);
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#FCD34D' : '#92400E', lineHeight: 18 }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.muted, marginLeft: 4 }}>doses</Text>
                </View>

                {/* Known Allergies */}
                {(() => {
                  // Show drug/food allergies that might be relevant to this medication
                  const relevantAllergies = allergies.filter(a =>
                    a.category === 'drug' || a.category === 'food' || a.category === 'other'
                  );
                  if (relevantAllergies.length === 0) return null;
                  return (
                    <View style={[styles.aiSection, { marginTop: 4 }]}>
                      <View style={styles.aiSectionHeader}>
                        <Text style={{ fontSize: 14 }}>⚠️</Text>
                        <Text style={[styles.aiSectionTitle, { color: colors.error }]}>Known Allergies</Text>
                      </View>
                      {relevantAllergies.map((allergy) => (
                        <View
                          key={allergy.id}
                          style={[styles.interactionRow, {
                            borderLeftColor:
                              allergy.severity === 'severe' ? colors.error :
                              allergy.severity === 'moderate' ? colors.warning :
                              colors.muted,
                          }]}
                        >
                          <View style={styles.interactionHeader}>
                            <Text style={[styles.interactionDrug, { color: colors.foreground }]}>
                              {allergy.allergen}
                            </Text>
                            <View style={[styles.severityBadge, {
                              backgroundColor:
                                allergy.severity === 'severe' ? colors.error + '22' :
                                allergy.severity === 'moderate' ? colors.warning + '22' :
                                colors.muted + '22',
                            }]}>
                              <Text style={[styles.severityText, {
                                color:
                                  allergy.severity === 'severe' ? colors.error :
                                  allergy.severity === 'moderate' ? colors.warning :
                                  colors.muted,
                              }]}>
                                {allergy.severity} · {allergy.category}
                              </Text>
                            </View>
                          </View>
                          {!!allergy.reaction && (
                            <Text style={[styles.interactionDesc, { color: colors.muted }]}>
                              {allergy.reaction}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            )}
          </GlassCard>
          </View>
        );
      }}
    />
    {/* Refill Threshold Editor Modal */}

    <Modal
      visible={refillThresholdMed !== null}
      transparent
      animationType="slide"
      onRequestClose={() => setRefillThresholdMed(null)}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={[
          { backgroundColor: isDark ? '#1e2022' : '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, borderTopWidth: 1, borderColor: isDark ? '#334155' : '#E5E7EB' },
        ]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#ECEDEE' : '#11181C' }}>
              Refill Reminder Threshold
            </Text>
            <Pressable onPress={() => setRefillThresholdMed(null)} hitSlop={12}>
              <IconSymbol name="xmark.circle.fill" size={24} color={isDark ? '#9BA1A6' : '#687076'} />
            </Pressable>
          </View>
          {refillThresholdMed && (
            <Text style={{ fontSize: 13, color: isDark ? '#9BA1A6' : '#687076', marginBottom: 16 }}>
              Alert when <Text style={{ fontWeight: '700', color: isDark ? '#ECEDEE' : '#11181C' }}>{refillThresholdMed.name}</Text> supply drops to or below this number of doses.
            </Text>
          )}
          {/* Preset chips */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[3, 5, 7, 10, 14, 30].map((n) => {
              const selected = refillThresholdValue === String(n);
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRefillThresholdValue(String(n))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: selected ? (isDark ? '#0a7ea4' : '#0a7ea4') : (isDark ? '#2a2d2f' : '#F3F4F6'),
                    borderWidth: 1,
                    borderColor: selected ? '#0a7ea4' : (isDark ? '#334155' : '#E5E7EB'),
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '400', color: selected ? '#fff' : (isDark ? '#ECEDEE' : '#11181C') }}>
                    {n} doses
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Custom input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Text style={{ fontSize: 13, color: isDark ? '#9BA1A6' : '#687076' }}>Custom:</Text>
            <TextInput
              value={refillThresholdValue}
              onChangeText={(v) => setRefillThresholdValue(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              returnKeyType="done"
              style={{
                flex: 1, height: 40, borderRadius: 10, borderWidth: 1,
                borderColor: isDark ? '#334155' : '#E5E7EB',
                backgroundColor: isDark ? '#2a2d2f' : '#F9FAFB',
                color: isDark ? '#ECEDEE' : '#11181C',
                paddingHorizontal: 12, fontSize: 15,
              }}
              placeholder="e.g. 14"
              placeholderTextColor={isDark ? '#9BA1A6' : '#687076'}
            />
            <Text style={{ fontSize: 13, color: isDark ? '#9BA1A6' : '#687076' }}>doses</Text>
          </View>
          {/* Save button */}
          <TouchableOpacity
            onPress={async () => {
              if (!refillThresholdMed) return;
              const newThreshold = parseInt(refillThresholdValue, 10);
              if (isNaN(newThreshold) || newThreshold < 1) {
                Alert.alert('Invalid value', 'Please enter a number of 1 or more.');
                return;
              }
              const updated: Medication = { ...refillThresholdMed, refillAt: newThreshold };
              await onUpdateMed(updated);
              setRefillThresholdMed(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            style={{
              backgroundColor: '#0a7ea4', borderRadius: 14, paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Save Threshold</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
function MedicationsScreenInner() {
  const medsScrollRef = React.useRef<import('react-native').FlatList<any>>(null);
  const { showScrollTop: showMedsScrollTop, scrollTopOpacity: medsScrollTopOpacity, handleScroll: handleMedsScroll, scrollToTop: medsScrollToTop } = useScrollToTop(medsScrollRef, 'flatlist');
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { goal: adherenceGoal, setGoal: setAdherenceGoal } = useAdherenceGoal();
  const [adherenceGoalEditorVisible, setAdherenceGoalEditorVisible] = useState(false);
  const [adherenceGoalEditorValue, setAdherenceGoalEditorValue] = useState('');
  const lang = useLang();
  const rawLang = useRawLang();
  const isRTL = isRTLLang(rawLang);
  const { checkAndShow: checkUpsell, UpsellSheet } = useUpsell();
  const { isPremium: isMedPremium } = useSubscription();
  const { requirePremium: requireAdherencePremium, PremiumGateSheet: AdherenceGateSheet } = usePremiumGate();
  const { state: healthState } = useHealth();
  const allergies: AllergyRecord[] = healthState.data?.allergies ?? [];
  const t = ((medicationStrings as unknown as Record<string, typeof medicationStrings.en>)[lang] ?? medicationStrings.en);
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [meds, setMeds] = useState<MedicationStore>([]);
  // Configurable low-stock threshold (default 7 pills); loaded from AsyncStorage
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  // Default to 'mymeds' tab (first tab); honour ?filter=today deep-link from Smart Reminders
  const [activeTab, setActiveTab] = useState<TabId>('mymeds');
  // Controls the initial filter pre-selected when switching to the History tab programmatically
  const [historyInitialFilter, setHistoryInitialFilter] = useState<HistoryFilter>('all');
  // Optional date range pre-filter for the History tab (set when tapping a sparkline bar)
  const [historyInitialDateStart, setHistoryInitialDateStart] = useState<string | undefined>(undefined);
  const [historyInitialDateEnd, setHistoryInitialDateEnd] = useState<string | undefined>(undefined);
  // Key of the dose card to highlight after a reschedule (medId-scheduledTime)
  const [highlightedDoseKey, setHighlightedDoseKey] = useState<string | null>(null);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending missed note prompt: holds the medId/scheduledTime while user enters a reason
  const [pendingMissedNote, setPendingMissedNote] = useState<{ medId: string; scheduledTime: string } | null>(null);
  const [missedNoteText, setMissedNoteText] = useState('');
  const MISSED_REASONS = [t.skipReasonForgot, t.skipReasonSideEffects, t.skipReasonRanOut, t.skipReasonFeelingBetter, t.skipReasonOther];

  // Persist & restore the last active tab
  useEffect(() => {
    AsyncStorage.getItem(MED_ACTIVE_TAB_KEY).then(v => {
      if (v === 'today' || v === 'history' || v === 'mymeds') setActiveTab(v as TabId);
    }).catch(() => {});
    // Load persisted low-stock threshold
    AsyncStorage.getItem(LOW_STOCK_THRESHOLD_KEY).then(v => {
      const n = parseInt(v ?? '', 10);
      if (!isNaN(n) && n >= 1 && n <= 999) setLowStockThreshold(n);
    }).catch(() => {});
   
  }, []);

  const setActiveTabPersisted = useCallback((tab: TabId) => {
    setActiveTab(tab);
    safeSetItem(MED_ACTIVE_TAB_KEY, tab).catch(() => {});
  }, []);

  // Pulse animation for Today tab when opened via deep-link
  const todayTabPulse = React.useRef(new RNAnimated.Value(1)).current;
  // When the screen is re-focused with filter=today/history, switch to the correct tab
  useEffect(() => {
    if (filter === 'today') {
      setActiveTabPersisted('today');
      // 3-cycle pulse to draw the user's eye to the Today tab
      RNAnimated.sequence([
        RNAnimated.timing(todayTabPulse, { toValue: 1.18, duration: 160, useNativeDriver: true }),
        RNAnimated.timing(todayTabPulse, { toValue: 0.92, duration: 120, useNativeDriver: true }),
        RNAnimated.timing(todayTabPulse, { toValue: 1.12, duration: 140, useNativeDriver: true }),
        RNAnimated.timing(todayTabPulse, { toValue: 0.96, duration: 100, useNativeDriver: true }),
        RNAnimated.timing(todayTabPulse, { toValue: 1.06, duration: 120, useNativeDriver: true }),
        RNAnimated.timing(todayTabPulse, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
      ]).start();
    } else if (filter === 'history') {
      setActiveTabPersisted('history');
    } else if (filter === 'mymeds') {
      setActiveTabPersisted('mymeds');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, todayTabPulse]);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  // Track the most recently saved medication id for green flash in My Meds
  const [newMedId, setNewMedId] = useState<string | null>(null);

  // ── Undo Taken toast state ─────────────────────────────────────────────────
  // ── Undo Missed toast state ───────────────────────────────────────────────
  // Stores the last taken dose so the user can undo within 5 minutes
  const [undoTaken, setUndoTaken] = useState<{
    medId: string;
    logId: string;
    medName: string;
    scheduledTime: string;
    expiresAt: number; // Date.now() + 5 * 60 * 1000
  } | null>(null);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reanimated shared values for slide-up/fade animation
  const undoToastTranslateY = useSharedValue(80);
  const undoToastOpacity = useSharedValue(0);
  const undoToastAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: undoToastTranslateY.value }],
    opacity: undoToastOpacity.value,
  }));
  // Live countdown seconds remaining (5 min = 300 s)
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(300);
  const undoCountdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Undo Missed toast state ─────────────────────────────────────────────────
  const [undoMissed, setUndoMissed] = useState<{
    medId: string;
    logId: string;
    medName: string;
    scheduledTime: string;
    expiresAt: number;
  } | null>(null);
  const undoMissedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoMissedToastTranslateY = useSharedValue(80);
  const undoMissedToastOpacity = useSharedValue(0);
  const undoMissedToastAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: undoMissedToastTranslateY.value }],
    opacity: undoMissedToastOpacity.value,
  }));
  const [undoMissedSecondsLeft, setUndoMissedSecondsLeft] = useState(300);
  const undoMissedCountdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Edit dose time modal state ────────────────────────────────────────────
  const [editTimeTarget, setEditTimeTarget] = useState<{ medId: string; logId: string; currentTime: string } | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');

  // ── Reschedule confirmation toast state ────────────────────────────────────
  const [rescheduleToastMsg, setRescheduleToastMsg] = useState<string | null>(null);
  const rescheduleToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDose, setFormDose] = useState('');
  const [formForm, setFormForm] = useState<MedicationForm>('tablet');
  const [formFreq, setFormFreq] = useState<MedicationFrequency>('daily');
  const [formTimes, setFormTimes] = useState<string[]>(['08:00']);
  const [formQuantity, setFormQuantity] = useState('30');
  const [formRefillAt, setFormRefillAt] = useState('7');
  const [formColor, setFormColor] = useState(MED_COLORS[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formPharmacyName, setFormPharmacyName] = useState('');
  const [formPharmacyPhone, setFormPharmacyPhone] = useState('');
  const [formPharmacyAddress, setFormPharmacyAddress] = useState('');
  const [formRxNumber, setFormRxNumber] = useState('');
  const [formRefillsRemaining, setFormRefillsRemaining] = useState('');
  const pharmacyRef = React.useRef<PharmacyAutocompleteHandle>(null);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formRefillDate, setFormRefillDate] = useState('');
  // Picker sheet visibility for date fields
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showRefillDatePicker, setShowRefillDatePicker] = useState(false);
  const [formIndication, setFormIndication] = useState('');
  const [formSafeDosage, setFormSafeDosage] = useState('');
  const [formRoute, setFormRoute] = useState<MedicationRoute>('oral');
  const [formGenericName, setFormGenericName] = useState('');
  // New extended medication fields
  const [formDoseUnit, setFormDoseUnit] = useState('');
  const [formPrescriber, setFormPrescriber] = useState('');
  const [formFillDate, setFormFillDate] = useState<Date | null>(null);
  const [formRefillCounty, setFormRefillCounty] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formDaysSupply, setFormDaysSupply] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  // Drug autocomplete state
  const [drugSuggestions, setDrugSuggestions] = useState<{
    name: string; genericName: string; indication: string;
    safeDosage: string; minDose: number | null; maxDose: number | null;
    doseUnit: string; typicalDose: string;
    routes: { label: string; emoji: string }[];
  }[]>([]);
  // Safe dose range for the currently selected medication (null = unknown)
  const [doseSafeRange, setDoseSafeRange] = useState<{ min: number | null; max: number | null; unit: string; label: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingDrugs, setSearchingDrugs] = useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Insight mutations
  const sideEffectsMutation = trpc.medication.getSideEffects.useMutation();
  const interactionsMutation = trpc.medication.getInteractions.useMutation();
   const searchDrugsMutation = trpc.medication.searchDrugs.useMutation();
  // Post-save interaction check banner state
  const [postSaveInteractionResult, setPostSaveInteractionResult] = useState<{
    newMedName: string;
    interactions: { drug: string; drug1?: string; drug2?: string; severity: string; description: string }[];
    disclaimer: string;
  } | null>(null);
  const [selectedInteractionPair, setSelectedInteractionPair] = useState<{
    drug1: string; drug2: string; severity: string;
  } | null>(null);
  const interactionDetailMutation = trpc.medication.getInteractions.useMutation();
  // Smart Scribe state
  const [scribeLoading, setScribeLoading] = useState(false);
  const [ocrReviewFields, setOcrReviewFields] = useState<OcrReviewField[] | null>(null);
  const [scribeScanMethod, setScribeScanMethod] = useState<'smart' | 'ocr'>('ocr');
  // Prescription scan overlay state
  const [rxScanOverlayVisible, setRxScanOverlayVisible] = useState(false);
  const [rxScanImageUri, setRxScanImageUri] = useState<string>('');
  const [rxScanProgress, setRxScanProgress] = useState(0);
  const [rxScanError, setRxScanError] = useState<string | null>(null);
  const [rxScanPartialData, setRxScanPartialData] = useState<import('@/components/medical-scan-analysis-overlay').PartialScanData | undefined>(undefined);
  const rxScanPartialResultRef = React.useRef<Parameters<typeof applyScribeResult>[0] | null>(null);
  const [rxScanSteps, setRxScanSteps] = useState<ScanStep[]>([
    { id: 'capture',  label: 'Image captured',            status: 'pending' },
    { id: 'upload',   label: 'Analyzing prescription',    status: 'pending' },
    { id: 'reading',  label: 'Reading prescription label', status: 'pending' },
    { id: 'extract',  label: 'Extracting medication fields', status: 'pending' },
    { id: 'validate', label: 'Validating extracted data',  status: 'pending' },
  ]);
  const updateRxStep = React.useCallback((id: string, status: ScanStep['status']) => {
    setRxScanSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribeVoiceError, setScribeVoiceError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribeConfidence, setScribeConfidence] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribedFields, setScribedFields] = useState<string[]>([]);
  const scribeHighlight = React.useRef(new RNAnimated.Value(0)).current;

  const flashScribeHighlight = React.useCallback(() => {
    scribeHighlight.setValue(1);
    RNAnimated.timing(scribeHighlight, { toValue: 0, duration: 1800, useNativeDriver: false }).start();
  }, [scribeHighlight]);

  const applyScribeResult = React.useCallback((result: {
    name: string | null; genericName: string | null; dose: string | null;
    form: string | null; frequency: string | null; scheduleTimes: string[] | null;
    route: string | null; indication: string | null; prescriber?: string | null;
    pharmacyName: string | null; pharmacyPhone: string | null;
    quantity: number | null; refillAt: number | null; notes: string | null;
    rxNumber?: string | null; startDate?: string | null; refillsRemaining?: number | null;
    confidence: number; fieldsFound: string[];
  }) => {
    const filled: string[] = [];
    if (result.name) { setFormName(result.name); filled.push('name'); }
    if (result.genericName) { setFormGenericName(result.genericName); filled.push('genericName'); }
    if (result.dose) { setFormDose(result.dose); filled.push('dose'); }
    if (result.form && ['tablet','capsule','liquid','injection','patch','inhaler','drops','other'].includes(result.form)) {
      setFormForm(result.form as MedicationForm); filled.push('form');
    }
    if (result.frequency && ['daily','twice_daily','three_times_daily','four_times_daily','weekly','as_needed','custom'].includes(result.frequency)) {
      setFormFreq(result.frequency as MedicationFrequency); filled.push('frequency');
    }
    if (result.scheduleTimes && result.scheduleTimes.length > 0) {
      setFormTimes(result.scheduleTimes); filled.push('scheduleTimes');
    }
    if (result.route) { setFormRoute(result.route as MedicationRoute); filled.push('route'); }
    if (result.indication) { setFormIndication(result.indication); filled.push('indication'); }
    // prescriber → store in indication if indication is empty, else append to notes
    if (result.prescriber) {
      if (!formIndication.trim()) { setFormIndication(`Prescribed by Dr. ${result.prescriber}`); filled.push('indication'); }
      else { /* already filled */ }
    }
    if (result.pharmacyName) { setFormPharmacyName(result.pharmacyName); filled.push('pharmacyName'); }
    if (result.pharmacyPhone) { setFormPharmacyPhone(result.pharmacyPhone); filled.push('pharmacyPhone'); }
    if (result.quantity !== null) { setFormQuantity(String(result.quantity)); filled.push('quantity'); }
    if (result.refillAt !== null) { setFormRefillAt(String(result.refillAt)); filled.push('refillAt'); }
    // rxNumber → dedicated field
    if (result.rxNumber) {
      setFormRxNumber(result.rxNumber);
      filled.push('rxNumber');
    }
    // refillsRemaining → dedicated field
    if (result.refillsRemaining !== null && result.refillsRemaining !== undefined) {
      setFormRefillsRemaining(String(result.refillsRemaining));
      filled.push('refillsRemaining');
    }
    if (result.notes) { setFormNotes(prev => prev ? `${prev}\n${result.notes}` : result.notes!); filled.push('notes'); }
    // startDate → fill formStartDate if empty
    if (result.startDate) { setFormStartDate(result.startDate); filled.push('startDate'); }
    // New extended fields
    if ((result as any).doseUnit && !formDoseUnit.trim()) { setFormDoseUnit((result as any).doseUnit); filled.push('doseUnit'); }
    if ((result as any).prescriber && !formPrescriber.trim()) { setFormPrescriber((result as any).prescriber); filled.push('prescriber'); }
    if ((result as any).fillDate && !formFillDate) {
      const fd = new Date((result as any).fillDate);
      if (!isNaN(fd.getTime())) { setFormFillDate(fd); filled.push('fillDate'); }
    }
    if ((result as any).refillCounty && !formRefillCounty.trim()) { setFormRefillCounty((result as any).refillCounty); filled.push('refillCounty'); }
    if ((result as any).reason && !formReason.trim()) { setFormReason((result as any).reason); filled.push('reason'); }
    setScribeConfidence(result.confidence);
    setScribedFields(filled);
    flashScribeHighlight();
    flashFields(filled);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashScribeHighlight, formIndication, setFormName, setFormGenericName, setFormDose, setFormForm, setFormFreq, setFormTimes, setFormRoute, setFormIndication, setFormPharmacyName, setFormPharmacyPhone, setFormQuantity, setFormRefillAt, setFormNotes, setFormStartDate, setFormRxNumber, setFormRefillsRemaining]);

  // Gemini Vision replaces the tRPC server call for prescription scanning
  const scribePhotoMutation = null; // kept for type safety, unused

  const handleScribePhoto = React.useCallback(async () => {
    try {
      const perm = await SafeImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to scan prescriptions.');
        return;
      }
      const result = await SafeImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.9,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setScribeLoading(true);
      try {
        let scribeResult: Parameters<typeof applyScribeResult>[0];
        let usedLlm = false;

        // ── Primary path: Gemini Vision API (direct, no server needed) ──────
        if (asset.base64) {
          try {
            const { geminiScribePrescription } = await import('@/lib/medication/gemini-scribe');
            const llmResult = await geminiScribePrescription(asset.base64, 'image/jpeg');
            scribeResult = llmResult;
            usedLlm = true;
          } catch (llmErr) {
            console.warn('[Prescription Scan] Gemini Vision failed, falling back to Apple Vision OCR:', llmErr);
          }
        }

        // ── Fallback: Apple Vision OCR + local regex parser ───────────────────
        if (!usedLlm) {
          const lines = await extractTextFromImage(asset.uri);
          const rawText = lines.join(' ');
          const parsed = parseMedicationTranscript(rawText);
          const fieldsFound: string[] = [];
          if (parsed.name) fieldsFound.push('name');
          if (parsed.dose) fieldsFound.push('dose');
          if (parsed.frequency) fieldsFound.push('frequency');
          if (parsed.route) fieldsFound.push('route');
          if (parsed.indication) fieldsFound.push('indication');
          if (parsed.prescriber) fieldsFound.push('prescriber');
          scribeResult = {
            name: parsed.name ?? null,
            genericName: null,
            dose: parsed.dose ?? null,
            form: null,
            frequency: parsed.frequency ?? null,
            scheduleTimes: null,
            route: parsed.route ?? null,
            indication: parsed.indication ?? null,
            prescriber: parsed.prescriber ?? null,
            pharmacyName: null,
            pharmacyPhone: null,
            quantity: null,
            refillAt: null,
            notes: parsed.note ?? null,
            confidence: 0.5,
            fieldsFound,
          };
        }

        applyScribeResult(scribeResult!);
        // Build diff-style review card fields
        const reviewFields: OcrReviewField[] = [
          { label: 'Medication Name', value: scribeResult!.name,       extracted: !!scribeResult!.name },
          { label: 'Dose',           value: scribeResult!.dose,       extracted: !!scribeResult!.dose },
          { label: 'Frequency',      value: scribeResult!.frequency,  extracted: !!scribeResult!.frequency },
          { label: 'Route',          value: scribeResult!.route,      extracted: !!scribeResult!.route },
          { label: 'Indication',     value: scribeResult!.indication, extracted: !!scribeResult!.indication },
          { label: 'Prescriber',     value: scribeResult!.prescriber, extracted: !!scribeResult!.prescriber },
          { label: 'Notes',          value: scribeResult!.notes,      extracted: !!scribeResult!.notes },
        ];
        if (scribeResult!.pharmacyName) reviewFields.push({ label: 'Pharmacy', value: scribeResult!.pharmacyName, extracted: true });
        if (scribeResult!.pharmacyPhone) reviewFields.push({ label: 'Pharmacy Phone', value: scribeResult!.pharmacyPhone, extracted: true });
        setScribeScanMethod(usedLlm ? 'smart' : 'ocr');
        setOcrReviewFields(reviewFields);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_unused) {
        Alert.alert('Scan Failed', 'Could not extract medication details from the image. Please fill in the form manually.');
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setScribeLoading(false);
      }
    } catch (_unused) {
      Alert.alert('Error', 'Could not open camera.');
    }
  }, [applyScribeResult]);

  const _showScribePicker = React.useCallback(() => {
    openPrescriptionScanner();
  }, [openPrescriptionScanner]);

  // ── Voice scribe handlers ──────────────────────────────────────────────────────
  // Audio voice scribe removed — use the keyboard dictation box (Gboard/iOS mic) instead
  const _handleScribeVoiceResult = React.useCallback((_base64: string) => {
    Alert.alert('Use Keyboard Dictation', "Tap the Dictate button and use your keyboard's microphone to speak your medication details.");
  }, []);

  // ── Live-dictation text box state ─────────────────────────────────────────────────────
  const [dictationText, setDictationText] = useState('');
  const { recentPhrases: _dictRecentPhrases, pushPhrase: pushDictPhrase } = useDictationHistory('medications');
  const MED_FLASH_FIELDS = ['name', 'dose', 'form', 'frequency', 'indication', 'startDate', 'pharmacyName', 'notes'];
  const { flash: flashFields, flashStyle: _medFlashStyle } = useFieldFlash(MED_FLASH_FIELDS);
  const [dictationParsing, setDictationParsing] = useState(false);
  const dictationInputRef = React.useRef<TextInput>(null);

  // ── Prescription scan (local OCR parser) state ────────────────────────────
  const [prescriptionScanText, setPrescriptionScanText] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCollapsed, setScanCollapsed] = useState(false);
  const isMounted = React.useRef(true);
  React.useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const handlePrescriptionScanComplete = React.useCallback(async (scanText?: string | null) => {
    try {
      if (!scanText?.trim()) {
        if (isMounted.current) setScanError("We couldn't read the label clearly. Try better lighting or enter details manually.");
        return;
      }
      if (isMounted.current) {
        setPrescriptionScanText(scanText);
        setScanError(null);
      }
      const parsed = parsePrescriptionScanText(scanText); const parsedConf: Record<string, number> = {};
      // Map ParsedMedicationScan fields to form state using fillEmptyOnly merge
      if (parsed.medicationName && !formName.trim()) setFormName(parsed.medicationName);
      if (parsed.dose && !formDose.trim()) setFormDose(parsed.dose);
      if (parsed.quantity && !formQuantity.trim()) setFormQuantity(parsed.quantity);
      if (parsed.prescriber && !formIndication.trim()) setFormIndication(parsed.prescriber);
      if (parsed.rxNumber && !formNotes.trim()) setFormNotes(`Rx #${parsed.rxNumber}`);
      if (parsed.pharmacy && !formPharmacyName.trim()) setFormPharmacyName(parsed.pharmacy);
      if (parsed.fillDate && !formFillDate) {
        const fd = new Date(parsed.fillDate);
        if (!isNaN(fd.getTime())) setFormFillDate(fd);
        else if (!formStartDate.trim()) setFormStartDate(parsed.fillDate);
      }
      if (parsed.reasonNote && !formReason.trim()) setFormReason(parsed.reasonNote);
      if (parsed.unit && !formDoseUnit.trim()) setFormDoseUnit(parsed.unit);
      if (parsed.prescriber && !formPrescriber.trim()) setFormPrescriber(parsed.prescriber);
      if (parsed.daysSupply && !formDaysSupply.trim()) setFormDaysSupply(parsed.daysSupply);
      // Route mapping
      if (parsed.route && !formRoute) {
        const routeMap: Record<string, MedicationRoute> = {
          'By mouth': 'oral', 'Subcutaneous': 'subq',
          'Topical': 'topical', 'Inhaled': 'inhaled',
        };
        const mapped = routeMap[parsed.route];
        if (mapped) setFormRoute(mapped);
      }
      // Frequency mapping
      if (parsed.frequency) {
        const freqMap: Record<string, MedicationFrequency> = {
          'Once daily': 'daily', 'Twice daily': 'twice_daily',
          'Three times daily': 'three_times_daily', 'Nightly': 'daily',
          'As directed': 'as_needed', 'Before meals': 'three_times_daily',
          'After meals': 'three_times_daily',
        };
        const mapped = freqMap[parsed.frequency];
        if (mapped) setFormFreq(mapped);
      }
      // Build prescription-specific review card with per-field confidence badges
      const prescriptionReviewFields: OcrReviewField[] = [
        { label: 'Medication Name', value: parsed.medicationName, extracted: !!parsed.medicationName, confidence: parsedConf.medicationName || undefined },
        { label: 'Dose',           value: parsed.dose,           extracted: !!parsed.dose,           confidence: parsedConf.dose || undefined },
        { label: 'Unit',           value: parsed.unit,           extracted: !!parsed.unit,           confidence: parsedConf.unit || undefined },
        { label: 'Route',          value: parsed.route,          extracted: !!parsed.route,          confidence: parsedConf.route || undefined },
        { label: 'Frequency',      value: parsed.frequency,      extracted: !!parsed.frequency,      confidence: parsedConf.frequency || undefined },
        { label: 'Quantity',       value: parsed.quantity,       extracted: !!parsed.quantity,       confidence: parsedConf.quantity || undefined },
        { label: 'Refills',        value: parsed.refills,        extracted: !!parsed.refills,        confidence: parsedConf.refills || undefined },
        { label: 'Rx Number',      value: parsed.rxNumber,       extracted: !!parsed.rxNumber,       confidence: parsedConf.rxNumber || undefined },
        { label: 'Fill Date',      value: parsed.fillDate,       extracted: !!parsed.fillDate,       confidence: parsedConf.fillDate || undefined },
        { label: 'Prescriber',     value: parsed.prescriber,     extracted: !!parsed.prescriber,     confidence: parsedConf.prescriber || undefined },
        { label: 'Pharmacy',       value: parsed.pharmacy,       extracted: !!parsed.pharmacy,       confidence: parsedConf.pharmacy || undefined },
        { label: 'Days Supply',    value: parsed.daysSupply,     extracted: !!parsed.daysSupply,     confidence: parsedConf.daysSupply || undefined },
        { label: 'Reason / Note',  value: parsed.reasonNote,     extracted: !!parsed.reasonNote,     confidence: parsedConf.reasonNote || undefined },
      ];
      setScribeScanMethod('ocr'); // openPrescriptionScanner uses OCR parser path
      setOcrReviewFields(prescriptionReviewFields);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flashScribeHighlight();
    } catch (error) {
      console.error('[Prescription Scan] failed', error);
      if (isMounted.current) setScanError('Prescription scan could not be processed. You can still enter details manually.');
    }
  }, [formName, formDose, formQuantity, formIndication, formNotes, formPharmacyName, formStartDate, formRoute, formReason, formDoseUnit, formPrescriber, formDaysSupply, formFillDate, flashScribeHighlight]);

  const openPrescriptionScanner = React.useCallback(async () => {
    try {
      const perm = await SafeImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to scan prescription labels.');
        return;
      }
      const result = await SafeImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.9,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // ── Show live analysis overlay ────────────────────────────────────────
      setRxScanImageUri(asset.uri);
      setRxScanSteps(INITIAL_RX_STEPS);
      setRxScanProgress(0);
      setRxScanError(null);
      setRxScanPartialData(undefined);
      rxScanPartialResultRef.current = null;
      setRxScanOverlayVisible(true);
      setScribeLoading(true);

      try {
        updateRxStep('capture', 'done');
        setRxScanProgress(20);
        updateRxStep('upload', 'active');

        let usedLlm = false;
        let reviewFields: OcrReviewField[] = [];

        // ── Primary: Gemini 2.5-flash Vision ──────────────────────────────
        if (asset.base64) {
          try {
            updateRxStep('upload', 'done');
            setRxScanProgress(40);
            updateRxStep('reading', 'active');

            const { parsePrescriptionWithGemini } = await import('@/lib/medication/gemini-prescription-parser');
            const result2 = await parsePrescriptionWithGemini(asset.base64, 'image/jpeg');

            updateRxStep('reading', 'done');
            setRxScanProgress(70);
            updateRxStep('extract', 'active');

            if (!result2.error && result2.medications.length > 0) {
              const med = result2.medications[0];
              // Store partial result for Manual Entry pre-population
              const partialScribeResult = {
                name: med.name || null,
                genericName: null,
                dose: med.dose || med.strength || null,
                form: null,
                frequency: med.frequency || null,
                scheduleTimes: null,
                route: med.route || null,
                indication: null,
                prescriber: med.prescriberName || null,
                pharmacyName: med.pharmacyName || null,
                pharmacyPhone: null,
                quantity: null,
                refillAt: null,
                notes: med.instructions || null,
                confidence: med.confidence ?? 0.8,
                fieldsFound: Object.entries(med).filter(([, v]) => v && v !== '').map(([k]) => k),
                rxNumber: null,
                startDate: null,
                refillsRemaining: null,
              };
              rxScanPartialResultRef.current = partialScribeResult;
              // Apply to form
              if (med.name && !formName.trim()) setFormName(med.name);
              if (med.strength && !formDose.trim()) setFormDose(med.strength);
              if (med.dose && !formDose.trim()) setFormDose(med.dose);
              if (med.instructions && !formNotes.trim()) setFormNotes(med.instructions);
              if (med.prescriberName && !formPrescriber.trim()) setFormPrescriber(med.prescriberName);
              if (med.pharmacyName && !formPharmacyName.trim()) setFormPharmacyName(med.pharmacyName);
              if (med.quantity && !formQuantity.trim()) setFormQuantity(med.quantity);
              if (med.refills) setFormDaysSupply(med.refills);
              // Frequency mapping
              if (med.frequency) {
                const freqLower = med.frequency.toLowerCase();
                if (freqLower.includes('twice') || freqLower.includes('bid')) setFormFreq('twice_daily');
                else if (freqLower.includes('three') || freqLower.includes('tid')) setFormFreq('three_times_daily');
                else if (freqLower.includes('once') || freqLower.includes('daily') || freqLower.includes('qd')) setFormFreq('daily');
                else if (freqLower.includes('needed') || freqLower.includes('prn')) setFormFreq('as_needed');
              }
              // Route mapping
              if (med.route) {
                const routeLower = med.route.toLowerCase();
                if (routeLower.includes('oral') || routeLower.includes('mouth')) setFormRoute('oral');
                else if (routeLower.includes('topical') || routeLower.includes('skin')) setFormRoute('topical');
                else if (routeLower.includes('inject') || routeLower.includes('subq') || routeLower.includes('im')) setFormRoute('subq');
                else if (routeLower.includes('inhal') || routeLower.includes('breath')) setFormRoute('inhaled');
              }
              // Build review fields
              reviewFields = [
                { label: 'Medication Name', value: med.name,          extracted: !!med.name,          confidence: med.confidence },
                { label: 'Strength',        value: med.strength,      extracted: !!med.strength,      confidence: med.confidence },
                { label: 'Dose',            value: med.dose,          extracted: !!med.dose,          confidence: med.confidence },
                { label: 'Frequency',       value: med.frequency,     extracted: !!med.frequency,     confidence: med.confidence },
                { label: 'Route',           value: med.route,         extracted: !!med.route,         confidence: med.confidence },
                { label: 'Quantity',        value: med.quantity,      extracted: !!med.quantity,      confidence: med.confidence },
                { label: 'Refills',         value: med.refills,       extracted: !!med.refills,       confidence: med.confidence },
                { label: 'Instructions',    value: med.instructions,  extracted: !!med.instructions,  confidence: med.confidence },
                { label: 'Prescriber',      value: med.prescriberName, extracted: !!med.prescriberName, confidence: med.confidence },
                { label: 'Pharmacy',        value: med.pharmacyName,  extracted: !!med.pharmacyName,  confidence: med.confidence },
              ].filter(f => f.value);
              // Store partial data for overlay display
              setRxScanPartialData({
                extractedItems: reviewFields.map(f => `${f.label}: ${f.value}`),
                extractedCount: reviewFields.length,
                totalCount: 10,
              });
              usedLlm = true;
            } else if (result2.error) {
              throw new Error(result2.error);
            }
          } catch (llmErr) {
            console.warn('[Prescription Scan] Gemini Vision failed, falling back to OCR:', llmErr);
            updateRxStep('reading', 'error');
          }
        }

        // ── Fallback: Apple Vision OCR ────────────────────────────────────
        if (!usedLlm) {
          updateRxStep('upload', 'done');
          setRxScanProgress(40);
          updateRxStep('reading', 'active');
          const lines = await extractTextFromImage(asset.uri);
          const rawText = lines.join(' ');
          updateRxStep('reading', 'done');
          setRxScanProgress(70);
          updateRxStep('extract', 'active');
          await handlePrescriptionScanComplete(rawText);
          const parsed = parseMedicationTranscript(rawText);
          reviewFields = [
            { label: 'Medication Name', value: parsed.name,      extracted: !!parsed.name },
            { label: 'Dose',           value: parsed.dose,      extracted: !!parsed.dose },
            { label: 'Frequency',      value: parsed.frequency, extracted: !!parsed.frequency },
            { label: 'Route',          value: parsed.route,     extracted: !!parsed.route },
            { label: 'Prescriber',     value: parsed.prescriber, extracted: !!parsed.prescriber },
          ].filter(f => f.value);
        }

        updateRxStep('extract', 'done');
        setRxScanProgress(90);
        updateRxStep('validate', 'active');

        // Validate at least one field was found
        if (reviewFields.length === 0) {
          throw new Error("We couldn't read the label clearly. Try better lighting or enter details manually.");
        }

        updateRxStep('validate', 'done');
        setRxScanProgress(100);
        setScribeScanMethod(usedLlm ? 'smart' : 'ocr');
        setOcrReviewFields(reviewFields);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Close overlay after short success pause
        setTimeout(() => {
          if (isMounted.current) setRxScanOverlayVisible(false);
        }, 600);

      } catch (err: any) {
        const msg = err?.message ?? "We couldn't read the label clearly. Try better lighting or enter details manually.";
        if (isMounted.current) {
          setRxScanError(msg);
          setScanError(msg);
          setRxScanSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
        }
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        if (isMounted.current) setScribeLoading(false);
      }
    } catch (_unused) {
      Alert.alert('Error', 'Could not open camera.');
    }
  }, [handlePrescriptionScanComplete, applyScribeResult, updateRxStep, formName, formDose, formNotes, formPrescriber, formPharmacyName, formQuantity]);

  const handleDictationSubmit = React.useCallback(async () => {
    const text = dictationText.trim();
    if (!text) return;
    setDictationParsing(true);
    try {
      const parsed = parseMedicationTranscript(text);
      // Map ParsedMedication to the shape applyScribeResult expects
      const fieldsFound = (['name','dose','frequency','route','indication','prescriber','note'] as const)
        .filter(k => parsed[k] != null);
      const confidence = fieldsFound.length > 0 ? fieldsFound.length / 7 : 0;
      applyScribeResult({
        name: parsed.name,
        genericName: null,
        dose: parsed.dose,
        form: null,
        frequency: parsed.frequency,
        scheduleTimes: null,
        route: parsed.route,
        indication: parsed.indication,
        prescriber: parsed.prescriber,
        pharmacyName: parsed.pharmacy ?? null,
        pharmacyPhone: null,
        quantity: parsed.quantity !== undefined ? Number(parsed.quantity) : null,
        refillAt: null,
        notes: parsed.note,
        rxNumber: parsed.rxNumber ?? null,
        startDate: null,
        refillsRemaining: null,
        confidence,
        fieldsFound: fieldsFound as unknown as string[],
        // Extended fields (cast through any since applyScribeResult uses a fixed shape)
        ...(parsed.unit ? { doseUnit: parsed.unit } : {}),
        ...(parsed.fillDate ? { fillDate: parsed.fillDate } : {}),
        ...(parsed.refillCounty ? { refillCounty: parsed.refillCounty } : {}),
        ...(parsed.reason ? { reason: parsed.reason } : {}),
      } as any);
      pushDictPhrase(text);
      setDictationText('');
      const pct = Math.round(confidence * 100);
      Alert.alert(
        'Prescription Parsed',
        `${fieldsFound.length} field${fieldsFound.length !== 1 ? 's' : ''} filled (${pct}% confidence). Review and correct before saving.`,
        [{ text: 'OK' }]
      );
    } catch (_unused) {
      Alert.alert('Parse Failed', 'Could not extract medication details. Please fill in the form manually.');
    } finally {
      setDictationParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationText, applyScribeResult]);

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [loaded, disc] = await Promise.all([
        loadMedications(),
        loadDisclaimerAccepted(),
      ]);
      setMeds(loaded);
      if (!disc) setShowDisclaimer(true);
      setLoading(false);
    })();
  }, []);

  // ── Reload when tab comes into focus (e.g. after Smart Reminder action) ────
  useFocusEffect(
    useCallback(() => {
      loadMedications().then(setMeds).catch(() => {});
    }, [])
  );

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  const handleAcceptDisclaimer = useCallback(async () => {
    await saveDisclaimerAccepted();
    setShowDisclaimer(false);
  }, []);

  // ── Drug name autocomplete ─────────────────────────────────────────────────
  const handleNameChange = useCallback((text: string) => {
    setFormName(text);
    setShowSuggestions(false);
    // Auto-populate indication from local lookup when user types (editable)
    const localIndication = lookupIndication(text);
    if (localIndication) {
      setFormIndication(localIndication);
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length >= 3) {
      searchTimeoutRef.current = setTimeout(async () => {
        setSearchingDrugs(true);
        try {
          const result = await searchDrugsMutation.mutateAsync({ query: text.trim() });
          setDrugSuggestions(result.drugs as any);
          setShowSuggestions(result.drugs.length > 0);
          // Drug database result overrides local lookup if available
          if (result.drugs.length > 0 && result.drugs[0].indication) {
            setFormIndication(result.drugs[0].indication);
          }
        } catch (_unused) {
          setDrugSuggestions([]);
          setShowSuggestions(false);
        } finally {
          setSearchingDrugs(false);
        }
      }, 500);
    } else {
      setDrugSuggestions([]);
    }
  }, [searchDrugsMutation]);

  const handleSelectDrug = useCallback((drug: {
    name: string; genericName: string; indication: string;
    safeDosage: string; minDose: number | null; maxDose: number | null;
    doseUnit: string; typicalDose: string;
    routes: { label: string; emoji: string }[];
  }) => {
    setFormName(drug.name);
    setFormGenericName(drug.genericName);
    setFormIndication(drug.indication);
    setFormSafeDosage(drug.safeDosage);
    // Auto-populate dose with typical dose if field is empty
    if (drug.typicalDose && !formDose.trim()) {
      // Extract numeric part for the dose field, unit for the unit field
      const doseMatch = drug.typicalDose.match(/^([\d.]+)\s*(.*)$/);
      if (doseMatch) {
        setFormDose(doseMatch[1]);
        if (doseMatch[2] && !formDoseUnit.trim()) setFormDoseUnit(doseMatch[2].trim());
      } else {
        setFormDose(drug.typicalDose);
      }
    }
    if (drug.doseUnit && !formDoseUnit.trim()) setFormDoseUnit(drug.doseUnit);
    // Store safe range for out-of-range detection
    if (drug.minDose !== null || drug.maxDose !== null) {
      setDoseSafeRange({ min: drug.minDose, max: drug.maxDose, unit: drug.doseUnit, label: drug.safeDosage });
    } else {
      setDoseSafeRange(null);
    }
    if (drug.routes.length > 0) {
      const routeLabel = drug.routes[0].label as MedicationRoute;
      setFormRoute(routeLabel);
    }
    setShowSuggestions(false);
    setDrugSuggestions([]);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [formDose, formDoseUnit]);

  // ── Open add/edit modal ────────────────────────────────────────────────────
  const openAdd = useCallback(async () => {
    setEditingMed(null);
    setFormName(''); setFormDose(''); setFormForm('tablet'); setFormFreq('daily');
    setFormTimes(['08:00']); setFormQuantity('30'); setFormRefillAt('7');
    setFormColor(MED_COLORS[0]); setFormNotes('');
    setFormStartDate(''); setFormEndDate(''); setFormRefillDate('');
    setFormIndication(''); setFormSafeDosage(''); setFormRoute('oral'); setFormGenericName('');
    setFormDoseUnit(''); setFormPrescriber(''); setFormFillDate(null); setFormRefillCounty(''); setFormReason(''); setFormDaysSupply('');
    setDrugSuggestions([]); setShowSuggestions(false); setDoseSafeRange(null);
    // Pre-fill pharmacy from preferred entry (all three fields: name, phone, address)
    const preferred = await getPreferredPharmacy();
    setFormPharmacyName(preferred?.name ?? '');
    setFormPharmacyPhone(preferred?.phone ?? '');
    setFormPharmacyAddress(preferred?.address ?? '');
    setFormRxNumber('');
    setFormRefillsRemaining('');
    setShowAddModal(true);
  }, []);

  const openDictation = React.useCallback(async () => {
    // If the Add modal is not open, open it first (reset form), then focus dictation
    if (!showAddModal) {
      await openAdd();
      // openAdd sets showAddModal=true; give the modal a frame to mount before focusing
      setTimeout(() => dictationInputRef.current?.focus(), 300);
    } else {
      dictationInputRef.current?.focus();
    }
  }, [showAddModal, openAdd]);

  const openEdit = useCallback((med: Medication) => {
    setEditingMed(med);
    setFormName(med.name); setFormDose(med.dose); setFormForm(med.form);
    setFormFreq(med.frequency); setFormTimes([...med.scheduleTimes]);
    setFormQuantity(med.quantity !== null ? String(med.quantity) : '');
    setFormRefillAt(String(med.refillAt)); setFormColor(med.color); setFormNotes(med.notes);
    setFormPharmacyName(med.pharmacyName ?? ''); setFormPharmacyPhone(med.pharmacyPhone ?? ''); setFormPharmacyAddress((med as any).pharmacyAddress ?? '');
    setFormStartDate(med.startDate ?? ''); setFormEndDate(med.endDate ?? ''); setFormRefillDate(med.refillReminderDate ?? '');
    setFormIndication(med.indication ?? ''); setFormSafeDosage(med.safeDosage ?? '');
    setFormRoute(med.route ?? 'oral'); setFormGenericName(med.genericName ?? '');
    setFormRxNumber(med.rxNumber ?? '');
    setFormRefillsRemaining(med.refillsRemaining !== undefined ? String(med.refillsRemaining) : '');
    setFormDoseUnit(med.doseUnit ?? '');
    setFormPrescriber(med.prescriber ?? '');
    setFormFillDate(med.fillDate ? new Date(med.fillDate) : null);
    setFormRefillCounty(med.refillCounty ?? '');
    setFormReason(med.reason ?? '');
    setFormDaysSupply(med.daysSupply !== undefined ? String(med.daysSupply) : '');
    setDrugSuggestions([]); setShowSuggestions(false); setDoseSafeRange(null);
    setShowAddModal(true);
  }, []);

  // ── Save medication ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formDose.trim()) return;

    // Confidence-guided save guard: warn when critical OCR fields have Low confidence
    if (ocrReviewFields) {
      const LOW_THRESHOLD = 0.45;
      const criticalLabels = ['Medication Name', 'Dose'];
      const lowConfidenceFields = ocrReviewFields.filter(
        (f) => criticalLabels.includes(f.label) && f.confidence !== undefined && f.confidence < LOW_THRESHOLD
      );
      if (lowConfidenceFields.length > 0) {
        const fieldList = lowConfidenceFields.map((f) => `• ${f.label}`).join('\n');
        const userChoseSaveAnyway = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Low Confidence Fields',
            `The following field${lowConfidenceFields.length > 1 ? 's were' : ' was'} extracted with low confidence from the prescription scan. Please verify before saving:\n\n${fieldList}`,
            [
              { text: 'Review', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Save Anyway', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: false }
          );
        });
        if (!userChoseSaveAnyway) return; // user wants to review — bail out
      }
    }

    setSavingForm(true);
    try {
      const qty = formQuantity.trim() ? parseInt(formQuantity, 10) : null;
      const refill = parseInt(formRefillAt, 10) || 7;
      // Persist pharmacy to auto-complete store for future entries
      if (formPharmacyName.trim()) {
        upsertPharmacy(formPharmacyName, formPharmacyPhone, formPharmacyAddress).catch(() => {});
      }
      const extra = {
        pharmacyName: formPharmacyName.trim() || undefined,
        pharmacyPhone: formPharmacyPhone.trim() || undefined,
        pharmacyAddress: formPharmacyAddress.trim() || undefined,
        startDate: formStartDate.trim() || undefined,
        endDate: formEndDate.trim() || undefined,
        refillReminderDate: formRefillDate.trim() || undefined,
        indication: formIndication.trim() || undefined,
        safeDosage: formSafeDosage.trim() || undefined,
        route: formRoute,
        genericName: formGenericName.trim() || undefined,
        rxNumber: formRxNumber.trim() || undefined,
        refillsRemaining: formRefillsRemaining.trim() ? parseInt(formRefillsRemaining, 10) : undefined,
        doseUnit: formDoseUnit.trim() || undefined,
        prescriber: formPrescriber.trim() || undefined,
        fillDate: formFillDate ? formFillDate.toISOString().split('T')[0] : undefined,
        refillCounty: formRefillCounty.trim() || undefined,
        reason: formReason.trim() || undefined,
        daysSupply: formDaysSupply.trim() ? parseInt(formDaysSupply, 10) : undefined,
      };

      if (editingMed) {
        const updated: Medication = {
          ...editingMed,
          name: formName.trim(), dose: formDose.trim(), form: formForm,
          frequency: formFreq, scheduleTimes: formTimes.filter(Boolean),
          quantity: qty, refillAt: refill, color: formColor, notes: formNotes.trim(),
          ...extra,
        };
        const notifIds = await scheduleMedicationNotifications(updated);
        const earlyIds = await scheduleEarlyReminderNotifications(updated);
        updated.notificationIds = [...notifIds, ...earlyIds];
        if (extra.refillReminderDate) {
          // Cancel old advance refill notif if refill date changed
          if (editingMed.advanceRefillNotifId) {
            await cancelMedicationNotifications([editingMed.advanceRefillNotifId]);
          }
          const [refillNotifId, advanceNotifId] = await Promise.all([
            scheduleRefillReminderNotification(updated, extra.refillReminderDate),
            scheduleAdvanceRefillNotification(updated, extra.refillReminderDate),
          ]);
          if (advanceNotifId) updated.advanceRefillNotifId = advanceNotifId;
          // refillNotifId is fire-and-forget (stored externally if needed)
          void refillNotifId;
        } else {
          // Refill date cleared — cancel any existing advance notif
          if (editingMed.advanceRefillNotifId) {
            await cancelMedicationNotifications([editingMed.advanceRefillNotifId]);
            updated.advanceRefillNotifId = undefined;
          }
        }
        const next = await updateMedication(meds, updated);
        setMeds(next);
      } else {
        const med = createMedication({
          name: formName.trim(), dose: formDose.trim(), form: formForm,
          frequency: formFreq, scheduleTimes: formTimes.filter(Boolean),
          quantity: qty, refillAt: refill, color: formColor, notes: formNotes.trim(),
          ...extra,
        });
        await requestNotificationPermissions();
        const notifIds = await scheduleMedicationNotifications(med);
        const earlyIds = await scheduleEarlyReminderNotifications(med);
        med.notificationIds = [...notifIds, ...earlyIds];
        if (extra.refillReminderDate) {
          const [refillNotifId, advanceNotifId] = await Promise.all([
            scheduleRefillReminderNotification(med, extra.refillReminderDate),
            scheduleAdvanceRefillNotification(med, extra.refillReminderDate),
          ]);
          if (advanceNotifId) med.advanceRefillNotifId = advanceNotifId;
          void refillNotifId;
        } else if (extra.refillCounty && extra.fillDate) {
          // Auto-schedule 7-day advance refill notification from fill date + days supply
          // when refill county is set (county-triggered refill reminder)
          // Use explicit daysSupply if provided, otherwise fall back to qty+frequency estimate
          const dsQty = extra.daysSupply != null ? extra.daysSupply : qty;
          const dsFreq = extra.daysSupply != null ? 'daily' : formFreq;
          const fillNotifId = await scheduleFillDateRefillNotification(
            med, extra.fillDate, dsQty, dsFreq,
          );
          if (fillNotifId) med.advanceRefillNotifId = fillNotifId;
        }
        const next = await addMedication(meds, med);
        setMeds(next);
        // Track newly saved id for green flash, then clear after animation
        setNewMedId(med.id);
        setTimeout(() => setNewMedId(null), 2000);
        // Switch to My Meds tab so user sees the newly saved medication
        setActiveTabPersisted('mymeds');
        // Background interaction check — non-blocking, fires after modal closes
        const allMedNames = next
          .filter((m) => m.active && m.id !== med.id)
          .map((m) => m.name);
        if (allMedNames.length > 0) {
          interactionsMutation.mutate(
            { medications: [{ id: med.id, name: med.name }, ...allMedNames.map((n, idx) => ({ id: `other-${idx}`, name: n }))] },
            {
              onSuccess: (res) => {
                if (res.interactions && res.interactions.length > 0) {
                  setPostSaveInteractionResult({
                    newMedName: med.name,
                    interactions: res.interactions.map((ix) => ({
                      ...ix,
                    })),
                    disclaimer: res.disclaimer ??
                      'Always confirm with your pharmacist or prescribing healthcare provider before making any medication changes.',
                  });
                }
              },
            },
          );
        }
      }
      setShowAddModal(false);
      // Contextual upsell: fire after 5th medication save (free users only)
      // Non-blocking: runs after modal closes so it doesn't interrupt the save flow
      if (!editingMed) {
        setTimeout(() => { checkUpsell('medication_first_add').catch(() => {}); }, 600);
      }
    } finally {
      setSavingForm(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editingMed, meds, formName, formDose, formForm, formFreq,
    formTimes, formQuantity, formRefillAt, formColor, formNotes,
    formPharmacyName, formPharmacyPhone, formPharmacyAddress, formStartDate, formEndDate, formRefillDate,
    ocrReviewFields,
  ]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((id: string) => {
    Alert.alert(t.deleteMedication, t.deleteConfirm, [
      { text: t.deleteNo, style: 'cancel' },
      {
        text: t.deleteYes, style: 'destructive',
        onPress: async () => {
          const med = meds.find((m) => m.id === id);
          if (med) {
            await cancelMedicationNotifications(med.notificationIds);
            // Cancel 7-day advance refill notification if present
            if (med.advanceRefillNotifId) {
              await cancelMedicationNotifications([med.advanceRefillNotifId]);
            }
          }
          const next = await deleteMedication(meds, id);
          setMeds(next);
        },
      },
    ]);
  }, [meds, t]);

  // ── Mark taken / skipped ───────────────────────────────────────────────────
  const handleMarkTaken = useCallback(async (medId: string, scheduledTime: string) => {
    const today = new Date().toISOString().split('T')[0];
    const log = createDoseLog(today, scheduledTime, 'taken');
    const next = await logDose(meds, medId, log);
    setMeds(next);
    // Cancel today's pending notification for this dose so the reminder
    // doesn't fire after the user has already marked it taken.
    const med = meds.find((m) => m.id === medId);
    if (med?.notificationIds?.length) {
      await cancelMedicationNotifications(med.notificationIds).catch(() => {});
      // Re-schedule the daily notifications so tomorrow's reminders still fire.
      const newIds = await scheduleMedicationNotifications(med).catch(() => []);
      const earlyIds = await scheduleEarlyReminderNotifications({ ...med, notificationIds: newIds }).catch(() => []);
      const updatedMed: Medication = { ...med, notificationIds: [...newIds, ...earlyIds] };
      await updateMedication(next, updatedMed).catch(() => {});
    }
    // Show 5-minute Undo toast so the user can reverse an accidental tap.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoCountdownRef.current) clearInterval(undoCountdownRef.current);
    setUndoTaken({
      medId,
      logId: log.id,
      medName: med?.name ?? 'Medication',
      scheduledTime,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    // Slide-up + fade-in animation
    undoToastTranslateY.value = 80;
    undoToastOpacity.value = 0;
    undoToastTranslateY.value = withTiming(0, { duration: 280 });
    undoToastOpacity.value = withTiming(1, { duration: 220 });
    // Start 5-minute countdown
    setUndoSecondsLeft(300);
    undoCountdownRef.current = setInterval(() => {
      setUndoSecondsLeft((s) => {
        if (s <= 1) {
          if (undoCountdownRef.current) clearInterval(undoCountdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    undoTimerRef.current = setTimeout(() => {
      // Slide-down + fade-out before clearing
      undoToastTranslateY.value = withTiming(80, { duration: 220 });
      undoToastOpacity.value = withTiming(0, { duration: 180 });
      setTimeout(() => setUndoTaken(null), 230);
    }, 5 * 60 * 1000);
    // Switch to History tab so the user can see the taken dose logged.
    setHistoryInitialFilter('taken');
    setActiveTabPersisted('history');
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meds, setActiveTabPersisted]);

  const handleMarkSkipped = useCallback(async (medId: string, scheduledTime: string) => {
    const today = new Date().toISOString().split('T')[0];
    const log = createDoseLog(today, scheduledTime, 'skipped');
    const next = await logDose(meds, medId, log);
    setMeds(next);
    // Route to History tab filtered to Skipped so user can see the logged entry.
    setHistoryInitialFilter('skipped');
    setActiveTabPersisted('history');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [meds, setActiveTabPersisted]);

  const handleMarkMissed = useCallback((medId: string, scheduledTime: string) => {
    // Show note prompt first; actual logging happens in handleConfirmMissed
    setMissedNoteText('');
    setPendingMissedNote({ medId, scheduledTime });
  }, []);

  const handleConfirmMissed = useCallback(async (note?: string) => {
    if (!pendingMissedNote) return;
    const { medId, scheduledTime } = pendingMissedNote;
    setPendingMissedNote(null);
    const today = new Date().toISOString().split('T')[0];
    const log = { ...createDoseLog(today, scheduledTime, 'missed'), note: note?.trim() || undefined };
    const next = await logDose(meds, medId, log);
    setMeds(next);
    const med = next.find((m) => m.id === medId);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // Show 5-minute Undo toast so the user can reverse an accidental tap.
    if (undoMissedTimerRef.current) clearTimeout(undoMissedTimerRef.current);
    if (undoMissedCountdownRef.current) clearInterval(undoMissedCountdownRef.current);
    setUndoMissed({
      medId,
      logId: log.id,
      medName: med?.name ?? 'Medication',
      scheduledTime,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    setUndoMissedSecondsLeft(300);
    undoMissedToastTranslateY.value = 80;
    undoMissedToastOpacity.value = 0;
    undoMissedToastTranslateY.value = withTiming(0, { duration: 280 });
    undoMissedToastOpacity.value = withTiming(1, { duration: 220 });
    undoMissedCountdownRef.current = setInterval(() => {
      setUndoMissedSecondsLeft((s) => {
        if (s <= 1) {
          if (undoMissedCountdownRef.current) clearInterval(undoMissedCountdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    undoMissedTimerRef.current = setTimeout(() => {
      undoMissedToastTranslateY.value = withTiming(80, { duration: 220 });
      undoMissedToastOpacity.value = withTiming(0, { duration: 180 });
      setTimeout(() => setUndoMissed(null), 230);
      // Route to History Missed after toast expires
      setHistoryInitialFilter('missed');
      setActiveTabPersisted('history');
    }, 5 * 60 * 1000);
  }, [pendingMissedNote, meds, setActiveTabPersisted, undoMissedToastTranslateY, undoMissedToastOpacity]);

  // ── Reschedule dose ─────────────────────────────────────────────────────────────────────────────────────
  // State declared here (before callbacks) to avoid used-before-declaration TS error
  const [rescheduleTarget, setRescheduleTarget] = useState<{ medId: string; scheduledTime: string } | null>(null);
  const [rescheduleNewTime, setRescheduleNewTime] = useState('08:00');

  const handleReschedule = useCallback((medId: string, scheduledTime: string) => {
    setRescheduleTarget({ medId, scheduledTime });
    setRescheduleNewTime(scheduledTime);
  }, []);

  const handleConfirmReschedule = useCallback(async () => {
    if (!rescheduleTarget) return;
    const { medId, scheduledTime } = rescheduleTarget;
    const med = meds.find((m) => m.id === medId);
    if (!med) return;
    // Replace the old scheduled time with the new one
    const updatedTimes = med.scheduleTimes.map((t) =>
      t === scheduledTime ? rescheduleNewTime : t
    );
    const updated: Medication = { ...med, scheduleTimes: updatedTimes };
    const next = await updateMedication(meds, updated);
    // Re-schedule notifications for the updated times so the daily reminder
    // fires at the new time going forward.
    const newIds = await scheduleMedicationNotifications(updated).catch(() => []);
    const earlyIds = await scheduleEarlyReminderNotifications({ ...updated, notificationIds: newIds }).catch(() => []);
    const withNotifs: Medication = { ...updated, notificationIds: [...newIds, ...earlyIds] };
    const nextWithNotifs = await updateMedication(next, withNotifs).catch(() => next);
    // Log the reschedule event in today's dose history
    const withHistory = await logRescheduleEvent(nextWithNotifs, medId, scheduledTime, rescheduleNewTime);
    setMeds(withHistory);
    setRescheduleTarget(null);
    // Show confirmation toast with the new time.
    if (rescheduleToastTimerRef.current) clearTimeout(rescheduleToastTimerRef.current);
    setRescheduleToastMsg(`Rescheduled to ${rescheduleNewTime} ✓`);
    rescheduleToastTimerRef.current = setTimeout(() => setRescheduleToastMsg(null), 3000);
    // Switch to Today tab so the user sees the updated dose list.
    setActiveTabPersisted('today');
    // Highlight the rescheduled dose card so the user can see it at the new time.
    const newKey = `${medId}-${rescheduleNewTime}`;
    setHighlightedDoseKey(newKey);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedDoseKey(null), 3000);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [rescheduleTarget, rescheduleNewTime, meds, setActiveTabPersisted]);

  const handleSnooze15 = useCallback(async () => {
    if (!rescheduleTarget) return;
    const { medId, scheduledTime } = rescheduleTarget;
    const med = meds.find((m) => m.id === medId);
    if (!med) return;
    // Compute the snooze fire time: now + 15 minutes (one-time, today only).
    // We do NOT mutate scheduleTimes so the daily schedule remains unchanged.
    const fireAt = new Date(Date.now() + 15 * 60 * 1000);
    // Schedule a one-time "Snoozed Reminder" notification 15 min from now.
    await scheduleSnoozeNotification(med, fireAt, t.snoozedReminderTitle).catch(() => {});
    // Compute the new HH:MM string for the log entry (for display in History tab)
    const [hh, mm] = scheduledTime.split(':').map(Number);
    const totalMin = hh * 60 + mm + 15;
    const newHour = Math.floor(totalMin / 60) % 24;
    const newMin  = totalMin % 60;
    const newTime = `${String(newHour).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`;
    // Log the snooze event in today's dose history (no schedule mutation)
    const withHistory = await logRescheduleEvent(meds, medId, scheduledTime, newTime, 'snooze');
    setMeds(withHistory);
    setRescheduleTarget(null);
    // Switch to Today tab so the user sees the updated dose list.
    setActiveTabPersisted('today');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [rescheduleTarget, meds, setActiveTabPersisted]);

  // ── Reinstate dose ─────────────────────────────────────────────────────────────────────────────────────
  const handleReinstate = useCallback(async (medId: string, logId: string, time: string) => {
    const next = await reinstateDose(meds, medId, logId, time);
    setMeds(next);
  }, [meds]);

  // ── Undo Taken (within 5-minute grace window) ────────────────────────────
  const handleUndoTaken = useCallback(async () => {
    if (!undoTaken) return;
    const { medId, logId, scheduledTime } = undoTaken;
    // Remove the dose log entry and restore the quantity.
    const next = await removeDoseLog(meds, medId, logId);
    setMeds(next);
    // Re-cancel the re-scheduled daily notifications and restore today's reminder
    // so the dose shows as due again.
    const med = next.find((m) => m.id === medId);
    if (med?.notificationIds?.length) {
      await cancelMedicationNotifications(med.notificationIds).catch(() => {});
      const newIds = await scheduleMedicationNotifications(med).catch(() => []);
      const earlyIds = await scheduleEarlyReminderNotifications({ ...med, notificationIds: newIds }).catch(() => []);
      const updatedMed: Medication = { ...med, notificationIds: [...newIds, ...earlyIds] };
      await updateMedication(next, updatedMed).catch(() => {});
    }
    // Dismiss the undo toast with slide-down + fade-out animation.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoCountdownRef.current) clearInterval(undoCountdownRef.current);
    undoToastTranslateY.value = withTiming(80, { duration: 220 });
    undoToastOpacity.value = withTiming(0, { duration: 180 });
    setTimeout(() => setUndoTaken(null), 230);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void scheduledTime; // suppress unused-var lint
  }, [undoTaken, meds, undoToastTranslateY, undoToastOpacity]);

  // ── Undo Missed handler ─────────────────────────────────────────────────
  const handleUndoMissed = useCallback(async () => {
    if (!undoMissed) return;
    const { medId, logId } = undoMissed;
    const next = await removeDoseLog(meds, medId, logId);
    setMeds(next);
    if (undoMissedTimerRef.current) clearTimeout(undoMissedTimerRef.current);
    if (undoMissedCountdownRef.current) clearInterval(undoMissedCountdownRef.current);
    undoMissedToastTranslateY.value = withTiming(80, { duration: 220 });
    undoMissedToastOpacity.value = withTiming(0, { duration: 180 });
    setTimeout(() => setUndoMissed(null), 230);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [undoMissed, meds, undoMissedToastTranslateY, undoMissedToastOpacity]);

  // ── on-device side effects + interactions ─────────────────────────────────────────
  const handleRefreshAI = useCallback(async (med: Medication) => {
    try {
      // Side effects
      const seResult = await sideEffectsMutation.mutateAsync({ medicationName: med.name });
      // Interactions with all other active meds
      const activeMeds = meds.filter((m) => m.active);
      let interactions: DrugInteraction[] = [];
      if (activeMeds.length > 0) {
        const ixResult = await interactionsMutation.mutateAsync({
          medications: activeMeds.map((m) => ({ id: m.id, name: m.name })),
        });
        interactions = ixResult.interactions.map((ix) => ({
          drug: ix.drug,
          severity: ix.severity as 'major' | 'moderate' | 'minor',
          description: ix.description,
          source: (ix.source === 'fda' ? 'fda' : 'smart') as 'fda' | 'smart',
        }));
      }
      const updated: Medication = {
        ...med,
        sideEffects: seResult.sideEffects as SideEffect[],
        drugInteractions: interactions,
        sideEffectsLastFetched: new Date().toISOString(),
        interactionsLastFetched: new Date().toISOString(),
      };
      const next = await updateMedication(meds, updated);
      setMeds(next);
    } catch (_e) {
      Alert.alert('Smart Data Error', 'Could not load Smart data. Please try again.');
    }
  }, [meds, sideEffectsMutation, interactionsMutation]);

  // ── Update a single medication (used by inline editors like refill threshold) ───────────
  const handleUpdateMed = useCallback(async (updated: Medication) => {
    const next = await updateMedication(meds, updated);
    setMeds(next);
  }, [meds]);

  // ── Delete a dose log entry (swipe-left action on Today + History tabs) ──────────
  const handleDeleteDose = useCallback(async (medId: string, logId: string) => {
    const next = await removeDoseLog(meds, medId, logId);
    setMeds(next);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [meds]);

  // ── Edit dose time (tap action on Today + History tabs) ──────────────────────
  const handleEditDoseTime = useCallback((medId: string, logId: string, currentTime: string) => {
    setEditTimeTarget({ medId, logId, currentTime });
    setEditTimeValue(currentTime);
  }, []);

  const handleConfirmEditTime = useCallback(async () => {
    if (!editTimeTarget) return;
    const { medId, logId } = editTimeTarget;
    if (!editTimeValue.match(/^\d{1,2}:\d{2}$/)) {
      Alert.alert('Invalid Time', 'Please enter a time in HH:MM format.');
      return;
    }
    const next = await updateDoseTime(meds, medId, logId, editTimeValue);
    setMeds(next);
    setEditTimeTarget(null);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [editTimeTarget, editTimeValue, meds]);

  // ── Time helpers ───────────────────────────────────────────────────────────
  const addTime = useCallback(() => setFormTimes((p) => [...p, '12:00']), []);
  const removeTime = useCallback((idx: number) => setFormTimes((p) => p.filter((_, i) => i !== idx)), []);
  const updateTime = useCallback((idx: number, val: string) => setFormTimes((p) => p.map((t, i) => i === idx ? val : t)), []);

  const insets = useSafeAreaInsets();

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'mymeds', label: t.myMeds },
    { id: 'today', label: t.today },
    { id: 'history', label: t.historyTab },
  ];
  return (
    <ScreenContainer>
      {/* Contextual upsell bottom sheet */}
      {UpsellSheet}

      {/* One-time disclaimer modal */}
      <Modal visible={showDisclaimer} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.overlayBg}>
          <View style={[styles.disclaimerCard, { backgroundColor: colors.surface }]}>
            <IconSymbol name="cross.fill" size={32} color={colors.error} />
            <Text style={[styles.disclaimerTitle, { color: colors.foreground }]}>{t.disclaimerTitle}</Text>
            <Text style={[styles.disclaimerBody, { color: colors.muted }]}>{t.disclaimerBody}</Text>
            <Pressable
              onPress={handleAcceptDisclaimer}
              style={[styles.disclaimerBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.disclaimerBtnText}>{t.disclaimerAccept}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Prescription Scan Analysis Overlay */}
      <Modal
        visible={rxScanOverlayVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!scribeLoading) setRxScanOverlayVisible(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
          {/* Close button — always visible */}
          <Pressable
            onPress={() => setRxScanOverlayVisible(false)}
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            hitSlop={12}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
          </Pressable>
          {rxScanImageUri ? (
            <MedicalScanAnalysisOverlay
              type="prescription"
              imageUri={rxScanImageUri}
              steps={rxScanSteps}
              progress={rxScanProgress}
              isAnalyzing={scribeLoading}
              error={rxScanError}
              partialData={rxScanPartialData}
              onRetry={() => { setRxScanOverlayVisible(false); setTimeout(openPrescriptionScanner, 300); }}
              onUploadNew={() => { setRxScanOverlayVisible(false); setTimeout(openPrescriptionScanner, 300); }}
              onManualEntry={() => {
                setRxScanOverlayVisible(false);
                if (rxScanPartialResultRef.current) {
                  applyScribeResult(rxScanPartialResultRef.current);
                }
                setTimeout(() => {
                  if (isMounted.current) setShowAddModal(true);
                }, 350);
              }}
            />
          ) : null}
        </View>
      </Modal>

      {/* Add / Edit Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowAddModal(false)} style={styles.modalHeaderBtn}>
              <Text style={[styles.modalHeaderBtnText, { color: colors.muted }]}>{t.cancel}</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingMed ? t.editMedication : t.addMedication}
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={!formName.trim() || !formDose.trim() || savingForm}
              style={[styles.modalHeaderBtn, (!formName.trim() || !formDose.trim()) && { opacity: 0.4 }]}
            >
              {savingForm
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={[styles.modalHeaderBtnText, { color: colors.primary }]}>{t.save}</Text>
              }
            </Pressable>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* ── Dual Action Row: Dictate + Scan Prescription ─────────────── */}
            <View style={styles.actionRow}>
              <Pressable
                onPress={openDictation}
                style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={styles.actionButtonIcon}>🎤</Text>
                <Text style={[styles.actionButtonText, { color: colors.foreground }]}>Dictate</Text>
              </Pressable>
              <Pressable
                onPress={openPrescriptionScanner}
                disabled={scribeLoading}
                style={({ pressed }) => [styles.actionButton, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', opacity: (pressed || scribeLoading) ? 0.75 : 1 }]}
              >
                {scribeLoading
                  ? <ActivityIndicator size="small" color="#9A3412" />
                  : <Text style={styles.actionButtonIcon}>📷</Text>
                }
                <Text style={[styles.actionButtonText, { color: '#9A3412' }]}>
                  {scribeLoading ? 'Scanning…' : 'Scan Prescription'}
                </Text>
              </Pressable>
            </View>

            {/* Scan error */}
            {!!scanError && (
              <View style={[styles.scanErrorBox, { backgroundColor: colors.error + '18', borderColor: colors.error + '44' }]}>
                <Text style={[styles.scanErrorText, { color: colors.error }]}>{scanError}</Text>
                <Pressable onPress={() => setScanError(null)} hitSlop={8}>
                  <Text style={[styles.scanErrorDismiss, { color: colors.error }]}>×</Text>
                </Pressable>
              </View>
            )}
            {/* Diff-style OCR Review Card */}
            {ocrReviewFields && (
              <OcrReviewCard
                title="Prescription Scan Results"
                fields={ocrReviewFields}
                scanMethod={scribeScanMethod}
                onConfirm={() => setOcrReviewFields(null)}
                onRetake={openPrescriptionScanner}
                onManual={() => { setOcrReviewFields(null); setScanError(null); }}
              />
            )}

            {/* Scan preview — collapsible raw text */}
            {!!prescriptionScanText && (
              <View style={[styles.scanPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => setScanCollapsed(v => !v)}
                  style={styles.scanPreviewHeader}
                >
                  <Text style={[styles.scanPreviewTitle, { color: colors.foreground }]}>
                    ✅ Prescription scan captured
                  </Text>
                  <Text style={[styles.scanPreviewChevron, { color: colors.muted }]}>
                    {scanCollapsed ? '›' : '‹'}
                  </Text>
                </Pressable>
                {!scanCollapsed && (
                  <Text style={[styles.scanPreviewText, { color: colors.muted }]}>
                    {prescriptionScanText}
                  </Text>
                )}
                <Pressable
                  onPress={() => { setPrescriptionScanText(null); setScanError(null); }}
                  style={[styles.clearScanBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.clearScanBtnText, { color: colors.muted }]}>Clear Scan</Text>
                </Pressable>
              </View>
            )}

            {/* Review reminder */}
            <Text style={[styles.reviewReminder, { color: colors.muted }]}>
              ⚠️ {t.reviewWarning}
            </Text>

            {/* ── Live Dictation Text Box ─────────────────────────────────── */}
            <DictationTipBanner />
            <DictationBox
              ref={dictationInputRef}
              formKey="medications"
              label="🎤  DICTATE PRESCRIPTION"
              placeholder={t.dictateScribePlaceholder ?? "Speak or type: 'Lisinopril 10mg once daily, 30 tablets, prescribed by Dr. Smith, start today…'"}
              value={dictationText}
              onChangeText={setDictationText}
              onSubmit={handleDictationSubmit}
              isParsing={dictationParsing}
              colors={colors}
            />
            {/* ── Manual Entry Fields (populated by dictation/scan or typed manually) ─── */}
            {/* Medication Name with drug database auto-predict */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>MEDICATION NAME</Text>
            <View>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={formName}
                onChangeText={handleNameChange}
                placeholder={t.namePlaceholder}
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                returnKeyType="done"
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {searchingDrugs && (
                <View style={{ position: 'absolute', right: 12, top: 12 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
              {showSuggestions && drugSuggestions.length > 0 && (
                <View style={[styles.suggestionsDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {/* Drug database suggestions badge */}
                  <View style={[styles.aiBadgeRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.aiBadgeText, { color: colors.primary }]}>
                      ✦ Drug Database
                    </Text>
                    <Text style={[styles.aiBadgeSubtext, { color: colors.muted }]}>Suggested from first 3 letters</Text>
                  </View>
                  {drugSuggestions.slice(0, 5).map((drug, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleSelectDrug(drug)}
                      style={({ pressed }) => [styles.suggestionRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={[styles.suggestionName, { color: colors.foreground }]}>{drug.name}</Text>
                      {drug.genericName ? (
                        <Text style={[styles.suggestionGeneric, { color: colors.muted }]}>{drug.genericName}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            {/* ── Reason for Taking (auto-populated, always editable) ── */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>REASON FOR TAKING</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={formIndication}
                onChangeText={setFormIndication}
                placeholder={t.reasonPlaceholder ?? 'e.g. HTN, T2DM, Pain'}
                placeholderTextColor={colors.muted}
                autoCapitalize="sentences"
                returnKeyType="done"
              />
              {!!formIndication && (
                <View style={{ position: 'absolute', right: 10, top: 10, backgroundColor: colors.primary + '18', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.primary + '30' }}>
                  <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>Auto-filled</Text>
                </View>
              )}
            </View>
            <Text style={[styles.fieldHint, { color: colors.muted, marginTop: -8, marginBottom: 8 }]}>
              Auto-filled from drug database · tap to edit
            </Text>
            {/* Dose + Unit (side by side) */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>DOSE</Text>
            {/* Safe-range hint chip */}
            {doseSafeRange && doseSafeRange.label ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                <View style={{ backgroundColor: colors.primary + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.primary + '40' }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>💊 Safe range: {doseSafeRange.label}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.muted }}>Auto-filled from database</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.textInput, { flex: 2, backgroundColor: colors.surface, borderColor: (() => {
                  if (!doseSafeRange || !formDose.trim()) return colors.border;
                  const num = parseFloat(formDose);
                  if (isNaN(num)) return colors.border;
                  const { min, max } = doseSafeRange;
                  if ((min !== null && num < min) || (max !== null && num > max)) return colors.error;
                  return colors.success;
                })(), color: colors.foreground }]}
                value={formDose}
                onChangeText={setFormDose}
                placeholder={t.dosePlaceholder}
                placeholderTextColor={colors.muted}
                keyboardType="default"
                returnKeyType="done"
              />
              <TextInput
                style={[styles.textInput, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={formDoseUnit}
                onChangeText={setFormDoseUnit}
                placeholder={t.unitPlaceholder ?? 'Unit'}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                returnKeyType="done"
              />
            </View>
            {/* Hard disclaimer: out-of-range dose warning */}
            {(() => {
              if (!doseSafeRange || !formDose.trim()) return null;
              const num = parseFloat(formDose);
              if (isNaN(num)) return null;
              const { min, max } = doseSafeRange;
              const outOfRange = (min !== null && num < min) || (max !== null && num > max);
              if (!outOfRange) return null;
              return (
                <View style={{ backgroundColor: colors.error + '18', borderRadius: 10, padding: 12, marginTop: 6, borderWidth: 1.5, borderColor: colors.error + '60', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={{ fontSize: 18, lineHeight: 22 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error, marginBottom: 3 }}>Dose outside safe range</Text>
                    <Text style={{ fontSize: 12, color: colors.error, lineHeight: 17, marginBottom: 4 }}>
                      The entered dose ({formDose} {formDoseUnit || doseSafeRange.unit}) is outside the typical safe range for this medication ({doseSafeRange.label}).
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 17, fontStyle: 'italic' }}>
                      💊 Consult your pharmacist or physician for the correct dose before proceeding.
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Form (tablet, capsule, etc.) */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t.form.toUpperCase()}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                {FORMS.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setFormForm(f)}
                    style={[styles.chipBtn, { borderColor: formForm === f ? formColor : colors.border, backgroundColor: formForm === f ? formColor + '22' : colors.surface }]}
                  >
                    <Text style={[styles.chipBtnText, { color: formForm === f ? formColor : colors.muted }]}>
                      {(t as any)[`form${f.charAt(0).toUpperCase() + f.slice(1)}`] ?? f}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Route */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>ROUTE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                {ALL_ROUTES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setFormRoute(r)}
                    style={[styles.chipBtn, { borderColor: formRoute === r ? formColor : colors.border, backgroundColor: formRoute === r ? formColor + '22' : colors.surface }]}
                  >
                    <Text style={[styles.chipBtnText, { color: formRoute === r ? formColor : colors.muted }]}>
                      {ROUTE_EMOJI[r]} {(routeLabels[lang as string]?.[r] ?? ROUTE_LABELS[r])}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Frequency */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t.frequency.toUpperCase()}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                {FREQUENCIES.map((fr) => {
                  const freqKey = `freq${fr.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as keyof typeof t;
                  return (
                    <Pressable
                      key={fr}
                      onPress={() => setFormFreq(fr)}
                      style={[styles.chipBtn, { borderColor: formFreq === fr ? formColor : colors.border, backgroundColor: formFreq === fr ? formColor + '22' : colors.surface }]}
                    >
                      <Text style={[styles.chipBtnText, { color: formFreq === fr ? formColor : colors.muted }]}>
                        {(t as any)[freqKey] ?? fr}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Prescriber (optional) */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>PRESCRIBER (optional)</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={formPrescriber}
              onChangeText={setFormPrescriber}
                placeholder={t.prescriberPlaceholder ?? 'e.g. Dr. Jane Smith'}
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
            />

            {/* Fill Date with calendar picker */}
            <DateTimePickerField
              label="FILL DATE (optional)"
              value={formFillDate}
              onChange={setFormFillDate}
              mode="date"
              optional
              showTodayChip
            />
            <Text style={[styles.fieldHint, { color: colors.muted, marginTop: -8, marginBottom: 8 }]}>
              📅 Tap the calendar icon to add date manually
            </Text>

            {/* Refill County (optional) */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>REFILL COUNTY (optional)</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={formRefillCounty}
              onChangeText={setFormRefillCounty}
                placeholder={t.pharmacyNamePlaceholder ?? 'e.g. Los Angeles, CA'}
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <Text style={[styles.fieldHint, { color: colors.muted, marginTop: -8, marginBottom: 8 }]}>
              🔔 County is used to auto-trigger a refill reminder when you approach the refill window
            </Text>

            {/* Reason / personal note — only shown when populated by dictation/scan */}
            {!!formReason.trim() && (
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>REASON / PERSONAL NOTE</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={formReason}
                  onChangeText={setFormReason}
                  placeholder={t.reasonPlaceholder ?? 'Reason for taking this medication'}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                  returnKeyType="done"
                />
              </View>
            )}

            {/* Schedule times — text inputs (HH:MM), dictation-compatible */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t.scheduleTimes.toUpperCase()}</Text>
            {formTimes.map((time, idx) => (
              <View key={idx} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>
                    {formTimes.length > 1
                      ? (t.doseNumberLabel ?? 'DOSE {n}').replace('{n}', String(idx + 1))
                      : (t.doseNumberLabel ?? 'DOSE {n}').replace(' {n}', '')}
                  </Text>
                  {formTimes.length > 1 && (
                    <Pressable onPress={() => removeTime(idx)} hitSlop={8}>
                      <IconSymbol name="minus.circle.fill" size={18} color={colors.error} />
                    </Pressable>
                  )}
                </View>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: formColor, color: colors.foreground }]}
                  value={time}
                  onChangeText={(v) => updateTime(idx, v)}
                  placeholder={t.reminderTimePlaceholder ?? 'HH:MM (e.g. 08:00)'}
                  placeholderTextColor={colors.muted}
                  keyboardType="default"
                  returnKeyType="done"
                  maxLength={5}
                />
              </View>
            ))}
            <Pressable onPress={addTime} style={[styles.addTimeBtn, { borderColor: formColor }]}>
              <IconSymbol name="plus.circle.fill" size={16} color={formColor} />
              <Text style={[styles.addTimeBtnText, { color: formColor }]}>{t.addTime}</Text>
            </Pressable>

            {/* Quantity + Days Supply — inline row */}
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t.quantity.toUpperCase()}</Text>
                <TextInput
                  value={formQuantity}
                  onChangeText={setFormQuantity}
                  placeholder={t.quantityPlaceholder}
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>DAYS SUPPLY</Text>
                <TextInput
                  value={formDaysSupply}
                  onChangeText={setFormDaysSupply}
                  placeholder={t.supplyDaysPlaceholder ?? 'e.g. 30'}
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                />
              </View>
            </View>

            {/* Pharmacy — auto-complete with saved suggestions */}
            <PharmacyAutocomplete
              ref={pharmacyRef}
              name={formPharmacyName}
              onNameChange={setFormPharmacyName}
              phone={formPharmacyPhone}
              onPhoneChange={setFormPharmacyPhone}
              address={formPharmacyAddress}
              onAddressChange={setFormPharmacyAddress}
              colors={colors}
            />

            {/* Rx Number + Refills Remaining — inline row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 2 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>RX # (optional)</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={formRxNumber}
                  onChangeText={setFormRxNumber}
                  placeholder="e.g. 1234567"
                  placeholderTextColor={colors.muted}
                  keyboardType="default"
                  autoCapitalize="none"
                  returnKeyType="done"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>REFILLS LEFT</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={formRefillsRemaining}
                  onChangeText={setFormRefillsRemaining}
                  placeholder="e.g. 3"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Start / End / Refill dates — text inputs with calendar picker */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>START DATE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[styles.textInput, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={formStartDate}
                onChangeText={v => {
                  if (!v.trim()) { setFormStartDate(''); return; }
                  const iso = parseNaturalDate(v);
                  if (iso) { setFormStartDate(iso); return; }
                  setFormStartDate(v);
                }}
                placeholder="e.g. today, Jan 15, 3 days ago"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => { setShowStartDatePicker(true); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 20 }}>📅</Text>
              </TouchableOpacity>
            </View>
            {showStartDatePicker && (
              <DateTimePickerField
                label=""
                value={formStartDate ? new Date(formStartDate + 'T12:00:00') : new Date()}
                onChange={d => {
                  if (d) {
                    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    setFormStartDate(iso);
                  }
                  setShowStartDatePicker(false);
                }}
                mode="date"
                showTodayChip
                autoDismiss
                minimumDate={editingMed && editingMed.doseLogs && editingMed.doseLogs.length > 0
                  ? new Date(Math.min(...editingMed.doseLogs.map(l => new Date(l.loggedAt).getTime())))
                  : undefined}
              />
            )}

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>END DATE (optional — leave if ongoing)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[styles.textInput, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={formEndDate}
                onChangeText={v => {
                  if (!v.trim()) { setFormEndDate(''); return; }
                  const iso = parseNaturalDate(v);
                  if (iso) { setFormEndDate(iso); return; }
                  setFormEndDate(v);
                }}
                placeholder="e.g. in 30 days, next Monday, Dec 31"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => { setShowEndDatePicker(true); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 20 }}>📅</Text>
              </TouchableOpacity>
            </View>
            {showEndDatePicker && (
              <DateTimePickerField
                label=""
                value={formEndDate ? new Date(formEndDate + 'T12:00:00') : new Date()}
                onChange={d => {
                  if (d) {
                    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    setFormEndDate(iso);
                  }
                  setShowEndDatePicker(false);
                }}
                mode="date"
                optional
                autoDismiss
              />
            )}
            {formEndDate ? (
              <Pressable onPress={() => setFormEndDate('')} style={{ alignSelf: 'flex-start', marginTop: -4, marginBottom: 4 }}>
                <Text style={{ color: colors.error, fontSize: 12 }}>✕ Clear end date</Text>
              </Pressable>
            ) : null}



            {/* Colour */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t.color.toUpperCase()}</Text>
            <View style={styles.colorRow}>
              {MED_COLORS.map((c) => (
                <Pressable key={c} onPress={() => setFormColor(c)}
                  style={[styles.colorSwatch, { backgroundColor: c }, formColor === c && styles.colorSwatchSelected]}>
                  {formColor === c && <IconSymbol name="checkmark" size={12} color="#FFFFFF" />}
                </Pressable>
              ))}
            </View>

            {/* Notes */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NOTES</Text>
            <TextInput value={formNotes} onChangeText={setFormNotes} placeholder={t.notesPlaceholder}
              placeholderTextColor={colors.muted} multiline numberOfLines={3} returnKeyType="done"
              style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} />
          </ScrollView>
        </View>
      </Modal>

      {/* Main content */}
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={22} color={colors.primary} />
            <Text style={[styles.headerBackText, { color: colors.primary }]}>Back</Text>
          </Pressable>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>{t.tabTitle}</Text>
          <Pressable
            onPress={openAdd}
            style={({ pressed }) => [styles.addFab, { backgroundColor: colors.primary }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <IconSymbol name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {TABS.map((tab) => {
            const isToday = tab.id === 'today';
            const inner = (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTabPersisted(tab.id)}
                style={[
                  styles.tabItem,
                  activeTab === tab.id && [styles.tabItemActive, { borderBottomColor: colors.primary }],
                ]}
              >
                <Text style={[
                  styles.tabLabel,
                  { color: activeTab === tab.id ? colors.primary : colors.muted },
                ]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
            if (isToday) {
              return (
                <RNAnimated.View key={tab.id} style={{ flex: 1, transform: [{ scale: todayTabPulse }] }}>
                  {inner}
                </RNAnimated.View>
              );
            }
            return inner;
          })}
        </View>

        {/* ── Adherence Card (shown on all tabs) ── */}
        {/* Free users see a locked card; premium users see the full adherence analytics */}
        {!isMedPremium && meds.filter((m: any) => m.active !== false && (m.scheduleTimes ?? []).length > 0).length > 0 && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 10,
              backgroundColor: isDark ? '#0f172a' : '#F8FAFC',
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: isDark ? '#0a7ea440' : '#BAE6FD',
            }}
          >
            {/* Top row: icon + text + lock */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: isDark ? '#0a7ea430' : '#E0F2FE',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 20 }}>📊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#38BDF8' : '#0369A1', lineHeight: 18 }}>
                  {t.weeklyAdherence ?? 'Weekly Adherence'} — Premium
                </Text>
                <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#64748B', lineHeight: 15, marginTop: 1 }}>
                  {t.adherenceStatsLocked ?? 'Unlock adherence stats, streaks & 7-day charts.'}
                </Text>
              </View>
              <Text style={{ fontSize: 16 }}>🔒</Text>
            </View>
            {/* CTA row — matches A1C card pattern */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => {
                  logEvent('adherence_upgrade_tap', { source: 'medications_locked_card' });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  requireAdherencePremium(() => {}, { feature: 'Medications Tracker' })();
                }}
                style={{
                  flex: 1,
                  backgroundColor: isDark ? '#0a7ea4' : '#0369A1',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                  {t.adherenceUpgradeCta ?? 'Upgrade to Unlock →'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  logEvent('adherence_learn_more_tap', { source: 'medications_locked_card' });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/settings/premium-compare' as any);
                }}
                style={{ paddingHorizontal: 4, paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 11, color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '600' }}>
                  {t.adherenceLearnMore ?? 'Learn more ›'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {isMedPremium && (() => {
          const activeMedsWithSchedule = meds.filter((m: any) => m.active !== false && (m.scheduleTimes ?? []).length > 0);
          if (activeMedsWithSchedule.length === 0) return null;
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - 6);
          let totalScheduled = 0, totalTaken = 0;
          for (let d = 0; d < 7; d++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + d);
            const dayKey = day.toISOString().split('T')[0];
            const isToday = dayKey === new Date().toISOString().split('T')[0];
            const dayNowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : 24 * 60;
            for (const med of activeMedsWithSchedule) {
              for (const t of (med.scheduleTimes ?? [])) {
                const [hh, mm] = t.split(':').map(Number);
                if (isToday && (hh * 60 + mm) > dayNowMin + 60) continue;
                totalScheduled++;
                if ((med.doseLogs ?? []).some((l: any) => l.date === dayKey && l.scheduledTime === t && l.status === 'taken')) totalTaken++;
              }
            }
          }
          if (totalScheduled === 0) return null;
          const pct = Math.round((totalTaken / totalScheduled) * 100);
          const barColor = pct >= 80 ? (isDark ? '#4ADE80' : '#16A34A') : pct >= 50 ? (isDark ? '#FBBF24' : '#D97706') : (isDark ? '#F87171' : '#DC2626');
          const bgColor = pct >= 80 ? (isDark ? '#052E16' : '#F0FDF4') : pct >= 50 ? (isDark ? '#451A03' : '#FFFBEB') : (isDark ? '#450A0A' : '#FFF1F2');
          const borderColor = pct >= 80 ? (isDark ? '#16A34A50' : '#BBF7D0') : pct >= 50 ? (isDark ? '#D9770650' : '#FDE68A') : (isDark ? '#DC262650' : '#FECDD3');
          const goalMet = pct >= adherenceGoal;
          const goalBarColor = goalMet ? (isDark ? '#4ADE80' : '#16A34A') : (isDark ? '#FBBF24' : '#D97706');

          // 7-day bar chart
          const dayBars = Array.from({ length: 7 }, (_, d) => {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + d);
            const dayKey = day.toISOString().split('T')[0];
            const isToday = dayKey === new Date().toISOString().split('T')[0];
            const dayNowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : 24 * 60;
            let dayScheduled = 0, dayTaken = 0, dayMissed = 0, daySkipped = 0;
            for (const med of activeMedsWithSchedule) {
              for (const t of (med.scheduleTimes ?? [])) {
                const [hh, mm] = t.split(':').map(Number);
                if (isToday && (hh * 60 + mm) > dayNowMin + 60) continue;
                dayScheduled++;
                const log = (med.doseLogs ?? []).find((l: any) => l.date === dayKey && l.scheduledTime === t);
                if (log?.status === 'taken') dayTaken++;
                else if (log?.status === 'missed') dayMissed++;
                else if (log?.status === 'skipped') daySkipped++;
              }
            }
            return { label: ['Su','Mo','Tu','We','Th','Fr','Sa'][day.getDay()], dayScheduled, dayTaken, dayMissed, daySkipped, isToday };
          });
          const maxBarDoses = Math.max(...dayBars.map(b => b.dayScheduled), 1);
          const BAR_H = 40;

          // 4-week sparkline
          const weeklySparkline = Array.from({ length: 4 }, (_, wi) => {
            const wStart = new Date();
            wStart.setDate(wStart.getDate() - (3 - wi) * 7 - 6);
            let wSched = 0, wTaken = 0;
            for (let dd = 0; dd < 7; dd++) {
              const day = new Date(wStart);
              day.setDate(wStart.getDate() + dd);
              const dayKey = day.toISOString().split('T')[0];
              const isToday2 = dayKey === new Date().toISOString().split('T')[0];
              const dayNowMin2 = isToday2 ? (new Date().getHours() * 60 + new Date().getMinutes()) : 24 * 60;
              for (const med of activeMedsWithSchedule) {
                for (const t of (med.scheduleTimes ?? [])) {
                  const [hh2, mm2] = t.split(':').map(Number);
                  if (isToday2 && (hh2 * 60 + mm2) > dayNowMin2 + 60) continue;
                  wSched++;
                  if ((med.doseLogs ?? []).some((l: any) => l.date === dayKey && l.scheduledTime === t && l.status === 'taken')) wTaken++;
                }
              }
            }
            return wSched > 0 ? Math.round((wTaken / wSched) * 100) : null;
          });
          const sparkMax = Math.max(...weeklySparkline.filter((v): v is number => v !== null), adherenceGoal, 1);
          const SPARK_H = 28;

          // Schedule (or cancel) the weekly adherence notification whenever the card re-renders
          // Only schedule on Sundays (day 6) after 18:00, or if today is the last day of the week
          // We debounce by checking if today is Sunday — schedule once per render on Sundays
          (() => {
            const today = new Date();
            if (today.getDay() === 0 && today.getHours() >= 18) {
              // Sunday evening — schedule for next Sunday if below goal
              scheduleWeeklyAdherenceNotification(pct, adherenceGoal).catch(() => {});
            }
          })();

          // ── Adherence streak: consecutive days at or above goal ──
          const streakDays = (() => {
            let streak = 0;
            const today = new Date();
            for (let d = 0; d < 365; d++) {
              const day = new Date(today);
              day.setDate(today.getDate() - d);
              const dayKey = day.toISOString().split('T')[0];
              const isToday3 = d === 0;
              const dayNowMin3 = isToday3 ? (today.getHours() * 60 + today.getMinutes()) : 24 * 60;
              let dSched = 0, dTaken = 0;
              for (const med of activeMedsWithSchedule) {
                for (const t of (med.scheduleTimes ?? [])) {
                  const [hh3, mm3] = t.split(':').map(Number);
                  if (isToday3 && (hh3 * 60 + mm3) > dayNowMin3 + 60) continue;
                  dSched++;
                  if ((med.doseLogs ?? []).some((l: any) => l.date === dayKey && l.scheduledTime === t && l.status === 'taken')) dTaken++;
                }
              }
              if (dSched === 0) { if (d === 0) continue; else break; }
              const dayPct = Math.round((dTaken / dSched) * 100);
              if (dayPct >= adherenceGoal) streak++;
              else break;
            }
            return streak;
          })();

          const generateAdherencePdf = async (sendEmail: boolean) => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
              const dateStr = new Date().toISOString().slice(0, 10);
              const chartRows = dayBars.map(bar => {
                const takenPct = bar.dayScheduled > 0 ? Math.round((bar.dayTaken / bar.dayScheduled) * 100) : 0;
                const statusColor = takenPct >= adherenceGoal ? '#16A34A' : takenPct >= 50 ? '#D97706' : '#DC2626';
                const barWidth = bar.dayScheduled > 0 ? Math.round((bar.dayTaken / maxBarDoses) * 100) : 0;
                return `<tr>
                  <td style="font-weight:${bar.isToday ? '700' : '400'};color:${bar.isToday ? '#0a7ea4' : '#111'}">${bar.label}${bar.isToday ? ' (today)' : ''}</td>
                  <td>${bar.dayScheduled}</td><td style="color:#16A34A">${bar.dayTaken}</td>
                  <td style="color:#DC2626">${bar.dayMissed}</td><td style="color:#D97706">${bar.daySkipped}</td>
                  <td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:10px;background:#eee;border-radius:5px;overflow:hidden"><div style="height:10px;width:${barWidth}%;background:${statusColor};border-radius:5px"></div></div><span style="font-weight:700;color:${statusColor};min-width:32px">${takenPct}%</span></div></td>
                </tr>`;
              }).join('');
              const sparkRows = weeklySparkline.map((v, wi) => {
                const wLabel = wi === 3 ? 'This week' : wi === 2 ? '1 wk ago' : wi === 1 ? '2 wks ago' : '3 wks ago';
                const sc = v === null ? '#999' : v >= adherenceGoal ? '#16A34A' : v >= 50 ? '#D97706' : '#DC2626';
                return `<tr><td>${wLabel}</td><td style="color:${sc};font-weight:700">${v !== null ? v + '%' : 'No data'}</td></tr>`;
              }).join('');
              const mL2 = (medPdfStrings as unknown as Record<string, typeof medPdfStrings.en>)[lang] ?? medPdfStrings.en;
              const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
                body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:600px;margin:0 auto}
                h1{color:#0a7ea4;font-size:20px;margin-bottom:4px} h2{color:#0a7ea4;font-size:14px;margin:16px 0 8px}
                .sub{color:#666;font-size:12px;margin-bottom:20px}
                .summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
                .stat{text-align:center;padding:10px 16px;border-radius:8px;background:#f5f5f5;min-width:80px}
                .stat-val{font-size:22px;font-weight:700} .stat-lbl{font-size:10px;color:#666;margin-top:2px}
                .goal-row{padding:10px 14px;border-radius:8px;background:${pct >= adherenceGoal ? '#F0FDF4' : '#FFFBEB'};border:1px solid ${pct >= adherenceGoal ? '#BBF7D0' : '#FDE68A'};margin-bottom:20px;font-size:13px}
                table{width:100%;border-collapse:collapse;font-size:12px}
                th{background:#0a7ea4;color:#fff;padding:8px 6px;text-align:left}
                td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:middle}
                tr:nth-child(even) td{background:#f9f9f9}
                .footer{margin-top:20px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:10px}
              </style></head><body>
                <h1>${mL2.weeklyReportTitle}</h1>
                <div class="sub">${mL2.generatedOn} ${new Date().toLocaleDateString()} · 7-day window ending today</div>
                <div class="goal-row"><strong>${mL2.adherenceGoal}: ${adherenceGoal}%</strong> &nbsp;·&nbsp; ${mL2.thisWeek}: <strong style="color:${pct >= adherenceGoal ? '#16A34A' : '#D97706'}">${pct}%</strong> &nbsp;·&nbsp; ${pct >= adherenceGoal ? mL2.goalMet : `${adherenceGoal - pct}% ${mL2.belowGoal}`}</div>
                <div class="summary">
                  <div class="stat"><div class="stat-val" style="color:#0a7ea4">${pct}%</div><div class="stat-lbl">${mL2.statAdherence}</div></div>
                  <div class="stat"><div class="stat-val" style="color:#16A34A">${totalTaken}</div><div class="stat-lbl">${mL2.statTaken}</div></div>
                  <div class="stat"><div class="stat-val" style="color:#DC2626">${dayBars.reduce((s, b) => s + b.dayMissed, 0)}</div><div class="stat-lbl">${mL2.statMissed}</div></div>
                  <div class="stat"><div class="stat-val" style="color:#D97706">${dayBars.reduce((s, b) => s + b.daySkipped, 0)}</div><div class="stat-lbl">${mL2.statSkipped}</div></div>
                  <div class="stat"><div class="stat-val">${totalScheduled}</div><div class="stat-lbl">${mL2.statTotal}</div></div>
                </div>
                <h2>${mL2.sevenDayDetail}</h2>
                <table><thead><tr><th>${mL2.colDay}</th><th>${mL2.colScheduled}</th><th>${mL2.colTaken}</th><th>${mL2.colMissed}</th><th>${mL2.colSkipped}</th><th>${mL2.colDailyRate}</th></tr></thead><tbody>${chartRows}</tbody></table>
                <h2>${mL2.fourWeekTrend}</h2>
                <table><thead><tr><th>${mL2.colPeriod}</th><th>${mL2.colAdherence}</th></tr></thead><tbody>${sparkRows}</tbody></table>
                <div class="footer">${mL2.weeklyFooter}</div>
              </body></html>`;
              const { uri: rawUri } = await Print.printToFileAsync({ html, base64: false });
              const namedUri = `${FileSystem.cacheDirectory}VitalSync_Weekly_Adherence_${dateStr}.pdf`;
              await FileSystem.copyAsync({ from: rawUri, to: namedUri });
              // Delete the raw temp file from Print.printToFileAsync immediately
              FileSystem.deleteAsync(rawUri, { idempotent: true }).catch(() => {});
              if (sendEmail) {
                const available = await MailComposer.isAvailableAsync();
                if (available) {
                  await MailComposer.composeAsync({
                    subject: `VitalSync Weekly Adherence Summary — ${new Date().toLocaleDateString()}`,
                    body: 'Hi,\n\nPlease find my weekly medication adherence summary attached.\n\nGenerated by VitalSync.',
                    attachments: [namedUri],
                  });
                  // Delete the named PDF after mail compose to prevent health data lingering in cache
                  FileSystem.deleteAsync(namedUri, { idempotent: true }).catch(() => {});
                } else {
                  Alert.alert('Mail Unavailable', 'Mail is not configured on this device. Use Share instead.');
                }
              } else {
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(namedUri, { mimeType: 'application/pdf', dialogTitle: 'Share Weekly Adherence Summary', UTI: 'com.adobe.pdf' });
                  // Delete the named PDF after sharing to prevent health data lingering in cache
                  FileSystem.deleteAsync(namedUri, { idempotent: true }).catch(() => {});
                } else {
                  Alert.alert('PDF Saved', `Weekly summary saved to: ${namedUri}`);
                }
              }
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (_e) {
              Alert.alert('Error', 'Failed to generate weekly summary PDF.');
            }
          };

          return (
            <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: bgColor, borderRadius: 12, padding: 12, borderWidth: 1, borderColor }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                <Text style={{ fontSize: 15 }}>📊</Text>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: barColor }}>{t.weeklyAdherence}: {pct}%</Text>
                {streakDays >= 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: isDark ? '#431407' : '#FFF7ED', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: isDark ? '#C2410C50' : '#FED7AA' }}>
                    <Text style={{ fontSize: 12 }}>🔥</Text>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#FB923C' : '#C2410C' }}>{streakDays}d</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => { setAdherenceGoalEditorValue(String(adherenceGoal)); setAdherenceGoalEditorVisible(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 3 }}
                >
                  <Text style={{ fontSize: 10, color: goalBarColor, fontWeight: '700' }}>{t.goalLabel}: {adherenceGoal}%</Text>
                  <Text style={{ fontSize: 9, color: colors.muted }}>✏️</Text>
                </TouchableOpacity>
              </View>
              {/* Progress bar */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ height: 7, borderRadius: 4, backgroundColor: barColor, width: `${pct}%` as any }} />
                </View>
                <View style={{ position: 'absolute', left: `${adherenceGoal}%` as any, top: 0, width: 2, height: 7, backgroundColor: isDark ? '#FFFFFF60' : '#00000040', borderRadius: 1 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={{ fontSize: 9, color: colors.muted }}>{totalTaken} / {totalScheduled} {t.dosesTaken}</Text>
                  <Text style={{ fontSize: 9, color: goalBarColor, fontWeight: '600' }}>{goalMet ? `✓ Goal met (${adherenceGoal}%)` : `${adherenceGoal - pct}% below goal`}</Text>
                </View>
              </View>
              {/* 7-day bar chart */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: BAR_H + 18, marginBottom: 8 }}>
                {dayBars.map((bar, i) => {
                  const takenH = bar.dayScheduled > 0 ? (bar.dayTaken / maxBarDoses) * BAR_H : 0;
                  const missedH = bar.dayScheduled > 0 ? (bar.dayMissed / maxBarDoses) * BAR_H : 0;
                  const skippedH = bar.dayScheduled > 0 ? (bar.daySkipped / maxBarDoses) * BAR_H : 0;
                  const emptyH = BAR_H - takenH - missedH - skippedH;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{ width: '100%', height: BAR_H, justifyContent: 'flex-end', borderRadius: 3, overflow: 'hidden', backgroundColor: colors.border + '40' }}>
                        {emptyH > 0 && <View style={{ height: emptyH }} />}
                        {skippedH > 0 && <View style={{ height: skippedH, backgroundColor: isDark ? '#FBBF24' : '#D97706' }} />}
                        {missedH > 0 && (
                          <View style={{ height: missedH }}>
                            <Svg width="100%" height={missedH}>
                              <Defs>
                                <Pattern id={`stripe-${i}`} x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                  <Rect width="6" height="6" fill={isDark ? '#F87171' : '#DC2626'} />
                                  <Line x1="0" y1="0" x2="0" y2="6" stroke={isDark ? '#7F1D1D' : '#FCA5A5'} strokeWidth="3" />
                                </Pattern>
                              </Defs>
                              <Rect width="100%" height={missedH} fill={`url(#stripe-${i})`} />
                            </Svg>
                          </View>
                        )}
                        {takenH > 0 && <View style={{ height: takenH, backgroundColor: isDark ? '#4ADE80' : '#16A34A' }} />}
                      </View>
                      <Text style={{ fontSize: 9, color: bar.isToday ? barColor : colors.muted, fontWeight: bar.isToday ? '700' : '400', marginTop: 2 }}>{bar.label}</Text>
                    </View>
                  );
                })}
              </View>
              {/* 4-week sparkline */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: SPARK_H + 20, marginBottom: 8, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 9, color: colors.muted, width: 36, textAlign: 'right', paddingBottom: 14 }}>4-wk</Text>
                {weeklySparkline.map((v, wi) => {
                  const barH = v !== null ? Math.max(3, (v / sparkMax) * SPARK_H) : 3;
                  const sc = v === null ? colors.border : v >= adherenceGoal ? (isDark ? '#4ADE80' : '#16A34A') : v >= 50 ? (isDark ? '#FBBF24' : '#D97706') : (isDark ? '#F87171' : '#DC2626');
                  const wLabel = wi === 3 ? 'Now' : wi === 2 ? '-1w' : wi === 1 ? '-2w' : '-3w';
                  const isCurrentWeek = wi === 3;
                  // Compute the date range for this sparkline week
                  const sparkWeekStart = new Date();
                  sparkWeekStart.setDate(sparkWeekStart.getDate() - (3 - wi) * 7 - 6);
                  const sparkWeekEnd = new Date(sparkWeekStart);
                  sparkWeekEnd.setDate(sparkWeekStart.getDate() + 6);
                  const sparkStartStr = sparkWeekStart.toISOString().split('T')[0];
                  const sparkEndStr = sparkWeekEnd.toISOString().split('T')[0];
                  return (
                    <TouchableOpacity
                      key={wi}
                      style={{ flex: 1, alignItems: 'center' }}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setHistoryInitialDateStart(sparkStartStr);
                        setHistoryInitialDateEnd(sparkEndStr);
                        setHistoryInitialFilter('all');
                        setActiveTabPersisted('history');
                      }}
                      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                    >
                      <Text style={{ fontSize: 8, color: sc, fontWeight: '700', marginBottom: 2 }}>{v !== null ? v + '%' : '—'}</Text>
                      <View style={{ width: '80%', height: SPARK_H, justifyContent: 'flex-end' }}>
                        <View style={{ height: barH, borderRadius: 3, backgroundColor: sc, opacity: isCurrentWeek ? 1 : 0.6 }} />
                      </View>
                      {/* Goal line */}
                      <View style={{ position: 'absolute', bottom: 14 + (adherenceGoal / sparkMax) * SPARK_H, left: 0, right: 0, height: 1, backgroundColor: isDark ? '#FFFFFF40' : '#00000020' }} />
                      <Text style={{ fontSize: 8, color: isCurrentWeek ? barColor : colors.muted, fontWeight: isCurrentWeek ? '700' : '400', marginTop: 2 }}>{wLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Legend + action buttons */}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? '#4ADE80' : '#16A34A' }} />
                  <Text style={{ fontSize: 9, color: colors.muted }}>{t.statusTaken}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Svg width={8} height={8} style={{ borderRadius: 2, overflow: 'hidden' }}>
                    <Defs>
                      <Pattern id="legend-stripe" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <Rect width="4" height="4" fill={isDark ? '#F87171' : '#DC2626'} />
                        <Line x1="0" y1="0" x2="0" y2="4" stroke={isDark ? '#7F1D1D' : '#FCA5A5'} strokeWidth="2" />
                      </Pattern>
                    </Defs>
                    <Rect width="8" height="8" fill="url(#legend-stripe)" />
                  </Svg>
                  <Text style={{ fontSize: 9, color: colors.muted }}>{t.statusMissed}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? '#FBBF24' : '#D97706' }} />
                  <Text style={{ fontSize: 9, color: colors.muted }}>{t.statusSkipped}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => generateAdherencePdf(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? '#0a7ea425' : '#E0F2FE', borderWidth: 1, borderColor: isDark ? '#0a7ea460' : '#BAE6FD', flexDirection: 'row', alignItems: 'center', gap: 3 }}
                >
                  <Text style={{ fontSize: 9, color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '700' }}>{t.adherenceShareBtn ?? '⬆ Share'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => generateAdherencePdf(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? '#0a7ea425' : '#E0F2FE', borderWidth: 1, borderColor: isDark ? '#0a7ea460' : '#BAE6FD', flexDirection: 'row', alignItems: 'center', gap: 3 }}
                >
                  <Text style={{ fontSize: 9, color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '700' }}>✉ {t.shareCaregiver}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
        {AdherenceGateSheet}

        {/* Tab content */}
        {activeTab === 'today' && (
          <TodayTab
            meds={meds}
            colors={colors}
            t={t}
            onMarkTaken={handleMarkTaken}
            onMarkSkipped={handleMarkSkipped}
            onMarkMissed={handleMarkMissed}
            onReschedule={handleReschedule}
            onDeleteDose={handleDeleteDose}
            onEditDoseTime={handleEditDoseTime}
            highlightedDoseKey={highlightedDoseKey}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            meds={meds}
            colors={colors}
            onReinstate={handleReinstate}
            onDeleteDose={handleDeleteDose}
            onEditDoseTime={handleEditDoseTime}
            scrollRef={medsScrollRef}
            onScroll={handleMedsScroll}
            initialFilter={historyInitialFilter}
            initialDateStart={historyInitialDateStart}
            initialDateEnd={historyInitialDateEnd}
          />
        )}
        {activeTab === 'mymeds' && (
          <MyMedsTab
            meds={meds}
            colors={colors}
            t={t}
            onEdit={openEdit}
            onDelete={handleDelete}
            onRefreshAI={handleRefreshAI}
            onUpdateMed={handleUpdateMed}
            allergies={allergies}
            newMedId={newMedId}
            lowStockThreshold={lowStockThreshold}
          />
        )}
      </View>      {/* ── Edit Dose Time Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={editTimeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTimeTarget(null)}
      >
        <View style={styles.overlayBg}>
          <View style={[styles.reinstateCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.reinstateTitle, { color: colors.foreground }]}>Edit Dose Time</Text>
            <Text style={[styles.reinstateSubtitle, { color: colors.muted }]}>
              Current: {editTimeTarget?.currentTime} · Enter new time (HH:MM)
            </Text>
            <TextInput
              value={editTimeValue}
              onChangeText={setEditTimeValue}
              placeholder="HH:MM"
              placeholderTextColor={colors.muted}
              style={[styles.reinstateInput, {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              }]}
              returnKeyType="done"
              onSubmitEditing={handleConfirmEditTime}
              autoFocus
            />
            <View style={styles.reinstateButtons}>
              <Pressable
                onPress={() => setEditTimeTarget(null)}
                style={[styles.reinstateCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.reinstateCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmEditTime}
                style={[styles.reinstateConfirmBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.reinstateConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Reschedule Modal ──────────────────────────────────────────────── */}
      {/* ── Missed Note Prompt Modal ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={pendingMissedNote !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingMissedNote(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={[styles.rescheduleSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rescheduleHeader}>
              <Text style={[styles.rescheduleTitle, { color: colors.foreground }]}>Why was this dose missed?</Text>
              <Pressable onPress={() => setPendingMissedNote(null)} hitSlop={12}>
                <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={[styles.rescheduleSubtitle, { color: colors.muted }]}>
              Optional — this note will appear in your History tab.
            </Text>
            {/* Quick reason chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {MISSED_REASONS.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => setMissedNoteText(reason)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: missedNoteText === reason ? colors.error : colors.border,
                    backgroundColor: missedNoteText === reason ? colors.error + '18' : colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 12, color: missedNoteText === reason ? colors.error : colors.muted, fontWeight: missedNoteText === reason ? '700' : '400' }}>
                    {reason}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 12 }]}
              value={missedNoteText}
              onChangeText={setMissedNoteText}
              placeholder="Or type a custom reason…"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              maxLength={120}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => handleConfirmMissed(undefined)}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center' as const,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>Skip note</Text>
              </Pressable>
              <Pressable
                onPress={() => handleConfirmMissed(missedNoteText || undefined)}
                style={({ pressed }) => ({
                  flex: 2,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: colors.error,
                  alignItems: 'center' as const,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Mark as Missed</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={rescheduleTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleTarget(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={[styles.rescheduleSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rescheduleHeader}>
              <Text style={[styles.rescheduleTitle, { color: colors.foreground }]}>Reschedule Dose</Text>
              <Pressable onPress={() => setRescheduleTarget(null)} hitSlop={12}>
                <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={[styles.rescheduleSubtitle, { color: colors.muted }]}>
              Choose a new time for this dose. The change will apply to all future doses at this scheduled time.
            </Text>

            {/* Quick Snooze chip */}
            <Pressable
              onPress={handleSnooze15}
              style={({ pressed }) => [{
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                alignSelf: 'flex-start' as const,
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: colors.warning,
                backgroundColor: pressed ? colors.warning + '22' : colors.warning + '11',
                marginBottom: 14,
              }]}
            >
              <Text style={{ fontSize: 15 }}>⏰</Text>
              <Text style={{ color: colors.warning, fontSize: 13, fontWeight: '700' as const }}>
                {t.snooze15minLabel}
              </Text>
            </Pressable>

            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.primary, color: colors.foreground, marginBottom: 8 }]}
              value={rescheduleNewTime}
              onChangeText={setRescheduleNewTime}
              placeholder="HH:MM (e.g. 09:30)"
              placeholderTextColor={colors.muted}
              keyboardType="default"
              returnKeyType="done"
              maxLength={5}
            />
            <Pressable
              onPress={handleConfirmReschedule}
              style={[styles.rescheduleConfirmBtn, { backgroundColor: colors.primary }]}
            >
              <IconSymbol name="checkmark.circle.fill" size={18} color="#FFFFFF" />
              <Text style={styles.rescheduleConfirmText}>Confirm Reschedule</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ScrollToTopButton opacity={medsScrollTopOpacity} visible={showMedsScrollTop} onPress={medsScrollToTop} />

      {/* ── Post-save interaction check banner (non-blocking, dismissible) ── */}
      {postSaveInteractionResult && (
        <View
          style={[
            styles.postSaveInteractionOverlay,
            { backgroundColor: colors.surface, borderColor: colors.warning, shadowColor: colors.foreground },
          ]}
        >
          {/* Header row */}
          <View style={styles.postSaveInteractionHeader}>
            <Text style={styles.postSaveInteractionIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.postSaveInteractionTitle, { color: colors.foreground }]}>
                Interaction Check — {postSaveInteractionResult.newMedName}
              </Text>
              <Text style={[styles.postSaveInteractionSubtitle, { color: colors.muted }]}>
                {postSaveInteractionResult.interactions.length} potential interaction
                {postSaveInteractionResult.interactions.length !== 1 ? 's' : ''} detected
              </Text>
            </View>
            <Pressable
              onPress={() => setPostSaveInteractionResult(null)}
              style={({ pressed }) => [styles.postSaveInteractionDismiss, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.postSaveInteractionDismissText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          {/* Interaction rows */}
          {postSaveInteractionResult.interactions.map((ix, i) => (
            <Pressable
              key={i}
              onPress={() => {
                if (ix.drug1 && ix.drug2) {
                  setSelectedInteractionPair({ drug1: ix.drug1, drug2: ix.drug2, severity: ix.severity });
                  interactionDetailMutation.mutate({ medications: [{ id: ix.drug1 ?? '', name: ix.drug1 ?? '' }, { id: ix.drug2 ?? '', name: ix.drug2 ?? '' }] });
                }
              }}
              style={({ pressed }) => [
                styles.postSaveInteractionRow,
                { borderTopColor: colors.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={styles.postSaveInteractionRowHeader}>
                <View
                  style={[
                    styles.postSaveSeverityBadge,
                    {
                      backgroundColor:
                        ix.severity === 'major'
                          ? 'rgba(239,68,68,0.15)'
                          : 'rgba(245,158,11,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.postSaveSeverityText,
                      { color: ix.severity === 'major' ? colors.error : colors.warning },
                    ]}
                  >
                    {(ix.severity ?? 'moderate').toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.postSaveInteractionDrug, { color: colors.foreground }]}>
                  {ix.drug}
                </Text>
                {ix.drug1 && ix.drug2 && (
                  <Text style={{ fontSize: 11, color: colors.primary, marginLeft: 6 }}>Details →</Text>
                )}
              </View>
              <Text style={[styles.postSaveInteractionDesc, { color: colors.muted }]}>
                {ix.description}
              </Text>
            </Pressable>
          ))}

          {/* Disclaimer — always shown */}
          <View style={[styles.postSaveDisclaimerBox, { borderColor: colors.border, backgroundColor: 'rgba(245,158,11,0.08)' }]}>
            <Text style={styles.postSaveDisclaimerIcon}>👨‍⚕️</Text>
            <Text style={[styles.postSaveDisclaimerText, { color: colors.foreground }]}>
              {t.disclaimerLabel ?? 'Disclaimer'}: 
              {postSaveInteractionResult.disclaimer}
            </Text>
          </View>
        </View>
      )}
      {/* Interaction Detail Sheet */}
      <Modal
        visible={selectedInteractionPair !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedInteractionPair(null)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
              {selectedInteractionPair ? `${selectedInteractionPair.drug1} ↔ ${selectedInteractionPair.drug2}` : 'Interaction Detail'}
            </Text>
            <Pressable
              onPress={() => setSelectedInteractionPair(null)}
              style={({ pressed }) => [styles.modalCloseBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.modalCloseBtnText, { color: colors.muted }]}>Done</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {interactionDetailMutation.isPending && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.muted, marginTop: 12, fontSize: 13 }}>Loading clinical detail…</Text>
              </View>
            )}

            {interactionDetailMutation.data && !interactionDetailMutation.isPending && (() => {
              const d = interactionDetailMutation.data as any;
              const sev = d.severity ?? 'UNKNOWN';
              const sevColor = sev === 'MAJOR' ? colors.error : sev === 'MODERATE' ? colors.warning : colors.success;
              const sevBg = sev === 'MAJOR' ? 'rgba(239,68,68,0.12)' : sev === 'MODERATE' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)';
              return (
                <>
                  {/* Severity badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ backgroundColor: sevBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
                      <Text style={{ color: sevColor, fontWeight: '700', fontSize: 13 }}>{sev}</Text>
                    </View>
                    {d.onsetTime && (
                      <Text style={{ color: colors.muted, fontSize: 12 }}>Onset: {d.onsetTime}</Text>
                    )}
                    {d.documentation && (
                      <Text style={{ color: colors.muted, fontSize: 12 }}>• {d.documentation}</Text>
                    )}
                  </View>

                  {/* Mechanism */}
                  {d.mechanism && (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 }}>MECHANISM</Text>
                      <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>{d.mechanism}</Text>
                    </View>
                  )}

                  {/* Clinical Significance */}
                  {d.clinicalSignificance && (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 }}>CLINICAL SIGNIFICANCE</Text>
                      <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>{d.clinicalSignificance}</Text>
                    </View>
                  )}

                  {/* Management */}
                  {d.management && (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 }}>MANAGEMENT</Text>
                      <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>{d.management}</Text>
                    </View>
                  )}

                  {/* Disclaimer — always shown */}
                  <View style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 18 }}>👨‍⚕️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>{t.disclaimerLabel ?? 'Disclaimer'}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>{d.disclaimer}</Text>
                    </View>
                  </View>
                </>
              );
            })()}

            {interactionDetailMutation.isError && (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Text style={{ color: colors.error, fontSize: 14 }}>Could not load interaction detail. Please try again.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Undo Taken toast (5-minute grace window) ─────────────────────────────────────── */}
      {undoTaken && (
        <Animated.View
          style={[
            styles.undoToastContainer,
            { backgroundColor: colors.surface, borderColor: colors.border },
            undoToastAnimStyle,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.undoToastInner}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.undoToastTitle, { color: colors.foreground }]}>
                {undoTaken.medName} marked taken
              </Text>
              <Text style={[styles.undoToastSub, { color: colors.muted }]}>
                {(t.scheduledDoseLabel ?? 'Scheduled {time}').replace('{time}', undoTaken.scheduledTime)}
              </Text>
            </View>
            {/* Live countdown */}
            <Text style={[styles.undoCountdown, { color: colors.muted }]}>
              {`${Math.floor(undoSecondsLeft / 60)}:${String(undoSecondsLeft % 60).padStart(2, '0')}`}
            </Text>
            <Pressable
              onPress={handleUndoTaken}
              style={[styles.undoBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.undoBtnText}>Undo</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                if (undoCountdownRef.current) clearInterval(undoCountdownRef.current);
                undoToastTranslateY.value = withTiming(80, { duration: 220 });
                undoToastOpacity.value = withTiming(0, { duration: 180 });
                setTimeout(() => setUndoTaken(null), 230);
              }}
              style={styles.undoDismissBtn}
            >
              <Text style={[styles.undoDismissText, { color: colors.muted }]}>×</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}      {/* ── Undo Missed toast (5-minute grace window) ───────────────────────────────────────── */}
      {undoMissed && (
        <Animated.View
          style={[
            styles.undoToastContainer,
            { backgroundColor: colors.surface, borderColor: colors.error + '88' },
            undoMissedToastAnimStyle,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.undoToastInner}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.undoToastTitle, { color: colors.foreground }]}>
                {undoMissed.medName} marked missed
              </Text>
              <Text style={[styles.undoToastSub, { color: colors.muted }]}>
                {(t.scheduledDoseLabel ?? 'Scheduled {time}').replace('{time}', undoMissed.scheduledTime)}
              </Text>
            </View>
            <Text style={[styles.undoCountdown, { color: colors.muted }]}>
              {`${Math.floor(undoMissedSecondsLeft / 60)}:${String(undoMissedSecondsLeft % 60).padStart(2, '0')}`}
            </Text>
            <Pressable
              onPress={handleUndoMissed}
              style={[styles.undoBtn, { backgroundColor: colors.error }]}
            >
              <Text style={styles.undoBtnText}>Undo</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (undoMissedTimerRef.current) clearTimeout(undoMissedTimerRef.current);
                if (undoMissedCountdownRef.current) clearInterval(undoMissedCountdownRef.current);
                undoMissedToastTranslateY.value = withTiming(80, { duration: 220 });
                undoMissedToastOpacity.value = withTiming(0, { duration: 180 });
                setTimeout(() => setUndoMissed(null), 230);
                setHistoryInitialFilter('missed');
                setActiveTabPersisted('history');
              }}
              style={styles.undoDismissBtn}
            >
              <Text style={[styles.undoDismissText, { color: colors.muted }]}>×</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* ── Reschedule confirmation toast ────────────────────────────────────────────────────── */}
      {rescheduleToastMsg && (
        <View
          style={[
            styles.rescheduleToastContainer,
            { backgroundColor: colors.surface, borderColor: colors.success },
          ]}
        >
          <View style={[styles.rescheduleToastDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.rescheduleToastText, { color: colors.foreground, flex: 1 }]}>
            {rescheduleToastMsg}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setRescheduleToastMsg(null);
              if (rescheduleToastTimerRef.current) clearTimeout(rescheduleToastTimerRef.current);
              setHistoryInitialFilter('rescheduled');
              setActiveTabPersisted('history');
            }}
            hitSlop={8}
            style={{ marginLeft: 8 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>View →</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* ── Adherence Goal Editor Modal ── */}
      <Modal
        visible={adherenceGoalEditorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAdherenceGoalEditorVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: isDark ? '#1e2022' : '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, borderTopWidth: 1, borderColor: isDark ? '#334155' : '#E5E7EB' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#ECEDEE' : '#11181C' }}>{t.adherenceSetGoal ?? 'Set Adherence Goal'}</Text>
              <Pressable onPress={() => setAdherenceGoalEditorVisible(false)} hitSlop={12}>
                <IconSymbol name="xmark.circle.fill" size={24} color={isDark ? '#9BA1A6' : '#687076'} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 13, color: isDark ? '#9BA1A6' : '#687076', marginBottom: 16 }}>
              {(t.adherenceCurrentGoal ?? 'Set your weekly medication adherence target. Current goal: {goal}%').replace('{goal}', String(adherenceGoal))}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[70, 75, 80, 85, 90, 95, 100].map((preset) => {
                const isSelected = adherenceGoal === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => setAdherenceGoalEditorValue(String(preset))}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: isSelected ? '#0a7ea4' : (isDark ? '#2a2d2f' : '#F3F4F6'), borderWidth: 1, borderColor: isSelected ? '#0a7ea4' : (isDark ? '#334155' : '#E5E7EB') }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#fff' : (isDark ? '#ECEDEE' : '#11181C') }}>{preset}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Text style={{ fontSize: 13, color: isDark ? '#9BA1A6' : '#687076' }}>Custom:</Text>
              <TextInput
                value={adherenceGoalEditorValue}
                onChangeText={(v) => setAdherenceGoalEditorValue(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                returnKeyType="done"
                style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: isDark ? '#334155' : '#E5E7EB', backgroundColor: isDark ? '#2a2d2f' : '#F9FAFB', color: isDark ? '#ECEDEE' : '#11181C', paddingHorizontal: 12, fontSize: 15 }}
                placeholder="e.g. 90"
                placeholderTextColor={isDark ? '#9BA1A6' : '#687076'}
              />
              <Text style={{ fontSize: 13, color: isDark ? '#9BA1A6' : '#687076' }}>%</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                const v = parseInt(adherenceGoalEditorValue, 10);
                if (isNaN(v) || v < 1 || v > 100) { Alert.alert('Invalid', 'Enter a value between 1 and 100.'); return; }
                setAdherenceGoal(v);
                setAdherenceGoalEditorVisible(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              style={{ backgroundColor: '#0a7ea4', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Save Goal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, paddingHorizontal: 16 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12,
  },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  headerBackText: { fontSize: 16, fontWeight: '500' },
  screenTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  addFab: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    marginBottom: 12, overflow: 'hidden',
  },
  tabItem: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: {},
  tabLabel: { fontSize: 13, fontWeight: '600' },

  // Tab content
  tabContent: { paddingBottom: 100 },

  // Section labels
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  markAllBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  routeBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  routeBadgeText: { fontSize: 13 },

  // Dose cards
  doseCard: { marginBottom: 10 },
  doseCardInner: {}, // used inside SwipeableDoseCard (no marginBottom — parent handles it)
  doseCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dueBadgeText: { fontSize: 11, fontWeight: '700' },

  // Card buttons
  cardButtons: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  skipBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  skipBtnText: { fontWeight: '600', fontSize: 14 },

  // History
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 0.5,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyMedName: { fontSize: 14, fontWeight: '600' },
  historyMeta: { fontSize: 12, marginTop: 2 },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  reinstateBtn: { paddingHorizontal: 8, paddingVertical: 3 },
  reinstateBtnText: { fontSize: 12, fontWeight: '600' },

  // Reinstate modal
  reinstateCard: {
    width: '90%', borderRadius: 20, padding: 24,
    gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
  },
  reinstateTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  reinstateSubtitle: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  reinstateInput: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 20, textAlign: 'center',
  },
  reinstateButtons: { flexDirection: 'row', gap: 10 },
  reinstateCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    alignItems: 'center',
  },
  reinstateCancelText: { fontWeight: '600', fontSize: 15 },
  reinstateConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  reinstateConfirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  // My Meds
  myMedCard: { marginBottom: 10 },
  indicationChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  indicationChipText: { fontSize: 11, fontWeight: '600' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  medName: { fontSize: 16, fontWeight: '700' },
  medDose: { fontSize: 13, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  iconBtn: { padding: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 11 },

  // Expanded section
  expandedSection: { borderTopWidth: 0.5, marginTop: 10, paddingTop: 12, gap: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { fontSize: 14, fontWeight: '500' },
  detailMeta: { fontSize: 12, marginTop: 2 },

  // Insight sections
  aiSection: { gap: 6 },
  aiSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiSectionTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  refreshBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  refreshBtnText: { fontSize: 12, fontWeight: '600' },
  aiPlaceholder: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },

  // Side effects
  sideEffectGroup: { gap: 4 },
  sideEffectFreq: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  sideEffectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sideEffectDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  sideEffectName: { fontSize: 13, fontWeight: '600' },
  sideEffectDesc: { fontSize: 12, lineHeight: 16 },

  // Severity filter chip row (above interaction banners)
  severityFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  severityChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  severityChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Drug interaction banner
  interactionBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  interactionIcon: { fontSize: 20 },
  interactionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  interactionSeverityBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  interactionPair: { fontSize: 14, fontWeight: '700', flex: 1 },
  interactionDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  interactionDisclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  interactionDisclaimerIcon: { fontSize: 16 },
  interactionDisclaimerText: { fontSize: 12, lineHeight: 17, flex: 1 },
  interactionSeverity: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  // Drug interactions
  interactionRow: {
    borderLeftWidth: 3, paddingLeft: 10, gap: 3,
  },
  interactionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  interactionDrug: { fontSize: 13, fontWeight: '700', flex: 1 },
  severityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  severityText: { fontSize: 10, fontWeight: '700' },
  // Empty statee
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 32, paddingTop: 60,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

  // Disclaimer modal
  overlayBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  disclaimerCard: {
    width: '100%', borderRadius: 24, padding: 28,
    alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
  },
  disclaimerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  disclaimerBody: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  disclaimerBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24, marginTop: 4 },
  disclaimerBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  // Add/Edit modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalHeaderBtn: { padding: 4, minWidth: 60, alignItems: 'center' },
  modalHeaderBtnText: { fontSize: 16 },
  modalCloseBtn: { padding: 4, minWidth: 48, alignItems: 'flex-end' },
  modalCloseBtnText: { fontSize: 16, fontWeight: '500' },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, gap: 6, paddingBottom: 60 },

  // Form fields
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 12 },
  fieldHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 4 },
  callPharmacyBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  callPharmacyText: { fontSize: 13, fontWeight: '600' },
  closedBadge: {
    backgroundColor: '#F59E0B22',
    borderWidth: 1,
    borderColor: '#F59E0B88',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closedBadgeText: { fontSize: 10, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.3 },
  hoursChip: { fontSize: 11, fontWeight: '600' },
  lastRequestedNote: { fontSize: 11, marginTop: 2, paddingHorizontal: 2 },
  textInput: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, marginTop: 6,
  },
  textArea: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, marginTop: 6,
    minHeight: 80, textAlignVertical: 'top',
  },
  chipScroll: { marginTop: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  timeInput: {
    flex: 1, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  removeTimeBtn: { padding: 4 },
  addTimeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  addTimeBtnText: { fontSize: 14, fontWeight: '600' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  colorSwatchSelected: {
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  // Autocomplete dropdown
  suggestionList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    maxHeight: 220,
    zIndex: 999,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionName: { fontSize: 15, fontWeight: '600' },
  suggestionGeneric: { fontSize: 13 },
  suggestionIndication: { fontSize: 12, marginTop: 2 },
  suggestionRoute: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  // Auto-fill info row
  autoFillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 4,
  },
  autoFillLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  autoFillValue: { fontSize: 13, flex: 1 },
  rescheduleSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 24,
    paddingBottom: 36,
  },
  rescheduleHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  rescheduleTitle: { fontSize: 18, fontWeight: '700' as const },
  rescheduleSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  rescheduleConfirmBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  rescheduleConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' as const },

  // Vision Scan card
  visionScanCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 4,
  },
  visionScanHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visionScanIcon: { fontSize: 22 },
  visionScanTitle: { fontSize: 16, fontWeight: '700', color: '#9A3412' },
  visionScanDesc: { fontSize: 13, lineHeight: 18, color: '#7C2D12' },
  visionScanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#EA580C', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20, marginTop: 4,
  },
  visionScanBtnIcon: { fontSize: 18 },
  visionScanBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Live dictation box
  dictationBox: {
    borderRadius: 14, borderWidth: 1, padding: 14, gap: 8, marginBottom: 4,
  },
  dictationBoxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dictationBoxLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  dictationBoxHint: { fontSize: 11 },
  dictationInput: {
    fontSize: 14, lineHeight: 20, minHeight: 72,
    textAlignVertical: 'top', paddingTop: 4,
  },
  dictationFillBtn: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
  },
  dictationFillBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Dual action row
  actionRow: {
    flexDirection: 'row', gap: 10, marginBottom: 12,
  },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8,
  },
  actionButtonIcon: { fontSize: 18 },
  actionButtonText: { fontSize: 14, fontWeight: '600' },

  // Scan error
  scanErrorBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8,
  },
  scanErrorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  scanErrorDismiss: { fontSize: 20, fontWeight: '700', paddingLeft: 8 },

  // Scan preview
  scanPreview: {
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, gap: 6,
  },
  scanPreviewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  scanPreviewTitle: { fontSize: 13, fontWeight: '600' },
  scanPreviewChevron: { fontSize: 18, fontWeight: '600' },
  scanPreviewText: { fontSize: 12, lineHeight: 18 },
  clearScanBtn: {
    alignSelf: 'flex-end', borderRadius: 8, borderWidth: 1,
    paddingVertical: 4, paddingHorizontal: 10, marginTop: 4,
  },
  clearScanBtnText: { fontSize: 12, fontWeight: '600' },

  // Review reminder
  reviewReminder: {
    fontSize: 11, lineHeight: 16, marginBottom: 8, textAlign: 'center',
  },

  // Refill due badge
  refillDueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1,
    borderColor: '#FECACA', paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginTop: 4,
  },
  refillDueBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  refillLifecycleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  refillLifecycleBadgeText: { fontSize: 11, fontWeight: '700' },

  // Drug name auto-predict dropdown
  suggestionsDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
    marginBottom: 8,
    overflow: 'hidden' as const,
    zIndex: 100,
  },
  aiBadgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aiBadgeText: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.4 },
  aiBadgeSubtext: { fontSize: 10 },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Chip button (form / route / frequency selector)
  chipBtn: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipBtnText: { fontSize: 13, fontWeight: '600' as const },

  // ── Post-save interaction banner ──────────────────────────────────────────
  postSaveInteractionOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingBottom: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
    overflow: 'hidden',
  },
  postSaveInteractionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  postSaveInteractionIcon: { fontSize: 20 },
  postSaveInteractionTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  postSaveInteractionSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 1 },
  postSaveInteractionDismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postSaveInteractionDismissText: { fontSize: 16, fontWeight: '600' },
  postSaveInteractionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  postSaveInteractionRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  postSaveSeverityBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  postSaveSeverityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  postSaveInteractionDrug: { fontSize: 13, fontWeight: '600', flex: 1 },
  postSaveInteractionDesc: { fontSize: 12, lineHeight: 17 },
  postSaveDisclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 10,
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  postSaveDisclaimerIcon: { fontSize: 16, marginTop: 1 },
  postSaveDisclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
  weekHoursTable: {
    marginTop: 6,
    borderWidth: 0.5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  weekHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  weekHoursDayLabel: {
    fontSize: 12,
    fontWeight: '500',
    width: 36,
  },
  weekHoursValue: {
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },

  // ── Snooze count badge
  snoozeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 4,
  },
  snoozeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Undo Taken toast
  undoToastContainer: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9998,
  },
  undoToastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  undoToastTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  undoToastSub: {
    fontSize: 11,
    marginTop: 1,
  },
  undoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  undoBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  undoDismissBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoDismissText: {
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 22,
  },
  undoCountdown: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'center',
  },

  // ── Reschedule confirmation toast
  rescheduleToastContainer: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 9999,
  },
  rescheduleToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rescheduleToastText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  historyDeleteAction: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
});

// ─── Smart Scribe Styles ─────────────────────────────────────────────────────────
const _scribeStyles = StyleSheet.create({
  scribeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  scribeTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  scribeSubtitle: { fontSize: 12, marginTop: 1 },
  scribeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  scribeBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  scribeResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  scribeResultIcon: { fontSize: 18 },
  scribeResultTitle: { fontSize: 13, fontWeight: '600' },
  scribeResultSub: { fontSize: 11, marginTop: 2 },
});

// Per-screen ErrorBoundary: isolates render errors so a crash in this tab
// does not take down the entire app or the tab bar.
function MedicationsScreenGated() {
  const { isPremium, requirePremium, PremiumGateSheet } = usePremiumGate({ fullScreen: true });
  React.useEffect(() => {
    if (!isPremium) {
      requirePremium(() => {}, { feature: 'Medications Tracker' })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);
  if (!isPremium) {
    return <>{PremiumGateSheet}</>;
  }
  return <MedicationsScreenInner />;
}
export default function MedicationsScreenRoot() {
  return (
    <ErrorBoundary>
      <MedicationsScreenInner />
    </ErrorBoundary>
  );
}
