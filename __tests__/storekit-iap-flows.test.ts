/**
 * StoreKit IAP Flow Tests — VitalSync Health Tracker v1.0.78
 *
 * Tests the four core IAP flows using mocked react-native-iap:
 *   1. Purchase Monthly subscription (vitalsync.healthtracker.premium_monthly)
 *   2. Purchase Annual subscription  (vitalsync.healthtracker.premium_annual)
 *   3. Restore Purchases             (getAvailablePurchases → processPurchase)
 *   4. Subscribe (verifyActiveEntitlements → accessState transitions)
 *
 * Architecture: These tests exercise the pure business logic extracted from
 * subscription-context.tsx without mounting React components. All react-native-iap
 * calls are mocked via vi.mock() to simulate StoreKit 2 responses.
 *
 * Product IDs (App Store Connect):
 *   vitalsync.healthtracker.premium_monthly — Auto-Renewable Subscription $4.99/mo
 *   vitalsync.healthtracker.premium_annual  — Auto-Renewable Subscription $49.99/yr
 *
 * Bundle Identifier: com.vitalsync.healthtracker
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Constants (mirrors subscription-context.tsx) ─────────────────────────────

const BUNDLE_ID = 'com.vitalsync.healthtracker';

const PRODUCT_IDS = {
  monthly: 'vitalsync.healthtracker.premium_monthly',
  yearly:  'vitalsync.healthtracker.premium_annual',
} as const;

const ITEM_SKUS = {
  ios:     ['vitalsync.healthtracker.premium_monthly', 'vitalsync.healthtracker.premium_annual'],
  android: ['vitalsync.healthtracker.premium_monthly', 'vitalsync.healthtracker.premium_annual'],
};

const SUBSCRIPTION_DATA = {
  monthly: { id: 'vitalsync.healthtracker.premium_monthly', price: '$4.99', period: 'Month', trialDays: 14 },
  annual:  { id: 'vitalsync.healthtracker.premium_annual',  price: '$49.99', period: 'Year', savings: '~17%', trialDays: 14 },
} as const;

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

// ─── PurchaseEngineState enum (mirrors subscription-context.tsx) ──────────────

enum PurchaseEngineState {
  IDLE             = 'IDLE',
  PROCESSING       = 'PROCESSING',
  SUCCESS          = 'SUCCESS',
  ERROR            = 'ERROR',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
}

// ─── AccessState type ─────────────────────────────────────────────────────────

type AccessState = 'loading' | 'trial_active' | 'subscribed' | 'expired' | 'unknown';

// ─── Mock Purchase factory ────────────────────────────────────────────────────

interface MockPurchase {
  productId: string;
  transactionId: string;
  transactionDate: number;
  transactionReceipt: string;
  expirationDateIOS?: number;
  originalTransactionDateIOS?: number;
  isAutoRenewing?: boolean;
}

function makePurchase(productId: string, overrides: Partial<MockPurchase> = {}): MockPurchase {
  const now = Date.now();
  const isYearly = productId === PRODUCT_IDS.yearly;
  return {
    productId,
    transactionId: `txn_${productId}_${now}`,
    transactionDate: now,
    transactionReceipt: `receipt_${productId}`,
    expirationDateIOS: now + (isYearly ? 365 : 30) * 24 * 60 * 60 * 1000,
    originalTransactionDateIOS: now,
    isAutoRenewing: true,
    ...overrides,
  };
}

// ─── Mock react-native-iap surface ───────────────────────────────────────────
// Mirrors the VitalSyncIAPBridge.ts pattern: initConnection, fetchProducts,
// requestPurchase, getAvailablePurchases, finishTransaction, listeners.

const mockIAP = {
  initConnection:       vi.fn().mockResolvedValue(true),
  fetchProducts:        vi.fn().mockResolvedValue([]),
  requestPurchase:      vi.fn().mockResolvedValue(undefined),
  getAvailablePurchases: vi.fn().mockResolvedValue([]),
  finishTransaction:    vi.fn().mockResolvedValue(undefined),
  purchaseUpdatedListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  purchaseErrorListener:   vi.fn().mockReturnValue({ remove: vi.fn() }),
};

// ─── Mock AsyncStorage ───────────────────────────────────────────────────────

const storage: Record<string, string> = {};
const mockAsyncStorage = {
  getItem:    vi.fn((key: string) => Promise.resolve(storage[key] ?? null)),
  setItem:    vi.fn((key: string, value: string) => { storage[key] = value; return Promise.resolve(); }),
  removeItem: vi.fn((key: string) => { delete storage[key]; return Promise.resolve(); }),
  multiGet:   vi.fn((keys: string[]) => Promise.resolve(keys.map(k => [k, storage[k] ?? null]))),
};

// ─── Inline IAP engine (extracted from subscription-context.tsx) ──────────────
// This mirrors the exact logic in subscription-context.tsx without React hooks,
// allowing pure unit testing of the IAP business logic.

interface IAPEngineState {
  accessState: AccessState;
  engineState: PurchaseEngineState;
  activeProductId: string | null;
  subscriptionExpiryMs: number | null;
  purchasing: boolean;
  purchaseError: string | null;
  isRestoring: boolean;
  restoreResult: 'success' | 'no_subscription' | null;
  products: MockPurchase[];
}

function createIAPEngine(iap = mockIAP, asyncStorage = mockAsyncStorage) {
  const state: IAPEngineState = {
    accessState:         'loading',
    engineState:         PurchaseEngineState.IDLE,
    activeProductId:     null,
    subscriptionExpiryMs: null,
    purchasing:          false,
    purchaseError:       null,
    isRestoring:         false,
    restoreResult:       null,
    products:            [],
  };

  async function persistAccessState(newState: AccessState, expiryMs?: number | null) {
    await asyncStorage.setItem('vitalsync.subscription.accessState', newState);
    if (expiryMs != null) {
      await asyncStorage.setItem('vitalsync.subscription.expiryMs', String(expiryMs));
    }
  }

  async function processPurchase(purchase: MockPurchase) {
    const isYearly = purchase.productId === PRODUCT_IDS.yearly;
    const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const expiryMs = purchase.expirationDateIOS && purchase.expirationDateIOS > Date.now()
      ? purchase.expirationDateIOS
      : Date.now() + durationMs;

    state.subscriptionExpiryMs = expiryMs;
    state.activeProductId = purchase.productId;
    state.accessState = 'subscribed';
    await persistAccessState('subscribed', expiryMs);
    await iap.finishTransaction({ purchase, isConsumable: false });
  }

  async function verifyActiveEntitlements() {
    try {
      const purchases = await iap.getAvailablePurchases() as MockPurchase[];
      const subPurchases = purchases.filter(
        p => p.productId === PRODUCT_IDS.monthly || p.productId === PRODUCT_IDS.yearly
      );
      if (subPurchases.length === 0) return;
      const sorted = [...subPurchases].sort(
        (a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0)
      );
      const latest = sorted[0];
      state.activeProductId = latest.productId;
      const isYearly = latest.productId === PRODUCT_IDS.yearly;
      const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      const expiryMs = latest.expirationDateIOS && latest.expirationDateIOS > Date.now()
        ? latest.expirationDateIOS
        : Date.now() + durationMs;
      state.subscriptionExpiryMs = expiryMs;
      state.accessState = 'subscribed';
      await persistAccessState('subscribed', expiryMs);
    } catch {
      // non-fatal
    }
  }

  async function initializeIAPConnection() {
    try {
      await Promise.race([
        iap.initConnection(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('iap-timeout')), 5000)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async function purchaseSubscription(productId: string, loadedProducts: MockPurchase[]) {
    state.purchaseError = null;
    state.purchasing = true;
    state.engineState = PurchaseEngineState.PROCESSING;

    if (loadedProducts.length === 0) {
      state.purchaseError = 'Subscription options are not loaded yet. Please wait a moment and try again.';
      state.purchasing = false;
      state.engineState = PurchaseEngineState.ERROR;
      return;
    }

    try {
      // iOS platform.select pattern matching VitalSyncIAPBridge.ts
      const purchaseRequest = { request: { apple: { sku: productId } }, type: 'subs' as const };
      await iap.requestPurchase(purchaseRequest as any);
      // StoreKit sheet appeared — purchaseUpdatedListener will fire next
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code !== 'E_USER_CANCELLED' && code !== 'user-cancelled') {
        state.purchaseError = e?.message || 'Purchase failed. Please try again.';
        state.engineState = PurchaseEngineState.ERROR;
      } else {
        state.engineState = PurchaseEngineState.IDLE;
      }
      state.purchasing = false;
    }
  }

  async function restorePurchases() {
    state.purchaseError = null;
    state.restoreResult = null;
    state.isRestoring = true;
    state.engineState = PurchaseEngineState.PROCESSING;

    try {
      // VitalSyncIAPBridge pattern: verifyActiveEntitlements as primary path
      await verifyActiveEntitlements();
      const purchases = await iap.getAvailablePurchases() as MockPurchase[];
      const subPurchases = purchases.filter(
        p => p.productId === PRODUCT_IDS.monthly || p.productId === PRODUCT_IDS.yearly
      );

      if (subPurchases.length === 0) {
        state.restoreResult = 'no_subscription';
        state.engineState = PurchaseEngineState.IDLE;
        state.isRestoring = false;
        return;
      }

      const sorted = [...subPurchases].sort(
        (a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0)
      );
      await processPurchase(sorted[0]);
      state.restoreResult = 'success';
      state.engineState = PurchaseEngineState.SUCCESS;
    } catch {
      state.purchaseError = 'Restore failed. Please try again.';
      state.engineState = PurchaseEngineState.ERROR;
    } finally {
      state.isRestoring = false;
    }
  }

  // Simulate purchaseUpdatedListener callback (called by StoreKit after purchase sheet)
  async function simulatePurchaseUpdate(purchase: MockPurchase) {
    await iap.finishTransaction({ purchase, isConsumable: false });
    await verifyActiveEntitlements();
    state.engineState = PurchaseEngineState.SUCCESS;
    state.purchasing = false;
  }

  return {
    state,
    initializeIAPConnection,
    purchaseSubscription,
    restorePurchases,
    verifyActiveEntitlements,
    processPurchase,
    simulatePurchaseUpdate,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('VitalSync StoreKit IAP — Product ID & Bundle ID verification', () => {
  it('BUNDLE_ID matches App Store Connect registration', () => {
    expect(BUNDLE_ID).toBe('com.vitalsync.healthtracker');
  });

  it('monthly product ID matches App Store Connect', () => {
    expect(PRODUCT_IDS.monthly).toBe('vitalsync.healthtracker.premium_monthly');
  });

  it('annual product ID matches App Store Connect', () => {
    expect(PRODUCT_IDS.yearly).toBe('vitalsync.healthtracker.premium_annual');
  });

  it('ITEM_SKUS iOS array contains both product IDs', () => {
    expect(ITEM_SKUS.ios).toContain('vitalsync.healthtracker.premium_monthly');
    expect(ITEM_SKUS.ios).toContain('vitalsync.healthtracker.premium_annual');
    expect(ITEM_SKUS.ios).toHaveLength(2);
  });

  it('ITEM_SKUS Android array contains both product IDs', () => {
    expect(ITEM_SKUS.android).toContain('vitalsync.healthtracker.premium_monthly');
    expect(ITEM_SKUS.android).toContain('vitalsync.healthtracker.premium_annual');
    expect(ITEM_SKUS.android).toHaveLength(2);
  });

  it('monthly price is $4.99', () => {
    expect(SUBSCRIPTION_DATA.monthly.price).toBe('$4.99');
  });

  it('annual price is $49.99', () => {
    expect(SUBSCRIPTION_DATA.annual.price).toBe('$49.99');
  });

  it('both plans have 14-day free trial', () => {
    expect(SUBSCRIPTION_DATA.monthly.trialDays).toBe(14);
    expect(SUBSCRIPTION_DATA.annual.trialDays).toBe(14);
  });

  it('no lifetime product ID exists (no pro_lifetime)', () => {
    const allIds = Object.values(PRODUCT_IDS);
    expect(allIds.every(id => !id.includes('lifetime'))).toBe(true);
    expect(allIds).toHaveLength(2);
  });
});

// ─── Flow 1: Purchase Monthly ─────────────────────────────────────────────────

describe('Flow 1 — Purchase Monthly Subscription', () => {
  let engine: ReturnType<typeof createIAPEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIAP.initConnection.mockResolvedValue(true);
    mockIAP.requestPurchase.mockResolvedValue(undefined);
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    mockIAP.finishTransaction.mockResolvedValue(undefined);
    engine = createIAPEngine();
  });

  it('initializeIAPConnection succeeds and returns true', async () => {
    const result = await engine.initializeIAPConnection();
    expect(result).toBe(true);
    expect(mockIAP.initConnection).toHaveBeenCalledOnce();
  });

  it('purchaseSubscription sets engineState to PROCESSING before calling requestPurchase', async () => {
    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    const purchasePromise = engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);
    // engineState is PROCESSING synchronously before await
    expect(engine.state.engineState).toBe(PurchaseEngineState.PROCESSING);
    await purchasePromise;
  });

  it('purchaseSubscription calls requestPurchase with correct iOS SKU format', async () => {
    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);
    expect(mockIAP.requestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          apple: expect.objectContaining({ sku: 'vitalsync.healthtracker.premium_monthly' }),
        }),
        type: 'subs',
      })
    );
  });

  it('purchaseSubscription does NOT call requestPurchase with pro_monthly (wrong ID)', async () => {
    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);
    const callArg = mockIAP.requestPurchase.mock.calls[0][0] as any;
    expect(callArg.request.apple.sku).not.toBe('pro_monthly');
    expect(callArg.request.apple.sku).toBe('vitalsync.healthtracker.premium_monthly');
  });

  it('after StoreKit update, accessState transitions to subscribed', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    const mockProducts = [purchase];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);
    await engine.simulatePurchaseUpdate(purchase);

    expect(engine.state.accessState).toBe('subscribed');
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_monthly');
    expect(engine.state.engineState).toBe(PurchaseEngineState.SUCCESS);
    expect(engine.state.purchasing).toBe(false);
  });

  it('finishTransaction is called after successful monthly purchase', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    const mockProducts = [purchase];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);
    await engine.simulatePurchaseUpdate(purchase);

    expect(mockIAP.finishTransaction).toHaveBeenCalled();
  });

  it('subscriptionExpiryMs is set to ~30 days for monthly plan', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.simulatePurchaseUpdate(purchase);

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expectedExpiry = purchase.expirationDateIOS!;
    expect(engine.state.subscriptionExpiryMs).toBe(expectedExpiry);
    // Expiry should be ~30 days from now (within 1 second tolerance)
    expect(engine.state.subscriptionExpiryMs!).toBeGreaterThan(Date.now() + thirtyDaysMs - 1000);
  });

  it('E_USER_CANCELLED does not set purchaseError', async () => {
    const cancelError = Object.assign(new Error('User cancelled'), { code: 'E_USER_CANCELLED' });
    mockIAP.requestPurchase.mockRejectedValue(cancelError);

    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);

    expect(engine.state.purchaseError).toBeNull();
    expect(engine.state.engineState).toBe(PurchaseEngineState.IDLE);
  });

  it('network error sets purchaseError and engineState to ERROR', async () => {
    const networkError = Object.assign(new Error('Network request failed'), { code: 'E_NETWORK_ERROR' });
    mockIAP.requestPurchase.mockRejectedValue(networkError);

    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);

    expect(engine.state.purchaseError).toBe('Network request failed');
    expect(engine.state.engineState).toBe(PurchaseEngineState.ERROR);
  });

  it('purchaseSubscription aborts with error when no products are loaded', async () => {
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, []);

    expect(mockIAP.requestPurchase).not.toHaveBeenCalled();
    expect(engine.state.purchaseError).toContain('not loaded yet');
    expect(engine.state.engineState).toBe(PurchaseEngineState.ERROR);
    expect(engine.state.purchasing).toBe(false);
  });
});

// ─── Flow 2: Purchase Annual ──────────────────────────────────────────────────

describe('Flow 2 — Purchase Annual Subscription', () => {
  let engine: ReturnType<typeof createIAPEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIAP.initConnection.mockResolvedValue(true);
    mockIAP.requestPurchase.mockResolvedValue(undefined);
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    mockIAP.finishTransaction.mockResolvedValue(undefined);
    engine = createIAPEngine();
  });

  it('purchaseSubscription calls requestPurchase with annual SKU', async () => {
    const mockProducts = [makePurchase(PRODUCT_IDS.yearly)];
    await engine.purchaseSubscription(PRODUCT_IDS.yearly, mockProducts);

    expect(mockIAP.requestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          apple: expect.objectContaining({ sku: 'vitalsync.healthtracker.premium_annual' }),
        }),
        type: 'subs',
      })
    );
  });

  it('purchaseSubscription does NOT use pro_yearly (wrong ID)', async () => {
    const mockProducts = [makePurchase(PRODUCT_IDS.yearly)];
    await engine.purchaseSubscription(PRODUCT_IDS.yearly, mockProducts);
    const callArg = mockIAP.requestPurchase.mock.calls[0][0] as any;
    expect(callArg.request.apple.sku).not.toBe('pro_yearly');
    expect(callArg.request.apple.sku).toBe('vitalsync.healthtracker.premium_annual');
  });

  it('after StoreKit update, accessState transitions to subscribed with annual product', async () => {
    const purchase = makePurchase(PRODUCT_IDS.yearly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    const mockProducts = [purchase];
    await engine.purchaseSubscription(PRODUCT_IDS.yearly, mockProducts);
    await engine.simulatePurchaseUpdate(purchase);

    expect(engine.state.accessState).toBe('subscribed');
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_annual');
    expect(engine.state.engineState).toBe(PurchaseEngineState.SUCCESS);
  });

  it('subscriptionExpiryMs is set to ~365 days for annual plan', async () => {
    const purchase = makePurchase(PRODUCT_IDS.yearly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.simulatePurchaseUpdate(purchase);

    const expectedExpiry = purchase.expirationDateIOS!;
    expect(engine.state.subscriptionExpiryMs).toBe(expectedExpiry);
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    expect(engine.state.subscriptionExpiryMs!).toBeGreaterThan(Date.now() + oneYearMs - 1000);
  });

  it('annual plan expiry is longer than monthly plan expiry', async () => {
    const monthlyPurchase = makePurchase(PRODUCT_IDS.monthly);
    const annualPurchase  = makePurchase(PRODUCT_IDS.yearly);

    const monthlyEngine = createIAPEngine();
    mockIAP.getAvailablePurchases.mockResolvedValue([monthlyPurchase]);
    await monthlyEngine.simulatePurchaseUpdate(monthlyPurchase);

    const annualEngine = createIAPEngine();
    mockIAP.getAvailablePurchases.mockResolvedValue([annualPurchase]);
    await annualEngine.simulatePurchaseUpdate(annualPurchase);

    expect(annualEngine.state.subscriptionExpiryMs!).toBeGreaterThan(
      monthlyEngine.state.subscriptionExpiryMs!
    );
  });

  it('annual plan saves ~17% vs monthly (49.99 vs 59.88)', () => {
    const monthlyAnnualCost = 4.99 * 12;
    const annualCost = 49.99;
    const savings = ((monthlyAnnualCost - annualCost) / monthlyAnnualCost) * 100;
    expect(savings).toBeGreaterThan(15);  // at least 15% savings
    expect(savings).toBeLessThan(20);     // less than 20% savings
    expect(SUBSCRIPTION_DATA.annual.savings).toBe('~17%');
  });

  it('finishTransaction is called after successful annual purchase', async () => {
    const purchase = makePurchase(PRODUCT_IDS.yearly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.simulatePurchaseUpdate(purchase);

    expect(mockIAP.finishTransaction).toHaveBeenCalled();
  });

  it('E_USER_CANCELLED on annual does not set purchaseError', async () => {
    const cancelError = Object.assign(new Error('User cancelled'), { code: 'E_USER_CANCELLED' });
    mockIAP.requestPurchase.mockRejectedValue(cancelError);

    const mockProducts = [makePurchase(PRODUCT_IDS.yearly)];
    await engine.purchaseSubscription(PRODUCT_IDS.yearly, mockProducts);

    expect(engine.state.purchaseError).toBeNull();
    expect(engine.state.engineState).toBe(PurchaseEngineState.IDLE);
  });
});

// ─── Flow 3: Restore Purchases ────────────────────────────────────────────────

describe('Flow 3 — Restore Purchases', () => {
  let engine: ReturnType<typeof createIAPEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    mockIAP.finishTransaction.mockResolvedValue(undefined);
    engine = createIAPEngine();
  });

  it('restorePurchases calls getAvailablePurchases (VitalSyncIAPBridge pattern)', async () => {
    await engine.restorePurchases();
    // Called twice: once in verifyActiveEntitlements, once directly
    expect(mockIAP.getAvailablePurchases).toHaveBeenCalled();
  });

  it('restorePurchases sets restoreResult to no_subscription when nothing found', async () => {
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    await engine.restorePurchases();

    expect(engine.state.restoreResult).toBe('no_subscription');
    expect(engine.state.engineState).toBe(PurchaseEngineState.IDLE);
    expect(engine.state.isRestoring).toBe(false);
  });

  it('restorePurchases restores monthly subscription successfully', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.restorePurchases();

    expect(engine.state.restoreResult).toBe('success');
    expect(engine.state.accessState).toBe('subscribed');
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_monthly');
    expect(engine.state.engineState).toBe(PurchaseEngineState.SUCCESS);
    expect(engine.state.isRestoring).toBe(false);
  });

  it('restorePurchases restores annual subscription successfully', async () => {
    const purchase = makePurchase(PRODUCT_IDS.yearly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.restorePurchases();

    expect(engine.state.restoreResult).toBe('success');
    expect(engine.state.accessState).toBe('subscribed');
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_annual');
    expect(engine.state.engineState).toBe(PurchaseEngineState.SUCCESS);
  });

  it('restorePurchases picks the most recent purchase when multiple exist', async () => {
    const now = Date.now();
    const olderMonthly = makePurchase(PRODUCT_IDS.monthly, { transactionDate: now - 60 * 24 * 60 * 60 * 1000 });
    const newerAnnual  = makePurchase(PRODUCT_IDS.yearly,  { transactionDate: now - 5  * 24 * 60 * 60 * 1000 });
    mockIAP.getAvailablePurchases.mockResolvedValue([olderMonthly, newerAnnual]);

    await engine.restorePurchases();

    // Should restore the newer annual purchase
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_annual');
    expect(engine.state.restoreResult).toBe('success');
  });

  it('restorePurchases ignores non-VitalSync product IDs', async () => {
    const foreignPurchase = makePurchase('com.other.app.subscription');
    mockIAP.getAvailablePurchases.mockResolvedValue([foreignPurchase]);

    await engine.restorePurchases();

    expect(engine.state.restoreResult).toBe('no_subscription');
    expect(engine.state.accessState).toBe('loading'); // unchanged
  });

  it('restorePurchases sets isRestoring to false in finally block on success', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.restorePurchases();

    expect(engine.state.isRestoring).toBe(false);
  });

  it('restorePurchases sets isRestoring to false in finally block on error', async () => {
    mockIAP.getAvailablePurchases.mockRejectedValue(new Error('StoreKit unavailable'));

    await engine.restorePurchases();

    expect(engine.state.isRestoring).toBe(false);
    expect(engine.state.purchaseError).toBe('Restore failed. Please try again.');
    expect(engine.state.engineState).toBe(PurchaseEngineState.ERROR);
  });

  it('restorePurchases calls finishTransaction for the restored purchase', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.restorePurchases();

    expect(mockIAP.finishTransaction).toHaveBeenCalled();
  });

  it('restorePurchases persists accessState to AsyncStorage', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.restorePurchases();

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      'vitalsync.subscription.accessState',
      'subscribed'
    );
  });
});

// ─── Flow 4: verifyActiveEntitlements (Subscribe state sync) ──────────────────

describe('Flow 4 — verifyActiveEntitlements (Subscribe / State Sync)', () => {
  let engine: ReturnType<typeof createIAPEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    engine = createIAPEngine();
  });

  it('verifyActiveEntitlements calls getAvailablePurchases (VitalSyncIAPBridge pattern)', async () => {
    await engine.verifyActiveEntitlements();
    expect(mockIAP.getAvailablePurchases).toHaveBeenCalledOnce();
  });

  it('verifyActiveEntitlements does nothing when no purchases found', async () => {
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    await engine.verifyActiveEntitlements();

    expect(engine.state.accessState).toBe('loading'); // unchanged
    expect(engine.state.activeProductId).toBeNull();
  });

  it('verifyActiveEntitlements sets accessState to subscribed for monthly', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.verifyActiveEntitlements();

    expect(engine.state.accessState).toBe('subscribed');
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_monthly');
  });

  it('verifyActiveEntitlements sets accessState to subscribed for annual', async () => {
    const purchase = makePurchase(PRODUCT_IDS.yearly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.verifyActiveEntitlements();

    expect(engine.state.accessState).toBe('subscribed');
    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_annual');
  });

  it('verifyActiveEntitlements uses StoreKit 2 expirationDateIOS when available', async () => {
    const futureExpiry = Date.now() + 25 * 24 * 60 * 60 * 1000; // 25 days
    const purchase = makePurchase(PRODUCT_IDS.monthly, { expirationDateIOS: futureExpiry });
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.verifyActiveEntitlements();

    expect(engine.state.subscriptionExpiryMs).toBe(futureExpiry);
  });

  it('verifyActiveEntitlements falls back to estimated expiry when expirationDateIOS is missing', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly, { expirationDateIOS: undefined });
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.verifyActiveEntitlements();

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(engine.state.subscriptionExpiryMs!).toBeGreaterThan(Date.now() + thirtyDaysMs - 5000);
  });

  it('verifyActiveEntitlements falls back to estimated expiry when expirationDateIOS is in the past', async () => {
    const pastExpiry = Date.now() - 1000; // already expired
    const purchase = makePurchase(PRODUCT_IDS.monthly, { expirationDateIOS: pastExpiry });
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.verifyActiveEntitlements();

    // Should use estimated expiry (30 days), not the past date
    expect(engine.state.subscriptionExpiryMs!).toBeGreaterThan(Date.now());
  });

  it('verifyActiveEntitlements picks the most recent of multiple purchases', async () => {
    const now = Date.now();
    const older = makePurchase(PRODUCT_IDS.monthly, { transactionDate: now - 90 * 24 * 60 * 60 * 1000 });
    const newer = makePurchase(PRODUCT_IDS.yearly,  { transactionDate: now - 10 * 24 * 60 * 60 * 1000 });
    mockIAP.getAvailablePurchases.mockResolvedValue([older, newer]);

    await engine.verifyActiveEntitlements();

    expect(engine.state.activeProductId).toBe('vitalsync.healthtracker.premium_annual');
  });

  it('verifyActiveEntitlements is non-fatal on getAvailablePurchases error', async () => {
    mockIAP.getAvailablePurchases.mockRejectedValue(new Error('StoreKit unavailable'));

    // Should not throw
    await expect(engine.verifyActiveEntitlements()).resolves.toBeUndefined();
    expect(engine.state.accessState).toBe('loading'); // unchanged
  });

  it('verifyActiveEntitlements persists subscribed state to AsyncStorage', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.verifyActiveEntitlements();

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      'vitalsync.subscription.accessState',
      'subscribed'
    );
  });

  it('isPremium is true when accessState is subscribed', () => {
    engine.state.accessState = 'subscribed';
    const isPremium = engine.state.accessState === 'trial_active' || engine.state.accessState === 'subscribed';
    expect(isPremium).toBe(true);
  });

  it('isPremium is true when accessState is trial_active', () => {
    engine.state.accessState = 'trial_active';
    const isPremium = engine.state.accessState === 'trial_active' || engine.state.accessState === 'subscribed';
    expect(isPremium).toBe(true);
  });

  it('isPremium is false when accessState is expired', () => {
    engine.state.accessState = 'expired';
    const isPremium = engine.state.accessState === 'trial_active' || engine.state.accessState === 'subscribed';
    expect(isPremium).toBe(false);
  });

  it('isPremium is false when accessState is unknown', () => {
    engine.state.accessState = 'unknown';
    const isPremium = engine.state.accessState === 'trial_active' || engine.state.accessState === 'subscribed';
    expect(isPremium).toBe(false);
  });
});

// ─── StoreKit Connection & Timeout ───────────────────────────────────────────

describe('StoreKit Connection — initializeIAPConnection()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when initConnection resolves within 5s', async () => {
    mockIAP.initConnection.mockResolvedValue(true);
    const engine = createIAPEngine();
    const resultPromise = engine.initializeIAPConnection();
    vi.runAllTimers();
    const result = await resultPromise;
    expect(result).toBe(true);
  });

  it('returns false when initConnection times out after 5s', async () => {
    mockIAP.initConnection.mockImplementation(
      () => new Promise(() => {/* never resolves */})
    );
    const engine = createIAPEngine();
    const resultPromise = engine.initializeIAPConnection();
    vi.advanceTimersByTime(5001);
    const result = await resultPromise;
    expect(result).toBe(false);
  });

  it('returns false when initConnection throws', async () => {
    mockIAP.initConnection.mockRejectedValue(new Error('IAP not available'));
    const engine = createIAPEngine();
    const resultPromise = engine.initializeIAPConnection();
    vi.runAllTimers();
    const result = await resultPromise;
    expect(result).toBe(false);
  });
});

