/**
 * FloatingWellnessDisclaimer
 *
 * Apple App Review Guideline 1.4.1 compliance — floating wellness disclaimer
 * that remains visible while the user scrolls any tab screen.
 *
 * Design spec (pasted_content_8.txt):
 *   • Soft glassmorphism card
 *   • Subtle glow + rounded corners (18px)
 *   • Shield icon (green)
 *   • Background: rgba(15,20,30,0.92)
 *   • Accent: #22C55E  |  Border: rgba(34,197,94,0.35)  |  Text: white
 *   • Fade-in + slight upward float + gentle pulse once on first appearance
 *   • Expanded on first visit (6 s), then fades to compact mode
 *   • Compact: "🛡 Personal Wellness Use" — tap to expand
 *   • Dismiss (×) button: reappears on next launch, after 24 h, after app update
 *   • Permanently expanded when App Review build is detected
 *   • Reduced-motion: skip animations
 *   • VoiceOver / accessibilityRole support
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useLang } from '@/hooks/use-lang';
import { paywallExtStrings, hkPermStrings } from '@/lib/i18n';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_KEY_DISMISSED_AT = '@vsht:floating_disclaimer_dismissed_at_v1';
const STORAGE_KEY_DISMISSED_VERSION = '@vsht:floating_disclaimer_dismissed_version_v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentAppVersion(): string {
  try {
    return (Constants.expoConfig?.version ?? '1.0.0') as string;
  } catch {
    return '1.0.0';
  }
}

/** Returns true if the disclaimer should be shown (not dismissed within 24 h for the current version) */
async function shouldShowDisclaimer(): Promise<boolean> {
  try {
    const [dismissedAt, dismissedVersion] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_DISMISSED_AT),
      AsyncStorage.getItem(STORAGE_KEY_DISMISSED_VERSION),
    ]);
    const currentVersion = getCurrentAppVersion();
    // Reappear after app update
    if (dismissedVersion !== currentVersion) return true;
    // Reappear after 24 hours
    if (!dismissedAt) return true;
    const elapsed = Date.now() - parseInt(dismissedAt, 10);
    return elapsed >= 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

