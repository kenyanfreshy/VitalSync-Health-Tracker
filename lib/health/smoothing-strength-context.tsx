/**
 * smoothing-strength-context.tsx
 *
 * Global context for the user's preferred vital-sign smoothing strength.
 * Persists to AsyncStorage under SMOOTHING_STRENGTH_KEY so the preference
 * survives app restarts.
 *
 * Usage:
 *   // Wrap the app (already done in app/_layout.tsx)
 *   <SmoothingStrengthProvider>…</SmoothingStrengthProvider>
 *
 *   // Consume in any component
 *   const { strength, setStrength } = useSmoothingStrength();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  DEFAULT_STRENGTH,
  type SmoothingStrength,
} from './smooth-vitals';

// ─── Storage key ─────────────────────────────────────────────────────────────

export const SMOOTHING_STRENGTH_KEY = '@vitalsync/smoothing_strength';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SmoothingStrengthContextValue {
  /** Current smoothing strength preference. */
  strength: SmoothingStrength;
  /** Update the preference and persist it to AsyncStorage. */
  setStrength: (s: SmoothingStrength) => void;
  /** True while the initial AsyncStorage load is in progress. */
  loading: boolean;
}

const SmoothingStrengthContext = createContext<SmoothingStrengthContextValue>({
  strength: DEFAULT_STRENGTH,
  setStrength: () => {},
  loading: true,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SmoothingStrengthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [strength, setStrengthState] = useState<SmoothingStrength>(DEFAULT_STRENGTH);
  const [loading, setLoading] = useState(true);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(SMOOTHING_STRENGTH_KEY)
      .then((stored) => {
        const valid: SmoothingStrength[] = ['raw', 'light', 'standard', 'heavy'];
        if (stored && valid.includes(stored as SmoothingStrength)) {
          setStrengthState(stored as SmoothingStrength);
        }
      })
      .catch(() => {
        // Silently fall back to default on storage error
      })
      .finally(() => setLoading(false));
  }, []);

  const setStrength = useCallback((s: SmoothingStrength) => {
    setStrengthState(s);
    safeSetItem(SMOOTHING_STRENGTH_KEY, s).catch(() => {});
  }, []);

  return (
    <SmoothingStrengthContext.Provider value={{ strength, setStrength, loading }}>
      {children}
    </SmoothingStrengthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current smoothing strength preference and a setter.
 * Must be used inside <SmoothingStrengthProvider>.
 */
export function useSmoothingStrength(): SmoothingStrengthContextValue {
  return useContext(SmoothingStrengthContext);
}
