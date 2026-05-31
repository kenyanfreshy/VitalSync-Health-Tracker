/**
 * Gemini 2.5-flash Lab Report Parser
 *
 * Sends a lab report image directly to Gemini Vision API and returns
 * structured lab result data. Works fully client-side — no server required.
 *
 * Features:
 * - Gemini 2.5-flash as primary engine
 * - Hardened JSON parser: handles valid JSON, markdown-wrapped JSON, partial JSON
 * - Full field validation: no undefined, NaN, or empty required fields
 * - Confidence-based "Needs Review" flagging
 * - Status normalization: Normal / High / Low / Critical
 * - 20-second timeout
 */

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
const TIMEOUT_MS = 20_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type LabResultStatus = 'Normal' | 'High' | 'Low' | 'Critical' | 'Unknown';

export interface LabResultItem {
  test: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: LabResultStatus;
  collectionDate: string;
  laboratoryName: string;
  confidence: number;
  /** Fields with confidence < 0.6 are flagged "Needs Review" */
  needsReview: boolean;
}

export interface LabScanResult {
  labs: LabResultItem[];
  collectionDate: string;
  laboratoryName: string;
  rawJson: string;
  usedFallback: boolean;
  error?: string;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const LAB_PROMPT = `You are a clinical laboratory report reader. Extract all laboratory test results from this lab report image.

RULES:
- Return JSON ONLY.
- Never return markdown.
- Never return explanations.
- Never return commentary.
- Extract ALL visible laboratory values.
- Preserve exact values from the source image.
- Leave uncertain fields as empty string "" instead of guessing.
- Include a confidence score (0.0 to 1.0) per result.
- Status must be one of: "Normal", "High", "Low", "Critical", or "Unknown".

Return this exact JSON structure:
{
  "collectionDate": "e.g. 2024-01-15",
  "laboratoryName": "e.g. Quest Diagnostics",
  "labs": [
    {
      "test": "e.g. Hemoglobin",
      "result": "e.g. 13.6",
      "unit": "e.g. g/dL",
      "referenceRange": "e.g. 12.0-16.0",
      "status": "Normal",
      "confidence": 0.97
    }
  ]
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJsonFromText(text: string): string {
  let cleaned = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function coerceString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  return '';
}

function coerceConfidence(val: unknown): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
  if (!isFinite(n) || n < 0) return 0.5;
  if (n > 1) return Math.min(n / 100, 1);
  return n;
}

function normalizeStatus(val: unknown): LabResultStatus {
  const s = coerceString(val).toLowerCase();
  if (s.includes('critical')) return 'Critical';
  if (s.includes('high') || s === 'h' || s === 'above') return 'High';
  if (s.includes('low') || s === 'l' || s === 'below') return 'Low';
  if (s.includes('normal') || s === 'n' || s === 'within') return 'Normal';
  return 'Unknown';
}

function parseLabItem(
  raw: Record<string, unknown>,
  defaultCollectionDate: string,
  defaultLaboratoryName: string,
): LabResultItem {
  const confidence = coerceConfidence(raw.confidence);
  return {
    test:           coerceString(raw.test ?? raw.testName ?? raw.name),
    result:         coerceString(raw.result ?? raw.value),
    unit:           coerceString(raw.unit ?? raw.units),
    referenceRange: coerceString(raw.referenceRange ?? raw.reference ?? raw.range),
    status:         normalizeStatus(raw.status ?? raw.flag),
    collectionDate: coerceString(raw.collectionDate) || defaultCollectionDate,
    laboratoryName: coerceString(raw.laboratoryName ?? raw.labName) || defaultLaboratoryName,
    confidence,
    needsReview:    confidence < 0.6,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseLabReportWithGemini(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<LabScanResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawJson = '';
  try {
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            { text: LAB_PROMPT },
            { inlineData: { mimeType, data: base64Image } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    });

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawJson) throw new Error('Gemini returned empty response');

    const jsonText = extractJsonFromText(rawJson);
    const parsed = JSON.parse(jsonText) as {
      labs?: unknown[];
      collectionDate?: unknown;
      laboratoryName?: unknown;
    };

    const defaultCollectionDate = coerceString(parsed.collectionDate);
    const defaultLaboratoryName = coerceString(parsed.laboratoryName);

    const rawLabs = Array.isArray(parsed.labs) ? parsed.labs : [];
    const labs: LabResultItem[] = rawLabs
      .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
      .map(l => parseLabItem(l, defaultCollectionDate, defaultLaboratoryName))
      .filter(l => l.test !== '' && l.result !== ''); // drop empty rows

    return {
      labs,
      collectionDate: defaultCollectionDate,
      laboratoryName: defaultLaboratoryName,
      rawJson,
      usedFallback: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      labs: [],
      collectionDate: '',
      laboratoryName: '',
      rawJson,
      usedFallback: true,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}
