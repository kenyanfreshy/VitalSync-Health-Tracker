/**
 * usePremiumGate — central premium feature gating hook
 *
 * Usage (card/button level):
 *   const { requirePremium, PremiumGateSheet } = usePremiumGate();
 *   const handleExport = requirePremium(() => doExport(), { feature: 'Health Report Export' });
 *   // In JSX: {PremiumGateSheet}
 *
 * Usage (full-screen gate):
 *   const { isPremium, requirePremium, PremiumGateSheet } = usePremiumGate({ fullScreen: true });
 *   // PremiumGateSheet handles goBack() on dismiss automatically
 *
 * Design: the PremiumGateSheet now renders the full PaywallScreen (dark premium design,
 * green CTA, subscription cards) inside a Modal — matching the reference screenshot exactly.
 * "Not Now" navigates back to the previous screen (fixes white screen bug).
 * Trial only activates after a successful RevenueCat purchase initiation.
 */

import React, { useCallback, useState } from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSubscription } from "@/lib/subscription/subscription-context";
import { paywallGuard } from "@/lib/subscription/paywall-guard";
import { PaywallScreen } from "@/components/paywall-screen";
import { usePaywallStrings } from "@/hooks/use-paywall-strings";

// ─── Feature definitions ──────────────────────────────────────────────────────

export type PremiumFeature =
  | "Health Report Export"
  | "Advanced Correlations"
  | "Logged A1C & Trend Tracking"
  | "Smart Reminders"
  | "Dashboard Customisation"
  | "Advanced Nutrition"
  | "On-Device Insights"
  | "Full Vital History"
  | "Advanced Insights"
  | "EKG Analysis"
  | "Medications Tracker"
  | "Appointments Tracker"
  | "Data Sources"
  | "Scan a Meal"
  | "Scan Barcode"
  | "Bluetooth Devices";

// Platform-specific AI branding
const AI_INSIGHTS_DESCRIPTION =
  Platform.OS === "ios"
    ? "Apple Intelligence powered wellness insights analyzed entirely on your device — no data leaves your phone."
    : "Gemini powered wellness insights analyzed entirely on-device — no data leaves your phone.";

export const FEATURE_DESCRIPTIONS: Record<PremiumFeature, string> = {
  "Health Report Export":
    "Generate and export detailed PDF health reports to share with your physician.",
  "Advanced Correlations":
    "Discover patterns between your vitals, nutrition, sleep, and activity data.",
  "Logged A1C & Trend Tracking":
    "See your estimated A1C trend based on your continuous glucose readings.",
  "Smart Reminders":
    "Unlock intelligent reminders for medications, hydration, vitals, and appointments.",
  "Dashboard Customisation":
    "Rearrange, pin, and personalize every card on your dashboard.",
  "Advanced Nutrition":
    "Full meal history, macro trends, and nutrition correlations with your vitals.",
  "On-Device Insights": AI_INSIGHTS_DESCRIPTION,
  "Full Vital History":
    "Access your complete vital history beyond the 30-day free window.",
  "Advanced Insights":
    "Deep health insights, trend analysis, and evidence-based recommendations.",
  "EKG Analysis": "EKG recording analysis and waveform viewer.",
  "Medications Tracker": "Track medications, doses, schedules, and refills.",
  "Appointments Tracker": "Manage medical appointments and reminders.",
  "Data Sources": "Connect and manage health data sources via Apple Health.",
  "Scan a Meal": "Instantly analyze any meal with your camera — get calories, macros, sugar, and glycaemic load in seconds.",
  "Scan Barcode": "Scan any packaged food barcode to instantly log accurate nutrition data from the USDA database.",
  "Bluetooth Devices": "Pair and sync health devices over Bluetooth — glucometers, smart scales, BP monitors, CGMs, and more.",
};

// ─── Hook options ─────────────────────────────────────────────────────────────

