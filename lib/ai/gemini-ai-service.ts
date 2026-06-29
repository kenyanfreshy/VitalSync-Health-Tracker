/**
 * VitalSync Gemini AI Service
 *
 * Provides wellness analysis using Google Gemini 2.5-flash.
 * Used as the fallback AI provider when Apple Foundation Models are unavailable.
 *
 * Privacy guarantees:
 *   - Only pre-computed statistics are sent (never raw health records)
 *   - No user identifiers are included in requests
 *   - API key is never logged
 *
 * All outputs are sanitized through medical-compliance.ts before return.
 */

import { AIAnalysisRequest, AIAnalysisResponse, AIProvider, AI_DISCLAIMERS } from './ai-provider';
import { sanitizeAIOutput } from './medical-compliance';

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

const REQUEST_TIMEOUT_MS = 15_000;

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a wellness insight assistant for VitalSync, a personal health tracking app.

STRICT RULES — you must follow these without exception:
1. You provide WELLNESS INFORMATION ONLY. You do not diagnose, treat, cure, or prescribe.
2. Never use the words: diagnose, treat, cure, prescribe, medical advice, disease prediction, risk diagnosis, abnormal result requiring care, clinical decision, patient management.
3. Use ONLY safe wellness wording: wellness insight, observed pattern, general health information, trend, may be associated with, consider discussing with a licensed clinician, does not replace medical advice.
4. Do not invent nutrition facts. Only explain data that is explicitly provided to you.
5. Do not make absolute claims. Use hedging language: "may be associated with", "observed pattern", "your data suggests".
6. Keep responses concise (2-4 sentences for summaries, 3-5 sentences for explanations).
7. Always end with: "This is a wellness observation, not medical advice."
8. For correlations, always include: "Correlation does not prove causation."
9. Do not mention specific medications, dosages, or treatment protocols.
10. Do not reference specific diseases by name unless they appear in the provided statistics.`;

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildPrompt(request: AIAnalysisRequest): string {
  const stats = JSON.stringify(request.statistics, null, 2);
  const lang = request.languageCode ?? 'en';
  const maxLen = request.maxLength ?? 500;

  const typeInstructions: Record<AIAnalysisRequest['type'], string> = {
    wellness_summary:
      'Generate a brief wellness summary based on these pre-computed health statistics. Focus on observed patterns and general wellness trends.',
    correlation_explanation:
      'Explain this correlation finding in plain language. Emphasize that correlation does not prove causation.',
    nutrition_summary:
      'Summarize the nutritional patterns shown in these statistics. Remind the user that values are from USDA FoodData Central.',
    conversational_insight:
      'Provide a conversational wellness insight based on these statistics. Be encouraging and informative.',
    trend_explanation:
      'Explain this wellness trend in plain language. Describe the observed direction and magnitude without making medical claims.',
  };

  return `${typeInstructions[request.type]}

Pre-computed statistics (do not invent additional data):
${stats}

Language: ${lang}
Maximum response length: ${maxLen} characters

Remember: wellness information only, no medical advice.`;
}

// ─── Core Request ─────────────────────────────────────────────────────────────

async function callGemini(prompt: string, useFallback = false): Promise<string> {
  const url = useFallback ? GEMINI_FALLBACK_URL : GEMINI_URL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
          topP: 0.8,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_MEDICAL', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a wellness analysis using Google Gemini.
 * Returns a safe, sanitized response with the appropriate disclaimer.
 * Never throws — returns an error response on failure.
 */
export async function analyzeWithGemini(
  request: AIAnalysisRequest,
): Promise<AIAnalysisResponse> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 10) {
    return {
      text: '',
      provider: AIProvider.gemini,
      success: false,
      error: 'Gemini API key not configured',
      disclaimer: AI_DISCLAIMERS.general,
    };
  }

  const prompt = buildPrompt(request);

  try {
    let rawText: string;
    try {
      rawText = await callGemini(prompt, false);
    } catch (_primaryError) {
      // Retry with lite model
      rawText = await callGemini(prompt, true);
    }

    const sanitized = sanitizeAIOutput(rawText);

    const disclaimerMap: Record<AIAnalysisRequest['type'], keyof typeof AI_DISCLAIMERS> = {
      wellness_summary: 'wellness',
      correlation_explanation: 'correlation',
      nutrition_summary: 'nutrition',
      conversational_insight: 'wellness',
      trend_explanation: 'wellness',
    };

    return {
      text: sanitized,
      provider: AIProvider.gemini,
      success: true,
      disclaimer: AI_DISCLAIMERS[disclaimerMap[request.type]],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      text: '',
      provider: AIProvider.gemini,
      success: false,
      error: `Gemini analysis unavailable: ${message}`,
      disclaimer: AI_DISCLAIMERS.general,
    };
  }
}
