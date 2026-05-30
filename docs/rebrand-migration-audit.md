# VitalSync — Complete Rebrand & App Store Identity Migration Audit

**Prepared by:** Manus AI  
**Date:** 2026-05-30  
**Current App Name:** VitalSync Health Tracker  
**Current Bundle ID:** `com.myvitalsyncclinicalhub.vitalsync`  
**Apple Team ID:** `ZKJKD74K2N`  
**App Store Connect App ID:** `6760296225`  
**Apple ID (submitter):** `ak82korir@gmail.com`

> **Important:** This document is an audit and migration plan only. No code changes have been made. All modifications described below require explicit approval before implementation.

---

## Phase 1 — Complete Identity Audit

### 1.1 Configuration Files

The following configuration files contain hard-coded identity references that must be updated during a rebrand.

| File | Identity References Found |
|------|--------------------------|
| `app.config.ts` | `appName`, `appSlug`, `rawBundleId`, `BGTaskSchedulerPermittedIdentifiers: ["com.vitalsync.data.refresh"]`, `apsEnvironment`, `NSHealthShareUsageDescription` (mentions app name), `NSSpeechRecognitionUsageDescription` (mentions app name) |
| `eas.json` | `bundleIdentifier: "com.myvitalsyncclinicalhub.vitalsync"`, `ascAppId: "6760296225"`, `appleTeamId: "ZKJKD74K2N"`, `appleId: "ak82korir@gmail.com"` |
| `package.json` | `"name": "app-template"` (template default — not user-visible but should be updated) |

**Note on the bundle ID discrepancy:** The `eas.json` submit configuration uses `com.myvitalsyncclinicalhub.vitalsync`, while the `docs/` files reference `space.manus.vitalsync.t20241217105738`. The `eas.json` value is the one actually used for App Store submission and is the authoritative production bundle ID.

### 1.2 Background Task Identifiers

The background sync task is registered under a hard-coded identifier that is independent of the bundle ID:

```
com.vitalsync.data.refresh
```

This identifier appears in two locations: `app.config.ts` (`BGTaskSchedulerPermittedIdentifiers`) and `lib/health/background-sync-service.ts` (`VITALSYNC_BG_SYNC_TASK` constant). Both must be updated together — a mismatch between the two will cause background sync to silently fail on iOS.

### 1.3 AsyncStorage Keys

The app uses **over 100 AsyncStorage keys** prefixed with `@vitalsync:` or `@vitalsync/`. These keys are the most critical data migration concern in any rebrand. A complete list of the observed prefixes is:

- `@vitalsync:health_data` — primary health data blob
- `@vitalsync:ekg_cache_v2`, `@vitalsync:ekg_tally_v1`, `@vitalsync:ekg_vault_*` — EKG storage
- `@vitalsync:sleep_summaries_v1`, `@vitalsync:sleep_rollups_v1` — sleep storage
- `@vitalsync:medications`, `@vitalsync:immunizations`, `@vitalsync:labResults` — clinical records
- `@vitalsync:thresholds`, `@vitalsync:glucose_thresholds` — alert configuration
- `@vitalsync:userProfile`, `@vitalsync:hasOnboarded` — user identity and onboarding state
- `@vitalsync:storage_opt_*` — storage optimizer results
- `@vitalsync:smart_reminder_*` — reminder engine state
- `@vitalsync:upsell_engine_v1`, `@vitalsync:upsell_analytics_v1` — subscription analytics
- `@vitalsync:enc_key_v1`, `@vitalsync:migration_v1_done` — encryption and schema migration
- `@vitalsync:pairedBleDevices` — Bluetooth device trust store
- `@vitalsync:install_id` — anonymous install identifier

**AsyncStorage keys are not tied to the bundle ID.** They are stored in the app's sandboxed storage container, which is identified by the bundle ID. If the bundle ID changes, a fresh install will have an empty AsyncStorage — the old keys are inaccessible unless an explicit migration is performed before the bundle ID change takes effect.

### 1.4 SecureStore Keys

No hard-coded SecureStore key names were found in the codebase. SecureStore keys are also sandboxed to the bundle ID, so a bundle ID change has the same effect as AsyncStorage — all secure keys become inaccessible to the new bundle.

### 1.5 User-Facing Screens Containing "VitalSync"

The following screens display the app name to the user and require text updates:

