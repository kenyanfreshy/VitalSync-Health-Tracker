/**
 * useDietDescStrings
 *
 * Returns the dietDescStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const dietDesc = useDietDescStrings();
 * <Text>{dietDesc.balanced.description}</Text>
 * <Text>{dietDesc.keto.cardSubtitle}</Text>
 * ```
 */
import { dietDescStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type DietDescStrings = typeof dietDescStrings.en;
export function useDietDescStrings(): DietDescStrings {
  const rawLang = useRawLang();
  return (
    (dietDescStrings as unknown as Record<string, DietDescStrings>)[rawLang] ??
    dietDescStrings.en
  );
}
