/**
 * Consent & Data Use Screen
 *
 * Surfaces the full consent agreement the user accepted during onboarding,
 * including the accepted version, acceptance date, and a re-consent flow
 * for when the policy is updated.
 *
 * Accessible from Settings → Privacy → Consent & Data Use.
 */

import { safeFormatDate } from '@/lib/utils';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openBrowserAsync } from 'expo-web-browser';

import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme, useColors, useLang } from '@/hooks';
import { settingsExtStrings } from '@/lib/i18n';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  hasAcceptedCurrentConsent,
  markConsentAccepted,
  resetConsent,
  CONSENT_VERSION,
} from '@/components/consent-modal';
import {
  hasGeminiConsent,
  markGeminiConsent,
  revokeGeminiConsent,
  hasAppleIntelligenceConsent,
  markAppleIntelligenceConsent,
  revokeAppleIntelligenceConsent,
} from '@/lib/gemini-consent';

// ─── Constants ───────────────────────────────────────────────────────────────

const CONSENT_KEY        = '@vsht:consent_accepted';
const CONSENT_DATE_KEY   = '@vsht:consent_accepted_date';
const PRIVACY_URL        = 'https://vitalsyncpersonalwellnesshub.com/article/privacy-policy';
const TERMS_URL          = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Human-readable changelog for each consent version */
const CONSENT_HISTORY: { version: number; date: string; summary: string }[] = [
  {
    version: 1,
    date: 'March 2026',
    summary:
      'Initial consent agreement. Covers local-only data storage, no third-party data sharing, ' +
      'optional HealthKit integration, and the right to delete all data at any time.',
  },
];

