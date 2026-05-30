/**
 * Weather Tab Screen
 *
 * Premium weather screen for VitalSync.
 * City-based, no GPS permission required.
 *
 * Sections:
 *   1. Hero card — condition, temperature, feels-like, H/L, readiness label, hero message
 *   2. Hourly strip — next 6 hours (scrollable)
 *   3. 7-day daily forecast
 *   4. Activity insights — readiness breakdown per activity type
 *   5. City selector — search and pin a custom city
 *
 * No medical advice. Informational only.
 */

import { safeFormatTime } from '@/lib/utils';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,

  ActivityIndicator,
  StyleSheet,

} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import {
  fetchWeather,
  fetchWeatherForCity,
  searchCities,
  type WeatherData,
  type WeatherStatus,
  type CityResult,
  type ActivityReadiness,
} from '@/lib/weather/weather-service';
import { getWeatherActivityMessage } from '@/lib/activity/get-weather-activity-message';
import { useWeatherContext } from '@/lib/weather/weather-context';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useWeatherStrings } from '@/hooks/use-weather-strings';

// ─── Constants ────────────────────────────────────────────────────────────────

const CITY_STORAGE_KEY = '@vitalsync/weather_city';
const CACHE_KEY        = '@vitalsync/weather_tab_cache';
const CACHE_TTL_MS     = 30 * 60 * 1000; // 30 min

// ─── Readiness colour map ─────────────────────────────────────────────────────

const READINESS_COLOR: Record<ActivityReadiness, string> = {
  great:        '#22C55E',
  good:         '#60A5FA',
  caution_rain: '#F59E0B',
  caution_heat: '#F97316',
  caution_cold: '#818CF8',
  caution_wind: '#F59E0B',
  indoor:       '#EF4444',
};

const READINESS_ICON: Record<ActivityReadiness, string> = {
  great:        '✅',
  good:         '🟢',
  caution_rain: '🌧️',
  caution_heat: '🌡️',
  caution_cold: '❄️',
  caution_wind: '💨',
  indoor:       '🏠',
};

// ─── Activity-specific readiness tips ────────────────────────────────────────

interface ActivityInsight {
  icon: string;
  label: string;
  tip: string;
  color: string;
}

function getActivityInsights(data: WeatherData, ws: ReturnType<typeof useWeatherStrings>): ActivityInsight[] {
  const { temperatureC, precipitationProbability, windSpeedKmh, readiness } = data;
  const rain = precipitationProbability;
  const wind = windSpeedKmh;
  const temp = temperatureC;

  const insights: ActivityInsight[] = [];

  // Running
  const runColor = (readiness === 'great' || readiness === 'good') ? '#22C55E' : '#F59E0B';
  let runTip: string = ws.runGood;
  if (rain >= 60) runTip = ws.runRain;
  else if (temp > 32) runTip = ws.runHeat;
  else if (temp < 2) runTip = ws.runCold;
  else if (wind > 40) runTip = ws.runWind;
  else if (readiness === 'great') runTip = ws.runPrime;
  insights.push({ icon: '🏃', label: ws.runLabel, tip: runTip, color: runColor });

  // Walking
  const walkColor = (readiness === 'great' || readiness === 'good') ? '#60A5FA' : '#F59E0B';
  let walkTip: string = ws.walkGood;
  if (rain >= 70) walkTip = ws.walkRain;
  else if (temp > 35) walkTip = ws.walkHeat;
  else if (readiness === 'great') walkTip = ws.walkGreat;
  insights.push({ icon: '🚶', label: ws.walkLabel, tip: walkTip, color: walkColor });

  // Cycling
  const cycleColor = wind > 30 ? '#F59E0B' : (readiness === 'great' ? '#22C55E' : '#60A5FA');
  let cycleTip: string = ws.cycleGood;
  if (wind > 50) cycleTip = ws.cycleWind;
  else if (wind > 30) cycleTip = ws.cycleBreezy;
  else if (rain >= 60) cycleTip = ws.cycleWet;
  else if (readiness === 'great') cycleTip = ws.cyclePrime;
  insights.push({ icon: '🚴', label: ws.cycleLabel, tip: cycleTip, color: cycleColor });

  // Outdoor workout
  const workoutColor = readiness === 'indoor' ? '#EF4444' : (readiness === 'great' ? '#22C55E' : '#60A5FA');
  let workoutTip: string = ws.workoutGood;
  if (readiness === 'indoor') workoutTip = ws.workoutIndoor;
  else if (readiness === 'great') workoutTip = ws.workoutPrime;
  else if (readiness === 'caution_heat') workoutTip = ws.workoutHeat;
  insights.push({ icon: '💪', label: ws.workoutLabel, tip: workoutTip, color: workoutColor });

  return insights;
}

