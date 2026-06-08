/**
 * EvidenceInsightsPanel
 *
 * Personalized evidence-based nutrition guidelines synthesized from the user's
 * live vitals data. Rendered as a bento-box grid of insight cards.
 *
 * Each card:
 *  - Has a title, body recommendation, clinical citation, and impact badge
 *  - Is color-coded by urgency (emerald = optimal, amber = advisory, red = alert)
 *  - Links back to the vitals metric that triggered it
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  LayoutAnimation,
  TouchableOpacity,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors } from '@/hooks';
import { ClinicalCitationsFooter } from '@/components/clinical-citations-footer';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMERALD = '#10B981';
const AMBER   = '#F59E0B';
const BLUE    = '#3B82F6';
const _VIOLET  = '#8B5CF6';
const RED     = '#EF4444';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightTier = 'optimal' | 'advisory' | 'alert';

interface InsightCard {
  id: string;
  icon: string;
  title: string;
  body: string;
  impact: string;
  citation: string;
  /** Direct URL to the primary source (PubMed PMID, DOI, or AHA/WHO page) */
  citationUrl: string;
  tier: InsightTier;
  /** Which vitals metric triggered this insight */
  linkedMetric: string;
  /** Span: 'half' = 50% width, 'full' = 100% width */
  span: 'half' | 'full';
}

// ─── Insight generator ────────────────────────────────────────────────────────

function buildInsights(
  systolic: number | null,
  diastolic: number | null,
  bpm: number | null,
  spo2: number | null,
): InsightCard[] {
  const cards: InsightCard[] = [];

  // ── Cardiac Optimization (always present, copy adapts to BP) ─────────────
  const bpOptimal = systolic !== null && systolic < 120;
  const bpElevated = systolic !== null && systolic >= 130;
  cards.push({
    id: 'cardiac',
    icon: '❤️',
    title: 'Cardiac Optimization',
    body: bpOptimal
      ? `Vitals are strong (${systolic}/${diastolic ?? '—'} mmHg). To further reduce BP by 2–4 pts, increase potassium via leafy greens & lentils.`
      : bpElevated
      ? `BP elevated (${systolic}/${diastolic ?? '—'} mmHg). DASH protocol: ≤2,300 mg Na/day + 4,700 mg K⁺/day reduces systolic by 8–14 mmHg.`
      : `Maintain BP with the DASH diet: high potassium, low sodium, abundant leafy greens and legumes.`,
    impact: bpOptimal ? '↓ 2–4 mmHg' : '↓ 8–14 mmHg',
    citation: 'AHA Guidelines 2023 · Sacks et al. NEJM',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/11386268/',
    tier: bpOptimal ? 'optimal' : bpElevated ? 'advisory' : 'optimal',
    linkedMetric: 'Blood Pressure',
    span: 'full',
  });

  // ── Heart Rate Optimization ───────────────────────────────────────────────
  const hrLow = bpm !== null && bpm < 60;
  const hrHigh = bpm !== null && bpm > 80;
  cards.push({
    id: 'hr_opt',
    icon: '💓',
    title: 'Heart Rate',
    body: hrHigh
      ? `HR ${bpm} bpm. Magnesium-rich foods (pumpkin seeds, dark chocolate) and omega-3 sources support resting HR reduction.`
      : hrLow
      ? `HR ${bpm} bpm. Ensure adequate iron & B12 (fortified foods, nutritional yeast) to support cardiac output.`
      : `HR ${bpm ?? '—'} bpm is within optimal range. Maintain with regular aerobic activity and anti-inflammatory foods.`,
    impact: hrHigh ? '↓ 5–8 bpm' : '→ Maintain',
    citation: 'ESC 2021 · Mozaffarian et al.',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/21160056/',
    tier: hrHigh ? 'advisory' : 'optimal',
    linkedMetric: 'Heart Rate',
    span: 'half',
  });

  // ── Fiber & Glycemic Control ──────────────────────────────────────────────
  cards.push({
    id: 'fiber',
    icon: '🌾',
    title: 'Fiber Target',
    body: 'Target ≥38 g/day (men) or ≥25 g/day (women). Soluble fiber from oats, legumes & flaxseed lowers LDL and stabilises glucose.',
    impact: '↓ LDL 5–10%',
    citation: 'ISSN 2023 · Anderson et al.',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/2547312/',
    tier: 'advisory',
    linkedMetric: 'Nutrition',
    span: 'half',
  });

  // ── Potassium Intake ──────────────────────────────────────────────────────
  cards.push({
    id: 'potassium',
    icon: '🥬',
    title: 'Potassium Boost',
    body: 'Target 4,700 mg K⁺/day. Top sources: white beans (1,189 mg/cup), spinach (839 mg/cup), sweet potato (694 mg). Counteracts sodium\'s BP effect.',
    impact: '↓ BP 4–5 mmHg',
    citation: 'WHO 2012 · Aburto et al.',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/23558164/',
    tier: bpElevated ? 'alert' : 'advisory',
    linkedMetric: 'Blood Pressure',
    span: 'full',
  });

  // ── Omega-3 Anti-inflammatory ─────────────────────────────────────────────
  cards.push({
    id: 'omega3',
    icon: '🫐',
    title: 'Anti-Inflammatory',
    body: 'ALA from walnuts & flaxseed + DHA/EPA from algae oil reduces systemic inflammation. Target 1.6 g ALA/day (plant-based).',
    impact: '↓ CRP 20–30%',
    citation: 'AHA 2022 · Calder et al.',
    citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/20500789/',
    tier: 'advisory',
    linkedMetric: 'HRV',
    span: 'half',
  });

  // ── SpO2 / Respiratory ────────────────────────────────────────────────────
  if (spo2 !== null && spo2 < 96) {
    cards.push({
      id: 'spo2',
      icon: '🫁',
      title: 'SpO₂ Support',
      body: `SpO₂ ${spo2}% is below optimal. Iron-rich plant foods (lentils, tofu, pumpkin seeds) + vitamin C enhance oxygen-carrying capacity.`,
      impact: '↑ SpO₂ 1–2%',
      citation: 'Haematologica 2020',
      citationUrl: 'https://pubmed.ncbi.nlm.nih.gov/32241843/',
      tier: 'alert',
      linkedMetric: 'SpO₂',
      span: 'full',
    });
  }

  return cards;
}

