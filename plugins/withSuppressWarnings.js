/**
 * withSuppressWarnings.js
 *
 * Expo Config Plugin that:
 *  1. Sets GCC_TREAT_WARNINGS_AS_ERRORS = NO and SWIFT_TREAT_WARNINGS_AS_ERRORS = NO
 *     to prevent deprecated-declarations warnings from failing the EAS build.
 *  2. Sets IPHONEOS_DEPLOYMENT_TARGET = 13.0 on the main app target (required for
 *     HealthKit background delivery + BGTaskScheduler APIs).
 */

const { withXcodeProject } = require("@expo/config-plugins");

const IOS_DEPLOYMENT_TARGET = "13.0";

const withSuppressWarnings = (config) => {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;

    // ── 1 & 2: Build settings ──────────────────────────────────────────────
    const buildSettings = xcodeProject.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(buildSettings)) {
      const cfg = buildSettings[key];
      if (cfg && typeof cfg === "object" && cfg.buildSettings) {
        // Suppress warnings-as-errors
        cfg.buildSettings.GCC_TREAT_WARNINGS_AS_ERRORS = "NO";
        cfg.buildSettings.SWIFT_TREAT_WARNINGS_AS_ERRORS = "NO";
        cfg.buildSettings.GCC_WARN_ABOUT_DEPRECATED_FUNCTIONS = "NO";

        // Ensure iOS deployment target is at least 13.0 for BGTaskScheduler
        const current = cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET;
        if (
          current === undefined ||
          parseFloat(current) < parseFloat(IOS_DEPLOYMENT_TARGET)
        ) {
          cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
        }
      }
    }

    return mod;
  });
};

module.exports = withSuppressWarnings;
