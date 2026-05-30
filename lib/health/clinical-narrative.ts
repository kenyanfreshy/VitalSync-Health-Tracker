/**
 * Personal Narrative — Data Schema & Aggregation Layer
 *
 * Transforms raw HealthData into a time-sorted stream of ClinicalEvents
 * categorised into the "Golden Trio":
 *   INPUTS      — causes: meals, medications, activity
 *   OBSERVATIONS — effects: vitals, BP, glucose, symptoms
 *   INSIGHTS    — Smart analysis: Meal IQ correlations, trend alerts
 *
 * Also computes:
 *   - Physiological correlation markers (High-Sodium → Hypertension within 4h)
 *   - Postprandial peak reminders at +1h and +2h after each meal
 *   - Urgency level for each event (normal / elevated / stage2 / crisis)
 */

import type {
  HealthData,
  VitalSignsRecord,
  BloodSugarRecord,
  SodiumRecord,
  ActivityRecord,
  MealIQAnalysisRecord,
  DoctorAppointment,
} from './types';
import type { Medication, DoseLog } from '@/lib/medications/types';
import { LabResult, LAB_PANEL_LABELS } from './lab-types';
// ─── Golden Trio Category ─────────────────────────────────────────────────────

export type GoldenTrioCategory = 'INPUTS' | 'OBSERVATIONS' | 'INSIGHTS';

// ─── Urgency Level ────────────────────────────────────────────────────────────

export type UrgencyLevel = 'normal' | 'elevated' | 'stage2' | 'crisis';

/** Returns urgency colour for each level */
export function urgencyColor(level: UrgencyLevel): string {
  switch (level) {
    case 'normal':   return '#22C55E'; // green
    case 'elevated': return '#F59E0B'; // amber
    case 'stage2':   return '#EF4444'; // red
    case 'crisis':   return '#7C3AED'; // purple
  }
}

/** Derive urgency from a BP reading */
export function bpUrgency(systolic: number, diastolic: number): UrgencyLevel {
  if (systolic >= 180 || diastolic >= 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90)  return 'stage2';
  if (systolic >= 120 && diastolic < 80)   return 'elevated';
  return 'normal';
}

/** Derive urgency from a glucose reading (mg/dL) */
export function glucoseUrgency(mgDl: number): UrgencyLevel {
  if (mgDl > 250 || mgDl < 54)  return 'crisis';
  if (mgDl > 180 || mgDl < 70)  return 'stage2';
  if (mgDl > 130)                return 'elevated';
  return 'normal';
}

// ─── Clinical Event Types ─────────────────────────────────────────────────────

export type ClinicalEventKind =
  | 'meal'
  | 'activity'
  | 'vitals'
  | 'glucose'
  | 'meal_iq'
  | 'postprandial_reminder'
  | 'correlation'
  | 'medication'
  | 'lab'
  | 'appointment';

export interface BaseClinicalEvent {
  id: string;
  timestamp: string;         // ISO 8601
  kind: ClinicalEventKind;
  category: GoldenTrioCategory;
  urgency: UrgencyLevel;
  title: string;
  subtitle?: string;
  /** Tags displayed as chips (e.g. "High Sodium", "High Glycemic") */
  tags: string[];
  /** If true, this event is visually linked to correlatedEventId */
  isCorrelated?: boolean;
  correlatedEventId?: string;
  correlationLabel?: string;
}

// INPUT events
export interface MealEvent extends BaseClinicalEvent {
  kind: 'meal';
  category: 'INPUTS';
  sodiumMg: number;
  calories?: number;
  carbsG?: number;
  glycemicLoad?: number;
  mealContext: string;
  foodDescription?: string;
  mealId: string;
}

export interface ActivityEvent extends BaseClinicalEvent {
  kind: 'activity';
  category: 'INPUTS';
  durationMinutes: number;
  caloriesBurned?: number;
  intensityLabel: string;
}

// OBSERVATION events
export interface VitalsEvent extends BaseClinicalEvent {
  kind: 'vitals';
  category: 'OBSERVATIONS';
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  spo2?: number;
  temperature?: number;
}

