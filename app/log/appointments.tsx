/**
 * Doctor Appointments Screen — 3D Glass UI with Native Date/Time Picker
 *
 * Features:
 * - 3D glass cards for every appointment (upcoming + past)
 * - Add / Edit / Delete appointments
 * - Native wheel picker for date & time (iOS spinner / Android clock)
 * - 24h push notification reminder (auto-scheduled on save)
 * - Prep checklist per appointment
 * - Recurrence support
 * - Clean, crash-free architecture
 */

import { safeFormatDate, safeFormatTime } from '@/lib/utils';
import { appointmentStrings } from '@/lib/i18n';
import { useColorScheme, useColors, useLang } from '@/hooks';
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Animated,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { trpc } from '@/lib/trpc';
import { parseAppointmentTranscript } from '@/lib/scribe/parsers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useHealth } from '@/lib/health/health-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { DatePickerIconButton } from '@/components/date-time-picker-field';
import {
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
  rescheduleAllAppointmentNotifications,
  requestNotificationPermissions,
} from '@/lib/health/appointment-notifications';
import type { DoctorAppointment, PrepChecklistItem } from '@/lib/health/types';
// KeyboardDictationBanner replaced with live dictation text box
import { useDictationHistory } from '@/hooks/use-dictation-history';
import { useFieldFlash } from '@/hooks/use-field-flash';
import { DictationBox, type DictationBoxHandle } from '@/components/dictation-box';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { useUpsell } from '@/hooks/use-upsell';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#3B82F6';
const ACCENT_DARK = '#60A5FA';
const RADIUS = 20;

// Specialty options are resolved at render time via i18n keys (see getSpecialtyOptions)
const SPECIALTY_KEYS: Array<keyof typeof import('@/lib/i18n').appointmentStrings.en> = [
  'specialtyPrimaryCare', 'specialtyCardiology', 'specialtyEndocrinology', 'specialtyNeurology',
  'specialtyOrthopedics', 'specialtyDermatology', 'specialtyOphthalmology', 'specialtyPsychiatry',
  'specialtyOncology', 'specialtyGastroenterology', 'specialtyPulmonology', 'specialtyNephrology',
  'specialtyRheumatology', 'specialtyUrology', 'specialtyGynecology', 'specialtyPediatrics', 'specialtyOther',
];

const CHECKLIST_CHIP_KEYS: Array<keyof typeof import('@/lib/i18n').appointmentStrings.en> = [
  'checklistFasting', 'checklistInsurance', 'checklistMedList',
  'checklistReferral', 'checklistTransport', 'checklistBloodTest',
  'checklistPrevResults', 'checklistPhotoId',
];

