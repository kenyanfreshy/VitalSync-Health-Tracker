/**
 * ClinicalInputPrompt v2
 *
 * A four-mode clinical data entry system for the VitalSync nutrition log.
 * Designed to look and feel like a professional medical terminal.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Mode 1 — Bio-Data Entry (MANUS_v4.2 // BIO-METRIC_INPUT)              │
 * │    Verification Level selector (L1 Verified Clinical / L2 Volumetric)  │
 * │    Net Mass, Macronutrient Density (P/F/C grid), Glycemic Load Index    │
 * │    [ACTION: COMMIT_TO_ENCRYPTED_LOG]                                    │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Mode 2 — Dietary Logic Contextual (per active protocol)               │
 * │    DASH: Electrolyte Flux — Na+/K+ fields, 1500 mg threshold           │
 * │    Keto: Net Carbohydrate Impact — fiber-discarded display              │
 * │    Mediterranean/Vegan: Lipid Type, Protein Source, Omega-3:6 ratio    │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Mode 3 — Conflict & Correction (BIO-SYSTEM_DEVIATION sheet)           │
 * │    Score Decay %, Inflammatory Marker Prediction                        │
 * │    [ADJUST_BIO_MASS] | [PROCEED_WITH_PENALTY] | [CANCEL_ENTRY]         │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Mode 4 — Exercise-Calorie Integration (METABOLIC_FLUX_CALIBRATION)    │
 * │    MET activity level, caloric ceiling adjustment, fuel source          │
 * │    [SYNC_WITH_HEALTHKIT_ENTITLEMENTS]                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Design: Signal-Black (#060D06) oscilloscope canvas with Phosphor-Green
 * (#00FF41) accents. All numerical data uses monospaced Courier/SF Mono.
 * Waveform animation plays during "calculating" states.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SYSTEM_FONT_MONO as MONO } from '@/lib/_core/fonts';
import { appendActivityRecord, type ActivityLogRecord } from '@/lib/health/activity-log';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useColors } from '@/hooks';
import { DietType, DIET_TYPE_OPTIONS, detectDietConflict, type DietConflict } from '@/lib/health/diet-type';
import { OscilloscopeWaveform } from '@/components/oscilloscope-waveform';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Monospace font helper ────────────────────────────────────────────────────



// ─── Types ────────────────────────────────────────────────────────────────────

export type NutrientSource = 'verified_lab' | 'clinical_estimate';
export type VerificationLevel = 'L1_verified_clinical' | 'L2_volumetric_estimate';
export type LipidType = 'saturated' | 'mufa' | 'pufa';
export type ProteinSource = 'legume' | 'soy' | 'lean_poultry' | 'fish' | 'other';
export type GlycemicLoadIndex = 'low' | 'med' | 'high';
export type ActivityMET = 'sedentary' | 'light' | 'moderate' | 'vigorous' | 'cardiovascular';
export type FuelSource = 'lipid_dominant' | 'carb_dominant' | 'mixed';

export interface ClinicalInputValues {
  /** Verification level (L1 = lab/packaging, L2 = visual estimate) */
  verificationLevel: VerificationLevel;
  /** Backwards-compat: nutrientSource derived from verificationLevel */
  nutrientSource: NutrientSource;
  /** Food mass in grams */
  massG: string;
  /** Protein in grams */
  proteinG: string;
  /** Fat in grams */
  fatG: string;
  /** Carbohydrates in grams */
  carbsG: string;
  /** Glycemic Load Index (qualitative) */
  glycemicLoadIndex: GlycemicLoadIndex;
  /** Sodium in mg (DASH / Mediterranean) */
  sodiumMg: string;
  /** Potassium in mg (DASH) */
  potassiumMg: string;
  /** Net carbohydrates in grams (Keto) */
  netCarbsG: string;
  /** Dietary fiber in grams */
  fiberG: string;
  /** Saturated fat in grams (Mediterranean) */
  satFatG: string;
  /** Lipid type (Mediterranean / Vegan) */
  lipidType: LipidType | null;
  /** Protein source (Mediterranean / Vegan) */
  proteinSource: ProteinSource | null;
  /** Exercise MET level (Exercise-Calorie integration) */
  activityMET: ActivityMET | null;
  /** Fuel source preference (Exercise-Calorie integration) */
  fuelSource: FuelSource | null;
  /** Caloric adjustment from exercise (kcal) */
  exerciseCaloricBonus: number;
}

export interface ClinicalInputPromptProps {
  dietType: DietType;
  onConfirm: (values: ClinicalInputValues) => void;
  onCancel: () => void;
  prefill?: Partial<ClinicalInputValues>;
}

// ─── MET table ────────────────────────────────────────────────────────────────

const MET_OPTIONS: { value: ActivityMET; label: string; met: number; caloricBonus: number; fuelHint: FuelSource }[] = [
  { value: 'sedentary',     label: 'Sedentary',        met: 1.2, caloricBonus: 0,   fuelHint: 'carb_dominant' },
  { value: 'light',         label: 'Light Activity',   met: 3.0, caloricBonus: 150, fuelHint: 'mixed' },
  { value: 'moderate',      label: 'Moderate',         met: 5.0, caloricBonus: 280, fuelHint: 'mixed' },
  { value: 'vigorous',      label: 'Vigorous',         met: 7.0, caloricBonus: 380, fuelHint: 'carb_dominant' },
  { value: 'cardiovascular',label: 'Cardiovascular',   met: 8.2, caloricBonus: 450, fuelHint: 'lipid_dominant' },
];

const FUEL_LABELS: Record<FuelSource, string> = {
  lipid_dominant: 'Lipid-Dominant',
  carb_dominant:  'Carb-Dominant',
  mixed:          'Mixed Substrate',
};

/**
 * Protocol-specific default MET level.
 * Pre-selects the most clinically appropriate activity level
 * when the Exercise-Calorie panel is first opened.
 */
const PROTOCOL_DEFAULT_MET: Record<string, ActivityMET> = {
  dash:          'cardiovascular', // Cardiovascular exercise is the primary DASH recommendation
  keto:          'moderate',       // Moderate activity preserves ketosis
  diabetic:      'light',          // Light activity for glucose management
  mediterranean: 'light',          // Mediterranean lifestyle — moderate daily movement
  vegan:         'light',          // Light activity default for plant-based protocol
  balanced:      'sedentary',      // No specific exercise prescription
};

// ─── Glycemic Load options ────────────────────────────────────────────────────

const GL_OPTIONS: { value: GlycemicLoadIndex; label: string; color: string; hint: string }[] = [
  { value: 'low',  label: 'LOW',  color: '#10B981', hint: '< 10 GL units' },
  { value: 'med',  label: 'MED',  color: '#F59E0B', hint: '10–20 GL units' },
  { value: 'high', label: 'HIGH', color: '#EF4444', hint: '> 20 GL units' },
];

