const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Provide a web-safe stub for react-native-ble-plx.
// The library calls NativeModules.BlePlx at module scope, which crashes on web.
config.resolver = config.resolver ?? {};
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // react-native-iap uses react-native-nitro-modules (JSI/Nitro HybridObjects)
  // which are not available on web. Redirect to a safe no-op stub.
  if (platform === "web" && moduleName === "react-native-iap") {
    return {
      filePath: path.resolve(__dirname, "lib/stubs/react-native-iap.web.ts"),
      type: "sourceFile",
    };
  }
  if (platform === "web" && moduleName === "react-native-ble-plx") {
    return {
      filePath: path.resolve(__dirname, "lib/ble/react-native-ble-plx.web.ts"),
      type: "sourceFile",
    };
  }
  if (platform === "web" && moduleName === "react-native-health") {
    return {
      filePath: path.resolve(__dirname, "lib/health/react-native-health.web.ts"),
      type: "sourceFile",
    };
  }
  // @kingstinct/react-native-healthkit calls NativeModules.ReactNativeHealthkit
  // and NativeEventEmitter at MODULE EVAL TIME (not inside a function).
  // When the native module is absent (web, or iOS without the pod linked),
  // NativeModules.ReactNativeHealthkit === undefined and the subsequent
  // .bind() calls on every exported function throw:
  //   TypeError: undefined is not a function
  // This is a Dead-on-Arrival crash — it fires before React mounts, before
  // GlobalErrorBoundary is active, before any component renders.
  // Fix: redirect to a safe no-op stub on web.
  // RCA Reference: Build 2.7.56 DoA crash diagnostic.
  if (platform === "web" && moduleName === "@kingstinct/react-native-healthkit") {
    return {
      filePath: path.resolve(__dirname, "lib/health/react-native-healthkit.web.ts"),
      type: "sourceFile",
    };
  }
  // ─────────────────────────────────────────────────────────────────────────
  // FIX: PushNotificationIOS Dead-on-Arrival crash on iOS New Architecture
  //
  // ROOT CAUSE:
  //   react-native/Libraries/PushNotificationIOS/PushNotificationIOS.js calls:
  //     new NativeEventEmitter(NativePushNotificationManagerIOS)
  //   at MODULE EVALUATION TIME. On iOS New Architecture (Expo managed workflow,
  //   Expo Go, TestFlight builds), TurboModuleRegistry.get('PushNotificationManager')
  //   returns null — so NativeEventEmitter receives null and throws:
  //     Invariant Violation: `new NativeEventEmitter()` requires a non-null argument.
  //
  // CRASH EVIDENCE: 7 identical fatal entries in VitalSync crash logs (2026-04-28).
  // Stack: NativeEventEmitter → anonymous (offset 780375) → get PushNotificationIOS
  //        → metroImportAll → importAll → asyncRequireImpl
  //
  // THE FIX:
  //   When Metro resolves PushNotificationIOS on iOS, redirect to a safe stub
  //   that provides the same API surface but never calls new NativeEventEmitter().
  //   All notification functionality is provided by expo-notifications via
  //   lib/notifications/safe-notifications.ts.
  //
  // WHY THIS WORKS:
  //   Metro collects ALL require() calls at bundle time via AST traversal,
  //   including those inside lazy getters (like the PushNotificationIOS getter
  //   in react-native/index.js). The resolveRequest hook intercepts ALL of them,
  //   so the stub module is bundled instead of the crashing original.
  // ─────────────────────────────────────────────────────────────────────────
  const isPushNotificationIOS =
    moduleName === "./Libraries/PushNotificationIOS/PushNotificationIOS" ||
    moduleName === "react-native/Libraries/PushNotificationIOS/PushNotificationIOS" ||
    moduleName === "../PushNotificationIOS/PushNotificationIOS" ||
    moduleName.endsWith("/PushNotificationIOS/PushNotificationIOS");

  if (platform === "ios" && isPushNotificationIOS) {
    return {
      filePath: path.resolve(__dirname, "lib/stubs/PushNotificationIOS.stub.ts"),
      type: "sourceFile",
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
