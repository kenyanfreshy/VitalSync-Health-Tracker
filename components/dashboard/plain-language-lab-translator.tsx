/**
 * PlainLanguageLabTranslator
 *
 * Converts complex health metrics (vitals + lab results + SpO2) into
 * human-readable status cards with plain-language summaries.
 *
 * Examples:
 *   "Oxygen levels are optimal for recovery." (SpO₂ 98%)
 *   "Blood pressure is slightly elevated. Consider reducing sodium intake." (142/90)
 *   "Blood sugar is in the pre-diabetic range. A low-glycaemic meal plan may help." (108 mg/dL)
 *   "LDL cholesterol is above the optimal range. Statin therapy may be indicated." (142 mg/dL)
 *   "Kidney function appears normal based on your latest creatinine result." (0.9 mg/dL)
 *
 * Collapsed by default. Tapping the header expands the full card list.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  _ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { GlassCard } from '@/components/glass-card';
import * as Haptics from 'expo-haptics';
import { useHealth } from '@/lib/health/health-context';
import { useColors } from '@/hooks';
import type { VitalSignsRecord, BloodSugarRecord } from '@/lib/health/types';
import { LabResult, LabAnalyteId, REFERENCE_RANGES, getAnalyteStatus } from '@/lib/health/lab-types';
// ─── Types ────────────────────────────────────────────────────────────────────

type StatusLevel = 'optimal' | 'good' | 'watch' | 'elevated' | 'critical';

interface HealthStatusCard {
  id: string;
  icon: string;
  title: string;
  value: string;
  unit: string;
  level: StatusLevel;
  summary: string;       // plain-language sentence
  detail?: string;       // optional extra context
  accentColor: string;
}

// ─── Status → color ───────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<StatusLevel, string> = {
  optimal:  '#10B981',
  good:     '#22C55E',
  watch:    '#F59E0B',
  elevated: '#F97316',
  critical: '#EF4444',
};

const LEVEL_BG: Record<StatusLevel, string> = {
  optimal:  '#F0FDF4',
  good:     '#F0FDF4',
  watch:    '#FFFBEB',
  elevated: '#FFF7ED',
  critical: '#FEF2F2',
};

const LEVEL_BORDER: Record<StatusLevel, string> = {
  optimal:  '#BBF7D0',
  good:     '#BBF7D0',
  watch:    '#FDE68A',
  elevated: '#FED7AA',
  critical: '#FECACA',
};

const LEVEL_LABELS: Record<StatusLevel, string> = {
  optimal:  'Optimal',
  good:     'Good',
  watch:    'Watch',
  elevated: 'Elevated',
  critical: 'Critical',
};

// ─── Vital card builders ──────────────────────────────────────────────────────


/** Maps card id prefix → Color Code Guide section title */
const COLOR_GUIDE_SECTION: Record<string, string> = {
  bp:      'Blood Pressure',
  hr:      'Heart Rate & Pulse',
  spo2:    'Blood Oxygen (SpO₂)',
  glucose: 'Blood Glucose',
  temp:    'Body Temperature',
};

function getColorGuideSection(cardId: string): string {
  for (const [prefix, section] of Object.entries(COLOR_GUIDE_SECTION)) {
    if (cardId === prefix || cardId.startsWith(prefix + '_')) return section;
  }
  return 'Universal Status Colors';
}

function buildSpo2Card(vitals: VitalSignsRecord[]): HealthStatusCard | null {
  const latest = vitals.find(v => v.oxygenSaturation != null || (v as any).spo2 != null);
  const val: number | undefined = latest?.oxygenSaturation ?? (latest as any)?.spo2;
  if (val == null) return null;

  let level: StatusLevel = 'optimal';
  let summary = 'Oxygen levels are optimal for recovery.';
  let detail: string | undefined;

  if (val < 90) {
    level = 'critical';
    summary = 'Oxygen saturation is critically low. Seek medical attention immediately.';
  } else if (val < 94) {
    level = 'elevated';
    summary = 'Oxygen levels are below normal. Rest and avoid strenuous activity.';
    detail = 'Levels below 94% may indicate respiratory compromise.';
  } else if (val < 96) {
    level = 'watch';
    summary = 'Oxygen levels are slightly below the ideal range.';
    detail = 'Monitor closely if you have asthma or COPD.';
  } else if (val >= 98) {
    summary = 'Oxygen levels are excellent — ideal for physical recovery.';
  }

  return {
    id: 'spo2',
    icon: '💨',
    title: 'Blood Oxygen (SpO₂)',
    value: `${val}`,
    unit: '%',
    level,
    summary,
    detail,
    accentColor: LEVEL_COLORS[level],
  };
}

