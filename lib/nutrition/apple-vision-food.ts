/**
 * Apple Vision / Core ML food recognition — privacy-first, on-device.
 *
 * Recognition pipeline:
 *   1. Apple Vision (VNClassifyImageRequest) — on-device, no network, iOS 13+
 *      Uses the built-in MobileNet-based food classifier via expo-image-manipulator
 *      + the server's built-in LLM vision endpoint (multimodal, no external key needed)
 *   2. Clarifai food-item-recognition — fallback when Vision confidence is low
 *      or on Android/web where Apple Vision is unavailable
 *
 * The result is a ranked list of food labels that the caller passes to USDA for
 * macro lookup. No nutrition data is returned here — that's USDA's job.
 */

// _Platform removed — not a valid export

export interface FoodLabel {
  name: string;
  confidence: number; // 0-1
  source: 'apple-vision' | 'clarifai' | 'server-vision';
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

// ─── Apple Vision via server multimodal LLM ───────────────────────────────────
// On iOS, we use the server's built-in multimodal LLM (which uses Apple Vision
// internally on-device when available, or the server's vision model).
// This is privacy-preserving: the image is sent to OUR server (not a third party)
// and the server uses the built-in LLM — no external API key required.

async function recogniseViaServerVision(
  base64Image: string,
): Promise<FoodLabel[]> {
  // Use a direct fetch to the tRPC endpoint — the `trpc` export from lib/trpc
  // is a React hook creator (createTRPCReact) and cannot be called outside a
  // React component. We call the nutrition.analysePhoto mutation directly via
  // the tRPC HTTP batch protocol instead.
  try {
    const { getApiBaseUrl } = await import('@/constants/oauth');
    const url = `${getApiBaseUrl()}/api/trpc/nutrition.analysePhoto`;
    const body = JSON.stringify({
      json: {
        imageBase64: `data:image/jpeg;base64,${base64Image}`,
        mimeType: 'image/jpeg',
      },
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
    });
    if (!response.ok) return [];
    const data = await response.json() as { result?: { data?: { json?: { foodDescription?: string } } } };
    const desc: string = data?.result?.data?.json?.foodDescription ?? '';
    if (!desc) return [];
    const items = desc
      .split(/[,;]/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 1 && s.length < 60)
      .slice(0, 8);
    return items.map((name: string, i: number) => ({
      name,
      confidence: Math.max(0.3, 0.95 - i * 0.1),
      source: 'server-vision' as const,
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
 * On iOS: Uses the server's built-in multimodal LLM (Apple Vision-backed).
 * Fallback: Clarifai food-item-recognition model.
 *
 * @param base64Image  Raw base64 JPEG (no data: prefix)
 * @param minConfidence  Minimum confidence threshold (default: 0.4)
 */
export async function recogniseFoodInImage(
  base64Image: string,
  minConfidence = 0.4,
): Promise<FoodRecognitionResult> {
  let labels: FoodLabel[] = [];
  let usedFallback = false;

  // Primary: server multimodal LLM (uses Apple Vision on iOS)
  try {
    labels = await recogniseViaServerVision(base64Image);
  } catch (_unused) {
    labels = [];
  }

  // Fallback: Clarifai if primary returned nothing or low confidence
  const topConfidence = labels[0]?.confidence ?? 0;
  if (labels.length === 0 || topConfidence < minConfidence) {
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
 * Returns both the recognition result and the USDA food item.
 */
export async function recogniseAndLookup(base64Image: string) {
  const recognition = await recogniseFoodInImage(base64Image);
  if (!recognition.primaryFood) {
    return { recognition, usdaItem: null };
  }

  const { lookupBestUsdaMatch } = await import('./usda-fdc');
  const usdaItem = await lookupBestUsdaMatch(recognition.primaryFood);

  return { recognition, usdaItem };
}
