/**
 * EvidenceRefBanner
 *
 * A compact, collapsible strip that surfaces one or more evidence-based
 * reference links inside a Settings section or sub-screen.
 *
 * - Collapsed by default (shows only the header row with a chevron)
 * - Tapping the header expands/collapses the reference pills with a
 *   smooth Reanimated height animation
 * - Each pill opens the authoritative source in the in-app browser
 *   (expo-web-browser on native, Linking on web)
 *
 * Usage:
 * ```tsx
 * <EvidenceRefBanner
 *   refs={[
 *     { label: 'AHA/ACC 2017 BP Guidelines', url: 'https://pubmed.ncbi.nlm.nih.gov/29133354/' },
 *     { label: 'JNC 8 Hypertension', url: 'https://pubmed.ncbi.nlm.nih.gov/24352797/' },
 *   ]}
 *   accentColor="#EF4444"
 * />
 * ```
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Linking,
  Platform,
  StyleSheet,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface EvidenceRef {
  /** Short human-readable label shown in the link pill */
  label: string;
  /** Full URL to open (PubMed, AHA, WHO, ADA, etc.) */
  url: string;
  /** Optional badge text, e.g. 'PMID', 'AHA', 'WHO', 'ADA' */
  badge?: string;
}

interface EvidenceRefBannerProps {
  refs: EvidenceRef[];
  /** Accent colour that tints the border and badge */
  accentColor?: string;
  /** Optional heading override; defaults to "Evidence & References" */
  heading?: string;
  /** Whether the banner starts expanded. Defaults to false (collapsed). */
  defaultExpanded?: boolean;
  style?: object;
}

async function openRef(url: string) {
  if (Platform.OS !== 'web') {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { openBrowserAsync } = await import('expo-web-browser');
      await openBrowserAsync(url, { presentationStyle: 'pageSheet' as any });
      return;
    } catch (_unused) {
      // fall through to Linking
    }
  }
  await Linking.openURL(url);
}

export function EvidenceRefBanner({
  refs,
  accentColor = '#0EA5E9',
  heading = 'Evidence & References',
  defaultExpanded = false,
  style,
}: EvidenceRefBannerProps) {
  const colors = useColors();
  const isDark = colors.background === '#151718' || colors.background < '#888888';
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 260,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpanded(prev => !prev);
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? accentColor + '10' : accentColor + '08',
          borderColor: accentColor + '30',
        },
        style,
      ]}
    >
      {/* ── Tappable header row ── */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.headerRow, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `Collapse ${heading}` : `Expand ${heading}`}
        accessibilityState={{ expanded }}
      >
        <Text style={styles.bookIcon}>📚</Text>
        <Text style={[styles.heading, { color: accentColor, flex: 1 }]}>{heading}</Text>
        {/* Chevron rotates based on expanded state */}
        <Text
          style={[
            styles.chevron,
            { color: accentColor, transform: [{ rotate: expanded ? '180deg' : '0deg' }] },
          ]}
        >
          ›
        </Text>
      </Pressable>

      {/* ── Collapsible pills area ── */}
      {expanded && (
        <View style={styles.pillsRow}>
          {refs.map((ref, idx) => (
            <Pressable
              key={idx}
              onPress={() => openRef(ref.url)}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: isDark ? accentColor + '18' : accentColor + '12',
                  borderColor: accentColor + '40',
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
              accessibilityRole="link"
              accessibilityLabel={`Open reference: ${ref.label}`}
            >
              {ref.badge ? (
                <View style={[styles.badge, { backgroundColor: accentColor + '28' }]}>
                  <Text style={[styles.badgeText, { color: accentColor }]}>
                    {ref.badge}
                  </Text>
                </View>
              ) : null}
              <Text
                style={[styles.pillLabel, { color: isDark ? '#E2E8F0' : '#1E293B' }]}
                numberOfLines={2}
              >
                {ref.label}
              </Text>
              <Text style={[styles.externalIcon, { color: accentColor }]}>↗</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookIcon: {
    fontSize: 13,
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  chevron: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
    marginLeft: 4,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: '100%',
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  externalIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
});
