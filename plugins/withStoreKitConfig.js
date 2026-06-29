/**
 * withStoreKitConfig.js
 *
 * Adds the VitalSync.storekit file to the ios/ directory during expo prebuild
 * and wires it to the Debug scheme's LaunchAction so local StoreKit testing
 * works when running from Xcode.
 *
 * This plugin:
 *   1. Copies storekit/VitalSync.storekit into ios/VitalSync.storekit
 *   2. Updates the Debug LaunchAction in the xcscheme to reference the file
 *
 * Note: We intentionally skip adding the file to the Xcode project navigator
 * (pbxproj) because the xcode npm package's addFile() API requires the target
 * group to already exist, which is unreliable during prebuild. The scheme
 * reference is sufficient for local StoreKit testing — Xcode resolves the
 * path relative to the xcodeproj directory.
 *
 * Release/Archive builds are unaffected (storeKitConfigurationFileReference
 * is only set on the LaunchAction, not ProfileAction or ArchiveAction).
 */
const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const STOREKIT_FILENAME = "VitalSync.storekit";
const STOREKIT_SOURCE = path.join(__dirname, "..", "storekit", STOREKIT_FILENAME);

const withStoreKitConfig = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const iosDir = mod.modRequest.platformProjectRoot;
      const projectName = mod.modRequest.projectName;

      // 1. Copy the .storekit file into ios/
      const dest = path.join(iosDir, STOREKIT_FILENAME);
      if (fs.existsSync(STOREKIT_SOURCE)) {
        fs.copyFileSync(STOREKIT_SOURCE, dest);
        console.log(`[withStoreKitConfig] Copied ${STOREKIT_FILENAME} to ${dest}`);
      } else {
        console.warn(
          `[withStoreKitConfig] Source file not found: ${STOREKIT_SOURCE}. ` +
            "Skipping StoreKit config copy."
        );
        return mod;
      }

      // 2. Patch the xcscheme to reference the StoreKit config in Debug LaunchAction
      const schemePath = path.join(
        iosDir,
        `${projectName}.xcodeproj`,
        "xcshareddata",
        "xcschemes",
        `${projectName}.xcscheme`
      );

      if (!fs.existsSync(schemePath)) {
        console.warn(`[withStoreKitConfig] Scheme not found at ${schemePath}`);
        return mod;
      }

      let scheme = fs.readFileSync(schemePath, "utf8");

      // Only patch if not already patched
      if (scheme.includes("storeKitConfigurationFileReference")) {
        console.log("[withStoreKitConfig] Scheme already has StoreKit reference, skipping.");
        return mod;
      }

      // Add storeKitConfigurationFileReference to the LaunchAction element.
      // The LaunchAction for Debug builds contains buildConfiguration = "Debug".
      // We insert the attribute before the closing > of the opening LaunchAction tag.
      scheme = scheme.replace(
        /(<LaunchAction\b[^>]*buildConfiguration\s*=\s*"Debug"[^>]*?)(\s*>)/,
        `$1\n         storeKitConfigurationFileReference = "../${STOREKIT_FILENAME}"$2`
      );

      fs.writeFileSync(schemePath, scheme, "utf8");
      console.log("[withStoreKitConfig] Added StoreKit config reference to Debug LaunchAction");

      return mod;
    },
  ]);
};

module.exports = withStoreKitConfig;
