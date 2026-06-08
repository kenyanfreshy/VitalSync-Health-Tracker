/**
 * lib/scribe/parsers.ts
 * @see lib/scribe/drug-names.ts for brand-name resolution
 * @see lib/scribe/confidence.ts for field confidence scoring
 *
 * Client-side structured voice-to-form parsers for VitalSync Scribe.
 *
 * Each parser:
 *  - Accepts a raw transcript string (may be partial, noisy, or empty)
 *  - Returns a typed result object where every field is null when not found
 *  - Never throws — all logic is wrapped in try/catch
 *  - Is null-safe: handles undefined, empty string, and unexpected phrases
 *
 * These parsers run entirely on-device (no network required).
 * The server LLM endpoint remains available as an optional enhancement
 * for ambiguous phrases after the local parse completes.
 */

import { resolveGenericName } from './drug-names';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Normalise transcript: lowercase, collapse whitespace, strip punctuation. */
function norm(text: string): string {
  try {
    return (text ?? '')
      .toLowerCase()
      .replace(/[^\w\s:./-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (_unused) {
    return '';
  }
}

/** Extract the first integer that follows any of the given keyword patterns. */
function extractIntAfter(text: string, patterns: RegExp[]): number | null {
  try {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const n = parseInt(m[1] ?? m[0], 10);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  } catch (_unused) {
    return null;
  }
}

/** Extract the first float that follows any of the given keyword patterns. */
function extractFloatAfter(text: string, patterns: RegExp[]): number | null {
  try {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const n = parseFloat(m[1] ?? m[0]);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  } catch (_unused) {
    return null;
  }
}

/** Clamp a number to [min, max]; return null if out of range. */
function clamp(n: number | null, min: number, max: number): number | null {
  if (n === null) return null;
  return n >= min && n <= max ? n : null;
}

// ─── 1. Vital Signs Parser ────────────────────────────────────────────────────

export interface ParsedVitals {
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratoryRate: number | null;
  note: string | null;
}

/**
 * Parse a free-form speech transcript into vital sign fields.
 *
 * Handles phrases like:
 *   "BP 120 over 80, heart rate 72, oxygen sat 98 percent, temp 98.6"
 *   "blood pressure one twenty over eighty, pulse sixty five"
 *   "respiratory rate 16, SpO2 97"
 */
export function parseVitalsTranscript(raw: string): ParsedVitals {
  const result: ParsedVitals = {
    systolic: null, diastolic: null, heartRate: null,
    spo2: null, temperature: null, respiratoryRate: null, note: null,
  };
  try {
    const t = norm(raw);

    // ── Blood pressure: "120 over 80", "120/80", "bp 120 80" ──────────────
    const bpPatterns = [
      /(?:blood pressure|bp|b\.p\.?)\s*:?\s*(\d{2,3})\s*(?:over|\/|and)\s*(\d{2,3})/,
      /(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/,
    ];
    for (const p of bpPatterns) {
      const m = t.match(p);
      if (m) {
        const sys = parseInt(m[1], 10);
        const dia = parseInt(m[2], 10);
        if (!isNaN(sys) && !isNaN(dia)) {
          result.systolic = clamp(sys, 60, 250);
          result.diastolic = clamp(dia, 30, 150);
          break;
        }
      }
    }

    // ── Heart rate: "heart rate 72", "pulse 65", "hr 80" ──────────────────
    result.heartRate = clamp(
      extractIntAfter(t, [
        /(?:heart rate|heart-rate|pulse|hr|bpm)\s*:?\s*(\d{2,3})/,
        /(\d{2,3})\s*(?:beats?(?:\s*per\s*minute)?|bpm)/,
      ]),
      30, 250,
    );

    // ── SpO2: "oxygen sat 98", "spo2 97", "o2 sat 99 percent" ─────────────
    result.spo2 = clamp(
      extractIntAfter(t, [
        /(?:spo2|sp02|oxygen\s*sat(?:uration)?|o2\s*sat(?:uration)?|pulse\s*ox(?:imetry)?)\s*:?\s*(\d{2,3})/,
        /(\d{2,3})\s*(?:percent\s*)?(?:oxygen|o2|spo2)/,
      ]),
      70, 100,
    );

    // ── Temperature: "temp 98.6", "temperature 37.2" ──────────────────────
    const tempRaw = extractFloatAfter(t, [
      /(?:temp(?:erature)?)\s*:?\s*(\d{2,3}(?:\.\d)?)/,
      /(\d{2,3}(?:\.\d)?)\s*(?:degrees?|fahrenheit|celsius|f\b|c\b)/,
    ]);
    if (tempRaw !== null) {
      // Auto-detect Celsius vs Fahrenheit by magnitude
      if (tempRaw >= 35 && tempRaw <= 42) {
        result.temperature = tempRaw; // Celsius
      } else if (tempRaw >= 95 && tempRaw <= 108) {
        result.temperature = tempRaw; // Fahrenheit — store as-is, UI converts
      }
    }

    // ── Respiratory rate: "respiratory rate 16", "resp rate 18", "rr 14" ──
    result.respiratoryRate = clamp(
      extractIntAfter(t, [
        /(?:respiratory\s*rate|resp(?:iration)?\s*rate|rr|breaths?\s*per\s*minute)\s*:?\s*(\d{1,2})/,
        /(\d{1,2})\s*breaths?\s*(?:per\s*minute)?/,
      ]),
      4, 60,
    );

    // ── Note: everything after "note:" or "comment:" ──────────────────────
    const noteMatch = raw.match(/(?:note|comment|notes?)\s*:?\s*(.+)/i);
    if (noteMatch) result.note = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return whatever was filled before the error
  }
  return result;
}

// ─── 2. Sleep Parser ──────────────────────────────────────────────────────────

export interface ParsedSleep {
  bedtime: string | null;       // "HH:MM" 24-hour
  wakeTime: string | null;      // "HH:MM" 24-hour
  durationMinutes: number | null;
  deepSleepMinutes: number | null;
  quality: 'poor' | 'fair' | 'good' | 'excellent' | null;
  note: string | null;
}

/** Parse "HH:MM", "H:MM am/pm", "10 pm", "22:00" → "HH:MM" 24-hour string or null. */
function parseTimeString(s: string): string | null {
  try {
    // "10:30 pm" / "10:30pm"
    const fullMatch = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (fullMatch) {
      let h = parseInt(fullMatch[1], 10);
      const m = parseInt(fullMatch[2], 10);
      const ampm = (fullMatch[3] ?? '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    // "10 pm" / "10pm"
    const shortMatch = s.match(/(\d{1,2})\s*(am|pm)/i);
    if (shortMatch) {
      let h = parseInt(shortMatch[1], 10);
      const ampm = shortMatch[2].toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (h >= 0 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }
    return null;
  } catch (_unused) {
    return null;
  }
}

/** Convert "X hours Y minutes" / "X hrs" / "Xh Ym" to total minutes. */
function parseDurationToMinutes(text: string): number | null {
  try {
    let total = 0;
    const hrMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i);
    const minMatch = text.match(/(\d+)\s*(?:minutes?|mins?|m\b)/i);
    if (hrMatch) total += parseFloat(hrMatch[1]) * 60;
    if (minMatch) total += parseInt(minMatch[1], 10);
    return total > 0 ? Math.round(total) : null;
  } catch (_unused) {
    return null;
  }
}

export function parseSleepTranscript(raw: string): ParsedSleep {
  const result: ParsedSleep = {
    bedtime: null, wakeTime: null, durationMinutes: null,
    deepSleepMinutes: null, quality: null, note: null,
  };
  try {
    const _t = norm(raw);

    // ── Bedtime ────────────────────────────────────────────────────────────
    const bedMatch = raw.match(
      /(?:went\s*to\s*bed|bedtime|fell\s*asleep|lights?\s*out|sleep(?:ing)?\s*at|\bbed\s*at)\s*(?:at\s*)?([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)/i,
    );
    if (bedMatch) {
      result.bedtime = parseTimeString(bedMatch[1]);
    } else if (/\bmidnight\b/i.test(raw)) {
      result.bedtime = '00:00';
    } else if (/\bnoon\b/i.test(raw)) {
      result.bedtime = '12:00';
    }

    // ── Wake time ──────────────────────────────────────────────────────────
    const wakeMatch = raw.match(
      /(?:woke?\s*up|wake\s*time|got\s*up|alarm\s*at|woke\s*at|\bup\s*at)\s*(?:at\s*)?([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)/i,
    );
    if (wakeMatch) result.wakeTime = parseTimeString(wakeMatch[1]);

    // ── Duration ───────────────────────────────────────────────────────────
    const durMatch = raw.match(
      /(?:slept?\s*(?:for)?|sleep\s*duration|total\s*sleep)\s*([\d.]+\s*(?:hours?|hrs?|h\b)[^.]*)/i,
    );
    if (durMatch) result.durationMinutes = parseDurationToMinutes(durMatch[1]);

    // Fallback: compute from bed + wake if both parsed
    if (result.durationMinutes === null && result.bedtime && result.wakeTime) {
      const [bh, bm] = result.bedtime.split(':').map(Number);
      const [wh, wm] = result.wakeTime.split(':').map(Number);
      let diff = (wh * 60 + wm) - (bh * 60 + bm);
      if (diff < 0) diff += 24 * 60; // crossed midnight
      if (diff > 0 && diff <= 14 * 60) result.durationMinutes = diff;
    }

    // ── Deep sleep ─────────────────────────────────────────────────────────
    const deepMatch = raw.match(
      /(?:deep\s*sleep|slow\s*wave)\s*(?:was\s*|for\s*|of\s*)?(\d+[\d.]*\s*(?:hours?|hrs?|h\b|minutes?|mins?|m\b)[^.]*)/i,
    );
    if (deepMatch) {
      result.deepSleepMinutes = parseDurationToMinutes(deepMatch[1]);
    } else {
      // Fallback: "45 minutes of deep sleep" — number precedes the keyword
      const deepFallback = raw.match(/(\d+)\s*(?:minutes?|mins?)\s*(?:of\s*)?deep\s*sleep/i);
      if (deepFallback) result.deepSleepMinutes = parseInt(deepFallback[1], 10);
    }

    // ── Quality ────────────────────────────────────────────────────────────
    if (/\b(?:excellent|great|perfect|amazing)\b/i.test(raw)) result.quality = 'excellent';
    else if (/\b(?:good|well|fine)\b/i.test(raw)) result.quality = 'good';
    else if (/\b(?:fair|ok(?:ay)?|average|mediocre)\b/i.test(raw)) result.quality = 'fair';
    else if (/\b(?:poor|bad|terrible|awful|rough|restless)\b/i.test(raw)) result.quality = 'poor';

    // ── Note ───────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment)\s*:?\s*(.+)/i);
    if (noteMatch) result.note = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return partial result
  }
  return result;
}

// ─── 3. Activity Parser ───────────────────────────────────────────────────────

export interface ParsedActivity {
  durationMinutes: number | null;
  distanceKm: number | null;
  calories: number | null;
  steps: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  activityType: string | null;
  note: string | null;
}

export function parseActivityTranscript(raw: string): ParsedActivity {
  const result: ParsedActivity = {
    durationMinutes: null, distanceKm: null, calories: null,
    steps: null, avgHeartRate: null, maxHeartRate: null,
    activityType: null, note: null,
  };
  try {
    const t = norm(raw);

    // ── Duration ───────────────────────────────────────────────────────────────
    // Match "in 30 minutes", "for 30 minutes", "1 hour 20 minutes", "30 min"
    const durMatch = raw.match(/(?:in|for)\s*(\d+[\d.]*\s*(?:hours?|hrs?|h\b)[^.]*)/i)
      ?? raw.match(/(?:in|for)\s*(\d+\s*(?:minutes?|mins?))/i)
      ?? raw.match(/(\d+[\d.]*\s*(?:hours?|hrs?|h\b)[^.]*)/i)
      ?? raw.match(/(?:ran|walked|cycled|swam|worked\s*out|exercised|hiked)\s*(?:for\s*)?(\d+[\d.]*\s*(?:minutes?|mins?|m\b))/i);
    if (durMatch) result.durationMinutes = parseDurationToMinutes(durMatch[1]);

    // ── Distance ───────────────────────────────────────────────────────────────
    const distMatch = raw.match(/([\d.]+)\s*(?:kilometers?|km\b)/i);
    if (distMatch) {
      result.distanceKm = parseFloat(distMatch[1]);
    } else {
      const miMatch = raw.match(/([\d.]+)\s*(?:miles?|mi\b)/i);
      if (miMatch) result.distanceKm = parseFloat(miMatch[1]) * 1.60934;
    }

    // ── Calories ───────────────────────────────────────────────────────────
    result.calories = clamp(
      extractIntAfter(t, [
        /(?:calories?|kcal|cal)\s*:?\s*(\d{2,4})/,
        /(\d{2,4})\s*(?:calories?|kcal|cal)/,
        /burned?\s*(\d{2,4})/,
      ]),
      50, 5000,
    );

    // ── Steps ──────────────────────────────────────────────────────────────
    result.steps = clamp(
      extractIntAfter(t, [
        /(?:steps?)\s*:?\s*(\d{3,6})/,
        /(\d{3,6})\s*steps?/,
      ]),
      100, 100000,
    );

    // ── Heart rate ─────────────────────────────────────────────────────────
    result.avgHeartRate = clamp(
      extractIntAfter(t, [
        /(?:average|avg)\s*(?:heart\s*rate|hr|pulse)\s*:?\s*(\d{2,3})/,
        /(?:heart\s*rate|hr|pulse)\s*(?:average|avg)\s*:?\s*(\d{2,3})/,
      ]),
      30, 250,
    );
    result.maxHeartRate = clamp(
      extractIntAfter(t, [
        /(?:max(?:imum)?)\s*(?:heart\s*rate|hr|pulse)\s*:?\s*(\d{2,3})/,
        /(?:heart\s*rate|hr|pulse)\s*(?:max(?:imum)?)\s*:?\s*(\d{2,3})/,
      ]),
      30, 250,
    );

    // ── Activity type ──────────────────────────────────────────────────────
    // Order matters: more specific phrases first
    // NOTE: values must match ActivityType keys in ACTIVITY_TYPE_META (hyphen-separated)
    const typeMap: [RegExp, string][] = [
      [/\boutdoor\s*run(?:ning)?\b/i, 'outdoor-run'],
      [/\btreadmill\b/i, 'indoor-run'],
      [/\bindoor\s*run(?:ning)?\b/i, 'indoor-run'],
      [/\b(?:ran|run(?:ning)?)\b/i, 'outdoor-run'],
      [/\b(?:jog(?:ged|ging)?)\b/i, 'outdoor-run'],
      [/\b(?:cycl(?:ed|ing)|bik(?:ed|ing))\b/i, 'cycling'],
      // swimming, hiking, yoga, pilates, etc. map to nearest supported type
      [/\b(?:swim(?:ming)?|swam)\b/i, 'workout'],
      [/\b(?:hik(?:ed|ing)?)\b/i, 'walk'],
      [/\b(?:yoga|pilates|stretch(?:ing)?|aerobics?)\b/i, 'workout'],
      [/\b(?:walk(?:ed|ing)?)\b/i, 'walk'],
      [/\b(?:gym|weight\s*train|strength\s*train|workout|worked\s*out)\b/i, 'workout'],
    ];
    for (const [pattern, type] of typeMap) {
      if (pattern.test(raw)) { result.activityType = type; break; }
    }

    // ── Note ───────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment)\s*:?\s*(.+)/i);
    if (noteMatch) result.note = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return partial result
  }
  return result;
}

// ─── 4. Medication Parser ─────────────────────────────────────────────────────

export interface ParsedMedication {
  name: string | null;
  dose: string | null;
  frequency: 'daily' | 'twice_daily' | 'three_times_daily' | 'four_times_daily' | 'weekly' | 'as_needed' | 'custom' | null;
  route: string | null;
  indication: string | null;
  prescriber: string | null;
  note: string | null;
  unit?: string | null;
  quantity?: string | null;
  rxNumber?: string | null;
  fillDate?: string | null;
  refillCounty?: string | null;
  reason?: string | null;
  pharmacy?: string | null;
}

const FREQ_MAP: [RegExp, ParsedMedication['frequency']][] = [
  [/\b(?:four\s*times?\s*(?:a\s*)?(?:day|daily)|qid|q\.i\.d\.?|4x\s*(?:a\s*)?day)\b/i, 'four_times_daily'],
  [/\b(?:three\s*times?\s*(?:a\s*)?(?:day|daily)|tid|t\.i\.d\.?|3x\s*(?:a\s*)?day)\b/i, 'three_times_daily'],
  [/\b(?:twice\s*(?:a\s*)?(?:day|daily)|two\s*times?\s*(?:a\s*)?(?:day|daily)|bid|b\.i\.d\.?|2x\s*(?:a\s*)?day)\b/i, 'twice_daily'],
  [/\b(?:once\s*(?:a\s*)?(?:day|daily)|once\s*daily|every\s*day|daily|qd|q\.d\.?|1x\s*(?:a\s*)?day)\b/i, 'daily'],
  [/\b(?:once\s*(?:a\s*)?week|weekly|every\s*week)\b/i, 'weekly'],
  [/\b(?:as\s*needed|prn|p\.r\.n\.?|when\s*needed|on\s*demand)\b/i, 'as_needed'],
];

export function parseMedicationTranscript(raw: string): ParsedMedication {
  const result: ParsedMedication = {
    name: null, dose: null, frequency: null,
    route: null, indication: null, prescriber: null, note: null,
  };
  try {
    const t = norm(raw);

    // ── Dose: "500 mg", "10 mcg", "2 tablets" ───────────────────────────────────────────
    const doseMatch = raw.match(/(\d+(?:\.\d+)?)\s*(milligrams?|micrograms?|mg|mcg|μg|ug|g\b|ml|mL|units?|tablets?|tabs?|capsules?|caps?|puffs?|drops?|patch(?:es)?)/i);
    if (doseMatch) result.dose = `${doseMatch[1]} ${doseMatch[2]}`;

    // ── Frequency ──────────────────────────────────────────────────────────
    for (const [pattern, freq] of FREQ_MAP) {
      if (pattern.test(raw)) { result.frequency = freq; break; }
    }

    // ── Route ──────────────────────────────────────────────────────────────
    const routeMap: Record<string, string> = {
      'oral': 'oral', 'by mouth': 'oral', 'po': 'oral', 'p.o.': 'oral',
      'sublingual': 'sublingual', 'under the tongue': 'sublingual',
      'topical': 'topical', 'on the skin': 'topical',
      'inhaled': 'inhaled', 'inhaler': 'inhaled',
      'injection': 'injection', 'injected': 'injection', 'subcutaneous': 'subcutaneous',
      'intravenous': 'intravenous', 'iv': 'intravenous',
      'nasal': 'nasal', 'eye drops': 'ophthalmic', 'ear drops': 'otic',
    };
    for (const [phrase, route] of Object.entries(routeMap)) {
      if (t.includes(phrase)) { result.route = route; break; }
    }

    // ── Indication: "for [condition]" ─────────────────────────────────────
    const indicationMatch = raw.match(/\bfor\s+([a-zA-Z\s]{3,40}?)(?:\s*,|\s*\.|\s*$)/i);
    if (indicationMatch) result.indication = indicationMatch[1].trim();

    // ── Prescriber: "prescribed by Dr. Smith" ─────────────────────────────
    const prescriberMatch = raw.match(/(?:prescribed\s*by|doctor|dr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (prescriberMatch) result.prescriber = prescriberMatch[1].trim();

    // ── Medication name: first capitalized word(s) before dose ────────────
    // Strategy: take the first 1-3 words before the dose number or frequency
    let rawName: string | null = null;
    const nameMatch = raw.match(/^([A-Za-z][A-Za-z\s-]{1,40}?)\s+(?:\d|daily|twice|three|four|weekly|as\s*needed|prn)/i);
    if (nameMatch) {
      const candidate = nameMatch[1].trim();
      // Filter out common filler words
      if (!/^(?:take|taking|i\s*take|my|the|a|an)\s/i.test(candidate)) {
        rawName = candidate;
      }
    }
    // Fallback: first word if it looks like a drug name (starts with capital or is a known drug)
    if (!rawName) {
      const firstWord = raw.trim().split(/\s+/)[0];
      if (firstWord && /^[A-Za-z]{3,}/.test(firstWord)) {
        // Exclude obvious non-drug starters
        if (!/^(?:take|taking|i|my|the|a|an|give|given|prescribed|medication|drug)$/i.test(firstWord)) {
          rawName = firstWord;
        }
      }
    }
    // Resolve brand name → generic
    if (rawName) {
      const { name: resolved } = resolveGenericName(rawName);
      result.name = resolved;
    }

    // ── Note ───────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment)\s*:?\s*(.+)/i);
    if (noteMatch) result.note = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return partial result
  }
  return result;
}

// ─── 5. Appointment Parser ────────────────────────────────────────────────────

export interface ParsedAppointment {
  doctorName: string | null;
  specialty: string | null;
  dateTime: string | null;   // ISO 8601 string or partial date string
  location: string | null;
  notes: string | null;
  referredBy: string | null;
}

const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

function parseAppointmentDate(raw: string): string | null {
  try {
    const t = raw.toLowerCase();

    // "on the 15th", "on the 3rd of March", "March 15th", "15 March"
    const monthDayMatch = t.match(
      /(?:(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+))/,
    );
    if (monthDayMatch) {
      const monthWord = (monthDayMatch[1] ?? monthDayMatch[4] ?? '').toLowerCase();
      const dayStr = monthDayMatch[2] ?? monthDayMatch[3];
      const monthNum = MONTH_MAP[monthWord];
      if (monthNum && dayStr) {
        const day = parseInt(dayStr, 10);
        const year = new Date().getFullYear();
        const d = new Date(year, monthNum - 1, day);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
    }

    // "next Monday", "this Friday"
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const relMatch = t.match(/(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (relMatch) {
      const targetDay = dayNames.indexOf(relMatch[1].toLowerCase());
      if (targetDay >= 0) {
        const today = new Date();
        const diff = (targetDay - today.getDay() + 7) % 7 || 7;
        const d = new Date(today);
        d.setDate(today.getDate() + diff);
        return d.toISOString().split('T')[0];
      }
    }

    // "tomorrow"
    if (/\btomorrow\b/i.test(raw)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }

    return null;
  } catch (_unused) {
    return null;
  }
}

const SPECIALTY_KEYWORDS: Record<string, string> = {
  cardio: 'Cardiology', heart: 'Cardiology',
  neuro: 'Neurology', brain: 'Neurology',
  ortho: 'Orthopedics', bone: 'Orthopedics', joint: 'Orthopedics',
  derma: 'Dermatology', skin: 'Dermatology',
  endo: 'Endocrinology', diabetes: 'Endocrinology', thyroid: 'Endocrinology',
  gastro: 'Gastroenterology', stomach: 'Gastroenterology', colon: 'Gastroenterology',
  pulmo: 'Pulmonology', lung: 'Pulmonology',
  nephro: 'Nephrology', kidney: 'Nephrology',
  oncol: 'Oncology', cancer: 'Oncology',
  ophthal: 'Ophthalmology', eye: 'Ophthalmology',
  ent: 'ENT', ear: 'ENT', nose: 'ENT', throat: 'ENT',
  psych: 'Psychiatry', mental: 'Psychiatry',
  gp: 'General Practice', primary: 'General Practice', family: 'General Practice',
  ob: 'OB/GYN', gyn: 'OB/GYN', obgyn: 'OB/GYN',
  urol: 'Urology',
  rheum: 'Rheumatology',
  allerg: 'Allergy & Immunology',
  physio: 'Physical Therapy', pt: 'Physical Therapy',
};

export function parseAppointmentTranscript(raw: string): ParsedAppointment {
  const result: ParsedAppointment = {
    doctorName: null, specialty: null, dateTime: null,
    location: null, notes: null, referredBy: null,
  };
  try {
    const t = norm(raw);

    // ── Doctor name ────────────────────────────────────────────────────────
    const drMatch = raw.match(/(?:dr\.?\s+|doctor\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (drMatch) result.doctorName = `Dr. ${drMatch[1].trim()}`;

    // ── Specialty ──────────────────────────────────────────────────────────
    for (const [keyword, specialty] of Object.entries(SPECIALTY_KEYWORDS)) {
      if (t.includes(keyword)) { result.specialty = specialty; break; }
    }

    // ── Date/time ──────────────────────────────────────────────────────────
    const dateStr = parseAppointmentDate(raw);
    const timeMatch = raw.match(/(?:at\s+)?([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm))/i);
    if (dateStr && timeMatch) {
      result.dateTime = `${dateStr}T${parseTimeString(timeMatch[1]) ?? '09:00'}`;
    } else if (dateStr) {
      result.dateTime = dateStr;
    }

    // ── Location ───────────────────────────────────────────────────────────
    const locMatch = raw.match(/(?:at|in|location|clinic|hospital|office)\s+([A-Z][A-Za-z\s]{2,40}?)(?:\s*,|\s*\.|\s*$)/i);
    if (locMatch) result.location = locMatch[1].trim();

    // ── Referred by ────────────────────────────────────────────────────────
    const refMatch = raw.match(/(?:referred\s*by|referral\s*from)\s+(?:dr\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (refMatch) result.referredBy = refMatch[1].trim();

    // ── Notes ──────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|bring|remember|reminder|notes?|follow\s*up\s*for|reason\s*for\s*visit)\s*:?\s*(.+)/i);
    if (noteMatch) result.notes = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return partial result
  }
  return result;
}

// ─── 6. Procedure / Surgical History Parser ───────────────────────────────────

export interface ParsedProcedure {
  procedure: string | null;
  surgeon: string | null;
  hospital: string | null;
  date: string | null;         // ISO date string
  outcome: string | null;
  complications: string | null;
  notes: string | null;
}

export function parseProcedureTranscript(raw: string): ParsedProcedure {
  const result: ParsedProcedure = {
    procedure: null, surgeon: null, hospital: null,
    date: null, outcome: null, complications: null, notes: null,
  };
  try {
    const _t = norm(raw);

    // ── Procedure name: first noun phrase before "by" or "at" ─────────────
    const procMatch = raw.match(/^([A-Za-z][A-Za-z\s-]{2,60}?)(?:\s+(?:by|at|on|in|performed)\b)/i)
      ?? raw.match(/(?:had|underwent|received|procedure|surgery|operation)\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s-]{2,60}?)(?:\s*,|\s*\.|\s*$)/i);
    if (procMatch) result.procedure = procMatch[1].trim();

    // ── Surgeon ────────────────────────────────────────────────────────────
    const surgMatch = raw.match(/(?:by\s+dr\.?\s*|surgeon\s+dr\.?\s*|performed\s+by\s+dr\.?\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (surgMatch) result.surgeon = `Dr. ${surgMatch[1].trim()}`;

    // ── Hospital / facility ────────────────────────────────────────────────
    const hospMatch = raw.match(/(?:at|in|hospital|clinic|center|center|facility)\s+([A-Z][A-Za-z\s]{2,40}?)(?:\s*,|\s*\.|\s*$)/i);
    if (hospMatch) result.hospital = hospMatch[1].trim();

    // ── Date ───────────────────────────────────────────────────────────────
    result.date = parseAppointmentDate(raw);

    // ── Outcome ────────────────────────────────────────────────────────────
    if (/\b(?:successful|went\s*well|no\s*issues?|uncomplicated)\b/i.test(raw)) result.outcome = 'successful';
    else if (/\b(?:complicated|issues?|problems?)\b/i.test(raw)) result.outcome = 'complicated';

    // ── Complications ──────────────────────────────────────────────────────
    // Match "complication" keyword followed by the complication description
    const compMatch = raw.match(/(?:complications?|side\s*effects?|adverse)\s*:?\s*([A-Za-z][A-Za-z\s,]{2,100}?)(?:\s*[.!]|$)/i);
    if (compMatch) {
      result.complications = compMatch[1].trim();
    } else {
      // Fallback: "X as complication" or "complication of X"
      const compAs = raw.match(/([A-Za-z][A-Za-z\s]{2,60}?)\s+as\s+complication/i)
        ?? raw.match(/complication\s+(?:of|was|is)\s+([A-Za-z][A-Za-z\s]{2,60}?)(?:\s*[.!]|$)/i);
      if (compAs) result.complications = compAs[1].trim();
    }

    // ── Notes ──────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment|notes?)\s*:?\s*(.+)/i);
    if (noteMatch) result.notes = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return partial result
  }
  return result;
}

// ─── 7. Immunization Parser ───────────────────────────────────────────────────

export interface ParsedImmunization {
  vaccineName: string | null;
  vaccineType: string | null;
  manufacturer: string | null;
  lotNumber: string | null;
  dateAdministered: string | null;  // ISO date
  doseNumber: number | null;
  seriesTotal: number | null;
  nextDoseDate: string | null;      // ISO date
  administeredBy: string | null;
  site: 'left_arm' | 'right_arm' | 'left_thigh' | 'right_thigh' | 'other' | null;
  route: 'intramuscular' | 'subcutaneous' | 'intradermal' | 'oral' | 'intranasal' | null;
  reactions: string | null;
  notes: string | null;
}

const VACCINE_ALIASES: Record<string, string> = {
  'flu': 'Influenza', 'influenza': 'Influenza', 'flu shot': 'Influenza',
  'covid': 'COVID-19', 'covid-19': 'COVID-19', 'coronavirus': 'COVID-19',
  'pfizer': 'COVID-19 (Pfizer-BioNTech)', 'moderna': 'COVID-19 (Moderna)',
  'johnson': 'COVID-19 (Janssen)', 'j&j': 'COVID-19 (Janssen)',
  'tdap': 'Tdap', 'tetanus': 'Tetanus/Tdap', 'dtap': 'DTaP',
  'mmr': 'MMR', 'measles': 'MMR', 'mumps': 'MMR', 'rubella': 'MMR',
  'varicella': 'Varicella', 'chickenpox': 'Varicella',
  'hepatitis a': 'Hepatitis A', 'hep a': 'Hepatitis A',
  'hepatitis b': 'Hepatitis B', 'hep b': 'Hepatitis B',
  'hpv': 'HPV', 'gardasil': 'HPV (Gardasil)',
  'pneumococcal': 'Pneumococcal', 'pneumonia': 'Pneumococcal',
  'shingles': 'Shingrix (Shingles)', 'shingrix': 'Shingrix (Shingles)',
  'meningococcal': 'Meningococcal', 'meningitis': 'Meningococcal',
  'rabies': 'Rabies', 'typhoid': 'Typhoid', 'yellow fever': 'Yellow Fever',
  'japanese encephalitis': 'Japanese Encephalitis',
  'polio': 'Polio (IPV)', 'ipv': 'Polio (IPV)',
  'rsv': 'RSV', 'rotavirus': 'Rotavirus',
  'zoster': 'Shingrix (Shingles)',
};

/** Parse a batch transcript into multiple immunization records. */
export interface ParsedImmunizationBatch {
  records: ParsedImmunization[];
  isBatch: boolean;
}

export function parseImmunizationTranscript(raw: string): ParsedImmunization {
  const result: ParsedImmunization = {
    vaccineName: null, vaccineType: null, manufacturer: null, lotNumber: null,
    dateAdministered: null, doseNumber: null, seriesTotal: null, nextDoseDate: null,
    administeredBy: null, site: null, route: null, reactions: null, notes: null,
  };
  try {
    const t = norm(raw);

    // ── Vaccine name ───────────────────────────────────────────────────────
    for (const [alias, name] of Object.entries(VACCINE_ALIASES)) {
      if (t.includes(alias)) { result.vaccineName = name; break; }
    }

    // ── Manufacturer ──────────────────────────────────────────────────────
    const mfgMap: Record<string, string> = {
      pfizer: 'Pfizer-BioNTech', moderna: 'Moderna', janssen: 'Janssen',
      'johnson & johnson': 'Janssen', astrazeneca: 'AstraZeneca',
      novavax: 'Novavax', merck: 'Merck', gsk: 'GSK', sanofi: 'Sanofi',
    };
    for (const [kw, mfg] of Object.entries(mfgMap)) {
      if (t.includes(kw)) { result.manufacturer = mfg; break; }
    }

    // ── Lot number ─────────────────────────────────────────────────────────
    const lotMatch = raw.match(/(?:lot\s*(?:number|#|no\.?)?|batch)\s*:?\s*([A-Z0-9]{4,12})/i);
    if (lotMatch) result.lotNumber = lotMatch[1].toUpperCase();

    // ── Date administered ─────────────────────────────────────────────────
    result.dateAdministered = parseAppointmentDate(raw);

    // ── Dose number ────────────────────────────────────────────────────────
    // Ordinal word-to-number map for dose parsing
    const ordinalMap: Record<string, number> = {
      first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
      '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
    };
    const doseMatch = raw.match(/(?:dose|shot|injection)\s*(?:number|#|no\.?)?\s*(\d+)/i)
      ?? raw.match(/(\d+)(?:st|nd|rd|th)\s*(?:dose|shot)/i);
    if (doseMatch) {
      result.doseNumber = parseInt(doseMatch[1], 10);
    } else {
      // Try ordinal word form: "second dose"
      for (const [word, num] of Object.entries(ordinalMap)) {
        if (new RegExp(`\\b${word}\\s+(?:dose|shot|injection)`, 'i').test(raw)) {
          result.doseNumber = num;
          break;
        }
      }
    }

    // ── Series total ─────────────────────────────────────────────────────
    const seriesMatch = raw.match(/(?:dose|shot)\s*(\d+)\s*of\s*(\d+)/i);
    if (seriesMatch) {
      result.doseNumber = result.doseNumber ?? parseInt(seriesMatch[1], 10);
      result.seriesTotal = parseInt(seriesMatch[2], 10);
    } else {
      const seriesMatch2 = raw.match(/(?:of|out\s*of)\s*(\d+)\s*(?:doses?|shots?)/i)
        ?? raw.match(/(\d+)\s*(?:dose|shot)\s*series/i);
      if (seriesMatch2) result.seriesTotal = parseInt(seriesMatch2[1], 10);
    }

    // ── Next dose date ─────────────────────────────────────────────────────
    const nextMatch = raw.match(/(?:next\s*dose|follow\s*up|booster)\s*(?:on|in|at)?\s*([A-Za-z0-9\s,]+?)(?:\s*\.|\s*$)/i);
    if (nextMatch) result.nextDoseDate = parseAppointmentDate(nextMatch[1]);

    // ── Administered by ────────────────────────────────────────────────────
    // Try "given at <clinic>" first, then "administered by" / "given by"
    const adminAtMatch = raw.match(/(?:given|administered|received)\s+at\s+([A-Za-z][A-Za-z\s&]{2,60}?)(?:\s+by|\s*,|\s*\.|\.?$)/i);
    const adminByMatch = raw.match(/(?:administered\s*by|given\s*by|dr\.?)\s+([A-Za-z][A-Za-z\s.]{2,60}?)(?:\s*,|\s*\.|\.?$)/i);
    if (adminAtMatch) {
      result.administeredBy = adminAtMatch[1].trim();
    } else if (adminByMatch) {
      result.administeredBy = adminByMatch[1].trim();
    }

    // ── Site ──────────────────────────────────────────────────────────────
    if (/left\s*arm/i.test(raw)) result.site = 'left_arm';
    else if (/right\s*arm/i.test(raw)) result.site = 'right_arm';
    else if (/left\s*thigh/i.test(raw)) result.site = 'left_thigh';
    else if (/right\s*thigh/i.test(raw)) result.site = 'right_thigh';
    else if (/\b(?:arm|thigh|deltoid|buttock|glute)\b/i.test(raw)) result.site = 'other';

    // ── Route ─────────────────────────────────────────────────────────────
    if (/\b(?:intramuscular|im\b|i\.m\.)\b/i.test(raw)) result.route = 'intramuscular';
    else if (/\b(?:subcutaneous|subcut|sq\b|s\.c\.)\b/i.test(raw)) result.route = 'subcutaneous';
    else if (/\b(?:intradermal|id\b|i\.d\.)\b/i.test(raw)) result.route = 'intradermal';
    else if (/\b(?:oral|by\s*mouth|swallowed)\b/i.test(raw)) result.route = 'oral';
    else if (/\b(?:intranasal|nasal\s*spray)\b/i.test(raw)) result.route = 'intranasal';

      // ── Reactions ─────────────────────────────────────────────────────
    // Capture the reaction symptom word itself (e.g. "soreness", "redness", "fever")
    const rxSymptomMatch = raw.match(/\b(soreness|redness|swelling|fever|pain|bruising|itching|nausea|fatigue|chills|headache)\b/i);
    const rxContextMatch = raw.match(/(?:reaction|side\s*effect|adverse)\s*:?\s*([A-Za-z][A-Za-z\s,]{2,100}?)(?:\s*[.!]|$)/i);
    if (rxSymptomMatch) {
      // Use the full surrounding phrase for context
      const symptomIdx = raw.toLowerCase().indexOf(rxSymptomMatch[1].toLowerCase());
      const snippet = raw.slice(Math.max(0, symptomIdx - 5), symptomIdx + rxSymptomMatch[1].length + 40).trim();
      result.reactions = snippet.slice(0, 120);
    } else if (rxContextMatch) {
      result.reactions = rxContextMatch[1].trim();
    } else if (/\b(?:no\s*reaction|no\s*side\s*effects?|tolerated\s*well)\b/i.test(raw)) {
      result.reactions = 'None';
    }

    // ── Notes ──────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment|notes?)\s*:?\s*(.+)/i);
    if (noteMatch) result.notes = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) {
    // Return partial result
  }
  return result;
}

/**
 * Parse a batch transcript containing multiple vaccines.
 * Splits on conjunctions like "and", "also", comma-separated items,
 * or time phrases like "last month", "yesterday".
 */
export function parseImmunizationBatchTranscript(raw: string): ParsedImmunizationBatch {
  try {
    if (!raw?.trim()) return { records: [], isBatch: false };

    // Detect batch indicators
    const batchIndicators = [
      /\band\s+(?:also\s+)?(?:a\s+)?(?:flu|covid|tdap|mmr|hep|hpv|pneumo|shingles|varicella|polio|rsv|rabies|typhoid|yellow\s*fever)/i,
      /,\s*(?:flu|covid|tdap|mmr|hep|hpv|pneumo|shingles|varicella|polio)/i,
      /(?:flu|covid|tdap|mmr|hep|hpv|pneumo|shingles|varicella|polio)[^.]+(?:last\s*month|last\s*week|yesterday|today)/i,
    ];
    const isBatch = batchIndicators.some(p => p.test(raw));

    if (!isBatch) {
      return { records: [parseImmunizationTranscript(raw)], isBatch: false };
    }

    // Split into segments by "and", comma, or time anchors
    const segments = raw
      .split(/(?:,\s*|\s+and\s+(?:also\s+)?)/i)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    const records = segments.map(s => parseImmunizationTranscript(s));
    return { records, isBatch: true };
  } catch (_unused) {
    return { records: [parseImmunizationTranscript(raw)], isBatch: false };
  }
}

// ─── 8. Allergy Parser ────────────────────────────────────────────────────────

export interface ParsedAllergy {
  allergen: string | null;
  category: 'medication' | 'food' | 'environmental' | 'insect' | 'latex' | 'other' | null;
  reaction: string | null;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening' | null;
  onsetDate: string | null;
  note: string | null;
}

export function parseAllergyTranscript(raw: string): ParsedAllergy {
  const result: ParsedAllergy = {
    allergen: null, category: null, reaction: null,
    severity: null, onsetDate: null, note: null,
  };
  try {
    const _t = norm(raw);

    // ── Severity ──────────────────────────────────────────────────────────
    if (/\b(?:life.?threatening|anaphyla|epipen|epinephrine)\b/i.test(raw)) result.severity = 'life-threatening';
    else if (/\bsevere\b/i.test(raw)) result.severity = 'severe';
    else if (/\bmoderate\b/i.test(raw)) result.severity = 'moderate';
    else if (/\bmild\b/i.test(raw)) result.severity = 'mild';

    // ── Category ──────────────────────────────────────────────────────────
    if (/\b(?:drug|medication|medicine|antibiotic|penicillin|aspirin|ibuprofen|sulfa|nsaid)\b/i.test(raw)) result.category = 'medication';
    else if (/\b(?:food|nut|peanut|shellfish|dairy|milk|egg|wheat|gluten|soy|fish|fruit)\b/i.test(raw)) result.category = 'food';
    else if (/\b(?:pollen|dust|mold|mould|pet|dander|grass|tree|weed|environmental)\b/i.test(raw)) result.category = 'environmental';
    else if (/\b(?:bee|wasp|insect|sting|bite|venom)\b/i.test(raw)) result.category = 'insect';
    else if (/\blatex\b/i.test(raw)) result.category = 'latex';

    // ── Reaction ──────────────────────────────────────────────────────────
    const rxMatch = raw.match(/(?:causes?|reaction|react|gives?\s*me|results?\s*in)\s+([a-zA-Z][a-zA-Z\s,]{2,80}?)(?:\s*[.!]|$)/i);
    if (rxMatch) result.reaction = rxMatch[1].trim().slice(0, 200);
    else {
      const symptomMatch = raw.match(/\b(hives?|rash|swelling|itching|anaphylaxis|vomiting|nausea|diarrhea|shortness\s*of\s*breath|wheezing|sneezing|runny\s*nose|watery\s*eyes?|eczema)\b/i);
      if (symptomMatch) result.reaction = symptomMatch[1];
    }

    // ── Onset date ────────────────────────────────────────────────────────
    result.onsetDate = parseAppointmentDate(raw);

    // ── Allergen: first noun phrase before "allergy", "allergic to", or "causes" ─
    const allergenMatch = raw.match(/(?:allergic\s*to|allergy\s*to|allergy:?)\s+([A-Za-z][A-Za-z\s-]{1,60}?)(?:\s*[,.]|\s+causes?|\s*$)/i)
      ?? raw.match(/^([A-Za-z][A-Za-z\s-]{1,40}?)\s+(?:allergy|allergic|causes?|reaction)/i);
    if (allergenMatch) result.allergen = allergenMatch[1].trim();
    else {
      // Fallback: first 1-2 words if no pattern matched
      const words = raw.trim().split(/\s+/);
      if (words[0] && !/^(?:i|my|have|had|got|developed|severe|mild|moderate)$/i.test(words[0])) {
        result.allergen = words.slice(0, 2).join(' ').replace(/[^a-zA-Z\s-]/g, '').trim() || null;
      }
    }

    // ── Note ──────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment|notes?)\s*:?\s*(.+)/i);
    if (noteMatch) result.note = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) { /* return partial */ }
  return result;
}

// ─── 9. Medical History Parser ────────────────────────────────────────────────

export interface ParsedMedicalHistory {
  condition: string | null;
  diagnosedDate: string | null;
  status: 'active' | 'resolved' | 'chronic' | null;
  treatedBy: string | null;
  medications: string | null;
  notes: string | null;
}

export function parseMedicalHistoryTranscript(raw: string): ParsedMedicalHistory {
  const result: ParsedMedicalHistory = {
    condition: null, diagnosedDate: null, status: null,
    treatedBy: null, medications: null, notes: null,
  };
  try {
    const _t = norm(raw);

    // ── Status ────────────────────────────────────────────────────────────
    if (/\b(?:resolved|cured|healed|no\s*longer|past|history\s*of)\b/i.test(raw)) result.status = 'resolved';
    else if (/\b(?:chronic|ongoing|lifelong|permanent|long.?term)\b/i.test(raw)) result.status = 'chronic';
    else if (/\b(?:active|current|ongoing|still\s*have|managing)\b/i.test(raw)) result.status = 'active';

    // ── Diagnosed date ────────────────────────────────────────────────────
    result.diagnosedDate = parseAppointmentDate(raw);

    // ── Treated by ────────────────────────────────────────────────────────
    const drMatch = raw.match(/(?:treated\s*by|managed\s*by|dr\.?\s+|doctor\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (drMatch) result.treatedBy = `Dr. ${drMatch[1].trim()}`;

    // ── Medications ───────────────────────────────────────────────────────
    const medMatch = raw.match(/(?:taking|on|prescribed|medication|treated\s*with)\s+([A-Za-z][A-Za-z\s,]{2,80}?)(?:\s*[.!]|$)/i);
    if (medMatch) result.medications = medMatch[1].trim().slice(0, 200);

    // ── Condition: first noun phrase ──────────────────────────────────────
    const condMatch = raw.match(/(?:diagnosed\s*with|have|had|history\s*of|suffer(?:ing)?\s*from)\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s-]{2,80}?)(?:\s*[,.]|\s+(?:since|in|on|treated|managed)|\s*$)/i)
      ?? raw.match(/^([A-Za-z][A-Za-z\s-]{2,60}?)(?:\s*[,.]|\s+(?:diagnosed|since|treated|managed|resolved))/i);
    if (condMatch) result.condition = condMatch[1].trim();

    // ── Notes ──────────────────────────────────────────────────────────────
    const noteMatch = raw.match(/(?:note|comment|notes?)\s*:?\s*(.+)/i);
    if (noteMatch) result.notes = noteMatch[1].trim().slice(0, 500);

  } catch (_unused) { /* return partial */ }
  return result;
}

// ─── All-Vitals Combined Parser ───────────────────────────────────────────────
// Used by log-all-vitals-sheet to parse a single free-text transcript into
// all vital sign categories without any server call.

export interface ParsedAllVitals {
  bp: { systolic: number; diastolic: number } | null;
  weight: { weightKg: number; weightLbs: number; unit: 'kg' | 'lbs' } | null;
  bloodSugar: { valueMgDl: number; valueMmol: number; context: string } | null;
  sleep: { totalMinutes: number; remMinutes: number; coreMinutes: number; deepMinutes: number; awakeMinutes: number } | null;
  hrv: { sdnn: number; context: string } | null;
  reasoning: string;
}

export function parseAllVitalsTranscript(raw: string): ParsedAllVitals {
  const t = norm(raw);
  const result: ParsedAllVitals = {
    bp: null, weight: null, bloodSugar: null, sleep: null, hrv: null,
    reasoning: '',
  };
  const filled: string[] = [];

  try {
    // ── Blood Pressure ────────────────────────────────────────────────────
    const bpPatterns = [
      /(?:blood\s*pressure|bp|b\.p\.?)\s*:?\s*(\d{2,3})\s*(?:over|\/|and)\s*(\d{2,3})/,
      /(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/,
    ];
    for (const p of bpPatterns) {
      const m = t.match(p);
      if (m) {
        const sys = parseInt(m[1], 10);
        const dia = parseInt(m[2], 10);
        if (sys >= 60 && sys <= 250 && dia >= 30 && dia <= 150) {
          result.bp = { systolic: sys, diastolic: dia };
          filled.push('blood pressure');
          break;
        }
      }
    }

    // ── Weight ────────────────────────────────────────────────────────────
    const wKgMatch = t.match(/(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|kilograms?)/);
    const wLbsMatch = t.match(/(\d{2,3}(?:\.\d{1,2})?)\s*(?:lbs?|pounds?)/);
    if (wKgMatch) {
      const kg = parseFloat(wKgMatch[1]);
      if (kg >= 20 && kg <= 300) {
        result.weight = { weightKg: kg, weightLbs: parseFloat((kg * 2.20462).toFixed(1)), unit: 'kg' };
        filled.push('weight');
      }
    } else if (wLbsMatch) {
      const lbs = parseFloat(wLbsMatch[1]);
      if (lbs >= 44 && lbs <= 660) {
        result.weight = { weightKg: parseFloat((lbs / 2.20462).toFixed(1)), weightLbs: lbs, unit: 'lbs' };
        filled.push('weight');
      }
    }

    // ── Blood Sugar ───────────────────────────────────────────────────────
    const bsPatterns = [
      /(?:blood\s*sugar|glucose|bg|bs)\s*:?\s*(\d{2,3}(?:\.\d)?)\s*(mg\/dl|mmol|mg)?/,
      /(\d{2,3}(?:\.\d)?)\s*(?:mg\/dl|mmol\/l)/,
    ];
    for (const p of bsPatterns) {
      const m = t.match(p);
      if (m) {
        const val = parseFloat(m[1]);
        const unit = (m[2] ?? '').toLowerCase();
        let mgDl: number;
        let mmol: number;
        if (unit.includes('mmol') || val < 30) {
          mmol = val;
          mgDl = parseFloat((val * 18.0182).toFixed(0));
        } else {
          mgDl = val;
          mmol = parseFloat((val / 18.0182).toFixed(1));
        }
        if (mgDl >= 20 && mgDl <= 600) {
          const ctxMatch = t.match(/\b(fasting|post.?meal|before\s+meal|after\s+meal|bedtime|random|morning)\b/);
          result.bloodSugar = { valueMgDl: mgDl, valueMmol: mmol, context: ctxMatch?.[1] ?? 'random' };
          filled.push('blood sugar');
          break;
        }
      }
    }

    // ── Sleep ─────────────────────────────────────────────────────────────
    const sleepParsed = parseSleepTranscript(raw);
    if (sleepParsed.durationMinutes) {
      const total = sleepParsed.durationMinutes;
      const deep = sleepParsed.deepSleepMinutes ?? Math.round(total * 0.2);
      const rem = Math.round(total * 0.25);
      const core = Math.round(total * 0.45);
      const awake = Math.max(0, total - deep - rem - core);
      result.sleep = { totalMinutes: total, remMinutes: rem, coreMinutes: core, deepMinutes: deep, awakeMinutes: awake };
      filled.push('sleep');
    }

    // ── HRV ───────────────────────────────────────────────────────────────
    const hrvMatch = t.match(/(?:hrv|heart\s*rate\s*variability)\s*:?\s*(\d{1,3}(?:\.\d)?)\s*(?:ms)?/);
    if (hrvMatch) {
      const sdnn = parseFloat(hrvMatch[1]);
      if (sdnn >= 1 && sdnn <= 300) {
        const ctxMatch = t.match(/\b(resting|post.?exercise|morning|night|sleep)\b/);
        result.hrv = { sdnn, context: ctxMatch?.[1] ?? 'resting' };
        filled.push('hrv');
      }
    }

    result.reasoning = filled.length > 0
      ? `Parsed ${filled.length} vital category(ies): ${filled.join(', ')}`
      : 'No vital sign values detected in transcript';
  } catch (_unused) {
    result.reasoning = 'Parse error — please enter values manually';
  }

  return result;
}

// ─── Nutrition Transcript Parser ──────────────────────────────────────────────
// Parses free-text food/meal descriptions into macro nutrients.
// Used by log.tsx and ai-food-camera-sheet.tsx voice quick-log.

export interface ParsedNutrition {
  foodDescription: string;
  calories: number | null;
  carbsG: number | null;
  fatG: number | null;
  proteinG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
}

export function parseNutritionTranscript(raw: string): ParsedNutrition {
  const t = norm(raw);
  const result: ParsedNutrition = {
    foodDescription: raw.trim().slice(0, 300),
    calories: null, carbsG: null, fatG: null,
    proteinG: null, fiberG: null, sodiumMg: null,
  };
  try {
    // ── Calories ──────────────────────────────────────────────────────────
    const calMatch = t.match(/(\d{2,4})\s*(?:cal(?:ories?)?|kcal)/);
    if (calMatch) result.calories = clamp(parseInt(calMatch[1], 10), 0, 5000);

    // ── Carbs ─────────────────────────────────────────────────────────────
    const carbMatch = t.match(/(\d{1,3}(?:\.\d)?)\s*(?:g\s*)?(?:carbs?|carbohydrates?)/);
    if (carbMatch) result.carbsG = clamp(parseFloat(carbMatch[1]), 0, 500);

    // ── Fat ───────────────────────────────────────────────────────────────
    const fatMatch = t.match(/(\d{1,3}(?:\.\d)?)\s*(?:g\s*)?(?:fat|lipids?)/);
    if (fatMatch) result.fatG = clamp(parseFloat(fatMatch[1]), 0, 200);

    // ── Protein ───────────────────────────────────────────────────────────
    const protMatch = t.match(/(\d{1,3}(?:\.\d)?)\s*(?:g\s*)?(?:protein|prot)/);
    if (protMatch) result.proteinG = clamp(parseFloat(protMatch[1]), 0, 300);

    // ── Fiber ─────────────────────────────────────────────────────────────
    const fiberMatch = t.match(/(\d{1,3}(?:\.\d)?)\s*(?:g\s*)?(?:fiber|fiber)/);
    if (fiberMatch) result.fiberG = clamp(parseFloat(fiberMatch[1]), 0, 100);

    // ── Sodium ────────────────────────────────────────────────────────────
    const sodiumMatch = t.match(/(\d{1,4})\s*(?:mg\s*)?(?:sodium|salt|na\b)/);
    if (sodiumMatch) result.sodiumMg = clamp(parseInt(sodiumMatch[1], 10), 0, 10000);

  } catch (_unused) { /* return partial */ }
  return result;
}

// ─── 13. Immunization OCR Parser (CDC Card / Pharmacy Printout) ───────────────
//
// Handles printed card layouts produced by Apple Vision / ML Kit OCR:
//   • CDC yellow card (International Certificate of Vaccination)
//   • US pharmacy vaccination record printout
//   • Hospital / clinic vaccination record
//   • VIS (Vaccine Information Statement) header
//
// OCR text arrives as newline-separated regions. The parser works in two passes:
//   Pass 1 — structural: detect column headers and extract adjacent values
//   Pass 2 — fallback:   run the existing voice-transcript regex patterns
//
// The function returns the same ParsedImmunization shape so callers are unchanged.

/**
 * Parse OCR text from a scanned vaccination card or pharmacy printout.
 * Significantly more accurate than parseImmunizationTranscript for printed layouts.
 */
export function parseImmunizationOcr(raw: string): ParsedImmunization {
  const result: ParsedImmunization = {
    vaccineName: null, vaccineType: null, manufacturer: null, lotNumber: null,
    dateAdministered: null, doseNumber: null, seriesTotal: null, nextDoseDate: null,
    administeredBy: null, site: null, route: null, reactions: null, notes: null,
  };
  if (!raw?.trim()) return result;

  try {
    // ── Pre-process: split into lines, strip leading/trailing whitespace ──
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const fullText = lines.join('\n');

    // ── Helper: parse a date string in any common printed format ──────────
    function parseOcrDate(s: string): string | null {
      if (!s) return null;
      const clean = s.trim().replace(/[^\d/\-. A-Za-z]/g, ' ').trim();

      // MM/DD/YYYY or MM-DD-YYYY or MM.DD.YYYY
      const mdySlash = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (mdySlash) {
        const [, m, d, y] = mdySlash;
        const year = y.length === 2 ? (parseInt(y, 10) > 50 ? 1900 + parseInt(y, 10) : 2000 + parseInt(y, 10)) : parseInt(y, 10);
        const date = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      }

      // YYYY-MM-DD (ISO)
      const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) {
        const date = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      }

      // "Jan 15 2024", "15 Jan 2024", "January 15, 2024"
      const monthNames: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
        august: 8, september: 9, october: 10, november: 11, december: 12,
      };
      const wordDate = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (wordDate) {
        const mon = monthNames[wordDate[1].toLowerCase()];
        if (mon) {
          const date = new Date(parseInt(wordDate[3], 10), mon - 1, parseInt(wordDate[2], 10));
          if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
        }
      }
      const wordDate2 = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (wordDate2) {
        const mon = monthNames[wordDate2[2].toLowerCase()];
        if (mon) {
          const date = new Date(parseInt(wordDate2[3], 10), mon - 1, parseInt(wordDate2[1], 10));
          if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
        }
      }
      return null;
    }

    // ── Helper: find value on the line following a label line ─────────────
    function valueAfterLabel(labelPattern: RegExp): string | null {
      for (let i = 0; i < lines.length; i++) {
        if (labelPattern.test(lines[i])) {
          // Value may be on the same line after a colon/tab, or on the next line
          const sameLineMatch = lines[i].match(/[:|\t]\s*(.+)$/);
          if (sameLineMatch && sameLineMatch[1].trim().length > 0) {
            return sameLineMatch[1].trim();
          }
          if (i + 1 < lines.length) return lines[i + 1].trim();
        }
      }
      return null;
    }

    // ── Helper: find value on the same line as a label ────────────────────
    function valueOnLine(labelPattern: RegExp): string | null {
      for (const line of lines) {
        const m = line.match(labelPattern);
        if (m && m[1]) return m[1].trim();
      }
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PASS 1 — Structural extraction (column headers + adjacent values)
    // ═══════════════════════════════════════════════════════════════════════

    // ── Vaccine name ───────────────────────────────────────────────────────
    // CDC card column: "Vaccine" | "Vaccine Name" | "Product Name"
    const vaccineLabelVal = valueAfterLabel(/^(?:vaccine\s*(?:name)?|product\s*name|immunization|vaccination)$/i);
    if (vaccineLabelVal) {
      result.vaccineName = vaccineLabelVal.replace(/\s*\(.*?\)\s*/g, '').trim().slice(0, 80);
    }

    // Inline: "Vaccine: Influenza" or "Vaccine Name: Tdap"
    if (!result.vaccineName) {
      const inlineVax = valueOnLine(/^(?:vaccine\s*(?:name)?|product\s*name)\s*[:\|]\s*(.+)/i);
      if (inlineVax) result.vaccineName = inlineVax.replace(/\s*\(.*?\)\s*/g, '').trim().slice(0, 80);
    }

    // Normalize vaccine name via alias table
    if (result.vaccineName) {
      const lower = result.vaccineName.toLowerCase();
      for (const [alias, canonical] of Object.entries(VACCINE_ALIASES)) {
        if (lower.includes(alias)) { result.vaccineName = canonical; break; }
      }
    }

    // ── Manufacturer ──────────────────────────────────────────────────────
    // CDC card: "Manufacturer" column or "Mfr" abbreviation
    const mfrVal = valueAfterLabel(/^(?:manufacturer|mfr\.?|made\s*by|brand)$/i)
      ?? valueOnLine(/^(?:manufacturer|mfr\.?)\s*[:\|]\s*(.+)/i);
    if (mfrVal) {
      const mfgMap: Record<string, string> = {
        pfizer: 'Pfizer-BioNTech', moderna: 'Moderna', janssen: 'Janssen',
        'johnson & johnson': 'Janssen', 'j&j': 'Janssen',
        astrazeneca: 'AstraZeneca', novavax: 'Novavax',
        merck: 'Merck', gsk: 'GSK', sanofi: 'Sanofi',
        seqirus: 'Seqirus', biotech: 'BioNTech',
      };
      const lowerMfr = mfrVal.toLowerCase();
      let matched = false;
      for (const [kw, name] of Object.entries(mfgMap)) {
        if (lowerMfr.includes(kw)) { result.manufacturer = name; matched = true; break; }
      }
      if (!matched) result.manufacturer = mfrVal.slice(0, 60);
    }

    // ── Lot number ─────────────────────────────────────────────────────────
    // CDC card: "Lot Number" | "Lot #" | "Lot No." column
    const lotVal = valueAfterLabel(/^(?:lot\s*(?:number|#|no\.?)|batch\s*(?:number|#|no\.?))$/i)
      ?? valueOnLine(/^(?:lot\s*(?:number|#|no\.?)|batch\s*(?:number|#|no\.?))\s*[:\|]\s*([A-Z0-9][A-Z0-9\-]{2,14})/i);
    if (lotVal) {
      result.lotNumber = lotVal.replace(/[^A-Z0-9\-]/gi, '').toUpperCase().slice(0, 20);
    }
    // Fallback: any standalone alphanumeric token that looks like a lot number
    if (!result.lotNumber) {
      const lotFallback = fullText.match(/\b(?:lot|batch)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{3,14})\b/i);
      if (lotFallback) result.lotNumber = lotFallback[1].toUpperCase();
    }

    // ── Date administered ─────────────────────────────────────────────────
    // CDC card: "Date" | "Date Given" | "Date Administered" | "Date of Vaccination"
    const dateVal = valueAfterLabel(/^(?:date\s*(?:given|administered|of\s*vaccination|received)?|administered\s*date|vaccination\s*date)$/i)
      ?? valueOnLine(/^(?:date\s*(?:given|administered|of\s*vaccination|received)?|administered\s*date)\s*[:\|]\s*(.+)/i);
    if (dateVal) result.dateAdministered = parseOcrDate(dateVal);

    // Fallback: scan all lines for date-like tokens (MM/DD/YYYY most common on US cards)
    if (!result.dateAdministered) {
      for (const line of lines) {
        const dateToken = line.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/);
        if (dateToken) {
          const parsed = parseOcrDate(dateToken[1]);
          if (parsed) { result.dateAdministered = parsed; break; }
        }
      }
    }

    // ── Dose number ────────────────────────────────────────────────────────
    // CDC card: "Dose #" | "Dose Number" | "#1 of 2"
    const doseVal = valueAfterLabel(/^(?:dose\s*(?:#|number|no\.?)|shot\s*#)$/i)
      ?? valueOnLine(/^(?:dose\s*(?:#|number|no\.?))\s*[:\|]\s*(\d+)/i);
    if (doseVal) {
      const n = parseInt(doseVal, 10);
      if (!isNaN(n)) result.doseNumber = n;
    }
    // "Dose 1 of 3" or "1/2" or "#2"
    const doseOfMatch = fullText.match(/\b(?:dose\s*)?#?\s*(\d)\s*(?:of|\/)\s*(\d)\b/i);
    if (doseOfMatch) {
      result.doseNumber = result.doseNumber ?? parseInt(doseOfMatch[1], 10);
      result.seriesTotal = parseInt(doseOfMatch[2], 10);
    }

    // ── Site ──────────────────────────────────────────────────────────────
    // CDC card: "Site" | "Injection Site" | "Body Site"
    const siteVal = valueAfterLabel(/^(?:(?:injection\s*|body\s*)?site|location\s*of\s*injection)$/i)
      ?? valueOnLine(/^(?:(?:injection\s*|body\s*)?site)\s*[:\|]\s*(.+)/i);
    const siteText = (siteVal ?? fullText).toLowerCase();
    if (/\bleft\s*arm\b|\bla\b/.test(siteText)) result.site = 'left_arm';
    else if (/\bright\s*arm\b|\bra\b/.test(siteText)) result.site = 'right_arm';
    else if (/\bleft\s*thigh\b|\blt\b/.test(siteText)) result.site = 'left_thigh';
    else if (/\bright\s*thigh\b|\brt\b/.test(siteText)) result.site = 'right_thigh';
    else if (siteVal && /\b(?:arm|thigh|deltoid|glute|buttock)\b/i.test(siteVal)) result.site = 'other';

    // ── Route ─────────────────────────────────────────────────────────────
    const routeVal = valueAfterLabel(/^(?:route|method\s*of\s*administration|admin\s*route)$/i)
      ?? valueOnLine(/^(?:route|method\s*of\s*administration)\s*[:\|]\s*(.+)/i);
    const routeText = (routeVal ?? fullText).toLowerCase();
    if (/\b(?:im\b|intramuscular)\b/.test(routeText)) result.route = 'intramuscular';
    else if (/\b(?:sq\b|subcut|subcutaneous)\b/.test(routeText)) result.route = 'subcutaneous';
    else if (/\b(?:id\b|intradermal)\b/.test(routeText)) result.route = 'intradermal';
    else if (/\b(?:oral|by\s*mouth|po\b)\b/.test(routeText)) result.route = 'oral';
    else if (/\b(?:intranasal|nasal\s*spray|in\b)\b/.test(routeText)) result.route = 'intranasal';

    // ── Administered by / clinic ───────────────────────────────────────────
    // CDC card: "Health Care Provider" | "Administered By" | "Clinic" | "Facility"
    const adminVal = valueAfterLabel(/^(?:(?:health\s*care\s*)?provider|administered\s*by|given\s*by|clinic|facility|vaccinator|pharmacist|nurse|physician)$/i)
      ?? valueOnLine(/^(?:(?:health\s*care\s*)?provider|administered\s*by|clinic|facility)\s*[:\|]\s*(.+)/i);
    if (adminVal) result.administeredBy = adminVal.slice(0, 80);

    // ── Next dose date ─────────────────────────────────────────────────────
    const nextVal = valueAfterLabel(/^(?:next\s*dose\s*(?:date|due)?|return\s*(?:date|for\s*next)|booster\s*due)$/i)
      ?? valueOnLine(/^(?:next\s*dose|return\s*date|booster\s*due)\s*[:\|]\s*(.+)/i);
    if (nextVal) result.nextDoseDate = parseOcrDate(nextVal);

    // ── Vaccine type (e.g. "mRNA", "Live Attenuated", "Inactivated") ───────
    const typeVal = valueAfterLabel(/^(?:vaccine\s*type|type|formulation)$/i)
      ?? valueOnLine(/^(?:vaccine\s*type|type|formulation)\s*[:\|]\s*(.+)/i);
    if (typeVal) result.vaccineType = typeVal.slice(0, 60);
    else {
      // Infer type from vaccine name
      const vn = (result.vaccineName ?? '').toLowerCase();
      if (/pfizer|moderna|mrna/i.test(vn)) result.vaccineType = 'mRNA';
      else if (/janssen|j&j|astrazeneca|novavax/i.test(vn)) result.vaccineType = 'Viral Vector';
      else if (/flu|influenza/i.test(vn)) result.vaccineType = 'Inactivated';
      else if (/mmr|varicella|chickenpox/i.test(vn)) result.vaccineType = 'Live Attenuated';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PASS 2 — Fallback: run voice-transcript patterns on any fields still null
    // ═══════════════════════════════════════════════════════════════════════
    const voiceFallback = parseImmunizationTranscript(raw);

    if (!result.vaccineName)       result.vaccineName       = voiceFallback.vaccineName;
    if (!result.manufacturer)      result.manufacturer      = voiceFallback.manufacturer;
    if (!result.lotNumber)         result.lotNumber         = voiceFallback.lotNumber;
    if (!result.dateAdministered)  result.dateAdministered  = voiceFallback.dateAdministered;
    if (!result.doseNumber)        result.doseNumber        = voiceFallback.doseNumber;
    if (!result.seriesTotal)       result.seriesTotal       = voiceFallback.seriesTotal;
    if (!result.nextDoseDate)      result.nextDoseDate      = voiceFallback.nextDoseDate;
    if (!result.administeredBy)    result.administeredBy    = voiceFallback.administeredBy;
    if (!result.site)              result.site              = voiceFallback.site;
    if (!result.route)             result.route             = voiceFallback.route;
    if (!result.reactions)         result.reactions         = voiceFallback.reactions;
    if (!result.notes)             result.notes             = voiceFallback.notes;

  } catch (_unused) {
    // Return whatever was extracted before the error
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseLabOcr — Printed lab report OCR parser
// Handles Quest Diagnostics, LabCorp, hospital printouts, and digital PDFs.
// Input: raw OCR lines from expo-text-extractor.
// Output: Record<string, string> matching LabAnalyteId keys + optional
//         __labName and __collectionDate meta fields.
// ─────────────────────────────────────────────────────────────────────────────

// Map of every known analyte abbreviation / label to its LabAnalyteId key.
const LAB_ANALYTE_ALIASES: Record<string, string> = {
  // CMP — Glucose
  'glucose': 'glucose', 'gluc': 'glucose', 'glu': 'glucose', 'blood glucose': 'glucose',
  'fasting glucose': 'glucose', 'random glucose': 'glucose',
  // CMP — BUN
  'bun': 'bun', 'blood urea nitrogen': 'bun', 'urea nitrogen': 'bun', 'urea n': 'bun',
  // CMP — Creatinine
  'creatinine': 'creatinine', 'creat': 'creatinine', 'cre': 'creatinine', 'cr': 'creatinine',
  // CMP — eGFR
  'egfr': 'egfr', 'gfr': 'egfr', 'estimated gfr': 'egfr', 'glomerular filtration': 'egfr',
  'ckd-epi': 'egfr',
  // CMP — Sodium
  'sodium': 'sodium', 'na+': 'sodium',
  // CMP — Potassium
  'potassium': 'potassium', 'k+': 'potassium',
  // CMP — Chloride
  'chloride': 'chloride', 'cl': 'chloride', 'cl-': 'chloride',
  // CMP — CO2 / Bicarbonate
  'co2': 'co2', 'carbon dioxide': 'co2', 'bicarbonate': 'co2', 'hco3': 'co2',
  'total co2': 'co2',
  // CMP — Calcium
  'calcium': 'calcium', 'ca2+': 'calcium', 'total calcium': 'calcium',
  // CMP — Total Protein
  'total protein': 'totalProtein', 'tot protein': 'totalProtein', 'tp': 'totalProtein',
  // CMP — Albumin
  'albumin': 'albumin', 'alb': 'albumin',
  // CMP — Total Bilirubin
  'total bilirubin': 'totalBilirubin', 'bilirubin total': 'totalBilirubin',
  'bili total': 'totalBilirubin', 't bili': 'totalBilirubin', 'tbili': 'totalBilirubin',
  // CMP — ALT
  'alt': 'alt', 'alanine aminotransferase': 'alt', 'alanine transaminase': 'alt', 'sgpt': 'alt',
  // CMP — AST
  'ast': 'ast', 'aspartate aminotransferase': 'ast', 'aspartate transaminase': 'ast', 'sgot': 'ast',
  // CBC — WBC
  'wbc': 'wbc', 'white blood cell': 'wbc', 'white blood cells': 'wbc',
  'white cell count': 'wbc', 'leukocytes': 'wbc',
  // CBC — RBC
  'rbc': 'rbc', 'red blood cell': 'rbc', 'red blood cells': 'rbc',
  'red cell count': 'rbc', 'erythrocytes': 'rbc',
  // CBC — Hemoglobin
  'hemoglobin': 'hemoglobin', 'haemoglobin': 'hemoglobin', 'hgb': 'hemoglobin', 'hb': 'hemoglobin',
  // CBC — Hematocrit
  'hematocrit': 'hematocrit', 'haematocrit': 'hematocrit', 'hct': 'hematocrit',
  'packed cell volume': 'hematocrit', 'pcv': 'hematocrit',
  // CBC — MCV
  'mcv': 'mcv', 'mean corpuscular volume': 'mcv', 'mean cell volume': 'mcv',
  // CBC — MCH
  'mch': 'mch', 'mean corpuscular hemoglobin': 'mch', 'mean cell hemoglobin': 'mch',
  // CBC — MCHC
  'mchc': 'mchc', 'mean corpuscular hemoglobin concentration': 'mchc',
  // CBC — RDW
  'rdw': 'rdw', 'red cell distribution width': 'rdw',
  // CBC — Platelets
  'platelets': 'platelets', 'plt': 'platelets', 'platelet count': 'platelets',
  'thrombocytes': 'platelets',
  // CBC — Neutrophils
  'neutrophils': 'neutrophils', 'neut': 'neutrophils', 'neutrophil': 'neutrophils',
  'polys': 'neutrophils', 'segs': 'neutrophils',
  // Magnesium
  'magnesium': 'magnesium', 'mag': 'magnesium',
  // Phosphorus
  'phosphorus': 'phosphorus', 'phos': 'phosphorus', 'phosphate': 'phosphorus',
  'inorganic phosphorus': 'phosphorus',
  // Lipid — Total Cholesterol
  'total cholesterol': 'totalCholesterol', 'cholesterol': 'totalCholesterol',
  'chol': 'totalCholesterol', 'tc': 'totalCholesterol',
  // Lipid — LDL
  'ldl': 'ldl', 'ldl cholesterol': 'ldl', 'ldl-c': 'ldl',
  'low density lipoprotein': 'ldl', 'low-density lipoprotein': 'ldl',
  // Lipid — HDL
  'hdl': 'hdl', 'hdl cholesterol': 'hdl', 'hdl-c': 'hdl',
  'high density lipoprotein': 'hdl', 'high-density lipoprotein': 'hdl',
  // Lipid — Triglycerides
  'triglycerides': 'triglycerides', 'trig': 'triglycerides', 'trigs': 'triglycerides',
  'tg': 'triglycerides',
  // Lipid — Non-HDL
  'non-hdl': 'nonHdl', 'non hdl': 'nonHdl', 'non-hdl cholesterol': 'nonHdl',
  // A1C
  'a1c': 'a1c', 'hba1c': 'a1c', 'hemoglobin a1c': 'a1c', 'haemoglobin a1c': 'a1c',
  'glycated hemoglobin': 'a1c', 'glycosylated hemoglobin': 'a1c', 'glycohemoglobin': 'a1c',
};

// Sorted alias list (longest first) to avoid partial-match false positives
const SORTED_LAB_ALIASES = Object.keys(LAB_ANALYTE_ALIASES).sort((a, b) => b.length - a.length);

// Common lab facility name patterns
const LAB_FACILITY_PATTERNS: RegExp[] = [
  /quest\s*diagnostics/i, /labcorp/i, /bio\s*reference/i,
  /mayo\s*clinic\s*labs?/i, /arup\s*labs?/i, /sonora\s*quest/i,
  /clinical\s*pathology\s*labs?/i, /spectrum\s*health/i, /providence\s*labs?/i,
];

// Date patterns found on printed lab reports
const LAB_DATE_PATTERNS: RegExp[] = [
  /collected[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /collection\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /specimen\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /drawn[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /date\s*of\s*service[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /report\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
];

function normalizeLabDate(raw: string): string {
  const clean = raw.trim().replace(/\-/g, '/');
  const parts = clean.split('/');
  if (parts.length !== 3) return raw;
  let [m, d, y] = parts.map(p => p.trim());
  if (y.length === 2) y = `20${y}`;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parse OCR text from a printed lab report into a flat Record<string, string>
 * where keys are LabAnalyteId values (e.g. 'glucose', 'wbc') plus optional
 * __labName and __collectionDate meta fields.
 *
 * Handles Quest Diagnostics / LabCorp column format:
 *   "Glucose    95    70-99 mg/dL"
 *   "WBC    6.2    4.5-11.0 x10^3/uL"
 */
export function parseLabOcr(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const fullText = lines.join('\n');

  // Pass 1: Lab facility name
  for (const pattern of LAB_FACILITY_PATTERNS) {
    const m = fullText.match(pattern);
    if (m) { result.__labName = m[0].trim(); break; }
  }

  // Pass 2: Collection date
  for (const pattern of LAB_DATE_PATTERNS) {
    const m = fullText.match(pattern);
    if (m) { result.__collectionDate = normalizeLabDate(m[1]); break; }
  }

  // Pass 3: Analyte values — scan each line
  const NUM_RE = /[<>]?\s*(\d+(?:\.\d+)?)/;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (!lower) continue;

    for (const alias of SORTED_LAB_ALIASES) {
      if (!lower.includes(alias)) continue;
      const analyteId = LAB_ANALYTE_ALIASES[alias];
      if (result[analyteId]) continue; // already captured

      // Look for numeric value after the alias
      const afterAlias = line.slice(lower.indexOf(alias) + alias.length);
      const numAfter = afterAlias.match(NUM_RE);
      if (numAfter) {
        const val = parseFloat(numAfter[1]);
        if (!isNaN(val) && val > 0) { result[analyteId] = String(val); break; }
      }

      // Quest/LabCorp: value may appear before the alias label
      const beforeAlias = line.slice(0, lower.indexOf(alias));
      const numBefore = beforeAlias.match(/(\d+(?:\.\d+)?)\s*$/);
      if (numBefore) {
        const val = parseFloat(numBefore[1]);
        if (!isNaN(val) && val > 0) { result[analyteId] = String(val); break; }
      }
    }
  }

  return result;
}
