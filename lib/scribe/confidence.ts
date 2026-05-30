/**
 * lib/scribe/confidence.ts
 *
 * Confidence scoring for VitalSync Scribe auto-filled fields.
 *
 * Each field in a parsed result is annotated with a FieldConfidence:
 *   - "high"   → explicit keyword + numeric match with range validation
 *   - "medium" → partial keyword match or inferred from context
 *   - "low"    → fallback / first-word heuristic / ambiguous match
 *
 * The confidence map is a plain Record<fieldName, FieldConfidence | null>.
 * null means the field was not filled (no badge needed).
 */

export type FieldConfidence = 'high' | 'medium' | 'low';

export type ConfidenceMap<T> = {
  [K in keyof T]: FieldConfidence | null;
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function norm(text: string): string {
  try {
    return (text ?? '').toLowerCase().replace(/[^\w\s:./-]/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (_unused) {
    return '';
  }
}

// ─── 1. Vitals confidence ─────────────────────────────────────────────────────

export interface VitalsConfidence {
  systolic: FieldConfidence | null;
  diastolic: FieldConfidence | null;
  heartRate: FieldConfidence | null;
  spo2: FieldConfidence | null;
  temperature: FieldConfidence | null;
  respiratoryRate: FieldConfidence | null;
  note: FieldConfidence | null;
}

export function scoreVitalsConfidence(raw: string, parsed: {
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratoryRate: number | null;
  note: string | null;
}): VitalsConfidence {
  const t = norm(raw);
  return {
    systolic: parsed.systolic === null ? null
      : /(?:blood pressure|bp|b\.p\.?)\s*:?\s*\d{2,3}\s*(?:over|\/|and)\s*\d{2,3}/.test(t) ? 'high'
      : /\d{2,3}\s*(?:over|\/)\s*\d{2,3}/.test(t) ? 'medium'
      : 'low',

    diastolic: parsed.diastolic === null ? null
      : /(?:blood pressure|bp|b\.p\.?)\s*:?\s*\d{2,3}\s*(?:over|\/|and)\s*\d{2,3}/.test(t) ? 'high'
      : /\d{2,3}\s*(?:over|\/)\s*\d{2,3}/.test(t) ? 'medium'
      : 'low',

    heartRate: parsed.heartRate === null ? null
      : /(?:heart rate|heart-rate|pulse|hr|bpm)\s*:?\s*\d{2,3}/.test(t) ? 'high'
      : /\d{2,3}\s*(?:beats?(?:\s*per\s*minute)?|bpm)/.test(t) ? 'medium'
      : 'low',

    spo2: parsed.spo2 === null ? null
      : /(?:spo2|sp02|oxygen\s*sat(?:uration)?|o2\s*sat(?:uration)?|pulse\s*ox(?:imetry)?)\s*:?\s*\d{2,3}/.test(t) ? 'high'
      : /\d{2,3}\s*(?:percent\s*)?(?:oxygen|o2|spo2)/.test(t) ? 'medium'
      : 'low',

    temperature: parsed.temperature === null ? null
      : /(?:temp(?:erature)?)\s*:?\s*[\d.]+/.test(t) ? 'high'
      : /[\d.]+\s*(?:degrees?|fahrenheit|celsius|f\b|c\b)/.test(t) ? 'medium'
      : 'low',

    respiratoryRate: parsed.respiratoryRate === null ? null
      : /(?:respiratory\s*rate|resp(?:iration)?\s*rate|rr|breaths?\s*per\s*minute)\s*:?\s*\d{1,2}/.test(t) ? 'high'
      : /\d{1,2}\s*breaths?\s*(?:per\s*minute)?/.test(t) ? 'medium'
      : 'low',

    note: parsed.note === null ? null : 'high',
  };
}

// ─── 2. Sleep confidence ──────────────────────────────────────────────────────

export interface SleepConfidence {
  bedtime: FieldConfidence | null;
  wakeTime: FieldConfidence | null;
  durationMinutes: FieldConfidence | null;
  deepSleepMinutes: FieldConfidence | null;
  quality: FieldConfidence | null;
  note: FieldConfidence | null;
}

export function scoreSleepConfidence(raw: string, parsed: {
  bedtime: string | null;
  wakeTime: string | null;
  durationMinutes: number | null;
  deepSleepMinutes: number | null;
  quality: string | null;
  note: string | null;
}): SleepConfidence {
  const t = norm(raw);
  return {
    bedtime: parsed.bedtime === null ? null
      : /(?:went\s*to\s*bed|bedtime|fell\s*asleep|lights?\s*out|sleep(?:ing)?\s*at|bed\s*at)\s*(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/.test(t) ? 'high'
      : /\b(?:midnight|noon)\b/.test(t) ? 'medium'
      : 'low',

    wakeTime: parsed.wakeTime === null ? null
      : /(?:woke?\s*up|wake\s*time|got\s*up|alarm\s*at|woke\s*at|up\s*at)\s*(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/.test(t) ? 'high'
      : 'medium',

    durationMinutes: parsed.durationMinutes === null ? null
      : /(?:slept?\s*(?:for)?|sleep\s*duration|total\s*sleep)\s*[\d.]+\s*(?:hours?|hrs?)/.test(t) ? 'high'
      : 'medium',

    deepSleepMinutes: parsed.deepSleepMinutes === null ? null
      : /(?:deep\s*sleep|rem\s*sleep|stage\s*3|slow\s*wave)\s*(?:for\s*)?[\d.]+/.test(t) ? 'high'
      : 'medium',

    quality: parsed.quality === null ? null
      : /(?:sleep\s*quality|slept\s*(?:well|poorly|great|terribly|ok|okay))/.test(t) ? 'high'
      : 'medium',

    note: parsed.note === null ? null : 'high',
  };
}

// ─── 3. Activity confidence ───────────────────────────────────────────────────

export interface ActivityConfidence {
  durationMinutes: FieldConfidence | null;
  distanceKm: FieldConfidence | null;
  calories: FieldConfidence | null;
  steps: FieldConfidence | null;
  avgHeartRate: FieldConfidence | null;
  maxHeartRate: FieldConfidence | null;
  activityType: FieldConfidence | null;
  note: FieldConfidence | null;
}

export function scoreActivityConfidence(raw: string, parsed: {
  durationMinutes: number | null;
  distanceKm: number | null;
  calories: number | null;
  steps: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  activityType: string | null;
  note: string | null;
}): ActivityConfidence {
  const t = norm(raw);
  return {
    durationMinutes: parsed.durationMinutes === null ? null
      : /(?:in|for)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?)/.test(t) ? 'high'
      : 'medium',

    distanceKm: parsed.distanceKm === null ? null
      : /[\d.]+\s*(?:kilometers?|km\b|miles?|mi\b)/.test(t) ? 'high'
      : 'medium',

    calories: parsed.calories === null ? null
      : /(?:burned?|burnt)\s*\d+\s*(?:calories?|kcal)/.test(t) ? 'high'
      : /\d+\s*(?:calories?|kcal)/.test(t) ? 'medium'
      : 'low',

    steps: parsed.steps === null ? null
      : /\d[\d,]*\s*steps?/.test(t) ? 'high' : 'medium',

    avgHeartRate: parsed.avgHeartRate === null ? null
      : /(?:average|avg)\s*(?:heart\s*rate|hr|pulse)\s*\d{2,3}/.test(t) ? 'high' : 'medium',

    maxHeartRate: parsed.maxHeartRate === null ? null
      : /(?:max(?:imum)?)\s*(?:heart\s*rate|hr|pulse)\s*\d{2,3}/.test(t) ? 'high' : 'medium',

    activityType: parsed.activityType === null ? null
      : /\b(?:ran|run|running|walked|walk|walking|cycled|cycling|swam|swimming|hiked|hiking|yoga|pilates|gym|workout|exercise)\b/.test(t) ? 'high'
      : 'medium',

    note: parsed.note === null ? null : 'high',
  };
}

// ─── 4. Medication confidence ─────────────────────────────────────────────────

export interface MedicationConfidence {
  name: FieldConfidence | null;
  dose: FieldConfidence | null;
  frequency: FieldConfidence | null;
  route: FieldConfidence | null;
  indication: FieldConfidence | null;
  prescriber: FieldConfidence | null;
  note: FieldConfidence | null;
}

export function scoreMedicationConfidence(raw: string, parsed: {
  name: string | null;
  dose: string | null;
  frequency: string | null;
  route: string | null;
  indication: string | null;
  prescriber: string | null;
  note: string | null;
}, wasBrandName: boolean): MedicationConfidence {
  const _t = norm(raw);
  return {
    // High if the name was found at start of transcript with a dose following;
    // medium if it was resolved from a brand name; low if it was a fallback first-word
    name: parsed.name === null ? null
      : /^[A-Za-z][A-Za-z\s-]{1,40}?\s+(?:\d|daily|twice|three|four|weekly|as\s*needed|prn)/i.test(raw.trim()) ? 'high'
      : wasBrandName ? 'medium'
      : 'low',

    dose: parsed.dose === null ? null
      : /\d+(?:\.\d+)?\s*(?:milligrams?|micrograms?|mg|mcg|μg|ug|g\b|ml|mL|units?|tablets?|tabs?|capsules?|caps?|puffs?|drops?|patch(?:es)?)/.test(raw) ? 'high'
      : 'medium',

    frequency: parsed.frequency === null ? null
      : /\b(?:daily|twice|three\s*times?|four\s*times?|weekly|as\s*needed|prn|bid|tid|qid|qd)\b/i.test(raw) ? 'high'
      : 'medium',

    route: parsed.route === null ? null
      : /\b(?:oral|by\s*mouth|po|sublingual|topical|inhaled|injection|intravenous|iv|nasal|eye\s*drops|ear\s*drops)\b/i.test(raw) ? 'high'
      : 'medium',

    indication: parsed.indication === null ? null
      : /\bfor\s+[a-zA-Z\s]{3,40}/.test(raw) ? 'medium' : 'low',

    prescriber: parsed.prescriber === null ? null
      : /(?:prescribed\s*by|dr\.?)\s+[A-Z][a-z]+/i.test(raw) ? 'high' : 'medium',

    note: parsed.note === null ? null : 'high',
  };
}

// ─── 5. Appointment confidence ────────────────────────────────────────────────

export interface AppointmentConfidence {
  doctorName: FieldConfidence | null;
  specialty: FieldConfidence | null;
  date: FieldConfidence | null;
  time: FieldConfidence | null;
  location: FieldConfidence | null;
  referredBy: FieldConfidence | null;
  notes: FieldConfidence | null;
}

export function scoreAppointmentConfidence(raw: string, parsed: {
  doctorName: string | null;
  specialty: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  referredBy: string | null;
  notes: string | null;
}): AppointmentConfidence {
  const t = norm(raw);
  return {
    doctorName: parsed.doctorName === null ? null
      : /(?:with|see|seeing|appointment\s*with|visit\s*with)\s*dr\.?\s+[a-z]+/i.test(t) ? 'high'
      : /dr\.?\s+[a-z]+/i.test(t) ? 'medium'
      : 'low',

    specialty: parsed.specialty === null ? null
      : /\b(?:cardiolog|neurolog|dermatolog|oncolog|orthoped|pediatric|psychiatr|pulmonolog|rheumatolog|urolog|gastroenterolog|endocrinolog|nephrolog|ophthalmolog|gynecolog|obstetric|geriatric|allergist|immunolog|hematolog|infectiou|plastic\s*surg|vascular|general\s*surg|family\s*med|internal\s*med|emergency|radiol|patholog|anesthesiol|physical\s*therap|occupational\s*therap|speech\s*therap|dentist|optometrist|audiolog|podiatrist|chiropract|psycholog|social\s*work)/i.test(raw) ? 'high'
      : 'medium',

    date: parsed.date === null ? null
      : /(?:on|at|for)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]\d{1,2})/i.test(raw) ? 'high'
      : /(?:tomorrow|next\s*week|this\s*week|today)/i.test(raw) ? 'medium'
      : 'low',

    time: parsed.time === null ? null
      : /\d{1,2}(?::\d{2})?\s*(?:am|pm)/i.test(raw) ? 'high' : 'medium',

    location: parsed.location === null ? null
      : /(?:at|in)\s+(?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:hospital|clinic|center|centre|office|building)/i.test(raw) ? 'high'
      : 'medium',

    referredBy: parsed.referredBy === null ? null
      : /(?:referred\s*by|referral\s*from)/i.test(raw) ? 'high' : 'medium',

    notes: parsed.notes === null ? null
      : /(?:note|bring|remember|reminder|notes?|follow\s*up\s*for|reason\s*for\s*visit)/i.test(raw) ? 'high'
      : 'medium',
  };
}

// ─── 6. Procedure confidence ──────────────────────────────────────────────────

export interface ProcedureConfidence {
  procedureName: FieldConfidence | null;
  surgeon: FieldConfidence | null;
  hospital: FieldConfidence | null;
  date: FieldConfidence | null;
  outcome: FieldConfidence | null;
  complications: FieldConfidence | null;
  anesthesia: FieldConfidence | null;
  duration: FieldConfidence | null;
  notes: FieldConfidence | null;
}

export function scoreProcedureConfidence(raw: string, parsed: {
  procedureName: string | null;
  surgeon: string | null;
  hospital: string | null;
  date: string | null;
  outcome: string | null;
  complications: string | null;
  anesthesia: string | null;
  duration: string | null;
  notes: string | null;
}): ProcedureConfidence {
  const t = norm(raw);
  return {
    procedureName: parsed.procedureName === null ? null
      : /(?:had|underwent|received|procedure|surgery|operation)\s+(?:a\s+)?[a-z]+/i.test(t) ? 'high'
      : 'medium',

    surgeon: parsed.surgeon === null ? null
      : /(?:surgeon|performed\s*by|operated\s*by|dr\.?)\s+[a-z]+/i.test(t) ? 'high' : 'medium',

    hospital: parsed.hospital === null ? null
      : /(?:at|in)\s+(?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:hospital|medical\s*center|clinic|surgical\s*center)/i.test(raw) ? 'high'
      : 'medium',

    date: parsed.date === null ? null
      : /(?:on|in)\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]\d{1,2})/i.test(raw) ? 'high'
      : 'medium',

    outcome: parsed.outcome === null ? null
      : /(?:outcome|result|went|successful|uncomplicated|complicated)/i.test(raw) ? 'high' : 'medium',

    complications: parsed.complications === null ? null
      : /(?:no\s*complications?|complication|bleeding|infection|adverse)/i.test(raw) ? 'high' : 'medium',

    anesthesia: parsed.anesthesia === null ? null
      : /(?:general|local|regional|spinal|epidural|sedation)\s*anesthesia/i.test(raw) ? 'high' : 'medium',

    duration: parsed.duration === null ? null
      : /(?:took|lasted|duration)\s*\d+\s*(?:hours?|minutes?)/i.test(raw) ? 'high' : 'medium',

    notes: parsed.notes === null ? null : 'high',
  };
}

