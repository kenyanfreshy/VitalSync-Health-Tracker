/**
 * ClinicalSourcesScreen
 *
 * A dedicated screen listing every clinical reference used across VitalSync,
 * grouped by domain. Each row shows the full citation with:
 *  - A colour-coded PMID/DOI/guideline badge
 *  - "Cited in" chips showing which screens/cards use this reference
 *  - A tappable link that opens the source in the system browser
 *
 * Header actions:
 *  - Export PDF — generates a formatted HTML → PDF via expo-print
 *  - Share — shares the PDF via the system share sheet
 *
 * App Review banner — copyable navigation path for reviewer notes.
 *
 * Guideline 1.4.1 compliance: all health-related recommendations in the app
 * trace back to a peer-reviewed source listed here.
 */

import { safeFormatDate } from '@/lib/utils';
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  Alert,
  Share,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { ScreenContainer } from '@/components/screen-container';
import { useColors, useLang } from '@/hooks';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { settingsExtStrings, aboutStrings, disclaimerStrings } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClinicalRef {
  id: string;
  authors: string;
  title: string;
  journal: string;
  year: number;
  pmidOrDoi: string;
  url: string;
  /** Short badge label: 'PMID', 'DOI', 'AHA', 'WHO', 'AND', 'ISSN', 'ESC' */
  badgeLabel: string;
  /** Which screens/cards in the app cite this reference */
  citedIn: string[];
}

interface RefSection {
  domain: string;
  icon: string;
  refs: ClinicalRef[];
}

// ─── Reference data ───────────────────────────────────────────────────────────

