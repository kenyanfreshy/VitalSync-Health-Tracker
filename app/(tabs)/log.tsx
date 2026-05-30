/**
 * Log Tab — Hub screen for all manual health data entry.
 * Links to weight, vital signs, blood sugar, and activity log screens.
 */
import { safeFormatTime } from '@/lib/utils';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Alert, Platform, TextInput, Keyboard } from 'react-native';
import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors } from '@/hooks';
import { useT } from '@/lib/i18n-ai';
import { loadReminderHistory, filterToday, CATEGORY_META, type ReminderHistoryEntry } from '@/lib/reminder-history';
import { parseNutritionTranscript } from '@/lib/scribe/parsers';
import { MicrophoneIcon } from '@/components/ui/microphone-icon';
import type { SodiumRecord } from '@/lib/health/types';

const LOG_STRINGS = {
  screenTitle: 'Log',
  screenSubtitle: 'Track your health manually',
  sectionHealthMetrics: 'Health Metrics',
  sectionNutrition: 'Nutrition',
  sectionActivity: 'Activity',

  sectionQuickStats: 'Quick Stats',
  // Card titles
  cardWeight: 'Weight',
  cardWeightSub: 'Track body weight over time',
  cardVitals: 'Vital Signs',
  cardVitalsSub: 'BP, HR, SpO2, temperature',
  cardSleep: 'Sleep',
  cardSleepSub: 'Bedtime, wake time & quality',
  latestHours: 'last night',
  cardBloodSugar: 'Blood Sugar',
  cardBloodSugarSub: 'Glucose levels with context',
  cardActivity: 'Activity',
  cardActivitySub: 'Runs, walks, cycling, workouts',
  cardExerciseHistory: 'Exercise History',
  cardExerciseHistorySub: 'EPOC sessions logged via Activity Log',

  cardNutrition: 'Nutrition Log',
  cardNutritionSub: 'Log meals via Smart scan, barcode, or USDA search',
  // Stat labels
  statWeightEntries: 'Weight\nEntries',
  statVitalEntries: 'Vital Sign\nEntries',
  statGlucoseReadings: 'Glucose\nReadings',
  statActivitiesLogged: 'Activities\nLogged',
  // Latest labels
  latestLatest: 'latest',
  latestMmhg: 'mmHg',
  latestToday: 'today',
  latestLastSession: 'last session',
  latestActive: 'active',
  sectionLabResults: 'Lab Results',
  sectionImmunizations: 'Immunizations',
  sectionTodayReminders: "Today's Completed Reminders",
  cardLabTracker: 'Lab Tracker',
  cardLabTrackerSub: 'CMP, CBC, Mg, Phos, Lipid Panel, A1C — OCR + Dynamic Correlation',
  cardImmunizationRecords: 'Immunization Records',
  cardImmunizationRecordsSub: 'Vaccines, boosters, lot numbers & next-dose reminders',
  onFile: 'on file',
  resultSingular: 'result',
  resultPlural: 'results',
  recordSingular: 'record',
  recordPlural: 'records',
  tapKeyboardMicToSpeak: '🎤 Tap keyboard mic to speak…',
  mealLogged: '✓ Meal logged!',
} as const;

interface LogCardProps {
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  latestValue?: string;
  latestLabel?: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}

function LogCard({ title, subtitle, icon, accentColor, latestValue, latestLabel, onPress, colors }: LogCardProps) {
  const s = cardStyles(colors);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      <View style={[s.iconWrap, { backgroundColor: accentColor + '18' }]}>
        <Text style={s.icon}>{icon}</Text>
      </View>
      <View style={s.content}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>
      {latestValue ? (
        <View style={s.latest}>
          <Text style={[s.latestValue, { color: accentColor }]}>{latestValue}</Text>
          {latestLabel ? <Text style={s.latestLabel}>{latestLabel}</Text> : null}
        </View>
      ) : null}
      <IconSymbol name="chevron.right" size={18} color={colors.muted} />
    </Pressable>
  );
}

const cardStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceRaised, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: c.border },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  icon: { fontSize: 24 },
  content: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: c.foreground },
  subtitle: { fontSize: 12, color: c.muted, marginTop: 2 },
  latest: { alignItems: 'flex-end', marginRight: 8 },
  latestValue: { fontSize: 16, fontWeight: '700' },
  latestLabel: { fontSize: 11, color: c.muted, marginTop: 1 },
});

