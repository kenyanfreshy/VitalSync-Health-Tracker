/**
 * VitalSync Personal Health Report Generator
 * Generates a privacy-first PDF report for sharing with healthcare providers.
 * All data processing happens locally — no data leaves the device.
 */

import { safeFormatDate, safeFormatTime } from '@/lib/utils';
import { HealthData, getBPStatus, getBPStatusLabel, kgToLbs } from './types';
import { Medication, DoseLog, ROUTE_LABELS } from '@/lib/medications/types';
import { runCorrelationEngine } from './correlation-engine';
import { getAbnormalAnalytes } from './lab-types';
import { VITALSYNC_LOGO_B64 } from './report-logo';
import { aggregateHrTo4HourBuckets, aggregatedToPulseRecords } from './hr-aggregation';
import { CORRELATION_REFS, REPORT_METRIC_REFS, getRefsForCategories, getRefsForMetrics } from './peer-review-refs';
import { getRestingHRReferenceRange, type UserProfile } from '@/lib/user-profile';

export interface ReportConfig {
  patientName?: string;
  dateRange: { start: Date; end: Date };
  medications?: Medication[];
  includeBloodPressure: boolean;
  includePulse: boolean;
  includeBodyComposition: boolean;
  includeSleep: boolean;
  includeCorrelations: boolean;
  includeSodiumDASH?: boolean;
  includeTemperature?: boolean;
  /** 'C' or 'F' — controls unit display in the temperature section */
  tempUnit?: 'C' | 'F';
  /** 'kg' or 'lbs' — controls weight unit display in the body composition section */
  weightUnit?: 'kg' | 'lbs';
  /** 'mg/dL' or 'mmol/L' — controls blood glucose unit display */
  glucoseUnit?: 'mg/dL' | 'mmol/L';
  /** Include Projected A1C section (ADAG formula) */
  includeA1C?: boolean;
  /** Daily A1C snapshots for the 30-day trend chart (from AsyncStorage) */
  a1cSnapshots?: { date: string; a1c: number }[];
  /** Include Condition Timeline (medical + surgical history) */
  includeConditionTimeline?: boolean;
  /** Include Meal IQ insights summary */
  includeMealIQ?: boolean;
  /** Include Respiratory Rate section */
  includeRespiratoryRate?: boolean;
  /** Include SpO2 section */
  includeSpO2?: boolean;
  /** Include Medication Adherence section */
  includeMedications?: boolean;
  doctorName?: string;
  notes?: string;
  /** Clinician name to display in the PDF header (e.g. "Dr. Jane Smith") */
  clinicianName?: string;
  /** Clinician credentials to display below the name (e.g. "MSN, RN, CCRN-CMC") */
  clinicianCredentials?: string;
  /** Clinician role/title (e.g. "Critical Care Nurse") */
  clinicianRole?: string;
  /** Optional translated labels to override the default English strings in the PDF */
  labels?: Partial<ReportLabels>;
  /** Whether to include the NeoVital oscillating graph section in the report (default: true) */
  includeNeoVitalGraph?: boolean;
  /** Include EKG recordings section */
  includeEKG?: boolean;
  /** EKG records to include in the report */
  ekgRecords?: import('@/lib/health/ekg-store').EKGRecord[];
  /** Date range in days for the NeoVital graph (30 or 90 days, independent of main report range) */
  neoVitalRangeDays?: 30 | 90;
  /**
   * Pre-computed user profile for age/sex-adjusted resting HR reference.
   * Pass the result of loadUserProfile() before calling generateReportHTML.
   * If omitted the generic AHA adult range (60–100 bpm) is used as fallback.
   */
  userProfile?: UserProfile;
  /**
   * Which translation engine produced the labels for this report.
   * When set, a localized attribution line is appended to the PDF footer.
   * 'apple' = Apple on-device Translation (iOS 18+)
   * 'gemini' = Gemini API (Android/Web)
   * null / undefined = English or static language, no attribution shown
   */
  translationEngine?: 'apple' | 'gemini' | null;
}

/** All translatable labels used in the generated PDF HTML */
export interface ReportLabels {
  reportTitle: string;
  period: string;
  patient: string;
  forDoctor: string;
  generated: string;
  privacyBadge: string;
  bloodPressure: string;
  averageBp: string;
  minimum: string;
  maximum: string;
  date: string;
  systolic: string;
  diastolic: string;
  source: string;
  heartRateHrv: string;
  avgHeartRate: string;
  avgHrv: string;
  readings: string;
  bodyComposition: string;
  currentWeight: string;
  bmi: string;
  changeThisPeriod: string;
  sleep: string;
  avgDuration: string;
  avgEfficiency: string;
  tracked: string;
  patientNotes: string;
  footerText: string;
  footerDisclaimer: string;
  footerConsult: string;
  bodyTemperature: string;
  avgTemperature: string;
  minTemperature: string;
  maxTemperature: string;
  tempReadings: string;
  tempNormal: string;
  tempLow: string;
  tempFever: string;
  tempHighFever: string;

  // A1C section
  projectedA1C: string;
  a1cFormula: string;
  a1cAvgGlucose: string;
  a1cReadings: string;
  a1cWindow: string;
  a1cDisclaimer: string;
  a1cAvgGlucoseMmol: string;
  a1cRiskCategory: string;
  a1cTrend: string;
  a1cTrendImproving: string;
  a1cTrendRising: string;
  a1cTrendStable: string;
  a1cPostprandialSpike: string;
  a1cContextBreakdown: string;
  // Condition Timeline section
  conditionTimeline: string;
  medicalHistory: string;
  surgicalHistory: string;
  conditionStatus: string;
  conditionDiagnosed: string;
  procedureDate: string;
  procedureSurgeon: string;
  // Meal IQ section
  mealIQInsights: string;
  mealIQDisclaimer: string;
  mealIQNoData: string;
  // Empty state
  noDataForPeriod: string;
  noDataForPeriodSub: string;
  // Medication Adherence section
  medicationAdherence: string;
  medicationAdherenceDisclaimer: string;
  medName: string;
  medDose: string;
  medRoute: string;
  medIndication: string;
  medAdherence: string;
  medMissed: string;
  medLastTaken: string;
  medStatus: string;
  medActive: string;
  medInactive: string;
  /** Generic 'Status' column header (e.g. temperature table) */
  status: string;
  /** Shown in PDF header when no doctor name is provided */
  noPhysicianOnFile: string;
  // Report Summary card
  reportSummaryTitle: string;
  reportSummarySections: string;
  reportSummaryTotalReadings: string;
  // Statistical Descriptors table
  statDescriptorsTitle: string;
  statMeanSystolic: string;
  statMeanDiastolic: string;
  statHeartRateRange: string;
  statSleepDuration: string;
  statMetric: string;
  statMean: string;
  statRange: string;
  statSd: string;
  statSdFootnote: string;
  // NeoVital Monitor section
  neoVitalMonitorTitle: string;
  neoVitalAxisNote: string;
  // HRV subsections
  hrvTrendTitle: string;
  hrvTimeInOptimalTitle: string;
  hrvMostly: string;
  hrvExcellent: string;
  hrvGood: string;
  hrvFair: string;
  hrvLow: string;
  // SpO2 section
  oxygenSaturationTitle: string;
  latestSpO2: string;
  averageSpO2: string;
  minimumSpO2: string;
  spo2NormalRange: string;
  spo2StatusOptimal: string;
  spo2StatusNormal: string;
  spo2StatusLow: string;
  spo2StatusCritical: string;
  // Sleep detail table
  sleepDetailTitle: string;
  sleepColBedtime: string;
  sleepColWake: string;
  sleepColHours: string;
  sleepColEff: string;
  sleepColDeep: string;
  sleepColRem: string;
  sleepColLight: string;
  sleepColAwake: string;
  sleepGoalLabel: string;
  sleepHistoryTitle: string;
  sleepShowingMostRecent: string;
  // Blood glucose / A1C
  glucoseTimeInRange: string;
  glucoseGoal70: string;
  glucoseAbove: string;
  glucoseBelow: string;
  glucoseInRange: string;
  glucoseHighLabel: string;
  glucoseLowLabel: string;
  glucoseInRangeLabel: string;
  glucoseZoneReference: string;
  glucoseTargetLabel: string;
  glucoseOtherLabel: string;
  glucoseAdaNote: string;
  glucoseBelowPreDiabetes: string;
  glucoseElevatedLifestyle: string;
  glucoseMeetsDiabetes: string;
  glucoseWellAboveTarget: string;
  glucosePreDiabetes: string;
  glucoseDiabetesRange: string;
  glucoseSignificantlyElevated: string;
  glucoseSpikeCount: string;
  glucoseSpikePeak: string;
  glucoseSpikeRecommendation: string;
  glucoseSpikeReference: string;
  // Resting HR section
  restingHeartRate: string;
  restingHRAgeAdjusted: string;
  restingHRAthleticLabel: string;
  restingHRLatestReading: string;
  restingHRSource: string;
  sevenDayAvg: string;
  // Date range labels
  today: string;
  last7Days: string;
  last30Days: string;
  last90Days: string;
  // Dietary sodium section
  dietarySodiumTitle: string;
  avgSodium: string;
  avgPotassium: string;
  sodiumAboveFDA: string;
  sodiumAboveAHA: string;
  sodiumWithinAHA: string;
  potassiumMeetsWHO: string;
  potassiumBelowWHO: string;
  intersaltIndex: string;
  nakCardioprotective: string;
  nakBorderline: string;
  nakElevatedRisk: string;
  sodiumSensitivityDetected: string;
  personalSuggestion: string;
  evidenceLevel: string;
  basedOnDataPoints: string;
  nakRatioAnalysis: string;
  sodiumMg: string;
  potassiumMg: string;
  mealContext: string;
  foodDescription: string;
  // Medication extra
  medReinstated: string;
  medNoChange: string;
  medMissedSkippedSummary: string;
  // Temperature range
  tempNormalRange: string;
  // Medication summary stats
  medOverallAdherence: string;
  medTaken: string;
  medSkipped: string;
  medTotalDoses: string;
  medTopMissedTitle: string;
  medMissedLabel: string;
  medReasonCol: string;
  medCountCol: string;
  medPctMissed: string;
  medFrequencyCol: string;
  medVsPrior30d: string;
  medFullDoseLogTitle: string;
  medEntriesLabel: string;
  medTimeCol: string;
  medNoteReason: string;
  medRescheduleHistoryTitle: string;
  medRescheduledAt: string;
  medOriginalTime: string;
  medNewTime: string;
  medUserReschedule: string;
  medSnoozeReason: string;
  bpSourceAveraged: string;
  bpSourceAppleHealth: string;
  // Chart footnotes (use {n} and {total} as placeholders)
  chartShowsLastDaysTable: string;
  chartShowsLastDaysStats: string;
  chartShowsLastDaysStatsOnly: string;
  showingMostRecentReadings: string;
  showingMostRecentEntries: string;
  patientGeneratedDisclaimer: string;
  /** Attribution line shown in PDF footer when a translation engine was used */
  translatedByApple: string;
  translatedByGemini: string;
  // Condition Timeline column headers
  conditionColCondition: string;
  conditionColIcd10: string;
  conditionColProcedure: string;
  conditionColCpt: string;
  conditionStatusActiveLabel: string;
  linkedLabResults: string;
  labColPanel: string;
  labColLab: string;
  labColAbnormal: string;
  labAllNormal: string;
  vaccineOverdue: string;
  // Immunization section
  immunizationRecordsTitle: string;
  vaccineColVaccine: string;
  vaccineColDateGiven: string;
  vaccineColDose: string;
  vaccineColLotNum: string;
  vaccineColManufacturer: string;
  vaccineColAdministeredBy: string;
  vaccineColNextDue: string;
  vaccineColReactions: string;
  // HRV / HR chart labels
  hrChartTitle: string;
  hrvChartTitle: string;
  hrvSevenDayAvgLabel: string;
  hrv35msThreshold: string;
  hrv40msTarget: string;
  // Glucose sparkline
  glucoseReadingsLink: string;
  // Prepared by placeholder
  preparedByPlaceholder: string;
  // EKG section
  ekgSectionTitle: string;
  ekgTotalRecordings: string;
  ekgSinusRhythm: string;
  ekgAtrialFibrillation: string;
  ekgInconclusive: string;
  ekgUnclassified: string;
  ekgLastAfibDate: string;
  ekgNoAfibRecorded: string;
  ekgAvgHR: string;
  ekgDisclaimer: string;
  ekgClassificationCol: string;
  ekgCountCol: string;
  ekgPctCol: string;
  ekgRecentRecordingsTitle: string;
  ekgDateCol: string;
  ekgHRCol: string;
}

export const DEFAULT_REPORT_LABELS: ReportLabels = {
  reportTitle: 'Health Report',
  period: 'Period',
  patient: 'Patient',
  forDoctor: 'For',
  generated: 'Generated',
  privacyBadge: 'Privacy: All data processed locally — never uploaded',
  bloodPressure: 'Blood Pressure',
  averageBp: 'Average BP',
  minimum: 'Min',
  maximum: 'Max',
  date: 'Date',
  systolic: 'Systolic',
  diastolic: 'Diastolic',
  source: 'Source',
  heartRateHrv: 'Heart Rate & HRV',
  avgHeartRate: 'Avg Heart Rate',
  avgHrv: 'Avg HRV',
  readings: 'Readings',
  bodyComposition: 'Body Composition',
  currentWeight: 'Current Weight',
  bmi: 'BMI',
  changeThisPeriod: 'Change This Period',
  sleep: 'Sleep',
  avgDuration: 'Avg Duration',
  avgEfficiency: 'Avg Efficiency',
  tracked: 'Tracked',
  patientNotes: 'Patient Notes',
  footerText: 'VitalSync Personal Health Hub',
  footerDisclaimer: 'This report is generated from patient-entered and device-synced data.',
  footerConsult: 'Consult a qualified healthcare professional before making any medical decisions.',
  bodyTemperature: 'Body Temperature',
  avgTemperature: 'Avg Temperature',
  minTemperature: 'Min',
  maxTemperature: 'Max',
  tempReadings: 'Readings',
  tempNormal: 'Normal',
  tempLow: 'Low',
  tempFever: 'Fever',
  tempHighFever: 'High Fever',
  projectedA1C: 'Projected A1C',
  a1cFormula: 'ADAG Formula',
  a1cAvgGlucose: 'Avg Glucose',
  a1cReadings: 'Readings',
  a1cWindow: 'Window',
  a1cDisclaimer: 'Estimated A1C based on average glucose (ADAG formula). Not a substitute for lab HbA1c.',
  a1cAvgGlucoseMmol: 'Avg Glucose (mmol/L)',
  a1cRiskCategory: 'Risk Category',
  a1cTrend: 'Trend',
  a1cTrendImproving: 'Improving',
  a1cTrendRising: 'Rising',
  a1cTrendStable: 'Stable',
  a1cPostprandialSpike: 'Postprandial Spike',
  a1cContextBreakdown: 'Context Breakdown',
  conditionTimeline: 'Condition Timeline',
  medicalHistory: 'Medical History',
  surgicalHistory: 'Surgical History',
  conditionStatus: 'Status',
  conditionDiagnosed: 'Diagnosed',
  procedureDate: 'Date',
  procedureSurgeon: 'Surgeon',
  mealIQInsights: 'Meal IQ Insights',
  mealIQDisclaimer: 'Smart nutritional analysis. Not a substitute for professional dietary advice.',
  mealIQNoData: 'No Meal IQ analyzes recorded for this period.',
  noDataForPeriod: 'No data for this period',
  noDataForPeriodSub: 'No health records were found for the selected date range.',
  medicationAdherence: 'Medication Adherence',
  medicationAdherenceDisclaimer: 'Adherence calculated over the last 30 days. Follow your physician and pharmacist instructions.',
  medName: 'Medication',
  medDose: 'Dose',
  medRoute: 'Route',
  medIndication: 'Indication',
  medAdherence: 'Adherence (30d)',
  medMissed: 'Missed',
  medLastTaken: 'Last Taken',
  medStatus: 'Status',
  medActive: 'Active',
  medInactive: 'Inactive',
  status: 'Status',
  noPhysicianOnFile: 'No physician on file',
  // Report Summary card
  reportSummaryTitle: 'Report Summary',
  reportSummarySections: 'section',
  reportSummaryTotalReadings: 'total readings',
  // Statistical Descriptors table
  statDescriptorsTitle: 'STATISTICAL DESCRIPTORS — PATIENT-GENERATED DATA',
  statMeanSystolic: 'Mean Systolic',
  statMeanDiastolic: 'Mean Diastolic',
  statHeartRateRange: 'Heart Rate Range',
  statSleepDuration: 'Sleep Duration',
  statMetric: 'Metric',
  statMean: 'Mean',
  statRange: 'Range',
  statSd: 'SD',
  statSdFootnote: 'SD = Standard Deviation. All values are patient-reported or device-captured. Not validated clinical measurements.',
  // NeoVital Monitor section
  neoVitalMonitorTitle: 'NeoVital Monitor — Oscillating Vital Signs',
  neoVitalAxisNote: 'Each line independently normalized to its own scale. Left axis: HR/BP/SpO₂ reference (0–200). Right axis: BG (mg/dL) · Wgt',
  // HRV subsections
  hrvTrendTitle: 'HRV TREND',
  hrvTimeInOptimalTitle: 'HRV Time in Optimal Zone',
  hrvMostly: 'Mostly',
  hrvExcellent: 'Excellent',
  hrvGood: 'Good',
  hrvFair: 'Fair',
  hrvLow: 'Low',
  // SpO2 section
  oxygenSaturationTitle: 'Oxygen Saturation (SpO2)',
  latestSpO2: 'Latest SpO2',
  averageSpO2: 'Average SpO2',
  minimumSpO2: 'Minimum SpO2',
  spo2NormalRange: 'Normal range: ≥95% · Optimal: ≥97% · Low: 90–94% (requires clinical evaluation) · Critical: <90%',
  spo2StatusOptimal: 'Optimal',
  spo2StatusNormal: 'Normal',
  spo2StatusLow: 'Low',
  spo2StatusCritical: 'Critical',
  // Sleep detail table
  sleepDetailTitle: '7-NIGHT SLEEP DETAIL',
  sleepColBedtime: 'Bedtime',
  sleepColWake: 'Wake',
  sleepColHours: 'Hours',
  sleepColEff: 'Eff %',
  sleepColDeep: 'Deep',
  sleepColRem: 'REM',
  sleepColLight: 'Light',
  sleepColAwake: 'Awake',
  sleepGoalLabel: 'Goal',
  sleepHistoryTitle: 'Night Sleep History · Goal',
  sleepShowingMostRecent: 'Showing most recent 7 of',
  // Blood glucose / A1C
  glucoseTimeInRange: 'TIME IN RANGE',
  glucoseGoal70: '✓ Goal 70%',
  glucoseAbove: 'above',
  glucoseBelow: 'below',
  glucoseInRange: 'in range',
  glucoseHighLabel: 'High (≥180 mg/dL)',
  glucoseLowLabel: 'Low (<70 mg/dL)',
  glucoseInRangeLabel: 'In range',
  glucoseZoneReference: 'GLUCOSE ZONE REFERENCE',
  glucoseTargetLabel: 'Target 70–130 mg/dL (3.9–7.2 mmol/L)',
  glucoseOtherLabel: 'Other outside target range',
  glucoseAdaNote: 'ADA Standards of Care 2024 §6.6 — Pre-meal target 80–130 mg/dL; 2h post-meal <180 mg/dL',
  glucoseBelowPreDiabetes: 'Below pre-diabetes threshold — maintain healthy habits (ADA Standards of Care 2024, Table 2.2)',
  glucoseElevatedLifestyle: 'Elevated — lifestyle changes recommended: diet, exercise (ADA §2.3; AHA 2023)',
  glucoseMeetsDiabetes: 'Meets diabetes threshold — speak with a healthcare provider (ADA §2.4)',
  glucoseWellAboveTarget: 'Well above target — urgent personal review recommended (ADA §6.6)',
  glucosePreDiabetes: 'Pre-Diabetes',
  glucoseDiabetesRange: 'Diabetes Range',
  glucoseSignificantlyElevated: 'Significantly Elevated',
  glucoseSpikeCount: '{n} post-meal reading(s) exceeded 20% above average glucose during this period.',
  glucoseSpikePeak: 'Peak reading: <strong>{mgdl} mg/dL</strong> ({mmol} mmol/L).',
  glucoseSpikeRecommendation: 'DASH/ADA recommendation: replace refined carbohydrates with high-fiber whole grains, legumes, and non-starchy vegetables to blunt post-meal glucose peaks.',
  glucoseSpikeReference: 'ADA Standards of Care 2024 §5.2; Sacks FM et al. NEJM 2001',
  // Resting HR section
  restingHeartRate: 'Resting Heart Rate',
  restingHRAgeAdjusted: 'Age-Adjusted Reference',
  restingHRAthleticLabel: 'Athletic',
  restingHRLatestReading: 'Your latest reading of <strong>{bpm} bpm</strong> is in the <strong style="color:{color}">{status}</strong> range for your age group.',
  restingHRSource: 'Source: NHANES normative data (Ostchega et al., 2011) · AHA/ACC 2015 Scientific Statement on Resting Heart Rate',
  sevenDayAvg: '7-Day Avg',
  // Date range labels
  today: 'Today',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  last90Days: 'Last 90 days',
  // Dietary sodium section
  dietarySodiumTitle: 'Dietary Sodium & Potassium (Compile Diet Analysis)',
  avgSodium: 'Avg Sodium',
  avgPotassium: 'Avg Potassium',
  sodiumAboveFDA: 'Above FDA Limit',
  sodiumAboveAHA: 'Above AHA Target',
  sodiumWithinAHA: 'Within AHA Target',
  potassiumMeetsWHO: 'Meets WHO Target',
  potassiumBelowWHO: 'Below WHO Target',
  intersaltIndex: 'INTERSALT Index',
  nakCardioprotective: 'Cardioprotective',
  nakBorderline: 'Borderline',
  nakElevatedRisk: 'Elevated Risk',
  sodiumSensitivityDetected: 'SODIUM SENSITIVITY PATTERN DETECTED',
  personalSuggestion: 'PERSONAL SUGGESTION',
  evidenceLevel: 'Evidence Level',
  basedOnDataPoints: 'Based on {n} data points · Not medical advice',
  nakRatioAnalysis: 'Na:K RATIO ANALYSIS (INTERSALT MODEL)',
  sodiumMg: 'Sodium (mg)',
  potassiumMg: 'Potassium (mg)',
  mealContext: 'Meal Context',
  foodDescription: 'Food Description',
  // Medication extra
  medReinstated: 'Reinstated',
  medNoChange: 'No change',
  medMissedSkippedSummary: 'Based on {n} missed/skipped doses in the last 30 days. ↑ = more frequent than prior period, ↓ = less frequent, → = unchanged.',
  // Temperature range
  tempNormalRange: 'Normal range: {range} · Fever: {fever} · High Fever: {highFever}',
  // Medication summary stats
  medOverallAdherence: 'Overall Adherence',
  medTaken: 'Taken',
  medSkipped: 'Skipped',
  medTotalDoses: 'Total Doses',
  medTopMissedTitle: 'Top Missed/Skipped Reasons — Last 30 Days',
  medMissedLabel: 'Missed',
  medReasonCol: 'Reason',
  medCountCol: 'Count',
  medPctMissed: '% of Missed',
  medFrequencyCol: 'Frequency',
  medVsPrior30d: 'vs Prior 30d',
  medFullDoseLogTitle: 'Full Dose Log — Last 30 Days',
  medEntriesLabel: 'entries',
  medTimeCol: 'Time',
  medNoteReason: 'Note / Reason',
  medRescheduleHistoryTitle: 'Reschedule History',
  medRescheduledAt: 'Rescheduled At',
  medOriginalTime: 'Original Time',
  medNewTime: 'New Time',
  medUserReschedule: 'user reschedule',
  medSnoozeReason: 'Snooze',
  bpSourceAveraged: 'averaged',
  bpSourceAppleHealth: 'Apple Health',
  // Chart footnotes
  chartShowsLastDaysTable: 'Chart shows last {n} days · Table shows full report period',
  chartShowsLastDaysStats: 'Charts show last {n} days · Stats reflect full report period',
  chartShowsLastDaysStatsOnly: 'Chart shows last {n} days · Stats reflect full report period',
  showingMostRecentReadings: 'Showing most recent {n} of {total} readings.',
  showingMostRecentEntries: 'Showing most recent {n} of {total} entries.',
  patientGeneratedDisclaimer: '⚕ Patient-Generated Health Data: For Clinical Review Only. Not a Diagnostic Summary.',
  translatedByApple: 'Translated by Apple',
  translatedByGemini: 'Translated by Gemini',
  // Condition Timeline column headers
  conditionColCondition: 'Condition',
  conditionColIcd10: 'ICD-10',
  conditionColProcedure: 'Procedure',
  conditionColCpt: 'CPT',
  conditionStatusActiveLabel: 'ACTIVE',
  linkedLabResults: 'Linked Lab Results',
  labColPanel: 'Panel',
  labColLab: 'Lab',
  labColAbnormal: 'Abnormal Values',
  labAllNormal: 'All normal',
  vaccineOverdue: '⚠ Overdue',
  // Immunization section
  immunizationRecordsTitle: 'Immunization Records',
  vaccineColVaccine: 'Vaccine',
  vaccineColDateGiven: 'Date Given',
  vaccineColDose: 'Dose',
  vaccineColLotNum: 'Lot #',
  vaccineColManufacturer: 'Manufacturer',
  vaccineColAdministeredBy: 'Administered By',
  vaccineColNextDue: 'Next Due',
  vaccineColReactions: 'Reactions',
  // HRV / HR chart labels
  hrChartTitle: 'Heart Rate',
  hrvChartTitle: 'HRV',
  hrvSevenDayAvgLabel: '7-day avg',
  hrv35msThreshold: '35 ms threshold',
  hrv40msTarget: 'Target (40 ms)',
  // Glucose sparkline
  glucoseReadingsLink: 'readings',
  // Prepared by placeholder
  preparedByPlaceholder: 'e.g. Dr. Jane Smith, MD',
  // EKG section
  ekgSectionTitle: 'Electrocardiogram (EKG) Recordings',
  ekgTotalRecordings: 'Total Recordings',
  ekgSinusRhythm: 'Sinus Rhythm',
  ekgAtrialFibrillation: 'Atrial Fibrillation',
  ekgInconclusive: 'Inconclusive',
  ekgUnclassified: 'Unclassified',
  ekgLastAfibDate: 'Last AFib',
  ekgNoAfibRecorded: 'No AFib recorded',
  ekgAvgHR: 'bpm',
  ekgDisclaimer: 'VitalSync displays recordings from Apple Health but does not analyze them or check for signs of a heart attack. This is not a diagnostic tool.',
  ekgClassificationCol: 'Classification',
  ekgCountCol: 'Count',
  ekgPctCol: '%',
  ekgRecentRecordingsTitle: 'Recent Recordings',
  ekgDateCol: 'Date / Time',
  ekgHRCol: 'Avg HR',
};

