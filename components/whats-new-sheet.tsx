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

  const v1043 = useT(whatsNewV1043Strings);
  const v1037 = useT(whatsNewV1037Strings);
  const v1036 = useT(whatsNewV1036Strings);
  const v1035 = useT(whatsNewV1035Strings);
  const v1034 = useT(whatsNewV1034Strings);
  const v2365 = useT(whatsNewV2365Strings);
  const v2366 = useT(whatsNewV2366Strings);
  const v2755 = useT(whatsNewV2755Strings);
  const v2935 = useT(whatsNewV2935Strings);

  // Always show the latest version in the header
  const latestVersion = v2935;

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
          {/* ── v2.9.35 (latest) ── */}
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
