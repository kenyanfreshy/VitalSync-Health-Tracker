/**
 * VitalSync Lab Router
 *
 * Provides two procedures:
 *   1. lab.parseOcr  — accepts a base64 image of a lab report, returns structured values
 *   2. lab.correlate — accepts a LabResult + 24h SodiumRecords, returns correlation insights
 */

import { z } from 'zod';
import { publicProcedure, router } from './_core/trpc';
import { invokeLLM, type Message } from './_core/llm';
import { storagePut } from './storage';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const LabValueSchema = z.record(z.string(), z.number().nullable());

const SodiumRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  sodiumMg: z.number().optional(),
  potassiumMg: z.number().optional(),
  carbsG: z.number().optional(),
  sugarG: z.number().optional(),
  fatG: z.number().optional(),
  proteinG: z.number().optional(),
  glycemicLoad: z.number().optional(),
  fiberG: z.number().optional(),
  calories: z.number().optional(),
});

const LabResultSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  panel: z.enum(['CMP', 'CBC', 'MG', 'PHOS', 'LIPID', 'A1C']),
  values: LabValueSchema,
  source: z.enum(['manual', 'ocr']),
  labName: z.string().optional(),
});

// ─── OCR system prompt ───────────────────────────────────────────────────────

const OCR_SYSTEM_PROMPT = `You are a clinical laboratory data extraction assistant.
The user will send you an image of a printed or electronic lab report.
Your task is to extract all numeric lab values from the image and return them as structured JSON.

Rules:
- Only extract values that are clearly visible and numeric.
- Map each value to its standard analyte key from this list:
  CMP: glucose, bun, creatinine, egfr, sodium, potassium, chloride, co2, calcium, totalProtein, albumin, totalBilirubin, alt, ast
  CBC: wbc, rbc, hemoglobin, hematocrit, mcv, mch, mchc, rdw, platelets, neutrophils
  Single: magnesium, phosphorus, a1c
  Lipid: totalCholesterol, ldl, hdl, triglycerides, nonHdl
- If a value is flagged H (high) or L (low) in the report, still include the numeric value.
- If a value is not present or illegible, omit it entirely (do not guess).
- Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "panel": "CMP" | "CBC" | "MG" | "PHOS" | "LIPID" | "A1C",
  "labName": "string or null",
  "collectionDate": "ISO 8601 date string or null",
  "values": {
    "glucose": 98,
    "sodium": 140,
    ...
  }
}`;

// ─── Correlation system prompt ────────────────────────────────────────────────

const CORRELATION_SYSTEM_PROMPT = `You are a clinical nutrition-lab correlation analyst.
You will receive:
1. A set of abnormal lab values with their reference ranges
2. A summary of the patient's dietary intake over the last 24 hours

Your task is to generate concise, evidence-based clinical insights explaining how the dietary intake may have contributed to each abnormal lab value.

Rules:
- Only comment on abnormal values (outside reference range).
- Be specific: cite the nutrient, the intake amount, and the mechanism.
- Use plain clinical language (no jargon beyond standard medical terms).
- Assign a severity: "info" (borderline), "warning" (moderately abnormal), or "critical" (significantly abnormal).
- Return ONLY valid JSON array, no markdown, no explanation:
[
  {
    "analyte": "potassium",
    "analyteLabel": "Potassium",
    "labValue": 5.2,
    "unit": "mEq/L",
    "status": "high",
    "nutrient": "Dietary Potassium",
    "intake24h": 5200,
    "intakeUnit": "mg",
    "threshold": 4700,
    "direction": "high",
    "insight": "Your 24h dietary potassium was 5,200mg (threshold 4,700mg). High potassium intake can contribute to hyperkalemia, especially with impaired renal function.",
    "severity": "warning"
  }
]`;

// ─── Router ───────────────────────────────────────────────────────────────────

