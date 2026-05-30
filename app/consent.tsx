/**
 * GDPR / CCPA Consent Banner
 *
 * Shown on first launch (before onboarding) and after "Delete All My Data".
 * Stores the acceptance timestamp in AsyncStorage under GDPR_CONSENT_KEY.
 * Once accepted, routes to onboarding (or the main app if already onboarded).
 *
 * Features:
 *  - Age verification checkbox (must be 13 or older)
 *  - "I Agree & Continue" button disabled until age checkbox is checked
 *  - Localized via useT hook (TranslationProvider)
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { useT } from '@/lib/i18n-ai';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Storage Key ──────────────────────────────────────────────────────────────
export const GDPR_CONSENT_KEY = '@vsht:gdprConsentAccepted';
export const GDPR_CONSENT_VERSION = '1.0';

export async function hasAcceptedGdprConsent(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(GDPR_CONSENT_KEY);
    return val !== null;
  } catch (_unused) {
    return false;
  }
}

export async function markGdprConsentAccepted(): Promise<void> {
  await safeSetItem(
    GDPR_CONSENT_KEY,
    JSON.stringify({ version: GDPR_CONSENT_VERSION, acceptedAt: new Date().toISOString() })
  );
}

// ─── Localization strings (defined OUTSIDE component for stable reference) ────
const CONSENT_SCREEN_EN = {
  title: 'Your Privacy Matters',
  subtitle: 'Health is a way of life — and your data is yours alone. Here is how VitalSync protects it.',

  point1Title: 'All data stays on your device',
  point1Body:
    'Your health records, vitals, and notes are stored locally in encrypted storage. Nothing is sent to external servers without your explicit action.',

  point2Title: 'No selling or sharing',
  point2Body:
    'VitalSync does not sell, rent, or share your personal health data with advertisers, data brokers, or third parties.',

  point3Title: 'You can erase your data anytime',
  point3Body:
    'You can delete all your data at any time from Settings → Privacy → Delete All My Data. This is permanent and cannot be undone.',

  point4Title: 'Built for people, not profit',
  point4Body:
    'VitalSync was built by a nurse and athlete\'s child who believes health tracking should serve you — not advertisers, not data brokers, not anyone else.',

  privacyPolicy: 'Privacy Policy',
  termsOfUse: 'Terms of Use',

  ageCheckLabel: 'I confirm I am 13 years of age or older',

  legalNote:
    'By tapping "I Agree & Continue" you confirm you are 13 or older and agree to the Privacy Policy and Terms of Use. Your choice is saved on this device.',

  agreeBtn: 'Begin My Journey',
  footerNote: 'You can review or withdraw consent at any time in Settings → Privacy.',
} as const;

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ConsentScreen() {
  const router = useRouter();
  const t = useT(CONSENT_SCREEN_EN);

  const [accepting, setAccepting] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);

  const canAccept = ageVerified && !accepting;

  function toggleAgeVerified() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setAgeVerified((v) => !v);
  }

  async function handleAccept() {
    if (!canAccept) return;
    setAccepting(true);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await markGdprConsentAccepted();
      const onboarded = await hasCompletedOnboarding();
      if (onboarded) {
        router.replace('/(tabs)/' as any);
      } else {
        router.replace('/onboarding' as any);
      }
    } catch (e) {
      console.warn('[VitalSync] GDPR consent accept failed:', e);
      // Proceed anyway so the user is not blocked
      router.replace('/onboarding' as any);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      {/* Shield icon area */}
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>🛡️</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.subtitle}>{t.subtitle}</Text>

        {/* Key points */}
        <View style={styles.card}>
          <ConsentPoint
            emoji="📱"
            title={t.point1Title}
            body={t.point1Body}
          />
          <Divider />
          <ConsentPoint
            emoji="🔒"
            title={t.point2Title}
            body={t.point2Body}
          />
          <Divider />
          <ConsentPoint
            emoji="🗑️"
            title={t.point3Title}
            body={t.point3Body}
          />
          <Divider />
          <ConsentPoint
            emoji="🌍"
            title={t.point4Title}
            body={t.point4Body}
          />
        </View>

        {/* Legal links */}
        <View style={styles.linksRow}>
          <Pressable
            onPress={() => Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/privacy-policy')}
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.linkText}>{t.privacyPolicy}</Text>
          </Pressable>
          <Text style={styles.linkSep}>·</Text>
          <Pressable
            onPress={() => Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/subscription-plans?v=1')}
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.linkText}>{t.termsOfUse}</Text>
          </Pressable>
        </View>

        {/* Age verification checkbox */}
        <Pressable
          onPress={toggleAgeVerified}
          style={({ pressed }) => [
            styles.ageCheckRow,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ageVerified }}
          accessibilityLabel={t.ageCheckLabel}
        >
          <View style={[styles.checkbox, ageVerified && styles.checkboxChecked]}>
            {ageVerified && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.ageCheckLabel}>{t.ageCheckLabel}</Text>
        </Pressable>

        <Text style={styles.legalNote}>{t.legalNote}</Text>
      </ScrollView>

      {/* Accept button */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleAccept}
          disabled={!canAccept}
          style={({ pressed }) => [
            styles.acceptBtn,
            pressed && canAccept && { transform: [{ scale: 0.97 }], opacity: 0.9 },
            !canAccept && styles.acceptBtnDisabled,
          ]}
        >
          {accepting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.acceptBtnText, !canAccept && styles.acceptBtnTextDisabled]}>
              {t.agreeBtn}
            </Text>
          )}
        </Pressable>
        <Text style={styles.footerNote}>{t.footerNote}</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ConsentPoint({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.point}>
      <Text style={styles.pointEmoji}>{emoji}</Text>
      <View style={styles.pointText}>
        <Text style={styles.pointTitle}>{title}</Text>
        <Text style={styles.pointBody}>{body}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  iconWrap: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  icon: {
    fontSize: 56,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    marginBottom: 20,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  pointEmoji: {
    fontSize: 22,
    marginTop: 1,
  },
  pointText: {
    flex: 1,
  },
  pointTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  pointBody: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginHorizontal: 16,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  linkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  linkText: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  linkSep: {
    fontSize: 14,
    color: '#475569',
  },
  // ── Age verification checkbox ──────────────────────────────────────────────
  ageCheckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#475569',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0EA5E9',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 16,
  },
  ageCheckLabel: {
    flex: 1,
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 19,
  },
  legalNote: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 10,
  },
  acceptBtn: {
    backgroundColor: '#0EA5E9',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  acceptBtnDisabled: {
    backgroundColor: '#1E3A4A',
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  acceptBtnTextDisabled: {
    color: '#475569',
  },
  footerNote: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
  },
});
