/**
 * translation-fallback.ts
 *
 * Platform-aware client-side translation fallback for the Personal Health Report.
 *
 * Strategy:
 *   iOS   → Apple's on-device Translation API via expo-translate-text (iOS 18+, no API key needed)
 *   Android / Web → Gemini API (generativelanguage.googleapis.com) via direct REST fetch
 *
 * This module is called ONLY when the primary server-side tRPC translation call fails or
 * when the app is offline. It is never the first choice.
 *
 * Usage:
 *   const translations = await translateWithFallback(strings, targetLang, targetLangName);
 *   // Returns the same shape as the tRPC translate mutation: Record<string, string>
 */

import { Platform } from 'react-native';

// ─── Gemini REST API ──────────────────────────────────────────────────────────

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Translate a flat key→value string map using the Gemini REST API.
 * Requires EXPO_PUBLIC_GEMINI_API_KEY to be set.
 */
async function translateWithGemini(
  strings: Record<string, string>,
  targetLang: string,
  targetLangName: string,
): Promise<Record<string, string>> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('[Gemini fallback] EXPO_PUBLIC_GEMINI_API_KEY is not set');
  }

  const prompt =
    `You are a professional medical app translator. Translate the following JSON object of UI strings from English to ${targetLangName} (BCP-47: ${targetLang}).\n` +
    `Rules:\n` +
    `1. Return ONLY a valid JSON object with the SAME keys as the input.\n` +
    `2. Translate every value accurately and naturally for a clinical health app.\n` +
    `3. Preserve any placeholders like {name}, {value}, {unit}, %d, %s exactly as-is.\n` +
    `4. Keep medical terms precise (e.g. "systolic", "diastolic", "HbA1c", "mmHg", "mg/dL").\n` +
    `5. Output ONLY the JSON object — no markdown, no explanations, no extra keys.\n\n` +
    JSON.stringify(strings);

  const response = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[Gemini fallback] API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('[Gemini fallback] Invalid JSON response: ' + cleaned.slice(0, 200));
  }

  // Ensure every original key is present; fall back to English for any missing key
  const result: Record<string, string> = {};
  for (const [key, englishVal] of Object.entries(strings)) {
    result[key] =
      typeof parsed[key] === 'string' && parsed[key].length > 0
        ? parsed[key]
        : englishVal;
  }
  return result;
}

// ─── Apple on-device Translation (iOS 18+) ───────────────────────────────────

/**
 * Translate a flat key→value string map using Apple's on-device Translation API.
 * Uses expo-translate-text which wraps the iOS 18 Translation framework.
 * Falls back to English values if the API is unavailable (iOS < 18 or model not downloaded).
 */
async function translateWithApple(
  strings: Record<string, string>,
  targetLang: string,
): Promise<Record<string, string>> {
  // Dynamically import to avoid crashing on Android/web where the native module is absent
  let onTranslateTask: (opts: {
    input: Record<string, string>;
    sourceLangCode?: string;
    targetLangCode?: string;
  }) => Promise<{ translatedTexts: Record<string, string> }>;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-translate-text') as {
      onTranslateTask: typeof onTranslateTask;
    };
    onTranslateTask = mod.onTranslateTask;
  } catch {
    throw new Error('[Apple fallback] expo-translate-text native module not available');
  }

  const result = await onTranslateTask({
    input: strings,
    sourceLangCode: 'en',
    targetLangCode: targetLang,
  });

  // Merge: use translated value where available, fall back to English
  const out: Record<string, string> = {};
  for (const [key, englishVal] of Object.entries(strings)) {
    const translated = result.translatedTexts?.[key];
    out[key] = typeof translated === 'string' && translated.length > 0 ? translated : englishVal;
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Translate a flat key→value string map using the best available client-side engine:
 *   - iOS  → Apple on-device Translation (iOS 18+)
 *   - Android / Web → Gemini API
 *
 * Returns the translated record. On failure, throws so the caller can decide
 * whether to fall back further (e.g. show English strings).
 */
export async function translateWithFallback(
  strings: Record<string, string>,
  targetLang: string,
  targetLangName: string,
): Promise<Record<string, string>> {
  if (Platform.OS === 'ios') {
    return translateWithApple(strings, targetLang);
  }
  // Android and web both use Gemini
  return translateWithGemini(strings, targetLang, targetLangName);
}

/**
 * Returns true if a client-side fallback is potentially available on this platform.
 * iOS: always true (Apple Translation is built-in on iOS 18+).
 * Android/web: true only if EXPO_PUBLIC_GEMINI_API_KEY is set.
 */
export function isFallbackAvailable(): boolean {
  if (Platform.OS === 'ios') return true;
  return Boolean(process.env.EXPO_PUBLIC_GEMINI_API_KEY);
}
