/**
 * components/ocr-review-card.tsx
 *
 * Diff-style OCR review card shown after a prescription or vaccine card scan.
 * Displays extracted fields in green and missing/blank fields in muted grey,
 * so users can immediately spot what was captured and what needs manual entry.
 *
 * Usage:
 *   <OcrReviewCard
 *     fields={[
 *       { label: 'Vaccine Name', value: 'Influenza', extracted: true },
 *       { label: 'Lot Number',   value: null,        extracted: false },
 *     ]}
 *     onConfirm={() => setShowReview(false)}
 *     onRetake={handleRetake}
 *   />
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

export interface OcrReviewField {
  /** Human-readable label shown in the card row */
  label: string;
  /** Extracted value, or null/empty if not found */
  value: string | number | null | undefined;
  /** Whether this field was successfully extracted */
  extracted: boolean;
  /** Confidence score (0–1) for the extracted value */
  confidence?: number;
}

interface OcrReviewCardProps {
  /** Title shown at the top of the card, e.g. "Prescription Scan Results" */
  title?: string;
  /** Array of fields to display */
  fields: OcrReviewField[];
  /** Called when user taps "Looks Good — Apply" */
  onConfirm: () => void;
  /** Called when user taps "Retake Photo" — optional */
  onRetake?: () => void;
  /** Called when user taps "Enter Manually" — optional */
  onManual?: () => void;
  /**
   * Indicates which extraction method was used.
   * 'smart' = server-side extraction (higher accuracy)
   * 'ocr'   = on-device text recognition (offline fallback)
   */
  scanMethod?: 'smart' | 'ocr';
  /** Called when user taps "Scan Another Page" — optional, for multi-page support */
  onScanMore?: () => void;
}

export function OcrReviewCard({
  title = 'Scan Results',
  fields,
  onConfirm,
  onRetake,
  onManual,
  scanMethod,
  onScanMore,
}: OcrReviewCardProps) {
  const colors = useColors();

  const extractedCount = fields.filter(f => f.extracted).length;
  const totalCount = fields.length;
  const confidence = totalCount > 0 ? extractedCount / totalCount : 0;

  // Entrance animation
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  React.useEffect(() => {
    opacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
    translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Confidence badge color
  const badgeColor =
    confidence >= 0.7 ? colors.success :
    confidence >= 0.4 ? colors.warning :
    colors.error;

  const badgeLabel =
    confidence >= 0.7 ? 'Good scan' :
    confidence >= 0.4 ? 'Partial scan' :
    'Low confidence';

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {extractedCount} of {totalCount} fields extracted
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {scanMethod && (
              <View style={[
                styles.methodBadge,
                scanMethod === 'smart'
                  ? { backgroundColor: colors.primary + '18', borderColor: colors.primary + '55' }
                  : { backgroundColor: colors.border + '88', borderColor: colors.border },
              ]}>
                <Text style={[
                  styles.methodBadgeText,
                  { color: scanMethod === 'smart' ? colors.primary : colors.muted },
                ]}>
                  {scanMethod === 'smart' ? 'Smart Scan' : 'Text Scan'}
                </Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: badgeColor + '22', borderColor: badgeColor }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── Confidence bar ─────────────────────────────────────────── */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(confidence * 100)}%` as any, backgroundColor: badgeColor },
            ]}
          />
        </View>

        {/* ── Field rows ─────────────────────────────────────────────── */}
        <ScrollView
          style={styles.fieldList}
          contentContainerStyle={styles.fieldListContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={fields.length > 6}
        >
          {fields.map((field, idx) => (
            <View
              key={idx}
              style={[
                styles.fieldRow,
                idx < fields.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
            >
              {/* Status dot */}
              <View
                style={[
                  styles.dot,
                  { backgroundColor: field.extracted ? colors.success : colors.border },
                ]}
              />
              <View style={styles.fieldContent}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>{field.label}</Text>
                {field.extracted && field.value != null ? (
                  <Text style={[styles.fieldValue, { color: colors.foreground }]} numberOfLines={2}>
                    {String(field.value)}
                  </Text>
                ) : (
                  <Text style={[styles.fieldMissing, { color: colors.muted }]}>
                    Not detected — enter manually
                  </Text>
                )}
              </View>
              {/* Extracted checkmark */}
              {field.extracted && (
                <Text style={[styles.checkmark, { color: colors.success }]}>✓</Text>
              )}
            </View>
          ))}
        </ScrollView>

        {/* ── Disclaimer ─────────────────────────────────────────────── */}
        <View style={[styles.disclaimer, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '44' }]}>
          <Text style={[styles.disclaimerText, { color: colors.warning }]}>
            Always verify scanned details against the original label before saving.
          </Text>
        </View>

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <View style={styles.actions}>
          {onRetake && (
            <Pressable
              style={({ pressed }) => [
                styles.btnSecondary,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRetake();
              }}
            >
              <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Retake</Text>
            </Pressable>
          )}
          {onManual && (
            <Pressable
              style={({ pressed }) => [
                styles.btnSecondary,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onManual();
              }}
            >
              <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Manual</Text>
            </Pressable>
          )}
          {onScanMore && (
            <Pressable
              style={({ pressed }) => [
                styles.btnSecondary,
                { borderColor: colors.primary + '66', backgroundColor: colors.primary + '10' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onScanMore();
              }}
            >
              <Text style={[styles.btnSecondaryText, { color: colors.primary }]}>+ Page</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.btnPrimary,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onConfirm();
            }}
          >
            <Text style={[styles.btnPrimaryText, { color: '#fff' }]}>Apply to Form</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 0,
    marginVertical: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  methodBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  methodBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  fieldList: {
    maxHeight: 280,
  },
  fieldListContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  fieldContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  fieldMissing: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 0,
  },
  disclaimer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
