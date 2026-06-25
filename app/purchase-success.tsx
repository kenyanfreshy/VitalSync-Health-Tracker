/**
 * Post-Purchase Confirmation Screen
 *
 * Shown immediately after a successful subscription purchase or trial start.
 * Celebrates the unlock with a confetti burst, personalized plan headline,
 * and a summary of what's now available, then routes back to the Dashboard.
 *
 * Receives `planId` as a route param from app/paywall.tsx.
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import ConfettiCannon from "react-native-confetti-cannon";
import { useColors } from "@/hooks/use-colors";

import { PRODUCT_IDS, useSubscription } from "@/lib/subscription/subscription-context";

type ConfettiCannonRef = InstanceType<typeof ConfettiCannon>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── What's unlocked ─────────────────────────────────────────────────────
const UNLOCKED_FEATURES = [
  { icon: "📊", label: "Unlimited vital signs & lab tracking" },
  { icon: "✨", label: "Evidence-based personal health insights" },
  { icon: "💊", label: "Medication & appointment management" },
  { icon: "📄", label: "Advanced health reports & PDF export" },
  { icon: "🔗", label: "HealthKit sync & smart reminders" },
  { icon: "🔬", label: "Correlation engine & pattern detection" },
  { icon: "🧬", label: "Lab results tracking & trend analysis" },
  { icon: "🩺", label: "Clinical narrative generation" },
];

// ─── Plan label helper ────────────────────────────────────────────────────────
// NOTE: Do NOT hardcode trial text here. Trial text is only shown when
// StoreKit confirms introductory offer eligibility (hasIntroOffer === true).
function getPlanLabel(planId: string | undefined, hasIntroOffer: boolean, introOfferDays: number | null): string {
  const trialSuffix = hasIntroOffer && introOfferDays ? ` · ${introOfferDays}-day free trial` : '';
  if (planId === PRODUCT_IDS.yearly) return `Annual Plan${trialSuffix}`;
  if (planId === PRODUCT_IDS.monthly) return `Monthly Plan${trialSuffix}`;
  return hasIntroOffer && introOfferDays ? `${introOfferDays}-day free trial` : 'VitalSync Premium';
}

export default function PurchaseSuccessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(colors, insets);

  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { hasIntroOffer, introOfferDays } = useSubscription();
  const planLabel = getPlanLabel(planId, hasIntroOffer, introOfferDays);

  // ── Confetti cannon ref ──────────────────────────────────────────────────
  const confettiRef = useRef<ConfettiCannonRef>(null);

  // ── Entrance animations ──────────────────────────────────────────────────
  const emojiScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    // Haptic celebration on mount
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Emoji pop
    Animated.spring(emojiScale, {
      toValue: 1,
      tension: 60,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Content fade + slide
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 350,
        delay: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 350,
        delay: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // Fire confetti after a short delay so it appears after the emoji pops
    const confettiTimer = setTimeout(() => {
      confettiRef.current?.start();
    }, 300);

    return () => clearTimeout(confettiTimer);
  }, [emojiScale, contentOpacity, contentTranslateY]);

  const handleContinue = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.replace("/(tabs)");
  };

  return (
    <View style={s.root}>
      {/* Confetti burst — rendered above everything, pointer-events off */}
      {Platform.OS !== "web" && (
        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
          autoStart={false}
          fadeOut
          fallSpeed={3000}
          explosionSpeed={400}
          colors={["#0a7ea4", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]}
        />
      )}

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Celebration emoji ── */}
        <Animated.View style={[s.emojiContainer, { transform: [{ scale: emojiScale }] }]}>
          <Text style={s.emoji}>🎉</Text>
        </Animated.View>

        {/* ── Headline ── */}
        <Animated.View
          style={[
            s.headerBlock,
            { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
          ]}
        >
          <Text style={s.headline}>You&apos;re in!</Text>
          <Text style={s.planBadge}>{planLabel}</Text>
          <Text style={s.subheadline}>
            Welcome to VitalSync Premium. Here&apos;s everything that&apos;s now unlocked:
          </Text>
        </Animated.View>

        {/* ── Unlocked features list ── */}
        <Animated.View
          style={[
            s.featureCard,
            { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
          ]}
        >
          {UNLOCKED_FEATURES.map((item) => (
            <View key={item.label} style={s.featureRow}>
              <Text style={s.featureIcon}>{item.icon}</Text>
              <Text style={s.featureText}>{item.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── CTA ── */}
        <Animated.View
          style={[
            s.ctaBlock,
            { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
          ]}
        >
          <Pressable
            style={({ pressed }) => [s.ctaButton, pressed && s.ctaButtonPressed]}
            onPress={handleContinue}
          >
            <Text style={s.ctaText}>Start Exploring</Text>
          </Pressable>
          <Text style={s.footnote}>
            You can manage your subscription at any time in Settings.
          </Text>
        </Animated.View>

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(
  colors: ReturnType<typeof useColors>,
  insets: { top: number; bottom: number },
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      paddingTop: insets.top + 32,
      paddingHorizontal: 24,
      alignItems: "center",
    },
    emojiContainer: {
      marginBottom: 20,
    },
    emoji: {
      fontSize: 72,
      textAlign: "center",
    },
    headerBlock: {
      alignItems: "center",
      marginBottom: 28,
    },
    headline: {
      fontSize: 32,
      fontWeight: "800",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 8,
      lineHeight: 38,
    },
    planBadge: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 5,
      overflow: "hidden",
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    subheadline: {
      fontSize: 15,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 8,
    },
    featureCard: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
      marginBottom: 28,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    featureIcon: {
      fontSize: 20,
      width: 28,
      textAlign: "center",
    },
    featureText: {
      fontSize: 14,
      color: colors.foreground,
      flex: 1,
      lineHeight: 20,
    },
    ctaBlock: {
      width: "100%",
      alignItems: "center",
    },
    ctaButton: {
      width: "100%",
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: "center",
      marginBottom: 14,
    },
    ctaButtonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    ctaText: {
      fontSize: 17,
      fontWeight: "700",
      color: "#fff",
    },
    footnote: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 18,
    },
  });
}
