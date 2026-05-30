/**
 * USDA FoodData Central (FDC) — direct REST client
 *
 * Privacy-first: all requests go directly from the device to api.nal.usda.gov.
 * No server proxy, no data retention.
 *
 * Free tier: DEMO_KEY = 30 req/hour, 50 req/day.
 * Production: register at https://fdc.nal.usda.gov/api-key-signup.html
 * for 1,000 req/hour. Set EXPO_PUBLIC_USDA_API_KEY in your .env or eas.json.
 *
 * Data types prioritised (most accurate first):
 *   Foundation → SR Legacy → Survey (FNDDS) → Branded
 */

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY';
const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsdaFoodItem {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType: string;
  /** Per-100 g values */
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  /** Estimated glycemic load per 100 g */
  glycemicLoad: number | null;
  /** Serving description from USDA (e.g. "1 medium (118g)") */
  servingDescription: string | null;
  /** Serving weight in grams (null = assume 100 g) */
  servingWeightG: number | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'usda-foundation' | 'usda-sr-legacy' | 'usda-survey' | 'usda-branded';
}

export interface UsdaSearchResult {
  items: UsdaFoodItem[];
  totalHits: number;
  query: string;
}

// ─── Nutrient ID mapping (USDA standard) ─────────────────────────────────────

