/**
 * Activity Log Screen
 * Manual entry for outdoor run, indoor run, walk, cycling, workout.
 * Tracks HR, steps, distance, calories burned, duration.
 */
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Alert, Platform, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useDataSources } from '@/lib/data-sources/data-sources-context';
import { useColors, useLang, useRTL } from '@/hooks';
import { kmToMiles, milesToKm, type ActivityRecord, type ActivityType } from '@/lib/health/types';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { logStrings, dictationBoxStrings } from '@/lib/i18n';
import { WeatherBadge } from '@/components/weather-badge';
import { MomentumCard } from '@/components/momentum-card';
import { getWeatherActivityMessage } from '@/lib/activity/get-weather-activity-message';
import { getSmartActivityMessage } from '@/lib/activity/get-smart-activity-message';
import { useWeather } from '@/lib/weather/use-weather';
import { parseActivityTranscript } from '@/lib/scribe/parsers';
import { useDictationHistory } from '@/hooks/use-dictation-history';
import { useFieldFlash } from '@/hooks/use-field-flash';
import { DictationBox, type DictationBoxHandle } from '@/components/dictation-box';

type DistUnit = 'mi' | 'km';

interface ActivityConfig {
  type: ActivityType;
  label: string;
  icon: string;
  color: string;
  showDistance: boolean;
  showSteps: boolean;
}

const ACTIVITY_TYPE_META: Record<ActivityType, { icon: string; color: string; showDistance: boolean; showSteps: boolean }> = {
  'outdoor-run': { icon: '🏃', color: '#22C55E', showDistance: true, showSteps: true },
  'indoor-run':  { icon: '🏃', color: '#6366F1', showDistance: true, showSteps: true },
  'walk':        { icon: '🚶', color: '#10B981', showDistance: true, showSteps: true },
  'cycling':     { icon: '🚴', color: '#F59E0B', showDistance: true, showSteps: false },
  'workout':     { icon: '💪', color: '#EF4444', showDistance: false, showSteps: false },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface SmallFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  unit: string;
  colors: ReturnType<typeof useColors>;
}

