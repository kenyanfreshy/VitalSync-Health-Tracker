/**
 * EvidenceReferences
 *
 * Local registry of peer-reviewed references used by the On-Device Insights engine.
 * Each entry includes a short explanation, source organisation, and optional URL.
 *
 * Rules:
 * - No medical claims or diagnostic language.
 * - All language uses "may indicate", "associated with", "based on observed trends".
 * - For informational purposes only.
 */

export interface EvidenceReference {
  /** Unique stable ID referenced by InsightRules */
  id: string;
  /** Short human-readable title shown in the Evidence Library */
  title: string;
  /** One-sentence plain-language explanation */
  explanation: string;
  /** Issuing organisation or journal */
  source: string;
  /** Badge label shown in UI (e.g. 'AHA', 'ADA', 'WHO', 'PMID') */
  badge: string;
  /** Accent colour for the badge */
  color: string;
  /** Optional external URL (opened in browser on tap) */
  url?: string;
}

export const EVIDENCE_REFERENCES: EvidenceReference[] = [
  // ── Cardiovascular ──────────────────────────────────────────────────────────
  {
    id: 'aha_bp_2017',
    title: 'AHA/ACC Hypertension Guidelines 2017',
    explanation: 'Defines blood pressure categories: Normal <120/80, Elevated 120–129/<80, Stage 1 130–139/80–89, Stage 2 ≥140/90 mmHg.',
    source: 'American Heart Association / American College of Cardiology',
    badge: 'AHA 2017',
    color: '#EF4444',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29133354/',
  },
  {
    id: 'aha_bp_2021',
    title: 'AHA Scientific Statement on BP Monitoring 2021',
    explanation: 'Sustained systolic BP ≥130 mmHg is associated with increased cardiovascular risk in adults.',
    source: 'American Heart Association',
    badge: 'AHA 2021',
    color: '#EF4444',
    url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001031',
  },
  {
    id: 'jnc8',
    title: 'JNC-8 Hypertension Management Guidelines',
    explanation: 'Evidence-based recommendations for blood pressure treatment thresholds and targets in adults.',
    source: 'Joint National Committee (JAMA)',
    badge: 'JNC-8',
    color: '#EF4444',
    url: 'https://jamanetwork.com/journals/jama/fullarticle/1791497',
  },
  {
    id: 'hrv_meta_2020',
    title: 'HRV as a Marker of Autonomic Health (Meta-Analysis)',
    explanation: 'Low HRV is associated with reduced cardiovascular resilience and autonomic nervous system dysregulation.',
    source: 'PubMed Meta-Analysis (2020–2025)',
    badge: 'HRV Meta',
    color: '#6366F1',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=heart+rate+variability+readiness+meta-analysis&filter=years.2020-2025',
  },
  {
    id: 'rhr_trend',
    title: 'Resting Heart Rate as a Cardiovascular Risk Indicator',
    explanation: 'A rising resting heart rate trend over several days may be associated with increased physiological stress or early illness.',
    source: 'European Heart Journal / PubMed',
    badge: 'EHJ',
    color: '#EF4444',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=resting+heart+rate+cardiovascular+risk+trend',
  },
  // ── Blood Glucose ───────────────────────────────────────────────────────────
  {
    id: 'ada_2024',
    title: 'ADA Standards of Care in Diabetes 2024',
    explanation: 'Fasting glucose ≥100 mg/dL may indicate impaired fasting glucose; ≥126 mg/dL on two occasions meets diagnostic criteria for diabetes.',
    source: 'American Diabetes Association',
    badge: 'ADA 2024',
    color: '#3B82F6',
    url: 'https://diabetesjournals.org/care/issue/47/Supplement_1',
  },
  {
    id: 'ada_postmeal',
    title: 'ADA Post-Meal Glucose Targets',
    explanation: 'Post-meal (2-hour) glucose targets are <180 mg/dL for most adults with diabetes; <140 mg/dL for non-diabetic individuals.',
    source: 'American Diabetes Association',
    badge: 'ADA 2024',
    color: '#3B82F6',
    url: 'https://diabetesjournals.org/care/issue/47/Supplement_1',
  },
  {
    id: 'glucose_cv_risk',
    title: 'Hyperglycaemia and Cardiovascular Risk (Meta-Analysis)',
    explanation: 'Sustained elevated blood glucose is associated with increased risk of cardiovascular events in both diabetic and non-diabetic populations.',
    source: 'PubMed Meta-Analysis (2020–2025)',
    badge: 'PubMed',
    color: '#3B82F6',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=hyperglycemia+cardiovascular+risk+meta-analysis&filter=years.2020-2025',
  },
  // ── Sleep ───────────────────────────────────────────────────────────────────
  {
    id: 'sleep_meta_2019',
    title: 'Sleep Duration and Health Outcomes (Meta-Analysis)',
    explanation: 'Consistently sleeping fewer than 7 hours per night is associated with increased risk of obesity, cardiovascular disease, and impaired immune function.',
    source: 'PubMed Meta-Analysis (2019–2025)',
    badge: 'Sleep Meta',
    color: '#8B5CF6',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=sleep+duration+health+outcomes+meta-analysis&filter=years.2019-2025',
  },
  {
    id: 'aasm_sleep',
    title: 'AASM Sleep Duration Recommendations',
    explanation: 'The American Academy of Sleep Medicine recommends adults sleep 7 or more hours per night for optimal health.',
    source: 'American Academy of Sleep Medicine',
    badge: 'AASM',
    color: '#8B5CF6',
    url: 'https://aasm.org/resources/pdf/healthysleep.pdf',
  },
  {
    id: 'sleep_bp',
    title: 'Sleep Deprivation and Blood Pressure',
    explanation: 'Short sleep duration (< 6 hours) is associated with elevated blood pressure and increased hypertension risk.',
    source: 'Journal of Hypertension / PubMed',
    badge: 'J Hypertens',
    color: '#8B5CF6',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=sleep+deprivation+blood+pressure+hypertension',
  },
  // ── Activity ────────────────────────────────────────────────────────────────
  {
    id: 'who_activity_2023',
    title: 'WHO Physical Activity Guidelines 2023',
    explanation: 'Adults should achieve at least 150–300 minutes of moderate-intensity aerobic activity per week for substantial health benefits.',
    source: 'World Health Organization',
    badge: 'WHO 2023',
    color: '#059669',
    url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity',
  },
  {
    id: 'steps_meta',
    title: 'Daily Step Count and Mortality Risk (Meta-Analysis)',
    explanation: 'Achieving 7,000–10,000 steps per day is associated with reduced all-cause mortality and improved cardiovascular outcomes.',
    source: 'JAMA Internal Medicine / PubMed',
    badge: 'JAMA IM',
    color: '#059669',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=daily+steps+mortality+meta-analysis',
  },
  // ── Weight ──────────────────────────────────────────────────────────────────
  {
    id: 'who_bmi',
    title: 'WHO BMI Classification',
    explanation: 'BMI 18.5–24.9 is classified as normal weight; 25–29.9 as overweight; ≥30 as obese. BMI is a screening tool, not a diagnostic measure.',
    source: 'World Health Organization',
    badge: 'WHO',
    color: '#F59E0B',
    url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight',
  },
  {
    id: 'weight_trend',
    title: 'Unintentional Weight Change as a Clinical Signal',
    explanation: 'Unintentional weight loss >5% over 6–12 months may warrant clinical evaluation. Gradual weight gain is associated with increased cardiometabolic risk.',
    source: 'NIH / PubMed',
    badge: 'NIH',
    color: '#F59E0B',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK459357/',
  },
  // ── Medication Adherence ────────────────────────────────────────────────────
  {
    id: 'cochrane_adherence',
    title: 'Medication Adherence and Health Outcomes (Cochrane)',
    explanation: 'Consistent medication adherence is associated with improved clinical outcomes across chronic conditions including hypertension and diabetes.',
    source: 'Cochrane Library',
    badge: 'Cochrane',
    color: '#10B981',
    url: 'https://www.cochranelibrary.com/search?q=medication+adherence+outcomes',
  },
  // ── SpO2 ────────────────────────────────────────────────────────────────────
  {
    id: 'spo2_normal',
    title: 'Normal Oxygen Saturation Reference Range',
    explanation: 'SpO2 of 95–100% is considered normal for healthy adults. Values below 95% may warrant clinical attention.',
    source: 'American Thoracic Society / NIH',
    badge: 'ATS',
    color: '#06B6D4',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK525962/',
  },
];

/** Lookup a reference by ID. Returns undefined if not found. */
export function getEvidenceRef(id: string): EvidenceReference | undefined {
  return EVIDENCE_REFERENCES.find(r => r.id === id);
}

/** Get multiple references by IDs (skips missing). */
export function getEvidenceRefs(ids: string[]): EvidenceReference[] {
  return ids.flatMap(id => {
    const ref = getEvidenceRef(id);
    return ref ? [ref] : [];
  });
}
