/**
 * Glucose Threshold Settings Screen
 * Lets the user configure High / Low alert thresholds and TIR goal.
 * Navigated to from the GlucoseTrendChart "N readings ›" link.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { thresholdStrings } from '@/lib/i18n';
import { useColors, useLang } from '@/hooks';
import {
  View, Text, TextInput, Pressable, Switch, ScrollView, StyleSheet, Alert, Platform, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EvidenceRefBanner } from '@/components/ui/evidence-ref-banner';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import {
  loadGlucoseThresholds,
  saveGlucoseThresholds,
  DEFAULT_GLUCOSE_THRESHOLDS,
  type GlucoseThresholdConfig,
} from '@/lib/health/glucose-thresholds';

// Conversion helpers
const mgToMmol = (mg: number) => Math.round((mg / 18.0182) * 10) / 10;
const mmolToMg = (mmol: number) => Math.round(mmol * 18.0182);

export default function GlucoseThresholdsScreen() {
  const colors = useColors();
  const lang = useLang();
  const t = ((thresholdStrings as unknown as Record<string, typeof thresholdStrings.en>)[lang] ?? thresholdStrings.en);
  const router = useRouter();
  const { glucoseUnit } = useUnitPreferences();
  const isMmol = glucoseUnit === 'mmol/L';
  const [config, setConfig] = useState<GlucoseThresholdConfig>(DEFAULT_GLUCOSE_THRESHOLDS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGlucoseThresholds().then(setConfig).catch(() => {});
  }, []);

  const update = useCallback(<K extends keyof GlucoseThresholdConfig>(key: K, val: GlucoseThresholdConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = useCallback(async () => {
    // Validate
    if (config.highMgDl <= config.lowMgDl) {
      Alert.alert(t.invalidRange ?? 'Invalid Range', t.invalidRangeMsg ?? 'High threshold must be greater than Low threshold.');
      return;
    }
    if (config.tirGoalPct < 1 || config.tirGoalPct > 100) {
      Alert.alert(t.invalidTIR ?? 'Invalid TIR Goal', t.invalidTIRMsg ?? 'TIR goal must be between 1% and 100%.');
      return;
    }
    setSaving(true);
    try {
      await saveGlucoseThresholds(config);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (_unused) {
      Alert.alert(t.errorTitle ?? 'Error', t.errorSave ?? 'Failed to save thresholds. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [config, router]);

  const s = styles(colors);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}>
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={s.title}>{t.glucoseAlertsTitle ?? 'Glucose Alerts'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* ADA reference note */}
        <View style={[s.refCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header row with title + View Evidence link */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={[s.refTitle, { color: colors.foreground, flex: 1 }]}>ADA 2024 Standards of Care §6.3</Text>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL('https://diabetesjournals.org/care/article/47/Supplement_1/S85/153955/6-Glycemic-Goals-and-Hypoglycemia');
              }}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 8 }, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>View Evidence</Text>
              <Text style={{ fontSize: 10, color: '#10B981' }}>↗</Text>
            </Pressable>
          </View>
          <Text style={[s.refBody, { color: colors.muted }]}>
            Default targets for non-pregnant adults:{'\'n'}
            • High: {isMmol ? '10.0 mmol/L (180 mg/dL)' : '180 mg/dL (10.0 mmol/L)'}{'\'n'}
            • Low: {isMmol ? '3.9 mmol/L (70 mg/dL)' : '70 mg/dL (3.9 mmol/L)'}{'\'n'}
            • TIR goal: ≥70% of readings in {isMmol ? '3.9–10.0 mmol/L' : '70–180 mg/dL'}
          </Text>
          {/* Full ADA citation banner */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL('https://diabetesjournals.org/care/article/47/Supplement_1/S85/153955/6-Glycemic-Goals-and-Hypoglycemia');
            }}
            style={({ pressed }) => [{
              marginTop: 10, paddingVertical: 8, paddingHorizontal: 10,
              borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.08)',
              borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }, pressed && { opacity: 0.65 }]}
          >
            <Text style={{ fontSize: 13 }}>📄</Text>
            <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600', flex: 1, lineHeight: 14 }}>
              American Diabetes Association. Standards of Care in Diabetes — 2024.{'\'n'}Diabetes Care, 47(Suppl 1):S85–S100.
            </Text>
            <Text style={{ fontSize: 12, color: '#10B981' }}>↗</Text>
          </Pressable>
        </View>

        {/* Quick action: Log Blood Sugar */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/log/blood-sugar' as never);
          }}
          style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)',
            borderRadius: 14, padding: 14,
          }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: 'rgba(220,38,38,0.15)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 20 }}>🩸</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>Log Blood Sugar</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{t.recordNewReading ?? 'Record a new glucose reading'}</Text>
          </View>
          <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '600' }}>→</Text>
        </Pressable>

        {/* High threshold */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.sectionHeader}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t.highAlert ?? 'High Alert'}</Text>
            <Switch
              value={config.alertHigh}
              onValueChange={v => update('alertHigh', v)}
              trackColor={{ true: '#EF444488' }}
              thumbColor={config.alertHigh ? '#EF4444' : colors.muted}
            />
          </View>
          <Text style={[s.fieldLabel, { color: colors.muted }]}>{(t.thresholdLabel ?? 'THRESHOLD')} ({isMmol ? 'MMOL/L' : 'MG/DL'})</Text>
          <View style={[s.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              value={isMmol ? String(mgToMmol(config.highMgDl)) : String(config.highMgDl)}
              onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) { const min = isMmol ? 2.0 : 36; const max = isMmol ? 27.8 : 500; if (n >= min && n <= max) update('highMgDl', isMmol ? mmolToMg(n) : Math.round(n)); } }}
              keyboardType="default"
              returnKeyType="done"
              maxLength={5}
              editable={config.alertHigh}
              placeholderTextColor={colors.muted}
            />
            <Text style={[s.inputUnit, { color: colors.muted }]}>{isMmol ? 'mmol/L' : 'mg/dL'}</Text>
          </View>
          <Text style={[s.hint, { color: colors.muted }]}>
            {t.highAlertHint ?? `Alert when glucose exceeds this value. ADA default: ${isMmol ? '10.0 mmol/L' : '180 mg/dL'}.`}
          </Text>
        </View>

        {/* Low threshold */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.sectionHeader}>
            <View style={[s.dot, { backgroundColor: '#F59E0B' }]} />
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t.lowAlert ?? 'Low Alert'}</Text>
            <Switch
              value={config.alertLow}
              onValueChange={v => update('alertLow', v)}
              trackColor={{ true: '#F59E0B88' }}
              thumbColor={config.alertLow ? '#F59E0B' : colors.muted}
            />
          </View>
          <Text style={[s.fieldLabel, { color: colors.muted }]}>{(t.thresholdLabel ?? 'THRESHOLD')} ({isMmol ? 'MMOL/L' : 'MG/DL'})</Text>
          <View style={[s.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              value={isMmol ? String(mgToMmol(config.lowMgDl)) : String(config.lowMgDl)}
              onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) { const min = isMmol ? 1.0 : 18; const max = isMmol ? 22.2 : 400; if (n >= min && n <= max) update('lowMgDl', isMmol ? mmolToMg(n) : Math.round(n)); } }}
              keyboardType="default"
              returnKeyType="done"
              maxLength={5}
              editable={config.alertLow}
              placeholderTextColor={colors.muted}
            />
            <Text style={[s.inputUnit, { color: colors.muted }]}>{isMmol ? 'mmol/L' : 'mg/dL'}</Text>
          </View>
          <Text style={[s.hint, { color: colors.muted }]}>
            {t.lowAlertHint ?? `Alert when glucose falls below this value. ADA default: ${isMmol ? '3.9 mmol/L' : '70 mg/dL'}.`}
          </Text>
        </View>

        {/* TIR Goal */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.sectionHeader}>
            <View style={[s.dot, { backgroundColor: '#10B981' }]} />
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t.timeInRangeGoal ?? 'Time in Range Goal'}</Text>
          </View>
          <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.tirTargetLabel ?? 'TIR TARGET (%)'}</Text>
          <View style={[s.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              value={String(config.tirGoalPct)}
              onChangeText={t => { const n = parseInt(t, 10); if (!isNaN(n)) update('tirGoalPct', Math.min(100, Math.max(1, n))); }}
              keyboardType="default"
              returnKeyType="done"
              maxLength={3}
              placeholderTextColor={colors.muted}
            />
            <Text style={[s.inputUnit, { color: colors.muted }]}>%</Text>
          </View>
          <Text style={[s.hint, { color: colors.muted }]}>
            {t.tirHint ?? `Percentage of readings in range. ADA recommends ≥70% for most adults.`}
          </Text>
        </View>

        {/* Fasting Target */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.sectionHeader}>
            <View style={[s.dot, { backgroundColor: '#8B5CF6' }]} />
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t.fastingTarget ?? 'Fasting Target'}</Text>
            <Switch
              value={config.showFastingTarget}
              onValueChange={v => update('showFastingTarget', v)}
              trackColor={{ true: '#8B5CF688' }}
              thumbColor={config.showFastingTarget ? '#8B5CF6' : colors.muted}
            />
          </View>
          <Text style={[s.fieldLabel, { color: colors.muted }]}>TARGET ({isMmol ? 'MMOL/L' : 'MG/DL'})</Text>
          <View style={[s.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              value={isMmol ? String(mgToMmol(config.fastingTargetMgDl)) : String(config.fastingTargetMgDl)}
              onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) { const min = isMmol ? 2.0 : 36; const max = isMmol ? 16.7 : 300; if (n >= min && n <= max) update('fastingTargetMgDl', isMmol ? mmolToMg(n) : Math.round(n)); } }}
              keyboardType="default"
              returnKeyType="done"
              maxLength={5}
              editable={config.showFastingTarget}
              placeholderTextColor={colors.muted}
            />
            <Text style={[s.inputUnit, { color: colors.muted }]}>{isMmol ? 'mmol/L' : 'mg/dL'}</Text>
          </View>
          <Text style={[s.hint, { color: colors.muted }]}>
            {t.fastingHint ?? `Before-meal / fasting glucose goal. ADA 2024 §6.3 recommends <${isMmol ? '7.2 mmol/L' : '130 mg/dL'} for most non-pregnant adults.`}
          </Text>
          {/* ADA citation pill */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL('https://diabetesjournals.org/care/article/47/Supplement_1/S85/153945/');
            }}
            style={({ pressed }) => [s.citationPill, { backgroundColor: 'rgba(139,92,246,0.10)', borderColor: 'rgba(139,92,246,0.30)' }, pressed && { opacity: 0.65 }]}
          >
            <Text style={[s.citationBadge, { color: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.18)' }]}>ADA</Text>
            <Text style={[s.citationLabel, { color: '#8B5CF6' }]}>Standards of Care 2024 §6.3 — Fasting Targets</Text>
            <Text style={{ fontSize: 11, color: '#8B5CF6' }}>↗</Text>
          </Pressable>
        </View>

        {/* Post-Meal Target */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.sectionHeader}>
            <View style={[s.dot, { backgroundColor: '#F97316' }]} />
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t.postMealTarget ?? '2-Hour Post-Meal Target'}</Text>
            <Switch
              value={config.showPostMealTarget}
              onValueChange={v => update('showPostMealTarget', v)}
              trackColor={{ true: '#F9731688' }}
              thumbColor={config.showPostMealTarget ? '#F97316' : colors.muted}
            />
          </View>
          <Text style={[s.fieldLabel, { color: colors.muted }]}>TARGET ({isMmol ? 'MMOL/L' : 'MG/DL'})</Text>
          <View style={[s.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              value={isMmol ? String(mgToMmol(config.postMealTargetMgDl)) : String(config.postMealTargetMgDl)}
              onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) { const min = isMmol ? 2.0 : 36; const max = isMmol ? 22.2 : 400; if (n >= min && n <= max) update('postMealTargetMgDl', isMmol ? mmolToMg(n) : Math.round(n)); } }}
              keyboardType="default"
              returnKeyType="done"
              maxLength={5}
              editable={config.showPostMealTarget}
              placeholderTextColor={colors.muted}
            />
            <Text style={[s.inputUnit, { color: colors.muted }]}>{isMmol ? 'mmol/L' : 'mg/dL'}</Text>
          </View>
          <Text style={[s.hint, { color: colors.muted }]}>
            {t.postMealHint ?? `2 hours after the start of a meal. ADA 2024 §6.3 recommends <${isMmol ? '10.0 mmol/L' : '180 mg/dL'} for most non-pregnant adults.`}
          </Text>
          {/* ADA citation pill */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL('https://diabetesjournals.org/care/article/47/Supplement_1/S85/153945/');
            }}
            style={({ pressed }) => [s.citationPill, { backgroundColor: 'rgba(249,115,22,0.10)', borderColor: 'rgba(249,115,22,0.30)' }, pressed && { opacity: 0.65 }]}
          >
            <Text style={[s.citationBadge, { color: '#F97316', backgroundColor: 'rgba(249,115,22,0.18)' }]}>ADA</Text>
            <Text style={[s.citationLabel, { color: '#F97316' }]}>Standards of Care 2024 §6.3 — Postprandial Targets</Text>
            <Text style={{ fontSize: 11, color: '#F97316' }}>↗</Text>
          </Pressable>
        </View>

        {/* Reset to defaults */}
        <Pressable
          onPress={() => {
            setConfig(DEFAULT_GLUCOSE_THRESHOLDS);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={({ pressed }) => [s.resetBtn, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[s.resetBtnText, { color: colors.muted }]}>{t.resetToDefaults ?? 'Reset to ADA Defaults'}</Text>
        </Pressable>

        {/* Save */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
        >
          <Text style={s.saveBtnText}>{saving ? (t.savingLabel ?? 'Saving…') : (t.saveThresholds ?? 'Save Thresholds')}</Text>
        </Pressable>
        <EvidenceRefBanner
          accentColor="#DC2626"
          heading="ADA Blood Glucose References"
          refs={[
            { label: 'ADA Standards of Care 2024 §6.3', url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S85/153945/', badge: 'ADA' },
            { label: 'ADA Time-in-Range Targets', url: 'https://diabetesjournals.org/care/article/42/8/1593/36176/', badge: 'ADA' },
            { label: 'WHO Diabetes Diagnosis Criteria', url: 'https://www.who.int/publications/i/item/9789241547239', badge: 'WHO' },
            { label: 'CGM & TIR Consensus (PMID 31174959)', url: 'https://pubmed.ncbi.nlm.nih.gov/31174959/', badge: 'PMID' },
          ]}
          style={{ marginHorizontal: 0, marginBottom: 0 }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof import('@/hooks/use-colors').useColors>) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 44, alignItems: 'flex-start' },
    title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground },
    content: { padding: 16, gap: 16, paddingBottom: 40 },
    refCard: {
      borderRadius: 14, borderWidth: 1, padding: 14,
    },
    refTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
    refBody: { fontSize: 12, lineHeight: 18 },
    section: {
      borderRadius: 14, borderWidth: 1, padding: 14, gap: 8,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
    fieldLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    input: { flex: 1, fontSize: 22, fontWeight: '700' },
    inputUnit: { fontSize: 14, fontWeight: '500', marginLeft: 4 },
    hint: { fontSize: 11, lineHeight: 16 },
    resetBtn: {
      borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    },
    resetBtnText: { fontSize: 14, fontWeight: '600' },
    saveBtn: {
      backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    citationPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    citationBadge: {
      fontSize: 9, fontWeight: '800', letterSpacing: 0.3,
      paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6,
    },
    citationLabel: {
      fontSize: 11, fontWeight: '500', flex: 1,
    },
  });
