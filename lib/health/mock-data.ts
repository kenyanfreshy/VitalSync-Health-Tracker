/**
 * Mock health data for web preview and simulator testing.
 * Generates realistic-looking health records for the past 30 days.
 */

import type {
  BloodPressureRecord,
  PulseRecord,
  BodyCompositionRecord,
  SleepRecord,
  HealthData,
} from './types';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function isoAt(date: Date, hour = 8, minute = 0): string {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function rand(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function randFloat(min: number, max: number, decimals = 1): number {
  return parseFloat((min + Math.random() * (max - min)).toFixed(decimals));
}

// ─── Blood Pressure ────────────────────────────────────────────────────────────
export function generateBloodPressure(days = 30): BloodPressureRecord[] {
  return Array.from({ length: days }, (_, i) => {
    const date = daysAgo(days - 1 - i);
    // Slight trend: improving over time
    const trend = (days - i) * 0.1;
    return {
      id: `bp-${i}`,
      timestamp: isoAt(date, rand(7, 9)),
      systolic: rand(112, 128) + Math.round(trend),
      diastolic: rand(70, 82) + Math.round(trend * 0.4),
      source: 'Apple Watch',
    };
  });
}

// ─── Pulse / HRV ───────────────────────────────────────────────────────────────
export function generatePulse(days = 30): PulseRecord[] {
  return Array.from({ length: days }, (_, i) => {
    const date = daysAgo(days - 1 - i);
    return {
      id: `pulse-${i}`,
      timestamp: isoAt(date, rand(7, 9)),
      bpm: rand(58, 76),
      hrv: rand(28, 62),
      source: 'Apple Watch',
    };
  });
}

// ─── Body Composition ──────────────────────────────────────────────────────────
export function generateBodyComposition(days = 30): BodyCompositionRecord[] {
  let weight = 78.5;
  return Array.from({ length: days }, (_, i) => {
    const date = daysAgo(days - 1 - i);
    weight += randFloat(-0.3, 0.2);
    const muscleMassKg = weight * randFloat(0.41, 0.44);
    const fatMassKg = weight * randFloat(0.18, 0.22);
    const heightM = 1.78;
    return {
      id: `body-${i}`,
      timestamp: isoAt(date, rand(7, 8)),
      weightKg: parseFloat(weight.toFixed(1)),
      muscleMassKg: parseFloat(muscleMassKg.toFixed(1)),
      fatMassKg: parseFloat(fatMassKg.toFixed(1)),
      bmi: parseFloat((weight / (heightM * heightM)).toFixed(1)),
      source: 'Oura Ring',
    };
  });
}

// ─── Sleep ─────────────────────────────────────────────────────────────────────
export function generateSleep(days = 30): SleepRecord[] {
  return Array.from({ length: days }, (_, i) => {
    const date = daysAgo(days - 1 - i);
    const bedHour = rand(22, 23);
    const bedMinute = rand(0, 59);
    const totalMinutes = rand(360, 510);
    const deepMinutes = Math.round(totalMinutes * randFloat(0.12, 0.22));
    const remMinutes = Math.round(totalMinutes * randFloat(0.18, 0.25));
    const awakeMinutes = rand(5, 25);
    const lightMinutes = totalMinutes - deepMinutes - remMinutes - awakeMinutes;
    const efficiency = Math.round(((totalMinutes - awakeMinutes) / totalMinutes) * 100);

    const bedtime = new Date(date);
    bedtime.setHours(bedHour, bedMinute, 0, 0);
    const wakeTime = new Date(bedtime.getTime() + totalMinutes * 60 * 1000);

    const dateStr = date.toISOString().split('T')[0];
    return {
      id: `sleep-${i}`,
      date: dateStr,
      bedtime: bedtime.toISOString(),
      wakeTime: wakeTime.toISOString(),
      totalMinutes,
      deepMinutes,
      remMinutes,
      lightMinutes: Math.max(0, lightMinutes),
      awakeMinutes,
      efficiency,
      source: 'Oura Ring',
    };
  });
}

// ─── Full Dataset ──────────────────────────────────────────────────────────────
export function generateMockHealthData(): HealthData {
  return {
    bloodPressure: generateBloodPressure(30),
    pulse: generatePulse(30),
    bodyComposition: generateBodyComposition(30),
    sleep: generateSleep(30),
    lastSyncedAt: new Date().toISOString(),
    weight: [],
    vitalSigns: [],
    bloodSugar: [],
    activity: [],
    sodiumIntake: [], labResults: [],
    medicalHistory: [], surgicalHistory: [],
    mealIQAnalyzes: [],
  };
}
