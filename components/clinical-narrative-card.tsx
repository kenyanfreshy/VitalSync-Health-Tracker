/**
 * ClinicalNarrativeCard
 *
 * Replaces the old ConditionTimelineCard with a rich "Personal Narrative"
 * dashboard card that shows the Golden Trio (INPUTS / OBSERVATIONS / INSIGHTS),
 * physiological correlation markers (Meal IQ), postprandial peak reminders,
 * and colour-coded clinical urgency with a pulsing animation for Stage 2 / Crisis.
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import * as Haptics from 'expo-haptics';
import { useColors, useDashboardStrings } from '@/hooks';
import { GlassCard } from '@/components/glass-card';
import { SectionTabBar } from '@/components/section-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  buildClinicalNarrative,
  urgencyColor,
  bpUrgency,
  type ClinicalEvent,
  type GoldenTrioCategory,
  type UrgencyLevel,
  type CorrelationEvent,
  type MealIQEvent,
  type MedicationEvent,
  type LabEvent,
  type AppointmentEvent,
} from '@/lib/health/clinical-narrative';
import { loadCorrelationWindowHours } from '@/lib/notifications/threshold-config';
import type { HealthData } from '@/lib/health/types';
import { fetchEKGFirstPage, lastAfibRecord, type EKGRecord } from '@/lib/health/ekg-store';

// ─── Constants ────────────────────────────────────────────────────────────────

// CATEGORY_META labels are resolved at render time using ds keys (narrativeCategoryInputs, etc.)
const CATEGORY_META_COLORS: Record<GoldenTrioCategory, { color: string; icon: string; label: string }> = {
  INPUTS:       { color: '#3B82F6', icon: '🍽️', label: 'Inputs' },
  OBSERVATIONS: { color: '#10B981', icon: '📊', label: 'Observations' },
  INSIGHTS:     { color: '#8B5CF6', icon: '🧠', label: 'Insights' },
};

type FilterTab = 'ALL' | GoldenTrioCategory;
const _TABS: FilterTab[] = ['ALL', 'INPUTS', 'OBSERVATIONS', 'INSIGHTS'];

type DateRange = '1h' | '6h' | 'today' | '7d' | '30d';
// DATE_RANGE_OPTIONS labels are resolved at render time using ds keys
const DATE_RANGE_VALUES: DateRange[] = ['1h', '6h', 'today', '7d', '30d'];
const NARRATIVE_DATE_RANGE_KEY = '@vsht:narrative_date_range';
const NARRATIVE_EXPANDED_KEY = 'clinical-narrative-expanded';
/** AsyncStorage key for the auto-range window preference (in ms). */
export const NARRATIVE_AUTO_RANGE_WINDOW_KEY = '@vsht:narrative_auto_range_window_ms';
/** Sentinel value meaning the auto-select feature is disabled. */
export const AUTO_RANGE_OFF = 0;

function dateRangeCutoff(range: DateRange): number {
  const now = Date.now();
  if (range === '1h')   return now - 1 * 3_600_000;
  if (range === '6h')   return now - 6 * 3_600_000;
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === '7d')  return now - 7  * 86_400_000;
  if (range === '30d') return now - 30 * 86_400_000;
  return 0;
}

// ─── Live Refresh Dot (short time ranges) ────────────────────────────────────

/** Small pulsing green dot shown on "Last 1 hr" and "Last 6 hrs" chips to signal time-sensitive data. */
function LiveDot({ active }: { active: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, opacity]);
  if (!active) return null;
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
        marginRight: 4,
        opacity,
      }}
    />
  );
}

// ─── Pulsing Dot ──────────────────────────────────────────────────────────────

function PulsingDot({ color, pulse }: { color: string; pulse: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.6, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, scale, opacity]);

  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      {pulse && (
        <Animated.View
          style={{
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: color,
            transform: [{ scale }],
            opacity,
          }}
        />
      )}
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

// ─── Tag Chip ─────────────────────────────────────────────────────────────────

function TagChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[tagStyles.chip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <Text style={[tagStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    marginRight: 4,
    marginTop: 3,
  },
  text: { fontSize: 10, fontWeight: '600' },
});

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({
  event,
  isLast,
  onPress,
  colors,
}: {
  event: ClinicalEvent;
  isLast: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const ds = useDashboardStrings();
  const urgColor = urgencyColor(event.urgency);
  const pulse = event.urgency === 'stage2' || event.urgency === 'crisis';
  const catMeta = CATEGORY_META_COLORS[event.category] ?? CATEGORY_META_COLORS.OBSERVATIONS;

  // Kind-specific icon emoji
  const kindIcon: Record<string, string> = {
    meal: '🍽️',
    activity: '🏃',
    vitals: '❤️',
    glucose: '🩸',
    meal_iq: '🧠',
    postprandial_reminder: '⏰',
    correlation: '🔗',
    medication: '💊',
    lab: '🧪',
    appointment: '🏥',
  };

  const timeStr = (() => {
    const d = new Date(event.timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  })();

  const dateStr = (() => {
    const d = new Date(event.timestamp);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  return (
    <Pressable
      style={({ pressed }) => [
        rowStyles.row,
        !isLast && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
        pressed && { opacity: 0.75 },
        event.isCorrelated && { backgroundColor: '#8B5CF6' + '08' },
      ]}
      onPress={onPress}
    >
      {/* Timeline spine */}
      <View style={rowStyles.spine}>
        <PulsingDot color={urgColor} pulse={pulse} />
        {!isLast && <View style={[rowStyles.line, { backgroundColor: colors.border }]} />}
      </View>

      {/* Content */}
      <View style={rowStyles.content}>
        {/* Category + time header */}
        <View style={rowStyles.header}>
          <View style={[rowStyles.catChip, { backgroundColor: catMeta.color + '18' }]}>
            <Text style={[rowStyles.catText, { color: catMeta.color }]}>
              {(catMeta?.label ?? event.category).toUpperCase()}
            </Text>
          </View>
          <Text style={[rowStyles.timeText, { color: colors.muted }]}>
            {dateStr} {timeStr}
          </Text>
        </View>

        {/* Title row */}
        <View style={rowStyles.titleRow}>
          <Text style={rowStyles.kindIcon}>{kindIcon[event.kind] ?? '📌'}</Text>
          <Text style={[rowStyles.title, { color: colors.foreground }]} numberOfLines={1}>
            {String(event.title ?? '')}
          </Text>
          {event.isCorrelated && (
            <View style={rowStyles.corrBadge}>
              <Text style={rowStyles.corrBadgeText}>🔗</Text>
            </View>
          )}
        </View>

        {/* Subtitle */}
        {event.subtitle ? (
          <Text style={[rowStyles.subtitle, { color: colors.muted }]} numberOfLines={2}>
            {event.subtitle}
          </Text>
        ) : null}

        {/* Tags */}
        {event.tags.length > 0 && (
          <View style={rowStyles.tagsRow}>
            {event.tags.slice(0, 4).map(tag => (
              <TagChip key={tag} label={tag} color={urgColor} />
            ))}
          </View>
        )}

        {/* Postprandial reminder CTA */}
        {event.kind === 'postprandial_reminder' && (
          <Pressable
            style={[rowStyles.ctaBtn, { backgroundColor: '#8B5CF6' + '18', borderColor: '#8B5CF6' + '44' }]}
            onPress={() => Alert.alert(
              (ds as any).narrativePostprandialTitle ?? 'Postprandial Check',
              `It's been ${(event as any).hoursAfterMeal}h since "${(event as any).mealLabel}". Time to check your postprandial glucose.`,
              [{ text: 'OK' }],
            )}
          >
            <Text style={[rowStyles.ctaText, { color: '#8B5CF6' }]}>
              {(ds as any).narrativePostprandialTime ?? '⏰ Time to check your Postprandial Glucose'}
            </Text>
          </Pressable>
        )}

        {/* Meal IQ insight text */}
        {event.kind === 'meal_iq' && (
          <Text style={[rowStyles.insightText, { color: colors.muted }]} numberOfLines={3}>
            {(event as any).insight}
          </Text>
        )}

        {/* Correlation detail */}
        {event.kind === 'correlation' && event.subtitle ? (
          <Text style={[rowStyles.insightText, { color: '#8B5CF6' }]} numberOfLines={2}>
            {String(event.subtitle)}
          </Text>
        ) : null}

        {/* Medication CTA */}
        {event.kind === 'medication' && (
          <Pressable
            style={[rowStyles.ctaBtn, { backgroundColor: '#3B82F6' + '18', borderColor: '#3B82F6' + '44' }]}
            onPress={onPress}
          >
            <Text style={[rowStyles.ctaText, { color: '#3B82F6' }]}>
              {(event as MedicationEvent).doseStatus === 'missed' ? ((ds as any).narrativeViewMedHistoryMissed ?? '⚠️ View Medication History →') : ((ds as any).narrativeViewMedHistory ?? '💊 View Medication History →')}
            </Text>
          </Pressable>
        )}

        {/* Lab CTA */}
        {event.kind === 'lab' && (
          <Pressable
            style={[rowStyles.ctaBtn, { backgroundColor: '#10B981' + '18', borderColor: '#10B981' + '44' }]}
            onPress={onPress}
          >
            <Text style={[rowStyles.ctaText, { color: '#10B981' }]}>
              {(ds as any).narrativeOpenLabResults ?? '🧪 Open Lab Results →'}
            </Text>
          </Pressable>
        )}

        {/* Appointment CTA */}
        {event.kind === 'appointment' && (
          <Pressable
            style={[rowStyles.ctaBtn, { backgroundColor: '#F59E0B' + '18', borderColor: '#F59E0B' + '44' }]}
            onPress={onPress}
          >
            <Text style={[rowStyles.ctaText, { color: (event as AppointmentEvent).appointmentStatus === 'missed' ? '#D97706' : '#0891B2' }]}>
              {(event as AppointmentEvent).appointmentStatus === 'missed' ? ((ds as any).narrativeViewMissedAppts ?? '⚠️ View Missed Appointments →') : ((ds as any).narrativeViewUpcomingAppts ?? '🏥 View Upcoming Appointments →')}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16 },
  spine: { width: 20, alignItems: 'center', marginRight: 12, paddingTop: 2 },
  line: { width: 1.5, flex: 1, marginTop: 6 },
  content: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  catChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  catText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  timeText: { fontSize: 11 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  kindIcon: { fontSize: 14, marginRight: 6 },
  title: { fontSize: 14, fontWeight: '600', flex: 1 },
  corrBadge: {
    marginLeft: 6,
    backgroundColor: '#8B5CF6' + '18',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  corrBadgeText: { fontSize: 11 },
  subtitle: { fontSize: 12, lineHeight: 17, marginBottom: 2 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  ctaBtn: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  ctaText: { fontSize: 12, fontWeight: '600' },
  insightText: { fontSize: 12, lineHeight: 17, marginTop: 4, fontStyle: 'italic' },
});

// ─── Vital Signs Summary Panel ───────────────────────────────────────────────

interface VitalSignsSummaryPanelProps {
  data: HealthData;
  colors: ReturnType<typeof useColors>;
}

function VitalSignsSummaryPanel({ data, colors }: VitalSignsSummaryPanelProps) {
  const ds = useDashboardStrings();
  const isDark = colors.background === '#151718' || (colors.background as string).startsWith('#0') || (colors.background as string).startsWith('#1');

  // Grab the most recent VitalSignsRecord
  const latest = useMemo(() => {
    const records = [...(data.vitalSigns ?? [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return records[0] ?? null;
  }, [data.vitalSigns]);

  if (!latest) {
    return (
      <GlassCard
        accentColor="#EF4444"
        style={{ marginHorizontal: 16, marginBottom: 12, alignItems: 'center' }}
      >
        <Text style={{ fontSize: 12, color: colors.muted }}>{(ds as any).narrativeNoVitalSigns ?? 'No vital signs logged yet — tap Vital Signs to add a reading.'}</Text>
      </GlassCard>
    );
  }

  // Urgency for BP
  const bpUrg = (latest.systolic && latest.diastolic)
    ? bpUrgency(latest.systolic, latest.diastolic)
    : 'normal';
  const bpColor = urgencyColor(bpUrg);

  // SpO₂ urgency
  const spo2Val = latest.oxygenSaturation ?? latest.spo2;
  const spo2Color = spo2Val != null
    ? (spo2Val < 90 ? '#7C3AED' : spo2Val < 94 ? '#EF4444' : spo2Val < 96 ? '#F59E0B' : '#22C55E')
    : colors.muted;

  // HR urgency
  const hrColor = latest.heartRate != null
    ? (latest.heartRate > 120 || latest.heartRate < 40 ? '#EF4444'
      : latest.heartRate > 100 || latest.heartRate < 50 ? '#F59E0B'
      : '#22C55E')
    : colors.muted;

  // Temperature urgency (°F)
  const tempColor = latest.temperature != null
    ? (latest.temperature >= 103 ? '#7C3AED'
      : latest.temperature >= 100.4 ? '#EF4444'
      : latest.temperature < 96 ? '#F59E0B'
      : '#22C55E')
    : colors.muted;

  // Respiratory rate urgency
  const rrColor = latest.respiratoryRate != null
    ? (latest.respiratoryRate > 25 || latest.respiratoryRate < 8 ? '#EF4444'
      : latest.respiratoryRate > 20 ? '#F59E0B'
      : '#22C55E')
    : colors.muted;

  const timeStr = (() => {
    const d = new Date(latest.timestamp);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  const _panelBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';

  const metrics: { label: string; value: string | null; unit: string; color: string; icon: string }[] = [
    {
      label: 'Blood Pressure',
      value: (latest.systolic && latest.diastolic) ? `${latest.systolic}/${latest.diastolic}` : null,
      unit: 'mmHg',
      color: bpColor,
      icon: '🫀',
    },
    {
      label: 'Heart Rate',
      value: latest.heartRate != null ? String(latest.heartRate) : null,
      unit: 'bpm',
      color: hrColor,
      icon: '💓',
    },
    {
      label: 'SpO₂',
      value: spo2Val != null ? String(spo2Val) : null,
      unit: '%',
      color: spo2Color,
      icon: '🫁',
    },
    {
      label: 'Temperature',
      value: latest.temperature != null ? latest.temperature.toFixed(1) : null,
      unit: '°F',
      color: tempColor,
      icon: '🌡️',
    },
    {
      label: 'Resp. Rate',
      value: latest.respiratoryRate != null ? String(Math.round(latest.respiratoryRate)) : null,
      unit: 'br/min',
      color: rrColor,
      icon: '🌬️',
    },
  ];

  // Only show metrics that have a value
  const activeMetrics = metrics.filter(m => m.value !== null);

  return (
    <GlassCard
      accentColor={bpColor}
      noPadding
      style={{ marginHorizontal: 16, marginBottom: 12 }}
    >
      {/* Panel header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 }}>{(ds as any).narrativeLatestVitalSigns ?? '❤️ Latest Vital Signs'}</Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>{timeStr}</Text>
      </View>

      {activeMetrics.length === 0 ? (
        <View style={{ padding: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>No measurements in this record.</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6 }}>
          {activeMetrics.map(m => (
            <View
              key={m.label}
              style={{
                flex: 1,
                minWidth: 90,
                backgroundColor: m.color + '14',
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: m.color + '44',
                padding: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, marginBottom: 2 }}>{m.icon}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: m.color, letterSpacing: -0.3 }}>
                {m.value}
              </Text>
              <Text style={{ fontSize: 10, color: m.color + 'CC', fontWeight: '600', marginTop: 1 }}>{m.unit}</Text>
              <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Urgency footer if elevated */}
      {bpUrg !== 'normal' && latest.systolic && latest.diastolic && (
        <View style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderTopWidth: 0.5,
          borderTopColor: bpColor + '44',
          backgroundColor: bpColor + '10',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: bpColor }} />
          <Text style={{ fontSize: 11, color: bpColor, fontWeight: '600', flex: 1 }}>
            {bpUrg === 'crisis' ? 'Hypertensive Crisis — seek emergency care immediately'
              : bpUrg === 'stage2' ? 'Hypertension Stage 2 — consult your care team'
              : 'Elevated BP — lifestyle review recommended'}
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ClinicalNarrativeCardProps {
  data: HealthData;
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
  /** When set, overrides the persisted date range for this visit (e.g. '1h' after a fresh vital log). */
  defaultRange?: DateRange;
}

export function ClinicalNarrativeCard({ data, defaultExpanded = false, overrideExpanded, defaultRange }: ClinicalNarrativeCardProps) {
  const colors = useColors();
  const ds = useDashboardStrings();
  const router = useRouter();
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = overrideExpanded === false ? false : localExpanded;
  // Load persisted expanded state on mount
  useEffect(() => {
    AsyncStorage.getItem(NARRATIVE_EXPANDED_KEY).then(v => {
      if (v !== null) setLocalExpanded(v === 'true');
    }).catch(() => {});
  }, []);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [corrWindow, setCorrWindow] = useState(4);
  /** True while the date range was set by the fresh-log auto-select (not by the user). */
  const [wasAutoSelected, setWasAutoSelected] = useState(false);

  // Load persisted date range and correlation window whenever card is visible.
  // If a defaultRange is provided (e.g. after a fresh vital log), it takes priority over the persisted value.
  useFocusEffect(useCallback(() => {
    if (defaultRange) {
      setDateRange(defaultRange);
      setWasAutoSelected(true);
    } else {
      setWasAutoSelected(false);
      AsyncStorage.getItem(NARRATIVE_DATE_RANGE_KEY).then(v => {
        if (v === '1h' || v === '6h' || v === 'today' || v === '7d' || v === '30d') setDateRange(v as DateRange);
      });
    }
    loadCorrelationWindowHours().then(setCorrWindow);
  }, [defaultRange]));

  const allEvents = useMemo(
    () => buildClinicalNarrative(data, corrWindow),
    [data, corrWindow],
  );

  const filteredEvents = useMemo(() => {
    const cutoff = dateRangeCutoff(dateRange);
    const byDate = allEvents.filter(e => new Date(e.timestamp).getTime() >= cutoff);
    if (activeTab === 'ALL') return byDate;
    return byDate.filter(e => e.category === activeTab);
  }, [allEvents, activeTab, dateRange]);

  const handleDateRange = (r: DateRange) => {
    setWasAutoSelected(false);
    setDateRange(r);
    safeSetItem(NARRATIVE_DATE_RANGE_KEY, r);
  };

  /** Clears the auto-select override and restores the user's persisted preference. */
  const clearAutoSelect = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWasAutoSelected(false);
    AsyncStorage.getItem(NARRATIVE_DATE_RANGE_KEY).then(v => {
      const persisted = (v === '1h' || v === '6h' || v === 'today' || v === '7d' || v === '30d') ? v as DateRange : '7d';
      setDateRange(persisted);
    }).catch(() => setDateRange('7d'));
  }, []);

  // ── EKG summary state ────────────────────────────────────────────────────────
  const [ekgRecords, setEkgRecords] = useState<EKGRecord[]>([]);
  useFocusEffect(useCallback(() => {
    fetchEKGFirstPage().then(r => setEkgRecords(r.records)).catch(() => {});
  }, []));

  const ekgSummaryLine = useMemo(() => {
    if (ekgRecords.length === 0) return null;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recent = ekgRecords.filter(r => new Date(r.startDate).getTime() >= thirtyDaysAgo);
    const afibCount = recent.filter(r => r.classification === 'AtrialFibrillation').length;
    const lastAfib = lastAfibRecord(recent);
    if (afibCount === 0) {
      return `EKG: ${recent.length} recording${recent.length !== 1 ? 's' : ''} in 30 days — no Atrial Fibrillation recordings`;
    }
    const lastAfibDate = lastAfib
      ? new Date(lastAfib.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;
    return `EKG: ${afibCount} Atrial Fibrillation recording${afibCount !== 1 ? 's' : ''} in 30 days${lastAfibDate ? `, last ${lastAfibDate}` : ''}`;
  }, [ekgRecords]);

  // Summary counts
  const inputCount = allEvents.filter(e => e.category === 'INPUTS').length;
  const obsCount   = allEvents.filter(e => e.category === 'OBSERVATIONS').length;
  const insCount   = allEvents.filter(e => e.category === 'INSIGHTS').length;
  const urgentCount = allEvents.filter(e => e.urgency === 'stage2' || e.urgency === 'crisis').length;

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalExpanded(e => {
      const next = !e;
      safeSetItem(NARRATIVE_EXPANDED_KEY, String(next)).catch(() => {});
      return next;
    });
  };

  const navigateForEvent = (event: ClinicalEvent) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (event.kind) {
      case 'meal': router.push('/log/nutrition' as never); break;
      case 'activity': router.push('/log/activity' as never); break;
      case 'vitals': router.push('/log/vitals' as never); break;
      case 'glucose': router.push('/log/blood-sugar' as never); break;
      case 'meal_iq': {
        const e = event as MealIQEvent;
        router.push({
          pathname: '/insights/meal-iq-detail',
          params: {
            mealLabel: e.mealLabel,
            insight: e.insight,
            bpImpact: e.bpImpact,
            glucoseImpact: e.glucoseImpact,
            impactScore: String(e.impactScore ?? 0),
            correlationType: 'meal_iq',
          },
        } as never);
        break;
      }
      case 'correlation': {
        const e = event as CorrelationEvent;
        router.push({
          pathname: '/insights/meal-iq-detail',
          params: {
            mealLabel: e.subtitle,
            insight: e.subtitle,
            bpImpact: e.correlationType === 'high_sodium_hypertension' ? 'Elevated' : 'Normal',
            glucoseImpact: e.correlationType === 'meal_glucose_spike' ? 'Spike detected' : 'Normal',
            impactScore: e.urgency === 'stage2' ? '70' : '40',
            correlationType: e.correlationType,
            deltaMinutes: String(e.deltaMinutes),
          },
        } as never);
        break;
      }
      case 'postprandial_reminder': router.push('/log/blood-sugar' as never); break;
      case 'medication': {
        const _e = event as MedicationEvent;
        router.push({ pathname: '/medications', params: { filter: 'history' } } as never);
        break;
      }
      case 'lab': {
        const e = event as LabEvent;
        router.push({ pathname: '/labs', params: { highlightId: e.labResultId } } as never);
        break;
      }
      case 'appointment': {
        const e = event as AppointmentEvent;
        router.push({
          pathname: '/log/appointments',
          params: { tab: e.appointmentStatus === 'missed' ? 'missed' : 'upcoming' },
        } as never);
        break;
      }
    }
  };

  const s = styles(colors);

  return (
    <>
    <GlassCard accentColor="#8B5CF6" noPadding style={s.card}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [s.header, { opacity: pressed ? 0.8 : 1 }]}
        onPress={handlePress}
      >
        <View style={[s.iconWrap, { backgroundColor: '#8B5CF6' + '22' }]}>
          <Text style={{ fontSize: 18 }}>🧠</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.foreground }]}>{ds.personalNarrative}</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>
            {inputCount} {(ds as any).narrativeCategoryInputs?.toLowerCase() ?? 'inputs'} · {obsCount} {(ds as any).narrativeCategoryObservations?.toLowerCase() ?? 'observations'} · {insCount} {(ds as any).narrativeCategoryInsights?.toLowerCase() ?? 'insights'}
          </Text>
        </View>
        <View style={s.headerRight}>
          {urgentCount > 0 && (
            <View style={[s.badge, { backgroundColor: '#EF4444' + '22' }]}>
              <Text style={[s.badgeText, { color: '#EF4444' }]}>{urgentCount}</Text>
            </View>
          )}
          <IconSymbol
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={16}
            color={colors.muted}
          />
        </View>
      </Pressable>

      {expanded && (
        <>
          {/* ── Vital Signs Summary Panel ───────────────────────────────────────────────────────────────────────── */}
          <VitalSignsSummaryPanel data={data} colors={colors} />

          {ekgSummaryLine != null && (
            <GlassCard
              accentColor={ekgSummaryLine.includes('Atrial Fibrillation') ? '#EF4444' : '#22C55E'}
              style={{ marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ fontSize: 14 }}>&#129719;</Text>
              <Text
                style={{ fontSize: 12, color: colors.foreground, flex: 1, lineHeight: 17 }}
                numberOfLines={2}
              >
                {ekgSummaryLine}
              </Text>
              <Pressable
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                onPress={() => router.push('/detail/ekg' as never)}
              >
                <Text style={{ fontSize: 11, color: ekgSummaryLine.includes('Atrial Fibrillation') ? '#EF4444' : '#22C55E', fontWeight: '700' }}>View ›</Text>
              </Pressable>
            </GlassCard>
          )}

          {/* ── Date Range Picker ──────────────── */}
          <View style={s.dateRangeRow}>
            {DATE_RANGE_VALUES.map(val => {
              const opt = {
                value: val,
                label: val === '1h' ? ((ds as any).narrativeLast1hr ?? 'Last 1 hr')
                     : val === '6h' ? ((ds as any).narrativeLast6hrs ?? 'Last 6 hrs')
                     : val === 'today' ? (ds.todayLabel ?? 'Today')
                     : val,
              };
              const isActive = opt.value === dateRange;
              const isAutoChip = isActive && wasAutoSelected && opt.value === defaultRange;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.dateChip,
                    isActive && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
                    !isActive && { borderColor: colors.border },
                    isAutoChip && { borderColor: '#10B981', backgroundColor: '#10B981' },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => handleDateRange(opt.value)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <LiveDot active={(opt.value === '1h' || opt.value === '6h') && isActive} />
                    <Text style={[s.dateChipText, { color: isActive ? '#fff' : colors.muted }]}>
                      {opt.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {wasAutoSelected && (
              <Pressable
                style={({ pressed }) => ({
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#10B981',
                  backgroundColor: '#10B98118',
                  opacity: pressed ? 0.7 : 1,
                })}
                onPress={clearAutoSelect}
                accessibilityLabel="Clear auto-selected time range and restore your saved preference"
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#10B981' }}>✕ Clear</Text>
              </Pressable>
            )}
            <Text style={[s.windowHint, { color: colors.muted }]}>
              {(ds as any).narrativeCorrWindow ?? 'Corr.'} {corrWindow}h
            </Text>
          </View>

          {/* ── Filter Tabs — matches Records nutrition tab style ─────────── */}
          <SectionTabBar
            tabs={[
              { key: 'ALL',          label: ds.allLabel ?? 'All',          icon: '📋' },
              { key: 'INPUTS',       label: (ds as any).narrativeCategoryInputs ?? 'Inputs',       icon: CATEGORY_META_COLORS.INPUTS.icon },
              { key: 'OBSERVATIONS', label: (ds as any).narrativeCategoryObservations ?? 'Observations', icon: CATEGORY_META_COLORS.OBSERVATIONS.icon },
              { key: 'INSIGHTS',     label: (ds as any).narrativeCategoryInsights ?? ds.insights, icon: CATEGORY_META_COLORS.INSIGHTS.icon },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            accentColor={
              activeTab === 'ALL' ? colors.primary : CATEGORY_META_COLORS[activeTab as GoldenTrioCategory].color
            }
          />

          {/* ── Event List ────────────────────────────────────────────────── */}
          {filteredEvents.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>🩺</Text>
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{(ds as any).narrativeNoEvents ?? 'No events yet'}</Text>
              <Text style={[s.emptyBody, { color: colors.muted }]}>
                {(ds as any).narrativeNoEventsBody ?? 'Log meals, vitals, or activity to build your Personal Narrative.'}
              </Text>
            </View>
          ) : (
            <View>
              {filteredEvents.slice(0, 20).map((event, idx) => (
                <EventRow
                  key={event.id}
                  event={event}
                  isLast={idx === Math.min(filteredEvents.length, 20) - 1}
                  onPress={() => navigateForEvent(event)}
                  colors={colors}
                />
              ))}
              {filteredEvents.length > 20 && (
                <View style={[s.moreRow, { borderTopColor: colors.border }]}>
                  <Text style={[s.moreText, { color: colors.muted }]}>
                    +{filteredEvents.length - 20} {(ds as any).narrativeMoreEvents ?? 'more events — log screens show full history'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </GlassCard>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(_colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: {
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 16, fontWeight: '700' },
    subtitle: { fontSize: 12, marginTop: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    badgeText: { fontSize: 12, fontWeight: '700' },
    tabsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
    },
    tabText: { fontSize: 12, fontWeight: '600' },
    empty: {
      alignItems: 'center',
      paddingVertical: 32,
      paddingHorizontal: 24,
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
    emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
    moreRow: {
      borderTopWidth: 0.5,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    moreText: { fontSize: 12, textAlign: 'center' },
    dateRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 8,
    },
    dateChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
    },
    dateChipText: { fontSize: 12, fontWeight: '600' as const },
    windowHint: { fontSize: 11, marginLeft: 4 },
  });
}
