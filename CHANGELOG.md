## [1.0.68] - 2026-06-20

### Improved
- Removed all remaining Bluetooth/BLE references from paywall slides, disclaimer text, onboarding, and all 10 language blocks (Arabic, Swahili, Hindi, Chinese Simplified, Japanese)
- All Terms of Use (EULA) links across paywall, onboarding, HealthKit Permissions, Data Privacy, and Consent screens now correctly point to the Apple Standard EULA
- Category manager renamed `bluetooth_devices` → `apple_health_devices` with label "Apple Health"
- app.config.ts bumped to version 1.0.68 / build 10068

# VitalSync — Changelog

All notable changes to VitalSync: Clinical Hub are documented here.
Build numbers correspond to the `ios.buildNumber` field in `app.config.ts`.

---

## v1.0.67 (Build 10067) — 2026-06-20

### Bluetooth Removed — Apple Health Integration Only
- **Complete BLE removal** — all Bluetooth/BLE files deleted: `ble-device-scanner.tsx`, `ble-reading-service.ts`, `bluetooth-manager.ts`, `data-sources.tsx`, `paired-devices-list.tsx`, `ble-gate-sheet.tsx`, `use-ble-health-alerts.ts`, `use-ble-permissions.ts`, `health-alert-monitor.ts`.
- **react-native-ble-plx removed** from `package.json` and `app.config.ts` plugins.
- **Bluetooth permissions removed** — `NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`, `bluetooth-central`, `bluetooth-peripheral` UIBackgroundModes, and Android `BLUETOOTH_SCAN/CONNECT/ADVERTISE/ACCESS_FINE_LOCATION` permissions all removed.
- **BLE UI removed** from Record, Settings, Dashboard (index), blood-sugar, weight, and vitals log screens.
- **i18n updated** — `bleError`, `bleErrorMsg`, `syncedViaBle`, `glucometerSource`, `bsPermissionMsg`, `vitalsPermissionMsg`, `feat9ble`, `bluetoothDevices` strings replaced with Apple Health language across all 10 languages. `bleScannerStrings` export block deleted.
- **Version bump** to 1.0.67 / Build 10067 / versionCode 67.

---

## v1.0.66 (Build 10066) — 2026-06-18

### Floating Wellness Disclaimer
- **FloatingWellnessDisclaimer component** — a glassmorphic floating disclaimer bar with a pulsing green indicator, expand/collapse animation, and 24-hour auto-reappear logic. Replaces the static `WellnessDisclaimerBanner` on Record, Correlate, Health Report, Settings, and HealthKit Permissions screens.
- The floating bar uses `BlurView` glassmorphism, a `#22C55E` pulsing dot, and a `withTiming` expand/collapse animation. Dismissed state persists to AsyncStorage with a 24-hour TTL keyed to `@vsht:disclaimerDismissedAt`.

### Macros Analytics Tab
- **New 🥦 Macros tab** added to the Nutrition Analysis section in the Correlate screen.
- Shows `WeeklyMacroIntelCard` when 7+ days of macro data (records with `proteinG`, `carbsG`, or `fatG` > 0) are logged.
- Displays friendly empty states ('No Macro Data Yet' / 'Building Your Macro Profile') with a progress badge and progress bar for users still building their macro history.
- **Nutrition tab expanded to 4 tabs** — Correlate, Glucose Tracking, Caloric, and Macros; each with its own color accent (green, blue, amber, purple) and persistent tab selection across sessions.

### i18n
- `tabMacro`, `noMacroDataTitle`, `noMacroDataBody`, `buildingMacroTitle`, `buildingMacroBody` keys added to all 10 language blocks in `correlationStrings`.

---

## v1.0.65 (Build 10065) — 2026-06-18

