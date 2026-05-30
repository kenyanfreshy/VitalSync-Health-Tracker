/**
 * VitalSync Paywall Screen
 *
 * Displays monthly/yearly subscription plans with a 14-day free trial.
 * Loads real pricing from StoreKit (iOS) / Google Play Billing (Android).
 * Includes restore purchases, Apple-safe wording, and trial terms.
 *
 * v2.9.85 UX upgrades:
 *  - Trust statement ("Private. On-device. No health data sold.") above CTA
 *  - SF Symbol-style check icons via MaterialIcons (check-circle) for feature rows
 *  - Glow / border illumination on selected plan card (shadow + primary border)
 *  - Free plan card normalized to match paid plan card padding/radius/spacing
 *  - CTA press animation: scale 0.97 + opacity 0.9
 *  - Improved visual hierarchy: premium features use accent color icon
 *
 * Bug fixes applied:
 *  - Added loading guard: never renders blank white screen while accessState === 'loading'
 *  - Added isMounted ref to prevent setState after unmount (prevents flash on quick dismiss)
 *  - Root view always has explicit backgroundColor (no transparent/white fallback)
 *  - reloadProducts only called once on mount, not on every render cycle
 *  - Restore handler reads latest accessState via ref to avoid stale closure
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import type { Subscription } from "react-native-iap";
import { useSubscription, PRODUCT_IDS, LEGAL_LINKS, type ProductId } from "@/lib/subscription/subscription-context";
import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/hooks/use-lang";
import { paywallExtStrings } from "@/lib/i18n";
import { useRTL } from "@/hooks/use-rtl";

// Sentinel value for the Free plan (not a real IAP product ID)
const FREE_PLAN_ID = 'free' as const;
type PlanSelection = ProductId | typeof FREE_PLAN_ID;

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Manage Subscription URL ──────────────────────────────────────────────────
// iOS: itms-apps:// opens the App Store subscriptions page natively (no Safari redirect)
// Fallback to https:// if the deep link fails (e.g. simulator)
const IOS_MANAGE_SUB_URL = "itms-apps://apps.apple.com/account/subscriptions";
const IOS_MANAGE_SUB_FALLBACK = "https://apps.apple.com/account/subscriptions";
const ANDROID_MANAGE_SUB_URL = "https://play.google.com/store/account/subscriptions";

// ─── Helper: extract display price from product ───────────────────────────────

// Fallback prices shown when StoreKit/Play products haven't loaded yet
const FALLBACK_MONTHLY = "$6.99";
const FALLBACK_YEARLY = "$69.99";

// Feature lists are now built dynamically from pw.* keys inside the component (see getPrimaryFeatures / getExtendedFeatures)

function getDisplayPrice(
  product: Subscription | undefined,
  fallback: string,
): string {
  if (!product) return fallback;
  // react-native-iap v15: localizedPrice is the formatted price string
  return (product as Subscription & { localizedPrice?: string }).localizedPrice ?? fallback;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaywallScreenProps {
  /** Called when user dismisses the paywall (free tier / close) */
  onDismiss?: () => void;
  /** Called after a successful purchase or trial start */
  onSuccess?: (planId?: string) => void;
  /** Whether to show the "Continue with Limited Free Version" link */
  showFreeTier?: boolean;
  /** Optional feature title override — shown in the header instead of the default '14-Day Free Trial' */
  featureTitle?: string;
  /** Optional feature subtitle override — shown below the headline */
  featureSubtitle?: string;
}

// ─── Feature row icon ─────────────────────────────────────────────────────────

