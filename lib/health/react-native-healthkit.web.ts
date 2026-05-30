/**
 * react-native-healthkit.web.ts
 *
 * Web-safe no-op stub for @kingstinct/react-native-healthkit.
 *
 * WHY THIS FILE EXISTS — Root Cause Analysis (Build 2.7.56 DoA crash):
 *
 * @kingstinct/react-native-healthkit v8.7.x registers its native module in
 * native-types.js at MODULE EVALUATION TIME (not inside a function):
 *
 *   const Native = NativeModules.ReactNativeHealthkit;          // line 1495
 *   new NativeEventEmitter(NativeModules.ReactNativeHealthkit); // line 1496
 *   exports.default = Native;                                   // line 1497
 *
 * Then index.ios.js immediately calls .bind() on every method:
 *
 *   const isHealthDataAvailable = Native.isHealthDataAvailable.bind(Native); // line 383
 *   const authorizationStatusFor = Native.authorizationStatusFor.bind(Native);
 *   // ... 20+ more .bind() calls
 *
 * When the native module is NOT registered (web, Android, or an iOS build
 * where the HealthKit entitlement is missing / pod not linked):
 *   • NativeModules.ReactNativeHealthkit === undefined
 *   • Native === undefined
 *   • undefined.isHealthDataAvailable → TypeError: undefined is not a function
 *
 * This crash happens at BUNDLE LOAD TIME — before React mounts, before
 * GlobalErrorBoundary is active, before any component renders. The app is
 * Dead-on-Arrival.
 *
 * FIX: Metro resolver redirects all imports of @kingstinct/react-native-healthkit
 * on the web platform to this stub, which returns safe no-op functions.
 * The iOS native build is unaffected (Metro only applies the redirect for web).
 *
 * See metro.config.js for the resolver rule.
 */

const noop = async (): Promise<any> => null;
const noopBool = async (): Promise<boolean> => false;

const stub = {
  isHealthDataAvailable: noopBool,
  isProtectedDataAvailable: noopBool,
  authorizationStatusFor: noop,
  requestAuthorization: noopBool,
  disableBackgroundDelivery: noop,
  disableAllBackgroundDelivery: noop,
  enableBackgroundDelivery: noop,
  getBiologicalSex: noop,
  getBloodType: noop,
  getDateOfBirth: noop,
  getFitzpatrickSkinType: noop,
  getWheelchairUse: noop,
  getMostRecentQuantitySample: noop,
  getMostRecentCategorySample: noop,
  getMostRecentWorkout: noop,
  getPreferredUnit: noop,
  getPreferredUnits: noop,
  getRequestStatusForAuthorization: noop,
  getWorkoutRoutes: noop,
  queryCategorySamples: async () => [],
  queryCategorySamplesWithAnchor: async () => ({ samples: [], newAnchor: null }),
  queryCorrelationSamples: async () => [],
  queryHeartbeatSeriesSamples: async () => [],
  queryHeartbeatSeriesSamplesWithAnchor: async () => ({ samples: [], newAnchor: null }),
  queryQuantitySamples: async () => [],
  queryQuantitySamplesWithAnchor: async () => ({ samples: [], newAnchor: null }),
  queryStatisticsForQuantity: noop,
  queryStatisticsCollectionForQuantity: async () => [],
  availableQuantityTypes: async () => [],
};

export default stub;

// Named exports mirror the real package's named exports
export const isHealthDataAvailable = noopBool;
export const isProtectedDataAvailable = noopBool;
export const authorizationStatusFor = noop;
export const requestAuthorization = noopBool;
export const disableBackgroundDelivery = noop;
export const disableAllBackgroundDelivery = noop;
export const enableBackgroundDelivery = noop;
export const getBiologicalSex = noop;
export const getBloodType = noop;
export const getDateOfBirth = noop;
export const getFitzpatrickSkinType = noop;
export const getWheelchairUse = noop;
export const getMostRecentQuantitySample = noop;
export const getMostRecentCategorySample = noop;
export const getMostRecentWorkout = noop;
export const getPreferredUnit = noop;
export const getPreferredUnits = noop;
export const getRequestStatusForAuthorization = noop;
export const getWorkoutRoutes = noop;
export const queryCategorySamples = async () => [];
export const queryCategorySamplesWithAnchor = async () => ({ samples: [], newAnchor: null });
export const queryCorrelationSamples = async () => [];
export const queryHeartbeatSeriesSamples = async () => [];
export const queryHeartbeatSeriesSamplesWithAnchor = async () => ({ samples: [], newAnchor: null });
export const queryQuantitySamples = async () => [];
export const queryQuantitySamplesWithAnchor = async () => ({ samples: [], newAnchor: null });
export const queryStatisticsForQuantity = noop;
export const queryStatisticsCollectionForQuantity = async () => [];
export const availableQuantityTypes = async () => [];
