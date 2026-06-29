/**
 * TransparencyCard
 *
 * A reusable, collapsible transparency notice that displays context-aware
 * information about data sources, AI engines, limitations, and privacy.
 *
 * Usage:
 *   <TransparencyCard variant="mealScanner" />
 *   <TransparencyCard variant="wellnessScore" style={{ marginTop: 8 }} />
 *
 * Design:
 *   • Compact collapsed state: ⓘ icon + short title (one line)
 *   • Expanded state: full text with data source, AI engine, limitations
 *   • Glassmorphism surface matching the VitalSync design system
 *   • Visible text: uses colors.foreground (not muted/rgba) for body text
 *   • No modal dialogs, no navigation, no duplicate banners
 */
import React, { useCallback, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  type ViewStyle,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useLang } from '@/hooks/use-lang';
import { transparencyStrings } from '@/lib/i18n';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Variant types ────────────────────────────────────────────────────────────
export type TransparencyVariant =
  | 'dashboard'
  | 'wellnessSummary'
  | 'correlate'
  | 'scatterPlot'
  | 'wellnessScore'
  | 'recoveryScore'
  | 'nutritionAnalysis'
  | 'mealScanner'
  | 'healthReport'
  | 'aiChat'
  | 'appleIntelligence'
  | 'googleGemini'
  | 'healthKit'
  | 'connectedDevices'
  | 'projectedA1C'
  | 'ekgHistory'
  | 'trendsPredictions'
  | 'privacy';

export interface TransparencyCardProps {
  variant: TransparencyVariant;
  /** Override default collapsed state */
  defaultExpanded?: boolean;
  /** Additional container style */
  style?: ViewStyle;
  /** Suppress the card entirely (e.g. when a parent already shows it) */
  hidden?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TransparencyCard({
  variant,
  defaultExpanded = false,
  style,
  hidden = false,
}: TransparencyCardProps) {
  const colors = useColors();
  const lang = useLang();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const strings =
    (transparencyStrings as Record<string, typeof transparencyStrings.en>)[lang] ??
    transparencyStrings.en;
  const data = strings[variant];

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }, []);

  if (hidden || !data) return null;

  const bgColor = colors.surface ?? '#F5F5F5';
  const borderColor = colors.border ?? '#E5E7EB';
  const titleColor = colors.foreground;
  const bodyColor = colors.foregroundSub ?? colors.foreground;
  const accentColor = colors.primary ?? '#16A34A';

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={data.title}
      accessibilityHint={expanded ? 'Tap to collapse' : 'Tap to expand'}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: bgColor, borderColor },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.icon, { color: accentColor }]}>ⓘ</Text>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={expanded ? undefined : 1}>
          {data.title}
        </Text>
        <Text style={[styles.chevron, { color: accentColor }]}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* Expanded body */}
      {expanded && (
        <View style={styles.body}>
          <Text style={[styles.bodyText, { color: bodyColor }]}>{data.body}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 14,
    lineHeight: 18,
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  chevron: {
    fontSize: 9,
    lineHeight: 18,
  },
  body: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
