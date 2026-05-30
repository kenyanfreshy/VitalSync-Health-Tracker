/**
 * useDictationBoxStrings
 *
 * Returns the dictationBoxStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const db = useDictationBoxStrings();
 * <Text>{db.title}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const db = (dictationBoxStrings as unknown as Record<string, typeof dictationBoxStrings.en>)[rawLang]
 *              ?? dictationBoxStrings.en;
 */
import { dictationBoxStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type DictationBoxStrings = typeof dictationBoxStrings.en;
export function useDictationBoxStrings(): DictationBoxStrings {
  const rawLang = useRawLang();
  return (
    (dictationBoxStrings as unknown as Record<string, DictationBoxStrings>)[rawLang] ??
    dictationBoxStrings.en
  );
}
