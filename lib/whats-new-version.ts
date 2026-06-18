/**
 * Shared What's New version constants.
 *
 * Both the Tabs layout (which owns the WhatsNewSheet) and the Settings screen
 * (which shows the green dot badge and the "What's New" button) import from
 * this file so the version string and AsyncStorage key are never out of sync.
 */

/** AsyncStorage key that tracks which version the user has already seen. */
export const WHATS_NEW_SEEN_KEY = "@vsht:whatsNewSeenVersion";

/**
 * The latest release version string — must match `whatsNewV2935Strings.version`
 * in components/whats-new-sheet.tsx.
 */
export const LATEST_WHATS_NEW_VERSION = "1.0.66";