interface UsePremiumGateOptions {
  /**
   * When true, dismissing the gate sheet calls router.back() instead of just
   * hiding the sheet. Use this for screens that are gated at the route level
   * (e.g. EKG, Medications, Appointments, Data Sources, EKG Waveform).
   *
   * Default: false (card/button level gate — dismiss just hides the sheet).
   */
  fullScreen?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePremiumGate(options: UsePremiumGateOptions = {}) {
  const { fullScreen = false } = options;
  const { isPremium, accessState } = useSubscription();
  const [gateFeature, setGateFeature] = useState<PremiumFeature | null>(null);
  const ps = usePaywallStrings();

  /**
   * Wraps a callback so it only executes when the user has premium access.
   * If not premium, shows the PremiumGateSheet for the given feature.
   */
  const requirePremium = useCallback(
    <T extends unknown[]>(
      callback: (...args: T) => void,
      opts: { feature: PremiumFeature }
    ) =>
      (...args: T) => {
        if (isPremium) {
          callback(...args);
        } else {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          setGateFeature(opts.feature);
        }
      },
    [isPremium]
  );

  /**
   * Dismiss the gate sheet.
   * - fullScreen mode: navigate back (prevents white screen on route-level gates).
   * - card mode: just hide the sheet (content stays on screen behind it).
   * In both cases, premium content remains locked — the user must purchase to unlock.
   */
  const dismissGate = useCallback(() => {
    setGateFeature(null);
    if (fullScreen) {
      // Small delay so the Modal close animation completes before navigation
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)" as Parameters<typeof router.replace>[0]);
        }
      }, 80);
    }
  }, [fullScreen]);

  const openPaywall = useCallback(() => {
    setGateFeature(null);
    // Do not push paywall while subscription state is still loading from AsyncStorage
    if (accessState === "loading") return;
    // Delegate loop-prevention to the shared singleton guard
    paywallGuard.tryPush(() => {
      router.push("/paywall" as Parameters<typeof router.push>[0]);
    });
  }, [accessState]);

  /**
   * PremiumGateSheet — a full-screen Modal rendering the unified PaywallScreen.
   *
   * Design matches the reference screenshot:
   *   - Dark premium background
   *   - "VITALSYNC PREMIUM" badge
   *   - Feature-specific title and subtitle in the header
   *   - Green CTA buttons ("Start 14-Day Free Trial")
   *   - Yearly / Monthly / Free subscription cards
   *   - Restore Purchases + Manage Subscription + Privacy / Terms footer
   *
   * "Not Now" / dismiss:
   *   - fullScreen mode: navigates back (no white screen)
   *   - card mode: hides sheet, content stays locked
   *
   * Trial activation:
   *   - Trial ONLY starts after successful RevenueCat purchase initiation
   *   - Tapping "Not Now" does NOT start the trial
   */
  // For 'On-Device Insights', pick the platform-specific localised description:
  //   iOS  → 'On-Device Insights'         (Apple Intelligence copy)
  //   Android/web → 'On-Device Insights Android' (Gemini copy)
  const resolvedFeatureSubtitle = gateFeature
    ? (() => {
        if (gateFeature === 'On-Device Insights' && Platform.OS !== 'ios') {
          return (
            ps.featureDescriptions?.['On-Device Insights Android'] ??
            AI_INSIGHTS_DESCRIPTION
          );
        }
        return ps.featureDescriptions?.[gateFeature] ?? FEATURE_DESCRIPTIONS[gateFeature];
      })()
    : undefined;

  const PremiumGateSheet = gateFeature ? (
    <Modal
      visible
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={dismissGate}
    >
      <View style={styles.modalRoot}>
        <PaywallScreen
          showFreeTier
          featureTitle={gateFeature}
          featureSubtitle={resolvedFeatureSubtitle ?? FEATURE_DESCRIPTIONS[gateFeature]}
          onDismiss={dismissGate}
          onSuccess={() => {
            setGateFeature(null);
            // Navigate to purchase success screen
            router.replace({
              pathname: "/purchase-success",
              params: { planId: "" },
            } as Parameters<typeof router.replace>[0]);
          }}
        />
      </View>
    </Modal>
  ) : null;

  return {
    isPremium,
    requirePremium,
    gateFeature,
    dismissGate,
    openPaywall,
    PremiumGateSheet,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
});

// ─── Legacy named export for backward compatibility ───────────────────────────
// Some screens import PremiumGateSheet directly. Keep the export but point to
// the hook's internal component via a wrapper.
export { PremiumGateSheetCompat as PremiumGateSheet };

interface PremiumGateSheetCompatProps {
  visible: boolean;
  feature: PremiumFeature;
  onDismiss: () => void;
  onUpgrade: () => void;
}

function PremiumGateSheetCompat({
  visible,
  feature,
  onDismiss,
  onUpgrade: _onUpgrade,
}: PremiumGateSheetCompatProps) {
  if (!visible) return null;
  return (
    <Modal
      visible
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalRoot}>
        <PaywallScreen
          showFreeTier
          featureTitle={feature}
          featureSubtitle={FEATURE_DESCRIPTIONS[feature]}
          onDismiss={onDismiss}
          onSuccess={() => {
            onDismiss();
            router.replace({
              pathname: "/purchase-success",
              params: { planId: "" },
            } as Parameters<typeof router.replace>[0]);
          }}
        />
      </View>
    </Modal>
  );
}
