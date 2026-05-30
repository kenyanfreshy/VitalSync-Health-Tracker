/**
 * withHealthKit.js
 *
 * Expo Config Plugin that explicitly injects HealthKit entitlements into the
 * iOS .entitlements file during EAS Managed Workflow builds.
 *
 * Why this is needed:
 *   - ios.entitlements in app.config.ts is NOT reliably written by EAS Managed
 *     Workflow when using a dynamic config (app.config.ts). The entitlements
 *     object is read by Expo CLI locally but can be silently dropped during the
 *     cloud build's prebuild step.
 *   - This plugin uses the official `withEntitlementsPlist` modifier to
 *     guarantee the keys are present in the compiled .entitlements file.
 *
 * Entitlements injected:
 *   com.apple.developer.healthkit                  = true
 *   com.apple.developer.healthkit.background-delivery = true
 *
 * Note: com.apple.developer.healthkit.access (health-records) is intentionally
 * NOT included — VitalSync does not use Clinical Health Records (FHIR) and
 * requesting it would require additional Apple review approval.
 *
 * Apple Developer Portal prerequisite (one-time, manual):
 *   Certificates, IDs & Profiles → App IDs → com.myvitalsyncclinicalhub.vitalsync
 *   → Edit → Enable "HealthKit" capability → Save
 */

const { withEntitlementsPlist } = require("@expo/config-plugins");

const withHealthKit = (config) => {
  return withEntitlementsPlist(config, (mod) => {
    // Core HealthKit access
    mod.modResults["com.apple.developer.healthkit"] = true;

    // Background delivery — allows HealthKit to wake the app for data updates
    // even when the app is not in the foreground.
    mod.modResults["com.apple.developer.healthkit.background-delivery"] = true;

    return mod;
  });
};

module.exports = withHealthKit;
