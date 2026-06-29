# VitalSync — Xcode StoreKit Configuration Guide

This document covers the local StoreKit testing setup required to validate the VitalSync paywall in Xcode without hitting live App Store servers.

---

## Product Identifiers

| Plan | Product ID | Type |
|------|-----------|------|
| Monthly | `vitalsync.healthtracker.premium_monthly` | Auto-Renewable Subscription |
| Annual | `vitalsync.healthtracker.premium_annual` | Auto-Renewable Subscription |

These identifiers must match **exactly** in:
- App Store Connect → In-App Purchases
- The `PRODUCT_IDS` constant in `lib/subscription/subscription-context.tsx`
- The `Products.storekit` local configuration file (see below)

---

## Step 1 — Create the StoreKit Configuration File

1. In Xcode, go to **File → New → File…**
2. Filter for **StoreKit Configuration File** and select it
3. If your project is linked to an active App Store Connect container, check the **"Synchronize with App Store Connect"** option — this auto-imports your approved product metadata
4. Name the file **`Products.storekit`** and save it inside the project root (alongside `ios/`)

---

## Step 2 — Populate Product Identifiers

Open `Products.storekit`, then click the **`+`** button at the bottom of the panel and add:

| # | Identifier | Type |
|---|-----------|------|
| 1 | `vitalsync.healthtracker.premium_monthly` | Auto-Renewable Subscription |
| 2 | `vitalsync.healthtracker.premium_annual` | Auto-Renewable Subscription |

For each subscription product, configure:
- **Subscription Group**: `VitalSync Premium` (both products must share the same group)
- **Duration**: Monthly → 1 Month · Annual → 1 Year
- **Introductory Offer**: Free Trial · 14 Days (for both products)
- **Price**: Monthly → $4.99 · Annual → $49.99

---

## Step 3 — Duplicate and Configure the Active Scheme

1. Click the **active scheme drop-down** in the Xcode toolbar
2. Select **Manage Schemes…**
3. Duplicate your current run target (e.g. `VitalSync`)
4. Rename the duplicate to `VitalSync (StoreKit)`
5. With the duplicate selected, click **Edit…**
6. Go to the **Run** tab → **Options** sub-tab
7. Under **StoreKit Configuration**, select `Products.storekit`
8. Close the scheme editor and switch to the `VitalSync (StoreKit)` scheme before running

> **Important**: Always use the `VitalSync (StoreKit)` scheme when testing purchases locally. The default scheme does not load the local StoreKit file and will attempt to reach live App Store servers.

---

## Step 4 — Verify the Configuration Matches the App

The subscription context reads products using these exact SKUs:

```typescript
// lib/subscription/subscription-context.tsx
export const PRODUCT_IDS = {
  monthly: "vitalsync.healthtracker.premium_monthly",
  yearly:  "vitalsync.healthtracker.premium_annual",
} as const;
```

If `fetchProducts` returns 0 results in the simulator, check:

1. The product IDs in `Products.storekit` match the constants above exactly
2. The scheme is set to use `Products.storekit` (Step 3)
3. The Simulator is running iOS 15+ (StoreKit 2 requires iOS 15)
4. The `Products.storekit` file is added to the **target membership** of the iOS target in Xcode

---

## StoreKit 2 Engine — Implementation Reference

The app uses a native StoreKit 2 engine (`lib/subscription/subscription-context.tsx`) that implements:

| Feature | Implementation |
|---------|---------------|
| Product fetching | `fetchProducts()` via react-native-iap v15 |
| Purchase flow | `requestPurchase()` with platform-specific shape |
| JWS verification | Handled server-side via `server/routers/iap.ts` |
| Background renewals | `purchaseUpdatedListener` daemon |
| Restore purchases | `getAvailablePurchases()` + `AppStore.sync()` fallback |
| Entitlement check | `Transaction.currentEntitlements` loop |
| Ask to Buy / SCA | `purchaseState = "pendingApproval"` state |

The purchase flow **never auto-purchases** — `requestPurchase()` is only called after an explicit user tap on a plan button. A cancelled or failed purchase does not fall back to a free trial.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Products list empty in paywall | Scheme not using `Products.storekit` | Set StoreKit Configuration in scheme (Step 3) |
| "Invalid request for iOS" error | Wrong `requestPurchase` shape | Already fixed in v1.0.69 — ensure latest build |
| Purchase sheet never appears | Products not loaded yet | Paywall shows retry button — tap it |
| Restore finds nothing | Simulator has no prior purchases | Use Xcode → Debug → StoreKit → Manage Transactions |
| `E_USER_CANCELLED` in logs | User dismissed the sheet | Expected — not an error |
