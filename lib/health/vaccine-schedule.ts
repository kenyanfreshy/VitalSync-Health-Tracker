/**
 * CDC/WHO Recommended Vaccine Schedule
 *
 * Data sourced from:
 * - CDC Recommended Immunization Schedule for Children/Adults (2024)
 * - WHO recommended vaccines list
 *
 * Each entry describes a vaccine, the recommended age groups, and the
 * standard number of doses in the primary series.
 */

export type AgeGroup =
  | 'birth'
  | '1-2m'
  | '2m'
  | '4m'
  | '6m'
  | '6-18m'
  | '12-15m'
  | '12-23m'
  | '15-18m'
  | '18m'
  | '2-3y'
  | '4-6y'
  | '7-10y'
  | '11-12y'
  | '13-18y'
  | '19-26y'
  | '27-45y'
  | '50y+'
  | '60y+'
  | '65y+'
  | 'annual'
  | 'pregnancy';

export interface VaccineScheduleEntry {
  id: string;
  /** Display name of the vaccine */
  name: string;
  /** Short abbreviation */
  abbr: string;
  /** Diseases it protects against */
  protects: string;
  /** Age groups when this vaccine is recommended */
  ageGroups: AgeGroup[];
  /** Total doses in primary series */
  primaryDoses: number;
  /** Booster information (if any) */
  boosterNote?: string;
  /** Category for grouping */
  category: 'routine_infant' | 'routine_child' | 'adolescent' | 'adult' | 'senior' | 'travel' | 'pregnancy';
  /** Source authority */
  source: 'CDC' | 'WHO' | 'CDC/WHO';
  /** Notes for the user */
  notes?: string;
}

