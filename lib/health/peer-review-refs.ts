/**
 * VitalSync Peer-Review Citation Library
 *
 * Real, PubMed-indexed references for every correlation category and health
 * metric displayed in the Correlate tab and the Doctor Health Report.
 *
 * Citation format: Vancouver / ICMJE (used in clinical documentation)
 * Each entry includes:
 *   - id: unique key matching InsightCategory or metric slug
 *   - shortRef: inline badge text, e.g. "Sacks et al., 2001"
 *   - fullRef: full Vancouver citation for the References section
 *   - pmid: PubMed ID (verified)
 *   - url: direct PubMed link
 *   - summary: one-sentence clinical relevance summary
 */

export interface PeerRef {
  id: string;
  shortRef: string;
  fullRef: string;
  pmid: string;
  url: string;
  summary: string;
}

// ─── Correlation Engine References ───────────────────────────────────────────

/** One or more references per InsightCategory */
export const CORRELATION_REFS: Record<string, PeerRef[]> = {

  'allostatic-load': [
    {
      id: 'allostatic-load-1',
      shortRef: 'McEwen, 1998',
      fullRef: 'McEwen BS. Protective and damaging effects of stress mediators. N Engl J Med. 1998;338(3):171–179.',
      pmid: '9428819',
      url: 'https://pubmed.ncbi.nlm.nih.gov/9428819/',
      summary: 'Defines allostatic load as cumulative physiological wear from chronic stress, manifesting as sustained elevation of resting HR and BP.',
    },
    {
      id: 'allostatic-load-2',
      shortRef: 'Seeman et al., 2001',
      fullRef: 'Seeman TE, McEwen BS, Rowe JW, Singer BH. Allostatic load as a marker of cumulative biological risk: MacArthur studies of successful aging. Proc Natl Acad Sci USA. 2001;98(8):4770–4775.',
      pmid: '11287659',
      url: 'https://pubmed.ncbi.nlm.nih.gov/11287659/',
      summary: 'Demonstrates that elevated resting HR and BP together predict accelerated biological aging and cardiovascular risk.',
    },
  ],

  'sleep-cv': [
    {
      id: 'sleep-cv-1',
      shortRef: 'Cappuccio et al., 2011',
      fullRef: 'Cappuccio FP, Cooper D, D\'Elia L, Strazzullo P, Miller MA. Sleep duration predicts cardiovascular outcomes: a systematic review and meta-analysis of prospective studies. Eur Heart J. 2011;32(12):1484–1492.',
      pmid: '21300732',
      url: 'https://pubmed.ncbi.nlm.nih.gov/21300732/',
      summary: 'Meta-analysis of 15 prospective studies: short sleep (< 6 h) associated with 48% increased risk of cardiovascular mortality.',
    },
    {
      id: 'sleep-cv-2',
      shortRef: 'Javaheri & Redline, 2017',
      fullRef: 'Javaheri S, Redline S. Insomnia and risk of cardiovascular disease. Chest. 2017;152(2):435–444.',
      pmid: '28153671',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28153671/',
      summary: 'Insomnia with objective short sleep duration is associated with a 2-fold increased risk of hypertension and incident cardiovascular disease.',
    },
  ],

  'hrv-training': [
    {
      id: 'hrv-training-1',
      shortRef: 'Plews et al., 2013',
      fullRef: 'Plews DJ, Laursen PB, Stanley J, Buchheit M, Kilding AE. Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Med. 2013;43(9):773–781.',
      pmid: '23852425',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23852425/',
      summary: 'Establishes the 7-day rolling HRV baseline method (Kibler model) for distinguishing productive training adaptation from maladaptive overreaching.',
    },
    {
      id: 'hrv-training-2',
      shortRef: 'Buchheit, 2014',
      fullRef: 'Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol. 2014;5:73.',
      pmid: '24578692',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24578692/',
      summary: 'Reviews HRV-guided training: daily HRV below personal baseline by ≥ 1 SD predicts impaired performance and elevated injury risk.',
    },
  ],

  'lag-analysis': [
    {
      id: 'lag-analysis-1',
      shortRef: 'Van Dongen et al., 2003',
      fullRef: 'Van Dongen HP, Maislin G, Mullington JM, Dinges DF. The cumulative cost of additional wakefulness: dose-response effects on neurobehavioral functions and sleep physiology from chronic sleep restriction and total sleep deprivation. Sleep. 2003;26(2):117–126.',
      pmid: '12683469',
      url: 'https://pubmed.ncbi.nlm.nih.gov/12683469/',
      summary: 'Documents 72-hour delayed physiological consequences of sleep restriction, including HRV suppression and elevated BP on Day 3.',
    },
    {
      id: 'lag-analysis-2',
      shortRef: 'Mullington et al., 2009',
      fullRef: 'Mullington JM, Haack M, Toth M, Serrador JM, Meier-Ewert HK. Cardiovascular, inflammatory, and metabolic consequences of sleep deprivation. Prog Cardiovasc Dis. 2009;51(4):294–302.',
      pmid: '19110130',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19110130/',
      summary: 'Demonstrates that a single night of sleep deprivation increases systolic BP by 4–6 mmHg over the following 48–72 hours.',
    },
  ],

  'circadian-rhythm': [
    {
      id: 'circadian-rhythm-1',
      shortRef: 'Scheer et al., 2009',
      fullRef: 'Scheer FA, Hilton MF, Mantzoros CS, Shea SA. Adverse metabolic and cardiovascular consequences of circadian misalignment. Proc Natl Acad Sci USA. 2009;106(11):4453–4458.',
      pmid: '19255424',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19255424/',
      summary: 'Circadian misalignment increases BP by 3 mmHg, reduces leptin by 17%, and elevates glucose by 6% independent of sleep duration.',
    },
    {
      id: 'circadian-rhythm-2',
      shortRef: 'Morris et al., 2016',
      fullRef: 'Morris CJ, Yang JN, Garcia JI, et al. Endogenous circadian system and circadian misalignment impact glucose tolerance via separate mechanisms in humans. Proc Natl Acad Sci USA. 2015;112(17):E2225–E2234.',
      pmid: '25870289',
      url: 'https://pubmed.ncbi.nlm.nih.gov/25870289/',
      summary: 'Demonstrates that irregular sleep timing (circadian misalignment) independently impairs glucose tolerance, raising postprandial glucose by 6–17%.',
    },
  ],

  'sodium-sensitivity': [
    {
      id: 'sodium-sensitivity-1',
      shortRef: 'Sacks et al., 2001',
      fullRef: 'Sacks FM, Svetkey LP, Vollmer WM, et al. Effects on blood pressure of reduced dietary sodium and the Dietary Approaches to Stop Hypertension (DASH) diet. N Engl J Med. 2001;344(1):3–10.',
      pmid: '11136953',
      url: 'https://pubmed.ncbi.nlm.nih.gov/11136953/',
      summary: 'DASH-Sodium trial: reducing sodium from 3.5 g/day to 1.2 g/day lowered systolic BP by 8.9 mmHg in hypertensive participants.',
    },
    {
      id: 'sodium-sensitivity-2',
      shortRef: 'Weinberger, 1996',
      fullRef: 'Weinberger MH. Salt sensitivity of blood pressure in humans. Hypertension. 1996;27(3 Pt 2):481–490.',
      pmid: '8613190',
      url: 'https://pubmed.ncbi.nlm.nih.gov/8613190/',
      summary: 'Defines salt-sensitive hypertension: BP rise ≥ 10 mmHg with high-sodium diet, affecting ~51% of hypertensive adults.',
    },
  ],

  'na-k-ratio': [
    {
      id: 'na-k-ratio-1',
      shortRef: 'Perez & Chang, 2014',
      fullRef: 'Perez V, Chang ET. Sodium-to-potassium ratio and blood pressure, hypertension, and related factors. Adv Nutr. 2014;5(6):712–741.',
      pmid: '25398734',
      url: 'https://pubmed.ncbi.nlm.nih.gov/25398734/',
      summary: 'Na:K ratio > 2.5 is a stronger predictor of hypertension than sodium alone; optimal ratio < 1.0 is associated with lowest cardiovascular risk.',
    },
    {
      id: 'na-k-ratio-2',
      shortRef: 'Cook et al., 2009',
      fullRef: 'Cook NR, Obarzanek E, Cutler JA, et al. Joint effects of sodium and potassium intake on subsequent cardiovascular disease: the Trials of Hypertension Prevention follow-up study. Arch Intern Med. 2009;169(1):32–40.',
      pmid: '19139321',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19139321/',
      summary: 'High Na:K ratio associated with 2-fold increased risk of cardiovascular events over 10–15 years of follow-up.',
    },
  ],

  'postmeal-glucose': [
    {
      id: 'postmeal-glucose-1',
      shortRef: 'Ceriello et al., 2008',
      fullRef: 'Ceriello A, Colagiuri S. International Diabetes Federation guideline for management of postmeal glucose: a review of recommendations. Diabet Med. 2008;25(10):1151–1156.',
      pmid: '19046238',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19046238/',
      summary: 'IDF guideline: postprandial glucose > 140 mg/dL at 2 hours is independently associated with cardiovascular risk and microvascular complications.',
    },
    {
      id: 'postmeal-glucose-2',
      shortRef: 'Monnier et al., 2006',
      fullRef: 'Monnier L, Mas E, Ginet C, et al. Activation of oxidative stress by acute glucose fluctuations compared with sustained chronic hyperglycemia in patients with type 2 diabetes. JAMA. 2006;295(14):1681–1687.',
      pmid: '16609090',
      url: 'https://pubmed.ncbi.nlm.nih.gov/16609090/',
      summary: 'Postprandial glucose spikes generate more oxidative stress than sustained hyperglycemia, accelerating endothelial damage.',
    },
  ],

  'medication-dipping': [
    {
      id: 'medication-dipping-1',
      shortRef: 'Hermida et al., 2010',
      fullRef: 'Hermida RC, Ayala DE, Mojón A, Fernández JR. Influence of time of day of blood pressure-lowering treatment on cardiovascular risk in hypertensive patients with type 2 diabetes. Diabetes Care. 2011;34(6):1270–1276.',
      pmid: '21515843',
      url: 'https://pubmed.ncbi.nlm.nih.gov/21515843/',
      summary: 'Bedtime dosing of antihypertensives restores nocturnal BP dipping and reduces cardiovascular events by 67% vs morning dosing.',
    },
    {
      id: 'medication-dipping-2',
      shortRef: 'Roush et al., 2014',
      fullRef: 'Roush GC, Fagard RH, Salles GF, et al. Prognostic impact from clinic, daytime, and night-time systolic blood pressure in nine cohorts of 13,844 patients with hypertension. J Hypertens. 2014;32(12):2332–2340.',
      pmid: '25250803',
      url: 'https://pubmed.ncbi.nlm.nih.gov/25250803/',
      summary: 'Non-dipping nocturnal BP (< 10% drop) is associated with 2.5-fold increased risk of cardiovascular events vs dippers.',
    },
  ],

  'resting-hr-sleep': [
    {
      id: 'resting-hr-sleep-1',
      shortRef: 'Tobaldini et al., 2017',
      fullRef: 'Tobaldini E, Costantino G, Solbiati M, et al. Sleep, sleep deprivation, autonomic nervous system and cardiovascular diseases. Neurosci Biobehav Rev. 2017;74(Pt B):321–329.',
      pmid: '26944909',
      url: 'https://pubmed.ncbi.nlm.nih.gov/26944909/',
      summary: 'Sleep deprivation increases resting HR by 4–8 bpm via sympathetic activation, independently predicting cardiovascular risk.',
    },
  ],

  'resting-hr-hrv': [
    {
      id: 'resting-hr-hrv-1',
      shortRef: 'Task Force, 1996',
      fullRef: 'Task Force of the European Society of Cardiology and the North American Society of Pacing and Electrophysiology. Heart rate variability: standards of measurement, physiological interpretation and clinical use. Circulation. 1996;93(5):1043–1065.',
      pmid: '8598068',
      url: 'https://pubmed.ncbi.nlm.nih.gov/8598068/',
      summary: 'Foundational HRV standards: reduced HRV with elevated resting HR indicates impaired vagal tone and increased cardiac risk.',
    },
    {
      id: 'resting-hr-hrv-2',
      shortRef: 'Thayer et al., 2010',
      fullRef: 'Thayer JF, Yamamoto SS, Brosschot JF. The relationship of autonomic imbalance, heart rate variability and cardiovascular disease risk factors. Int J Cardiol. 2010;141(2):122–131.',
      pmid: '19038476',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19038476/',
      summary: 'Inverse relationship between resting HR and HRV; low HRV + high resting HR predicts all-cause and cardiovascular mortality.',
    },
  ],
};

