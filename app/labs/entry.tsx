/**
 * Lab Entry Screen
 *
 * Glassmorphism + clinical design language:
 * - Frosted glass panel cards with layered depth shadows
 * - Rotary panel selector (hardware-feel dial)
 * - OCR photo capture → Smart extracts values
 * - Manual entry fallback with inline reference ranges
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { labsStrings } from '@/lib/i18n';
import { useLabResultsBadge } from '@/hooks/use-lab-results-badge';
import { scheduleLabPanelReminder } from '@/lib/health/lab-reminders';
import { checkAnalyteThresholdsForResult } from '@/lib/notifications/analyte-threshold-checker';
import { useHealth } from '@/lib/health/health-context';

import { PANEL_ANALYTES, REFERENCE_RANGES, getAnalyteStatus, type LabPanelId, type LabAnalyteId, LabResult } from '@/lib/health/lab-types';
import { DatePickerIconButton } from '@/components/date-time-picker-field';

const { width: _SCREEN_W } = Dimensions.get('window');

// ─── Panel Selector ───────────────────────────────────────────────────────────

const PANELS: LabPanelId[] = ['CMP', 'CBC', 'MG', 'PHOS', 'LIPID', 'A1C'];

const PANEL_ICONS: Record<LabPanelId, string> = {
  CMP: 'CMP', CBC: 'CBC', MG: 'Mg', PHOS: 'P', LIPID: 'HDL', A1C: 'A1C',
};

const PANEL_COLORS: Record<LabPanelId, string> = {
  CMP:   '#2563EB',
  CBC:   '#7C3AED',
  MG:    '#22C55E',
  PHOS:  '#D97706',
  LIPID: '#DC2626',
  A1C:   '#DB2777',
};

// ─── Glassmorphism Card ───────────────────────────────────────────────────────

function GlassCard({
  children,
  style,
  accentColor,
}: {
  children: React.ReactNode;
  style?: object;
  accentColor?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.glassCard,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: accentColor ? `${accentColor}30` : colors.border,
          shadowColor: colors.shadowBase,
        },
        style,
      ]}
    >
      {accentColor && (
        <View style={[styles.glassAccentBar, { backgroundColor: accentColor }]} />
      )}
      {children}
    </View>
  );
}

// ─── Panel Dial ───────────────────────────────────────────────────────────────

function PanelDial({
  selected,
  onSelect,
}: {
  selected: LabPanelId;
  onSelect: (p: LabPanelId) => void;
}) {
  const colors = useColors();
  const _dlang = useLang();
  const _dls = labsStrings[_dlang as keyof typeof labsStrings] ?? labsStrings.en;
  const _selectedIdx = PANELS.indexOf(selected);

  return (
    <View style={styles.dialContainer}>
      <Text style={[styles.dialLabel, { color: colors.muted }]}>{_dls.selectPanel.toUpperCase()}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dialScroll}
      >
        {PANELS.map((panel, _idx) => {
          const isActive = panel === selected;
          const color = PANEL_COLORS[panel];
          return (
            <Pressable
              key={panel}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onSelect(panel);
              }}
              style={({ pressed }) => [
                styles.dialItem,
                {
                  backgroundColor: isActive ? color : colors.surface,
                  borderColor: isActive ? color : colors.border,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: isActive ? 1.05 : 1 }],
                  shadowColor: isActive ? color : 'transparent',
                  shadowOpacity: isActive ? 0.4 : 0,
                  shadowRadius: isActive ? 8 : 0,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: isActive ? 6 : 0,
                },
              ]}
            >
              <Text style={[styles.dialItemAbbr, { color: isActive ? '#fff' : colors.muted }]}>
                {PANEL_ICONS[panel]}
              </Text>
              <Text style={[styles.dialItemName, { color: isActive ? '#fff' : colors.foreground }]}>
                {panel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[styles.dialPanelFull, { color: colors.foreground }]}>
        {selected === 'CMP' ? _dls.panelCmp
          : selected === 'CBC' ? _dls.panelCbc
          : selected === 'MG' ? _dls.panelMg
          : selected === 'PHOS' ? _dls.panelPhos
          : selected === 'LIPID' ? _dls.panelLipid
          : _dls.panelA1c}
      </Text>
    </View>
  );
}

// ─── Analyte Row ──────────────────────────────────────────────────────────────

function AnalyteRow({
  analyteId,
  value,
  onChange,
}: {
  analyteId: LabAnalyteId;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const ref = REFERENCE_RANGES[analyteId];
  if (!ref) return null;

  const numVal = parseFloat(value);
  const status = !isNaN(numVal) ? getAnalyteStatus(analyteId, numVal) : null;

  const statusColor = status === 'high'
    ? colors.error
    : status === 'low'
      ? colors.accent
      : status === 'normal'
        ? colors.success
        : colors.muted;

  return (
    <View style={[styles.analyteRow, { borderBottomColor: colors.border }]}>
      <View style={styles.analyteLeft}>
        <Text style={[styles.analyteLabel, { color: colors.foreground }]}>{ref.label}</Text>
        <Text style={[styles.analyteRef, { color: colors.muted }]}>
          {ref.low}–{ref.high} {ref.unit}
        </Text>
      </View>
      <View style={styles.analyteRight}>
        <TextInput
          style={[
            styles.analyteInput,
            {
              color: status ? statusColor : colors.foreground,
              borderColor: status ? statusColor : colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          value={value}
          onChangeText={onChange}
          keyboardType="default"
          placeholder="—"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          selectTextOnFocus
        />
        {status && (
          <Text style={[styles.analyteStatus, { color: statusColor }]}>
            {status === 'high' ? '▲' : status === 'low' ? '▼' : '✓'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LabEntryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addLabResult } = useHealth();
  const _lang = useLang();
  const ls = labsStrings[_lang as keyof typeof labsStrings] ?? labsStrings.en;
  const { markNewLabResult } = useLabResultsBadge();

  const [selectedPanel, setSelectedPanel] = useState<LabPanelId>('CMP');
  const [values, setValues] = useState<Partial<Record<LabAnalyteId, string>>>({});
  const [labName, setLabName] = useState('');
  const [collectionDate, setCollectionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isSaving, setIsSaving] = useState(false);

  const analytes = PANEL_ANALYTES[selectedPanel];
  const accentColor = PANEL_COLORS[selectedPanel];

  const handlePanelChange = useCallback((panel: LabPanelId) => {
    setSelectedPanel(panel);
  }, []);

  const handleValueChange = useCallback((analyteId: LabAnalyteId, val: string) => {
    setValues(prev => ({ ...prev, [analyteId]: val }));
  }, []);

  // ── Comprehensive test-name → LabAnalyteId alias map ────────────────────
  // Covers common lab report variations: full names, abbreviations, mixed case
  const LAB_ALIAS_MAP: Record<string, LabAnalyteId> = {
    // Glucose
    'glucose': 'glucose', 'blood glucose': 'glucose', 'fasting glucose': 'glucose', 'glu': 'glucose', 'bgl': 'glucose',
    // BUN
    'bun': 'bun', 'blood urea nitrogen': 'bun', 'urea nitrogen': 'bun', 'urea': 'bun',
    // Creatinine
    'creatinine': 'creatinine', 'creat': 'creatinine', 'cr': 'creatinine', 'serum creatinine': 'creatinine',
    // eGFR
    'egfr': 'egfr', 'gfr': 'egfr', 'estimated gfr': 'egfr', 'glomerular filtration rate': 'egfr', 'gfr-aa': 'egfr', 'gfr_aa': 'egfr',
    // Sodium
    'sodium': 'sodium', 'na': 'sodium', 'na+': 'sodium', 'serum sodium': 'sodium',
    // Potassium
    'potassium': 'potassium', 'k': 'potassium', 'k+': 'potassium', 'serum potassium': 'potassium',
    // Chloride
    'chloride': 'chloride', 'cl': 'chloride', 'cl-': 'chloride', 'serum chloride': 'chloride',
    // CO2
    'co2': 'co2', 'carbon dioxide': 'co2', 'bicarbonate': 'co2', 'bicarb': 'co2', 'hco3': 'co2', 'co₂': 'co2', 'co2 (bicarb)': 'co2',
    // Calcium
    'calcium': 'calcium', 'ca': 'calcium', 'ca2+': 'calcium', 'serum calcium': 'calcium', 'total calcium': 'calcium',
    // Total Protein
    'total protein': 'totalProtein', 'protein': 'totalProtein', 'tp': 'totalProtein', 'serum protein': 'totalProtein',
    // Albumin
    'albumin': 'albumin', 'alb': 'albumin', 'serum albumin': 'albumin',
    // Total Bilirubin
    'total bilirubin': 'totalBilirubin', 'bilirubin': 'totalBilirubin', 't.bili': 'totalBilirubin', 'tbili': 'totalBilirubin', 'tbil': 'totalBilirubin',
    // ALT
    'alt': 'alt', 'alanine aminotransferase': 'alt', 'sgpt': 'alt', 'alanine transaminase': 'alt',
    // AST
    'ast': 'ast', 'aspartate aminotransferase': 'ast', 'sgot': 'ast', 'aspartate transaminase': 'ast',
    // WBC
    'wbc': 'wbc', 'white blood cell': 'wbc', 'white blood cells': 'wbc', 'leukocytes': 'wbc', 'white cell count': 'wbc', 'wbc count': 'wbc',
    // RBC
    'rbc': 'rbc', 'red blood cell': 'rbc', 'red blood cells': 'rbc', 'erythrocytes': 'rbc', 'red cell count': 'rbc',
    // Hemoglobin
    'hemoglobin': 'hemoglobin', 'haemoglobin': 'hemoglobin', 'hgb': 'hemoglobin', 'hb': 'hemoglobin', 'hbg': 'hemoglobin',
    // Hematocrit
    'hematocrit': 'hematocrit', 'haematocrit': 'hematocrit', 'hct': 'hematocrit', 'packed cell volume': 'hematocrit', 'pcv': 'hematocrit',
    // MCV
    'mcv': 'mcv', 'mean corpuscular volume': 'mcv', 'mean cell volume': 'mcv',
    // MCH
    'mch': 'mch', 'mean corpuscular hemoglobin': 'mch', 'mean cell hemoglobin': 'mch',
    // MCHC
    'mchc': 'mchc', 'mean corpuscular hemoglobin concentration': 'mchc', 'mean cell hemoglobin concentration': 'mchc',
    // RDW
    'rdw': 'rdw', 'red cell distribution width': 'rdw', 'red blood cell distribution width': 'rdw', 'rdw-cv': 'rdw', 'rdw_cv': 'rdw',
    // Platelets
    'platelets': 'platelets', 'platelet count': 'platelets', 'plt': 'platelets', 'thrombocytes': 'platelets', 'platelet': 'platelets',
    // Neutrophils
    'neutrophils': 'neutrophils', 'neutrophil': 'neutrophils', 'neutrophil %': 'neutrophils', 'neutrophil%': 'neutrophils',
    'neut': 'neutrophils', 'neut %': 'neutrophils', 'neutrophil count': 'neutrophils', 'neutrophils %': 'neutrophils',
    'seg neutrophils': 'neutrophils', 'segs': 'neutrophils', 'polymorphonuclear': 'neutrophils', 'pmn': 'neutrophils',
    // Magnesium
    'magnesium': 'magnesium', 'mg': 'magnesium', 'mg2+': 'magnesium', 'serum magnesium': 'magnesium',
    // Phosphorus
    'phosphorus': 'phosphorus', 'phosphate': 'phosphorus', 'phos': 'phosphorus', 'p': 'phosphorus', 'inorganic phosphorus': 'phosphorus',
    // Lipids
    'total cholesterol': 'totalCholesterol', 'cholesterol': 'totalCholesterol', 'tc': 'totalCholesterol',
    'ldl': 'ldl', 'ldl cholesterol': 'ldl', 'ldl-c': 'ldl', 'low density lipoprotein': 'ldl',
    'hdl': 'hdl', 'hdl cholesterol': 'hdl', 'hdl-c': 'hdl', 'high density lipoprotein': 'hdl',
    'triglycerides': 'triglycerides', 'triglyceride': 'triglycerides', 'tg': 'triglycerides', 'trigs': 'triglycerides',
    'non-hdl': 'nonHdl', 'non hdl': 'nonHdl', 'non-hdl cholesterol': 'nonHdl',
    // A1C
    'a1c': 'a1c', 'hba1c': 'a1c', 'hemoglobin a1c': 'a1c', 'haemoglobin a1c': 'a1c', 'glycated hemoglobin': 'a1c', 'glycohemoglobin': 'a1c',
    // Anion Gap (map to co2 as closest CMP field)
    'anion gap': 'co2',

    // ── Thyroid ──────────────────────────────────────────────────────────────
    'tsh': 'tsh', 'thyroid stimulating hormone': 'tsh', 'thyroid-stimulating hormone': 'tsh',
    'thyrotropin': 'tsh', 'tsh (3rd generation)': 'tsh', 'tsh ultrasensitive': 'tsh',
    'free t4': 'freeT4', 'free thyroxine': 'freeT4', 'ft4': 'freeT4', 'free t-4': 'freeT4',
    'thyroxine free': 'freeT4', 't4 free': 'freeT4',
    'free t3': 'freeT3', 'free triiodothyronine': 'freeT3', 'ft3': 'freeT3', 'free t-3': 'freeT3',
    'triiodothyronine free': 'freeT3', 't3 free': 'freeT3',
    'total t4': 'totalT4', 'thyroxine': 'totalT4', 't4': 'totalT4', 't4 total': 'totalT4',
    'total t3': 'totalT3', 'triiodothyronine': 'totalT3', 't3': 'totalT3', 't3 total': 'totalT3',

    // ── Iron Studies ─────────────────────────────────────────────────────────
    'iron': 'iron', 'serum iron': 'iron', 'fe': 'iron', 'iron serum': 'iron',
    'tibc': 'tibc', 'total iron binding capacity': 'tibc', 'iron binding capacity': 'tibc',
    'transferrin saturation': 'transferrinSaturation', 'tsat': 'transferrinSaturation',
    'iron saturation': 'transferrinSaturation', '% saturation': 'transferrinSaturation',
    'percent saturation': 'transferrinSaturation', 'sat%': 'transferrinSaturation',
    'ferritin': 'ferritin', 'serum ferritin': 'ferritin',

    // ── Vitamins & Minerals ──────────────────────────────────────────────────
    'vitamin d': 'vitaminD', 'vitamin d3': 'vitaminD', '25-oh vitamin d': 'vitaminD',
    '25-hydroxyvitamin d': 'vitaminD', '25(oh)d': 'vitaminD', 'vit d': 'vitaminD',
    '25 oh vitamin d': 'vitaminD', 'calcidiol': 'vitaminD', 'cholecalciferol': 'vitaminD',
    'vitamin b12': 'vitaminB12', 'b12': 'vitaminB12', 'cobalamin': 'vitaminB12',
    'cyanocobalamin': 'vitaminB12', 'vit b12': 'vitaminB12', 'b-12': 'vitaminB12',
    'folate': 'folate', 'folic acid': 'folate', 'vitamin b9': 'folate', 'b9': 'folate',
    'serum folate': 'folate', 'rbc folate': 'folate',

    // ── Specialty Markers ────────────────────────────────────────────────────
    'crp': 'crp', 'c-reactive protein': 'crp', 'c reactive protein': 'crp',
    'hs-crp': 'hsCrp', 'high sensitivity crp': 'hsCrp', 'high-sensitivity c-reactive protein': 'hsCrp',
    'hscrp': 'hsCrp', 'cardiac crp': 'hsCrp',
    'esr': 'esr', 'erythrocyte sedimentation rate': 'esr', 'sed rate': 'esr', 'westergren': 'esr',
    'uric acid': 'uricAcid', 'urate': 'uricAcid', 'serum uric acid': 'uricAcid',
    'psa': 'psa', 'prostate specific antigen': 'psa', 'total psa': 'psa',
    'ldh': 'ldh', 'lactate dehydrogenase': 'ldh', 'lactic dehydrogenase': 'ldh',
    'ck': 'ck', 'creatine kinase': 'ck', 'cpk': 'ck', 'creatine phosphokinase': 'ck',
    'inr': 'inr', 'international normalized ratio': 'inr',
    'pt': 'pt', 'prothrombin time': 'pt', 'pro time': 'pt',
    'ptt': 'ptt', 'partial thromboplastin time': 'ptt', 'aptt': 'ptt',
    'activated partial thromboplastin time': 'ptt',
  };

  // ── Apply Gemini labs directly to form (bypasses slug-matching) ───────────
  // ── Scan Another Page: launch camera without resetting accumulated labs ────────

  // ── Save ──────────────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const numericValues: Partial<Record<LabAnalyteId, number>> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = parseFloat(v as string);
      if (!isNaN(n)) numericValues[k as LabAnalyteId] = n;
    }

    if (Object.keys(numericValues).length === 0) {
      Alert.alert(ls.noValuesTitle, ls.noValuesMsg);
      return;
    }

    setIsSaving(true);
    try {
      const record: LabResult = {
        id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(collectionDate).toISOString(),
        panel: selectedPanel,
        values: numericValues,
        source: 'manual',
        labName: labName.trim() || undefined,
      };
      await addLabResult(record);
      markNewLabResult();
      // Schedule a reminder for when this panel is due again
      scheduleLabPanelReminder(selectedPanel, record.timestamp).catch(console.warn);
      // Check per-analyte custom thresholds and fire alerts if needed
      checkAnalyteThresholdsForResult(record).catch(console.warn);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (_unused) {
      Alert.alert(ls.saveFailedTitle, ls.saveFailedMsg);
    } finally {
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, selectedPanel, collectionDate, labName, addLabResult]);

  const filledCount = analytes.filter(a => {
    const v = values[a];
    return v !== undefined && v !== '' && !isNaN(parseFloat(v));
  }).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          <Text style={[styles.headerBackText, { color: colors.primary }]}>{ls.back}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{ls.addLabResult}</Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.headerSave,
            { backgroundColor: accentColor, opacity: pressed || isSaving ? 0.7 : 1 },
          ]}
        >
          {isSaving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.headerSaveText}>{ls.saveLabResult}</Text>
          }
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Panel Dial */}
        <GlassCard accentColor={accentColor} style={styles.dialCard}>
          <PanelDial selected={selectedPanel} onSelect={handlePanelChange} />
        </GlassCard>

        {/* Meta: Lab Name + Date */}
        <GlassCard>
          <View style={styles.metaRow}>
            <View style={styles.metaField}>
              <Text style={[styles.metaLabel, { color: colors.muted }]}>{ls.labFacility.toUpperCase()}</Text>
              <TextInput
                style={[styles.metaInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={labName}
                onChangeText={setLabName}
placeholder={ls.facilityPlaceholder}
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
            </View>
            <View style={[styles.metaField, { marginLeft: 12 }]}>
              <Text style={[styles.metaLabel, { color: colors.muted }]}>{ls.collectionDate.toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.metaInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }]}
                  value={collectionDate}
                  onChangeText={setCollectionDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  keyboardType="default"
                  returnKeyType="done"
                />
                <DatePickerIconButton
                  mode="date"
                  value={collectionDate ? new Date(collectionDate + 'T12:00:00') : null}
                  onChange={(d) => setCollectionDate(d.toISOString().split('T')[0])}
                  maximumDate={new Date()}
                />
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Analyte Values */}
        <GlassCard accentColor={accentColor}>
          <View style={styles.analytesHeader}>
            <Text style={[styles.analytesTitle, { color: colors.foreground }]}>
              {selectedPanel === 'CMP' ? ls.panelCmp
                : selectedPanel === 'CBC' ? ls.panelCbc
                : selectedPanel === 'MG' ? ls.panelMg
                : selectedPanel === 'PHOS' ? ls.panelPhos
                : selectedPanel === 'LIPID' ? ls.panelLipid
                : ls.panelA1c}
            </Text>
            <View style={[styles.analytesBadge, { backgroundColor: `${accentColor}20` }]}>
              <Text style={[styles.analytesBadgeText, { color: accentColor }]}>
                {ls.enteredBadge.replace('{filled}', String(filledCount)).replace('{total}', String(analytes.length))}
              </Text>
            </View>
          </View>
          <Text style={[styles.analytesHint, { color: colors.muted }]}>
            {ls.refRangeHighlightHint}
          </Text>
          {analytes.map(analyteId => (
            <AnalyteRow
              key={analyteId}
              analyteId={analyteId}
              value={values[analyteId] ?? ''}
              onChange={val => handleValueChange(analyteId, val)}
            />
          ))}
        </GlassCard>

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: accentColor, opacity: pressed || isSaving ? 0.7 : 1 },
          ]}
        >
          {isSaving
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <IconSymbol name="cross.case.fill" size={18} color="#fff" />
                <Text style={styles.saveButtonText}>{ls.saveLabResult}</Text>
              </>
          }
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  headerBackText: { fontSize: 16, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  headerSave: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  headerSaveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  // Glass card
  glassCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    padding: 16,
  },
  glassAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dialCard: { paddingTop: 20 },

  // Dial
  dialContainer: { gap: 8 },
  dialLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  dialScroll: { gap: 8, paddingVertical: 4 },
  dialItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 64,
    gap: 2,
  },
  dialItemAbbr: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dialItemName: { fontSize: 13, fontWeight: '600' },
  dialPanelFull: { fontSize: 13, fontWeight: '500', marginTop: 4, textAlign: 'center' },

  // OCR section
  ocrSection: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ocrTextBlock: { flex: 1, gap: 4 },
  ocrTitle: { fontSize: 15, fontWeight: '600' },
  ocrSubtitle: { fontSize: 12, lineHeight: 17 },
  ocrButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Meta fields
  metaRow: { flexDirection: 'row' },
  metaField: { flex: 1 },
  metaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  metaInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },

  // Analytes
  analytesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  analytesTitle: { fontSize: 15, fontWeight: '600' },
  analytesBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  analytesBadgeText: { fontSize: 11, fontWeight: '600' },
  analytesHint: { fontSize: 11, marginBottom: 12, lineHeight: 15 },
  analyteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  analyteLeft: { flex: 1, gap: 2 },
  analyteLabel: { fontSize: 14, fontWeight: '500' },
  analyteRef: { fontSize: 11 },
  analyteRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  analyteInput: {
    width: 80,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  analyteStatus: { fontSize: 14, fontWeight: '700', width: 16, textAlign: 'center' },

  // Save button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
