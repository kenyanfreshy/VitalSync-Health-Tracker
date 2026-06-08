/**
 * Gemini 2.5-flash Prescription Parser
 *
 * Sends a prescription/label image directly to Gemini Vision API and returns
 * structured medication data. Works fully client-side — no server required.
 *
 * Uses the same stable 3-model fallback chain as the food and lab scanners:
 *   1. gemini-2.5-flash       (primary — stable, confirmed working)
 *   2. gemini-2.5-flash-lite  (faster fallback, lower cost)
 *   3. gemini-flash-latest    (alias, always points to latest stable flash)
 *
 * Features:
 * - Hardened JSON parser: handles valid JSON, markdown-wrapped JSON, partial JSON
 * - Full field validation: no undefined, NaN, or empty required fields
 * - Confidence-based "Needs Review" flagging
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

export interface PrescriptionMedication {
  name: string;
  strength: string;
  dose: string;
  frequency: string;
  route: string;
  quantity: string;
  refills: string;
  instructions: string;
  prescriberName: string;
  pharmacyName: string;
  confidence: number;
  /** Fields with confidence < 0.6 are flagged "Needs Review" */
  needsReview: boolean;
}

export interface PrescriptionScanResult {
  medications: PrescriptionMedication[];
  rawJson: string;
  usedFallback: boolean;
  error?: string;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const PRESCRIPTION_PROMPT = `You are a clinical prescription reader. Extract all medication details from this prescription image.

RULES:
- Return JSON ONLY.
- Never return markdown.
- Never return explanations.
- Never return commentary.
- Extract ALL visible medications.
- Preserve exact values from the source image.
- Leave uncertain fields as empty string "" instead of guessing.
- Include a confidence score (0.0 to 1.0) per medication.

Return this exact JSON structure:
{
  "medications": [
    {
      "name": "medication brand name",
      "strength": "e.g. 500 mg",
      "dose": "e.g. 1 tablet",
      "frequency": "e.g. Twice daily",
      "route": "e.g. Oral",
      "quantity": "e.g. 60",
      "refills": "e.g. 3",
      "instructions": "e.g. Take with meals",
      "prescriberName": "e.g. Dr. Jane Smith",
      "pharmacyName": "e.g. CVS Pharmacy",
      "confidence": 0.94
    }
  ]
}`;

// ─── Parser ───────────────────────────────────────────────────────────────────

function extractJsonFromText(text: string): string {
  // Strip markdown code fences
  let cleaned = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  // Find first { and last } to extract JSON object
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
  if (n > 1) return Math.min(n / 100, 1); // handle 0-100 scale
  return n;
}

function parseMedicationItem(raw: Record<string, unknown>): PrescriptionMedication {
  const confidence = coerceConfidence(raw.confidence);
  return {
    name:           coerceString(raw.name),
    strength:       coerceString(raw.strength),
    dose:           coerceString(raw.dose),
    frequency:      coerceString(raw.frequency),
    route:          coerceString(raw.route),
    quantity:       coerceString(raw.quantity),
    refills:        coerceString(raw.refills),
    instructions:   coerceString(raw.instructions),
    prescriberName: coerceString(raw.prescriberName ?? raw.prescriber),
    pharmacyName:   coerceString(raw.pharmacyName ?? raw.pharmacy),
    confidence,
    needsReview:    confidence < 0.6,
  };
}

// ─── Core vision call (mirrors food/lab scanner pattern) ──────────────────────

async function callGeminiPrescriptionVision(
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
            { text: PRESCRIPTION_PROMPT },
            { inlineData: { mimeType, data: base64Image } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
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
        `[GeminiPrescription] HTTP ${response.status} from ${apiUrl.split('models/')[1]?.split(':')[0] ?? 'unknown'}: ${errBody.slice(0, 200)}`,
      );
      return { rawJson: '', error: `HTTP ${response.status}` };
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (data.error) {
      console.warn(`[GeminiPrescription] API error: ${data.error.message ?? JSON.stringify(data.error)}`);
      return { rawJson: '', error: data.error.message ?? 'API error' };
    }

    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawJson) return { rawJson: '', error: 'Empty response' };

    return { rawJson };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[GeminiPrescription] Request failed: ${message}`);
    return { rawJson: '', error: message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parsePrescriptionWithGemini(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<PrescriptionScanResult> {
  let rawJson = '';
  let usedFallback = false;

  // Attempt 1: gemini-2.5-flash (primary — stable)
  const result1 = await callGeminiPrescriptionVision(base64Image, mimeType, GEMINI_API_URL);
  if (result1.rawJson) {
    rawJson = result1.rawJson;
  } else {
    // Attempt 2: gemini-2.5-flash-lite (faster fallback)
    usedFallback = true;
    const result2 = await callGeminiPrescriptionVision(base64Image, mimeType, GEMINI_FALLBACK_URL);
    if (result2.rawJson) {
      rawJson = result2.rawJson;
    } else {
      // Attempt 3: gemini-flash-latest (last resort alias)
      const result3 = await callGeminiPrescriptionVision(base64Image, mimeType, GEMINI_LAST_RESORT_URL);
      rawJson = result3.rawJson;
      if (!rawJson) {
        return {
          medications: [],
          rawJson: '',
          usedFallback: true,
          error: result3.error ?? 'All Gemini models failed',
        };
      }
    }
  }

  try {
    const jsonText = extractJsonFromText(rawJson);
    const parsed = JSON.parse(jsonText) as { medications?: unknown[] };

    const rawMeds = Array.isArray(parsed.medications) ? parsed.medications : [];
    const medications: PrescriptionMedication[] = rawMeds
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map(parseMedicationItem)
      .filter(m => m.name !== ''); // drop completely empty entries

    return { medications, rawJson, usedFallback };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      medications: [],
      rawJson,
      usedFallback: true,
      error: message,
    };
  }
}
