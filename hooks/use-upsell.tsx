/**
 * useUpsell — React hook for the PremiumUpsellEngine
 *
 * Usage:
 * ```tsx
 * const { checkAndShow, UpsellSheet } = useUpsell();
 *
 * // When user adds first medication:
 * await checkAndShow('medication_first_add');
 *
 * // Render the sheet anywhere in the component tree:
 * {UpsellSheet}
 * ```
 */

import React, { useCallback, useRef, useState } from "react";
import { useSubscription } from "@/lib/subscription/subscription-context";
import {
  checkUpsell,
  markShown,
  markDismissed,
  markClicked,
  disableAllUpsells,
  type UpsellTrigger,
} from "@/lib/subscription/premium-upsell-engine";
import { UpsellBottomSheet } from "@/components/subscription/UpsellBottomSheet";

export interface UseUpsellReturn {
  /**
   * Check if the upsell should be shown for the given trigger,
   * and if so, display the bottom sheet.
   * Safe to call from any user interaction handler.
   */
  checkAndShow: (trigger: UpsellTrigger) => Promise<void>;
  /**
   * Pre-rendered UpsellBottomSheet element — render this in your component's JSX.
   */
  UpsellSheet: React.ReactElement | null;
}

export function useUpsell(): UseUpsellReturn {
  const { accessState } = useSubscription();
  const [activeTrigger, setActiveTrigger] = useState<UpsellTrigger | null>(null);
  const shownRef = useRef(false);

  const checkAndShow = useCallback(
    async (trigger: UpsellTrigger) => {
      // Map subscription accessState to engine's simplified tier
      const tier =
        accessState === "subscribed"
          ? "premium"
          : accessState === "trial_active"
          ? "trial"
          : accessState === "expired"
          ? "expired"
          : "free";

      const result = await checkUpsell(trigger, tier);
      if (!result.shouldShow) return;

      // Prevent double-show within same render cycle
      if (shownRef.current) return;
      shownRef.current = true;

      setActiveTrigger(trigger);
      await markShown(trigger);
    },
    [accessState]
  );

  const handleDismiss = useCallback(async () => {
    if (!activeTrigger) return;
    await markDismissed(activeTrigger);
    setActiveTrigger(null);
    shownRef.current = false;
  }, [activeTrigger]);

  const handleCTA = useCallback(async () => {
    if (!activeTrigger) return;
    await markClicked(activeTrigger);
    await disableAllUpsells();
    setActiveTrigger(null);
    shownRef.current = false;
  }, [activeTrigger]);

  const UpsellSheet =
    activeTrigger != null ? (
      <UpsellBottomSheet
        trigger={activeTrigger}
        visible={activeTrigger != null}
        onDismiss={handleDismiss}
        onCTA={handleCTA}
      />
    ) : null;

  return { checkAndShow, UpsellSheet };
}
