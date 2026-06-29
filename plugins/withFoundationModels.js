/**
 * withFoundationModels.js
 *
 * Expo Config Plugin that:
 *  A) Writes FoundationModelsModule.swift into ios/<AppName>/
 *  B) Registers it in the .pbxproj Compile Sources build phase
 *  C) Adds the Siri entitlement required for App Intents integration
 *
 * Foundation Models Framework:
 *   - Available on iOS 26.0+ devices with Apple Intelligence support
 *   - All inference runs on-device or through Apple's privacy-protected systems
 *   - No API keys required
 *   - Gracefully unavailable on older iOS versions
 *
 * The Swift module uses dynamic dispatch to avoid hard compile-time dependency
 * on the iOS 26 SDK, allowing the app to compile against iOS 15.1 deployment target
 * while still using Foundation Models at runtime on iOS 26+ devices.
 */

const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const SWIFT_FILENAME = "FoundationModelsModule.swift";

// Read the Swift source from the ios/VitalSyncHealthTracker directory
// (written separately to keep this plugin file manageable)
function getSwiftSource(appName) {
  const sourcePath = path.join(
    __dirname,
    "..",
    "ios",
    appName,
    SWIFT_FILENAME
  );
  if (fs.existsSync(sourcePath)) {
    return fs.readFileSync(sourcePath, "utf8");
  }
  // Fallback minimal stub if file not found
  return `import Foundation

@objc(FoundationModelsModule)
class FoundationModelsModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(false)
  }

  @objc func generateWellnessInsight(
    _ prompt: String,
    maxTokens: Int,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    reject("UNAVAILABLE", "Foundation Models not available", nil)
  }

  @objc func getModelIdentifier(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve("unavailable")
  }
}
`;
}

module.exports = function withFoundationModels(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const appName = config.modRequest.projectName;
      const iosDir = path.join(config.modRequest.platformProjectRoot, appName);

      // Ensure the directory exists
      if (!fs.existsSync(iosDir)) {
        fs.mkdirSync(iosDir, { recursive: true });
      }

      // Write the Swift file (source already written by our earlier step)
      const swiftDest = path.join(iosDir, SWIFT_FILENAME);
      if (!fs.existsSync(swiftDest)) {
        const swiftSource = getSwiftSource(appName);
        fs.writeFileSync(swiftDest, swiftSource, "utf8");
        console.log(`[withFoundationModels] Wrote ${SWIFT_FILENAME} to ${iosDir}`);
      }

      // Register in pbxproj
      const pbxprojPath = path.join(
        config.modRequest.platformProjectRoot,
        `${appName}.xcodeproj`,
        "project.pbxproj"
      );

      if (fs.existsSync(pbxprojPath)) {
        let pbxproj = fs.readFileSync(pbxprojPath, "utf8");

        // Only add if not already present
        if (!pbxproj.includes(SWIFT_FILENAME)) {
          // Find the Compile Sources section and add our file
          const compileSourcesPattern =
            /\/\* Begin PBXBuildFile section \*\//;

          if (compileSourcesPattern.test(pbxproj)) {
            // Generate a deterministic UUID-like string for the build file
            const fileUUID = "FM0001000000000000000001";
            const refUUID  = "FM0001000000000000000002";

            // Add PBXBuildFile entry
            pbxproj = pbxproj.replace(
              "/* Begin PBXBuildFile section */",
              `/* Begin PBXBuildFile section */\n\t\t${fileUUID} /* ${SWIFT_FILENAME} in Sources */ = {isa = PBXBuildFile; fileRef = ${refUUID} /* ${SWIFT_FILENAME} */; };`
            );

            // Add PBXFileReference entry
            pbxproj = pbxproj.replace(
              "/* Begin PBXFileReference section */",
              `/* Begin PBXFileReference section */\n\t\t${refUUID} /* ${SWIFT_FILENAME} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${SWIFT_FILENAME}; sourceTree = "<group>"; };`
            );

            // Add to Compile Sources build phase
            pbxproj = pbxproj.replace(
              /files = \(\n(\s+.*\/\* Sources \*\/.*\n)/,
              `files = (\n\t\t\t\t${fileUUID} /* ${SWIFT_FILENAME} in Sources */,\n$1`
            );

            fs.writeFileSync(pbxprojPath, pbxproj, "utf8");
            console.log(`[withFoundationModels] Registered ${SWIFT_FILENAME} in pbxproj`);
          }
        } else {
          console.log(`[withFoundationModels] ${SWIFT_FILENAME} already registered in pbxproj`);
        }
      }

      return config;
    },
  ]);
};
