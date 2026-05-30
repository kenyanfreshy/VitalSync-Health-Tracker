/**
 * ActivityReadinessCard
 *
 * Merges "Daily Readiness" and "Outdoor Conditions" into a single collapsible
 * GlassCard titled "Activity & Readiness".
 *
 * Collapsed state shows:
 *   Line 1: Today · Steps · Distance · Active Cal · Fiber
 *   Line 2: Readiness score · 🌙 Sleep · ❤️ Systolic
 *
 * Expanded state shows two side-by-side tappable tabs:
 *   🏃 Activity  — full WeatherDashboardCard content + activity row
 *   💪 Readiness — full ReadinessBanner content (score, bar, chips)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { GlassCard } from '@/components/glass-card';
import { useColorScheme, useColors, useDashboardStrings } from '@/hooks';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { useWeatherContext } from '@/lib/weather/weather-context';
import { getWeatherActivityMessage } from '@/lib/activity/get-weather-activity-message';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { DailyForecast, WeatherData, ActivityReadiness } from '@/lib/weather/weather-service';

// ─── Readiness helpers ────────────────────────────────────────────────────────

function getReadinessColor(score: number): string {
  if (score >= 85) return '#10B981';
  if (score >= 65) return '#3B82F6';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}
function getReadinessLabel(score: number): string {
  if (score >= 85) return 'Optimal';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}
function getReadinessEmoji(score: number): string {
  if (score >= 85) return '🟢';
  if (score >= 65) return '🔵';
  if (score >= 40) return '🟡';
  return '🔴';
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

const READINESS_COLORS: Record<ActivityReadiness, string> = {
  great:        '#22C55E',
  good:         '#84CC16',
  caution_rain: '#F59E0B',
  caution_heat: '#EF4444',
  caution_cold: '#60A5FA',
  caution_wind: '#F97316',
  indoor:       '#8B5CF6',
};

function uvLabel(uv: number): string {
  if (uv <= 2)  return 'Low';
  if (uv <= 5)  return 'Mod';
  if (uv <= 7)  return 'High';
  if (uv <= 10) return 'V.High';
  return 'Extreme';
}

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

interface ActivityInsight { icon: string; label: string; tip: string; color: string; }

function getActivityInsights(data: WeatherData): ActivityInsight[] {
  const { temperatureC, precipitationProbability: rain, windSpeedKmh: wind, readiness } = data;
  const insights: ActivityInsight[] = [];
  const runColor = (readiness === 'great' || readiness === 'good') ? '#22C55E' : '#F59E0B';
  let runTip = 'Good conditions for a run';
  if (rain >= 60) runTip = 'Rain likely — consider a treadmill';
  else if (temperatureC > 32) runTip = 'High heat — keep it short';
  else if (temperatureC < 2) runTip = 'Cold out — layer up';
  else if (wind > 40) runTip = 'Strong wind — adjust your pace';
  else if (readiness === 'great') runTip = '⚡ Prime running conditions';
  insights.push({ icon: '🏃', label: 'Running', tip: runTip, color: runColor });

  const walkColor = (readiness === 'great' || readiness === 'good') ? '#60A5FA' : '#F59E0B';
  let walkTip = 'Nice day for a walk';
  if (rain >= 70) walkTip = 'Bring an umbrella or go indoors';
  else if (temperatureC > 35) walkTip = 'Very warm — stay hydrated';
  else if (readiness === 'great') walkTip = '🌿 Great day for a walk';
  insights.push({ icon: '🚶', label: 'Walking', tip: walkTip, color: walkColor });

  const cycleColor = wind > 30 ? '#F59E0B' : (readiness === 'great' ? '#22C55E' : '#60A5FA');
  let cycleTip = 'Good conditions for cycling';
  if (wind > 50) cycleTip = 'Very windy — consider an indoor ride';
  else if (wind > 30) cycleTip = 'Breezy — expect more resistance';
  else if (rain >= 60) cycleTip = 'Wet roads — ride with care';
  else if (readiness === 'great') cycleTip = '⚡ Smooth conditions for cycling';
  insights.push({ icon: '🚴', label: 'Cycling', tip: cycleTip, color: cycleColor });

  return insights;
}

function DailyRow({
  item, useFahrenheit, useImperial, foreground, muted, border, isToday,
}: {
  item: DailyForecast; useFahrenheit: boolean; useImperial: boolean;
  foreground: string; muted: string; border: string; isToday: boolean;
}) {
  const highStr = useFahrenheit ? `${item.highF}°F` : `${item.highC}°C`;
  const lowStr  = useFahrenheit ? `${item.lowF}°F`  : `${item.lowC}°C`;
  const windStr = useImperial   ? `${item.windSpeedMph} mph` : `${item.windSpeedKmh} km/h`;
  return (
    <View style={[styles.dailyRow, { borderTopColor: border }]}>
      <Text style={[styles.dayLabel, { color: isToday ? foreground : muted, fontWeight: isToday ? '700' : '500' }]}>
        {item.dayLabel}
      </Text>
      <Text style={styles.dailyIcon}>{item.conditionIcon}</Text>
      <Text style={[styles.dailyCondition, { color: muted }]} numberOfLines={1}>{item.condition}</Text>
      <View style={styles.dailyStats}>
        {item.precipitationProbability > 10 && (
          <Text style={[styles.dailyStat, { color: '#60A5FA' }]}>🌧️ {item.precipitationProbability}%</Text>
        )}
        <Text style={[styles.dailyStat, { color: muted }]}>💨 {windStr}</Text>
        {item.uvIndex > 0 && (
          <Text style={[styles.dailyStat, { color: '#FBBF24' }]}>☀️ UV {item.uvIndex}</Text>
        )}
      </View>
      <View style={styles.tempRange}>
        <Text style={[styles.highTemp, { color: '#EF4444' }]}>{highStr}</Text>
        <Text style={[styles.tempSep, { color: muted }]}>/</Text>
        <Text style={[styles.lowTemp, { color: '#60A5FA' }]}>{lowStr}</Text>
      </View>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ActivityReadinessCardProps {
  /** collapsed / expanded state controlled by parent */
  collapsed: boolean;
  onToggle: () => void;
  /** Readiness score 0-100 */
  readinessScore: number;
  readinessLoading?: boolean;
  readinessHasData?: boolean;
  sleepHrs?: number | null;
  sleepEff?: number | null;
  bpSystolic?: number | null;
  onReadinessPress?: () => void;
  /** Activity summary for collapsed preview */
  todaySteps?: number | null;
  todayDistanceKm?: number | null;
  todayCalories?: number | null;
  todayFiber?: number | null;
  distanceUnits?: 'km' | 'mi';
  /** Yesterday's readiness score for trend arrow (↑ / ↓ / →) */
  yesterdayReadinessScore?: number | null;
  /** Injected activity row (steps ring, fiber ring etc.) */
  renderActivityRow?: () => React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityReadinessCard({
  collapsed,
  onToggle,
  readinessScore,
  readinessLoading = false,
  readinessHasData = false,
  sleepHrs,
  bpSystolic,
  onReadinessPress,
  todaySteps,
  todayDistanceKm,
  todayCalories,
  todayFiber,
  distanceUnits = 'km',
  yesterdayReadinessScore,
  renderActivityRow,
}: ActivityReadinessCardProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const router = useRouter();
  const { tempUnit, distanceUnit } = useUnitPreferences();
  const { weatherStatus, refresh, isRefreshing, pinnedCity } = useWeatherContext();

  const useFahrenheit = tempUnit === 'F';
  const useImperial   = distanceUnit === 'mi';

  const ds = useDashboardStrings();

  const [activeTab, setActiveTab] = useState<'activity' | 'readiness'>('activity');
  const tabOpacity = useSharedValue(1);
  const STORAGE_KEY = '@vitalsync/activity_readiness_active_tab';

  // Restore persisted tab on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'activity' || val === 'readiness') setActiveTab(val);
    }).catch(() => {});
  }, []);

  const fadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tabOpacity.value,
  }));

  // Readiness animation
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (readinessLoading || !readinessHasData) { progressAnim.setValue(0); return; }
    Animated.timing(progressAnim, { toValue: readinessScore / 100, duration: 900, useNativeDriver: false }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readinessScore, readinessLoading, readinessHasData]);

  const readinessAccent = readinessHasData ? getReadinessColor(readinessScore) : colors.muted;
  const readinessLabel  = readinessHasData ? getReadinessLabel(readinessScore) : 'No data';
  const readinessEmoji  = readinessHasData ? getReadinessEmoji(readinessScore) : '⚪';
  const barWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const readinessChips: { icon: string; value: string; color: string }[] = [];
  if (sleepHrs != null) readinessChips.push({ icon: '🌙', value: `${sleepHrs.toFixed(1)}h`, color: '#8B5CF6' });
  if (bpSystolic != null) readinessChips.push({ icon: '❤️', value: `${Math.round(bpSystolic)} sys`, color: '#EF4444' });

  // Weather
  const WEATHER_ACCENT = '#0EA5E9';
  const weatherOk = weatherStatus.status === 'success' || weatherStatus.status === 'stale';
  const d: WeatherData | null = weatherOk ? (weatherStatus as any).data : null;
  const weatherReadinessColor = d ? READINESS_COLORS[d.readiness] : WEATHER_ACCENT;
  const pinnedCityLabel = pinnedCity
    ? (pinnedCity.admin1 ? `${pinnedCity.name}, ${pinnedCity.admin1}` : `${pinnedCity.name}, ${pinnedCity.country}`)
    : null;

  // ── Collapsed preview values ──────────────────────────────────────────────
  const stepsStr    = todaySteps != null ? todaySteps.toLocaleString() : '—';
  const distStr     = todayDistanceKm != null
    ? distanceUnits === 'km'
      ? `${todayDistanceKm} km`
      : `${Math.round(todayDistanceKm * 0.621371 * 10) / 10} mi`
    : '—';
  const calStr      = todayCalories != null ? `${todayCalories} kcal` : '—';
  const fiberStr    = todayFiber != null ? `${todayFiber}g fiber` : '—';
  const scoreStr    = readinessHasData ? `${readinessScore}/100` : '—';
  // Trend arrow: compare today vs yesterday
  const trendArrow  = readinessHasData && yesterdayReadinessScore != null
    ? readinessScore > yesterdayReadinessScore + 2 ? ' ↑'
    : readinessScore < yesterdayReadinessScore - 2 ? ' ↓'
    : ' →'
    : '';
  const trendColor  = trendArrow === ' ↑' ? '#22C55E' : trendArrow === ' ↓' ? '#EF4444' : colors.muted;
  const sleepStr    = sleepHrs != null ? `🌙 ${sleepHrs.toFixed(1)}h` : '';
  const systolicStr = bpSystolic != null ? `❤️ ${Math.round(bpSystolic)} sys` : '';

  // ── Tab press ─────────────────────────────────────────────────────────────
  const handleTabPress = useCallback((tab: 'activity' | 'readiness') => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (collapsed) onToggle();
    if (tab === activeTab && !collapsed) return; // no-op if already active
    // Fade out → switch → fade in
    tabOpacity.value = withTiming(0, { duration: 100, easing: Easing.out(Easing.quad) }, () => {
      // Switch tab on JS thread after fade-out
    });
    setTimeout(() => {
      setActiveTab(tab);
      safeSetItem(STORAGE_KEY, tab).catch(() => {});
      tabOpacity.value = withTiming(1, { duration: 180, easing: Easing.in(Easing.quad) });
    }, 105);
  }, [activeTab, collapsed, onToggle, tabOpacity]);

  return (
    <GlassCard accentColor={WEATHER_ACCENT} noPadding style={styles.card}>
      {/* ── Header ── */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`Activity and Readiness, ${collapsed ? 'collapsed' : 'expanded'}`}
      >
        <Text style={styles.headerIcon}>🏃</Text>
        <View style={styles.headerCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{ds.activityDailyReadiness ?? `${ds.activity} & ${ds.readiness}`}</Text>
            {d?.fetchedAt ? (
              <Text style={[styles.lastUpdated, { color: colors.muted }]}>
                Updated {relativeTime(d.fetchedAt)}
              </Text>
            ) : null}
          </View>
          {collapsed ? (
            <>
              {/* Line 1: activity stats */}
              <Text style={[styles.previewLine, { color: colors.muted }]} numberOfLines={1}>
                Today · {stepsStr} steps · {distStr} · {calStr} · {fiberStr}
              </Text>
              {/* Line 2: readiness summary */}
              <Text style={[styles.previewLine2, { color: readinessAccent }]} numberOfLines={1}>
                Readiness {scoreStr}<Text style={{ color: trendColor }}>{trendArrow}</Text>{sleepStr ? `  ${sleepStr}` : ''}{systolicStr ? `  ${systolicStr}` : ''}
              </Text>
            </>
          ) : (
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              {d ? `📍 ${pinnedCityLabel ?? d.locationName}` : 'Tap a tab below'}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.readinessDot, { backgroundColor: readinessAccent }]} />
          <Text style={[styles.chevron, { color: WEATHER_ACCENT }]}>{collapsed ? '▸' : '▾'}</Text>
        </View>
      </Pressable>

      {/* ── Tab chips — always visible ── */}
      <View style={[styles.tabRow, { borderTopColor: colors.border }]}>
        {(['activity', 'readiness'] as const).map((tab) => {
          const isActive = activeTab === tab && !collapsed;
          const label = tab === 'activity' ? `🏃 ${ds.activity}` : `💪 ${ds.readiness}`;
          // Use readiness score color for the Readiness chip; weather accent for Activity
          const chipAccent = tab === 'readiness' ? readinessAccent : WEATHER_ACCENT;
          return (
            <Pressable
              key={tab}
              onPress={() => handleTabPress(tab)}
              style={[
                styles.tabChip,
                { borderColor: isActive ? chipAccent : colors.border },
                isActive && { backgroundColor: chipAccent + '18' },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabLabel, { color: isActive ? chipAccent : colors.muted }]}>
                {label}
              </Text>
              {isActive && <View style={[styles.tabUnderline, { backgroundColor: chipAccent }]} />}
            </Pressable>
          );
        })}
      </View>

      {/* ── Expanded body ── */}
      {!collapsed && (
        <Reanimated.View style={fadeAnimatedStyle}>
          {/* ── ACTIVITY TAB ── */}
          {activeTab === 'activity' && (
            <View style={styles.body}>
              {weatherStatus.status === 'idle' || weatherStatus.status === 'loading' ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={WEATHER_ACCENT} />
                  <Text style={[styles.loadingText, { color: colors.muted }]}>{ds.fetchingConditions}</Text>
                </View>
              ) : weatherStatus.status === 'error' ? (
                <Pressable onPress={refresh} style={styles.loadingRow}>
                  <Text style={[styles.loadingText, { color: colors.muted }]}>⚠️ {ds.weatherUnavailable} · </Text>
                  <Text style={[styles.loadingText, { color: WEATHER_ACCENT }]}>{ds.tapToRetryWeather}</Text>
                </Pressable>
              ) : d ? (
                <>
                  {/* Current conditions */}
                  <View style={[styles.currentRow, { borderColor: colors.border }]}>
                    <View style={styles.currentLeft}>
                      <Text style={[styles.currentTemp, { color: colors.foreground }]}>
                        {useFahrenheit ? `${d.temperatureF}°F` : `${d.temperatureC}°C`}
                      </Text>
                      {Math.abs(d.feelsLikeC - d.temperatureC) >= 2 && (
                        <Text style={[styles.feelsLike, { color: colors.muted }]}>
                          {ds.feelsLikeLabel} {useFahrenheit ? `${d.feelsLikeF}°F` : `${d.feelsLikeC}°C`}
                        </Text>
                      )}
                      <Text style={[styles.currentCondition, { color: colors.muted }]}>{d.condition}</Text>
                    </View>
                    <View style={styles.currentStats}>
                      <Text style={[styles.currentStat, { color: colors.foreground }]}>🌧️ {d.precipitationProbability}%</Text>
                      <Text style={[styles.currentStat, { color: colors.foreground }]}>
                        💨 {d.windDirectionArrow} {d.windDirectionLabel} {useImperial ? `${d.windSpeedMph} mph` : `${d.windSpeedKmh} km/h`}
                      </Text>
                      <Text style={[styles.currentStat, { color: colors.foreground }]}>💧 {d.humidity}%</Text>
                      {d.uvIndex > 0 && (
                        <Text style={[styles.currentStat, { color: colors.foreground }]}>☀️ UV {d.uvIndex} · {uvLabel(d.uvIndex)}</Text>
                      )}
                    </View>
                  </View>

                  {/* Outdoor readiness label */}
                  <View style={[styles.readinessRow, { backgroundColor: weatherReadinessColor + '18', borderColor: weatherReadinessColor + '44' }]}>
                    <Text style={[styles.readinessText, { color: weatherReadinessColor }]}>{d.readinessLabel}</Text>
                  </View>

                  {/* 3-day forecast */}
                  {d.dailyForecast.map((day, idx) => (
                    <DailyRow
                      key={day.date}
                      item={day}
                      useFahrenheit={useFahrenheit}
                      useImperial={useImperial}
                      foreground={colors.foreground}
                      muted={colors.muted}
                      border={colors.border}
                      isToday={idx === 0}
                    />
                  ))}

                  {/* Hero message */}
                  {(() => {
                    const msg = getWeatherActivityMessage(d.temperatureF, d.precipitationProbability, d.windSpeedMph, d.condition);
                    return msg ? (
                      <View style={[styles.heroMsgRow, { backgroundColor: weatherReadinessColor + '14', borderColor: weatherReadinessColor + '33' }]}>
                        <Text style={[styles.heroMsgText, { color: weatherReadinessColor }]}>{msg}</Text>
                      </View>
                    ) : null;
                  })()}

                  {/* Hourly strip */}
                  {d.hourlyForecast && d.hourlyForecast.length > 0 && (
                    <View style={[styles.hourlySection, { borderTopColor: colors.border }]}>
                      <Text style={[styles.sectionLabel, { color: colors.muted }]}>Next 6 Hours</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
                          {d.hourlyForecast.map((h, i) => (
                            <View key={i} style={[styles.hourlyPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
                              <Text style={[styles.hourlyTime, { color: colors.muted }]}>{h.hourLabel}</Text>
                              <Text style={styles.hourlyIcon}>{h.conditionIcon}</Text>
                              <Text style={[styles.hourlyTemp, { color: colors.foreground }]}>
                                {useFahrenheit ? `${h.temperatureF}°` : `${h.temperatureC}°`}
                              </Text>
                              {h.precipitationProbability > 20 && (
                                <Text style={[styles.hourlyRain, { color: '#60A5FA' }]}>💧{h.precipitationProbability}%</Text>
                              )}
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Outdoor insights */}
                  <View style={[styles.insightsSection, { borderTopColor: colors.border }]}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>{ds?.outdoorInsights ?? "Outdoor Insights"}</Text>
                    {getActivityInsights(d).map((insight, i) => (
                      <View key={i} style={[styles.insightRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                        <Text style={styles.insightIcon}>{insight.icon}</Text>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.insightLabel, { color: colors.foreground }]}>{insight.label}</Text>
                          <Text style={[styles.insightTip, { color: insight.color }]}>{insight.tip}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Footer */}
                  <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.muted }]}>
                      {weatherStatus.status === 'stale' || isRefreshing ? 'Updating…' : `Updated ${relativeTime(d.fetchedAt)}`}
                    </Text>
                    <TouchableOpacity onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.refreshBtn, { color: WEATHER_ACCENT }]}>↻ Refresh</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Plan Activity button */}
                  <TouchableOpacity
                    style={[styles.planBtn, { backgroundColor: WEATHER_ACCENT + '18', borderColor: WEATHER_ACCENT + '55' }]}
                    onPress={() => router.push({ pathname: '/log/activity' as any, params: { readiness: d.readinessLabel, condition: `${d.conditionIcon} ${d.condition}` } })}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.planBtnText, { color: WEATHER_ACCENT }]}>🏃 Plan Activity  ›</Text>
                  </TouchableOpacity>

                  {/* Activity row (steps/fiber rings etc.) */}
                  {renderActivityRow && (
                    <View style={[styles.activitySection, { borderTopColor: colors.border }]}>
                      <Text style={[styles.sectionLabel, { color: colors.muted }]}>{ds.todayLabel} {ds.activity}</Text>
                      {renderActivityRow()}
                    </View>
                  )}
                </>
              ) : (weatherStatus.status as string) === 'no-city' || (!pinnedCity && (weatherStatus.status as string) !== 'loading' && weatherStatus.status !== 'success' && weatherStatus.status !== 'stale') ? (
                // No city pinned and auto-detect unavailable
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/(tabs)/weather' as any);
                  }}
                  style={[styles.emptyCityCard, { backgroundColor: WEATHER_ACCENT + '10', borderColor: WEATHER_ACCENT + '33' }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyCityIcon}>📍</Text>
                  <Text style={[styles.emptyCityTitle, { color: colors.foreground }]}>{ds.noLocationSet}</Text>
                  <Text style={[styles.emptyCityBody, { color: colors.muted }]}>
                    {ds.addCityInWeatherBody}
                  </Text>
                  <View style={[styles.emptyCityBtn, { backgroundColor: WEATHER_ACCENT + '22', borderColor: WEATHER_ACCENT + '55' }]}>
                    <Text style={[styles.emptyCityBtnText, { color: WEATHER_ACCENT }]}>📍 {ds.addCityInWeatherBtn}  ›</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          )}

          {/* ── READINESS TAB ── */}
          {activeTab === 'readiness' && (
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onReadinessPress?.();
              }}
              style={({ pressed }) => [styles.readinessBody, pressed && { opacity: 0.82 }]}
              accessibilityRole="button"
              accessibilityLabel={`Daily Readiness: ${readinessHasData ? readinessScore + ' — ' + readinessLabel : 'No data yet'}`}
            >
              {/* Score badge */}
              <View style={[styles.scoreBadge, { backgroundColor: readinessAccent + '20', borderColor: readinessAccent + '50' }]}>
                {readinessLoading ? (
                  <ActivityIndicator size="small" color={readinessAccent} />
                ) : (
                  <>
                    <Text style={[styles.scoreNum, { color: readinessAccent }]}>{readinessHasData ? readinessScore : '—'}</Text>
                    <Text style={[styles.scoreMax, { color: readinessAccent + 'AA' }]}>/100</Text>
                  </>
                )}
              </View>

              {/* Centre: label + bar + chips */}
              <View style={styles.readinessCentre}>
                <View style={styles.labelRow}>
                  <Text style={[styles.readinessSectionLabel, { color: colors.muted }]}>{ds.dailyReadinessHeader?.toUpperCase()}</Text>
                  <Text style={styles.statusEmoji}>{readinessEmoji}</Text>
                  <Text style={[styles.statusLabel, { color: readinessAccent }]}>{readinessLabel}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
                  <Animated.View style={[styles.fill, { width: barWidth, backgroundColor: readinessAccent }]} />
                </View>
                {readinessChips.length > 0 && (
                  <View style={styles.chipsRow}>
                    {readinessChips.map((chip) => (
                      <View key={chip.icon} style={[styles.chip, { backgroundColor: chip.color + '18' }]}>
                        <Text style={styles.chipIcon}>{chip.icon}</Text>
                        <Text style={[styles.chipText, { color: chip.color }]}>{chip.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={[styles.readinessCta, { color: colors.muted }]}>{ds.tapToSeeFullBreakdown} →</Text>
              </View>

              {/* Chevron */}
              <View style={styles.chevronWrap}>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </View>
            </Pressable>
          )}
        </Reanimated.View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  headerIcon: { fontSize: 22 },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, flex: 1 },
  lastUpdated: { fontSize: 10, fontWeight: '500' },
  headerSub: { fontSize: 11, fontWeight: '500' },
  previewLine: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  previewLine2: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  readinessDot: { width: 8, height: 8, borderRadius: 4 },
  chevron: { fontSize: 14, fontWeight: '700' },

  // Tab chips
  tabRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 8,
  },
  tabChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },

  // Body
  body: { paddingBottom: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  loadingText: { fontSize: 13 },

  // Weather
  currentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  currentLeft: { gap: 2 },
  currentTemp: { fontSize: 28, fontWeight: '800' },
  feelsLike: { fontSize: 11 },
  currentCondition: { fontSize: 12 },
  currentStats: { gap: 3, alignItems: 'flex-end' },
  currentStat: { fontSize: 11 },
  readinessRow: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  readinessText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  dayLabel: { width: 36, fontSize: 12 },
  dailyIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  dailyCondition: { flex: 1, fontSize: 11 },
  dailyStats: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  dailyStat: { fontSize: 10 },
  tempRange: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70, justifyContent: 'flex-end' },
  highTemp: { fontSize: 12, fontWeight: '700' },
  tempSep: { fontSize: 11 },
  lowTemp: { fontSize: 12, fontWeight: '600' },
  heroMsgRow: {
    marginHorizontal: 14,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  heroMsgText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  hourlySection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 6 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 14 },
  hourlyPill: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
    minWidth: 52,
  },
  hourlyTime: { fontSize: 10 },
  hourlyIcon: { fontSize: 18 },
  hourlyTemp: { fontSize: 12, fontWeight: '700' },
  hourlyRain: { fontSize: 10 },
  insightsSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 6 },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  insightIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  insightLabel: { fontSize: 12, fontWeight: '700' },
  insightTip: { fontSize: 11 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    marginTop: 4,
  },
  footerText: { fontSize: 11 },
  refreshBtn: { fontSize: 12, fontWeight: '700' },
  planBtn: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  planBtnText: { fontSize: 13, fontWeight: '700' },
  activitySection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 6 },

  // Readiness tab body
  readinessBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  scoreBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoreNum: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  scoreMax: { fontSize: 9, fontWeight: '600', lineHeight: 12 },
  readinessCentre: { flex: 1, gap: 5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readinessSectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  statusEmoji: { fontSize: 10 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  track: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  chipsRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  chipIcon: { fontSize: 10 },
  chipText: { fontSize: 10, fontWeight: '600' },
  readinessCta: { fontSize: 10, marginTop: 2 },
  chevronWrap: { flexShrink: 0 },

  // No-city empty state
  emptyCityCard: {
    margin: 14,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyCityIcon: { fontSize: 32 },
  emptyCityTitle: { fontSize: 14, fontWeight: '700' },
  emptyCityBody: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  emptyCityBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyCityBtnText: { fontSize: 13, fontWeight: '700' },
});
