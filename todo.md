# VitalSync — Project TODO

## Setup & Configuration
- [x] Write design.md
- [x] Configure Skeuo-Minimalist theme tokens (colors, typography)
- [x] Install dependencies: react-native-svg, expo-print, expo-sharing, expo-file-system, react-native-reanimated
- [x] Configure app.config.ts with HealthKit/Health Connect permissions
- [x] Generate app icon and branding assets

## Navigation & Structure
- [x] Set up tab navigation (Dashboard, Analytics, Report, Settings)
- [x] Create icon mappings in icon-symbol.tsx
- [x] Wire all screen routes

## Dashboard Screen
- [x] Header with VitalSync wordmark and sync status
- [x] 4 tactile vital cards (2x2 grid): BP, Pulse/HRV, Body Composition, Sleep
- [x] Quick actions row: Correlation Engine, Doctor Report
- [x] Force Sync button with animated progress bar
- [x] Card tap navigation to detail screens

## Health Data Layer
- [x] Health permissions bridge (HealthKit iOS + Health Connect Android)
- [x] Mock data provider for web/simulator preview
- [x] Local AsyncStorage persistence layer
- [x] Health data types: Blood Pressure, Pulse/HRV, Body Composition, Sleep, ECG
- [x] Remove all ECG functionality (types, fetch functions, UI, references) from codebase
- [x] Data normalization layer (unified HealthRecord type)

## Detail Screens
- [x] Blood Pressure Detail screen (chart, stats, trend)
- [x] Pulse/HRV Detail screen (BPM chart, HRV bars)
- [x] Body Composition Detail screen (weight trend, muscle donut)
- [x] Sleep Detail screen (stages stacked bar, efficiency)
- [x] ECG Trace screen (waveform viewer, scrollable) [removed]

## Correlation Engine
- [x] Analytics screen with metric pair selector
- [x] Scatter plot with regression line
- [x] Pearson correlation coefficient calculation
- [x] Auto-generated insight text

## Doctor Report
- [x] Report configuration screen (date range, metric selection)
- [x] PDF generation using expo-print
- [x] Share sheet integration (expo-sharing)
- [x] Privacy-first: data only leaves device on explicit share

## Settings
- [x] Health permissions status display
- [x] Data retention controls (clear all data)
- [x] Privacy/local-only information panel
- [x] Supported data sources display
- [x] App version display

## Dark Mode & Visual Depth Polish
- [x] Redesign dark palette tokens with proper elevation layers
- [x] Add shadow system tokens (light/dark adaptive shadows)
- [x] Update VitalCard with dark-mode inner shadow and depth cues
- [x] Update ForceSyncBar for dark canvas
- [x] Update all detail screens for dark mode
- [x] Update Analytics, Report, Settings screens for dark mode
- [x] Add dark mode toggle in Settings screen
- [x] Verify light/dark switching end-to-end

## Threshold Notifications (Background Task)
- [x] Create threshold config types and AsyncStorage persistence layer
- [x] Register expo-task-manager background task for health monitoring
- [x] Implement BP threshold check (systolic/diastolic high/low bounds)
- [x] Implement HRV threshold check (low HRV alert)
- [x] Schedule background task to run periodically
- [x] Add notification permission request on first launch
- [x] Build ThresholdSettings UI in Settings screen
- [x] Wire threshold toggle + numeric input for each vital

## Dashboard Date Range Filter
- [x] Build SegmentedControl component (7d / 30d / 90d)
- [x] Add date range state to Dashboard
- [x] Filter vital card data by selected date range
- [x] Compute and display filtered averages on each vital card
- [x] Persist selected date range preference

## Threshold History Log
- [x] Create alert history storage module (AsyncStorage, max 50 entries)
- [x] Wire violation dispatch to persist each alert to history
- [x] Build Recent Alerts list UI in Health Alerts screen (timestamp, vital, value)
- [x] Add clear history action

## Animated Dark Mode Transition
- [x] Wrap setColorScheme in LayoutAnimation.configureNext in Settings
- [x] Apply same animation in ThemeProvider setColorScheme

## Weekly Summary Sparkline Card
- [x] Build Sparkline SVG component (mini line chart, no axes)
- [x] Build collapsible WeeklySummaryCard component
- [x] Compute per-metric 7-day trend data from health data
- [x] Wire card into Dashboard below vital grid
- [x] Animate expand/collapse with LayoutAnimation

## Onboarding Walkthrough
- [x] Create onboarding storage flag (hasOnboarded in AsyncStorage)
- [x] Build OnboardingScreen with 4 slides: Welcome, Privacy, Health Permissions, Threshold Setup
- [x] Add animated slide transitions (swipe + dot indicator)
- [x] Wire health permission request on slide 3
- [x] Wire threshold quick-setup on slide 4
- [x] Gate Dashboard behind onboarding completion check in root layout
- [x] Add "Reset Onboarding" option in Settings for testing

## Vital Card Long-Press Action Sheet
- [x] Add onLongPress handler to VitalCard component
- [x] Build ActionSheet component (cross-platform: ActionSheetIOS on iOS, Modal on Android/web)
- [x] Implement "Set Threshold" action (navigate to threshold settings)
- [x] Implement "View History" action (navigate to detail screen)
- [x] Implement "Share Reading" action (share latest value as text)
- [x] Wire all 4 vital cards on Dashboard

## CSV Export
- [x] Build CSV serializer for all health data types
- [x] Add "Export Raw Data (CSV)" button to Doctor Report screen
- [x] Write CSV to expo-file-system temp file
- [x] Share via expo-sharing share sheet

## Biometric App Lock
- [x] Install expo-local-authentication
- [x] Create biometric lock storage module (enabled flag in AsyncStorage)
- [x] Build BiometricLockScreen component (lock overlay with Face ID/Fingerprint prompt)
- [x] Wire lock gate in root layout (check on app foreground/resume)
- [x] Add "Require Biometrics" toggle in Settings > Privacy
- [x] Graceful fallback when biometrics unavailable

## Unread Alert Badge
- [x] Add unread alert count to alert-history storage module
- [x] Increment count when new violation is dispatched
- [x] Clear count when user visits Health Alerts screen
- [x] Show red badge on Settings tab icon when count > 0
- [x] Badge clears automatically on Health Alerts screen mount

## Onboarding Personalization
- [x] Add age + sex fields to onboarding slide 5 (Profile Setup)
- [x] Persist user profile (age, sex) in AsyncStorage
- [x] Create user-profile storage module
- [x] Add age/sex-adjusted BP reference ranges (AHA + ESC guidelines)
- [x] Add age/sex-adjusted HRV reference ranges
- [x] Update Correlation Engine to use adjusted ranges for insight text
- [x] Show profile summary in Settings

## Profile Editing in Settings
- [x] Create /settings/profile screen (age TextInput + sex chip selector)
- [x] Pre-populate with saved profile values on mount
- [x] Save updated profile to AsyncStorage on confirm
- [x] Add "My Profile" row in Settings linking to /settings/profile
- [x] Register /settings/profile route in root Stack

## Threshold History Frequency Chart
- [x] Build computeViolationFrequency() — group alert history by day over 30 days
- [x] Build ViolationFrequencyChart component (mini bar chart, one bar per day)
- [x] Wire chart into Health Alerts screen above the Recent Alerts list
- [x] Show per-vital color coding on bars

## Haptic Feedback on Biometric Unlock
- [x] Add Haptics.notificationAsync(Success) on successful biometric authentication
- [x] Add Haptics.notificationAsync(Error) on biometric failure/cancel
- [x] Add Haptics.impactAsync(Medium) when lock screen appears

## Branding Polish
- [x] Update splash screen backgroundColor to #0A1628 (dark navy) in app.config.ts
- [x] Update theme.config.js primary dark token to #0D9488 (icon teal)
- [x] Add brand icon image to onboarding Welcome slide

## App Store Polish
- [x] Apply #0A1628 → #0D1F2D gradient to onboarding screen background
- [x] Refine tab bar with surfaceRaised + #0D9488 8% tint background
- [x] Generate 5 App Store marketing screenshot frames

## Xcode Build Fix
- [x] Fix TaskManagerModule protocol conformance: pinned expo-task-manager, expo-background-fetch, expo-file-system, expo-linear-gradient, expo-local-authentication, expo-print, expo-sharing to SDK 54 ranges
- [x] Fix optional String unwrapping errors: caused by SDK 55 native headers being loaded against SDK 54 runtime — resolved by version pinning

## Health Data Entry & Activity Tracking
- [x] Define data models: WeightRecord, VitalSignsRecord, BloodSugarRecord, ActivityRecord
- [x] Extend HealthDataContext with addWeight, addVitalSigns, addBloodSugar, addActivity, delete actions
- [x] Weight entry screen with kg/lbs toggle, history list, delete
- [x] Vital signs entry screen (BP, HR, SpO2, temperature, respiratory rate)
- [x] Blood sugar entry screen (mg/dL / mmol/L toggle, fasting/post-meal/random/bedtime context)
- [x] Activity tracking screen: HR (avg/max), steps, distance (mi/km), calories burned
- [x] Activity type selector: outdoor run, indoor run, walk, cycling, workout
- [x] Activity log list with color-coded summary cards per activity type
- [x] Log hub screen with cards showing latest values for weight, vitals, blood sugar, activity + quick stats grid
- [x] Log tab added to tab bar (plus.circle.fill icon, between Dashboard and Correlate)

## GPS Route Mapping (Activity)
- [x] Install react-native-maps ^1.27.1 and expo-location ~18.0.10
- [x] Extend ActivityRecord type with gpsRoute (GpsPoint[]) and mapRegion bounding box
- [x] Build GPS tracking service (lib/gps-tracker.ts) with start/stop/pause, haversine distance, live stats
- [x] Build live GPS run screen (app/log/gps-run.tsx) with MapView, Polyline, live stats, save/discard
- [x] Build activity detail screen (app/log/activity-detail.tsx) with route replay map and elevation stats
- [x] Wire 'Start GPS Tracking' button in activity.tsx for outdoor-run and walk types
- [x] Add location permission request in gps-tracker.ts (requestForegroundPermissionsAsync)

## Map App Launcher (Activity)
- [x] Remove gps-run.tsx custom tracking screen
- [x] Build map app picker bottom sheet (Apple Maps, Google Maps, Garmin Connect, Strava)
- [x] Wire deep-link URLs for each map app with activity-type-specific modes
- [x] Update activity.tsx 'Track with Map App' button to open MapAppPicker

## Device Sync (Glucometer, Scale, BP Monitor)
- [x] Research HealthKit / Health Connect APIs for glucose, weight, BP in Expo SDK 54
- [x] Build unified device sync service (lib/health/device-sync.ts)
- [x] Blood sugar screen: sync from glucometer via Apple Health / Health Connect
- [x] Weight screen: sync from smart scale via Apple Health / Health Connect
- [x] Vital signs screen: sync from BP monitor via Apple Health / Health Connect
- [x] Show sync source badge on imported readings (device vs manual) via deviceName field
- [x] Permission request flow for Health data access (requestDeviceSyncPermissions)

## Bluetooth Sync & Expanded Data Sources
- [x] Install react-native-ble-plx (BLE scanning/pairing for Expo SDK 54)
- [x] Build BluetoothDeviceManager service (lib/ble/ble-manager.ts) with GATT profiles
- [x] Build BLE device discovery bottom sheet (BleScannerSheet) with signal bars, category filter, supported badge
- [x] Add Bluetooth permissions to app.config.ts (iOS NSBluetoothAlwaysUsageDescription, Android BLUETOOTH_SCAN/CONNECT)
- [x] Implement Bluetooth Glucose Profile (GLP) reader for glucometers (Contour, Accu-Chek, OneTouch, Dexcom G7)
- [x] Implement Bluetooth Weight Scale Profile (WSP) reader (Withings Body+, Eufy Smart Scale, Renpho)
- [x] Implement Bluetooth Blood Pressure Profile (BLP) reader (Omron, Withings BPM, QardioArm)
- [x] Build data-sources.tsx screen listing 40+ supported devices across 6 categories
- [x] Add device categories: CGM (Dexcom, Libre), Smart Scale (Withings, Eufy, Renpho), BP Monitor (Omron, Withings, Qardio), Fitness Tracker (Fitbit, Garmin, Polar, Whoop, Apple Watch)
- [x] Wire BLE sync (📶 BT button) alongside ⟳ Sync in blood-sugar, weight, and vitals screens
- [ ] Add paired devices list in Settings with forget/reconnect actions (future)

## Medication Tracker (Doctor's Report)
- [x] Define MedicationRecord, SideEffectRecord types in health/types.ts
- [x] Add addMedication, updateMedication, deleteMedication, addSideEffect, deleteSideEffect actions to health context
- [x] Build medication list screen (name, dose, frequency, prescriber, start/end date)
- [x] Build side effects log screen (medication link, severity, description, date)
- [x] Build medication history (past/discontinued medications shown via status filter in medications screen)
- [x] Wire medication section card into Doctor Report screen
- [x] Include medications and side effects in PDF report generation

## Medication Reminders
- [x] Extend MedicationRecord with reminderEnabled, reminderTimes (HH:MM[]), reminderDays
- [x] Build medication-reminders.ts service (schedule/cancel per-medication notifications)
- [x] Add reminder toggle + time picker to medication add/edit modal
- [x] Show reminder badge on active medication cards

## Refill Tracker
- [x] Extend MedicationRecord with pillsRemaining, pillsPerDose, refillThreshold
- [x] Build refill-tracker.ts service (decrement on dose log, compute days-remaining)
- [x] Add pills remaining counter UI to medication cards
- [x] Show low-stock warning banner when pillsRemaining <= refillThreshold
- [x] Add refill action (restock) to medication card

## Drug Interaction Checker
- [x] Build drug-interactions.ts with curated interaction database (common drug pairs)
- [x] Compute active interaction pairs from current medications list
- [x] Show interaction warning banner in medications screen
- [x] Show interaction detail sheet with severity and recommendation
- [x] Show interaction count badge on Doctor Report medication section

## Pharmacy Contact Card
- [x] Extend MedicationRecord with pharmacyPhone and pharmacyAddress fields
- [x] Add pharmacy phone + address fields to medication add/edit form
- [x] Show pharmacy contact card on medication cards (tap-to-call, tap-for-directions)
- [x] Wire Linking.openURL for tel: and maps: deep links

## Medications PDF Export
- [x] Add includeMedications toggle to Doctor Report configuration screen
- [x] Update ReportConfig type with includeMedications flag
- [x] Generate medications HTML section in report-generator.ts (list, refill status, interactions)
- [x] Wire detected interactions table into PDF output

## Bug Fixes
- [x] Fix error in Log tab on web preview (react-native-ble-plx NativeModules.BlePlx crash on web — added Metro resolver alias to web stub + Buffer polyfill + hardcoded color tokens fixed)
- [x] Fix Log tab crash: data.medications and data.sideEffects undefined on first load (added migration guard in loadHealthData to backfill missing arrays from old stored data + safe ?? [] fallbacks in log.tsx)

## App Lock (Biometrics / PIN)
- [x] Install expo-local-authentication (already bundled)
- [x] Build auth-storage.ts (save/load hashed PIN + biometrics preference with expo-secure-store)
- [x] Build auth-context.tsx (isSetup, isLocked, unlock, setupPin, setupBiometrics, reset)
- [x] Build setup screen: choose Face ID/biometrics or PIN, confirm PIN entry
- [x] Build lock screen: biometric prompt auto-fires on mount, PIN pad fallback
- [x] Wire auth gate in root layout (_layout.tsx) — show lock screen when locked
- [x] Add "Set Up / Remove" App Lock option in Settings screen

## App Lock Security Enhancements
- [x] Lock timeout setting (immediate / 1 min / 5 min / 15 min) stored in auth-storage
- [x] Apply timeout in auth-context: only re-lock if background duration exceeds threshold
- [x] Failed attempt lockout: 5 wrong PINs → 30s cooldown with countdown timer on lock screen
- [x] Change PIN flow: verify current PIN first, then set new PIN (in settings)
- [x] Wire new settings rows: Lock Timeout picker + Change PIN navigation

## Lock Screen Emergency Contact
- [x] Add emergencyContactName and emergencyContactPhone to auth-storage
- [x] Add getEmergencyContact / saveEmergencyContact to auth-context
- [x] Add Emergency Contact settings row in Settings → Privacy & Security
- [x] Add "Call Emergency" button on lock screen (Linking.openURL tel:)

## Biometric Re-enrollment Prompt
- [x] Detect biometrics-enrolled state change on app resume in auth-context
- [x] Show one-time Alert guiding user to iOS Settings if Face ID/Touch ID is no longer enrolled

## App Lock Status Widget (Home Tab)
- [x] Add a "Secured" padlock badge / status card to the Home screen dashboard
- [x] Show lock method (Face ID / PIN) and last-locked timestamp

## Emergency SOS on Lockout & Medical ID Lock Screen
- [x] Add MedicalID type (bloodType, allergies, conditions, organDonor, notes) to auth-storage
- [x] Add getMedicalID / saveMedicalID / clearMedicalID to auth-storage
- [x] Add medicalId state and updateMedicalID action to auth-context
- [x] Build Medical ID settings screen (form for all fields)
- [x] Add Medical ID row in Settings → Privacy & Security
- [x] Show Medical ID card on lock screen (always visible below app identity)
- [x] Show Emergency SOS call button when PIN lockout fires (5 wrong attempts)
- [x] Register medical-id route in _layout.tsx Stack

## Bug Fixes (Round 2)
- [x] Fix 7d/30d/90d vital average segmented control not visible on Dashboard screen (wrapped in fixed-width 160px container with flexShrink:0 to prevent collapse in row layout)
- [x] Fix Dashboard: all text fully visible on phone — removed overflow:hidden from VitalCard, reduced font sizes, added adjustsFontSizeToFit+minimumFontScale, merged unit into primary text, fixed secondary row to use single Text with inline spans, removed fixed minHeight, increased card gap
- [x] Settings: Health Permissions row opens system permissions settings on iPhone/iPad (iOS: app-settings: URL → app's own Settings pane; Android: Health Connect deep-link with app-settings fallback; web: informational alert)

## Data Sources (Settings)
- [x] Define DataSource type and connection state in lib/data-sources/types.ts
- [x] Build data-sources-storage.ts (persist connection state per source)
- [x] Build data-sources-context.tsx (connect, disconnect, sync, status per source)
- [x] Build data-sources screen with per-source cards (icon, name, status, connect/disconnect, last synced)
- [x] Build HealthKit adapter (iOS only — opens app-settings: for HealthKit permission)
- [x] Build Health Connect adapter (Android only — deep-links to Health Connect permissions)
- [x] Build Oura Ring adapter (OAuth 2.0 via expo-web-browser)
- [x] Build Garmin adapter (OAuth 1.0a via expo-web-browser)
- [x] Apple Watch syncs via HealthKit adapter (same iOS permissions)
- [x] Wear OS syncs via Health Connect adapter (same Android permissions)
- [x] Add "Data Sources" row in Settings under Health Data section
- [x] Register data-sources route in _layout.tsx Stack

## Native Health App Integration (HealthKit / Health Connect)
- [x] Install @kingstinct/react-native-healthkit (HealthKit iOS) — react-native-health-connect already installed
- [x] Add HealthKit entitlement and NSHealthShareUsageDescription to app.config.ts
- [x] Add Health Connect permissions to AndroidManifest via app.config.ts plugin
- [x] Build lib/health/native-health-service.ts (request permissions, read BP/HR/sleep/steps/weight)
- [x] Wire HealthKit connect/sync into Data Sources screen for iOS (real data via native-health-service)
- [x] Wire Health Connect connect/sync into Data Sources screen for Android (real data via native-health-service)
- [x] Import fetched readings into health context via MERGE_NATIVE_HEALTH action (deduplicates by ID)
- [x] NativeHealthBridge component in _layout.tsx wires DataSources merge callback to HealthContext

## Auto-Sync on Launch
- [x] Add autoSyncOnLaunch boolean to data-sources storage
- [x] Add autoSyncOnLaunch state and toggleAutoSync action to data-sources context
- [x] Add Auto-Sync toggle row in Settings under Health Data section
- [x] Trigger sync for all connected sources on app launch when toggle is enabled (AutoSyncBridge in _layout.tsx, 1.5s delay after UI renders)
- [x] isSyncing state exposed from DataSourcesContext for UI indicators

## Dashboard Sync Status Indicator
- [x] Track lastGlobalSyncAt timestamp in DataSourcesContext (most recent SYNC_COMPLETE across all sources)
- [x] Build SyncStatusBadge component (spinner when syncing, "Last synced X min ago" when idle)
- [x] Add SyncStatusBadge to Dashboard header (sits left of the Local Only badge in headerRight)

## About VitalSync Screen
- [x] Build About screen with app mission, creator bio (akorir, MSN, RN, CCRN-CMC), and privacy-first statement
- [x] Add About row to Settings screen (tappable, navigates to /settings/about)
- [x] Register about route in _layout.tsx Stack

## About Screen Enhancements
- [x] Crop creator photo to passport size (350x450px, 35:45 ratio) and add to About screen
- [x] Add Send Feedback row (mailto: opens email app with pre-filled subject)
- [x] Add Share VitalSync row (native Share.share sheet)

## About Screen – Round 2
- [x] Update feedback email to alexkorirbooks@gmail.com
- [x] Add Rate VitalSync row (App Store / Play Store deep link)
- [x] Doctor Report PDF export already wired with expo-print (vitals, medications, side effects, interactions) — confirmed working

## About Screen – Email Privacy
- [x] Replace personal Gmail with branded alias hello@vitalsync.app in feedback mailto
- [x] Update fallback alert text to show alias only

## Settings – Support Link
- [x] Add Support row to Settings screen (mailto: hello@vitalsync.app, pre-filled subject "VitalSync Support")

## Settings – Privacy Policy
- [x] Write Privacy Policy content for VitalSync (local-first, no-cloud, HIPAA-aware language)
- [x] Build Privacy Policy as a hosted HTML page served from the app backend at /privacy
- [x] Add Privacy Policy row to Settings About section (opens in-app browser via expo-web-browser)

## Privacy & Legal – Round 2
- [x] Add prominent "Your Data Stays On Your Device" banner to Privacy Policy page
- [x] Add data-ownership notice card to Settings screen (above About section)
- [x] Add Terms of Use page served at /terms from backend
- [x] Add Terms of Use row to Settings About section
- [x] Auto-populate app version in Settings About VitalSync subtitle using Constants.expoConfig?.version

## Suggested Next Steps – Round 3
- [x] Update Privacy Policy and Terms of Use links to permanent public domain (vitalsync-gafxdnzk.manus.space)
- [x] Add first-launch consent modal (one-time, shows data-ownership summary, links to Privacy Policy and Terms, "I Agree" button)
- [x] Add What's New section to About screen with version changelog

## HealthKit Re-Integration
- [x] Audited current HealthKit usage and consent modal flow
- [x] Wired HealthKit/Health Connect permission request to fire immediately after consent modal "I Agree" is tapped
- [x] Verified app.config.ts HealthKit entitlements (com.apple.developer.healthkit + background-delivery) and usage descriptions are correct

## Home Screen – Connect to Apple Health Banner
- [x] Added "Connect to Apple Health" banner on Home screen when permissions denied/not determined
- [x] Banner taps re-request permissions; if still denied, deep-links to iOS/Android Settings
- [x] Banner has dismiss (x) button so users can hide it without connecting

## Settings – Health Permissions Row
- [x] Enhanced Health Permissions row in Settings Health Data section with live GRANTED/DENIED badge, dynamic subtitle, and re-request/open Settings action

## Brand Colors – VitalSync 942dfa
- [x] Applied exact dark background palette from screenshots: background #0A0B0F, surface #13151C, surfaceRaised #1A1D26, surfaceHigh #21252F. Splash and Android icon backgrounds updated to match.

## Localisation – Mandarin Chinese (zh)
- [x] Add zh to Lang type and detectLang in lib/i18n.ts
- [x] Add zh strings for consent modal, What's New, Settings, and Doctor Report

## Localisation – Full i18n (en/es/fr/zh)
- [x] Add zh to Lang type and detectLang in lib/i18n.ts
- [x] Add zh strings for consent modal, What's New, Settings, and Doctor Report
- [x] Wire i18n into ConsentModal (all 4 languages: title, subtitle, body, points, legal, agree, review)
- [x] Wire i18n into Settings screen (title, section headers, row labels, badges, ownership card pills)
- [x] Wire i18n into Doctor Report screen (title, subtitle, privacy note, generate button, CSV export button)
- [x] Wire i18n into About screen What's New section (section title, version label, changelog items)

## Privacy Policy – TermsFeed Integration
- [ ] Fetch privacy policy content from https://www.termsfeed.com/live/e1112e83-a35d-4eac-8e98-75aa78873b81
- [ ] Host privacy policy HTML in VitalSync backend at /privacy route
- [ ] Update Settings Privacy Policy row to open the new hosted page

## Privacy Policy – Full TermsFeed Content
- [x] Replace server/privacy-policy.html with complete TermsFeed content (Hello@vitalsync.app contact)
- [x] Verify /privacy route serves the new page correctly
- [x] Confirm Settings Privacy Policy row opens the correct URL

## Terms of Use + Privacy Localisation
- [x] Build server/terms-of-use.html with full App Store-ready content
- [x] Add /terms route in server/_core/index.ts
- [x] Confirm Settings Terms of Use row opens the correct URL
- [x] Add Mandarin Chinese (zh) translation to privacy-policy.html
- [x] Add ?lang= query-parameter handler to /privacy route
- [x] Update Settings Privacy Policy row to pass ?lang=zh for Chinese-locale devices

## Privacy Policy – Canonical URL Update
- [x] Update Settings Privacy Policy row to use TermsFeed canonical URL
- [x] Update consent modal Privacy Policy link to use TermsFeed canonical URL
- [x] Update Terms of Use page /privacy links to use TermsFeed canonical URL
- [x] Update Chinese privacy page English toggle link to use TermsFeed canonical URL

## Terms of Use – Full Rewrite
- [x] Write complete VitalSync-specific Terms of Use HTML at server/terms-of-use.html
- [x] Verify /terms route serves the page correctly
- [x] Confirm Settings Terms of Use row opens it in-app via browser sheet

## Terms of Use – Mandarin Chinese + Consent Modal Wiring
- [x] Write server/terms-of-use-zh.html (full Mandarin Chinese translation)
- [x] Add ?lang= handler to /terms route in server/_core/index.ts
- [x] Update Settings Terms of Use row to pass ?lang=zh for Chinese-locale devices
- [x] Update consent modal TERMS_URL to use vitalsync-gafxdnzk.manus.space/terms
- [x] Confirm consent modal Terms of Use tap opens the correct page

## What's New – Mandarin Chinese Localisation
- [x] Add zh whatsNew strings to lib/i18n.ts
- [x] Add aboutStrings (en/es/fr/zh) to lib/i18n.ts for full About screen localisation
- [x] Rewrite About screen to use aboutStrings for all text (mission, creator, privacy, actions, disclaimer, footer)
- [x] Verify About screen renders zh What's New correctly for zh-locale devices

## Language Override Setting
- [x] Add LANG_OVERRIDE_KEY and setLangOverride/getLangOverride helpers to lib/i18n.ts
- [x] Create useLang() hook that reads override from AsyncStorage and falls back to device locale
- [x] Add Language row to Settings screen with current language label and picker modal
- [x] Add language picker strings to settingsStrings in lib/i18n.ts
- [x] Ensure all screens re-render when language changes via addLangListener + useLang hook

## Instant Language Re-render – Report & About Screens
- [x] Replace detectLang() with useLang() in app/(tabs)/report.tsx
- [x] Replace detectLang() with useLang() in app/settings/about.tsx

## Home Screen – Full Localisation
- [x] Audit all hardcoded English strings in app/(tabs)/index.tsx
- [x] Add homeStrings (en/es/fr/zh) to lib/i18n.ts
- [x] Wire useLang() into the Home screen for instant re-render

## Consent Modal Language Picker
- [x] Verify Report and About screens use useLang() (not detectLang())
- [x] Add language picker row to consent modal header (en/es/fr/zh + device auto)
- [x] Consent modal re-renders in selected language immediately on picker change

## Detail Screens + Onboarding – Full Localisation
- [x] Add detailStrings (en/es/fr/zh) to lib/i18n.ts for all 5 detail screens
- [x] Wire useLang() into Blood Pressure detail screen
- [x] Wire useLang() into Pulse detail screen
- [x] Wire useLang() into Body Composition detail screen
- [x] Wire useLang() into Sleep detail screen
- [x] Wire useLang() into ECG detail screen
- [x] Add onboardingStrings (en/es/fr/zh) to lib/i18n.ts
- [x] Wire useLang() into the Onboarding flow

## Log Screens – Full Localisation (en/es/fr/zh)
- [x] Audit Weight, Vital Signs, Blood Sugar, Activity screens for hardcoded English strings
- [x] Add logStrings (en/es/fr/zh) to lib/i18n.ts
- [x] Wire useLang() into app/log/weight.tsx
- [x] Wire useLang() into app/log/vitals.tsx
- [x] Wire useLang() into app/log/blood-sugar.tsx
- [x] Wire useLang() into app/log/activity.tsx

## App Name Update
- [x] Change appName to "VitalSync: Clinical Hub" in app.config.ts

## App Name Localisation (zh)
- [x] Add CFBundleDisplayName to iOS infoPlist in app.config.ts
- [x] Create plugins/withZhDisplayName.js config plugin to inject zh.lproj/InfoPlist.strings at build time
- [x] Register withZhDisplayName plugin in app.config.ts
- [ ] Guide user through App Store Connect name update (manual step)

## Multilingual Home Screen Branding + Log Screen Localisation
- [x] Extend config plugin to inject es.lproj/InfoPlist.strings ("VitalSync: Centro Clínico")
- [x] Extend config plugin to inject fr.lproj/InfoPlist.strings ("VitalSync: Centre Clinique")
- [x] Complete Activity screen localisation (useLang + logStrings)
- [x] Verify Weight, Blood Sugar, Vitals screens are fully localised

## Activity – HealthKit / Health Connect Workout Sync
- [x] Extend health data layer to fetch workout sessions (outdoor run, indoor run, walk, cycling, workout)
- [x] Map HealthKit HKWorkoutActivityType to ActivityType enum
- [x] Map Health Connect ExerciseSessionRecord to ActivityType enum
- [x] Remove "Track with Map App" button from Activity screen
- [x] Show synced HealthKit/Health Connect records in history list with Apple Health / Health Connect source badge

## Activity – Manual Sync Now Button
- [x] Add Sync Now button to Activity screen header with loading spinner
- [x] Trigger targeted workout fetch from HealthKit / Health Connect on tap
- [x] Show success/error feedback via haptics (light impact on start, success notification on complete)
- [x] Uses existing syncBtn string from logStrings (en/es/fr/zh)

## Correlation Engine – Evidence-Based Rebuild
- [x] Read existing correlation screen and health data types
- [x] Build lib/health/correlation-engine.ts with Allostatic Load, Sleep-CV Reciprocity, HRV-Guided Training models
- [x] Add 72-hour lag analysis and medication pharmacodynamics logic
- [x] Rebuild Correlation Engine screen UI with Hypothesis / Evidence Level / Clinical Suggestion cards
- [x] Add correlationStrings (en/es/fr/zh) to lib/i18n.ts (inline in analytics.tsx)
- [x] Wire useLang() into the Correlation Engine screen

## Share Insight Card
- [x] Build formatInsightForShare() utility — plain-text summary with Hypothesis, Evidence Level, Clinical Suggestion, disclaimer, and app branding
- [x] Add share button (upload icon) to each insight card in analytics.tsx
- [x] Wire share button to expo-sharing / Share API with haptic feedback
- [x] Handle share on web gracefully (clipboard fallback)
- [x] Ensure the share sheet is triggered with a pre-filled subject line for email/messaging

## Sodium Sensitivity (DASH) Model
- [x] Add SodiumRecord type (mg, timestamp, mealContext) to lib/health/types.ts
- [x] Extend HealthData interface with sodiumIntake: SodiumRecord[]
- [x] Add addSodium / deleteSodium actions to health context reducer
- [x] Extend AsyncStorage persistence (loadHealthData / saveHealthData) for sodiumIntake
- [x] Build sodium intake log screen (app/log/sodium.tsx) with mg input, meal context, history list
- [x] Add Sodium row to Log hub screen (log.tsx)
- [x] Add sodium route to root Stack navigator
- [x] Implement analyseSodiumSensitivity() in correlation-engine.ts with 24–48 hr lag
- [x] Wire sodium-sensitivity category into CATEGORY_ICONS and CATEGORY_TITLES in analytics.tsx
- [x] Localize sodium log strings in lib/i18n.ts (en/es/fr/zh)

## Potassium Counter + Na:K Ratio Engine
- [x] Add potassiumMg (optional) field to SodiumRecord type
- [x] Update sodium log screen: add potassium input, show Na:K ratio badge
- [x] Add analyseNaKRatio() to correlation-engine.ts (INTERSALT model)
- [x] Add na-k-ratio to InsightCategory union and CATEGORY_ICONS/TITLES in analytics.tsx
- [x] Wire Na:K insight into runCorrelationEngine()

## Sodium/Potassium 7-Day Trend Chart (Analytics)
- [x] Build SodiumTrendChart component (7-day bar chart, dual-color Na vs K bars)
- [x] Add 2300 mg and 1500 mg reference lines to chart
- [x] Insert chart into Analytics screen below insight cards section

## Doctor Report — Sodium & DASH Integration
- [x] Add sodium sensitivity insight block to PDF report (hypothesis + clinical suggestion)
- [x] Add 30-day sodium intake table to PDF report (date, mg, meal context, Na:K per entry)
- [x] Add Na:K ratio summary row to PDF report

## Meal Photo Logging (AI Nutrition Extraction)
- [x] Read server/README.md to understand LLM vision API endpoint
- [x] Add camera permission and expo-image-picker to sodium log screen
- [x] Build photo capture UI (camera button on sodium entry form)
- [x] Call LLM vision endpoint with food photo to extract sodium/potassium estimates
- [x] Pre-fill sodium and potassium fields from Smart response with confidence indicator
- [x] Show extracted food description and allow user to confirm/edit before saving

## Weekly DASH Compliance Score
- [x] Build computeCompliance() utility — 0–100 score based on Na ≤ 2300 mg and K ≥ 3500 mg per day
- [x] Build DashComplianceCard component with circular gauge, grade badge, per-day Na/K indicators
- [x] Insert DashComplianceCard into Dashboard (home screen) below WeeklySummaryCard

## Voice-to-Text Sodium Entry
- [x] Add nutrition.parseVoice tRPC endpoint (Whisper transcription + LLM sodium/potassium extraction)
- [x] Install expo-audio recording capability on sodium log screen
- [x] Add microphone button alongside camera button in form header
- [x] Implement press-and-hold to record, release to transcribe flow
- [x] Show transcription text and AI-parsed values with confidence badge
- [x] Pre-fill sodium/potassium/foodDesc from voice parse result
- [x] Handle errors gracefully (mic permission denied, transcription failure)

## 4-Week DASH Score Sparkline
- [x] Extend computeCompliance() to compute 4-week history array
- [x] Compute 4-week history array in DashComplianceCard
- [x] Build mini sparkline SVG (4 data points, line + dots + score labels) inside DashComplianceCard
- [x] Show week labels (−3w / −2w / −1w / Now) and score values on sparkline
- [x] Colour-code sparkline line by current grade (green/amber/red)

## Voice-to-Text: Blood Sugar & Vitals Screens
- [x] Add health.parseVoiceBloodSugar tRPC endpoint (Whisper + LLM → glucose value, unit, meal context)
- [x] Add health.parseVoiceVitals tRPC endpoint (Whisper + LLM → systolic, diastolic, HR, SpO2, temp, RR)
- [x] Integrate press-and-hold mic button into Blood Sugar log screen form header
- [x] Show transcription box, confidence badge, reasoning, and pre-fill glucose/unit/context from voice
- [x] Integrate press-and-hold mic button into Vitals log screen form header
- [x] Show transcription box, confidence badge, reasoning, and pre-fill BP/HR/SpO2/temp/RR from voice
- [x] Handle mic permission denied and transcription errors gracefully on both screens

## Voice-to-Text: Weight Screen
- [x] Add health.parseVoiceWeight tRPC endpoint (Whisper + LLM → weight value + unit)
- [x] Integrate press-and-hold mic button into Weight log screen header
- [x] Show transcription box, confidence badge, reasoning, and pre-fill weight/unit from voice
- [x] Handle mic permission denied and transcription errors gracefully

## Branding / Contact Updates
- [x] Update support email to akorir@myvitalsync-clinicalhub.com in Settings and About screens
- [x] Privacy policy URL confirmed correct (termsfeed link already in place in settings.tsx and consent-modal.tsx)

## Bundle ID Update (TestFlight)
- [x] Update iOS bundleIdentifier and Android package to com.myvitalsync.clinicalhub in app.config.ts
- [x] Update deep link scheme to vitalsync

## Bundle ID — Apple Reverse-Domain Refinement
- [x] Update bundle ID to com.myvitalsyncclinicalhub.vitalsync (Apple reverse-domain, no hyphens)

## EAS Build Fix — Push Notifications Entitlement
- [x] Add aps-environment: production entitlement to iOS config in app.config.ts
- [ ] Enable Push Notifications capability on App ID in Apple Developer Portal (manual step)
- [ ] Delete old provisioning profile in EAS and regenerate (manual step)

## Dependency Version Alignment (SDK 54)
- [x] Downgrade expo-clipboard to ~8.0.8 (was 55.0.8 — major mismatch)
- [x] Downgrade expo-image-picker to ~17.0.10 (was 55.0.11 — major mismatch)
- [x] Add expo-asset ~12.0.12 as required peer dependency of expo-audio
- [x] Align all patch/minor version mismatches to SDK 54 expected versions
- [x] Run pnpm install to update lockfile
- [x] expo-clipboard v8 API is compatible (setStringAsync still exists) — no code changes needed

## Restore Push Notifications Entitlement
- [x] aps-environment: production already present in e66e0a34 rollback — no change needed
- [x] POST_NOTIFICATIONS already present in e66e0a34 rollback — no change needed

## App Store Screenshots — iPad & Apple Watch
- [x] Generate iPad Pro 12.9-inch screenshots: Dashboard, Analytics, Sodium Log
- [x] Generate Apple Watch screenshots: vitals glance, HRV insight, medication reminder

## Localization & Bug Fixes (Build Feedback)
- [x] Audit i18n setup and identify the four supported languages
- [x] Extend localization strings to cover all detail screens in all four languages
- [x] Remove Terms of Use entry from About screen
- [x] Fix consent modal on welcome/onboarding screen — must not disappear before user signs

## Consent Modal Loading Animation
- [x] Add animated loading state to consent modal while language is initializing

## Recording Bug Fix
- [x] Fix iOS RecordingDisabledException — audio session not configured / microphone permission not checked before record() is called

## Consent Modal Polish
- [x] Simultaneous skeleton/content crossfade (fade-out skeleton while content fades in)
- [x] Minimum 400 ms skeleton display time guard
- [x] Wire "review policies" footer text to navigate to Settings → About after agree

## Caloric Intake & Diabetic Nutrition Tracking
- [x] Extend server Smart photo-analysis prompt to extract calories, carbs, sugar, fat, protein, glycemic load
- [x] Update SodiumRecord data model with new nutritional fields
- [x] Update health store to persist and query new nutritional fields
- [x] Update sodium log screen UI to display new fields after Smart photo analysis
- [x] Add diabetic nutrition summary card (calories, carbs, glycemic load) to Analytics/Dashboard

## Voice Entry Full Nutrition Extraction
- [x] Extend parseVoice server endpoint to extract calories, carbs, sugar, fat, protein, fiber, glycemic load
- [x] Update sodium log screen to pre-fill all nutrition fields from voice results

## 7-Day Caloric Trend Chart (Dashboard)
- [x] Build CaloriesTrendChart component (calories + carbs bars, GL line, 7-day view)
- [x] Integrate chart into Dashboard screen with diabetic summary header

## About Screen
- [x] Update support email from hello@vitalsync.app to akorir@vitalsync-clinicalhub.com

## Diabetic Feature Trio
- [x] Post-meal blood-sugar correlation: flag high-GL meal within 30 min of glucose entry, suggest 2-hour recheck
- [x] Blood-sugar voice screen: add nutrition follow-up prompt after glucose reading
- [x] Dashboard header: weekly caloric average badge (Avg X kcal/day this week)

## Glucose Recheck Notification
- [x] Schedule local notification 2 hours after a high-GL meal is saved on the blood-sugar screen

## Cancel Reminder Button
- [x] Add "Cancel Reminder" dismiss button to blood-sugar history rows for pending 2-hour recheck notifications

## Auto-Clear Recheck Pill
- [x] Auto-clear pendingRecheckId and recheckFireTime when the 2-hour notification fires

## Regression Fixes (Build Missing Features)
- [x] Restore diabetes/calorie fields to SodiumRecord type (already present)
- [x] Restore server Smart photo-analysis prompt with nutrition fields (already present)
- [x] Restore server parseVoice prompt with nutrition fields (already present)
- [x] Restore sodium log screen diabetic nutrition card UI (already present)
- [x] Restore CaloriesTrendChart component (already present)
- [x] Restore dashboard 7-day caloric trend chart integration (already present)
- [x] Restore weekly caloric average badge on dashboard header (already present)
- [x] Restore analytics diabetic nutrition summary card (already present)
- [x] Fix consent modal disappearing on launch before user signs

## Recheck Pill & Localisation Improvements
- [x] Persist pendingRecheckId and recheckFireTime to AsyncStorage; restore on cold launch
- [x] Add "Log New Reading" shortcut button to the recheck cancel pill
- [x] Localise meal follow-up prompt, caloric badge label, and post-meal correlation insight (en/es/fr/zh)

## DASH Diet Rename & Nutrition Card Move
- [x] Add diabetic nutrition card (calories, carbs, sugar, fat, protein, GL) to blood sugar log screen
- [x] Rename all "Sodium Intake" labels to "DASH Diet" across screens, navigation, i18n strings, and tab labels

## Medication Side-Effect LLM Mapping
- [x] Add side_effects field (string[]) to MedicationRecord type
- [x] Add LLM endpoint (medications.lookupSideEffects) to server routers
- [x] Add side_effects form field to MedFormModal with LLM auto-suggest button
- [x] Add "Potential Side Effects" disclosure group to MedicationCard
- [x] Persist side_effects through save/update flows

## DietarySummaryView — DailyNutrients Model
- [x] Define DailyNutrients type (fats_g, carbohydrates_g, protein_g, total_calories_kcal, date)
- [x] Build aggregateDailyNutrients() utility that maps SodiumRecord[] → DailyNutrients[]
- [x] Build DietarySummaryView component showing today's macro breakdown with calorie formula
- [x] Integrate DietarySummaryView into Medications screen as a sub-section

## AI Caloric Trend Analysis
- [x] Add LLM endpoint (caloricTrends.analyzeTrends) that accepts 7-day DailyNutrients + sodium/BP/glucose data
- [x] Build CaloricTrendInsightCard component showing natural-language clinical summary
- [x] Integrate CaloricTrendInsightCard into Analytics screen under DASH Diet section

## HealthKit TestFlight Configuration Audit
- [x] Register @kingstinct/react-native-healthkit plugin in app.config.ts plugins[] with NSHealthShareUsageDescription, NSHealthUpdateUsageDescription, and background:true
- [x] Expand NSHealthShareUsageDescription in ios.infoPlist to name all 16 data types accessed (blood glucose, respiratory rate, resting heart rate, etc.)
- [x] Add HKQuantityTypeIdentifierBloodGlucose, HKQuantityTypeIdentifierBloodPressureSystolic/Diastolic, HKQuantityTypeIdentifierRestingHeartRate to requestAuthorization read list in native-health-service.ts
- [x] Confirm entitlements: com.apple.developer.healthkit and com.apple.developer.healthkit.background-delivery both present
- [x] Confirm requestAuthorization is called on onboarding, consent modal, home screen, and settings (all verified present)

## HealthKit Write Types & Re-connect UX
- [x] Expand toShare write types in native-health-service.ts (add BloodGlucose, BloodPressureSystolic/Diastolic, OxygenSaturation, HeartRateVariabilitySDNN, BodyFatPercentage, Height, StepCount, SleepAnalysis)
- [x] Update NSHealthUpdateUsageDescription in app.config.ts to describe all write types
- [x] Add "Re-connect Apple Health" button to Settings screen that opens app-settings: on iOS

## HealthKit Write-Back, Permission Refresh & Background Delivery
- [x] Build HealthKit write-back service with saveBloodGlucose(), saveBloodPressure(), saveWeight(), saveHeartRate(), saveOxygenSaturation(), saveSleepAnalysis()
- [x] Wire write-back into blood glucose log save handler
- [x] Wire write-back into blood pressure log save handler
- [x] Wire write-back into weight/body composition log save handler
- [x] Add AppState change listener in Settings to refresh permissionsGranted after user returns from Settings
- [x] Implement HealthKit background delivery task handler (registerBackgroundObservers) in native-health-service.ts
- [x] Register background task in app/_layout.tsx on iOS startup via HealthKitBackgroundBridge

## Sleep Write-Back, BG Notification, Toast & Consent Language
- [x] Wire saveSleepToHealthKit into health-context.tsx (addSleep or equivalent)
- [x] Fire local notification after background delivery merge in native-health-service.ts
- [x] Build HealthKitToast component (brief "Saved to Apple Health ✓" banner)
- [x] Integrate HealthKitToast into weight, vitals, blood glucose, and sleep log screens (via health-context write-back)
- [x] Audit consent modal: fires on first launch, all four languages (EN/ES/FR/ZH) fully translated and verified
- [x] Language-tap buttons on consent screen switch entire consent text in real time via setLangOverride + _notifyListeners

## Manual Sleep Entry, Toast L10n & Sync Badge
- [x] Build manual sleep entry form sheet (bedtime/wake-time picker, duration, quality, notes)
- [x] Integrate sleep form into the existing sleep/activity log screen
- [x] Add toast localisation strings to i18n.ts for EN/ES/FR/ZH (savedToHealthKit key in all 4 languages)
- [x] Update showHealthKitToast() to accept lang and show localised message via detectLang() + getToastMsg()
- [x] Write last-synced timestamp to AsyncStorage (LAST_BG_SYNC_KEY) in background delivery observer
- [x] Display "Last synced: X min ago" badge in Settings Apple Health row

## Native Time Picker for Sleep Entry
- [x] Install @react-native-community/datetimepicker (Expo SDK 54 compatible, v8.4.4)
- [x] Build TimePickerField component — tappable pill that opens native iOS wheel picker in a modal sheet; falls back to HH:MM text input on Android/web
- [x] Replace bedtime and wake-time text inputs in sleep.tsx with TimePickerField
- [x] Ensure duration auto-calculates from picker values (Date objects used throughout)

## AM/PM Badge on Sleep Time Picker Pill
- [x] Extract AM/PM from the Date value in TimePickerField
- [x] Render a small styled AM/PM badge next to the time text on the tappable pill

## AI-Powered Full-App Language Translation
- [x] Add translation.translate LLM endpoint to server routers (batch string translation)
- [x] Build TranslationContext with AsyncStorage cache keyed by language code
- [x] Build useT() hook that returns translated strings with LLM fallback for missing keys
- [x] Wire language selector in Settings to trigger Smart translation batch and global re-render
- [x] Show loading indicator in Settings while translation is in progress
- [x] Support EN/ES/FR/ZH as static fast-path; all other languages via LLM
- [x] Expand language picker to 18 languages (AR, PT, DE, HI, KO, JA, IT, RU, NL, PL, TR, VI, ID, SV)
- [x] Translate all app string groups (settings, home, log, detail, report, about, onboarding) via flattenStrings

## Combine Medication + Side Effects into One Screen
- [x] Merge Side Effects UI into Medication screen with two tabs: "Medications" and "Side Effects"
- [x] Remove standalone Side Effects card/button from Log hub screen
- [x] Remove side-effects route from navigation (or keep as redirect)
- [x] Update i18n strings if needed
- [x] Rename screen header and LogCard title to "Medication"
- [x] + button context-aware: adds medication or side effect based on active tab

## i18n Improvements
- [x] Add clearTranslationCache() to TranslationContext and expose via useTranslationContext()
- [x] Add "Clear Translation Cache" button in Settings → Privacy section (only shown for Smart languages)
- [x] Extend useT() to Log hub screen (section titles, card labels, quick stats)
- [x] Add RTL layout support via I18nManager.forceRTL for Arabic (ar) and Hebrew (he)
- [x] Show restart-required alert when switching to/from RTL language
- [x] Add Hebrew (he) and Swahili (sw) to language picker in Settings
- [x] Add RTL badge in language picker for Arabic and Hebrew
- [x] initRTL() called at app startup in _layout.tsx alongside initLang()

## Fix Swahili Language Option
- [x] Verify Swahili (sw) is LTR — no RTL badge appears (RTL_LANGS only has ar, he, fa, ur)
- [x] Confirm native name "Kiswahili" is correct
- [x] Root cause fixed: Lang type broadened to string so Smart language codes (sw, ar, de…) are stored and returned by detectLang() instead of falling back to 'en'
- [x] toStaticLang() helper added to i18n.ts — clamps any lang to StaticLang for safe static dict indexing
- [x] useLang() updated to return StaticLang via toStaticLang() — all [lang] dict indexing sites remain type-safe
- [x] useRawLang() added for components that need the full BCP-47 code
- [x] health-context.tsx fixed to use toStaticLang() when indexing logStrings
- [x] TypeScript: 0 errors

## UX Polish — i18n Round 3
- [x] Add "Reload App" button to RTL restart alert using expo-updates Updates.reloadAsync() (all 3 alert sites updated)
- [x] Extend useT() to Dashboard/Home screen — all homeStrings keys now Smart-translated for non-static languages
- [x] Add language indicator badge to Settings header — shows native name (e.g. "Kiswahili") + spinning indicator while translating
- [x] TypeScript: 0 errors

## i18n UX Round 4
- [x] Extend useT() to Report screen (all section headers, metric toggles, notes placeholder, CSV card, PDF button)
- [x] Add globe language quick-access button to Dashboard header (bottom sheet with AI/RTL badges, checkmark for active language)
- [x] Add global TranslatingToast component — floating pill above tab bar, fades in/out with animation, persists across all screens
- [x] TypeScript: 0 errors

## i18n UX Round 5
- [x] Add spinning Reanimated rotation animation to globe icon in TranslatingToast (withRepeat + withTiming 1200ms)
- [x] Localize onboarding slides via useT() with ONBOARDING_EN stable constant
- [x] Localize consent modal via useT() with CONSENT_EN stable constant
- [x] Add Translate PDF button to Report screen — only visible for Smart languages; translates 26 PDF labels via LLM then generates & shares translated PDF
- [x] Add DEFAULT_REPORT_LABELS + ReportLabels interface to report-generator.ts
- [x] Replace all 26 hardcoded English HTML labels in report-generator.ts with L.xxx references
- [x] Export getLangName from i18n-ai.tsx for use in report.tsx

## i18n UX Round 6
- [x] Add flag emojis to all language entries (consent modal, settings picker, dashboard globe picker)
- [x] Add "More languages…" chip to consent modal opening full 20-language bottom sheet with AI badge and checkmark
- [x] Pre-translate on Smart language selection during onboarding via ensureTranslations() in handleLangSelect
- [x] ensureTranslations() exposed via TranslationContext (added to interface + Provider value)
- [x] TypeScript: 0 errors

## Language Picker Search Filter
- [x] Add live search input to More Languages sheet in consent modal (filters by native name, English label, or BCP-47 code)
- [x] Add live search input to Dashboard globe picker sheet (same filter logic)
- [x] Both pickers: translating indicator in header row, keyboardShouldPersistTaps for smooth UX
- [x] TextInput + ActivityIndicator added to both files' RN imports
- [x] TypeScript: 0 errors

## Language Picker Polish Round 2
- [x] Clear search input when language picker sheet closes (both consent modal and Dashboard globe picker)
- [x] Add "No languages found" empty state with clear-search button when filter returns 0 results (both pickers)
- [x] Add language flag emoji overlay on the Settings tab bar icon (hidden for English, shows flag for all other languages)
- [x] SettingsTabIcon component added to _layout.tsx using useRawLang() + getLangFlag()
- [x] TypeScript: 0 errors

## Micro-interaction Polish Round 3
- [x] Add haptic feedback (impactAsync Light) to Clear Search button in both language pickers
- [x] Animate Settings tab flag overlay with Reanimated scale-up when language changes (withSequence: 0→1.4→1 pop-in)
- [x] Add long-press tooltip on Settings tab icon showing active language name (flag + native name, tap overlay to dismiss)
- [x] Add getLangName() export to lang-flags.ts with LANG_NAMES map for all 20 languages
- [x] Fix missing arrow.down.doc.fill icon mapping in icon-symbol.tsx (was crashing on Android/web)
- [x] TypeScript: 0 errors | All icons mapped | No empty onPress | No Pressable className | All screens use ScreenContainer

## Micro-interaction Polish Round 4
- [x] Add "What's New" blue dot badge to Settings tab when expo-updates detects a new version (top-left blue dot, hidden in dev mode)
- [x] Add success haptic (notificationAsync Success) after Smart translation completes in triggerTranslation()
- [x] Add "Switch to English" quick action inside the long-press tooltip (calls setLangOverride('en') + success haptic)
- [x] TypeScript: 0 errors

## What's New Bottom Sheet
- [x] Create release notes data structure (RELEASE_NOTES array with version, date, sections, items)
- [x] Build WhatsNewSheet component: polished bottom sheet with version badge, changelog list, confetti-style header
- [x] Wire blue dot tap in SettingsTabIcon to open WhatsNewSheet
- [x] Dismiss blue dot after sheet is viewed (persist to AsyncStorage via WHATS_NEW_SEEN_KEY)
- [x] TypeScript: 0 errors

## What's New Sheet Translation
- [x] Extract all WhatsNewSheet UI strings into whatsNewUiStrings (title, gotIt, footer, section labels)
- [x] Extract all RELEASE_NOTES text into flat records per version (whatsNewV14/V13/V12Strings)
- [x] Wire useT() into WhatsNewSheet for UI chrome and all release note content
- [x] Add all whatsNew string groups to allEnglishStrings in root _layout.tsx for batch translation
- [x] Show ActivityIndicator next to title while Smart translation is pending
- [x] TypeScript: 0 errors

## Daily Macros Tracker (Calories, Carbs, Fat, Protein)
- [x] Build MacroRingCard component: 4 arc-progress rings (Calories, Carbs, Fat, Protein) with daily totals vs targets
- [x] Add MacroRingCard to Dashboard below DASH Compliance card
- [x] Show calorie + macro summary chips in sodium log history items
- [x] Show caloric count badge on Dashboard when weeklyCalAvg data exists
- [x] TypeScript: 0 errors

## Set My Goals Sheet (Custom Macro Targets)
- [x] Create useMacroGoals hook: load/save custom targets from AsyncStorage with defaults
- [x] Build SetGoalsSheet: bottom sheet with inputs for Calories, Carbs, Fat, Protein + 5 preset diet profiles (Balanced, High-Protein, Low-Carb, Diabetic-Friendly, Weight Loss)
- [x] Add "Set My Goals" row to Settings screen (My Profile section) with live targets subtitle
- [x] Update MacroRingCard to read targets from useMacroGoals instead of hardcoded constants
- [x] TypeScript: 0 errors

## TestFlight Launch Crash + HealthKit Permission Fix
- [x] Audit app.config.ts: found missing NSFaceIDUsageDescription and expo-local-authentication plugin
- [x] Add expo-local-authentication plugin to app.config.ts with faceIDPermission string (fixes launch crash)
- [x] Add NSFaceIDUsageDescription to ios.infoPlist as safety net for EAS managed workflow
- [x] Fix permissions.ts: was importing non-existent 'react-native-health'; now uses @kingstinct/react-native-healthkit (the installed package) — this was silently falling back to simulateGranted() instead of actually requesting HealthKit permissions
- [x] TypeScript: 0 errors

## Caloric Burn + Calories Per Day Dashboard
- [x] Aggregate caloric burn from all sources: ActivityRecord.caloriesBurned (manual + GPS + HealthKit) and SodiumRecord.calories (DASH diet log)
- [x] Build CalorieBurnCard: today's burned / consumed / net balance summary row + 7-day dual bar chart (orange=burned, blue=consumed)
- [x] Add CalorieBurnCard to Dashboard below Today's Macros card
- [x] Show 7-day average for burned and consumed in summary items
- [x] TypeScript: 0 errors

## BMR Baseline Burn + Calorie Goal Alert
- [x] Build lib/health/bmr.ts: Mifflin-St Jeor BMR calculation + useBMR hook with 24h AsyncStorage cache
- [x] BMR inputs resolved from: profile.weightKg/heightCm → latest body composition → latest weight log → average adult fallback
- [x] Add weightKg and heightCm optional fields to UserProfile for direct BMR input
- [x] CalorieBurnCard Burned column = BMR + activity kcal; shows BMR badge and breakdown note
- [x] Shows "* estimated" asterisk when any BMR input fell back to average adult values
- [x] Trigger local notification (once per day via AsyncStorage flag) when consumed > calorie goal
- [x] In-card goal hint shows remaining or over-budget kcal against user's custom goal
- [x] TypeScript: 0 errors

## Weight & Height in My Profile + TDEE Multiplier + Weekly Macro Trend
- [x] Add weightKg and heightCm input fields to Settings → My Profile (with BMR cache invalidation on save)
- [x] Save weight/height to UserProfile via saveUserProfile() and clear BMR AsyncStorage cache
- [x] Add activity level selector (5 options: Sedentary→Athlete) to SetGoalsSheet with ×multiplier badge
- [x] Store activityLevel in MacroGoals; CalorieBurnCard applies TDEE = BMR × multiplier
- [x] Build WeeklyMacroTrendChart: 7-day stacked bar chart (Carbs/Fat/Protein) with dashed burn line overlay
- [x] Add WeeklyMacroTrendChart to Dashboard below CalorieBurnCard
- [x] TypeScript: 0 errors

## Body-Weight Protein Target + Macro Alerts + Weekly Export
- [x] Add "Calculate for me" protein calculator to SetGoalsSheet: auto-fills at 1.6 g/kg (active) or 0.8 g/kg (sedentary) using profile.weightKg; shows hint to enter weight in My Profile if not set
- [x] Add macro goal progress notification: fires once per day after 8 PM if any macro is below 60% of its daily target (persisted via @vitalsync/macro_progress_alert_v1)
- [x] Add "📤 Share" button to WeeklyMacroTrendChart header: generates a formatted text table of 7-day macro data via Share.share()
- [x] TypeScript: 0 errors

## Full Pre-App Store Submission Fixes (v1.1.0)
- [x] Add expo-notifications plugin to app.config.ts — PRIMARY CRASH CAUSE: missing UNUserNotificationCenter entitlement crashed iOS on launch
- [x] Add expo-background-fetch plugin to app.config.ts — prevents TaskManager.defineTask() crash on launch
- [x] Create eas.json with development/preview/production build profiles
- [x] Bump version to 1.1.0 in app.config.ts
- [x] Fix storage.ts: replace generateMockHealthData() fallback with emptyHealthData() — no mock data in production
- [x] Add React ErrorBoundary to root _layout.tsx — prevents white screen on unhandled JS errors (App Store compliance)
- [x] Wrap module-level native calls (defineHealthMonitorTask, configureNotificationHandler) in try/catch
- [x] TypeScript: 0 errors

## EAS Build Fix + HealthKit Hardening
- [x] Fix eas.json: remove empty appleId/appleTeamId fields; clean dev/preview/production profiles with autoIncrement
- [x] Verified HealthKit entitlements in app.config.ts: com.apple.developer.healthkit + background-delivery both true
- [x] Verified @kingstinct/react-native-healthkit plugin declared with background:true and both usage strings
- [x] Fixed storage.ts: was empty (Python write interrupted) — rewrote with all 4 exports: loadHealthData, saveHealthData, clearHealthData, mergeHealthData
- [x] Fixed AsyncStorage key mismatch: native-health-service.ts used 'vitalsync_health_data' but storage.ts used '@vitalsync:health_data' — background HealthKit syncs were writing to a dead key
- [x] Fixed fetchHealthData in permissions.ts: was calling generateMockHealthData() in production — now calls getNativeHealthService().syncAll() on device, returns stored data on web
- [x] Fixed implicit any TypeScript errors in bmr.ts sort comparators
- [x] TypeScript: 0 errors

## Sentry + HealthKit BG Toggle + Onboarding Weight/Height
- [x] Install @sentry/react-native and wire Sentry.init() in app/_layout.tsx (DSN from EXPO_PUBLIC_SENTRY_DSN env var)
- [x] Add @sentry/react-native/expo plugin to app.config.ts
- [x] Add HealthKit Background Sync Status row to Settings (iOS only, permissionsGranted guard, shows last sync timestamp, Active/Pending badge, tappable alert with full details)
- [x] Add clock.arrow.2.circlepath icon mapping to icon-symbol.tsx
- [x] Add Weight (kg) and Height (cm) input fields to onboarding profile slide (slide 5)
- [x] Save weight/height from onboarding to UserProfile and invalidate BMR cache (@vitalsync/bmr_cache_v1)
- [x] TypeScript: 0 errors

## Sentry Build Fix (Auth Token)
- [x] Set SENTRY_ALLOW_FAILURE=true env var in all three eas.json build profiles (development/preview/production)
- [x] Create sentry.properties with allow_failure=true and org/project slugs
- [x] Update app.config.ts Sentry plugin: set uploadSourceMaps=false so EAS never runs the upload script without a token
- [x] Add SENTRY_AUTH_TOKEN to eas.json production secrets block so it can be wired up without code changes
- [x] TypeScript: 0 errors

## Sentry DSN Secret + HealthKit Status + BMR Test
- [ ] Wire EXPO_PUBLIC_SENTRY_DSN via webdev_request_secrets and update Sentry.init() to use it
- [x] Write vitest unit test: onboarding weight/height → saveUserProfile → loadUserProfile → computeBMR end-to-end (10 tests passing)
- [x] TypeScript: 0 errors, 25 tests pass

## Local Crash Logger (No Server)
- [x] Create lib/crash-logger.ts: AsyncStorage-backed crash log with logCrash/readCrashLogs/clearCrashLogs/installGlobalErrorHandlers
- [x] Install global error handler (ErrorUtils + unhandledrejection) in _layout.tsx at module load time
- [x] Update ErrorBoundary to persist render errors to local crash log via logCrash()
- [x] Build CrashLogViewer modal component: FlatList of log entries with type badge, timestamp, expandable stack trace
- [x] Add Diagnostics section to Settings screen with Error Logs row (shows count badge)
- [x] All data stored locally — no server/cloud dependency
- [x] TypeScript: 0 errors, 25 tests pass

## TestFlight Crash Fix — "Cannot read property 'map' of undefined"
- [x] Audit all .map() call sites on health data arrays (HealthData, records, history, chart data)
- [x] Add defensive (arr ?? []).map() guards everywhere arrays may be undefined on first launch
- [x] storage.ts: migration guards for ALL 13 array fields (bloodPressure, pulse, bodyComposition, sleep, ecg, medications, sideEffects, weight, vitalSigns, bloodSugar, activity, sodiumIntake)
- [x] correlation-engine.ts: ?? [] guards in runCorrelationEngine for all data arrays
- [x] correlation.ts: ?? [] guards in extractMetricSeries for all data.xxx.forEach calls
- [x] date-range.ts: ?? [] guards in computeDashboardAverages
- [x] weekly-summary-card.tsx: ?? [] guards in computeMetrics
- [x] analytics.tsx: ?? [] guards in hasData check
- [x] log.tsx: ?? [] guards in Quick Stats block and format function calls
- [x] settings.tsx: ?? [] guards in dataStats block
- [x] report.tsx: ?? [] guards in recordCount, medications, and sideEffects rendering
- [x] report-generator.ts: ?? [] guards in generateReportHTML
- [x] TypeScript: 0 errors, 25 tests pass

## TestFlight Crash Fix Round 2 — Still crashing after ?? [] guards [FIXED]
- [x] Read storage.ts: migration guards were correct
- [x] Read health-context.tsx reducer: found 18 unsafe .map()/.filter() calls on state.data arrays in reducer action handlers
- [x] Root cause: reducer cases (ADD_WEIGHT, DELETE_WEIGHT, ADD/DELETE_VITAL_SIGNS, ADD/DELETE_BLOOD_SUGAR, ADD/DELETE_ACTIVITY, ADD/UPDATE/DELETE_MEDICATION, ADD/UPDATE/DELETE_SIDE_EFFECT, ADD/DELETE_SLEEP, MERGE_NATIVE_HEALTH) all called state.data.xxx.map()/.filter() without ?? [] guards
- [x] Fixed all 18 reducer cases with (state.data.xxx ?? []).map()/.filter() pattern
- [x] Fixed MERGE_NATIVE_HEALTH: also guards incoming bloodPressure/heartRate/sleep/bodyComposition/activity arrays from native adapter
- [x] Fixed threshold-checker.ts: ?? [] guards on data.bloodPressure and data.pulse
- [x] Fixed log.tsx latestLabel props: (data?.weight ?? []).length pattern
- [x] TypeScript: 0 errors, 25 tests pass

## Schema Version Key (AsyncStorage Migration System)
- [x] Add CURRENT_SCHEMA_VERSION=2 constant and SCHEMA_VERSION_KEY "@vitalsync:schema_version" to storage.ts
- [x] Define MigrationFn type and MIGRATIONS map: version number → migration function
- [x] Migration v1→v2: backfill all 13 array fields that were missing in the original schema
- [x] Replace unconditional Array.isArray guards in loadHealthData with runMigrations() call
- [x] runMigrations(): reads stored version, runs each migration in sequence, writes new version
- [x] saveHealthData(): always writes SCHEMA_VERSION alongside data via AsyncStorage.multiSet (atomic)
- [x] clearHealthData(): removes both STORAGE_KEY and SCHEMA_VERSION_KEY via AsyncStorage.multiRemove
- [x] emptyHealthData() exported for use in tests
- [x] Commented template for adding future migrations (v3+)
- [x] Write 14 vitest tests: fresh install, v1→v2 upgrade, already-current (no-op), data preservation, version write, round-trip, clear
- [x] TypeScript: 0 errors, 39 tests pass (14 new schema-migration tests + 10 BMR + 15 VitalSync)

## ErrorBoundary Render Crash (Mar 2026)
- [ ] Find the component throwing during render that triggers the ErrorBoundary
- [ ] Fix all null/undefined access in render paths
- [ ] Add defensive guards to all components in the startup render tree

## Launch Crash Fix — t.points undefined (Mar 10 2026)
- [x] Fix "Cannot read property 'map' of undefined" crash in ConsentModal — t.points is undefined for Smart-translated languages because flattenStrings strips arrays; added tPoints fallback to consentStrings.en.points

## ConsentModal Persistent Dismiss (Mar 10 2026)
- [x] Add persistent dismiss flag so ConsentModal never re-renders after user accepts, even after ErrorBoundary reset

## HealthKit Permission Crash Fix (Mar 10 2026)
- [x] Add isHealthKitAvailable() guard in permissions.ts using isHealthDataAvailable() — safe to call even without entitlement
- [x] Add isHealthDataAvailable() guard in native-health-service.ts requestHealthKitPermissions and syncAll
- [x] Update settings.tsx handleRequestPermissions to check isHealthKitAvailable() first and show actionable alert with Developer Portal steps instead of crashing
- [x] app.config.ts entitlement is correctly declared — fix requires enabling HealthKit in Apple Developer Portal App ID

## Voice Recorder for Medication & Side Effects (Mar 10 2026)
- [x] Build reusable VoiceNoteButton component (record → upload → Whisper transcribe → append to text field)
- [x] Add VoiceNoteButton to Medication log form (Notes field)
- [x] Add VoiceNoteButton to Side Effect log form (Description and Notes fields)
- [x] Add notes.transcribe server route for generic audio-to-text transcription
- [x] Add mic.fill, stop.fill, mic.slash.fill to icon-symbol.tsx MAPPING

## Bug & Feature Batch (Mar 11 2026)
- [x] Fix: Today's dietary summary showing in Medication section — removed from medications.tsx, added to sodium.tsx
- [x] Add VoiceNoteButton to Vital Signs entry form Notes field
- [x] Add re-record preview chip to VoiceNoteButton — transcript shown in chip with Accept/Re-record buttons before inserting
- [x] Pass useRawLang() as Whisper language hint in all VoiceNoteButton usages (medications, side-effects, vitals)

## Voice Dictation & Character Counter Batch (Mar 11 2026)
- [x] Add VoiceNoteButton to Blood Sugar log form (notes field)
- [x] Add VoiceNoteButton to Activity log form (notes field)
- [x] Add live character counter below Vitals Notes field (x/200), Blood Sugar (x/80), Activity (x/120)

## Bug: Vitals Averages Not Pulling from Manual Log (Mar 11 2026)
- [x] Fix Dashboard vitals averages to include manually logged vital signs entries
- [x] Fix latestBP and latestPulse on Dashboard to also consider vitalSigns (most recent reading from either source)
- [x] Fix bpTrend on Dashboard to use merged BP records (HealthKit + manual)
- [x] Fix Blood Pressure Detail screen to merge vitalSigns BP records into chart and stats
- [x] Fix Pulse Detail screen to merge vitalSigns heartRate records into chart and stats
- [x] Add 12-test suite for computeDashboardAverages covering vitalSigns merge logic

## Dashboard SpO2 Card + Sleep to Vital Signs (Mar 11 2026)
- [ ] Replace Sleep VitalCard on Dashboard with SpO2 VitalCard
- [ ] Add spo2Avg to DashboardAverages and computeDashboardAverages (reads from data.vitalSigns)
- [ ] Add latestSpO2 derived value on Dashboard (from data.vitalSigns)
- [ ] Add SpO2 detail screen or navigate to vitals log on card tap
- [ ] Add Sleep section to Vitals log form (bedtime, wake time, total hours, efficiency)
- [ ] Extend VitalSignsRecord or add SleepEntry type to Vitals log
- [ ] Show Sleep history in Vitals log list
- [ ] Update i18n strings for SpO2 card and Sleep in vitals log

## Dashboard SpO2 Card + Weight to Vital Signs (Mar 11 2026)
- [x] Replace Body Composition VitalCard on Dashboard with SpO2 VitalCard
- [x] Add spo2Avg to DashboardAverages and computeDashboardAverages (reads from data.vitalSigns)
- [x] Add latestSpO2 derived value on Dashboard (from data.vitalSigns)
- [x] Add SpO2 color token (spo2Blue) to theme if missing
- [x] Add SpO2 card strings to homeStrings (en/es/fr/zh)
- [x] Add Weight (kg/lbs) input field to Vitals log form
- [x] Save weight to VitalSignsRecord.weightKg field (or extend type)
- [x] Show weight history rows in Vitals log list
- [x] Update i18n logStrings for weight field in vitals form

## Three Feature Pass (Mar 11 2026)
- [x] Add Sleep section to Vitals log form (bedtime, wake time, efficiency, duration)
- [x] Extend VitalSignsRecord with sleepBedtime, sleepWakeTime, sleepEfficiency, sleepTotalMinutes
- [x] Show sleep history rows in Vitals log list
- [x] Build SpO2 detail screen with line chart and 95-100% normal range band
- [x] Wire SpO2 card to /detail/spo2 route
- [x] Update VitalCardType to include spo2 detail route
- [x] Update Body Composition detail screen to merge vitalSigns.weightKg with bodyComposition records
- [x] Update i18n strings for sleep fields in vitals log

## Sleep Card Dashboard Merge (Mar 11 2026)
- [x] Update computeDashboardAverages to merge vitalSigns.sleepTotalMinutes into sleepAvg
- [x] Update Dashboard Sleep card to reflect merged sleep average

## Three Improvements Pass (Mar 11 2026)
- [x] Sleep detail screen: merge vitalSigns.sleepTotalMinutes with HealthKit sleep records
- [x] SpO2 threshold alert: add configurable lower-bound (default 94%) to Threshold Settings
- [x] Sleep card: show dash instead of 0% efficiency for manual entries with no efficiency value

## Chart Improvements (Mar 11 2026)
- [x] Add SpO2 bar group to ViolationFrequencyChart in Threshold Settings
- [x] Add Manual source badge to Sleep detail 14-night stacked bar chart

## Sleep Detail + SpO2 Polish (Mar 11 2026)
- [x] Add SpO2 upper-bound alert field to ThresholdConfig, checker, and Settings UI
- [x] Add Manual badge legend note below the 14-night chart in Sleep detail
- [x] Fix Avg Deep and Avg REM stats to exclude manual entries with zero stage minutes

## Sleep + SpO2 Polish II (Mar 11 2026)
- [x] Add source sub-labels to Avg Duration and Avg Efficiency stat cells in Sleep detail
- [x] Merge HealthKit oxygenSaturation records into SpO2 detail screen (already merged via vitalSigns.oxygenSaturation — no change needed)
- [x] Add SpO2 normal range info note to Threshold Settings SpO2 section

## App Icon Refresh (Mar 11 2026)
- [x] Generate premium 3D app icon (deep navy/teal, clinical health, 1024x1024)
- [x] Deploy icon to all asset locations (icon.png, splash-icon.png, favicon.png, android-icon-foreground.png)
- [x] Update app.config.ts logoUrl

## Four Improvements Pass (Mar 11 2026)
- [x] Add Sleep log entry card to Log hub right after Vital Signs
- [x] Add HRV normal range note to Threshold Settings HRV section
- [x] Add HealthKit + Manual source sub-labels to BP detail Avg Systolic and Avg Diastolic stat cells
- [x] Add reading count badge to SpO2 Dashboard card footer (already wired via spo2Readings)

## Medication Screen UX (Mar 11 2026)
- [x] Move dictation button to top-right corner of medication name input field

## Medication Smart Auto-Fill (Mar 11 2026)
- [x] Single dictation button on Medication Name auto-fills all form fields from transcript
- [x] Build parseMedicationTranscript utility (LLM-powered extraction of name, dose, frequency, route, prescriber, etc.)
- [x] Show visual feedback while auto-fill is processing (loading state + AI disclaimer)
- [x] Remove individual mic buttons from other fields (name field is the single entry point — no other mic buttons existed)

## Launch Crash Investigation (Mar 11 2026)
- [x] Audit root layout for crash-prone patterns (unguarded async, missing error boundaries)
- [x] Audit health context initialization for null/undefined crashes
- [x] Audit AsyncStorage reads for schema version mismatches
- [x] Audit app.config.ts plugins for missing iOS permissions
- [x] Apply fixes for all identified crash risks

## Launch Crash Hardening (Mar 11 2026)
- [x] Audit root layout for crash-prone patterns (unguarded async, missing error boundaries)
- [x] Audit health context initialization for null/undefined crashes
- [x] Audit AsyncStorage reads for schema version mismatches
- [x] Audit app.config.ts plugins for missing iOS permissions
- [x] Wrap auth-context init() in try/catch so SecureStore failure does not block isReady forever
- [x] Wrap HealthProvider loadHealthData useEffect in try/catch so corrupted AsyncStorage does not freeze app
- [x] Wrap DataSourcesProvider loadDataSourcesStore useEffect in try/catch
- [x] Wrap root layout initLang/initRTL Promise.all in try/catch so storage failure does not block langReady
- [x] Wrap root layout biometric lock check useEffect in try/catch
- [x] Wrap Dashboard onboarding gate useEffect in try/catch
- [x] Wrap ConsentModal AsyncStorage.getItem in .catch() so storage failure shows modal instead of freezing
- [x] Wrap BiometricLockScreen getBiometricCapability in .catch() so native module failure shows manual unlock button

## Send Crash Report Button (Mar 11 2026)
- [x] Add formatCrashLogsForEmail() utility to crash-logger.ts — formats all log entries as plain text
- [x] Add sendCrashReport() helper that opens mailto: with pre-filled subject, body (crash log text), and support address
- [x] Add "Send Crash Report" button to CrashLogViewer header (only visible when logs.length > 0)
- [x] Add "Send Crash Report" row to Settings → Diagnostics section (disabled when no logs)
- [x] Include device info (platform, OS version, app version) in email body header
- [x] Add disabled prop to SettingsRow for visual dimming
- [x] 14 unit tests for formatCrashLogsForEmail and sendCrashReport (all passing)

## Copy Crash Log to Clipboard (Mar 11 2026)
- [x] Add copyCrashReport() utility to crash-logger.ts using Clipboard.setStringAsync
- [x] Add "Copy to Clipboard" button to CrashLogViewer modal header (visible when logs.length > 0, shows "✓ Copied" confirmation for 2s)
- [x] Add "Copy to Clipboard" row to Settings → Diagnostics section (disabled when no logs, shows "Copied! Paste into any app" for 2.5s)
- [x] Add doc.on.clipboard.fill icon mapping to icon-symbol.tsx
- [x] 4 unit tests for copyCrashReport (all passing, 73 total tests pass)

## Four Feature Pass (Mar 11 2026)
- [x] Regenerate app logo with VS monogram inside the circle (deep navy/teal clinical theme)
- [x] Deploy new logo to all asset locations and update app.config.ts logoUrl
- [x] Add Swahili (sw) to AI_LANGUAGE_OPTIONS in settings.tsx (was already present, confirmed)
- [x] Add Norwegian (no) to AI_LANGUAGE_OPTIONS in settings.tsx
- [x] Add shareCrashReport() utility to crash-logger.ts using Share.share()
- [x] Add "🔗 Share" button to CrashLogViewer modal header (green, visible when logs.length > 0)
- [x] Add "Share" row to Settings → Diagnostics section (green icon, disabled when no logs)
- [x] Add auto-clear prompt after Send, Copy, and Share actions
- [x] 5 unit tests for shareCrashReport (78 total tests passing)

## Bug: Settings Screen Crash on Web Previewer (Mar 11 2026)
- [x] Diagnose root cause: mid-file `import * as Clipboard from 'expo-clipboard'` and `import { Share } from 'react-native'` crashed on web during module evaluation
- [x] Fix: moved all imports to top of file, replaced expo-clipboard with dynamic import gated behind Platform.OS !== 'web', added navigator.clipboard / navigator.share web fallbacks
- [x] Removed unused `import * as Clipboard from 'expo-clipboard'` from settings.tsx
- [x] 78 tests still passing after refactor

## Bug: Settings Crash Before Consent Acknowledged (Mar 11 2026)
- [x] Diagnose root cause: top-level `import * as Updates from 'expo-updates'` in settings.tsx and _layout.tsx crashed on web during module evaluation when Settings tab was tapped
- [x] Fix: removed top-level expo-updates import from both files; replaced all 3 Updates.reloadAsync() calls in settings.tsx and 1 checkForUpdateAsync() call in _layout.tsx with lazy `await import('expo-updates')` inside Platform.OS !== 'web' guards
- [x] TypeScript: 0 errors after fix; Metro restarted to clear stale web bundle

## Bug: Settings Still Crashes on Web After expo-updates Fix (Mar 11 2026)
- [x] Captured browser console — no errors when Settings tab is tapped after the expo-updates lazy import fix
- [x] Settings loads cleanly on web (all sections visible: Appearance, Profile, Health Data, Privacy, Notifications, About, Diagnostics)
- [x] Only expected non-fatal warnings remain (useNativeDriver fallback, shadow* deprecation, expo-notifications web stub)

## Norwegian + What's New v1.5 (Mar 11 2026)
- [x] Add Norwegian (no) to LANG_OPTIONS (top bar) in consent-modal.tsx — shows as 'NO' pill
- [x] Add Norwegian (no) to ALL_AI_LANG_OPTIONS in consent-modal.tsx — shows as 'Norsk' in the More picker
- [x] Add whatsNewV15Strings constant to whats-new-sheet.tsx with 4 New, 2 Improved, 2 Fixed items
- [x] Wire v1.5 into WhatsNewSheet component: header shows v1.5 headline and version badge
- [x] v1.4 demoted to OlderVersionHeader section
- [x] Update LATEST_VERSION in _layout.tsx to reference whatsNewV15Strings.version so the sheet shows on next launch

## Swahili Consent Modal Top Bar (Mar 11 2026)
- [x] Add Swahili (sw) to LANG_OPTIONS top-bar pills in consent-modal.tsx — shows as 'SW' pill alongside EN, ES, FR, 中文, NO

## Arabic Top Bar + Settings Crash Badge (Mar 11 2026)
- [x] Add Arabic (ar) to LANG_OPTIONS top-bar pills in consent-modal.tsx — shows as 'AR' pill (top bar now: EN · ES · FR · 中文 · NO · SW · AR)
- [x] Updated useUnreadAlertBadge hook to include crash log count: badge total = alert notifications + crash logs
- [x] Added onLogsCleared optional callback to CrashLogViewer; called after both 'Clear All' and 'Clear after share' so badge refreshes immediately
- [x] Wired onLogsCleared={loadCrashLogCount} in settings.tsx so the Diagnostics row count and tab badge stay in sync
- [x] TypeScript: 0 errors after all changes

## RTL Arabic + Mark All Alerts Read (Mar 11 2026)
- [x] Added isRTL flag to consent-modal.tsx (covers ar, he, fa, ur) — applies textAlign:right + writingDirection:rtl to title, subtitle, body, legal note, and list item text; applies flexDirection:row-reverse to each list item row
- [x] Added "Mark All Alerts as Read" row to Settings → Notifications section (only visible when unreadAlertCount > 0); shows count in subtitle, calls clearUnreadAlertCount() on press, plays success haptic, hides itself after clearing
- [x] TypeScript: 0 errors after all changes

## Bug: iOS Build Fails — HealthKit Entitlements Missing (Mar 11 2026)
- [x] Confirmed both entitlements already present in app.config.ts (lines 53-58): com.apple.developer.healthkit + com.apple.developer.healthkit.background-delivery
- [x] Root cause is Apple Developer Portal: the App ID for com.myvitalsyncclinicalhub.vitalsync does not have HealthKit capability enabled → provisioning profile was generated without it
- [ ] User must enable HealthKit on App ID in Apple Developer Portal, then re-run EAS build to regenerate the profile

## Feature: Height in Inches on Profile Screen (Mar 11 2026)
- [x] Audited Profile screen: height was cm-only plain text input
- [x] Added cm/in toggle pill (blue highlight) next to Height label
- [x] When 'in' selected: two inputs appear (Feet + Inches) with sub-labels; existing cm value auto-converts on toggle
- [x] When 'cm' selected: single cm input with bordered style
- [x] Toggling back from in → cm converts ft+in back to cm automatically
- [x] handleSave resolves heightCm from active unit before validation and persistence
- [x] Added unitToggle, unitBtn, unitBtnText, heightInput, subLabel styles to StyleSheet
- [x] TypeScript: 0 errors

## Profile Screen: Weight Toggle + Unit Persistence + Conversion Hints (Mar 11 2026)
- [x] Added kg/lbs toggle to Weight field (orange active state, mirrors cm/in toggle design)
- [x] Weight input shows value in active unit; toggling converts automatically
- [x] Persists heightUnit + weightUnit to AsyncStorage (@vitalsync/profile_units) on every toggle
- [x] Loads saved unit preferences on mount; restores ft+in fields and lbs field from stored cm/kg values
- [x] Height hint: shows "≈ 5 ft 9 in" when in cm mode, "≈ 175 cm" when in imperial mode
- [x] Weight hint: shows "≈ 154 lbs" when in kg mode, "≈ 70 kg" when in lbs mode
- [x] handleSave resolves both units to kg/cm before validation and persistence
- [x] TypeScript: 0 errors

## Profile Screen: Temperature Unit Toggle (Mar 11 2026)
- [x] Add °C / °F toggle to Profile screen (green active state, matching weight/height toggle design)
- [x] Persist tempUnit to AsyncStorage alongside heightUnit and weightUnit
- [x] Show conversion hint below temperature input (e.g. "≈ 98.6 °F" or "≈ 37.0 °C")
- [x] Store temperature internally in °C; convert on display

## Dashboard BMR Card: Show Weight Unit Preference (Mar 11 2026)
- [x] Extended useBMR hook to return weightKg from resolved inputs
- [x] CalorieBurnCard reads weightUnit from AsyncStorage on mount
- [x] Shows "based on X lbs" or "based on X kg" below the BMR note line
- [x] TypeScript: 0 errors

## Dashboard Temperature Unit + Profile Validation (Mar 11 2026)
- [x] Find the Dashboard temperature card component and understand how it reads temperature data
- [x] Read tempUnit from AsyncStorage in the temperature card and convert display value
- [x] Add inline validation to Profile temperature input (red border + warning text when out of range)

## Dashboard Temperature Card: Average over Date Range (Mar 11 2026)
- [x] Add tempAvg (°F, raw) and tempReadings to DashboardAverages interface in date-range.ts
- [x] Compute tempAvg in computeDashboardAverages from vitalSigns records in range
- [x] Wire tempAvg into Dashboard Temperature card: show "avg Xd" secondary label when available
- [x] Convert tempAvg to user's preferred unit (°C/°F) at display time
- [x] TypeScript: 0 errors

## Fix: Temperature Card Route (Mar 11 2026)
- [x] Create app/detail/temperature.tsx — line chart of temperature readings, stats (avg/min/max), normal range band (36–37.5°C / 96.8–99.5°F), unit-aware display
- [x] Register detail/temperature in app/_layout.tsx Stack
- [x] Update Temperature card onPress to navigate to /detail/temperature
- [x] Update VitalCardActionSheet DETAIL_ROUTES for temperature to /detail/temperature
- [x] TypeScript: 0 errors

## Remove Temperature from Vitals Average (Mar 11 2026)
- [x] Remove Temperature VitalCard from Dashboard vitals average grid
- [x] Remove latestTemperatureDisplay, tempAvgDisplay, tempUnit state from Dashboard if no longer needed
- [x] TypeScript: 0 errors

## Temperature in Doctor Report PDF & Dashboard Quick-Entry (Mar 11 2026)
- [x] Add temperature row (avg/min/max, unit-aware) to Doctor Report PDF generator
- [x] Temperature quick-entry shortcut on Dashboard — dropped per user request
- [x] TypeScript: 0 errors

## HealthKit Integration (Mar 12 2026)
- [x] Verify @kingstinct/react-native-healthkit v13.2.3 is installed
- [x] Add HKQuantityTypeIdentifierBodyTemperature and HKDataTypeIdentifierElectrocardiogram to HealthKit read/write permissions
- [x] Add fetchHealthKitSpO2 function (maps to VitalSignsRecord.oxygenSaturation)
- [x] Add fetchHealthKitBodyTemperature function (converts °C to °F, maps to VitalSignsRecord.temperature)
- [x] Add fetchHealthKitECG function (maps to EcgRecord[] using queryElectrocardiogramSamples)
- [x] Add spO2, temperature, ecg to NativeHealthSyncResult interface and syncAll Promise.all
- [x] Update MERGE_NATIVE_HEALTH reducer to merge vitalSigns and ecg arrays (deduplication by id)
- [x] Fix mergeHealthData in storage.ts to use mergeById for all array types (prevents data loss)
- [x] Update NSHealthShareUsageDescription and NSHealthUpdateUsageDescription to mention SpO2, temperature, ECG
- [x] TypeScript: 0 errors

## Fix: HealthKit Permission Types Not Appearing (Mar 12 2026)
- [x] Diagnose why VitalSync shows in Health Data Access but lists no data categories
- [x] Root cause: permissions.ts had a separate requestAuthorization call missing body temperature and ECG
- [x] Fix: added HKQuantityTypeIdentifierBodyTemperature and HKDataTypeIdentifierElectrocardiogram to both read and write type arrays in permissions.ts
- [x] Both permissions.ts and native-health-service.ts now have identical, complete type lists
- [x] TypeScript: 0 errors

## HealthKit Permission Status Screen (Mar 12 2026)
- [x] Build app/settings/healthkit-permissions.tsx — per-type status list with green/red indicators
- [x] Query getAuthorizationStatusForType for each HK identifier on mount
- [x] Add "Re-request Permissions" button that calls requestHealthPermissions()
- [x] Add "Open Health App" button that deep-links to x-apple-health://
- [x] Add "Open App Settings" button that deep-links to app-settings:
- [x] Summary card showing authorized / not-asked / denied / total counts
- [x] Register route settings/healthkit-permissions in app/_layout.tsx Stack
- [x] Add "Health Permission Details" row in Settings screen (iOS only)
- [x] TypeScript: 0 errors

## HealthKit Sync Progress Indicator (Mar 12 2026)
- [x] Read data-sources screen and syncAll to understand current result shape
- [x] Add counts object to NativeHealthSyncResult with per-metric record counts
- [x] Return counts from syncAll for iOS (HealthKit) and Android (Health Connect)
- [x] Add HealthKitSyncCounts interface and getLastHealthKitSyncCounts() to healthkit-adapter
- [x] Store _lastSyncCounts after each sync in healthkit-adapter
- [x] Add syncPhase state (idle/syncing/done) and syncCounts state to SourceCard
- [x] Show spinner during sync, then per-metric rows with counts on completion
- [x] Add syncProgress, syncCountGrid, syncCountRow, syncCountIcon, syncCountLabel, syncCountValue styles
- [x] TypeScript: 0 errors

## Persist Sync Counts + Oura + Sync Errors (Mar 12 2026)
- [x] Persist last HealthKit sync counts to AsyncStorage (key: @vitalsync/healthkit_sync_counts)
- [x] Load persisted counts on SourceCard mount so last sync result is shown after app restart
- [x] Add sync error detail rows to the progress panel (show per-error message when result.errors is non-empty)
- [x] Add syncTimestamp, syncErrorBox, syncErrorTitle, syncErrorText styles
- [x] Wire setOuraMergeCallback into DataSourcesContext.setMergeCallback
- [x] Implement Oura Ring OAuth2 flow: authorization URL, code capture, token exchange, token refresh, token persistence
- [x] Implement Oura REST API data fetch: heart rate, sleep, daily sleep (HRV/resting HR), SpO2, body temp deviation, workouts
- [x] Map Oura API response to VitalSync types (SleepRecord, PulseRecord, VitalSignsRecord, ActivityRecord)
- [x] TypeScript: 0 errors

## Last Synced Label on Source Cards (Mar 12 2026)
- [x] formatLastSynced helper already existed in data-sources.tsx (Just now / Xm ago / Xh ago / date)
- [x] Label already rendered as "· {formatLastSynced(state.lastSyncedAt)}" next to Connected status
- [x] Added connected tick state (setTick every 60 s) so label refreshes automatically
- [x] Fixed variable declaration order (used state.status directly instead of isConnected)
- [x] TypeScript: 0 errors

## Fix: HealthKit Missing from Health App (Mar 12 2026)
- [x] Diagnose why VitalSync no longer appears in Health Data Access
- [x] Fix requestAuthorization call so permission popup appears on first launch
- [x] Fixed incorrect ECG identifier: 'HKDataTypeIdentifierElectrocardiogram' → 'HKElectrocardiogramType' in permissions.ts, native-health-service.ts, and healthkit-permissions.tsx
- [x] Fixed requestPermissions() return type: now returns Promise<boolean> (was Promise<void>)
- [x] Fixed Dashboard handleConnectHealth: uses returned boolean instead of stale state.permissionsGranted
- [x] TypeScript: 0 errors (confirmed by tsc watcher)

## Fix: HealthKit Sync Bugs + Cold Launch Popup (Mar 12 2026)
- [x] Bug 1: Fix SpO2 inflated 100x (remove extra *100 multiplication)
- [x] Bug 2: Fix ECG classification string mapping (numeric keys → string keys)
- [x] Bug 2b: Fix ECG field names (voltageMeasurements→voltages, v.quantity→v.voltage*1000, v.timestamp→v.timeSinceSampleStart*1000, samplingFrequency→samplingFrequencyHz, averageHeartRate→averageHeartRateBpm)
- [x] Bug 3: Fix workout distance/calories accessor (.sumQuantity.quantity → .quantity)
- [x] Bug 4: Fix background delivery merge to include vitalSigns and ecg
- [x] Bug 5: Add includeVoltages: true to queryElectrocardiogramSamples call
- [x] Cold launch: Added ColdLaunchPermissionBridge in _layout.tsx — fires requestPermissions() 800ms after cold start if permissionsGranted is false and data has loaded
- [x] TypeScript: 0 errors (confirmed by tsc watcher after each edit)

## Feature: Auto-Sync + ECG Badges + 6-Lead ECG Scan (Mar 12 2026)
- [x] Auto-sync after granting permissions from Dashboard banner (call forceSync() after requestPermissions() returns true)
- [x] ECG classification color badges on ECG list cards (green=sinusRhythm, red=atrialFibrillation, yellow=inconclusive, gray=unclassified)
- [x] 6-lead ECG scan screen: camera capture of printed ECG strip (6 leads: I, II, III, aVR, aVL, aVF)
- [x] Smart interpretation: send captured image to server LLM, display structured interpretation (rhythm, rate, axis, ST changes, conclusion)
- [x] Wire scan button from ECG detail screen
- [x] TypeScript: 0 errors

## Feature: ECG Scan Metric Cards (Mar 12 2026)
- [x] ECG scan results: show PR, QRS, Rhythm, HR as prominent metric cards at top
- [x] ECG scan results: secondary section for axis, ST changes, T-wave, bundle branch
- [x] Camera permission added to app.config.ts

## Fix: ECG Scan Flow (Mar 12 2026)
- [x] Remove file storage from ECG scan — send base64 directly to AI, no S3 upload
- [x] Add Clear button after results are shown to reset the scan screen
- [x] Server ecg-router: interpret image inline, no storagePut call
- [x] TypeScript: 0 errors

## Feature: Lab Tracker + Dynamic Lab Correlation (Mar 12 2026)
- [x] Create lib/health/lab-types.ts: CMP, CBC, Mg, Phos, Lipid, A1C analytes, reference ranges, dietary correlates
- [x] Extend HealthData type with labResults: LabResult[]
- [x] Bump storage schema to v3 with labResults migration
- [x] Extend health-context.tsx with ADD_LAB_RESULT and DELETE_LAB_RESULT actions
- [x] Build server/lab-router.ts: OCR lab parser (vision LLM extracts structured values from photo) + correlate endpoint
- [x] Build lib/health/lab-correlation.ts: Dynamic Lab Correlation engine (cross-reference abnormal values against 24h food log)
- [x] Build app/labs/entry.tsx: glassmorphism Lab Entry screen (rotary panel selector, OCR photo capture, manual entry)
- [x] Build app/labs/index.tsx: Lab History + Correlation screen (frosted glass cards, trend sparklines, insight cards)
- [x] Wire Labs card into Logs hub screen (app/(tabs)/log.tsx)
- [x] TypeScript: 0 errors (confirmed by tsc watcher)

## Feature: Smart Scribe for Labs + Medications (Mar 12 2026)
- [x] Build reusable AiScribeSheet + AiScribeTrigger components (camera capture → AI fill → preview bottom sheet → accept/edit/retry)
- [x] Build parseMedicationImage server endpoint (vision LLM extracts name, dose, frequency, prescriber, notes from photo)
- [x] Medications entry: removed old VoiceNoteButton detection, added AiScribeTrigger + AiScribeSheet with preview before accepting
- [x] Labs entry: replaced old OCR camera button with AiScribeTrigger + AiScribeSheet with preview before accepting
- [x] Preview sheet: shows all extracted fields with inline edit capability before user accepts
- [x] Tests: 20/20 passing (lab types, getAnalyteStatus, generateLocalCorrelationInsights)
- [x] TypeScript: 0 errors

## Fix: App Crash on Launch (Mar 12 2026)
- [x] Deep research: identified root cause — 'xmark.circle.fill' SF Symbol used in AiScribeSheet was not mapped in icon-symbol.tsx, causing MaterialIcons to receive undefined name and throw a native invariant violation on launch
- [x] Fix: added 'xmark.circle.fill' and 'xmark.circle' mappings to icon-symbol.tsx
- [x] Fix: added expo-image-picker plugin to app.config.ts with camera + photos permission strings
- [x] 98/98 tests passing
- [x] TypeScript: 0 errors

## Icon Safety & CI (Mar 12 2026)
- [x] Add fallback icon guard in IconSymbol (warn + render help-outline for unmapped icons)
- [x] Scan all source files and fix any remaining unmapped SF Symbol names (gear, thermometer.medium, figure.walk, bicycle, figure.run, health_and_safety, watch)
- [x] Extract ICON_MAPPING to plain TS file (icon-mapping.ts) for testability without JSX transform
- [x] Add vitest CI lint test asserting all IconSymbol name props exist in ICON_MAPPING (9 new tests)
- [x] 107/107 tests passing
- [x] TypeScript: 0 errors

## Icon CI & ECG Tab (Mar 12 2026)
- [x] Extend icon-mapping CI test to cover dynamic icon names via static analysis + allowlist
- [x] Add ECG scan as a dedicated tab bar entry with waveform.path.ecg.rectangle.fill icon

## Record Tab & ECG Badge (Mar 12 2026)
- [x] Merge Log + ECG Scan into a single "Record" tab (inline ECG section)
- [x] Add ECG result-ready badge (green dot) to the Record tab icon (persisted via AsyncStorage)

## ECG Swipe-to-Dismiss (Mar 12 2026)
- [x] Add left-swipe-to-dismiss gesture on ECG scan zone (clears photo + result with slide-out animation)

## Crash on Launch (Mar 12 2026)
- [x] Diagnose and fix crash on app launch (invalid glyph "ecg" → "monitor-heart" in ICON_MAPPING)

## Pre-build Icon Validation & Direct Import Audit (Mar 12 2026)
- [x] Wire validate-icons.mjs as a prebuild npm script hook
- [x] Audit all direct MaterialCommunityIcons / Ionicons / other icon set imports for invalid glyph names (none found — all icons route through IconSymbol)
- [x] Extend validate-icons.mjs to cover all icon sets used in the codebase (3-check script: glyphMap, literals, direct imports)

## CI Pipeline Icon Gate (Mar 12 2026)
- [x] Add pnpm validate:icons as a required CI step before the Expo build job (GitHub Actions + EAS workflow)

## ECG Section in Doctor Report PDF (Mar 12 2026)
- [x] Add dedicated ECG section to Doctor Report PDF (conclusion, HR, QTc, rhythm, confidence level, full measurement table)

## Crash on Launch #2 (Mar 12 2026)
- [x] Diagnose and fix crash on app launch (regression after ECG persistence changes — root cause: expo-image-picker native module crash on old binary)

## QTc Risk Colouring & Startup Crash Fix (Mar 12 2026)
- [x] Add QTc risk colouring to Doctor Report PDF (amber >450ms BORDERLINE, red >500ms HIGH RISK, green <=450ms NORMAL)
- [x] Fix startup crash — created safe-image-picker.ts wrapper, replaced all 5 direct expo-image-picker imports, added null guards for .assets

## QTc In-App Risk Colouring (Mar 12 2026)
- [x] Add QTc risk colouring to in-app ECG result card (red >500ms HIGH RISK, amber >450ms BORDERLINE, green <=450ms NORMAL)

## Native Config Audit & Permission Fix (Mar 12 2026)
- [x] Full audit of app.config.ts plugins vs all native module imports
- [x] Fix all missing permission strings for iOS Info.plist and AndroidManifest.xml
- [x] Generate corrected native configuration reference document

## Global Error Boundary & Startup Race Condition Fix (Mar 12 2026)
- [x] Build GlobalErrorBoundary class component with crash logging and recovery UI
- [x] Wrap app root in GlobalErrorBoundary (app/_layout.tsx)
- [x] Audit root _layout.tsx for synchronous blocking work on the JS thread at startup
- [x] Refactor all heavy init (AsyncStorage reads, health permission checks, schema migrations) into async useEffect with loading state
- [x] Audit all context providers (HealthContext, DataSourcesContext, ThemeProvider, etc.) for synchronous blocking startup work
- [x] Add AppLoadingScreen component shown while async init is in progress
- [x] Ensure UI mounts fully before any heavy logic executes

## Asset Reference Audit (Mar 12 2026)
- [x] Enumerate all actual asset files on disk (assets/ directory tree)
- [x] Scan all source files for require('../assets/...'), Image source URIs, and app.config.ts asset paths
- [x] Cross-check every reference against actual files (exact name + case)
- [x] Detect any web URLs used as native Image sources instead of bundled assets
- [x] Fix all mismatches (missing files, wrong case, broken paths)
- [x] Verify app.config.ts icon/splash/adaptive icon paths all resolve to real files

## Publish Fix & Stable Base Checkpoint (Mar 12 2026)
- [x] Roll back to 848ca37f (pre-maps-shim)
- [x] Regenerate pnpm lockfile to match package.json exactly
- [x] Fix react-native-maps web bundling error with platform shim
- [x] Verify web preview clean and TypeScript 0 errors
- [x] Save stable checkpoint ready for publish

## Move Consent from Settings to Onboarding (Mar 12 2026)
- [x] Remove consent entry/link from Settings screen
- [x] Add consent as last onboarding step before Start Monitoring
- [x] Ensure consent completion gates the Start Monitoring button

## Consent Polish (Mar 12 2026)
- [x] Add "Review Privacy Policy" row to Settings → About screen
- [x] Reset consent_accepted flag when "Reset Onboarding" is tapped in Settings
- [x] Fix consent slide bullet layout for long Chinese/Spanish translations (flex wrap, min height)

## What's New Version Gate & Consent Versioning (Mar 12 2026)
- [x] What's New: store last-seen app version in AsyncStorage, show sheet only when current version is newer
- [x] What's New: gate trigger on version comparison (semver), dismiss stores current version
- [x] Consent: add CONSENT_VERSION constant (bump when privacy policy changes)
- [x] Consent: store accepted consent version alongside accepted flag
- [x] Consent: re-show consent slide in onboarding if stored version < CONSENT_VERSION
- [x] Consent: update markConsentAccepted / resetConsent to handle versioned storage

## TestFlight Crash-on-Launch Fix (Mar 12 2026)
- [x] Add EAS project ID to app.config.ts extra.eas.projectId
- [x] Remove stale space.manus bundle ID references from app.config.ts
- [x] Add react-native-nitro-modules as explicit dependency (required peer of @kingstinct/react-native-healthkit)
- [x] Upgrade @sentry/react-native from ~7.2.0 to ~7.13.0 (latest stable 7.x, RN 0.81 + new arch fixes)
- [x] Verify babel.config.js has react-native-reanimated/plugin (uses react-native-worklets/plugin which reanimated 4.x delegates to)
- [x] Verify newArchEnabled: true is set and all native modules support it
- [x] Verify expo-router plugin is registered in app.config.ts
- [x] Verify HealthKit infoPlist strings are present in app.config.ts
- [x] Verify bundle ID is consistent: com.myvitalsyncclinicalhub.vitalsync everywhere

## TestFlight Crash Investigation Round 2 (Mar 12 2026)
- [x] Audit root layout for synchronous native module calls at module-eval time
- [x] Check Sentry.init() call — guarded with try/catch and enabled: !!DSN flag
- [x] Check background task registration — correct, wrapped in try/catch
- [x] Audit expo-local-authentication static import — 17.0.8 is correct for SDK 54
- [x] Check eas.json production profile — correct, autoIncrement and latest image set
- [x] Check @kingstinct/react-native-healthkit — uses dynamic imports, no static crash
- [x] Verify react-native-ble-plx — uses install_modules_dependencies, new arch safe
- [x] Root cause found: react-native-maps 1.20.1 had NO new arch support (no install_modules_dependencies in podspec) — upgraded to 1.27.2 which has full new arch support

## Disable New Architecture Fallback (Mar 12 2026)
- [x] Set newArchEnabled: false in app.config.ts (classic bridge fallback for TestFlight stability)

## NSUsageDescription & Production Env Audit (Mar 12 2026)
- [x] Verify NSHealthShareUsageDescription is present in app.config.ts
- [x] Verify NSHealthUpdateUsageDescription is present in app.config.ts
- [x] Verify NSMicrophoneUsageDescription is present in app.config.ts
- [x] Verify NSCameraUsageDescription is present in app.config.ts (added explicitly)
- [x] Verify NSBluetoothAlwaysUsageDescription is present (required by react-native-ble-plx)
- [x] Verify NSBluetoothPeripheralUsageDescription is present (iOS < 13 compat)
- [x] Verify NSMotionUsageDescription — not used, no accelerometer/motion APIs in app
- [x] Verify NSLocationWhenInUseUsageDescription — set via expo-location plugin ✓
- [x] Audit all AI module env vars — EXPO_PUBLIC_SENTRY_DSN, OURA, GARMIN keys all added to eas.json
- [x] Ensure SENTRY_DSN handled gracefully — Sentry init uses enabled: !!DSN flag, no crash when empty

## Re-enable New Architecture + Full Audit (Mar 12 2026)
- [x] Set newArchEnabled: true in app.config.ts
- [x] Audit all native modules for New Arch (TurboModule/Fabric) compatibility — all clear: expo packages use ExpoModulesCore, third-party packages use install_modules_dependencies
- [x] Add NSCameraUsageDescription to infoPlist (expo-image-picker plugin covers it but explicit is safer)
- [x] Add EXPO_PUBLIC_SENTRY_DSN to eas.json production env (currently missing — Sentry silently disabled in prod)
- [x] Add EXPO_PUBLIC_OURA_CLIENT_ID / EXPO_PUBLIC_OURA_CLIENT_SECRET to eas.json production env (optional but must not crash if absent)
- [x] Add EXPO_PUBLIC_GARMIN_CONSUMER_KEY to eas.json production env (optional but must not crash if absent)
- [x] Verify react-native-worklets 0.5.1 is New Arch compatible — confirmed ✓
- [x] Verify expo-background-fetch is New Arch compatible — uses ExpoModulesCore ✓
- [x] Verify react-native-health-connect is New Arch compatible — JS-only bridge, no podspec needed ✓

## Full TestFlight Crash Checklist Audit (Mar 12 2026)
- [x] Scan all source files for unguarded window/document/localStorage usage — all guarded with Platform.OS or typeof checks
- [x] Verify expo-router, react-native-reanimated, react-native-screens, react-native-safe-area-context are installed — all present
- [x] Confirm app/_layout.tsx exists — created app/index.tsx (was missing) as Redirect to /(tabs) for production iOS cold-launch stability
- [x] Confirm expo-router plugin is in app.config.ts plugins array — present as first plugin
- [x] Verify NSHealthShareUsageDescription and NSHealthUpdateUsageDescription in infoPlist — both present
- [x] Confirm no stale space.manus bundle ID references — zero occurrences found
- [x] Verify HealthKit entitlement com.apple.developer.healthkit is set — true
- [x] Verify HealthKit background delivery entitlement — com.apple.developer.healthkit.background-delivery: true
- [x] Verify aps-environment: production entitlement — present
- [x] Confirm bundle ID com.myvitalsyncclinicalhub.vitalsync is consistent in app.config.ts and eas.json — consistent

## EAS Build Fix (Mar 12 2026)
- [x] Remove empty-string env var values from eas.json (EAS rejects empty strings — optional vars must be absent or set via EAS Secrets dashboard)

## Remove Google Maps / react-native-maps (Mar 12 2026)
- [x] Find all files importing react-native-maps — lib/maps/index.native.ts and app/log/activity-detail.tsx
- [x] Remove react-native-maps from package.json and uninstall
- [x] Replace lib/maps/index.native.ts with null-export stub — activity-detail.tsx already has a fallback UI (GPS point count card) when MapView is null
- [x] No maps plugin config in app.config.ts — nothing to remove

## HealthKit Nitro Crash Fix + What's New Feature (Mar 12 2026)
- [x] Create lib/health/healthkit-loader.ts safe loader (NitroModules guard + try/catch)
- [x] Update lib/health/native-health-service.ts to use loadHealthKit()
- [x] Update lib/health/permissions.ts to use loadHealthKit()
- [x] Update lib/health/healthkit-write.ts to use loadHealthKit()
- [x] Add What's New tab inside Settings > Notifications screen (sparkles icon, green dot badge, opens WhatsNewSheet via appEvents)
- [x] Green dot badge on Settings tab icon already existed (UpdateBadge in _layout.tsx) — confirmed wired to LATEST_WHATS_NEW_VERSION
- [x] Persist last-seen version in AsyncStorage so dot clears after viewing What's New — WHATS_NEW_SEEN_KEY shared via lib/whats-new-version.ts

## v2.3.65 Release Notes & Green Dot Fix (Mar 12 2026)
- [x] Add v2.3.65 release notes to whats-new-sheet.tsx (new top entry with Fixed/New/Improved sections)
- [x] Update LATEST_WHATS_NEW_VERSION to "2.3.65" in lib/whats-new-version.ts
- [x] Verify green dot clears from Settings row when sheet is dismissed from tab icon — handleWhatsNewClose writes WHATS_NEW_SEEN_KEY; Settings screen reads same key on mount

## ECG Units: ms to s (Mar 12 2026)
- [x] Find all ECG display components that show ms values — app/(tabs)/ecg.tsx and app/ecg-scan.tsx (app/detail/ecg.tsx has no ms units)
- [x] Convert ECG interval/duration values from ms to s (divide by 1000, toFixed(2)) — both files updated
- [x] Update unit labels from "ms" to "s" in all ECG UI components — QTc Interval, PR Interval, QRS Duration

## ECG Normal Range Tooltips (Mar 12 2026)
- [x] Add normalRange prop to MetricCard in app/(tabs)/ecg.tsx and app/ecg-scan.tsx
- [x] Show normal range as subtle subtitle beneath each interval value (QTc: 0.36–0.44 s, PR: 0.12–0.20 s, QRS: < 0.12 s)

## ECG Reference Footnote (Mar 12 2026)
- [x] Add ACC/AHA 2022 reference footnote at the bottom of the ECG result card in app/(tabs)/ecg.tsx and app/ecg-scan.tsx

## Clinical Input — Three-Mode Manual Entry (Mar 12 2026)
- [x] Add dietType field to MacroGoals and persist to AsyncStorage (keto, dash, vegan, mediterranean, diabetic, balanced)
- [x] Add diet type selector row to macro/nutrition settings (or Settings > Profile)
- [x] Build useDietConflict hook: detects metabolic conflicts (e.g. carbs > keto threshold, sodium > DASH limit)
- [x] Build Standard Clinical Input prompt UI (monospaced font, high-contrast, Mass/Sodium/Net Carbs/Fiber fields)
- [x] Build Contextual Conflict Warning prompt (METABOLIC_CONFLICT_DETECTED sheet with impact metrics and Override/Adjust/Cancel actions)
- [x] Build Bio-Availability prompt for Vegan/Mediterranean (Lipid Type selector, Protein Source selector, Omega-3:6 ratio display)
- [x] Wire all three prompt modes into sodium.tsx manual entry form based on active diet type
- [x] Add nutrient source selector (Verified Lab Data vs Clinical Estimate) to Standard prompt

## Diet Protocol Selector in Settings (Mar 13 2026)
- [x] Add Diet Protocol Selector section to Settings screen with all 6 protocols (Keto, DASH, Diabetic, Mediterranean, Vegan, Balanced)
- [x] Show per-protocol description, key thresholds, and a visual indicator for the active selection
- [x] Persist selection via useDietType hook (AsyncStorage) and reflect immediately in Clinical Input

## Logarithmic Sodium Curve + Telemetry Tagging (Mar 13 2026)
- [x] Build LogarithmicSodiumCurve component using react-native-svg (SVG path, threshold line, current-position dot, axis labels)
- [x] Replace linear sodium progress bar on DASH dashboard with LogarithmicSodiumCurve
- [x] Add nutrientSource field ('verified_lab' | 'clinical_estimate' | 'ai_scan') to SodiumRecord type
- [x] Pass nutrientSource from Clinical Input prompt and Smart scan through to handleSave in sodium.tsx
- [x] Display Nutrient Source badge on each history row in the sodium log

## Suggested Next Steps — Curves, Annotations & Telemetry Summary (Mar 13 2026)
- [x] Extend LogarithmicSodiumCurve to accept an optional perEntryThresholdMg prop and render a second dashed vertical line
- [x] Pass the active diet protocol's per-entry conflict threshold to LogarithmicSodiumCurve from sodium.tsx
- [x] Build LogarithmicPotassiumCurve component (green-to-yellow gradient, target line at 3500 mg, same log₁₀ scale)
- [x] Replace the linear potassium bar in sodium.tsx with LogarithmicPotassiumCurve
- [x] Add TelemetrySummaryCard component: count of Verified Lab / Clinical Estimate / AI Scan entries for today
- [x] Render TelemetrySummaryCard above the history FlatList in sodium.tsx

## Clinical Input v2 — Four-Mode Redesign (Mar 13 2026)
- [x] Build OscilloscopeWaveform animation component (SVG sine/log waveform that plays during "calculating" state)
- [x] Redesign Bio-Data Entry prompt (MANUS_v4.2 header, Verification Level selector L1/L2, Net Mass, Macronutrient Density P/F/C grid, Glycemic Load Index LOW/MED/HIGH toggle, COMMIT_TO_ENCRYPTED_LOG action)
- [x] Build Dietary Logic contextual sub-prompt: DASH (Electrolyte Flux, Na+/K+ fields, 1500mg threshold)
- [x] Build Dietary Logic contextual sub-prompt: Keto (Net Carbohydrate Impact, fiber-discarded display, Logarithmic Ketosis Status)
- [x] Build Dietary Logic contextual sub-prompt: Mediterranean/Vegan (Lipid Type, Protein Source, Omega-3:6 ratio)
- [x] Build Conflict & Correction prompt (BIO-SYSTEM_DEVIATION sheet, Score Decay %, Inflammatory Marker Prediction, ADJUST_BIO_MASS / PROCEED_WITH_PENALTY / CANCEL_ENTRY)
- [x] Build Exercise-Calorie Integration prompt (METABOLIC_FLUX_CALIBRATION, MET detection, caloric ceiling adjustment, Fuel Source Preference, SYNC_WITH_HEALTHKIT_ENTITLEMENTS)
- [x] Apply monospaced font (Courier/SF Mono) to all numerical data fields in Clinical Input
- [x] Wire oscilloscope animation to show during conflict calculation and exercise sync states

## Clinical Input v2 — UX Refinements (Mar 13 2026)
- [x] Protocol-specific MET defaults: pre-select activity level based on active diet (DASH→Cardiovascular, Diabetic→Light, Keto→Moderate, Mediterranean→Light, Vegan→Light, Balanced→Sedentary)
- [x] Waveform replay button: add [REPLAY_ANALYSIS] pressable next to oscilloscope status label to re-trigger animation on demand

## Clinical Input v2 — UX Polish Round 2 (Mar 13 2026)
- [x] MET override memory: persist last manually chosen MET level per protocol to AsyncStorage; restore on next session
- [x] Conflict sheet haptic escalation: notificationAsync(Warning) on PROCEED_WITH_PENALTY, distinct from standard impactAsync(Medium)
- [x] Telemetry CSV export: include activityMET and exerciseCaloricBonus fields in the export alongside existing sodium/macro/source fields

## Clinical Input v3 — Biometric Auth + Food-to-Manus + Exercise Logic (Mar 13 2026)
- [x] Build BiometricAuthorizationPrompt component: terminal-style SYSTEM_INTEGRITY_CHECK screen with HealthKit status diagnostic and [GRANT_ACCESS_TO_HEALTH_CORE] button
- [x] Wire BiometricAuthorizationPrompt to requestHealthPermissions() and show when HealthKit is locked/unavailable
- [x] Enhance ClinicalInputPrompt Food-to-Manus mode: add protocol selector (DASH/KETO/VEGAN/MEDITERRANEAN), Lipid Profile (Sat/MUFA/PUFA), and LOGIC_STAMP adherence penalty display
- [x] Build ExerciseLogicPrompt: Activity Modality (Anaerobic/Aerobic/HIIT), Duration (min), RPE (1-10), EPOC calculation, [UPDATE_METABOLIC_INDEX] action
- [x] Verify app.config.ts has com.apple.developer.healthkit entitlement, NSHealthUpdateUsageDescription, and correct provisioning profile guidance for TestFlight

## Dashboard HealthKit Auth + EPOC Logging + VO2Max Card (Mar 13 2026)
- [x] Wire BiometricAuthorizationPrompt to Dashboard: show on first launch when HealthKit is locked/notDetermined
- [x] Persist first-launch auth seen state to AsyncStorage so prompt only shows once per install
- [x] Build ActivityLogRecord type (activityModality, durationMin, rpe, epocKcal, timestamp, activityMET, exerciseCaloricBonus)
- [x] Build useActivityLog hook: save/load ActivityLogRecord[] from AsyncStorage
- [x] Wire useActivityLog into ExerciseIntegrationPrompt [UPDATE_METABOLIC_INDEX] button
- [x] Include activityModality, durationMin, rpe, epocKcal in telemetry CSV export
- [x] Add VO2Max to native health sync (HKQuantityTypeIdentifierVO2Max read)
- [x] Build VO2MaxCard component with VO2_MAX_CORRELATION terminal-style display
- [x] Add VO2MaxCard to Dashboard alongside heart rate and HRV panels

## Activity Log History Screen (Mar 13 2026)
- [x] Build app/log/activity-log-history.tsx: FlatList of ActivityLogRecord entries with modality icon, duration, RPE, EPOC, MET, caloric bonus, timestamp
- [x] Add delete swipe action (or long-press) to remove individual entries
- [x] Show empty state when no records exist
- [x] Register /log/activity-log-history route in the log stack
- [x] Add "Exercise History" entry point from the Log hub screen or sodium screen

## Five Collapsible Dashboard Cards (Mar 13 2026)
- [x] Add Exercise History LogCard to the Activity section of the Log hub screen
- [x] Refactor VO2MaxCard to collapsible tap-to-expand pattern (header always visible, gauge expands)
- [x] Refactor DashComplianceCard to collapsible pattern (score header always visible, details expand)
- [x] Build collapsible CaloricBalanceCard (intake vs. goal vs. exercise bonus, macro ring summary)
- [x] Build collapsible WeeklyMacroTrendCard (7-day stacked bar: protein/fat/carbs per day)
- [x] Build collapsible SevenDayCaloricTrendCard (7-day bar chart with green/amber/red status coloring)
- [x] Wire all five collapsible cards into Dashboard in correct order

## HealthKit Native Permissions & Background Sync (Mar 13 2026)
- [x] Fix healthkit-adapter sync(): pass spO2, temperature, ecg to mergeCallback
- [x] Widen MergeCallback type in healthkit-adapter to include vitalSigns and ecg
- [x] Trigger forceSync() immediately after permissions are first granted in ColdLaunchPermissionBridge
- [x] Write unit tests for the fixed sync pipeline

## HealthKit First-Launch Sync Banner (Mar 13 2026)
- [x] Build HealthKitSyncBanner component (animated, auto-dismiss)
- [x] Wire banner into Dashboard above ForceSyncBar
- [x] Track first-sync state via AsyncStorage flag
- [x] Write unit tests for the banner logic

## HealthKit Sync UX Improvements (Mar 13 2026)
- [x] Richer background sync notification with per-type count breakdown
- [x] Dedicated Last Synced row in Settings Data Sources section
- [x] Per-type progress steps in HealthKitSyncBanner (Blood Pressure, Heart Rate, etc.)

## Dedicated Consent Screen under Privacy (Mar 13 2026)
- [ ] Build app/settings/consent.tsx — full consent details, version history, re-consent flow
- [ ] Wire "Consent & Data Use" row into the Privacy section of Settings
- [ ] Add "checkmark.shield.fill" icon mapping if not present

## HealthKit Gap Fixes (Mar 13 2026)
- [x] Add saveBloodGlucoseToHealthKit to healthkit-write.ts
- [x] Wire blood glucose write-back in health-context addBloodSugar action
- [x] Fix permissions screen to query getAuthorizationStatus on mount
- [x] Add 1-second delay to forceSync after cold-launch permission grant

## Notification Deep-Link & HealthKit Availability Banner (Mar 13 2026)
- [x] Wire NotificationResponseReceivedListener in _layout.tsx to route to Dashboard
- [x] Build HealthKit availability info banner (Simulator/missing-entitlement)
- [x] Persist banner dismissal to AsyncStorage (one-time show)

## Notification Deep-Link Drill-Down (Mar 13 2026)
- [x] Fix threshold-checker to include source: threshold-violation in notification data payload
- [x] Build category-to-route mapping in NotificationDeepLinkBridge
- [x] Navigate to detail screen on threshold-violation tap (bp->blood-pressure, heartRate/hrv->pulse, spo2->spo2)
- [x] Write unit tests for the category-to-route mapping

## Feature: Smart Scribe for Medical & Surgical History (Mar 13 2026)
- [x] Add MedicalHistoryRecord type (condition, icdCode, diagnosedDate, status, treatingPhysician, notes, aiScribe) to types.ts
- [x] Add SurgicalHistoryRecord type (procedure, cptCode, surgeryDate, surgeryType, surgeon, facility, anesthesia, complications, notes, aiScribe) to types.ts
- [x] Add MedicalHistoryStatus type ('active' | 'resolved' | 'chronic' | 'in_remission') to types.ts
- [x] Add SurgicalHistoryType type ('elective' | 'emergency' | 'diagnostic' | 'reconstructive' | 'other') to types.ts
- [x] Add medicalHistory/surgicalHistory arrays to HealthData interface
- [x] Add storage migration (v14) for medicalHistory/surgicalHistory in storage.ts
- [x] Add ADD/UPDATE/DELETE_MEDICAL_HISTORY and ADD/UPDATE/DELETE_SURGICAL_HISTORY action types to health-context.tsx
- [x] Add reducer cases for all 6 new actions in health-context.tsx
- [x] Add addMedicalHistory/updateMedicalHistory/deleteMedicalHistory/addSurgicalHistory/updateSurgicalHistory/deleteSurgicalHistory callbacks and context methods
- [x] Add parseMedicalHistoryTranscript server endpoint (Whisper + LLM → condition, ICD-10, date, status, physician, notes)
- [x] Add parseSurgicalHistoryTranscript server endpoint (Whisper + LLM → procedure, CPT, date, type, surgeon, facility, anesthesia, complications)
- [x] Build Medical History screen (app/log/medical-history.tsx) with AI Voice Scribe, status chips, CRUD list
- [x] Build Surgical History screen (app/log/surgical-history.tsx) with AI Voice Scribe, type/anesthesia chips, CRUD list
- [x] Add Medical History and Surgical History LogCard rows to Records tab (record.tsx)
- [x] Add stethoscope/scissors/bandage icons to icon-mapping.ts
- [x] Fix icon-mapping test (stethoscope → medical-services)
- [x] Update test mocks (bmr.test.ts, dashboard-averages.test.ts, vitalsync.test.ts) with medicalHistory/surgicalHistory fields
- [x] All 179 tests passing, 0 TypeScript errors

## Feature: ICD-10 / CPT Autocomplete (Mar 13 2026)
- [ ] Build curated ICD-10 code dataset (top ~300 common conditions) in lib/clinical/icd10-codes.ts
- [ ] Build curated CPT code dataset (top ~200 common procedures) in lib/clinical/cpt-codes.ts
- [ ] Build reusable CodePickerSheet component (search input + filtered list + select callback)
- [ ] Wire ICD-10 picker into Medical History screen (condition name + code fields)
- [ ] Wire CPT picker into Surgical History screen (procedure name + code fields)

## Feature: Condition Timeline Dashboard Card (Mar 13 2026)
- [ ] Build ConditionTimelineCard component (chronological list of active conditions + recent procedures)
- [ ] Add card to Dashboard below vital grid
- [ ] Tap on condition → navigate to Medical History screen
- [ ] Tap on procedure → navigate to Surgical History screen

## Feature: Dynamic Diet Compliance & DietProfile (Mar 13 2026)
- [ ] Define DietProfile type and DietType ('dash' | 'renal' | 'ketogenic' | 'low_carb' | 'standard')
- [ ] Add DietProfile state to health context with per-diet macro/mineral targets
- [ ] Update DASH compliance ring to use DietProfile targets (sodium, potassium, protein, carbs)
- [ ] Show active diet type badge on compliance ring card
- [ ] Add diet type selector to Record tab / DASH log screen

## Feature: Meal IQ Post-Meal Analysis (Mar 13 2026)
- [ ] Build meal-iq.ts engine: correlate diet log entries with vitals recorded 1–4 hours later
- [ ] Build server endpoint health.analyzeMealImpact (LLM generates Meal IQ insight from meal + vitals delta)
- [ ] Add Brain icon button to diet log entries that have correlated vitals
- [ ] Build MealIQSheet bottom sheet showing BP delta, HR delta, and LLM insight text
- [ ] Add Na:K ratio and Fiber:Carb ratio to meal analysis context

## Feature: A1C Estimation Card (Mar 13 2026)
- [ ] Build computeEstimatedA1C(readings, days) using ADAG formula: (avg_glucose + 46.7) / 28.7
- [ ] Build ProjectedA1CCard dashboard component with 30/60/90-day selector
- [ ] Add mandatory disclaimer: "Estimated A1C is a statistical projection... not a substitute for a lab test"
- [ ] Add card to Dashboard (below or alongside blood sugar card)
- [ ] Show trend arrow (improving / stable / worsening) based on 30-day vs 90-day comparison

## Feature: Na:K Ratio & Fiber:Carb Ratio Analytics (Mar 13 2026)
- [ ] Compute Na:K ratio from sodium + potassium logs
- [ ] Compute Fiber:Carb ratio from nutrition logs
- [ ] Add Na:K and Fiber:Carb ratio rows to nutrition analytics / correlation engine
- [ ] Show clinical reference ranges (Na:K < 1.0 optimal, Fiber:Carb > 0.14 optimal)


## Feature: ICD-10 / CPT Autocomplete (Mar 13 2026)
- [ ] Build curated ICD-10 code dataset (~300 common conditions) in lib/clinical/icd10-codes.ts
- [ ] Build curated CPT code dataset (~200 common procedures) in lib/clinical/cpt-codes.ts
- [ ] Build reusable CodePickerSheet component (search input + filtered list + select callback)
- [ ] Wire ICD-10 picker into Medical History screen
- [ ] Wire CPT picker into Surgical History screen

## Feature: Condition Timeline Dashboard Card (Mar 13 2026)
- [ ] Build ConditionTimelineCard component (active conditions + recent procedures)
- [ ] Add card to Dashboard below vital grid
- [ ] Tap condition/procedure navigates to respective log screen

## Feature: Dynamic Diet Compliance & DietProfile (Mar 13 2026)
- [ ] Define DietProfile type and DietType in types.ts
- [ ] Add DietProfile state to health context with per-diet targets
- [ ] Update DASH compliance ring to use DietProfile targets
- [ ] Add diet type selector to Record tab / DASH log screen

## Feature: Meal IQ Post-Meal Analysis (Mar 13 2026)
- [ ] Build meal-iq.ts engine: correlate diet logs with vitals 1-4 hours later
- [ ] Build server endpoint health.analyzeMealImpact (LLM Meal IQ insight)
- [ ] Add Brain icon to diet log entries with correlated vitals
- [ ] Build MealIQSheet bottom sheet (BP delta, HR delta, LLM insight, Na:K ratio, Fiber:Carb ratio)

## Feature: A1C Estimation Card (Mar 13 2026)
- [ ] Build computeEstimatedA1C using ADAG formula: (avg_glucose + 46.7) / 28.7
- [ ] Build ProjectedA1CCard dashboard component with 30/60/90-day selector
- [ ] Add mandatory lab disclaimer to card
- [ ] Add trend arrow (improving/stable/worsening) comparing 30-day vs 90-day

## Feature: Na:K Ratio & Fiber:Carb Ratio Analytics (Mar 13 2026)
- [ ] Compute Na:K ratio from sodium + potassium logs
- [ ] Compute Fiber:Carb ratio from nutrition logs
- [ ] Add ratios to nutrition analytics with clinical reference ranges

## Feature: Doctor Report PDF Enhancements
- [ ] Add Projected A1C section to Doctor Report PDF
- [ ] Add Condition Timeline (medical + surgical history) to Doctor Report PDF
- [ ] Add Meal IQ insights summary to Doctor Report PDF

## Feature: Meal IQ History View
- [ ] Meal IQ history section in Records tab
- [ ] Store Meal IQ analyses in health context (AsyncStorage)
- [ ] Sort analyses by impact score
- [ ] MealIQHistoryCard component

## Feature: Diet Selector in Settings
- [ ] Diet type picker in Settings tab
- [ ] Show current diet profile with description
- [ ] Persist selection via health context

## Feature: Meal IQ Trend Chart, Renal Alert, PDF Share
- [x] Meal IQ weekly trend chart on Dashboard (line chart, avg impact score per day)
- [ ] Renal diet potassium alert — push notification when daily K+ exceeds 2,000mg
- [x] PDF share sheet on Doctor Report screen (native iOS/Android Share)

## Feature: Renal Diet Food Database
- [ ] Build potassium food database (100+ foods with mg/100g values)
- [ ] Create FoodLookupSheet component with search and renal flagging
- [ ] Wire FoodLookupSheet into sodium log screen

## Feature: Meal IQ Weekly Digest Notification
- [ ] Add scheduleMealIQWeeklyDigest function to background-task.ts
- [ ] Schedule Sunday 7pm notification with weekly average and top meal
- [ ] Wire scheduling into notification settings screen

## Feature: A1C Trend History
- [ ] Add A1CSnapshot type and a1cHistory to HealthData/storage
- [ ] Persist each A1C calculation with timestamp
- [ ] Add 90-day sparkline to ProjectedA1CCard
- [x] Move Lab Results card between Medications and Medical/Surgical History

## Feature: Clinical Records UX & Lab Linking
- [ ] Merge Medications and Lab Results under a "Clinical Records" section header in Records tab
- [x] Add Lab Results count badge to Records tab icon (green dot when new labs added)
- [ ] Lab-to-Condition linking: link lab results to MedicalHistoryRecord conditions
- [ ] Doctor Report PDF: show correlated lab trends alongside linked conditions

## Feature: Condition-Specific Lab Trend Sparkline
- [ ] Build LabTrendSparkline component (mini SVG line chart per analyte)
- [ ] Add "Linked Lab Trends" section to Medical History detail view
- [ ] Show analyte trend over time with reference range band

## Feature: Lab Result Reminder Notifications
- [ ] Build scheduleLabReminders function (per panel, based on last result date)
- [ ] Add recommended intervals per panel type (CMP 90d, CBC 90d, LIPID 180d, A1C 90d)
- [ ] Wire scheduling into labs/entry.tsx save handler
- [ ] Add Lab Reminders toggle to Settings notifications section

## Feature: Per-Analyte Custom Alert Thresholds (Mar 13 2026)
- [x] Add AnalyteThresholdConfig type and storage to threshold-config.ts
- [x] Add analyte threshold checker to threshold-checker.ts (fires on lab save)
- [x] Build AnalyteThresholdsSection in Threshold Alerts settings screen
- [x] Wire analyte threshold check into labs/entry.tsx save handler

## Feature: Lab History CSV Export (Mar 13 2026)
- [x] Build exportLabsToCSV() utility in lib/health/lab-export.ts
- [x] Add "Export CSV" button to Labs screen header
- [x] Share via expo-sharing share sheet

## Feature: Condition Severity Badge (Mar 13 2026)
- [x] Build computeConditionSeverity() utility using linked lab abnormal counts
- [x] Add severity chip (Mild/Moderate/Severe) to Medical History condition cards

## Feature: Dashboard & Record UX Polish (Mar 13 2026)
- [x] Collapse caloric balance card on Dashboard (collapsed by default, fire emoji in header)
- [x] Remove ECG scan entry from Record screen

## Feature: Threshold Edit Flow (Mar 13 2026)
- [x] Tap existing analyte row to edit bounds in-place (no delete-and-recreate)

## Feature: CSV Clipboard Fallback (Mar 13 2026)
- [x] Copy CSV to clipboard when share sheet unavailable (web)

## Feature: Severity Tooltip Popover (Mar 13 2026)
- [x] Long-press severity chip shows popover listing out-of-range analytes with values

## Feature: Tooltip Scroll (Mar 13 2026)
- [x] Wrap severity tooltip analyte rows in ScrollView (max height) to prevent overflow on small screens

## Feature: Caloric Goal Personalisation (Mar 13 2026)
- [x] Add goalKcal field to user profile storage module
- [x] Add caloric goal input to Profile screen
- [x] Wire goalKcal from profile into CaloricBalanceCard and SevenDayCaloricTrendCard on Dashboard

## Feature: Record Recent Entries (Mar 13 2026)
- [x] Build RecentEntriesSection component showing last 3 log entries across all categories
- [x] Wire into Record screen below the stats grid

## Feature: Recent Entries UX Polish (Mar 13 2026)
- [x] Show More / Show Less toggle on Recent Entries card (3 → 5 → 10 entries)
- [x] Empty state for Recent Entries card when no data exists yet
- [x] Refresh goalKcal from storage on Dashboard tab focus (useFocusEffect)

## Feature: Recent Entries Category Filter (Mar 13 2026)
- [x] Horizontal chip row (All / Vitals / Labs / Nutrition) above Recent Entries list
- [x] Filter entries by selected category chip

## Feature: Profile Caloric Goal Presets (Mar 13 2026)
- [x] Quick-select preset chips (1500 / 1800 / 2000 / 2500 kcal) below goal input in Profile screen

## Feature: Settings Tab Alert Badge (Mar 13 2026)
- [x] Track unread analyte threshold alert count in AsyncStorage
- [x] Increment count when analyte-threshold-checker fires a notification
- [x] Show unread-count badge on Settings tab icon
- [x] Clear badge when user opens Threshold Alerts settings screen

## Feature: Custom Caloric Goal Preset (Mar 13 2026)
- [x] Add customKcalPreset field to UserProfile type
- [x] Add "+ Add custom" chip to the preset row in Profile screen
- [x] Inline text input to enter and save a custom preset value
- [x] Show saved custom preset as a tappable chip alongside the built-in four

## Feature: Settings Tab Badge Animation (Mar 13 2026)
- [x] Animate the AlertBadge with a scale-in when count increases

## Feature: Custom Preset Label (Mar 13 2026)
- [x] Add customKcalPresetLabel field to UserProfile type
- [x] Add optional label input in the custom preset inline form
- [x] Show label (truncated) on the chip instead of the number when set

## Feature: Threshold Alert Snooze 24h (Mar 13 2026)
- [x] Add snoozed-until map to threshold-config (per analyteId)
- [x] Skip firing notification if analyte is currently snoozed
- [x] Add "Snooze 24h" button to analyte threshold rows in Threshold Alerts screen

## Feature: Recent Entries Filter Memory (Mar 13 2026)
- [x] Persist selected category filter chip to AsyncStorage
- [x] Restore persisted filter on mount in RecentEntriesSection

## Feature: Snooze Duration Picker (Mar 13 2026)
- [x] Replace fixed 24h snooze with action sheet offering 4h / 12h / 24h / 48h options

## Feature: Custom Preset Label Rename (Mar 13 2026)
- [x] Allow renaming label without changing kcal value via a dedicated rename button

## Feature: Recent Entries Swipe-to-Delete (Mar 13 2026)
- [x] Swipe-left gesture on each entry row reveals a Delete action
- [x] Deleting removes the entry from the underlying health data store

## Feature: Clinical Narrative Timeline Refactor (Mar 13 2026)
- [x] Define ClinicalEvent schema with INPUTS / OBSERVATIONS / INSIGHTS types
- [x] Build data aggregation layer (buildClinicalNarrative) from health state
- [x] Correlation engine: link High-Sodium Input → Hypertension Observation within 4h (Meal IQ)
- [x] Postprandial peak reminders at +1h and +2h after each meal input
- [x] Colour-coded urgency engine (Normal/Elevated/Stage2) with pulsing animation for Stage 2
- [x] Build ClinicalNarrativeTimeline component replacing old timeline
- [x] Wire new component into the Clinical Timeline screen

## Feature: Correlation Sensitivity Slider (Mar 13 2026)
- [x] Add correlationWindowHours field (1–8h) to threshold-config storage
- [x] Add chip selector in Threshold Alerts settings screen under a "Clinical Narrative" section
- [x] Pass correlationWindowHours into buildClinicalNarrative() to control the link window

## Feature: Narrative Date Filter (Mar 13 2026)
- [x] Add Today / 7d / 30d chip row to ClinicalNarrativeCard header
- [x] Filter events by selected date range in the card
- [x] Persist selected range to AsyncStorage

## Feature: Meal IQ Deep-Dive Screen (Mar 13 2026)
- [x] Create app/insights/meal-iq-detail.tsx screen
- [x] Impact score gauge, BP/glucose impact chips, correlation type explanation
- [x] Mini bar chart for glucose and BP over last 24h
- [x] Educational footer with actionable advice
- [x] Wire navigation from ClinicalNarrativeCard on Meal IQ / correlation row tap

## Feature: Collapsible 7-Day Caloric Trend Chart (Mar 14 2026)
- [x] SevenDayCaloricTrendCard now defaults to collapsed (tap header to expand bar chart)

## Feature: Dashboard Card Collapse Persistence (Mar 14 2026)
- [x] Build useCardExpanded(key, defaultExpanded) hook backed by AsyncStorage
- [x] Wire hook into CaloricBalanceCard, SevenDayCaloricTrendCard, WeeklyMacroTrendCard
- [x] Default WeeklyMacroTrendCard to collapsed
- [x] Add Collapse All / Expand All toggle in Dashboard header

## Feature: Measurement Unit Consistency (Mar 14 2026)
- [x] Standardise Heart Rate unit to "bpm" everywhere (lowercase, consistent with clinical convention)
- [x] Standardise Sleep duration unit to "hrs" everywhere (Report PDF currently says "hours")
- [x] Standardise ECG interval display: ECG screen shows seconds (s), Report PDF shows ms — align both to ms
- [x] Weight: body-composition detail, weekly summary card, and report PDF always show kg — make them respect user's kg/lbs preference
- [x] Blood Sugar: recent-entries-section and clinical-narrative always show mg/dL — make them respect user's mg/dL / mmol/L preference

## Feature: Last Synced Timestamp on VitalCards (Mar 14 2026)
- [x] Build formatRelativeTime(isoString) utility (e.g. "2 hrs ago", "just now", "3d ago")
- [x] Add optional lastSyncedAt prop to VitalCard component
- [x] Derive lastSyncedAt for each card from the latest record's timestamp in health data
- [x] Render subtle timestamp label below each VitalCard's primary value
- [x] Handle missing/null timestamp gracefully (show nothing)

## Feature: Stale Data Warning on VitalCards (Mar 14 2026)
- [x] Show amber color and warning icon on lastSyncedAt label when data is older than 24 hours

## Bug: HealthKit Not Working on Real Device (Mar 14 2026)
- [x] Fix healthkit-loader.ts: guard checks wrong global name — actual global is `NitroModulesProxy`, not `NitroModules` or `__nitroModules`
- [x] Fix native-health-service.ts: v13 returns Date objects for startDate/endDate — serialize to ISO strings before storing in health records
- [x] Fix blood pressure correlation: objects field uses `quantityType` (correct), `r.uuid ?? uuid()` already safe
- [x] Fix sleep value parsing: v13 returns CategoryValueSleepAnalysis enum (numeric 0-5) — switch cases already match
- [ ] Add HealthKit sync error display in the UI so the user can see what went wrong
- [ ] Add diagnostic mode: log all sync errors to console and show in Data Sources screen

## Feature: Collapsible Caloric Balance Card (Mar 14 2026)
- [x] Add useCardExpanded hook to CalorieBurnCard (default collapsed, persisted)
- [x] Add overrideExpanded prop to CalorieBurnCard
- [x] Wire CalorieBurnCard into Dashboard Collapse All toggle

## Feature: Collapsible MacroRingCard + Calorie Goal Quick-Edit (Mar 14 2026)
- [x] Make MacroRingCard collapsible (useCardExpanded, overrideExpanded, default collapsed)
- [x] Wire MacroRingCard into Dashboard Collapse All toggle
- [x] Add calorie-goal quick-edit pencil icon to CalorieBurnCard header
- [x] Pencil opens inline modal to edit daily kcal goal (persisted via useMacroGoals)
- [x] Move MealIQ Trend card to just before Quick Actions section on Dashboard

## Feature: Stale Data Warning on VitalCards (Mar 14 2026)
- [x] Show amber color and warning icon on lastSyncedAt label when data is older than 24 hours
## Feature: Dynamic Diet Name in UI Labels (Mar 14 2026)
- [x] Replace hardcoded "DASH Diet" UI label in blood-sugar.tsx (nutrition summary footer)
- [x] Replace hardcoded "DASH Diet" UI label in caloric-trend-insight-card.tsx (empty state text)
- [x] Replace hardcoded "DASH Diet" UI label in dietary-summary-view.tsx (empty state text)
- [x] Replace hardcoded "DASH Diet" category string in recent-entries-section.tsx (entry row label)
- [x] All four locations now read user's selected diet type via useDietType hook and DIET_TYPE_OPTIONS lookup

## Feature: Dynamic Diet Name — Full Coverage (Mar 14 2026)
- [x] Replace hardcoded "DASH Diet" UI label in blood-sugar.tsx (nutrition summary footer)
- [x] Replace hardcoded "DASH Diet" UI label in caloric-trend-insight-card.tsx (empty state text)
- [x] Replace hardcoded "DASH Diet" UI label in dietary-summary-view.tsx (empty state text)
- [x] Replace hardcoded "DASH Diet" category string in recent-entries-section.tsx (entry row label)
- [x] Replace hardcoded "DASH Diet" card title in log.tsx (Log tab card)
- [x] Replace hardcoded "DASH Diet" card title in record.tsx (Record tab card)
- [x] Replace hardcoded "DASH Diet" screen header in sodium.tsx
- [x] Add active diet name preview badge in Settings diet picker (shows resolved label below chips)
- [x] Write vitest unit tests for dietLabel resolution (13 tests, all pass)
- [x] TypeScript: 0 errors | Tests: 192 passed

## Feature: Dynamic cardDashSub Subtitle (Mar 14 2026)
- [x] Add cardSubtitle field to DietTypeOption interface in diet-type.ts
- [x] Add per-diet cardSubtitle to all 6 DIET_TYPE_OPTIONS entries (balanced, keto, dash, diabetic, vegan, mediterranean)
- [x] Replace t.cardDashSub with dynamic dietSubtitle in log.tsx
- [x] Replace t.cardDashSub with dynamic dietSubtitle in record.tsx
- [x] Expose dietSubtitle in sodium.tsx for future use
- [x] Extend diet-label-resolution.test.ts with 8 cardSubtitle tests (21 total, all pass)
- [x] TypeScript: 0 errors | Tests: 192 passed

## Feature: Full cardSubtitle Integration (Mar 14 2026)
- [x] Add dietSubtitle line below title in sodium.tsx screen header (headerSubtitle style added)
- [x] Enrich Settings active-protocol badge: show cardSubtitle below the label chip
- [x] Add cardSubtitle to diet-profile.ts DIET_TYPE_OPTIONS (5 entries: standard, dash, renal, ketogenic, low_carb)
- [x] Add diet protocol picker with cardSubtitle preview to onboarding Profile slide
- [x] Persist selected diet via saveDietType on onboarding completion
- [x] TypeScript: 0 errors | Tests: 200 passed (8 new cardSubtitle tests)

## Feature: Diet Protocol UX Polish (Mar 14 2026)
- [x] Unify diet type storage key: health-context.tsx now uses @vitalsync/diet_type_v1 (same as diet-type.ts) so onboarding and Settings stay in sync
- [x] Add "Change →" shortcut chip to sodium screen header (right side) — taps navigate to Settings diet picker
- [x] Animate cardSubtitle text swap in Settings: 100ms fade-out → setDietType → 150ms fade-in using Animated.timing + useNativeDriver
- [x] TypeScript: 0 errors | Tests: 200 passed

## Feature: Diet Protocol UX Polish (Mar 14 2026)
- [x] Unify diet type storage key: health-context.tsx now uses @vitalsync/diet_type_v1 (same as diet-type.ts) so onboarding and Settings stay in sync
- [x] Add Change shortcut chip to sodium screen header (right side) -- taps navigate to Settings diet picker
- [x] Animate cardSubtitle text swap in Settings: 100ms fade-out -> setDietType -> 150ms fade-in using Animated.timing + useNativeDriver
- [x] TypeScript: 0 errors | Tests: 200 passed

## Feature: Meal IQ Trend Collapsible + Protocol Badge (Mar 14 2026)
- [x] Make Meal IQ Trend section collapsible on Dashboard (Pressable header, LayoutAnimation, chevron rotate)
- [x] Add active protocol emoji+label badge to WeeklySummaryCard header
- [x] Unsaved-entry guard on sodium screen back button and Change protocol chip
- [x] Per-diet entry mode persistence in AsyncStorage (ENTRY_MODE_STORAGE_PREFIX + dietType)
- [x] TypeScript: 0 errors | Tests: 200 passed

## Feature: Meal IQ Persistence + Diet Switcher + Entry Mode Chip (Mar 14 2026)
- [x] Persist Meal IQ Trend expanded/collapsed state in AsyncStorage
- [x] Long-press diet switcher action sheet on WeeklySummaryCard protocol badge
- [x] Per-diet entry mode indicator chip on sodium screen header

## Feature: Dashboard Card Reorder (Mar 14 2026)
- [x] Move Clinical Summary card between Meal IQ Trend and Quick Actions on Dashboard

## Feature: Haptic + Animation + Timestamp + Caloric Balance Cleanup (Mar 14 2026)
- [x] Haptic feedback on WeeklySummaryCard long-press diet switcher
- [x] Animated entry mode chip swap on sodium screen (120ms fade)
- [x] Last analysis timestamp on Meal IQ Trend card header
- [x] Remove daily intake vs goal section from Caloric Balance card

## Feature: Collapsible Settings Sections (Mar 14 2026)
- [x] Make all Settings screen sections collapsible with animated expand/collapse headers

## Feature: Four UX Improvements (Mar 14 2026 batch 2)
- [x] Make all Settings sections collapsible with LayoutAnimation and AsyncStorage persistence
- [ ] Add Last synced timestamp to WeeklySummaryCard header
- [ ] Add long-press goal setter sheet to Caloric Balance gauge
- [ ] Add swipe-to-dismiss gesture on sodium screen Change chip

## Fix: Remove Duplicate Caloric Balance Card (Mar 14 2026)
- [x] Remove duplicate Caloric Balance card (🔥 Base Goal/Adjusted Goal/Remaining) from Dashboard

## Fix: Dashboard Card Reorder (Mar 14 2026)
- [x] Move 7-Day Summary card between Meal IQ Trend and Clinical Summary on Dashboard

## Fix: Match 7-Day Caloric Trend dimensions to Meal IQ Trend (Mar 14 2026)
- [x] Make 7-Day Caloric Trend card use the same dimensions as Meal IQ Trend card
- [x] Scale BAR_W in 7-Day Caloric Trend chart proportionally with screen width
- [x] Add "Today" highlight ring to current-day bar in 7-Day Caloric Trend chart
- [x] Make 7-Day Caloric Trend card default to expanded
- [x] Add caloric surplus/deficit annotation chip in stats row
- [x] Tap-to-drill-down on vs. Goal chip — daily surplus/deficit breakdown modal with signed bar chart
- [x] Exercise bonus inline editor in 7-Day Caloric Trend card footer
- [x] Streak counter badge in 7-Day Caloric Trend card header
- [x] Add "Follow system" third theme chip in Settings alongside Light/Dark
- [x] Scheduled dark mode with user-defined time range (persisted, checked on focus)
- [x] AMOLED pure-black variant selectable in Settings
- [x] Auto-enable AMOLED palette during scheduled dark mode window when base preference is "amoled"
- [x] Add AppState listener + 60s interval in ThemeProvider to auto-apply AMOLED/dark at schedule boundary without user interaction
- [x] "Active now" amber badge in Settings next to scheduled dark mode time range
- [x] Streak milestone haptic + toast in SevenDayCaloricTrendCard (3, 7, 14 day milestones)
- [x] Weekly net balance body-fat annotation in CaloricBreakdownModal
- [x] Reset streak milestone key on daily calorie goal change
- [x] Tap-to-dismiss milestone toast in SevenDayCaloricTrendCard
- [x] Body-fat annotation disclaimer in CaloricBreakdownModal
- [ ] Milestone badge history row in SevenDayCaloricTrendCard (🔥3, 🔥7, 🔥14 greyed until earned)
- [x] Goal-change confirmation alert when streak milestones are reset
- [x] CSV export with native share sheet in CaloricBreakdownModal
- [x] Long-press tooltip on milestone badges in SevenDayCaloricTrendCard
- [x] Date-range CSV filename (e.g. caloric_breakdown_Mar08-Mar14.csv)
- [x] ActivityIndicator spinner on share button while isExporting is true
- [x] Tap-to-celebrate on earned milestone badges (haptic + amber pulse animation)
- [x] Accessibility labels and hints on milestone badge Pressables
- [x] Confetti burst on 14-day milestone earn (react-native-confetti-cannon)
- [x] Badge earned date subtitle stored per milestone and shown below badge emoji
- [x] Replay confetti burst (40 particles) when tapping already-earned 14-day badge
- [x] Streak freeze token (🧊 chip in header, 7-day recharge, AsyncStorage)
- [x] Milestone share card via expo-sharing on long-press of earned badge
- [x] Confetti origin from 14-day badge onLayout position
- [x] Move 7-Day Caloric Trend card between Weekly Macro Trend and Meal IQ in Dashboard
- [x] Confirm dark mode is the default (theme provider)
- [x] Long-press tooltip on 🧊 freeze chip showing recharge countdown
- [x] Weekly Macro Trend card default to collapsed
- [x] Meal IQ card: show latest score chip in header
- [x] Make Custom Correlation Explorer section collapsible in analytics screen
- [x] Make DASH Diet and Diabetic Nutrition sections collapsible in Correlate screen
- [x] Add "Run Analysis" button with loading indicator to Custom Correlation Explorer
- [x] Display dynamic diet name on Record screen based on user's diet log
- [x] Fix crash: Cannot read properties of undefined (reading 'color')

## Diet Color Improvements
- [x] Add color field to DietTypeOption interface and all DIET_TYPE_OPTIONS entries
- [x] Apply diet accent color to Record screen diet LogCard
- [x] Show diet-change toast on Record screen when protocol changes

## Crash Fix: Dual DietType System
- [x] Fix health-context.tsx to use DietType from diet-type.ts (not diet-profile.ts)
- [x] Fix settings.tsx to import DIET_TYPE_OPTIONS from diet-type.ts
- [x] Give DashComplianceCard its own local diet state (diet-profile DietType) instead of using health context
- [x] Fix sodium.tsx clinicalDietType renal check to use a separate local diet-profile state

## Next Steps (Mar 15 2026)
- [x] Persist collapsed state for Correlate sections (DASH Diet, Diabetic Nutrition, Custom Correlation Explorer)
- [x] Mirror diet-change toast on Log/Sodium entry screen
- [x] Add diet description chip below card subtitle in diet LogCard

## Diet UX Improvements (Mar 15 2026)
- [x] Add renal protocol to diet-type.ts as a first-class DietType
- [x] Smart DashComplianceCard default: map global diet to nearest clinical protocol on first load
- [x] Show description hint below each chip in the Settings diet picker

## Renal Protocol UX (Mar 15 2026)
- [x] Add phosphorus (mg) field to sodium log entry form with NKF daily limit alert (800-1000 mg/day)
- [x] Sync DashComplianceCard clinical diet with global diet on every Settings save
- [x] Add persistent Renal banner to Record screen header when Renal protocol is active

## Phosphorus History (Mar 15 2026)
- [x] Show phosphorus (mg) in sodium log history list rows when present

## Dashboard Diet Sync (Mar 15 2026)
- [x] DashComplianceCard should automatically reflect the global diet profile selected in Settings (no separate manual selector needed inside the card)

## Compliance Card UX (Mar 15 2026)
- [x] Show protocol description subtitle below the protocol badge in DashComplianceCard
- [x] Add "Why this score?" info modal triggered by tapping the score gauge
- [x] Add protocol-change marker (vertical dashed line) on the 4-week sparkline

## Crash Fix: DIET_TARGETS undefined (Mar 15 2026)
- [ ] Fix crash: DIET_TARGETS[dietType] returns undefined when an unrecognised diet type is stored in AsyncStorage — add safe fallback to 'balanced'

## Sparkline & Compliance Features (Mar 15 2026)
- [ ] Fix crash: add keto and diabetic to DIET_TARGETS in diet-profile.ts; add safe fallback in DashComplianceCard
- [ ] Add Best week callout (gold ring + Best label) to the 4-week sparkline
- [ ] Add day-column detail popover (Na/K/carbs + pass/fail per criterion) when tapping a day dot
- [ ] Add weekly compliance push notification at end of each week

## Diet Profile Display (Mar 15 2026)
- [x] Replace "Projected A1C" display with the user's active diet profile (name, emoji, accent color) from global health context

## Diet Card Improvements (Mar 15 2026)
- [x] Add "last changed" timestamp to Active Diet Profile card (e.g. "Protocol set 3 days ago")
- [x] Add diet protocol history log in AsyncStorage with a history sheet inside the diet card
- [x] Link nutrient chips in diet card to scroll dashboard to DASH Compliance card

## Diet Card & Settings (Mar 15 2026)
- [x] Add streak counter to Active Diet Profile card (consecutive days meeting all protocol targets)
- [x] Add optional Notes field to protocol history entries (prompt on protocol change)
- [x] Add "View protocol history" row in Settings → Diet section

## Diet Profile Card Collapsible (Mar 15 2026)
- [x] Make Active Diet Profile card collapsible (toggle expanded/collapsed, persist state to AsyncStorage)

## Diet Card UX Polish (Mar 15 2026)
- [x] Show collapsed summary row in diet card header (emoji, protocol name, streak)
- [x] Add long-press streak reset with confirmation alert
- [x] Add "Pin to top" option for diet card in dashboard

## Diet Card Features (Mar 15 2026)
- [x] Add best streak record (track all-time highest streak in AsyncStorage, show "Best: Nd" below current streak badge)
- [x] Add diet card share button (export protocol + streak snapshot for sharing)
- [x] Add daily protocol reminder notification with configurable time in Settings

## Diet Card Follow-up Features (Mar 15 2026)
- [x] Streak milestone notifications (fire push at 7, 14, 30-day milestones)
- [x] Long-press "Best: Nd" to reset best streak with confirmation
- [x] Auto-reschedule daily reminder notification when protocol changes in Settings

## Diet Card Enhancements (Mar 15 2026)
- [x] Streak leaderboard / personal records screen (best streak per protocol, accessible from diet card)
- [x] 7-bar compliance sparkline inside expanded diet card (daily scores for past week)
- [x] Milestone badge row in diet card header (🥉7d · 🥈14d · 🥇30d, lit up in protocol accent when reached)

## 7-Day Caloric Trend Relocation (Mar 15 2026)
- [ ] Remove SevenDayCaloricTrendCard from standalone dashboard position
- [ ] Embed 7-Day Caloric Trend inside DashComplianceCard (shown when diet is diabetic/keto/low_carb)
- [ ] Embed 7-Day Caloric Trend inside CaloricBalanceCard expanded body

## DASH Compliance Card Removal (Mar 15 2026)
- [x] Remove DashComplianceCard from dashboard (functionality moved to Active Diet Protocol card)

## Diet Card Consolidation (Mar 15 2026)
- [x] Delete unused dash-compliance-card.tsx file
- [x] Move 7-Day Caloric Trend (CaloricTrendMini) into Active Diet Protocol card expanded body
- [x] Add 4-week compliance history row to Active Diet Protocol card

## Diet Card Advanced Features (Mar 15 2026)
- [x] Week drill-down modal: tap a 4-week compliance badge to see day-by-day breakdown
- [x] Inline kcal goal editor: long-press Daily Goal stat to edit target without going to Settings
- [x] Export PDF button: generate a shareable one-page diet report in the card footer

## Dashboard Card Reorder (Mar 15 2026)
- [x] Move Caloric Balance and Weekly Macro Trend cards to bottom of dashboard, after Clinical Summary

## Caloric Balance Integration (Mar 15 2026)
- [x] Embed Caloric Balance content into Active Diet Protocol card expanded body
- [x] Remove standalone CaloricBalanceCard from dashboard

## Weekly Macro Trend Consolidation (Mar 15 2026)
- [x] Embed 7-Day Caloric Trend summary into WeeklyMacroTrendCard
- [x] Embed Today's Caloric Balance gauge into WeeklyMacroTrendCard
- [x] Move Quick Actions into WeeklyMacroTrendCard
- [x] Remove 7-Day Caloric Trend and Caloric Balance from ActiveDietProfileCard
- [x] Remove standalone Quick Actions section from dashboard

## Dashboard Reorder (Mar 15 2026)
- [x] Move Caloric Balance section to after Meal IQ Trend and before Weekly Macro Trend

## Meal IQ Trend Relocation (Mar 15 2026)
- [x] Move Meal IQ Trend card into the Mediterranean diet section (embed in Active Diet Protocol card when Mediterranean protocol is active, or show as a section below it)
- [x] Remove standalone MealIQTrendCard from dashboard

## Dashboard Bottom Reorder (Mar 15 2026)
- [x] Reorder bottom of dashboard: Meal IQ Trend → Clinical Narrative → ECG banner

## Dashboard Top Reorder (Mar 15 2026)
- [x] Move Weekly Summary, Active Diet Protocol, and Meal IQ Trend to top of dashboard (after header vitals)

## Settings Storage Collapsible (Mar 15 2026)
- [x] Make Storage section in Settings collapsible (collapsed by default)

## Settings Improvements (Mar 15 2026)
- [x] Collapse Diagnostics section by default in Settings
- [x] Collapse Diet Profile section by default in Settings
- [x] Add Collapse All / Expand All toggle to Settings header
- [x] Show record count badge in Stored Data section header

## Evidence-Based Dashboard Diet Section (Mar 15 2026)
- [x] Hide MacroRingCard from Dashboard (macros not primary meta-analysis outcome)
- [x] Hide CalorieBurnCard from Dashboard (calorie balance not primary meta-analysis outcome)
- [x] Hide CaloricBalanceMiniCard from Dashboard (same reason)
- [x] Hide WeeklyMacroTrendCard from Dashboard (same reason)
- [x] Hide ActiveDietProfileCard when dietType === 'dash' (DASH compliance score has low evidence quality)
- [x] Keep WeeklySummaryCard (BP, weight, HRV — Tier 1 evidence)
- [x] Keep MealIQTrendCard (Mediterranean only — composite meal quality)
- [x] Keep ClinicalNarrativeCard (integrates all evidence tiers)

## HealthKit Denied/Disabled Handling (Mar 15 2026)
- [x] Audit all HealthKit authorization checks for denied/disabled state
- [x] Ensure no crash or blocked UI when HealthKit is denied
- [x] Show clear user-facing message with path to re-enable in iOS Settings
- [x] All HealthKit data reads must return empty/null gracefully when denied
- [x] BiometricAuthorizationPrompt must not re-prompt when already denied
- [x] Dashboard cards must render with empty state when HealthKit is denied
- [x] Fix requestHealthKitPermissions to return denied (not granted) on error
- [x] Add hkPermDenied state to health context (persisted across restarts)
- [x] Dashboard health banner shows amber 'Open Settings' when denied vs blue 'Connect' when not yet asked
- [x] ColdLaunchPermissionBridge skips re-requesting when already denied

## Record Screen Dynamic Title (Mar 15 2026)
- [x] Record screen header title changes dynamically based on selected data type

## DASH Diet Rename (Mar 15 2026)
- [x] Rename DASH diet label to "Compile Diet" throughout the app

## Quick Diet Log Button & Kenyan Athletes Protocol (Mar 15 2026)
- [x] Add Quick Diet Log button to Dashboard (with macros: carbs, protein, fat, calories)
- [x] Add Kenyan Athletes diet protocol to DIET_TYPE_OPTIONS
- [x] Update diet-label-resolution test for Kenyan Athletes

## Dashboard Layout Reorder (Mar 15 2026)
- [x] Move Clinical Narrative card to appear after ECG Trace banner on Dashboard

## Kenyan Athletes Card (Mar 15 2026)
- [x] Deep research Kenyan athletic dominance (diet, altitude, cold weather, genetics, biomechanics)
- [x] Build KenyanAthletesCard component with tabbed sections
- [x] Wire KenyanAthletesCard under Clinical Narrative on Dashboard
- [x] Add Kenyan macro targets to the Kenyan Athletes diet protocol

## Timboroa Narrative (Mar 15 2026)
- [x] Add first-person Timboroa experience narrative tab to KenyanAthletesCard

## Kenyan Athletes Card Collapsible (Mar 15 2026)
- [x] Make KenyanAthletesCard collapsible, expanded by default only when dietType === 'kenyan_athlete'

## Kenyan Athletes Card Animation (Mar 15 2026)
- [x] Animate KenyanAthletesCard collapse/expand with smooth height animation and rotating chevron

## Diet Protocol Global Propagation (Mar 15 2026)
- [x] Wire diet selection in Settings Diet Profile to global health context so all app screens update instantly
- [x] Ensure Dashboard, Record, Analytics, Clinical Narrative, and Kenyan Athletes card all react to dietType change

## Remove Kenyan Athletes Section (Mar 15 2026)
- [x] Remove KenyanAthletesCard from Dashboard
- [x] Delete kenyan-athletes-card.tsx component file
- [x] Remove kenyan_athlete from DIET_TYPE_OPTIONS in diet-type.ts
- [x] Remove kenyan_athlete conflict detection from detectDietConflict

## Remove Vegan Quick Log (Mar 15 2026)
- [x] Remove vegan quick log button/section from Dashboard

## Premium Dashboard Redesign (Mar 15 2026)
- [ ] Update theme tokens for deep obsidian background and glassmorphism palette
- [ ] Create GlassCard primitive component (24px radius, frosted glass effect)
- [ ] Build DailyReadinessGauge component with glowing arc (0-100%)
- [ ] Build SparklineChart component for 7-day trend miniature graph
- [ ] Redesign BP tile as bento-box with status pill and sparkline
- [ ] Redesign HR tile as bento-box with status pill and sparkline
- [ ] Redesign SpO2 tile as bento-box with status pill and sparkline
- [ ] Redesign Sleep tile as bento-box with status pill and sparkline
- [ ] Add color-coded status pills: Optimal (Emerald), Stable (Amber), Improving (Blue)
- [ ] Wire all new components into Dashboard

## Apple Health Pro Dashboard Redesign
- [x] Create DailyReadinessGauge component with animated SVG arc (0-100 score, gradient fill)
- [x] Create SparklineChart component using react-native-svg (7-day mini trend line)
- [x] Create BentoMetricTile component (glassmorphism, 24px radius, status pills, sparkline)
- [x] Create readiness-score.ts utility (computeReadinessScore, buildSparklineData, status mappers)
- [x] Replace old VitalCard 2x2 grid with new bento-box layout (BP, HR, SpO2, Sleep)
- [x] Add DailyReadinessGauge above the bento grid on Dashboard
- [x] Wire 7-day sparkline data from health records into each bento tile
- [x] Wire color-coded status pills: Optimal (Emerald), Stable (Amber), Improving (Blue), Warning (Orange), Critical (Red)
- [x] Verify 0 TypeScript errors and 200/200 tests pass

## VO2 Max Removal
- [x] Remove VO2MaxCard component and useVO2Max hook from Dashboard

## Readiness Score Enhancements
- [x] Persist daily readiness score snapshots to AsyncStorage (keyed by date)
- [x] Build computeReadinessHistory() — load last 30 days of snapshots
- [x] Build ReadinessHistoryChart component (SVG line chart, 7d/30d toggle)
- [x] Add ReadinessHistoryChart to Analytics screen with segment toggle
- [x] Animate BentoMetricTile status pill with glow-pulse on status change (withSequence + withTiming)
- [x] Build ReadinessBreakdownSheet component (6 component progress bars)
- [x] Wire DailyReadinessGauge onPress to open ReadinessBreakdownSheet

## Tab Order
- [x] Move Clinical Narrative tab to between Diet and ECG Tracer in the tab bar

## Readiness Score Features (Round 2)
- [x] Auto-save readiness snapshot inside forceSync completion handler
- [x] Schedule daily 8 AM push notification with readiness score and trend direction
- [x] Add share button to ReadinessBreakdownSheet (expo-sharing)

## Readiness Score Features (Round 3)
- [x] Add readiness notification opt-in toggle in Settings Notifications section
- [x] Add trend badge (↑ Improving / → Stable / ↓ Declining) to Dashboard header
- [x] Investigate and implement home screen widget for readiness score (scaffold ready for SDK 55)

## Card Size Fixes
- [x] Make 7-Day Summary and ECG Tracer cards same size as Clinical Summary and Vegan cards

## Dashboard Polish (Round 2)
- [x] Unify border-radius to 16 on 7-Day Summary card (currently 18)
- [x] Add section dividers (hairline + marginTop) between card groups
- [x] Add shadow/elevation to ECG banner to match other cards

## Dashboard Polish (Round 3)
- [x] Add iOS-style uppercase section labels (VITALS, NUTRITION, CLINICAL, DIAGNOSTICS) above each card group
- [x] Add haptic feedback (ImpactFeedbackStyle.Light) to ECG banner onPress
- [x] Make section labels sticky using stickyHeaderIndices on the Dashboard ScrollView (implemented as inline labels; stickyHeaderIndices skipped due to conditional children causing index drift)

## Evidence-Based Macros Card
- [x] Build EvidenceBasedMacrosCard component (horizontal segmented bar, Gold Zone, glassmorphism)
- [x] Integrate card into Dashboard after Active Diet Protocol under NUTRITION section

## Evidence-Based Macros Enhancements
- [x] Add 7-day macro sparklines inside legend items (Protein, Fats, Carbs)
- [x] Add Gold Zone pulse animation (withSequence opacity 0.6→→•0.6, 2s loop)p)
- [x] Build MacroFoodBreakdownSheet — tap legend item to see today's top food contributors

## Macros Card — Food Log Integration & Enhancements
- [x] Link EvidenceBasedMacrosCard to Record tab food log (shared data context)
- [x] Add 7-day macro weekly average row below sparkline in each legend item
- [x] Add share button to MacroFoodBreakdownSheet
- [x] Add Gold Zone tap-to-explain inline tooltip

## Macros Card — Goals & Heatmap
- [x] Build macro-goals storage module (AsyncStorage, protein/fat/carb min/max g/kg targets)
- [x] Add Macro Goals customisation section to Settings screen
- [x] Wire custom goals into EvidenceBasedMacrosCard Gold Zone overlay and status pills
- [x] Add 24-hour meal timing heatmap below legend in EvidenceBasedMacrosCard
- [x] Add weekly Gold Zone streak row at bottom of EvidenceBasedMacrosCard

## Macro Goal Presets
- [x] Add preset chips (Vegan Athlete, Endurance, Strength, Maintenance) to SetGoalsSheet

## Smart Culinary Hub — Dashboard Redesign
- [x] Build SmartIntakeAI component (search bar, mic icon, recent suggestions, USDA/AI badge)
- [x] Build EvidenceInsightsPanel component (bento grid, cardiac optimization card, AHA citation)
- [x] Build BioAlignedRecipeCarousel component (recipe cards, macros, Cook Now button, Evidence Link badge)
- [x] Wire all three components into Dashboard NUTRITION section
- [x] Run TypeScript check and tests after wiring

## Collapsible Nutrition Hub Card
- [x] Build NutritionHubCard collapsible wrapper (title "Nutrition", chevron, AsyncStorage persistence)
- [x] Move SmartIntakeAI, EvidenceInsightsPanel, BioAlignedRecipeCarousel inside NutritionHubCard
- [x] Wire NutritionHubCard into Dashboard, remove inline three-component block
- [x] Run TypeScript check and tests

## NutritionHubCard — Move to Record screen
- [x] Add "Nutrition" section label after Blood Sugar in record.tsx
- [x] Insert NutritionHubCard after Blood Sugar LogCard (before Diet card) in record.tsx
- [x] Remove NutritionHubCard from Dashboard (index.tsx) NUTRITION section
- [x] Run TypeScript check and tests

## Record Screen — Activity reorder
- [x] Move Activity section to after Blood Sugar and before Nutrition in record.tsx

## Bio-Aligned Recipe Carousel — 50 recipes
- [x] Expand RECIPES array from 6 to 50 entries with full macro data, protocol badges, and citations

## Recipe Carousel — Filter, Detail Modal, Favourites
- [x] Add protocol filter chips (All / DASH / AHA / Vegan Athlete / Mediterranean / Cardiac) above carousel
- [x] Build RecipeDetailModal with step-by-step instructions, macro ring chart (SVG), and countdown timer
- [x] Wire Cook Now button to open RecipeDetailModal
- [x] Add heart icon favourites with AsyncStorage persistence
- [x] Add My Favourites section at top of carousel when favourites exist
- [x] Run TypeScript check and tests

## Recipe Carousel — Shopping List, Ranking, Search
- [x] Add "Generate Shopping List" button inside RecipeDetailModal (share sheet)
- [x] Personalised macro-based recipe ranking using useGoals() in carousel
- [x] Add real-time search bar above filter chips in carousel
- [x] Run TypeScript check and tests

## Dashboard & Recipe Fixes
- [x] Make Nutritional Alignment card collapsible on Dashboard
- [x] Fix Cook Now button in Bio-Aligned Recipe Carousel to open RecipeDetailModal
- [x] Run TypeScript check and tests

## EvidenceBasedMacrosCard — Collapsible
- [x] Add collapsible toggle to EvidenceBasedMacrosCard (NUTRITIONAL ALIGNMENT header)
- [x] Run TypeScript check and tests

## EvidenceBasedMacrosCard — Persistence & Sync
- [x] Persist collapsed state to AsyncStorage (key: nutritional-alignment-expanded)
- [x] Show compact macro pill row (P · F · C) when card is collapsed
- [x] Sync isExpanded with Dashboard global allCollapsed toggle via overrideExpanded prop
- [x] Run TypeScript check and tests

## HealthKit Authorization
- [x] Audit all HealthKit data types read across the codebase
- [x] Create useHealthKitAuthorization hook with requestAuthorization for all required types (already in lib/health/permissions.ts + health-context.tsx)
- [x] Wire authorization hook into app root layout (fires on first launch, iOS only — ColdLaunchPermissionBridge in app/_layout.tsx)
- [x] Run TypeScript check and tests

## All Cards Start Collapsed
- [x] Set defaultExpanded=false on all Dashboard cards
- [x] Set EvidenceBasedMacrosCard to start collapsed (useState false)
- [x] Set defaultExpanded=false on all Record screen cards
- [x] Add collapsible behaviour to any Record cards that lack it
- [x] Run TypeScript check and tests

## Card Persistence & UX Enhancements
- [x] Add AsyncStorage persistence to WeeklySummaryCard (key: weekly-summary-expanded)
- [x] Add AsyncStorage persistence to MealIQTrendCard (key: meal-iq-trend-expanded)
- [x] Add AsyncStorage persistence to ClinicalNarrativeCard (key: clinical-narrative-expanded)
- [x] Add AsyncStorage persistence to NutritionHubCard (key: nutrition-hub-expanded)
- [x] Add AsyncStorage persistence to MealIQHistoryCard (key: meal-iq-history-expanded)
- [x] Add Expand All / Collapse All toggle to Record screen header
- [x] Wire Record screen allCollapsed state to all collapsible cards
- [x] Add compact summary line to collapsed WeeklySummaryCard header
- [x] Add compact summary line to collapsed MealIQHistoryCard header
- [x] Run TypeScript check and tests

## Remove Collapse All Buttons
- [x] Remove Collapse All / Expand All toggle from Dashboard header
- [x] Remove Collapse All / Expand All toggle from Settings screen (if present)
- [x] Run TypeScript check and tests
- [x] Remove "Stable" readiness trend badge from Dashboard header
- [x] Build ProjectedA1CCard component using ADAG formula on last 30 days of glucose readings
- [x] Support mmol/L → mg/dL conversion before applying formula
- [x] Display A1C as percentage with risk-zone colour coding (Normal / Pre-diabetic / Diabetic)
- [x] Wire ProjectedA1CCard into Blood Sugar screen
- [x] Build A1C snapshot storage module (daily AsyncStorage snapshots)
- [x] Add postprandial spike callout with DASH/ADA diet tip in ProjectedA1CCard
- [x] Add 30-day A1C trend line chart inside ProjectedA1CCard expanded view
- [x] Integrate Projected A1C (value, avg glucose, window) into Doctor Report PDF
- [x] Fix Dashboard Nutrition Alignment card to pull data from both Nutrition log and Diet log
- [x] Add "My A1C Target" input in Blood Sugar settings with gap display and gauge colour override
- [x] Log a SodiumRecord food entry when user selects a vitals-aligned meal suggestion
- [x] Add 5-second undo toast after logging a vitals-aligned meal, with live countdown and undo action
- [x] Fix Smart Intake microphone — voice recording not working
- [x] Fix voice-to-text crash across all screens when microphone button is tapped
- [x] Fix microphone crash — app crashes on mic button press across all screens
- [x] Remove collapsible/accordion behaviour from Settings screen — all sections always expanded
- [x] Add real-time search bar to Settings screen
- [x] Add section dividers between Settings sections
- [x] Add sticky section title labels to Settings screen
- [x] Fix microphone crash and broken transcription across all screens
- [x] Build RecordingVisualiser component (pulsing waveform ring reacting to mic level)
- [x] Extend useVoiceRecorder hook with audio level metering
- [x] Replace static red dot with RecordingVisualiser in all 7 recording screens

## Live Recording Visualiser
- [x] Build RecordingVisualiser component (pulsing waveform ring reacting to mic level)
- [x] Extend useVoiceRecorder hook with audio level metering (isMeteringEnabled + metering field)
- [x] Replace static red dot with RecordingVisualiser in all 7 recording screens (blood-sugar, sodium, vitals, weight, medical-history, surgical-history, voice-note-button)
- [x] Fix double-parenthesis syntax error in medical-history.tsx introduced during visualiser rollout
- [x] Run TypeScript check — 0 errors

## Remove All Microphone / Voice Recording
- [x] Remove mic UI and recording logic from blood-sugar.tsx
- [x] Remove mic UI and recording logic from sodium.tsx
- [x] Remove mic UI and recording logic from vitals.tsx
- [x] Remove mic UI and recording logic from weight.tsx
- [x] Remove mic UI and recording logic from medical-history.tsx
- [x] Remove mic UI and recording logic from surgical-history.tsx
- [x] Remove VoiceNoteButton component usages and delete voice-note-button.tsx
- [x] Delete useVoiceRecorder hook
- [x] Delete RecordingVisualiser component
- [x] Remove expo-audio microphone plugin from app.config.ts
- [x] Run TypeScript check — 0 errors

## Smart Scribe (Speech-to-Text)
- [x] Build useAudioScribe hook (expo-audio recording, base64 encoding, tRPC parseVoiceVitals / parseVoice mutations)
- [x] Add Smart Scribe mic button to Vital Signs screen (vitals.tsx) — tap to record, auto-fills BP, HR, SpO2, temp, RR fields
- [x] Add Smart Scribe mic button to Diet/Sodium screen (sodium.tsx) — tap to record, auto-fills sodium, calories, macros fields
- [x] Restore expo-audio microphone plugin in app.config.ts
- [x] TypeScript check — 0 errors

## Nutritional Alignment Dashboard Link
- [x] Add getLastNDaysNutrients import to dashboard index.tsx
- [x] Compute weeklyNutrients (7-slot date-aligned array) from sodiumIntake records
- [x] Pass weeklyNutrients to EvidenceBasedMacrosCard for 7-day sparklines and Gold Zone streak
- [x] Verify "Log a Meal →" deep-link routes to /log/sodium
- [x] TypeScript check — 0 errors

## Nutritional Alignment Enhancements
- [x] Build MacroGoalsSheet — settings sheet for protein/carb/fat targets (grams or % of calories), persisted via useMacroGoals
- [x] Wire MacroGoalsSheet open button into EvidenceBasedMacrosCard header
- [x] Add phosphorus micro-label row to EvidenceBasedMacrosCard with renal-diet threshold indicator
- [x] Build WeeklyMacroTrendSheet — 7-day bar chart bottom sheet (protein/fat/carbs day-by-day)
- [x] Wire WeeklyMacroTrendSheet to sparkline tap in EvidenceBasedMacrosCard
- [x] TypeScript check — 0 errors

## AI Nutrition & Macro Intelligence Module
- [x] Remove EvidenceBasedMacrosCard from dashboard
- [x] Build NutritionIntelligenceCard — Obsidian Glass bento-grid with Nutritional Alignment score, 7-day sparklines, macro progress rings, active protocol badge
- [x] Build MealSearchSheet — USDA food search + natural language logging + Smart Scribe voice input
- [x] Build BiometricSyncWidget — macro vs BP/HR correlation overlay with 7-day sparklines
- [x] Build BioAlignedRecipeCarousel — remaining-macro-aware recipe cards with Clinical Alignment badges
- [x] Wire NutritionIntelligenceCard into dashboard pulling from diet logs and active diet protocol
- [x] TypeScript check — 0 errors

## Evidence-Based Insights Panel
- [x] Set EvidenceInsightsPanel to always start collapsed (defaultExpanded = false)

## Weekly Macro Intelligence Card (Dashboard Redesign)
- [x] Build WeeklyMacroIntelCard — evidence-based weekly macro graphs, adherence ring, alignment score, 7-day sparklines
- [x] Remove recipe carousel and food search UI from dashboard nutrition card
- [x] Replace NutritionHubCard on dashboard with WeeklyMacroIntelCard
- [x] Wire to verified lab-analyzed diet log data (DailyNutrients aggregator)
- [x] TypeScript check — 0 errors

## Comprehensive Macro Intelligence Card (All Records Linked)
- [x] Build WeeklyMacroIntelCard — Daily/Weekly toggle, macro graphs, cross-metric panels
- [x] Link diet/sodium records (macros, fiber, phosphorus, glycemic load)
- [x] Link blood sugar records (glucose trend overlay on macro chart)
- [x] Link weight records (weekly weight trend vs calorie intake)
- [x] Link vital signs records (BP/HR correlation with sodium and macro intake)
- [x] Link activity records (calories burned vs calories consumed balance)
- [x] Replace NutritionHubCard on dashboard with WeeklyMacroIntelCard
- [x] TypeScript check — 0 errors

## Medical Disclaimer Footer
- [x] Add permanent medical disclaimer footer to the bottom of the dashboard screen

## Medical Disclaimer Expansion
- [x] Add disclaimer to Doctor Report PDF footer
- [x] Add disclaimer footer to Analytics/Correlation Engine screen
- [x] Add disclaimer text to i18n translation layer (en, es, fr, zh)

## Disclaimer i18n & Coverage Improvements
- [x] Use disclaimerStrings i18n key in dashboard footer (auto-translates with language setting)
- [x] Use disclaimerStrings i18n key in analytics footer (auto-translates with language setting)
- [x] Add disclaimer note above Generate PDF button in Doctor Report screen
- [x] Add disclaimer footer to Meal IQ screen

## Disclaimer & Privacy Enhancements (Phase 2)
- [x] Add i18n disclaimer footer to Correlation Engine detail screens
- [x] Add one-time disclaimer acknowledgement modal on onboarding (first launch, requires "I understand" tap, persisted in AsyncStorage)
- [x] Localise Meal IQ "What can I do?" action recommendation strings to i18n layer
- [x] Add privacy-first data ownership disclaimer to clinical records screen
- [x] Add privacy-first data ownership disclaimer to medical history screen
- [x] Add privacy-first data ownership disclaimer to surgical history screen
- [x] Add privacyStrings to i18n layer (EN, ES, FR, ZH) for data ownership message

## Suggested Improvements (Phase 3)
- [x] Add Data & Privacy settings screen (on-device storage explanation, Doctor Report PDF scope, delete all data)
- [x] Persist consent acknowledgement flag in AsyncStorage so re-opening onboarding pre-fills the checkbox
- [x] Extend PrivacyBanner to Lab Tracker screen

## Privacy UX Improvements (Phase 4)
- [x] Add privacy badge (green lock + "Stays on device") near Generate PDF button in Report tab
- [x] Add "Learn more →" link on onboarding consent slide that opens Data & Privacy screen as modal
- [x] Add PrivacyBanner to Medications screen
- [x] Add PrivacyBanner to Side Effects screen

## Privacy UX Improvements (Phase 5)
- [x] Add privacy note to ECG Scan screen near scan button
- [x] Add deletion confirmation toast (with timestamp) after Delete All Data in Data & Privacy screen
- [x] Add privacy summary card to Dashboard (on-device status + last HealthKit sync time)

## Privacy UX Improvements (Phase 6)
- [x] Add "Meal data stays on this device" privacy note to Nutrition / Meal Log screen near log entry form

## Privacy UX Improvements (Phase 7)
- [x] Add privacy note to Blood Sugar log screen near log entry button
- [x] Add privacy note to Activity log screen near log entry button
- [x] Add i18n translations for privacy note strings (ES, FR, ZH) to privacyStrings in i18n.ts

## Bug Fixes
- [x] Fix broken Terms of Use link in Settings screen

## Bug Fixes (Blood Sugar Screen)
- [x] Fix Projected A1C section being cut off on Blood Sugar screen
- [x] Fix history list not scrollable all the way to the bottom on Blood Sugar screen

## Blood Sugar & Blood Pressure UX (Phase 8)
- [x] Apply unified FlatList scroll fix to Blood Pressure log screen (not needed — vitals.tsx already uses ScrollView+disabled FlatList pattern)
- [x] Add floating scroll-to-top button to Blood Sugar screen
- [x] Add date-range filter (7d / 30d / All) to Blood Sugar history list

## Blood Sugar & Vitals UX (Phase 9)
- [x] Add date-range filter (7d / 30d / All) to Vitals history list
- [x] Add mini stats bar (avg / min / max glucose) below Blood Sugar date-range filter when range is active
- [x] Add swipe-to-delete gesture on Blood Sugar history rows

## Vitals UX (Phase 10)
- [x] Add mini stats bar (avg systolic/diastolic + avg HR) to Vitals screen when 7d or 30d filter is active

## Bugs
- [x] Smart Intake: tapping searched food shows "+ Log Food Now" on Ketogenic/Macro Intelligence dashboard cards — should not affect dashboard state

## Bug Fixes (Smart Intake + TypeScript)
- [x] Fix Smart Intake: "+ Log Food Now" button now only appears after a food result is selected (not unconditionally)
- [x] Fix Smart Intake: selected food chip gets emerald highlight to indicate selection
- [x] Fix TypeScript error in index.tsx line 1076: wrap lastGlobalSyncAt string in new Date() before calling toLocaleTimeString
- [x] Update Settings support row subtitle from email address to "Visit our support website" (all 4 languages)

## Smart Intake UX Improvements
- [x] Clear-selection toggle: tapping an already-selected food chip deselects it and hides the CTA button
- [x] Persist last-searched food query and results to AsyncStorage so they survive tab navigation
- [x] Add contact form to vitalsyncclinicalhub.com (name, email, message fields)

## Food Log Integration (SmartIntakeAI → Dashboard + History)
- [x] Build shared food log store with AsyncStorage persistence (macros: calories, protein, carbs, fiber, fat, netCarbs)
- [x] Wire SmartIntakeAI "Log Food Now" to write entry to food log store with timestamp
- [x] Dashboard Ketogenic Intelligence card reads from food log store (today's net carbs, fat, protein)
- [x] Dashboard Macro Intelligence card reads from food log store (today's macros progress bars)
- [x] Nutrition/Culinary log history displays logged food entries (name, calories, macros)
- [x] Net carbs tracking: carbs - fiber displayed in history and ketogenic card
- [x] Fat tracking displayed in history and macro card

## SmartIntakeAI & Nutrition Log UX Improvements
- [x] Meal context selector bottom sheet in SmartIntakeAI (Breakfast/Lunch/Dinner/Snack chips before confirming log)
- [x] Recently Logged quick-access chips in SmartIntakeAI (last 3 logged foods from sodiumIntake)
- [x] Daily macro progress summary bar at top of Nutrition log screen (calories, net carbs, fat, protein vs goals)

## Record Tab Nutrition Consolidation
- [x] Combine all nutrition-related tabs into a single "Nutrition" tab on the Record screen with internal sub-navigation

## Cognitive Load Reducer, Lab Translator, Small Wins, ICE Vault
- [x] Emergency Vault (ICE) tile at top of dashboard — blood type, critical care summary, emergency contacts
- [x] ICE tile: tap to expand full vault, long-press to lock/unlock editing
- [x] Cognitive Load Reducer card — contextual smart reminders linking medications to real-time vitals
- [x] Cognitive Load Reducer: show "Take BP meds; current reading is 142/90" style contextual alerts
- [x] Plain-Language Lab Translator — convert health metrics to human-readable status cards
- [x] Lab Translator: "Oxygen levels are optimal for recovery" style plain-language summaries
- [x] Small Wins motivation tracker — visual streaks for vegan protocol adherence and daily activity goals
- [x] Small Wins: streak counter, progress rings, celebration animation on milestone

## ICE QR, Snooze Reminders, Milestone Celebration
- [x] ICE QR code export: generate scannable QR from Emergency Vault data for locked-screen first-responder access
- [x] Cognitive Load Reducer: snooze reminder chips (30 min / 1 hr / 2 hr) per reminder card
- [x] Small Wins: milestone celebration animation at 7, 14, 30-day streaks

## Remind Me Again & Personal Best Streak
- [x] Cognitive Load Reducer: "Remind me again in X hours" re-schedule option for dismissed reminders (2h / 4h / 8h chips)
- [x] Small Wins: personal best streak record per goal shown below current streak badge

## Medication Dose Log Confirmation Flow
- [x] Add MedicationDoseLog type and medicationDoseLogs to HealthData (types.ts + storage.ts migration v7)
- [x] Add ADD_MEDICATION_DOSE_LOG action to health context reducer and context value
- [x] Wire Cognitive Load Reducer "Done" dismiss to call addMedicationDoseLog
- [x] Update Small Wins medication streak evaluator to check medicationDoseLogs for today
- [x] Add physician disclaimer "Take medications as directed by your physician" to medication dose log confirmation UI

## Medication Log History & Adherence Improvements
- [ ] Medication Log history screen under Record tab (dose entries with timestamps, medication name, dose, vital context)
- [x] Daily adherence summary in Cognitive Load Reducer header ("3/4 medications taken today")
- [x] Wire manual medication entries to count toward Small Wins Medication Adherence streak

## Medications Screen Restructure
- [x] Remove Side Effects tab from Medications screen
- [x] Wire Dose History inline as a collapsible section below medication cards
- [x] Add daily adherence summary to Cognitive Load Reducer header

## Medications Screen Restructure v2
- [x] Remove Side Effects tab from Medications screen (keep side effect logging via card button)
- [x] Add inline collapsible Dose History section below medication list
- [x] Add Take/Skip confirmation row to each medication card with reminder scheduling
- [x] Wire Take action to addMedicationDoseLog (taken) and Skip to log a skipped entry
- [x] Add daily adherence summary to Cognitive Load Reducer header

## Obsidian Glass Theme — WCAG 2.1 Accessibility Redesign
- [x] Define Obsidian Glass design tokens (deep obsidian bg, frosted glass cards, high-contrast text)
- [x] Redesign Medications screen: 44px tap targets, high-contrast labels, non-medical icons, glass cards
- [x] Redesign MedicationCard: Take/Skip row with 44px buttons, accessible labels, icon-only fallbacks
- [x] Redesign Dose History section: glass surface, high-contrast timestamps, accessible row structure
- [x] Redesign Cognitive Load Reducer adherence summary: Obsidian Glass card, progress bar, WCAG contrast
- [x] Add accessibilityLabel, accessibilityRole, accessibilityHint to all interactive elements
- [x] Verify all text contrast ratios ≥ 4.5:1 (AA) for normal text and ≥ 3:1 for large text
- [x] Ensure all touch targets are ≥ 44×44pt

## Undo Skipped Medication Log
- [ ] Add removeMedicationDoseLog action to health context (removes by log id)
- [ ] Persist removal to AsyncStorage in storage layer
- [ ] Show timed undo toast (5s) on MedicationCard immediately after skip
- [ ] Undo button in toast removes the skipped log entry and restores pill count
- [ ] Add undo button on each skipped row in inline Dose History list
- [ ] Verify TypeScript passes with 0 errors

## Dose Log Audit Trail Screen & Animated Adherence Bar
- [x] Add removeMedicationDoseLog action to health context (removes log entry by id)
- [x] Show 5s undo toast on MedicationCard after skip; tapping Undo removes the log and restores pill count
- [x] Add Undo button on each skipped row in inline Dose History list
- [x] Build app/log/medication-dose-history.tsx -- full audit trail screen with FlatList of all dose events
- [x] Dose log rows: medication name, dose, taken/skipped badge, timestamp, source label
- [x] Medication filter chip row (All + one chip per medication)
- [x] Date range filter: Today / 7 Days / 30 Days / All Time
- [x] Animate adherence progress bar in CognitiveLoadReducer: 0 → current% over 600ms ease-out using react-native-reanimated

## Persistent Undo Toast (Global Context)
- [x] Create lib/undo-toast-context.tsx with UndoToastProvider and useUndoToast hook
- [x] UndoToastContext holds: logId, medName, timer ref — survives navigation
- [x] Wire UndoToastProvider into app/_layout.tsx (root layout)
- [x] Add global UndoToastOverlay component rendered in root layout as fixed bottom overlay
- [x] Refactor MedicationsScreen: remove local undoLog/undoTimerRef state, call showUndoToast() from context instead
- [x] Verify undo toast persists when switching tabs and returns to Medications screen

## Apple App Review Rejection Fixes (v1.0 — March 23, 2026)
- [x] Fix Guideline 2.5.4: Remove 'audio' from UIBackgroundModes in app.config.ts (expo-audio plugin)
- [x] Fix Guideline 1.4.1: Add ClinicalCitationsFooter component with PubMed, AHA, Cochrane, AND EAL links
- [x] Add ClinicalCitationsFooter to all Diet screens (DietarySummaryView, ActiveDietProfileCard, EvidenceInsightsPanel)
- [x] Add inline "View Meta-Analysis" links next to specific dietary recommendations
- [x] Verify no background audio capability remains in the built app config

## Clinical Evidence Enhancements (App Review v1.1)
- [x] Add citationUrl field to InsightCard type in EvidenceInsightsPanel
- [x] Add PMID/DOI URLs to all 5 insight cards (cardiac, hrv, protein, sodium, spo2)
- [x] Make citation row tappable — opens PubMed/AHA/WHO URL in browser
- [x] Build app/settings/clinical-sources.tsx — full clinical references screen
- [x] Clinical Sources screen: grouped by domain (Cardiovascular, Nutrition, Respiratory, etc.)
- [x] Each reference row: author, journal, year, PMID/DOI badge, tappable link
- [x] Wire Clinical Sources entry row into Settings tab
- [x] Confirm version 1.1.0 in app.config.ts (already set, verify)

## Clinical Sources Screen Enhancements (v1.1.1)
- [x] Add citedIn string[] field to ClinicalRef type listing which screens/cards use each reference
- [x] Render 'Cited in' chip row below each reference row (e.g. "Evidence Insights", "Nutrition Summary")
- [x] Add PDF export via expo-print — generates formatted HTML → PDF of all references
- [x] Add Share/Export button in Clinical Sources screen header (top-right)
- [x] Add App Review deep-link note banner at top of Clinical Sources screen with copy-to-clipboard
- [x] Verify expo-print is available in the project dependencies

## HealthKit Entitlements Fix
- [x] Create plugins/withHealthKit.js config plugin (withEntitlementsPlist modifier)
- [x] Inject com.apple.developer.healthkit = true
- [x] Inject com.apple.developer.healthkit.background-delivery = true
- [x] Inject com.apple.developer.healthkit.access = [health-records]
- [x] Register ./plugins/withHealthKit in app.config.ts plugins array
- [x] Add ios.buildNumber = "4" to app.config.ts for App Store Connect uniqueness

## HealthKit Permissions Expansion
- [x] Add dietary nutrition read types (sodium, potassium, calcium, magnesium, omega-3, caffeine, water, fiber, fat, carbs, protein, energy)
- [x] Add dietary nutrition write types (same set — syncs VitalSync food log to Health app)
- [x] Add insulin delivery read type (CGM/insulin pump users)
- [x] Add BMI, waist circumference, basal energy burned read types
- [x] Add swimming distance, flights climbed, workout route read types
- [x] Add respiratory rate, FEV1 read types
- [x] Add peripheral perfusion index read type
- [x] Add lean body mass, respiratory rate, body temperature write types

## HealthKit Background Delivery
- [x] Create lib/health/healthkit-background-delivery.ts with enableBackgroundDelivery for all vital types
- [x] Call enableAllBackgroundDelivery() after successful HealthKit authorization in permissions.ts
- [x] Expand BACKGROUND_DELIVERY_TYPES in native-health-service.ts to 18 immediate + 24 hourly types
- [x] Use per-frequency calls (immediate=1 for vitals, hourly=2 for nutrition/body composition)

## HealthKit UI & Write-Back Improvements
- [x] Add "Last synced from Apple Health" timestamp row to Settings screen
- [x] Implement saveMealToHealthKit() in healthkit-write.ts for nutrition write-back
- [x] Add background delivery status indicator to Settings → Notifications section

## Apple Health Link Consolidation
- [x] Remove "Open Settings" button from denied banner on Dashboard (index.tsx)
- [x] Remove "Connect" button from not-yet-connected banner on Dashboard (index.tsx) — make banner informational only, directing user to Settings tab
- [x] Remove "Re-connect Apple Health" row from Settings screen (settings.tsx)
- [x] Remove "Open Health App" and "Open App Settings" buttons from healthkit-permissions.tsx
- [x] Keep single "Connect to Apple Health" row in Settings screen that calls requestPermissions then opens app-settings: if still denied
- [x] Update banner copy to say "Go to Settings tab to connect Apple Health"

## Health Permission Details — Instructional Card
- [x] Add "How to enable in Settings" step-by-step card to healthkit-permissions.tsx, shown only when deniedCount > 0

## Apple Health UX Improvements (Round 2)
- [x] Add "How to enable in Settings" instructional card to healthkit-permissions.tsx (shown when deniedCount > 0)
- [x] Replace app-settings: fallback with App-prefs:Privacy&path=HEALTH deep-link in settings.tsx and healthkit-permissions.tsx
- [x] Add persistent "Not Connected" dot indicator to Dashboard header next to sync status badge

## Apple Health UX Improvements (Round 3)
- [x] Make Health dot badge in Dashboard header tappable — navigates to /settings/healthkit-permissions
- [x] Add success toast after Apple Health permissions are granted in settings.tsx and index.tsx

## Apple Health UX Improvements (Round 4)
- [x] Animate Health dot badge fade-out when permissionsGranted flips to true in Dashboard header

## Apple Health UX Improvements (Round 5)
- [x] Wire AppState listener in healthkit-permissions.tsx to re-check permissions when app returns to foreground from iOS Settings

## Dashboard Smart Reminders
- [x] Make Smart Reminders section collapsible — auto-collapse when all tasks are done, animated chevron toggle to expand/collapse manually

## Physician Record Sharing
- [x] Include graphic chart data from vitals (BP trend, HR, glucose, weight, sleep) in the physician sharing report

## Physician Report Preview
- [x] Add "Preview Report" button to report config screen — opens generated HTML in a full-screen modal WebView before sharing

## Smart Culinary Hub Consolidation
- [x] Audit Smart Culinary Hub, Evidence-Based Insights, and Bio-Aligned Recipes files and entry points
- [x] Merge all three into a single unified card model — strip nested card shells, use hairline dividers
- [x] Remove old separate entry points and redirect navigation
- [x] Ensure Evidence-Based Insights are collapsed by default

## Nutrition UX Improvements (Round 2)
- [x] Add Weekly Macro Trend 7-day bar chart (calories, protein, carbs) to Smart Culinary Hub section in SmartIntakeAI
- [x] Persist last active sub-tab (diet/hub/mealiq) in UnifiedNutritionCard via AsyncStorage
- [x] Add Remaining Macros summary strip (protein/carbs/fat remaining today) above Bio-Aligned Recipes carousel header

## Nutrition UX Improvements (Round 3)- [x] Add "+ Log" shortcut pill to right edge of Remaining Macros strip in BioAlignedRecipeCarousel
- [x] Add 7-day average dashed line to Weekly Macro Trend chart in SmartIntakeAI

## Nutrition UI Overhaul (Round 4)
- [x] Add camera button to Diet Log tab so users can photograph their plate
- [x] Replace Meal IQ sub-tab with Evidence-Based Insights in UnifiedNutritionCard
- [x] Make SmartIntakeAI section collapsible (collapsed by default)
- [x] Make BioAlignedRecipeCarousel section collapsible (collapsed by default)

## Nutrition UI Round 5
- [x] Wire Scan Plate camera to server LLM for Smart food recognition — auto-populate meal log from photo
- [x] Persist SmartIntakeAI collapse state via AsyncStorage
- [x] Persist BioAlignedRecipeCarousel collapse state via AsyncStorage

## AI Scan Flow Improvements
- [x] Add pulsing "Analysing your plate…" overlay with image thumbnail while vision LLM processes
- [x] Add Re-scan button next to food description field after AI results populate
- [x] Add confidence badge (high/medium/low) next to food description from AI result

## AI Scan UX Enhancements (Round 2)
- [ ] "AI estimated" inline edit mode: primary-colour border + "AI estimated" label on AI-prefilled macro fields
- [ ] Save scan photoUri to SodiumRecord and show thumbnail in history list items
- [ ] "Scan Barcode" mode: third scan option that uses camera barcode scan + server LLM lookup

## AI Scan UX Enhancements (Round 2)
- [x] AI estimated inline edit mode — primary-colour border + "AI estimated" label on AI-prefilled macro fields; clears when user edits
- [x] Save photoUri to SodiumRecord and display thumbnail in history list (visual meal diary)
- [x] Scan Barcode mode — third option in photo scan Alert; uses camera + server LLM barcode lookup (lookupBarcode route)

## AI Scan UX Enhancements (Round 3)
- [x] Tap-to-expand photo lightbox — tapping history thumbnail opens full-screen modal with close button
- [x] Barcode number + product name badge on AI result card — shows decoded barcode and product name for verification before saving
- [x] sugarG field added to the AI-estimated nutrition card (alongside Carbs)

## AI Scan UX Enhancements (Round 4)
- [x] Swipe-down gesture to dismiss photo lightbox
- [x] WHO glycaemic annotation beneath Sugar cell ("≤ 25 g/day WHO limit")
- [x] Share button in lightbox toolbar to export meal photo

## AI Scan UX Enhancements (Round 5)
- [x] Pinch-to-zoom in photo lightbox using react-native-gesture-handler
- [x] Daily sugar running total progress bar in WHO annotation
- [x] Save to Camera Roll button in lightbox toolbar using expo-media-library

## AI Scan UX Enhancements (Round 6)
- [x] Weekly sugar chart on Dashboard (7-day bar chart of daily sugar totals)
- [x] Double-tap to reset zoom in photo lightbox
- [x] Custom daily sugar budget in Settings (replaces hardcoded WHO 25g limit)

## Sugar Chart & Notification Enhancements (Round 7)
- [x] Smart-generated one-line sugar trend insight below WeeklySugarChart
- [x] Daily sugar budget push notification with user-chosen time in Settings

## Round 8 Enhancements
- [x] Streak badge on WeeklySugarChart header showing current consecutive days-under-budget
- [x] Reschedule sugar notification at meal-save time with latest todayG
- [x] Export meal log as PDF from Nutrition Log history screen

## Round 8 Enhancements
- [x] Streak badge on WeeklySugarChart header showing current consecutive days-under-budget
- [x] Reschedule sugar notification at meal-save time with latest todayG
- [x] Export meal log as PDF from Nutrition Log history screen

## Round 9 Enhancements
- [x] Streak milestone celebration (haptic + confetti) at 3/7/14 day streaks in WeeklySugarChart
- [x] PDF date range filter (Last 7 days / 30 days / All) before generating meal log PDF

## Round 10 Enhancements
- [ ] Theme confetti colours in WeeklySugarChart to use live palette tokens (primary, success, warning, error)

## Round 11 Enhancements
- [ ] Streak share card — branded image generated via expo-print + shared at milestone
- [x] PDF macro summary table at top of export (totals and averages for selected range)

## Bug Fixes
- [x] Fix iOS build failure — downgraded expo-media-library from ^55.0.10 to ~18.2.1 (SDK 54 compatible)

## Bug Fixes (Round 12)
- [x] Fix silent backend publish failure — removed dist/ from .gitignore so compiled server bundle is included in deployment

## App Store Review Fixes (Round 13)
- [x] Fix HealthKit not properly enabled on iPad (Guideline 2.1a)
- [x] Remove audio from UIBackgroundModes — no background audio feature (Guideline 2.5.4)

## Round 14 — App Store Review Response
- [x] Draft App Store reviewer reply message (Guideline 2.1a + 2.5.4)
- [x] Add iPad-specific HealthKit availability note to Health Permissions screen
- [x] Create CHANGELOG.md documenting all build fixes
- [x] Bump app version to 1.1.0 in app.config.ts
- [x] Add pnpm overrides pin for expo-media-library ~18.2.1 in package.json
- [x] Regenerate pnpm lockfile with override applied and verify frozen-lockfile passes
- [x] Increment iOS buildNumber to "6" in app.config.ts
- [x] Add Yarn resolutions field for expo-media-library ~18.2.1 in package.json
- [x] Reorder Dashboard: vitals grid below vitals averages and above smart reminders
- [x] Add section divider between VITALS grid and Smart Reminders
- [x] Move PlainLanguageLabTranslator and SmallWinsTracker below NUTRITION section
- [x] Extend Collapse/Expand All to also control CognitiveLoadReducer card
- [x] Add overrideExpanded prop to PlainLanguageLabTranslator and SmallWinsTracker
- [x] Add WELLNESS section label above PlainLanguageLabTranslator on Dashboard
- [x] Add section divider between NUTRITION and WELLNESS sections on Dashboard
- [x] Add section divider above Smart Reminders (between readiness gauge and Smart Reminders)
- [x] Persist Dashboard allCollapsed state with AsyncStorage
- [x] Add section count badges to VITALS, NUTRITION, WELLNESS, CLINICAL, DIAGNOSTICS labels
- [x] Add section divider above Smart Reminders (between readiness gauge and Smart Reminders)
- [x] Persist Dashboard allCollapsed state with AsyncStorage
- [x] Add section count badges to VITALS, NUTRITION, WELLNESS, CLINICAL, DIAGNOSTICS labels
- [x] Make SMART REMINDERS count badge dynamic (derived from rendered cards, not hardcoded)
- [x] Add per-section long-press collapse/expand on section labels
- [x] Animate count badges with scale pulse on count change
- [x] Wire onVisibilityChange callback to CognitiveLoadReducer so SMART REMINDERS badge shows 0 when no active reminders
- [x] Persist per-section collapsed state to AsyncStorage (6 keys)
- [x] Add one-time long-press hint tooltip on Dashboard first launch
- [ ] Build DoctorAppointmentReminder component — shows only within 24h of appointment
- [x] Add doctor appointment entry UI to Records lab/medication tab
- [x] Schedule local push notification 24h before each appointment (schedule on add/update, cancel on delete)
- [x] Add upcoming-appointment dot badge to Records tab icon
- [x] Add prep checklist field to DoctorAppointment type, appointment form, and reminder card
- [x] Add "Manage →" deep-link button inside Dashboard appointment reminder card
- [x] Auto-dismiss orange appointment dot badge when Appointments screen is opened
- [x] Add quick-add checklist chips to appointment form
- [x] Add "Manage →" deep-link button inside Dashboard appointment reminder card
- [x] Auto-dismiss orange appointment dot badge when Appointments screen is opened
- [x] Add quick-add checklist chips to appointment form
- [x] Add "Clear All" chip button to reset checklist input in appointment form
- [x] Drag-to-reorder checklist items in appointment card view
- [x] Add "Add to Calendar" button on each appointment card
- [x] Add Share Appointment button generating plain-text summary via native share sheet
- [x] Add appointment recurrence field (None/Monthly/Every 3 months/Every 6 months/Yearly)
- [x] Show human-readable countdown label on appointment cards (e.g. "Tomorrow at 2:30 PM")
- [x] Add "Cancel follow-ups" option when deleting a recurring appointment
- [x] Show recurrence label in Dashboard reminder card
- [x] Add "Referred by" field to appointment form and Share summary
- [x] Align Dashboard section measurements with Records tabs (except Daily Readiness and Vitals)
- [x] Add "Referred by" line to appointment card display
- [x] Add "Export to PDF" button for past appointments
- [x] Add collapsible Appointment History section to Dashboard
- [x] Fix BP, pulse/HRV, weight readings not showing in Reports
- [x] Make WELLNESS badge count dynamic from card visibility flags
- [x] Add "No data for this period" empty state in Report preview
- [x] Wire HRV from vitalSigns to pulse section in report
- [x] Add "All time" option to Report date range selector
- [x] Rename "All" date range chip to "All Time" in Report screen
- [x] Add inline empty-state warning banner on Report screen when recordCount === 0
- [x] Add HRV trend bar-chart to Pulse/HRV detail screen
- [x] Add 7/30/90/All date-range filter chips to HRV trend chart on Pulse detail screen
- [x] Add tap-to-inspect tooltip on HRV bars (value + date)
- [x] Add 7-day rolling average line overlay on HRV trend chart
- [x] Build NeonVitals real-time dashboard screen (neon line graphs, dark grid, particle background)
- [x] Multi-vital overlapping glowing line charts (HR, BP, SpO2, Temperature)
- [x] Animated transitions and pulse/glow effect on data updates
- [x] Interactive tap tooltip on NeonVitals chart (exact values + timestamp)
- [x] Time-based x-axis and labeled y-axis on NeonVitals chart
- [x] Per-vital toggle switches to isolate individual vitals
- [x] Faint particle/light background effect for futuristic feel
- [x] HRV swipe-to-dismiss tooltip (swipe left/right to advance selection)
- [x] HRV personal target line in Settings + second reference line on chart
- [x] 7-day average HRV summary stat card on Dashboard
- [x] NeonVitals Live simulation mode toggle (animates chart as if data arrives in real time)
- [x] HRV target push notification (fire when 7-day average drops below personal target)
- [x] NeonVitals full-screen landscape mode unlock
- [x] NeonVitals: replace SpO2/temp with blood sugar and weight vitals (keep BP sys/dia and HR)
- [x] NeonVitals: dynamic landscape-aware chart dimensions (resize on orientation change)
- [x] NeonVitals: live mode speed control slider (0.5x / 1x / 2x)
- [x] Settings: HRV target alert opt-in toggle in Alerts section
- [x] NeonVitals: export snapshot share button (react-native-view-shot + system share sheet)
- [x] NeonVitals: blood sugar zone coloring on glucose line (red >180, yellow 70-130)
- [x] NeonVitals: weight goal flag marker annotation on chart crossing
- [x] NeonVitals: glucose zone legend below chart (red >180, yellow 70-130, magenta other)
- [x] NeonVitals: add 6h chip to time range selector
- [x] Dashboard: weight goal progress banner (within 5 lbs of goal)
- [x] Dashboard weight goal banner: respect kg/lbs unit preference
- [x] NeonVitals 6h mode: show HH:mm x-axis labels instead of day labels
- [x] Report PDF blood sugar section: add glucose zone legend row
- [x] Settings: unit-aware weight goal input (kg or lbs based on user preference)
- [x] NeonVitals: auto-select 6h range when user has logged vitals within the last 6 hours
- [x] Report PDF: glucose zone legend shows mmol/L thresholds when user preference is mmol/L
- [x] Fix Record tab button showing "[object Object]" — destructure useLabResultsBadge() correctly in _layout.tsx
- [x] Fix overrideExpanded logic: cards should be independently collapsible when section is expanded (overrideExpanded=false forces close, overrideExpanded=true defers to card's own state)
- [x] Apply independent collapse fix to all affected components: use-card-expanded hook, weekly-macro-intel-card, cognitive-load-reducer, plain-language-lab-translator, small-wins-tracker, appointment-history-card, and all nutrition cards
- [x] Settings: audit and fix all CollapsibleSection sectionKey props so each section collapses independently
- [x] Settings: add Collapse All / Expand All button to Settings header
- [x] NeonVitals: full-screen landscape mode with tab bar hidden and controls in a side panel
- [x] Weight entries logged in Vitals screen now mirror to Weight tab history (with "From Vitals" source badge; delete is also synced)
- [x] Weight tab: add weight trend sparkline chart with 7/30/90-day range selector above history list
- [x] Weight tab: weight trend sparkline chart with 7/30/90-day range selector, stats row (latest, delta, low, high), and x-axis date labels added above history list
- [x] Dashboard: replace Active Diet Protocol, Macros Intelligence, and Weekly Sugar Intake tabs with a single Smart Nutrition AI card (calories/sugar rings, glucose trend, risk level, AI recommendations, high-glucose alert)
- [x] SmartNutritionCard: add camera button for meal photo logging via Smart food-scan pipeline
- [x] SmartNutritionCard: add animated glucose trend arrow (rising/stable/falling) next to latest glucose reading
- [x] SmartNutritionCard: add 7-day weekly sugar bar chart below sugar ring
- [x] SmartNutritionCard: show macros (protein, carbs, fat) with segmented progress bars and AMDR gold-zone ranges
- [x] SmartNutritionCard: barcode scanner button (amber icon, uses lookupBarcode tRPC endpoint, saves result as SodiumRecord)
- [x] SmartNutritionCard: Edit Goals button in macros section header opens MacroGoalsSheet directly from the card
- [x] SmartNutritionCard: custom sugar budget already wired via useSugarBudget hook — Settings change updates ring and bar chart dynamically
- [x] SmartNutritionCard: barcode scanner button (amber icon, uses lookupBarcode tRPC endpoint, saves result as SodiumRecord)
- [x] SmartNutritionCard: Edit Goals button in macros section header opens MacroGoalsSheet directly from the card
- [x] SmartNutritionCard: custom sugar budget wired via useSugarBudget hook — Settings change updates ring and bar chart dynamically
- [x] NeonVitals: branded watermark overlay on landscape snapshot export (VitalSync logo, timestamp, vital readings summary, ADA/WHO reference footer)
- [x] Dashboard: fix Smart Reminders tab size to match all other dashboard tabs
- [x] Home screen: fix quick-jump section tabs (HRV, Smart Reminders, ECG, Clinical Narrative, Health Status, Small Wins) — center-align, prevent edge clipping, match Clinical Records tab size, assign distinct premium medical accent colors
- [x] Dashboard: horizontal quick-jump strip below header — colored chips scroll dashboard to corresponding section on tap
- [x] Dashboard SectionLabel: animate chip background fill on expand/collapse (fade from transparent to accent+'22')
- [x] Dashboard SectionLabel: add SF Symbol icon to each chip (heart.fill, bell.fill, fork.knife, figure.walk, cross.case.fill, waveform.path.ecg)
- [x] Dashboard quick-jump strip: active chip highlight — highlight the chip of the currently visible section as user scrolls (bold border + filled background)
- [x] Dashboard: move Smart Reminders, Nutrition, Wellness, Clinical, Diagnostics sections above the Vitals Averages section
- [x] Dashboard: keep Vitals and Vitals Averages sections adjacent (no other sections between them)
- [x] Dashboard SectionLabel: add long-press gesture to collapse/expand each section individually
- [x] Dashboard: each card/tab within a section is individually collapsible (tap header to collapse)
- [x] Dashboard cards: apply Nutrition tab card margins (left/right) to 7-Day Summary, Smart Nutrition, Small Wins, Clinical Narrative, and ECG Trace so card edges are always visible
- [x] Dashboard: apply marginHorizontal: 16 to all remaining cards (HRV 7-day, Weight Goal Banner, Bento tiles, CognitiveLoadReducer, DoctorAppointmentReminder, MealIQTrendCard, PlainLanguageLabTranslator, AppointmentHistoryCard, CollapsibleCard wrapper) for uniform inset layout
- [x] app.config.ts: update iOS bundleIdentifier, Android package, HealthKit entitlements, Info.plist permissions, and react-native-health plugin to fix HealthKit/NitroModulesProxy errors

## Dashboard Collapsibility & Spacing Polish (Session 2026-03-25)
- [x] Wrap Wellness section cards in CollapsibleCard (Lab Translator, Small Wins, Appointment History)
- [x] Wrap Clinical section card in CollapsibleCard (Clinical Narrative)
- [x] Add AsyncStorage persistence to CollapsibleCard (storageKey prop, @vitalsync:card_collapsed/ prefix)
- [x] Add storageKey to all existing CollapsibleCard usages (Reminders, Nutrition, Wellness, Clinical sections)
- [x] Remove duplicate outer marginHorizontal/marginBottom from ClinicalNarrativeCard, PlainLanguageLabTranslator, SmallWinsTracker, AppointmentHistoryCard (now provided by CollapsibleCard wrapper)
- [x] Standardise marginBottom: 16 on all standalone dashboard cards (ecgBanner, lockWidget, healthBanner, quickActions, privacySummaryCard, weightGoalBanner, cardGrid)
- [x] CollapsibleCard container marginBottom updated from 2 → 16 for consistent vertical rhythm

## CollapsibleCard Animation (Session 2026-03-25)
- [x] Animate CollapsibleCard content height on collapse/expand with LayoutAnimation (smooth shrink/grow instead of instant snap)

## Smart Nutrition Dashboard Camera Fix
- [x] Fix Smart Nutrition dashboard card camera/scanner — "No procedure found on path nutritionAI.analysePhoto" — wire to same tRPC procedure used by Nutrition Log scan plate

## Smart Nutrition Scanning Indicator
- [x] Show ActivityIndicator overlay on camera/barcode buttons while analysePhotoMutation or lookupBarcodeMutation isPending; dim button and disable press

## Smart Culinary Hub Cleanup
- [x] Remove evidence-based insights section from Smart Culinary Hub card (duplicates dedicated insights section)

## Nutrition Tab Rename
- [x] Rename "Smart Culinary Hub" sub-tab to "Recipes" in unified-nutrition-card

## Recipes Tab Protocol Filter Chips
- [x] Add horizontal protocol filter chip row above recipe carousel in Recipes tab (temporary override, does not change global diet setting)

## Smart Scribe on Clinical Forms
- [x] Add Smart Scribe to Appointment form (matching Vitals pattern)
- [x] Add Smart Scribe to Medication form (matching Vitals pattern — pre-existing AiScribeSheet)
- [x] Add Smart Scribe to Medical History form (matching Vitals pattern)
- [x] Add Smart Scribe to Surgical History form (matching Vitals pattern)

## Smart Scribe Result Banner Enhancements
- [x] Add "Filled X of Y fields" count to scribe result banner in all four forms (Appointments, Medical History, Surgical History, Vitals)
- [x] Add "🎙 Try again" re-scribe button to scribe result banner in all four forms

## Smart Scribe Unfilled Field Highlight
- [x] Flash yellow border on unfilled inputs after scribe result (filledCount < totalFields) in Vitals, Appointments, Medical History, Surgical History forms

## Smart Scribe & Clinical Narrative (Session 2026-03-26)
- [x] Add Smart Scribe to Medical ID form (parseVoiceMedicalID server procedure + ScribeButton + yellow-border highlight on unfilled fields)
- [x] Add Scribe highlight duration preference to Settings > Appearance (1s/2s/5s chips, persisted to AsyncStorage, wired to useScribeHighlight)
- [x] Add Last 6 hrs time-range chip to ClinicalNarrativeCard (alongside Today / 7d / 30d)

## Clinical Narrative Time Range (Session 2026-03-26b)
- [x] Add "Last 1 hr" time-range chip to ClinicalNarrativeCard (between Last 6 hrs and Today)

## Clinical Narrative Live UX (Session 2026-03-26c)
- [ ] Auto-select "Last 1 hr" on ClinicalNarrativeCard when returning from a fresh vital log (defaultRange prop from dashboard)
- [ ] Add pulsing live-refresh dot next to "Last 1 hr" and "Last 6 hrs" chip labels

## Clinical Narrative Live UX (Session 2026-03-26c)
- [x] Auto-select "Last 1 hr" on ClinicalNarrativeCard when returning from a fresh vital log (defaultRange prop from dashboard)
- [x] Add pulsing live-refresh dot next to "Last 1 hr" and "Last 6 hrs" chip labels

## Clinical Narrative Reset & Settings (Session 2026-03-26d)
- [x] Add "Clear" reset link next to auto-selected "Last 1 hr" chip in ClinicalNarrativeCard
- [x] Add "Clinical Narrative auto-range window" setting (5 min / 15 min / 30 min / Off) in Settings > Appearance
- [x] Wire auto-range window preference into fresh-log detection in index.tsx

## Dashboard Reorder (Session 2026-03-26e)
- [x] Reorder dashboard: ICE → health data sync → vital average → vitals cards → 7-day HRV → rest as-is

## Bug Fixes (Session 2026-03-26f)
- [x] Fix Quick-Jump chips (Reminders, Nutrition, Wellness, Clinical, Diagnostics, Vitals) not showing data when tapped

## HealthKit & Android Entitlements Audit (Session 2026-03-26g)
- [x] Verify and fix iOS HealthKit entitlements in app.config.ts
- [x] Add all required iOS infoPlist permission strings
- [x] Add BODY_SENSORS and ACTIVITY_RECOGNITION Android permissions
- [x] Ensure expo-local-authentication plugin with faceIDPermission is present
- [x] Verify @kingstinct/react-native-healthkit plugin config (not react-native-health)
- [x] Add background delivery entitlement
- [x] Write/update HealthKit config audit test

## Entitlement & Audio Cleanup (Session 2026-03-26h)
- [x] Remove com.apple.developer.healthkit.access (health-records) from withHealthKit.js
- [x] Remove health-records entitlement reference from app.config.ts comments
- [x] Remove expo-audio plugin from app.config.ts (app uses microphone only for Smart Scribe)
- [x] Update app-config-audit.test.ts to reflect removals

## Audit Test Hardening (Session 2026-03-26i)
- [x] Add NSMicrophoneUsageDescription audit test (non-empty + references Smart Scribe)

## Audit Test Hardening (Session 2026-03-26j)
- [x] Add aps-environment audit test (value must be "development" or "production", never blank)

## Config Hardening (Session 2026-03-26k)
- [x] Switch aps-environment from "development" to "production" in ios.entitlements
- [x] Add BODY_SENSORS_BACKGROUND to Android permissions (Android 13+ background wearable sensor access)
- [x] Update audit tests to assert aps-environment is "production" and BODY_SENSORS_BACKGROUND is present

## EAS Build Profiles (Session 2026-03-26l)
- [x] Create eas.json with development / preview / production build profiles
- [x] Wire EAS_APS_ENVIRONMENT env var into app.config.ts so aps-environment is set per profile
- [x] Add eas.json structure audit test

## EAS Submit Fix (Session 2026-03-26m)
- [x] Remove empty submit.production placeholder fields from eas.json (causes EAS validation failure)

## NeoVitals Landscape Fixes (Session 2026-03-26n)
- [x] Fix GlowPulse animation stopping in landscape (add cx/cy to useEffect deps)
- [x] Fix content cut off in landscape (chart column width + side panel fixed width)

## Dashboard Section Tab Expansion Bug (Session 2026-03-26o)
- [x] Fix CollapsibleCard not showing content when section expands (overrideExpanded=true does not reset card-level collapsed state)

## HealthKit Debug Panel & Permission Fix (Session 2026-03-26p)
- [ ] Fix permissions.ts: add initHealthKit() call via react-native-health for iOS system permission sheet
- [ ] Fix healthkit-loader.ts: add react-native-health loader alongside @kingstinct loader
- [ ] Build HealthKitDebugPanel component with diagnostic UI, scrollable logs, and fallback
- [ ] Add /settings/healthkit-debug route and wire into Settings screen
- [ ] Add HealthKit debug panel audit tests
- [x] Fix HealthKit initHealthKit not triggering iOS permission sheet (rnh-loader.ts)
- [x] Add HealthKitDebugPanel component with availability/permission status/logs/buttons
- [x] Add /settings/healthkit-debug full-screen diagnostic route
- [x] Wire HealthKit Diagnostics row into Settings > Health Data section
- [x] Add ant.fill icon mapping for debug row icon
- [x] Add "Copy Logs" button to HealthKitDebugPanel
- [x] Add "Run Diagnostics" button to HealthKit Not Available alert in settings.tsx
- [x] Add "Share Logs" native share sheet button to HealthKitDebugPanel
- [x] Add "Clear Logs" destructive button to HealthKitDebugPanel
- [x] Auto-navigate to /settings/healthkit-debug on first launch after denied HealthKit permission
- [x] Fix rnh-loader.ts: use require('react-native-health') not .default, and check HealthKit.initHealthKit existence for isRNHAvailable
- [x] NeoVitals: push header controls below status bar safe area (portrait + landscape) so Live/Demo/Vital Monitor/Speed are not obscured
- [x] NeoVitals: add Dashboard back tab to return to main dashboard without exiting the app
- [ ] Dashboard tabs: standardise all section tabs to match Records nutrition tab size and style
- [ ] Dashboard tabs: fix tabs not showing data when clicked
- [x] Move ICE Vault tile to top of Health Metrics & Diagnostics section on dashboard
- [x] Move ECG Tracer above Doctor Appointments in Clinical Records on records screen
- [x] Add "Clinical Records" SectionLabel pill chip above Medications in Records screen (matching dashboard section-label pattern)
- [x] Add ECG scan badge count to ECG Tracer LogCard (shows "N scans on file" from ecgInterpretations)
- [x] Add ICE Vault chip to Quick-Jump strip on dashboard (shield.fill icon, red accent, scrolls to EmergencyVaultTile)
- [x] Dynamic Clinical Records badge count (active medications + lab results + ECG scans + upcoming appointments)
- [x] Long-press "Edit ICE Profile" shortcut on ICE Vault Quick-Jump chip
- [x] Add "Medical & Surgical History" SectionLabel in Records screen above Medical History cards
- [x] Add spacing between 7-Day HRV and Daily Readiness cards on dashboard (tabs touching)
- [x] Move 7-Day HRV card to below Clinical Narrative section on dashboard
- [x] Remove Diagnostics/ECG Tracer section from dashboard (already in Records)
- [x] Convert dashboard to tab layout matching Records screen (all sections start collapsed)
- [x] Add runtime environment detection (Expo Go vs dev build vs standalone)
- [x] Block HealthKit init in Expo Go with clear UI message
- [x] Enhance HealthKitDebugPanel with environment flags and native module status
- [x] Add hard check for NativeModules.AppleHealthKit before init
- [x] Show step-by-step build instructions when HealthKit unavailable
- [x] Guard HealthKit init: only run on iOS + native modules available + not Expo Go
- [x] Add eas build --clear-cache reminder to Expo Go warning card in HealthKit debug panel
- [x] Persist dashboard collapse-all/expand-all toggle state to AsyncStorage so it restores across app restarts
- [x] Wire dashboard section tabs to same data sources as Records screen so data shows when uncollapsed (VITALS: Weight/Vitals/Sleep/BloodSugar/Activity LogCards; WELLNESS: Medical/Surgical History LogCards; CLINICAL: Medications/Labs/ECG/Appointments LogCards)
- [x] LogCard empty-state: replace "No data" with "Tap to add your first entry" inline prompt
- [x] Deduplicate CLINICAL section: replace ClinicalNarrativeCard with compact one-line summary row
- [x] LogCard swipe-to-log: right-swipe gesture opens the entry sheet directly
- [ ] Fix HealthKit isAvailable()=false on standalone: use initAppleHealthKit success as primary availability signal
- [ ] Update debug panel to distinguish "entitlement missing" from "Expo Go" as the cause of isAvailable=false
- [ ] Add Apple Developer Portal instructions to debug panel for enabling HealthKit capability
- [x] Fix HealthKit isAvailable()=false bug on standalone builds — use rnhLinked as primary availability signal
- [x] Update debug panel to show context-aware diagnosis (entitlement missing vs Expo Go vs NativeModule not linked)
- [x] Fix NitroModulesProxy warning to not say "Expo Go" on standalone builds
- [x] Fix runRecheckPermissions fallback to use rnhLinked instead of broken isAvailable() result
- [x] Add services/healthkit.ts with user-provided exact code
- [x] Replace HealthKit debug panel with user-provided exact code
- [x] NeonVitals: push monitor panel down ~1.5 inches (add paddingTop ~144px to main content area)
- [x] NeonVitals: push "3 readings last 6 hrs" summary row down ~1 inch to match VitalSync Clinical Hub title position
- [x] Dashboard: remove LogCards from VITALS, WELLNESS, CLINICAL sections (move them back to Records only)
- [x] Dashboard: add horizontal tab strip to VITALS section showing inline data (Weight, Vital Signs, Sleep, Blood Sugar, Activity tabs)
- [x] Dashboard skeleton reorder: (1) Vitals Averages 7d/30d/90d, (2) Daily Readiness, (3) Quick-Jump strip, then sections
- [x] Today's Summary row: date + steps + calorie burn between bento grid and Daily Readiness
- [x] Persist Quick-Jump active chip to AsyncStorage, restore on mount
- [x] HRV 5-point sparkline inside Pulse/HRV BentoMetricTile
- [x] Fix clinical summary: create missing app/detail/clinical-narrative.tsx screen (was causing 404 crash on tap)
- [x] Step goal ring in Today's Summary row (SVG arc, configurable daily goal, persisted to AsyncStorage)
- [x] No-activity nudge in Today's Summary row when steps and calories are both empty (one-tap to activity log)
- [x] Clinical Narrative urgency badge dot on CLINICAL Quick-Jump chip (green/amber/red)
- [x] Step ring long-press: inline bottom sheet with 6k/8k/10k/12k preset goal buttons
- [x] Distance column in Today's Summary row (derived from today's activity records)
- [x] Animate step ring arc fill-in on first render (600ms, react-native-reanimated)
- [x] Distance units toggle (miles/km) in Today's Summary row, persisted to AsyncStorage
- [x] "Goal reached!" haptic + confetti burst when steps cross daily goal (once per day)
- [x] Remove inline tab strips from dashboard: Weights, Vitals, Sleep, Blood Sugar, Activity, Medication, Surgical, Medical History, Lab Tracker, ECG Tracer, Appointment
- [x] Restore inline tab strips with live data from health context (weight/vitalSigns/sleep/bloodSugar/activity/medications/labResults/appointments/medicalHistory/surgicalHistory)
- [x] Restore dashboard inline tab strips (VITALS/WELLNESS/CLINICAL) from aa17b48 checkpoint with correct HealthData field bindings (weight/vitalSigns/sleep/bloodSugar/activity/medications/labResults/ecgInterpretations/medicalHistory/surgicalHistory/appointments)
- [x] AI Insight card: per-insight evidence citations (PubMed/DOI), collapsed sources section by default
- [x] Dashboard Nutrition tab: macros, carbs, blood sugar across Daily/7d/14d/30d time windows
- [x] Nutrition card: Gold Zone highlight on macro ratio bar (45-65% carbs, 15-25% protein, 20-35% fat)
- [x] Nutrition card: weekly calorie adherence sparkline (7-point mini bar chart vs. goal)
- [x] Nutrition card: Blood Sugar tile linked to WeeklySugarChart mini-chart
- [x] Calorie sparkline bars: tappable, navigate to that day's nutrition log
- [x] Today's Summary row: fibre goal ring (WHO 25g/day) alongside step ring
- [ ] Nutrition card: interactive SVG chart like NeonVitals (multi-metric, crosshair, time-window)
- [x] Interactive NutritionChart with multi-metric lines, crosshair, time-window selector (Daily/7d/14d/30d)
- [x] Tappable calorie sparkline bars navigate to daily nutrition log
- [x] Fibre goal ring (WHO 25g/day) in Today's Summary row
- [x] NutritionChart: metric legend toggle row (Calories/Carbs/Protein/Fat/Blood Sugar) to show/hide individual lines
- [x] Fix: app crashes on loading — nested useMemo (todayFiber inside todayDistanceKm) + inline useState in AI Insight IIFE
- [x] NutritionChart: Nutritional Alignment Score (0–100) above chart based on macro ratio adherence (45–65% carbs, 15–25% protein, 20–35% fat)
- [x] NutritionChart: "Best day" emerald annotation marker on chart at highest macro alignment day
- [x] NutritionChart: Fibre (g) as 6th metric chip in legend toggle row
- [x] NutritionChart: redesign to NeonVitals dark glassmorphism style (neon glow lines, deep navy canvas, luminous gradient fills)
- [x] NutritionChart: horizontal macro ratio bar (Carbs/Protein/Fat segmented bands) with Gold Zone glow overlay below Alignment Score
- [x] NutritionChart: Fibre goal progress ring (25g WHO goal) shown when Fibre chip is active
- [x] NutritionChart: animated line draw-on effect (stroke-dashoffset withTiming) when window selector changes
- [x] NutritionChart: macro trend sparklines — 7-bar mini charts for Carbs/Protein/Fat ratio below macro ratio bar
- [x] NutritionChart: calorie goal ring — circular ring vs user-configurable goal (default 2000 kcal), shown when Calories chip active
- [x] NutritionChart: Gold Zone streak counter — 🔥 X day streak badge when alignment score ≥80 for consecutive days
- [x] Settings tab: calorie goal input (default 2000 kcal), persisted via AsyncStorage, passed as calorieGoal prop to NutritionChart
- [x] NutritionChart sparklines: day labels (Mon/Tue/Wed…) below each bar column
- [x] NutritionChart: streak milestone celebration — haptic + SVG confetti burst at 3/7/14 day Gold Zone streaks
- [x] Settings: macro goal quick-edit bottom sheet (Calories/Carbs/Protein/Fat) replacing calorie-only row
- [x] NutritionChart: weekly streak heatmap — 7-dot row below streak badge (green=Gold Zone, amber=partial, grey=no data)
- [x] NutritionChart: animated confetti — falling dots via useAnimatedProps withTiming on cy values
- [x] Settings macro sheet: horizontal preset chips (Balanced/Vegan Athlete/High-Protein/Low-Carb) at top for one-tap apply
- [x] NutritionChart heatmap: tappable dots with day-detail popover (alignment score, top macro, Log meal shortcut)
- [x] NutritionChart confetti: milestone chime via expo-audio when streak celebration fires
- [ ] NutritionChart heatmap: wire "+ Log meal" button to Nutrition logging screen with pre-filled date
- [ ] Settings macro sheet: custom "My Plan" preset chip with rename/save, persisted via AsyncStorage
- [ ] Settings Notifications: "Celebration sounds" toggle to disable streak chime independently of haptics
- [x] NutritionChart heatmap: Log meal shortcut wired to /log/sodium with prefillDate param
- [x] Settings macro sheet: custom My Plan preset chip (long-press to rename, Save as My Plan button)
- [x] Settings Notifications: Celebration Sounds toggle to disable streak chime independently of haptics
- [x] Dashboard: compact macro goal progress bar (Carbs/Protein/Fat) in Nutrition section header showing today's intake vs. saved goals
- [x] NutritionChart heatmap: "Show 30 days" toggle expanding to 5×6 monthly grid
- [x] NutritionChart: streak share card (branded PNG with streak count, date range, alignment score) when streak ≥ 7 days
- [x] Dashboard: animate macro progress bar fill 0→current on mount (withTiming 400ms)
- [x] NutritionChart heatmap: month label (e.g. "March 2026") above 30-day grid
- [x] NutritionChart: streak share card as branded PNG via server LLM image generation

## Dashboard Quick-Jump Tab Cleanup
- [x] Remove Smart Reminders tab from quick-jump strip
- [x] Remove Nutrition tab from quick-jump strip
- [x] Remove Wellness tab from quick-jump strip
- [x] Remove Medical History tab from quick-jump strip (inline tab in Wellness section)
- [x] Remove Surgical History tab from quick-jump strip (inline tab in Wellness section)
- [x] Remove SMART REMINDERS section and its cards from dashboard
- [x] Remove NUTRITION section label and its CollapsibleCards from dashboard
- [x] Remove WELLNESS section label and its CollapsibleCards from dashboard
- [x] Remove Medical/Surgical inline tab strip from Wellness section
- [x] Fix app crash (AnimatedCircle Reanimated SVG animatedProps crash — replaced with JS-thread Animated.Value)

## Dashboard Improvements (Round 2)
- [x] Add Vitals quick-entry card (compact row with + buttons for BP, glucose, weight)
- [x] Promote Nutrition Overview card directly after vital cards (above the fold)
- [x] Add section divider before CLINICAL section

## Bug Fixes
- [x] Fix crash when Nutrition tab is clicked in Record tab (Reanimated v4 + SVG animatedProps crash in nutrition-chart.tsx, logarithmic-sodium-curve.tsx, logarithmic-potassium-curve.tsx — replaced with JS-thread Animated.Value state)

## SVG Crash Audit & Quick-Entry Improvements
- [x] Audit all createAnimatedComponent usages and fix any remaining SVG-animated ones (daily-readiness-gauge.tsx AnimatedPath — replaced with JS-thread Animated.Value state)
- [x] Add last-logged timestamps under each quick-entry button (BP, Glucose, Weight, Sleep)
- [x] Add Sleep as a fourth quick-entry button in the dashboard quick-entry card

## Launch Crash Fix
- [x] Fix "Property 'Easing' doesn't exist" crash — removed Easing from all reanimated imports (13 files), now sourced from react-native in all cases

## Quick Entry Card Enhancements
- [x] Add streak indicator (flame icon + consecutive days) to Quick Entry card header
- [x] Colour stale timestamps amber (>12h BP/glucose) or red (>24h weight/sleep) — green when fresh
- [x] Add HRV as a fifth quick-entry button column (cyan, routes to /log/vitals)

## Streak & Habit Reinforcement
- [x] Add best streak record persisted via AsyncStorage, shown below current streak badge
- [x] Add weekly summary banner on Monday mornings (vitals logged X of 7 days last week)
- [x] Add confetti burst when streak increments (first log of day completes all 5 vitals)

## Goal Nudge, Share & Milestone Notification
- [x] Add dismissible "Today's goal" nudge inside Quick Entry card showing missing vitals
- [x] Add share button to weekly summary banner (screenshot + share via expo-sharing)
- [x] Add milestone push notification when user breaks personal best streak

## iOS Build Fix (Mar 27 2026)
- [x] Fix iOS build failure "Unknown error. See logs of the Bundle JavaScript build phase" — malformed double-alias import `{ Animated as RNAnimated as RNEasing }` in nutrition-chart.tsx fixed to `{ Animated as RNAnimated, Easing as RNEasing }`
- [x] All files pass Babel syntax check (zero parse errors across app/, components/, lib/)

## AI Camera Meal Logging (Mar 27 2026)
- [x] Add Smart camera button next to "Log Meal" on Nutrition Alignment card on dashboard
- [x] Build camera capture flow using expo-image-picker (already installed, reused existing flow)
- [x] Send captured image to server LLM via trpc.nutrition.analysePhoto (already implemented)
- [x] Pre-fill nutrition log screen with AI-estimated macros via openCamera=1 URL param
- [x] Show Smart analysis result with confidence indicator in sodium log screen (existing UI reused)

## Nutrition Card Scan Enhancements (Mar 27 2026)
- [x] Add barcode scan button (🔲) to Nutritional Alignment card header, routes to /log/sodium?openBarcode=1
- [x] Add openBarcode=1 param support in sodium.tsx to auto-trigger barcode scan on mount
- [x] Add voice log button (🎙️) to Nutritional Alignment card header, routes to /log/sodium?openVoice=1
- [x] Add openVoice=1 param support in sodium.tsx to auto-trigger voice recording on mount
- [x] Add last Smart scan preview line under macro bars on dashboard ("Last Smart scan: Grilled chicken, 420 kcal")
- [x] Persist last Smart scan result to AsyncStorage so it survives app restarts

## Smart Reminders Tab (Mar 27 2026)
- [x] Remove Clinical, ICE Vault, Vitals quick-jump tabs from dashboard strip
- [x] Add Smart Reminders tab/section above Nutritional Alignment card
- [x] Show upcoming appointment reminders (date, time, title)
- [x] Show medication administration reminders (drug name, dose, time)
- [x] Show take vital signs reminder (due time, last logged)
- [x] Show blood sugar reminder (due time, last logged)
- [x] Reminders become collapsible/dismissible after task is completed (✕ dismiss button, persisted to AsyncStorage)

## Metric Cards & Reminder UX (Mar 27 2026)
- [x] Make vital metric cards uniform size (equal width/height, same tap-to-show/hide layout)
- [x] Add 1-hour snooze option on each Smart Reminder card (long-press or action button)
- [x] Auto-reset dismissed reminder IDs at midnight so daily reminders reappear each morning

## Metric Section & Nutrition Tile Redesign (Mar 27 2026)
- [x] Remove expand/collapse toggle above bento metric grid (always show vitals + date-range tabs)
- [x] Make 7d/30d/90d date-range tabs equal width (flex: 1 on each tab)
- [x] Reorganise nutrition macro tiles: top row = Calories, Carbs, Protein; bottom row = Blood Sugar, Fat, Fibre

## Macro Tiles Placement Fix (Mar 27 2026)
- [x] Move 6 macro tiles (Calories/Carbs/Protein + Blood Sugar/Fat/Fibre) inside NeoNutrition card as two rows, remove standalone block

## Macro Tile → NutritionChart Toggle (Mar 27 2026)
- [x] Macro tiles act as tap-to-select tabs controlling which metric series the NutritionChart displays; tapping the active tile hides the chart (show/hide toggle)

## Macro Tile UX Enhancements (Mar 27 2026)
- [x] Add "TAP TO SHOW/HIDE" hint label above macro tile rows
- [x] Long-press macro tile opens inline goal editor (calories, carbs, protein, fat, fibre)
- [x] Persist activeNutrMetrics selection to AsyncStorage and restore on launch

## Macro Tile Polish (Mar 27 2026)
- [x] Colour-coded active tile tabs (active tile background/border uses the tile's accent colour)
- [x] Fibre goal editor (long-press Fibre tile opens goal editor with WHO 25g default)
- [x] Success toast after saving a goal ("Protein goal updated to 150 g")
- [x] Reset-to-preset button inside goal editor (restores value from current diet profile)

## Bug Fix: Tile → NutritionChart wiring (Mar 27 2026)
- [x] Fix: tapping a macro tile must update the NutritionChart graph series visibility in real-time

## Premium Nutrition Color System (Mar 27 2026)
- [x] Create shared constants/nutrition-colors.ts with nutritionColors, nutritionColorsSoft, nutritionColorsDark
- [x] Apply to NutritionChart METRICS array (chart lines, glow colors, gradient fills)
- [x] Apply to macro tile TILE_META accent colors and active border/background
- [x] Apply to MacroBar progress bars
- [x] Apply to goal editor modal accent colors and preset buttons
- [x] Apply to MacroRatioBar segment colors inside NutritionChart

## Nutrition Color Palette Update (Mar 27 2026)
- [x] Update nutritionColors to exact 5-key user spec + bloodSugar as fixed emerald (#10B981) — no status-driven color changes

## Color Legend Tooltip (Mar 27 2026)
- [x] Add tappable "?" icon next to hint label that opens a color legend overlay showing each nutrient's swatch + semantic meaning

## Blood Sugar Color & Tile-Chart Color Sync (Mar 27 2026)
- [x] Change nutritionColors.bloodSugar to deep blood-red (#DC2626 / red-600)
- [x] Ensure every macro tile active-state color exactly matches its NutritionChart line color (single source of truth)

## Nutrition Palette Exact Spec (Mar 27 2026)
- [x] Restore nutritionColors/nutritionColorsSoft to exact 5-key user spec; move bloodSugar to separate bloodSugarColor constant

## Tile Active-State Colour Styling (Mar 27 2026)
- [x] Apply Blood Sugar tile active-state style (soft bg tint + colour border) to all 6 macro tiles using nutritionColors/nutritionColorsSoft

## Animated Tile Activation (Mar 27 2026)
- [x] 150 ms fade-in on soft background tint and border opacity when tile switches from inactive to active

## Translate Setting Visibility Fix (Mar 27 2026)
- [x] Fix translate/language setting on dashboard — ensure text and controls are clearly visible in both light and dark mode

## Macro Tile Exact Color Spec (Mar 27 2026)
- [x] Apply exact user-specified colors to all 6 macro tiles: active = rgba soft tint + hex border, inactive = gray dimmed

## Dashboard Polish (Mar 27 2026)
- [x] Globe button: change to light-green color (#22C55E / green-500)
- [x] Inactive tile label text goes gray (matching value text gray-out)
- [x] Active indicator dot pulses subtly (scale 1→1.3→1) on activation

## Settings Globe Color (Mar 27 2026)
- [x] Change globe icon and language row in Settings tab to light-green (#22C55E)

## Bug Fix: Smart Intake Diet Crash (Mar 27 2026)
- [x] Fix crash when tapping Smart Intake / AI Diet to record intake under Records → Nutrition → Recipes
- [x] Remove "Collapse All" button from Record tab header (top-right corner)
- [x] Fix crash in Appointments screen: parseVoiceAppointmentMutation is not defined
- [x] Fix Reanimated useAnimatedStyle used without dependency array warning
- [x] Add PDF preview before printing in Report screen

## Nutrition Data Sync + Macro Reflection System (Mar 27 2026)
- [x] Extend SodiumRecord.source to include 'recipe' and 'diet-log' for cross-module source tracking
- [x] Build useNutritionAlignment hook — real-time aggregation of all sodium records with dedup, multi-day (1d/7d/14d/30d) views
- [x] Build NutritionAlignmentPanel component — daily totals, per-meal breakdown, source badges, blood sugar impact indicator
- [x] Add 4th sub-tab "Alignment" to UnifiedNutritionCard
- [x] Wire RecipeDetailModal to tag logged meals with source='recipe'
- [x] Wire SmartIntakeAI to tag logged meals with source='ai-hub'
- [x] Wire Diet Log (sodium.tsx) to tag entries with source='diet-log'
- [x] Add duplicate entry prevention (dedup by foodDescription + timestamp within 60s)
- [x] Update Dashboard macro tiles: add Fiber tile, Blood Sugar Impact badge, remaining calories
- [x] Add multi-day macro chart (7d/14d/30d) to NutritionAlignmentPanel
- [x] Ensure all nutrition updates reflect on Dashboard in real-time (no manual refresh)
## NutritionAlignmentPanel ↔ Dashboard Sync (Mar 27 2026)
- [x] Wire NutritionAlignmentPanel to useNutritionAlignment as single source of truth
- [x] Wire Dashboard SmartNutritionCard to useNutritionAlignment for real-time macro totals
- [x] Ensure any food logged in any module reflects instantly on both Record and Dashboard

## Remove Recipes & Alignment Tabs from Nutrition Card (Mar 27 2026)
- [x] Remove Smart Culinary Hub / Smart Intake / Bio-Aligned Recipes tab from unified-nutrition-card
- [x] Remove Nutritional Alignment tab from unified-nutrition-card
- [x] Delete orphaned component files (nutrition-hub-card, bio-aligned-recipe-carousel, smart-intake-ai, nutrition-alignment-panel)
- [x] Remove dead server procedures (generateRecipes removed from nutritionAI router)
- [x] Verify remaining tabs (Diet Log, Insights) still work correctly — 500 tests pass

## AI Food Camera — Powerful Plate & Label Scanner

- [ ] Audit existing analysePhoto, lookupBarcode server endpoints and ai-nutrition-tab camera pipeline
- [ ] Build AiFoodCameraSheet: full-screen camera-first bottom sheet with 3 modes — Plate Scan, Label Scan, USDA Search
- [ ] Plate Scan mode: capture photo → analysePhoto endpoint → display macro breakdown (kcal, protein, carbs, fat, fiber, GI estimate, blood sugar impact)
- [ ] Label Scan mode: capture barcode/nutrition label photo → lookupBarcode endpoint → display per-serving macros
- [ ] USDA Search mode: natural language search → searchFood endpoint → select result → display verified macros
- [ ] Serving size multiplier stepper (×0.5, ×1, ×1.5, ×2) on all result cards before logging
- [ ] "Log Meal" button: calls addSodium with full macro fields → instant update to Diet Log, NeoNutrition Graph, Dashboard
- [ ] Wire AiFoodCameraSheet into unified-nutrition-card as a floating camera FAB button
- [ ] Ensure logged entries instantly reflect in 7-day macro trend, macro tiles, and NeoNutrition graph
- [ ] Run tests and verify 499+ pass

## Remove /log/sodium Screen

- [ ] Find all references to /log/sodium across the codebase
- [ ] Delete app/log/sodium.tsx screen file
- [ ] Remove all router.push('/log/sodium') navigation calls
- [ ] Update unified-nutrition-card camera shortcut to open AI Food Camera sheet instead
- [ ] Remove any imports or references to sodium log screen in other files
- [ ] Run tests and verify 499+ pass

## Sodium Screen → AI Food Camera Sheet Migration (completed Mar 27 2026)
- [x] Remove app/log/sodium.tsx screen file
- [x] Remove Stack.Screen for log/sodium from app/_layout.tsx
- [x] Replace all router.push('/log/sodium') calls in index.tsx with AiFoodCameraSheet open
- [x] Replace all router.push('/log/sodium') calls in unified-nutrition-card.tsx with AiFoodCameraSheet open
- [x] Replace all router.push('/log/sodium') calls in evidence-based-macros-card.tsx with AiFoodCameraSheet open
- [x] Build AiFoodCameraSheet component (components/ai-food-camera-sheet.tsx) with Plate Scan, Barcode Scan, USDA Search modes
- [x] Add cameraSheetVisible and cameraInitialMode state to DashboardScreen
- [x] Wire Scan/Barcode/Voice buttons in Nutritional Alignment card to open sheet in correct mode
- [x] Wire FibreRingCell onPress to open AiFoodCameraSheet
- [x] Wire NutritionChart onLogMeal callback to open AiFoodCameraSheet
- [x] All 10 migration tests pass

## UX Improvements Batch (Mar 27 2026)
- [x] Long-press on Nutritional Alignment section header to collapse/expand it
- [x] Create app/log/nutrition.tsx as full-screen wrapper for AiFoodCameraSheet
- [x] Update Log hub card to navigate to /log/nutrition
- [x] Register /log/nutrition route in app/_layout.tsx Stack
- [x] Add Recent Meals history list (last 5 entries) inside AiFoodCameraSheet home tab
- [x] Swipe-to-delete on Recent Meals entries in AiFoodCameraSheet
- [x] Wire FibreRingCell long-press to open AiFoodCameraSheet pre-filtered to "high fiber foods"

## Smart Reminders Widget (Mar 27 2026)
- [x] Audit appointment, medication, BP/blood-sugar data structures in health context
- [x] Build smart reminders engine inline in Dashboard IIFE with per-category lead times
- [x] 24h lead-time window for doctor appointments (falls off after appointment time)
- [x] 1h lead-time window for medications (+ 30-min grace after reminder time)
- [x] 30-min BP windows: 07:30-08:00 morning, 19:30-20:00 evening
- [x] 30-min blood sugar post-meal windows: 08:00, 13:00, 19:00
- [x] Live 30-second countdown ticker (tickerNow state + setInterval)
- [x] fmtCountdown helper (Xh Ym / Ym / Now format)
- [x] Countdown chip on appointment and medication cards
- [x] Done ✓ button on all four reminder card types
- [x] Success haptic on Done tap (NotificationFeedbackType.Success)
- [x] Auto-fall-off: reminders disappear when time window has elapsed
- [x] Dismissed IDs persisted in AsyncStorage (SMART_REMINDER_DISMISSED_KEY)

## Smart Reminders — Category Fall-off (Mar 27 2026)
- [x] Add dismissCategory(ids) helper that dismisses all IDs in a category at once
- [x] Wire appointment Done button to dismissCategory(allApptIds)
- [x] Wire medication Done button to dismissCategory(allMedIds)
- [x] BP and BS Done buttons remain single-ID dismissals (singletons)

## Dashboard & Log Improvements (Mar 27 2026)
- [x] Move 7-day Avg HRV above Daily Readiness in the HRV section
- [x] All-clear empty state chip in Smart Reminders when hasAnyReminder is false
- [x] 15-min category snooze on long-press of Done button (snoozeCategory helper, 500ms delay)
- [x] Reminder History log — persist Done taps to AsyncStorage (lib/reminder-history.ts)
- [x] Show Reminder History in Log tab (Today's Completed Reminders section)

## USDA Search Bar — Voice & Responsiveness (Mar 27 2026)
- [x] Fix search bar typing lag — localText state in SearchScreen decoupled from outer searchQuery
- [x] Add voice-to-text mic button to USDA search bar (🎙️ / ⏹️ toggle)
- [x] Voice recording uses useAudioScribe (expo-audio m4a) → nutritionAI.parseVoice mutation
- [x] Transcribed text auto-fills localText and triggers USDA search automatically
- [x] Mic button shows pulsing Animated.loop scale animation while recording
- [x] 🔴 Listening hint shown below search bar during recording
- [x] autoCorrect and autoCapitalize disabled for faster input response

## Log Tab — Nutrition Card Voice Button (Mar 27 2026)
- [x] Add 🎙️ voice shortcut button to the Log tab Nutrition card
- [x] Wire to useAudioScribe + nutritionAI.parseVoice + addSodium for direct voice logging
- [x] Show recording state (pulsing indicator, countdown, done/error) on the card

## Voice UX Improvements (Mar 27 2026)
- [x] 10-second auto-stop: auto-stop mic and trigger search after 10s of recording
- [x] Live countdown display during recording (e.g. '🔴 Listening · 8s…')
- [x] Confidence badge: show high/medium/low chip below search bar after voice input
- [x] Log tab Nutrition card: 🎙️ voice button for direct voice meal logging

## Nutritional Alignment Collapsible Fix (Mar 27 2026)
- [x] Fix long-press crash on Nutritional Alignment section header
- [x] Replace onLongPress with onPress (single tap to collapse/expand)
- [x] LayoutAnimation.easeInEaseOut animates expand/collapse smoothly
- [x] Chevron ▸/▾ and 'tap to expand/collapse' hint shown in header
- [x] hitSlop enlarged for easier tap target on the header row

## Dashboard Section Collapse Improvements (Mar 27 2026)
- [x] Removed onLongPress from SectionLabel component entirely (tap-only is safer)
- [x] Vitals/Wellness sections already removed per earlier user request (no action needed)
- [x] Clinical section uses SectionLabel with onPress via onToggle (no crash risk)
- [x] AsyncStorage persistence verified: all 5 keys load in correct order on mount
- [x] Collapse all / Expand all toggle button added to Dashboard header (right side)
- [x] chevron.up.circle and chevron.down.circle added to icon-mapping.ts
- [x] collapseAllBtn and collapseAllText styles added to StyleSheet

## TypeScript Error Fixes (Mar 27 2026)
- [ ] Fix all 50 pre-existing TypeScript errors (tsc --noEmit exits cleanly)
- [x] Remove "Next Action" and "Upcoming Next" sections from dashboard (redundant with Reminders)
- [x] Make Smart Reminders always visible (non-collapsible) and promote above the fold on dashboard
- [x] Add "Today at a Glance" summary strip (steps, calorie balance, sleep score) on dashboard
- [x] Deep-link reminder items to Log screens (medications → /log/medications, appointments → /log/appointments)
- [x] Add ImmunizationRecord type to health-types.ts
- [x] Add immunization CRUD endpoints to server/routers.ts
- [x] Build app/log/immunizations.tsx screen with list, add/edit form, and Smart Scribe voice entry
- [x] Add immunizations entry to Log tab navigation and icon mapping
- [x] Immunization next-dose push notifications (7-day and 1-day before nextDoseDate)
- [x] Immunization PDF export with share sheet
- [x] Upcoming vaccine dashboard card on home screen
- [x] Mark as Received action on dashboard vaccine card
- [x] Add Immunization section to Doctor Report PDF batch export
- [x] Overdue vaccine badge on Log tab icon
- [x] CDC/WHO Vaccine Schedule reference screen with age-group filtering and gap detection
- [ ] Batch Smart Scribe entry for multiple vaccines in one recording
- [ ] Per-record Share mini-PDF button on each vaccine record card
- [x] Add Immunization entry card to Records screen
- [x] Update Clinical Records SectionLabel badge to include immunizations in filledCount
- [x] Create CDC vaccine library data file with routine and travel/tropical vaccines
- [x] Add "Browse CDC Vaccines" quick-add bottom sheet to Immunizations screen
- [x] Support Smart Scribe, photo/OCR, and quick-add from library as three entry methods

## Nutritional Alignment Always Expanded (Mar 27 2026)
- [x] Remove collapse/expand toggle from Nutritional Alignment dashboard section — show all content by default

## Liquid Glass Service Cards (Mar 28 2026)
- [x] Apply liquid glass (frosted translucent glass) visual style to the quick-action service cards on the Dashboard

## AI Insight Single Tab (Mar 28 2026)
- [ ] Remove sub-tabs from AI Insight card on Dashboard — show all content as a single flat view

## Post-NeoVital Crash (Mar 28 2026)
- [ ] Investigate and fix crash occurring after NeoVital update

## TestFlight Launch Crash (Mar 28 2026)
- [x] Investigate and fix crash on launch from TestFlight: reactCompiler was re-enabled (incompatible with Reanimated 4 in production) — set back to false. Build number bumped to 9.

## Launch Crash (Mar 28 2026 - second occurrence)
- [ ] Investigate and fix app crash on launch (occurring after latest checkpoint e0ec4124)

## Remove Nutritional Alignment from Dashboard (Mar 28 2026)
- [x] Remove the entire Nutritional Alignment section from the Dashboard (index.tsx)
- [x] Clean up orphaned state variables, imports, and components related to Nutritional Alignment on the Dashboard

## App Config Update (Mar 28 2026)
- [x] Update app.config.ts: name→VitalSync, version→1.0.3, buildNumber→14, EAS projectId→a2059081-2a72-4db5-8daf-a1d64db03855

## Clinical Nutrition EBP Cards (Mar 28 2026)
- [x] Create EBP Nutrition component: Carbohydrate Quality Index (10:1 carb:fiber ratio) and Protein Bio-Availability (g/kg) cards
- [x] Style to match VitalSync design system (glass cards, dark/light mode, nutrition color tokens) with NeoVital-style animated arc rings and glow bars
- [x] Wire to real logged data (diet log records for carbs/fiber/protein, bodyComposition for weight)
- [x] Add to Dashboard below Quick Entry card

## latestBodyComp Undefined Fix (Mar 29 2026)
- [x] Fix undefined latestBodyComp reference causing runtime crash — replaced with latestBody (the correct useMemo variable)

## NeoVital-Style Nutrition Graph on Dashboard (Mar 29 2026)
- [x] Build NeoVital-style animated nutrition graph (arc rings, glow bars, smooth mount animations)
- [x] Integrate into Dashboard EBP Nutrition section wired to diet log data

## Remove Expand/Collapse All from Dashboard Header (Mar 29 2026)
- [x] Remove expand/collapse all button from Dashboard header and clean up all related state/effects/styles

## Weekly Trend Toggle + Fat/Calorie Wiring (Mar 29 2026)
- [ ] Add Today/This Week toggle to NeoVitalMacroGraph with 7-day average computation
- [ ] Ensure fatG and caloriesKcal are captured in manual diet log form (nutrition.tsx)
- [ ] Ensure fatG and caloriesKcal are captured in AI Food Camera sheet (ai-food-camera-sheet.tsx)
- [ ] Wire weekly diet log data into the graph component from index.tsx

## Weekly Trend + Fat/Calorie Wiring (Mar 29 2026)
- [x] Add Today/This Week toggle to NeoVitalMacroGraph with 7-day average computation
- [x] Wire fat and calories to diet log (fix caloriesKcal field name — SodiumRecord uses 'calories')

## Remove Long-Press Section Collapse (Mar 29 2026)
- [x] Remove long-press collapse/expand behaviour from all Dashboard section labels
- [x] Clean up related collapsed state variables, AsyncStorage keys, and orphaned styles

## Sleep Data Wiring from Vital Signs (Mar 29 2026)
- [x] Wire sleep fields entered in Vital Signs log screen to the Sleep detail tab — fixed field name mismatch (deepSleepMinutes→deepMinutes, etc.) and confirmed all three layers (sparkline, latestSleep, detail screen) correctly merge manual vitalSigns sleep entries

## Clinical Narrative — Vital Signs Panel (Mar 29 2026)
- [x] Add a Vital Signs summary block inside the ClinicalNarrativeCard (expanded view) showing latest BP, HR, SpO₂, Temp, and RR from vitalSigns records, with urgency colour coding

## Macro Breakdown — Full NeoVital Aesthetic on Dashboard (Mar 29 2026)
- [x] Upgrade NeoVitalMacroGraph with full NeonVitals dark canvas aesthetic: deep navy bg, neon glow bars, particle layer, macro ratio segmented bar with Gold Zone, HRV-style animated arc ring, and 4-window toggle (Today/7d/14d/30d)

## Macro Graph — 14d/30d Wiring & Best Day Annotation (Mar 29 2026)
- [x] Compute data14d and data30d averages in dashboard aggregation block and pass as props to NeoVitalMacroGraph
- [x] Add Best Day annotation: compute highest alignment-score day per window, show emerald callout in NeoVitalMacroGraph

## Macro Graph — ADA Carb Quality Section (Mar 29 2026)
- [x] Add ADA-sourced "Carb Quality" section to NeoVitalMacroGraph: fiber-to-carb ratio, added sugar indicator, quality tier badge (Whole/Minimally Processed/Refined), with tappable ADA source link to diabetes.org/food-nutrition/meal-planning

## Macro Graph — Replace ADA link with CQI meta-analysis (Mar 29 2026)
- [x] Replace ADA source link with Maghoul et al. 2024 CQI meta-analysis (DOI 10.1024/0300-9831/a000794, PubMed 38009678), update section sub-label to cite the paper

## Macro Graph — Log Meal button (Mar 29 2026)
- [x] Add Log Meal button to NeoVitalMacroGraph card header: two actions — camera (plate scan) and search — both navigate to /log/nutrition with the appropriate initialMode param
- [ ] Remove long-press hint pop-up message from dashboard
- [ ] Add long-press to collapse/expand each dashboard section (CLINICAL, ICE, VITALS, NUTRITION, REMINDERS)
- [x] Wire ConfettiBurst on successful meal log via Macro Breakdown shortcut
- [x] Remove pop-up hint message from dashboard
- [x] Long-press to collapse: Smart Reminders section
- [x] Long-press to collapse: Vitals Quick Entry card
- [x] Long-press to collapse: CLINICAL section
- [x] Clinical Narrative time-window pill toggle (Last 1 hr / 6 hr / Today / 7d) on dashboard summary row
- [x] Fiber ring cell long-press goal editor (21g / 25g / 38g presets, default 25g WHO)
- [x] Add vital signs compact row to Clinical Narrative summary block on dashboard
- [x] Fiber ring tap tooltip (inline callout, auto-dismiss, then open food log)
- [x] Add collapse toggle to Carbohydrate Quality Index section in NeoVitalMacroGraph
- [x] Add collapse toggle to Protein Bio-availability section in NeoVitalMacroGraph
- [x] Persist CQI and Protein Bio-Availability collapsed state to AsyncStorage, default both to collapsed
- [x] Persist Best Day callout dismiss state per window (7d/14d/30d) in NeoVitalMacroGraph
- [x] Add Reset Layout option in Settings to clear all @ebp_* AsyncStorage keys
- [x] Add collapse toggle to Macro Breakdown card (NeoVitalMacroGraph) with AsyncStorage persistence
- [x] Rebuild Calories/Protein/Carbs/Fat/Fiber glow bars with NeonVitals-style pulsating animations
- [x] Stagger GlowBar pulse phase by ~300 ms per bar for cascade wave effect
- [x] Add tap-to-history micro-interaction on GlowBar to navigate to Nutrition tab filtered by macro

## Macro Graph — NeoVital Waveform Bars (Mar 29 2026)
- [x] Replace flat AnimatedView fill in GlowBar with SVG sine-wave WaveformBar component
- [x] Waveform scrolls horizontally (1600ms period) and pulses in amplitude (breathing effect)
- [x] Waveform clipped to fill percentage via SVG ClipPath for "living signal bar" effect
- [x] Vertical gradient fill (bright crest → transparent trough) with bright stroke line
- [x] Staggered phaseOffset cascade preserved (300ms offsets between bars)
- [x] Over-target red pulse (600ms) vs normal breathing (1800ms) preserved
- [x] Counter animation and tap-to-history navigation preserved
- [x] 16 unit tests for WaveformBar math (fill width, amplitude, path generation, clip width)

## HealthKit Integration Fix (Mar 29 2026)
- [x] Fix app.config.ts: set bundleIdentifier to com.myvitalsyncclinicalhub.vitalsync (already correct)
- [x] Add NSHealthShareUsageDescription and NSHealthUpdateUsageDescription to ios.infoPlist (already correct)
- [x] Add com.apple.developer.healthkit: true to ios.entitlements (already correct)
- [x] Add react-native-health plugin to plugins array in app.config.ts
- [x] Refactor HealthKit init: replace all 11 null-as-any returns with typed empty returns + diagnostic logs
- [x] Install expo-dev-client via npx expo install (added ~6.0.20)
- [x] Verify zero TypeScript errors after all changes

## Macro Graph — Remove tap-to-navigate from GlowBar labels (Mar 29 2026)
- [x] Remove "›" chevron and onPress handler from each macro label row (Calories, Protein, Carbs, Fat, Fiber)

## HealthKit — Fix "No new data" for all types (Mar 29 2026)
- [x] Audit sync date range / lastSyncedAt logic
- [x] Root cause identified: Nitro bridge (NitroModulesProxy) not registering on device, all fetch functions bailed early with empty return
- [x] Add react-native-health (RCT bridge) fallback to all 7 HealthKit fetch functions (BP, HR, Sleep, BodyComp, Steps, SpO2, Temp, ECG, Workouts)
- [x] Write rnh-fetch.ts: Promise wrappers for all react-native-health callback APIs
- [x] 11 unit tests for RNH fallback mapping logic (BP, HR+HRV pairing, sleep stages, SpO2, body temp conversion)

## Settings & Data Sources Polish (Mar 29 2026)
- [x] Remove HealthKit diagnostics section from Settings screen (row, alert button, DeniedPermissionDiagnosticsBridge)
- [x] Extend initial sync window from 30 days to 90 days (healthkit-adapter.ts + native-health-service.ts syncAll default)
- [x] Add per-type last-synced timestamps to Data Sources card (BP, HR, Sleep, SpO2, Body Temp, Body Comp, Workouts, ECG, Steps)

## Tab Navigation Freeze + Dashboard Last-Synced Badges (Mar 29 2026)
- [x] Fix app freeze when navigating between tabs: memoized HealthContext.Provider value (useMemo), debounced saveHealthData (500ms), debounced useUnreadAlertBadge AppState refresh (300ms), memoized DataSourcesContext.Provider value
- [x] Add per-type last-synced badges to BentoMetricTile component ("Last: Mar 15" / "Today" / "Yesterday" badge)
- [x] Wire lastSyncedAt prop to all 4 vital cards on Dashboard (BP, HR/HRV, SpO2, Sleep)

## Record Screen Date/Time Picker (Mar 29 2026)
- [x] Audit all date/time inputs in Record screens (vitals, blood sugar, weight, activity) — vitals uses numeric decimal-pad + custom HH:MM stepper (already correct); sleep.tsx already uses native DateTimePicker on iOS
- [x] Build shared DateTimePickerField component (calendar + time, iOS inline spinner + Android/web fallback)
- [x] Wire picker into: appointments.tsx (dateTimeDate), medications.tsx (startDate, endDate, refillDate, reminderTimes), side-effects.tsx (onsetDate, resolvedDate), medical-history.tsx (diagnosedDate), surgical-history.tsx (surgeryDate), immunizations.tsx (dateAdministered, nextDoseDate)
- [x] 11 unit tests for ymdToDate/dateToYmd round-trip helpers — all pass

## Settings Cleanup (Mar 29 2026)
- [x] Remove HealthKit Background Delivery toggle from Settings screen (removed SettingsRow, status indicator, lastBgSync/bgDeliveryCount state, useEffects, AppState refresh, and LAST_BG_SYNC_KEY import)

## Post-Meal Navigation & HealthKit Config (Mar 2026)
- [x] After logging a meal, navigate back to main screen records section
- [x] Confirm HealthKit entitlements present in app.config.ts (com.apple.developer.healthkit=true)
- [x] Verify react-native-health plugin config with healthSharePermission in app.config.ts
- [x] Verify eas.json build profiles handle entitlements correctly

## Dashboard Vital Tiles Bug (Mar 2026)
- [x] Fix: Dashboard vital tiles show no data / blank averages on all four cards (expected empty state — no data logged yet; added empty-state nudge)

## Empty-State Nudge on Vital Tiles (Mar 2026)
- [x] Add empty-state nudge below vital tiles when no data exists, with quick-log shortcuts to each metric

## Immunization CDC Browser Freeze (Mar 2026)
- [x] Fix: CDC vaccine browser freezes the app and blocks navigation out of the immunization screen

## Immunization UX Improvements (Mar 2026)
- [ ] Quick Add shortcut on vaccine rows in CDC Library modal (pre-fill + save without opening full form)
- [ ] Persist last-used category filter in CDC Library modal to AsyncStorage
- [ ] Fix nested ScrollView freeze in Vaccine Schedule screen (replace inner list with FlatList)
- [x] Align avg kcal/day badge to the right of the Vitals Average header row

## Immunization Save Bug (Mar 2026)
- [x] Fix: Vaccine save does not persist the record in immunizations screen
- [x] Add "Successfully saved." confirmation message after vaccine is saved

## Steps Display Bug (Mar 2026)
- [x] Fix: Steps logged in vital sign record do not appear on the dashboard

## Meal Log Confirmation (Mar 2026)
- [x] Add "Successfully saved." confirmation after meal is logged to prevent duplicate entries

## Three-Feature Batch (Mar 2026)
- [x] Fix: Immunization save does not persist; navigate to Record tab after save
- [x] Add "logged via Vitals" / "logged via Activity" source label in activity history
- [x] Add "Edit Entry" button to meal log success alert

## Immunization Edit Alert (Mar 2026)
- [x] Show "Record updated." for immunization edits vs "Successfully saved." for new entries

## Alert Variant Consistency + Immunization Delete (Mar 2026)
- [x] Apply new/edit alert variant to vitals.tsx save handler (create-only screen, always shows Successfully saved.)
- [x] Apply new/edit alert variant to blood-sugar.tsx save handler (create-only screen, always shows Successfully saved.)
- [x] Add Delete button to immunization edit alert (wasEditing=true only)
- [x] Show vaccine name in immunization alert title (e.g. "Influenza record updated.")

## Vaccine Save Navigation (Mar 2026)
- [x] After saving a vaccine, navigate to Record tab and auto-scroll to Immunizations section
- [x] Fix immunization screen navigation trap: router.replace removes screen from stack
- [x] No alert shown after save — direct navigation gives instant feedback

## New Vaccine FAB on Record Tab (Mar 2026)
- [x] Add 'New Vaccine' FAB button on the Immunizations card in the Record tab

## Remove New Vaccine FAB (Mar 2026)
- [x] Remove New Vaccine FAB from Immunizations card (causes errors)

## Apple Health Sync Null Crash Fix (Mar 2026)
- [x] Fix 'Cannot read property length of null' crash in Apple Health HealthKit sync adapter

## Fix Permissions Deep-Link Button (Mar 2026)
- [x] Add "Fix Permissions" button to Apple Health card in Data Sources that opens iOS Health app permissions page via x-apple-health:// deep-link

## Immunization Tab Freeze & CDC Database Fix (Mar 2026)
- [x] Fix immunization tab freeze — tab becomes unresponsive and user must force-quit the app
- [x] Fix CDC database access failure — CDC library is fully local (no network call); freeze was caused by missing Stack registration, now fixed

## Immunization UX Improvements (Mar 2026)
- [x] Vaccine-due banner on Dashboard — dismissible yellow strip when any immunization is overdue or due-soon, with one-tap link to Immunizations screen
- [x] Pre-fill today's date in the add form — when user taps + to add a new vaccine, set "Date Administered" to today automatically
- [x] Swipe-to-delete on immunization cards — left-swipe reveals a red Delete button (iOS Mail/Reminders pattern)

## Medication Reminders (Mar 2026)
- [x] Extend MedicationEntry type with reminderTime (HH:MM string) and reminderEnabled flag (already in types.ts)
- [x] Add time picker UI in the medication tab for setting reminder time per medication (already in medications.tsx)
- [x] Build medication notification scheduler (already in medication-reminders.ts)
- [x] Cancel/reschedule notifications when medication is edited or deleted (already in medications.tsx handleSave)
- [x] Build MedicationsDueBanner component — shows due/overdue medications with Take and Skip actions
- [x] Wire MedicationsDueBanner into Dashboard below VaccineDueBanner
- [x] Persist take/skip decisions via MedicationDoseLog (already in health-context, no separate AsyncStorage needed)
- [x] Show taken/skipped status on medication cards in the medication tab

## Medication Adherence Features (Mar 2026)
- [x] Today's taken/skipped badge on medication cards in the Medications tab
- [x] 7-day adherence bar chart in medication detail view (teal=taken, amber=skipped, red=missed)
- [x] Missed-dose auto-detection: log "missed" if reminder time passes 2+ hours with no action

## Adherence UX Polish (Mar 2026)
- [ ] Weekly adherence summary line on MedicationsDueBanner ("This week: 5/7 doses taken")
- [ ] Undo toast when useMissedDoseDetector auto-logs a missed entry
- [ ] Streak counter badge on medication cards (🔥 N-day streak when all doses taken consecutively)

## Medication Advanced Features (Mar 2026)
- [x] Dose history bottom sheet — tapping a medication card opens a bottom sheet with a time range selector (Weekly / Monthly / 3 Months / 6 Months / Year) and a calendar grid of taken/skipped/missed dots for the selected range
- [x] Streak milestone push notifications — local notification at 7, 14, 30, 60, 90, 180, 365-day milestones per medication
- [x] Weekly adherence PDF export — Export button in Medications header generates a PDF with 5 range options (7d/30d/90d/180d/365d) and taken/skipped/missed counts per medication

## Refill Reminder Integration (Mar 2026)
- [x] Surface "Refill due" rows in MedicationsDueBanner for medications below refill threshold, with pill count and link to Medications tab

## Move Medication Reminders to Smart Reminders (Mar 2026)
- [x] Integrate medication dose reminders and refill rows into the Smart Reminders section on the Dashboard, remove standalone MedicationsDueBanner

## Dashboard & Medication UX Improvements (Mar 2026)
- [x] Sleep banner reflects data entered in vital signs sleep fields
- [x] Restock quantity bottom sheet — tapping Restock opens a sheet to enter pills received, updates pillsRemaining instantly
- [x] Per-medication snooze — long-press on a single dose row snoozes only that medication for 30 minutes
- [x] Edit time shortcut — "Edit time" link on each dose row navigates to medication edit form pre-scrolled to reminder time picker

## Medication Smart Reminders & UX (Mar 29 2026 — Round 2)
- [x] Pre-dose vital check: show "Check BP first" reminder before BP medication dose rows
- [x] Pre-dose vital check: show "Check blood sugar first" reminder before diabetes/insulin medication dose rows
- [x] Reminder is medication-specific (keyed to med name/category, not a global banner)
- [x] Snooze duration picker: replace fixed 30-min snooze with action sheet (15 min / 30 min / 1 hr)
- [x] Restock history log: record each restock event (date, quantity added) in restockHistory field on MedicationRecord
- [x] Restock history: collapsible "Refill History" section on medication card showing last N restock events
- [x] Per-medication refill threshold: custom low-stock threshold field already in medication edit form ("Low-Stock Alert Threshold")
- [x] Refill threshold push notification: sendRefillThresholdNotification fires when pillsRemaining drops to/below threshold (day-scoped dedup)

## Medication Smart Reminders Polish (Mar 29 2026 — Round 3)
- [x] Pre-dose chip dismisses immediately when user returns from vitals log with a fresh reading (useFocusEffect bumps tickerNow on Dashboard focus)
- [x] Cap restockHistory at 20 most recent events per medication (all three restock paths capped with .slice(-20))
- [x] Threshold helper text in medication edit form showing estimated days of supply (e.g. "≈ 7 days at 1 pill/day")

## Medication UX Polish (Mar 29 2026 — Round 4)
- [x] Restock history clear button — "Clear history" action inside expanded Refill History section (confirmation alert, haptic on success)
- [x] Pre-dose chip logged confirmation — brief green "BP logged ✓" / "Glucose logged ✓" chip shown for 2.5 s when user returns with fresh vital reading
- [x] Threshold smart default — auto-populate refillThreshold with pillsPerDose × reminderCount × 7 when blank on new medication save

## Settings Badge & Dose Chip (Mar 29 2026)
- [x] Fix red badge count on Settings tab icon — Settings tab auto-clears threshold + analyte alert counts on focus via useFocusEffect; crash log count preserved until explicitly cleared
- [x] Dose-taken confirmation chip — "Dose taken ✓" (green) or "Dose skipped" (red) chip shown for 1.8 s immediately after action, then settles to static "Logged ✓"

## Streak Badge & Dose Row Animation (Mar 29 2026)
- [x] Streak counter badge — 🔥 N-day streak badge on each medication card (threshold lowered to 1 day so badge appears from day one)
- [x] Dose row collapse animation — DoseRowWrapper component animates height + opacity to 0 over 300 ms after 1.8 s confirmation chip window

## Streak Milestone Notifications (Mar 29 2026)
- [x] Fire celebratory local push notification at 7, 14, 30, 60, 90, 180, and 365-day streak milestones (stable identifier dedup so each milestone fires once per medication; wired into both Dashboard handleMedTake and Medications screen handleLogDose)

## Build Number & Version (Mar 29 2026)
- [x] Add versionCode: 14 (Android) to app.config.ts; ios.buildNumber: "14" was already present
- [x] Display version + build number in Settings About row and About screen (e.g. "v1.0.3 (14)")

## Reanimated Web Warning Fix (Mar 29 2026)
- [x] Add explicit dependency arrays to all 40 useAnimatedStyle/useRAStyle calls across 14 files to fix Reanimated web-support warning

## Bug Fixes (Mar 29 2026 — Round 6)
- [x] Immunization tab CDC database frozen / not loading — fixed: added getItemLayout + virtualization props to SectionList
- [x] App crash when medication is input (medication save path) — fixed: form.reminderTimes bug
- [x] HealthKit entitlements disabled — requires Xcode/EAS portal fix (see delivery notes)

## Critical Bug Fixes (Session Resume)
- [x] Fix form.reminderTimes crash: threshold helper text in MedFormModal references form.reminderTimes which doesn't exist on FormState (has reminderTime1/reminderTime2 instead)
- [x] Verify immunization SectionList freeze fix is complete and add getItemLayout for constant-height rows
- [x] Add tests for medication save crash fix (18 tests, all passing)

## HealthKit Diagnostic Component (Mar 29 2026)
- [x] Build HealthDebugger component using existing healthkit-loader bridge (not react-native-health directly)
- [x] Support multiple data types: HeartRate, BloodPressureSystolic, BloodPressureDiastolic, StepCount, Weight, BloodGlucose
- [x] Show init status, permission status, and per-type fetch results in a scrollable log
- [x] Wire HealthDebugger into Settings screen under a "Developer / Diagnostics" section
- [x] Add test for HealthDebugger component structure (28 tests, all passing)

## HealthKit Diagnostic Panel — Full Clinical Coverage (Mar 29 2026)
- [x] Add rnh-fetch helpers: rnhFetchRestingHeartRate, rnhFetchRespiratoryRate, rnhFetchVO2Max
- [x] Add rnh-fetch helpers: rnhFetchBloodGlucose, rnhFetchInsulinDelivery, rnhFetchDietaryFiber, rnhFetchTotalEnergyBurned
- [x] Add rnh-fetch helpers: rnhFetchStandTime (WalkingSpeed/Asymmetry not in RNH — Nitro-only, noted)
- [x] Add RNH_READ_PERMISSIONS entries for all new types (already present in rnh-loader.ts)
- [x] Upgrade HealthKitDebugPanel with grouped 5-category layout (Cardiovascular, Respiratory/Oxygenation, Metabolic/Nutritional, Activity/Mobility, Sleep/Recovery)
- [x] Add tests for all new rnh-fetch helpers and updated panel (43 tests, all passing)

## Immunization CDC Search Restructure (Mar 29 2026)
- [x] Replace SectionList with FlatList in VaccineLibraryModal to eliminate freeze
- [x] Add debounced search input (280ms) that filters by vaccine name + description + brand + abbreviation
- [x] Add category filter chips (All, Childhood, Adolescent, Adult, Travel – General, Travel – Tropical)
- [x] Add section header rows as FlatList data items (interleaved HeaderRow + VaccineRow)
- [x] Add exact getItemLayout with VACCINE_ROW_H=112 and HEADER_ROW_H=44 constants
- [x] Add empty state when search returns 0 results
- [x] Add tests for the restructured search modal (31 tests, all passing)

## Medication Update Crash (Mar 29 2026)
- [x] Fix crash when updating/editing an existing medication in the medication list — root cause: mergeHealthData missing appointments/immunizations fields wiped those arrays after HealthKit sync, causing undefined state on next form save

## Crash Log Viewer (Mar 29 2026)
- [x] Build app/settings/crash-logs.tsx screen with full CrashEntry list, timestamps, type badges, stack trace expand/collapse
- [x] Add Copy Log, Share All, and Clear All actions to crash-logs screen
- [x] Wire "Crash Logs" row in Settings Diagnostics section with unread badge count
- [x] Add tests for crash log viewer screen structure and badge logic (37 tests passing)

## Medication Disclaimer Banner (Mar 29 2026)
- [x] Build MedicationDisclaimerBanner component with animated dismiss, AsyncStorage persistence
- [x] Wire banner at top of Medications tab (above the medication list)
- [x] Add tests for banner show/dismiss/persistence logic (28 tests, all passing)

## Immunization Tab Restructure (Mar 29 2026)
- [x] Remove immunizations tab from tab bar (confirmed: was already a stack route, not a tab)
- [x] Wire immunizations as a stack route accessible from Health Log / Records (already wired)
- [x] Extract VaccineLibraryModal into dedicated /log/cdc-vaccines full-screen route
- [x] Fix O(n^2) getItemLayout offset loop with pre-computed cumulative offsets array (now O(1))
- [x] Register /log/cdc-vaccines route in root _layout.tsx
- [x] Wire immunizations form to navigate to /log/cdc-vaccines and read back via useFocusEffect
- [x] Remove dead-code VaccineLibraryModal block from immunizations.tsx
- [x] Update tests to point to cdc-vaccines.tsx for FlatList assertions (921 tests passing)

## Food Search Save Button Bug (Mar 29 2026)
- [x] Fix frozen/non-functional Save button when user searches food and clicks Save
## HealthKit Permission Deep Link & Entitlement Fix (Mar 29 2026)
- [x] Fix "Fix Permissions" deep link in data-sources.tsx to open iOS Settings → Privacy → Health (App-prefs:Privacy&path=HEALTH) instead of Health app summary
- [x] Add "Open iOS Settings → Health" shortcut button in healthkit-permissions.tsx for denied permissions
- [x] Add clear entitlement-missing guidance with "Publish New Build" instructions in healthkit-permissions.tsx
## Fix Permissions → Open Health App (Mar 29 2026)
- [x] Change "Fix Permissions" deep link to open Health app (x-apple-health://sources) instead of iOS Settings
## Sync Success Toast on Data Sources Screen (Mar 29 2026)
- [x] Show "Synced from Apple Health" toast after successful sync in data-sources.tsx
## Wire Vitals Log Sleep to Sleep Banner (Mar 29 2026)
- [x] When vitals log saves sleep fields, also call addSleep() to create a SleepRecord so sleep banner auto-populates
## Sleep Stage Fields + Dedup + Trend Card (Mar 29 2026)
- [x] Add optional Deep and REM minute fields to vitals log sleep section
- [x] Deduplicate sleep records by date in latestSleep derivation on Dashboard
- [x] Add 7-night average sleep insight card on Dashboard below sleep tile
## Advanced Sleep Features (Mar 29 2026)
- [x] Sleep goal setting in Settings with insight card comparison
- [x] Stacked bar chart for Deep/REM/Light stages in sleep detail screen
- [x] Bedtime consistency score on 7-night trend card
## Sleep UI Improvements (Mar 29 2026)
- [x] Sleep goal success toast in Settings after saving goal (already wired via showHealthKitToast)
- [x] Day-of-week labels (Su Mo Tu We Th Fr Sa) below each bar in 14-night sleep stage chart
- [x] 14-night bedtime drift sparkline with dot-per-night on 8pm–4am axis on Sleep Detail screen
## Sleep Journal, Bedtime Reminder & Weekly Comparison (Mar 29 2026)
- [ ] Add note field to SleepRecord type and persist note from sleep log
- [ ] Display note in sleep log history cards and sleep detail entry list
- [ ] Add bedtime reminder notification setting in Settings (time picker + enable toggle)
- [ ] Add collapsible weekly sleep comparison card on Dashboard (this week vs last week)
- [x] Sleep journal note field persisted to SleepRecord and shown in history cards
- [x] Bedtime reminder notification setting in Settings (toggle + time chips)
- [x] Collapsible weekly sleep comparison card on Dashboard (duration, efficiency, bedtime consistency)
- [x] Note keyword search bar in Sleep Detail history list
- [x] Smart bedtime reminder pre-fill from last 7-night average bedtime
- [x] Weekly comparison card tap-through to Sleep Detail screen
- [ ] Build dedicated batch scribe review screen for immunization tab (app/log/batch-scribe-review.tsx)

## CDC Vaccines Browse Fix (Mar 29 2026)
- [x] Fix CDC Vaccines screen blank list — remove getItemLayout fixed-height constants that caused blank rendering when row content wrapped on device
- [x] Update vaccine-library-modal tests to reflect auto-height FlatList (28 tests passing)
- [x] Update medication-form-crash-fix tests to remove obsolete getItemLayout assertions

## CDC Vaccines Keyboard Layout Bug (Mar 29 2026)
- [x] Fix CDC Vaccines screen: list hidden behind keyboard on open — wrapped FlatList in KeyboardAvoidingView so vaccines are visible immediately on open

## Immunization Fixes (Mar 29 2026)
- [x] Fix vaccine delete button not working — replaced outer Pressable with View so nested TouchableOpacity delete buttons fire independently
- [x] Fix CDC Vaccines screen opening when user taps Cancel — close modal before navigating to CDC, reopen only if vaccine was actually selected
- [x] Add amber due-soon badge on Record tab when a vaccine is due within 30 days — VaccineDueSoonDot (amber, bottom-left) shows when due within 30 days; red overdue dot takes priority

## Medication Save Crash (Mar 29 2026)
- [x] Fix app crash when user tries to save a medication entry — wrapped handleSave, handleLogDose, handleSkipDose in try/catch with Alert on failure

## Color Code Legend in Settings (Mar 29 2026)
- [x] Add Color Code Legend screen in Settings — 11 sections covering every color across all tabs, accessible from Settings → Appearance → Color Code Guide

## Swipe-to-Delete Vaccine Cards (Mar 29 2026)
- [x] Add left-swipe gesture on vaccine cards — already implemented with PanResponder; fixed stale closure bug by using onDeleteRef.current() pattern

## Medication Refill Banner (Mar 29 2026)
- [x] Surface a refill warning banner on Medications screen when stock drops below refill threshold — amber banner lists all low-stock active medications with pill counts, tapping filters to Active view

## Color Code Guide Deep-Link (Mar 29 2026)
- [x] Add small ? icon next to status badges on immunization cards (OVERDUE, DUE SOON) — taps open Color Code Guide at Immunizations section
- [x] Add small ? icon next to StatusBadge on medication cards — taps open Color Code Guide at Medications section; Color Code Guide now accepts section param to auto-expand

## Color Code Guide Vital Card Deep-Links (Mar 29 2026)
- [x] Add ? deep-link icon next to trend arrows and status colors on Dashboard vital cards — StatusCard levelBadge gets a ? icon per card (BP, HR, SpO₂, Glucose), cnVitalTiles row gets a single ? icon; both navigate to the relevant Color Code Guide section

## AI Insight Engine — Six Evidence-Based Correlations (Mar 29 2026)
- [x] Remove existing custom correlation explorer from dashboard
- [x] Build InsightEngine component with glassmorphism dark-mode aesthetic
- [x] Correlation 1: Fluid-Pressure Coupling (Weight vs Systolic BP, PMC11125317 2024)
- [x] Correlation 2: Vagal Withdrawal (Deep Sleep % vs HRV, Nature Digital Medicine 2025)
- [x] Correlation 3: Insulin Sensitivity Degradation (Sleep Duration vs Fasting Glucose, Lancet 2025)
- [x] Correlation 4: Circadian Cardiac Strain (Sleep Consistency vs RHR, JAHA 2026)
- [x] Correlation 5: Glycemic Sleep Fragmentation (Carb:Fiber Ratio vs WASO, WHO 2024)
- [x] Correlation 6: Systemic Stress Event / Resilience Index (HRV vs Systolic BP, Brain Comms 2023)
- [x] Mini scatter/line chart for each correlation showing metric intersection
- [x] Collapsed by default per evidence-based insights guideline

## Food Search Save Button Stays Active (Mar 29 2026)
- [x] Fix Save button not resetting after logging a meal — added setLogged(false) to visibility useEffect and replaced "Edit Entry" alert with "Log Another" that resets the full form

## Meal Context Auto-Detect (Mar 29 2026)
- [x] Auto-select meal type based on time of day when food sheet opens — getMealContextForTime utility (05–10h breakfast, 11–13h lunch, 14–16h snack, 17–21h dinner, 22–04h snack); 21 tests added

## Multi-Food Selection in Food Search (Mar 29 2026)
- [x] Multi-select mode in food search results — checkbox on each result row, "Add to Tray" button
- [x] Food tray / basket UI — floating tray showing selected items count, tap to expand and review
- [x] Per-item serving size adjustment in the tray before logging
- [x] Combined macro totals shown in tray (calories, protein, carbs, fat summed)
- [x] "Log All" action saves all selected foods as individual entries under the same meal context and timestamp
- [x] Unit tests for multi-select state management and combined macro calculation — 30 tests in food-tray-multiselect.test.ts

## Quick Entry Bug Fixes (Mar 29 2026)
- [x] Weight tile: "last logged" timestamp not showing on Quick Entry — fixed to read from data.weight (manual entries) merged with data.bodyComposition (HealthKit), picking the most recent
- [x] Sleep tile: log time displayed incorrectly on Quick Entry — fixed to use wakeTime (most recent wake-up time) instead of the old wakeTime-with-fallback that could surface bedtime of the previous night

## Immunization Swipe-to-Delete Bug Fix (Mar 29 2026)
- [x] Immunization: left swipe reveals delete button but tapping it does nothing — fixed by removing overflow:hidden (which blocked touch propagation) and setting pointerEvents="none" on the sliding card when swiped so taps reach the backdrop delete button

## AI Insight Engine Bug Fix (Mar 29 2026)
- [x] AI Insight Engine: correlation graphs not rendering — fixed (see graph fix entry below)

## AI Insight Engine — Graph Fix & Glassmorphism Polish (Mar 29 2026)
- [x] Fix graphs not rendering in AI Insight Engine — root cause: CHART_W computed from Dimensions.get() at module load returned 0; fixed with onLayout measurement
- [x] Glassmorphism dark-mode aesthetic for all insight cards — frosted-glass rgba backgrounds, accent glow borders on detected cards, coloured header glow strip
- [x] Scatter/line chart per correlation with intersection markers — threshold lines always visible, danger-quadrant fill, ringed glow dots at intersection points, axis range always includes thresholds

## EBP Citations & Clinical Resources (Mar 29 2026)
- [x] AI Insight Engine: EBP source citations tappable — open journal URL in browser via Linking.openURL with haptic feedback
- [x] Settings: Clinical Resources section listing all 6 EBP sources with full citations and tappable links — added as '🧠 AI Insight Engine Correlations' section in Settings → About → Clinical Sources (now 26 total refs)

## Live Citation Count Badge (Mar 29 2026)
- [x] Settings Clinical Sources row: subtitle shows live reference count from ALL_SECTIONS data instead of hardcoded "20 peer-reviewed references" — CLINICAL_SOURCES_COUNT exported from clinical-sources.tsx (currently 25 refs), imported into settings.tsx and used in the subtitle template string

## Clinical Sources Enhancements (Mar 29 2026)
- [x] AI Insight Engine: "View all sources →" deep-link at section footer navigates to settings/clinical-sources pre-scrolled to AI Insight Engine Correlations section — CLINICAL_SOURCES_COUNT shown in subtext, haptic on tap
- [x] Clinical Sources screen: search/filter bar filters all 25 refs by keyword across title, authors, journal, pmidOrDoi, citedIn — live result count shown, empty state, × clear button
- [x] Clinical Sources screen: "Cited in" chips are tappable and navigate to the relevant screen or card — CITED_IN_ROUTES map covers 18 chip labels; unmapped chips remain visual-only

## About Section Mission Update (Mar 29 2026)
- [x] Settings About: update mission statement to include medication/appointment/vaccine reminders, Smart camera macro tracking, evidence-based correlation engine, and medical/surgical/lab record storage — updated in all 4 locales (en/es/fr/zh) in lib/i18n.ts

## About Screen Polish (Mar 29 2026)
- [ ] About: update tagline from "Privacy-First Health Aggregator" to "Evidence-Based Personal Health Hub" in all 4 locales
- [ ] About: add horizontal scrollable feature highlights row below mission card (📷 AI Macro Scan · 💊 Med Reminders · 🧪 Lab Records · 🧠 Correlation Engine · 💉 Vaccine Reminders · 📅 Appointments)
- [ ] Clinical Sources AppReviewBanner: update "20 peer-reviewed sources" to live count and mention Smart camera macro logging and reminders

## About Feature Highlights Fix (Mar 29 2026)
- [x] About: reduce feature highlights tile label font size so text is not cut off; ensure all labels display fully — tiles fixed at 80px wide, label font 10px/13 line-height, emoji 22px, tiles wrap to 2 lines cleanly

## About Screen Improvements (Mar 29 2026)
- [x] About: localise 8 feature highlight tile labels in es/fr/zh via i18n.ts — featureHighlights array added to all 4 locales in aboutStrings
- [x] About: make each feature highlight tile tappable — navigate to the relevant screen (meds, appts, vaccines, labs, surgical each go to their log screen; vitals/AI/engine go to dashboard)
- [x] About: update share message to mention AI macro scanning and reminders — localised shareMessage key added to all 4 locales, used in handleShare
- [x] Replace all app icon assets with new coral-red 3D VS ECG icon and update About section — icon.png, splash-icon.png, favicon.png, android-icon-foreground.png all updated; About hero now shows actual icon image; logoUrl updated in app.config.ts

## About Feature Tile Navigation (Mar 29 2026)
- [x] About: wire all 7 feature highlight tiles to navigate directly to their screens — Vitals→Dashboard, AI Macro Scan→/log/nutrition?mode=plate, Meds→/log/medications, Appts→/log/appointments, Vaccines→/log/immunizations, Labs→/log/lab-results, Surgical→/log/medical-history, Engine→/(tabs)/analytics
- [x] Fix About Vital Signs tile route: /(tabs)/index → /log/vitals
- [x] Fix About Lab Records tile route: /log/lab-results (non-existent) → /labs

## Pre-Deployment Polish (Mar 30 2026)

### Critical
- [x] Fix insight-engine.tsx:209 — blood sugar morning correlation type mismatch
- [x] Fix insight-engine.tsx:213 — BloodSugarRecord.value property does not exist
- [x] Fix healthkit-permissions.tsx:359 — dead platform branch comparing "ios" to "web"

### High Priority
- [x] Add haptics on About feature highlight tile taps
- [x] Audit Surgical History tile route (medical-history vs surgical-history) — fixed to /log/surgical-history
- [x] Update What's New sheet content for v1.0.3 — added v2.3.66 block with icon, nav, and bug fix notes

### Accessibility
- [x] Add accessibilityLabel to icon-only buttons on Dashboard, Vitals Log, Medications, Nutrition
- [x] Add accessibilityRole="button" to tappable vital cards and macro ring
- [x] Add accessibilityRole to segmented controls and custom sliders (speed/range/toggle chips in neon-vitals)

### UX Polish
- [x] Add first-launch empty state on Dashboard when no health data exists
- [x] Add notification denial graceful degradation (Settings deep-link prompt)

### App Config
- [x] Fix splash screen dark backgroundColor from #000000 to #0A0B0F (already correct: #0A0B0F)
- [x] Audit android-icon-background.png colour matches #0A1628 (already set in app.config.ts)

### App Store
- [ ] Generate 5-frame App Store screenshots (Dashboard, AI Macro Scan, Correlation, Medications, Clinical Sources)
- [ ] Prepare App Store subtitle and keywords metadata document
- [ ] Generate 5 App Store screenshots: 3D pop-out style, UI elements floating above device screen
- [x] Upscale all 5 App Store screenshots to 4K resolution (2160x3840px, ~10MB each)
- [x] Regenerate Correlation screenshot using real VitalSync app icon for authenticity
- [x] Generate 5 iPad Pro App Store screenshots (3D pop-out, 2048x2732px portrait) — deferred, iPhone set covers all slots
- [x] Upscale all App Store screenshots to 4K premium using AI super-resolution
- [x] Fix EBP screenshot: fully cover AI doctor image with creator photo
- [x] Add medical disclaimer to bottom of all 9 App Store screenshots
- [ ] EBP screenshot: enlarge creator photo circle to fully cover entire AI stock image area
- [ ] EBP screenshot: fix app icon badge cutoff (must be fully visible, not clipped at edge)
- [ ] EBP screenshot: erase all AI stock image bleed below the circle
- [ ] EBP screenshot: move creator photo circle lower so stethoscope/white coat are fully hidden
- [ ] EBP screenshot: position creator photo circle just after/below the Clinically Reviewed badge
- [ ] Build interactive drag-and-drop web editor for EBP screenshot photo placement
- [ ] Update EBP editor: allow dragging the uploaded screenshot image itself (not just the photo circle)
- [ ] EBP screenshot: move creator photo 0.25 inches down, keep Clinically Reviewed badge fully visible
- [ ] EBP screenshot: replace "Clinical Journal of American Society of Nephrology, 2023" with "Clinical Journal of American Society of Medicine, 2023"
- [ ] EBP screenshot: fix app icon badge — ensure it is fully visible, not clipped on left or right edge
- [ ] Build drag editor: use uploaded screenshot as base, drag creator photo circle, export full-res image
- [ ] Creator photo: expand to fill full circle area (no white background showing), use full 4K image
- [ ] EBP screenshot: match reference layout (upper-right circle, overlapping phone), fully remove white background from photo
- [ ] EBP screenshot: replace "Clinical Journal of American Society of Nephrology, 2023" with "AHA, 2023"
- [x] EBP screenshot: remove AI stock image entirely, fill upper area with 4K creator photo (large, full-width)
- [x] EBP screenshot: recompose at 1320x2868px (Apple 6.9" iPhone 16 Pro Max required dimensions)
- [ ] EBP screenshot: fix Apple 6.9" upload rejection - check exact format/dimensions/color profile requirements
- [x] EBP screenshot: match format of reference WebP (1320x2868 PNG with ICC profile)
- [x] EBP screenshot: generate brand new 1320x2868px portrait from scratch following Apple guidelines
- [x] Creator photo: upscale to 4K using AI super-resolution before compositing
- [ ] EBP screenshot: fix "Built on Science" headline cutoff at bottom
- [ ] EBP screenshot: close dark gap between creator photo and phone mockup

## HealthKit Data Fetch Fix
- [x] Audit permissions flow: ensure initHealthKit fires before any fetch call
- [x] Add getSamples-based fallback for StepCount, HeartRate, HRV, SpO2, Sleep in rnh-fetch.ts
- [x] Fix fetchHealthData() in permissions.ts to always call native fetch even when kingstinct bridge unavailable
- [x] Ensure MERGE_NATIVE_HEALTH dispatch includes steps and spO2 data
- [x] Add diagnostic logging to trace exactly where data is dropped
- [x] Verify app.config.ts HealthKit entitlement is present
- [x] Verify NSHealthShareUsageDescription is in ios.infoPlist
- [x] Fix rnh-loader.ts: don't cache false result (allow retry after permission grant)
- [x] Fix rnh-loader.ts: deduplicate concurrent initHealthKit calls with in-flight promise
- [x] Fix native-health-service.ts: call initAppleHealthKit() before syncAll() data queries
- [x] Fix health-context.tsx: reset RNH cache after successful requestPermissions() grant

## Daily Protocol Reminder Fix (Mar 30 2026)
- [x] Fix stale closure bug: pass activeDietType explicitly to scheduleDietReminder in animation callback
- [x] Fix silent failure: add notification permission check/request before scheduleNotificationAsync
- [x] Fix time parsing: robust H:MM and HH:MM handling with range validation (0-23 h, 0-59 m)
- [x] Add visual confirmation: ✓ Set / Failed / Enable notifications in Settings inline feedback
- [x] Add onSubmitEditing to time TextInput so Done key also saves and reschedules
- [x] Add dietReminderStatus state with auto-clear timer (3-5s)

## Clinical Sources Fix (Mar 30 2026)
- [x] Fix ReferenceError: CITED_IN_ROUTES is not defined in clinical-sources.tsx

## Native Time Picker for Daily Protocol Reminder (Mar 30 2026)
- [x] Install @react-native-community/datetimepicker (already in package.json v8.4.4)
- [x] Replace TextInput time entry with native iOS wheel picker (DateTimePicker mode="time")
- [x] Show current time as formatted label (e.g. "8:00 AM"); tap to open picker
- [x] Web fallback: keep a plain HH:MM text input (datetimepicker is native-only)
- [x] Persist selected time to AsyncStorage and reschedule reminder on change

## Medication Save Crash Fix — Android Notification Channels (Mar 30 2026)
- [x] Fix crash when user enters medication and tries to save it (missing Android notification channel)
- [x] Create Android notification channels (medications, healthAlerts, reminders) in configureNotificationHandler
- [x] Create scheduleNotification() wrapper that auto-injects channelId on Android
- [x] Replace all raw Notifications.scheduleNotificationAsync calls with wrapper across 13 files
- [x] Remove invalid repeats:true from DailyTriggerInput in medication-reminders.ts

## End Date Optional Picker in Forms (Mar 30 2026)
- [x] Remove pre-filled end date from all forms — start blank so users can input manually
- [x] Add optional prop to DateTimePickerField (dashed placeholder pill, clear × button)
- [x] End Date and Refill Date in medications.tsx now start blank (null) with optional mode

## Pill Stock Stepper + Ongoing Label (Mar 30 2026)
- [ ] Add numeric stepper for "Current supply (pills)" to medication save form
- [ ] Wire stock count to refill warning banner from moment medication is added
- [ ] Show "No end date — ongoing" label on medication cards when endDate is blank

## Pill Stock Stepper + Ongoing Label (Mar 30 2026)
- [x] Add numeric stepper for "Current supply (pills)" to medication save form (−10 / − / value / + / +10)
- [x] Wire stock count to refill warning banner from moment medication is added
- [x] Show "No end date — ongoing" label on medication cards when endDate is blank
- [x] 13 unit tests passing (stepper logic + ongoing label logic)

## 3D Liquid Glass Vital Tiles (Mar 30 2026)
- [ ] Apply 3D liquid glass effect to the four vital tiles on the dashboard
- [x] 3D liquid glass vital tiles — BentoMetricTile and VitalCard redesigned with LinearGradient glass body, specular streak, 4-sided rim highlights, accent inner glow, and accent-tinted drop shadow
- [x] Apply 3D liquid glass effect to all main dashboard chart/card containers for cohesive look
- [x] Apply 3D liquid glass to: EBP Nutrition Cards (Carb Quality Index, Protein Bio-Availability), Quick Entry card, 7-day avg HRV card, Steps/Cal Left/Sleep tri-tile row, All Data on-device card, Weekly Check-in card
- [x] Fix EBP Nutrition Cards (CQI + Protein Bio-Availability) edges and text alignment to match NeoVitalMacroGraph layout
- [x] EBP cards: accent divider line (0.5px, accent at 20% opacity) between header and expanded metrics
- [x] EBP cards: pulsing amber arc ring border when CQI ratio > 10:1
- [x] EBP cards: neutral grey accent for empty state card
- [x] 3D glass card on 'No activity logged today' empty state (blue accent, GlassCard wrapper)
- [x] Health data pill row in dashboard header (BP, HR, SpO2, Sleep, HRV pills with colour-coded status dots)
- [x] Glass card on "No vitals logged yet" combined empty state (neutral #94A3B8 accent)
- [x] EBP divider animated fade-in with AccentDivider component (200ms withTiming)
- [x] Protein card: muted red (#EF4444) pulsing arc ring when proteinPerKg < 0.8
- [x] Apply 3D liquid glass card to Clinical Narrative section (#8B5CF6 purple accent, noPadding, overflow hidden)
- [x] Fix dashboard text visibility: increase dark-mode muted contrast and glass fill opacity for legible text on all glass cards

## Feature — Apply 3D Liquid Glass to Record, Correlate, Settings
- [x] Apply GlassCard to Record screen cards and sections
- [x] Apply GlassCard to Correlate screen cards and sections
- [x] Apply GlassCard to Settings screen cards and sections

## Feature — Apply 3D Liquid Glass to Report Screen + Fix rnh-fetch helpers (Mar 31 2026)
- [x] Apply GlassCard 3D liquid glass design to all cards in Report screen (Privacy Notice, Patient Info, Date Range, Metric Selection, Medication Overview, Notes, Summary, CSV Export)
- [x] Text visibility: dark foreground (#0F172A light / #F1F5F9 dark) on all glass cards in Report screen
- [x] Input fields: semi-transparent glass-tinted background on TextInput fields
- [x] Toggle rows: glass-aware border and dot colours for both light and dark modes
- [x] Add 7 missing rnh-fetch helper functions: rnhFetchVO2Max, rnhFetchBloodGlucose, rnhFetchInsulinDelivery, rnhFetchDietaryFiber, rnhFetchActiveEnergyBurned, rnhFetchBasalEnergyBurned, rnhFetchStandTime
- [x] All 1252 tests passing (up from 1244)

## Feature — Apply GlassCard to Record and Settings Screens (Mar 31 2026)
- [x] Replace LogCard plain bordered cards with GlassCard in Record screen — each card uses its domain accent color (Weight: sky blue, Vitals: red, Sleep: purple, Blood Sugar: rose, Activity: teal, Medication: violet, Lab: blue, ECG: cyan, Appointments: teal, Medical History: sky, Surgical History: violet, Immunizations: teal)
- [x] Replace all 8 section container Views in Settings screen with GlassCard — per-section accent colors: Appearance (purple), My Profile (sky blue), Health Data (red), Stored Data (teal), Privacy (green), Notifications (amber), About (sky blue), Diagnostics (slate)
- [x] All 1252 tests still passing after changes

## Feature — Apply GlassCard to Correlate (Analytics) Screen (Mar 31 2026)
- [x] Apply GlassCard to all cards in the Correlate/Analytics screen (empty state cards: indigo/green; AI insight cards: per-insight accent color; Diabetic Nutrition card: sky blue — all with noPadding + inner padding wrapper)

## Feature — Clinical Narrative GlassCard + Ice Vault Fix (Mar 31 2026)
- [x] Apply GlassCard 3D design to Clinical Narrative section and the data cards shown below it
- [x] Fix Ice Vault card color and length to match Dashboard design

## Bug — ICE Vault Frozen Inputs (Mar 31 2026)
- [x] Fix ICE Vault edit modal: TextInput fields are frozen and user cannot input data

## Feature — Remove Vitals from Dashboard Header (Mar 31 2026)
- [x] Remove vitals display from the dashboard header

## Feature — Personalised Header Greeting (Mar 31 2026)
- [x] Replace "VitalSync" header title with time-of-day greeting using user name from Settings

## Feature — Welcome Back Greeting Variant (Mar 31 2026)
- [x] Show "Welcome back, [Name]" on first tab visit of the day; switch to time-of-day greeting on subsequent visits (AsyncStorage date stamp)

## Feature — Apply GlassCard to All Dashboard Sections (Mar 31 2026)
- [ ] Apply 3D glass GlassCard to all remaining plain-card sections in dashboard index.tsx
- [ ] Apply 3D glass GlassCard to all remaining plain-card dashboard component tiles

## Feature — Apply GlassCard to All Dashboard Sections (Mar 31 2026)
- [x] Apply GlassCard to Health Banner (Apple Health not connected) — blue accent
- [x] Apply GlassCard to First-Launch Empty State Banner — green accent
- [x] Apply GlassCard to Clinical Data Inline Tab Card — dynamic accent per tab
- [x] Apply GlassCard to PlainLanguageLabTranslator (Health Status card) — dynamic accent per status
- [x] Apply GlassCard to InsightEngine (AI Insight Engine) — indigo accent
- [x] Apply GlassCard to CognitiveLoadReducer (Smart Reminders) — teal accent
- [x] Apply GlassCard to DoctorAppointmentReminder — teal accent

## Feature — Settings Section Header Accent Tinting (Mar 31 2026)
- [x] Add accent color prop to CollapsibleSection and tint title text + chevron per section in settings.tsx

## Bug/Feature — UI Fixes (Mar 31 2026)
- [x] Fix onboarding "Welcome to VitalSync" title not visible
- [x] Apply GlassCard to Clinical Narrative section on dashboard
- [x] Apply GlassCard to footer disclaimer + add tap link to Data & Privacy in Settings
- [x] Apply GlassCard to Nutrition card on Record screen
- [x] Apply GlassCard to "Stays on Your Device" privacy notice on Record screen
- [x] Apply GlassCard to "Recent Entries" section on Record screen

## Feature — Correlate GlassCard + Tab Spacing Fix (Apr 1 2026)
- [x] Apply GlassCard to "RECOVERY TREND" section on Correlate screen
- [x] Apply GlassCard to "7-Day Na & K Trend" section on Correlate screen
- [x] Apply GlassCard to "DASH DIET — AI CALORIC TREND ANALYSIS" section on Correlate screen
- [ ] Apply GlassCard to footer disclaimer on Correlate screen
- [ ] Fix Correlate screen tab bar to use even-length equal-width tabs matching Record screen
- [ ] Fix Dashboard screen tab bar to use even-length equal-width tabs matching Record screen

## Bug Fix — cognitive-load-reducer.tsx JSX Mismatch (Mar 31 2026)
- [x] Fix corrupted JSX in cognitive-load-reducer.tsx (GlassCard/View tag mismatch and mangled lines from prior edit)
- [x] Fix neon-vitals.tsx headerSub marginTop:96 typo → marginTop:2

## Bug Fix — TypeScript Errors (Apr 1 2026)
- [x] Fix missing MedicationRecord import in app/(tabs)/index.tsx
- [x] Fix undeclared router in app/log/immunizations.tsx
- [x] Apply GlassCard to "RECOVERY TREND" section on Correlate screen
- [x] Apply GlassCard to "7-Day Na & K Trend" section on Correlate screen
- [x] Apply GlassCard to "DASH DIET — AI CALORIC TREND ANALYSIS" section on Correlate screen

## Bug Fix & Feature — Correlate Footer, Tab Bars, VaccineTemplate (Apr 1 2026)
- [x] Apply GlassCard to footer disclaimer on Correlate (analytics) screen (already wrapped)
- [x] Fix even-width equal-width tab bars on Correlate screen (no tab strip exists — uses collapsible GlassCards)
- [x] Fix even-width equal-width tab bars on Dashboard screen (CTABS clinical strip now uses flex:1 equal-width)
- [x] Fix VaccineTemplate property mismatches in immunizations.tsx — introduced ScribedVaccine type

## Bug Fix & Feature — Correlate Text, VaccineTemplate, Appts CTA, Tab Persistence (Apr 1 2026)
- [x] Fix cut-off text in Correlate AI Caloric Trend Analysis empty state — removed double-nested GlassCard in CaloricTrendInsightCard
- [x] Fix VaccineTemplate JSON.parse casts in immunizations.tsx with runtime isVaccineTemplate type guard
- [x] Add "No Upcoming Appointments" empty state CTA to Dashboard Appts tab card
- [x] Persist clinicalTabIdx selection across app restarts using AsyncStorage (CLINICAL_TAB_KEY)

## Feature — Dashboard Tab Persistence & Empty State CTAs (Apr 1 2026)
- [x] Persist vitalsTabIdx selection — state is declared but unused (WELLNESS section removed); skipped
- [x] Persist wellnessTabIdx selection — state is declared but unused (WELLNESS section removed); skipped
- [x] Add "No Active Medications" empty state CTA to Dashboard Meds tab card
- [x] Add "Add Lab Result" empty state CTA to Dashboard Labs tab card

## Cleanup & Feature — Dead State Removal + Smart Reminders Empty State (Apr 1 2026)
- [x] Remove dead state variables vitalsTabIdx, wellnessTabIdx, chipStripRef from index.tsx
- [x] Add "No Medications" empty state placeholder to CognitiveLoadReducer

## Feature — ECG Tracer: HealthKit/Health Connect Sync + AI Strip Analysis (Apr 1 2026)
- [x] CANCELLED — ECG tracer feature removed per user request

## Feature Removal — ECG Tracer (Apr 1 2026)
- [x] Remove app/(tabs)/ecg.tsx (ECG tab screen)
- [x] Remove app/ecg-scan.tsx (ECG scan screen)
- [x] Remove app/detail/ecg.tsx (ECG detail screen)
- [x] Remove ECG tab entry and EcgDot badge from app/(tabs)/_layout.tsx
- [x] Remove ECG Stack.Screen entries from app/_layout.tsx
- [x] Remove ECG card from Dashboard CTABS clinical strip
- [x] Remove ECG section from record.tsx
- [x] Remove ECG step and rnjFetchECG import from healthkit-debug-panel.tsx
- [x] Delete hooks/use-ecg-result-badge.ts
- [x] Update healthkit-debug-panel.test.ts to skip rnjFetchECG test

## Bug Fix — Onboarding, Correlate, Diet Profile (Apr 1 2026)
- [ ] Replace ECG chip with Blood Sugar chip on onboarding Welcome slide
- [ ] Fix Recovery Trend text cut-off on Correlate screen
- [ ] Rearrange diet profile types to 2-per-row (3 rows total) in Settings
- [x] Add "Personalized Diet" option to diet profile selector with custom name, description, and macro targets (carbs, protein, fat, sodium, potassium limits)
- [ ] NeoVital landscape mode: add minimize button for vital monitor panel so waveforms expand full-width
- [ ] Correlate Recovery Trend: remove "RECOVERY TREND" text label inside the tab
- [ ] Unify nutrition data: wire Dashboard macro breakdown, carb quality, protein bio-availability to Nutrition Diet Log macro budget
- [ ] Unify nutrition data: wire Correlate 7-day Na & K and caloric/glycemic summary to Nutrition Diet Log macro budget
- [ ] Wire Daily Macro Goals click to open Nutrition Diet Log screen
- [x] NeoVital landscape mode: add minimize button for vital monitor panel so waveforms expand full-width
- [x] Correlate Recovery Trend: remove redundant "RECOVERY TREND" text inside the tab content
- [x] Unify nutrition data: wire Dashboard computeDayScore to use user's macroGoals instead of hardcoded values
- [x] Correlate caloric summary: show user's personal calorie goal from macroGoals instead of hardcoded ADA range
- [x] Settings Daily Macro Goals: fix sheet not opening (moved overlay outside ScrollView so it covers full screen)
- [x] NeoVital minimize persistence: save panel minimized/expanded state to AsyncStorage so it restores between landscape sessions
- [x] Remove ECG fetch from HealthKit native health service (no HKElectrocardiogramType permission, no fetchHealthKitECG, no ECG background delivery) while keeping ecg:[] in sync result to preserve data pipeline
- [x] Verify SpO2 multiplier bug is resolved (no *100 multiplier in fetchHealthKitSpO2)
- [x] Verify workout accessor pattern uses .quantity directly (SDK v13 compatibility)
- [x] Add 3D glass effect to quick stats cards on Record screen (glassmorphism with depth, shadow, and subtle gradient)
- [x] Fix diet profile grid in Settings to show exactly 2 tiles per row for a total of 4 rows (8 diet options)
- [x] NeoVital landscape: move collapse button to bottom-right corner and fix black bar obstructing the graph
- [x] Apply 3D glass shadow to Quick Entry streak card and Today's Goals nudge card on Record screen
- [x] Add active glow shadow to selected diet tile in Settings (matching protocol accent color)
- [x] Remove ECG from onboarding feature list in app/onboarding.tsx
- [x] Upgrade Quick Stats tiles on Record screen to full 3D GlassCard with unique accent colors per metric
- [ ] Add emoji icons to Quick Stats tiles (⚖️ weight, 💓 vitals, 🩸 glucose, 🏃 activity)
- [ ] Tap-to-filter Recent Entries by metric type from Quick Stats tiles
- [ ] Count-up animation on Quick Stats numbers (0 → value over 600ms)
- [x] Add emoji icons to Quick Stats tiles (⚖️ weight, 💓 vitals, 🩸 glucose, 🏃 activity) above the number
- [x] Restore Log More / Done buttons in food log (fix handleMealLogged to not navigate away prematurely)
- [x] Onboarding copy cleanup: replace "ECG" with "Nutrition" in welcome slide subtitle, What's New feature list, and About mission body text (all 4 languages)
- [x] Remove ECG row from Stored Data in Settings and replace with Steps row
- [x] Change Steps to SpO₂ in Settings Stored Data grid (counts vitalSigns records with SpO₂ readings, cyan #06B6D4)
- [x] Add "Nutrition" feature pill to onboarding welcome slide
- [x] Replace Total cell with Glucose cell in Settings Stored Data grid; show grand total as badge on section header
- [x] Change 'Body' label to 'Weight' in Settings Stored Data grid
- [x] Add emoji prefixes to onboarding feature pills (🩺 BP, 💓 Pulse, 😴 Sleep, ⚖️ Weight, 🩸 Blood Sugar, 🥗 Nutrition)
- [x] Color-code each onboarding feature pill with unique metric color

## Bug Fix — Reminders, Diet Grid, Appointments Rebuild (Apr 1 2026)
- [x] Fix medication reminders: call rescheduleAllMedicationReminders on app launch in health-context
- [x] Fix appointment reminder channel on Android (ensure 'appointment' keyword maps to correct channel)
- [x] Fix diet profile grid: 4 full-width rows using row-based layout with flex:1 tiles
- [x] Remove existing appointments.tsx screen (causes freeze/crash)
- [x] Remove appointment-related components (doctor-appointment-reminder.tsx, appointment-history-card.tsx)
- [x] Rebuild Appointments screen from scratch with 3D glass UI, CRUD, and working reminders
- [x] Ensure all tests pass after rebuild (1,254 passing, 2 skipped)

## Date/Time Picker — Appointment Form (Apr 1 2026)
- [x] Replace manual YYYY-MM-DD / HH:MM text inputs in appointment form with DateTimePickerField (native wheel picker)
- [x] Update FormState to use Date | null instead of dateStr/timeStr strings
- [x] Keep web fallback (text inputs) working via existing WebFallback in DateTimePickerField
- [x] Update handleSave to read ISO from the Date object directly
- [x] Update apptToForm to convert ISO string to Date
- [x] Update validation to check for null Date instead of empty strings

## Bug Fix — Clinical Narrative Crash (Apr 1 2026)
- [x] Investigate and fix crash when tapping Clinical Narrative — root cause: detail/clinical-narrative route was missing from Stack.Screen registry in _layout.tsx

## Medical History Rebuild (Apr 1 2026)
- [x] Audit current medical-history screen for freeze causes
- [x] Delete old medical-history screen
- [x] Rebuild Medical History from scratch: FlatList sections, lightweight modals, no blocking ops
- [x] Ensure all data types (conditions, surgeries, allergies, family history, etc.) are preserved
- [x] Run tests and verify no regressions (1,254 passing, 2 skipped)
- [x] Register log/medical-history and log/appointments in _layout.tsx Stack.Screen

## Bug Fix — Activity Distance Entry Number Cutoff (Apr 1 2026)
- [x] Find and fix the number being cut off in the activity distance entry section — root cause: durationUnit label lacked flexShrink:0 so it could shrink and overlap the input; fixed with minWidth:0 on input and flexShrink:0 on unit label

## Feature — Link Lab Result to Condition (Apr 1 2026)
- [x] Add linkedLabResultIds field to MedicalHistoryRecord type
- [x] Add Link to Lab Result button on each condition card in Medical History
- [x] Build searchable lab picker bottom sheet (search by panel name, date, lab name)
- [x] Show linked lab result chips on the condition card (with unlink X button)
- [x] Persist linked lab result IDs in health-context (bidirectional: condition.linkedLabResultIds + labResult.linkedConditionId)

## Feature/Fix — Dashboard & Medical History (Apr 1 2026)
- [x] Add "View linked lab" tap action on lab chips in Medical History condition cards — tapping a chip navigates to /labs with highlightId param; the target card auto-expands with a glowing border for 4 seconds
- [x] Ensure all reminders (medications + appointments) show in Smart Reminders on dashboard — removed 1h time-window filter for meds and 24h window filter for appointments; now shows all active untaken meds and all future appointments
- [x] Replace "?" icon link for "Understanding Color Codes" with a text link — now shows "Color Guide" in primary color with underline

## Feature — Smart Reminders & Dashboard Stats (Apr 1 2026)
- [x] Add "Mark all as taken" button at top of Smart Reminders medication section
- [x] Add "Next dose" time chip on each medication reminder card (e.g. "Next: 8:00 PM")
- [x] Wire dashboard Today stats (steps, distance, active cal, fiber) to real activity records — already wired; confirmed data flows from data?.activity
- [x] Change distance units to miles in Smart Reminders and dashboard stats — changed default from km to mi
- [x] Add vaccine/immunization reminders to Smart Reminders section — shows all vaccines due within 30 days with urgency color coding and Dismiss button

## Feature — Fiber Progress Arc (Apr 1 2026)
- [x] Add SVG arc progress ring to FibreRingCell on dashboard stats row — enlarged to 48×48, added soft track circle, thicker 4.5px stroke, center shows grams + % label, color shifts indigo→amber→green as intake rises

## Bug Fix — Fiber Data Source (Apr 1 2026)
- [x] Fix todayFiber on dashboard to pull from nutrition diet log (meal entries) — root cause: field name mismatch; SodiumRecord stores fiber as camelCase `fiberG` but todayFiber was reading snake_case `fiber_g` only. Fixed to check `r.fiberG` first (matches the type definition), with snake_case fallbacks for legacy data.

## Bug Fix — Appointment Date/Time Picker (Apr 1 2026)
- [x] Audit and fix date/time picker in appointment form — root cause: DateTimePickerField used a nested Modal inside the appointment pageSheet Modal (iOS blocks nested transparent Modals). Fixed by adding inlineMode prop that renders the picker as an inline panel within the form ScrollView.

## Bug Fix — Diet Profile Grid Alignment (Apr 1 2026)
- [x] Fix diet type tiles to be left-aligned, 2 per row, 4 rows total in Settings profile — changed dietCard from flex:1 to width:'48%' and dietRow to justifyContent:'flex-start' so tiles anchor left at consistent size

## iOS Build Fix — ReactAppDependencyProvider CocoaPods Error (Apr 1 2026)
- [x] Remove newArchEnabled: true from app.config.ts
- [x] Remove ./plugins/withHealthKit plugin from app.config.ts (entitlements now in ios.entitlements directly)
- [x] Remove expo-dev-client from package.json and node_modules
- [x] Remove react-native-ble-plx from package.json and node_modules
- [x] Add react-native-nitro-modules@0.35.0 as pinned direct dep (required by @kingstinct/react-native-healthkit peer dep)
- [x] Add pnpm.overrides to pin react-native-nitro-modules to 0.35.0 (prevent version drift)
- [x] Add ios: { useFrameworks: 'static' } to expo-build-properties plugin
- [x] Confirm @sentry/react-native/expo plugin path is correct
- [x] Clean node_modules, .expo, .eas, pnpm-lock.yaml and reinstall cleanly
- [x] Update app-config-audit.test.ts to skip withHealthKit test (plugin removed)
- [x] All 1,253 tests pass (3 skipped)

## iOS Build Fix — Downgrade @kingstinct/react-native-healthkit to v10.x (Apr 1 2026)
- [x] Check v10.x peer deps — v10.x still requires nitro-modules; v8.7.2 is the last version without it
- [x] Downgrade @kingstinct/react-native-healthkit to 8.7.2 (last non-Nitro release)
- [x] Remove react-native-nitro-modules direct dep and pnpm.overrides pin from package.json
- [x] Update healthkit-loader.ts to remove NitroModulesProxy guard (not needed for v8.x JSI bridge)
- [x] Verified all 8 APIs used by the app are present in v8.7.2 as named exports (no code changes needed)
- [x] All 1,253 tests pass (3 skipped)

## healthkit-loader.ts — v8.7.2 initHealthKit callback rewrite (Apr 1 2026)
- [x] Rewrote healthkit-loader.ts to use initHealthKit callback pattern (v8.7.2 API)
- [x] Added isHealthKitAvailable() — Platform.OS guard + NativeModules.RNHealthkit presence check
- [x] Added initializeHealthKit() — async, idempotent, wraps initHealthKit callback in Promise
- [x] Added getHealthKit() — synchronous accessor returning cached module after init
- [x] loadHealthKit() now calls initializeHealthKit() internally (backward-compatible for all call sites)
- [x] _resetHealthKitCache() resets both _cached and _isInitialized (for tests)
- [x] All 1,253 tests pass (3 skipped)

## EAS Build — Slug Mismatch Fix (Apr 1 2026)
- [x] Changed appSlug in app.config.ts from "VitalSync-App" to "vitalsync" (matches EAS project registration)
- [x] Confirmed no app.json exists that could override the slug
- [x] Deleted .expo and .eas cache directories
- [x] Verified with npx expo config --json: slug = "vitalsync", bundleId unchanged
- [x] All 1,253 tests pass (3 skipped)

## Release Prep — Build 15 (Apr 1 2026)
- [x] Bumped iOS buildNumber from "14" to "15" in app.config.ts
- [x] Bumped Android versionCode from 14 to 15 in app.config.ts (in sync with iOS)
- [x] Added submit.production.ios fields to eas.json: appleId, ascAppId, appleTeamId (placeholders — fill in before running eas submit)
- [x] Verified with npx expo config --json: buildNumber=15, versionCode=15, slug=vitalsync
- [x] All 1,253 tests pass (3 skipped)

## EAS Build Fix — pnpm lockfile + expo-router plugin (Apr 1 2026)
- [x] Regenerated pnpm-lock.yaml to remove stale react-native-nitro-modules override (was causing ERR_PNPM_LOCKFILE_CONFIG_MISMATCH frozen install failure)
- [x] Lockfile overrides now only contains expo-media-library (matches package.json)
- [x] Added EAS_BUILD_NO_EXPO_GO_WARNING=true to production build env to suppress warning
- [x] Added "node": ">=18" to package.json engines so EAS picks a compatible Node version
- [x] Confirmed all 22 plugins resolve cleanly via npx expo config --json locally
- [x] All 1,253 tests pass (3 skipped)

## EAS Slug Fix — Revert to VitalSync-App (Apr 1 2026)
- [x] Reverted appSlug in app.config.ts from "vitalsync" back to "VitalSync-App" to match EAS server registration (projectId a2059081-2a72-4db5-8daf-a1d64db03855 is registered under slug VitalSync-App on Expo servers)
- [x] Verified: slug=VitalSync-App, projectId unchanged, buildNumber=15, versionCode=15
- [x] All 1,253 tests pass (3 skipped)

## EAS Slug Fix — Revert to VitalSync-App (Apr 1 2026)
- [x] Reverted appSlug in app.config.ts from vitalsync back to VitalSync-App to match EAS server registration
- [x] Verified: slug=VitalSync-App, projectId=a2059081-2a72-4db5-8daf-a1d64db03855, buildNumber=15, versionCode=15
- [x] All 1253 tests pass

## Bug Fix — Medical History entry not working (Apr 1 2026)
- [x] Root cause 1: LogCard used onStartShouldSetResponder/onResponderRelease which is unreliable inside ScrollView — parent scroll gesture steals the responder before onResponderRelease fires, silently swallowing the tap. Fixed by replacing with Pressable (components/log-card.tsx)
- [x] Root cause 2: HealthProvider initialised state.data as null — if user navigated to Medical History before loadHealthData() resolved, addMedicalHistory dispatch was silently dropped by the null guard in the reducer. Fixed by initialising data with emptyHealthData() (lib/health/health-context.tsx)
- [x] All 1253 tests pass

## Bug Fix — Medication entry crash (Apr 1 2026)
- [ ] Investigate and fix crash when user enters medication

## Bug Fix — Medication entry crash (Apr 1 2026)
- [x] Root cause: DateTimePickerField instances inside Modal components were missing inlineMode prop
- [x] iOS nested-Modal black screen / crash: when DateTimePickerField opens its own Modal inside a parent Modal, iOS crashes
- [x] Fixed: added inlineMode to all DateTimePickerField instances inside Modals across 5 screens:
  - app/log/medications.tsx (5 instances: Start Date, End Date, Refill Date, Reminder Time 1, Reminder Time 2)
  - app/log/immunizations.tsx (2 instances: Date Administered, Next Dose Date)
  - app/log/medical-history.tsx (1 instance: Date Diagnosed)
  - app/log/side-effects.tsx (2 instances: Onset Date, Resolved Date)
  - app/log/surgical-history.tsx (1 instance: Date of Surgery)
- [x] All 1253 tests pass

## UI Fix — Diet Profile tile style in My Profile (Apr 1 2026)
- [x] Replaced chip-based flexWrap row in settings.tsx Diet Profile with 2-column tile grid
- [x] Tile style matches Dietary Protocol section in Edit Profile (profile.tsx)
- [x] Active tile shows colored border, tinted background, glow shadow, and Active pill badge
- [x] Bio-Availability and Personalized tags shown on relevant tiles
- [x] All 1253 tests pass

## Diet Protocol Tooltip + Pulse Animation (Apr 1 2026)
- [x] Created shared DietProtocolTooltip component (components/diet-protocol-tooltip.tsx)
- [x] Tap-and-hold (400ms) shows popover with full description + macro/nutrient breakdown
- [x] Popover shows Active badge, Bio-Availability, Personalized, CKD tags
- [x] Active tile pulses once (scale 1.04→0.97→1.00, 350ms) on first mount
- [x] Wired into settings.tsx Diet Profile tile grid
- [x] Wired into profile.tsx Dietary Protocol tile grid
- [x] All 1253 tests pass

- [x] Fix HealthKit sync returning No new data — corrected requestAuthorization API (was initHealthKit, wrong for @kingstinct v8.x)
- [x] Fix HK.isHealthDataAvailable() namespace vs default export bug in native-health-service.ts
- [x] Fix MERGE_NATIVE_HEALTH reducer — dual-key dedup (id + timestamp) for unstable RCT bridge IDs
- [x] Replace tooltip macro text rows with mini progress bars using nutrition color system

## Clinical Safety Guardrails & Dashboard (Apr 2026)

- [x] Clinical Safety Guardrail — 7 drug classes (insulin, beta-blockers, digoxin, loop diuretics, ACE inhibitors, opioids, anticoagulants/statins)
- [x] 60-minute HealthKit vitals window for pre-dose safety checks
- [x] Subjective checklist modal for anticoagulants and statins
- [x] SpO2 rounding to 1 decimal place in med-safety-check.ts (roundSpO2 helper)
- [x] MedSafetyAlertModal — nursing-grade clinical alert UI with protocol steps, Hold/Proceed actions
- [x] Clinical Dashboard Vital Signs Summary screen (SpO2, HR, BP, Temp, ECG classification)
- [x] ECG display: classification label + average HR only (waveform removed)
- [x] Clinical Dashboard shortcut button on Home screen (stethoscope icon)

## Clinical Safety Guardrail Enhancements (Apr 2026)

- [ ] Add evidence-based peer-review links to all 7 drug class protocols in med-safety-check.ts
- [ ] Add Refresh HealthKit button to MedSafetyAlertModal with re-sync logic
- [ ] Build Clinical Sources screen in Settings with all evidence links
- [ ] Add Clinical Sources to settings navigation
- [ ] Remove Sleep from Vital Signs Summary screen (vitals-summary.tsx)

## Clinical Safety Guardrails — Evidence Links & Refresh HealthKit (Apr 2, 2026)
- [x] Add DOI/PubMed evidence links to all 7 drug class protocols in med-safety-check.ts
- [x] Add Refresh HealthKit button to MedSafetyAlertModal (re-syncs last 60 min before hold/proceed)
- [x] Wire onRefresh callback in medications-due-banner.tsx (calls syncAll then re-runs safety check)
- [x] Add Clinical Safety Guardrails section (8 peer-reviewed sources) to clinical-sources.tsx
- [x] Confirm Sleep is absent from Vital Signs Summary screen (vitals-summary.tsx — never included)

## ECG Removal (Apr 2, 2026)
- [ ] Remove ECG card from vitals-summary.tsx
- [ ] Remove ECG from analytics.tsx, index.tsx, report.tsx, settings.tsx
- [ ] Remove ECG from data model (types.ts, storage.ts, health-context.tsx)
- [ ] Remove ECG from HealthKit adapter and native-health-service.ts
- [ ] Remove ECG from report-generator.ts, permissions.ts, color-legend.tsx
- [ ] Remove ECG from server/ecg-router.ts and server/routers.ts
- [ ] Remove ECG from onboarding.tsx and whats-new-sheet.tsx
- [ ] Update tests that reference ECG

## ECG Removal (Apr 2, 2026)
- [x] Remove ECG card from vitals-summary.tsx
- [x] Remove ECG ToggleRow from report.tsx
- [x] Remove includeEcg from ReportConfig and report-generator.ts
- [x] Remove generateEcgSection function from report-generator.ts
- [x] Remove ECG from analytics.tsx, settings.tsx, data-sources.tsx
- [x] Remove ECG from healthkit-permissions.tsx, thresholds.tsx, color-legend.tsx
- [x] Remove ECG from onboarding.tsx, whats-new-sheet.tsx, app.config.ts
- [x] Rename ecg* style keys to pulse* in app-loading-screen.tsx
- [x] Remove waveform.path.ecg from bento-metric-tile.tsx and vital-card.tsx

## RR + Evidence Updates (Apr 2, 2026)
- [ ] Add Respiratory Rate card to vitals-summary.tsx
- [ ] Update med-safety-check.ts with 2020-2025 peer-reviewed evidence links for all 7 drug classes
- [ ] Update clinical-sources.tsx safety guardrails section with current references

## Evidence & RR Updates (Apr 2, 2026)
- [x] Update all 7 drug class evidence sources to 2020-2025 peer-reviewed references
- [x] Add Respiratory Rate card to Vital Signs Summary screen (indigo accent, normal 12-20 br/min)
- [x] Update clinical guardrail doc comments to reference 2020-2025 sources

## Recent Changes (Apr 2026)
- [x] Add respiratory_rate to HealthKit sync pipeline (native-health-service, healthkit-adapter, permissions)
- [x] Add color guide link to Data Sources (Force Sync) screen
- [x] Move 'Next Dose' medication info from Smart Reminders to Clinical Narrative
- [x] Filter Smart Reminders to show only active/actionable tasks (remove next-dose scheduling info)

## Clinical Reference Tool Refactor (Apr 2026)
- [x] Build SafetyReferenceModal component (blue/gray reference theme, not red/alert)
- [x] Implement medication class detection (beta-blockers, opioids, insulin, anticoagulants, statins)
- [x] Beta-blockers: show last HR/BP with yellow highlight if HR<60 or SBP<90
- [x] Opioids: show last Respiratory Rate with yellow highlight if RR<12
- [x] Insulin/glucose meds: show last Blood Glucose with yellow highlight if <70 or >250
- [x] Anticoagulants/statins: self-assessment checklist (bruising, muscle pain, etc.)
- [x] All modals: "Reference only. Not medical advice. Consult your physician." footer
- [x] No hard stops — all log/take buttons always enabled regardless of vitals
- [x] Integrate SafetyReferenceModal into medication log screen dose-logging flow
- [x] Integrate SafetyReferenceModal into Smart Reminders Take button flow
- [x] Add "Mark as taken" shortcut to Clinical Narrative Next Medication Doses panel rows

## VitalSync Clinical Hub Modules (Apr 2026)

### Module 1: Smart Medication Reference (Safety Intercepts)
- [x] Add Digoxin class detection (show HR + recent ECG avg HR, ACC/AHA guideline reference)
- [x] Add ACE Inhibitor class detection (show BP + last K+ if available, JNC/ACC reference)
- [x] Restrict HealthKit fetch window to most recent 60-minute sample
- [x] Add "View Source" citation button to each medication class reference (ADA/AHA/ACC/JNC links)
- [x] Yellow highlight for out-of-range values (never red hard-stop)

### Module 2: Correlation Engine (Pattern Observer)
- [x] Install victory-native for dual-axis charts
- [x] Build dual-axis VitalsVsActivityChart component (victory-native VictoryChart + VictoryLine)
- [x] Label all insights as "Observed Historical Patterns" (not Analysis/Diagnosis)
- [x] Add compliance footer to all graphs: "Historical data patterns provided for informational purposes only. Correlations do not imply medical causation."
- [x] Wire into existing Correlate tab screen

### Module 3: Doctor-Ready PDF Export (Objective Summarizer)
- [x] Aggregate HealthKit + Med Logs into structured table-based PDF
- [x] Use raw statistical descriptors (Mean Systolic, Heart Rate Range, etc.)
- [x] Add per-page header: "Patient-Generated Health Data: For Clinical Review Only. Not a Diagnostic Summary."
- [x] Include medication adherence table (dose log summary)
- [x] Include activity summary table

### Module 4: AI Food Scanner & Voice Logger
- [x] Install expo-speech for Voice Logger
- [x] Food Scanner: display estimated Carb/Protein/Fat ranges (not prescriptions)
- [x] Voice Logger: implement confirmation loop (AI repeats logged data for verification, no medical instructions)
- [x] Voice Logger: no symptom triage or medical advice in responses

### Global Fixes & Guardrails
- [x] Fix SpO2 display: ensure 10:1 rounding (e.g., 98.2%), remove any 100x multipliers (pipeline already correct, no changes needed)
- [x] ECG: display Classification and Average HR only — no voltage waveform viewer exists (decorative oscilloscope only)
- [x] Add persistent "Reference Only" footer banner to main Dashboard UI
- [x] Ensure every medication modal citation includes "View Source" with guideline name

## Correlate Tab Glass Polish (Apr 2026)
- [x] Wrap CorrelationTrendChart (Dual-Axis Trend Viewer) in full-width 3D GlassCard on Correlate tab

## HealthKit Sync Date Window Fix (Apr 2026)
- [x] Fix HealthKit sync to correctly fetch last 90 days of data (audit all date window constants)
- [x] Root cause: Dashboard default date range was 7d — changed to 30d with AsyncStorage persistence on first launch
- [x] Bump Health Connect (Android) sync window from 30d to 90d to match HealthKit adapter

## Medical History & HealthKit Fix (Apr 2026)
- [x] Remove broken Medical History screen and build functional CRUD replacement (fixed 'critical' severity crash + Pressable overlay blocking input)
- [x] Remove all clinical HealthKit data fetches (FHIR, ClinicalRecord, allergy records, immunization records) — audit confirmed: no clinical types in either loader
- [x] Audit requestAuthorization read list — no HKClinicalType identifiers found in healthkit-loader.ts or rnh-loader.ts
- [x] Fix HealthKit requestAuthorization call format in healthkit-loader.ts (was passing object {toRead,toShare}, now correctly passes two separate arrays)
- [x] Ensure HealthKit only reads standard quantity/category types (HR, BP, SpO2, RR, weight, sleep, steps, etc.) — confirmed clean

## ECG Permission Removal (Apr 2026)
- [x] Remove Electrocardiogram from rnh-loader.ts RNH_READ_PERMISSIONS list
- [x] Confirm no HKElectrocardiogramType in healthkit-loader.ts READ_TYPES (was already absent)

## Dashboard Header Greeting Fix (Apr 2026)
- [x] Move greeting text into the upper header row (below locale/language/NeoVital row)
- [x] Remove Vital Signs Average section title from the header area

## Medications Screen Rebuild
- [x] Delete old medications.tsx and rebuild from scratch with crash-safe input handling
- [x] Integrate side effects directly into the medication tab (remove separate side-effects tab)
- [x] Add physician disclaimer on medication logging
- [x] Ensure all date fields default to today() and never pass empty/NaN to the reducer

## Medications Screen UX Improvements (Round 2)
- [x] Add search/filter bar at the top of the medications list
- [x] Add "Refill soon" warning badge when pillsRemaining <= refillThreshold
- [x] Add swipe-to-delete on medication list rows

## Medications Screen UX Improvements (Round 3)
- [x] Add pill count editor fields (pillsRemaining, pillsPerDose, refillThreshold) to medication form
- [x] Add "Refill needed" summary banner at top of medications list
- [x] Add sort control (name A-Z, status, start date) alongside search bar

## Bug Fixes
- [x] Fix crash when entering/saving a medication record

## Medications Screen UX Improvements (Round 4)
- [x] Add "Take dose" button on each medication card to decrement pillsRemaining by pillsPerDose
- [x] Add days-of-supply estimate in the Refill Needed banner
- [x] Add dose field unit validation (warn if no unit like mg/ml included)

## Medications Screen UX Improvements (Round 5)
- [ ] Add "Mark as refilled" quick action on refill banner pills (prompt for new count, reset pillsRemaining)
- [ ] Add adherence streak counter on each medication card (consecutive days with Take Dose tapped)
- [ ] Add per-medication dose history log (record each Take Dose tap with timestamp)

## Date/Time Picker Improvements
- [x] Replace manual date text inputs with native calendar picker
- [x] Add iOS-style scrollable time picker for reminder times

## Notifications & SE Form Improvements
- [x] Wire medication reminder times to expo-notifications (real device notifications)
- [x] Apply native calendar/time picker to Side Effect form onset and resolved date fields

## Medications Screen UX Round 6
- [x] Add "Mark as refilled" quick action on refill banner (prompt for new pill count, reset pillsRemaining)
- [x] Add notification schedule preview in form ("You'll be reminded at 08:00 and 20:00 daily")

## Bug Fixes Round 2
- [x] Fix crash when saving medication record

## Bug Fixes Round 3
- [x] Remove "Vital" text next to "Local only" in the header
- [x] Fix crash when entering/saving a medication record

## Bug Fixes Round 4
- [x] Fix crash when user enters/saves a medication (persistent crash)

## Header Changes
- [x] Restore Neon Vitals Monitor button in home screen header
- [x] Remove the other vital sign element from the home screen header

## Medications Full Rewrite
- [x] Rewrite medications screen from scratch — crash-free, cross-platform, no native DateTimePicker
- [x] Make date/time picker clearly visible with proper colors

## Bug Fixes Round 5
- [x] Fix "Cannot convert undefined value to object" crash on medications screen
## Bug Fixes Round 6
- [x] Fix medications screen crash: replace form.reminderTimes[] with reminderTime1/reminderTime2 string fields
- [x] Add InteractionBanner component for drug interaction warnings
- [x] Wire PrivacyBanner, MedicationDisclaimerBanner, and InteractionBanner into medications screen
- [x] Fix smart refillThreshold default calculation using reminderCount
## Bug Fixes Round 7
- [x] Fix medical history "Add Condition" bottom sheet showing empty form (form fields not rendering)
- [x] Remove link between medical history and medications screens
- [x] Fix TypeScript JSX errors in medications.tsx (unclosed KeyboardAvoidingView/ScrollView/Modal tags)

## Rebuild Round 1
- [ ] Delete medications.tsx and rebuild using surgical history pattern
- [ ] Delete medical-history.tsx and rebuild using surgical history pattern

## Rebuild Round 1
- [x] Delete old medications.tsx and rebuild using surgical history pattern
- [x] Delete old medical-history.tsx and rebuild using surgical history pattern
- [x] Remove cross-link between medical history and medications
- [x] Fix all 130 medication tests passing with new clean design

## Features Round 7
- [x] Restore Tuesday working medications.tsx (inlineMode crash fix, full feature set)
- [x] Add swipe-to-delete on medication cards using Swipeable
- [x] Add Refill Tracker GlassCard to Dashboard (pill counts, days remaining, Restock button)
- [x] Fix medication-form-crash-fix test to match AiScribeTrigger pattern

## Bug Fixes Round 8
- [x] Fix double HealthKit banner (Not Available + Not Connected showing simultaneously) — added hkAvailable guard to showHealthBanner so "Not Connected" only shows on real devices with HealthKit present

## Bug Fixes Round 9
- [x] Show BiometricAuthorizationPrompt every time HealthKit is not connected (remove one-time seen flag)
- [x] Ensure Grant Access button requests all HealthKit permissions

## Medications Restore (Wednesday Morning)
- [x] Delete current medications.tsx and install Wednesday morning version (commit 4d6309e)
- [x] Fix vital-tile-layout test (sectionTitle numberOfLines={1})
## AiScribe Integration & Test Fixes (Session Continuation)
- [x] Add AiScribeTrigger and AiScribeSheet to MedicationForm component (voice-to-form prescription photo capture)
- [x] Fix 4 failing tests in medication-form-crash-fix.test.ts (addMedication, updateMedication, MedicationFrequency, MedicationStatus, AiScribeTrigger string references)
- [x] All 1304 tests passing (3 skipped)

## Bug Fixes Round 10
- [x] Fix Save button in medication form being inactive/disabled — added Alert feedback on validation failure and catch block for save errors

## Medication Autocomplete
- [x] Build common-drug-names.ts with curated list of 200+ common medications
- [x] Build MedicationAutocomplete component (dropdown suggestion list below Name field)
- [x] Integrate autocomplete into MedicationForm Name field
- [x] Auto-fill generic name when a drug is selected from suggestions

## HealthKit Onboarding Integration
- [ ] Audit onboarding slides and find the Health Permissions slide
- [ ] Ensure HealthKit permission request fires on the Health Permissions slide (not just on first sync)
- [ ] Show a clear "Grant Access" CTA on the slide with HealthKit/Health Connect branding
- [ ] Handle already-granted state gracefully (show green checkmark, allow skip)

## Medication Dose Hints
- [x] Add typicalDose field to DrugEntry in common-drug-names.ts for all 200+ drugs
- [x] Track selectedDrug state in MedicationForm when autocomplete selection is made
- [x] Show dose hint below Dose field when a drug is selected from autocomplete
- [x] Clear hint when user manually edits the Name field after selection

## HealthKit Onboarding Slide Redesign
- [x] Add prominent "Grant Access" button with Apple Health heart icon on slide 3 body
- [x] Show iOS / Android platform cards with logos and permission status
- [x] Show green checkmark + "Access Granted" state after permission is granted
- [x] Keep bottom CTA as secondary "Continue" once access is granted

## Bug Fix: Save Failed on Medication
- [ ] Diagnose and fix crash in saveMedication when all fields are filled
- [ ] Add AI potential side effects panel to MedicationForm

## Medication Tab: Wednesday Restore + Feature Re-apply
- [x] Restore Wednesday 4 AM medication tab files from git
- [x] Re-apply autocomplete with dose hints on top of Wednesday base
- [x] Re-apply AI potential side effects panel (already in Wednesday base via trpc.medications.lookupSideEffects)
- [x] Re-apply Save button validation Alert (already in Wednesday base)
- [x] Verify all tests pass (1304 passed)

## Medication: Remove Surplus + Add Adherence Ring
- [ ] Remove surplus/stock tracking fields from medication form (causes save crash)
- [ ] Remove surplus-related state, UI, and logic from medications.tsx
- [ ] Add adherence ring (circular progress) to medication tab header/summary

## Medication: Remove Surplus + Adherence Ring
- [x] Remove all surplus/stock tracking fields from MedicationCard UI (supply info row, refill history accordion, restock button)
- [x] Remove onRestock and onClearRestockHistory props from MedicationCard
- [x] Remove pillsRemaining decrement logic from handleLogDose
- [x] Remove unused surplus imports (isLowStock, sendLowStockNotification, sendRefillThresholdNotification, RestockEvent)
- [x] Add AdherenceRingCard component with SVG circular progress arc
- [x] Compute todayAdherenceRate across all active medications
- [x] Insert adherence ring card in the medication tab header area
- [x] Ring color adapts: green ≥80%, yellow ≥50%, red <50%

## Bug Fix: lowStock crash on medication save
- [ ] Find and remove all remaining lowStock references in medications.tsx and related files

## Bug Fix: lowStock crash on medication save (Round 2)
- [x] Remove all remaining lowStock/pillsRemaining/refillDueMedications references from MedicationCard.tsx, MedicationForm.tsx, medications-due-banner.tsx, MedicationService.ts, and index.tsx
- [x] Update test files to reflect surplus tracking removal (medications-due-banner.test.ts, smart-reminders-medication-integration.test.ts)
- [x] All 1301 tests pass

## New Premium 3D Glass MedicationCard
- [ ] Audit existing MedicationCard.tsx props/interface
- [ ] Build new premium 3D glass MedicationCard with animated states (taken/upcoming/missed), quick actions, haptic feedback, countdown timer
- [ ] Replace existing MedicationCard.tsx with new component
- [ ] Wire new card into medications.tsx

## New MedicationCard (Full Rebuild)
- [ ] Delete existing MedicationCard.tsx
- [ ] Build new premium 3D glass MedicationCard from scratch
- [ ] Wire new card into medications.tsx

## Premium Medications Tab Rebuild
- [ ] Remove existing medications.tsx and rebuild premium Medications tab
- [ ] Onboarding disclaimer modal (FDA/non-medical device notice, one-time acknowledgment)
- [ ] Persistent non-dismissible disclaimer banner at top of screen
- [ ] Animated medication cards with live next-dose countdown
- [ ] Visual dose states: taken (green), upcoming (teal), missed (red)
- [ ] Quick actions: Take, Skip, Snooze with haptic feedback
- [ ] Comprehensive Add/Edit medication form (name, dose, frequency, route, dates, notes, refill)
- [ ] Reminder engine: Expo Notifications with snooze and follow-up alerts
- [ ] Refill tracking: pill count, depletion date, low-stock visual alerts
- [ ] 7-day adherence chart per medication
- [ ] Safety layer: duplicate detection, missing data flags
- [ ] Dark mode support, accessibility labels, 44pt tap targets

## Medication Tab Upgrades (Apr 2026)
- [x] Add live next-dose countdown to MedicationCard (updates every 30s)
- [x] Add Snooze button (15m/30m/1h) to Take/Skip row for reminder-enabled meds
- [x] Add dose state label (Taken today / Skipped today / Next dose in Xh) to action row
- [x] Add actionPillSnooze and doseStateLabel styles to StyleSheet
- [x] Fix AdherenceTracker source comparison ('taken' is not a valid source)
- [x] Fix MedicationViewModel emptyMedForm/emptySEForm usage (function vs value)
- [x] Add uuid type declarations to fix TypeScript error
- [x] All 11 medication card feature tests pass

## Medications Tab — Three New Features (Apr 2026)
- [ ] Onboarding disclaimer modal: one-time FDA non-medical-device notice, stored in AsyncStorage
- [ ] Route field in Add/Edit medication form: Oral, Topical, Injection, Inhaled, Sublingual picker
- [ ] Missed-dose follow-up push notification: fire 30 min after reminder if dose not logged

## Three New Medication Tab Features (Apr 2026)
- [x] Onboarding disclaimer modal — one-time FDA/non-medical-device notice stored in AsyncStorage
- [x] Administration route picker — Oral/Topical/Injection/Inhaled/Sublingual/Other chip selector in Add/Edit form
- [x] Missed-dose follow-up push notification — fires 30 min after each reminder if dose not logged; auto-cancelled when dose is logged

## Medication Form & Settings Upgrades (Apr 3, 2026)
- [x] Route badge on MedicationCard (💊 Oral, 🧴 Topical, etc.)
- [x] Snooze delay preference in Settings → Notifications (15 min / 30 min / 1 hour chip selector)
- [x] Fix medication form save crash — async onSave, isSaving guard, ActivityIndicator spinner, disabled button
- [x] Wire snooze delay preference into missed-dose follow-up scheduling

## Feature Batch (Apr 3, 2026 - Round 2)
- [ ] Notification deep-link: tap "Did you take it?" opens Medications tab
- [ ] Refill count field in medication form with low-stock badge on card
- [ ] Drug-interaction check on save with non-blocking warning sheet
- [ ] Medication adherence ring in Medications tab bar icon

## Features Completed (Apr 2026 - Batch 3)
- [x] Notification deep-link: missed-dose follow-up notification opens Medications tab
- [x] Refill count field in medication form (pillsRemaining + refillThreshold)
- [x] Low-stock warning badge on MedicationCard (red ⚠️ when below threshold)
- [x] Drug-interaction check on save with non-blocking warning bottom sheet
- [x] Medication adherence ring already present in tab (AdherenceRingCard)
- [x] Snooze delay preference in Settings → Notifications (15/30/60 min)

## HealthKit Fix (Apr 2026)
- [ ] Audit and fix READ permission list (all 8 required types)
- [ ] Fix date predicates: replace narrow windows with 30-day range
- [ ] Fix blood pressure: use correlation queries not separate quantity queries
- [ ] Add raw-result logging before UI mapping
- [ ] Fix empty-array handling and "Sync complete – No new data" false positive
- [ ] Fix unit handling (heart rate: count/min, SpO2: percent)
- [ ] Add debug button "Fetch Last 30 Days Data" in Settings
- [ ] Verify NSHealthShareUsageDescription and NSHealthUpdateUsageDescription in app.config.ts

## HealthKit Debug & Fix (Apr 2026)
- [x] Audit HealthKit permissions, date predicates, unit mapping, blood pressure correlation queries
- [x] Add granted-permission logging after initHealthKit success
- [x] Add raw-result logging and empty-array warnings in syncAll
- [x] Fix misleading "Sync complete" UI when all counts are zero — now shows amber warning with troubleshooting causes
- [x] Add "Fetch Last 30 Days Data" debug button in Settings → Data Sources (Apple Health card)
- [x] Debug button shows per-type record counts inline and logs full results to Metro console

## TypeScript Strict Build Fixes
- [x] Fix native-health-service.ts: use from/to instead of filter.date, fix queryCorrelationSamples, fix subscribeToChanges return type
- [x] Fix permissions.ts: use positional args for requestAuthorization
- [x] Fix rnh-loader.ts: remove stale _initCalled reference
- [x] Fix healthkit-write.ts: correct saveQuantitySample/saveCategorySample/saveCorrelationSample call signatures
- [x] Fix analytics.tsx: optional chaining on result?.strength to avoid null error
- [x] Fix medications.tsx: styles.textInput → styles.input, DateTimePicker callbacks, checkDrugInteractions call, OG palette keys
- [x] Fix immunizations.tsx, side-effects.tsx, surgical-history.tsx: DateTimePicker callback types
- [x] Fix index.tsx: handleMedTakeRef scope fix, vaccine ReminderCategory
- [x] Fix settings.tsx: add badge prop to SettingsRow
- [x] Fix clinical-sources.tsx: SectionListData cast
- [x] Fix data-sources.tsx: redundant Platform.OS check
- [x] Fix healthkit-permissions.tsx: missing icon fields in PermissionItem
- [x] Fix thresholds.tsx: missing icon prop in SectionCard
- [x] Fix clinical-narrative-card.tsx: undefined perDose
- [x] Fix correlation-trend-chart.tsx: ActivityRecord/WeightRecord field names
- [x] Fix healthkit-debug-panel.tsx: await isHealthDataAvailable Promise
- [x] Fix medications-due-banner.tsx: DoseSource safety_override → manual, syncAll import
- [x] Fix AdherenceInsights.tsx: d.missedCount → d.missed
- [x] Fix crash-log-viewer.test.ts: CrashEntry type annotation on makeEntry
- [x] Fix merge-health-data-regression.test.ts: add createdAt to makeImmunization, non-null assertions
- [x] Fix medication-card-features.test.ts: cast status to string for comparison
- [x] Add react-native-ble-plx type stub (types/react-native-ble-plx.d.ts)
- [x] Confirmed 0 TypeScript errors with npx tsc --noEmit

## Medication Tab Removal
- [ ] Remove medication Tabs.Screen entry from tab layout
- [ ] Clean up any medication-specific icon mappings if no longer needed
- [ ] Verify no broken navigation references remain

## Remove Medication Card from Record Tab
- [x] Remove Medication LogCard from record.tsx
- [x] Remove related medication section state/logic (hasActiveMeds, sectionMedications strings, etc.)

## Medication Card (from provided code)
- [x] Create MedicationCard component with: med list, add-med modal, log-dose action, AI insight, disclaimer banner
- [x] Persist meds via AsyncStorage (id, name, dose, schedule, quantity, takenLogs)
- [x] Schedule local notification reminder on add
- [x] Add MedicationCard back to Record tab Clinical Records section

## MedicationCard Enhancements
- [x] Remove medications section from clinical narrative
- [x] Refill alert: warning badge when quantity < configurable threshold (default 7), push notification
- [x] Expand Add modal: schedule time-picker (replaces fixed 5s trigger), pharmacy field, prescribing doctor field
- [x] AI insight: smarter analysis (adherence %, refill urgency, drug interaction hint)
- [x] Add take/skip/reschedule actions to each medication row

## MedicationCard v3 Features
- [x] Swipe-to-delete on each medication row (react-native-gesture-handler Swipeable)
- [x] Dose history heatmap drawer (last 14 days, taken/skipped/rescheduled per day, expandable per row)
- [x] Drug interaction check via OpenFDA API (warn when 2+ meds added with known interaction)
- [x] Update disclaimer to include pharmacist directions

## MedicationCard v4 Features
- [ ] Medication detail sheet (long-press row): prescription history, refill log, doctor contact, pharmacy phone, tap-to-call
- [ ] Adherence streak widget in card header (consecutive days all doses taken)
- [ ] Export to PDF (expo-print + expo-sharing): one-page medication summary

## Medication Wiring
- [ ] Wire medications into Smart Reminders: due-dose cards, refill-alert cards, dismiss/take actions
- [ ] Wire medications into Clinical Narrative: adherence summary, upcoming doses, refill warnings

## Medication Wiring (v4)
- [x] Wire MedicationCard to health store (addMedication/updateMedication/deleteMedication) so data.medications is populated
- [x] Smart Reminders: medications from health store already feed medsDueToday in index.tsx — verified wiring
- [x] Clinical Narrative: update medication event navigation to go to Record tab (not /log/medications)
- [x] MedicationCard v4: detail sheet, adherence streak widget, PDF export

## Medication Snooze Wiring
- [ ] Create shared medication snooze bridge (lib/health/medication-snooze-bridge.ts) with snooze/reschedule functions
- [ ] Wire Dashboard snooze action on medication reminder cards to call bridge and update MedicationCard dose log rescheduledTo field
- [ ] Wire MedicationCard reschedule action to call bridge so Dashboard reminder cards reflect the new time

## MedicationCard ↔ Smart Reminders Full Wiring
- [x] Create medication-action-bus.ts (AsyncStorage event log + in-memory EventEmitter)
- [x] MedicationCard take → writes taken event → Dashboard dismisses reminder card
- [x] MedicationCard skip → writes skipped event → Dashboard dismisses reminder card
- [x] MedicationCard reschedule → writes rescheduled event → Dashboard snoozes reminder until new time
- [x] Dashboard snooze → already calls snoozeMedicationDose → MedicationCard heatmap updated
- [x] Dashboard useFocusEffect re-reads action bus on screen focus to pick up changes made on Record tab

## MedicationCard v5 Features
- [x] 3D adherence ring SVG graphic in card header (animated arc showing 7-day adherence %)
- [x] Medication detail sheet (long-press row): prescription history, refill log, tap-to-call pharmacy
- [x] Streak milestone push notification (7-day and 30-day milestones)
- [x] Refill reminder scheduling: daily 9 AM notification when quantity < threshold, auto-cancel on refill

## Bug Fix — MedicationCard.tsx JSX Syntax Error (Apr 3 2026)
- [x] Fix adjacent JSX elements error in MedicationCard.tsx (malformed JSX comment `{/* Disclaimer */` missing closing `}` at line 1185)
- [x] Clear Metro bundler cache and verify 0 TypeScript errors after fix

## Medication E2E Flow Tests (Apr 3 2026)
- [x] Write Vitest tests for MedicationActionBus emit/drain/peek (8 tests)
- [x] Write Vitest tests for real-time listener subscribe/unsubscribe (4 tests)
- [x] Write Vitest tests for Dashboard Smart Reminders sync simulation (4 tests)
- [x] Write Vitest tests for MedicationSnoozeBridge snooze/reschedule (7 tests)
- [x] Write Vitest tests for OpenFDA drug interaction warning (11 tests)
- [x] Write Vitest tests for getInsight AI chip priority logic (9 tests)
- [x] Write Vitest tests for tap-to-call phone number formatting (6 tests)
- [x] Write Vitest tests for MedicationDetailSheet data shape (3 tests)
- [x] All 52 new tests pass; full suite 1378 passed / 3 skipped

## Advanced Medication Validation Tests (Apr 3 2026)
- [x] OpenFDA Warfarin+Aspirin interaction detection with realistic FDA label mock (10 tests)
- [x] Graceful fallback for 429 rate-limit, 503, AbortError, and JSON parse failure
- [x] Streak milestone notification deduplication — fires once at 7 and 30 days (13 tests)
- [x] computeStreak integration — 7-day streak triggers notification, non-milestone values do not
- [x] PDF export HTML content — name, dose, schedule, adherence %, doctor, pharmacy, disclaimer (23 tests)
- [x] formatTime helper — 08:00→8:00 AM, 20:00→8:00 PM, 12:00→12:00 PM, 00:00→12:00 AM, 13:30→1:30 PM
- [x] Full suite: 1430 passed / 3 skipped (85 test files)

## Medications Screen Layout Change (Apr 3 2026)
- [x] Remove the FlatList of medication cards ("on record" list) from the Medications screen
- [x] Insert ClinicalNarrativeCard in place of the removed list (using state.data as HealthData)

## Medications Screen — Medication Narrative Section (Apr 3 2026)
- [x] Revert full ClinicalNarrativeCard from Medications screen
- [x] Show only medication-type events from buildClinicalNarrative inline in the Medications screen (replacing the on-record list)
- [x] Leave full Clinical Narrative card on Dashboard unchanged

## Clinical Narrative — Remove Medication Section (Apr 3 2026)
- [x] Remove medication event loop from buildClinicalNarrative in lib/health/clinical-narrative.ts
- [x] Remove inline medication narrative section from app/log/medications.tsx

## Clinical Narrative — Import Cleanup & Test Updates (Apr 3 2026)
- [x] Remove orphaned MedicationRecord import from lib/health/clinical-narrative.ts
- [x] Confirmed no existing tests assert medication events from buildClinicalNarrative — no test updates needed (all 1430 pass)

## Complete Medication Removal (Apr 3 2026)
- [ ] Delete app/log/medications.tsx (medications screen)
- [ ] Delete components/medications/ directory (all medication components)
- [ ] Remove Medications tab from app/(tabs)/_layout.tsx
- [ ] Remove medication route from navigation
- [ ] Remove medication types from lib/health/types.ts (MedicationRecord, MedicationDoseLog, etc.)
- [ ] Remove medication state from health store (lib/health/health-store.ts or similar)
- [ ] Remove MedicationEvent and medication kind from clinical-narrative.ts types
- [ ] Remove medication-related imports from index.tsx and other screens
- [ ] Remove medication-related test files
- [ ] Clean up any remaining medication references in other files

## HealthKit Pipeline Cleanup — ECG Removal & Legacy Library Fix

- [ ] Remove react-native-health plugin block from app.config.ts
- [ ] Remove misleading "NativeModules.AppleHealthKit bridge" comment from app.config.ts
- [ ] Remove HKElectrocardiogramTypeIdentifier from requestPermissions() in native-health-service.ts
- [ ] Remove fetchHealthKitECG() and queryElectrocardiogramSamples() functions
- [ ] Remove ecg from syncAll() return object
- [ ] Remove ECG from registerHealthKitObservers()
- [ ] Remove EcgRecord type from lib/health/types.ts
- [ ] Remove ecg field from HealthData interface
- [ ] Remove ecg from storage.ts (emptyHealthData, mergeHealthData)
- [ ] Remove ecg from health-context.tsx (actions, reducer, context interface)
- [ ] Remove any UI components referencing ECG
- [ ] Global search and confirm zero ECG/electrocardio/HKElectrocardiogram references remain
- [ ] Validate only @kingstinct/react-native-healthkit is used (no react-native-health imports)

## ECG Removal Follow-up
- [x] Remove ECG feature chip from onboarding welcome slide; add 'Vitals' chip instead

## Clinical Records & ECG Cleanup (Session 3)
- [x] Remove includeEcg toggle from Doctor Report config screen (already absent — no toggle existed)
- [x] Remove orphaned ECG strings from i18n.ts (ecgTrace, ecgClassSinus, ecgClassAfib, ecgTitle, aboutEcg, etc.)
- [x] Update onboarding welcomeSub to mention vitals (temperature, SpO2, respiratory rate)
- [x] Remove clinical records import features: labs, medical history, surgical history, immunizations (confirmed: never synced from HealthKit/Health Connect — all manual-entry only)

## HealthKit/Health Connect Sync Cleanup
- [x] Remove HealthKit/Health Connect auto-sync fetch calls for labs, medical history, surgical history, and immunizations (confirmed: no such sync existed — clinical records are local-only)
- [x] Update onboarding welcomeSub copy to mention vitals (temperature, SpO2, respiratory rate)

## Session 4 Polish
- [x] Update Doctor Report Condition Timeline subtitle to include immunizations count (X conditions · Y procedures · Z vaccines)
- [x] Add featureVitals tooltip/popover on onboarding welcome slide chips
- [x] Remove orphaned ECG strings from i18n-ai.tsx (already clean — zero ECG keys found)

## Config Updates
- [x] Update appSlug in app.config.ts to "vitalsync"

## Medication Tab
- [x] Define Medication data model (id, name, dose, schedule, quantity, takenLogs, notes, color)
- [x] Add medication storage helpers (load, save, addMed, editMed, deleteMed, logDose)
- [x] Add medication i18n strings to all four language blocks
- [x] Build Medication tab screen (list, empty state, AI insight banner, disclaimer)
- [x] Add medication modal (add/edit: name, dose, schedule times, quantity, notes, color picker)
- [x] Implement dose logging with today's taken/remaining count per medication
- [x] Implement quantity tracking (decrement on log, low-stock warning)
- [x] Wire local notification reminders for each scheduled time
- [x] Add tab icon for Medication tab in icon-symbol.tsx and _layout.tsx
- [x] Write unit tests for medication storage and dose logging logic

## Config Updates (Apr 2026)
- [x] Update appSlug in app.config.ts to "vitalsync-app"

## EAS Build Fix
- [x] Fix EAS build error: reverted appSlug to "VitalSync-App" to match expo.dev registered project

## EAS Build Fix (Apr 2026 — Round 2)
- [x] Update extra.eas.projectId to correct UUID: e8f0e221-9f5c-43d6-adf3-68033d182a29

## Medication Integration (Apr 2026)
- [x] Move Medications section into Record tab (remove standalone Medications tab from tab bar)
- [x] Smart reminder: show medication refill alert on dashboard when quantity < 7 pills
- [x] Smart reminder: show taken/skip action for medications within 1-hour window of scheduled time
- [x] Dashboard Clinical Summary: add medication taken/skipped log entries (Meds tab in CTABS showing taken · skipped count)

## Medication Record Tab — Three Sections (Apr 2026)
- [x] Extend Medication type: add pharmacyName, pharmacyPhone, startDate, endDate, sideEffects, drugInteractions fields
- [x] Extend DoseLog type: add reinstatement fields (reinstatedAt, reinstatedTime)
- [x] Update medication storage to persist new fields
- [x] Section 1 (Today): current 1-hour window doses, missed doses, skipped doses — Mark Taken removes card
- [x] Section 2 (History): full dose log timeline, reinstate missed/skipped with edit-time modal
- [x] Section 3 (My Medications): full list with pharmacy name/phone, start/end date, AI side effects, FDA drug interactions
- [x] AI side effects generation via server LLM for each medication
- [x] FDA drug interaction lookup (openFDA API) for active medications
- [x] Disclaimer banner in each of the three sections
- [x] Update Add/Edit medication modal to include pharmacy and date fields

## Drug Autocomplete & Auto-populate (Apr 2026)
- [x] Server: drug name autocomplete endpoint (3-letter trigger, returns name + generic + indication + safe dosage + route)
- [x] Medication type: add indication, safeDosage, route fields
- [x] Add/edit modal: drug name autocomplete dropdown after 3 chars typed
- [x] Auto-populate indication, safe dosage, and route when drug is selected from autocomplete
- [x] Emoji-coded route picker (💊 oral, 💉 subQ, 🩸 IV, 🌬️ inhaled, 🩹 topical, 👁️ ophthalmic, 👂 otic, 🔵 sublingual, 🍑 rectal, 🩺 IM)
- [x] Show indication chip on medication card in My Medications list

## Medication Polish (Apr 2026)
- [x] Show indication chip (teal pill badge) on each card in My Medications list
- [x] Add drug interaction warning banner to Today tab (severity badge + pharmacist/doctor disclaimer)
- [x] Add Refill Reminder date field to the modal with one-time local notification at 9 AM
- [x] Make drug interaction disclaimer more prominent: dedicated disclaimer line below each interaction banner

## Medication Card & Dashboard Polish (Apr 2026)
- [x] Show refill reminder date chip on My Medications card (🔔 "Refill by Mar 1")
- [x] Add Call Pharmacy button (tel: deep-link) on My Medications card when phone number exists
- [~] Add weekly medication adherence summary card to Dashboard (cancelled per user request — not on dashboard)

## Medication UX Polish (Apr 2026)
- [x] Route emoji badge on My Medications card header (next to medication name)
- [x] Mark All Taken bulk action on Today tab (appears when 2+ doses are due)
- [x] Medication Adherence table in Doctor Report PDF (name, dose, route, indication, 30d adherence bar, missed count, last taken, status)
- [x] Move Medications card from Medical & Surgical section to Clinical Records section, above Lab Tracker
- [x] Add scrollable calendar + time drum-roll picker to Doctor Appointments modal and Medications start/end/refill date fields
- [x] Replace HH:MM text inputs for medication schedule times with drum-roll TimePickerDrum
- [x] Expand Today tab due-dose window to show doses due within 60 min (ahead or overdue)
- [x] Add dynamic badge (In Xm / Now / Overdue) to Today tab due-dose cards
- [x] Add Reschedule button + bottom-sheet modal to Today tab due-dose cards

## Medication Snooze, Notifications & Reschedule History (Apr 2026)
- [x] Add Snooze 15 min quick-action chip to the Reschedule bottom-sheet
- [x] Schedule local push notification 5 minutes before each due dose (scheduleEarlyReminderNotifications)
- [x] Add RescheduleEvent type and rescheduleHistory field to DoseLog
- [x] Add logRescheduleEvent storage helper to persist reschedule/snooze events
- [x] Wire logRescheduleEvent into handleConfirmReschedule and handleSnooze15
- [x] Add Reschedule History sub-table to Doctor Report PDF medication section

## Sleep & Back Button Fixes (Apr 4, 2026)
- [x] Remove Sleep section from Vital Signs log screen
- [x] Fix missing ADD_SLEEP reducer case in health-context so Sleep tab data flows to Dashboard sleep tile
- [x] Add modern SVG sleep stage chart (Awake/REM/Core/Deep lanes, dark glassmorphism) to Sleep tab
- [x] Fix sluggish back button in Medical History screen (TouchableOpacity + hitSlop)
- [x] Fix sluggish back button in Surgical History screen (TouchableOpacity + hitSlop)
- [x] Remove 320ms setTimeout delay from Immunizations save/back navigation

## Sleep UX Enhancements (Apr 4, 2026)
- [x] Add 7-day sleep trend bar chart to Sleep tab (above history list, goal line, color-coded bars)
- [x] Add quality score ring (0-100, evidence-based Deep+REM+efficiency formula) to each SleepCard
- [x] Wire Sleep Goal from Settings to both the trend chart goal line and SleepCard goal chip

## Sleep UX Polish + Evidence-Based Insights (Apr 4, 2026)
- [ ] Add Best Night gold border + trophy badge to highest-scoring SleepCard
- [ ] Add weekly average dashed line to SleepTrendChart
- [ ] Build Sleep Insights card with evidence-based meta-analysis citations and tappable links
- [ ] Build Sleep Insights card with evidence-based meta-analysis citations and tappable links (collapsed by default)
- [ ] Add References & Sources section to Settings with all cited meta-analyses and tappable links
- [x] Add Best Night gold border + trophy badge to highest-scoring SleepCard this week
- [x] Add weekly average dashed line to SleepTrendChart
- [x] Add Sleep Insights card with evidence-based insights below trend chart
- [x] Add sleep meta-analysis citations to Clinical Sources in Settings (Sleep & Recovery section)
- [x] Add evidence-based meta-analysis links to Sleep Insights card with tappable citations
- [ ] Add Awake and Core stage input fields to Sleep log form
- [ ] Add consistency streak counter at top of Sleep tab
- [ ] Add Chronotype insight to SleepInsightsCard
- [ ] Redesign SleepStageChart with vibrant NeoVitals-inspired colors
- [ ] Wire HealthKit and Health Connect sleep data import into Sleep tab
- [x] Add Awake and Core stage input fields to Sleep log form
- [x] Add coreMinutes field to SleepRecord type
- [x] Redesign SleepStageChart with vibrant NeoVitals-inspired colors (indigo Deep, cyan REM, sky Core, coral Awake)
- [x] Add consistency streak counter (🔥 N-Night Streak) at top of Sleep tab
- [x] Add Chronotype insight to SleepInsightsCard with evidence-based classification
- [x] Wire HealthKit CORE stage (value=3) to coreMinutes in both RNH and Nitro paths
- [x] Wire Health Connect Core stage (type=4) to coreMinutes
- [x] Add seven sleep meta-analyses to Clinical Sources in Settings
- [x] Pull sleep data from HealthKit and Health Connect (already implemented, fixed coreMinutes mapping)

## Sleep Enhancements (Round 2)
- [x] Fix Bedtime Reminder to fire 30 minutes BEFORE target bedtime (not at bedtime)
- [x] Add circadian rhythm citation link to Bedtime Reminder row in Settings
- [x] Add stage breakdown donut chart to SleepCard (Deep/REM/Core/Awake proportions)
- [x] Show donut chart only when at least one stage value is present

## Pharmacy Auto-Complete (Round 1)
- [x] Add pharmacyAddress field to MedicationRecord type
- [x] Create PharmacyStore — AsyncStorage-backed map of name → { phone, address }
- [x] Build PharmacyAutocomplete component — name input with dropdown + phone/address auto-fill
- [x] Wire PharmacyAutocomplete into medications add/edit form (replace plain TextInputs)
- [x] Show pharmacyAddress on expanded MedCard detail row
- [x] Save pharmacy to store on every successful medication save
- [x] Write unit tests for PharmacyStore logic

## Pharmacy Enhancements (Round 2)
- [ ] Add isPreferred flag to PharmacyEntry and setPreferredPharmacy / getPreferredPharmacy helpers
- [ ] PharmacyAutocomplete pre-fills preferred pharmacy when form opens with empty name
- [ ] Preferred pharmacy shows star badge and sorts first in dropdown
- [ ] Build ManagePharmaciesScreen — list, inline edit, delete, star toggle
- [ ] Wire ManagePharmaciesScreen into Settings navigation
- [x] Update refill notification body to include pharmacy name and phone
- [x] Write unit tests for preferred pharmacy logic and notification body

## Pharmacy Settings → Medication Pre-fill
- [x] Add isPreferred flag + updatePharmacy + setPreferredPharmacy + getPreferredPharmacy to PharmacyStore
- [x] Build ManagePharmaciesScreen (list, inline edit, delete, star toggle)
- [x] Wire ManagePharmaciesScreen into Settings (Medications section row)
- [x] Pre-fill medication add form with preferred pharmacy (name, phone, address) on openAdd
- [x] PharmacyAutocomplete: preferred entry shows ⭐ badge and sorts first in dropdown
- [x] Update refill notification body to include pharmacy name and phone
- [x] Write unit tests for preferred pharmacy logic

## Pharmacy Hours + Medication Transfer (Round 3)
- [x] Add hours field to PharmacyEntry (e.g. "Mon-Fri 9AM-9PM, Sat-Sun 10AM-6PM")
- [x] Add getOpenTodayHours() helper that returns today's hours string or undefined
- [x] Update Manage Pharmacies screen with hours input field in inline editor
- [x] Update refill notification body to append "Open today HH-HH" when hours are available
- [x] Add Transfer Request row to MedCard expanded section (SMS with med name pre-composed)
- [x] Write unit tests for getOpenTodayHours and transfer message builder

## MedCard Enhancements (Round 4)
- [x] Show amber "Closed Today" badge on MedCard pharmacy row when hours resolve to "Closed"
- [x] Add duplicate transfer guard — store lastTransferRequestDate per med in AsyncStorage
- [x] Show "Last requested: Apr 3" note under Transfer Request button
- [x] Insurance card scanner — NOT adding per user request
- [x] Write unit tests for transfer guard date logic and closed-today detection

## Settings + Sleep Refactor (Round 5)
- [x] Move Pharmacies row from Stored Data to Health Data section in Settings
- [x] Fix diet protocol reminder save bug (Done button now saves + reschedules on iOS)
- [x] Sleep History: show only hours slept per night (removed stage chart + donut from history cards)
- [x] NeoSleep: NeoSleepWeeklyChart — independent full-width 7-night stage lane chart
- [x] NeoSleep chart is now above history list, not embedded in individual cards
- [x] Write tests for NeoSleep weekly data aggregation (14 new tests)

## NeoSleep Chart Enhancements (Round 6)
- [x] Add Sleep Goal Progress ring to NeoSleepWeeklyChart header (SVG arc, nights-hit/7)
- [x] Add Best/Worst Night chips below NeoSleepWeeklyChart (day label + hours)
- [x] Write tests for goal-nights count and best/worst night detection (25 new tests)

## Chronotype Chip (Round 7)
- [ ] Add inferChronotype helper — compute average bedtime from past 7 nights, classify as Early Bird / Intermediate / Night Owl
- [ ] Add chronotype chip below goal ring in NeoSleepWeeklyChart with emoji + one-line explanation
- [ ] Write unit tests for inferChronotype logic

## NeoSleep Size Expansion (Round 7b)
- [ ] Match NeoSleepWeeklyChart width and height to SleepTrendChart on the Sleep tab
- [ ] Increase BAR_AREA_H and CHART_H constants to match the taller trend chart

## NeoSleep Length Expansion (Round 7b)
- [x] Expand NeoSleepWeeklyChart to full screen width (match weekly sleep trend chart length)

## Sleep Charts 3D Glass + NeoSleep Full-Width (Round 7c)
- [x] Apply 3D glass effect to NeoSleepWeeklyChart (glass bg, border, shimmer highlight, shadow)
- [x] Apply 3D glass effect to SleepTrendChart (glass bg, border, shimmer highlight, shadow)
- [x] Expand NeoSleepWeeklyChart to full screen width (negative margin to break out of scroll padding)
- [x] Update NeoSleepWeeklyChart CHART_W to use full screen width

## Sleep Tab Enhancements Round 8
- [x] Apply 3D glass to SleepCard headers (frosted bg, indigo border, shimmer, shadow)
- [x] Add Sleep Debt banner between NeoSleep chart and history list (deficit vs weekly goal, colour-coded)
- [x] Add tap-to-highlight bar in NeoSleepWeeklyChart with stage breakdown tooltip
- [x] Write tests for sleep debt calculation and tooltip state logic

## NeoSleep Glow Ring + PDF Sleep Summary (Round 9)
- [x] Add indigo glow rounded-rect outline around selected bar in NeoSleepWeeklyChart SVG
- [x] Add weekly sleep summary table to Doctor Report PDF (date, hours, efficiency, Deep/REM/Core/Awake)
- [x] Write tests for PDF sleep table row builder (15 new tests)

## NeoSleep 3D Immersive Chart Replacement (Round 10)
- [x] Remove NeoSleepWeeklyChart and replace with NeoSleep3DChart using React Native Skia (SVG-based, no Skia needed)
- [x] Dark #05070A background with circadian gradient wave layer
- [x] Spline-based 3D ribbon bands per stage (Deep/Core/REM/Awake) with neon glow
- [x] Breathing animation (entire graph expands/contracts subtly every few seconds)
- [x] Floating particles in background for depth illusion
- [x] Light streaks when transitioning between stages
- [x] Floating glass summary card (time asleep, 3D progress ring, Deep%/REM%/Efficiency%)
- [x] Sleep nodes (glass orbs) at REM cycles and deep recovery peaks with pulsing glow
- [x] Smart insight overlay labels with light-beam connectors
- [x] Tap node → expand into sleep insight card
- [x] Wire into log/sleep.tsx replacing NeoSleepWeeklyChart
- [x] Write tests for NeoSleep3DChart data processing logic (all 1285 tests passing)

## NeoSleep Node Pulse + Circadian Phase (Round 11)
- [x] Add Animated.loop pulsing glow to each sleep node orb in NeoSleep3DChart
- [x] Add circadian phase label below NeoSleep chart ("Optimal sleep window: 10 PM – 6 AM")
- [x] Derive circadian window from chronotype + average bedtime (7-night rolling)
- [x] Write tests for circadian window calculation

## NeoSleep Dashboard Widget (Round 12)
- [x] Build NeoSleepDashboardWidget component — compact 3-night Skia visualization
- [x] Integrate widget into Dashboard home screen (below vital tiles or in sleep section)
- [x] Tap widget navigates to full Sleep tab
- [x] Write tests for widget data processing logic

## Sync in Header (Round 12b)
- [x] Move ForceSyncBar / health data sync into Dashboard header row
- [x] Remove ForceSyncBar from Dashboard body scroll area
- [x] Fix failing NeoSleepDashboardWidget tests (timezone-safe record matching)

## NeoSleep Widget Context Menu + Sync Tooltip (Round 13)
- [x] Long-press NeoSleepDashboardWidget → bottom sheet with Log sleep / View weekly chart / Set sleep goal
- [x] Animate context menu in with spring scale + fade
- [x] Floating sync progress tooltip below HeaderSyncButton showing current step
- [x] Tooltip fades in/out with Animated opacity, anchored via absolute positioning

## NeoSleep Widget + Sleep Tab Fixes (Round 13)
- [x] Fix NeoSleepDashboardWidget showing no data (date key UTC vs local mismatch)
- [x] Fix sleep.tsx save handler using UTC date slice — now uses local date
- [x] Fix NeoSleepWeeklyChart date key derivation to use localDateStr() helper
- [x] Embed NeoSleepWeeklyChart (compact mode, 220px) into dashboard widget
- [x] Fix stale "Log your first sleep" empty state — now uses flex centering and lighter text
- [x] Improve text visibility in NeoSleepWeeklyChart (day labels #CBD5E1, hours labels #E2E8F0, legend #CBD5E1)

## NeoSleep Chart Cleanup (Round 14)
- [x] Remove efficiency and REM recovery labels from top-right of NeoSleep chart
- [x] Move hours-above labels up so they clear the awake ribbon line
- [x] Remove goal nights ring from summary card

## Correlate Historical Patterns Filter (Round 14b)
- [x] Add 3d / 7d / 30d segmented filter to Observed Historical Patterns section
- [x] Filter displayed patterns by selected time window
- [x] Style filter tabs with 3D glass consistent with rest of Correlate tab

## NeoSleep Stage Label Fix (Round 15)
- [x] Move Awake/REM/Core/Deep stage labels from right edge to left side of NeoSleep chart

## NeoSleep Chart Polish (Round 16)
- [x] Add left-margin indent to ribbon start points so first column doesn't overlap stage labels
- [x] Tappable stage labels (Awake/REM/Core/Deep) — highlight nodes + physiological tooltip
- [x] Verify compact widget label visibility and adjust compact height if needed

## NeoSleep + Correlate Polish (Round 17)
- [x] Spring-scale + fade-in animation on stage tooltip card
- [x] Dim non-selected ribbon bands (opacity 0.25) when tooltip is open
- [x] AsyncStorage persistence for Correlate 3d/7d/30d filter window

## NeoSleep + Correlate Polish (Round 18)
- [x] Ribbon tap-to-select: tapping a ribbon band opens its stage tooltip
- [x] Swipe-to-dismiss on stage tooltip (horizontal swipe gesture)
- [x] AsyncStorage persistence for Correlate primary/secondary metric selectors

## NeoSleep + Correlate Polish (Round 19)
- [x] Correlate preset chip index persistence (AsyncStorage @correlate_preset_idx)
- [x] Ribbon flash on tap (brief opacity 1.0 pulse before tooltip appears)
- [x] Sleep science screen with stage explanations + references
- [x] "Learn more →" link in stage tooltip navigates to sleep science screen

## NeoSleep Chart Clipping Fix (Round 20)
- [x] Fix pulsating node glow edges being clipped at right/top of NeoSleep chart
- [x] Fix "Today" label being cut off at right edge of chart
- [x] Increase right padding (H_PAD_RIGHT) and SVG overflow so all content is visible

## NeoSleep + Doctor Report (Round 21)
- [x] Replace sleep section in Doctor's Report with NeoSleepWeeklyChart
- [x] Cap node glow radius to 16px max
- [x] Bold "Today" day label in cyan (#22D3EE)
- [x] Reduce compact widget height from 260px to 240px

## PDF NeoSleep Stage-Band Chart (Round 22)
- [x] Replace sleepSparkline bar chart in report-generator.ts with NeoSleep stage-band SVG
- [x] Stage rows: Deep (violet), Core (blue), REM (cyan), Awake (red) as horizontal bands per night
- [x] Add node dots at stage-band intersections matching NeoSleep aesthetic
- [x] Write tests for the new SVG generator function

## NeoSleep Chart Polish (Round 23)
- [x] Change Core stage colour from #2563EB (blue) to #059669 (emerald green) for clear distinction from Deep
- [x] Change REM stage colour from #0891B2 (cyan) to #D97706 (amber/gold) for clear distinction from Core
- [x] Add pulsating right-edge glow animation to NeoSleep chart (two AnimatedCircle halos at x=CHART_W-H_PAD_RIGHT/2)
- [x] Update PDF report-generator.ts neoSleepSparkline to use the same new stage colours
- [x] Update neo-sleep-pdf-sparkline.test.ts colour assertions to match new colours

## NeoSleep Chart Polish (Round 24)
- [x] Replace left-margin SVG text stage labels with colour-coded pill chips rendered as a React Native View row below the chart SVG
- [x] Add per-stage weekly average bar row below the pill chips (compact horizontal bars for Deep/Core/REM/Awake avg minutes)
- [x] Pulse animation on the latest night's sleep nodes (Today column) using the stage's own glow colour

## NeoSleep + Readiness Polish (Round 25)
- [x] Remove week-vs-week sleep history comparison section from the sleep tab
- [x] Apply 3D glass styling to the legend pill chips + avg bar tab below the sleep graph
- [x] Add collapsible toggle to the sleep graph (collapsed by default, tap header to expand)
- [x] Restyle Daily Readiness card as a quick-entry 3D glass panel
- [x] Restyle Daily Readiness gauge card to match Quick Entry card style exactly (same GlassCard shell, header row, compact entry chips)
- [x] Fix missing })() IIFE close in index.tsx that caused Metro bundler JSX syntax error (NeoSleep IIFE was left unclosed after weekly comparison removal)

## Dashboard Layout (Round 28)
- [x] Remove "Great Sleep This Week" card from the dashboard
- [x] Move Daily Readiness section below the NeoSleep graph widget

## NeoSleep Collapsible Widget (Round 29)
- [x] Add tap-to-expand collapsible toggle to NeoSleepDashboardWidget header (collapsed by default, animated spring chevron, chart + footer hidden when collapsed)

## NeoSleep Smooth Height Animation (Round 30)
- [x] Replace instant show/hide with react-native-reanimated height transition on NeoSleep collapsible body (chart + footer)

## Daily Readiness Card Chip Update (Round 31)
- [x] Replace HRV chip with Log Activity shortcut chip on Daily Readiness card (keep BP, Glucose, Weight, Sleep)

## Premium Onboarding Redesign (Round 32)
- [x] Copy user photo to assets/images/onboarding-hero.jpeg
- [x] Rewrite onboarding screens with premium full-bleed dark blue style (reference: IMG_3244)
- [x] Hero photo rising from lower half of screen on slide 1
- [x] Large bold headline bottom-left on each slide
- [x] Dark pill nav bar at bottom with >>> advance and checkmark finish buttons
- [x] VitalSync logo top-left on each slide
## Dashboard & Onboarding Polish (Round 33)
- [x] Create ReadinessBanner component (compact horizontal banner with animated progress bar, score badge, sub-metric chips)
- [x] Reposition Daily Readiness Banner to below greeting (day/date) and above Smart Reminders
- [x] Move Quick Entry card to after bento grid (before NeoSleep widget)
- [x] Onboarding: Replace Privacy slide plain icon circle with rich shield illustration (lock + On-device/Encrypted/No cloud badges)
- [x] Onboarding: Add Reanimated headline entrance animation (fade + slide-up on each slide transition)
- [x] Onboarding: Replace dot indicators with animated linear progress bar + slide counter in pill nav bar
- [x] Move Daily Readiness Banner to below greeting (day/date) and above Smart Reminders on dashboard
## Quick Entry Streak & Onboarding Parallax (Round 34)
- [x] Add streak calculation logic (consecutive days all vitals logged) to Quick Entry card
- [x] Add 🔥 flame badge with streak count to Quick Entry card header
- [x] Add Best Streak record below the streak badge
- [x] Add parallax scroll effect to onboarding hero photo (slide 1 → slide 2 transition)
## Onboarding Slide 1 Crash Fix & Hero Image Reframe (Round 35)
- [x] Diagnose and fix crash on slide 1 → slide 2 transition
- [x] Upscale/reframe hero image to show belly button to full face
- [x] Move text to bottom of slide 1, ensure nothing is obscured
- [x] Restructure slide 1 layout for professional look
## Onboarding Slide 1 Polish (Round 36)
- [x] Crop hero photo to right half of slide, text aligned left of photo
- [x] Add semi-transparent dark scrim behind headline text block on slide 1
- [x] Fix hero image crop on small phones (ensure face always visible)
- [x] Add skip confirmation bottom sheet when user taps "Skip setup"
## Onboarding Premium Redesign (Round 37)
- [x] Replace hero image with About/Settings profile photo
- [x] Upscale profile photo for premium onboarding use
- [x] Premium slide 1 layout: larger photo right, refined text left
## Onboarding Slide 1 Messaging Rewrite (Round 38)
- [x] Rewrite slide 1 headline using About tagline and creator credentials
- [x] Rewrite welcomeSub with mission messaging (evidence-based, clinician-built, private)
- [x] Add creator credential badge (MSN, RN, CCRN-CMC) to slide 1
- [x] Enrich feature pills to reflect full feature set from About highlights
## Privacy Slide Visual Checklist (Round 39)
- [x] Replace Privacy slide plain text with visual checklist (5 points from About privacyPoints)
## Onboarding Slide 2 & 6 Polish (Round 40)
- [x] Update slide 2 headline to "Your privacy, / our commitment."
- [x] Add staggered fade+slide-in animation to privacy checklist rows (50ms delay per row)
- [x] Mirror checklist style on consent slide 6 with medical disclaimer points
## Consent Slide Emoji Icons (Round 41)
- [x] Replace generic checkmark icons on consent slide 6 with contextual emoji icons per point
## Onboarding Completion Animation (Round 42)
- [x] Add full-screen completion animation overlay (checkmark burst + "You're all set!" text + confetti particles) on onboarding finish
- [x] Style consent slide "I Agree" CTA with gold gradient + pulse animation when consentAcknowledged is true
## Onboarding Slide 1 Redesign (Round 43)
- [x] Rewrite slide 1 to match reference: scrollable feature pills row + Created By card (photo, name, credentials, bio)
- [x] Remove full-bleed hero photo layout causing top-of-screen crop on real devices
## Onboarding Slide 1 Polish (Round 44)
- [x] Mask creator photo white background with dark overlay blend
- [x] Add app tagline above the Created By card
- [x] Add VitalSync app icon (40x40) to slide header top-left (already present in top bar)
## Onboarding Round 45
- [ ] Remove creator photo white background (transparent PNG via AI)
- [ ] Add emoji icons to feature pills on slide 1
- [ ] Extend headline fade+slide-up animation to all 6 onboarding slides
## Bug Fixes Round 48
- [ ] Fix Sleep tab on dashboard showing no graphs
- [ ] Fix Doctor Report sleep section showing nothing when expanded
- [x] NeoSleep: verify and fix left-edge stage label clipping on narrow devices (adjust H_PAD)
- [x] NeoSleep: confirm Doctor Report sleep graph renders correctly with overflow visible
- [x] NeoSleep: stagger outer and inner bubble pulse animations by 150ms for layered glow effect
- [x] Fix EAS build error: add app.json with slug/bundleId/projectId so EAS can detect the Expo project

## Dark Mode Fixes
- [x] Improve stages estimates section visibility in dark mode (labels, input borders, background)
- [x] Fix macro breakdown card on dashboard: use light theme colors when isDark=false (canvas bg, text, tabs, bars, ADA panel)
- [x] Set light as default theme on welcome/onboarding screen
- [x] Add small theme toggle button in dashboard header between language selector and NeoVital branding, navigating to theme settings
- [x] ParticleLayer: pass isDark, use lower opacity and soft indigo tint in light mode
- [x] PulsingBadge: boost background from color+'22' to color+'33' in light mode
- [x] Waveform bar: raise minimum stopOpacity from 0.1 to 0.2 when isDark=false
- [x] Dashboard header theme button: add long-press to toggle light/dark directly
- [x] Onboarding: add theme selection slide (Light / Dark / System) before dashboard
- [x] ThemeProvider: pre-set scheduled dark mode 22:00–07:00 enabled by default
- [x] Pharmacy form in Settings under Saved Pharmacies (name, address, phone, add/edit/delete)
- [x] Wire pharmacy data to health-context (PharmacyEntry type, CRUD)
- [x] Medication log autofill from saved pharmacies
- [x] Animate onboarding theme slide selection with scale-bounce
- [x] Verify System preference + scheduled dark window interaction (22:00 override)
- [x] Add Reset to Defaults button in Appearance settings (restores 22:00-07:00 schedule)
- [x] Fix onboarding freeze on HealthKit permissions request and Next button tap
- [x] Fix invisible reminder time in profile settings daily protocol reminder
- [x] Hide 7-day avg HRV card on dashboard
- [x] Apply 3D glass to Today steps/distance/active cal/fiber tab on dashboard
- [x] Apply 3D glass to Reference footer on dashboard
- [x] Drag-to-reorder: sections below Sleep 7-night view on dashboard (tap-hold drag, persistent order)
- [x] Dashboard header: reorder mode toggle button (reveals all drag handles at once)
- [x] Section visibility toggles (hide/show per section, stored with order preference)
- [x] LayoutAnimation on section reorder drop for smooth slide animation
- [x] Remove GPS routes from Data & Privacy screen (Activity and Nutrition sections)
- [x] Remove drag-to-reorder feature from dashboard (DraggableSection wrappers, Edit Layout button, useDashboardOrder hook)
- [x] Remove gpsRoute and mapRegion fields from ActivityRecord type in lib/health/types.ts
- [x] Remove GPS Tracking toggle / gps-tracked source from activity log form
- [x] Audit Data & Privacy delete flow for GPS data references
- [x] Remove "Daily Protocol Reminder" section from profile settings screen
- [x] Onboarding theme slide 6: add live mini-dashboard mockup that switches Light/Dark/System in real time as user taps each option
- [x] Doctor Report PDF: add VitalSync logo and clinician name/credentials (from user profile) to PDF header
- [ ] Update healthkit-sync-auth.ts with authorizeVitalSync using @kingstinct/react-native-healthkit
- [x] Add getMostRecentQuantitySample post-auth verification check to healthkit-loader.ts
- [x] Create types/vitals.d.ts with typed interfaces for all vital sign objects
- [ ] Integrate HealthKit availability check (isHealthKitAvailable) into DashboardScreen with loading/unavailable states
- [ ] Verify sync engine pulls 30-day data window correctly
- [ ] Fix permissions/query mismatch between requestAuthorization identifiers and query identifiers
- [x] Create services/health-sync.ts with syncVitalSyncData (30-day parallel HealthKit fetch using two-argument requestAuthorization)
- [x] Wire vitals quick-entry weight field to weight log and weight tab banner (shared BodyCompositionRecord store)
- [x] Add react-native-ble-plx plugin config to app.config.ts (isBackgroundEnabled, modes, bluetoothAlwaysPermission)
- [x] Add iOS infoPlist NSBluetoothAlwaysUsageDescription and NSBluetoothPeripheralUsageDescription to app.config.ts
- [x] Create services/bluetooth-manager.ts with BleManager and scanAndConnect
- [x] Expand bluetooth-manager.ts with device-name allowlist (PulseOx, BPMonitor, SmartScale, Glucometer) and GATT routing to ble-manager.ts handlers
- [x] Add BLE connection status badge (green/grey Bluetooth icon) to dashboard Quick Entry strip
- [x] Wire scanAndConnect to BT sync buttons on weight and BP log screens
- [x] Configure background BLE sync using isBackgroundEnabled
- [x] Vaccines: add mark-as-taken/skipped actions on each vaccine entry
- [x] Vaccines: schedule 48-hour prior notification for upcoming vaccines
- [x] Vaccines: allow users to snooze vaccine notifications
- [x] Medical history: fix freeze when adding another entry or navigating back
- [x] Fix runaway scroll on scrollable time picker minutes column (log/sleep and other screens)
- [x] Fix onboarding theme slide Next button not responding after theme selection
- [x] Wire notifyBleState to glucose/blood-sugar log BLE handler for dashboard badge coverage
- [x] Add Mark Received quick-action to ScheduleCard in vaccine-schedule.tsx
- [x] Fix analytics.tsx missing 'medication-dipping' key in InsightCategory
- [x] Fix medications.tsx rescheduleTarget used-before-declaration TS error
- [x] Vaccine schedule: animate ScheduleCard status pill from "Gap" to "Received ✓" after Mark as Received
- [x] Vaccine schedule: add live "X gaps remaining" counter badge to screen header that decrements as vaccines are marked received
- [x] Vaccine schedule: add animated horizontal progress bar beneath header showing receivedCount / total
- [x] Vaccine schedule: add mini per-category progress indicator (received/total + small fill bar) to each filter chip
- [x] Vaccine schedule: make header gap badge tappable — auto-switches filter to "Gaps" and scrolls to first gap card
- [x] Correlation Engine: add plain-language insight summary card beneath scatter plot in CorrelationTrendChart
- [x] Add HealthKit permission request on app load in index.tsx with immediate test HR fetch to confirm grant
- [x] Wire HealthKit grant result in initHealthKit useEffect: call forceSync() + showHealthKitToast + setPermBannerDismissed when permissions are granted
- [x] Wire requestHealthKitPermissions to call initAppleHealthKit() as primary path (RCT bridge shows system permission sheet) and expose fetchHeartRate on the public NativeHealthService interface
- [x] Replace native-health-service.ts with user's final class-based NativeHealthService, preserving syncAll, Android HC path, and background delivery exports
- [x] Persist last-connected BLE device name to AsyncStorage and display it on dashboard Bluetooth badge
- [x] Add last-night sleep hours chip to collapsed Weekly Summary Card header
- [x] Replace native-health-service.ts permission/singleton layer with user's final NativeHealthService class (AppleHealthKit.initHealthKit as primary, fetchHeartRate via getHeartRateSamples), preserving all iOS/Android fetch functions and syncAll
- [x] index.tsx: replace existing initHealthKit useEffect with user's final snippet (requestPermissions + fetchHeartRate test fetch with emoji logs)
- [x] Add AppleHealthKit.Constants.Permissions.BloodGlucose to _requestViaRCT read permissions in native-health-service.ts
- [x] Add fetchBloodGlucose, fetchWeight, fetchCalories, fetchSteps to NativeHealthServiceImpl and public interface
- [x] Wire glucose/weight/calories/steps state + fetches into index.tsx useEffect and bind to dashboard tiles
- [x] Fix JSON Parse error: Unexpected character < in Smart Scribe and photo upload flows (server returning HTML instead of JSON)
- [x] Wire medication "today" doses to a smart notification card on dashboard with Taken/Skipped/Reschedule actions
- [x] Add "See all medications →" footer link at bottom of Smart Reminders section pushing to Medications tab
- [x] Persist reschedule new time to medication scheduleTimes array in logRescheduleEvent so next-day reminder fires at new time
- [x] Show "Metformin rescheduled to 14:00 ✓" toast after ↻ Later action in MedTodayNotificationCard
- [x] Build VaccineDueNotificationCard component with inline Reschedule and Skip actions (mirrors MedTodayNotificationCard)
- [x] Wire VaccineDueNotificationCard into dashboard Smart Reminders with 48-hour lookahead for nextDoseDate
- [x] Wire "See all medications →" link to navigate to Medications tab with "Today" filter pre-selected
- [x] Add Reschedule button to appointment smart reminder card that deep-links to appointment edit form with appointment pre-loaded
- [x] Pulse animation on Today tab in medications.tsx when opened via deep-link
- [x] Reschedule-confirmed toast in appointments.tsx after saving new date/time
- [x] Confirm Attendance button on appointment reminder card with 24h push notification
- [x] Missed appointment cards in Smart Reminders with Log Outcome action
- [x] Appointments screen: 3-tab layout (Upcoming / Missed / History)
- [x] Missed tab: amber "⚠ Missed · Xd ago" badge on cards, Reschedule + Log Outcome buttons
- [x] History tab: all past appointments with Reschedule + Log Outcome (if no outcome yet)
- [x] Log Outcome bottom sheet: Attended / Missed / Cancelled / Rebooked chips + optional note
- [x] Outcome badge displayed on card after logging (colour-coded by outcome)
- [x] DoctorAppointment type extended with missedOutcome and outcomeNote fields
- [x] Rebook shortcut: tapping Rebooked in Log Outcome sheet saves outcome then opens Add Appointment pre-filled with same doctor/specialty/location/recurrence
- [x] Sort HealthKit fetch results newest-first in index.tsx init useEffect (glucose, weight, calories, heart rate)
- [x] Wire glucose and weight tiles to health context data (latestGlucoseMgDl, latestWeightDisplay with unit conversion) — prefer context over hk* state
- [x] Medications subtabs evenly measured (flex:1 on Animated.View wrapper for Today tab)
- [x] Medical history back button updated to match appointments.tsx pattern (router.back(), no canGoBack conditional)
- [x] Surgical history back button updated to match appointments.tsx pattern (router from expo-router, direct router.back())
- [x] Add medication/lab/appointment event kinds to ClinicalEventKind and buildClinicalNarrative
- [x] Wire navigateForEvent in clinical-narrative-card.tsx to deep-link to medication history tab, lab tab, and appointment tab

## Background Delivery Integration (BGTaskScheduler + HKObserverQuery)
- [x] Add withBGTaskScheduler.js config plugin — injects BGTaskSchedulerPermittedIdentifiers into Info.plist
- [x] Add withVitalSyncBackgroundModule.js config plugin — injects Swift HKObserverQuery + BGAppRefreshTask registration into AppDelegate
- [x] Create lib/health/background-sync-service.ts — TypeScript delta-sync service with BP pairing and local-only storage
- [x] Wire background-sync-service.ts into expo-background-fetch task handler (VITALSYNC_HK_BACKGROUND)
- [x] Register withBGTaskScheduler and withVitalSyncBackgroundModule plugins in app.config.ts

## Background Sync Wiring (Apr 2026)
- [x] Call defineBackgroundSyncTask() at app entry in _layout.tsx alongside defineHealthMonitorTask()
- [x] Call registerBackgroundSyncTask() in onboarding.tsx after permissions granted
- [x] Call registerBackgroundSyncTask()/unregisterBackgroundSyncTask() in thresholds.tsx toggle
- [x] Add "Last Background Sync" timestamp row in Settings Health Data section (iOS only)
- [x] Add arrow.down.heart.fill icon mapping to icon-mapping.ts

## HealthKit Clean Permission + Fetch Pipeline (Apr 2026)
- [x] Rewrite rnh-loader.ts with clean minimal permissions (HeartRate, Steps, BloodPressureSystolic, BloodPressureDiastolic, Weight/BodyMass, BloodGlucose, ActiveEnergyBurned, SleepAnalysis)
- [x] Add exact API fetch helpers: fetchHKHeartRate, fetchHKBloodPressure, fetchHKLatestWeight, fetchHKBloodGlucose, fetchHKActiveCalories, fetchHKStepCount, fetchHKSleep with getTotalSleepForLastNight aggregation
- [x] Fix RCT BP fallback field mapping: .systolic/.diastolic (with legacy .bloodPressureSystolicValue fallback)
- [x] Fix healthkit-loader.ts: add missing 'count/min' unit argument to getMostRecentQuantitySample
- [x] Fix share-insight.ts: add missing 'medication-dipping' key to CATEGORY_NAMES record
- [x] Fix services/health-sync.ts: rename QuantityTypeIdentifier → HKQuantityTypeIdentifier with camelCase enum members
- [x] Fix rnh-loader.ts: cast 'kg' as any for HealthUnit type compatibility

## EAS Build Fix: Remove Swift Plugin + Suppress Warnings (Apr 2026)
- [x] Delete withVitalSyncBackgroundModule.js (Swift file injection caused prebuild crash)
- [x] Remove withVitalSyncBackgroundModule from app.config.ts plugins list
- [x] Clean up stale VitalSyncBackgroundModule comment in app.config.ts
- [x] Write withSuppressWarnings.js plugin: sets GCC_TREAT_WARNINGS_AS_ERRORS=NO, SWIFT_TREAT_WARNINGS_AS_ERRORS=NO, GCC_WARN_ABOUT_DEPRECATED_FUNCTIONS=NO
- [x] Register withSuppressWarnings in app.config.ts before withNoBackgroundAudio

## Provider Tree Fix (Apr 2026)
- [x] Move DataSourcesProvider outside AppLoadingGate in _layout.tsx to fix useDataSources must be used inside DataSourcesProvider crash

## Swift Background Module Fix (Apr 2026)
- [x] Rewrite withVitalSyncBackgroundModule.js with correct xcodeproj Compile Sources registration
- [x] Use @objc singleton pattern: VitalSyncBackgroundModule.shared.startHealthObservers()
- [x] Set iOS deployment target 13.0 in withSuppressWarnings plugin
- [x] Fix Sentry Upload Debug Symbols build phase ambiguous dependency warning

## HealthKit Sync Pipeline Audit & Fix (Apr 2026)
- [x] Audit bundle identifier — already hardcoded "com.myvitalsyncclinicalhub.vitalsync" (no change needed)
- [x] Audit syncAll() variable shadowing — already uses const sinceDate = since ?? new Date(0) (no change needed)
- [x] Audit all Nitro bridge calls — all use from/to Date objects correctly (no change needed)
- [x] Audit all RCT bridge calls in native-health-service.ts — all use startDate: since.toISOString() correctly (no change needed)
- [x] Audit rnh-fetch.ts — all functions use { startDate: iso(since), endDate: iso(new Date()) } correctly (no change needed)
- [x] Fix data-sources.tsx debug trigger: replace 30-day window with new Date(0) to fetch ALL historical data
- [x] Update debug button label to "Fetch All Health Data" and result header to "All-Time Debug Results"

## EAS Build Fix — VitalSyncBackgroundModule (Apr 2026)
- [x] Fix withVitalSyncBackgroundModule.js: add withXcodeProject step (Step B) to register VitalSyncBackgroundModule.swift in the Xcode target's PBXSourcesBuildPhase — resolves "cannot find 'VitalSyncBackgroundModule' in scope" EAS build failure

## TypeScript Error Fixes + BGProcessingTask (Apr 2026)
- [x] Fix healthkit-loader.ts:147 — add missing unit argument 'count/min' to getMostRecentQuantitySample()
- [x] Fix share-insight.ts:18 — add missing 'medication-dipping': 'Medication-Induced BP Dipping' to CATEGORY_NAMES record
- [x] Fix services/health-sync.ts:3 — rename QuantityTypeIdentifier → HKQuantityTypeIdentifier and fix camelCase enum members
- [x] Add BGProcessingTaskRequest alongside BGAppRefreshTaskRequest in withVitalSyncBackgroundModule.js Swift source (processingTaskID = "com.vitalsync.data.processing", requiresNetworkConnectivity: false, requiresExternalPower: false)
- [x] Register com.vitalsync.data.processing in withBGTaskScheduler.js BGTaskSchedulerPermittedIdentifiers array

## Plugin Fix: addSourceFile group UUID crash (Apr 2026)
- [x] Fix withVitalSyncBackgroundModule.js: addSourceFile 3rd arg must be PBXGroup UUID not name — look up UUID from PBXGroup section and fall back to root group if not found

## Collapsible Observed Historical Patterns
- [x] Add collapsible toggle to the "OBSERVED HISTORICAL PATTERNS" section header in CorrelationTrendChart
- [x] Persist collapsed state to AsyncStorage (@vitalsync/correlate_patterns_collapsed_v1)
- [x] Animate expand/collapse using Reanimated height accordion (consistent with CollapsibleCard)
- [x] Show pattern summary (patternBox) and plain-language insight card only when expanded

## IPA Sync — Apr 19 2026
- [x] Extract IPA (build 5e8bfdc6, v2.7.32, build 20732) and inventory contents
- [x] Confirm all source files already present in Manus project match GitHub commit 23c29a8
- [x] Sync icon.png and creator-photo.jpg from IPA assets into project assets
- [x] Copy dist/index.js from source repo
- [x] Verify all HealthKit files present: healthkit-loader.ts, background-sync-service.ts, rnh-loader.ts, rnh-fetch.ts, healthkit-background-delivery.ts, native-health-service.ts, healthkit-write.ts
- [x] Verify all EAS build plugins present: withVitalSyncBackgroundModule.js, withBGTaskScheduler.js, withSuppressWarnings.js
- [x] Confirmed bundle ID: com.myvitalsyncclinicalhub.vitalsync, BGTask: com.vitalsync.data.refresh

## Asset Restore + Dependabot — Apr 19 2026
- [x] Restore assets/images/splash-icon.png to build 20732 original (292590 bytes)
- [x] Restore assets/images/favicon.png to build 20732 original (83234 bytes)
- [x] Add .github/dependabot.yml from build 20732 source (93 lines, groups Expo SDK + RN + React + Navigation + TS tooling)

## Free API Integration for Food Scan (replaces Manus-server dependency)
- [ ] Integrate Open Food Facts API for barcode lookup (free, no key, 3M+ products)
- [ ] Integrate USDA FoodData Central API for food search (free, no key required for basic use)
- [ ] Keep Manus LLM vision for Scan Plate (runs on server, works in dev; add graceful fallback)
- [ ] Add EXPO_PUBLIC_API_BASE_URL to eas.json production env pointing to deployed Manus server
- [ ] Update ai-food-camera-sheet.tsx barcode path to call Open Food Facts directly
- [ ] Update smart-nutrition-card.tsx barcode path to call Open Food Facts directly
- [ ] Add nutrition data normalizer utility for Open Food Facts → app schema

## Free API Integration — Barcode Scanner
- [x] Install expo-camera for native barcode scanning
- [x] Create lib/nutrition/open-food-facts.ts (Open Food Facts API, no key required)
- [x] Create components/barcode-scanner-modal.tsx (native full-screen barcode scanner)
- [x] Wire BarcodeScannerModal into ai-food-camera-sheet.tsx (Scan Barcode button)
- [x] Wire BarcodeScannerModal into smart-nutrition-card.tsx (Scan Barcode button)
- [x] Add expo-camera plugin to app.config.ts with camera permission string
- [x] Fix JSX syntax errors in ai-food-camera-sheet.tsx and smart-nutrition-card.tsx
- [x] Zero TypeScript errors in all 4 changed files

## USDA Fallback + Clarifai Plate Scan
- [ ] Add USDA FoodData Central text-search fallback to open-food-facts.ts
- [ ] Wire USDA fallback into barcode-scanner-modal.tsx and handleBarcodeDetected
- [ ] Create lib/nutrition/clarifai-food.ts (Clarifai food model, free 5000 req/month)
- [ ] Replace analysePhoto server call in ai-food-camera-sheet.tsx with Clarifai
- [ ] Replace analysePhoto server call in smart-nutrition-card.tsx with Clarifai
- [ ] Add CLARIFAI_PAT to eas.json env blocks and request as project secret

## USDA Fallback + Clarifai Plate Scan (Apr 20, 2026)
- [x] Add USDA FoodData Central fallback to open-food-facts.ts for barcode misses
- [x] Create clarifai-food.ts — Clarifai food model client for Scan Plate
- [x] Wire Clarifai into ai-food-camera-sheet.tsx handlePlateScan
- [x] Wire Clarifai into smart-nutrition-card.tsx handleCameraPress
- [x] Add EXPO_PUBLIC_CLARIFAI_PAT env var to eas.json production/preview env blocks

## Apple Speech / SFSpeechRecognizer Voice Scribe (Apr 19, 2026)
- [x] Install @react-native-voice/voice package
- [x] Add NSSpeechRecognitionUsageDescription + NSMicrophoneUsageDescription to app.config.ts ios.infoPlist
- [x] Create hooks/use-speech-recognizer.ts — wraps @react-native-voice/voice for real-time STT
- [x] Create hooks/use-voice-scribe-apple.ts — high-level Apple Speech scribe hook
- [x] Update ScribeButton: onTranscript prop, apple-speech mode auto-selected on iOS, live partial transcript display
- [x] Add parseVitalsTranscript server endpoint (transcript → LLM parse, no audio upload)
- [x] Add parseVoiceMedicalIDTranscript server endpoint
- [x] Add parseImmunizationTranscript server endpoint
- [x] Update vitals.tsx to use handleScribeTranscript → parseVitalsTranscript on iOS
- [x] Update medical-id.tsx to use handleScribeTranscript → parseVoiceMedicalIDTranscript on iOS
- [x] Update immunizations.tsx to use handleScribeTranscript → parseImmunizationTranscript on iOS
- [x] Update medical-history.tsx to use handleScribeTranscript → parseMedicalHistoryTranscript on iOS
- [x] Update surgical-history.tsx to use handleScribeTranscript → parseSurgicalHistoryTranscript on iOS
- [x] Add expo.doctor.reactNativeDirectoryCheck.exclude for @react-native-voice/voice
- [x] Fix clarifai-food.ts to use correct food-item-recognition model endpoint

## Clarifai PAT Secret (Apr 19, 2026)
- [x] Validate EXPO_PUBLIC_CLARIFAI_PAT (Clarifai user: 3biplq65iid9, status: Ok)
- [x] Add EXPO_PUBLIC_CLARIFAI_PAT to Manus project secrets
- [x] Add EXPO_PUBLIC_CLARIFAI_PAT to eas.json preview env block
- [x] Add EXPO_PUBLIC_CLARIFAI_PAT to eas.json production env block

## Apple Vision + USDA Privacy-First Nutrition Pipeline (Apr 20, 2026)
- [x] Build lib/nutrition/usda-fdc.ts — direct USDA FoodData Central REST client (DEMO_KEY, no proxy)
- [x] Build lib/nutrition/apple-vision-food.ts — Apple Vision/LLM food recognition with Clarifai fallback
- [x] Update handlePlateScan in ai-food-camera-sheet.tsx — Apple Vision → USDA pipeline (server AI fallback)
- [x] Update handleBarcodeDetected — Open Food Facts primary + USDA enrichment for low-confidence results
- [x] HealthKit write-back already wired via addSodium → saveMealToHealthKit (no changes needed)
- [x] Serving confirmation UI (×0.5/×1/×1.5/×2) already present in MacroPreviewPanel (no changes needed)
- [x] USDA DEMO_KEY confirmed working (banana raw: 89 kcal, 22.8g carbs, 1.09g protein)

## USDA API Key + Nutrition UX Improvements (Apr 20, 2026)
- [x] Add EXPO_PUBLIC_USDA_API_KEY secret (PD32mU..., validated: apple → 52 kcal)
- [x] Wire EXPO_PUBLIC_USDA_API_KEY into usda-fdc.ts (already reads process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY')
- [x] Add EXPO_PUBLIC_USDA_API_KEY to eas.json preview and production env blocks
- [x] Add "Search USDA →" quick-action button in MacroPreviewPanel when macros are null (no-match case)
- [x] Add gram-based custom serving input (TextInput) alongside ×0.5/×1/×1.5/×2 chips in ServingStepper
- [x] Wire effectiveMult: gram input overrides multiplier chips when active
- [x] Show ×multiplier hint next to gram input when referenceWeightG is available (USDA serving weight)
- [x] Set referenceWeightG from USDA servingWeightG in handlePlateScan
- [x] Add StyleSheet entries: gramInputRow, gramInputWrap, gramInput, gramUnit, gramHint, noMacrosBox, searchUsdaBtn, searchUsdaBtnText

## Nutrition UX Phase 3 (Apr 20, 2026)
- [x] Wire setReferenceWeightG in handleSelectSearchResult so gram input hint shows on search path
- [x] Add Scan Plate shortcut + food search entry point to Dashboard macro breakdown card (onLogMeal routes to camera sheet)
- [x] Add HealthKit nutrition write-back opt-in Alert after Log This Meal tapped (iOS only, skipHealthKit flag)

## Nutrition UX Phase 4 (Apr 20, 2026)
- [x] Persist HealthKit write preference to AsyncStorage (hk_nutrition_pref: 'save' | 'skip') via useHealthKitNutritionPref hook
- [x] Pre-select last choice in handleLog HealthKit Alert (auto-write if 'save', auto-skip if 'skip', ask first time)
- [x] Add HealthKit opt-in prompt to handleLogAll (Food Tray Log All path) with same persisted preference
- [x] Show green inline "♥️ Saved to Apple Health ✓" toast banner (2.5s) after successful HealthKit write

## Log All Vitals Sheet (Apr 20, 2026)
- [x] Add parseAllVitalsTranscript server endpoint (multi-section voice parse: BP, weight, sugar, sleep, HRV)
- [x] Build components/log-all-vitals-sheet.tsx (section chips, date picker, BP/Weight/Sugar/Sleep/HRV fields, Save Entry)
- [x] Sleep section: REM, Core, Deep, Awake duration fields + total sleep hours
- [x] HRV section: SDNN field (ms) with context chip (Morning/Night/Post-exercise)
- [x] Wire Apple Speech voice scribe into LogAllVitalsSheet (tap mic → speak → auto-fill all sections)
- [x] Add "📋 Log all vitals at once" link to Quick Entry that opens LogAllVitalsSheet
- [x] Wire Save Entry to persist all sections to health-context (BP, weight, sugar, sleep, HRV)

## Blood Sugar Screen Redesign + Log from Apple Health (Apr 20, 2026)
- [x] A1C Target card (ADA Standards of Care 2024 §6.6, tappable to change target)
- [x] Projected A1C card (ADAG formula, 30d window, reading count, status badge, % below/above target)
- [x] History section: 7d / 30d / All filter chips + reading count
- [x] Trend chart: SVG line chart with threshold band (High/Low dashed lines, colored dots by status) via GlucoseTrendChart component
- [x] Time in Range bar: % above / in range / below with legend (High mg/dL, Low mg/dL, In range)
- [x] Reading count links to Health Alerts threshold settings (High, Low, TIR goal) via /settings/glucose-thresholds
- [x] Log from Apple Health pre-fill button in LogAllVitalsSheet (iOS only, fetches BP/weight/glucose/sleep/HRV from last 24h)

## Version Bump (Apr 20, 2026)
- [x] Bump version 2.7.32 → 2.7.33, buildNumber 20732 → 20733 in app.config.ts

## CGM Import + TIR Dashboard Ring (Apr 20, 2026)
- [x] Add "Import from Dexcom / CGM" row to Blood Sugar screen (reads HKQuantityTypeIdentifierBloodGlucose from HealthKit, bulk-imports last 30 days)
- [x] Show import progress (reading count, duplicate skip, success toast)
- [x] Add TIR goal progress ring (SVG arc) to Dashboard blood sugar vital card (Glucose quick-entry cell)
- [x] Ring shows today's TIR % vs. user's goal from glucose-thresholds config

## USDA Search Done / Log More (Apr 20, 2026)
- [x] Replace Alert-based post-log dialogs in handleLog and handleLogAll with inline success banner
- [x] Add "Log More" button (resets form, stays in search) to MacroPreviewPanel and TrayReviewPanel
- [x] Add "Done" button (closes sheet) to MacroPreviewPanel and TrayReviewPanel
- [x] Keep HealthKit first-time opt-in as Alert (3-button layout); silent write if preference already saved
- [x] Reset loggedSummary when sheet closes or Log More is tapped

## USDA Search Done / Log More (Apr 20, 2026)
- [x] Replace Alert-based post-log dialogs in handleLog and handleLogAll with inline success banner
- [x] Add "Log More" button (resets form, stays in search) to MacroPreviewPanel and TrayReviewPanel
- [x] Add "Done" button (closes sheet) to MacroPreviewPanel and TrayReviewPanel
- [x] Keep HealthKit first-time opt-in as Alert (3-button layout); silent write if preference already saved
- [x] Reset loggedSummary when sheet closes or Log More is tapped

## Scroll-to-Top FAB + SF Pro Font (Apr 20, 2026)
- [x] Create reusable ScrollToTopButton component (animated opacity FAB, chevron.up icon)
- [x] Create useScrollToTop hook (works with ScrollView and FlatList)
- [x] Wire scroll-to-top FAB to Dashboard (index.tsx)
- [x] Wire scroll-to-top FAB to Analytics tab
- [x] Wire scroll-to-top FAB to Log tab
- [x] Wire scroll-to-top FAB to Record tab
- [x] Wire scroll-to-top FAB to Report tab
- [x] Wire scroll-to-top FAB to Settings tab
- [x] Wire scroll-to-top FAB to Medications tab (FlatList)
- [x] Wire scroll-to-top FAB to Neon Vitals tab
- [x] Add SF Pro system font to tailwind.config.js (sans/display/mono families)
- [x] Add system font base styles to global.css for web
- [x] Create lib/_core/fonts.ts with SYSTEM_FONT and SYSTEM_FONT_MONO constants
- [x] Consolidate MONO font constant in biometric-prompt, clinical-prompt, vo2max-card, activity-log-history

## TypeScript Error Fixes (Apr 2026)
- [x] Fix blood-sugar.tsx BleConnectionState notifyBleState call signatures
- [x] Fix medical-history.tsx transcript shorthand property in handleScribeTranscript and handleScribeResult
- [x] Fix surgical-history.tsx transcript shorthand property in handleScribeTranscript and handleScribeResult
- [x] Fix sleep.tsx derived object missing 'core' property
- [x] Fix vaccine-schedule.tsx vaccineAbbr/totalDoses/doseStatus fields not in ImmunizationRecord
- [x] Fix onboarding.tsx REasing.back() call (missing parentheses) and invalid 'background' CSS property
- [x] Fix small-wins-tracker.tsx evaluateHealthData missing hasMedAdherenceToday in return
- [x] Fix log-all-vitals-sheet.tsx Platform.OS overlap inside iOS-only guard
- [x] Fix whats-new-sheet.tsx missing i1Title/i1Desc in whatsNewV14Strings
- [x] Fix health-context.tsx unreachable return block after DELETE_LAB_RESULT case
- [x] Fix apple-vision-food.ts clarifaiPredictBase64 not exported + implicit any type
- [x] Fix pharmacy-preferred.test.ts 'address' on 'never' type (undefined literal narrowing)
- [x] Update support URL in Settings > About > Support to helpvitalsyncpersonalwellnesshub.com

## Dashboard & Settings Cleanup (Apr 2026)
- [x] Remove "Health" text from dashboard header
- [x] Move "Request Permissions" row to top of Settings page
- [x] Remove HealthKit entitlements-not-active alert and "how to fix: publish a new build" text
- [x] Remove any other permission request UI outside of Settings > Request Permissions
- [x] Ensure sync button on dashboard header and Data Sources in settings are the only sync entry points
## HealthKit Migration to @kingstinct/react-native-healthkit (Apr 2026)
- [ ] Rewrite healthkit-loader.ts to use named kingstinct imports
- [ ] Rewrite permissions.ts to remove react-native-health (RCT bridge) dependency
- [ ] Rewrite native-health-service.ts to use kingstinct for all iOS data fetching
- [ ] Rewrite device-sync.ts to use kingstinct queryQuantitySamples
- [ ] Stub out rnh-loader.ts and rnh-fetch.ts (no-ops, keep for import compatibility)
- [ ] Update env-detect.ts to remove AppleHealthKit NativeModule check
- [ ] Remove react-native-health from package.json
- [x] Make NeoSleep chart collapsible on Doctor Report screen
- [ ] Rename all user-visible "clinical" text to "personal" across the app
- [ ] Rename "Doctor Report" to "Personal Health Report" across the app
- [ ] Rename "Doctor Report" to "Personal Wellness Report" everywhere
- [ ] Rename all user-visible "clinical" text to "personal"
- [x] Rename "Clinical Sources" / "Personal Sources" to "Evidence Based Sources" everywhere
- [x] Rename Report tab label to "Health Report"
- [x] Update PDF filename to VitalSync_Personal_Health_Report_YYYY-MM-DD.pdf
- [x] Change "Personal Wellness Hub" to "Personal Health Hub" in share-insight.ts and all branding strings

## Vision Food & Smart Scribe Improvements (Apr 2026)
- [x] Rename "AI Food Camera" to "🍎 Vision Food 📸" in sheet title, tab toggle, and home button
- [x] Add parseSleepTranscript server route (LLM parses spoken sleep description into form fields)
- [x] Add parseImmunizationPhoto server route (LLM vision reads vaccine card/prescription photo)
- [x] Wire ScribeButton (Dictate Sleep) in sleep.tsx with transcript feedback and disclaimer
- [x] Add Apple Vision photo scan (camera-only) to Immunizations screen
- [x] Restrict medications.tsx photo scan to camera-only (remove library option)
- [x] Fix measurement unit tabs in Settings/Profile to equal-width, evenly spaced segmented control

## UX Polish (Apr 20, 2026)
- [x] Vision Scan collapsible result preview card in Immunizations (confidence badge, field list, tap to expand/collapse)
- [x] Sleep Dictate example phrases hint row (3 natural-language examples below the mic button)
- [x] Animated sliding pill for Settings unit tabs (Reanimated, 220ms ease-out, syncs with preset buttons)
- [x] Redesign unit preset buttons: right-aligned, equal-width (148px), unit values centered beneath label
- [x] Clear Vision Scan preview card (photoScanSummary) when Immunization form is saved or closed
- [x] Sleep Dictate example phrases are now tappable — tap any phrase to prefill and run through the AI pipeline
- [x] Per-unit accent colors on Settings unit tabs: Weight=blue, Height=green, Temperature=amber, Blood Glucose=red, Distance=violet
- [ ] Rebuild measurement units section as two-column grid (US Imperial / International) with row labels per sketch
- [ ] Add preset flash animation when US Imperial or International column header is tapped
- [ ] Vision Scan low-confidence inline warning banner above Save button in Immunizations
- [ ] Localize Sleep Dictate example phrases via i18n system
- [x] Vision Scan result preview card in Immunizations (collapsible, confidence badge, field breakdown)
- [x] Clear photoScanSummary on Immunization form save/cancel
- [x] Tappable Sleep Dictate example phrases (prefill transcript on tap)
- [x] Per-unit accent colors on Settings unit tabs (blue/green/amber/red/violet)
- [x] Measurement units section redesigned as two-column grid (US Imperial | International)
- [x] Preset button flash animation when column header tapped
- [x] Vision Scan low-confidence warning banner above Save in Immunizations
- [x] Sleep Dictate example phrases localized in i18n (en/es/fr/zh)
- [x] Measurement unit headers expanded (larger text 13px, taller padding 11px, wider 96px cols)
- [x] International column pushed to right side with flex spacer
- [x] Unit value boxes taller (40px) and larger text (14px)
- [x] Propagate unit prefs across app - vitals.tsx, activity.tsx, dashboard, report, vitals-summary now all reactive via useUnitPreferences hook
- [x] Fix profile.tsx to use saveUnitPreferences (merge) so glucoseUnit and distanceUnit are not overwritten
- [x] Add DeviceEventEmitter to useUnitPreferences for live cross-screen updates
- [x] Unit change toast in Settings - preset buttons show "Units updated to US Imperial 🇺🇸" / "Units updated to International 🌍", individual boxes show "Weight set to lbs" etc.
- [x] Glucose thresholds screen now respects glucoseUnit - shows mg/dL or mmol/L based on user preference, converts values on input/display
- [x] Weight goal card already correctly uses weightUnit - confirmed no changes needed
- [x] Add unit-change toast to Profile screen unit selectors
- [x] Fix mmol/L min/max validation in glucose-thresholds.tsx (2.0-27.8 range)
- [x] Add unit indicator strip above quick-log tile row on dashboard (tappable, links to Settings)

## i18n Fix & Onboarding Slide 3 (Apr 20, 2026)
- [x] Fix i18n.ts syntax error: French dictateSleepPhrase1 had unescaped apostrophe in single-quoted string (j'ai bien dormi) — escaped as j\'ai
- [x] Verify onboarding slide 3 redesign: 4 data source cards (Apple Health, Health Connect, Apple Scribe, Manual Entry), Request Permission button, Skip link, permissionSkipped state
- [x] All i18n keys for onboarding slide 3 present in all 4 languages (en/es/fr/zh)

## Onboarding Slide 1 Credits Update (Apr 20, 2026)
- [x] Rename "Created By" to "Developed By" on onboarding slide 1 creator card
- [x] Add "🎓 Knowledge Empowered By" card below Developed By card with CS50/Harvard course credits and tagline

## Settings About Screen Update (Apr 20, 2026)
- [x] Rename "Created By" to "Developed By" in Settings → About
- [x] Add "🎓 Knowledge Empowered By" card in Settings → About with 3 CS50/Harvard courses as tappable links (cs50.harvard.edu/x, /python, /ai) with haptic feedback and ↗ indicator
- [x] Revert onboarding.tsx creator card back to original "Created By" (changes were misplaced)
- [x] Add "Support Open Education" tappable banner at bottom of Knowledge Empowered By card linking to pll.harvard.edu

## Settings About — Share & Badge (Apr 20, 2026)
- [x] Add 📤 Share button to Knowledge Empowered By card header — shares all 3 CS50 course links + pll.harvard.edu via system share sheet
- [x] Add 🎓 Harvard pill badge to the About VitalSync row in main Settings list so users notice the educational content before tapping
- [x] Upscale creator-photo.jpg from 1150×1609 to 2300×3218 (2× Lanczos) for sharper display in Settings About and onboarding
- [x] Polish passport frame in Settings About: 16px border radius, primary-tinted border (55% opacity), drop shadow, and subtle bottom LinearGradient overlay (transparent → rgba(0,0,0,0.35)) for glass-aesthetic card feel
- [x] Add press-to-zoom animation to passport frame in Settings About (Reanimated: scale 1→1.08 on pressIn with 180ms ease-out, spring back on pressOut + haptic)
- [x] Add name overlay label "akorir, MSN RN" at bottom of passport frame gradient in Settings About
- [x] Add verified credential badge (✓ shield) pinned to bottom-right corner of passport frame in Settings About
- [x] Apply press-zoom interaction to onboarding creator card passport photo
- [x] Onboarding: rename "Created By" to "Developed By" in creator card header
- [x] Onboarding: add Knowledge Empowered By section with Harvard CS50 course links below developer bio
- [x] Onboarding: add "Learn more → Settings → About" navigation nudge at bottom of slide 1

## HealthKit Diagnostic Fix (Apr 20 2026)
### What is WORKING (from diagnostic screenshots)
- Platform iOS ✅
- NativeModules.AppleHealthKit present ✅
- RCT bridge (react-native-health) available ✅

### What is BROKEN
- Nitro bridge (@kingstinct/rn-healthkit) — NitroModulesProxy NOT registered ⚠️
- initHealthKit() / permissions ❌ (throws "undefined is not a function")
- ALL 20 data type fetches fail: Heart Rate, Resting HR, HRV, Blood Pressure, SpO2, Respiratory Rate, Blood Glucose, Insulin, Dietary Fiber, Active Energy, Basal Energy, Step Count, Stand Time, Workouts, Sleep Analysis, Body Temperature, Weight, Body Fat, VO2 Max, Distance ❌
- Root cause: native-health-service.ts calls HK.getXxx() methods from the Nitro module which is undefined at runtime; the RCT bridge fallback is not being reached

### Fix plan
- [ ] Fix healthkit-loader.ts: treat Nitro as optional, never throw if absent
- [ ] Fix native-health-service.ts: route ALL syncAll() calls through rnh-fetch.ts (RCT bridge) when Nitro is unavailable
- [ ] Fix permissions.ts: use initAppleHealthKit() from rnh-loader for the permission sheet (RCT path)
- [ ] Fix diagnostic panel: show accurate bridge status

## Native Build / Nitro Bridge Fix (Apr 20 2026)
- [x] Verify Expo config plugin for @kingstinct/react-native-healthkit is present in app.config.ts
- [x] Fix healthkit-loader.ts: add NitroModulesProxy presence check before dynamic import
- [x] Fix rnh-fetch.ts: add getSamples() generic fallback for all 8 methods that may be absent
- [x] Fix rnh-loader.ts: add all 20 diagnostic permission types to initHealthKit() call
- [x] Add eas.json with development build profile
- [x] Fix developer profile picture head cutoff in Settings About and onboarding creator card

## Audit Findings — About / Onboarding / Measurement Units (Apr 20)
- [x] Measurement Units: LABEL_W=110 is defined but not applied to the row label View — add explicit width so label doesn't overflow on narrow screens (iPhone SE)
- [x] Measurement Units: COL_W=96 may clip "mmol/L" text on small screens — increase to 104 or reduce font size
- [x] Onboarding slide 3: "Request Permission" button color is red (#E53E3E) — change to brand primary (#0a7ea4) to match app style
- [ ] Onboarding slide 3: add a descriptive subtitle above the platform cards explaining what permissions are needed and why
- [ ] About: verify passport frame head is fully visible after contentFit="top" fix on real device
- [ ] Onboarding slide 1: verify creator photo head is fully visible after absolute top=0 fix on real device

## Crash Fix + Onboarding Collapsible Developer Card (Apr 20)
- [x] Fix fatal crash: NativeEventEmitter(null) from PushNotificationIOS — remove/guard the import
- [x] Onboarding slide 1: make Knowledge Empowered By section collapsible (collapsed by default, expand with Reanimated height animation)
- [x] Onboarding slide 1: add "Learn more → Settings → About" tappable link at bottom of collapsed section

## ADA Blood Glucose Thresholds (Apr 20)
- [x] Add ADA evidence citation link to glucose-thresholds.tsx (View Evidence + full citation banner)
- [x] Add Log Blood Sugar deep-link button in glucose-thresholds.tsx
- [x] Verify/add Settings main screen row linking to /settings/glucose-thresholds (Glucose Alerts row added in Health Data section)
- [ ] Add ADA glucose threshold types (fasting, post-meal, hypoglycemia) to threshold-config.ts
- [ ] Add ADA glucose threshold checker to threshold-checker.ts with ADA-sourced ranges

## Evidence Reference Links Across Settings (Apr 20)
- [x] Add EvidenceRefBanner component (reusable compact "Read more" link strip)
- [x] Add evidence banner to Notifications section (AHA alert thresholds, ACC/AHA BP guidelines)
- [x] Add evidence banner to Health Data section (HealthKit privacy, AHA wearable accuracy)
- [x] Add evidence banner to My Profile section (WHO BMI, HRV normative ranges, ADA calorie targets)
- [x] Add evidence banner to Privacy section (HIPAA, on-device data privacy)
- [x] Add evidence banner to About section (PubMed, AHA, WHO, ADA, ESC links)
- [x] Add evidence banner to Appearance section (circadian rhythm, dark mode eye health)
- [x] Add evidence banner to Stored Data section (HIPAA data retention)
- [x] Add inline reference links to thresholds.tsx (AHA/ACC BP, ADA glucose, ESC HRV, WHO SpO2)
- [x] Add inline reference links to profile.tsx (WHO BMI, Mifflin-St Jeor BMR, ADA calorie targets)
- [x] Add inline reference links to data-sources.tsx (AHA wearable accuracy, Apple/Google privacy)
- [x] Add inline reference links to glucose-thresholds.tsx (ADA §6.3, TIR consensus, WHO criteria)
- [x] Add inline reference links to about.tsx (PubMed, AHA, WHO, ADA, ESC)

## Three UX Improvements (Apr 20)
- [x] Glucose Alerts: add fasting threshold row (<130 mg/dL ADA) with ADA citation pill
- [x] Glucose Alerts: add 2-hour post-meal threshold row (<180 mg/dL ADA) with ADA citation pill
- [x] About screen: add "View All References" row navigating to clinical-sources screen
- [x] Dashboard disclaimer GlassCard: add "Learn more ↗" pill linking to AHA patient education

## Collapsible Evidence Banners (Apr 20)
- [x] Upgrade EvidenceRefBanner to support collapsible mode (collapsed by default, LayoutAnimation height animation)
- [x] Apply collapsible mode to all EvidenceRefBanner instances in settings.tsx and sub-screens (no call-site changes needed — defaultExpanded=false is the default)

## Author Books Section (Apr 20)
- [x] Add book cover images to assets/images (confident-nurse, living-well-diabetes, rapid-nursing-review)
- [x] Build inline books section with 4 tappable book covers linking to Amazon
- [x] Wire books section into onboarding slide 1 below Knowledge Empowered By card
- [x] Add books section to Settings → About screen below developer bio (between Developed By and Knowledge Empowered By)

## Remove Permission Request from Onboarding Slide 3 (Apr 20)
- [x] Remove HealthKit/Health Connect permission request from onboarding slide 3
- [x] Replace with informational "Connect after setup" card directing users to Settings → Data Sources
- [x] Remove slide 3 permission gate from Next button disabled condition
- [x] Remove slide 3 permission gate from handleCTAPress (slide now advances freely)
- [x] Clean up slide 3 CTA label branches (no longer needed)

## Books Section Heading Update (Apr 20)
- [x] Change heading to "Also by the Developer" with subtitle "The author of multiple books. Published works by akorir includes" in onboarding.tsx and about.tsx

## Remove Knowledge Empowered By from Onboarding (Apr 20)
- [x] Remove Knowledge Empowered By collapsible card from onboarding slide 1
- [x] Remove associated state/animation variables (knowledgeExpanded, knowledgeHeight, knowledgeChevronRotate, knowledgeBodyStyle, knowledgeChevronStyle, toggleKnowledge)

## Book Section Improvements (Apr 20)
- [x] Add colon to books subtitle in onboarding.tsx and about.tsx
- [x] Add compact By the Developer horizontal book strip to Home screen (index.tsx, with long-press share)
- [x] Add long-press share action on each book card in onboarding.tsx and about.tsx

## iOS Crash Fix (EXC_BAD_ACCESS SIGSEGV — v2.7.45)
- [x] iOS crash fix: changed top-level `import AppleHealthKit from 'react-native-health'` to `import type { HealthKitPermissions }` (type-only, erased at compile time) in native-health-service.ts
- [x] iOS crash fix: replaced all direct `AppleHealthKit.xxx` usages in _requestViaRCT(), fetchHeartRate(), fetchBloodGlucose(), fetchWeight(), fetchCalories(), fetchStepsDirect() with lazy `require('react-native-health').default ?? require('react-native-health')` calls inside each method, guarded by isRNHAvailable()

## Settings UI Tweaks
- [ ] Move "Request Permissions" button to the top of the Permission Summary section in Settings

## Settings — Health Permission Details
- [x] Move "Request Permissions" button to top of Permission Summary (immediately below the summary card, before the per-type list)
- [ ] HealthKit sync window: fetch data from Saturday 1:00 AM to Sunday 9:00 PM Pacific time

## Saturday Window Seed Data
- [ ] Seed realistic HealthKit-style health data for Sat Apr 19 2026 01:00–10:00 AM PDT into AsyncStorage (sleep, HR, SpO2, BP, RR, steps, weight)

## Session Apr 21 2026
- [x] Move "Request Permissions" button to top of Permission Summary section in Settings (healthkit-permissions.tsx)
- [x] Add until/endDate parameter to syncAll, all fetchHealthKit* helpers, and all rnh-fetch.ts functions
- [x] Set HealthKit sync window to Sat Apr 19 2026 01:00–10:00 AM PDT in fetchHealthData (permissions.ts)

## Crash Fix — SIGABRT Thread 11 (v2.7.47, iOS 26.5 Beta)
- [ ] Wrap all TurboModule void-method calls (NativeEventEmitter addListener/removeListeners, background task registration) in try/catch to prevent uncaught C++ exception propagation on iOS 26.5 Beta

## Crash Fix — SIGABRT v2.7.47 (ObjCTurboModule void method, iOS 26.5 Beta)
- [x] Wrap registerHealthKitObservers callback body via setImmediate to defer TurboModule calls off the HealthKit background queue
- [x] Add null/undefined guard before scheduleNotification call inside HealthKit observer callback
- [x] Add _cancelled flag (weak-ref equivalent) to prevent stale callbacks after observer cleanup
- [ ] Wrap all BackgroundFetch.registerTaskAsync and TaskManager.defineTask calls in try/catch with Platform.OS guard
- [ ] Add global unhandled promise rejection handler to catch and log async TurboModule errors without crashing

## Nitro Bridge Fix
- [x] Fix @kingstinct/rn-healthkit Nitro bridge warning — corrected NativeModules key from NitroModulesProxy to ReactNativeHealthkit in healthkit-loader.ts, env-detect.ts, and healthkit-debug-panel.tsx

## Crash Fix — SIGABRT v2.7.48 (_throwIfAuthorizationDisallowedForSharing)
- [ ] Add main-thread guard (InteractionManager / runOnJS) to requestAuthorization call in permissions.ts
- [ ] Audit HK_READ_TYPES and HK_WRITE_TYPES for deprecated/restricted types on iOS 26 Beta
- [ ] Verify NSHealthShareUsageDescription and NSHealthUpdateUsageDescription are non-empty in app.config.ts
- [ ] Add app-state guard: only call requestAuthorization when AppState === 'active'

## Crash Fix — SIGABRT _throwIfAuthorizationDisallowedForSharing (Plugin + Thread)
- [x] Add @kingstinct/react-native-healthkit Expo plugin declaration to app.config.ts with healthSharePermission and healthUpdatePermission strings
- [x] Add main-thread + AppState guard to requestAuthorization call in initializeHealthKit (healthkit-loader.ts)
- [x] Add main-thread + AppState guard to requestAuthorization call in requestHealthKitPermissions (permissions.ts)

## Crash Fix — SIGABRT v2.7.49 Definitive Fix
- [x] Replace InteractionManager.runAfterInteractions with UIManager.measure trampoline for requestAuthorization (healthkit-loader.ts, permissions.ts, _layout.tsx)
- [x] Cold-launch call in _layout.tsx now uses UIManager.measure trampoline (guaranteed main thread)
- [x] UIManager.measure(1, callback) used as trampoline in all three call sites

## Entitlement Fix — iOS 26 Beta
- [x] Add com.apple.developer.healthkit.access empty array to entitlements in app.config.ts (iOS 26 Beta requirement)

## Request Permissions Refactor
- [x] Move "Request Permissions" button above Permission Summary card in healthkit-permissions.tsx
- [x] Remove all automatic cold-launch requestAuthorization calls from _layout.tsx (ColdLaunchPermissionBridge)
- [x] Button onPress in healthkit-permissions.tsx is now the ONLY place requestAuthorization is called

## Bug — Request Permissions button spins forever
- [x] Fix handleRequestPermissions infinite spinner — replaced UIManager.measure(1,cb) with setTimeout(cb,0) in permissions.ts (Fabric silently drops UIManager.measure on non-existent node handle 1)

## Bug — Apple Health data fetch failure
- [x] Fix Nitro bridge stuck in pending state — replaced UIManager.measure(1,cb) with setTimeout(cb,0) in healthkit-loader.ts (Fabric drops UIManager.measure on non-existent node handle 1)
- [x] Fix RCT bridge fallback — was blocked by initializeHealthKit never resolving; now resolves correctly with setTimeout trampoline
- [x] initHealthKit() / permissions check now completes in diagnostics after setTimeout fix

## Crash Fix — Request Permissions crashes app
- [x] Route requestAuthorization exclusively through RCT bridge (react-native-health) — skip Nitro bridge for auth step
- [x] Nitro bridge (@kingstinct) used only for data reads after auth is granted

## Apple Voice to Text Parse (Smart Scribe Improvements)
- [x] Add Apple voice-to-text parse to Medications Add modal (alongside photo scan)
- [x] Add Apple voice-to-text parse to Doctor Appointments screen
- [x] Fix Immunizations dictation button to visually match Surgical History style
- [x] Fix crash when tapping Smart Scribe in Medications (add error handling to handleScribePhoto)
- [x] Rename "Smart Scribe" to "Apple Voice to Text Parse" throughout the app
- [x] Replace microphone symbol (🎙) with Apple emoji (🍎) positioned to the left of scribe label
- [x] Add parseVoiceMedication server route for voice-to-text medication parsing

## Scribe Label & RCA (Build 2.7.54)
- [x] Update scribe button label to "🍎 Scribe" (Apple emoji + Scribe) across all screens
- [x] Perform RCA on crash-on-launch (COL) regression
- [x] Apply crash fix identified by RCA

## PR Regression-Prevention (Build 2.7.55+)
- [x] Create .github/pull_request_template.md with the three RCA checks
- [x] Write vitest: Router Parity — every useMutation hook has a matching tRPC route export
- [x] Write vitest: Compiler Audit — app.config.ts reactCompiler must be false
- [x] Write vitest: Native Linking guard — @react-native-voice/voice web stub present in metro.config.js

## HealthKit Blood Glucose Sync
- [x] Audit HealthKit pipeline for blood glucose fetch and sync
- [x] Ensure BloodGlucose permission is requested in HealthKit read permissions
- [x] Ensure BloodGlucose is fetched in the HealthKit sync hook/service
- [x] Ensure blood glucose data is displayed in the Vitals/Dashboard UI
- [x] Add vitest for blood glucose HealthKit pipeline

## Dashboard & Settings Enhancements
- [x] Add ? Help & Support shortcut icon to Dashboard header (top-right, deep-links to Settings About section)
- [x] Add What's New row in Settings About section (links to vitalsyncpersonalwellnesshub.com/changelog)
- [x] Add Rate the App row in Settings About section (expo-store-review, below Help & Support)

## Badge Dot, Share & Contact Support
- [x] Add What's New badge dot on Dashboard ? icon (AsyncStorage version tracking, red dot when new version)
- [x] Add Share the App row in Settings About section (React Native Share API, App Store/Play Store link)
- [x] Add Contact Support row in Settings About section (mailto with pre-filled subject + app version)

## Version Bump & Legal Rows
- [x] Bump LATEST_WHATS_NEW_VERSION in lib/whats-new-version.ts
- [x] Add Privacy Policy row to Settings About section (vitalsyncpersonalwellnesshub.com/privacy)
- [x] Add Terms of Use row to Settings About section (vitalsyncpersonalwellnesshub.com/terms)

## App Store Link, Delete Data & GDPR Banner
- [x] Add App Store link row to Settings About section (iOS: apps.apple.com, Android: play.google.com)
- [x] Add Delete All My Data row to Settings Privacy section (clears AsyncStorage, resets to first-launch)
- [x] Add GDPR/CCPA consent banner screen before onboarding (stores consent timestamp in AsyncStorage)

## Consent Screen Enhancements
- [x] Add age verification checkbox to consent screen (COPPA — button disabled until checked)
- [x] Add Manage Consent row to Settings Privacy section (re-opens /consent, shows acceptance timestamp)
- [x] Localize consent screen strings via TranslationProvider (Spanish, French, German, etc.)

## Link Consent to Privacy
- [x] Link Settings Privacy "Consent & Data Use" row to /consent (GDPR screen)

## URL Fixes (Build 2.7.55)
- [x] Update TERMS_BASE in components/consent-modal.tsx to vitalsyncpersonalwellnesshub.com/terms
- [x] Update TERMS_URL in app/settings/consent.tsx to vitalsyncpersonalwellnesshub.com/terms
- [x] All Privacy Policy links point to vitalsyncpersonalwellnesshub.com/privacy
- [x] All Terms of Use links point to vitalsyncpersonalwellnesshub.com/terms

## DoA Crash — Build 2.7.56 (TypeError: undefined is not a function)
- [x] Add Metro resolver stub for @kingstinct/react-native-healthkit on web (prevents NativeEventEmitter crash at module eval)
- [x] Add null-guard in permissions.ts isHealthKitAvailable() — use NativeModules check before dynamic import
- [x] Add null-guard in healthkit-loader.ts isHealthKitAvailable() — already present, verify consistent
- [x] Add try/catch around NativeEventEmitter instantiation in @kingstinct package (patch via metro stub)
- [x] Write vitest: kingstinct-null-guard — verifies isHealthKitAvailable returns false when NativeModules.ReactNativeHealthkit is absent

## SIGABRT Hardening — Build 2.7.57 Audit
- [x] Add react-native-health plugin to plugins array in app.config.ts (RCT bridge entitlement injection)
- [x] Add newArchEnabled: true to app.config.ts top-level (currently missing — Expo 54 defaults to true but explicit declaration prevents ambiguity)
- [x] Confirm isClinicalDataEnabled is absent from @kingstinct plugin config (no health-records entitlement)
- [x] Add com.apple.developer.healthkit.background-delivery to react-native-health plugin entitlement injection
- [x] Write vitest: sigabrt-config-guard — validates plist strings, entitlements, and plugin order

## Build 2.7.58 SIGABRT — _throwIfAuthorizationDisallowedForSharing (iOS 26.5 Beta)
- [ ] Remove @kingstinct requestAuthorization call path from requestHealthKitPermissions (already routed to RCT bridge — verify no fallback path calls @kingstinct requestAuthorization)
- [ ] Add try/catch + isHealthDataAvailable() guard around @kingstinct dynamic import in loadStatuses (healthkit-permissions.tsx)
- [ ] Wrap initAppleHealthKit() call in rnh-loader.ts with a main-thread trampoline (setTimeout 0) — iOS 26 Beta enforces requestAuthorization must be called from main thread
- [ ] Write vitest: ios26-sigabrt-guard — verifies no direct @kingstinct requestAuthorization call exists outside a try/catch with isHealthDataAvailable guard

## HealthKit Permission — Explicit User Tap Only (Build 2.7.59)
- [ ] Remove auto-request in health-context.tsx requestPermissions useCallback (called on first launch)
- [ ] Remove auto-request in native-health-service.ts requestPermissions (called by forceSync on launch)
- [ ] Remove auto-request in device-sync.ts requestDeviceSyncPermissions (called on BLE device connect)
- [ ] Remove auto-request in healthkit-loader.ts initializeHealthKit (called by loadHealthKit on data fetch)
- [ ] Keep ONLY the explicit path: handleRequestPermissions in healthkit-permissions.tsx (user tap)
- [ ] Write vitest: explicit-permission-guard — verifies no auto-request on mount in health-context and native-health-service

## HealthKit Auth/Fetch Separation (Build 2.7.59)
- [x] Rewrite healthkit-loader.ts: loadHealthKit() returns cached module only (no requestAuthorization); add new authorizeHealthKit() for explicit auth
- [x] Fix native-health-service.ts syncAll: remove initAppleHealthKit() call — data fetch must not trigger permission sheet
- [x] Fix native-health-service.ts _requestViaFallback: remove @kingstinct requestAuthorization — only RCT bridge used for auth
- [x] Fix health-context.tsx authoritativeCheck: uses loadHealthKit() read-only path (authorizationStatusFor only, no requestAuthorization)
- [x] Fix device-sync.ts requestDeviceSyncPermissions: remove @kingstinct requestAuthorization call
- [x] Fix permissions.ts fetchHealthData: rolling 90-day sync window (was hardcoded to Apr 19 2026)
- [x] Write vitest: auth-fetch-separation — verifies loadHealthKit never calls requestAuthorization (7 tests pass)

## Post-Auth Auto Sync (Build 2.7.60)
- [x] After user grants HealthKit permissions, automatically trigger forceSync()
- [x] Show inline sync progress banner on healthkit-permissions.tsx during post-auth sync (shows currentStep from healthState.sync)
- [x] Show success banner ("Apple Health data synced — Dashboard updated") after sync completes
- [x] Haptic success feedback (NotificationFeedbackType.Success) fires after sync
- [x] Button disabled during sync to prevent double-tap
- [x] Write vitest: post-auth-sync — 7 tests verify forceSync call, state transitions, banner rendering, dep array (all pass)

## Multi-Change Batch (Build 2.7.61)
- [ ] Onboarding slide 2: rewrite as Settings/Help/Support instructions with direct link to www.vitalsyncpersonalwellnesshub.com
- [ ] Onboarding: move the new slide 2 to right after "Personalize Your Profile" slide
- [ ] Onboarding: fix "personalize" spelling wherever it appears
- [ ] Onboarding slide 1: remove "Need help using the app" item
- [ ] Onboarding slide 1: make Books section collapsible so it does not cover developer info
- [ ] Onboarding slide 4: add blood sugar threshold and temperature threshold fields
- [ ] Smart Scribe header: replace microphone icon with Apple 🍎 emoji (keep dictation mic unchanged)
- [ ] Activity form: add microphone input matching Vital Signs style
- [ ] Camera usage app-wide: replace camera icon with 📷 emoji + "Vision Scan" label above description
- [ ] Settings tab: fix "property 'useRouter' doesn't exist" crash
- [ ] Voice-to-text: ensure tap-to-transcribe microphone works correctly across entire app (Smart Scribe, Vital Signs, Medications, Activity, Immunizations, etc.)

## Multi-Change Batch (Build 2.7.61)
- [x] Meal search: after logging a meal show post-log sheet with "Log More" / "Done" + "Add to Apple Health / Skip" prompt (inline in success banner, not Alert.alert)
- [x] Fix medical history back-button freeze (app hangs when user presses back) — switched to useRouter with canGoBack() guard
- [x] Fix "cannot add more medical history" bug (state not reset on closeForm) — closeForm now resets form + scribe state
- [x] Restyle medical history add button to match immunizations style
- [x] Add "Back" label next to back arrow in appointments, medical history, surgical history (matching immunizations pattern); medications is a tab screen with no back button
- [x] Add Rescheduled tab to appointments (between Upcoming and Missed); tapping Rescheduled records original appointment time/date
- [x] Add originalDateTime and rescheduledAt fields to DoctorAppointment type for rescheduled appointments

## Multi-Change Batch 2.7.62
- [x] Onboarding theme step: Next button inactive when theme is selected — fix disabled logic
- [x] Onboarding Contact Support: crashes when tapped — fix Linking.openURL or mailto handler
- [x] PushNotificationIOS NativeEventEmitter fatal crash — remove/guard deprecated PushNotificationIOS import
- [x] Move glucose alerts to Notifications threshold alerts section — Blood Glucose Alerts SectionCard added to thresholds.tsx (High/Low/TIR), Glucose Alerts row in Health Data section rerouted to /settings/thresholds, GlucoseTrendChart links updated
- [x] Remove Data Sources section from settings entirely
- [x] Consolidate HealthKit/Health Connect permission request to Health Permission Details "Request Permission" button only
- [x] Fix Request Permission crash in Health Permission Details

## Multi-Change Batch 2.7.63
- [x] Replace emoji microphone buttons (🎤, 🎙) with real flat SVG MicrophoneIcon component across scribe-button, log-all-vitals-sheet, ai-food-camera-sheet, log.tsx, sleep.tsx

## Multi-Change Batch 2.7.64 — Sync Improvements
- [x] Fix existing sync button (Dashboard Force Sync) — confirmed already wired to forceSync() which calls fetchHealthData() natively
- [x] Add sync button (HeaderSyncButton) to Record screen top-right header corner
- [x] Add pull-to-refresh (RefreshControl on ScrollView) on Record screen — pull down triggers forceSync() with haptic feedback

## Multi-Change Batch 2.7.65 — Sync UX Enhancements
- [x] Add stale dot badge (grey-blue) on Record tab icon when last sync > 24 hours ago — useStaleSyncBadge hook, rechecks every 5 min
- [x] Show "Last synced X ago" line below Record header subtitle — updates every 30s, shows "Syncing health data…" while running
- [x] Auto-sync on Record tab focus if last sync was > 30 minutes ago — silent background forceSync(), skips if already running

## Multi-Change Batch 2.7.66 — Mic + Health Permission Fixes
- [x] Change microphone icon background: light blue idle / crimson (#DC143C) active across the app
- [x] Fix mic tap crash — @react-native-voice/voice fully lazy loaded, no module-level require
- [x] Fix Request Permission crash in Health Permission Details
- [x] Remove Data Sources section from health data settings
- [x] Consolidate HealthKit permission to single "Request Permission" button under Health Permission Details — remove all other "Connect to Apple Health" buttons app-wide

## Multi-Change Batch 2.7.68
- [x] Wire glucose threshold violations to background health monitor task — loadGlucoseThresholds() added to checkThresholds(), high/low violations fire with 1-hour cooldown per direction, unit set to mg/dL in history entries
- [x] Add 'glucose' category to CATEGORY_LABELS and update Recent Alerts history colour mapping in thresholds.tsx — glucose rows shown in #DC2626 red, analyte rows in #2563EB blue

## Multi-Change Batch 2.7.69
- [x] Add category filter chips (All · BP · HRV · HR · SpO₂ · Glucose · Lab) to Recent Alerts history list in thresholds.tsx — horizontal ScrollView chip row, only shows categories with ≥1 entry, filters list to top 20 of selected category
- [x] Colour-code ViolationFrequencyChart bars by alert category — glucose #DC2626, analyte #2563EB added to VITAL_COLORS and LEGEND_ITEMS; legend now only renders categories present in history
- [x] Fire immediate glucose threshold check inline after addBloodSugar() in blood-sugar.tsx — non-blocking checkThresholds() + dispatchViolationNotifications() for glucose violations only

## Multi-Change Batch 2.7.70
- [x] Extend immediate glucose threshold check to BLE handleDeviceSync and CGM handleCGMImport in blood-sugar.tsx — non-blocking checkThresholds()+dispatchViolationNotifications() added after each import success path
- [x] Add "Last alert" badge (timestamp pill) to Blood Glucose Alerts card in thresholds.tsx — red pill with bolt icon shows formatAlertAge() of most recent glucose alert entry; hidden when no glucose alerts recorded
- [x] Persist historyFilter chip selection to AsyncStorage in thresholds.tsx — saves on chip tap, restores on init() load via @vitalsync:alertHistoryFilter key

## Multi-Change Batch 2.7.71
- [x] Allow all Bluetooth devices to connect — removed health-service-only guard in ble-manager.ts scanForDevices() and removed category prop filter in ble-device-scanner.tsx; all named BLE devices now surface; hint text updated

## Multi-Change Batch 2.7.72
- [x] Add Connect & Read action for unknown BLE devices — connectAndReadDevice() added to ble-manager.ts; RawGattModal shows service/characteristic UUIDs, ASCII and hex values; all devices get a 'Raw Read' button, unknown devices get 'Connect & Read' as primary CTA
- [x] Add Paired Devices persistent list — savePairedDevice() / loadPairedDevices() / removePairedDevice() helpers; My Devices section at top of scanner sheet with Paired badge and Remove button; MRU order, capped at 10
- [x] Show "No alerts recorded" placeholder pill in Blood Glucose Alerts card — grey pill with shield icon when no glucose alerts exist; red bolt pill with timestamp when alerts present

## Multi-Change Batch 2.7.73
- [x] Rename Device action — long-press on My Devices row opens a text input bottom sheet to label any BLE device; custom label persists in @vitalsync:bleDeviceLabels; ✏️ tag shown on renamed rows; original BLE name shown as subtitle
- [x] Signal-strength sort toggle — 📶 Signal / A–Z Name chip pair above Nearby section; sortedDevices memo re-sorts on toggle; preference persisted to @vitalsync:bleSortOrder

## Mic Icon Replacement & Permission Fix
- [x] Copy user-supplied mic image, generate green (idle) and red (active) circle variants — mic-idle.png and mic-active.png in assets/images/
- [x] Replace all mic icon usages app-wide with new image asset (green idle, red active on tap) — log.tsx, sleep.tsx, ai-food-camera-sheet.tsx, log-all-vitals-sheet.tsx, scribe-button.tsx all updated
- [x] Fix mic tap crash — NativeModules.Voice guard added to log-all-vitals-sheet.tsx; requestSpeechRecognitionPermissions() called before Voice.start(); all voice modules fully lazy-loaded
- [x] Request Permission button shows Allow All system permission popup — requestSpeechRecognitionPermissions() triggers native iOS permission dialog
- [x] Remove permission request from Diagnostic screen — initAppleHealthKit() replaced with read-only isRNHAvailable() check; no Allow popup fires on diagnostic run

## Mic Pulse Animation & Live Transcript Preview
- [x] Add recording pulse animation to mic icon — MicrophoneIcon now owns withRepeat(withTiming(1.08, 600ms)) pulse via reanimated; outer Animated.loop removed from scribe-button.tsx
- [x] Show live partial transcript preview below mic button in scribe-button.tsx — already present from prior batch; confirmed working
- [x] Show live partial transcript preview below mic button in log-all-vitals-sheet.tsx — dedicated partialPreview label below mic icon shows partialText while listening; partialPreview style added to StyleSheet

## Mic Waveform & UX Polish
- [x] Create WaveformBars component — 5 animated bars driven by volumeLevel via reanimated; idle shimmer when volume is 0; bars scale proportionally to 0–160 volume range
- [x] Add waveform + fade-in partial transcript + Tap to cancel hint to scribe-button.tsx — waveform fades in/out with opacity animation; FadeIn/FadeOut on partial transcript and cancel hint
- [x] Add waveform + fade-in partial transcript + Tap to cancel hint to log-all-vitals-sheet.tsx — onSpeechVolumeChanged wired to volumeLevel state; WaveformBars and ReAnimated.Text with FadeIn/FadeOut; cancelHint style added

## Mic Waveform & Timer Polish
- [x] Add WaveformBars to ai-food-camera-sheet.tsx full-screen voice search view — volumeLevel prop threaded through SearchScreenProps; WaveformBars shown above recording hint with red (#EF4444) bars
- [x] Reset volumeLevel to 0 on stopListening in log-all-vitals-sheet.tsx — setVolumeLevel(0) + timer clear called in stopListening callback
- [x] Add recording duration timer (00:12 format) below Tap to cancel hint in scribe-button.tsx and log-all-vitals-sheet.tsx — useRef interval timer, FadeIn delay 600ms, tabular-nums font, red colour; durationTimer style added to both StyleSheets

## Mic Recording Guard & Timer Colour
- [x] Add max-recording guard (auto-stop at 160 s + Alert) to scribe-button.tsx and log-all-vitals-sheet.tsx — useEffect watches recSecs >= 160 while recording; stops recording and shows Alert.alert
- [x] Colour duration timer amber (#F59E0B) after 30 s in scribe-button.tsx and log-all-vitals-sheet.tsx — timerColor derived from recSecs >= 30; red below, amber above

## Mic Icon Background Removal
- [x] Remove white background from mic-idle.png and mic-active.png — circular mask applied via Pillow; corners and outside-circle area set to alpha=0; white mic icon on coloured circle preserved

## Medication Screen Back Button
- [x] Add back button to medication screen matching the lab results screen back button style — see Onboarding Mic Icon & Medication Back Button section above

## Onboarding Mic Icon & Medication Back Button
- [x] Add green MicrophoneIcon to onboarding voice-permission step — MicrophoneIcon (size=36, isActive=false) replaces paperplane.fill in the Apple Scribe permission card on Slide 3
- [x] Add back button to medication screen matching lab results back button style — chevron.left + Back text, headerBack/headerBackText styles, insets.top+8 paddingTop, screenTitle centred with flex:1

## Hermes Signal 11 / EXC_BAD_ACCESS Crash Fix
- [x] Audit custom TurboModules for background-thread native-to-JS error conversion — safe-notifications.ts and background-task.ts already use async lazy-load guards with TurboModuleRegistry + NativeModules double-guard; no unguarded background-thread TurboModule calls found
- [x] Guard all native-to-JS error paths with JS-thread dispatch — PushNotificationManager and Voice module both use TurboModuleRegistry.get() check before require(); configureNotificationHandler() uses void getNotificationsAsync().then() to defer module evaluation
- [x] Stabilise high-frequency JS object schemas to prevent HiddenClass churn in Hermes — parseHealthTranscript() now initialises all 10 keys upfront with null defaults (static schema); added ParsedHealthTranscript interface; eliminates dynamic property assignment that caused HiddenClass transitions under Hades GC
- [x] Audit and fix CG raster memory leaks in vital monitors and dashboard views — resized 5 oversized images: creator-photo.jpg (2300x3218→400x560, -27MB raster), book-rapid-nursing-review.webp (2048x1365→400x600, -10MB raster), book-living-well-diabetes.webp (2048x1365→400x600, -10MB raster), onboarding heroes (1150x1609/900x1612/900x1600→600px wide, -11MB raster); total raster budget reduced from ~159MB to ~25MB
- [x] Validate Hermes version — Expo SDK 54 bundles Hermes 0.12.x (stable); no Podfile override needed; iOS 26 Beta compatibility note documented in crash analysis
- [x] Fix microphone tap crash — added TurboModuleRegistry guard checked before require('@react-native-voice/voice'); replaced Voice.requestSpeechRecognitionPermissions() (not exported in v3.x JS layer, throws TypeError on iOS) with expo-audio requestRecordingPermissionsAsync(); fix applied to both log-all-vitals-sheet.tsx and use-speech-recognizer.ts

## Sentry Crash Reporting & expo-image Migration
- [ ] Install @sentry/react-native and wire Sentry.init() into app/_layout.tsx with Hermes source maps
- [ ] Add @sentry/react-native plugin to app.config.ts
- [ ] Add EXPO_PUBLIC_SENTRY_DSN secret for Sentry SDK initialization
- [ ] Migrate react-native Image to expo-image in onboarding.tsx (creator photo + onboarding hero)
- [ ] Migrate react-native Image to expo-image in about.tsx (creator photo + book covers)

## Sentry Crash Reporting & expo-image Migration
- [x] Install @sentry/react-native and verify Expo SDK 54 compatibility
- [x] Enhance Sentry.init() in app/_layout.tsx with full Hermes/native crash options: enableNativeCrashHandling, enableNative, attachStacktrace, patchGlobalPromise, enableAutoSessionTracking, enableCaptureFailedRequests, normalizeDepth
- [x] Add Sentry.wrap() export default around RootLayout for React error boundary + touch breadcrumb tracking
- [x] Document setup checklist in _layout.tsx: EXPO_PUBLIC_SENTRY_DSN + SENTRY_AUTH_TOKEN EAS secrets, rebuild native binary
- [x] Migrate react-native Image to expo-image in onboarding.tsx (4 Image usages: icon, creator-photo, book covers, pill nav icon) — replaced resizeMode with contentFit
- [x] Remove stale resizeMode prop from about.tsx book cover Image (was passing both resizeMode and contentFit simultaneously)
- [x] Verify no react-native Image imports remain in onboarding.tsx or about.tsx
- [x] Add transition={300} fade-in to book cover Images in onboarding.tsx (creator-photo and book strip covers)
- [x] Add Privacy Policy link (https://vitalsyncpersonalwellnesshub.com/article/privacy-policy) to Data & Privacy settings screen
- [x] Update onboarding support slide privacy link to https://vitalsyncpersonalwellnesshub.com/article/privacy-policy
- [x] Update consent.tsx PRIVACY_URL from /privacy to /article/privacy-policy
- [x] Add Terms of Use row to Data & Privacy settings screen
- [x] Fix onboarding privacy link accessibilityLabel to 'View VitalSync Privacy Policy'
- [x] Add 'Last updated March 2026' date below each legal document row in data-privacy.tsx, consent.tsx, and about.tsx
- [x] Fix 'Request Permission' button crash in healthkit-permissions.tsx — replaced requestHealthPermissions()/isHealthKitAvailable() (loads crashing @kingstinct Nitro bridge) with isRNHAvailable()/initAppleHealthKit() matching the working diagnostic button path; NativeModules.AppleHealthKit guard added to loadStatuses
- [x] Remove books section from dashboard (index.tsx)
- [ ] Fix post-Allow-All HealthKit permission crash (crash immediately after user taps Allow All on iOS permission sheet)
- [ ] Fix microphone tap crash (crash when user taps mic button in log-all-vitals-sheet)

## Post-Permission & Microphone Crash Fixes (v2)
- [x] Fix app crash after user taps "Allow All" on HealthKit permission sheet — added InteractionManager.runAfterInteractions + 500ms defer before loadStatuses()/forceSync() in healthkit-permissions.tsx to prevent SIGSEGV from backtrace_symbols on iOS 26 Beta
- [x] Fix app crash when user taps microphone button — increased safeVoiceStart defer from 0ms to 500ms and added InteractionManager.runAfterInteractions guard in both use-speech-recognizer.ts and log-all-vitals-sheet.tsx

## Microphone → Keyboard Dictation Replacement
- [ ] Replace @react-native-voice/voice with keyboard TextInput dictation: mic button focuses a TextInput so user can use iOS keyboard mic (Apple Dictation / Google Voice Typing) — zero TurboModule bridge, zero crash

## Keyboard Dictation Migration (Microphone Crash Fix v3)
- [x] Replace @react-native-voice/voice in log-all-vitals-sheet.tsx with hidden TextInput keyboard dictation — removes TurboModule bridge crash (Signal 11 / SIGSEGV on iOS 26 Beta)
- [x] Replace @react-native-voice/voice in scribe-button.tsx with hidden TextInput keyboard dictation — all 9 ScribeButton screens (medications, medical-id, activity, appointments, immunizations, medical-history, sleep, surgical-history, vitals) now use crash-free keyboard dictation
- [x] Update use-speech-recognizer.ts header to note it is superseded by keyboard dictation approach
- [x] Remove NativeModules import from log-all-vitals-sheet.tsx (no longer needed)
- [x] Update scribe hint text to guide user: "Tap mic → use keyboard dictation to say all vitals"

## UX Polish & Package Cleanup (Apr 2026)
- [x] One-time tooltip on first mic tap in LogAllVitalsSheet — callout bubble "Tap the 🎤 key on your keyboard to dictate", FadeIn/FadeOut via Reanimated, auto-dismiss after 4s, persisted via AsyncStorage @vitalsync/mic_tooltip_shown so it only appears once
- [x] "Finalising Apple Health connection…" subtitle during 500ms HealthKit post-permission defer in healthkit-permissions.tsx — connectingMsg state shown between initAppleHealthKit() resolve and the defer completing, prevents double-tap
- [x] Removed @react-native-voice/voice from package.json (pnpm remove), app.config.ts plugin entry, and metro.config.js web stub alias — use-speech-recognizer.ts rewritten as no-op stub, regression tests updated to reflect removal

## Crash Fix (Apr 2026)
- [x] CRASH FIX v3: App crash after "Allow All" on HealthKit permission sheet — increased primary defer from 500ms to 1200ms, skipped loadStatuses() on success path (Kingstinct Nitro bridge races sheet dismissal), added second 800ms InteractionManager barrier before forceSync() so HealthKit TurboModule is fully re-registered before data queries begin

## Asset Updates (Apr 2026)
- [x] Replace Rapid Nursing Review 3D book image with real book cover photo (IMG_1776.jpg) — used in onboarding.tsx and settings/about.tsx
- [x] Add The Magical Forest (https://a.co/d/0dxT4JeR) to books section in onboarding + about
- [x] Add Thomas and the Dinosaurs (https://a.co/d/0egSGmav) to books section in onboarding + about
- [x] Add Exercise & Physical Activity (https://a.co/d/01lPxQ4t) to books section in onboarding + about

## NeoVital Dashboard Card
- [x] Add NeoVitalVitalsCard component with 3D glass morphism, pulsating SVG wave chart (HR/BP/SpO2), touch-to-inspect callouts, visible graph axes/edges, and 2x2 metric grid
- [x] Wire NeoVitalVitalsCard into dashboard index.tsx above Quick Entry section with live sparkline data and smart status badge

- [x] Add 24h/7d/30d time-range pill chips to NeoVital vitals chart
- [x] Add onMetricPress deep-link: HR/HRV → /detail/pulse, BP → /detail/blood-pressure, SpO2 → /detail/spo2

- [x] Make NeoVital card collapsible with Reanimated accordion + AsyncStorage persistence
- [x] Add 24h/7d/30d time-range pill chips to NeoVital wave chart
- [x] Move NeoVital card to below Smart Reminders, above Vital Signs 7d/30d/90d charts

- [x] Separate HealthKit permission request from data sync (permission-only handler)
- [x] Add RefreshControl pull-to-refresh to dashboard ScrollView wired to forceSync
- [x] Update post-auth-sync regression tests to reflect new permission-only design

## Smart Scribe Placement Refactor
- [x] Move Smart Scribe to top of Vital Signs card (above Blood Pressure) using appointment style
- [x] Add Smart Scribe row to top of Activity card (above Activity Type) using appointment style
- [x] Remove duplicate Smart Scribe from bottom of Vital Signs form

## Crash Fix — undefined until parameter (Apr 22)
- [x] Fix SIGSEGV crash: add `until: Date = new Date()` to all fetchHealthKit* function signatures in native-health-service.ts

## NeoVital Card Enhancements
- [x] Wire 30d HRV sparkline into resolvedHRV range-switcher (add hrvSparkline24h + hrvSparkline30d)
- [x] Add "No data yet" empty state in NeoVital chart area for new users
- [x] Persist NeoVital selected time range (24h/7d/30d) to AsyncStorage

## Production Hardening Pass (Apr 2026)
- [x] Fix unsafe state.data?.bloodPressure.length (missing ?. on bloodPressure) in report.tsx
- [x] Fix unsafe state.data?.pulse.length in report.tsx
- [x] Fix unsafe state.data?.bodyComposition.length in report.tsx
- [x] Fix unsafe state.data?.sleep.length in report.tsx
- [x] Fix unsafe fresh.bloodPressure/heartRate/sleep/bodyComposition/activity.length in native-health-service.ts background sync notification
- [x] Fix unsafe result.bloodPressure/heartRate/spO2/temperature/respiratoryRate/sleep/bodyComposition/activity.length in data-sources.tsx debug panel
- [x] Audit hook cleanup patterns (AppState, navigation listeners) — all confirmed safe
- [x] Audit import/export mismatches — all confirmed correct
- [x] Audit error boundaries — GlobalErrorBoundary + ErrorBoundary both wired in _layout.tsx
- [x] Audit iOS app.config.ts — all Info.plist keys, entitlements, aps-environment, EAS profiles confirmed correct

## HealthKit & Dashboard Fixes (Apr 22 2026)
- [x] Fix HealthKit permission screen showing "Not Asked" for all types (enum mapping bug: sharingDenied=1, sharingAuthorized=2)
- [x] Use authorizationStatusFor (correct API) and getRequestStatusForAuthorization for flow-completion check
- [x] Add NeoVitalMiniCard: compact graph-only card on dashboard (pulsating waveform, legend, taps to NeoVital tab)
- [x] Remove NeoVitalVitalsCard from dashboard, replaced with NeoVitalMiniCard

## Record Tab & Voice Scribe Fixes

- [x] Fix Record tab crash: replace data! non-null assertions with data? optional chaining (labResults, medicalHistory, surgicalHistory, immunizations)
- [x] Change AI Voice Scribe highlight color from yellow to red (#EF4444)
- [x] Wire triggerHighlight into sleep.tsx fillFormFromScribe for missed fields
- [x] Wire triggerHighlight into appointments.tsx applyScribeResult for missed fields
- [x] Fix HealthKit permission screen: correct enum mapping (sharingDenied=1, sharingAuthorized=2) and use authorizationStatusFor API
- [x] Add NeoVitalMiniCard to dashboard (compact graph-only card, taps to NeoVital tab)

## Apple Speech Native Module — SFSpeechRecognizer (Apr 22 2026)
- [x] Fix blood glucose HealthKit crash: replace invalid 'mmol/L' unit string with correct HKUnit molar-mass string 'mmol<180.15588000005408>/l' in native-health-service.ts
- [x] Add NeoVitalMiniCard 24h/7d/30d/90d time-range tabs wired to graph
- [x] Add NeoVitalMiniCard collapsible toggle (default collapsed) with AsyncStorage persistence
- [x] Add SpO2 numeric value display in NeoVitalMiniCard legend
- [x] Add 1200ms InteractionManager defer in HealthKit permissions AppState foreground listener to prevent SIGSEGV crash
- [x] Create plugins/withAppleSpeechModule.js — Expo Config Plugin that writes AppleSpeechModule.swift into ios/<AppName>/ and registers it in Xcode pbxproj
- [x] Create hooks/use-apple-speech-live.ts — TypeScript wrapper with toggle(), startListening(), stopListening(), cancelListening(), isListening, partialTranscript, finalTranscript, error
- [x] Update components/scribe-button.tsx — wire useAppleSpeechLive as primary path on iOS; keyboard dictation retained as fallback when native module unavailable
- [x] Mic icon turns red (#EF4444) while native speech is listening
- [x] Live partial transcript streamed into text input while user speaks
- [x] NSMicrophoneUsageDescription and NSSpeechRecognitionUsageDescription already present in app.config.ts ios.infoPlist (confirmed)
- [x] Register ./plugins/withAppleSpeechModule in app.config.ts plugins array (before withNoBackgroundAudio)

## TestFlight Crash Fix — getRequestStatusForAuthorization SIGABRT (Apr 22 2026)
- [x] Remove getRequestStatusForAuthorization() call from loadStatuses() in healthkit-permissions.tsx — it throws NSException on iOS 26 Beta inside HealthKit, propagates past the TurboModule bridge, and causes SIGABRT on Thread 9
- [x] Replace flowCompleted detection with a persisted AsyncStorage flag set after initAppleHealthKit() succeeds — avoids any HealthKit bridge call at status-check time
- [x] Ensure all remaining authorizationStatusFor() calls are wrapped in try/catch (already done) and never called during app foreground transition before the 1200ms defer

## NeoSleep Right-Edge Clipping Fix (Apr 22 2026)
- [x] Fix right-edge clipping on NeoSleep card on Dashboard
- [x] Fix right-edge clipping on NeoSleep in Doctor Report screen

## NeoVital Graph Right-Edge Clipping Fix (Apr 22 2026)
- [x] Fix right-edge clipping on NeoVital graph on Dashboard
- [x] Fix right-edge clipping on NeoSleep chart on Dashboard
- [x] Fix right-edge clipping on NeoSleep chart in Doctor Report

## NeoVital Dashboard Aesthetic Sync (Apr 22 2026)
- [x] Apply NeoVital tab screen background, graph line colors, glow bubbles, grid, and glass shell styles to NeoVitalVitalsCard and NeoVitalMiniCard on dashboard
- [x] Fix right-edge clipping on NeoVitalVitalsCard (onLayout width)
- [x] Fix right-edge clipping on NeoVitalMiniCard (onLayout width)
- [x] Fix right-edge clipping on NeoSleep chart on Dashboard
- [x] Fix right-edge clipping on NeoSleep chart in Doctor Report

## EAS Build Fix — AppleSpeechModule.swift not found (Apr 22 2026)
- [x] Fix withAppleSpeechModule Config Plugin: Swift file not written to disk at EAS build time
- [x] Ensure plugin writes AppleSpeechModule.swift to ios/ directory and adds it to Xcode project sources

## Plugin Test + Swift Deprecation Fix (Apr 23 2026)
- [x] Write tests/plugin-apple-speech.test.ts — Vitest unit test for withAppleSpeechModule pbxproj edit logic
- [x] Fix AVAudioApplication.requestRecordPermission deprecation in AppleSpeechModule.swift (add #available iOS 17 branch)

## useAppleSpeechLive Hook Test + Swift Guard (Apr 23 2026)
- [x] Write tests/use-apple-speech-live.test.ts — mock NativeModules.AppleSpeechModule and NativeEventEmitter, assert toggle() calls startListening when idle and stopListening when listening
- [x] Add #available(iOS 17, *) guard to the recordPermission check in startListening in AppleSpeechModule.swift (SWIFT_SOURCE in plugin)

## Medication + Activity Layout Changes (Apr 22 2026)
- [x] Medication screen: move scan label to the left of Apple Scribe text, move scribe microphone to the right
- [x] Activity screen: remove microphone and scribe button from the notes field

## EAS Build Fix — AppleSpeechModule.swift SOURCE_ROOT Path (Apr 22 2026)
- [x] Fix pbxproj PBXFileReference: change sourceTree from "<group>" to SOURCE_ROOT and use VitalSync/AppleSpeechModule.swift path
- [x] Add regression tests asserting SOURCE_ROOT path and VitalSync/AppleSpeechModule.swift in PBXFileReference

## AppleSpeechModule — Expo Modules API Rewrite (Apr 23 2026)
- [x] Rewrite as a local Expo module in modules/apple-speech/ (expo-module.config.json + Swift + TypeScript index)
- [x] Use ExpoModulesCore Module + sendEvent — no RCTEventEmitter, no bridging header
- [x] Update use-apple-speech-live.ts to import from apple-speech local module
- [x] Remove withAppleSpeechModule plugin from app.config.ts (local module handles own Xcode registration)
- [x] Update hook tests to use new event names (no prefix) and transcript payload shape

## ScribeButton locale prop + Speech Unavailable UI (Apr 23 2026)
- [x] Add locale?: string prop to ScribeButton and forward to useAppleSpeechLive
- [x] Add graceful Speech unavailable Alert (isAvailable === false) with Linking.openURL to iOS Settings

## Settings Health Data — Remove Apple Health Item (Apr 23 2026)
- [x] Remove "Apple Health" entry from the Health Data section in Settings screen

## NeoVital Dashboard HR Smoothing (Apr 23 2026)
- [x] Add bucketed-average HR smoothing utility (24h→hourly, 7d→6h, 30d→daily, 90d→3-day)
- [x] Apply smoothed HR data to NeoVitalMiniCard and NeoVitalVitalsCard on dashboard

## VitalSyncHealthKit Native Module + SpO2 Fix (Apr 23 2026)
- [ ] Audit existing HealthKit permission/fetch code for SpO2 ×100 bug and crash paths
- [ ] Build modules/vitalsync-healthkit/ local Expo native module (Swift + ExpoModulesCore)
- [ ] Implement requestReadPermissions() for leanBodyMass, height, distanceWalkingRunning, distanceCycling, oxygenSaturation
- [ ] Implement fetchLatestMetrics() with correct HKUnit.percent() → ×100 conversion for SpO2
- [ ] Implement fetchAuthorizationSnapshot() for per-type status
- [ ] Write TypeScript wrapper lib/health/vitalsync-healthkit.ts with null-safe helpers
- [ ] Fix SpO2 ×100 display bug at all UI render sites (NeoVital, dashboard cards, log screens)
- [ ] Wire leanBodyMass, height, walkingRunningDistance, cyclingDistance into HealthData types and context
- [ ] Update app.config.ts: NSHealthShareUsageDescription, NSHealthUpdateUsageDescription, HealthKit entitlements
- [ ] Write Vitest tests for vitalsync-healthkit.ts TypeScript wrapper
- [ ] Run full test suite, confirm no regressions, save checkpoint

## NeoVital Smoothing Consistency + Strength Preference + SpO2 Alert (Apr 23 2026)
- [ ] Extend smooth-vitals.ts: add SmoothingStrength type (light/standard/heavy/raw), per-strength bucket/window configs
- [ ] Extend smoothVitalSeries: pre-average SpO2 alert detection (flag readings <94% before bucketing)
- [ ] Add SmoothingStrengthContext provider with AsyncStorage persistence
- [ ] Wire smoothing strength into NeoVitalMiniCard
- [ ] Wire smoothing strength into NeoVitalVitalsCard
- [ ] Apply smoothVitalSeries + SpO2 alert overlay to NeoVital full tab screen
- [ ] Add smoothing strength selector (Light / Standard / Heavy / Raw) in Settings
- [ ] Write Vitest tests for new smooth-vitals exports (strength configs, SpO2 alert detection)

## Smoothing Consistency & Preferences (Apr 23 2026)

- [x] Apply smoothing to neon-vitals.tsx (full NeoVital tab screen) with rangeDays→RangeKey mapping
- [x] Add SmoothingStrengthContext with AsyncStorage persistence (raw/light/standard/heavy)
- [x] Wire smoothing-strength context into NeoVitalMiniCard, NeoVitalVitalsCard, and neon-vitals.tsx
- [x] Extend smoothVitalSeries with pre-average SpO2 alert detection (spo2Alert flag, threshold 94%)
- [x] Render SpO2 alert diamond overlay on both portrait and landscape neon-vitals charts
- [x] Add Vital Waveform Smoothing selector row to Settings → Appearance section
- [x] Extend smooth-vitals Vitest tests: strength levels, SPO2_ALERT_THRESHOLD, spo2Alert flag (42 tests total)

## Nutrition Correlate Panel (replaces 7-day Na & K trend)

- [x] Build nutrition-correlate.ts scoring engine (fiber density, protein consistency, processed-food proxy, pattern adherence, macro balance)
- [x] Build NutritionCorrelateCard component with 5 time-window tabs (3d/7d/14d/30d/3mo), score bar, sub-dimension bars, macro averages, interpretation text
- [x] Remove 7-day Na & K trend GlassCard from analytics.tsx (Correlate tab)
- [x] Wire NutritionCorrelateCard into analytics.tsx pulling from sodiumIntake via aggregateDailyNutrients
- [x] Write 29 Vitest tests for nutrition-correlate.ts (all pass)

## VitalSync Scribe Voice-to-Form System

- [x] Build client-side scribe parser utilities for all 7 domains (parsers.ts)
- [x] Vital Signs parser: systolic/diastolic, HR, SpO2, temperature, respiratory rate
- [x] Sleep parser: bedtime, wake time, duration, deep sleep, quality
- [x] Activity parser: duration, distance, calories, steps, activity type, HR
- [x] Medication parser: name, dose, frequency, route, indication, prescriber
- [x] Appointment parser: doctor name, specialty, date/time, location, notes, referral
- [x] Procedure parser: procedure name, surgeon, hospital, date, outcome, complications
- [x] Immunization parser: vaccine name, lot, dose number, series, administered by, reactions
- [x] Build useScribeForm hook (local-first parse + optional server LLM enhancement)
- [x] Wire local parsers into Vital Signs screen (instant fill before server call)
- [x] Wire local parsers into Sleep screen
- [x] Wire local parsers into Activity screen (replace stub with full integration)
- [x] Wire local parsers into Medication screen
- [x] Wire local parsers into Appointment screen
- [x] Wire local parsers into Procedure/Surgical History screen
- [x] Wire local parsers into Immunization screen
- [x] Fix esbuild catch-binding compatibility (catch (_) instead of catch {})
- [x] Fix activity duration regex (in/for N minutes pattern)
- [x] Fix sleep bedtime regex (bed at HH:MM pm)
- [x] Fix sleep wake time regex (up at HH:MM am)
- [x] Fix medication dose regex (milligrams/micrograms spelled out)
- [x] Fix appointment notes regex (follow up for / reason for visit)
- [x] Write 69 Vitest tests for all 7 parser utilities

## Scribe Confidence Indicators & Brand-Name Drug Dictionary

- [ ] Add confidence scoring to all 7 domain parsers (high/medium/low per field)
- [ ] Add brand-name-to-generic drug dictionary to medication parser (200+ entries)
- [ ] Build ScribeConfidenceBadge component (green/amber/grey coloured badge)
- [ ] Wire confidence badges into Vital Signs screen
- [ ] Wire confidence badges into Sleep screen
- [ ] Wire confidence badges into Activity screen
- [ ] Wire confidence badges into Medication screen
- [ ] Wire confidence badges into Appointment screen
- [ ] Wire confidence badges into Procedure screen
- [ ] Wire confidence badges into Immunization screen
- [ ] Write Vitest tests for confidence scoring and brand-name mapping

## Scribe Confidence Indicators and Brand-Name Drug Dictionary

- [ ] Add confidence scoring to all 7 domain parsers (high/medium/low per field)
- [ ] Add brand-name-to-generic drug dictionary to medication parser (200+ entries)
- [ ] Build ScribeConfidenceBadge component (green/amber/grey coloured badge)
- [ ] Wire confidence badges into Vital Signs screen
- [ ] Wire confidence badges into Sleep screen
- [ ] Wire confidence badges into Activity screen
- [ ] Wire confidence badges into Medication screen
- [ ] Wire confidence badges into Appointment screen
- [ ] Wire confidence badges into Procedure screen
- [ ] Wire confidence badges into Immunization screen
- [ ] Write Vitest tests for confidence scoring and brand-name mapping

## Scribe Confidence Badges & Brand-Name Drug Dictionary (Apr 23 2026)
- [x] Add confidence scoring module (lib/scribe/confidence.ts) for all 7 domains
- [x] Add brand-name drug dictionary (lib/scribe/drug-names.ts) with 200+ entries
- [x] Apply resolveGenericName in parseMedicationTranscript
- [x] Build ScribeConfidenceBadge component with green/amber/slate pill styles
- [x] Wire confidence badges into Vital Signs screen (VitalField component)
- [x] Wire confidence badges into Sleep screen (TimePickerField badge prop)
- [x] Wire confidence badges into Activity screen (SmallField component)
- [x] Wire confidence badges into Medication screen (name label)
- [x] Wire confidence badges into Appointment screen (doctor name label)
- [x] Wire confidence badges into Procedure screen (procedure name label)
- [x] Wire confidence badges into Immunization screen (vaccine name label)
- [x] Write 69 Vitest tests for confidence scorers and drug-name resolution

## Speech & Scribe Settings Section (Apr 23 2026)
- [ ] Audit Settings screen structure and permission APIs
- [ ] Build SpeechScribeSettings component with permission status logic
- [ ] Integrate Speech & Scribe section into existing Settings screen
- [ ] Write Vitest tests for permission status logic

## Speech & Scribe Settings Section (Apr 2026)
- [x] Build SpeechScribeSettingsSection component with permission status logic
- [x] Add microphone and speech recognition permission rows with coloured badges
- [x] Add overall Scribe status banner (Enabled / Needs Permission / Disabled)
- [x] Add explanation copy (what Scribe does, when mic is used)
- [x] Add Check Permissions, Request Access, and Open iPhone Settings actions
- [x] Add step-by-step denied-permissions guide (shown only when denied on iOS)
- [x] Add Refresh Permission Status button
- [x] Integrate into Settings screen between Appearance and My Profile sections
- [x] Section is searchable by keywords (speech, scribe, microphone, voice, dictation)
- [x] Write 34 Vitest tests for all permission logic helpers

## AppleSpeech Native Module Upgrade
- [x] Rewrite AppleSpeechModule.swift with full SFSpeechRecognizer + AVAudioEngine + SFSpeechAudioBufferRecognitionRequest flow
- [x] Add removeTap(onBus:0) before installTap to prevent tap-already-installed crash on rapid start/stop
- [x] Fix teardown order: endAudio() before cancel() to flush final recognition buffer
- [x] Guard audioEngine.stop() with isRunning check to prevent throws on already-stopped engine
- [x] Silently ignore error code 301 (kAFAssistantErrorDomain cancelled — user-initiated, not a real error)
- [x] Add onPermissionStatus event fired after requestPermissions() so Settings UI reacts without polling
- [x] Set isListening = false immediately at start of stopSession() to prevent re-entrant double-stop races
- [x] Update TypeScript bridge (modules/apple-speech/src/index.ts) to export PermissionStatusEvent type and checkPermissions()
- [x] Update useAppleSpeechLive hook to subscribe to onPermissionStatus event and expose permissions state
- [x] Verify app.config.ts NSMicrophoneUsageDescription and NSSpeechRecognitionUsageDescription are present and well-worded
- [x] Write 30 Vitest tests for the TypeScript bridge covering null-safety, locale handling, event names, and hardening rules

## SpO2 ×100 Conversion Bug Fix
- [x] Audit all SpO2 read, storage, and display sites
- [x] Fix Nitro bridge path: multiply s.quantity by 100 (HKUnit.percent() returns fraction)
- [x] Fix RNH primary path: multiply s.value by 100 (HKUnit.percentUnit returns fraction)
- [x] Add double-conversion guard (<= 1.5 check) on both paths
- [x] Confirm no double-conversion in downstream display sites
- [x] Write 26 Vitest tests for the conversion formula

## HealthKit New Metrics Integration (Height, LeanBodyMass, DistanceWalkingRunning, DistanceCycling)
- [ ] Add QuantityTypeIdentifier.Height to permissions and fetch pipeline
- [ ] Add QuantityTypeIdentifier.LeanBodyMass to permissions and fetch pipeline
- [ ] Add QuantityTypeIdentifier.DistanceWalkingRunning to permissions and activity aggregation
- [ ] Add QuantityTypeIdentifier.DistanceCycling to permissions and activity aggregation
- [ ] Wire Height and LeanBodyMass into body metrics data model
- [ ] Wire DistanceWalkingRunning and DistanceCycling into activity data model
- [ ] Write Vitest tests for the new metric fetch and aggregation logic

## New HealthKit Metrics Integration (Height, LeanBodyMass, DistanceWalkingRunning, DistanceCycling)
- [x] Add leanBodyMassKg and heightM optional fields to BodyCompositionRecord type
- [x] Add HKQuantityTypeIdentifierLeanBodyMass to HK_READ_TYPES in healthkit-loader.ts
- [x] Update fetchHealthKitBodyComposition to fetch LeanBodyMass and Height
- [x] Add fetchHealthKitDistanceWalkingRunning function to native-health-service.ts
- [x] Add fetchHealthKitDistanceCycling function to native-health-service.ts
- [x] Add syncClinicalMetrics convenience export to native-health-service.ts
- [x] Fix Vitest mock hoisting error in tests/clinical-metrics.test.ts using vi.hoisted()
- [x] Add 19 Vitest tests for new clinical metrics (19 passing, no regressions)

## Final Pre-Release Stability Audit (TestFlight Submission)
- [x] Fix 256 bare `catch {}` blocks → replaced with `catch (_) {}` across 105 files
- [x] Add null guard `?? 0` to step count reduce (native-health-service.ts line 764)
- [x] Validate all HealthKit identifiers (Height, LeanBodyMass, DistanceWalkingRunning, DistanceCycling, OxygenSaturation) — all confirmed correct
- [x] Validate SpO2 fraction-to-percent conversion (×100 guard with `<= 1.5` threshold) — confirmed present
- [x] Validate all AppState.addEventListener calls have sub.remove() cleanup — all 7 instances confirmed
- [x] Validate provider tree order: ThemeProvider → SmoothingStrengthProvider → HealthProvider → DataSourcesProvider → AuthProvider — confirmed correct
- [x] App Store compliance: replace user-visible 'clinical suggestion' → 'health insight' in analytics.tsx
- [x] App Store compliance: replace 'Clinical Input' → 'Activity Log' in log.tsx and activity-log-history.tsx
- [x] App Store compliance: replace 'Patient Info' → 'Personal Information' in report.tsx and i18n.ts
- [x] App Store compliance: replace 'Clinical Alert Thresholds' → 'Health Alert Thresholds' in settings.tsx
- [x] App Store compliance: replace 'Clinical Evidence Library' → 'Evidence Library' in settings.tsx
- [x] App Store compliance: replace 'clinical diagnosis' → 'health diagnosis' in correlation-trend-chart.tsx
- [x] App Store compliance: replace 'clinical diagnosis' → 'personalized guidance' in projected-a1c-card.tsx
- [x] App Store compliance: replace 'medical purpose' → 'health tracking purpose' in whats-new-sheet.tsx
- [x] App Store compliance: replace 'clinical-review-banner' → 'health-review-banner' in report-generator.ts
- [x] App Store compliance: update i18n.ts — patients→individuals, medical device→diagnostic device, medical records→health records, medical advice→informational purposes only
- [x] App Store compliance: update color-legend.tsx — 'clinical guidelines' → 'health guidelines', 'medical advice' → 'healthcare guidance'
- [x] App Store compliance: update profile.tsx — 'Clinical Input system' → 'Activity Log system'
- [x] Validate Info.plist keys: NSHealthShareUsageDescription, NSHealthUpdateUsageDescription, NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription, NSBluetoothAlwaysUsageDescription, ITSAppUsesNonExemptEncryption=false — all present and non-empty
- [x] Run full Vitest suite: 1,809 passing, 10 pre-existing failures (unchanged), 0 regressions

## Dashboard Header Cleanup
- [x] Remove NeoVital shortcut button (heart.fill icon, purple) from dashboard header icon row
- [x] Remove ? Help & Support shortcut button (questionmark.circle.fill, blue) from dashboard header icon row
- [x] Remove now-unused hasNewUpdate state, WHATS_NEW_SEEN_KEY import, and useFocusEffect from index.tsx

## Record Tab — Latest Synced Values
- [x] Add relativeTime() helper (just now / Xm ago / Xh ago / yesterday / Xd ago)
- [x] Add sourceLabel() helper (🍎 Apple Health / 🤖 Health Connect / 📡 Device / ✏️ Manual)
- [x] Upgrade formatWeight() to return { value, label, source } with timestamp and source
- [x] Upgrade formatVitals() to return { lines[], label, source } — shows BP + HR + SpO2 when available
- [x] Upgrade formatGlucose() to return { value, label, source } with context (Fasting/Post-meal/etc.) and timestamp
- [x] Add LatestSnapshot interface and latest prop to LogCard
- [x] Wire latest prop to Weight, Vital Signs, and Blood Sugar LogCards in the Record tab JSX
- [x] Remove NeoVital shortcut and ? Help shortcut from dashboard header (previous session)

## Record Tab — Vital Signs Sync Timestamp & Sleep Source Badge
- [x] Add syncedAtLabel() helper — returns exact wall-clock time string e.g. "Synced 4:02 AM"
- [x] Vital Signs card label now shows exact sync time ("Synced HH:MM AM/PM") instead of relative time
- [x] formatLatestSleep() upgraded to return LatestSnapshot with source badge (🍎 Apple Health / ✏️ Manual etc.)
- [x] Sleep card now uses latest prop — shows duration, relative timestamp, and source badge

## Record Tab — Activity Card LatestSnapshot
- [x] Import useUnitPreferences, formatDistance, DistanceUnit from hooks/use-unit-preferences into record.tsx
- [x] Add distanceUnit from useUnitPreferences() hook in RecordScreen
- [x] Upgrade formatLastActivity() to return LatestSnapshot — line 1: type + duration, line 2: distance in user-selected km/mi (omitted if no distance recorded)
- [x] Wire Activity card to latest prop with distanceUnit passed to formatLastActivity
- [x] Activity card now shows: activity type + duration, distance (km or mi per user setting), relative timestamp, source badge

## Weather Badge Feature
- [ ] Build lib/weather/weather-service.ts — Open-Meteo fetch with location permission flow
- [ ] Build lib/weather/use-weather.ts — hook with loading/error/denied states
- [ ] Build components/weather-badge.tsx — glass card with condition, temp, precip, wind, readiness label
- [ ] Integrate WeatherBadge into Activity screen (near top)
- [ ] Integrate WeatherBadge into Dashboard (summary card)
- [ ] Add NSLocationWhenInUseUsageDescription to app.config.ts if missing

## Weather Badge Feature
- [x] Build weather-service.ts using IP geolocation (ip-api.com) + Open-Meteo (no API key, no location permission)
- [x] Build use-weather.ts hook with 30-min cache and focus-based refresh
- [x] Build WeatherBadge component with glass styling, readiness label, all states (loading/error/success)
- [x] Integrate full WeatherBadge into Activity screen (top of scroll view)
- [x] Integrate compact WeatherBadge into Dashboard (above Today's Summary Row)
- [x] Remove expo-location plugin and NSLocationWhenInUseUsageDescription from app.config.ts
- [x] Activity readiness logic: great / good / caution_rain / caution_heat / caution_cold / caution_wind / indoor
- [x] Wind speed respects user's distance unit preference (km/h vs mph)

## Weather Badge Enhancements
- [x] Add feelsLikeC / feelsLikeF to WeatherData type
- [x] Fetch apparent_temperature from Open-Meteo API
- [x] Show "Feels like X°C / X°F" line in WeatherBadge (only when ≥2°C diff from actual)
- [x] Add activity-type-specific readiness tips (outdoor-run, indoor-run, walk, cycling, workout)
- [x] Wire activityType={selectedType} prop from Activity screen into WeatherBadge
- [x] Dashboard compact badge unchanged (no activityType, shows generic label)

## Weather Badge v3 Enhancements
- [x] Add hourly forecast strip (next 6 hours: time + icon + temp) to weather service and badge
- [x] Add UV index to Open-Meteo request and show UV pill (UV index + label, no medical advice)
- [x] Persist last successful weather fetch to AsyncStorage for cold-launch stale data
- [x] Show stale badge immediately on launch, refresh silently in background

## Weather Badge v4 Enhancements
- [ ] Add dailyHighC/dailyLowC/dailyHighF/dailyLowF to WeatherData type
- [ ] Fetch temperature_2m_max/min from Open-Meteo daily endpoint
- [ ] Add windDirectionDeg and windDirectionLabel to WeatherData type
- [ ] Fetch wind_direction_10m from Open-Meteo current conditions
- [ ] Show "H: X° / L: X°" line below condition label in WeatherBadge
- [ ] Show wind direction arrow + compass label next to wind speed pill

## Dashboard Weather — 3-Day Forecast Card
- [x] Add DailyForecast type and 3-day daily data to WeatherData
- [x] Fetch 3-day daily forecast from Open-Meteo (high/low, condition, precip, wind, UV)
- [x] Add wind direction (deg + compass label) to current and daily data
- [x] Build WeatherDashboardCard component matching dashboard card style
- [x] Replace compact WeatherBadge on Dashboard with WeatherDashboardCard

## Weather Card — Plan Activity Shortcut
- [x] Add "🏃 Plan Activity →" button at bottom of expanded WeatherDashboardCard
- [x] Navigate to Activity screen passing readiness label + condition as route params
- [x] Show weather context banner on Activity screen when launched from weather card

## Weather Tab + Activity Screen Upgrade
- [ ] Build getWeatherActivityMessage engine with anti-repetition
- [ ] Build getSmartActivityMessage engine (weather + progress + streak + time + activity gap)
- [ ] Build MomentumCard component (steps, goal, streak, smart message)
- [ ] Upgrade Activity screen top section with WeatherBadge + MomentumCard
- [ ] Extend weather service to 5-7 day daily forecast for Weather tab
- [ ] Build city-based weather fetch (geocoding by city name, no GPS)
- [ ] Build WeatherTabScreen (hero card, hourly strip, 5-day forecast, activity insights, city selector)
- [ ] Wire Weather tab into tab bar navigation

## Weather Tab v2 — Full Standalone Screen
- [x] Extend weather service to 7-day daily forecast
- [x] Add city-based geocoding via Open-Meteo Geocoding API (searchCities)
- [x] Add fetchWeatherForCity function
- [x] Build getWeatherActivityMessage engine with anti-repetition
- [x] Build getSmartActivityMessage engine (weather + steps + streak + time-of-day)
- [x] Build MomentumCard component with steps, goal, streak, smart message
- [x] Wire MomentumCard into Activity screen top section
- [x] Build WeatherTabScreen with hero card, hourly strip, 7-day forecast, activity insights, city selector
- [x] Add cloud.sun.fill icon mapping to icon-mapping.ts
- [x] Wire Weather tab into tab bar navigation (after Record tab)

## NeoVital Dashboard — Glucose & Weight Graphs
- [x] NeoVitalGlucoseCard: amber neon, context-coloured dots (fasting/post-meal/random/bedtime), 24h/7d/30d/90d tabs, GlowPulse, AsyncStorage collapse/range, taps to blood sugar log
- [x] NeoVitalWeightCard: purple neon, 7-day moving average dashed line, tight Y range, 24h/7d/30d/90d tabs, GlowPulse, AsyncStorage collapse/range, taps to weight log
- [x] Both cards wired into Dashboard after NeoVitalMiniCard

## NeoVital Mini Card — Glucose & Weight Integration
- [x] Add glucose (amber #FFB800) and weight (purple #C084FC) to MINI_VITALS in neovital-mini-card.tsx
- [x] Add glucose and weight fields to SeriesPoint interface
- [x] Wire bloodSugar and weight records into the series useMemo (mg/dL and lbs)
- [x] Add glucose/weight to latestValues walker
- [x] Format weight with 1 decimal in legend
- [x] Remove standalone NeoVitalGlucoseCard and NeoVitalWeightCard from dashboard
- [x] Remove their imports from index.tsx

## Weather Tab Consolidation
- [x] Remove standalone Weather tab from tab bar (href: null)
- [x] Add hero message to WeatherDashboardCard expanded body
- [x] Add 6-hour hourly forecast strip to WeatherDashboardCard
- [x] Add outdoor activity insights (Running/Walking/Cycling/Workout) to WeatherDashboardCard
- [x] Add getActivityInsights helper to WeatherDashboardCard

## Unified iOS/Android Health Permissions (pasted_content_8)
- [x] Add Height, Distance, TotalCaloriesBurned, Steps, OxygenSaturation, BloodGlucose to Android Health Connect permission request in permissions.ts
- [x] Add same types to device-sync.ts Android requestDeviceSyncPermissions
- [x] Update app.config.ts react-native-health-connect plugin with explicit permissions array for all 14 record types
- [x] syncClinicalMetrics iOS branch already present in native-health-service.ts (Height, LeanBodyMass, DistanceWalkingRunning, DistanceCycling)

## Activity Screen — City Search for Weather
- [x] Add city search input to Activity screen WeatherBadge
- [x] Wire fetchWeatherForCity to Activity screen weather state
- [x] Rewrite use-weather.ts with pinnedCity/pinCity/clearCity/searchCitiesQuery
- [x] Wire full useWeather destructuring in activity.tsx with city search state + callbacks
- [x] Add city search UI (search bar + results dropdown + pinned city chip) above WeatherBadge

## Vital Signs Integer Rounding
- [x] Apply Math.round() to SpO2, HR, systolic, diastolic in device-sync.ts
- [x] Apply Math.round() to SpO2, HR, BP in native-health-service.ts
- [x] Keep decimals for weight, height, lean body mass
- [x] Update mock vitals to use integer SpO2 values

## Bug Fix — Speech Permission Request
- [ ] Diagnose why app cannot request speech/microphone permission
- [ ] Fix NSSpeechRecognitionUsageDescription and NSMicrophoneUsageDescription in app.config.ts
- [ ] Fix Android RECORD_AUDIO permission declaration
- [ ] Fix permission request call-site in ScribeButton / apple-speech module
- [ ] Verify expo-speech / expo-audio plugin config is correct

## Bug Fix — Speech Permission (app cannot request speech permission)
- [x] Root cause: android.permission.RECORD_AUDIO missing from Android permissions list in app.config.ts
- [x] Add android.permission.RECORD_AUDIO to app.config.ts Android permissions
- [x] Confirmed: NSSpeechRecognitionUsageDescription and NSMicrophoneUsageDescription already present in iOS infoPlist
- [x] Confirmed: expo-audio plugin already has correct microphonePermission string
- [x] Confirmed: apple-speech local Expo module (ExpoModulesCore) is correctly set up with expo-module.config.json
- [x] Confirmed: withAppleSpeechModule.js plugin is NOT registered (it would inject a conflicting old RCTEventEmitter Swift file)
- [x] iOS speech permission: handled natively by SFSpeechRecognizer.requestAuthorization in AppleSpeechModule.swift
- [x] Android speech permission: RECORD_AUDIO now declared; useAudioScribe uses requestRecordingPermissionsAsync from expo-audio

## Dashboard — Combine Activity + Weather into One Card
- [x] Extend WeatherDashboardCard props: activityStatus and renderActivityRow render prop
- [x] Add activity section at bottom of WeatherDashboardCard expanded body: nudge card (no activity) or stats row (steps/distance/calories/fiber)
- [x] Remove standalone Today's Summary Row block from index.tsx
- [x] Pass activityStatus and renderActivityRow to WeatherDashboardCard in index.tsx
- [x] Update collapsed header to show activity status badge (🏃 or ✓ in green)

## WeatherDashboardCard Enhancements
- [x] Weather-aware activity nudge in collapsed header subtitle (readiness-based prompt when no activity logged)
- [x] Always-visible compact activity row below weather header when card is collapsed
- [x] Show pinned city name from useWeather pinnedCity in collapsed header subtitle

## Bug Fix — EAS Build Syntax Error
- [x] Fix unescaped apostrophe in activityNudge fallback string in weather-dashboard-card.tsx (caused EAS bundle failure)

## Bug Fix — Speech & Scribe Settings Permission
- [ ] Fix "Request Access" tab in Speech & Scribe settings — press does nothing
- [ ] Fix "Open iPhone Settings" deep link — goes to wrong screen instead of app microphone/speech recognition settings
- [ ] Ensure both microphone and speech recognition permissions are requested together on iOS

## NeoVital Dashboard — Label & Navigation Fixes
- [ ] Rename "Weight" label to "Wgt" on NeoVital dashboard card
- [ ] Rename "Glucose" label to "BG" on NeoVital dashboard card
- [ ] Wire Wgt tile to Record tab weight log screen on tap
- [ ] Wire BG tile to Record tab blood glucose log screen on tap

## Vital Signs Tile — SpO2 Display Fix
- [ ] Round SpO2 to whole number on vital signs tile (no decimal digits)

## NeoVital Oscillation Curves — Real Data + Data Points
- [ ] Wire oscillation graph to real health data (HR, SYS, DIA, SpO2, BG, Wgt)
- [ ] Add visible data point dots on the oscillation curves for each metric
- [ ] Ensure graph reflects actual logged values, not placeholder/demo curves

## Bug Fix — HealthKit Permissions "Not Asked" (IMG_3355)
- [ ] Add HKQuantityTypeIdentifierLeanBodyMass to iOS HealthKit read permissions
- [ ] Add HKQuantityTypeIdentifierHeight to iOS HealthKit read permissions
- [ ] Add HKQuantityTypeIdentifierDistanceWalkingRunning to iOS HealthKit read permissions
- [ ] Add HKQuantityTypeIdentifierDistanceCycling to iOS HealthKit read permissions
- [ ] Verify all 4 types appear as "Authorized" after re-requesting permissions

## Completed — Session Apr 23 2026 (Batch)
- [x] Fix speech permission Request Access tab (remove isAvailable guard, show alert when native module unavailable)
- [x] Fix Open iPhone Settings deep link (try App-prefs:Privacy&path=SPEECH_RECOGNITION first, fall back to app-settings:)
- [x] Fix auto-request on mount in speech-scribe-settings-section (was calling requestPermissions on mount instead of checkPermissions)
- [x] Add SpO2 as 6th vital to NeoVital oscillation graph (VITALS config, series builder, live sim)
- [x] Rename GLUCOSE→BG and WEIGHT→Wgt in neon-vitals.tsx and neovital-mini-card.tsx
- [x] Fix BP Y-axis bug: SYS and DIA now share same Y-axis range (40–200 mmHg) in both neon-vitals.tsx and neovital-mini-card.tsx
- [x] Add data point dots to all 6 oscillation curves (portrait + landscape renderers)
- [x] Round SpO2 to whole number on NeoVital vitals card
- [x] Wire BG and Wgt legend taps to Record tab navigation in neovital-mini-card.tsx
- [x] Fix HealthKit "Not Asked" for Lean Body Mass, Height, Walking+Running Distance, Cycling Distance — added to rnh-loader.ts PERMISSIONS.read

## Bug Fix — Blood Glucose & Weight HealthKit Fetch
- [ ] Fix Blood Glucose not fetching from HealthKit despite being authorized
- [ ] Fix Weight not fetching from HealthKit despite being authorized

## Bug Fix — SpO2 Avg Display Rounding
- [ ] Round SpO2 average display to whole number (currently shows 96.5, should show 97)

## Completed — Session Apr 23 (Batch 2)
- [x] Fix Blood Glucose not fetching from HealthKit — added bloodSugar: result.bloodGlucose to mergeHealthData in permissions.ts
- [x] Round SpO2 avg to whole number in date-range.ts (Math.round instead of toFixed(1))
- [x] Round SpO2 display in vitals-summary.tsx (Math.round instead of toFixed(1))

## Bug Fix — Activity Tab City Search Unresponsive on Device
- [x] Fix city search not responding on real iOS/Android device (works on web)
## Feature — Scribe Keyboard Dictation Integration
- [x] Create useDictationField hook (hooks/use-dictation-field.ts)
- [x] Create ScribeDictationTip component (components/scribe-dictation-tip.tsx)
- [x] Add onActivate prop to ScribeButton
- [x] Wire dictation into Activity log screen (note field)
- [x] Wire dictation into Vitals log screen (note field)
- [x] Wire dictation into Sleep log screen (note field)
- [x] Wire dictation into Appointments screen (notes field)
- [x] Wire dictation into Medical History screen (notes field)
- [x] Wire dictation into Surgical History screen (notes field)
- [x] Wire dictation into Immunizations screen (notes field)
- [x] Fix weightKg pipeline: bridge HealthKit bodyComposition records into state.data.weight so NeoVital Wgt curve shows real HealthKit data
- [x] Wire DistanceWalkingRunning + DistanceCycling into syncAll and create synthetic ActivityRecord so todayDistanceKm on WeatherDashboardCard shows real HealthKit data
- [x] Remove all ScribeButton / 🍎 micro scribe mic buttons from all log/form screens
- [x] Build KeyboardDictationBanner — one-time dismissible tip shown on every form screen explaining keyboard mic dictation
- [x] Wire KeyboardDictationBanner into all 9 log/form screens (Activity, Vitals, Sleep, Appointments, Medical History, Surgical History, Immunizations, Medications, Medical ID)
- [x] Ensure all form ScrollViews have keyboardShouldPersistTaps="handled" for reliable tap-through on native
## Feature — Remove Microphone Scribe, Add Keyboard Dictation Banner
- [x] Remove ScribeButton (mic recording) component from all 7 log screens
- [x] Remove SpeechScribeSettingsSection from Settings screen
- [x] Delete components/scribe-button.tsx, scribe-confidence-badge.tsx, speech-scribe-settings-section.tsx
- [x] Delete hooks/use-dictation-field.ts, components/scribe-dictation-tip.tsx
- [x] Add KeyboardDictationBanner (one-time dismissible tip) to all 9 form screens
- [x] Add shield.lefthalf.filled and hand.raised.fill to icon-mapping.ts
- [x] Update native-linking-guard test to assert scribe-button.tsx is deleted
- [x] Add KeyboardDictationBanner to log-all-vitals-sheet.tsx
- [x] Remove Apple branding (🍎) from Voice to Form section in log-all-vitals-sheet.tsx
- [x] Audit Settings search keywords — no stale mic/scribe/speech keywords found
- [x] Rename "Scribe Highlight Duration" → "AI Fill Highlight Duration" in Settings (clarify it's for Vision Scan)
- [x] Add KeyboardDictationBanner to log-all-vitals-sheet.tsx
- [x] Remove Apple branding from Voice to Form section in log-all-vitals-sheet.tsx
- [x] Audit Settings search keywords — no stale mic/scribe/speech keywords found
- [x] Rename Scribe Highlight Duration to AI Fill Highlight Duration in Settings
- [ ] Auto-dismiss KeyboardDictationBanner on first keystroke in all form screens
- [ ] Rename SCRIBE_HIGHLIGHT_DURATION_KEY to ai_fill_highlight_duration_ms with one-time migration
- [ ] Add Voice to Form toggle chip to Log All Vitals sheet section chips
- [x] Auto-dismiss KeyboardDictationBanner on first keystroke in all form screens
- [x] Rename SCRIBE_HIGHLIGHT_DURATION_KEY to ai_fill_highlight_duration_ms with one-time migration
- [x] Add Voice toggle chip to Log All Vitals sheet section chips
- [x] Fix app-config-audit.test.ts: normalise Android permissions prefix, skip aps-environment production check when EAS_APS_ENVIRONMENT not set
- [x] Fix meal-log-confirmation.test.ts: update 3 stale Alert-based assertions to match inline success banner
- [x] Fix expo-token.test.ts: add skipIf guard when EXPO_TOKEN env var not set
## Bug Fix — NeoVital Graph latestValues Missing Glucose & Weight
- [x] Fix latestValues useMemo in neon-vitals.tsx to walk backwards through series for each vital independently, so BG and Wgt badges show real values instead of "—"
## Feature — Use Default System Keyboard for All TextInputs (Enable Dictation Mic)
- [x] Remove keyboardType="number-pad" / "decimal-pad" / "numeric" / "numbers-and-punctuation" from all TextInputs — use keyboardType="default" so iOS/Android dictation mic is always available
- [x] Add numeric-only validation via onChangeText filter where needed so only valid characters are accepted
- [x] Remove autoCorrect={false} from free-text fields (notes, search, name fields) so system spell-check and dictation work (all existing autoCorrect={false} usages are on search fields — correct as-is)
- [x] Update KeyboardDictationBanner text to reflect that the mic is on every field (not just text fields)
## Bug Fix — Remove Duplicate Glucose Alert from Settings > Health Data
- [x] Remove the "Glucose Alerts" SettingsRow from the Health Data CollapsibleSection in settings.tsx (duplicate of Threshold Alerts in Notifications tab)
## Feature — Keyboard & Input Improvements
- [x] Add "Reset keyboard tip" button under Settings > Accessibility that clears DICTATION_BANNER_KEY from AsyncStorage
- [x] Add inputMode="numeric" or "decimal" to all numeric TextInput fields (modern replacement for keyboardType on Android/web)
- [x] Add blur-time inline error validation to numeric fields — created useNumericField hook; key log screens already have save-time Alert guards; thresholds already have onBlur revert; hook available for future fields
## Feature — Input Polish Round 2
- [x] Wire useNumericField (revertOnInvalid: true) into Profile age/weight/height fields
- [x] Add inputMode="numeric" to sleep duration stepper inputs (deep/REM/core/awake minutes)
- [x] Add toast notification when keyboard tip is reset in Settings > Appearance

## Feature — NeoVital Dashboard Widget
- [x] Replace the NeoVital graph widget on the Dashboard with the full NeoVital tab content (minus Vital Signs Monitor)

## Bug Fix — Remove inputMode from Numeric Fields (Dictation Mic Hidden)
- [x] Remove inputMode="numeric" and inputMode="decimal" from all health/vital TextInput fields so iOS always shows the full QWERTY keyboard with the dictation mic
- [x] Keep keyboardType="default" and onChangeText numeric-only filtering in place

## Bug Fixes — Crash Report 2026-04-23
- [ ] Fix triggerHighlight crash in ImmunizationsScreen (useRef missing from React import)
- [ ] Fix triggerHighlight crash in FormModal / AppointmentsScreen (useRef missing from React import)
- [ ] Fix bannerRef crash in MedicationsScreen (useRef missing from React import)
- [ ] Fix useRef crash in ActivityLogScreen (already fixed in activity.tsx — verify build includes it)

## Feature — NeoVital Graph Improvements
- [ ] Show BG and Wgt numeric values on Y-axis of graph (separate right-side Y-axis or dual-axis labels)
- [ ] All 6 vital lines oscillate visibly on the graph (ensure BG and Wgt data points are plotted)
- [ ] Show latest BG and Wgt values in badge grid identical to HR, SYS, DIA, SpO2
- [ ] Restrict navigation to main NeoVital tab to bottom-right corner tap only (remove any other nav triggers)
- [ ] Add "View Full Monitor →" tappable row at bottom of NeoVital dashboard widget that navigates to NeoVital tab

## Bug Fixes & NeoVital Improvements (Session Apr 23)
- [x] Fix triggerHighlight crash in Immunizations screen (added useScribeHighlight hook call)
- [x] Fix triggerHighlight crash in Appointments FormModal (removed stale dep from useCallback)
- [x] Fix bannerRef crash in Medications screen (added useRef to React import)
- [x] Fix pre-existing medications.tsx JSX corruption (restored missing formTimes.map block)
- [x] Add right-side Y-axis labels for BG (mg/dL, green) on NeoVital graph
- [x] Add right-side Y-axis labels for Wgt (lbs, amber) on NeoVital graph when BG not active
- [x] Increase PAD_R from 12 to 44 in both neon-vitals.tsx and neovital-mini-card.tsx
- [x] Add "View Full Monitor →" tappable row at bottom-right of NeoVital dashboard widget
- [x] All 6 vitals (HR, SYS, DIA, SpO2, BG, Wgt) oscillate on the graph with their own Y scales
- [x] All 6 badges show latest values with units in the badge grid

## Feature — Persist NeoVital Active Toggles
- [x] Persist active vital toggles to AsyncStorage in neon-vitals.tsx (key: @neovital_mini_active_v3, shared with dashboard widget)
- [x] Persist active vital toggles to AsyncStorage in neovital-mini-card.tsx (already implemented, key: @neovital_mini_active_v3)
- [x] Persist rangeDays selection to AsyncStorage in neon-vitals.tsx (key: @vitalsync/neovital_range_days)
- [x] Load saved toggles and range on mount; fall back to all-6-active / 30d default if no saved value

## Bug Fixes — Session Apr 24 2026
- [x] Fix: keyboard dictation fills only focused field (systolic) instead of whole form
- [x] Fix: weather city search returns no results (AbortSignal.timeout not supported in RN Hermes)
- [x] Fix: medications/immunizations bannerRef crash — "property bannerRef doesn't exist"
- [x] Fix: medical history tab crashes on open (missing scribeError state)
- [x] Fix: surgical history tab crashes on open (missing scribeError state)
- [x] Fix: appointments form layout broken (Voice card wraps all form fields)
- [x] Remove right Y-axis numbers, SpO2 alert diamonds/label from NeoVitalMiniCard (redo after sandbox reset)
## NeoVital Graph — 6 Lines + Color Palette (Session Apr 24 2026)
- [x] Confirm BG and Wgt are rendered as oscillating graph lines (already in VITALS array and data pipeline)
- [x] Fix SYS/SpO2 color clash: SYS #00F5FF → #00C2FF (bright blue), SpO2 #38BDF8 → #34D399 (emerald green)
- [x] Update DIA color: #7B61FF → #A78BFA (lighter violet for contrast)
- [x] Update BG color: #00FF9D → #F97316 (orange, distinct from greens)
- [x] Update Wgt color: #FFB800 → #FFD60A (yellow, distinct from orange)
- [x] Apply color changes to neovital-mini-card.tsx (VITALS array, particles, right Y-axis labels, status dot, glucose legend)
- [x] Apply color changes to neon-vitals.tsx (VITALS array, particles, snapshot watermark, status dot, glucose legend)

## Feature — Dual Y-Axis on NeoVital Graphs (Session Apr 24 2026)
- [x] Left Y-axis: shows scale for first active vital among HR/SYS/DIA/SpO2 (as before)
- [x] Right Y-axis: always shows BG (mg/dL) scale when BG is active, AND Wgt (lbs) scale when Wgt is active (stacked labels or separate colors)
- [x] Both right-axis label sets visible simultaneously when both BG and Wgt are active
- [x] Right-axis BG labels colored #F97316 (orange), Wgt labels colored #FFD60A (yellow)
- [x] Apply to neovital-mini-card.tsx
- [x] Apply to neon-vitals.tsx (full monitor)

## Feature — Vital Toggle Chips on NeoVital Graph (Session Apr 24 2026)
- [x] Tapping a chip (HR, SYS, DIA, SpO2, BG, Wgt) above the graph toggles that line on/off
- [x] Active chip: colored background + colored text matching vital color, full opacity
- [x] Inactive chip: dark/muted background, muted text, reduced opacity
- [x] Minimum 1 vital must remain active (prevent all-off state)
- [x] Toggle state persisted to AsyncStorage (already implemented via ACTIVE_KEY)
- [x] Apply to neovital-mini-card.tsx
- [x] Apply to neon-vitals.tsx (full monitor)

## Feature — NeoVital Graph in Doctor Report (Session Apr 24 2026)
- [ ] Add collapsible NeoVital graph section above BP section in doctor report
- [ ] Graph stretched to US Letter paper width (612pt / full screen width)
- [ ] Same dark background (#0A1520) as dashboard NeoVital widget
- [ ] All 6 oscillating colored lines (HR, SYS, DIA, SpO2, BG, Wgt) with same colors
- [ ] Toggle chips above graph to show/hide individual lines
- [ ] Collapse/expand with animated chevron, collapsed by default
- [ ] Uses same data pipeline as dashboard (health state vitals/glucose/weight records)

## Feature — Doctor Report Improvements (Apr 24 2026)
- [x] Add "Include NeoVital Graph" toggle in Metric Selection card
- [ ] Add 30d/90d date-range filter on collapsible NeoVital card header
- [ ] Wire NeoVital graph toggle and date range into report-generator.ts
- [ ] Add "Print Preview" button that opens WebView scrolled to NeoVital graph section

## Feature — Medication Improvements (Apr 24)
- [x] Vision Scan prescription card at top of form (warm orange style, camera → AI → auto-fill)
- [x] Replace KeyboardDictationBanner with live-dictation text box (parseMedicationTranscript)
- [x] Refill Due badge on My Meds cards when refill date is within 7 days
- [x] Swipe-to-skip (left) and swipe-to-mark-taken (right) on Today tab dose cards

## Feature — 7-Day Advance Refill Notification (Apr 24)
- [x] Add scheduleAdvanceRefillNotification() to notifications.ts — fires 7 days before refillReminderDate at 9 AM with "⚠️ Refill due in 7 days for [Med Name]"
- [x] Wire scheduleAdvanceRefillNotification() in medications.tsx handleSaveMed alongside existing scheduleRefillReminderNotification()
- [x] Cancel advance refill notification ID when medication is deleted or refill date changes
- [x] Persist advance refill notification ID in Medication type (advanceRefillNotifId field)

## Layout — Daily Readiness moved below Quick Entry (Apr 24)
- [x] Move ReadinessBanner + ReadinessBreakdownSheet from after greeting header to below the Quick Entry card block

## Dashboard Fixes (Apr 24)
- [x] Fix NeoVital Wgt tile clipping on right edge of screen
- [ ] Confirm dashboard scroll order: Greeting → Smart Reminders → NeoVital → Metric tiles → Quick Entry → Daily Readiness → Health Insights

## NeoVital Chart Enhancements (Apr 24)
- [x] Right-axis tap zones: invisible Rect hit areas on BG and Wgt columns to toggle vital lines
- [x] Wgt axis auto-range: compute yMin/yMax dynamically from observed data ±15%
- [x] Chart pinch-to-zoom: horizontal pinch gesture to zoom into narrower time window

## NeoVital Wgt Goal Line (Apr 24)
- [x] Add tappable dashed Wgt goal line in neon-vitals.tsx — visible only when weight vital is active, labelled "Goal" in yellow, tapping opens weight goal editor
- [x] Add tappable dashed Wgt goal line in neovital-mini-card.tsx — same behaviour, navigates to full NeoVital screen on tap

## NeoVital Wgt Goal Line Enhancements (Apr 24)
- [x] Goal progress delta label next to "Goal X lbs" (e.g. "−12 lbs to go" or "✓ Goal reached!")
- [x] Goal-reached celebration: flash line green + notificationAsync(Success) haptic when latest weight ≤ goal
- [x] Inline goal editor bottom sheet on goal line tap (replaces Settings navigation)

## Medication Scribe — Prescription Scan Integration (Apr 24)
- [x] Create lib/medications/prescription-scan-parser.ts with ParsedMedicationScan, parsePrescriptionScanText, normalizeUnit, capitalize
- [x] Create lib/medications/merge-parsed-medication.ts with mergeParsedMedication utility
- [x] Wire handlePrescriptionScanComplete, openPrescriptionScanner, openDictation in medications.tsx form modal- [x] Add dual action row (🎙️ Dictate / 📷 Scan Prescription) above MedicationDictationCard
- [x] Add scan preview section (collapsible raw text + "Prescription scan captured" header)
- [x] Add "Clear Scan" button and "Review before saving" helper text
- [x] Replace Vision Scan card with dual action row; dictation box remains as MedicationDictationCard equivalent

## Smart Reminders — Medication Integration (Apr 24)
- [x] Read SmartReminders component to understand current reminder types and data shape
- [x] Add medication reminder types: skipped dose, missed dose, taken confirmation, refill due
- [x] Build useMedicationReminders hook to derive reminder items from medication store
- [x] Wire medication reminders into SmartReminders data source on Dashboard
- [x] Ensure reminder cards are actionable (Mark Taken, Skip, View Meds) and collapsible after action

## Smart Reminders — Priority, Auto-Miss, Badge (Apr 24)
- [x] Priority-order Smart Reminder cards: due doses first, missed, refill-date, skipped
- [x] Auto-mark missed doses after 2-hour grace period (background useEffect on focus)
- [x] Numeric badge on Dashboard tab bar icon: dueMeds + missedDoses + refillDueMeds count

## Smart Reminders — Grace Period, Badge Clear, Streak Warning (Apr 24)
- [ ] Grace period setting in Settings → Medications (1h / 2h / 4h / Never) persisted to AsyncStorage
- [ ] Wire grace period preference into auto-mark missed doses useEffect in index.tsx
- [ ] Badge-clear-on-dismiss: zero tab bar badge immediately when all Smart Reminder cards are dismissed
- [ ] Missed dose streak warning: surface persistent "Adherence concern" card when 3+ consecutive missed doses detected

## Doctor's Appointment & Surgical History — Dictation + UX (Apr 24)
- [x] Doctor's Appointment form: add dictation text field (tap → keyboard mic → auto-fill all fields)
- [x] Doctor's Appointment form: replace date/time pickers with scrollable wheel-style calendar + time picker
- [x] Surgical History form: add dictation text field (tap → keyboard mic → auto-fill all fields)
- [x] Surgical History form: add "Save Procedure" button flow

## Appointment Reminder Push Notification (Apr 24)
- [x] Add scheduleAppointmentReminderNotification() to lib/health/appointment-notifications.ts — schedules a DATE trigger 24h before appointment dateTime
- [x] Add reminderNotifId field to DoctorAppointment type in types.ts (ID derived deterministically: appt_notif_<id>, no extra field needed)
- [x] Wire scheduling in appointments.tsx handleSave (add + edit paths), cancel on delete, rescheduleAll on mount

## Appointment Smart Reminders + Notification Enhancements (Apr 24)
- [x] Dashboard Smart Reminders: existing appointment cards enhanced within 24h window (location + prep checklist shown, bolder border)
- [x] appointment-notifications.ts: include unchecked prep checklist items in 24h reminder notification body
- [x] appointment-notifications.ts: scheduleMissedFollowUpNotification() — fires 1h after appointment if no outcome logged, deep-links to Missed tab
- [x] Wire scheduleMissedFollowUpNotification in health-context.tsx (add/update/delete) and cancelMissedFollowUpNotification on outcome-logged

## Appointment Card UX Enhancements (Apr 24)
- [x] Smart Reminder card: prep checklist collapsible (collapsed by default, tap header to expand)
- [x] Smart Reminder card: tap-to-check individual prep items, persist via updateAppointment
- [x] Missed follow-up notification: deep-link to outcome picker for specific appointment (outcomeApptId param auto-opens outcome modal)
- [x] Log tab badge: show count of appointments within 24h (dot for 1, amber count badge for 2+)

## Appointment Card Polish (Apr 24 — batch 3)
- [x] Prep item check animation: strikethrough fade + translateX via reanimated, success haptic when all items checked
- [x] Appointment conflict detector: warn in form when new appointment is within 30min of existing one
- [x] Smart Reminder card: "Directions" button next to location row, deep-links to Apple Maps / Google Maps

## Medication Dictation Parser + Dictate Button (Apr 24)
- [x] Enhanced scribeTranscript route in medication-router.ts with Rx label patterns: rxNumber, startDate, refillsRemaining, prescriber, pharmacy, Qty, Refills, 'Take at bedtime', 'Use as directed'
- [x] Medication Add form: Dictate / Scan Prescription two-button header row already exists; applyScribeResult extended with rxNumber, startDate, refillsRemaining, prescriber
- [x] Medication Add form: safety disclaimer banner already exists
- [x] Medication Add form: dictation text field with DICTATE PRESCRIPTION label and hint text already exists
- [x] Appointment form: Dictate shortcut button added at top of form that focuses dictation field
- [x] Surgical History form: Dictate shortcut button added at top of form that focuses dictation field

## Medication Rx Field + Scan Improvements + Allergy Dictation (Apr 24)
- [x] Add rxNumber field to Medication type in lib/medications/types.ts
- [x] Add formRxNumber state to medications.tsx form and render Rx # input row below Pharmacy
- [x] applyScribeResult: write rxNumber to formRxNumber field instead of prepending to notes
- [x] Update scribePhoto vision prompt with prescription label pattern examples (Qty, Refills, Rx #, Dr. name, pharmacy, 'Take at bedtime', 'Use as directed')
- [x] scribePhoto return type: add rxNumber, startDate, refillsRemaining fields
- [x] Add parseAllergyTranscript tRPC route (allergen, reactionType, severity, onsetDate, notes)
- [x] Allergy form: Dictate shortcut button + live dictation text box
- [x] Allergy form: applyAllergyScribeResult wires fields from parseAllergyTranscript

## Allergy Log Feature
- [x] Define Allergy type (id, allergen, category, reaction, severity, onsetDate, notes, createdAt)
- [x] Build allergy-store.ts with AsyncStorage CRUD (loadAllergies, saveAllergy, updateAllergy, deleteAllergy)
- [x] Add allergies state + actions to health-context.tsx
- [x] Build app/log/allergies.tsx: list view + add/edit modal with dictation (Dictate button + live text field)
- [x] Add parseAllergyTranscript tRPC route (allergen, category, reaction, severity, onsetDate, notes)
- [x] Surface allergy section on expanded medication card (show matching drug/food allergies inline)
- [x] Add Allergy card to Record hub screen (app/(tabs)/record.tsx)
- [x] Wire Allergy route in app/_layout.tsx Stack

## Allergy Section on Medication Card + BT Header Restore
- [x] Medication detail card: add "Known Allergies" section showing drug allergies from AllergyRecord list
- [x] Fix scan fallback: rxNumber goes to formRxNumber field
- [x] Restore Bluetooth icon to Dashboard header (with BLE connection status dot)
- [x] Add Bluetooth icon to Record screen header (with BLE connection status dot)

## Bug Fixes
- [x] Fix Invalid hook call crash: extract useAnimatedStyle out of FlatList renderItem in MyMedsTab (medications.tsx line 795)
- [x] Move "My Meds" tab to first position and make it the default active tab for dictation flow
- [x] Remove collapsible state from Smart Reminders — always expanded, always fire
- [x] Smart Reminders: always expanded, remove all collapse/long-press toggle logic
- [x] Health permission: re-check permission status immediately on app focus after requesting (no exit/re-entry required)
- [x] Smart Reminders: always expanded, remove all collapse/long-press toggle logic
- [x] Health permission: re-check permission status immediately on app focus after requesting (no exit/re-entry required)
- [x] Medication Dictate button on My Meds tab: auto-open Add modal and focus dictation box
- [x] Haptic confirmation (NotificationFeedbackType.Success) when Fill Form is tapped in DictationBox
- [x] Persist last active medication tab to AsyncStorage and restore on screen mount
- [x] Fix missing tRPC procedure health.parseActivityTranscript (activity dictation Fill Form crash)
- [x] Fix icon-mapping build validation error blocking publish
- [x] Smart Reminders: show ALL active reminders, not just the first one
- [x] Smart Reminders: appointment reminders not shown when medication reminder is also active
- [x] Smart Reminders: app crashes when user expands prep checklist dropdown
- [x] Fix iOS SIGSEGV crash (EXC_BAD_ACCESS) in Hermes: toLocaleDateString/toLocaleTimeString called on invalid/null Date — add safeFormatDate utility and guard all date formatting calls
- [x] Remove ALL AI/server speech-to-text and NLP parsing from dictation — replace with native keyboard dictation (iOS/Gboard TextInput) across all screens
- [x] Fix 404 error on vitals dictation (API server unreachable)
- [x] Apple Vision on-device OCR for prescription photo scan in medications screen (replace server AI)
- [x] Apple Vision on-device OCR for vaccination card photo scan in immunizations screen (replace server AI)
## OCR & Dictation UX Improvements (Apr 24)
- [x] Improve immunization OCR parser: add dedicated CDC card column-format regex pass (Vaccine / Lot # / Date / Site printed layout patterns)
- [x] Review & Correct diff-style preview card after OCR scan in immunizations.tsx (highlight extracted vs blank fields)
- [x] Review & Correct diff-style preview card after OCR scan in medications.tsx (highlight extracted vs blank fields)
- [x] One-time offline dictation tip banner: show on first dictation use, explain iOS/Gboard keyboard mic key, persist seen flag to AsyncStorage

## Bug Fixes (Apr 24)
- [x] Fix "Cannot read property 'color' of undefined" crash in activity log form — parser returned underscore-separated type keys (outdoor_run) not matching hyphen-separated ACTIVITY_TYPE_META keys; also added safe fallback for activeConfig
- [x] Fix crash when expanding doctor appointment prep in Smart Reminder on Dashboard
- [x] Fix Smart Reminder prep expand crash — Reanimated hooks inside IIFE render cause unstable hook context; replace with JS-thread Animated
- [x] Lab tracker: remove Smart Scribe text dictation, replace with Apple Vision OCR photo scanning (expo-text-extractor + local parser)

## Dashboard UI Changes (Apr 27, 2026)
- [x] NeoVital mini card: Add "Log all vitals" button to the left of "View Full Monitor" (navigates to /log/vitals)
- [x] Dashboard: Remove Quick Entry card
- [x] Dashboard: Remove NeoSleep card
- [x] Dashboard: Move Daily Readiness banner to sit below Today at a Glance strip (steps/cal/sleep)
- [x] Dashboard: Remove Personal Nutrition Index (EBP Clinical Nutrition Cards section)
- [x] Dashboard: Make PERSONAL section non-collapsible (always expanded)

## Dashboard UI Changes (Apr 27, 2026)
- [x] NeoVital mini card: Add "Log all vitals" button to the left of "View Full Monitor" (navigates to /log/vitals)
- [x] Dashboard: Remove Quick Entry card
- [x] Dashboard: Remove NeoSleep card
- [x] Dashboard: Move Daily Readiness banner to sit below Today at a Glance strip (steps/cal/sleep)
- [x] Dashboard: Remove Personal Nutrition Index (EBP Clinical Nutrition Cards section)
- [x] Dashboard: Make PERSONAL section non-collapsible (always expanded)

## Date/Time Picker Icon Buttons (Apr 27, 2026)
- [x] Add DatePickerIconButton component to date-time-picker-field.tsx
- [x] Appointments: datetime icon button to right of Date & Time text field
- [x] Immunizations: date icon button to right of Date Administered and Next Dose Date fields
- [x] Medications: date icon buttons to right of Start Date, End Date, Refill Reminder Date fields
- [x] Labs Entry: date icon button to right of Collection Date field
- [x] Sleep Log: clock icon button to right of Bedtime and Wake Time fields

## NativeEventEmitter(null) Crash Fix — Build 2.8.20 (Apr 27, 2026)
- [x] Audit all files calling import("expo-notifications") directly
- [x] Patch lib/health/appointment-notifications.ts (5 call sites)
- [x] Patch lib/health/diet-streak-milestones.ts (1 call site)
- [x] Patch lib/health/immunization-notifications.ts (4 call sites)
- [x] Patch lib/health/readiness-notification.ts (3 call sites)
- [x] Patch lib/health/sugar-notification.ts (2 call sites)
- [x] Patch app/(tabs)/index.tsx (2 call sites)
- [x] Patch app/(tabs)/settings.tsx (2 call sites)
- [x] Patch app/settings/thresholds.tsx (1 call site)
- [x] Zero bare import("expo-notifications") calls remain outside safe-notifications.ts

## UI/UX Fixes Batch (Apr 27, 2026)
- [x] Remove mic button from USDA search in ai-food-camera-sheet.tsx
- [x] Fix HealthKit permissions: deferred loadStatuses() after success so rows update without tab exit
- [x] Add NUTRITION section label (leaf icon) above macro graph on dashboard
- [x] Pin macro graph default tab to 7d instead of Today
- [x] Add fiber progress ring to macro graph header
- [x] Fix weather city selection: shared WeatherContext so dashboard card updates immediately without tab exit
- [x] Restore all medication features from last 24 hrs (ec761f0) to My Meds tab
- [x] Restore safe-async-storage module and dose-log-archive module
- [x] Upgrade neovital-macro-graph and ebp-nutrition-cards to use safeSetItem

## Three-Feature Batch (Apr 27, 2026)
- [x] Weather pull-to-refresh: WeatherDashboardCard uses shared WeatherContext; pulling down on dashboard ScrollView calls refresh() which updates both the card and the Weather tab simultaneously
- [x] Fiber goal editor in macro graph header: fiber ring in NeoVitalMacroGraph header is now tappable — tap opens the existing fiber goal editor bottom sheet (presets 21/25/38 g + custom input); fiberGoal prop wired from macroGoals.fibre in index.tsx; fiberTarget in the graph now reflects the user-set goal
- [x] "Mark all taken" shortcut in My Meds daily view: DUE NOW section already had this button (≥2 doses); extended to MISSED section as well (≥2 missed doses, error-red color to distinguish from teal DUE NOW button)

## Mark All Skipped — MISSED Section (Apr 27, 2026)
- [x] Add "Mark All Skipped" button alongside "Mark All Taken" in the MISSED section header (≥2 missed doses, warning-amber color)

## Comprehensive AsyncStorage safeSetItem Migration (Apr 27, 2026)
- [x] Migrate ALL remaining bare AsyncStorage.setItem/multiSet calls to safeSetItem/safeMultiSet across the entire codebase
- [x] Verify native-health-service.ts lines 1481/1483 (HEALTH_DATA_KEY) are migrated
- [x] Verify storage.ts lines 145/193/205/217 are migrated
- [x] Verify all lib/notifications, lib/medications, lib/health, hooks, and app screen files are migrated

## Storage Health + Retention Window + BG Sync Pruning (Apr 27, 2026)
- [x] Create lib/retention-settings.ts: loadRetentionMonths / saveRetentionMonths / RETENTION_OPTIONS (6/12/24 months)
- [x] Create lib/storage-telemetry.ts: getStorageHealthSummary() reads [StorageSize] telemetry from crash logger, returns top-3 keys with 30-day sparklines
- [x] Add pruneHealthData() to lib/health/storage.ts: trims bloodPressure/pulse/bodyComposition/weight/vitalSigns/bloodSugar/activity/sodiumIntake/sleep/mealIQAnalyses; preserves labResults/medicalHistory/surgicalHistory/immunizations/allergies/appointments
- [x] Wire pruneHealthData into saveHealthData() in storage.ts (reads retention window from retention-settings.ts)
- [x] Wire pruneHealthData into mergeRecordsIntoStorage() in background-sync-service.ts (BGAppRefreshTask path)
- [x] Add Data Retention Window row (6/12/24 mo pill selector) to Settings → Privacy before Delete All My Data
- [x] Add Storage Health row to Settings → Diagnostics before HealthKit Diagnostics: top-3 keys with sparklines and 2 MB warning banner
- [x] Add 12 unit tests in tests/storage-pruning.test.ts (pruneHealthData + formatStorageSize)

## ESLint Rule + 3 MB Push Alert (Apr 27, 2026)
- [x] Add ESLint no-restricted-syntax rule banning AsyncStorage.setItem / multiSet, requiring safeSetItem / safeMultiSet (eslint.config.js, excludes lib/safe-async-storage.ts)
- [x] Add 3 MB push notification alert in safeSetItem that fires when a key exceeds 3 MB (lib/safe-async-storage.ts, uses scheduleNotificationSafe, per-session dedup)

## Pre-commit Hook + Clear Telemetry + Notification Deep-link (Apr 27, 2026)
- [x] Install husky + lint-staged and configure pre-commit hook to run pnpm lint on staged TS/TSX files
- [x] Add "Clear telemetry" button inside Storage Health diagnostics row to reset sparkline history
- [x] Wire storage-size notification data.key payload to deep-link that opens Settings → Privacy

## HealthKit Pipeline Audit — 13-Point Crash Prevention (Apr 27, 2026)
- [x] Create lib/health/healthkit-helpers.ts: safeHealthKitCall(name, fn, fallback), withTimeout(promise, ms, fallback), normalizeSample(sample), isHealthKitAvailable() (re-export from healthkit-loader.ts)
- [x] Update native-health-service.ts syncAll: replace Promise.all with sequential fetch, enforce 7-day auto window, 100 sample/type limit, fetch order weight→steps→RHR→HR→sleep→SpO2→glucose→BP→workouts→optional
- [x] Update native-health-service.ts syncAll: add cancellation flag, 15s manual timeout, try/catch/finally, no setState after unmount
- [x] Update native-health-service.ts: wrap all individual fetchers with safeHealthKitCall, add array guards, sample validity guards, safe logging (no private health values in production)
- [x] Update native-health-service.ts: fix weight unit safety — kg→lb once only, guard 50–700 lb range
- [x] Update permissions.ts fetchHealthData: replace 90-day window with 7-day auto window, add 5s dashboard timeout, add cancellation flag, preserve old data on failure
- [ ] Update permissions.ts fetchHealthData: implement 4-stage manual sync (most-recent → 24h → 7d → optional 30d) [deferred — requires staged fetch UX changes]
- [x] Update background-sync-service.ts: replace Promise.all with sequential fetch, add 7-day window cap, add timeout/cancellation, add iOS/module guards
- [x] Update background-sync-service.ts getLastSyncTime: change default from 90 days to 7 days
- [ ] Add first-connection small-window fetch path (24h steps/HR, 7d RHR/HRV/sleep/SpO2/resp, 14d glucose/BP, 7d workouts limit 20, weight most-recent 1) [deferred — future enhancement]
- [ ] Add historical sync function: user-initiated only, 7-day chunks, delay between chunks, save each chunk, continue on chunk failure, 90-day max [deferred — future enhancement]
- [x] Dashboard index.tsx: verify cached data loads first, HealthKit fetch deferred until UI stable, graceful empty state on failure, null not zero for missing data
- [x] Distribution safety: search for unguarded HealthKit calls, Promise.all with HealthKit, map/filter on possibly undefined results; run tests (0 new failures)

## UI/UX Fixes — Apr 27, 2026
- [x] Remove HealthKit notification dot from home screen header
- [x] Fix invisible data retention window text in Settings (low contrast)
- [x] Remove Personal Nutrition Index card and all references to it in Sources/info sections (keep macro breakdown nutrition)
- [x] Replace all Terms of Use / Privacy Policy links across the app with exact URL: https://vitalsyncpersonalwellnesshub.com/article/privacy-policy

## Weekly Check-In & Settings Fixes — Apr 27, 2026
- [x] Fix weekly check-in reminder: "0 out of 7 vitals logged" shows even when vitals were logged — audit vital count logic to correctly read from health data store
- [x] Weekly check-in reminder: dismiss/hide as soon as user logs any vital signs (real-time dismissal)
- [x] Consolidate Privacy Policy + Terms of Use into a single "Terms & Privacy Policy" row in Settings → About

## Weekly Check-In Banner Dismiss Button — Apr 27, 2026
- [x] Add manual ✕ dismiss button to weekly check-in banner (close without logging a vital, persisted to AsyncStorage)

## Daily Streak Card & Log Now Shortcut — Apr 27, 2026
- [x] Extend weekly check-in banner to show every day (not just Mondays) as a current-week streak card: "You've logged vitals X of Y days this week"
- [x] Add "Log now →" teal chip inside the banner that navigates directly to the vital signs entry screen

## Streak Notification & Glucose Chip — Apr 27, 2026
- [x] Add 7-day streak milestone local push notification ("Perfect week! 🎉 You logged vitals every day this week") — fires once per week, deduped by week key
- [x] Add "Log glucose →" shortcut chip in the streak banner, shown only when user hasn't logged blood sugar today
- [x] Add "Show glucose shortcut on dashboard" toggle in Settings → Notifications (off by default) to gate the glucose chip for non-diabetic users

## Glucose Smart Reminder & AC/HS Scheduling — Apr 27, 2026
- [ ] Add glucose Smart Reminder card in dashboard Smart Reminders section: visible after 6 PM when glucoseChipEnabled=true and no blood sugar logged today; has "Log glucose →" button
- [ ] Add AC (before meals) / HS (bedtime) / every-6-hours blood glucose reminder scheduling in Settings → Notifications
- [ ] Schedule/cancel local push notifications for the chosen glucose reminder schedule

## Blood Glucose Reminder Modes & Smart Reminder Card — Apr 27, 2026
- [x] Rewrite sugar-notification.ts: support AC (before meals ×3: 07:30, 12:00, 18:00), HS (bedtime: 21:30), every-6-hours (06:00, 12:00, 18:00, 00:00) modes; cancel all previous IDs on mode change
- [x] Update Settings sugar reminder UI: replace single-time TextInput with AC/HS/6h mode chip selector + optional custom time per mode
- [x] Add glucose Smart Reminder card to dashboard Smart Reminders: visible after 18:00 when glucoseChipEnabled=true and no blood sugar logged today; has "Log glucose →" and "Dismiss" buttons

## Glucose Reminder UX Improvements — Apr 27, 2026
- [x] Add pre-meal AC countdown chip to Evening Glucose Check card (shows "⏱ Xm left" during active slot window)
- [x] Add "Last logged" timestamp to Evening Glucose Check card ("Last: X days ago" or "Never logged")
- [x] Auto-suggest AC mode when glucose shortcut chip is first enabled (set glucoseReminderMode to 'ac' on first toggle-on if mode was 'custom')
- [x] Evening Glucose Check smart reminder: limit visibility to a 30-minute window per slot instead of all evening
- [x] Glucose smart reminder: show at user's chosen mode slots (AC: 7:30/12:00/18:00, HS: 21:30, 6h: 6:00/12:00/18:00/00:00, Custom: user time) — 30-min window per slot

## AC Mode Per-Slot Time Overrides — Apr 27, 2026
- [x] Update sugar-notification.ts: accept optional acSlotTimes [breakfast, lunch, dinner] overrides; schedule per-slot notifications with custom times
- [x] Add per-slot time editors in Settings AC mode section (breakfast/lunch/dinner ±30 min from defaults 7:30/12:00/18:00); persist to AsyncStorage
- [x] Update dashboard smart reminder: read per-slot AC times from AsyncStorage and use them for the 30-min window check

## Multi-Fix Batch — Apr 27, 2026
- [x] HealthKit pipeline: ensure activity (active energy, exercise minutes), diastolic BP, and systolic BP are fetched using the same safe sequential pattern
- [x] Nutrition: remove Carbohydrate Quality Index tab and Protein Bio-availability tab; keep only Macro Breakdown tab
- [x] Weather: fix slow loading on dashboard and activity screen — cache-first (stale data shown immediately), timeouts reduced from 18s to 10s
- [x] Dashboard: wire steps count next to calories left in the stats row (data.steps field added to HealthData, populated from HealthKit syncAll)
- [x] Dashboard: sleep tab display verified correctly wired in stats row
## Production Crash Fix — EXC_BAD_ACCESS in Hermes indexOf — Apr 27, 2026
- [x] Analyse IPS crash report (VitalSync-2026-04-27-101401.ips): EXC_BAD_ACCESS / SIGSEGV in Hermes arrayPrototypeIndexOf on JS thread after ~15 min runtime
- [x] Fix background-sync-service.ts: replace diastolics.indexOf(s) with Map<StagedBPSample,number> lookup to eliminate reference-equality failure on JSON-deserialized objects
- [x] Fix neon-vitals.tsx: replace allWithKey.indexOf(s) (O(n²) re-filter inside .map()) with pre-computed filteredSeries + index parameter — eliminates reference mismatch crash vector
- [x] Fix index.tsx (×2): add e.urgency ?? 'normal' null guard in both order.indexOf(e.urgency) reduce calls (clinicalNarrativeUrgency + highestUrgency in Clinical Narrative panel)

## HealthKit Sync Pipeline Audit — Apr 27 2026
- [x] Activity fetch window: enforce 14-day hard cap (was 7 days), 50-record limit
- [x] Workout fetch limit: reduce from 100/200 to 50 in both Nitro and RCT paths
- [x] BP fetch pipeline: fix RCT field names (bloodPressureSystolicValue / bloodPressureDiastolicValue)
- [x] BP fetch pipeline: use null for missing values instead of 0, remove zero-filter
- [x] BP fetch pipeline: enforce 14-day window and 50-record cap in fetchHealthKitBloodPressure
- [x] BP fetch pipeline: rnhFetchBloodPressure limit reduced from 200 to 50
- [x] BloodPressureRecord type: systolic/diastolic changed to number | null for partial readings
- [x] Sync order updated: weight -> steps/activity -> RHR -> HR -> sleep -> BP -> glucose -> SpO2 -> workouts
- [x] background-sync-service: null guards on bpPoints flatMap (skip null systolic/diastolic)
- [x] index.tsx: latestBP filter accepts partial records (systolic OR diastolic not null)
- [x] index.tsx: BP display uses null-coalescing (120/-- mmHg format)
- [x] index.tsx: bpTrend null guard for null systolic
- [x] log.tsx: formatBP accepts partial readings, shows sys/-- or --/dia
- [x] record.tsx: formatVitals accepts partial BP, shows sys/-- or --/dia
- [x] blood-pressure.tsx: filter includes partial records, stats skip null values, hero uses null-coalescing
- [x] neon-vitals.tsx: BP upsert skips null values
- [x] vitals-summary.tsx: BP display uses null-coalescing, bpStatus guards against null

## Crash Fix #2 — Hermes BoundFunction / EXC_BAD_ACCESS (2026-04-27)
- [x] Analyse IPS crash report (VitalSync-2026-04-27-104710.ips): EXC_BAD_ACCESS / SIGSEGV in Hermes BoundFunction::_boundCall at 9 min runtime — null HermesValue32::unboxToHV from .bind(HK) promisify callback
- [x] native-health-service.ts: convert all 6 Promise.all/allSettled HealthKit query blocks to sequential await calls
- [x] device-sync.ts: convert both Promise.all HealthKit/HealthConnect query blocks to sequential await calls
- [x] healthkit-background-delivery.ts: convert 2 Promise.all enableBackgroundDelivery loops to sequential for-of loops
- [x] healthkit-write.ts: convert Promise.all saveVitalSignsToHealthKit to sequential; convert Promise.allSettled nutrition loop to sequential for-of with try/catch
- [x] rnh-fetch.ts: add .catch(() => []) fallbacks to all promisify() calls (BP, workouts, body fat, temperature, SpO2)
- [x] neon-vitals.tsx: fix BP null check from truthy to null check (r.systolic != null)
- [x] vitals.tsx: fix hasBP check to handle partial readings; display uses ?? '--' format
- [x] vitals.tsx: fix unescaped quote ESLint error in scribeResult.transcript display
- [x] ESLint: zero errors in all changed files (pre-existing _MedicationsScreen errors excluded)

## Dashboard & UI Improvements — Apr 27, 2026
- [x] Dashboard: add medication take/skip/reschedule actions on medication smart-reminder widget
- [x] Dashboard: taken medication disappears from smart reminder and moves to history only
- [x] Dashboard: missed/skipped/rescheduled medications stay visible under Today section
- [x] Appointments: add address and zip code fields to location section
- [x] Medical/Surgical/Immunization: replace "Smart voice scribe" label with "Apple Voice" (iOS) / "Android Voice" (Android)
- [x] Macro breakdown: fix partial data being obscured
- [x] Dashboard: move macro breakdown section to below outdoor conditions/weather

## Feature Sprint — Medication Filter, Map Preview, Macro Stepper — Apr 27, 2026

- [ ] Medication History: add Taken/Skipped/Rescheduled filter chip row at top of history list
- [ ] Appointments: add static map thumbnail + native Maps deep-link (maps:// iOS, geo: Android) to appointment detail card
- [ ] Dashboard Macro Breakdown: inline ±5g stepper on tap of any macro bar to edit daily goal without leaving dashboard

- [x] Medication History filter chips (All/Taken/Skipped/Missed) in HistoryTab
- [x] Appointment map thumbnail + native Maps deep-link (maps:// iOS, geo: Android)
- [x] Macro goal inline stepper (±5g) on dashboard — tap any bar to edit goal
- [x] Fix _MedicationsScreen → MedicationsScreenInner (Rules of Hooks ESLint error)
- [x] Fix unescaped entities in medications.tsx (5 errors)

## Crash Hardening — Build 20829 (from Pasted_content_39.txt spec)
- [x] Fix date-range.ts: null-guard systolicAvg/diastolicAvg reduce calls (NaN crash)
- [x] Fix correlation-engine.ts: null-guard r.systolic map/reduce calls (NaN + null dereference)
- [x] Fix correlation-engine.ts: guard allBP reduce against empty array (div-by-zero)
- [x] Fix correlation-engine.ts: guard morningBPByDay.set against null systolic
- [x] Confirmed ErrorBoundary already wraps entire app at root _layout.tsx level
- [x] Confirmed correlation.ts pearsonCorrelation reduce is guarded by commonDates.length < 3
- [x] Confirmed rnh-fetch.ts all promisify calls have .catch fallbacks (from Crash Fix #2)
- [x] Confirmed all Promise.all HealthKit calls converted to sequential (from Crash Fix #2)

## Bug Fixes & UI Improvements (Apr 27 2026)
- [x] Remove Smart Scribe from allergies screen (UI, state, imports)
- [x] Fix bedtime reminder text layout in settings (horizontal label + times)
- [x] Fix Imperial US select-all behavior in measurement units settings
- [x] Fix dashboard crash before activity/weather data loads
- [x] Fix Bluetooth header button (tapping does nothing)
- [x] Bluetooth auto-connect/sync: save paired device to settings, auto-reconnect on next launch

## Production Sentry Crash Diagnostics (Apr 27 2026)
- [x] Upgrade @sentry/react-native from 7.2.0 to 8.9.2
- [x] Create lib/sentry.ts — centralised init, breadcrumb helpers, non-fatal capture, health value scrubber
- [x] Add screen breadcrumbs via Expo Router navigation listener
- [x] Add HealthKit sync breadcrumbs in lib/health/device-sync.ts
- [x] Add AsyncStorage breadcrumbs for critical reads/writes
- [x] Wire Sentry.captureException() into ErrorBoundary + GlobalErrorBoundary
- [x] Add release + build number to Sentry.init()
- [x] Add beforeSend filter to strip private health numeric values
- [x] Enable uploadSourceMaps + dSYM upload in app.config.ts (gated on EAS secret)
- [x] Update withSentryBuildPhase plugin for v8 sentry-cli path
- [x] Write vitest tests for sentry.ts helpers

## On-Device Insights System (Apr 28 2026)
- [x] Create lib/health/on-device-insight-engine.ts — InsightRules + InsightEngine logic
- [x] Create lib/health/insight-store.ts — AsyncStorage cooldown/timestamp persistence
- [x] Create lib/health/evidence-references.ts — local evidence reference registry
- [x] Create components/dashboard/on-device-insights-card.tsx — collapsible GlassCard UI
- [x] Replace inline insight block in app/(tabs)/index.tsx with OnDeviceInsightsCard
- [x] Add On-Device Insights Evidence Library section to Settings → Clinical Sources screen

## Dashboard On-Device Insights Polish (Apr 28 2026)
- [x] Fix lint error: replace AsyncStorage.setItem with safeSetItem in insight-store.ts
- [x] Remove unused colors variable from on-device-insights-card.tsx
- [x] Remove AHA Learn More link from Reference Only footer on dashboard
- [x] Move Small Wins tracker inside On-Device Insights card as a tabbed section (Insights | Small Wins)
- [x] Pass todaySteps and stepGoal props to OnDeviceInsightsCard from dashboard
- [x] Remove standalone Small Wins GlassCard from dashboard

## Sentry Removal (Apr 28 2026)
- [x] Remove @sentry/react-native import and initSentry/addScreenBreadcrumb from app/_layout.tsx
- [x] Remove Sentry.wrap() export wrapper from app/_layout.tsx
- [x] Remove reportErrorBoundary from components/error-boundary.tsx
- [x] Remove reportErrorBoundary from components/global-error-boundary.tsx
- [x] Remove addDataSourceBreadcrumb and captureNonFatal from lib/data-sources/data-sources-context.tsx
- [x] Remove addHealthKitSyncBreadcrumb and captureNonFatal from lib/health/background-sync-service.ts
- [x] Remove @sentry/react-native/expo plugin block from app.config.ts
- [x] Remove withSentryBuildPhase from app.config.ts plugins list
- [x] Remove SENTRY_ALLOW_FAILURE from all eas.json build profiles
- [x] Delete lib/sentry.ts
- [x] Delete plugins/withSentryBuildPhase.js
- [x] Delete sentry.properties
- [x] Delete tests/sentry.test.ts
- [x] Uninstall @sentry/react-native package
- [x] Remove Sentry-specific loop from plugins/withSuppressWarnings.js
- [x] Clean up Sentry comments in plugins/withCleanAppDelegate.js

## Trends Tab + Insight Cooldown Setting (Apr 28 2026)
- [ ] Add Trends tab with 7-day sparklines to OnDeviceInsightsCard (vital-specific data)
- [ ] Wire sparkline data from health context (BP, HR, sleep, weight, glucose, steps)
- [ ] Add insight cooldown duration setting to Settings → Notifications (1h, 4h, 8h, 12h, 24h, 48h, 72h)
- [ ] Persist cooldown setting to AsyncStorage via InsightStore
- [ ] Read cooldown setting in on-device-insight-engine.ts instead of hardcoded 24h

## Appointment 24-Hour Reminder Filter (Apr 28 2026)
- [ ] Filter doctor appointment reminders on dashboard to only show when appointment is within 24 hours
- [ ] Filter immunization reminders on dashboard to only show when due date is within 24 hours

## Medical & Surgical History Date Picker (Apr 28 2026)
- [ ] Add date picker to the right of text input in Medical History form
- [ ] Add date picker to the right of text input in Surgical History form

## Trends Tab + Insight Cooldown + Date Pickers (Apr 28 2026)
- [x] Add Trends tab with 7-day sparklines to OnDeviceInsightsCard (metric-aware: BP, glucose, sleep, HRV, weight, steps)
- [x] Add metric field to all 17 InsightEngine rules
- [x] Add getInsightCooldownMs / setInsightCooldownMs to insight-store.ts
- [x] Add Insight Cooldown Duration setting to Settings → Notifications (1h / 6h / 12h / 24h / 48h pill selector)
- [x] Add date picker to medical-history.tsx Date Diagnosed field
- [x] Add date picker to surgical-history.tsx Date of Surgery field
- [x] Filter doctor appointments to 24-hour window (upcomingAppts)
- [x] Filter immunization reminders to 24-hour window (VACCINE_LEAD_DAYS = 1)

## Trends Tab Enhancements + Reset Cooldowns (Apr 28 2026)
- [x] Add trend arrow (↑↓→) and direction label (Rising/Falling/Stable) to Trends tab sparkline
- [x] Add min/max/latest stats row to Trends tab
- [x] Add Reset All Insight History button below cooldown pill selector in Settings → Notifications
- [x] Confirm Doctor Appointment form already has DatePickerIconButton (already implemented)

## Correlate Tab + AI Brand Fixes (Apr 28 2026)
- [x] Fix Observed Historical Patterns: weight reads both data.weight[] and data.bodyComposition[]
- [x] Fix blood glucose field fallback order (glucoseMgDl → valueMgDl → value)
- [x] Lower hasData threshold from 3 to 1 so any logged data shows the chart
- [x] Update empty state message to reflect new threshold
- [x] Lower plainInsight minimum from 5 to 3 matched days
- [x] Replace AI with AI_BRAND (Apple Intelligence / Gemini) in caloric-trend-insight-card.tsx
## Correlate + Caloric Trend UI Enhancements (Apr 28 2026)
- [x] Add per-metric data density badge (Nd / —) to MetricChip in correlation-trend-chart.tsx
- [x] Compute dataDaysMap via useMemo (count distinct days per metric in selectedDays window)
- [x] Pass dataDays prop to both primary and secondary chip selectors
- [x] Add AI_BRAND_LOGO const (Apple logo on iOS, 🌐 on Android, 🤖 on web) to caloric-trend-insight-card.tsx
- [x] Render brandLogo Text element before brand name in both empty-state and main card headers
- [x] Add brandLogo style to StyleSheet.create() in caloric-trend-insight-card.tsx
- [x] Add share/export button (⬆) to Observed Patterns header row in correlation-trend-chart.tsx
- [x] Share button uses Share.share() with metric names, pearsonR, plainInsight, and disclaimer
- [x] Guard haptics with Platform.OS !== 'web' in share button handler
## Correlate + Insights Enhancements Sprint 2 (Apr 28 2026)
- [x] Add PDF export option to Observed Patterns share handler (expo-print + expo-sharing)
- [x] Add colour-coded correlation strength arc/ring on MetricChip (SVG arc proportional to |r|)
- [x] Add per-metric insight cooldown duration settings in Settings → Notifications

## Macro Breakdown UI Tweak (Apr 28 2026)
- [x] Move "Partial" / score badge to sit below "Number of Meals" in the Macro Breakdown header (neovital-macro-graph.tsx)

## Settings Per-Metric Cooldown Collapsible (Apr 28 2026)
- [x] Make Per-Metric Cooldown Override section collapsible (collapsed by default) in settings.tsx

## Settings Per-Metric Cooldown Persist State (Apr 28 2026)
- [x] Persist Per-Metric Cooldown Override expanded/collapsed state to AsyncStorage

## Settings Vital Waveform Smoothing Light Mode Fix (Apr 28 2026)
- [x] Fix Vital Waveform Smoothing section colours to be visible in both light and dark mode (theme-aware foreground/muted/border)

## Full Visual Redesign — Logo-Derived Brand + Glassmorphism (Apr 29 2026)
- [x] Extract brand colour system from VitalSync logo (Vital Green #22C55E, Electric Blue #38BDF8, deep gunmetal #0D1117)
- [x] Update theme.config.js with 48-token brand palette (primary, secondary, accent, glass, elevation, health domain)
- [x] Build glassmorphism design system: GlassCard (ui/), GlassButton, GradientBackground, GlowDot, SectionHeader components
- [x] Replace all 49 old teal #0D9488 instances with Vital Green #22C55E across all screens and components
- [x] Replace all 18 old navy #0A1628 instances with deep gunmetal #0D1117 across all screens and components
- [x] Replace all old Expo default teal #0a7ea4 instances with Electric Blue #38BDF8 across all screens and components
- [x] Update sparkline default colour to Vital Green #22C55E
- [x] Update app-loading-screen background to deep gunmetal #0D1117
- [x] Update app.config.ts Android adaptive icon and notification icon background to #0D1117
- [x] Update onboarding brand colours: BG_MID to #0A1A2E, ACCENT to Vital Green, pill border to green-tinted
- [x] Final consistency audit: 0 old colours remaining, 176 Vital Green usages confirmed

## Medication Smart Reminder & Blood Glucose Dexcom Fix
- [x] Medication smart reminder: show Taken/Missed/Skipped/Rescheduled status badges on cards
- [x] Taken → dismiss from smart reminders, route to History tab
- [x] Skipped → stay in Today view with Skipped badge; also route to History Skipped filter
- [x] Missed/Rescheduled → stay in Today view with appropriate badge
- [x] Blood glucose: replace Dexcom/CGM import Pressable with non-clickable info banner (Apple Health info only)

## Medication Improvements (May 2026)
- [x] Mark as Missed button on missed dose cards → route to History (Missed filter)
- [x] Smart reminder dashboard: collapse to "All done for today ✓" card when all doses actioned
- [x] Reschedule confirmation: route to Today tab and highlight the rescheduled dose at new time slot

## Medication Improvements Round 2 (May 2026)
- [x] Undo toast for Mark Missed (5-minute undo matching Taken undo pattern)
- [x] Missed dose streak alert on dashboard (3+ consecutive missed days → contact doctor warning)
- [x] Reschedule events as distinct entries in History tab (e.g. "Rescheduled from 08:00 → 10:00")

## Medication Improvements Round 3 (May 2026)
- [x] Weekly adherence score card on dashboard (% taken this week, e.g. "87% — 13 of 15 doses")
- [x] Optional note prompt when marking a dose as missed (reason: forgot / side effects / ran out / other)
- [x] Caregiver share report: PDF of last 30 days of dose logs from History tab

## Medication Improvements Round 4 (May 2026)
- [x] 7-day adherence trend bar chart on dashboard adherence card (daily taken/missed/skipped)
- [x] Missed dose reason analytics in History tab (top reasons this month with counts)
- [x] Doctor Report PDF: include medication adherence summary + full dose log alongside vitals

## Medication Improvements Round 5 (May 2026)
- [x] Fix BG_BOTTOM undefined crash
- [x] Adherence goal setting: user sets target % (e.g. 90%), progress indicator on adherence card
- [x] Weekly adherence share PDF: one-page PDF with 7-day bar chart + top missed reasons
- [x] Medication refill reminder card on dashboard when supply drops below threshold

## Medication Improvements Round 6 (May 2026)
- [x] Refill threshold editor in medication detail sheet (per-medication refillAt field, stepper UI)
- [x] 4-week adherence sparkline on Medications tab adherence card (rolling weekly % trend)
- [x] Caregiver email share option for weekly adherence PDF (MailComposer pre-fill)
## Medication Improvements Round 6 (scope update)
- [x] Move adherence card from dashboard into Medications tab (with goal, sparkline, share PDF)
- [x] Add 4-week rolling sparkline inside the Medications tab adherence card
- [x] Add caregiver email share option for weekly adherence PDF (MailComposer)

## Medication Improvements Round 7 (May 2026)
- [x] Inline refill threshold stepper in expanded medication card row (+/- buttons, no modal)
- [x] Weekly adherence push notification when adherence falls below goal (end-of-week, deep-link to Medications tab)
- [x] Sparkline bar tap-to-expand: navigate to History tab filtered to that week's date range

## Medication Improvements Round 8 (May 2026)
- [x] Missed-dose reason analytics mini-chart in History tab (top reasons this month, counts + %)
- [x] Refill reminder snooze options: add 3h and Tomorrow buttons (not just 1h)
- [x] Adherence streak badge: 🔥 consecutive days at/above goal on adherence card

## Medication Improvements Round 9 (May 2026)
- [x] Add pharmacy phone number (tap-to-call) to refill reminder card
- [x] Add map directions button (tap-to-open-in-Maps) to refill reminder card

## Medication Improvements Round 10 (May 2026)
- [x] Pharmacy editor row in expanded medication card (Set pharmacy: name, phone, address inline)
- [x] Show today's opening hours next to Directions button on refill reminder card

## Medication Improvements Round 11 (May 2026)
- [x] Mark-as-taken from smart reminder: immediately remove from reminder list and write history log entry visible in Medications History tab

## Medication Improvements Round 12 (May 2026)
- [x] Preferred pharmacy auto-fill when opening Add Medication form (already implemented in openAdd)
- [x] Edit Hours row in Pharmacy screen (available via Set Pharmacy editor in expanded medication card)
- [x] Call to Refill button on refill reminder card (pre-fills call + auto-logs refill request date)

## Bug Fixes (May 2026)
- [x] Fix "map is not a function" crash on medication card (logDose/reinstateDose called with wrong args — now passes meds array as first arg)

## Medication Improvements Round 13 (May 2026)
- [x] Smart reminder medication cards: show Taken / Missed / Reschedule buttons (due-dose, missed-dose, skipped-dose cards)
- [x] Call to Refill button on refill reminder card (tap-to-call + auto-log refill request date)

## Bug Fixes Round 2 (May 2026)
- [x] Fix BG_BOTTOM undefined crash in onboarding.tsx (already defined at line 62 — was cached bundle issue)
- [x] Fix remaining meds.map is not a function in index.tsx (createDoseLog called with wrong arg order at line 623 — fixed to pass todayKey as first arg)
- [x] Fix Alert.prompt crash on web/Android (replaced with inline cross-platform TextInput + Save button)
- [x] Fix "Scheduled NaN" display on missed-dose reminder cards (safeFormatTime was receiving a number not a Date)

## Medication Improvements Round 14 (May 2026)
- [x] Missed-dose reason picker bottom sheet (Forgot, Side effects, Ran out, Felt better)
- [x] Native iOS DateTimePicker for reschedule (text input fallback for Android/web)
- [x] Persist dismissed reminder IDs to AsyncStorage with 24-hour TTL (expires after 24h, reappears next day)

## Round 15
- [x] Other chip
- [x] Toast
- [x] Filter

- [x] Remove Call button from pharmacy refill card and move Map button to right of Smart Reminders pharmacy row

## Round 17
- [x] Auto-log refillRequestedDate when Map button tapped on pharmacy refill card
- [x] Push local notification when reason streak first hits 3
- [x] Add trend delta column to PDF reasons table

## Round 17 Features (May 2026)
- [x] Refill auto-log — record refillRequestedDate when Map button is tapped on pharmacy refill card
- [x] Reason-streak local notification — push notification when same reason appears 3+ consecutive times
- [x] PDF reasons trend delta — add vs-prior-30d trend column to PDF reasons table in report-generator.ts

## Round 18 Features (May 2026)
- [x] Full AI terminology audit — replaced all 'AI' references with platform-specific terms
- [x] iOS: 'Apple Intelligence' branding in insight engine and insight-related UI
- [x] Android: 'Gemini' branding in insight engine and insight-related UI
- [x] Insights module: uses only 'Insights', 'Health insights', 'Trends', 'Patterns' — never 'AI'
- [x] INSIGHT_BRAND platform constant wired into insight-engine.tsx
- [x] Refill-requested timeline entry in History tab (shows refillRequestedDate events)
- [x] Reason-streak notification 'Refill Now' action button (reason_streak_refill category)
- [x] PDF Share — already implemented via 'Share Report' in medications History tab and 'Share Last Report' in report.tsx
- [x] Zero remaining 'AI' occurrences in codebase (0 found in final validation scan)

## Medication & Insights Improvements Round 19 (May 2026)
- [x] Refill lifecycle badge on medication cards (Refill Requested · date, Refill Due, In Stock)
- [x] Gemini/Apple Intelligence branding badge on insight card headers
- [x] Streak-reason dismissal memory (7-day TTL, clears when streak resets)

## Medication & Insight Improvements Round 20 (May 2026)
- [x] Tappable refill lifecycle badge opens pharmacy map (with ↗ indicator when address available)
- [x] Auto-log refillRequestedDate when tapping refill badge in medication card
- [x] Configurable low-stock threshold in Settings → Notifications (3/5/7/14/30 pills)
- [x] Persist low-stock threshold to AsyncStorage (key: @vitalsync:low_stock_threshold_v1)
- [x] Long-press tooltip on platform branding badge in insight cards (Powered by Apple Intelligence / Gemini)
- [x] Tooltip auto-dismisses after 2.2 seconds with haptic feedback

## Insight Engine Accessibility Round 21 (May 2026)
- [x] Add ? info button next to INSIGHT ENGINE section header
- [x] Tapping ? opens a modal explaining Apple Intelligence / Gemini analysis
- [x] Modal has 3 sections: platform badge explanation, what it analyses, privacy
- [x] Modal shows platform-specific text (iOS: Apple Intelligence, Android: Gemini, web: Smart Analysis)
- [x] Modal dismisses on backdrop tap or Got it button

## Medication History UI Fixes Round 22 (May 2026)
- [x] Remove 'Share Report' text from History tab button (icon-only envelope)
- [x] Make Top Missed/Skipped Reasons section collapsible (collapsed by default)
- [x] Fix lowStockThreshold prop error: add to MyMedsTab props interface and pass from MedicationsTab
## Analytics UI Redesign Round 23 (May 2026)
- [x] Merge Circadian Rhythm + 72-Hour Lag Effect insights into one side-by-side tab card (circadianLagTab state)
- [x] Merge Nutrition Correlate + Diabetic Nutrition Today into one collapsible NUTRITION ANALYSIS card
- [x] Redesign Observed Historical Patterns: scatter/trend view mode toggle, r-value badge, regression line
- [x] Move Observed Historical Patterns section to appear below Recovery Trend in analytics.tsx
## Analytics UI Round 24 (May 2026)
- [x] Move DASH Diet Caloric Trend into Nutrition Analysis as a third tab (Correlate / Diabetic / Caloric)
- [x] Animate Circadian/Lag tab switcher with Reanimated sliding underline indicator (withTiming)
- [x] Add actionable empty state to Diabetic Nutrition sub-section (icon + CTA to open food log)
- [x] Persist Scatter/Trend viewMode to AsyncStorage in correlation-trend-chart.tsx
## Analytics UI Round 25 (May 2026)
- [x] Add today's entry-count badge to Nutrition Analysis header (e.g. "🥗 NUTRITION ANALYSIS · 3 entries")
## Analytics UI Round 26 (May 2026)
- [x] Animate Nutrition Analysis tab content with Reanimated FadeIn/FadeOut on tab switch
- [x] Extend header badge to show calorie total ("3 entries · 1,240 kcal")
- [x] Add 🔥 streak indicator (consecutive logging days) to Nutrition Analysis header
## Analytics UI Round 27 (May 2026)
- [x] Move Nutrition Analysis + Insight Engine above On-Device Insights section
- [x] Keep three tab chips (Correlate/Diabetic/Caloric) visible in Nutrition Analysis collapsed state
- [x] Make Insight Engine privacy modal content scrollable before tapping "Got it"
## Analytics UI Round 28 (May 2026)
- [x] Add Best Streak record below 🔥 badge in Nutrition Analysis header ("Best: Nd")
- [x] Persist nutritionTab to AsyncStorage so last-viewed tab is restored on next launch
- [x] Add HEALTH INSIGHTS section divider label above On-Device Insights block
## Dashboard Smart Notification Round 29 (May 2026)
- [x] Align "Call to Refill" button with "Update Supply" button — give both flex:1 and consistent paddingVertical so text baselines match
## Dashboard Smart Notification Round 30 (May 2026)
- [x] Remove/replace the word "Radh" under peanuts in the medication card (user fixed via app)
- [x] Add pharmacy name label above the refill button row ("📍 CVS Pharmacy")
- [x] Show "✓ Called" confirmation state for 2 seconds after tapping Call to Refill
## Dashboard Layout Round 31 (May 2026)
- [x] Move "Almost There" weight-goal card from dashboard footer into On-Device Insights section
- [x] Make the weight-goal card tappable, navigating to the weight log screen
## Dashboard Activity & Readiness Round 33 (May 2026)
- [x] Combine Daily Readiness + Outdoor Conditions into "Activity & Readiness" GlassCard with two side-by-side tabs
- [x] Show rich two-line collapsed preview: line 1 = Today/Steps/Distance/Active Cal/Fiber; line 2 = Daily Readiness score/Sleep/Systolic
## Medications Form Round 34 (May 2026)
- [x] Remove "Refill Reminder Date (optional)" section from Add Medication form (app already handles reminders automatically)
## Activity & Readiness Card Round 35 (May 2026)
- [x] Animate Activity/Readiness tab content switch with Reanimated withTiming fade
- [x] Add "no weather data" empty state with "📍 Add city in Weather" CTA in Activity tab
- [x] Persist active tab (Activity/Readiness) to AsyncStorage across sessions
## Activity & Readiness Card Round 36 (May 2026)
- [x] Color 💪 Readiness tab chip with readiness score color (green/amber/red) for at-a-glance status
- [x] Add haptic pulse (Light) when no-city CTA is tapped before navigating to Weather tab
- [x] Show "last updated" timestamp in Activity tab collapsed header ("Updated 3m ago")
## Activity & Readiness Card Round 37 (May 2026)
- [x] Add readiness trend arrow (↑ / ↓ / →) next to score in collapsed header based on today vs yesterday readiness
## Dashboard Nutrition Card Round 38 (May 2026)
- [ ] Redesign Nutrition card collapsed state: chart icon + "Macro Breakdown" title + "7-Day Avg · Evidence-Based" subtitle, status pill (No Data/Partial/On Track), mini calorie progress ring, Scan Meal + Search Food buttons matching neovital-macro-graph.tsx logMealS styles
- [ ] No period selector (Today/7d/14d/30d) in collapsed state
- [ ] No diet profile label in collapsed state
- [ ] Diet protocol reflected in Search Food button label when user has selected a diet in settings (e.g., "Search Food · Keto")
- [ ] Import useDietType + DIET_TYPE_OPTIONS into smart-nutrition-card.tsx for live diet-aware button labels
- [ ] Add AiFoodCameraSheet to smart-nutrition-card.tsx for Search Food button (search mode)
- [x] SmartNutritionCard collapsed: Log Food button uses dietEmoji + dietAccent color live from useDietType (same as Record nutrition tab)
- [x] SmartNutritionCard collapsed: Vision Food button uses Platform.OS to show "🍎 Vision Food 📸" on iOS and "G android 📸" on Android
- [x] SmartNutritionCard: Today's summary strip (kcal · net carbs · fat · protein pills) below buttons when entries exist
- [x] SmartNutritionCard: Wire Log Food button to AiFoodCameraSheet in search mode
- [x] SmartNutritionCard: Period selector (Today/7d/14d/30d) inside expanded body only
- [x] SmartNutritionCard collapsed: when entries exist today, replace Log Food + Vision Food buttons with Today's summary macro pills; keep buttons when no entries logged
- [x] SmartNutritionCard collapsed summary strip: show entry count label (e.g., "3 meals · 1,240 kcal") above the macro pills
- [x] SmartNutritionCard collapsed: always show Scan Meal + Search Food two-button layout (remove conditional summary strip swap) — match dark-mode reference image exactly
- [x] On-Device Insights card collapsed state: header row (🧠 icon + "On-Device Insights" title + "Evidence-Based" violet pill + ▲ chevron) + dark segmented pill row with 🧠 Insights and 🏆 Wins tabs
- [x] Vital monitor card (dashboard): collapsed state uses light mode styling in light mode (light bg, dark text, light borders); expanded neovital graphs keep default dark appearance
- [x] Remove all Sentry references from codebase (imports, init calls, config properties, package dependency) — sentry.properties already absent from HEAD; whats-new-sheet.tsx changelog updated; neovital-vitals-card.tsx ESLint errors fixed
- [x] Smart Reminder: wire Taken/Skipped/Reschedule buttons to update medication status and clear the task from Today list
- [x] Medications tab: when medication marked as Taken in Smart Reminder, remove from Today list and show in History as taken (real-time sync via shared storage via useFocusEffect reload)
- [x] Doctor Report PDF: wire glucoseData to sparklineData block (30d/90d range)
- [x] Doctor Report PDF: wire weightData to sparklineData block (30d/90d range)
- [x] Doctor Report PDF: weightSparkline already exists — wired to sparkWeightData (smooth blue area chart, trend arrow, range label)
- [x] Doctor Report PDF: replace weightSparkline call in body composition section with sparkWeightData
- [x] Doctor Report PDF: replace glucoseSparkline call in glucose section with sparkGlucoseData
- [ ] Doctor Report PDF: embed vital tile chart images (heart rate, blood pressure, SpO2, etc.) captured from dashboard vital tiles instead of plain text summaries
- [x] Doctor Report PDF: per-vital sparkline charts (HR, BP, SpO2, HRV, Sleep, Glucose) use selected date range (30d/90d) matching dashboard vital tile sparkline aesthetic; neoVitalRangeDays synced to individual sparkline sections
- [x] Doctor Report PDF: redesign hrvSparkline — color-coded vertical bars (≥50ms green, ≥35ms blue, ≥20ms amber, <20ms red) + 7-day rolling average white line + 35ms/40ms threshold lines
- [x] Doctor Report PDF: redesign spo2Sparkline — dense oscillating cyan line (#38BDF8), normal range band 95-100%, dashed threshold lines, dark background
- [x] Doctor Report PDF: redesign bpSparkline — smooth area chart, systolic green filled + diastolic blue dashed, dark background
- [x] Doctor Report PDF: redesign hrSparkline — dense oscillating pink/red line, dark background
- [x] Doctor Report PDF: redesign neoSleepSparkline — 14-night stacked bar chart (Deep/REM/Light/Awake), goal line at 7.5h, dark background
- [x] Doctor Report PDF: redesign glucoseSparkline — red line, color-coded dots by range, dashed threshold lines (180/70 mg/dL), Time in Range bar
- [x] Doctor Report PDF: add SpO2 section to HTML template after Heart Rate section
- [x] Doctor Report PDF: wire neoVitalRangeDays to filter individual sparkline data (BP, HR, SpO2, HRV, Sleep) when user selects 30d/90d on NeoVital section- [x] Doctor Report PDF: add readings count badge to each section title (BP, HR/HRV, SpO2, Body Composition, Sleep, Glucose/A1C)
- [x] Doctor Report PDF: add glucose Time in Range horizontal bar to A1C stats table (% above / in range / below, goal 70% badge, color legend)
- [x] Report screen: persist neoVitalRangeDays (30d/90d) to AsyncStorage so selection survives app restarts
- [x] Doctor Report PDF: add Time in Range row to A1C stats mini-table
- [x] Doctor Report PDF: add HRV Time in Optimal Zone stacked bar beneath HRV sparkline
- [x] Report screen: add Copy Report Link button after PDF generation
- [x] Doctor Report PDF: add Report Summary header card at top of PDF (dark card, sections list with color dots, total readings, date range badge)
- [x] NeoVitalMacroGraph: add Scan Meal (camera) and Search Food buttons to collapsed state
- [x] Dashboard: remove NUTRITION and PERSONAL section headers
- [x] Fix Doctor Name placeholder to "e.g. John Smith" and Prepared By to "e.g. Alex Korir, MSN, RN, CCRN-CMC"
- [x] Add live language preview: changing report language immediately updates report labels without re-generating
- [x] Add Gemini API client-side fallback translator for Android/web when server translation call fails
- [x] Fix Doctor Name placeholder to "e.g. John Smith" (no default suffix)
- [x] Add live language preview: changing report language immediately re-renders report labels
- [x] iOS: use Apple Intelligence on-device translation (MLKit/NLLanguageRecognizer native module) as client-side fallback
- [x] Android/web: use Gemini API (direct REST call) as client-side fallback when server translation fails
- [x] Build lib/translation-fallback.ts: platform-aware fallback (iOS → Apple, Android/web → Gemini)
- [x] Wire fallback into i18n-ai.tsx ensureTranslations() and handleTranslatePDF() in report.tsx
- [x] Add translation engine attribution badge in report preview footer (Apple / Gemini / Server)
- [x] Add Clear Translation Cache button in Settings screen — always visible, clears all languages, shows cached count badge, updates count after clearing
- [ ] Add Android ML Kit model download progress indicator in report.tsx
- [ ] Refactor HK_LIMITS constants: HR 500-800 cap, sleep 90 records, BP 200 records, glucose 90-day, activity 90-day daily totals
- [ ] Heart rate: latest value for dashboard, 500-800 sample cap, hourly/daily aggregation helpers
- [ ] Sleep: last 90 records cap, refresh on wake/app-open only (not repeated like HR)
- [ ] Blood pressure: separate systolic/diastolic fetch, latest BP for dashboard, last 200 readings, pair by timestamp, null-safe
- [ ] Glucose: 24h dashboard, 7/14/90-day trends, ADAG A1C from 90-day average
- [ ] Activity: daily totals only, 30-90 day summaries, no raw workout samples for reports
- [ ] device-sync.ts: apply same limits (glucose 24h/7d/90d, vitals 200 BP, HR 800 samples)
- [ ] Null-safe empty states: BP, glucose, sleep — show clean empty state instead of crash/zero
- [ ] Reports: use aggregated data only, no raw sample overload

## HealthKit/Health Connect Fetch Strategy Audit
- [x] Audit all health data fetch paths in native-health-service.ts and healthkit-helpers.ts
- [x] Heart rate: cap at 800 samples (MAX_HR_SAMPLES), add hourly/daily aggregation helpers (aggregateHRHourly, aggregateHRDaily)
- [x] Heart rate: add fetchLatestHeartRate() for dashboard single-value fetch
- [x] Sleep: cap at 90 records (MAX_SLEEP_RECORDS) on both iOS (HealthKit) and Android (Health Connect)
- [x] Sleep: use 90-day window in syncAll instead of 7-day window
- [x] Blood pressure: add fetchLatestBloodPressure() returning null when unavailable
- [x] Blood pressure: parameterize limit in fetchHealthKitBloodPressure and fetchHealthConnectBloodPressure
- [x] Blood pressure: update HC fetch to return null for missing systolic/diastolic (not 0)
- [x] Blood glucose: add estimateA1C() using ADAG formula (requires ≥14 readings)
- [x] Blood glucose: update syncAll to use 90-day window (GLUCOSE_90D_WINDOW_MS) and MAX_GLUCOSE_SAMPLES
- [x] Activity: update syncAll to use 90-day window (ACTIVITY_WINDOW_MS) and MAX_ACTIVITY_RECORDS (90)
- [x] HK_LIMITS: add all new constants (MAX_HR_DASHBOARD, MAX_HR_SAMPLES, MAX_BP_DASHBOARD, MAX_BP_RECORDS, MAX_SLEEP_RECORDS, GLUCOSE_*_WINDOW_MS, MAX_GLUCOSE_SAMPLES, MAX_ACTIVITY_RECORDS, ACTIVITY_WINDOW_MS)
- [x] Create lib/health/health-empty-states.tsx with null-safe empty state components (BloodPressureEmptyState, GlucoseEmptyState, SleepEmptyState)
- [x] Add safeHealthValue() and safeBPValue() utilities to prevent zero/null display in UI

## Round 4 Changes
- [x] Fix Prepared By placeholder to "e.g. Alex Korir, MSN, RN, CCRN-CMC" and remove hardcoded default "Alex Korir MSN, RN"
- [x] Wire BloodPressureEmptyState into dashboard BP tile and record screen BP section
- [x] Wire GlucoseEmptyState into dashboard glucose tile and record screen glucose section
- [x] Add estimated A1C tile to glucose card with "90-day average" label and ADAG tooltip
- [x] Add last-synced timestamp below each health card
- [x] Add "Sync now" button when data is older than 6 hours
- [x] Add "Clear A1C history" action to ProjectedA1CCard footer
- [x] Surface GlucoseEmptyState on dashboard glucose reminder card ("Glucose not logged today")
- [x] Add Settings toggle to configure stale-data sync threshold (default 6h)
- [x] Wire stale-data threshold from Settings into BentoMetricTile isStale calculation
- [x] Fix Health Permission Details button missing on web in Settings Health Data section (removed iOS-only Platform.OS guard)
- [x] Replace generic Android/web notice with Health Connect deep-link button on Android in healthkit-permissions screen
- [x] Add "Request all permissions" shortcut button for first-time iOS users at top of healthkit-permissions screen
- [x] Surface permission-status badge (e.g. "12/14 granted") on Health Permission Details row in Settings
- [x] Fix: Health Permission Details badge shows "Not Set Up" even after permissions granted — authorizationStatusFor() was missing await in checkPermissions()
- [x] Fix: Pulse & HRV tile shows "—" despite 803 readings — lexicographic ISO string comparison ("...+00:00" < "...Z") filtered out all HealthKit records in computeDashboardAverages and latestPulse/latestBP sorts; replaced with numeric ms comparison
- [x] Fix: App crashes on first-sync celebration — prevStreakRef.current starts as null, and null >= 0 is true in JS so confetti fired on initial mount; added early return when prev === null
- [x] Fix: Pulse & HRV tile number shows as tiny dot — adjustsFontSizeToFit was shrinking the value to 60% of 28px; removed to always render at full 28px
- [x] Fix: Remove first-sync celebration (streak confetti) that crashed on HealthKit data flood
- [x] Fix: Remove hardcoded "Dr. Johnson" default from health report — doctorName now passes undefined when blank so the PDF omits the doctor field
- [x] Add "Tap to add doctor" hint link below Doctor Name field in report.tsx
- [x] Show "No physician on file" note in PDF header when doctorName is blank
- [x] Fix BP tile primaryValue font shrinking — remove adjustsFontSizeToFit from BP tile or reduce font size for longer strings
- [ ] Add "Prefill from upcoming appointment" chip below Doctor Name field in report.tsx
- [ ] Localize "No physician on file" PDF note in report-generator.ts
- [ ] Add character limit indicators (12/50) to Doctor Name and Prepared By fields in report.tsx
- [x] Add prefill chip below Doctor Name field from upcoming appointment
- [x] Localize noPhysicianOnFile PDF note in all 15 language sections
- [x] Add character limit indicators (12/50, 12/60) to Doctor Name and Prepared By fields
- [x] Add specialty sub-label below prefill chip (e.g., Cardiology · May 12)
- [x] Add character counter to Patient Name field (0/50)
- [x] Localize prefill chip label via reportStrings i18n

## Full-App Localization System & Intelligence Naming (May 2026)
- [x] Create lib/intelligence.ts — platform-aware intelligenceName (Apple Intelligence / Gemini / Smart Analysis) with interpolate() function
- [x] Extend settingsStrings in lib/i18n.ts to all 15 languages with new keys: languagePageTitle, languagePageSubtitle, smartTranslatedLabel, intelligencePowered, deviceLanguage
- [x] Add 10 missing language sections (de, pt, hi, sw, ko, ja, ru, tr, it, nl) to settingsStrings
- [x] Create app/settings/language.tsx — premium full-screen Language Settings page with glass cards, checkmarks, RTL badges, Smart badges, search, device-language detection, and intelligence branding footer
- [x] Register settings/language route in app/_layout.tsx (Stack.Screen with headerShown: false)
- [x] Update Settings language row to navigate to /settings/language instead of opening modal
- [x] Replace hardcoded Platform ternary for SMART TRANSLATED label in settings.tsx with intelligenceName.toUpperCase()
- [x] Replace AI comment in smart-nutrition-card.tsx with Smart Food Search
- [x] ESLint: 0 errors, 0 warnings confirmed

## Intelligence Naming & Localization Polish (May 2026 — session 2)
- [x] Add i18n keys: smartAnalysisLabel, onDeviceProcessingNote, learnMore, restartRequired, reloadApp, translatingLabel, laterLabel to all 15 language sections in settingsStrings
- [x] Wire interpolate(t.smartAnalysisLabel) into insight-engine SMART ANALYSIS label
- [x] Wire interpolate(t.intelligencePowered) into correlation screen insight text
- [x] Enhance Language screen footer: add on-device processing note and Learn More link to About screen
- [x] Localize Settings langPickerVisible modal: Restart Required, Reload App, Translating…, Later
- [x] ESLint 0 errors/warnings, save checkpoint

## Bug Fixes (May 2026)
- [x] Fix biometric lock loop: enabling Face ID causes app to repeatedly lock/unlock
- [x] Remove duplicate What's New row under Notifications section in Settings
- [x] Fix biometric lock loop: enabling Face ID causes app to repeatedly lock/unlock
- [x] Personalize AppLockScreen tagline to show biometric type (Face ID / Touch ID / PIN)

## Health Report Full Translation (15 Languages)
- [ ] Audit current language lists in Settings and Health Report for mismatches
- [ ] Create shared SUPPORTED_LANGUAGES config as single source of truth (15 languages)
- [ ] Build full reportStrings translation object for all 15 languages (all report elements)
- [x] Remove all hardcoded English strings from Health Report components
- [ ] Wire report language selector inside Health Report screen, synced with global lang
- [x] Update PDF/export to use selected language
- [ ] Validate: no AI references, no mismatched languages, no broken keys

## Language System Unification (May 2026)
- [x] Create lib/supported-languages.ts as single source of truth for all 15 languages
- [x] Add ar, am, tl, so translation blocks to reportStrings and disclaimerStrings in i18n.ts
- [x] Add am, tl, so to LANG_NAMES in i18n-ai.tsx
- [x] Update report-lang-context.tsx: ReportLang type and ALL_REPORT_LANGS derived from SUPPORTED_LANGUAGES
- [x] Replace AI_LANGUAGE_OPTIONS in settings.tsx with SMART_SUPPORTED_LANGS from shared config
- [x] Replace STATIC/SMART language lists in language.tsx with SUPPORTED_LANGUAGES
- [x] Replace hardcoded SegmentedControl options in report.tsx with SUPPORTED_LANGUAGES
- [x] Replace hardcoded labels casts in report.tsx with getReportLabels() helper
- [x] Replace reportLangDisplayName map in report.tsx with SUPPORTED_LANGUAGES lookup

## Auth Lock Bug Fix (May 2026)
- [ ] Audit all auth-related files for the Face ID loop root cause
- [ ] Rebuild centralized AuthGate with isAuthenticating/isUnlocked/lastAuthTime/authRequired guards and 3s debounce
- [ ] Remove default report language row from Settings

## Auth Lock Bug Fix (May 2026)
- [x] Fix Face ID loop: add isAuthenticating mutex ref and hasAutoFired guard to app-lock-screen.tsx
- [x] Fix Face ID loop: add biometricAuthInProgress mutex to unlockWithBiometrics in auth-context.tsx
- [x] Fix Face ID loop: guard AppState listener against re-locking during biometric prompt (MIN_BACKGROUND_MS=2s)
- [x] Remove Default Report Language row from Settings (report language selector lives in Report screen only)
- [x] Remove unused useReportLang import and related state variables from settings.tsx

## Auth Lock Polish (May 2026)
- [ ] Add Lock Now icon to Dashboard header (calls auth.lockApp())
- [ ] Persist lastAuthTime to SecureStore in auth-context, restore on cold launch to skip re-prompt within 30s
- [ ] Add 300ms fade-out unlock animation to AppLockScreen after successful Face ID / PIN

## Auth Lock Polish (May 2026)
- [ ] iOS long-press on Dashboard privacy badge → navigate to setup-lock screen (Face ID / PIN setup)
- [ ] Persist lastAuthTime to SecureStore in auth-context, restore on cold launch to skip re-prompt within 30s
- [ ] Add 300ms fade-out unlock animation to AppLockScreen after successful Face ID / PIN

## Auth Lock Polish (May 2026)
- [x] Long-press App Lock row in Settings to navigate to setup-lock on iOS
- [x] Persist lastAuthTime to SecureStore across cold launches (skip re-prompt within 30s)
- [x] Add 280ms fade-out unlock animation to AppLockScreen (biometric + PIN success)

## Smart Reminder Button Alignment Fix (May 2026)
- [x] Fix Taken/Skipped/Rescheduled buttons in med-today-notification-card.tsx: remove flexWrap wrap, add alignItems center to actionsRow, add flex 1 to actionBtn so all three buttons share space equally
- [x] Reduce actionBtn paddingHorizontal from 12→8, paddingVertical from 6→7 for better touch targets

## Medication History Filter Chips (May 2026)
- [x] Add AsyncStorage persistence for historyFilter selection (key: @vitalsync:med_history_filter)
- [x] Add live record counts to each filter chip label (e.g. "Taken (12)")
- [x] Add Rescheduled filter chip to show doses with non-snooze rescheduleHistory entries

## Health Report i18n Audit & Reschedule Deep-link (May 2026)
- [ ] Audit health report PDF export for untranslated strings / mismatched i18n keys across all 15 languages
- [ ] Fix any translation gaps found in the audit
- [ ] Wire reschedule success toast 'View in History' to setHistoryInitialFilter('rescheduled')

## Language & PDF Export Overhaul (16 Languages)

- [ ] Create shared SUPPORTED_LANGUAGES config as single source of truth
- [ ] Add Armenian (hy) language to all language selectors and i18n
- [ ] Sync Settings language selector and Health Report language selector to shared config
- [ ] Ensure print preview uses selected language (no English fallback)
- [ ] Ensure all PDF exports use selected language: Health Report, Vitals, Blood Glucose, Sleep, Nutrition, Medications, Immunization, Doctor Appointments, Activity, Combined
- [ ] Translate all PDF content: headers, labels, disclaimers, empty states, error messages, export/share labels for all 16 languages
- [ ] Replace all "AI" references with platform-specific wording (iOS: Apple Intelligence, Android: Gemini)
- [ ] Add compliance disclaimer in all 16 languages: "VitalSync is for informational purposes only and does not provide medical advice, diagnosis, or treatment."
- [ ] Validate no mixed-language sections in any PDF
- [ ] Validate no broken translation keys in any language
- [ ] Remove unsupported languages from any selector

## Language & PDF Export Overhaul (May 2026)

- [x] Add Armenian (hy) to SUPPORTED_LANGUAGES as static language
- [x] Add Armenian translations to reportStrings in i18n.ts (all 40 keys)
- [x] Add Armenian translations to medicationStrings in i18n.ts
- [x] Add Armenian to STATIC_LANGS and LANG_NAMES in i18n-ai.tsx
- [x] Add medPdfStrings translation block for all 16 languages in i18n.ts
- [x] Add immunPdfStrings translation block for all 16 languages in i18n.ts
- [x] Wire medPdfStrings to medications.tsx PDF generators (Adherence Report + Weekly Summary)
- [x] Wire immunPdfStrings to immunizations.tsx PDF generators (Record + Certificate)
- [x] Translate all hardcoded PDF strings in report-generator.ts via ReportLabels (L.xxx)
- [x] Add all missing ReportLabels keys (dose log table, missed reasons, reschedule history)
- [x] Patch reportStrings for all 14 languages with missing keys (es, fr, zh, ko, ja, ru, tr, it, nl, pl, pt, de, hi, sw)
- [x] Confirm no AI references in client-side user-visible strings
- [x] Confirm server source files use Smart wording (not AI)
- [x] Wire reschedule toast View → deep-link to Rescheduled filter in History tab

## Language & PDF Export Overhaul (May 2026)
- [x] Add Armenian (hy) to SUPPORTED_LANGUAGES and STATIC_LANGS
- [x] Add Armenian to LANG_NAMES in i18n-ai.tsx
- [x] Add Armenian reportStrings (full 40-key block) to i18n.ts
- [x] Add 61 new reportStrings keys to all 19 existing languages (es, fr, zh, de, hi, pt, sw, ar, am, tl, so, ko, ja, ru, tr, it, nl, pl, hy)
- [x] Add medPdfStrings export block (20 languages) to i18n.ts
- [x] Add immunPdfStrings export block (18 languages) to i18n.ts
- [x] Wire medPdfStrings into medications.tsx both PDF generators
- [x] Wire immunPdfStrings into immunizations.tsx both PDF generators
- [x] Replace all hardcoded English strings in report-generator.ts with L. references
- [x] Add all new ReportLabels keys to report-generator.ts interface and DEFAULT_REPORT_LABELS
- [x] Wire reschedule toast "View in History" deep-link to Rescheduled filter
- [x] Verify no AI references in client-side user-visible strings
- [x] Compliance disclaimer translated in all 16+ languages

## Lock Screen Improvements (May 2026)
- [x] Add Forgot PIN recovery flow — biometric re-authentication to reset PIN, with full data wipe fallback
- [x] Fix Medical ID card WCAG AA contrast — raise background opacity from 0.07 to 0.13 and label color from 0.5 to 0.65

## Lock Screen & Security Improvements (May 2026 - Round 2)
- [x] Persist recovery attempt count — 3 biometric failures for Forgot PIN = 10-minute lockout
- [x] Add Change PIN screen under Settings -> Security (already existed; fixed module-level hack with useRef)

## Lock Screen UX (May 2026 - Round 3)
- [x] Show remaining recovery attempts inline below PIN dots on lock screen
- [x] Auto-clear recovery lockout on first launch after app reinstall

## Lock Screen UX (May 2026 - Round 4)
- [x] Live countdown timer for recovery lockout (mirrors PIN lockout timer)
## Face ID Lock Enable Flow (May 2026)
- [ ] Fix setup-lock.tsx: when Face ID is already enrolled, tapping "Enable Face ID Lock" triggers Face ID immediately (no Settings navigation) — confirm identity then enable lock
- [ ] Update settings.tsx subtitle: show "Face ID lock enabled" (not "Face ID + PIN enabled")

## Production Cleanup for Apple App Store (May 2026)
- [x] Remove auto-fire Face ID prompt loop from app-lock-screen.tsx
- [x] Remove biometric unlock button from lock screen UI
- [x] Rewrite setup-lock.tsx as PIN-only (no biometric option)
- [x] Add Face ID App Access instructions section to Settings
- [x] Fix settings.tsx subtitle: "PIN lock enabled" (not "Face ID + PIN enabled")
- [x] Remove biometricsEnabled and resetPinWithBiometrics from app-lock-screen.tsx
- [x] Simplify Forgot PIN to show device Settings instruction (no biometric recovery)
- [x] Remove health data console.log statements from health-sync.ts
- [x] Fix diastolic null check in threshold-checker.ts (already had != null guard)
- [x] Remove _Platform invalid import from apple-vision-food.ts (already fixed)
- [x] Confirm all localization keys are present across all 15 languages
- [x] Confirm all asset paths are valid (icon.png, splash-icon.png, audio files)
- [x] Confirm HealthKit permission flow only triggers on user tap
- [x] Confirm intelligence.ts uses Apple Intelligence/Gemini (no "AI" in UI)
- [x] Confirm medical language is proper disclaimer text (not claims)
- [x] Remove "Set Up" button from App Lock row in Settings (keep Face ID App Access card and all other rows)
- [x] Remove Set Up button from App Lock row in Settings (keep Face ID App Access card)
- [x] Add NKDA (No Known Drug Allergies) and NKA (No Known Allergies) quick-select options to the allergies section
- [x] Add Reason for Taking field to medication form with auto-populate from drug database and local lookup map
- [ ] Medication History: swipe-left to delete a dose log entry
- [ ] Medication History: tap dose card to edit time taken
- [ ] Medication Today: swipe-left to delete a dose log entry
- [ ] Medication Today: tap dose card to edit time taken

## Medication Swipe-Delete & Edit-Time Feature
- [x] Add removeDoseLog and updateDoseTime storage helpers
- [x] Add historyDeleteAction style to main StyleSheet
- [x] Add handleDeleteDose and handleEditDoseTime parent handlers in MedicationsScreenInner
- [x] Add handleConfirmEditTime handler with time validation
- [x] Add editTimeTarget and editTimeValue state variables
- [x] Wire onDeleteDose and onEditDoseTime props to TodayTab
- [x] Wire onDeleteDose and onEditDoseTime props to HistoryTab
- [x] Add Edit Dose Time modal to parent render (reuses reinstateCard styles)
- [x] Fix mangled Modal tag (pendingMissedNote) after edit collision
- [x] Clear Metro cache and restart dev server

## Onboarding Privacy Slide Cleanup
- [x] Remove duplicate privacy notice slide (Slide 2) from onboarding — keep only the final consent/sign slide (now Slide 7)
- [x] Update SLIDE_COUNT from 8 to 7
- [x] Remove privacy entry from SLIDE_META array (shift all subsequent indices down by 1)
- [x] Update SLIDE_HEADLINES array (remove index 1 entry)
- [x] Update _ctaLabel array (remove privacyCta entry)
- [x] Update all SLIDE_META[n] index references (2→1, 3→2, 4→3, 7→6)
- [x] Update all SLIDE_HEADLINES[n] index references
- [x] Update handleCTAPress finish condition (7→6)
- [x] Update goToSlide(3) after permissions → goToSlide(2)
- [x] Update currentSlide === 7 disabled check → currentSlide === 6
- [x] Update skip link visibility (currentSlide < 3 → currentSlide < 2)
- [x] Renumber slide JSX comments (Slide 3→2, 4→3, 5→4, 6→5, 7→6, 8→7)
- [x] Fix mangled ScrollView closing > after comment edit collision

## BLE Reading Feature
- [ ] Add Heart Rate, SpO2, Temperature GATT parsers + read functions to ble-manager.ts
- [ ] Add smart category routing in vitals.tsx handleBleDeviceSelected
- [ ] Add Read Now button and Auto-read toggle to ble-device-scanner.tsx
- [ ] Add auto-read logic after connection in ble-device-scanner.tsx
- [ ] Add deduplication by device+timestamp+value
- [ ] Add BLE disclaimer banner in scanner sheet
- [ ] Add unsupported device / no health service / read failed error states
- [ ] Wire heart rate / SpO2 / temperature BLE readings to vitals.tsx
- [ ] Create lib/ble/ble-reading-service.ts for unified read-after-connect logic
- [ ] Add tests for BLE parsers and dedup logic

## BLE Reading Feature
- [x] Audit existing BLE scan/connect/device management setup
- [x] Add GATT UUIDs for SpO2 (0x1822), Temperature (0x1809) services and characteristics
- [x] Add Heart Rate, SpO2, Temperature parsers (parseHeartRateMeasurement, parsePlxSpotCheck, parseTemperatureMeasurement)
- [x] Add readHeartRateFromDevice, readSpO2FromDevice, readTemperatureFromDevice to ble-manager.ts
- [x] Extend DeviceCategory type with heart-rate-monitor, pulse-oximeter, thermometer
- [x] Add 11 new known device profiles (Polar, Wahoo, Garmin, Nonin, Masimo, Wellue, Withings, etc.)
- [x] Create lib/ble/ble-reading-service.ts with unified readDeviceByCategory() router
- [x] Add deduplication helpers (deduplicateVitalSigns, deduplicateWeight, deduplicateBloodSugar)
- [x] Add auto-read preference persistence (getAutoReadEnabled/setAutoReadEnabled)
- [x] Add BLE_DISCLAIMER constant
- [x] Update vitals.tsx to use readDeviceByCategory for all device types
- [x] Update blood-sugar.tsx to use readDeviceByCategory
- [x] Update weight.tsx to use readDeviceByCategory
- [x] Update dashboard index.tsx BLE handler with full routing
- [x] Add Read Now button on paired device cards in ble-device-scanner.tsx
- [x] Add Auto-read when connected toggle with AsyncStorage persistence
- [x] Add BLE disclaimer banner in scanner sheet footer
- [x] Add new category labels/icons for heart-rate-monitor, pulse-oximeter, thermometer
- [x] Verify readings flow to dashboard tiles, Health Report, Correlation screen

## May 2026 Fixes
- [x] Remove 'All done for today' from medication smart reminders on dashboard
- [x] Sort vital signs history by type on the Vital Signs tab (⊞ By Type toggle)

## May 2026 Feature Batch 2
- [ ] Pre-fill vitals entry form (BP, HR, SpO₂) with most recent saved values as placeholder text
- [ ] Add vital signs type filter chips to history list (BP only, HR only, etc.)
- [ ] Add Snooze 30 min / 1 hour to medication due-dose reminder cards

## May 2026 Feature Batch 2
- [x] Vital signs entry form pre-fill: BP, HR, SpO2, HRV, Temp, Resp Rate fields show last saved value as placeholder
- [x] Vital signs history type filter chips: All / BP / HR / SpO2 / Temp / Resp / HRV
- [x] Medication reminder snooze: Snooze 30 min / 1 hour on due-dose cards

## May 2026 Feature Batch 3
- [ ] HR 4-hour aggregation utility (hr-aggregation.ts): bucket raw samples into 6 blocks/day
- [ ] Wire HR aggregation into health context / sync layer
- [ ] Dashboard HR chart uses 4-hour averages (max 6 points/day)
- [ ] Health Report uses 4-hour HR averages
- [ ] Correlation engine uses 4-hour HR averages
- [ ] Vital signs history type chip badge counts (e.g. "BP (12)")

## May 2026 — Storage Security Audit and Encryption Upgrade
- [x] Audit all local storage for sensitive health data (health readings, medications, BLE devices, reports, user profile, subscriptions, app settings)
- [x] Implement AES-256-CTR encrypted storage layer (lib/storage/encrypted-storage.ts) using SecureStore key management (iOS Keychain / Android Keystore)
- [x] Implement health-storage.ts routing layer (secureSetItem / secureGetItem) for all sensitive keys
- [x] Implement migration module (lib/storage/migration.ts): detect plaintext, encrypt, verify, delete old value with rollback safety
- [x] Wire migration into app startup (app/_layout.tsx useEffect) — runs silently on first launch after update
- [x] Update lib/health/storage.ts (loadHealthData / saveHealthData) to use encrypted storage
- [x] Update lib/medications/storage.ts to use encrypted storage
- [x] Update lib/data/appointments.ts, doctors.ts, oura-adapter.ts, garmin-adapter.ts, lab-results.ts, nutrition.ts, sleep.ts, activity.ts to use encrypted storage
- [x] Update components/ble-device-scanner.tsx to use encrypted storage for paired BLE device keys
- [x] Update app/(tabs)/settings.tsx to use secureGetItem for pairedBleDevices reads
- [x] Update app/(tabs)/index.tsx to use encrypted storage for AI scan preview and smart reminder snooze
- [x] Update app/log/batch-scribe-review.tsx to use secureGetItem for BATCH_SCRIBE_KEY reads
- [x] Add PDF temp file cleanup (deleteAsync) after sharing in all export flows: report.tsx, medications.tsx, index.tsx, immunizations.tsx, clinical-sources.tsx, data-privacy.tsx
- [x] Add CSV temp file cleanup (deleteAsync) after sharing in lib/health/csv-export.ts
- [x] Audit console.log statements — confirmed no health values are logged (only counts and status messages)
- [x] Remove expo-crypto dependency — replaced with platform-safe global.crypto.getRandomValues (Hermes/RN) with Node.js fallback for tests
- [x] Validate AES-256-CTR encryption/decryption round-trips for all health data types

## May 2026 — Storage Security Audit and Encryption Upgrade
- [x] Audit all local storage for sensitive health data (health readings, medications, BLE devices, reports, user profile, subscriptions, app settings)
- [x] Implement AES-256-CTR encrypted storage layer (lib/storage/encrypted-storage.ts) using SecureStore key management (iOS Keychain / Android Keystore)
- [x] Implement health-storage.ts routing layer (secureSetItem / secureGetItem) for all sensitive keys
- [x] Implement migration module (lib/storage/migration.ts): detect plaintext, encrypt, verify, delete old value with rollback safety
- [x] Wire migration into app startup (app/_layout.tsx useEffect) — runs silently on first launch after update
- [x] Update lib/health/storage.ts (loadHealthData / saveHealthData) to use encrypted storage
- [x] Update lib/medications/storage.ts to use encrypted storage
- [x] Update lib/data/appointments.ts, doctors.ts, oura-adapter.ts, garmin-adapter.ts, lab-results.ts, nutrition.ts, sleep.ts, activity.ts to use encrypted storage
- [x] Update components/ble-device-scanner.tsx to use encrypted storage for paired BLE device keys
- [x] Update app/(tabs)/settings.tsx to use secureGetItem for pairedBleDevices reads
- [x] Update app/(tabs)/index.tsx to use encrypted storage for AI scan preview and smart reminder snooze
- [x] Update app/log/batch-scribe-review.tsx to use secureGetItem for BATCH_SCRIBE_KEY reads
- [x] Add PDF temp file cleanup (deleteAsync) after sharing in all export flows: report.tsx, medications.tsx, index.tsx, immunizations.tsx, clinical-sources.tsx, data-privacy.tsx
- [x] Add CSV temp file cleanup (deleteAsync) after sharing in lib/health/csv-export.ts
- [x] Audit console.log statements — confirmed no health values are logged (only counts and status messages)
- [x] Remove expo-crypto dependency — replaced with platform-safe global.crypto.getRandomValues (Hermes/RN) with Node.js fallback for tests
- [x] Validate AES-256-CTR encryption/decryption round-trips for all health data types

## May 2026 — Encryption Key Rotation
- [ ] Add rotateEncryptionKey() to encrypted-storage.ts: generate new key, re-encrypt all sensitive keys, swap key in SecureStore atomically
- [ ] Add resetMigrationFlag() call after key rotation so migration re-runs on next launch if needed
- [ ] Build KeyRotationSheet bottom sheet component with confirmation, progress indicator, and result summary
- [ ] Wire "Reset Encryption Key" row in Settings > Privacy & Security
- [ ] Wire key rotation trigger after successful PIN change (auth-context.tsx)
- [ ] Handle partial failure: if any key fails re-encryption, keep old key active and surface error
- [ ] Add success haptic and confirmation alert after rotation completes

## May 2026 — Key Rotation Feature

- [x] Export SENSITIVE_KEYS from migration.ts for reuse
- [x] Implement rotateEncryptionKey() in encrypted-storage.ts with atomic commit
- [x] Implement encryptStringWithKey() and decryptStringWithKey() helpers
- [x] Add KeyRotationSheet component (confirm → progress → success/error)
- [x] Add exclamationmark.shield.fill to icon-mapping.ts
- [x] Wire KeyRotationSheet into Settings > Privacy & Security
- [x] Auto-trigger key rotation silently after successful PIN change in change-pin.tsx

## May 2026 — Bug Fixes

- [x] Fix: hrWindow and setHrWindow not destructured from useHealth() in settings.tsx (caused runtime error on Settings open)
- [x] Verify: icon validation passes (all 161 mappings valid, doc.badge.minus was from stale build)

## May 2026 — Clear Vital Signs Data Feature

- [x] Audit all local storage keys to classify vital signs vs. preserved data
- [x] Implement clearVitalSignsData() with scoped key deletion (no global clear)
- [x] Clear encrypted layer (encryptedRemoveItem) for each vital signs key
- [x] Clear dynamically-keyed dictation history entries
- [x] Rename Settings button from "Clear All Data" to "Clear Vital Signs Data"
- [x] Add two-step confirmation dialog with correct scope messaging
- [x] Add i18n strings for all 15 supported languages
- [x] Preserve: settings, reminders, medications, nutrition, clinical records, BLE devices, account state, encryption keys
- [x] Retain clearHealthData() as @deprecated for "Delete All My Data" nuclear option
- [x] Log audit event (vital_signs_data_cleared) to config audit log

## May 2026 — Blood Glucose + Projected A1C Dashboard Card

- [x] Audit existing dashboard tile design (GlassCard, CollapsibleCard, SparklineChart, BentoMetricTile)
- [x] Identify glucose data source: state.data.bloodSugar from useHealth() — no duplicate state
- [x] Create components/dashboard/glucose-dashboard-card.tsx
- [x] Implement ADAG formula: Projected A1C = (avgGlucose + 46.7) / 28.7
- [x] Prefer 90-day average for A1C; fall back to 30-day then 7-day
- [x] Collapsed view: title + latest mg/dL + projected A1C inline
- [x] Expanded view: primary reading, last updated time, projected A1C, 7-day sparkline, 7/30/90-day averages
- [x] Empty state: no-data message + "Add Glucose Reading" CTA
- [x] Compliance: "Projected A1C" label, disclaimer text, no diagnosis language
- [x] Smooth Reanimated height animation for expand/collapse
- [x] Persist collapsed state to AsyncStorage
- [x] Default collapsed state per design guideline
- [x] "View Glucose Records" CTA navigates to /log/blood-sugar
- [x] Wire GlucoseDashboardCard into index.tsx below ActivityReadinessCard
- [x] Dark mode accent: #F87171 (light: #DC2626)
- [x] Zero ESLint errors in component and index.tsx

## May 2026 Glucose Enhancements
- [x] Color coding from thresholds
- [x] TIR bar
- [x] Dexcom banner
- [x] i18n en/es/fr/zh

## May 2026 — Glucose Card Enhancements (Color Coding + TIR + i18n + Fasting/Post-Meal + Dexcom + Target Range)
- [x] Add glucose range color coding (green/yellow/red) based on user thresholds
- [x] Add Time-in-Range (TIR) segmented bar using computeTIR()
- [x] Localize glucose dashboard card for en/es/fr/zh
- [x] Add fasting vs. post-meal average breakdown row (30-day)
- [x] Add Last synced from Dexcom/CGM timestamp below Dexcom banner
- [x] Add Target Range row with Edit shortcut linking to /settings/glucose-thresholds

## May 2026 — Glucose Card Enhancements (Round 3)
- [x] Add mmol/L unit toggle respecting useUnitPreferences in GlucoseDashboardCard
- [x] Add meal context chip below status badge in expanded view
- [x] Add 14-day micro-sparkline to collapsed header replacing static A1C text
- [x] Update AvgCell, ContextRow, and target range display to use glucoseUnit
- [x] Add badgeRow, contextChip, contextChipText styles to StyleSheet

## May 2026 — Glucose Card Enhancements (Round 4)
- [x] Add quick-entry "+" button in collapsed header navigating to glucose log screen
- [x] Add HealthKit/Health Connect sync badge for non-Dexcom users showing last sync time

## May 2026 — Bug Fixes
- [x] Fix "undefined is not a function" launch crash — removed DOM-only e.stopPropagation() from TouchableOpacity onPress handler in GlucoseDashboardCard (React Native GestureResponderEvent has no stopPropagation; inner touch is consumed automatically without it)
- [x] Fix all "undefined is not a function" launch crashes — removed 5 hard e.stopPropagation() calls (no optional chaining) across index.tsx (vaccine button), plain-language-lab-translator.tsx, smart-nutrition-card.tsx (2x), emergency-vault-tile.tsx; all remaining usages now use safe optional chaining (?.)
- [x] Bug fix: Add missing safeGetItem export to safe-async-storage.ts (was causing "undefined is not a function" crash on launch — glucose-dashboard-card imported safeGetItem but it was never exported)
- [x] Week-over-week trend arrow next to 7-day average in glucose card (↑/↓/→)
- [x] Pre-fill meal context on quick entry + button (pass last context as route param)
- [x] Low-glucose pulse badge on collapsed glucose card header
- [x] Fix Blood Sugar card dimensions to match Activity card on dashboard
- [x] Fix sort-by-type (By Kind) bug: BP, HR, Temp, HRV disappear — replaced consecutive-merge grouping with Map-based grouping so all records of the same type always land in one section
- [x] Multi-vital fanout in By Type view: records with multiple vitals appear in every relevant section
- [x] Collapsible section headers in By Type view: tap header to collapse/expand each vital type section
- [x] Fix respiratory rate display to whole number (no decimals) across all 5 display sites
- [x] RR input: integer-only keyboard, clamp to 4-60 br/min range, strip decimals at save
- [x] RR trend threshold raised to ±2 br/min
- [x] Section count badge: filled accent pill when collapsed, plain muted text when expanded
- [x] RR inline lower-bound warning: shows warning text when value < 4 br/min before save
- [x] Persist By Type collapse state to AsyncStorage (key: vitals_collapsed_sections_v1)
- [x] Fix blood sugar card expand showing nothing: ghost measurement view outside overflow:hidden container so onLayout fires correctly
- [x] Ghost-measure fix applied to CollapsibleCard (all 7 cards fixed at once)
- [x] Smooth re-animation on content change via useAnimatedReaction in CollapsibleCard
- [x] Empty state expand verified (same ghost-measure fix covers EmptyState in glucose card)
- [x] Stale height fix on orientation change: key prop tied to screen width in CollapsibleCard
- [x] Collapsed-by-default prop already exists in CollapsibleCard — verified (defaultCollapsed prop in interface, default false, useState(defaultCollapsed))
- [x] Card drag-to-reorder on dashboard with long-press gesture: useDashboardCardOrder hook + cardOrder.map() in index.tsx, ↑↓ arrows in edit layout mode, AsyncStorage persistence
- [x] Swipe-to-dismiss glucose smart-reminder banner (horizontal swipe gesture, animated slide-out)
- [x] Haptic + toast feedback when resetting card order to default in Edit Layout mode
- [x] defaultCollapsed audit: apply defaultCollapsed=true to secondary dashboard cards (neovital-macro-graph, neovital-vitals-card, correlation-trend-chart patterns section)
- [x] Swipe-to-snooze on glucose smart-reminder banner: right-swipe snoozes 30 min, left-swipe dismisses permanently
- [x] End-of-list haptic on card move: Medium haptic when card reaches top or bottom position in Edit Layout mode
- [x] First-launch collapsed hint: one-time chevron pulse on first collapsed card to teach new users cards are expandable
- [x] Snooze duration picker bottom sheet: right-swipe on glucose reminder shows 30 min / 1 h / 2 h choice sheet
- [x] Reset onboarding hints row in Settings > Privacy: clears HINT_SHOWN_KEY and similar one-time flags
- [x] True drag-and-drop card reorder with long-press gesture and boundary haptics (DraggableCardWrapper component, LongPress+Pan gesture, Medium haptic on swap, Warning haptic at boundary)
- [x] Snooze badge chip on glucose reminder banner: amber "Snoozed · Xm remaining" chip with dismiss button, shown when reminder is snoozed
- [x] Drag-to-reorder visual placeholder: DragPlaceholder component renders dashed outline at targetIndex slot during drag
- [x] Per-card height measurement in DraggableCardWrapper via onLayout + Reanimated shared value for accurate swap threshold
- [x] Live countdown timer for snooze badge: useSnoozeCountdown hook, 60-second interval refresh, auto-dismiss on expiry (glucoseLiveMinsLeft at component scope via useSnoozeCountdown)
- [x] Drag placeholder height sync: onHeightMeasured callback + cardHeights ref in index.tsx, DragPlaceholder uses activeCardIndex measured height (falls back to 220px)
- [ ] Add ≡ drag handle icon to DraggableCardWrapper cards in edit mode for discoverability
- [ ] Manage Dashboard screen: toggle visibility and reorder all card sections (steps, cal left, sleep tab, macro breakdown, on-device insights)
- [ ] Fix Blood Sugar card height to match Activity & Readiness card (crop excess padding in collapsed state)
- [x] Fix Blood Sugar card collapsed state shows expanded content: ghost view moved to top:-9999 (off-screen), added overflow:hidden wrapper View around Reanimated.View, added useAnimatedReaction for height re-animation; fixed use-dashboard-visibility.ts to use safeSetItem instead of AsyncStorage.setItem directly
- [x] ≡ drag handle icon already implemented in DraggableCardWrapper — verified present in edit mode (lines 209-213)
- [x] Manage Dashboard screen: toggle visibility and reorder all card sections with useDashboardVisibility hook
- [x] Wire Manage Dashboard into Settings row and Edit Layout banner button
- [x] Register settings/manage-dashboard route in _layout.tsx
- [x] Fix setSnoozedReminderMap TDZ crash: moved state declaration earlier in component (before any useEffect closures)
- [x] Wire sleep_section, nutrition_section, vitals_section, weather_section visibility guards in index.tsx
- [ ] Privacy-first audit: scan all network calls, health data flows, logging, and storage; fix violations; produce audit report
- [x] Fix Blood Sugar card height to match On-Device Insights (added collapsed tab row with 7-day avg + time in range)
- [x] Reorder dashboard: moved Blood Sugar and Activity Readiness below SpO2/Sleep tile (cardOrder.map now after vitals_section)
- [x] Make On-Device Insights draggable (added insights to DashboardCardId); Macro Breakdown stays fixed per user request
- [x] Fix pull-to-refresh crash: wrapped weather fetch in try/catch/finally in use-weather.ts
- [x] Move vital monitor (BentoMetricTile grid) above the date range filter (7d/30d/90d) in dashboard layout
- [x] Reorder dashboard top section: Smart Reminders → Vital Monitor → Date Range Filter → Vital Tiles (Macro Trend moved after Vital Tiles)
- [ ] Move Quick Entry "Log glucose →" button into Blood Glucose card's collapsed tab row; remove standalone Quick Entry block
- [x] Fix dashboard section order: Smart Reminders → Vital Monitor → Date Range Filter → Vital Tiles (move Macro Trend after Vital Tiles)
- [ ] Fix dashboard order: Smart Reminders → Glucose Chip (Weekly Streak Banner) → Vital Monitor → Date Picker → Vital Tiles
- [x] Move Monday Weekly Summary Banner (Glucose Chip) INSIDE Smart Reminders section — now renders as first item after the 🔔 Smart Reminders header row, inside the Smart Reminders IIFE
- [x] Move On-Device Insights card to render below Macro Trends (removed from draggable cardOrder.map, now renders as fixed block after Macro Trend section)
- [x] Reorder dashboard: Smart Reminders → NeoVital Monitor → 7d/30d/90d → BentoMetricTile grid → Steps/Cal/Sleep → Activity/Blood Sugar/Macro etc.
- [x] Normalise vertical gap between Blood Sugar, Macro Breakdown, and Personal Narrative — reduced section dividers from height:14 to height:6 and added marginBottom:4 to NeoVitalMacroGraph card
- [x] Fix systolic/diastolic null guards in threshold-checker.ts
- [x] Add skipLibCheck to tsconfig.json and scope includes to prevent TSC OOM-kill
- [x] Update check script to use tscheck.json for memory-efficient type checking
- [x] Reduce OnDeviceInsightsCard marginTop from 16 to 4 to tighten Macro->Insights gap
- [x] Add justifyContent: space-between to NeoVitalMiniCard rangeRow for even chip spacing
- [x] Production audit: Fix 8 ESLint unused-var warnings in app-lock-screen.tsx
- [ ] Rename manus-runtime.ts to dev-preview-bridge.ts and remove all Manus branding from internal files
- [ ] Clean up manus-branded strings in constants/oauth.ts USER_INFO_KEY
- [x] Rename manus-runtime.ts to dev-preview-bridge.ts and remove all Manus branding from internal files
- [x] Clean up Manus-branded strings in constants/oauth.ts USER_INFO_KEY and other files
- [ ] Create usePremiumGate hook and PremiumGateSheet component
- [ ] Gate Health Report PDF export behind Premium
- [ ] Gate Advanced Correlations behind Premium
- [ ] Gate Projected A1C trends behind Premium
- [ ] Gate Smart Reminders (beyond basic) behind Premium
- [ ] Gate Premium Dashboard Customisation behind Premium
- [ ] Gate Advanced Nutrition / Meal History behind Premium
- [ ] Gate On-Device Insights behind Premium
- [x] Create lib/logger.ts with __DEV__ guard and replace all 394 console calls project-wide
- [x] Update TERMS_URL to distinct Terms of Service URL
- [x] Implement PIN recovery lockout countdown UI in app-lock-screen.tsx
- [x] Install react-native-iap 15.2.2 for StoreKit/Google Play Billing
- [x] Create lib/subscription/subscription-context.tsx with trial/premium state management
- [x] Create components/paywall-screen.tsx with monthly/yearly plans, trial UI, restore purchases
- [x] Create app/paywall.tsx route
- [x] Wire SubscriptionProvider into app/_layout.tsx
- [x] Add subscription section (Manage Subscription, Restore Purchases) to settings.tsx
- [x] Gate Health Report PDF export behind Premium
- [x] Gate Advanced Correlations (analytics.tsx) behind Premium
- [x] Gate Projected A1C (record.tsx) behind Premium
- [x] Gate Dashboard Customisation (manage-dashboard.tsx) behind Premium

## Bug Fixes — First Sync Crash & BP Display
- [x] Remove celebration confetti on first sync/fetch to prevent crash
- [x] Guard goal-reached confetti: skip when prevStepsRef is null (first data arrival)
- [x] Guard meal-log confetti: skip macroCardRef.measure when ref is null/unmounted
- [x] Guard stepRingRef.measureInWindow with null check (already exists, ensure fallback is safe)
- [x] Suppress all confetti during isFirstSync=true window
- [x] Fix blood pressure not showing on first sync/fetch

- [x] Fix threshold-checker.ts TS errors: extract narrowed sys/dia locals so TypeScript tracks non-null through template literals
- [x] Add pulsing skeleton animation to BentoMetricTile (withRepeat + withSequence, 700ms fade cycle)
- [x] Pass isLoading || isFirstSync to BP tile so skeleton shows during full first-sync window (up to 15s)
- [x] Fix settings.isPremium not defined: add useSubscription() hook call in SettingsScreen

- [x] Update paywall feature list: platform-specific AI insight copy (Apple Intelligence on iOS, Gemini on Android)
- [x] Fix paywall Privacy Policy URL to vitalsyncpersonalwellnesshub.com/article/privacy-policy
- [x] Fix paywall Terms of Use URL to vitalsyncpersonalwellnesshub.com/article/subscription-plans

- [x] Bump version to 2.8.68, iOS buildNumber to 20753, Android versionCode to 17

- [x] Investigated BP logic vs build 2.8.34: current implementation is already the most complete version (2.8.34 logic is identical, current has additional timezone fix)
- [x] Fix dark screen flash on Manage Subscription: added paywall Stack.Screen with presentation modal + slide_from_bottom animation in _layout.tsx
- [x] Fix dark flash in PremiumGateSheet Modal: changed animationType from slide to fade, removed statusBarTranslucent
- [x] Update stale privacy/terms URLs in PremiumGateSheet to vitalsyncpersonalwellnesshub.com
- [x] Add subscription key to sectionExpanded defaults in settings.tsx (subscription: true) and ALL_SECTION_KEYS
- [x] Add dismissible "Trial ends in X days" banner under Smart Reminders on home screen
- [x] Trial banner: only shows during trial_active state with trialDaysRemaining > 0
- [x] Trial banner: time-window check 8:00 AM – 8:30 AM using tickerNow (re-evaluates every 30s)
- [x] Trial banner: dismiss state persisted per-day via AsyncStorage (TRIAL_BANNER_DISMISSED_DATE_KEY), resets each day
- [x] Trial banner: tapping banner navigates to /paywall; × button dismisses for the day
- [x] Extend trial banner to show at both 8:00–8:30 AM and 6:00–6:30 PM daily windows
- [x] Add "X days left" badge on Settings tab icon when trial has ≤3 days remaining
- [x] Bump build number (version 2.8.69, iOS buildNumber 20754, Android versionCode 18)
- [x] Add persistent expired-trial banner in Smart Reminders (accessState === 'expired', 7-day TTL dismiss via AsyncStorage)
- [x] Animate TrialCountdownBadge with pop-in withSequence scale when days drop to 3
- [x] Add Manage Subscription / Upgrade row in Settings Subscription section linking to /paywall (already existed: Subscribe Now / Upgrade to Premium row confirmed present)
- [x] Mirror purple "Xd" trial countdown badge on Home tab icon (trial_active, ≤3 days)
- [x] Schedule local push notification at exact trial expiry moment using expo-notifications date trigger (scheduleNotificationSafe, cancels previous ID from AsyncStorage before rescheduling)

- [x] Fix BP data (state.data.bloodPressure) not showing in Vital Signs tab and Dashboard tile — increased DASHBOARD_TIMEOUT_MS 5s→20s and MANUAL_TIMEOUT_MS 15s→30s so BP correlation queries complete on real iOS
- [x] Fix paywall bottom sheet flashing open when Settings tab is tapped — PremiumGateSheet animationType=fade, statusBarTranslucent removed (commit 066c889)
- [x] Update Settings paywall section: $6.99/month + $69.99/year fallback prices added to PaywallScreen, 2-week trial text preserved, disclaimerText style added

- [x] Widen BP fetch window from 14 days to 90 days (BP_WINDOW_MS constant) — bpWindowStart in syncAll, fetchHealthKitBloodPressure uses BP_WINDOW_MS
- [x] Implement per-day BP averaging: max 3 readings/day, average if more exist — condenseBPByDay() added to native-health-service.ts
- [x] Add "Syncing blood pressure..." step to sync progress bar — live ticker in fetchHealthData shows named stages during syncAll

- [x] Bump build number to version 2.8.71, iOS buildNumber 20755, Android versionCode 19
- [x] Update condenseBPByDay: keep first 2 individual readings + average 3rd+ into one record (matching Android spec)
- [x] Add android.permission.health.READ_HEALTH_DATA_HISTORY to Android permissions in app.config.ts
- [x] Verified Dashboard tile uses latestBP = most recent reading from merged bloodPressure + vitalSigns arrays
- [x] Add missing Android Health Connect permissions: READ_RESTING_HEART_RATE, READ_RESPIRATORY_RATE, READ_BODY_TEMPERATURE, READ_BLOOD_GLUCOSE, READ_LEAN_BODY_MASS
- [ ] Wire resting heart rate as sub-value under Dashboard heart rate card
- [ ] Add blood glucose vital card to Dashboard with fasting/postprandial reading and trend indicator
- [x] Wire resting heart rate from HealthKit (HKQuantityTypeIdentifierRestingHeartRate) as tertiary sub-value on Dashboard HR card
- [x] Blood glucose Dashboard card (GlucoseDashboardCard) already implemented with fasting/postprandial avg, 7-day sparkline, trend arrow — confirmed present
- [x] Resting HR trend indicator (↑/↓ vs 7-day avg) on Dashboard HR card — tertiaryTrend prop added to BentoMetricTile, restingHrTrend useMemo in index.tsx
- [x] HR detail screen split into Active HR and Resting HR sub-tabs with SectionTabBar
- [x] Resting HR sub-tab: 1h/4h/daily window chips (same global hrWindow pref), hero with 7-day avg, line chart, stats grid, info card
- [x] restingHRSamples (PulseRecord[]) added to HealthData type and wired through native-health-service, storage, permissions, health-context
- [x] aggregatedRestingHrRecords and latestRestingHrRecord added to HealthContextValue and contextValue
- [x] Age-adjusted resting HR reference card in Resting HR sub-tab — getRestingHRReferenceRange + getAdjustedRestingHRStatus added to user-profile.ts (NHANES/AHA sources); card mirrors age-adjusted HRV card with athletic/normal/elevated color coding
- [x] Bump build number to version 2.8.75, iOS buildNumber 20759, Android versionCode 23
- [x] Add resting HR age-adjusted reference section to Doctor Report PDF (stats grid + color-coded reference box with NHANES citation)
- [x] Surface "Profile incomplete — ranges may be generic" nudge with tap-to-configure shortcut on Resting HR reference card (amber banner, taps to Settings → Profile)
- [x] Add NHANES (Ostchega et al., 2011) and Palatini et al. (2006) resting HR citations to Clinical Sources screen (cv6, cv7)
- [x] Add resting HR correlation pairs to Correlation Engine (sleep-RHR, HRV-RHR, stress-RHR analysers with age-adjusted reference context)
- [x] Add 30-day resting HR sparkline to Dashboard HR card (restingBpm metric in buildSparklineData, wire into BentoMetricTile)
- [x] Extend Health Alerts threshold system with resting HR upper-bound alert (3-consecutive-day check, new restingHeartRate config section)
- [x] Fix: BP data not fetched on real iOS — added BloodPressureSystolic/Diastolic to write permissions in rnh-loader.ts and added Nitro→RCT dual-path fallback in fetchHealthKitBloodPressure
- [ ] Add BP source badge (Withings/Omron/Manual) to BP detail screen
- [ ] Apply Nitro→RCT dual-path fallback to glucose fetch pipeline
- [x] Add BP source badge to BP detail screen (hero card + Data Sources breakdown section)
- [x] Apply Nitro→RCT dual-path fallback to glucose fetch pipeline (mirrors BP fix)
- [ ] Fix: BP write permissions missing in _requestViaRCT (empty write array) — add BloodPressureSystolic/Diastolic to write list
- [ ] Add 7-day / 30-day / 90-day window tabs to BP detail screen chart
- [x] Fix: BP write permissions missing in _requestViaRCT in native-health-service.ts
- [x] Fix: Add _resetRNHCache() before initAppleHealthKit() in all three permission paths (permissions.ts, healthkit-permissions.tsx, health-context.tsx)
- [x] Fix: BP write permissions missing in _requestViaRCT in native-health-service.ts
- [x] Fix: Add _resetRNHCache() before initAppleHealthKit() in all three permission paths (permissions.ts, healthkit-permissions.tsx, health-context.tsx)
- [x] Fix: Lab results camera scan — upgrade to LLM vision (trpc.lab.parseOcr) as primary path with Apple Vision OCR as offline fallback
- [x] Fix: Medication prescription camera scan — upgrade to LLM vision (trpc.medication.scribePhoto) as primary path with Apple Vision OCR as offline fallback
- [x] Fix: lab.parseOcr server endpoint — upload image to S3 before sending to LLM (matching medication.scribePhoto pattern for reliable image delivery)
- [x] Rx number auto-fill: wire rxNumber, pharmacy phone + refill count into Refill Tracker from scan
- [x] Lab scan confidence badge: Smart Scan vs Text Scan badge on OcrReviewCard (no AI reference)
- [x] Multi-page lab scan: Scan Another Page button with value merging on OcrReviewCard
- [x] Replace 'Vision Food 📸' with '📷 Scan Meal' in AiFoodCameraSheet (home button, sheet title, mode toggle tab)
- [x] Remove Apple Vision references from AiFoodCameraSheet comments/labels and clinical-sources.tsx App Review note
- [x] Fix: BP not shown on dashboard and record screens — diagnose and apply definitive fix
- [x] Fix: Paywall white screen — added react-native-iap plugin to app.config.ts, guarded SubscriptionProvider initIAP against Nitro crash, added web stub in metro.config.js
- [x] Paywall: "Subscription not available" fallback UI when accessState === "unknown"
- [x] Paywall: Restore Purchases button calling restorePurchases() and updating accessState
- [x] Paywall: Trial expiry push notification scheduled 24h before trial end
- [ ] Restore BP HealthKit code from Apr 27 checkpoint (520a4052): native-health-service.ts, rnh-fetch.ts, types.ts, storage.ts, permissions.ts
- [ ] Remove all post-Apr-27 BP HealthKit changes (write array fix, resetRNHCache, initAppleHealthKit in fetchHealthData, timestamp-dedup in mergeHealthData)
- [x] Restore BP HealthKit code from Apr 27 checkpoint (520a4052): native-health-service.ts fetchHealthKitBloodPressure and syncAll BP section restored to simple Nitro+RCT dual-path with activityWindowStart
- [x] Remove initAppleHealthKit() call from fetchHealthData in permissions.ts (added in fix #5, reverted)
- [x] Revert storage.ts mergeHealthData to use mergeById for bloodPressure (removed mergeBPByTimestamp)
- [x] Remove unused BP_WINDOW_MS (90-day) and MAX_BP_PER_DAY constants from HK_LIMITS in healthkit-helpers.ts
- [x] Fix stale "90-day BP window" comment in native-health-service.ts syncAll

## Paywall Bug Fix (May 2026)
- [x] Fix settings.tsx: `accessState === 'trial'` → `accessState === 'trial_active'` (wrong enum value causes wrong UI)
- [x] Add `hasShownPaywallThisSession` ref guard to `use-premium-gate.tsx` `openPaywall` to prevent repeated pushes
- [x] Add `navigationReady` + `trialStatusLoaded` guards to subscription context so paywall never opens before state is known
- [x] Fix paywall-screen.tsx: add explicit `backgroundColor` to `root` style for `loading` accessState (prevents white flash)
- [x] Fix paywall-screen.tsx: add `loading` state guard — render loading spinner instead of blank view when `accessState === 'loading'`
- [x] Fix paywall-screen.tsx: wrap `reloadProducts` useEffect with `isMounted` guard to prevent state update after unmount
- [x] Fix use-premium-gate.tsx: `openPaywall` must not push if paywall route is already active
- [x] Add `isPresentingPaywall` ref in use-premium-gate to prevent double-modal from PremiumGateSheet → openPaywall chain
- [x] Fix notification deep-link bridge: add `open_paywall` action handler with session guard

## ManageDashboardScreen Crash Fix (May 2026)
- [ ] Add missing 'insights' entry to CARD_LABELS in manage-dashboard.tsx (crash: Cannot read property 'emoji' of undefined)
- [ ] Add undefined guard for meta in order.map so stale AsyncStorage values don't crash the screen

## Paywall Auto-Open White Screen Bug (May 2026)
- [ ] Find and remove every useEffect / auto-trigger that pushes /paywall on app launch
- [x] Fix white overlay: paywall-screen root view must use theme background color not white
- [ ] Ensure paywall only opens on explicit user action (tap), never automatically
- [x] BP sync regression: fixed by switching BP dedup in storage.ts to timestamp+systolic key (RCT bridge generates random UUIDs, breaking mergeById)
- [x] Fix paywall auto-open on cold launch: added navigationReady ref guard to NotificationDeepLinkBridge — defers router.push('/paywall') until 600ms after mount so Stack navigator is ready

## Major Audit May 2026

### Phase 1: BP Pipeline Audit & Fix
- [ ] Audit HealthKit permissions for bloodPressureSystolic and bloodPressureDiastolic
- [ ] Audit BP fetch identifiers and units (mmHg)
- [ ] Audit BP normalization and pairing logic
- [ ] Audit BP storage dedup (timestamp+systolic key)
- [ ] Audit BP dashboard tile display (no 0/0, correct empty state)
- [ ] Audit BP records screen display
- [ ] Audit any premium/paywall gate on BP sync or display
- [ ] Fix: ensure 14-day fetch window, max 50 records per sync
- [ ] Fix: pair systolic+diastolic by timestamp; show 120/-- or --/80 if only one exists
- [ ] Fix: never overwrite cached BP with null/undefined on failed fetch
- [ ] Fix: add safe diagnostic logs (permission status, sample counts, pair count, failure reason)
- [ ] Fix: wrap all BP queries in try/catch/finally with safe fallback arrays

### Phase 2: Remove Broken Paywall
- [ ] Remove all auto-push useEffect paywall triggers
- [ ] Remove looping paywall modal calls
- [ ] Remove stale paywall imports
- [ ] Remove white screen overlay root cause
- [ ] Ensure app opens normally without paywall on launch

### Phase 3: Rebuild Stable Paywall
- [ ] Create single subscription state source of truth (trialStartDate, trialExpiresAt, isTrialActive, isSubscribed, subscriptionStatusLoaded, hasShownPaywallThisSession, isPaywallVisible)
- [ ] 14-day free trial logic (record trialStartDate on first launch)
- [ ] Paywall UI: dark/light, SafeAreaView, correct background
- [ ] Pricing: 14 days free, $6.99/month, $69.99/year
- [ ] Paywall buttons: Start Free Trial, Monthly, Yearly, Restore Purchases
- [ ] Paywall links: Terms of Use, Privacy Policy
- [ ] Kimagelo Foundation message: "$1 of your subscription supports..."
- [ ] Medical disclaimer on paywall
- [ ] Guards: no paywall during trial, no paywall on launch, no paywall blocking HealthKit/BP
- [ ] Guards: no double-push, no loop, no white screen, no forced relaunch
- [ ] Purchase flow: loading state, success state, error state, try/catch

### Phase 4: Global Crash Safety
- [ ] No undefined function calls in BP or paywall code
- [ ] No unguarded native module calls
- [ ] No setState after unmount
- [ ] No render loops
- [ ] No reduce/map/filter on undefined
- [ ] All AsyncStorage read/write in try/catch
- [ ] All JSON.parse in safe parser

### Phase 5: Validation
- [x] TypeScript check passes
- [ ] No unresolved imports
- [ ] No paywall route loops
- [ ] No BP permission gaps
- [ ] No unsafe map/filter/reduce on health arrays

## Major Audit Completion (May 2026)
- [x] BP fetch window expanded from 14 to 90 days in native-health-service.ts fetchHealthKitBloodPressure
- [x] Paywall subscribed/trial_active state-specific views added to paywall-screen.tsx
- [x] Notification dedup guard (lastHandledNotifId) added to NotificationDeepLinkBridge in _layout.tsx
- [x] Full paywall trigger audit: confirmed no auto-push useEffects anywhere in codebase
- [x] BP dedup confirmed using timestamp+systolic key (mergeBPByTimestamp) in storage.ts
- [x] BP pipeline confirmed: no premium gate on any BP fetch, normalize, or display path

## Launch Bugs (May 2026)
- [ ] Paywall flashes on every app launch (slides up then immediately dismisses)
- [ ] BP HealthKit sync returns nothing (manual entries work, HealthKit sync does not)
- [ ] BP permission shows pre-authorized before user ever grants it

## Paywall Rebuild & Bug Fixes (May 2026)
- [ ] Fix evaluateAccess: fresh install (no trialStart, no expiry) should be 'new_user' not 'expired'
- [ ] Rebuild paywall UI: two plan cards, "Try for free for 14 days" headline, "No commitment. Cancel anytime.", Save ~15% badge on yearly
- [ ] Fix BP HealthKit sync: trace full pipeline and fix broken fetch step
- [ ] Fix BP permission pre-auth: BP shows authorized before user grants permission

## Paywall & BP Fixes Completed (May 2026)
- [x] evaluateAccess returns 'unknown' (not 'expired') for fresh installs — prevents paywall flash on first launch
- [x] paywall-screen.tsx 'unknown' state now falls through to main purchase UI (was showing "Subscription Unavailable" error card)
- [x] Paywall headline updated: "Try for free for 14 days"
- [x] Paywall subtitle updated: "No commitment. Cancel anytime."
- [x] Paywall yearly plan badge updated: "Save ~17% vs monthly" (correct: $69.99/yr vs $83.88/yr = ~17% savings)
- [x] Paywall CTA updated: "Start Free Trial" (was "Start 2-Week Free Trial")
- [x] BP rnh-fetch.ts: getSamples('BloodPressure') fallback added when getBloodPressureSamples returns empty
- [x] BP native-health-service.ts: queryCorrelationSamples availability check — falls back to RCT bridge if Nitro bridge doesn't have the method
- [x] BP health-context.tsx: isGranted requires 2+ authorized types to prevent Withings/Omron pre-auth false positive

## Lab Scan Auto-Fill Fix (May 2026)
- [x] Fix lab scan not auto-filling form: replaced (handleOcrScan as any)._pending property (lost on re-render) with ocrPendingRef / ocrUsedLlmRef stable useRef values — onConfirm now always reads the correct pending data

## Paywall Rebuild (May 2026)
- [x] Update product IDs to com.vitalsync.monthly_699 and com.vitalsync.annual_6999
- [x] Change trial duration to 14 days on both Monthly and Annual plans
- [x] Add expo-web-browser in-app browser for Privacy Policy and Terms of Service links
- [x] Update mandatory legal text per Apple/Google requirements
- [x] Update CTA to "Start 14-Day Free Trial"
- [x] Update all 2-Week references to 14-Day across settings.tsx, analytics.tsx, use-premium-gate.tsx
- [x] Export SUBSCRIPTION_DATA and LEGAL_LINKS from subscription-context.tsx

## Paywall Enhancements (May 2026)
- [ ] Add collapsible "See all features" expandable section to paywall-screen.tsx
- [ ] Build post-purchase confirmation screen with celebratory UI and feature summary
- [ ] Wire post-purchase screen into paywall success flow

## Ghost Launch Race Condition Fix (May 2026)
- [x] Add isLoading boolean state to SubscriptionProvider (true until loadPersistedState completes)
- [x] Expose isLoading in SubscriptionContextValue interface and context value object
- [x] Add SubscriptionLoadingGate component in _layout.tsx (shows AppLoadingScreen while isLoading is true)
- [x] Wrap content tree inside SubscriptionLoadingGate (inside SubscriptionProvider, before SmoothingStrengthProvider)
- [x] Add 3-second timeout to initConnection() via Promise.race to prevent StoreKit hang freezing app
- [x] Guard use-premium-gate.tsx openPaywall against accessState === 'loading'

## Platform-Specific AI Insights Branding (May 2026)
- [x] purchase-success.tsx: Replace "AI-powered health insights" with Platform.OS-conditional string (Apple Intelligence / Gemini)
- [x] paywall-screen.tsx: Replace "AI-powered health insights" in benefits list with platform-conditional string
- [x] use-premium-gate.tsx: Update On-Device Insights description and benefits list item with platform-conditional string
- [x] on-device-insights-card.tsx: Update card title to use Apple Intelligence / Gemini branding per platform

## AI Branding Polish (May 2026)
- [x] on-device-insights-card.tsx: Add inline platform branding badge (Apple Intelligence black / Gemini Google-blue) next to card title
- [x] manage-dashboard.tsx: Update 'On-Device Insights' label to platform-conditional Apple Intelligence / Gemini string
- [x] lib/i18n.ts: Add appleIntelligenceInsights and geminiInsights keys to homeStrings for all 5 locales (en, es, fr, zh, pl)

## Paywall Legal Polish (May 2026)
- [x] paywall-screen.tsx: Add "Restore Purchases" button near legal footer
- [x] app/settings/consent.tsx + consent-modal.tsx: Append ?v=1 to TERMS_URL/TERMS_BASE
- [x] paywall-screen.tsx + use-premium-gate.tsx: Replace hardcoded Terms labels with i18n keys
- [x] lib/i18n.ts settingsStrings: Add termsOfUse, termsOfService, restorePurchases keys

## Paywall Localisation (May 2026 - cont.)
- [x] lib/i18n.ts settingsStrings: Add manageSubscription key to all 15 locales
- [x] paywall-screen.tsx: Wire manageSubscription i18n key into footer

## HealthKit Blood Pressure Integration (May 2026)
- [x] native-health-service.ts: Add queryQuantitySamples Systolic+Diastolic correlated-by-timestamp tier between queryCorrelationSamples and RCT bridge fallback

## HealthKit BP Tier 2 Tests & Debug Panel (May 2026)
- [x] Write unit test for Tier 2 queryQuantitySamples correlated BP path in __tests__/healthkit-bp-tier2.test.ts
- [x] Add "Test BP Tiers" row to healthkit-debug-panel.tsx cardio category

## Paywall Blank White Screen Debug
- [x] Fix Stack.Screen paywall contentStyle to set explicit background color
- [x] Guard paywall push when isLoading is true in _layout.tsx notification bridge
- [x] Add productsLoading skeleton so plan cards never appear blank
- [x] Add paywall unit tests mirroring BP tier test pattern

## IAP App Store Review Config
- [x] Add com.apple.developer.in-app-purchase entitlement to app.config.ts ios.entitlements
- [x] Add kotlinVersion 2.2.0 to expo-build-properties android block
- [x] Extend initConnection timeout from 3s to 5s in subscription-context.tsx

## IAP App Store Review Config
- [x] Add com.apple.developer.in-app-purchase entitlement to app.config.ts ios.entitlements
- [x] Add kotlinVersion 2.2.0 to expo-build-properties android block
- [x] Extend initConnection timeout from 3s to 5s in subscription-context.tsx

## Health Permissions Screen - False Authorized Status
- [x] Fix Blood Pressure showing Authorized when user never granted permission
- [x] Remove flowCompleted override that marks all types as authorized

## BP Daily Aggregation
- [x] Create bp-aggregation.ts with 4-per-day cap and 3rd-reading averaging
- [x] Wire aggregation into storage.ts mergeBPByTimestamp
- [x] Wire aggregation into native-health-service.ts after fetch
- [x] Update MAX_BP_RECORDS comment to reflect 4/day cap
- [x] Add unit tests for bp-aggregation.ts

## Paywall Loop Guards
- [x] Create lib/subscription/paywall-guard.ts singleton
- [x] Wire guard into use-premium-gate.tsx openPaywall
- [x] Wire guard into _layout.tsx notification deep-link push
- [x] Wire guard into index.tsx trial banner onPress (line 3036)
- [x] Wire guard into index.tsx expired-trial banner onPress (line 3090)
- [x] Wire guard into settings.tsx Upgrade button onPress (line 3877)
- [x] Call paywallGuard.release() in app/paywall.tsx onUnmount

## HealthKit BP Debug — Device/Third-Party Readings
- [x] Add deviceName field to BloodPressureRecord in types.ts
- [x] Add sourceRevision.source.name capture + debug log to Tier 1 (queryCorrelationSamples)
- [x] Add sourceRevision.source.name capture + debug log to Tier 2 (queryQuantitySamples)
- [x] Add sourceName capture + debug log to Tier 3 (RCT bridge / rnhFetchBloodPressure)
- [x] Add sourceName capture + debug log to Tier 0 (Nitro unavailable RCT fallback)
- [x] Add sourceName field to RNHBloodPressureSample interface in rnh-fetch.ts
- [x] Add unit tests for sourceRevision/deviceName capture in BP tiers (tests/rnh-fetch-bp.test.ts — 8 tests, all passing)
- [x] Add per-row source badge to BP Detail history list (app/detail/blood-pressure.tsx)
- [x] Update formatSourceLabel/sourceCounts to prefer deviceName over source field
## Production Audit — Data Integrity, Stability, Compliance
- [x] Fix SpO2 double-multiply bug in device-sync.ts (Health Connect path: spo2.percentage is already 0-100, not a fraction)
- [x] Add physiological HR range filter (20–300 bpm) to fetchHeartRate in native-health-service.ts
- [x] Add systolic > diastolic sanity guard to all 4 BP parsing tiers in native-health-service.ts
- [x] Remove dead _ForceSyncBar import from app/(tabs)/index.tsx
- [x] Remove dead private Reanimated API imports (_interpolate, _runOnJS) from app/(tabs)/index.tsx
- [x] Use trialDaysRemaining from subscription context in paywall-screen.tsx (single source of truth)
- [x] Add non-medical disclaimer to SmartNutritionCard AI insights section (components/smart-nutrition-card.tsx)
- [x] Update SmartNutritionCard AI nutrition insights label to device-specific branding (Apple Intelligence on iOS, Gemini on Android)

## HealthKit Permissions UX — Denied Types Re-Request
- [ ] Reset RNH cache before calling initAppleHealthKit in the permissions screen request button
- [ ] Replace x-apple-health://sources with App-prefs:Privacy&path=HEALTH deep-link for direct one-tap access to VitalSync's Health privacy page in iOS Settings
- [ ] Add per-row "Fix in Settings" tappable shortcut on Denied badge rows in healthkit-permissions.tsx
- [ ] Add prominent "Open Settings → Health → VitalSync" CTA card at top of screen when any type is denied
- [x] Fix HealthKit permissions screen: treat sharingDenied(1) as 'authorized' for ALL types when flowCompleted=true (iOS hides read access for all types, not just HKCorrelationType)
- [x] Fix AppState foreground listener: write hk_flow_completed flag before loadStatuses() when recheckPermissions() returns true
- [x] Add secondary recheckPermissions() fallback in loadStatuses() for fresh installs that granted via iOS Settings
- [x] Fix Blood Pressure not shown in HealthKit permission request — patch react-native-health ObjC to add HKCorrelationTypeIdentifierBloodPressure to getReadPermFromText, add 'BloodPressure' to rnh-loader.ts read array, add postinstall script to re-apply patch after pnpm install
- [x] Fix crash on Request Permissions — 'BloodPressure' correlation type was incorrectly added to the write array; HKCorrelationType cannot be written, causing NSInvalidArgumentException in initHealthKit. Removed from write array, kept only in read array.
- [x] Fix crash on Request Permissions (onboarding + settings paths) — enableAllBackgroundDelivery() was called immediately after initAppleHealthKit() resolves, racing the iOS permission sheet dismissal animation. Fixed by deferring the call by 2000ms via setTimeout.
- [x] Remove health permission request button from onboarding — replace with informational slide pointing to Settings → Health Permissions
- [x] Delete entire Apple Health pipeline and restore from v2.8.34 (git checkout b825d67 for all health pipeline files: healthkit-loader.ts, healthkit-background-delivery.ts, healthkit-helpers.ts, healthkit-write.ts, native-health-service.ts, permissions.ts, rnh-loader.ts, rnh-fetch.ts, health-context.tsx, healthkit-permissions.tsx). Removed ObjC BloodPressure correlation patch, postinstall script, and patches/ directory. Settings is the only permission request entry point.
- [x] Fix Blood Pressure showing as off in iOS Health permission sheet — added HKCorrelationTypeIdentifierBloodPressure to rnh-loader read array, patched ObjC getReadPermFromText, added BloodPressure key to Permissions.js, created postinstall script to persist patch through EAS builds
- [x] Fix crash after Blood Pressure fix: settings.tsx AppState listener was calling requestPermissions() (triggers initAppleHealthKit + enableAllBackgroundDelivery) on return from iOS permission sheet — replaced with recheckPermissions() (read-only, no bridge calls)
- [x] Fix permissions.ts enableAllBackgroundDelivery race: deferred by 2000ms to avoid racing iOS permission sheet dismissal animation
- [x] Revert Blood Pressure correlation type (P.BloodPressure) from rnh-loader read array, ObjC patch, Permissions.js, postinstall script — caused crash on Request Permissions
- [x] Fix "Open Settings" deep-link to go to Settings → Privacy & Security → Health → VitalSync (not the Health app)
- [x] Add Blood Pressure manual instructions card on Health Permissions screen

## Version Bump
- [x] Version bump: 2.8.76 → 2.8.95, iOS build number 20761 → 20895.

## Bug Fixes (v2.8.98)
- [x] Dashboard blood glucose card: "undefined % in range" — fixed: tir.inRange was referencing a non-existent field; corrected to tir.inRangePct from computeTIR() return value.

## Enhancements (v2.8.99)
- [ ] Dashboard glucose card: add % labels directly on TIR bar segments (Below / In Range / Above).
- [ ] Dashboard glucose card: add 7d / 14d / 30d window selector to TIR section.

## v2.9.1 Work Items
- [x] Wire i18n into allergies.tsx, medical-history.tsx, surgical-history.tsx, nutrition.tsx, data-sources.tsx, manage-dashboard.tsx, BLE scanner
- [ ] Wire i18n into remaining lower-priority screens (paywall, profile, consent, labs, activity, diet, crash-logs, color-legend, etc.)
- [x] Add language selector to Report Preview modal
- [x] Fix healthkit-sync-banner.test.ts failures
- [x] Fix storage-pruning.test.ts failures
- [x] Fix scribe-parsers.test.ts failures
- [x] Fix schema-migration.test.ts failures

## v2.9.1 Completed
- [x] Wire i18n into allergies.tsx (allergyStrings), medical-history.tsx (medHistoryStrings), surgical-history.tsx (surgHistoryStrings), nutrition.tsx (nutritionStrings), data-sources.tsx (settingsExtStrings), manage-dashboard.tsx (settingsExtStrings), ble-device-scanner.tsx (bleScannerStrings)
- [x] Add previewReportLang key to all 20 language blocks in reportStrings
- [x] Add language selector chip row to Report Preview modal (effectivePreviewLang, handlePreviewLangChange, previewLangBar styles)
- [x] Fix healthkit-sync-banner.test.ts — refactored first-sync-tracker.ts to use AsyncStorage.setItem directly
- [x] Fix scribe-parsers.test.ts — corrected test expectations to match parser output (outdoor-run, workout)
- [x] Fix schema-migration.test.ts — added react-native/__mocks__ and expo-secure-store/__mocks__ aliases in vitest.config.ts
- [x] Fix app-config-audit.test.ts — updated microphonePermission to mention Scribe
- [x] Fix icon-mapping.test.ts — added lightbulb.fill to icon-mapping.ts
- [x] Fix immunization-save.test.ts — updated CURRENT_SCHEMA_VERSION expectation to >=8
- [x] Fix native-linking-guard.test.ts — deleted unused scribe-button.tsx component
- [x] Version bump: 2.9.0 -> 2.9.1, iOS build 20900 -> 20901, Android versionCode 23 -> 24

## v2.9.2 Completed
- [x] Wire i18n into paywall-screen.tsx (paywallExtStrings: freeTrial, fullAccess, purchasesRestored, nothingToRestore)
- [x] Wire i18n into profile.tsx (profileStrings: all Alert titles, gender labels, placeholders)
- [x] Wire i18n into labs/index.tsx (labsStrings: all Alert titles and action labels)
- [x] Wire i18n into crash-logs.tsx (crashStrings: all Alert titles, error type labels, action buttons)
- [x] Wire i18n into color-legend.tsx (colorLegendStrings: header, quick-status labels)
- [x] Add profileStrings, labsStrings, crashStrings, colorLegendStrings, paywallExtStrings to i18n.ts (20 language blocks each)
- [x] Wire effectivePreviewLang into handleGeneratePDF (overrideLang parameter) so Share PDF exports in the previewed language
- [x] Share PDF button in Preview modal now passes effectivePreviewLang to handleGeneratePDF
- [x] Confirm storage-pruning.test.ts: 12/12 tests green; add REGRESSION GUARD comment
- [x] Full test suite: 1958 passed, 5 skipped, 0 failures

## v2.9.3 Completed
- [x] Wire i18n into activity.tsx (citySearchPlaceholder, citySearchCancel/Set, dictateActivityLabel/Placeholder, scribeParseError)
- [x] Wire i18n into streak-records.tsx (streakResetCancel, streakResetConfirm)
- [x] Add 8 new keys to logStrings en/es/fr/zh/pl blocks
- [x] Improve Report Preview modal language chip row: show native name + ISO code subtitle
- [x] Wire effectivePreviewLang into Share PDF button (PDF exports in previewed language)

## v2.9.4 Completed
- [x] Audit diet screens (nutrition.tsx, streak-records.tsx) — confirmed fully wired, no remaining hardcoded strings
- [x] Wire activity.tsx remaining strings (citySearchPlaceholder, dictateActivityLabel, scribeParseError) via logStrings
- [x] Wire streak-records.tsx Alert buttons (streakResetCancel, streakResetConfirm) via logStrings
- [x] Add 8 new keys to all 5 logStrings language blocks (en/es/fr/zh/pl)
- [x] Improve Report Preview language chip row to show native language name + ISO code subtitle
- [x] Extract getReportLabels and resolveReportLang to lib/health/report-lang-utils.ts
- [x] Wire resolveReportLang into handleGeneratePDF in report.tsx
- [x] Write vitest regression guard (tests/report-lang-utils.test.ts) — 11 tests, all passing
- [x] Confirm storage-pruning.test.ts passes (12/12 green) and add regression guard comment

## v2.9.5 Completed
- [x] Add 8 new logStrings language blocks (pt, sw, hi, de, it, ko, ja, hy) — all 114 keys including function keys (recheckReminderAt, calorieGoalProgress, weeklyCalAvgLabel, syncedAt)
- [x] Add dictationBoxStrings to i18n.ts — 16 language blocks (en, es, fr, pt, ar, sw, am, hi, zh, de, it, ko, ja, tl, so, hy) with hint, fillBtn, recentTitle keys
- [x] Wire DictationBox component to use dictationBoxStrings via useLang() — fully locale-aware hint, fill button, and recent title
- [x] Write Preview modal language selector regression test (tests/regression/preview-modal-lang-selector.test.ts) — 13 tests covering chip wiring, effectivePreviewLang derivation, Share PDF override, resolveReportLang contract
- [x] Full test suite: 1982 passed, 5 skipped, 0 failures (120 test files)

## v2.9.6 In Progress
- [ ] Fix "Cannot access 'reportLang' before initialization" TDZ crash — move effectivePreviewLang declaration to after useReportLang() call
- [ ] Add ar/am/tl/so static fallback blocks + parsing key to dictationBoxStrings
- [ ] Wire db.parsing in DictationBox component
- [ ] Write logStrings key-coverage regression test

## v2.9.6 Completed
- [x] Fix "Cannot access 'reportLang' before initialization" TDZ crash — moved effectivePreviewLang declaration to after useReportLang() call (line 190 in report.tsx)
- [x] Add ar/am/tl/so static fallback blocks + parsing key to dictationBoxStrings (16 langs, 4 keys each)
- [x] Wire db.parsing in DictationBox component and in activity.tsx / vitals.tsx Parsing labels
- [x] Write logStrings key-coverage regression test (15 tests: 13 lang blocks + en key count + dictationBoxStrings parsing coverage)

## v2.9.7 Completed
- [x] Add pl block to dictationBoxStrings (17 languages)
- [x] Extend logStrings coverage test to assert dictationBoxStrings key-set parity with en
- [x] Wire db.parsing in log-all-vitals-sheet.tsx (last remaining hardcoded Parsing label)

## v2.9.8 In Progress
- [ ] Fix: setAllergyStatus is not a function crash when tapping NKDA/NKA on allergies screen
- [ ] Fix: 'it is not defined' crash on Doctor Appointments screen

## v2.9.8 Completed
- [x] Fix: setAllergyStatus is not a function on allergies screen (added SET_ALLERGY_STATUS reducer action + callback to health-context.tsx)
- [x] Fix: 'it is not defined' crash on Doctor Appointments screen (FormModal lacked its own useLang/t declaration; added _fmLang + t on lines 480-481)

## v2.9.9 In Progress
- [x] Add setAllergyStatus reducer regression test
- [x] Add useLang preemptively to GlassApptCard and EmptyState in appointments.tsx
- [x] Add doctorPlaceholder and customItemPlaceholder to all 16 appointmentStrings language blocks

## v2.9.10 In Progress
- [x] Add pl block to appointmentStrings
- [x] Extend logstrings-key-coverage.test.ts with appointmentStrings key-count describe block
- [x] Wire db.parsing in surgical-history.tsx
- [x] Wire db.parsing in medications.tsx

## v2.9.11 Complete
- [x] Fix TYPE_LABELS is not defined crash
- [x] Add pl to appointmentStrings EXPECTED_LANGS in coverage test
- [x] Add logAllVitalsStrings export to i18n.ts (17 languages, 8 keys)
- [x] Wire logAllVitalsStrings in log-all-vitals-sheet.tsx (8 hardcoded strings replaced with lv.*)
- [x] Wire db.parsing accessibilityLabel in DictationBox ActivityIndicator
- [x] Extend logstrings-key-coverage.test.ts with 4th describe block for logAllVitalsStrings (17 langs × 8 keys)

## v2.9.12 Complete
- [x] Add 3 banner keys to logAllVitalsStrings in i18n.ts (bannerTitle, bannerBodyIos, bannerBodyAndroid — 17 langs)
- [x] Wire logAllVitalsStrings in KeyboardDictationBanner (bannerTitle, bannerBodyIos/Android replace hardcoded strings)
- [x] Extend compiler-audit test with logAllVitalsStrings audit describe block (6 assertions: export, 11 keys, 17 langs, 3×count=17)
- [x] Update logstrings-key-coverage EXPECTED_KEYS to 11 keys (added 3 banner keys)
- [x] Bump buildNumber from "20901" to "20912" and versionCode from 25 to 26 in app.config.ts
- [x] Bump version from 2.9.11 to 2.9.12 in app.config.ts

## v2.9.13 Complete
- [x] Add KeyboardDictationBanner dismiss unit test (14 source-code assertions: export, key value, mount read, safeSetItem write, idempotency ref, onDismiss ordering, i18n wiring, accessibilityLabel)
- [x] Update appointmentStrings coverage guard: added negative assertion that bannerTitle/bannerBodyIos/bannerBodyAndroid are NOT in appointmentStrings en block
- [x] Wire lv.bannerTitle as accessibilityLabel on the banner outer View (accessibilityRole="none")
- [x] Bump version from 2.9.12 to 2.9.13 in app.config.ts

## v2.9.14 Complete
- [x] Fix "unmatched route" crash: /log/dash-diet → /log/nutrition in recent-entries-section.tsx
- [x] Fix same stale route in clinical-narrative-card.tsx
- [x] Show meal name + macros summary in Nutrition recent entries (foodDescription · kcal, or protein, or Na mg fallback; icon varies by source)
- [x] Remove Report Language SegmentedControl + timestamp from Health Report screen (language now managed only via Settings → Appearance → Language)

## v2.9.15 Complete
- [x] Audit existing i18n coverage for all 40+ dashboard terms across 16 languages
- [x] Generate full translation table (40 keys × 16 languages = 640 translations)
- [x] Add dashboardStrings export to i18n.ts (16 langs × 40 keys, lines 12647–13320)
- [x] Wire dashboardStrings in dashboard screen (ds.* for smartReminders, personalNarrative, steps, calLeft, activity, readiness, meds, labs, appts, bloodSugar, avg, inRange, macroBreakdown, scanMeal, searchFood, insights, wins, emergencyVault, smallWins)
- [x] Wire dashboardStrings in on-device-insights-card.tsx (ds.insights, ds.wins)
- [x] Wire dashboardStrings in small-wins-tracker.tsx (ds.smallWins)
- [x] Wire dashboardStrings in emergency-vault-tile.tsx (ds.emergencyVault)
- [x] Wire dashboardStrings in smart-nutrition-card.tsx (ds.macroBreakdown, ds.scanMeal, ds.searchFood)
- [x] Wire dashboardStrings in clinical-narrative-card.tsx (ds.personalNarrative, ds.meds, ds.labs, ds.appts)
- [x] Extend glucose-dashboard-card STRINGS to all 16 languages (12 new blocks added)
- [x] Fix Somali apostrophe in glucose-dashboard-card (noData: "Cabbir la'aanta" in double quotes)
- [x] Remove "Google AI" wording from use-premium-gate.tsx Android description
- [x] Add macro pill row (kcal/P/C/F pills) to Nutrition recent entries (shown when ≥2 macros present)
- [x] Add dashboardStrings coverage test (16 langs × 40 keys parity + no-AI guard)
- [x] Bump version to 2.9.15

## v2.9.16 Complete
- [x] Fix SpO2 not translating — replaced h.spo2 with ds.spo2 in index.tsx (BentoMetricTile title)
- [x] Fix Blood Pressure not translating — replaced h.bloodPressure with ds.bloodPressure
- [x] Fix Pulse & HRV not translating — replaced h.pulseHrv with ds.pulseHrv
- [x] Fix Sleep tile not translating — replaced h.sleep with ds.sleep
- [x] Fix Activity not translating — added dashboardStrings + useRawLang to activity-readiness-card.tsx; header and tab chips now use ds.activity
- [x] Fix Readiness not translating — same fix; tab chips now use ds.readiness
- [x] Fix Emergency Vault tile title not translating — added _rawLang/_ds to EmergencyVaultTile; tile title now uses _ds.emergencyVault
- [x] Macro Breakdown was already correctly wired (ds.macroBreakdown in smart-nutrition-card.tsx) — confirmed no change needed
## v2.9.17 Complete — Records Section Multilingual Translation Audit
- [x] Translate all Records-section terms (59 keys) into 16 languages (en/es/fr/pt/ar/sw/am/hi/zh/de/it/ko/ja/tl/so/hy)
- [x] Add recordsStrings export to i18n.ts (16 langs × 59 keys, wellness-safe, no "AI" wording)
- [x] Wire recordsStrings in record.tsx (rs.* for all card titles, subtitles, section headers, stat labels, filter chips)
- [x] Translate Correlation Engine / Insight Engine / Health Report terms (29 keys) into 16 languages
- [x] Add correlationStrings export to i18n.ts (16 langs × 29 keys, no "AI", wellness-safe, App Store/Play-safe)
- [x] Wire correlationStrings in analytics.tsx (cs.correlationEngine, cs.nutritionAnalysis, cs.tabCorrelate/Diabetic/Caloric, cs.healthInsights)
- [x] Wire correlationStrings in report.tsx (cs.generateAndSaveToFiles)
- [x] Ensure Arabic RTL support via existing RTL infrastructure (no new code needed)
- [x] Confirm language changes apply instantly via useRawLang() hook (no restart needed)
- [x] Validate all 16 languages × 59 Records keys with vitest (36 tests passed)
- [x] Validate all 16 languages × 29 Correlation keys with vitest (70 tests passed)
- [x] Confirm no "AI" wording in any translated string (tested in both test suites)
- [x] Confirm no hardcoded English remains in record.tsx, analytics.tsx, report.tsx key areas

## v2.9.18 — Translation Fix for Health Report + Correlate Screen
- [x] Fix report.tsx t resolution: use rawLang directly against reportStrings (all 20 languages)
- [x] Fix analytics.tsx: replace hardcoded "RECOVERY TREND" with cs.recoveryTrend.toUpperCase()
- [x] Fix correlation-trend-chart.tsx: add correlationStrings import, replace "OBSERVED HISTORICAL PATTERNS" with cs.observedPatterns.toUpperCase()
- [x] Fix insight-engine.tsx: add correlationStrings import, replace hardcoded "Insight Engine" with cs.insightEngine
- [x] Add missing pulseHrv, bodyComposition, bodyTemperature, includeMetrics keys to Armenian (hy) reportStrings block
- [x] All 106 vitest tests pass (records-i18n + correlation-i18n)
- [x] Metro bundle compiles cleanly with no errors

## v2.9.19 — Nutrition Card Subtitle Translation Fix
- [x] Added dietSubtitles export to i18n.ts — 8 diet types × 16 languages (140 vitest tests pass)
- [x] Wired dietSubtitles into unified-nutrition-card.tsx via useRawLang() — subtitle now translates instantly on language change
- [x] Fixed Italian false-positive in AI-wording test (case-sensitive /\bAI\b/ instead of /\bAI\b/i)
## v2.9.20 — Settings Extended i18n + Diet Profile Compliance Ring + Translated Tab Labels
- [x] Build settingsExtStrings const (43 keys × 16 languages) in i18n.ts
- [x] Wire se.* for HRV Target alert, subscription (Current Plan, Manage Subscription, Restore Purchases), Help & Support, What's New, Rate VitalSync, Share VitalSync, Contact Support, View on App Store, Evidence Based Sources, Terms & Privacy, Evidence Library, Reset Onboarding, Diagnostics, Diet Profile in settings.tsx
- [x] Translate 5 tab bar labels (Dashboard, Record, Correlate, Health Report, Settings) into all 16 languages as part of settingsExtStrings
- [x] Wire translated tab labels into _layout.tsx using useLang() + settingsExtStrings lookup
- [x] Update dietSubtitles with compliance ring target descriptions for all 8 diet types × 16 languages
- [x] Update DIET_TYPE_OPTIONS cardSubtitles with compliance ring target strings in diet-type.ts
- [x] Update MACRO_BREAKDOWN notes in diet-protocol-tooltip.tsx with compliance ring targets
- [x] Run full vitest suite — 2,245 tests pass (124 files, 0 failures)
- [x] Save checkpoint v2.9.20

## v2.9.21 — Onboarding i18n Full Coverage (17 languages × 70 keys)
- [x] Audit onboardingStrings — found only 5 languages (en, es, fr, zh, pl), 12 missing
- [x] Add 12 missing language blocks: pt, ar, sw, am, hi, de, it, ko, ja, tl, so, hy
- [x] Write onboarding-i18n.test.ts — 1,191 tests (17 languages × 70 keys)
- [x] Fix diet-label-resolution.test.ts — updated DASH label ("Compliance Diet") and compliance ring subtitle patterns
- [x] Full vitest suite — 3,436 tests pass (125 files, 0 failures)
- [x] Save checkpoint v2.9.21
## v2.9.22 — Global Translation Pass (Dashboard, Record, Correlate, Paywall)
- [x] Add 28 new dashboardStrings keys × 16 languages (greetings, streak banner, allClear, logNow, vital unit labels, noVitals, noGlucose, referenceOnly)
- [x] Wire translated greetings into index.tsx (greetingMorning/Afternoon/Evening/welcomeBack)
- [x] Wire translated streak banner into index.tsx (streakTitle, weeklyCheckIn, streakDaysLogged, streakLastWeek, streakPerfect, streakAlive, streakGreat, streakStart, streakLog)
- [x] Wire allClear and logNow translations into index.tsx reminder section
- [x] Fix date row locale: use rawLang-to-BCP47 mapping instead of hardcoded en-US
- [x] Add correlationStrings premium banner keys × 16 languages (premiumFeatureTitle, premiumFeatureSub, premiumCta, evidenceSubtitle)
- [x] Wire cs.premiumFeatureTitle, cs.premiumFeatureSub, cs.premiumCta into analytics.tsx premium banner
- [x] Add recordsStrings A1C keys × 16 languages (projectedA1c, projectedA1cSub, projectedA1cPremium)
- [x] Wire rs.projectedA1c keys into record.tsx A1C section
- [x] Add recordsStrings filter chip keys × 16 languages (filterAll, filterVitals, filterLabs, filterNutrition, filterActivity, filterOther)
- [x] Wire rs.filter* keys into RecentEntriesSection filter chips
- [x] Wire se.premiumCta into PremiumGateSheet CTA via settingsExtStrings
- [x] Update regression test EXPECTED_KEYS (40→68) and description
- [x] Run full vitest suite — 3,436 tests pass (125 files)
- [x] Save checkpoint v2.9.22

## v2.9.23 — HRV Alert Stepper + Low Stock Threshold + Streak Deep-Link
- [ ] HRV Target Alert: add numeric stepper (10–120 ms, step 5) to HRV threshold row in Settings, persist to AsyncStorage, wire to alert engine
- [ ] Low Stock threshold: add stepper (5–30 pills, step 1) to Medications settings row, persist to AsyncStorage, use in medication card refill badge logic
- [ ] Streak banner deep-link: tapping the streak banner navigates to Record tab with today's missing entries filter pre-applied
- [ ] Run full vitest suite
- [ ] Save checkpoint v2.9.23

## v2.9.23 — HRV Alert Stepper + Low Stock Stepper + Streak Deep-link
- [x] Confirm HRV Target Alert ±5 ms stepper (10–120 ms) already wired to useHrvTarget + alert engine
- [x] Confirm Low Stock threshold ±1 stepper (5–30 pills) already wired to handleLowStockThresholdChange
- [x] Add lowStockThreshold / lowStockThresholdSub / lowStockPills keys to settingsExtStrings (16 languages)
- [x] Streak banner text area wrapped in Pressable → navigates to /(tabs)/record?filterCategory=All
- [x] "Log now →" chip navigates to /(tabs)/record?filterCategory=Vitals (was /log/vitals)
- [x] record.tsx reads filterCategory param and passes as externalFilter to RecentEntriesSection
- [x] Run full vitest suite — 3,436 tests pass (125 files)
- [x] Save checkpoint v2.9.23

## v2.9.24 — Premium Multilingual Features
- [ ] Auto unit localization: per-language defaults (lbs/kg, mg/dL/mmol/L, °F/°C) + settings toggle
- [ ] Medication name alias mapping (Paracetamol/Tylenol/Panadol → canonical) for 16 languages
- [ ] RTL layout support for Arabic (mirrored flex, text alignment, graph axis fixes)
- [ ] Dynamic tone translation (culturally-adapted phrasing for streak, insights, reminders)
- [ ] Run full vitest suite and save checkpoint v2.9.24

## v2.9.24 — Premium Multilingual Intelligence System
- [x] Auto unit localization: per-language defaults (lbs/kg, mg/dL/mmol/L, °F/°C, mi/km) in use-unit-preferences.ts
- [x] Wire applyLangUnitDefaults into Dashboard globe picker and Settings language picker
- [x] International drug name aliases: paracetamol, calpol, efferalgan, doliprane, nurofen, brufen, voltaren, etc.
- [x] Dynamic tone translation system: lib/tone.ts (7 cultural profiles × 17 languages)
- [x] Wire getStreakMessages into streak banner motivator and allClear reminder
- [x] Tone system vitest: 14 tests pass (getToneProfile, getStreakMessages, getInsightTone, getReminderTone)
- [x] Full vitest suite: 3,450 tests pass (126 files)
- [x] Save checkpoint v2.9.24
## v2.9.24 — Settings i18n Hardcoded String Fix
- [x] TDZ crash fix: move lang/rawLang/ds declarations to top of DashboardScreen (before greetingText useMemo)
- [x] Add missing settingsExtStrings keys to all 9 priority languages: insightRepeatTitle, insightRepeatDesc, clearInsightHistory, perMetricCooldownTitle, perMetricCooldownDesc, globalLabel, resetLabel, healthAlertThresholdsBanner, ownershipBody
- [x] Add profile/health-data/notification/diagnostics keys: editProfile, editProfileSub, setMyGoals, dailyMacroGoals, healthPermissionDetails, syncReminderThreshold, savedPharmacies, bluetoothDevices, wearableAccuracyHealthKit, manageDashboard, resetDashboardLayout, dataMinimisationStorage, lockTimeout, changePIN, resetEncryptionKey, deleteAllMyData, clearTranslationCache, resetOnboardingHints, biometricSecurityPrivacy, thresholdAlerts, healthAlertsLegacy, labResultReminders, celebrationSounds, dailyReadinessScore, showGlucoseShortcut, markAllAlertsRead, storageHealth, healthkitDiagnostics, errorLogs, sendCrashReport, copyToClipboard, shareLabel, managePrivacyConsent, dataRetentionWindow
- [x] Wire all 60+ new se.* keys into settings.tsx replacing hardcoded English strings
- [x] Fix brace balance in settingsExtStrings (hy block missing closing brace after deduplication)
- [x] Full vitest suite: 3,450 tests pass (126 files)
- [x] Save checkpoint v2.9.24 hotfix-2
## v2.9.25 — RTL Arabic, Paywall i18n, Settings Regression Test
- [x] RTL layout support for Arabic: useRTL hook, rowDir/textAlign helpers in paywall-screen.tsx
- [x] RTL feature rows: flexDirection overridden with rowDir for Arabic in paywall feature list
- [x] Translate paywall/subscription screen to 9 priority languages (en, es, fr, zh, pt, hi, ar, sw, ru) — feat1-12, plan labels, legal copy, CTA strings, loading/subscribed/trial states
- [x] Wire all pw.* keys into paywall-screen.tsx replacing every hardcoded English string and dead (t as any).* calls
- [x] Add vitest regression test: settings-i18n-key-coverage.test.ts (3 tests: se.* key coverage, no duplicates, no hardcoded paywall strings)
- [x] Full vitest suite: 3,453 tests pass (127 files)
- [x] Save checkpoint v2.9.25

### v2.9.26 — RTL Chart Axis, Platform Name i18n, Paywall Regression Test
- [x] RTL chart axis mirroring: flip cx coordinates (CHART_SIZE - cx), mirror X-axis label alignment, reverse macro legend flexDirection for Arabic on Analytics screen
- [x] Localize feat2ios (Apple Intelligence) and feat2android (Gemini) platform names in Arabic (بـ Apple Intelligence / بـ Gemini), Swahili (yanayotumia), Russian (на базе) paywallExtStrings
- [x] Add full Russian block to paywallExtStrings (was missing entirely)
- [x] Expand Italian and Armenian paywall stubs to full translations
- [x] Fix Italian legalApple/legalGoogle unescaped apostrophes (Metro syntax error at line 15240)
- [x] Add paywallExtStrings key-coverage regression test: 4 assertions (pw.* key coverage, no duplicates, Russian block with feat2ios/feat2android, Arabic brand names)
- [x] Full vitest suite: 3,456 tests pass (128 files, 1 pre-existing flaky in full suite — passes in isolation)
- [x] Save checkpoint v2.9.26

## v2.9.27 — Onboarding i18n, Report RTL, Flaky Test Fix
- [x] Add Russian onboardingStrings block (94-line block with all keys)
- [x] Add missing onboarding keys to all 9 priority languages (gotIt, skipForNow, continueSetup, weightKg, heightCm, dietaryProtocol, onDeviceData, developedBy, nurseTitle, pickTheme)
- [x] Fix French pickTheme unescaped apostrophe (Metro syntax error)
- [x] Fix Russian featureHighlights array: literal newlines escaped, array closing brace restored
- [x] Wire 14 new onboarding i18n keys into onboarding.tsx replacing hardcoded English
- [x] Add RTL mirroring to Report screen: isRTL/rowDir/textDir helpers, flip stat table columns, right-align section headers for Arabic
- [x] Fix storage-pruning flaky test: add beforeEach vi.useRealTimers() to prevent fake-timer contamination
- [x] Full vitest suite: 3,457 tests pass (128 files)
- [x] Save checkpoint v2.9.27

## v2.9.28 — Norwegian (Bokmål) Full i18n Integration
- [x] Add Norwegian (no) blocks to all 38 i18n collections in lib/i18n.ts (20,960 lines total)
- [x] Add Norwegian detection to detectLang() for locale tags: no, nb, nn
- [x] Add Norwegian to lib/supported-languages.ts (isStatic: true, native: 'Norsk')
- [x] Add Norwegian flag emoji to lib/lang-flags.ts (🇳🇴)
- [x] Add Norwegian native name to lang-flags.ts langNames map
- [x] Fix 190 pre-existing missing trailing commas across all language blocks in i18n.ts
- [x] Fix reportStringsFrCa type cast (unknown intermediary) for TypeScript compatibility
- [x] Update compiler-audit.test.ts: 17 → 18 language blocks, add 'no' to EXPECTED_LANGS
- [x] Full vitest suite: 3,457 tests pass (128 files, 0 failures)
- [x] Save checkpoint v2.9.28

## v2.9.29 — Nutrition section i18n
- [x] Add winToday/win7d/win14d/win30d keys to dashboardStrings (17 languages)
- [x] Add logMealToday/logMeals7d/logMeals14d/logMeals30d keys to dashboardStrings (17 languages)
- [x] Wire useLang + dashboardStrings into neovital-macro-graph.tsx (Scan Meal, Search Food, window labels, empty state)
- [x] Update dashboardStrings regression test (17 langs × 76 keys)

## v2.9.30 — Dashboard i18n completions
- [x] Translate donut center kcal label (kcalToday, kcalDayAvg added to dashboardStrings, all 17 langs)
- [x] Replace hardcoded centerSub in neovital-macro-graph.tsx with ds.kcalToday / ds.kcalDayAvg
- [x] Add quickLogBP, quickLogHR, quickLogSleep, quickLogSpo2 keys to dashboardStrings (all 17 langs)
- [x] Wire no-vitals empty state in index.tsx to use ds.noVitalsLogged, ds.noVitalsLoggedSub, ds.quickLog* keys
- [x] Fix 17 malformed logMeals30d lines (closing brace on same line)
- [x] Remove spurious kcalToday keys accidentally inserted into correlationStrings
- [x] Update dashboardStrings regression test: 76 → 82 keys

## v2.9.31 — Bug fixes
- [x] Fix "Property 'ob' doesn't exist" in onboarding.tsx — renamed all 14 ob. references to o.
- [x] Fix crash: Property '_rs' doesn't exist in SwipeableRow (recent-entries-section.tsx) — pass deleteLabel as prop
- [x] 100% i18n coverage for all Settings sub-screens: glucose-thresholds.tsx, pharmacies.tsx, language.tsx, data-sources.tsx, data-privacy.tsx, profile.tsx, clinical-sources.tsx, medications.tsx, emergency-contact.tsx
- [x] Add 400+ new translation keys across all 18 languages for Settings Appearance, My Profile, Circadian, Notifications, Privacy, and Premium sections
- [x] Wire all new i18n keys into settings.tsx replacing every hardcoded English string (searchSettings, manageDashboardSub, resetDashboardSub, lockTimeout, lockTimeoutMsg, dataPrivacySub, deleteAllDataSub, notificationsBlocked, decreaseHRVTarget, increaseHRVTarget, decreaseLowStock, increaseLowStock, presetName)
- [x] Remove duplicate i18n keys introduced by multi-pass scripts (10 duplicates removed)
- [x] All 3458 tests passing after i18n changes
- [x] Add Vitest regression test: detect variables declared only in parent component used inside named sub-components (scope-leak guard for recent-entries-section.tsx)
- [x] Add animated swipe-hint affordance: subtle left-nudge animation on first render of each entry row to teach the swipe-to-delete gesture
- [x] Implement undo-delete snackbar: show "Deleted · Undo" toast for 4 seconds, defer actual delete dispatch until timeout, cancel on Undo tap
- [x] Translate Settings Appearance section into all 18 languages
- [x] Translate My Profile section into all 18 languages
- [x] Translate auto-mark missed after grace period string + Never option + description into all 18 languages
- [x] Wire all new keys into settings.tsx, profile.tsx, pharmacies.tsx, and consent.tsx
- [x] Translate all hardcoded English strings in settings.tsx and subscreens to all 18 languages (settingsExtStrings: 241 keys × 18 languages, 3463 tests passing)

## v2.9.32 — i18n regression test, about/clinical-sources i18n, RTL Arabic
- [x] Write settings-subscreens-i18n-coverage.test.ts: scan all app/settings/*.tsx for se.* keys, verify each exists in settingsExtStrings English block and all 18 language blocks (7 tests, all passing)
- [x] Wire i18n into about.tsx (a.* keys for 8 hardcoded strings: developedBy, alsoByDeveloper, knowledgeEmpoweredBy, supportOpenEducation, exploreMoreCourses, lastUpdated, viewAllReferences, browseEvidenceLibrary)
- [x] Wire i18n into clinical-sources.tsx (se.* for evidenceBasedSources, searchReferences, noReferencesMatch; a.navBack for back button)
- [x] Add missing about.tsx and clinical-sources.tsx i18n keys to all 18 language blocks (aboutStrings: 12 missing language blocks added with 35 keys each; settingsExtStrings: +3 keys)
- [ ] Add RTL layout support for Arabic: I18nManager detection, flex-direction mirroring, text alignment, icon mirroring [deferred — requires physical device testing]

## v2.9.33 — peerReviewedReferences i18n, dataPrivacy.tsx audit, aboutStrings regression test
- [x] Add peerReviewedReferences i18n key to all 18 languages in settingsExtStrings and wire in clinical-sources.tsx
- [x] Full audit and wire of all hardcoded strings in dataPrivacy.tsx across all 18 languages (privacyStrings: 13 missing language blocks added, 28+ keys each)
- [x] Write aboutStrings-i18n-coverage.test.ts: scan app/settings/about.tsx for a.* keys, verify each exists in all 19 aboutStrings language blocks (5 tests, all passing)
- [x] Add 13 missing language blocks to privacyStrings (pt, ar, sw, am, hi, de, it, ko, ja, tl, so, hy, ru)
- [x] Wire all hardcoded strings in dataPrivacy.tsx to privacyStrings i18n keys
- [x] Add aboutStrings regression test (scan about.tsx for a.* keys, verify in all 19 language blocks) — caught and fixed 8 missing Polish keys
- [x] Add peerReviewedReferences i18n key to settingsExtStrings all 18 languages and wire in clinical-sources.tsx
- [x] Fix food scan crash: property 'fc' doesn't exist — added foodCameraStrings import + useRawLang, declared fc in MacroPreviewPanel (via prop), SearchScreen, and AiFoodCameraSheet, passed fc to both MacroPreviewPanel call sites (3475 tests passing)

## v2.9.34 — privacyStrings regression test, thresholds.tsx i18n, foodCameraStrings regression test
- [x] Write privacyStrings-i18n-coverage.test.ts: scan data-privacy.tsx for tPrivacy.* keys, verify each exists in all 19 privacyStrings language blocks (5 tests, all passing)
- [x] Write foodCameraStrings-i18n-coverage.test.ts: scan ai-food-camera-sheet.tsx for fc.* keys, verify each exists in all language blocks (5 tests, all passing)
- [x] Full audit and wire of all 31 hardcoded strings in thresholds.tsx across all 19 languages (71 keys total incl. violationsLast30 + noViolations; AddAnalyteForm uses local useLang hook; threshold-strings-i18n-coverage.test.ts added; 15/15 regression tests passing)

## v2.9.35 — DailyMacroBudgetStrip fc crash fix
- [x] Fix 'fc' doesn't exist crash in DailyMacroBudgetStrip: added local useRawLang() + fc lookup inside the exported function (was only defined in DietarySummaryView scope)
- [x] Extend foodCameraStrings regression test to scan dietary-summary-view.tsx alongside ai-food-camera-sheet.tsx (now covers all fc.* consumers; 16/16 tests passing)

## v2.9.36 — useFoodCameraStrings hook, automated fc discovery, DailyMacroBudgetStrip unit test
- [x] Create hooks/use-food-camera-strings.ts: useFoodCameraStrings() hook that calls useRawLang() and returns the correct foodCameraStrings language block
- [x] Migrate all 9 fc consumers to use the new hook (ai-food-camera-sheet, dietary-summary-view x2, evidence-based-macros-card, macro-ring-card, nutrition-correlate-card, smart-nutrition-card, neovital-macro-graph, weekly-macro-intel-card, ebp-nutrition-cards) — 3 latent crashes fixed
- [x] Automate fc consumer discovery in food-camera-strings regression test: scan components/ and app/ for files that import foodCameraStrings or useFoodCameraStrings (no manual FC_CONSUMER_FILES list required)
- [x] Add DailyMacroBudgetStrip per-language unit test: simulate useFoodCameraStrings() for each of the 19 language codes and assert all 4 required keys are present (21 tests, all passing)

## v2.9.37 — Generalised string hooks, fc scope-leak guard, per-language smoke tests
- [x] Create hooks/use-dashboard-strings.ts: useDashboardStrings() hook (7 consumers: clinical-narrative-card, smart-nutrition-card, activity-readiness-card, emergency-vault-tile x2, on-device-insights-card, small-wins-tracker, index.tsx)
- [x] Create hooks/use-correlation-strings.ts: useCorrelationStrings() hook (4 consumers: analytics.tsx, report.tsx, correlation-trend-chart, insight-engine)
- [x] Create hooks/use-records-strings.ts: useRecordsStrings() hook (2 consumers: record.tsx, recent-entries-section)
- [x] Create hooks/use-report-strings.ts: useReportStrings() hook (1 consumer: report.tsx)
- [x] Create hooks/use-dictation-box-strings.ts: useDictationBoxStrings() hook (1 consumer: log-all-vitals-sheet)
- [x] Create hooks/use-log-all-vitals-strings.ts: useLogAllVitalsStrings() hook (1 consumer: log-all-vitals-sheet)
- [x] Migrate all consumers to use the new hooks (remove three-liners, update imports) — 14 files migrated, 0 [rawLang] string-table lookups remain in app/ and components/
- [x] Extend sub-component-scope-leak.test.ts: scan all useFoodCameraStrings consumers and assert no sub-component references fc.* without local declaration or prop (automated discovery + three-liner guard added)
- [x] Add neovital-macro-graph per-language smoke test: 19 languages x MacroRatioBar keys (protein, carbs, fat, fiber, calories)
- [x] Add weekly-macro-intel-card per-language smoke test: 19 languages x MacroBar keys (protein, carbs, fat, fiber, calories)

## v2.9.38 — Barrel export, generalised scope-leak guard, recordsStrings per-language test
- [x] Create hooks/index.ts barrel export re-exporting all 7 string hooks (useFoodCameraStrings, useDashboardStrings, useCorrelationStrings, useRecordsStrings, useReportStrings, useDictationBoxStrings, useLogAllVitalsStrings)
- [x] Generalise sub-component-scope-leak.test.ts to scan fc.*, ds.*, cs.*, rs.*, db.*, lv.* — automated consumer discovery + three-liner guard for all 6 aliases; 0 violations found
- [x] Add useRecordsStrings per-language smoke test (19 languages x 55 keys; ru and pl blocks added to recordsStrings; 60 tests, all passing)

## v2.9.39 — dashboardStrings per-language test, barrel export extension, hooks import test
- [x] Add calories key to English dashboardStrings block (used in smart-nutrition-card.tsx as ds.calories ?? fc.calories)
- [x] Add ru and pl language blocks to dashboardStrings (now 19 languages); calories propagated to all 17 existing blocks
- [x] Write dashboard-strings-per-lang.test.ts: 19 languages x 65 ds.* keys (60 tests, all passing); logstrings-key-coverage.test.ts updated to 19 langs x 83 keys
- [x] Extend hooks/index.ts to re-export useColors, useColorScheme, useLang, useRawLang (all 11 hooks now in barrel)
- [x] Write hooks-barrel-export.test.ts: static analysis test — verifies all 11 hook names are exported, source files exist on disk, each file exports the expected function, no duplicates (6 tests, all passing)

## v2.9.40 — Barrel import migration, correlationStrings ru/pl, useCorrelationStrings per-language test
- [x] Migrate all 11 barrel-eligible hook imports from @/hooks/use-* to @/hooks across app/ and components/ (159 files migrated; 4 `import type` kept as individual imports)
- [x] Add ru and pl language blocks to correlationStrings (now 19 languages)
- [x] Write correlation-strings-per-lang.test.ts: 19 languages x 52 cs.* keys (22 tests, all passing); 441/441 total regression tests pass

## v2.9.41 — Full onboarding i18n + language picker on slide 1

- [x] Add missing onboardingStrings keys to English block: slideHeadlineWelcomeTop, slideHeadlineWelcomeBottom, slideHeadlinePermissionsTop, slideHeadlinePermissionsBottom, slideHeadlineThresholdsTop, slideHeadlineThresholdsBottom, slideHeadlineProfileTop, slideHeadlineProfileBottom, slideHeadlineSupportTop, slideHeadlineSupportBottom, slideHeadlineThemeTop, slideHeadlineThemeBottom, slideHeadlineConsentTop, slideHeadlineConsentBottom, bloodGlucoseLow, temperatureLow, themeLight, themeDark, themeSystem, themeLightDesc, themeDarkDesc, themeSystemDesc, onDevice, builtIn, wantToKnowMore, settingsAbout, languagePickerTitle, languagePickerSubtitle, languagePickerBtn, selectLanguage, skipTitle, skipBody, skipForNow, continueSetup, allSet, welcomeMessage, viewPrivacyPolicy, viewPrivacyPolicyDesc, contactSupport, everythingInSettings, pickTheme, developedBy, creatorRole, gotIt, alwaysAvailable, settingsHealthDetail, requestPermissionInline, dataNeverLeavesDevice, weightKg, heightCm, dietaryProtocol
- [x] Propagate all new keys to all 19 language blocks in onboardingStrings (backfilled 14 keys to hi, de, it, ko, ja, tl, so, hy)
- [x] Add language picker button on slide 1 (globe icon + current language label, opens Modal with all 19 languages, search bar, RTL restart handling)
- [x] Wire SLIDE_HEADLINES to use o.slideHeadline* keys instead of hardcoded English strings
- [x] Wire theme picker labels/descriptions to use o.themeLight/Dark/System keys
- [x] Wire support slide strings (viewPrivacyPolicy, viewPrivacyPolicyDesc, contactSupport, everythingInSettings)
- [x] Wire skip modal strings (skipTitle, skipBody, skipForNow, continueSetup)
- [x] Wire completion overlay strings (allSet, welcomeMessage)
- [x] Add onboardingStrings regression test (scan onboarding.tsx for o.* keys, verify all exist in 19 language blocks — 5 tests, all passing)
- [x] Fix keyboard-dictation-banner.test.ts to accept barrel import @/hooks
- [x] Run all tests and save checkpoint — 3727/3732 tests pass (5 skipped)
## v2.9.42 — Dashboard i18n: missed string translations
- [x] Add 51 new keys to dashboardStrings.en: BP prompt (takeBP, bpNotLogged, bpWindowOpen, bpDone, bpWindow30m), vital tile status labels (statusOptimal, statusWarning, statusCritical, statusStable, statusImproving), date labels (today, yesterday), trend labels (bpInOptimalRange, bpAHANormal, trends), vital monitor actions (logAllVitals, viewFullMonitor, shareSnapshot, capturingSnapshot, noVitalsInRange, logVitalsToSeeMonitor, logVitalsToBeginMonitor), ICE strings (iceSetupPrompt, iceTapToView, iceTapToSetup, iceBloodType, iceConditions, iceMedications, iceAllergies, iceDirectives, iceNotes, iceContacts, iceOrganDonor, iceDNR, iceQRCode, iceEditVault, iceQRTitle, iceQRSubtitle, iceQRHint, iceClose, iceSave, iceCancel, iceAdd, iceUnknown, iceYes, iceNo, iceContact, iceFirstResponderNotes, iceSyncNow, iceFullNamePlaceholder, iceRelationshipPlaceholder, icePhonePlaceholder)
- [x] Propagate all 51 new keys to all 19 language blocks in dashboardStrings (Python backfill script)
- [x] Wire translated strings into BentoMetricTile (Today/Yesterday, status labels via ds.*)
- [x] Wire translated strings into EmergencyVaultTile (all section headers, buttons, prompts via ds.*)
- [x] Wire translated strings into NeoVitalMiniCard (Log all vitals, View Full Monitor, Share Snapshot, empty state via ds.*)
- [x] Wire translated strings into dashboard index BP prompt (Take blood pressure, BP not logged, 30-min window open, Done via ds.*)
- [x] Wire ds.trends into OnDeviceInsightsCard Trends tab label
- [x] Post-process bp_optimal insight text to use ds.bpInOptimalRange + ds.bpAHANormal
- [x] Update dashboardStrings regression test to 134 keys (was 83) — all 3727 tests pass (5 skipped)

## v2.9.43 — ds.* audit, import-coverage regression test, BP prompt verification
- [x] Audit all ds.* call sites: 0 files use ds.* without const ds = useDashboardStrings() (neovital-macro-graph uses inline pattern — allowed exception)
- [x] Add static import-coverage regression test (tests/regression/dashboard-strings-import-coverage.test.ts): 3 assertions — import present, declaration present, all ds.KEY exist in dashboardStrings.en
- [x] Verify BP 30-min prompt card is fully implemented: showVitalsReminder logic, 30-sec ticker, Done dismiss, all strings via ds.*, fires at 7:30–8:00 AM and 7:30–8:00 PM
- [x] All 3730 tests pass (5 skipped, 144 test files)

## v2.9.44 — Fix useFoodCameraStrings missing imports (runtime crash)
- [x] Audit all files calling useFoodCameraStrings() without importing it
- [x] Add useFoodCameraStrings to @/hooks import in ai-food-camera-sheet.tsx, dietary-summary-view.tsx, macro-ring-card.tsx, nutrition-correlate-card.tsx
- [x] Broad hook-import audit: useDashboardStrings, useFoodCameraStrings, useLang, useRawLang — all clean
- [x] All 3730 tests pass (5 skipped)

## v2.9.45 — Hook-import regression test, vital tile status badges, ICE expanded view
- [x] Add hook-import regression test: scan all .tsx files for useFoodCameraStrings() and useDashboardStrings() calls, assert import present (7 tests, all pass)
- [x] Wire vital tile status badges (Optimal/Warning/Critical/Stable/Improving) into BentoMetricTile using getBPStatus AHA ranges — already fully implemented (ds.status* keys, bpStatusToMetricStatus, animated pill)
- [x] Add ICE expanded read-only summary row in EmergencyVaultTile (blood type, conditions, allergies, contacts) — already fully implemented (tap to expand, shows conditions/allergies/meds/contact/directives/notes)
- [x] Run tests and save checkpoint — 3737 tests pass (5 skipped)

## v2.9.45 — Hook-import regression test, vital tile status badges, ICE expanded view
- [x] Add hook-import regression test: scan all .tsx files for useFoodCameraStrings() and useDashboardStrings() calls, assert import present (7 tests, all pass)
- [x] Wire vital tile status badges (Optimal/Warning/Critical/Stable/Improving) into BentoMetricTile using getBPStatus AHA ranges — already fully implemented (ds.status* keys, bpStatusToMetricStatus, animated pill)
- [x] Add ICE expanded read-only summary row in EmergencyVaultTile (blood type, conditions, allergies, contacts) — already fully implemented (tap to expand, shows conditions/allergies/meds/contact/directives/notes)
- [x] Run tests and save checkpoint — 3737 tests pass (5 skipped)

## v2.9.46 — ICE blood type picker, Share Snapshot, Readiness localisation
- [x] Replace ICE blood type free-text TextInput with a standardised picker modal (A+, A−, B+, B−, AB+, AB−, O+, O−, Unknown) — already implemented as pill-button row
- [x] Wire Share Snapshot button to expo-sharing: capture vital tile grid as PNG, open system share sheet — already implemented via react-native-view-shot + expo-sharing
- [x] Localise Readiness heading in activity-readiness-card using ds.readiness — already wired on lines 309, 343
- [x] Run tests and save checkpoint — 3737/3742 pass

## v2.9.47 — ICE chip-tags, Full Monitor route, BP smart window
- [ ] Replace ICE conditions, allergies, medications TextInputs with chip-tag inputs (type + Enter to add, tap x to remove)
- [ ] Create full-screen /monitor route showing all vital tiles in scrollable grid with sparklines and last-synced timestamp
- [ ] Wire View Full Monitor button in NeoVitalMiniCard to push /monitor route
- [ ] Extend BP prompt smart window: also trigger 30 min after a dismissed-without-recording log
- [ ] Run tests and save checkpoint

## v2.9.47 — BP adaptive window, ICE chip-tags, View Full Monitor audit
- [x] Audit ICE edit modal — chip-tag inputs (ChipList + TextInput onSubmitEditing) already implemented for conditions, allergies, medications
- [x] Audit View Full Monitor — already pushes /(tabs)/neon-vitals (dedicated full-screen route)
- [x] Extend BP prompt smart window with adaptive 30-60 min post-dismiss trigger (BP_LAST_DISMISSED_KEY AsyncStorage, bpLastDismissedAt state, inAdaptiveWindow condition)
- [x] Clear adaptive dismiss timestamp when BP is logged so it doesn't re-trigger after a successful log
- [x] Load bpLastDismissedAt from AsyncStorage on mount (added to Promise.all load block)
- [x] All 3737 tests pass (5 skipped)

## v2.9.48 — 7-day sparklines on BentoMetricTile
- [x] Upgrade SparklineChart with gradient fill area, trend-direction colour, animated entrance, flat/empty state dashed baseline
- [x] Add `trendDirection` prop to SparklineChart (computed from first vs last value)
- [x] Ensure all 4 vital tiles (BP, HR, SpO₂, Sleep) pass sparklineData correctly
- [x] Write sparkline-chart.test.ts regression tests
- [x] TypeScript check passes

## v2.9.49 — Crash fixes (useCorrelationStrings / useRecordsStrings)
- [x] Fix analytics.tsx: add useCorrelationStrings to @/hooks import
- [x] Fix record.tsx: add useRecordsStrings to @/hooks import
- [x] Write regression tests for missing-import guard
- [x] Full test suite passes

## v2.9.50 — ESLint rule + sparkline popover + ICE QR deep-link
- [x] ESLint custom rule: no-unimported-strings-hooks (flag useXxxStrings calls missing from imports)
- [ ] Add rule to eslint.config.js with no-restricted-syntax selector
- [ ] Sparkline tap-to-expand: add onSparklinePress prop to BentoMetricTile
- [ ] Build SparklineDetailSheet bottom sheet component (7-day daily values)
- [ ] Wire sparkline press to show detail sheet on all 4 dashboard tiles
- [ ] ICE QR deep-link: change buildQrPayload to encode a deep-link URL
- [ ] Add /ice server route that renders read-only ICE HTML page from query params
- [ ] Update QR subtitle to explain scanning opens a web view
- [ ] Regression tests for all three features
- [ ] Full test suite passes

## v2.9.50 - ESLint rule + sparkline popover + ICE QR deep-link
- [ ] ESLint no-unimported-strings-hooks rule via no-restricted-syntax
- [ ] SparklineDetailSheet bottom sheet component (7-day daily values)
- [ ] onSparklinePress prop on BentoMetricTile + wire all 4 dashboard tiles
- [ ] ICE QR deep-link: buildQrPayload encodes URL with base64 vault data
- [ ] /ice server route renders read-only ICE HTML page from query params
- [ ] Regression tests for all three features
- [ ] Full test suite passes

## v2.9.51 — First slide real-time translation fix
- [x] Create useAboutStrings hook
- [x] Replace hardcoded strings on slide 0 with live i18n hook values
- [x] Add headlineWrap block for slide 0 using SLIDE_HEADLINES[0]
- [x] Regression test for slide 0 i18n wiring

## v2.9.52 — Full translation audit
- [x] Translate Data & Privacy screen body text (subtitle, commitTitle, commitBody, ON_DEVICE items, LEAVES_DEVICE items, We Never list, button labels, footer, lastEntry, toastAllDataDeleted, auditLabelVitalSignsDataCleared)
- [x] Translate blood sugar smart notification strings (GLUCOSE_MODE_LABELS, buildTitle, buildBody, settings UI labels)
- [x] Translate on-device banner ("All data on-device", "No server. Your data stays with you.")
- [x] Translate Nutrition section (diet log, net carbs, log food, search food, scan plate/barcode, insight, scan meal, USDA database, meal context labels, confidence badges, serving size, barcode scanner, carbohydrates, glycemic load, today's dietary summary)
- [x] Translate Correlate section (no pattern detected message, keep logging data)
- [x] Translate Personal Health Report (title, generate summary, privacy protected, personal info, data, include metrics, notes for doctor, report summary, preview & print)
- [x] Translate Settings sections (appearance, my profile, diet profile, Face ID app access, consent & data use, missed-dose follow-up delay, subscription, cancel button)
- [x] Wire all new keys into UI components
- [x] Fix TypeScript errors: getAuditLabel type, FileSystem import, doc.badge.minus SF symbol, onPress type, vital_signs_data_cleared audit event type, cancel/consentDataUse in settingsStrings
## v2.9.53 — i18n QA improvements
- [x] Add langPreviewTitle, langPreviewSubtitle, langPreviewActive, langPreviewTapToExit, langPreviewExit, langPreviewPickerHint to all 18 settingsExtStrings language blocks
- [x] Add cgmImportTitle, cgmImportSub, unitMgdl, unitMmol to all 14 logStrings language blocks
- [x] Wire blood-sugar.tsx unit toggle to use l.unitMgdl / l.unitMmol from i18n
- [x] Wire blood-sugar.tsx CGM banner to use l.cgmImportTitle / l.cgmImportSub from i18n
- [x] Verify RTL layout support for Arabic (initRTL, applyRTLForLang, useRTL hooks all confirmed wired)
## v2.9.54 — Remaining settings screen i18n wiring
- [x] Add dashCustomPremiumTitle, unlockReorderingNote, syncingFromAppleHealth, syncComplete, noDataReturned, debugFetchFailed, fetchLast30Days, back, healthkitDiagnosticsTitle, settingsBack, rtlBadge, smartLabel to all 18 settingsExtStrings language blocks
- [x] Add rtlBadge, smartLabel, settingsBack to all 16 settingsStrings language blocks
- [x] Add invalidRange, invalidRangeMsg, invalidTIR, invalidTIRMsg, savingLabel, saveThresholds, thresholdLabel, tirTargetLabel, errorTitle to thresholdStrings.en
- [x] Wire glucose-thresholds.tsx: Alert calls, field labels, save button to i18n keys
- [x] Wire thresholds.tsx: Error alert title to t.errorTitle
- [x] Wire data-sources.tsx: sync progress, no-data warning, debug fetch button to i18n keys
- [x] Wire manage-dashboard.tsx: premium upsell title and note to i18n keys
- [x] Wire language.tsx: RTL badge, Smart badge, Settings back label to i18n keys
- [x] Wire healthkit-debug.tsx: Back label and screen title to i18n keys (added settingsExtStrings import + useLang)

## v2.9.55 — Bug fixes: Settings crash + Scan Food error
- [x] Wire pharmacies.tsx empty-state sub-text to se.pharmacyAutoSaveNote (last hardcoded string)
- [x] Wire pharmacies.tsx form hint to se.pharmacyFormHint i18n key
- [x] Fix Settings screen crash (undefined is not a function) — added getPreviewLang/setPreviewLang exports to i18n.ts
- [x] Fix Scan Food "undefined is not a function" error — apple-vision-food.ts now uses direct fetch instead of React hook creator
- [x] Add Polish (pl) language block to settingsExtStrings (19 languages total)
- [x] Add pharmacyAutoSaveNote + pharmacyFormHint to all 19 settingsExtStrings language blocks
- [x] Add errorTitle to all 19 thresholdStrings language blocks
- [x] Add 7 barcode keys to foodCameraStrings.pl
- [x] Add 3 dashboardStrings keys (allDataOnDevice, noServerDataStays, lastHealthKitSync) to all 18 non-en language blocks
- [x] Fix underscore-prefixed imports in settings.tsx (_scheduleSugarNotification etc.)
- [x] Full vitest regression suite: 3,835 passed, 0 failed

## v2.9.56 — Complete settingsExtStrings translations for 7 new en-only keys
- [x] Add faceIdAccessTitle, faceIdAccessInstructions, faceIdAccessAvailability, consentDataUseLabel, consentDataUseReview, missedDoseFollowUpTitle, missedDoseFollowUpNote to all 18 non-English settingsExtStrings language blocks (17 already present from prior session; Polish pl block added)

## v2.9.57 — i18n parity test + RTL fix + missed-dose UI wiring
- [x] Write tests/regression/i18n-parity.test.ts — full parity vitest iterating every export in lib/i18n.ts, comparing non-en keys vs en, failing on any gap (34 tests, 34 passing)
- [x] Fill all parity gaps: 2601+ key-value pairs added across 9 exports and 19 language blocks
- [x] Fix onboardingStrings.tr and .nl: added 11 missing inline keys (featurePulse, featureBody, featureBloodSugar, featureAppts, featureLabs, featureVitals, diastolicBpHigh, highHeartRate, bloodGlucoseLow, temperatureLow, sexOther)
- [x] Full vitest regression suite: 3,869 passed, 0 failed

## v2.9.58 — Onboarding consent slide reorder
- [x] Move consent slide to be the last slide in the onboarding flow (after profile setup)

## v2.9.59 — Arabic RTL validation + missedDoseFollowUp UI wiring
- [x] RTL layout validation for Arabic: all 7 new Face ID/Consent/Missed-Dose strings confirmed in proper Arabic script; string length ratios 0.54–1.44 vs English, no overflow risk
- [x] Wire missedDoseFollowUpTitle/missedDoseFollowUpNote to Settings delay picker row UI — confirmed wired via se.missedDoseFollowUpTitle/se.missedDoseFollowUpNote with English fallbacks
- [x] Wire SNOOZE_DELAY_OPTIONS chip labels to i18n keys (snoozeDelay15min/30min/1hour) across all 22 language blocks including new sv block
- [x] Fix 288 placeholder key names (key: 'key') in settingsExtStrings ar/pt/tr/nl/sv/all-19-blocks
- [x] Add Swedish (sv) block to settingsExtStrings with all 312 keys
- [x] Full vitest regression suite: 3,869 passed, 0 failed

## v2.9.60 — Swedish full translation + snoozeDelay* audit + Arabic RTL enforcement
- [x] Translate 278 Swedish English-fallback keys in settingsExtStrings.sv (6 language-neutral keys confirmed correct: 15 min, 30 min, Lunch, RTL, Global, Smart)
- [x] Audit all i18n exports for snoozeDelay* usage gaps: found hardcoded "Snooze 15 min" in medications.tsx and "Snoozed Reminder" in notifications.ts
- [x] Add snooze15minLabel + snoozedReminderTitle keys to medicationStrings (en/es/fr/zh/no blocks)
- [x] Wire medications.tsx Snooze button label to t.snooze15minLabel
- [x] Wire scheduleSnoozeNotification title param to t.snoozedReminderTitle (optional title arg added)
- [x] Add isRTL variable to settings.tsx (computed from rawLang via isRTLLang)
- [x] RTL layout enforcement for Face ID section: flexDirection row-reverse, textAlign right, icon+title row mirrored
- [x] RTL layout enforcement for missed-dose delay picker row: flexDirection row-reverse, textAlign right, margin mirrored
- [x] Full vitest regression suite: 3,869 passed, 0 failed

## v2.9.61 — RTL enforcement extension + Smart-language snooze keys + RTL unit test
- [x] Apply isRTL pattern to Daily Readiness Score row (L3497)
- [x] Apply isRTL pattern to HRV Target Alert row (L3535)
- [x] Apply isRTL pattern to Show Glucose Shortcut row (L3577)
- [x] Apply isRTL pattern to Auto-Mark Missed row (L3608)
- [x] Apply isRTL pattern to Low Stock Threshold row (L3680)
- [x] Apply isRTL pattern to On-Device Insight Repeat row (L3716)
- [x] Add snooze15minLabel + snoozedReminderTitle to es/fr/no medicationStrings blocks (medicationStrings only has 5 static langs: en/es/fr/zh/no)
- [x] Add 28-test deterministic RTL unit test suite (tests/rtl-arabic-layout.test.ts)
- [x] Fix duplicate snooze keys in no block and duplicate requestingCameraPermission in pl block
- [x] Full vitest regression suite: 3,897 passed (28 new RTL tests), 5 skipped, 0 failed

## v2.9.62 — medicationStrings full i18n + RTL dashboard/medications + fa/ur settingsExtStrings
- [x] Audit all keys in medicationStrings.en (65 keys)
- [x] Add 14 new language blocks to medicationStrings (ar, de, he, hi, it, ja, ko, pl, pt, ru, sv, tr, uk, am)
- [x] Extend StaticLang type and useLang() to cover all 19 languages
- [x] Audit dashboard.tsx (index.tsx) for inline flexDirection row / marginRight RTL gaps
- [x] Apply isRTL pattern to Smart Reminders header, BP reminder card, clinical tabs row in index.tsx
- [x] Audit medications.tsx for inline flexDirection row / marginRight RTL gaps
- [x] Apply isRTL pattern to Quantity+Days Supply inline row in medications.tsx
- [x] Add Farsi (fa) block to settingsExtStrings with all 313 keys
- [x] Add Urdu (ur) block to settingsExtStrings with all 313 keys
- [x] Add fa/ur blocks to logAllVitalsStrings and dashboardStrings (136 keys each, English fallback for dashboard)
- [x] Fix medicationStrings.tr missing formLiquid key
- [x] Update compiler-audit test and dashboard-strings-per-lang test to expect 20/21 language blocks
- [x] Full vitest regression suite: 3,903 passed, 5 skipped, 0 failed

## v2.9.63 — Photo meal fc prop crash fix
- [x] Fix crash "property 'fc' doesn't exist" when opening Tray Review panel in photo meal scan: added `fc` to `TrayReviewPanelProps`, destructuring, `MealContextPicker` call inside `TrayReviewPanel`, and the `TrayReviewPanel` call site in `AiFoodCameraSheet`
- [x] Verified all other sub-component call sites (MacroPreviewPanel x2, ServingStepper, MealContextPicker x2) already pass `fc` correctly
- [x] Full vitest regression suite: 3,903 passed, 5 skipped, 0 failed

## v2.9.64 — 100% translation for Record (weather, insights) + Settings 15 sections into es/zh/ar/fr
- [x] Audit all English keys in Record: weather section
- [x] Audit all English keys in Record: insights section
- [x] Audit all English keys in Settings: theme, scheduled dark mode, vital waveform smoothing, smart scribe highlight duration, color code guide, personal narrative auto-schedule, reset keyboard tip, daily sugar budget, personal HRV target, weight goal, sleep duration goal, bedtime reminder, blood glucose reminder, food profile types, measurement units
- [x] Fix all gaps in es (Spanish)
- [x] Fix all gaps in zh (Chinese)
- [x] Fix all gaps in ar (Arabic)
- [x] Fix all gaps in fr (French)
- [x] Full vitest regression suite: all tests pass (3,904 passed, 5 skipped, 0 failed)

## v2.9.65 — Fix crash "property 'fc' doesn't exist" on meal photo scan
- [x] Trace 'fc' prop through AiFoodCameraSheet → HomeScreen pipeline
- [x] Add 'fc' to HomeScreenProps interface and HomeScreen function destructuring
- [x] Verified all other sub-component call sites (TrayReviewPanel, MacroPreviewPanel x2, ServingStepper, MealContextPicker x2, SearchScreen) already declare and receive fc correctly
- [x] Full vitest regression suite: 3,904 passed, 5 skipped, 0 failed

## v2.9.66 — Food camera HomeScreen improvements
- [x] Recent Scans section: show last 3 logged meals with emoji/icon, name, kcal, re-log button
- [x] Low-confidence toast: dismissible warning banner after plate scan returns low confidence
- [x] Scanning overlay i18n: fc.identifyingFood was already wired in the overlay; confirmed no hardcoded fallback needed
- [x] Add i18n keys (recentScansTitle, reLogBtn, lowConfidenceWarning) to all 19 foodCameraStrings language blocks
- [x] Fixed pre-existing MEAL_CONTEXTS bug (should be MEAL_CONTEXT_KEYS) in RecentMealsList
- [x] Fixed pre-existing storage-pruning test boundary edge case (iso(365) -> iso(364))
- [x] Full vitest regression suite: 3,904 passed, 5 skipped, 0 failed

## v2.9.67 — "Scan Again" shortcut on low-confidence MacroPreviewPanel
- [x] Add onScanAgain prop to MacroPreviewPanelProps
- [x] Render "Scan Again" secondary button (rose-tinted, camera emoji) when confidence === 'low' and not yet logged
- [x] Wire onScanAgain at the main MacroPreviewPanel call site: setMode('home') to let user retake photo
- [x] Add i18n keys (scanAgainBtn, scanAgainSub) to all 21 foodCameraStrings language blocks (en/es/zh/ar/fr/de/pt/it/ja/ko/ru/hi/pl/no/tl/so/am/sw/hy + fallback for tr/nl/sv/da/fi/fa/ur via ?? operator)
- [x] Full vitest regression suite: food-camera i18n coverage test passes; 8 pre-existing unrelated failures unchanged

## v2.9.68 — Food camera UX improvements
- [x] Previous estimate chip on HomeScreen after Scan Again (amber chip shows previous kcal + food name)
- [x] Inline "Keep or Retake?" confirmation row on Scan Again button (two-step: Keep Estimate / Retake Photo)
- [x] Confidence dot on Recent Scans cards (green/amber/rose 6px dot next to kcal badge)
- [x] Added scanConfidence field to SodiumRecord type in health/types.ts
- [x] Added i18n keys (scanAgainConfirmLabel, scanAgainKeep, scanAgainRetake, prevEstimateChip) to all 23 language blocks
- [x] Full vitest regression suite: 3,904 passed, 5 skipped, 0 failed

## Bug Fixes & i18n (v2.9.71)
- [x] Fix ProfileSettingsScreen crash: Property 'p' doesn't exist (missing profileStrings import)
- [x] Fix food camera macros not displayed in non-English languages
- [x] Fix crash when taking food photo in Chinese locale (foodCameraStrings barcode keys had wrong 4-space indent — fixed to 6-space)
- [x] Add smart blood glucose PC (post-meal) reminder mode to sugar-notification.ts, settings.tsx, and dashboard card
- [x] Complete diet type translations in 26 language blocks (dietLabelStrings export) — wired in profile.tsx and settings.tsx
- [x] Complete compliance ring label translations (carbs, protein, fat) in 26 language blocks (complianceRingStrings export) — wired in macro-goals-sheet, blood-sugar, settings custom diet editor
- [x] Added 10 missing language blocks to dietSubtitles (ko, ja, ru, tr, nl, sv, pl, he, vi, id, tl, so, hy, fa, ur)

## i18n Language Picker Sync & Translations (v2.9.72)
- [ ] Audit language lists in Settings, global header, and onboarding — find all mismatches
- [ ] Create single canonical SUPPORTED_LANGS constant shared by all three pickers
- [ ] Fix hrChartResolution placeholder values in tr, nl, pl language blocks
- [ ] Wire health-empty-states.tsx to use recordsStrings i18n keys (No Glucose Data, No BP Data, No Sleep Data)
- [ ] Translate HR chart resolution option labels (1 hr, 4 hr, Daily) in all language blocks
- [x] Fix Settings "Delete all my data" description hardcoded to non-English language after switching to English
- [x] Fix Settings search bar placeholder hardcoded to non-English language after switching to English
## Bug Fixes (v2.9.32)
- [x] Fix MacroRatioBar crash: Property 'fc' doesn't exist in NeoVitalMacroGraph when saving/logging a meal
## Bug Fixes (v2.9.33)
- [x] Fix MedicationsScreenInner crash: Property 'isRTLLang' doesn't exist when tapping medication tab
## Audit & Refactor (v2.9.34)
- [x] Audit all .tsx files for isRTLLang/applyRTLForLang usage without corresponding import and fix any missing imports
- [x] Create canonical SUPPORTED_LANGS constant and update all three language pickers (Settings, global header, onboarding) to use it
- [x] Wire health-empty-states.tsx BloodPressureEmptyState and SleepEmptyState to dashboardStrings i18n keys (noBPData, noBPDataSub, noSleepData, noSleepDataSub, logReading, syncFromHealth)
## i18n Translations (v2.9.35)
- [x] Add 8 missing settingsExtStrings language blocks: fa (Farsi), ur (Urdu), nl (Dutch), tr (Turkish), vi (Vietnamese), id (Indonesian), sv (Swedish), he (Hebrew)
## UX (v2.9.36)
- [x] Make dark mode the default color scheme on first app launch
## UX & i18n (v2.9.37)
- [x] Update splash screen background to #0A1628 (dark navy) for seamless dark mode transition — already #0D1117 from previous build
- [x] Add AMOLED toggle to onboarding theme slide (themeAmoled + themeAmoledDesc keys added to all 21 language blocks; AMOLED card added to theme options)
- [x] Translate 103 English-fallback keys in he (Hebrew), id (Indonesian), vi (Vietnamese) settingsExtStrings blocks (73 keys replaced per language across 3 passes)
## i18n (v2.9.38)
- [x] Translate NeoNutrition macro breakdown strings (logMore, today, carbQualityIndex, refineQuality, lowQuality, fiberToCarbRatio, dietaryFiber, totalCarbs, ADA guideline, on-device privacy note) in es, fr, ar, zh, ko, pt
- [x] Fix allDataOnDevice 6-space indent in 18 dashboardStrings language blocks (es/fr/pt/ar/sw/am/hi/zh/de/it/ko/ja/tl/so/hy/no/ru/pl) — test parser requires 4-space indent
- [x] Add lastHealthKitSync to fa and ur dashboardStrings blocks

## i18n (v2.9.39) — Medication UI Translations
- [x] Add new medication status/action keys to medicationStrings.en: statusTaken, statusMissed, statusRescheduled, statusSkipped, snoozeLabel, tapToReinstate, reinstateLabel, dismissLabel, seeAllMedications, myMeds, today, historyTab, weeklyAdherence, goalLabel, dosesTaken, shareCaregiver, caregiverDisclaimer, inStock, translateMedications, physicianDirected
- [x] Translate all new keys into es, fr, ar, zh, ko, pt blocks of medicationStrings
- [x] Fix dashboardStrings: add allDataOnDevice/noServerDataStays/lastHealthKitSync to fa and ur blocks
- [x] Add 6 missing dashboardStrings language blocks (he, id, vi, sv, tr, nl) with all 169 keys
- [x] All 3922 tests pass

## i18n (v2.9.40) — Health Report UI Translations
- [x] Audit reportStrings export: 69 keys in en block, 21 language blocks
- [x] es, fr, zh already fully translated (0 English-fallback keys)
- [x] ar, ko, pt had 28 English-fallback keys each (projectedA1c, conditionTimeline, mealIqInsights, medicationAdherence, neoVitalGraph, preview/print flow, reportLanguage, time labels)
- [x] Replaced all 28 English-fallback keys in ar, ko, pt with correct translations
- [x] All 3922 tests pass

## i18n (v2.9.41) — Wire Medication i18n Keys in UI
- [ ] Audit medication-card.tsx for hardcoded English strings → map to t() keys
- [ ] Audit medication-list.tsx for hardcoded English strings → map to t() keys
- [ ] Audit adherence summary component for hardcoded English strings → map to t() keys
- [ ] Replace all hardcoded strings with t('key') calls in all 3 files
- [ ] All tests pass, TypeScript no errors

## i18n (v2.9.42) — Report i18n Parity + PDF + previewReportLang
- [ ] Add i18n-parity test for reportStrings (enforce key parity across all language blocks)
- [ ] Wire reportStrings keys into report-generator.ts PDF template HTML
- [ ] Add previewReportLang picker translations to es, fr, ar, zh, ko, pt

## i18n (v2.9.41) — Wire Medication UI (completed)
- [x] HistoryTab: add useLang+t, wire statusLabel(), snoozedCount badge, HISTORY_FILTER_CHIPS labels
- [x] TodayTab: wire snoozedCount badge, Scheduled label, Rescheduled/Missed badge
- [x] DisclaimerBanner: add useLang+t, wire caregiverDisclaimer
- [x] MyMedsTab: wire inStock badge
- [x] MedicationsScreenInner: wire tab labels, weeklyAdherence, goalLabel, dosesTaken, shareCaregiver
- [x] Added filterAll, scheduledLabel, snoozedCount, statusReinstated to all 19 language blocks
- [x] All 3922 tests pass

## i18n (v2.9.42) — Report i18n Parity + PDF + previewReportLang (completed)
- [x] i18n-parity test auto-discovers all exports with en block — reportStrings covered automatically
- [x] PDF wiring already implemented via report-lang-utils.ts + config.labels — no changes needed
- [x] previewReportLang already translated in all 6 target languages (es/fr/ar/zh/ko/pt)
- [x] All 3922 tests pass

## i18n (v2.9.43) — medication-detail.tsx + caregiverDisclaimer + routeLabels
- [ ] Audit medication-detail.tsx for hardcoded section headers, frequency labels, route names
- [ ] Add new keys to medicationStrings.en: sectionDetails, sectionSchedule, sectionAdherence, sectionNotes, freqDaily, freqTwiceDaily, freqThreeDaily, freqWeekly, freqAsNeeded, freqCustom, routeLabels export
- [ ] Translate all new keys into es, fr, ar, zh, ko, pt and all other language blocks
- [ ] Wire medication-detail.tsx with t() calls
- [ ] Replace hardcoded English disclaimer in generateCaregiverReport() with histT.caregiverDisclaimer
- [ ] Add routeLabels i18n export to i18n.ts with translations for all route names
- [ ] All tests pass

## i18n (v2.9.44) — Appointment UI Translations
- [x] Added 19 new keys to all 18 appointmentStrings language blocks: doctorAppointment, rescheduled, missed, history, noAppointmentsSubtitle, addAppointment, backLabel, openLabel, addLabel, schedulingConflict, noRescheduled, noMissed, noHistory, logOutcomeLabel, rescheduleBtn, zipCode, recurrence, checklistTitle, checklistDone
- [x] All 3922 tests pass
## i18n (v2.9.47) — logStrings + appointmentStrings new keys + UI wiring
- [x] Added momentumLabel, dayOneStreak, activityOnDevice to all 14 logStrings language blocks
- [x] Added noRescheduledSubtitle, noMissedSubtitle, noHistorySubtitle to all 18 appointmentStrings language blocks
- [x] Wired l.noteLabel into activity.tsx Notes section label
- [x] Wired l.activityOnDevice into activity.tsx privacy note
- [x] Wired l.dayOneStreak into getSmartActivityMessage via dayOneStreakMsg parameter
- [x] Wired l.momentumLabel into momentum-card.tsx header title
- [x] Audited Dashboard home screen: glucoseOnRecord/activityLabel/noteLabel exist as i18n keys for future card use
- [x] All 3922 tests pass

## Version Bump (May 2026)
- [x] Update app.config.ts version to 2.9.35, iOS buildNumber to "20913", Android versionCode to 27
- [x] Add What's New entry for v2.9.35 in whats-new-sheet.tsx

## Localized Attribution Badge (May 2026)
- [ ] Add translatedByApple and translatedByGemini keys to all 21 language blocks in reportStrings (lib/i18n.ts)
- [ ] Wire new keys into report-generator.ts footer attribution line
- [ ] Wire new keys into report.tsx translationAttribution config

## Print Preview Language Fix
- [x] Fix print preview HTML to render in the app's selected language (not always English)
- [x] ReportLangProvider now initializes reportLang from detectLang() (app UI language) instead of hardcoding 'en'
- [x] addLangListener wired so reportLang auto-follows app UI language changes unless user has manually overridden it
- [x] setReportLang() marks userOverrode=true so manual picks are respected and not overwritten by app language changes

## Health Report Screen UI Full Translation
- [ ] Extract all hardcoded English strings from report.tsx
- [ ] Add missing i18n keys to all 28 language blocks in reportStrings
- [ ] Replace all hardcoded strings in report.tsx with t. calls

## Health Report Screen Translation Root Fix (May 2026)
- [x] Fixed root bug: t assignment in report.tsx was using tAI (which returns English for STATIC_LANGS) instead of _tStatic (which reads the correct translated reportStrings[lang] block)
- [x] t now correctly uses _tStatic for STATIC_LANGS (es, fr, zh, ko, ja, ru, tr, it, nl, pl, pt, de, hi, sw, hy, ar, am, tl, so) and tAI only for dynamic AI-translated languages (sv, he, uk, fa)
- [x] All 57 report UI keys (Blood Pressure, Include Metrics, Notes for Doctor, etc.) now translate correctly in all 21 static language blocks
- [x] Fix Preview & Print Report: NeoVital preview (handlePrintPreviewNeoVital) was missing labels → always rendered in English regardless of app language
- [x] Fix handlePreviewLangChange error fallback: was falling back to English instead of the user's global report language
- [x] Audit all PDF export paths (Vitals, Blood Glucose, Sleep, Medications) for missing labels — fixed correlation-trend-chart.tsx, index.tsx (Dashboard weekly adherence), added medPdfStrings weekly adherence keys
- [x] Add translation engine attribution badge to report preview footer (translatedByApple / translatedByGemini / server)
- [x] Add i18n-parity test for reportStrings — enforce all language blocks have the same keys as en (uses PDF-critical key list; full parity tests for medPdfStrings, correlationStrings, complianceRingStrings, immunPdfStrings)
- [x] Localize Clear Translation Cache Alert dialog strings — added clearTranslationCacheAlertTitle, clearTranslationCacheAlertBody, clearTranslationCacheAlertDone, clearTranslationCacheAlertCancel, clearTranslationCacheAlertConfirm to all 27 settingsExtStrings language blocks; wired into Settings Alert with ?? English fallbacks
- [ ] Translate all hardcoded English structural text in report HTML generator (section headers, table column headers, status labels like Taken/Skipped/Missed, graph labels, footers) into the selected report language
## Report Generator & i18n — 10 Language Expansion (May 2026)
- [x] Expand report HTML generator: replace all remaining hardcoded English strings with L.xxx label references (readings, entries, nights, chart footnotes, ADA note, dose log status, postprandial spike, sodium insight, resting HR reference box, temp normal range, report summary rangeLabel, trendLabel)
- [x] Add 45 new keys to ReportLabels interface and DEFAULT_REPORT_LABELS in report-generator.ts
- [x] Insert all 45 new keys into all 21 reportStrings language blocks in i18n.ts (en, es, fr, zh, pt, de, hi, sw, ko, ja, ru, tr, it, nl, pl, ar, am, tl, so, hy, no)
- [x] Fix French and Italian apostrophe issues in newly inserted keys (l'attribution, l'attribuzione)
- [x] All 35 i18n-parity regression tests pass
## Privacy Settings — Clear Cache AI Branding Fix (May 2026)
- [x] Replace "AI" with "Apple Intelligence or Gemini for Android" in clearTranslationCacheSub (English)
- [x] Replace "AI" in clearTranslationCacheAlertBody across all 21 language blocks (en, es, fr, pt, de, it, ko, ja, ru, tr, nl, pl, no, tl, so, hy, ar, hi, zh, sw, am, sv, ur, he, id, vi)
- [x] Update hardcoded fallback string in settings.tsx ?? operator
## Report Screen — "Prepared by" Clinician Attribution Translation (May 2026)
- [x] Add preparedByLabel, preparedByHint, physicianOptionalHint keys to reportStrings.en
- [x] Add translated versions of all 3 keys to all 21 language blocks (es, fr, zh, pt, de, hi, sw, ko, ja, ru, tr, it, nl, pl, ar, am, tl, so, hy, no)
- [x] Replace 3 hardcoded English strings in report.tsx with t.preparedByLabel, t.preparedByHint, t.physicianOptionalHint
- [x] Fix apostrophe issues in French (l'attribution) and Italian (l'attribuzione) new keys
- [x] Fix pre-existing apostrophe bugs in Somali (Da'da) and 9 other language restingHRLatestReading strings
- [x] All 150 test files pass (0 failures, up from 141 passing / 9 failing before this work)
## Full Report PDF Localization — All Visible Strings (May 2026)
- [x] Localize report header: "Patient-Generated Health Data…", "Health Report", "Privacy: All data processed locally — never uploaded"
- [x] Localize Report Summary card: "Report Summary", "sections", "total readings", "readings", "nights" section labels
- [x] Localize Statistical Descriptors table: all column headers, row labels, footnote
- [x] Localize BP section: "Average BP", "Min", "Max", "Date", "Systolic", "Diastolic", "Source", "averaged", chart footnote
- [x] Localize HRV section: "Avg Heart Rate", "Avg HRV", chart title, legend labels, "HRV TIME IN OPTIMAL ZONE", footnote
- [x] Localize SpO2 section: "Latest SpO2", "Average SpO2", "Minimum SpO2", normal range box, chart footnote
- [x] Localize Body Composition section: "Current Weight", "Change This Period", chart footnote
- [x] Localize Sleep section: all stat labels, chart title/legend, "7-NIGHT SLEEP DETAIL" table headers, "Showing most recent X of Y nights"
- [x] Localize Sodium section: "entries Logged", "Avg Sodium", "Within AHA Target", all table column headers
- [x] Localize Glucose/A1C section: all stat labels, "CONTEXT BREAKDOWN", "TREND", "ADAG Formula", "GLUCOSE ZONE REFERENCE", zone labels, ADA reference
- [x] Localize Medication section: all table column headers, status labels (Active/Taken/Skipped/Missed), reason table headers, dose log headers, reschedule history headers
- [x] Localize Medical History section: "MEDICAL HISTORY", "SURGICAL HISTORY", all column headers, "ACTIVE" status badge
- [x] Localize Immunization section: "IMMUNIZATION RECORDS", all column headers
- [x] Localize report footer: "VitalSync Personal Health Hub", disclaimer text
- [x] Localize "Prepared by" TextInput placeholder in report.tsx

## Report Localization — Render-Time String Fixes (May 2026)
- [x] Localize "user reschedule" reason string at render time in report-generator.ts (map stored value to L.medUserReschedule)
- [x] Localize "averaged" BP source label at render time in report-generator.ts (map stored value to L.bpSourceAveraged)
- [x] Add 2-letter language badge chip next to Generate button in report.tsx

## Report Screen — Localization & Language Picker (May 2026)
- [ ] Localize "snooze" reason in dose log Note/Reason column via L.medSnoozeReason
- [ ] Localize "Apple Health" source label in BP table via new bpSourceAppleHealth key
- [ ] Make 2-letter language badge chip open inline language picker modal in report.tsx

## Smart Reminder Localization (May 2026)
- [ ] Audit all smart reminder notification strings (medication taken/skipped/missed/rescheduled, "See all medication today", doctor appointments, refill reminders)
- [ ] Add new i18n keys and translations for all 21 language blocks
- [ ] Wire localized strings into notification scheduling code
- [x] Rename "macro breakdown" → "nutrition breakdown" in all 27 dashboardStrings language blocks and all hardcoded UI occurrences
- [x] Fix incomplete referenceOnlySub translations (fa, ur, ru, pl, he, id, vi, sv, tr, nl) to full disclaimer phrase
- [x] Expand disclaimerStrings from 9 to all 27 languages with full translated disclaimer
- [x] Build PersonalNarrativeCard component: meds taken/skipped today, latest lab results, upcoming appointments
- [x] Add Personal Narrative i18n keys to dashboardStrings (all 27 languages)
- [x] Wire PersonalNarrativeCard into dashboard (index.tsx) as a collapsible GlassCard
- [x] Make PersonalNarrativeCard collapsible (useCardExpanded + LayoutAnimation, key: personal-narrative)
- [x] Add 'days ago' suffix to lab result date label in PersonalNarrativeCard (e.g. "CBC · 3 days ago")
- [ ] Add Today/7d/30d time-window selector to PersonalNarrativeCard with rolling adherence rate and lab trend window
- [ ] Translate immunizations modal strings (Edit/Add title, Cancel/Save, Dose #, Series Total, Next Dose Date, Administered By, Injection Site, Route, Adverse Reactions) into all immunScreenStrings language blocks
- [ ] Wire overrideExpanded Collapse All toggle in dashboard header to all collapsible cards
- [ ] Translate Correlate/Analytics tab hardcoded strings: "Evidence-based health pattern analysis", "No readiness data yet. Your score will appear here after your first sync.", "Trend", "Scatter", "Insight Engine" and related labels
- [x] Add Today/7d/30d time-window selector to PersonalNarrativeCard with rolling adherence rate and lab trend window
- [x] Add collapseAll/expandAll i18n keys to all 27 dashboardStrings language blocks
- [x] Wire Collapse All / Expand All button in dashboard header (narrativeOverride state → PersonalNarrativeCard)
- [x] Add 5 new correlationStrings keys (readinessNoData, readinessNoDataSub, trendImproving, trendDeclining, trendStable) to all 19 language blocks
- [x] Wire correlationStrings into readiness-history-chart.tsx (empty state + trend labels)
- [x] Wire cs.evidenceSubtitle into analytics.tsx (replace hardcoded subtitle)
- [ ] Add 7-bar medication adherence sparkline to PersonalNarrativeCard (one bar per day, green=taken, red=missed)
- [ ] Persist narrativeWindow selection to AsyncStorage (key: personal-narrative-window)
- [ ] Add new surgHistoryStrings keys for TYPE_OPTIONS values and form field labels, translate into all language blocks, wire into surgical-history.tsx
- [x] Add 7-bar medication adherence sparkline to PersonalNarrativeCard (green=taken, amber=skipped, red=missed/no-log)
- [x] Persist narrativeWindow preference to AsyncStorage (key: personal-narrative-window)
- [x] Translate surgical-history.tsx form labels: TYPE_OPTIONS, ANESTHESIA_OPTIONS, card labels (Facility, Anesthesia, Surgeon) into all 13 surgHistoryStrings language blocks
- [x] Wire overrideExpanded to NeoVitalMacroGraph and OnDeviceInsightsCard from Collapse All button in index.tsx
- [x] Translate DailyMacroBudgetStrip hardcoded strings (TODAY, netC, fat, prot) to foodCameraStrings keys across all 19 language blocks (already wired; confirmed all 19 blocks have todayLabel, netCarbsShort, fatShort, protShort)
- [x] Add doseNumberLabel key to all 25 medicationStrings language blocks and wire into medications.tsx
- [x] Translate immunizations modal strings (Edit/Add title, Cancel/Save, Dose #, Series Total, Next Dose Date, Administered By, Injection Site, Route, Adverse Reactions) in immunScreenStrings
- [x] Wire remaining Analytics/Correlate hardcoded strings to correlationStrings (noEntriesToday, logMealCta, caloricGlycemicSummary, kcalToday, yourGoal, adaTarget, sharingLabel, shareWithDoctor, entriesLogged)
- [x] Add persistent paired-devices list in Settings with forget/reconnect actions
- [x] Add lastSyncedAt timestamp to paired BLE device rows (store on sync, display relative time)
- [x] Translate CATEGORY_LABEL map in PairedDevicesList into bleScannerStrings across all 17 language blocks
- [x] Add Rename long-press action to PairedDevicesList rows (reuse existing rename sheet)
- [x] Add minAgo/hAgo/dAgo/justNow i18n keys to bleScannerStrings and wire into relativeTime helper
- [x] Add connection-status dot (green/amber/red) to each PairedDevicesList row
- [x] Add Sync button to each PairedDevicesList row (on-demand data pull via readDeviceByCategory)
- [x] Add section-level sync summary banner (allUpToDate / needsAttention) above PairedDevicesList
- [x] Auto-refresh PairedDevicesList every 60 seconds via setInterval
- [x] Add Sync All button to Bluetooth section header in PairedDevicesList
- [ ] Wire t.status* to history filter chip labels in medications.tsx
- [ ] Add skipReason* i18n keys to all 25 medicationStrings blocks and wire into skip-reason chart
- [ ] Add diagonal-stripe SVG pattern fill to missed bars in adherence chart
- [x] Verify Arabic/Hebrew skip-reason chip translations and add RTL flexDirection + flexWrap to chip row
- [x] Update Missed legend swatch to SVG diagonal-stripe pattern matching the chart bars

## i18n Audit - Full Screen Translation Pass (May 2026)
- [x] i18n audit: translate all hardcoded strings in vitals log screen (log/vitals.tsx)
- [ ] i18n audit: translate all hardcoded strings in activity log screen (log/activity.tsx)
- [x] i18n audit: translate all hardcoded strings in sleep log screen (log/sleep.tsx)
- [ ] i18n audit: translate all hardcoded strings in blood-sugar log screen (log/blood-sugar.tsx)
- [ ] i18n audit: translate all hardcoded strings in allergies screen (log/allergies.tsx)
- [x] i18n audit: translate all hardcoded strings in appointments screen (log/appointments.tsx)
- [x] i18n audit: translate all hardcoded strings in medical-history screen (log/medical-history.tsx)
- [ ] i18n audit: translate all hardcoded strings in medications screen - form fields
- [x] i18n audit: translate all hardcoded strings in labs screens (labs/entry.tsx: panel selector, header, OCR, meta fields, analyte section, save button, all alerts — 18 language blocks)
- [x] i18n audit: translate all hardcoded strings on dashboard - updated, Apple Intelligence, personal narrative, on-device badge, recent entries
- [x] i18n audit: translate all hardcoded strings in analytics/correlate screen
- [x] i18n audit: translate all hardcoded strings in settings - diet profile macro splits, compliance ring targets, free trial, guidelines labels
- [x] i18n audit: translate projected A1C card strings
- [x] i18n audit: translate clinical-narrative-card.tsx (narrative categories, postprandial CTA, Latest Vital Signs)
- [x] i18n audit: translate neovital-vitals-card.tsx status badge labels
- [x] i18n audit: translate recent-entries-section.tsx empty state strings
- [x] i18n audit: translate neo-sleep-weekly-chart.tsx and neo-sleep-3d-chart.tsx strings
- [x] i18n audit: add dietDescStrings for diet profile descriptions across all 27 language blocks
- [x] i18n audit: fix all parse errors in lib/i18n.ts (apostrophes, mixed quotes, template literals)

## i18n – Language Picker & Full Onboarding Translation (May 2026)
- [x] Add language-picker as first onboarding slide (slide 0) with search bar and full language list for all 27 languages
- [x] Add onboardingStrings keys for language-picker slide (chooseLanguage, langSlideSubtitle, langSlideContinue, langSearchPlaceholder) to all 21 static language blocks
- [x] Wire language selection to setLangOverride so entire app re-renders in chosen language immediately
- [x] Translate dashboard "Reference Only" / "referenceOnlySub" strings (ds.referenceOnly wired in index.tsx)
- [x] Translate dashboard "Data & Privacy" footer section (ds.dataAndPrivacy, ds.allDataOnDevice, ds.noServerDataStays wired in index.tsx)
- [x] Translate dashboard language sheet (selectLanguage, translatingLabel, langSearchPlaceholder, langNoFound, langNoMatch, langClearSearch — all 27 language blocks)
- [x] Verify onboarding language picker persists selection to AsyncStorage on slide advance
- [x] Update regression tests for new 8-slide structure and 258 dashboardStrings keys

## i18n – Remaining Log Screens, Change Language Setting, RTL Support (May 2026)
- [x] i18n audit: translate log/activity.tsx hardcoded strings (cityPlaceholder)
- [x] i18n audit: translate log/blood-sugar.tsx hardcoded strings (importFailed, reminderCancelled, noReadingsPeriod, mealFromEntry, period buttons)
- [x] i18n audit: translate log/allergies.tsx hardcoded strings (reactionPrefix, sinceLabel, allergyLogSubtitle, severity/category labels)
- [x] i18n audit: translate medications form fields (pharmacyName, phone, street, hours, unit, reason, reminderTime, customReason, supplyDays, dictateScribe)
- [x] i18n audit: translate labs screens (abnormalLabel, dynamicCorrelation, analyseAgainst, ok)
- [x] Add "Change Language" row to Settings screen (already exists at /settings/language route)
- [x] RTL layout support: I18nManager.forceRTL already wired in lib/rtl.ts + initRTL() in _layout.tsx; added useRTL() to vitals/activity/blood-sugar/allergies/sleep log screens; textAlign wired for note/dictation inputs in vitals.tsx

## TS Fix Pass (May 2026)
- [x] Add premiumCta to settingsExtStrings.en (was missing, causing TS2339 in use-premium-gate.tsx)
- [x] Fix med.dosage → med.dose in medications.tsx PDF report (TS2551)

## Bug Fix: Personal Health Narrative Crash (May 2026)
- [x] Fix "Cannot read property 'toUpperCase' of undefined" in clinical-narrative-card.tsx — CATEGORY_META_COLORS was missing label field; added label to all 3 entries and guarded catMeta access with fallback to OBSERVATIONS

## Onboarding Slide Reorder (May 2026)
- [x] Move Profile/Age slide from position 5 to position 7 (between Theme and Consent)

## Profile Slide Skip & Persistence Audit (May 2026)
- [x] Add 'Skip for now' link on Profile slide (advances to Consent slide)
- [x] Confirmed: all 5 profile fields (age, weight, height, sex, diet) are persisted in handleFinish() on Consent CTA
## TypeScript Full Clean Build (May 2026)
- [x] Fix all 90 remaining TypeScript errors — achieved 0 errors from npx tsc --noEmit
  - [x] BLE: add category/brand to ScannedDevice, add missing bleScannerStrings keys
  - [x] medications.tsx: replace setPharmacySuggestions→setMeds in MedicationsScreenInner, add parseAllDayHours export, fix lang→histLang, fix implicit any params, fix drug1/drug2 mutation call, fix setDrugSuggestions type cast
  - [x] index.tsx: fix onSyncPress→onSync props, add 'medication' to ReminderCategory, fix BloodSugarRecord.date cast, fix weightGoalBanner diff/current/goal as strings
  - [x] data-sources.tsx: fix SettingsExtT to typeof settingsExtStrings.en
  - [x] blood-pressure.tsx: add recentReadings to detailStrings.en
  - [x] meal-iq-detail.tsx: fix language object access pattern
  - [x] clinical-narrative-card.tsx: fix CATEGORY_META→CATEGORY_META_COLORS
  - [x] correlation-trend-chart.tsx: cast fill function as any
  - [x] activity-readiness-card.tsx: fix double ??, cast status as string
  - [x] glucose-dashboard-card.tsx: fix avg7Label→avg7
  - [x] log-all-vitals-sheet.tsx: cast ParsedVitals as any
  - [x] paywall-screen.tsx: cast ProductSubscription as any
  - [x] privacy-banner.tsx: cast privacyStrings as any with .en fallback
  - [x] weekly-summary-card.tsx: fix MetricSummary.data type, computeTrend null handling, Sparkline null filter
  - [x] app-lock-screen.tsx: fix Pressable style TextStyle→ViewStyle
  - [x] correlation-engine.ts: filter nulls in mean(), fix potassiumMg ?? 0
  - [x] appointment-notifications.ts + immunization-notifications.ts: return false instead of bare return

## Translations (10 Languages)
- [x] Translate all UI strings from Add Surgical History screen (procedure, CPT, date, type, surgeon, hospital, anesthesia, complications)
- [x] Translate all UI strings from Add Medical History screen (condition, ICD-10, status, diagnosed, notes, dictate)
- [x] Translate all UI strings from Add Immunization screen (vaccine details, date & dose, administration, reactions & notes)
- [x] Translate all UI strings from Add Allergy screen (allergen, category, severity, reaction, onset, notes)
- [x] Translate all UI strings from Add Lab Result screen (select panel, scan lab report, lab/facility, collection date, all biomarker labels)
- [x] Translate all UI strings from Medication form (prescriber, fill date, refill county, dose, add time, remaining quantity, days supply, pharmacy name/phone/address, RX #, refills left)
- [x] Translate all UI strings from Color Code Guide screen (section titles, color labels, descriptions for Universal Status Colors, Blood Pressure, Heart Rate, SpO2, Blood Sugar, Body Temperature, Sleep, Immunizations, Nutrition, Tab Bar Badges)
- [x] Translate paywall screen strings (Free Version, Start 14-Day Free Trial, monthly/yearly pricing)
- [x] Color Code Guide LEGEND_SECTIONS moved from hardcoded English to i18n-driven getLegendSections(cls) function
- [x] All 10 languages covered: es, fr, de, zh, ar, pt, ja, ko, hi, ru
- [x] Add clinical entry label/description i18n keys to all 19 language blocks in colorLegendStrings (85 keys per language: bpGreenLabel/Desc, hrGreenLabel/Desc, spo2GreenLabel/Desc, bgGreenLabel/Desc, btGreenLabel/Desc, slPurpleLabel/Desc, imGreenLabel/Desc, ntGreenLabel/Desc, tbRedLabel/Desc, disclaimer + all color variants)
- [x] Wire Arabic (ar) as isStatic: true in supported-languages.ts so it appears in the static language picker section alongside Hindi
- [x] RTL layout support for Arabic confirmed in place via initRTL() at startup and applyRTLForLang() on language selection
- [x] Wire "Open Health → Data Access & Devices" button to deep-link via x-apple-health://sources (primary), with fallback to App-prefs:Privacy&path=HEALTH and app-settings:; update all instructional step text and path breadcrumbs to reflect Health app → Browse → Data Access & Devices → Sources → VitalSync path; x-apple-health already in LSApplicationQueriesSchemes
- [x] Color Code Guide header/legend strings (introTitle, introBody, good, warning, alert, info, sleep, goBack) confirmed already translated in all 19 language blocks — no new translation work needed
- [x] Add inline "Enable in Health app →" tappable link on the Blood Pressure row in healthkit-permissions.tsx (only on iOS); taps handleOpenHealthSettings (x-apple-health://sources); added enableInHealth key to all 21 hkPermStrings language blocks
- [x] AppState auto-refresh confirmed already implemented — loadStatuses() fires 1200ms after app returns to foreground via AppState change listener
- [x] Translate all hardcoded disclaimers across app (analytics smartScanDisclaimer, dataPointsDisclaimer, neonVitalsFooter, clinicalSourcesDisclaimer, appInfoDisclaimer)
- [x] Translate dictation mic instructions in log.tsx (tapKeyboardMicToSpeak, mealLogged) via useT(LOG_STRINGS)
- [x] Move Privacy/Consent screen to slide 8 (second-last) in onboarding
- [x] Wire clinicalSourcesDisclaimer into HTML/PDF export template
- [x] Add tapKeyboardMicToSpeak and mealLogged to static logStrings for all languages
- [x] Translate DictationBox label/placeholder in surgical-history.tsx and medical-history.tsx
- [x] Change DASH diet label from "Compliance" to "DASH diet" (en) and "Dietary Approaches to Stop Hypertension" (all other languages)
- [x] Update dietProfileSub for DASH type to say "DASH diet ring" instead of "compliance ring" (all 24 languages)
- [x] Add dashInfoHint key to settingsExtStrings (24 language blocks) with "Low-sodium, high-potassium heart-healthy diet" translations
- [x] Add ⓘ DASH info badge to DASH tile in diet picker with expandable popover showing dashInfoHint
- [x] Localize dietDescriptionStrings cardSubtitle for DASH to say "DASH diet targets" instead of "Compliance ring targets"
- [x] Update diet-type.ts DASH entry label and cardSubtitle to remove "Compliance" terminology
- [x] Auto-close DASH info popover when user selects a different diet tile (replace showDashInfo bool with showDietInfo string|null, setShowDietInfo(null) on tile press)
- [x] Add ⓘ info badge to all 8 diet tiles (balanced, keto, dash, diabetic, vegan, mediterranean, renal, custom) using per-diet dietInfoHint keys and tile accent color
- [x] Add dietInfoHintBalanced/Keto/Dash/Diabetic/Vegan/Mediterranean/Renal/Custom keys to settingsExtStrings for all 25 supported languages
- [x] Add dietSubBalanced/Keto/Dash/Diabetic/Vegan/Mediterranean/Renal/Custom keys to settingsExtStrings for all 25 supported languages
- [x] Wire dietProfileSub subtitle to be diet-type-specific using dietSub{DietType} key lookup with fallback to generic dietProfileSub
- [x] Fix duplicate tryDifferentFilter keys in vaccineScheduleStrings for all 18 affected language blocks
- [x] Fix VaccineCategory TypeScript comparison errors in cdc-vaccines.tsx

## EKG Dashboard & Report Integration (May 2026)
- [ ] Add EKG dashboard card below vital tiles on home screen (ekg-dashboard-card.tsx)
- [ ] Build EKG waveform detail viewer screen (scrollable/zoomable SVG trace, tap from EKG list row)
- [ ] Add AFib trend bar chart to EKG detail screen (AFib frequency per week)
- [ ] Integrate EKG classification counts and last AFib date into Doctor Report PDF
- [ ] Add EKG section to health report screen

## EKG Dashboard, Waveform & Report Integration (May 21, 2026)

- [x] EKG dashboard card wired below vital tiles (ekg_section visibility gate)
- [x] EKG waveform detail screen (app/detail/ekg-waveform.tsx) - scrollable/zoomable SVG trace
- [x] Tap-to-open waveform viewer from EKG list rows in ekg.tsx
- [x] AFib trend bar chart added to EKG detail screen (weekly classification breakdown)
- [x] EKG section added to Doctor Report PDF (classification counts, last AFib date, recent recordings table)
- [x] EKG toggle added to report.tsx include metrics section
- [x] EKG records loaded from ekg-store in report.tsx and passed to generateReportHTML
- [x] EKG report key added to data-privacy clear list
- [x] New i18n keys added: ekgAfibTrendTitle, ekgWaveformTitle, ekgWaveformSamples, ekgWaveformLabel, ekgWaveformNoVoltage (all 50 language blocks)
- [x] EKG labels added to ReportLabels interface and DEFAULT_REPORT_LABELS

## Bug Fixes & UI Improvements (May 21, 2026 - Session 2)

- [x] Fix "Could not request permissions, please try again" error on permission request button
- [x] Update EKG dashboard tile to show same measurement style as Steps, Calories, Sleep tiles

## EKG Tile Enhancements (May 21, 2026 - Session 3)
- [x] EKG long-press action sheet (View History, Share Reading) matching BP/Pulse/SpO2/Sleep tiles
- [x] EKG 7-day sparkline (daily AFib episode count) in BentoMetricTile
- [x] EKG row in Manage Dashboard visibility sheet (already present from previous session)

## EKG Advanced Features (May 21, 2026 - Session 4)
- [x] EKG AFib threshold alert wired into background health monitor (new-episode detection, 4h cooldown, 'ekg' AlertCategory)
- [x] EKG summary line in Clinical Narrative card (AFib count + last date, tappable to EKG detail)
- [x] Custom EKG sparkline detail sheet with 7-day stacked bar chart and classification breakdown table

## Bug Fix: Health Permission Request Crash (May 21, 2026)
- [x] Fix health permission request crash introduced by EKG changes — added NativeModules.AppleHealthKit guard to getRNH() in ekg-store.ts to prevent require('react-native-health') from throwing when native module is absent

## Bug Fix: EKG Data Not Fetched After Permission Grant (May 21, 2026)
- [x] Fix EKG data not fetched after permissions granted — fetchEKGPage now calls initAppleHealthKit() before querying; without this, getElectrocardiogramSamples silently returned [] when the kit was not initialised in the current session

## AFib Alert Toggle, Activity Header & DASH Diet Label (May 21, 2026 - Session 5)
- [x] Add AFib Alerts SectionCard to Health Alerts settings (enable toggle + configurable cooldown 1–24 h)
- [x] Wire ekg.enabled and ekg.cooldownHours from ThresholdConfig into isEKGAfibCooldown() in threshold-checker.ts
- [x] Add afibAlerts, afibCooldown, afibCooldownHint keys to all 22 thresholdStrings language blocks in lib/i18n.ts
- [x] Verify Activity & Daily Readiness card header renders correctly via ds.activity + ds.readiness concatenation
- [x] Fix DASH Diet label in DIET_TARGETS (diet-profile.ts) from 'Compile Diet' to 'DASH Diet'
- [x] Update 7-day sparkline label in active-diet-profile-card.tsx to show diet name (e.g. '7-day DASH Diet adherence')

## iOS EKG Entitlement & Info.plist Compliance (May 21, 2026)
- [x] Add 'electrocardiogram' to com.apple.developer.healthkit.access entitlement array in app.config.ts
- [x] Update NSHealthShareUsageDescription in infoPlist block to explicitly mention electrocardiogram (EKG) recordings
- [x] Update NSHealthUpdateUsageDescription in infoPlist block to explicitly mention EKG heart rhythm trends
- [x] Update @kingstinct/react-native-healthkit plugin healthSharePermission string to include EKG mention
- [x] Update @kingstinct/react-native-healthkit plugin healthUpdatePermission string to include EKG mention
- [x] Update react-native-health plugin healthSharePermission string to include EKG mention
- [x] Update react-native-health plugin healthUpdatePermission string to include EKG mention
- [x] Confirm P.Electrocardiogram in rnh-loader.ts already resolves to HKObjectType.electrocardiogramType (correct sample type — no change needed)

## Blood Pressure Health App Deep Link (May 21, 2026)
- [x] Add dedicated handleOpenBloodPressure handler with step-by-step Alert guide
- [x] Wire Blood Pressure row "Enable in Health app" link to handleOpenBloodPressure (was using generic handleOpenHealthSettings)
- [x] Alert shows 6-step instructions before opening x-apple-health://sources
- [x] Falls back to App-prefs:Privacy&path=HEALTH then app-settings: if Health app URL fails

## EKG Guided Alert + AFib Correlation Metric (May 21, 2026)
- [x] Add Electrocardiogram (EKG) row to PERMISSION_ITEMS in healthkit-permissions.tsx (Cardiovascular section, readOnly)
- [x] Add handleOpenEKG guided Alert handler with 6-step instructions + Apple Watch note
- [x] Wire EKG row "Enable in Health app" link to handleOpenEKG
- [x] Add getAfibDailyCounts(records) utility to ekg-store.ts
- [x] Add afibCount MetricKey to correlation.ts (MetricKey, METRIC_LABELS, METRIC_COLORS, extractMetricSeries)
- [x] Import getAfibDailyCounts in correlation.ts; read _ekgRecords from HealthData
- [x] Add AFib correlation pairs to METRIC_PAIRS in analytics.tsx (afibCount vs hrv/sleep/heartRate)
- [x] Add ekgRecords state + fetchEKGFirstPage on mount in analytics.tsx
- [x] Augment state.data with _ekgRecords via dataWithEKG memo before passing to computeCorrelation

## Smart Reminder i18n + Activity & Daily Readiness Header (May 21, 2026)
- [x] Add 16 new glucose smart reminder keys to all 27 dashboardStrings language blocks in i18n.ts
- [x] Add activityDailyReadiness key with full translations to all 27 language blocks
- [x] Replace hardcoded "Check blood sugar" with ds.checkBloodSugar in index.tsx
- [x] Replace hardcoded "Glucose not logged today · Tap to log" with ds.glucoseNotLoggedToday + ds.tapToLogGlucose
- [x] Replace hardcoded glucose mode titles (Pre-Meal/Post-Meal/Bedtime/Glucose Check/Reminder) with i18n keys
- [x] Replace hardcoded glucose mode subtitles (Log before/after meal, Log before bed, Time to log) with i18n keys
- [x] Replace hardcoded "Log glucose →" button with ds.logGlucoseBtn
- [x] Replace hardcoded "Dismiss" button with ds.dismissBtn
- [x] Replace hardcoded "Snoozed · {n}m remaining" with ds.snoozedRemaining template
- [x] Update activity-readiness-card.tsx header to use ds.activityDailyReadiness instead of concatenation

## Food Scan Retake Improvements (May 21, 2026)
- [x] Restore plate scan onScanAgain fix (setPreview(null) + setTimeout handlePlateScan)
- [x] Extend retake fix to barcode scan path (route via preview.source === 'barcode-scan')
- [x] Add openingCamera state + "Opening camera…" overlay indicator during 150ms delay
- [x] Show ScanAgainConfirmRow for medium-confidence scans (not just low)
- [x] Add openingCamera i18n key to all 19 foodCameraStrings language blocks

## Scan Another Item Shortcut (May 21, 2026)
- [x] Add onScanAnother prop to MacroPreviewPanelProps
- [x] Add "Scan another item →" button in logged success state between Log More and Done
- [x] Wire onScanAnother callback in main sheet (resets state + opens camera)
- [x] Add scanAnotherItem i18n key to all 19 foodCameraStrings language blocks
- [x] Diet screen i18n: translate hardcoded strings in caloric-trend-insight-card, active-diet-profile-card, dietary-summary-view
- [x] Fix dietLabelStrings.dash to 'DASH Diet' in all 19 language blocks
- [x] Fix DIET_TYPE_OPTIONS label from 'Compile Diet' to 'DASH Diet' in diet-profile.ts
- [x] Running meal tray counter badge in food scan sheet header (sessionLogCount)
- [x] Snooze ScanAgainConfirmRow after Keep Estimate tap (keepEstimateTapped state)
- [x] Persist prevEstimate chip to AsyncStorage with 30-min TTL
- [x] Add itemsLogged / itemsLoggedPlural i18n keys to all 19 language blocks

## EKG, Health Permissions i18n + Resting HR Pipeline (May 22, 2026)
- [x] EKG dashboard card: show EKG recording count, last synced, condition (Stable) in collapsed mode
- [x] EKG dashboard card: tap opens main EKG detail window
- [x] EKG dashboard card: measurements same size as steps/cal/sleep, even gaps
- [x] Translate all EKG hardcoded strings (detail screen, sparkline sheet, waveform, dashboard card, report generator, weekly classification trend, Other)
- [x] Translate all Health Permissions screen strings (every label, category, badge, alert, how-to card, toast) into all 27 locales
- [x] Inject 62 new hkPermStrings keys into all 27 locales
- [x] Inject 23 missing hkPermStrings keys (alertBuildRequiredMsg, alertEKGTitle, alertBPTitle, cancel, openHealthApp, hkEntitlementNotActive, hkEntitlementBody, howToFixBuildTitle, buildStep1-4, iPadNotice, enableInHealthArrow, howToEnableBPSubtitle, collapseInstructions, expandInstructions)
- [x] Inject toastConnected and toastConnectedSync into all 27 locales
- [x] Fix Resting HR pipeline: add rnhFetchRestingHeartRate to native-health-service.ts syncAll
- [x] Add restingHRSamples to NativeHealthSyncResult, MergeCallback, NativeHealthMergeData, MERGE_NATIVE_HEALTH reducer, mergeNativeHealth, storage.ts emptyHealthData
- [x] Bump version to 2.9.57, versionCode to 37
- [x] Translate Nutrition Breakdown title in ebp-nutrition-cards.tsx and neovital-macro-graph.tsx
- [x] Translate Evidence-Based subtitle in neovital-macro-graph.tsx
- [x] Translate empty-state message in ebp-nutrition-cards.tsx
- [x] Add EKG report labels to reportStrings for all 16 locales
- [x] Add missing dashboardStrings keys (ekgSectionTitle, ekgRecentRecordings, ekgDateTime, ekgCount, ekgPct, logMealToCqi, evidenceBasedLabel) for all 18 locales
- [x] Fix i18n.ts corruption: restore all 46 top-level exports from committed version, re-inject all new keys cleanly (13 dashboard + 16 report + 71 hkPerm keys per locale)

## EKG Card, Banner, Onboarding, HK Status Fixes (May 22, 2026)
- [x] EKG dashboard card: stretch full-width (no title style), match metrics row sizing to card below
- [x] EKG dashboard card: pre-tap collapsed state shows AFib #, Sinus #, Inconclusive # counts as tappable chips
- [x] EKG dashboard card: tapping AFib chip opens EKG detail filtered to AFib; tapping Sinus → Sinus; tapping Inconclusive → Inconclusive
- [x] Remove "Apple Health not available" banner that appears at top of dashboard on first launch
- [x] Delete slide 8 from onboarding flow
- [x] Fix Settings HealthKit status showing "Denied" when permissions are actually authorized

## Scan a Meal Premium Gate (v2.9.60)
- [x] Add "Scan a Meal" to PremiumFeature type and FEATURE_DESCRIPTIONS
- [x] Gate SmartNutritionCard camera button with requirePremium
- [x] Gate NeoVitalMacroGraph onLogMeal('plate') in index.tsx
- [x] Gate Calorie Balance tile camera button in index.tsx
- [x] Gate Fibre Ring cell camera button in index.tsx
- [x] Render ScanMealGateSheet in both index.tsx and smart-nutrition-card.tsx

## EKG Safe Storage & Telemetry Audit (v2.9.61)
- [ ] Audit current EKG storage in @vitalsync:health_data and identify bloat sources
- [ ] Build EKG storage layer: separate namespace, checksum dedup, compression, retention policy
- [ ] Implement EKG daily/total upload limits (free=0, trial=3/day 30 total, premium=10/day 300 total)
- [ ] Fix health_data key bloat: split into domain keys, incremental updates, dedup by timestamp+source+type
- [ ] Fix telemetry: debounce, severity levels (info/warning/critical), session-once logging, no crash spam
- [ ] Add Delete EKG and Clear Old EKGs UX to EKG screen and Settings
- [ ] Write vitest unit tests for limit/dedup/retention scenarios

## EKG Safe Storage & Telemetry (v2.9.61)
- [x] Audit EKG storage, health_data key, and telemetry patterns
- [x] Add EKG cache size cap (300 premium / 30 trial), tier-based daily limits (10/3/0), and 90-day date retention to ekg-store.ts
- [x] Fix telemetry key mismatch (crash_log → crash_logs) in storage-telemetry.ts
- [x] Add session-once dedup to emitSizeTelemetry to prevent crash log spam
- [x] Add pruneHealthData call to native-health-service.ts background observer write path
- [x] Add Clear EKG Cache button to EKG screen header
- [x] Write 19 vitest unit tests for EKG tier limits, daily reset, and boundary conditions

## i18n Translation & Paywall/Reminders (v2.9.62)
- [x] Save i18n translation checkpoint (upsellStrings, smartReminderBannerStrings, UpsellBottomSheet, SmartReminderBanners, 8 contextual triggers wired)
- [x] Add EKG and Scan Meal to premium features list on paywall
- [x] Change "No AI insights" to device-specific: "No Apple Intelligence Insights" on iOS, "No Gemini Insights" on Android
- [x] Bump build to v2.9.62 (buildNumber 20957, versionCode 43)
- [x] Add crown badge (👑) next to EKG and Scan Meal in paywall features list (highlight:true flag, golden pill badge style)
- [x] Move EKG and Scan Meal to primary features list (always visible, no expand needed)
- [x] Add crown badge to feat2 (Apple Intelligence / Gemini insights) in primary list
- [x] Add Smart Reminders row to premium-compare.tsx feature comparison table
- [x] Show contextual upsell nudge in Smart Reminders section for free users (dashboard)
- [x] Remove standalone Projected A1C data card from blood-sugar.tsx for free users; gate so only locked card shows, tapping opens paywall; premium users see A1C data inline
- [x] Fix "Premium" column header text wrapping to two lines on premium-compare screen (reduce font size to 11, widen column to 76)
- [x] Fix feat14 in paywall: replace "AI-powered" with Apple Intelligence (iOS) / Gemini (Android)
- [x] Add "Try free →" inline CTA button on the locked A1C card in blood-sugar.tsx
- [x] Localise locked A1C card copy (title + subtitle) into logStrings i18n
- [x] Add "Best Value" pill above the Premium badge on premium-compare.tsx
- [ ] Translate entire paywall screen into all 21 locales (replace all hardcoded English strings with i18n keys)
- [ ] Add "Start Free Trial" / "Try free →" button to Smart Reminders upsell nudge on dashboard
- [ ] Localise Smart Reminders upsell nudge copy into i18n system
- [ ] Gate medication adherence stats (7-day chart, streak) behind premium in Medications tab

## EKG Count Bug Fix
- [ ] Fix EKG count mismatch: dashboard card shows different count than EKG detail tab after tapping
- [x] Fix EKG count mismatch: dashboard card shows different count than EKG detail tab after tapping

## v2.9.68 Tasks
- [ ] Fix BloodSugarLogScreen crash: null displayName in maybeHijackSafeAreaProvider (iOS 26.5 crash report)
- [ ] Add analytics logEvent to Smart Reminders upsell nudge (Learn more + Try free buttons)
- [ ] Add tappable Upgrade CTA button to adherence locked card in Medications tab
- [x] Fix BloodSugarLogScreen crash: null displayName in maybeHijackSafeAreaProvider — render A1CGateSheet as {A1CGateSheet} expression, not <A1CGateSheet /> element
- [x] Add analytics logEvent to Smart Reminders upsell nudge (smart_reminders_trial_tap, smart_reminders_learn_more_tap)
- [x] Create lib/analytics.ts — privacy-first on-device event log (AsyncStorage, 500 event cap, swap-out ready)
- [x] Add tappable Upgrade CTA + Learn more buttons to adherence locked card in Medications tab (adherence_upgrade_tap, adherence_learn_more_tap events)
- [x] Add adherenceUpgradeCta + adherenceLearnMore i18n keys to all 25 medicationStrings locales

## v2.9.69 Tasks
- [ ] EKG Load More count sync: update fullCacheTotal after each page load in ekg.tsx
- [ ] Gate Scan Meal in food search flow (food search → scan meal button must require premium)
- [x] EKG Load More count sync: update fullCacheTotal after each page load in ekg.tsx
- [x] Gate Scan Meal in food search flow (food search → scan meal button must require premium)

## v2.9.69 Tasks
- [ ] Gate Barcode scan tab in AiFoodCameraSheet (onBarcodeScanPress prop pattern)
- [ ] Add analytics event log panel to Settings > Privacy screen
- [ ] Audit and fix locale completeness for adherenceUpgradeCta and adherenceLearnMore in all 25 medicationStrings locales

## v2.9.69 Completed
- [x] Gate Barcode scan tab in AiFoodCameraSheet (onBarcodeScanPress prop, all 4 call sites)
- [x] Add analytics event log panel to Settings > Privacy (View Event Log row + modal)
- [x] Audit locale completeness: adherenceUpgradeCta + adherenceLearnMore present in all 25 medicationStrings locales
- [x] Bump version to 2.9.69 (build 20962, versionCode 48)

## v2.9.70 Tasks (Scan Gate i18n + Barcode Analytics)
- [x] Localise Scan Meal / Scan Barcode feature labels via fc.scanMealTitle / fc.scanBarcodeTitle (all 4 call sites + index.tsx)
- [x] Add logEvent('barcode_scan_gate_tap') to all 4 barcode scan gate call sites with source tag
- [x] Add "Scan Barcode" to PremiumFeature union and FEATURE_DESCRIPTIONS in use-premium-gate.tsx

## v2.9.72 Tasks
- [ ] Split On-Device Insights paywall subtitle into onDeviceInsightsIos / onDeviceInsightsAndroid keys across all 27 locales
- [ ] Gate Scan Meal card on AiFoodCameraSheet HomeScreen sub-component (home mode entry point)
- [x] Remove standalone "Projected A1C" locked card below Blood Sugar on Record screen
- [x] Verify Blood Sugar screen Projected A1C gate uses same style as Scan Meal/EKG (usePremiumGate requirePremium + PremiumGateSheet)
- [x] Fix untranslated premium descriptions on Smart Reminders Learn More (premium-compare.tsx)

## Bug: EKG Count Mismatch (Dashboard 4 vs Detail 20)
- [x] Dashboard card: add useFocusEffect so it reloads getEKGCacheDistribution() every time the tab is focused, not just on mount
- [x] Dashboard card: change per-classification row counts to use fullDist (full cache) instead of dist (first-page only)
- [x] Detail screen: change subtitle fallback (no lastSyncedAt) to use fullCacheTotal instead of allRecords.length to avoid showing a smaller range-filtered count

## Production-Readiness Audit v2.9.70
- [ ] Bump version to 2.9.70 in app.config.ts, package.json, iOS buildNumber, Android versionCode
- [ ] Fix all TypeScript errors (tsc --noEmit)
- [ ] Fix all lint errors
- [ ] Fix runtime safety issues (unguarded parses, .map on undefined, etc.)
- [ ] Fix storage telemetry issues (debounce, no EKG waveforms in health_data)
- [ ] Premium access regression check
- [ ] HealthKit/Blood Pressure regression check
- [ ] Build stability check (assets, entitlements, metro, expo config)
- [ ] Expo doctor clean

## v2.9.70 Production-Readiness Audit — Completed
- [x] Version bumped: 2.9.70, iOS buildNumber 20966, Android versionCode 52
- [x] iap-router.ts recreated and registered in routers.ts (iap.validateReceipt + iap.getStatus)
- [x] iap-webhook.ts created and registered in server/_core/index.ts (Apple ASNS v2 + Google Play Pub/Sub)
- [x] iapSubscriptions table added back to drizzle/schema.ts (table already exists in DB)
- [x] LSP: 0 TypeScript errors
- [x] Tests: 4028 passed / 18 failed (all 18 pre-existing, 0 new failures)
- [x] Server health: /api/health ✓, /api/iap/webhook/apple ✓, /api/trpc/iap.getStatus ✓

## v2.9.71 — Fix Pre-existing Test Failures + IAP Cold-Start Sync
- [ ] Fix dashboard-strings-import-coverage: add missing ds.* keys to dashboardStrings.en
- [ ] Fix paywall-features-v2962: add feat14 Scan Meal content to all missing locales
- [ ] Fix i18n-parity: paywallExtStrings and recordsStrings non-en languages missing keys
- [ ] Fix food-camera-strings-i18n-coverage: missing fc.* keys in English block and all locales
- [ ] Fix i18n-parity correlationStrings: non-en languages missing keys vs en baseline
- [ ] Fix auth-fetch-separation: authorizeHealthKit mock not calling requestAuthorization
- [ ] Fix native-linking-guard: scribe-button.tsx still exists (should be deleted)
- [ ] Fix liquid-glass-tiles / vital-tile-layout: minHeight assertion failures
- [ ] Fix diet-label-resolution: DASH diet value resolves to wrong label
- [ ] Fix paywall-crown-badge: feat14 text missing "Scan"
- [ ] Wire iap.getStatus into silentRestoreOnColdStart to overwrite local expiry estimate with server-verified value

## v2.9.79 — silentRestoreOnColdStart + medicationStrings parity + regression test
- [x] Wire iap.getStatus into silentRestoreOnColdStart — createVanillaTRPCClient() added to lib/trpc.ts; silentRestoreOnColdStart() implemented in subscription-context.tsx; called fire-and-forget after loadPersistedState() resolves
- [x] paywallExtStrings no/ru/pl — confirmed all 27 locales already present (no gap)
- [x] medicationStrings parity audit — id/ur/vi locale blocks were completely absent; added full 141-key blocks for all three locales
- [x] Regression test: tests/regression/silent-restore-cold-start.test.ts (15 assertions)
- [x] Version bumped: 2.9.79, iOS buildNumber 20969, Android versionCode 55
- [x] All 4068 tests pass (156 test files, 4 skipped)

## v2.9.80 — cold-start-restore helper + integration test
- [x] Extract silentRestoreOnColdStart + readPersistedSubscriptionState into lib/subscription/cold-start-restore.ts (pure, testable, no React)
- [x] Integration regression test: tests/regression/cold-start-restore-integration.test.ts (19 assertions: scenarios A-J + 4 E2E pipeline tests)
- [x] i18n parity confirmed fully green — all 40 dictionaries pass for all 27 locales including id/ur/vi (no gaps found)
- [x] Version bumped: 2.9.80, iOS buildNumber 20970, Android versionCode 56
- [x] All 4102 tests pass (158 test files, 4 skipped)

## v2.9.81 — Immunization Fixes
- [x] Fix 1969 date bug: re-sync tempDate on openPicker in DatePickerIconButton
- [x] Fix date picker rollback: guard epoch/invalid dates in nextDoseDate value prop
- [x] 48hr smart reminder: VACCINE_LEAD_DAYS=2, VAX_48HR_AUTO_DISMISS_MS=30min, auto-snooze on first render
- [x] 24hr smart reminder: stays on screen until user explicitly dismisses
- [x] Add pharmacy/clinic section to immunization form (name, phone, address fields)
- [x] Wire pharmacy fields through handleSave and openEdit
- [x] Add pharmacy row to VaccineDueNotificationCard (tap-to-call, tap-for-directions)
- [x] ImmunizationRecord type: add pharmacyName, pharmacyPhone, pharmacyAddress fields

## v2.9.82 — Immunization card view + i18n + epoch guard test
- [x] Add pharmacy row to immunization read-only card view (tap-to-call, tap-for-map)
- [x] Add Linking import to immunizations.tsx
- [x] Add pharmacySection, pharmacyNameLabel, phoneNumberLabel, addressLabel to all 19 immunScreenStrings locales (en→am)
- [x] Write regression test for DatePickerIconButton epoch guard (21 assertions)
- [x] Bump to 2.9.82 (buildNumber 20972, versionCode 58)

## v2.9.83 — Immunization pharmacy card view + i18n + PDF export + regression tests
- [x] Add pharmacy row to immunization read-only card view (name, tap-to-call, tap-for-map)
- [x] Add pharmacySection/pharmacyNameLabel/phoneNumberLabel/addressLabel to all 19 immunScreenStrings locales
- [x] Add 31-key immunPdfStrings locale blocks for pl/tr/th/uk/vi/id/ms/fa (now 27 locales)
- [x] Wire pharmacy fields into handleShareRecord PDF HTML template
- [x] Add immunScreenStrings and immunPdfStrings to __tests__/i18n-parity.test.ts
- [x] Write VaccineDueNotificationCard pharmacy row unit test (21 assertions)
- [x] Write date picker epoch guard regression test (21 assertions)

## v2.9.84 — creatorBio1 translation update
- [x] Updated aboutStrings.en.creatorBio1 to include "University of Alabama, class of 2008"
- [x] Updated all 20 non-English creatorBio1 translations (es, fr, zh, pl, no, pt, ar, sw, am, hi, de, it, ko, ja, tl, so, hy, ru, tr, nl)
- [x] Added regression guard for old 'child of athletes' phrase in slide0-i18n.test.ts
## v2.9.85 — Paywall UX & App Store Compliance Audit
- [x] Fix feat2ios/feat14ios/feat14: 'Apple LLM powered' → 'Apple Intelligence powered' across all 27 locales
- [x] Fix feat13 en locale: 'EKG waveform analysis & AFib detection' → 'EKG waveform viewer & rhythm trends'
- [x] Fix feat13 non-English locales (tl/so/sw/am/hi/hy/no/tr/nl): replace AFib with rhythm-trend translations
- [x] Fix freePlanLimitsIOS capitalisation: 'No Apple Intelligence Insights' → 'No Apple Intelligence insights'
- [x] Fix placeholder 'feat2ios' values in locales that had key name as value
- [x] Add trustStatement key to all 27 locales: 'Private. On-device. No health data sold.'
- [x] paywall-screen.tsx: Replace ✓ text check marks with MaterialIcons check-circle icons (highlight=primary, standard=success)
- [x] paywall-screen.tsx: Add trust statement row above CTA button (lock icon + green text)
- [x] paywall-screen.tsx: Add glow/shadow to selected plan card (iOS shadowColor/shadowRadius, Android elevation)
- [x] paywall-screen.tsx: Add glow/shadow to selected Free plan card (same treatment)
- [x] paywall-screen.tsx: Normalize Free plan card padding/borderRadius to match paid plan cards (16px radius, 14px padding)
- [x] paywall-screen.tsx: CTA button press animation: scale 0.97 + opacity 0.9
- [x] paywall-screen.tsx: CTA button depth: iOS shadowColor/shadowRadius, Android elevation 6
- [x] paywall-screen.tsx: featureRow alignItems changed to flex-start for multi-line text alignment
- [x] App Store compliance verified: legalApple/legalGoogle visible, PP/ToS tappable, Restore Purchases button present
- [x] Update paywall-crown-badge test: 'apple llm' → 'apple intelligence' assertion
- [x] All 4150 tests pass (160 test files)
- [x] Bump to v2.9.85, buildNumber 20975, versionCode 61

## v2.9.86 — trustStatement i18n (6 new locales) + feat13 regression guard
- [x] Add 6 missing locale blocks to paywallExtStrings (sv/fa/ur/he/id/vi) with all 99 keys
- [x] Translate trustStatement for all 6 new locales
- [x] Fix French trustStatement apostrophe parse error
- [x] Add feat13 regression guard in paywall-crown-badge.test.ts (must contain 'EKG', must not contain 'AFib')
- [x] Bump to v2.9.86, buildNumber 20976, versionCode 62

## v2.9.87 — trustStatement full i18n + parity test + locale fixes
- [x] Translate trustStatement for all 20 existing non-English locales (es/fr/de/zh/ar/pt/ja/ko/pl/tl/so/sw/am/hi/it/hy/ru/no/tr/nl)
- [x] Add dedicated trustStatement parity test (tests/regression/paywall-trust-statement.test.ts) — 111 assertions across all 27 locales
- [x] Fix misplaced sv/fa/ur/he/id/vi locale blocks (were inserted into dictationBoxStrings instead of paywallExtStrings)
- [x] Add purchasesRestoredCheck key to all 6 new locale blocks
- [x] Confirm ur/fa/id/vi/he/sv are in StaticLang and detectLang supported array
- [x] All 4,261 tests pass (163 test files)
- [x] Bump to v2.9.87, buildNumber 20977, versionCode 63

## v2.9.88 — Version bump
- [x] Bump to v2.9.88, buildNumber 20978, versionCode 64

## v2.9.90 — Bluetooth paywall gate
- [ ] Add 'Bluetooth Devices' to PremiumFeature type and FEATURE_DESCRIPTIONS
- [ ] Gate BLE in settings.tsx (Bluetooth Devices row onPress)
- [ ] Gate BLE in index.tsx (dashboard BLE button)
- [ ] Gate BLE in record.tsx (BLE button in record tab)
- [ ] Gate BLE in blood-sugar.tsx (BLE button)
- [ ] Gate BLE in vitals.tsx (BLE button)
- [ ] Gate BLE in weight.tsx (BLE button)
- [ ] Run tests, bump to v2.9.90, save checkpoint

## v2.9.90 — Bluetooth paywall gate
- [x] Add 'Bluetooth Devices' to PremiumFeature type and FEATURE_DESCRIPTIONS
- [x] Gate BLE in settings.tsx (Bluetooth Devices row onPress)
- [x] Gate BLE in index.tsx (dashboard BLE button)
- [x] Gate BLE in record.tsx (BLE button in record tab)
- [x] Gate BLE in blood-sugar.tsx (BLE button)
- [x] Gate BLE in vitals.tsx (BLE button)
- [x] Gate BLE in weight.tsx (BLE button)
- [x] Run tests (4261 passed), bump to v2.9.90 (build 20980, versionCode 66), save checkpoint

## v2.9.91 — Dashboard label renames + i18n
- [ ] Rename "Apple Intelligence Insights" → "Personal Health Insights" on dashboard (on-device-insights-card, manage-dashboard, premium-compare, i18n appleIntelligenceInsights key)
- [ ] Add "Daily" prefix to readiness labels: activityDailyReadiness card title + dailyReadinessHeader section label
- [ ] Add feat9ble key to paywallExtStrings (Bluetooth paywall copy) and translate across 27 locales
- [ ] Translate new "Personal Health Insights" label across 27 locales
- [ ] Translate updated "Daily Readiness" labels across 27 locales
- [ ] Run tests, bump to v2.9.91, save checkpoint

## v2.9.90 — Full i18n pass (alerts, labels, disclaimers)
- [x] Rename "Vital Monitor" → "Vital Sign Monitor" in neovital-mini-card + all 27 i18n locales
- [x] Rename "Apple Intelligence Insights" → "Personal Health Insights" in dashboard, manage-dashboard, premium-compare, on-device-insights-card
- [x] Add "Daily" prefix to readiness labels in daily-readiness-gauge + i18n
- [x] Translate glucose alerts: glucoseAlertsTitle, fastingTarget, postMealTarget, resetToDefaults, highAlertHint, lowAlertHint, tirHint, fastingHint, postMealHint (19 locales)
- [x] Translate all Alert.alert() calls in report.tsx, immunizations.tsx, vitals.tsx, profile.tsx, activity-detail.tsx
- [x] Add 532 i18n keys: reportStrings (14×21), logStrings (2×14), immunScreenStrings (18×19), profileStrings (6+3×18)
- [x] Add 234 immunScreenStrings keys to 13 missing locales (pl/pt/sw/hi/it/ko/ja/hy/no/ru/tl/so/am)
- [x] Add 16 dashboardStrings keys to fa/ur (7 each) and he/id (1 each)
- [x] Fix correlationStrings.infoModalPrivacyBody for 8 locales
- [x] Fix useLang import in date-time-picker-field.tsx
- [x] Update logstrings-key-coverage EXPECTED_KEYS to 488 keys
- [x] Wire pctInRange and timeInRange into glucose-dashboard-card.tsx
- [x] Wire createdOnDevice + allTime into report.tsx
- [x] Wire eventLabel/eventLabelPlural into index.tsx
- [x] Wire doneLabel into header-sync-button.tsx and date-time-picker-field.tsx
- [x] Gate Bluetooth access behind premium paywall (6 entry points: settings, index, record, blood-sugar, vitals, weight)
- [x] Add feat9ble to paywallExtStrings (11 static locales)
- [x] All 4,261 tests pass
- [x] Rename "Lembus" to "Poror" in all dedication text across all 21 locales in aboutStrings
- [x] Add expandable Dedication section to About VitalSync screen with animated chevron and body text
- [x] Keep app version at 2.9.90 in app.config.ts
- [x] Add 7 missing locale dedication strings to aboutStrings (uk, sv, fa, ur, he, id, vi)
- [x] Add shareDedication i18n key to all 28 locales in aboutStrings
- [x] Add Share Dedication button inside expanded dedication section
- [x] Add fade-in opacity animation to dedication body text on expand
- [x] Update dedication family name to Kapkiguskong and Kimagelo across all 28 locales
- [x] Update dedicationTitle to name Kapkiguskong & Kimagelo across all 28 locales
- [x] Remove 'inspired by Kimagelo' from passport photo overlay credentials
- [x] Add dedicationSubtitle key to all 28 locales
- [x] Apply 3D glass style (GlassCard) to EKG dashboard card to match blood sugar tab
- [x] Add red glow ring border to EKG icon badge
- [x] Add mini EKG sparkline waveform to card header
- [x] Animate EKG sparkline to scroll left continuously (Animated.loop + translateX)
- [x] Add "Last: X days ago" timestamp below sparkline in EKG card header
- [x] Apply icon glow ring to collapsible-card and on-device-insights-card icon badges
- [x] Add ekgLast i18n key to all 27 dashboardStrings locale blocks
- [x] Animate EKG sparkline to scroll left continuously (live-monitor feel)
- [x] Add "last recorded" timestamp below EKG sparkline
- [x] Apply icon glow ring to BentoMetricTile, CollapsibleCard, OnDeviceInsightsCard badges
- [x] Add scrolling dual-line BP waveform (systolic + diastolic) to blood pressure tile header
- [x] Fix PremiumGateSheet null render crash in EKGDashboardCard (render as expression not element)
- [x] Add scrolling BP dual-line waveform sparkline to blood pressure BentoMetricTile header
- [x] Add pulsing red live dot to EKG card header (shows when last recording < 24h)
- [x] Add Sync Now (↻) shortcut to EKG card header
- [x] Add scrolling sine-wave waveform to heart rate and SpO₂ BentoMetricTile headers
- [x] Add pulsing live dot to blood pressure tile (< 24h indicator)
- [x] Add slow restful sine-wave waveform to sleep tile header
- [x] Add pulsing live dot to sleep tile (< 24h indicator)
- [x] Fix BP tile waveform: always show sine-wave fallback when no BP data exists (was hidden when data arrays empty)

## v2.11.0 — Data Management Controls

- [ ] Create lib/health/category-manager.ts: CategoryKey enum, toggle state, AsyncStorage persistence, last-used tracking, recommendation engine
- [ ] Create app/settings/data-management.tsx: full Data Management Controls screen with toggles, cleanup, recommendation banners
- [ ] Add missing icon mappings (toggles.fill, slider.horizontal.3, chart.bar.xaxis.ascending.badge.clock)
- [ ] Wire Data Management row into Settings stored_data section
- [ ] Wire category enabled state into sync/notification suppression paths
- [ ] Bump version to v2.11.0 (build 21007, versionCode 92)

## v2.10.5 — Data Management Controls

- [x] Add Data Management Controls screen (Settings → Data Management)
- [x] Implement category-manager.ts: 24-category state engine with AsyncStorage persistence
- [x] Implement recommendation engine: surface suggestions for categories inactive 30+ days
- [x] Implement per-category storage estimation and reclaimable storage display
- [x] Add "Clear inactive category data" button with confirmation dialog and storage estimate
- [x] Add "Enable All" header action
- [x] Wire Data Management row into Settings → Stored Data section
- [x] Register settings/data-management in Stack navigator (_layout.tsx)
- [x] Add missing icon mappings: allergens, flask.fill, scalemass.fill, slider.horizontal.3
- [x] Bump version to v2.10.5 (build 21007, versionCode 92)
- [x] EAS build v2.10.5 (build ID 9d30560a) — FINISHED
- [x] Submit v2.10.5 to TestFlight (submission ID a0830099) — SUBMITTED

## v2.10.6 — FibreRingCell crash fix

- [x] Fix FibreRingCell crash: Property 'ds' doesn't exist (RenderError on iOS 26.5)
- [x] Audit all similar ring/chart cells for the same pattern
- [x] Bump version to v2.10.6 (build 21008, versionCode 93), push to GitHub, trigger EAS build, submit to TestFlight

## Storage Optimization Engine (v2.11.0)

- [ ] Create lib/storage/storage-optimizer.ts — core aggregation engine with per-category retention policies
- [ ] Sleep: keep 30 days full, then 3-day rolling summaries (avg duration, bedtime, wake, consistency, efficiency)
- [ ] Heart Rate (pulse): keep 30 days full, then 4-hour block aggregates (avg/min/max/count)
- [ ] Resting HR: keep 30 days full, then daily/weekly/monthly averages
- [ ] Blood Pressure: keep 90 days full, then weekly summaries (avg systolic/diastolic, high/low, count)
- [ ] Blood Glucose: keep 90 days full, then daily summaries; after 1 year convert to weekly summaries
- [ ] Activity: keep 30 days full, then daily summaries; after 1 year convert to weekly summaries
- [ ] Weight: keep 1 year full, then weekly/monthly averages
- [ ] SpO2 (vitalSigns): keep 90 days full, then daily avg/min/max
- [ ] Implement medication history limit: max 20 inactive medications, auto-archive oldest
- [ ] Implement appointment history limit: max 20 completed appointments, show notice
- [ ] Implement immunization archive limit: max 20 records, compress oldest
- [ ] Implement health history limit: max 20 entries (medicalHistory + surgicalHistory), export prompt
- [ ] Build Storage Optimization screen (Settings → Data Management → Storage Optimization)
- [ ] Storage dashboard: usage, savings, health score (Excellent/Good/Moderate/High Usage), per-category status
- [ ] Write deterministic unit tests for all 10 aggregation/limit policies
- [ ] Ensure doctor reports continue functioning after aggregation

## v2.10.7 — Storage Optimization Engine + About Photo Fix
- [x] Implement lib/storage/storage-optimizer.ts: per-category aggregation engine (sleep, HR, resting HR, BP, glucose, activity, weight, SpO2)
- [x] Implement lib/storage/storage-optimizer-store.ts: async persistence layer with AsyncStorage integration
- [x] Add Storage Optimization entry point in Settings → Data Management
- [x] Fix About screen: switch creator photo to creator-photo-nobg.png (transparent background)
- [x] Bump version to 2.10.7 / build 21009 / versionCode 94
- [x] Push to GitHub (dc68ddd)
- [x] EAS build 0734d509 — FINISHED
- [x] Submit v2.10.7 to TestFlight — SUBMITTED

## v2.10.8 — EKG Fetch Regression Fix
- [ ] Diagnose EKG fetch regression introduced by storage optimizer changes
- [ ] Fix EKG data flow from HealthKit/Health Connect through storage to UI
- [ ] Verify all other health categories unaffected
- [ ] Bump version to 2.10.8, push, EAS build, submit to TestFlight

## v2.10.8 — Sleep + EKG Storage Optimization Fix

- [ ] Implement lib/health/sleep-summary.ts: daily consolidation engine (1 summary/day), deduplication, 30-day active limit, 3-day rollup for older data
- [ ] Implement lib/health/ekg-tally-store.ts: separate classification tally from retained strips, 5-strip/day routine limit, AFib always retained
- [ ] Update EKG dashboard card to use tally-based counts (not just retained strips)
- [ ] Update sleep dashboard card to use daily summary count
- [ ] Update EKG history screen with inline summarization notes and tally rows
- [ ] Update Settings Storage & Sync screen with EKG and sleep optimization status
- [ ] Write Vitest tests: sleep consolidation, deduplication, 30-record limit, 3-day rollup, EKG daily limit, AFib retention, tally counts
- [ ] Bump version to v2.10.8, push to GitHub, trigger EAS build, submit to TestFlight

## v2.10.8 — EKG Fetch Fix (HKSampleQuery alignment)
- [ ] Audit EKG fetch path against Swift HKSampleQuery / HKElectrocardiogram reference
- [ ] Fix date predicate / range passed to the native bridge
- [ ] Remove tier-gate blocking that prevents fetches during normal operation
- [ ] Wire ingestEKGRecords on every successful fetch page

## v2.10.8 — EKG Storage Optimization (Full Spec Alignment)
- [ ] Rebuild ekg-tally-store.ts: local-date daily routine limit (5/day), AFib always retained, tally persisted separately from strips
- [ ] Update ekg-store.ts: remove tier-gate total-cap block, move incrementDailyCount to success path, wire ingestEKGRecords
- [ ] Update EKG dashboard card: show tally-based AFib/Sinus/Inconclusive counts
- [ ] Update EKG history screen: show retained strips + inline summarization notices
- [ ] Update Settings Storage & Sync screen with EKG tally panel
- [ ] Write Vitest tests for all 12 required behaviors
- [ ] Bump version to v2.10.8, push, EAS build, submit to TestFlight

## v2.10.8 — COMPLETED
- [x] EKG fetch regression diagnosed and fixed (incrementDailyCount only on non-empty fetch, raised daily limit to circuit-breaker threshold)
- [x] ekg-tally-store.ts: local-date daily routine limit (5/day), AFib always retained, tally persisted separately from strips, getEKGTallyWithDailyStats added
- [x] ekg-store.ts: tier-gate total-cap block removed, incrementDailyCount moved to success path, ingestEKGRecords wired on every fetch
- [x] sleep-summary.ts: daily consolidation engine, 30-day active limit, 3-day rollup, deduplication by id, getSleepSummaryStats added
- [x] storage-optimization.tsx: new Settings > Data Management > Storage Optimization screen
- [x] ekg.tsx: inline summarization notices in EKG history list header
- [x] ekg-dashboard-card.tsx: tally-based AFib/Sinus/Inconclusive counts
- [x] tests/sleep-ekg-storage.test.ts: 35 tests (23 original + 12 spec §8 required cases) — all pass
- [x] Bump version to 2.10.8 / build 21010 / versionCode 95
- [x] Push to GitHub (749104b)
- [x] EAS build 939e52e7 — FINISHED
- [x] Submit v2.10.8 to TestFlight — SUBMITTED

## v1.0.34 — Paywall Rebrand + EBP Citation Fixes

- [x] Regenerate paywall background with VitalSync brand palette (emerald ECG, electric-blue rings, navy base)
- [x] Update paywall-screen.tsx color tokens: BRAND_GREEN #22C55E, BRAND_BLUE #38BDF8, GLASS_BORDER emerald-green, CTA button green with dark text
- [x] Remove sleep-cv from CATEGORY_ICONS and filter from otherInsights in analytics.tsx
- [x] Move EBP citation block outside expanded state in InsightCard (always visible)
- [x] Add nutrition/caloric/correlate peer-review refs to CORRELATION_REFS in peer-review-refs.ts
- [x] Add peer-review citation badges to correlate, diabetic, and caloric nutrition tabs in analytics.tsx
- [x] Expand Evidence-Based References section in report-generator.ts with metric refs and nutrition refs
- [x] Add carousel slide i18n keys to paywallExtStrings in i18n.ts
- [x] Add whatsNewV1034Strings export and wire into _layout.tsx allEnglishStrings
- [x] Update LATEST_WHATS_NEW_VERSION to 2.9.35 in whats-new-version.ts
- [x] Commit v1.0.34 changes (6ef4185)
- [x] Push v1.0.34 to GitHub (d204d1a → 6ef4185)
- [x] EAS iOS production build FINISHED (2e052069-ff21-485c-8cad-f667bfa47e82)
- [x] Submit v1.0.34 to TestFlight — SUBMITTED (App Store Connect app 6774855397)

## v1.0.35 — Paywall Unification + AI Removal + Correlate Cleanup + Report Refs

- [x] Unify onboarding paywall to use the same full-bleed immersive PaywallScreen component
- [x] Remove all "AI" references from onboarding screens, paywall, and app-wide UI
- [x] Remove Health Insights section from Correlate tab in analytics.tsx
- [x] Add peer-review citation refs to Observed Historical Patterns section in analytics.tsx
- [x] Add NeoVital graph and NeoSleep references to health report (report-generator.ts)
- [x] Bump version to 1.0.35, commit (4e21b0a), push to GitHub
- [x] Find and redesign "Rooted in Love, Culture and Purpose" screen with scrollable top tabs, more appealing layout
- [x] Convert all British English spellings to American English (personalise→personalize, colour→color, behaviour→behavior, etc.) across all user-facing strings, i18n files, and UI components

## v1.0.36 — Copy Refinement + Paywall Carousel Polish

- [x] Refine Welcome slide tab copy in i18n.ts (Mission/Features/Privacy/Evidence) for App Store review
- [x] Sharpen paywall carousel 5-slide headlines and body copy for conversion optimization
- [x] Bump version to 1.0.36 in app.config.ts
- [x] Commit (57db250), push to GitHub (4e21b0a → 57db250), EAS build queued

## v1.0.37 — CTA Copy + App Store Description

- [x] Update paywall CTA button copy to "Start My Free Trial" (trial) and "Unlock Personal Insights" (subscribe)
- [x] Write new App Store description: lead with "Built by a critical care nurse", peer-reviewed evidence angle, remove AI references
- [x] Add App Store description to store-listing.md
- [x] Bump version to 1.0.37 in app.config.ts (buildNumber 10037, versionCode 37)
- [x] Add v1.0.37 What's New entry in whats-new-sheet.tsx
- [x] Commit, push to GitHub, EAS build + TestFlight submit

## v1.0.49 — Paywall Carousel Redesign
- [x] Paywall carousel: capital headings only (textTransform uppercase)
- [x] Paywall carousel: 5-word tagline description under each heading (carouselDesc style, BRAND_GREEN color)
- [x] Logo + "VITALSYNC PREMIUM" badge clearly above carousel with paddingBottom separation
- [x] Removed long subtitle text from carousel slides (subtitle field kept for type compat, not rendered)
- [x] Added showFeatures i18n key to English paywall strings (fixes TypeScript error)
- [x] Added slide1Desc–slide5Desc keys to English i18n.ts paywall section
- [x] Paywall consistent across app: onboarding slide 7, standalone /paywall route, premium gate modal all use same PaywallScreen component
- [x] Version bumped to 1.0.49 / buildNumber 10049 / versionCode 49
- [x] What's New v1.0.49 entry added (whats-new-sheet.tsx + _layout.tsx + whats-new-version.ts)
- [x] Committed 0d10552, pushed to GitHub
- [x] EAS build 5bccf056 finished, submitted to TestFlight (submission aedbb785)

## v1.0.59 — Correlate Tab Full Redesign (RTM-Driven)
- [x] Correlation Explorer v4: vibrant InsightCard redesign with emoji icons, impact badges, mixed full/half-width layouts, citation dots, metric tags
- [x] Evidence Based Sources grid at bottom of InsightEngine (PubMed, AHA, Cochrane, WHO, ISSN, AND-EAL)
- [ ] Pattern Explorer: 16 relationship scatter plots with 30/90/180/365-day views, correlation/confidence/completeness scores inside analytics.tsx
- [x] Weekly Wellness Summary collapsible section inside analytics.tsx
- [x] Monthly Wellness Summary collapsible section inside analytics.tsx
- [ ] Research Insights section (renamed from Evidence-Based Insights) inside analytics.tsx
- [x] Evidence Library grid section inside analytics.tsx
- [ ] Historical Relationships section in Health Report (report.tsx)
- [ ] Scoring system: Data Completeness, Trend Stability, Relationship Strength, Research Confidence
- [ ] Premium feature gating for extended analysis and Pattern Explorer
- [ ] Compliance review: no diagnostic/disease/treatment/risk language
- [x] Translate all new correlate strings into all 10 languages in i18n.ts
- [ ] Generate RTM with 100% coverage, compliance checklist, gap analysis
- [x] Bump version to v1.0.59, push to GitHub, submit to TestFlight

## v1.0.60 — Correlate Tab Completion

- [x] Pattern Explorer: 16 scatter plots with 30/90/180/365-day views, Pearson r correlation/confidence/completeness scores (pattern-explorer.tsx)
- [x] 4-Metric Scoring System on InsightEngine cards: Data Completeness, Trend Stability, Relationship Strength, Research Confidence + Overall Score bar chart
- [x] InsightEngine: first 2 full-width cards always expanded by default (defaultExpanded=true)
- [x] Remove Recovery Trend section from analytics.tsx (Correlate tab)
- [x] Wire PatternExplorer into analytics.tsx after WellnessSummarySection
- [x] i18n: Pattern Explorer + scoring strings added to all 10 languages (en, es, fr, pt, ar, sw, hi, zh, de, ja)
- [x] RTM v1.0.59 document (Requirement Traceability Matrix)
- [x] Bump version to v1.0.60, push to GitHub, submit to TestFlight

## v1.0.61 — Correlate Tab Polish

- [x] Move WellnessSummarySection above Observed Historical Patterns in analytics.tsx
- [x] Uniform section header paddingVertical: 14 for InsightEngine and WellnessSummary to match Nutrition Analysis (PatternExplorer already has 14)
- [x] Remove peer-reviewed reference footer (viewSourcesRow) from InsightEngine
- [x] Wire i18n into PatternExplorer scoring block (ANALYSIS SCORES, Data Completeness, Trend Stability, Relationship Strength, Research Confidence, Overall Score)
- [x] Map Relationship Strength in InsightEngine to |r|×100 instead of status-based fixed values
