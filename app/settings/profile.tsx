/**
 * Profile Settings Screen
 * Lets users update age, biological sex, weight, and height.
 * All values are persisted locally and used for:
 *   - Age/sex-adjusted HRV & BP reference ranges
 *   - Mifflin-St Jeor BMR calculation (weight + height)
 */

import { safeFormatDate } from '@/lib/utils';
import React, { useEffect, useState, useRef } from 'react';
import { useNumericField } from '@/hooks/use-numeric-field';
import { useDietType } from '@/hooks/use-diet-type';
import {
  DIET_TYPE_OPTIONS,
  loadCustomDietConfig,
  saveCustomDietConfig,
  DEFAULT_CUSTOM_DIET,
  type CustomDietConfig,
} from '@/lib/health/diet-type';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Platform,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveUnitPreferences } from '@/hooks/use-unit-preferences';
import { showHealthKitToast } from '@/components/healthkit-toast';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EvidenceRefBanner } from '@/components/ui/evidence-ref-banner';
import { useColorScheme, useColors, useLang } from '@/hooks';
import { DietProtocolTooltip } from '@/components/diet-protocol-tooltip';
import {
  loadUserProfile,
  saveUserProfile,
  type BiologicalSex,
  type UserProfile,
} from '@/lib/user-profile';
import { settingsExtStrings, profileStrings, dietLabelStrings, complianceRingStrings } from '@/lib/i18n';

// BMR cache key — invalidate when profile changes
const BMR_CACHE_KEY = '@vitalsync/bmr_cache_v1';

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
];

