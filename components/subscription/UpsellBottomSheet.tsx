/**
 * UpsellBottomSheet — VitalSync v2.9.63
 *
 * Apple-style dark premium upsell card shown as a bottom sheet.
 * Used by useUpsell() for all 8 contextual trigger types.
 *
 * Design: dark premium card, green accent CTA, lock icon, subtle glow,
 * concise text, clean spacing — matches the paywall aesthetic.
 */

import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRawLang } from "@/hooks/use-lang";
import { upsellStrings } from "@/lib/i18n";
import type { UpsellTrigger } from "@/lib/subscription/premium-upsell-engine";

interface UpsellBottomSheetProps {
  trigger: UpsellTrigger;
  visible: boolean;
  onDismiss: () => void;
  onCTA: () => void;
}

export function UpsellBottomSheet({
  trigger,
  visible,
  onDismiss,
  onCTA,
}: UpsellBottomSheetProps) {
  const rawLang = useRawLang();
  // Fallback: if the raw lang isn't in upsellStrings, use 'en'
  const strings =
    (upsellStrings as Record<string, typeof upsellStrings.en>)[rawLang] ??
    upsellStrings.en;

  const content = (strings as Record<string, { title: string; body: string } | string>)[trigger] as
    | { title: string; body: string }
    | undefined;

  const title = content?.title ?? strings.medication_first_add.title;
  const body = content?.body ?? strings.medication_first_add.body;

  function handleCTA() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onCTA();
    router.push("/paywall" as Parameters<typeof router.push>[0]);
  }

  function handleDismiss() {
    onDismiss();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: "#1A1A2E" }]}>
          {/* Glow accent bar */}
          <View style={[styles.glowBar, { backgroundColor: "#00C853" }]} />

          {/* Lock icon */}
          <View style={styles.lockRow}>
            <View style={[styles.lockBadge, { backgroundColor: "rgba(0,200,83,0.15)" }]}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Body */}
          <Text style={styles.body}>{body}</Text>

          {/* CTA button */}
          <Pressable
            onPress={handleCTA}
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: "#00C853", opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.ctaBtnText}>{strings.startTrial}</Text>
          </Pressable>

          {/* Dismiss */}
          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [styles.dismissBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.dismissText, { color: "rgba(255,255,255,0.45)" }]}>
              {strings.maybeLater}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    overflow: "hidden",
  },
  glowBar: {
    height: 3,
    width: 48,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
    shadowColor: "#00C853",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  lockRow: {
    alignItems: "center",
    marginBottom: 14,
  },
  lockBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  lockIcon: {
    fontSize: 26,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 26,
  },
  body: {
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#00C853",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  dismissBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 14,
  },
});
