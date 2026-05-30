/**
 * EKG Waveform Viewer
 *
 * Full-screen scrollable/zoomable SVG trace for a single EKG recording.
 * Navigate to this screen with query params: id (EKG record id).
 * The record is looked up from the in-memory cache via fetchEKGPage.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks';
import { useDashboardStrings } from '@/hooks/use-dashboard-strings';
import { safeFormatDate } from '@/lib/utils';
import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Haptics from 'expo-haptics';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import {
  fetchEKGPage,
  fetchEKGVoltage,
  EKG_CLASSIFICATIONS,
  type EKGRecord,
} from '@/lib/health/ekg-store';

const ACCENT = '#EF4444';
const GRID_COLOR_LIGHT = '#FFCCCC';
const GRID_COLOR_DARK = '#3D1515';
const AXIS_COLOR_LIGHT = '#E0E0E0';
const AXIS_COLOR_DARK = '#333333';

// ─── Full waveform SVG ────────────────────────────────────────────────────────
function FullWaveformSVG({
  voltageMeasurements,
  color,
  isDark,
  containerWidth,
}: {
  voltageMeasurements: number[][];
  color: string;
  isDark: boolean;
  containerWidth: number;
}) {
  const vals = voltageMeasurements.map((v) => (Array.isArray(v) ? v[1] ?? 0 : 0));
  const n = vals.length;
  if (n < 2) return null;

  // Each sample is 0.5 ms apart at 512 Hz (Apple Watch EKG standard)
  // We render at ~2px per sample for readability, minimum containerWidth
  const PX_PER_SAMPLE = 2.5;
  const totalW = Math.max(containerWidth, n * PX_PER_SAMPLE);
  const H = 200;
  const PAD = { top: 24, bottom: 24, left: 8, right: 8 };
  const innerH = H - PAD.top - PAD.bottom;
  const innerW = totalW - PAD.left - PAD.right;

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const step = innerW / (n - 1);

  const points = vals
    .map((v, i) => {
      const x = PAD.left + i * step;
      const y = PAD.top + ((maxV - v) / range) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  // Horizontal grid lines every 20% of amplitude
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((frac) => {
    const y = PAD.top + frac * innerH;
    return (
      <Line
        key={frac}
        x1={PAD.left}
        y1={y}
        x2={totalW - PAD.right}
        y2={y}
        stroke={isDark ? GRID_COLOR_DARK : GRID_COLOR_LIGHT}
        strokeWidth={0.5}
      />
    );
  });

  // Vertical grid lines every 2 seconds (1024 samples at 512 Hz)
  const samplesPerSec = 512;
  const samplesPerGrid = samplesPerSec * 2;
  const vertLines: React.ReactElement[] = [];
  for (let i = samplesPerGrid; i < n; i += samplesPerGrid) {
    const x = PAD.left + i * step;
    vertLines.push(
      <Line
        key={i}
        x1={x}
        y1={PAD.top}
        x2={x}
        y2={H - PAD.bottom}
        stroke={isDark ? GRID_COLOR_DARK : GRID_COLOR_LIGHT}
        strokeWidth={0.5}
      />,
    );
    // Time label
    const sec = Math.round(i / samplesPerSec);
    vertLines.push(
      <SvgText
        key={`t${i}`}
        x={x}
        y={H - 6}
        fontSize={8}
        fill={isDark ? '#666' : '#AAA'}
        textAnchor="middle"
      >
        {sec}s
      </SvgText>,
    );
  }

  // Baseline
  const baselineY = PAD.top + (maxV / range) * innerH;

  return (
    <Svg width={totalW} height={H}>
      <Rect
        x={0}
        y={0}
        width={totalW}
        height={H}
        fill={isDark ? '#0A0A0A' : '#FAFAFA'}
      />
      {gridLines}
      {vertLines}
      <Line
        x1={PAD.left}
        y1={baselineY}
        x2={totalW - PAD.right}
        y2={baselineY}
        stroke={isDark ? AXIS_COLOR_DARK : AXIS_COLOR_LIGHT}
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Placeholder waveform (no voltage data) ───────────────────────────────────
function PlaceholderWaveform({
  color,
  isDark,
  containerWidth,
}: {
  color: string;
  isDark: boolean;
  containerWidth: number;
}) {
  const W = containerWidth;
  const H = 200;
  const midY = H / 2;
  // Generic ECG-like trace
  const pts = [
    `0,${midY}`, `${W * 0.08},${midY}`,
    `${W * 0.12},${midY - 8}`, `${W * 0.14},${midY + 16}`,
    `${W * 0.16},${midY - 40}`, `${W * 0.18},${midY + 24}`,
    `${W * 0.20},${midY - 8}`, `${W * 0.22},${midY}`,
    `${W * 0.30},${midY}`,
    `${W * 0.34},${midY - 12}`, `${W * 0.36},${midY + 8}`, `${W * 0.38},${midY}`,
    `${W * 0.50},${midY}`,
    `${W * 0.54},${midY - 8}`, `${W * 0.56},${midY + 16}`,
    `${W * 0.58},${midY - 40}`, `${W * 0.60},${midY + 24}`,
    `${W * 0.62},${midY - 8}`, `${W * 0.64},${midY}`,
    `${W * 0.72},${midY}`,
    `${W * 0.76},${midY - 12}`, `${W * 0.78},${midY + 8}`, `${W * 0.80},${midY}`,
    `${W},${midY}`,
  ].join(' ');
  return (
    <Svg width={W} height={H}>
      <Rect x={0} y={0} width={W} height={H} fill={isDark ? '#0A0A0A' : '#FAFAFA'} />
      <Polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
function EKGWaveformScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const ds = useDashboardStrings();
  const isDark = colors.background === '#151718' || colors.background.startsWith('#0') || colors.background.startsWith('#1');

  const [record, setRecord] = useState<EKGRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [voltageLoading, setVoltageLoading] = useState(false);
  const [voltageUnavailable, setVoltageUnavailable] = useState(false);
  const screenWidth = Dimensions.get('window').width;

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      // Step 1: fetch metadata only (classification, HR, frequency) — fast, no voltage
      const result = await fetchEKGPage(undefined, undefined, false);
      let found = result.records.find((r) => r.id === id) ?? null;
      if (!found) {
        const wider = await fetchEKGPage(undefined, new Date('2000-01-01'), false);
        found = wider.records.find((r) => r.id === id) ?? null;
      }
      setRecord(found);
      setLoading(false);

      // Step 2: load ~15 000 voltage data points on-demand for this specific recording
      // Only triggered when the user opens this waveform screen — never for the full list
      if (found) {
        setVoltageLoading(true);
        setVoltageUnavailable(false);
        try {
          const voltages = await fetchEKGVoltage(found.id);
          if (voltages && voltages.length >= 4) {
            // Convert flat number[] (mV readings) to [index, mV][] pairs for FullWaveformSVG
            const measurements: number[][] = voltages.map((mv, i) => [i, mv]);
            setRecord(prev => prev ? { ...prev, voltageMeasurements: measurements } : prev);
          } else {
            setVoltageUnavailable(true);
          }
        } catch {
          setVoltageUnavailable(true);
        } finally {
          setVoltageLoading(false);
        }
      }
    } catch {
      setRecord(null);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleBack() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }

  const meta = record ? EKG_CLASSIFICATIONS[record.classification] : null;

  return (
    <ScreenContainer>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={ACCENT} />
          <Text style={[styles.backText, { color: ACCENT }]}>
            {ds.ekgCard ?? 'EKG'}
          </Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {ds.ekgWaveformTitle ?? 'Waveform'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : !record ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {ds.ekgNoData ?? 'Recording not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ── Classification badge row ── */}
          <View style={styles.metaRow}>
            <View style={[styles.classificationBadge, { backgroundColor: meta!.color + '22', borderColor: meta!.color + '55' }]}>
              <IconSymbol name={meta!.icon as any} size={14} color={meta!.color} />
              <Text style={[styles.classificationText, { color: meta!.color }]}>
                {record.classification === 'SinusRhythm'
                  ? (ds.ekgSinusRhythm ?? meta!.label)
                  : record.classification === 'AtrialFibrillation'
                  ? (ds.ekgAtrialFibrillation ?? meta!.label)
                  : record.classification === 'Inconclusive'
                  ? (ds.ekgInconclusive ?? meta!.label)
                  : (ds.ekgUnclassified ?? meta!.label)}
              </Text>
            </View>
            <Text style={[styles.dateText, { color: colors.muted }]}>
              {safeFormatDate(record.startDate, {
                weekday: 'short', month: 'short', day: 'numeric',
                year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>

          {/* ── Stats row ── */}
          <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {record.averageHeartRate != null && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {Math.round(record.averageHeartRate)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>bpm</Text>
              </View>
            )}
            {record.samplingFrequency != null && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {record.samplingFrequency}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Hz</Text>
              </View>
            )}
            {record.voltageMeasurements != null && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {record.voltageMeasurements.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  {ds.ekgWaveformSamples ?? 'samples'}
                </Text>
              </View>
            )}
            {record.device != null && (
              <View style={[styles.statItem, { flex: 2 }]}>
                <Text style={[styles.statValue, { color: colors.foreground, fontSize: 12 }]} numberOfLines={1}>
                  {record.device}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  {ds.ekgDevice ?? 'Device'}
                </Text>
              </View>
            )}
          </View>

          {/* ── Waveform ── */}
          <View style={[styles.waveformCard, { backgroundColor: isDark ? '#0A0A0A' : '#FAFAFA', borderColor: colors.border }]}>
            <Text style={[styles.waveformLabel, { color: colors.muted }]}>
              {ds.ekgWaveformLabel ?? 'Lead I · mV over time'}
            </Text>
            {voltageLoading ? (
              <View style={styles.voltageLoader}>
                <ActivityIndicator size="small" color={meta!.color} />
                <Text style={[styles.noVoltageNote, { color: colors.muted, paddingTop: 8 }]}>
                  Loading waveform…
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={false}
                style={styles.waveformScroll}
              >
                {record.voltageMeasurements && record.voltageMeasurements.length >= 4 ? (
                  <FullWaveformSVG
                    voltageMeasurements={record.voltageMeasurements}
                    color={meta!.color}
                    isDark={isDark}
                    containerWidth={screenWidth - 32}
                  />
                ) : (
                  <PlaceholderWaveform
                    color={meta!.color}
                    isDark={isDark}
                    containerWidth={screenWidth - 32}
                  />
                )}
              </ScrollView>
            )}
            {!voltageLoading && voltageUnavailable && (
              <Text style={[styles.noVoltageNote, { color: colors.muted }]}>
                {ds.ekgWaveformNoVoltage ?? 'Voltage data not available for this recording. Apple Health stores EKG classification but may not expose raw voltage samples.'}
              </Text>
            )}
          </View>

          {/* ── Disclaimer ── */}
          <View style={[styles.disclaimer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.disclaimerText, { color: colors.muted }]}>
              {ds.ekgDisclaimer ?? 'VitalSync displays recordings from Apple Health but does not analyze them or check for signs of a heart attack.'}
            </Text>
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

export default function EKGWaveformScreen() {
  const { isPremium, requirePremium, PremiumGateSheet } = usePremiumGate({ fullScreen: true });
  React.useEffect(() => {
    if (!isPremium) {
      requirePremium(() => {}, { feature: 'EKG Analysis' })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);
  if (!isPremium) {
    return <>{PremiumGateSheet}</>;
  }
  return <EKGWaveformScreenInner />;
}
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 70,
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 70,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
    flexWrap: 'wrap',
  },
  classificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  classificationText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 16,
    flexWrap: 'wrap',
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  waveformCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  waveformLabel: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    letterSpacing: 0.3,
  },
  waveformScroll: {
    // no fixed height — SVG defines its own height
  },
  voltageLoader: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVoltageNote: {
    fontSize: 11,
    lineHeight: 16,
    padding: 14,
    paddingTop: 0,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  disclaimer: {
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