// ─── 7. Immunization confidence ───────────────────────────────────────────────

export interface ImmunizationConfidence {
  vaccineName: FieldConfidence | null;
  lotNumber: FieldConfidence | null;
  doseNumber: FieldConfidence | null;
  seriesTotal: FieldConfidence | null;
  administeredBy: FieldConfidence | null;
  site: FieldConfidence | null;
  route: FieldConfidence | null;
  reactions: FieldConfidence | null;
  nextDoseDate: FieldConfidence | null;
  notes: FieldConfidence | null;
}

export function scoreImmunizationConfidence(raw: string, parsed: {
  vaccineName: string | null;
  lotNumber: string | null;
  doseNumber: number | null;
  seriesTotal: number | null;
  administeredBy: string | null;
  site: string | null;
  route: string | null;
  reactions: string | null;
  nextDoseDate: string | null;
  notes: string | null;
}): ImmunizationConfidence {
  const _t = norm(raw);
  return {
    vaccineName: parsed.vaccineName === null ? null
      : /\b(?:flu|influenza|covid|covid-19|tdap|mmr|hep\s*[ab]|hepatitis|hpv|pneumo(?:coccal)?|shingles|varicella|chickenpox|polio|rsv|rabies|typhoid|yellow\s*fever|meningococcal|rotavirus|dtap|dtp|td\b|zoster|prevnar|gardasil|moderna|pfizer|johnson|astrazeneca|novavax)\b/i.test(raw) ? 'high'
      : 'medium',

    lotNumber: parsed.lotNumber === null ? null
      : /(?:lot|batch|lot\s*number|batch\s*number)\s*(?:number|#|no\.?)?\s*[A-Za-z0-9-]{3,}/i.test(raw) ? 'high' : 'medium',

    doseNumber: parsed.doseNumber === null ? null
      : /(?:dose|shot)\s*(?:number|#|no\.?)?\s*\d+/i.test(raw) ? 'high'
      : /(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s*(?:dose|shot)/i.test(raw) ? 'high'
      : 'medium',

    seriesTotal: parsed.seriesTotal === null ? null
      : /(?:dose|shot)\s*\d+\s*of\s*\d+/i.test(raw) ? 'high' : 'medium',

    administeredBy: parsed.administeredBy === null ? null
      : /(?:given|administered|received)\s+(?:at|by)\s+[A-Za-z]/i.test(raw) ? 'high' : 'medium',

    site: parsed.site === null ? null
      : /(?:left|right)\s*(?:arm|thigh|deltoid)/i.test(raw) ? 'high'
      : /\b(?:arm|thigh|deltoid|buttock|glute)\b/i.test(raw) ? 'medium'
      : 'low',

    route: parsed.route === null ? null
      : /\b(?:intramuscular|im\b|subcutaneous|subcut|intradermal|oral|intranasal)\b/i.test(raw) ? 'high' : 'medium',

    reactions: parsed.reactions === null ? null
      : /(?:reaction|side\s*effect|adverse|no\s*reaction|tolerated\s*well)/i.test(raw) ? 'high'
      : /\b(?:soreness|redness|swelling|fever|pain|bruising|itching|nausea|fatigue|chills|headache)\b/i.test(raw) ? 'medium'
      : 'low',

    nextDoseDate: parsed.nextDoseDate === null ? null
      : /(?:next\s*dose|follow\s*up|booster)\s*(?:on|in|at)?/i.test(raw) ? 'high' : 'medium',

    notes: parsed.notes === null ? null : 'high',
  };
}