### Apple Guideline 1.4.1 Compliance
- **Wellness disclaimer banners** — a clear, non-dismissible banner ('VitalSync Health Tracker is a personal wellness and health organisation app. It is not a medical device and does not provide medical advice, diagnoses, or treatment recommendations.') added to the top of the Record, Correlate, Health Report, and Settings tab screens, and to the paywall footer.
- **Health Data Access screen disclaimer** — a two-paragraph wellness disclaimer card added to the HealthKit permissions screen, explaining the app is not a medical device and all data is stored locally on-device.
- **Medical language remediation** — replaced all high/medium-risk medical-device phrases app-wide:
  - EKG: 'AFib detected' → 'irregular rhythm detected'; 'AFib classification' → 'rhythm classification'
  - Clinical Narrative: 'AFib episode detected' → 'irregular rhythm episode logged'
  - Thresholds: 'AFib episode is detected' → 'irregular rhythm event is logged'
  - Clinical Sources: 'clinical decisions' → 'personal wellness decisions'
  - Data Privacy: 'clinical decisions' → 'personal wellness decisions'
  - Storage Optimization: 'AFib (always kept)' → 'Irregular Rhythm (always kept)'
  - Onboarding: 'meta-analyzed clinical datasets' → 'peer-reviewed wellness research'
  - Code Picker: 'Search diagnoses' → 'Search conditions'
- **HealthKit permission labels renamed** — 'Electrocardiogram (EKG)' → 'Heart Rhythm (EKG)', 'Blood Oxygen (SpO₂)' → 'Oxygen Saturation (SpO₂)', 'Respiratory Rate' → 'Breathing Rate' across all 10 language blocks.

### Terms of Use (EULA)
- **Apple EULA link** — all 'Terms of Service' labels and URLs replaced with 'Terms of Use (EULA)' pointing to `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` in the paywall, settings, and all other footer links.
- **Privacy Policy URL** — confirmed pointing to `https://vitalsyncpersonalwellnesshub.com/article/privacy-policy` (unchanged).

### Correlate Tab Full Localization
- **Zero hardcoded strings** — every user-facing string across all 5 Correlate sections now uses `cs.*` i18n keys with English fallbacks.
- **26 new i18n keys** propagated to all 10 language blocks (en, es, fr, de, zh, ja, pt, ar, sw, hi).

### Reviewer Package
- **docs/reviewer-package-v1.0.65.md** — full Apple reviewer package: compliant App Store description, reviewer notes, walkthrough script, video script, compliance matrix, and 1.4.1 resolution summary.

---

## v1.0.64 (Build 10064) — 2026-06-10

### Pattern Explorer V2.0
- **Personal Insight card** — every expanded scatter plot now shows a 💡 Personal Insight card with a contextual sentence describing the historical relationship between the two metrics over the selected day range (`generatePersonalInsight()`).
- **Rich Evidence Source block** — each expanded scatter card now shows a full Evidence Source block with journal name, year, study type badge (RCT / Cohort / Meta-Analysis / Cross-Sectional, colour-coded), sample size, and tappable PMID/DOI links (`EvidenceSourceBlock`).
- **All 16 PLOT_PAIRS enriched** — every pair now carries full `EvidenceSource` metadata: journal, year, studyType, sampleSize, doi, pmid, url.

### Nutrition Analysis — Empty States
- **Correlate tab: no-data state** — shows ‘No Nutrition Data Yet’ with a `0/7 days` badge and ‘+ Log a Meal’ CTA; accent `#10B981`.
- **Correlate tab: low-data state** — shows ‘Building Your Nutrition Pattern’ with `n/7` badge and mini progress bar when 1–6 unique days of meal data exist.
- **Caloric tab: no-data and low-data states** — mirrors Correlate tab pattern with accent `#F59E0B`; ‘No Caloric Data Yet’ / ‘Building Your Caloric Trend’.

### Correlation Trend Chart — Header Progress Badge
- **Section header badge** — the Observed Historical Patterns section header now shows a compact `n/7` progress badge (accent `#3B82F6`) alongside the chevron when fewer than 7 unique days of data exist; visible even when the section is collapsed.

### Correlate Tab Full Localization
- **Zero hardcoded strings** — every user-facing string across all 5 Correlate sections (Wellness Summary, Observed Historical Patterns, Nutrition Analysis, Insight Engine, Pattern Explorer) now uses `cs.*` i18n keys with English fallbacks.
- **26 new i18n keys** — added `peStrengthStrong/Moderate/Weak/NoPattern`, `peStatPoints/RSquared/Coverage/Score`, `peDayRange30/90/180/365`, `pePersonalInsightLabel`, `peResearchSourceLabel`, `peSampleLabel`, `peInsightFallback`, `peDisclaimer`, `peFooterDisclaimer`, `noNutritionDataTitle/Body`, `buildingNutritionTitle/Body`, `noCaloricDataTitle/Body`, `buildingCaloricTitle/Body`, `daysProgressLabel` — all propagated to all 10 language blocks (en, es, fr, de, zh, ja, pt, ar, sw, hi).

