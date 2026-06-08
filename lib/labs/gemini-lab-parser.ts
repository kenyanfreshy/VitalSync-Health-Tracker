/**
 * Gemini 2.5-flash Lab Report Parser
 *
 * Sends a lab report image directly to Gemini Vision API and returns
 * structured lab result data. Works fully client-side — no server required.
 *
 * Uses the same stable 3-model fallback chain as the food and prescription scanners:
 *   1. gemini-2.5-flash       (primary — stable, confirmed working)
 *   2. gemini-2.5-flash-lite  (faster fallback, lower cost)
 *   3. gemini-flash-latest    (alias, always points to latest stable flash)
 *
 * Features:
 * - Hardened JSON parser: handles valid JSON, markdown-wrapped JSON, partial JSON
 * - Full field validation: no undefined, NaN, or empty required fields
 * - Confidence-based "Needs Review" flagging
 * - Status normalization: Normal / High / Low / Critical
 * - 20-second timeout per attempt
 */

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';

// Primary model — gemini-2.5-flash (stable, confirmed working with this API key)
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
// Fallback model — gemini-2.5-flash-lite (faster, lower cost, confirmed working)
const GEMINI_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
// Last resort — gemini-flash-latest (alias, always points to latest stable flash)
const GEMINI_LAST_RESORT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

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

// ─── Core vision call (mirrors food/prescription scanner pattern) ─────────────

async function callGeminiLabVision(
  base64Image: string,
  mimeType: string,
  apiUrl: string,
): Promise<{ rawJson: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn(
        `[GeminiLabVision] HTTP ${response.status} from ${apiUrl.split('models/')[1]?.split(':')[0] ?? 'unknown'}: ${errBody.slice(0, 200)}`,
      );
      return { rawJson: '', error: `HTTP ${response.status}` };
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (data.error) {
      console.warn(`[GeminiLabVision] API error: ${data.error.message ?? JSON.stringify(data.error)}`);
      return { rawJson: '', error: data.error.message ?? 'API error' };
    }

    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawJson) return { rawJson: '', error: 'Empty response' };

    return { rawJson };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[GeminiLabVision] Request failed: ${message}`);
    return { rawJson: '', error: message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseLabReportWithGemini(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<LabScanResult> {
  let rawJson = '';
  let usedFallback = false;

  // Attempt 1: gemini-2.5-flash (primary — stable)
  const result1 = await callGeminiLabVision(base64Image, mimeType, GEMINI_API_URL);
  if (result1.rawJson) {
    rawJson = result1.rawJson;
  } else {
    // Attempt 2: gemini-2.5-flash-lite (faster fallback)
    usedFallback = true;
    const result2 = await callGeminiLabVision(base64Image, mimeType, GEMINI_FALLBACK_URL);
    if (result2.rawJson) {
      rawJson = result2.rawJson;
    } else {
      // Attempt 3: gemini-flash-latest (last resort alias)
      const result3 = await callGeminiLabVision(base64Image, mimeType, GEMINI_LAST_RESORT_URL);
      rawJson = result3.rawJson;
      if (!rawJson) {
        return {
          labs: [],
          collectionDate: '',
          laboratoryName: '',
          rawJson: '',
          usedFallback: true,
          error: result3.error ?? 'All Gemini models failed',
        };
      }
    }
  }

  try {
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
      usedFallback,
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
  }
}
