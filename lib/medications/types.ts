/**
 * Medication data model for VitalSync.
 * Stored locally under "@vsht:medications" in AsyncStorage.
 */

export type MedicationFrequency =
  | 'daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'weekly'
  | 'as_needed'
  | 'custom';

export type MedicationForm =
  | 'tablet'
  | 'capsule'
  | 'liquid'
  | 'injection'
  | 'patch'
  | 'inhaler'
  | 'drops'
  | 'other';

export type DoseStatus = 'taken' | 'skipped' | 'missed';

/** A single reschedule event recorded when a dose time is changed. */
export interface RescheduleEvent {
  /** ISO timestamp when the reschedule was performed */
  rescheduledAt: string;
  /** Original HH:MM scheduled time */
  originalTime: string;
  /** New HH:MM scheduled time after rescheduling */
  newTime: string;
  /** Optional reason (e.g. "snooze", "conflict", or free-text) */
  reason?: string;
}

export interface DoseLog {
  /** Unique log ID */
  id: string;
  /** YYYY-MM-DD date of the scheduled dose */
  date: string;
  /** HH:MM scheduled time for this dose */
  scheduledTime: string;
  /** Actual ISO timestamp when the dose was logged (taken/skipped/missed) */
  loggedAt: string;
  /** taken | skipped | missed */
  status: DoseStatus;
  /** Optional note (e.g. "with food", "skipped — nausea") */
  note?: string;
  /** If reinstated: the ISO timestamp the user says they actually took it */
  reinstatedAt?: string;
  /** If reinstated: the HH:MM time the user entered */
  reinstatedTime?: string;
  /** Reschedule events associated with this dose slot */
  rescheduleHistory?: RescheduleEvent[];
}

export interface DrugInteraction {
  /** The other drug name */
  drug: string;
  /** Severity: major | moderate | minor */
  severity: 'major' | 'moderate' | 'minor';
  /** Plain-language description */
  description: string;
  /** Source: 'fda' | 'smart' */
  source: 'fda' | 'smart';
  /** Optional extended fields from AI-enriched interactions */
  onsetTime?: string;
  documentation?: string;
  mechanism?: string;
  clinicalSignificance?: string;
  management?: string;
}

export interface SideEffect {
  /** Effect name */
  name: string;
  /** Frequency: common | uncommon | rare */
  frequency: 'common' | 'uncommon' | 'rare';
  /** Plain-language description */
  description?: string;
}

export interface Medication {
  id: string;
  name: string;
  /** e.g. "10 mg", "2 puffs", "5 mL" */
  dose: string;
  form: MedicationForm;
  frequency: MedicationFrequency;
  /** HH:MM strings for each scheduled dose time, e.g. ["08:00", "20:00"] */
  scheduleTimes: string[];
  /** Remaining pill/dose count; null = not tracking */
  quantity: number | null;
  /** Low-stock threshold — warn when quantity ≤ this value */
  refillAt: number;
  /** Hex colour for the card accent */
  color: string;
  /** Optional prescriber / pharmacy notes */
  notes: string;
  /** ISO date string when the medication was added */
  addedAt: string;
  /** ISO date string when the medication course starts */
  startDate?: string;
  /** ISO date string when the medication course ends (undefined = ongoing) */
  endDate?: string;
  /** Whether the medication is currently active */
  active: boolean;
  /** Dose history */
  doseLogs: DoseLog[];
  /** Expo notification IDs scheduled for this medication */
  notificationIds: string[];
  /** Pharmacy name */
  pharmacyName?: string;
  /** Pharmacy phone number */
  pharmacyPhone?: string;
  /** Pharmacy street address */
  pharmacyAddress?: string;
  /** Smart-generated side effects (populated on demand) */
  sideEffects?: SideEffect[];
  /** Drug interactions from FDA + Smart engine (populated on demand) */
  drugInteractions?: DrugInteraction[];
  /** ISO timestamp when side effects were last fetched */
  sideEffectsLastFetched?: string;
  /** ISO timestamp when drug interactions were last fetched */
  interactionsLastFetched?: string;
  /** Primary condition this medication treats (auto-populated from drug search) */
  indication?: string;
  /** Typical safe dosage range (auto-populated from drug search) */
  safeDosage?: string;
  /** Administration route (auto-populated from drug search, user-selectable) */
  route?: MedicationRoute;
  /** Generic drug name (auto-populated from drug search) */
  genericName?: string;
  /** ISO date string (YYYY-MM-DD) for the next refill reminder notification */
  refillReminderDate?: string;
  /** Expo notification ID for the 7-day advance refill reminder (fires 7 days before refillReminderDate) */
  advanceRefillNotifId?: string;
  /** ISO date string (YYYY-MM-DD) when user last tapped Map to navigate to pharmacy for a refill */
  refillRequestedDate?: string;
  /** Prescription Rx number from the pharmacy label */
  rxNumber?: string;
  /** Number of refills remaining as printed on the prescription label */
  refillsRemaining?: number;
  /** Unit of the dose (e.g. 'mg', 'mL') */
  doseUnit?: string;
  /** Prescriber name from prescription label */
  prescriber?: string;
  /** ISO date string (YYYY-MM-DD) when prescription was filled */
  fillDate?: string;
  /** County or jurisdiction for refill tracking */
  refillCounty?: string;
  /** Reason or indication note from prescription */
  reason?: string;
  /** Days supply as printed on prescription label */
  daysSupply?: number;
}

export type MedicationStore = Medication[];

// ─── Administration Route ───────────────────────────────────────────────────────────────────

export type MedicationRoute =
  | 'oral'
  | 'sublingual'
  | 'subq'
  | 'im'
  | 'iv'
  | 'inhaled'
  | 'topical'
  | 'ophthalmic'
  | 'otic'
  | 'nasal'
  | 'rectal'
  | 'transdermal';

export const ROUTE_EMOJI: Record<MedicationRoute, string> = {
  oral: '\ud83d\udc8a',
  sublingual: '\ud83d\udd35',
  subq: '\ud83d\udc89',
  im: '\ud83e\ude7a',
  iv: '\ud83e\ude78',
  inhaled: '\ud83c\udf2c\ufe0f',
  topical: '\ud83e\ude79',
  ophthalmic: '\ud83d\udc41\ufe0f',
  otic: '\ud83d\udc42',
  nasal: '\ud83d\udc43',
  rectal: '\ud83c\udf51',
  transdermal: '\ud83e\ude79',
};

export const ROUTE_LABELS: Record<MedicationRoute, string> = {
  oral: 'Oral',
  sublingual: 'Sublingual',
  subq: 'Subcutaneous',
  im: 'Intramuscular',
  iv: 'Intravenous',
  inhaled: 'Inhaled',
  topical: 'Topical',
  ophthalmic: 'Ophthalmic',
  otic: 'Otic',
  nasal: 'Nasal',
  rectal: 'Rectal',
  transdermal: 'Transdermal',
};

export const ALL_ROUTES: MedicationRoute[] = Object.keys(ROUTE_EMOJI) as MedicationRoute[];
