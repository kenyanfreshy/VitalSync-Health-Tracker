/**
 * Custom Expo config plugin: withLocalizedDisplayName
 *
 * Injects locale-specific InfoPlist.strings files into the iOS project at build
 * time so each language shows the correct localised app name on the home screen.
 *
 * Locales and display names:
 *   zh  → VitalSync: 临床中心
 *   es  → VitalSync: Centro Clínico
 *   fr  → VitalSync: Centre Clinique
 *
 * This runs during `eas build` (prebuild phase) and writes directly into the
 * generated Xcode project directory before compilation.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const LOCALES = [
  { code: "zh", displayName: "VitalSync: 临床中心", bundleName: "VitalSync: 临床中心" },
  { code: "es", displayName: "VitalSync: Centro Clínico", bundleName: "VitalSync: Centro Clínico" },
  { code: "fr", displayName: "VitalSync: Centre Clinique", bundleName: "VitalSync: Centre Clinique" },
];

const withLocalizedDisplayName = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName = config.modRequest.projectName ?? "VitalSync-App";

      for (const locale of LOCALES) {
        const lprojDir = path.join(projectRoot, "ios", appName, `${locale.code}.lproj`);

        // Create locale directory if it doesn't exist
        if (!fs.existsSync(lprojDir)) {
          fs.mkdirSync(lprojDir, { recursive: true });
        }

        // Write InfoPlist.strings with the localised display name
        const infoPlistStrings = path.join(lprojDir, "InfoPlist.strings");
        fs.writeFileSync(
          infoPlistStrings,
          `/* ${locale.code} localisation */\nCFBundleDisplayName = "${locale.displayName}";\nCFBundleName = "${locale.bundleName}";\n`,
          "utf8"
        );
      }

      return config;
    },
  ]);
};

module.exports = withLocalizedDisplayName;