export const VACCINE_SCHEDULE: VaccineScheduleEntry[] = [
  // ── Routine Infant ──────────────────────────────────────────────────────────
  {
    id: 'hepb',
    name: 'Hepatitis B',
    abbr: 'HepB',
    protects: 'Hepatitis B',
    ageGroups: ['birth', '1-2m', '6-18m'],
    primaryDoses: 3,
    category: 'routine_infant',
    source: 'CDC/WHO',
    notes: '3-dose series: birth, 1–2 months, 6–18 months.',
  },
  {
    id: 'rv',
    name: 'Rotavirus',
    abbr: 'RV',
    protects: 'Rotavirus gastroenteritis',
    ageGroups: ['2m', '4m', '6m'],
    primaryDoses: 3,
    category: 'routine_infant',
    source: 'CDC',
    notes: '2- or 3-dose series depending on brand used.',
  },
  {
    id: 'dtap',
    name: 'Diphtheria, Tetanus & Pertussis',
    abbr: 'DTaP',
    protects: 'Diphtheria, Tetanus, Whooping cough',
    ageGroups: ['2m', '4m', '6m', '15-18m', '4-6y'],
    primaryDoses: 5,
    boosterNote: 'Tdap booster at 11–12 y; Td every 10 years thereafter.',
    category: 'routine_infant',
    source: 'CDC/WHO',
  },
  {
    id: 'hib',
    name: 'Haemophilus influenzae type b',
    abbr: 'Hib',
    protects: 'Hib meningitis, pneumonia',
    ageGroups: ['2m', '4m', '6m', '12-15m'],
    primaryDoses: 4,
    category: 'routine_infant',
    source: 'CDC/WHO',
    notes: '3- or 4-dose series depending on brand.',
  },
  {
    id: 'pcv',
    name: 'Pneumococcal Conjugate',
    abbr: 'PCV15/PCV20',
    protects: 'Pneumococcal disease (pneumonia, meningitis)',
    ageGroups: ['2m', '4m', '6m', '12-15m'],
    primaryDoses: 4,
    boosterNote: 'PCV20 or PPSV23 recommended for adults 65+.',
    category: 'routine_infant',
    source: 'CDC',
  },
  {
    id: 'ipv',
    name: 'Inactivated Poliovirus',
    abbr: 'IPV',
    protects: 'Polio',
    ageGroups: ['2m', '4m', '6-18m', '4-6y'],
    primaryDoses: 4,
    category: 'routine_infant',
    source: 'CDC/WHO',
  },
  {
    id: 'covid',
    name: 'COVID-19',
    abbr: 'COVID-19',
    protects: 'COVID-19 (SARS-CoV-2)',
    ageGroups: ['6m', '2-3y', '4-6y', '7-10y', '11-12y', '13-18y', '19-26y', '27-45y', '50y+'],
    primaryDoses: 2,
    boosterNote: 'Updated booster recommended annually.',
    category: 'routine_infant',
    source: 'CDC/WHO',
  },
  // ── Routine Child ──────────────────────────────────────────────────────────
  {
    id: 'mmr',
    name: 'Measles, Mumps & Rubella',
    abbr: 'MMR',
    protects: 'Measles, Mumps, Rubella',
    ageGroups: ['12-15m', '4-6y'],
    primaryDoses: 2,
    category: 'routine_child',
    source: 'CDC/WHO',
  },
  {
    id: 'varicella',
    name: 'Varicella (Chickenpox)',
    abbr: 'VAR',
    protects: 'Chickenpox (Varicella)',
    ageGroups: ['12-15m', '4-6y'],
    primaryDoses: 2,
    category: 'routine_child',
    source: 'CDC',
  },
  {
    id: 'hepa',
    name: 'Hepatitis A',
    abbr: 'HepA',
    protects: 'Hepatitis A',
    ageGroups: ['12-23m', '2-3y'],
    primaryDoses: 2,
    category: 'routine_child',
    source: 'CDC',
    notes: '2-dose series, 6 months apart.',
  },
  // ── Adolescent ─────────────────────────────────────────────────────────────
  {
    id: 'hpv',
    name: 'Human Papillomavirus',
    abbr: 'HPV',
    protects: 'HPV-related cancers & genital warts',
    ageGroups: ['11-12y', '13-18y', '19-26y'],
    primaryDoses: 2,
    boosterNote: '3 doses if started at age 15+.',
    category: 'adolescent',
    source: 'CDC',
  },
  {
    id: 'meningococcal',
    name: 'Meningococcal ACWY',
    abbr: 'MenACWY',
    protects: 'Meningococcal disease (types A, C, W, Y)',
    ageGroups: ['11-12y', '13-18y'],
    primaryDoses: 2,
    boosterNote: 'Booster at 16 y if first dose at 11–12 y.',
    category: 'adolescent',
    source: 'CDC',
  },
  {
    id: 'menb',
    name: 'Meningococcal B',
    abbr: 'MenB',
    protects: 'Meningococcal disease (type B)',
    ageGroups: ['11-12y', '13-18y', '19-26y'],
    primaryDoses: 2,
    category: 'adolescent',
    source: 'CDC',
    notes: 'Recommended for high-risk individuals; shared decision for others.',
  },
  {
    id: 'tdap',
    name: 'Tdap (Adolescent/Adult)',
    abbr: 'Tdap',
    protects: 'Tetanus, Diphtheria, Pertussis',
    ageGroups: ['11-12y', '13-18y', 'pregnancy'],
    primaryDoses: 1,
    boosterNote: 'Td booster every 10 years.',
    category: 'adolescent',
    source: 'CDC/WHO',
  },
  // ── Adult ──────────────────────────────────────────────────────────────────
  {
    id: 'flu',
    name: 'Influenza (Flu)',
    abbr: 'Flu',
    protects: 'Seasonal influenza',
    ageGroups: ['annual'],
    primaryDoses: 1,
    boosterNote: 'Annual vaccination recommended for everyone 6 months+.',
    category: 'adult',
    source: 'CDC/WHO',
  },
  {
    id: 'rsv',
    name: 'RSV',
    abbr: 'RSV',
    protects: 'Respiratory Syncytial Virus',
    ageGroups: ['60y+', 'pregnancy'],
    primaryDoses: 1,
    category: 'adult',
    source: 'CDC',
    notes: 'Recommended for adults 60+ and pregnant women (32–36 weeks).',
  },
  {
    id: 'zoster',
    name: 'Shingles (Shingrix)',
    abbr: 'RZV',
    protects: 'Shingles (Herpes Zoster)',
    ageGroups: ['50y+'],
    primaryDoses: 2,
    category: 'senior',
    source: 'CDC',
    notes: '2-dose series, 2–6 months apart. Preferred over Zostavax.',
  },
  {
    id: 'ppsv23',
    name: 'Pneumococcal Polysaccharide',
    abbr: 'PPSV23',
    protects: 'Pneumococcal disease',
    ageGroups: ['65y+'],
    primaryDoses: 1,
    category: 'senior',
    source: 'CDC',
  },
  {
    id: 'pcv20_adult',
    name: 'Pneumococcal Conjugate (Adult)',
    abbr: 'PCV20',
    protects: 'Pneumococcal disease',
    ageGroups: ['65y+'],
    primaryDoses: 1,
    category: 'senior',
    source: 'CDC',
    notes: 'PCV20 alone, or PCV15 followed by PPSV23.',
  },
  // ── Pregnancy ──────────────────────────────────────────────────────────────
  {
    id: 'flu_preg',
    name: 'Influenza (during pregnancy)',
    abbr: 'Flu',
    protects: 'Influenza',
    ageGroups: ['pregnancy'],
    primaryDoses: 1,
    category: 'pregnancy',
    source: 'CDC/WHO',
    notes: 'Recommended during any trimester of pregnancy.',
  },
  {
    id: 'tdap_preg',
    name: 'Tdap (during pregnancy)',
    abbr: 'Tdap',
    protects: 'Tetanus, Diphtheria, Pertussis',
    ageGroups: ['pregnancy'],
    primaryDoses: 1,
    category: 'pregnancy',
    source: 'CDC',
    notes: 'Recommended at 27–36 weeks of each pregnancy.',
  },
  {
    id: 'rsv_preg',
    name: 'RSV (during pregnancy)',
    abbr: 'RSV',
    protects: 'RSV in newborns',
    ageGroups: ['pregnancy'],
    primaryDoses: 1,
    category: 'pregnancy',
    source: 'CDC',
    notes: 'Recommended at 32–36 weeks gestation (seasonal).',
  },
];

