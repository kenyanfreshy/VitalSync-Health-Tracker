/**
 * components/gemini-consent-modal.tsx
 *
 * One-time consent dialog shown before the first Food Scan upload.
 * Explains that food images are sent to Google Gemini for Nutrition Analysis.
 *
 * Props:
 *   visible  — controls modal visibility
 *   onAccept — called when user taps "I Agree"
 *   onDecline — called when user taps "Not Now" (scan is cancelled)
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface GeminiConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function GeminiConsentModal({ visible, onAccept, onDecline }: GeminiConsentModalProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const bg = isDark ? '#0F172A' : '#FFFFFF';
  const cardBg = isDark ? '#1E293B' : '#F8FAFC';
  const border = isDark ? '#334155' : '#E2E8F0';
  const fg = isDark ? '#F1F5F9' : '#0F172A';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const EMERALD = '#10B981';
  const BLUE = '#3B82F6';

  function handleAccept() {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onAccept();
  }

  function handleDecline() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onDecline();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerIcon}>🤖</Text>
            <Text style={[styles.title, { color: fg }]}>AI Nutrition Analysis</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              Powered by Google Gemini · USDA FoodData Central
            </Text>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Explanation */}
            <View style={[styles.infoCard, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={[styles.infoText, { color: fg }]}>
                To identify foods and estimate nutrition from your photos, VitalSync sends the food image to{' '}
                <Text style={{ fontWeight: '700', color: BLUE }}>Google Gemini</Text>
                {' '}for analysis. Macro and micronutrient values are then cross-referenced with the{' '}
                <Text style={{ fontWeight: '700', color: EMERALD }}>USDA FoodData Central</Text>
                {' '}database.
              </Text>
            </View>

            {/* What happens */}
            <View style={styles.pointsList}>
              {[
                {
                  icon: '📷',
                  title: 'Image sent to Google',
                  body: 'Your food photo is transmitted to Google Gemini\'s servers for AI analysis. The image is not stored by Google after processing.',
                },
                {
                  icon: '🔬',
                  title: 'USDA cross-reference',
                  body: 'Identified foods are matched against the USDA FoodData Central database for lab-verified macro and micronutrient values.',
                },
                {
                  icon: '📱',
                  title: 'Results stay on device',
                  body: 'Nutrition results are stored only on your device. VitalSync never uploads your health data to any server.',
                },
                {
                  icon: '↩️',
                  title: 'Revocable at any time',
                  body: 'You can withdraw this consent at any time in Settings → Privacy & Consent → AI Food Scan Consent.',
                },
              ].map((pt) => (
                <View key={pt.icon} style={[styles.point, { borderColor: border }]}>
                  <Text style={styles.pointIcon}>{pt.icon}</Text>
                  <View style={styles.pointText}>
                    <Text style={[styles.pointTitle, { color: fg }]}>{pt.title}</Text>
                    <Text style={[styles.pointBody, { color: muted }]}>{pt.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Google Privacy note */}
            <View style={[styles.noteCard, { backgroundColor: BLUE + '12', borderColor: BLUE + '30' }]}>
              <Text style={[styles.noteText, { color: muted }]}>
                By tapping "I Agree", you consent to your food photos being processed by Google Gemini in accordance with{' '}
                <Text style={{ color: BLUE }}>Google's Privacy Policy</Text>.
                {' '}This consent is required only for the camera scan feature. Manual food search and barcode scan do not send images to Google.
              </Text>
            </View>
          </ScrollView>

          {/* Action buttons */}
          <View style={[styles.actions, { borderTopColor: border }]}>
            <Pressable
              style={({ pressed }) => [
                styles.declineBtn,
                { borderColor: border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleDecline}
            >
              <Text style={[styles.declineBtnText, { color: muted }]}>Not Now</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.acceptBtn,
                { backgroundColor: EMERALD, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleAccept}
            >
              <Text style={styles.acceptBtnText}>I Agree — Enable Scan</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '90%',
    paddingBottom: 34,
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 4,
  },
  headerIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 21,
  },
  pointsList: {
    gap: 8,
  },
  point: {
    flexDirection: 'row',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
  },
  pointIcon: {
    fontSize: 22,
    width: 28,
    textAlign: 'center',
    marginTop: 1,
  },
  pointText: {
    flex: 1,
    gap: 2,
  },
  pointTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  pointBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  noteCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  declineBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