### Requirement Traceability Matrix
- **RTM updated to 102 requirements at 100% coverage** — added PE-R01–PE-R16 (individual relationship requirements), TC-01–TC-26 (translation coverage requirements), plus OH-07, OH-08, NA-07, NA-08, NA-09, PE-13, PE-14.

---

## v1.0.63 (Build 10063) — 2026-06-09

### Observed Historical Patterns — Empty States
- **Building Your Pattern state** — Observed Historical Patterns now shows a friendly 'Building Your Pattern' state with a progress badge (`n/7 days`) and mini progress bar when fewer than 7 unique days of data have been logged for the selected metrics.
- **No Data Yet state** — when no data has been logged for either metric, a 'No Data Yet' state is shown with a `0/7 days` badge, consistent with the Pattern Explorer empty state design.
- **i18n** — `observedPatternsLowDataTitle` and `observedPatternsLowDataSubtitle` added to all 10 language blocks (en, es, fr, de, zh, ja, pt, ar, sw, hi).

### Correlate Tab Design Consistency (from v1.0.63 RTM)
- **Full Record tab design language** — all 5 Correlate sections (InsightEngine, WellnessSummary, PatternExplorer, Observed Historical Patterns, Nutrition Analysis) share the exact same GlassCard shell, LogCard header, chip style, and haptic interaction as the Record tab.
- **Scatter point tap-to-tooltip** — tapping any scatter point in Pattern Explorer shows a tooltip with date, X value, and Y value.
- **Period-over-period trend arrows** — Wellness Summary metric cards show up/down/flat trend arrows comparing current period to previous period.

---

## v1.0.62 (Build 10062) — 2026-06-09

### Correlate Tab Final Polish
- **Evidence Library cards now square** — source cards (PubMed, AHA, Cochrane, WHO, ISSN, AND-EAL) use `aspectRatio: 1` for perfectly square tiles.
- **Uniform chip style across all Correlate tabs** — Evidence Library source tag pills now match Record/WellnessSummary/PatternExplorer chip style (`borderRadius: 20`, `paddingVertical: 5`, `paddingHorizontal: 12`, `fontSize: 12`, `fontWeight: 700`).
- **InsightCardHalf status pill rounded** — status pill inside half-width Insight cards now uses `borderRadius: 20`, consistent with the full chip language across the Correlate tab.

---

## v1.0.61 (Build 10061) — 2026-06-10

### Correlate Tab Polish
- **Wellness Summary moved up** — now appears above Observed Historical Patterns for a more logical reading flow.
- **Uniform section header heights** — InsightEngine, Wellness Summary, and Pattern Explorer headers now use `paddingHorizontal: 16` / `paddingVertical: 14` to match Nutrition Analysis.
- **Pattern Explorer fully translated** — all scoring labels (`scoreAnalysisTitle`, `scoreDataCompleteness`, `scoreTrendStability`, `scoreRelationshipStrength`, `scoreResearchConfidence`, `scoreOverall`, `patternExplorerRangeSubtitle`) translated into all 10 languages.
- **Relationship Strength uses Pearson r** — InsightEngine Relationship Strength score now computed as `|r|×100` from actual chart data, replacing fixed status-based values.
- **Peer-reviewed reference footer removed** — the 'View all sources' footer has been removed from the InsightEngine section for a cleaner layout.

---

## v1.0.60 (Build 10060) — 2026-06-10

### Correlate Tab — Pattern Explorer
- **Pattern Explorer** — new section with 16 evidence-based scatter plots (Sleep → BP, HRV → HR, Weight → BP, Deep Sleep → HRV, and 12 more) across 30/90/180/365-day views with Pearson r, R², and data completeness scores.
- **4-Metric Scoring System** — each InsightEngine card now shows Data Completeness, Trend Stability, Relationship Strength, and Research Confidence scores with animated progress bars and an Overall Score badge.
- **Insight cards always expanded** — first two full-width Insight Engine cards open in expanded state by default.
- **Recovery Trend removed** — the Recovery Trend section has been removed from the Correlate tab.