| Screen / File | Location of Reference |
|---|---|
| `components/app-loading-screen.tsx` | Splash screen app name label |
| `components/app-lock-screen.tsx` | Lock screen app name label + PIN reset instruction |
| `app/settings/about.tsx` | About screen title, app name, share message, store URLs |
| `app/settings/consent.tsx` | Privacy policy and Terms of Use consent text |
| `app/settings/data-privacy.tsx` | Privacy commitment body text, footer disclaimer |
| `app/settings/data-management.tsx` | Footer note about data sharing |
| `app/settings/clinical-sources.tsx` | Evidence sources PDF title, share dialog title |
| `app/settings/healthkit-permissions.tsx` | HealthKit permission error message |
| `app/settings/healthkit-debug.tsx` | Debug fix instruction (Settings → Health → VitalSync) |
| `app/settings/language.tsx` | "Learn more about VitalSync" link label |
| `app/(tabs)/settings.tsx` | Support URL, support email, privacy policy URL, product ID matching |
| `components/dashboard/readiness-breakdown-sheet.tsx` | Share text ("Tracked with VitalSync Personal Health Hub") |
| `components/dashboard/insight-engine.tsx` | Privacy modal body text |
| `lib/health/csv-export.ts` | CSV export header comment and filename (`VitalSync_Export_*.csv`) |
| `lib/health/correlation-engine.ts` | Clinical suggestion text mentioning the app |

### 1.6 Subscription Product Identifiers

Two product IDs are hard-coded in `app/(tabs)/settings.tsx` for display name resolution:

```
vitalsyncpersonalwellnesshub.pro.annual
com.vitalsyncpersonalwellnesshub.pro.monthly
```

These product IDs are registered in App Store Connect and **cannot be renamed** after creation. If the app moves to a new App Store Connect listing, new product IDs must be created. Existing subscribers on the old product IDs will not automatically transfer to new IDs — this is the single highest-risk item in a new App Store Connect app migration.

### 1.7 External URLs and Email Addresses

| Purpose | Current Value |
|---|---|
| Support website | `https://vitalsyncpersonalwellnesshub.com` |
| Support website (About screen) | `https://vitalsyncclinicalhub.com` |
| Support email | `support@vitalsyncpersonalwellnesshub.com` |
| Crash report email | `akorir@vitalsync-clinicalhub.com` |
| Privacy policy | `https://vitalsyncpersonalwellnesshub.com/article/privacy-policy` |
| Terms of use | `https://vitalsyncpersonalwellnesshub.com/article/subscription-plans?v=1` |
| Android Play Store URL | `https://play.google.com/store/apps/details?id=com.myvitalsyncclinicalhub.vitalsync` |

**Note:** Two different support URLs are used in different screens (`vitalsyncclinicalhub.com` in About, `vitalsyncpersonalwellnesshub.com` in Settings). This inconsistency should be resolved during the rebrand.

### 1.8 PDF Reports and CSV Exports

The report generator and CSV exporter embed the app name in output files:

- `lib/health/csv-export.ts`: CSV header comment `# VitalSync Health Data Export` and filename `VitalSync_Export_YYYY-MM-DD.csv`
- `app/settings/clinical-sources.tsx`: PDF title `VitalSync Evidence Based Sources` and HTML heading `VitalSync: Personal Health Hub — Evidence Sources`
- `app/settings/data-privacy.tsx`: PDF export label `VitalSync Clinical Hub — Exported`

### 1.9 Documentation Files

| File | References |
|---|---|
| `docs/healthkit-integration-breakdown.md` | Bundle ID `space.manus.vitalsync.t20241217105738`, Team ID, App Store Connect App ID |
| `docs/apple-reviewer-distribution.md` | Bundle ID, Team ID, App Store Connect App ID, Apple ID |

### 1.10 Deep Link Scheme

The deep link scheme is derived programmatically from the bundle ID in `app.config.ts`:

```typescript
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;
```

This means the deep link scheme changes automatically when the bundle ID changes. Any external links (emails, marketing pages, QR codes) pointing to the current scheme will break after a bundle ID change.

### 1.11 HealthKit Entitlements

The following entitlements are declared in `app.config.ts` and are tied to the Apple Developer Portal App ID (which is linked to the bundle ID):

```
com.apple.developer.healthkit
com.apple.developer.healthkit.background-delivery
aps-environment (production/development)
```

If the bundle ID changes, a new App ID must be created in the Apple Developer Portal, and these entitlements must be re-enabled for the new App ID before any build can succeed.

---

## Phase 2 — Rename Architecture

### 2.1 Centralized Configuration Strategy

All identity-sensitive values should be consolidated into a single `brand.config.ts` file at the project root. The current `app.config.ts` already uses an `env` object for some values — this pattern should be extended to cover all identity fields.

