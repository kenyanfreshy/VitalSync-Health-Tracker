/**
 * Medication Smart Router
 * Provides two tRPC procedures:
 *   medication.getSideEffects  — Smart-generated side effects for a drug name
 *   medication.getInteractions — FDA openFDA + Smart drug interaction lookup
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchFdaInteractions(drugName: string): Promise<
  { drug: string; severity: string; description: string }[]
> {
  try {
    const encoded = encodeURIComponent(drugName.toLowerCase());
    const url = `https://api.fda.gov/drug/label.json?search=drug_interactions:${encoded}&limit=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json() as { results?: { drug_interactions?: string[] }[] };
    const results = json.results ?? [];
    const interactions: { drug: string; severity: string; description: string }[] = [];
    for (const r of results) {
      const raw = (r.drug_interactions ?? []).join(" ");
      // Extract drug names mentioned alongside severity keywords
      const majorMatch = raw.match(/(?:contraindicated|avoid|do not use)\s+with\s+([A-Za-z\s,]+)/gi);
      const moderateMatch = raw.match(/(?:caution|monitor|reduce dose)\s+with\s+([A-Za-z\s,]+)/gi);
      if (majorMatch) {
        for (const m of majorMatch.slice(0, 2)) {
          interactions.push({
            drug: m.replace(/^.*with\s+/i, "").split(/[,;]/)[0].trim().slice(0, 60),
            severity: "major",
            description: m.slice(0, 120),
          });
        }
      }
      if (moderateMatch) {
        for (const m of moderateMatch.slice(0, 2)) {
          interactions.push({
            drug: m.replace(/^.*with\s+/i, "").split(/[,;]/)[0].trim().slice(0, 60),
            severity: "moderate",
            description: m.slice(0, 120),
          });
        }
      }
    }
    return interactions.slice(0, 5);
  } catch {
    return [];
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

// ─── Route emoji map ────────────────────────────────────────────────────────
const ROUTE_EMOJI: Record<string, string> = {
  oral: '💊',
  sublingual: '🔵',
  subq: '💉',
  subcutaneous: '💉',
  im: '🩺',
  intramuscular: '🩺',
  iv: '🩸',
  intravenous: '🩸',
  inhaled: '🌬️',
  inhalation: '🌬️',
  topical: '🩹',
  transdermal: '🩹',
  ophthalmic: '👁️',
  otic: '👂',
  nasal: '👃',
  rectal: '🍑',
  vaginal: '🔴',
};

function routeEmoji(route: string): string {
  const key = route.toLowerCase().trim();
  return ROUTE_EMOJI[key] ?? '💊';
}

export const medicationRouter = router({
  /**
   * Drug name autocomplete + auto-populate.
   * Triggered after 3+ characters. Returns up to 8 drug suggestions,
   * each with: name, genericName, indication, safeDosage, routes (with emoji).
   */
  searchDrugs: publicProcedure
    .input(z.object({ query: z.string().min(3).max(80) }))
    .mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical pharmacist database. Given a partial drug name query, return matching medications.",
        "Return a JSON object with exactly this shape:",
        '{ "drugs": [ { "name": "string (brand name)", "genericName": "string", "indication": "string (primary condition treated, max 60 chars)", "safeDosage": "string (typical adult dose range, max 80 chars)", "routes": ["string"] } ] }',
        "Return up to 8 drugs that match or start with the query.",
        "routes must be one or more of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal.",
        "If the query does not match any real drug, return { \"drugs\": [] }.",
        "Return ONLY valid JSON, no markdown.",
      ].join("\n");

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Find drugs matching: ${input.query}` },
      ];

      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0].message.content ?? "{}");
      let parsed: {
        drugs: {
          name: string;
          genericName?: string;
          indication?: string;
          safeDosage?: string;
          routes?: string[];
        }[];
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { drugs: [] };
      }

      return {
        drugs: (parsed.drugs ?? []).slice(0, 8).map((d) => ({
          name: (d.name ?? "").slice(0, 100),
          genericName: (d.genericName ?? "").slice(0, 100),
          indication: (d.indication ?? "").slice(0, 80),
          safeDosage: (d.safeDosage ?? "").slice(0, 100),
          routes: (d.routes ?? ["oral"]).map((r) => ({
            label: r,
            emoji: routeEmoji(r),
          })),
        })),
      };
    }),

  /**
   * Returns Smart-generated side effects for a given medication name.
   * Groups by frequency: common | uncommon | rare.
   */
  getSideEffects: publicProcedure
    .input(z.object({ medicationName: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical pharmacist. The user wants to know the side effects of a medication.",
        "Return a JSON object with exactly this shape:",
        '{ "sideEffects": [ { "name": "string", "frequency": "common"|"uncommon"|"rare", "description": "string (max 80 chars)" } ] }',
        "Include 3-5 common, 2-3 uncommon, and 1-2 rare side effects.",
        "Use plain, patient-friendly language. Do not include marketing language.",
        "Always include the disclaimer field:",
        '{ "disclaimer": "This information is Smart-generated and for educational purposes only. Always follow your physician and pharmacist instructions." }',
        "Return ONLY valid JSON, no markdown.",
      ].join("\n");

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `What are the side effects of ${input.medicationName}?`,
        },
      ];

      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0].message.content ?? "{}");
      let parsed: {
        sideEffects: { name: string; frequency: string; description?: string }[];
        disclaimer?: string;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON");
      }

      return {
        sideEffects: (parsed.sideEffects ?? []).map((s) => ({
          name: (s.name ?? "").slice(0, 80),
          frequency: (["common", "uncommon", "rare"].includes(s.frequency)
            ? s.frequency
            : "uncommon") as "common" | "uncommon" | "rare",
          description: (s.description ?? "").slice(0, 120),
        })),
        disclaimer:
          parsed.disclaimer ??
          "This information is Smart-generated and for educational purposes only. Always follow your physician and pharmacist instructions.",
      };
    }),

  /**
   * Returns drug interactions for a list of active medications.
   * Combines FDA openFDA label data with Smart-generated interactions.
   */
  getInteractions: publicProcedure
    .input(
      z.object({
        medications: z.array(
          z.object({ id: z.string(), name: z.string().min(1).max(120) }),
        ).min(1).max(20),
      }),
    )
    .mutation(async ({ input }) => {
      const names = input.medications.map((m) => m.name);

      // 1. FDA lookup for each drug
      const fdaResults: { drug: string; severity: string; description: string; source: "fda" }[] = [];
      for (const name of names) {
        const hits = await fetchFdaInteractions(name);
        for (const h of hits) {
          fdaResults.push({ ...h, source: "fda" });
        }
      }

      // 2. Smart pairwise interaction check
      const systemPrompt = [
        "You are a clinical pharmacist checking for drug-drug interactions.",
        "The patient is taking the following medications: " + names.join(", ") + ".",
        "Return a JSON object with exactly this shape:",
        '{ "interactions": [ { "drug1": "string", "drug2": "string", "severity": "major"|"moderate"|"minor", "description": "string (max 120 chars)", "source": "ai" } ] }',
        "Only include clinically significant interactions (major or moderate).",
        "If there are no significant interactions, return { \"interactions\": [] }.",
        "Return ONLY valid JSON, no markdown.",
      ].join("\n");

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Check for drug interactions between: ${names.join(", ")}`,
        },
      ];

      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0].message.content ?? "{}");
      let aiParsed: {
        interactions: {
          drug1: string;
          drug2: string;
          severity: string;
          description: string;
          source: string;
        }[];
      };
      try {
        aiParsed = JSON.parse(raw);
      } catch {
        aiParsed = { interactions: [] };
      }

      const aiInteractions = (aiParsed.interactions ?? []).map((i) => ({
        drug: `${i.drug1} + ${i.drug2}`.slice(0, 80),
        severity: (["major", "moderate", "minor"].includes(i.severity)
          ? i.severity
          : "moderate") as "major" | "moderate" | "minor",
        description: (i.description ?? "").slice(0, 120),
        source: "ai" as const,
      }));

      return {
        interactions: [
          ...fdaResults.map((f) => ({
            drug: f.drug,
            severity: (["major", "moderate", "minor"].includes(f.severity)
              ? f.severity
              : "moderate") as "major" | "moderate" | "minor",
            description: f.description,
            source: "fda" as const,
          })),
          ...aiInteractions,
        ],
        disclaimer:
          "Drug interaction data is sourced from the FDA label database and Smart analysis. Always consult your physician or pharmacist before making any medication changes.",
      };
    }),

  /**
   * Transcribes a voice recording of a medication description and extracts all form fields.
   * Uses Apple Speech / Whisper transcription, then LLM parsing.
   * Returns same shape as scribePhoto (name, dose, form, frequency, etc.) plus { transcript }.
   */
  scribeVoice: publicProcedure
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
      const fileKey = `medication-voice/${Date.now()}-${suffix}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);

      // 2. Transcribe with Whisper
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Medication name, dose, frequency, form, prescriber, pharmacy, indication",
      });
      if ('error' in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;

      // 3. Parse with LLM
      const systemPrompt = [
        "You are a clinical pharmacist Smart assistant. A patient has verbally described a medication they take.",
        "Extract every medication detail from their statement. Return a JSON object with EXACTLY these fields (use null for any field not mentioned):",
        "- name: brand or trade name of the medication (string or null)",
        "- genericName: generic/INN drug name if mentioned (string or null)",
        "- dose: dosage strength with units, e.g. '10 mg', '500 mg' (string or null)",
        "- form: one of: tablet, capsule, liquid, injection, patch, inhaler, drops, other (string or null)",
        "- frequency: one of: daily, twice_daily, three_times_daily, four_times_daily, weekly, as_needed, custom. Infer from phrases like 'once a day'=daily, 'twice a day'=twice_daily. (string or null)",
        "- scheduleTimes: array of HH:MM strings inferred from dosing instructions, e.g. ['08:00','20:00'] (array or null)",
        "- route: one of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal (string or null)",
        "- indication: condition this medication treats (string or null)",
        "- prescriber: prescribing physician name if mentioned (string or null)",
        "- pharmacyName: pharmacy name if mentioned (string or null)",
        "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
        "- quantity: number of pills/doses if mentioned (integer or null)",
        "- refillAt: refill threshold (integer, default 7 if quantity is known, else null)",
        "- notes: any additional instructions or notes mentioned (string or null)",
        "- confidence: overall extraction confidence from 0.0 to 1.0 (number)",
        "- fieldsFound: array of field names that were successfully extracted (array of strings)",
        "Return ONLY valid JSON, no markdown.",
      ].join("\n");

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` },
      ];

      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0].message.content ?? "{}");
      let parsed: {
        name?: string | null;
        genericName?: string | null;
        dose?: string | null;
        form?: string | null;
        frequency?: string | null;
        scheduleTimes?: string[] | null;
        route?: string | null;
        indication?: string | null;
        prescriber?: string | null;
        pharmacyName?: string | null;
        pharmacyPhone?: string | null;
        quantity?: number | null;
        refillAt?: number | null;
        notes?: string | null;
        confidence?: number;
        fieldsFound?: string[];
      };
      try { parsed = JSON.parse(raw); }
      catch { parsed = { confidence: 0, fieldsFound: [] }; }

      const VALID_FORMS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "drops", "other"];
      const VALID_FREQS = ["daily", "twice_daily", "three_times_daily", "four_times_daily", "weekly", "as_needed", "custom"];
      const VALID_ROUTES = ["oral", "sublingual", "subq", "im", "iv", "inhaled", "topical", "ophthalmic", "otic", "nasal", "rectal", "transdermal"];

      return {
        transcript,
        name: parsed.name ?? null,
        genericName: parsed.genericName ?? null,
        dose: parsed.dose ?? null,
        form: (VALID_FORMS.includes(parsed.form ?? "") ? parsed.form : null) as string | null,
        frequency: (VALID_FREQS.includes(parsed.frequency ?? "") ? parsed.frequency : null) as string | null,
        scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes.slice(0, 6) : null,
        route: (VALID_ROUTES.includes(parsed.route ?? "") ? parsed.route : null) as string | null,
        indication: parsed.indication ?? null,
        prescriber: parsed.prescriber ?? null,
        pharmacyName: parsed.pharmacyName ?? null,
        pharmacyPhone: parsed.pharmacyPhone ?? null,
        quantity: typeof parsed.quantity === "number" ? Math.round(parsed.quantity) : null,
        refillAt: typeof parsed.refillAt === "number" ? Math.round(parsed.refillAt) : null,
        notes: parsed.notes ?? null,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        fieldsFound: Array.isArray(parsed.fieldsFound) ? parsed.fieldsFound : [],
        disclaimer: "Smart Scribe-extracted medication data requires verification. Always confirm with your prescription label and pharmacist before saving.",
      };
    }),

  scribePhoto: publicProcedure
    .input(z.object({
      imageBase64: z.string(),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      // 1. Upload image to S3 so LLM can access a public URL
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `medication-scribe/${Date.now()}-${suffix}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);

      // 2. Vision model extracts medication fields
      const systemPrompt = [
        "You are a clinical pharmacist Smart assistant. Analyse the provided image of a pill bottle, medication box, or prescription label.",
        "Extract every medication detail visible. Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
        "- name: brand or trade name of the medication (string or null). Examples: 'Lisinopril', 'Metformin', 'Atorvastatin'",
        "- genericName: generic/INN drug name if different from brand (string or null)",
        "- dose: dosage strength with units, e.g. '10 mg', '500 mg/5 mL'. Parse from patterns like 'Lisinopril 10 MG tablet' (string or null)",
        "- form: one of: tablet, capsule, liquid, injection, patch, inhaler, drops, other. Parse from 'tablet', 'capsule', 'solution' etc. (string or null)",
        "- frequency: one of: daily, twice_daily, three_times_daily, four_times_daily, weekly, as_needed, custom. Parse from 'Take 1 tablet by mouth daily', 'Take one tablet twice daily', 'Take at bedtime', 'Use as directed' (string or null)",
        "- scheduleTimes: array of HH:MM strings inferred from dosing instructions, e.g. ['08:00','20:00']. 'Take at bedtime' → ['21:00'], 'twice daily' → ['08:00','20:00'] (array or null)",
        "- route: one of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal. Parse from 'by mouth', 'oral', 'topical' etc. (string or null)",
        "- indication: condition this medication treats (string or null)",
        "- prescriber: prescribing physician name if visible, e.g. 'Dr. Smith' → 'Smith' (string or null)",
        "- pharmacyName: pharmacy name if visible, e.g. 'CVS Pharmacy', 'Walgreens' (string or null)",
        "- pharmacyPhone: pharmacy phone number if visible (string or null)",
        "- quantity: number of pills/doses. Parse from patterns like 'Qty 30', 'Qty: 90' (integer or null)",
        "- refillAt: refill threshold (integer, default 7 if quantity is known, else null)",
        "- rxNumber: prescription Rx number. Parse from patterns like 'Rx #1234567', 'Rx: 1234567', 'RX1234567' — return digits only (string or null)",
        "- startDate: fill date or start date in YYYY-MM-DD format if visible on label (string or null)",
        "- refillsRemaining: number of refills remaining. Parse from 'Refills 2', 'Refills: 0', 'No refills' → 0 (integer or null)",
        "- notes: any other instructions visible on the label, e.g. 'Take with food', 'Avoid grapefruit' (string or null)",
        "- confidence: overall extraction confidence from 0.0 to 1.0 (number)",
        "- fieldsFound: array of field names that were successfully extracted (array of strings)",
        "Return ONLY valid JSON, no markdown.",
      ].join("\n");

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all medication details from this image." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ];

      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0].message.content ?? "{}");
      let parsed: {
        name?: string | null;
        genericName?: string | null;
        dose?: string | null;
        form?: string | null;
        frequency?: string | null;
        scheduleTimes?: string[] | null;
        route?: string | null;
        indication?: string | null;
        prescriber?: string | null;
        pharmacyName?: string | null;
        pharmacyPhone?: string | null;
        quantity?: number | null;
        refillAt?: number | null;
        rxNumber?: string | null;
        startDate?: string | null;
        refillsRemaining?: number | null;
        notes?: string | null;
        confidence?: number;
        fieldsFound?: string[];
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { confidence: 0, fieldsFound: [] };
      }

      const VALID_FORMS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "drops", "other"];
      const VALID_FREQS = ["daily", "twice_daily", "three_times_daily", "four_times_daily", "weekly", "as_needed", "custom"];
      const VALID_ROUTES = ["oral", "sublingual", "subq", "im", "iv", "inhaled", "topical", "ophthalmic", "otic", "nasal", "rectal", "transdermal"];

      return {
        name: parsed.name ?? null,
        genericName: parsed.genericName ?? null,
        dose: parsed.dose ?? null,
        form: (VALID_FORMS.includes(parsed.form ?? "") ? parsed.form : null) as string | null,
        frequency: (VALID_FREQS.includes(parsed.frequency ?? "") ? parsed.frequency : null) as string | null,
        scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes.slice(0, 6) : null,
        route: (VALID_ROUTES.includes(parsed.route ?? "") ? parsed.route : null) as string | null,
        indication: parsed.indication ?? null,
        prescriber: parsed.prescriber ?? null,
        pharmacyName: parsed.pharmacyName ?? null,
        pharmacyPhone: parsed.pharmacyPhone ?? null,
        quantity: typeof parsed.quantity === "number" ? Math.round(parsed.quantity) : null,
        refillAt: typeof parsed.refillAt === "number" ? Math.round(parsed.refillAt) : null,
        rxNumber: parsed.rxNumber ? String(parsed.rxNumber).replace(/\D/g, "") || null : null,
        startDate: parsed.startDate ?? null,
        refillsRemaining: typeof parsed.refillsRemaining === "number" ? Math.round(parsed.refillsRemaining) : null,
        notes: parsed.notes ?? null,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        fieldsFound: Array.isArray(parsed.fieldsFound) ? parsed.fieldsFound : [],
        disclaimer: "Smart Scribe-extracted medication data requires verification. Always confirm with your prescription label and pharmacist before saving.",
      };
    }),

  /**
   * Parses a text transcript of a spoken medication description.
   * Used by Apple Speech mode (on-device transcription) — no audio upload needed.
   * Returns same shape as scribeVoice/scribePhoto.
   */
  scribeTranscript: publicProcedure
    .input(z.object({ transcript: z.string() }))
    .mutation(async ({ input }) => {
      const { transcript } = input;
      const systemPrompt = [
        "You are a clinical pharmacist Smart assistant. A patient has verbally described or read aloud a prescription label.",
        "Extract every medication detail from their statement. Return a JSON object with EXACTLY these fields (use null for any field not mentioned):",
        "- name: brand or trade name of the medication (string or null). Examples: 'Lisinopril', 'Metformin', 'Atorvastatin'",
        "- genericName: generic/INN drug name if different from brand (string or null)",
        "- dose: dosage strength with units, e.g. '10 mg', '500 mg', '20 MG' (string or null). Extract from patterns like 'Lisinopril 10 MG tablet'.",
        "- form: one of: tablet, capsule, liquid, injection, patch, inhaler, drops, other (string or null). Infer from 'tablet', 'capsule', 'liquid', 'patch', 'inhaler'.",
        "- frequency: one of: daily, twice_daily, three_times_daily, four_times_daily, weekly, as_needed, custom. Infer from: 'once daily'=daily, 'twice daily'=twice_daily, 'twice a day'=twice_daily, 'three times daily'=three_times_daily, 'four times daily'=four_times_daily, 'weekly'=weekly, 'as needed'/'PRN'=as_needed, 'at bedtime'=custom, 'use as directed'=custom. (string or null)",
        "- scheduleTimes: array of HH:MM strings inferred from dosing instructions. 'at bedtime'=['21:00'], 'in the morning'=['08:00'], 'twice daily'=['08:00','20:00'], 'three times daily'=['08:00','14:00','20:00']. (array or null)",
        "- route: one of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal. Infer from: 'by mouth'/'orally'/'swallow'=oral, 'under the tongue'=sublingual, 'inject'/'injection'=subq, 'inhale'=inhaled, 'apply'/'cream'/'gel'=topical, 'eye drops'=ophthalmic, 'ear drops'=otic, 'nasal spray'=nasal. (string or null)",
        "- indication: condition this medication treats (string or null)",
        "- prescriber: prescribing physician name if mentioned, e.g. 'Dr. Smith' → 'Smith' (string or null)",
        "- pharmacyName: pharmacy name if mentioned, e.g. 'CVS Pharmacy', 'Walgreens' (string or null)",
        "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
        "- quantity: number of pills/doses if mentioned. Extract from 'Qty 30', 'quantity 90', '#30' patterns. (integer or null)",
        "- refillsRemaining: number of refills remaining. Extract from 'Refills 2', 'Refills remaining: 1', 'No refills'. (integer or null)",
        "- rxNumber: prescription number. Extract from 'Rx #1234567', 'RX: 1234567', 'Prescription number 1234567'. (string or null)",
        "- startDate: start date or fill date in YYYY-MM-DD format. Extract from 'filled on', 'fill date', 'start date', 'dispensed'. (string or null)",
        "- refillAt: refill threshold (integer, default 7 if quantity is known, else null)",
        "- notes: any additional instructions. Include 'Use as directed', 'Take at bedtime', 'Take with food', 'Avoid alcohol', or any other label instructions. (string or null)",
        "- confidence: overall extraction confidence from 0.0 to 1.0 (number)",
        "- fieldsFound: array of field names that were successfully extracted (array of strings)",
        "Prescription label examples to handle:",
        "  'Lisinopril 10 MG tablet' → name=Lisinopril, dose=10 mg, form=tablet",
        "  'Take 1 tablet by mouth daily' → route=oral, frequency=daily, form=tablet",
        "  'Qty 30' → quantity=30",
        "  'Refills 2' → refillsRemaining=2",
        "  'Rx #1234567' → rxNumber=1234567",
        "  'Dr. Smith' → prescriber=Smith",
        "  'CVS Pharmacy' → pharmacyName=CVS Pharmacy",
        "  'Take one tablet twice daily' → frequency=twice_daily, form=tablet",
        "  'Take at bedtime' → frequency=custom, scheduleTimes=['21:00']",
        "  'Use as directed' → notes=Use as directed, frequency=custom",
        "Return ONLY valid JSON, no markdown.",
      ].join("\n");
      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` },
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content ?? "{}");
      let parsed: {
        name?: string | null; genericName?: string | null; dose?: string | null; form?: string | null;
        frequency?: string | null; scheduleTimes?: string[] | null; route?: string | null;
        indication?: string | null; prescriber?: string | null; pharmacyName?: string | null;
        pharmacyPhone?: string | null; quantity?: number | null; refillsRemaining?: number | null;
        rxNumber?: string | null; startDate?: string | null; refillAt?: number | null;
        notes?: string | null; confidence?: number; fieldsFound?: string[];
      };
      try { parsed = JSON.parse(raw); }
      catch { parsed = { confidence: 0, fieldsFound: [] }; }
      const VALID_FORMS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "drops", "other"];
      const VALID_FREQS = ["daily", "twice_daily", "three_times_daily", "four_times_daily", "weekly", "as_needed", "custom"];
      const VALID_ROUTES = ["oral", "sublingual", "subq", "im", "iv", "inhaled", "topical", "ophthalmic", "otic", "nasal", "rectal", "transdermal"];
      return {
        transcript,
        name: parsed.name ?? null,
        genericName: parsed.genericName ?? null,
        dose: parsed.dose ?? null,
        form: (VALID_FORMS.includes(parsed.form ?? "") ? parsed.form : null) as string | null,
        frequency: (VALID_FREQS.includes(parsed.frequency ?? "") ? parsed.frequency : null) as string | null,
        scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes.slice(0, 6) : null,
        route: (VALID_ROUTES.includes(parsed.route ?? "") ? parsed.route : null) as string | null,
        indication: parsed.indication ?? null,
        prescriber: parsed.prescriber ? String(parsed.prescriber).replace(/^Dr\.?\s*/i, '').slice(0, 80) : null,
        pharmacyName: parsed.pharmacyName ? String(parsed.pharmacyName).slice(0, 100) : null,
        pharmacyPhone: parsed.pharmacyPhone ?? null,
        quantity: typeof parsed.quantity === "number" ? Math.round(parsed.quantity) : null,
        refillsRemaining: typeof parsed.refillsRemaining === "number" ? Math.round(parsed.refillsRemaining) : null,
        rxNumber: parsed.rxNumber ? String(parsed.rxNumber).slice(0, 40) : null,
        startDate: parsed.startDate ? String(parsed.startDate).slice(0, 10) : null,
        refillAt: typeof parsed.refillAt === "number" ? Math.round(parsed.refillAt) : null,
        notes: parsed.notes ?? null,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        fieldsFound: Array.isArray(parsed.fieldsFound) ? parsed.fieldsFound : [],
        disclaimer: "Smart Scribe-extracted medication data requires verification. Always confirm with your prescription label and pharmacist before saving.",
      };
    }),
});