export interface GlucoseEvent extends BaseClinicalEvent {
  kind: 'glucose';
  category: 'OBSERVATIONS';
  mgDl: number;
  context: string;
}

// INSIGHT events
export interface MealIQEvent extends BaseClinicalEvent {
  kind: 'meal_iq';
  category: 'INSIGHTS';
  bpImpact: string;
  glucoseImpact: string;
  insight: string;
  mealLabel: string;
  impactScore?: number;
}

export interface PostprandialReminderEvent extends BaseClinicalEvent {
  kind: 'postprandial_reminder';
  category: 'INSIGHTS';
  hoursAfterMeal: 1 | 2;
  mealId: string;
  mealLabel: string;
}

export interface CorrelationEvent extends BaseClinicalEvent {
  kind: 'correlation';
  category: 'INSIGHTS';
  inputEventId: string;
  observationEventId: string;
  correlationType: 'high_sodium_hypertension' | 'meal_glucose_spike' | 'generic';
  deltaMinutes: number;
}

export interface MedicationEvent extends BaseClinicalEvent {
  kind: 'medication';
  category: 'INPUTS';
  medicationId: string;
  medicationName: string;
  dose: string;
  doseStatus: 'taken' | 'skipped' | 'missed';
  scheduledTime: string;
}

export interface LabEvent extends BaseClinicalEvent {
  kind: 'lab';
  category: 'OBSERVATIONS';
  labResultId: string;
  panel: string;
  panelLabel: string;
  abnormalCount: number;
}

export interface AppointmentEvent extends BaseClinicalEvent {
  kind: 'appointment';
  category: 'OBSERVATIONS';
  appointmentId: string;
  doctorName: string;
  specialty?: string;
  appointmentStatus: 'upcoming' | 'missed';
}

export type ClinicalEvent =
  | MealEvent
  | ActivityEvent
  | VitalsEvent
  | GlucoseEvent
  | MealIQEvent
  | PostprandialReminderEvent
  | CorrelationEvent
  | MedicationEvent
  | LabEvent
  | AppointmentEvent;

// ─── Tag Builders ─────────────────────────────────────────────────────────────

function mealTags(r: SodiumRecord): string[] {
  const tags: string[] = [];
  if (r.sodiumMg >= 1500) tags.push('High Sodium');
  else if (r.sodiumMg >= 800) tags.push('Moderate Sodium');
  if (r.glycemicLoad != null && r.glycemicLoad >= 20) tags.push('High Glycemic');
  else if (r.glycemicLoad != null && r.glycemicLoad >= 11) tags.push('Medium Glycemic');
  if (r.calories != null && r.calories >= 700) tags.push('High Calorie');
  if (r.carbsG != null && r.carbsG >= 60) tags.push('High Carb');
  if (r.proteinG != null && r.proteinG >= 30) tags.push('High Protein');
  if (r.fiberG != null && r.fiberG >= 8) tags.push('High Fiber');
  return tags;
}

function activityIntensity(r: ActivityRecord): string {
  if (!r.avgHeartRate) {
    if (r.type === 'outdoor-run' || r.type === 'indoor-run') return 'Vigorous';
    if (r.type === 'walk') return 'Light';
    return 'Moderate';
  }
  if (r.avgHeartRate >= 150) return 'Vigorous';
  if (r.avgHeartRate >= 120) return 'Moderate';
  return 'Light';
}

function activityLabel(r: ActivityRecord): string {
  const map: Record<string, string> = {
    'outdoor-run': 'Outdoor Run',
    'indoor-run': 'Indoor Run',
    'walk': 'Walk',
    'cycling': 'Cycling',
    'workout': 'Workout',
  };
  return map[r.type] ?? r.type;
}

// ─── Main Aggregation Function ────────────────────────────────────────────────

