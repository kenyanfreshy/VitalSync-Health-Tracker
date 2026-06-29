# VitalSync — Local StoreKit Testing Guide

**Last updated:** June 2026  
**Applies to:** Xcode 15+, iOS 17+, VitalSync iOS (Debug builds only)

---

## Overview

VitalSync uses Apple's **StoreKit 2** (via `react-native-iap`) for auto-renewable subscriptions. This guide covers the complete local StoreKit testing environment that lets you test every purchase scenario — trials, renewals, cancellations, billing failures, and refunds — entirely on your Mac without touching App Store Connect or the live App Store Sandbox.

> **Critical isolation guarantee:** The `storeKitConfigurationFileReference` is set **only** on the `LaunchAction` (Debug builds). The `ProfileAction` and `ArchiveAction` both use `buildConfiguration = "Release"` and carry no StoreKit config reference. TestFlight builds and App Store submissions are therefore completely unaffected.

---

## Products Configured

Both products belong to the same subscription group: **VitalSync Premium**.

| Product ID | Display Name | Price | Period | Introductory Offer |
|---|---|---|---|---|
| `vitalsync.healthtracker.premium_monthly` | VitalSync Premium Monthly | $4.99 | 1 month | 14-day free trial |
| `vitalsync.healthtracker.premium_annual` | VitalSync Premium Annual | $49.99 | 1 year | 14-day free trial |

Both products are configured with:

- **Billing grace period**: 6 days (matches App Store Connect production setting)
- **Billing retry**: enabled, up to 3 retries, 1-day intervals
- **Customer cancellation**: enabled with cancellation reason collection
- **Storefront**: USA (USD)

---

## File Locations

| File | Purpose |
|---|---|
| `ios/VitalSync.storekit` | StoreKit configuration — products, pricing, offers, billing settings |
| `ios/VitalSyncHealthTracker.xcodeproj/xcshareddata/xcschemes/VitalSyncHealthTracker.xcscheme` | Xcode scheme — wires the `.storekit` file to Debug `LaunchAction` only |
| `ios/VitalSyncHealthTracker.xcodeproj/project.pbxproj` | Xcode project — file reference for `VitalSync.storekit` in the project navigator |

---

## How It Works: Local vs Sandbox vs Production

| Environment | When Active | StoreKit Backend | Receipt Validation |
|---|---|---|---|
| **Local StoreKit** | Running from Xcode (Debug scheme) | Xcode's built-in StoreKit server | Not required — all transactions are synthetic |
| **App Store Sandbox** | TestFlight builds, Simulator without `.storekit` file | Apple's Sandbox servers | Server-side via `/verifyReceipt` sandbox endpoint |
| **App Store Production** | App Store distribution | Apple's Production servers | Server-side via `/verifyReceipt` production endpoint |

When the `.storekit` file is active, Xcode intercepts all `SKPaymentQueue` and `StoreKit 2` API calls and serves responses from the local configuration. No network calls reach Apple's servers. The app code — `react-native-iap`, `subscription-context.tsx`, `VitalSyncIAPBridge.ts` — runs identically in all three environments.

---

## Setting Up Local StoreKit Testing

### Prerequisites

- Xcode 15 or later
- iOS Simulator or physical device connected via Xcode (not Expo Go)
- The `VitalSyncHealthTracker` scheme selected in Xcode

### Verification Steps

1. Open `ios/VitalSyncHealthTracker.xcodeproj` in Xcode.
2. Select **Product → Scheme → VitalSyncHealthTracker**.
3. Select **Product → Scheme → Edit Scheme** (`⌘⇧<`).
4. Click **Run** in the left sidebar, then the **Options** tab.
5. Confirm **StoreKit Configuration** shows `VitalSync.storekit`.
6. Click **Close** and run the app (`⌘R`).

If the field is empty, set it manually by clicking the dropdown and selecting `VitalSync.storekit`. This is a one-time setup per developer machine; the scheme file in source control carries the reference for all team members.

---

## Simulating Purchase Scenarios

All scenarios below are performed via **Xcode → Debug → StoreKit** (the StoreKit Transaction Manager) while the app is running.

### Switching Between Local StoreKit and App Store Sandbox

To switch to App Store Sandbox testing (e.g., to test server-side receipt validation):

1. Open **Edit Scheme → Run → Options**.
2. Set **StoreKit Configuration** to **None**.
3. Run the app — it will now use the App Store Sandbox environment.
4. Sign in with an Apple Sandbox tester account (configured in App Store Connect → Users and Access → Sandbox Testers).

To return to local testing, set the configuration back to `VitalSync.storekit`.

### Resetting Purchases

**Local StoreKit:** In Xcode, open **Debug → StoreKit → Manage Transactions**. Select all transactions and click the **Delete** (trash) button. All entitlements are immediately revoked in the running app.

**App Store Sandbox:** On the test device, go to **Settings → App Store → Sandbox Account → Manage** and tap **Reset Eligible Introductory Offers**. Alternatively, delete and reinstall the app.

### Simulating a Subscription Cancellation

1. Open **Debug → StoreKit → Manage Transactions**.
2. Find the active subscription transaction.
3. Right-click and select **Refund Purchase** — this marks the subscription as cancelled and triggers the `paymentQueue(_:updatedTransactions:)` callback with a `.failed` or revoked state.