async function recordDismissal(): Promise<void> {
  try {
    const currentVersion = getCurrentAppVersion();
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY_DISMISSED_AT, String(Date.now())),
      AsyncStorage.setItem(STORAGE_KEY_DISMISSED_VERSION, currentVersion),
    ]);
  } catch {
    // ignore
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FloatingWellnessDisclaimerProps {
  /** Additional bottom offset so the bar clears the tab bar (default 0) */
  bottomOffset?: number;
  /** Position: 'bottom' (default) or 'top' */
  position?: 'bottom' | 'top';
}

export function FloatingWellnessDisclaimer({
  bottomOffset = 0,
  position = 'bottom',
}: FloatingWellnessDisclaimerProps) {
  const lang = useLang();

  // i18n strings — use hkPermStrings for the two-section text
  const hk = (hkPermStrings as any)[lang] ?? hkPermStrings.en;
  const pw = (paywallExtStrings as any)[lang] ?? paywallExtStrings.en;

  const title: string = hk.hkWellnessDisclaimer1 ?? 'Personal Wellness Use Only';
  // Use the exact spec wording from pasted_content_8.txt — hkWellnessNoticeBody has the full Apple-compliant text
  const body: string =
    hk.hkWellnessNoticeBody ??
    hk.hkWellnessDisclaimer2 ??
    pw.wellnessDisclaimer ??
    'VitalSync helps you organize and review health information from Apple Health, compatible devices, and personal records. The app is intended for wellness and educational purposes only and does not provide medical advice, diagnoses, treatment recommendations, or disease monitoring.';
  const termsLabel: string = hk.hkTermsOfUse ?? 'Terms of Use (EULA)';
  const privacyLabel: string = hk.hkPrivacyPolicy ?? 'Privacy Policy';

  // ── Visibility state ─────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detect App Review build (EXPO_PUBLIC_APP_REVIEW=true or __DEV__ + special flag)
  const isAppReview = !!(
    (Constants.expoConfig?.extra as any)?.appReview ||
    process.env.EXPO_PUBLIC_APP_REVIEW === 'true'
  );

  // ── Animations ───────────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(position === 'bottom' ? 20 : -20)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const expandHeight = useRef(new Animated.Value(1)).current;

  // ── Reduced motion check ─────────────────────────────────────────────────
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {});
  }, []);

  // ── Mount: check storage, then show ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    shouldShowDisclaimer().then((show) => {
      if (cancelled) return;
      if (show || isAppReview) {
        setVisible(true);
        setExpanded(true);
      }
    });
    return () => { cancelled = true; };
  }, [isAppReview]);

  // ── Entrance animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (reducedMotion) {
      fadeAnim.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Gentle pulse once
      if (!reducedMotion) {
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.025, duration: 300, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    });
  }, [visible, reducedMotion]);

  // ── Auto-collapse after 6 s (unless App Review mode) ────────────────────
  useEffect(() => {
    if (!visible || isAppReview) return;
    const timer = setTimeout(() => {
      if (!reducedMotion) {
        Animated.timing(expandHeight, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false, // height animation needs JS driver
        }).start(() => setExpanded(false));
      } else {
        setExpanded(false);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [visible, isAppReview, reducedMotion]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    if (isAppReview) return; // cannot dismiss in App Review mode
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    recordDismissal();
  }, [isAppReview, fadeAnim]);

  const handleToggleExpand = useCallback(() => {
    if (isAppReview) return;
    if (expanded) {
      if (!reducedMotion) {
        Animated.timing(expandHeight, {
          toValue: 0,
          duration: 250,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }).start(() => setExpanded(false));
      } else {
        setExpanded(false);
      }
    } else {
      setExpanded(true);
      expandHeight.setValue(0);
      if (!reducedMotion) {
        Animated.timing(expandHeight, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      } else {
        expandHeight.setValue(1);
      }
    }
  }, [expanded, isAppReview, reducedMotion, expandHeight]);

  if (!visible) return null;

  const positionStyle = position === 'bottom'
    ? { bottom: bottomOffset + 12, left: 16, right: 16 }
    : { top: 12, left: 16, right: 16 };

  return (
    <Animated.View
      style={[
        styles.container,
        positionStyle,
        {
          opacity: fadeAnim,
          transform: [
            { translateY },
            { scale: pulseScale },
          ],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityLiveRegion="polite"
    >
      {/* Compact mode — tap to expand */}
      {!expanded && !isAppReview ? (
        <Pressable
          style={styles.compactRow}
          onPress={handleToggleExpand}
          accessibilityRole="button"
          accessibilityLabel={`${title} — tap to expand`}
          accessibilityHint="Expands the full wellness disclaimer"
        >
          <Text style={styles.shieldIcon}>🛡</Text>
          <Text style={styles.compactTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ) : (
        /* Expanded mode */
        <View>
          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Text style={styles.shieldIconLarge}>🛡</Text>
            </View>
            <Text style={styles.expandedTitle}>{title}</Text>
            {!isAppReview && (
              <Pressable
                style={styles.dismissBtn}
                onPress={handleDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss wellness disclaimer"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.dismissIcon}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* Body text */}
          <Text style={styles.bodyText}>{body}</Text>

          {/* Legal links */}
          <View style={styles.linksRow}>
            <Pressable
              onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              accessibilityRole="link"
              accessibilityLabel={termsLabel}
            >
              <Text style={styles.linkText}>{termsLabel}</Text>
            </Pressable>
            <Text style={styles.linkSep}>·</Text>
            <Pressable
              onPress={() => Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/privacy-policy')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              accessibilityRole="link"
              accessibilityLabel={privacyLabel}
            >
              <Text style={styles.linkText}>{privacyLabel}</Text>
            </Pressable>
          </View>

          {/* Collapse hint (not in App Review mode) */}
          {!isAppReview && (
            <Pressable
              style={styles.collapseHint}
              onPress={handleToggleExpand}
              accessibilityRole="button"
              accessibilityLabel="Collapse disclaimer"
            >
              <Text style={styles.collapseText}>▲ Collapse</Text>
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = '#22C55E';
const BG = 'rgba(15,20,30,0.94)';
const BORDER = 'rgba(34,197,94,0.35)';
const TEXT = '#FFFFFF';
const TEXT_MUTED = 'rgba(255,255,255,0.72)';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 14,
    paddingVertical: 12,
    // Glow effect (iOS shadow)
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 12,
  },
  // ── Compact mode ──────────────────────────────────────────────────────────
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shieldIcon: {
    fontSize: 16,
  },
  compactTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.1,
  },
  chevron: {
    fontSize: 18,
    color: ACCENT,
    fontWeight: '700',
  },
  // ── Expanded mode ─────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldIconLarge: {
    fontSize: 15,
  },
  expandedTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: -0.1,
  },
  dismissBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissIcon: {
    fontSize: 10,
    color: TEXT_MUTED,
    fontWeight: '700',
    lineHeight: 14,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 17,
    color: TEXT_MUTED,
    marginBottom: 10,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  linkText: {
    fontSize: 11,
    fontWeight: '600',
    color: ACCENT,
    textDecorationLine: 'underline',
  },
  linkSep: {
    fontSize: 11,
    color: TEXT_MUTED,
  },
  collapseHint: {
    alignSelf: 'center',
    marginTop: 2,
  },
  collapseText: {
    fontSize: 10,
    color: TEXT_MUTED,
    fontWeight: '500',
  },
});
