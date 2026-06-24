/**
 * Web stub for react-native-iap.
 *
 * react-native-iap uses react-native-nitro-modules (JSI/Nitro HybridObjects)
 * which are not available on web. This stub provides no-op implementations
 * of every function imported by subscription-context.tsx so the web bundle
 * never attempts to call native IAP code.
 *
 * Registered in metro.config.js via resolveRequest for platform === "web".
 */

export const initConnection = async () => undefined;
export const endConnection = async () => undefined;
export const clearTransactionIOS = async () => undefined;
export const getProducts = async () => [];
export const getSubscriptions = async () => [];
export const fetchProducts = async () => [];
export const requestPurchase = async () => undefined;
export const requestSubscription = async () => undefined;
export const restorePurchases = async () => [];
export const getAvailablePurchases = async () => [];
export const finishTransaction = async () => undefined;
export const isNitroReady = () => false;

export const purchaseUpdatedListener = (_cb: unknown) => ({ remove: () => {} });
export const purchaseErrorListener = (_cb: unknown) => ({ remove: () => {} });

export type ProductPurchase = Record<string, unknown>;
export type Purchase = Record<string, unknown>;
export type PurchaseError = { code: string; message: string };
export type Subscription = Record<string, unknown>;
export type ProductSubscription = Record<string, unknown>;
export type Product = Record<string, unknown>;