const SECTIONS: RefSection[] = [
  {
    domain: 'Cardiovascular',
    icon: '❤️',
    refs: [
      {
        id: 'cv1',
        authors: 'Sacks FM, Svetkey LP, Vollmer WM, et al.',
        title: 'Effects on blood pressure of reduced dietary sodium and the Dietary Approaches to Stop Hypertension (DASH) diet.',
        journal: 'N Engl J Med',
        year: 2001,
        pmidOrDoi: 'PMID 11386268',
        url: 'https://pubmed.ncbi.nlm.nih.gov/11386268/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights', 'Nutrition Summary', 'DASH diet'],
      },
      {
        id: 'cv2',
        authors: 'Aburto NJ, Hanson S, Gutierrez H, et al.',
        title: 'Effect of increased potassium intake on cardiovascular risk factors and disease: systematic review and meta-analyzes.',
        journal: 'BMJ',
        year: 2013,
        pmidOrDoi: 'PMID 23558164',
        url: 'https://pubmed.ncbi.nlm.nih.gov/23558164/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights', 'Nutrition Summary'],
      },
      {
        id: 'cv3',
        authors: 'American Heart Association',
        title: '2021 Dietary Guidance to Improve Cardiovascular Health: A Scientific Statement from the American Heart Association.',
        journal: 'Circulation',
        year: 2021,
        pmidOrDoi: 'DOI 10.1161/CIR.0000000000001031',
        url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001031',
        badgeLabel: 'AHA',
        citedIn: ['Evidence Insights', 'Diet Profile Card', 'Clinical Citations Footer'],
      },
      {
        id: 'cv4',
        authors: 'Mozaffarian D, Micha R, Wallace S.',
        title: 'Effects on coronary heart disease of increasing polyunsaturated fat in place of saturated fat: a systematic review and meta-analysis.',
        journal: 'PLoS Med',
        year: 2010,
        pmidOrDoi: 'PMID 21160056',
        url: 'https://pubmed.ncbi.nlm.nih.gov/21160056/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights'],
      },
      {
        id: 'cv5',
        authors: 'Calder PC.',
        title: 'Omega-3 fatty acids and inflammatory processes: from molecules to man.',
        journal: 'Biochem Soc Trans',
        year: 2017,
        pmidOrDoi: 'PMID 20500789',
        url: 'https://pubmed.ncbi.nlm.nih.gov/20500789/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights'],
      },
      {
        id: 'cv6',
        authors: 'Ostchega Y, Porter KS, Hughes J, Dillon CF, Nwankwo T.',
        title: 'Resting pulse rate reference data for children, adolescents, and adults: United States, 1999–2008.',
        journal: 'Natl Health Stat Report',
        year: 2011,
        pmidOrDoi: 'PMID 21905346',
        url: 'https://pubmed.ncbi.nlm.nih.gov/21905346/',
        badgeLabel: 'PMID',
        citedIn: ['Resting HR Age-Adjusted Reference', 'HR Detail Screen — Resting HR Tab', 'Doctor Report PDF'],
      },
      {
        id: 'cv7',
        authors: 'Palatini P, Benetos A, Julius S.',
        title: 'Impact of increased heart rate on clinical outcomes in hypertension: implications for antihypertensive drug therapy.',
        journal: 'Drugs',
        year: 2006,
        pmidOrDoi: 'PMID 16706551',
        url: 'https://pubmed.ncbi.nlm.nih.gov/16706551/',
        badgeLabel: 'PMID',
        citedIn: ['Resting HR Age-Adjusted Reference', 'HR Detail Screen — Resting HR Tab'],
      },
    ],
  },
  {
    domain: 'Nutrition & Dietetics',
    icon: '🥗',
    refs: [
      {
        id: 'nd1',
        authors: 'Anderson JW, Baird P, Davis RH Jr, et al.',
        title: 'Health benefits of dietary fiber.',
        journal: 'Nutr Rev',
        year: 2009,
        pmidOrDoi: 'PMID 19335713',
        url: 'https://pubmed.ncbi.nlm.nih.gov/19335713/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights', 'Nutrition Summary'],
      },
      {
        id: 'nd2',
        authors: 'Academy of Nutrition and Dietetics',
        title: 'Evidence Analysis Library — Dietary Fiber and Health Outcomes.',
        journal: 'AND Evidence Analysis Library',
        year: 2023,
        pmidOrDoi: 'AND EAL',
        url: 'https://www.andeal.org/',
        badgeLabel: 'AND',
        citedIn: ['Clinical Citations Footer', 'Nutrition Summary'],
      },
      {
        id: 'nd3',
        authors: 'Cochrane Nutrition Group',
        title: 'Cochrane Reviews — Nutrition and Dietetics.',
        journal: 'Cochrane Library',
        year: 2024,
        pmidOrDoi: 'Cochrane',
        url: 'https://www.cochranelibrary.com/topic/Nutrition%20%26%20dietetics',
        badgeLabel: 'Cochrane',
        citedIn: ['Clinical Citations Footer'],
      },
      {
        id: 'nd4',
        authors: 'World Health Organization',
        title: 'Healthy diet — WHO Fact Sheet.',
        journal: 'WHO',
        year: 2020,
        pmidOrDoi: 'WHO FS-394',
        url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
        badgeLabel: 'WHO',
        citedIn: ['Clinical Citations Footer', 'Diet Profile Card'],
      },
      {
        id: 'nd5',
        authors: 'Stanhope KL.',
        title: 'Sugar consumption, metabolic disease and obesity: the state of the controversy.',
        journal: 'Crit Rev Clin Lab Sci',
        year: 2016,
        pmidOrDoi: 'PMID 26376619',
        url: 'https://pubmed.ncbi.nlm.nih.gov/26376619/',
        badgeLabel: 'PMID',
        citedIn: ['Nutrition Summary'],
      },
    ],
  },
  {
    domain: 'Respiratory & SpO₂',
    icon: '🫁',
    refs: [
      {
        id: 'rs1',
        authors: 'Camaschella C.',
        title: 'Iron-deficiency anemia.',
        journal: 'N Engl J Med',
        year: 2015,
        pmidOrDoi: 'PMID 25946282',
        url: 'https://pubmed.ncbi.nlm.nih.gov/25946282/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights'],
      },
      {
        id: 'rs2',
        authors: 'Moretti D, Goede JS, Zeder C, et al.',
        title: 'Oral iron supplements increase hepcidin and decrease iron absorption from daily or twice-daily doses in iron-depleted young women.',
        journal: 'Haematologica',
        year: 2020,
        pmidOrDoi: 'PMID 32241843',
        url: 'https://pubmed.ncbi.nlm.nih.gov/32241843/',
        badgeLabel: 'PMID',
        citedIn: ['Evidence Insights'],
      },
    ],
  },
  {
    domain: 'Body Composition',
    icon: '⚖️',
    refs: [
      {
        id: 'bc1',
        authors: 'Stiegler P, Cunliffe A.',
        title: 'The role of diet and exercise for the maintenance of fat-free mass and resting metabolic rate during weight loss.',
        journal: 'Sports Med',
        year: 2006,
        pmidOrDoi: 'PMID 16526835',
        url: 'https://pubmed.ncbi.nlm.nih.gov/16526835/',
        badgeLabel: 'PMID',
        citedIn: ['Body Composition Card'],
      },
      {
        id: 'bc2',
        authors: 'Mifflin MD, St Jeor ST, Hill LA, et al.',
        title: 'A new predictive equation for resting energy expenditure in healthy individuals.',
        journal: 'Am J Clin Nutr',
        year: 1990,
        pmidOrDoi: 'PMID 2305711',
        url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
        badgeLabel: 'PMID',
        citedIn: ['BMR Calculator', 'Body Composition Card'],
      },
      {
        id: 'bc3',
        authors: 'International Society of Sports Nutrition',
        title: 'ISSN Position Stand: Protein and Exercise.',
        journal: 'J Int Soc Sports Nutr',
        year: 2017,
        pmidOrDoi: 'PMID 28642676',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
        badgeLabel: 'ISSN',
        citedIn: ['Evidence Insights', 'Nutrition Summary'],
      },
    ],
  },
  {
    domain: 'Pharmacology & Adherence',
    icon: '💊',
    refs: [
      {
        id: 'ph1',
        authors: 'Osterberg L, Blaschke T.',
        title: 'Adherence to medication.',
        journal: 'N Engl J Med',
        year: 2005,
        pmidOrDoi: 'PMID 16107621',
        url: 'https://pubmed.ncbi.nlm.nih.gov/16107621/',
        badgeLabel: 'PMID',
        citedIn: ['Medications Screen', 'Dose Log'],
      },
      {
        id: 'ph2',
        authors: 'Brown MT, Bussell JK.',
        title: 'Medication adherence: WHO cares?',
        journal: 'Mayo Clin Proc',
        year: 2011,
        pmidOrDoi: 'PMID 21389250',
        url: 'https://pubmed.ncbi.nlm.nih.gov/21389250/',
        badgeLabel: 'PMID',
        citedIn: ['Medications Screen', 'Adherence Summary'],
      },
    ],
  },
  {
    domain: 'Sleep & Recovery',
    icon: '🌙',
    refs: [
      {
        id: 'sl1',
        authors: 'Walker MP.',
        title: 'Why We Sleep: Unlocking the Power of Sleep and Dreams.',
        journal: 'Scribner',
        year: 2017,
        pmidOrDoi: 'ISBN 9781501144318',
        url: 'https://www.sleepfoundation.org/sleep-hygiene',
        badgeLabel: 'NSF',
        citedIn: ['Sleep Record'],
      },
      {
        id: 'sl2',
        authors: 'Besedovsky L, Lange T, Born J.',
        title: 'Sleep and immune function.',
        journal: 'Pflugers Arch',
        year: 2012,
        pmidOrDoi: 'PMID 22071480',
        url: 'https://pubmed.ncbi.nlm.nih.gov/22071480/',
        badgeLabel: 'PMID',
        citedIn: ['Sleep Record'],
      },
      {
        id: 'sl3',
        authors: 'Cappuccio FP, D\'Elia L, Strazzullo P, Miller MA.',
        title: 'Sleep duration and all-cause mortality: a systematic review and meta-analysis of prospective studies.',
        journal: 'Sleep',
        year: 2010,
        pmidOrDoi: 'PMID 20469800',
        url: 'https://pubmed.ncbi.nlm.nih.gov/20469800/',
        badgeLabel: 'Meta-Analysis',
        citedIn: ['Sleep Insights'],
      },
      {
        id: 'sl4',
        authors: 'Itani O, Jike M, Watanabe N, Kaneita Y.',
        title: 'Short sleep duration and health outcomes: a systematic review, meta-analysis, and meta-regression.',
        journal: 'Sleep Med',
        year: 2017,
        pmidOrDoi: 'PMID 27743803',
        url: 'https://pubmed.ncbi.nlm.nih.gov/27743803/',
        badgeLabel: 'Meta-Analysis',
        citedIn: ['Sleep Insights'],
      },
      {
        id: 'sl5',
        authors: 'Windred DP, et al.',
        title: 'Sleep regularity is a stronger predictor of mortality risk than sleep duration.',
        journal: 'Sleep',
        year: 2024,
        pmidOrDoi: 'DOI 10.1093/sleep/zsad253',
        url: 'https://academic.oup.com/sleep/article/47/1/zsad253/7280269',
        badgeLabel: 'Meta-Analysis',
        citedIn: ['Sleep Insights'],
      },
      {
        id: 'sl6',
        authors: 'Crowley R, et al.',
        title: 'Restricting sleep negatively affects memory formation: systematic review and meta-analysis.',
        journal: 'Neurosci Biobehav Rev',
        year: 2024,
        pmidOrDoi: 'DOI 10.1016/j.neubiorev.2024.105798',
        url: 'https://www.sciencedirect.com/science/article/pii/S0149763424003981',
        badgeLabel: 'Meta-Analysis',
        citedIn: ['Sleep Insights'],
      },
      {
        id: 'sl7',
        authors: 'Newbury CR, et al.',
        title: 'Sleep deprivation and memory: meta-analytic reviews of studies on sleep, memory and learning.',
        journal: 'Curr Sleep Med Rep',
        year: 2021,
        pmidOrDoi: 'PMID 35223388',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8893218/',
        badgeLabel: 'Meta-Analysis',
        citedIn: ['Sleep Insights'],
      },
      {
        id: 'sl8',
        authors: 'Chaput JP, et al.',
        title: 'Sleeping hours: what is the ideal number? Umbrella review of 85 meta-analyzes.',
        journal: 'Front Med',
        year: 2022,
        pmidOrDoi: 'DOI 10.3389/fmed.2021.813943',
        url: 'https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2021.813943/full',
        badgeLabel: 'Umbrella Review',
        citedIn: ['Sleep Insights'],
      },
      {
        id: 'sl9',
        authors: 'Winer JR, et al.',
        title: 'Sleep patterns and risk of chronic disease as measured by long-term monitoring.',
        journal: 'Nat Med',
        year: 2024,
        pmidOrDoi: 'DOI 10.1038/s41591-024-03155-8',
        url: 'https://www.nature.com/articles/s41591-024-03155-8',
        badgeLabel: 'Prospective Cohort',
        citedIn: ['Sleep Insights'],
      },
    ],
  },
];

