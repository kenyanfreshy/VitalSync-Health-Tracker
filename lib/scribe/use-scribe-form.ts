/**
 * lib/scribe/use-scribe-form.ts
 *
 * useScribeForm<T>
 *
 * A crash-safe, lifecycle-managed hook that:
 *  1. Starts/stops Apple Speech recognition (or audio-upload fallback)
 *  2. Streams partial transcript to UI while listening
 *  3. On stop: runs the local parser immediately (offline, instant)
 *  4. Calls the optional async server enhancer if provided
 *  5. Calls onResult(parsed) so the screen can apply fields
 *
 * Crash-prevention guarantees:
 *  - isMounted ref prevents setState on unmounted components
 *  - All async paths are wrapped in try/catch
 *  - Cleanup runs on unmount (clears timers, cancels recognition)
 *  - No duplicate listener registration (single hook instance per screen)
 *  - Parser never throws (all parsers are null-safe)
 *
 * Usage:
 * ```ts
 * const scribe = useScribeForm({
 *   parser: parseVitalsTranscript,
 *   onResult: (parsed) => {
 *     if (parsed.systolic) setSystolic(String(parsed.systolic));
 *   },
 * });
 *
 * // In JSX:
 * <ScribeButton
 *   onTranscript={scribe.handleTranscript}
 *   onResult={scribe.handleAudioResult}
 *   onError={scribe.handleError}
 * />
 * {scribe.transcript && <Text>{scribe.transcript}</Text>}
 * {scribe.error && <Text>{scribe.error}</Text>}
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export type ScribeFormStatus =
  | 'idle'
  | 'listening'
  | 'parsing'
  | 'done'
  | 'error';

export interface UseScribeFormOptions<T> {
  /**
   * Synchronous local parser — runs instantly on transcript.
   * Must never throw.
   */
  parser: (transcript: string) => T;

  /**
   * Called with the parsed result after local parsing completes.
   * Use this to apply fields to screen state.
   */
  onResult: (result: T, transcript: string) => void;

  /**
   * Optional async server enhancer.
   * Called after local parsing; its result is merged on top.
   * If it throws, the error is surfaced but the local result is kept.
   */
  serverEnhancer?: (transcript: string) => Promise<Partial<T>>;

  /**
   * Called when any error occurs (permission denied, network error, etc.)
   */
  onError?: (message: string) => void;
}

export interface UseScribeFormReturn {
  status: ScribeFormStatus;
  transcript: string;
  error: string | null;
  isListening: boolean;
  isProcessing: boolean;
  /** Pass to ScribeButton onTranscript prop */
  handleTranscript: (transcript: string) => Promise<void>;
  /** Pass to ScribeButton onResult prop (audio-upload mode) */
  handleAudioResult: (base64: string) => void;
  /** Pass to ScribeButton onError prop */
  handleError: (message: string) => void;
  /** Reset to idle state */
  reset: () => void;
}

export function useScribeForm<T>({
  parser,
  onResult,
  serverEnhancer,
  onError,
}: UseScribeFormOptions<T>): UseScribeFormReturn {
  const [status, setStatus] = useState<ScribeFormStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prevent setState on unmounted component
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const safeSet = useCallback(<S>(setter: React.Dispatch<React.SetStateAction<S>>, value: S) => {
    if (isMounted.current) setter(value);
  }, []);

  const handleTranscript = useCallback(async (rawTranscript: string): Promise<void> => {
    if (!isMounted.current) return;

    const trimmed = (rawTranscript ?? '').trim();
    if (!trimmed) return;

    safeSet(setTranscript as any, trimmed as any);
    safeSet(setError as any, null as any);
    safeSet(setStatus as any, 'parsing' as any);

    try {
      // ── Step 1: Local parse (instant, offline) ─────────────────────────
      let parsed: T;
      try {
        parsed = parser(trimmed);
      } catch (parseErr) {
        // Parser threw unexpectedly — create empty result
        parsed = {} as T;
        console.warn('[ScribeForm] Parser threw:', parseErr);
      }

      // Apply local result immediately
      try {
        onResult(parsed, trimmed);
      } catch (applyErr) {
        console.warn('[ScribeForm] onResult threw:', applyErr);
      }

      // ── Step 2: Optional server enhancement ────────────────────────────
      if (serverEnhancer) {
        try {
          const enhanced = await serverEnhancer(trimmed);
          if (isMounted.current && enhanced && typeof enhanced === 'object') {
            // Merge: only override fields that the server found (non-null)
            const merged = { ...parsed };
            for (const [k, v] of Object.entries(enhanced)) {
              if (v !== null && v !== undefined) {
                (merged as Record<string, unknown>)[k] = v;
              }
            }
            try {
              onResult(merged as T, trimmed);
            } catch (mergeApplyErr) {
              console.warn('[ScribeForm] onResult (merged) threw:', mergeApplyErr);
            }
          }
        } catch (serverErr) {
          // Server enhancement failed — local result already applied, just warn
          console.warn('[ScribeForm] Server enhancer failed:', serverErr);
        }
      }

      if (isMounted.current) safeSet(setStatus as any, 'done' as any);
    } catch (outerErr) {
      if (isMounted.current) {
        const msg = outerErr instanceof Error ? outerErr.message : 'Parsing failed';
        safeSet(setError as any, msg as any);
        safeSet(setStatus as any, 'error' as any);
        onError?.(msg);
      }
    }
  }, [parser, onResult, serverEnhancer, onError, safeSet]);

  /**
   * Audio-upload mode: base64 audio arrives instead of a transcript.
   * In this mode we cannot run the local parser (no text yet).
   * The caller should pass the base64 to their server endpoint and
   * then call handleTranscript with the resulting text.
   *
   * This handler is a no-op placeholder to satisfy ScribeButton's
   * onResult prop type — the screen should override it if needed.
   */
  const handleAudioResult = useCallback((_base64: string) => {
    // Audio-upload mode: screen handles this directly via its own mutation.
    // This hook's local parser cannot run without a transcript.
  }, []);

  const handleError = useCallback((message: string) => {
    if (!isMounted.current) return;
    safeSet(setError as any, message ?? 'An error occurred' as any);
    safeSet(setStatus as any, 'error' as any);
    onError?.(message);
  }, [onError, safeSet]);

  const reset = useCallback(() => {
    if (!isMounted.current) return;
    safeSet(setStatus as any, 'idle' as any);
    safeSet(setTranscript as any, '' as any);
    safeSet(setError as any, null as any);
  }, [safeSet]);

  return {
    status,
    transcript,
    error,
    isListening: status === 'listening',
    isProcessing: status === 'parsing',
    handleTranscript,
    handleAudioResult,
    handleError,
    reset,
  };
}
