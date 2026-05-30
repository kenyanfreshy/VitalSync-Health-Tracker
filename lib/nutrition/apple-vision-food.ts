/**
 * Food recognition via Gemini Vision API — single-step approach.
 *
 * Sends the image directly to Gemini and gets back structured nutrition data
 * (calories, protein, carbs, fat) in one call — no separate USDA lookup needed.
 *
 * Fallback: Clarifai food-item-recognition → USDA FoodData Central
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

export interface DirectNutritionResult {
  food_identified: string[];
  estimated_calories: number;
  macros: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g?: number;
    sodium_mg?: number;
  };
  confidence_score: 'high' | 'medium' | 'low';
  serving_description?: string;
}

// ─── Gemini Vision API ────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const FOOD_SCAN_PROMPT = `Analyze this food image. Identify the dishes or ingredients present, estimate the portion sizes, and provide an approximate breakdown of calories, protein, carbs, and fats.

Return the response strictly as a JSON object with the following format:
{
  "food_identified": ["item1", "item2"],
  "estimated_calories": 0,
  "macros": {
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0,
    "fiber_g": 0,
    "sodium_mg": 0
  },
  "confidence_score": "high",
  "serving_description": "1 plate (~350g)"
}

Use USDA FoodData Central reference values. Be precise with macros. Return ONLY the JSON object.`;

/**
 * Analyse a food image using Gemini Vision — returns direct nutrition data.
 * This is the single-step approach: image → nutrition JSON (no USDA needed).
 */
export async function analyseImageWithGemini(
  base64Image: string,
): Promise<DirectNutritionResult | null> {
  try {
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
            { text: FOOD_SCAN_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    });

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      // 429 = quota exhausted — signal caller to use fallback
      return null;
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawText) return null;

    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const parsed = JSON.parse(jsonText) as DirectNutritionResult;

    // Validate required fields
    if (!parsed.food_identified || !parsed.macros) return null;

    return {
      food_identified: Array.isArray(parsed.food_identified) ? parsed.food_identified : [],
      estimated_calories: Number(parsed.estimated_calories ?? 0),
      macros: {
        protein_g: Number(parsed.macros.protein_g ?? 0),
        carbs_g: Number(parsed.macros.carbs_g ?? 0),
        fat_g: Number(parsed.macros.fat_g ?? 0),
        fiber_g: parsed.macros.fiber_g != null ? Number(parsed.macros.fiber_g) : undefined,
        sodium_mg: parsed.macros.sodium_mg != null ? Number(parsed.macros.sodium_mg) : undefined,
      },
      confidence_score: parsed.confidence_score ?? 'medium',
      serving_description: parsed.serving_description,
    };
  } catch (_unused) {
    return null;
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

// ─── Legacy recognition (for USDA lookup path) ───────────────────────────────

export async function recogniseFoodInImage(
  base64Image: string,
  _minConfidence = 0.35,
): Promise<FoodRecognitionResult> {
  // Try Clarifai for label-based recognition (used as fallback path)
  const labels = await recogniseViaClarifai(base64Image);

  if (labels.length === 0) {
    return {
      labels: [],
      primaryFood: '',
      summary: 'No food items detected. Try a clearer, well-lit photo.',
      usedFallback: true,
    };
  }

  const primaryFood = labels[0].name;
  const topFive = labels.slice(0, 5);
  const summary = topFive
    .map((l) => `${l.name} (${Math.round(l.confidence * 100)}%)`)
    .join(', ');

  return {
    labels,
    primaryFood,
    summary: `Detected: ${summary}`,
    usedFallback: true,
  };
}

/**
 * Main entry point: analyse food image and return nutrition data.
 *
 * Step 1: Gemini Vision → direct nutrition JSON (single call, no USDA needed)
 * Step 2: If Gemini fails (quota/error) → Clarifai labels → USDA lookup
 */
export async function recogniseAndLookup(base64Image: string) {
  // Primary: Gemini single-step analysis
  const geminiResult = await analyseImageWithGemini(base64Image);

  if (geminiResult && geminiResult.food_identified.length > 0) {
    // Convert to the UsdaFoodItem-compatible shape expected by the caller
    const { UsdaFoodItem } = await import('./usda-fdc').catch(() => ({ UsdaFoodItem: null }));
    const primaryName = geminiResult.food_identified.join(', ');
    const carbsG = geminiResult.macros.carbs_g;

    const syntheticItem = {
      fdcId: -1,
      description: primaryName,
      brandOwner: undefined,
      dataType: 'Survey (FNDDS)',
      calories: geminiResult.estimated_calories,
      proteinG: geminiResult.macros.protein_g,
      carbsG,
      fatG: geminiResult.macros.fat_g,
      fiberG: geminiResult.macros.fiber_g ?? null,
      sugarG: null,
      sodiumMg: geminiResult.macros.sodium_mg ?? null,
      potassiumMg: null,
      glycemicLoad: null,
      servingDescription: geminiResult.serving_description ?? null,
      servingWeightG: null,
      confidence: geminiResult.confidence_score as 'high' | 'medium' | 'low',
      source: 'usda-survey' as const,
    };

    const recognition: FoodRecognitionResult = {
      labels: geminiResult.food_identified.map((name, i) => ({
        name,
        confidence: Math.max(0.5, 0.9 - i * 0.1),
        source: 'gemini-vision' as const,
      })),
      primaryFood: geminiResult.food_identified[0] ?? '',
      summary: `Detected: ${primaryName}`,
      usedFallback: false,
    };

    return { recognition, usdaItem: syntheticItem };
  }

  // Fallback: Clarifai → USDA
  const recognition = await recogniseFoodInImage(base64Image);
  if (!recognition.primaryFood) {
    return { recognition, usdaItem: null };
  }

  const { lookupBestUsdaMatchWithFallback } = await import('./usda-fdc');
  const usdaItem = await lookupBestUsdaMatchWithFallback(
    recognition.labels.map((l) => l.name),
  );

  return { recognition, usdaItem };
}
