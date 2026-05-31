/**
 * Food text search — Gemini 2.5-flash NLP + USDA FoodData Central.
 *
 * Pipeline:
 *   1. Gemini 2.5-flash parses the natural-language query into a clean food
 *      name + optional serving weight (e.g. "grilled salmon 150g" → name:
 *      "grilled salmon", servingG: 150).
 *   2. The extracted name is sent to USDA FoodData Central for lab-verified
 *      nutrition data.
 *   3. If Gemini is unavailable (quota / network), the raw query is sent
 *      directly to USDA as a graceful fallback.
 *
 * Privacy-first: no user data is stored by Gemini beyond the single request.
 */

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// ─── Public types ─────────────────────────────────────────────────────────────

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
  source: 'usda';
}

// ─── Gemini NLP query parser ──────────────────────────────────────────────────

interface ParsedQuery {
  /** Clean food name suitable for USDA search (e.g. "grilled salmon") */
  foodName: string;
  /** Serving weight in grams if mentioned (e.g. 150 for "150g"), else null */
  servingG: number | null;
}

const NLP_PROMPT = `You are a nutrition assistant. Parse the user's food query into a structured format.

Return ONLY a JSON object — no markdown, no explanation:
{
  "foodName": "clean food name for database search",
  "servingG": null
}

Rules:
- foodName: keep cooking method if nutritionally relevant (e.g. "grilled salmon" stays). Remove quantity words. Keep brand names.
- servingG: extract grams if explicitly mentioned (e.g. "150g" -> 150, "2 oz" -> 57), else null.
- Always return valid JSON.

User query: `;

async function parseQueryWithGemini(query: string): Promise<ParsedQuery> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: NLP_PROMPT + query }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 128 },
  });

  const tryUrl = async (url: string): Promise<ParsedQuery | null> => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) return null;
      const json = await res.json();
      const text: string =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const clean = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean) as ParsedQuery;
      if (typeof parsed.foodName === 'string' && parsed.foodName.trim()) {
        return {
          foodName: parsed.foodName.trim(),
          servingG:
            typeof parsed.servingG === 'number' && parsed.servingG > 0
              ? parsed.servingG
              : null,
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const result =
    (await tryUrl(GEMINI_URL)) ?? (await tryUrl(GEMINI_FALLBACK_URL));

  // Graceful degradation: use raw query if Gemini is unavailable
  return result ?? { foodName: query.trim(), servingG: null };
}

// ─── USDA Search ──────────────────────────────────────────────────────────────

async function searchViaUsda(
  query: string,
  overrideServingG?: number | null,
): Promise<FoodSearchResult[]> {
  const { searchUsdaFoods } = await import('./usda-fdc');
  const result = await searchUsdaFoods(query, 10);
  if (result.items.length === 0) return [];

  // Sort: Foundation > SR Legacy > Survey > Branded
  const priority = [
    'usda-foundation',
    'usda-sr-legacy',
    'usda-survey',
    'usda-branded',
  ];
  const sorted = [...result.items].sort(
    (a, b) => priority.indexOf(a.source) - priority.indexOf(b.source),
  );

  return sorted.slice(0, 8).map((item) => {
    const servingG =
      overrideServingG != null && overrideServingG > 0
        ? overrideServingG
        : (item.servingWeightG ?? 100);

    const servingLabel =
      overrideServingG != null && overrideServingG > 0
        ? `${overrideServingG}g (user-specified)`
        : (item.servingDescription ?? '100g');

    // Scale nutrients to the serving size (USDA values are per 100g)
    const scale = servingG / 100;
    const scaleN = (v: number | null) =>
      v != null ? Math.round(v * scale * 10) / 10 : 0;

    const sourceLabel =
      item.source === 'usda-foundation'
        ? 'USDA Foundation (lab-verified)'
        : item.source === 'usda-sr-legacy'
          ? 'USDA SR Legacy'
          : item.source === 'usda-survey'
            ? 'USDA Survey (FNDDS)'
            : 'USDA Branded';

    return {
      id: `usda-${item.fdcId}`,
      name: item.description,
      brand: item.brandOwner ?? 'USDA',
      serving_size: servingLabel,
      serving_g: servingG,
      calories: scaleN(item.calories),
      protein_g: scaleN(item.proteinG),
      carbs_g: scaleN(item.carbsG),
      fat_g: scaleN(item.fatG),
      fiber_g: scaleN(item.fiberG),
      sodium_mg: scaleN(item.sodiumMg),
      potassium_mg: scaleN(item.potassiumMg),
      phosphorus_mg: 0,
      glycemic_index: item.glycemicLoad,
      usda_category: item.dataType,
      clinical_notes: `Source: ${sourceLabel}. Confidence: ${item.confidence}. Parsed via Gemini 2.5-flash NLP.`,
    };
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search for food nutrition data using Gemini 2.5-flash NLP + USDA FoodData Central.
 *
 * Gemini parses the natural-language query into a clean food name and optional
 * serving weight. USDA provides lab-verified nutrition values. If Gemini is
 * unavailable the raw query is sent directly to USDA.
 */
export async function searchFoodWithGemini(
  query: string,
  _dietProtocol?: string,
): Promise<FoodSearchResponse> {
  // Step 1: NLP parsing via Gemini 2.5-flash
  const { foodName, servingG } = await parseQueryWithGemini(query);

  // Step 2: USDA lookup with the parsed food name
  const usdaResults = await searchViaUsda(foodName, servingG);

  if (usdaResults.length === 0) {
    // If Gemini changed the query and got no results, retry with original
    if (foodName.toLowerCase() !== query.trim().toLowerCase()) {
      const fallbackResults = await searchViaUsda(query.trim(), servingG);
      if (fallbackResults.length > 0) {
        return { results: fallbackResults, source: 'usda' };
      }
    }
    throw new Error(
      `No results found for "${query}". Try a different search term.`,
    );
  }

  return { results: usdaResults, source: 'usda' };
}
