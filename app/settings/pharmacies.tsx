/**
 * Manage Saved Pharmacies — Settings sub-screen
 *
 * Lists all saved pharmacies. Users can:
 *  • ➕ Add a new pharmacy via an inline form (name, phone, address, hours)
 *  • ⭐ Star / unstar as their preferred (default) pharmacy
 *  • ✏️  Edit name, phone, address, and hours inline
 *  • 🗑  Delete the entry
 *
 * The preferred pharmacy is pre-filled automatically when the user opens
 * the Add Medication form with an empty pharmacy field.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { settingsExtStrings } from '@/lib/i18n';
import {
  getAllPharmacies,
  deletePharmacy,
  updatePharmacy,
  setPreferredPharmacy,
  upsertPharmacy,
  type PharmacyEntry,
} from '@/lib/medications/pharmacy-store';

// ─── Add Pharmacy Modal ───────────────────────────────────────────────────────

interface AddFormState {
  name: string;
  phone: string;
  address: string;
  hours: string;
}

const EMPTY_FORM: AddFormState = { name: '', phone: '', address: '', hours: '' };

function AddPharmacyModal({
  visible,
  colors,
  se,
  onClose,
  onSaved,
}: {
  visible: boolean;
  se: typeof settingsExtStrings.en;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      setForm(EMPTY_FORM);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert(se.nameRequired ?? 'Name required', se.nameRequiredMsg ?? 'Please enter a pharmacy name.');
      return;
    }
    setSaving(true);
    try {
      await upsertPharmacy(form.name, form.phone, form.address, form.hours);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
  ];
  const labelStyle = [styles.fieldLabel, { color: colors.muted }];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Pressable>
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Title row */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{se.addPharmacy ?? 'Add Pharmacy'}</Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <IconSymbol name="xmark" size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              {/* Name */}
              <Text style={labelStyle}>{se.pharmacyName ?? 'PHARMACY NAME'} *</Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                style={inputStyle}
                placeholder="e.g. CVS Pharmacy, Walgreens"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
                autoCorrect={false}
                autoCapitalize="words"
              />

              {/* Phone */}
              <Text style={labelStyle}>{se.pharmacyPhone ?? 'PHONE NUMBER'}</Text>
              <TextInput
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                style={inputStyle}
                placeholder="(555) 123-4567"
                placeholderTextColor={colors.muted}
                keyboardType="default"
                returnKeyType="next"
              />

              {/* Address */}
              <Text style={labelStyle}>{se.pharmacyAddress ?? 'ADDRESS'}</Text>
              <TextInput
                value={form.address}
                onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                style={inputStyle}
                placeholder="123 Main St, City, State 12345"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
                autoCorrect={false}
                autoCapitalize="words"
              />

              {/* Hours */}
              <Text style={labelStyle}>{se.pharmacyHours ?? 'HOURS (optional)'}</Text>
              <TextInput
                value={form.hours}
                onChangeText={(v) => setForm((f) => ({ ...f, hours: v }))}
                style={inputStyle}
                placeholder="e.g. Mon-Fri 9AM-9PM, Sat-Sun 10AM-6PM"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                autoCorrect={false}
                onSubmitEditing={handleSave}
              />

              {/* Hint */}
              <View style={[styles.formHint, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.formHintText, { color: colors.primary }]}>
                  {se.pharmacyFormHint ?? '💡 Once saved, this pharmacy will appear as an autofill option when you log a medication. Star it to make it your default.'}
                </Text>
              </View>

              {/* Save button */}
              <Pressable
                onPress={handleSave}
                disabled={saving || !form.name.trim()}
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor: form.name.trim() ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{se.savePharmacy ?? 'Save Pharmacy'}</Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Inline edit row ──────────────────────────────────────────────────────────

interface EditState {
  name: string;
  phone: string;
  address: string;
  hours: string;
}