// ─── UV label helper ──────────────────────────────────────────────────────────

function uvLabel(uv: number, ws: ReturnType<typeof useWeatherStrings>): string {
  if (uv <= 2)  return ws.uvLow;
  if (uv <= 5)  return ws.uvModerate;
  if (uv <= 7)  return ws.uvHigh;
  if (uv <= 10) return ws.uvVeryHigh;
  return ws.uvExtreme;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WeatherTabScreen() {
  const colors    = useColors();
  const ws        = useWeatherStrings();
  const unitPrefs = useUnitPreferences();
  const useCelsius = unitPrefs.tempUnit === 'C';

  const [status, setStatus]         = useState<WeatherStatus>({ status: 'idle' });
  const [isRefreshing, setRefreshing] = useState(false);
  const [pinnedCity, setPinnedCity]  = useState<CityResult | null>(null);

  // City search state
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<CityResult[]>([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [showSearch, setShowSearch]       = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load pinned city from storage ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CITY_STORAGE_KEY);
        if (raw) setPinnedCity(JSON.parse(raw));
      } catch (_unused) {}
    })();
  }, []);

  // ── Fetch weather ─────────────────────────────────────────────────────────
  const loadWeather = useCallback(async (forceRefresh = false) => {
    // Try cache first
    if (!forceRefresh) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: WeatherStatus = JSON.parse(cached);
          if (
            (parsed.status === 'success') &&
            Date.now() - new Date(parsed.data.fetchedAt).getTime() < CACHE_TTL_MS
          ) {
            setStatus(parsed);
            return;
          }
          // Show stale while refreshing
          if (parsed.status === 'success') {
            setStatus({ status: 'stale', data: parsed.data });
          }
        }
      } catch (_unused) {}
    }

    setRefreshing(true);
    try {
      const result = pinnedCity
        ? await fetchWeatherForCity(pinnedCity)
        : await fetchWeather();
      setStatus(result);
      if (result.status === 'success') {
        await safeSetItem(CACHE_KEY, JSON.stringify(result)).catch(() => {});
      }
    } catch (_unused) {
      setStatus({ status: 'error', message: 'Unable to load weather' });
    } finally {
      setRefreshing(false);
    }
  }, [pinnedCity]);

  useEffect(() => {
    setStatus({ status: 'loading' });
    loadWeather();
  }, [pinnedCity]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── City search ───────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchCities(text);
        setSearchResults(results);
      } catch (_unused) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  // Shared weather context — keeps the dashboard WeatherDashboardCard in sync
  // when the user selects a city here without requiring a tab exit.
  const { pinCity: sharedPinCity, clearCity: sharedClearCity } = useWeatherContext();

  const handleSelectCity = useCallback(async (city: CityResult) => {
    setPinnedCity(city);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    // Update the shared context so the dashboard card refreshes immediately
    sharedPinCity(city).catch(() => {});
    try { await safeSetItem(CITY_STORAGE_KEY, JSON.stringify(city)); } catch (_unused) {}
  }, [sharedPinCity]);

  const handleClearCity = useCallback(async () => {
    setPinnedCity(null);
    sharedClearCity().catch(() => {});
    try { await AsyncStorage.removeItem(CITY_STORAGE_KEY); } catch (_unused) {}
  }, [sharedClearCity]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const data: WeatherData | null =
    (status.status === 'success' || status.status === 'stale') ? status.data : null;

  const isStale = status.status === 'stale';

  const heroMessage = data
    ? getWeatherActivityMessage(data.temperatureF, data.precipitationProbability, data.windSpeedMph, data.condition)
    : null;

  const s = styles(colors);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{ws.title}</Text>
            {data && (
              <Text style={s.headerSub} numberOfLines={1}>
                {data.locationName}
                {isStale ? ws.updatingDot : ''}
                {pinnedCity ? ' 📍' : ''}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {pinnedCity && (
              <Pressable
                onPress={handleClearCity}
                style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={s.headerBtnText}>{ws.autoBtn}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setShowSearch((v) => !v)}
              style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={s.headerBtnText}>{showSearch ? '✕' : ws.searchCityBtn}</Text>
            </Pressable>
            <Pressable
              onPress={() => loadWeather(true)}
              disabled={isRefreshing}
              style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.6 }]}
            >
              {isRefreshing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={s.headerBtnText}>↻</Text>
              }
            </Pressable>
          </View>
        </View>

        {/* ── City Search ─────────────────────────────────────────────── */}
        {showSearch && (
          <View style={s.searchContainer}>
            <TextInput
              style={[s.searchInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder={ws.searchPlaceholder}
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              returnKeyType="search"
            />
            {isSearching && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
            )}
            {searchResults.map((city, idx) => (
              <Pressable
                key={`${city.name}-${idx}`}
                onPress={() => handleSelectCity(city)}
                style={({ pressed }) => [s.searchResult, pressed && { opacity: 0.7 }]}
              >
                <Text style={[s.searchResultName, { color: colors.foreground }]}>
                  {city.name}
                </Text>
                <Text style={[s.searchResultSub, { color: colors.muted }]}>
                  {city.admin1 ? `${city.admin1}, ` : ''}{city.country}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Loading State ────────────────────────────────────────────── */}
        {status.status === 'loading' && (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.muted }]}>{ws.updatingDot.replace(' · ', '')}</Text>
          </View>
        )}

        {/* ── Error State ──────────────────────────────────────────────── */}
        {status.status === 'error' && (
          <View style={[s.errorCard, { backgroundColor: colors.surface, borderColor: colors.error + '44' }]}>
            <Text style={s.errorIcon}>⚠️</Text>
            <Text style={[s.errorText, { color: colors.foreground }]}>{status.message}</Text>
            <Pressable
              onPress={() => loadWeather(true)}
              style={({ pressed }) => [s.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={s.retryBtnText}>{ws.tryAgain}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Data sections (success or stale) ────────────────────────── */}
        {data && (
          <>
            {/* ── Hero Card ─────────────────────────────────────────── */}
            <HeroCard
              data={data}
              useCelsius={useCelsius}
              heroMessage={heroMessage ?? ''}
              colors={colors}
            />

            {/* ── Hourly Strip ──────────────────────────────────────── */}
            {data.hourlyForecast.length > 0 && (
              <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>{ws.next6Hours}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                    {data.hourlyForecast.map((h, i) => (
                      <View
                        key={i}
                        style={[s.hourlyPill, { backgroundColor: colors.background, borderColor: colors.border }]}
                      >
                        <Text style={[s.hourlyTime, { color: colors.muted }]}>{h.hourLabel}</Text>
                        <Text style={s.hourlyIcon}>{h.conditionIcon}</Text>
                        <Text style={[s.hourlyTemp, { color: colors.foreground }]}>
                          {useCelsius ? `${h.temperatureC}°` : `${h.temperatureF}°`}
                        </Text>
                        {h.precipitationProbability > 20 && (
                          <Text style={s.hourlyRain}>💧{h.precipitationProbability}%</Text>
                        )}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* ── 7-Day Forecast ────────────────────────────────────── */}
            <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>{ws.sevenDayOutlook}</Text>
              {data.dailyForecast.map((day, i) => (
                <View
                  key={i}
                  style={[
                    s.dailyRow,
                    i < data.dailyForecast.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[s.dailyDay, { color: colors.foreground, width: 48 }]}>{day.dayLabel}</Text>
                  <Text style={{ fontSize: 20, width: 32 }}>{day.conditionIcon}</Text>
                  <Text style={[s.dailyCondition, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
                    {day.condition}
                  </Text>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Text style={[s.dailyHigh, { color: colors.foreground }]}>
                        {useCelsius ? `${day.highC}°` : `${day.highF}°`}
                      </Text>
                      <Text style={[s.dailyLow, { color: colors.muted }]}>
                        {useCelsius ? `${day.lowC}°` : `${day.lowF}°`}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {day.precipitationProbability > 10 && (
                        <Text style={s.dailyMeta}>💧{day.precipitationProbability}%</Text>
                      )}
                      <Text style={s.dailyMeta}>☀️{day.uvIndex}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Activity Insights ─────────────────────────────────── */}
            <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>{ws.outdoorInsights}</Text>
              {getActivityInsights(data, ws).map((insight, i) => (
                <View
                  key={i}
                  style={[
                    s.insightRow,
                    i < 3 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={{ fontSize: 22, width: 32 }}>{insight.icon}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.insightLabel, { color: colors.foreground }]}>{insight.label}</Text>
                    <Text style={[s.insightTip, { color: insight.color }]}>{insight.tip}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Stat Pills Row ────────────────────────────────────── */}
            <View style={s.pillsRow}>
              <StatPill icon="💧" label={ws.statRain} value={`${data.precipitationProbability}%`} colors={colors} />
              <StatPill
                icon={`${data.windDirectionArrow}`}
                label={`${ws.statWind} ${data.windDirectionLabel}`}
                value={useCelsius ? `${data.windSpeedKmh} km/h` : `${data.windSpeedMph} mph`}
                colors={colors}
              />
              <StatPill icon="💦" label={ws.statHumidity} value={`${data.humidity}%`} colors={colors} />
              <StatPill icon="☀️" label={`${ws.statUV} · ${uvLabel(data.uvIndex, ws)}`} value={String(data.uvIndex)} colors={colors} />
            </View>

            {/* ── Footer ───────────────────────────────────────────── */}
            <Text style={[s.footer, { color: colors.muted }]}>
              {ws.dataSource} · {data.locationName}              {'\n'}{ws.updated} {safeFormatTime(data.fetchedAt, [], { hour: '2-digit', minute: '2-digit' })}           </Text>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({
  data,
  useCelsius,
  heroMessage,
  colors,
}: {
  data: WeatherData;
  useCelsius: boolean;
  heroMessage: string;
  colors: ReturnType<typeof useColors>;
}) {
  const ws = useWeatherStrings();
  const readinessColor = READINESS_COLOR[data.readiness];
  const readinessIcon  = READINESS_ICON[data.readiness];
  const temp  = useCelsius ? `${data.temperatureC}°C` : `${data.temperatureF}°F`;
  const feels = useCelsius ? `${data.feelsLikeC}°C` : `${data.feelsLikeF}°F`;
  const high  = useCelsius ? `${data.dailyHighC}°` : `${data.dailyHighF}°`;
  const low   = useCelsius ? `${data.dailyLowC}°` : `${data.dailyLowF}°`;

  const showFeels = useCelsius
    ? Math.abs(data.feelsLikeC - data.temperatureC) >= 2
    : Math.abs(data.feelsLikeF - data.temperatureF) >= 3;

  return (
    <View style={[
      heroStyles.card,
      {
        backgroundColor: colors.surface,
        borderColor: readinessColor + '55',
        shadowColor: readinessColor,
      },
    ]}>
      {/* Condition + temp */}
      <View style={heroStyles.topRow}>
        <Text style={heroStyles.conditionIcon}>{data.conditionIcon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[heroStyles.condition, { color: colors.muted }]}>{data.condition}</Text>
          <Text style={[heroStyles.temp, { color: colors.foreground }]}>{temp}</Text>
          {showFeels && (
            <Text style={[heroStyles.feelsLike, { color: colors.muted }]}>{ws.feelsLike} {feels}</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[heroStyles.hl, { color: colors.foreground }]}>{ws.highLabel}: {high}</Text>
          <Text style={[heroStyles.hl, { color: colors.muted }]}>{ws.lowLabel}: {low}</Text>
        </View>
      </View>

      {/* Readiness badge */}
      <View style={[heroStyles.readinessBadge, { backgroundColor: readinessColor + '18', borderColor: readinessColor + '44' }]}>
        <Text style={heroStyles.readinessIcon}>{readinessIcon}</Text>
        <Text style={[heroStyles.readinessLabel, { color: readinessColor }]}>{data.readinessLabel}</Text>
      </View>

      {/* Hero message */}
      <View style={[heroStyles.messageRow, { backgroundColor: readinessColor + '10', borderColor: readinessColor + '33' }]}>
        <Text style={[heroStyles.message, { color: readinessColor }]}>{heroMessage}</Text>
      </View>
    </View>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[pillStyles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={pillStyles.icon}>{icon}</Text>
      <Text style={[pillStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[pillStyles.label, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const heroStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
    padding: 18,
    gap: 12,
  },
  topRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  conditionIcon:  { fontSize: 56, lineHeight: 64 },
  condition:      { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  temp:           { fontSize: 48, fontWeight: '800', letterSpacing: -1, lineHeight: 54 },
  feelsLike:      { fontSize: 13, marginTop: 2 },
  hl:             { fontSize: 16, fontWeight: '600' },
  readinessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  readinessIcon:  { fontSize: 18 },
  readinessLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  messageRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  message: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
});

const pillStyles = StyleSheet.create({
  pill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 3,
  },
  icon:  { fontSize: 18 },
  value: { fontSize: 14, fontWeight: '700' },
  label: { fontSize: 10, textAlign: 'center' },
});

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    headerSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    headerBtn: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    // Search
    searchContainer: {
      marginHorizontal: 16,
      marginBottom: 8,
    },
    searchInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    searchResult: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    searchResultName: { fontSize: 15, fontWeight: '600' },
    searchResultSub:  { fontSize: 12, marginTop: 1 },
    // Loading / Error
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    loadingText: { fontSize: 14 },
    errorCard: {
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 16,
      borderWidth: 1,
      padding: 20,
      alignItems: 'center',
      gap: 10,
    },
    errorIcon: { fontSize: 32 },
    errorText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 8,
      marginTop: 4,
    },
    retryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    // Sections
    section: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    // Hourly
    hourlyPill: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: 'center',
      gap: 4,
      minWidth: 60,
    },
    hourlyTime: { fontSize: 11, fontWeight: '600' },
    hourlyIcon: { fontSize: 20 },
    hourlyTemp: { fontSize: 14, fontWeight: '700' },
    hourlyRain: { fontSize: 10, color: '#60A5FA' },
    // Daily
    dailyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 10,
    },
    dailyDay:       { fontSize: 14, fontWeight: '700' },
    dailyCondition: { fontSize: 12 },
    dailyHigh:      { fontSize: 14, fontWeight: '700' },
    dailyLow:       { fontSize: 14 },
    dailyMeta:      { fontSize: 11, color: '#9CA3AF' },
    // Insights
    insightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 10,
    },
    insightLabel: { fontSize: 14, fontWeight: '700' },
    insightTip:   { fontSize: 12, fontWeight: '500', lineHeight: 17 },
    // Pills
    pillsRow: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      gap: 8,
    },
    // Footer
    footer: {
      fontSize: 11,
      textAlign: 'center',
      marginTop: 16,
      marginHorizontal: 16,
      lineHeight: 17,
    },
  });
}