/** What the user is consenting to — shown as a scannable list */
const CONSENT_POINTS: { icon: string; title: string; body: string }[] = [
  {
    icon: '📱',
    title: 'Local Storage Only',
    body: 'All health data is stored exclusively on this device. Nothing is uploaded to any server or cloud service.',
  },
  {
    icon: '🚫',
    title: 'No Third-Party Sharing',
    body: 'Your data is never sold, shared, or transmitted to advertisers, insurers, or any third party.',
  },
  {
    icon: '🔒',
    title: 'End-to-End Privacy',
    body: 'Data is protected by iOS Secure Enclave encryption and optional Face ID / Touch ID app lock.',
  },
  {
    icon: '👤',
    title: 'No Account Required',
    body: 'VitalSync works fully offline without an account. No email, phone number, or identity is collected.',
  },
  {
    icon: '✉️',
    title: 'Optional HealthKit',
    body: 'Apple HealthKit integration is optional. You can revoke access at any time in iOS Settings → Health.',
  },
  {
    icon: '🗑️',
    title: 'Right to Delete',
    body: 'You can permanently delete all locally stored data at any time from Settings → Data Management → Clear All Data.',
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConsentScreen() {
  const lang = useLang();
  const se = settingsExtStrings[lang as keyof typeof settingsExtStrings] ?? settingsExtStrings.en;
  const colors    = useColors();
  const scheme    = useColorScheme() ?? 'light';
  const isDark    = scheme === 'dark';

  const [accepted, setAccepted]         = useState<boolean>(false);
  const [acceptedVersion, setAcceptedVersion] = useState<number>(0);
  const [acceptedDate, setAcceptedDate] = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [revoking, setRevoking]         = useState(false);

  // ── Gemini AI consent state ───────────────────────────────────────────────────────────────
  const [geminiConsented, setGeminiConsented] = useState<boolean>(false);
  const [revokingGemini, setRevokingGemini]   = useState(false);

  // ── Apple Intelligence consent state ─────────────────────────────────────
  const [appleIntelligenceConsented, setAppleIntelligenceConsented] = useState<boolean>(false);
  const [revokingAppleIntelligence, setRevokingAppleIntelligence] = useState(false);

  // ── Load consent state ─────────────────────────────────────────────────────
  const loadConsentState = useCallback(async () => {
    try {
      const [raw, dateStr, geminiOk, appleIntelligenceOk] = await Promise.all([
        AsyncStorage.getItem(CONSENT_KEY),
        AsyncStorage.getItem(CONSENT_DATE_KEY),
        hasGeminiConsent(),
        hasAppleIntelligenceConsent(),
      ]);
      if (raw === null) {
        setAccepted(false);
        setAcceptedVersion(0);
      } else {
        const stored = raw === 'true' ? 1 : parseInt(raw, 10);
        const version = isNaN(stored) ? 0 : stored;
        setAcceptedVersion(version);
        setAccepted(version >= CONSENT_VERSION);
      }
      setAcceptedDate(dateStr);
      setGeminiConsented(geminiOk);
      setAppleIntelligenceConsented(appleIntelligenceOk);
    } catch (_unused) {
      setAccepted(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConsentState(); }, [loadConsentState]);

  // ── Re-accept consent ──────────────────────────────────────────────────────
  async function handleAccept() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markConsentAccepted();
    await safeSetItem(CONSENT_DATE_KEY, new Date().toISOString());
    await loadConsentState();
  }

  // ── Revoke consent (reset) ─────────────────────────────────────────────────
  function handleRevoke() {
    Alert.alert(
      se.revokeConsent ?? 'Revoke Consent',
      se.revokeConsentMsg ?? 'This will clear your consent record. The consent agreement will be shown again on your next app launch.\n\nYour health data will not be deleted.',
      [
        { text: se.cancelLabel ?? 'Cancel', style: 'cancel' },
        {
          text: se.revokeLabel ?? 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevoking(true);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await resetConsent();
            await AsyncStorage.removeItem(CONSENT_DATE_KEY);
            await loadConsentState();
            setRevoking(false);
          },
        },
      ],
    );
  }

  // ── Open external links ────────────────────────────────────────────────────
  // ── Grant Gemini AI consent ───────────────────────────────────────────────
  async function handleGrantGemini() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markGeminiConsent();
    await loadConsentState();
  }

  // ── Grant Apple Intelligence consent ─────────────────────────────────────
  async function handleGrantAppleIntelligence() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markAppleIntelligenceConsent();
    setAppleIntelligenceConsented(true);
  }

  // ── Revoke Gemini AI consent ──────────────────────────────────────────────
  function handleRevokeGemini() {
    Alert.alert(
      'Revoke AI Food Scan Consent',
      'This will remove your consent for sending food photos to Google Gemini. The consent dialog will appear again the next time you try to scan a meal.\n\nYour logged nutrition data will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokingGemini(true);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await revokeGeminiConsent();
            await loadConsentState();
            setRevokingGemini(false);
          },
        },
      ],
    );
  }

  // ── Revoke Apple Intelligence consent ────────────────────────────────────
  function handleRevokeAppleIntelligence() {
    Alert.alert(
      'Revoke Apple Intelligence Consent',
      'This will disable AI wellness summaries powered by Apple Intelligence. The consent dialog will appear again the next time you open the AI Wellness Insights card.\n\nYour health data will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokingAppleIntelligence(true);
            try {
              await revokeAppleIntelligenceConsent();
              setAppleIntelligenceConsented(false);
            } finally {
              setRevokingAppleIntelligence(false);
            }
          },
        },
      ]
    );
  }

    async function openLink(url: string) {
    try {
      if (Platform.OS !== 'web') {
        await openBrowserAsync(url, { presentationStyle: 'pageSheet' as any });
      } else {
        await Linking.openURL(url);
      }
    } catch (_unused) {
      await Linking.openURL(url);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const statusColor   = accepted ? colors.bpGreen : colors.warning;
  const statusLabel   = accepted ? (se.consentAccepted ?? 'Accepted') : (se.consentNotAccepted ?? 'Not Accepted');
  const statusBg      = accepted
    ? colors.bpGreen + (isDark ? '18' : '12')
    : colors.warning + (isDark ? '18' : '12');
  const statusBorder  = accepted
    ? colors.bpGreen + (isDark ? '40' : '30')
    : colors.warning + (isDark ? '40' : '30');

  if (loading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>{se.dataPrivacy ?? 'Privacy'}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{se.consentScreenTitle ?? 'Consent & Data Use'}</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status badge ──────────────────────────────────────────────────── */}
        <View style={[styles.statusCard, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: statusColor }]}>
              {statusLabel}
              {acceptedVersion > 0 ? ` · Version ${acceptedVersion}` : ''}
            </Text>
            {acceptedDate ? (
              <Text style={[styles.statusSub, { color: colors.muted }]}>
                Accepted on{' '}
                {safeFormatDate(acceptedDate, undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
            ) : accepted ? (
              <Text style={[styles.statusSub, { color: colors.muted }]}>{se.acceptanceDateNotRecorded ?? 'Acceptance date not recorded'}</Text>
            ) : (
              <Text style={[styles.statusSub, { color: colors.muted }]}>
                {se.consentNotYetAccepted ?? 'Consent agreement has not been accepted'}
              </Text>
            )}
          </View>
          {accepted && (
            <IconSymbol name="checkmark.shield.fill" size={22} color={statusColor} />
          )}
        </View>

        {/* ── What you agreed to ────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{se.whatYouAgreedTo ?? 'What You Agreed To'}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {CONSENT_POINTS.map((point, idx) => (
            <View key={point.title}>
              <View style={styles.pointRow}>
                <Text style={styles.pointIcon}>{point.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pointTitle, { color: colors.foreground }]}>{point.title}</Text>
                  <Text style={[styles.pointBody, { color: colors.muted }]}>{point.body}</Text>
                </View>
              </View>
              {idx < CONSENT_POINTS.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── Version history ───────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{se.versionHistory ?? 'Version History'}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {CONSENT_HISTORY.map((entry, idx) => (
            <View key={entry.version}>
              <View style={styles.historyRow}>
                <View style={[
                  styles.versionBadge,
                  {
                    backgroundColor: entry.version === CONSENT_VERSION
                      ? colors.primary + '20'
                      : colors.muted + '15',
                    borderColor: entry.version === CONSENT_VERSION
                      ? colors.primary + '40'
                      : colors.border,
                  },
                ]}>
                  <Text style={[
                    styles.versionBadgeText,
                    { color: entry.version === CONSENT_VERSION ? colors.primary : colors.muted },
                  ]}>
                    v{entry.version}
                    {entry.version === CONSENT_VERSION ? ' · Current' : ''}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyDate, { color: colors.muted }]}>{entry.date}</Text>
                  <Text style={[styles.historyBody, { color: colors.foreground }]}>{entry.summary}</Text>
                </View>
              </View>
              {idx < CONSENT_HISTORY.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── Legal links ───────────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{se.legalDocuments ?? 'Legal Documents'}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => openLink(PRIVACY_URL)}
            accessibilityRole="link"
            accessibilityLabel="View VitalSync Privacy Policy"
          >
            <IconSymbol name="doc.text.fill" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: colors.foreground }]}>Privacy Policy</Text>
              <Text style={[styles.linkSub, { color: colors.muted }]}>Tap to view our Privacy Policy</Text>
              <Text style={[styles.linkSub, { color: colors.muted, marginTop: 1 }]}>Last updated March 2026</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => openLink(TERMS_URL)}
            accessibilityRole="link"
            accessibilityLabel="View VitalSync Terms of Use"
          >
            <IconSymbol name="doc.text.fill" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: colors.foreground }]}>Terms of Use</Text>
              <Text style={[styles.linkSub, { color: colors.muted }]}>Tap to view our Terms of Use</Text>
              <Text style={[styles.linkSub, { color: colors.muted, marginTop: 1 }]}>Last updated March 2026</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        </View>

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        {!accepted && (
          <Pressable
            style={({ pressed }) => [
              styles.acceptBtn,
              { backgroundColor: colors.bpGreen, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleAccept}
          >
            <IconSymbol name="checkmark.shield.fill" size={18} color="#fff" />
            <Text style={styles.acceptBtnText}>{se.acceptCurrentAgreement ?? 'Accept Current Agreement'} (v{CONSENT_VERSION})</Text>
          </Pressable>
        )}

        {accepted && (
          <Pressable
            style={({ pressed }) => [
              styles.revokeBtn,
              {
                backgroundColor: isDark ? colors.error + '15' : '#FFF5F5',
                borderColor: colors.error + '40',
                opacity: pressed || revoking ? 0.7 : 1,
              },
            ]}
            onPress={handleRevoke}
            disabled={revoking}
          >
            {revoking ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <IconSymbol name="xmark.circle.fill" size={16} color={colors.error} />
            )}
            <Text style={[styles.revokeBtnText, { color: colors.error }]}>
              {revoking ? (se.revoking ?? 'Revoking…') : (se.revokeConsent ?? 'Revoke Consent')}
            </Text>
          </Pressable>
        )}


        {/* ── Gemini AI Food Scan Consent ─────────────────────────────────────── */}
        <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
        <View style={{ gap: 6 }}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>AI FOOD SCAN CONSENT</Text>
          <View style={[styles.consentStatusRow, {
            backgroundColor: geminiConsented ? (colors.bpGreen + (isDark ? '18' : '12')) : (colors.warning + (isDark ? '18' : '12')),
            borderColor: geminiConsented ? (colors.bpGreen + (isDark ? '40' : '30')) : (colors.warning + (isDark ? '40' : '30')),
          }]}>
            <Text style={[styles.statusDot, { color: geminiConsented ? colors.bpGreen : colors.warning }]}>●</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: geminiConsented ? colors.bpGreen : colors.warning }]}>
                {geminiConsented ? 'Consent Given' : 'Not Yet Consented'}
              </Text>
              <Text style={[styles.statusSub, { color: colors.muted }]}>
                {geminiConsented
                  ? 'Food photos may be sent to Google Gemini for Nutrition Analysis.'
                  : 'Enable to allow Camera Scan to send food photos to Google Gemini for analysis.'}
              </Text>
            </View>
          </View>
          {!geminiConsented && (
            <Pressable
              style={({ pressed }) => [
                styles.acceptBtn,
                { backgroundColor: colors.bpGreen, opacity: pressed ? 0.85 : 1, marginTop: 4 },
              ]}
              onPress={handleGrantGemini}
            >
              <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
              <Text style={styles.acceptBtnText}>Enable AI Food Scan (Camera Scan)</Text>
            </Pressable>
          )}
          {geminiConsented && (
            <Pressable
              style={({ pressed }) => [
                styles.revokeBtn,
                {
                  backgroundColor: isDark ? colors.error + '15' : '#FFF5F5',
                  borderColor: colors.error + '40',
                  opacity: pressed || revokingGemini ? 0.7 : 1,
                },
              ]}
              onPress={handleRevokeGemini}
              disabled={revokingGemini}
            >
              {revokingGemini ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <IconSymbol name="xmark.circle.fill" size={16} color={colors.error} />
              )}
              <Text style={[styles.revokeBtnText, { color: colors.error }]}>
                {revokingGemini ? 'Revoking…' : 'Revoke AI Food Scan Consent'}
              </Text>
            </Pressable>
          )}
        </View>

                {/* ── Apple Intelligence Consent ──────────────────────────────────────────────────────────────────────────────────────── */}
        <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
        <View style={{ gap: 6 }}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>APPLE INTELLIGENCE CONSENT</Text>
          <View style={[styles.consentStatusRow, {
            backgroundColor: appleIntelligenceConsented ? (colors.bpGreen + (isDark ? '18' : '12')) : (colors.warning + (isDark ? '18' : '12')),
            borderColor: appleIntelligenceConsented ? (colors.bpGreen + (isDark ? '40' : '30')) : (colors.warning + (isDark ? '40' : '30')),
          }]}>
            <Text style={[styles.statusDot, { color: appleIntelligenceConsented ? colors.bpGreen : colors.warning }]}>●</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: appleIntelligenceConsented ? colors.bpGreen : colors.warning }]}>
                {appleIntelligenceConsented ? 'Consent Given' : 'Not Yet Consented'}
              </Text>
              <Text style={[styles.statusSub, { color: colors.muted }]}>
                {appleIntelligenceConsented
                  ? 'AI wellness summaries are processed on-device using Apple Intelligence (iOS 26+).'
                  : 'Enable to allow on-device AI wellness summaries using Apple Intelligence (iOS 26+).'}
              </Text>
            </View>
          </View>
          {!appleIntelligenceConsented && (
            <Pressable
              style={({ pressed }) => [
                styles.acceptBtn,
                { backgroundColor: colors.bpGreen, opacity: pressed ? 0.85 : 1, marginTop: 4 },
              ]}
              onPress={handleGrantAppleIntelligence}
            >
              <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
              <Text style={styles.acceptBtnText}>Enable Apple Intelligence Consent</Text>
            </Pressable>
          )}
          {appleIntelligenceConsented && (
            <Pressable
              style={({ pressed }) => [
                styles.revokeBtn,
                {
                  backgroundColor: isDark ? colors.error + '15' : '#FFF5F5',
                  borderColor: colors.error + '40',
                  opacity: pressed || revokingAppleIntelligence ? 0.7 : 1,
                },
              ]}
              onPress={handleRevokeAppleIntelligence}
              disabled={revokingAppleIntelligence}
            >
              {revokingAppleIntelligence ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <IconSymbol name="xmark.circle.fill" size={16} color={colors.error} />
              )}
              <Text style={[styles.revokeBtnText, { color: colors.error }]}>
                {revokingAppleIntelligence ? 'Revoking…' : 'Revoke Apple Intelligence Consent'}
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.footerNote, { color: colors.muted }]}>
          Revoking consent does not delete your health data. Use Settings → Data Management → Clear All Data to permanently remove all records.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 70,
  },
  backLabel: { fontSize: 16, fontWeight: '400' },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 0 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  // Status badge
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  statusTitle: { fontSize: 14, fontWeight: '700' },
  statusSub: { fontSize: 12, fontWeight: '400', marginTop: 2 },
  // Gemini AI consent section
  sectionDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  consentStatusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  statusLabel: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  // Cards
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  // Consent points
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pointIcon: { fontSize: 20, lineHeight: 24, flexShrink: 0 },
  pointTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  pointBody: { fontSize: 13, lineHeight: 19 },
  // Version history
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  versionBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  versionBadgeText: { fontSize: 11, fontWeight: '700' },
  historyDate: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
  historyBody: { fontSize: 13, lineHeight: 19 },
  // Legal links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkLabel: { fontSize: 15, fontWeight: '500' },
  linkSub: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  // Buttons
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 16,
  },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  revokeBtnText: { fontSize: 14, fontWeight: '600' },
  footerNote: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
});
