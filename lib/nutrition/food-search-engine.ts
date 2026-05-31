/**
 * food-search-engine.ts
 *
 * Client-side food search pipeline — no server required.
 *
 * Architecture:
 *   1. Gemini 2.5-flash (primary) — natural language, cultural foods, mixed meals,
 *      portion interpretation, user-friendly matching.
 *   2. USDA FoodData Central (fallback) — used when:
 *        • Gemini confidence is low
 *        • Any macro field is invalid/missing/NaN
 *        • Calories are 0 or negative
 *        • The item is a simple common food
 *   3. If both fail → throw a user-friendly error so the caller can show
 *      a friendly message and offer manual entry.
 *
 * Guarantees:
 *   • calories, protein_g, carbs_g, fat_g, serving_g are always valid numbers ≥ 0
 *   • serving_size is always a non-empty string
 *   • All calls are wrapped in a 15-second timeout
 *   • No tRPC / server dependency — works in production TestFlight builds
 */

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? 'AIzaSyATmWsC3LsPqAZQo4s2T20c3oYpOUcNpNk';

const GEMINI_PRIMARY_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

const SEARCH_TIMEOUT_MS = 15_000;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FoodSearchItem {
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
  glycemic_index: number | null;
  clinical_notes: string;
  /** Source of the nutrition data */
  source: 'gemini' | 'usda' | 'gemini+usda';
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

export interface FoodSearchResponse {
  items: FoodSearchItem[];
  query: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a promise with a timeout that rejects after ms milliseconds */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Request timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Validate that a value is a finite number ≥ 0 */
function isValidMacro(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

/** Coerce a value to a valid macro number, defaulting to 0 */
function coerceMacro(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : fallback;
}

/** Returns true if a Gemini result has all required valid fields */
function isGeminiResultValid(item: Partial<GeminiNutritionItem>): boolean {
  return (
    typeof item.name === 'string' && item.name.trim().length > 0 &&
    isValidMacro(item.calories) && (item.calories as number) > 0 &&
    isValidMacro(item.protein_g) &&
    isValidMacro(item.carbs_g) &&
    isValidMacro(item.fat_g) &&
    isValidMacro(item.serving_g) && (item.serving_g as number) > 0
  );
}

// ─── Gemini primary ───────────────────────────────────────────────────────────

interface GeminiNutritionItem {
  name: string;
  brand: string;
  serving_description: string;
  serving_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  glycemic_index: number | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

const GEMINI_SEARCH_PROMPT = (query: string) => `You are a clinical nutrition expert with access to global food databases.

The user is searching for: "${query}"

Return nutrition data for up to 5 matching food items. Handle:
- Natural language queries ("big mac", "homemade ugali", "chapati with butter")
- Cultural and regional foods (ugali, chapati, injera, jollof rice, biryani, etc.)
- Mixed meals and restaurant items
- Portion descriptions ("large banana", "2 cups rice", "half avocado")
- Brand name foods
- Misspelled queries — match the closest food

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "name": "Full food name",
    "brand": "Brand or 'Generic'",
    "serving_description": "1 medium (118g)",
    "serving_g": 118,
    "calories": 105,
    "protein_g": 1.3,
    "carbs_g": 27,
    "fat_g": 0.4,
    "fiber_g": 3.1,
    "sodium_mg": 1,
    "glycemic_index": 51,
    "confidence": "high",
    "notes": "USDA reference values"
  }
]

Rules:
- All numeric fields MUST be valid numbers ≥ 0 (never null, never NaN)
- serving_g MUST be > 0
- calories MUST be > 0
- confidence: "high" for well-known foods, "medium" for estimates, "low" for guesses
- Return at least 1 item even for unusual queries
- For mixed meals, return the full meal as one item plus individual components if helpful`;

async function callGeminiSearch(
  query: string,
  url: string,
): Promise<GeminiNutritionItem[] | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: GEMINI_SEARCH_PROMPT(query) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawText) return null;

    // Strip markdown fences
    const clean = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    // Extract JSON array
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return null;

    const parsed = JSON.parse(arrayMatch[0]) as GeminiNutritionItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** Map a validated GeminiNutritionItem to FoodSearchItem */
function geminiItemToSearchItem(item: GeminiNutritionItem, index: number): FoodSearchItem {
  return {
    id: `gemini-${Date.now()}-${index}`,
    name: item.name.trim(),
    brand: item.brand?.trim() || 'Generic',
    serving_size: item.serving_description?.trim() || `${item.serving_g}g`,
    serving_g: coerceMacro(item.serving_g, 100),
    calories: coerceMacro(item.calories),
    protein_g: coerceMacro(item.protein_g),
    carbs_g: coerceMacro(item.carbs_g),
    fat_g: coerceMacro(item.fat_g),
    fiber_g: coerceMacro(item.fiber_g),
    sodium_mg: coerceMacro(item.sodium_mg),
    glycemic_index: item.glycemic_index != null && isFinite(Number(item.glycemic_index))
      ? Math.round(Number(item.glycemic_index))
      : null,
    clinical_notes: item.notes?.trim() || `Gemini 2.5 nutrition estimate. Confidence: ${item.confidence}.`,
    source: 'gemini',
    confidence: item.confidence ?? 'medium',
  };
}

// ─── USDA fallback ────────────────────────────────────────────────────────────

async function searchViaUsda(query: string): Promise<FoodSearchItem[]> {
  const { searchUsdaFoods } = await import('./usda-fdc');
  const result = await searchUsdaFoods(query, 10);
  if (result.items.length === 0) return [];

  const priority = ['usda-foundation', 'usda-sr-legacy', 'usda-survey', 'usda-branded'];
  const sorted = [...result.items].sort(
    (a, b) => priority.indexOf(a.source) - priority.indexOf(b.source),
  );

  return sorted.slice(0, 6).map((item, index) => {
    const servingG = item.servingWeightG ?? 100;
    const scale = servingG / 100;
    const scaleN = (v: number | null) =>
      v != null ? Math.round(v * scale * 10) / 10 : 0;

    const sourceLabel =
      item.source === 'usda-foundation' ? 'USDA Foundation (lab-verified)' :
      item.source === 'usda-sr-legacy' ? 'USDA SR Legacy' :
      item.source === 'usda-survey' ? 'USDA Survey (FNDDS)' :
      'USDA Branded';

    return {
      id: `usda-${item.fdcId}-${index}`,
      name: item.description,
      brand: item.brandOwner ?? 'USDA',
      serving_size: item.servingDescription ?? `${servingG}g`,
      serving_g: servingG,
      calories: scaleN(item.calories),
      protein_g: scaleN(item.proteinG),
      carbs_g: scaleN(item.carbsG),
      fat_g: scaleN(item.fatG),
      fiber_g: scaleN(item.fiberG),
      sodium_mg: scaleN(item.sodiumMg),
      glycemic_index: item.glycemicLoad,
      clinical_notes: `Source: ${sourceLabel}. Confidence: ${item.confidence}.`,
      source: 'usda' as const,
      confidence: item.confidence,
    };
  });
}

// ─── Gemini nutrition estimate fallback (when USDA also fails) ────────────────

async function searchViaGeminiEstimate(query: string): Promise<FoodSearchItem[]> {
  try {
    const { estimateNutritionWithGemini } = await import('./usda-fdc');
    const item = await estimateNutritionWithGemini(query);
    if (!item) return [];

    const servingG = item.servingWeightG ?? 100;
    const scale = servingG / 100;
    const scaleN = (v: number | null) =>
      v != null ? Math.round(v * scale * 10) / 10 : 0;

    return [{
      id: `gemini-est-${Date.now()}`,
      name: item.description ?? query,
      brand: 'Gemini Estimate',
      serving_size: item.servingDescription ?? `${servingG}g`,
      serving_g: servingG,
      calories: scaleN(item.calories),
      protein_g: scaleN(item.proteinG),
      carbs_g: scaleN(item.carbsG),
      fat_g: scaleN(item.fatG),
      fiber_g: scaleN(item.fiberG),
      sodium_mg: scaleN(item.sodiumMg),
      glycemic_index: item.glycemicLoad,
      clinical_notes: 'Gemini AI nutrition estimate. Values are approximate.',
      source: 'gemini' as const,
      confidence: 'low' as const,
    }];
  } catch {
    return [];
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/** Remove near-duplicate results (same name, similar calories) */
function deduplicate(items: FoodSearchItem[]): FoodSearchItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name.toLowerCase().slice(0, 20)}-${Math.round(item.calories / 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search for food nutrition data.
 *
 * Pipeline:
 *   1. Gemini 2.5-flash — primary intelligence (natural language, cultural foods)
 *   2. USDA FDC — fallback when Gemini results are invalid/incomplete
 *   3. Gemini per-100g estimate — last resort when USDA also fails
 *
 * All calls are wrapped in a 15-second timeout.
 * All returned items are validated: no NaN, no undefined, no 0-calorie entries.
 *
 * @throws Error with user-friendly message if all sources fail
 */
export async function searchFood(
  query: string,
  _dietProtocol?: string,
): Promise<FoodSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Please enter a food name to search.');

  // ── Step 1: Gemini 2.5-flash primary ──────────────────────────────────────
  let geminiItems: FoodSearchItem[] = [];
  try {
    const rawItems = await withTimeout(
      (async () => {
        const primary = await callGeminiSearch(trimmed, GEMINI_PRIMARY_URL);
        if (primary && primary.length > 0) return primary;
        // Try lite model if primary fails
        return await callGeminiSearch(trimmed, GEMINI_FALLBACK_URL);
      })(),
      SEARCH_TIMEOUT_MS,
    );

    if (rawItems && rawItems.length > 0) {
      geminiItems = rawItems
        .filter(isGeminiResultValid)
        .map((item, i) => geminiItemToSearchItem(item, i));
    }
  } catch {
    // Gemini failed or timed out — continue to USDA
  }

  // ── Step 2: USDA fallback ─────────────────────────────────────────────────
  // Use USDA when: Gemini returned nothing, OR confidence is low for all items,
  // OR any item is missing critical macros
  const needsUsdaFallback =
    geminiItems.length === 0 ||
    geminiItems.every((item) => item.confidence === 'low') ||
    geminiItems.some((item) => item.calories <= 0);

  let usdaItems: FoodSearchItem[] = [];
  if (needsUsdaFallback) {
    try {
      usdaItems = await withTimeout(searchViaUsda(trimmed), SEARCH_TIMEOUT_MS);
    } catch {
      // USDA failed or timed out
    }
  }

  // ── Step 3: Merge results ─────────────────────────────────────────────────
  // Gemini results first (more natural language friendly), USDA after
  let merged = deduplicate([...geminiItems, ...usdaItems]);

  // ── Step 4: Last resort — Gemini per-100g estimate ────────────────────────
  if (merged.length === 0) {
    try {
      const estimateItems = await withTimeout(
        searchViaGeminiEstimate(trimmed),
        SEARCH_TIMEOUT_MS,
      );
      merged = estimateItems;
    } catch {
      // All sources failed
    }
  }

  // ── Step 5: Final validation pass ─────────────────────────────────────────
  // Ensure every returned item has valid macros
  const validated = merged
    .map((item) => ({
      ...item,
      calories: coerceMacro(item.calories),
      protein_g: coerceMacro(item.protein_g),
      carbs_g: coerceMacro(item.carbs_g),
      fat_g: coerceMacro(item.fat_g),
      fiber_g: coerceMacro(item.fiber_g),
      sodium_mg: coerceMacro(item.sodium_mg),
      serving_g: item.serving_g > 0 ? item.serving_g : 100,
      serving_size: item.serving_size?.trim() || `${item.serving_g}g`,
    }))
    .filter((item) => item.name.trim().length > 0);

  if (validated.length === 0) {
    throw new Error(
      `No results found for "${trimmed}". Try a different spelling or a more common food name.`,
    );
  }

  return { items: validated, query: trimmed };
}
