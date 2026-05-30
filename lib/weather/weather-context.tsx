/**
 * WeatherContext
 *
 * Lifts useWeather() into a React Context so the dashboard card and the
 * weather tab share a single weather state instance. When the user pins a
 * city in the weather tab, the dashboard card updates immediately without
 * requiring a tab exit / AppState foreground event.
 */
import React, { createContext, useContext } from 'react';
import { useWeather, type UseWeatherResult } from './use-weather';

const WeatherContext = createContext<UseWeatherResult | null>(null);

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const weather = useWeather();
  return (
    <WeatherContext.Provider value={weather}>
      {children}
    </WeatherContext.Provider>
  );
}

/**
 * Use the shared weather state. Must be called inside <WeatherProvider>.
 * Falls back to creating a new useWeather() instance if called outside the
 * provider (e.g., in tests) so existing code keeps working.
 */
export function useWeatherContext(): UseWeatherResult {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    // Fallback: create a standalone instance (same behaviour as before)
    // This path should not be hit in production once WeatherProvider is wired.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useWeather();
  }
  return ctx;
}