// ─── Lipid / Protein options ──────────────────────────────────────────────────

const LIPID_OPTIONS: { value: LipidType; label: string; color: string; hint: string }[] = [
  { value: 'saturated', label: 'Saturated', color: '#EF4444', hint: 'Butter, coconut oil, red meat' },
  { value: 'mufa',      label: 'MUFA',      color: '#10B981', hint: 'Olive oil, avocado, almonds' },
  { value: 'pufa',      label: 'PUFA',      color: '#3B82F6', hint: 'Fish, flaxseed, walnuts' },
];

const PROTEIN_OPTIONS: { value: ProteinSource; label: string; complete: boolean; hint: string }[] = [
  { value: 'legume',       label: 'Legume',       complete: false, hint: 'Beans, lentils, chickpeas' },
  { value: 'soy',          label: 'Soy',          complete: true,  hint: 'Tofu, tempeh, edamame' },
  { value: 'lean_poultry', label: 'Lean Poultry', complete: true,  hint: 'Chicken breast, turkey' },
  { value: 'fish',         label: 'Fish',         complete: true,  hint: 'Salmon, tuna, mackerel' },
  { value: 'other',        label: 'Other',        complete: false, hint: 'Grains, nuts, seeds' },
];

// ─── Omega-3:6 helper ─────────────────────────────────────────────────────────

function getOmegaRatio(lipid: LipidType | null, protein: ProteinSource | null) {
  if (lipid === 'pufa' && protein === 'fish')
    return { label: 'Excellent Ω-3:6', color: '#10B981', hint: 'High EPA/DHA — optimal anti-inflammatory profile' };
  if (lipid === 'pufa')
    return { label: 'Good Ω-3:6', color: '#22C55E', hint: 'PUFA-rich — monitor Ω-6 sources' };
  if (lipid === 'mufa')
    return { label: 'Neutral Ω-3:6', color: '#F59E0B', hint: 'MUFA dominant — add Ω-3 source' };
  if (lipid === 'saturated')
    return { label: 'Poor Ω-3:6', color: '#EF4444', hint: 'SFA dominant — high Ω-6 risk' };
  return { label: '—', color: '#9CA3AF', hint: 'Select lipid type to calculate' };
}

function getAminoAcidCompleteness(protein: ProteinSource | null) {
  const opt = PROTEIN_OPTIONS.find((p) => p.value === protein);
  if (!opt) return { label: '—', color: '#9CA3AF', hint: 'Select protein source' };
  return opt.complete
    ? { label: 'Complete Protein', color: '#10B981', hint: 'Contains all 9 essential amino acids' }
    : { label: 'Incomplete Protein', color: '#F59E0B', hint: 'Combine with complementary source' };
}

// ─── Shared terminal field ────────────────────────────────────────────────────

interface TerminalFieldProps {
  label: string;
  sublabel?: string;
  sublabelColor?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  unit?: string;
  colors: ReturnType<typeof useColors>;
}

