/**
 * Allergy Log Screen
 * Manage a list of known allergies.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang, useRTL } from '@/hooks';
import type { AllergyRecord, AllergySeverity, AllergyCategory } from '@/lib/health/types';
import { PrivacyBanner } from '@/components/privacy-banner';
import { DateTimePickerField } from '@/components/date-time-picker-field';
import { allergyStrings } from '@/lib/i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ymdToDate(ymd: string): Date {
  if (!ymd) return new Date();
  const parts = ymd.split('-');
  if (parts.length !== 3) return new Date();
  const d = new Date();
  d.setFullYear(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  d.setHours(12, 0, 0, 0);
  return isNaN(d.getTime()) ? new Date() : d;
}
function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  allergen: string;
  category: AllergyCategory;
  reaction: string;
  severity: AllergySeverity;
  onsetDate: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  allergen: '',
  category: 'drug',
  reaction: '',
  severity: 'moderate',
  onsetDate: '',
  notes: '',
};

function getSeverityOptions(t: { mild?: string; moderate?: string; severe?: string; lifeThreaten?: string }): { value: AllergySeverity; label: string; color: string }[] {
  return [
    { value: 'mild', label: t.mild ?? 'Mild', color: '#22C55E' },
    { value: 'moderate', label: t.moderate ?? 'Moderate', color: '#F59E0B' },
    { value: 'severe', label: t.severe ?? 'Severe', color: '#EF4444' },
    { value: 'life_threatening', label: t.lifeThreaten ?? 'Life-Threatening', color: '#7C3AED' },
  ];
}

function getCategoryOptions(t: { catDrug?: string; catFood?: string; catEnv?: string; catInsect?: string; catLatex?: string; catOther?: string }): { value: AllergyCategory; label: string; icon: string }[] {
  return [
    { value: 'drug', label: t.catDrug ?? 'Drug', icon: '💊' },
    { value: 'food', label: t.catFood ?? 'Food', icon: '🥜' },
    { value: 'environmental', label: t.catEnv ?? 'Environmental', icon: '🌿' },
    { value: 'insect', label: t.catInsect ?? 'Insect', icon: '🐝' },
    { value: 'latex', label: t.catLatex ?? 'Latex', icon: '🧤' },
    { value: 'other', label: t.catOther ?? 'Other', icon: '⚠️' },
  ];
}

const SEVERITY_COLORS: Record<AllergySeverity, string> = {
  mild: '#22C55E',
  moderate: '#F59E0B',
  severe: '#EF4444',
  life_threatening: '#7C3AED',
};

function getSeverityLabels(t: { mild?: string; moderate?: string; severe?: string; lifeThreaten?: string }): Record<AllergySeverity, string> {
  return {
    mild: t.mild ?? 'Mild',
    moderate: t.moderate ?? 'Moderate',
    severe: t.severe ?? 'Severe',
    life_threatening: t.lifeThreaten ?? 'Life-Threatening',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AllergiesScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const isRTL = useRTL();
  const t = ((allergyStrings as unknown as Record<string, typeof allergyStrings.en>)[lang] ?? allergyStrings.en);
  const SEVERITY_OPTIONS = getSeverityOptions(t);
  const CATEGORY_OPTIONS = getCategoryOptions(t);
  const SEVERITY_LABELS = getSeverityLabels(t);
  const { state, addAllergy, updateAllergy, deleteAllergy, setAllergyStatus } = useHealth();
  const allergyStatus = state.data?.allergyStatus ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records: AllergyRecord[] = state.data?.allergies ?? [];

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);


  const set = useCallback((key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((record: AllergyRecord) => {
    setForm({
      allergen: record.allergen,
      category: record.category,
      reaction: record.reaction ?? '',
      severity: record.severity,
      onsetDate: record.onsetDate ?? '',
      notes: record.notes ?? '',
    });
    setEditingId(record.id);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);


  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!form.allergen.trim()) {
      Alert.alert(t.missingField, t.missingAllergenMsg);
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      const existing = records.find(r => r.id === editingId);
      if (!existing) return;
      await updateAllergy({
        ...existing,
        allergen: form.allergen.trim(),
        category: form.category,
        reaction: form.reaction.trim() || undefined,
        severity: form.severity,
        onsetDate: form.onsetDate.trim() || undefined,
        notes: form.notes.trim() || undefined,
        updatedAt: now,
      });
    } else {
      await addAllergy({
        id: `allergy-${Date.now()}`,
        allergen: form.allergen.trim(),
        category: form.category,
        reaction: form.reaction.trim() || undefined,
        severity: form.severity,
        onsetDate: form.onsetDate.trim() || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeForm();
  }, [form, editingId, records, addAllergy, updateAllergy, closeForm]);

  const handleSetStatus = useCallback(async (status: 'nkda' | 'nka') => {
    const isActive = allergyStatus === status;
    if (!isActive) {
      // Confirm if there are existing allergy records
      if (records.length > 0) {
        Alert.alert(
          status === 'nkda' ? t.nkdaLabel : t.nkaLabel,
          status === 'nkda' ? t.confirmNkdaMsg : t.confirmNkaMsg,
          [
            { text: t.cancel, style: 'cancel' },
            {
              text: t.confirm, onPress: async () => {
                await setAllergyStatus(status);
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            },
          ]
        );
        return;
      }
      await setAllergyStatus(status);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await setAllergyStatus(null);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [allergyStatus, records.length, setAllergyStatus]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t.deleteAllergy, t.deleteMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive', onPress: async () => {
          await deleteAllergy(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteAllergy]);

  // ── Render ────────────────────────────────────────────────────────────────

  const s = styles(colors);

  const renderRecord = ({ item }: { item: AllergyRecord }) => {
    const sevColor = SEVERITY_COLORS[item.severity] ?? colors.warning;
    const sevLabel = (
      item.severity === 'mild' ? (t.mild ?? 'Mild') :
      item.severity === 'moderate' ? (t.moderate ?? 'Moderate') :
      item.severity === 'severe' ? (t.severe ?? 'Severe') :
      (t.lifeThreaten ?? 'Life-Threatening')
    );
    const catOpt = CATEGORY_OPTIONS.find(c => c.value === item.category);
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16 }}>{catOpt?.icon ?? '⚠️'}</Text>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>{item.allergen}</Text>
            </View>
            {item.reaction ? (
              <Text style={[s.cardSub, { color: colors.muted }]}>{t.reactionPrefix ?? 'Reaction:'} {item.reaction}</Text>
            ) : null}
          </View>
          <View style={[s.severityBadge, { backgroundColor: sevColor + '22' }]}>
            <Text style={[s.severityText, { color: sevColor }]}>{sevLabel}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={[s.catTag, { backgroundColor: colors.border }]}>
            <Text style={[s.catTagText, { color: colors.muted }]}>
              {item.category === 'drug' ? (t.catDrug ?? catOpt?.label ?? item.category) :
               item.category === 'food' ? (t.catFood ?? catOpt?.label ?? item.category) :
               item.category === 'environmental' ? (t.catEnv ?? catOpt?.label ?? item.category) :
               item.category === 'insect' ? (t.catInsect ?? catOpt?.label ?? item.category) :
               item.category === 'latex' ? (t.catLatex ?? catOpt?.label ?? item.category) :
               (t.catOther ?? catOpt?.label ?? item.category)}
            </Text>
          </View>
          {item.onsetDate ? (
            <Text style={[s.cardMeta, { color: colors.muted }]}>{t.sinceLabel ?? 'Since'} {item.onsetDate}</Text>
          ) : null}
        </View>
        {item.notes ? (
          <Text style={[s.cardNotes, { color: colors.muted }]} numberOfLines={2}>{item.notes}</Text>
        ) : null}

        <View style={[s.cardActions, { borderTopColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => openEdit(item)}
          >
            <IconSymbol name="pencil" size={16} color={colors.primary} />
            <Text style={[s.actionText, { color: colors.primary }]}>{t.edit}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => handleDelete(item.id)}
          >
            <IconSymbol name="trash" size={16} color={colors.error} />
            <Text style={[s.actionText, { color: colors.error }]}>{t.delete}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/record' as any)}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol name="arrow.left" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>{t.back}</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t.title}</Text>
        <TouchableOpacity
          onPress={openAdd}
          style={[s.addBtn, { backgroundColor: colors.primary }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 22, lineHeight: 26 }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy Banner */}
      <PrivacyBanner />

      {/* NKDA / NKA Quick Status */}
      <View style={[s.statusRow, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [
            s.statusBtn,
            {
              backgroundColor: allergyStatus === 'nkda' ? colors.success : colors.surface,
              borderColor: allergyStatus === 'nkda' ? colors.success : colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => handleSetStatus('nkda')}
        >
          <Text style={[s.statusBtnText, { color: allergyStatus === 'nkda' ? '#fff' : colors.foreground }]}>
            {allergyStatus === 'nkda' ? '✓ ' : ''}{t.nkdaBanner}
          </Text>
          <Text style={[s.statusBtnSub, { color: allergyStatus === 'nkda' ? '#ffffffcc' : colors.muted }]}>
            {t.nkdaLabel}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.statusBtn,
            {
              backgroundColor: allergyStatus === 'nka' ? colors.success : colors.surface,
              borderColor: allergyStatus === 'nka' ? colors.success : colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => handleSetStatus('nka')}
        >
          <Text style={[s.statusBtnText, { color: allergyStatus === 'nka' ? '#fff' : colors.foreground }]}>
            {allergyStatus === 'nka' ? '✓ ' : ''}{t.nkaBanner}
          </Text>
          <Text style={[s.statusBtnSub, { color: allergyStatus === 'nka' ? '#ffffffcc' : colors.muted }]}>
            {t.nkaLabel}
          </Text>
        </Pressable>
      </View>

      {/* Active status banner */}
      {allergyStatus ? (
        <View style={[s.activeBanner, { backgroundColor: colors.success + '18', borderColor: colors.success + '44' }]}>
          <Text style={{ fontSize: 16 }}>✅</Text>
          <Text style={[s.activeBannerText, { color: colors.success }]}>
            {allergyStatus === 'nkda' ? `${t.nkdaBanner} — ${t.nkdaLabel}` : `${t.nkaBanner} — ${t.nkaLabel}`}
          </Text>
        </View>
      ) : null}

      {/* List */}
      {records.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 48 }}>🌿</Text>
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t.noAllergiesTitle}</Text>
          <Text style={[s.emptySub, { color: colors.muted }]}>
            {t.noAllergiesSub}
          </Text>
          <Pressable
            style={({ pressed }) => [s.emptyBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={openAdd}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
            <Text style={s.emptyBtnText}>{t.addAllergy}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => item.id}
          renderItem={renderRecord}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add / Edit Form Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeForm}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={[s.modalIconWrap, { backgroundColor: colors.warning + '22' }]}>
              <Text style={{ fontSize: 22 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>
                {editingId ? t.editAllergy : t.addAllergy}
              </Text>
              <Text style={[s.modalSub, { color: colors.muted }]}>{t.allergyLogSubtitle ?? 'Allergy Log'}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [s.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={closeForm}
            >
              <IconSymbol name="xmark" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >


            {/* ── Form Fields ── */}
            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.allergenLabel}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.allergen}
              onChangeText={v => set('allergen', v)}
              placeholder={t.allergenPlaceholder}
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.categoryLabel}</Text>
            <View style={s.chipRow}>
              {CATEGORY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: form.category === opt.value ? colors.primary : colors.surface,
                      borderColor: form.category === opt.value ? colors.primary : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => {
                    set('category', opt.value);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[s.chipText, { color: form.category === opt.value ? '#fff' : colors.foreground }]}>
                    {opt.icon} {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.severityLabel}</Text>
            <View style={s.chipRow}>
              {SEVERITY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: form.severity === opt.value ? opt.color : colors.surface,
                      borderColor: form.severity === opt.value ? opt.color : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => {
                    set('severity', opt.value);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[s.chipText, { color: form.severity === opt.value ? '#fff' : colors.foreground }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.reactionLabel}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.reaction}
              onChangeText={v => set('reaction', v)}
              placeholder={t.reactionPlaceholder}
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <DateTimePickerField
              label={t.onsetLabel}
              value={ymdToDate(form.onsetDate || dateToYmd(new Date()))}
              onChange={(d: Date | null) => d && set('onsetDate', dateToYmd(d))}
              mode="date"
              inlineMode
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.notesLabel}</Text>
            <TextInput
              style={[s.input, s.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.notes}
              onChangeText={v => set('notes', v)}
              placeholder={t.notesPlaceholder}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              blurOnSubmit={false}
            />

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Text style={s.saveBtnText}>{editingId ? t.updateAllergy : t.saveAllergy}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (_c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backText: { fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: {
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  cardSub: { fontSize: 12, marginTop: 2 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  severityText: { fontSize: 11, fontWeight: '600' },
  catTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catTagText: { fontSize: 11, fontWeight: '500' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  cardNotes: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardActions: {
    flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10,
    borderTopWidth: 0.5,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '500' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 20, paddingBottom: 16, borderBottomWidth: 0.5, gap: 12,
  },
  modalIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, lineHeight: 20,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  saveBtn: {
    marginTop: 24, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // NKDA / NKA status styles
  statusRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  statusBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', gap: 2,
  },
  statusBtnText: { fontSize: 15, fontWeight: '700' },
  statusBtnSub: { fontSize: 11, fontWeight: '400', textAlign: 'center' },
  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  activeBannerText: { fontSize: 14, fontWeight: '600', flex: 1 },
});
