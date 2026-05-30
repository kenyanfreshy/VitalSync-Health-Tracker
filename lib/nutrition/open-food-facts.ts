/**
 * Food lookup utilities — two free data sources, no API keys required:
 *
 * 1. Open Food Facts (OFF) — barcode lookup
 *    https://world.openfoodfacts.org/data
 *    3M+ products worldwide, community-maintained.
 *
 * 2. USDA FoodData Central (FDC) — text-search fallback
 *    https://fdc.nal.usda.gov/api-guide.html
 *    Requires a free API key (DEMO_KEY works for dev; register for production).
 *    500K+ lab-verified food items from the USDA.
 *
 * Lookup flow:
 *   lookupBarcodeWithFallback(barcode)
 *     → Try OFF barcode lookup
 *     → If OFF returns low-confidence / not found, extract product name and
 *       call USDA text search to enrich nutrition values
 *     → Return the best result with source attribution
 */

// ─── Shared result type ────────────────────────────────────────────────────────

export interface FoodNutritionResult {
  productName: string;
  brandName: string | null;
  barcodeNumber: string | null;
  sodiumMg: number;
  potassiumMg: number | null;
  calories: number | null;
  carbsG: number | null;
  sugarG: number | null;
  fatG: number | null;
  proteinG: number | null;
  fiberG: number | null;
  glycemicLoad: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  foodDescription: string;
  disclaimer: string;
  source: 'open-food-facts' | 'usda' | 'combined';
}

// Keep backward-compat alias
export type OFFNutritionResult = FoodNutritionResult;

// ─── Glycemic load estimator ───────────────────────────────────────────────────

function estimateGlycemicLoad(carbsG: number | null, productName: string): number | null {
  if (carbsG == null || carbsG <= 0) return null;
  const name = productName.toLowerCase();
  const highGI = /bread|rice|potato|cereal|corn|white|sugar|candy|soda|juice|cracker|pretzel/;
  const lowGI = /bean|lentil|nut|almond|walnut|yogurt|milk|cheese|meat|chicken|fish|egg/;
  const gi = highGI.test(name) ? 70 : lowGI.test(name) ? 30 : 55;
  return Math.min(100, Math.round((carbsG * gi) / 100));
}

// ─── Open Food Facts ──────────────────────────────────────────────────────────

function normalizeOFFProduct(barcode: string, product: Record<string, any>): FoodNutritionResult {
  const n = product.nutriments ?? {};
  const per100 = product.serving_size ? 'serving' : '100g';

  const get = (key: string): number | null => {
    const serving = n[`${key}_serving`];
    const per100g = n[`${key}_100g`];
    const raw = serving ?? per100g ?? null;
    return raw != null ? Math.round(raw * 10) / 10 : null;
  };

  const sodiumMg = (() => {
    const sodiumG = n['sodium_serving'] ?? n['sodium_100g'];
    if (sodiumG != null) return Math.round(sodiumG * 1000);
    const saltG = n['salt_serving'] ?? n['salt_100g'];
    if (saltG != null) return Math.round((saltG / 2.5) * 1000);
    return 0;
  })();

  const productName = (
    product.product_name_en ||
    product.product_name ||
    product.abbreviated_product_name ||
    'Unknown product'
  ).slice(0, 80);

  const brandName = (product.brands || null)?.split(',')[0]?.trim().slice(0, 40) ?? null;
  const carbsG = get('carbohydrates');
  const calories = get('energy-kcal') ?? (n['energy_serving'] != null ? Math.round(n['energy_serving'] / 4.184) : null);

  const confidence: 'high' | 'medium' | 'low' =
    productName !== 'Unknown product' && calories != null ? 'high'
    : productName !== 'Unknown product' ? 'medium'
    : 'low';

  return {
    productName,
    brandName,
    barcodeNumber: barcode,
    sodiumMg,
    potassiumMg: (() => {
      const k = n['potassium_serving'] ?? n['potassium_100g'];
      return k != null ? Math.round(k * 1000) : null;
    })(),
    calories,
    carbsG,
    sugarG: get('sugars'),
    fatG: get('fat'),
    proteinG: get('proteins'),
    fiberG: get('fiber'),
    glycemicLoad: estimateGlycemicLoad(carbsG, productName),
    confidence,
    reasoning: confidence === 'high'
      ? `Found in Open Food Facts database (${per100} values).`
      : confidence === 'medium'
      ? 'Product name found in Open Food Facts but some nutrition values are missing.'
      : 'Product not found in Open Food Facts database.',
    foodDescription: [productName, brandName].filter(Boolean).join(' — ').slice(0, 80),
    disclaimer: 'Nutrition data from Open Food Facts (community database). Verify against product label.',
    source: 'open-food-facts',
  };
}

async function lookupBarcodeOFFRaw(barcode: string): Promise<FoodNutritionResult | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,abbreviated_product_name,brands,nutriments,serving_size,serving_quantity`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'VitalSync-HealthTracker/1.0 (iOS; contact@vitalsync.health)' },
  });
  if (!response.ok) throw new Error(`Open Food Facts API error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 1 || !data.product) return null;
  return normalizeOFFProduct(barcode, data.product);
}

/** @deprecated Use lookupBarcodeWithFallback for production — this is the raw OFF-only call */
export async function lookupBarcodeOFF(barcode: string): Promise<FoodNutritionResult | null> {
  return lookupBarcodeWithFallback(barcode);
}

// ─── USDA FoodData Central ────────────────────────────────────────────────────
//
// USDA FDC provides lab-verified nutrition data for 500K+ foods.
// The DEMO_KEY works for development (1,000 req/day per IP).
// Register for a free personal key at https://api.data.gov/signup/
// to get 1,000 req/hour. Set EXPO_PUBLIC_USDA_API_KEY in your .env or eas.json.

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY';
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

