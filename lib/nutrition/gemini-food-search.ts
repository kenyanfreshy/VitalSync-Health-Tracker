/**
 * Gemini-powered food search — replaces the tRPC nutritionAI.searchFood server call.
 *
 * Uses Gemini to act as a registered dietitian and return structured nutrition
 * data for a natural-language food query. Works in production without a backend.
 */

const GEMINI_API_KEY = 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string;
  serving_size: string;
  serving_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  potassium_mg: number;
  phosphorus_mg: number;
  glycemic_index: number | null;
  usda_category: string;
  clinical_notes: string;
}

export interface FoodSearchResponse {
  results: FoodSearchResult[];
}

const SYSTEM_PROMPT = `You are a registered dietitian with access to the USDA FoodData Central (2024) and NCCDB databases.
The user has described a food item or meal in natural language. Identify the most likely food items and return their nutritional profiles.
For each item, use USDA reference values for a standard serving size. Be precise with macros.
Return a JSON object with a 'results' array of up to 8 items. Each item must have:
- id: a short unique slug (lowercase, no spaces)
- name: the food name as it would appear in a nutrition database (e.g. 'Chicken Breast, grilled, 3 oz')
- brand: brand or source if known, otherwise 'Generic'
- serving_size: string description (e.g. '3 oz (85g)')
- serving_g: serving weight in grams (number)
- calories: kcal per serving (number)
- protein_g: protein grams (number)
- carbs_g: total carbohydrate grams (number)
- fat_g: total fat grams (number)
- fiber_g: dietary fiber grams (number)
- sodium_mg: sodium milligrams (number)
- potassium_mg: potassium milligrams (number)
- phosphorus_mg: phosphorus milligrams (number)
- glycemic_index: estimated GI (number 0-100) or null
- usda_category: USDA food category string
- clinical_notes: one sentence about this food's nutritional highlights

Return ONLY the JSON object, no explanation or markdown.`;

export async function searchFoodWithGemini(
  query: string,
  dietProtocol?: string,
): Promise<FoodSearchResponse> {
  const userMessage = dietProtocol
    ? `Search query: "${query}"\nDiet protocol: ${dietProtocol}`
    : `Search query: "${query}"`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          { text: userMessage },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Gemini food search failed: HTTP ${response.status}`);
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

  let parsed: { results?: any[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }

  const results: FoodSearchResult[] = (parsed.results ?? []).slice(0, 8).map((r: any, i: number) => ({
    id: String(r.id ?? `food-${i}`),
    name: String(r.name ?? '').slice(0, 120),
    brand: String(r.brand ?? 'Generic').slice(0, 60),
    serving_size: String(r.serving_size ?? '1 serving').slice(0, 60),
    serving_g: Number(r.serving_g ?? 100),
    calories: Number(r.calories ?? 0),
    protein_g: Number(r.protein_g ?? 0),
    carbs_g: Number(r.carbs_g ?? 0),
    fat_g: Number(r.fat_g ?? 0),
    fiber_g: Number(r.fiber_g ?? 0),
    sodium_mg: Number(r.sodium_mg ?? 0),
    potassium_mg: Number(r.potassium_mg ?? 0),
    phosphorus_mg: Number(r.phosphorus_mg ?? 0),
    glycemic_index: r.glycemic_index != null ? Number(r.glycemic_index) : null,
    usda_category: String(r.usda_category ?? 'Other').slice(0, 60),
    clinical_notes: String(r.clinical_notes ?? '').slice(0, 200),
  }));

  return { results };
}
