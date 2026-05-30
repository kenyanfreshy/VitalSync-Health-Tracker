/**
 * VitalSync Smart Translation System
 *
 * How it works:
 * 1. EN/ES/FR/ZH use the static i18n.ts dictionaries (instant, no network).
 * 2. Any other language (AR, PT, DE, HI, SW, …) is translated by the LLM on first use.
 * 3. Translations are cached in AsyncStorage keyed by language code so the LLM is only
 *    called once per language per device.
 * 4. The TranslationProvider broadcasts a "ready" event when the cache is loaded so all
 *    consumers re-render with the correct language.
 *
 * Usage:
 *   const t = useT(myStrings);   // myStrings is a Record<string, string> in English
 *   <Text>{t.title}</Text>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { detectLang, addLangListener } from "@/lib/i18n";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { safeSetItem } from '@/lib/safe-async-storage';
import { translateWithFallback, isFallbackAvailable } from '@/lib/translation-fallback';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnyLang = string; // BCP-47 tag, e.g. "ar", "pt", "de", "hi"

/** Languages handled by the static i18n.ts dictionaries — no LLM needed. */
export const STATIC_LANGS = new Set(["en", "es", "fr", "fr-ca", "zh", "zh-tw", "ko", "ja", "ru", "tr", "it", "nl", "pl", "pt", "de", "hi", "sw", "hy", "ar", "am", "tl", "so"]);

/** Map of language code → human-readable name for the LLM prompt. */
const LANG_NAMES: Record<string, string> = {
  ar: "Arabic",
  pt: "Portuguese",
  "pt-BR": "Brazilian Portuguese",
  de: "German",
  hi: "Hindi",
  sw: "Swahili",
  ko: "Korean",
  ja: "Japanese",
  it: "Italian",
  ru: "Russian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  ms: "Malay",
  uk: "Ukrainian",
  ro: "Romanian",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  he: "Hebrew",
  cs: "Czech",
  hu: "Hungarian",
  el: "Greek",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ur: "Urdu",
  fa: "Persian",
  am: "Amharic",
  tl: "Tagalog",
  so: "Somali",
};

export function getLangName(code: string): string {
  return LANG_NAMES[code] ?? LANG_NAMES[code.split("-")[0]] ?? code.toUpperCase();
}

// ─── AsyncStorage cache helpers ───────────────────────────────────────────────

const CACHE_PREFIX = "@vsht:ai_translation:";

async function loadCache(lang: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + lang);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch (_unused) {
    // ignore
  }
  return {};
}

async function saveCache(lang: string, data: Record<string, string>): Promise<void> {
  try {
    await safeSetItem(CACHE_PREFIX + lang, JSON.stringify(data));
  } catch (_unused) {
    // ignore
  }
}

// ─── Global translation store ─────────────────────────────────────────────────

/** Listeners notified when the active translation cache changes. */
const _translationListeners = new Set<() => void>();

function _notifyTranslationListeners() {
  _translationListeners.forEach((fn) => fn());
}

/** In-memory store: lang → (key → translated value) */
const _translationStore: Record<string, Record<string, string>> = {};

/** Whether a translation request is currently in flight for a given lang. */
const _pendingLangs = new Set<string>();

/** Whether the translation for a lang has been fully loaded from cache or LLM. */
const _readyLangs = new Set<string>();

export function addTranslationListener(fn: () => void) {
  _translationListeners.add(fn);
  return () => _translationListeners.delete(fn);
}

// ─── tRPC mutation caller (set by TranslationProvider) ───────────────────────

type TranslateFn = (args: {
  targetLang: string;
  targetLangName: string;
  strings: Record<string, string>;
}) => Promise<{ translations: Record<string, string> }>;

let _translateFn: TranslateFn | null = null;

export function _setTranslateFn(fn: TranslateFn) {
  _translateFn = fn;
}

// ─── Core translation logic ───────────────────────────────────────────────────

/**
 * Ensure translations for `lang` are loaded.
 * - If already ready: no-op.
 * - If cached in AsyncStorage: load from cache.
 * - Otherwise: call LLM (requires _translateFn to be set by TranslationProvider).
 *
 * `englishStrings` is the full flat English dictionary to translate.
 */
