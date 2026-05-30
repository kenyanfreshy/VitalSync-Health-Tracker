/**
 * Web stub for @react-native-voice/voice
 *
 * @react-native-voice/voice calls new NativeEventEmitter(NativeModules.Voice)
 * at module load time. On web (and on iOS when the native module is not linked),
 * NativeModules.Voice is undefined, which causes React Native 0.81+ to throw:
 *   "new NativeEventEmitter() requires a non-null argument."
 *
 * This stub is registered in metro.config.js for the 'web' platform so that
 * the module resolves to a no-op implementation instead of the native module.
 *
 * RCA Reference: Build 2.7.54 — Hypothesis 2 (NativeEventEmitter null crash)
 */

const VoiceStub = {
  start: async (_locale?: string) => {},
  stop: async () => {},
  cancel: async () => {},
  destroy: async () => {},
  removeAllListeners: () => {},
  isAvailable: async () => false,
  isRecognizing: async () => false,
  getSpeechRecognitionServices: async () => [],
  onSpeechStart: undefined as unknown,
  onSpeechRecognized: undefined as unknown,
  onSpeechEnd: undefined as unknown,
  onSpeechError: undefined as unknown,
  onSpeechResults: undefined as unknown,
  onSpeechPartialResults: undefined as unknown,
  onSpeechVolumeChanged: undefined as unknown,
};

export default VoiceStub;
