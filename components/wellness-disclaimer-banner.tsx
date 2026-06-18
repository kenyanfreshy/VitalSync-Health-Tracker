/**
 * WellnessDisclaimerBanner
 *
 * A compact, non-dismissible banner displayed at the top of the Record,
 * Correlate, Health Report, and Settings screens to satisfy Apple App Review
 * Guideline 1.4.1 (medical device language).
 *
 * Text is sourced from paywallStrings (all 10 languages) so there is a single
 * source of truth for the disclaimer copy.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useLang } from '@/hooks/use-lang';
import { paywallExtStrings } from '@/lib/i18n';

const FALLBACK =
  'VitalSync is intended for personal wellness tracking, organization, and educational purposes only. It does not diagnose, treat, cure, prevent, or monitor any disease or medical condition.';

export function WellnessDisclaimerBanner() {
  const colors = useColors();
  const lang = useLang();
  const pw = paywallExtStrings[lang as keyof typeof paywallExtStrings] ?? paywallExtStrings.en;
  const text = (pw as any).wellnessDisclaimer ?? FALLBACK;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
});
