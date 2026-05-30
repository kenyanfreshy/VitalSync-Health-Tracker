import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { labRouter } from "./lab-router";
import { medicationRouter } from "./medication-router";
import { iapRouter } from "./iap-router";
import { execSync } from "child_process";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Nutrition analysis via LLM vision + voice
  nutrition: router({
    /**
     * Accepts a base64-encoded image (JPEG/PNG) of a food label or meal.
     * Uploads it to S3 (required — local file:// URLs don't work with LLM),
     * then calls the vision model to extract sodium and potassium estimates.
     * Returns structured JSON: { sodiumMg, potassiumMg, foodDescription, confidence, disclaimer }
     */
    analysePhoto: publicProcedure
      .input(z.object({
        imageBase64: z.string(),   // base64 data URI, e.g. "data:image/jpeg;base64,..."
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      }))
      .mutation(async ({ input }) => {
        // 1. Decode base64 and upload to S3 so the LLM can access a public URL
        const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `nutrition-photos/${Date.now()}-${suffix}.jpg`;
        const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);

        // 2. Ask the vision model for structured nutrition data
        const systemPrompt = [
          "You are a clinical nutrition analyst specialising in diabetes management. Analyse the food image or nutrition label provided.",
          "Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
          "- sodiumMg: estimated sodium in milligrams (integer). If a nutrition label is visible, read the exact value. If it is a meal photo, estimate based on typical serving sizes.",
          "- potassiumMg: estimated potassium in milligrams (integer, or null if not determinable).",
          "- calories: total calories / kcal for the serving shown (integer, or null).",
          "- carbsG: total carbohydrates in grams (number with 1 decimal, or null).",
          "- sugarG: total sugars in grams (number with 1 decimal, or null).",
          "- fatG: total fat in grams (number with 1 decimal, or null).",
          "- proteinG: protein in grams (number with 1 decimal, or null).",
          "- fiberG: dietary fiber in grams (number with 1 decimal, or null).",
          "- glycemicLoad: estimated glycemic load for the serving (integer 0-100, or null). Use published GL values for common foods; for mixed dishes estimate from carb content and food type.",
          "- foodDescription: short description of the food (max 60 characters).",
          '- confidence: one of \"high\" (label clearly visible), \"medium\" (recognisable dish), or \"low\" (unclear image).',
          "- reasoning: one sentence explaining how you arrived at the key estimates.",
          "Be conservative — when uncertain, lean toward the lower bound of typical ranges. Never fabricate exact label values if the label is not clearly readable.",
          "For diabetic relevance: glycemic load is more important than glycemic index — always try to estimate it.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse this food image and extract sodium and potassium content." },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          sodiumMg: number;
          potassiumMg: number | null;
          calories: number | null;
          carbsG: number | null;
          sugarG: number | null;
          fatG: number | null;
          proteinG: number | null;
          fiberG: number | null;
          glycemicLoad: number | null;
          foodDescription: string;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("LLM returned invalid JSON: " + raw);
        }

        const clamp = (v: number | null | undefined, min = 0, max = 99999) =>
          v != null ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;

        return {
          sodiumMg: Math.max(0, Math.round(parsed.sodiumMg ?? 0)),
          potassiumMg: parsed.potassiumMg != null ? Math.max(0, Math.round(parsed.potassiumMg)) : null,
          calories: parsed.calories != null ? Math.max(0, Math.round(parsed.calories)) : null,
          carbsG: clamp(parsed.carbsG, 0, 500),
          sugarG: clamp(parsed.sugarG, 0, 500),
          fatG: clamp(parsed.fatG, 0, 300),
          proteinG: clamp(parsed.proteinG, 0, 300),
          fiberG: clamp(parsed.fiberG, 0, 100),
          glycemicLoad: parsed.glycemicLoad != null ? Math.min(100, Math.max(0, Math.round(parsed.glycemicLoad))) : null,
          foodDescription: (parsed.foodDescription ?? "").slice(0, 80),
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — verify against nutrition label when available.",
        };
      }),

    /**
     * Accepts a base64-encoded barcode image.
     * Uploads to S3, asks the vision LLM to read the barcode number and identify
     * the product, then returns the full nutritional profile for that product.
     * Returns same shape as analysePhoto.
     */
    lookupBarcode: publicProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `barcode-photos/${Date.now()}-${suffix}.jpg`;
        const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);

        const systemPrompt = [
          "You are a clinical nutrition analyst. The user has photographed a product barcode (EAN-13, UPC-A, or similar).",
          "Step 1: Read the barcode number from the image.",
          "Step 2: Identify the packaged food product associated with that barcode using your training knowledge.",
          "Step 3: Return the per-serving nutritional profile for that product.",
          "Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
          "- productName: the full product name (string, max 80 chars)",
          "- brandName: brand/manufacturer name (string, max 40 chars, or null)",
          "- barcodeNumber: the barcode digits you read (string, or null if unreadable)",
          "- sodiumMg: sodium per serving in milligrams (integer)",
          "- potassiumMg: potassium per serving in milligrams (integer, or null)",
          "- calories: calories per serving (integer, or null)",
          "- carbsG: total carbohydrates per serving in grams (number with 1 decimal, or null)",
          "- sugarG: total sugars per serving in grams (number with 1 decimal, or null)",
          "- fatG: total fat per serving in grams (number with 1 decimal, or null)",
          "- proteinG: protein per serving in grams (number with 1 decimal, or null)",
          "- fiberG: dietary fiber per serving in grams (number with 1 decimal, or null)",
          "- glycemicLoad: estimated glycemic load per serving (integer 0-100, or null)",
          '- confidence: \"high\" if you recognise the exact product, \"medium\" if you recognise the brand/category, \"low\" if the barcode was unreadable or product unknown.',
          "- reasoning: one sentence explaining how you identified the product.",
          "If the barcode is unreadable, set confidence to \"low\" and fill all nutrition fields with null.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Read this barcode and return the nutritional profile for the product." },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
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
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("LLM returned invalid JSON: " + raw);
        }

        const clamp = (v: number | null | undefined, min = 0, max = 99999) =>
          v != null ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;

        const productLabel = [
          parsed.productName ?? "Unknown product",
          parsed.brandName ? `(${parsed.brandName})` : null,
        ].filter(Boolean).join(" ");

        return {
          sodiumMg: Math.max(0, Math.round(parsed.sodiumMg ?? 0)),
          potassiumMg: parsed.potassiumMg != null ? Math.max(0, Math.round(parsed.potassiumMg)) : null,
          calories: parsed.calories != null ? Math.max(0, Math.round(parsed.calories)) : null,
          carbsG: clamp(parsed.carbsG, 0, 500),
          sugarG: clamp(parsed.sugarG, 0, 500),
          fatG: clamp(parsed.fatG, 0, 300),
          proteinG: clamp(parsed.proteinG, 0, 300),
          fiberG: clamp(parsed.fiberG, 0, 100),
          glycemicLoad: parsed.glycemicLoad != null ? Math.min(100, Math.max(0, Math.round(parsed.glycemicLoad))) : null,
          foodDescription: productLabel.slice(0, 80),
          barcodeNumber: parsed.barcodeNumber ?? null,
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — verify against product label when available.",
        };
      }),

    /**
     * Accepts a base64-encoded audio recording (m4a/wav/webm).
     * Uploads to S3, transcribes with Whisper, then parses the transcript
     * with the LLM to extract the full nutritional profile.
     * Returns: { transcript, sodiumMg, potassiumMg, calories, carbsG, sugarG, fatG, proteinG, fiberG, glycemicLoad, foodDescription, confidence, reasoning, disclaimer }
     */
    parseVoice: publicProcedure
      .input(z.object({
        audioBase64: z.string(),   // base64 data URI, e.g. "data:audio/m4a;base64,..."
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        // 1. Decode and upload audio to S3
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `nutrition-voice/${Date.now()}-${suffix}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

        // 2. Transcribe with Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Food items, meal description, sodium, potassium, calories, carbohydrates, sugar, fat, protein, fiber, glycemic load",
        });
        const transcript = 'text' in transcriptionResult ? (transcriptionResult.text ?? "") : "";

        const emptyNutrition = {
          transcript: "",
          sodiumMg: 0,
          potassiumMg: null as number | null,
          calories: null as number | null,
          carbsG: null as number | null,
          sugarG: null as number | null,
          fatG: null as number | null,
          proteinG: null as number | null,
          fiberG: null as number | null,
          glycemicLoad: null as number | null,
          foodDescription: "",
          confidence: "low" as const,
          reasoning: "No speech detected in the recording.",
          disclaimer: "Smart estimates only — verify against nutrition label when available.",
        };

        if (!transcript.trim()) return emptyNutrition;

        // 3. Parse transcript with LLM to extract full nutrition profile
        const systemPrompt = [
          "You are a clinical nutrition analyst specialising in diabetes management. A user has described a food item or meal verbally.",
          "Based on their description, estimate the complete nutritional profile using published USDA/FDA reference values for the described food and typical serving sizes.",
          "Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
          "- sodiumMg: estimated sodium in milligrams (integer).",
          "- potassiumMg: estimated potassium in milligrams (integer, or null).",
          "- calories: total calories / kcal for the described serving (integer, or null).",
          "- carbsG: total carbohydrates in grams (number with 1 decimal, or null).",
          "- sugarG: total sugars in grams (number with 1 decimal, or null).",
          "- fatG: total fat in grams (number with 1 decimal, or null).",
          "- proteinG: protein in grams (number with 1 decimal, or null).",
          "- fiberG: dietary fiber in grams (number with 1 decimal, or null).",
          "- glycemicLoad: estimated glycemic load for the described serving (integer 0-100, or null). Use published GL values; for mixed dishes estimate from carb content and food type.",
          "- foodDescription: short description of the food (max 60 characters).",
          '- confidence: one of \"high\" (specific branded/labelled food named), \"medium\" (recognisable dish), or \"low\" (vague description).',
          "- reasoning: one sentence explaining how you arrived at the key estimates.",
          "Be conservative — when uncertain, lean toward the lower bound of typical ranges.",
          "For diabetic relevance: always try to estimate glycemic load — it is more clinically useful than glycemic index.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          sodiumMg: number;
          potassiumMg: number | null;
          calories: number | null;
          carbsG: number | null;
          sugarG: number | null;
          fatG: number | null;
          proteinG: number | null;
          fiberG: number | null;
          glycemicLoad: number | null;
          foodDescription: string;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("LLM returned invalid JSON: " + raw);
        }

        const clamp = (v: number | null | undefined, min = 0, max = 99999) =>
          v != null ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;

        return {
          transcript,
          sodiumMg: Math.max(0, Math.round(parsed.sodiumMg ?? 0)),
          potassiumMg: parsed.potassiumMg != null ? Math.max(0, Math.round(parsed.potassiumMg)) : null,
          calories: parsed.calories != null ? Math.max(0, Math.round(parsed.calories)) : null,
          carbsG: clamp(parsed.carbsG, 0, 500),
          sugarG: clamp(parsed.sugarG, 0, 500),
          fatG: clamp(parsed.fatG, 0, 300),
          proteinG: clamp(parsed.proteinG, 0, 300),
          fiberG: clamp(parsed.fiberG, 0, 100),
          glycemicLoad: parsed.glycemicLoad != null ? Math.min(100, Math.max(0, Math.round(parsed.glycemicLoad))) : null,
          foodDescription: (parsed.foodDescription ?? "").slice(0, 80),
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — verify against nutrition label when available.",
        };
      }),
  }),

  // Smart Caloric Trend Analysis
  // Accepts 7-day DailyNutrients + optional BP/glucose context,
  // returns a natural-language clinical insight paragraph.
  caloricTrends: router({
    analyzeTrends: publicProcedure
      .input(z.object({
        days: z.array(z.object({
          date: z.string(),
          fats_g: z.number(),
          carbohydrates_g: z.number(),
          protein_g: z.number(),
          sugar_g: z.number(),
          fiber_g: z.number(),
          sodium_mg: z.number(),
          total_calories_kcal: z.number(),
          calculated_calories_kcal: z.number(),
          glycemic_load: z.number(),
          entry_count: z.number(),
        })).min(1).max(14),
        // Optional context for richer clinical insight
        avgSystolic: z.number().optional(),
        avgDiastolic: z.number().optional(),
        avgGlucoseMgDl: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { days, avgSystolic, avgDiastolic, avgGlucoseMgDl } = input;

        // Build a compact tabular summary of the trend data
        const tableRows = days.map(d =>
          `${d.date}: ${d.total_calories_kcal} kcal | Carbs ${d.carbohydrates_g}g | Protein ${d.protein_g}g | Fat ${d.fats_g}g | Fiber ${d.fiber_g}g | Sodium ${d.sodium_mg}mg | GL ${d.glycemic_load} | ${d.entry_count} meal(s)`
        ).join("\n");

        const avgCalories = Math.round(days.reduce((s, d) => s + d.total_calories_kcal, 0) / days.length);
        const avgSodium = Math.round(days.reduce((s, d) => s + d.sodium_mg, 0) / days.length);
        const avgGL = Math.round(days.reduce((s, d) => s + d.glycemic_load, 0) / days.length * 10) / 10;
        const avgCarbs = Math.round(days.reduce((s, d) => s + d.carbohydrates_g, 0) / days.length * 10) / 10;
        const avgFiber = Math.round(days.reduce((s, d) => s + d.fiber_g, 0) / days.length * 10) / 10;

        const contextLines = [
          avgSystolic != null ? `Average blood pressure: ${avgSystolic}/${avgDiastolic ?? '?'} mmHg` : null,
          avgGlucoseMgDl != null ? `Average fasting glucose: ${avgGlucoseMgDl} mg/dL` : null,
        ].filter(Boolean).join("\n");

        const systemPrompt = [
          "You are a clinical dietitian and diabetes educator providing personalised nutritional feedback.",
          "Analyse the patient's dietary trend data for the past several days and produce a concise, actionable clinical insight.",
          "Guidelines:",
          "- DASH diet sodium target: ≤2,300 mg/day (ideally ≤1,500 mg/day for hypertension)",
          "- ADA calorie target: ~2,000 kcal/day for average adult",
          "- Carbohydrate target: 45-60% of calories (~225-300g/day)",
          "- Fiber target: ≥28g/day",
          "- Daily glycemic load target: ≤80 (low-GL diet)",
          "- Protein target: ~50g/day",
          "Return a JSON object with EXACTLY these fields:",
          "- headline: a single sentence (max 15 words) summarising the most important trend, e.g. 'Sodium intake is trending 18% above DASH guidelines this week.'",
          "- insight: 2-4 sentences of clinical narrative covering caloric balance, macro distribution, sodium/DASH adherence, glycemic load, and any notable patterns. Mention specific numbers. Be direct and clinically precise.",
          "- recommendations: an array of 2-4 short, actionable recommendation strings (each max 12 words), e.g. ['Replace white rice with brown rice or quinoa', 'Add a daily handful of mixed nuts for healthy fats']",
          "- trend_direction: one of 'improving', 'stable', 'worsening', or 'mixed' — overall nutritional trend",
          "- risk_level: one of 'low', 'moderate', 'high' — based on deviation from targets",
          "Do not include legal disclaimers in the JSON.",
        ].join("\n");

        const userContent = [
          `Daily nutritional data (${days.length} days):`,
          tableRows,
          ``,
          `Averages: ${avgCalories} kcal/day | Carbs ${avgCarbs}g | Fiber ${avgFiber}g | Sodium ${avgSodium}mg | GL ${avgGL}`,
          contextLines ? `\nClinical context:\n${contextLines}` : "",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          headline: string;
          insight: string;
          recommendations: string[];
          trend_direction: string;
          risk_level: string;
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("LLM returned invalid JSON: " + raw);
        }

        return {
          headline: (parsed.headline ?? "").slice(0, 120),
          insight: (parsed.insight ?? "").slice(0, 600),
          recommendations: Array.isArray(parsed.recommendations)
            ? parsed.recommendations.slice(0, 4).map((r: string) => String(r).slice(0, 80))
            : [],
          trend_direction: ["improving", "stable", "worsening", "mixed"].includes(parsed.trend_direction)
            ? parsed.trend_direction
            : "mixed",
          risk_level: ["low", "moderate", "high"].includes(parsed.risk_level)
            ? parsed.risk_level
            : "moderate",
          disclaimer: "Smart-generated clinical insights — not a substitute for professional medical advice.",
          analyzed_days: days.length,
          avg_calories: avgCalories,
          avg_sodium_mg: avgSodium,
          avg_glycemic_load: avgGL,
        };
      }),
  }),

  // ─── Sugar trend insight ─────────────────────────────────────────────────────
  sugarInsight: publicProcedure
    .input(
      z.object({
        /** 7-day daily sugar totals in grams, oldest first */
        dailyTotals: z.array(z.number()),
        /** User's daily sugar budget in grams */
        budgetG: z.number(),
        /** ISO date labels for each day (YYYY-MM-DD), oldest first */
        dateLabels: z.array(z.string()),
      })
    )
    .query(async ({ input }) => {
      const { dailyTotals, budgetG, dateLabels } = input;
      const daysUnder = dailyTotals.filter((g) => g <= budgetG).length;
      const daysOver = dailyTotals.length - daysUnder;
      // Compute best consecutive streak under budget
      let bestStreak = 0;
      let currentStreak = 0;
      for (const g of dailyTotals) {
        if (g <= budgetG) {
          currentStreak++;
          if (currentStreak > bestStreak) bestStreak = currentStreak;
        } else {
          currentStreak = 0;
        }
      }
      const avg = dailyTotals.length
        ? Math.round((dailyTotals.reduce((s, v) => s + v, 0) / dailyTotals.length) * 10) / 10
        : 0;
      const trend = dailyTotals.length >= 2
        ? dailyTotals[dailyTotals.length - 1] - dailyTotals[0]
        : 0;
      const systemPrompt = [
        "You are a concise clinical nutrition assistant.",
        "Generate a single plain-English sentence (max 18 words, no markdown, no emoji) summarising the user's 7-day sugar intake trend.",
        "Focus on: days under budget, best streak, average vs. budget, and whether the trend is improving or worsening.",
        "Examples:",
        "  \"You stayed under budget 5 of 7 days — best streak: 3 days.\"",
        "  \"Average sugar this week was 28g, 3g over your 25g budget.\"",
        "  \"Intake is trending down — you've been under budget the last 3 days.\"",
        "Return ONLY the sentence, no JSON, no extra text.",
      ].join("\n");
      const userContent = [
        `Budget: ${budgetG}g/day`,
        `7-day totals (oldest first): ${dailyTotals.map((g, i) => `${dateLabels[i] ?? i}: ${g}g`).join(", ")}`,
        `Days under budget: ${daysUnder} / ${dailyTotals.length}`,
        `Best consecutive streak under budget: ${bestStreak} day(s)`,
        `7-day average: ${avg}g`,
        `Trend (last minus first): ${trend > 0 ? '+' : ''}${trend}g`,
        `Days over budget: ${daysOver}`,
      ].join("\n");
      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ];
      const response = await invokeLLM({ messages });
      const sentence = String(response.choices[0].message.content ?? "").trim().replace(/^["']|["']$/g, "");
      return { insight: sentence.slice(0, 120) };
    }),

  // Smart Nutrition Intelligence — food search and recipe generation
  nutritionAI: router({
    /**
     * USDA-backed food search: accepts a natural-language query and returns
     * up to 8 matching food items with full macro profiles.
     */
    searchFood: publicProcedure
      .input(z.object({
        query: z.string().min(1).max(300),
        dietProtocol: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = [
          "You are a registered dietitian with access to the USDA FoodData Central (2024) and NCCDB databases.",
          "The user has described a food item or meal in natural language. Identify the most likely food items and return their nutritional profiles.",
          "For each item, use USDA reference values for a standard serving size. Be precise with macros.",
          "Return a JSON object with a 'results' array of up to 8 items. Each item must have:",
          "- id: a short unique slug",
          "- name: the food name as it would appear in a nutrition database (e.g. 'Vegan Protein Powder, 1 scoop (30g)')",
          "- brand: brand or source if known, otherwise 'Generic'",
          "- serving_size: string description (e.g. '1 scoop (30g)')",
          "- serving_g: serving weight in grams (number)",
          "- calories: kcal per serving (number)",
          "- protein_g: protein grams (number)",
          "- carbs_g: total carbohydrate grams (number)",
          "- fat_g: total fat grams (number)",
          "- fiber_g: dietary fiber grams (number)",
          "- sodium_mg: sodium milligrams (number)",
          "- potassium_mg: potassium milligrams (number)",
          "- phosphorus_mg: phosphorus milligrams (number)",
          "- glycemic_index: estimated GI (number 0-100) or null",
          "- usda_category: USDA food category string",
          "- clinical_notes: one sentence about this food's relevance to the user's diet protocol",
          input.dietProtocol ? `The user follows a ${input.dietProtocol} diet protocol. Prioritise aligned foods and flag conflicts.` : "",
        ].filter(Boolean).join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Search query: "${input.query}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: { results: Array<{
          id: string; name: string; brand: string; serving_size: string; serving_g: number;
          calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
          sodium_mg: number; potassium_mg: number; phosphorus_mg: number;
          glycemic_index: number | null; usda_category: string; clinical_notes: string;
        }> };
        try { parsed = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON"); }
        return {
          results: (parsed.results ?? []).slice(0, 8).map(r => ({
            id: String(r.id ?? Math.random().toString(36).slice(2)),
            name: String(r.name ?? "").slice(0, 120),
            brand: String(r.brand ?? "Generic").slice(0, 60),
            serving_size: String(r.serving_size ?? "1 serving").slice(0, 60),
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
            usda_category: String(r.usda_category ?? "Other").slice(0, 60),
            clinical_notes: String(r.clinical_notes ?? "").slice(0, 200),
          })),
        };
      }),

    /**
     * Clinical-grade Smart nutrition insight card.
     * Accepts today's caloric intake, sugar intake, latest blood glucose, and
     * diet protocol. Returns a 1-line summary, risk level, glucose trend
     * prediction, and 2 short actionable recommendations grounded in
     * ADA / WHO / AMDR guidelines.
     */
    smartNutritionInsights: publicProcedure
      .input(z.object({
        caloriesKcal: z.number(),
        sugarG: z.number(),
        glucoseMgDl: z.number().optional(),
        dietProtocol: z.string().optional(),
        goalCalories: z.number().optional(),
        sugarBudgetG: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = [
          "You are a clinical-grade nutrition and metabolic intelligence engine.",
          "Follow ADA, WHO, and AMDR guidelines strictly.",
          "Return STRICT JSON with these exact keys:",
          '{ "summary": "1-line insight (max 12 words)", "risk_level": "low | moderate | high", "predicted_glucose_trend": "stable | rising | high risk", "recommendations": ["short actionable rec (max 12 words)", "short actionable rec (max 12 words)"], "references": ["APA citation"] }',
          "Keep every string under 120 characters. No markdown.",
        ].join("\n");
        const userContent = [
          `Today's intake: ${Math.round(input.caloriesKcal)} kcal (goal: ${Math.round(input.goalCalories ?? 2000)} kcal)`,
          `Sugar: ${input.sugarG.toFixed(1)}g (budget: ${(input.sugarBudgetG ?? 50).toFixed(0)}g)`,
          input.glucoseMgDl != null ? `Latest blood glucose: ${input.glucoseMgDl} mg/dL` : "Blood glucose: not recorded",
          input.dietProtocol ? `Diet protocol: ${input.dietProtocol}` : "",
        ].filter(Boolean).join("\n");
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          summary: string;
          risk_level: string;
          predicted_glucose_trend: string;
          recommendations: string[];
          references: string[];
        };
        try { parsed = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON"); }
        return {
          summary: String(parsed.summary ?? "").slice(0, 120),
          risk_level: (["low", "moderate", "high"].includes((parsed.risk_level ?? "").toLowerCase())
            ? parsed.risk_level.toLowerCase() : "low") as "low" | "moderate" | "high",
          predicted_glucose_trend: (["stable", "rising", "high risk"].includes((parsed.predicted_glucose_trend ?? "").toLowerCase())
            ? parsed.predicted_glucose_trend.toLowerCase() : "stable") as "stable" | "rising" | "high risk",
          recommendations: Array.isArray(parsed.recommendations)
            ? parsed.recommendations.slice(0, 2).map((r) => String(r).slice(0, 120))
            : [],
          references: Array.isArray(parsed.references)
            ? parsed.references.slice(0, 2).map((r) => String(r).slice(0, 200))
            : [],
        };
      }),
  }),

  // Medication side-effect LLM lookup
  medications: router({
    /**
     * Given a medication name (and optional generic name), returns a list of
     * common side effects sourced from clinical pharmacology knowledge.
     * Returns: { sideEffects: string[], disclaimer: string }
     */
    lookupSideEffects: publicProcedure
      .input(z.object({
        medicationName: z.string(),
        genericName: z.string().optional(),
        indication: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = [
          "You are a clinical pharmacist with expertise in drug safety and patient counselling.",
          "Given a medication name, return the most clinically relevant side effects that a patient should know about.",
          "Focus on: (1) common side effects (>10% incidence), (2) serious but rare effects requiring monitoring, (3) effects especially relevant for diabetic or hypertensive patients.",
          "Return a JSON object with EXACTLY these fields:",
          "- sideEffects: an array of concise side-effect strings (max 12 items). Each string should be 2-5 words, e.g. \"Dry cough\", \"Hyperkalemia\", \"Dizziness on standing\". Order by clinical importance.",
          "- reasoning: one sentence explaining the pharmacological basis for the top 2-3 effects.",
          "If the medication name is not recognised as a real drug, return an empty sideEffects array and note that in reasoning.",
          "Do not include legal disclaimers in the JSON — they will be added separately.",
        ].join("\n");

        const userContent = [
          `Medication: ${input.medicationName}`,
          input.genericName ? `Generic name: ${input.genericName}` : null,
          input.indication ? `Prescribed for: ${input.indication}` : null,
        ].filter(Boolean).join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: { sideEffects: string[]; reasoning: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("LLM returned invalid JSON: " + raw);
        }

        return {
          sideEffects: Array.isArray(parsed.sideEffects)
            ? parsed.sideEffects.slice(0, 12).map((s: string) => String(s).slice(0, 60))
            : [],
          reasoning: (parsed.reasoning ?? "").slice(0, 300),
          disclaimer: "Smart-generated information only — always consult your prescriber or pharmacist.",
        };
      }),

    /**
     * Parses a free-form spoken medication description and extracts all form fields.
     * Input: { transcript: string }
     * Returns all extractable fields: name, genericName, dose, frequency, frequencyNote,
     * prescriber, indication, pharmacy, pharmacyPhone, notes, status, startDate
     */
    parseMedicationTranscript: publicProcedure
      .input(z.object({
        transcript: z.string(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a medication they take.",
          "Extract every piece of medication information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- name: the brand or common medication name (string or null)",
          "- genericName: the generic/chemical name if mentioned (string or null)",
          "- dose: the dose with units, e.g. '500 mg', '10 mg', '2 tablets' (string or null)",
          "- frequency: one of exactly: 'once-daily', 'twice-daily', 'three-times-daily', 'four-times-daily', 'every-other-day', 'weekly', 'as-needed', 'other'. Infer from phrases like 'once a day'='once-daily', 'twice a day'='twice-daily', 'every morning and evening'='twice-daily', 'as needed'='as-needed'. Use null if unclear.",
          "- frequencyNote: free-text schedule description if frequency is 'other' or if extra detail was given (string or null)",
          "- prescriber: doctor or prescriber name if mentioned (string or null)",
          "- indication: what it is prescribed for, e.g. 'blood pressure', 'diabetes', 'cholesterol' (string or null)",
          "- pharmacy: pharmacy name if mentioned (string or null)",
          "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
          "- notes: any additional notes, observations, or instructions mentioned (string or null)",
          "- status: one of 'active', 'paused', 'discontinued'. Default to 'active' unless they say they stopped or paused it.",
          "- confidence: 'high' if name and dose are clearly stated, 'medium' if name only, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Common patterns: '500 milligrams' = '500 mg', 'twice a day' = 'twice-daily', 'prescribed by Dr Smith' = prescriber 'Dr Smith'.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${input.transcript}"` },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          name: string | null;
          genericName: string | null;
          dose: string | null;
          frequency: string | null;
          frequencyNote: string | null;
          prescriber: string | null;
          indication: string | null;
          pharmacy: string | null;
          pharmacyPhone: string | null;
          notes: string | null;
          status: string | null;
          confidence: string;
          reasoning: string;
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("LLM returned invalid JSON: " + raw);
        }

        const validFrequencies = ['once-daily','twice-daily','three-times-daily','four-times-daily','every-other-day','weekly','as-needed','other'];
        const validStatuses = ['active','paused','discontinued'];

        return {
          name: parsed.name ? String(parsed.name).slice(0, 100) : null,
          genericName: parsed.genericName ? String(parsed.genericName).slice(0, 100) : null,
          dose: parsed.dose ? String(parsed.dose).slice(0, 50) : null,
          frequency: validFrequencies.includes(parsed.frequency ?? '') ? parsed.frequency as string : null,
          frequencyNote: parsed.frequencyNote ? String(parsed.frequencyNote).slice(0, 120) : null,
          prescriber: parsed.prescriber ? String(parsed.prescriber).slice(0, 80) : null,
          indication: parsed.indication ? String(parsed.indication).slice(0, 120) : null,
          pharmacy: parsed.pharmacy ? String(parsed.pharmacy).slice(0, 100) : null,
          pharmacyPhone: parsed.pharmacyPhone ? String(parsed.pharmacyPhone).slice(0, 30) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          status: validStatuses.includes(parsed.status ?? '') ? parsed.status as string : 'active',
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted — please review all fields before saving.",
        };
      }),

    /**
     * Transcribes a voice recording of a medication description and extracts all form fields.
     * Identical LLM logic to parseMedicationTranscript but includes Whisper transcription step.
     * Returns same shape as parseMedicationTranscript plus { transcript }.
     */
    parseMedicationVoice: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        // 1. Upload audio to S3
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `med-voice/${Date.now()}-${suffix}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

        // 2. Transcribe with Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Medication name, dose, frequency, prescriber, pharmacy, indication",
        });
        if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
        const transcript = transcriptionResult.text;

        // 3. Parse with LLM (same logic as parseMedicationTranscript)
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a medication they take.",
          "Extract every piece of medication information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- name: the brand or common medication name (string or null)",
          "- genericName: the generic/chemical name if mentioned (string or null)",
          "- dose: the dose with units, e.g. '500 mg', '10 mg', '2 tablets' (string or null)",
          "- frequency: one of exactly: 'once-daily', 'twice-daily', 'three-times-daily', 'four-times-daily', 'every-other-day', 'weekly', 'as-needed', 'other'. Infer from phrases like 'once a day'='once-daily', 'twice a day'='twice-daily'. Use null if unclear.",
          "- frequencyNote: free-text schedule description if frequency is 'other' or if extra detail was given (string or null)",
          "- prescriber: doctor or prescriber name if mentioned (string or null)",
          "- indication: what it is prescribed for, e.g. 'blood pressure', 'diabetes', 'cholesterol' (string or null)",
          "- pharmacy: pharmacy name if mentioned (string or null)",
          "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
          "- notes: any additional notes, observations, or instructions mentioned (string or null)",
          "- status: one of 'active', 'paused', 'discontinued'. Default to 'active' unless they say they stopped or paused it.",
          "- confidence: 'high' if name and dose are clearly stated, 'medium' if name only, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          name: string | null;
          genericName: string | null;
          dose: string | null;
          frequency: string | null;
          frequencyNote: string | null;
          prescriber: string | null;
          indication: string | null;
          pharmacy: string | null;
          pharmacyPhone: string | null;
          notes: string | null;
          status: string | null;
          confidence: string;
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        const validFrequencies = ['once-daily','twice-daily','three-times-daily','four-times-daily','every-other-day','weekly','as-needed','other'];
        const validStatuses = ['active','paused','discontinued'];

        return {
          transcript,
          name: parsed.name ? String(parsed.name).slice(0, 100) : null,
          genericName: parsed.genericName ? String(parsed.genericName).slice(0, 100) : null,
          dose: parsed.dose ? String(parsed.dose).slice(0, 50) : null,
          frequency: validFrequencies.includes(parsed.frequency ?? '') ? parsed.frequency as string : null,
          frequencyNote: parsed.frequencyNote ? String(parsed.frequencyNote).slice(0, 120) : null,
          prescriber: parsed.prescriber ? String(parsed.prescriber).slice(0, 80) : null,
          indication: parsed.indication ? String(parsed.indication).slice(0, 120) : null,
          pharmacy: parsed.pharmacy ? String(parsed.pharmacy).slice(0, 100) : null,
          pharmacyPhone: parsed.pharmacyPhone ? String(parsed.pharmacyPhone).slice(0, 30) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          status: validStatuses.includes(parsed.status ?? '') ? parsed.status as string : 'active',
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted — please review all fields before saving.",
        };
      }),

    /**
     * Parses a photo of a prescription label, medication bottle, or discharge paperwork.
     * Accepts a base64-encoded image and returns structured medication fields.
     */
    parseMedicationImage: publicProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).default('image/jpeg'),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.imageBase64.replace(/^data:[^;]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const ext = input.mimeType.split('/')[1] ?? 'jpg';
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `med-scribe/${Date.now()}-${suffix}.${ext}`;
        const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);

        const systemPrompt = [
          'You are a clinical data entry assistant. You are given a photo of a prescription label, medication bottle, discharge paperwork, or medication list.',
          'Extract every piece of medication information visible in the image and return a JSON object.',
          'Return ONLY a JSON object with these fields (use null for any field not found):',
          '- name: the brand or common medication name (string or null)',
          '- genericName: the generic/chemical name if shown (string or null)',
          '- dose: the dose with units, e.g. "500 mg", "10 mg", "2 tablets" (string or null)',
          '- frequency: one of exactly: "once-daily", "twice-daily", "three-times-daily", "four-times-daily", "every-other-day", "weekly", "as-needed", "other". Use null if unclear.',
          '- frequencyNote: free-text schedule if frequency is "other" or extra detail is given (string or null)',
          '- prescriber: prescribing doctor name if visible (string or null)',
          '- indication: what it is prescribed for if stated (string or null)',
          '- pharmacy: pharmacy name if visible (string or null)',
          '- pharmacyPhone: pharmacy phone number if visible (string or null)',
          '- notes: any additional instructions, warnings, or notes visible (string or null)',
          '- status: "active" unless the label says discontinued or expired.',
          '- confidence: "high" if name and dose are clearly legible, "medium" if partially legible, "low" if very unclear.',
          '- reasoning: one sentence explaining what you found and any assumptions.',
          'Do not invent information not visible in the image.',
        ].join('\n');

        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please extract all medication information from this image.' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ] as unknown as string,
          },
        ];

        const response = await invokeLLM({ messages, response_format: { type: 'json_object' } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          name: string | null; genericName: string | null; dose: string | null;
          frequency: string | null; frequencyNote: string | null; prescriber: string | null;
          indication: string | null; pharmacy: string | null; pharmacyPhone: string | null;
          notes: string | null; status: string | null; confidence: string; reasoning: string;
        };
        try { parsed = JSON.parse(raw); } catch { throw new Error('LLM returned invalid JSON: ' + raw); }

        const validFrequencies = ['once-daily','twice-daily','three-times-daily','four-times-daily','every-other-day','weekly','as-needed','other'];
        const validStatuses = ['active','paused','discontinued'];
        return {
          name: parsed.name ? String(parsed.name).slice(0, 100) : null,
          genericName: parsed.genericName ? String(parsed.genericName).slice(0, 100) : null,
          dose: parsed.dose ? String(parsed.dose).slice(0, 50) : null,
          frequency: validFrequencies.includes(parsed.frequency ?? '') ? parsed.frequency as string : null,
          frequencyNote: parsed.frequencyNote ? String(parsed.frequencyNote).slice(0, 120) : null,
          prescriber: parsed.prescriber ? String(parsed.prescriber).slice(0, 80) : null,
          indication: parsed.indication ? String(parsed.indication).slice(0, 120) : null,
          pharmacy: parsed.pharmacy ? String(parsed.pharmacy).slice(0, 100) : null,
          pharmacyPhone: parsed.pharmacyPhone ? String(parsed.pharmacyPhone).slice(0, 30) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          status: validStatuses.includes(parsed.status ?? '') ? parsed.status as string : 'active',
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: 'Smart Scribe-extracted from image — please review all fields before saving.',
        };
      }),
  }),

  // Health voice parsing endpoints
  health: router({
    /**
     * Transcribes a voice recording and parses it to extract blood glucose data.
     * Returns: { transcript, glucoseMgDl, unit, context, note, confidence, reasoning, disclaimer }
     */
    parseVoiceBloodSugar: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        // 1. Upload audio to S3
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `health-voice/bs-${Date.now()}-${suffix}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

        // 2. Transcribe with Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Blood glucose reading, blood sugar level, mg/dL, mmol/L, fasting, post-meal, bedtime",
        });
        const transcript = 'text' in transcriptionResult ? (transcriptionResult.text ?? "") : "";

        if (!transcript.trim()) {
          return {
            transcript: "",
            glucoseMgDl: null as number | null,
            unit: "mg/dL" as "mg/dL" | "mmol/L",
            context: "random" as "fasting" | "post-meal" | "random" | "bedtime",
            note: "",
            confidence: "low" as const,
            reasoning: "No speech detected in the recording.",
            disclaimer: "Smart estimates only — please verify before saving.",
          };
        }

        // 3. Parse with LLM
        const systemPrompt = [
          "You are a clinical data entry assistant. A user has verbally stated their blood glucose reading.",
          "Extract the following from their statement and return a JSON object:",
          "- glucoseMgDl: the glucose value converted to mg/dL (integer). If they said mmol/L, multiply by 18.0182 and round.",
          "- unit: the unit the user stated — either 'mg/dL' or 'mmol/L'. Default to 'mg/dL' if unclear.",
          "- context: one of 'fasting', 'post-meal', 'random', 'bedtime'. Infer from context clues (e.g. 'before breakfast' = fasting, 'after lunch' = post-meal). Default to 'random'.",
          "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
          "- confidence: 'high' if a clear numeric value was stated, 'medium' if approximate, 'low' if unclear.",
          "- reasoning: one sentence explaining your interpretation.",
          "If no numeric glucose value was mentioned, set glucoseMgDl to null.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];

        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          glucoseMgDl: number | null;
          unit: "mg/dL" | "mmol/L";
          context: "fasting" | "post-meal" | "random" | "bedtime";
          note: string;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        return {
          transcript,
          glucoseMgDl: parsed.glucoseMgDl != null ? Math.max(0, Math.round(parsed.glucoseMgDl)) : null,
          unit: parsed.unit ?? "mg/dL",
          context: parsed.context ?? "random",
          note: (parsed.note ?? "").slice(0, 80),
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — please verify before saving.",
        };
      }),

    /**
     * Transcribes a voice recording and parses it to extract vital signs data.
     * Returns: { transcript, systolic, diastolic, heartRate, spo2, temperature, respiratoryRate, note, confidence, reasoning, disclaimer }
     */
    parseVoiceVitals: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        // 1. Upload audio to S3
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `health-voice/vs-${Date.now()}-${suffix}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

        // 2. Transcribe with Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Blood pressure, heart rate, oxygen saturation, SpO2, temperature, respiratory rate, systolic, diastolic, mmHg, bpm",
        });
        const transcript = 'text' in transcriptionResult ? (transcriptionResult.text ?? "") : "";

        if (!transcript.trim()) {
          return {
            transcript: "",
            systolic: null as number | null,
            diastolic: null as number | null,
            heartRate: null as number | null,
            spo2: null as number | null,
            temperature: null as number | null,
            respiratoryRate: null as number | null,
            note: "",
            confidence: "low" as const,
            reasoning: "No speech detected in the recording.",
            disclaimer: "Smart estimates only — please verify before saving.",
          };
        }

        // 3. Parse with LLM
        const systemPrompt = [
          "You are a clinical data entry assistant. A user has verbally stated their vital signs.",
          "Extract the following from their statement and return a JSON object:",
          "- systolic: systolic blood pressure in mmHg (integer, or null if not mentioned).",
          "- diastolic: diastolic blood pressure in mmHg (integer, or null if not mentioned). Often stated as 'X over Y' where Y is diastolic.",
          "- heartRate: heart rate in bpm (integer, or null if not mentioned).",
          "- spo2: oxygen saturation as a percentage 0-100 (number, or null if not mentioned).",
          "- temperature: body temperature in Fahrenheit (number, or null if not mentioned). If stated in Celsius, convert to Fahrenheit.",
          "- respiratoryRate: respiratory rate in breaths per minute (integer, or null if not mentioned).",
          "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
          "- confidence: 'high' if clear numeric values were stated, 'medium' if some values are approximate, 'low' if mostly unclear.",
          "- reasoning: one sentence explaining your interpretation.",
          "Common speech patterns: '120 over 80' = systolic 120, diastolic 80. 'Pulse of 72' = heartRate 72. 'O2 sat 98' = spo2 98.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];

        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          systolic: number | null;
          diastolic: number | null;
          heartRate: number | null;
          spo2: number | null;
          temperature: number | null;
          respiratoryRate: number | null;
          note: string;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        const clamp = (v: number | null, min: number, max: number) =>
          v != null ? Math.min(max, Math.max(min, Math.round(v))) : null;

        return {
          transcript,
          systolic: clamp(parsed.systolic, 50, 300),
          diastolic: clamp(parsed.diastolic, 30, 200),
          heartRate: clamp(parsed.heartRate, 20, 300),
          spo2: parsed.spo2 != null ? Math.min(100, Math.max(50, Math.round(parsed.spo2))) : null,
          temperature: parsed.temperature != null ? Math.round(parsed.temperature * 10) / 10 : null,
          respiratoryRate: clamp(parsed.respiratoryRate, 4, 60),
          note: (parsed.note ?? "").slice(0, 80),
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — please verify before saving.",
        };
      }),
    /**
     * Parses a plain-text transcript (from Apple Speech / SFSpeechRecognizer) to extract vital signs.
     * No audio upload required — transcript is produced on-device by SFSpeechRecognizer.
     * Returns same shape as parseVoiceVitals.
     */
    parseVitalsTranscript: publicProcedure
      .input(z.object({
        transcript: z.string(),
      }))
      .mutation(async ({ input }) => {
        const transcript = input.transcript.trim();
        if (!transcript) {
          return {
            transcript: "",
            systolic: null as number | null,
            diastolic: null as number | null,
            heartRate: null as number | null,
            spo2: null as number | null,
            temperature: null as number | null,
            respiratoryRate: null as number | null,
            note: "",
            confidence: "low" as const,
            reasoning: "No transcript provided.",
            disclaimer: "Smart estimates only — please verify before saving.",
          };
        }
        const systemPrompt = [
          "You are a clinical data entry assistant. A user has verbally stated their vital signs.",
          "Extract the following from their statement and return a JSON object:",
          "- systolic: systolic blood pressure in mmHg (integer, or null if not mentioned).",
          "- diastolic: diastolic blood pressure in mmHg (integer, or null if not mentioned). Often stated as 'X over Y' where Y is diastolic.",
          "- heartRate: heart rate in bpm (integer, or null if not mentioned).",
          "- spo2: oxygen saturation as a percentage 0-100 (number, or null if not mentioned).",
          "- temperature: body temperature in Fahrenheit (number, or null if not mentioned). If stated in Celsius, convert to Fahrenheit.",
          "- respiratoryRate: respiratory rate in breaths per minute (integer, or null if not mentioned).",
          "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
          "- confidence: 'high' if clear numeric values were stated, 'medium' if some values are approximate, 'low' if mostly unclear.",
          "- reasoning: one sentence explaining your interpretation.",
          "Common speech patterns: '120 over 80' = systolic 120, diastolic 80. 'Pulse of 72' = heartRate 72. 'O2 sat 98' = spo2 98.",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          systolic: number | null;
          diastolic: number | null;
          heartRate: number | null;
          spo2: number | null;
          temperature: number | null;
          respiratoryRate: number | null;
          note: string;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const clamp2 = (v: number | null, min: number, max: number) =>
          v != null ? Math.min(max, Math.max(min, Math.round(v))) : null;
        return {
          transcript,
          systolic: clamp2(parsed.systolic, 50, 300),
          diastolic: clamp2(parsed.diastolic, 30, 200),
          heartRate: clamp2(parsed.heartRate, 20, 300),
          spo2: parsed.spo2 != null ? Math.min(100, Math.max(50, Math.round(parsed.spo2))) : null,
          temperature: parsed.temperature != null ? Math.round(parsed.temperature * 10) / 10 : null,
          respiratoryRate: clamp2(parsed.respiratoryRate, 4, 60),
          note: (parsed.note ?? "").slice(0, 80),
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — please verify before saving.",
        };
      }),

    /**
     * Parses a spoken multi-vital transcript into all sections at once:
     * BP, weight, blood sugar, sleep (REM/Core/Deep/Awake), and HRV.
     */
    parseAllVitalsTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const transcript = input.transcript.trim();
        if (!transcript) {
          return {
            transcript: "",
            bp: null as null | { systolic: number; diastolic: number },
            weight: null as null | { weightKg: number; weightLbs: number; unit: 'kg' | 'lbs' },
            bloodSugar: null as null | { valueMgDl: number; valueMmol: number; context: string },
            sleep: null as null | { totalMinutes: number; remMinutes: number; coreMinutes: number; deepMinutes: number; awakeMinutes: number },
            hrv: null as null | { sdnn: number; context: string },
            confidence: "low" as const,
            reasoning: "No transcript provided.",
            disclaimer: "Smart estimates only — please verify before saving.",
          };
        }
        const systemPrompt = [
          "You are a clinical data entry assistant. A user has verbally stated multiple vital signs in one sentence.",
          "Extract ALL of the following from their statement and return a single JSON object:",
          "",
          "bp: { systolic: integer mmHg, diastolic: integer mmHg } or null if blood pressure not mentioned.",
          "weight: { weightKg: number, weightLbs: number, unit: 'kg'|'lbs' } or null if weight not mentioned. Convert between units as needed.",
          "bloodSugar: { valueMgDl: number, valueMmol: number, context: 'fasting'|'post-meal'|'random'|'bedtime' } or null if blood sugar not mentioned. Default context 'random'. 1 mmol/L = 18.016 mg/dL.",
          "sleep: { totalMinutes: integer, remMinutes: integer, coreMinutes: integer, deepMinutes: integer, awakeMinutes: integer } or null if sleep not mentioned. If only total hours mentioned, estimate: REM=20%, deep=15%, core=50%, awake=15% (round to nearest 5).",
          "hrv: { sdnn: integer ms, context: 'morning'|'night'|'post-exercise'|'resting' } or null if HRV not mentioned. Default context 'morning'.",
          "confidence: 'high' if clear numeric values were stated for most sections, 'medium' if some values are approximate, 'low' if mostly unclear.",
          "reasoning: one sentence explaining your interpretation of all sections.",
          "",
          "Common speech patterns: 'BP 130 over 85' = bp.systolic 130, bp.diastolic 85. 'weight 150 pounds' = weight.weightLbs 150. 'sugar 102 fasting' = bloodSugar.valueMgDl 102, context fasting. 'slept 7 hours' = sleep.totalMinutes 420. 'HRV 52' = hrv.sdnn 52.",
          "Return ONLY valid JSON, no markdown.",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          bp: { systolic: number; diastolic: number } | null;
          weight: { weightKg: number; weightLbs: number; unit: string } | null;
          bloodSugar: { valueMgDl: number; valueMmol: number; context: string } | null;
          sleep: { totalMinutes: number; remMinutes: number; coreMinutes: number; deepMinutes: number; awakeMinutes: number } | null;
          hrv: { sdnn: number; context: string } | null;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const clamp = (v: number | null | undefined, min: number, max: number) =>
          v != null ? Math.min(max, Math.max(min, Math.round(v))) : null;
        const clampF = (v: number | null | undefined, min: number, max: number) =>
          v != null ? Math.min(max, Math.max(min, v)) : null;
        return {
          transcript,
          bp: parsed.bp ? {
            systolic: clamp(parsed.bp.systolic, 50, 300) ?? 0,
            diastolic: clamp(parsed.bp.diastolic, 30, 200) ?? 0,
          } : null,
          weight: parsed.weight ? {
            weightKg: clampF(parsed.weight.weightKg, 10, 500) ?? 0,
            weightLbs: clampF(parsed.weight.weightLbs, 22, 1100) ?? 0,
            unit: (parsed.weight.unit === 'kg' ? 'kg' : 'lbs') as 'kg' | 'lbs',
          } : null,
          bloodSugar: parsed.bloodSugar ? {
            valueMgDl: clampF(parsed.bloodSugar.valueMgDl, 20, 800) ?? 0,
            valueMmol: clampF(parsed.bloodSugar.valueMmol, 1, 45) ?? 0,
            context: ['fasting','post-meal','random','bedtime'].includes(parsed.bloodSugar.context) ? parsed.bloodSugar.context : 'random',
          } : null,
          sleep: parsed.sleep ? {
            totalMinutes: clamp(parsed.sleep.totalMinutes, 0, 1440) ?? 0,
            remMinutes: clamp(parsed.sleep.remMinutes, 0, 600) ?? 0,
            coreMinutes: clamp(parsed.sleep.coreMinutes, 0, 900) ?? 0,
            deepMinutes: clamp(parsed.sleep.deepMinutes, 0, 600) ?? 0,
            awakeMinutes: clamp(parsed.sleep.awakeMinutes, 0, 300) ?? 0,
          } : null,
          hrv: parsed.hrv ? {
            sdnn: clamp(parsed.hrv.sdnn, 1, 300) ?? 0,
            context: ['morning','night','post-exercise','resting'].includes(parsed.hrv.context) ? parsed.hrv.context : 'morning',
          } : null,
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 300),
          disclaimer: "Smart estimates only — please verify before saving.",
        };
      }),

    /**
     * Transcribes a voice recording and parses it to extract body weight.
     * Returns: { transcript, weightKg, weightLbs, unit, note, confidence, reasoning, disclaimer }
     */
    parseVoiceWeight: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        // 1. Upload audio to S3
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `health-voice/wt-${Date.now()}-${suffix}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

        // 2. Transcribe with Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Body weight, kilograms, kg, pounds, lbs, stone, weight reading",
        });
        const transcript = 'text' in transcriptionResult ? (transcriptionResult.text ?? "") : "";

        if (!transcript.trim()) {
          return {
            transcript: "",
            weightKg: null as number | null,
            weightLbs: null as number | null,
            unit: "lbs" as "kg" | "lbs",
            note: "",
            confidence: "low" as const,
            reasoning: "No speech detected in the recording.",
            disclaimer: "Smart estimates only — please verify before saving.",
          };
        }

        // 3. Parse with LLM
        const systemPrompt = [
          "You are a clinical data entry assistant. A user has verbally stated their body weight.",
          "Extract the following from their statement and return a JSON object:",
          "- weightKg: the weight value in kilograms (number with 1 decimal place, or null if not determinable).",
          "- weightLbs: the weight value in pounds (number with 1 decimal place, or null if not determinable).",
          "  If the user stated kg, convert to lbs (multiply by 2.20462). If lbs, convert to kg (divide by 2.20462).",
          "  If the user stated stone, convert: 1 stone = 6.35029 kg.",
          "- unit: the unit the user stated — 'kg' or 'lbs'. Default to 'lbs' if unclear.",
          "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
          "- confidence: 'high' if a clear numeric value was stated, 'medium' if approximate, 'low' if unclear.",
          "- reasoning: one sentence explaining your interpretation.",
          "If no numeric weight value was mentioned, set both weightKg and weightLbs to null.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];

        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          weightKg: number | null;
          weightLbs: number | null;
          unit: "kg" | "lbs";
          note: string;
          confidence: "high" | "medium" | "low";
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        const roundOne = (v: number | null) => v != null ? Math.round(v * 10) / 10 : null;

        return {
          transcript,
          weightKg: roundOne(parsed.weightKg),
          weightLbs: roundOne(parsed.weightLbs),
          unit: parsed.unit ?? "lbs",
          note: (parsed.note ?? "").slice(0, 80),
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 200),
          disclaimer: "Smart estimates only — please verify before saving.",
        };
      }),

    /**
     * Parses a voice transcript to extract medical history condition data.
     * Returns: { condition, icdCode, diagnosedDate, status, treatingPhysician, notes, confidence, disclaimer }
     */
    parseMedicalHistoryTranscript: publicProcedure
      .input(z.object({
        transcript: z.string(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a medical condition or diagnosis.",
          "Extract every piece of medical history information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- condition: the medical condition or diagnosis name, e.g. 'Type 2 Diabetes Mellitus', 'Hypertension', 'Asthma' (string or null)",
          "- icdCode: the ICD-10 code if mentioned or clearly implied, e.g. 'E11' for T2DM, 'I10' for hypertension (string or null)",
          "- diagnosedDate: the date of diagnosis in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
          "- status: one of exactly: 'active', 'resolved', 'chronic', 'in_remission'. Infer from context — 'I had it but it's gone' = 'resolved', 'I manage it daily' = 'chronic', 'it's under control' = 'in_remission'. Default to 'active'.",
          "- treatingPhysician: doctor or specialist name if mentioned (string or null)",
          "- notes: any additional personal notes, symptoms, or context mentioned (string or null)",
          "- confidence: 'high' if condition name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${input.transcript}"` },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          condition: string | null;
          icdCode: string | null;
          diagnosedDate: string | null;
          status: string | null;
          treatingPhysician: string | null;
          notes: string | null;
          confidence: string;
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        const validStatuses = ['active', 'resolved', 'chronic', 'in_remission'];

        return {
          condition: parsed.condition ? String(parsed.condition).slice(0, 120) : null,
          icdCode: parsed.icdCode ? String(parsed.icdCode).slice(0, 20) : null,
          diagnosedDate: parsed.diagnosedDate ? String(parsed.diagnosedDate).slice(0, 10) : null,
          status: validStatuses.includes(parsed.status ?? '') ? parsed.status as string : 'active',
          treatingPhysician: parsed.treatingPhysician ? String(parsed.treatingPhysician).slice(0, 80) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted — please review all fields before saving.",
        };
      }),

    /**
     * Parses a voice transcript to extract surgical history procedure data.
     * Returns: { procedure, cptCode, surgeryDate, surgeryType, surgeon, facility, anesthesia, complications, notes, confidence, disclaimer }
     */
    parseSurgicalHistoryTranscript: publicProcedure
      .input(z.object({
        transcript: z.string(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a surgical procedure they had.",
          "Extract every piece of surgical history information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- procedure: the surgical procedure name, e.g. 'Appendectomy', 'Coronary Artery Bypass Graft', 'Knee Replacement' (string or null)",
          "- cptCode: the CPT procedure code if mentioned (string or null)",
          "- surgeryDate: the date of surgery in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
          "- surgeryType: one of exactly: 'elective', 'emergency', 'diagnostic', 'reconstructive', 'other'. Infer from context — 'emergency surgery' = 'emergency', 'scheduled' = 'elective', 'biopsy' = 'diagnostic'. Default to 'elective'.",
          "- surgeon: surgeon or doctor name if mentioned (string or null)",
          "- facility: hospital or surgical center name if mentioned (string or null)",
          "- anesthesia: one of exactly: 'general', 'regional', 'local', 'sedation', or null. Infer from context.",
          "- complications: any post-surgical complications mentioned (string or null)",
          "- notes: any additional personal notes or context mentioned (string or null)",
          "- confidence: 'high' if procedure name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${input.transcript}"` },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          procedure: string | null;
          cptCode: string | null;
          surgeryDate: string | null;
          surgeryType: string | null;
          surgeon: string | null;
          facility: string | null;
          anesthesia: string | null;
          complications: string | null;
          notes: string | null;
          confidence: string;
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        const validTypes = ['elective', 'emergency', 'diagnostic', 'reconstructive', 'other'];
        const validAnesthesia = ['general', 'regional', 'local', 'sedation'];

        return {
          procedure: parsed.procedure ? String(parsed.procedure).slice(0, 120) : null,
          cptCode: parsed.cptCode ? String(parsed.cptCode).slice(0, 20) : null,
          surgeryDate: parsed.surgeryDate ? String(parsed.surgeryDate).slice(0, 10) : null,
          surgeryType: validTypes.includes(parsed.surgeryType ?? '') ? parsed.surgeryType as string : 'elective',
          surgeon: parsed.surgeon ? String(parsed.surgeon).slice(0, 80) : null,
          facility: parsed.facility ? String(parsed.facility).slice(0, 100) : null,
          anesthesia: validAnesthesia.includes(parsed.anesthesia ?? '') ? parsed.anesthesia as string : null,
          complications: parsed.complications ? String(parsed.complications).slice(0, 200) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted — please review all fields before saving.",
        };
      }),

    /**
     * Parses a voice recording to extract appointment data.
     * Transcribes with Whisper, then parses the transcript with the LLM.
     * Returns: { doctorName, specialty, dateTime, location, notes, referredBy, confidence, reasoning, disclaimer }
     */
    parseVoiceAppointment: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        // 1. Upload audio to S3
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const fileKey = `voice-scribe/appointment-${Date.now()}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

        // 2. Transcribe with Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Doctor appointment, specialist, clinic, date, time, location, referred by, prep notes",
        });
        if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
        const transcript = transcriptionResult.text;

        // 3. Parse with LLM
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a doctor appointment.",
          "Extract every piece of appointment information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- doctorName: the doctor's last name only (without 'Dr.' prefix), e.g. 'Smith', 'Johnson' (string or null)",
          "- specialty: the medical specialty or clinic type, e.g. 'Cardiology', 'Primary Care', 'Endocrinology' (string or null)",
          "- dateTime: the appointment date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS), or null if not mentioned. If only a date is mentioned, use T09:00:00. If only a time is mentioned, use today's date.",
          "- location: the clinic name, hospital, or address if mentioned (string or null)",
          "- notes: any prep instructions, fasting requirements, or other notes mentioned (string or null)",
          "- referredBy: the referring doctor's name if mentioned (string or null)",
          "- confidence: 'high' if doctor name and date are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          doctorName: string | null;
          specialty: string | null;
          dateTime: string | null;
          location: string | null;
          notes: string | null;
          referredBy: string | null;
          confidence: string;
          reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }

        return {
          transcript,
          doctorName: parsed.doctorName ? String(parsed.doctorName).replace(/^Dr\.?\s*/i, '').slice(0, 80) : null,
          specialty: parsed.specialty ? String(parsed.specialty).slice(0, 80) : null,
          dateTime: parsed.dateTime ? String(parsed.dateTime).slice(0, 30) : null,
          location: parsed.location ? String(parsed.location).slice(0, 150) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          referredBy: parsed.referredBy ? String(parsed.referredBy).slice(0, 80) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted — please review all fields before saving.",
        };
      }),

    /**
     * Parses a text transcript of a spoken appointment description.
     * Used by Apple Speech mode (on-device transcription) — no audio upload needed.
     * Returns same shape as parseVoiceAppointment minus { transcript }.
     */
    parseAppointmentTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const { transcript } = input;
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a doctor appointment.",
          "Extract every piece of appointment information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- doctorName: the doctor's last name only (without 'Dr.' prefix), e.g. 'Smith', 'Johnson' (string or null)",
          "- specialty: the medical specialty or clinic type, e.g. 'Cardiology', 'Primary Care', 'Endocrinology' (string or null)",
          "- dateTime: the appointment date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS), or null if not mentioned. If only a date is mentioned, use T09:00:00. If only a time is mentioned, use today's date.",
          "- location: the clinic name, hospital, or address if mentioned (string or null)",
          "- notes: any prep instructions, fasting requirements, or other notes mentioned (string or null)",
          "- referredBy: the referring doctor's name if mentioned (string or null)",
          "- confidence: 'high' if doctor name and date are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          doctorName: string | null; specialty: string | null; dateTime: string | null;
          location: string | null; notes: string | null; referredBy: string | null;
          confidence: string; reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        return {
          transcript,
          doctorName: parsed.doctorName ? String(parsed.doctorName).replace(/^Dr\.?\s*/i, '').slice(0, 80) : null,
          specialty: parsed.specialty ? String(parsed.specialty).slice(0, 80) : null,
          dateTime: parsed.dateTime ? String(parsed.dateTime).slice(0, 30) : null,
          location: parsed.location ? String(parsed.location).slice(0, 150) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          referredBy: parsed.referredBy ? String(parsed.referredBy).slice(0, 80) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
        };
      }),

    /**
     * Parses a voice recording to extract medical history condition data.
     * Transcribes with Whisper, then parses the transcript with the LLM.
     * Returns same shape as parseMedicalHistoryTranscript plus { transcript }
     */
    parseMedicalHistoryVoice: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const fileKey = `voice-scribe/medical-history-${Date.now()}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Medical condition, diagnosis, ICD code, date diagnosed, treating physician, status, personal notes",
        });
        if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
        const transcript = transcriptionResult.text;

        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a medical condition or diagnosis.",
          "Extract every piece of medical history information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- condition: the medical condition or diagnosis name, e.g. 'Type 2 Diabetes Mellitus', 'Hypertension', 'Asthma' (string or null)",
          "- icdCode: the ICD-10 code if mentioned or clearly implied (string or null)",
          "- diagnosedDate: the date of diagnosis in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
          "- status: one of exactly: 'active', 'resolved', 'chronic', 'in_remission'. Default to 'active'.",
          "- treatingPhysician: doctor or specialist name if mentioned (string or null)",
          "- notes: any additional personal notes, symptoms, or context mentioned (string or null)",
          "- confidence: 'high' if condition name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: { condition: string | null; icdCode: string | null; diagnosedDate: string | null; status: string | null; treatingPhysician: string | null; notes: string | null; confidence: string; reasoning: string; };
        try { parsed = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const validStatuses = ['active', 'resolved', 'chronic', 'in_remission'];
        return {
          transcript,
          condition: parsed.condition ? String(parsed.condition).slice(0, 120) : null,
          icdCode: parsed.icdCode ? String(parsed.icdCode).slice(0, 20) : null,
          diagnosedDate: parsed.diagnosedDate ? String(parsed.diagnosedDate).slice(0, 10) : null,
          status: validStatuses.includes(parsed.status ?? '') ? parsed.status as string : 'active',
          treatingPhysician: parsed.treatingPhysician ? String(parsed.treatingPhysician).slice(0, 80) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
        };
      }),

    /**
     * Parses a voice recording to extract surgical history procedure data.
     * Transcribes with Whisper, then parses the transcript with the LLM.
     * Returns same shape as parseSurgicalHistoryTranscript plus { transcript }
     */
    parseSurgicalHistoryVoice: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const fileKey = `voice-scribe/surgical-history-${Date.now()}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Surgical procedure, CPT code, date of surgery, surgeon, hospital, anesthesia, complications, personal notes",
        });
        if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
        const transcript = transcriptionResult.text;

        const systemPrompt = [
          "You are a clinical data entry assistant. A patient has verbally described a surgical procedure they had.",
          "Extract every piece of surgical history information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- procedure: the surgical procedure name, e.g. 'Appendectomy', 'Coronary Artery Bypass Graft' (string or null)",
          "- cptCode: the CPT procedure code if mentioned (string or null)",
          "- surgeryDate: the date of surgery in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
          "- surgeryType: one of exactly: 'elective', 'emergency', 'diagnostic', 'reconstructive', 'other'. Default to 'elective'.",
          "- surgeon: surgeon or doctor name if mentioned (string or null)",
          "- facility: hospital or surgical center name if mentioned (string or null)",
          "- anesthesia: one of exactly: 'general', 'regional', 'local', 'sedation', or null.",
          "- complications: any post-surgical complications mentioned (string or null)",
          "- notes: any additional personal notes or context mentioned (string or null)",
          "- confidence: 'high' if procedure name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");

        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: { procedure: string | null; cptCode: string | null; surgeryDate: string | null; surgeryType: string | null; surgeon: string | null; facility: string | null; anesthesia: string | null; complications: string | null; notes: string | null; confidence: string; reasoning: string; };
        try { parsed = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const validTypes = ['elective', 'emergency', 'diagnostic', 'reconstructive', 'other'];
        const validAnesthesia = ['general', 'regional', 'local', 'sedation'];
        return {
          transcript,
          procedure: parsed.procedure ? String(parsed.procedure).slice(0, 120) : null,
          cptCode: parsed.cptCode ? String(parsed.cptCode).slice(0, 20) : null,
          surgeryDate: parsed.surgeryDate ? String(parsed.surgeryDate).slice(0, 10) : null,
          surgeryType: validTypes.includes(parsed.surgeryType ?? '') ? parsed.surgeryType as string : 'elective',
          surgeon: parsed.surgeon ? String(parsed.surgeon).slice(0, 80) : null,
          facility: parsed.facility ? String(parsed.facility).slice(0, 100) : null,
          anesthesia: validAnesthesia.includes(parsed.anesthesia ?? '') ? parsed.anesthesia as string : null,
          complications: parsed.complications ? String(parsed.complications).slice(0, 200) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
        };
      }),

    /**
     * Voice Smart Scribe for Medical ID (allergies, conditions, medications, notes).
     * Transcribes audio and extracts structured Medical ID fields.
     */
    parseVoiceMedicalID: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const fileKey = `voice-scribe/medical-id-${Date.now()}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Allergies, medical conditions, current medications, organ donor status, notes for first responders",
        });
        if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
        const transcript = transcriptionResult.text;
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient is dictating their Medical ID information for a health app.",
          "Extract every piece of medical identity information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- allergies: comma-separated list of allergens (e.g. 'Penicillin, Peanuts, Latex') or null",
          "- conditions: comma-separated list of medical conditions (e.g. 'Type 2 Diabetes, Hypertension') or null",
          "- medications: comma-separated list of current medications with doses if mentioned (e.g. 'Metformin 500mg, Lisinopril 10mg') or null",
          "- notes: any additional notes for first responders (e.g. 'wears contact lenses, has pacemaker') or null",
          "- confidence: 'high' if allergies or conditions are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: { allergies: string | null; conditions: string | null; medications: string | null; notes: string | null; confidence: string; reasoning: string; };
        try { parsed = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON: " + raw); }
        return {
          transcript,
          allergies: parsed.allergies ? String(parsed.allergies).slice(0, 300) : null,
          conditions: parsed.conditions ? String(parsed.conditions).slice(0, 300) : null,
          medications: parsed.medications ? String(parsed.medications).slice(0, 300) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
        };
      }),

    /**
     * Parses a plain-text transcript (from Apple Speech / SFSpeechRecognizer) to extract Medical ID data.
     * Identical LLM logic to parseVoiceMedicalID but skips the Whisper transcription step.
     * Returns: { transcript, allergies, conditions, medications, notes, confidence, reasoning, disclaimer }
     */
    parseVoiceMedicalIDTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const transcript = input.transcript.trim();
        if (!transcript) {
          return {
            transcript: "",
            allergies: null as string | null,
            conditions: null as string | null,
            medications: null as string | null,
            notes: null as string | null,
            confidence: "low" as const,
            reasoning: "No transcript provided.",
            disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
          };
        }
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient is dictating their Medical ID information for a health app.",
          "Extract every piece of medical identity information from their statement and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- allergies: comma-separated list of allergens (e.g. 'Penicillin, Peanuts, Latex') or null",
          "- conditions: comma-separated list of medical conditions (e.g. 'Type 2 Diabetes, Hypertension') or null",
          "- medications: comma-separated list of current medications with doses if mentioned (e.g. 'Metformin 500mg, Lisinopril 10mg') or null",
          "- notes: any additional notes for first responders (e.g. 'wears contact lenses, has pacemaker') or null",
          "- confidence: 'high' if allergies or conditions are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
          "- reasoning: one sentence explaining what you extracted and any assumptions made.",
          "Do not invent information not present in the transcript.",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: { allergies: string | null; conditions: string | null; medications: string | null; notes: string | null; confidence: string; reasoning: string; };
        try { parsed = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON: " + raw); }
        return {
          transcript,
          allergies: parsed.allergies ? String(parsed.allergies).slice(0, 300) : null,
          conditions: parsed.conditions ? String(parsed.conditions).slice(0, 300) : null,
          medications: parsed.medications ? String(parsed.medications).slice(0, 300) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
        };
      }),

    /**
     * Parses a plain-text transcript (from Apple Speech / SFSpeechRecognizer) to extract immunization data.
     * Identical LLM logic to parseImmunizationVoice but skips the Whisper transcription step.
     * Returns same shape as parseImmunizationVoice plus { transcript }
     */
    parseImmunizationTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const transcript = input.transcript.trim();
        if (!transcript) {
          return {
            transcript: "",
            vaccineName: null as string | null,
            vaccineType: null as string | null,
            manufacturer: null as string | null,
            lotNumber: null as string | null,
            dateAdministered: null as string | null,
            doseNumber: null as number | null,
            seriesTotal: null as number | null,
            nextDoseDate: null as string | null,
            administeredBy: null as string | null,
            site: null as string | null,
            route: null as string | null,
            reactions: null as string | null,
            notes: null as string | null,
            confidence: "low" as const,
            reasoning: "No transcript provided.",
            filledCount: 0,
            totalFields: 13,
            vaccines: [] as any[],
            isBatch: false,
            disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
          };
        }
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient is verbally describing their vaccination history.",
          "Extract every vaccine mentioned and return a JSON object with a top-level key 'vaccines' containing an ARRAY of vaccine objects.",
          "Each vaccine object has these fields (use null for any field not mentioned):",
          "- vaccineName: vaccine name e.g. 'Influenza (Flu)', 'COVID-19 mRNA', 'Tdap', 'Shingrix' (string or null)",
          "- vaccineType: e.g. 'mRNA', 'Live attenuated', 'Inactivated', 'Subunit' (string or null)",
          "- manufacturer: e.g. 'Pfizer-BioNTech', 'Moderna' (string or null)",
          "- lotNumber: lot or batch number (string or null)",
          "- dateAdministered: YYYY-MM-DD format, infer year if not stated (string or null)",
          "- doseNumber: which dose in series e.g. 1, 2 (number or null)",
          "- seriesTotal: total doses in series e.g. 2 (number or null)",
          "- nextDoseDate: YYYY-MM-DD for next dose/booster (string or null)",
          "- administeredBy: clinic or provider name (string or null)",
          "- site: one of 'left_arm','right_arm','left_thigh','right_thigh','other' or null",
          "- route: one of 'intramuscular','subcutaneous','oral','intranasal','intradermal','other' or null",
          "- reactions: adverse reactions mentioned (string or null)",
          "- notes: additional notes (string or null)",
          "- confidence: 'high' if vaccine name clear, 'medium' if inferred, 'low' if unclear",
          "- reasoning: one sentence explaining extraction",
          "Example: { \"vaccines\": [ { \"vaccineName\": \"Flu\", ... }, { \"vaccineName\": \"COVID-19\", ... } ] }",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        type ParsedVaccine = {
          vaccineName: string | null; vaccineType: string | null; manufacturer: string | null;
          lotNumber: string | null; dateAdministered: string | null; doseNumber: number | null;
          seriesTotal: number | null; nextDoseDate: string | null; administeredBy: string | null;
          site: string | null; route: string | null; reactions: string | null; notes: string | null;
          confidence: string; reasoning: string;
        };
        let parsedRoot: { vaccines?: ParsedVaccine[] } & ParsedVaccine;
        try { parsedRoot = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const parsedList: ParsedVaccine[] = Array.isArray(parsedRoot.vaccines) && parsedRoot.vaccines.length > 0
          ? parsedRoot.vaccines : [parsedRoot];
        const validSites = ['left_arm', 'right_arm', 'left_thigh', 'right_thigh', 'other'];
        const validRoutes = ['intramuscular', 'subcutaneous', 'oral', 'intranasal', 'intradermal', 'other'];
        const fields = ['vaccineName', 'vaccineType', 'manufacturer', 'lotNumber', 'dateAdministered', 'doseNumber', 'seriesTotal', 'nextDoseDate', 'administeredBy', 'site', 'route', 'reactions', 'notes'];
        const vaccines = parsedList.map(parsed => {
          const filledCount = fields.filter(f => (parsed as any)[f] !== null && (parsed as any)[f] !== undefined).length;
          return {
            vaccineName: parsed.vaccineName ? String(parsed.vaccineName).slice(0, 120) : null,
            vaccineType: parsed.vaccineType ? String(parsed.vaccineType).slice(0, 60) : null,
            manufacturer: parsed.manufacturer ? String(parsed.manufacturer).slice(0, 80) : null,
            lotNumber: parsed.lotNumber ? String(parsed.lotNumber).slice(0, 40) : null,
            dateAdministered: parsed.dateAdministered ? String(parsed.dateAdministered).slice(0, 10) : null,
            doseNumber: typeof parsed.doseNumber === 'number' ? parsed.doseNumber : null,
            seriesTotal: typeof parsed.seriesTotal === 'number' ? parsed.seriesTotal : null,
            nextDoseDate: parsed.nextDoseDate ? String(parsed.nextDoseDate).slice(0, 10) : null,
            administeredBy: parsed.administeredBy ? String(parsed.administeredBy).slice(0, 100) : null,
            site: validSites.includes(parsed.site ?? '') ? parsed.site as string : null,
            route: validRoutes.includes(parsed.route ?? '') ? parsed.route as string : null,
            reactions: parsed.reactions ? String(parsed.reactions).slice(0, 200) : null,
            notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
            confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
            reasoning: (parsed.reasoning ?? '').slice(0, 300),
            filledCount,
            totalFields: fields.length,
          };
        });
        const first = vaccines[0];
        return {
          transcript,
          ...first,
          vaccines,
          isBatch: vaccines.length > 1,
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving.",
        };
      }),

    /**
     * Meal IQ: Analyze the physiological impact of a meal on vitals logged 1-4 hours later.
     * Returns: { insight, bpImpact, hrImpact, glucoseImpact, sodiumSensitive, glycemicLoad, naKRatio, fiberCarbRatio, disclaimer }
     */
    analyzeMealImpact: publicProcedure
      .input(z.object({
        meal: z.object({
          name: z.string().optional(),
          sodiumMg: z.number(),
          potassiumMg: z.number().optional(),
          carbsG: z.number().optional(),
          fiberG: z.number().optional(),
          proteinG: z.number().optional(),
          fatG: z.number().optional(),
          calories: z.number().optional(),
          timestamp: z.string(),
        }),
        vitalsAfter: z.array(z.object({
          type: z.enum(['bloodPressure', 'heartRate', 'bloodSugar']),
          value: z.string(),
          timestamp: z.string(),
          minutesAfterMeal: z.number(),
        })).optional(),
        vitalsBefore: z.array(z.object({
          type: z.enum(['bloodPressure', 'heartRate', 'bloodSugar']),
          value: z.string(),
          timestamp: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { meal, vitalsAfter = [], vitalsBefore = [] } = input;

        // Compute Na:K ratio
        const naKRatio = meal.potassiumMg && meal.potassiumMg > 0
          ? Math.round((meal.sodiumMg / meal.potassiumMg) * 100) / 100
          : null;

        // Compute Fiber:Carb ratio
        const fiberCarbRatio = meal.carbsG && meal.carbsG > 0 && meal.fiberG != null
          ? Math.round((meal.fiberG / meal.carbsG) * 100) / 100
          : null;

        const systemPrompt = [
          "You are a clinical nutrition and cardiovascular health analyst.",
          "Analyze the physiological impact of the described meal based on its nutritional content and any vital signs recorded before and after eating.",
          "Return ONLY a JSON object with these fields:",
          "- insight: a 1-2 sentence 'Meal IQ' clinical insight starting with 'Meal IQ:'. Be specific about the physiological mechanism. Examples:",
          "  'Meal IQ: Your BP rose 12mmHg after this high-sodium meal. You may be Sodium Sensitive.'",
          "  'Meal IQ: This meal had a high Glycemic Load, correlating with your 3:00 PM fatigue.'",
          "  'Meal IQ: Excellent Na:K ratio of 0.6 — this meal actively supports blood pressure control.'",
          "- bpImpact: 'elevated' | 'neutral' | 'beneficial' | 'unknown' — based on sodium content and BP readings",
          "- hrImpact: 'elevated' | 'neutral' | 'beneficial' | 'unknown' — based on meal composition and HR readings",
          "- glucoseImpact: 'high' | 'moderate' | 'low' | 'unknown' — glycemic impact based on carbs and fiber",
          "- sodiumSensitive: true if BP rose >8mmHg after a high-sodium meal, false otherwise, null if unknown",
          "- glycemicLoad: 'high' | 'moderate' | 'low' | 'unknown' — based on carbs and fiber ratio",
          "- keyNutrient: the single most clinically significant nutrient in this meal (e.g. 'sodium', 'fiber', 'refined carbs')",
          "- recommendation: one short actionable recommendation (max 15 words)",
          "Use clinical evidence. The Na:K ratio is a stronger predictor of hypertension than sodium alone.",
          "High fiber-to-carb ratio (>0.15) modulates the glucose curve and reduces insulin spikes.",
        ].join("\n");

        const mealDesc = [
          meal.name ? `Meal: ${meal.name}` : 'Unnamed meal',
          `Sodium: ${meal.sodiumMg}mg`,
          meal.potassiumMg ? `Potassium: ${meal.potassiumMg}mg` : null,
          meal.carbsG != null ? `Carbs: ${meal.carbsG}g` : null,
          meal.fiberG != null ? `Fiber: ${meal.fiberG}g` : null,
          meal.proteinG != null ? `Protein: ${meal.proteinG}g` : null,
          meal.fatG != null ? `Fat: ${meal.fatG}g` : null,
          meal.calories != null ? `Calories: ${meal.calories}kcal` : null,
          naKRatio != null ? `Na:K ratio: ${naKRatio}` : null,
          fiberCarbRatio != null ? `Fiber:Carb ratio: ${fiberCarbRatio}` : null,
        ].filter(Boolean).join(', ');

        const vitalsDesc = [
          vitalsBefore.length > 0 ? `Before meal: ${vitalsBefore.map(v => `${v.type}=${v.value}`).join(', ')}` : null,
          vitalsAfter.length > 0 ? `After meal (${vitalsAfter.map(v => `${v.minutesAfterMeal}min: ${v.type}=${v.value}`).join(', ')})` : null,
        ].filter(Boolean).join(' | ');

        const userMessage = vitalsDesc
          ? `${mealDesc}. Vital signs: ${vitalsDesc}`
          : mealDesc;

        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ];

        const response = await invokeLLM({
          messages,
          response_format: { type: 'json_object' },
        });

        const raw = String(response.choices[0].message.content);
        let parsed: {
          insight: string;
          bpImpact: string;
          hrImpact: string;
          glucoseImpact: string;
          sodiumSensitive: boolean | null;
          glycemicLoad: string;
          keyNutrient: string;
          recommendation: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error('LLM returned invalid JSON: ' + raw); }

        return {
          insight: String(parsed.insight ?? '').slice(0, 400),
          bpImpact: (['elevated', 'neutral', 'beneficial', 'unknown'].includes(parsed.bpImpact ?? '') ? parsed.bpImpact : 'unknown') as string,
          hrImpact: (['elevated', 'neutral', 'beneficial', 'unknown'].includes(parsed.hrImpact ?? '') ? parsed.hrImpact : 'unknown') as string,
          glucoseImpact: (['high', 'moderate', 'low', 'unknown'].includes(parsed.glucoseImpact ?? '') ? parsed.glucoseImpact : 'unknown') as string,
          sodiumSensitive: typeof parsed.sodiumSensitive === 'boolean' ? parsed.sodiumSensitive : null,
          glycemicLoad: (['high', 'moderate', 'low', 'unknown'].includes(parsed.glycemicLoad ?? '') ? parsed.glycemicLoad : 'unknown') as string,
          keyNutrient: String(parsed.keyNutrient ?? '').slice(0, 50),
          recommendation: String(parsed.recommendation ?? '').slice(0, 100),
          naKRatio,
          fiberCarbRatio,
          disclaimer: 'Meal IQ is an Smart-generated nutritional analysis for informational purposes only. Consult a registered dietitian for personalized dietary advice.',
        };
      }),
    /**
     * Voice Smart Scribe for Immunization Records.
     */
    parseImmunizationVoice: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "m4a";
        const fileKey = `voice-scribe/immunization-${Date.now()}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
        const transcriptionResult = await transcribeAudio({
          audioUrl,
          prompt: "Vaccine name, manufacturer, lot number, date administered, dose number, series, next dose date, clinic, site, route, reactions, notes",
        });
        if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
        const transcript = transcriptionResult.text;
        const systemPrompt = [
          "You are a clinical data entry assistant. Extract immunization information from the patient's statement.",
          "The patient may mention ONE or MULTIPLE vaccines in a single recording.",
          "Return ONLY a JSON object with a top-level key 'vaccines' containing an ARRAY of vaccine objects.",
          "Each vaccine object has these fields (use null for any field not mentioned):",
          "- vaccineName: vaccine name e.g. 'Influenza (Flu)', 'COVID-19 mRNA', 'Tdap', 'Shingrix' (string or null)",
          "- vaccineType: e.g. 'mRNA', 'Live attenuated', 'Inactivated', 'Subunit' (string or null)",
          "- manufacturer: e.g. 'Pfizer-BioNTech', 'Moderna' (string or null)",
          "- lotNumber: lot or batch number (string or null)",
          "- dateAdministered: YYYY-MM-DD format, infer year if not stated (string or null)",
          "- doseNumber: which dose in series e.g. 1, 2 (number or null)",
          "- seriesTotal: total doses in series e.g. 2 (number or null)",
          "- nextDoseDate: YYYY-MM-DD for next dose/booster (string or null)",
          "- administeredBy: clinic or provider name (string or null)",
          "- site: one of 'left_arm','right_arm','left_thigh','right_thigh','other' or null",
          "- route: one of 'intramuscular','subcutaneous','oral','intranasal','intradermal','other' or null",
          "- reactions: adverse reactions mentioned (string or null)",
          "- notes: additional notes (string or null)",
          "- confidence: 'high' if vaccine name clear, 'medium' if inferred, 'low' if unclear",
          "- reasoning: one sentence explaining extraction",
          "Example: { \"vaccines\": [ { \"vaccineName\": \"Flu\", ... }, { \"vaccineName\": \"COVID-19\", ... } ] }",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        type ParsedVaccine = {
          vaccineName: string | null; vaccineType: string | null; manufacturer: string | null;
          lotNumber: string | null; dateAdministered: string | null; doseNumber: number | null;
          seriesTotal: number | null; nextDoseDate: string | null; administeredBy: string | null;
          site: string | null; route: string | null; reactions: string | null; notes: string | null;
          confidence: string; reasoning: string;
        };
        let parsedRoot: { vaccines?: ParsedVaccine[] } & ParsedVaccine;
        try { parsedRoot = JSON.parse(raw); } catch { throw new Error("LLM returned invalid JSON: " + raw); }
        // Support both array (batch) and single-object (legacy) responses
        const parsedList: ParsedVaccine[] = Array.isArray(parsedRoot.vaccines) && parsedRoot.vaccines.length > 0
          ? parsedRoot.vaccines
          : [parsedRoot];
        const validSites = ['left_arm', 'right_arm', 'left_thigh', 'right_thigh', 'other'];
        const validRoutes = ['intramuscular', 'subcutaneous', 'oral', 'intranasal', 'intradermal', 'other'];
        const fields = ['vaccineName', 'vaccineType', 'manufacturer', 'lotNumber', 'dateAdministered', 'doseNumber', 'seriesTotal', 'nextDoseDate', 'administeredBy', 'site', 'route', 'reactions', 'notes'];
        const vaccines = parsedList.map(parsed => {
          const filledCount = fields.filter(f => (parsed as any)[f] !== null && (parsed as any)[f] !== undefined).length;
          return {
            vaccineName: parsed.vaccineName ? String(parsed.vaccineName).slice(0, 120) : null,
            vaccineType: parsed.vaccineType ? String(parsed.vaccineType).slice(0, 60) : null,
            manufacturer: parsed.manufacturer ? String(parsed.manufacturer).slice(0, 80) : null,
            lotNumber: parsed.lotNumber ? String(parsed.lotNumber).slice(0, 40) : null,
            dateAdministered: parsed.dateAdministered ? String(parsed.dateAdministered).slice(0, 10) : null,
            doseNumber: typeof parsed.doseNumber === 'number' ? parsed.doseNumber : null,
            seriesTotal: typeof parsed.seriesTotal === 'number' ? parsed.seriesTotal : null,
            nextDoseDate: parsed.nextDoseDate ? String(parsed.nextDoseDate).slice(0, 10) : null,
            administeredBy: parsed.administeredBy ? String(parsed.administeredBy).slice(0, 100) : null,
            site: validSites.includes(parsed.site ?? '') ? parsed.site as string : null,
            route: validRoutes.includes(parsed.route ?? '') ? parsed.route as string : null,
            reactions: parsed.reactions ? String(parsed.reactions).slice(0, 200) : null,
            notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
            confidence: (parsed.confidence ?? 'low') as 'high' | 'medium' | 'low',
            reasoning: (parsed.reasoning ?? '').slice(0, 300),
            filledCount,
            totalFields: fields.length,
          };
        });
        // Keep legacy single-record shape for backward compat (first vaccine)
        const first = vaccines[0];
        return {
          transcript,
          ...first,
          // Batch result: all vaccines parsed from the recording
          vaccines,
          isBatch: vaccines.length > 1,
          disclaimer: "Smart Scribe-extracted — please review all fields before saving.",
        };
      }),

    /**
     * Parses a spoken sleep transcript (Apple SFSpeechRecognizer) into structured sleep data.
     */
    parseSleepTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const today = new Date().toISOString().slice(0, 10);
        const systemPrompt = [
          "You are a health data entry assistant. A user has verbally described their sleep.",
          "Extract the following and return a JSON object:",
          "- bedtime: ISO 8601 datetime (use today if only time given, yesterday if 'last night'). null if not mentioned.",
          "- wakeTime: ISO 8601 datetime. If earlier than bedtime, assume next calendar day. null if not mentioned.",
          "- deepMins: deep sleep in minutes (integer or null).",
          "- remMins: REM sleep in minutes (integer or null).",
          "- coreMins: core/light sleep in minutes (integer or null).",
          "- awakeMins: time awake during night in minutes (integer or null).",
          "- quality: 1-5 score (1=terrible,3=okay,5=great). Infer from descriptive words. Default 3.",
          "- note: any extra notes (max 80 chars, empty string if none).",
          "- confidence: 'high' if bedtime+wakeTime clear, 'medium' if inferred, 'low' if unclear.",
          "- reasoning: one sentence explanation.",
          `Today is ${today}.`,
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${input.transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          bedtime: string | null; wakeTime: string | null;
          deepMins: number | null; remMins: number | null; coreMins: number | null; awakeMins: number | null;
          quality: number; note: string; confidence: string; reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        return {
          transcript: input.transcript,
          bedtime: parsed.bedtime ?? null,
          wakeTime: parsed.wakeTime ?? null,
          deepMins: parsed.deepMins != null ? Math.max(0, Math.round(parsed.deepMins)) : null,
          remMins: parsed.remMins != null ? Math.max(0, Math.round(parsed.remMins)) : null,
          coreMins: parsed.coreMins != null ? Math.max(0, Math.round(parsed.coreMins)) : null,
          awakeMins: parsed.awakeMins != null ? Math.max(0, Math.round(parsed.awakeMins)) : null,
          quality: Math.min(5, Math.max(1, Math.round(parsed.quality ?? 3))),
          note: (parsed.note ?? "").slice(0, 80),
          confidence: (parsed.confidence ?? "low") as "high" | "medium" | "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 300),
          disclaimer: "Smart estimates only — please review all fields before saving.",
        };
      }),

    /**
     * Accepts a base64-encoded photo of a vaccine card or prescription.
     * Uploads to S3, uses vision LLM to extract vaccine details and fill the form.
     */
    parseImmunizationPhoto: publicProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      }))
      .mutation(async ({ input }) => {
        const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `vaccine-photos/${Date.now()}-${suffix}.jpg`;
        const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
        const systemPrompt = [
          "You are a medical records assistant. The user photographed a vaccine card, immunization record, or prescription.",
          "Extract vaccine details and return a JSON object (null for anything not visible):",
          "- vaccineName: full vaccine name (string or null)",
          "- vaccineType: e.g. 'mRNA', 'Inactivated', 'Subunit' (string or null)",
          "- manufacturer: e.g. 'Pfizer-BioNTech', 'Moderna', 'Merck' (string or null)",
          "- lotNumber: lot/batch number (string or null)",
          "- dateAdministered: ISO 8601 date YYYY-MM-DD (string or null)",
          "- doseNumber: dose number in series (integer or null)",
          "- seriesTotal: total doses in series (integer or null)",
          "- nextDoseDate: ISO 8601 date for next dose (string or null)",
          "- administeredBy: clinic or provider name (string or null)",
          "- site: injection site e.g. 'Left deltoid' (string or null)",
          "- route: e.g. 'IM', 'SC', 'Oral' (string or null)",
          "- reactions: noted reactions (string or null)",
          "- notes: other relevant notes (string or null)",
          "- confidence: 'high' if vaccine name+date clearly readable, 'medium' if partial, 'low' if unclear",
          "- reasoning: one sentence about what you read.",
          "If not a vaccine card/medical record, set confidence to 'low' and all vaccine fields to null.",
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Read this vaccine card or immunization record and extract the details." },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          vaccineName: string | null; vaccineType: string | null; manufacturer: string | null;
          lotNumber: string | null; dateAdministered: string | null; doseNumber: number | null;
          seriesTotal: number | null; nextDoseDate: string | null; administeredBy: string | null;
          site: string | null; route: string | null; reactions: string | null; notes: string | null;
          confidence: string; reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        return {
          vaccineName: parsed.vaccineName ? String(parsed.vaccineName).slice(0, 120) : null,
          vaccineType: parsed.vaccineType ? String(parsed.vaccineType).slice(0, 60) : null,
          manufacturer: parsed.manufacturer ? String(parsed.manufacturer).slice(0, 80) : null,
          lotNumber: parsed.lotNumber ? String(parsed.lotNumber).slice(0, 40) : null,
          dateAdministered: parsed.dateAdministered ?? null,
          doseNumber: parsed.doseNumber != null ? Math.max(1, Math.round(parsed.doseNumber)) : null,
          seriesTotal: parsed.seriesTotal != null ? Math.max(1, Math.round(parsed.seriesTotal)) : null,
          nextDoseDate: parsed.nextDoseDate ?? null,
          administeredBy: parsed.administeredBy ? String(parsed.administeredBy).slice(0, 100) : null,
          site: parsed.site ? String(parsed.site).slice(0, 60) : null,
          route: parsed.route ? String(parsed.route).slice(0, 40) : null,
          reactions: parsed.reactions ? String(parsed.reactions).slice(0, 200) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 200) : null,
          confidence: (parsed.confidence ?? "low") as "high" | "medium" | "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 300),
          disclaimer: "Smart Scribe-extracted from photo — please review all fields before saving.",
        };
      }),

    /**
     * Parses a typed/dictated allergy transcript into structured AllergyRecord fields.
     * Handles: allergen name, category, reaction, severity, onset date, notes.
     */
    parseAllergyTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const transcript = input.transcript.trim();
        if (!transcript) {
          return {
            transcript: "",
            systolic: null as number | null,
            diastolic: null as number | null,
            heartRate: null as number | null,
            hrv: null as number | null,
            spo2: null as number | null,
            temperature: null as number | null,
            respiratoryRate: null as number | null,
            weight: null as number | null,
            steps: null as number | null,
            sleepHours: null as number | null,
            note: null as string | null,
            confidence: "low" as const,
            reasoning: "No transcript provided.",
            filledCount: 0,
            totalFields: 11,
          };
        }
        const today = new Date().toISOString().slice(0, 10);
        const systemPrompt = [
          "You are a clinical data entry assistant. A patient is dictating their vital signs.",
          "Extract every vital sign value and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- systolic: systolic blood pressure in mmHg (integer, e.g. 120)",
          "- diastolic: diastolic blood pressure in mmHg (integer, e.g. 80)",
          "- heartRate: heart rate / pulse in bpm (integer)",
          "- hrv: heart rate variability in ms (integer, or null)",
          "- spo2: blood oxygen saturation as a percentage 0-100 (number, e.g. 98.5)",
          "- temperature: body temperature in Fahrenheit (number, e.g. 98.6). Convert Celsius to Fahrenheit if needed.",
          "- respiratoryRate: respiratory rate in breaths per minute (integer)",
          "- weight: body weight in pounds (number). Convert kg to lbs if needed.",
          "- steps: step count for the day (integer)",
          "- sleepHours: hours of sleep last night (number, e.g. 7.5)",
          "- note: any additional notes or context the patient mentioned (string or null)",
          "- confidence: 'high' if multiple vitals clearly stated, 'medium' if partially inferred, 'low' if very unclear",
          "- reasoning: one sentence explaining what you extracted and any assumptions made",
          "Do not invent values not present in the transcript.",
          `Today is ${today}.`,
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Patient said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          systolic: number | null; diastolic: number | null; heartRate: number | null;
          hrv: number | null; spo2: number | null; temperature: number | null;
          respiratoryRate: number | null; weight: number | null; steps: number | null;
          sleepHours: number | null; note: string | null; confidence: string; reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const toNum = (v: unknown): number | null => { const n = Number(v); return (v !== null && v !== undefined && v !== '' && !isNaN(n)) ? n : null; };
        const filledCount = [
          parsed.systolic, parsed.diastolic, parsed.heartRate, parsed.hrv,
          parsed.spo2, parsed.temperature, parsed.respiratoryRate,
          parsed.weight, parsed.steps, parsed.sleepHours, parsed.note,
        ].filter(v => v !== null && v !== undefined).length;
        return {
          transcript,
          systolic: toNum(parsed.systolic),
          diastolic: toNum(parsed.diastolic),
          heartRate: toNum(parsed.heartRate),
          hrv: toNum(parsed.hrv),
          spo2: toNum(parsed.spo2),
          temperature: toNum(parsed.temperature),
          respiratoryRate: toNum(parsed.respiratoryRate),
          weight: toNum(parsed.weight),
          steps: toNum(parsed.steps),
          sleepHours: toNum(parsed.sleepHours),
          note: parsed.note ? String(parsed.note).slice(0, 300) : null,
          confidence: (['high', 'medium', 'low'].includes(parsed.confidence ?? '') ? parsed.confidence : 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          filledCount,
          totalFields: 11,
        };
      }),

    /**
     * Parses a free-text activity dictation and extracts structured activity fields.
     * Returns: { activityType, duration, distance, distanceUnit, steps, calories, avgHR, maxHR, note, confidence, reasoning, filledCount, totalFields }
     */
    parseActivityTranscript: publicProcedure
      .input(z.object({ transcript: z.string() }))
      .mutation(async ({ input }) => {
        const { transcript } = input;
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const systemPrompt = [
          "You are a clinical data entry assistant. A user is dictating an activity/exercise log entry.",
          "Extract every activity field and return a JSON object.",
          "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
          "- activityType: one of 'running', 'walking', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'sports', 'other' (string)",
          "- duration: duration in minutes (integer)",
          "- distance: distance value as a number (e.g. 5.2). Convert to the unit the user stated.",
          "- distanceUnit: 'km' or 'mi' (string, infer from context or default to 'km')",
          "- steps: step count (integer, or null)",
          "- calories: calories burned (integer, or null)",
          "- avgHR: average heart rate in bpm (integer, or null)",
          "- maxHR: maximum heart rate in bpm (integer, or null)",
          "- note: any additional notes or context (string, max 200 chars, or null)",
          "- confidence: 'high' if key fields clearly stated, 'medium' if partially inferred, 'low' if very unclear",
          "- reasoning: one sentence explaining what you extracted and any assumptions made",
          "Do not invent values not present in the transcript.",
          `Today is ${today}.`,
        ].join("\n");
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User said: "${transcript}"` },
        ];
        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: {
          activityType: string | null; duration: number | null; distance: number | null;
          distanceUnit: string | null; steps: number | null; calories: number | null;
          avgHR: number | null; maxHR: number | null; note: string | null;
          confidence: string; reasoning: string;
        };
        try { parsed = JSON.parse(raw); }
        catch { throw new Error("LLM returned invalid JSON: " + raw); }
        const toNum = (v: unknown): number | null => { const n = Number(v); return (v !== null && v !== undefined && v !== '' && !isNaN(n)) ? n : null; };
        const validTypes = ['running', 'walking', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'sports', 'other'];
        const filledCount = [
          parsed.activityType, parsed.duration, parsed.distance,
          parsed.steps, parsed.calories, parsed.avgHR, parsed.maxHR, parsed.note,
        ].filter(v => v !== null && v !== undefined && v !== '').length;
        return {
          activityType: validTypes.includes(parsed.activityType ?? '') ? parsed.activityType : null,
          duration: toNum(parsed.duration),
          distance: toNum(parsed.distance),
          distanceUnit: (parsed.distanceUnit === 'mi' ? 'mi' : 'km') as 'km' | 'mi',
          steps: toNum(parsed.steps),
          calories: toNum(parsed.calories),
          avgHR: toNum(parsed.avgHR),
          maxHR: toNum(parsed.maxHR),
          note: parsed.note ? String(parsed.note).slice(0, 200) : null,
          confidence: (['high', 'medium', 'low'].includes(parsed.confidence ?? '') ? parsed.confidence : 'low') as 'high' | 'medium' | 'low',
          reasoning: (parsed.reasoning ?? '').slice(0, 300),
          filledCount,
          totalFields: 8,
        };
      }),

  }),

  // ─── Generic note transcription ───────────────────────────────────────────────────────────────────
  notes: router({
    /**
     * Transcribe a voice recording to plain text (Whisper).
     * Used by Medication and Side Effect forms for voice-dictated notes.
     * Returns { text: string }.
     */
    transcribe: publicProcedure
      .input(
        z.object({
          audioBase64: z.string(),
          mimeType: z.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
          language: z.string().optional(),
          prompt: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = (input.mimeType === "audio/m4a" || input.mimeType === "audio/mp4") ? "m4a" : (input.mimeType.split("/")[1] ?? "m4a");
        const fileKey = `notes-voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
        const result = await transcribeAudio({
          audioUrl,
          language: input.language,
          prompt: input.prompt ?? "Medical note, medication name, side effect description, health observation.",
        });
        if ("error" in result) {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
        }
        return { text: (result.text ?? "").trim() };
      }),
  }),

  // ─── Smart Translation ───────────────────────────────────────────────────────────────────
  translation: router({
    /**
     * Translate a flat key→value string map to the target language using the LLM.
     * Returns { translations: Record<string, string> } with all original keys present.
     * Falls back to the English value for any key the LLM fails to translate.
     */
    translate: publicProcedure
      .input(
        z.object({
          /** BCP-47 language tag, e.g. "ar", "pt", "de", "hi", "sw" */
          targetLang: z.string().min(2).max(10),
          /** Human-readable language name for the prompt, e.g. "Arabic" */
          targetLangName: z.string().min(2).max(60),
          /** Flat key→value record of English strings to translate (max 300 keys per call) */
          strings: z.record(z.string(), z.string()).refine(
            (r) => Object.keys(r).length <= 300,
            { message: "Max 300 keys per translation batch" },
          ),
        }),
      )
      .mutation(async ({ input }) => {
        const { targetLang, targetLangName, strings } = input;
        const entries = Object.entries(strings);
        if (entries.length === 0) return { translations: {} as Record<string, string> };

        const messages: Message[] = [
          {
            role: "system",
            content:
              `You are a professional medical app translator. Translate the following JSON object of UI strings from English to ${targetLangName} (BCP-47: ${targetLang}).\n` +
              `Rules:\n` +
              `1. Return ONLY a valid JSON object with the SAME keys as the input.\n` +
              `2. Translate every value accurately and naturally for a clinical health app.\n` +
              `3. Preserve any placeholders like {name}, {value}, {unit}, %d, %s exactly as-is.\n` +
              `4. Keep medical terms precise (e.g. "systolic", "diastolic", "HbA1c", "DASH diet", "mmHg", "mg/dL").\n` +
              `5. Output ONLY the JSON object — no markdown, no explanations, no extra keys.`,
          },
          {
            role: "user",
            content: JSON.stringify(strings),
          },
        ];

        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const raw = String(response.choices[0].message.content);
        let parsed: Record<string, string>;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("Translation LLM returned invalid JSON: " + raw.slice(0, 200));
        }

        // Ensure every original key is present; fall back to English for any missing key
        const result: Record<string, string> = {};
        for (const [key, englishVal] of entries) {
          result[key] =
            typeof parsed[key] === "string" && parsed[key].length > 0
              ? parsed[key]
              : englishVal;
        }
        return { translations: result };
      }),
  }),  // end translation router
  // ─── Lab Tracker (OCR + Correlation) ─────────────────────────────────────────────────────────────────────────────────────
  lab: labRouter,
  medication: medicationRouter,
  // ─── Diet Report PDF Generation ─────────────────────────────────────────────────────────────────────────────────────
  diet: router({
    generateReport: publicProcedure
      .input(z.object({
        protocol:        z.string(),
        emoji:           z.string(),
        currentStreak:   z.number(),
        bestStreak:      z.number(),
        goalKcal:        z.number(),
        caloricAvg:      z.number(),
        fourWeekScores:  z.array(z.object({ label: z.string(), score: z.number().nullable() })),
        generatedAt:     z.string(), // ISO date string
      }))
      .mutation(async ({ input }) => {
        const {
          protocol, emoji, currentStreak, bestStreak,
          goalKcal, caloricAvg, fourWeekScores, generatedAt,
        } = input;

        const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });

        const weekRows = fourWeekScores
          .map((w) => `| ${w.label} | ${w.score !== null ? `${w.score}%` : '—'} |`)
          .join('\n');

        const vsGoal = caloricAvg > 0
          ? (caloricAvg > goalKcal ? `+${caloricAvg - goalKcal}` : `${caloricAvg - goalKcal}`) + ' kcal vs goal'
          : 'No caloric data recorded';

        const md = [
          `# ${emoji} VitalSync Diet Report`,
          `**Generated:** ${dateStr}`,
          '',
          '---',
          '',
          '## Protocol',
          `**${protocol}**`,
          '',
          '## Streak',
          `| Metric | Value |`,
          `|--------|-------|`,
          `| Current streak | ${currentStreak} day${currentStreak !== 1 ? 's' : ''} |`,
          `| All-time best  | ${bestStreak} day${bestStreak !== 1 ? 's' : ''} |`,
          '',
          '## Caloric Trend (7-Day)',
          `| Metric | Value |`,
          `|--------|-------|`,
          `| Daily goal | ${goalKcal} kcal |`,
          `| 7-day avg  | ${caloricAvg > 0 ? caloricAvg + ' kcal' : '—'} |`,
          `| vs. Goal   | ${vsGoal} |`,
          '',
          '## 4-Week Compliance History',
          '| Week of | Score |',
          '|---------|-------|',
          weekRows,
          '',
          '---',
          '',
          '*This report was generated by VitalSync Personal Health Hub.*',
        ].join('\n');

        const tmpDir  = os.tmpdir();
        const mdPath  = path.join(tmpDir, `diet-report-${Date.now()}.md`);
        const pdfPath = path.join(tmpDir, `diet-report-${Date.now()}.pdf`);

        fs.writeFileSync(mdPath, md, 'utf8');
        execSync(`manus-md-to-pdf ${mdPath} ${pdfPath}`);
        const pdfBytes = fs.readFileSync(pdfPath);

        // Clean up temp files
        try { fs.unlinkSync(mdPath); fs.unlinkSync(pdfPath); } catch { /* ignore */ }

        const key = `diet-reports/${Date.now()}-report.pdf`;
        const { url } = await storagePut(key, pdfBytes, 'application/pdf');
        return { url };
      }),
  }),

  // Streak share card image generation
  streakShareCard: publicProcedure
    .input(z.object({
      streakDays: z.number().int().min(1),
      alignmentScore: z.number().int().min(0).max(100),
      startDate: z.string(),  // e.g. "Mar 20"
      endDate: z.string(),    // e.g. "Mar 26, 2026"
    }))
    .mutation(async ({ input }) => {
      const { streakDays, alignmentScore, startDate, endDate } = input;
      const scoreLabel = alignmentScore >= 90 ? 'Excellent' : alignmentScore >= 75 ? 'Good' : alignmentScore >= 60 ? 'Fair' : 'Developing';
      const prompt = [
        `Create a premium health app achievement card with a dark navy (#050F19) background.`,
        `The card is portrait orientation (400x600px), with a subtle deep-space gradient.`,
        `At the top: a small glowing emerald VitalSync logo mark (abstract DNA helix or heartbeat line).`,
        `Below: the text "GOLD ZONE STREAK" in small neon cyan uppercase tracking-widest letters.`,
        `Center: a large bold "${streakDays}" in white with a golden glow, followed by "DAYS" in smaller gold text.`,
        `Below the number: a neon gold horizontal divider line.`,
        `Then: "${startDate} – ${endDate}" in muted cyan.`,
        `Then: "Alignment Score" label in small grey, and "${alignmentScore}/100" in large ${alignmentScore >= 75 ? 'emerald' : 'amber'} bold text with a glow.`,
        `Badge: "${scoreLabel}" in a rounded pill with ${alignmentScore >= 75 ? 'emerald' : 'amber'} neon border.`,
        `Bottom: small text "AMDR macro targets · 45-65% carbs · 15-25% protein · 20-35% fat" in dim grey.`,
        `Footer: "VitalSync Personal Health Hub" in small muted text with a subtle neon green dot.`,
        `Overall aesthetic: glassmorphism, neon glow accents, premium clinical dark theme. No people, no food images.`,
      ].join(' ');

      const { url: imageUrl } = await generateImage({ prompt });
      if (!imageUrl) throw new Error('Image generation returned no URL');

      // Fetch the generated image and re-upload to our own S3 for a stable URL
      const resp = await fetch(imageUrl);
      const buf = Buffer.from(await resp.arrayBuffer());
      const key = `streak-cards/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
      const { url } = await storagePut(key, buf, 'image/png');
      return { url };
    }),
  iap: iapRouter,
});
export type AppRouter = typeof appRouter;
