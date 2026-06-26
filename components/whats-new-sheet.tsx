/**
 * WhatsNewSheet
 *
 * A polished bottom sheet showing the latest VitalSync release notes.
 * All UI chrome and release note content are translated via useT() so the
 * sheet renders in the user's active language (including Smart languages).
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useT, STATIC_LANGS } from "@/lib/i18n-ai";
import { detectLang } from "@/lib/i18n";

// ─── Translatable string records ──────────────────────────────────────────────
// All text is defined as English constants and passed through useT() so the
// Smart translation system can render them in any of the 20 supported languages.

/** UI chrome strings (header, button, footer, section labels) */
export const whatsNewUiStrings = {
  title: "What's New",
  gotIt: "Got it — Let's Go!",
  footer: "Thank you for using VitalSync 💙",
  labelNew: "New",
  labelImproved: "Improved",
  labelFixed: "Fixed",
} as const;

/** Release note content — v2.3.65 (current TestFlight build) */
export const whatsNewV2365Strings = {
  version: "2.3.65",
  date: "March 2026",
  headline: "Stability & What's New",

  // Fixed
  f1Title: "TestFlight Launch Crash Fixed",
  f1Desc: "Resolved a cold-launch crash on iOS caused by react-native-maps not supporting the New Architecture. The map library has been removed and replaced with a lightweight GPS summary card.",
  f2Title: "HealthKit Nitro Bridge Guard",
  f2Desc: "Added a safe loader for the HealthKit module that checks the NitroModules C++ bridge is ready before initialising — preventing a rare but fatal crash on first launch.",
  f3Title: "New Architecture Re-enabled",
  f3Desc: "All native modules have been audited and confirmed compatible with React Native New Architecture (TurboModules/Fabric). The app now runs on the faster bridge.",

  // New
  n1Title: "What's New in Settings",
  n1Desc: "A dedicated \"What's New\" row now lives inside Settings → Notifications. A green dot appears whenever a new version is installed — tap to see what changed.",
  n2Title: "EAS Build Hardening",
  n2Desc: "Fixed an EAS build validation error caused by empty environment variable placeholders. All optional API keys (Oura, Garmin) are now managed via the EAS Secrets dashboard.",

  // Improved
  i1Title: "Crash Reporting Removed",
  i1Desc: "Third-party crash reporting has been removed. All error handling is now fully on-device with no data sent to external services.",
  i2Title: "react-native-nitro-modules Explicit Dep",
  i2Desc: "Added react-native-nitro-modules as an explicit package dependency so EAS builds always include the correct native pod for HealthKit's JSI bridge.",
} as const;

/** Release note content — v1.0.59 */
export const whatsNewV1059Strings = {
  version: "1.0.59",
  date: "Jun 2026",
  headline: "Correlate Tab Redesign — Vibrant Glassmorphism",

  // New
  n1Title: "Vibrant Glassmorphism Insight Cards",
  n1Desc: "The Correlate tab is fully redesigned with colorful 3D glossy glass cards, emoji icons, impact badges (High / Moderate / Low), citation dots, metric tags, and a mixed full/half-width card layout.",
  n2Title: "Evidence Library Grid",
  n2Desc: "A new Evidence Library section displays all 6 evidence-based correlations in a scannable grid with source citations and expandable detail cards.",
  n3Title: "Weekly & Monthly Wellness Summary",
  n3Desc: "New collapsible Wellness Summary section shows 7-day and 30-day historical averages for all tracked vitals — blood pressure, heart rate, sleep, glucose, weight, steps, sodium, and HRV.",

  // Improved
  i1Title: "Full i18n — All 10 Languages",
  i1Desc: "Every new string in the Correlate tab redesign is fully translated into Spanish, French, German, Chinese, Arabic, Portuguese, Japanese, Swahili, and Hindi.",
} as const;

/** Release note content — v1.0.73 */
export const whatsNewV1073Strings = {
  version: "1.0.73",
  date: "Jun 2026",
  headline: "Paywall Pricing Update · Feature List Refresh",
  // Changed
  c1Title: "New Pricing: $49.99/yr or $4.99/mo",
  c1Desc: "The Premium subscription is now $49.99 per year ($4.17/mo billed yearly) or $4.99 per month. Best Value badge on the annual plan.",
  c2Title: "Dynamic Trial CTA",
  c2Desc: "The subscribe button now shows trial copy (\"Try free for {days} days\") only when the App Store confirms you are eligible. Otherwise a direct subscribe CTA is shown.",
  c3Title: "Updated Feature List",
  c3Desc: "The Premium feature list is refreshed to 11 items: Advanced wellness insights, Projected A1C estimates, Medication reminders, Appointment reminders, Health report exports, Nutrition analysis, Wellness correlations, Apple Health data import, Dashboard customization, Multi-language support, and Secure personal health tracking.",
  // Fixed
  f1Title: "Compliance: EKG Wording Removed",
  f1Desc: "Paywall slide 3 title updated from clinical EKG wording to \"Apple Health ECG History\" to comply with Apple Guideline 1.4.1.",
  f2Title: "Loading & Error States Improved",
  f2Desc: "Loading text now reads \"Loading subscription options…\". If prices fail to load, a clear error message and retry button appear. Purchase buttons are disabled until products are loaded.",
} as const;

/** Release note content — v1.0.72 */
export const whatsNewV1072Strings = {
  version: "1.0.72",
  date: "Jun 2026",
  headline: "Dynamic Trial Eligibility · Guideline 2.1(b)",
  // Fixed
  f1Title: "Trial CTA Now Reflects Your Eligibility",
  f1Desc: "The paywall, onboarding, and all upsell screens now read your introductory offer eligibility directly from the App Store. \"Start 14-Day Free Trial\" only appears when Apple confirms you are eligible — otherwise a direct Subscribe CTA is shown.",
  f2Title: "All Screens Updated",
  f2Desc: "Analytics, Blood Sugar A1C, Dashboard customisation, Purchase Success, and Premium Compare screens all now reflect your real StoreKit eligibility instead of hardcoding trial text.",
  f3Title: "New No-Trial Fallback Strings",
  f3Desc: "Added 30 new translated strings across all 10 languages for the no-trial-eligible state, ensuring every user sees accurate, localised subscription copy.",
} as const;
/** Release note content — v1.0.71 */
export const whatsNewV1071Strings = {
  version: "1.0.71",
  date: "Jun 2026",
  headline: "Subscription Management Rebuilt",
  // Fixed
  f1Title: "Restore Purchases Now Works",
  f1Desc: "Tapping \"Restore Purchases\" now immediately contacts the App Store, shows a loading indicator, and displays a success or informative message when complete.",
  f2Title: "Current Plan Section Added",
  f2Desc: "The Manage Subscription screen now shows your plan name (Monthly / Annual / Free), status (Active / Expired), renewal date, original purchase date, and auto-renew status.",
  f3Title: "Manage in App Store Button",
  f3Desc: "A direct \"Manage in App Store\" button opens Apple\u2019s native subscription management screen so you can cancel or change your plan without leaving the app.",
} as const;

/** Release note content — v1.0.70 */
export const whatsNewV1070Strings = {
  version: "1.0.70",
  date: "Jun 2026",
  headline: "Cleaner Health Reports · No Food Logs or Citations",
  // Changed
  c1Title: "Food Logs Removed from Printed Report",
  c1Desc: "The Sodium/DASH table in your health report no longer includes Meal Context or Food Description columns. Sodium and Na:K summary stats are still shown.",
  c2Title: "Medical References Section Removed",
  c2Desc: "PubMed citations and methodology references no longer appear in the printed report, keeping it concise and focused on your health data.",
  c3Title: "Meal IQ Off by Default",
  c3Desc: "The Meal IQ Insights section is now excluded from reports by default. You can still enable it via the toggle on the Report screen.",
} as const;

