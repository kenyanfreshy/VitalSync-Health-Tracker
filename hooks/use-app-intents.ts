/**
 * useAppIntents — React hook for App Intents / Siri integration
 *
 * Handles:
 *   - Registering intents on app launch
 *   - Processing launch intents (when app is opened via Siri)
 *   - Donating interactions for Siri suggestions
 *
 * Usage in root layout:
 *   const { handleLaunchIntent } = useAppIntents();
 *
 *   useEffect(() => {
 *     handleLaunchIntent(); // Call once on mount
 *   }, []);
 */

import { useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  registerAppIntents,
  getLaunchIntent,
  donateIntentInteraction,
  getIntentDeepLinkPath,
  INTENT_REGISTRY,
} from '@/lib/app-intents/intent-registry';
import type { IntentId } from '@/lib/app-intents/intent-registry';

export interface UseAppIntentsResult {
  /** Process a launch intent (call on app mount) */
  handleLaunchIntent: () => Promise<void>;
  /** Donate an interaction to improve Siri suggestions */
  donateInteraction: (intentId: IntentId) => Promise<void>;
}

export function useAppIntents(): UseAppIntentsResult {
  const router = useRouter();

  // Register intents on mount
  useEffect(() => {
    registerAppIntents().catch(() => {
      // Non-critical — app continues normally
    });
  }, []);

  const handleLaunchIntent = useCallback(async () => {
    const intentId = await getLaunchIntent();
    if (!intentId) return;

    const intent = INTENT_REGISTRY[intentId as IntentId];
    if (!intent) return;

    // Navigate to the intent's deep-link path
    try {
      router.push(intent.deepLinkPath as Parameters<typeof router.push>[0]);
    } catch {
      // Non-critical — user can navigate manually
    }
  }, [router]);

  const donateInteraction = useCallback(async (intentId: IntentId) => {
    await donateIntentInteraction(intentId);
  }, []);

  return {
    handleLaunchIntent,
    donateInteraction,
  };
}
