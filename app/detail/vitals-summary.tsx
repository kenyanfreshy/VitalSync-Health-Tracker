/**
 * Vital Signs Summary — Clinical Dashboard
 *
 * High-glanceability card layout for busy clinicians.
 * Displays the most recent readings for:
 *   • SpO₂ (oxygen saturation) — rounded to 1 decimal place
 *   • Heart Rate (bpm)
 *   • Blood Pressure (systolic / diastolic mmHg)
 *   • Body Temperature (°F / °C)
 *
 * Design principles:
 *   — Large primary values, high contrast, no decorative noise
 *   — Color-coded status badges (normal / warning / critical)
 *   — Timestamp on every card so the clinician knows data freshness
 *   — Trend arrow (↑↓→) based on last 2 readings
 *   — Tap any card to navigate to the full detail screen
 */

import React, { useMemo } from 'react';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { useHealth } from '@/lib/health/health-context';
import { useColors } from '@/hooks';
import type {} from '@/lib/health/types';

// roundSpO2: rounds SpO2 to nearest integer, clamped 0-100
const roundSpO2 = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

function fahrenheitToCelsius(f: number): number {
  return (f - 32) * 5 / 9;
}

type TrendDir = 'up' | 'down' | 'stable';
function trendArrow(dir: TrendDir): string {
  if (dir === 'up') return '↑';
  if (dir === 'down') return '↓';
  return '→';
}
function getTrend(values: number[]): TrendDir {
  if (values.length < 2) return 'stable';
  const diff = values[values.length - 1] - values[values.length - 2];
  if (Math.abs(diff) < 1) return 'stable';
  return diff > 0 ? 'up' : 'down';
}
/** Respiratory rate trend — uses ±2 br/min noise threshold (single-breath variation is clinically insignificant) */
function getTrendRR(values: number[]): TrendDir {
  if (values.length < 2) return 'stable';
  const diff = values[values.length - 1] - values[values.length - 2];
  if (Math.abs(diff) < 2) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type Status = 'normal' | 'warning' | 'critical' | 'unknown';

function spo2Status(val: number): Status {
  if (val >= 95) return 'normal';
  if (val >= 90) return 'warning';
  return 'critical';
}

function hrStatus(bpm: number): Status {
  if (bpm >= 60 && bpm <= 100) return 'normal';
  if (bpm >= 50 && bpm < 60) return 'warning';
  if (bpm > 100 && bpm <= 120) return 'warning';
  return 'critical';
}

function bpStatus(systolic: number, diastolic: number): Status {
  if (systolic < 90 || diastolic < 60) return 'critical';
  if (systolic < 120 && diastolic < 80) return 'normal';
  if (systolic < 130 && diastolic < 80) return 'warning';
  if (systolic < 140 || diastolic < 90) return 'warning';
  return 'critical';
}

function tempStatus(fahrenheit: number): Status {
  if (fahrenheit < 96.8) return 'critical';   // hypothermia
  if (fahrenheit < 99.5) return 'normal';
  if (fahrenheit < 100.4) return 'warning';   // low-grade fever
  return 'critical';                           // fever ≥ 100.4°F
}

// ─── Component ────────────────────────────────────────────────────────────────

function VitalsSummaryInner() {
  const router = useRouter();
  const colors = useColors();
  const { state } = useHealth();
  const { tempUnit } = useUnitPreferences();

  const statusColors: Record<Status, string> = {
    normal: colors.success,
    warning: colors.warning,
    critical: colors.error,
    unknown: colors.muted,
  };

  const statusLabels: Record<Status, string> = {
    normal: 'Normal',
    warning: 'Monitor',
    critical: 'Alert',
    unknown: 'No Data',
  };

  // ── SpO₂ ──────────────────────────────────────────────────────────────────
  const spo2Data = useMemo(() => {
    const records = (state.data?.vitalSigns ?? [])
      .filter(r => r.oxygenSaturation != null || r.spo2 != null)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = records[0];
    if (!latest) return null;
    const rawVal = latest.oxygenSaturation ?? latest.spo2 ?? 0;
    const value = roundSpO2(rawVal);
    const prev = records[1];
    const prevVal = prev ? roundSpO2(prev.oxygenSaturation ?? prev.spo2 ?? 0) : null;
    const trend = prevVal !== null ? getTrend([prevVal, value]) : 'stable';
    return { value, trend, timestamp: latest.timestamp, status: spo2Status(value) };
  }, [state.data?.vitalSigns]);

  // ── Heart Rate ────────────────────────────────────────────────────────────
  const hrData = useMemo(() => {
    const records = (state.data?.pulse ?? [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = records[0];
    if (!latest) return null;
    const prev = records[1];
    const trend = prev ? getTrend([prev.bpm, latest.bpm]) : 'stable';
    return { value: latest.bpm, trend, timestamp: latest.timestamp, status: hrStatus(latest.bpm) };
  }, [state.data?.pulse]);

  // ── Blood Pressure ────────────────────────────────────────────────────────
  const bpData = useMemo(() => {
    const records = (state.data?.bloodPressure ?? [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = records[0];
    if (!latest) return null;
    const prev = records[1];
    const trend = prev ? getTrend([prev.systolic ?? 0, latest.systolic ?? 0]) : 'stable';
    return {
      systolic: latest.systolic,
      diastolic: latest.diastolic,
      trend,
      timestamp: latest.timestamp,
      status: bpStatus(latest.systolic ?? 0, latest.diastolic ?? 0),
    };
  }, [state.data?.bloodPressure]);

  // ── Temperature ───────────────────────────────────────────────────────────
  const tempData = useMemo(() => {
    const records = (state.data?.vitalSigns ?? [])
      .filter(r => r.temperature != null)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = records[0];
    if (!latest || latest.temperature == null) return null;
    // Stored as °F; also show °C
    const fahrenheit = latest.temperature;
    const celsius = Math.round(fahrenheitToCelsius(fahrenheit) * 10) / 10;
    const prev = records[1];
    const trend = prev?.temperature != null ? getTrend([prev.temperature, fahrenheit]) : 'stable';
    return {
      fahrenheit: Math.round(fahrenheit * 10) / 10,
      celsius,
      trend,
      timestamp: latest.timestamp,
      status: tempStatus(fahrenheit),
    };
  }, [state.data?.vitalSigns]);


  const rrData = useMemo(() => {
    const records = (state.data?.vitalSigns ?? [])
      .filter(r => r.respiratoryRate != null)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = records[0];
    if (!latest || latest.respiratoryRate == null) return null;
    const rr = latest.respiratoryRate;
    const prev = records[1];
    const trend = prev?.respiratoryRate != null ? getTrendRR([prev.respiratoryRate, rr]) : 'stable';
    const status: Status =
      rr < 12 ? 'critical' :
      rr > 20 ? 'warning' :
      'normal';
    return { value: rr, trend, timestamp: latest.timestamp, status };
  }, [state.data?.vitalSigns]);

  const hasAnyData = spo2Data || hrData || bpData || tempData || rrData;

  function navigate(path: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {!hasAnyData && (
          <View style={[styles.emptyCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[styles.emptyIcon]}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No vital signs recorded</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              Log your vitals or sync Apple Health to see your personal summary here.
            </Text>
          </View>
        )}

        {/* SpO₂ */}
        {spo2Data && (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            onPress={() => navigate('/detail/spo2')}
            activeOpacity={0.75}
            accessibilityLabel={`SpO2 ${spo2Data.value}% — ${statusLabels[spo2Data.status]}`}
            accessibilityRole="button"
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLabelRow}>
                <View style={[styles.accentDot, { backgroundColor: colors.spo2Blue }]} />
                <Text style={[styles.cardLabel, { color: colors.muted }]}>SpO₂</Text>
              </View>
              <StatusBadge status={spo2Data.status} colors={statusColors} labels={statusLabels} />
            </View>
            <View style={styles.cardValueRow}>
              <Text style={[styles.cardValue, { color: colors.foreground }]}>
                {Math.round(spo2Data.value)}
              </Text>
              <Text style={[styles.cardUnit, { color: colors.muted }]}>%</Text>
              <TrendBadge dir={spo2Data.trend} colors={statusColors} />
            </View>
            <Text style={[styles.cardTime, { color: colors.muted }]}>
              {formatTimestamp(spo2Data.timestamp)}
            </Text>
            <View style={[styles.cardAccentBar, { backgroundColor: colors.spo2Blue }]} />
          </TouchableOpacity>
        )}

        {/* Heart Rate */}
        {hrData && (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            onPress={() => navigate('/detail/pulse')}
            activeOpacity={0.75}
            accessibilityLabel={`Heart Rate ${hrData.value} bpm — ${statusLabels[hrData.status]}`}
            accessibilityRole="button"
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLabelRow}>
                <View style={[styles.accentDot, { backgroundColor: colors.heartRed }]} />
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Heart Rate</Text>
              </View>
              <StatusBadge status={hrData.status} colors={statusColors} labels={statusLabels} />
            </View>
            <View style={styles.cardValueRow}>
              <Text style={[styles.cardValue, { color: colors.foreground }]}>
                {hrData.value}
              </Text>
              <Text style={[styles.cardUnit, { color: colors.muted }]}>bpm</Text>
              <TrendBadge dir={hrData.trend} colors={statusColors} />
            </View>
            <Text style={[styles.cardTime, { color: colors.muted }]}>
              {formatTimestamp(hrData.timestamp)}
            </Text>
            <View style={[styles.cardAccentBar, { backgroundColor: colors.heartRed }]} />
          </TouchableOpacity>
        )}

        {/* Blood Pressure */}
        {bpData && (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            onPress={() => navigate('/detail/blood-pressure')}
            activeOpacity={0.75}
            accessibilityLabel={`Blood Pressure ${bpData.systolic ?? '--'}/${bpData.diastolic ?? '--'} mmHg — ${statusLabels[bpData.status]}`}
            accessibilityRole="button"
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLabelRow}>
                <View style={[styles.accentDot, { backgroundColor: colors.bpGreen }]} />
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Blood Pressure</Text>
              </View>
              <StatusBadge status={bpData.status} colors={statusColors} labels={statusLabels} />
            </View>
            <View style={styles.cardValueRow}>
              <Text style={[styles.cardValue, { color: colors.foreground }]}>
                {bpData.systolic ?? '--'}
              </Text>
              <Text style={[styles.bpSeparator, { color: colors.muted }]}>/</Text>
              <Text style={[styles.cardValueSub, { color: colors.foreground }]}>
                {bpData.diastolic ?? '--'}
              </Text>
              <Text style={[styles.cardUnit, { color: colors.muted }]}>mmHg</Text>
              <TrendBadge dir={bpData.trend} colors={statusColors} />
            </View>
            <Text style={[styles.cardTime, { color: colors.muted }]}>
              {formatTimestamp(bpData.timestamp)}
            </Text>
            <View style={[styles.cardAccentBar, { backgroundColor: colors.bpGreen }]} />
          </TouchableOpacity>
        )}

        {/* Temperature */}
        {tempData && (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            onPress={() => navigate('/detail/temperature')}
            activeOpacity={0.75}
            accessibilityLabel={`Temperature ${tempUnit === "C" ? tempData.celsius.toFixed(1) + "°C" : tempData.fahrenheit + "°F"} — ${statusLabels[tempData.status]}`}
            accessibilityRole="button"
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLabelRow}>
                <View style={[styles.accentDot, { backgroundColor: colors.tempOrange }]} />
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Body Temperature</Text>
              </View>
              <StatusBadge status={tempData.status} colors={statusColors} labels={statusLabels} />
            </View>
            <View style={styles.cardValueRow}>
              <Text style={[styles.cardValue, { color: colors.foreground }]}>
                {tempUnit === 'C' ? tempData.celsius.toFixed(1) : tempData.fahrenheit.toFixed(1)}
              </Text>
              <Text style={[styles.cardUnit, { color: colors.muted }]}>°{tempUnit}</Text>
              <Text style={[styles.tempAlt, { color: colors.muted }]}>
                ({tempUnit === 'C' ? tempData.fahrenheit.toFixed(1) + ' °F' : tempData.celsius.toFixed(1) + ' °C'})
              </Text>
              <TrendBadge dir={tempData.trend} colors={statusColors} />
            </View>
            <Text style={[styles.cardTime, { color: colors.muted }]}>
              {formatTimestamp(tempData.timestamp)}
            </Text>
            <View style={[styles.cardAccentBar, { backgroundColor: colors.tempOrange }]} />
          </TouchableOpacity>
        )}


        {rrData && (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            onPress={() => navigate('/detail/vitals')}
            activeOpacity={0.8}
            accessibilityLabel={`Respiratory Rate ${rrData.value} breaths/min — ${statusLabels[rrData.status]}`}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLabelRow}>
                <View style={[styles.accentDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Resp. Rate</Text>
              </View>
              <StatusBadge status={rrData.status} colors={statusColors} labels={statusLabels} />
            </View>
            <View style={styles.cardValueRow}>
              <Text style={[styles.cardValue, { color: colors.foreground }]}>
                {Math.round(rrData.value)}
              </Text>
              <Text style={[styles.cardUnit, { color: colors.muted }]}>br/min</Text>
              <TrendBadge dir={rrData.trend} colors={statusColors} />
            </View>
            <Text style={[styles.cardTime, { color: colors.muted }]}>
              {formatTimestamp(rrData.timestamp)}
            </Text>
            <View style={[styles.cardAccentBar, { backgroundColor: colors.accent }]} />
          </TouchableOpacity>
        )}

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          For clinical reference only. Always verify readings with a calibrated device.
          All data is stored on-device.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({
  status,
  colors,
  labels,
}: {
  status: Status;
  colors: Record<Status, string>;
  labels: Record<Status, string>;
}) {
  const color = colors[status];
  return (
    <View style={[badgeStyles.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <View style={[badgeStyles.dot, { backgroundColor: color }]} />
      <Text style={[badgeStyles.label, { color }]}>{labels[status]}</Text>
    </View>
  );
}

function TrendBadge({ dir, colors }: { dir: TrendDir; colors: Record<Status, string> }) {
  const color = dir === 'up' ? colors.warning : dir === 'down' ? colors.warning : colors.normal;
  return (
    <Text style={[trendStyles.arrow, { color }]}>{trendArrow(dir)}</Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    marginBottom: 4,
    gap: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 14,
    overflow: 'hidden',
    gap: 4,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    // Android elevation
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  cardValue: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 54,
    letterSpacing: -1.5,
  },
  cardValueSub: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  cardUnit: {
    fontSize: 16,
    fontWeight: '500',
    paddingBottom: 6,
  },
  bpSeparator: {
    fontSize: 32,
    fontWeight: '300',
    paddingBottom: 2,
  },
  tempAlt: {
    fontSize: 14,
    fontWeight: '400',
    paddingBottom: 6,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

const trendStyles = StyleSheet.create({
  arrow: {
    fontSize: 20,
    fontWeight: '700',
    paddingBottom: 4,
  },
});

export default withDetailErrorBoundary(VitalsSummaryInner, 'Vitals Summary');