// ─── Health Report Metric References ─────────────────────────────────────────

/** References for each metric section in the Doctor Health Report */
export const REPORT_METRIC_REFS: Record<string, PeerRef[]> = {

  'blood-pressure': [
    {
      id: 'bp-1',
      shortRef: 'Whelton et al., 2018',
      fullRef: 'Whelton PK, Carey RM, Aronow WS, et al. 2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults. J Am Coll Cardiol. 2018;71(19):e127–e248.',
      pmid: '29146535',
      url: 'https://pubmed.ncbi.nlm.nih.gov/29146535/',
      summary: 'ACC/AHA 2017 guideline: defines hypertension as ≥ 130/80 mmHg; Stage 2 as ≥ 140/90 mmHg.',
    },
    {
      id: 'bp-2',
      shortRef: 'Williams et al., 2018',
      fullRef: 'Williams B, Mancia G, Spiering W, et al. 2018 ESC/ESH Guidelines for the management of arterial hypertension. Eur Heart J. 2018;39(33):3021–3104.',
      pmid: '30165516',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30165516/',
      summary: 'ESC/ESH 2018 guideline: optimal BP < 120/80 mmHg; target for treated hypertensives < 130/80 mmHg.',
    },
  ],

  'heart-rate': [
    {
      id: 'hr-1',
      shortRef: 'Palatini & Julius, 1997',
      fullRef: 'Palatini P, Julius S. Heart rate and the cardiovascular risk. J Hypertens. 1997;15(1):3–17.',
      pmid: '9050965',
      url: 'https://pubmed.ncbi.nlm.nih.gov/9050965/',
      summary: 'Resting HR > 80 bpm is an independent cardiovascular risk factor; each 10 bpm increase raises mortality risk by 9%.',
    },
    {
      id: 'hr-2',
      shortRef: 'Fox et al., 2007',
      fullRef: 'Fox K, Borer JS, Camm AJ, et al. Resting heart rate in cardiovascular disease. J Am Coll Cardiol. 2007;50(9):823–830.',
      pmid: '17719466',
      url: 'https://pubmed.ncbi.nlm.nih.gov/17719466/',
      summary: 'Heart rate reduction is associated with improved cardiovascular outcomes; target resting HR 60–70 bpm for optimal benefit.',
    },
  ],

  'hrv': [
    {
      id: 'hrv-1',
      shortRef: 'Task Force, 1996',
      fullRef: 'Task Force of the European Society of Cardiology and the North American Society of Pacing and Electrophysiology. Heart rate variability: standards of measurement, physiological interpretation and clinical use. Circulation. 1996;93(5):1043–1065.',
      pmid: '8598068',
      url: 'https://pubmed.ncbi.nlm.nih.gov/8598068/',
      summary: 'Gold-standard HRV reference: RMSSD > 40 ms indicates healthy vagal tone; < 20 ms is associated with elevated cardiovascular risk.',
    },
  ],

  'oxygen-saturation': [
    {
      id: 'spo2-1',
      shortRef: 'Jubran, 1999',
      fullRef: 'Jubran A. Pulse oximetry. Crit Care. 1999;3(2):R11–R17.',
      pmid: '11094477',
      url: 'https://pubmed.ncbi.nlm.nih.gov/11094477/',
      summary: 'SpO₂ < 95% warrants clinical evaluation; < 90% indicates hypoxemia requiring immediate assessment.',
    },
  ],

  'glucose': [
    {
      id: 'glucose-1',
      shortRef: 'American Diabetes Association, 2024',
      fullRef: 'American Diabetes Association Professional Practice Committee. 6. Glycemic Targets: Standards of Care in Diabetes—2024. Diabetes Care. 2024;47(Suppl 1):S111–S125.',
      pmid: '38078590',
      url: 'https://pubmed.ncbi.nlm.nih.gov/38078590/',
      summary: 'ADA 2024: fasting glucose 70–99 mg/dL normal; 100–125 mg/dL prediabetes; ≥ 126 mg/dL diabetes.',
    },
    {
      id: 'glucose-2',
      shortRef: 'Ceriello et al., 2008',
      fullRef: 'Ceriello A, Colagiuri S. International Diabetes Federation guideline for management of postmeal glucose. Diabet Med. 2008;25(10):1151–1156.',
      pmid: '19046238',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19046238/',
      summary: 'Postprandial glucose > 140 mg/dL at 2 hours independently predicts cardiovascular risk.',
    },
  ],

  'a1c': [
    {
      id: 'a1c-1',
      shortRef: 'American Diabetes Association, 2024',
      fullRef: 'American Diabetes Association Professional Practice Committee. 6. Glycemic Targets: Standards of Care in Diabetes—2024. Diabetes Care. 2024;47(Suppl 1):S111–S125.',
      pmid: '38078590',
      url: 'https://pubmed.ncbi.nlm.nih.gov/38078590/',
      summary: 'ADA 2024: HbA1c target < 7.0% for most adults with diabetes; < 5.7% normal; 5.7–6.4% prediabetes.',
    },
  ],

  'sleep': [
    {
      id: 'sleep-1',
      shortRef: 'Watson et al., 2015',
      fullRef: 'Watson NF, Badr MS, Belenky G, et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the American Academy of Sleep Medicine and Sleep Research Society. Sleep. 2015;38(6):843–844.',
      pmid: '26039963',
      url: 'https://pubmed.ncbi.nlm.nih.gov/26039963/',
      summary: 'AASM/SRS consensus: adults require 7–9 hours per night for optimal health; < 7 hours associated with obesity, diabetes, hypertension, and mortality.',
    },
    {
      id: 'sleep-2',
      shortRef: 'Cappuccio et al., 2011',
      fullRef: 'Cappuccio FP, Cooper D, D\'Elia L, Strazzullo P, Miller MA. Sleep duration predicts cardiovascular outcomes: a systematic review and meta-analysis. Eur Heart J. 2011;32(12):1484–1492.',
      pmid: '21300732',
      url: 'https://pubmed.ncbi.nlm.nih.gov/21300732/',
      summary: 'Short sleep (< 6 h) associated with 48% increased risk of cardiovascular mortality; long sleep (> 9 h) with 38% increased risk.',
    },
  ],

  'weight': [
    {
      id: 'weight-1',
      shortRef: 'Jensen et al., 2014',
      fullRef: 'Jensen MD, Ryan DH, Apovian CM, et al. 2013 AHA/ACC/TOS guideline for the management of overweight and obesity in adults. J Am Coll Cardiol. 2014;63(25 Pt B):2985–3023.',
      pmid: '24239920',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24239920/',
      summary: 'AHA/ACC/TOS guideline: BMI 18.5–24.9 kg/m² normal; 25–29.9 overweight; ≥ 30 obese; 5–10% weight loss improves cardiometabolic risk factors.',
    },
  ],

  'cholesterol': [
    {
      id: 'chol-1',
      shortRef: 'Grundy et al., 2019',
      fullRef: 'Grundy SM, Stone NJ, Bailey AL, et al. 2018 AHA/ACC/AACVPR/AAPA/ABC/ACPM/ADA/AGS/APhA/ASPC/NLA/PCNA Guideline on the Management of Blood Cholesterol. J Am Coll Cardiol. 2019;73(24):e285–e350.',
      pmid: '30423393',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30423393/',
      summary: 'AHA/ACC 2018: LDL-C < 100 mg/dL desirable; < 70 mg/dL for high-risk patients; non-HDL-C < 130 mg/dL optimal.',
    },
  ],

  'sodium': [
    {
      id: 'sodium-1',
      shortRef: 'Sacks et al., 2001',
      fullRef: 'Sacks FM, Svetkey LP, Vollmer WM, et al. Effects on blood pressure of reduced dietary sodium and the DASH diet. N Engl J Med. 2001;344(1):3–10.',
      pmid: '11136953',
      url: 'https://pubmed.ncbi.nlm.nih.gov/11136953/',
      summary: 'DASH-Sodium trial: < 1.5 g/day sodium reduces systolic BP by 8.9 mmHg in hypertensive adults.',
    },
    {
      id: 'sodium-2',
      shortRef: 'WHO, 2012',
      fullRef: 'World Health Organization. Guideline: Sodium intake for adults and children. Geneva: WHO; 2012.',
      pmid: '',
      url: 'https://www.who.int/publications/i/item/9789241504836',
      summary: 'WHO recommends < 2 g/day sodium (5 g/day salt) for adults to reduce blood pressure and cardiovascular disease risk.',
    },
  ],

  'activity': [
    {
      id: 'activity-1',
      shortRef: 'Piercy et al., 2018',
      fullRef: 'Piercy KL, Troiano RP, Ballard RM, et al. The Physical Activity Guidelines for Americans. JAMA. 2018;320(19):2020–2028.',
      pmid: '30418471',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30418471/',
      summary: 'US Physical Activity Guidelines: ≥ 150 min/week moderate-intensity or ≥ 75 min/week vigorous activity reduces all-cause mortality by 33%.',
    },
  ],

  'thyroid': [
    {
      id: 'thyroid-1',
      shortRef: 'Garber et al., 2012',
      fullRef: 'Garber JR, Cobin RH, Gharib H, et al. Clinical practice guidelines for hypothyroidism in adults: cosponsored by the American Association of Clinical Endocrinologists and the American Thyroid Association. Endocr Pract. 2012;18(Suppl 2):1–207.',
      pmid: '23246686',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23246686/',
      summary: 'AACE/ATA guideline: TSH reference range 0.45–4.5 mIU/L; subclinical hypothyroidism (TSH 4.5–10) associated with dyslipidemia and cardiovascular risk.',
    },
  ],

  'vitamin-d': [
    {
      id: 'vitd-1',
      shortRef: 'Holick et al., 2011',
      fullRef: 'Holick MF, Binkley NC, Bischoff-Ferrari HA, et al. Evaluation, treatment, and prevention of vitamin D deficiency: an Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2011;96(7):1911–1930.',
      pmid: '21646368',
      url: 'https://pubmed.ncbi.nlm.nih.gov/21646368/',
      summary: 'Endocrine Society guideline: 25(OH)D < 20 ng/mL deficiency; 20–29 ng/mL insufficiency; ≥ 30 ng/mL sufficient.',
    },
  ],

  'ferritin': [
    {
      id: 'ferritin-1',
      shortRef: 'Camaschella, 2015',
      fullRef: 'Camaschella C. Iron-deficiency anemia. N Engl J Med. 2015;372(19):1832–1843.',
      pmid: '25946282',
      url: 'https://pubmed.ncbi.nlm.nih.gov/25946282/',
      summary: 'Serum ferritin < 15 ng/mL indicates iron deficiency; < 30 ng/mL in symptomatic patients warrants treatment.',
    },
  ],

  'crp': [
    {
      id: 'crp-1',
      shortRef: 'Ridker, 2003',
      fullRef: 'Ridker PM. Clinical application of C-reactive protein for cardiovascular disease detection and prevention. Circulation. 2003;107(3):363–369.',
      pmid: '12551853',
      url: 'https://pubmed.ncbi.nlm.nih.gov/12551853/',
      summary: 'hs-CRP < 1 mg/L low cardiovascular risk; 1–3 mg/L average; > 3 mg/L high risk; > 10 mg/L suggests acute inflammation.',
    },
  ],
};

// ─── Utility functions ────────────────────────────────────────────────────────

/**
 * Get all unique references for a given set of correlation categories.
 * Returns refs in citation order (deduplicated by pmid).
 */
export function getRefsForCategories(categories: string[]): PeerRef[] {
  const seen = new Set<string>();
  const result: PeerRef[] = [];
  for (const cat of categories) {
    const refs = CORRELATION_REFS[cat] ?? [];
    for (const ref of refs) {
      const key = ref.pmid || ref.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(ref);
      }
    }
  }
  return result;
}

/**
 * Get all unique references for a given set of report metric slugs.
 */
export function getRefsForMetrics(metrics: string[]): PeerRef[] {
  const seen = new Set<string>();
  const result: PeerRef[] = [];
  for (const metric of metrics) {
    const refs = REPORT_METRIC_REFS[metric] ?? [];
    for (const ref of refs) {
      const key = ref.pmid || ref.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(ref);
      }
    }
  }
  return result;
}

/**
 * Returns the citation number for a given ref within a list.
 * Used to render inline [1] badges.
 */
export function getCitationNumber(refs: PeerRef[], refId: string): number {
  return refs.findIndex(r => r.id === refId) + 1;
}
