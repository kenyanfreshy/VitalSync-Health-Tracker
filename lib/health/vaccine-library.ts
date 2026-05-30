/**
 * CDC Vaccine Library
 *
 * Comprehensive list of CDC-recommended vaccines covering:
 *   • Routine adult immunizations (CDC Adult Immunization Schedule, Oct 2025)
 *   • Childhood / adolescent vaccines (CDC Child & Adolescent Schedule)
 *   • Travel & tropical disease vaccines (CDC Travelers' Health, Think Travel Vaccine Guide)
 *
 * Sources:
 *   https://www.cdc.gov/vaccines/hcp/imz-schedules/adult-schedule-vaccines.html
 *   https://wwwnc.cdc.gov/travel/page/vaccine-guide
 */

export type VaccineCategory =
  | 'Routine – Childhood'
  | 'Routine – Adolescent'
  | 'Routine – Adult'
  | 'Travel – General'
  | 'Travel – Tropical / Endemic';

export interface VaccineTemplate {
  /** Display name shown in the picker */
  name: string;
  /** CDC abbreviation (e.g. "MMR", "Tdap") */
  abbreviation: string;
  /** Brand names, comma-separated */
  brandNames: string;
  /** Category for grouping in the picker */
  category: VaccineCategory;
  /** Typical number of doses in the primary series */
  typicalDoses: number;
  /** Short description / indication shown as subtitle */
  description: string;
  /** Standard route of administration */
  route: string;
  /** Standard anatomical site */
  site: string;
}

