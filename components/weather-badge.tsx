/**
 * WeatherBadge
 *
 * Compact premium glass card showing current outdoor conditions
 * and an activity readiness label. No location permission required.
 *
 * Features:
 * - Actual temp + "Feels like" line (when ≥ 2°C diff)
 * - UV index pill
 * - 6-hour forecast strip
 * - Activity-type-specific readiness tips
 * - AsyncStorage-backed stale-while-revalidate
 * - No medical advice
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useColors, useDashboardStrings } from '@/hooks';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { useWeather } from '@/lib/weather/use-weather';
import type { ActivityReadiness, WeatherData, HourlyForecast } from '@/lib/weather/weather-service';
import type { ActivityType } from '@/lib/health/types';

// ─── Readiness colour + icon map ─────────────────────────────────────────────

const READINESS_COLORS: Record<ActivityReadiness, string> = {
  great:        '#22C55E',
  good:         '#84CC16',
  caution_rain: '#F59E0B',
  caution_heat: '#EF4444',
  caution_cold: '#60A5FA',
  caution_wind: '#F97316',
  indoor:       '#8B5CF6',
};

const READINESS_ICONS: Record<ActivityReadiness, string> = {
  great:        '✅',
  good:         '👍',
  caution_rain: '🌧️',
  caution_heat: '🌡️',
  caution_cold: '🥶',
  caution_wind: '💨',
  indoor:       '🏠',
};

// ─── Activity-type-specific tips (informational only, no medical advice) ──────

type ActivityTipMap = Partial<Record<ActivityReadiness, string>>;

// ACTIVITY_TIPS are now built from i18n strings in the component

// getActivityTip is now a method that uses ds (passed as parameter)
function getActivityTipFromDs(
  activityType: ActivityType | undefined,
  readiness: ActivityReadiness,
  defaultLabel: string,
  ds: Record<string, string>,
): string {
  if (!activityType) return defaultLabel;
  // Convert activityType to camelCase prefix: 'outdoor-run' -> 'OutdoorRun'
  const typePart = activityType
    .split('-')
    .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  // Convert readiness to camelCase: 'caution_rain' -> 'Rain', 'great' -> 'Great'
  const readinessPart = readiness
    .split('_')
    .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const key = `actTip${typePart}${readinessPart}`;
  return ds[key] ?? defaultLabel;
}

// ─── UV index label (no medical advice) ──────────────────────────────────────

// uvLabel is now computed in the component using ds

// ─── Relative time helper ─────────────────────────────────────────────────────

// relativeTime is now computed in the component using ds

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ icon, value, textColor }: { icon: string; value: string; textColor: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

// ─── Hourly Chip ──────────────────────────────────────────────────────────────

function HourlyChip({
  item,
  useFahrenheit,
  foreground,
  muted,
  surface,
  border,
}: {
  item: HourlyForecast;
  useFahrenheit: boolean;
  foreground: string;
  muted: string;
  surface: string;
  border: string;
}) {
  const temp = useFahrenheit ? `${item.temperatureF}°F` : `${item.temperatureC}°C`;
  return (
    <View style={[styles.hourlyChip, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.hourlyTime, { color: muted }]}>{item.hourLabel}</Text>
      <Text style={styles.hourlyIcon}>{item.conditionIcon}</Text>
      <Text style={[styles.hourlyTemp, { color: foreground }]}>{temp}</Text>
      {item.precipitationProbability > 20 && (
        <Text style={[styles.hourlyPrecip, { color: '#60A5FA' }]}>
          {item.precipitationProbability}%
        </Text>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface WeatherBadgeProps {
  /** Compact mode: hides stat pills and hourly strip */
  compact?: boolean;
  /** Currently selected activity type — shows sport-specific readiness tip */
  activityType?: ActivityType;
}