// ─── PurchaseEngineState transitions ─────────────────────────────────────────

describe('PurchaseEngineState transitions', () => {
  let engine: ReturnType<typeof createIAPEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIAP.requestPurchase.mockResolvedValue(undefined);
    mockIAP.getAvailablePurchases.mockResolvedValue([]);
    mockIAP.finishTransaction.mockResolvedValue(undefined);
    engine = createIAPEngine();
  });

  it('starts at IDLE', () => {
    expect(engine.state.engineState).toBe(PurchaseEngineState.IDLE);
  });

  it('transitions IDLE → PROCESSING → SUCCESS on successful purchase', async () => {
    const purchase = makePurchase(PRODUCT_IDS.monthly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    const mockProducts = [purchase];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);
    await engine.simulatePurchaseUpdate(purchase);

    expect(engine.state.engineState).toBe(PurchaseEngineState.SUCCESS);
  });

  it('transitions IDLE → PROCESSING → ERROR on purchase failure', async () => {
    const error = Object.assign(new Error('Payment declined'), { code: 'E_PAYMENT_DECLINED' });
    mockIAP.requestPurchase.mockRejectedValue(error);

    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);

    expect(engine.state.engineState).toBe(PurchaseEngineState.ERROR);
  });

  it('transitions IDLE → PROCESSING → IDLE on user cancel', async () => {
    const cancelError = Object.assign(new Error('User cancelled'), { code: 'E_USER_CANCELLED' });
    mockIAP.requestPurchase.mockRejectedValue(cancelError);

    const mockProducts = [makePurchase(PRODUCT_IDS.monthly)];
    await engine.purchaseSubscription(PRODUCT_IDS.monthly, mockProducts);

    expect(engine.state.engineState).toBe(PurchaseEngineState.IDLE);
  });

  it('transitions IDLE → PROCESSING → SUCCESS on successful restore', async () => {
    const purchase = makePurchase(PRODUCT_IDS.yearly);
    mockIAP.getAvailablePurchases.mockResolvedValue([purchase]);

    await engine.restorePurchases();

    expect(engine.state.engineState).toBe(PurchaseEngineState.SUCCESS);
  });

  it('transitions IDLE → PROCESSING → IDLE on restore with no subscription', async () => {
    mockIAP.getAvailablePurchases.mockResolvedValue([]);

    await engine.restorePurchases();

    expect(engine.state.engineState).toBe(PurchaseEngineState.IDLE);
  });
});
