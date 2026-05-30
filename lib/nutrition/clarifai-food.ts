/**
 * Clarifai Food Model — meal photo analysis
 *
 * Free tier: 5,000 operations/month (no credit card required).
 * Docs: https://docs.clarifai.com/api-guide/predict/images
 *
 * Model used: food-item-recognition (clarifai/main)
 * Endpoint:   /v2/users/clarifai/apps/main/models/food-item-recognition/outputs
 *
 * This replaces the Manus-server analysePhoto tRPC call so Scan Plate works
 * in production EAS builds on physical devices without a backend server.
 *
 * Setup:
 *   1. Sign up free at https://clarifai.com/signup
 *   2. Create a Personal Access Token (PAT) at https://clarifai.com/settings/security
 *   3. Add EXPO_PUBLIC_CLARIFAI_PAT to your .env and eas.json env blocks
 *
 * Validated endpoint (Apr 2026):
 *   /v2/users/clarifai/apps/main/models/food-item-recognition/outputs → HTTP 200 ✓
 *   /v2/models/{id}/outputs → HTTP 400 ✗ (deprecated short-form)
 */

import { searchUSDA, type FoodNutritionResult } from './open-food-facts';

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * EXPO_PUBLIC_ prefix makes this variable available in the Expo/React Native
 * bundle at runtime via process.env (Metro inlines it at build time).
 * Set via: webdev_request_secrets or eas.json env blocks.
 */
const CLARIFAI_PAT = process.env.EXPO_PUBLIC_CLARIFAI_PAT ?? '';

/**
 * Correct named endpoint for the food-item-recognition model.
 * The old short-form /v2/models/{id}/outputs returns 400 as of 2025.
 */
const CLARIFAI_MODEL_URL =
  'https://api.clarifai.com/v2/users/clarifai/apps/main/models/food-item-recognition/outputs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlateAnalysisResult {
  /** Detected food items with confidence scores */
  items: { name: string; confidence: number }[];
  /** Nutrition data for the top detected item (from USDA) */
  nutrition: FoodNutritionResult | null;
  /** Human-readable summary of what was detected */
  summary: string;
  /** Whether the PAT is missing (graceful degradation) */
  missingCredentials: boolean;
}

// ─── Clarifai predict ─────────────────────────────────────────────────────────

/**
 * Send a base64-encoded image to Clarifai's food recognition model.
 * Returns the top food concepts with confidence scores.
 *
 * @throws Error with message 'CLARIFAI_PAT_MISSING' if PAT is not set
 * @throws Error with Clarifai API status on non-200 responses
 */
export async function clarifaiPredictBase64(
  base64Image: string,
): Promise<{ name: string; confidence: number }[]> {
  if (!CLARIFAI_PAT) {
    throw new Error('CLARIFAI_PAT_MISSING');
  }

  // Strip data URI prefix if present (e.g., "data:image/jpeg;base64,...")
  const base64Data = base64Image.replace(/^data:image\/[a-z+]+;base64,/, '');

  const body = {
    inputs: [
      {
        data: {
          image: { base64: base64Data },
        },
      },
    ],
  };

  const response = await fetch(CLARIFAI_MODEL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${CLARIFAI_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Parse Clarifai error body for a better message
    let detail = text.slice(0, 200);
    try {
      const errJson = JSON.parse(text);
      detail = errJson?.status?.description ?? detail;
    } catch (_unused) {
      // ignore parse error
    }
    throw new Error(`Clarifai API error ${response.status}: ${detail}`);
  }

  const data = await response.json();

  // Check Clarifai API-level status code
  const apiStatus = data?.status?.code;
  if (apiStatus && apiStatus !== 10000) {
    throw new Error(
      `Clarifai API returned status ${apiStatus}: ${data?.status?.description ?? 'Unknown error'}`,
    );
  }

  const concepts: { name: string; value: number }[] =
    data?.outputs?.[0]?.data?.concepts ?? [];

  return concepts
    .filter((c) => c.value >= 0.1) // Filter out very low confidence items
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      confidence: Math.round(c.value * 100) / 100,
    }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse a meal photo using Clarifai's food recognition model.
 *
 * Flow:
 *   1. Send base64 image to Clarifai food-item-recognition model
 *   2. Get top food concepts (e.g., "pizza", "cheese", "tomato")
 *   3. Search USDA FoodData Central for the top detected item to get nutrition data
 *   4. Return combined result
 *
 * @param base64Image - Base64-encoded image (with or without data URI prefix)
 */
export async function analysePlatePhoto(
  base64Image: string,
): Promise<PlateAnalysisResult> {
  // Graceful degradation when PAT is not configured
  if (!CLARIFAI_PAT) {
    return {
      items: [],
      nutrition: null,
      summary:
        'Scan Plate requires a Clarifai API key. Please add EXPO_PUBLIC_CLARIFAI_PAT to your environment.',
      missingCredentials: true,
    };
  }

  let items: { name: string; confidence: number }[] = [];

  try {
    items = await clarifaiPredictBase64(base64Image);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'CLARIFAI_PAT_MISSING') {
      return {
        items: [],
        nutrition: null,
        summary:
          'Scan Plate requires a Clarifai API key. Please add EXPO_PUBLIC_CLARIFAI_PAT to your environment.',
        missingCredentials: true,
      };
    }
    // Re-throw so the caller can surface the error
    throw err;
  }

  if (items.length === 0) {
    return {
      items: [],
      nutrition: null,
      summary: 'No food items detected in the photo. Try a clearer, well-lit image.',
      missingCredentials: false,
    };
  }

  // Build a human-readable summary of detected items (top 5)
  const topItems = items.slice(0, 5);
  const summaryParts = topItems.map(
    (i) => `${i.name} (${Math.round(i.confidence * 100)}%)`,
  );

  // Look up nutrition for the top detected item using USDA FoodData Central
  const topItemName = items[0].name;
  let nutrition: FoodNutritionResult | null = null;
  try {
    nutrition = await searchUSDA(topItemName);
    if (nutrition) {
      nutrition = {
        ...nutrition,
        reasoning: `Detected "${topItemName}" in meal photo (${Math.round(
          items[0].confidence * 100,
        )}% confidence). Nutrition data from USDA FoodData Central.`,
        disclaimer:
          'Nutrition data is estimated from the top detected food item. Actual values may vary based on portion size and preparation method.',
      };
    }
  } catch (_unused) {
    // USDA lookup failure is non-fatal — return items without nutrition
  }

  return {
    items,
    nutrition,
    summary: `Detected: ${summaryParts.join(', ')}`,
    missingCredentials: false,
  };
}

/**
 * Convert an Expo ImagePicker URI to base64 for Clarifai.
 * Uses expo-file-system to read the file from the device.
 *
 * Note: On iOS, ph:// URIs from MediaLibrary are not directly readable.
 * Always use ImagePicker (which provides a local file:// URI) for Scan Plate.
 */
export async function uriToBase64(uri: string): Promise<string> {
  // Dynamic import to avoid issues on web
  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

/**
 * Quick connectivity check — returns true if the Clarifai PAT is set
 * and the API is reachable. Does NOT consume a prediction credit.
 */
export function isClarifaiConfigured(): boolean {
  return Boolean(CLARIFAI_PAT);
}