/** Release note content — v1.0.69 */
export const whatsNewV1069Strings = {
  version: "1.0.69",
  date: "Jun 2026",
  headline: "Guideline 2.1(b) Fix · Purchase Sheet Now Works",
  // Fixed
  f1Title: "StoreKit Purchase Sheet Now Appears",
  f1Desc: "Tapping \"Start 14-Day Free Trial\" and \"Unlock Premium Features\" now correctly launches the Apple subscription purchase sheet on iPhone and iPad.",
  f2Title: "Visible Error When Prices Fail to Load",
  f2Desc: "If subscription prices cannot be loaded from the App Store, a clear error message and a Retry button now appear on the paywall instead of a silent failure.",
} as const;

/** Release note content — v1.0.68 */
export const whatsNewV1068Strings = {
  version: "1.0.68",
  date: "Jun 2026",
  headline: "Apple Health Only · Terms of Use Fix",

  // Improved
  i1Title: "All Bluetooth References Removed",
  i1Desc: "The paywall feature list, disclaimer text, onboarding slides, and all 10 language blocks no longer mention Bluetooth or BLE. VitalSync imports health data exclusively through Apple Health.",
  i2Title: "Terms of Use Links Corrected",
  i2Desc: "All Terms of Use (EULA) links across the paywall, onboarding, HealthKit Permissions, Data Privacy, and Consent screens now correctly point to the Apple Standard EULA.",
} as const;

/** Release note content — v1.0.67 */
export const whatsNewV1067Strings = {
  version: "1.0.67",
  date: "Jun 2026",
  headline: "Bluetooth Removed · Apple Health Only",

  // New
  n1Title: "Apple Health Integration Only",
  n1Desc: "All Bluetooth device connectivity has been removed. VitalSync now imports health data exclusively through Apple Health, providing a simpler and more reliable experience without requiring Bluetooth permissions.",

  // Improved
  i1Title: "Cleaner Permissions",
  i1Desc: "Bluetooth permissions (NSBluetoothAlwaysUsageDescription) and background Bluetooth modes have been removed from the app. Only Apple Health, camera, microphone, and notification permissions are requested.",
  i2Title: "Updated Paywall Features",
  i2Desc: "The Premium features list now highlights Apple Health integration instead of Bluetooth device sync, accurately reflecting the app's data import capabilities.",
} as const;

/** Release note content — v1.0.66 */
export const whatsNewV1066Strings = {
  version: "1.0.66",
  date: "Jun 2026",
  headline: "Floating Wellness Disclaimer + Macros Tab",

  // New
  n1Title: "Floating Wellness Disclaimer",
  n1Desc: "A glassmorphic floating disclaimer now appears on all main screens with a pulsing green indicator, expand/collapse animation, and auto-reappears every 24 hours to keep wellness context visible without being intrusive.",
  n2Title: "Macros Analytics Tab",
  n2Desc: "A new \u{1F96C} Macros tab in Nutrition Analysis displays your macro breakdown when 7+ days of macro data are logged, with friendly empty states and a progress bar for users still building their macro history.",

  // Improved
  i1Title: "Nutrition Tab Expanded to 4 Tabs",
  i1Desc: "The Nutrition Analysis section now features four tabs \u2014 Correlate, Glucose Tracking, Caloric, and Macros \u2014 each with its own color accent and persistent selection across sessions.",
} as const;

/** Release note content — v1.0.65 */
export const whatsNewV1065Strings = {
  version: "1.0.65",
  date: "Jun 2026",
  headline: "Apple 1.4.1 Compliance + Full Localization",

  // New
  n1Title: "Wellness Disclaimer Banners",
  n1Desc: "A clear wellness disclaimer banner ('VitalSync is a personal wellness app, not a medical device') now appears at the top of the Record, Correlate, Health Report, and Settings screens, and on the paywall.",
  n2Title: "Terms of Service (EULA) Link",
  n2Desc: "The Terms of Service link throughout the app now points to Apple's standard EULA at apple.com/legal/internet-services/itunes/dev/stdeula/ and is labelled 'Terms of Service (EULA)'.",

  // Improved
  i1Title: "Medical Language Remediation",
  i1Desc: "All high-risk medical-device phrases (AFib detection, clinical decisions, meta-analyzed clinical datasets, diagnoses) replaced with compliant wellness-tracking language across EKG, Correlate, Onboarding, Thresholds, and Settings screens.",
  i2Title: "Health Data Access Screen Disclaimer",
  i2Desc: "The Health Data Access (HealthKit permissions) screen now displays a two-paragraph wellness disclaimer card explaining that VitalSync is not a medical device and does not provide clinical advice.",
  i3Title: "Correlate Tab Full Localization",
  i3Desc: "Every user-facing string in all 5 Correlate sections is now fully translated into all 10 supported languages. Zero hardcoded English strings remain.",
} as const;

/** Release note content — v1.0.64 */
export const whatsNewV1064Strings = {
  version: "1.0.64",
  date: "Jun 2026",
  headline: "Pattern Explorer V2 + Nutrition Empty States",

  // New
  n1Title: "Personal Insight Card",
  n1Desc: "Every expanded scatter plot in Pattern Explorer now shows a 💡 Personal Insight card with a contextual sentence describing your historical relationship between the two metrics over the selected day range.",
  n2Title: "Nutrition Analysis Empty States",
  n2Desc: "The Correlate and Caloric tabs in Nutrition Analysis now show friendly empty states (‘No Data Yet’ / ‘Building Your Pattern’) with a progress badge and progress bar when fewer than 7 days of meal data have been logged.",

  // Improved
  i1Title: "Rich Evidence Source Block",
  i1Desc: "Each expanded scatter card now shows a full Evidence Source block with journal name, year, study type badge (RCT / Cohort / Meta-Analysis / Cross-Sectional), sample size, and tappable PMID/DOI links.",
  i2Title: "Observed Patterns Header Badge",
  i2Desc: "The Observed Historical Patterns section header now shows a compact n/7 progress badge alongside the chevron when fewer than 7 days of data exist — visible even when the section is collapsed.",
  i3Title: "RTM Updated to 60 Requirements",
  i3Desc: "Requirement Traceability Matrix updated from 53 to 60 requirements at 100% coverage, adding OH-07/08, NA-07/08/09, PE-13/14.",
} as const;

/** Release note content — v1.0.63 */
export const whatsNewV1063Strings = {
  version: "1.0.63",
  date: "Jun 2026",
  headline: "Observed Patterns Empty State",

  // New
  n1Title: "Building Your Pattern State",
  n1Desc: "Observed Historical Patterns now shows a friendly 'Building Your Pattern' state with a progress badge (n/7 days) and animated progress bar when fewer than 7 unique days of data have been logged.",
  n2Title: "No Data Yet State",
  n2Desc: "When no data has been logged for either metric, Observed Historical Patterns shows a 'No Data Yet' state with a 0/7 days badge — consistent with the Pattern Explorer empty state design.",

  // Improved
  i1Title: "Full Correlate Tab Design Consistency",
  i1Desc: "All 5 Correlate sections (InsightEngine, WellnessSummary, PatternExplorer, Observed Historical Patterns, Nutrition Analysis) now share the exact same GlassCard shell, LogCard header, chip style, and haptic interaction as the Record tab.",
  i2Title: "Scatter Point Tap-to-Tooltip",
  i2Desc: "Tapping any scatter point in Pattern Explorer now shows a tooltip with the date, X value, and Y value for that data point.",
  i3Title: "Period-over-Period Trend Arrows",
  i3Desc: "Wellness Summary metric cards now show up/down/flat trend arrows comparing the current period to the previous period.",
} as const;

