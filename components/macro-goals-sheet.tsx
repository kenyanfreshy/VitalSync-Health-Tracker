/**
 * MacroGoalsSheet
 *
 * Bottom sheet for customizing daily macro targets.
 * Features:
 *  - Preset diet profiles (Balanced, High-Protein, Low-Carb, Diabetic, Weight Loss, Vegan Athlete, Endurance, Strength, Maintenance)
 *  - Manual entry in grams with live % of calories preview
 *  - Toggle between grams and % of calories input mode
 *  - Protein Gold Zone g/kg range (min / max) for the EvidenceBasedMacrosCard
 *  - Activity level selector (Sedentary → Athlete)
 *  - Reset to defaults
 *  - Persisted via useMacroGoals → AsyncStorage
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors, useLang } from '@/hooks';
import { complianceRingStrings } from '@/lib/i18n';
import {
  useMacroGoals,
  MACRO_PRESETS,
  ACTIVITY_LEVEL_OPTIONS,
  DEFAULT_MACRO_GOALS,
  type MacroGoals,
} from '@/hooks/use-macro-goals';

// ─── Accent palette ───────────────────────────────────────────────────────────
const EMERALD = '#10B981';
const VIOLET  = '#8B5CF6';
const AMBER   = '#F59E0B';
const ROSE    = '#F43F5E';

interface MacroGoalsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function MacroGoalsSheet({ visible, onClose }: MacroGoalsSheetProps) {
  const colors  = useColors();
  const scheme  = useColorScheme() ?? 'light';
  const lang    = useLang();
  const crs     = (complianceRingStrings as unknown as Record<string, typeof complianceRingStrings.en>)[lang] ?? complianceRingStrings.en;
  const isDark  = scheme === 'dark';

  const { goals, saveGoals, resetGoals } = useMacroGoals();

  // ── Local draft state ────────────────────────────────────────────────────
  const [calories,  setCalories]  = useState(String(goals.calories));
  const [protein,   setProtein]   = useState(String(goals.protein));
  const [fat,       setFat]       = useState(String(goals.fat));
  const [carbs,     setCarbs]     = useState(String(goals.carbs));
  const [proteinMin, setProteinMin] = useState(String(goals.proteinMinGPerKg ?? 1.6));
  const [proteinMax, setProteinMax] = useState(String(goals.proteinMaxGPerKg ?? 2.2));
  const [activityLevel, setActivityLevel] = useState(goals.activityLevel ?? 'sedentary');
  const [inputMode, setInputMode] = useState<'grams' | 'pct'>('grams');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Sync local state when goals change externally (e.g., on mount)
  useEffect(() => {
    setCalories(String(goals.calories));
    setProtein(String(goals.protein));
    setFat(String(goals.fat));
    setCarbs(String(goals.carbs));
    setProteinMin(String(goals.proteinMinGPerKg ?? 1.6));
    setProteinMax(String(goals.proteinMaxGPerKg ?? 2.2));
    setActivityLevel(goals.activityLevel ?? 'sedentary');
  }, [goals]);

  // ── Live % preview ───────────────────────────────────────────────────────
  const kcal = parseFloat(calories) || 2000;
  const proteinKcal = (parseFloat(protein) || 0) * 4;
  const fatKcal     = (parseFloat(fat) || 0) * 9;
  const carbsKcal   = (parseFloat(carbs) || 0) * 4;
  const totalMacroKcal = proteinKcal + fatKcal + carbsKcal;
  const proteinPct  = kcal > 0 ? Math.round((proteinKcal / kcal) * 100) : 0;
  const fatPct      = kcal > 0 ? Math.round((fatKcal / kcal) * 100) : 0;
  const carbsPct    = kcal > 0 ? Math.round((carbsKcal / kcal) * 100) : 0;
  const totalPct    = proteinPct + fatPct + carbsPct;

  // ── Apply preset ─────────────────────────────────────────────────────────
  const applyPreset = useCallback((id: string) => {
    const preset = MACRO_PRESETS.find(p => p.id === id);
    if (!preset) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPreset(id);
    setCalories(String(preset.goals.calories));
    setProtein(String(preset.goals.protein));
    setFat(String(preset.goals.fat));
    setCarbs(String(preset.goals.carbs));
    setProteinMin(String(preset.goals.proteinMinGPerKg ?? 1.6));
    setProteinMax(String(preset.goals.proteinMaxGPerKg ?? 2.2));
  }, []);

  // ── When user switches to % mode, convert current grams → pct ────────────
  const handleModeSwitch = useCallback((mode: 'grams' | 'pct') => {
    setInputMode(mode);
    if (mode === 'pct') {
      // Show current pct in the input fields
      setProtein(String(proteinPct));
      setFat(String(fatPct));
      setCarbs(String(carbsPct));
    } else {
      // Convert back to grams
      const k = parseFloat(calories) || 2000;
      setProtein(String(Math.round((parseFloat(protein) / 100) * k / 4)));
      setFat(String(Math.round((parseFloat(fat) / 100) * k / 9)));
      setCarbs(String(Math.round((parseFloat(carbs) / 100) * k / 4)));
    }
  }, [calories, protein, fat, carbs, proteinPct, fatPct, carbsPct]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    let proteinG = parseFloat(protein) || DEFAULT_MACRO_GOALS.protein;
    let fatG     = parseFloat(fat)     || DEFAULT_MACRO_GOALS.fat;
    let carbsG   = parseFloat(carbs)   || DEFAULT_MACRO_GOALS.carbs;
    const kcalVal = parseFloat(calories) || DEFAULT_MACRO_GOALS.calories;

    if (inputMode === 'pct') {
      proteinG = Math.round((proteinG / 100) * kcalVal / 4);
      fatG     = Math.round((fatG / 100) * kcalVal / 9);
      carbsG   = Math.round((carbsG / 100) * kcalVal / 4);
    }

    const next: MacroGoals = {
      calories: kcalVal,
      protein: proteinG,
      fat: fatG,
      carbs: carbsG,
      activityLevel,
      proteinMinGPerKg: parseFloat(proteinMin) || 1.6,
      proteinMaxGPerKg: parseFloat(proteinMax) || 2.2,
    };
    await saveGoals(next);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [protein, fat, carbs, calories, inputMode, activityLevel, proteinMin, proteinMax, saveGoals, onClose]);

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    await resetGoals();
    setSelectedPreset(null);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
  }, [resetGoals, onClose]);

  const cardBg = isDark ? '#1A1B22' : '#FFFFFF';
  const surfaceBg = isDark ? '#23242E' : '#F5F5F7';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.overlay}
      >
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: cardBg }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />

          {/* Header */}
          <View style={s.header}>
            <Text style={[s.title, { color: colors.foreground }]}>Macro Goals</Text>
            <Pressable
              style={({ pressed }) => [s.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={onClose}
            >
              <Text style={[s.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Preset profiles ──────────────────────────────────────── */}
            <Text style={[s.sectionLabel, { color: colors.muted }]}>DIET PRESETS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.presetRow}
            >
              {MACRO_PRESETS.map(p => {
                const isSelected = selectedPreset === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [
                      s.presetChip,
                      {
                        backgroundColor: isSelected ? VIOLET + '20' : surfaceBg,
                        borderColor: isSelected ? VIOLET : borderColor,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                    onPress={() => applyPreset(p.id)}
                  >
                    <Text style={s.presetEmoji}>{p.emoji}</Text>
                    <Text style={[s.presetLabel, { color: isSelected ? VIOLET : colors.foreground }]}>
                      {p.label}
                    </Text>
                    <Text style={[s.presetDesc, { color: colors.muted }]}>{p.description}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Input mode toggle ────────────────────────────────────── */}
            <View style={s.modeRow}>
              <Text style={[s.sectionLabel, { color: colors.muted }]}>DAILY TARGETS</Text>
              <View style={[s.modeToggle, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
                {(['grams', 'pct'] as const).map(m => (
                  <Pressable
                    key={m}
                    style={[
                      s.modeBtn,
                      inputMode === m && { backgroundColor: VIOLET, borderRadius: 8 },
                    ]}
                    onPress={() => handleModeSwitch(m)}
                  >
                    <Text style={[s.modeBtnText, { color: inputMode === m ? '#fff' : colors.muted }]}>
                      {m === 'grams' ? 'Grams' : '% Calories'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── Calorie target ───────────────────────────────────────── */}
            <View style={[s.inputCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
              <Text style={[s.inputLabel, { color: colors.muted }]}>Daily Calories</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: borderColor }]}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="default"
                  returnKeyType="done"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[s.inputUnit, { color: colors.muted }]}>kcal</Text>
              </View>
            </View>

            {/* ── Macro inputs ─────────────────────────────────────────── */}
            {[
              { label: crs.protein ?? 'Protein', value: protein, setter: setProtein, color: EMERALD, kcalFactor: 4, pct: proteinPct },
              { label: crs.fat ?? 'Fat',         value: fat,     setter: setFat,     color: VIOLET,  kcalFactor: 9, pct: fatPct },
              { label: crs.carbs ?? 'Carbs',     value: carbs,   setter: setCarbs,   color: AMBER,   kcalFactor: 4, pct: carbsPct },
            ].map(({ label, value, setter, color, pct }) => (
              <View key={label} style={[s.inputCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
                <View style={s.inputCardHeader}>
                  <View style={[s.colorDot, { backgroundColor: color }]} />
                  <Text style={[s.inputLabel, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[s.pctBadge, { color: color, backgroundColor: color + '18' }]}>
                    {pct}% of kcal
                  </Text>
                </View>
                <View style={s.inputRow}>
                  <TextInput
                    style={[s.input, { color: colors.foreground, borderColor: borderColor }]}
                    value={value}
                    onChangeText={setter}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholderTextColor={colors.muted}
                  />
                  <Text style={[s.inputUnit, { color: colors.muted }]}>
                    {inputMode === 'grams' ? 'g' : '%'}
                  </Text>
                </View>
              </View>
            ))}

            {/* ── Total % check ────────────────────────────────────────── */}
            {inputMode === 'grams' && totalMacroKcal > 0 && (
              <View style={[s.totalRow, { backgroundColor: Math.abs(totalPct - 100) <= 5 ? EMERALD + '12' : ROSE + '12', borderColor: Math.abs(totalPct - 100) <= 5 ? EMERALD + '30' : ROSE + '30' }]}>
                <Text style={[s.totalText, { color: Math.abs(totalPct - 100) <= 5 ? EMERALD : ROSE }]}>
                  {totalPct}% of calories accounted for
                  {Math.abs(totalPct - 100) <= 5 ? ' ✓' : ' — adjust to reach ~100%'}
                </Text>
              </View>
            )}

            {/* ── Protein Gold Zone ────────────────────────────────────── */}
            <Text style={[s.sectionLabel, { color: colors.muted, marginTop: 16 }]}>PROTEIN GOLD ZONE (g/kg body weight)</Text>
            <View style={[s.inputCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
              <Text style={[s.inputHint, { color: colors.muted }]}>
                Sets the Gold Zone overlay on the macro bar. Default: 1.6–2.2 g/kg (vegan athlete).
              </Text>
              <View style={s.rangeRow}>
                <View style={s.rangeField}>
                  <Text style={[s.rangeLabel, { color: colors.muted }]}>Min g/kg</Text>
                  <TextInput
                    style={[s.rangeInput, { color: colors.foreground, borderColor: borderColor, backgroundColor: isDark ? '#2A2B36' : '#EBEBED' }]}
                    value={proteinMin}
                    onChangeText={setProteinMin}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <Text style={[s.rangeSep, { color: colors.muted }]}>–</Text>
                <View style={s.rangeField}>
                  <Text style={[s.rangeLabel, { color: colors.muted }]}>Max g/kg</Text>
                  <TextInput
                    style={[s.rangeInput, { color: colors.foreground, borderColor: borderColor, backgroundColor: isDark ? '#2A2B36' : '#EBEBED' }]}
                    value={proteinMax}
                    onChangeText={setProteinMax}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
            </View>

            {/* ── Activity level ───────────────────────────────────────── */}
            <Text style={[s.sectionLabel, { color: colors.muted, marginTop: 16 }]}>ACTIVITY LEVEL</Text>
            {ACTIVITY_LEVEL_OPTIONS.map(opt => {
              const isSelected = activityLevel === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.activityRow,
                    {
                      backgroundColor: isSelected ? EMERALD + '12' : surfaceBg,
                      borderColor: isSelected ? EMERALD + '40' : borderColor,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  onPress={() => {
                    setActivityLevel(opt.value);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={s.activityEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.activityLabel, { color: isSelected ? EMERALD : colors.foreground }]}>
                      {opt.label}
                    </Text>
                    <Text style={[s.activityDesc, { color: colors.muted }]}>{opt.description}</Text>
                  </View>
                  {isSelected && (
                    <Text style={{ fontSize: 14, color: EMERALD }}>✓</Text>
                  )}
                </Pressable>
              );
            })}

            {/* ── Action buttons ───────────────────────────────────────── */}
            <View style={s.actionRow}>
              <Pressable
                style={({ pressed }) => [s.resetBtn, { borderColor: ROSE + '40', opacity: pressed ? 0.75 : 1 }]}
                onPress={handleReset}
              >
                <Text style={[s.resetBtnText, { color: ROSE }]}>Reset to Defaults</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.saveBtn, { backgroundColor: VIOLET, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleSave}
              >
                <Text style={s.saveBtnText}>Save Goals</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  presetRow: {
    gap: 10,
    paddingBottom: 4,
  },
  presetChip: {
    width: 120,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  presetEmoji: {
    fontSize: 22,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  inputCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  pctBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  inputUnit: {
    fontSize: 13,
    fontWeight: '600',
    width: 32,
  },
  inputHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rangeField: {
    flex: 1,
    gap: 4,
  },
  rangeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  rangeInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  rangeSep: {
    fontSize: 18,
    fontWeight: '300',
    marginTop: 18,
  },
  totalRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  totalText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 6,
  },
  activityEmoji: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  activityLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  resetBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
