/**
 * VitalSync Subscription Context
 *
 * Manages StoreKit 2 (iOS) and Google Play Billing (Android) subscriptions
 * via react-native-iap v15. Handles:
 *  - 14-day free trial on both Monthly and Annual plans
 *  - Monthly ($6.99/mo) and Annual ($69.99/yr) auto-renewable subscriptions
 *  - Premium access gating (trial → active → expired)
 *  - Restore purchases
 *  - AsyncStorage persistence for offline access state
 *
 * Product IDs:
 *  iOS/Android: com.vitalsyncpersonalwellnesshub.pro.monthly, vitalsyncpersonalwellnesshub.pro.annual
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  finishTransaction,
  getAvailablePurchases,
  fetchProducts,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
  type PurchaseError,
  type ProductSubscription,
} from "react-native-iap";
import { log, error as logError, warn } from "@/lib/logger";
import { createVanillaTRPCClient } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { safeSetItem } from "@/lib/safe-async-storage";
import {
  scheduleTrialExpiryNotification,
  cancelTrialExpiryNotification,
} from "./trial-expiry-notification";

// ─── Product IDs ─────────────────────────────────────────────────────────────

export const PRODUCT_IDS = {
  monthly: "com.vitalsyncpersonalwellnesshub.pro.monthly",
  yearly: "vitalsyncpersonalwellnesshub.pro.annual",
} as const;

// ─── Static display data ──────────────────────────────────────────────────────
export const SUBSCRIPTION_DATA = {
  monthly: {
    id: "com.vitalsyncpersonalwellnesshub.pro.monthly",
    price: "$6.99",
    period: "Month",
    trialDays: 14,
  },
  annual: {
    id: "vitalsyncpersonalwellnesshub.pro.annual",
    price: "$69.99",
    period: "Year",
    savings: "16%",
    trialDays: 14,
  },
} as const;

export const LEGAL_LINKS = {
  privacy: "https://vitalsyncpersonalwellnesshub.com/article/privacy-policy",
  terms: "https://vitalsyncpersonalwellnesshub.com/article/subscription-plans?v=1",
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

// ─── Access State ─────────────────────────────────────────────────────────────

export type AccessState =
  | "loading"          // Initial load — do not gate yet
  | "trial_active"     // Within 14-day free trial
  | "subscribed"       // Active paid subscription
  | "expired"          // Trial ended, no active subscription
  | "unknown";         // IAP not available (simulator, no network)

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const STORAGE_KEY_TRIAL_START = "vitalsync.subscription.trialStart";
const STORAGE_KEY_ACCESS_STATE = "vitalsync.subscription.accessState";
const STORAGE_KEY_EXPIRY = "vitalsync.subscription.expiryMs";
const STORAGE_KEY_ACTIVE_PRODUCT = "vitalsync.subscription.activeProductId";

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ─── Context Shape ────────────────────────────────────────────────────────────

export interface SubscriptionContextValue {
  /** Current access state */
  accessState: AccessState;
  /** Whether the user has full premium access (trial or subscribed) */
  isPremium: boolean;
  /** Loaded subscription products from StoreKit/Play */
  products: ProductSubscription[];
  /** Whether products are loading */
  productsLoading: boolean;
  /** Whether a purchase is in progress */
  purchasing: boolean;
  /** Last purchase/restore error message */
  purchaseError: string | null;
  /** Trial start timestamp (ms) or null if never started */
  trialStartMs: number | null;
  /** Trial expiry timestamp (ms) or null */
  trialExpiryMs: number | null;
  /** Days remaining in trial (0 if expired) */
  trialDaysRemaining: number;
  /** Active subscription expiry date (ms) or null */
  subscriptionExpiryMs: number | null;
  /** Active product ID (e.g. 'com.vitalsyncpersonalwellnesshub.pro.monthly') or null */
  activeProductId: ProductId | null;
  /** True while loadPersistedState is running — prevents premature paywall gating */
  isLoading: boolean;
  /** Start the 14-day trial (records start time locally) */
  startTrial: () => Promise<void>;
  /** Purchase a subscription product */
  purchaseSubscription: (productId: ProductId) => Promise<void>;
  /** Restore previous purchases */
  restorePurchases: () => Promise<void>;
  /** Reload products from store */
  reloadProducts: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [products, setProducts] = useState<ProductSubscription[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [trialStartMs, setTrialStartMs] = useState<number | null>(null);
  const [subscriptionExpiryMs, setSubscriptionExpiryMs] = useState<number | null>(null);
  const [activeProductId, setActiveProductId] = useState<ProductId | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const iapInitialized = useRef(false);
  const purchaseUpdateSub = useRef<ReturnType<typeof purchaseUpdatedListener> | null>(null);
  const purchaseErrorSub = useRef<ReturnType<typeof purchaseErrorListener> | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────────

  const trialExpiryMs = trialStartMs ? trialStartMs + TRIAL_DURATION_MS : null;
  const trialDaysRemaining = trialExpiryMs
    ? Math.max(0, Math.ceil((trialExpiryMs - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isPremium = accessState === "trial_active" || accessState === "subscribed";

  // ── Persist access state ────────────────────────────────────────────────────

  const persistAccessState = useCallback(
    async (state: AccessState, expiryMs?: number | null) => {
      try {
        await safeSetItem(STORAGE_KEY_ACCESS_STATE, state);
        if (expiryMs !== undefined) {
          if (expiryMs) {
            await safeSetItem(STORAGE_KEY_EXPIRY, String(expiryMs));
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY_EXPIRY);
          }
        }
      } catch (e) {
        warn("[Subscription] Failed to persist access state:", e);
      }
    },
    [],
  );

  // ── Evaluate access from stored/live data ───────────────────────────────────

  const evaluateAccess = useCallback(
    async (expiryMs: number | null, trialStart: number | null) => {
      const now = Date.now();

      // Active subscription
      if (expiryMs && expiryMs > now) {
        setSubscriptionExpiryMs(expiryMs);
        setAccessState("subscribed");
        await persistAccessState("subscribed", expiryMs);
        return;
      }

      // Active trial
      if (trialStart) {
        const trialExpiry = trialStart + TRIAL_DURATION_MS;
        if (trialExpiry > now) {
          setAccessState("trial_active");
          await persistAccessState("trial_active");
          return;
        }
      }

      // No trial started and no subscription — fresh install or cleared data.
      // Use 'unknown' instead of 'expired' so the app does not show expired-trial
      // UI (banners, paywall flash) on first launch before the user has ever
      // started a trial. The paywall is only shown when the user explicitly taps
      // an upgrade button or when a trial has actually ended.
      setAccessState("unknown");
      await persistAccessState("unknown");
    },
    [persistAccessState],
  );

  // ── Silent server-side restore on cold start ──────────────────────────────

  /**
   * After loading local persisted state, silently query the server for the
   * verified subscription status. If the server confirms an active subscription
   * but local state is 'unknown' or 'expired' (e.g. after a reinstall, device
   * transfer, or cleared AsyncStorage), upgrade the local state to 'subscribed'
   * without requiring the user to tap "Restore Purchases".
   *
   * Guards:
   * - Only runs on iOS/Android (no server session on web)
   * - Only runs when local state is 'unknown' or 'expired'
   * - Requires an active auth session token
   * - Has a 6-second timeout to avoid blocking the UI
   * - Never throws — any failure is logged and silently ignored
   */
  const silentRestoreOnColdStart = useCallback(
    async (localState: AccessState) => {
      if (Platform.OS === "web") return;
      // Only attempt restore when local state suggests no active subscription
      if (localState !== "unknown" && localState !== "expired") return;
      try {
        // Require an authenticated session — no point calling the server otherwise
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
            setTimeout(() => reject(new Error("getStatus timeout")), 6000)
          ),
        ]);
        if (result.hasActiveSubscription && result.expiryMs) {
          log(
            "[Subscription] silentRestoreOnColdStart: server confirms active subscription, upgrading local state",
            { expiryMs: result.expiryMs, productId: result.productId },
          );
          setSubscriptionExpiryMs(result.expiryMs);
          if (result.productId) setActiveProductId(result.productId as ProductId);
          setAccessState("subscribed");
          await persistAccessState("subscribed", result.expiryMs);
          if (result.productId) {
            await safeSetItem(STORAGE_KEY_ACTIVE_PRODUCT, result.productId);
          }
          // Cancel any trial expiry notification — user has an active subscription
          await cancelTrialExpiryNotification();
        } else {
          log("[Subscription] silentRestoreOnColdStart: server reports no active subscription");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "getStatus timeout") {
          warn("[Subscription] silentRestoreOnColdStart timed out after 6s — skipping");
        } else {
          // UNAUTHORIZED (no server session) is expected on first launch — log at warn level
          warn("[Subscription] silentRestoreOnColdStart failed (non-fatal):", msg);
        }
      }
    },
    [persistAccessState],
  );

  // ── Load persisted state on mount ───────────────────────────────────────────

  const loadPersistedState = useCallback(async () => {
    try {
        const [storedTrialStart, storedExpiry, storedProductId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_TRIAL_START),
        AsyncStorage.getItem(STORAGE_KEY_EXPIRY),
        AsyncStorage.getItem(STORAGE_KEY_ACTIVE_PRODUCT),
      ]);
      const trialStart = storedTrialStart ? parseInt(storedTrialStart, 10) : null;
      const expiry = storedExpiry ? parseInt(storedExpiry, 10) : null;
      if (trialStart) setTrialStartMs(trialStart);
      if (expiry) setSubscriptionExpiryMs(expiry);
      if (storedProductId) setActiveProductId(storedProductId as ProductId);
      await evaluateAccess(expiry, trialStart);
      // After local state is resolved, silently verify with the server.
      // This handles reinstalls and device transfers without user interaction.
      // We derive the local state inline rather than reading React state
      // (which may not have flushed yet) to avoid a stale-closure race.
      const derivedLocalState: AccessState = (() => {
        const now = Date.now();
        if (expiry && expiry > now) return "subscribed";
        if (trialStart && trialStart + TRIAL_DURATION_MS > now) return "trial_active";
        return "unknown";
      })();
      // Fire-and-forget: silentRestoreOnColdStart never throws
      silentRestoreOnColdStart(derivedLocalState).catch(() => {});
    } catch (e) {
      logError("[Subscription] Failed to load persisted state:", e);
      setAccessState("unknown");
    } finally {
      setIsLoading(false);
    }
  }, [evaluateAccess, silentRestoreOnColdStart]);

  // ── Process a purchase receipt ──────────────────────────────────────────────

  const processPurchase = useCallback(
    async (purchase: Purchase) => {
      try {
        log("[Subscription] Processing purchase:", purchase.productId);

        // Determine expiry from transaction receipt
        let expiryMs: number | null = null;

        if (Platform.OS === "ios") {
          // On iOS, transactionDate + subscription period is the best we can do
          // without a server-side receipt validation. Use 30 days for monthly,
          // 365 days for yearly as a local estimate. Real validation happens
          // server-side or via StoreKit 2 in production.
          const isYearly = purchase.productId === PRODUCT_IDS.yearly;
          const durationMs = isYearly
            ? 365 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
          expiryMs = Date.now() + durationMs;
        } else if (Platform.OS === "android") {
          // Android: use purchaseStateAndroid or expiryTimeAndroid if available
          const androidPurchase = purchase as Purchase & {
            expiryTimeAndroid?: string;
          };
          if (androidPurchase.expiryTimeAndroid) {
            expiryMs = parseInt(androidPurchase.expiryTimeAndroid, 10);
          } else {
            const isYearly = purchase.productId === PRODUCT_IDS.yearly;
            expiryMs = Date.now() + (isYearly ? 365 : 30) * 24 * 60 * 60 * 1000;
          }
        }

        setSubscriptionExpiryMs(expiryMs);
        setActiveProductId(purchase.productId as ProductId);
        await safeSetItem(STORAGE_KEY_ACTIVE_PRODUCT, purchase.productId);
        setAccessState("subscribed");
        await persistAccessState("subscribed", expiryMs);
        // Acknowledge/finish the transaction
        await finishTransaction({ purchase, isConsumable: false });
        // Cancel the trial expiry reminder — user has subscribed
        await cancelTrialExpiryNotification();
      } catch (e) {
        logError("[Subscription] Failed to process purchase:", e);
      }
    },
    [persistAccessState],
  );

  // ── Initialize IAP connection ───────────────────────────────────────────────

  const initIAP = useCallback(async () => {
    // IAP is only available on iOS and Android native builds.
    // On web, or when the Nitro runtime is not yet linked (e.g. first build
    // before react-native-iap pods are installed), skip initConnection entirely
    // to prevent a Dead-on-Arrival crash that produces a white screen.
    if (Platform.OS === "web") {
      log("[Subscription] IAP not available on web — skipping initConnection");
      return;
    }
    if (iapInitialized.current) return;
    try {
      // Wrap initConnection in a 5-second timeout so a hung StoreKit/Play Billing
      // session does not freeze the app on the splash screen indefinitely.
      // 5 s is chosen specifically to accommodate Apple reviewers testing from
      // behind a corporate VPN/firewall where StoreKit may be slow to respond.
      await Promise.race([
        initConnection(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('IAP init timeout')), 5000)
        ),
      ]);
      iapInitialized.current = true;
      log("[Subscription] IAP connection initialized");

      // Clear any pending iOS transactions
      if (Platform.OS === "ios") {
        // clearTransactionIOS removed in react-native-iap v15; finishTransaction handles cleanup
      }

      // Listen for purchase updates
      purchaseUpdateSub.current = purchaseUpdatedListener(
        async (purchase: Purchase) => {
          await processPurchase(purchase);
          setPurchasing(false);
        },
      );

      purchaseErrorSub.current = purchaseErrorListener((err: PurchaseError) => {
        logError("[Subscription] Purchase error:", err);
        if ((err.code as string) !== "E_USER_CANCELLED" && (err.code as string) !== "user-cancelled") {
          setPurchaseError(err.message || "Purchase failed. Please try again.");
        }
        setPurchasing(false);
      });
    } catch (e) {
      // Covers three failure modes:
      // 1. react-native-iap pod not linked (pre-EAS build)
      // 2. Nitro runtime failed to initialise (New Architecture timing issue)
      // 3. StoreKit/Play Billing timed out (5-second guard above)
      // In all cases, set accessState to 'unknown' so the app continues normally.
      // The app is fully usable in 'unknown' state — the user can still access
      // free features and the paywall will show a "Retry" option.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'IAP init timeout') {
        warn("[Subscription] IAP initConnection timed out after 5s — setting unknown (App Store reviewer VPN fallback)");
      } else {
        logError("[Subscription] IAP init failed — Nitro not available or pod not linked:", e);
      }
      setAccessState("unknown");
    }
  }, [processPurchase]);

  // ── Load products ───────────────────────────────────────────────────────────

  const reloadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const subs = (await fetchProducts({
        skus: [PRODUCT_IDS.monthly, PRODUCT_IDS.yearly],
        type: 'subs',
      })) as ProductSubscription[];
      setProducts(subs);
      log("[Subscription] Loaded", subs.length, "products");
    } catch (e) {
      logError("[Subscription] Failed to load products:", e);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // ── Start trial ─────────────────────────────────────────────────────────────

  const startTrial = useCallback(async () => {
    const now = Date.now();
    const expiryMs = now + TRIAL_DURATION_MS;
    setTrialStartMs(now);
    setAccessState("trial_active");
    try {
      await safeSetItem(STORAGE_KEY_TRIAL_START, String(now));
      await persistAccessState("trial_active");
      log("[Subscription] Trial started at", new Date(now).toISOString());
      // Schedule a reminder 24h before trial ends
      await scheduleTrialExpiryNotification(expiryMs);
    } catch (e) {
      logError("[Subscription] Failed to save trial start:", e);
    }
  }, [persistAccessState]);

  // ── Purchase subscription ───────────────────────────────────────────────────

  const purchaseSubscription = useCallback(
    async (productId: ProductId) => {
      setPurchaseError(null);
      setPurchasing(true);
      try {
        await requestPurchase({ request: { sku: productId }, type: "subs" } as any);
        // Result handled by purchaseUpdatedListener
      } catch (e) {
        const err = e as PurchaseError;
        if ((err.code as string) !== "E_USER_CANCELLED" && (err.code as string) !== "user-cancelled") {
          setPurchaseError(err.message || "Purchase failed. Please try again.");
        }
        setPurchasing(false);
      }
    },
    [],
  );

  // ── Restore purchases ───────────────────────────────────────────────────────

  const restorePurchases = useCallback(async () => {
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const purchases = await getAvailablePurchases();
      log("[Subscription] Restoring", purchases.length, "purchases");

      if (purchases.length === 0) {
        setPurchaseError("No previous purchases found.");
        setPurchasing(false);
        return;
      }

      // Find the most recent subscription purchase
      const sorted = [...purchases].sort(
        (a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0),
      );
      const latest = sorted[0];
      if (latest) {
        await processPurchase(latest as Purchase);
      }
    } catch (e) {
      logError("[Subscription] Restore failed:", e);
      setPurchaseError("Restore failed. Please try again.");
    } finally {
      setPurchasing(false);
    }
  }, [processPurchase]);

  // ── Mount / unmount ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadPersistedState();
    initIAP().then(() => reloadProducts());

    return () => {
      purchaseUpdateSub.current?.remove();
      purchaseErrorSub.current?.remove();
    };
  }, [loadPersistedState, initIAP, reloadProducts]);

  const value: SubscriptionContextValue = {
    accessState,
    isPremium,
    isLoading,
    products,
    productsLoading,
    purchasing,
    purchaseError,
    trialStartMs,
    trialExpiryMs,
    trialDaysRemaining,
    subscriptionExpiryMs,
    activeProductId,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    reloadProducts,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}