export function WeatherBadge({ compact = false, activityType }: WeatherBadgeProps) {
  const colors = useColors();
  const ds = useDashboardStrings();

  // ── i18n helpers ──────────────────────────────────────────────────────────
  const uvLabelI18n = (uv: number): string => {
    if (uv <= 2)  return ds.uvLow ?? 'Low';
    if (uv <= 5)  return ds.uvModerate ?? 'Moderate';
    if (uv <= 7)  return ds.uvHigh ?? 'High';
    if (uv <= 10) return ds.uvVeryHigh ?? 'Very High';
    return ds.uvExtreme ?? 'Extreme';
  };

  const relativeTimeI18n = (iso: string): string => {
    const diffMs  = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1)  return ds.justNow ?? 'just now';
    if (diffMin < 60) return `${diffMin}${ds.minAgo ?? 'm ago'}`;
    return `${Math.floor(diffMin / 60)}${ds.hrsAgo ?? 'h ago'}`;
  };
  const { distanceUnit, tempUnit } = useUnitPreferences();
  const { weatherStatus, refresh, isRefreshing } = useWeather();
  const useFahrenheit = tempUnit === 'F';

  // ── Loading / idle (no cache available) ──────────────────────────────────
  if (weatherStatus.status === 'idle' || weatherStatus.status === 'loading') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            {ds.checkingConditions ?? 'Checking outdoor conditions…'}
          </Text>
        </View>
      </View>
    );
  }

  // ── Error (no cache to fall back on) ─────────────────────────────────────
  if (weatherStatus.status === 'error') {
    return (
      <Pressable
        style={[styles.card, styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={refresh}
      >
        <Text style={styles.bigIcon}>⚠️</Text>
        <View style={styles.infoBlock}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>{ds.weatherUnavailable}</Text>
          <Text style={[styles.infoSub, { color: colors.muted }]}>{ds.tapToRetryWeather}</Text>
        </View>
      </Pressable>
    );
  }

  // ── Success or Stale (data available) ────────────────────────────────────
  const d: WeatherData = weatherStatus.data;
  const isStale        = weatherStatus.status === 'stale';
  const readinessColor = READINESS_COLORS[d.readiness];
  const readinessIcon  = READINESS_ICONS[d.readiness];

  const windStr = distanceUnit === 'mi'
    ? `${d.windSpeedMph} mph`
    : `${d.windSpeedKmh} km/h`;

  const tempStr      = useFahrenheit ? `${d.temperatureF}°F` : `${d.temperatureC}°C`;
  const tempAltStr   = useFahrenheit ? `${d.temperatureC}°C` : `${d.temperatureF}°F`;
  const feelsStr     = useFahrenheit ? `${d.feelsLikeF}°F` : `${d.feelsLikeC}°C`;
  const feelsAltStr  = useFahrenheit ? `${d.feelsLikeC}°C` : `${d.feelsLikeF}°F`;

  const feelsLikeDiff = Math.abs(d.feelsLikeC - d.temperatureC);
  const showFeelsLike = feelsLikeDiff >= 2;

  const tipText = getActivityTipFromDs(activityType, d.readiness, d.readinessLabel, ds);

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={refresh}
      accessibilityRole="button"
      accessibilityLabel={`Weather in ${d.locationName}: ${d.condition}, ${d.temperatureC}°C. ${tipText}. Tap to refresh.`}
    >
      {/* ── Top row: location + updated time ── */}
      <View style={styles.topRow}>
        <View style={styles.locationRow}>
          <Text style={styles.pinIcon}>📍</Text>
          <Text style={[styles.locationName, { color: colors.muted }]} numberOfLines={1}>
            {d.locationName}
          </Text>
          {isStale && (
            <View style={[styles.staleBadge, { backgroundColor: colors.warning + '22', borderColor: colors.warning + '55' }]}>
              <Text style={[styles.staleText, { color: colors.warning }]}>{ds.updatingLabel ?? 'Updating…'}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.updatedAt, { color: colors.muted }]}>
          {isRefreshing ? (ds.refreshingLabel ?? 'Refreshing…') : `${ds.updatedLabel} ${relativeTimeI18n(d.fetchedAt)}`}
        </Text>
      </View>

      {/* ── Main row: condition icon + temp block + readiness badge ── */}
      <View style={styles.mainRow}>
        <Text style={styles.conditionIcon}>{d.conditionIcon}</Text>

        <View style={styles.mainCenter}>
          <Text style={[styles.temperature, { color: colors.foreground }]}>
            {tempStr}  ·  {tempAltStr}
          </Text>
          {showFeelsLike && (
            <Text style={[styles.feelsLike, { color: colors.muted }]}>
              {ds.feelsLikeLabel} {feelsStr} / {feelsAltStr}
            </Text>
          )}
          <Text style={[styles.condition, { color: colors.muted }]}>{d.condition}</Text>
        </View>

        <View style={[
          styles.readinessBadge,
          { backgroundColor: readinessColor + '22', borderColor: readinessColor + '55' },
        ]}>
          <Text style={styles.readinessIcon}>{readinessIcon}</Text>
          <Text style={[styles.readinessText, { color: readinessColor }]} numberOfLines={3}>
            {tipText}
          </Text>
        </View>
      </View>

      {/* ── Stat pills + hourly strip (hidden in compact mode) ── */}
      {!compact && (
        <>
          <View style={styles.statsRow}>
            <StatPill icon="🌧️" value={`${d.precipitationProbability}${ds.rainLabel ?? '% rain'}`} textColor={colors.foreground} />
            <StatPill icon="💨" value={windStr}                               textColor={colors.foreground} />
            <StatPill icon="💧" value={`${d.humidity}${ds.humidityLabel ?? '% humidity'}`}             textColor={colors.foreground} />
            {d.uvIndex > 0 && (
              <StatPill
                icon="☀️"
                value={`${ds.uvLabel ?? 'UV'} ${d.uvIndex} · ${uvLabelI18n(d.uvIndex)}`}
                textColor={colors.foreground}
              />
            )}
          </View>

          {d.hourlyForecast.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hourlyStrip}
            >
              {d.hourlyForecast.map((item) => (
                <HourlyChip
                  key={item.time}
                  item={item}
                  useFahrenheit={useFahrenheit}
                  foreground={colors.foreground}
                  muted={colors.muted}
                  surface={colors.background}
                  border={colors.border}
                />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  loadingText: { fontSize: 13 },
  bigIcon:    { fontSize: 28 },
  infoBlock:  { flex: 1, gap: 2 },
  infoTitle:  { fontSize: 14, fontWeight: '600' },
  infoSub:    { fontSize: 12 },
  // Top row
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  pinIcon:      { fontSize: 11 },
  locationName: { fontSize: 12, flex: 1 },
  updatedAt:    { fontSize: 11, marginLeft: 8 },
  staleBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  staleText: { fontSize: 10, fontWeight: '600' },
  // Main row
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conditionIcon: { fontSize: 36 },
  mainCenter:    { flex: 1, gap: 2 },
  temperature: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  feelsLike: { fontSize: 12, fontStyle: 'italic' },
  condition: { fontSize: 13 },
  // Readiness badge
  readinessBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    maxWidth: 115,
    gap: 4,
  },
  readinessIcon: { fontSize: 18 },
  readinessText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
  // Stat pills
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(128,128,128,0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statIcon:  { fontSize: 12 },
  statValue: { fontSize: 12, fontWeight: '500' },
  // Hourly strip
  hourlyStrip: {
    gap: 8,
    paddingVertical: 2,
  },
  hourlyChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 3,
    minWidth: 58,
  },
  hourlyTime:   { fontSize: 11, fontWeight: '500' },
  hourlyIcon:   { fontSize: 18 },
  hourlyTemp:   { fontSize: 12, fontWeight: '700' },
  hourlyPrecip: { fontSize: 10 },
});
