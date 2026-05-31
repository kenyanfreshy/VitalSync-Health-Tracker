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

// Primary model — gemini-2.0-flash
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
// Fallback model — gemini-1.5-flash (more reliable for vision tasks)
const GEMINI_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const FOOD_SCAN_PROMPT = `You are a nutrition expert. Look at this food image and identify what foods are present.

IMPORTANT: Even if the image is blurry or unclear, make your best estimate. Always return valid JSON.

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "food_identified": ["food item 1", "food item 2"],
  "estimated_calories": 450,
  "macros": {
    "protein_g": 25,
    "carbs_g": 45,
    "fat_g": 15,
    "fiber_g": 5,
    "sodium_mg": 600
  },
  "confidence_score": "medium",
  "serving_description": "1 plate (~350g)"
}

Rules:
- food_identified must always contain at least one item (use "mixed meal" if unsure)
- All macro values must be numbers (not null)
- confidence_score must be "high", "medium", or "low"
- Base values on a typical single serving/plate portion`;

const FOOD_SCAN_SIMPLE_PROMPT = `Look at this food image. What food or meal do you see? Give me the name and approximate nutrition for one serving.

Return ONLY this JSON (no markdown):
{
  "food_identified": ["name of food"],
  "estimated_calories": 400,
  "macros": { "protein_g": 20, "carbs_g": 40, "fat_g": 15, "fiber_g": 3, "sodium_mg": 500 },
  "confidence_score": "low",
  "serving_description": "1 serving"
}`;

/**
 * Call Gemini Vision with a given URL and prompt.
 * Returns parsed DirectNutritionResult or null on failure.
 */
async function callGeminiVision(
  base64Image: string,
  apiUrl: string,
  prompt: string,
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
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
      },
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      // Log status for debugging but don't throw
      return null;
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      error?: { message?: string };
    };

    // Check for API-level errors
    if (data.error) {
      return null;
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawText) return null;

    // Strip markdown code fences if present
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    // Find the JSON object in the response (in case there's extra text)
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as DirectNutritionResult;

    // Validate required fields
    if (!parsed.macros) return null;

    // Ensure food_identified is a non-empty array
    if (!Array.isArray(parsed.food_identified) || parsed.food_identified.length === 0) {
      parsed.food_identified = ['Meal'];
    }

    return {
      food_identified: parsed.food_identified.filter((f) => typeof f === 'string' && f.trim()),
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

/**
 * Analyse a food image using Gemini Vision — returns direct nutrition data.
 *
 * Tries in order:
 *   1. gemini-2.0-flash with detailed prompt
 *   2. gemini-1.5-flash with detailed prompt (fallback model)
 *   3. gemini-1.5-flash with simple prompt (last resort)
 */
export async function analyseImageWithGemini(
  base64Image: string,
): Promise<DirectNutritionResult | null> {
  // Attempt 1: primary model, detailed prompt
  const result1 = await callGeminiVision(base64Image, GEMINI_API_URL, FOOD_SCAN_PROMPT);
  if (result1 && result1.food_identified.length > 0) return result1;

  // Attempt 2: fallback model, detailed prompt
  const result2 = await callGeminiVision(base64Image, GEMINI_FALLBACK_URL, FOOD_SCAN_PROMPT);
  if (result2 && result2.food_identified.length > 0) return result2;

  // Attempt 3: fallback model, simple prompt
  const result3 = await callGeminiVision(base64Image, GEMINI_FALLBACK_URL, FOOD_SCAN_SIMPLE_PROMPT);
  if (result3 && result3.food_identified.length > 0) return result3;

  return null;
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
 *   - Tries gemini-2.0-flash, then gemini-1.5-flash, then simple prompt
 * Step 2: If all Gemini attempts fail → Clarifai labels → USDA lookup
 */
export async function recogniseAndLookup(base64Image: string) {
  // Primary: Gemini single-step analysis (with automatic model fallback)
  const geminiResult = await analyseImageWithGemini(base64Image);

  if (geminiResult && geminiResult.food_identified.length > 0) {
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