**Proposed `brand.config.ts` structure:**

```typescript
export const brand = {
  // App identity — update these to rebrand
  appName:           "Your New App Name",
  appSlug:           "your-app-slug",          // Expo project slug — do not change after first build
  displayName:       "Your New App Name",       // iOS home screen label
  bundleId:          "com.yourcompany.yourapp", // iOS bundle ID / Android package
  
  // Support & legal
  supportUrl:        "https://yourapp.com",
  supportEmail:      "support@yourapp.com",
  crashReportEmail:  "crashes@yourapp.com",
  privacyPolicyUrl:  "https://yourapp.com/privacy",
  termsUrl:          "https://yourapp.com/terms",
  
  // Background task
  bgSyncTaskId:      "com.yourcompany.yourapp.data.refresh",
  
  // AsyncStorage key prefix — changing this requires a data migration
  storagePrefix:     "@yourapp",
  
  // App Store
  ascAppId:          "YOUR_ASC_APP_ID",
  appleTeamId:       "YOUR_TEAM_ID",
  appleId:           "your@apple.id",
  
  // Subscription product IDs (registered in App Store Connect — cannot be renamed)
  productIdAnnual:   "com.yourcompany.yourapp.pro.annual",
  productIdMonthly:  "com.yourcompany.yourapp.pro.monthly",
};
```

`app.config.ts`, all screens, and all service files would then import from `brand.config.ts` rather than hard-coding strings. This ensures a rebrand requires changes in exactly one file.

### 2.2 Files Requiring Updates (Complete List)

The table below lists every file that requires a change during a rebrand, grouped by change type.

**Group A — Single configuration file (change once, propagates everywhere after `brand.config.ts` is adopted):**

| File | Change Required |
|---|---|
| `brand.config.ts` (new) | All identity values |
| `app.config.ts` | Import from `brand.config.ts`; remove hard-coded strings |
| `eas.json` | `bundleIdentifier`, `ascAppId`, `appleTeamId`, `appleId` |

**Group B — Screen and component text (requires manual update or i18n key):**

| File | Change Required |
|---|---|
| `components/app-loading-screen.tsx` | App name label |
| `components/app-lock-screen.tsx` | App name label + PIN reset instruction |
| `app/settings/about.tsx` | App name, support URL, store URLs |
| `app/settings/consent.tsx` | `PRIVACY_URL`, `TERMS_URL` constants |
| `app/settings/data-privacy.tsx` | Privacy commitment text, footer disclaimer, PDF label |
| `app/settings/data-management.tsx` | Footer note |
| `app/settings/clinical-sources.tsx` | PDF title, HTML heading, share dialog title |
| `app/settings/healthkit-permissions.tsx` | Permission error message |
| `app/settings/healthkit-debug.tsx` | Debug fix instruction |
| `app/settings/language.tsx` | "Learn more" link label |
| `app/(tabs)/settings.tsx` | Support URL, email, privacy URL, product ID constants |
| `components/dashboard/readiness-breakdown-sheet.tsx` | Share text |
| `components/dashboard/insight-engine.tsx` | Privacy modal body |

**Group C — Data layer (requires migration script, not just text replacement):**

| File | Change Required |
|---|---|
| `lib/health/background-sync-service.ts` | `VITALSYNC_BG_SYNC_TASK` constant |
| `lib/health/csv-export.ts` | CSV header and filename |
| All files using `@vitalsync:` / `@vitalsync/` keys | AsyncStorage key prefix (migration required) |

**Group D — Documentation (update for accuracy):**

| File | Change Required |
|---|---|
| `docs/healthkit-integration-breakdown.md` | Bundle ID, Team ID, App Store Connect App ID |
| `docs/apple-reviewer-distribution.md` | All identity fields |

---

## Phase 3 — New App Store Connect App Preparation

### 3.1 What Changes vs. What Is Preserved

| Item | New App Connect Listing | Same App Connect Listing |
|---|---|---|
| Bundle ID | New — must be unique | Unchanged |
| App Store Connect App ID | New | Unchanged |
| Subscription product IDs | New — must be recreated | Unchanged |
| Existing subscriber base | **Not transferred automatically** | Preserved |
| HealthKit entitlements | Re-enable for new App ID | Unchanged |
| TestFlight internal testers | Re-invite | Unchanged |
| App Store reviews and ratings | Start from zero | Preserved |
| App Store ranking and history | Start from zero | Preserved |
| Push notification certificates | New APNs certificate for new bundle ID | Unchanged |

