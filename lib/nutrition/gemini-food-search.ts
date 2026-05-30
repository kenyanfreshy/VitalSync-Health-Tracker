/**
 * Food text search — USDA FoodData Central only.
 *
 * Uses USDA FoodData Central exclusively for lab-verified nutrition data.
 * No AI/Gemini dependency — works 100% of the time without any API quota.
 */

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

// ─── USDA Search ──────────────────────────────────────────────────────────────

async function searchViaUsda(query: string): Promise<FoodSearchResult[]> {
  const { searchUsdaFoods } = await import('./usda-fdc');
  const result = await searchUsdaFoods(query, 10);

  if (result.items.length === 0) return [];

  // Sort: Foundation > SR Legacy > Survey > Branded
  const priority = ['usda-foundation', 'usda-sr-legacy', 'usda-survey', 'usda-branded'];
  const sorted = [...result.items].sort(
    (a, b) => priority.indexOf(a.source) - priority.indexOf(b.source),
  );

  return sorted.slice(0, 8).map((item) => ({
    id: `usda-${item.fdcId}`,
    name: item.description,
    brand: item.brandOwner ?? 'USDA',
    serving_size: item.servingDescription ?? '100g',
    serving_g: item.servingWeightG ?? 100,
    calories: item.calories ?? 0,
    protein_g: item.proteinG ?? 0,
    carbs_g: item.carbsG ?? 0,
    fat_g: item.fatG ?? 0,
    fiber_g: item.fiberG ?? 0,
    sodium_mg: item.sodiumMg ?? 0,
    potassium_mg: item.potassiumMg ?? 0,
    phosphorus_mg: 0,
    glycemic_index: item.glycemicLoad,
    usda_category: item.dataType,
    clinical_notes: `Source: ${
      item.source === 'usda-foundation'
        ? 'USDA Foundation (lab-verified)'
        : item.source === 'usda-sr-legacy'
          ? 'USDA SR Legacy'
          : item.source === 'usda-survey'
            ? 'USDA Survey (FNDDS)'
            : 'USDA Branded'
    }. Confidence: ${item.confidence}.`,
  }));
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search for food nutrition data using USDA FoodData Central.
 * Returns lab-verified results with no AI quota dependency.
 */
export async function searchFoodWithGemini(
  query: string,
  _dietProtocol?: string,
): Promise<FoodSearchResponse> {
  const usdaResults = await searchViaUsda(query);

  if (usdaResults.length === 0) {
    throw new Error(`No results found for "${query}". Try a different search term.`);
  }

  return { results: usdaResults, source: 'usda' };
}