/** Release note content — v1.0.62 */
export const whatsNewV1062Strings = {
  version: "1.0.62",
  date: "Jun 2026",
  headline: "Correlate Tab Final Polish",

  // Improved
  i1Title: "Evidence Library Cards Now Square",
  i1Desc: "Evidence Library source cards (PubMed, AHA, Cochrane, WHO, ISSN, AND-EAL) now use aspectRatio:1 for perfectly square tiles that look intentional alongside the updated chip tags.",
  i2Title: "Uniform Chip Style Across All Correlate Tabs",
  i2Desc: "Evidence Library source tag pills now match the Record/WellnessSummary/PatternExplorer chip style: borderRadius 20, paddingVertical 5, paddingHorizontal 12, fontSize 12, fontWeight 700.",
  i3Title: "InsightCardHalf Status Pill Rounded",
  i3Desc: "The status pill inside half-width Insight cards now uses borderRadius 20, consistent with the full chip language across the entire Correlate tab.",
} as const;

/** Release note content — v1.0.61 */
export const whatsNewV1061Strings = {
  version: "1.0.61",
  date: "Jun 2026",
  headline: "Correlate Tab Polish",

  // Improved
  i1Title: "Wellness Summary Moved Up",
  i1Desc: "Wellness Summary now appears above Observed Historical Patterns for a more logical top-to-bottom reading flow in the Correlate tab.",
  i2Title: "Uniform Section Header Heights",
  i2Desc: "InsightEngine, Wellness Summary, and Pattern Explorer section headers now match the same paddingVertical as Nutrition Analysis for a consistent, polished look.",
  i3Title: "Pattern Explorer Fully Translated",
  i3Desc: "All scoring labels (Analysis Scores, Data Completeness, Trend Stability, Relationship Strength, Research Confidence, Overall Score) are now translated into all 10 supported languages.",
  i4Title: "Relationship Strength Uses Pearson r",
  i4Desc: "Relationship Strength score in InsightEngine cards now maps directly to |r|×100 computed from the actual chart data, replacing the fixed status-based values.",

  // Fixed
  f1Title: "Peer-Reviewed Reference Footer Removed",
  f1Desc: "The 'View all sources' peer-reviewed reference footer has been removed from the bottom of the Correlate tab for a cleaner layout.",
} as const;

/** Release note content — v1.0.60 */
export const whatsNewV1060Strings = {
  version: "1.0.60",
  date: "Jun 2026",
  headline: "Pattern Explorer + Scoring System",

  // New
  n1Title: "Pattern Explorer — 16 Scatter Plots",
  n1Desc: "New Pattern Explorer section in the Correlate tab shows 16 evidence-based scatter plots across 30/90/180/365-day views with Pearson r correlation, R², and data completeness scores.",
  n2Title: "4-Metric Scoring System on Insight Cards",
  n2Desc: "Each InsightEngine card now shows Data Completeness, Trend Stability, Relationship Strength, and Research Confidence scores with animated progress bars and an Overall Score badge.",

  // Improved
  i1Title: "Insight Cards Always Expanded",
  i1Desc: "The first two full-width Insight Engine cards now open in expanded state by default, so key correlations are immediately visible without any tap.",
} as const;

/** Release note content — v1.0.57 */
export const whatsNewV1057Strings = {
  version: "1.0.57",
  date: "Jun 2026",
  headline: "Full Paywall Translation — 10 Languages",

  // Improved
  i1Title: "Paywall Translated into All 10 Languages",
  i1Desc: "All new paywall strings — 13 carousel slide titles, CTA labels, Premium Features toggle, and free plan text — are now fully translated into Spanish, French, German, Chinese, Arabic, Portuguese, Japanese, Swahili, and Hindi.",
} as const;

/** Release note content — v1.0.56 */
export const whatsNewV1056Strings = {
  version: "1.0.56",
  date: "Jun 2026",
  headline: "Guideline 2.5.4 Fix & Stability",

  // Fixed
  f1Title: "Background Audio Removed (Guideline 2.5.4)",
  f1Desc: "Removed 'audio' from UIBackgroundModes in Info.plist. VitalSync does not use background audio — the entry was injected by expo-video's PiP setting. Fixed by disabling PiP and explicitly declaring only the required background modes.",
} as const;

/** Release note content — v1.0.55 */
export const whatsNewV1055Strings = {
  version: "1.0.55",
  date: "Jun 2026",
  headline: "Paywall Polish & Feature Cleanup",

  // Improved
  i1Title: "Premium Features — Duplicates Removed",
  i1Desc: "The collapsible Premium Features list no longer shows duplicate entries (Scan Meal and Lab Trend Analysis were consolidated with existing items).",
  i2Title: "CTA Labels Rewritten",
  i2Desc: "Annual CTA now reads \u2018Start 14-Day Free Trial\u2019 with \u2018$49.99/year after trial. Cancel anytime.\u2019 beneath it. Monthly CTA reads \u2018Unlock Premium Features\u2019 with \u2018$4.99/month. Cancel anytime.\u2019",
} as const;

/** Release note content — v1.0.54 */
export const whatsNewV1054Strings = {
  version: "1.0.54",
  date: "Jun 2026",
  headline: "Smarter Lab & Prescription Scanning",

  // Improved
  i1Title: "Lab Scanner — Stable Gemini Model",
  i1Desc: "Lab report scanning now uses the same stable gemini-2.5-flash → flash-lite → flash-latest three-attempt fallback chain as the food scanner, replacing the deprecated preview endpoint.",
  i2Title: "Prescription Scanner — Same Fallback Chain",
  i2Desc: "Prescription scanning also upgraded to the stable three-model fallback chain for higher reliability and lower latency.",
} as const;

/** Release note content — v1.0.53 */
export const whatsNewV1053Strings = {
  version: "1.0.53",
  date: "Jun 2026",
  headline: "Premium Paywall Carousel",

  // Improved
  i1Title: "Premium-Focused Carousel Slides",
  i1Desc: "All 13 paywall carousel slides now highlight specific premium features: EKG tracking, A1C projection, medication reminders, correlations, and more.",
  i2Title: "Trust Footer Removed",
  i2Desc: "Removed the static trust footer from the paywall for a cleaner, more focused layout.",
} as const;

/** Release note content — v1.0.52 */
export const whatsNewV1052Strings = {
  version: "1.0.52",
  date: "Jun 2026",
  headline: "Paywall Copy & Trust Statement",

  // Improved
  i1Title: "\"Premium Features\" Toggle",
  i1Desc: "The collapsible feature list is now labelled 'Premium Features' — clearer about what expands.",
  i2Title: "Free Plan Limits Simplified",
  i2Desc: "Removed 'No clinical insights' from the free plan description. Now reads: Basic logging · 30-day history.",
  i3Title: "Trust Statement Updated",
  i3Desc: "Footer now reads: 'On device. No server. Know what your health means.' — more direct and brand-aligned.",
} as const;

/** Release note content — v1.0.51 */
export const whatsNewV1051Strings = {
  version: "1.0.51",
  date: "Jun 2026",
  headline: "Paywall Background & Icon Polish",

  // Improved
  i1Title: "Paywall Background Restored",
  i1Desc: "The full-bleed background image is back on the paywall with a dark gradient overlay for better legibility.",
  i2Title: "Carousel Icons Removed",
  i2Desc: "Emoji icons (lock, pill, food plate) removed from carousel slides — clean ALL-CAPS headings only.",
  i3Title: "Titles Only on Carousel",
  i3Desc: "Carousel slides now show only the ALL-CAPS heading with no description text beneath.",
} as const;

