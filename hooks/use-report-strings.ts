/**
 * useReportStrings
 *
 * Returns the reportStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const t = useReportStrings();
 * <Text>{t.title}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const t = (reportStrings as unknown as Record<string, typeof reportStrings.en>)[rawLang]
 *              ?? reportStrings.en;
 */
import { reportStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type ReportStrings = typeof reportStrings.en;
export function useReportStrings(): ReportStrings {
  const rawLang = useRawLang();
  return (
    (reportStrings as unknown as Record<string, ReportStrings>)[rawLang] ??
    reportStrings.en
  );
}
