/**
 * withStoreKitConfig.js
 *
 * Adds the VitalSync.storekit file to the Xcode project during expo prebuild
 * and wires it to the Debug scheme's LaunchAction so local StoreKit testing
 * works when running from Xcode.
 *
 * This plugin:
 *   1. Copies storekit/VitalSync.storekit into ios/VitalSync.storekit
 *   2. Adds the file reference to the Xcode project navigator
 *   3. Updates the Debug LaunchAction in the xcscheme to reference the file
 *
 * Release/Archive builds are unaffected (storeKitConfigurationFileReference
 * is only set on the LaunchAction, not ProfileAction or ArchiveAction).
 */
const {
  withXcodeProject,
  withDangerousMod,
  IOSConfig,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const STOREKIT_FILENAME = "VitalSync.storekit";
const STOREKIT_SOURCE = path.join(__dirname, "..", "storekit", STOREKIT_FILENAME);

/**
 * Copy the .storekit file into the ios/ directory during prebuild.
 */
const withCopyStoreKitFile = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const iosDir = mod.modRequest.platformProjectRoot;
      const dest = path.join(iosDir, STOREKIT_FILENAME);

      if (fs.existsSync(STOREKIT_SOURCE)) {
        fs.copyFileSync(STOREKIT_SOURCE, dest);
        console.log(`[withStoreKitConfig] Copied ${STOREKIT_FILENAME} to ${dest}`);
      } else {
        console.warn(
          `[withStoreKitConfig] Source file not found: ${STOREKIT_SOURCE}. ` +
            "Skipping StoreKit config copy."
        );
      }

      return mod;
    },
  ]);
};

/**
 * Add the .storekit file reference to the Xcode project.
 */
const withAddStoreKitToProject = (config) => {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName;

    // Check if already added
    const existingFiles = project.pbxFileReferenceSection();
    const alreadyAdded = Object.values(existingFiles).some(
      (ref) => ref && ref.path === `"${STOREKIT_FILENAME}"`
    );

    if (alreadyAdded) {
      console.log("[withStoreKitConfig] StoreKit file already in project, skipping.");
      return mod;
    }

    // Add file reference
    const file = project.addFile(STOREKIT_FILENAME, projectName, {
      lastKnownFileType: "text",
      sourceTree: '"<group>"',
    });

    if (file) {
      console.log("[withStoreKitConfig] Added VitalSync.storekit to Xcode project");
    }

    return mod;
  });
};

/**
 * Update the xcscheme LaunchAction to reference the StoreKit config for Debug builds.
 */
const withSchemeStoreKitRef = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const iosDir = mod.modRequest.platformProjectRoot;
      const projectName = mod.modRequest.projectName;
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

      // Add storeKitConfigurationFileReference to LaunchAction
      scheme = scheme.replace(
        /(<LaunchAction[^>]*buildConfiguration\s*=\s*"Debug"[^>]*)(>)/,
        `$1\n         storeKitConfigurationFileReference = "../${STOREKIT_FILENAME}"$2`
      );

      fs.writeFileSync(schemePath, scheme, "utf8");
      console.log("[withStoreKitConfig] Added StoreKit config reference to Debug LaunchAction");

      return mod;
    },
  ]);
};

const withStoreKitConfig = (config) => {
  config = withCopyStoreKitFile(config);
  config = withAddStoreKitToProject(config);
  config = withSchemeStoreKitRef(config);
  return config;
};

module.exports = withStoreKitConfig;
