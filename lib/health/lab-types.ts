/**
 * VitalSync Lab Tracker — Types & Reference Ranges
 *
 * Panels: CMP | CBC | MG | PHOS | LIPID | A1C
 */

// ─── Panel IDs ───────────────────────────────────────────────────────────────

export type LabPanelId = 'CMP' | 'CBC' | 'MG' | 'PHOS' | 'LIPID' | 'A1C';

export const LAB_PANEL_LABELS: Record<LabPanelId, string> = {
  CMP:   'Comprehensive Metabolic Panel',
  CBC:   'Complete Blood Count',
  MG:    'Magnesium',
  PHOS:  'Phosphorus',
  LIPID: 'Lipid Panel',
  A1C:   'Hemoglobin A1C',
};

export const LAB_PANEL_SHORT: Record<LabPanelId, string> = {
  CMP: 'CMP', CBC: 'CBC', MG: 'Mg', PHOS: 'Phos', LIPID: 'Lipid', A1C: 'A1C',
};

// ─── Analyte IDs ─────────────────────────────────────────────────────────────

export type CmpAnalyte =
  | 'glucose' | 'bun' | 'creatinine' | 'egfr'
  | 'sodium' | 'potassium' | 'chloride' | 'co2'
  | 'calcium' | 'totalProtein' | 'albumin'
  | 'totalBilirubin' | 'alt' | 'ast';

export type CbcAnalyte =
  | 'wbc' | 'rbc' | 'hemoglobin' | 'hematocrit' | 'mcv'
  | 'mch' | 'mchc' | 'rdw' | 'platelets' | 'neutrophils';

export type LipidAnalyte =
  | 'totalCholesterol' | 'ldl' | 'hdl' | 'triglycerides' | 'nonHdl';

export type SingleAnalyte = 'magnesium' | 'phosphorus' | 'a1c';

export type LabAnalyteId = CmpAnalyte | CbcAnalyte | LipidAnalyte | SingleAnalyte;

// ─── Dietary Correlate ───────────────────────────────────────────────────────

export type DietaryCorrelate = {
  nutrient: string;
  /** Field on SodiumRecord to sum over 24h */
  field: string;
  /** Threshold value — used as upper bound for 'high' direction, lower bound for 'low' direction */
  threshold: number;
  /** @deprecated use threshold */
  highThreshold?: number;
  unit: string;
  direction: 'high' | 'low';
  /** Use {value} and {threshold} as placeholders */
  insightTemplate: string;
};

// ─── Reference Range ─────────────────────────────────────────────────────────

export interface ReferenceRange {
  low: number;
  high: number;
  unit: string;
  label: string;
  abbr: string;
  panels: LabPanelId[];
  dietaryCorrelates?: DietaryCorrelate[];
}