function SmallField({ label, value, onChangeText, placeholder, unit, colors }: SmallFieldProps) {
  const s = smallFieldStyles(colors);
  return (
    <View style={s.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Text style={[s.label, { marginBottom: 0 }]}>{label}</Text>
      </View>
      <View style={s.row}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="default"
          returnKeyType="done"
          maxLength={6}
        />
        <Text style={s.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const smallFieldStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  wrap: { flex: 1, minWidth: '45%', marginBottom: 12, marginHorizontal: 4 },
  label: { fontSize: 11, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, fontSize: 18, fontWeight: '700', color: c.foreground },
  unit: { fontSize: 12, color: c.muted, marginLeft: 4 },
});

export default function ActivityLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const lang = useLang();
  const isRTL = useRTL();
  const l = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const db = (dictationBoxStrings as unknown as Record<string, typeof dictationBoxStrings['en']>)[lang] ?? dictationBoxStrings['en'];
  const { state, addActivity, deleteActivity } = useHealth();
  const { syncAllConnected, isSyncing } = useDataSources();
  const records = state.data?.activity ?? [];

  // Weather data for message engines — driven by pinned city or IP-based location
  const {
    weatherStatus,
    pinnedCity,
    pinCity,
    clearCity,
    searchCitiesQuery,
  } = useWeather();
  const weatherData = (weatherStatus.status === 'success' || weatherStatus.status === 'stale')
    ? weatherStatus.data
    : null;

  // City search state
  const [cityQuery, setCityQuery] = useState('');
  // Allergy-style dictation
  const [dictationText, setDictationText] = useState('');
  const { pushPhrase: pushActivityPhrase } = useDictationHistory('activity');
  const ACTIVITY_FLASH_FIELDS = ['activityType', 'duration', 'distance', 'steps', 'calories', 'avgHR', 'maxHR', 'note'];
  const { flash: flashActivityFields } = useFieldFlash(ACTIVITY_FLASH_FIELDS);
  const [scribeResult, setScribeResult] = useState<{
    transcript: string; confidence: string; reasoning: string;
    filledCount: number; totalFields: number;
  } | null>(null);
  const [scribeError, setScribeError] = useState<string | null>(null);
  const dictationRef = useRef<DictationBoxHandle>(null);
  const [dictationParsing, setDictationParsing] = useState(false);
  const handleDictationSubmit = useCallback(() => {
    const text = dictationText.trim();
    if (!text) return;
    setScribeError(null);
    setScribeResult(null);
    setDictationParsing(true);
    try {
      const result = parseActivityTranscript(text);
      if (result.activityType) setSelectedType(result.activityType as ActivityType);
      if (result.durationMinutes) setDuration(String(result.durationMinutes));
      if (result.distanceKm) setDistance(String(result.distanceKm));
      if (result.distanceKm) setDistUnit('km' as DistUnit);
      if (result.steps) setSteps(String(result.steps));
      if (result.calories) setCalories(String(result.calories));
      if (result.avgHeartRate) setAvgHR(String(result.avgHeartRate));
      if (result.maxHeartRate) setMaxHR(String(result.maxHeartRate));
      if (result.note) setNote(result.note);
      const filled: string[] = [];
      if (result.activityType) filled.push('activityType');
      if (result.durationMinutes) filled.push('duration');
      if (result.distanceKm) filled.push('distance');
      if (result.steps) filled.push('steps');
      if (result.calories) filled.push('calories');
      if (result.avgHeartRate) filled.push('avgHR');
      if (result.maxHeartRate) filled.push('maxHR');
      if (result.note) filled.push('note');
      setScribeResult({
        transcript: text,
        confidence: filled.length > 0 ? 'high' : 'low',
        reasoning: `Parsed ${filled.length} field(s) from transcript`,
        filledCount: filled.length,
        totalFields: 8,
      });
      pushActivityPhrase(text);
      flashActivityFields(filled);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_e: any) {
      setScribeError(l.scribeParseError);
    } finally {
      setDictationParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationText]);
  const [cityResults, setCityResults] = useState<import('@/lib/weather/weather-service').CityResult[]>([]);
  const [citySearching, setCitySearching] = useState(false);
  const [showCitySearch, setShowCitySearch] = useState(false);
  const citySearchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCityQueryChange = useCallback((text: string) => {
    setCityQuery(text);
    if (citySearchTimeout.current) clearTimeout(citySearchTimeout.current);
    if (!text.trim()) { setCityResults([]); return; }
    citySearchTimeout.current = setTimeout(async () => {
      setCitySearching(true);
      const results = await searchCitiesQuery(text);
      setCityResults(results);
      setCitySearching(false);
    }, 350);
  }, [searchCitiesQuery]);

  const handleSelectCity = useCallback(async (city: import('@/lib/weather/weather-service').CityResult) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await pinCity(city);
    setCityQuery('');
    setCityResults([]);
    setShowCitySearch(false);
  }, [pinCity]);

  const handleClearCity = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearCity();
    setCityQuery('');
    setCityResults([]);
    setShowCitySearch(false);
  }, [clearCity]);

  // Steps + streak from health state
  const todaySteps = React.useMemo(() => {
    const today = new Date().toDateString();
    const acts = state.data?.activity ?? [];
    return acts
      .filter((a) => new Date(a.timestamp).toDateString() === today)
      .reduce((sum, a) => sum + (a.steps ?? 0), 0) || null;
  }, [state.data?.activity]);
  const stepGoal = 10000; // default; could be pulled from profile settings
  const streakDays = React.useMemo(() => {
    const acts = state.data?.activity ?? [];
    if (acts.length === 0) return 0;
    const days = new Set(acts.map((a) => new Date(a.timestamp).toDateString()));
    let streak = 0;
    const d = new Date();
    while (days.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [state.data?.activity]);
  const lastActiveHours = React.useMemo(() => {
    const acts = state.data?.activity ?? [];
    if (acts.length === 0) return null;
    const sorted = [...acts].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return (Date.now() - new Date(sorted[0].timestamp).getTime()) / 3_600_000;
  }, [state.data?.activity]);

  const smartMessage = React.useMemo(() => getSmartActivityMessage({
    tempF: weatherData?.temperatureF ?? null,
    rainChance: weatherData?.precipitationProbability ?? null,
    windMph: weatherData?.windSpeedMph ?? null,
    condition: weatherData?.condition ?? null,
    timeOfDay: new Date().getHours(),
    stepsToday: todaySteps,
    stepGoal,
    streakDays,
    lastActiveHours,
    dayOneStreakMsg: l.dayOneStreak,
  }), [weatherData, todaySteps, streakDays, lastActiveHours, l.dayOneStreak]);

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await syncAllConnected();
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [syncAllConnected, isSyncing]);

  // Weather context — set when navigated from the Dashboard weather card
  const { readiness: weatherReadiness, condition: weatherCondition } = useLocalSearchParams<{ readiness?: string; condition?: string }>();
  const hasWeatherContext = !!weatherReadiness;

  const unitPrefs = useUnitPreferences();
  const [selectedType, setSelectedType] = useState<ActivityType>('outdoor-run');
  const [distUnit, setDistUnit] = useState<DistUnit>(() => unitPrefs.distanceUnit as DistUnit);
  // Sync when prefs change live
  React.useEffect(() => {
    setDistUnit(unitPrefs.distanceUnit as DistUnit);
  }, [unitPrefs.distanceUnit]);
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [steps, setSteps] = useState('');
  const [calories, setCalories] = useState('');
  const [avgHR, setAvgHR] = useState('');
  const [maxHR, setMaxHR] = useState('');
  const [note, setNote] = useState('');

  // Build localised activity type list from i18n
  const ACTIVITY_TYPES: ActivityConfig[] = [
    { type: 'outdoor-run', label: (l as any).actOutdoorRun ?? (l as any).outdoorRun ?? 'Outdoor Run', ...ACTIVITY_TYPE_META['outdoor-run'] },
    { type: 'indoor-run',  label: (l as any).actIndoorRun  ?? (l as any).indoorRun  ?? 'Indoor Run',  ...ACTIVITY_TYPE_META['indoor-run'] },
    { type: 'walk',        label: (l as any).actWalk       ?? (l as any).walk       ?? 'Walk',        ...ACTIVITY_TYPE_META['walk'] },
    { type: 'cycling',     label: (l as any).actCycling    ?? (l as any).cycling    ?? 'Cycling',     ...ACTIVITY_TYPE_META['cycling'] },
    { type: 'workout',     label: (l as any).actWorkout    ?? (l as any).workout    ?? 'Workout',     ...ACTIVITY_TYPE_META['workout'] },
  ];

  // Safe fallback: if selectedType is somehow not in ACTIVITY_TYPES (e.g. from old persisted data),
  // fall back to the first entry ('outdoor-run') to prevent 'Cannot read property color of undefined'.
  const activeConfig = ACTIVITY_TYPES.find(a => a.type === selectedType) ?? ACTIVITY_TYPES[0];

  const handleSave = useCallback(async () => {
    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur <= 0) {
      Alert.alert(l.durationRequired, l.durationRequiredMsg);
      return;
    }
    const distNum = distance ? parseFloat(distance) : undefined;
    const distKm = distNum !== undefined ? (distUnit === 'km' ? distNum : milesToKm(distNum)) : undefined;
    const distMi = distNum !== undefined ? (distUnit === 'mi' ? distNum : kmToMiles(distNum)) : undefined;

    const record: ActivityRecord = {
      id: `act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: selectedType,
      durationMinutes: dur,
      distanceKm: distKm,
      distanceMiles: distMi,
      steps: steps ? parseInt(steps, 10) : undefined,
      caloriesBurned: calories ? parseFloat(calories) : undefined,
      avgHeartRate: avgHR ? parseFloat(avgHR) : undefined,
      maxHeartRate: maxHR ? parseFloat(maxHR) : undefined,
      note: note.trim() || undefined,
      source: 'manual',
    };
    await addActivity(record);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDuration(''); setDistance(''); setSteps(''); setCalories('');
    setAvgHR(''); setMaxHR(''); setNote('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, duration, distance, distUnit, steps, calories, avgHR, maxHR, note, addActivity]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(l.deleteEntry, l.deleteActivityMsg, [
      { text: l.cancel, style: 'cancel' },
      {
        text: l.delete, style: 'destructive', onPress: () => {
          deleteActivity(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteActivity, l]);

  const s = styles(colors);

  return (
    <ScreenContainer>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}>
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={s.title}>{l.activityTitle}</Text>
        <Pressable
          onPress={handleSync}
          style={({ pressed }) => [s.syncBtn, pressed && { opacity: 0.6 }]}
          disabled={isSyncing}
        >
          {isSyncing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={s.syncBtnText}>{l.syncBtn}</Text>
          }
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Weather Context Banner — shown when navigated from Dashboard weather card ── */}
        {hasWeatherContext && (
          <View style={{
            marginHorizontal: 16,
            marginTop: 12,
            borderRadius: 10,
            backgroundColor: 'rgba(14,165,233,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(14,165,233,0.35)',
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <Text style={{ fontSize: 16 }}>🌤️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0EA5E9' }}>Outdoor Conditions</Text>
              {(weatherCondition || weatherReadiness) ? (
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                  {[weatherCondition, weatherReadiness].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
        )}
        {/* ── City Search / Pinned City ─────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {/* Pinned city chip or search toggle */}
          {pinnedCity ? (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(14,165,233,0.12)',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: 'rgba(14,165,233,0.35)',
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginBottom: 8,
              gap: 8,
            }}>
              <Text style={{ fontSize: 14 }}>📍</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#0EA5E9' }}>
                {pinnedCity.name}{pinnedCity.country ? `, ${pinnedCity.country}` : ''}
              </Text>
              <Pressable
                onPress={handleClearCity}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
              >
                <Text style={{ fontSize: 12, color: colors.muted }}>✕ Auto-detect</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowCitySearch(v => !v)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14 }}>🔍</Text>
              <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>{l.citySearchPlaceholder}</Text>
              <Text style={{ fontSize: 11, color: colors.primary }}>{showCitySearch ? l.citySearchCancel : l.citySearchSet}</Text>
            </Pressable>
          )}

          {/* City search input + results */}
          {showCitySearch && !pinnedCity && (
            <View style={{ marginBottom: 8 }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.primary,
                paddingHorizontal: 12,
                paddingVertical: 8,
                gap: 8,
                marginBottom: 4,
              }}>
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: colors.foreground }}
                  value={cityQuery}
                  onChangeText={handleCityQueryChange}
                  placeholder={l.cityPlaceholder ?? 'City name…'}
                  placeholderTextColor={colors.muted}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                {citySearching && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              {cityResults.length > 0 && (
                <ScrollView
                  scrollEnabled={false}
                  keyboardShouldPersistTaps="always"
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: 'hidden',
                  }}
                >
                  {cityResults.slice(0, 5).map((city, idx) => (
                    <Pressable
                      key={`${city.name}-${city.latitude}-${idx}`}
                      onPress={() => handleSelectCity(city)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderBottomWidth: idx < Math.min(cityResults.length, 5) - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.border : 'transparent',
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>
                        {city.name}{city.admin1 ? `, ${city.admin1}` : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                        {city.country ?? ''}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        {/* ── Weather Badge ─────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16 }}>
          <WeatherBadge activityType={selectedType} />
        </View>
        {/* ── Momentum Card ─────────────────────────────────────────────── */}
        <MomentumCard
          steps={todaySteps}
          goal={stepGoal}
          streak={streakDays}
          message={smartMessage}
        />
        <View style={s.card}>
          {/* Allergy-style dictation box */}
          <DictationBox
            ref={dictationRef}
            formKey="activity"
            label={l.dictateActivityLabel}
            placeholder={l.dictateActivityPlaceholder}
            value={dictationText}
            onChangeText={setDictationText}
            onSubmit={handleDictationSubmit}
            isParsing={dictationParsing}
            colors={colors}
          />
          {dictationParsing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.muted }}>{db.parsing}</Text>
            </View>
          )}
          {scribeResult && (
            <View style={{ backgroundColor: activeConfig.color + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: activeConfig.color + '44' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: activeConfig.color }}>✓ Filled {scribeResult.filledCount}/{scribeResult.totalFields} · {scribeResult.confidence} confidence</Text>
                <TouchableOpacity onPress={() => { setScribeResult(null); setScribeError(null); setDictationText(''); }}>
                  <Text style={{ fontSize: 11, color: activeConfig.color }}>Try again</Text>
                </TouchableOpacity>
              </View>              <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>&quot;{scribeResult.transcript}&quot;</Text>             <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{scribeResult.reasoning}</Text>
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>Smart Scribe-extracted — please review all fields before saving.</Text>
            </View>
          )}
          {scribeError && (
            <View style={{ backgroundColor: colors.error + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.error + '44' }}>
              <Text style={{ fontSize: 12, color: colors.error }}>{scribeError}</Text>
              <TouchableOpacity onPress={() => setScribeError(null)} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: colors.error }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Activity Type Selector */}
          <Text style={s.sectionLabel}>{l.activityType}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              {ACTIVITY_TYPES.map(a => (
                <Pressable
                  key={a.type}
                  onPress={() => setSelectedType(a.type)}
                  style={({ pressed }) => [
                    s.typeBtn,
                    selectedType === a.type && { backgroundColor: a.color + '22', borderColor: a.color },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={s.typeIcon}>{a.icon}</Text>
                  <Text style={[s.typeLabel, selectedType === a.type && { color: a.color, fontWeight: '700' }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Duration (required) */}
          <Text style={s.sectionLabel}>{l.duration}</Text>
          <View style={s.durationRow}>
            <TextInput
              style={s.durationInput}
              value={duration}
              onChangeText={setDuration}
              placeholder="30"
              placeholderTextColor={colors.muted}
              keyboardType="default"
              returnKeyType="done"
              maxLength={4}
            />
            <Text style={s.durationUnit}>min</Text>
          </View>

          {/* Distance (if applicable) */}
          {activeConfig.showDistance && (
            <>
              <View style={s.distHeader}>
                <Text style={s.sectionLabel}>{l.distance}</Text>
                <View style={s.distUnitRow}>
                  {(['mi', 'km'] as DistUnit[]).map(u => (
                    <Pressable
                      key={u}
                      onPress={() => { setDistUnit(u); setDistance(''); }}
                      style={({ pressed }) => [s.distUnitBtn, distUnit === u && s.distUnitBtnActive, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={[s.distUnitLabel, distUnit === u && s.distUnitLabelActive]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={s.durationRow}>
                <TextInput
                  style={s.durationInput}
                  value={distance}
                  onChangeText={setDistance}
                  placeholder={distUnit === 'mi' ? '3.1' : '5.0'}
                  placeholderTextColor={colors.muted}
                  keyboardType="default"
                  returnKeyType="done"
                  maxLength={6}
                />
                <Text style={s.durationUnit}>{distUnit}</Text>
              </View>
            </>
          )}

          {/* Other metrics */}
          <Text style={[s.sectionLabel, { marginTop: 4 }]}>{l.additionalMetrics}</Text>
          <View style={s.fieldsRow}>
            {activeConfig.showSteps && (
              <SmallField label={l.steps} value={steps} onChangeText={setSteps} placeholder="5000" unit={l.steps.toLowerCase()} colors={colors} />
            )}
            <SmallField label={l.calories} value={calories} onChangeText={setCalories} placeholder="300" unit="kcal" colors={colors} />
            <SmallField label={l.avgHR} value={avgHR} onChangeText={setAvgHR} placeholder="145" unit="bpm" colors={colors} />
            <SmallField label={l.maxHR} value={maxHR} onChangeText={setMaxHR} placeholder="175" unit="bpm" colors={colors} />
          </View>

          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.muted, marginBottom: 4 }}>{l.noteLabel}</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={l.notePlaceholder}
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            maxLength={120}
            multiline
            blurOnSubmit={false}
          />          <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: -10, marginBottom: 10 }}>{note.length}/120</Text>

          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              s.saveBtn,
              { backgroundColor: activeConfig.color },
              pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Text style={s.saveBtnText}>{l.saveActivity}</Text>
          </Pressable>

          {/* Privacy note */}
          <View style={s.privacyNote}>
            <IconSymbol name="lock.fill" size={11} color="#10B981" />
            <Text style={s.privacyNoteText}>{l.activityOnDevice}</Text>
          </View>
        </View>

        <Text style={s.historyTitle}>{l.history}</Text>
        <FlatList
          data={records}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={s.empty}>{l.activityEmpty}</Text>
          }
          renderItem={({ item }) => {
            const cfg = ACTIVITY_TYPES.find(a => a.type === item.type)!;
            return (
              <View style={[s.row, { borderLeftWidth: 3, borderLeftColor: cfg?.color ?? colors.primary }]}>
                <View style={s.rowLeft}>
                  <View style={s.rowTopRow}>
                    <Text style={s.rowIcon}>{cfg?.icon ?? '🏃'}</Text>
                    <Text style={[s.rowType, { color: cfg?.color ?? colors.primary }]}>{cfg?.label ?? item.type}</Text>
                    <Text style={s.rowDuration}>{formatDuration(item.durationMinutes)}</Text>
                  </View>
                  <View style={s.pillRow}>
                    {item.distanceMiles !== undefined && <Text style={s.pill}>📍 {item.distanceMiles} mi</Text>}
                    {item.steps !== undefined && <Text style={s.pill}>👟 {item.steps.toLocaleString()} steps</Text>}
                    {item.caloriesBurned !== undefined && <Text style={s.pill}>🔥 {item.caloriesBurned} kcal</Text>}
                    {item.avgHeartRate !== undefined && <Text style={s.pill}>❤ {item.avgHeartRate} bpm avg</Text>}
                    {item.maxHeartRate !== undefined && <Text style={s.pill}>⬆ {item.maxHeartRate} bpm max</Text>}
                  </View>
                  <Text style={s.rowSub}>{formatDate(item.timestamp)}</Text>
                  {item.note ? <Text style={s.rowNote}>{item.note}</Text> : null}
                  {(item.source === 'healthkit' || item.source === 'health-connect') && (
                    <Text style={s.sourceBadge}>
                      {item.source === 'healthkit' ? '⌚ Apple Health' : '⌚ Apple Health'}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => handleDelete(item.id)}
                  style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.5 }]}
                >
                  <IconSymbol name="xmark" size={16} color={colors.error} />
                </Pressable>
              </View>
            );
          }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: c.foreground },
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: c.surfaceRaised, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', minWidth: 90 },
  typeIcon: { fontSize: 22, marginBottom: 4 },
  typeLabel: { fontSize: 12, fontWeight: '600', color: c.foregroundSub },
  durationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  durationInput: { flex: 1, fontSize: 36, fontWeight: '700', color: c.foreground, paddingVertical: 4, minWidth: 0 },
  durationUnit: { fontSize: 18, color: c.muted, marginLeft: 8, flexShrink: 0 },
  distHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  distUnitRow: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 8, padding: 2 },
  distUnitBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  distUnitBtnActive: { backgroundColor: c.primary },
  distUnitLabel: { fontSize: 12, fontWeight: '600', color: c.muted },
  distUnitLabelActive: { color: '#fff' },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  noteInput: { fontSize: 14, color: c.foreground, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  privacyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 },
  privacyNoteText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  historyTitle: { fontSize: 15, fontWeight: '700', color: c.foreground, marginHorizontal: 16, marginBottom: 10 },
  empty: { textAlign: 'center', color: c.muted, fontSize: 14, marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.surfaceRaised, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  rowLeft: { flex: 1 },
  rowTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rowIcon: { fontSize: 18 },
  rowType: { fontSize: 15, fontWeight: '700' },
  rowDuration: { fontSize: 13, color: c.muted, marginLeft: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  pill: { fontSize: 12, color: c.foregroundSub, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rowSub: { fontSize: 12, color: c.muted },
  rowNote: { fontSize: 12, color: c.foregroundSub, marginTop: 4, fontStyle: 'italic' },
  deleteBtn: { padding: 8 },
  sourceBadge: { fontSize: 11, color: c.muted, marginTop: 4, fontStyle: 'italic' },
  syncBtn: { height: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, minWidth: 70 },
  syncBtnText: { fontSize: 13, fontWeight: '600', color: c.primary },
  dictateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginBottom: 12, alignSelf: 'flex-start' },
  dictateBtnText: { fontSize: 14, fontWeight: '700' },
  dictationCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  dictationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dictationLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dictationHint: { fontSize: 10 },
  dictationInput: { fontSize: 14, minHeight: 72, paddingBottom: 8 },
  dictationSubmit: { alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, marginTop: 6 },
  dictationSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