### 3.2 Preserving All Existing Functionality

The following capabilities are **not affected** by a bundle ID change at the code level, provided the new App ID is configured correctly in the Apple Developer Portal:

- HealthKit permissions (`com.apple.developer.healthkit`, `com.apple.developer.healthkit.background-delivery`) — re-enable for new App ID
- Apple ECG / Electrocardiogram — no special entitlement required beyond HealthKit; the `HKElectrocardiogram` type is available to any HealthKit-enabled app
- Background processing — re-add `BGTaskSchedulerPermittedIdentifiers` with the new task ID
- Notifications — new APNs certificate; update `aps-environment` entitlement
- Multi-language support — entirely in-app, unaffected
- Storage optimization, dashboard, reports — entirely local, unaffected

### 3.3 Subscription Migration Risk

This is the highest-risk item. Apple does not provide a mechanism to migrate active subscribers from one App Store Connect app to another. Options are:

1. **Maintain the existing App Store Connect app** and rebrand in-place (change the app name and screenshots, keep the bundle ID). Subscribers are preserved. This is the lowest-risk path.
2. **Create a new App Store Connect app** and offer a grace period where both apps are available. Existing subscribers must cancel their old subscription and re-subscribe on the new app. This will result in subscriber churn.
3. **Use a subscription group migration** — Apple allows moving products between subscription groups within the same App Store Connect app, but not between different apps.

---

## Phase 4 — Data Migration Safety

### 4.1 What Happens When the Bundle ID Changes

On iOS, AsyncStorage data is stored in the app's sandboxed `Library/Application Support` directory, which is keyed to the bundle ID. When the bundle ID changes:

- A fresh install of the new bundle ID starts with completely empty AsyncStorage.
- The old app's data (under the old bundle ID) remains on the device until the old app is deleted.
- The new app cannot read the old app's AsyncStorage directly.

The same applies to SecureStore (Keychain items are scoped to the bundle ID by default) and local file storage under `expo-file-system`'s `documentDirectory`.

### 4.2 Migration Strategies

**Option A — Clean install (recommended for a new App Store Connect app):** Accept that existing users start fresh. This is appropriate if the rebrand targets a new audience or if user data volume is low. All onboarding state, health records, medications, EKG strips, and preferences are lost. Users who installed the old app retain their data in the old app until they delete it.

**Option B — In-app migration on first launch (recommended for same-bundle-ID rebrand):** If the bundle ID is kept the same, no migration is needed. Only the display name, app name, and text strings change. All AsyncStorage data is preserved automatically.

**Option C — iCloud / server-side migration (complex):** Export all AsyncStorage data to iCloud Drive or the app's backend before the bundle ID change, then import it on first launch of the new bundle ID. This requires significant engineering effort and user consent. Given that VitalSync is designed as a privacy-first, local-only app, this approach conflicts with the app's core privacy commitment.

### 4.3 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| All user health data lost on bundle ID change | High | Use Option B (keep bundle ID) or implement Option C migration |
| EKG strips and vault data lost | High | Same as above; EKG vault uses `@vitalsync:ekg_vault_wave_*` keys |
| Subscription entitlement lost | High | Existing subscribers must re-subscribe on new app |
| Background sync task silently stops | Medium | Update both `BGTaskSchedulerPermittedIdentifiers` and `VITALSYNC_BG_SYNC_TASK` constant together |
| Deep link scheme changes | Medium | Update all marketing materials and QR codes |
| HealthKit permissions reset | Medium | Users must re-grant HealthKit access after reinstall |
| Push notification tokens invalidated | Low | Tokens are re-registered automatically on first launch |
| AsyncStorage key prefix mismatch | Low | If prefix changes, write a one-time migration function in `app/_layout.tsx` |

### 4.4 Recommendation

**Keep the bundle ID unchanged for the rebrand.** Change only the display name (`appName`), the support URLs, the email addresses, the screen text, and the App Store Connect metadata (name, screenshots, description). This preserves all user data, all subscriptions, all HealthKit permissions, and all App Store history. The bundle ID is an internal technical identifier — users never see it.

If a new bundle ID is truly required (e.g., for a completely separate legal entity), implement a data export/import migration before submitting the new bundle to TestFlight.

---

## Phase 5 — Build and Submission Readiness

### 5.1 Entitlement Checklist

Before submitting any build under a new bundle ID, verify the following in the Apple Developer Portal:

