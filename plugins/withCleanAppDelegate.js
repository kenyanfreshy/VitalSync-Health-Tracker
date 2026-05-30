/**
 * withCleanAppDelegate.js
 *
 * Ensures the generated AppDelegate.swift is compatible with:
 *   - @kingstinct/react-native-healthkit (HKHealthStore must be initialized on main thread)
 *   - react-native-ble-plx (CBCentralManager must be initialized on main thread)
 *
 * What this plugin does:
 *   1. Removes any duplicate UIApplicationDelegate method stubs that Expo's managed
 *      workflow may inject.
 *   2. Deduplicates `import React` lines that multiple plugins may inject.
 *
 * This is a no-op on Android (AppDelegate is iOS-only).
 */
const { withAppDelegate } = require("@expo/config-plugins");

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
const withCleanAppDelegate = (config) => {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;

    // Remove any accidental duplicate RCTBridge import that can appear when
    // multiple plugins each try to inject the same import line.
    const rcBridgeImport = "import React";
    const lines = contents.split("\n");
    const seen = new Set();
    const deduped = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(rcBridgeImport) && seen.has(trimmed)) {
        return false;
      }
      if (trimmed.startsWith(rcBridgeImport)) {
        seen.add(trimmed);
      }
      return true;
    });
    contents = deduped.join("\n");

    mod.modResults.contents = contents;
    return mod;
  });
};

module.exports = withCleanAppDelegate;
