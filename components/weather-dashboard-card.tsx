/**
 * WeatherDashboardCard
 *
 * A collapsible 3-day forecast card for the Dashboard, styled to match
 * the other GlassCard sections (Sleep, Vitals, Nutrition, etc.).
 *
 * Collapsed: shows location + current temp + condition icon + readiness badge
 * Expanded:  shows current conditions row + 3-day daily forecast rows
 *
 * No medical advice. All labels are informational only.
 */

import React from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useColors } from '@/hooks';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { useWeatherContext } from '@/lib/weather/weather-context';
import { getWeatherActivityMessage } from '@/lib/activity/get-weather-activity-message';
import type { DailyForecast, WeatherData, ActivityReadiness } from '@/lib/weather/weather-service';

// ─── Readiness colour map ─────────────────────────────────────────────────────

const READINESS_COLORS: Record<ActivityReadiness, string> = {
  great:        '#22C55E',
  good:         '#84CC16',
  caution_rain: '#F59E0B',
  caution_heat: '#EF4444',
  caution_cold: '#60A5FA',
  caution_wind: '#F97316',
  indoor:       '#8B5CF6',
};

// ─── UV label ─────────────────────────────────────────────────────────────────

function uvLabel(uv: number): string {
  if (uv <= 2)  return 'Low';
  if (uv <= 5)  return 'Mod';
  if (uv <= 7)  return 'High';
  if (uv <= 10) return 'V.High';
  return 'Extreme';
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

// ─── Daily row ────────────────────────────────────────────────────────────────

function DailyRow({
  item,
  useFahrenheit,
  useImperial,
  foreground,
  muted,
  border,
  isToday,
}: {
  item: DailyForecast;
  useFahrenheit: boolean;
  useImperial: boolean;
  foreground: string;
  muted: string;
  border: string;
  isToday: boolean;
}) {
  const highStr = useFahrenheit ? `${item.highF}°F` : `${item.highC}°C`;
  const lowStr  = useFahrenheit ? `${item.lowF}°F`  : `${item.lowC}°C`;
  const windStr = useImperial   ? `${item.windSpeedMph} mph` : `${item.windSpeedKmh} km/h`;

  return (
    <View style={[styles.dailyRow, { borderTopColor: border }]}>
      {/* Day label */}
      <Text style={[styles.dayLabel, { color: isToday ? foreground : muted, fontWeight: isToday ? '700' : '500' }]}>
        {item.dayLabel}
      </Text>

      {/* Condition icon */}
      <Text style={styles.dailyIcon}>{item.conditionIcon}</Text>

      {/* Condition label */}
      <Text style={[styles.dailyCondition, { color: muted }]} numberOfLines={1}>{item.condition}</Text>

      {/* Stats: precip · wind · UV */}
      <View style={styles.dailyStats}>
        {item.precipitationProbability > 10 && (
          <Text style={[styles.dailyStat, { color: '#60A5FA' }]}>🌧️ {item.precipitationProbability}%</Text>
        )}
        <Text style={[styles.dailyStat, { color: muted }]}>💨 {windStr}</Text>
        {item.uvIndex > 0 && (
          <Text style={[styles.dailyStat, { color: '#FBBF24' }]}>☀️ UV {item.uvIndex}</Text>
        )}
      </View>

      {/* High / Low */}
      <View style={styles.tempRange}>
        <Text style={[styles.highTemp, { color: '#EF4444' }]}>{highStr}</Text>
        <Text style={[styles.tempSep, { color: muted }]}>/</Text>
        <Text style={[styles.lowTemp, { color: '#60A5FA' }]}>{lowStr}</Text>
      </View>
    </View>
  );
}

// ─── Activity insights ───────────────────────────────────────────────────────

interface ActivityInsight {
  icon: string;
  label: string;
  tip: string;
  color: string;
}

function getActivityInsights(data: WeatherData): ActivityInsight[] {
  const { temperatureC, precipitationProbability: rain, windSpeedKmh: wind, readiness } = data;
  const insights: ActivityInsight[] = [];

  // Running
  const runColor = (readiness === 'great' || readiness === 'good') ? '#22C55E' : '#F59E0B';
  let runTip = 'Good conditions for a run';
  if (rain >= 60) runTip = 'Rain likely — consider a treadmill';
  else if (temperatureC > 32) runTip = 'High heat — keep it short';
  else if (temperatureC < 2) runTip = 'Cold out — layer up';
  else if (wind > 40) runTip = 'Strong wind — adjust your pace';
  else if (readiness === 'great') runTip = '⚡ Prime running conditions';
  insights.push({ icon: '🏃', label: 'Running', tip: runTip, color: runColor });

  // Walking
  const walkColor = (readiness === 'great' || readiness === 'good') ? '#60A5FA' : '#F59E0B';
  let walkTip = 'Nice day for a walk';
  if (rain >= 70) walkTip = 'Bring an umbrella or go indoors';
  else if (temperatureC > 35) walkTip = 'Very warm — stay hydrated';
  else if (readiness === 'great') walkTip = '🌿 Great day for a walk';
  insights.push({ icon: '🚶', label: 'Walking', tip: walkTip, color: walkColor });

  // Cycling
  const cycleColor = wind > 30 ? '#F59E0B' : (readiness === 'great' ? '#22C55E' : '#60A5FA');
  let cycleTip = 'Good conditions for cycling';
  if (wind > 50) cycleTip = 'Very windy — consider an indoor ride';
  else if (wind > 30) cycleTip = 'Breezy — expect more resistance';
  else if (rain >= 60) cycleTip = 'Wet roads — ride with care';
  else if (readiness === 'great') cycleTip = '⚡ Smooth conditions for cycling';
  insights.push({ icon: '🚴', label: 'Cycling', tip: cycleTip, color: cycleColor });

  // Outdoor workout
  const workoutColor = readiness === 'indoor' ? '#EF4444' : (readiness === 'great' ? '#22C55E' : '#60A5FA');
  let workoutTip = 'Good day for an outdoor session';
  if (readiness === 'indoor') workoutTip = 'Better indoors today';
  else if (readiness === 'great') workoutTip = '🔥 Perfect for an outdoor workout';
  else if (readiness === 'caution_heat') workoutTip = 'Warm — keep intensity moderate';
  insights.push({ icon: '💪', label: 'Outdoor Workout', tip: workoutTip, color: workoutColor });

  return insights;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WeatherDashboardCardProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Activity status for the collapsed header badge ('none' | 'logged') */
  activityStatus?: 'none' | 'logged';
  /** Rendered below the outdoor insights section when expanded */
  renderActivityRow?: () => React.ReactNode;
}

export function WeatherDashboardCard({ collapsed, onToggle, activityStatus = 'none', renderActivityRow }: WeatherDashboardCardProps) {
  const colors = useColors();
  const router = useRouter();
  const { tempUnit, distanceUnit } = useUnitPreferences();
  const { weatherStatus, refresh, isRefreshing, pinnedCity } = useWeatherContext();

  const useFahrenheit = tempUnit === 'F';
  const useImperial   = distanceUnit === 'mi';

  const ACCENT = '#0EA5E9'; // sky-500

  // ── Loading / idle ────────────────────────────────────────────────────────
  if (weatherStatus.status === 'idle' || weatherStatus.status === 'loading') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: ACCENT + '44' }]}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🌤️</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Outdoor Conditions</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={ACCENT} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Fetching conditions…</Text>
        </View>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (weatherStatus.status === 'error') {
    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={refresh}
      >
        <View style={styles.header}>
          <Text style={styles.headerIcon}>⚠️</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Weather unavailable</Text>
          <Text style={[styles.retryText, { color: ACCENT }]}>Tap to retry</Text>
        </View>
      </Pressable>
    );
  }

  // ── Success / Stale ───────────────────────────────────────────────────────
  const d: WeatherData = weatherStatus.data;
  const isStale        = weatherStatus.status === 'stale';
  const readinessColor = READINESS_COLORS[d.readiness];

  const tempStr   = useFahrenheit ? `${d.temperatureF}°F` : `${d.temperatureC}°C`;
  const highStr   = useFahrenheit ? `${d.dailyHighF}°F`   : `${d.dailyHighC}°C`;
  const lowStr    = useFahrenheit ? `${d.dailyLowF}°F`    : `${d.dailyLowC}°C`;
  const windStr   = useImperial   ? `${d.windSpeedMph} mph` : `${d.windSpeedKmh} km/h`;
  const feelsStr  = useFahrenheit ? `${d.feelsLikeF}°F`   : `${d.feelsLikeC}°C`;
  const feelsLikeDiff = Math.abs(d.feelsLikeC - d.temperatureC);

  // ── Pinned city label ──────────────────────────────────────────────────────
  const pinnedCityLabel = pinnedCity
    ? (pinnedCity.admin1 ? `${pinnedCity.name}, ${pinnedCity.admin1}` : `${pinnedCity.name}, ${pinnedCity.country}`)
    : null;

  // ── Weather-aware activity nudge (shown in collapsed header when no activity) ──
  const READINESS_NUDGE: Record<string, string> = {
    great:        '☀️ Great day for a run — log it',
    good:         '🌤️ Good conditions — get moving',
    caution_rain: '🌧️ Rainy — consider indoors',
    caution_heat: '🥵 Hot out — keep it short',
    caution_cold: '🥶 Cold — layer up before heading out',
    caution_wind: '💨 Windy — adjust your pace',
    indoor:       '🏠 Better indoors today',
  };
  const activityNudge = activityStatus === 'none'
    ? (READINESS_NUDGE[d.readiness] ?? "🏃 Log today's activity")
    : null;

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.surface,
        borderColor: ACCENT + '44',
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 6,
      },
    ]}>
      {/* ── Header row — tap to expand/collapse ── */}
      <Pressable
        onPress={onToggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`Outdoor Conditions, ${collapsed ? 'collapsed' : 'expanded'}. Tap to ${collapsed ? 'expand' : 'collapse'}.`}
      >
        <Text style={styles.headerIcon}>{d.conditionIcon}</Text>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Outdoor Conditions</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            📍 {pinnedCityLabel ?? d.locationName}  ·  {tempStr}  ·  H: {highStr} / L: {lowStr}
          </Text>
          {/* Weather-aware nudge — only when collapsed and no activity logged */}
          {collapsed && activityNudge && (
            <Text style={[styles.headerNudge, { color: readinessColor }]} numberOfLines={1}>
              {activityNudge}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.readinessDot, { backgroundColor: readinessColor }]} />
          {activityStatus === 'logged' ? (
            <Text style={{ fontSize: 11, color: '#22C55E', fontWeight: '700' }}>✓</Text>
          ) : (
            <Text style={{ fontSize: 11, color: '#6366F1', fontWeight: '700' }}>🏃</Text>
          )}
          <Text style={[styles.chevron, { color: ACCENT }]}>{collapsed ? '▸' : '▾'}</Text>
        </View>
      </Pressable>

      {/* ── Compact activity row — visible even when collapsed ── */}
      {collapsed && renderActivityRow && (
        <View style={[styles.collapsedActivityRow, { borderTopColor: colors.border }]}>
          {renderActivityRow()}
        </View>
      )}
      {/* ── Expanded body ── */}
      {!collapsed && (
        <View style={styles.body}>
          {/* Current conditions summary */}
          <View style={[styles.currentRow, { borderColor: colors.border }]}>
            <View style={styles.currentLeft}>
              <Text style={[styles.currentTemp, { color: colors.foreground }]}>{tempStr}</Text>
              {feelsLikeDiff >= 2 && (
                <Text style={[styles.feelsLike, { color: colors.muted }]}>Feels like {feelsStr}</Text>
              )}
              <Text style={[styles.currentCondition, { color: colors.muted }]}>{d.condition}</Text>
            </View>
            <View style={styles.currentStats}>
              <Text style={[styles.currentStat, { color: colors.foreground }]}>
                🌧️ {d.precipitationProbability}%
              </Text>
              <Text style={[styles.currentStat, { color: colors.foreground }]}>
                💨 {d.windDirectionArrow} {d.windDirectionLabel} {windStr}
              </Text>
              <Text style={[styles.currentStat, { color: colors.foreground }]}>
                💧 {d.humidity}%
              </Text>
              {d.uvIndex > 0 && (
                <Text style={[styles.currentStat, { color: colors.foreground }]}>
                  ☀️ UV {d.uvIndex} · {uvLabel(d.uvIndex)}
                </Text>
              )}
            </View>
          </View>

          {/* Readiness label */}
          <View style={[styles.readinessRow, { backgroundColor: readinessColor + '18', borderColor: readinessColor + '44' }]}>
            <Text style={[styles.readinessText, { color: readinessColor }]}>{d.readinessLabel}</Text>
          </View>

          {/* 3-day daily forecast */}
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
            const msg = getWeatherActivityMessage(
              d.temperatureF,
              d.precipitationProbability,
              d.windSpeedMph,
              d.condition,
            );
            return msg ? (
              <View style={[styles.heroMsgRow, { backgroundColor: readinessColor + '14', borderColor: readinessColor + '33' }]}>
                <Text style={[styles.heroMsgText, { color: readinessColor }]}>{msg}</Text>
              </View>
            ) : null;
          })()}

          {/* Hourly forecast strip */}
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

          {/* Outdoor activity insights */}
          <View style={[styles.insightsSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Outdoor Insights</Text>
            {getActivityInsights(d).map((insight, i) => (
              <View
                key={i}
                style={[
                  styles.insightRow,
                  i < 3 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <Text style={styles.insightIcon}>{insight.icon}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.insightLabel, { color: colors.foreground }]}>{insight.label}</Text>
                  <Text style={[styles.insightTip, { color: insight.color }]}>{insight.tip}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Footer: updated time + refresh */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.muted }]}>
              {isStale || isRefreshing ? 'Updating…' : `Updated ${relativeTime(d.fetchedAt)}`}
            </Text>
            <TouchableOpacity onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.refreshBtn, { color: ACCENT }]}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Plan Activity shortcut */}
          <TouchableOpacity
            style={[styles.planBtn, { backgroundColor: ACCENT + '18', borderColor: ACCENT + '55' }]}
            onPress={() => {
              router.push({
                pathname: '/log/activity' as any,
                params: {
                  readiness: d.readinessLabel,
                  condition: `${d.conditionIcon} ${d.condition}`,
                },
              });
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.planBtnText, { color: ACCENT }]}>🏃 Plan Activity  ›</Text>
          </TouchableOpacity>
          {/* ── Activity row (injected from Dashboard) ── */}
          {renderActivityRow && (
            <View style={[styles.activitySection, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>Today&apos;s Activity</Text>
              {renderActivityRow()}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  headerIcon:   { fontSize: 22 },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle:  { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  headerSub:    { fontSize: 11 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readinessDot: { width: 8, height: 8, borderRadius: 4 },
  chevron:      { fontSize: 13, fontWeight: '700' },
  retryText:    { fontSize: 12, fontWeight: '600', marginLeft: 'auto' },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  loadingText:  { fontSize: 13 },
  // Body
  body: { paddingBottom: 4 },
  currentRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  currentLeft:      { flex: 1, gap: 2 },
  currentTemp:      { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  feelsLike:        { fontSize: 11, fontStyle: 'italic' },
  currentCondition: { fontSize: 13 },
  currentStats:     { gap: 4, justifyContent: 'center' },
  currentStat:      { fontSize: 12 },
  // Readiness
  readinessRow: {
    marginHorizontal: 14,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  readinessText: { fontSize: 12, fontWeight: '600' },
  // Daily rows
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  dayLabel:       { width: 44, fontSize: 12 },
  dailyIcon:      { fontSize: 18, width: 28, textAlign: 'center' },
  dailyCondition: { flex: 1, fontSize: 11 },
  dailyStats:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  dailyStat:      { fontSize: 10 },
  tempRange:      { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 90, justifyContent: 'flex-end' },
  highTemp:       { fontSize: 12, fontWeight: '700' },
  tempSep:        { fontSize: 11 },
  lowTemp:        { fontSize: 12, fontWeight: '700' },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  footerText:  { fontSize: 11 },
  refreshBtn:  { fontSize: 12, fontWeight: '600' },
  // Plan Activity button
  planBtn: {
    marginHorizontal: 14,
    marginBottom: 12,
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  planBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  // Hero message
  heroMsgRow: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroMsgText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },
  // Section label
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  // Hourly strip
  hourlySection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  hourlyPill: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 52,
  },
  hourlyTime: { fontSize: 10, fontWeight: '600' },
  hourlyIcon: { fontSize: 18 },
  hourlyTemp: { fontSize: 13, fontWeight: '700' },
  hourlyRain: { fontSize: 9, fontWeight: '600' },
  // Insights
  insightsSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2, paddingBottom: 4 },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  insightIcon: { fontSize: 20, width: 28 },
  insightLabel: { fontSize: 13, fontWeight: '600' },
  insightTip:   { fontSize: 11 },
  // Activity section
  activitySection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 4,
  },
  // Collapsed activity row (always visible)
  collapsedActivityRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Weather-aware nudge text in collapsed header
  headerNudge: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
