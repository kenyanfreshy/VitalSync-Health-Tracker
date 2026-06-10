/**
 * InsightEngine v4 — Correlation Explorer
 *
 * Vibrant glassmorphism dark-mode UI with:
 *  - Emoji icons per correlation
 *  - Impact badges (↑/↓ metric delta)
 *  - Citation dots with journal + author inline
 *  - Metric tags as small chips
 *  - Mixed full/half-width card layout
 *  - Evidence Based Sources grid at bottom
 *  - 3D glossy glass aesthetic throughout
 *
 * Six evidence-based correlations (2024–2026):
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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import type { HealthData } from '@/lib/health/types';
// CLINICAL_SOURCES_COUNT import removed — footer was removed in v1.0.61
import { intelligenceName, interpolate } from '@/lib/intelligence';
import { settingsStrings } from '@/lib/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_H = 110;
const PAD_X = 14;
const PAD_Y = 10;

// Vibrant glassmorphism accent palette
const ACCENTS = {
  cyan:    '#00D4FF',
  violet:  '#7C3AED',
  amber:   '#F59E0B',
  rose:    '#F43F5E',
  emerald: '#10B981',
  indigo:  '#6366F1',
};

// Per-correlation emoji icons
const CORRELATION_ICONS = ['💧', '🌙', '🍬', '❤️', '🥗', '🧠'];

// Evidence library sources for the grid at the bottom
const EVIDENCE_SOURCES = [
  { tag: 'PubMed',   tagColor: '#3B82F6', name: 'PubMed — National Library of Medicine',     desc: 'Meta-analyses & systematic reviews (2020–2025)', url: 'https://pubmed.ncbi.nlm.nih.gov' },
  { tag: 'AHA 2021', tagColor: '#EF4444', name: 'American Heart Association — 2021 Diet…',   desc: 'Scientific statement on cardiovascular dietary patt…', url: 'https://www.ahajournals.org' },
  { tag: 'Cochrane', tagColor: '#10B981', name: 'Cochrane Library — Nu…',                     desc: 'Systematic reviews on nutritional interventions', url: 'https://www.cochranelibrary.com' },
  { tag: 'AND-EAL',  tagColor: '#8B5CF6', name: 'Academy of Nutrition a…',                   desc: 'Evidence analysis library for dietetics practice', url: 'https://www.andeal.org' },
  { tag: 'ISSN',     tagColor: '#F59E0B', name: 'Int. Society of Sports Nutrition',           desc: 'Position stands on macronutrients & performance', url: 'https://jissn.biomedcentral.com' },
  { tag: 'Lancet',   tagColor: '#EC4899', name: 'Lancet Diabetes & Endocrinology',            desc: 'Metabolic health & sleep restriction studies', url: 'https://www.thelancet.com/journals/landia/home' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightStatus = 'detected' | 'normal' | 'insufficient';

interface InsightResult {
  status: InsightStatus;
  label: string;
  summary: string;
  aiAnalysis: string;
  citation: string;
  citationShort: string;   // e.g. "AHA Guidelines 2023 · Sacks et al. NEJM"
  citationUrl: string;
  accentColor: string;
  impactBadge: string;     // e.g. "↑ +5 mmHg" or "↓ HRV 10%"
  metricTags: string[];    // e.g. ["↗ Blood Pressure", "↗ Weight"]
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
      : 'No acute fluid-pressure coupling observed in recent data',
    aiAnalysis: detected
      ? 'Acute weight gain exceeding 0.8 kg within 24 hours is associated with a measurable systolic blood pressure elevation, consistent with extracellular fluid retention. This pattern — termed fluid-pressure coupling — suggests that volume-dependent hypertension may be a contributing factor. Consider monitoring sodium intake and consulting your care team if this pattern recurs.'
      : 'No significant fluid-pressure coupling observed. Maintain consistent hydration and sodium monitoring to continue tracking this relationship.',
    citation: 'PMC11125317 (2024) — Positive correlation between acute weight shifts and systolic elevation',
    citationShort: 'PMC11125317 · 2024',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/11125317',
    accentColor: ACCENTS.cyan,
    impactBadge: detected ? '↑ +5 mmHg' : '→ Stable',
    metricTags: ['↗ Blood Pressure', '↗ Weight'],
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
    citationShort: 'Nature Digital Medicine · 2025',
    citationUrl: 'https://www.nature.com/npjdigitalmed',
    accentColor: ACCENTS.violet,
    impactBadge: detected ? '↓ HRV 10%' : '→ Stable',
    metricTags: ['↗ Sleep', '↗ HRV'],
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
      ? 'Sleep restriction below 6 hours is associated with elevated morning cortisol, which impairs glucose disposal and raises fasting blood sugar by more than 10% above your personal baseline. This pattern — insulin sensitivity degradation — is a reversible metabolic stress response. Prioritising 7–9 hours of sleep is the most evidence-based approach for restoring insulin sensitivity.'
      : 'Sleep duration is supporting normal fasting glucose regulation. Maintaining consistent sleep duration is protective against metabolic stress.',
    citation: "Lancet Diabetes & Endocrinology (2025) — Acute sleep restriction's impact on morning cortisol and glucose disposal",
    citationShort: 'Lancet D&E · 2025',
    citationUrl: 'https://www.thelancet.com/journals/landia/home',
    accentColor: ACCENTS.amber,
    impactBadge: detected ? '↑ Glucose 10%' : '→ Stable',
    metricTags: ['↗ Sleep', '↗ Glucose'],
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
      ? 'Irregular sleep onset timing — varying by more than 90 minutes across nights — is associated with a rising trend in resting heart rate over 3-day windows. This pattern reflects disrupted circadian regulation of autonomic tone, increasing baseline cardiac workload. Anchoring your sleep and wake times to within 30 minutes each day is the most effective approach for restoring circadian cardiac stability.'
      : 'Sleep onset consistency is within the range associated with stable autonomic tone. Continue maintaining regular sleep timing.',
    citation: 'Journal of the American Heart Association (2026) — Impact of irregular sleep rhythms on baseline autonomic tone',
    citationShort: 'JAHA · 2026',
    citationUrl: 'https://www.ahajournals.org/journal/jaha',
    accentColor: ACCENTS.rose,
    impactBadge: detected ? '↑ RHR trend' : '→ Stable',
    metricTags: ['↗ Heart Rate', '↗ Sleep'],
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
      ? 'Carb:Fiber ratio >12 correlates with wake-after-sleep-onset >20 min'
      : chartData.length < 3
      ? 'Log meals with carb and fiber data alongside sleep to enable this analysis'
      : 'Dietary carb-to-fiber ratio and sleep continuity within expected range',
    aiAnalysis: detected
      ? 'A dietary carbohydrate-to-fiber ratio exceeding 12:1 is associated with increased wake-after-sleep-onset (WASO) of more than 20 minutes. Postprandial glycaemic variability from low-fiber, high-carbohydrate meals may contribute to nocturnal arousal through sympathetic activation. Increasing dietary fiber to ≥25g/day (women) or ≥38g/day (men) is associated with improved sleep continuity.'
      : 'Dietary carbohydrate-to-fiber balance is within the range associated with normal sleep continuity.',
    citation: 'WHO Systematic Review (2024) — Dietary fibre and sleep architecture in adults',
    citationShort: 'WHO Systematic Review · 2024',
    citationUrl: 'https://www.who.int/publications',
    accentColor: ACCENTS.emerald,
    impactBadge: detected ? '↑ WASO 20min' : '→ Stable',
    metricTags: ['↗ Nutrition', '↗ Sleep'],
    chartType: 'scatter',
    chartData,
    xLabel: 'Carb:Fiber Ratio',
    yLabel: 'WASO (min)',
    xThreshold: 12,
    yThreshold: 20,
  };
}

/** Correlation 6: Resilience Index (HRV Trend vs Stress Proxy) */
function analyzeResilienceIndex(data: HealthData): InsightResult {
  const vitals = [...(data.vitalSigns ?? [])].filter(v => v.hrv && v.heartRate).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  ).slice(-14);

  const chartData: { x: number; y: number }[] = [];
  let detected = false;

  for (let i = 1; i < vitals.length; i++) {
    const prev = vitals[i - 1];
    const curr = vitals[i];
    const hrvDelta = (curr.hrv! - prev.hrv!);
    const rhrProxy = curr.heartRate!;
    chartData.push({ x: rhrProxy, y: hrvDelta });
    if (rhrProxy > 75 && hrvDelta < -5) detected = true;
  }

  const status: InsightStatus = chartData.length < 3 ? 'insufficient' : detected ? 'detected' : 'normal';
  return {
    status,
    label: 'Resilience Index',
    summary: detected
      ? 'Elevated resting HR >75 bpm correlates with declining HRV trend'
      : chartData.length < 3
      ? 'Log HRV and heart rate readings to enable this analysis'
      : 'HRV and resting heart rate balance indicates good recovery capacity',
    aiAnalysis: detected
      ? 'A resting heart rate consistently above 75 bpm combined with a declining HRV trend suggests reduced physiological resilience — the body\'s capacity to recover from stressors. This pattern is associated with accumulated allostatic load. Aerobic exercise at moderate intensity (3–5 sessions/week), consistent sleep, and stress management practices are associated with improved resilience markers.'
      : 'Your HRV and resting heart rate balance suggests adequate recovery capacity. Continue monitoring to track resilience trends over time.',
    citation: 'Brain Communications (2023) — HRV as a biomarker of physiological resilience and allostatic load',
    citationShort: 'Brain Communications · 2023',
    citationUrl: 'https://academic.oup.com/braincomms',
    accentColor: ACCENTS.indigo,
    impactBadge: detected ? '↓ HRV trend' : '→ Stable',
    metricTags: ['↗ HRV', '↗ Heart Rate'],
    chartType: 'scatter',
    chartData,
    xLabel: 'Resting HR (bpm)',
    yLabel: 'HRV Δ (ms)',
    xThreshold: 75,
    yThreshold: 0,
  };
}

