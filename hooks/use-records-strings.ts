/**
 * useRecordsStrings
 *
 * Returns the recordsStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const rs = useRecordsStrings();
 * <Text>{rs.title}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const rs = (recordsStrings as unknown as Record<string, typeof recordsStrings.en>)[rawLang]
 *              ?? recordsStrings.en;
 */
import { recordsStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type RecordsStrings = typeof recordsStrings.en;
export function useRecordsStrings(): RecordsStrings {
  const rawLang = useRawLang();
  return (
    (recordsStrings as unknown as Record<string, RecordsStrings>)[rawLang] ??
    recordsStrings.en
  );
}
