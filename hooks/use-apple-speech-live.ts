/**
 * useAppleSpeechLive
 *
 * TypeScript wrapper for the AppleSpeechModule local Expo native module.
 * Provides live speech-to-text using SFSpeechRecognizer + AVAudioEngine.
 *
 * Behaviour:
 *  - First tap: request permissions → start listening → stream partial transcript
 *  - Second tap: stop listening → final transcript stays in state
 *  - Errors are caught and surfaced via `error` state (never crash)
 *  - Safe cleanup on unmount
 *
 * Usage:
 * ```ts
 * const {
 *   isListening, partialTranscript, finalTranscript, error,
 *   toggle, startListening, stopListening, cancelListening,
 * } = useAppleSpeechLive({
 *   onFinalTranscript: (text) => setNoteText(text),
 * });
 * ```
 *
 * NOTE: This hook is iOS-only. On web/Android it returns no-op functions
 * and `isAvailable = false`. Callers should fall back to keyboard dictation.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  AppleSpeechModule as NativeAppleSpeech,
  AppleSpeechEmitter,
  type PermissionsResult,
  type PermissionStatusEvent,
} from 'apple-speech';
import type { EventSubscription } from 'expo-modules-core';

// ── Event names (must match the Swift module definition) ──────────────────
const EVENT_PARTIAL     = 'onPartialResult';
const EVENT_FINAL       = 'onFinalResult';
const EVENT_STATUS      = 'onStatus';
const EVENT_ERROR       = 'onError';
const EVENT_PERM_STATUS = 'onPermissionStatus';

// ── Public types ───────────────────────────────────────────────────────────
export type AppleSpeechStatus = 'idle' | 'requesting' | 'listening' | 'processing' | 'done' | 'error';

export interface UseAppleSpeechLiveOptions {
  /** Called with the final transcript when the user stops speaking. */
  onFinalTranscript?: (text: string) => void;
  /** Called on each partial result while the user is speaking. */
  onPartialTranscript?: (text: string) => void;
  /** Called on error. */
  onError?: (message: string) => void;
  /** BCP-47 locale. Defaults to device locale. */
  locale?: string;
}

export interface UseAppleSpeechLiveResult {
  isAvailable: boolean;
  status: AppleSpeechStatus;
  isListening: boolean;
  partialTranscript: string;
  finalTranscript: string;
  /** Last known permission state — updated after requestPermissions() or via onPermissionStatus event */
  permissions: PermissionsResult | null;
  error: string | null;
  toggle: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<string>;
  cancelListening: () => Promise<void>;
  reset: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useAppleSpeechLive(
  options: UseAppleSpeechLiveOptions = {},
): UseAppleSpeechLiveResult {
  const { onFinalTranscript, onPartialTranscript, onError, locale = '' } = options;

  const isAvailable = Platform.OS === 'ios' && NativeAppleSpeech !== null;

  const [status, setStatus] = useState<AppleSpeechStatus>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionsResult | null>(null);

  const isMounted = useRef(true);
  const subscriptions = useRef<EventSubscription[]>([]);

  // ── Event subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAvailable || !AppleSpeechEmitter) return;

    subscriptions.current = [
      (AppleSpeechEmitter as any)?.addListener(EVENT_PARTIAL, ({ transcript }: { transcript: string }) => {
        if (!isMounted.current) return;
        setPartialTranscript(transcript);
        onPartialTranscript?.(transcript);
      }),
      (AppleSpeechEmitter as any)?.addListener(EVENT_FINAL, ({ transcript }: { transcript: string }) => {
        if (!isMounted.current) return;
        setFinalTranscript(transcript);
        setPartialTranscript('');
        onFinalTranscript?.(transcript);
        setStatus('done');
      }),
      (AppleSpeechEmitter as any)?.addListener(EVENT_STATUS, ({ status: s }: { status: string }) => {
        if (!isMounted.current) return;
        setStatus(s as AppleSpeechStatus);
      }),
      (AppleSpeechEmitter as any)?.addListener(EVENT_ERROR, ({ message }: { message: string }) => {
        if (!isMounted.current) return;
        setError(message);
        setStatus('error');
        onError?.(message);
      }),
      // onPermissionStatus fires after requestPermissions() so the hook
      // always reflects the latest permission state without extra polling
      (AppleSpeechEmitter as any)?.addListener(EVENT_PERM_STATUS, (perms: PermissionStatusEvent) => {
        if (!isMounted.current) return;
        setPermissions({ speech: perms.speech, microphone: perms.microphone });
      }),
    ];
    return () => {
      subscriptions.current.forEach((sub) => sub.remove());
      subscriptions.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAvailable]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (isAvailable && NativeAppleSpeech) {
        NativeAppleSpeech.stopListening().catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── startListening ──────────────────────────────────────────────────────
  const startListening = useCallback(async (): Promise<void> => {
    if (!isAvailable || !NativeAppleSpeech) {
      setError('Apple Speech Recognition is not available on this platform.');
      setStatus('error');
      return;
    }
    try {
      setError(null);
      setPartialTranscript('');
      setFinalTranscript('');
      setStatus('requesting');
      const perms: PermissionsResult = await NativeAppleSpeech.requestPermissions();
      if (!perms.microphone || !perms.speech) {
        const msg = !perms.microphone
          ? 'Microphone permission denied. Please enable it in Settings → Privacy → Microphone.'
          : 'Speech recognition permission denied. Please enable it in Settings → Privacy → Speech Recognition.';
        setError(msg);
        setStatus('error');
        onError?.(msg);
        return;
      }
      await NativeAppleSpeech.startListening(locale);
      // Status will be set to 'listening' via the onStatus event from Swift
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start speech recognition';
      if (isMounted.current) {
        setError(msg);
        setStatus('error');
        onError?.(msg);
      }
    }
  }, [isAvailable, locale, onError]);

  // ── stopListening ───────────────────────────────────────────────────────
  const stopListening = useCallback(async (): Promise<string> => {
    if (!isAvailable || !NativeAppleSpeech) return '';
    try {
      await NativeAppleSpeech.stopListening();
      // Final transcript arrives via the onFinalResult event
      return finalTranscript;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to stop speech recognition';
      if (isMounted.current) {
        setError(msg);
        setStatus('error');
        onError?.(msg);
      }
      return '';
    }
  }, [isAvailable, finalTranscript, onError]);

  // ── cancelListening ─────────────────────────────────────────────────────
  const cancelListening = useCallback(async (): Promise<void> => {
    if (!isAvailable || !NativeAppleSpeech) return;
    try {
      await NativeAppleSpeech.stopListening();
      if (isMounted.current) {
        setPartialTranscript('');
        setStatus('idle');
      }
    } catch (_) {
      // Ignore cancel errors
    }
  }, [isAvailable]);

  // ── toggle ──────────────────────────────────────────────────────────────
  const toggle = useCallback(async (): Promise<void> => {
    if (status === 'listening') {
      await stopListening();
    } else if (status === 'idle' || status === 'done' || status === 'error') {
      await startListening();
    }
    // If 'requesting' or 'processing', ignore the tap
  }, [status, startListening, stopListening]);

  // ── reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (isAvailable && NativeAppleSpeech) {
      NativeAppleSpeech.stopListening().catch(() => {});
    }
    setStatus('idle');
    setPartialTranscript('');
    setFinalTranscript('');
    setError(null);
  }, [isAvailable]);

  return {
    isAvailable,
    status,
    isListening: status === 'listening',
    partialTranscript,
    finalTranscript,
    permissions,
    error,
    toggle,
    startListening,
    stopListening,
    cancelListening,
    reset,
  };
}