// ─── SVG Chart Helpers ────────────────────────────────────────────────────────
// All charts are pure inline SVG — no external dependencies, renders in WebView.

const CHART_W = 680;
const CHART_H = 120;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

function scaleX(i: number, n: number): number {
  return PAD.left + (n <= 1 ? INNER_W / 2 : (i / (n - 1)) * INNER_W);
}
function scaleY(v: number, min: number, max: number): number {
  const range = max - min || 1;
  return PAD.top + INNER_H - ((v - min) / range) * INNER_H;
}
function polyline(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}
function area(pts: [number, number][], baseline: number): string {
  if (pts.length === 0) return '';
  const top = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const bl = `${pts[pts.length - 1][0].toFixed(1)},${baseline.toFixed(1)} ${pts[0][0].toFixed(1)},${baseline.toFixed(1)}`;
  return `${top} ${bl}`;
}
function xAxisLabels(dates: string[], n: number): string {
  // Show at most 6 evenly-spaced labels
  const step = Math.max(1, Math.floor(n / 6));
  return dates
    .map((d, i) => {
      if (i % step !== 0 && i !== n - 1) return '';
      const label = safeFormatDate(d, 'en-US', { month: 'short', day: 'numeric' });
      const x = scaleX(i, n);
      return `<text x="${x.toFixed(1)}" y="${(CHART_H - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#94A3B8">${label}</text>`;
    })
    .join('');
}
function yAxisLabels(min: number, max: number, steps = 4): string {
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = min + ((max - min) * i) / steps;
    const y = scaleY(v, min, max);
    out.push(`<text x="${(PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#94A3B8">${Math.round(v)}</text>`);
    out.push(`<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.5"/>`);
  }
  return out.join('');
}

/** Dual-line chart for blood pressure — matches dashboard BP tile (dark bg, smooth area, systolic green + diastolic blue dashed) */
function bpSparkline(records: { systolic: number; diastolic: number; timestamp: string }[]): string {
  if (records.length < 2) return '';
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sys = sorted.map(r => r.systolic ?? 0);
  const dia = sorted.map(r => r.diastolic ?? 0);
  const allVals = [...sys, ...dia];
  const minV = Math.max(0, Math.min(...allVals) - 10);
  const maxV = Math.max(...allVals) + 10;
  const n = sorted.length;

  // Dark background chart dimensions
  const BP_H = 180;
  const BP_PAD = { top: 28, right: 16, bottom: 28, left: 44 };
  const BP_INNER_W = CHART_W - BP_PAD.left - BP_PAD.right;
  const BP_INNER_H = BP_H - BP_PAD.top - BP_PAD.bottom;
  const bpScaleX = (i: number) => BP_PAD.left + (n <= 1 ? BP_INNER_W / 2 : (i / (n - 1)) * BP_INNER_W);
  const bpScaleY = (v: number) => BP_PAD.top + BP_INNER_H - ((v - minV) / (maxV - minV || 1)) * BP_INNER_H;

  const sysPts: [number, number][] = sys.map((v, i) => [bpScaleX(i), bpScaleY(v)]);
  const diaPts: [number, number][] = dia.map((v, i) => [bpScaleX(i), bpScaleY(v)]);
  const baseline = bpScaleY(minV);

  // Smooth cubic bezier path helper
  const smoothPath = (pts: [number, number][]) => {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cpx = (x0 + x1) / 2;
      d += ` C${cpx.toFixed(1)},${y0.toFixed(1)} ${cpx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  };

  // Filled area path for systolic
  const sysAreaPath = (() => {
    const d = smoothPath(sysPts);
    if (!d) return '';
    const last = sysPts[sysPts.length - 1];
    const first = sysPts[0];
    return `${d} L${last[0].toFixed(1)},${baseline.toFixed(1)} L${first[0].toFixed(1)},${baseline.toFixed(1)} Z`;
  })();

  // Y-axis labels
  const yLabels = (() => {
    const steps = 4;
    const out: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = minV + ((maxV - minV) * i) / steps;
      const y = bpScaleY(v);
      out.push(`<text x="${(BP_PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#64748B">${Math.round(v)}</text>`);
      out.push(`<line x1="${BP_PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - BP_PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1E293B" stroke-width="0.5"/>`);
    }
    return out.join('');
  })();

  // X-axis labels
  const step = Math.max(1, Math.floor(n / 6));
  const xLabels = sorted.map((r, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const label = safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric' });
    const x = bpScaleX(i);
    return `<text x="${x.toFixed(1)}" y="${(BP_H - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${label}</text>`;
  }).join('');

  // AHA threshold lines (120 systolic, 80 diastolic)
  const sysThreshY = bpScaleY(Math.min(120, maxV));
  const diaThreshY = bpScaleY(Math.min(80, maxV));

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${BP_H}" style="display:block;margin-top:12px;border-radius:12px;">
  <!-- Dark background -->
  <rect width="${CHART_W}" height="${BP_H}" rx="12" fill="#0F172A"/>
  <!-- Grid lines -->
  ${yLabels}
  <!-- AHA threshold lines -->
  ${120 >= minV && 120 <= maxV ? `<line x1="${BP_PAD.left}" y1="${sysThreshY.toFixed(1)}" x2="${(CHART_W - BP_PAD.right).toFixed(1)}" y2="${sysThreshY.toFixed(1)}" stroke="#10B98140" stroke-width="1" stroke-dasharray="5,3"/>` : ''}
  ${80 >= minV && 80 <= maxV ? `<line x1="${BP_PAD.left}" y1="${diaThreshY.toFixed(1)}" x2="${(CHART_W - BP_PAD.right).toFixed(1)}" y2="${diaThreshY.toFixed(1)}" stroke="#38BDF840" stroke-width="1" stroke-dasharray="5,3"/>` : ''}
  <!-- Systolic filled area -->
  <path d="${sysAreaPath}" fill="#10B98122"/>
  <!-- Systolic smooth line -->
  <path d="${smoothPath(sysPts)}" fill="none" stroke="#10B981" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Diastolic dashed smooth line -->
  <path d="${smoothPath(diaPts)}" fill="none" stroke="#38BDF8" stroke-width="1.8" stroke-dasharray="6,3" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Systolic dots -->
  ${sysPts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#10B981" stroke="#0F172A" stroke-width="1.5"/>`).join('')}
  <!-- Diastolic dots -->
  ${diaPts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#38BDF8" stroke="#0F172A" stroke-width="1.5"/>`).join('')}
  ${xLabels}
  <!-- Legend -->
  <circle cx="${BP_PAD.left + 4}" cy="14" r="4" fill="#10B981"/>
  <text x="${BP_PAD.left + 12}" y="18" font-size="9" font-weight="600" fill="#CBD5E1">Systolic</text>
  <line x1="${BP_PAD.left + 72}" y1="14" x2="${BP_PAD.left + 88}" y2="14" stroke="#38BDF8" stroke-width="2" stroke-dasharray="5,3"/>
  <text x="${BP_PAD.left + 92}" y="18" font-size="9" font-weight="600" fill="#CBD5E1">Diastolic</text>
  <text x="${(CHART_W - BP_PAD.right).toFixed(1)}" y="18" font-size="7" fill="#475569" text-anchor="end">AHA normal: 120/80 mmHg</text>
</svg>`;
}

/** Heart rate dense oscillating line — matches dashboard HR tile (dark bg, dense pink/salmon line, no dots for dense data) */
function hrSparkline(records: { bpm: number; hrv?: number | null; timestamp: string }[], L: ReportLabels): string {
  if (records.length < 2) return '';
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const bpms = sorted.map(r => r.bpm);
  const minV = Math.max(0, Math.min(...bpms) - 8);
  const maxV = Math.max(...bpms) + 8;
  const n = sorted.length;

  const HR_H = 160;
  const HR_PAD = { top: 28, right: 16, bottom: 28, left: 44 };
  const HR_INNER_W = CHART_W - HR_PAD.left - HR_PAD.right;
  const HR_INNER_H = HR_H - HR_PAD.top - HR_PAD.bottom;
  const hrScaleX = (i: number) => HR_PAD.left + (n <= 1 ? HR_INNER_W / 2 : (i / (n - 1)) * HR_INNER_W);
  const hrScaleY = (v: number) => HR_PAD.top + HR_INNER_H - ((v - minV) / (maxV - minV || 1)) * HR_INNER_H;

  const pts: [number, number][] = bpms.map((v, i) => [hrScaleX(i), hrScaleY(v)]);
  const baseline = hrScaleY(minV);

  // Area fill path
  const areaPath = (() => {
    const pline = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const first = pts[0];
    return `${pline} ${last[0].toFixed(1)},${baseline.toFixed(1)} ${first[0].toFixed(1)},${baseline.toFixed(1)}`;
  })();

  // Y-axis labels
  const yLabels = (() => {
    const steps = 4;
    const out: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = minV + ((maxV - minV) * i) / steps;
      const y = hrScaleY(v);
      out.push(`<text x="${(HR_PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#64748B">${Math.round(v)}</text>`);
      out.push(`<line x1="${HR_PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - HR_PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1E293B" stroke-width="0.5"/>`);
    }
    return out.join('');
  })();

  // X-axis labels
  const step = Math.max(1, Math.floor(n / 6));
  const xLabels = sorted.map((r, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const label = safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric' });
    return `<text x="${hrScaleX(i).toFixed(1)}" y="${(HR_H - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${label}</text>`;
  }).join('');

  // Only show dots if sparse data (< 30 points)
  const showDots = n < 30;

  // Title label with date range
  const firstLabel = safeFormatDate(sorted[0].timestamp, 'en-US', { month: 'short', day: 'numeric' });
  const lastLabel = safeFormatDate(sorted[n - 1].timestamp, 'en-US', { month: 'short', day: 'numeric' });

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${HR_H}" style="display:block;margin-top:12px;border-radius:12px;">
  <!-- Dark background -->
  <rect width="${CHART_W}" height="${HR_H}" rx="12" fill="#0F172A"/>
  <!-- Grid lines -->
  ${yLabels}
  <!-- Area fill (gradient-like with opacity) -->
  <polygon points="${areaPath}" fill="#F4736420"/>
  <!-- Dense HR line -->
  <polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#F47364" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Dots (only for sparse data) -->
  ${showDots ? pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#F47364" stroke="#0F172A" stroke-width="1"/>`).join('') : ''}
  ${xLabels}
  <!-- Title -->
  <text x="${HR_PAD.left}" y="18" font-size="9" font-weight="700" fill="#CBD5E1">${L.hrChartTitle} (${firstLabel} – ${lastLabel})</text>
  <text x="${(CHART_W - HR_PAD.right).toFixed(1)}" y="18" font-size="8" fill="#64748B" text-anchor="end">${n} readings</text>
</svg>`;
}

/** Glucose line chart — matches dashboard blood glucose tile (dark bg, red line, color-coded dots by range, dashed threshold lines, Time in Range bar) */
function glucoseSparkline(
  records: { glucoseMgDl: number; glucoseMmol: number; context?: string; timestamp: string }[],
  unit: 'mg/dL' | 'mmol/L'
): string {
  if (records.length < 2) return '';
  const MMOL = 18.01;
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const vals = sorted.map(r => unit === 'mg/dL'
    ? (r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * MMOL)
    : (r.glucoseMmol > 0 ? r.glucoseMmol : r.glucoseMgDl / MMOL));

  // Thresholds matching dashboard tile
  const highThresh = unit === 'mg/dL' ? 180 : 10.0;
  const lowThresh = unit === 'mg/dL' ? 70 : 3.9;
  const minV = Math.min(Math.min(...vals) - (unit === 'mg/dL' ? 15 : 0.8), lowThresh - (unit === 'mg/dL' ? 20 : 1.1));
  const maxV = Math.max(Math.max(...vals) + (unit === 'mg/dL' ? 15 : 0.8), highThresh + (unit === 'mg/dL' ? 20 : 1.1));
  const n = sorted.length;

  const GL_H = 220; // taller to include Time in Range bar
  const GL_CHART_H = 160;
  const GL_PAD = { top: 28, right: 16, bottom: 28, left: 44 };
  const GL_INNER_W = CHART_W - GL_PAD.left - GL_PAD.right;
  const GL_INNER_H = GL_CHART_H - GL_PAD.top - GL_PAD.bottom;
  const glScaleX = (i: number) => GL_PAD.left + (n <= 1 ? GL_INNER_W / 2 : (i / (n - 1)) * GL_INNER_W);
  const glScaleY = (v: number) => GL_PAD.top + GL_INNER_H - ((v - minV) / (maxV - minV || 1)) * GL_INNER_H;

  const pts: [number, number][] = vals.map((v, i) => [glScaleX(i), glScaleY(v)]);

  // Threshold Y positions
  const highY = glScaleY(highThresh);
  const lowY = glScaleY(lowThresh);

  // Y-axis labels (show key values)
  const yLabels = (() => {
    const keyVals = [minV, lowThresh, highThresh, maxV];
    return keyVals.map(v => {
      if (v < minV || v > maxV) return '';
      const y = glScaleY(v);
      return `<text x="${(GL_PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#64748B">${Math.round(v)}</text>`
        + `<line x1="${GL_PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - GL_PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1E293B" stroke-width="0.5"/>`;
    }).join('');
  })();

  // X-axis labels
  const step = Math.max(1, Math.floor(n / 6));
  const xLabels = sorted.map((r, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const label = safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric' });
    return `<text x="${glScaleX(i).toFixed(1)}" y="${(GL_CHART_H - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${label}</text>`;
  }).join('');

  // Dot color by range (matching dashboard: green=in range, amber=low, red=high)
  const dotColor = (v: number) => v > highThresh ? '#EF4444' : v < lowThresh ? '#F59E0B' : '#10B981';

  // Time in Range calculation
  const inRange = vals.filter(v => v >= lowThresh && v <= highThresh).length;
  const above = vals.filter(v => v > highThresh).length;
  const below = vals.filter(v => v < lowThresh).length;
  const tirPct = Math.round((inRange / n) * 100);
  const abovePct = Math.round((above / n) * 100);
  const belowPct = Math.round((below / n) * 100);

  // Time in Range bar (below chart)
  const TIR_Y = GL_CHART_H + 12;
  const TIR_BAR_H = 10;
  const TIR_W = GL_INNER_W;
  const aboveW = (abovePct / 100) * TIR_W;
  const inRangeW = (tirPct / 100) * TIR_W;
  const belowW = TIR_W - aboveW - inRangeW;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${GL_H}" style="display:block;margin-top:12px;border-radius:12px;">
  <!-- Dark background -->
  <rect width="${CHART_W}" height="${GL_H}" rx="12" fill="#0F172A"/>
  <!-- Grid lines -->
  ${yLabels}
  <!-- High threshold dashed line (red) -->
  <line x1="${GL_PAD.left}" y1="${highY.toFixed(1)}" x2="${(CHART_W - GL_PAD.right).toFixed(1)}" y2="${highY.toFixed(1)}" stroke="#EF444460" stroke-width="1" stroke-dasharray="6,4"/>
  <text x="${(CHART_W - GL_PAD.right - 2).toFixed(1)}" y="${(highY - 3).toFixed(1)}" text-anchor="end" font-size="7" fill="#EF4444">${Math.round(highThresh)}</text>
  <!-- Low threshold dashed line (amber) -->
  <line x1="${GL_PAD.left}" y1="${lowY.toFixed(1)}" x2="${(CHART_W - GL_PAD.right).toFixed(1)}" y2="${lowY.toFixed(1)}" stroke="#F59E0B60" stroke-width="1" stroke-dasharray="6,4"/>
  <text x="${(CHART_W - GL_PAD.right - 2).toFixed(1)}" y="${(lowY + 9).toFixed(1)}" text-anchor="end" font-size="7" fill="#F59E0B">${Math.round(lowThresh)}</text>
  <!-- Red line -->
  <polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#EF4444" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Color-coded dots by range -->
  ${sorted.map((r, i) => `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="4" fill="${dotColor(vals[i])}" stroke="#0F172A" stroke-width="1.5"/>`).join('')}
  ${xLabels}
  <!-- Header labels -->
  <text x="${GL_PAD.left}" y="18" font-size="8" font-weight="700" fill="#94A3B8">TREND · ${unit.toUpperCase()} · THRESHOLD BAND SHOWN</text>
  <text x="${(CHART_W - GL_PAD.right).toFixed(1)}" y="18" font-size="8" font-weight="600" fill="#10B981" text-anchor="end">${n} readings ›</text>
  <!-- Time in Range section -->
  <text x="${GL_PAD.left}" y="${(TIR_Y - 2).toFixed(1)}" font-size="9" font-weight="700" fill="#CBD5E1">Time in Range</text>
  <text x="${(CHART_W - GL_PAD.right).toFixed(1)}" y="${(TIR_Y - 2).toFixed(1)}" font-size="8" fill="#64748B" text-anchor="end">${n} readings</text>
  <!-- TIR bar: above (red) + in range (amber/green) + below (green) -->
  <rect x="${GL_PAD.left}" y="${TIR_Y.toFixed(1)}" width="${TIR_W.toFixed(1)}" height="${TIR_BAR_H}" rx="5" fill="#1E293B"/>
  ${aboveW > 0 ? `<rect x="${GL_PAD.left}" y="${TIR_Y.toFixed(1)}" width="${aboveW.toFixed(1)}" height="${TIR_BAR_H}" rx="5" fill="#EF4444"/>` : ''}
  ${inRangeW > 0 ? `<rect x="${(GL_PAD.left + aboveW).toFixed(1)}" y="${TIR_Y.toFixed(1)}" width="${inRangeW.toFixed(1)}" height="${TIR_BAR_H}" fill="#F59E0B"/>` : ''}
  ${belowW > 0 ? `<rect x="${(GL_PAD.left + aboveW + inRangeW).toFixed(1)}" y="${TIR_Y.toFixed(1)}" width="${belowW.toFixed(1)}" height="${TIR_BAR_H}" rx="5" fill="#10B981"/>` : ''}
  <!-- TIR labels -->
  <text x="${GL_PAD.left}" y="${(TIR_Y + TIR_BAR_H + 11).toFixed(1)}" font-size="8" font-weight="600" fill="#EF4444">${abovePct}% above</text>
  <text x="${(CHART_W / 2).toFixed(1)}" y="${(TIR_Y + TIR_BAR_H + 11).toFixed(1)}" font-size="8" font-weight="600" fill="#F59E0B" text-anchor="middle">${tirPct}% in range</text>
  <text x="${(CHART_W - GL_PAD.right).toFixed(1)}" y="${(TIR_Y + TIR_BAR_H + 11).toFixed(1)}" font-size="8" font-weight="600" fill="#10B981" text-anchor="end">${belowPct}% below</text>
  <!-- Legend -->
  <circle cx="${GL_PAD.left + 4}" cy="${(GL_H - 8).toFixed(1)}" r="3" fill="#EF4444"/>
  <text x="${GL_PAD.left + 10}" y="${(GL_H - 5).toFixed(1)}" font-size="7.5" fill="#94A3B8">High (${Math.round(highThresh)} ${unit})</text>
  <circle cx="${GL_PAD.left + 104}" cy="${(GL_H - 8).toFixed(1)}" r="3" fill="#F59E0B"/>
  <text x="${GL_PAD.left + 110}" y="${(GL_H - 5).toFixed(1)}" font-size="7.5" fill="#94A3B8">Low (${Math.round(lowThresh)} ${unit})</text>
  <circle cx="${GL_PAD.left + 196}" cy="${(GL_H - 8).toFixed(1)}" r="3" fill="#10B981"/>
  <text x="${GL_PAD.left + 202}" y="${(GL_H - 5).toFixed(1)}" font-size="7.5" fill="#94A3B8">In range</text>
