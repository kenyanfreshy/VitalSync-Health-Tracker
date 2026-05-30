/**
 * Immunization Records Screen
 * Full CRUD for vaccine records with Apple/Android Voice for hands-free entry.
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableOpacity,
  Animated,
  PanResponder,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CDC_SELECTED_KEY, CDC_QUICK_ADD_KEY } from './cdc-vaccines';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { immunPdfStrings, immunScreenStrings } from '@/lib/i18n';
import { parseImmunizationTranscript as parseImmunizationOcr } from '@/lib/scribe/parsers';
import { extractTextFromImage } from 'expo-text-extractor';
import { PrivacyBanner } from '@/components/privacy-banner';
import { OcrReviewCard, type OcrReviewField } from '@/components/ocr-review-card';
import { useOverdueVaccineBadge } from '@/hooks/use-overdue-vaccine-badge';
import { useScribeHighlight } from '@/hooks/use-scribe-highlight';
import type { ImmunizationRecord, ImmunizationSite, ImmunizationRoute } from '@/lib/health/types';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  scheduleImmunizationNotifications,
  cancelImmunizationNotifications,
} from '@/lib/health/immunization-notifications';
import type { VaccineTemplate } from '@/lib/health/vaccine-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BATCH_SCRIBE_KEY } from './batch-scribe-review';
import { Linking } from 'react-native';
// DateTimePickerField and KeyboardDictationBanner removed — date fields use TextInput, dictation removed per user request
import { DatePickerIconButton } from '@/components/date-time-picker-field';

/** Runtime guard: ensures a JSON.parse result is a valid VaccineTemplate */
function isVaccineTemplate(v: unknown): v is VaccineTemplate {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.name === 'string' &&
    typeof t.abbreviation === 'string' &&
    typeof t.brandNames === 'string' &&
    typeof t.route === 'string' &&
    typeof t.site === 'string' &&
    typeof t.typicalDoses === 'number'
  );
}

/** Smart Scribe-logged vaccine object returned by parseImmunizationVoice */
type ScribedVaccine = {
  vaccineName: string | null;
  vaccineType: string | null;
  manufacturer: string | null;
  lotNumber: string | null;
  dateAdministered: string | null;
  doseNumber: number | null;
  seriesTotal: number | null;
  nextDoseDate: string | null;
  administeredBy: string | null;
  site: string | null;
  route: string | null;
  reactions: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  filledCount: number;
  totalFields: number;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ymdToDate(ymd: string): Date {
  if (!ymd) return new Date();
  const parts = ymd.split('-');
  if (parts.length !== 3) return new Date();
  const d = new Date();
  d.setFullYear(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  d.setHours(12, 0, 0, 0);
  return isNaN(d.getTime()) ? new Date() : d;
}
function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  vaccineName: string;
  vaccineType: string;
  manufacturer: string;
  lotNumber: string;
  dateAdministered: string;
  doseNumber: string;
  seriesTotal: string;
  nextDoseDate: string;
  administeredBy: string;
  site: ImmunizationSite | '';
  route: ImmunizationRoute | '';
  reactions: string;
  notes: string;
  pharmacyName: string;
  pharmacyPhone: string;
  pharmacyAddress: string;
};

const EMPTY_FORM: FormState = {
  vaccineName: '',
  vaccineType: '',
  manufacturer: '',
  lotNumber: '',
  dateAdministered: '',
  doseNumber: '',
  seriesTotal: '',
  nextDoseDate: '',
  administeredBy: '',
  site: '',
  route: '',
  reactions: '',
  notes: '',
  pharmacyName: '',
  pharmacyPhone: '',
  pharmacyAddress: '',
};

const SITE_OPTIONS: { value: ImmunizationSite; key: keyof typeof import('@/lib/i18n').immunScreenStrings.en }[] = [
  { value: 'left_arm', key: 'siteLeftArm' as const },
  { value: 'right_arm', key: 'siteRightArm' as const },
  { value: 'left_thigh', key: 'siteLeftThigh' as const },
  { value: 'right_thigh', key: 'siteRightThigh' as const },
  { value: 'other', key: 'siteOther' as const },
];

const ROUTE_OPTIONS: { value: ImmunizationRoute; key: keyof typeof import('@/lib/i18n').immunScreenStrings.en }[] = [
  { value: 'intramuscular', key: 'routeIM' as const },
  { value: 'subcutaneous', key: 'routeSC' as const },
  { value: 'oral', key: 'routeOral' as const },
  { value: 'intranasal', key: 'routeIntranasal' as const },
  { value: 'intradermal', key: 'routeIntradermal' as const },
  { value: 'other', key: 'otherLabel' as const },
];

// ─── CDC Vaccine Library is now a separate screen (/log/cdc-vaccines) ─────────

// VaccineLibraryModal removed — now a full-screen route at /log/cdc-vaccines.
// The inline modal caused a freeze by mounting 42 vaccine rows in the same
// component tree as the immunizations screen on every open.
// The new /log/cdc-vaccines screen loads lazily on navigation.

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_unused) {
    return iso;
  }
}

function isOverdue(nextDoseDate?: string): boolean {
  if (!nextDoseDate) return false;
  return new Date(nextDoseDate + 'T00:00:00') < new Date();
}

