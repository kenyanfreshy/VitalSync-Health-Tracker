/**
 * usePaywallStrings
 *
 * Returns the paywallStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const ps = usePaywallStrings();
 * <Text>{ps.title}</Text>
 * <Text>{ps.featureDescriptions['Smart Reminders']}</Text>
 * ```
 */
import { paywallStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';

export type PaywallStrings = typeof paywallStrings.en;

export function usePaywallStrings(): PaywallStrings {
  const rawLang = useRawLang();
  return (
    (paywallStrings as unknown as Record<string, PaywallStrings>)[rawLang] ??
    paywallStrings.en
  );
}