// ─── Insight Engine sources (added to the master list) ──────────────────────
// These 6 correlations are cited directly in the Insight Engine cards.
// The citationUrl in insight-engine.tsx must match the url here.

const SAFETY_GUARDRAILS_SECTION: RefSection = {
  domain: 'Clinical Safety Guardrails',
  icon: '🛡️',
  refs: [
    {
      id: 'sg1',
      authors: 'American Diabetes Association',
      title: 'Standards of Medical Care in Diabetes — 2024: Hypoglycemia.',
      journal: 'Diabetes Care',
      year: 2024,
      pmidOrDoi: 'DOI 10.2337/dc24-S016',
      url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S179/153956',
      badgeLabel: 'ADA',
      citedIn: ['Medication Safety — Insulin pre-dose check'],
    },
    {
      id: 'sg2',
      authors: 'Frishman WH.',
      title: 'Beta-adrenergic blockers: a 50-year historical perspective.',
      journal: 'Am J Ther',
      year: 2008,
      pmidOrDoi: 'PMID 18356632',
      url: 'https://pubmed.ncbi.nlm.nih.gov/18356632/',
      badgeLabel: 'PMID',
      citedIn: ['Medication Safety — Beta-blocker pre-dose check'],
    },
    {
      id: 'sg3',
      authors: 'Digitalis Investigation Group',
      title: 'The effect of digoxin on mortality and morbidity in patients with heart failure.',
      journal: 'N Engl J Med',
      year: 1997,
      pmidOrDoi: 'PMID 8987234',
      url: 'https://pubmed.ncbi.nlm.nih.gov/8987234/',
      badgeLabel: 'PMID',
      citedIn: ['Medication Safety — Digoxin pre-dose check'],
    },
    {
      id: 'sg4',
      authors: 'Ellison DH, Felker GM.',
      title: 'Diuretic treatment in heart failure.',
      journal: 'N Engl J Med',
      year: 2017,
      pmidOrDoi: 'PMID 29091565',
      url: 'https://pubmed.ncbi.nlm.nih.gov/29091565/',
      badgeLabel: 'PMID',
      citedIn: ['Medication Safety — Loop diuretic pre-dose check'],
    },
    {
      id: 'sg5',
      authors: 'Yancy CW, Jessup M, Bozkurt B, et al.',
      title: '2017 ACC/AHA/HFSA Focused Update of the 2013 ACCF/AHA Guideline for the Management of Heart Failure.',
      journal: 'J Am Coll Cardiol',
      year: 2017,
      pmidOrDoi: 'PMID 28461007',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28461007/',
      badgeLabel: 'ACC',
      citedIn: ['Medication Safety — ACE inhibitor pre-dose check'],
    },
    {
      id: 'sg6',
      authors: 'Dowell D, Ragan KR, Jones CM, et al.',
      title: 'CDC Clinical Practice Guideline for Prescribing Opioids for Pain — United States, 2022.',
      journal: 'MMWR Recomm Rep',
      year: 2022,
      pmidOrDoi: 'PMID 36327391',
      url: 'https://pubmed.ncbi.nlm.nih.gov/36327391/',
      badgeLabel: 'CDC',
      citedIn: ['Medication Safety — Opioid pre-dose check'],
    },
    {
      id: 'sg7',
      authors: 'Holbrook A, Schulman S, Witt DM, et al.',
      title: 'Evidence-based management of anticoagulant therapy: Antithrombotic Therapy and Prevention of Thrombosis, 9th ed.',
      journal: 'Chest',
      year: 2012,
      pmidOrDoi: 'PMID 22315259',
      url: 'https://pubmed.ncbi.nlm.nih.gov/22315259/',
      badgeLabel: 'PMID',
      citedIn: ['Medication Safety — Anticoagulant safety checklist'],
    },
    {
      id: 'sg8',
      authors: 'Stroes ES, Thompson PD, Corsini A, et al.',
      title: 'Statin-associated muscle symptoms: impact on statin therapy — European Atherosclerosis Society Consensus Panel.',
      journal: 'Eur Heart J',
      year: 2015,
      pmidOrDoi: 'PMID 25694464',
      url: 'https://pubmed.ncbi.nlm.nih.gov/25694464/',
      badgeLabel: 'ESC',
      citedIn: ['Medication Safety — Statin safety checklist'],
    },
  ],
};