export const REFERENCE_RANGES: Record<LabAnalyteId, ReferenceRange> = {
  // ── CMP ──────────────────────────────────────────────────────────────────
  glucose: {
    label: 'Glucose', abbr: 'Glu', unit: 'mg/dL', low: 70, high: 99, panels: ['CMP'],
    dietaryCorrelates: [
      { nutrient: 'Carbohydrates', field: 'carbsG', threshold: 150, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h carbohydrate intake was {value}g (threshold {threshold}g). High carb intake can transiently elevate fasting glucose.' },
      { nutrient: 'Sugar', field: 'sugarG', threshold: 50, unit: 'g', direction: 'high',
        insightTemplate: 'You consumed {value}g of sugar in the last 24h (threshold {threshold}g). Excess sugar is directly linked to elevated glucose.' },
      { nutrient: 'Glycemic Load', field: 'glycemicLoad', threshold: 80, unit: 'GL', direction: 'high',
        insightTemplate: 'Cumulative glycemic load was {value} GL (threshold {threshold}). High GL meals drive post-prandial glucose spikes.' },
    ],
  },
  bun: {
    label: 'BUN', abbr: 'BUN', unit: 'mg/dL', low: 7, high: 20, panels: ['CMP'],
    dietaryCorrelates: [
      { nutrient: 'Protein', field: 'proteinG', threshold: 120, unit: 'g', direction: 'high',
        insightTemplate: 'You consumed {value}g of protein in 24h (threshold {threshold}g). High protein intake increases urea production and can elevate BUN.' },
    ],
  },
  creatinine: { label: 'Creatinine', abbr: 'Cr', unit: 'mg/dL', low: 0.6, high: 1.2, panels: ['CMP'] },
  egfr: { label: 'eGFR', abbr: 'eGFR', unit: 'mL/min/1.73m²', low: 60, high: 120, panels: ['CMP'] },
  sodium: {
    label: 'Sodium', abbr: 'Na', unit: 'mEq/L', low: 136, high: 145, panels: ['CMP'],
    dietaryCorrelates: [
      { nutrient: 'Dietary Sodium', field: 'sodiumMg', threshold: 2300, unit: 'mg', direction: 'high',
        insightTemplate: 'Your 24h dietary sodium was {value}mg (DASH target ≤{threshold}mg/day). High sodium can contribute to hypernatremia and fluid retention.' },
    ],
  },
  potassium: {
    label: 'Potassium', abbr: 'K', unit: 'mEq/L', low: 3.5, high: 5.0, panels: ['CMP'],
    dietaryCorrelates: [
      { nutrient: 'Dietary Potassium', field: 'potassiumMg', threshold: 4700, unit: 'mg', direction: 'high',
        insightTemplate: 'Your 24h dietary potassium was {value}mg (threshold {threshold}mg). High potassium can contribute to hyperkalemia, especially with impaired renal function.' },
      { nutrient: 'Dietary Sodium', field: 'sodiumMg', threshold: 2300, unit: 'mg', direction: 'high',
        insightTemplate: 'Your dietary sodium was {value}mg in 24h (threshold {threshold}mg). High sodium can impair renal potassium excretion and worsen hyperkalemia.' },
    ],
  },
  chloride: { label: 'Chloride', abbr: 'Cl', unit: 'mEq/L', low: 98, high: 106, panels: ['CMP'] },
  co2: { label: 'CO₂ (Bicarb)', abbr: 'CO₂', unit: 'mEq/L', low: 22, high: 29, panels: ['CMP'] },
  calcium: { label: 'Calcium', abbr: 'Ca', unit: 'mg/dL', low: 8.5, high: 10.2, panels: ['CMP'] },
  totalProtein: {
    label: 'Total Protein', abbr: 'TP', unit: 'g/dL', low: 6.3, high: 8.2, panels: ['CMP'],
    dietaryCorrelates: [
      { nutrient: 'Protein', field: 'proteinG', threshold: 60, unit: 'g', direction: 'low',
        insightTemplate: 'Your 24h protein intake was {value}g (threshold {threshold}g). Low protein intake can contribute to hypoproteinaemia.' },
    ],
  },
  albumin: { label: 'Albumin', abbr: 'Alb', unit: 'g/dL', low: 3.5, high: 5.0, panels: ['CMP'] },
  totalBilirubin: { label: 'Total Bilirubin', abbr: 'T.Bili', unit: 'mg/dL', low: 0.1, high: 1.2, panels: ['CMP'] },
  alt: {
    label: 'ALT', abbr: 'ALT', unit: 'U/L', low: 7, high: 56, panels: ['CMP'],
    dietaryCorrelates: [
      { nutrient: 'Fat', field: 'fatG', threshold: 80, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h fat intake was {value}g (threshold {threshold}g). High fat intake can contribute to hepatic steatosis and elevated ALT.' },
    ],
  },
  ast: { label: 'AST', abbr: 'AST', unit: 'U/L', low: 10, high: 40, panels: ['CMP'] },

  // ── CBC ──────────────────────────────────────────────────────────────────
  wbc: { label: 'WBC', abbr: 'WBC', unit: '×10³/μL', low: 4.5, high: 11.0, panels: ['CBC'] },
  rbc: { label: 'RBC', abbr: 'RBC', unit: '×10⁶/μL', low: 4.5, high: 5.9, panels: ['CBC'] },
  hemoglobin: {
    label: 'Hemoglobin', abbr: 'Hgb', unit: 'g/dL', low: 13.5, high: 17.5, panels: ['CBC'],
    dietaryCorrelates: [
      { nutrient: 'Protein', field: 'proteinG', threshold: 60, unit: 'g', direction: 'low',
        insightTemplate: 'Your 24h protein intake was {value}g (threshold {threshold}g). Adequate protein is essential for haemoglobin synthesis.' },
    ],
  },
  hematocrit: { label: 'Hematocrit', abbr: 'Hct', unit: '%', low: 41, high: 53, panels: ['CBC'] },
  mcv: { label: 'MCV', abbr: 'MCV', unit: 'fL', low: 80, high: 100, panels: ['CBC'] },
  mch: { label: 'MCH', abbr: 'MCH', unit: 'pg', low: 27, high: 33, panels: ['CBC'] },
  mchc: { label: 'MCHC', abbr: 'MCHC', unit: 'g/dL', low: 32, high: 36, panels: ['CBC'] },
  rdw: { label: 'RDW', abbr: 'RDW', unit: '%', low: 11.5, high: 14.5, panels: ['CBC'] },
  platelets: { label: 'Platelets', abbr: 'PLT', unit: '×10³/μL', low: 150, high: 400, panels: ['CBC'] },
  neutrophils: { label: 'Neutrophils', abbr: 'Neut', unit: '%', low: 50, high: 70, panels: ['CBC'] },

  // ── Magnesium ────────────────────────────────────────────────────────────
  magnesium: { label: 'Magnesium', abbr: 'Mg', unit: 'mg/dL', low: 1.7, high: 2.2, panels: ['MG'] },

  // ── Phosphorus ───────────────────────────────────────────────────────────
  phosphorus: { label: 'Phosphorus', abbr: 'Phos', unit: 'mg/dL', low: 2.5, high: 4.5, panels: ['PHOS'] },

  // ── Lipid Panel ──────────────────────────────────────────────────────────
  totalCholesterol: {
    label: 'Total Cholesterol', abbr: 'TC', unit: 'mg/dL', low: 0, high: 200, panels: ['LIPID'],
    dietaryCorrelates: [
      { nutrient: 'Fat', field: 'fatG', threshold: 65, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h fat intake was {value}g (threshold {threshold}g). Dietary saturated and trans fats are primary drivers of elevated total cholesterol.' },
    ],
  },
  ldl: {
    label: 'LDL Cholesterol', abbr: 'LDL', unit: 'mg/dL', low: 0, high: 100, panels: ['LIPID'],
    dietaryCorrelates: [
      { nutrient: 'Fat', field: 'fatG', threshold: 65, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h fat intake was {value}g (threshold {threshold}g). High saturated fat intake is the leading modifiable dietary cause of elevated LDL.' },
    ],
  },
  hdl: { label: 'HDL Cholesterol', abbr: 'HDL', unit: 'mg/dL', low: 40, high: 999, panels: ['LIPID'] },
  triglycerides: {
    label: 'Triglycerides', abbr: 'TG', unit: 'mg/dL', low: 0, high: 150, panels: ['LIPID'],
    dietaryCorrelates: [
      { nutrient: 'Sugar', field: 'sugarG', threshold: 50, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h sugar intake was {value}g (threshold {threshold}g). Excess sugar — especially fructose — is the primary dietary driver of elevated triglycerides.' },
      { nutrient: 'Carbohydrates', field: 'carbsG', threshold: 150, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h carbohydrate intake was {value}g (threshold {threshold}g). High refined carbohydrate intake drives hepatic triglyceride synthesis.' },
    ],
  },
  nonHdl: { label: 'Non-HDL Cholesterol', abbr: 'Non-HDL', unit: 'mg/dL', low: 0, high: 130, panels: ['LIPID'] },

  // ── A1C ──────────────────────────────────────────────────────────────────
  a1c: {
    label: 'Hemoglobin A1C', abbr: 'A1C', unit: '%', low: 0, high: 5.6, panels: ['A1C'],
    dietaryCorrelates: [
      { nutrient: 'Sugar', field: 'sugarG', threshold: 50, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h sugar intake was {value}g (threshold {threshold}g). Persistent high sugar intake is the primary modifiable driver of elevated A1C.' },
      { nutrient: 'Carbohydrates', field: 'carbsG', threshold: 150, unit: 'g', direction: 'high',
        insightTemplate: 'Your 24h carbohydrate intake was {value}g (threshold {threshold}g). Sustained high carbohydrate intake is directly correlated with elevated A1C.' },
    ],
  },
};

// ─── Panel → Analyte map ─────────────────────────────────────────────────────

export const PANEL_ANALYTES: Record<LabPanelId, LabAnalyteId[]> = {
  CMP:   ['glucose','bun','creatinine','egfr','sodium','potassium','chloride','co2','calcium','totalProtein','albumin','totalBilirubin','alt','ast'],
  CBC:   ['wbc','rbc','hemoglobin','hematocrit','mcv','mch','mchc','rdw','platelets','neutrophils'],
  MG:    ['magnesium'],
  PHOS:  ['phosphorus'],
  LIPID: ['totalCholesterol','ldl','hdl','triglycerides','nonHdl'],
  A1C:   ['a1c'],
};

// ─── Lab Result Record ───────────────────────────────────────────────────────

export interface LabResult {
  id: string;
  /** ISO 8601 — date the lab was drawn */
  timestamp: string;
  panel: LabPanelId;
  /** Analyte values — key is LabAnalyteId, value is the numeric result */
  values: Partial<Record<LabAnalyteId, number>>;
  source: 'manual' | 'ocr';
  ocrRaw?: string;
  labName?: string;
  note?: string;
  /** ID of a MedicalHistoryRecord this lab result is linked to */
  linkedConditionId?: string;
}

// ─── Correlation Insight ─────────────────────────────────────────────────────

export interface LabCorrelationInsight {
  analyte: LabAnalyteId;
  analyteLabel: string;
  labValue: number;
  unit: string;
  status: 'high' | 'low';
  nutrient: string;
  intake24h: number;
  intakeUnit: string;
  threshold: number;
  direction: 'high' | 'low';
  insight: string;
  severity: 'info' | 'warning' | 'critical';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAnalyteStatus(
  analyteId: LabAnalyteId,
  value: number,
): 'low' | 'normal' | 'high' {
  const ref = REFERENCE_RANGES[analyteId];
  if (value < ref.low) return 'low';
  if (value > ref.high) return 'high';
  return 'normal';
}

export function getAbnormalAnalytes(result: LabResult): {
  id: LabAnalyteId; value: number; status: 'low' | 'high';
}[] {
  return (Object.entries(result.values) as [LabAnalyteId, number | undefined][])
    .filter(([id, val]) => {
      if (val === undefined || val === null) return false;
      return getAnalyteStatus(id, val as number) !== 'normal';
    })
    .map(([id, val]) => ({
      id,
      value: val as number,
      status: getAnalyteStatus(id, val as number) as 'low' | 'high',
    }));
}

export function statusColor(
  status: 'low' | 'normal' | 'high',
  colors: { success: string; warning: string; error: string },
): string {
  if (status === 'normal') return colors.success;
  if (status === 'low') return colors.warning;
  return colors.error;
}
