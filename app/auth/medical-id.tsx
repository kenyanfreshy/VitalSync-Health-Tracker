/**
 * Medical ID Screen
 * Lets users store blood type, allergies, conditions, organ donor status, and notes.
 * This information is displayed on the lock screen for first responders.
 * Includes Smart Scribe (voice-to-text) for hands-free form filling.
 */
import React, { useEffect, useState, useRef} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { BLOOD_TYPE_OPTIONS, type MedicalID } from '@/lib/auth/auth-storage';
import { KeyboardDictationBanner, type KeyboardDictationBannerHandle } from '@/components/keyboard-dictation-banner';
import { useScribeHighlight, SCRIBE_HIGHLIGHT_STYLE } from '@/hooks/use-scribe-highlight';

const EMPTY: MedicalID = {
  bloodType: 'Unknown',
  allergies: '',
  conditions: '',
  medications: '',
  organDonor: false,
  notes: '',
};

const SCRIBE_FIELDS = ['allergies', 'conditions', 'medications', 'notes'] as const;
const TOTAL_FIELDS = SCRIBE_FIELDS.length;

type ScribeResult = {
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  notes: string | null;
  filledCount: number;
};

export default function MedicalIDScreen() {
  const colors = useColors();
  const { medicalId, updateMedicalID } = useAuth();

  const [form, setForm] = useState<MedicalID>(medicalId ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const bannerRef = useRef<KeyboardDictationBannerHandle>(null);
  const [scribeResult, setScribeResult] = useState<ScribeResult | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribeError, setScribeError] = useState<string | null>(null);

  const { isHighlighted, triggerHighlight, clearHighlight } = useScribeHighlight();

  useEffect(() => {
    if (medicalId) setForm(medicalId);
  }, [medicalId]);

  function set<K extends keyof MedicalID>(key: K, value: MedicalID[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Keyboard dictation: user taps mic on keyboard, transcript fills the notes field */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleScribeTranscript(transcript: string) {
    if (!transcript.trim()) return;
    set('notes', transcript.trim());
    const filledCount = 1;
    setScribeResult({ allergies: null, conditions: null, medications: null, notes: transcript.trim(), filledCount });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // handleScribeResult removed — no server audio upload; keyboard dictation only

  async function handleSave() {
    setSaving(true);
    try {
      await updateMedicalID(form);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (_unused) {
      Alert.alert('Error', 'Could not save Medical ID. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    Alert.alert(
      'Clear Medical ID',
      'Remove all Medical ID information from the lock screen?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await updateMedicalID(null);
            setForm(EMPTY);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ],
    );
  }

  const s = makeStyles(colors);

  return (
    <ScreenContainer>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <KeyboardDictationBanner ref={bannerRef} />
        {/* Header */}
        <View style={s.header}>
          <Pressable
            style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => router.back()}
          >
            <IconSymbol name="chevron.left" size={20} color={colors.primary} />
            <Text style={[s.backText, { color: colors.primary }]}>Settings</Text>
          </Pressable>
        </View>

        {/* Title */}
        <View style={s.titleRow}>
          <View style={[s.titleIcon, { backgroundColor: '#FF3B3020' }]}>
            <IconSymbol name="cross.fill" size={22} color="#FF3B30" />
          </View>
          <View>
            <Text style={[s.title, { color: colors.foreground }]}>Medical ID</Text>
            <Text style={[s.subtitle, { color: colors.muted }]}>
              Visible on lock screen for first responders
            </Text>
          </View>
        </View>

          {(false || false) && (
            <View style={s.scribePending}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[s.scribePendingText, { color: colors.muted }]}>Transcribing…</Text>
            </View>
          )}

          {scribeResult && (
            <View style={[s.scribeResult, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
              <View style={s.scribeResultHeader}>
                <View style={[s.confidenceDot, { backgroundColor: colors.success }]} />
                <Text style={[s.scribeResultConf, { color: colors.success }]}>
                  Filled {scribeResult.filledCount}/{TOTAL_FIELDS} field{scribeResult.filledCount !== 1 ? 's' : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => { setScribeResult(null); setScribeError(null); clearHighlight(); }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 6 })}
              >
                <Text style={[s.scribeRetry, { color: colors.primary }]}>🍎 Try again</Text>
              </Pressable>
            </View>
          )}

        {/* Blood Type */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>BLOOD TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.bloodTypeRow}
          >
            {BLOOD_TYPE_OPTIONS.map((bt) => (
              <Pressable
                key={bt}
                style={({ pressed }) => [
                  s.bloodTypeChip,
                  {
                    backgroundColor: form.bloodType === bt ? '#FF3B30' : colors.background,
                    borderColor: form.bloodType === bt ? '#FF3B30' : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => {
                  set('bloodType', bt);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[s.bloodTypeText, { color: form.bloodType === bt ? '#FFFFFF' : colors.foreground }]}>
                  {bt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Allergies */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>ALLERGIES</Text>
          <TextInput
            style={[
              s.textInput,
              { color: colors.foreground, borderColor: colors.border },
              isHighlighted('allergies') && SCRIBE_HIGHLIGHT_STYLE,
            ]}
            placeholder="e.g. Penicillin, Peanuts, Latex"
            placeholderTextColor={colors.muted}
            value={form.allergies}
            onChangeText={(v) => { if (v.length > 0) bannerRef.current?.dismiss(); set('allergies', v); }}
            multiline
            numberOfLines={2}
            returnKeyType="done"
          />
        </View>

        {/* Medical Conditions */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>MEDICAL CONDITIONS</Text>
          <TextInput
            style={[
              s.textInput,
              { color: colors.foreground, borderColor: colors.border },
              isHighlighted('conditions') && SCRIBE_HIGHLIGHT_STYLE,
            ]}
            placeholder="e.g. Type 2 Diabetes, Hypertension"
            placeholderTextColor={colors.muted}
            value={form.conditions}
            onChangeText={(v) => set('conditions', v)}
            multiline
            numberOfLines={2}
            returnKeyType="done"
          />
        </View>

        {/* Medications */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>CURRENT MEDICATIONS</Text>
          <TextInput
            style={[
              s.textInput,
              { color: colors.foreground, borderColor: colors.border },
              isHighlighted('medications') && SCRIBE_HIGHLIGHT_STYLE,
            ]}
            placeholder="e.g. Metformin 500mg, Lisinopril 10mg"
            placeholderTextColor={colors.muted}
            value={form.medications}
            onChangeText={(v) => set('medications', v)}
            multiline
            numberOfLines={2}
            returnKeyType="done"
          />
        </View>

        {/* Organ Donor */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.toggleRow}>
            <View style={s.toggleLabel}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>Organ Donor</Text>
              <Text style={[s.fieldSub, { color: colors.muted }]}>Shown on lock screen</Text>
            </View>
            <Switch
              value={form.organDonor}
              onValueChange={(v) => {
                set('organDonor', v);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              trackColor={{ false: colors.border, true: '#FF3B30' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Notes */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>NOTES FOR FIRST RESPONDERS</Text>
          <TextInput
            style={[
              s.textInput,
              { color: colors.foreground, borderColor: colors.border },
              isHighlighted('notes') && SCRIBE_HIGHLIGHT_STYLE,
            ]}
            placeholder="e.g. Wears contact lenses, has pacemaker"
            placeholderTextColor={colors.muted}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
            numberOfLines={3}
            returnKeyType="done"
          />
        </View>

        {/* Privacy note */}
        <View style={[s.privacyNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="lock.fill" size={13} color={colors.muted} />
          <Text style={[s.privacyText, { color: colors.muted }]}>
            Medical ID is stored encrypted on your device and never uploaded. It is visible on the lock screen without unlocking.
          </Text>
        </View>

        {/* Actions */}
        <Pressable
          style={({ pressed }) => [s.saveBtn, { backgroundColor: '#FF3B30', opacity: pressed || saving ? 0.75 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Medical ID'}</Text>
        </Pressable>

        {medicalId && (
          <Pressable
            style={({ pressed }) => [s.clearBtn, { borderColor: colors.error, opacity: pressed ? 0.6 : 1 }]}
            onPress={handleClear}
          >
            <Text style={[s.clearBtnText, { color: colors.error }]}>Clear Medical ID</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function makeStyles(_colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    backText: { fontSize: 16 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
    titleIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: '700' },
    subtitle: { fontSize: 13, marginTop: 2 },
    // Scribe banner
    scribeBanner: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      gap: 10,
    },
    scribeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    scribeLeft: { flex: 1, marginRight: 12 },
    scribeTitle: { fontSize: 14, fontWeight: '600' },
    scribeSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
    scribePending: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
    scribePendingText: { fontSize: 13 },
    scribeAlert: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
    scribeAlertText: { fontSize: 13 },
    scribeResult: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 4 },
    scribeResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    confidenceDot: { width: 8, height: 8, borderRadius: 4 },
    scribeResultConf: { fontSize: 12, fontWeight: '600' },
    scribeFilledCount: { fontSize: 12 },
    scribeReasoning: { fontSize: 12, lineHeight: 17 },
    scribeDisclaimer: { fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
    scribeRetry: { fontSize: 13, fontWeight: '500' },
    // Form sections
    section: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
    },
    sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
    bloodTypeRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    bloodTypeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
    },
    bloodTypeText: { fontSize: 14, fontWeight: '600' },
    textInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      minHeight: 44,
      textAlignVertical: 'top',
    },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLabel: { flex: 1, marginRight: 12 },
    fieldLabel: { fontSize: 15, fontWeight: '500' },
    fieldSub: { fontSize: 12, marginTop: 2 },
    privacyNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 20,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    privacyText: { flex: 1, fontSize: 12, lineHeight: 17 },
    saveBtn: {
      marginHorizontal: 16,
      marginBottom: 12,
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
    },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    clearBtn: {
      marginHorizontal: 16,
      marginBottom: 12,
      paddingVertical: 13,
      borderRadius: 14,
      alignItems: 'center',
      borderWidth: 1.5,
    },
    clearBtnText: { fontSize: 15, fontWeight: '600' },
  });
}
