/**
 * useAboutStrings
 *
 * Returns the aboutStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const ab = useAboutStrings();
 * <Text>{ab.creatorBio1}</Text>
 * ```
 */
import { aboutStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type AboutStrings = typeof aboutStrings.en;
export function useAboutStrings(): AboutStrings {
  const rawLang = useRawLang();
  return (
    (aboutStrings as unknown as Record<string, AboutStrings>)[rawLang] ??
    aboutStrings.en
  );
}