export async function ensureTranslations(
  lang: string,
  englishStrings: Record<string, string>,
): Promise<void> {
  if (STATIC_LANGS.has(lang)) {
    _readyLangs.add(lang);
    return;
  }
  if (_readyLangs.has(lang)) return;
  if (_pendingLangs.has(lang)) return;

  _pendingLangs.add(lang);

  try {
    // 1. Try cache first
    const cached = await loadCache(lang);
    const cachedKeys = Object.keys(cached);
    const englishKeys = Object.keys(englishStrings);

    // If cache covers ≥ 80% of keys, use it (handles minor app updates gracefully)
    if (cachedKeys.length > 0 && cachedKeys.length >= englishKeys.length * 0.8) {
      // Merge: cached values take priority; missing keys fall back to English
      _translationStore[lang] = { ...englishStrings, ...cached };
      _readyLangs.add(lang);
      _notifyTranslationListeners();
      return;
    }

    // 2. Call LLM
    if (!_translateFn) {
      // TranslationProvider not mounted yet — fall back to English
      _translationStore[lang] = { ...englishStrings };
      _readyLangs.add(lang);
      _notifyTranslationListeners();
      return;
    }

    let translations: Record<string, string>;
    try {
      const result = await _translateFn({
        targetLang: lang,
        targetLangName: getLangName(lang),
        strings: englishStrings,
      });
      translations = result.translations;
    } catch (serverErr) {
      // Server call failed — try client-side fallback (Apple Intelligence on iOS, Gemini on Android/web)
      console.warn('[VitalSync] Server translation failed, trying client fallback:', serverErr);
      if (isFallbackAvailable()) {
        try {
          translations = await translateWithFallback(englishStrings, lang, getLangName(lang));
          console.log('[VitalSync] Client fallback translation succeeded for', lang);
        } catch (fallbackErr) {
          console.warn('[VitalSync] Client fallback also failed:', fallbackErr);
          translations = { ...englishStrings };
        }
      } else {
        translations = { ...englishStrings };
      }
    }

    const merged = { ...englishStrings, ...translations };
    _translationStore[lang] = merged;
    await saveCache(lang, translations);
    _readyLangs.add(lang);
    _notifyTranslationListeners();
  } catch (_unused) {
    // Unexpected (error as Error).message — fall back to English
    _translationStore[lang] = { ...englishStrings };
    _readyLangs.add(lang);
    _notifyTranslationListeners();
  } finally {
    _pendingLangs.delete(lang);
  }
}

// ─── TranslationProvider ──────────────────────────────────────────────────────

interface TranslationContextValue {
  isTranslating: boolean;
  clearCache: (lang?: string) => Promise<void>;
  /** Kick off translation for a language code without waiting for result */
  ensureTranslations: (lang: string) => void;
}

const TranslationContext = createContext<TranslationContextValue>({
  isTranslating: false,
  clearCache: async () => {},
  ensureTranslations: () => {},
});

export function useTranslationContext() {
  return useContext(TranslationContext);
}

/**
 * Clear the AsyncStorage translation cache for a specific language (or all Smart languages).
 * Also evicts the in-memory store so the next render triggers a fresh LLM call.
 */
export async function clearTranslationCache(lang?: string): Promise<void> {
  if (lang) {
    // Clear a specific language
    try { await AsyncStorage.removeItem(CACHE_PREFIX + lang); } catch (_unused) { /* ignore */ }
    delete _translationStore[lang];
    _readyLangs.delete(lang);
  } else {
    // Clear all Smart-translated languages
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
    } catch (_unused) { /* ignore */ }
    // Evict all non-static langs from memory
    for (const l of Object.keys(_translationStore)) {
      if (!STATIC_LANGS.has(l)) {
        delete _translationStore[l];
        _readyLangs.delete(l);
      }
    }
  }
  _notifyTranslationListeners();
}

/**
 * Returns the number of AI-translated languages currently stored in AsyncStorage.
 * Used by the Settings screen to show a dynamic cache count badge.
 */
export async function getTranslationCacheCount(): Promise<number> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter(k => k.startsWith(CACHE_PREFIX)).length;
  } catch (_unused) {
    return 0;
  }
}

