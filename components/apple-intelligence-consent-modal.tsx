/**
 * AppleIntelligenceConsentModal
 *
 * One-time consent dialog shown before enabling Apple Intelligence
 * wellness summaries. Explains:
 *   - What Apple Intelligence does (on-device AI, no data leaves device)
 *   - What data is processed (wellness scores, trends, correlations)
 *   - That it requires iOS 26+ (falls back to Gemini on older devices)
 *   - How to revoke consent (Settings → Privacy → AI Consent)
 *
 * Shown once per install. After acceptance, stored in AsyncStorage.
 * Can be revoked from Settings → Privacy → AI Consent.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function AppleIntelligenceConsentModal({ visible, onAccept, onDecline }: Props) {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>🧠</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Enable AI Wellness Insights
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Powered by Apple Intelligence (on-device)
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Privacy badge */}
            <View style={[styles.badge, { backgroundColor: colors.success + '20', borderColor: colors.success + '40' }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>
                🔒 All processing happens on your device — no data is sent to Apple or any server
              </Text>
            </View>

            {/* What it does */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              What AI Wellness Insights does
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              When enabled, VitalSync uses Apple Intelligence (Foundation Models, iOS 26+) to generate
              personalized wellness summaries from your health data. On iOS 15–25, it falls back to
              Google Gemini with your existing consent.
            </Text>

            {/* Data processed */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Data processed on-device
            </Text>
            {[
              'Wellness scores and recovery trends',
              'Blood pressure and heart rate patterns',
              'Sleep quality and duration',
              'Nutrition summaries (if logged)',
              'Correlation patterns between metrics',
            ].map((item, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.bulletText, { color: colors.muted }]}>{item}</Text>
              </View>
            ))}

            {/* Requirements */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Requirements
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Apple Intelligence requires iOS 26 or later and a compatible device. On earlier iOS versions,
              VitalSync automatically uses Google Gemini (requires separate Gemini consent) or displays
              rule-based insights without AI.
            </Text>

            {/* Revoke */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Revoking consent
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              You can revoke this consent at any time from{' '}
              <Text style={{ fontWeight: '600' }}>Settings → Privacy → AI Consent</Text>.
              Revoking will disable AI wellness summaries immediately.
            </Text>

            {/* Disclaimer */}
            <View style={[styles.disclaimer, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
              <Text style={[styles.disclaimerText, { color: colors.muted }]}>
                ⚕ AI wellness insights are for informational purposes only. They do not constitute
                medical advice, diagnosis, or treatment. Always consult a licensed healthcare
                professional for medical decisions.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.declineBtn, { borderColor: colors.border }]}
              onPress={onDecline}
              activeOpacity={0.7}
            >
              <Text style={[styles.declineBtnText, { color: colors.muted }]}>Not Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
              onPress={onAccept}
              activeOpacity={0.85}
            >
              <Text style={styles.acceptBtnText}>Enable AI Insights</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: '90%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  icon: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  badge: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 16,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 2,
  },
  bulletText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  disclaimer: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 20,
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  declineBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
