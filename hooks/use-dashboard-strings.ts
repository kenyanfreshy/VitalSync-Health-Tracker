/**
 * useDashboardStrings
 *
 * Returns the dashboardStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const ds = useDashboardStrings();
 * <Text>{ds.emergencyVault}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const ds = (dashboardStrings as unknown as Record<string, typeof dashboardStrings.en>)[rawLang]
 *              ?? dashboardStrings.en;
 */
import { dashboardStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type DashboardStrings = typeof dashboardStrings.en;
export function useDashboardStrings(): DashboardStrings {
  const rawLang = useRawLang();
  return (
    (dashboardStrings as unknown as Record<string, DashboardStrings>)[rawLang] ??
    dashboardStrings.en
  );
}
