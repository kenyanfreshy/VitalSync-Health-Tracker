/**
 * SUPPORTED_LANGUAGES — single source of truth for the 10 supported languages.
 *
 * Rules:
 *  - This list is authoritative. Settings and Report must derive from it.
 *  - isStatic: true  → full dictionary in i18n.ts (instant, no network)
 *  - isRTL: true     → right-to-left layout required
 */

export interface SupportedLanguage {
  code: string;
  label: string;    // English name
  native: string;   // Native name
  isStatic: boolean;
  isRTL?: boolean;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: 'en', label: 'English',    native: 'English',   isStatic: true  },
  { code: 'es', label: 'Spanish',    native: 'Español',   isStatic: true  },
  { code: 'fr', label: 'French',     native: 'Français',  isStatic: true  },
  { code: 'zh', label: 'Chinese',    native: '中文',        isStatic: true  },
  { code: 'pt', label: 'Portuguese', native: 'Português', isStatic: true  },
  { code: 'ar', label: 'Arabic',     native: 'العربية',    isStatic: true, isRTL: true },
  { code: 'hi', label: 'Hindi',      native: 'हिन्दी',      isStatic: true  },
  { code: 'de', label: 'German',     native: 'Deutsch',   isStatic: true  },
  { code: 'sw', label: 'Swahili',    native: 'Kiswahili', isStatic: true  },
  { code: 'ja', label: 'Japanese',   native: '日本語',       isStatic: true  },
] as const;

/** Set of all supported language codes */
export const SUPPORTED_LANG_CODES = new Set(SUPPORTED_LANGUAGES.map(l => l.code));

/** Type union of all supported codes */
export type SupportedLangCode = typeof SUPPORTED_LANGUAGES[number]['code'];

/** Languages that use the static dictionary (no Smart translation needed) */
export const STATIC_SUPPORTED_LANGS = new Set(
  SUPPORTED_LANGUAGES.filter(l => l.isStatic).map(l => l.code)
);

/** Languages that require Smart (on-device) translation */
export const SMART_SUPPORTED_LANGS = SUPPORTED_LANGUAGES.filter(l => !l.isStatic);

/** Static-only languages as an array (for Settings static picker section) */
export const STATIC_LANG_LIST = SUPPORTED_LANGUAGES.filter(l => l.isStatic);

/** Lookup a language entry by code */
export function getSupportedLanguage(code: string): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES.find(l => l.code === code);
}

/** Get the display label for a language code (falls back to code) */
export function getSupportedLangLabel(code: string): string {
  return getSupportedLanguage(code)?.label ?? code.toUpperCase();
}

/** Get the native name for a language code */
export function getSupportedLangNative(code: string): string {
  return getSupportedLanguage(code)?.native ?? code.toUpperCase();
}
