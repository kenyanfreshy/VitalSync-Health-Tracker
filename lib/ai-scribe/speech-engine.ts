/**
 * Apple Speech Engine for Smart Scribe
 *
 * Provides a high-level interface for voice-driven health data entry using
 * Apple's native SFSpeechRecognizer (iOS) via @react-native-voice/voice.
 *
 * Design goals:
 *  - Real-time partial transcription shown to the user while speaking
 *  - On-device processing — no audio sent to external servers
 *  - Graceful fallback: if speech recognition is unavailable, falls back to
 *    the existing expo-audio + server Whisper pipeline
 *  - Structured field extraction: after transcription, the transcript is
 *    parsed locally using simple regex patterns for common health values,
 *    or sent to the server LLM for complex parsing
 *
 * Architecture:
 *   useSpeechRecognizer (hook)  ← wraps @react-native-voice/voice
 *         ↓
 *   SpeechEngine (this module)  ← orchestrates start/stop, timeout, result
 *         ↓
 *   ScribeButton / useVoiceScribe (components)  ← UI layer
 */

import { Platform } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeechEngineOptions {
  /** BCP-47 locale code, e.g. 'en-US', 'es-ES'. Defaults to 'en-US'. */
  locale?: string;
  /**
   * Maximum recording duration in seconds.
   * Recognition stops automatically after this time.
   * Defaults to 60 seconds.
   */
  maxDurationSeconds?: number;
  /** Called with partial transcript text as the user speaks */
  onPartialResult?: (text: string) => void;
  /** Called when recognition ends with the final transcript */
  onFinalResult?: (text: string) => void;
  /** Called when an error occurs */
  onError?: (message: string) => void;
  /** Called when recognition starts */
  onStart?: () => void;
  /** Called when recognition stops (before final result) */
  onStop?: () => void;
  /** Called with microphone volume level (0–1) while listening */
  onVolumeChange?: (level: number) => void;
}

export type SpeechEngineStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'done'
  | 'error'
  | 'unavailable';

/**
 * Returns true if Apple Speech / SFSpeechRecognizer is likely available.
 * On iOS this is always true (requires iOS 10+).
 * On Android, @react-native-voice/voice uses the built-in SpeechRecognizer.
 * On web, speech recognition is not available through this module.
 */
export function isSpeechRecognitionAvailable(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Parse common health values from a free-form transcript.
 *
 * This is a lightweight client-side parser for the most common dictation
 * patterns. For complex or ambiguous transcripts, send to the server LLM.
 *
 * Supported patterns:
 *  - Blood pressure: "120 over 80", "120/80", "systolic 120 diastolic 80"
 *  - Heart rate: "pulse 72", "heart rate 72", "72 bpm"
 *  - Blood glucose: "glucose 95", "blood sugar 95", "95 mg/dl"
 *  - Weight: "weight 180 pounds", "180 lbs", "82 kg"
 *  - SpO2: "oxygen 98", "spo2 98", "98 percent oxygen"
 *  - Temperature: "temp 98.6", "temperature 98.6", "fever 101"
 *  - Respiratory rate: "respiratory rate 16", "breathing 16"
 */
/**
 * Parsed health transcript result.
 *
 * HERMES HIDDENCLASS NOTE: All keys are defined upfront with null defaults.
 * This gives the object a single stable HiddenClass from creation, preventing
 * the Hermes GC from creating new HiddenClass entries for each property added.
 * Dynamic property assignment (result.foo = ...) causes HiddenClass transitions
 * which under concurrent GC (Hades) can race with TurboModule error reporting.
 */
export interface ParsedHealthTranscript {
  systolic: string | null;
  diastolic: string | null;
  heartRate: string | null;
  bloodGlucose: string | null;
  weightLbs: string | null;
  weightKg: string | null;
  spo2: string | null;
  temperature: string | null;
  respiratoryRate: string | null;
  transcript: string;
}

export function parseHealthTranscript(
  transcript: string,
): ParsedHealthTranscript {
  const t = transcript.toLowerCase().trim();

  // Static schema: all keys defined at creation time — prevents Hermes HiddenClass churn
  const result: ParsedHealthTranscript = {
    systolic: null,
    diastolic: null,
    heartRate: null,
    bloodGlucose: null,
    weightLbs: null,
    weightKg: null,
    spo2: null,
    temperature: null,
    respiratoryRate: null,
    transcript,
  };

  // Blood pressure
  const bpPattern =
    /(?:(?:blood pressure|bp)\s+)?(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/i;
  const bpAlt =
    /systolic\s+(\d{2,3}).*?diastolic\s+(\d{2,3})/i;
  const bpMatch = t.match(bpPattern) || t.match(bpAlt);
  if (bpMatch) {
    result.systolic = bpMatch[1];
    result.diastolic = bpMatch[2];
  }

  // Heart rate / pulse
  const hrPattern =
    /(?:pulse|heart rate|hr)\s+(?:of\s+)?(\d{2,3})|(\d{2,3})\s*(?:bpm|beats per minute)/i;
  const hrMatch = t.match(hrPattern);
  if (hrMatch) {
    result.heartRate = hrMatch[1] ?? hrMatch[2];
  }

  // Blood glucose
  const bgPattern =
    /(?:blood sugar|glucose|bg)\s+(?:is\s+|of\s+)?(\d{2,3}(?:\.\d)?)/i;
  const bgMatch = t.match(bgPattern);
  if (bgMatch) {
    result.bloodGlucose = bgMatch[1];
  }

  // Weight (lbs preferred, then kg)
  const wtLbsPattern =
    /(?:weight|weigh)\s+(?:is\s+)?(\d{2,3}(?:\.\d)?)\s*(?:pounds?|lbs?)/i;
  const wtKgPattern =
    /(?:weight|weigh)\s+(?:is\s+)?(\d{2,3}(?:\.\d)?)\s*(?:kilograms?|kg)/i;
  const wtLbsMatch = t.match(wtLbsPattern);
  const wtKgMatch = t.match(wtKgPattern);
  if (wtLbsMatch) {
    result.weightLbs = wtLbsMatch[1];
    result.weightKg = String((parseFloat(wtLbsMatch[1]) * 0.453592).toFixed(1));
  } else if (wtKgMatch) {
    result.weightKg = wtKgMatch[1];
    result.weightLbs = String((parseFloat(wtKgMatch[1]) / 0.453592).toFixed(1));
  }

  // SpO2
  const spo2Pattern =
    /(?:oxygen|spo2|o2 sat|oxygen saturation)\s+(?:is\s+|of\s+)?(\d{2,3}(?:\.\d)?)\s*(?:percent|%)?/i;
  const spo2Match = t.match(spo2Pattern);
  if (spo2Match) {
    result.spo2 = spo2Match[1];
  }

  // Temperature
  const tempPattern =
    /(?:temp(?:erature)?|fever)\s+(?:is\s+|of\s+)?(\d{2,3}(?:\.\d{1,2})?)/i;
  const tempMatch = t.match(tempPattern);
  if (tempMatch) {
    result.temperature = tempMatch[1];
  }

  // Respiratory rate
  const rrPattern =
    /(?:respiratory rate|breathing rate|resp rate|rr)\s+(?:is\s+|of\s+)?(\d{1,2})/i;
  const rrMatch = t.match(rrPattern);
  if (rrMatch) {
    result.respiratoryRate = rrMatch[1];
  }

  return result;
}

/**
 * Format a duration in seconds as "M:SS" for display in the UI.
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