function buildBPCard(vitals: VitalSignsRecord[]): HealthStatusCard | null {
  const latest = vitals.find(v => v.systolic && v.diastolic);
  if (!latest?.systolic || !latest?.diastolic) return null;
  const s = latest.systolic;
  const d = latest.diastolic;

  let level: StatusLevel = 'optimal';
  let summary = 'Blood pressure is within the normal range.';
  let detail: string | undefined;

  if (s >= 180 || d >= 120) {
    level = 'critical';
    summary = 'Blood pressure is in the hypertensive crisis range. Seek emergency care.';
  } else if (s >= 140 || d >= 90) {
    level = 'elevated';
    summary = 'Blood pressure is elevated (Stage 2 Hypertension). Medication review recommended.';
    detail = 'Reducing dietary sodium, increasing potassium, and regular aerobic exercise can help.';
  } else if (s >= 130 || d >= 80) {
    level = 'watch';
    summary = 'Blood pressure is slightly elevated (Stage 1 Hypertension). Lifestyle changes may help.';
    detail = 'Consider reducing sodium intake and increasing physical activity.';
  } else if (s >= 120) {
    level = 'watch';
    summary = 'Blood pressure is elevated but not yet hypertensive. Worth monitoring.';
  } else if (s < 90 || d < 60) {
    level = 'watch';
    summary = 'Blood pressure is on the lower side. Stay hydrated and rise slowly.';
  } else {
    summary = 'Blood pressure is in the healthy range. Keep up the good work.';
    level = 'good';
  }

  return {
    id: 'bp',
    icon: '🩸',
    title: 'Blood Pressure',
    value: `${s}/${d}`,
    unit: 'mmHg',
    level,
    summary,
    detail,
    accentColor: LEVEL_COLORS[level],
  };
}

function buildGlucoseCard(bs: BloodSugarRecord[]): HealthStatusCard | null {
  const latest = bs[0];
  if (!latest) return null;
  const val = latest.glucoseMgDl ?? (latest.glucoseMmol ? Math.round(latest.glucoseMmol * 18.0182) : null);
  if (!val) return null;

  let level: StatusLevel = 'optimal';
  let summary = 'Blood sugar is in the healthy fasting range.';
  let detail: string | undefined;

  if (val >= 200) {
    level = 'critical';
    summary = 'Blood sugar is in the diabetic range. Consult your care team promptly.';
    detail = 'Values ≥200 mg/dL may indicate uncontrolled diabetes.';
  } else if (val >= 126) {
    level = 'elevated';
    summary = 'Fasting blood sugar is elevated, consistent with diabetes criteria.';
    detail = 'A low-glycaemic diet and regular exercise can significantly improve control.';
  } else if (val >= 100) {
    level = 'watch';
    summary = 'Blood sugar is in the pre-diabetic range. Dietary adjustments can help.';
    detail = 'Reducing refined carbohydrates and increasing fiber intake is evidence-based.';
  } else if (val < 70) {
    level = 'watch';
    summary = 'Blood sugar is low. Have a small snack with fast-acting carbohydrates.';
  } else {
    level = 'good';
    summary = 'Blood sugar is in the healthy fasting range. Good metabolic control.';
  }

  return {
    id: 'glucose',
    icon: '🍬',
    title: 'Blood Sugar (Fasting)',
    value: `${val}`,
    unit: 'mg/dL',
    level,
    summary,
    detail,
    accentColor: LEVEL_COLORS[level],
  };
}

function buildHRCard(vitals: VitalSignsRecord[]): HealthStatusCard | null {
  const latest = vitals.find(v => v.heartRate);
  if (!latest?.heartRate) return null;
  const hr = latest.heartRate;

  let level: StatusLevel = 'optimal';
  let summary = 'Resting heart rate is in the healthy range.';
  let detail: string | undefined;

  if (hr > 100) {
    level = 'elevated';
    summary = 'Heart rate is elevated (tachycardia). Rest and monitor if persistent.';
    detail = 'Persistent resting tachycardia warrants clinical evaluation.';
  } else if (hr > 90) {
    level = 'watch';
    summary = 'Resting heart rate is on the higher side. Stress or dehydration may be a factor.';
  } else if (hr < 50) {
    level = 'watch';
    summary = 'Resting heart rate is low (bradycardia). Normal in athletes but worth monitoring.';
  } else if (hr <= 60) {
    level = 'optimal';
    summary = 'Resting heart rate is excellent — consistent with good cardiovascular fitness.';
  } else {
    level = 'good';
    summary = 'Resting heart rate is in the healthy range.';
  }

  return {
    id: 'hr',
    icon: '🫀',
    title: 'Resting Heart Rate',
    value: `${hr}`,
    unit: 'bpm',
    level,
    summary,
    detail,
    accentColor: LEVEL_COLORS[level],
  };
}

