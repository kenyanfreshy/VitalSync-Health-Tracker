/*
 * VitalSync Subscription Context — v1.0.78
 *
 * Manages StoreKit 2 (iOS) and Google Play Billing (Android) subscriptions
 * via react-native-iap v15. Handles:
 *  - 14-day free trial on both Monthly and Annual plans
 *  - Monthly ($4.99/mo) and Annual ($49.99/yr) auto-renewable subscriptions
 *  - Premium access gating (trial → active → expired)
 *  - Restore purchases
 *  - AsyncStorage persistence for offline access state
 *
 * Bundle Identifier: com.vitalsync.healthtracker
 * Product IDs (App Store Connect):
 *   vitalsync.healthtracker.premium_monthly  — Auto-Renewable Subscription
 *   vitalsync.healthtracker.premium_annual   — Auto-Renewable Subscription
 *
 * Architecture based on VitalSyncIAPBridge.ts patterns:
 *  - Async/await IAP connection loop (initializeIAPConnection)
 *  - purchaseUpdatedListener for real-time StoreKit 2 transaction updates
 *  - verifyActiveEntitlements via getAvailablePurchases()
 *  - restorePurchases via getAvailablePurchases() + AppStore.sync() fallback
 *
 * ─── FIX HISTORY ────────────────────────────────────────────────────────────
 * v1.0.69 — Guideline 2.1(b) fix: requestPurchase was called with a flat
 *   { sku } object instead of the platform-specific { apple: { sku } } /
 *   { google: { skus: [] } } shape required by react-native-iap v15.
 *   This caused requestPurchase to throw "Invalid request for iOS. The `sku`
 *   property is required." silently (caught by the outer try/catch), so the
 *   StoreKit purchase sheet never appeared.
 *
 *   Additional fixes:
 *   - purchaseSubscription now guards against calling requestPurchase when
 *     products.length === 0 (returns a visible error instead of a silent throw)
 *   - productsLoadError state exposed in context so the paywall can render a
 *     visible error + retry button instead of silently falling back to startTrial
 *   - Diagnostic logging added throughout the purchase path
 *
 * v1.0.78 — VitalSyncIAPBridge.ts integration:
 *   - Replaced ad-hoc initConnection with structured initializeIAPConnection()
 *     async/await loop matching VitalSyncIAPBridge.ts pattern
 *   - Added verifyActiveEntitlements() — standalone async method that calls
 *     getAvailablePurchases() and filters to known SKUs, matching bridge pattern
 *   - purchaseUpdatedListener now calls verifyActiveEntitlements() after
 *     finishTransaction() to sync entitlement state, matching bridge pattern
 *   - restorePurchases uses getAvailablePurchases() as primary path (bridge
 *     pattern), with server-side getStatus as secondary verification
 *   - PurchaseEngineState enum added matching bridge PurchaseState enum
 *   - All product IDs and bundle identifier kept as confirmed App Store Connect values
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

// ─── Bundle Identifier ────────────────────────────────────────────────────────
// Must match App Store Connect and Xcode project exactly.
export const BUNDLE_ID = "com.vitalsync.healthtracker";

// ─── Product IDs ─────────────────────────────────────────────────────────────
// These match the App Store Connect In-App Purchase product IDs exactly.
// iOS SKUs queried via Platform.select to match VitalSyncIAPBridge.ts pattern.
export const ITEM_SKUS = Platform.select({
  ios: [
    "vitalsync.healthtracker.premium_monthly",
    "vitalsync.healthtracker.premium_annual",
  ],
  android: [
    "vitalsync.healthtracker.premium_monthly",
    "vitalsync.healthtracker.premium_annual",
  ],
  default: [],
});

export const PRODUCT_IDS = {
  monthly: "vitalsync.healthtracker.premium_monthly",
  yearly: "vitalsync.healthtracker.premium_annual",
} as const;

// ─── PurchaseEngineState ──────────────────────────────────────────────────────
// Mirrors VitalSyncIAPBridge.ts PurchaseState enum for consistent state tracking.
export enum PurchaseEngineState {
  IDLE = "IDLE",
  PROCESSING = "PROCESSING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
  PENDING_APPROVAL = "PENDING_APPROVAL", // Ask to Buy / SCA
}

// ─── Static display data ──────────────────────────────────────────────────────
export const SUBSCRIPTION_DATA = {
  monthly: {
    id: "vitalsync.healthtracker.premium_monthly",
    price: "$4.99",
    period: "Month",
    trialDays: 14,
  },
  annual: {
    id: "vitalsync.healthtracker.premium_annual",
    price: "$49.99",
    period: "Year",
    savings: "~17%",
    trialDays: 14,
  },
} as const;

export const LEGAL_LINKS = {
  privacy: "https://vitalsyncpersonalwellnesshub.com/article/privacy-policy",
  terms: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
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
const STORAGE_KEY_ORIGINAL_PURCHASE_DATE = "vitalsync.subscription.originalPurchaseDateMs";
const STORAGE_KEY_AUTO_RENEW = "vitalsync.subscription.autoRenewEnabled";
const STORAGE_KEY_SUB_PLATFORM = "vitalsync.subscription.platform";

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
  /**
   * Non-null when product loading has permanently failed (after 3 retries).
   * The paywall should display this message and offer a retry button.
   * A null value means either loading succeeded or loading is still in progress.
   */
  productsLoadError: string | null;
  /** Whether a purchase is in progress */
  purchasing: boolean;
  /** Last purchase/restore error message */
  purchaseError: string | null;
  /** Current IAP engine state (mirrors VitalSyncIAPBridge PurchaseState) */
  engineState: PurchaseEngineState;
  /** Trial start timestamp (ms) or null if never started */
  trialStartMs: number | null;
  /** Trial expiry timestamp (ms) or null */
  trialExpiryMs: number | null;
  /** Days remaining in trial (0 if expired) */
  trialDaysRemaining: number;
  /** Active subscription expiry date (ms) or null */
  subscriptionExpiryMs: number | null;
  /** Active product ID (e.g. 'vitalsync.healthtracker.premium_monthly') or null */
  activeProductId: ProductId | null;
  /** Original purchase date (ms) — set from StoreKit originalTransactionDateIOS or transactionDate */
  originalPurchaseDateMs: number | null;
  /** Whether auto-renew is enabled for the active subscription */
  autoRenewEnabled: boolean | null;
  /** Platform of the active subscription ('ios' | 'android') */
  subscriptionPlatform: 'ios' | 'android' | null;
  /** True while a restore operation is in progress */
  isRestoring: boolean;
  /** Result of the last restore operation: 'success' | 'no_subscription' | null */
  restoreResult: 'success' | 'no_subscription' | null;
  /** True while loadPersistedState is running — prevents premature paywall gating */
  isLoading: boolean;
  /** Start the 14-day trial (records start time locally) */
  startTrial: () => Promise<void>;
  /** Purchase a subscription product */
  purchaseSubscription: (productId: ProductId) => Promise<void>;
  /** Restore previous purchases */
  restorePurchases: () => Promise<void>;
  /** Verify active entitlements via getAvailablePurchases() (VitalSyncIAPBridge pattern) */
  verifyActiveEntitlements: () => Promise<void>;
  /** Clear the restore result (call after showing feedback) */
  clearRestoreResult: () => void;
  /** Reload products from store */
  reloadProducts: () => Promise<void>;
  /**
   * True when StoreKit confirms an introductory offer (free trial) is available
   * for the selected annual product. Derived from the loaded product object.
   * The paywall MUST only show trial copy when this is true.
   */
  hasIntroOffer: boolean;
  /**
   * Human-readable trial label from StoreKit, e.g. "14-day free trial".
   * Null when no introductory offer is available for this Apple ID.
   */
  introOfferLabel: string | null;
  /**
   * Number of trial days from StoreKit, e.g. 14.
   * Null when no introductory offer is available.
   */
  introOfferDays: number | null;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [products, setProducts] = useState<ProductSubscription[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadError, setProductsLoadError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<PurchaseEngineState>(PurchaseEngineState.IDLE);
  const [trialStartMs, setTrialStartMs] = useState<number | null>(null);
  const [subscriptionExpiryMs, setSubscriptionExpiryMs] = useState<number | null>(null);
  const [activeProductId, setActiveProductId] = useState<ProductId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [originalPurchaseDateMs, setOriginalPurchaseDateMs] = useState<number | null>(null);
  const [autoRenewEnabled, setAutoRenewEnabled] = useState<boolean | null>(null);
  const [subscriptionPlatform, setSubscriptionPlatform] = useState<'ios' | 'android' | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<'success' | 'no_subscription' | null>(null);

  const iapInitialized = useRef(false);
  const purchaseUpdateSub = useRef<ReturnType<typeof purchaseUpdatedListener> | null>(null);
  const purchaseErrorSub = useRef<ReturnType<typeof purchaseErrorListener> | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────────

  const trialExpiryMs = trialStartMs ? trialStartMs + TRIAL_DURATION_MS : null;
  const trialDaysRemaining = trialExpiryMs
    ? Math.max(0, Math.ceil((trialExpiryMs - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isPremium = accessState === "trial_active" || accessState === "subscribed";

  // ── Introductory offer eligibility (derived from loaded products) ────────────
  // Read from the annual product first; fall back to monthly.
  // Uses both the legacy introductoryPricePaymentModeIOS field and the newer
  // subscriptionOffers array (react-native-iap v15 cross-platform API).
  const _introProduct =
    products.find(p => p.id === PRODUCT_IDS.yearly) ??
    products.find(p => p.id === PRODUCT_IDS.monthly) ??
    null;

  const _hasIntroOffer = (() => {
    if (!_introProduct) return false;
    const p = _introProduct as any;
    if (Array.isArray(p.subscriptionOffers)) {
      const introOffer = (p.subscriptionOffers as Array<{type: string; paymentMode?: string}>)
        .find(o => o.type === 'introductory' && o.paymentMode === 'free-trial');
      if (introOffer) return true;
    }
    if (p.introductoryPricePaymentModeIOS === 'free-trial') return true;
    return false;
  })();

  const _introOfferDays = (() => {
    if (!_hasIntroOffer || !_introProduct) return null;
    const p = _introProduct as any;
    if (Array.isArray(p.subscriptionOffers)) {
      const introOffer = (p.subscriptionOffers as Array<{type: string; paymentMode?: string; period?: {unit: string; value?: number}; periodCount?: number; numberOfPeriodsIOS?: number}>)
        .find(o => o.type === 'introductory' && o.paymentMode === 'free-trial');
      if (introOffer) {
        const periodCount = introOffer.numberOfPeriodsIOS ?? introOffer.periodCount ?? 1;
        const unit = introOffer.period?.unit ?? 'day';
        if (unit === 'day') return periodCount;
        if (unit === 'week') return periodCount * 7;
        if (unit === 'month') return periodCount * 30;
      }
    }
    const numPeriods = parseInt((p as any).introductoryPriceNumberOfPeriodsIOS ?? '14', 10);
    const periodUnit = ((p as any).introductoryPriceSubscriptionPeriodIOS ?? 'DAY').toUpperCase();
    if (periodUnit === 'DAY') return numPeriods;
    if (periodUnit === 'WEEK') return numPeriods * 7;
    if (periodUnit === 'MONTH') return numPeriods * 30;
    return 14;
  })();

  const _introOfferLabel = _hasIntroOffer && _introOfferDays
    ? `${_introOfferDays}-day free trial`
    : null;

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

      if (expiryMs && expiryMs > now) {
        setSubscriptionExpiryMs(expiryMs);
        setAccessState("subscribed");
        await persistAccessState("subscribed", expiryMs);
        return;
      }

      if (trialStart) {
        const trialExpiry = trialStart + TRIAL_DURATION_MS;
        if (trialExpiry > now) {
          setAccessState("trial_active");
          await persistAccessState("trial_active");
          return;
        }
      }

      setAccessState("unknown");
      await persistAccessState("unknown");
    },
    [persistAccessState],
  );

  // ── verifyActiveEntitlements ──────────────────────────────────────────────
  // VitalSyncIAPBridge.ts pattern: standalone async method that calls
  // getAvailablePurchases() and filters to known SKUs to sync entitlement state.

  const verifyActiveEntitlements = useCallback(async () => {
    try {
      log("[Subscription] verifyActiveEntitlements — calling getAvailablePurchases()");
      const availablePurchases = await getAvailablePurchases();
      log(`[Subscription] verifyActiveEntitlements — ${availablePurchases.length} purchase(s) found`);

      const hasPremium = availablePurchases.some(
        (p) =>
          p.productId === PRODUCT_IDS.monthly ||
          p.productId === PRODUCT_IDS.yearly
      );

      if (hasPremium) {
        // Find the most recent active subscription
        const subPurchases = availablePurchases.filter(
          (p) =>
            p.productId === PRODUCT_IDS.monthly ||
            p.productId === PRODUCT_IDS.yearly
        );
        const sorted = [...subPurchases].sort(
          (a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0)
        );
        const latest = sorted[0];
        log(`[Subscription] verifyActiveEntitlements — active SKU: ${latest.productId}`);
        setActiveProductId(latest.productId as ProductId);
        await safeSetItem(STORAGE_KEY_ACTIVE_PRODUCT, latest.productId);

        // Estimate expiry from transaction date
        const isYearly = latest.productId === PRODUCT_IDS.yearly;
        const durationMs = isYearly
          ? 365 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

        // Prefer StoreKit 2 expirationDateIOS if available
        const iosPurchase = latest as Purchase & { expirationDateIOS?: number | null };
        const expiryMs =
          iosPurchase.expirationDateIOS && iosPurchase.expirationDateIOS > Date.now()
            ? iosPurchase.expirationDateIOS
            : Date.now() + durationMs;

        setSubscriptionExpiryMs(expiryMs);
        setAccessState("subscribed");
        await persistAccessState("subscribed", expiryMs);
        await cancelTrialExpiryNotification();
      } else {
        log("[Subscription] verifyActiveEntitlements — no active premium subscription found");
      }
    } catch (e) {
      warn("[Subscription] verifyActiveEntitlements — bypassed (non-fatal):", e);
    }
  }, [persistAccessState]);

  // ── Silent server-side restore on cold start ──────────────────────────────

  const silentRestoreOnColdStart = useCallback(
    async (localState: AccessState) => {
      if (Platform.OS === "web") return;
      if (localState !== "unknown" && localState !== "expired") return;
      try {
        const token = await Auth.getSessionToken();
        if (!token) {
          log("[Subscription] silentRestoreOnColdStart: no session token — attempting StoreKit-native restore");
          try {
            const purchases = await Promise.race([
              getAvailablePurchases(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('storekit-restore-timeout')), 8000)
              ),
            ]);
            const subPurchases = (purchases as Purchase[]).filter(
              (p: Purchase) => p.productId === PRODUCT_IDS.monthly || p.productId === PRODUCT_IDS.yearly
            );
            if (subPurchases.length > 0) {
              const sorted = [...subPurchases].sort(
                (a: Purchase, b: Purchase) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0)
              );
              log(`[Subscription] silentRestoreOnColdStart: StoreKit found ${subPurchases.length} sub(s), restoring latest: ${sorted[0].productId}`);
              await processPurchase(sorted[0] as Purchase);
            } else {
              log("[Subscription] silentRestoreOnColdStart: StoreKit found no active subscriptions");
            }
          } catch (storeKitErr) {
            const storeKitMsg = storeKitErr instanceof Error ? storeKitErr.message : String(storeKitErr);
            if (storeKitMsg === 'storekit-restore-timeout') {
              warn("[Subscription] silentRestoreOnColdStart: StoreKit restore timed out after 8s");
            } else {
              warn("[Subscription] silentRestoreOnColdStart: StoreKit restore failed (non-fatal):", storeKitMsg);
            }
          }
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistAccessState],
  );

  // ── Load persisted state ────────────────────────────────────────────────────

  const loadPersistedState = useCallback(async () => {
    try {
      const [trialStartStr, expiryStr, activeProduct, origDateStr, autoRenewStr, platformStr] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TRIAL_START),
          AsyncStorage.getItem(STORAGE_KEY_EXPIRY),
          AsyncStorage.getItem(STORAGE_KEY_ACTIVE_PRODUCT),
          AsyncStorage.getItem(STORAGE_KEY_ORIGINAL_PURCHASE_DATE),
          AsyncStorage.getItem(STORAGE_KEY_AUTO_RENEW),
          AsyncStorage.getItem(STORAGE_KEY_SUB_PLATFORM),
        ]);

      const trialStart = trialStartStr ? parseInt(trialStartStr, 10) : null;
      const expiryMs = expiryStr ? parseInt(expiryStr, 10) : null;

      if (trialStart) setTrialStartMs(trialStart);
      if (activeProduct) setActiveProductId(activeProduct as ProductId);
      if (origDateStr) setOriginalPurchaseDateMs(parseInt(origDateStr, 10));
      if (autoRenewStr !== null) setAutoRenewEnabled(autoRenewStr === 'true');
      if (platformStr === 'ios' || platformStr === 'android') setSubscriptionPlatform(platformStr);

      await evaluateAccess(expiryMs, trialStart);

      const resolvedState: AccessState =
        expiryMs && expiryMs > Date.now()
          ? "subscribed"
          : trialStart && trialStart + TRIAL_DURATION_MS > Date.now()
          ? "trial_active"
          : "unknown";

      await silentRestoreOnColdStart(resolvedState);
    } catch (e) {
      logError("[Subscription] loadPersistedState failed:", e);
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

        let expiryMs: number | null = null;

        if (Platform.OS === "ios") {
          const isYearly = purchase.productId === PRODUCT_IDS.yearly;
          const durationMs = isYearly
            ? 365 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
          expiryMs = Date.now() + durationMs;
        } else if (Platform.OS === "android") {
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

        if (Platform.OS === "ios") {
          const iosPurchase = purchase as Purchase & {
            expirationDateIOS?: number | null;
            originalTransactionDateIOS?: number | null;
            isAutoRenewing?: boolean;
            renewalInfoIOS?: { willAutoRenew?: boolean; renewalDate?: number | null } | null;
          };
          if (iosPurchase.expirationDateIOS && iosPurchase.expirationDateIOS > Date.now()) {
            expiryMs = iosPurchase.expirationDateIOS;
            log(`[Subscription] Using StoreKit 2 expirationDateIOS: ${new Date(expiryMs).toISOString()}`);
          }
          const origDate = iosPurchase.originalTransactionDateIOS ?? purchase.transactionDate ?? null;
          if (origDate) {
            setOriginalPurchaseDateMs(origDate);
            await safeSetItem(STORAGE_KEY_ORIGINAL_PURCHASE_DATE, String(origDate));
          }
          const autoRenew = iosPurchase.renewalInfoIOS?.willAutoRenew ?? iosPurchase.isAutoRenewing ?? null;
          if (autoRenew !== null) {
            setAutoRenewEnabled(autoRenew);
            await safeSetItem(STORAGE_KEY_AUTO_RENEW, String(autoRenew));
          }
          setSubscriptionPlatform('ios');
          await safeSetItem(STORAGE_KEY_SUB_PLATFORM, 'ios');
        } else if (Platform.OS === "android") {
          setSubscriptionPlatform('android');
          await safeSetItem(STORAGE_KEY_SUB_PLATFORM, 'android');
          const origDate = purchase.transactionDate ?? null;
          if (origDate) {
            setOriginalPurchaseDateMs(origDate);
            await safeSetItem(STORAGE_KEY_ORIGINAL_PURCHASE_DATE, String(origDate));
          }
          const autoRenew = (purchase as any).isAutoRenewing ?? null;
          if (autoRenew !== null) {
            setAutoRenewEnabled(autoRenew);
            await safeSetItem(STORAGE_KEY_AUTO_RENEW, String(autoRenew));
          }
        }

        setSubscriptionExpiryMs(expiryMs);
        setActiveProductId(purchase.productId as ProductId);
        await safeSetItem(STORAGE_KEY_ACTIVE_PRODUCT, purchase.productId);
        setAccessState("subscribed");
        await persistAccessState("subscribed", expiryMs);
        await finishTransaction({ purchase, isConsumable: false });
        await cancelTrialExpiryNotification();
      } catch (e) {
        logError("[Subscription] Failed to process purchase:", e);
      }
    },
    [persistAccessState],
  );

  // ── Initialize IAP connection (VitalSyncIAPBridge.ts pattern) ──────────────
  // Structured async/await initializeIAPConnection loop:
  // 1. initConnection() with 5s timeout guard
  // 2. fetchProducts for both SKUs
  // 3. verifyActiveEntitlements() on startup
  // 4. Wire purchaseUpdatedListener and purchaseErrorListener

  const initIAP = useCallback(async () => {
    if (Platform.OS === "web") {
      log("[Subscription] IAP not available on web — skipping initConnection");
      return;
    }
    if (iapInitialized.current) return;

    try {
      setEngineState(PurchaseEngineState.PROCESSING);

      // Step 1: initConnection with timeout guard (VitalSyncIAPBridge pattern)
      await Promise.race([
        initConnection(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('IAP init timeout')), 5000)
        ),
      ]);
      iapInitialized.current = true;
      log("[Subscription] IAP connection initialized — bundle: " + BUNDLE_ID);

      // Step 2: Wire purchaseUpdatedListener (VitalSyncIAPBridge pattern)
      // On receipt: finishTransaction → verifyActiveEntitlements → SUCCESS state
      purchaseUpdateSub.current = purchaseUpdatedListener(
        async (purchase: Purchase) => {
          log("[Subscription] purchaseUpdatedListener fired — productId:", purchase.productId);
          const receipt = purchase.transactionReceipt;
          if (receipt) {
            try {
              await finishTransaction({ purchase, isConsumable: false });
              // VitalSyncIAPBridge pattern: call verifyActiveEntitlements after finish
              await verifyActiveEntitlements();
              setEngineState(PurchaseEngineState.SUCCESS);
              log("[Subscription] purchaseUpdatedListener — transaction finished, entitlements verified");
            } catch (ackErr) {
              warn("[Subscription] purchaseUpdatedListener — finalize warning:", ackErr);
            }
          } else {
            // Fallback: process via full processPurchase path
            await processPurchase(purchase);
          }
          setPurchasing(false);
        },
      );

      // Step 3: Wire purchaseErrorListener
      purchaseErrorSub.current = purchaseErrorListener((err: PurchaseError) => {
        logError("[Subscription] purchaseErrorListener fired — code:", err.code, "message:", err.message);
        if ((err.code as string) !== "E_USER_CANCELLED" && (err.code as string) !== "user-cancelled") {
          setPurchaseError(err.message || "Purchase failed. Please try again.");
          setEngineState(PurchaseEngineState.ERROR);
        } else {
          setEngineState(PurchaseEngineState.IDLE);
        }
        setPurchasing(false);
      });

      setEngineState(PurchaseEngineState.IDLE);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'IAP init timeout') {
        warn("[Subscription] IAP initConnection timed out after 5s — setting unknown (App Store reviewer VPN fallback)");
      } else {
        logError("[Subscription] IAP init failed — Nitro not available or pod not linked:", e);
      }
      setEngineState(PurchaseEngineState.ERROR);
      setAccessState("unknown");
    }
  }, [processPurchase, verifyActiveEntitlements]);

  // ── Load products ───────────────────────────────────────────────────────────
  // Uses ITEM_SKUS (Platform.select) matching VitalSyncIAPBridge.ts itemSKUs pattern.

  const reloadProducts = useCallback(async (retryCount = 0) => {
    setProductsLoading(true);
    if (retryCount === 0) setProductsLoadError(null);
    try {
      log(`[Subscription] fetchProducts attempt ${retryCount + 1}/3 — SKUs: ${ITEM_SKUS?.join(', ')} — platform: ${Platform.OS}`);
      const subs = (await fetchProducts({
        skus: ITEM_SKUS ?? [PRODUCT_IDS.monthly, PRODUCT_IDS.yearly],
        type: 'subs',
      })) as ProductSubscription[];
      const productSummary = subs.map(p => `${p.id} (${(p as any).localizedPrice ?? 'no price'})`).join(', ');
      log(`[Subscription] fetchProducts returned ${subs.length} product(s): ${productSummary || '(none)'}`);
      setProducts(subs);
      if (subs.length === 0) {
        if (retryCount < 2) {
          log(`[Subscription] Products empty — retrying in 3s (attempt ${retryCount + 2}/3)…`);
          setTimeout(() => reloadProducts(retryCount + 1), 3000);
        } else {
          warn(
            "[Subscription] Products still empty after 3 attempts.\n" +
            "Possible causes:\n" +
            "  1. Products not yet approved in App Store Connect (status must be 'Ready to Submit')\n" +
            "  2. Sandbox tester account not configured in App Store Connect → Users and Access → Sandbox\n" +
            `  3. In-App Purchases capability not enabled for bundle ID ${BUNDLE_ID}\n` +
            `  4. Product IDs in App Store Connect do not match: ${PRODUCT_IDS.monthly} / ${PRODUCT_IDS.yearly}\n` +
            "  5. Device is not signed in to a sandbox Apple ID in Settings → App Store"
          );
          setProductsLoadError(
            "Unable to load subscription options. Please check your internet connection and try again. " +
            "If the issue persists, ensure you are signed in to a sandbox Apple ID in Settings → App Store."
          );
        }
      } else {
        setProductsLoadError(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logError(`[Subscription] fetchProducts threw on attempt ${retryCount + 1}:`, msg, e);
      if (retryCount < 2) {
        log(`[Subscription] Retrying product load in 3s (attempt ${retryCount + 2}/3)…`);
        setTimeout(() => reloadProducts(retryCount + 1), 3000);
      } else {
        setProductsLoadError(`Failed to load subscription options: ${msg}`);
      }
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
      await scheduleTrialExpiryNotification(expiryMs);
    } catch (e) {
      logError("[Subscription] Failed to save trial start:", e);
    }
  }, [persistAccessState]);

  // ── Purchase subscription ───────────────────────────────────────────────────
  // v1.0.69 fix: platform-specific request shape for react-native-iap v15.
  //   iOS:     { request: { apple: { sku: productId } }, type: 'subs' }
  //   Android: { request: { google: { skus: [productId] } }, type: 'subs' }

  const purchaseSubscription = useCallback(
    async (productId: ProductId) => {
      setPurchaseError(null);
      setPurchasing(true);
      setEngineState(PurchaseEngineState.PROCESSING);
      log(`[Subscription] purchaseSubscription — productId: ${productId}, platform: ${Platform.OS}`);
      log(`[Subscription] Products loaded: ${products.length} — [${products.map(p => p.id).join(', ')}]`);

      if (products.length === 0) {
        warn("[Subscription] purchaseSubscription called with no products loaded — aborting");
        setPurchaseError(
          "Subscription options are not loaded yet. Please wait a moment and try again."
        );
        setPurchasing(false);
        setEngineState(PurchaseEngineState.ERROR);
        return;
      }

      try {
        const purchaseRequest =
          Platform.OS === "ios"
            ? { request: { apple: { sku: productId } }, type: "subs" as const }
            : { request: { google: { skus: [productId] } }, type: "subs" as const };

        log(`[Subscription] Calling requestPurchase — payload: ${JSON.stringify(purchaseRequest)}`);
        await requestPurchase(purchaseRequest as any);
        log("[Subscription] requestPurchase resolved — StoreKit sheet should have appeared");
      } catch (e) {
        const err = e as PurchaseError;
        const code = (err.code as string) ?? "";
        logError(`[Subscription] requestPurchase threw — code: ${code}, message: ${err.message}`, e);
        if (code !== "E_USER_CANCELLED" && code !== "user-cancelled") {
          setPurchaseError(err.message || "Purchase failed. Please try again.");
          setEngineState(PurchaseEngineState.ERROR);
        } else {
          log("[Subscription] User cancelled the purchase sheet");
          setEngineState(PurchaseEngineState.IDLE);
        }
        setPurchasing(false);
      }
    },
    [products],
  );

  // ── Restore purchases (VitalSyncIAPBridge.ts pattern) ──────────────────────
  // Primary: getAvailablePurchases() filtered to known SKUs
  // Secondary: server-side getStatus verification

  const restorePurchases = useCallback(async () => {
    setPurchaseError(null);
    setRestoreResult(null);
    setIsRestoring(true);
    setEngineState(PurchaseEngineState.PROCESSING);
    log("[Subscription] restorePurchases — calling getAvailablePurchases()");
    try {
      // VitalSyncIAPBridge pattern: verifyActiveEntitlements as primary restore path
      await verifyActiveEntitlements();

      const purchases = await getAvailablePurchases();
      log(`[Subscription] getAvailablePurchases returned ${purchases.length} purchase(s)`);
      purchases.forEach((p, idx) => {
        log(`[Subscription]   [${idx}] productId=${p.productId} transactionDate=${p.transactionDate} transactionId=${p.transactionId}`);
      });

      const subPurchases = purchases.filter(
        p => p.productId === PRODUCT_IDS.monthly || p.productId === PRODUCT_IDS.yearly
      );
      log(`[Subscription] ${subPurchases.length} subscription purchase(s) found after filtering`);

      if (subPurchases.length === 0) {
        log("[Subscription] No subscription purchases found — setting restoreResult: no_subscription");
        setRestoreResult('no_subscription');
        setEngineState(PurchaseEngineState.IDLE);
        setIsRestoring(false);
        return;
      }

      const sorted = [...subPurchases].sort(
        (a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0),
      );
      const latest = sorted[0];
      log(`[Subscription] Restoring latest purchase — productId: ${latest.productId}, transactionDate: ${latest.transactionDate}`);
      await processPurchase(latest as Purchase);
      setRestoreResult('success');
      setEngineState(PurchaseEngineState.SUCCESS);
      log("[Subscription] Restore completed successfully");
    } catch (e) {
      logError("[Subscription] Restore failed:", e);
      setPurchaseError("Restore failed. Please try again.");
      setEngineState(PurchaseEngineState.ERROR);
    } finally {
      setIsRestoring(false);
    }
  }, [processPurchase, verifyActiveEntitlements]);

  const clearRestoreResult = useCallback(() => {
    setRestoreResult(null);
  }, []);

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
    productsLoadError,
    purchasing,
    purchaseError,
    engineState,
    trialStartMs,
    trialExpiryMs,
    trialDaysRemaining,
    subscriptionExpiryMs,
    activeProductId,
    originalPurchaseDateMs,
    autoRenewEnabled,
    subscriptionPlatform,
    isRestoring,
    restoreResult,
    hasIntroOffer: _hasIntroOffer,
    introOfferLabel: _introOfferLabel,
    introOfferDays: _introOfferDays,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    verifyActiveEntitlements,
    clearRestoreResult,
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