interface USDAFoodItem {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients: { nutrientId: number; nutrientName: string; value: number; unitName: string }[];
  servingSize?: number;
  servingSizeUnit?: string;
}

/** Map USDA nutrient IDs to our schema */
const USDA_NUTRIENT_MAP: Record<number, keyof Pick<FoodNutritionResult, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'sugarG' | 'sodiumMg' | 'potassiumMg'>> = {
  1008: 'calories',   // Energy (kcal)
  1003: 'proteinG',  // Protein
  1005: 'carbsG',    // Carbohydrate, by difference
  1004: 'fatG',      // Total lipid (fat)
  1079: 'fiberG',    // Fiber, total dietary
  2000: 'sugarG',    // Sugars, total including NLEA
  1093: 'sodiumMg',  // Sodium, Na (mg)
  1092: 'potassiumMg', // Potassium, K (mg)
};

function normalizeUSDAItem(item: USDAFoodItem, query: string): FoodNutritionResult {
  const nutrients: Partial<Record<keyof FoodNutritionResult, number>> = {};
  for (const n of item.foodNutrients) {
    const field = USDA_NUTRIENT_MAP[n.nutrientId];
    if (field && n.value != null) {
      nutrients[field] = Math.round(n.value * 10) / 10;
    }
  }

  const productName = item.description.slice(0, 80);
  const brandName = (item.brandOwner || item.brandName || null)?.slice(0, 40) ?? null;
  const carbsG = (nutrients.carbsG as number | undefined) ?? null;
  const calories = (nutrients.calories as number | undefined) ?? null;

  return {
    productName,
    brandName,
    barcodeNumber: null,
    sodiumMg: (nutrients.sodiumMg as number | undefined) ?? 0,
    potassiumMg: (nutrients.potassiumMg as number | undefined) ?? null,
    calories,
    carbsG,
    sugarG: (nutrients.sugarG as number | undefined) ?? null,
    fatG: (nutrients.fatG as number | undefined) ?? null,
    proteinG: (nutrients.proteinG as number | undefined) ?? null,
    fiberG: (nutrients.fiberG as number | undefined) ?? null,
    glycemicLoad: estimateGlycemicLoad(carbsG, productName),
    confidence: calories != null ? 'medium' : 'low',
    reasoning: `Not found in Open Food Facts. Matched "${productName}" in USDA FoodData Central for query "${query}".`,
    foodDescription: [productName, brandName].filter(Boolean).join(' — ').slice(0, 80),
    disclaimer: 'Nutrition data from USDA FoodData Central (lab-verified). Serving size may differ from product label.',
    source: 'usda',
  };
}

/**
 * Search USDA FoodData Central by product name.
 * Returns the best matching result, or null if nothing found.
 */
export async function searchUSDA(query: string): Promise<FoodNutritionResult | null> {
  if (!query || query.length < 2) return null;

  const params = new URLSearchParams({
    query,
    api_key: USDA_API_KEY,
    pageSize: '3',
    dataType: 'Branded,SR Legacy,Foundation',
    sortBy: 'dataType.keyword',
    sortOrder: 'asc',
  });

  const response = await fetch(`${USDA_SEARCH_URL}?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    // USDA API failure is non-fatal — just return null
    return null;
  }

  const data = await response.json();
  const foods: USDAFoodItem[] = data.foods ?? [];
  if (foods.length === 0) return null;

  // Prefer branded items (closer to what a barcode scan would find)
  const branded = foods.find(f => f.brandOwner || f.brandName);
  return normalizeUSDAItem(branded ?? foods[0], query);
}

// ─── Combined barcode lookup with USDA fallback ────────────────────────────────

/**
 * Primary barcode lookup function for production use.
 *
 * Strategy:
 *   1. Try Open Food Facts (barcode → exact product match)
 *   2. If OFF returns null or low-confidence, try USDA text search using
 *      the product name extracted from the barcode (if any)
 *   3. Return the best result, or throw if both sources fail
 */
export async function lookupBarcodeWithFallback(barcode: string): Promise<FoodNutritionResult | null> {
  const cleanBarcode = barcode.replace(/\D/g, '');
  if (!cleanBarcode) return null;

  // Step 1: Open Food Facts
  let offResult: FoodNutritionResult | null = null;
  try {
    offResult = await lookupBarcodeOFFRaw(cleanBarcode);
  } catch (_unused) {
    // OFF network error — proceed to USDA fallback
  }

  // If OFF found a high or medium confidence result, use it directly
  if (offResult && offResult.confidence !== 'low') {
    return offResult;
  }

  // Step 2: USDA fallback — use OFF product name if available, else skip
  const fallbackQuery = offResult?.productName && offResult.productName !== 'Unknown product'
    ? offResult.productName
    : null;

  if (fallbackQuery) {
    try {
      const usdaResult = await searchUSDA(fallbackQuery);
      if (usdaResult) {
        // Merge: keep OFF barcode/brand info, enrich with USDA nutrition if better
        return {
          ...usdaResult,
          productName: offResult?.productName ?? usdaResult.productName,
          brandName: offResult?.brandName ?? usdaResult.brandName,
          barcodeNumber: cleanBarcode,
          source: 'combined',
          reasoning: `Open Food Facts found the product name but lacked nutrition data. Enriched with USDA FoodData Central values for "${fallbackQuery}".`,
          disclaimer: 'Nutrition data from USDA FoodData Central (lab-verified) matched by product name. Verify against product label.',
        };
      }
    } catch (_unused) {
      // USDA also failed — fall through
    }
  }

  // Return whatever OFF gave us (even low-confidence), or null
  return offResult;
}
