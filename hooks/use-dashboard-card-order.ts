/**
 * useDashboardCardOrder
 *
 * Manages the order of the four primary health-overview cards on the dashboard:
 *   - 'vitals'   → NeoVitalMiniCard
 *   - 'activity' → ActivityReadinessCard
 *   - 'glucose'  → GlucoseDashboardCard
 *   - 'insights' → OnDeviceInsightsCard
 *
 * NeoVitalMacroGraph (Nutrition Breakdown) is intentionally NOT draggable —
 * it always renders in its fixed position below the draggable cards.
 *
 * The order is persisted to AsyncStorage so it survives app restarts.
 * Cards are identified by string keys; the hook returns the current order
 * and a setter that also persists the new order.
 *
 * Storage key bumped to v2 to avoid conflicts with the old 3-card order.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export type DashboardCardId = 'vitals' | 'activity' | 'glucose' | 'insights';

const STORAGE_KEY = '@vsht:dashboard_card_order_v2';
const DEFAULT_ORDER: DashboardCardId[] = ['vitals', 'activity', 'glucose', 'insights'];

export function useDashboardCardOrder() {
  const [order, setOrderState] = useState<DashboardCardId[]>(DEFAULT_ORDER);
  const [hydrated, setHydrated] = useState(false);

  // Restore persisted order on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as DashboardCardId[];
            // Validate: must contain exactly the same keys as DEFAULT_ORDER
            const valid =
              parsed.length === DEFAULT_ORDER.length &&
              DEFAULT_ORDER.every(id => parsed.includes(id));
            if (valid) setOrderState(parsed);
          } catch {
            // Ignore parse errors — use default order
          }
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setOrder = useCallback((newOrder: DashboardCardId[]) => {
    setOrderState(newOrder);
    safeSetItem(STORAGE_KEY, JSON.stringify(newOrder)).catch(() => {});
  }, []);

  /**
   * Move a card from its current position to a new index.
   * Persists the new order automatically.
   */
  const moveCard = useCallback((id: DashboardCardId, toIndex: number) => {
    setOrderState(prev => {
      const next = [...prev];
      const fromIndex = next.indexOf(id);
      if (fromIndex === -1 || fromIndex === toIndex) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, id);
      safeSetItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Reset to the default order.
   */
  const resetOrder = useCallback(() => {
    setOrderState(DEFAULT_ORDER);
    safeSetItem(STORAGE_KEY, JSON.stringify(DEFAULT_ORDER)).catch(() => {});
  }, []);

  return { order, setOrder, moveCard, resetOrder, hydrated };
}