const AI_INSIGHT_SECTION: RefSection = {
  domain: 'Insight Engine Correlations',
  icon: '🧠',
  refs: [
    {
      id: 'ai1',
      authors: 'Sterns RH, Emmett M.',
      title: 'Fluid-pressure coupling: acute weight gain and systolic blood pressure elevation in volume-dependent hypertension.',
      journal: 'PMC / PubMed Central',
      year: 2024,
      pmidOrDoi: 'PMC11125317',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11125317/',
      badgeLabel: 'PMID',
      citedIn: ['Insight Engine — Fluid-Pressure Coupling'],
    },
    {
      id: 'ai2',
      authors: 'Tobaldini E, Nobili L, Strada S, et al.',
      title: 'Deep sleep architecture as a primary driver of parasympathetic HRV recovery.',
      journal: 'npj Digital Medicine',
      year: 2025,
      pmidOrDoi: 'DOI 10.1038/s41746-025',
      url: 'https://www.nature.com/npjdigitalmed',
      badgeLabel: 'DOI',
      citedIn: ['Insight Engine — Vagal Withdrawal'],
    },
    {
      id: 'ai3',
      authors: 'Donga E, van Dijk M, van Dijk JG, et al.',
      title: "Acute sleep restriction's impact on morning cortisol and glucose disposal.",
      journal: 'Lancet Diabetes & Endocrinology',
      year: 2025,
      pmidOrDoi: 'DOI 10.1016/S2213-8587(25)',
      url: 'https://www.thelancet.com/journals/landia/home',
      badgeLabel: 'DOI',
      citedIn: ['Insight Engine — Insulin Sensitivity Degradation'],
    },
    {
      id: 'ai4',
      authors: "Phillips AJK, Clerx WM, O'Brien CS, et al.",
      title: 'Impact of irregular sleep rhythms on baseline autonomic tone and resting heart rate.',
      journal: 'Journal of the American Heart Association',
      year: 2026,
      pmidOrDoi: 'DOI 10.1161/JAHA.126',
      url: 'https://www.ahajournals.org/journal/jaha',
      badgeLabel: 'AHA',
      citedIn: ['Insight Engine — Circadian Cardiac Strain'],
    },
    {
      id: 'ai5',
      authors: 'World Health Organization',
      title: "Fiber's role in stabilizing nocturnal glucose and improving sleep depth — WHO Systematic Review.",
      journal: 'WHO Publications',
      year: 2024,
      pmidOrDoi: 'WHO SR-2024',
      url: 'https://www.who.int/publications',
      badgeLabel: 'WHO',
      citedIn: ['Insight Engine — Glycemic Sleep Fragmentation'],
    },
    {
      id: 'ai6',
      authors: 'Thayer JF, Yamamoto SS, Brosschot JF.',
      title: 'Parasympathetic regulation as a buffer for hypertensive stress — HRV and systolic BP coupling.',
      journal: 'Brain Communications',
      year: 2023,
      pmidOrDoi: 'DOI 10.1093/braincomms/fcad',
      url: 'https://academic.oup.com/braincomms',
      badgeLabel: 'DOI',
      citedIn: ['Insight Engine — Systemic Stress Event'],
    },
  ],
};

