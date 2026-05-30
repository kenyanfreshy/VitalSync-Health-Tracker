/**
 * Food recognition via Gemini Vision API — works in production without a backend server.
 *
 * Recognition pipeline:
 *   1. Gemini Vision (gemini-2.0-flash) — direct API call, returns USDA-searchable names
 *   2. Clarifai food-item-recognition — fallback when Gemini returns nothing
 *
 * The result is a ranked list of food labels that the caller passes to USDA for
 * macro lookup. No nutrition data is returned here — that's USDA's job.
 */

export interface FoodLabel {
  name: string;
  confidence: number; // 0-1
  source: 'gemini-vision' | 'clarifai' | 'server-vision';
}

export interface FoodRecognitionResult {
  labels: FoodLabel[];
  /** Best single food name for USDA lookup */
  primaryFood: string;
  /** Human-readable summary of what was detected */
  summary: string;
  /** Whether a fallback was used */
  usedFallback: boolean;
}

// ─── Gemini Vision API ────────────────────────────────────────────────────────

const GEMINI_API_KEY = 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

async function recogniseViaGemini(
  base64Image: string,
): Promise<FoodLabel[]> {
  try {
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `You are a nutrition database expert. Identify all food items visible in this image.

For each food item, provide the name in USDA FoodData Central format — use the same naming convention as USDA entries (e.g. "Chicken, broilers or fryers, breast, meat only, cooked, roasted" or simply "Chicken breast, cooked" or "White rice, cooked").

Rules:
- List each distinct food item on a separate line
- Use USDA-style names that will match Foundation or SR Legacy database entries
- Most prominent/largest portion first
- Maximum 6 items
- Only list actual food items visible, no descriptions or explanations
- Do NOT include brand names unless clearly visible on packaging

Examples of good USDA-style names:
- Chicken breast, cooked, roasted
- Rice, white, cooked
- Broccoli, cooked, boiled
- Salmon, Atlantic, cooked
- Egg, whole, cooked, scrambled
- Bread, whole-wheat
- Apple, raw`,
            },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return [];

    const items = text
      .split(/\n/)
      .map((s: string) => s.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter((s: string) => s.length > 2 && s.length < 80)
      .slice(0, 6);

    return items.map((name: string, i: number) => ({
      name,
      confidence: Math.max(0.5, 0.95 - i * 0.08),
      source: 'gemini-vision' as const,
    }));
  } catch (_unused) {
    return [];
  }
}

// ─── Clarifai fallback ────────────────────────────────────────────────────────

async function recogniseViaClarifai(
  base64Image: string,
): Promise<FoodLabel[]> {
  try {
    const { clarifaiPredictBase64 } = await import('./clarifai-food');
    const items = await clarifaiPredictBase64(base64Image);
    return items.map((item: { name: string; confidence: number }) => ({
      name: item.name,
      confidence: item.confidence,
      source: 'clarifai' as const,
    }));
  } catch (_unused) {
    return [];
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Recognise food items in a base64-encoded JPEG image.
 *
 * Primary: Gemini Vision API (direct, no backend server needed).
 * Fallback: Clarifai food-item-recognition model.
 *
 * @param base64Image  Raw base64 JPEG (no data: prefix)
 * @param minConfidence  Minimum confidence threshold (default: 0.35)
 */
export async function recogniseFoodInImage(
  base64Image: string,
  minConfidence = 0.35,
): Promise<FoodRecognitionResult> {
  let labels: FoodLabel[] = [];
  let usedFallback = false;

  // Primary: Gemini Vision API
  try {
    labels = await recogniseViaGemini(base64Image);
  } catch (_unused) {
    labels = [];
  }

  // Fallback: Clarifai if Gemini returned nothing
  if (labels.length === 0) {
    try {
      const clarifaiLabels = await recogniseViaClarifai(base64Image);
      if (clarifaiLabels.length > 0) {
        labels = clarifaiLabels;
        usedFallback = true;
      }
    } catch (_unused) {
      // Both failed — return empty
    }
  }

  // Filter by confidence threshold
  const filtered = labels.filter((l) => l.confidence >= minConfidence);

  if (filtered.length === 0) {
    return {
      labels: [],
      primaryFood: '',
      summary: 'No food items detected. Try a clearer, well-lit photo.',
      usedFallback,
    };
  }

  const primaryFood = filtered[0].name;
  const topFive = filtered.slice(0, 5);
  const summary = topFive
    .map((l) => `${l.name} (${Math.round(l.confidence * 100)}%)`)
    .join(', ');

  return {
    labels: filtered,
    primaryFood,
    summary: `Detected: ${summary}`,
    usedFallback,
  };
}

/**
 * Convenience: recognise food and immediately look up the best USDA match.
 * Tries multiple search terms to maximise the chance of a high-confidence match.
 * Falls back to Gemini nutrition estimate if USDA has no match.
 */
export async function recogniseAndLookup(base64Image: string) {
  const recognition = await recogniseFoodInImage(base64Image);
  if (!recognition.primaryFood) {
    return { recognition, usdaItem: null };
  }

  const { lookupBestUsdaMatchWithFallback } = await import('./usda-fdc');
  const usdaItem = await lookupBestUsdaMatchWithFallback(recognition.labels.map(l => l.name));

  return { recognition, usdaItem };
}
