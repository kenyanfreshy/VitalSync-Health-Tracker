/**
 * /log/nutrition — Full-screen Nutrition Log screen.
 *
 * Acts as a deep-link-safe wrapper around AiFoodCameraSheet, presenting it
 * as a proper screen (not just a modal overlay) so it can be reached from:
 *   - The Log tab hub card
 *   - Deep links (e.g. vitalsync://log/nutrition)
 *   - Any future notification action
 *
 * The sheet is always visible (visible={true}) and the back button dismisses
 * the screen via router.back().
 *
 * After a meal is successfully logged, the screen navigates to the Record tab
 * (/(tabs)/record?scrollToNutrition=1) so the user can immediately see their
 * updated nutrition records without having to navigate manually.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useLang } from '@/hooks';
import { AiFoodCameraSheet, ScanMode } from '@/components/ai-food-camera-sheet';
import { nutritionStrings, foodCameraStrings } from '@/lib/i18n';
import { logEvent } from '@/lib/analytics';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
export default function NutritionLogScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const t = ((nutritionStrings as unknown as Record<string, typeof nutritionStrings.en>)[lang] ?? nutritionStrings.en);
  const fc = (foodCameraStrings as unknown as Record<string, typeof foodCameraStrings.en>)[lang] ?? foodCameraStrings.en;
  const insets = useSafeAreaInsets();
  const isDark = colors.background === '#151718' || (colors.background as string).startsWith('#0');

  // Accept an optional ?mode=plate|search|barcode param so callers can
  // deep-link directly into the right scan mode.
  const params = useLocalSearchParams<{ mode?: string }>();
  const resolvedMode: ScanMode =
    (params.mode as ScanMode | undefined) &&
    ['home', 'plate', 'barcode', 'search'].includes(params.mode as string)
      ? (params.mode as ScanMode)
      : 'home';

  // The sheet is always open on this screen; closing it navigates back
  const [sheetVisible, setSheetVisible] = useState(true);
  const [initialMode] = useState<ScanMode>(resolvedMode);

  // Premium gate for scan meal — fires when the user taps the Scan Meal tab
  // from within the search mode (food search → scan meal path), AND when the
  // screen is opened via a deep-link with mode=plate or mode=barcode.
  const { isPremium, requirePremium: requireScanMealPremium, PremiumGateSheet: ScanMealGateSheet } = usePremiumGate();

  // Deep-link guard: if the screen was opened with a scan mode directly
  // (e.g. vitalsync://log/nutrition?mode=plate from a widget/notification)
  // and the user is not premium, trigger the gate immediately on mount.
  useEffect(() => {
    if (!isPremium && (resolvedMode === 'plate' || resolvedMode === 'barcode')) {
      const featureLabel = resolvedMode === 'barcode'
        ? (fc.scanBarcodeTitle ?? 'Scan Barcode')
        : (fc.scanMealTitle ?? 'Scan a Meal');
      // Trigger the gate by calling requirePremium with a no-op callback
      requireScanMealPremium(() => {}, { feature: featureLabel as import('@/lib/subscription/use-premium-gate').PremiumFeature })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setSheetVisible(false);
    // Small delay so the sheet close animation can play before navigating
    setTimeout(() => router.back(), 180);
  }

  /**
   * Called immediately after a meal is successfully logged.
   * Does NOT navigate away — the AiFoodCameraSheet will show a
   * "Log Another" / "Done" Alert. The Alert's "Done" button calls
   * onClose (handleClose), which navigates back. "Log Another" resets
   * the form so the user can log more foods without leaving the screen.
   */
  function handleMealLogged() {
    // Intentionally left empty — navigation is handled by the Alert buttons
    // inside AiFoodCameraSheet ("Done" → onClose → router.back(),
    // "Log Another" → resets form state).
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0D1117' : '#F8FAFC' }]}>
      {/* Minimal header with back button */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleClose();
          }}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back to Log"
        >
          <Text style={[styles.backChevron, { color: isDark ? '#94A3B8' : '#64748B' }]}>‹</Text>
          <Text style={[styles.backLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{t.back}</Text>
        </Pressable>
        <Text style={[styles.title, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* AiFoodCameraSheet rendered as an always-visible overlay */}
      <AiFoodCameraSheet
        visible={sheetVisible}
        initialMode={initialMode}
        onClose={handleClose}
        onMealLogged={handleMealLogged}
        onScanMealPress={
          // Only gate the mode toggle when the sheet was opened in search mode.
          // If the screen was opened directly in scan/plate mode the gate was
          // already checked by the caller (index.tsx requireScanMealPremium).
          initialMode === 'search'
            ? requireScanMealPremium(() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }, { feature: fc.scanMealTitle ?? 'Scan Meal' })
            : undefined
        }
        onBarcodeScanPress={
          initialMode === 'search'
            ? requireScanMealPremium(() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                logEvent('barcode_scan_gate_tap', { source: 'nutrition_screen' });
              }, { feature: fc.scanBarcodeTitle ?? 'Scan Barcode' })
            : undefined
        }
      />
      {ScanMealGateSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 60,
  },
  backChevron: {
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 28,
    marginTop: -2,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
});
