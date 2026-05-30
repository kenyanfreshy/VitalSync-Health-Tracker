/**
 * HealthKit Debug Screen
 *
 * Full-screen wrapper for HealthKitDebugPanel.
 * Navigate to this screen from Settings → Apple Health → Debug.
 *
 * Route: /settings/healthkit-debug
 */

import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { HealthKitDebugPanel } from '@/components/healthkit-debug-panel';
import { useColors, useLang } from '@/hooks';
import { settingsExtStrings } from '@/lib/i18n';

export default function HealthKitDebugScreen() {
  const colors = useColors();
  const lang = useLang();
  const t = ((settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[lang] ?? settingsExtStrings.en);

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Navigation Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>{t.back ?? 'Back'}</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t.healthkitDiagnosticsTitle ?? 'HealthKit Diagnostics'}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Platform notice for Android/web */}
        {Platform.OS !== 'ios' && (
          <View style={[styles.noticeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.noticeText, { color: colors.muted }]}>
              HealthKit is only available on iOS. This diagnostic panel has no effect on Android or web.
            </Text>
          </View>
        )}

        {/* Build environment notice */}
        <View style={[styles.infoCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
          <Text style={styles.infoTitle}>Before you start</Text>
          <Text style={styles.infoText}>
            HealthKit requires a <Text style={{ fontWeight: '700' }}>dev or production EAS build</Text> — it does not work in Expo Go.
            If you are running in Expo Go, all checks will show &quot;not linked&quot;.
          </Text>
          <Text style={[styles.infoText, { marginTop: 6 }]}>
            Also ensure the <Text style={{ fontWeight: '700' }}>HealthKit capability</Text> is enabled in your App ID on{' '}
            <Text style={{ fontWeight: '700' }}>developer.apple.com</Text> → Certificates → App IDs → Edit → HealthKit.
          </Text>
        </View>

        {/* Debug Panel */}
        <HealthKitDebugPanel />

        {/* Common issues reference */}
        <View style={[styles.issuesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.issuesTitle, { color: colors.foreground }]}>Common Issues</Text>

          {ISSUES.map((issue, i) => (
            <View key={i} style={styles.issueRow}>
              <View style={[styles.issueNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.issueNumText}>{i + 1}</Text>
              </View>
              <View style={styles.issueContent}>
                <Text style={[styles.issueLabel, { color: colors.foreground }]}>{issue.label}</Text>
                <Text style={[styles.issueFix, { color: colors.muted }]}>{issue.fix}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const ISSUES = [
  {
    label: 'Permission sheet never appears',
    fix: 'Ensure initHealthKit() is called (not just requestAuthorization). The system sheet only appears via initHealthKit from react-native-health.',
  },
  {
    label: 'Running in Expo Go',
    fix: 'HealthKit requires a native build. Use: eas build --platform ios --profile development',
  },
  {
    label: 'HealthKit capability not enabled',
    fix: 'developer.apple.com → Certificates → App IDs → com.myvitalsyncclinicalhub.vitalsync → Edit → Enable HealthKit → Save → Rebuild.',
  },
  {
    label: 'Previously denied permissions',
    fix: 'iOS will not show the sheet again. User must go to Settings → Privacy & Security → Health → VitalSync and toggle permissions manually.',
  },
  {
    label: 'Stale Metro cache',
    fix: 'Run: npx expo start --clear  or  eas build --clear-cache --platform ios',
  },
  {
    label: 'Entitlement missing from provisioning profile',
    fix: 'After enabling HealthKit in the Developer Portal, regenerate the provisioning profile and rebuild with EAS.',
  },
  {
    label: 'EKG / ECG shows 0 recordings',
    fix: 'EKG requires Apple Watch Series 4 or later. Open the ECG app on your watch and take at least one reading — it will then sync to Apple Health. Also ensure the EKG Permission row in Category 6 above shows a green checkmark. If it shows ❌, rebuild with: eas build --platform ios --profile production --clear-cache',
  },
  {
    label: 'EKG entitlement present but method not callable',
    fix: 'The binary was signed without the com.apple.developer.healthkit.electrocardiogram entitlement. Run: eas build --platform ios --profile production --clear-cache to regenerate the provisioning profile with the entitlement included.',
  },
];

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
    minWidth: 60,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  issuesCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  issuesTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  issueRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  issueNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  issueNumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  issueContent: {
    flex: 1,
    gap: 2,
  },
  issueLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  issueFix: {
    fontSize: 12,
    lineHeight: 17,
  },
});
