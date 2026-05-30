/**
 * useSpeechRecognizer
 *
 * NOTE: This hook is SUPERSEDED and NO LONGER USED.
 *
 * Both ScribeButton and LogAllVitalsSheet have been migrated to the
 * keyboard dictation approach (hidden TextInput) to avoid the Hermes Signal 11
 * SIGSEGV crash on iOS 26 Beta New Architecture.
 *
 * @react-native-voice/voice has been removed from the project entirely.
 * This file is retained as a no-op stub so that any legacy import sites
 * (use-voice-scribe-apple.ts etc.) do not cause bundler errors during the
 * transition period.
 *
 * See scribe-button.tsx and log-all-vitals-sheet.tsx for the replacement.
 */
import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

export interface SpeechRecognizerState {
  isListening: boolean;
  isProcessing: boolean;
  partialTranscript: string;
  finalTranscript: string;
  error: string | null;
  volumeLevel: number;
}

const INITIAL_STATE: SpeechRecognizerState = {
  isListening: false,
  isProcessing: false,
  partialTranscript: '',
  finalTranscript: '',
  error: null,
  volumeLevel: 0,
};

export interface UseSpeechRecognizerOptions {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (error: string) => void;
  onVolumeChanged?: (volume: number) => void;
  locale?: string;
}

/**
 * Legacy no-op stub — @react-native-voice/voice has been removed.
 * All callers should migrate to the hidden-TextInput keyboard dictation
 * pattern used in scribe-button.tsx and log-all-vitals-sheet.tsx.
 */
export function useSpeechRecognizer(options: UseSpeechRecognizerOptions = {}) {
  const [state] = useState<SpeechRecognizerState>(INITIAL_STATE);

  const startListening = useCallback(async () => {
    if (Platform.OS !== 'web') {
      console.warn('[useSpeechRecognizer] This hook is superseded. Use keyboard dictation instead.');
    }
    options.onError?.('Speech recognizer removed — use keyboard dictation.');
  }, [options]);

  const stopListening = useCallback(async () => {
    // no-op
  }, []);

  const cancelListening = useCallback(async () => {
    // no-op
  }, []);

  const reset = useCallback(() => {
    // no-op
  }, []);

  return {
    state,
    startListening,
    stopListening,
    cancelListening,
    reset,
  };
}