/**
 * Mount this once near the root (inside tRPC provider).
 * It wires up the tRPC mutation and kicks off translation whenever the language changes.
 */
export function TranslationProvider({
  children,
  allEnglishStrings,
}: {
  children: React.ReactNode;
  allEnglishStrings: Record<string, string>;
}) {
  const translateMutation = trpc.translation.translate.useMutation();
  const [isTranslating, setIsTranslating] = useState(false);

  // Wire the tRPC mutation into the global store
  useEffect(() => {
    _setTranslateFn(async (args) => {
      return translateMutation.mutateAsync(args);
    });
  }, [translateMutation]);

  const triggerTranslation = useCallback(
    async (lang: string) => {
      if (STATIC_LANGS.has(lang)) return;
      if (_readyLangs.has(lang)) return;
      setIsTranslating(true);
      await ensureTranslations(lang, allEnglishStrings);
      setIsTranslating(false);
      // Success haptic — confirms to the user that the whole app has switched language
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [allEnglishStrings],
  );

  // Translate on mount and on every language change
  useEffect(() => {
    const lang = detectLang();
    void triggerTranslation(lang);

    const unsub = addLangListener(() => {
      const newLang = detectLang();
      void triggerTranslation(newLang);
    });
    return () => { unsub(); };
  }, [triggerTranslation]);

  const handleClearCache = useCallback(async (lang?: string) => {
    await clearTranslationCache(lang);
    // Re-trigger translation for the current language
    const currentLang = detectLang();
    if (!STATIC_LANGS.has(currentLang)) {
      setIsTranslating(true);
      await ensureTranslations(currentLang, allEnglishStrings);
      setIsTranslating(false);
    }
  }, [allEnglishStrings]);

  const handleEnsureTranslations = useCallback((lang: string) => {
    void triggerTranslation(lang);
  }, [triggerTranslation]);

  return (
    <TranslationContext.Provider value={{ isTranslating, clearCache: handleClearCache, ensureTranslations: handleEnsureTranslations }}>
      {children}
    </TranslationContext.Provider>
  );
}

// ─── useT hook ────────────────────────────────────────────────────────────────

/**
 * Returns a translated version of the provided English strings record.
 *
 * - For EN/ES/FR/ZH: returns the static dictionary values (instant).
 * - For other languages: returns translated values from the LLM cache, or
 *   falls back to English while translation is in progress.
 *
 * Usage:
 *   const t = useT(myEnglishStrings);
 *   <Text>{t.title}</Text>
 *
 * Note: `myEnglishStrings` must be a stable reference (defined outside the component
 * or memoised) to avoid triggering unnecessary re-renders.
 */
export function useT<T extends Record<string, string>>(englishStrings: T): T {
  const [, forceUpdate] = useState(0);
  const langRef = useRef(detectLang());

  useEffect(() => {
    const update = () => {
      langRef.current = detectLang();
      forceUpdate((n) => n + 1);
    };

    // Re-render on language change
    const unsubLang = addLangListener(update);
    // Re-render when translation cache updates
    const unsubTranslation = addTranslationListener(update);

    return () => {
      unsubLang();
      unsubTranslation();
    };
  }, []);

  const lang = detectLang();

  // Static languages — return English strings as-is (caller uses static dict)
  if (STATIC_LANGS.has(lang)) return englishStrings;

  // Dynamic language — return from cache (or English fallback while loading)
  const cache = _translationStore[lang];
  if (!cache) {
    // Kick off translation if not already in progress
    void ensureTranslations(lang, englishStrings);
    return englishStrings;
  }

  // Build translated record, falling back to English for any missing key
  const result: Record<string, string> = {};
  for (const key of Object.keys(englishStrings)) {
    result[key] = cache[key] ?? englishStrings[key];
  }
  return result as T;
}

// ─── Utility: flatten nested string records ───────────────────────────────────

/**
 * Flatten a nested string object into a flat key→value record for batch translation.
 * e.g. { home: { title: "Home" } } → { "home.title": "Home" }
 */
export function flattenStrings(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "string") {
      result[fullKey] = val;
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(result, flattenStrings(val as Record<string, unknown>, fullKey));
    }
  }
  return result;
}