// ─── Lab card builder ─────────────────────────────────────────────────────────

const LAB_PLAIN_LANGUAGE: Partial<Record<LabAnalyteId, {
  title: string;
  icon: string;
  optimal: string;
  high: string;
  low: string;
  highDetail?: string;
  lowDetail?: string;
}>> = {
  glucose: {
    title: 'Fasting Glucose (Lab)',
    icon: '🍬',
    optimal: 'Fasting glucose is within the normal range.',
    high: 'Fasting glucose is elevated. A low-glycaemic diet may help.',
    low: 'Fasting glucose is below normal. Ensure regular meals.',
    highDetail: 'Elevated fasting glucose is a key marker for diabetes risk.',
  },
  creatinine: {
    title: 'Kidney Function (Creatinine)',
    icon: '🫘',
    optimal: 'Kidney function appears normal based on your creatinine result.',
    high: 'Creatinine is elevated, which may indicate reduced kidney function.',
    low: 'Creatinine is slightly low — often normal but worth monitoring.',
    highDetail: 'Staying well-hydrated and limiting NSAIDs supports kidney health.',
  },
  egfr: {
    title: 'Kidney Filtration Rate (eGFR)',
    icon: '🫘',
    optimal: 'Kidney filtration rate is in the normal range.',
    high: 'eGFR is above normal — typically not a concern.',
    low: 'Kidney filtration rate is reduced. Discuss with your nephrologist.',
    lowDetail: 'eGFR below 60 for 3+ months may indicate chronic kidney disease.',
  },
  ldl: {
    title: 'LDL Cholesterol',
    icon: '🫀',
    optimal: 'LDL cholesterol is at an optimal level for cardiovascular health.',
    high: 'LDL cholesterol is above the optimal range. Statin therapy may be indicated.',
    low: 'LDL cholesterol is very low — generally favourable.',
    highDetail: 'A plant-based diet rich in soluble fiber can reduce LDL by 10–15%.',
  },
  hdl: {
    title: 'HDL Cholesterol (Good)',
    icon: '🫀',
    optimal: 'HDL cholesterol is at a protective level.',
    high: 'HDL is high — this is generally beneficial.',
    low: 'HDL is below the protective threshold. Regular aerobic exercise can raise it.',
    lowDetail: 'HDL below 40 mg/dL is an independent cardiovascular risk factor.',
  },
  triglycerides: {
    title: 'Triglycerides',
    icon: '🫀',
    optimal: 'Triglycerides are in the normal range.',
    high: 'Triglycerides are elevated. Reducing refined carbohydrates and alcohol can help.',
    low: 'Triglycerides are very low — typically not a concern.',
    highDetail: 'Very high triglycerides (>500 mg/dL) increase pancreatitis risk.',
  },
  a1c: {
    title: 'HbA1c (3-Month Blood Sugar)',
    icon: '🍬',
    optimal: 'HbA1c reflects good long-term blood sugar control.',
    high: 'HbA1c is elevated, indicating higher average blood sugar over 3 months.',
    low: 'HbA1c is very low — monitor for hypoglycaemia if on diabetes medication.',
    highDetail: 'Each 1% reduction in HbA1c reduces diabetes complications by ~20%.',
  },
  sodium: {
    title: 'Blood Sodium (Electrolytes)',
    icon: '🧂',
    optimal: 'Blood sodium is in the normal range — electrolytes are balanced.',
    high: 'Blood sodium is high (hypernatraemia). Increase fluid intake.',
    low: 'Blood sodium is low (hyponatraemia). Avoid excessive water intake.',
  },
  potassium: {
    title: 'Potassium (Electrolytes)',
    icon: '🍌',
    optimal: 'Potassium is in the normal range — heart rhythm support is good.',
    high: 'Potassium is elevated (hyperkalaemia). Limit high-potassium foods.',
    low: 'Potassium is low (hypokalaemia). Increase potassium-rich foods.',
    lowDetail: 'Low potassium can cause muscle cramps and heart rhythm issues.',
  },
  hemoglobin: {
    title: 'Haemoglobin (Anaemia Screen)',
    icon: '🩸',
    optimal: 'Haemoglobin is in the normal range — no signs of anaemia.',
    high: 'Haemoglobin is elevated. Ensure adequate hydration.',
    low: 'Haemoglobin is low, suggesting possible anaemia. Iron or B12 may be needed.',
    lowDetail: 'Plant-based diets should include iron-rich foods with vitamin C for absorption.',
  },
  magnesium: {
    title: 'Magnesium',
    icon: '⚡',
    optimal: 'Magnesium is in the normal range — muscle and nerve function supported.',
    high: 'Magnesium is elevated. Review supplement doses.',
    low: 'Magnesium is low. Nuts, seeds, and leafy greens are excellent sources.',
    lowDetail: 'Low magnesium is linked to muscle cramps, fatigue, and poor sleep.',
  },
  phosphorus: {
    title: 'Phosphorus',
    icon: '🦴',
    optimal: 'Phosphorus is in the normal range — bone health is supported.',
    high: 'Phosphorus is elevated. Limit processed foods and phosphate additives.',
    low: 'Phosphorus is low. Ensure adequate protein and whole-grain intake.',
  },
};