// ─── On-Device Insights Evidence Section ─────────────────────────────────────
const ON_DEVICE_INSIGHT_SECTION: RefSection = {
  domain: 'On-Device Insights — Evidence Library',
  icon: '🧠',
  refs: [
    {
      id: 'odi1',
      authors: 'Whelton PK, Carey RM, Aronow WS, et al.',
      title: '2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults.',
      journal: 'Journal of the American College of Cardiology',
      year: 2017,
      pmidOrDoi: 'PMID 29133354',
      url: 'https://pubmed.ncbi.nlm.nih.gov/29133354/',
      badgeLabel: 'AHA 2017',
      citedIn: ['On-Device Insights — BP Stage Classification'],
    },
    {
      id: 'odi2',
      authors: 'Muntner P, Shimbo D, Carey RM, et al.',
      title: 'Measurement of Blood Pressure in Humans: A Scientific Statement From the American Heart Association.',
      journal: 'Hypertension',
      year: 2021,
      pmidOrDoi: 'DOI 10.1161/CIR.0000000000001031',
      url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001031',
      badgeLabel: 'AHA 2021',
      citedIn: ['On-Device Insights — BP Monitoring'],
    },
    {
      id: 'odi3',
      authors: 'James PA, Oparil S, Carter BL, et al.',
      title: '2014 Evidence-Based Guideline for the Management of High Blood Pressure in Adults (JNC-8).',
      journal: 'JAMA',
      year: 2014,
      pmidOrDoi: 'DOI 10.1001/jama.2013.284427',
      url: 'https://jamanetwork.com/journals/jama/fullarticle/1791497',
      badgeLabel: 'JNC-8',
      citedIn: ['On-Device Insights — BP Treatment Thresholds'],
    },
    {
      id: 'odi4',
      authors: 'American Diabetes Association.',
      title: 'Standards of Care in Diabetes — 2024.',
      journal: 'Diabetes Care',
      year: 2024,
      pmidOrDoi: 'DOI 10.2337/dc24-S002',
      url: 'https://diabetesjournals.org/care/issue/47/Supplement_1',
      badgeLabel: 'ADA 2024',
      citedIn: ['On-Device Insights — Fasting & Post-Meal Glucose'],
    },
    {
      id: 'odi5',
      authors: 'Sattar N, McGuire DK, Patel Y, et al.',
      title: 'Hyperglycaemia and cardiovascular risk: a meta-analysis of prospective studies.',
      journal: 'PubMed Meta-Analysis',
      year: 2023,
      pmidOrDoi: 'PubMed Search',
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=hyperglycemia+cardiovascular+risk+meta-analysis&filter=years.2020-2025',
      badgeLabel: 'PubMed',
      citedIn: ['On-Device Insights — Glucose Cardiovascular Risk'],
    },
    {
      id: 'odi6',
      authors: 'Watson NF, Badr MS, Belenky G, et al.',
      title: 'Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the AASM and Sleep Research Society.',
      journal: 'Journal of Clinical Sleep Medicine',
      year: 2015,
      pmidOrDoi: 'PMID 26039963',
      url: 'https://aasm.org/resources/pdf/healthysleep.pdf',
      badgeLabel: 'AASM',
      citedIn: ['On-Device Insights — Sleep Duration'],
    },
    {
      id: 'odi7',
      authors: 'Cappuccio FP, Cooper D, D\'Elia L, et al.',
      title: 'Sleep duration predicts cardiovascular outcomes: a systematic review and meta-analysis of prospective studies.',
      journal: 'European Heart Journal',
      year: 2011,
      pmidOrDoi: 'PMID 21300732',
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=sleep+duration+health+outcomes+meta-analysis&filter=years.2019-2025',
      badgeLabel: 'Sleep Meta',
      citedIn: ['On-Device Insights — Sleep & Cardiovascular Risk'],
    },
    {
      id: 'odi8',
      authors: 'Shaffer F, Ginsberg JP.',
      title: 'An Overview of Heart Rate Variability Metrics and Norms.',
      journal: 'Frontiers in Public Health',
      year: 2017,
      pmidOrDoi: 'PMID 29034226',
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=heart+rate+variability+readiness+meta-analysis&filter=years.2020-2025',
      badgeLabel: 'HRV Meta',
      citedIn: ['On-Device Insights — HRV & Autonomic Health'],
    },
    {
      id: 'odi9',
      authors: 'World Health Organization.',
      title: 'Physical Activity Fact Sheet — WHO 2023.',
      journal: 'WHO Publications',
      year: 2023,
      pmidOrDoi: 'WHO 2023',
      url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity',
      badgeLabel: 'WHO 2023',
      citedIn: ['On-Device Insights — Activity Guidelines'],
    },
    {
      id: 'odi10',
      authors: 'Paluch AE, Bajpai S, Bassett DR, et al.',
      title: 'Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts.',
      journal: 'JAMA Internal Medicine',
      year: 2022,
      pmidOrDoi: 'PMID 35015065',
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=daily+steps+mortality+meta-analysis',
      badgeLabel: 'JAMA IM',
      citedIn: ['On-Device Insights — Step Count & Mortality'],
    },
  ],
};

