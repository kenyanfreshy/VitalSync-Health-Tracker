/**
 * VitalSync Paywall Screen — v3.0 (Apple Guideline 3.1.2(c) Compliant)
 *
 * Compliance changes:
 *  - Billed amount is the LARGEST, most prominent element on each plan card
 *  - Free trial text is subordinate (smaller font, muted color, below price)
 *  - CTA reads "Continue with Annual Plan" / "Continue with Monthly Plan"
 *  - Disclosure paragraph appears DIRECTLY ABOVE the CTA button
 *  - No badge, banner, or graphic emphasises "FREE" more than the billed amount
 *  - 3D VitalSync logo in header
 *  - Scrollable premium feature list (expandable)
 *  - Loading fallback: never shows blank screen while StoreKit loads
 *  - Products-unavailable fallback: shows paywall with fallback prices, never dismisses
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

// ─── Manage Subscription URLs ─────────────────────────────────────────────────
const IOS_MANAGE_SUB_URL = "itms-apps://apps.apple.com/account/subscriptions";
const IOS_MANAGE_SUB_FALLBACK = "https://apps.apple.com/account/subscriptions";
const ANDROID_MANAGE_SUB_URL = "https://play.google.com/store/account/subscriptions";

// ─── Fallback prices (shown while StoreKit loads or if products unavailable) ──
const FALLBACK_MONTHLY = "$6.99";
const FALLBACK_YEARLY = "$69.99";
const FALLBACK_MONTHLY_LABEL = "$6.99/month";
const FALLBACK_YEARLY_LABEL = "$69.99/year";

function getDisplayPrice(product: Subscription | undefined, fallback: string): string {
  if (!product) return fallback;
  return (product as Subscription & { localizedPrice?: string }).localizedPrice ?? fallback;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PaywallScreenProps {
  onDismiss?: () => void;
  onSuccess?: (planId?: string) => void;
  showFreeTier?: boolean;
  featureTitle?: string;
  featureSubtitle?: string;
}

// ─── Feature check icon ───────────────────────────────────────────────────────
function FeatureIcon({ highlight, color, successColor }: { highlight?: boolean; color: string; successColor: string }) {
  return (
    <MaterialIcons
      name="check-circle"
      size={18}
      color={highlight ? color : successColor}
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

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  // Feature lists
  const primaryFeatures: { text: string; highlight?: boolean }[] = [
    { text: pw.feat13, highlight: true },
    { text: Platform.OS === 'ios' ? pw.feat14ios : pw.feat14android, highlight: true },
    { text: Platform.OS === 'ios' ? pw.feat2ios : pw.feat2android, highlight: true },
    { text: pw.feat1 },
  ];
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
    if (Platform.OS !== "web") Haptics.selectionAsync();
  }, []);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const accessStateRef = useRef(accessState);
  useEffect(() => { accessStateRef.current = accessState; }, [accessState]);

  const monthlyProduct = products.find((p) => p.id === PRODUCT_IDS.monthly);
  const yearlyProduct = products.find((p) => p.id === PRODUCT_IDS.yearly);

  // Reload products on mount — only once
  useEffect(() => {
    reloadProducts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived price strings ─────────────────────────────────────────────────
  const yearlyPrice = getDisplayPrice(yearlyProduct as any, FALLBACK_YEARLY);
  const monthlyPrice = getDisplayPrice(monthlyProduct as any, FALLBACK_MONTHLY);
  const yearlyLabel = productsLoading ? FALLBACK_YEARLY_LABEL : `${yearlyPrice}/year`;
  const monthlyLabel = productsLoading ? FALLBACK_MONTHLY_LABEL : `${monthlyPrice}/month`;

  // ── Disclosure text (Apple 3.1.2(c) — must appear above CTA) ─────────────
  const selectedLabel = selectedPlan === PRODUCT_IDS.yearly ? yearlyLabel : monthlyLabel;
  const disclosureText = selectedPlan === FREE_PLAN_ID
    ? 'Free plan includes basic logging with limited history.'
    : `After the 14-day free trial, your subscription automatically renews at ${selectedLabel} unless canceled at least 24 hours before renewal. Manage in App Store Settings.`;

  // ── CTA label (Apple 3.1.2(c) — must say "Continue with [Plan]") ─────────
  const ctaLabel = selectedPlan === FREE_PLAN_ID
    ? (pw.continueFreePlan ?? 'Continue with Free Plan')
    : selectedPlan === PRODUCT_IDS.yearly
      ? 'Continue with Annual Plan'
      : 'Continue with Monthly Plan';

  // ── Handle primary CTA ────────────────────────────────────────────────────
  const handleStartTrial = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (selectedPlan === FREE_PLAN_ID) {
      onDismiss?.();
      return;
    }

    if (trialStartMs) {
      await purchaseSubscription(selectedPlan as ProductId);
      if (isMounted.current) onSuccess?.(selectedPlan as ProductId);
      return;
    }

    if (Platform.OS === "web" || products.length === 0) {
      await startTrial();
      if (isMounted.current) onSuccess?.(selectedPlan as ProductId);
      return;
    }

    await purchaseSubscription(selectedPlan as ProductId);
    if (accessStateRef.current !== "subscribed") {
      await startTrial();
    }
    if (isMounted.current) onSuccess?.(selectedPlan as ProductId);
  }, [trialStartMs, selectedPlan, products.length, purchaseSubscription, startTrial, onSuccess, onDismiss]);

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!isMounted.current) return;
    setRestoring(true);
    setRestoreSuccess(false);
    try {
      await restorePurchases();
    } catch (_e) {}
    if (!isMounted.current) return;
    setRestoring(false);
    const latestState = accessStateRef.current;
    if (latestState === "subscribed") {
      setRestoreSuccess(true);
      Alert.alert(pw.purchasesRestored, pw.purchasesRestoredMsg, [
        { text: pw.continueBtn2, onPress: () => { if (isMounted.current) onSuccess?.(selectedPlan); } },
      ]);
    } else {
      Alert.alert(pw.nothingToRestore, pw.nothingToRestoreMsg);
    }
  }, [restorePurchases, onSuccess, selectedPlan, pw]);

  const openLink = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {}
  }, []);

  const handleManage = useCallback(async () => {
    if (Platform.OS === 'ios') {
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

  // ── Loading guard — NEVER show blank screen while StoreKit loads ──────────
  // Per Apple audit: show paywall with fallback prices, never dismiss
  if (accessState === "loading") {
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Image
          source={require('@/assets/images/vitalsync-3d-logo-paywall.png')}
          style={s.loadingLogo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 12 }} />
        <Text style={s.loadingText}>{pw.loadingSubscription}</Text>
        <Text style={[s.loadingText, { marginTop: 6, fontSize: 12 }]}>
          Loading subscription options…
        </Text>
      </View>
    );
  }

  // ── Already subscribed ─────────────────────────────────────────────────
  if (accessState === "subscribed") {
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Image
          source={require('@/assets/images/vitalsync-3d-logo-paywall.png')}
          style={s.headerLogo}
          resizeMode="contain"
        />
        <Text style={[s.headline, { textAlign: 'center', marginBottom: 8 }]}>{pw.youreSubscribed}</Text>
        <Text style={[s.subheadline, { textAlign: 'center', marginBottom: 24 }]}>{pw.fullAccessPremium}</Text>
        <Pressable
          style={({ pressed }) => [s.ctaButton, pressed && s.ctaButtonPressed]}
          onPress={handleManage}
        >
          <Text style={s.ctaText}>{pw.manageSubscription}</Text>
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
    const trialDaysLeft = trialDaysRemaining;
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Image
          source={require('@/assets/images/vitalsync-3d-logo-paywall.png')}
          style={s.headerLogo}
          resizeMode="contain"
        />
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
            <Text style={s.ctaText}>{pw.subscribeNow}</Text>
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

  // ── Main purchase UI (unknown / new user) ─────────────────────────────────
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header: 3D Logo + Badge + Headline ── */}
        <View style={s.header}>
          <Image
            source={require('@/assets/images/vitalsync-3d-logo-paywall.png')}
            style={s.headerLogo}
            resizeMode="contain"
          />
          <Text style={[s.badge, { textAlign: 'center' }]}>VITALSYNC PREMIUM</Text>
          <Text style={s.headline}>{featureTitle ?? '14-Day Free Trial'}</Text>
          <Text style={s.subheadline}>{featureSubtitle ?? 'Full access to all premium features. Cancel anytime.'}</Text>
        </View>

        {/* ── Plan selector (price-first, per Apple 3.1.2(c)) ── */}
        <View style={s.planContainer}>
          {/* Annual plan */}
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
            {/* BEST VALUE badge */}
            <View style={s.planBadgeRow}>
              <View style={s.bestValueBadge}>
                <Text style={s.bestValueText}>BEST VALUE</Text>
              </View>
            </View>
            <Text style={[s.planLabel, { textAlign }]}>ANNUAL PLAN</Text>
            {/* Price is the LARGEST element — Apple 3.1.2(c) */}
            {productsLoading ? (
              <View style={s.priceSkeleton}>
                <View style={[s.skeletonLine, { width: '70%', height: 28, marginBottom: 6 }]} />
              </View>
            ) : (
              <Text style={s.planPrice}>
                {yearlyPrice}
                <Text style={s.planPeriodUnit}>/year</Text>
              </Text>
            )}
            {/* Free trial is SUBORDINATE — smaller, muted */}
            <Text style={s.trialSubText}>Includes a 14-day free trial</Text>
            <Text style={[s.planSaving, { textAlign }]}>Save ~16% vs monthly</Text>
            {/* Selection indicator */}
            <View style={[s.radioOuter, selectedPlan === PRODUCT_IDS.yearly && s.radioOuterSelected]}>
              {selectedPlan === PRODUCT_IDS.yearly && <View style={s.radioInner} />}
            </View>
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
            <Text style={[s.planLabel, { textAlign }]}>MONTHLY PLAN</Text>
            {productsLoading ? (
              <View style={s.priceSkeleton}>
                <View style={[s.skeletonLine, { width: '70%', height: 28, marginBottom: 6 }]} />
              </View>
            ) : (
              <Text style={s.planPrice}>
                {monthlyPrice}
                <Text style={s.planPeriodUnit}>/month</Text>
              </Text>
            )}
            <Text style={s.trialSubText}>Includes a 14-day free trial</Text>
            <View style={[s.radioOuter, selectedPlan === PRODUCT_IDS.monthly && s.radioOuterSelected]}>
              {selectedPlan === PRODUCT_IDS.monthly && <View style={s.radioInner} />}
            </View>
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
                <Text style={[s.planLabel, { textAlign }]}>FREE PLAN</Text>
                <Text style={[s.planPrice, { fontSize: 22 }]}>
                  $0<Text style={s.planPeriodUnit}>/month</Text>
                </Text>
                <Text style={[s.trialSubText, { textAlign }]}>
                  {Platform.OS === 'ios' ? pw.freePlanLimitsIOS : pw.freePlanLimitsAndroid}
                </Text>
              </View>
              <View style={[s.radioOuter, selectedPlan === FREE_PLAN_ID && s.radioOuterSelected]}>
                {selectedPlan === FREE_PLAN_ID && <View style={s.radioInner} />}
              </View>
            </View>
          </Pressable>
        )}

        {/* ── Feature list (scrollable / expandable) ── */}
        <View style={s.featureList}>
          <Text style={[s.featureSectionTitle, { textAlign }]}>What's included</Text>
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
            </View>
          ))}
          <Pressable
            style={({ pressed }) => [s.seeAllRow, pressed && { opacity: 0.6 }]}
            onPress={toggleFeatures}
          >
            <Text style={s.seeAllText}>
              {featuresExpanded
                ? 'Hide features ▲'
                : `See all ${extendedFeatures.length} more features ▼`}
            </Text>
          </Pressable>
        </View>

        {/* ── Error ── */}
        {purchaseError ? (
          <Text style={s.errorText}>{purchaseError}</Text>
        ) : null}

        {/* ── Trust statement ── */}
        <View style={s.trustRow}>
          <MaterialIcons name="lock" size={13} color={colors.success} style={{ marginRight: 5, marginTop: 1 }} />
          <Text style={s.trustText}>Private. On-device. No health data sold.</Text>
        </View>

        {/* ── Disclosure (Apple 3.1.2(c) — MUST appear directly above CTA) ── */}
        <View style={s.disclosureBox}>
          <Text style={[s.disclosureText, { textAlign: 'center' }]}>
            {disclosureText}
          </Text>
        </View>

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
          ) : (
            <Text style={selectedPlan === FREE_PLAN_ID ? [s.ctaText, { color: colors.primary }] : s.ctaText}>
              {ctaLabel}
            </Text>
          )}
        </Pressable>

        {/* ── Restore Purchases ── */}
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
              {restoreSuccess ? '✓ Purchases Restored' : pw.restorePurchases}
            </Text>
          )}
        </Pressable>

        {/* ── Mandatory legal copy ── */}
        <Text style={[s.legalText, { textAlign: 'center' }]}>
          {Platform.OS === 'android' ? pw.legalGoogle : pw.legalApple}
        </Text>

        {/* ── Secondary actions ── */}
        <View style={s.secondaryRow}>
          <Pressable onPress={handleManage}>
            <Text style={s.secondaryLink}>{pw.manageSubscription}</Text>
          </Pressable>
        </View>

        {/* ── Privacy / Terms — always visible ── */}
        <View style={s.legalLinks}>
          <Pressable onPress={() => openLink(LEGAL_LINKS.privacy)}>
            <Text style={s.legalLink}>{pw.privacyPolicy}</Text>
          </Pressable>
          <Text style={s.secondarySep}>·</Text>
          <Pressable onPress={() => openLink(LEGAL_LINKS.terms)}>
            <Text style={s.legalLink}>{pw.termsOfService}</Text>
          </Pressable>
        </View>

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
    loadingLogo: {
      width: 80,
      height: 80,
      marginBottom: 24,
    },
    loadingText: {
      marginTop: 8,
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
    },
    scroll: {
      paddingTop: insets.top + 20,
      paddingHorizontal: 20,
    },
    header: {
      alignItems: "center",
      marginBottom: 20,
    },
    headerLogo: {
      width: 88,
      height: 88,
      marginBottom: 12,
    },
    badge: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: colors.primary,
      marginBottom: 6,
    },
    headline: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 6,
      lineHeight: 32,
    },
    subheadline: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 8,
    },
    // ── Plan cards ──────────────────────────────────────────────────────────
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
      minHeight: 140,
      position: 'relative',
    },
    planCardSelected: {
      borderColor: colors.primary,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 10,
        },
        android: { elevation: 8 },
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
    planLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.8,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    // Price is the LARGEST element — Apple 3.1.2(c) compliance
    planPrice: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.foreground,
      marginBottom: 4,
    },
    planPeriodUnit: {
      fontSize: 14,
      fontWeight: "400",
      color: colors.muted,
    },
    // Free trial text is SUBORDINATE — smaller, muted — Apple 3.1.2(c)
    trialSubText: {
      fontSize: 11,
      color: colors.muted,
      marginBottom: 4,
      lineHeight: 15,
    },
    planSaving: {
      fontSize: 11,
      color: colors.success,
      fontWeight: '600',
      marginTop: 2,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      top: 12,
      right: 12,
    },
    radioOuterSelected: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    priceSkeleton: {
      marginTop: 4,
    },
    skeletonLine: {
      backgroundColor: colors.border,
      borderRadius: 6,
      opacity: 0.7,
    },
    // Free plan card
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
        android: { elevation: 6 },
      }),
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
    // Feature list
    featureList: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      gap: 10,
    },
    featureSectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.foreground,
      marginBottom: 4,
      letterSpacing: 0.3,
    },
    featureRow: {
      flexDirection: "row",
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
    // Trust row
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      paddingHorizontal: 8,
    },
    trustText: {
      fontSize: 12,
      color: colors.success,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    // Disclosure box — directly above CTA (Apple 3.1.2(c))
    disclosureBox: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    disclosureText: {
      fontSize: 11,
      color: colors.muted,
      lineHeight: 16,
    },
    // Error
    errorText: {
      fontSize: 13,
      color: colors.error,
      textAlign: "center",
      marginBottom: 8,
    },
    // CTA button
    ctaButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 12,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        },
        android: { elevation: 6 },
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
    // Restore
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
    // Legal
    legalText: {
      fontSize: 11,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 16,
      marginBottom: 10,
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
  });
}