function buildLabCards(labs: LabResult[]): HealthStatusCard[] {
  if (!labs.length) return [];
  const cards: HealthStatusCard[] = [];
  const seen = new Set<LabAnalyteId>();

  // Process most recent lab first
  const sorted = [...labs].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  for (const lab of sorted) {
    for (const [analyteId, value] of Object.entries(lab.values) as [LabAnalyteId, number][]) {
      if (seen.has(analyteId) || value == null) continue;
      seen.add(analyteId);

      const def = REFERENCE_RANGES[analyteId];
      const plain = LAB_PLAIN_LANGUAGE[analyteId];
      if (!def || !plain) continue;

      const status = getAnalyteStatus(analyteId, value);
      let level: StatusLevel = 'optimal';
      let summary = plain.optimal;
      let detail: string | undefined;

      if (status === 'high') {
        level = value > (def.high ?? 0) * 1.5 ? 'critical' : 'elevated';
        summary = plain.high;
        detail = plain.highDetail;
      } else if (status === 'low') {
        level = value < (def.low ?? 0) * 0.7 ? 'critical' : 'watch';
        summary = plain.low;
        detail = plain.lowDetail;
      } else {
        level = 'good';
      }

      cards.push({
        id: `lab_${analyteId}`,
        icon: plain.icon,
        title: plain.title,
        value: `${value}`,
        unit: def.unit,
        level,
        summary,
        detail,
        accentColor: LEVEL_COLORS[level],
      });
    }
  }

  return cards.sort((a, b) => {
    const order: Record<StatusLevel, number> = { critical: 0, elevated: 1, watch: 2, good: 3, optimal: 4 };
    return order[a.level] - order[b.level];
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PlainLanguageLabTranslatorProps {
  /** When provided, overrides the internal expanded state (true = expanded, false = collapsed). */
  overrideExpanded?: boolean;
  /** Called when the card becomes visible (true) or hidden (false, e.g. no data). */
  onVisibilityChange?: (visible: boolean) => void;
}

export function PlainLanguageLabTranslator({ overrideExpanded, onVisibilityChange }: PlainLanguageLabTranslatorProps = {}) {
  const colors = useColors();
  const { state } = useHealth();
  const data = state.data;
  const [expanded, setExpanded] = useState(false);

  // External override from Collapse/Expand All
  // overrideExpanded=false forces card closed; overrideExpanded=true forces card open.
  const prevOverrideRef = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (overrideExpanded === prevOverrideRef.current) return;
    prevOverrideRef.current = overrideExpanded;
    if (overrideExpanded === false) setExpanded(false);
    else if (overrideExpanded === true) setExpanded(true);
  }, [overrideExpanded]);

  const cards = useMemo((): HealthStatusCard[] => {
    if (!data) return [];
    const vitals = data.vitalSigns ?? [];
    const bs = data.bloodSugar ?? [];
    const labs = data.labResults ?? [];

    return [
      buildSpo2Card(vitals),
      buildBPCard(vitals),
      buildGlucoseCard(bs),
      buildHRCard(vitals),
      ...buildLabCards(labs),
    ].filter((c): c is HealthStatusCard => c !== null);
  }, [data]);

  const isVisible = cards.length > 0;
  const prevVisibleRef = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (prevVisibleRef.current === isVisible) return;
    prevVisibleRef.current = isVisible;
    onVisibilityChange?.(isVisible);
  }, [isVisible, onVisibilityChange]);

  if (!isVisible) return null;

  const criticalCount = cards.filter(c => c.level === 'critical' || c.level === 'elevated').length;
  const watchCount = cards.filter(c => c.level === 'watch').length;
  const goodCount = cards.filter(c => c.level === 'optimal' || c.level === 'good').length;

  const summaryColor = criticalCount > 0 ? '#EF4444' : watchCount > 0 ? '#F59E0B' : '#10B981';
  const summaryText = criticalCount > 0
    ? `${criticalCount} metric${criticalCount > 1 ? 's' : ''} need attention`
    : watchCount > 0
      ? `${watchCount} metric${watchCount > 1 ? 's' : ''} to watch`
      : `All ${goodCount} metrics look good`;

  return (
    <GlassCard accentColor={summaryColor} noPadding style={{ marginHorizontal: 16, marginBottom: 8 }}>
      {/* Header */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(e => !e);
        }}
      >
        <Text style={styles.headerIcon}>🔬</Text>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Health Status</Text>
          <Text style={[styles.headerSub, { color: summaryColor }]}>{summaryText}</Text>
        </View>
        {/* Status dots */}
        <View style={styles.statusDots}>
          {criticalCount > 0 && <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />}
          {watchCount > 0 && <View style={[styles.dot, { backgroundColor: '#F59E0B' }]} />}
          {goodCount > 0 && <View style={[styles.dot, { backgroundColor: '#10B981' }]} />}
        </View>
        <Text style={[styles.chevron, { color: colors.muted }]}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {/* Cards */}
      {expanded && (
        <View style={styles.cardList}>
          {cards.map(card => (
            <StatusCard key={card.id} card={card} />
          ))}
        </View>
      )}
    </GlassCard>
  );
}