### Translations & i18n
- **Pattern Explorer + scoring strings** — all new strings (`patternExplorerLabel`, `scoreDataCompleteness`, `scoreTrendStability`, `scoreRelationshipStrength`, `scoreResearchConfidence`, `scoreOverall`, `scoreAnalysisTitle`) translated into all 10 languages.

---

## v1.0.59 (Build 10059) — 2026-06-09

### Correlate Tab Redesign
- **Vibrant glassmorphism insight cards** — fully redesigned with colorful 3D glossy glass cards, emoji icons, impact badges (High / Moderate / Low), citation dots, metric tags, and a mixed full/half-width card layout.
- **Evidence Library grid** — new Evidence Library section displays all 6 evidence-based correlations in a scannable grid with source citations and expandable detail cards.
- **Weekly & Monthly Wellness Summary** — new collapsible Wellness Summary section shows 7-day and 30-day historical averages for all tracked vitals (blood pressure, heart rate, sleep, glucose, weight, steps, sodium, HRV).

### Translations & i18n
- **Full i18n coverage** — all new Correlate tab strings (insight cards, Evidence Library, Wellness Summary) fully translated into all 10 languages (en, es, fr, de, zh, ar, pt, ja, sw, hi).

### Bug Fixes
- **TypeScript null-filter narrowing** — fixed 4 TS errors in `wellness-summary.tsx` where `.filter(v => v > 0)` did not narrow `null` values; replaced with type-guard filters.

---

## v1.0.58 (Build 10058) — 2026-06-09

### Translations & i18n
- **Paywall fully translated** — '14-day free trial', 'Annual', 'Monthly', plan labels, and legal disclosure text now appear in all 10 languages (en, es, fr, zh, pt, ar, sw, hi, de, ja).
- **Onboarding slide 2 fully translated** — scrollable tab labels ('Our Mission', 'Features', "What's New"), 'Tap a tab to explore' prompt, mission body text, and all feature descriptions now translated in all 10 languages.
- **Subscription settings labels translated** — 'Free Version', 'Monthly $4.99/mo', 'Yearly $49.99/yr — includes 14-day free trial', and 'Start 14-day free trial' now translated in all 10 languages.
- **Evidence sources disclaimer banner translated** — the disclaimer text on the Evidence-Based Sources screen is now fully localised in all 10 languages.

### Correlate Tab
- **Apple emoji removed** — the platform branding badge (🍎 / G) has been removed from correlation card headers for a cleaner, less cluttered look.

### Settings — Health Data
- **Evidence-Based Sources moved** — the 'Evidence-Based Sources' row has been moved from the About section to Settings → Health Data, placed just before Pharmacies, for more logical discoverability.

---

## Build 5 — 2026-03-25

### App Store Review Fixes
- **Guideline 2.5.4 (UIBackgroundModes `audio`)** — `expo-video` was configured with `supportsBackgroundPlayback: true` in the previous build, which caused its Expo config plugin to inject `"audio"` into `UIBackgroundModes`. Changed to `supportsBackgroundPlayback: false`. The `withNoBackgroundAudio` config plugin (last in the plugins array) also strips `"audio"` as a safety net.
- **Guideline 2.1a (HealthKit on iPad)** — Added `withHealthKit` config plugin as the second-to-last plugin in `app.config.ts` to explicitly inject the `com.apple.developer.healthkit` and `com.apple.developer.healthkit.background-delivery` entitlements into the `.entitlements` file during EAS managed workflow prebuild. Added an iPad-specific informational banner in the Health Permissions screen noting that HealthKit requires iPadOS 17 or later.