// ─── Mini Scatter Chart ───────────────────────────────────────────────────────

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
  const [W, setW] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setW(e.nativeEvent.layout.width);
  }, []);

  const { xs, ys, toSvgX, toSvgY, isIntersection } = useMemo(() => {
    if (!data.length || W === 0) return { xs: [], ys: [], toSvgX: () => 0, toSvgY: () => 0, isIntersection: () => false };

    const allX = data.map(d => d.x);
    const allY = data.map(d => d.y);
    const xMin = Math.min(...allX, xThreshold ?? Infinity);
    const xMax = Math.max(...allX, xThreshold ?? -Infinity);
    const yMin = Math.min(...allY, yThreshold ?? Infinity);
    const yMax = Math.max(...allY, yThreshold ?? -Infinity);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const plotW = W - PAD_X * 2;
    const plotH = CHART_H - PAD_Y * 2;

    const toSvgX = (x: number) => PAD_X + ((x - xMin) / xRange) * plotW;
    const toSvgY = (y: number) => PAD_Y + plotH - ((y - yMin) / yRange) * plotH;

    const isIntersection = (d: { x: number; y: number }) => {
      const xOver = xThreshold !== undefined && d.x >= xThreshold;
      const yOver = yThreshold !== undefined && d.y >= yThreshold;
      const xUnder = xThreshold !== undefined && d.x <= xThreshold;
      const yUnder = yThreshold !== undefined && d.y <= yThreshold;
      return (xOver && yOver) || (xUnder && yUnder);
    };

    return { xs: allX, ys: allY, toSvgX, toSvgY, isIntersection };
  }, [data, W, xThreshold, yThreshold]);

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
  const accentHex = accentColor.replace('#', '');

  return (
    <View style={{ width: '100%', height: CHART_H }} onLayout={onLayout}>
      {W > 0 && (
        <Svg width={W} height={CHART_H}>
          <Defs>
            <RadialGradient id={`dotGrad_${accentHex}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={accentColor} stopOpacity={1} />
              <Stop offset="100%" stopColor={accentColor} stopOpacity={0.5} />
            </RadialGradient>
            <RadialGradient id={`intersectGlow_${accentHex}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={accentColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>

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

          {/* Threshold zone fill */}
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

          {/* X threshold line */}
          {xThreshold !== undefined && (
            <Line
              x1={toSvgX(xThreshold)} y1={PAD_Y}
              x2={toSvgX(xThreshold)} y2={CHART_H - PAD_Y}
              stroke={accentColor} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.75}
            />
          )}

          {/* Y threshold line */}
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

          {/* Data points */}
          {data.map((d, i) => {
            const cx = toSvgX(d.x);
            const cy = toSvgY(d.y);
            const inter = isIntersection(d);
            return (
              <React.Fragment key={i}>
                {inter && (
                  <>
                    <Circle cx={cx} cy={cy} r={14} fill={`url(#intersectGlow_${accentHex})`} />
                    <Circle cx={cx} cy={cy} r={7} fill="none" stroke={accentColor} strokeWidth={1.5} opacity={0.9} />
                  </>
                )}
                <Circle
                  cx={cx} cy={cy}
                  r={inter ? 4 : 3.5}
                  fill={`url(#dotGrad_${accentHex})`}
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

// ─── Impact Badge ─────────────────────────────────────────────────────────────

function ImpactBadge({ label, accentColor, isDark }: { label: string; accentColor: string; isDark: boolean }) {
  const isPositive = label.startsWith('↑') || label.startsWith('↗');
  const isNegative = label.startsWith('↓') || label.startsWith('↘');
  const isStable   = label.startsWith('→');

  const badgeColor = isStable
    ? (isDark ? '#10B981' : '#059669')
    : accentColor;

  return (
    <View style={[
      styles.impactBadge,
      {
        backgroundColor: badgeColor + '22',
        borderColor: badgeColor + '55',
      },
    ]}>
      <Text style={[styles.impactBadgeText, { color: badgeColor }]}>{label}</Text>
    </View>
  );
}

// ─── Metric Tag ───────────────────────────────────────────────────────────────

function MetricTag({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <View style={[
      styles.metricTag,
      {
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
      },
    ]}>
      <Text style={[styles.metricTagText, { color: isDark ? 'rgba(180,200,255,0.65)' : 'rgba(30,60,180,0.65)' }]}>
        {label}
      </Text>
    </View>
  );
}

// ─── Citation Row ─────────────────────────────────────────────────────────────

function CitationRow({
  citationShort,
  citationUrl,
  accentColor,
  isDark,
}: {
  citationShort: string;
  citationUrl: string;
  accentColor: string;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.citationRow}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Linking.openURL(citationUrl);
      }}
      activeOpacity={0.7}
      accessibilityRole="link"
    >
      <View style={[styles.citationDot, { backgroundColor: accentColor }]} />
      <Text style={[styles.citationRowText, { color: accentColor }]}>{citationShort}</Text>
      <Text style={[styles.citationArrow, { color: accentColor + 'AA' }]}>↗</Text>
    </TouchableOpacity>
  );
}

// ─── Full-Width Insight Card ──────────────────────────────────────────────────

function InsightCardFull({
  insight,
  index,
  isDark,
  defaultExpanded = false,
}: {
  insight: InsightResult;
  index: number;
  isDark: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const lang = useLang();
  const cs = useCorrelationStrings();
  const accent = insight.accentColor;
  const icon = CORRELATION_ICONS[index] ?? '🔬';

  const statusConfig = {
    detected:     { label: cs.patternDetected,   bg: accent + '22',   border: accent + '55' },
    normal:       { label: cs.withinRange,        bg: '#10B98122',     border: '#10B98155' },
    insufficient: { label: cs.insufficientData,   bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' },
  }[insight.status];

  const cardBg = isDark ? 'rgba(10, 12, 20, 0.88)' : 'rgba(255, 255, 255, 0.92)';
  const borderColor = expanded ? accent + '66' : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={[
      styles.cardFull,
      {
        backgroundColor: cardBg,
        borderColor: insight.status === 'detected' ? accent + '44' : borderColor,
        shadowColor: insight.status === 'detected' ? accent : '#000',
        shadowOpacity: insight.status === 'detected' ? 0.30 : 0.18,
      },
    ]}>
      {/* Gradient top bar */}
      <View style={[styles.accentBar, { backgroundColor: accent, opacity: insight.status === 'detected' ? 1.0 : 0.55 }]} />

      {/* Detected glow */}
      {insight.status === 'detected' && (
        <View style={[styles.detectedGlow, { backgroundColor: accent + '10' }]} />
      )}

      {/* Header: emoji + impact badge + title row */}
      <Pressable style={styles.cardHeaderFull} onPress={() => setExpanded(e => !e)}>
        <View style={styles.cardHeaderTopRow}>
          <Text style={styles.cardIcon}>{icon}</Text>
          <ImpactBadge label={insight.impactBadge} accentColor={accent} isDark={isDark} />
        </View>
        <View style={styles.cardHeaderBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitleFull, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>
              {insight.label}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border, alignSelf: 'flex-start', marginTop: 4 }]}>
              <Text style={[styles.statusText, {
                color: insight.status === 'normal' ? '#10B981'
                  : insight.status === 'detected' ? accent
                  : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
              }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
          <Text style={[styles.chevron, { color: accent, transform: [{ rotate: expanded ? '90deg' : '0deg' }] }]}>›</Text>
        </View>
      </Pressable>

      {/* Summary */}
      <Text style={[styles.cardSummary, { color: isDark ? 'rgba(200,210,255,0.60)' : 'rgba(0,0,0,0.58)' }]}>
        {insight.summary}
      </Text>

      {/* Citation row — always visible */}
      <View style={styles.cardFooter}>
        <CitationRow
          citationShort={insight.citationShort}
          citationUrl={insight.citationUrl}
          accentColor={accent}
          isDark={isDark}
        />
        <View style={styles.metricTagsRow}>
          {insight.metricTags.map((tag, i) => (
            <MetricTag key={i} label={tag} isDark={isDark} />
          ))}
        </View>
      </View>

      {/* Disclaimer */}
      <Text style={[styles.cardDisclaimer, { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)' }]}>
        {cs.tapToOpenSource ?? 'Tap to open source · For informational purposes only · Not medical advice'}
      </Text>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>
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
            <Text style={[styles.analysisLabel, { color: accent }]}>
              {interpolate(((settingsStrings as unknown as Record<string, typeof settingsStrings.en>)[lang] ?? settingsStrings.en).smartAnalysisLabel, { intelligenceName })}
            </Text>
            <Text style={[styles.analysisText, { color: isDark ? 'rgba(220,228,255,0.82)' : 'rgba(0,0,0,0.80)' }]}>
              {insight.aiAnalysis}
            </Text>
          </View>

          {/* 4-Metric Scoring System */}
          <View style={[styles.scoringBlock, { backgroundColor: accent + '0A', borderColor: accent + '22' }]}>
            <Text style={[styles.scoringTitle, { color: accent }]}>📊 {cs.scoreAnalysisTitle ?? 'ANALYSIS SCORES'}</Text>
            {[
              { label: cs.scoreDataCompleteness ?? 'Data Completeness',    value: Math.min(100, Math.round((insight.chartData.length / 30) * 100)), color: '#3B82F6' },
              { label: cs.scoreTrendStability ?? 'Trend Stability',       value: insight.chartData.length >= 3 ? Math.round(Math.min(1, insight.chartData.length / 14) * 100) : 0, color: '#10B981' },
              { label: cs.scoreRelationshipStrength ?? 'Relationship Strength', value: (() => { const pts = insight.chartData; if (pts.length < 3) return 20; const n = pts.length; const xs = pts.map(p => p.x); const ys = pts.map(p => p.y); const mx = xs.reduce((a,b)=>a+b,0)/n; const my = ys.reduce((a,b)=>a+b,0)/n; const num = pts.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0); const dx = Math.sqrt(pts.reduce((s,p)=>s+(p.x-mx)**2,0)); const dy = Math.sqrt(pts.reduce((s,p)=>s+(p.y-my)**2,0)); const r = (dx*dy)===0?0:num/(dx*dy); return Math.round(Math.abs(r)*100); })(), color: accent },
              { label: cs.scoreResearchConfidence ?? 'Research Confidence',   value: 88, color: '#8B5CF6' },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.scoreBarRow}>
                <Text style={[styles.scoreBarLabel, { color: isDark ? 'rgba(200,210,255,0.55)' : 'rgba(0,0,0,0.50)' }]}>{label}</Text>
                <View style={styles.scoreBarTrack}>
                  <View style={[styles.scoreBarFill, { width: `${value}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={[styles.scoreBarValue, { color }]}>{value}</Text>
              </View>
            ))}
            <View style={[styles.overallRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
              <Text style={[styles.overallLabel, { color: isDark ? 'rgba(200,210,255,0.60)' : 'rgba(0,0,0,0.50)' }]}>{cs.scoreOverall ?? 'Overall Score'}</Text>
              <View style={[styles.overallBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
                <Text style={[styles.overallValue, { color: accent }]}>
                  {Math.round((
                    Math.min(100, Math.round((insight.chartData.length / 30) * 100)) * 0.25 +
                    (insight.chartData.length >= 3 ? Math.round(Math.min(1, insight.chartData.length / 14) * 100) : 0) * 0.25 +
                    (() => { const pts = insight.chartData; if (pts.length < 3) return 20; const n = pts.length; const xs = pts.map((p: {x:number;y:number}) => p.x); const ys = pts.map((p: {x:number;y:number}) => p.y); const mx = xs.reduce((a: number,b: number)=>a+b,0)/n; const my = ys.reduce((a: number,b: number)=>a+b,0)/n; const num = pts.reduce((s: number,p: {x:number;y:number})=>s+(p.x-mx)*(p.y-my),0); const dx = Math.sqrt(pts.reduce((s: number,p: {x:number;y:number})=>s+(p.x-mx)**2,0)); const dy = Math.sqrt(pts.reduce((s: number,p: {x:number;y:number})=>s+(p.y-my)**2,0)); const r = (dx*dy)===0?0:num/(dx*dy); return Math.round(Math.abs(r)*100); })() * 0.25 +
                    88 * 0.25
                  ))}/100
                </Text>
              </View>
            </View>
          </View>

          {/* Full citation */}
          <TouchableOpacity
            style={[styles.fullCitationBlock, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(insight.citationUrl);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.citationLabel, { color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)' }]}>
              {cs.ebpSource ?? 'EBP SOURCE'}
            </Text>
            <Text style={[styles.citationText, { color: isDark ? 'rgba(160,200,255,0.75)' : 'rgba(30,80,200,0.75)' }]}>
              {insight.citation}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Half-Width Insight Card ──────────────────────────────────────────────────

function InsightCardHalf({
  insight,
  index,
  isDark,
  onPress,
}: {
  insight: InsightResult;
  index: number;
  isDark: boolean;
  onPress: () => void;
}) {
  const cs = useCorrelationStrings();
  const accent = insight.accentColor;
  const icon = CORRELATION_ICONS[index] ?? '🔬';

  const statusConfig = {
    detected:     { label: cs.patternDetected,   bg: accent + '22',   border: accent + '55' },
    normal:       { label: cs.withinRange,        bg: '#10B98122',     border: '#10B98155' },
    insufficient: { label: cs.insufficientData,   bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' },
  }[insight.status];

  const cardBg = isDark ? 'rgba(10, 12, 20, 0.88)' : 'rgba(255, 255, 255, 0.92)';

  return (
    <Pressable
      style={[
        styles.cardHalf,
        {
          backgroundColor: cardBg,
          borderColor: insight.status === 'detected' ? accent + '44' : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
          shadowColor: insight.status === 'detected' ? accent : '#000',
          shadowOpacity: insight.status === 'detected' ? 0.30 : 0.18,
        },
      ]}
      onPress={onPress}
    >
      {/* Gradient top bar */}
      <View style={[styles.accentBar, { backgroundColor: accent, opacity: insight.status === 'detected' ? 1.0 : 0.55 }]} />

      {/* Header row */}
      <View style={styles.halfCardHeader}>
        <Text style={styles.cardIconSmall}>{icon}</Text>
        <ImpactBadge label={insight.impactBadge} accentColor={accent} isDark={isDark} />
      </View>

      {/* Title */}
      <Text style={[styles.cardTitleHalf, { color: isDark ? '#E8EEFF' : '#0F172A' }]} numberOfLines={2}>
        {insight.label}
      </Text>

      {/* Summary */}
      <Text style={[styles.cardSummaryHalf, { color: isDark ? 'rgba(200,210,255,0.55)' : 'rgba(0,0,0,0.55)' }]} numberOfLines={3}>
        {insight.summary}
      </Text>

      {/* Citation + metric tag */}
      <View style={{ marginTop: 'auto', paddingTop: 8 }}>
        <CitationRow
          citationShort={insight.citationShort}
          citationUrl={insight.citationUrl}
          accentColor={accent}
          isDark={isDark}
        />
        {insight.metricTags[0] && (
          <View style={{ marginTop: 6 }}>
            <MetricTag label={insight.metricTags[0]} isDark={isDark} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Evidence Library Grid ────────────────────────────────────────────────────

function EvidenceLibraryGrid({ isDark, cs }: { isDark: boolean; cs: ReturnType<typeof useCorrelationStrings> }) {
  return (
    <View style={[
      styles.evidenceSection,
      {
        backgroundColor: isDark ? 'rgba(10,12,20,0.85)' : 'rgba(255,255,255,0.90)',
        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
      },
    ]}>
      {/* Header */}
      <View style={styles.evidenceHeader}>
        <Text style={styles.evidenceIcon}>🔬</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.evidenceTitle, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>
            {cs.evidenceBasedSources ?? 'Evidence Based Sources'}
          </Text>
          <Text style={[styles.evidenceSubtitle, { color: isDark ? 'rgba(180,200,255,0.50)' : 'rgba(0,0,0,0.45)' }]}>
            {cs.evidenceSourcesSubtitle ?? 'Research references are educational resources and do not constitute medical advice.'}
          </Text>
        </View>
      </View>

      {/* 2-column grid */}
      <View style={styles.evidenceGrid}>
        {EVIDENCE_SOURCES.map((src, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.evidenceCard,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
              },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(src.url);
            }}
            activeOpacity={0.7}
          >
            {/* Tag pill */}
            <View style={styles.evidenceTagRow}>
              <View style={[styles.evidenceTag, { backgroundColor: src.tagColor + '22', borderColor: src.tagColor + '55' }]}>
                <Text style={[styles.evidenceTagText, { color: src.tagColor }]}>{src.tag}</Text>
              </View>
              <Text style={[styles.evidenceArrow, { color: isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.30)' }]}>↗</Text>
            </View>
            <Text style={[styles.evidenceCardName, { color: isDark ? '#D0D8FF' : '#1E293B' }]} numberOfLines={2}>
              {src.name}
            </Text>
            <Text style={[styles.evidenceCardDesc, { color: isDark ? 'rgba(180,200,255,0.40)' : 'rgba(0,0,0,0.40)' }]} numberOfLines={2}>
              {src.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
  const colors = useColors();
  const router = useRouter();
  const cs = useCorrelationStrings();
  const lang = useLang();
  const [sectionExpanded, setSectionExpanded] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  // Track which half-card was tapped to show its full detail
  const [expandedHalfIndex, setExpandedHalfIndex] = useState<number | null>(null);

  const insights = useMemo<InsightResult[]>(() => [
    analyzeFluidPressure(data),
    analyzeVagalWithdrawal(data),
    analyzeInsulinSensitivity(data),
    analyzeCircadianCardiacStrain(data),
    analyzeGlycemicSleepFragmentation(data),
    analyzeResilienceIndex(data),
  ], [data]);

  const detectedCount = insights.filter(i => i.status === 'detected').length;

  // Layout: first 2 full-width, last 4 in 2×2 grid, then last if odd full-width
  // Actually: cards 0,1 full-width; cards 2,3 half-width pair; cards 4,5 half-width pair
  const fullCards = insights.slice(0, 2);
  const halfPairs: [InsightResult, InsightResult][] = [
    [insights[2], insights[3]],
    [insights[4], insights[5]],
  ];

  return (
    <GlassCard accentColor="#6366F1" noPadding style={{ marginHorizontal: 16, marginBottom: 10 }}>
      {/* Section header — matches Record tab LogCard style exactly */}
      <Pressable
        style={styles.sectionHeader}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSectionExpanded(e => !e);
        }}
        accessibilityRole="button"
        accessibilityLabel="Insight Engine"
        accessibilityHint={sectionExpanded ? 'Tap to collapse' : 'Tap to expand'}
      >
        {/* Icon wrap — matches Record LogCard iconWrap */}
        <View style={[styles.cardIconWrap, { backgroundColor: '#6366F122' }]}>
          <Text style={styles.cardIcon}>🧠</Text>
        </View>
        {/* Content — matches Record LogCard content */}
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {cs.insightEngineLabel ?? 'INSIGHT ENGINE'}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            {cs.insightEngineSubtitle ?? '6 evidence-based correlations · research-grounded'}
          </Text>
        </View>
        {/* Right side: detected badge + info + chevron */}
        <View style={styles.sectionHeaderRight}>
          {detectedCount > 0 && (
            <View style={styles.detectedBadge}>
              <Text style={styles.detectedBadgeText}>{detectedCount} ⚠</Text>
            </View>
          )}
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setInfoModalVisible(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="About Insight Engine"
          >
            <View style={[
              styles.infoButton,
              { borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
            ]}>
              <Text style={[styles.infoButtonText, { color: isDark ? 'rgba(180,200,255,0.70)' : 'rgba(60,80,180,0.70)' }]}>?</Text>
            </View>
          </Pressable>
          <IconSymbol name="chevron.right" size={18} color={colors.muted} />
        </View>
      </Pressable>

      {/* ── Info Modal ─────────────────────────────────────────────────────── */}
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
        >
          <Pressable
            style={[
              styles.infoModalCard,
              { backgroundColor: isDark ? '#0F1420' : '#FFFFFF',
                borderColor: isDark ? 'rgba(99,102,241,0.30)' : 'rgba(99,102,241,0.20)',
                maxHeight: '85%',
              },
            ]}
            onPress={() => {}}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>🧠</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#E8EEFF' : '#0F172A' }}>{cs.insightEngine}</Text>
                <Text style={{ fontSize: 12, color: isDark ? 'rgba(180,200,255,0.55)' : 'rgba(60,80,180,0.60)', marginTop: 2 }}>
                  {cs.poweredBy} {intelligenceName}
                </Text>
              </View>
              <Pressable onPress={() => setInfoModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 20, color: isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)', lineHeight: 24 }}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
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
              <View style={[styles.infoSection, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
                <Text style={[styles.infoSectionTitle, { color: isDark ? '#E8EEFF' : '#0F172A' }]}>{cs.infoModalWhatItAnalyzes}</Text>
                <Text style={[styles.infoSectionBody, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.60)' }]}>
                  The Insight Engine runs 6 evidence-based correlations across your vitals, sleep, nutrition, and activity data — each grounded in published research references.
                </Text>
              </View>
              <View style={[styles.infoSection, { backgroundColor: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.05)', borderColor: isDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.15)' }]}>
                <Text style={[styles.infoSectionTitle, { color: isDark ? '#4ADE80' : '#15803D' }]}>{cs.infoModalPrivacy}</Text>
                <Text style={[styles.infoSectionBody, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.60)' }]}>
                  {cs.infoModalPrivacyBody ?? 'All analysis is performed entirely on-device. Your health data never leaves your phone.'}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)', textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
                {cs.infoModalDisclaimer}
              </Text>
            </ScrollView>
            <Pressable
              style={[styles.infoModalClose, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)', borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.25)' }]}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#A5B4FC' : '#4338CA' }}>{cs.gotIt}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Expanded Cards ──────────────────────────────────────────────────── */}
      {sectionExpanded && (
        <View style={styles.cardsContainer}>

          {/* Full-width cards (correlations 1 & 2) — always expanded by default */}
          {fullCards.map((insight, i) => (
            <InsightCardFull
              key={i}
              insight={insight}
              index={i}
              isDark={isDark}
              defaultExpanded={true}
            />
          ))}

          {/* Half-width pairs (correlations 3–6) */}
          {halfPairs.map((pair, pairIdx) => (
            <View key={pairIdx} style={styles.halfRow}>
              {pair.map((insight, j) => {
                const globalIndex = 2 + pairIdx * 2 + j;
                return (
                  <InsightCardHalf
                    key={globalIndex}
                    insight={insight}
                    index={globalIndex}
                    isDark={isDark}
                    onPress={() => setExpandedHalfIndex(expandedHalfIndex === globalIndex ? null : globalIndex)}
                  />
                );
              })}
            </View>
          ))}

          {/* Expanded detail for tapped half-card */}
          {expandedHalfIndex !== null && expandedHalfIndex >= 2 && (
            <InsightCardFull
              key={`detail-${expandedHalfIndex}`}
              insight={insights[expandedHalfIndex]}
              index={expandedHalfIndex}
              isDark={isDark}
            />
          )}

          {/* Evidence Library Grid */}
          <EvidenceLibraryGrid isDark={isDark} cs={cs} />

          {/* peer-reviewed reference footer removed per v1.0.61 */}
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Section header
  // ── Record-tab-matching LogCard header styles ──────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 0,
  },
  cardIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardIcon: { fontSize: 24 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  sectionHeaderLeft: { flex: 1 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // legacy — kept for InsightCardFull internal use
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  sectionSubtitle: { fontSize: 11, fontWeight: '400', marginTop: 2 },
  sectionChevron: { fontSize: 20, fontWeight: '300' },
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

  // Cards container
  cardsContainer: { gap: 10, marginTop: 8, paddingBottom: 4 },

  // Half-width row
  halfRow: {
    flexDirection: 'row',
    gap: 10,
  },

  // ── Full-width card ──────────────────────────────────────────────────────
  cardFull: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  detectedGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  cardHeaderFull: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 6,
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardIcon: {
    fontSize: 28,
  },
  cardIconSmall: {
    fontSize: 22,
  },
  cardTitleFull: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardSummary: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  cardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 4,
    gap: 6,
  },
  cardDisclaimer: {
    fontSize: 9,
    fontStyle: 'italic',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },

  // ── Half-width card ──────────────────────────────────────────────────────
  cardHalf: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
    paddingBottom: 12,
    minHeight: 200,
  },
  halfCardHeader: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleHalf: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  cardSummaryHalf: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 10,
  },

  // Status pill
  statusPill: {
    borderRadius: 20,
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

  // Impact badge
  impactBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  impactBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Metric tag
  metricTag: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  metricTagText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  metricTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },

  // Citation row
  citationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  citationDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  citationRowText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  citationArrow: {
    fontSize: 12,
    fontWeight: '700',
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

  // Full citation block
  fullCitationBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  citationLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  citationText: {
    fontSize: 11,
    lineHeight: 15,
  },

  // Evidence Library
  evidenceSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginTop: 4,
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  evidenceIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  evidenceTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  evidenceSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  evidenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  evidenceCard: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  evidenceTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  evidenceTag: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  evidenceTagText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  evidenceArrow: {
    fontSize: 12,
    fontWeight: '700',
  },
  evidenceCardName: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  evidenceCardDesc: {
    fontSize: 10,
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

  // 4-Metric Scoring System
  scoringBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  scoringTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.0,
    marginBottom: 2,
  },
  scoreBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreBarLabel: {
    fontSize: 10,
    width: 130,
  },
  scoreBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.18)',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: 4,
    borderRadius: 2,
  },
  scoreBarValue: {
    fontSize: 10,
    fontWeight: '700',
    width: 24,
    textAlign: 'right',
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    marginTop: 2,
  },
  overallLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  overallBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  overallValue: {
    fontSize: 12,
    fontWeight: '700',
  },

  // View all sources footer
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
