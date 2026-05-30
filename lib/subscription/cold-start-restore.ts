/**
 * cold-start-restore.ts
 *
 * Pure async helper that implements the silentRestoreOnColdStart logic,
 * extracted from SubscriptionProvider so it can be unit-tested without
 * a React renderer.
 *
 * The SubscriptionProvider delegates to this function; all side-effects
 * (setState calls) are injected via the `callbacks` parameter so the
 * core logic remains testable in isolation.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createVanillaTRPCClient } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { safeSetItem } from "@/lib/safe-async-storage";
import { cancelTrialExpiryNotification } from "./trial-expiry-notification";
import { log, warn } from "@/lib/logger";

export type AccessState =
  | "loading"
  | "trial_active"
  | "subscribed"
  | "expired"
  | "unknown";

export type ProductId = string;

// ─── Storage Keys (mirrors subscription-context.tsx) ─────────────────────────

export const STORAGE_KEY_TRIAL_START = "vsht.subscription.trialStart";
export const STORAGE_KEY_EXPIRY = "vsht.subscription.expiryMs";
export const STORAGE_KEY_ACCESS_STATE = "vsht.subscription.accessState";
export const STORAGE_KEY_ACTIVE_PRODUCT = "vsht.subscription.activeProductId";
export const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

// ─── Callbacks injected by SubscriptionProvider ───────────────────────────────

export interface ColdStartCallbacks {
  setAccessState: (state: AccessState) => void;
  setSubscriptionExpiryMs: (ms: number) => void;
  setActiveProductId: (id: ProductId) => void;
  persistAccessState: (state: AccessState, expiryMs?: number | null) => Promise<void>;
}

// ─── silentRestoreOnColdStart ─────────────────────────────────────────────────

/**
 * Silently queries the server for verified subscription status after local
 * AsyncStorage state has been loaded.
 *
 * Guards:
 *  - Skips on web (no server session)
 *  - Only runs when localState is 'unknown' or 'expired'
 *  - Requires an active auth session token
 *  - 6-second timeout to avoid blocking the UI
 *  - Never throws — all failures are logged at warn level
 */
export async function silentRestoreOnColdStart(
  localState: AccessState,
  callbacks: ColdStartCallbacks,
): Promise<void> {
  if (Platform.OS === "web") return;
  if (localState !== "unknown" && localState !== "expired") return;

  try {
    const token = await Auth.getSessionToken();
    if (!token) {
      log("[Subscription] silentRestoreOnColdStart: no session token, skipping");
      return;
    }

    log("[Subscription] silentRestoreOnColdStart: querying server for verified status");
    const client = createVanillaTRPCClient();
    const result = await Promise.race([
      client.iap.getStatus.query(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getStatus timeout")), 6000),
      ),
    ]);

    if (result.hasActiveSubscription && result.expiryMs) {
      log(
        "[Subscription] silentRestoreOnColdStart: server confirms active subscription, upgrading local state",
        { expiryMs: result.expiryMs, productId: result.productId },
      );
      callbacks.setSubscriptionExpiryMs(result.expiryMs);
      if (result.productId) callbacks.setActiveProductId(result.productId as ProductId);
      callbacks.setAccessState("subscribed");
      await callbacks.persistAccessState("subscribed", result.expiryMs);
      if (result.productId) {
        await safeSetItem(STORAGE_KEY_ACTIVE_PRODUCT, result.productId);
      }
      await cancelTrialExpiryNotification();
    } else {
      log("[Subscription] silentRestoreOnColdStart: server reports no active subscription");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "getStatus timeout") {
      warn("[Subscription] silentRestoreOnColdStart timed out after 6s — skipping");
    } else {
      warn("[Subscription] silentRestoreOnColdStart failed (non-fatal):", msg);
    }
  }
}

// ─── loadPersistedState (pure logic, no React state) ─────────────────────────

export interface LoadPersistedStateResult {
  trialStart: number | null;
  expiry: number | null;
  productId: string | null;
  derivedLocalState: AccessState;
}

/**
 * Reads subscription state from AsyncStorage and derives the local AccessState
 * without touching React state. The caller (SubscriptionProvider) is responsible
 * for applying the result to React state.
 *
 * This is the pure, testable core of loadPersistedState.
 */
export async function readPersistedSubscriptionState(
  now = Date.now(),
): Promise<LoadPersistedStateResult> {
  const [storedTrialStart, storedExpiry, storedProductId] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_TRIAL_START),
    AsyncStorage.getItem(STORAGE_KEY_EXPIRY),
    AsyncStorage.getItem(STORAGE_KEY_ACTIVE_PRODUCT),
  ]);

  const trialStart = storedTrialStart ? parseInt(storedTrialStart, 10) : null;
  const expiry = storedExpiry ? parseInt(storedExpiry, 10) : null;
  const productId = storedProductId ?? null;

  const derivedLocalState: AccessState = (() => {
    if (expiry && expiry > now) return "subscribed";
    if (trialStart && trialStart + TRIAL_DURATION_MS > now) return "trial_active";
    return "unknown";
  })();

  return { trialStart, expiry, productId, derivedLocalState };
}
