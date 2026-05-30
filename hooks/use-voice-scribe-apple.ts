/**
 * useVoiceScribeApple
 *
 * High-level hook for the Apple Speech / SFSpeechRecognizer voice scribe flow.
 *
 * Flow:
 *  1. User taps mic → startScribe() → SFSpeechRecognizer starts listening
 *  2. Real-time partial transcript shown in UI via `partialTranscript`
 *  3. User taps stop (or silence timeout fires) → stopScribe()
 *  4. Final transcript sent to server for LLM parsing → `onTranscript(transcript)`
 *
 * The caller receives the raw transcript string via `onTranscript`.
 * The caller is responsible for sending the finalTranscript to the appropriate
 * server endpoint (e.g. trpc.health.parseVitalsTranscript).
 *
 * Usage:
 * ```ts
 * const {
 *   isListening, partialTranscript, error,
 *   startScribe, stopScribe, cancelScribe, reset,
 * } = useVoiceScribeApple({ onTranscript: (t) => handleTranscript(t) });
 * ```
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { useSpeechRecognizer } from './use-speech-recognizer';

export interface UseVoiceScribeAppleOptions {
  /**
   * Called with the final finalTranscript when the user stops speaking.
   * This is where you call the server LLM parse endpoint.
   */
  onTranscript: (transcript: string) => void | Promise<void>;
  /**
   * Called when an error occurs during recognition.
   */
  onError?: (message: string) => void;
  /**
   * BCP-47 locale for speech recognition. Defaults to 'en-US'.
   */
  locale?: string;
  /**
   * Auto-stop after this many seconds of silence (approximate).
   * Defaults to 30 seconds.
   */
  silenceTimeoutSeconds?: number;
}

export type VoiceScribeAppleState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'processing'
  | 'done'
  | 'error';

export interface UseVoiceScribeAppleReturn {
  state: VoiceScribeAppleState;
  isListening: boolean;
  /** Live partial finalTranscript as the user speaks */
  partialTranscript: string;
  /** Microphone volume level (0–1) while listening */
  volumeLevel: number;
  /** Error message if state === 'error' */
  error: string | null;
  /** Start listening */
  startScribe: () => Promise<boolean>;
  /** Stop listening and trigger onTranscript */
  stopScribe: () => Promise<void>;
  /** Cancel without producing a result */
  cancelScribe: () => Promise<void>;
  /** Reset to idle */
  reset: () => void;
  /** Whether Apple Speech is available on this platform */
  isAvailable: boolean;
}

export function useVoiceScribeApple({
  onTranscript,
  onError,
  locale = 'en-US',
  silenceTimeoutSeconds = 30,
}: UseVoiceScribeAppleOptions): UseVoiceScribeAppleReturn {
  const [state, setState] = useState<VoiceScribeAppleState>('idle');
  const [error, setError] = useState<string | null>(null);

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const _speechResult = (useSpeechRecognizer()) as any;
  const isListening = _speechResult?.state === 'listening';
  const partialTranscript: string = _speechResult?.partialTranscript ?? '';
  const finalTranscript: string = _speechResult?.finalTranscript ?? '';
  const volumeLevel: number = _speechResult?.volumeLevel ?? 0;
  const startListening = _speechResult?.startListening ?? (async () => {});
  const stopListening = _speechResult?.stopListening ?? (async () => {});
  const cancelListening = _speechResult?.cancelListening ?? (async () => {});

  // Track mounted state
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    };
  }, []);

  // Surface recognizer errors
  useEffect(() => {
    if (_speechResult?.error && state === 'listening') {
      if (isMounted.current) {
        setError(_speechResult?.error);
        setState('error');
        onError?.(_speechResult?.error);
      }
    }
  }, [_speechResult?.error, state, onError]);

  // When finalTranscript arrives (recognizer ended naturally), process it
  useEffect(() => {
    if (finalTranscript && state === 'listening') {
      if (isMounted.current) {
        setState('processing');
        if (silenceTimer.current) {
          clearTimeout(silenceTimer.current);
          silenceTimer.current = null;
        }
        Promise.resolve(onTranscript(finalTranscript)).then(() => {
          if (isMounted.current) setState('done');
        }).catch((e) => {
          if (isMounted.current) {
            const msg = e instanceof Error ? e.message : 'Processing failed';
            setError(msg);
            setState('error');
            onError?.(msg);
          }
        });
      }
    }
  }, [finalTranscript, state, onTranscript, onError]);

  const startScribe = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      const msg = 'Apple Speech recognition is not available on web.';
      setError(msg);
      setState('error');
      onError?.(msg);
      return false;
    }

    setError(null);
    setState('requesting');

    const ok = await startListening();
    if (!ok) {
      const msg = 'Could not start speech recognition. Please check microphone permissions in Settings.';
      setError(msg);
      setState('error');
      onError?.(msg);
      return false;
    }

    setState('listening');

    // Auto-stop after silenceTimeoutSeconds
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(async () => {
      if (isMounted.current && state === 'listening') {
        await stopScribe();
      }
    }, silenceTimeoutSeconds * 1000);

    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, silenceTimeoutSeconds, startListening, onError]);

  const stopScribe = useCallback(async (): Promise<void> => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }

    setState('processing');
    await stopListening();

    if (!finalTranscript.trim()) {
      if (isMounted.current) {
        setState('idle');
      }
      return;
    }

    try {
      await onTranscript(finalTranscript ?? "");
      if (isMounted.current) setState('done');
    } catch (e) {
      if (isMounted.current) {
        const msg = e instanceof Error ? e.message : 'Processing failed';
        setError(msg);
        setState('error');
        onError?.(msg);
      }
    }
  }, [stopListening, onTranscript, onError]);

  const cancelScribe = useCallback(async (): Promise<void> => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    await cancelListening();
    if (isMounted.current) {
      setState('idle');
      setError(null);
    }
  }, [cancelListening]);

  const reset = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    _speechResult?.reset();
    setError(null);
    setState('idle');
  }, [_speechResult?.reset]);

  return {
    state,
    isListening: state === 'listening' || isListening,
    partialTranscript,
    volumeLevel,
    error,
    startScribe,
    stopScribe,
    cancelScribe,
    reset,
    isAvailable: Platform.OS !== 'web',
  };
}
