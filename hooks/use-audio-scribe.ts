/**
 * useAudioScribe
 *
 * Shared hook that handles:
 *  1. Requesting microphone permission (expo-audio)
 *  2. Recording audio with useAudioRecorder (HIGH_QUALITY preset, m4a)
 *  3. Reading the recorded file as base64 (expo-file-system/legacy)
 *  4. Returning the base64 string + mimeType ready for a tRPC mutation
 *
 * Usage:
 *   const { isRecording, startRecording, stopRecording, error } = useAudioScribe();
 *   const base64 = await stopRecording(); // returns base64 string or null on failure
 */
import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export type AudioScribeState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error';

export interface UseAudioScribeReturn {
  /** Current state of the scribe */
  state: AudioScribeState;
  /** Whether the mic is actively recording */
  isRecording: boolean;
  /** Error message if state === 'error' */
  error: string | null;
  /** Start recording. Returns false if permission denied. */
  startRecording: () => Promise<boolean>;
  /**
   * Stop recording and return the audio as a base64 string.
   * Returns null if recording failed or no audio was captured.
   */
  stopRecording: () => Promise<string | null>;
  /** Reset to idle state */
  reset: () => void;
}

export function useAudioScribe(): UseAudioScribeReturn {
  const [state, setState] = useState<AudioScribeState>('idle');
  const [error, setError] = useState<string | null>(null);
  const isRecordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    setState('requesting');

    // On web, expo-audio recording is not supported
    if (Platform.OS === 'web') {
      setError('Voice recording is not supported on web. Please use the iOS or Android app.');
      setState('error');
      return false;
    }

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setError('Microphone permission denied. Please enable it in Settings.');
        setState('error');
        return false;
      }

      // Allow audio to play/record in silent mode on iOS
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      setState('recording');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start recording';
      setError(msg);
      setState('error');
      return false;
    }
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecordingRef.current) return null;

    setState('processing');
    isRecordingRef.current = false;

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setError('No audio was captured.');
        setState('error');
        return null;
      }

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!base64 || base64.length < 100) {
        setError('Recording was too short or empty.');
        setState('error');
        return null;
      }

      setState('idle');
      return base64;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process recording';
      setError(msg);
      setState('error');
      return null;
    }
  }, [recorder]);

  const reset = useCallback(() => {
    setError(null);
    setState('idle');
    isRecordingRef.current = false;
  }, []);

  return {
    state,
    isRecording: state === 'recording',
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