function PharmacyRow({
  entry,
  colors,
  se,
  onStar,
  onDelete,
  onSave,
}: {
  entry: PharmacyEntry;
  colors: ReturnType<typeof useColors>;
  se: typeof settingsExtStrings.en;
  onStar: () => void;
  onDelete: () => void;
  onSave: (edit: EditState & { hours: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>({
    name: entry.name,
    phone: entry.phone,
    address: entry.address,
    hours: entry.hours ?? '',
  });

  // Sync draft when entry changes externally (e.g. after save)
  useEffect(() => {
    if (!editing) {
      setDraft({ name: entry.name, phone: entry.phone, address: entry.address, hours: entry.hours ?? '' });
    }
  }, [entry, editing]);

  const handleSave = () => {
    if (!draft.name.trim()) return;
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft({ name: entry.name, phone: entry.phone, address: entry.address, hours: entry.hours ?? '' });
    setEditing(false);
  };

  const inputStyle = [
    styles.editInput,
    { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
  ];

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: entry.isPreferred ? '#F59E0B' : colors.border,
          borderWidth: entry.isPreferred ? 1.5 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {/* Preferred star badge */}
      {entry.isPreferred && (
        <View style={styles.preferredBadge}>
          <Text style={styles.preferredBadgeText}>{se.defaultBadge ?? '⭐ Default'}</Text>
        </View>
      )}

      {editing ? (
        /* ── Edit mode ─────────────────────────────────────────────────── */
        <View style={styles.editBlock}>
          <Text style={[styles.editLabel, { color: colors.muted }]}>{se.pharmacyName ?? 'NAME'}</Text>
          <TextInput
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            style={inputStyle}
            placeholder="Pharmacy name"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            autoCorrect={false}
          />
          <Text style={[styles.editLabel, { color: colors.muted }]}>{se.pharmacyPhone ?? 'PHONE'}</Text>
          <TextInput
            value={draft.phone}
            onChangeText={(v) => setDraft((d) => ({ ...d, phone: v }))}
            style={inputStyle}
            placeholder="(555) 123-4567"
            placeholderTextColor={colors.muted}
            keyboardType="default"
            returnKeyType="next"
          />
          <Text style={[styles.editLabel, { color: colors.muted }]}>{se.pharmacyAddress ?? 'ADDRESS'}</Text>
          <TextInput
            value={draft.address}
            onChangeText={(v) => setDraft((d) => ({ ...d, address: v }))}
            style={inputStyle}
            placeholder="123 Main St, City, State"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            autoCorrect={false}
          />
          <Text style={[styles.editLabel, { color: colors.muted }]}>{se.pharmacyHours ?? 'HOURS (optional)'}</Text>
          <TextInput
            value={draft.hours}
            onChangeText={(v) => setDraft((d) => ({ ...d, hours: v }))}
            style={inputStyle}
            placeholder="e.g. Mon-Fri 9AM-9PM, Sat-Sun 10AM-6PM"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            autoCorrect={false}
          />
          <View style={styles.editActions}>
            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.editBtn,
                { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.editBtnText, { color: colors.muted }]}>{se.cancelLabel ?? 'Cancel'}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [
                styles.editBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.editBtnText, { color: '#fff' }]}>{se.saveLabel ?? 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* ── View mode ─────────────────────────────────────────────────── */
        <View style={styles.viewBlock}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pharmName, { color: colors.foreground }]} numberOfLines={1}>
              🏥 {entry.name}
            </Text>
            {!!entry.phone && (
              <Text style={[styles.pharmDetail, { color: colors.muted }]}>
                📞 {entry.phone}
              </Text>
            )}
            {!!entry.address && (
              <Text style={[styles.pharmDetail, { color: colors.muted }]} numberOfLines={2}>
                📍 {entry.address}
              </Text>
            )}
            {!!entry.hours && (
              <Text style={[styles.pharmDetail, { color: colors.muted }]} numberOfLines={2}>
                🕒 {entry.hours}
              </Text>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actionBtns}>
            {/* Star / unstar */}
            <Pressable
              onPress={onStar}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityLabel={entry.isPreferred ? (se.removeAsDefault ?? 'Remove as default') : (se.setAsDefault ?? 'Set as default pharmacy')}
            >
              <Text style={{ fontSize: 20 }}>{entry.isPreferred ? '⭐' : '☆'}</Text>
            </Pressable>

            {/* Edit */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEditing(true);
              }}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityLabel="Edit pharmacy"
            >
              <IconSymbol name="pencil" size={18} color={colors.primary} />
            </Pressable>

            {/* Delete */}
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityLabel="Delete pharmacy"
            >
              <IconSymbol name="trash" size={18} color={colors.error} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ManagePharmaciesScreen() {
  const lang = useLang();
  const se = (settingsExtStrings[lang as keyof typeof settingsExtStrings] ?? settingsExtStrings.en) as typeof settingsExtStrings.en;
  const colors = useColors();
  const [pharmacies, setPharmacies] = useState<PharmacyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await getAllPharmacies();
    setPharmacies(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const handleStar = useCallback(async (entry: PharmacyEntry) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Toggle: if already preferred, clear; otherwise set
    await setPreferredPharmacy(entry.isPreferred ? '' : entry.name);
    await reload();
  }, [reload]);

  const handleDelete = useCallback((entry: PharmacyEntry) => {
    Alert.alert(
      se.deletePharmacyTitle ?? 'Delete Pharmacy',
      `${se.removeLabel ?? 'Remove'} "${entry.name}" ${se.fromSavedPharmacies ?? 'from saved pharmacies?'}`,
      [
        { text: se.cancelLabel ?? 'Cancel', style: 'cancel' },
        {
          text: se.deleteEntry ?? 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deletePharmacy(entry.name);
            await reload();
          },
        },
      ],
    );
  }, [reload]);

  const handleSave = useCallback(async (entry: PharmacyEntry, edit: EditState) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updatePharmacy(entry.name, edit);
    await reload();
  }, [reload]);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={20} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>{se.settingsTitle ?? 'Settings'}</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>{se.savedPharmaciesTitle ?? 'Saved Pharmacies'}</Text>
          {/* Add button */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddModal(true);
            }}
            style={({ pressed }) => [styles.addHeaderBtn, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityLabel="Add pharmacy"
          >
            <IconSymbol name="plus" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* Hint */}
        <View style={[styles.hint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.hintText, { color: colors.muted }]}>
            {se.pharmacyHint ?? '⭐ Star a pharmacy to set it as your default — it will be pre-filled automatically when you add a new medication.'}
          </Text>
        </View>

        {/* Add pharmacy CTA (shown when list is empty) */}
        {!loading && pharmacies.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>🏥</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{se.noSavedPharmacies ?? 'No saved pharmacies'}</Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              {se.pharmacyAutoSaveNote ?? 'Add a pharmacy below, or they will be saved automatically when you log a medication with pharmacy details.'}
            </Text>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAddModal(true);
              }}
              style={({ pressed }) => [
                styles.addEmptyBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <IconSymbol name="plus" size={18} color="#fff" />
              <Text style={styles.addEmptyBtnText}>{se.addPharmacy ?? 'Add Pharmacy'}</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : pharmacies.length > 0 ? (
          <FlatList
            data={pharmacies}
            keyExtractor={(item) => item.name}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
            renderItem={({ item }) => (
              <PharmacyRow
                entry={item}
                colors={colors}
                se={se}
                onStar={() => handleStar(item)}
                onDelete={() => handleDelete(item)}
                onSave={(edit) => handleSave(item, edit)}
              />
            )}
            ListFooterComponent={
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddModal(true);
                }}
                style={({ pressed }) => [
                  styles.addListBtn,
                  { borderColor: colors.primary + '60', backgroundColor: colors.primary + '10', opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <IconSymbol name="plus" size={18} color={colors.primary} />
                <Text style={[styles.addListBtnText, { color: colors.primary }]}>{se.addAnotherPharmacy ?? 'Add Another Pharmacy'}</Text>
              </Pressable>
            }
          />
        ) : null}
      </KeyboardAvoidingView>

      {/* Add Pharmacy Modal */}
      <AddPharmacyModal
        visible={showAddModal}
        colors={colors}
        se={se}
        onClose={() => setShowAddModal(false)}
        onSaved={reload}
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 80,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  addHeaderBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  preferredBadge: {
    backgroundColor: '#F59E0B18',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F59E0B40',
  },
  preferredBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
  viewBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 8,
  },
  pharmName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 2,
  },
  pharmDetail: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    padding: 8,
  },
  editBlock: {
    padding: 14,
    gap: 4,
  },
  editLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    lineHeight: 18,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  addEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 8,
  },
  addEmptyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  addListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addListBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // ── Modal ──────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    lineHeight: 20,
  },
  formHint: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  formHintText: {
    fontSize: 12,
    lineHeight: 17,
  },
  saveBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