/** Release note content — v1.0.50 */
export const whatsNewV1050Strings = {
  version: "1.0.50",
  date: "Jun 2026",
  headline: "Paywall Copy Update",

  // Improved
  i1Title: "Paywall Slide 3 Title Updated",
  i1Desc: "Carousel slide 3 now reads 'Generate Personal Health Report' — clearer and more action-oriented.",
} as const;

/** Release note content — v1.0.49 */
export const whatsNewV1049Strings = {
  version: "1.0.49",
  date: "Jun 2026",
  headline: "Paywall Carousel Redesign",

  // New
  n1Title: "Capital Headings on Paywall Carousel",
  n1Desc: "Each carousel slide now shows its title in all-caps with a concise 5-word tagline beneath it — cleaner and faster to read.",

  // Improved
  i1Title: "Logo & Badge Above Carousel",
  i1Desc: "The VitalSync logo and 'VITALSYNC PREMIUM' badge are now clearly separated above the carousel images for a more polished hierarchy.",
  i2Title: "Consistent Paywall Across App",
  i2Desc: "The same paywall layout now appears in onboarding, the standalone paywall screen, and all premium feature gates.",

  // Fixed
  f1Title: "Missing i18n Key (showFeatures)",
  f1Desc: "Added the missing 'showFeatures' key to the English paywall strings, resolving a TypeScript error.",
} as const;

/** Release note content — v1.0.48 */
export const whatsNewV1048Strings = {
  version: "1.0.48",
  date: "Jun 2026",
  headline: "Paywall & Onboarding Polish",

  // New
  n1Title: "Collapsible Feature List on Paywall",
  n1Desc: "The 'What's included' feature list is now collapsed by default, keeping the CTA and Restore Purchases button immediately visible without scrolling.",
  n2Title: "Tap-to-Explore Hint on Welcome Slide",
  n2Desc: "A 'Tap to explore' hint now appears below the tab strip on the Welcome onboarding slide so users know the tabs are interactive.",

  // Improved
  i1Title: "Paywall Carousel Title",
  i1Desc: "Slide 1 title updated to 'Your Vitals, Personally Tracked' — shorter and fits all screen sizes without truncation.",
  i2Title: "Settings Section Order",
  i2Desc: "Subscription and Health Data sections now appear immediately after Appearance for faster access.",

  // Fixed
  f1Title: "Consent Slide Overflow on Small Screens",
  f1Desc: "The 'By tapping...' paragraph and Terms of Use on the consent slide are no longer obscured on iPhone SE and 13 mini.",
} as const;

/** Release note content — v2.9.35 */
export const whatsNewV2935Strings = {
  version: "2.9.35",
  date: "May 2026",
  headline: "Translation Polish & Security",

  // New
  n1Title: "Translation Engine Attribution",
  n1Desc: "Translated Personal Health Reports now show a small 'Translated by Apple' or 'Translated by Gemini' line in the PDF footer so clinicians know exactly which engine was used.",
  n2Title: "Lock Now Button on Dashboard",
  n2Desc: "A red lock icon appears in the Dashboard header whenever app lock is configured. Tap it to lock immediately — the session is fully cleared from secure storage so the next launch always requires re-authentication.",

  // Improved
  i1Title: "Personal Health Report Rename",
  i1Desc: "All references to 'Doctor Report' have been updated to 'Personal Health Report' across the app, release notes, and clinical source citations.",
  i2Title: "Translation Engine: Apple & Gemini Only",
  i2Desc: "PDF report translation now uses only Apple on-device Translation (iOS 18+) or Gemini (Android/Web). The server is no longer involved in any translation flow.",

  // Fixed
  f1Title: "117 Missing Report Translation Keys",
  f1Desc: "All 117 missing Health Report labels (SpO2, glucose zones, sleep, HRV, medications, A1C, temperature, and statistical descriptors) are now fully translated across all 21 supported languages.",
} as const;

/** Release note content — v2.8.32 */
export const whatsNewV2755Strings = {
  version: "2.8.32",
  date: "April 2026",
  headline: "HealthKit Blood Glucose & App Store Compliance",

  // New
  n1Title: "Keyboard Dictation Entry",
  n1Desc: "Every text entry field across Medications, Appointments, Immunizations, and Surgical History now shows a keyboard dictation tip banner, guiding you to use your device’s built-in voice-to-text for hands-free logging.",
  n2Title: "Blood Glucose Now Syncs from HealthKit",
  n2Desc: "Apple HealthKit blood glucose readings are now fully fetched, synced through the data pipeline, and merged into the Blood Sugar screen — including background delivery when new readings arrive from a CGM or glucometer.",
  n3Title: "Privacy Policy & Terms of Use in Settings",
  n3Desc: "Settings → About now includes dedicated Privacy Policy and Terms of Use rows linking to vitalsyncpersonalwellnesshub.com/article/privacy-policy — required for App Store compliance.",

  // Improved
  i1Title: "What's New Badge Dot on Dashboard",
  i1Desc: "The ? help icon in the Dashboard header now shows a small red dot whenever a new app version is installed. Tapping it clears the badge and navigates to Settings → About.",
  i2Title: "Share & Contact Support in Settings",
  i2Desc: "Settings → About now has a \"Share VitalSync\" row (native share sheet with App Store/Play Store link) and a \"Contact Support\" row that opens a pre-filled email with your app version and platform automatically included.",

  // Fixed
  f1Title: "Medications Scribe Crash Fixed",
  f1Desc: "Tapping the voice entry section in the Add Medication modal no longer crashes. The missing tRPC routes (scribeVoice, scribeTranscript) have been added and all async calls are now properly guarded with try/catch/finally.",
  f2Title: "PR Regression Tests Added",
  f2Desc: "16 automated vitest regression tests now run on every PR to catch router parity gaps, native module linking issues, and React Compiler misconfigurations before they reach production.",
} as const;

/** Release note content — v2.3.66 */
export const whatsNewV2366Strings = {
  version: "2.3.66",
  date: "March 2026",
  headline: "Icon, Navigation & Bug Fixes",

  // New
  n1Title: "Coral-Red EKG App Icon",
  n1Desc: "The app icon has been redesigned with a premium 3D isometric dark cube, frosted-glass VS letters (emerald-green V, electric-blue S), and a coral-red glowing heartbeat strip — making the health tracking purpose unmistakable at a glance.",
  n2Title: "Feature Highlight Tiles Now Navigate Correctly",
  n2Desc: "The Vital Signs, Lab Records, and Surgical History tiles in About now deep-link directly to their respective screens instead of the Dashboard.",

  // Fixed
  f1Title: "Blood Sugar Correlation Engine Fix",
  f1Desc: "The Insulin Sensitivity correlation (Sleep Duration vs Fasting Glucose) was silently skipping all readings due to a type mismatch. It now correctly reads glucoseMgDl and filters only fasting context entries.",
  f2Title: "HealthKit Permissions Dead Branch Removed",
  f2Desc: "A redundant Platform.OS !== 'web' guard inside the iOS-only handleOpenHealthSettings callback has been removed, eliminating a TypeScript error and dead code path.",

  // Improved
  i1Title: "Haptic Feedback on Feature Tiles",
  i1Desc: "Tapping any of the 8 feature highlight tiles in the About screen now fires a light haptic impact, consistent with the rest of the app's interaction design.",
  i2Title: "Surgical History Route Corrected",
  i2Desc: "The Surgical History tile in About now routes to the dedicated Surgical History screen (/log/surgical-history) rather than the Medical Conditions screen.",
} as const;

