/**
 * ClinicalCitationsFooter
 *
 * Apple App Review Guideline 1.4.1 compliance component.
 *
 * All dietary and health recommendations in VitalSync are grounded in
 * peer-reviewed meta-analyses. This footer surfaces the four primary
 * evidence sources with direct tappable links so users can verify
 * the clinical basis of every recommendation.
 *
 * Sources:
 *  1. PubMed / NLM — largest biomedical literature database
 *  2. American Heart Association — 2021 Dietary Guidance (cardiovascular)
 *  3. Cochrane Library — gold-standard systematic reviews (nutrition)
 *  4. Academy of Nutrition and Dietetics EAL — disease-specific guidelines
 *
 * Usage:
 *   <ClinicalCitationsFooter />
 *
 * Optional compact mode (single-line chip row):
 *   <ClinicalCitationsFooter compact />
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

// ─── Evidence sources ─────────────────────────────────────────────────────────

interface EvidenceSource {
  id: string;
  shortName: string;
  fullName: string;
  description: string;
  url: string;
  accentColor: string;
}

const EVIDENCE_SOURCES: EvidenceSource[] = [
  {
    id: 'pubmed',
    shortName: 'PubMed',
    fullName: 'PubMed — National Library of Medicine',
    description: 'Meta-analyses & systematic reviews (2020–2025)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=diet+meta-analysis&filter=years.2020-2025&sort=date',
    accentColor: '#3B82F6',
  },
  {
    id: 'aha',
    shortName: 'AHA 2021',
    fullName: 'American Heart Association — 2021 Dietary Guidance',
    description: 'Scientific statement on cardiovascular dietary patterns',
    url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001031',
    accentColor: '#EF4444',
  },
  {
    id: 'cochrane',
    shortName: 'Cochrane',
    fullName: 'Cochrane Library — Nutrition & Dietetics',
    description: 'Gold-standard systematic reviews of dietary interventions',
    url: 'https://www.cochranelibrary.com/search?p_p_id=scolarissearchresultsportlet_WAR_newscolarissearchresults_INSTANCE_rDvHR5ZdHZqx&p_p_lifecycle=0&_scolarissearchresultsportlet_WAR_newscolarissearchresults_INSTANCE_rDvHR5ZdHZqx_searchText=diet&_scolarissearchresultsportlet_WAR_newscolarissearchresults_INSTANCE_rDvHR5ZdHZqx_searchType=basic&_scolarissearchresultsportlet_WAR_newscolarissearchresults_INSTANCE_rDvHR5ZdHZqx_facetQueryField=topic&_scolarissearchresultsportlet_WAR_newscolarissearchresults_INSTANCE_rDvHR5ZdHZqx_facetQueryValue=Nutrition+%26+Dietetics',
    accentColor: '#10B981',
  },
  {
    id: 'eal',
    shortName: 'AND-EAL',
    fullName: 'Academy of Nutrition and Dietetics — Evidence Analysis Library',
    description: 'Disease-specific clinical nutrition guidelines (RD-reviewed)',
    url: 'https://www.andeal.org',
    accentColor: '#8B5CF6',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface ClinicalCitationsFooterProps {
  /** Compact mode: renders a single row of small tappable chips instead of full cards */
  compact?: boolean;
}

export function ClinicalCitationsFooter({ compact = false }: ClinicalCitationsFooterProps) {
  const colors = useColors();

  const openLink = useCallback(async (url: string, _name: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (_unused) {
      // Silently fail — link may not be available offline
    }
  }, []);

  if (compact) {
    return (
      <View
        style={[styles.compactContainer, { borderTopColor: colors.border }]}
        accessibilityLabel="Clinical evidence sources"
      >
        <Text style={[styles.compactLabel, { color: colors.muted }]}>
          Evidence:
        </Text>
        <View style={styles.compactChips}>
          {EVIDENCE_SOURCES.map((src) => (
            <TouchableOpacity
              key={src.id}
              style={[
                styles.compactChip,
                { borderColor: src.accentColor + '60', backgroundColor: src.accentColor + '15' },
              ]}
              onPress={() => openLink(src.url, src.shortName)}
              accessibilityRole="link"
              accessibilityLabel={`View ${src.fullName}`}
              accessibilityHint="Opens in browser"
            >
              <Text style={[styles.compactChipText, { color: src.accentColor }]}>
                {src.shortName} ↗
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.surface }]}
        accessibilityLabel="Clinical sources and evidence"
    >
      {/* Section header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerIcon}>🔬</Text>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Evidence Based Sources
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            All recommendations are grounded in peer-reviewed meta-analyses
            published within the last five years.
          </Text>
        </View>
      </View>

      {/* Source cards */}
      <View style={styles.cardsGrid}>
        {EVIDENCE_SOURCES.map((src) => (
          <TouchableOpacity
            key={src.id}
            style={[
              styles.sourceCard,
              {
                borderColor: src.accentColor + '50',
                backgroundColor: src.accentColor + '0D',
              },
            ]}
            onPress={() => openLink(src.url, src.shortName)}
            accessibilityRole="link"
            accessibilityLabel={`View ${src.fullName}`}
            accessibilityHint="Opens peer-reviewed source in browser"
          >
            <View style={styles.sourceCardTop}>
              <View
                style={[
                  styles.sourceBadge,
                  { backgroundColor: src.accentColor + '25', borderColor: src.accentColor + '60' },
                ]}
              >
                <Text style={[styles.sourceBadgeText, { color: src.accentColor }]}>
                  {src.shortName}
                </Text>
              </View>
              <Text style={[styles.sourceArrow, { color: src.accentColor }]}>↗</Text>
            </View>
            <Text style={[styles.sourceFullName, { color: colors.foreground }]} numberOfLines={2}>
              {src.fullName}
            </Text>
            <Text style={[styles.sourceDesc, { color: colors.muted }]} numberOfLines={2}>
              {src.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Disclaimer */}
      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        ⚕️ These recommendations are for informational purposes only. Always consult
        your physician or registered dietitian before making dietary changes.
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Full mode
  container: {
    marginTop: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerIcon: {
    fontSize: 20,
    lineHeight: 24,
    marginTop: 1,
  },
  headerTextWrap: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceCard: {
    width: '47%',
    minHeight: 44,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  sourceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sourceArrow: {
    fontSize: 14,
    fontWeight: '700',
  },
  sourceFullName: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  sourceDesc: {
    fontSize: 10,
    fontWeight: '400',
    lineHeight: 14,
  },
  disclaimer: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 16,
    fontStyle: 'italic',
  },

  // Compact mode
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  compactLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  compactChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  compactChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
