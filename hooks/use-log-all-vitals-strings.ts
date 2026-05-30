/**
 * useLogAllVitalsStrings
 *
 * Returns the logAllVitalsStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const lv = useLogAllVitalsStrings();
 * <Text>{lv.title}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const lv = (logAllVitalsStrings as unknown as Record<string, typeof logAllVitalsStrings.en>)[rawLang]
 *              ?? logAllVitalsStrings.en;
 */
import { logAllVitalsStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type LogAllVitalsStrings = typeof logAllVitalsStrings.en;
export function useLogAllVitalsStrings(): LogAllVitalsStrings {
  const rawLang = useRawLang();
  return (
    (logAllVitalsStrings as unknown as Record<string, LogAllVitalsStrings>)[rawLang] ??
    logAllVitalsStrings.en
  );
}