// ─── Status Card ──────────────────────────────────────────────────────────────

function StatusCard({ card: c }: { card: HealthStatusCard }) {
  const [detailVisible, setDetailVisible] = useState(false);

  return (
    <Pressable
      style={[
        sCard.container,
        { backgroundColor: LEVEL_BG[c.level], borderColor: LEVEL_BORDER[c.level] },
      ]}
      onPress={() => c.detail && setDetailVisible(v => !v)}
    >
      <View style={[sCard.leftBar, { backgroundColor: LEVEL_COLORS[c.level] }]} />
      <View style={sCard.content}>
        <View style={sCard.topRow}>
          <Text style={sCard.icon}>{c.icon}</Text>
          <View style={sCard.textBlock}>
            <View style={sCard.titleRow}>
              <Text style={sCard.title}>{c.title}</Text>
              <View style={[sCard.levelBadge, { backgroundColor: LEVEL_COLORS[c.level] + '20' }]}>
                <Text style={[sCard.levelText, { color: LEVEL_COLORS[c.level] }]}>
                  {LEVEL_LABELS[c.level]}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/settings/color-legend', params: { section: getColorGuideSection(c.id) } });
                }}
                accessibilityRole="button"
                accessibilityLabel={`What does ${LEVEL_LABELS[c.level]} mean? Open Color Code Guide`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[sCard.helpIcon, { borderColor: LEVEL_COLORS[c.level] + '60' }]}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: LEVEL_COLORS[c.level] }}>?</Text>
                </View>
              </TouchableOpacity>
            </View>
            <Text style={[sCard.value, { color: LEVEL_COLORS[c.level] }]}>
              {c.value} <Text style={sCard.unit}>{c.unit}</Text>
            </Text>
          </View>
        </View>
        <Text style={sCard.summary}>{c.summary}</Text>
        {detailVisible && c.detail && (
          <Text style={[sCard.detail, { color: LEVEL_COLORS[c.level] }]}>{c.detail}</Text>
        )}
        {c.detail && (
          <Text style={sCard.tapHint}>{detailVisible ? 'Tap to collapse' : 'Tap for more context'}</Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  headerIcon: { fontSize: 20 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerSub: { fontSize: 12, fontWeight: '600' },
  statusDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chevron: { fontSize: 16 },
  cardList: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
});

const sCard = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  leftBar: { width: 4 },
  content: { flex: 1, padding: 12, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { fontSize: 18, marginTop: 2 },
  textBlock: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 12, fontWeight: '700', color: '#374151', flex: 1 },
  levelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  levelText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  helpIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 18, fontWeight: '800' },
  unit: { fontSize: 12, fontWeight: '500' },
  summary: { fontSize: 13, color: '#374151', lineHeight: 18 },
  detail: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  tapHint: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
});