export const labRouter = router({
  /**
   * Parse a lab report image via OCR (vision LLM).
   * Input: base64-encoded JPEG or PNG of the lab report.
   * Output: structured panel + values.
   */
  parseOcr: publicProcedure
    .input(
      z.object({
        imageBase64: z.string().min(100),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
      }),
    )
    .mutation(async ({ input }) => {
      // Upload image to S3 so the LLM can access a stable public URL.
      // Inline base64 data URIs are unreliable with Gemini for large images.
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `lab-ocr/${Date.now()}-${suffix}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
      const result = await invokeLLM({ messages: [
        { role: 'system', content: OCR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'Extract all lab values from this lab report image and return them as JSON.',
            },
          ],
        },
      ], maxTokens: 1024 });
      const raw = (result.choices[0]?.message?.content ?? '') as string;

      // Strip markdown fences if present
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      let parsed: {
        panel: string;
        labName: string | null;
        collectionDate: string | null;
        values: Record<string, number | null>;
      };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Lab OCR: LLM returned invalid JSON — ${cleaned.slice(0, 200)}`);
      }

      // Sanitize: remove null values
      const values: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed.values ?? {})) {
        if (typeof v === 'number' && isFinite(v)) {
          values[k] = v;
        }
      }

      return {
        panel: (parsed.panel ?? 'CMP') as 'CMP' | 'CBC' | 'MG' | 'PHOS' | 'LIPID' | 'A1C',
        labName: parsed.labName ?? null,
        collectionDate: parsed.collectionDate ?? null,
        values,
        ocrRaw: raw,
      };
    }),


  /**
   * Generate Dynamic Lab Correlation insights.
   * Cross-references abnormal lab values against 24h dietary intake.
   */
  correlate: publicProcedure
    .input(
      z.object({
        labResult: LabResultSchema,
        sodiumRecords24h: z.array(SodiumRecordSchema),
      }),
    )
    .mutation(async ({ input }) => {
      const { labResult, sodiumRecords24h } = input;

      // Aggregate 24h nutrient totals
      const totals: Record<string, number> = {};
      const nutrientFields = ['sodiumMg','potassiumMg','carbsG','sugarG','fatG','proteinG','glycemicLoad','fiberG','calories'];
      for (const record of sodiumRecords24h) {
        for (const field of nutrientFields) {
          const val = (record as Record<string, unknown>)[field];
          if (typeof val === 'number') {
            totals[field] = (totals[field] ?? 0) + val;
          }
        }
      }

      // Build abnormal values summary for the LLM
      const REFERENCE_RANGES_SUMMARY: Record<string, { low: number; high: number; unit: string; label: string }> = {
        glucose: { low: 70, high: 99, unit: 'mg/dL', label: 'Glucose' },
        bun: { low: 7, high: 20, unit: 'mg/dL', label: 'BUN' },
        creatinine: { low: 0.6, high: 1.2, unit: 'mg/dL', label: 'Creatinine' },
        egfr: { low: 60, high: 120, unit: 'mL/min/1.73m²', label: 'eGFR' },
        sodium: { low: 136, high: 145, unit: 'mEq/L', label: 'Sodium' },
        potassium: { low: 3.5, high: 5.0, unit: 'mEq/L', label: 'Potassium' },
        chloride: { low: 98, high: 106, unit: 'mEq/L', label: 'Chloride' },
        co2: { low: 22, high: 29, unit: 'mEq/L', label: 'CO₂' },
        calcium: { low: 8.5, high: 10.2, unit: 'mg/dL', label: 'Calcium' },
        totalProtein: { low: 6.3, high: 8.2, unit: 'g/dL', label: 'Total Protein' },
        albumin: { low: 3.5, high: 5.0, unit: 'g/dL', label: 'Albumin' },
        totalBilirubin: { low: 0.1, high: 1.2, unit: 'mg/dL', label: 'Total Bilirubin' },
        alt: { low: 7, high: 56, unit: 'U/L', label: 'ALT' },
        ast: { low: 10, high: 40, unit: 'U/L', label: 'AST' },
        wbc: { low: 4.5, high: 11.0, unit: '×10³/μL', label: 'WBC' },
        rbc: { low: 4.5, high: 5.9, unit: '×10⁶/μL', label: 'RBC' },
        hemoglobin: { low: 13.5, high: 17.5, unit: 'g/dL', label: 'Hemoglobin' },
        hematocrit: { low: 41, high: 53, unit: '%', label: 'Hematocrit' },
        mcv: { low: 80, high: 100, unit: 'fL', label: 'MCV' },
        mch: { low: 27, high: 33, unit: 'pg', label: 'MCH' },
        mchc: { low: 32, high: 36, unit: 'g/dL', label: 'MCHC' },
        rdw: { low: 11.5, high: 14.5, unit: '%', label: 'RDW' },
        platelets: { low: 150, high: 400, unit: '×10³/μL', label: 'Platelets' },
        neutrophils: { low: 50, high: 70, unit: '%', label: 'Neutrophils' },
        magnesium: { low: 1.7, high: 2.2, unit: 'mg/dL', label: 'Magnesium' },
        phosphorus: { low: 2.5, high: 4.5, unit: 'mg/dL', label: 'Phosphorus' },
        totalCholesterol: { low: 0, high: 200, unit: 'mg/dL', label: 'Total Cholesterol' },
        ldl: { low: 0, high: 100, unit: 'mg/dL', label: 'LDL Cholesterol' },
        hdl: { low: 40, high: 999, unit: 'mg/dL', label: 'HDL Cholesterol' },
        triglycerides: { low: 0, high: 150, unit: 'mg/dL', label: 'Triglycerides' },
        nonHdl: { low: 0, high: 130, unit: 'mg/dL', label: 'Non-HDL Cholesterol' },
        a1c: { low: 0, high: 5.6, unit: '%', label: 'Hemoglobin A1C' },
      };

      const abnormal: { analyte: string; label: string; value: number; unit: string; status: string }[] = [];
      for (const [analyte, value] of Object.entries(labResult.values)) {
        if (typeof value !== 'number') continue;
        const ref = REFERENCE_RANGES_SUMMARY[analyte];
        if (!ref) continue;
        if (value < ref.low) abnormal.push({ analyte, label: ref.label, value, unit: ref.unit, status: 'low' });
        else if (value > ref.high) abnormal.push({ analyte, label: ref.label, value, unit: ref.unit, status: 'high' });
      }

      if (abnormal.length === 0) {
        return { insights: [] };
      }

      const userMessage = `
Abnormal lab values:
${abnormal.map(a => `- ${a.label} (${a.analyte}): ${a.value} ${a.unit} [${a.status.toUpperCase()}]`).join('\n')}

24-hour dietary intake summary:
- Sodium: ${totals.sodiumMg?.toFixed(0) ?? 'N/A'} mg
- Potassium: ${totals.potassiumMg?.toFixed(0) ?? 'N/A'} mg
- Carbohydrates: ${totals.carbsG?.toFixed(1) ?? 'N/A'} g
- Sugar: ${totals.sugarG?.toFixed(1) ?? 'N/A'} g
- Fat: ${totals.fatG?.toFixed(1) ?? 'N/A'} g
- Protein: ${totals.proteinG?.toFixed(1) ?? 'N/A'} g
- Glycemic Load: ${totals.glycemicLoad?.toFixed(0) ?? 'N/A'}
- Calories: ${totals.calories?.toFixed(0) ?? 'N/A'} kcal

Generate correlation insights for each abnormal value where a dietary link exists.
`;

      const corrResult = await invokeLLM({ messages: [
        { role: 'system', content: CORRELATION_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ], maxTokens: 2048 });
      const raw = (corrResult.choices[0]?.message?.content ?? '') as string;

      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      let insights: unknown[];
      try {
        insights = JSON.parse(cleaned);
        if (!Array.isArray(insights)) insights = [];
      } catch {
        insights = [];
      }

      return { insights };
    }),
});
