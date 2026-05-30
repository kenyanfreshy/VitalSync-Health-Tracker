/**
 * useDashboardVisibility
 *
 * Persists a per-card visibility map to AsyncStorage so users can hide/show
 * individual dashboard sections from the Manage Dashboard screen.
 *
 * Card IDs map to the same keys used in useDashboardCardOrder plus the
 * additional section cards that are not part of the drag-to-reorder system.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const VISIBILITY_KEY = '@vsht:dashboard_visibility_v1';

export type DashboardSectionId =
  // Primary draggable cards
  | 'vitals_mini'
  | 'activity_readiness'
  | 'glucose'
  // Secondary section cards
  | 'macro_trend'
  | 'on_device_insights'
  | 'sleep_section'
  | 'nutrition_section'
  | 'clinical_section'
  | 'ice_section'
  | 'vitals_section'
  | 'weather_section'
  | 'ekg_section';

export type VisibilityMap = Record<DashboardSectionId, boolean>;

const DEFAULT_VISIBILITY: VisibilityMap = {
  vitals_mini: true,
  activity_readiness: true,
  glucose: true,
  macro_trend: true,
  on_device_insights: true,
  sleep_section: true,
  nutrition_section: true,
  clinical_section: true,
  ice_section: true,
  vitals_section: true,
  weather_section: true,
  ekg_section: true,
};

export function useDashboardVisibility() {
  const [visibility, setVisibility] = useState<VisibilityMap>(DEFAULT_VISIBILITY);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted visibility on mount
  useEffect(() => {
    AsyncStorage.getItem(VISIBILITY_KEY)
      .then(raw => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<VisibilityMap>;
          setVisibility({ ...DEFAULT_VISIBILITY, ...parsed });
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setCardVisible = useCallback((id: DashboardSectionId, visible: boolean) => {
    setVisibility(prev => {
      const next = { ...prev, [id]: visible };
      safeSetItem(VISIBILITY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const resetVisibility = useCallback(() => {
    setVisibility(DEFAULT_VISIBILITY);
    safeSetItem(VISIBILITY_KEY, JSON.stringify(DEFAULT_VISIBILITY)).catch(() => {});
  }, []);

  const isVisible = useCallback(
    (id: DashboardSectionId) => visibility[id] ?? true,
    [visibility],
  );

  return { visibility, hydrated, isVisible, setCardVisible, resetVisibility };
}
