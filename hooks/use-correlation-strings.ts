/**
 * useCorrelationStrings
 *
 * Returns the correlationStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const cs = useCorrelationStrings();
 * <Text>{cs.noPatterns}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const cs = (correlationStrings as unknown as Record<string, typeof correlationStrings.en>)[rawLang]
 *              ?? correlationStrings.en;
 */
import { correlationStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type CorrelationStrings = typeof correlationStrings.en;
export function useCorrelationStrings(): CorrelationStrings {
  const rawLang = useRawLang();
  return (
    (correlationStrings as unknown as Record<string, CorrelationStrings>)[rawLang] ??
    correlationStrings.en
  );
}