function TerminalField({
  label, sublabel, sublabelColor, value, onChangeText, placeholder, unit = '', colors,
}: TerminalFieldProps) {
  return (
    <View style={tf.row}>
      <View style={tf.labelCol}>
        <Text style={[tf.label, { color: colors.muted, fontFamily: MONO }]}>{label}</Text>
        {sublabel && (
          <Text style={[tf.sublabel, { color: sublabelColor ?? colors.muted, fontFamily: MONO }]}>
            {sublabel}
          </Text>
        )}
      </View>
      <View style={[tf.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          style={[tf.input, { color: colors.foreground, fontFamily: MONO }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? '[ _ ]'}
          placeholderTextColor={colors.muted + '80'}
          keyboardType="default"
          returnKeyType="done"
        />
        {unit ? <Text style={[tf.unit, { color: colors.muted, fontFamily: MONO }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const tf = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelCol: { flex: 1.4, gap: 1 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  sublabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 4,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '700' },
  unit: { fontSize: 11 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Text style={[sh.text, { color: colors.muted, fontFamily: MONO }]}>{text}</Text>
  );
}
const sh = StyleSheet.create({
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 1.0, marginBottom: 2 },
});

// ─── Mode 1: Bio-Data Entry ───────────────────────────────────────────────────

interface BioDataEntryProps {
  values: ClinicalInputValues;
  onChange: (patch: Partial<ClinicalInputValues>) => void;
  colors: ReturnType<typeof useColors>;
  dietType: DietType;
}

function BioDataEntry({ values, onChange, colors, dietType }: BioDataEntryProps) {
  const dietOption = DIET_TYPE_OPTIONS.find((d) => d.value === dietType);

  return (
    <View style={bd.container}>
      {/* System header */}
      <View style={[bd.sysHeader, { borderColor: '#00FF4130', backgroundColor: '#00FF4108' }]}>
        <Text style={[bd.sysId, { color: '#00C832', fontFamily: MONO }]}>
          [SYSTEM_ID: MANUS_v4.2 // BIO-METRIC_INPUT]
        </Text>
        <Text style={[bd.sysLabel, { color: '#00C83280', fontFamily: MONO }]}>
          DATA_POINT_REQUIRED: {dietOption?.emoji} {dietOption?.label?.toUpperCase()} PROTOCOL
        </Text>
      </View>

      {/* Verification Level */}
      <View style={bd.section}>
        <SectionHeader text="SELECT_NUTRIENT_VERIFICATION_LEVEL:" colors={colors} />
        <View style={bd.levelRow}>
          {([
            { value: 'L1_verified_clinical' as VerificationLevel, label: '[LEVEL 1]', sub: 'Verified Clinical Data', hint: 'From Lab / Packaging' },
            { value: 'L2_volumetric_estimate' as VerificationLevel, label: '[LEVEL 2]', sub: 'Volumetric Estimate', hint: 'Manual Observation' },
          ]).map((opt) => {
            const active = values.verificationLevel === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  bd.levelChip,
                  {
                    backgroundColor: active ? '#00FF4110' : pressed ? colors.surface : colors.surface,
                    borderColor: active ? '#00FF41' : colors.border,
                    borderWidth: active ? 1.5 : 1,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange({
                    verificationLevel: opt.value,
                    nutrientSource: opt.value === 'L1_verified_clinical' ? 'verified_lab' : 'clinical_estimate',
                  });
                }}
              >
                <Text style={[bd.levelTag, { color: active ? '#00FF41' : colors.muted, fontFamily: MONO }]}>
                  {opt.label}
                </Text>
                <Text style={[bd.levelLabel, { color: active ? colors.foreground : colors.muted }]}>
                  {opt.sub}
                </Text>
                <Text style={[bd.levelHint, { color: colors.muted }]}>{opt.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Core metrics */}
      <View style={bd.section}>
        <SectionHeader text="CORE_METRICS:" colors={colors} />

        <TerminalField
          label="Net Mass (g)"
          sublabel="BIO-MASS"
          sublabelColor="#00C832"
          value={values.massG}
          onChangeText={(v) => onChange({ massG: v })}
          placeholder="[ _ ]"
          unit="g"
          colors={colors}
        />

        {/* Macronutrient Density grid P/F/C */}
        <View style={bd.macroHeader}>
          <Text style={[bd.macroLabel, { color: colors.muted, fontFamily: MONO }]}>
            Macronutrient Density (P/F/C):
          </Text>
        </View>
        <View style={bd.macroGrid}>
          {[
            { key: 'proteinG' as const, label: 'P', color: '#3B82F6', hint: 'Protein' },
            { key: 'fatG' as const,     label: 'F', color: '#F59E0B', hint: 'Fat' },
            { key: 'carbsG' as const,   label: 'C', color: '#EF4444', hint: 'Carbs' },
          ].map((m) => (
            <View key={m.key} style={[bd.macroCell, { borderColor: m.color + '40', backgroundColor: m.color + '08' }]}>
              <Text style={[bd.macroCellTag, { color: m.color, fontFamily: MONO }]}>{m.label}</Text>
              <TextInput
                style={[bd.macroCellInput, { color: colors.foreground, fontFamily: MONO }]}
                value={values[m.key]}
                onChangeText={(v) => onChange({ [m.key]: v })}
                placeholder="[ _ ]"
                placeholderTextColor={colors.muted + '60'}
                keyboardType="default"
                returnKeyType="done"
              />
              <Text style={[bd.macroCellUnit, { color: colors.muted }]}>g</Text>
              <Text style={[bd.macroCellHint, { color: m.color + 'AA' }]}>{m.hint}</Text>
            </View>
          ))}
        </View>

        {/* Glycemic Load Index */}
        <View style={bd.glSection}>
          <Text style={[bd.macroLabel, { color: colors.muted, fontFamily: MONO }]}>
            Glycemic Load Index:
          </Text>
          <View style={bd.glRow}>
            {GL_OPTIONS.map((opt) => {
              const active = values.glycemicLoadIndex === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    bd.glChip,
                    {
                      backgroundColor: active ? opt.color + '20' : pressed ? colors.surface : colors.surface,
                      borderColor: active ? opt.color : colors.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onChange({ glycemicLoadIndex: opt.value });
                  }}
                >
                  <Text style={[bd.glChipLabel, { color: active ? opt.color : colors.muted, fontFamily: MONO }]}>
                    {opt.label}
                  </Text>
                  <Text style={[bd.glChipHint, { color: colors.muted }]}>{opt.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Food Photo Upload: Protocol + Lipid Profile ── */}
      <View style={bd.section}>
        <SectionHeader text="MANUS_UPLOAD: NUTRIENT_DENSITY" colors={colors} />

        {/* Protocol selector */}
        <View style={bd.uploadCard}>
          <Text style={[bd.uploadLabel, { color: '#00C83280', fontFamily: MONO }]}>DATA_SOURCE: Manual Override</Text>
          <Text style={[bd.uploadLabel, { color: '#00C83280', fontFamily: MONO }]}>PROTOCOL: {dietOption?.label?.toUpperCase() ?? 'BALANCED'}</Text>
        </View>

        {/* Lipid Profile */}
        <View style={bd.lipidSection}>
          <Text style={[bd.macroLabel, { color: colors.muted, fontFamily: MONO }]}>Lipid Profile:</Text>
          <View style={bd.glRow}>
            {LIPID_OPTIONS.map((opt) => {
              const active = values.lipidType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    bd.glChip,
                    {
                      backgroundColor: active ? opt.color + '20' : pressed ? colors.surface : colors.surface,
                      borderColor: active ? opt.color : colors.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onChange({ lipidType: opt.value });
                  }}
                >
                  <Text style={[bd.glChipLabel, { color: active ? opt.color : colors.muted, fontFamily: MONO }]}>
                    {opt.label}
                  </Text>
                  <Text style={[bd.glChipHint, { color: colors.muted }]}>{opt.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Logarithmic Adherence Penalty stamp */}
        <View style={[bd.penaltyStamp, { borderColor: '#F59E0B40', backgroundColor: '#F59E0B08' }]}>
          <Text style={[bd.penaltyLabel, { color: '#F59E0B', fontFamily: MONO }]}>
            LOGIC_STAMP: Applying Logarithmic Adherence Penalty for deviations.
          </Text>
          <Text style={[bd.penaltyHint, { color: '#F59E0B80', fontFamily: MONO }]}>
            [COMMIT_DATA_TO_CLINICAL_HUB]
          </Text>
        </View>
      </View>
    </View>
  );
}

const bd = StyleSheet.create({
  container: { gap: 14 },
  sysHeader: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  sysId: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  sysLabel: { fontSize: 9, letterSpacing: 0.3 },
  section: { gap: 10 },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelChip: { flex: 1, borderRadius: 10, padding: 10, gap: 2 },
  levelTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  levelLabel: { fontSize: 12, fontWeight: '700' },
  levelHint: { fontSize: 10, lineHeight: 14 },
  macroHeader: { marginBottom: 2 },
  macroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  macroGrid: { flexDirection: 'row', gap: 8 },
  macroCell: {
    flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', gap: 2,
  },
  macroCellTag: { fontSize: 14, fontWeight: '900' },
  macroCellInput: { fontSize: 16, fontWeight: '800', textAlign: 'center', width: '100%' },
  macroCellUnit: { fontSize: 10 },
  macroCellHint: { fontSize: 8, letterSpacing: 0.2 },
  glSection: { gap: 6 },
  glRow: { flexDirection: 'row', gap: 8 },
  glChip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', gap: 2 },
  glChipLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  glChipHint: { fontSize: 9 },
  uploadCard: { borderRadius: 8, borderWidth: 1, borderColor: '#00C83220', backgroundColor: '#00C83208', paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  uploadLabel: { fontSize: 9, letterSpacing: 0.3 },
  lipidSection: { gap: 6 },
  penaltyStamp: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  penaltyLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, lineHeight: 14 },
  penaltyHint: { fontSize: 9, letterSpacing: 0.3 },
});

// ─── Mode 2: Dietary Logic Contextual ────────────────────────────────────────

interface DietaryLogicProps {
  values: ClinicalInputValues;
  onChange: (patch: Partial<ClinicalInputValues>) => void;
  colors: ReturnType<typeof useColors>;
  dietType: DietType;
}

function DietaryLogicPrompt({ values, onChange, colors, dietType }: DietaryLogicProps) {
  const dietOption = DIET_TYPE_OPTIONS.find((d) => d.value === dietType);

  // Net carbs = carbs - fiber (live calculation for Keto)
  const parsedCarbs = parseFloat(values.carbsG);
  const parsedFiber = parseFloat(values.fiberG);
  const netCarbs = !isNaN(parsedCarbs) && !isNaN(parsedFiber)
    ? Math.max(0, parsedCarbs - parsedFiber)
    : !isNaN(parsedCarbs) ? parsedCarbs : null;

  const ketoStatus = netCarbs === null ? '—' : netCarbs <= 10 ? 'OPTIMAL_KETOSIS' : netCarbs <= 20 ? 'MARGINAL' : 'KETOSIS_EXIT_RISK';
  const ketoStatusColor = netCarbs === null ? '#9CA3AF' : netCarbs <= 10 ? '#10B981' : netCarbs <= 20 ? '#F59E0B' : '#EF4444';

  const omega = getOmegaRatio(values.lipidType, values.proteinSource);
  const amino = getAminoAcidCompleteness(values.proteinSource);

  return (
    <View style={dl.container}>
      {/* Protocol header */}
      <View style={[dl.protocolHeader, { borderColor: colors.primary + '30', backgroundColor: colors.primary + '08' }]}>
        <Text style={[dl.protocolId, { color: colors.primary, fontFamily: MONO }]}>
          [PROTOCOL: {dietType.toUpperCase()}_v1.1]
        </Text>
        <Text style={[dl.protocolSub, { color: colors.muted, fontFamily: MONO }]}>
          {dietOption?.emoji} {dietOption?.description?.toUpperCase()}
        </Text>
      </View>

      {/* DASH — Electrolyte Flux */}
      {(dietType === 'dash') && (
        <View style={dl.section}>
          <SectionHeader text="MONITORING: ELECTROLYTE_FLUX" colors={colors} />
          <Text style={[dl.hint, { color: colors.muted, fontFamily: MONO }]}>
            Enter Na⁺ and K⁺ concentrations. Current Threshold: 1,500 mg limit.
          </Text>
          <TerminalField
            label="Sodium (Na⁺)"
            sublabel="CRITICAL FOR DASH"
            sublabelColor="#EF4444"
            value={values.sodiumMg}
            onChangeText={(v) => onChange({ sodiumMg: v })}
            placeholder="[ _ ]"
            unit="mg"
            colors={colors}
          />
          <TerminalField
            label="Potassium (K⁺)"
            sublabel="NA:K RATIO INPUT"
            sublabelColor="#10B981"
            value={values.potassiumMg}
            onChangeText={(v) => onChange({ potassiumMg: v })}
            placeholder="[ _ ]"
            unit="mg"
            colors={colors}
          />
          {/* Live Na:K ratio */}
          {parseFloat(values.sodiumMg) > 0 && parseFloat(values.potassiumMg) > 0 && (
            <View style={[dl.ratioCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[dl.ratioLabel, { color: colors.muted, fontFamily: MONO }]}>
                LIVE_NA:K_RATIO:
              </Text>
              <Text style={[dl.ratioValue, { color: colors.foreground, fontFamily: MONO }]}>
                {(parseFloat(values.sodiumMg) / parseFloat(values.potassiumMg)).toFixed(2)}
                <Text style={{ color: colors.muted, fontSize: 11 }}> (target: &lt; 1.0)</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Keto — Net Carbohydrate Impact */}
      {(dietType === 'keto') && (
        <View style={dl.section}>
          <SectionHeader text="CALCULATING: NET_CARBOHYDRATE_IMPACT" colors={colors} />
          <Text style={[dl.hint, { color: colors.muted, fontFamily: MONO }]}>
            Discarding Dietary Fiber from Total Carbohydrate Load.
          </Text>
          <TerminalField
            label="Total Carbs (g)"
            sublabel="GROSS CARBOHYDRATE"
            sublabelColor="#F59E0B"
            value={values.carbsG}
            onChangeText={(v) => onChange({ carbsG: v })}
            placeholder="[ _ ]"
            unit="g"
            colors={colors}
          />
          <TerminalField
            label="Dietary Fiber (g)"
            sublabel="SUBTRACT FROM LOAD"
            sublabelColor="#10B981"
            value={values.fiberG}
            onChangeText={(v) => onChange({ fiberG: v })}
            placeholder="[ _ ]"
            unit="g"
            colors={colors}
          />
          {/* Net carbs result */}
          <View style={[dl.ratioCard, { backgroundColor: '#F59E0B08', borderColor: '#F59E0B30' }]}>
            <Text style={[dl.ratioLabel, { color: colors.muted, fontFamily: MONO }]}>
              NET_CARB_INPUT:
            </Text>
            <Text style={[dl.ratioValue, { color: '#F59E0B', fontFamily: MONO }]}>
              {netCarbs !== null ? `${netCarbs.toFixed(1)} g` : '[ _ ]'}
            </Text>
            <Text style={[dl.ketoStatus, { color: ketoStatusColor, fontFamily: MONO }]}>
              Logarithmic Status: {ketoStatus}
            </Text>
          </View>
        </View>
      )}

      {/* Mediterranean / Vegan — Bio-Availability */}
      {(dietType === 'mediterranean' || dietType === 'vegan') && (
        <View style={dl.section}>
          <SectionHeader text="BIO_DATA_ENTRY: PHYTO_INDEX" colors={colors} />
          <Text style={[dl.hint, { color: colors.muted, fontFamily: MONO }]}>
            SOURCE_VERIFICATION: Calculating Ω-3:6 Ratio and Amino Acid Completeness.
          </Text>

          {/* Lipid Type */}
          <View style={dl.subSection}>
            <Text style={[dl.subLabel, { color: colors.muted, fontFamily: MONO }]}>Lipid Type:</Text>
            <View style={dl.chipRow}>
              {LIPID_OPTIONS.map((opt) => {
                const active = values.lipidType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [
                      dl.chip,
                      {
                        backgroundColor: active ? opt.color + '18' : pressed ? colors.surface : colors.surface,
                        borderColor: active ? opt.color : colors.border,
                        borderWidth: active ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onChange({ lipidType: opt.value });
                    }}
                  >
                    <Text style={[dl.chipLabel, { color: active ? opt.color : colors.muted }]}>{opt.label}</Text>
                    <Text style={[dl.chipHint, { color: colors.muted }]}>{opt.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Protein Source */}
          <View style={dl.subSection}>
            <Text style={[dl.subLabel, { color: colors.muted, fontFamily: MONO }]}>Protein Source:</Text>
            <View style={dl.chipRow}>
              {PROTEIN_OPTIONS.map((opt) => {
                const active = values.proteinSource === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [
                      dl.chip,
                      {
                        backgroundColor: active ? colors.primary + '18' : pressed ? colors.surface : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                        borderWidth: active ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onChange({ proteinSource: opt.value });
                    }}
                  >
                    <Text style={[dl.chipLabel, { color: active ? colors.primary : colors.muted }]}>{opt.label}</Text>
                    <Text style={[dl.chipHint, { color: colors.muted }]}>{opt.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Omega + Amino results */}
          <View style={[dl.ratioCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={dl.bioRow}>
              <Text style={[dl.bioKey, { color: colors.muted, fontFamily: MONO }]}>OMEGA_RATIO:</Text>
              <Text style={[dl.bioVal, { color: omega.color, fontFamily: MONO }]}>{omega.label}</Text>
            </View>
            <Text style={[dl.bioHint, { color: colors.muted }]}>{omega.hint}</Text>
            <View style={[dl.bioRow, { marginTop: 6 }]}>
              <Text style={[dl.bioKey, { color: colors.muted, fontFamily: MONO }]}>AMINO_COMPLETENESS:</Text>
              <Text style={[dl.bioVal, { color: amino.color, fontFamily: MONO }]}>{amino.label}</Text>
            </View>
            <Text style={[dl.bioHint, { color: colors.muted }]}>{amino.hint}</Text>
          </View>

          {/* Sat fat for Mediterranean */}
          {dietType === 'mediterranean' && (
            <TerminalField
              label="Saturated Fat (g)"
              sublabel="SFA THRESHOLD CHECK"
              sublabelColor="#EF4444"
              value={values.satFatG}
              onChangeText={(v) => onChange({ satFatG: v })}
              placeholder="[ _ ]"
              unit="g"
              colors={colors}
            />
          )}
        </View>
      )}

      {/* Diabetic — Glycemic Load */}
      {(dietType === 'diabetic') && (
        <View style={dl.section}>
          <SectionHeader text="MONITORING: GLYCEMIC_LOAD_INDEX" colors={colors} />
          <Text style={[dl.hint, { color: colors.muted, fontFamily: MONO }]}>
            Calculating post-meal glucose impact. Controlled carb protocol active.
          </Text>
          <TerminalField
            label="Net Carbs (g)"
            sublabel="CRITICAL FOR DIABETIC"
            sublabelColor="#F59E0B"
            value={values.netCarbsG}
            onChangeText={(v) => onChange({ netCarbsG: v })}
            placeholder="[ _ ]"
            unit="g"
            colors={colors}
          />
        </View>
      )}
    </View>
  );
}

const dl = StyleSheet.create({
  container: { gap: 14 },
  protocolHeader: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  protocolId: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  protocolSub: { fontSize: 9, letterSpacing: 0.3 },
  section: { gap: 10 },
  subSection: { gap: 6 },
  hint: { fontSize: 10, lineHeight: 15 },
  subLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, gap: 2 },
  chipLabel: { fontSize: 11, fontWeight: '700' },
  chipHint: { fontSize: 9 },
  ratioCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 3 },
  ratioLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  ratioValue: { fontSize: 18, fontWeight: '800' },
  ketoStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  bioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bioKey: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  bioVal: { fontSize: 12, fontWeight: '800' },
  bioHint: { fontSize: 9, lineHeight: 13 },
});

// ─── Mode 4: Exercise-Calorie Integration ────────────────────────────────────

interface ExerciseIntegrationProps {
  values: ClinicalInputValues;
  onChange: (patch: Partial<ClinicalInputValues>) => void;
  colors: ReturnType<typeof useColors>;
  isSyncing: boolean;
}

// ─── Activity Modality options ───────────────────────────────────────────────

type ActivityModality = 'anaerobic' | 'aerobic' | 'hiit';

const MODALITY_OPTIONS: { value: ActivityModality; label: string; color: string; hint: string; epocFactor: number }[] = [
  { value: 'anaerobic', label: 'Anaerobic',  color: '#EF4444', hint: 'Resistance / Strength',  epocFactor: 0.12 },
  { value: 'aerobic',   label: 'Aerobic',    color: '#3B82F6', hint: 'Cardio / Endurance',     epocFactor: 0.07 },
  { value: 'hiit',      label: 'HIIT',       color: '#F59E0B', hint: 'High-Intensity Interval', epocFactor: 0.18 },
];

/**
 * EPOC (Excess Post-exercise Oxygen Consumption) estimation.
 * Formula: EPOC ≈ epocFactor × RPE × durationMin
 * Returns kcal (rough approximation for display purposes).
 */
function calcEPOC(modality: ActivityModality, rpe: number, durationMin: number): number {
  const factor = MODALITY_OPTIONS.find((m) => m.value === modality)?.epocFactor ?? 0.07;
  return Math.round(factor * rpe * durationMin);
}

function ExerciseIntegrationPrompt({ values, onChange, colors, isSyncing }: ExerciseIntegrationProps) {
  const selectedMET = MET_OPTIONS.find((m) => m.value === values.activityMET);

  // Local state for the new Exercise-Calorie Logic fields
  const [modality, setModality] = React.useState<ActivityModality>('aerobic');
  const [durationMin, setDurationMin] = React.useState('30');
  const [rpe, setRpe] = React.useState(5);

  // Derived EPOC
  const epocKcal = calcEPOC(modality, rpe, Number(durationMin) || 0);
  const modalityOpt = MODALITY_OPTIONS.find((m) => m.value === modality)!;

  return (
    <View style={ex.container}>
      {/* Header */}
      <View style={[ex.header, { borderColor: '#3B82F630', backgroundColor: '#3B82F608' }]}>
        <Text style={[ex.headerId, { color: '#3B82F6', fontFamily: MONO }]}>
          [EXERCISE_SYNCHRONIZATION: MANUS_v4]
        </Text>
        <Text style={[ex.headerSub, { color: '#3B82F680', fontFamily: MONO }]}>
          SENSORS: Apple Watch Series [Detected] · VO2_MAX_CORRELATION: [Active]
        </Text>
      </View>

      {/* Oscilloscope during sync */}
      <OscilloscopeWaveform
        active={isSyncing}
        label={isSyncing ? 'SYNCING_HEALTHKIT_ENTITLEMENTS...' : 'EXERCISE_CORRELATION_READY'}
        showLogSpike={isSyncing}
        showReplay={!isSyncing}
      />

      {/* Activity Modality */}
      <View style={ex.section}>
        <SectionHeader text="ENTRY_REQUIRED: ACTIVITY_MODALITY" colors={colors} />
        <View style={ex.modalityRow}>
          {MODALITY_OPTIONS.map((opt) => {
            const active = modality === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  ex.modalityChip,
                  {
                    backgroundColor: active ? opt.color + '18' : pressed ? colors.surface : colors.surface,
                    borderColor: active ? opt.color : colors.border,
                    borderWidth: active ? 1.5 : 1,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setModality(opt.value);
                }}
              >
                <Text style={[ex.modalityLabel, { color: active ? opt.color : colors.foreground, fontFamily: MONO }]}>
                  {opt.label}
                </Text>
                <Text style={[ex.modalityHint, { color: colors.muted }]}>{opt.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Duration */}
      <View style={ex.section}>
        <SectionHeader text="DURATION:" colors={colors} />
        <View style={[ex.durationRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            style={[ex.durationInput, { color: colors.foreground, fontFamily: MONO }]}
            value={durationMin}
            onChangeText={setDurationMin}
            placeholder="[ _ ]"
            placeholderTextColor={colors.muted + '80'}
            keyboardType="default"
            returnKeyType="done"
          />
          <Text style={[ex.durationUnit, { color: colors.muted, fontFamily: MONO }]}>min</Text>
        </View>
      </View>

      {/* RPE slider row */}
      <View style={ex.section}>
        <SectionHeader text={`RPE (Rate of Perceived Exertion): ${rpe} / 10`} colors={colors} />
        <View style={ex.rpeRow}>
          {[1,2,3,4,5,6,7,8,9,10].map((v) => {
            const active = rpe === v;
            const rpeColor = v <= 3 ? '#10B981' : v <= 6 ? '#F59E0B' : '#EF4444';
            return (
              <Pressable
                key={v}
                style={[ex.rpeDot, {
                  backgroundColor: active ? rpeColor : rpeColor + '20',
                  borderColor: rpeColor + '60',
                  borderWidth: active ? 2 : 1,
                }]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRpe(v);
                }}
              >
                <Text style={[ex.rpeDotText, { color: active ? '#fff' : rpeColor, fontFamily: MONO }]}>{v}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* EPOC result */}
      <View style={[ex.epocCard, { backgroundColor: modalityOpt.color + '08', borderColor: modalityOpt.color + '30' }]}>
        <Text style={[ex.epocTitle, { color: modalityOpt.color, fontFamily: MONO }]}>
          ALGORITHM_RESULT: EPOC_CALCULATION
        </Text>
        <View style={ex.resultRow}>
          <Text style={[ex.resultKey, { color: colors.muted, fontFamily: MONO }]}>EPOC_ESTIMATE:</Text>
          <Text style={[ex.resultVal, { color: modalityOpt.color, fontFamily: MONO }]}>~{epocKcal} kcal post-exercise</Text>
        </View>
        <View style={ex.resultRow}>
          <Text style={[ex.resultKey, { color: colors.muted, fontFamily: MONO }]}>EPOC_FACTOR:</Text>
          <Text style={[ex.resultVal, { color: modalityOpt.color, fontFamily: MONO }]}>{(modalityOpt.epocFactor * 100).toFixed(0)}% of active load</Text>
        </View>
        <Text style={[ex.epocHint, { color: colors.muted, fontFamily: MONO }]}>
          Calculating EPOC and adjusting daily calorie ceiling.
        </Text>
      </View>

      {/* MET selector */}
      <View style={ex.section}>
        <SectionHeader text="DETECTED_ACTIVITY_LEVEL:" colors={colors} />
        <View style={ex.metGrid}>
          {MET_OPTIONS.map((opt) => {
            const active = values.activityMET === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  ex.metChip,
                  {
                    backgroundColor: active ? '#3B82F618' : pressed ? colors.surface : colors.surface,
                    borderColor: active ? '#3B82F6' : colors.border,
                    borderWidth: active ? 1.5 : 1,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange({
                    activityMET: opt.value,
                    exerciseCaloricBonus: opt.caloricBonus + epocKcal,
                    fuelSource: opt.fuelHint,
                  });
                }}
              >
                <Text style={[ex.metLabel, { color: active ? '#3B82F6' : colors.foreground }]}>
                  {opt.label}
                </Text>
                <Text style={[ex.metMET, { color: active ? '#3B82F6' : colors.muted, fontFamily: MONO }]}>
                  {opt.met} METs
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Result card */}
      {selectedMET && (
        <View style={[ex.resultCard, { backgroundColor: '#3B82F608', borderColor: '#3B82F630' }]}>
          <View style={ex.resultRow}>
            <Text style={[ex.resultKey, { color: colors.muted, fontFamily: MONO }]}>
              CALORIC_CEILING_ADJUSTMENT:
            </Text>
            <Text style={[ex.resultVal, { color: '#3B82F6', fontFamily: MONO }]}>
              +{selectedMET.caloricBonus + epocKcal} kcal (incl. EPOC)
            </Text>
          </View>
          <View style={ex.resultRow}>
            <Text style={[ex.resultKey, { color: colors.muted, fontFamily: MONO }]}>
              FUEL_SOURCE_PREFERENCE:
            </Text>
            <Text style={[ex.resultVal, { color: '#3B82F6', fontFamily: MONO }]}>
              [{FUEL_LABELS[selectedMET.fuelHint]}]
            </Text>
          </View>
          <View style={ex.resultRow}>
            <Text style={[ex.resultKey, { color: colors.muted, fontFamily: MONO }]}>
              DETECTED_ACTIVITY:
            </Text>
            <Text style={[ex.resultVal, { color: '#3B82F6', fontFamily: MONO }]}>
              {selectedMET.met} METs · RPE {rpe}/10 · {durationMin || '?'} min
            </Text>
          </View>
          <Pressable
            style={[ex.updateBtn, { backgroundColor: '#3B82F6' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const bonus = selectedMET.caloricBonus + epocKcal;
              onChange({
                activityMET: values.activityMET,
                exerciseCaloricBonus: bonus,
                fuelSource: selectedMET.fuelHint,
              });
              // Persist this exercise session to AsyncStorage
              const record: ActivityLogRecord = {
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                timestamp: new Date().toISOString(),
                activityModality: modality,
                durationMin: Number(durationMin) || 0,
                rpe,
                epocKcal,
                activityMET: selectedMET.met,
                exerciseCaloricBonus: bonus,
                fuelSource: selectedMET.fuelHint,
              };
              appendActivityRecord(record).catch(() => {});
            }}
          >
            <Text style={[ex.updateBtnText, { fontFamily: MONO }]}>[UPDATE_METABOLIC_INDEX]</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const ex = StyleSheet.create({
  container: { gap: 14 },
  header: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  headerId: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  headerSub: { fontSize: 9, letterSpacing: 0.3 },
  section: { gap: 8 },
  metGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 2, minWidth: '45%' },
  metLabel: { fontSize: 12, fontWeight: '700' },
  metMET: { fontSize: 10 },
  resultCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  resultKey: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  resultVal: { fontSize: 12, fontWeight: '800' },
  // Activity Modality
  modalityRow: { flexDirection: 'row', gap: 8 },
  modalityChip: { flex: 1, borderRadius: 10, padding: 10, gap: 2, alignItems: 'center' },
  modalityLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  modalityHint: { fontSize: 9, textAlign: 'center' },
  // Duration
  durationRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  durationInput: { flex: 1, fontSize: 22, fontWeight: '800' },
  durationUnit: { fontSize: 13 },
  // RPE
  rpeRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  rpeDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rpeDotText: { fontSize: 11, fontWeight: '800' },
  // EPOC
  epocCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 5 },
  epocTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginBottom: 2 },
  epocHint: { fontSize: 9, lineHeight: 14, marginTop: 2 },
  // Update button
  updateBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  updateBtnText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
});

// ─── Mode 3: Conflict & Correction Sheet ─────────────────────────────────────

interface ConflictSheetProps {
  conflict: DietConflict;
  dietType: DietType;
  onAdjust: () => void;
  onProceed: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}

function ConflictCorrectionSheet({
  conflict, dietType, onAdjust, onProceed, onCancel, colors,
}: ConflictSheetProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [calculating, setCalculating] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    // Show waveform for 2s then reveal results
    const t = setTimeout(() => setCalculating(false), 2000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dietOption = DIET_TYPE_OPTIONS.find((d) => d.value === dietType);

  // Inflammatory marker prediction based on trigger
  const inflammatoryRisk =
    conflict.triggerField === 'satFat' ? 'Elevated' :
    conflict.triggerField === 'sodium' ? 'Moderate' :
    conflict.triggerField === 'carbs' ? 'Moderate' : 'Low';
  const inflammatoryColor =
    inflammatoryRisk === 'Elevated' ? '#EF4444' :
    inflammatoryRisk === 'Moderate' ? '#F59E0B' : '#10B981';

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[cc.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          cc.sheet,
          { backgroundColor: colors.background, borderColor: '#EF444440', transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={[cc.handle, { backgroundColor: colors.border }]} />

        <ScrollView contentContainerStyle={cc.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Warning header */}
          <View style={[cc.warningHeader, { backgroundColor: '#EF444410', borderColor: '#EF444440' }]}>
            <Text style={cc.warningIcon}>⚠</Text>
            <View style={{ flex: 1 }}>
              <Text style={[cc.warningTitle, { color: '#EF4444', fontFamily: MONO }]}>
                [CAUTION: BIO-SYSTEM_DEVIATION]
              </Text>
              <Text style={[cc.warningProtocol, { color: colors.muted }]}>
                Active protocol: {dietOption?.emoji} {dietOption?.label}
              </Text>
            </View>
          </View>

          {/* Oscilloscope during calculation */}
          <OscilloscopeWaveform
            active={calculating}
            label={calculating ? 'ANALYZING_METABOLIC_IMPACT...' : 'ANALYSIS_COMPLETE'}
            showLogSpike={true}
            showReplay={!calculating}
          />

          {!calculating && (
            <>
              {/* Log analysis */}
              <View style={[cc.analysisCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[cc.analysisLabel, { color: colors.muted, fontFamily: MONO }]}>
                  LOG_ANALYSIS:
                </Text>
                <Text style={[cc.analysisText, { color: colors.foreground }]}>
                  The current input of [{conflict.message}] exceeds the Logarithmic Penalty Curve for the {dietOption?.label} Protocol.
                </Text>
              </View>

              {/* Predicted outcome */}
              <View style={[cc.impactCard, { backgroundColor: '#EF444408', borderColor: '#EF444430' }]}>
                <Text style={[cc.impactLabel, { color: '#EF4444', fontFamily: MONO }]}>
                  PREDICTED_OUTCOME:
                </Text>
                <View style={cc.impactRow}>
                  <View style={[cc.impactDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[cc.impactItem, { color: colors.foreground }]}>
                    Score Decay:{' '}
                    <Text style={{ color: '#EF4444', fontFamily: MONO }}>
                      −{conflict.scoreReductionPct.toFixed(1)}% to Daily Adherence Index
                    </Text>
                  </Text>
                </View>
                <View style={cc.impactRow}>
                  <View style={[cc.impactDot, { backgroundColor: inflammatoryColor }]} />
                  <Text style={[cc.impactItem, { color: colors.foreground }]}>
                    Inflammatory Marker Prediction:{' '}
                    <Text style={{ color: inflammatoryColor, fontFamily: MONO }}>{inflammatoryRisk}</Text>
                  </Text>
                </View>
                <View style={cc.impactRow}>
                  <View style={[cc.impactDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={[cc.impactItem, { color: colors.foreground }]}>
                    {conflict.impactDescription}
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={cc.actionRow}>
                <Pressable
                  style={({ pressed }) => [cc.actionBtn, cc.adjustBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                  onPress={onAdjust}
                >
                  <Text style={[cc.actionBtnText, { color: '#fff', fontFamily: MONO }]}>
                    [ADJUST_BIO_MASS]
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [cc.actionBtn, cc.overrideBtn, { borderColor: '#EF444460', opacity: pressed ? 0.8 : 1 }]}
                  onPress={onProceed}
                >
                  <Text style={[cc.actionBtnText, { color: '#EF4444', fontFamily: MONO }]}>
                    [PROCEED_WITH_PENALTY]
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [cc.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
                onPress={onCancel}
              >
                <Text style={[cc.cancelText, { color: colors.muted, fontFamily: MONO }]}>
                  [CANCEL_ENTRY]
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const cc = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  scrollContent: { padding: 20, gap: 14, paddingBottom: 40 },
  warningHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  warningIcon: { fontSize: 22 },
  warningTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  warningProtocol: { fontSize: 11, marginTop: 2 },
  analysisCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  analysisLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  analysisText: { fontSize: 13, lineHeight: 19 },
  impactCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  impactLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  impactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  impactDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  impactItem: { flex: 1, fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  adjustBtn: {},
  overrideBtn: { borderWidth: 1.5, backgroundColor: 'transparent' },
  actionBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});

// ─── Main ClinicalInputPrompt ─────────────────────────────────────────────────

export function ClinicalInputPrompt({
  dietType,
  onConfirm,
  onCancel,
  prefill,
}: ClinicalInputPromptProps) {
  const colors = useColors();

  const [values, setValues] = useState<ClinicalInputValues>({
    verificationLevel: prefill?.verificationLevel ?? 'L1_verified_clinical',
    nutrientSource: prefill?.nutrientSource ?? 'verified_lab',
    massG: prefill?.massG ?? '',
    proteinG: prefill?.proteinG ?? '',
    fatG: prefill?.fatG ?? '',
    carbsG: prefill?.carbsG ?? '',
    glycemicLoadIndex: prefill?.glycemicLoadIndex ?? 'low',
    sodiumMg: prefill?.sodiumMg ?? '',
    potassiumMg: prefill?.potassiumMg ?? '',
    netCarbsG: prefill?.netCarbsG ?? '',
    fiberG: prefill?.fiberG ?? '',
    satFatG: prefill?.satFatG ?? '',
    lipidType: prefill?.lipidType ?? null,
    proteinSource: prefill?.proteinSource ?? null,
    activityMET: prefill?.activityMET ?? null,
    fuelSource: prefill?.fuelSource ?? null,
    exerciseCaloricBonus: prefill?.exerciseCaloricBonus ?? 0,
  });

  const [conflict, setConflict] = useState<DietConflict | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [showExercise, setShowExercise] = useState(false);

  // ── MET persistence helpers ──────────────────────────────────────────────────
  const MET_STORAGE_KEY = `clinical_met_override_${dietType}`;

  /** Persist the user's manually chosen MET for this protocol */
  const persistMET = useCallback(async (met: ActivityMET) => {
    try {
      await safeSetItem(MET_STORAGE_KEY, met);
    } catch (_unused) { /* non-critical */ }
  }, [MET_STORAGE_KEY]);

  /** Load the persisted MET override for this protocol (returns null if none) */
  const loadPersistedMET = useCallback(async (): Promise<ActivityMET | null> => {
    try {
      const stored = await AsyncStorage.getItem(MET_STORAGE_KEY);
      if (stored && MET_OPTIONS.some((m) => m.value === stored)) {
        return stored as ActivityMET;
      }
    } catch (_unused) { /* non-critical */ }
    return null;
  }, [MET_STORAGE_KEY]);

  // Apply protocol-specific MET default (or persisted override) when the exercise panel is first opened
  const handleToggleExercise = useCallback(() => {
    setShowExercise((v) => {
      const opening = !v;
      if (opening && values.activityMET === null) {
        // Async: load persisted override first, fall back to protocol default
        loadPersistedMET().then((persistedMET) => {
          const chosenMET = persistedMET ?? PROTOCOL_DEFAULT_MET[dietType] ?? 'sedentary';
          const metOption = MET_OPTIONS.find((m) => m.value === chosenMET);
          if (metOption) {
            setValues((prev) => ({
              ...prev,
              activityMET: metOption.value,
              exerciseCaloricBonus: metOption.caloricBonus,
              fuelSource: metOption.fuelHint,
            }));
          }
        });
      }
      return opening;
    });
  }, [values.activityMET, dietType, loadPersistedMET]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const handleChange = useCallback((patch: Partial<ClinicalInputValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    // Persist MET override when user manually selects an activity level
    if (patch.activityMET) {
      persistMET(patch.activityMET);
    }
  }, [persistMET]);

  const handleCommit = useCallback(() => {
    // Show oscilloscope for 1.2s then run conflict detection
    setIsCommitting(true);
    setTimeout(() => {
      setIsCommitting(false);
      const netCarbs = parseFloat(values.netCarbsG) || (
        parseFloat(values.carbsG) - parseFloat(values.fiberG) || null
      );
      const sodium = parseFloat(values.sodiumMg);
      const satFat = parseFloat(values.satFatG);
      const detected = detectDietConflict(
        dietType,
        isNaN(netCarbs as number) ? null : (netCarbs as number),
        isNaN(sodium) ? null : sodium,
        null,
        isNaN(satFat) ? null : satFat,
      );
      if (detected.hasConflict) {
        setConflict(detected);
        setShowConflict(true);
        return;
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirm(values);
    }, 1200);
  }, [values, dietType, onConfirm]);

  const handleSyncExercise = useCallback(() => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2200);
  }, []);

  const handleProceedWithPenalty = useCallback(() => {
    setShowConflict(false);
    // Escalated haptic: Warning notification (distinct from standard Medium impact)
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onConfirm(values);
  }, [values, onConfirm]);

  const handleAdjust = useCallback(() => {
    setShowConflict(false);
  }, []);

  const handleConflictCancel = useCallback(() => {
    setShowConflict(false);
    onCancel();
  }, [onCancel]);

  // Validate: at minimum sodium or mass must be provided
  const canCommit =
    parseFloat(values.sodiumMg) > 0 ||
    parseFloat(values.massG) > 0 ||
    parseFloat(values.netCarbsG) > 0 ||
    parseFloat(values.carbsG) > 0;

  return (
    <View style={main.container}>
      {/* Mode 1: Bio-Data Entry */}
      <BioDataEntry values={values} onChange={handleChange} colors={colors} dietType={dietType} />

      {/* Mode 2: Dietary Logic Contextual */}
      <DietaryLogicPrompt values={values} onChange={handleChange} colors={colors} dietType={dietType} />

      {/* Mode 4: Exercise-Calorie Integration (collapsible) */}
      <Pressable
        style={({ pressed }) => [
          main.exerciseToggle,
          {
            backgroundColor: showExercise ? '#3B82F610' : colors.surface,
            borderColor: showExercise ? '#3B82F640' : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={handleToggleExercise}
      >
        <Text style={[main.exerciseToggleText, { color: showExercise ? '#3B82F6' : colors.muted, fontFamily: MONO }]}>
          {showExercise ? '▼' : '▶'} [METABOLIC_FLUX_CALIBRATION]
        </Text>
        <Text style={[main.exerciseToggleSub, { color: colors.muted }]}>
          Exercise-Calorie Integration
        </Text>
      </Pressable>

      {showExercise && (
        <>
          <ExerciseIntegrationPrompt
            values={values}
            onChange={handleChange}
            colors={colors}
            isSyncing={isSyncing}
          />
          <Pressable
            style={({ pressed }) => [
              main.syncBtn,
              { backgroundColor: '#3B82F6', opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleSyncExercise}
          >
            <Text style={[main.syncBtnText, { fontFamily: MONO }]}>
              [SYNC_WITH_HEALTHKIT_ENTITLEMENTS]
            </Text>
          </Pressable>
        </>
      )}

      {/* Oscilloscope during commit */}
      {isCommitting && (
        <OscilloscopeWaveform
          active={true}
          label="COMMITTING_TO_ENCRYPTED_LOG..."
          showLogSpike={false}
        />
      )}

      {/* Commit button */}
      <Pressable
        style={({ pressed }) => [
          main.commitBtn,
          {
            backgroundColor: canCommit ? colors.primary : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        onPress={handleCommit}
        disabled={!canCommit || isCommitting}
      >
        <Text style={[main.commitBtnText, { color: canCommit ? '#fff' : colors.muted, fontFamily: MONO }]}>
          {isCommitting ? '[PROCESSING...]' : '[ACTION: COMMIT_TO_ENCRYPTED_LOG]'}
        </Text>
      </Pressable>

      {/* Mode 3: Conflict & Correction Sheet */}
      {showConflict && conflict && (
        <ConflictCorrectionSheet
          conflict={conflict}
          dietType={dietType}
          onAdjust={handleAdjust}
          onProceed={handleProceedWithPenalty}
          onCancel={handleConflictCancel}
          colors={colors}
        />
      )}
    </View>
  );
}

// ─── Main styles ──────────────────────────────────────────────────────────────

const main = StyleSheet.create({
  container: { gap: 16 },
  exerciseToggle: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 2,
  },
  exerciseToggleText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  exerciseToggleSub: { fontSize: 10 },
  syncBtn: {
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  syncBtnText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  commitBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  commitBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