/** Release note content — v1.0.34 */
export const whatsNewV1034Strings = {
  version: "1.0.34",
  date: "June 2026",
  headline: "Immersive Paywall & Evidence Citations",
  // New
  n1Title: "Immersive Paywall Redesign",
  n1Desc: "The subscription screen now features a full-bleed clinical background image, an auto-advancing feature carousel with pagination dots, and a frosted-glass CTA panel — inspired by best-in-class iOS app design.",
  n2Title: "Medical References in Health Reports",
  n2Desc: "PDF health reports now include a comprehensive Medical References section citing all peer-reviewed studies that underpin the correlation insights, metric analyzes, and nutritional data in the report.",
  n3Title: "Nutrition Peer-Review Citations",
  n3Desc: "The Diabetic Nutrition and Caloric Trend tabs now display tappable peer-review citation badges linking directly to PubMed studies.",
  // Improved
  i1Title: "Citations Always Visible",
  i1Desc: "Evidence-based citation badges in the Smart Insights section are now always visible — no longer hidden behind the expand toggle.",
  i2Title: "Sleep Coefficient of Variation Removed",
  i2Desc: "The sleep-cv insight card has been removed from the Smart Insights section to reduce noise and improve signal quality.",
} as const;

/** Release note content — v1.0.35 */
export const whatsNewV1035Strings = {
  version: "1.0.35",
  date: "June 2026",
  headline: "Onboarding Redesign & Clarity Update",
  // New
  n1Title: "Redesigned Welcome Slide",
  n1Desc: "The onboarding welcome screen now features scrollable top tabs — Mission, Features, Privacy, and Evidence — with rich content panels and glass-card styling.",
  n2Title: "Unified Paywall Experience",
  n2Desc: "The onboarding paywall now uses the same full-bleed immersive layout as the main subscription screen for a consistent premium experience.",
  n3Title: "NeoVital & NeoSleep Report References",
  n3Desc: "Health reports now include dedicated citations for the NeoVital multi-axis vital trend graph and NeoSleep AASM-aligned sleep analysis.",
  // Improved
  i1Title: "American English Throughout",
  i1Desc: "All British English spellings (personalise, analyse, colour, behaviour, etc.) have been replaced with American English across all 88 localized files.",
  i2Title: "Observed Historical Patterns Citations",
  i2Desc: "The Correlation tab's Observed Historical Patterns chart now shows peer-review citation badges grounded in published research.",
  i3Title: "Health Insights Section Removed",
  i3Desc: "The redundant Health Insights section has been removed from the Correlate tab to reduce noise and improve focus on the correlation engine.",
  // Fixed
  f1Title: "AI References Removed",
  f1Desc: "All user-facing 'AI' labels have been replaced with neutral, clinically accurate descriptions across the app, onboarding, and paywall.",
} as const;

/** Release note content — v1.0.47 */
export const whatsNewV1047Strings = {
  version: "1.0.47",
  date: "June 2026",
  headline: "Onboarding Overflow Fixes",
  i1Title: "Settings Reordered",
  i1Desc: "Subscription and Health Data sections now appear immediately after Appearance for faster access. Subscription prices updated to $4.99/mo and $49.99/yr.",
  i2Title: "Onboarding Slides Scrollable",
  i2Desc: "Health Permissions (slide 3) and Threshold Setup (slide 5) are now scrollable on all screen sizes including iPhone SE and iPhone 13 mini.",
} as const;

/** Release note content — v1.0.46 */
export const whatsNewV1046Strings = {
  version: "1.0.46",
  date: "June 2026",
  headline: "Onboarding Polish",
  i1Title: "Consent Slide Scrollable",
  i1Desc: "The Terms of Use section on the consent slide is no longer obscured by the navigation bar — the entire consent card is now scrollable.",
  i2Title: "Dedication Section Removed",
  i2Desc: "The \"Dedicated To\" card has been removed from the Welcome slide for a cleaner, more focused onboarding experience.",
} as const;

/** Release note content — v1.0.45 */
export const whatsNewV1045Strings = {
  version: "1.0.45",
  date: "June 2026",
  headline: "Paywall Price Labels",
  i1Title: "Price Shown on CTA Button",
  i1Desc: "The subscription CTA now shows the actual plan price inline (e.g. \"$49.99/yr · 14-day free trial\" or \"$4.99/mo · cancel anytime\") so users can compare plans without leaving the paywall.",
} as const;

/** Release note content — v1.0.44 */
export const whatsNewV1044Strings = {
  version: "1.0.44",
  date: "June 2026",
  headline: "Annual CTA Clarity",
  i1Title: "Annual Plan CTA Updated",
  i1Desc: "The annual subscription button now reads \"Start My Free Trial — Annual\" so users immediately know which plan they're selecting before tapping.",
} as const;

/** Release note content — v1.0.43 */
export const whatsNewV1043Strings = {
  version: "1.0.43",
  date: "June 2026",
  headline: "Personal Insights CTA",
  i1Title: "CTA Copy Updated",
  i1Desc: "The monthly subscription button now reads \"Unlock Personal Insights\" — clearer, warmer, and free of clinical language that could trigger App Store review flags.",
} as const;

export const whatsNewV1037Strings = {
  version: "1.0.37",
  date: "June 2026",
  headline: "CTA Copy & App Store Refresh",
  // Improved
  i1Title: "Clearer Paywall CTA Buttons",
  i1Desc: "The subscription CTA now reads \"Start My Free Trial\" (annual) and \"Unlock Personal Insights\" (monthly) for stronger, more direct conversion messaging.",
  i2Title: "App Store Description Rewritten",
  i2Desc: "The App Store listing now leads with \"Built by a critical care nurse\" and the peer-reviewed evidence angle, removing all AI references.",
  i3Title: "Feature Labels Updated",
  i3Desc: "Nutrition analysis features now reference USDA-verified data; clinical insight rows no longer reference AI brand names.",
} as const;

/** Release note content — v1.0.36 */
export const whatsNewV1036Strings = {
  version: "1.0.36",
  date: "June 2026",
  headline: "Copy Refinement & Paywall Polish",
  // Improved
  i1Title: "Sharper Paywall Carousel Headlines",
  i1Desc: "All 5 paywall carousel slides now have conversion-optimized headlines and subtitles that clearly communicate VitalSync's clinical value without AI references.",
  i2Title: "Welcome Slide Tab Copy Refined",
  i2Desc: "Mission, Features, Privacy, and Evidence tab content has been rewritten with precise, App Store-ready language grounded in clinical and research credentials.",
  i3Title: "Feature Descriptions Updated",
  i3Desc: "Every feature card in the onboarding Welcome slide now includes the specific clinical standard it references (AHA, ADA, AASM, USDA, CDC/WHO).",
} as const;

/** Release note content — v1.5 */
export const whatsNewV15Strings = {
  version: "1.5",
  date: "March 2026",
  headline: "Diagnostics & Icon Update",

  // New
  n1Title: "Send Crash Report",
  n1Desc: "Beta testers can now email the full error log directly from Settings → Diagnostics with one tap.",
  n2Title: "Copy Log to Clipboard",
  n2Desc: "Copy the crash log to your clipboard and paste it into any messaging app — no mail client needed.",
  n3Title: "Share Sheet",
  n3Desc: "Share crash logs via AirDrop, Slack, Messages, or any app using the native iOS/Android share sheet.",
  n4Title: "Norwegian Language Support",
  n4Desc: "Norsk is now available in both the first-launch consent screen and the Settings language picker.",

  // Improved
  i1Title: "Auto-Clear After Sharing",
  i1Desc: "After sending, copying, or sharing a crash report, VitalSync prompts to clear stale logs so Diagnostics stays tidy.",
  i2Title: "3D VS App Icon",
  i2Desc: "The app icon now features a fully 3D extruded chrome VS monogram on a heartbeat line — cleaner and more distinctive on the home screen.",

  // Fixed
  f1Title: "Settings Crash on Web",
  f1Desc: "Resolved a crash caused by native-only expo-updates and expo-clipboard imports evaluating at module load time on web.",
  f2Title: "Launch Crash Hardening",
  f2Desc: "Eight defensive try/catch guards added across the auth, health, data-sources, and biometric init paths to prevent silent iOS launch crashes.",
} as const;