</svg>`;
}

/** Weight trend line chart */
function weightSparkline(
  records: { weightKg: number; timestamp: string }[],
  unit: 'kg' | 'lbs'
): string {
  if (records.length < 2) return '';
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const vals = sorted.map(r => unit === 'lbs' ? r.weightKg * 2.20462 : r.weightKg);
  const minV = Math.min(...vals) - (unit === 'lbs' ? 2 : 1);
  const maxV = Math.max(...vals) + (unit === 'lbs' ? 2 : 1);
  const n = sorted.length;
  const pts: [number, number][] = vals.map((v, i) => [scaleX(i, n), scaleY(v, minV, maxV)]);
  const baseline = scaleY(minV, minV, maxV);
  const trend = vals[vals.length - 1] - vals[0];
  const lineColor = trend < -0.5 ? '#10B981' : trend > 0.5 ? '#F59E0B' : '#0EA5E9';
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${CHART_H}" style="display:block;margin-top:12px;">
  ${yAxisLabels(minV, maxV)}
  <polygon points="${area(pts, baseline)}" fill="${lineColor}18"/>
  <polyline points="${polyline(pts)}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  ${pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${lineColor}"/>`).join('')}
  ${xAxisLabels(sorted.map(r => r.timestamp), n)}
  <rect x="${PAD.left}" y="2" width="8" height="8" rx="2" fill="${lineColor}"/>
  <text x="${PAD.left + 10}" y="9" font-size="8" fill="#475569">Weight (${unit})</text>
  <text x="${(CHART_W - PAD.right).toFixed(1)}" y="9" font-size="7" fill="${lineColor}" text-anchor="end">${trend < -0.5 ? `▼ ${Math.abs(trend).toFixed(1)} ${unit} over period` : trend > 0.5 ? `▲ +${trend.toFixed(1)} ${unit} over period` : 'Stable over period'}</text>
</svg>`;
}

/** Sleep 14-night stacked bar chart — matches dashboard Sleep tile (dark bg, stacked bars Deep/REM/Light/Awake, goal line at 7.5h) */
function neoSleepSparkline(records: {
  totalMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  coreMinutes?: number;
  awakeMinutes: number;
  efficiency: number;
  date: string;
}[]): string {
  if (records.length < 1) return '';
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const n = sorted.length;

  // Chart dimensions — matches dashboard sleep tile proportions
  const SL_H = 220;
  const SL_PAD = { top: 36, right: 16, bottom: 44, left: 44 };
  const SL_INNER_W = CHART_W - SL_PAD.left - SL_PAD.right;
  const SL_INNER_H = SL_H - SL_PAD.top - SL_PAD.bottom;

  // Max hours for Y-axis (round up to nearest hour, min 9h)
  const maxHours = Math.max(9, Math.ceil(Math.max(...sorted.map(r => r.totalMinutes)) / 60) + 0.5);
  const goalHours = 7.5;

  const slScaleX = (i: number) => SL_PAD.left + (n <= 1 ? SL_INNER_W / 2 : (i / (n - 1)) * SL_INNER_W);
  const slScaleY = (hrs: number) => SL_PAD.top + SL_INNER_H - (hrs / maxHours) * SL_INNER_H;
  const barW = Math.max(6, Math.min(20, SL_INNER_W / n - 2));

  // Stage colors matching dashboard tile
  const DEEP_C = '#7C3AED';   // deep purple
  const REM_C  = '#6D28D9';   // medium purple
  const LIGHT_C = '#8B5CF6';  // light purple
  const AWAKE_C = '#EF4444';  // red

  // Y-axis labels (hours)
  const yLabels = (() => {
    const steps = [0, 2, 4, 6, 8, maxHours];
    return steps.filter(v => v <= maxHours).map(v => {
      const y = slScaleY(v);
      return `<text x="${(SL_PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#64748B">${v}h</text>`
        + `<line x1="${SL_PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - SL_PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1E293B" stroke-width="0.5"/>`;
    }).join('');
  })();

  // Goal line at 7.5h (dashed white)
  const goalY = slScaleY(goalHours);

  // Stacked bars per night
  const bars = sorted.map((r, i) => {
    const x = slScaleX(i);
    const core = r.coreMinutes ?? r.lightMinutes;
    const deepH = r.deepMinutes / 60;
    const remH = r.remMinutes / 60;
    const lightH = (core) / 60;
    const awakeH = r.awakeMinutes / 60;
    const _totalH = deepH + remH + lightH + awakeH;

    // Stack from bottom: awake, light, rem, deep
    let curY = slScaleY(0);
    const segments: string[] = [];
    const addSeg = (hrs: number, color: string) => {
      if (hrs <= 0) return;
      const segH = (hrs / maxHours) * SL_INNER_H;
      curY -= segH;
      segments.push(`<rect x="${(x - barW / 2).toFixed(1)}" y="${curY.toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(1)}" rx="1" fill="${color}" fill-opacity="0.9"/>`);
    };
    addSeg(awakeH, AWAKE_C);
    addSeg(lightH, LIGHT_C);
    addSeg(remH, REM_C);
    addSeg(deepH, DEEP_C);
    return segments.join('');
  }).join('');

  // X-axis date labels (day of week abbreviation)
  const xLabels = sorted.map((r, i) => {
    const d = new Date(r.date + 'T12:00:00');
    const dayAbbr = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    const x = slScaleX(i);
    return `<text x="${x.toFixed(1)}" y="${(SL_H - 28).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${dayAbbr}</text>`;
  }).join('');

  // Title
  const firstLabel = safeFormatDate(sorted[0].date + 'T12:00:00', 'en-US', { month: 'short', day: 'numeric' });
  const lastLabel = safeFormatDate(sorted[n - 1].date + 'T12:00:00', 'en-US', { month: 'short', day: 'numeric' });
  const avgSleepH = (sorted.reduce((s, r) => s + r.totalMinutes, 0) / n / 60).toFixed(1);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${SL_H}" style="display:block;margin-top:12px;border-radius:12px;">
  <!-- Dark background -->
  <rect width="${CHART_W}" height="${SL_H}" rx="12" fill="#0F172A"/>
  <!-- Grid lines -->
  ${yLabels}
  <!-- Stacked bars -->
  ${bars}
  <!-- Goal line at 7.5h (dashed white) -->
  <line x1="${SL_PAD.left}" y1="${goalY.toFixed(1)}" x2="${(CHART_W - SL_PAD.right).toFixed(1)}" y2="${goalY.toFixed(1)}" stroke="#FFFFFF60" stroke-width="1.2" stroke-dasharray="5,3"/>
  <text x="${(CHART_W - SL_PAD.right - 2).toFixed(1)}" y="${(goalY - 3).toFixed(1)}" text-anchor="end" font-size="7" fill="#94A3B8">Goal ${goalHours}h</text>
  ${xLabels}
  <!-- Title -->
  <text x="${SL_PAD.left}" y="20" font-size="9" font-weight="700" fill="#CBD5E1">${n}-Night Sleep History · Goal: ${goalHours}h</text>
  <text x="${(CHART_W - SL_PAD.right).toFixed(1)}" y="20" font-size="8" fill="#64748B" text-anchor="end">Avg ${avgSleepH}h</text>
  <!-- Legend -->
  <circle cx="${SL_PAD.left + 4}" cy="${(SL_H - 14).toFixed(1)}" r="3" fill="${DEEP_C}"/>
  <text x="${SL_PAD.left + 10}" y="${(SL_H - 10).toFixed(1)}" font-size="7.5" fill="#94A3B8">Deep</text>
  <circle cx="${SL_PAD.left + 46}" cy="${(SL_H - 14).toFixed(1)}" r="3" fill="${REM_C}"/>
  <text x="${SL_PAD.left + 52}" y="${(SL_H - 10).toFixed(1)}" font-size="7.5" fill="#94A3B8">REM</text>
  <circle cx="${SL_PAD.left + 86}" cy="${(SL_H - 14).toFixed(1)}" r="3" fill="${LIGHT_C}"/>
  <text x="${SL_PAD.left + 92}" y="${(SL_H - 10).toFixed(1)}" font-size="7.5" fill="#94A3B8">Light</text>
  <circle cx="${SL_PAD.left + 130}" cy="${(SL_H - 14).toFixed(1)}" r="3" fill="${AWAKE_C}"/>
  <text x="${SL_PAD.left + 136}" y="${(SL_H - 10).toFixed(1)}" font-size="7.5" fill="#94A3B8">Awake</text>
  <text x="${(CHART_W - SL_PAD.right).toFixed(1)}" y="${(SL_H - 10).toFixed(1)}" font-size="7.5" fill="#64748B" text-anchor="end">${firstLabel} – ${lastLabel}</text>
</svg>`;
}

/** SpO2 oscillating line — matches dashboard SpO2 tile (dark bg, dense cyan/blue line, normal range band 95–100%, dashed threshold lines) */
function spo2Sparkline(records: { value: number; timestamp: string }[]): string {
  if (records.length < 2) return '';
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const vals = sorted.map(r => r.value);
  // Y-axis: floor at 80 to show drops clearly, matching dashboard tile
  const minV = Math.min(80, Math.min(...vals) - 2);
  const maxV = 100;
  const n = sorted.length;

  const SPO2_H = 180;
  const SPO2_PAD = { top: 28, right: 16, bottom: 28, left: 44 };
  const SPO2_INNER_W = CHART_W - SPO2_PAD.left - SPO2_PAD.right;
  const SPO2_INNER_H = SPO2_H - SPO2_PAD.top - SPO2_PAD.bottom;
  const sScaleX = (i: number) => SPO2_PAD.left + (n <= 1 ? SPO2_INNER_W / 2 : (i / (n - 1)) * SPO2_INNER_W);
  const sScaleY = (v: number) => SPO2_PAD.top + SPO2_INNER_H - ((v - minV) / (maxV - minV || 1)) * SPO2_INNER_H;

  const pts: [number, number][] = vals.map((v, i) => [sScaleX(i), sScaleY(Math.max(minV, Math.min(maxV, v)))]);
  const baseline = sScaleY(minV);

  // Threshold Y positions
  const norm95Y = sScaleY(95);
  const norm100Y = sScaleY(100);
  const crit90Y = sScaleY(90);

  // Y-axis labels
  const yLabels = (() => {
    const keyVals = [minV, 90, 95, 100];
    return keyVals.filter(v => v >= minV).map(v => {
      const y = sScaleY(v);
      return `<text x="${(SPO2_PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#64748B">${v}</text>`
        + `<line x1="${SPO2_PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - SPO2_PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1E293B" stroke-width="0.5"/>`;
    }).join('');
  })();

  // X-axis labels
  const step = Math.max(1, Math.floor(n / 6));
  const xLabels = sorted.map((r, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const label = safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric' });
    return `<text x="${sScaleX(i).toFixed(1)}" y="${(SPO2_H - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${label}</text>`;
  }).join('');

  // Area fill path
  const areaPath = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    + ` ${pts[pts.length - 1][0].toFixed(1)},${baseline.toFixed(1)} ${pts[0][0].toFixed(1)},${baseline.toFixed(1)}`;

  // Only show dots for sparse data
  const showDots = n < 40;

  // Stats
  const avgSpo2 = (vals.reduce((a, b) => a + b, 0) / n).toFixed(1);
  const minSpo2 = Math.min(...vals).toFixed(0);
  const maxSpo2 = Math.max(...vals).toFixed(0);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${SPO2_H}" style="display:block;margin-top:12px;border-radius:12px;">
  <!-- Dark background -->
  <rect width="${CHART_W}" height="${SPO2_H}" rx="12" fill="#0F172A"/>
  <!-- Grid lines -->
  ${yLabels}
  <!-- Normal range band 95–100% (subtle fill) -->
  <rect x="${SPO2_PAD.left}" y="${norm100Y.toFixed(1)}" width="${SPO2_INNER_W}" height="${(norm95Y - norm100Y).toFixed(1)}" fill="#38BDF815"/>
  <!-- Normal range upper dashed line (95%) -->
  <line x1="${SPO2_PAD.left}" y1="${norm95Y.toFixed(1)}" x2="${(CHART_W - SPO2_PAD.right).toFixed(1)}" y2="${norm95Y.toFixed(1)}" stroke="#94A3B880" stroke-width="1" stroke-dasharray="5,3"/>
  <text x="${(CHART_W - SPO2_PAD.right - 2).toFixed(1)}" y="${(norm95Y - 3).toFixed(1)}" text-anchor="end" font-size="7" fill="#94A3B8">95%</text>
  <!-- Critical threshold dashed line (90%) -->
  <line x1="${SPO2_PAD.left}" y1="${crit90Y.toFixed(1)}" x2="${(CHART_W - SPO2_PAD.right).toFixed(1)}" y2="${crit90Y.toFixed(1)}" stroke="#EF444450" stroke-width="1" stroke-dasharray="5,3"/>
  <!-- Area fill -->
  <polygon points="${areaPath}" fill="#38BDF818"/>
  <!-- Dense oscillating SpO2 line -->
  <polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#38BDF8" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Dots (sparse only) -->
  ${showDots ? sorted.map((r, i) => {
    const v = r.value;
    const c = v >= 95 ? '#38BDF8' : v >= 90 ? '#F59E0B' : '#EF4444';
    return `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="3.5" fill="${c}" stroke="#0F172A" stroke-width="1.5"/>`;
  }).join('') : ''}
  ${xLabels}
  <!-- Legend -->
  <circle cx="${SPO2_PAD.left + 4}" cy="14" r="4" fill="#38BDF8"/>
  <text x="${SPO2_PAD.left + 12}" y="18" font-size="9" font-weight="600" fill="#CBD5E1">SpO₂</text>
  <rect x="${SPO2_PAD.left + 50}" y="10" width="16" height="8" rx="2" fill="#38BDF820" stroke="#38BDF840" stroke-width="0.8"/>
  <text x="${SPO2_PAD.left + 70}" y="18" font-size="9" fill="#94A3B8">Normal Range (95–100%)</text>
  <!-- Stats row -->
  <text x="${(CHART_W - SPO2_PAD.right).toFixed(1)}" y="18" font-size="8" fill="#64748B" text-anchor="end">Avg ${avgSpo2}% · Min ${minSpo2}% · Max ${maxSpo2}%</text>
</svg>`;
}

/** HRV color-coded bar chart — matches dashboard HRV tile (dark bg, color bars by zone, 7-day rolling avg white line, threshold lines) */
function hrvSparkline(records: { hrv: number; timestamp: string }[], L: ReportLabels): string {
  if (records.length < 2) return '';
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const vals = sorted.map(r => r.hrv);
  const minV = 0;
  const maxV = Math.max(...vals) + 10;
  const n = sorted.length;

  const HRV_H = 200;
  const HRV_PAD = { top: 36, right: 16, bottom: 44, left: 44 };
  const HRV_INNER_W = CHART_W - HRV_PAD.left - HRV_PAD.right;
  const HRV_INNER_H = HRV_H - HRV_PAD.top - HRV_PAD.bottom;
  const hScaleX = (i: number) => HRV_PAD.left + (n <= 1 ? HRV_INNER_W / 2 : (i / (n - 1)) * HRV_INNER_W);
  const hScaleY = (v: number) => HRV_PAD.top + HRV_INNER_H - ((v - minV) / (maxV - minV || 1)) * HRV_INNER_H;
  const baseline = hScaleY(minV);

  // Bar color by HRV zone (matching dashboard: ≥50 green, ≥35 blue, ≥20 amber, <20 red)
  const barColor = (v: number) => v >= 50 ? '#22C55E' : v >= 35 ? '#818CF8' : v >= 20 ? '#F59E0B' : '#EF4444';

  // Bar width
  const barW = Math.max(2, Math.min(8, HRV_INNER_W / n - 1));

  // Color-coded vertical bars
  const bars = sorted.map((r, i) => {
    const x = hScaleX(i);
    const y = hScaleY(r.hrv);
    const h = baseline - y;
    const c = barColor(r.hrv);
    return `<rect x="${(x - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1" fill="${c}" fill-opacity="0.85"/>`;
  }).join('');

  // 7-day rolling average line (white)
  const rollingAvg = sorted.map((_, i) => {
    const window = sorted.slice(Math.max(0, i - 6), i + 1);
    return window.reduce((s, r) => s + r.hrv, 0) / window.length;
  });
  const avgPts: [number, number][] = rollingAvg.map((v, i) => [hScaleX(i), hScaleY(v)]);

  // Threshold lines: 35 ms (threshold) and 40 ms (target)
  const thresh35Y = hScaleY(Math.min(35, maxV));
  const target40Y = hScaleY(Math.min(40, maxV));

  // Y-axis labels
  const yLabels = (() => {
    const steps = 4;
    const out: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = minV + ((maxV - minV) * i) / steps;
      const y = hScaleY(v);
      out.push(`<text x="${(HRV_PAD.left - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#64748B">${Math.round(v)}</text>`);
      out.push(`<line x1="${HRV_PAD.left}" y1="${y.toFixed(1)}" x2="${(CHART_W - HRV_PAD.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1E293B" stroke-width="0.5"/>`);
    }
    return out.join('');
  })();

  // X-axis labels
  const step = Math.max(1, Math.floor(n / 6));
  const xLabels = sorted.map((r, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const label = safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric' });
    return `<text x="${hScaleX(i).toFixed(1)}" y="${(HRV_H - 28).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${label}</text>`;
  }).join('');

  // Title
  const firstLabel = safeFormatDate(sorted[0].timestamp, 'en-US', { month: 'short', day: 'numeric' });
  const lastLabel = safeFormatDate(sorted[n - 1].timestamp, 'en-US', { month: 'short', day: 'numeric' });
  const avgHrv = (vals.reduce((a, b) => a + b, 0) / n).toFixed(1);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${HRV_H}" style="display:block;margin-top:12px;border-radius:12px;">
  <!-- Dark background -->
  <rect width="${CHART_W}" height="${HRV_H}" rx="12" fill="#0F172A"/>
  <!-- Grid lines -->
  ${yLabels}
  <!-- Color-coded bars -->
  ${bars}
  <!-- 35ms threshold line (green) -->
  ${35 <= maxV ? `<line x1="${HRV_PAD.left}" y1="${thresh35Y.toFixed(1)}" x2="${(CHART_W - HRV_PAD.right).toFixed(1)}" y2="${thresh35Y.toFixed(1)}" stroke="#22C55E80" stroke-width="1.2" stroke-dasharray="5,3"/>` : ''}
  <!-- 40ms target line (cyan) -->
  ${40 <= maxV ? `<line x1="${HRV_PAD.left}" y1="${target40Y.toFixed(1)}" x2="${(CHART_W - HRV_PAD.right).toFixed(1)}" y2="${target40Y.toFixed(1)}" stroke="#38BDF880" stroke-width="1.2" stroke-dasharray="5,3"/>` : ''}
  <!-- 7-day rolling average white line -->
  <polyline points="${avgPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.8"/>
  ${xLabels}
  <!-- Title -->
  <text x="${HRV_PAD.left}" y="18" font-size="9" font-weight="700" fill="#CBD5E1">${L.hrvChartTitle} (${firstLabel} – ${lastLabel})</text>
  <text x="${(CHART_W - HRV_PAD.right).toFixed(1)}" y="18" font-size="8" fill="#64748B" text-anchor="end">Avg ${avgHrv} ms</text>
  <!-- Legend row -->
  <line x1="${HRV_PAD.left}" y1="${(HRV_H - 18).toFixed(1)}" x2="${HRV_PAD.left + 14}" y2="${(HRV_H - 18).toFixed(1)}" stroke="#FFFFFF" stroke-width="1.5"/>
  <text x="${HRV_PAD.left + 18}" y="${(HRV_H - 14).toFixed(1)}" font-size="7.5" fill="#94A3B8">${L.hrvSevenDayAvgLabel}</text>
  <line x1="${HRV_PAD.left + 72}" y1="${(HRV_H - 18).toFixed(1)}" x2="${HRV_PAD.left + 86}" y2="${(HRV_H - 18).toFixed(1)}" stroke="#22C55E" stroke-width="1.2" stroke-dasharray="4,2"/>
  <text x="${HRV_PAD.left + 90}" y="${(HRV_H - 14).toFixed(1)}" font-size="7.5" fill="#94A3B8">${L.hrv35msThreshold}</text>
  <line x1="${HRV_PAD.left + 172}" y1="${(HRV_H - 18).toFixed(1)}" x2="${HRV_PAD.left + 186}" y2="${(HRV_H - 18).toFixed(1)}" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="4,2"/>
  <text x="${HRV_PAD.left + 190}" y="${(HRV_H - 14).toFixed(1)}" font-size="7.5" fill="#94A3B8">${L.hrv40msTarget}</text>
  <!-- Zone legend -->
  <circle cx="${HRV_PAD.left + 4}" cy="${(HRV_H - 6).toFixed(1)}" r="3" fill="#22C55E"/>
  <text x="${HRV_PAD.left + 10}" y="${(HRV_H - 2).toFixed(1)}" font-size="7" fill="#94A3B8">≥50ms Excellent</text>
  <circle cx="${HRV_PAD.left + 90}" cy="${(HRV_H - 6).toFixed(1)}" r="3" fill="#818CF8"/>
  <text x="${HRV_PAD.left + 96}" y="${(HRV_H - 2).toFixed(1)}" font-size="7" fill="#94A3B8">≥35ms Good</text>
  <circle cx="${HRV_PAD.left + 162}" cy="${(HRV_H - 6).toFixed(1)}" r="3" fill="#F59E0B"/>
  <text x="${HRV_PAD.left + 168}" y="${(HRV_H - 2).toFixed(1)}" font-size="7" fill="#94A3B8">≥20ms Fair</text>
  <circle cx="${HRV_PAD.left + 226}" cy="${(HRV_H - 6).toFixed(1)}" r="3" fill="#EF4444"/>
  <text x="${HRV_PAD.left + 232}" y="${(HRV_H - 2).toFixed(1)}" font-size="7" fill="#94A3B8">&lt;20ms Low</text>
