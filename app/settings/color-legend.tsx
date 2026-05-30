/**
 * Color Code Legend — Settings sub-screen
 *
 * Explains every color used across all tabs and sections of VitalSync so
 * users can interpret charts, badges, status indicators, and alert banners
 * without needing to guess what each hue means.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useLang } from '@/hooks';
import { colorLegendStrings } from '@/lib/i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Data ─────────────────────────────────────────────────────────────────────

interface ColorEntry {
  color: string;
  label: string;
  description: string;
}

interface LegendSection {
  title: string;
  icon: string;
  iconColor: string;
  entries: ColorEntry[];
}

function getLegendSections(cls: Record<string, string>): LegendSection[] {
  return [
  {
    title: cls.secUniversal ?? 'Universal Status Colors',
    icon: 'circle.fill',
    iconColor: '#10B981',
    entries: [
      { color: '#10B981', label: cls.uGreenLabel ?? 'Green — Normal / Good', description: cls.uGreenDesc ?? 'Value is within the healthy reference range. No action needed.' },
      { color: '#F59E0B', label: cls.uAmberLabel ?? 'Amber — Borderline / Warning', description: cls.uAmberDesc ?? 'Value is slightly outside the normal range. Monitor closely and consider consulting your care team.' },
      { color: '#EF4444', label: cls.uRedLabel ?? 'Red — Abnormal / Alert', description: cls.uRedDesc ?? 'Value is significantly outside the normal range. Review with your physician.' },
      { color: '#3B82F6', label: cls.uBlueLabel ?? 'Blue — Informational', description: cls.uBlueDesc ?? 'Neutral data point or reference value. No clinical concern implied.' },
      { color: '#8B5CF6', label: cls.uPurpleLabel ?? 'Purple — Sleep / Recovery', description: cls.uPurpleDesc ?? 'Sleep-related metrics, recovery scores, and HRV data.' },
      { color: '#6366F1', label: cls.uIndigoLabel ?? 'Indigo — Activity / Fitness', description: cls.uIndigoDesc ?? 'Physical activity, steps, exercise sessions, and VO₂ max estimates.' },
      { color: '#22C55E', label: cls.uTealLabel ?? 'Teal — Primary Accent', description: cls.uTealDesc ?? 'Interactive elements, selected states, and primary action buttons.' },
    ],
  },
  {
    title: cls.secBloodPressure ?? 'Blood Pressure',
    icon: 'heart.fill',
    iconColor: '#EF4444',
    entries: [
      { color: '#10B981', label: cls.bpGreenLabel ?? 'Green — Normal (< 120/80)', description: cls.bpGreenDesc ?? 'Systolic < 120 mmHg and diastolic < 80 mmHg. Optimal cardiovascular health.' },
      { color: '#3B82F6', label: cls.bpBlueLabel ?? 'Blue — Elevated (120–129 / < 80)', description: cls.bpBlueDesc ?? 'Elevated systolic. Lifestyle changes recommended per AHA guidelines.' },
      { color: '#F59E0B', label: cls.bpAmberLabel ?? 'Amber — Stage 1 Hypertension (130–139 / 80–89)', description: cls.bpAmberDesc ?? 'Stage 1 hypertension. Discuss management with your physician.' },
      { color: '#EF4444', label: cls.bpRedLabel ?? 'Red — Stage 2 Hypertension (≥ 140 / ≥ 90)', description: cls.bpRedDesc ?? 'Stage 2 hypertension. Medical evaluation recommended.' },
      { color: '#DC2626', label: cls.bpDarkRedLabel ?? 'Dark Red — Hypertensive Crisis (> 180 / > 120)', description: cls.bpDarkRedDesc ?? 'Hypertensive crisis. Seek emergency care immediately if symptomatic.' },
      { color: '#8B5CF6', label: cls.bpPurpleLabel ?? 'Purple — Low / Hypotension (< 90/60)', description: cls.bpPurpleDesc ?? 'Blood pressure is below normal. May cause dizziness or fainting.' },
    ],
  },
  {
    title: cls.secHeartRate ?? 'Heart Rate',
    icon: 'heart.fill',
    iconColor: '#F43F5E',
    entries: [
      { color: '#10B981', label: cls.hrGreenLabel ?? 'Green — Normal (60–100 bpm)', description: cls.hrGreenDesc ?? 'Normal resting heart rate for adults.' },
      { color: '#F59E0B', label: cls.hrAmberLabel ?? 'Amber — Borderline (50–59 or 101–110 bpm)', description: cls.hrAmberDesc ?? 'Slightly outside the normal range. May be normal for athletes (low end) or during mild exertion.' },
      { color: '#EF4444', label: cls.hrRedLabel ?? 'Red — Abnormal (< 50 or > 110 bpm)', description: cls.hrRedDesc ?? 'Bradycardia (< 50) or tachycardia (> 110) at rest. Consult your physician.' },
    ],
  },
  {
    title: cls.secBloodOxygen ?? 'Blood Oxygen (SpO₂)',
    icon: 'lungs.fill',
    iconColor: '#3B82F6',
    entries: [
      { color: '#10B981', label: cls.spo2GreenLabel ?? 'Green — Normal (≥ 95%)', description: cls.spo2GreenDesc ?? 'Adequate oxygen saturation for most adults.' },
      { color: '#F59E0B', label: cls.spo2AmberLabel ?? 'Amber — Low-Normal (90–94%)', description: cls.spo2AmberDesc ?? 'Mildly reduced. May be acceptable for some conditions; monitor closely.' },
      { color: '#EF4444', label: cls.spo2RedLabel ?? 'Red — Low (< 90%)', description: cls.spo2RedDesc ?? 'Hypoxemia. Seek medical attention promptly.' },
    ],
  },
  {
    title: 'Blood Glucose',
    icon: 'drop.fill',
    iconColor: '#F59E0B',
    entries: [
      { color: '#10B981', label: cls.bgGreenLabel ?? 'Green — In Range', description: cls.bgGreenDesc ?? 'Fasting: 70–99 mg/dL · Post-meal (2 hr): < 140 mg/dL. Within healthy reference.' },
      { color: '#F59E0B', label: cls.bgAmberLabel ?? 'Amber — Pre-Diabetic / Borderline', description: cls.bgAmberDesc ?? 'Fasting: 100–125 mg/dL · Post-meal: 140–199 mg/dL. Elevated risk; lifestyle review recommended.' },
      { color: '#EF4444', label: cls.bgRedLabel ?? 'Red — Diabetic Range / High', description: cls.bgRedDesc ?? 'Fasting: ≥ 126 mg/dL · Post-meal: ≥ 200 mg/dL. Discuss with your care team.' },
      { color: '#8B5CF6', label: cls.bgPurpleLabel ?? 'Purple — Low / Hypoglycemia (< 70 mg/dL)', description: cls.bgPurpleDesc ?? 'Blood glucose below normal. May cause symptoms; treat per your care plan.' },
    ],
  },
  {
    title: cls.secBodyTemp ?? 'Body Temperature',
    icon: 'thermometer.medium',
    iconColor: '#FB923C',
    entries: [
      { color: '#10B981', label: cls.btGreenLabel ?? 'Green — Normal (97.8–99.1°F / 36.5–37.3°C)', description: cls.btGreenDesc ?? 'Normal body temperature range for adults.' },
      { color: '#F59E0B', label: cls.btAmberLabel ?? 'Amber — Low-Grade Fever (99.1–100.3°F / 37.3–37.9°C)', description: cls.btAmberDesc ?? 'Mild elevation. Monitor for other symptoms.' },
      { color: '#EF4444', label: cls.btRedLabel ?? 'Red — Fever (≥ 100.4°F / ≥ 38°C)', description: cls.btRedDesc ?? 'Clinical fever. Rest, hydrate, and speak with a healthcare provider if persistent.' },
      { color: '#8B5CF6', label: cls.btPurpleLabel ?? 'Purple — Hypothermia (< 95°F / < 35°C)', description: cls.btPurpleDesc ?? 'Abnormally low body temperature. Seek medical attention.' },
    ],
  },
  {
    title: cls.secSleep ?? 'Sleep',
    icon: 'moon.fill',
    iconColor: '#8B5CF6',
    entries: [
      { color: '#8B5CF6', label: cls.slPurpleLabel ?? 'Purple — Deep Sleep', description: cls.slPurpleDesc ?? 'Slow-wave sleep (N3). Critical for physical recovery and immune function.' },
      { color: '#6366F1', label: cls.slIndigoLabel ?? 'Indigo — REM Sleep', description: cls.slIndigoDesc ?? 'Rapid Eye Movement sleep. Important for memory consolidation and mood.' },
      { color: '#3B82F6', label: cls.slBlueLabel ?? 'Blue — Light Sleep', description: cls.slBlueDesc ?? 'NREM stages N1 and N2. Transitional sleep between wake and deep sleep.' },
      { color: '#94A3B8', label: cls.slGrayLabel ?? 'Gray — Awake', description: cls.slGrayDesc ?? 'Periods of wakefulness detected during the sleep session.' },
      { color: '#10B981', label: cls.slGreenLabel ?? 'Green — Sleep Score Good (≥ 80)', description: cls.slGreenDesc ?? 'Overall sleep quality score is good. Sufficient duration and staging.' },
      { color: '#F59E0B', label: cls.slAmberLabel ?? 'Amber — Sleep Score Fair (60–79)', description: cls.slAmberDesc ?? 'Sleep quality could be improved. Review sleep hygiene tips.' },
      { color: '#EF4444', label: cls.slRedLabel ?? 'Red — Sleep Score Poor (< 60)', description: cls.slRedDesc ?? 'Poor sleep quality. Consider consulting a sleep specialist.' },
    ],
  },
  {
    title: cls.secImmunizations ?? 'Immunizations',
    icon: 'syringe.fill',
    iconColor: '#10B981',
    entries: [
      { color: '#10B981', label: cls.imGreenLabel ?? 'Green — Up to Date', description: cls.imGreenDesc ?? 'All doses received; next dose is more than 30 days away.' },
      { color: '#F59E0B', label: cls.imAmberLabel ?? 'Amber — Due Soon (within 30 days)', description: cls.imAmberDesc ?? 'A vaccine dose is due within the next 30 days. Schedule your appointment.' },
      { color: '#EF4444', label: cls.imRedLabel ?? 'Red — Overdue', description: cls.imRedDesc ?? 'A vaccine dose is past its recommended due date. Schedule as soon as possible.' },
      { color: '#3B82F6', label: cls.imBlueLabel ?? 'Blue — Scheduled', description: cls.imBlueDesc ?? 'Appointment has been booked for this vaccine.' },
      { color: '#94A3B8', label: cls.imGrayLabel ?? 'Gray — Declined / Exempt', description: cls.imGrayDesc ?? 'Vaccine was declined or a medical exemption is on file.' },
    ],
  },
  {
    title: cls.secNutrition ?? 'Nutrition & Diet',
    icon: 'fork.knife',
    iconColor: '#F59E0B',
    entries: [
      { color: '#10B981', label: cls.ntGreenLabel ?? 'Green — Within Goal', description: cls.ntGreenDesc ?? 'Nutrient intake is within your daily target range.' },
      { color: '#F59E0B', label: cls.ntAmberLabel ?? 'Amber — Approaching Limit', description: cls.ntAmberDesc ?? 'Intake is between 80–100% of the daily limit. Monitor remaining meals.' },
      { color: '#EF4444', label: cls.ntRedLabel ?? 'Red — Exceeded', description: cls.ntRedDesc ?? 'Daily limit for this nutrient has been exceeded.' },
      { color: '#3B82F6', label: cls.ntBlueLabel ?? 'Blue — Protein', description: cls.ntBlueDesc ?? 'Protein macronutrient bar and tracking indicator.' },
      { color: '#F59E0B', label: cls.ntAmber2Label ?? 'Amber — Carbohydrates', description: cls.ntAmber2Desc ?? 'Carbohydrate macronutrient bar and tracking indicator.' },
      { color: '#EF4444', label: cls.ntRed2Label ?? 'Red/Pink — Fat', description: cls.ntRed2Desc ?? 'Fat macronutrient bar and tracking indicator.' },
      { color: '#10B981', label: cls.ntGreen2Label ?? 'Green — Fiber', description: cls.ntGreen2Desc ?? 'Dietary fiber intake indicator.' },
    ],
  },
  {
    title: cls.secTabBar ?? 'Tab Bar Badges',
    icon: 'bell.badge.fill',
    iconColor: '#EF4444',
    entries: [
      { color: '#EF4444', label: cls.tbRedLabel ?? 'Red Dot — Overdue / Critical Alert', description: cls.tbRedDesc ?? 'Something requires immediate attention (e.g. overdue vaccine, critical vital reading).' },
      { color: '#F59E0B', label: cls.tbAmberLabel ?? 'Amber Dot — Due Soon / Warning', description: cls.tbAmberDesc ?? 'An upcoming action is needed within 30 days (e.g. vaccine due soon, medication refill approaching).' },
      { color: '#10B981', label: cls.tbGreenLabel ?? 'Green Dot — New Data / Success', description: cls.tbGreenDesc ?? 'New data has been synced or a goal has been achieved.' },
    ],
  },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ColorLegendScreen() {
  const colors = useColors();
  const lang = useLang();
  const cls = colorLegendStrings[lang as keyof typeof colorLegendStrings] ?? colorLegendStrings.en;
  const insets = useSafeAreaInsets();
  const isDark = colors.background === '#151718' || colors.background < '#888888';
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const [expandedSection, setExpandedSection] = useState<string | null>(sectionParam ?? null);
  const scrollRef = useRef<ScrollView>(null);

  // Auto-expand the requested section on mount
  useEffect(() => {
    if (sectionParam) {
      setExpandedSection(sectionParam);
    }
  }, [sectionParam]);

  const surfaceColor = isDark ? '#1C1F2A' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const headerBg = isDark ? '#0D0E12' : '#F8FAFC';

  function toggleSection(title: string) {
    setExpandedSection(prev => (prev === title ? null : title));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <View style={[styles.root, { backgroundColor: isDark ? '#0D0E12' : '#F8FAFC' }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: borderColor, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={cls.goBack}
        >
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={18} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>{cls.back}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{cls.title}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Intro ── */}
        <View style={[styles.introCard, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>{cls.introTitle}</Text>
          <Text style={[styles.introBody, { color: colors.muted }]}>{cls.introBody}</Text>
          <View style={styles.quickRow}>
            {[
              { color: '#10B981', label: cls.good },
              { color: '#F59E0B', label: cls.warning },
              { color: '#EF4444', label: cls.alert },
              { color: '#3B82F6', label: cls.info },
              { color: '#8B5CF6', label: cls.sleep },
            ].map(({ color, label }) => (
              <View key={label} style={styles.quickItem}>
                <View style={[styles.quickDot, { backgroundColor: color }]} />
                <Text style={[styles.quickLabel, { color: colors.muted }]}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Sections ── */}
        {getLegendSections(cls).map((section) => {
          const isExpanded = expandedSection === section.title;
          return (
            <View key={section.title} style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
              {/* Section header — always visible */}
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.title)}
                accessibilityRole="button"
                accessibilityLabel={`${section.title}, ${isExpanded ? 'collapse' : 'expand'}`}
                accessibilityState={{ expanded: isExpanded }}
              >
                <View style={[styles.sectionIconWrap, { backgroundColor: section.iconColor + '18' }]}>
                  <IconSymbol name={section.icon as any} size={16} color={section.iconColor} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
                <View style={[styles.chevron, { transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }]}>
                  <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                </View>
              </TouchableOpacity>

              {/* Entries — only visible when expanded */}
              {isExpanded && (
                <View style={[styles.entriesContainer, { borderTopColor: borderColor }]}>
                  {section.entries.map((entry, idx) => (
                    <View
                      key={entry.label}
                      style={[
                        styles.entryRow,
                        idx < section.entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
                      ]}
                    >
                      <View style={[styles.colorSwatch, { backgroundColor: entry.color }]} />
                      <View style={styles.entryText}>
                        <Text style={[styles.entryLabel, { color: colors.foreground }]}>{entry.label}</Text>
                        <Text style={[styles.entryDesc, { color: colors.muted }]}>{entry.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Disclaimer ── */}
        <View style={[styles.disclaimerCard, { backgroundColor: isDark ? '#1C1F2A' : '#FEF3C7', borderColor: '#F59E0B40' }]}>
          <Text style={[styles.disclaimerText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
            {cls.disclaimer ?? 'Color thresholds are based on general health guidelines (AHA, WHO, CDC). They are for informational purposes only and do not replace professional healthcare guidance. Always speak with a qualified healthcare provider for interpretation of your specific results.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  introCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
  },
  introTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  introBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  quickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  quickDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    // rotation applied via transform prop
  },
  entriesContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginTop: 2,
    flexShrink: 0,
  },
  entryText: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  entryDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  disclaimerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
