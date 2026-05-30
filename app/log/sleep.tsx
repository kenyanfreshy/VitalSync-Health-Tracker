/**
 * Sleep Log Screen
 * Manual entry for bedtime, wake time, sleep quality, and optional stage estimates.
 * Uses native iOS wheel time picker (DateTimePicker) on iOS; falls back to HH:MM
 * text input on Android and web.
 */

import { safeFormatTime } from '@/lib/utils';
import React, { useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang, useRTL } from '@/hooks';
import { logStrings } from '@/lib/i18n';
import type { SleepRecord } from '@/lib/health/types';
import { NeoSleepWeeklyChart } from '@/components/neo-sleep-3d-chart';
import { inferChronotype, formatHour } from '@/components/neo-sleep-weekly-chart';
import { useSleepGoal } from '@/hooks/use-sleep-goal';
import { SleepInsightsCard } from '@/components/sleep-insights-card';
// TimePickerDrum and KeyboardDictationBanner replaced with TextInput for dictation compatibility
import { trpc } from '@/lib/trpc';
import { MicrophoneIcon } from '@/components/ui/microphone-icon';
import { DatePickerIconButton } from '@/components/date-time-picker-field';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return `sleep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
/** Format an ISO timestamp for display */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/** Format total minutes as "Xh Ym" */
function formatDuration(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format a Date as "h:MM" in 12-hour format (no AM/PM — shown separately as badge) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatTime(date: Date): string {
  // Always show 12-hour numeric time without AM/PM suffix — badge handles the period
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(/\s?(AM|PM|am|pm)$/i, '').trim();
}

/** Return 'AM' or 'PM' for a given Date */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAmPm(date: Date): string {
  return date.getHours() < 12 ? 'AM' : 'PM';
}

/** Build a Date from today's date + HH:MM string */
function buildDateFromHHMM(timeStr: string, baseDate?: Date): Date {
  const base = baseDate ?? new Date();
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = parseInt(mStr ?? '0', 10);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Clamp a number between min and max */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── Quality selector ─────────────────────────────────────────────────────────

function getQualityOptions(t: { sleepExcellent?: string; sleepGood?: string; sleepFair?: string; sleepPoor?: string; sleepBad?: string }) {
  return [
    { value: 5, emoji: '😴', label: t.sleepExcellent ?? 'Excellent', color: '#22C55E' },
    { value: 4, emoji: '😊', label: t.sleepGood      ?? 'Good',      color: '#84CC16' },
    { value: 3, emoji: '😐', label: t.sleepFair      ?? 'Fair',      color: '#F59E0B' },
    { value: 2, emoji: '😔', label: t.sleepPoor      ?? 'Poor',      color: '#F97316' },
    { value: 1, emoji: '😣', label: t.sleepBad       ?? 'Bad',       color: '#EF4444' },
  ] as const;
}

// ─── Sleep record card ────────────────────────────────────────────────────────

function SleepCard({
  record,
  onDelete,
  colors,
  t,
  goalHrs,
  isBestNight = false,
}: {
  record: SleepRecord;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof useColors>;
  t: typeof logStrings['en'];
  goalHrs: number;
  isBestNight?: boolean;
}) {
  const isDark = colors.background === '#151718';
  const actualHrs = record.totalMinutes / 60;
  const goalRatio = actualHrs / goalHrs;
  const hrsColor = goalRatio >= 0.9 ? '#22C55E' : goalRatio >= 0.7 ? '#F59E0B' : '#EF4444';
  const hrsLabel = `${Math.floor(actualHrs)}h ${record.totalMinutes % 60}m`;

  // 3D glass colours
  const glassBg = isDark ? 'rgba(30, 41, 59, 0.72)' : 'rgba(240, 244, 255, 0.80)';
  const glassBorder = isBestNight ? '#F59E0B' : (isDark ? 'rgba(99,102,241,0.28)' : 'rgba(99,102,241,0.20)');
  const shimmer = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.55)';

  return (
    <View style={[styles.card, {
      backgroundColor: glassBg,
      borderColor: glassBorder,
      borderWidth: isBestNight ? 2 : 1,
      paddingVertical: 10,
      shadowColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(99,102,241,0.12)',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 4,
    }]}>
      {/* Top shimmer highlight */}
      <View style={[styles.cardShimmer, { backgroundColor: shimmer }]} />
      {/* Best Night banner */}
      {isBestNight && (
        <View style={styles.bestNightBanner}>
          <Text style={styles.bestNightText}>{t.bestNightThisWeek ?? '🏆 Best Night This Week'}</Text>
        </View>
      )}

      {/* Single row: date · bedtime → wake · hours */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardDate, { color: colors.muted }]}>
            {formatDateTime(record.bedtime)}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
            {safeFormatTime(record.bedtime, 'en-US', { hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {safeFormatTime(record.wakeTime, 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {!!record.note && (
            <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic', marginTop: 3 }} numberOfLines={1}>
              📝 {record.note}
            </Text>
          )}
        </View>

        {/* Hours slept — prominent right side */}
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: hrsColor, letterSpacing: -0.5 }}>
            {hrsLabel}
          </Text>
          {record.efficiency > 0 && (
            <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '600' }}>
              {record.efficiency}% eff.
            </Text>
          )}
        </View>

        {/* Delete */}
        <Pressable
          style={({ pressed }) => [{ marginLeft: 10, opacity: pressed ? 0.6 : 1, padding: 4 }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert(
              (t as any).deleteEntry,
              (t as any).deleteSleepMsg,
              [
                { text: (t as any).cancel, style: 'cancel' },
                { text: (t as any).delete, style: 'destructive', onPress: () => onDelete(record.id) },
              ]
            );
          }}
        >
          <IconSymbol name="trash" size={16} color={colors.error} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Time picker field ──────────────────────────────────────────────
// Plain text input for HH:MM — dictation-compatible on all platforms.
function TimePickerField({
  label,
  value,
  onChange,
  colors,
  badge,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
  badge?: React.ReactNode;
}) {
  const timeStr = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={styles.timeField}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
        {badge ?? null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={[{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 22,
            fontWeight: '600' as const,
            color: colors.foreground,
            textAlign: 'center',
            letterSpacing: 2,
            minWidth: 90,
          }]}
          value={timeStr}
          onChangeText={t => {
            // Accept HH:MM or natural language like '10pm', '10:30 PM'
            const lower = t.trim().toLowerCase();
            const pmMatch = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*pm$/);
            const amMatch = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*am$/);
            if (pmMatch) {
              let h = parseInt(pmMatch[1], 10);
              const m = pmMatch[2] ? parseInt(pmMatch[2], 10) : 0;
              if (h < 12) h += 12;
              onChange(buildDateFromHHMM(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`));
              return;
            }
            if (amMatch) {
              let h = parseInt(amMatch[1], 10);
              const m = amMatch[2] ? parseInt(amMatch[2], 10) : 0;
              if (h === 12) h = 0;
              onChange(buildDateFromHHMM(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`));
              return;
            }
            // Standard HH:MM
            if (/^\d{1,2}:\d{2}$/.test(t.trim())) {
              onChange(buildDateFromHHMM(t.trim()));
              return;
            }
            // Partial input — keep as-is until valid
          }}
          placeholder="HH:MM"
          placeholderTextColor={colors.muted}
          keyboardType="default"
          returnKeyType="done"
          maxLength={8}
        />
        <DatePickerIconButton
          mode="time"
          value={value}
          onChange={onChange}
        />
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SleepLogScreen() {
  const colors = useColors();
  const lang   = useLang();
  const isRTL = useRTL();
  const t = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en) as unknown as typeof logStrings['en'];
  const router = useRouter();
  const { state, addSleep, deleteSleep } = useHealth();
  const { goal: sleepGoalHrs } = useSleepGoal();
  const isDark = colors.background === '#151718';

  // Form state — use Date objects for the native picker
  const [bedtimeDate, setBedtimeDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(22, 0, 0, 0);
    return d;
  });
  const [wakeTimeDate, setWakeTimeDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(6, 30, 0, 0);
    return d;
  });
  const [quality, setQuality]   = useState<number>(4);
  const [deepMins, setDeepMins]   = useState('');
  const [remMins, setRemMins]     = useState('');
  const [coreMins, setCoreMins]   = useState('');
  const [awakeMins, setAwakeMins] = useState('');
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);

  /** Fill form fields from parsed sleep transcript */

  /** Derived total minutes and efficiency */
  const derived = useMemo(() => {
    try {
      let bed  = new Date(bedtimeDate);
      let wake = new Date(wakeTimeDate);
      // If wake is before or equal to bedtime, assume next day
      if (wake <= bed) wake = new Date(wake.getTime() + 24 * 60 * 60 * 1000);
      const total = Math.round((wake.getTime() - bed.getTime()) / 60000);
      if (total <= 0 || total > 1440) return null;

      const deep  = clamp(parseInt(deepMins  || '0', 10), 0, total);
      const rem   = clamp(parseInt(remMins   || '0', 10), 0, total - deep);
      // If user entered awake/core manually, use those; otherwise estimate
      const awakeRaw = parseInt(awakeMins || '-1', 10);
      const coreRaw  = parseInt(coreMins  || '-1', 10);
      const awake = awakeRaw >= 0
        ? clamp(awakeRaw, 0, total - deep - rem)
        : Math.round(total * (1 - quality / 5) * 0.1);
      const core  = coreRaw >= 0
        ? clamp(coreRaw, 0, total - deep - rem - awake)
        : Math.max(0, total - deep - rem - awake);
      const light = Math.max(0, total - deep - rem - awake - core);
      const eff   = Math.round(((total - awake) / total) * 100);

      return { total, deep, rem, light, awake, core, eff, bed, wake };
    } catch (_unused) {
      return null;
    }
    }, [bedtimeDate, wakeTimeDate, quality, deepMins, remMins, coreMins, awakeMins]);

  const records = useMemo(() => {
    const all = state.data?.sleep ?? [];
    return [...all].sort((a, b) => new Date(b.bedtime).getTime() - new Date(a.bedtime).getTime());
  }, [state.data?.sleep]);

  // Best night this week: highest quality score among last 7 days
  const bestNightId = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = records.filter(r => new Date(r.bedtime).getTime() >= sevenDaysAgo);
    if (recent.length === 0) return null;
    const scoreOf = (r: SleepRecord) => {
      const total = r.totalMinutes;
      if (total <= 0) return 0;
      const deep = r.deepMinutes ?? 0;
      const rem = r.remMinutes ?? 0;
      const awake = Math.max(0, total * (1 - r.efficiency / 100));
      return Math.min(deepPct(deep, total) / 0.20, 1) * 30
           + Math.min(remPct(rem, total) / 0.22, 1) * 30
           + r.efficiency * 0.30
           - Math.min((awake / total) / 0.10, 1) * 10 + 10;
    };
    const deepPct = (d: number, t: number) => d / t;
    const remPct  = (r: number, t: number) => r / t;
    return recent.reduce((best, r) => scoreOf(r) > scoreOf(best) ? r : best, recent[0]).id;
  }, [records]);

  // Circadian phase label: infer chronotype and compute optimal sleep window
  const circadianPhase = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recentBedtimes = records
      .filter(r => r.bedtime && r.bedtime.slice(0, 10) >= sevenDaysAgo)
      .map(r => r.bedtime);
    if (recentBedtimes.length === 0) return null;
    const ct = inferChronotype(recentBedtimes);
    if (ct.avgBedtimeHour === null) return null;
    // Optimal wake = avg bedtime + goal sleep duration
    const wakeHour = (ct.avgBedtimeHour + sleepGoalHrs) % 24;
    return {
      chronotype: ct,
      bedtimeLabel: formatHour(ct.avgBedtimeHour),
      wakeLabel: formatHour(wakeHour),
    };
  }, [records, sleepGoalHrs]);

  // Consistency streak: consecutive nights meeting sleep goal
  const streakCount = useMemo(() => {
    if (sleepGoalHrs <= 0 || records.length === 0) return 0;
    const sorted = [...records].sort((a, b) => new Date(a.bedtime).getTime() - new Date(b.bedtime).getTime());
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let checkDate = new Date(today);
    for (let i = sorted.length - 1; i >= 0; i--) {
      const r = sorted[i];
      const rDate = new Date(r.bedtime);
      rDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((checkDate.getTime() - rDate.getTime()) / 86400000);
      if (diffDays > 1) break;
      if (r.totalMinutes >= sleepGoalHrs * 60) {
        streak++;
        checkDate = new Date(rDate);
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [records, sleepGoalHrs]);

  const handleSave = useCallback(async () => {
    if (!derived) {
      Alert.alert(
        t.invalidSleep ?? 'Invalid Sleep',
        t.invalidSleepMsg ?? 'Please enter valid bedtime and wake time.'
      );
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const record: SleepRecord = {
        id: generateId(),
        date: `${derived.bed.getFullYear()}-${String(derived.bed.getMonth() + 1).padStart(2, '0')}-${String(derived.bed.getDate()).padStart(2, '0')}`,
        bedtime: derived.bed.toISOString(),
        wakeTime: derived.wake.toISOString(),
        totalMinutes: derived.total,
        deepMinutes: derived.deep,
        remMinutes: derived.rem,
        lightMinutes: derived.light,
        awakeMinutes: derived.awake,
        coreMinutes: derived.core,
        efficiency: derived.eff,
        source: 'manual',
        ...(note.trim() ? { note: note.trim() } : {}),
      };

      await addSleep(record);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Reset form to defaults
      const nextBed = new Date(); nextBed.setHours(22, 0, 0, 0);
      const nextWake = new Date(); nextWake.setHours(6, 30, 0, 0);
      setBedtimeDate(nextBed);
      setWakeTimeDate(nextWake);
      setDeepMins('');
      setRemMins('');
      setCoreMins('');
      setAwakeMins('');
      setNote('');
      setQuality(4);
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, addSleep, t]);

  const handleDelete = useCallback(async (id: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await deleteSleep(id);
  }, [deleteSleep]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t.logSleepTitle ?? 'Sleep'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Entry Form ─────────────────────────────────────────────── */}
        <View style={[styles.formCard, {
          backgroundColor: isDark ? colors.surface : colors.surface,
          borderColor: colors.border,
        }]}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>
            {t.logSleepTitle ?? 'Log Sleep'}
          </Text>

          {/* Bedtime / Wake time */}
          <View style={styles.timeRow}>
            <TimePickerField
              label={t.bedtimeLabel ?? 'Bedtime'}

              value={bedtimeDate}
              onChange={setBedtimeDate}
              colors={colors}
              isDark={isDark}
            />
            <View style={styles.timeSep}>
              <IconSymbol name="arrow.right" size={16} color={colors.muted} />
            </View>
            <TimePickerField
              label={t.wakeTimeLabel ?? 'Wake Time'}

              value={wakeTimeDate}
              onChange={setWakeTimeDate}
              colors={colors}
              isDark={isDark}
            />
          </View>

          {/* Derived duration preview */}
          {derived && (
            <View style={[styles.durationPreview, {
              backgroundColor: colors.primary + '12',
              borderColor: colors.primary + '30',
            }]}>
              <Text style={[styles.durationText, { color: colors.primary }]}>
                {formatDuration(derived.total)} · {derived.eff}% efficiency
              </Text>
            </View>
          )}

          {/* Quality selector */}
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>
            {t.sleepQualityLabel ?? 'Sleep Quality'}
          </Text>
          <View style={styles.qualityRow}>
            {getQualityOptions(t).map((opt) => {
              const active = quality === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.qualityBtn, {
                    backgroundColor: active ? opt.color + '20' : 'transparent',
                    borderColor: active ? opt.color : colors.border,
                  }]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setQuality(opt.value);
                  }}
                >
                  <Text style={styles.qualityEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.qualityLabel, { color: active ? opt.color : colors.muted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Optional stage estimates */}
          <Text style={[styles.fieldLabel, { color: isDark ? '#CBD5E1' : colors.muted, marginTop: 12 }]}>
            {t.stageEstimatesLabel ?? 'Stage Estimates (optional)'}
          </Text>
          {/* Row 1: Deep + REM */}
          <View style={styles.stageRow}>
            <View style={styles.stageField}>
              <Text style={[styles.stageFieldLabel, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>{t.stageDeepLabel ?? '🌑 Deep (min)'}</Text>
              <TextInput
                style={[styles.stageInput, {
                  backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(165,180,252,0.55)' : '#6366F1' + '40',
                  color: isDark ? '#E0E7FF' : colors.foreground,
                }]}
                value={deepMins}
                onChangeText={setDeepMins}
                placeholder="0"
                placeholderTextColor={isDark ? '#6366F1' : colors.muted}
                keyboardType="default"
                returnKeyType="done"
              />
            </View>
            <View style={styles.stageField}>
              <Text style={[styles.stageFieldLabel, { color: isDark ? '#67E8F9' : '#0891B2' }]}>{t.stageRemLabel ?? '💤 REM (min)'}</Text>
              <TextInput
                style={[styles.stageInput, {
                  backgroundColor: isDark ? 'rgba(34,211,238,0.10)' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(103,232,249,0.55)' : '#22D3EE' + '40',
                  color: isDark ? '#CFFAFE' : colors.foreground,
                }]}
                value={remMins}
                onChangeText={setRemMins}
                placeholder="0"
                placeholderTextColor={isDark ? '#22D3EE' : colors.muted}
                keyboardType="default"
                returnKeyType="done"
              />
            </View>
          </View>
          {/* Row 2: Core + Awake */}
          <View style={[styles.stageRow, { marginTop: 8 }]}>
            <View style={styles.stageField}>
              <Text style={[styles.stageFieldLabel, { color: isDark ? '#7DD3FC' : '#0284C7' }]}>{t.stageCoreLabel ?? '🌊 Core (min)'}</Text>
              <TextInput
                style={[styles.stageInput, {
                  backgroundColor: isDark ? 'rgba(56,189,248,0.10)' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(125,211,252,0.55)' : '#38BDF8' + '40',
                  color: isDark ? '#E0F2FE' : colors.foreground,
                }]}
                value={coreMins}
                onChangeText={setCoreMins}
                placeholder="auto"
                placeholderTextColor={isDark ? '#38BDF8' : colors.muted}
                keyboardType="default"
                returnKeyType="done"
              />
            </View>
            <View style={styles.stageField}>
              <Text style={[styles.stageFieldLabel, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>{t.stageAwakeLabel ?? '☀️ Awake (min)'}</Text>
              <TextInput
                style={[styles.stageInput, {
                  backgroundColor: isDark ? 'rgba(248,113,113,0.10)' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(252,165,165,0.55)' : '#F87171' + '40',
                  color: isDark ? '#FEE2E2' : colors.foreground,
                }]}
                value={awakeMins}
                onChangeText={setAwakeMins}
                placeholder="auto"
                placeholderTextColor={isDark ? '#F87171' : colors.muted}
                keyboardType="default"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Note */}
          <TextInput
            style={[styles.noteInput, {
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              borderColor: colors.border,
              color: colors.foreground,
              marginTop: 12,
            }]}
            value={note}
            onChangeText={setNote}
            placeholder={t.notePlaceholder}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={2}
            returnKeyType="done"
            blurOnSubmit={false}
          />          {/* ── Voice Dictate Section ─────────────────────────────────────── */}
          <View style={{ marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: isDark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.07)', borderWidth: 1, borderColor: isDark ? 'rgba(99,102,241,0.30)' : 'rgba(99,102,241,0.20)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <MicrophoneIcon size={22} isActive={false} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#6366F1' }}>{t.dictateSleepTitle ?? 'Dictate Sleep'}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
              {t.dictateSleepHint ?? 'Tap the mic and describe your sleep — e.g. "Went to bed at 10:30, woke at 6:45, felt great, about 90 minutes deep sleep."'}
            </Text>            {/* Example phrases hint */}
            <View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)', borderWidth: 1, borderColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6366F1', marginBottom: 5 }}>{t.dictateSleepTrySaying ?? '💡 Try saying…'}</Text>
              {[
                t.dictateSleepPhrase1 ?? '"I went to bed at 11pm and woke up at 7am, slept pretty well"',
                t.dictateSleepPhrase2 ?? '"Fell asleep around midnight, up at 6, felt restless, maybe 45 min deep sleep"',
                t.dictateSleepPhrase3 ?? '"Bed 10:30, woke 6:45, great night, quality 5 out of 5"',
              ].map((phrase, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, marginBottom: i < 2 ? 4 : 0, paddingVertical: 1 })}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Strip surrounding quotes, then run through the scribe pipeline
                    const _raw = phrase.replace(/^"|"$/g, '');
                    /* dictation removed */
                  }}
                  accessibilityLabel={`Use example: ${phrase}`}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 11, color: '#6366F1', lineHeight: 17, textDecorationLine: 'underline' }}>{phrase}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Save button */}
          <Pressable
            style={({ pressed }) => [styles.saveBtn, {
              backgroundColor: colors.primary,
              opacity: pressed || saving || !derived ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }]}
            onPress={handleSave}
            disabled={saving || !derived}
          >
            <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>
              {saving ? (t.saving ?? 'Saving…') : (t.saveSleep ?? 'Save Sleep Entry')}
            </Text>
          </Pressable>
        </View>

        {/* ── Consistency Streak Banner ───────────────────────────────── */}
        {streakCount > 0 && (
          <View style={[styles.streakBanner, { backgroundColor: isDark ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.35)' }]}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.streakTitle, { color: isDark ? '#FCD34D' : '#B45309' }]}>
                {streakCount}-Night Streak!
              </Text>
              <Text style={[styles.streakSub, { color: colors.muted }]}>
                {"You've hit your "}{sleepGoalHrs}h goal {streakCount} night{streakCount > 1 ? 's' : ''} in a row. Keep it up!
              </Text>
            </View>
          </View>
        )}

        {/* ── NeoSleep Weekly Chart ─ independent full-width 7-night view ── */}
        <NeoSleepWeeklyChart
          records={records}
          goalHrs={sleepGoalHrs}
          colors={colors}
          isDark={isDark}
        />
            {/* ── Circadian Phase Label ─────────────────────────────── */}
        {circadianPhase && (
          <View style={[
            styles.circadianBanner,
            {
              backgroundColor: isDark ? 'rgba(79,70,229,0.10)' : 'rgba(79,70,229,0.07)',
              borderColor: isDark ? 'rgba(129,140,248,0.28)' : 'rgba(99,102,241,0.22)',
            },
          ]}>
            <Text style={styles.circadianEmoji}>{circadianPhase.chronotype.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.circadianTitle, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
                Optimal sleep window
              </Text>
              <Text style={[styles.circadianWindow, { color: isDark ? '#E0E7FF' : '#312E81' }]}>
                {circadianPhase.bedtimeLabel} – {circadianPhase.wakeLabel}
              </Text>
            </View>
            <Text style={[styles.circadianType, { color: isDark ? '#818CF8' : '#6366F1' }]}>
              {circadianPhase.chronotype.label}
            </Text>
          </View>
        )}

        {/* ── Sleep Debt Banner ──────────────────────────────── */}
        {(() => {
          const weekMs = 7 * 24 * 60 * 60 * 1000;
          const cutoff = new Date(Date.now() - weekMs).toISOString();
          const weekRecords = records.filter(r => r.bedtime >= cutoff);
          const goalMins = sleepGoalHrs * 60 * 7;
          const actualMins = weekRecords.reduce((s, r) => s + r.totalMinutes, 0);
          const debtMins = goalMins - actualMins;
          if (weekRecords.length === 0) return null;
          const absMins = Math.abs(debtMins);
          const debtH = Math.floor(absMins / 60);
          const debtM = absMins % 60;
          const debtLabel = debtH > 0 ? `${debtH}h ${debtM}m` : `${debtM}m`;
          const isSurplus = debtMins <= 0;
          const severity = isSurplus ? 'surplus' : debtMins > 180 ? 'high' : debtMins > 60 ? 'med' : 'low';
          const bannerBg = {
            surplus: isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.10)',
            low: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)',
            med: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.13)',
            high: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.10)',
          }[severity];
          const bannerBorder = {
            surplus: isDark ? 'rgba(34,197,94,0.30)' : 'rgba(34,197,94,0.25)',
            low: isDark ? 'rgba(245,158,11,0.30)' : 'rgba(245,158,11,0.25)',
            med: isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.30)',
            high: isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.28)',
          }[severity];
          const bannerText = {
            surplus: isDark ? '#4ADE80' : '#16A34A',
            low: isDark ? '#FBBF24' : '#D97706',
            med: isDark ? '#FBBF24' : '#D97706',
            high: isDark ? '#F87171' : '#DC2626',
          }[severity];
          const emoji = isSurplus ? '✅' : severity === 'high' ? '🔴' : severity === 'med' ? '🟡' : '🟠';
          const headline = isSurplus
            ? `+${debtLabel} ${t.surplusThisWeek ?? 'surplus this week'}`
            : `−${debtLabel} ${t.sleepDebtThisWeek ?? 'sleep debt this week'}`;
          const tip = isSurplus
            ? (t.greatWorkSleepGoal ?? 'Great work — you\'re meeting your sleep goal.')
            : severity === 'high'
              ? (t.highDebtTip ?? 'High debt. Prioritise an early bedtime tonight.')
              : severity === 'med'
                ? (t.moderateDebtTip ?? 'Moderate debt. Aim for 30 min extra tonight.')
                : (t.minorDeficitTip ?? 'Minor deficit. A consistent schedule will help.');
          return (
            <View style={[styles.debtBanner, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
              <Text style={styles.debtEmoji}>{emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.debtHeadline, { color: bannerText }]}>{headline}</Text>
                <Text style={[styles.debtTip, { color: isDark ? '#94A3B8' : '#64748B' }]}>{tip}</Text>
              </View>
            </View>
          );
        })()}

        {/* ── Sleep Insights ──────────────────────────────────────── */}
        {records.length >= 2 && (
          <SleepInsightsCard
            records={records}
            goalHrs={sleepGoalHrs}
            colors={colors}
            isDark={isDark}
          />
        )}
        {/* ── History ───────────────────────────────────────────────── */}
        <Text style={[styles.historyTitle, { color: colors.foreground }]}>
          {t.history}
        </Text>

        {records.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {t.sleepEmpty ?? 'No sleep entries yet. Log your first above.'}
          </Text>
        ) : (
          <FlatList
            data={records}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <SleepCard
                record={item}
                onDelete={handleDelete}
                colors={colors}
                t={t as any}
                goalHrs={sleepGoalHrs}
                isBestNight={item.id === bestNightId}
              />
            )}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scrollContent: { padding: 16, gap: 16 },

  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },

  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeField: { flex: 1, gap: 4 },
  timeSep: { paddingBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  // Native iOS picker pill
  timeDisplayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  timeDisplayText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Android/web fallback text input
  timeInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34, // safe area bottom
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  pickerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerToolbarLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerDoneBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  pickerDoneText: { fontSize: 17, fontWeight: '600' },
  pickerWheel: { height: 216 },

  durationPreview: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  durationText: { fontSize: 13, fontWeight: '700' },

  qualityRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  qualityBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  qualityEmoji: { fontSize: 18 },
  qualityLabel: { fontSize: 9, fontWeight: '600' },

  stageRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  stageField: { flex: 1, gap: 4 },
  stageFieldLabel: { fontSize: 11, fontWeight: '700' },
  stageInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },

  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 56,
    textAlignVertical: 'top',
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  historyTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    overflow: 'hidden',
  },
  cardShimmer: {
    position: 'absolute',
    top: 0,
    left: '15%',
    width: '70%',
    height: 1.5,
    borderRadius: 1,
  },
  // Sleep Debt banner
  debtBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  debtEmoji: { fontSize: 18, lineHeight: 22 },
  debtHeadline: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  debtTip: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardDate: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  cardDuration: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  effBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 1,
  },
  effText: { fontSize: 15, fontWeight: '800' },
  effLabel: { fontSize: 9, fontWeight: '500' },
  stagePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stagePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  stagePillText: { fontSize: 11, fontWeight: '600' },
  deleteBtn: { position: 'absolute', top: 12, right: 12 },
  goalChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  goalChipText: { fontSize: 10, fontWeight: '700' },
  qualityRingWrap: { alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  qualityRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityRingScore: { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  qualityRingLabel: { fontSize: 8, fontWeight: '500', marginTop: 1 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  noteRowText: { flex: 1, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },

  // AM/PM badge on the time picker pill
  ampmBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  ampmText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  streakEmoji: { fontSize: 26 },
  streakTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  streakSub: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  bestNightBanner: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  bestNightText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },

  // Circadian phase label
  circadianBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  circadianEmoji: { fontSize: 22, lineHeight: 26 },
  circadianTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  circadianWindow: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, marginTop: 1 },
  circadianType: { fontSize: 11, fontWeight: '700' },
});
