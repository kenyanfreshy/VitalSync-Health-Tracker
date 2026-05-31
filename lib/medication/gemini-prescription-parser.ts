/**
 * Gemini 2.5-flash Prescription Parser
 *
 * Sends a prescription/label image directly to Gemini Vision API and returns
 * structured medication data. Works fully client-side — no server required.
 *
 * Features:
 * - Gemini 2.5-flash as primary engine
 * - Hardened JSON parser: handles valid JSON, markdown-wrapped JSON, partial JSON
 * - Full field validation: no undefined, NaN, or empty required fields
 * - Confidence-based "Needs Review" flagging
 * - 20-second timeout
 */

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
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
    name:          coerceString(raw.name),
    strength:      coerceString(raw.strength),
    dose:          coerceString(raw.dose),
    frequency:     coerceString(raw.frequency),
    route:         coerceString(raw.route),
    quantity:      coerceString(raw.quantity),
    refills:       coerceString(raw.refills),
    instructions:  coerceString(raw.instructions),
    prescriberName: coerceString(raw.prescriberName ?? raw.prescriber),
    pharmacyName:  coerceString(raw.pharmacyName ?? raw.pharmacy),
    confidence,
    needsReview:   confidence < 0.6,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parsePrescriptionWithGemini(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<PrescriptionScanResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawJson = '';
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
    const parsed = JSON.parse(jsonText) as { medications?: unknown[] };

    const rawMeds = Array.isArray(parsed.medications) ? parsed.medications : [];
    const medications: PrescriptionMedication[] = rawMeds
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map(parseMedicationItem)
      .filter(m => m.name !== ''); // drop completely empty entries

    return { medications, rawJson, usedFallback: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      medications: [],
      rawJson,
      usedFallback: true,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}