export function buildClinicalNarrative(
  data: HealthData,
  correlationWindowHours = 4,
): ClinicalEvent[] {
  const events: ClinicalEvent[] = [];

  // ── INPUTS: Meals ──────────────────────────────────────────────────────────
  for (const r of data.sodiumIntake ?? []) {
    const tags = mealTags(r);
    const isHighSodium = r.sodiumMg >= 1500;
    events.push({
      id: `meal-${r.id}`,
      timestamp: r.timestamp,
      kind: 'meal',
      category: 'INPUTS',
      urgency: isHighSodium ? 'elevated' : 'normal',
      title: r.foodDescription ?? r.mealContext ?? 'Meal',
      subtitle: `${r.sodiumMg} mg Na${r.calories != null ? ` · ${r.calories} kcal` : ''}`,
      tags,
      mealId: r.id,
      sodiumMg: r.sodiumMg,
      calories: r.calories,
      carbsG: r.carbsG,
      glycemicLoad: r.glycemicLoad ?? undefined,
      mealContext: r.mealContext,
      foodDescription: r.foodDescription,
    } as MealEvent);

    // Postprandial reminders at +1h and +2h
    const mealTime = new Date(r.timestamp).getTime();
    const label = r.foodDescription ?? r.mealContext ?? 'Meal';
    for (const h of [1, 2] as const) {
      events.push({
        id: `ppreminder-${r.id}-${h}h`,
        timestamp: new Date(mealTime + h * 3_600_000).toISOString(),
        kind: 'postprandial_reminder',
        category: 'INSIGHTS',
        urgency: 'normal',
        title: `Check Postprandial Glucose`,
        subtitle: `${h}h after "${label}"`,
        tags: [`+${h}h Post-Meal`],
        hoursAfterMeal: h,
        mealId: r.id,
        mealLabel: label,
      } as PostprandialReminderEvent);
    }
  }

  // ── INPUTS: Activity ────────────────────────────────────────────────────────
  for (const r of data.activity ?? []) {
    const intensity = activityIntensity(r);
    events.push({
      id: `activity-${r.id}`,
      timestamp: r.timestamp,
      kind: 'activity',
      category: 'INPUTS',
      urgency: 'normal',
      title: `${intensity} ${activityLabel(r)}`,
      subtitle: `${r.durationMinutes} min${r.caloriesBurned ? ` · ${r.caloriesBurned} kcal` : ''}`,
      tags: [intensity, activityLabel(r)],
      durationMinutes: r.durationMinutes,
      caloriesBurned: r.caloriesBurned,
      intensityLabel: intensity,
    } as ActivityEvent);
  }

  // ── OBSERVATIONS: Vital Signs ──────────────────────────────────────────────
  for (const r of data.vitalSigns ?? []) {
    let urgency: UrgencyLevel = 'normal';
    const parts: string[] = [];
    const tags: string[] = [];

    if (r.systolic && r.diastolic) {
      urgency = bpUrgency(r.systolic, r.diastolic);
      parts.push(`${r.systolic}/${r.diastolic} mmHg`);
      if (urgency === 'stage2') tags.push('Hypertension Stage 2');
      else if (urgency === 'elevated') tags.push('Elevated BP');
      else if (urgency === 'crisis') tags.push('Hypertensive Crisis');
    }
    if (r.heartRate) parts.push(`${r.heartRate} bpm`);
    if (r.oxygenSaturation) {
      parts.push(`SpO₂ ${r.oxygenSaturation}%`);
      if (r.oxygenSaturation < 92) tags.push('Low SpO₂');
    }

    events.push({
      id: `vitals-${r.id}`,
      timestamp: r.timestamp,
      kind: 'vitals',
      category: 'OBSERVATIONS',
      urgency,
      title: 'Vital Signs',
      subtitle: parts.slice(0, 2).join(' · '),
      tags,
      systolic: r.systolic,
      diastolic: r.diastolic,
      heartRate: r.heartRate,
      spo2: r.oxygenSaturation,
      temperature: r.temperature,
    } as VitalsEvent);
  }

  // ── OBSERVATIONS: Blood Sugar ──────────────────────────────────────────────
  for (const r of data.bloodSugar ?? []) {
    const urgency = glucoseUrgency(r.glucoseMgDl);
    const tags: string[] = [];
    if (urgency === 'stage2') tags.push('Out of Range');
    else if (urgency === 'elevated') tags.push('Elevated Glucose');
    else if (urgency === 'crisis') tags.push('Critical Glucose');

    events.push({
      id: `glucose-${r.id}`,
      timestamp: r.timestamp,
      kind: 'glucose',
      category: 'OBSERVATIONS',
      urgency,
      title: 'Blood Glucose',
      subtitle: `${r.glucoseMgDl} mg/dL · ${r.context}`,
      tags,
      mgDl: r.glucoseMgDl,
      context: r.context,
    } as GlucoseEvent);
  }

  // ── INSIGHTS: Meal IQ Analyses ─────────────────────────────────────────────
  for (const r of data.mealIQAnalyses ?? []) {
    events.push({
      id: `mealiq-${r.id}`,
      timestamp: r.analyzedAt,
      kind: 'meal_iq',
      category: 'INSIGHTS',
      urgency: (r.impactScore ?? 0) >= 70 ? 'stage2' : (r.impactScore ?? 0) >= 40 ? 'elevated' : 'normal',
      title: 'Meal IQ Insight',
      subtitle: r.mealLabel,
      tags: ['Meal IQ', r.glycemicLoad ?? '', r.keyNutrient ?? ''].filter(Boolean),
      bpImpact: r.bpImpact,
      glucoseImpact: r.glucoseImpact,
      insight: r.insight,
      mealLabel: r.mealLabel,
      impactScore: r.impactScore,
    } as MealIQEvent);
  }

  // ── INSIGHTS: Correlation Markers ─────────────────────────────────────────
  // Rule: High-Sodium meal → Hypertension Stage 2 observation within user-configured window
  const mealEvents = events.filter((e): e is MealEvent => e.kind === 'meal');
  const vitalsEvents = events.filter((e): e is VitalsEvent => e.kind === 'vitals');

  for (const meal of mealEvents) {
    if (!meal.tags.includes('High Sodium')) continue;
    const mealMs = new Date(meal.timestamp).getTime();
    const WINDOW_MS = correlationWindowHours * 3_600_000;

    for (const vital of vitalsEvents) {
      if (vital.urgency !== 'stage2' && vital.urgency !== 'crisis') continue;
      const vitalMs = new Date(vital.timestamp).getTime();
      const delta = vitalMs - mealMs;
      if (delta < 0 || delta > WINDOW_MS) continue;

      const corrId = `corr-${meal.id}-${vital.id}`;
      const deltaMin = Math.round(delta / 60_000);

      // Mark both events as correlated
      meal.isCorrelated = true;
      meal.correlatedEventId = vital.id;
      meal.correlationLabel = 'Meal IQ Insight';
      vital.isCorrelated = true;
      vital.correlatedEventId = meal.id;
      vital.correlationLabel = 'Meal IQ Insight';

      events.push({
        id: corrId,
        timestamp: vital.timestamp,
        kind: 'correlation',
        category: 'INSIGHTS',
        urgency: 'stage2',
        title: 'Meal IQ Insight',
        subtitle: `High-Sodium meal → Hypertension +${deltaMin}m later`,
        tags: ['Meal IQ', 'High Sodium', 'Hypertension Stage 2'],
        inputEventId: meal.id,
        observationEventId: vital.id,
        correlationType: 'high_sodium_hypertension',
        deltaMinutes: deltaMin,
      } as CorrelationEvent);
    }
  }

  // Rule: Meal → Glucose spike (> 180 mg/dL) within half the correlation window (min 2h)
  const glucoseEvents = events.filter((e): e is GlucoseEvent => e.kind === 'glucose');

  for (const meal of mealEvents) {
    const mealMs = new Date(meal.timestamp).getTime();
    const WINDOW_MS = Math.max(2, correlationWindowHours / 2) * 3_600_000;

    for (const gluc of glucoseEvents) {
      if (gluc.mgDl <= 180) continue;
      const glucMs = new Date(gluc.timestamp).getTime();
      const delta = glucMs - mealMs;
      if (delta < 0 || delta > WINDOW_MS) continue;

      const corrId = `corr-gluc-${meal.id}-${gluc.id}`;
      const deltaMin = Math.round(delta / 60_000);

      meal.isCorrelated = true;
      gluc.isCorrelated = true;

      events.push({
        id: corrId,
        timestamp: gluc.timestamp,
        kind: 'correlation',
        category: 'INSIGHTS',
        urgency: 'elevated',
        title: 'Meal IQ Insight',
        subtitle: `Postprandial glucose spike +${deltaMin}m after meal`,
        tags: ['Meal IQ', 'Glucose Spike'],
        inputEventId: meal.id,
        observationEventId: gluc.id,
        correlationType: 'meal_glucose_spike',
        deltaMinutes: deltaMin,
      } as CorrelationEvent);
    }
  }

  // ── INPUTS: Medications (missed/skipped doses) ────────────────────────────
  const medications: Medication[] = (data as any).medications ?? [];
  for (const med of medications) {
    if (!med.active) continue;
    for (const log of (med.doseLogs ?? []) as DoseLog[]) {
      if (log.status === 'taken') continue; // only surface missed/skipped
      events.push({
        id: `med-${med.id}-${log.id}`,
        timestamp: log.loggedAt,
        kind: 'medication',
        category: 'INPUTS',
        urgency: log.status === 'missed' ? 'elevated' : 'normal',
        title: log.status === 'missed' ? `Missed: ${med.name}` : `Skipped: ${med.name}`,
        subtitle: `${med.dose} · scheduled ${log.scheduledTime}`,
        tags: [log.status === 'missed' ? 'Missed Dose' : 'Skipped Dose', med.dose],
        medicationId: med.id,
        medicationName: med.name,
        dose: med.dose,
        doseStatus: log.status,
        scheduledTime: log.scheduledTime,
      } as MedicationEvent);
    }
  }

  // ── OBSERVATIONS: Lab Results ─────────────────────────────────────────────
  const labResults: LabResult[] = (data as any).labResults ?? [];
  for (const lab of labResults) {
    // Count abnormal analytes
    let abnormalCount = 0;
    // We surface the event without deep analysis — just the panel and abnormal count
    events.push({
      id: `lab-${lab.id}`,
      timestamp: lab.timestamp,
      kind: 'lab',
      category: 'OBSERVATIONS',
      urgency: abnormalCount > 2 ? 'stage2' : abnormalCount > 0 ? 'elevated' : 'normal',
      title: `Lab Result: ${LAB_PANEL_LABELS[lab.panel] ?? lab.panel}`,
      subtitle: lab.labName ? `${lab.labName}${lab.note ? ` · ${lab.note}` : ''}` : (lab.note || undefined),
      tags: [lab.panel, lab.source === 'ocr' ? 'OCR Import' : 'Manual Entry'],
      labResultId: lab.id,
      panel: lab.panel,
      panelLabel: LAB_PANEL_LABELS[lab.panel] ?? lab.panel,
      abnormalCount,
    } as LabEvent);
  }

  // ── OBSERVATIONS: Appointments (upcoming within 7d + missed) ─────────────
  const appointments: DoctorAppointment[] = (data as any).appointments ?? [];
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 3_600_000;
  for (const appt of appointments) {
    const apptMs = new Date(appt.dateTime).getTime();
    const isUpcoming = apptMs > nowMs && apptMs - nowMs <= sevenDaysMs;
    const isMissed = apptMs < nowMs && !appt.missedOutcome;
    if (!isUpcoming && !isMissed) continue;
    const status = isUpcoming ? 'upcoming' : 'missed';
    const daysUntil = Math.ceil((apptMs - nowMs) / 86_400_000);
    events.push({
      id: `appt-${appt.id}`,
      timestamp: appt.dateTime,
      kind: 'appointment',
      category: 'OBSERVATIONS',
      urgency: isMissed ? 'elevated' : daysUntil <= 1 ? 'stage2' : 'normal',
      title: isUpcoming ? `Upcoming: ${appt.doctorName}` : `Missed: ${appt.doctorName}`,
      subtitle: appt.specialty ? `${appt.specialty}${appt.location ? ` · ${appt.location}` : ''}` : (appt.location || undefined),
      tags: [isUpcoming ? 'Upcoming' : 'Missed', ...(appt.specialty ? [appt.specialty] : [])],
      appointmentId: appt.id,
      doctorName: appt.doctorName,
      specialty: appt.specialty,
      appointmentStatus: status,
    } as AppointmentEvent);
  }

  // Sort all events by timestamp descending (most recent first)
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
