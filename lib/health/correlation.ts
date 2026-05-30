/**
 * VitalSync Correlation Engine
 * Computes Pearson correlation coefficients and generates insights.
 */

import type { HealthData } from './types';
import { loadUserProfile, getHRVReferenceRange } from '../user-profile';
import { aggregateHrTo4HourBuckets, getDailyHrAverages } from './hr-aggregation';
import { getAfibDailyCounts } from './ekg-store';

export interface CorrelationPoint {
  x: number;
  y: number;
  date: string;
}

export interface CorrelationResult {
  points: CorrelationPoint[];
  r: number;           // Pearson r (-1 to 1)
  rSquared: number;    // R² coefficient of determination
  slope: number;       // Regression line slope
  intercept: number;   // Regression line y-intercept
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative' | 'none';
  insight: string;
}

export type MetricKey =
  | 'sleepEfficiency'
  | 'sleepHours'
  | 'deepSleepMinutes'
  | 'bpSystolic'
  | 'bpDiastolic'
  | 'heartRate'
  | 'restingHR'
  | 'hrv'
  | 'weight'
  | 'muscleMass'
  | 'afibCount';

export const METRIC_LABELS: Record<MetricKey, string> = {
  sleepEfficiency: 'Sleep Efficiency (%)',
  sleepHours: 'Sleep Duration (hrs)',
  deepSleepMinutes: 'Deep Sleep (min)',
  bpSystolic: 'Systolic BP (mmHg)',
  bpDiastolic: 'Diastolic BP (mmHg)',
  heartRate: 'Heart Rate (bpm)',
  restingHR: 'Resting HR (bpm)',
  hrv: 'HRV (ms)',
  weight: 'Weight (kg)',
  muscleMass: 'Muscle Mass (kg)',
  afibCount: 'AFib Episodes (count/day)',
};

export const METRIC_COLORS: Record<MetricKey, string> = {
  sleepEfficiency: '#8B5CF6',
  sleepHours: '#A78BFA',
  deepSleepMinutes: '#6366F1',
  bpSystolic: '#10B981',
  bpDiastolic: '#34D399',
  heartRate: '#EF4444',
  restingHR: '#F97316',
  hrv: '#818CF8',
  weight: '#0EA5E9',
  muscleMass: '#38BDF8',
  afibCount: '#EF4444',
};

/**
 * Extract a time-series of (date, value) pairs for a given metric.
 */
export function extractMetricSeries(data: HealthData, metric: MetricKey): Map<string, number> {
  const series = new Map<string, number>();

  switch (metric) {
    case 'sleepEfficiency':
    case 'sleepHours':
    case 'deepSleepMinutes':
      (data.sleep ?? []).forEach((r) => {
        const val = metric === 'sleepEfficiency' ? r.efficiency
          : metric === 'sleepHours' ? r.totalMinutes / 60
          : r.deepMinutes;
        series.set(r.date, val);
      });
      break;

    case 'bpSystolic':
    case 'bpDiastolic':
      (data.bloodPressure ?? []).forEach((r) => {
        const date = r.timestamp.split('T')[0];
        const val = metric === 'bpSystolic' ? r.systolic : r.diastolic;
        if (val !== null && val !== undefined) series.set(date, val as number);
      });
      break;

    case 'heartRate':
    case 'hrv':
    case 'restingHR':
      if (metric === 'heartRate') {
        // Use 4-hour aggregated daily averages to avoid raw sample bias
        const buckets = aggregateHrTo4HourBuckets(data.pulse ?? []);
        const dailyAvgs = getDailyHrAverages(buckets);
        dailyAvgs.forEach((avgBpm, date) => series.set(date, avgBpm));
      } else if (metric === 'restingHR') {
        // Resting HR: one sample per day from HealthKit restingHRSamples
        (data.restingHRSamples ?? []).forEach((r) => {
          const date = r.timestamp.split('T')[0];
          if (r.bpm > 0) series.set(date, r.bpm);
        });
      } else {
        // HRV: use raw pulse records (HRV is already sparse, not flooded)
        (data.pulse ?? []).forEach((r) => {
          const date = r.timestamp.split('T')[0];
          if (r.hrv != null && r.hrv > 0) series.set(date, r.hrv);
        });
      }
      break;

    case 'weight':
    case 'muscleMass':
      (data.bodyComposition ?? []).forEach((r) => {
        const date = r.timestamp.split('T')[0];
        const val = metric === 'weight' ? r.weightKg : (r.muscleMassKg ?? 0);
        series.set(date, val);
      });
      break;

    case 'afibCount': {
      // AFib episode count per day — derived from cached EKG records.
      // getAfibDailyCounts reads from the in-memory / AsyncStorage EKG cache
      // synchronously (the cache is already populated by the EKG screen).
      // Days with no EKG recording are omitted (treated as no data, not 0).
      const ekgRecords: import('./ekg-store').EKGRecord[] = (data as any)._ekgRecords ?? [];
      const counts = getAfibDailyCounts(ekgRecords);
      counts.forEach((count, date) => series.set(date, count));
      break;
    }
  }

  return series;
}