| Item | Action Required |
|---|---|
| New App ID created | Create at developer.apple.com → Identifiers → App IDs |
| HealthKit capability enabled | Enable `HealthKit` for the new App ID |
| Background Modes enabled | Enable `Background fetch` and `Background processing` |
| Push Notifications enabled | Enable `Push Notifications`; download new APNs certificate |
| Associated Domains (if used) | Add associated domains for the new bundle ID |
| Provisioning profiles | Create new Distribution provisioning profile for the new App ID |

### 5.2 EAS Build Checklist

Before triggering an EAS build under a new identity:

1. Update `eas.json` `submit.production.ios.bundleIdentifier` to the new bundle ID.
2. Update `eas.json` `submit.production.ios.ascAppId` to the new App Store Connect App ID.
3. Run `eas credentials` to provision new credentials for the new bundle ID.
4. Verify `BGTaskSchedulerPermittedIdentifiers` in `app.config.ts` matches the new task ID.
5. Confirm `aps-environment` is set to `production` for the production build profile.

### 5.3 TestFlight Checklist

1. Create the new app in App Store Connect (if using a new listing).
2. Add internal testers to the new app's TestFlight.
3. Submit the first build via `eas submit --platform ios --profile production`.
4. Complete the TestFlight compliance questionnaire (encryption: select "No" for ITSAppUsesNonExemptEncryption — already set in `app.config.ts`).
5. Distribute to internal testers; verify HealthKit permissions prompt appears correctly.

### 5.4 App Store Submission Checklist

1. Prepare new App Store metadata: name, subtitle, description, keywords, screenshots (6.9-inch iPhone required).
2. Ensure the privacy policy URL is live and accessible at the new domain.
3. Ensure the support URL is live and accessible.
4. Complete the App Privacy questionnaire in App Store Connect.
5. If in-app purchases exist, ensure all product IDs are created and approved in App Store Connect before submission.
6. Submit for App Review; include the App Review notes from `docs/apple-reviewer-distribution.md` (updated for the new identity).

---

## Deliverable Summary

### Recommended New Naming Structure

The new app name should be chosen by the developer. The following structural recommendations apply regardless of the chosen name:

- The display name should be short enough to fit on the iOS home screen without truncation (typically 13 characters or fewer).
- The App Store name can be longer (up to 30 characters) and should include a keyword for discoverability.
- The subtitle (up to 30 characters) should describe the app's primary function.

### Recommended Bundle Identifier Structure

Follow Apple's reverse-domain convention: `com.yourcompany.yourapp`. Avoid using `space.manus.*` prefixes in production as these are Manus platform identifiers. The recommended format is:

```
com.<your-company-domain>.<app-name>
```

For example: `com.akorir.healthhub` or `com.yourcompany.healthtracker`.

### Rollback Plan

If any migration step fails:

1. **EAS Build fails:** Roll back `app.config.ts` and `eas.json` to the last known-good values using `webdev_rollback_checkpoint`. The last stable checkpoint is `749104be` (v2.10.8).
2. **App Store submission rejected:** The existing v2.10.8 build remains available in TestFlight. No user-facing change occurs until a new build is approved and released.
3. **Data migration causes data loss:** If a migration script is deployed and causes data loss, the only recovery path is restoring from a device backup (iCloud or iTunes). There is no server-side backup. This reinforces the recommendation to keep the bundle ID unchanged.
4. **Subscription entitlement breaks:** Revert to the original bundle ID. Subscriptions are tied to the App Store Connect app, not the bundle ID — but a bundle ID change that creates a new App Store Connect app will break the subscription link.

---

## Exact Steps Required Before TestFlight Submission (Rebrand)

The following steps apply to an **in-place rebrand** (same bundle ID, new display name and text only):

1. Create `brand.config.ts` with all new identity values.
2. Update `app.config.ts` to import from `brand.config.ts`.
3. Update all Group B screen files (see §2.2) with new app name, URLs, and email addresses.
4. Update `lib/health/csv-export.ts` filename and header.
5. Update `lib/health/background-sync-service.ts` `VITALSYNC_BG_SYNC_TASK` constant (if task ID changes).
6. Update `eas.json` support URLs (no bundle ID change needed).
7. Update `docs/` files for accuracy.
8. Run `pnpm test` to verify all 35 tests still pass.
9. Bump version number in `app.config.ts`.
10. Commit and push to GitHub.
11. Run `eas build --platform ios --profile production`.
12. Run `eas submit --platform ios --profile production` after build completes.

---

*This report was generated from a live codebase audit. All file paths are relative to `/home/ubuntu/VitalSync-App`. No code changes were made during this audit.*
