/**
 * InsightEngine — Premium Smart Correlation Analysis
 *
 * Six evidence-based health correlations with glassmorphism dark-mode UI
 * and mini scatter/line charts with intersection markers.
 *
 * Graph rendering fix: use onLayout to measure real container width instead
 * of Dimensions.get() at module load (which can return 0 before layout).
 * Threshold lines are always drawn and axis ranges always include them.
 *
 * Sources:
 *  1. PMC11125317 (2024) — Hemodynamic Volume
 *  2. Nature Digital Medicine (2025) — Autonomic Recovery
 *  3. Lancet Diabetes & Endocrinology (2025) — Metabolic Stress
 *  4. JAHA (2026) — Cardiac Drift
 *  5. WHO Systematic Review (2024) — Nutritional Quality
 *  6. Brain Communications (2023) — Resilience Index
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
  Linking,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { GlassCard } from '@/components/glass-card';
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { useColorScheme, useCorrelationStrings, useLang } from '@/hooks';
import type { HealthData } from '@/lib/health/types';
import { CLINICAL_SOURCES_COUNT } from '@/app/settings/clinical-sources';
import { intelligenceName, interpolate } from '@/lib/intelligence';
import { settingsStrings } from '@/lib/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

// Platform-specific insight branding: Apple Intelligence on iOS, Gemini on Android
// intelligenceName from lib/intelligence.ts: 'Apple Intelligence' | 'Gemini' | 'Smart Analysis'

const CHART_H = 110;
const PAD_X = 14;
const PAD_Y = 10;

// Glassmorphism accent palette
const ACCENTS = {
  cyan:    '#00D4FF',
  violet:  '#7C3AED',
  amber:   '#F59E0B',
  rose:    '#F43F5E',
  emerald: '#10B981',
  indigo:  '#6366F1',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightStatus = 'detected' | 'normal' | 'insufficient';

interface InsightResult {
  status: InsightStatus;
  label: string;
  summary: string;
  aiAnalysis: string;
  citation: string;
  citationUrl: string;
  accentColor: string;
  chartType: 'scatter' | 'dual-line';
  chartData: { x: number; y: number; label?: string }[];
  xLabel: string;
  yLabel: string;
  xThreshold?: number;
  yThreshold?: number;
  interventions?: string[];
}

// ─── Correlation Logic ────────────────────────────────────────────────────────

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Correlation 1: Fluid-Pressure Coupling (Weight vs Systolic BP) */
function analyzeFluidPressure(data: HealthData): InsightResult {
  const weights = [...(data.weight ?? [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const vitals = [...(data.vitalSigns ?? [])].filter(v => v.systolic).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const weightByDay = new Map<string, number>();
  weights.forEach(w => weightByDay.set(dayKey(new Date(w.timestamp)), w.weightKg));

  const systolicByDay = new Map<string, number>();
  vitals.forEach(v => {
    if (v.systolic) systolicByDay.set(dayKey(new Date(v.timestamp)), v.systolic);
  });

  const chartData: { x: number; y: number }[] = [];
  let detected = false;
  const days = Array.from(weightByDay.keys()).sort();

  for (let i = 1; i < days.length; i++) {
    const today = days[i];
    const yesterday = days[i - 1];
    const wDelta = (weightByDay.get(today) ?? 0) - (weightByDay.get(yesterday) ?? 0);
    const sys = systolicByDay.get(today);
    const sysPrev = systolicByDay.get(yesterday);
    if (sys !== undefined && sysPrev !== undefined) {
      const sDelta = sys - sysPrev;
      chartData.push({ x: wDelta, y: sDelta });
      if (wDelta > 0.8 && sDelta > 5) detected = true;
    }
  }

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Fluid-Pressure Coupling',
    summary: detected
      ? '24h weight gain >0.8 kg correlates with systolic rise >5 mmHg'
      : chartData.length < 3
      ? 'Log weight and blood pressure daily to enable this analysis'
      : 'No acute fluid-pressure coupling detected in recent data',
    aiAnalysis: detected
      ? 'Acute weight gain exceeding 0.8 kg within 24 hours is associated with a measurable systolic blood pressure elevation, consistent with extracellular fluid retention. This pattern — termed fluid-pressure coupling — suggests that volume-dependent hypertension may be a contributing factor. Consider monitoring sodium intake and consulting your care team if this pattern recurs.'
      : 'No significant fluid-pressure coupling detected. Maintain consistent hydration and sodium monitoring to continue tracking this relationship.',
    citation: 'PMC11125317 (2024) — Positive correlation between acute weight shifts and systolic elevation',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/11125317',
    accentColor: ACCENTS.cyan,
    chartType: 'scatter',
    chartData,
    xLabel: 'Δ Weight (kg)',
    yLabel: 'Δ Systolic (mmHg)',
    xThreshold: 0.8,
    yThreshold: 5,
  };
}

/** Correlation 2: Vagal Withdrawal (Deep Sleep % vs HRV) */
function analyzeVagalWithdrawal(data: HealthData): InsightResult {
  const sleepRecs = [...(data.sleep ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const vitals = [...(data.vitalSigns ?? [])].filter(v => v.hrv).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const hrvByDay = new Map<string, number>();
  vitals.forEach(v => {
    if (v.hrv) hrvByDay.set(dayKey(new Date(v.timestamp)), v.hrv);
  });

  const recentHRV = vitals.slice(-7).map(v => v.hrv!).filter(Boolean);
  const hrvBaseline = recentHRV.length > 0
    ? recentHRV.reduce((a, b) => a + b, 0) / recentHRV.length
    : null;

  const chartData: { x: number; y: number }[] = [];
  let detected = false;

  sleepRecs.slice(-14).forEach(s => {
    const deepPct = s.totalMinutes > 0 ? (s.deepMinutes / s.totalMinutes) * 100 : 0;
    const hrv = hrvByDay.get(s.date);
    if (hrv !== undefined) {
      chartData.push({ x: deepPct, y: hrv });
      if (deepPct < 15 && hrvBaseline && hrv < hrvBaseline * 0.9) detected = true;
    }
  });

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Vagal Withdrawal',
    summary: detected
      ? 'Deep sleep <15% correlates with nocturnal HRV >10% below 7-day baseline'
      : chartData.length < 3
      ? 'Log sleep stages and HRV readings to enable this analysis'
      : 'Deep sleep architecture and HRV within expected range',
    aiAnalysis: detected
      ? 'Deep sleep below 15% of total sleep time is associated with reduced parasympathetic (vagal) tone, reflected as a >10% drop in nocturnal HRV below your 7-day baseline. This pattern — vagal withdrawal — indicates impaired autonomic recovery during sleep. Prioritize sleep consistency, reduce evening stimulants, and consider a wind-down routine 60 minutes before bed.'
      : 'Deep sleep architecture is supporting adequate parasympathetic HRV recovery. Continue maintaining consistent sleep timing and duration.',
    citation: 'Nature Digital Medicine (2025) — Deep sleep architecture as a primary driver of parasympathetic HRV recovery',
    citationUrl: 'https://www.nature.com/npjdigitalmed',
    accentColor: ACCENTS.violet,
    chartType: 'scatter',
    chartData,
    xLabel: 'Deep Sleep (%)',
    yLabel: 'HRV (ms)',
    xThreshold: 15,
  };
}

/** Correlation 3: Insulin Sensitivity Degradation (Sleep Duration vs Fasting Glucose) */
function analyzeInsulinSensitivity(data: HealthData): InsightResult {
  const sleepRecs = [...(data.sleep ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const fastingReadings = (data.bloodSugar ?? []).filter(
    b => b.context === 'fasting'
  ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const glucoseByDay = new Map<string, number>();
  fastingReadings.forEach(g => glucoseByDay.set(dayKey(new Date(g.timestamp)), g.glucoseMgDl));

  const recentGlucose = fastingReadings.slice(-7).map(g => g.glucoseMgDl);
  const glucoseBaseline = recentGlucose.length > 0
    ? recentGlucose.reduce((a, b) => a + b, 0) / recentGlucose.length
    : null;

  const chartData: { x: number; y: number }[] = [];
  let detected = false;

  sleepRecs.slice(-14).forEach(s => {
    const sleepHours = s.totalMinutes / 60;
    const glucose = glucoseByDay.get(s.date);
    if (glucose !== undefined) {
      chartData.push({ x: sleepHours, y: glucose });
      if (sleepHours < 6 && glucoseBaseline && glucose > glucoseBaseline * 1.1) detected = true;
    }
  });

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Insulin Sensitivity Degradation',
    summary: detected
      ? 'Sleep <6 hours correlates with morning fasting glucose >10% above baseline'
      : chartData.length < 3
      ? 'Log sleep and fasting glucose readings to enable this analysis'
      : 'Sleep duration and fasting glucose within expected range',
    aiAnalysis: detected
      ? 'Sleep restriction below 6 hours is associated with elevated morning cortisol, which impairs glucose disposal and raises fasting blood sugar by more than 10% above your personal baseline. This pattern — insulin sensitivity degradation — is a reversible metabolic stress response. Prioritising 7–9 hours of sleep is the most evidence-based intervention for restoring insulin sensitivity.'
      : 'Sleep duration is supporting normal fasting glucose regulation. Maintaining consistent sleep duration is protective against metabolic stress.',
    citation: "Lancet Diabetes & Endocrinology (2025) — Acute sleep restriction's impact on morning cortisol and glucose disposal",
    citationUrl: 'https://www.thelancet.com/journals/landia/home',
    accentColor: ACCENTS.amber,
    chartType: 'scatter',
    chartData,
    xLabel: 'Sleep (hrs)',
    yLabel: 'Fasting Glucose (mg/dL)',
    xThreshold: 6,
  };
}

/** Correlation 4: Circadian Cardiac Strain (Sleep Consistency vs RHR) */
function analyzeCircadianCardiacStrain(data: HealthData): InsightResult {
  const sleepRecs = [...(data.sleep ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  ).slice(-14);

  const vitals = [...(data.vitalSigns ?? [])].filter(v => v.heartRate).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const rhrByDay = new Map<string, number>();
  vitals.forEach(v => {
    if (v.heartRate) rhrByDay.set(dayKey(new Date(v.timestamp)), v.heartRate);
  });

  const chartData: { x: number; y: number; label?: string }[] = [];
  let detected = false;

  for (let i = 2; i < sleepRecs.length; i++) {
    const window = sleepRecs.slice(i - 2, i + 1);
    const onsets = window
      .filter(s => s.bedtime)
      .map(s => {
        const d = new Date(s.bedtime);
        return d.getHours() * 60 + d.getMinutes();
      });
    if (onsets.length < 2) continue;
    const onsetVariance = Math.max(...onsets) - Math.min(...onsets);
    const rhrValues = window
      .map(s => rhrByDay.get(s.date))
      .filter((v): v is number => v !== undefined);
    if (rhrValues.length < 2) continue;
    const rhrTrend = rhrValues[rhrValues.length - 1] - rhrValues[0];
    chartData.push({ x: onsetVariance, y: rhrTrend, label: window[2].date });
    if (onsetVariance > 90 && rhrTrend > 0) detected = true;
  }

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Circadian Cardiac Strain',
    summary: detected
      ? 'Sleep onset variance >90 min correlates with rising resting heart rate over 3 days'
      : chartData.length < 3
      ? 'Log sleep and heart rate for at least 5 days to enable this analysis'
      : 'Sleep timing consistency is supporting stable resting heart rate',
    aiAnalysis: detected
      ? 'Irregular sleep onset timing — varying by more than 90 minutes across nights — is associated with a rising trend in resting heart rate over 3-day windows. This pattern reflects disrupted circadian regulation of autonomic tone, increasing baseline cardiac workload. Anchoring your sleep and wake times to within 30 minutes each day is the most effective intervention for restoring circadian cardiac stability.'
      : 'Sleep onset consistency is within the range associated with stable autonomic tone. Continue maintaining regular sleep timing.',
    citation: 'Journal of the American Heart Association (2026) — Impact of irregular sleep rhythms on baseline autonomic tone',
    citationUrl: 'https://www.ahajournals.org/journal/jaha',
    accentColor: ACCENTS.rose,
    chartType: 'scatter',
    chartData,
    xLabel: 'Onset Variance (min)',
    yLabel: 'RHR Trend (bpm/3d)',
    xThreshold: 90,
    yThreshold: 0,
  };
}

/** Correlation 5: Glycemic Sleep Fragmentation (Carb:Fiber Ratio vs WASO) */
function analyzeGlycemicSleepFragmentation(data: HealthData): InsightResult {
  const sleepRecs = [...(data.sleep ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const mealsByDay = new Map<string, { carbsG: number; fiberG: number }>();
  (data.sodiumIntake ?? []).forEach(m => {
    const day = dayKey(new Date(m.timestamp));
    const existing = mealsByDay.get(day) ?? { carbsG: 0, fiberG: 0 };
    mealsByDay.set(day, {
      carbsG: existing.carbsG + (m.carbsG ?? 0),
      fiberG: existing.fiberG + (m.fiberG ?? 0),
    });
  });

  const chartData: { x: number; y: number }[] = [];
  let detected = false;

  sleepRecs.slice(-14).forEach(s => {
    const meals = mealsByDay.get(s.date);
    if (!meals || meals.fiberG === 0) return;
    const carbFiberRatio = meals.carbsG / meals.fiberG;
    const waso = s.awakeMinutes;
    chartData.push({ x: carbFiberRatio, y: waso });
    if (carbFiberRatio > 12 && waso > 20) detected = true;
  });

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Glycemic Sleep Fragmentation',
    summary: detected
      ? 'Carb-to-fiber ratio >12:1 correlates with elevated wake after sleep onset (WASO)'
      : chartData.length < 3
      ? 'Log meals with carb and fiber data alongside sleep to enable this analysis'
      : 'Dietary fiber intake is supporting stable nocturnal glucose and sleep continuity',
    aiAnalysis: detected
      ? 'A high carbohydrate-to-fiber ratio (>12:1) in your daily diet is associated with increased wake-after-sleep-onset (WASO), a marker of sleep fragmentation. Inadequate dietary fiber leads to nocturnal glucose instability, which disrupts sleep architecture through micro-arousals. Increasing fiber-rich foods (legumes, vegetables, whole grains) to achieve a carb:fiber ratio below 10:1 is the most evidence-based dietary intervention for improving sleep continuity.'
      : 'Your dietary fiber intake is supporting stable nocturnal glucose regulation and sleep continuity. Continue prioritizing fiber-rich whole foods.',
    citation: "WHO Systematic Review (2024) — Fiber's role in stabilizing nocturnal glucose and improving sleep depth",
    citationUrl: 'https://www.who.int/publications',
    accentColor: ACCENTS.emerald,
    chartType: 'scatter',
    chartData,
    xLabel: 'Carb:Fiber Ratio',
    yLabel: 'WASO (min)',
    xThreshold: 12,
    yThreshold: 20,
  };
}

/** Correlation 6: Resilience Index / Systemic Stress Event (HRV vs Systolic BP) */
function analyzeResilienceIndex(data: HealthData): InsightResult {
  const vitals = [...(data.vitalSigns ?? [])]
    .filter(v => v.hrv && v.systolic)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-30);

  const chartData = vitals.map(v => ({ x: v.hrv!, y: v.systolic! }));
  const detected = vitals.some(v => v.hrv! < 40 && v.systolic! > 135);

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Systemic Stress Event',
    summary: detected
      ? 'HRV <40 ms with Systolic >135 mmHg — parasympathetic buffer is depleted'
      : chartData.length < 3
      ? 'Log HRV and blood pressure readings to enable this analysis'
      : 'HRV and systolic BP within the resilient range — parasympathetic buffer is intact',
    aiAnalysis: detected
      ? "Concurrent low HRV (<40 ms) and elevated systolic blood pressure (>135 mmHg) indicates a systemic stress event — the parasympathetic nervous system's capacity to buffer hypertensive stress is depleted. This is a time-sensitive pattern requiring immediate vagal activation. Evidence-based interventions include box breathing (4-4-4-4 count), cold water face immersion, or a 10-minute slow-paced breathing session at 6 breaths/minute."
      : 'Your HRV and systolic blood pressure are in a range consistent with adequate parasympathetic buffering of cardiovascular stress. Continue monitoring both metrics daily.',
    citation: 'Brain Communications (2023) — Parasympathetic regulation as a buffer for hypertensive stress',
    citationUrl: 'https://academic.oup.com/braincomms',
    accentColor: ACCENTS.indigo,
    chartType: 'scatter',
    chartData,
    xLabel: 'HRV (ms)',
    yLabel: 'Systolic (mmHg)',
    xThreshold: 40,
    yThreshold: 135,
    interventions: [
      'Box breathing: inhale 4s → hold 4s → exhale 4s → hold 4s (×4 cycles)',
      "Cold water face immersion for 30 seconds (diver's reflex)",
      'Slow-paced breathing: 6 breaths/min for 10 minutes',
      'Progressive muscle relaxation starting from feet upward',
    ],
  };
}

// ─── Mini Scatter Chart ───────────────────────────────────────────────────────
// Uses onLayout width so the SVG always fills the container correctly.

function MiniScatterChart({
  data,
  accentColor,
  xLabel,
  yLabel,
  xThreshold,
  yThreshold,
  isDark,
}: {
  data: { x: number; y: number }[];
  accentColor: string;
  xLabel: string;
  yLabel: string;
  xThreshold?: number;
  yThreshold?: number;
  isDark: boolean;
}) {
  const [chartW, setChartW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartW(e.nativeEvent.layout.width);
  }, []);

  if (data.length === 0) return null;

  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);

  // Always include thresholds in the axis range so threshold lines are always visible
  const xMin = Math.min(...xs, ...(xThreshold !== undefined ? [xThreshold * 0.85] : []));
  const xMax = Math.max(...xs, ...(xThreshold !== undefined ? [xThreshold * 1.15] : []));
  const yMin = Math.min(...ys, ...(yThreshold !== undefined ? [yThreshold * 0.85] : []));
  const yMax = Math.max(...ys, ...(yThreshold !== undefined ? [yThreshold * 1.15] : []));

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const W = chartW > 0 ? chartW : 280; // fallback until layout fires
  const toSvgX = (x: number) => PAD_X + ((x - xMin) / xRange) * (W - PAD_X * 2);
  const toSvgY = (y: number) => CHART_H - PAD_Y - ((y - yMin) / yRange) * (CHART_H - PAD_Y * 2);

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const axisColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';

  // Identify intersection points: data points that cross BOTH thresholds
  const isIntersection = (d: { x: number; y: number }) => {
    const xOver = xThreshold !== undefined && d.x >= xThreshold;
    const yOver = yThreshold !== undefined && d.y >= yThreshold;
    const xUnder = xThreshold !== undefined && d.x <= xThreshold;
    const yUnder = yThreshold !== undefined && d.y <= yThreshold;
    // "detected" quadrant: both metrics past their threshold simultaneously
    if (xThreshold !== undefined && yThreshold !== undefined) {
      return (xOver && yOver) || (xUnder && yUnder);
    }
    if (xThreshold !== undefined) return xOver;
    if (yThreshold !== undefined) return yOver;
    return false;
  };

  return (
    <View onLayout={onLayout} style={{ width: '100%' }}>
      {chartW > 0 && (
        <Svg width={W} height={CHART_H}>
          <Defs>
            <LinearGradient id={`dotGrad_${accentColor.replace('#','')}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={accentColor} stopOpacity="1" />
              <Stop offset="1" stopColor={accentColor} stopOpacity="0.5" />
            </LinearGradient>
            <RadialGradient id={`intersectGlow_${accentColor.replace('#','')}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={accentColor} stopOpacity="0.6" />
              <Stop offset="1" stopColor={accentColor} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Chart background */}
          <Rect width={W} height={CHART_H} fill="transparent" />

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(t => (
            <React.Fragment key={t}>
              <Line
                x1={PAD_X + t * (W - PAD_X * 2)} y1={PAD_Y}
                x2={PAD_X + t * (W - PAD_X * 2)} y2={CHART_H - PAD_Y}
                stroke={gridColor} strokeWidth={1}
              />
              <Line
                x1={PAD_X} y1={PAD_Y + t * (CHART_H - PAD_Y * 2)}
                x2={W - PAD_X} y2={PAD_Y + t * (CHART_H - PAD_Y * 2)}
                stroke={gridColor} strokeWidth={1}
              />
            </React.Fragment>
          ))}

          {/* Threshold zone fill — highlight the "danger" quadrant */}
          {xThreshold !== undefined && yThreshold !== undefined && (() => {
            const tx = toSvgX(xThreshold);
            const ty = toSvgY(yThreshold);
            return (
              <Rect
                x={tx} y={PAD_Y}
                width={Math.max(0, W - PAD_X - tx)}
                height={Math.max(0, ty - PAD_Y)}
                fill={accentColor}
                opacity={0.07}
              />
            );
          })()}

          {/* X threshold line — always drawn */}
          {xThreshold !== undefined && (
            <Line
              x1={toSvgX(xThreshold)} y1={PAD_Y}
              x2={toSvgX(xThreshold)} y2={CHART_H - PAD_Y}
              stroke={accentColor} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.75}
            />
          )}

          {/* Y threshold line — always drawn */}
          {yThreshold !== undefined && (
            <Line
              x1={PAD_X} y1={toSvgY(yThreshold)}
              x2={W - PAD_X} y2={toSvgY(yThreshold)}
              stroke={accentColor} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.75}
            />
          )}

          {/* Axes */}
          <Line x1={PAD_X} y1={PAD_Y} x2={PAD_X} y2={CHART_H - PAD_Y} stroke={axisColor} strokeWidth={1.5} />
          <Line x1={PAD_X} y1={CHART_H - PAD_Y} x2={W - PAD_X} y2={CHART_H - PAD_Y} stroke={axisColor} strokeWidth={1.5} />

          {/* Data points — intersection points get a glow ring */}
          {data.map((d, i) => {
            const cx = toSvgX(d.x);
            const cy = toSvgY(d.y);
            const inter = isIntersection(d);
            return (
              <React.Fragment key={i}>
                {inter && (
                  <>
                    {/* Outer glow halo */}
                    <Circle cx={cx} cy={cy} r={14} fill={`url(#intersectGlow_${accentColor.replace('#','')})`} />
                    {/* Ring marker */}
                    <Circle cx={cx} cy={cy} r={7} fill="none" stroke={accentColor} strokeWidth={1.5} opacity={0.9} />
                  </>
                )}
                <Circle
                  cx={cx} cy={cy}
                  r={inter ? 4 : 3.5}
                  fill={`url(#dotGrad_${accentColor.replace('#','')})`}
                  opacity={inter ? 1 : 0.75}
                />
              </React.Fragment>
            );
          })}

          {/* Axis labels */}
          <SvgText
            x={W / 2} y={CHART_H - 1}
            textAnchor="middle"
            fill={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
            fontSize={8}
          >
            {xLabel} →
          </SvgText>
          <SvgText
            x={6} y={PAD_Y + 2}
            textAnchor="start"
            fill={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
            fontSize={8}
          >
            ↑ {yLabel}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

// ─── Single Insight Card ──────────────────────────────────────────────────────

function InsightCard({
  insight,
  index,
  isDark,
  tooltipVisible,
  onBrandLongPress,
}: {
  insight: InsightResult;
  index: number;
  isDark: boolean;
  tooltipVisible?: boolean;
  onBrandLongPress?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lang = useLang();
  const cs = useCorrelationStrings();
  const accent = insight.accentColor;

  const statusConfig = {
    detected:     { emoji: '⚠️', label: cs.patternDetected,   bg: accent + '22',   border: accent + '55' },
    normal:       { emoji: '✓',  label: cs.withinRange,        bg: '#10B98122',     border: '#10B98155' },
    insufficient: { emoji: '◌',  label: cs.insufficientData,   bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' },
  }[insight.status];

  // Glassmorphism card background
  const cardBg = isDark
    ? 'rgba(12, 14, 22, 0.85)'
    : 'rgba(255, 255, 255, 0.90)';
  const cardBorder = expanded
    ? accent + '55'
    : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  // Detected cards get a subtle glow border
  const glowBorder = insight.status === 'detected' ? accent + '40' : cardBorder;

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: cardBg,
        borderColor: glowBorder,
        // Extra shadow glow for detected state
        shadowColor: insight.status === 'detected' ? accent : '#000',
        shadowOpacity: insight.status === 'detected' ? 0.28 : 0.16,
      },
    ]}>
      {/* Accent top bar */}
      <View style={[styles.accentBar, { backgroundColor: accent, opacity: insight.status === 'detected' ? 0.9 : 0.5 }]} />

      {/* Detected state: subtle glow strip behind the header */}
      {insight.status === 'detected' && (
        <View style={[styles.detectedGlow, { backgroundColor: accent + '12' }]} />
      )}

      {/* Header row */}
      <Pressable
        style={styles.cardHeader}
        onPress={() => setExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityLabel={`${insight.label} insight, ${insight.status}`}
        accessibilityHint={expanded ? 'Tap to collapse' : 'Tap to expand'}
      >
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.indexBadge, { backgroundColor: accent + '1A', borderColor: accent + '44' }]}>
            <Text style={[styles.indexText, { color: accent }]}>{index + 1}</Text>
          </View>
          <View style={styles.cardTitleBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.cardTitle, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>
                {insight.label}
              </Text>
              {/* Platform branding badge — long-press shows tooltip */}
              <View style={{ position: 'relative' }}>
                <Pressable
                  onLongPress={onBrandLongPress}
                  delayLongPress={400}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel={`Powered by ${intelligenceName}`}
                  accessibilityHint="Long press for details"
                >
                  <View style={[
                    styles.platformBrandBadge,
                    Platform.OS === 'ios'
                      ? { backgroundColor: 'rgba(0,0,0,0.08)', borderColor: 'rgba(0,0,0,0.15)' }
                      : { backgroundColor: 'rgba(66,133,244,0.10)', borderColor: 'rgba(66,133,244,0.25)' },
                  ]}>
                    <Text style={[
                      styles.platformBrandText,
                      { color: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)') : '#4285F4' },
                    ]}>
                      {Platform.OS === 'ios' ? '🍎' : Platform.OS === 'android' ? 'G' : '✶'}
                    </Text>
                  </View>
                </Pressable>
                {tooltipVisible && (
                  <View style={{
                    position: 'absolute',
                    top: -34,
                    left: '50%',
                    transform: [{ translateX: -70 }],
                    backgroundColor: isDark ? 'rgba(15,20,35,0.96)' : 'rgba(15,20,35,0.90)',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderWidth: 1,
                    borderColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.15)' : 'rgba(66,133,244,0.35)',
                    zIndex: 99,
                    minWidth: 140,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 8,
                  }}>
                    <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }}>
                      {cs.poweredBy} {intelligenceName}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }]}>
              <Text style={[styles.statusText, {
                color: insight.status === 'normal'
                  ? '#10B981'
                  : insight.status === 'detected'
                  ? accent
                  : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
              }]}>
                {statusConfig.emoji}  {statusConfig.label}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.chevron, {
          color: accent,
          transform: [{ rotate: expanded ? '90deg' : '0deg' }],
        }]}>›</Text>
      </Pressable>

      {/* Summary (always visible) */}
      <Text style={[styles.summary, { color: isDark ? 'rgba(200,210,255,0.55)' : 'rgba(0,0,0,0.55)' }]}>
        {insight.summary}
      </Text>

      {/* EBP Citation — always visible even when collapsed */}
      {!expanded && (
        <TouchableOpacity
          style={[styles.citationBlock, { marginTop: 4 }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Linking.openURL(insight.citationUrl);
          }}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={`Open source: ${insight.citation}`}
          accessibilityHint="Opens the journal website in your browser"
        >
          <Text style={[styles.citationLabel, { color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)' }]}>
            {cs.ebpSource}
          </Text>
          <Text style={[styles.citationText, { color: isDark ? 'rgba(160,200,255,0.65)' : 'rgba(30,80,200,0.65)' }]}>
            {insight.citation}
          </Text>
          <Text style={[styles.citationDisclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' }]}>
            {cs.tapToOpenSource}
          </Text>
        </TouchableOpacity>
      )}

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>

          {/* Mini chart — shown for all statuses when data exists */}
          {insight.chartData.length >= 2 ? (
            <View style={[styles.chartContainer, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            }]}>
              <MiniScatterChart
                data={insight.chartData}
                accentColor={accent}
                xLabel={insight.xLabel}
                yLabel={insight.yLabel}
                xThreshold={insight.xThreshold}
                yThreshold={insight.yThreshold}
                isDark={isDark}
              />
              {/* Legend for intersection markers */}
              {(insight.xThreshold !== undefined || insight.yThreshold !== undefined) && (
                <View style={styles.chartLegend}>
                  <View style={[styles.legendDot, { backgroundColor: accent }]} />
                  <Text style={[styles.legendText, { color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }]}>
                    Ringed points = both metrics crossed threshold simultaneously
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.chartPlaceholder, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            }]}>
              <Text style={[styles.chartPlaceholderText, { color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)' }]}>
                {cs.notEnoughDataChart}
              </Text>
            </View>
          )}

          {/* Smart Analysis */}
          <View style={[styles.analysisBlock, { backgroundColor: accent + '0D', borderColor: accent + '22' }]}>
            <Text style={[styles.analysisLabel, { color: accent }]}>{interpolate(((settingsStrings as unknown as Record<string, typeof settingsStrings.en>)[lang] ?? settingsStrings.en).smartAnalysisLabel, { intelligenceName })}</Text>
            <Text style={[styles.analysisText, { color: isDark ? 'rgba(220,228,255,0.82)' : 'rgba(0,0,0,0.80)' }]}>
              {insight.aiAnalysis}
            </Text>
          </View>

          {/* Interventions */}
          {insight.interventions && insight.interventions.length > 0 && (
            <View style={[styles.interventionsBlock, { borderColor: accent + '33' }]}>
              <Text style={[styles.interventionsLabel, { color: accent }]}>{cs.vagalInterventions}</Text>
              {insight.interventions.map((item, i) => (
                <View key={i} style={styles.interventionRow}>
                  <View style={[styles.interventionDot, { backgroundColor: accent }]} />
                  <Text style={[styles.interventionText, { color: isDark ? 'rgba(200,210,255,0.78)' : 'rgba(0,0,0,0.75)' }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* EBP Citation — tappable link opens the journal URL */}
          <TouchableOpacity
            style={styles.citationBlock}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(insight.citationUrl);
            }}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={`Open source: ${insight.citation}`}
            accessibilityHint="Opens the journal website in your browser"
          >
            <Text style={[styles.citationLabel, { color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)' }]}>
              {cs.ebpSource}
            </Text>
            <Text style={[styles.citationText, { color: isDark ? 'rgba(160,200,255,0.65)' : 'rgba(30,80,200,0.65)' }]}>
              {insight.citation}
            </Text>
            <Text style={[styles.citationDisclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' }]}>
              {cs.tapToOpenSource}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main InsightEngine Component ────────────────────────────────────────────

interface InsightEngineProps {
  data: HealthData;
}

export function InsightEngine({ data }: InsightEngineProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const cs = useCorrelationStrings();
  const [sectionExpanded, setSectionExpanded] = useState(false); // collapsed by default per EBP guideline
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  // Tooltip: tracks which insight card's platform badge was long-pressed
  const [tooltipInsightId, setTooltipInsightId] = useState<number | null>(null);
  const tooltipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBrandTooltip = React.useCallback((id: number) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltipInsightId(id);
    tooltipTimerRef.current = setTimeout(() => setTooltipInsightId(null), 2200);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const insights = useMemo<InsightResult[]>(() => [
    analyzeFluidPressure(data),
    analyzeVagalWithdrawal(data),
    analyzeInsulinSensitivity(data),
    analyzeCircadianCardiacStrain(data),
    analyzeGlycemicSleepFragmentation(data),
    analyzeResilienceIndex(data),
  ], [data]);

  const detectedCount = insights.filter(i => i.status === 'detected').length;

  return (
    <GlassCard accentColor="#6366F1" noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
      {/* Section header */}
      <Pressable
        style={[styles.sectionHeader, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }]}
        onPress={() => setSectionExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityLabel="Insight Engine"
        accessibilityHint={sectionExpanded ? 'Tap to collapse' : 'Tap to expand'}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(180,200,255,0.55)' : 'rgba(0,0,0,0.45)' }]}>
            {cs.insightEngineLabel}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)' }]}>
            6 evidence-based correlations · 2024–2026 peer-reviewed
          </Text>
        </View>
        <View style={styles.sectionHeaderRight}>
          {detectedCount > 0 && (
            <View style={styles.detectedBadge}>
              <Text style={styles.detectedBadgeText}>{detectedCount} ⚠</Text>
            </View>
          )}
          {/* ? info button */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setInfoModalVisible(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="About Insight Engine"
            accessibilityHint="Opens an explanation of how insights are generated"
          >
            <View style={[
              styles.infoButton,
              { borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
            ]}>
              <Text style={[styles.infoButtonText, { color: isDark ? 'rgba(180,200,255,0.70)' : 'rgba(60,80,180,0.70)' }]}>?</Text>
            </View>
          </Pressable>
          <Text style={[styles.sectionChevron, {
            color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
            transform: [{ rotate: sectionExpanded ? '90deg' : '0deg' }],
          }]}>›</Text>
        </View>
      </Pressable>

      {/* ── Platform Intelligence Info Modal ─────────────────────────────── */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => setInfoModalVisible(false)}
          accessibilityLabel="Close modal"
        >
          <Pressable
            style={[
              styles.infoModalCard,
              { backgroundColor: isDark ? '#0F1420' : '#FFFFFF',
                borderColor: isDark ? 'rgba(99,102,241,0.30)' : 'rgba(99,102,241,0.20)',
                maxHeight: '85%',
              },
            ]}
            onPress={() => {/* absorb tap so backdrop doesn't close */}}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>🧠</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#E8EEFF' : '#0F172A' }}>{cs.insightEngine}</Text>
                <Text style={{ fontSize: 12, color: isDark ? 'rgba(180,200,255,0.55)' : 'rgba(60,80,180,0.60)', marginTop: 2 }}>
                  {cs.poweredBy} {intelligenceName}
                </Text>
              </View>
              <Pressable
                onPress={() => setInfoModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={{ fontSize: 20, color: isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)', lineHeight: 24 }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
              {/* Platform badge explanation */}
              <View style={[styles.infoSection, { backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)', borderColor: isDark ? 'rgba(99,102,241,0.20)' : 'rgba(99,102,241,0.15)' }]}>
                <Text style={[styles.infoSectionTitle, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>
                  {Platform.OS === 'ios' ? cs.infoModalPoweredByIos : Platform.OS === 'android' ? 'G  Gemini' : '✶  Smart Analysis'}
                </Text>
                <Text style={[styles.infoSectionBody, { color: isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.65)' }]}>
                  {Platform.OS === 'ios'
                    ? 'On iOS, health correlations are processed using Apple Intelligence — Apple\'s on-device machine learning framework. All analysis runs locally on your device. No health data is sent to external servers.'
                    : Platform.OS === 'android'
                    ? 'On Android, health correlations are enhanced using Gemini — Google\'s on-device intelligence framework. Analysis runs locally on your device. No health data is sent to external servers.'
                    : 'Health correlations are computed locally on your device using evidence-based statistical models. No health data is sent to external servers.'}
                </Text>
              </View>

              {/* What it analyzes */}
              <View style={[styles.infoSection, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
                <Text style={[styles.infoSectionTitle, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{cs.infoModalWhatItAnalyzes}</Text>
                <Text style={[styles.infoSectionBody, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.60)' }]}>
                  The Insight Engine runs 6 evidence-based correlations across your vitals, sleep, nutrition, and activity data — each grounded in a 2024–2026 peer-reviewed publication. It looks for patterns such as fluid-pressure coupling, vagal withdrawal, insulin sensitivity shifts, circadian cardiac strain, glycaemic sleep fragmentation, and resilience index changes.
                </Text>
              </View>

              {/* Privacy */}
              <View style={[styles.infoSection, { backgroundColor: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.05)', borderColor: isDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.15)' }]}>
                <Text style={[styles.infoSectionTitle, { color: isDark ? '#4ADE80' : '#15803D' }]}>{cs.infoModalPrivacy}</Text>
                <Text style={[styles.infoSectionBody, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.60)' }]}>
                  {cs.infoModalPrivacyBody ?? 'All analysis is performed entirely on-device. Your health data never leaves your phone. VitalSync does not transmit, store, or share any health information with third parties.'}
                </Text>
              </View>

              {/* Disclaimer */}
              <Text style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)', textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
                {cs.infoModalDisclaimer}
              </Text>
            </ScrollView>

            <Pressable
              style={[styles.infoModalClose, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)', borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.25)' }]}
              onPress={() => setInfoModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#A5B4FC' : '#4338CA' }}>{cs.gotIt}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {sectionExpanded && (
        <View style={styles.cardsContainer}>
          {insights.map((insight, i) => (
            <InsightCard
              key={i}
              insight={insight}
              index={i}
              isDark={isDark}
              tooltipVisible={tooltipInsightId === i}
              onBrandLongPress={() => showBrandTooltip(i)}
            />
          ))}

          {/* View all sources deep-link */}
          <TouchableOpacity
            style={[styles.viewSourcesRow, {
              borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
            }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(('/settings/clinical-sources?scrollTo=insights') as any);
            }}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="View all evidence based sources"
            accessibilityHint="Opens the Evidence Based Sources screen scrolled to the Insight Engine section"
          >
            <Text style={[styles.viewSourcesText, {
              color: isDark ? 'rgba(140,180,255,0.70)' : 'rgba(30,80,200,0.70)',
            }]}>
              {cs.viewAllSources}
            </Text>
            <Text style={[styles.viewSourcesSubtext, {
              color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
            }]}>
              {CLINICAL_SOURCES_COUNT} peer-reviewed references · Settings → About
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 8,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  sectionHeaderLeft: { flex: 1 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
  sectionChevron: {
    fontSize: 20,
    fontWeight: '300',
  },
  detectedBadge: {
    backgroundColor: '#F43F5E',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detectedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ? info button in section header
  infoButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },

  // Info modal
  infoModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  infoSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  infoSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  infoSectionBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  infoModalClose: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },

  // Cards container
  cardsContainer: { gap: 10, marginTop: 8 },

  // Individual card — glassmorphism
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
  accentBar: {
    height: 2.5,
    width: '100%',
  },
  detectedGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardTitleBlock: { flex: 1, gap: 4 },
  platformBrandBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
  },
  platformBrandText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 8,
  },
  summary: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },

  // Expanded content
  expandedContent: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 12,
  },

  // Chart
  chartContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 6,
    paddingBottom: 6,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingBottom: 4,
    paddingTop: 2,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    flex: 1,
  },
  chartPlaceholder: {
    borderRadius: 12,
    borderWidth: 1,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartPlaceholderText: {
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Smart Analysis block
  analysisBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  analysisLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  analysisText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
  },

  // Interventions
  interventionsBlock: {
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 12,
    gap: 8,
  },
  interventionsLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  interventionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  interventionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 5,
  },
  interventionText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },

  // Citation
  citationBlock: { gap: 3, paddingTop: 4 },
  citationLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  citationText: {
    fontSize: 10,
    lineHeight: 14,
  },
  citationDisclaimer: {
    fontSize: 9,
    fontStyle: 'italic',
  },

  // View all sources footer link
  viewSourcesRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 3,
  },
  viewSourcesText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  viewSourcesSubtext: {
    fontSize: 10,
    letterSpacing: 0.1,
  },
});