const NUTRIENT_IDS: Record<string, string> = {
  calories: '1008',      // Energy (kcal)
  protein: '1003',       // Protein
  fat: '1004',           // Total lipid (fat)
  carbs: '1005',         // Carbohydrate, by difference
  fiber: '1079',         // Fiber, total dietary
  sugar: '2000',         // Sugars, total including NLEA
  sodium: '1093',        // Sodium, Na
  potassium: '1092',     // Potassium, K
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractNutrient(
  nutrients: { nutrientId?: number; nutrientNumber?: string; value?: number; amount?: number }[],
  id: string,
): number | null {
  const found = nutrients.find(
    (n) =>
      String(n.nutrientId) === id ||
      String(n.nutrientNumber) === id,
  );
  const raw = found?.value ?? found?.amount ?? null;
  return raw != null ? Math.round(raw * 10) / 10 : null;
}

function estimateGlycemicLoad(carbsG: number | null, name: string): number | null {
  if (carbsG == null || carbsG <= 0) return null;
  const n = name.toLowerCase();
  const highGI = /bread|rice|potato|cereal|corn|white|sugar|candy|soda|juice|cracker|pretzel|bagel|waffle|pancake/;
  const lowGI = /bean|lentil|nut|almond|walnut|yogurt|milk|cheese|meat|chicken|fish|egg|broccoli|spinach|kale|lettuce/;
  const gi = highGI.test(n) ? 70 : lowGI.test(n) ? 30 : 55;
  return Math.min(100, Math.round((carbsG * gi) / 100));
}

function dataTypeToSource(dataType: string): UsdaFoodItem['source'] {
  if (dataType === 'Foundation') return 'usda-foundation';
  if (dataType === 'SR Legacy') return 'usda-sr-legacy';
  if (dataType === 'Survey (FNDDS)') return 'usda-survey';
  return 'usda-branded';
}

function dataTypeToConfidence(dataType: string): UsdaFoodItem['confidence'] {
  if (dataType === 'Foundation' || dataType === 'SR Legacy') return 'high';
  if (dataType === 'Survey (FNDDS)') return 'medium';
  return 'low';
}

function normalizeFood(raw: Record<string, any>): UsdaFoodItem {
  const nutrients: any[] = raw.foodNutrients ?? raw.nutrients ?? [];

  const calories = extractNutrient(nutrients, NUTRIENT_IDS.calories);
  const carbsG = extractNutrient(nutrients, NUTRIENT_IDS.carbs);

  // Some results use nutrientName instead of nutrientId
  const byName = (name: string): number | null => {
    const found = nutrients.find((n) => {
      const nName = (n.nutrientName ?? n.name ?? '').toLowerCase();
      return nName.includes(name.toLowerCase());
    });
    const raw = found?.value ?? found?.amount ?? null;
    return raw != null ? Math.round(raw * 10) / 10 : null;
  };

  const dataType = raw.dataType ?? 'Branded';
  const description = String(raw.description ?? raw.lowercaseDescription ?? '').slice(0, 80);

  // Extract serving info
  const measures: any[] = raw.foodMeasures ?? raw.servingSizes ?? [];
  const firstMeasure = measures[0];
  const servingDescription = firstMeasure?.disseminationText ?? firstMeasure?.description ?? null;
  const servingWeightG = firstMeasure?.gramWeight ?? null;

  return {
    fdcId: raw.fdcId,
    description,
    brandOwner: raw.brandOwner ?? raw.brandName ?? null,
    dataType,
    calories: calories ?? byName('energy'),
    proteinG: extractNutrient(nutrients, NUTRIENT_IDS.protein) ?? byName('protein'),
    carbsG: carbsG ?? byName('carbohydrate'),
    fatG: extractNutrient(nutrients, NUTRIENT_IDS.fat) ?? byName('lipid'),
    fiberG: extractNutrient(nutrients, NUTRIENT_IDS.fiber) ?? byName('fiber'),
    sugarG: extractNutrient(nutrients, NUTRIENT_IDS.sugar) ?? byName('sugar'),
    sodiumMg: extractNutrient(nutrients, NUTRIENT_IDS.sodium) ?? byName('sodium'),
    potassiumMg: extractNutrient(nutrients, NUTRIENT_IDS.potassium) ?? byName('potassium'),
    glycemicLoad: estimateGlycemicLoad(carbsG, description),
    servingDescription,
    servingWeightG,
    confidence: dataTypeToConfidence(dataType),
    source: dataTypeToSource(dataType),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search USDA FoodData Central for a food by name.
 * Returns up to `limit` results, prioritising Foundation and SR Legacy data.
 */
export async function searchUsdaFoods(
  query: string,
  limit = 8,
): Promise<UsdaSearchResult> {
  const params = new URLSearchParams({
    query,
    pageSize: String(limit),
    // Prioritise lab-verified data; include Branded as last resort
    dataType: 'Foundation,SR Legacy,Survey (FNDDS),Branded',
    api_key: USDA_API_KEY,
  });

  const res = await fetch(`${BASE_URL}/foods/search?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`USDA search failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  const foods: UsdaFoodItem[] = (data.foods ?? []).map(normalizeFood);

  return {
    items: foods,
    totalHits: data.totalHits ?? foods.length,
    query,
  };
}

/**
 * Fetch a single food item by FDC ID with full nutrient details.
 */
export async function getUsdaFoodById(fdcId: number): Promise<UsdaFoodItem | null> {
  const res = await fetch(
    `${BASE_URL}/food/${fdcId}?api_key=${USDA_API_KEY}`,
    { headers: { Accept: 'application/json' } },
  );

  if (!res.ok) return null;
  const data = await res.json();
  return normalizeFood(data);
}

/**
 * Quick single-item lookup — returns the best match for a food name.
 * Prefers Foundation > SR Legacy > Survey > Branded.
 */
export async function lookupBestUsdaMatch(
  foodName: string,
): Promise<UsdaFoodItem | null> {
  try {
    const result = await searchUsdaFoods(foodName, 5);
    if (result.items.length === 0) return null;

    // Sort by data quality
    const priority = ['usda-foundation', 'usda-sr-legacy', 'usda-survey', 'usda-branded'];
    const sorted = [...result.items].sort(
      (a, b) => priority.indexOf(a.source) - priority.indexOf(b.source),
    );
    return sorted[0];
  } catch (_unused) {
    return null;
  }
}

/**
 * Scale USDA per-100g values to a specific serving weight.
 */
export function scaleToServing(
  item: UsdaFoodItem,
  servingWeightG: number,
): UsdaFoodItem {
  const factor = servingWeightG / 100;
  const scale = (v: number | null) =>
    v != null ? Math.round(v * factor * 10) / 10 : null;

  return {
    ...item,
    calories: scale(item.calories),
    proteinG: scale(item.proteinG),
    carbsG: scale(item.carbsG),
    fatG: scale(item.fatG),
    fiberG: scale(item.fiberG),
    sugarG: scale(item.sugarG),
    sodiumMg: scale(item.sodiumMg),
    potassiumMg: scale(item.potassiumMg),
    glycemicLoad: scale(item.glycemicLoad),
    servingWeightG,
  };
}
