/**
 * withNoBackgroundAudio.js
 *
 * Apple App Review Guideline 2.5.4 fix.
 *
 * expo-audio and expo-video (supportsBackgroundPlayback:true) both inject "audio"
 * into UIBackgroundModes. VitalSync does NOT play audio in the background.
 *
 * Uses withDangerousMod to edit Info.plist on disk AFTER all other plugins run,
 * guaranteeing "audio" is absent from UIBackgroundModes in the final binary.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withNoBackgroundAudio(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectName = cfg.modRequest.projectName ?? 'VitalSyncHealthTracker';
      const infoPlistPath = path.join(
        cfg.modRequest.platformProjectRoot,
        projectName,
        'Info.plist',
      );

      if (!fs.existsSync(infoPlistPath)) {
        console.warn('[withNoBackgroundAudio] Info.plist not found at:', infoPlistPath);
        return cfg;
      }

      let contents = fs.readFileSync(infoPlistPath, 'utf8');
      const before = contents;

      // Remove <string>audio</string> from UIBackgroundModes
      contents = contents.replace(/[ \t]*<string>audio<\/string>\n?/g, '');

      // If UIBackgroundModes array is now empty, remove the entire key+array block
      contents = contents.replace(
        /<key>UIBackgroundModes<\/key>\s*<array>\s*<\/array>\s*/g,
        '',
      );

      if (contents !== before) {
        fs.writeFileSync(infoPlistPath, contents, 'utf8');
        console.log('[withNoBackgroundAudio] Removed "audio" from UIBackgroundModes');
      } else {
        console.log('[withNoBackgroundAudio] "audio" not found — nothing to remove');
      }

      return cfg;
    },
  ]);
}

module.exports = withNoBackgroundAudio;