const RECURRENCE_OPTION_KEYS: Array<{ key: keyof typeof import('@/lib/i18n').appointmentStrings.en; value: DoctorAppointment['recurrence'] }> = [
  { key: 'recurrenceNone', value: 'none' },
  { key: 'recurrenceMonthly', value: 'monthly' },
  { key: 'recurrenceEvery3m', value: 'every3months' },
  { key: 'recurrenceEvery6m', value: 'every6months' },
  { key: 'recurrenceYearly', value: 'yearly' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `appt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateChecklistId(): string {
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatDateOnly(iso: string): string {
  return safeFormatDate(iso, [], {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTimeOnly(iso: string): string {
  return safeFormatTime(iso, [], { hour: '2-digit', minute: '2-digit' });
}

function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Glass helpers ────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Map helpers ─────────────────────────────────────────────────────────────

function buildMapUrl(location: string, address?: string, zipCode?: string): string {
  const parts = [location, address, zipCode].filter(Boolean).join(', ');
  const encoded = encodeURIComponent(parts);
  if (Platform.OS === 'ios') return `maps://?q=${encoded}`;
  return `geo:0,0?q=${encoded}`;
}

function openInMaps(location: string, address?: string, zipCode?: string): void {
  const url = buildMapUrl(location, address, zipCode);
  Linking.canOpenURL(url)
    .then(supported => {
      if (supported) return Linking.openURL(url);
      // Fallback to Google Maps web
      const encoded = encodeURIComponent([location, address, zipCode].filter(Boolean).join(', '));
      return Linking.openURL(`https://maps.google.com/?q=${encoded}`);
    })
    .catch(() => {});
}

// ─── GlassApptCard ────────────────────────────────────────────────────────────

interface GlassApptCardProps {
  appt: DoctorAppointment;
  accent: string;
  isDark: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleChecklist: (itemId: string) => void;
  /** If provided, shows a coloured badge instead of the countdown chip */
  statusBadge?: { label: string; color: string; bgColor: string; borderColor: string };
  /** If provided, shows a Reschedule action button at the bottom of the card */
  onReschedule?: () => void;
  /** If provided, shows a Log Outcome button at the bottom of the card */
  onLogOutcome?: () => void;
}

function GlassApptCard({ appt, accent, isDark, onEdit, onDelete, onToggleChecklist, statusBadge, onReschedule, onLogOutcome }: GlassApptCardProps) {
  // Resolve t locally — React Compiler breaks closure capture from outer screen scope
  const _cardLang = useLang();
  const t = (appointmentStrings as unknown as Record<string, typeof appointmentStrings.en>)[_cardLang] ?? appointmentStrings.en;
  const upcoming = isUpcoming(appt.dateTime);
  const ms = msUntil(appt.dateTime);
  const isWithin24h = ms > 0 && ms <= 24 * 3_600_000;

  const shadowProps = isDark
    ? { shadowColor: accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 10 }
    : { shadowColor: accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14, elevation: 6 };

  const gradientColors = isDark
    ? (['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.08)', hexToRgba(accent, 0.20)] as const)
    : (['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.76)', hexToRgba(accent, 0.07)] as const);

  const outerBorder = isDark ? hexToRgba(accent, 0.30) : hexToRgba(accent, 0.18);
  const glassBase = isDark ? '#161B22' : 'transparent';

  const checklist = appt.prepChecklist ?? [];
  const checkedCount = checklist.filter(c => c.checked).length;

  return (
    <View style={[styles.glassShell, { borderColor: outerBorder, backgroundColor: glassBase }, shadowProps]}>
      <LinearGradient colors={gradientColors} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.glassBody}>
        {/* Specular streak */}
        <LinearGradient
          colors={[isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.90)', isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.specularStreak}
        />
        {/* Rim highlights */}
        <View style={[styles.rimTop, { backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)' }]} />
        <View style={[styles.rimLeft, { backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)' }]} />
        <View style={[styles.rimBottom, { backgroundColor: isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.10)' }]} />
        <View style={[styles.rimRight, { backgroundColor: isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.10)' }]} />
        {/* Accent glow */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', hexToRgba(accent, isDark ? 0.16 : 0.07)]}
          start={{ x: 0.5, y: 0.4 }} end={{ x: 0.5, y: 1 }}
          style={styles.accentGlow}
        />

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.statusDot, { backgroundColor: upcoming ? accent : (isDark ? '#4B5563' : '#9CA3AF') }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.doctorName, { color: isDark ? '#F9FAFB' : '#111827' }]} numberOfLines={1}>
                  {appt.doctorName || t.doctorFallback}
                </Text>
                {appt.specialty ? (
                  <Text style={[styles.specialty, { color: isDark ? hexToRgba(accent, 0.85) : accent }]}>
                    {appt.specialty}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.cardHeaderRight}>
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                onPress={onEdit}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)' }]}
                onPress={onDelete}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Date / time */}
          <View style={styles.dateRow}>
            <Text style={{ fontSize: 13 }}>📅</Text>
            <Text style={[styles.dateText, { color: isDark ? '#D1D5DB' : '#374151' }]}>
              {formatDateOnly(appt.dateTime)}
            </Text>
          </View>
          <View style={styles.dateRow}>
            <Text style={{ fontSize: 13 }}>🕐</Text>
            <Text style={[styles.dateText, { color: isDark ? '#D1D5DB' : '#374151' }]}>
              {formatTimeOnly(appt.dateTime)}
            </Text>
            {statusBadge ? (
              <View style={[styles.countdownChip, { backgroundColor: statusBadge.bgColor, borderColor: statusBadge.borderColor }]}>
                <Text style={[styles.countdownText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
              </View>
            ) : upcoming ? (
              <View style={[styles.countdownChip, { backgroundColor: isWithin24h ? hexToRgba('#EF4444', 0.15) : hexToRgba(accent, 0.12), borderColor: isWithin24h ? hexToRgba('#EF4444', 0.35) : hexToRgba(accent, 0.30) }]}>
                <Text style={[styles.countdownText, { color: isWithin24h ? (isDark ? '#FCA5A5' : '#DC2626') : (isDark ? ACCENT_DARK : accent) }]}>
                  ⏱ {fmtCountdown(ms)}
                </Text>
              </View>
            ) : (
              <View style={[styles.countdownChip, { backgroundColor: isDark ? 'rgba(75,85,99,0.20)' : 'rgba(156,163,175,0.15)', borderColor: isDark ? 'rgba(75,85,99,0.40)' : 'rgba(156,163,175,0.30)' }]}>
                <Text style={[styles.countdownText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Past</Text>
              </View>
            )}
          </View>

          {/* Location + Map thumbnail */}
          {appt.location ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => openInMaps(appt.location!, (appt as any).address, (appt as any).zipCode)}
              style={[styles.mapRow, { borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
            >
              {/* Map icon thumbnail */}
              <View style={[styles.mapThumb, { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)', borderColor: isDark ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.20)' }]}>
                <Text style={{ fontSize: 20 }}>🗺️</Text>
              </View>
              {/* Address text */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.dateText, { color: isDark ? '#D1D5DB' : '#374151', fontWeight: '500' }]} numberOfLines={1}>
                  {appt.location}
                </Text>
                {((appt as any).address || (appt as any).zipCode) ? (
                  <Text style={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 1 }} numberOfLines={1}>
                    {[(appt as any).address, (appt as any).zipCode].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
              </View>
              {/* Open in Maps arrow */}
              <View style={[styles.mapOpenBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.12)', borderColor: isDark ? 'rgba(59,130,246,0.40)' : 'rgba(59,130,246,0.25)' }]}>
                <Text style={{ fontSize: 11, color: accent, fontWeight: '600' }}>{t.openLabel}</Text>
                <Text style={{ fontSize: 10, color: accent }}>›</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Notes */}
          {appt.notes ? (
            <Text style={[styles.notes, { color: isDark ? '#9CA3AF' : '#6B7280', borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} numberOfLines={2}>
              {appt.notes}
            </Text>
          ) : null}

          {/* Prep checklist */}
          {checklist.length > 0 && (
            <View style={[styles.checklistSection, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <Text style={[styles.checklistTitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                {t.prepChecklistLabel} · {checkedCount}/{checklist.length}
              </Text>
              {checklist.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checklistItem}
                  onPress={() => onToggleChecklist(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, { borderColor: item.checked ? accent : (isDark ? '#4B5563' : '#D1D5DB'), backgroundColor: item.checked ? hexToRgba(accent, 0.15) : 'transparent' }]}>
                    {item.checked && <Text style={{ fontSize: 10, color: accent }}>✓</Text>}
                  </View>
                  <Text style={[styles.checklistLabel, { color: item.checked ? (isDark ? '#9CA3AF' : '#9CA3AF') : (isDark ? '#D1D5DB' : '#374151'), textDecorationLine: item.checked ? 'line-through' : 'none' }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Recurrence badge */}
          {appt.recurrence && appt.recurrence !== 'none' && (
            <View style={[styles.recurrenceBadge, { backgroundColor: hexToRgba(accent, 0.10), borderColor: hexToRgba(accent, 0.25) }]}>
              <Text style={[styles.recurrenceText, { color: isDark ? ACCENT_DARK : accent }]}>
                🔄 {(() => { const found = RECURRENCE_OPTION_KEYS.find(r => r.value === appt.recurrence); return found ? t[found.key] : appt.recurrence; })()}
              </Text>
            </View>
          )}

          {/* Outcome logged badge */}
          {appt.missedOutcome && (
            <View style={[styles.recurrenceBadge, {
              backgroundColor: appt.missedOutcome === 'attended' ? hexToRgba('#22C55E', 0.12) :
                appt.missedOutcome === 'rebooked' ? hexToRgba('#3B82F6', 0.12) :
                appt.missedOutcome === 'cancelled' ? hexToRgba('#6B7280', 0.12) :
                hexToRgba('#F59E0B', 0.12),
              borderColor: appt.missedOutcome === 'attended' ? hexToRgba('#22C55E', 0.35) :
                appt.missedOutcome === 'rebooked' ? hexToRgba('#3B82F6', 0.35) :
                appt.missedOutcome === 'cancelled' ? hexToRgba('#6B7280', 0.35) :
                hexToRgba('#F59E0B', 0.35),
            }]}>
              <Text style={[styles.recurrenceText, { color:
                appt.missedOutcome === 'attended' ? (isDark ? '#4ADE80' : '#16A34A') :
                appt.missedOutcome === 'rebooked' ? (isDark ? '#93C5FD' : '#1D4ED8') :
                appt.missedOutcome === 'cancelled' ? (isDark ? '#9CA3AF' : '#4B5563') :
                (isDark ? '#FCD34D' : '#92400E'),
              }]}>
                {appt.missedOutcome === 'attended' ? '✓ Attended' :
                  appt.missedOutcome === 'rebooked' ? '🔄 Rebooked' :
                  appt.missedOutcome === 'cancelled' ? '✕ Cancelled' :
                  '⚠ Missed'}
              </Text>
            </View>
          )}

          {/* Action buttons for missed/history tabs */}
          {(onReschedule || onLogOutcome) && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {onLogOutcome && (
                <TouchableOpacity
                  onPress={onLogOutcome}
                  style={[styles.cardActionBtn, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7', borderColor: isDark ? 'rgba(245,158,11,0.40)' : '#FCD34D' }]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.cardActionBtnText, { color: isDark ? '#FCD34D' : '#92400E' }]}>📝 Log outcome</Text>
                </TouchableOpacity>
              )}
              {onReschedule && (
                <TouchableOpacity
                  onPress={onReschedule}
                  style={[styles.cardActionBtn, { backgroundColor: isDark ? hexToRgba(accent, 0.15) : '#EFF6FF', borderColor: isDark ? hexToRgba(accent, 0.40) : '#BFDBFE' }]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.cardActionBtnText, { color: isDark ? ACCENT_DARK : accent }]}>↻ Reschedule</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ isDark, accent, onAdd }: { isDark: boolean; accent: string; onAdd: () => void }) {
  // useLang + t pre-wired so future i18n additions don't hit the FormModal closure bug
  const _emptyLang = useLang();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _emptyT = (appointmentStrings as unknown as Record<string, typeof appointmentStrings.en>)[_emptyLang];
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🩺</Text>
      <Text style={[styles.emptyTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>{_emptyT.noAppointments}</Text>
      <Text style={[styles.emptySubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
        {_emptyT.noAppointmentsSubtitle}
      </Text>
      <TouchableOpacity
        style={[styles.emptyBtn, { backgroundColor: accent }]}
        onPress={onAdd}
        activeOpacity={0.85}
      >
        <Text style={styles.emptyBtnText}>+ {_emptyT.addAppointment}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  doctorName: string;
  specialty: string;
  /** The combined date+time as a JS Date (null = not yet set) */
  dateTime: Date | null;
  location: string;
  address: string;
  zipCode: string;
  notes: string;
  recurrence: DoctorAppointment['recurrence'];
  checklist: PrepChecklistItem[];
  newChecklistLabel: string;
}

const EMPTY_FORM: FormState = {
  doctorName: '',
  specialty: '',
  dateTime: null,
  location: '',
  address: '',
  zipCode: '',
  notes: '',
  recurrence: 'none',
  checklist: [],
  newChecklistLabel: '',
};

function apptToForm(appt: DoctorAppointment): FormState {
  return {
    doctorName: appt.doctorName,
    specialty: appt.specialty ?? '',
    dateTime: new Date(appt.dateTime),
    location: appt.location ?? '',
    address: (appt as any).address ?? '',
    zipCode: (appt as any).zipCode ?? '',
    notes: appt.notes ?? '',
    recurrence: appt.recurrence ?? 'none',
    checklist: appt.prepChecklist ?? [],
    newChecklistLabel: '',
  };
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

interface FormModalProps {
  visible: boolean;
  editing: DoctorAppointment | null;
  isDark: boolean;
  accent: string;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onSave: (form: FormState) => void;
  /** Pre-populated values for a new appointment (used by Rebook shortcut) */
  prefillForm?: Partial<FormState>;
  /** All existing appointments — used for conflict detection */
  allAppointments?: DoctorAppointment[];
}

function FormModal({ visible, editing, isDark, accent, colors, onClose, onSave, prefillForm, allAppointments = [] }: FormModalProps) {
  const _fmLang = useLang();
  const t = (appointmentStrings as unknown as Record<string, typeof appointmentStrings.en>)[_fmLang];
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ doctorName?: string; dateTime?: string }>({});
  const [showSpecialtyPicker, setShowSpecialtyPicker] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [dictationParsing, setDictationParsing] = useState(false);
  const dictationInputRef = useRef<DictationBoxHandle>(null);
  const { pushPhrase: pushApptPhrase } = useDictationHistory('appointments');
  const APPT_FIELDS = ['title', 'dateTime', 'doctor', 'location', 'address', 'zipCode', 'specialty', 'notes'];
  const { flash: flashApptFields } = useFieldFlash(APPT_FIELDS);



  const applyScribeResult = useCallback((result: {
    doctorName: string | null; specialty: string | null; dateTime: string | null;
    location: string | null; notes: string | null; referredBy: string | null;
    transcript: string; confidence: string; reasoning: string;
  }) => {
    if (result.doctorName) setForm(prev => ({ ...prev, doctorName: result.doctorName! }));
    if (result.specialty) setForm(prev => ({ ...prev, specialty: result.specialty! }));
    if (result.dateTime) {
      const d = new Date(result.dateTime);
      if (!isNaN(d.getTime())) setForm(prev => ({ ...prev, dateTime: d }));
    }
    if (result.location) setForm(prev => ({ ...prev, location: result.location! }));
    if (result.notes) setForm(prev => ({ ...prev, notes: result.notes! }));
    if (Platform.OS !== 'web') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const handleDictationSubmit = useCallback(() => {
    const text = dictationText.trim();
    if (!text) return;
    setDictationParsing(true);
    try {
      const result = parseAppointmentTranscript(text);
      applyScribeResult({ ...result, transcript: text, confidence: 'high', reasoning: '' });
      pushApptPhrase(text);
      const filled: string[] = [];
      if (result.doctorName) filled.push('doctorName');
      if (result.dateTime) filled.push('dateTime');
      if (result.location) filled.push('location');
      if (result.specialty) filled.push('specialty');
      if (result.notes) filled.push('notes');
      flashApptFields(filled);
      setDictationText('');
    } catch (e) {
      console.warn('[Appointment Dictation] parse failed', e);
    } finally {
      setDictationParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationText, applyScribeResult]);

  // Reset form when modal opens
  React.useEffect(() => {
    if (visible) {
      if (editing) {
        setForm(apptToForm(editing));
      } else if (prefillForm) {
        // Rebook shortcut: new appointment pre-filled with same doctor details, date cleared
        setForm({ ...EMPTY_FORM, ...prefillForm, dateTime: null });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrors({});
      setShowSpecialtyPicker(false);
    }
  }, [visible, editing, prefillForm]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  }, []);

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.doctorName.trim()) errs.doctorName = t.doctorNameRequired ?? 'Doctor name is required';
    if (!form.dateTime || isNaN(form.dateTime.getTime())) errs.dateTime = 'Date & time is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function addChecklistItem() {
    const label = form.newChecklistLabel.trim();
    if (!label) return;
    set('checklist', [...form.checklist, { id: generateChecklistId(), label, checked: false }]);
    set('newChecklistLabel', '');
  }

  function removeChecklistItem(id: string) {
    set('checklist', form.checklist.filter(c => c.id !== id));
  }

  function addChip(label: string) {
    if (form.checklist.some(c => c.label === label)) return;
    set('checklist', [...form.checklist, { id: generateChecklistId(), label, checked: false }]);
  }

  const inputStyle = [styles.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB', borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB', color: colors.foreground }];
  const labelStyle = [styles.inputLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }];

  // ── Conflict detection ────────────────────────────────────────────────────
  // Warn if another appointment is within 30 minutes of the selected dateTime
  const CONFLICT_WINDOW_MS = 30 * 60 * 1000;
  const conflictingAppt = React.useMemo(() => {
    if (!form.dateTime || isNaN(form.dateTime.getTime())) return null;
    const selectedMs = form.dateTime.getTime();
    return allAppointments.find(a => {
      // Skip the appointment being edited
      if (editing && a.id === editing.id) return false;
      const apptMs = new Date(a.dateTime).getTime();
      return Math.abs(apptMs - selectedMs) < CONFLICT_WINDOW_MS;
    }) ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.dateTime, allAppointments, editing]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalContainer, { backgroundColor: isDark ? '#0F1117' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
              <Text style={[styles.modalCancelText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>{t.cancel}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>
              {editing ? t.editTitle : prefillForm ? (t.rebookTitle ?? 'Rebook Appointment') : t.newAppointment}
            </Text>
            <TouchableOpacity
              onPress={() => { if (validate()) onSave(form); }}
              style={[styles.modalSaveBtn, { backgroundColor: accent }]}
            >
              <Text style={styles.modalSaveText}>{t.save}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* ── Dictation Box ── */}
            <DictationBox
              ref={dictationInputRef}
              formKey="appointments"
              label="📅  DICTATE APPOINTMENT"
              placeholder="Speak or type: 'Cardiology follow-up with Dr. Chen at City Medical Center, next Tuesday at 2pm…'"
              value={dictationText}
              onChangeText={setDictationText}
              onSubmit={handleDictationSubmit}
              isParsing={dictationParsing}
              colors={colors}
            />
            {/* ── Conflict Warning Banner ── */}
            {conflictingAppt && (
              <View style={{
                marginBottom: 12,
                backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#FDE68A',
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <Text style={{ fontSize: 15 }}>⚠️</Text>
                <Text style={{ flex: 1, fontSize: 12, color: isDark ? '#FCD34D' : '#92400E', lineHeight: 18 }}>
                  {t.conflictNudge.replace('{name}', conflictingAppt.doctorName ? `Dr. ${conflictingAppt.doctorName}` : 'an appointment').replace('{time}', safeFormatTime(conflictingAppt.dateTime, [], { hour: '2-digit', minute: '2-digit' }))}
                </Text>
              </View>
            )}
            {/* Doctor name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={[labelStyle, { marginBottom: 0 }]}>{t.doctorNameLabel}</Text>
            </View>
            <TextInput
              style={[inputStyle, errors.doctorName && { borderColor: colors.error }]}
              value={form.doctorName}
              onChangeText={(v) => set('doctorName', v)}
              placeholder={t.doctorPlaceholder}
              placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
              returnKeyType="next"
            />
            {errors.doctorName ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.doctorName}</Text> : null}

            {/* Specialty */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.specialtyLabel}</Text>
            <TouchableOpacity
              style={[inputStyle, { justifyContent: 'center' }]}
              onPress={() => setShowSpecialtyPicker(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={{ color: form.specialty ? colors.foreground : (isDark ? '#4B5563' : '#9CA3AF'), fontSize: 15 }}>
                {form.specialty || 'Select specialty…'}
              </Text>
            </TouchableOpacity>

            {/* Specialty picker inline */}
            {showSpecialtyPicker && (
              <View style={[styles.specialtyPicker, { backgroundColor: isDark ? '#1A1D27' : '#F9FAFB', borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB' }]}>
                {SPECIALTY_KEYS.map(k => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.specialtyOption, form.specialty === t[k] && { backgroundColor: hexToRgba(accent, 0.12) }]}
                    onPress={() => { set('specialty', t[k]); setShowSpecialtyPicker(false); }}
                  >
                    <Text style={[styles.specialtyOptionText, { color: form.specialty === t[k] ? accent : (isDark ? '#D1D5DB' : '#374151') }]}>{t[k]}</Text>
                    {form.specialty === t[k] && <Text style={{ color: accent, fontSize: 13 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

              {/* ── Date & Time — plain text input, dictation-compatible ──────────────── */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.dateTimeLabel}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                style={[inputStyle, errors.dateTime && { borderColor: colors.error }, { flex: 1 }]}
                value={form.dateTime ? form.dateTime.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                onChangeText={v => {
                  const lower = v.trim().toLowerCase();
                  if (lower === 'today') { const d = new Date(); d.setSeconds(0, 0); set('dateTime', d); return; }
                  if (lower === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setSeconds(0, 0); set('dateTime', d); return; }
                  if (!v.trim()) { set('dateTime', null); return; }
                  const parsed = new Date(v);
                  if (!isNaN(parsed.getTime())) { set('dateTime', parsed); return; }
                  // Keep raw text as partial input — will fail validation if not parseable
                  set('dateTime', null);
                }}
                placeholder={`e.g. ${safeFormatDate(Date.now(), 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 10:00 AM`}
                placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
                returnKeyType="done"
              />
              <DatePickerIconButton
                mode="datetime"
                value={form.dateTime}
                onChange={(d) => set('dateTime', d)}
                inModal
              />
            </View>
            {errors.dateTime ? (
              <Text style={{ color: isDark ? '#F87171' : '#EF4444', fontSize: 12, marginTop: 2 }}>
                {errors.dateTime}
              </Text>
            ) : null}
            {/* ── Conflict nudge: shown inline, before Save ──────────────────── */}
            {!errors.dateTime && conflictingAppt ? (
              <View style={[{
                flexDirection: 'row', alignItems: 'flex-start', gap: 6,
                marginTop: 6, marginBottom: 2,
                backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)',
                borderColor: isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.40)',
                borderWidth: 1, borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 8,
              }]}>
                <Text style={{ fontSize: 14, marginTop: 1 }}>⚠️</Text>
                <Text style={{ flex: 1, fontSize: 12, color: isDark ? '#FCD34D' : '#92400E', lineHeight: 17 }}>
                  <Text style={{ fontWeight: '700' }}>{t.schedulingConflict}</Text>
                  {conflictingAppt.doctorName
                    ? `Dr. ${conflictingAppt.doctorName}`
                    : (t.anotherAppointment ?? 'Another appointment')}{' '}
                  is within 30 minutes of this time
                  {conflictingAppt.dateTime
                    ? ` (${safeFormatDate(conflictingAppt.dateTime, 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})`
                    : ''}
                  . You can still save — just double-check your schedule.
                </Text>
              </View>
            ) : null}

            {/* Location */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.locationLabel}</Text>
            <TextInput
              style={[inputStyle]}
              value={form.location}
              onChangeText={v => set('location', v)}
              placeholder={t.locationPlaceholder}
              placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
              returnKeyType="next"
            />

            {/* Address */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.addressLabel}</Text>
            <TextInput
              style={[inputStyle]}
              value={form.address}
              onChangeText={v => set('address', v)}
              placeholder={t.addressPlaceholder}
              placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
              returnKeyType="next"
            />

            {/* Zip Code */}
            <Text style={[labelStyle, { marginTop: 12 }]}>{t.zipCodeLabel}</Text>
            <TextInput
              style={[inputStyle]}
              value={form.zipCode}
              onChangeText={v => set('zipCode', v)}
              placeholder="e.g. 90210"
              placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
            />

            {/* Notes */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.notesLabel}</Text>
            <TextInput
              style={[inputStyle, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
              value={form.notes}
              onChangeText={v => set('notes', v)}
              placeholder={t.notesPlaceholder}
              placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
              multiline
              numberOfLines={3}
              blurOnSubmit={false}
            />            {/* Recurrence */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.recurrenceLabel}</Text>
            <View style={styles.recurrenceRow}>
              {RECURRENCE_OPTION_KEYS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.recurrenceChip, { backgroundColor: form.recurrence === opt.value ? hexToRgba(accent, 0.15) : (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'), borderColor: form.recurrence === opt.value ? hexToRgba(accent, 0.45) : (isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB') }]}
                  onPress={() => set('recurrence', opt.value)}
                >
                  <Text style={[styles.recurrenceChipText, { color: form.recurrence === opt.value ? accent : (isDark ? '#D1D5DB' : '#374151') }]}>
                    {t[opt.key]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Prep checklist */}
            <Text style={[labelStyle, { marginTop: 16 }]}>{t.prepChecklistLabel}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
              {CHECKLIST_CHIP_KEYS.map(chip => (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chipBtn, { backgroundColor: form.checklist.some(c => c.label === t[chip]) ? hexToRgba(accent, 0.15) : (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'), borderColor: form.checklist.some(c => c.label === t[chip]) ? hexToRgba(accent, 0.40) : (isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB') }]}
                  onPress={() => addChip(t[chip])}
                >
                  <Text style={[styles.chipText, { color: form.checklist.some(c => c.label === t[chip]) ? accent : (isDark ? '#D1D5DB' : '#374151') }]}>
                    {form.checklist.some(c => c.label === t[chip]) ? '✓ ' : '+ '}{t[chip]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.checklistInputRow}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                value={form.newChecklistLabel}
                onChangeText={v => set('newChecklistLabel', v)}
                placeholder={t.customItemPlaceholder}
                placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
                onSubmitEditing={addChecklistItem}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addItemBtn, { backgroundColor: accent }]}
                onPress={addChecklistItem}
              >
                 <Text style={styles.addItemBtnText}>{t.addLabel}</Text>
              </TouchableOpacity>
            </View>
            {form.checklist.map(item => (
              <View key={item.id} style={[styles.checklistFormItem, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
                <Text style={[styles.checklistFormLabel, { color: isDark ? '#D1D5DB' : '#374151' }]}>{item.label}</Text>
                <TouchableOpacity onPress={() => removeChecklistItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

function AppointmentsScreenInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const colors = useColors();
  const accent = isDark ? ACCENT_DARK : ACCENT;
  const lang = useLang();
  const t = ((appointmentStrings as unknown as Record<string, typeof appointmentStrings.en>)[lang] ?? appointmentStrings.en);
  const { checkAndShow: checkUpsell, UpsellSheet } = useUpsell();

  const { state, addAppointment, updateAppointment, deleteAppointment } = useHealth();
  const appointments = useMemo(
    () => [...(state.data?.appointments ?? [])].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()),
    [state.data?.appointments],
  );

  const upcoming = useMemo(() => appointments.filter(a => isUpcoming(a.dateTime)), [appointments]);
  // Missed: past appointments without a logged outcome (or with outcome === 'missed'), within last 30 days
  const MISSED_WINDOW_MS = 30 * 24 * 3600_000;
  const missed = useMemo(() => appointments.filter(a => {
    const t = new Date(a.dateTime).getTime();
    const ageMs = Date.now() - t;
    return !isUpcoming(a.dateTime) && ageMs <= MISSED_WINDOW_MS && !a.missedOutcome;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).reverse(), [appointments]);
  // History: all past appointments (sorted newest first)
  const history = useMemo(() => appointments.filter(a => !isUpcoming(a.dateTime)).reverse(), [appointments]);
  // Rescheduled: appointments that have been moved (have originalDateTime set), sorted newest rescheduled first
  const rescheduled = useMemo(() =>
    appointments.filter(a => !!a.originalDateTime).sort((a, b) =>
      new Date(b.rescheduledAt ?? b.dateTime).getTime() - new Date(a.rescheduledAt ?? a.dateTime).getTime()
    ),
  [appointments]);

  // Deep-link: ?rescheduleId=appt_xxx opens the edit modal for that appointment
  // Deep-link: ?tab=missed|upcoming|history switches the active tab on arrival
  const { rescheduleId, tab: tabParam, outcomeApptId } = useLocalSearchParams<{ rescheduleId?: string; tab?: string; outcomeApptId?: string }>();

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<DoctorAppointment | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'rescheduled' | 'missed' | 'history'>(
    tabParam === 'missed' ? 'missed' : tabParam === 'history' ? 'history' : tabParam === 'rescheduled' ? 'rescheduled' : 'upcoming'
  );

  // When tabParam changes (e.g. re-navigation from clinical narrative), switch tab
  React.useEffect(() => {
    if (tabParam === 'missed') setActiveTab('missed');
    else if (tabParam === 'history') setActiveTab('history');
    else if (tabParam === 'rescheduled') setActiveTab('rescheduled');
    else if (tabParam === 'upcoming') setActiveTab('upcoming');
  }, [tabParam]);

  // Deep-link from missed follow-up notification: auto-open outcome modal for specific appointment
  React.useEffect(() => {
    if (!outcomeApptId || appointments.length === 0) return;
    const target = appointments.find(a => a.id === outcomeApptId);
    if (target && !target.missedOutcome) {
      setActiveTab('missed');
      openOutcomeModal(target);
    }
  // Only trigger on mount / when outcomeApptId changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomeApptId, appointments.length]);

  // ── Outcome modal ────────────────────────────────────────────────────────────
  const [outcomeAppt, setOutcomeAppt] = useState<DoctorAppointment | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');

  function openOutcomeModal(appt: DoctorAppointment) {
    setOutcomeAppt(appt);
    setOutcomeNote(appt.outcomeNote ?? '');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // Pre-fill data for the Rebook shortcut (cleared when modal closes)
  const [rebookPrefill, setRebookPrefill] = useState<Partial<FormState> | undefined>(undefined);

  async function saveOutcome(outcome: DoctorAppointment['missedOutcome']) {
    if (!outcomeAppt) return;
    const source = outcomeAppt; // capture before clearing
    const updated: DoctorAppointment = { ...source, missedOutcome: outcome, outcomeNote: outcomeNote.trim() || undefined };
    await updateAppointment(updated);
    setOutcomeAppt(null);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (outcome === 'rebooked') {
      // Open Add Appointment form pre-filled with same doctor details, date cleared
      const prefill: Partial<FormState> = {
        doctorName: source.doctorName,
        specialty: source.specialty ?? '',
        location: source.location ?? '',
        notes: source.notes ?? '',
        recurrence: source.recurrence ?? 'none',
        checklist: (source.prepChecklist ?? []).map(c => ({ ...c, checked: false })),
      };
      setRebookPrefill(prefill);
      setEditing(null);
      setModalVisible(true);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast(`Rebooked — pick a new date for ${source.doctorName || (t.doctorAppointment ?? 'appointment')}`);
    } else {
      const label = outcome === 'attended' ? t.outcomeAttended : outcome === 'cancelled' ? t.outcomeCancelled : t.outcomeMissed;
      showToast(`${source.doctorName || (t.doctorAppointment ?? 'Appointment')} — ${label}`);
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  function showToast(msg: string) {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  // Open edit modal automatically when arriving via reschedule deep-link
  React.useEffect(() => {
    if (!rescheduleId || appointments.length === 0) return;
    const target = appointments.find(a => a.id === rescheduleId);
    if (target) openEdit(target);
  // openEdit is stable (defined below), appointments.length triggers once data loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleId, appointments.length]);

  // On mount: reschedule all upcoming appointment notifications (recovers after app reinstall)
  React.useEffect(() => {
    if (appointments.length > 0) {
      rescheduleAllAppointmentNotifications(appointments);
    }
  // Run once when appointments data first loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.length > 0]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setModalVisible(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function openEdit(appt: DoctorAppointment) {
    setEditing(appt);
    setModalVisible(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleDelete(appt: DoctorAppointment) {
    Alert.alert(
      t.deleteTitle ?? 'Delete Appointment',
      `${t.deleteConfirm ?? 'Remove appointment with'} ${appt.doctorName || (t.doctorFallback ?? 'this doctor')}?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete, style: 'destructive',
          onPress: async () => {
            // Cancel any scheduled reminder before deleting
            await cancelAppointmentNotification(appt.id);
            await deleteAppointment(appt.id);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }

  async function handleSave(form: FormState) {
    if (!form.dateTime || isNaN(form.dateTime.getTime())) return;
    const iso = form.dateTime.toISOString();

    // Request notification permission on first save
    if (Platform.OS !== 'web') {
      await requestNotificationPermissions();
    }

    if (editing) {
      // If the dateTime changed, record the original datetime for the Rescheduled tab
      const dateChanged = editing.dateTime !== iso;
      const updated: DoctorAppointment = {
        ...editing,
        doctorName: form.doctorName.trim(),
        specialty: form.specialty || undefined,
        dateTime: iso,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        recurrence: form.recurrence,
        prepChecklist: form.checklist,
        reminderDismissed: false,
        // Preserve the very first original datetime (don't overwrite if already rescheduled before)
        originalDateTime: dateChanged
          ? (editing.originalDateTime ?? editing.dateTime)
          : editing.originalDateTime,
        rescheduledAt: dateChanged ? new Date().toISOString() : editing.rescheduledAt,
      };
      await updateAppointment(updated);
      // Reschedule the 24h reminder with the updated dateTime
      await scheduleAppointmentNotification(updated);
    } else {
      const newAppt: DoctorAppointment = {
        id: generateId(),
        doctorName: form.doctorName.trim(),
        specialty: form.specialty || undefined,
        dateTime: iso,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        recurrence: form.recurrence,
        prepChecklist: form.checklist,
        reminderDismissed: false,
      };
      await addAppointment(newAppt);
      // Schedule the 24h reminder for the new appointment
      await scheduleAppointmentNotification(newAppt);
      // Contextual upsell: fire after 3rd appointment booking (free users only)
      setTimeout(() => { checkUpsell('appointment_first_create').catch(() => {}); }, 600);
    }

    setModalVisible(false);
    setRebookPrefill(undefined);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Show reschedule-confirmed toast when editing an existing appointment
    if (editing) {
      const name = form.doctorName.trim() || (editing.specialty ?? (t.doctorAppointment ?? 'Appointment'));
      const dateLabel = form.dateTime
        ? form.dateTime.toLocaleDateString([], { month: 'short', day: 'numeric' })
        : '';
      showToast(`${name} rescheduled to ${dateLabel} ✓`);
    } else if (rebookPrefill) {
      // Was a rebook — show booked confirmation
      const name = form.doctorName.trim() || (t.doctorAppointment ?? 'Appointment');
      const dateLabel = form.dateTime
        ? form.dateTime.toLocaleDateString([], { month: 'short', day: 'numeric' })
        : '';
      showToast(`${name} rebooked for ${dateLabel} ✓`);
    }
  }

  function handleToggleChecklist(appt: DoctorAppointment, itemId: string) {
    const updated: DoctorAppointment = {
      ...appt,
      prepChecklist: (appt.prepChecklist ?? []).map(c =>
        c.id === itemId ? { ...c, checked: !c.checked } : c,
      ),
    };
    updateAppointment(updated);
  }  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: isDark ? '#0A0C14' : '#F8FAFC' }]}>
      {/* Contextual upsell bottom sheet */}
      {UpsellSheet}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: isDark ? '#0A0C14' : '#F8FAFC', borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB' }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/record' as any)}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol name="arrow.left" size={20} color={accent} />
          <Text style={[styles.backText, { color: accent }]}>{t.backLabel}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>{t.title ?? 'Appointments'}</Text>
          <Text style={[styles.headerSubtitle, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
            {upcoming.length} upcoming · {rescheduled.length > 0 ? `${rescheduled.length} rescheduled · ` : ''}{missed.length > 0 ? `${missed.length} missed · ` : ''}{history.length} past
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: accent }]}
          onPress={openAdd}
          activeOpacity={0.85}
        >
        <Text style={styles.addBtnText}>{t.addLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* 4-tab bar: Upcoming / Rescheduled / Missed / History */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: isDark ? '#0A0C14' : '#F8FAFC', borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB' }]}
        contentContainerStyle={{ flexDirection: 'row' }}
      >
        {([
          { key: 'upcoming',    label: `${t.upcoming ?? 'Upcoming'} (${upcoming.length})`,    accent: accent },
          { key: 'rescheduled', label: `${t.rescheduled ?? 'Rescheduled'}${rescheduled.length > 0 ? ` (${rescheduled.length})` : ''}`, accent: '#8B5CF6' },
          { key: 'missed',      label: `${t.missed ?? 'Missed'}${missed.length > 0 ? ` (${missed.length})` : ''}`,       accent: '#F59E0B' },
          { key: 'history',     label: `${t.history ?? 'History'} (${history.length})`,      accent: accent },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && [styles.tabActive, { borderBottomColor: tab.accent }]]}
            onPress={() => {
              setActiveTab(tab.key);
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.key ? tab.accent : (isDark ? '#6B7280' : '#9CA3AF') }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'upcoming' && (
          upcoming.length === 0
            ? <EmptyState isDark={isDark} accent={accent} onAdd={openAdd} />
            : upcoming.map(appt => (
                <GlassApptCard
                  key={appt.id}
                  appt={appt}
                  accent={accent}
                  isDark={isDark}
                  onEdit={() => openEdit(appt)}
                  onDelete={() => handleDelete(appt)}
                  onToggleChecklist={itemId => handleToggleChecklist(appt, itemId)}
                />
              ))
        )}

        {activeTab === 'rescheduled' && (
          rescheduled.length === 0
            ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>🔄</Text>
                  <Text style={[styles.emptyTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>{t.noRescheduled}</Text>
                  <Text style={[styles.emptySubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    {t.noRescheduledSubtitle ?? 'When you change the date of an existing appointment, it will appear here with its original date recorded.'}
                  </Text>
                </View>
              )
            : rescheduled.map(appt => {
                const origDate = appt.originalDateTime
                  ? safeFormatDate(appt.originalDateTime, [], { month: 'short', day: 'numeric', year: 'numeric' })
                  : '';
                const origTime = appt.originalDateTime
                  ? safeFormatTime(appt.originalDateTime, [], { hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <GlassApptCard
                    key={appt.id}
                    appt={appt}
                    accent={'#8B5CF6'}
                    isDark={isDark}
                    onEdit={() => openEdit(appt)}
                    onDelete={() => handleDelete(appt)}
                    onToggleChecklist={itemId => handleToggleChecklist(appt, itemId)}
                    statusBadge={{
                      label: `🔄 Rescheduled · was ${origDate} ${origTime}`,
                      color: isDark ? '#C4B5FD' : '#6D28D9',
                      bgColor: isDark ? 'rgba(139,92,246,0.18)' : '#EDE9FE',
                      borderColor: isDark ? 'rgba(139,92,246,0.45)' : '#C4B5FD',
                    }}
                    onReschedule={() => openEdit(appt)}
                  />
                );
              })
        )}

        {activeTab === 'missed' && (
          missed.length === 0
            ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>✅</Text>
                  <Text style={[styles.emptyTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>{t.noMissed}</Text>
                  <Text style={[styles.emptySubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    {t.noMissedSubtitle ?? 'Appointments that pass without a logged outcome will appear here for up to 30 days.'}
                  </Text>
                </View>
              )
            : missed.map(appt => {
                const daysAgo = Math.floor((Date.now() - new Date(appt.dateTime).getTime()) / (24 * 3600_000));
                const daysAgoLabel = daysAgo === 0 ? (t.today ?? 'Today') : daysAgo === 1 ? (t.yesterday ?? 'Yesterday') : `${daysAgo}d ago`;
                return (
                  <GlassApptCard
                    key={appt.id}
                    appt={appt}
                    accent={accent}
                    isDark={isDark}
                    onEdit={() => openEdit(appt)}
                    onDelete={() => handleDelete(appt)}
                    onToggleChecklist={itemId => handleToggleChecklist(appt, itemId)}
                    statusBadge={{
                      label: `⚠ Missed · ${daysAgoLabel}`,
                      color: isDark ? '#FCD34D' : '#92400E',
                      bgColor: isDark ? 'rgba(245,158,11,0.18)' : '#FEF3C7',
                      borderColor: isDark ? 'rgba(245,158,11,0.45)' : '#FCD34D',
                    }}
                    onReschedule={() => openEdit(appt)}
                    onLogOutcome={() => openOutcomeModal(appt)}
                  />
                );
              })
        )}

        {activeTab === 'history' && (
          history.length === 0
            ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>📅</Text>
                  <Text style={[styles.emptyTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>{t.noHistory}</Text>
                  <Text style={[styles.emptySubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    {t.noHistorySubtitle ?? 'Past appointments will appear here once their date has passed.'}
                  </Text>
                </View>
              )
            : history.map(appt => (
                <GlassApptCard
                  key={appt.id}
                  appt={appt}
                  accent={accent}
                  isDark={isDark}
                  onEdit={() => openEdit(appt)}
                  onDelete={() => handleDelete(appt)}
                  onToggleChecklist={itemId => handleToggleChecklist(appt, itemId)}
                  onLogOutcome={!appt.missedOutcome ? () => openOutcomeModal(appt) : undefined}
                  onReschedule={() => openEdit(appt)}
                />
              ))
        )}
      </ScrollView>

      {/* Form modal */}
      <FormModal
        visible={modalVisible}
        editing={editing}
        isDark={isDark}
        accent={accent}
        colors={colors}
        onClose={() => { setModalVisible(false); setRebookPrefill(undefined); }}
        onSave={handleSave}
        prefillForm={rebookPrefill}
        allAppointments={appointments}
      />

      {/* Log Outcome modal */}
      <Modal
        visible={outcomeAppt !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setOutcomeAppt(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{
            backgroundColor: isDark ? '#161B22' : '#FFFFFF',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: Math.max(insets.bottom + 16, 32),
          }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#E5E7EB', alignSelf: 'center', marginBottom: 20 }} />

            <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 4 }}>
              Log Outcome
            </Text>
            <Text style={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 20 }}>
              {outcomeAppt?.doctorName || 'Appointment'} · {outcomeAppt ? formatDateOnly(outcomeAppt.dateTime) : ''}
            </Text>

            {/* Outcome chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {([
                { value: 'attended', label: '✓ Attended', color: '#22C55E', darkColor: '#4ADE80' },
                { value: 'missed',   label: '⚠ Missed',   color: '#D97706', darkColor: '#FCD34D' },
                { value: 'cancelled', label: '✕ Cancelled', color: '#6B7280', darkColor: '#9CA3AF' },
                { value: 'rebooked', label: '🔄 Rebooked', color: '#3B82F6', darkColor: '#93C5FD' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => saveOutcome(opt.value)}
                  style={{
                    flex: 1, minWidth: '44%', paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                    backgroundColor: isDark ? hexToRgba(opt.darkColor, 0.14) : hexToRgba(opt.color, 0.10),
                    borderWidth: 1,
                    borderColor: isDark ? hexToRgba(opt.darkColor, 0.40) : hexToRgba(opt.color, 0.30),
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? opt.darkColor : opt.color }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional note */}
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: isDark ? '#6B7280' : '#9CA3AF', marginBottom: 8 }}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={[
                { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 14, marginBottom: 16 },
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB', borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB', color: isDark ? '#F9FAFB' : '#111827' },
              ]}
              value={outcomeNote}
              onChangeText={setOutcomeNote}
              placeholder="e.g. Rescheduled for next month…"
              placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
              returnKeyType="done"
            />

            <TouchableOpacity
              onPress={() => setOutcomeAppt(null)}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 15, color: isDark ? '#6B7280' : '#9CA3AF', fontWeight: '600' }}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reschedule-confirmed toast */}
      {toastMsg !== '' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastContainer,
            {
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              backgroundColor: isDark ? 'rgba(30,40,60,0.96)' : 'rgba(255,255,255,0.97)',
              borderColor: isDark ? 'rgba(96,165,250,0.35)' : 'rgba(59,130,246,0.25)',
            },
          ]}
        >
          <Text style={[styles.toastText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const { isPremium, requirePremium, PremiumGateSheet } = usePremiumGate({ fullScreen: true });
  React.useEffect(() => {
    if (!isPremium) {
      requirePremium(() => {}, { feature: 'Appointments Tracker' })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);
  if (!isPremium) {
    return <>{PremiumGateSheet}</>;
  }
  return <AppointmentsScreenInner />;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Toast
  toastContainer: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 320,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backText: { fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 12, fontWeight: '400', marginTop: 1 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  tab: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: {},
  tabText: { fontSize: 14, fontWeight: '600' },

  // List
  listContent: { padding: 16, gap: 14 },

  // Glass card
  glassShell: {
    borderRadius: RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  glassBody: {
    borderRadius: RADIUS - 1.5,
    overflow: 'hidden',
  },
  specularStreak: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 52,
    borderTopLeftRadius: RADIUS - 1.5, borderTopRightRadius: RADIUS - 1.5,
  },
  rimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, borderTopLeftRadius: RADIUS - 1.5, borderTopRightRadius: RADIUS - 1.5 },
  rimLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 1.5, borderTopLeftRadius: RADIUS - 1.5, borderBottomLeftRadius: RADIUS - 1.5 },
  rimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, borderBottomLeftRadius: RADIUS - 1.5, borderBottomRightRadius: RADIUS - 1.5 },
  rimRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 1.5, borderTopRightRadius: RADIUS - 1.5, borderBottomRightRadius: RADIUS - 1.5 },
  accentGlow: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '40%', borderBottomLeftRadius: RADIUS - 1.5, borderBottomRightRadius: RADIUS - 1.5 },

  // Card content
  cardContent: { padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardHeaderRight: { flexDirection: 'row', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  doctorName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  specialty: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  mapThumb: { width: 38, height: 38, borderRadius: 8, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  mapOpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5 },
  dateText: { fontSize: 13, fontWeight: '500', flex: 1 },
  countdownChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  countdownText: { fontSize: 11, fontWeight: '700' },
  notes: { fontSize: 12, lineHeight: 18, marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },

  // Checklist
  checklistSection: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  checklistTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checklistLabel: { fontSize: 13, flex: 1 },

  // Recurrence badge
  recurrenceBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 6 },
  recurrenceText: { fontSize: 11, fontWeight: '600' },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalCancelBtn: { minWidth: 60 },
  modalCancelText: { fontSize: 16 },
  modalSaveBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18 },
  modalSaveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  modalScroll: { padding: 20, gap: 4 },

  // Form inputs
  input: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    fontSize: 15, fontWeight: '500',
  },
  inputLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  errorText: { fontSize: 12, fontWeight: '500', marginTop: 4 },

  // Specialty picker
  specialtyPicker: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: 4 },
  specialtyOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  specialtyOptionText: { fontSize: 14, fontWeight: '500' },

  // Recurrence chips
  recurrenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recurrenceChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  recurrenceChipText: { fontSize: 13, fontWeight: '600' },

  // Checklist form
  checklistInputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  addItemBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  addItemBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  checklistFormItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  checklistFormLabel: { fontSize: 14, flex: 1 },

  // Chips
  chipBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },

  // Card action buttons (Reschedule / Log outcome on missed/history cards)
  cardActionBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardActionBtnText: { fontSize: 13, fontWeight: '700' },
});