/** Release note content — v1.4 */
export const whatsNewV14Strings = {
  version: "1.4",
  date: "March 2026",
  headline: "Language & Polish Update",

  // New
  n1Title: "20-Language Smart Translation",
  n1Desc: "Translate the entire app into 20 languages instantly — including Arabic, Hindi, Japanese, and 16 more via on-device intelligence.",
  n2Title: "RTL Layout Support",
  n2Desc: "Full right-to-left layout for Arabic and Hebrew, with a one-tap reload to apply.",
  n3Title: "Translate PDF Reports",
  n3Desc: "Export doctor-ready PDF reports in your chosen language with a single tap.",
  n4Title: "Globe Quick-Access Button",
  n4Desc: "Switch language directly from the Dashboard header without going to Settings.",

  // Improved
  i1Title: "Medication Reminder Redesign",
  i1Desc: "Medication reminders now use the same 3D glass card style as appointment reminders.",
  i2Title: "Haptic Feedback Throughout",
  i2Desc: "Satisfying haptic responses on language switch, translation complete, and key interactions.",
  i3Title: "Language Badge on Settings Icon",
  i3Desc: "A small flag overlay on the Settings tab icon shows your active language at a glance.",

  // Fixed
  f1Title: "Smart Language Detection",
  f1Desc: "Resolved an issue where Swahili and other Smart languages would silently fall back to English.",
  f2Title: "Language Picker Search",
  f2Desc: "Search now resets correctly when the picker is closed and reopened.",
} as const;

/** Release note content — v1.3 */
export const whatsNewV13Strings = {
  version: "1.3",
  date: "February 2026",
  headline: "Analytics & Sleep Update",

  // New
  n1Title: "Correlation Analytics Engine",
  n1Desc: "Discover hidden patterns between vitals — e.g., how sleep quality correlates with resting heart rate.",
  n2Title: "Native Sleep Time Picker",
  n2Desc: "iOS wheel-style time picker for bedtime and wake time with automatic duration calculation.",
  n3Title: "PDF Personal Health Reports",
  n3Desc: "Generate a shareable PDF summary of your health data, ready to share with your care team.",

  // Improved
  i1Title: "Skeuo-Minimalist Redesign",
  i1Desc: "Refined the visual language with soft inner shadows, tactile 3D buttons, and an off-white canvas.",
  i2Title: "AM/PM Badge on Sleep Pill",
  i2Desc: "Time pickers now show a tinted AM/PM badge so the selected period is always clear.",
} as const;