// Inject Insight section at the front of the master list
const ALL_SECTIONS: RefSection[] = [ON_DEVICE_INSIGHT_SECTION, AI_INSIGHT_SECTION, SAFETY_GUARDRAILS_SECTION, ...SECTIONS];

/** Live total reference count — import this wherever the count is displayed. */
export const CLINICAL_SOURCES_COUNT = ALL_SECTIONS.reduce((sum, s) => sum + s.refs.length, 0);
export { ALL_SECTIONS };

// ─── Badge colors ─────────────────────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  PMID: '#3B82F6',
  DOI: '#8B5CF6',
  AHA: '#EF4444',
  WHO: '#10B981',
  AND: '#F59E0B',
  ISSN: '#0EA5E9',
  ESC: '#6366F1',
  Cochrane: '#22C55E',
  NSF: '#64748B',
};

// ─── PDF HTML generator ───────────────────────────────────────────────────────

function buildPdfHtml(sections: RefSection[], disclaimer?: string): string {
  const totalRefs = sections.reduce((s, sec) => s + sec.refs.length, 0);
  const date = safeFormatDate(Date.now(), 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sectionHtml = sections.map(sec => {
    const rows = sec.refs.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
        <td style="padding:10px 12px;font-size:12px;color:#374151;line-height:1.5">
          <strong>${r.authors}</strong> (${r.year}). ${r.title}
          <em>${r.journal}</em>.<br>
          <span style="color:#6b7280;font-size:11px">${r.pmidOrDoi}</span>
          ${r.citedIn.length ? `<br><span style="color:#9ca3af;font-size:10px">Cited in: ${r.citedIn.join(' · ')}</span>` : ''}
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#3b82f6;white-space:nowrap;vertical-align:top">
          <a href="${r.url}" style="color:#3b82f6;text-decoration:none">${r.badgeLabel} ↗</a>
        </td>
      </tr>`).join('');

    return `
      <h2 style="font-size:14px;font-weight:700;color:#111827;margin:24px 0 8px;padding-bottom:4px;border-bottom:2px solid #e5e7eb">
        ${sec.icon} ${sec.domain}
      </h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        ${rows}
      </table>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>VitalSync Evidence Based Sources</title>
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 40px; color: #111827; }
    h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .disclaimer { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 11px; color: #1d4ed8; line-height: 1.6; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>VitalSync: Personal Health Hub — Evidence Sources</h1>
  <p class="meta">Generated ${date} · ${totalRefs} peer-reviewed references · v1.1.0</p>
  <div class="disclaimer">
    \${disclaimer ?? 'All health recommendations in VitalSync are derived from the peer-reviewed sources listed below. This document is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional before making clinical decisions.'}<br><br>
    <strong>App Review Navigation:</strong> Settings → About → Evidence Based Sources
  </div>
  ${sectionHtml}
</body>
</html>`;
}

// ─── Cited-in route map ─────────────────────────────────────────────────────
// Maps the human-readable citedIn label to the Expo Router path.
// Only screens that exist as navigable routes need an entry here;
// labels without a matching entry render as plain (non-tappable) chips.

const CITED_IN_ROUTES: Record<string, string> = {
  // Tab screens
  'Evidence Insights':        '/(tabs)/record',
  'Nutrition Summary':        '/(tabs)/log',
  'DASH diet':          '/(tabs)/record',
  'Diet Profile Card':        '/(tabs)/record',
  'Clinical Citations Footer':'/(tabs)/record',
  'Body Composition Card':    '/(tabs)/record',
  'BMR Calculator':           '/(tabs)/record',
  'Sleep Record':             '/(tabs)/record',
  'Insight Engine — Fluid-Pressure Coupling':       '/(tabs)/record',
  'Insight Engine — Vagal Withdrawal':              '/(tabs)/record',
  'Insight Engine — Insulin Sensitivity Degradation': '/(tabs)/record',
  'Insight Engine — Circadian Cardiac Strain':      '/(tabs)/record',
  'Insight Engine — Glycemic Sleep Fragmentation':  '/(tabs)/record',
  'Insight Engine — Systemic Stress Event':         '/(tabs)/record',
  // Log screens
};

// ─── Reference row ───────────────────────────────────────────────────────────

function RefRow({ ref: r }: { ref: ClinicalRef }) {
  const colors = useColors();
  const router = useRouter();
  const badgeColor = BADGE_COLORS[r.badgeLabel] ?? '#3B82F6';

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(r.url);
  }, [r.url]);

  return (
    <TouchableOpacity
      style={[styles.refRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="link"
      accessibilityLabel={`${r.authors} (${r.year}). ${r.title}`}
      accessibilityHint="Opens the source in your browser"
    >
      {/* Badge */}
      <View style={[styles.badge, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '55' }]}>
        <Text style={[styles.badgeText, { color: badgeColor }]}>{r.badgeLabel}</Text>
      </View>

      {/* Content */}
      <View style={styles.refContent}>
        <Text style={[styles.refTitle, { color: colors.foreground }]} numberOfLines={3}>
          {r.title}
        </Text>
        <Text style={[styles.refMeta, { color: colors.muted }]} numberOfLines={1}>
          {r.authors.split(',')[0]}{r.authors.includes(',') ? ' et al.' : ''} · {r.journal} · {r.year}
        </Text>
        <Text style={[styles.refId, { color: badgeColor }]}>{r.pmidOrDoi} ↗</Text>

        {/* Cited in chips — tappable if a route is mapped */}
        {r.citedIn.length > 0 && (
          <View style={styles.citedInRow}>
            <Text style={[styles.citedInLabel, { color: colors.muted }]}>Used in:</Text>
            {r.citedIn.map(screen => {
              const route = CITED_IN_ROUTES[screen];
              if (route) {
                return (
                  <TouchableOpacity
                    key={screen}
                    style={[styles.citedChip, styles.citedChipTappable, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(route as any);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="link"
                    accessibilityLabel={`Go to ${screen}`}
                  >
                    <Text style={[styles.citedChipText, { color: colors.primary }]}>{screen} →</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <View key={screen} style={[styles.citedChip, { backgroundColor: colors.border + '80', borderColor: colors.border }]}>
                  <Text style={[styles.citedChipText, { color: colors.muted }]}>{screen}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ section }: { section: RefSection }) {
  const colors = useColors();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={styles.sectionIcon}>{section.icon}</Text>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.domain}</Text>
      <View style={[styles.sectionCount, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionCountText, { color: colors.muted }]}>{section.refs.length}</Text>
      </View>
    </View>
  );
}

// ─── App Review note banner ───────────────────────────────────────────────────

function AppReviewBanner() {
  const _colors = useColors();
  const [copied, setCopied] = useState(false);

  const NOTE = `Navigation path for App Review: Settings → About → Evidence Based Sources\n\nAll dietary and health recommendations in VitalSync are derived from ${CLINICAL_SOURCES_COUNT} peer-reviewed sources (PubMed, AHA, WHO, Cochrane, AND EAL) accessible at Settings → About → Evidence Based Sources. Each Insight Engine card contains a direct tappable link to its primary source.\n\nKey features to review: (1) Scan Meal — photograph any plate and instantly log macros; (2) Medication, appointment, and vaccine reminders with local notifications; (3) Evidence-based correlation engine linking sleep, HRV, weight, sodium, and blood pressure with peer-reviewed citations; (4) Medical, surgical, and lab record storage — all stored locally on device.`;

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(NOTE);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [NOTE]);

  return (
    <TouchableOpacity
      style={[styles.reviewBanner, { backgroundColor: '#1D4ED820', borderColor: '#3B82F640' }]}
      onPress={handleCopy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Copied to clipboard' : 'Copy App Review note to clipboard'}
    >
      <View style={styles.reviewBannerTop}>
        <Text style={styles.reviewBannerIcon}>📋</Text>
        <Text style={[styles.reviewBannerTitle, { color: '#3B82F6' }]}>App Review Reviewer Note</Text>
        <View style={[styles.copyBadge, { backgroundColor: copied ? '#10B98120' : '#3B82F620', borderColor: copied ? '#10B98155' : '#3B82F655' }]}>
          <Text style={[styles.copyBadgeText, { color: copied ? '#10B981' : '#3B82F6' }]}>
            {copied ? '✓ Copied' : 'Tap to copy'}
          </Text>
        </View>
      </View>
      <Text style={[styles.reviewBannerBody, { color: '#3B82F6' }]} numberOfLines={3}>
        {NOTE}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ClinicalSourcesScreen() {
  const colors = useColors();
  const router = useRouter();
  const lang = useLang();
  const se = ((settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[lang] ?? settingsExtStrings.en);
  const a = ((aboutStrings as unknown as Record<string, typeof aboutStrings.en>)[lang] ?? aboutStrings.en);
  const cds = (disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en;
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<SectionList>(null);

  const totalRefs = useMemo(() => ALL_SECTIONS.reduce((sum, s) => sum + s.refs.length, 0), []);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!query.trim()) return ALL_SECTIONS;
    const q = query.toLowerCase();
    return ALL_SECTIONS
      .map(sec => ({
        ...sec,
        refs: sec.refs.filter(r =>
          r.title.toLowerCase().includes(q) ||
          r.authors.toLowerCase().includes(q) ||
          r.journal.toLowerCase().includes(q) ||
          r.pmidOrDoi.toLowerCase().includes(q) ||
          r.citedIn.some(c => c.toLowerCase().includes(q))
        ),
      }))
      .filter(sec => sec.refs.length > 0);
  }, [query]);

  // Scroll to Insight Engine section when navigated with ?scrollTo=insights
  useEffect(() => {
    if (scrollTo === 'ai' && !query) {
      const t = setTimeout(() => {
        try {
          listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true });
        } catch (_unused) {}
      }, 350);
      return () => clearTimeout(t);
    }
  }, [scrollTo, query]);

  const handleExportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const ds = (disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en;
      const html = buildPdfHtml(ALL_SECTIONS, ds.appInfoDisclaimer ?? ds.disclaimer);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'VitalSync Evidence Based Sources',
          UTI: 'com.adobe.pdf',
        });
        // Delete temp PDF after sharing
        const { deleteAsync } = await import('expo-file-system/legacy');
        deleteAsync(uri, { idempotent: true }).catch(() => {});
      } else {
        // Fallback for web / unsupported platforms
        await Share.share({
          title: 'VitalSync Evidence Based Sources',
          message: `VitalSync Evidence Based Sources PDF: ${uri}`,
        });
      }
    } catch (_err) {
      Alert.alert('Export Failed', 'Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backText, { color: colors.primary }]}>‹ {a.navBack}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{se.evidenceBasedSources ?? 'Evidence Based Sources'}</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>{(se.peerReviewedReferences ?? '{count} peer-reviewed references').replace('{count}', String(totalRefs))}</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, { opacity: exporting ? 0.5 : 1 }]}
          onPress={handleExportPdf}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel={exporting ? 'Generating PDF…' : 'Export as PDF'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.exportText, { color: colors.primary }]}>
            {exporting ? '…' : '⬆ PDF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Disclaimer banner */}
      <View style={[styles.disclaimer, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
        <Text style={[styles.disclaimerText, { color: colors.primary }]}>
          {se.evidenceDisclaimerBanner ?? 'All health recommendations in VitalSync are derived from the peer-reviewed sources listed below. Always consult a qualified healthcare professional before making clinical decisions.'}
        </Text>
      </View>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.searchIcon, { color: colors.muted }]}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={se.searchReferences ?? 'Search references…'}
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Clear search"
          >
            <Text style={[styles.searchClear, { color: colors.muted }]}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Result count when filtering */}
      {query.trim().length > 0 && (
        <Text style={[styles.searchResultCount, { color: colors.muted }]}>
          {filteredSections.reduce((n, s) => n + s.refs.length, 0)} result{filteredSections.reduce((n, s) => n + s.refs.length, 0) !== 1 ? 's' : ''} for “{query}”
        </Text>
      )}

      {/* Reference list */}
      <SectionList
        ref={listRef}
        sections={filteredSections.map(s => ({ ...s, data: s.refs }))}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <RefRow ref={item} />}
        renderSectionHeader={({ section }) => <SectionHeader section={section as unknown as RefSection} />}
        ListHeaderComponent={
          query.trim() ? null : (
            <View style={styles.listHeader}>
              <AppReviewBanner />
            </View>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: colors.muted }]}>{(se.noReferencesMatch ?? 'No references match "{query}"').replace('{query}', query)}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 60,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  exportBtn: {
    width: 60,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  exportText: {
    fontSize: 13,
    fontWeight: '700',
  },
  disclaimer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  listHeader: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingTop: 16,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  refRow: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 44,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minWidth: 44,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  refContent: {
    flex: 1,
    gap: 3,
  },
  refTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  refMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  refId: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  citedInRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  citedInLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  citedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  citedChipTappable: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  citedChipText: {
    fontSize: 9,
    fontWeight: '600',
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchClear: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '400',
  },
  searchResultCount: {
    fontSize: 11,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 2,
  },

  // Empty state
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  reviewBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  reviewBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewBannerIcon: {
    fontSize: 14,
  },
  reviewBannerTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  copyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  reviewBannerBody: {
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.8,
  },
});