export default function ProfileSettingsScreen() {
  const lang = useLang();
  const se = settingsExtStrings[lang as keyof typeof settingsExtStrings] ?? settingsExtStrings.en;
  const p = profileStrings[lang as keyof typeof profileStrings] ?? profileStrings.en;
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { dietType, setDietType } = useDietType();
  const _dietAccent = '#0EA5E9';
  // ─── Diet history state (mirrors settings.tsx) ───────────────────────────
  const [dietHistory, setDietHistory] = useState<{ dietType: string; label: string; emoji: string; changedAt: string; note?: string }[]>([]);
  const [showDietHistory, setShowDietHistory] = useState(false);
  const subtitleOpacity = useRef(new Animated.Value(1)).current;

  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [weightKg, setWeightKg] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [heightCm, setHeightCm] = useState('');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>('cm');
  // Imperial display fields (derived from heightCm when switching to 'in')
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [tempC, setTempC] = useState('');
  const [tempF, setTempF] = useState('');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [goalKcal, setGoalKcal] = useState('');
  const [customKcalPreset, setCustomKcalPreset] = useState<number | null>(null);
  const [customKcalPresetLabel, setCustomKcalPresetLabel] = useState<string>('');
  const [showCustomPresetInput, setShowCustomPresetInput] = useState(false);
  const [customPresetInput, setCustomPresetInput] = useState('');
  const [customPresetLabelInput, setCustomPresetLabelInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ─── Custom / Personalized Diet state ────────────────────────────────────
  const [customDiet, setCustomDiet] = useState<CustomDietConfig>({ ...DEFAULT_CUSTOM_DIET });
  const [customDietLoaded, setCustomDietLoaded] = useState(false);

  // Storage key for unit preferences
  const UNITS_KEY = '@vitalsync/profile_units';

  // ─── Unit conversion helpers ─────────────────────────────────────────────
  function kgToLbs(kg: number): number { return Math.round(kg * 2.20462 * 10) / 10; }
  function lbsToKg(lbs: number): number { return Math.round(lbs / 2.20462 * 10) / 10; }
  function cToF(c: number): number { return Math.round((c * 9 / 5 + 32) * 10) / 10; }
  function fToC(f: number): number { return Math.round(((f - 32) * 5 / 9) * 10) / 10; }

  function handleTempUnitToggle(unit: 'C' | 'F') {
    if (unit === tempUnit) return;
    if (unit === 'F') {
      const c = parseFloat(tempC);
      if (!isNaN(c)) setTempF(String(cToF(c)));
      else setTempF('');
    } else {
      const f = parseFloat(tempF);
      if (!isNaN(f)) setTempC(String(fToC(f)));
      else setTempC('');
    }
    setTempUnit(unit);
    setSaved(false);
    saveUnitPreferences({ tempUnit: unit }).catch(() => {});
    showHealthKitToast(`Temperature set to °${unit}`);
  }

  function handleWeightUnitToggle(unit: 'kg' | 'lbs') {
    if (unit === weightUnit) return;
    if (unit === 'lbs') {
      const kg = parseFloat(weightKg);
      if (!isNaN(kg) && kg > 0) setWeightLbs(String(kgToLbs(kg)));
      else setWeightLbs('');
    } else {
      const lbs = parseFloat(weightLbs);
      if (!isNaN(lbs) && lbs > 0) setWeightKg(String(lbsToKg(lbs)));
    }
    setWeightUnit(unit);
    setSaved(false);
    saveUnitPreferences({ weightUnit: unit }).catch(() => {});
    showHealthKitToast(`Weight set to ${unit}`);
  }

  function cmToFtIn(cm: number): { ft: number; inches: number } {
    const totalInches = cm / 2.54;
    const ft = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { ft, inches };
  }
  function ftInToCm(ft: number, inches: number): number {
    return Math.round((ft * 12 + inches) * 2.54);
  }

  function handleUnitToggle(unit: 'cm' | 'in') {
    if (unit === heightUnit) return;
    if (unit === 'in') {
      // Convert current cm value to ft + in
      const cm = parseFloat(heightCm);
      if (!isNaN(cm) && cm > 0) {
        const { ft, inches } = cmToFtIn(cm);
        setHeightFt(String(ft));
        setHeightIn(String(inches));
      } else {
        setHeightFt('');
        setHeightIn('');
      }
    } else {
      // Convert current ft + in back to cm
      const ft = parseInt(heightFt, 10);
      const inches = parseInt(heightIn, 10);
      if (!isNaN(ft) && !isNaN(inches)) {
        setHeightCm(String(ftInToCm(ft, inches)));
      }
    }
    setHeightUnit(unit);
    setSaved(false);
    saveUnitPreferences({ heightUnit: unit }).catch(() => {});
    showHealthKitToast(unit === 'in' ? 'Height set to ft / in' : 'Height set to cm');
  }

  // ─── Load existing profile and unit preferences on mount ───────────────────
  useEffect(() => {
    // Load custom diet config
    loadCustomDietConfig().then((cfg) => {
      setCustomDiet(cfg);
      setCustomDietLoaded(true);
    });
    // Load diet history
    AsyncStorage.getItem('@vitalsync/diet_type_history').then((v) => {
      if (v) { try { setDietHistory(JSON.parse(v)); } catch (_unused) { /* ignore */ } }
    });

    Promise.all([
      loadUserProfile(),
      AsyncStorage.getItem(UNITS_KEY).catch(() => null),
    ]).then(([profile, unitsJson]) => {
      if (profile.firstName) setFirstName(profile.firstName);
      if (profile.age !== null && profile.age !== undefined) setAge(String(profile.age));
      if (profile.sex) setSex(profile.sex);
      if (profile.goalKcal != null) setGoalKcal(String(profile.goalKcal));
      if (profile.customKcalPreset != null) setCustomKcalPreset(profile.customKcalPreset);
      if (profile.customKcalPresetLabel) setCustomKcalPresetLabel(profile.customKcalPresetLabel);

      // Restore unit preferences first so conversions below are correct
      let savedHeightUnit: 'cm' | 'in' = 'cm';
      let savedWeightUnit: 'kg' | 'lbs' = 'kg';
      let savedTempUnit: 'C' | 'F' = 'C';
      if (unitsJson) {
        try {
          const u = JSON.parse(unitsJson);
          if (u.heightUnit === 'in') savedHeightUnit = 'in';
          if (u.weightUnit === 'lbs') savedWeightUnit = 'lbs';
          if (u.tempUnit === 'F') savedTempUnit = 'F';
        } catch (_unused) { /* ignore */ }
      }
      setHeightUnit(savedHeightUnit);
      setWeightUnit(savedWeightUnit);
      setTempUnit(savedTempUnit);

      // Set weight in the saved unit
      if (profile.weightKg) {
        const kg = profile.weightKg;
        setWeightKg(String(kg));
        if (savedWeightUnit === 'lbs') setWeightLbs(String(kgToLbs(kg)));
      }

      // Set height in the saved unit
      if (profile.heightCm) {
        const cm = profile.heightCm;
        setHeightCm(String(cm));
        if (savedHeightUnit === 'in') {
          const { ft, inches } = cmToFtIn(cm);
          setHeightFt(String(ft));
          setHeightIn(String(inches));
        }
      }
    });
  }, []);

  // ─── Save handler ───────────────────────────────────────────────────────────
  async function handleSave() {
    const parsedAge = parseInt(age, 10);
    const validAge = !isNaN(parsedAge) && parsedAge > 0 && parsedAge < 120 ? parsedAge : null;
    if (age.trim() !== '' && validAge === null) {
      Alert.alert(p.invalidAge, p.invalidAgeMsg);
      return;
    }

    // (weight validation now handled above with unit resolution)

    // Resolve weightKg from whichever unit is active
    let resolvedWeightKg = weightKg;
    if (weightUnit === 'lbs') {
      const lbs = parseFloat(weightLbs);
      if (!isNaN(lbs) && lbs > 0) resolvedWeightKg = String(lbsToKg(lbs));
      else if (weightLbs.trim() !== '') {
        Alert.alert(p.invalidWeight, p.invalidWeightLbs);
        return;
      } else resolvedWeightKg = '';
    }
    const parsedWeight = parseFloat(resolvedWeightKg);
    const validWeight = !isNaN(parsedWeight) && parsedWeight >= 10 && parsedWeight < 500 ? parsedWeight : null;
    if (resolvedWeightKg.trim() !== '' && validWeight === null) {
      Alert.alert(p.invalidWeight, weightUnit === 'kg'
        ? 'Please enter a valid weight in kg (10–499).'
        : 'Please enter a valid weight in lbs (22–1100).');
      return;
    }

    // Resolve heightCm from whichever unit is active
    let resolvedHeightCm = heightCm;
    if (heightUnit === 'in') {
      const ft = parseInt(heightFt, 10);
      const inVal = parseInt(heightIn, 10);
      if (!isNaN(ft) && !isNaN(inVal)) {
        resolvedHeightCm = String(ftInToCm(ft, inVal));
      } else if (heightFt.trim() !== '' || heightIn.trim() !== '') {
        Alert.alert(p.invalidHeight, p.invalidHeightFt);
        return;
      } else {
        resolvedHeightCm = '';
      }
    }
    const parsedHeight = parseFloat(resolvedHeightCm);
    const validHeight = !isNaN(parsedHeight) && parsedHeight > 50 && parsedHeight < 300 ? parsedHeight : null;
    if (resolvedHeightCm.trim() !== '' && validHeight === null) {
      Alert.alert(p.invalidHeight, heightUnit === 'cm'
        ? 'Please enter a valid height in cm (51–299).'
        : 'Please enter a valid height (e.g. 4 ft 0 in – 9 ft 10 in).');
      return;
    }

    setIsSaving(true);
    try {
      // If user was in imperial mode, sync the cm field for display consistency
      if (heightUnit === 'in' && validHeight !== null) {
        setHeightCm(String(validHeight));
      }
      if (weightUnit === 'lbs' && validWeight !== null) setWeightKg(String(validWeight));
      const parsedGoal = parseInt(goalKcal, 10);
      const validGoal = !isNaN(parsedGoal) && parsedGoal >= 500 && parsedGoal <= 10000 ? parsedGoal : null;
      if (goalKcal.trim() !== '' && validGoal === null) {
        Alert.alert(p.invalidCaloricGoal, p.invalidCaloricGoalMsg);
        setIsSaving(false);
        return;
      }
      await saveUserProfile({ firstName: firstName.trim() || null, age: validAge, sex, weightKg: validWeight, heightCm: validHeight, goalKcal: validGoal, customKcalPreset, customKcalPresetLabel: customKcalPresetLabel.trim() || null });
      // Save custom diet config if personalized protocol is active or has been edited
      if (customDietLoaded) {
        await saveCustomDietConfig(customDiet);
      }
      // Invalidate BMR cache so the card recalculates with the new values
      await AsyncStorage.removeItem(BMR_CACHE_KEY);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setSaved(true);
      setTimeout(() => { router.back(); }, 600);
    } catch (_unused) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(p.saveError, p.saveErrorMsg);
    } finally {
      setIsSaving(false);
    }
  }

  const accentColor = '#805AD5';

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <View style={[styles.header, {
        backgroundColor: isDark ? colors.surface : '#FBFBFB',
        borderBottomColor: isDark ? colors.borderStrong : colors.border,
      }]}>
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: isDark ? colors.surfaceRaised : '#F0F0F0', opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Icon ──────────────────────────────────────────────────────────── */}
        <View style={[styles.iconCircle, { backgroundColor: accentColor + '18' }]}>
          <IconSymbol name="person.fill" size={40} color={accentColor} />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.muted }]}>{se.personalInformation ?? 'PERSONAL INFORMATION'}</Text>
        <Text style={[styles.sectionNote, { color: colors.muted }]}>
          Stored only on your device. Used for clinically-adjusted HRV & BP ranges and BMR calorie calculations.
        </Text>

        {/* ─── First Name Input ──────────────────────────────────────────────── */}
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceRaised : '#F7F7F7',
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.35 : 0.05,
          marginBottom: 10,
        }]}>
          <View style={styles.fieldRow}>
            <View style={[styles.fieldIcon, { backgroundColor: accentColor + '15' }]}>
              <IconSymbol name="person.fill" size={16} color={accentColor} />
            </View>
            <View style={styles.fieldContent}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{se.firstName ?? 'First Name'}</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground }]}
                value={firstName}
                onChangeText={(v) => { setFirstName(v); setSaved(false); }}
                returnKeyType="done"
                placeholder="e.g. Alex"
                placeholderTextColor={colors.muted + '80'}
                maxLength={40}
                autoCapitalize="words"
              />
            </View>
          </View>
        </View>

        {/* ─── Age Input ─────────────────────────────────────────────────────── */}
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceRaised : '#F7F7F7',
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.35 : 0.05,
        }]}>
          <View style={styles.fieldRow}>
            <View style={[styles.fieldIcon, { backgroundColor: accentColor + '15' }]}>
              <IconSymbol name="calendar" size={16} color={accentColor} />
            </View>
            <View style={styles.fieldContent}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{se.ageYears ?? 'Age (years)'}</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground }]}
                value={age}
                onChangeText={(v) => { setAge(v); setSaved(false); }}
                onBlur={() => {
                  const n = parseInt(age, 10);
                  if (age.trim() !== '' && (isNaN(n) || n < 1 || n > 119)) {
                    setAge('');
                  }
                }}
                keyboardType="default"
                returnKeyType="done"
                placeholder="e.g. 35"
                placeholderTextColor={colors.muted + '80'}
                maxLength={3}
              />
            </View>
          </View>
        </View>

        {/* ─── Weight & Height ───────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>
          BODY MEASUREMENTS · used for BMR calorie burn
        </Text>
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceRaised : '#F7F7F7',
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.35 : 0.05,
        }]}>
          {/* Weight */}
          <View style={[styles.fieldRow, { flexDirection: 'column', alignItems: 'stretch', paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: isDark ? colors.borderStrong : colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={[styles.fieldIcon, { backgroundColor: '#F97316' + '15' }]}>
                <Text style={{ fontSize: 16 }}>⚖️</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.muted, flex: 1, marginLeft: 10 }]}>{se.weight ?? 'Weight'}</Text>
              {/* kg / lbs toggle */}
              <View style={[styles.unitToggle, { backgroundColor: isDark ? colors.surface : '#EBEBEB', borderColor: isDark ? colors.borderStrong : colors.border }]}>
                {(['kg', 'lbs'] as const).map((u) => (
                  <Pressable
                    key={u}
                    style={[styles.unitBtn, weightUnit === u && { backgroundColor: '#F97316', borderRadius: 6 }]}
                    onPress={() => handleWeightUnitToggle(u)}
                  >
                    <Text style={[styles.unitBtnText, { color: weightUnit === u ? '#fff' : colors.muted }]}>{u}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <TextInput
              style={[styles.fieldInput, styles.heightInput, { color: colors.foreground, borderColor: isDark ? colors.borderStrong : colors.border }]}
              value={weightUnit === 'kg' ? weightKg : weightLbs}
              onChangeText={(v) => {
                if (weightUnit === 'kg') setWeightKg(v);
                else setWeightLbs(v);
                setSaved(false);
              }}
              onBlur={() => {
                const raw = weightUnit === 'kg' ? weightKg : weightLbs;
                const n = parseFloat(raw);
                if (raw.trim() !== '' && (isNaN(n) || n <= 0)) {
                  if (weightUnit === 'kg') setWeightKg('');
                  else setWeightLbs('');
                }
              }}
              keyboardType="default"
              returnKeyType="done"
              placeholder={weightUnit === 'kg' ? 'e.g. 70' : 'e.g. 154'}
              placeholderTextColor={colors.muted + '80'}
              maxLength={7}
            />
            {/* Conversion hint */}
            {weightUnit === 'kg' && weightKg.trim() !== '' && !isNaN(parseFloat(weightKg)) && (
              <Text style={[styles.hintText, { color: colors.muted }]}>
                ≈ {kgToLbs(parseFloat(weightKg))} lbs
              </Text>
            )}
            {weightUnit === 'lbs' && weightLbs.trim() !== '' && !isNaN(parseFloat(weightLbs)) && (
              <Text style={[styles.hintText, { color: colors.muted }]}>
                ≈ {lbsToKg(parseFloat(weightLbs))} kg
              </Text>
            )}
          </View>
          {/* Height */}
          <View style={[styles.fieldRow, { flexDirection: 'column', alignItems: 'stretch', paddingBottom: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={[styles.fieldIcon, { backgroundColor: '#3B82F6' + '15' }]}>
                <Text style={{ fontSize: 16 }}>📏</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.muted, flex: 1, marginLeft: 10 }]}>{se.height ?? 'Height'}</Text>
              {/* cm / in toggle */}
              <View style={[styles.unitToggle, { backgroundColor: isDark ? colors.surface : '#EBEBEB', borderColor: isDark ? colors.borderStrong : colors.border }]}>
                {(['cm', 'in'] as const).map((u) => (
                  <Pressable
                    key={u}
                    style={[styles.unitBtn, heightUnit === u && { backgroundColor: '#3B82F6', borderRadius: 6 }]}
                    onPress={() => handleUnitToggle(u)}
                  >
                    <Text style={[styles.unitBtnText, { color: heightUnit === u ? '#fff' : colors.muted }]}>{u}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {heightUnit === 'cm' ? (
              <TextInput
                style={[styles.fieldInput, styles.heightInput, { color: colors.foreground, borderColor: isDark ? colors.borderStrong : colors.border }]}
                value={heightCm}
                onChangeText={(v) => { setHeightCm(v); setSaved(false); }}
                onBlur={() => {
                  const n = parseFloat(heightCm);
                  if (heightCm.trim() !== '' && (isNaN(n) || n <= 0)) setHeightCm('');
                }}
                keyboardType="default"
                returnKeyType="done"
                placeholder="e.g. 170"
                placeholderTextColor={colors.muted + '80'}
                maxLength={6}
              />
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subLabel, { color: colors.muted }]}>{se.feetLabel ?? 'Feet'}</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.heightInput, { color: colors.foreground, borderColor: isDark ? colors.borderStrong : colors.border }]}
                    value={heightFt}
                    onChangeText={(v) => { setHeightFt(v); setSaved(false); }}
                    onBlur={() => {
                      const n = parseInt(heightFt, 10);
                      if (heightFt.trim() !== '' && (isNaN(n) || n < 1 || n > 9)) setHeightFt('');
                    }}
                    keyboardType="default"
                    returnKeyType="next"
                    placeholder="5"
                    placeholderTextColor={colors.muted + '80'}
                    maxLength={1}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subLabel, { color: colors.muted }]}>{se.inchesLabel ?? 'Inches'}</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.heightInput, { color: colors.foreground, borderColor: isDark ? colors.borderStrong : colors.border }]}
                    value={heightIn}
                    onChangeText={(v) => { setHeightIn(v); setSaved(false); }}
                    onBlur={() => {
                      const n = parseInt(heightIn, 10);
                      if (heightIn.trim() !== '' && (isNaN(n) || n < 0 || n > 11)) setHeightIn('');
                    }}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholder="9"
                    placeholderTextColor={colors.muted + '80'}
                    maxLength={2}
                  />
                </View>
              </View>
            )}
            {/* Height conversion hint */}
            {heightUnit === 'cm' && heightCm.trim() !== '' && !isNaN(parseFloat(heightCm)) && (() => {
              const { ft, inches } = cmToFtIn(parseFloat(heightCm));
              return <Text style={[styles.hintText, { color: colors.muted }]}>≈ {ft} ft {inches} in</Text>;
            })()}
            {heightUnit === 'in' && heightFt.trim() !== '' && heightIn.trim() !== '' &&
              !isNaN(parseInt(heightFt, 10)) && !isNaN(parseInt(heightIn, 10)) && (
              <Text style={[styles.hintText, { color: colors.muted }]}>
                ≈ {ftInToCm(parseInt(heightFt, 10), parseInt(heightIn, 10))} cm
              </Text>
            )}
          </View>
        </View>

        {/* ─── BMR preview ───────────────────────────────────────────────────── */}
        {(weightKg || heightCm || age) && (
          <View style={[styles.previewCard, {
            backgroundColor: '#F97316' + (isDark ? '18' : '0C'),
            borderColor: '#F97316' + (isDark ? '35' : '20'),
          }]}>
            <Text style={{ fontSize: 14 }}>🔥</Text>
            <Text style={[styles.previewText, { color: colors.muted }]}>
              Your BMR will be recalculated using these measurements. The Caloric Balance card on the Dashboard will update immediately after saving.
            </Text>
          </View>
        )}

        {/* ─── Daily Caloric Goal ────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>
          {se.nutritionSection ?? 'NUTRITION'}
        </Text>
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceRaised : '#F7F7F7',
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.35 : 0.05,
        }]}>
          <View style={styles.fieldRow}>
            <View style={[styles.fieldIcon, { backgroundColor: '#F97316' + '15' }]}>
              <Text style={{ fontSize: 16 }}>🍽️</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{se.dailyCaloricGoal ?? 'Daily Caloric Goal'}</Text>
              <Text style={[styles.fieldHint, { color: colors.muted }]}>Used by the Caloric Balance card on the Dashboard</Text>
            </View>
          </View>
          <TextInput
            style={[styles.fieldInput, { color: colors.foreground, borderColor: isDark ? colors.borderStrong : colors.border }]}
            value={goalKcal}
            onChangeText={(v) => { setGoalKcal(v); setSaved(false); }}
            keyboardType="default"
            returnKeyType="done"
            placeholder={p.caloricPlaceholder}
            placeholderTextColor={colors.muted + '80'}
            maxLength={5}
          />
          <Text style={[styles.hintText, { color: colors.muted }]}>kcal · 500–10,000 range · leave blank to use 2,000 kcal default</Text>

          {/* Quick-select preset chips */}
          <View style={styles.presetRow}>
            {/* Built-in presets */}
            {[1500, 1800, 2000, 2500].map(preset => {
              const isActive = goalKcal === String(preset);
              return (
                <Pressable
                  key={preset}
                  style={[styles.presetChip, isActive && { backgroundColor: colors.primary }]}
                  onPress={() => { setGoalKcal(String(preset)); setSaved(false); }}
                >
                  <Text style={[styles.presetChipText, { color: isActive ? '#fff' : colors.foreground }]}>
                    {preset.toLocaleString()}
                  </Text>
                </Pressable>
              );
            })}

            {/* Custom preset chip — shows saved value or an edit button */}
            {customKcalPreset != null && !showCustomPresetInput && (
              <>
                {/* Tap to select; long-press to edit value+label */}
                <Pressable
                  style={[
                    styles.presetChip,
                    goalKcal === String(customKcalPreset) && { backgroundColor: colors.primary },
                    { flexDirection: 'row', alignItems: 'center', gap: 4 },
                  ]}
                  onPress={() => { setGoalKcal(String(customKcalPreset)); setSaved(false); }}
                  onLongPress={() => {
                    setCustomPresetInput(String(customKcalPreset));
                    setCustomPresetLabelInput(customKcalPresetLabel);
                    setShowCustomPresetInput(true);
                  }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: goalKcal === String(customKcalPreset) ? '#fff' : colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {customKcalPresetLabel.trim()
                      ? customKcalPresetLabel.trim().length > 12
                        ? customKcalPresetLabel.trim().slice(0, 11) + '…'
                        : customKcalPresetLabel.trim()
                      : customKcalPreset.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 10, color: goalKcal === String(customKcalPreset) ? '#ffffffaa' : colors.muted }}>✎</Text>
                </Pressable>
                {/* Rename-only button: changes label without touching kcal value */}
                <Pressable
                  style={[styles.presetChip, { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent', paddingHorizontal: 6 }]}
                  onPress={() => {
                    Alert.prompt(
                      'Rename Preset',
                      `Current label: "${customKcalPresetLabel || String(customKcalPreset)} kcal"`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Save',
                          onPress: (newLabel?: string) => {
                            const trimmed = (newLabel ?? '').trim().slice(0, 20);
                            setCustomKcalPresetLabel(trimmed);
                            setSaved(false);
                          },
                        },
                      ],
                      'plain-text',
                      customKcalPresetLabel,
                    );
                  }}
                >
                  <Text style={[styles.presetChipText, { color: colors.muted }]}>Rename</Text>
                </Pressable>
              </>
            )}

            {/* Inline input for entering / editing the custom preset */}
            {showCustomPresetInput ? (
              <View style={styles.customPresetInputRow}>
                <TextInput
                  style={[styles.customPresetInput, { color: colors.foreground, borderColor: colors.border }]}
                  value={customPresetInput}
                  onChangeText={setCustomPresetInput}
                  keyboardType="default"
                  returnKeyType="next"
                  placeholder="kcal"
                  placeholderTextColor={colors.muted + '80'}
                  maxLength={5}
                  autoFocus
                />
                <TextInput
                  style={[styles.customPresetLabelInput, { color: colors.foreground, borderColor: colors.border }]}
                  value={customPresetLabelInput}
                  onChangeText={setCustomPresetLabelInput}
                  returnKeyType="done"
                  placeholder="Label (optional)"
                  placeholderTextColor={colors.muted + '80'}
                  maxLength={20}
                  onSubmitEditing={() => {
                    const n = parseInt(customPresetInput, 10);
                    if (!isNaN(n) && n >= 500 && n <= 10000) {
                      setCustomKcalPreset(n);
                      setCustomKcalPresetLabel(customPresetLabelInput);
                      setGoalKcal(String(n));
                      setSaved(false);
                    }
                    setShowCustomPresetInput(false);
                  }}
                />
                <Pressable
                  style={[styles.presetChip, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    const n = parseInt(customPresetInput, 10);
                    if (!isNaN(n) && n >= 500 && n <= 10000) {
                      setCustomKcalPreset(n);
                      setCustomKcalPresetLabel(customPresetLabelInput);
                      setGoalKcal(String(n));
                      setSaved(false);
                    }
                    setShowCustomPresetInput(false);
                  }}
                >
                  <Text style={[styles.presetChipText, { color: '#fff' }]}>Save</Text>
                </Pressable>
                <Pressable
                  style={styles.presetChip}
                  onPress={() => setShowCustomPresetInput(false)}
                >
                  <Text style={[styles.presetChipText, { color: colors.foreground }]}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              customKcalPreset == null && (
                <Pressable
                  style={[styles.presetChip, { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: 'transparent' }]}
                  onPress={() => { setCustomPresetInput(''); setShowCustomPresetInput(true); }}
                >
                  <Text style={[styles.presetChipText, { color: colors.muted }]}>+ Custom</Text>
                </Pressable>
              )
            )}
          </View>
        </View>

        {/* ─── Temperature Preference ─────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>
          {se.temperatureUnit ?? 'TEMPERATURE UNIT'}
        </Text>
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceRaised : '#F7F7F7',
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.35 : 0.05,
        }]}>
          <View style={[styles.fieldRow, { flexDirection: 'column', alignItems: 'stretch', paddingBottom: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={[styles.fieldIcon, { backgroundColor: '#10B981' + '15' }]}>
                <Text style={{ fontSize: 16 }}>🌡️</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.muted, flex: 1, marginLeft: 10 }]}>{se.bodyTemperature ?? 'Body Temperature'}</Text>
              {/* °C / °F toggle */}
              <View style={[styles.unitToggle, { backgroundColor: isDark ? colors.surface : '#EBEBEB', borderColor: isDark ? colors.borderStrong : colors.border }]}>
                {(['C', 'F'] as const).map((u) => (
                  <Pressable
                    key={u}
                    style={[styles.unitBtn, tempUnit === u && { backgroundColor: '#10B981', borderRadius: 6 }]}
                    onPress={() => handleTempUnitToggle(u)}
                  >
                    <Text style={[styles.unitBtnText, { color: tempUnit === u ? '#fff' : colors.muted }]}>°{u}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {/* Inline temperature validation */}
            {(() => {
              const rawVal = tempUnit === 'C' ? tempC : tempF;
              const parsed = parseFloat(rawVal);
              const hasValue = rawVal.trim() !== '' && !isNaN(parsed);
              // Normal range: 34–42°C / 93.2–107.6°F
              const minC = 34, maxC = 42;
              const minF = 93.2, maxF = 107.6;
              const isOutOfRange = hasValue && (
                tempUnit === 'C' ? (parsed < minC || parsed > maxC) : (parsed < minF || parsed > maxF)
              );
              const borderColor = isOutOfRange
                ? '#EF4444'
                : isDark ? colors.borderStrong : colors.border;
              return (
                <>
                  <TextInput
                    style={[styles.fieldInput, styles.heightInput, { color: colors.foreground, borderColor }]}
                    value={rawVal}
                    onChangeText={(v) => {
                      if (tempUnit === 'C') setTempC(v);
                      else setTempF(v);
                      setSaved(false);
                    }}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholder={tempUnit === 'C' ? 'e.g. 36.6' : 'e.g. 97.9'}
                    placeholderTextColor={colors.muted + '80'}
                    maxLength={5}
                  />
                  {/* Out-of-range warning */}
                  {isOutOfRange && (
                    <Text style={[styles.hintText, { color: '#EF4444', fontWeight: '600' }]}>
                      {tempUnit === 'C'
                        ? `Normal range: ${minC}–${maxC}°C`
                        : `Normal range: ${minF}–${maxF}°F`}
                    </Text>
                  )}
                  {/* Conversion hint (only when in range or no value) */}
                  {!isOutOfRange && tempUnit === 'C' && hasValue && (
                    <Text style={[styles.hintText, { color: colors.muted }]}>
                      ≈ {cToF(parsed)} °F
                    </Text>
                  )}
                  {!isOutOfRange && tempUnit === 'F' && hasValue && (
                    <Text style={[styles.hintText, { color: colors.muted }]}>
                      ≈ {fToC(parsed)} °C
                    </Text>
                  )}
                </>
              );
            })()}
          </View>
        </View>

        {/* ─── Biological Sex Selector ────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>
          {se.biologicalSex ?? 'BIOLOGICAL SEX'}
        </Text>
        <View style={styles.sexGrid}>
          {SEX_OPTIONS.map((option) => {
            const isSelected = sex === option.value;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => ([
                  styles.sexChip,
                  {
                    backgroundColor: isSelected
                      ? accentColor + '20'
                      : isDark ? colors.surfaceRaised : '#F0F0F0',
                    borderColor: isSelected ? accentColor : isDark ? colors.borderStrong : colors.border,
                    shadowColor: isDark ? '#000' : colors.shadowBase,
                    shadowOpacity: isDark ? 0.3 : 0.04,
                    opacity: pressed ? 0.75 : 1,
                  },
                ])}
                onPress={() => {
                  setSex(sex === option.value ? null : option.value);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSaved(false);
                }}
              >
                <Text style={[styles.sexChipText, { color: isSelected ? accentColor : colors.muted }]}>
                  {option.label}
                </Text>
                {isSelected && <IconSymbol name="checkmark.circle.fill" size={14} color={accentColor} />}
              </Pressable>
            );
          })}
        </View>

        {/* ─── Reference Range Preview ────────────────────────────────────────── */}
        {(age || sex) && (
          <View style={[styles.previewCard, {
            backgroundColor: accentColor + (isDark ? '18' : '0C'),
            borderColor: accentColor + (isDark ? '35' : '20'),
          }]}>
            <IconSymbol name="info.circle.fill" size={16} color={accentColor} />
            <Text style={[styles.previewText, { color: colors.muted }]}>
              Your HRV and BP reference ranges will be recalculated using your updated profile when you save.
            </Text>
          </View>
        )}

        {/* ─── Diet Protocol Selector ─────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 24 }]}>
          {se.dietaryProtocol ?? 'DIETARY PROTOCOL'}
        </Text>
        <Text style={[styles.sectionNote, { color: colors.muted }]}>
          Your active protocol determines conflict thresholds in the Activity Log system and nutrient scoring.
        </Text>
        {/* 2-column tile grid — matches settings.tsx Diet Profile exactly */}
        <View style={{ gap: 10 }}>
          {Array.from({ length: Math.ceil(DIET_TYPE_OPTIONS.length / 2) }, (_, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 10 }}>
              {DIET_TYPE_OPTIONS.slice(rowIdx * 2, rowIdx * 2 + 2).map((opt) => {
                const isActive = dietType === opt.value;
                const cardAccent = opt.isCustom ? (customDiet.color ?? opt.color) : opt.color;
                const dietLabels = (dietLabelStrings as unknown as Record<string, typeof dietLabelStrings.en>)[lang] ?? dietLabelStrings.en;
                const cardLabel = opt.isCustom ? (customDiet.name || (dietLabels[opt.value] ?? opt.label)) : (dietLabels[opt.value] ?? opt.label);
                const cardDesc = opt.isCustom ? (customDiet.description || opt.description) : opt.description;
                const tileStyle = {
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: isActive ? 1.5 : 1,
                  padding: 12,
                  gap: 4,
                  shadowOffset: { width: 0, height: isActive ? 8 : 1 },
                  shadowRadius: isActive ? 16 : 4,
                  elevation: isActive ? 8 : 1,
                  backgroundColor: isActive
                    ? cardAccent + (isDark ? '22' : '12')
                    : isDark ? (colors as any).surfaceRaised ?? colors.surface : '#F7F7F7',
                  borderColor: isActive ? cardAccent : colors.border,
                  ...(isActive ? { shadowColor: cardAccent, shadowOpacity: 0.25 } : {}),
                };
                return (
                  <DietProtocolTooltip
                    key={opt.value}
                    opt={opt}
                    isActive={isActive}
                    shouldPulse={isActive}
                    colors={colors}
                    isDark={isDark}
                    tileStyle={tileStyle}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Animated.timing(subtitleOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
                        setDietType(opt.value);
                        Animated.timing(subtitleOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
                      });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                      {isActive && (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, backgroundColor: cardAccent + '20', borderColor: cardAccent + '50' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: cardAccent }}>Active</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: -0.1, color: isActive ? cardAccent : colors.foreground }}>
                      {cardLabel}
                    </Text>
                    <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted }} numberOfLines={2}>
                      {cardDesc}
                    </Text>
                    {opt.useBioAvailability && (
                      <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, backgroundColor: '#10B98115', borderColor: '#10B98140' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: '#10B981' }}>Bio-Availability</Text>
                      </View>
                    )}
                    {opt.isCustom && (
                      <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, backgroundColor: '#EC489915', borderColor: '#EC489940' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: '#EC4899' }}>Personalized</Text>
                      </View>
                    )}
                  </DietProtocolTooltip>
                );
              })}
            </View>
          ))}
        </View>
        {/* Active diet name preview — matches settings.tsx */}
        {(() => {
          const active = DIET_TYPE_OPTIONS.find(o => o.value === dietType);
          if (!active) return null;
          const activeAccent = active.color ?? colors.primary;
          return (
            <View style={{ gap: 4, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 11, color: colors.muted }}>Active protocol:</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: activeAccent + '18', borderWidth: 1, borderColor: activeAccent + '44' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: activeAccent }}>{active.emoji} {active.label}</Text>
                </View>
              </View>
              <Animated.Text style={{ fontSize: 11, color: colors.muted, lineHeight: 15, opacity: subtitleOpacity }}>{active.cardSubtitle}</Animated.Text>
            </View>
          );
        })()}
        {/* View protocol history row — matches settings.tsx */}
        {dietHistory.length > 0 && (
          <Pressable
            onPress={() => setShowDietHistory(true)}
            style={({ pressed }) => ([
              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, opacity: pressed ? 0.6 : 1 },
            ])}
            accessibilityRole="button"
            accessibilityLabel="View protocol history"
          >
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.muted + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ fontSize: 15 }}>📋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>View protocol history</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{dietHistory.length} change{dietHistory.length !== 1 ? 's' : ''} recorded</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        )}
        {/* Protocol History Modal — matches settings.tsx */}
        <Modal
          visible={showDietHistory}
          animationType="slide"
          transparent
          onRequestClose={() => setShowDietHistory(false)}
        >
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowDietHistory(false)} />
          <View style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '65%', paddingTop: 8, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Protocol History</Text>
              <Pressable onPress={() => setShowDietHistory(false)}>
                <Text style={{ fontSize: 15, color: colors.muted }}>Done</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
              {dietHistory.map((entry, i) => {
                const now = Date.now();
                const then = new Date(entry.changedAt).getTime();
                const diffMs = now - then;
                const diffMin = Math.floor(diffMs / 60_000);
                const rel = diffMin < 1 ? 'just now' : diffMin < 60 ? `${diffMin} min ago` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago` : diffMin < 43200 ? `${Math.floor(diffMin / 1440)}d ago` : safeFormatDate(entry.changedAt);
                const opt = DIET_TYPE_OPTIONS.find(o => o.value === entry.dietType);
                const accent = opt?.color ?? colors.primary;
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent, marginRight: 12, marginTop: 4 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{entry.emoji} {entry.label}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{rel} · {safeFormatDate(entry.changedAt)}</Text>
                      {entry.note ? <Text style={{ fontSize: 12, color: colors.foreground, fontStyle: 'italic', marginTop: 3 }}>📝 {entry.note}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Modal>

        {/* ─── Personalized Diet Editor (shown when 'custom' is active) ──────────── */}
        {dietType === 'custom' && (
          <View style={[
            styles.customDietEditor,
            {
              backgroundColor: isDark ? '#EC489910' : '#FDF2F8',
              borderColor: '#EC489940',
            },
          ]}>
            <View style={styles.customDietEditorHeader}>
              <Text style={styles.customDietEditorEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.customDietEditorTitle, { color: '#EC4899' }]}>Personalized Diet</Text>
                <Text style={[styles.customDietEditorSubtitle, { color: colors.muted }]}>Set your own daily macro & nutrient targets</Text>
              </View>
            </View>

            {/* Name */}
            <View style={styles.customDietFieldRow}>
              <Text style={[styles.customDietFieldLabel, { color: colors.muted }]}>Protocol Name</Text>
              <TextInput
                style={[
                  styles.customDietInput,
                  {
                    color: colors.foreground,
                    backgroundColor: isDark ? colors.surfaceRaised : '#FFF',
                    borderColor: isDark ? colors.borderStrong : '#EC489960',
                  },
                ]}
                value={customDiet.name}
                onChangeText={(v) => { setCustomDiet((p) => ({ ...p, name: v })); setSaved(false); }}
                placeholder="e.g. My Bulking Plan"
                placeholderTextColor={colors.muted + '80'}
                maxLength={40}
                returnKeyType="done"
              />
            </View>

            {/* Description */}
            <View style={styles.customDietFieldRow}>
              <Text style={[styles.customDietFieldLabel, { color: colors.muted }]}>Description</Text>
              <TextInput
                style={[
                  styles.customDietInput,
                  {
                    color: colors.foreground,
                    backgroundColor: isDark ? colors.surfaceRaised : '#FFF',
                    borderColor: isDark ? colors.borderStrong : '#EC489960',
                  },
                ]}
                value={customDiet.description}
                onChangeText={(v) => { setCustomDiet((p) => ({ ...p, description: v })); setSaved(false); }}
                placeholder="e.g. High protein, moderate carbs"
                placeholderTextColor={colors.muted + '80'}
                maxLength={80}
                returnKeyType="done"
              />
            </View>

            {/* Macro targets grid */}
            <Text style={[styles.customDietSectionTitle, { color: colors.muted }]}>DAILY TARGETS</Text>
            <View style={styles.customDietMacroGrid}>
              {/* Calories */}
              <View style={[styles.customDietMacroCard, { backgroundColor: isDark ? colors.surfaceRaised : '#FFF', borderColor: '#8B5CF640' }]}>
                <Text style={[styles.customDietMacroEmoji]}>🔥</Text>
                <Text style={[styles.customDietMacroLabel, { color: colors.muted }]}>Calories</Text>
                <TextInput
                  style={[styles.customDietMacroInput, { color: '#8B5CF6' }]}
                  value={customDiet.caloriesKcal !== undefined ? String(customDiet.caloriesKcal) : ''}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    setCustomDiet((p) => ({ ...p, caloriesKcal: isNaN(n) ? undefined : n }));
                    setSaved(false);
                  }}
                  placeholder="2000"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="default"
                  maxLength={5}
                  returnKeyType="done"
                />
                <Text style={[styles.customDietMacroUnit, { color: colors.muted }]}>kcal</Text>
              </View>

              {/* Carbs */}
              <View style={[styles.customDietMacroCard, { backgroundColor: isDark ? colors.surfaceRaised : '#FFF', borderColor: '#F59E0B40' }]}>
                <Text style={[styles.customDietMacroEmoji]}>🌾</Text>
                <Text style={[styles.customDietMacroLabel, { color: colors.muted }]}>Max Carbs</Text>
                <TextInput
                  style={[styles.customDietMacroInput, { color: '#F59E0B' }]}
                  value={customDiet.maxCarbsG !== undefined ? String(customDiet.maxCarbsG) : ''}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    setCustomDiet((p) => ({ ...p, maxCarbsG: isNaN(n) ? undefined : n }));
                    setSaved(false);
                  }}
                  placeholder="200"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="default"
                  maxLength={4}
                  returnKeyType="done"
                />
                <Text style={[styles.customDietMacroUnit, { color: colors.muted }]}>g/day</Text>
              </View>

              {/* Protein */}
              <View style={[styles.customDietMacroCard, { backgroundColor: isDark ? colors.surfaceRaised : '#FFF', borderColor: '#22C55E40' }]}>
                <Text style={[styles.customDietMacroEmoji]}>💪</Text>
                <Text style={[styles.customDietMacroLabel, { color: colors.muted }]}>Min Protein</Text>
                <TextInput
                  style={[styles.customDietMacroInput, { color: '#22C55E' }]}
                  value={customDiet.minProteinG !== undefined ? String(customDiet.minProteinG) : ''}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    setCustomDiet((p) => ({ ...p, minProteinG: isNaN(n) ? undefined : n }));
                    setSaved(false);
                  }}
                  placeholder="120"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="default"
                  maxLength={4}
                  returnKeyType="done"
                />
                <Text style={[styles.customDietMacroUnit, { color: colors.muted }]}>g/day</Text>
              </View>

              {/* Fat */}
              <View style={[styles.customDietMacroCard, { backgroundColor: isDark ? colors.surfaceRaised : '#FFF', borderColor: '#3B82F640' }]}>
                <Text style={[styles.customDietMacroEmoji]}>🥑</Text>
                <Text style={[styles.customDietMacroLabel, { color: colors.muted }]}>Max Fat</Text>
                <TextInput
                  style={[styles.customDietMacroInput, { color: '#3B82F6' }]}
                  value={customDiet.maxFatG !== undefined ? String(customDiet.maxFatG) : ''}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    setCustomDiet((p) => ({ ...p, maxFatG: isNaN(n) ? undefined : n }));
                    setSaved(false);
                  }}
                  placeholder="65"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="default"
                  maxLength={4}
                  returnKeyType="done"
                />
                <Text style={[styles.customDietMacroUnit, { color: colors.muted }]}>g/day</Text>
              </View>

              {/* Sodium */}
              <View style={[styles.customDietMacroCard, { backgroundColor: isDark ? colors.surfaceRaised : '#FFF', borderColor: '#06B6D440' }]}>
                <Text style={[styles.customDietMacroEmoji]}>🧂</Text>
                <Text style={[styles.customDietMacroLabel, { color: colors.muted }]}>Max Sodium</Text>
                <TextInput
                  style={[styles.customDietMacroInput, { color: '#06B6D4' }]}
                  value={customDiet.maxSodiumMg !== undefined ? String(customDiet.maxSodiumMg) : ''}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    setCustomDiet((p) => ({ ...p, maxSodiumMg: isNaN(n) ? undefined : n }));
                    setSaved(false);
                  }}
                  placeholder="2300"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="default"
                  maxLength={5}
                  returnKeyType="done"
                />
                <Text style={[styles.customDietMacroUnit, { color: colors.muted }]}>mg/day</Text>
              </View>

              {/* Potassium */}
              <View style={[styles.customDietMacroCard, { backgroundColor: isDark ? colors.surfaceRaised : '#FFF', borderColor: '#10B98140' }]}>
                <Text style={[styles.customDietMacroEmoji]}>🍌</Text>
                <Text style={[styles.customDietMacroLabel, { color: colors.muted }]}>Min Potassium</Text>
                <TextInput
                  style={[styles.customDietMacroInput, { color: '#10B981' }]}
                  value={customDiet.minPotassiumMg !== undefined ? String(customDiet.minPotassiumMg) : ''}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    setCustomDiet((p) => ({ ...p, minPotassiumMg: isNaN(n) ? undefined : n }));
                    setSaved(false);
                  }}
                  placeholder="3500"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="default"
                  maxLength={5}
                  returnKeyType="done"
                />
                <Text style={[styles.customDietMacroUnit, { color: colors.muted }]}>mg/day</Text>
              </View>
            </View>

            <Text style={[styles.customDietHint, { color: colors.muted }]}>
              Leave any field blank to skip tracking that nutrient. Tap Save to apply your personalized targets.
            </Text>
          </View>
        )}

        {/* ─── Save Button ────────────────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => ([
            styles.saveBtn,
            {
              backgroundColor: saved ? colors.bpGreen : accentColor,
              opacity: pressed || isSaving ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ])}
          onPress={handleSave}
          disabled={isSaving || saved}
        >
          {saved ? (
            <View style={styles.saveBtnRow}>
              <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Saved!</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>{isSaving ? 'Saving…' : 'Save Profile'}</Text>
          )}
        </Pressable>

        <EvidenceRefBanner
          accentColor="#0EA5E9"
          heading="Metabolic & Anthropometric References"
          refs={[
            { label: 'WHO BMI Classification', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight', badge: 'WHO' },
            { label: 'Mifflin-St Jeor BMR (PMID 2305711)', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/', badge: 'PMID' },
            { label: 'ADA Calorie & Macro Targets 2024', url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S77/153946/', badge: 'ADA' },
            { label: 'Task Force HRV Norms (PMID 8737210)', url: 'https://pubmed.ncbi.nlm.nih.gov/8737210/', badge: 'PMID' },
            { label: 'WHO Free Sugars Guideline', url: 'https://www.who.int/publications/i/item/9789241549028', badge: 'WHO' },
          ]}
          style={{ marginHorizontal: 0, marginBottom: 0 }}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  content: {
    padding: 20,
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionNote: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  fieldIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldContent: { flex: 1 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  fieldInput: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    padding: 0,
  },
  sexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sexChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  sexChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  previewText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 2,
    gap: 2,
  },
  unitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heightInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  hintText: {
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  // Diet Protocol Selector
  dietGrid: {
    gap: 10,
  },
  dietRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
  dietCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  dietCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dietEmoji: {
    fontSize: 22,
  },
  dietActivePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  dietActivePillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dietCardLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  dietCardDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  dietBioTag: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  dietBioTagText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customPresetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  customPresetInput: {
    width: 72,
    height: 34,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  customPresetLabelInput: {
    flex: 1,
    minWidth: 80,
    height: 34,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  // ─── Personalized Diet Editor styles ──────────────────────────────────────────
  customDietEditor: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  customDietEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  customDietEditorEmoji: {
    fontSize: 28,
  },
  customDietEditorTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  customDietEditorSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  customDietFieldRow: {
    gap: 4,
  },
  customDietFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  customDietInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  customDietSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 2,
  },
  customDietMacroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customDietMacroCard: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  customDietMacroEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  customDietMacroLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  customDietMacroInput: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    padding: 0,
    width: '100%',
  },
  customDietMacroUnit: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  customDietHint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
  },
});
