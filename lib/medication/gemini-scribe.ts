/**
 * Gemini Vision prescription scribe — replaces the tRPC server call.
 *
 * Sends a prescription/label image to Gemini Vision API and extracts
 * structured medication fields. Works in production without a backend server.
 */

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface GeminiScribeResult {
  name: string | null;
  genericName: string | null;
  dose: string | null;
  form: string | null;
  frequency: string | null;
  scheduleTimes: string[] | null;
  route: string | null;
  indication: string | null;
  prescriber: string | null;
  pharmacyName: string | null;
  pharmacyPhone: string | null;
  quantity: string | null;
  refillAt: string | null;
  notes: string | null;
  confidence: number;
  fieldsFound: string[];
}

const PROMPT = `You are a medical prescription reader. Extract all medication details from this prescription label or bottle image.

Return a JSON object with ONLY these fields (use null for any field not found):
{
  "name": "brand name of medication",
  "genericName": "generic/chemical name",
  "dose": "dosage strength e.g. 500mg",
  "form": "tablet/capsule/liquid/etc",
  "frequency": "how often e.g. twice daily",
  "scheduleTimes": ["08:00", "20:00"],
  "route": "oral/topical/injection/etc",
  "indication": "what it treats",
  "prescriber": "doctor name",
  "pharmacyName": "pharmacy name",
  "pharmacyPhone": "pharmacy phone number",
  "quantity": "number of pills/ml",
  "refillAt": "refill date or remaining refills",
  "notes": "any special instructions e.g. take with food"
}

Return ONLY the JSON object, no explanation or markdown.`;

export async function geminiScribePrescription(
  base64Image: string,
  mimeType = 'image/jpeg',
): Promise<GeminiScribeResult> {
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: PROMPT },
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
    },
  });

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText) {
    throw new Error('Gemini returned empty response');
  }

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: Partial<GeminiScribeResult>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }

  // Build fieldsFound list
  const fieldsFound: string[] = [];
  const fieldKeys: (keyof GeminiScribeResult)[] = [
    'name', 'genericName', 'dose', 'form', 'frequency',
    'route', 'indication', 'prescriber', 'pharmacyName',
    'pharmacyPhone', 'quantity', 'refillAt', 'notes',
  ];
  for (const key of fieldKeys) {
    const val = parsed[key];
    if (val !== null && val !== undefined && val !== '') {
      fieldsFound.push(key);
    }
  }

  // Confidence based on how many fields were found
  const confidence = Math.min(0.95, 0.4 + fieldsFound.length * 0.05);

  return {
    name: parsed.name ?? null,
    genericName: parsed.genericName ?? null,
    dose: parsed.dose ?? null,
    form: parsed.form ?? null,
    frequency: parsed.frequency ?? null,
    scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes : null,
    route: parsed.route ?? null,
    indication: parsed.indication ?? null,
    prescriber: parsed.prescriber ?? null,
    pharmacyName: parsed.pharmacyName ?? null,
    pharmacyPhone: parsed.pharmacyPhone ?? null,
    quantity: parsed.quantity ?? null,
    refillAt: parsed.refillAt ?? null,
    notes: parsed.notes ?? null,
    confidence,
    fieldsFound,
  };
}
