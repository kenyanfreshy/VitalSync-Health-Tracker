/**
 * NativeEventEmitter null-safety polyfill for iOS New Architecture.
 *
 * MUST be imported as the FIRST import in app/_layout.tsx (before any other
 * react-native or expo imports) to take effect before module evaluation.
 *
 * ROOT CAUSE:
 * `react-native/Libraries/PushNotificationIOS/PushNotificationIOS.js` calls:
 *
 *   new NativeEventEmitter(NativePushNotificationManagerIOS)
 *
 * at MODULE EVALUATION TIME. On iOS New Architecture (Expo managed workflow,
 * Expo Go, TestFlight), `TurboModuleRegistry.get('PushNotificationManager')`
 * returns null — so `NativeEventEmitter` receives null and throws:
 *
 *   Invariant Violation: `new NativeEventEmitter()` requires a non-null argument.
 *
 * This fires BEFORE React mounts, BEFORE GlobalErrorBoundary is active —
 * a Dead-on-Arrival crash that kills the app on every launch.
 *
 * CRASH EVIDENCE: 7 identical fatal entries in VitalSync crash logs (2026-04-28).
 * Stack: NativeEventEmitter → anonymous (offset 780375) → get PushNotificationIOS
 *        → metroImportAll → importAll → asyncRequireImpl
 *
 * THE FIX:
 * Monkey-patch the NativeEventEmitter module to replace the constructor with
 * a null-safe version that silently skips the invariant when the native module
 * is null. This is safe because:
 * 1. The patched emitter simply won't receive native events (correct behavior
 *    when the native module isn't linked).
 * 2. All notification functionality uses expo-notifications via safe-notifications.ts.
 * 3. The patch only activates when nativeModule is null — normal behavior is preserved.
 *
 * This approach is used by react-native-firebase and other major libraries to
 * handle the New Architecture transition period.
 *
 * NOTE: This polyfill is a SAFETY NET. The primary fix is the Metro resolver
 * stub in metro.config.js that redirects PushNotificationIOS to a safe stub.
 * Both fixes together ensure the crash cannot occur.
 */

// Only apply on iOS — Android and web don't have this issue.
import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
  try {
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NativeEventEmitterModule = require('react-native/Libraries/EventEmitter/NativeEventEmitter');
    const OriginalNativeEventEmitter =
      NativeEventEmitterModule.default ?? NativeEventEmitterModule;

    if (
      OriginalNativeEventEmitter &&
      typeof OriginalNativeEventEmitter === 'function'
    ) {
      // Create a null-safe subclass that skips the invariant when nativeModule is null.
       
      class SafeNativeEventEmitter extends OriginalNativeEventEmitter {
        constructor(nativeModule?: unknown) {
          if (nativeModule == null) {
            // Skip the iOS null invariant by calling super with an empty object
            // that has the required addListener/removeListeners methods.
            // The emitter will work but won't forward native events.
            // This is correct behavior when the native module isn't linked.
            const nullSafeModule = {
              addListener: () => {},
              removeListeners: () => {},
            };
            super(nullSafeModule as never);
          } else {
            super(nativeModule as never);
          }
        }
      }

      // Replace the module export so all subsequent requires get the safe version.
      if (NativeEventEmitterModule.default !== undefined) {
        NativeEventEmitterModule.default = SafeNativeEventEmitter;
      } else {
        // CommonJS export — replace the exported value
        Object.keys(SafeNativeEventEmitter).forEach((key) => {
           
          (NativeEventEmitterModule as any)[key] = (SafeNativeEventEmitter as any)[key];
        });
        // Replace the constructor
         
        (NativeEventEmitterModule as any).constructor = SafeNativeEventEmitter;
      }
    }
  } catch (_patchError) {
    // If patching fails, continue — the Metro resolver stub is the primary fix.
    if (__DEV__) {
      console.warn('[VitalSync] NativeEventEmitter patch failed:', _patchError);
    }
  }
}
