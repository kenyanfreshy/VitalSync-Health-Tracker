/**
 * lang-flags.ts
 * Maps BCP-47 language codes to their representative flag emoji.
 * Used across the consent modal, settings language picker, and dashboard globe picker.
 */

export const LANG_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  fr: '🇫🇷',
  zh: '🇨🇳',
  pt: '🇧🇷',
  ar: '🇸🇦',
  hi: '🇮🇳',
  de: '🇩🇪',
  sw: '🇹🇿',
  ja: '🇯🇵',
};

/** Returns the flag emoji for a language code, or '' if unknown. */
export function getLangFlag(code: string): string {
  return LANG_FLAGS[code] ?? LANG_FLAGS[code.split('-')[0]] ?? '';
}

/** Maps BCP-47 codes to their native language names. */
export const LANG_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  zh: '中文',
  pt: 'Português',
  ar: 'العربية',
  hi: 'हिन्दी',
  de: 'Deutsch',
  sw: 'Kiswahili',
  ja: '日本語',
};

/** Returns the native name for a language code, or the code itself if unknown. */
export function getLangName(code: string): string {
  return LANG_NAMES[code] ?? LANG_NAMES[code.split('-')[0]] ?? code;
}