function formatWeight(records: { weightLbs: number }[]): string | undefined {
  if (!records.length) return undefined;
  return `${records[0].weightLbs} lbs`;
}

function formatLatestSleep(records: { totalMinutes: number; bedtime: string }[]): string | undefined {
  if (!records.length) return undefined;
  const r = records[0];
  if (!r.totalMinutes) return undefined;
  const h = Math.floor(r.totalMinutes / 60);
  const m = r.totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatBP(records: { systolic?: number | null; diastolic?: number | null }[]): string | undefined {
  // Accept partial readings (systolic-only or diastolic-only)
  const r = records.find(r => r.systolic != null || r.diastolic != null);
  if (!r) return undefined;
  const sys = r.systolic != null ? String(r.systolic) : '--';
  const dia = r.diastolic != null ? String(r.diastolic) : '--';
  return `${sys}/${dia}`;
}

function formatGlucose(records: { glucoseMgDl: number }[]): string | undefined {
  if (!records.length) return undefined;
  return `${records[0].glucoseMgDl} mg/dL`;
}

function formatLastActivity(records: { type: string; durationMinutes: number }[]): string | undefined {
  if (!records.length) return undefined;
  const r = records[0];
  const label = r.type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${label} · ${r.durationMinutes}m`;
}

export default function LogScreen() {
  const logScrollRef = React.useRef<ScrollView | null>(null);
  const { showScrollTop: showLogScrollTop, scrollTopOpacity: logScrollTopOpacity, handleScroll: handleLogScroll, scrollToTop: logScrollToTop } = useScrollToTop(logScrollRef);
  const colors = useColors();
  const router = useRouter();
  const { state, addSodium } = useHealth();
  const data = state.data;
  const t = useT(LOG_STRINGS);
  const isDark = colors.background === '#151718' || colors.background < '#888888';
  function navigate(path: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  }

  // ── Reminder History ────────────────────────────────────────────
  const [reminderHistory, setReminderHistory] = useState<ReminderHistoryEntry[]>([]);
  useEffect(() => {
    loadReminderHistory().then(all => setReminderHistory(filterToday(all)));
  }, []);

  // ── Voice quick-log for Nutrition card (keyboard dictation — no server) ──
  // Tap mic → hidden TextInput focuses → iOS/Gboard keyboard opens with its
  // built-in dictation key → user speaks → text flows via onChangeText →
  // tap Log → parseNutritionTranscript runs locally, no network call.
  const [voiceLogging, setVoiceLogging] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'dictating' | 'done' | 'error'>('idle');
  const [voiceText, setVoiceText] = useState('');
  const voiceDictInputRef = useRef<TextInput>(null);
  const micPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (voiceStatus === 'dictating') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micPulse.stopAnimation();
      Animated.timing(micPulse, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [voiceStatus, micPulse]);

  const handleVoiceLogSubmit = useCallback(async () => {
    const transcript = voiceText.trim();
    if (!transcript) return;
    setVoiceLogging(true);
    try {
      const macros = parseNutritionTranscript(transcript);
      const record: SodiumRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        sodiumMg: macros.sodiumMg ?? 0,
        mealContext: 'other',
        foodDescription: macros.foodDescription,
        source: 'ai-photo',
        nutrientSource: 'ai_scan',
        calories: macros.calories ?? undefined,
        carbsG: macros.carbsG ?? undefined,
        fatG: macros.fatG ?? undefined,
        proteinG: macros.proteinG ?? undefined,
        fiberG: macros.fiberG ?? undefined,
      };
      await addSodium(record);
      setVoiceStatus('done');
      setVoiceText('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setVoiceStatus('idle'), 3000);
    } catch (_unused) {
      setVoiceStatus('error');
      Alert.alert('Log failed', 'Could not save nutrition entry. Please try again.');
    } finally {
      setVoiceLogging(false);
    }
  }, [voiceText, addSodium]);

  const handleVoiceMicPress = useCallback(() => {
    if (voiceStatus === 'dictating') {
      Keyboard.dismiss();
      setVoiceStatus('idle');
      handleVoiceLogSubmit();
    } else {
      setVoiceStatus('dictating');
      setVoiceText('');
      setTimeout(() => voiceDictInputRef.current?.focus(), 100);
    }
  }, [voiceStatus, handleVoiceLogSubmit]);

  const s = styles(colors);
  const cs = cardStyles(colors);

  return (
    <ScreenContainer>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t.screenTitle}</Text>
        <Text style={s.headerSub}>{t.screenSubtitle}</Text>
      </View>

      <ScrollView ref={logScrollRef} onScroll={handleLogScroll} scrollEventThrottle={16} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {/* ── Health Metrics ─────────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>{t.sectionHealthMetrics}</Text>

        <LogCard
          title={t.cardWeight}
          subtitle={t.cardWeightSub}
          icon="⚖️"
          accentColor="#0EA5E9"
          latestValue={data ? formatWeight(data.weight ?? []) : undefined}
          latestLabel={(data?.weight ?? []).length ? t.latestLatest : undefined}
          onPress={() => navigate('/log/weight')}
          colors={colors}
        />

        <LogCard
          title={t.cardVitals}
          subtitle={t.cardVitalsSub}
          icon="🩺"
          accentColor="#EF4444"
          latestValue={data ? formatBP(data.vitalSigns ?? []) : undefined}
          latestLabel={(data?.vitalSigns ?? []).length ? t.latestMmhg : undefined}
          onPress={() => navigate('/log/vitals')}
          colors={colors}
        />

        <LogCard
          title={t.cardSleep}
          subtitle={t.cardSleepSub}
          icon="🌙"
          accentColor="#8B5CF6"
          latestValue={data ? formatLatestSleep(data.sleep ?? []) : undefined}
          latestLabel={(data?.sleep ?? []).length ? t.latestHours : undefined}
          onPress={() => navigate('/log/sleep')}
          colors={colors}
        />

        <LogCard
          title={t.cardBloodSugar}
          subtitle={t.cardBloodSugarSub}
          icon="🩸"
          accentColor="#F59E0B"
          latestValue={data ? formatGlucose(data.bloodSugar ?? []) : undefined}
          latestLabel={(data?.bloodSugar ?? []).length ? t.latestLatest : undefined}
          onPress={() => navigate('/log/blood-sugar')}
          colors={colors}
        />

         {/* ── Nutrition ──────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 8 }]}>{t.sectionNutrition}</Text>

        {/* Nutrition card with inline voice quick-log */}
        <View style={[cs.card]}>
          <Pressable
            onPress={() => navigate('/log/nutrition')}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          >
            <View style={[cs.iconWrap, { backgroundColor: '#22C55E18' }]}>
              <Text style={{ fontSize: 24 }}>🥗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.title}>{t.cardNutrition}</Text>
              <Text style={cs.subtitle}>
                {voiceStatus === 'dictating'
                  ? t.tapKeyboardMicToSpeak
                  : voiceStatus === 'done'
                  ? t.mealLogged
                  : t.cardNutritionSub}
              </Text>
            </View>
            {(data?.sodiumIntake ?? []).length ? (
              <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#22C55E' }}>
                  {(data!.sodiumIntake ?? []).length} meal{(data!.sodiumIntake ?? []).length !== 1 ? 's' : ''}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>logged</Text>
              </View>
            ) : null}
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </Pressable>
          {/* Voice quick-log mic button (keyboard dictation — on-device) */}
          {/* Hidden TextInput: focused by handleVoiceMicPress to trigger iOS/Gboard keyboard with built-in dictation key */}
          <TextInput
            ref={voiceDictInputRef}
            value={voiceText}
            onChangeText={setVoiceText}
            onSubmitEditing={handleVoiceLogSubmit}
            returnKeyType="done"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            multiline
          />
          <Animated.View style={{ transform: [{ scale: micPulse }], marginLeft: 8 }}>
            <Pressable
              onPress={handleVoiceMicPress}
              disabled={voiceLogging}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {voiceStatus === 'done'
                ? <Text style={{ fontSize: 18 }}>✅</Text>
                : <MicrophoneIcon size={40} isActive={voiceStatus === 'dictating'} />}
            </Pressable>
          </Animated.View>
        </View>

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 8 }]}>{t.sectionActivity}</Text>

        <LogCard
          title={t.cardActivity}
          subtitle={t.cardActivitySub}
          icon="🏃"
          accentColor="#22C55E"
          latestValue={data ? formatLastActivity(data.activity ?? []) : undefined}
          latestLabel={(data?.activity ?? []).length ? t.latestLastSession : undefined}
          onPress={() => navigate('/log/activity')}
          colors={colors}
        />

        <LogCard
          title={t.cardExerciseHistory}
          subtitle={t.cardExerciseHistorySub}
          icon="⚡"
          accentColor="#F59E0B"
          onPress={() => navigate('/log/activity-log-history')}
          colors={colors}
        />

        {/* ── Labs ──────────────────────────────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 8 }]}>{t.sectionLabResults}</Text>

        <LogCard
          title={t.cardLabTracker}
          subtitle={t.cardLabTrackerSub}
          icon="🧪"
          accentColor="#2563EB"
          latestValue={(data?.labResults ?? []).length
            ? `${(data!.labResults ?? []).length} ${(data!.labResults ?? []).length !== 1 ? t.resultPlural : t.resultSingular}`
            : undefined}
          latestLabel={(data?.labResults ?? []).length ? t.onFile : undefined}
          onPress={() => navigate('/labs')}
          colors={colors}
        />

        {/* ── Immunizations ──────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 8 }]}>{t.sectionImmunizations}</Text>
        <LogCard
          title={t.cardImmunizationRecords}
          subtitle={t.cardImmunizationRecordsSub}
          icon="💉"
          accentColor="#10B981"
          latestValue={(data?.immunizations ?? []).length
            ? `${(data!.immunizations ?? []).length} ${(data!.immunizations ?? []).length !== 1 ? t.recordPlural : t.recordSingular}`
            : undefined}
          latestLabel={(data?.immunizations ?? []).length ? t.onFile : undefined}
          onPress={() => navigate('/log/immunizations')}
          colors={colors}
        />

        {/* ── Reminder History ───────────────────────────────────────────────── */}
        {reminderHistory.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 8 }]}>{t.sectionTodayReminders}</Text>
            <View style={{ marginBottom: 8 }}>
              {reminderHistory.map(entry => {
                const meta = CATEGORY_META[entry.category];
                const time = safeFormatTime(entry.completedAt, [], { hour: '2-digit', minute: '2-digit' });
                return (
                  <View
                    key={entry.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                      gap: 10,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#E2E8F0' : '#1E293B' }} numberOfLines={1}>{entry.label || meta.label}</Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 1 }}>
                        {meta.label} · {time}{entry.snoozed ? ' · Snoozed 15m' : ''}
                      </Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                      backgroundColor: entry.snoozed
                        ? (isDark ? '#78350F30' : '#FEF3C7')
                        : (isDark ? '#14532D30' : '#DCFCE7'),
                    }}>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: entry.snoozed
                          ? (isDark ? '#FBBF24' : '#92400E')
                          : (isDark ? '#4ADE80' : '#15803D'),
                      }}>
                        {entry.snoozed ? '⏱ Snoozed' : '✓ Done'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Quick Stats ────────────────────────────────────────────────────── */}
        {data && ((data.weight ?? []).length > 0 || (data.bloodSugar ?? []).length > 0 || (data.activity ?? []).length > 0) && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 8 }]}>{t.sectionQuickStats}</Text>
            <View style={s.statsGrid}>
              {(data.weight ?? []).length > 0 && (
                <View style={s.statCard}>
                  <Text style={s.statValue}>{(data.weight ?? []).length}</Text>
                  <Text style={s.statLabel}>{t.statWeightEntries}</Text>
                </View>
              )}
              {(data.vitalSigns ?? []).length > 0 && (
                <View style={s.statCard}>
                  <Text style={s.statValue}>{(data.vitalSigns ?? []).length}</Text>
                  <Text style={s.statLabel}>{t.statVitalEntries}</Text>
                </View>
              )}
              {(data.bloodSugar ?? []).length > 0 && (
                <View style={s.statCard}>
                  <Text style={s.statValue}>{(data.bloodSugar ?? []).length}</Text>
                  <Text style={s.statLabel}>{t.statGlucoseReadings}</Text>
                </View>
              )}
              {(data.activity ?? []).length > 0 && (
                <View style={s.statCard}>
                  <Text style={s.statValue}>{(data.activity ?? []).length}</Text>
                  <Text style={s.statLabel}>{t.statActivitiesLogged}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <ScrollToTopButton opacity={logScrollTopOpacity} visible={showLogScrollTop} onPress={logScrollToTop} />
    </ScreenContainer>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: c.foreground },
  headerSub: { fontSize: 14, color: c.muted, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: { flex: 1, minWidth: '44%', backgroundColor: c.surfaceRaised, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800', color: c.primary },
  statLabel: { fontSize: 12, color: c.muted, textAlign: 'center', marginTop: 4, lineHeight: 16 },
});
