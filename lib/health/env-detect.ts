/**
 * env-detect.ts
 *
 * Runtime environment detection utilities.
 *
 * Detection strategy:
 *   - `expo-constants` Constants.executionEnvironment is the canonical signal:
 *       'storeClient' → Expo Go
 *       'bare'        → EAS dev client / bare workflow build
 *       'standalone'  → production / TestFlight build
 *   - We also cross-check NativeModules.AppleHealthKit as a secondary signal:
 *     if it is absent on iOS we are almost certainly in Expo Go or a bare
 *     simulator build without the HealthKit entitlement.
 *
 * These helpers are synchronous and safe to call at module-eval time.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

// ─── Expo Go ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the app is running inside the Expo Go client.
 * In Expo Go, custom native modules (HealthKit, NitroModules) are NOT available.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

// ─── Dev Client / Standalone ──────────────────────────────────────────────────

/**
 * Returns true when running in an EAS development build (dev client).
 * Dev clients have full native module support but are not production builds.
 */
export function isDevBuild(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.Bare && __DEV__;
}

/**
 * Returns true when running as a standalone (production/TestFlight) build.
 */
export function isStandalone(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.Standalone ||
    (Constants.executionEnvironment === ExecutionEnvironment.Bare && !__DEV__)
  );
}

// ─── Native Module Availability ───────────────────────────────────────────────

/**
 * Returns true if the react-native-health AppleHealthKit native module is
 * registered in the JS bridge. This is false in Expo Go and in any build
 * where the HealthKit entitlement or native linking is missing.
 */
export function isAppleHealthKitNativeModuleLoaded(): boolean {
  if (Platform.OS !== 'ios') return false;
  const bridge = (NativeModules as Record<string, unknown>).AppleHealthKit;
  return !!bridge && typeof (bridge as Record<string, unknown>).initHealthKit === 'function';
}

/**
 * Returns true if the @kingstinct/react-native-healthkit bridge is registered.
 *
 * @kingstinct/react-native-healthkit v8.7.x registers under
 * NativeModules.ReactNativeHealthkit (not global.NitroModulesProxy).
 */
export function isNitroModulesLoaded(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NativeModules } = require('react-native');
   
  return !!(NativeModules as any).ReactNativeHealthkit;
}

/**
 * Returns true if at least one HealthKit native bridge is available.
 */
export function isAnyHealthKitBridgeLoaded(): boolean {
  return isAppleHealthKitNativeModuleLoaded() || isNitroModulesLoaded();
}

// ─── Environment Summary ──────────────────────────────────────────────────────

export interface EnvInfo {
  /** Running inside Expo Go */
  isExpoGo: boolean;
  /** Running in an EAS dev client build */
  isDevBuild: boolean;
  /** Running as a production/TestFlight standalone build */
  isStandalone: boolean;
  /** NativeModules.AppleHealthKit is registered */
  appleHealthKitNativeModuleLoaded: boolean;
  /** NativeModules.ReactNativeHealthkit (@kingstinct v8.7.x) is registered */
  nitroModulesLoaded: boolean;
  /** Either HealthKit bridge is available */
  nativeModulesLoaded: boolean;
  /** Human-readable build type label */
  buildType: 'Expo Go' | 'Dev Build' | 'Standalone' | 'Unknown';
}

export function getEnvInfo(): EnvInfo {
  const expoGo = isExpoGo();
  const devBuild = isDevBuild();
  const standalone = isStandalone();
  const appleHK = isAppleHealthKitNativeModuleLoaded();
  const nitro = isNitroModulesLoaded();

  let buildType: EnvInfo['buildType'] = 'Unknown';
  if (expoGo) buildType = 'Expo Go';
  else if (devBuild) buildType = 'Dev Build';
  else if (standalone) buildType = 'Standalone';

  return {
    isExpoGo: expoGo,
    isDevBuild: devBuild,
    isStandalone: standalone,
    appleHealthKitNativeModuleLoaded: appleHK,
    nitroModulesLoaded: nitro,
    nativeModulesLoaded: appleHK || nitro,
    buildType,
  };
}