/**
 * Compute Pearson correlation between two metrics over aligned dates.
 */
export function computeCorrelation(
  data: HealthData,
  xMetric: MetricKey,
  yMetric: MetricKey
): CorrelationResult {
  const xSeries = extractMetricSeries(data, xMetric);
  const ySeries = extractMetricSeries(data, yMetric);

  // Find common dates
  const commonDates = [...xSeries.keys()].filter((d) => ySeries.has(d)).sort();

  if (commonDates.length < 3) {
    return {
      points: [],
      r: 0,
      rSquared: 0,
      slope: 0,
      intercept: 0,
      strength: 'none',
      direction: 'none',
      insight: 'Not enough overlapping data to compute correlation. Try syncing more data.',
    };
  }

  const xs = commonDates.map((d) => xSeries.get(d)!);
  const ys = commonDates.map((d) => ySeries.get(d)!);

  // Pearson r
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let xSumSq = 0;
  let ySumSq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    numerator += dx * dy;
    xSumSq += dx * dx;
    ySumSq += dy * dy;
  }

  const r = xSumSq === 0 || ySumSq === 0 ? 0 : numerator / Math.sqrt(xSumSq * ySumSq);
  const rSquared = r * r;

  // Linear regression
  const slope = xSumSq === 0 ? 0 : numerator / xSumSq;
  const intercept = yMean - slope * xMean;

  // Classify
  const absR = Math.abs(r);
  const strength: CorrelationResult['strength'] =
    absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : absR >= 0.2 ? 'weak' : 'none';
  const direction: CorrelationResult['direction'] =
    r > 0.1 ? 'positive' : r < -0.1 ? 'negative' : 'none';

  const points: CorrelationPoint[] = commonDates.map((d, i) => ({
    x: xs[i],
    y: ys[i],
    date: d,
  }));

  const insight = generateInsight(xMetric, yMetric, r, strength, direction);

  return { points, r: parseFloat(r.toFixed(3)), rSquared: parseFloat(rSquared.toFixed(3)), slope, intercept, strength, direction, insight };
}

/**
 * Returns an age/sex-adjusted HRV status label for the latest HRV reading.
 * Used by the Pulse detail screen and Analytics to contextualise HRV values.
 */
export async function getAdjustedHRVStatus(
  latestHRV: number
): Promise<{ label: string; status: 'low' | 'normal' | 'high'; referenceLabel: string }> {
  const profile = await loadUserProfile();
  const range = getHRVReferenceRange(profile);

  let status: 'low' | 'normal' | 'high';
  if (latestHRV < range.lowThreshold) status = 'low';
  else if (latestHRV > range.normalMax) status = 'high';
  else status = 'normal';

  const label =
    status === 'low' ? `Low for your age group (< ${range.lowThreshold} ms)` :
    status === 'high' ? `Above average for your age group (> ${range.normalMax} ms)` :
    `Normal for your age group (${range.normalMin}–${range.normalMax} ms)`;

  return { label, status, referenceLabel: range.label };
}

function generateInsight(
  xMetric: MetricKey,
  yMetric: MetricKey,
  r: number,
  strength: CorrelationResult['strength'],
  direction: CorrelationResult['direction']
): string {
  const xLabel = METRIC_LABELS[xMetric];
  const yLabel = METRIC_LABELS[yMetric];

  if (strength === 'none') {
    return `No meaningful relationship found between ${xLabel} and ${yLabel} in your data.`;
  }

  const strengthWord = strength === 'strong' ? 'strong' : strength === 'moderate' ? 'moderate' : 'weak';
  const directionPhrase = direction === 'positive'
    ? `as ${xLabel} increases, ${yLabel} tends to increase`
    : `as ${xLabel} increases, ${yLabel} tends to decrease`;

  let specific = '';
  if (xMetric === 'sleepEfficiency' && yMetric === 'bpSystolic') {
    specific = direction === 'negative'
      ? ' Better sleep quality appears to be associated with lower blood pressure — a well-established relationship in cardiovascular research.'
      : ' Interestingly, your data shows an atypical pattern. Consider discussing with your doctor.';
  } else if (xMetric === 'weight' && yMetric === 'bpSystolic') {
    specific = direction === 'positive'
      ? ' Weight and blood pressure often move together. Even modest weight reduction can meaningfully lower BP.'
      : ' Your data shows an inverse pattern between weight and BP, which may reflect other lifestyle factors.';
  } else if (xMetric === 'hrv' && yMetric === 'heartRate') {
    specific = direction === 'negative'
      ? ' Higher HRV with lower resting heart rate is a classic sign of good cardiovascular fitness.'
      : '';
  }

  return `There is a ${strengthWord} ${direction} correlation (r = ${r.toFixed(2)}): ${directionPhrase}.${specific}`;
}
