/**
 * withNoBackgroundAudio.js
 *
 * Apple App Review Guideline 2.5.4 fix.
 *
 * The expo-audio and expo-video (supportsBackgroundPlayback) plugins both inject
 * "audio" into the UIBackgroundModes array in Info.plist. VitalSync does NOT play
 * audio in the background — it only uses the microphone for Smart Scribe transcription
 * (foreground only) and plays in-app sounds while the app is active.
 *
 * This plugin runs AFTER all other plugins and removes the "audio" entry from
 * UIBackgroundModes so the final Info.plist does not declare background audio
 * capability, satisfying Guideline 2.5.4.
 */

const { withInfoPlist } = require('@expo/config-plugins');

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @returns {import('@expo/config-plugins').ExpoConfig}
 */
function withNoBackgroundAudio(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      cfg.modResults.UIBackgroundModes = modes.filter((m) => m !== 'audio');
      // If the array is now empty, remove the key entirely to keep the plist clean
      if (cfg.modResults.UIBackgroundModes.length === 0) {
        delete cfg.modResults.UIBackgroundModes;
      }
    }
    return cfg;
  });
}

module.exports = withNoBackgroundAudio;