/** Release note content — v1.2 */
export const whatsNewV12Strings = {
  version: "1.2",
  date: "January 2026",
  headline: "Health Data Integration",

  // New
  n1Title: "HealthKit & Health Connect",
  n1Desc: "Live vitals sync from Apple Health (iOS) and Health Connect (Android) — heart rate, steps, sleep, and more.",
  n2Title: "Privacy-First Architecture",
  n2Desc: "All health data stays on your device. No cloud sync, no accounts, no third-party sharing.",
  n3Title: "Force Sync Engine",
  n3Desc: "Pull the latest readings from your health platform on demand with a single tap.",
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface WhatsNewSheetProps {
  visible: boolean;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.88;

export function WhatsNewSheet({ visible, onClose }: WhatsNewSheetProps) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  // Translate all string groups
  const ui = useT(whatsNewUiStrings);
  const v15 = useT(whatsNewV15Strings);
  const v14 = useT(whatsNewV14Strings);
  const v13 = useT(whatsNewV13Strings);
  const v12 = useT(whatsNewV12Strings);

  // Show a loading indicator while Smart translation is in progress
  const lang = detectLang();
  const isAiLang = !STATIC_LANGS.has(lang);
  // If the translated title still equals the English source, translation is pending
  const isTranslating = isAiLang && ui.title === whatsNewUiStrings.title && lang !== "en";

  const v1047 = useT(whatsNewV1047Strings);
  const v1046 = useT(whatsNewV1046Strings);
  const v1045 = useT(whatsNewV1045Strings);
  const v1044 = useT(whatsNewV1044Strings);
  const v1043 = useT(whatsNewV1043Strings);
  const v1037 = useT(whatsNewV1037Strings);
  const v1036 = useT(whatsNewV1036Strings);
  const v1035 = useT(whatsNewV1035Strings);
  const v1034 = useT(whatsNewV1034Strings);
  const v2365 = useT(whatsNewV2365Strings);
  const v2366 = useT(whatsNewV2366Strings);
  const v2755 = useT(whatsNewV2755Strings);
  const v1073 = useT(whatsNewV1073Strings);
  const v1072 = useT(whatsNewV1072Strings);
  const v1071 = useT(whatsNewV1071Strings);
  const v1070 = useT(whatsNewV1070Strings);
  const v1069 = useT(whatsNewV1069Strings);
  const v1068 = useT(whatsNewV1068Strings);
  const v1067 = useT(whatsNewV1067Strings);
  const v1066 = useT(whatsNewV1066Strings);
  const v1065 = useT(whatsNewV1065Strings);
  const v1064 = useT(whatsNewV1064Strings);
  const v1063 = useT(whatsNewV1063Strings);
  const v1062 = useT(whatsNewV1062Strings);
  const v1061 = useT(whatsNewV1061Strings);
  const v1060 = useT(whatsNewV1060Strings);
  const v1059 = useT(whatsNewV1059Strings);
  const v1057 = useT(whatsNewV1057Strings);
  const v1056 = useT(whatsNewV1056Strings);
  const v1055 = useT(whatsNewV1055Strings);
  const v1054 = useT(whatsNewV1054Strings);
  const v1053 = useT(whatsNewV1053Strings);
  const v1052 = useT(whatsNewV1052Strings);
  const v1051 = useT(whatsNewV1051Strings);
  const v1050 = useT(whatsNewV1050Strings);
  const v1049 = useT(whatsNewV1049Strings);
  const v1048 = useT(whatsNewV1048Strings);
  const v2935 = useT(whatsNewV2935Strings);

  // Always show the latest version in the header
  const latestVersion = v1073;

  // Keep Modal mounted until close animation completes to prevent a one-frame
  // flash where the sheet appears at the bottom before animating in.
  const [modalVisible, setModalVisible] = useState(false);

  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }), [translateY]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }), [backdropOpacity]);

  useEffect(() => {
    if (visible) {
      // First mount the Modal (sheet starts off-screen at SHEET_MAX_HEIGHT),
      // then animate in on the next frame so there is no visible flash.
      setModalVisible(true);
      requestAnimationFrame(() => {
        backdropOpacity.value = withTiming(1, { duration: 280 });
        translateY.value = withSpring(0, {
          damping: 26,
          stiffness: 280,
          mass: 0.9,
        });
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 260 }, () => {
        runOnJS(setModalVisible)(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = () => {
    backdropOpacity.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 260 }, () => {
      runOnJS(setModalVisible)(false);
      runOnJS(onClose)();
    });
  };

  const bg = isDark ? "#0F1A18" : "#FFFFFF";
  const handleColor = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const subtitleColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const descColor = isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.55)";
  const itemBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";
  const versionBg = isDark ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.10)";
  const textColor = isDark ? "#F1F5F9" : "#0F172A";

  // Section colour constants
  const NEW_COLOR = "#22C55E";
  const IMPROVED_COLOR = "#3B82F6";
  const FIXED_COLOR = "#F59E0B";

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.45)" }, backdropStyle]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: bg,
            maxHeight: SHEET_MAX_HEIGHT,
            shadowColor: isDark ? "#22C55E" : "#000",
          },
          sheetStyle,
        ]}
      >
        {/* Handle bar */}
        <View style={[styles.handle, { backgroundColor: handleColor }]} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.sparkle}>✨</Text>
            <View>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: textColor }]}>
                  {ui.title}
                </Text>
                {isTranslating && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={styles.titleSpinner}
                  />
                )}
              </View>
              <Text style={[styles.subtitle, { color: subtitleColor }]}>
                VitalSync · {latestVersion.headline}
              </Text>
            </View>
          </View>
          <View style={[styles.versionBadge, { backgroundColor: versionBg }]}>
            <Text style={styles.versionText}>v{latestVersion.version}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        {/* Release notes list */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* ── v1.0.73 (latest) ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelChanged ?? 'Changed'} color="#60A5FA" />
            <ReleaseItem emoji="💰" title={v1073.c1Title} desc={v1073.c1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🏷️" title={v1073.c2Title} desc={v1073.c2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="✨" title={v1073.c3Title} desc={v1073.c3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color="#F87171" />
            <ReleaseItem emoji="✅" title={v1073.f1Title} desc={v1073.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⏳" title={v1073.f2Title} desc={v1073.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.72 ── */}
            <ReleaseItem emoji="🏟️" title={v1072.f1Title} desc={v1072.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📱" title={v1072.f2Title} desc={v1072.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🌐" title={v1072.f3Title} desc={v1072.f3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />

          {/* ── v1.0.71 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color="#F87171" />
            <ReleaseItem emoji="🔄" title={v1071.f1Title} desc={v1071.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="💳" title={v1071.f2Title} desc={v1071.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⚙️" title={v1071.f3Title} desc={v1071.f3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.70 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelChanged ?? 'Changed'} color="#60A5FA" />
            <ReleaseItem emoji="📋" title={v1070.c1Title} desc={v1070.c1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📚" title={v1070.c2Title} desc={v1070.c2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🥗" title={v1070.c3Title} desc={v1070.c3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.69 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color="#F87171" />
            <ReleaseItem emoji="💳" title={v1069.f1Title} desc={v1069.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⚠️" title={v1069.f2Title} desc={v1069.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.68 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="❤️" title={v1068.i1Title} desc={v1068.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📝" title={v1068.i2Title} desc={v1068.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.67 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🏥" title={v1067.n1Title} desc={v1067.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🔒" title={v1067.i1Title} desc={v1067.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="💎" title={v1067.i2Title} desc={v1067.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.66 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="💬" title={v1066.n1Title} desc={v1066.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🥦" title={v1066.n2Title} desc={v1066.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📊" title={v1066.i1Title} desc={v1066.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.65 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🛡️" title={v1065.n1Title} desc={v1065.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📄" title={v1065.n2Title} desc={v1065.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="✅" title={v1065.i1Title} desc={v1065.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🏥" title={v1065.i2Title} desc={v1065.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🌍" title={v1065.i3Title} desc={v1065.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.64 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="💡" title={v1064.n1Title} desc={v1064.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🥗" title={v1064.n2Title} desc={v1064.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📚" title={v1064.i1Title} desc={v1064.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📌" title={v1064.i2Title} desc={v1064.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="✅" title={v1064.i3Title} desc={v1064.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.63 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="📈" title={v1063.n1Title} desc={v1063.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📊" title={v1063.n2Title} desc={v1063.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🎨" title={v1063.i1Title} desc={v1063.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔍" title={v1063.i2Title} desc={v1063.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📉" title={v1063.i3Title} desc={v1063.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.62 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="⬜" title={v1062.i1Title} desc={v1062.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🎨" title={v1062.i2Title} desc={v1062.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📌" title={v1062.i3Title} desc={v1062.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.61 ── */}
          <OlderVersionHeader version={v1061.version} date={v1061.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📐" title={v1061.i1Title} desc={v1061.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="✏️" title={v1061.i2Title} desc={v1061.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🌐" title={v1061.i3Title} desc={v1061.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📈" title={v1061.i4Title} desc={v1061.i4Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🗑️" title={v1061.f1Title} desc={v1061.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.60 ── */}
          <OlderVersionHeader version={v1060.version} date={v1060.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🔬" title={v1060.n1Title} desc={v1060.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📊" title={v1060.n2Title} desc={v1060.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="✅" title={v1060.i1Title} desc={v1060.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.59 ── */}
          <OlderVersionHeader version={v1059.version} date={v1059.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="✨" title={v1059.n1Title} desc={v1059.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📚" title={v1059.n2Title} desc={v1059.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📊" title={v1059.n3Title} desc={v1059.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🌐" title={v1059.i1Title} desc={v1059.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.57 ── */}
          <OlderVersionHeader version={v1057.version} date={v1057.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🌐" title={v1057.i1Title} desc={v1057.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.56 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔒" title={v1056.f1Title} desc={v1056.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.55 ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="✨" title={v1055.i1Title} desc={v1055.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="💳" title={v1055.i2Title} desc={v1055.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.54 ── */}
          <OlderVersionHeader version={v1054.version} date={v1054.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🔬" title={v1054.i1Title} desc={v1054.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📝" title={v1054.i2Title} desc={v1054.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.53 ── */}
          <OlderVersionHeader version={v1053.version} date={v1053.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="✨" title={v1053.i1Title} desc={v1053.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔒" title={v1053.i2Title} desc={v1053.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.52 ── */}
          <OlderVersionHeader version={v1052.version} date={v1052.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🏦" title={v1052.i1Title} desc={v1052.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📝" title={v1052.i2Title} desc={v1052.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔒" title={v1052.i3Title} desc={v1052.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.51 ── */}
          <OlderVersionHeader version={v1051.version} date={v1051.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🎨" title={v1051.i1Title} desc={v1051.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="✨" title={v1051.i2Title} desc={v1051.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🅰️" title={v1051.i3Title} desc={v1051.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.50 ── */}
          <OlderVersionHeader version={v1050.version} date={v1050.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📝" title={v1050.i1Title} desc={v1050.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.49 ── */}
          <OlderVersionHeader version={v1049.version} date={v1049.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          {/* ── v1.0.49 (kept for history) ── */}
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🅰️" title={v1049.n1Title} desc={v1049.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🎨" title={v1049.i1Title} desc={v1049.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔄" title={v1049.i2Title} desc={v1049.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔧" title={v1049.f1Title} desc={v1049.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v1.0.48 ── */}
          <OlderVersionHeader version={v1048.version} date={v1048.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="📋" title={v1048.n1Title} desc={v1048.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="👆" title={v1048.n2Title} desc={v1048.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📱" title={v1048.i1Title} desc={v1048.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⚙️" title={v1048.i2Title} desc={v1048.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔧" title={v1048.f1Title} desc={v1048.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v2.9.35 ── */}
          <OlderVersionHeader version={v2935.version} date={v2935.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🏷️" title={v2935.n1Title} desc={v2935.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔒" title={v2935.n2Title} desc={v2935.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📝" title={v2935.i1Title} desc={v2935.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🌐" title={v2935.i2Title} desc={v2935.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔧" title={v2935.f1Title} desc={v2935.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v2.8.32 ── */}
          <OlderVersionHeader version={v2755.version} date={v2755.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🍎" title={v2755.n1Title} desc={v2755.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🩸" title={v2755.n2Title} desc={v2755.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📜" title={v2755.n3Title} desc={v2755.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🔴" title={v2755.i1Title} desc={v2755.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="💬" title={v2755.i2Title} desc={v2755.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔧" title={v2755.f1Title} desc={v2755.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="✅" title={v2755.f2Title} desc={v2755.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          {/* ── v2.3.66 ── */}
          <OlderVersionHeader version={v2366.version} date={v2366.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🎨" title={v2366.n1Title} desc={v2366.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🧭" title={v2366.n2Title} desc={v2366.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🩸" title={v2366.f1Title} desc={v2366.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔧" title={v2366.f2Title} desc={v2366.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📳" title={v2366.i1Title} desc={v2366.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🏥" title={v2366.i2Title} desc={v2366.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v2.3.65 ── */}
          <OlderVersionHeader version={v2365.version} date={v2365.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔧" title={v2365.f1Title} desc={v2365.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🛡️" title={v2365.f2Title} desc={v2365.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⚡" title={v2365.f3Title} desc={v2365.f3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="✨" title={v2365.n1Title} desc={v2365.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔐" title={v2365.n2Title} desc={v2365.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📊" title={v2365.i1Title} desc={v2365.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔗" title={v2365.i2Title} desc={v2365.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.47 ── */}
          <OlderVersionHeader version={v1047.version} date={v1047.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="⚙️" title={v1047.i1Title} desc={v1047.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📱" title={v1047.i2Title} desc={v1047.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.46 ── */}
          <OlderVersionHeader version={v1046.version} date={v1046.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="📜" title={v1046.i1Title} desc={v1046.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="✨" title={v1046.i2Title} desc={v1046.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.45 ── */}
          <OlderVersionHeader version={v1045.version} date={v1045.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="💰" title={v1045.i1Title} desc={v1045.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.44 ── */}
          <OlderVersionHeader version={v1044.version} date={v1044.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🏷️" title={v1044.i1Title} desc={v1044.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.43 ── */}
          <OlderVersionHeader version={v1043.version} date={v1043.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🎯" title={v1043.i1Title} desc={v1043.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.37 ── */}
          <OlderVersionHeader version={v1037.version} date={v1037.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🎯" title={v1037.i1Title} desc={v1037.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🏥" title={v1037.i2Title} desc={v1037.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🆙" title={v1037.i3Title} desc={v1037.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.36 ── */}
          <OlderVersionHeader version={v1036.version} date={v1036.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="✍️" title={v1036.i1Title} desc={v1036.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🎯" title={v1036.i2Title} desc={v1036.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🏥" title={v1036.i3Title} desc={v1036.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.35 ── */}
          <OlderVersionHeader version={v1035.version} date={v1035.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🎨" title={v1035.n1Title} desc={v1035.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔓" title={v1035.n2Title} desc={v1035.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📈" title={v1035.n3Title} desc={v1035.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🇺🇸" title={v1035.i1Title} desc={v1035.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📊" title={v1035.i2Title} desc={v1035.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🧹" title={v1035.i3Title} desc={v1035.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🤖" title={v1035.f1Title} desc={v1035.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.0.34 ── */}
          <OlderVersionHeader version={v1034.version} date={v1034.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🎨" title={v1034.n1Title} desc={v1034.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📚" title={v1034.n2Title} desc={v1034.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔬" title={v1034.n3Title} desc={v1034.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>
          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="📎" title={v1034.i1Title} desc={v1034.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="😴" title={v1034.i2Title} desc={v1034.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.5 ── */}
          <OlderVersionHeader version={v15.version} date={v15.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />
          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="📧" title={v15.n1Title} desc={v15.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📋" title={v15.n2Title} desc={v15.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔗" title={v15.n3Title} desc={v15.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🇳🇴" title={v15.n4Title} desc={v15.n4Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🧹" title={v15.i1Title} desc={v15.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🌟" title={v15.i2Title} desc={v15.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🔧" title={v15.f1Title} desc={v15.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🛡️" title={v15.f2Title} desc={v15.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.4 ── */}
          <OlderVersionHeader version={v14.version} date={v14.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />

          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="🌍" title={v14.n1Title} desc={v14.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔄" title={v14.n2Title} desc={v14.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📄" title={v14.n3Title} desc={v14.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🌐" title={v14.n4Title} desc={v14.n4Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="💊" title={v14.i1Title} desc={v14.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⚡" title={v14.i2Title} desc={v14.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🏷️" title={v14.i3Title} desc={v14.i3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelFixed} color={FIXED_COLOR} />
            <ReleaseItem emoji="🐛" title={v14.f1Title} desc={v14.f1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔍" title={v14.f2Title} desc={v14.f2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.3 ── */}
          <OlderVersionHeader version={v13.version} date={v13.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />

          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="📊" title={v13.n1Title} desc={v13.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="😴" title={v13.n2Title} desc={v13.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🩺" title={v13.n3Title} desc={v13.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          <View style={styles.section}>
            <SectionPill label={ui.labelImproved} color={IMPROVED_COLOR} />
            <ReleaseItem emoji="🎨" title={v13.i1Title} desc={v13.i1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="📱" title={v13.i2Title} desc={v13.i2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* ── v1.2 ── */}
          <OlderVersionHeader version={v12.version} date={v12.date} dividerColor={dividerColor} subtitleColor={subtitleColor} />

          <View style={styles.section}>
            <SectionPill label={ui.labelNew} color={NEW_COLOR} />
            <ReleaseItem emoji="❤️" title={v12.n1Title} desc={v12.n1Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="🔒" title={v12.n2Title} desc={v12.n2Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
            <ReleaseItem emoji="⚡" title={v12.n3Title} desc={v12.n3Desc} textColor={textColor} descColor={descColor} itemBg={itemBg} />
          </View>

          {/* Footer */}
          <Text style={[styles.footer, { color: subtitleColor }]}>
            {ui.footer}
          </Text>
        </ScrollView>

        {/* CTA button */}
        <View style={[styles.ctaWrap, { borderTopColor: dividerColor }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            activeOpacity={0.82}
            onPress={handleClose}
          >
            <Text style={styles.ctaText}>{ui.gotIt}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.sectionPill, { backgroundColor: color + "20", borderColor: color + "40" }]}>
      <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
    </View>
  );
}

function ReleaseItem({
  emoji,
  title,
  desc,
  textColor,
  descColor,
  itemBg,
}: {
  emoji: string;
  title: string;
  desc: string;
  textColor: string;
  descColor: string;
  itemBg: string;
}) {
  return (
    <View style={[styles.item, { backgroundColor: itemBg }]}>
      <Text style={styles.itemEmoji}>{emoji}</Text>
      <View style={styles.itemText}>
        <Text style={[styles.itemTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.itemDesc, { color: descColor }]}>{desc}</Text>
      </View>
    </View>
  );
}

function OlderVersionHeader({
  version,
  date,
  dividerColor,
  subtitleColor,
}: {
  version: string;
  date: string;
  dividerColor: string;
  subtitleColor: string;
}) {
  return (
    <View style={styles.olderHeader}>
      <View style={[styles.olderLine, { backgroundColor: dividerColor }]} />
      <Text style={[styles.olderLabel, { color: subtitleColor }]}>
        v{version} · {date}
      </Text>
      <View style={[styles.olderLine, { backgroundColor: dividerColor }]} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 24,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  sparkle: {
    fontSize: 32,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  titleSpinner: {
    marginLeft: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 1,
  },
  versionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginLeft: 8,
  },
  versionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#3B82F6",
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    gap: 4,
  },
  section: {
    marginBottom: 16,
    gap: 8,
  },
  sectionPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 6,
  },
  itemEmoji: {
    fontSize: 22,
    marginTop: 1,
    width: 28,
    textAlign: "center",
  },
  itemText: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  itemDesc: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  olderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    marginTop: 4,
  },
  olderLine: {
    flex: 1,
    height: 1,
  },
  olderLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  footer: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
    paddingVertical: 20,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    borderTopWidth: 1,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
