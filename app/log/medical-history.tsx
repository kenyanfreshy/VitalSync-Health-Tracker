/**
 * Medical History Screen
 * Manage a list of medical conditions with ICD-10 codes, status, and treating physician.
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useState, useCallback, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { trpc } from '@/lib/trpc';
import { parseMedicalHistoryTranscript } from '@/lib/scribe/parsers';
import type { MedicalHistoryRecord, MedicalHistoryStatus } from '@/lib/health/types';
import { CodePickerSheet } from '@/components/code-picker-sheet';
import { PrivacyBanner } from '@/components/privacy-banner';
import { DateTimePickerField } from '@/components/date-time-picker-field';
import { medHistoryStrings } from '@/lib/i18n';
// DateTimePickerField used for Date Diagnosed field
import { useDictationHistory } from '@/hooks/use-dictation-history';
import { useFieldFlash } from '@/hooks/use-field-flash';
import { type DictationBoxHandle } from '@/components/dictation-box';

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
function parseDateText(text: string): string {
  if (!text.trim()) return '';
  const lower = text.trim().toLowerCase();
  if (lower === 'today') return dateToYmd(new Date());
  if (lower === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); return dateToYmd(d); }
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return dateToYmd(parsed);
  return text; // keep raw if unparseable
}
function ymdToDisplay(ymd: string): string {
  if (!ymd) return '';
  const d = ymdToDate(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  condition: string;
  icdCode: string;
  diagnosedDate: string;
  status: MedicalHistoryStatus;
  treatingPhysician: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  condition: '',
  icdCode: '',
  diagnosedDate: '',
  status: 'active',
  treatingPhysician: '',
  notes: '',
};

const STATUS_OPTION_DEFS: { value: MedicalHistoryStatus; color: string }[] = [
  { value: 'active', color: '#EF4444' },
  { value: 'chronic', color: '#F59E0B' },
  { value: 'in_remission', color: '#3B82F6' },
  { value: 'resolved', color: '#22C55E' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MedicalHistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const t = ((medHistoryStrings as unknown as Record<string, typeof medHistoryStrings.en>)[lang] ?? medHistoryStrings.en);
  const { state, addMedicalHistory, updateMedicalHistory, deleteMedicalHistory } = useHealth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records: MedicalHistoryRecord[] = state.data?.medicalHistory ?? [];

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showIcdPicker, setShowIcdPicker] = useState(false);
  const [showDiagnosedDatePicker, setShowDiagnosedDatePicker] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [dictationParsing, setDictationParsing] = useState(false);
  const dictationInputRef = useRef<DictationBoxHandle>(null);
  const { pushPhrase: pushMedHistPhrase } = useDictationHistory('medical-history');
  const MED_HIST_FIELDS = ['condition', 'icdCode', 'diagnosedDate', 'status', 'treatingPhysician', 'notes'];
  const { flash: flashMedHistFields } = useFieldFlash(MED_HIST_FIELDS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scribeResult, setScribeResult] = useState<{ transcript: string; confidence: string; reasoning: string; filledCount: number; totalFields: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scribeError, setScribeError] = useState<string | null>(null);

  const STATUS_OPTIONS = STATUS_OPTION_DEFS.map(o => ({
    ...o,
    label: o.value === 'active' ? (t.statusActive ?? 'Active')
         : o.value === 'chronic' ? (t.statusChronic ?? 'Chronic')
         : o.value === 'in_remission' ? (t.statusInRemission ?? 'In Remission')
         : (t.statusResolved ?? 'Resolved'),
  }));

  const set = useCallback((key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  /** Dictation text submit: parse transcript locally and fill form fields */
  const handleDictationSubmit = useCallback(() => {
    const text = dictationText.trim();
    if (!text) return;
    setDictationParsing(true);
    setScribeError(null);
    setScribeResult(null);
    try {
      const result = parseMedicalHistoryTranscript(text);
      const filled: string[] = [];
      if (result.condition) { set('condition', result.condition); filled.push('condition'); }
      if (result.diagnosedDate) { set('diagnosedDate', result.diagnosedDate); filled.push('diagnosedDate'); }
      if (result.status) { set('status', result.status as MedicalHistoryStatus); filled.push('status'); }
      if (result.treatedBy) { set('treatingPhysician', result.treatedBy); filled.push('treatingPhysician'); }
      if (result.notes) { set('notes', result.notes); filled.push('notes'); }
      setScribeResult({
        transcript: text,
        confidence: filled.length > 0 ? 'high' : 'low',
        reasoning: `Parsed ${filled.length} field(s) from transcript`,
        filledCount: filled.length,
        totalFields: 6,
      });
      pushMedHistPhrase(text);
      flashMedHistFields(filled);
      setDictationText('');
    } catch (_err: any) {
      setScribeError('Could not parse medical history. Please check your input and try again.');
    } finally {
      setDictationParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationText, set]);

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setScribeError(null);
    setScribeResult(null);
    setDictationText('');
    setShowForm(true);
  }, []);

  const openEdit = useCallback((record: MedicalHistoryRecord) => {
    setForm({
      condition: record.condition,
      icdCode: record.icdCode ?? '',
      diagnosedDate: record.diagnosedDate ?? '',
      status: record.status,
      treatingPhysician: record.treatingPhysician ?? '',
      notes: record.notes ?? '',
    });
    setEditingId(record.id);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    // Reset form and scribe state so the next openAdd() starts clean
    setForm(EMPTY_FORM);
    setScribeError(null);
    setScribeResult(null);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!form.condition.trim()) {
      Alert.alert(t.missingField, t.missingConditionMsg);
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      const existing = records.find(r => r.id === editingId);
      if (!existing) return;
      await updateMedicalHistory({
        ...existing,
        condition: form.condition.trim(),
        icdCode: form.icdCode.trim() || undefined,
        diagnosedDate: form.diagnosedDate.trim() || undefined,
        status: form.status,
        treatingPhysician: form.treatingPhysician.trim() || undefined,
        notes: form.notes.trim() || undefined,
        updatedAt: now,
        aiScribe: existing.aiScribe,
      });
    } else {
      await addMedicalHistory({
        id: `mh-${Date.now()}`,
        condition: form.condition.trim(),
        icdCode: form.icdCode.trim() || undefined,
        diagnosedDate: form.diagnosedDate.trim() || undefined,
        status: form.status,
        treatingPhysician: form.treatingPhysician.trim() || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeForm();
  }, [form, editingId, records, addMedicalHistory, updateMedicalHistory, closeForm]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t.deleteCondition, t.deleteMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive', onPress: async () => {
          await deleteMedicalHistory(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteMedicalHistory]);

  // ── Render ────────────────────────────────────────────────────────────────

  const s = styles(colors);

  const renderRecord = ({ item }: { item: MedicalHistoryRecord }) => {
    const statusOpt = STATUS_OPTIONS.find(o => o.value === item.status) ?? STATUS_OPTIONS[0];
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>{item.condition}</Text>
            {item.icdCode ? <Text style={[s.cardSub, { color: colors.muted }]}>ICD-10: {item.icdCode}</Text> : null}
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusOpt.color + '22' }]}>
            <Text style={[s.statusText, { color: statusOpt.color }]}>{statusOpt.label}</Text>
          </View>
        </View>
        {item.diagnosedDate ? (
          <Text style={[s.cardMeta, { color: colors.muted }]}>Diagnosed: {item.diagnosedDate}</Text>
        ) : null}
        {item.treatingPhysician ? (
          <Text style={[s.cardMeta, { color: colors.muted }]}>Physician: {item.treatingPhysician}</Text>
        ) : null}
        {item.notes ? (
          <Text style={[s.cardNotes, { color: colors.muted }]} numberOfLines={2}>{item.notes}</Text>
        ) : null}
        {item.aiScribe ? (
          <View style={s.aiTag}>
            <IconSymbol name="sparkles" size={12} color={colors.primary} />
            <Text style={[s.aiTagText, { color: colors.primary }]}>{t.voiceEntry}</Text>
          </View>
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

      {/* List */}
      {records.length === 0 ? (
        <View style={s.empty}>
          <IconSymbol name="stethoscope" size={48} color={colors.muted} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t.noConditionsTitle}</Text>
          <Text style={[s.emptySub, { color: colors.muted }]}>
            {t.noConditionsSub}
          </Text>
          <Pressable
            style={({ pressed }) => [s.emptyBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={openAdd}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
            <Text style={s.emptyBtnText}>{t.addCondition}</Text>
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
            <View style={[s.modalIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="stethoscope" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>
                {editingId ? t.editCondition : t.addCondition}
              </Text>
              <Text style={[s.modalSub, { color: colors.muted }]}>{t.title}</Text>
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
            {/* ── Dictate Button ── */}
            <TouchableOpacity
              style={[s.dictateBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setTimeout(() => dictationInputRef.current?.focus(), 80); }}
              activeOpacity={0.8}
            >
              <Text style={s.dictateBtnText}>{t.voiceEntry ? `🎤  ${t.voiceEntry}` : '🎤  Dictate'}</Text>
            </TouchableOpacity>

            {/* ── Dictation Text Box ── */}
            <View style={[s.dictationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.dictationCardHeader}>
                <Text style={[s.dictationCardLabel, { color: colors.muted }]}>🩺  {(t.dictateLabel ?? t.title ?? 'Medical History').toUpperCase()}</Text>
                <Text style={[s.dictationCardHint, { color: colors.muted }]}>Tap field → tap mic on keyboard</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <TextInput
                  // @ts-ignore
                  ref={dictationInputRef}
                  style={[s.dictationInput, { color: colors.foreground }]}
                  value={dictationText}
                  onChangeText={setDictationText}
                  placeholder={t.dictatePlaceholder ?? "Type: 'Type 2 Diabetes, noted January 2020, currently on Metformin…'"}
                  placeholderTextColor={colors.muted}
                  multiline
                  returnKeyType="done"
                  blurOnSubmit={false}
                />
                {dictationText.trim().length > 0 && (
                  <TouchableOpacity
                    style={[s.dictationSendBtn, { backgroundColor: colors.primary }]}
                    onPress={handleDictationSubmit}
                    activeOpacity={0.8}
                  >
                    {dictationParsing
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Fill Form →</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {(false || false) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.muted }}>Transcribing medical history…</Text>
              </View>
            )}
            {scribeResult && (
              <View style={{ backgroundColor: colors.primary + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.primary + '44' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>✓ Scribe result · {scribeResult.confidence} confidence</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>Filled {scribeResult.filledCount}/{scribeResult.totalFields}</Text>
                    <TouchableOpacity onPress={() => { setScribeResult(null); setScribeError(null); }}>
                      <Text style={{ fontSize: 11, color: colors.primary }}>🍎 Try again</Text>
                    </TouchableOpacity>
                  </View>
                </View>                <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>&ldquo;{scribeResult.transcript}&rdquo;</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{scribeResult.reasoning}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>Auto-filled — please review all fields before saving.</Text>              </View>
            )}

            {/* ── Form Fields ── */}
            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.conditionLabel}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.condition}
              onChangeText={(v) => set('condition', v)}
              placeholder="e.g. Type 2 Diabetes Mellitus"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.icdLabel}</Text>
            <TouchableOpacity
              style={[s.input, s.codeRow, { backgroundColor: colors.surface, borderColor: form.icdCode ? colors.primary : colors.border }]}
              onPress={() => setShowIcdPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={[{ flex: 1, fontSize: 15 }, form.icdCode ? { color: colors.foreground, fontWeight: '600' } : { color: colors.muted }]}>
                {form.icdCode || 'Search ICD-10 code…'}
              </Text>
              <IconSymbol name="magnifyingglass" size={16} color={colors.primary} />
            </TouchableOpacity>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.statusLabel}</Text>
            <View style={s.chipRow}>
              {STATUS_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: form.status === opt.value ? opt.color : colors.surface,
                      borderColor: form.status === opt.value ? opt.color : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => {
                    set('status', opt.value);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[s.chipText, { color: form.status === opt.value ? '#fff' : colors.foreground }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.diagnosedLabel}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={form.diagnosedDate ? ymdToDisplay(form.diagnosedDate) : ''}
                onChangeText={v => set('diagnosedDate', parseDateText(v))}
                placeholder={`e.g. ${safeFormatDate(Date.now(), 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />
              <Pressable
                style={({ pressed }) => ([
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: showDiagnosedDatePicker ? colors.primary : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  },
                ])}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDiagnosedDatePicker(v => !v);
                }}
              >
                <IconSymbol name="calendar" size={20} color={showDiagnosedDatePicker ? colors.primary : colors.muted} />
              </Pressable>
            </View>
            {showDiagnosedDatePicker && (
              <DateTimePickerField
                label={t.diagnosedLabel}
                value={form.diagnosedDate ? ymdToDate(form.diagnosedDate) : null}
                onChange={d => {
                  if (d) set('diagnosedDate', dateToYmd(d));
                  setShowDiagnosedDatePicker(false);
                }}
                mode="date"
                maximumDate={new Date()}
                optional
                inlineMode
              />
            )}

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.physicianLabel}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.treatingPhysician}
              onChangeText={v => set('treatingPhysician', v)}
              placeholder="e.g. Dr. Jane Smith"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.notesLabel}</Text>
            <TextInput
              style={[s.input, s.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.notes}
              onChangeText={v => set('notes', v)}
              placeholder="Additional personal notes or context"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              blurOnSubmit={false}
            />            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Text style={s.saveBtnText}>{editingId ? t.updateCondition : t.saveCondition}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ICD-10 Code Picker */}
      <CodePickerSheet
        visible={showIcdPicker}
        mode="icd10"
        initialQuery={form.condition}
        onSelect={(code, description) => {
          setForm(f => ({ ...f, icdCode: code, condition: f.condition || description }));
        }}
        onClose={() => setShowIcdPicker(false)}
      />
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
  headerSub: { fontSize: 12, marginTop: 1 },
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
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardMeta: { fontSize: 12, marginBottom: 2 },
  cardNotes: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  aiTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  aiTagText: { fontSize: 11, fontWeight: '500' },
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
  codeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
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
  dictateBtn: {
    borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12,
  },
  dictateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dictationCard: {
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  dictationCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
  },
  dictationCardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dictationCardHint: { fontSize: 11 },
  dictationInput: {
    flex: 1, minHeight: 56, fontSize: 14, lineHeight: 20,
  },
  dictationSendBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
});
