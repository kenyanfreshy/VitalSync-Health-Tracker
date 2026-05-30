import { requireNativeModule, EventEmitter } from "expo-modules-core";
import { Platform } from "react-native";

// ── Native module — iOS only ───────────────────────────────────────────────
const AppleSpeechNative = (() => {
  if (Platform.OS !== "ios") return null;
  try {
    return requireNativeModule("AppleSpeechModule");
  } catch {
    return null;
  }
})();

// ── Public types ──────────────────────────────────────────────────────────

export type PermissionsResult = {
  speech: boolean;
  microphone: boolean;
};

export type TranscriptEvent = { transcript: string };
export type StatusEvent = { status: "listening" | "done" | "error" };
export type ErrorEvent = { message: string };
/** Fired by the native module after requestPermissions() resolves. */
export type PermissionStatusEvent = { speech: boolean; microphone: boolean };

// ── Module + emitter exports ──────────────────────────────────────────────

export const AppleSpeechModule = AppleSpeechNative;

export const AppleSpeechEmitter: any | null = AppleSpeechNative
  ? new EventEmitter(AppleSpeechNative)
  : null;

// ── API functions ─────────────────────────────────────────────────────────

/**
 * Request both speech recognition and microphone permissions.
 * Also fires an `onPermissionStatus` event so any active listener
 * (e.g. the Speech & Scribe settings section) can react immediately.
 */
export async function requestPermissions(): Promise<PermissionsResult> {
  if (!AppleSpeechNative) return { speech: false, microphone: false };
  return AppleSpeechNative.requestPermissions();
}

/**
 * Read the current permission status without prompting the user.
 * Returns `{ speech: false, microphone: false }` on non-iOS platforms.
 *
 * NOTE: This is a TypeScript-layer helper — it calls requestPermissions()
 * which on iOS will only prompt if the status is .notDetermined.
 * If already .authorized or .denied, iOS returns immediately without a dialog.
 */
export async function checkPermissions(): Promise<PermissionsResult> {
  if (!AppleSpeechNative) return { speech: false, microphone: false };
  // requestPermissions() is idempotent when permissions are already decided
  return AppleSpeechNative.requestPermissions();
}

/**
 * Start live speech recognition using SFSpeechRecognizer + AVAudioEngine.
 * Partial results are streamed via `onPartialResult` events.
 * The final transcript arrives via `onFinalResult` when the recognizer
 * detects end-of-speech or stopListening() is called.
 */
export async function startListening(localeId = ""): Promise<void> {
  if (!AppleSpeechNative) return;
  return AppleSpeechNative.startListening(localeId);
}

/**
 * Stop live speech recognition and flush the final buffer.
 * The native module calls endAudio() before cancel() to ensure
 * the recognizer processes any remaining audio before teardown.
 */
export async function stopListening(): Promise<void> {
  if (!AppleSpeechNative) return;
  return AppleSpeechNative.stopListening();
}
