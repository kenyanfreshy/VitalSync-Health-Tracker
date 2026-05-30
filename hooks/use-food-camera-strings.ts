/**
 * useFoodCameraStrings
 *
 * Returns the foodCameraStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const fc = useFoodCameraStrings();
 * <Text>{fc.protein}</Text>
 * ```
 *
 * This hook centralises the three-liner that was previously copy-pasted into
 * every consumer:
 *   const rawLang = useRawLang();
 *   const fc = (foodCameraStrings as unknown as Record<string, typeof foodCameraStrings.en>)[rawLang]
 *              ?? foodCameraStrings.en;
 */
import { foodCameraStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';

export type FoodCameraStrings = typeof foodCameraStrings.en;

export function useFoodCameraStrings(): FoodCameraStrings {
  const rawLang = useRawLang();
  return (
    (foodCameraStrings as unknown as Record<string, FoodCameraStrings>)[rawLang] ??
    foodCameraStrings.en
  );
}
