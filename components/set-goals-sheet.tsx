/**
 * SetGoalsSheet
 *
 * A bottom sheet that lets users set their daily calorie and macro targets.
 * Offers five preset diet profiles plus fully manual numeric inputs.
 * Saves to AsyncStorage via useMacroGoals.saveGoals().
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors } from '@/hooks';
import { loadUserProfile, type UserProfile } from '@/lib/user-profile';
import {
  useMacroGoals,
  MACRO_PRESETS,
  DEFAULT_MACRO_GOALS,
  ACTIVITY_LEVEL_OPTIONS,
  ACTIVITY_LEVEL_MULTIPLIERS,
  type MacroGoals,
  type ActivityLevel,
} from '@/hooks/use-macro-goals';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SetGoalsSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const { goals, saveGoals, resetGoals } = useMacroGoals();
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  useEffect(() => { loadUserProfile().then(setProfile); }, [visible]);

  // Local draft state (string inputs for TextInput)
  const [calories, setCalories] = useState(String(goals.calories));
  const [carbs, setCarbs] = useState(String(goals.carbs));
  const [fat, setFat] = useState(String(goals.fat));
  const [protein, setProtein] = useState(String(goals.protein));
  const [proteinMinGPerKg, setProteinMinGPerKg] = useState(String(goals.proteinMinGPerKg ?? 1.6));
  const [proteinMaxGPerKg, setProteinMaxGPerKg] = useState(String(goals.proteinMaxGPerKg ?? 2.2));
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(goals.activityLevel ?? 'sedentary');
  const [saved, setSaved] = useState(false);

  // Sync draft when goals change externally (e.g. first load)
  useEffect(() => {
    setCalories(String(goals.calories));
    setCarbs(String(goals.carbs));
    setFat(String(goals.fat));
    setProtein(String(goals.protein));
    setProteinMinGPerKg(String(goals.proteinMinGPerKg ?? 1.6));
    setProteinMaxGPerKg(String(goals.proteinMaxGPerKg ?? 2.2));
    setActivityLevel(goals.activityLevel ?? 'sedentary');
  }, [goals]);

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setSaved(false);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function applyPreset(presetId: string) {
    const preset = MACRO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setCalories(String(preset.goals.calories));
    setCarbs(String(preset.goals.carbs));
    setFat(String(preset.goals.fat));
    setProtein(String(preset.goals.protein));
    // Apply Gold Zone g/kg range if the preset defines one
    if (preset.goals.proteinMinGPerKg != null) {
      setProteinMinGPerKg(String(preset.goals.proteinMinGPerKg));
    }
    if (preset.goals.proteinMaxGPerKg != null) {
      setProteinMaxGPerKg(String(preset.goals.proteinMaxGPerKg));
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function clearPreset() {
    setActivePreset(null);
  }

  async function handleSave() {
    const next: MacroGoals = {
      calories: Math.max(500, Math.min(10000, parseInt(calories) || DEFAULT_MACRO_GOALS.calories)),
      carbs: Math.max(0, Math.min(1000, parseFloat(carbs) || DEFAULT_MACRO_GOALS.carbs)),
      fat: Math.max(0, Math.min(500, parseFloat(fat) || DEFAULT_MACRO_GOALS.fat)),
      protein: Math.max(0, Math.min(500, parseFloat(protein) || DEFAULT_MACRO_GOALS.protein)),
      activityLevel,
      proteinMinGPerKg: Math.max(0.5, Math.min(4.0, parseFloat(proteinMinGPerKg) || 1.6)),
      proteinMaxGPerKg: Math.max(0.5, Math.min(4.0, parseFloat(proteinMaxGPerKg) || 2.2)),
    };
    await saveGoals(next);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setSaved(true);
    setTimeout(() => {
      onClose();
      setSaved(false);
    }, 700);
  }

  async function handleReset() {
    await resetGoals();
    setActivePreset(null);
    setActivityLevel('sedentary');
    setCalories(String(DEFAULT_MACRO_GOALS.calories));
    setCarbs(String(DEFAULT_MACRO_GOALS.carbs));
    setFat(String(DEFAULT_MACRO_GOALS.fat));
    setProtein(String(DEFAULT_MACRO_GOALS.protein));
    setProteinMinGPerKg('1.6');
    setProteinMaxGPerKg('2.2');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  const cardBg = isDark ? colors.surface : '#FAFAFA';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6';
  const dividerColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  // Macro colours (consistent with MacroRingCard)
  const CAL_COLOR = '#F97316';
  const CARB_COLOR = '#3B82F6';
  const FAT_COLOR = '#A855F7';
  const PROT_COLOR = '#10B981';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(0,0,0,0.5)', opacity: backdropAnim },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrap}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: cardBg, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: dividerColor }]} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>Set My Goals</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Daily calorie &amp; macro targets
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: inputBg, opacity: pressed ? 0.6 : 1 },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Preset Profiles ── */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>DIET PROFILES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsRow}
            >
              {MACRO_PRESETS.map((preset) => {
                const isActive = activePreset === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: isActive ? colors.primary + '18' : inputBg,
                        borderColor: isActive ? colors.primary : dividerColor,
                      },
                    ]}
                    onPress={() => isActive ? clearPreset() : applyPreset(preset.id)}
                  >
                    <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                    <Text style={[styles.presetLabel, { color: isActive ? colors.primary : colors.foreground }]}>
                      {preset.label}
                    </Text>
                    <Text style={[styles.presetDesc, { color: colors.muted }]} numberOfLines={2}>
                      {preset.description}
                    </Text>
                    {isActive && (
                      <View style={[styles.presetActiveDot, { backgroundColor: colors.primary }]} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Activity Level ── */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>ACTIVITY LEVEL · sets TDEE multiplier</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsRow}
            >
              {ACTIVITY_LEVEL_OPTIONS.map((opt) => {
                const isActive = activityLevel === opt.value;
                const multiplier = ACTIVITY_LEVEL_MULTIPLIERS[opt.value];
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: isActive ? '#F97316' + '18' : inputBg,
                        borderColor: isActive ? '#F97316' : dividerColor,
                      },
                    ]}
                    onPress={() => {
                      setActivityLevel(opt.value);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.presetEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.presetLabel, { color: isActive ? '#F97316' : colors.foreground }]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.presetDesc, { color: colors.muted }]} numberOfLines={2}>
                      {opt.description}
                    </Text>
                    <Text style={[styles.presetDesc, { color: isActive ? '#F97316' : colors.muted, fontWeight: '700' }]}>
                      ×{multiplier}
                    </Text>
                    {isActive && (
                      <View style={[styles.presetActiveDot, { backgroundColor: '#F97316' }]} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Manual Inputs ── */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>CUSTOM TARGETS</Text>

            <View style={styles.inputGrid}>
              {/* Calories */}
              <View style={[styles.inputCell, { backgroundColor: inputBg, borderColor: CAL_COLOR + '40' }]}>
                <Text style={[styles.inputCellEmoji]}>🔥</Text>
                <Text style={[styles.inputCellLabel, { color: CAL_COLOR }]}>CALORIES</Text>
                <TextInput
                  style={[styles.inputCellField, { color: colors.foreground }]}
                  value={calories}
                  onChangeText={(v) => { setCalories(v); setActivePreset(null); }}
                  keyboardType="default"
                  returnKeyType="done"
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.inputCellUnit, { color: colors.muted }]}>kcal / day</Text>
              </View>

              {/* Carbs */}
              <View style={[styles.inputCell, { backgroundColor: inputBg, borderColor: CARB_COLOR + '40' }]}>
                <Text style={[styles.inputCellEmoji]}>🌾</Text>
                <Text style={[styles.inputCellLabel, { color: CARB_COLOR }]}>CARBS</Text>
                <TextInput
                  style={[styles.inputCellField, { color: colors.foreground }]}
                  value={carbs}
                  onChangeText={(v) => { setCarbs(v); setActivePreset(null); }}
                  keyboardType="default"
                  returnKeyType="done"
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.inputCellUnit, { color: colors.muted }]}>g / day</Text>
              </View>

              {/* Fat */}
              <View style={[styles.inputCell, { backgroundColor: inputBg, borderColor: FAT_COLOR + '40' }]}>
                <Text style={[styles.inputCellEmoji]}>🥑</Text>
                <Text style={[styles.inputCellLabel, { color: FAT_COLOR }]}>FAT</Text>
                <TextInput
                  style={[styles.inputCellField, { color: colors.foreground }]}
                  value={fat}
                  onChangeText={(v) => { setFat(v); setActivePreset(null); }}
                  keyboardType="default"
                  returnKeyType="done"
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.inputCellUnit, { color: colors.muted }]}>g / day</Text>
              </View>

              {/* Protein */}
              <View style={[styles.inputCell, { backgroundColor: inputBg, borderColor: PROT_COLOR + '40' }]}>
                <Text style={[styles.inputCellEmoji]}>🥩</Text>
                <Text style={[styles.inputCellLabel, { color: PROT_COLOR }]}>PROTEIN</Text>
                <TextInput
                  style={[styles.inputCellField, { color: colors.foreground }]}
                  value={protein}
                  onChangeText={(v) => { setProtein(v); setActivePreset(null); }}
                  keyboardType="default"
                  returnKeyType="done"
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.inputCellUnit, { color: colors.muted }]}>g / day</Text>
              </View>
            </View>

            {/* ── Protein calculator ── */}
            {(() => {
              const weightKg = profile?.weightKg;
              if (!weightKg) return (
                <Text style={[styles.disclaimer, { color: colors.muted, marginTop: 4, marginBottom: 0 }]}>
                  💡 Enter your weight in My Profile to auto-calculate a protein target.
                </Text>
              );
              const isStrength = activityLevel === 'active' || activityLevel === 'very_active';
              const factor = isStrength ? 1.6 : 0.8;
              const suggested = Math.round(weightKg * factor);
              return (
                <View style={[styles.calcRow, { backgroundColor: PROT_COLOR + '12', borderColor: PROT_COLOR + '30' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.calcTitle, { color: PROT_COLOR }]}>🧮 Protein Calculator</Text>
                    <Text style={[styles.calcBody, { color: colors.muted }]}>
                      {weightKg} kg × {factor} g/kg ({isStrength ? 'strength/active' : 'sedentary/light'}) = {suggested} g
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.calcBtn, { backgroundColor: PROT_COLOR, opacity: pressed ? 0.75 : 1 }]}
                    onPress={() => {
                      setProtein(String(suggested));
                      setActivePreset(null);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.calcBtnText}>Use {suggested}g</Text>
                  </Pressable>
                </View>
              );
            })()}

            {/* ── Gold Zone g/kg range ── */}
            <View style={[styles.calcRow, { backgroundColor: '#F59E0B12', borderColor: '#F59E0B30', marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.calcTitle, { color: '#F59E0B' }]}>🥇 Gold Zone Protein Range</Text>
                <Text style={[styles.calcBody, { color: colors.muted }]}>Evidence-based optimal protein intake (g per kg body weight)</Text>
              </View>
            </View>
            <View style={styles.inputRow}>
              <View style={[styles.inputCell, { backgroundColor: inputBg, borderColor: '#F59E0B40', flex: 1 }]}>
                <Text style={styles.inputCellEmoji}>⬇️</Text>
                <Text style={[styles.inputCellLabel, { color: '#F59E0B' }]}>MIN</Text>
                <TextInput
                  style={[styles.inputCellField, { color: colors.foreground }]}
                  value={proteinMinGPerKg}
                  onChangeText={(v) => setProteinMinGPerKg(v)}
                  keyboardType="default"
                  returnKeyType="done"
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.inputCellUnit, { color: colors.muted }]}>g/kg</Text>
              </View>
              <View style={[styles.inputCell, { backgroundColor: inputBg, borderColor: '#F59E0B40', flex: 1 }]}>
                <Text style={styles.inputCellEmoji}>⬆️</Text>
                <Text style={[styles.inputCellLabel, { color: '#F59E0B' }]}>MAX</Text>
                <TextInput
                  style={[styles.inputCellField, { color: colors.foreground }]}
                  value={proteinMaxGPerKg}
                  onChangeText={(v) => setProteinMaxGPerKg(v)}
                  keyboardType="default"
                  returnKeyType="done"
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.inputCellUnit, { color: colors.muted }]}>g/kg</Text>
              </View>
            </View>

            {/* Caloric breakdown preview */}
            {(() => {
              const cal = parseInt(calories) || 0;
              const carbCal = (parseFloat(carbs) || 0) * 4;
              const fatCal = (parseFloat(fat) || 0) * 9;
              const protCal = (parseFloat(protein) || 0) * 4;
              const total = carbCal + fatCal + protCal;
              if (total === 0) return null;
              return (
                <View style={[styles.previewCard, { backgroundColor: inputBg, borderColor: dividerColor }]}>
                  <Text style={[styles.previewTitle, { color: colors.muted }]}>MACRO SPLIT PREVIEW</Text>
                  <View style={[styles.previewBar, { backgroundColor: dividerColor }]}>
                    {carbCal > 0 && (
                      <View style={[styles.previewSegment, { flex: carbCal, backgroundColor: CARB_COLOR }]} />
                    )}
                    {fatCal > 0 && (
                      <View style={[styles.previewSegment, { flex: fatCal, backgroundColor: FAT_COLOR }]} />
                    )}
                    {protCal > 0 && (
                      <View style={[
                        styles.previewSegment,
                        { flex: protCal, backgroundColor: PROT_COLOR, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
                      ]} />
                    )}
                  </View>
                  <View style={styles.previewLegend}>
                    <Text style={[styles.previewLegendItem, { color: CARB_COLOR }]}>
                      🌾 {Math.round((carbCal / total) * 100)}%
                    </Text>
                    <Text style={[styles.previewLegendItem, { color: FAT_COLOR }]}>
                      🥑 {Math.round((fatCal / total) * 100)}%
                    </Text>
                    <Text style={[styles.previewLegendItem, { color: PROT_COLOR }]}>
                      🥩 {Math.round((protCal / total) * 100)}%
                    </Text>
                    {cal > 0 && total > 0 && (
                      <Text style={[styles.previewLegendItem, { color: colors.muted }]}>
                        {total > cal ? `⚠️ ${total - cal} kcal over target` : `✓ ${cal} kcal target`}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* ── Actions ── */}
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.resetBtn,
                  { borderColor: dividerColor, opacity: pressed ? 0.6 : 1 },
                ]}
                onPress={handleReset}
              >
                <Text style={[styles.resetBtnText, { color: colors.muted }]}>Reset to Defaults</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor: saved ? '#10B981' : colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>
                  {saved ? '✓ Saved!' : 'Save Goals'}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.disclaimer, { color: colors.muted }]}>
              Targets are used as reference values in the Today&apos;s Macros card on your Dashboard.
              Consult a dietitian for personalized medical nutrition therapy.
            </Text>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kvWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: -8,
  },
  presetsRow: {
    gap: 10,
    paddingBottom: 4,
  },
  presetChip: {
    width: 120,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    position: 'relative',
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
  presetActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  inputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  inputCell: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 4,
    alignItems: 'center',
  },
  inputCellEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  inputCellLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  inputCellField: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    minWidth: 80,
  },
  inputCellUnit: {
    fontSize: 10,
    fontWeight: '500',
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  previewBar: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  previewSegment: {
    height: 8,
  },
  previewLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewLegendItem: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingBottom: 4,
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: -4,
  },
  calcTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  calcBody: {
    fontSize: 11,
    lineHeight: 16,
  },
  calcBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
