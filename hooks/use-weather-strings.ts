/**
 * useWeatherStrings
 *
 * Returns the weatherStrings block for the current device language.
 * Falls back to English when the language is not yet translated.
 *
 * Usage:
 * ```tsx
 * const ws = useWeatherStrings();
 * <Text>{ws.title}</Text>
 * ```
 */
import { weatherStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
export type WeatherStrings = typeof weatherStrings.en;
export function useWeatherStrings(): WeatherStrings {
  const rawLang = useRawLang();
  return (
    (weatherStrings as unknown as Record<string, WeatherStrings>)[rawLang] ??
    weatherStrings.en
  );
}