function FeatureIcon({ highlight, color, successColor }: { highlight?: boolean; color: string; successColor: string }) {
  // highlight features use the primary accent; standard features use success green
  const iconColor = highlight ? color : successColor;
  return (
    <MaterialIcons
      name="check-circle"
      size={18}
      color={iconColor}
      style={{ marginTop: 1 }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaywallScreen({
  onDismiss,
  onSuccess,
  showFreeTier = true,
  featureTitle,
  featureSubtitle,
}: PaywallScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const lang = useLang();
  const pw = paywallExtStrings[lang as keyof typeof paywallExtStrings] ?? paywallExtStrings.en;
  const isRTL = useRTL();

  // ── RTL-aware helpers ──────────────────────────────────────────────────────
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  // ── Localised feature lists (built from pw.* keys) ─────────────────────────
  // Feature items — highlight:true renders a crown badge to signal a premium highlight
  // Primary (always visible): lead with the 3 most differentiated features + unlimited tracking
  const primaryFeatures: { text: string; highlight?: boolean }[] = [
    { text: pw.feat13, highlight: true },  // EKG waveform viewer & rhythm trends
    { text: Platform.OS === 'ios' ? pw.feat14ios : pw.feat14android, highlight: true },  // Scan Meal
    { text: Platform.OS === 'ios' ? pw.feat2ios : pw.feat2android, highlight: true }, // Apple Intelligence insights
    { text: pw.feat1 },                    // Unlimited vital signs
  ];
  // Extended (shown after "See all"): remaining features
  const extendedFeatures: { text: string; highlight?: boolean }[] = [
    { text: pw.feat3 },
    { text: pw.feat4 },
    { text: pw.feat5 },
    { text: pw.feat6 },
    { text: pw.feat7 },
    { text: pw.feat8 },
    { text: pw.feat9 },
    { text: pw.feat10 },
    { text: pw.feat11 },
    { text: pw.feat12 },
  ];
  const {
    products,
    productsLoading,
    purchasing,
    purchaseError,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    reloadProducts,
    accessState,
    trialStartMs,
    trialDaysRemaining,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<PlanSelection>(PRODUCT_IDS.yearly);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);

  const toggleFeatures = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    setFeaturesExpanded((v) => !v);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }, []);

  // ── isMounted guard — prevents setState after unmount (stops flash) ────────
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Keep a ref to accessState so restore handler never reads a stale closure
  const accessStateRef = useRef(accessState);
  useEffect(() => { accessStateRef.current = accessState; }, [accessState]);

  const monthlyProduct = products.find((p) => p.id === PRODUCT_IDS.monthly);
  const yearlyProduct = products.find((p) => p.id === PRODUCT_IDS.yearly);

  // Reload products when screen mounts — only once, guarded by isMounted
  useEffect(() => {
    let _active = true;
    reloadProducts().catch(() => {/* non-fatal */}).finally(() => {
      // no-op — just ensures we don't crash if component unmounted
    });
    return () => { _active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle primary CTA ────────────────────────────────────────────────────

  const handleStartTrial = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Free plan selected — just dismiss the paywall
    if (selectedPlan === FREE_PLAN_ID) {
      onDismiss?.();
      return;
    }

    // If trial already started, go straight to purchase
    if (trialStartMs) {
      await purchaseSubscription(selectedPlan as ProductId);
      if (isMounted.current) onSuccess?.(selectedPlan as ProductId);
      return;
    }

    // First time: start trial via StoreKit/Play (the introductory offer IS the trial)
    // On simulator/web, we record the trial locally.
    if (Platform.OS === "web" || products.length === 0) {
      // Web / no IAP: start local trial
      await startTrial();
      if (isMounted.current) onSuccess?.(selectedPlan as ProductId);
      return;
    }

    await purchaseSubscription(selectedPlan as ProductId);
    // If purchase succeeds, the listener in context will set accessState.
    // Also record local trial start for offline access.
    if (accessStateRef.current !== "subscribed") {
      await startTrial();
    }
    if (isMounted.current) onSuccess?.(selectedPlan as ProductId);
  }, [
    trialStartMs,
    selectedPlan,
    products.length,
    purchaseSubscription,
    startTrial,
    onSuccess,
    onDismiss,
  ]);

  // ── Restore ───────────────────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    if (!isMounted.current) return;
    setRestoring(true);
    setRestoreSuccess(false);
    try {
      await restorePurchases();
    } catch (_e) {
      // error is surfaced via purchaseError in context
    }
    if (!isMounted.current) return;
    setRestoring(false);
    // Read latest state via ref — avoids stale closure
    const latestState = accessStateRef.current;
    if (latestState === "subscribed") {
      setRestoreSuccess(true);
      Alert.alert(pw.purchasesRestored, pw.purchasesRestoredMsg, [
        { text: pw.continueBtn2, onPress: () => { if (isMounted.current) onSuccess?.(selectedPlan); } },
      ]);
    } else {
      Alert.alert(pw.nothingToRestore, pw.nothingToRestoreMsg);
    }
  }, [restorePurchases, onSuccess]);

  // ── Open link in in-app browser ──────────────────────────────────────────

  const openLink = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // non-fatal
    }
  }, []);

  // ── Manage subscription ──────────────────────────────────────────────────

  const handleManage = useCallback(async () => {
    if (Platform.OS === 'ios') {
      // Try native App Store deep link first; fall back to https:// if it fails
      try {
        const { Linking } = await import('react-native');
        await Linking.openURL(IOS_MANAGE_SUB_URL);
      } catch {
        await openLink(IOS_MANAGE_SUB_FALLBACK);
      }
    } else if (Platform.OS === 'android') {
      await openLink(ANDROID_MANAGE_SUB_URL);
    } else {
      await openLink(IOS_MANAGE_SUB_FALLBACK);
    }
  }, [openLink]);

  const s = makeStyles(colors, insets);

  // ── Loading guard — never show blank white screen while status is loading ──
  if (accessState === "loading") {
    return (
      <View style={[s.root, s.centeredRoot]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[s.loadingText]}>{pw.loadingSubscription}</Text>
      </View>
    );
  }

  // ── Already subscribed ─────────────────────────────────────────────────
  if (accessState === "subscribed") {
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
        <Text style={[s.headline, { textAlign: 'center', marginBottom: 8 }]}>{pw.youreSubscribed}</Text>
        <Text style={[s.subheadline, { textAlign: 'center', marginBottom: 24 }]}>
          {pw.fullAccessPremium}
        </Text>
        <Pressable
          style={({ pressed }) => [s.ctaButton, pressed && s.ctaButtonPressed]}
          onPress={handleManage}
        >
          <Text style={s.ctaButtonText}>{pw.manageSubscription}</Text>
        </Pressable>
        {onDismiss && (
          <Pressable onPress={onDismiss} style={s.freeTierButton}>
            <Text style={s.freeTierText}>{pw.closeBtn}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  // ── Trial active ─────────────────────────────────────────────────────────
  if (accessState === "trial_active") {
    // Use the canonical trialDaysRemaining from subscription context (single source of truth)
    const trialDaysLeft = trialDaysRemaining;
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⏳</Text>
        <Text style={[s.headline, { textAlign: 'center', marginBottom: 8 }]}>{pw.freeTrialActive}</Text>
        <Text style={[s.subheadline, { textAlign: 'center', marginBottom: 8 }]}>
          {pw.trialDaysRemaining.replace('{n}', String(trialDaysLeft))}
        </Text>
        <Text style={[s.subheadline, { textAlign: 'center', marginBottom: 24 }]}>
          {pw.subscribeNowCta}
        </Text>
        <Pressable
          style={({ pressed }) => [s.ctaButton, pressed && s.ctaButtonPressed, purchasing && s.ctaButtonDisabled]}
          onPress={handleStartTrial}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.ctaButtonText}>{pw.subscribeNow}</Text>
          )}
        </Pressable>
        {onDismiss && (
          <Pressable onPress={onDismiss} style={s.freeTierButton}>
            <Text style={s.freeTierText}>{pw.keepUsingTrial}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  // ── 'unknown' = fresh install / new user — fall through to main purchase UI ──

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={[s.badge, { textAlign }]}>{pw.badge}</Text>
          <Text style={s.headline}>{featureTitle ?? pw.freeTrial}</Text>
          <Text style={s.subheadline}>{featureSubtitle ?? pw.fullAccess}</Text>
        </View>

        {/* ── Feature list ── */}
        <View style={s.featureList}>
          {primaryFeatures.map(({ text, highlight }) => (
            <View key={text} style={[s.featureRow, { flexDirection: rowDir }]}>
              <FeatureIcon highlight={highlight} color={colors.primary} successColor={colors.success} />
              <Text style={[s.featureText, { textAlign }]}>{text}</Text>
              {highlight && (
                <View style={s.crownBadge}>
                  <Text style={s.crownIcon}>👑</Text>
                </View>
              )}
            </View>
          ))}
          {featuresExpanded && extendedFeatures.map(({ text, highlight }) => (
            <View key={text} style={[s.featureRow, { flexDirection: rowDir }]}>
              <FeatureIcon highlight={highlight} color={colors.primary} successColor={colors.success} />
              <Text style={[s.featureText, { textAlign }]}>{text}</Text>
              {highlight && (
                <View style={s.crownBadge}>
                  <Text style={s.crownIcon}>👑</Text>
                </View>
              )}
            </View>
          ))}
          {/* Expandable toggle row */}
          <Pressable
            style={({ pressed }) => [s.seeAllRow, pressed && { opacity: 0.6 }]}
            onPress={toggleFeatures}
          >
            <Text style={s.seeAllText}>
              {featuresExpanded
                ? pw.hideFeatures
                : pw.seeAllFeatures.replace('{n}', String(extendedFeatures.length))}
            </Text>
          </Pressable>
        </View>

        {/* ── Plan selector ── */}
        <View style={s.planContainer}>
          {/* Yearly plan */}
          <Pressable
            style={({ pressed }) => [
              s.planCard,
              selectedPlan === PRODUCT_IDS.yearly && s.planCardSelected,
              pressed && s.planCardPressed,
            ]}
            onPress={() => {
              setSelectedPlan(PRODUCT_IDS.yearly);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <View style={s.planBadgeRow}>
              <View style={s.bestValueBadge}>
                <Text style={s.bestValueText}>{pw.bestValue}</Text>
              </View>
            </View>
            <Text style={[s.planTitle, { textAlign }]}>{pw.yearly}</Text>
            {productsLoading ? (
              <View style={s.priceSkeleton}>
                <View style={[s.skeletonLine, { width: '70%', height: 18, marginBottom: 6 }]} />
                <View style={[s.skeletonLine, { width: '50%', height: 12 }]} />
              </View>
            ) : (
              <>
                <Text style={s.planPrice}>
                  {getDisplayPrice(yearlyProduct as any, FALLBACK_YEARLY)}
                  <Text style={s.planPeriod}> {pw.perYear}</Text>
                </Text>
                <Text style={s.introPrice}>{pw.introFreeTrial}</Text>
              </>
            )}
            <Text style={[s.planSaving, { textAlign }]}>{pw.saveVsMonthly}</Text>
          </Pressable>

          {/* Monthly plan */}
          <Pressable
            style={({ pressed }) => [
              s.planCard,
              selectedPlan === PRODUCT_IDS.monthly && s.planCardSelected,
              pressed && s.planCardPressed,
            ]}
            onPress={() => {
              setSelectedPlan(PRODUCT_IDS.monthly);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Text style={[s.planTitle, { textAlign }]}>{pw.monthly}</Text>
            {productsLoading ? (
              <View style={s.priceSkeleton}>
                <View style={[s.skeletonLine, { width: '70%', height: 18, marginBottom: 6 }]} />
                <View style={[s.skeletonLine, { width: '50%', height: 12 }]} />
              </View>
            ) : (
              <>
                <Text style={s.planPrice}>
                  {getDisplayPrice(monthlyProduct as any, FALLBACK_MONTHLY)}
                  <Text style={s.planPeriod}> {pw.perMonth}</Text>
                </Text>
                <Text style={s.introPrice}>{pw.introFreeTrial}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* ── Free plan card (full-width, below paid plans) ── */}
        {showFreeTier && onDismiss && (
          <Pressable
            style={({ pressed }) => [
              s.freePlanCard,
              selectedPlan === FREE_PLAN_ID && s.freePlanCardSelected,
              pressed && s.planCardPressed,
            ]}
            onPress={() => {
              setSelectedPlan(FREE_PLAN_ID);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.planTitle, { textAlign }]}>{pw.freePlan}</Text>
                <Text style={[s.planPrice, { fontSize: 15 }]}>
                  $0<Text style={s.planPeriod}> {pw.perMonth}</Text>
                </Text>
                <Text style={[s.planSaving, { textAlign, marginTop: 4 }]}>
                  {Platform.OS === 'ios'
                    ? pw.freePlanLimitsIOS
                    : pw.freePlanLimitsAndroid
                  }
                </Text>
              </View>
              {/* Selection indicator */}
              <View style={[
                s.freePlanRadio,
                selectedPlan === FREE_PLAN_ID && s.freePlanRadioSelected,
              ]} />
            </View>
          </Pressable>
        )}

        {/* ── Error ── */}
        {purchaseError ? (
          <Text style={s.errorText}>{purchaseError}</Text>
        ) : null}

        {/* ── Trust statement — privacy assurance above CTA ── */}
        {'trustStatement' in pw && (pw as typeof paywallExtStrings.en).trustStatement ? (
          <View style={s.trustRow}>
            <MaterialIcons name="lock" size={13} color={colors.success} style={{ marginRight: 5, marginTop: 1 }} />
            <Text style={s.trustText}>
              {(pw as typeof paywallExtStrings.en).trustStatement}
            </Text>
          </View>
        ) : (
          <View style={s.trustRow}>
            <MaterialIcons name="lock" size={13} color={colors.success} style={{ marginRight: 5, marginTop: 1 }} />
            <Text style={s.trustText}>Private. On-device. No health data sold.</Text>
          </View>
        )}

        {/* ── Primary CTA ── */}
        <Pressable
          style={({ pressed }) => [
            selectedPlan === FREE_PLAN_ID ? s.freePlanCtaButton : s.ctaButton,
            pressed && s.ctaButtonPressed,
            (purchasing || productsLoading) && selectedPlan !== FREE_PLAN_ID && s.ctaButtonDisabled,
          ]}
          onPress={handleStartTrial}
          disabled={(purchasing || productsLoading) && selectedPlan !== FREE_PLAN_ID}
        >
          {purchasing && selectedPlan !== FREE_PLAN_ID ? (
            <ActivityIndicator color="#fff" />
          ) : selectedPlan === FREE_PLAN_ID ? (
            <Text style={[s.ctaText, { color: colors.primary }]}>
              {pw.continueFreePlan}
            </Text>
          ) : (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text style={s.ctaText}>
                {trialStartMs ? pw.subscribeNow : pw.startTrial}
              </Text>
              {!trialStartMs && (
                <Text style={s.ctaSubText}>
                  {pw.trialCtaSub}
                </Text>
              )}
            </View>
          )}
        </Pressable>

        {/* ── Restore Purchases (prominent button, App Store guideline) ── */}
        <Pressable
          style={({ pressed }) => [
            s.restoreButton,
            pressed && s.ctaButtonPressed,
            restoring && s.ctaButtonDisabled,
          ]}
          onPress={handleRestore}
          disabled={restoring || purchasing}
        >
          {restoring ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={s.restoreButtonText}>
              {restoreSuccess ? pw.purchasesRestoredCheck : pw.restorePurchases}
            </Text>
          )}
        </Pressable>

        {/* ── Mandatory legal copy (Apple / Google required) ── */}
        <Text style={[s.legalText, { textAlign }]}>
          {Platform.OS === 'android' ? pw.legalGoogle : pw.legalApple}
        </Text>

        {/* ── Secondary actions ── */}
        <View style={s.secondaryRow}>
          <Pressable onPress={handleManage}>
            <Text style={s.secondaryLink}>{pw.manageSubscription}</Text>
          </Pressable>
        </View>

        {/* ── Privacy / Terms ── */}
        <View style={s.legalLinks}>
          <Pressable onPress={() => openLink(LEGAL_LINKS.privacy)}>
            <Text style={s.legalLink}>{pw.privacyPolicy}</Text>
          </Pressable>
          <Text style={s.secondarySep}>·</Text>
          <Pressable onPress={() => openLink(LEGAL_LINKS.terms)}>
            <Text style={s.legalLink}>{pw.termsOfService}</Text>
          </Pressable>
        </View>

        {/* Free tier dismiss link is now replaced by the Free plan card above */}

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centeredRoot: {
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
    },
    scroll: {
      paddingTop: insets.top + 24,
      paddingHorizontal: 20,
    },
    header: {
      alignItems: "center",
      marginBottom: 24,
    },
    badge: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: colors.primary,
      marginBottom: 8,
    },
    headline: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 8,
      lineHeight: 32,
    },
    subheadline: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 8,
    },
    featureList: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      gap: 10,
    },
    featureRow: {
      flexDirection: "row", // overridden at render time with rowDir for RTL
      alignItems: "flex-start",
      gap: 10,
    },
    featureText: {
      fontSize: 14,
      color: colors.foreground,
      flex: 1,
      lineHeight: 20,
    },
    crownBadge: {
      backgroundColor: 'rgba(255, 196, 0, 0.15)',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: 'rgba(255, 196, 0, 0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    crownIcon: {
      fontSize: 11,
      lineHeight: 15,
    },
    seeAllRow: {
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      alignItems: "center",
    },
    seeAllText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
    },
    planContainer: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 10,
    },
    planCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 2,
      borderColor: colors.border,
      minHeight: 120,
    },
    planCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      // Glow effect: platform-appropriate shadow
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 10,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    planCardPressed: {
      opacity: 0.85,
    },
    planBadgeRow: {
      marginBottom: 6,
    },
    bestValueBadge: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignSelf: "flex-start",
    },
    bestValueText: {
      fontSize: 9,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: 0.8,
    },
    planTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: 4,
    },
    planPrice: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.foreground,
    },
    planPeriod: {
      fontSize: 13,
      fontWeight: "400",
      color: colors.muted,
    },
    introPrice: {
      fontSize: 12,
      color: colors.success,
      fontWeight: "600",
      marginTop: 2,
    },
    priceSkeleton: {
      marginTop: 4,
      gap: 0,
    },
    skeletonLine: {
      backgroundColor: colors.border,
      borderRadius: 6,
      opacity: 0.7,
    },
    planSaving: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 4,
    },
    // Free plan card — normalized to match paid plan card dimensions
    freePlanCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 2,
      borderColor: colors.border,
      marginBottom: 16,
    },
    freePlanCardSelected: {
      borderColor: colors.primary,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
      }),
    },
    freePlanRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      marginLeft: 12,
    },
    freePlanRadioSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    freePlanCtaButton: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    // Trust statement row
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      paddingHorizontal: 8,
    },
    trustText: {
      fontSize: 12,
      color: colors.success,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    errorText: {
      fontSize: 13,
      color: colors.error,
      textAlign: "center",
      marginBottom: 8,
    },
    ctaButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 12,
      // Subtle depth: shadow on iOS, elevation on Android
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
      }),
    },
    ctaButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    ctaButtonDisabled: {
      opacity: 0.6,
    },
    ctaText: {
      fontSize: 17,
      fontWeight: "700",
      color: "#fff",
    },
    ctaSubText: {
      fontSize: 12,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.8)',
    },
    ctaButtonText: {
      fontSize: 17,
      fontWeight: "700",
      color: "#fff",
    },
    legalText: {
      fontSize: 11,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 16,
      marginBottom: 10,
    },
    disclaimerText: {
      fontSize: 10,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 15,
      marginBottom: 16,
      opacity: 0.75,
    },
    secondaryRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    secondaryLink: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: "500",
    },
    secondarySep: {
      fontSize: 13,
      color: colors.muted,
    },
    legalLinks: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    legalLink: {
      fontSize: 12,
      color: colors.muted,
      textDecorationLine: "underline",
    },
    freeTierButton: {
      alignItems: "center",
      paddingVertical: 12,
      marginBottom: 8,
    },
    freeTierText: {
      fontSize: 14,
      color: colors.muted,
      textDecorationLine: "underline",
    },
    restoreButton: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    restoreButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
    },
    unavailableCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 28,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      width: "100%",
      maxWidth: 380,
    },
    unavailableIcon: {
      fontSize: 40,
      marginBottom: 16,
    },
    unavailableTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 12,
    },
    unavailableBody: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 21,
      marginBottom: 24,
    },
  });
}
