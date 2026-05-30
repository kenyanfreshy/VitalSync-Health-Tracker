/**
 * Sleep Science Screen
 *
 * In-depth explanations of each sleep stage with evidence-based references.
 * Navigated to from the NeoSleep chart stage tooltip "Learn more →" link.
 * Accepts an optional `stage` query param to scroll to the relevant section.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks';

// ─── Stage data ───────────────────────────────────────────────────────────────

type StageKey = 'awake' | 'rem' | 'core' | 'deep';

interface StageSection {
  key: StageKey;
  label: string;
  color: string;
  emoji: string;
  tagline: string;
  body: string;
  bullets: string[];
  reference: { title: string; url: string };
}

const STAGES: StageSection[] = [
  {
    key: 'deep',
    label: 'Deep Sleep (N3)',
    color: '#818CF8',
    emoji: '🔵',
    tagline: 'Physical restoration & immune defence',
    body:
      'Deep sleep — also called slow-wave sleep (SWS) or N3 — is the most physically restorative stage. ' +
      'Growth hormone secretion peaks, muscles and tissues repair, and the immune system consolidates its defences. ' +
      'The brain clears metabolic waste products (including amyloid-β) via the glymphatic system, which operates ' +
      'most efficiently during this stage. Adults typically spend 13–23% of total sleep time in deep sleep, ' +
      'with the majority occurring in the first half of the night.',
    bullets: [
      'Growth hormone (GH) release peaks — critical for muscle repair and fat metabolism',
      'Glymphatic clearance of amyloid-β and tau proteins',
      'Blood pressure and heart rate reach their lowest points',
      'Memory consolidation for declarative (factual) information',
      'Immune cytokine production is upregulated',
    ],
    reference: {
      title: 'Walker, M. (2017). Why We Sleep. Scribner.',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4651462/',
    },
  },
  {
    key: 'core',
    label: 'Core Sleep (N1 + N2)',
    color: '#38BDF8',
    emoji: '🔷',
    tagline: 'Memory consolidation & metabolic reset',
    body:
      'Core sleep encompasses the lighter NREM stages N1 (hypnagogic transition) and N2 (stable light sleep). ' +
      'N2 is the most abundant stage, comprising roughly 45–55% of total sleep. ' +
      'Sleep spindles — bursts of 12–15 Hz neural oscillations — generated during N2 are strongly linked to ' +
      'procedural memory consolidation and the transfer of memories from the hippocampus to the neocortex. ' +
      'K-complexes in N2 also suppress environmental arousal, protecting sleep continuity.',
    bullets: [
      'Sleep spindles drive procedural and motor memory consolidation',
      'K-complexes suppress cortical arousal from external stimuli',
      'Core body temperature continues to fall',
      'Glucose metabolism and insulin sensitivity reset',
      'Transition gateway into deeper N3 sleep',
    ],
    reference: {
      title: 'Diekelmann, S. & Born, J. (2010). Nature Reviews Neuroscience, 11, 114–126.',
      url: 'https://www.nature.com/articles/nrn2762',
    },
  },
  {
    key: 'rem',
    label: 'REM Sleep',
    color: '#22D3EE',
    emoji: '🟣',
    tagline: 'Emotional regulation & creative insight',
    body:
      'Rapid Eye Movement (REM) sleep is characterised by near-waking brain activity, vivid dreaming, and ' +
      'temporary muscle atonia (paralysis). REM sleep is essential for emotional memory processing — the ' +
      '"overnight therapy" hypothesis proposes that REM re-activates emotional memories in a neurochemically ' +
      'calm state (low noradrenaline), allowing the emotional charge to be stripped from the memory. ' +
      'REM also supports creative problem-solving by forming novel associative connections between disparate memories. ' +
      'REM pressure accumulates across the night, so the longest REM periods occur in the final 2 hours of sleep.',
    bullets: [
      'Emotional memory consolidation — reduces distress associated with negative memories',
      'Creative insight and associative thinking',
      'Procedural and spatial memory integration',
      'Acetylcholine dominates; noradrenaline and serotonin are suppressed',
      'Respiratory rate and heart rate become irregular',
    ],
    reference: {
      title: 'Walker, M.P. & van der Helm, E. (2009). Psychological Bulletin, 135(5), 731–748.',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19702380/',
    },
  },
  {
    key: 'awake',
    label: 'Awake / Arousals',
    color: '#FF6B8A',
    emoji: '🔴',
    tagline: 'Brief arousals are normal — fragmentation is not',
    body:
      'Brief awakenings (< 3 minutes) are a normal part of sleep architecture — adults typically experience ' +
      '10–30 micro-arousals per night without remembering them. However, frequent or prolonged awakenings ' +
      'fragment sleep continuity, preventing the full completion of 90-minute sleep cycles. ' +
      'Sleep fragmentation is associated with impaired memory consolidation, elevated cortisol, increased ' +
      'inflammatory markers, and reduced next-day cognitive performance. ' +
      'Common causes include sleep apnea, restless legs syndrome, environmental noise, and excessive ' +
      'alcohol consumption (which suppresses REM and causes rebound arousals in the second half of the night).',
    bullets: [
      'Micro-arousals (< 3 min) are normal and typically unremembered',
      'Fragmented sleep impairs memory consolidation and emotional regulation',
      'Elevated cortisol and inflammatory cytokines follow poor sleep continuity',
      'Alcohol suppresses REM and causes rebound arousals',
      'Sleep apnea is the most common cause of pathological fragmentation',
    ],
    reference: {
      title: 'Bonnet, M.H. & Arand, D.L. (2003). Sleep Medicine Reviews, 7(4), 297–310.',
      url: 'https://pubmed.ncbi.nlm.nih.gov/14505597/',
    },
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SleepScienceScreen() {
  const { stage } = useLocalSearchParams<{ stage?: StageKey }>();
  const router = useRouter();
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, number>>({});

  // Scroll to the requested stage section after layout
  useEffect(() => {
    if (!stage) return;
    const timer = setTimeout(() => {
      const y = sectionRefs.current[stage];
      if (y !== undefined && scrollRef.current) {
        scrollRef.current.scrollTo({ y, animated: true });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [stage]);

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
          <Text style={[styles.backLabel, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Sleep Science</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: 'rgba(99,102,241,0.08)', borderColor: '#6366F130' }]}>
          <Text style={styles.introEmoji}>🌙</Text>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>Understanding Your Sleep Architecture</Text>
          <Text style={[styles.introBody, { color: colors.muted }]}>
            A healthy night of sleep cycles through 4–6 complete 90-minute cycles, each containing a mix of
            NREM (N1, N2, N3) and REM stages. Each stage serves a distinct biological purpose. Tap a stage
            in the NeoSleep chart to see where your body spends its time.
          </Text>
        </View>

        {/* Stage sections */}
        {STAGES.map((s) => (
          <View
            key={s.key}
            onLayout={(e) => { sectionRefs.current[s.key] = e.nativeEvent.layout.y; }}
            style={[
              styles.stageCard,
              { borderColor: s.color + '40', backgroundColor: s.color + '0A' },
              stage === s.key && { borderColor: s.color + '80', backgroundColor: s.color + '14' },
            ]}
          >
            {/* Stage header */}
            <View style={styles.stageHeader}>
              <View style={[styles.stageDot, { backgroundColor: s.color }]} />
              <Text style={[styles.stageLabel, { color: s.color }]}>{s.label}</Text>
            </View>
            <Text style={[styles.stageTagline, { color: colors.foreground }]}>{s.tagline}</Text>
            <Text style={[styles.stageBody, { color: colors.muted }]}>{s.body}</Text>

            {/* Key points */}
            <View style={styles.bulletList}>
              {s.bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.bulletText, { color: colors.muted }]}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Reference */}
            <TouchableOpacity
              onPress={() => Linking.openURL(s.reference.url)}
              activeOpacity={0.7}
              style={styles.refRow}
            >
              <Text style={[styles.refIcon, { color: s.color }]}>📄 </Text>
              <Text style={[styles.refText, { color: s.color }]} numberOfLines={2}>
                {s.reference.title}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Footer note */}
        <View style={[styles.footerNote, { borderColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            This information is for educational purposes only and is not a substitute for professional advice.
            Talk to a healthcare professional if you have concerns about your sleep health.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    width: 80,
  },
  backArrow: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
    marginRight: 2,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 48,
  },
  introCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    alignItems: 'center',
  },
  introEmoji: {
    fontSize: 32,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  introBody: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  stageCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stageLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  stageTagline: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  stageBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  bulletList: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    gap: 2,
  },
  refIcon: {
    fontSize: 12,
  },
  refText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
    textDecorationLine: 'underline',
  },
  footerNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    marginTop: 8,
  },
  footerText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