/** All unique age groups present in the schedule */
export const ALL_AGE_GROUPS: AgeGroup[] = [
  'birth', '1-2m', '2m', '4m', '6m', '6-18m',
  '12-15m', '12-23m', '15-18m', '18m', '2-3y', '4-6y',
  '7-10y', '11-12y', '13-18y', '19-26y', '27-45y',
  '50y+', '60y+', '65y+', 'annual', 'pregnancy',
];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  'birth': 'At Birth',
  '1-2m': '1–2 Months',
  '2m': '2 Months',
  '4m': '4 Months',
  '6m': '6 Months',
  '6-18m': '6–18 Months',
  '12-15m': '12–15 Months',
  '12-23m': '12–23 Months',
  '15-18m': '15–18 Months',
  '18m': '18 Months',
  '2-3y': '2–3 Years',
  '4-6y': '4–6 Years',
  '7-10y': '7–10 Years',
  '11-12y': '11–12 Years',
  '13-18y': '13–18 Years',
  '19-26y': '19–26 Years',
  '27-45y': '27–45 Years',
  '50y+': '50+ Years',
  '60y+': '60+ Years',
  '65y+': '65+ Years',
  'annual': 'Annual',
  'pregnancy': 'Pregnancy',
};

export const CATEGORY_LABELS: Record<VaccineScheduleEntry['category'], string> = {
  routine_infant: 'Routine Infant',
  routine_child: 'Routine Child',
  adolescent: 'Adolescent',
  adult: 'Adult',
  senior: 'Senior (50+)',
  travel: 'Travel',
  pregnancy: 'Pregnancy',
};

/**
 * Given a list of administered vaccine names, returns the schedule entries
 * that appear to be missing (no matching record found).
 */
export function findScheduleGaps(
  scheduleEntries: VaccineScheduleEntry[],
  administeredVaccineNames: string[],
): VaccineScheduleEntry[] {
  const lower = administeredVaccineNames.map(n => n.toLowerCase());
  return scheduleEntries.filter(entry => {
    const entryLower = entry.name.toLowerCase();
    const abbrLower = entry.abbr.toLowerCase();
    return !lower.some(n =>
      n.includes(entryLower) ||
      entryLower.includes(n) ||
      n.includes(abbrLower) ||
      abbrLower.includes(n)
    );
  });
}