### Infrastructure Fixes
- **pnpm lockfile regenerated** — Lockfile was out of sync with `package.json` after multiple package installs and the `expo-media-library` downgrade, causing `pnpm install --frozen-lockfile` to fail during EAS Build. Regenerated with `pnpm install --no-frozen-lockfile`.
- **`dist/` removed from `.gitignore`** — The compiled server bundle (`dist/index.js`) was excluded from git, causing the backend `start` command to fail silently after deployment. Removed `dist/` from `.gitignore` and rebuilt the bundle.
- **`expo-media-library` downgraded to `~18.2.1`** — `pnpm` resolved `expo-media-library` to `v55.0.10` (SDK 55), which calls `FileSystemUtilities.isReadableFile()` — a method not present in SDK 54's `expo-modules-core`. Downgraded to the SDK 54 compatible `v18.2.1`.

### iOS Build Number
- Bumped `ios.buildNumber` from `"4"` to `"5"`.

---

## Build 4 — 2026-03-20

### Features Added
- **AI Scan UX Enhancements** — AI-estimated nutrition fields highlighted with primary-colour border and "AI ESTIMATED" label; photo URI saved to meal log with thumbnail in history; barcode scan mode added alongside photo and library options.
- **Photo Lightbox** — Tap any meal thumbnail in history to open full-screen lightbox with pinch-to-zoom (1×–5×), double-tap to reset zoom, swipe-down to dismiss, share button, and save-to-camera-roll button.
- **Barcode Product Badge** — After a barcode scan, a product verification card shows the product name, barcode number, and AI confidence level.
- **Sugar Field in AI Card** — `sugarG` added to the AI-Estimated Nutrition card with WHO 25 g/day annotation and daily running total progress bar.
- **Custom Sugar Budget** — User-configurable daily sugar target in Settings → My Profile; persisted to AsyncStorage; used by the WHO annotation and Weekly Sugar Chart.
- **Weekly Sugar Chart** — 7-day bar chart on the Dashboard with budget line, Smart-generated one-line insight, and 🔥 streak badge.
- **Streak Milestone Celebration** — Confetti burst + haptic + milestone banner at 3/7/14/21/30-day streaks; "Share streak card" generates a branded PNG via `expo-print`.
- **Daily Sugar Reminder Notification** — Configurable daily push notification in Settings showing today's sugar total vs. budget; rescheduled on every meal save with the latest total.
- **PDF Export with Date Range Filter** — "Export as PDF" in Nutrition Log history with Last 7 Days / Last 30 Days / All Time picker; PDF includes macro summary table and meal thumbnails.
- **Save to Camera Roll** — `expo-media-library` integration for saving meal photos from the lightbox.

### Bug Fixes
- `expo-media-library` initially installed at SDK 55 version; downgraded to `~18.2.1` to fix Xcode build failure (`FileSystemUtilities.isReadableFile` missing in SDK 54).

---

## Build 3 — 2026-03-15

### Features Added
- Sodium / Nutrition Log screen with Smart photo scan, voice scribe, barcode lookup, and macro tracking.
- `lookupBarcode` server route using LLM to identify packaged food from barcode images.
- `sugarInsight` server route for Smart-generated 7-day sugar trend insight.
- Sugar budget notification module (`lib/health/sugar-notification.ts`).

---

## Build 2 — 2026-03-10

### Features Added
- Bluetooth device sync (glucometer, smart scale, BP monitor) via BLE + HealthKit/Health Connect.
- GPS route mapping for outdoor activities (react-native-maps + expo-location).
- Map app launcher (Apple Maps, Google Maps, Garmin Connect, Strava deep-links).
- Health data entry screens: Weight, Vital Signs, Blood Sugar, Activity.
- Log hub screen with quick stats grid.

### Bug Fixes
- Pinned `expo-task-manager`, `expo-background-fetch`, `expo-file-system`, `expo-linear-gradient`, `expo-local-authentication`, `expo-print`, `expo-sharing` to SDK 54 ranges to fix `TaskManagerModule` protocol conformance and optional `String` unwrapping Xcode errors.

---

## Build 1 — 2026-03-05 (Initial Release)

### Features
- Dashboard with 4 vital cards (BP, Pulse/HRV, Body Composition, Sleep).
- HealthKit (iOS) + Health Connect (Android) integration.
- Correlation Engine with scatter plot and Pearson coefficient.
- Doctor Report PDF generation and CSV export.
- Threshold notifications with background task.
- Biometric app lock (Face ID / Touch ID).
- Dark mode with animated transition.
- Onboarding walkthrough with health permission request.
- Weekly Summary sparkline card on Dashboard.
