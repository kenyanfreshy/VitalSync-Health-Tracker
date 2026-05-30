/**
 * Premium Feature Comparison Screen
 *
 * A full-height Free vs Premium comparison table.
 * Accessible via "Learn more about Premium →" links on locked cards.
 * The CTA at the bottom opens the PremiumGateSheet.
 *
 * All strings are i18n-aware via paywallExtStrings (static locales) + useT (AI translation).
 */
import React, { useCallback, useMemo } from 'react';
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { useSubscription } from '@/lib/subscription/subscription-context';
import { paywallExtStrings } from '@/lib/i18n';
import { useRawLang } from '@/hooks/use-lang';
import { useT } from '@/lib/i18n-ai';

// ─── English source strings for AI translation (group titles + row labels) ───

const COMPARE_STRINGS_EN = {
  plansHeaderTitle: 'Plans',
  heroTitle: 'Free vs Premium',
  heroSubtitle: 'See everything Premium unlocks for your health journey.',
  freeColumnLabel: 'Free',
  premiumColumnLabel: 'Premium',
  bestValueLabel: 'BEST VALUE',
  startTrialBtn: 'Start 14-Day Free Trial',
  noPaymentNote: 'No payment required during trial · Cancel anytime',
  youHavePremiumAccess: 'You have Premium access',
  groupLogging: 'Logging & Tracking',
  groupReminders: 'Smart Reminders',
  groupInsights: 'Insights & Analytics',
  groupReports: 'Reports & Export',
  groupDashboard: 'Dashboard',
  groupSupport: 'Support',
  rowBloodGlucose: 'Blood Glucose Logging',
  rowVitalsBP: 'Vitals & BP Logging',
  rowMedications: 'Medications Tracker',
  rowAppointments: 'Appointments Tracker',
  rowLabResults: 'Lab Results & Documents',
  rowVitalsReminders: 'Vitals & Blood Sugar Reminders',
  rowMedDoseReminders: 'Medication Dose Reminders',
  rowApptReminders: 'Appointment Reminders',
  rowRefillAlerts: 'Refill & Low-Stock Alerts',
  rowBasicCharts: 'Basic Trend Charts',
  rowAdvancedCorrelations: 'Advanced Correlations',
  rowProjectedA1C: 'Projected A1C Estimate',
  rowAIInsightsIOS: 'Personal Health Insights',
  rowAIInsightsAndroid: 'Personal Health Insights',
  rowPDFExport: 'Health Report PDF Export',
  rowDataExport: 'Data Export (CSV)',
  rowStandardDashboard: 'Standard Dashboard',
  rowDashboardCustom: 'Dashboard Customisation',
  rowCommunitySupport: 'Community Support',
  rowPrioritySupport: 'Priority Support',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FeatureRow = {
  icon: string;
  labelKey: keyof typeof COMPARE_STRINGS_EN;
  free: boolean | string;
  premium: boolean | string;
  highlight?: boolean;
};

type FeatureGroup = {
  titleKey: keyof typeof COMPARE_STRINGS_EN;
  rows: FeatureRow[];
};

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    titleKey: 'groupLogging',
    rows: [
      { icon: 'drop.fill',    labelKey: 'rowBloodGlucose',      free: true,  premium: true },
      { icon: 'heart.fill',   labelKey: 'rowVitalsBP',          free: true,  premium: true },
      { icon: 'pills.fill',   labelKey: 'rowMedications',       free: true,  premium: true },
      { icon: 'calendar',     labelKey: 'rowAppointments',      free: true,  premium: true },
      { icon: 'cross.fill',   labelKey: 'rowLabResults',        free: true,  premium: true },
    ],
  },
  {
    titleKey: 'groupReminders',
    rows: [
      { icon: 'alarm.fill',   labelKey: 'rowVitalsReminders',   free: true,  premium: true },
      { icon: 'bell.fill',    labelKey: 'rowMedDoseReminders',  free: false, premium: true, highlight: true },
      { icon: 'calendar',     labelKey: 'rowApptReminders',     free: false, premium: true, highlight: true },
      { icon: 'pills.fill',   labelKey: 'rowRefillAlerts',      free: false, premium: true, highlight: true },
    ],
  },
  {
    titleKey: 'groupInsights',
    rows: [
      { icon: 'chart.bar.fill', labelKey: 'rowBasicCharts',          free: true,  premium: true },
      { icon: 'chart.bar.fill', labelKey: 'rowAdvancedCorrelations', free: false, premium: true, highlight: true },
      { icon: 'drop.fill',      labelKey: 'rowProjectedA1C',         free: false, premium: true, highlight: true },
      { icon: 'sparkles',       labelKey: Platform.OS === 'ios' ? 'rowAIInsightsIOS' : 'rowAIInsightsAndroid', free: false, premium: true, highlight: true },
    ],
  },
  {
    titleKey: 'groupReports',
    rows: [
      { icon: 'cross.fill',     labelKey: 'rowPDFExport',  free: false, premium: true, highlight: true },
      { icon: 'chart.bar.fill', labelKey: 'rowDataExport', free: true,  premium: true },
    ],
  },
  {
    titleKey: 'groupDashboard',
    rows: [
      { icon: 'house.fill', labelKey: 'rowStandardDashboard', free: true,  premium: true },
      { icon: 'sparkles',   labelKey: 'rowDashboardCustom',   free: false, premium: true, highlight: true },
    ],
  },
  {
    titleKey: 'groupSupport',
    rows: [
      { icon: 'person.fill', labelKey: 'rowCommunitySupport', free: true,  premium: true },
      { icon: 'shield.fill', labelKey: 'rowPrioritySupport',  free: false, premium: true },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckCell({ value, isDark, highlight }: { value: boolean | string; isDark: boolean; highlight?: boolean }) {
  if (typeof value === 'string') {
    return (
      <Text style={[styles.cellText, { color: isDark ? '#ECEDEE' : '#11181C' }]} numberOfLines={1}>
        {value}
      </Text>
    );
  }
  if (value) {
    return (
      <View style={styles.cellCenter}>
        {highlight ? (
          <View style={[styles.crownBadge, { backgroundColor: isDark ? '#78350F' : '#FEF3C7', borderColor: isDark ? '#D97706' : '#F59E0B' }]}>
            <Text style={styles.crownText}>👑</Text>
          </View>
        ) : (
          <IconSymbol name="checkmark.circle.fill" size={20} color={isDark ? '#4ADE80' : '#16A34A'} />
        )}
      </View>
    );
  }
  return (
    <View style={styles.cellCenter}>
      <IconSymbol name="xmark.circle.fill" size={18} color={isDark ? '#4B5563' : '#D1D5DB'} />
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function PremiumCompareScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const { isPremium } = useSubscription();
  const { requirePremium, PremiumGateSheet } = usePremiumGate();

  // ── i18n ──────────────────────────────────────────────────────────────────
  const rawLang = useRawLang();
  // Static locale strings (en/es/fr/de/nl have full translations; others fall back to en)
  const pw = useMemo(
    () => (paywallExtStrings as unknown as Record<string, typeof paywallExtStrings.en>)[rawLang] ?? paywallExtStrings.en,
    [rawLang],
  );
  // AI-translated strings for group titles and row labels
  const t = useT(COMPARE_STRINGS_EN);

  const handleCTA = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    requirePremium(() => {
      router.back();
    }, { feature: 'Smart Reminders' });
  }, [requirePremium, router]);

  return (
    <ScreenContainer edges={['top', 'left', 'right']} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {pw.plansHeaderTitle ?? t.plansHeaderTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>✨</Text>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            {pw.heroTitle ?? t.heroTitle}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
            {pw.heroSubtitle ?? t.heroSubtitle}
          </Text>
        </View>

        {/* Column headers */}
        <View style={[styles.colHeader, { backgroundColor: isDark ? '#1e2022' : '#f5f5f5', borderColor: colors.border }]}>
          <View style={styles.colFeature} />
          <View style={styles.colCell}>
            <Text style={[styles.colHeaderText, { color: colors.muted }]}>
              {pw.freeColumnLabel ?? t.freeColumnLabel}
            </Text>
          </View>
          <View style={[styles.colCell, styles.premiumCol]}>
            <View style={[styles.bestValuePill, { backgroundColor: isDark ? '#14532D' : '#DCFCE7', borderColor: isDark ? '#16A34A' : '#86EFAC' }]}>
              <Text style={[styles.bestValueText, { color: isDark ? '#4ADE80' : '#15803D' }]}>
                {pw.bestValue ?? t.bestValueLabel}
              </Text>
            </View>
            <View style={[styles.premiumBadge, { backgroundColor: isDark ? '#1e3a5f' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]}>
              <Text style={[styles.premiumBadgeText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                {pw.premiumColumnLabel ?? t.premiumColumnLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Feature groups */}
        {FEATURE_GROUPS.map((group) => (
          <View key={group.titleKey} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.muted, backgroundColor: isDark ? '#151718' : '#FAFAFA' }]}>
              {(pw as Record<string, string>)[group.titleKey] ?? t[group.titleKey]}
            </Text>
            {group.rows.map((row, idx) => (
              <View
                key={`${group.titleKey}-${idx}`}
                style={[
                  styles.row,
                  {
                    backgroundColor: isDark ? '#1e2022' : '#FFFFFF',
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.colFeature}>
                  <IconSymbol name={row.icon as any} size={15} color={colors.muted} style={styles.rowIcon} />
                  <Text style={[styles.rowLabel, { color: colors.foreground }]} numberOfLines={2}>
                    {(pw as Record<string, string>)[row.labelKey] ?? t[row.labelKey]}
                  </Text>
                </View>
                <View style={styles.colCell}>
                  <CheckCell value={row.free} isDark={isDark} />
                </View>
                <View style={[styles.colCell, styles.premiumCol]}>
                  <CheckCell value={row.premium} isDark={isDark} highlight={row.highlight} />
                </View>
              </View>
            ))}
          </View>
        ))}

        {/* CTA */}
        {!isPremium && (
          <View style={styles.ctaSection}>
            <TouchableOpacity
              onPress={handleCTA}
              activeOpacity={0.85}
              style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.ctaBtnText}>
                {pw.startTrial ?? t.startTrialBtn}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.ctaNote, { color: colors.muted }]}>
              {pw.noPaymentDuringTrial
                ? `${pw.noPaymentDuringTrial} · ${pw.cancelAnytime ?? ''}`
                : t.noPaymentNote}
            </Text>
          </View>
        )}

        {isPremium && (
          <View style={styles.ctaSection}>
            <View style={[styles.premiumActiveBadge, { backgroundColor: isDark ? '#052E16' : '#F0FDF4', borderColor: isDark ? '#16A34A50' : '#BBF7D0' }]}>
              <Text style={{ fontSize: 16 }}>✅</Text>
              <Text style={[styles.premiumActiveText, { color: isDark ? '#4ADE80' : '#15803D' }]}>
                {pw.youHavePremiumAccess ?? t.youHavePremiumAccess}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {PremiumGateSheet}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 24,
    gap: 6,
  },
  heroEmoji: {
    fontSize: 36,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colFeature: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  colCell: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumCol: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#3B82F620',
  },
  colHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  premiumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  group: {
    marginTop: 8,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  cellCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  crownBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownText: {
    fontSize: 14,
    lineHeight: 18,
  },
  ctaSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 10,
  },
  ctaBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ctaNote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  bestValuePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bestValueText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  premiumActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  premiumActiveText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
