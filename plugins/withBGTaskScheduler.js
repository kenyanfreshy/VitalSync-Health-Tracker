/**
 * withBGTaskScheduler.js
 *
 * Expo Config Plugin — injects BGTaskSchedulerPermittedIdentifiers into the
 * iOS Info.plist during EAS Managed Workflow builds.
 *
 * Why this is needed:
 *   - BGAppRefreshTaskRequest and BGProcessingTaskRequest will silently fail at
 *     runtime (BGTaskScheduler.shared.submit throws) if the task identifier is
 *     not declared in Info.plist under BGTaskSchedulerPermittedIdentifiers.
 *   - Adding the key directly to ios.infoPlist in app.config.ts works locally
 *     but can be dropped during the EAS cloud prebuild step when using a
 *     dynamic config (app.config.ts). This plugin uses the official
 *     withInfoPlist modifier to guarantee the key survives the build.
 *
 * Task identifiers registered:
 *   com.vitalsync.data.refresh   — BGAppRefreshTask: triggered by HKObserverQuery
 *                                   to run a delta-sync of all vital types.
 *
 * Apple documentation:
 *   https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler
 *
 * Xcode capability prerequisite (one-time, manual):
 *   Signing & Capabilities → + Capability → Background Modes
 *     ✓ Background fetch
 *     ✓ Background processing
 */

const { withInfoPlist } = require("@expo/config-plugins");

/** All BGTaskScheduler task identifiers used by VitalSync. */
const BG_TASK_IDENTIFIERS = [
  "com.vitalsync.data.refresh",
];

const withBGTaskScheduler = (config) => {
  return withInfoPlist(config, (mod) => {
    const plist = mod.modResults;

    // Merge with any identifiers already present (e.g., from expo-background-fetch)
    const existing = Array.isArray(plist.BGTaskSchedulerPermittedIdentifiers)
      ? plist.BGTaskSchedulerPermittedIdentifiers
      : [];

    const merged = Array.from(new Set([...existing, ...BG_TASK_IDENTIFIERS]));
    plist.BGTaskSchedulerPermittedIdentifiers = merged;

    return mod;
  });
};

module.exports = withBGTaskScheduler;
