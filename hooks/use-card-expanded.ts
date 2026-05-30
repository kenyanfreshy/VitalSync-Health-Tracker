/**
 * useCardExpanded — persists a card's expanded/collapsed state to AsyncStorage.
 *
 * Usage:
 *   const [expanded, setExpanded] = useCardExpanded('caloric-balance', false);
 *
 * The key is namespaced under "@vitalsync/card_expanded/" automatically.
 *
 * Pass `overrideExpanded` (boolean) to externally control the expanded state:
 *   - overrideExpanded === false  → force the card CLOSED (e.g., "Collapse All")
 *   - overrideExpanded === true   → allow the card to manage its own state
 *   - overrideExpanded === undefined → card fully manages its own state
 *
 * This means "Collapse All" forces every card closed, but "Expand All" only
 * un-locks the cards so they can be individually toggled — it does NOT force
 * every card open.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const NS = '@vitalsync/card_expanded/';

export function useCardExpanded(
  cardKey: string,
  defaultExpanded = false,
  overrideExpanded?: boolean,
): [boolean, (next: boolean) => void] {
  const storageKey = NS + cardKey;
  const [expanded, setExpandedState] = useState(defaultExpanded);
  const [loaded, setLoaded] = useState(false);

  // Load persisted value on mount
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (raw !== null) {
        setExpandedState(raw === 'true');
      }
      setLoaded(true);
    });
  }, [storageKey]);

  // When the parent forces a collapse (overrideExpanded === false), apply it.
  // When overrideExpanded === true, the card regains control of its own state
  // (we do NOT force it open — the user may have previously closed it).
  useEffect(() => {
    if (overrideExpanded === false) {
      setExpandedState(false);
      safeSetItem(storageKey, 'false');
    }
  }, [overrideExpanded, storageKey]);

  const setExpanded = useCallback(
    (next: boolean) => {
      setExpandedState(next);
      safeSetItem(storageKey, String(next));
    },
    [storageKey],
  );

  // If parent is forcing a collapse, honour it; otherwise use the card's own state.
  const effectiveExpanded = overrideExpanded === false ? false : (loaded ? expanded : defaultExpanded);
  return [effectiveExpanded, setExpanded];
}
