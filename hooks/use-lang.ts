/**
 * useLang — returns the current active language and re-renders when it changes.
 *
 * Returns a `StaticLang` ("en" | "es" | "fr" | "zh") clamped from the full
 * language code so it can be safely used to index static string dictionaries.
 * Smart-translated languages (ar, sw, de, hi, …) clamp to "en" here — their
 * translations are handled by the useT() hook in lib/i18n-ai.tsx.
 *
 * Usage:
 *   const lang = useLang();
 *   const t = (settingsStrings as unknown as Record<string, typeof settingsStrings.en>)[lang];   // safe — always a StaticLang key
 */
import { useEffect, useState } from "react";
import { addLangListener, detectLang, toStaticLang, type StaticLang } from "@/lib/i18n";

export function useLang(): StaticLang {
  const [lang, setLang] = useState<StaticLang>(() => toStaticLang(detectLang()));

  useEffect(() => {
    // Sync in case the override changed before mount
    setLang(toStaticLang(detectLang()));
    // Subscribe to future changes
    const unsub = addLangListener(() => setLang(toStaticLang(detectLang())));
    return () => { unsub(); };
  }, []);

  return lang;
}

/**
 * useRawLang — returns the full language code including Smart languages.
 * Use this when you need the exact BCP-47 tag (e.g. "sw", "ar", "de").
 */
export function useRawLang(): string {
  const [lang, setLang] = useState<string>(detectLang);

  useEffect(() => {
    setLang(detectLang());
    const unsub = addLangListener(() => setLang(detectLang()));
    return () => { unsub(); };
  }, []);

  return lang;
}