export const VACCINE_LIBRARY: VaccineTemplate[] = [
  // ─── Routine – Childhood ────────────────────────────────────────────────────
  {
    name: 'Hepatitis B',
    abbreviation: 'HepB',
    brandNames: 'Engerix-B, Heplisav-B, Recombivax HB',
    category: 'Routine – Childhood',
    typicalDoses: 3,
    description: 'Protects against hepatitis B virus infection. Given at birth, 1–2 months, and 6–18 months.',
    route: 'Intramuscular (IM)',
    site: 'Anterolateral thigh (infants) / Deltoid (adults)',
  },
  {
    name: 'Rotavirus',
    abbreviation: 'RV',
    brandNames: 'Rotarix, RotaTeq',
    category: 'Routine – Childhood',
    typicalDoses: 2,
    description: 'Prevents severe rotavirus diarrhea. Oral vaccine given at 2 and 4 months (Rotarix) or 2, 4, 6 months (RotaTeq).',
    route: 'Oral',
    site: 'Oral',
  },
  {
    name: 'Diphtheria, Tetanus & Pertussis (DTaP)',
    abbreviation: 'DTaP',
    brandNames: 'Daptacel, Infanrix, Pediarix, Pentacel',
    category: 'Routine – Childhood',
    typicalDoses: 5,
    description: 'Protects against diphtheria, tetanus, and whooping cough. 5-dose series at 2, 4, 6, 15–18 months, and 4–6 years.',
    route: 'Intramuscular (IM)',
    site: 'Anterolateral thigh (infants) / Deltoid (children)',
  },
  {
    name: 'Haemophilus influenzae type b (Hib)',
    abbreviation: 'Hib',
    brandNames: 'ActHIB, Hiberix, PedvaxHIB',
    category: 'Routine – Childhood',
    typicalDoses: 4,
    description: 'Prevents Hib meningitis and other invasive Hib disease. Given at 2, 4, 6, and 12–15 months.',
    route: 'Intramuscular (IM)',
    site: 'Anterolateral thigh',
  },
  {
    name: 'Pneumococcal Conjugate (PCV15/PCV20)',
    abbreviation: 'PCV',
    brandNames: 'Prevnar 20, Vaxneuvance',
    category: 'Routine – Childhood',
    typicalDoses: 4,
    description: 'Prevents pneumococcal pneumonia, meningitis, and bloodstream infections. 4-dose series starting at 2 months.',
    route: 'Intramuscular (IM)',
    site: 'Anterolateral thigh (infants) / Deltoid (children)',
  },
  {
    name: 'Inactivated Poliovirus (IPV)',
    abbreviation: 'IPV',
    brandNames: 'Ipol',
    category: 'Routine – Childhood',
    typicalDoses: 4,
    description: 'Prevents poliomyelitis. 4-dose series at 2, 4, 6–18 months, and 4–6 years.',
    route: 'Intramuscular (IM) or Subcutaneous (SC)',
    site: 'Anterolateral thigh (infants) / Deltoid (children)',
  },
  {
    name: 'Influenza (Flu)',
    abbreviation: 'IIV / LAIV',
    brandNames: 'Fluzone, Flucelvax, FluMist, Fluad, Flublok',
    category: 'Routine – Childhood',
    typicalDoses: 1,
    description: 'Annual flu vaccine. Children 6 months–8 years receiving for the first time need 2 doses 4 weeks apart.',
    route: 'Intramuscular (IM) or Intranasal',
    site: 'Deltoid / Intranasal',
  },
  {
    name: 'Measles, Mumps & Rubella (MMR)',
    abbreviation: 'MMR',
    brandNames: 'M-M-R II, Priorix',
    category: 'Routine – Childhood',
    typicalDoses: 2,
    description: 'Protects against measles, mumps, and rubella. Given at 12–15 months and 4–6 years.',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'Varicella (Chickenpox)',
    abbreviation: 'VAR',
    brandNames: 'Varivax',
    category: 'Routine – Childhood',
    typicalDoses: 2,
    description: 'Prevents chickenpox. Given at 12–15 months and 4–6 years.',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'Hepatitis A',
    abbreviation: 'HepA',
    brandNames: 'Havrix, Vaqta',
    category: 'Routine – Childhood',
    typicalDoses: 2,
    description: 'Prevents hepatitis A infection. 2-dose series starting at 12–23 months, second dose 6–18 months later.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'COVID-19 (mRNA)',
    abbreviation: '1vCOV-mRNA',
    brandNames: 'Comirnaty (Pfizer), Spikevax (Moderna), mNexspike',
    category: 'Routine – Childhood',
    typicalDoses: 1,
    description: 'Annual updated COVID-19 vaccine recommended for everyone 6 months and older.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },

  // ─── Routine – Adolescent ───────────────────────────────────────────────────
  {
    name: 'Meningococcal ACWY (MenACWY)',
    abbreviation: 'MenACWY',
    brandNames: 'Menveo, MenQuadfi',
    category: 'Routine – Adolescent',
    typicalDoses: 2,
    description: 'Protects against meningococcal serogroups A, C, W, Y. Recommended at 11–12 years with booster at 16.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Meningococcal B (MenB)',
    abbreviation: 'MenB',
    brandNames: 'Bexsero, Trumenba',
    category: 'Routine – Adolescent',
    typicalDoses: 2,
    description: 'Protects against meningococcal serogroup B. Recommended at 16–18 years discuss with your healthcare provider.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Human Papillomavirus (HPV)',
    abbreviation: 'HPV',
    brandNames: 'Gardasil 9',
    category: 'Routine – Adolescent',
    typicalDoses: 2,
    description: 'Prevents HPV-related cancers and genital warts. 2-dose series at 11–12 years (3 doses if started at 15+).',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Tetanus, Diphtheria & Pertussis (Tdap)',
    abbreviation: 'Tdap',
    brandNames: 'Adacel, Boostrix',
    category: 'Routine – Adolescent',
    typicalDoses: 1,
    description: 'Booster for tetanus, diphtheria, and whooping cough. Recommended at 11–12 years; then Td booster every 10 years.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },

  // ─── Routine – Adult ────────────────────────────────────────────────────────
  {
    name: 'Tetanus & Diphtheria (Td)',
    abbreviation: 'Td',
    brandNames: 'Tenivac',
    category: 'Routine – Adult',
    typicalDoses: 1,
    description: 'Booster every 10 years for adults who received Tdap. Also given after wound injuries.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Influenza (Annual)',
    abbreviation: 'IIV3 / RIV3',
    brandNames: 'Fluzone HD (65+), Fluad (65+), Flublok, Flucelvax',
    category: 'Routine – Adult',
    typicalDoses: 1,
    description: 'Annual flu vaccine for all adults. High-dose or adjuvanted formulations preferred for adults 65+.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'COVID-19 (Annual Updated)',
    abbreviation: '1vCOV-mRNA',
    brandNames: 'Comirnaty, Spikevax, Nuvaxovid',
    category: 'Routine – Adult',
    typicalDoses: 1,
    description: 'Annual updated COVID-19 vaccine recommended for all adults.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Pneumococcal (PCV20 or PCV15 + PPSV23)',
    abbreviation: 'PCV20 / PCV15',
    brandNames: 'Prevnar 20, Vaxneuvance, Pneumovax 23',
    category: 'Routine – Adult',
    typicalDoses: 1,
    description: 'Prevents pneumococcal pneumonia and invasive disease. Recommended for adults 65+ and younger adults with risk conditions.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Shingles / Zoster (RZV)',
    abbreviation: 'RZV',
    brandNames: 'Shingrix',
    category: 'Routine – Adult',
    typicalDoses: 2,
    description: 'Prevents shingles and postherpetic neuralgia. 2-dose series (0 and 2–6 months) for adults 50+.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'RSV Vaccine',
    abbreviation: 'RSV',
    brandNames: 'Abrysvo, Arexvy, mResvia',
    category: 'Routine – Adult',
    typicalDoses: 1,
    description: 'Prevents RSV lower respiratory tract disease. Single dose recommended for adults 60+ (shared decision-making) and pregnant women 32–36 weeks.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Hepatitis B (Adult)',
    abbreviation: 'HepB',
    brandNames: 'Heplisav-B, Engerix-B, PreHevbrio',
    category: 'Routine – Adult',
    typicalDoses: 3,
    description: 'Recommended for all unvaccinated adults. Heplisav-B is a 2-dose series; others are 3-dose.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Hepatitis A (Adult)',
    abbreviation: 'HepA',
    brandNames: 'Havrix, Vaqta, Twinrix (HepA-HepB combo)',
    category: 'Routine – Adult',
    typicalDoses: 2,
    description: 'Recommended for unvaccinated adults at increased risk (travel, liver disease, etc.). 2-dose series 6–18 months apart.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'MMR (Adult)',
    abbreviation: 'MMR',
    brandNames: 'M-M-R II, Priorix',
    category: 'Routine – Adult',
    typicalDoses: 2,
    description: 'For adults born after 1957 without evidence of immunity. 2 doses 4 weeks apart for healthcare workers and international travelers.',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'Varicella (Adult)',
    abbreviation: 'VAR',
    brandNames: 'Varivax',
    category: 'Routine – Adult',
    typicalDoses: 2,
    description: 'For adults without evidence of immunity to varicella. 2-dose series 4–8 weeks apart.',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'HPV (Adult, catch-up)',
    abbreviation: 'HPV',
    brandNames: 'Gardasil 9',
    category: 'Routine – Adult',
    typicalDoses: 3,
    description: 'Catch-up vaccination recommended through age 26. Shared decision-making for adults 27–45.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Mpox (Monkeypox)',
    abbreviation: 'Mpox',
    brandNames: 'Jynneos',
    category: 'Routine – Adult',
    typicalDoses: 2,
    description: 'Recommended for adults at risk for mpox exposure. 2-dose series 28 days apart.',
    route: 'Subcutaneous (SC) or Intradermal (ID)',
    site: 'Outer upper arm',
  },

  // ─── Travel – General ───────────────────────────────────────────────────────
  {
    name: 'Hepatitis A (Travel)',
    abbreviation: 'HepA',
    brandNames: 'Havrix, Vaqta',
    category: 'Travel – General',
    typicalDoses: 2,
    description: 'Recommended for most international travelers. Contaminated food and water risk. At least 1 dose before travel; second dose 6–18 months later.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Hepatitis B (Travel)',
    abbreviation: 'HepB',
    brandNames: 'Engerix-B, Heplisav-B, Twinrix',
    category: 'Travel – General',
    typicalDoses: 3,
    description: 'Recommended for travelers to countries with HepB prevalence ≥2%. Accelerated schedule available. 3 doses at 0, 1, and 6 months.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Typhoid',
    abbreviation: 'Typhoid',
    brandNames: 'Typhim Vi (injectable), Vivotif (oral)',
    category: 'Travel – General',
    typicalDoses: 1,
    description: 'Recommended for travelers to typhoid-endemic countries. Injectable: 1 dose ≥2 weeks before travel. Oral: 4 capsules over 7 days.',
    route: 'Intramuscular (IM) or Oral',
    site: 'Deltoid / Oral',
  },
  {
    name: 'Meningococcal ACWY (Travel)',
    abbreviation: 'MenACWY',
    brandNames: 'Menveo, MenQuadfi',
    category: 'Travel – General',
    typicalDoses: 1,
    description: 'Required for Hajj/Umrah pilgrimage to Saudi Arabia. Recommended for travel to sub-Saharan Africa meningitis belt (Dec–Jun). Administer ≥10 days before travel.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Rabies (Pre-exposure)',
    abbreviation: 'Rabies PrEP',
    brandNames: 'Imovax Rabies, RabAvert',
    category: 'Travel – General',
    typicalDoses: 3,
    description: 'For travelers to high-risk countries with extensive outdoor exposure, animal contact, or remote travel. 3-dose series at days 0, 7, and 21 or 28.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Cholera',
    abbreviation: 'Cholera',
    brandNames: 'Vaxchora',
    category: 'Travel – General',
    typicalDoses: 1,
    description: 'Recommended for adults traveling to areas with active cholera transmission. Single oral dose ≥10 days before travel.',
    route: 'Oral',
    site: 'Oral',
  },

  // ─── Travel – Tropical / Endemic ────────────────────────────────────────────
  {
    name: 'Yellow Fever',
    abbreviation: 'YF',
    brandNames: 'YF-Vax, Stamaril',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 1,
    description: 'Required or recommended for travel to parts of sub-Saharan Africa and South America. Single dose provides lifelong immunity. Must be given at authorized clinic; carry yellow card (ICVP).',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'Japanese Encephalitis',
    abbreviation: 'JE',
    brandNames: 'Ixiaro',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 2,
    description: 'For travelers to endemic Asia/western Pacific staying >1 month or with extensive outdoor exposure. 2-dose series at days 0 and 28; complete ≥1 week before travel.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Tick-Borne Encephalitis (TBE)',
    abbreviation: 'TBE',
    brandNames: 'Ticovac, Encevir',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 3,
    description: 'For travelers to endemic areas in Europe and Asia with outdoor tick exposure. 3-dose series; booster every 3 years with ongoing exposure.',
    route: 'Intramuscular (IM)',
    site: 'Deltoid',
  },
  {
    name: 'Malaria Prophylaxis (Antimalarial)',
    abbreviation: 'Malaria',
    brandNames: 'Malarone (atovaquone/proguanil), Doxycycline, Mefloquine, Primaquine',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 1,
    description: 'Medication (not vaccine) for malaria prevention in sub-Saharan Africa, South/Southeast Asia, Central/South America. Begin before travel; continue during and after.',
    route: 'Oral',
    site: 'Oral',
  },
  {
    name: 'Chikungunya',
    abbreviation: 'Chikungunya',
    brandNames: 'Ixchiq, Vimkunya',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 1,
    description: 'For adults 18+ traveling to areas with chikungunya outbreaks or elevated risk (tropical/subtropical regions). Single dose.',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'Dengue',
    abbreviation: 'Dengue',
    brandNames: 'Dengvaxia',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 3,
    description: 'For individuals 9–16 years with lab-confirmed prior dengue infection living in endemic areas. 3-dose series at 0, 6, and 12 months.',
    route: 'Subcutaneous (SC)',
    site: 'Outer upper arm',
  },
  {
    name: 'Typhoid (Oral, Travel)',
    abbreviation: 'Ty21a',
    brandNames: 'Vivotif',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 4,
    description: 'Oral typhoid vaccine for travel to South Asia, Southeast Asia, Africa, and Latin America. 4 capsules taken every other day; complete ≥10 days before travel.',
    route: 'Oral',
    site: 'Oral',
  },
  {
    name: 'Polio Booster (Travel)',
    abbreviation: 'IPV',
    brandNames: 'Ipol',
    category: 'Travel – Tropical / Endemic',
    typicalDoses: 1,
    description: 'Single lifetime booster for adults who completed childhood series and are traveling to polio-endemic or high-risk countries (Afghanistan, Pakistan, Nigeria).',
    route: 'Intramuscular (IM) or Subcutaneous (SC)',
    site: 'Deltoid',
  },
];

/** All unique categories in display order */
export const VACCINE_CATEGORIES: VaccineCategory[] = [
  'Routine – Childhood',
  'Routine – Adolescent',
  'Routine – Adult',
  'Travel – General',
  'Travel – Tropical / Endemic',
];

/** Emoji icon for each category */
export const CATEGORY_ICON: Record<VaccineCategory, string> = {
  'Routine – Childhood': '👶',
  'Routine – Adolescent': '🧑',
  'Routine – Adult': '🧑‍⚕️',
  'Travel – General': '✈️',
  'Travel – Tropical / Endemic': '🌴',
};

/** Accent color for each category */
export const CATEGORY_COLOR: Record<VaccineCategory, string> = {
  'Routine – Childhood': '#0EA5E9',
  'Routine – Adolescent': '#8B5CF6',
  'Routine – Adult': '#22C55E',
  'Travel – General': '#F59E0B',
  'Travel – Tropical / Endemic': '#EF4444',
};
