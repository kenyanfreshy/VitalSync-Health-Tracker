/**
 * withBundleURL.js
 *
 * Fixes the "No script URL provided / unsanitizedScriptURLString = (null)" crash
 * that occurs in New Architecture / Bridgeless mode when running from Xcode.
 *
 * Root cause:
 *   RCTBundleURLProvider.jsBundleURL(forBundleRoot:) performs a synchronous
 *   HTTP GET /status check (isPackagerRunning) before returning a URL.
 *   In New Arch / Bridgeless mode the runtime initialises before Metro is ready,
 *   so the check fails and the method returns nil.
 *
 * Fix:
 *   Replace the generated bundleURL() implementation with a direct URL that
 *   bypasses the packager-running check entirely. The /.expo/.virtual-metro-entry
 *   path is a Metro virtual entry that @expo/metro-config rewrites to the real
 *   expo-router/entry at bundle-request time.
 *
 * This matches the pattern used in the Expo SDK 54 expo-updates fixture:
 *   node_modules/expo-updates/e2e/fixtures/custom_init/AppDelegate.swift
 *
 * Release builds are unaffected: the #else branch returns the embedded bundle.
 */
const { withAppDelegate } = require("@expo/config-plugins");

const withBundleURL = (config) => {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;

    // Replace the generated bundleURL() that uses RCTBundleURLProvider
    // with a direct Metro URL for DEBUG builds.
    const oldPattern =
      /override func bundleURL\(\) -> URL\? \{[\s\S]*?#if DEBUG[\s\S]*?return RCTBundleURLProvider\.sharedSettings\(\)\.jsBundleURL\(forBundleRoot:.*?\)[\s\S]*?#else[\s\S]*?return Bundle\.main\.url\(forResource: "main", withExtension: "jsbundle"\)[\s\S]*?#endif[\s\S]*?\}/;

    const newImpl = `override func bundleURL() -> URL? {
#if DEBUG
    // Use a direct URL to Metro instead of RCTBundleURLProvider.jsBundleURL(forBundleRoot:).
    //
    // RCTBundleURLProvider performs a synchronous isPackagerRunning check (HTTP GET /status)
    // before returning the URL. In New Architecture / Bridgeless mode this check races
    // against Metro startup and returns nil, causing:
    //   "No script URL provided. unsanitizedScriptURLString = (null)"
    //
    // Metro port: 8081 (default Expo port, matches dev:metro script in package.json)
    return URL(string: "http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false&modulesOnly=false&runModule=true")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }`;

    if (oldPattern.test(contents)) {
      contents = contents.replace(oldPattern, newImpl);
      console.log("[withBundleURL] Replaced RCTBundleURLProvider with direct Metro URL");
    } else {
      console.warn(
        "[withBundleURL] Could not find bundleURL() pattern to replace. " +
          "The AppDelegate may already be patched or the template changed."
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};

module.exports = withBundleURL;
