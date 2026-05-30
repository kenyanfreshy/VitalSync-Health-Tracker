/**
 * withSentryBuildPhase.js
 *
 * Adds a Sentry "Upload Debug Symbols" shell script build phase to the Xcode project.
 * This phase runs `sentry-cli debug-files upload` after each archive build so that
 * dSYM files are uploaded to Sentry for symbolicated crash reports.
 *
 * Configuration:
 *   - SENTRY_AUTH_TOKEN must be set as an EAS secret for uploads to succeed.
 *   - EXPO_PUBLIC_SENTRY_DSN must be set as an EAS secret for the SDK to initialize.
 *   - If SENTRY_AUTH_TOKEN is absent, the phase exits 0 (non-fatal) so builds still succeed.
 *     This matches the `skipUpload: true` / `uploadSourceMaps: false` config in app.config.ts.
 *
 * Note: @sentry/react-native/expo plugin already handles most Sentry setup.
 * This plugin adds the explicit dSYM upload phase as a safety net for production builds.
 */
const { withXcodeProject } = require("@expo/config-plugins");

const SENTRY_PHASE_NAME = "Upload Debug Symbols to Sentry";

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
const withSentryBuildPhase = (config) => {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;

    // Check if the Sentry build phase already exists (idempotent)
    const buildPhases = xcodeProject.hash.project.objects["PBXShellScriptBuildPhase"] || {};
    const alreadyExists = Object.values(buildPhases).some(
      (phase) => typeof phase === "object" && phase.name === `"${SENTRY_PHASE_NAME}"`
    );

    if (alreadyExists) {
      return mod;
    }

    // Add the Sentry dSYM upload shell script build phase
    // The script is a no-op if SENTRY_AUTH_TOKEN is not set (exits 0).
    const shellScript = [
      "# Upload dSYMs to Sentry for symbolicated crash reports.",
      "# Requires SENTRY_AUTH_TOKEN to be set as an EAS secret.",
      "# Exits 0 (non-fatal) if the token is absent so CI builds still succeed.",
      "if [ -z \"$SENTRY_AUTH_TOKEN\" ]; then",
      "  echo 'SENTRY_AUTH_TOKEN not set — skipping dSYM upload.'",
      "  exit 0",
      "fi",
      "export SENTRY_ORG=vitalsync",
      "export SENTRY_PROJECT=vitalsync-health-hub",
      "${PODS_ROOT}/Sentry/sentry-cli debug-files upload --include-sources \"${DWARF_DSYM_FOLDER_PATH}\" 2>/dev/null || true",
    ].join("\\n");

    xcodeProject.addBuildPhase(
      [],
      "PBXShellScriptBuildPhase",
      SENTRY_PHASE_NAME,
      null,
      {
        shellPath: "/bin/sh",
        shellScript,
        runOnlyForDeploymentPostprocessing: 1,
      }
    );

    return mod;
  });
};

module.exports = withSentryBuildPhase;