// ─── Tier styling ─────────────────────────────────────────────────────────────

function tierColor(tier: InsightTier): string {
  switch (tier) {
    case 'optimal':  return EMERALD;
    case 'advisory': return AMBER;
    case 'alert':    return RED;
  }
}

// ─── Single insight card ──────────────────────────────────────────────────────

function InsightTile({
  card,
  isDark,
}: {
  card: InsightCard;
  isDark: boolean;
}) {
  const accent = tierColor(card.tier);
  const tileBg = isDark
    ? `rgba(${hexToRgb(accent)},0.08)`
    : `rgba(${hexToRgb(accent)},0.05)`;
  const tileBorder = `rgba(${hexToRgb(accent)},0.25)`;

  return (
    <Pressable
      style={({ pressed }) => [
        tileStyles.tile,
        {
          backgroundColor: tileBg,
          borderColor: tileBorder,
          opacity: pressed ? 0.85 : 1,
          flex: card.span === 'half' ? 1 : undefined,
          width: card.span === 'full' ? '100%' : undefined,
        },
      ]}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      {/* Top row */}
      <View style={tileStyles.topRow}>
        <Text style={tileStyles.icon}>{card.icon}</Text>
        <View style={[tileStyles.impactBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={[tileStyles.impactText, { color: accent }]}>{card.impact}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={[tileStyles.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
        {card.title}
      </Text>

      {/* Body */}
      <Text style={[tileStyles.body, { color: isDark ? '#94A3B8' : '#475569' }]} numberOfLines={4}>
        {card.body}
      </Text>

      {/* Citation — tappable PMID/DOI link */}
      <TouchableOpacity
        style={tileStyles.citationRow}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Linking.openURL(card.citationUrl);
        }}
        accessibilityRole="link"
        accessibilityLabel={`View source: ${card.citation}`}
        accessibilityHint="Opens the primary research source in your browser"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[tileStyles.citationDot, { backgroundColor: accent }]} />
        <Text style={[tileStyles.citation, { color: accent }]}>{card.citation}</Text>
        <Text style={[tileStyles.citationArrow, { color: accent }]}> ↗</Text>
      </TouchableOpacity>

      {/* Linked metric tag */}
      <View style={[tileStyles.metricTag, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
        <Text style={[tileStyles.metricTagText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          ↗ {card.linkedMetric}
        </Text>
      </View>
    </Pressable>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
    minHeight: 140,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  icon: {
    fontSize: 22,
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  impactText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  citationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  citationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  citation: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    flex: 1,
  },
  citationArrow: {
    fontSize: 9,
    fontWeight: '700',
  },
  metricTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  metricTagText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface EvidenceInsightsPanelProps {
  systolicBP?: number | null;
  diastolicBP?: number | null;
  heartRateBpm?: number | null;
  spo2?: number | null;
}

export function EvidenceInsightsPanel({
  systolicBP,
  diastolicBP,
  heartRateBpm,
  spo2,
}: EvidenceInsightsPanelProps) {
  const _colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const [isExpanded, setIsExpanded] = React.useState(false);
  const toggleExpanded = React.useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(v => !v);
  }, []);

  const insights = useMemo(
    () => buildInsights(systolicBP ?? null, diastolicBP ?? null, heartRateBpm ?? null, spo2 ?? null),
    [systolicBP, diastolicBP, heartRateBpm, spo2],
  );

  // Separate full-width and half-width cards
  const fullCards = insights.filter(c => c.span === 'full');
  const halfCards = insights.filter(c => c.span === 'half');

  // Pair half cards into rows of 2
  const halfRows: InsightCard[][] = [];
  for (let i = 0; i < halfCards.length; i += 2) {
    halfRows.push(halfCards.slice(i, i + 2));
  }

  return (
    <View style={panelStyles.section}>
      {/* Section divider */}
      <View style={panelStyles.divider} />
      {/* Header — tappable to collapse/expand */}
      <Pressable
        style={({ pressed }) => [panelStyles.header, { opacity: pressed ? 0.8 : 1 }]}
        onPress={toggleExpanded}
      >
        <View style={panelStyles.headerLeft}>
          <View style={[panelStyles.iconBadge, { backgroundColor: BLUE + '22', borderColor: BLUE + '44' }]}>
            <Text style={[panelStyles.iconBadgeText, { color: BLUE }]}>⚕</Text>
          </View>
          <View>
            <Text style={[panelStyles.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              Evidence-Based Insights
            </Text>
            <Text style={[panelStyles.subtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              Personalized from your vitals · AHA / WHO / ISSN
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[panelStyles.liveBadge, { backgroundColor: EMERALD + '18', borderColor: EMERALD + '40' }]}>
            <View style={[panelStyles.liveDot, { backgroundColor: EMERALD }]} />
            <Text style={[panelStyles.liveText, { color: EMERALD }]}>Live</Text>
          </View>
          <Text style={{ fontSize: 12, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '600' }}>
            {isExpanded ? '▲' : '▼'}
          </Text>
        </View>
      </Pressable>

      {/* Collapsible body */}
      {isExpanded && (
        <>
          {/* Bento grid — full-width cards first */}
          <View style={[panelStyles.grid, { marginTop: 16 }]}>
            {fullCards.map(card => (
              <InsightTile key={card.id} card={card} isDark={isDark} />
            ))}

            {/* Half-width card rows */}
            {halfRows.map((row, idx) => (
              <View key={`row-${idx}`} style={panelStyles.halfRow}>
                {row.map(card => (
                  <InsightTile key={card.id} card={card} isDark={isDark} />
                ))}
              </View>
            ))}
          </View>

          {/* Clinical citations — Guideline 1.4.1 compliance */}
          <ClinicalCitationsFooter />
        </>
      )}
    </View>
  );
}

// ─── Panel styles ─────────────────────────────────────────────────────────────

const panelStyles = StyleSheet.create({
  section: {
    paddingTop: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148,163,184,0.25)',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  grid: {
    gap: 10,
  },
  halfRow: {
    flexDirection: 'row',
    gap: 10,
  },
  disclaimer: {
    fontSize: 9,
    fontWeight: '400',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 13,
  },
});