Alternatively, in the StoreKit Transaction Manager, select the subscription and choose **Cancel Subscription** to simulate the user cancelling through the App Store without an immediate refund.

### Simulating a Refund

1. Open **Debug → StoreKit → Manage Transactions**.
2. Select the transaction to refund.
3. Right-click and choose **Refund Purchase**.
4. The app receives a `Transaction.updates` event with `revocationDate` set, triggering the revocation handler in `subscription-context.tsx`.

### Simulating Subscription Renewals

Local StoreKit uses **accelerated renewal periods** by default. The actual durations during testing are:

| Production Period | Test Duration |
|---|---|
| 1 month | 5 minutes |
| 1 year | 30 minutes |
| 1 week | 3 minutes |
| 1 day | 2 minutes |

Renewals happen automatically at these intervals. Watch the Xcode console for `[SubscriptionContext] renewal received` log lines. You can also observe them in **Debug → StoreKit → Manage Transactions** as new transaction rows appear.

To force an immediate renewal, right-click the active subscription in the Transaction Manager and select **Force Renewal**.

### Simulating Billing Failures

1. In **Debug → StoreKit → Manage Transactions**, right-click an active subscription.
2. Select **Request Refund** to put the subscription into a billing retry state.
3. Alternatively, open the StoreKit configuration file (`VitalSync.storekit`) in Xcode's StoreKit editor, go to **Settings**, and enable **Fail Transactions** to cause all purchase attempts to fail with `SKErrorPaymentNotAllowed`.

To simulate a billing failure with grace period active:

1. Enable **Billing Grace Period** in the StoreKit configuration (already enabled — 6 days).
2. Trigger a billing failure as above.
3. The app will receive a subscription status of `.inGracePeriod` — verify that the `subscription-context.tsx` still grants access during this window.

### Simulating Expired Subscriptions

1. Let the accelerated renewal timer expire without renewing (disable auto-renewal in the Transaction Manager).
2. Or right-click the subscription and select **Set Expiration Date** to an immediate past date.
3. The app receives a `Transaction.updates` event with `expirationDate` in the past and `isUpgraded = false`, which triggers the `expired` access state in `subscription-context.tsx`.

### Simulating an Introductory Offer (Free Trial)

The 14-day free trial is configured as an introductory offer on both products. In local testing, the trial period is accelerated to approximately 3 minutes (proportional to the subscription period). To test the trial-to-paid conversion:

1. Purchase either product — the introductory offer is automatically applied on first purchase.
2. Wait for the trial period to expire (or force-expire via the Transaction Manager).
3. Observe the subscription renewing at the paid price.

To re-test the trial after it has been consumed, reset purchases as described above.

---

## Editing the StoreKit Configuration

Open `ios/VitalSync.storekit` directly in Xcode for a visual editor. Changes made in the editor are saved back to the JSON file and are immediately reflected in the running app (no rebuild required for pricing/description changes; a restart is required for structural changes like adding new products).

**Do not modify product IDs.** The product IDs (`vitalsync.healthtracker.premium_monthly`, `vitalsync.healthtracker.premium_annual`) must match App Store Connect exactly. Changing them in the `.storekit` file only affects local testing and has no impact on production.

---

## Impact on Production and TestFlight

The following confirms that no production or TestFlight behaviour is affected by this configuration:

| Concern | Status |
|---|---|
| `react-native-iap` purchase flow modified | **No** — zero changes to `subscription-context.tsx`, `VitalSyncIAPBridge.ts`, or any purchase logic |
| App Store Connect products modified | **No** — the `.storekit` file is a local Xcode file only |
| TestFlight builds use local StoreKit | **No** — `ArchiveAction` has `buildConfiguration = "Release"` with no `storeKitConfigurationFileReference` |
| Release builds affected | **No** — `ProfileAction` and `ArchiveAction` carry no StoreKit config reference |
| Server-side receipt validation affected | **No** — local StoreKit transactions are synthetic and never reach Apple's servers |

---

## Troubleshooting

**StoreKit configuration not appearing in Edit Scheme → Run → Options**

The `.storekit` file must be added to the Xcode project (not just the filesystem). Verify it appears in the Xcode project navigator under the `VitalSyncHealthTracker` group. If missing, drag `ios/VitalSync.storekit` into the project navigator manually.

**Purchases succeed but app does not unlock premium features**

The `subscription-context.tsx` listens to `Transaction.updates` for StoreKit 2 events. Ensure the app is running a Debug build (not a Release build) and that the scheme's StoreKit configuration is set. Check the Xcode console for `[SubscriptionContext]` log lines.

**"Cannot connect to iTunes Store" error during local testing**

This error indicates the app is attempting to reach Apple's servers instead of the local StoreKit environment. Confirm the scheme has the `storeKitConfigurationFileReference` set and that you are running a Debug build, not a Release or Profile build.

**Introductory offer not appearing**

Local StoreKit tracks offer eligibility per Apple ID. Reset purchases (see above) to restore introductory offer eligibility for the test account.

---

## References

- [Apple Developer — Testing in-app purchases with StoreKit](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_with_storekit)
- [Apple Developer — Setting up StoreKit Testing in Xcode](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode)
- [Apple Developer — StoreKit Configuration File Reference](https://developer.apple.com/documentation/xcode/storekit-configuration-file)
- [react-native-iap — iOS StoreKit 2 Guide](https://react-native-iap.dooboolab.com/docs/guides/ios)