</svg>`;
}

// ─── Math & Format Helpers ──────────────────────────────────────────────────
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function avg(nums: (number | null)[]): number {
  const filtered = nums.filter((n): n is number => n !== null);
  return filtered.length ? Math.round(filtered.reduce((a, b) => a + b, 0) / filtered.length) : 0;
}
function avgFloat(nums: (number | null)[], decimals = 1): string {
  const filtered = nums.filter((n): n is number => n !== null);
  if (!filtered.length) return '—';
  return (filtered.reduce((a, b) => a + b, 0) / filtered.length).toFixed(decimals);
}
function stdDev(nums: (number | null)[]): string {
  const filtered = nums.filter((n): n is number => n !== null);
  if (filtered.length < 2) return '—';
  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const variance = filtered.reduce((s, v) => s + (v - mean) ** 2, 0) / (filtered.length - 1);
  return Math.sqrt(variance).toFixed(1);
}
function rangeStr(nums: (number | null)[], unit = ''): string {
  const filtered = nums.filter((n): n is number => n !== null);
  if (!filtered.length) return '—';
  return `${Math.min(...filtered).toFixed(1)}–${Math.max(...filtered).toFixed(1)}${unit ? ' ' + unit : ''}`;
}

// ─── NeoVital Oscillating Graph (dark-background, 6 colored lines) ──────────
/**
 * Generates a full-width dark-background SVG with 6 oscillating vital lines,
 * matching the dashboard NeoVital widget aesthetic.
 * Each series is independently normalized so all 6 lines are visible regardless
 * of unit differences (HR bpm vs BG mg/dL vs Wgt kg).
 */
function neoVitalOscillatingGraph(
  vitalSigns: { timestamp: string; heartRate?: number; systolic?: number; diastolic?: number; oxygenSaturation?: number; spo2?: number; weightKg?: number }[],
  bloodSugar: { timestamp: string; glucoseMgDl: number; glucoseMmol: number }[],
  weightUnit: 'kg' | 'lbs' = 'kg',
  labels?: ReportLabels
): string {
  const _L = labels ?? DEFAULT_REPORT_LABELS;
  // ── Palette matching the dashboard NeoVital widget ──
  const COLORS = {
    hr:   '#FF2D78',  // hot pink
    sys:  '#00C2FF',  // bright blue
    dia:  '#A78BFA',  // violet
    spo2: '#34D399',  // emerald green
    bg:   '#F97316',  // orange
    wgt:  '#FFD60A',  // yellow
  };

  // ── Chart dimensions — full US Letter width ──
  const NEO_W = 680;
  const NEO_H = 220;
  const PAD_L = 46;  // left Y-axis labels
  const PAD_R = 68;  // right dual Y-axis labels (BG + Wgt)
  const PAD_T = 28;  // top (legend chips)
  const PAD_B = 32;  // bottom (x-axis dates)
  const INNER_W = NEO_W - PAD_L - PAD_R;
  const INNER_H = NEO_H - PAD_T - PAD_B;

  // ── Collect and sort data points ──
  const sorted = [...vitalSigns].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sortedBG = [...bloodSugar].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Extract series (only records that have the field)
  const hrPts   = sorted.filter(r => r.heartRate != null).map(r => ({ t: r.timestamp, v: r.heartRate! }));
  const sysPts  = sorted.filter(r => r.systolic != null).map(r => ({ t: r.timestamp, v: r.systolic! }));
  const diaPts  = sorted.filter(r => r.diastolic != null).map(r => ({ t: r.timestamp, v: r.diastolic! }));
  const spo2Pts = sorted.filter(r => (r.oxygenSaturation ?? r.spo2) != null).map(r => ({ t: r.timestamp, v: (r.oxygenSaturation ?? r.spo2)! }));
  const bgPts   = sortedBG.map(r => ({ t: r.timestamp, v: r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * 18.01 }));
  const wgtPts  = sorted.filter(r => r.weightKg != null).map(r => ({
    t: r.timestamp,
    v: weightUnit === 'lbs' ? r.weightKg! * 2.20462 : r.weightKg!
  }));

  const allSeries = [hrPts, sysPts, diaPts, spo2Pts, bgPts, wgtPts];
  const hasAny = allSeries.some(s => s.length >= 2);
  if (!hasAny) return '';

  // ── Collect all timestamps for a unified X-axis ──
  const allTimestamps = [...new Set(
    allSeries.flatMap(s => s.map(p => p.t))
  )].sort();
  const n = allTimestamps.length;
  if (n < 2) return '';

  // ── Scale helpers ──
  const sx = (i: number) => PAD_L + (i / (n - 1)) * INNER_W;
  const tsIndex = (t: string) => {
    const idx = allTimestamps.indexOf(t);
    return idx >= 0 ? idx : allTimestamps.findIndex(ts => ts >= t);
  };

  // Normalize a series to the plot area using its own min/max
  function normalizeSeries(pts: { t: string; v: number }[]): [number, number][] {
    if (pts.length < 2) return [];
    const vals = pts.map(p => p.v);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    return pts.map(p => [
      sx(tsIndex(p.t)),
      PAD_T + INNER_H - ((p.v - minV) / range) * INNER_H
    ]);
  }

  // ── Build polyline paths ──
  function toPolyline(pts: [number, number][]): string {
    return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }
  function toAreaPath(pts: [number, number][]): string {
    if (pts.length === 0) return '';
    const base = PAD_T + INNER_H;
    const top = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const bl = `${pts[pts.length-1][0].toFixed(1)},${base.toFixed(1)} ${pts[0][0].toFixed(1)},${base.toFixed(1)}`;
    return `${top} ${bl}`;
  }

  const hrCoords   = normalizeSeries(hrPts);
  const sysCoords  = normalizeSeries(sysPts);
  const diaCoords  = normalizeSeries(diaPts);
  const spo2Coords = normalizeSeries(spo2Pts);
  const bgCoords   = normalizeSeries(bgPts);
  const wgtCoords  = normalizeSeries(wgtPts);

  // ── X-axis date labels ──
  const step = Math.max(1, Math.floor(n / 6));
  const xLabels = allTimestamps.map((ts, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const label = safeFormatDate(ts, 'en-US', { month: 'short', day: 'numeric' });
    const x = sx(i);
    return `<text x="${x.toFixed(1)}" y="${(NEO_H - 6).toFixed(1)}" text-anchor="middle" font-size="8" fill="#4A6080">${label}</text>`;
  }).join('');

  // ── Left Y-axis: HR/BP/SpO2 scale (0–200) ──
  const leftAxisSteps = 4;
  const leftMin = 0;
  const leftMax = 200;
  const leftLabels = Array.from({ length: leftAxisSteps + 1 }, (_, i) => {
    const v = leftMin + ((leftMax - leftMin) * i) / leftAxisSteps;
    const y = PAD_T + INNER_H - ((v - leftMin) / (leftMax - leftMin)) * INNER_H;
    return [
      `<text x="${(PAD_L - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#4A6080">${Math.round(v)}</text>`,
      `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${(NEO_W - PAD_R).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1A3050" stroke-width="0.5"/>`
    ].join('');
  }).join('');

  // ── Right Y-axis: BG scale ──
  const bgMin = bgPts.length ? Math.min(...bgPts.map(p => p.v)) - 10 : 60;
  const bgMax = bgPts.length ? Math.max(...bgPts.map(p => p.v)) + 10 : 300;
  const bgAxisLabels = bgPts.length >= 2 ? Array.from({ length: 3 }, (_, i) => {
    const v = bgMin + ((bgMax - bgMin) * i) / 2;
    const y = PAD_T + INNER_H - ((i) / 2) * INNER_H;
    return `<text x="${(NEO_W - PAD_R + 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="7" fill="${COLORS.bg}">${Math.round(v)}</text>`;
  }).join('') : '';
  const bgAxisTitle = bgPts.length >= 2 ? `<text x="${(NEO_W - PAD_R + 4).toFixed(1)}" y="${PAD_T.toFixed(1)}" font-size="6.5" fill="${COLORS.bg}" font-weight="700">mg/dL</text>` : '';

  // ── Right Y-axis: Wgt scale ──
  const wgtMin = wgtPts.length ? Math.min(...wgtPts.map(p => p.v)) - 1 : 50;
  const wgtMax = wgtPts.length ? Math.max(...wgtPts.map(p => p.v)) + 1 : 120;
  const wgtAxisLabels = wgtPts.length >= 2 ? Array.from({ length: 3 }, (_, i) => {
    const v = wgtMin + ((wgtMax - wgtMin) * i) / 2;
    const y = PAD_T + INNER_H - ((i) / 2) * INNER_H;
    return `<text x="${(NEO_W - PAD_R + 26).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="7" fill="${COLORS.wgt}">${Math.round(v)}</text>`;
  }).join('') : '';
  const wgtAxisTitle = wgtPts.length >= 2 ? `<text x="${(NEO_W - PAD_R + 26).toFixed(1)}" y="${PAD_T.toFixed(1)}" font-size="6.5" fill="${COLORS.wgt}" font-weight="700">${weightUnit}</text>` : '';

  // ── Legend chips at top ──
  const VITALS_META = [
    { key: 'hr',   label: 'HR',   color: COLORS.hr,   pts: hrCoords },
    { key: 'sys',  label: 'SYS',  color: COLORS.sys,  pts: sysCoords },
    { key: 'dia',  label: 'DIA',  color: COLORS.dia,  pts: diaCoords },
    { key: 'spo2', label: 'SpO₂', color: COLORS.spo2, pts: spo2Coords },
    { key: 'bg',   label: 'BG',   color: COLORS.bg,   pts: bgCoords },
    { key: 'wgt',  label: 'Wgt',  color: COLORS.wgt,  pts: wgtCoords },
  ];
  const activeMeta = VITALS_META.filter(v => v.pts.length >= 2);
  let legendX = PAD_L;
  const legendChips = activeMeta.map(v => {
    const chip = `<rect x="${legendX.toFixed(1)}" y="4" width="36" height="14" rx="7" fill="${v.color}22" stroke="${v.color}" stroke-width="0.8"/><circle cx="${(legendX + 8).toFixed(1)}" cy="11" r="3" fill="${v.color}"/><text x="${(legendX + 14).toFixed(1)}" y="15" font-size="7.5" font-weight="700" fill="${v.color}">${v.label}</text>`;
    legendX += 44;
    return chip;
  }).join('');

  // ── Chart border ──
  const border = `<rect x="${PAD_L}" y="${PAD_T}" width="${INNER_W}" height="${INNER_H}" fill="none" stroke="#1A3050" stroke-width="0.8" rx="3"/>`;

  // ── Assemble SVG ──
  return `
<div style="background:#0A1520;border-radius:16px;padding:16px 0 8px 0;margin-bottom:16px;">
  <div style="font-size:10px;font-weight:800;color:#4A9ECC;letter-spacing:1px;text-transform:uppercase;padding:0 16px 8px 16px;">${_L.neoVitalMonitorTitle}</div>
  <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${NEO_W} ${NEO_H}" style="display:block;">
    <!-- Grid lines -->
    ${leftLabels}
    <!-- Border -->
    ${border}
    <!-- Area fills (subtle) -->
    ${hrCoords.length >= 2   ? `<polygon points="${toAreaPath(hrCoords)}"   fill="${COLORS.hr}0A"/>` : ''}
    ${sysCoords.length >= 2  ? `<polygon points="${toAreaPath(sysCoords)}"  fill="${COLORS.sys}0A"/>` : ''}
    ${diaCoords.length >= 2  ? `<polygon points="${toAreaPath(diaCoords)}"  fill="${COLORS.dia}0A"/>` : ''}
    ${spo2Coords.length >= 2 ? `<polygon points="${toAreaPath(spo2Coords)}" fill="${COLORS.spo2}0A"/>` : ''}
    ${bgCoords.length >= 2   ? `<polygon points="${toAreaPath(bgCoords)}"   fill="${COLORS.bg}0A"/>` : ''}
    ${wgtCoords.length >= 2  ? `<polygon points="${toAreaPath(wgtCoords)}"  fill="${COLORS.wgt}0A"/>` : ''}
    <!-- Oscillating lines -->
    ${hrCoords.length >= 2   ? `<polyline points="${toPolyline(hrCoords)}"   fill="none" stroke="${COLORS.hr}"   stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${sysCoords.length >= 2  ? `<polyline points="${toPolyline(sysCoords)}"  fill="none" stroke="${COLORS.sys}"  stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${diaCoords.length >= 2  ? `<polyline points="${toPolyline(diaCoords)}"  fill="none" stroke="${COLORS.dia}"  stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${spo2Coords.length >= 2 ? `<polyline points="${toPolyline(spo2Coords)}" fill="none" stroke="${COLORS.spo2}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${bgCoords.length >= 2   ? `<polyline points="${toPolyline(bgCoords)}"   fill="none" stroke="${COLORS.bg}"   stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${wgtCoords.length >= 2  ? `<polyline points="${toPolyline(wgtCoords)}"  fill="none" stroke="${COLORS.wgt}"  stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    <!-- Data dots -->
    ${hrCoords.map(([x,y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${COLORS.hr}"/>`).join('')}
    ${sysCoords.map(([x,y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${COLORS.sys}"/>`).join('')}
    ${diaCoords.map(([x,y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${COLORS.dia}"/>`).join('')}
    ${spo2Coords.map(([x,y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${COLORS.spo2}"/>`).join('')}
    ${bgCoords.map(([x,y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${COLORS.bg}"/>`).join('')}
    ${wgtCoords.map(([x,y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${COLORS.wgt}"/>`).join('')}
    <!-- Right Y-axis labels -->
    ${bgAxisTitle}
    ${bgAxisLabels}
    ${wgtAxisTitle}
    ${wgtAxisLabels}
    <!-- Legend chips -->
    ${legendChips}
    <!-- X-axis labels -->
    ${xLabels}
  </svg>
  <div style="font-size:8px;color:#4A6080;padding:4px 16px 0 16px;">${_L.neoVitalAxisNote} (${weightUnit}).</div>
</div>`;
}

// ─── Date Range Filter ───────────────────────────────────────────────────────
function filterByDateRange<T extends { timestamp?: string; date?: string }>(arr: T[], start: Date, end: Date): T[] {
  return arr.filter(r => {
    const ts = r.timestamp ?? r.date ?? '';
    if (!ts) return false;
    const d = new Date(ts);
    return d >= start && d <= end;
  });
}

export function generateReportHTML(data: HealthData, config: ReportConfig): string {
  const { dateRange, patientName, doctorName, notes, clinicianName, clinicianCredentials, clinicianRole } = config;
  // Merge provided labels with defaults (allows partial translation override)
  const L: ReportLabels = { ...DEFAULT_REPORT_LABELS, ...config.labels };

  // All vitals are stored in data.vitalSigns (unified record).
  // The legacy data.bloodPressure / data.pulse / data.bodyComposition arrays are kept for
  // backwards-compat but are never written to by the current app — always fall back to vitalSigns.
  const allVitalSigns = filterByDateRange(data.vitalSigns ?? [], dateRange.start, dateRange.end) as typeof data.vitalSigns;

  const bpRecords = config.includeBloodPressure
    ? (() => {
        // Prefer legacy array if it has data (HealthKit sync path), else derive from vitalSigns
        const legacy = filterByDateRange(data.bloodPressure ?? [], dateRange.start, dateRange.end);
        if (legacy.length > 0) return legacy;
        return allVitalSigns
          .filter(r => r.systolic != null && r.diastolic != null)
          .map(r => ({ id: r.id, timestamp: r.timestamp, systolic: r.systolic!, diastolic: r.diastolic!, source: r.source }));
      })()
    : [];
  const pulseRecords = config.includePulse
    ? (() => {
        // Aggregate raw HealthKit HR samples into 4-hour buckets (max 6/day) to
        // prevent thousands of raw points from bloating the report chart.
        const rawLegacy = filterByDateRange(data.pulse ?? [], dateRange.start, dateRange.end);
        const legacy = rawLegacy.length > 0
          ? aggregatedToPulseRecords(aggregateHrTo4HourBuckets(rawLegacy))
          : [];
        if (legacy.length > 0) return legacy;
        // Fall back to manually-entered vitalSigns heartRate values (sparse, no aggregation needed)
        return allVitalSigns
          .filter(r => r.heartRate != null)
          .map(r => ({ id: r.id, timestamp: r.timestamp, bpm: r.heartRate!, hrv: r.hrv ?? null, source: r.source }));
      })()
    : [];
  const bodyRecords = config.includeBodyComposition
    ? (() => {
        const legacy = filterByDateRange(data.bodyComposition ?? [], dateRange.start, dateRange.end);
        if (legacy.length > 0) return legacy;
        return allVitalSigns
          .filter(r => r.weightKg != null)
          .map(r => ({ id: r.id, timestamp: r.timestamp, weightKg: r.weightKg!, source: r.source }));
      })()
    : [];
  const sleepRecords = config.includeSleep
    ? (data.sleep ?? []).filter((r) => {
        const d = new Date(r.date);
        return d >= dateRange.start && d <= dateRange.end;
      })
    : [];

  const bpData = bpRecords as typeof data.bloodPressure;
  const pulseData = pulseRecords as typeof data.pulse;
  const bodyData = bodyRecords as typeof data.bodyComposition;
  const sleepData = sleepRecords as typeof data.sleep;

  // SpO2 data — merged from vitalSigns (oxygenSaturation or spo2 alias)
  const spo2Data = allVitalSigns
    .filter(r => (r.oxygenSaturation != null && r.oxygenSaturation > 0) || (r.spo2 != null && r.spo2 > 0))
    .map(r => ({ value: r.oxygenSaturation ?? r.spo2!, timestamp: r.timestamp }));

  // HRV data — merged from pulse records and vitalSigns.hrv
  const hrvFromPulse = filterByDateRange(data.pulse ?? [], dateRange.start, dateRange.end)
    .filter(r => r.hrv != null && r.hrv > 0)
    .map(r => ({ hrv: r.hrv!, timestamp: r.timestamp }));
  const hrvFromVitals = allVitalSigns
    .filter(r => r.hrv != null && r.hrv > 0)
    .map(r => ({ hrv: r.hrv!, timestamp: r.timestamp }));
  // Merge and deduplicate by timestamp (prefer pulse records)
  const hrvTimestamps = new Set(hrvFromPulse.map(r => r.timestamp));
  const hrvData = [
    ...hrvFromPulse,
    ...hrvFromVitals.filter(r => !hrvTimestamps.has(r.timestamp)),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // ── NeoVital range-filtered sparkline data ──────────────────────────────────
  // When neoVitalRangeDays is set (30 or 90), the individual sparkline charts
  // in each vital section also reflect that rolling window, matching the
  // dashboard tile behavior when the user selects 30d/90d on the report screen.
  const neoRangeDays = config.neoVitalRangeDays ?? null;
  const neoRangeLabel = neoRangeDays ? ` (${neoRangeDays}d)` : '';
  const sparklineData = (() => {
    if (!neoRangeDays) {
      // No independent range — use the main report date range data as-is
      const glucoseData = (data.bloodSugar ?? []).filter(r => {
        const d = new Date(r.timestamp);
        return d >= dateRange.start && d <= dateRange.end;
      });
      const weightData = (data.bodyComposition ?? []).filter(r => {
        const d = new Date(r.timestamp);
        return d >= dateRange.start && d <= dateRange.end;
      });
      return { bpData, pulseData, spo2Data, hrvData, sleepData, glucoseData, weightData };
    }
    // Compute rolling cutoff from today
    const neoEnd = new Date();
    const neoStart = new Date();
    neoStart.setDate(neoEnd.getDate() - neoRangeDays);

    const vsFiltered = filterByDateRange(data.vitalSigns ?? [], neoStart, neoEnd);

    const neoBpData = (() => {
      const legacy = filterByDateRange(data.bloodPressure ?? [], neoStart, neoEnd);
      if (legacy.length > 0) return legacy;
      return vsFiltered
        .filter(r => r.systolic != null && r.diastolic != null)
        .map(r => ({ id: r.id, timestamp: r.timestamp, systolic: r.systolic!, diastolic: r.diastolic!, source: r.source }));
    })();

    const neoPulseData = (() => {
      const legacy = filterByDateRange(data.pulse ?? [], neoStart, neoEnd);
      if (legacy.length > 0) return legacy;
      return vsFiltered
        .filter(r => r.heartRate != null)
        .map(r => ({ id: r.id, timestamp: r.timestamp, bpm: r.heartRate!, hrv: r.hrv ?? null, source: r.source }));
    })();

    const neoSpo2Data = vsFiltered
      .filter(r => (r.oxygenSaturation != null && r.oxygenSaturation > 0) || (r.spo2 != null && r.spo2 > 0))
      .map(r => ({ value: r.oxygenSaturation ?? r.spo2!, timestamp: r.timestamp }));

    const neoHrvFromPulse = filterByDateRange(data.pulse ?? [], neoStart, neoEnd)
      .filter(r => r.hrv != null && r.hrv > 0)
      .map(r => ({ hrv: r.hrv!, timestamp: r.timestamp }));
    const neoHrvFromVitals = vsFiltered
      .filter(r => r.hrv != null && r.hrv > 0)
      .map(r => ({ hrv: r.hrv!, timestamp: r.timestamp }));
    const neoHrvTs = new Set(neoHrvFromPulse.map(r => r.timestamp));
    const neoHrvData = [
      ...neoHrvFromPulse,
      ...neoHrvFromVitals.filter(r => !neoHrvTs.has(r.timestamp)),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const neoSleepData = (data.sleep ?? []).filter(r => {
      const d = new Date(r.date);
      return d >= neoStart && d <= neoEnd;
    });

    const neoGlucoseData = (data.bloodSugar ?? []).filter(r => {
      const d = new Date(r.timestamp);
      return d >= neoStart && d <= neoEnd;
    });

    const neoWeightData = (data.bodyComposition ?? []).filter(r => {
      const d = new Date(r.timestamp);
      return d >= neoStart && d <= neoEnd;
    });

    return {
      bpData: neoBpData as typeof bpData,
      pulseData: neoPulseData as typeof pulseData,
      spo2Data: neoSpo2Data,
      hrvData: neoHrvData,
      sleepData: neoSleepData as typeof sleepData,
      glucoseData: neoGlucoseData,
      weightData: neoWeightData as typeof data.bodyComposition,
    };
  })();
  // Aliases used by sparkline calls below
  const sparkBpData = sparklineData.bpData;
  const sparkPulseData = sparklineData.pulseData;
  const sparkSpo2Data = sparklineData.spo2Data;
  const sparkHrvData = sparklineData.hrvData;
  const sparkSleepData = sparklineData.sleepData;
  const sparkGlucoseData = sparklineData.glucoseData;
  const sparkWeightData = sparklineData.weightData;

  const avgSystolic = avg(bpData.map((r) => r.systolic));
  const avgDiastolic = avg(bpData.map((r) => r.diastolic));
  const latestBP = bpData[bpData.length - 1];
  const bpStatus = latestBP && latestBP.systolic != null && latestBP.diastolic != null ? getBPStatus(latestBP.systolic, latestBP.diastolic) : null;

  const avgBpm = avg(pulseData.map((r) => r.bpm));
  const avgHrv = avg(pulseData.map((r) => r.hrv ?? 0));

  // SpO2 stats
  const avgSpO2 = spo2Data.length ? (spo2Data.reduce((s, r) => s + r.value, 0) / spo2Data.length).toFixed(1) : '—';
  const minSpO2 = spo2Data.length ? Math.min(...spo2Data.map(r => r.value)).toFixed(1) : '—';
  const latestSpO2 = spo2Data.length ? spo2Data[spo2Data.length - 1].value : null;
  const getSpO2Status = (v: number) => v >= 97 ? L.spo2StatusOptimal : v >= 95 ? L.spo2StatusNormal : v >= 90 ? L.spo2StatusLow : L.spo2StatusCritical;
  const getSpO2StatusColor = (v: number) => v >= 97 ? '#34D399' : v >= 95 ? '#10B981' : v >= 90 ? '#F59E0B' : '#EF4444';

  // HRV stats
  const _avgHrvMs = hrvData.length ? (hrvData.reduce((s, r) => s + r.hrv, 0) / hrvData.length).toFixed(1) : '—';
  const _maxHrvMs = hrvData.length ? Math.max(...hrvData.map(r => r.hrv)).toFixed(1) : '—';
  // Resting HR stats (from restingHRSamples — one sample per day from Apple Watch)
  const restingHRSamples = config.includePulse
    ? filterByDateRange(data.restingHRSamples ?? [], dateRange.start, dateRange.end)
    : [];
  const latestRestingBpm = restingHRSamples.length
    ? restingHRSamples[restingHRSamples.length - 1].bpm
    : null;
  const avgRestingBpm = restingHRSamples.length
    ? Math.round(restingHRSamples.reduce((s, r) => s + r.bpm, 0) / restingHRSamples.length)
    : null;
  const minRestingBpm = restingHRSamples.length ? Math.min(...restingHRSamples.map(r => r.bpm)) : null;
  const maxRestingBpm = restingHRSamples.length ? Math.max(...restingHRSamples.map(r => r.bpm)) : null;
  // 7-day resting HR average for trend
  const last7RestingSamples = [...restingHRSamples].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-7);
  const sevenDayRestingAvg = last7RestingSamples.length
    ? Math.round(last7RestingSamples.reduce((s, r) => s + r.bpm, 0) / last7RestingSamples.length)
    : null;
  // Age/sex-adjusted resting HR reference
  const restingHRRef = config.userProfile
    ? getRestingHRReferenceRange(config.userProfile)
    : getRestingHRReferenceRange({ age: null, sex: null });
  const restingHRStatus = latestRestingBpm != null
    ? latestRestingBpm <= restingHRRef.athleticMax ? 'Athletic'
      : latestRestingBpm > restingHRRef.normalMax ? 'Elevated'
      : 'Normal'
    : null;
  const restingHRStatusColor = restingHRStatus === 'Athletic' ? '#10B981'
    : restingHRStatus === 'Elevated' ? '#EF4444'
    : '#8B5CF6';
  const restingHRProfileLabel = restingHRRef.label;

  const latestBody = bodyData[bodyData.length - 1];
  const firstBody = bodyData[0];
  const wUnit = config.weightUnit ?? 'kg';
  const toDisplayWeight = (kg: number) =>
    wUnit === 'lbs' ? kgToLbs(kg).toFixed(1) : kg.toFixed(1);
  const latestWeightDisplay = latestBody ? toDisplayWeight(latestBody.weightKg) : '—';
  const weightChange = latestBody && firstBody
    ? (() => {
        const deltaKg = latestBody.weightKg - firstBody.weightKg;
        return wUnit === 'lbs' ? (deltaKg * 2.20462).toFixed(1) : deltaKg.toFixed(1);
      })()
    : null;

  const avgSleepHours = sleepData.length
    ? (sleepData.reduce((s, r) => s + r.totalMinutes, 0) / sleepData.length / 60).toFixed(1)
    : '—';
  const avgEfficiency = avg(sleepData.map((r) => r.efficiency));

  // Temperature data — stored in °F, convert to user's preferred unit
  const tempUnit = config.tempUnit ?? 'C';
  const tempRecords = (config.includeTemperature !== false)
    ? filterByDateRange(
        (data.vitalSigns ?? []).filter((r) => r.temperature !== undefined && r.temperature > 0),
        dateRange.start,
        dateRange.end
      ) as typeof data.vitalSigns
    : [];
  const convertTemp = (f: number) => tempUnit === 'F' ? f : (f - 32) * 5 / 9;
  const tempValues = tempRecords.map((r) => convertTemp(r.temperature!));
  const avgTempVal = tempValues.length ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length : null;
  const minTempVal = tempValues.length ? Math.min(...tempValues) : null;
  const maxTempVal = tempValues.length ? Math.max(...tempValues) : null;
  const tempUnitLabel = tempUnit === 'F' ? '°F' : '°C';
  // Normal range: 36.1–37.2°C / 97–99°F
  const tempNormalLow = tempUnit === 'F' ? 97 : 36.1;
  const _tempNormalHigh = tempUnit === 'F' ? 99 : 37.2;
  const tempFeverThreshold = tempUnit === 'F' ? 100.4 : 38.0;
  const tempHighFeverThreshold = tempUnit === 'F' ? 103 : 39.4;
  function getTempStatus(t: number): string {
    if (t < tempNormalLow) return L.tempLow;
    if (t < tempFeverThreshold) return L.tempNormal;
    if (t < tempHighFeverThreshold) return L.tempFever;
    return L.tempHighFever;
  }
  function getTempStatusColor(t: number): string {
    if (t < tempNormalLow) return '#3B82F6';
    if (t < tempFeverThreshold) return '#10B981';
    if (t < tempHighFeverThreshold) return '#F59E0B';
    return '#EF4444';
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VitalSync Health Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #FBFBFB;
      color: #1A1A2E;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #3B82F6;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .clinical-review-banner {
      background: #1E3A5F;
      color: #BFDBFE;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-align: center;
      padding: 8px 16px;
      margin: -40px -40px 24px -40px;
      border-bottom: 2px solid #3B82F6;
    }
    .app-name { font-size: 28px; font-weight: 800; color: #3B82F6; letter-spacing: -0.5px; }
    .report-title { font-size: 14px; color: #7A7F8E; margin-top: 4px; }
    .meta-block { text-align: right; font-size: 12px; color: #7A7F8E; line-height: 1.6; }
    .meta-block strong { color: #1A1A2E; }
    .privacy-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: #10B98118; border: 1px solid #10B98140;
      border-radius: 20px; padding: 4px 12px;
      font-size: 11px; font-weight: 700; color: #10B981;
      margin-bottom: 24px;
    }
    .section {
      background: #F0F0F3;
      border: 1px solid #E0E0E6;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .section-header {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 16px;
    }
    .section-dot { width: 10px; height: 10px; border-radius: 50%; }
    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .stat-cell {
      background: white;
      border: 1px solid #E0E0E6;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }
    .stat-value { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .stat-unit { font-size: 10px; color: #7A7F8E; font-weight: 500; }
    .stat-label { font-size: 10px; color: #7A7F8E; margin-top: 2px; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      margin-top: 8px;
    }
    .bp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
    .bp-table th { background: #E0E0E6; padding: 8px 10px; text-align: left; font-weight: 600; }
    .bp-table td { padding: 7px 10px; border-bottom: 1px solid #E0E0E6; }
    .bp-table tr:last-child td { border-bottom: none; }
    .notes-section {
      background: #3B82F615;
      border: 1px solid #3B82F630;
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
    }
    .notes-title { font-size: 12px; font-weight: 700; color: #3B82F6; margin-bottom: 6px; }
    .notes-text { font-size: 12px; color: #1A1A2E; line-height: 1.6; }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #E0E0E6;
      font-size: 10px;
      color: #7A7F8E;
      text-align: center;
      line-height: 1.6;
    }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="health-review-banner">
    ⚕ ${L.patientGeneratedDisclaimer}
  </div>
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="${VITALSYNC_LOGO_B64}" alt="VitalSync" style="width:52px;height:52px;border-radius:12px;flex-shrink:0;" />
      <div>
        <div class="app-name">VitalSync</div>
        <div class="report-title">${L.reportTitle}</div>
        ${clinicianName ? `
        <div style="margin-top:8px;padding:8px 12px;background:#1E3A5F;border-radius:10px;border:1px solid #3B82F630;">
          <div style="font-size:14px;font-weight:800;color:#FFFFFF;letter-spacing:-0.2px;">${clinicianName}</div>
          ${clinicianCredentials ? `<div style="font-size:11px;font-weight:600;color:#60A5FA;margin-top:1px;">${clinicianCredentials}</div>` : ''}
          ${clinicianRole ? `<div style="margin-top:4px;display:inline-block;padding:2px 8px;background:#3B82F620;border:1px solid #3B82F640;border-radius:5px;font-size:10px;font-weight:700;color:#93C5FD;">${clinicianRole}</div>` : ''}
        </div>` : ''}
      </div>
    </div>
    <div class="meta-block">
      <div>${L.period}: <strong>${formatDate(dateRange.start)} — ${formatDate(dateRange.end)}</strong></div>
      ${patientName ? `<div>${L.patient}: <strong>${patientName}</strong></div>` : ''}
      ${doctorName
        ? `<div>${L.forDoctor}: <strong>Dr. ${doctorName}</strong></div>`
        : `<div style="color:#9CA3AF;font-style:italic;font-size:11px;">${L.noPhysicianOnFile}</div>`
      }
      <div>${L.generated}: <strong>${formatDate(new Date())}</strong></div>
    </div>
  </div>

  <div class="privacy-badge">
    ${L.privacyBadge}
  </div>

  <!-- ── Report Summary Card ─────────────────────────────────────────── -->
  ${(() => {
    // Build list of included sections with reading counts
    const sections: { label: string; color: string; count: number; unit: string }[] = [];
    if (config.includeBloodPressure && bpData.length > 0)
      sections.push({ label: L.bloodPressure, color: '#10B981', count: bpData.length, unit: L.readings });
    if (config.includePulse !== false && pulseData.length > 0)
      sections.push({ label: L.heartRateHrv, color: '#F87171', count: pulseData.length, unit: L.readings });
    if (config.includeSpO2 !== false && spo2Data.length > 0)
      sections.push({ label: L.oxygenSaturationTitle, color: '#38BDF8', count: spo2Data.length, unit: L.readings });
    if (config.includeBodyComposition && bodyData.length > 0)
      sections.push({ label: L.bodyComposition, color: '#A78BFA', count: bodyData.length, unit: L.readings });
    if (config.includeSleep && sleepData.length > 0)
      sections.push({ label: L.sleep, color: '#818CF8', count: sleepData.length, unit: L.tracked });
    if (config.includeA1C !== false && sparkGlucoseData.length > 0)
      sections.push({ label: L.projectedA1C, color: '#DC2626', count: sparkGlucoseData.length, unit: L.readings });
    if (config.includeMedications !== false && (config.medications ?? []).length > 0)
      sections.push({ label: L.medicationAdherence, color: '#0EA5E9', count: (config.medications ?? []).length, unit: L.medActive });
    const totalReadings = sections.reduce((s, x) => s + x.count, 0);
    const daysDiffSummary = Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / 86400000);
    const rangeLabel = daysDiffSummary <= 1 ? L.today : daysDiffSummary <= 8 ? L.last7Days : daysDiffSummary <= 32 ? L.last30Days : daysDiffSummary <= 95 ? L.last90Days : `${daysDiffSummary} ${L.tracked}`;
    if (sections.length === 0) return '';
    return `
  <div style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);border:1px solid #334155;border-radius:16px;padding:18px 20px;margin-bottom:18px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <div style="font-size:13px;font-weight:800;color:#F1F5F9;letter-spacing:-0.2px;">${L.reportSummaryTitle}</div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px;">${sections.length} ${L.reportSummarySections}${sections.length !== 1 ? 's' : ''} \u00b7 ${totalReadings.toLocaleString()} ${L.reportSummaryTotalReadings}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;font-weight:700;color:#38BDF8;background:#38BDF820;border:1px solid #38BDF840;border-radius:8px;padding:4px 10px;">${rangeLabel}</div>
        <div style="font-size:10px;color:#64748B;margin-top:3px;">${formatDate(dateRange.start)} \u2014 ${formatDate(dateRange.end)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
      ${sections.map(s => `
      <div style="background:#FFFFFF0D;border:1px solid #FFFFFF15;border-radius:10px;padding:8px 10px;display:flex;align-items:center;gap:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0;"></div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#E2E8F0;">${s.label}</div>
          <div style="font-size:10px;color:#94A3B8;">${s.count} ${s.unit}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
  })()}

  <!-- Statistical Descriptors Summary -->
  ${(bpData.length > 0 || pulseData.length > 0) ? `
  <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px 18px;margin-bottom:16px;">
    <div style="font-size:10px;font-weight:800;color:#1D4ED8;letter-spacing:0.8px;margin-bottom:8px;">${L.statDescriptorsTitle}</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#DBEAFE;"><th style="padding:6px 8px;text-align:left;">${L.statMetric}</th><th style="padding:6px 8px;">${L.statMean}</th><th style="padding:6px 8px;">${L.statRange}</th><th style="padding:6px 8px;">${L.statSd}</th><th style="padding:6px 8px;">n</th></tr></thead>
      <tbody>
        ${bpData.length > 0 ? `
        <tr style="border-bottom:1px solid #BFDBFE;"><td style="padding:5px 8px;font-weight:600;">${L.statMeanSystolic}</td><td style="padding:5px 8px;text-align:center;">${avgFloat(bpData.map(r=>r.systolic ?? 0))} mmHg</td><td style="padding:5px 8px;text-align:center;">${rangeStr(bpData.map(r=>r.systolic ?? 0))} mmHg</td><td style="padding:5px 8px;text-align:center;">${stdDev(bpData.map(r=>r.systolic ?? 0))}</td><td style="padding:5px 8px;text-align:center;">${bpData.length}</td></tr>
        <tr style="border-bottom:1px solid #BFDBFE;"><td style="padding:5px 8px;font-weight:600;">${L.statMeanDiastolic}</td><td style="padding:5px 8px;text-align:center;">${avgFloat(bpData.map(r=>r.diastolic ?? 0))} mmHg</td><td style="padding:5px 8px;text-align:center;">${rangeStr(bpData.map(r=>r.diastolic ?? 0))} mmHg</td><td style="padding:5px 8px;text-align:center;">${stdDev(bpData.map(r=>r.diastolic ?? 0))}</td><td style="padding:5px 8px;text-align:center;">${bpData.length}</td></tr>
        ` : ''}
        ${pulseData.length > 0 ? `
        <tr style="border-bottom:1px solid #BFDBFE;"><td style="padding:5px 8px;font-weight:600;">${L.statHeartRateRange}</td><td style="padding:5px 8px;text-align:center;">${avgFloat(pulseData.map(r=>(r.bpm ?? 0)))} bpm</td><td style="padding:5px 8px;text-align:center;">${rangeStr(pulseData.map(r=>r.bpm ?? 0))} bpm</td><td style="padding:5px 8px;text-align:center;">${stdDev(pulseData.map(r=>(r.bpm ?? 0)))}</td><td style="padding:5px 8px;text-align:center;">${pulseData.length}</td></tr>
        ` : ''}
        ${sleepData.length > 0 ? `
        <tr><td style="padding:5px 8px;font-weight:600;">${L.statSleepDuration}</td><td style="padding:5px 8px;text-align:center;">${avgFloat(sleepData.map(r=>r.totalMinutes/60))} hrs</td><td style="padding:5px 8px;text-align:center;">${rangeStr(sleepData.map(r=>r.totalMinutes/60))} hrs</td><td style="padding:5px 8px;text-align:center;">${stdDev(sleepData.map(r=>r.totalMinutes/60))}</td><td style="padding:5px 8px;text-align:center;">${sleepData.length}</td></tr>
        ` : ''}
      </tbody>
    </table>
    <div style="font-size:9px;color:#64748B;margin-top:6px;font-style:italic;">${L.statSdFootnote}</div>
  </div>
  ` : ''}

  <!-- NeoVital Oscillating Graph -->
  ${config.includeNeoVitalGraph !== false ? (() => {
    // Use independent NeoVital date range (30d or 90d), defaulting to 30d
    const neoRangeDays = config.neoVitalRangeDays ?? 30;
    const neoEnd = new Date();
    const neoStart = new Date();
    neoStart.setDate(neoEnd.getDate() - neoRangeDays);
    const vsAll = filterByDateRange(data.vitalSigns ?? [], neoStart, neoEnd);
    const bsAll = filterByDateRange(data.bloodSugar ?? [], neoStart, neoEnd);
    return `<div id="neovital-graph">${neoVitalOscillatingGraph(vsAll, bsAll, config.weightUnit ?? 'kg', L)}</div>`;
  })() : ''}

  ${config.includeBloodPressure && bpData.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #10B981;"></div>
      <div class="section-title" style="color: #10B981;">${L.bloodPressure}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${sparkBpData.length} ${L.readings}</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #10B981;">${avgSystolic}/${avgDiastolic}</div>
        <div class="stat-unit">mmHg</div>
        <div class="stat-label">${L.averageBp}</div>
        ${bpStatus ? `<div class="badge" style="background: #10B98120; color: #10B981;">${getBPStatusLabel(bpStatus)}</div>` : ''}
      </div>
      <div class="stat-cell">
        <div class="stat-value">${Math.min(...bpData.map(r => r.systolic ?? 0))}/${Math.min(...bpData.map(r => r.diastolic ?? 0))}</div>
        <div class="stat-unit">mmHg</div>
        <div class="stat-label">${L.minimum}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value">${Math.max(...bpData.map(r => r.systolic ?? 0))}/${Math.max(...bpData.map(r => r.diastolic ?? 0))}</div>
        <div class="stat-unit">mmHg</div>
        <div class="stat-label">${L.maximum}</div>
      </div>
    </div>
    ${sparkBpData.length >= 2 ? bpSparkline(sparkBpData as { systolic: number; diastolic: number; timestamp: string }[]) : ''}
    ${neoRangeDays ? `<div style="font-size:9px;color:#64748B;margin-top:4px;font-style:italic;">${L.chartShowsLastDaysTable.replace('{n}', String(neoRangeDays))}</div>` : ''}
    <table class="bp-table" style="margin-top:12px;">
      <thead><tr><th>${L.date}</th><th>${L.systolic}</th><th>${L.diastolic}</th><th>${L.source}</th></tr></thead>
      <tbody>
        ${bpData.slice(-10).map(r => `
          <tr>
            <td>${safeFormatDate(r.timestamp)}</td>
            <td>${r.systolic} mmHg</td>
            <td>${r.diastolic} mmHg</td>
            <td>${r.source === 'averaged' ? L.bpSourceAveraged : r.source === 'Apple Health' ? L.bpSourceAppleHealth : (r.source ?? '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  ${config.includePulse && pulseData.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #EF4444;"></div>
      <div class="section-title" style="color: #EF4444;">${L.heartRateHrv}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${sparkPulseData.length} ${L.readings}</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #EF4444;">${avgBpm}</div>
        <div class="stat-unit">bpm</div>
        <div class="stat-label">${L.avgHeartRate}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value" style="color: #818CF8;">${avgHrv}</div>
        <div class="stat-unit">ms</div>
        <div class="stat-label">${L.avgHrv}</div>
      </div>      <div class="stat-cell">
        <div class="stat-value">${pulseData.length}</div>
        <div class="stat-unit"></div>
        <div class="stat-label">${L.readings}</div>
      </div>
    </div>
    ${sparkPulseData.length >= 2 ? hrSparkline(sparkPulseData as { bpm: number; hrv?: number | null; timestamp: string }[], L) : ''}
    ${sparkHrvData.length >= 2 ? `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:700;color:#818CF8;margin-bottom:6px;letter-spacing:0.3px;">${L.hrvTrendTitle}${neoRangeLabel}</div>
      ${hrvSparkline(sparkHrvData, L)}
    </div>
    <div style="margin-top:10px;">
      ${(() => {
        const hrvVals = sparkHrvData.map(r => r.hrv);
        const hn = hrvVals.length;
        if (hn === 0) return '';
        const hExcellent = hrvVals.filter(v => v >= 50).length;
        const hGood      = hrvVals.filter(v => v >= 35 && v < 50).length;
        const hFair      = hrvVals.filter(v => v >= 20 && v < 35).length;
        const _hLow       = hrvVals.filter(v => v < 20).length;
        const pExcellent = Math.round((hExcellent / hn) * 100);
        const pGood      = Math.round((hGood      / hn) * 100);
        const pFair      = Math.round((hFair      / hn) * 100);
        const pLow       = 100 - pExcellent - pGood - pFair;
        const dominantZone = pExcellent >= 50 ? L.hrvExcellent : pGood >= 30 ? L.hrvGood : pFair >= 30 ? L.hrvFair : L.hrvLow;
        const dominantColor = pExcellent >= 50 ? '#10B981' : pGood >= 30 ? '#818CF8' : pFair >= 30 ? '#F59E0B' : '#EF4444';
        return `
      <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">${L.hrvTimeInOptimalTitle} <span style="font-size:10px;font-weight:500;color:${dominantColor};text-transform:none;">· ${L.hrvMostly} ${dominantZone}</span></div>
      <div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:#E2E8F0;">
        ${pExcellent > 0 ? '<div style="width:' + pExcellent + '%;background:#10B981;height:100%;"></div>' : ''}
        ${pGood      > 0 ? '<div style="width:' + pGood      + '%;background:#818CF8;height:100%;"></div>' : ''}
        ${pFair      > 0 ? '<div style="width:' + pFair      + '%;background:#F59E0B;height:100%;"></div>' : ''}
        ${pLow       > 0 ? '<div style="width:' + pLow       + '%;background:#EF4444;height:100%;"></div>' : ''}
      </div>
      <div style="display:flex;gap:12px;margin-top:4px;font-size:9px;color:#64748B;flex-wrap:wrap;">
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:2px;"></span>≥50ms ${L.hrvExcellent} ${pExcellent}%</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#818CF8;margin-right:2px;"></span>35–49ms ${L.hrvGood} ${pGood}%</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:2px;"></span>20–34ms ${L.hrvFair} ${pFair}%</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:2px;"></span>&lt;20ms ${L.hrvLow} ${pLow}%</span>
      </div>`;
      })()} 
    </div>` : ''}
    ${neoRangeDays ? `<div style="font-size:9px;color:#64748B;margin-top:4px;font-style:italic;">${L.chartShowsLastDaysStats.replace('{n}', String(neoRangeDays))}</div>` : ''}
  </div>
  ` : ''}

  ${config.includePulse && restingHRSamples.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #8B5CF6;"></div>
      <div class="section-title" style="color: #8B5CF6;">${L.restingHeartRate}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${restingHRSamples.length} ${L.tracked}</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: ${restingHRStatusColor};">${latestRestingBpm ?? '—'}</div>
        <div class="stat-unit">bpm</div>
        <div class="stat-label">${L.latestSpO2}</div>
        ${restingHRStatus ? `<div class="badge" style="background: ${restingHRStatusColor}20; color: ${restingHRStatusColor}">${restingHRStatus}</div>` : ''}
      </div>
      <div class="stat-cell">
        <div class="stat-value">${avgRestingBpm ?? '—'}</div>
        <div class="stat-unit">bpm</div>
        <div class="stat-label">${L.averageSpO2}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value">${sevenDayRestingAvg ?? '—'}</div>
        <div class="stat-unit">bpm</div>
        <div class="stat-label">${L.sevenDayAvg}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value" style="color: #10B981;">${minRestingBpm ?? '—'}</div>
        <div class="stat-unit">bpm</div>
        <div class="stat-label">${L.minimum}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value" style="color: #F59E0B;">${maxRestingBpm ?? '—'}</div>
        <div class="stat-unit">bpm</div>
        <div class="stat-label">${L.maximum}</div>
      </div>
    </div>
    <div style="margin-top:12px;padding:10px 12px;background:${restingHRStatusColor}15;border:1px solid ${restingHRStatusColor}30;border-radius:8px;font-size:11px;color:#475569;">
      <div style="font-weight:700;color:#1E293B;margin-bottom:3px;">${L.restingHRAgeAdjusted} · ${restingHRProfileLabel}</div>
      <div>${L.spo2NormalRange}: <strong>${restingHRRef.normalMin}–${restingHRRef.normalMax} bpm</strong> · ${L.restingHRAthleticLabel}: ≤ ${restingHRRef.athleticMax} bpm</div>
      ${latestRestingBpm != null ? `<div style="margin-top:4px;">${L.restingHRLatestReading.replace('{bpm}', String(latestRestingBpm)).replace('{status}', restingHRStatus ?? '').replace('{color}', restingHRStatusColor)}</div>` : ''}
      <div style="margin-top:6px;font-size:9px;color:#94A3B8;">${L.restingHRSource}</div>
    </div>
  </div>
  ` : ''}

  ${config.includeSpO2 !== false && spo2Data.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #34D399;"></div>
      <div class="section-title" style="color: #34D399;">${L.oxygenSaturationTitle}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${sparkSpo2Data.length} ${L.readings}</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #34D399;">${latestSpO2 !== null ? latestSpO2.toFixed(1) : '—'}</div>
        <div class="stat-unit">%</div>
        <div class="stat-label">${L.latestSpO2}</div>
        ${latestSpO2 !== null ? `<div class="badge" style="background: ${getSpO2StatusColor(latestSpO2)}20; color: ${getSpO2StatusColor(latestSpO2)}">${getSpO2Status(latestSpO2)}</div>` : ''}
      </div>
      <div class="stat-cell">
        <div class="stat-value">${avgSpO2}</div>
        <div class="stat-unit">%</div>
        <div class="stat-label">${L.averageSpO2}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value" style="color: ${parseFloat(minSpO2) < 90 ? '#EF4444' : parseFloat(minSpO2) < 95 ? '#F59E0B' : '#34D399'}">${minSpO2}</div>
        <div class="stat-unit">%</div>
        <div class="stat-label">${L.minimumSpO2}</div>
      </div>
    </div>
    ${sparkSpo2Data.length >= 2 ? spo2Sparkline(sparkSpo2Data) : ''}
    ${neoRangeDays ? `<div style="font-size:9px;color:#64748B;margin-top:4px;font-style:italic;">${L.chartShowsLastDaysStatsOnly.replace('{n}', String(neoRangeDays))}</div>` : ''}
    <div style="margin-top:12px;padding:10px 12px;background:#34D39915;border:1px solid #34D39930;border-radius:8px;font-size:11px;color:#7A7F8E;">
      ${L.spo2NormalRange}
    </div>
  </div>
  ` : ''}

  ${config.includeBodyComposition && bodyData.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #0EA5E9;"></div>
      <div class="section-title" style="color: #0EA5E9;">${L.bodyComposition}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${(sparkWeightData ?? bodyData).length} ${L.readings}</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #0EA5E9;">${latestWeightDisplay}</div>
        <div class="stat-unit">${wUnit}</div>
        <div class="stat-label">${L.currentWeight}</div>  </div>
      <div class="stat-cell">
        <div class="stat-value">${latestBody?.bmi ?? '—'}</div>
        <div class="stat-unit"></div>
        <div class="stat-label">${L.bmi}</div>
      </div>
          <div class="stat-cell">
        <div class="stat-value" style="color: ${parseFloat(weightChange ?? '0') < 0 ? '#10B981' : '#F59E0B'}">${weightChange !== null ? (parseFloat(weightChange) >= 0 ? '+' : '') + weightChange : '—'}</div>
        <div class="stat-unit">${wUnit}</div>
        <div class="stat-label">${L.changeThisPeriod}</div>
      </div>
    </div>
    ${sparkWeightData && sparkWeightData.length >= 2 ? weightSparkline(sparkWeightData as { weightKg: number; timestamp: string }[], wUnit) : weightSparkline(bodyData as { weightKg: number; timestamp: string }[], wUnit)}
    ${neoRangeDays ? `<div style="font-size:9px;color:#64748B;margin-top:4px;font-style:italic;">${L.chartShowsLastDaysStats.replace('{n}', String(neoRangeDays))}</div>` : ''}
  </div>
  ` : ''}

  ${config.includeSleep && sleepData.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #8B5CF6;"></div>
      <div class="section-title" style="color: #8B5CF6;">${L.sleep}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${sparkSleepData.length} ${L.tracked}</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #8B5CF6;">${avgSleepHours}</div>
        <div class="stat-unit">hrs</div>
        <div class="stat-label">${L.avgDuration}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value">${avgEfficiency}%</div>
        <div class="stat-unit"></div>
        <div class="stat-label">${L.avgEfficiency}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value">${sleepData.length}</div>
        <div class="stat-unit">${L.tracked}</div>
        <div class="stat-label">${L.tracked}</div>
      </div>
    </div>
    ${sparkSleepData.length >= 1 ? neoSleepSparkline(sparkSleepData as { totalMinutes: number; deepMinutes: number; remMinutes: number; lightMinutes: number; coreMinutes?: number; awakeMinutes: number; efficiency: number; date: string }[]) : ''}
    ${neoRangeDays ? `<div style="font-size:9px;color:#64748B;margin-top:4px;font-style:italic;">${L.chartShowsLastDaysTable.replace('{n}', String(neoRangeDays))}</div>` : ''}
    ${sleepData.length > 0 ? `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:700;color:#8B5CF6;margin-bottom:6px;letter-spacing:0.3px;">${L.sleepDetailTitle}</div>
      <table class="bp-table">
        <thead>
          <tr>
            <th>${L.date}</th>
            <th>${L.sleepColBedtime}</th>
            <th>${L.sleepColWake}</th>
            <th>${L.sleepColHours}</th>
            <th>${L.sleepColEff}</th>
            <th>${L.sleepColDeep}</th>
            <th>${L.sleepColRem}</th>
            <th>${L.sleepColLight}</th>
            <th>${L.sleepColAwake}</th>
          </tr>
        </thead>
        <tbody>
          ${(sleepData as typeof data.sleep)
            .slice(-7)
            .reverse()
            .map((r) => {
              const hrs = (r.totalMinutes / 60).toFixed(1);
              const effColor = r.efficiency >= 85 ? '#22C55E' : r.efficiency >= 70 ? '#F59E0B' : '#EF4444';
              const fmtTime = (iso: string) => {
                try {
                  return safeFormatTime(iso, 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                } catch (_unused) { return '—'; }
              };
              const fmtMins = (m?: number) => m != null && m > 0 ? (m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`) : '—';
              return `<tr>
                <td style="white-space:nowrap;">${safeFormatDate(r.date + 'T12:00:00', 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                <td>${fmtTime(r.bedtime)}</td>
                <td>${fmtTime(r.wakeTime)}</td>
                <td style="font-weight:700;color:#8B5CF6;">${hrs}</td>
                <td><span style="padding:1px 6px;border-radius:5px;font-size:10px;font-weight:700;background:${effColor}20;color:${effColor}">${r.efficiency}%</span></td>
                <td>${fmtMins(r.deepMinutes)}</td>
                <td>${fmtMins(r.remMinutes)}</td>
                <td>${fmtMins(r.coreMinutes)}</td>
                <td>${fmtMins(r.awakeMinutes)}</td>
              </tr>`;
            }).join('')}
        </tbody>
      </table>
      ${sleepData.length > 7 ? `<div style="font-size:10px;color:#7A7F8E;margin-top:5px;">${L.sleepShowingMostRecent.replace('{n}', '7').replace('{total}', String(sleepData.length))}</div>` : ''}
    </div>
    ` : ''}
  </div>
  ` : ''}
  ${(config.includeTemperature !== false) && tempRecords.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #F97316;"></div>
      <div class="section-title" style="color: #F97316;">${L.bodyTemperature}</div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #F97316;">${avgTempVal !== null ? avgTempVal.toFixed(1) : '—'}</div>
        <div class="stat-unit">${tempUnitLabel}</div>
        <div class="stat-label">${L.avgTemperature}</div>
        ${avgTempVal !== null ? `<div class="badge" style="background: ${getTempStatusColor(avgTempVal)}20; color: ${getTempStatusColor(avgTempVal)}">${getTempStatus(avgTempVal)}</div>` : ''}
      </div>
      <div class="stat-cell">
        <div class="stat-value">${minTempVal !== null ? minTempVal.toFixed(1) : '—'}</div>
        <div class="stat-unit">${tempUnitLabel}</div>
        <div class="stat-label">${L.minTemperature}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value">${maxTempVal !== null ? maxTempVal.toFixed(1) : '—'}</div>
        <div class="stat-unit">${tempUnitLabel}</div>
        <div class="stat-label">${L.maxTemperature}</div>
      </div>
    </div>
    <table class="bp-table" style="margin-top:12px;">
      <thead><tr><th>${L.date}</th><th>${L.bodyTemperature} (${tempUnitLabel})</th><th>${L.status}</th></tr></thead>
      <tbody>
        ${(tempRecords as typeof data.vitalSigns).slice(-20).reverse().map((r) => {
          const val = convertTemp(r.temperature!);
          const color = getTempStatusColor(val);
          return `<tr>
            <td>${safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td style="font-weight:700;color:#F97316;">${val.toFixed(1)}</td>
            <td><span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;background:${color}20;color:${color}">${getTempStatus(val)}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${tempRecords.length > 20 ? `<div style="font-size:10px;color:#7A7F8E;margin-top:6px;">${L.showingMostRecentReadings.replace('{n}', '20').replace('{total}', String(tempRecords.length))}</div>` : ''}
    <div style="margin-top:12px;padding:10px 12px;background:#F9731615;border:1px solid #F9731630;border-radius:8px;font-size:11px;color:#7A7F8E;">
      ${L.tempNormalRange.replace('{range}', tempUnit === 'F' ? '97.0–100.3°F' : '36.1–37.9°C').replace('{fever}', tempUnit === 'F' ? '≥100.4°F' : '≥38.0°C').replace('{highFever}', tempUnit === 'F' ? '≥103°F' : '≥39.4°C')}
    </div>
  </div>
  ` : ''}


  ${(() => {
    if (config.includeSodiumDASH === false) return '';
    const sodiumRecords = filterByDateRange(data.sodiumIntake ?? [], dateRange.start, dateRange.end) as typeof data.sodiumIntake;
    if (!sodiumRecords || sodiumRecords.length === 0) return '';

    // 30-day sodium table (most recent 30 entries)
    const recent = sodiumRecords.slice(-30).reverse();
    const totalNa = sodiumRecords.reduce((s, r) => s + r.sodiumMg, 0);
    const avgNa = Math.round(totalNa / sodiumRecords.length);
    const totalK = sodiumRecords.reduce((s, r) => s + (r.potassiumMg ?? 0), 0);
    const avgK = sodiumRecords.filter(r => r.potassiumMg).length > 0
      ? Math.round(totalK / sodiumRecords.filter(r => r.potassiumMg).length)
      : null;
    const nakRatio = avgK ? (avgNa / avgK).toFixed(2) : null;

    // Sodium sensitivity insight from correlation engine
    const insights = runCorrelationEngine(data);
    const sodiumInsight = insights.find(i => i.category === 'sodium-sensitivity');
    const nakInsight = insights.find(i => i.category === 'na-k-ratio');

    return `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background: #06B6D4;"></div>
      <div class="section-title" style="color: #06B6D4;">${L.dietarySodiumTitle}</div>
    </div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-value" style="color: #06B6D4;">${avgNa.toLocaleString()}</div>
        <div class="stat-unit">mg/day</div>
        <div class="stat-label">${L.avgSodium}</div>
        <div class="badge" style="background: ${avgNa > 2300 ? '#EF444420' : avgNa > 1500 ? '#F59E0B20' : '#10B98120'}; color: ${avgNa > 2300 ? '#EF4444' : avgNa > 1500 ? '#F59E0B' : '#10B981'}">${avgNa > 2300 ? L.sodiumAboveFDA : avgNa > 1500 ? L.sodiumAboveAHA : L.sodiumWithinAHA}</div>
      </div>
      ${avgK ? `
      <div class="stat-cell">
        <div class="stat-value" style="color: #10B981;">${avgK.toLocaleString()}</div>
        <div class="stat-unit">mg/day</div>
        <div class="stat-label">${L.avgPotassium}</div>
        <div class="badge" style="background: ${avgK >= 3500 ? '#10B98120' : '#F59E0B20'}; color: ${avgK >= 3500 ? '#10B981' : '#F59E0B'}">${avgK >= 3500 ? L.potassiumMeetsWHO : L.potassiumBelowWHO}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-value" style="color: ${parseFloat(nakRatio ?? '99') < 2 ? '#10B981' : parseFloat(nakRatio ?? '99') < 3.5 ? '#F59E0B' : '#EF4444'}">${nakRatio}</div>
        <div class="stat-unit">Na:K ratio</div>
        <div class="stat-label">${L.intersaltIndex}</div>
        <div class="badge" style="background: ${parseFloat(nakRatio ?? '99') < 2 ? '#10B98120' : parseFloat(nakRatio ?? '99') < 3.5 ? '#F59E0B20' : '#EF444420'}; color: ${parseFloat(nakRatio ?? '99') < 2 ? '#10B981' : parseFloat(nakRatio ?? '99') < 3.5 ? '#F59E0B' : '#EF4444'}">${parseFloat(nakRatio ?? '99') < 2 ? L.nakCardioprotective : parseFloat(nakRatio ?? '99') < 3.5 ? L.nakBorderline : L.nakElevatedRisk}</div>
      </div>` : `
      <div class="stat-cell">
        <div class="stat-value">${sodiumRecords.length}</div>
        <div class="stat-unit">${L.medEntriesLabel}</div>
        <div class="stat-label">${L.tracked}</div>
      </div>`}
    </div>

    ${sodiumInsight ? `
    <div style="margin-top:16px;padding:12px;background:${sodiumInsight.severity === 'alert' ? '#EF444415' : '#F59E0B15'};border:1px solid ${sodiumInsight.severity === 'alert' ? '#EF444440' : '#F59E0B40'};border-radius:8px;">
      <div style="font-size:11px;font-weight:700;color:${sodiumInsight.severity === 'alert' ? '#EF4444' : '#F59E0B'};margin-bottom:6px;">${sodiumInsight.severity === 'alert' ? '⚠' : '◈'} ${L.sodiumSensitivityDetected}</div>
      <div style="font-size:12px;color:#1A1A2E;line-height:1.6;margin-bottom:8px;">${sodiumInsight.hypothesis}</div>
      <div style="font-size:11px;font-weight:700;color:#06B6D4;margin-bottom:4px;">${L.personalSuggestion}</div>
      <div style="font-size:12px;color:#1A1A2E;line-height:1.6;">${sodiumInsight.clinicalSuggestion}</div>
      <div style="font-size:10px;color:#7A7F8E;margin-top:6px;">${L.evidenceLevel}: ${sodiumInsight.evidenceLabel} · ${L.basedOnDataPoints.replace('{n}', String(sodiumInsight.dataPoints))}</div>
    </div>` : ''}

    ${nakInsight ? `
    <div style="margin-top:12px;padding:12px;background:#8B5CF615;border:1px solid #8B5CF640;border-radius:8px;">
      <div style="font-size:11px;font-weight:700;color:#8B5CF6;margin-bottom:6px;">⚖️ ${L.nakRatioAnalysis}</div>
      <div style="font-size:12px;color:#1A1A2E;line-height:1.6;margin-bottom:8px;">${nakInsight.hypothesis}</div>
      <div style="font-size:11px;font-weight:700;color:#8B5CF6;margin-bottom:4px;">${L.personalSuggestion}</div>
      <div style="font-size:12px;color:#1A1A2E;line-height:1.6;">${nakInsight.clinicalSuggestion}</div>
      <div style="font-size:10px;color:#7A7F8E;margin-top:6px;">${L.evidenceLevel}: ${nakInsight.evidenceLabel} · ${L.basedOnDataPoints.replace('{n}', String(nakInsight.dataPoints))}</div>
    </div>` : ''}

    <table class="bp-table" style="margin-top:16px;">
      <thead><tr><th>${L.date}</th><th>${L.sodiumMg}</th><th>${L.potassiumMg}</th><th>Na:K</th><th>${L.mealContext}</th><th>${L.foodDescription}</th></tr></thead>
      <tbody>
        ${recent.map(r => {
          const nak = r.potassiumMg ? (r.sodiumMg / r.potassiumMg).toFixed(2) : '—';
          const nakColor = r.potassiumMg ? (r.sodiumMg / r.potassiumMg < 2 ? '#10B981' : r.sodiumMg / r.potassiumMg < 3.5 ? '#F59E0B' : '#EF4444') : '#7A7F8E';
          return `<tr>
            <td>${safeFormatDate(r.timestamp, 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td>${r.sodiumMg.toLocaleString()}</td>
            <td>${r.potassiumMg ? r.potassiumMg.toLocaleString() : '—'}</td>
            <td style="color:${nakColor};font-weight:700;">${nak}</td>
            <td>${r.mealContext.charAt(0).toUpperCase() + r.mealContext.slice(1)}</td>
            <td>${r.foodDescription ?? '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${sodiumRecords.length > 30 ? `<div style="font-size:10px;color:#7A7F8E;margin-top:6px;">${L.showingMostRecentEntries.replace('{n}', '30').replace('{total}', String(sodiumRecords.length))}</div>` : ''}
  </div>`;
  })()}


  ${notes ? `
  <div class="notes-section">
    <div class="notes-title">${L.patientNotes}</div>
    <div class="notes-text">${notes}</div>
  </div>
  ` : ''}

  ${(() => {
    // ── Projected A1C Section (Enhanced) ─────────────────────────────────────
    if (config.includeA1C === false) return '';
    const bsRecords = (data.bloodSugar ?? []).filter(r => {
      const d = new Date(r.timestamp);
      return d >= dateRange.start && d <= dateRange.end;
    });
    if (bsRecords.length === 0) return '';

    const MMOL_FACTOR = 18.01;
    // Use glucoseMgDl; fall back to mmol conversion if needed
    const mgDlValues = bsRecords.map(r => r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * MMOL_FACTOR);
    const avgGlucose = mgDlValues.reduce((s, v) => s + v, 0) / mgDlValues.length;
    const avgGlucoseMmol = avgGlucose / MMOL_FACTOR;
    const eA1C = Math.round(((avgGlucose + 46.7) / 28.7) * 10) / 10;

    // Risk category
    const a1cColor = eA1C < 5.7 ? '#10B981' : eA1C < 6.5 ? '#F59E0B' : eA1C < 8.0 ? '#EF4444' : '#DC2626';
    const a1cLabel = eA1C < 5.7 ? L.spo2StatusNormal : eA1C < 6.5 ? L.glucosePreDiabetes : eA1C < 8.0 ? L.glucoseDiabetesRange : L.glucoseSignificantlyElevated;
    const a1cDesc = eA1C < 5.7
      ? L.glucoseBelowPreDiabetes
      : eA1C < 6.5
      ? L.glucoseElevatedLifestyle
      : eA1C < 8.0
      ? L.glucoseMeetsDiabetes
      : L.glucoseWellAboveTarget;
    const daysDiff = Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));

    // Per-context breakdown
    const ctxList = ['fasting', 'post-meal', 'random', 'bedtime'] as const;
    const contextRows = ctxList.map(ctx => {
      const ctxRecs = bsRecords.filter(r => r.context === ctx);
      if (ctxRecs.length === 0) return null;
      const ctxAvg = ctxRecs.reduce((s, r) => s + (r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * MMOL_FACTOR), 0) / ctxRecs.length;
      return { ctx, avg: Math.round(ctxAvg), count: ctxRecs.length };
    }).filter(Boolean) as { ctx: string; avg: number; count: number }[];

    // Postprandial spike summary (post-meal readings >=20% above overall avg)
    const postMealRecs = bsRecords.filter(r => r.context === 'post-meal');
    const spikes = postMealRecs.filter(r => {
      const v = r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * MMOL_FACTOR;
      return ((v - avgGlucose) / avgGlucose) * 100 >= 20;
    });
    const spikeCount = spikes.length;
    const worstSpike = spikeCount > 0
      ? Math.max(...spikes.map(r => r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * MMOL_FACTOR))
      : null;

    // 30-day A1C trend from snapshots
    const snapshots = config.a1cSnapshots ?? [];
    const validSnaps = snapshots.filter(s => s.a1c > 0).sort((a, b) => a.date.localeCompare(b.date));
    let trendLabel = '';
    let trendColor = '#64748B';
    if (validSnaps.length >= 4) {
      const first = validSnaps[0].a1c;
      const last = validSnaps[validSnaps.length - 1].a1c;
      const delta = last - first;
      if (delta < -0.1) { trendLabel = `${L.a1cTrendImproving} (${delta.toFixed(1)}% over 30d)`; trendColor = '#10B981'; }
      else if (delta > 0.1) { trendLabel = `${L.a1cTrendRising} (+${delta.toFixed(1)}% over 30d)`; trendColor = '#EF4444'; }
      else { trendLabel = L.a1cTrendStable; trendColor = '#F59E0B'; }
    }

    return `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background:#DC2626;"></div>
      <div class="section-title" style="color:#DC2626;">${L.projectedA1C}${neoRangeLabel}<span style="font-size:10px;font-weight:500;color:#64748B;margin-left:8px;">· ${bsRecords.length} ${L.readings}</span></div>
    </div>

    ${(() => {
      // Pre-compute TIR for inline table row
      const _tirVals2 = bsRecords.map(r => r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * 18.01);
      const _tirTotal2 = _tirVals2.length;
      const _tirHigh2 = _tirTotal2 > 0 ? _tirVals2.filter(v => v >= 180).length : 0;
      const _tirLow2  = _tirTotal2 > 0 ? _tirVals2.filter(v => v < 70).length : 0;
      const _pctHigh2 = _tirTotal2 > 0 ? Math.round((_tirHigh2 / _tirTotal2) * 100) : 0;
      const _pctLow2  = _tirTotal2 > 0 ? Math.round((_tirLow2  / _tirTotal2) * 100) : 0;
      const _pctIn2   = _tirTotal2 > 0 ? 100 - _pctHigh2 - _pctLow2 : 0;
      const _tirColor2 = _pctIn2 >= 70 ? '#10B981' : _pctIn2 >= 50 ? '#F59E0B' : '#EF4444';
      return `
    <div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:16px;">
      <div style="text-align:center;padding:16px 24px;background:${a1cColor}12;border:2px solid ${a1cColor}40;border-radius:12px;min-width:110px;">
        <div style="font-size:40px;font-weight:900;color:${a1cColor};line-height:1;">${eA1C}%</div>
        <div style="font-size:11px;font-weight:700;color:${a1cColor};margin-top:4px;">${a1cLabel}</div>
        ${trendLabel ? `<div style="margin-top:8px;padding:3px 8px;background:${trendColor}18;border:1px solid ${trendColor}40;border-radius:6px;font-size:10px;font-weight:700;color:${trendColor};">${trendLabel}</div>` : ''}
      </div>
      <table style="flex:1;border-collapse:collapse;font-size:12px;">
        <tr><td style="padding:5px 8px;color:#64748B;width:55%;">${L.a1cAvgGlucose}</td><td style="padding:5px 8px;font-weight:700;color:#1E293B;">${Math.round(avgGlucose)} mg/dL</td></tr>
        <tr style="background:#F8FAFC;"><td style="padding:5px 8px;color:#64748B;">${L.a1cAvgGlucoseMmol}</td><td style="padding:5px 8px;font-weight:700;color:#1E293B;">${avgGlucoseMmol.toFixed(1)} mmol/L</td></tr>
        <tr><td style="padding:5px 8px;color:#64748B;">${L.a1cReadings}</td><td style="padding:5px 8px;font-weight:700;color:#1E293B;">${bsRecords.length}</td></tr>
        ${_tirTotal2 > 0 ? `<tr style="background:#F8FAFC;"><td style="padding:5px 8px;color:#64748B;">${L.glucoseTimeInRange}</td><td style="padding:5px 8px;font-weight:700;color:${_tirColor2};">${_pctIn2}% ${L.glucoseInRange} <span style="font-size:10px;color:#64748B;font-weight:400;">(${_pctHigh2}% ${L.glucoseAbove} · ${_pctLow2}% ${L.glucoseBelow})</span></td></tr>` : ''}
        <tr${_tirTotal2 > 0 ? '' : ' style="background:#F8FAFC;"'}><td style="padding:5px 8px;color:#64748B;">${L.a1cWindow}</td><td style="padding:5px 8px;font-weight:700;color:#1E293B;">${daysDiff} days</td></tr>
        <tr${_tirTotal2 > 0 ? ' style="background:#F8FAFC;"' : ''}><td style="padding:5px 8px;color:#64748B;">${L.a1cRiskCategory}</td><td style="padding:5px 8px;font-weight:700;color:${a1cColor};">${a1cLabel}</td></tr>
      </table>
    </div>`;
    })()}

    <div style="padding:10px 14px;background:${a1cColor}10;border-left:3px solid ${a1cColor};border-radius:0 8px 8px 0;font-size:11px;color:#475569;margin-bottom:14px;line-height:1.5;">
      ${a1cDesc}
    </div>

    ${(() => {
      // ── Time in Range horizontal bar (matching dashboard blood glucose tile) ────────────────────────────────
      // Thresholds: High ≥ 180 mg/dL, Low < 70 mg/dL, In range 70–179 mg/dL
      const HIGH_MG = 180, LOW_MG = 70;
      const tirVals = bsRecords.map(r => r.glucoseMgDl > 0 ? r.glucoseMgDl : r.glucoseMmol * 18.01);
      const tirTotal = tirVals.length;
      const tirHigh = tirTotal > 0 ? tirVals.filter(v => v >= HIGH_MG).length : 0;
      const tirLow  = tirTotal > 0 ? tirVals.filter(v => v < LOW_MG).length : 0;
      const pctHigh = tirTotal > 0 ? Math.round((tirHigh / tirTotal) * 100) : 0;
      const pctLow  = tirTotal > 0 ? Math.round((tirLow  / tirTotal) * 100) : 0;
      const pctIn   = 100 - pctHigh - pctLow;
      const goalMet = pctIn >= 70;
      if (tirTotal === 0) return '';
      return `
    <div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">${L.glucoseTimeInRange}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="padding:3px 10px;background:${goalMet ? '#10B98118' : '#F59E0B18'};border:1px solid ${goalMet ? '#10B98140' : '#F59E0B40'};border-radius:20px;font-size:10px;font-weight:700;color:${goalMet ? '#10B981' : '#F59E0B'};">&#10003; ${L.glucoseGoal70}</div>
          <div style="font-size:10px;color:#64748B;">${tirTotal} ${L.readings}</div>
        </div>
      </div>
      <div style="height:14px;border-radius:7px;overflow:hidden;display:flex;background:#E2E8F0;">
        ${pctHigh > 0 ? `<div style="width:${pctHigh}%;background:#EF4444;height:100%;"></div>` : ''}
        ${pctIn   > 0 ? `<div style="width:${pctIn}%;background:#F59E0B;height:100%;"></div>` : ''}
        ${pctLow  > 0 ? `<div style="width:${pctLow}%;background:#10B981;height:100%;"></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:10px;">
        <div style="color:#EF4444;font-weight:600;">${pctHigh}% ${L.glucoseAbove}</div>
        <div style="color:#F59E0B;font-weight:700;">${pctIn}% ${L.glucoseInRange}</div>
        <div style="color:#10B981;font-weight:600;">${pctLow}% ${L.glucoseBelow}</div>
      </div>
      <div style="display:flex;gap:14px;margin-top:5px;font-size:9px;color:#64748B;">
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:3px;"></span>${L.glucoseHighLabel}</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:3px;"></span>${L.glucoseLowLabel}</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:3px;"></span>${L.glucoseInRangeLabel}</span>
      </div>
    </div>`;
    })()}

    ${(() => {
      // Use neoVitalRangeDays-filtered glucose data for the sparkline if available
      const sparkGs = sparkGlucoseData && sparkGlucoseData.length >= 2
        ? sparkGlucoseData as { glucoseMgDl: number; glucoseMmol: number; context?: string; timestamp: string }[]
        : bsRecords as { glucoseMgDl: number; glucoseMmol: number; context?: string; timestamp: string }[];
      return glucoseSparkline(sparkGs, config.glucoseUnit ?? 'mg/dL')
        + (neoRangeDays ? `<div style="font-size:9px;color:#64748B;margin-top:4px;font-style:italic;">${L.chartShowsLastDaysStats.replace('{n}', String(neoRangeDays))}</div>` : '');
    })()}

    ${contextRows.length > 0 ? `
    <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;margin-top:14px;">${L.a1cContextBreakdown}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#F1F5F9;">
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.source}</th>
        <th style="padding:6px 8px;text-align:right;color:#64748B;font-weight:600;">${L.a1cAvgGlucose}</th>
        <th style="padding:6px 8px;text-align:right;color:#64748B;font-weight:600;">${L.a1cAvgGlucoseMmol}</th>
        <th style="padding:6px 8px;text-align:right;color:#64748B;font-weight:600;">${L.readings}</th>
      </tr></thead>
      <tbody>
        ${contextRows.map((row, i) => `
        <tr style="${i % 2 === 1 ? 'background:#F8FAFC;' : ''}">
          <td style="padding:5px 8px;color:#1E293B;text-transform:capitalize;">${row.ctx}</td>
          <td style="padding:5px 8px;text-align:right;font-weight:700;color:#1E293B;">${row.avg}</td>
          <td style="padding:5px 8px;text-align:right;color:#64748B;">${(row.avg / MMOL_FACTOR).toFixed(1)}</td>
          <td style="padding:5px 8px;text-align:right;color:#64748B;">${row.count}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}

    ${spikeCount > 0 ? `
    <div style="padding:10px 14px;background:#EF444412;border:1px solid #EF444440;border-radius:8px;font-size:11px;color:#991B1B;margin-bottom:14px;">
      <div style="font-weight:700;margin-bottom:4px;">&#9889; ${L.a1cPostprandialSpike}</div>
      ${L.glucoseSpikeCount.replace('{n}', String(spikeCount))}
      ${worstSpike ? `${L.glucoseSpikePeak.replace('{mgdl}', String(Math.round(worstSpike))).replace('{mmol}', (worstSpike / MMOL_FACTOR).toFixed(1))}` : ''}
      ${L.glucoseSpikeRecommendation}
      <span style="font-style:italic;color:#64748B;"> — ${L.glucoseSpikeReference}</span>
    </div>` : ''}

    ${validSnaps.length >= 2 ? `
    <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${L.a1cTrend} (${validSnaps.length} snapshots)</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;">
      <thead><tr style="background:#F1F5F9;">
        <th style="padding:5px 8px;text-align:left;color:#64748B;font-weight:600;">${L.date}</th>
        <th style="padding:5px 8px;text-align:right;color:#64748B;font-weight:600;">${L.projectedA1C} (%)</th>
        <th style="padding:5px 8px;text-align:right;color:#64748B;font-weight:600;">${L.a1cRiskCategory}</th>
      </tr></thead>
      <tbody>
        ${validSnaps.slice(-14).map((snap, i) => {
          const sc = snap.a1c < 5.7 ? '#10B981' : snap.a1c < 6.5 ? '#F59E0B' : snap.a1c < 8.0 ? '#EF4444' : '#DC2626';
          const sl = snap.a1c < 5.7 ? L.spo2StatusNormal : snap.a1c < 6.5 ? L.glucosePreDiabetes : snap.a1c < 8.0 ? L.glucoseDiabetesRange : L.glucoseHighLabel;
          return `<tr style="${i % 2 === 1 ? 'background:#F8FAFC;' : ''}">
            <td style="padding:4px 8px;color:#475569;">${snap.date}</td>
            <td style="padding:4px 8px;text-align:right;font-weight:700;color:${sc};">${snap.a1c}%</td>
            <td style="padding:4px 8px;text-align:right;font-size:10px;color:${sc};font-weight:600;">${sl}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : ''}

    <div style="font-size:11px;color:#7A7F8E;margin-bottom:6px;font-style:italic;">${L.a1cFormula} &nbsp;|&nbsp; mmol/L \u2192 mg/dL: \u00d7 18.01</div>
    <div style="padding:10px 14px;background:#F59E0B10;border:1px solid #F59E0B40;border-radius:8px;font-size:11px;color:#92400E;">&#9888; ${L.a1cDisclaimer}</div>

    <!-- Glucose zone legend -->
    ${(() => {
      const isMmol = (config.glucoseUnit ?? 'mg/dL') === 'mmol/L';
      const highLabel = isMmol ? '&gt;10.0 mmol/L' : '&gt;180 mg/dL (10.0 mmol/L)';
      const targetLabel = isMmol ? '3.9\u20137.2 mmol/L' : '70\u2013130 mg/dL (3.9\u20137.2 mmol/L)';
      // adaRef is now handled via L.glucoseAdaNote (unused variable kept for reference)
      const adaRef = isMmol
        ? 'ADA Standards of Care 2024 \u00a76.6 \u2014 Pre-meal target 4.4\u20137.2 mmol/L; 2h post-meal &lt;10.0 mmol/L'
        : L.glucoseAdaNote;
      return `
    <div style="margin-top:12px;padding:10px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
      <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${L.glucoseZoneReference}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:12px;height:12px;border-radius:50%;background:#EF4444;"></div>
          <span style="font-size:11px;color:#475569;"><strong style="color:#EF4444;">${L.glucoseHighLabel}</strong> ${highLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:12px;height:12px;border-radius:50%;background:#F59E0B;"></div>
          <span style="font-size:11px;color:#475569;"><strong style="color:#D97706;">${L.glucoseTargetLabel}</strong> ${targetLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:12px;height:12px;border-radius:50%;background:#DC2626;"></div>
          <span style="font-size:11px;color:#475569;"><strong style="color:#DC2626;">${L.glucoseOtherLabel}</strong></span>
        </div>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#94A3B8;font-style:italic;">${L.glucoseAdaNote}</div>
    </div>`;
    })()}
  </div>`;
  })()}

  ${(() => {
    // ── Condition Timeline Section ─────────────────────────────────────────
    if (config.includeConditionTimeline === false) return '';
    const medHx = data.medicalHistory ?? [];
    const surgHx = data.surgicalHistory ?? [];
    if (medHx.length === 0 && surgHx.length === 0) return '';
    const statusColor = (s: string) => s === 'active' ? '#EF4444' : s === 'resolved' ? '#10B981' : s === 'chronic' ? '#F59E0B' : '#64748B';
    return `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background:#8B5CF6;"></div>
      <div class="section-title" style="color:#8B5CF6;">${L.conditionTimeline}</div>
    </div>
    ${medHx.length > 0 ? `
    <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${L.medicalHistory} (${medHx.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <thead><tr style="background:#F1F5F9;">
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.conditionColCondition}</th>
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.conditionColIcd10}</th>
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.conditionStatus}</th>
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.conditionDiagnosed}</th>
      </tr></thead>
      <tbody>${medHx.map((r, i) => {
        const linkedLabs = (data.labResults ?? []).filter(lr => lr.linkedConditionId === r.id);
        return `
        <tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}">
          <td style="padding:6px 8px;font-weight:600;color:#1E293B;">${r.condition}${r.treatingPhysician ? `<div style="font-size:10px;color:#94A3B8;margin-top:2px;">Dr. ${r.treatingPhysician}</div>` : ''}</td>
          <td style="padding:6px 8px;color:#64748B;font-family:monospace;">${r.icdCode ?? '—'}</td>
          <td style="padding:6px 8px;"><span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${statusColor(r.status)}20;color:${statusColor(r.status)}">${r.status.toUpperCase()}</span></td>
          <td style="padding:6px 8px;color:#64748B;">${r.diagnosedDate ? safeFormatDate(r.diagnosedDate, 'en-US', { month: 'short', year: 'numeric' }) : '—'}</td>
        </tr>
        ${linkedLabs.length > 0 ? `<tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}"><td colspan="4" style="padding:4px 8px 10px 24px;">
          <div style="font-size:10px;font-weight:700;color:#8B5CF6;margin-bottom:4px;">🔗 ${L.linkedLabResults} (${linkedLabs.length})</div>
          <table style="width:100%;border-collapse:collapse;font-size:10px;">
            <thead><tr style="background:#F5F3FF;"><th style="padding:3px 6px;text-align:left;color:#7C3AED;">${L.labColPanel}</th><th style="padding:3px 6px;text-align:left;color:#7C3AED;">${L.date}</th><th style="padding:3px 6px;text-align:left;color:#7C3AED;">${L.labColLab}</th><th style="padding:3px 6px;text-align:left;color:#7C3AED;">${L.labColAbnormal}</th></tr></thead>
            <tbody>${linkedLabs.slice(0, 5).map(lr => {
              const abnormals = getAbnormalAnalytes(lr).map(a => `${a.id}: ${a.value}`).join(', ');
              return `<tr><td style="padding:3px 6px;font-weight:600;color:#4C1D95;">${lr.panel}</td><td style="padding:3px 6px;color:#64748B;">${safeFormatDate(lr.timestamp, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td><td style="padding:3px 6px;color:#64748B;">${lr.labName ?? '—'}</td><td style="padding:3px 6px;color:#EF4444;">${abnormals || L.labAllNormal}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </td></tr>` : ''}`;
      }).join('')}
      </tbody>
    </table>` : ''}
    ${surgHx.length > 0 ? `
    <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${L.surgicalHistory} (${surgHx.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#F1F5F9;">
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.conditionColProcedure}</th>
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.conditionColCpt}</th>
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.procedureDate}</th>
        <th style="padding:6px 8px;text-align:left;color:#64748B;font-weight:600;">${L.procedureSurgeon}</th>
      </tr></thead>
      <tbody>${surgHx.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}">
          <td style="padding:6px 8px;font-weight:600;color:#1E293B;">${r.procedure}${r.facility ? `<div style="font-size:10px;color:#94A3B8;margin-top:2px;">${r.facility}</div>` : ''}</td>
          <td style="padding:6px 8px;color:#64748B;font-family:monospace;">${r.cptCode ?? '—'}</td>
          <td style="padding:6px 8px;color:#64748B;">${r.surgeryDate ? safeFormatDate(r.surgeryDate, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
          <td style="padding:6px 8px;color:#64748B;">${r.surgeon ?? '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}
  </div>`;
  })()}

  ${(() => {
    // ── Meal IQ Insights Section ───────────────────────────────────────────
    if (config.includeMealIQ === false) return '';
    const mealIQRecords = (data.mealIQAnalyzes ?? []).filter(r => {
      const d = new Date(r.analyzedAt);
      return d >= dateRange.start && d <= dateRange.end;
    }).sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0));
    return `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background:#6366F1;"></div>
      <div class="section-title" style="color:#6366F1;">${L.mealIQInsights} (${mealIQRecords.length})</div>
    </div>
    <div style="font-size:11px;color:#7A7F8E;margin-bottom:12px;">${L.mealIQDisclaimer}</div>
    ${mealIQRecords.length === 0 ? `<div style="font-size:12px;color:#94A3B8;font-style:italic;">${L.mealIQNoData}</div>` : mealIQRecords.slice(0, 10).map((r, idx) => `
    <div style="margin-bottom:${idx < Math.min(mealIQRecords.length, 10) - 1 ? '12' : '0'}px;padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;border-left:3px solid #6366F1;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:12px;font-weight:700;color:#1E293B;">${r.mealLabel ?? 'Meal'}</div>
        <div style="font-size:11px;color:#94A3B8;">${safeFormatDate(r.analyzedAt, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
      <div style="font-size:12px;color:#334155;line-height:1.6;">${r.insight}</div>
      ${r.bpDeltaSystolic != null ? `<div style="font-size:11px;color:#EF4444;margin-top:4px;">↑ BP +${r.bpDeltaSystolic} mmHg systolic after meal</div>` : ''}
      ${r.glucoseDeltaMgDl != null ? `<div style="font-size:11px;color:#F59E0B;margin-top:2px;">↑ Glucose +${r.glucoseDeltaMgDl} mg/dL after meal</div>` : ''}
    </div>`).join('')}
  </div>`;
  })()}

  ${(() => {
    // ── Empty state: shown when no vitals data exists for the selected period ──
    const hasAnyData =
      (config.includeBloodPressure && bpData.length > 0) ||
      (config.includePulse && pulseData.length > 0) ||
      (config.includeBodyComposition && bodyData.length > 0) ||
      (config.includeSleep && sleepData.length > 0) ||
      ((config.includeTemperature !== false) && tempRecords.length > 0);
    if (hasAnyData) return '';
    return `
  <div style="margin: 40px 0; padding: 40px 32px; background: #F8FAFC; border: 1.5px dashed #CBD5E1; border-radius: 16px; text-align: center;">
    <div style="font-size: 40px; margin-bottom: 16px;">📋</div>
    <div style="font-size: 20px; font-weight: 800; color: #1E293B; margin-bottom: 10px;">${L.noDataForPeriod}</div>
    <div style="font-size: 13px; color: #64748B; line-height: 1.7; max-width: 380px; margin: 0 auto;">${L.noDataForPeriodSub}</div>
  </div>`;
  })()}

  ${(() => {
    // ── Immunization Records section ────────────────────────────────────────────────────
    const immunizations = data.immunizations ?? [];
    if (immunizations.length === 0) return '';
    const rows = immunizations.map(r => {
      const doseLabel = r.doseNumber
        ? `${r.doseNumber}${r.seriesTotal ? `/${r.seriesTotal}` : ''}`
        : '—';
      const nextDose = r.nextDoseDate
        ? safeFormatDate(r.nextDoseDate, 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';
      const dateGiven = safeFormatDate(r.dateAdministered, 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const overdueFlag = r.nextDoseDate && new Date(r.nextDoseDate).getTime() < Date.now()
        ? `<span style="color:#EF4444;font-weight:700;"> ${L.vaccineOverdue}</span>` : '';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">
          <span style="font-weight:600;">${r.vaccineName}</span>
          ${r.vaccineType ? `<br><span style="color:#64748B;font-size:11px;">${r.vaccineType}</span>` : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${dateGiven}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${doseLabel}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${r.lotNumber ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${r.manufacturer ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${r.administeredBy ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${nextDose}${overdueFlag}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;">${r.reactions ?? '—'}</td>
      </tr>`;
    }).join('');
    return `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background:#0D9488;"></div>
      <div class="section-title" style="color:#0D9488;">💉 ${L.immunizationRecordsTitle}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#F0FDFA;">
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColVaccine}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColDateGiven}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColDose}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColLotNum}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColManufacturer}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColAdministeredBy}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColNextDue}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#0D9488;border-bottom:2px solid #99F6E4;">${L.vaccineColReactions}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
  })()}

  ${(() => {
    // ── Medication Adherence Section ───────────────────────────────────────
    if (config.includeMedications === false) return '';
    const meds: Medication[] = (data.medications ?? []);
    if (meds.length === 0) return '';

    // Compute adherence stats for each medication
    function getMedAdherence(med: Medication): number {
      const dailyCount = med.scheduleTimes?.length ?? 1;
      if (dailyCount === 0) return 1;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const recentTaken = med.doseLogs.filter(
        (l) => l.status === 'taken' && new Date(l.loggedAt) >= cutoff,
      );
      const expected = dailyCount * 30;
      return Math.min(1, recentTaken.length / expected);
    }

    function getMedMissedCount(med: Medication): number {
      return med.doseLogs.filter((l) => l.status === 'missed').length;
    }

    function getMedLastTaken(med: Medication): string {
      const taken = med.doseLogs
        .filter((l) => l.status === 'taken')
        .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
      if (taken.length === 0) return '—';
      return safeFormatDate(taken[0].loggedAt, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function adherenceColor(rate: number): string {
      if (rate >= 0.9) return '#10B981';
      if (rate >= 0.7) return '#F59E0B';
      return '#EF4444';
    }

    const rows = meds.map((med, i) => {
      const adherence = getMedAdherence(med);
      const missed = getMedMissedCount(med);
      const lastTaken = getMedLastTaken(med);
      const pct = Math.round(adherence * 100);
      const color = adherenceColor(adherence);
      const routeLabel = med.route ? (ROUTE_LABELS[med.route] ?? med.route) : '—';
      const statusColor = med.active ? '#10B981' : '#94A3B8';
      return `<tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}">
        <td style="padding:7px 10px;font-weight:600;color:#1E293B;">${med.name}${med.genericName ? `<div style="font-size:10px;color:#94A3B8;margin-top:1px;">${med.genericName}</div>` : ''}</td>
        <td style="padding:7px 10px;color:#334155;">${med.dose}</td>
        <td style="padding:7px 10px;color:#334155;">${routeLabel}</td>
        <td style="padding:7px 10px;color:#334155;">${med.indication ?? '—'}</td>
        <td style="padding:7px 10px;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:6px;">
            <div style="width:48px;height:6px;background:#E2E8F0;border-radius:3px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;"></div>
            </div>
            <span style="font-weight:700;color:${color};font-size:12px;">${pct}%</span>
          </div>
        </td>
        <td style="padding:7px 10px;text-align:center;color:${missed > 0 ? '#EF4444' : '#10B981'};font-weight:600;">${missed}</td>
        <td style="padding:7px 10px;color:#64748B;font-size:11px;">${lastTaken}</td>
        <td style="padding:7px 10px;text-align:center;"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${statusColor}20;color:${statusColor};">${med.active ? L.medActive : L.medInactive}</span></td>
      </tr>`;
    }).join('');

    // Overall 30-day adherence summary across all medications
    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff30Str = cutoff30.toISOString().split('T')[0];
    // Prior 30-day period (days 31–60) for trend delta comparison
    const cutoff60 = new Date();
    cutoff60.setDate(cutoff60.getDate() - 60);
    const cutoff60Str = cutoff60.toISOString().split('T')[0];
    let totalTaken = 0, totalMissed = 0, totalSkipped = 0;
    for (const med of meds) {
      for (const log of med.doseLogs) {
        if (log.date < cutoff30Str) continue;
        if (log.reinstatedAt || log.status === 'taken') totalTaken++;
        else if (log.status === 'missed') totalMissed++;
        else if (log.status === 'skipped') totalSkipped++;
      }
    }
    const totalDoses = totalTaken + totalMissed + totalSkipped;
    const overallPct = totalDoses > 0 ? Math.round((totalTaken / totalDoses) * 100) : 0;
    const overallColor = overallPct >= 90 ? '#10B981' : overallPct >= 70 ? '#F59E0B' : '#EF4444';

    // Full dose log table (last 30 days, all medications)
    const allDoseLogs: { med: Medication; log: DoseLog }[] = [];
    for (const med of meds) {
      for (const log of med.doseLogs) {
        if (log.date >= cutoff30Str) allDoseLogs.push({ med, log });
      }
    }
    allDoseLogs.sort((a, b) => new Date(b.log.loggedAt).getTime() - new Date(a.log.loggedAt).getTime());
    const doseLogRows = allDoseLogs.map((e, i) => {
      const { med, log } = e;
      const sl = log.reinstatedAt ? L.medReinstated : log.status === 'taken' ? L.medTaken : log.status === 'skipped' ? L.medSkipped : L.medMissedLabel;
      const sc = log.reinstatedAt || log.status === 'taken' ? '#10B981' : log.status === 'skipped' ? '#F59E0B' : '#EF4444';
      return `<tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}">
        <td style="padding:5px 8px;color:#334155;">${log.date}</td>
        <td style="padding:5px 8px;color:#334155;">${log.scheduledTime}</td>
        <td style="padding:5px 8px;font-weight:600;color:#1E293B;">${med.name}</td>
        <td style="padding:5px 8px;color:#334155;">${med.dose}</td>
        <td style="padding:5px 8px;font-weight:700;color:${sc};">${sl}</td>
        <td style="padding:5px 8px;color:#64748B;font-size:10px;">${log.note === 'snooze' ? `⏰ ${L.medSnoozeReason}` : log.note === 'user reschedule' ? L.medUserReschedule : (log.note ?? '')}</td>
      </tr>`;
    }).join('');

    return `
  <div class="section">
    <div class="section-header">
      <div class="section-dot" style="background:#8B5CF6;"></div>
      <div class="section-title" style="color:#8B5CF6;">💊 ${L.medicationAdherence}</div>
    </div>

    <!-- Overall 30-day adherence summary -->
    <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="flex:1;min-width:80px;text-align:center;padding:10px 12px;background:#F5F3FF;border-radius:8px;border:1px solid #DDD6FE;">
        <div style="font-size:22px;font-weight:800;color:${overallColor};">${overallPct}%</div>
        <div style="font-size:10px;color:#7C3AED;margin-top:2px;">${L.medOverallAdherence}</div>
      </div>
      <div style="flex:1;min-width:80px;text-align:center;padding:10px 12px;background:#F0FDF4;border-radius:8px;border:1px solid #BBF7D0;">
        <div style="font-size:22px;font-weight:800;color:#10B981;">${totalTaken}</div>
        <div style="font-size:10px;color:#065F46;margin-top:2px;">${L.medTaken}</div>
      </div>
      <div style="flex:1;min-width:80px;text-align:center;padding:10px 12px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA;">
        <div style="font-size:22px;font-weight:800;color:#EF4444;">${totalMissed}</div>
        <div style="font-size:10px;color:#991B1B;margin-top:2px;">${L.medMissedLabel}</div>
      </div>
      <div style="flex:1;min-width:80px;text-align:center;padding:10px 12px;background:#FFFBEB;border-radius:8px;border:1px solid #FDE68A;">
        <div style="font-size:22px;font-weight:800;color:#F59E0B;">${totalSkipped}</div>
        <div style="font-size:10px;color:#92400E;margin-top:2px;">${L.medSkipped}</div>
      </div>
      <div style="flex:1;min-width:80px;text-align:center;padding:10px 12px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;">
        <div style="font-size:22px;font-weight:800;color:#334155;">${totalDoses}</div>
        <div style="font-size:10px;color:#64748B;margin-top:2px;">${L.medTotalDoses}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#F5F3FF;">
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medName}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medDose}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medRoute}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medIndication}</th>
          <th style="padding:8px 10px;text-align:center;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medAdherence}</th>
          <th style="padding:8px 10px;text-align:center;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medMissed}</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medLastTaken}</th>
          <th style="padding:8px 10px;text-align:center;font-weight:700;color:#7C3AED;border-bottom:2px solid #DDD6FE;">${L.medStatus}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:10px;padding:10px 12px;background:#8B5CF615;border:1px solid #8B5CF640;border-radius:8px;font-size:11px;color:#5B21B6;">
      ⚕️ ${L.medicationAdherenceDisclaimer}
    </div>

    ${(() => {
      // Top missed-dose reasons section (last 30 days)
      const reasonCountsPdf: Record<string, number> = {};
      let totalMissedSkippedPdf = 0;
      for (const med of meds) {
        for (const log of med.doseLogs) {
          if ((log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt && log.date >= cutoff30Str) {
            totalMissedSkippedPdf++;
            if (log.note) {
              const r = log.note.trim();
              reasonCountsPdf[r] = (reasonCountsPdf[r] ?? 0) + 1;
            }
          }
        }
      }
      const topReasonsPdf = Object.entries(reasonCountsPdf).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topReasonsPdf.length === 0) return '';
      // Prior 30-day period reason counts (days 31–60) for trend delta
      const reasonCountsPrev: Record<string, number> = {};
      let _totalMissedSkippedPrev = 0;
      for (const med of meds) {
        for (const log of med.doseLogs) {
          if ((log.status === 'missed' || log.status === 'skipped') && !log.reinstatedAt
              && log.date >= cutoff60Str && log.date < cutoff30Str) {
            _totalMissedSkippedPrev++;
            if (log.note) {
              const r = log.note.trim();
              reasonCountsPrev[r] = (reasonCountsPrev[r] ?? 0) + 1;
            }
          }
        }
      }
      const barColors30 = ['#EF4444', '#F97316', '#EAB308', '#8B5CF6', '#3B82F6'];
      const reasonRows = topReasonsPdf.map(([reason, cnt], i) => {
        const pct = totalMissedSkippedPdf > 0 ? Math.round((cnt / totalMissedSkippedPdf) * 100) : 0;
        const barW = Math.round((cnt / topReasonsPdf[0][1]) * 100);
        const bc = barColors30[i % barColors30.length];
        // Trend delta vs prior period
        const prevCnt = reasonCountsPrev[reason] ?? 0;
        const diff = cnt - prevCnt;
        const trendArrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        const trendColor = diff > 0 ? '#EF4444' : diff < 0 ? '#10B981' : '#94A3B8';
        const trendLabel = diff === 0 ? L.medNoChange : `${diff > 0 ? '+' : ''}${diff} ${L.medVsPrior30d}`;
        return `<tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#FEF2F2'}">
          <td style="padding:6px 10px;color:#1E293B;font-weight:600;">${reason}</td>
          <td style="padding:6px 10px;text-align:center;font-weight:700;color:${bc};">${cnt}</td>
          <td style="padding:6px 10px;text-align:center;color:#64748B;">${pct}%</td>
          <td style="padding:6px 10px;">
            <div style="height:8px;border-radius:4px;background:#FEE2E2;overflow:hidden;">
              <div style="height:8px;border-radius:4px;background:${bc};width:${barW}%;"></div>
            </div>
          </td>
          <td style="padding:6px 10px;text-align:center;">
            <span style="font-size:13px;font-weight:700;color:${trendColor};" title="${trendLabel}">${trendArrow}</span>
            <span style="font-size:9px;color:${trendColor};margin-left:2px;">${diff === 0 ? '' : (diff > 0 ? '+' : '') + diff}</span>
          </td>
        </tr>`;
      }).join('');
      return `
      <div style="margin-top:18px;">
        <div style="font-size:12px;font-weight:700;color:#7C3AED;margin-bottom:6px;">📊 ${L.medTopMissedTitle}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#F5F3FF;">
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medReasonCol}</th>
              <th style="padding:6px 10px;text-align:center;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medCountCol}</th>
              <th style="padding:6px 10px;text-align:center;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medPctMissed}</th>
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medFrequencyCol}</th>
              <th style="padding:6px 10px;text-align:center;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medVsPrior30d}</th>
            </tr>
          </thead>
          <tbody>${reasonRows}</tbody>
        </table>
        <div style="margin-top:6px;font-size:10px;color:#64748B;font-style:italic;">${L.medMissedSkippedSummary.replace('{n}', String(totalMissedSkippedPdf))}</div>
      </div>`;
    })()}

    ${allDoseLogs.length > 0 ? `
    <!-- Full dose log table -->
    <div style="margin-top:18px;">
      <div style="font-size:12px;font-weight:700;color:#7C3AED;margin-bottom:6px;">📋 ${L.medFullDoseLogTitle} (${allDoseLogs.length} ${L.medEntriesLabel})</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#F5F3FF;">
            <th style="padding:6px 8px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.date}</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medTimeCol}</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medName}</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medDose}</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.status}</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medNoteReason}</th>
          </tr>
        </thead>
        <tbody>${doseLogRows}</tbody>
      </table>
    </div>` : ''}

    ${(() => {
      // Build reschedule history rows across all medications
      const rescheduleRows: string[] = [];
      for (const med of meds) {
        for (const log of med.doseLogs) {
          if (!log.rescheduleHistory || log.rescheduleHistory.length === 0) continue;
          for (const ev of log.rescheduleHistory) {
            const date = safeFormatDate(ev.rescheduledAt, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const time = safeFormatTime(ev.rescheduledAt, 'en-US', { hour: '2-digit', minute: '2-digit' });
            const reasonLabel = ev.reason === 'snooze' ? `⏰ ${L.medSnoozeReason}` : ev.reason === 'user reschedule' ? L.medUserReschedule : ev.reason ? ev.reason : '—';
            rescheduleRows.push(`<tr>
              <td style="padding:6px 10px;color:#1E293B;font-weight:600;">${med.name}</td>
              <td style="padding:6px 10px;color:#334155;">${date} ${time}</td>
              <td style="padding:6px 10px;color:#334155;">${ev.originalTime}</td>
              <td style="padding:6px 10px;color:#334155;">${ev.newTime}</td>
              <td style="padding:6px 10px;color:#64748B;">${reasonLabel}</td>
            </tr>`);
          }
        }
      }
      if (rescheduleRows.length === 0) return '';
      return `
      <div style="margin-top:16px;">
        <div style="font-size:12px;font-weight:700;color:#7C3AED;margin-bottom:6px;">📋 ${L.medRescheduleHistoryTitle}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#F5F3FF;">
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medName}</th>
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medRescheduledAt}</th>
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medOriginalTime}</th>
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medNewTime}</th>
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7C3AED;border-bottom:1px solid #DDD6FE;">${L.medReasonCol}</th>
            </tr>
          </thead>
          <tbody>${rescheduleRows.join('')}</tbody>
        </table>
      </div>`;
    })()}
  </div>`;
  })()}

  ${(() => {
    if (config.includeEKG === false) return '';
    const ekgRecords = config.ekgRecords ?? [];
    if (ekgRecords.length === 0) return '';
    const dist = { total: ekgRecords.length, sinusRhythm: 0, atrialFibrillation: 0, inconclusive: 0, unclassified: 0 };
    for (const r of ekgRecords) {
      if (r.classification === 'SinusRhythm') dist.sinusRhythm++;
      else if (r.classification === 'AtrialFibrillation') dist.atrialFibrillation++;
      else if (r.classification === 'Inconclusive') dist.inconclusive++;
      else dist.unclassified++;
    }
    const pct = (n: number) => dist.total > 0 ? `${Math.round((n / dist.total) * 100)}%` : '0%';
    const lastAfib = ekgRecords.find(r => r.classification === 'AtrialFibrillation');
    const lastAfibStr = lastAfib
      ? safeFormatDate(lastAfib.startDate, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : L.ekgNoAfibRecorded;
    const hasAfib = dist.atrialFibrillation > 0;
    const recentRows = ekgRecords.slice(0, 20).map(r => {
      const cls =
        r.classification === 'SinusRhythm' ? L.ekgSinusRhythm
        : r.classification === 'AtrialFibrillation' ? L.ekgAtrialFibrillation
        : r.classification === 'Inconclusive' ? L.ekgInconclusive
        : L.ekgUnclassified;
      const clsColor =
        r.classification === 'SinusRhythm' ? '#22C55E'
        : r.classification === 'AtrialFibrillation' ? '#EF4444'
        : r.classification === 'Inconclusive' ? '#F59E0B'
        : '#6B7280';
      const dateStr = safeFormatDate(r.startDate, 'en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const hrStr = r.averageHeartRate ? `${Math.round(r.averageHeartRate)} ${L.ekgAvgHR}` : '—';
      return `<tr>
        <td style="padding:6px 10px;color:#334155;">${dateStr}</td>
        <td style="padding:6px 10px;"><span style="color:${clsColor};font-weight:600;">${cls}</span></td>
        <td style="padding:6px 10px;color:#334155;">${hrStr}</td>
      </tr>`;
    }).join('');
    return `
  <div class="section" style="page-break-inside:avoid;">
    <div class="section-title" style="color:#EF4444;">❤ ${L.ekgSectionTitle}</div>
    ${hasAfib ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#B91C1C;font-weight:600;">⚠ ${L.ekgAtrialFibrillation} ${L.ekgLastAfibDate}: ${lastAfibStr}</div>` : ''}
    <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <div style="font-size:22px;font-weight:700;color:#1E293B;">${dist.total}</div>
        <div style="font-size:11px;color:#64748B;">${L.ekgTotalRecordings}</div>
      </div>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <div style="font-size:22px;font-weight:700;color:#15803D;">${dist.sinusRhythm}</div>
        <div style="font-size:11px;color:#166534;">${L.ekgSinusRhythm}</div>
      </div>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <div style="font-size:22px;font-weight:700;color:#DC2626;">${dist.atrialFibrillation}</div>
        <div style="font-size:11px;color:#991B1B;">${L.ekgAtrialFibrillation}</div>
      </div>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <div style="font-size:22px;font-weight:700;color:#B45309;">${dist.inconclusive}</div>
        <div style="font-size:11px;color:#92400E;">${L.ekgInconclusive}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;">
      <thead>
        <tr style="background:#FEF2F2;">
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#EF4444;border-bottom:1px solid #FECACA;">${L.ekgClassificationCol}</th>
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#EF4444;border-bottom:1px solid #FECACA;">${L.ekgCountCol}</th>
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#EF4444;border-bottom:1px solid #FECACA;">${L.ekgPctCol}</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="padding:6px 10px;color:#15803D;font-weight:600;">${L.ekgSinusRhythm}</td><td style="padding:6px 10px;">${dist.sinusRhythm}</td><td style="padding:6px 10px;">${pct(dist.sinusRhythm)}</td></tr>
        <tr style="background:#FAFAFA;"><td style="padding:6px 10px;color:#DC2626;font-weight:600;">${L.ekgAtrialFibrillation}</td><td style="padding:6px 10px;">${dist.atrialFibrillation}</td><td style="padding:6px 10px;">${pct(dist.atrialFibrillation)}</td></tr>
        <tr><td style="padding:6px 10px;color:#B45309;font-weight:600;">${L.ekgInconclusive}</td><td style="padding:6px 10px;">${dist.inconclusive}</td><td style="padding:6px 10px;">${pct(dist.inconclusive)}</td></tr>
        <tr style="background:#FAFAFA;"><td style="padding:6px 10px;color:#6B7280;font-weight:600;">${L.ekgUnclassified}</td><td style="padding:6px 10px;">${dist.unclassified}</td><td style="padding:6px 10px;">${pct(dist.unclassified)}</td></tr>
      </tbody>
    </table>
    <div style="font-size:12px;font-weight:700;color:#EF4444;margin-bottom:8px;">${L.ekgRecentRecordingsTitle}</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#FEF2F2;">
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#EF4444;border-bottom:1px solid #FECACA;">${L.ekgDateCol}</th>
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#EF4444;border-bottom:1px solid #FECACA;">${L.ekgClassificationCol}</th>
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#EF4444;border-bottom:1px solid #FECACA;">${L.ekgHRCol}</th>
        </tr>
      </thead>
      <tbody>${recentRows}</tbody>
    </table>
    <div style="font-size:10px;color:#94A3B8;margin-top:10px;font-style:italic;">${L.ekgDisclaimer}</div>
  </div>`;
  })()}

  ${(() => {
    // Collect all categories from the correlation insights + all metric refs + nutrition refs
    const allCategories = Object.keys(CORRELATION_REFS);
    const correlationRefs = getRefsForCategories(allCategories);
    const metricKeys = Object.keys(REPORT_METRIC_REFS);
    const metricRefs = getRefsForMetrics(metricKeys);
    // Merge and deduplicate by pmid/id
    const seen = new Set<string>();
    const reportRefs = [...correlationRefs, ...metricRefs].filter(ref => {
      const key = ref.pmid || ref.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!reportRefs.length) return '';
    const refRows = reportRefs.map((ref, idx) => `
      <div style="margin-bottom:10px;padding-left:24px;position:relative;">
        <span style="position:absolute;left:0;top:0;font-weight:700;color:#6366F1;">[${idx + 1}]</span>
        <span style="font-size:10px;color:#1E293B;line-height:1.5;">${ref.fullRef}</span><br>
        <span style="font-size:9px;color:#64748B;font-style:italic;">${ref.summary}</span>
        ${ref.url ? `<br><a href="${ref.url}" style="font-size:9px;color:#6366F1;">PubMed: ${ref.pmid || 'N/A'}</a>` : ''}
      </div>
    `).join('');

    // NeoVital graph and NeoSleep methodology references
    const neoVitalRef = config.includeNeoVitalGraph !== false ? `
      <div style="margin-bottom:10px;padding-left:24px;position:relative;margin-top:16px;">
        <span style="position:absolute;left:0;top:0;font-weight:700;color:#4A9ECC;">[NV]</span>
        <span style="font-size:10px;color:#1E293B;line-height:1.5;"><strong>NeoVital Monitor — Oscillating Vital Signs Graph</strong></span><br>
        <span style="font-size:9px;color:#64748B;font-style:italic;">Multi-axis normalized trend visualization displaying HR, BP, SpO\u2082, blood glucose, and weight over 30/90-day windows. Each metric is independently normalized to its own physiological scale. Methodology grounded in: Clifton DA et al. (2012) Predictive monitoring of mobile patients by combining clinical observations with data from wearable sensors. IEEE J Biomed Health Inform. PMID: 23008264. Tarassenko L et al. (2014) Integrated monitoring and analysis for early warning of patient deterioration. Br J Anaesth. PMID: 24907243.</span>
      </div>
    ` : '';

    const neoSleepRef = `
      <div style="margin-bottom:10px;padding-left:24px;position:relative;">
        <span style="position:absolute;left:0;top:0;font-weight:700;color:#7C3AED;">[NS]</span>
        <span style="font-size:10px;color:#1E293B;line-height:1.5;"><strong>NeoSleep — Sleep Architecture Analysis</strong></span><br>
        <span style="font-size:9px;color:#64748B;font-style:italic;">Sleep stage duration, efficiency, and circadian alignment metrics displayed in this report follow AASM (American Academy of Sleep Medicine) scoring criteria. References: Berry RB et al. (2012) AASM Manual for the Scoring of Sleep and Associated Events v2.0. Buysse DJ et al. (1989) The Pittsburgh Sleep Quality Index. Psychiatry Res. PMID: 2748771. Ohayon MM et al. (2004) Meta-analysis of quantitative sleep parameters from childhood to old age. Sleep. PMID: 15164913.</span>
      </div>
    `;

    return `
    <div style="page-break-inside:avoid;margin:24px 0 16px;padding:20px 24px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">
      <div style="font-size:13px;font-weight:800;color:#6366F1;letter-spacing:0.8px;margin-bottom:14px;text-transform:uppercase;">Medical References</div>
      <div style="font-size:9px;color:#94A3B8;font-style:italic;margin-bottom:12px;">All health metrics, correlation insights, and nutritional analyzes in this report are grounded in peer-reviewed literature. Citations are indexed in PubMed (NCBI) and follow Vancouver/ICMJE format.</div>
      ${refRows}
      ${neoVitalRef}
      ${neoSleepRef}
    </div>`;
  })()}

  <div class="footer">
    ${L.footerText}<br>
    ${L.footerDisclaimer}<br>
    ${L.footerConsult}${config.translationEngine === 'apple' ? `<br><span style="font-size:9px;opacity:0.65;">${L.translatedByApple}</span>` : config.translationEngine === 'gemini' ? `<br><span style="font-size:9px;opacity:0.65;">${L.translatedByGemini}</span>` : ''}
  </div>
</body>
</html>
  `;

  return html;
}
