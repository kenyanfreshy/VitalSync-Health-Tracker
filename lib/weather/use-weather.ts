/**
 * useWeather hook
 *
 * Manages weather fetch lifecycle with AsyncStorage persistence.
 * Supports an optional pinned city — when set, all weather data, insights,
 * and notifications are fetched for that city instead of IP-based location.
 *
 * Cold-launch flow:
 *   1. On mount, restore pinned city + cached weather from AsyncStorage
 *   2. Silently fetch fresh data in the background
 *   3. Update UI when fresh data arrives
 *
 * Status values:
 *   - 'idle'    → nothing loaded yet
 *   - 'loading' → no cache available, fetching fresh (shows spinner)
 *   - 'stale'   → showing cached data while refresh is in progress
 *   - 'success' → fresh data available
 *   - 'error'   → fetch failed and no cache available
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  fetchWeather,
  fetchWeatherForCity,
  searchCities,
  type WeatherStatus,
  type WeatherData,
  type CityResult,
} from './weather-service';

const CACHE_KEY    = '@vitalsync/weather_cache';
const CITY_KEY     = '@vitalsync/weather_city';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface PersistedCache {
  data: WeatherData;
  savedAt: number;
}

function isCacheValid(savedAt: number): boolean {
  return Date.now() - savedAt < CACHE_TTL_MS;
}

export interface UseWeatherResult {
  weatherStatus: WeatherStatus;
  /** Manually trigger a fresh fetch, bypassing cache */
  refresh: () => Promise<void>;
  /** True while a network fetch is in progress (even background refresh) */
  isRefreshing: boolean;
  /** Currently pinned city (null = IP-based auto-detect) */
  pinnedCity: CityResult | null;
  /** Pin a city — triggers immediate fetch for that city and drives all insights */
  pinCity: (city: CityResult) => Promise<void>;
  /** Clear pinned city — reverts to IP-based auto-detect */
  clearCity: () => Promise<void>;
  /** Search cities by name query using Open-Meteo Geocoding */
  searchCitiesQuery: (query: string) => Promise<CityResult[]>;
}

export function useWeather(): UseWeatherResult {
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>({ status: 'idle' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pinnedCity, setPinnedCity] = useState<CityResult | null>(null);
  const isFetchingRef = useRef(false);
  const hasMountedRef = useRef(false);
  // Keep a ref so doFetch always sees the latest pinned city without re-creating
  const pinnedCityRef = useRef<CityResult | null>(null);

  useEffect(() => {
    pinnedCityRef.current = pinnedCity;
  }, [pinnedCity]);

  // ── Restore pinned city + cached weather on first mount ──────────────────
  // Loads cache BEFORE the first doFetch so the UI shows stale data immediately
  // instead of a spinner. The fetch is deferred until after the cache is restored.
  const cacheRestoredRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cityRaw, raw] = await Promise.all([
          AsyncStorage.getItem(CITY_KEY),
          AsyncStorage.getItem(CACHE_KEY),
        ]);
        if (cancelled) return;
        if (cityRaw) {
          const city: CityResult = JSON.parse(cityRaw);
          setPinnedCity(city);
          pinnedCityRef.current = city;
        }
        if (raw) {
          const cached: PersistedCache = JSON.parse(raw);
          // Show stale data immediately — no spinner on cold launch
          setWeatherStatus({ status: 'stale', data: cached.data });
        }
      } catch (_unused) {
        // Non-fatal — fresh fetch will follow
      } finally {
        if (!cancelled) {
          cacheRestoredRef.current = true;
          // Now trigger the background refresh
          doFetch(false);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core fetch function ──────────────────────────────────────────────────
  const doFetch = useCallback(async (force = false, cityOverride?: CityResult | null) => {
    if (isFetchingRef.current) return;

    const city = cityOverride !== undefined ? cityOverride : pinnedCityRef.current;

    // Check cache freshness (skip network if fresh and not forced)
    if (!force) {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached: PersistedCache = JSON.parse(raw);
          if (isCacheValid(cached.savedAt)) {
            setWeatherStatus({ status: 'success', data: cached.data });
            return;
          }
        }
      } catch (_unused) { /* non-fatal */ }
    }

    isFetchingRef.current = true;
    setIsRefreshing(true);

    // Keep stale data visible while fetching
    setWeatherStatus(prev =>
      prev.status === 'success' || prev.status === 'stale'
        ? { status: 'stale', data: (prev as { data: WeatherData }).data }
        : { status: 'loading' },
    );

    // Fetch for pinned city or fall back to IP-based location
    // Wrapped in try/finally so isFetchingRef and isRefreshing are always
    // reset even if the network call throws (prevents stuck pull-to-refresh).
    try {
      const result = city
        ? await fetchWeatherForCity(city)
        : await fetchWeather();

      if (result.status === 'success') {
        try {
          const toSave: PersistedCache = { data: result.data, savedAt: Date.now() };
          await safeSetItem(CACHE_KEY, JSON.stringify(toSave));
        } catch (_unused) { /* non-fatal */ }
        setWeatherStatus({ status: 'success', data: result.data });
      } else if (result.status === 'error') {
        setWeatherStatus((prev): WeatherStatus =>
          prev.status === 'stale'
            ? { status: 'success', data: (prev as { status: 'stale'; data: WeatherData }).data }
            : { status: 'error', message: result.message },
        );
      }
    } catch (_networkError) {
      // Network error: keep stale data visible, don't crash the caller
      setWeatherStatus((prev): WeatherStatus =>
        prev.status === 'stale'
          ? { status: 'success', data: (prev as { status: 'stale'; data: WeatherData }).data }
          : { status: 'error', message: 'Network request failed' },
      );
    } finally {
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, []);

  // ── Fetch on screen focus (skip first focus — handled by cache useEffect above) ──
  useFocusEffect(
    useCallback(() => {
      if (!hasMountedRef.current) {
        // First focus: cache useEffect already triggered the fetch; just mark mounted
        hasMountedRef.current = true;
      } else {
        // Subsequent focus events: refresh in background if cache is stale
        doFetch(false);
      }
    }, [doFetch]),
  );

  // ── Pin a city — drives all weather-based insights and notifications ──────
  const pinCity = useCallback(async (city: CityResult) => {
    setPinnedCity(city);
    pinnedCityRef.current = city;
    try {
      await safeSetItem(CITY_KEY, JSON.stringify(city));
      // Invalidate cache so next fetch uses the new city
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (_unused) { /* non-fatal */ }
    await doFetch(true, city);
  }, [doFetch]);

  // ── Clear pinned city — revert to IP-based auto-detect ───────────────────
  const clearCity = useCallback(async () => {
    setPinnedCity(null);
    pinnedCityRef.current = null;
    try {
      await AsyncStorage.removeItem(CITY_KEY);
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (_unused) { /* non-fatal */ }
    await doFetch(true, null);
  }, [doFetch]);

  const refresh = useCallback(() => doFetch(true), [doFetch]);

  const searchCitiesQuery = useCallback(
    (query: string) => searchCities(query),
    [],
  );

  return {
    weatherStatus,
    refresh,
    isRefreshing,
    pinnedCity,
    pinCity,
    clearCity,
    searchCitiesQuery,
  };
}
