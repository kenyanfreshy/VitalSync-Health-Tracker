/**
 * VitalSync Paywall Screen — v4.1 (Clean Dark Layout)
 *
 * Design: Dark background, compact feature carousel with pagination dots
 *         in the upper portion, frosted-glass CTA panel filling the lower half.
 *
 * Compliance (Apple Guideline 3.1.2(c)):
 *  - Billed amount is the LARGEST, most prominent element on each plan card
 *  - Free trial text is subordinate (smaller font, muted color, below price)
 *  - CTA reads "Continue with Annual Plan" / "Continue with Monthly Plan"
 *  - Disclosure paragraph appears DIRECTLY ABOVE the CTA button
 *  - No badge, banner, or graphic emphasises "FREE" more than the billed amount
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  ViewToken,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
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

// ─── Fallback prices ──────────────────────────────────────────────────────────
const FALLBACK_MONTHLY = "$4.99";
const FALLBACK_YEARLY = "$49.99";
const FALLBACK_MONTHLY_LABEL = "$4.99/month";
const FALLBACK_YEARLY_LABEL = "$49.99/year";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

// ─── Carousel slide data ──────────────────────────────────────────────────────
interface CarouselSlide {
  icon: string;
  title: string;
  subtitle: string; // kept for type compat — not rendered
  description: string; // kept for type compat — not rendered
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
  const textAlign = isRTL ? 'right' : 'left';

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
  const [activeSlide, setActiveSlide] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const accessStateRef = useRef(accessState);
  useEffect(() => { accessStateRef.current = accessState; }, [accessState]);

  const monthlyProduct = products.find((p) => p.id === PRODUCT_IDS.monthly);
  const yearlyProduct = products.find((p) => p.id === PRODUCT_IDS.yearly);

  useEffect(() => {
    reloadProducts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    const slides = getCarouselSlides(pw);
    const timer = setInterval(() => {
      setActiveSlide(prev => {
        const next = (prev + 1) % slides.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [pw]);

  // ── Derived price strings ─────────────────────────────────────────────────
  const yearlyPrice = getDisplayPrice(yearlyProduct as any, FALLBACK_YEARLY);
  const monthlyPrice = getDisplayPrice(monthlyProduct as any, FALLBACK_MONTHLY);
  const yearlyLabel = productsLoading ? FALLBACK_YEARLY_LABEL : `${yearlyPrice}/year`;
  const monthlyLabel = productsLoading ? FALLBACK_MONTHLY_LABEL : `${monthlyPrice}/month`;

  // ── Disclosure text (Apple 3.1.2(c)) ─────────────────────────────────────
  const selectedLabel = selectedPlan === PRODUCT_IDS.yearly ? yearlyLabel : monthlyLabel;
  const disclosureText = selectedPlan === FREE_PLAN_ID
    ? 'Free plan includes basic logging with limited history.'
    : `After the 14-day free trial, your subscription automatically renews at ${selectedLabel} unless canceled at least 24 hours before renewal. Manage in App Store Settings.`;

  // ── CTA label ─────────────────────────────────────────────────────────────
  const ctaLabel = selectedPlan === FREE_PLAN_ID
    ? ((pw as any).continueWithFree ?? 'Continue with Free Plan')
    : selectedPlan === PRODUCT_IDS.yearly
      ? ((pw as any).continueWithAnnual ?? 'Start 14-Day Free Trial')
      : ((pw as any).continueWithMonthly ?? 'Unlock Premium Features');

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

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveSlide(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const BRAND_BLUE_INLINE = '#38BDF8'; // secondary brand color for inline JSX use
  const s = makeStyles(colors, insets);

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (accessState === "loading") {
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={s.loadingLogo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 12 }} />
        <Text style={s.loadingText}>{pw.loadingSubscription}</Text>
      </View>
    );
  }

  // ── Already subscribed ─────────────────────────────────────────────────
  if (accessState === "subscribed") {
    return (
      <View style={[s.root, s.centeredRoot]}>
        <Image
          source={require('@/assets/images/icon.png')}
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
          source={require('@/assets/images/icon.png')}
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

  // ── Feature lists ─────────────────────────────────────────────────────────
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

  const carouselSlides = getCarouselSlides(pw);

  // ── Main purchase UI ──────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* Full-bleed background image */}
      <Image
        source={require('@/assets/images/paywall-bg.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Dark overlay gradient — heavier at bottom for CTA legibility */}
      <LinearGradient
        colors={['rgba(13,17,23,0.15)', 'rgba(13,17,23,0.52)', 'rgba(13,17,23,0.90)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Dismiss button (top-right) */}
      {onDismiss && (
        <Pressable
          style={[s.dismissBtn, { top: insets.top + 12 }]}
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="close" size={22} color="rgba(255,255,255,0.75)" />
        </Pressable>
      )}

      {/* App logo + badge — top area */}
      <View style={[s.logoArea, { paddingTop: insets.top + 20 }]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={s.headerLogo}
          resizeMode="contain"
        />
        <Text style={s.badge}>VITALSYNC PREMIUM</Text>
      </View>

      {/* Feature carousel */}
      <View style={s.carouselArea}>
        <FlatList
          ref={flatListRef}
          data={carouselSlides}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <View style={s.carouselSlide}>
              <Text style={s.carouselTitle}>{item.title}</Text>
            </View>
          )}
        />
        {/* Pagination dots */}
        <View style={s.dotsRow}>
          {carouselSlides.map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === activeSlide && s.dotActive]}
            />
          ))}
        </View>
      </View>

      {/* Bottom CTA panel — frosted glass style */}
      <ScrollView
        style={s.ctaPanel}
        contentContainerStyle={[s.ctaPanelContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Plan selector */}
        <View style={s.planRow}>
          {/* Annual plan */}
          <Pressable
            style={({ pressed }) => [
              s.planCard,
              selectedPlan === PRODUCT_IDS.yearly && s.planCardSelected,
              pressed && { opacity: 0.88 },
            ]}
            onPress={() => {
              setSelectedPlan(PRODUCT_IDS.yearly);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <View style={s.bestValueBadge}>
              <Text style={s.bestValueText}>BEST VALUE</Text>
            </View>
            <Text style={s.planLabel}>ANNUAL</Text>
            {productsLoading ? (
              <View style={[s.skeletonLine, { width: '80%', height: 26, marginVertical: 4 }]} />
            ) : (
              <Text style={s.planPrice}>
                {yearlyPrice}
                <Text style={s.planPeriodUnit}>/yr</Text>
              </Text>
            )}
            <Text style={s.trialSubText}>14-day free trial</Text>
            <Text style={s.savingText}>Save ~17%</Text>
            <View style={[s.radioOuter, selectedPlan === PRODUCT_IDS.yearly && s.radioOuterSelected]}>
              {selectedPlan === PRODUCT_IDS.yearly && <View style={s.radioInner} />}
            </View>
          </Pressable>

          {/* Monthly plan */}
          <Pressable
            style={({ pressed }) => [
              s.planCard,
              selectedPlan === PRODUCT_IDS.monthly && s.planCardSelected,
              pressed && { opacity: 0.88 },
            ]}
            onPress={() => {
              setSelectedPlan(PRODUCT_IDS.monthly);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Text style={s.planLabel}>MONTHLY</Text>
            {productsLoading ? (
              <View style={[s.skeletonLine, { width: '80%', height: 26, marginVertical: 4 }]} />
            ) : (
              <Text style={s.planPrice}>
                {monthlyPrice}
                <Text style={s.planPeriodUnit}>/mo</Text>
              </Text>
            )}
            <Text style={s.trialSubText}>14-day free trial</Text>
            <View style={[s.radioOuter, selectedPlan === PRODUCT_IDS.monthly && s.radioOuterSelected]}>
              {selectedPlan === PRODUCT_IDS.monthly && <View style={s.radioInner} />}
            </View>
          </Pressable>
        </View>

        {/* Free plan option */}
        {showFreeTier && onDismiss && (
          <Pressable
            style={({ pressed }) => [
              s.freePlanCard,
              selectedPlan === FREE_PLAN_ID && s.freePlanCardSelected,
              pressed && { opacity: 0.88 },
            ]}
            onPress={() => {
              setSelectedPlan(FREE_PLAN_ID);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={s.planLabel}>FREE PLAN</Text>
                <Text style={[s.planPrice, { fontSize: 20 }]}>
                  $0<Text style={s.planPeriodUnit}>/mo</Text>
                </Text>
                <Text style={s.trialSubText}>
                  {Platform.OS === 'ios' ? pw.freePlanLimitsIOS : pw.freePlanLimitsAndroid}
                </Text>
              </View>
              <View style={[s.radioOuter, selectedPlan === FREE_PLAN_ID && s.radioOuterSelected]}>
                {selectedPlan === FREE_PLAN_ID && <View style={s.radioInner} />}
              </View>
            </View>
          </Pressable>
        )}

        {/* Feature list — collapsed by default so Restore Purchases is always visible */}
        <View style={s.featureList}>
          {/* Tappable accordion header */}
          <Pressable
            style={({ pressed }) => [s.seeAllRow, { justifyContent: 'center', marginBottom: 0 }, pressed && { opacity: 0.6 }]}
            onPress={toggleFeatures}
          >
            <MaterialIcons
              name={featuresExpanded ? 'expand-less' : 'expand-more'}
              size={16}
              color="rgba(255,255,255,0.55)"
              style={{ marginRight: 4 }}
            />
            <Text style={s.seeAllText}>
              {featuresExpanded ? (pw.hideFeatures ?? "Hide Premium Features ▲") : (pw.showFeatures ?? "Premium Features ▼")}
            </Text>
          </Pressable>

          {/* Feature rows — only shown when expanded */}
          {featuresExpanded && [...primaryFeatures, ...extendedFeatures].map(({ text, highlight }) => (
            <View key={text} style={[s.featureRow, { alignItems: 'flex-start', gap: 10 }]}>
              <MaterialIcons
                name="check-circle"
                size={16}
                color={highlight ? BRAND_BLUE_INLINE : '#34D399'}
                style={{ marginTop: 3 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.featureText, { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: highlight ? BRAND_BLUE_INLINE : 'rgba(255,255,255,0.90)', marginBottom: 1 }]}>
                  {text.split(' — ')[0].split(' (')[0]}
                </Text>
                {(text.includes(' — ') || text.includes(' (') || text.includes(' & ') || text.length > 30) && (
                  <Text style={[s.featureText, { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '400' }]}>
                    {text.includes(' — ') ? text.split(' — ').slice(1).join(' — ') : text.includes(' (') ? text.split(' (').slice(1).join(' (').replace(/\)$/, '') : text}
                  </Text>
                )}
              </View>
              {highlight && (
                <View style={s.crownBadge}>
                  <Text style={s.crownIcon}>👑</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Error */}
        {purchaseError ? (
          <Text style={s.errorText}>{purchaseError}</Text>
        ) : null}

        {/* Disclosure (Apple 3.1.2(c) — MUST appear directly above CTA) */}
        <Text style={s.disclosureText}>{disclosureText}</Text>

        {/* Primary CTA */}
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
            <>
              <Text style={selectedPlan === FREE_PLAN_ID ? [s.ctaText, { color: BRAND_BLUE_INLINE }] : s.ctaText}>
                {ctaLabel}
              </Text>
              {selectedPlan !== FREE_PLAN_ID && (
                <Text style={s.ctaPriceLabel}>
                  {selectedPlan === PRODUCT_IDS.yearly
                    ? `${yearlyPrice}/year after trial. Cancel anytime.`
                    : `${monthlyPrice}/month. Cancel anytime.`}
                </Text>
              )}
            </>
          )}
        </Pressable>

        {/* Restore Purchases */}
        <Pressable
          style={({ pressed }) => [s.restoreButton, pressed && { opacity: 0.7 }, restoring && s.ctaButtonDisabled]}
          onPress={handleRestore}
          disabled={restoring || purchasing}
        >
          {restoring ? (
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
          ) : (
            <Text style={s.restoreButtonText}>
              {restoreSuccess ? '✓ Purchases Restored' : pw.restorePurchases}
            </Text>
          )}
        </Pressable>

        {/* Legal copy */}
        <Text style={s.legalText}>
          {Platform.OS === 'android' ? pw.legalGoogle : pw.legalApple}
        </Text>

        {/* Secondary actions */}
        <View style={s.secondaryRow}>
          <Pressable onPress={handleManage}>
            <Text style={s.secondaryLink}>{pw.manageSubscription}</Text>
          </Pressable>
        </View>

        {/* Privacy / Terms */}
        <View style={s.legalLinks}>
          <Pressable onPress={() => openLink(LEGAL_LINKS.privacy)}>
            <Text style={s.legalLink}>{pw.privacyPolicy}</Text>
          </Pressable>
          <Text style={s.secondarySep}>·</Text>
          <Pressable onPress={() => openLink(LEGAL_LINKS.terms)}>
            <Text style={s.legalLink}>{pw.termsOfService}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Carousel slide data ──────────────────────────────────────────────────────
function getCarouselSlides(pw: any): CarouselSlide[] {
  return [
    {
      icon: '',
      title: pw.slide1Title ?? 'UNLOCK PREMIUM HEALTH TOOLS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide2Title ?? 'SEE DEEPER HEALTH INSIGHTS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide3Title ?? 'ADVANCED EKG TRACKING',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide4Title ?? 'PROJECTED A1C ANALYSIS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide5Title ?? 'SMART MEDICATION REMINDERS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide6Title ?? 'ADVANCED HEALTH REPORTS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide7Title ?? 'POWERFUL HEALTH CORRELATIONS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide8Title ?? 'PERSONALIZED HEALTH INSIGHTS',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide9Title ?? 'COMPLETE VITAL HISTORY',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide10Title ?? 'BLUETOOTH DEVICE SUPPORT',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide11Title ?? 'CUSTOMIZE YOUR DASHBOARD',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide12Title ?? 'TRACK BETTER. LIVE BETTER.',
      subtitle: '',
      description: '',
    },
    {
      icon: '',
      title: pw.slide13Title ?? 'START YOUR HEALTH JOURNEY',
      subtitle: '',
      description: '',
    },
  ];
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  // VitalSync brand palette (dark mode)
  const GLASS_BG = 'rgba(13,17,23,0.82)';       // #0D1117 at 82% — matches app background
  const GLASS_BORDER = 'rgba(34,197,94,0.18)';  // emerald-green glass border (glowGreen)
  const TEXT_WHITE = '#F0F2FA';                  // foreground token
  const TEXT_MUTED = 'rgba(154,160,186,0.85)';  // muted token
  const BRAND_GREEN = '#22C55E';                 // primary / tint
  const BRAND_BLUE  = '#38BDF8';                 // secondary
  const BRAND_BLUE_DIM = 'rgba(56,189,248,0.18)'; // secondaryMuted

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#050A14',
    },
    centeredRoot: {
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
      backgroundColor: colors.background,
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
    // ── Dismiss button ──────────────────────────────────────────────────────
    dismissBtn: {
      position: 'absolute',
      right: 16,
      zIndex: 100,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // ── Logo area ───────────────────────────────────────────────────────────
    logoArea: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 8,
      zIndex: 10,
    },
    headerLogo: {
      width: 56,
      height: 56,
      marginBottom: 6,
      borderRadius: 16,
      ...Platform.select({
        ios: {
          shadowColor: '#22C55E',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 16,
        },
        android: { elevation: 12 },
      }),
    },
    badge: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      color: BRAND_GREEN,
      marginBottom: 4,
      textAlign: 'center',
    },
    headline: {
      fontSize: 26,
      fontWeight: '800',
      color: TEXT_WHITE,
      textAlign: 'center',
      marginBottom: 6,
      lineHeight: 32,
    },
    subheadline: {
      fontSize: 14,
      color: TEXT_MUTED,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 8,
    },
    // ── Carousel ────────────────────────────────────────────────────────────
    carouselArea: {
      flexShrink: 1,
      justifyContent: 'center',
      zIndex: 10,
      paddingVertical: 4,
    },
    carouselSlide: {
      width: SCREEN_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      gap: 6,
    },
    carouselIcon: {
      fontSize: 36,
      marginBottom: 2,
    },
    carouselTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: TEXT_WHITE,
      textAlign: 'center',
      lineHeight: 23,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    carouselDesc: {
      fontSize: 13,
      color: BRAND_GREEN,
      textAlign: 'center',
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: 0.2,
      marginTop: 4,
    },
    carouselSub: {
      fontSize: 14,
      color: TEXT_MUTED,
      textAlign: 'center',
      lineHeight: 21,
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      marginBottom: 4,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.30)',
    },
    dotActive: {
      width: 18,
      backgroundColor: BRAND_GREEN,
    },
    // ── CTA panel ───────────────────────────────────────────────────────────
    ctaPanel: {
      backgroundColor: GLASS_BG,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: GLASS_BORDER,
      flex: 1,
      zIndex: 20,
    },
    ctaPanelContent: {
      paddingHorizontal: 20,
      paddingTop: 14,
      gap: 8,
    },
    // ── Plan cards ──────────────────────────────────────────────────────────
    planRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 4,
    },
    planCard: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: 10,
      borderWidth: 1.5,
      borderColor: GLASS_BORDER,
      minHeight: 110,
      position: 'relative',
    },
    planCardSelected: {
      borderColor: BRAND_GREEN,
      backgroundColor: 'rgba(34,197,94,0.12)',
      ...Platform.select({
        ios: {
          shadowColor: BRAND_GREEN,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
        },
        android: { elevation: 8 },
      }),
    },
    bestValueBadge: {
      backgroundColor: 'rgba(34,197,94,0.22)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignSelf: 'flex-start',
      marginBottom: 6,
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.45)',
    },
    bestValueText: {
      fontSize: 9,
      fontWeight: '800',
      color: BRAND_GREEN,
      letterSpacing: 0.8,
    },
    planLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: TEXT_MUTED,
      letterSpacing: 1,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    planPrice: {
      fontSize: 26,
      fontWeight: '800',
      color: TEXT_WHITE,
      marginBottom: 2,
    },
    planPeriodUnit: {
      fontSize: 13,
      fontWeight: '400',
      color: TEXT_MUTED,
    },
    trialSubText: {
      fontSize: 10,
      color: TEXT_MUTED,
      marginBottom: 2,
      lineHeight: 14,
    },
    savingText: {
      fontSize: 10,
      color: '#34D399',
      fontWeight: '600',
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: GLASS_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      top: 10,
      right: 10,
    },
    radioOuterSelected: {
      borderColor: BRAND_GREEN,
    },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: BRAND_GREEN,
    },
    skeletonLine: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 6,
    },
    // Free plan card
    freePlanCard: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: 14,
      borderWidth: 1.5,
      borderColor: GLASS_BORDER,
    },
    freePlanCardSelected: {
      borderColor: BRAND_BLUE,
      backgroundColor: BRAND_BLUE_DIM,
    },
    freePlanCtaButton: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: BRAND_BLUE,
    },
    // Feature list
    featureList: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: GLASS_BORDER,
    },
    featureSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: TEXT_WHITE,
      marginBottom: 4,
      letterSpacing: 0.3,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    featureText: {
      fontSize: 13,
      color: TEXT_MUTED,
      flex: 1,
      lineHeight: 18,
    },
    crownBadge: {
      backgroundColor: 'rgba(255, 196, 0, 0.15)',
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderWidth: 1,
      borderColor: 'rgba(255, 196, 0, 0.30)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    crownIcon: {
      fontSize: 10,
      lineHeight: 14,
    },
    seeAllRow: {
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: GLASS_BORDER,
      alignItems: 'center',
    },
    seeAllText: {
      fontSize: 12,
      fontWeight: '600',
      color: BRAND_BLUE,
    },
    // Trust row
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    trustText: {
      fontSize: 11,
      color: '#34D399',
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    // Disclosure
    disclosureText: {
      fontSize: 10,
      color: TEXT_MUTED,
      textAlign: 'center',
      lineHeight: 15,
    },
    // Error
    errorText: {
      fontSize: 12,
      color: '#F87171',
      textAlign: 'center',
    },
    // CTA button
    ctaButton: {
      backgroundColor: BRAND_GREEN,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: BRAND_GREEN,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.55,
          shadowRadius: 12,
        },
        android: { elevation: 8 },
      }),
    },
    ctaButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    ctaButtonDisabled: {
      opacity: 0.55,
    },
    ctaText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#0D1117',
      letterSpacing: 0.2,
    },
    ctaPriceLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: 'rgba(5,10,20,0.65)',
      marginTop: 3,
      letterSpacing: 0.1,
    },
    // Restore
    restoreButton: {
      backgroundColor: 'transparent',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: GLASS_BORDER,
    },
    restoreButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: BRAND_BLUE,
    },
    // Legal
    legalText: {
      fontSize: 10,
      color: TEXT_MUTED,
      textAlign: 'center',
      lineHeight: 15,
    },
    secondaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    secondaryLink: {
      fontSize: 12,
      color: BRAND_BLUE,
      fontWeight: '500',
    },
    secondarySep: {
      fontSize: 12,
      color: TEXT_MUTED,
    },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    legalLink: {
      fontSize: 11,
      color: TEXT_MUTED,
      textDecorationLine: 'underline',
    },
    freeTierButton: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    freeTierText: {
      fontSize: 13,
      color: TEXT_MUTED,
      textDecorationLine: 'underline',
    },
  });
}