function isDueSoon(nextDoseDate?: string): boolean {
  if (!nextDoseDate) return false;
  const d = new Date(nextDoseDate + 'T00:00:00');
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

// ─── Record Card ──────────────────────────────────────────────────────────────

function ImmunizationCard({
  record,
  onEdit,
  onDelete,
  onShare,
  onMarkTaken,
  onMarkSkipped,
  colors,
}: {
  record: ImmunizationRecord;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onMarkTaken: () => void;
  onMarkSkipped: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const overdue = isOverdue(record.nextDoseDate);
  const dueSoon = isDueSoon(record.nextDoseDate);
  const _cardLang = useLang();
  const _iSCard = (immunScreenStrings as unknown as Record<string, typeof immunScreenStrings.en>)[_cardLang] ?? immunScreenStrings.en;
  const siteLabel = record.site ? (_iSCard as Record<string, string>)[(SITE_OPTIONS.find(s => s.value === record.site)?.key ?? 'siteOther') as string] : undefined;
  const routeLabel = record.route ? (_iSCard as Record<string, string>)[(ROUTE_OPTIONS.find(r => r.value === record.route)?.key ?? 'routeOther') as string] : undefined;

  // ── Swipe-to-delete ──────────────────────────────────────────────────────────────
  const DELETE_THRESHOLD = -72;
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);
  // Use a ref so the PanResponder closure always calls the latest onDelete
  // (avoids stale closure since PanResponder is created once in useRef)
  const onDeleteRef = useRef(onDelete);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  const swipedRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(Math.max(g.dx, DELETE_THRESHOLD - 4));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < DELETE_THRESHOLD / 2) {
          Animated.spring(translateX, { toValue: DELETE_THRESHOLD, useNativeDriver: true }).start();
          swipedRef.current = true;
          setSwiped(true);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          swipedRef.current = false;
          setSwiped(false);
        }
      },
    }),
  ).current;

  const closeSwipe = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    swipedRef.current = false;
    setSwiped(false);
  }, [translateX]);

  const handleDelete = useCallback(() => {
    // Close swipe animation first, then call latest onDelete via ref
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    swipedRef.current = false;
    setSwiped(false);
    onDeleteRef.current();
  }, [translateX]);

  return (
    <View style={{ marginBottom: 12 }}>
      {/* Red delete backdrop — sits behind the card; revealed when card slides left */}
      <View style={[s.deleteBackdrop]}>
        <TouchableOpacity
          onPress={handleDelete}
          style={s.deleteAction}
          accessibilityLabel={_iSCard.deleteVaccineLabel ?? "Delete vaccine record"}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 20 }}>🗑️</Text>
          <Text style={s.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Animated card slides left to reveal delete backdrop.
          pointerEvents="none" when swiped so taps fall through to the backdrop button. */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        pointerEvents={swiped ? 'none' : 'auto'}
        {...panResponder.panHandlers}
      >
        {/* Plain View wrapper so nested TouchableOpacity buttons fire independently */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 0 }]}>

          {/* Header: left side taps to edit, right side has action icon buttons */}
          <View style={s.cardHeader}>
            <TouchableOpacity
              onPress={swiped ? closeSwipe : onEdit}
              activeOpacity={0.85}
              style={s.cardHeaderLeft}
            >
              <Text style={{ fontSize: 22 }}>💉</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {record.vaccineName}
                </Text>
                {record.manufacturer && (
                  <Text style={[s.cardSub, { color: colors.muted }]} numberOfLines={1}>
                    {record.manufacturer}{record.vaccineType ? ` · ${record.vaccineType}` : ''}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <View style={s.cardActions}>
              <TouchableOpacity
                onPress={onEdit}
                style={[s.iconBtn, { backgroundColor: colors.background }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onShare}
                style={[s.iconBtn, { backgroundColor: colors.background, marginLeft: 6 }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={_iSCard.shareVaccineLabel ?? "Share vaccination certificate"}
              >
                <Text style={{ fontSize: 14 }}>📤</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDelete}
                style={[s.iconBtn, { backgroundColor: colors.background, marginLeft: 6 }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Details */}
          <View style={s.cardDetails}>
            <View style={s.detailRow}>
              <Text style={[s.detailLabel, { color: colors.muted }]}>Date</Text>
              <Text style={[s.detailValue, { color: colors.foreground }]}>
                {formatDate(record.dateAdministered)}
              </Text>
            </View>
            {(record.doseNumber || record.seriesTotal) && (
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Dose</Text>
                <Text style={[s.detailValue, { color: colors.foreground }]}>
                  {record.doseNumber ?? '?'}{record.seriesTotal ? ` of ${record.seriesTotal}` : ''}
                </Text>
              </View>
            )}
            {record.administeredBy && (
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Given by</Text>
                <Text style={[s.detailValue, { color: colors.foreground }]} numberOfLines={1}>
                  {record.administeredBy}
                </Text>
              </View>
            )}
            {(siteLabel || routeLabel) && (
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Site / Route</Text>
                <Text style={[s.detailValue, { color: colors.foreground }]}>
                  {[siteLabel, routeLabel].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
            {record.lotNumber && (
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Lot #</Text>
                <Text style={[s.detailValue, { color: colors.muted }]}>{record.lotNumber}</Text>
              </View>
            )}
            {record.nextDoseDate && (
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Next dose</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.detailValue, { color: overdue ? '#EF4444' : dueSoon ? '#F59E0B' : colors.foreground }]}>
                    {formatDate(record.nextDoseDate)}
                  </Text>
                  {overdue && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={[s.badge, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>OVERDUE</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/settings/color-legend', params: { section: 'Immunizations' } })}
                        accessibilityRole="button"
                        accessibilityLabel="What does OVERDUE mean? Open Color Code Guide"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={[s.helpIcon, { borderColor: '#DC262640' }]}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#DC2626' }}>?</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!overdue && dueSoon && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>DUE SOON</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/settings/color-legend', params: { section: 'Immunizations' } })}
                        accessibilityRole="button"
                        accessibilityLabel="What does DUE SOON mean? Open Color Code Guide"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={[s.helpIcon, { borderColor: '#D9770640' }]}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#D97706' }}>?</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
            {record.reactions && (
              <View style={[s.detailRow, { alignItems: 'flex-start' }]}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Reactions</Text>
                <Text style={[s.detailValue, { color: '#EF4444', flex: 1 }]} numberOfLines={2}>
                  {record.reactions}
                </Text>
              </View>
            )}
            {record.notes && (
              <View style={[s.detailRow, { alignItems: 'flex-start' }]}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>Notes</Text>
                <Text style={[s.detailValue, { color: colors.muted, flex: 1 }]} numberOfLines={2}>
                  {record.notes}
                </Text>
              </View>
            )}
            {/* Pharmacy / clinic row */}
            {(record.pharmacyName || record.pharmacyPhone || record.pharmacyAddress) && (
              <View style={[s.detailRow, { alignItems: 'flex-start', marginTop: 4 }]}>
                <Text style={[s.detailLabel, { color: colors.muted }]}>{(_iSCard as Record<string, string>).pharmacySection ?? 'Pharmacy'}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  {record.pharmacyName ? (
                    <Text style={[s.detailValue, { color: colors.foreground }]} numberOfLines={1}>
                      {record.pharmacyName}
                    </Text>
                  ) : null}
                  {record.pharmacyPhone ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${record.pharmacyPhone}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${record.pharmacyPhone}`}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[s.detailValue, { color: '#0a7ea4' }]}>
                        {record.pharmacyPhone}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {record.pharmacyAddress ? (
                    <TouchableOpacity
                      onPress={() => {
                        const encoded = encodeURIComponent(record.pharmacyAddress ?? '');
                        const url = Platform.OS === 'ios'
                          ? `maps://?q=${encoded}`
                          : `https://maps.google.com/?q=${encoded}`;
                        Linking.openURL(url);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Open map for ${record.pharmacyAddress}`}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[s.detailValue, { color: '#0a7ea4' }]} numberOfLines={2}>
                        {record.pharmacyAddress}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}
          </View>

          {/* Apple Voice to Text Parse badge */}
          {record.aiScribe && (
            <View style={[s.scribeBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                Voice Entry · {record.aiScribe.confidence} confidence
              </Text>
            </View>
          )}

          {/* Taken / Skipped action row — only shown when a next dose is scheduled and not yet resolved */}
          {record.nextDoseDate && record.nextDoseStatus !== 'taken' && record.nextDoseStatus !== 'skipped' && (
            <View style={[s.doseActionRow, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={onMarkTaken}
                style={[s.doseActionBtn, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={_iSCard.markNextDoseLabel ?? "Mark next dose as taken"}
              >
                <Text style={{ fontSize: 13 }}>✅</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A', marginLeft: 4 }}>Mark Taken</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onMarkSkipped}
                style={[s.doseActionBtn, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', marginLeft: 8 }]}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={_iSCard.markSkippedLabel ?? "Mark next dose as skipped"}
              >
                <Text style={{ fontSize: 13 }}>⏭️</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706', marginLeft: 4 }}>Skip</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Status pill — shown when dose is already marked taken or skipped */}
          {record.nextDoseDate && (record.nextDoseStatus === 'taken' || record.nextDoseStatus === 'skipped') && (
            <View style={[s.doseActionRow, { borderTopColor: colors.border }]}>
              <View style={[s.doseStatusPill, {
                backgroundColor: record.nextDoseStatus === 'taken' ? '#DCFCE7' : '#FEF3C7',
                borderColor: record.nextDoseStatus === 'taken' ? '#22C55E' : '#F59E0B',
              }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: record.nextDoseStatus === 'taken' ? '#16A34A' : '#D97706' }}>
                  {record.nextDoseStatus === 'taken' ? '✅ Dose Taken' : '⏭️ Dose Skipped'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onEdit}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 8 }}>Undo</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ImmunizationsScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const iL = (immunPdfStrings as unknown as Record<string, typeof immunPdfStrings.en>)[lang] ?? immunPdfStrings.en;
  const iS = (immunScreenStrings as unknown as Record<string, typeof immunScreenStrings.en>)[lang] ?? immunScreenStrings.en;
  const { state, addImmunization, updateImmunization, deleteImmunization } = useHealth();
  const records = useMemo(
    () => [...(state.data?.immunizations ?? [])].sort(
      (a, b) => new Date(b.dateAdministered).getTime() - new Date(a.dateAdministered).getTime()
    ),
    [state.data?.immunizations]
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [scribeResult, setScribeResult] = useState<{ transcript: string; confidence: string; reasoning?: string; disclaimer?: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribeError, setScribeError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribeDisclaimer, setScribeDisclaimer] = useState<string | null>(null);
  // Batch scribe state: when multiple vaccines are detected
  const [batchVaccines, setBatchVaccines] = useState<ScribedVaccine[] | null>(null);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  // CDC library is now a separate screen — we read the selection back on focus
  const pendingCDCRef = useRef(false);
  const { triggerHighlight } = useScribeHighlight();
  const handleQuickAdd = useCallback(async (v: VaccineTemplate) => {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const routeMap: Record<string, ImmunizationRoute> = {
      'Intramuscular (IM)': 'intramuscular',
      'Subcutaneous (SC)': 'subcutaneous',
      'Oral': 'oral',
      'Intranasal': 'intranasal',
      'Intradermal (ID)': 'intradermal',
    };
    const siteMap: Record<string, ImmunizationSite> = {
      'Deltoid': 'right_arm',
      'Anterolateral thigh (infants) / Deltoid (adults)': 'right_thigh',
      'Anterolateral thigh': 'right_thigh',
      'Outer upper arm': 'right_arm',
      'Oral': 'other',
      'Intranasal': 'other',
    };
    const primaryRoute = v.route.split(' or ')[0].trim();
    const record: ImmunizationRecord = {
      id: `imm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      vaccineName: v.name,
      vaccineType: v.abbreviation || undefined,
      manufacturer: v.brandNames.split(',')[0].trim() || undefined,
      dateAdministered: today,
      seriesTotal: v.typicalDoses,
      route: routeMap[primaryRoute] ?? undefined,
      site: siteMap[v.site] ?? undefined,
      createdAt: now,
    };
    try {
      await addImmunization(record);
      scheduleImmunizationNotifications(record).catch(() => {});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(_iSCard.addedTitle, `${v.name} ${_iSCard.addedMsg}`);
    } catch (_unused) {
      Alert.alert(_iSCard.errorTitle, _iSCard.errorMsg);
    }
  }, [addImmunization]);

  useFocusEffect(
    useCallback(() => {
      if (!pendingCDCRef.current) return;
      pendingCDCRef.current = false;
      // Tap-to-prefill path: user tapped a vaccine row in the CDC screen
      AsyncStorage.getItem(CDC_SELECTED_KEY).then(raw => {
        if (!raw) return;
        AsyncStorage.removeItem(CDC_SELECTED_KEY).catch(() => {});
        try {
          const parsed = JSON.parse(raw);
          if (!isVaccineTemplate(parsed)) return;
          const v = parsed;
          const routeMap: Record<string, ImmunizationRoute> = {
            'Intramuscular (IM)': 'intramuscular',
            'Subcutaneous (SC)': 'subcutaneous',
            'Oral': 'oral',
            'Intranasal': 'intranasal',
            'Intradermal (ID)': 'intradermal',
          };
          const siteMap: Record<string, ImmunizationSite> = {
            'Deltoid': 'right_arm',
            'Anterolateral thigh (infants) / Deltoid (adults)': 'right_thigh',
            'Anterolateral thigh': 'right_thigh',
            'Outer upper arm': 'right_arm',
            'Oral': 'other',
            'Intranasal': 'other',
          };
          const primaryRoute = v.route.split(' or ')[0].trim();
          setForm(prev => ({
            ...prev,
            vaccineName: v.name,
            vaccineType: v.abbreviation,
            manufacturer: v.brandNames.split(',')[0].trim(),
            route: routeMap[primaryRoute] ?? prev.route,
            site: siteMap[v.site] ?? prev.site,
            seriesTotal: String(v.typicalDoses),
          }));
          setModalVisible(true);
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_unused) {}
      }).catch(() => {});
      // Quick-add path: user tapped the lightning bolt in the CDC screen
      AsyncStorage.getItem(CDC_QUICK_ADD_KEY).then(raw => {
        if (!raw) return;
        AsyncStorage.removeItem(CDC_QUICK_ADD_KEY).catch(() => {});
        try {
          const parsed = JSON.parse(raw);
          if (!isVaccineTemplate(parsed)) return;
          handleQuickAdd(parsed);
        } catch (_unused) {}
      }).catch(() => {});
    }, [handleQuickAdd])
  );

  const { clearBadge: clearOverdueBadge } = useOverdueVaccineBadge();

  // Clear the overdue vaccine badge when the user opens this screen
  useEffect(() => {
    clearOverdueBadge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [photoScanning, setPhotoScanning] = useState(false);
  const [photoScanSummary, setPhotoScanSummary] = useState<{
    fields: { label: string; value: string }[];
    confidence: string;
    reasoning: string;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [photoSummaryExpanded, setPhotoSummaryExpanded] = useState(true);
  // Diff-style OCR review fields for OcrReviewCard
  const [ocrReviewFields, setOcrReviewFields] = useState<OcrReviewField[] | null>(null);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const openAdd = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, dateAdministered: today });
    setScribeResult(null);
    setScribeError(null);
    setScribeDisclaimer(null);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((record: ImmunizationRecord) => {
    setEditingId(record.id);
    setForm({
      vaccineName: record.vaccineName,
      vaccineType: record.vaccineType ?? '',
      manufacturer: record.manufacturer ?? '',
      lotNumber: record.lotNumber ?? '',
      dateAdministered: record.dateAdministered,
      doseNumber: record.doseNumber != null ? String(record.doseNumber) : '',
      seriesTotal: record.seriesTotal != null ? String(record.seriesTotal) : '',
      nextDoseDate: record.nextDoseDate ?? '',
      administeredBy: record.administeredBy ?? '',
      site: record.site ?? '',
      route: record.route ?? '',
      reactions: record.reactions ?? '',
      notes: record.notes ?? '',
      pharmacyName: record.pharmacyName ?? '',
      pharmacyPhone: record.pharmacyPhone ?? '',
      pharmacyAddress: record.pharmacyAddress ?? '',
    });
    setScribeResult(null);
    setScribeError(null);
    setScribeDisclaimer(null);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setScribeResult(null);
    setScribeError(null);
    setScribeDisclaimer(null);
    setPhotoScanSummary(null); // Clear Vision Scan preview card so next entry starts fresh
    setOcrReviewFields(null); // Clear OCR review card
  }, [setPhotoScanSummary]);

  // ── PDF Export ──────────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    if (records.length === 0) {
      Alert.alert(_iSCard.noRecordsTitle, _iSCard.noRecordsMsg);
      return;
    }
    try {
      const rows = records.map((r) => {
        const doseLabel = r.doseNumber
          ? `${r.doseNumber}${r.seriesTotal ? `/${r.seriesTotal}` : ''}`
          : '—';
        const nextDose = r.nextDoseDate
          ? safeFormatDate(r.nextDoseDate, [], { year: 'numeric', month: 'short', day: 'numeric' })
          : '—';
        const dateGiven = safeFormatDate(r.dateAdministered, [], { year: 'numeric', month: 'short', day: 'numeric' });
        return `<tr>
          <td>${r.vaccineName}${r.vaccineType ? ` <span style="color:#6b7280;font-size:11px">(${r.vaccineType})</span>` : ''}</td>
          <td>${dateGiven}</td>
          <td>${doseLabel}</td>
          <td>${r.lotNumber ?? '—'}</td>
          <td>${r.manufacturer ?? '—'}</td>
          <td>${r.administeredBy ?? '—'}</td>
          <td>${nextDose}</td>
          <td>${r.reactions ?? '—'}</td>
          <td>${r.notes ?? '—'}</td>
        </tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>
          body{font-family:-apple-system,Helvetica,sans-serif;padding:32px;color:#111827;}
          h1{font-size:20px;margin-bottom:2px;color:#0D9488;}
          .subtitle{color:#6b7280;font-size:12px;margin-bottom:24px;}
          table{width:100%;border-collapse:collapse;font-size:11px;}
          th{background:#f0fdfa;padding:8px 10px;text-align:left;font-weight:600;color:#0D9488;border-bottom:2px solid #99f6e4;}
          td{padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;}
          tr:last-child td{border-bottom:none;}
          .footer{margin-top:24px;font-size:10px;color:#9ca3af;}
        </style>
      </head><body>
        <h1>💉 ${iL.recordTitle}</h1>
        <p class="subtitle">${iL.generatedOn} ${safeFormatDate(Date.now(), [], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${records.length} ${records.length !== 1 ? iL.records : iL.record}</p>
        <table>
          <thead><tr>
            <th>${iL.colVaccine}</th><th>${iL.colDateGiven}</th><th>${iL.colDose}</th><th>${iL.colLot}</th>
            <th>${iL.colManufacturer}</th><th>${iL.colAdministeredBy}</th><th>${iL.colNextDue}</th>
            <th>${iL.colReactions}</th><th>${iL.colNotes}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="footer">${iL.recordFooter}</p>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: iS.shareImmunizationRecord ?? 'Share Immunization Record' });
        // Delete temp PDF after sharing to prevent health data lingering in cache
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      } else {
        Alert.alert(_iSCard.savedTitle, `PDF saved to:\n${uri}`);
      }
    } catch (_unused) {
      Alert.alert(_iSCard.exportFailedTitle, _iSCard.exportFailedMsg);
    }
  }, [records, iL]);

  const handleSave = useCallback(async () => {
    if (!form.vaccineName.trim()) {
      Alert.alert(_iSCard.requiredTitle, _iSCard.vaccineNameRequired);
      return;
    }
    if (!form.dateAdministered.trim()) {
      Alert.alert(_iSCard.requiredTitle, _iSCard.dateRequired);
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingId) {
        const existing = records.find(r => r.id === editingId);
        const updated: ImmunizationRecord = {
          ...(existing ?? {}),
          id: editingId,
          vaccineName: form.vaccineName.trim(),
          vaccineType: form.vaccineType.trim() || undefined,
          manufacturer: form.manufacturer.trim() || undefined,
          lotNumber: form.lotNumber.trim() || undefined,
          dateAdministered: form.dateAdministered.trim(),
          doseNumber: form.doseNumber ? parseInt(form.doseNumber, 10) : undefined,
          seriesTotal: form.seriesTotal ? parseInt(form.seriesTotal, 10) : undefined,
          nextDoseDate: form.nextDoseDate.trim() || undefined,
          administeredBy: form.administeredBy.trim() || undefined,
          site: (form.site as ImmunizationSite) || undefined,
          route: (form.route as ImmunizationRoute) || undefined,
          reactions: form.reactions.trim() || undefined,
          notes: form.notes.trim() || undefined,
          pharmacyName: form.pharmacyName.trim() || undefined,
          pharmacyPhone: form.pharmacyPhone.trim() || undefined,
          pharmacyAddress: form.pharmacyAddress.trim() || undefined,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        await updateImmunization(updated);
        scheduleImmunizationNotifications(updated).catch(() => {});
      } else {
        const record: ImmunizationRecord = {
          id: `imm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          vaccineName: form.vaccineName.trim(),
          vaccineType: form.vaccineType.trim() || undefined,
          manufacturer: form.manufacturer.trim() || undefined,
          lotNumber: form.lotNumber.trim() || undefined,
          dateAdministered: form.dateAdministered.trim(),
          doseNumber: form.doseNumber ? parseInt(form.doseNumber, 10) : undefined,
          seriesTotal: form.seriesTotal ? parseInt(form.seriesTotal, 10) : undefined,
          nextDoseDate: form.nextDoseDate.trim() || undefined,
          administeredBy: form.administeredBy.trim() || undefined,
          site: (form.site as ImmunizationSite) || undefined,
          route: (form.route as ImmunizationRoute) || undefined,
          reactions: form.reactions.trim() || undefined,
          notes: form.notes.trim() || undefined,
          pharmacyName: form.pharmacyName.trim() || undefined,
          pharmacyPhone: form.pharmacyPhone.trim() || undefined,
          pharmacyAddress: form.pharmacyAddress.trim() || undefined,
          createdAt: now,
        };
        await addImmunization(record);
        scheduleImmunizationNotifications(record).catch(() => {});
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeModal();
      // Navigate back immediately — no delay so back navigation feels instant.
      router.replace('/(tabs)/record?scrollToImmunizations=1' as any);
    } catch (_e) {
      Alert.alert(_iSCard.errorTitle, _iSCard.errorMsg);
    } finally {
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editingId, records, addImmunization, updateImmunization, deleteImmunization, closeModal, router]);

  const handleShareRecord = useCallback(async (record: ImmunizationRecord) => {
    try {
      const siteLabel = record.site ? ((immunScreenStrings.en as Record<string, string>)[((SITE_OPTIONS.find(s => s.value === record.site)?.key) as string ?? 'siteOther') as string] ?? '') : '';
      const routeLabel = record.route ? ((immunScreenStrings.en as Record<string, string>)[((ROUTE_OPTIONS.find(r => r.value === record.route)?.key) as string ?? 'routeOther') as string] ?? '') : '';
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
            h1 { color: #0D9488; font-size: 22px; margin-bottom: 4px; }
            .subtitle { color: #6B7280; font-size: 13px; margin-bottom: 24px; }
            .card { border: 1px solid #E5E7EB; border-radius: 10px; padding: 20px; max-width: 500px; }
            .row { display: flex; margin-bottom: 10px; }
            .label { color: #6B7280; font-size: 12px; width: 130px; flex-shrink: 0; }
            .value { font-size: 13px; color: #111; flex: 1; }
            .footer { margin-top: 32px; font-size: 11px; color: #9CA3AF; }
            .badge { display: inline-block; background: #DCFCE7; color: #16A34A; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
          </style>
        </head>
        <body>
          <h1>💉 ${iL.certTitle}</h1>
          <p class="subtitle">${iL.certSubtitle}</p>
          <div class="card">
            <div class="row"><span class="label">${iL.fieldVaccine}</span><span class="value"><strong>${record.vaccineName}</strong>${record.vaccineType ? ` (${record.vaccineType})` : ''}</span></div>
            ${record.manufacturer ? `<div class="row"><span class="label">${iL.fieldManufacturer}</span><span class="value">${record.manufacturer}</span></div>` : ''}
            <div class="row"><span class="label">${iL.fieldDateAdministered}</span><span class="value">${formatDate(record.dateAdministered)}</span></div>
            ${record.doseNumber ? `<div class="row"><span class="label">${iL.fieldDose}</span><span class="value">${record.doseNumber}${record.seriesTotal ? ` of ${record.seriesTotal}` : ''}</span></div>` : ''}
            ${record.lotNumber ? `<div class="row"><span class="label">${iL.fieldLotNumber}</span><span class="value">${record.lotNumber}</span></div>` : ''}
            ${record.administeredBy ? `<div class="row"><span class="label">${iL.fieldAdministeredBy}</span><span class="value">${record.administeredBy}</span></div>` : ''}
            ${siteLabel || routeLabel ? `<div class="row"><span class="label">${iL.fieldSiteRoute}</span><span class="value">${[siteLabel, routeLabel].filter(Boolean).join(' · ')}</span></div>` : ''}
            ${record.nextDoseDate ? `<div class="row"><span class="label">${iL.fieldNextDose}</span><span class="value">${formatDate(record.nextDoseDate)}</span></div>` : ''}
            ${record.reactions ? `<div class="row"><span class="label">${iL.fieldReactions}</span><span class="value" style="color:#EF4444">${record.reactions}</span></div>` : ''}
            ${record.notes ? `<div class="row"><span class="label">${iL.fieldNotes}</span><span class="value">${record.notes}</span></div>` : ''}
            ${(record.pharmacyName || record.pharmacyPhone || record.pharmacyAddress) ? `<div class="row"><span class="label">${iL.fieldPharmacy}</span><span class="value">${record.pharmacyName ?? ''}</span></div>` : ''}
            ${record.pharmacyPhone ? `<div class="row"><span class="label">${iL.fieldPharmacyPhone}</span><span class="value">${record.pharmacyPhone}</span></div>` : ''}
            ${record.pharmacyAddress ? `<div class="row"><span class="label">${iL.fieldPharmacyAddress}</span><span class="value">${record.pharmacyAddress}</span></div>` : ''}
          </div>
          <p class="footer">${iL.certFooter} · ${safeFormatDate(new Date())}</p>
        </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${record.vaccineName} Certificate`,
          UTI: 'com.adobe.pdf',
        });
        // Delete temp PDF after sharing to prevent health data lingering in cache
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      } else {
        await Print.printAsync({ uri });
        // Delete temp PDF after printing to prevent health data lingering in cache
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } catch (_unused) {
      Alert.alert(_iSCard.shareFailedTitle, _iSCard.shareFailedMsg);
    }
  }, [iL]);

  const handleDelete = useCallback((id: string, name: string) => {
    Alert.alert(
      (iS.deleteImmunTitle ?? 'Delete Immunization'),
      `Remove "${name}" from your records?`,
      [
        { text: iS.cancelBtn ?? 'Cancel', style: 'cancel' },
        {
          text: iS.deleteBtn ?? 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteImmunization(id);
            cancelImmunizationNotifications(id).catch(() => {});
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  }, [deleteImmunization]);

  // ── Smart Scribe ──────────────────────────────────────────────────────────────

  /** Fill the current form from a single parsed vaccine object */
  const fillFormFromScribe = useCallback((v: { vaccineName?: string | null; vaccineType?: string | null; manufacturer?: string | null; lotNumber?: string | null; dateAdministered?: string | null; doseNumber?: number | null; seriesTotal?: number | null; nextDoseDate?: string | null; administeredBy?: string | null; site?: string | null; route?: string | null; reactions?: string | null; notes?: string | null }) => {
    const updates: Partial<FormState> = {};
    if (v.vaccineName) updates.vaccineName = v.vaccineName;
    if (v.vaccineType) updates.vaccineType = v.vaccineType;
    if (v.manufacturer) updates.manufacturer = v.manufacturer;
    if (v.lotNumber) updates.lotNumber = v.lotNumber;
    if (v.dateAdministered) updates.dateAdministered = v.dateAdministered;
    if (v.doseNumber != null) updates.doseNumber = String(v.doseNumber);
    if (v.seriesTotal != null) updates.seriesTotal = String(v.seriesTotal);
    if (v.nextDoseDate) updates.nextDoseDate = v.nextDoseDate;
    if (v.administeredBy) updates.administeredBy = v.administeredBy;
    if (v.site) updates.site = v.site as ImmunizationSite;
    if (v.route) updates.route = v.route as ImmunizationRoute;
    if (v.reactions) updates.reactions = v.reactions;
    if (v.notes) updates.notes = v.notes;
    setForm(prev => ({ ...prev, ...updates }));
    const allFields: (keyof FormState)[] = [
      'vaccineName', 'vaccineType', 'manufacturer', 'lotNumber', 'dateAdministered',
      'doseNumber', 'seriesTotal', 'nextDoseDate', 'administeredBy', 'site', 'route',
      'reactions', 'notes',
    ];
    const updatedForm = { ...form, ...updates };
    const unfilled = allFields.filter(f => !updatedForm[f]);
    triggerHighlight(unfilled, updatedForm as Record<string, string>);
  }, [form, triggerHighlight]);

  /** Quick Add: save a vaccine template directly with today's date, no form required */

  /** Save all batch vaccines directly without opening the form */
  const saveBatchVaccines = useCallback(async (vaccines: ScribedVaccine[]) => {
    const now = new Date().toISOString();
    for (const v of vaccines) {
      if (!v.vaccineName) continue;
      const record: ImmunizationRecord = {
        id: `imm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        vaccineName: v.vaccineName,
        vaccineType: v.vaccineType ?? undefined,
        manufacturer: v.manufacturer ?? undefined,
        lotNumber: v.lotNumber ?? undefined,
        dateAdministered: v.dateAdministered ?? now.slice(0, 10),
        doseNumber: v.doseNumber ?? undefined,
        seriesTotal: v.seriesTotal ?? undefined,
        nextDoseDate: v.nextDoseDate ?? undefined,
        administeredBy: v.administeredBy ?? undefined,
        site: (v.site as ImmunizationSite) ?? undefined,
        route: (v.route as ImmunizationRoute) ?? undefined,
        reactions: v.reactions ?? undefined,
        notes: v.notes ?? undefined,
        createdAt: now,
        aiScribe: {
          transcript: v.reasoning ?? '',
          confidence: v.confidence,
          reasoning: v.reasoning,
          filledCount: Object.values(v).filter(Boolean).length,
          totalFields: 13,
        },
      };
      await addImmunization(record);
      scheduleImmunizationNotifications(record).catch(() => {});
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBatchModalVisible(false);
    setBatchVaccines(null);
    closeModal();
  }, [addImmunization, closeModal]);

  /** Apple Speech path: local parse first (instant), then LLM enhancement */

  /** Audio-upload fallback (web / Android) */

  // ── Apple Vision Photo Scan ────────────────────────────────────────────────────────────
  const handlePhotoScan = useCallback(async () => {
    const SafeImagePicker = await import('@/lib/safe-image-picker');
    if (!SafeImagePicker.isImagePickerAvailable()) {
      Alert.alert(_iSCard.cameraUnavailableTitle, _iSCard.cameraUnavailableMsg);
      return;
    }
    // Camera-only: no library access
    const { granted } = await SafeImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert(_iSCard.cameraPermissionTitle, _iSCard.cameraPermissionMsg);
      return;
    }
    const result = await SafeImagePicker.launchCameraAsync({
      quality: 0.85,
      base64: true,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const mimeType = (asset.mimeType as 'image/jpeg' | 'image/png' | 'image/webp') ?? 'image/jpeg';
    const _imageBase64 = `data:${mimeType};base64,${asset.base64}`;
    setPhotoScanning(true);
    setScribeError(null);
    try {
      // Use Apple Vision (iOS) / ML Kit (Android) on-device OCR — no server call
      const ocrLines = await extractTextFromImage(asset.uri);
      const ocrText = ocrLines.join('\n');
      const photoResult = parseImmunizationOcr(ocrText);
      // Build OcrReviewCard fields — all key vaccine fields, marking extracted vs blank
      const reviewFields: OcrReviewField[] = [
        { label: iS.vaccineNameLabel.replace(' *', ''),        value: photoResult.vaccineName,     extracted: !!photoResult.vaccineName },
        { label: iS.vaccineTypeLabel,                          value: photoResult.vaccineType,     extracted: !!photoResult.vaccineType },
        { label: iS.manufacturerLabel,                         value: photoResult.manufacturer,    extracted: !!photoResult.manufacturer },
        { label: iS.lotNumberLabel,                            value: photoResult.lotNumber,       extracted: !!photoResult.lotNumber },
        { label: iS.dateAdministeredLabel.replace(' *', ''),   value: photoResult.dateAdministered, extracted: !!photoResult.dateAdministered },
        { label: iS.doseNumberLabel,                           value: photoResult.doseNumber != null ? `${photoResult.doseNumber}${photoResult.seriesTotal ? ' of ' + photoResult.seriesTotal : ''}` : null, extracted: photoResult.doseNumber != null },
        { label: iS.nextDoseDateLabel,                         value: photoResult.nextDoseDate,    extracted: !!photoResult.nextDoseDate },
        { label: iS.administeredByLabel,                       value: photoResult.administeredBy, extracted: !!photoResult.administeredBy },
        { label: iS.injectionSiteLabel,                        value: photoResult.site,            extracted: !!photoResult.site },
        { label: iS.routeLabel,                                value: photoResult.route,           extracted: !!photoResult.route },
      ];
      setOcrReviewFields(reviewFields);
      setScribeDisclaimer('Always verify scanned details with your vaccination card.');
      // Keep legacy summary for the low-confidence warning banner
      const fieldsFound = reviewFields.filter(f => f.extracted).length;
      setPhotoScanSummary({
        fields: reviewFields.filter(f => f.extracted).map(f => ({ label: f.label, value: String(f.value) })),
        confidence: fieldsFound > 3 ? 'high' : fieldsFound > 0 ? 'medium' : 'low',
        reasoning: `Extracted ${fieldsFound} field${fieldsFound !== 1 ? 's' : ''} via on-device OCR.`,
      });
      fillFormFromScribe(photoResult);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not extract details from the photo.';
      setScribeError(msg);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPhotoScanning(false);
    }
  }, [fillFormFromScribe]);

  // ── Render ──────────────────────────────────────────────────────────────────────────

  const isDark = colors.background === '#151718';

  const handleMarkTaken = useCallback(async (record: ImmunizationRecord) => {
    const updated: ImmunizationRecord = { ...record, nextDoseStatus: 'taken', updatedAt: new Date().toISOString() };
    await updateImmunization(updated);
    // Cancel the scheduled notifications since the dose is now taken
    cancelImmunizationNotifications(record.id).catch(() => {});
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [updateImmunization]);

  const handleMarkSkipped = useCallback(async (record: ImmunizationRecord) => {
    const updated: ImmunizationRecord = { ...record, nextDoseStatus: 'skipped', updatedAt: new Date().toISOString() };
    await updateImmunization(updated);
    // Cancel the scheduled notifications since the dose is being skipped
    cancelImmunizationNotifications(record.id).catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [updateImmunization]);

  const renderItem = useCallback(({ item }: { item: ImmunizationRecord }) => (
    <ImmunizationCard
      record={item}
      onEdit={() => openEdit(item)}
      onDelete={() => handleDelete(item.id, item.vaccineName)}
      onShare={() => handleShareRecord(item)}
      onMarkTaken={() => handleMarkTaken(item)}
      onMarkSkipped={() => handleMarkSkipped(item)}
      colors={colors}
    />
  ), [colors, openEdit, handleDelete, handleShareRecord, handleMarkTaken, handleMarkSkipped]);

  const ListEmpty = (
    <View style={s.emptyState}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>💉</Text>
      <Text style={[s.emptyTitle, { color: colors.foreground }]}>{iS.noImmunizationsYet}</Text>
      <Text style={[s.emptySub, { color: colors.muted }]}>
        {iS.tapToAddVaccine}
      </Text>
    </View>
  );

  // Summary counts
  const overdueCount = records.filter(r => isOverdue(r.nextDoseDate)).length;
  const dueSoonCount = records.filter(r => isDueSoon(r.nextDoseDate)).length;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/record' as any)}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol name="arrow.left" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>{iS.backLabel}</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{iS.immunTitle}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.push('/log/vaccine-schedule' as any)}
            style={[s.exportBtn, { borderColor: colors.border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="View CDC/WHO Vaccine Schedule"
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{iS.scheduleLabel}</Text>
          </TouchableOpacity>
          {records.length > 0 && (
            <TouchableOpacity
              onPress={handleExportPDF}
              style={[s.exportBtn, { borderColor: colors.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={iS.exportImmunizationPdf ?? "Export immunization records as PDF"}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{iS.exportPdfLabel}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={openAdd}
            style={[s.addBtn, { backgroundColor: colors.primary }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 22, lineHeight: 26 }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary strip */}
      {records.length > 0 && (
        <View style={[s.summaryStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: colors.foreground }]}>{records.length}</Text>
            <Text style={[s.summaryLabel, { color: colors.muted }]}>Total</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: overdueCount > 0 ? '#EF4444' : colors.foreground }]}>
              {overdueCount}
            </Text>
            <Text style={[s.summaryLabel, { color: colors.muted }]}>Overdue</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: dueSoonCount > 0 ? '#F59E0B' : colors.foreground }]}>
              {dueSoonCount}
            </Text>
            <Text style={[s.summaryLabel, { color: colors.muted }]}>Due Soon</Text>
          </View>
        </View>
      )}

      <PrivacyBanner />

      <FlatList
        data={records}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[s.list, records.length === 0 && { flex: 1 }]}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={closeModal} style={s.modalCancel}>
              <Text style={[s.modalCancelText, { color: colors.primary }]}>{iS.cancelBtn}</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {editingId ? iS.editImmunTitle : iS.addImmunTitle}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={[s.modalSave, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.modalSaveText}>{iS.saveBtn}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Voice Entry section removed per user request — use the form fields below */}
            {(false || false) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.muted }}>{iS.transcribingLabel}</Text>
              </View>
            )}
            {scribeResult && (
              <View style={{ backgroundColor: colors.primary + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.primary + '44' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>✓ Scribe result · {scribeResult.confidence} confidence</Text>
                  <TouchableOpacity onPress={() => { setScribeResult(null); setScribeError(null); }}>
                    <Text style={{ fontSize: 11, color: colors.primary }}>🍎 Try again</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>&quot;{scribeResult.transcript}&quot;</Text>
                {scribeResult.reasoning && <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{scribeResult.reasoning}</Text>}
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>Smart Scribe-extracted — please review all fields before saving.</Text>
              </View>
            )}

            {/* Apple Vision Photo Scan section */}
            <View style={[s.scribeSection, { backgroundColor: isDark ? '#0F172A' : '#FFF7ED', borderColor: isDark ? '#431407' : '#FED7AA', marginTop: 10 }]}>
              <View style={s.scribeHeader}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>📸</Text>
                <Text style={[s.scribeTitle, { color: colors.foreground }]}>Vision Scan</Text>
              </View>
              <Text style={[s.scribeHint, { color: colors.muted }]}>
                Take a photo of your vaccine card, prescription, or immunization record. Smart Scribe will extract and fill the form automatically.
              </Text>
              <TouchableOpacity
                onPress={handlePhotoScan}
                disabled={photoScanning || false}
                style={[{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#431407' : '#FED7AA',
                  borderWidth: 1,
                  borderColor: isDark ? '#7C2D12' : '#FB923C',
                  opacity: photoScanning || false ? 0.6 : 1,
                  marginTop: 4,
                }]}
                activeOpacity={0.75}
              >
                {photoScanning || false ? (
                  <ActivityIndicator size="small" color="#EA580C" />
                ) : (
                  <Text style={{ fontSize: 18 }}>🍎</Text>
                )}
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EA580C' }}>
                  {photoScanning || false ? 'Smart Scribe scanning…' : 'Scan Vaccine Card / Prescription'}
                </Text>
              </TouchableOpacity>

              {/* Diff-style OCR Review Card */}
              {ocrReviewFields && (
                <OcrReviewCard
                  title={iS.vaccineCardScanTitle}
                  fields={ocrReviewFields}
                  onConfirm={() => setOcrReviewFields(null)}
                  onRetake={handlePhotoScan}
                  onManual={() => { setOcrReviewFields(null); setPhotoScanSummary(null); }}
                />
              )}
            </View>
            {/* CDC Vaccine Library quick-add */}
            {!editingId && (
              <View style={s.formSection}>
                <Text style={[s.formSectionTitle, { color: colors.muted }]}>{iS.cdcLibrarySection}</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Close the modal first so it doesn't reappear if user cancels on CDC screen
                    setModalVisible(false);
                    pendingCDCRef.current = true;
                    // Small delay so modal dismissal animation completes before navigation
                    setTimeout(() => router.push('/log/cdc-vaccines' as any), 300);
                  }}
                  style={[
                    s.libraryBtn,
                    { backgroundColor: isDark ? '#0F172A' : '#F0FDF4', borderColor: '#22C55E' },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <Text style={{ fontSize: 22 }}>📋</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>Browse CDC Vaccines</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        42 vaccines · Routine, Travel & Tropical
                      </Text>
                    </View>
                    <Text style={{ fontSize: 18, color: '#22C55E' }}>›</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Core fields */}
            <View style={s.formSection}>
              <Text style={[s.formSectionTitle, { color: colors.muted }]}>{iS.vaccineDetailsSection}</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={[s.label, { color: colors.foreground, marginBottom: 0 }]}>{iS.vaccineNameLabel}</Text>
              </View>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.vaccineName}
                onChangeText={(v) => setField('vaccineName', v)}
                placeholder="e.g. Influenza (Flu), COVID-19 mRNA"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />

              <Text style={[s.label, { color: colors.foreground }]}>{iS.vaccineTypeLabel}</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.vaccineType}
                onChangeText={v => setField('vaccineType', v)}
                placeholder="e.g. mRNA, Live attenuated, Inactivated"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />

              <Text style={[s.label, { color: colors.foreground }]}>{iS.manufacturerLabel}</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.manufacturer}
                onChangeText={v => setField('manufacturer', v)}
                placeholder="e.g. Pfizer-BioNTech, Moderna"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />

              <Text style={[s.label, { color: colors.foreground }]}>{iS.lotNumberLabel}</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.lotNumber}
                onChangeText={v => setField('lotNumber', v)}
                placeholder={iS.lotNumberPlaceholder}
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />
            </View>

            {/* Date & Dose */}
            <View style={s.formSection}>
              <Text style={[s.formSectionTitle, { color: colors.muted }]}>{iS.dateAndDoseSection}</Text>

              <Text style={[s.label, { color: colors.foreground }]}>{iS.dateAdministeredLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
                  value={form.dateAdministered ? formatDate(form.dateAdministered) : ''}
                  onChangeText={v => {
                    const lower = v.trim().toLowerCase();
                    if (lower === 'today') { setField('dateAdministered', dateToYmd(new Date())); return; }
                    if (lower === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); setField('dateAdministered', dateToYmd(d)); return; }
                    const parsed = new Date(v);
                    if (!isNaN(parsed.getTime())) { setField('dateAdministered', dateToYmd(parsed)); return; }
                    setField('dateAdministered', v);
                  }}
                  placeholder={`e.g. ${safeFormatDate(Date.now(), 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  placeholderTextColor={colors.muted}
                  returnKeyType="next"
                />
                <DatePickerIconButton
                  mode="date"
                  value={form.dateAdministered ? new Date(form.dateAdministered + 'T12:00:00') : null}
                  onChange={(d) => setField('dateAdministered', dateToYmd(d))}
                  maximumDate={new Date()}
                  inModal
                />
              </View>

              <View style={s.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[s.label, { color: colors.foreground }]}>{iS.doseNumberLabel}</Text>
                  <TextInput
                    style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                    value={form.doseNumber}
                    onChangeText={v => setField('doseNumber', v)}
                    placeholder="1"
                    placeholderTextColor={colors.muted}
                    keyboardType="default"
                    returnKeyType="next"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: colors.foreground }]}>{iS.seriesTotalLabel}</Text>
                  <TextInput
                    style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                    value={form.seriesTotal}
                    onChangeText={v => setField('seriesTotal', v)}
                    placeholder="2"
                    placeholderTextColor={colors.muted}
                    keyboardType="default"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <Text style={[s.label, { color: colors.foreground }]}>{iS.nextDoseDateLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
                  value={form.nextDoseDate ? formatDate(form.nextDoseDate) : ''}
                  onChangeText={v => {
                    const lower = v.trim().toLowerCase();
                    if (lower === 'today') { setField('nextDoseDate', dateToYmd(new Date())); return; }
                    if (lower === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); setField('nextDoseDate', dateToYmd(d)); return; }
                    const parsed = new Date(v);
                    if (!isNaN(parsed.getTime())) { setField('nextDoseDate', dateToYmd(parsed)); return; }
                    setField('nextDoseDate', v);
                  }}
                  placeholder="e.g. Jun 1, 2025 (leave blank if none)"
                  placeholderTextColor={colors.muted}
                  returnKeyType="next"
                />
                <DatePickerIconButton
                  mode="date"
                  value={form.nextDoseDate ? new Date(form.nextDoseDate + 'T12:00:00') : null}
                  onChange={(d) => setField('nextDoseDate', dateToYmd(d))}
                  inModal
                />
              </View>
            </View>

            {/* Administration */}
            <View style={s.formSection}>
              <Text style={[s.formSectionTitle, { color: colors.muted }]}>{iS.administrationSection}</Text>

              <Text style={[s.label, { color: colors.foreground }]}>{iS.administeredByLabel}</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.administeredBy}
                onChangeText={v => setField('administeredBy', v)}
                placeholder="e.g. City Pharmacy, Dr. Smith"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />

              <Text style={[s.label, { color: colors.foreground }]}>{iS.injectionSiteLabel}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {SITE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setField('site', form.site === opt.value ? '' : opt.value)}
                    style={[
                      s.chip,
                      {
                        backgroundColor: form.site === opt.value ? colors.primary : colors.surface,
                        borderColor: form.site === opt.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, color: form.site === opt.value ? '#fff' : colors.foreground }}>
                      {(iS as any)[opt.key]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[s.label, { color: colors.foreground }]}>{iS.routeLabel}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {ROUTE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setField('route', form.route === opt.value ? '' : opt.value)}
                    style={[
                      s.chip,
                      {
                        backgroundColor: form.route === opt.value ? colors.primary : colors.surface,
                        borderColor: form.route === opt.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, color: form.route === opt.value ? '#fff' : colors.foreground }}>
                      {(iS as any)[opt.key]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Reactions & Notes */}
            <View style={s.formSection}>
              <Text style={[s.formSectionTitle, { color: colors.muted }]}>{iS.reactionsSection}</Text>

              <Text style={[s.label, { color: colors.foreground }]}>{iS.adverseReactionsLabel}</Text>
              <TextInput
                style={[s.input, s.textarea, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.reactions}
                onChangeText={v => setField('reactions', v)}
                placeholder={iS.reactionsPlaceholder}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                returnKeyType="done"
              />

              <Text style={[s.label, { color: colors.foreground }]}>{iS.notesLabel}</Text>
              <TextInput
                style={[s.input, s.textarea, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.notes}
                onChangeText={v => setField('notes', v)}
                placeholder={iS.notesPlaceholder}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                returnKeyType="done"
                blurOnSubmit={false}
              />
            </View>
            {/* Pharmacy / Clinic Section */}
            <View style={s.formSection}>
              <Text style={[s.formSectionTitle, { color: colors.muted }]}>PHARMACY / CLINIC</Text>
              <Text style={[s.label, { color: colors.foreground }]}>Pharmacy / Clinic Name</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.pharmacyName}
                onChangeText={v => setField('pharmacyName', v)}
                placeholder="e.g. CVS Pharmacy, Walgreens"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />
              <Text style={[s.label, { color: colors.foreground }]}>Phone Number</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.pharmacyPhone}
                onChangeText={v => setField('pharmacyPhone', v)}
                placeholder="e.g. +1-800-555-1234"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                returnKeyType="next"
              />
              <Text style={[s.label, { color: colors.foreground }]}>Address</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={form.pharmacyAddress}
                onChangeText={v => setField('pharmacyAddress', v)}
                placeholder="Street address"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
            </View>

            {/* ── Low-confidence Vision Scan warning banner ── */}
            {photoScanSummary && photoScanSummary.confidence === 'low' && (
              <View style={{
                marginTop: 8,
                marginBottom: 4,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: '#EF4444',
                backgroundColor: isDark ? '#7F1D1D22' : '#FEF2F2',
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <Text style={{ fontSize: 18, lineHeight: 22 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626', marginBottom: 2 }}>Low Confidence Scan</Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#FCA5A5' : '#991B1B', lineHeight: 17 }}>
                    The Smart Scribe could not read all fields clearly. Please review every field below before saving to ensure accuracy.
                  </Text>
                </View>
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* CDC Vaccine Library is now at /log/cdc-vaccines (separate screen) */}

      {/* ── Batch Scribe Review Modal ─────────────────────────────────────── */}
      <Modal
        visible={batchModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setBatchModalVisible(false); setBatchVaccines(null); }}
      >
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { setBatchModalVisible(false); setBatchVaccines(null); }}
              style={s.modalCancel}
            >
              <Text style={[s.modalCancelText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {batchVaccines ? `${batchVaccines.length} Vaccines Detected` : (iS.batchScribeLabel ?? 'Batch Scribe')}
            </Text>
            <TouchableOpacity
              onPress={() => batchVaccines && saveBatchVaccines(batchVaccines)}
              style={[s.modalSave, { backgroundColor: colors.primary }]}
            >
              <Text style={s.modalSaveText}>{iS.saveAllBtn}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8, lineHeight: 18 }}>
              Multiple vaccine entries were detected. Review and tap “Save All” to add them all at once, or tap a card to edit individually.
            </Text>
            {(batchVaccines ?? []).map((v, i) => (
              <View
                key={i}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 18 }}>💉</Text>
                  <Text style={[s.cardTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                    {v.vaccineName ?? (iS.unknownVaccineLabel ?? 'Unknown Vaccine')}
                  </Text>
                  <View style={[s.badge, {
                    backgroundColor: v.confidence === 'high' ? '#DCFCE7' : v.confidence === 'medium' ? '#FEF3C7' : '#FEE2E2'
                  }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: v.confidence === 'high' ? '#16A34A' : v.confidence === 'medium' ? '#D97706' : '#DC2626' }}>
                      {(v.confidence ?? 'low').toUpperCase()}
                    </Text>
                  </View>
                </View>
                {v.dateAdministered && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>📅 {formatDate(v.dateAdministered)}</Text>
                )}
                {v.manufacturer && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>🏭 {v.manufacturer}</Text>
                )}
                {v.doseNumber && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>💊 Dose {v.doseNumber}{v.seriesTotal ? ` of ${v.seriesTotal}` : ''}</Text>
                )}
                {v.reasoning && (
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>
                    {v.reasoning}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => {
                    setBatchModalVisible(false);
                    setBatchVaccines(null);
                    openAdd();
                    fillFormFromScribe(v);
                  }}
                  style={[s.exportBtn, { borderColor: colors.primary, marginTop: 10, alignSelf: 'flex-start' }]}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Edit Before Saving</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backText: { fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryNum: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, marginTop: 1 },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 0,
  },
  deleteBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 80,
    backgroundColor: '#EF4444',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: '100%',
    gap: 2,
  },
  deleteActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardSub: { fontSize: 12, marginTop: 1 },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDetails: { marginTop: 10, gap: 5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: 11, width: 68, flexShrink: 0 },
  detailValue: { fontSize: 13, fontWeight: '500', flex: 1 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  helpIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scribeBadge: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  // Modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { minWidth: 60 },
  modalCancelText: { fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  modalSave: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  formScroll: { paddingHorizontal: 16, paddingTop: 16 },
  formSection: { marginBottom: 20 },
  formSectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 5, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 4,
  },
  textarea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 4,
  },
  libraryBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 6,
  },
  // Scribe
  scribeSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  scribeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  scribeTitle: { fontSize: 15, fontWeight: '700' },
  scribeHint: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  scribeLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  scribeLoadingText: { fontSize: 13 },
  scribeResultBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  scribeDisclaimer: { fontSize: 10, marginTop: 8, lineHeight: 14 },
  // Dose taken / skipped action row
  doseActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doseActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  doseStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
});
