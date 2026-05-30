/**
 * useVO2Max
 *
 * Reads the most recent VO2 Max sample from Apple HealthKit
 * (HKQuantityTypeIdentifierVO2Max) on iOS.
 *
 * Returns null on Android, web, or when HealthKit is unavailable.
 * Data stays on-device — never synced externally.
 */

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export interface UseVO2MaxReturn {
  vo2max: number | null;
  isLoading: boolean;
  error: string | null;
}

export function useVO2Max(): UseVO2MaxReturn {
  const [vo2max, setVO2Max] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(Platform.OS === 'ios');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchVO2Max() {
      try {
        // Dynamic import — never loaded on Android/web
        const HK = await import('@kingstinct/react-native-healthkit').catch(() => null);
        if (!HK) {
          setIsLoading(false);
          return;
        }

        if (!HK.default.isHealthDataAvailable()) {
          setIsLoading(false);
          return;
        }

        // Query the most recent VO2 Max sample
        const samples = await HK.default.queryQuantitySamples(
          'HKQuantityTypeIdentifierVO2Max' as any,
          {
            startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // last 90 days
            endDate: new Date(),
            limit: 1,
            ascending: false,
          } as any
        );

        if (cancelled) return;

        if (samples && samples.length > 0) {
          // VO2 Max is stored in mL/kg/min
          const sample = samples[0] as any;
          const value =
            typeof sample.quantity === 'number'
              ? sample.quantity
              : typeof sample.value === 'number'
              ? sample.value
              : null;

          if (value !== null && value > 0) {
            setVO2Max(Math.round(value * 10) / 10); // round to 1 decimal
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'VO2 Max read failed');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchVO2Max();

    return () => {
      cancelled = true;
    };
  }, []);

  return { vo2max, isLoading, error };
}
