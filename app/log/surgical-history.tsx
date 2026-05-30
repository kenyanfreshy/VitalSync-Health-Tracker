/**
 * Surgical History Screen
 * Manage a list of surgical procedures.
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useState, useCallback, useRef } from 'react';
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
import { parseProcedureTranscript } from '@/lib/scribe/parsers';
import type { SurgicalHistoryRecord, SurgicalHistoryType } from '@/lib/health/types';
import { CodePickerSheet } from '@/components/code-picker-sheet';
import { PrivacyBanner } from '@/components/privacy-banner';
import { DateTimePickerField } from '@/components/date-time-picker-field';
import { surgHistoryStrings } from '@/lib/i18n';
// DateTimePickerField used for Date of Surgery field
import { useDictationHistory } from '@/hooks/use-dictation-history';
import { useFieldFlash } from '@/hooks/use-field-flash';
import { DictationBox, type DictationBoxHandle } from '@/components/dictation-box';

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
/** Parse a free-text date string (e.g. "Jan 15 2024", "2024-01-15", "today") to YMD */
function parseDateText(text: string): string {
  if (!text.trim()) return dateToYmd(new Date());
  const lower = text.trim().toLowerCase();
  if (lower === 'today') return dateToYmd(new Date());
  if (lower === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); return dateToYmd(d); }
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return dateToYmd(parsed);
  return dateToYmd(new Date());
}
/** Format a YMD string to a human-readable display string */
function ymdToDisplay(ymd: string): string {
  if (!ymd) return '';
  const d = ymdToDate(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type AnesthesiaType = 'general' | 'regional' | 'local' | 'sedation';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  procedure: string;
  cptCode: string;
  surgeryDate: string;
  surgeryType: SurgicalHistoryType;
  surgeon: string;
  facility: string;
  anesthesia: AnesthesiaType | '';
  complications: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  procedure: '',
  cptCode: '',
  surgeryDate: '',
  surgeryType: 'elective',
  surgeon: '',
  facility: '',
  anesthesia: '',
  complications: '',
  notes: '',
};

// TYPE_OPTIONS and ANESTHESIA_OPTIONS are built inside the component to use translated labels.
type SurgStrKey = keyof typeof surgHistoryStrings.en;
const TYPE_OPTION_VALUES: { value: SurgicalHistoryType; color: string; key: SurgStrKey }[] = [
  { value: 'elective',       color: '#3B82F6', key: 'typeElective' },
  { value: 'emergency',      color: '#EF4444', key: 'typeEmergency' },
  { value: 'diagnostic',     color: '#8B5CF6', key: 'typeDiagnostic' },
  { value: 'reconstructive', color: '#F59E0B', key: 'typeReconstructive' },
  { value: 'other',          color: '#6B7280', key: 'typeCosmetic' },
];
const ANESTHESIA_OPTION_VALUES: { value: AnesthesiaType; key: SurgStrKey }[] = [
  { value: 'general',  key: 'anesthesiaGeneral' },
  { value: 'regional', key: 'anesthesiaRegional' },
  { value: 'local',    key: 'anesthesiaLocal' },
  { value: 'sedation', key: 'anesthesiaSedation' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SurgicalHistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const lang = useLang();
  const t = ((surgHistoryStrings as unknown as Record<string, typeof surgHistoryStrings.en>)[lang] ?? surgHistoryStrings.en);
  const TYPE_OPTIONS = TYPE_OPTION_VALUES.map(o => ({ ...o, label: t[o.key] as string }));
  const ANESTHESIA_OPTIONS = ANESTHESIA_OPTION_VALUES.map(o => ({ ...o, label: t[o.key] as string }));
  const { state, addSurgicalHistory, updateSurgicalHistory, deleteSurgicalHistory } = useHealth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = state.data?.surgicalHistory ?? [];

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showCptPicker, setShowCptPicker] = useState(false);
  const [showSurgeryDatePicker, setShowSurgeryDatePicker] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [dictationParsing, setDictationParsing] = useState(false);
  const dictationInputRef = useRef<DictationBoxHandle>(null);
  const { pushPhrase: pushSurgPhrase } = useDictationHistory('surgical-history');
  const SURG_FIELDS = ['procedure', 'surgeryDate', 'surgeryType', 'surgeon', 'facility', 'anesthesia', 'complications', 'notes'];
  const { flash: flashSurgFields } = useFieldFlash(SURG_FIELDS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scribeResult, setScribeResult] = useState<{ transcript: string; confidence: string; reasoning: string; filledCount: number; totalFields: number } | null>(null);
  const [scribeError, setScribeError] = useState<string | null>(null);

  const set = useCallback((key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  /** Apple Speech path: transcript → LLM parse */

  /** Audio-upload fallback (web / Android) */

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setScribeError(null);
    setScribeResult(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((record: SurgicalHistoryRecord) => {
    setForm({
      procedure: record.procedure,
      cptCode: record.cptCode ?? '',
      surgeryDate: record.surgeryDate ?? '',
      surgeryType: record.surgeryType,
      surgeon: record.surgeon ?? '',
      facility: record.facility ?? '',
      anesthesia: record.anesthesia ?? '',
      complications: record.complications ?? '',
      notes: record.notes ?? '',
    });
    setEditingId(record.id);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!form.procedure.trim()) {
      Alert.alert(t.missingField, t.missingProcedureMsg);
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      const existing = records.find(r => r.id === editingId);
      if (!existing) return;
      await updateSurgicalHistory({
        ...existing,
        procedure: form.procedure.trim(),
        cptCode: form.cptCode.trim() || undefined,
        surgeryDate: form.surgeryDate.trim() || undefined,
        surgeryType: form.surgeryType,
        surgeon: form.surgeon.trim() || undefined,
        facility: form.facility.trim() || undefined,
        anesthesia: (form.anesthesia as AnesthesiaType) || undefined,
        complications: form.complications.trim() || undefined,
        notes: form.notes.trim() || undefined,
        updatedAt: now,
        aiScribe: existing.aiScribe,
      });
    } else {
      await addSurgicalHistory({
        id: `sh-${Date.now()}`,
        procedure: form.procedure.trim(),
        cptCode: form.cptCode.trim() || undefined,
        surgeryDate: form.surgeryDate.trim() || undefined,
        surgeryType: form.surgeryType,
        surgeon: form.surgeon.trim() || undefined,
        facility: form.facility.trim() || undefined,
        anesthesia: (form.anesthesia as AnesthesiaType) || undefined,
        complications: form.complications.trim() || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,

      });
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeForm();
  }, [form, editingId, records, addSurgicalHistory, updateSurgicalHistory, closeForm]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t.deleteProcedure, t.deleteMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive', onPress: async () => {
          await deleteSurgicalHistory(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteSurgicalHistory]);

  // ── Render ────────────────────────────────────────────────────────────────

  const s = styles(colors);

  const renderRecord = ({ item }: { item: SurgicalHistoryRecord }) => {
    const typeOpt = TYPE_OPTIONS.find(o => o.value === item.surgeryType) ?? TYPE_OPTIONS[0];
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>{item.procedure}</Text>
            {item.cptCode ? <Text style={[s.cardSub, { color: colors.muted }]}>CPT: {item.cptCode}</Text> : null}
          </View>
          <View style={[s.typeBadge, { backgroundColor: typeOpt.color + '22' }]}>
            <Text style={[s.typeText, { color: typeOpt.color }]}>{typeOpt.label}</Text>
          </View>
        </View>
        {item.surgeryDate ? (
          <Text style={[s.cardMeta, { color: colors.muted }]}>Date: {item.surgeryDate}</Text>
        ) : null}
        {item.surgeon ? (
          <Text style={[s.cardMeta, { color: colors.muted }]}>{t.cardSurgeon}: {item.surgeon}</Text>
        ) : null}
        {item.facility ? (
          <Text style={[s.cardMeta, { color: colors.muted }]}>{t.cardFacility}: {item.facility}</Text>
        ) : null}
        {item.anesthesia ? (
          <Text style={[s.cardMeta, { color: colors.muted }]}>{t.cardAnesthesia}: {item.anesthesia}</Text>
        ) : null}
        {item.complications ? (
          <Text style={[s.cardNotes, { color: colors.warning }]} numberOfLines={2}>
            ⚠ {item.complications}
          </Text>
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
          <IconSymbol name="scissors" size={48} color={colors.muted} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t.noProceduresTitle}</Text>
          <Text style={[s.emptySub, { color: colors.muted }]}>
            {t.noProceduresSub}
          </Text>
          <Pressable
            style={({ pressed }) => [s.emptyBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={openAdd}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
            <Text style={s.emptyBtnText}>{t.addProcedure}</Text>
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
              <IconSymbol name="scissors" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>
                {editingId ? t.editProcedure : t.addProcedure}
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
            {/* ── Dictation Box ── */}
            <DictationBox
              ref={dictationInputRef}
              formKey="surgical-history"
              label={t.dictateLabel ?? '🔪  Dictate Surgical History'}
              placeholder={t.dictatePlaceholder ?? "Speak or type: 'Appendectomy in March 2018 at General Hospital…'"}
              value={dictationText}
              onChangeText={setDictationText}
              onSubmit={async () => {
                const text = dictationText.trim();
                if (!text) return;
                setDictationParsing(true);
                try {
                  const result = parseProcedureTranscript(text);
                  const filled: string[] = [];
                  if (result.procedure) { set('procedure', result.procedure); filled.push('procedure'); }
                  if (result.date) { set('surgeryDate', result.date); filled.push('surgeryDate'); }
                  if (result.surgeon) { set('surgeon', result.surgeon); filled.push('surgeon'); }
                  if (result.hospital) { set('facility', result.hospital); filled.push('facility'); }
                  if (result.complications) { set('complications', result.complications); filled.push('complications'); }
                  if (result.notes) { set('notes', result.notes); filled.push('notes'); }
                  pushSurgPhrase(text);
                  flashSurgFields(filled);
                  setScribeResult({ transcript: text, confidence: 'high', reasoning: `Parsed ${filled.length} field(s)`, filledCount: filled.length, totalFields: 8 });
                  setDictationText('');
                } catch (e: any) {
                  setScribeError(e?.message ?? 'Could not parse dictation. Please try again.');
                } finally {
                  setDictationParsing(false);
                }
              }}
              isParsing={dictationParsing}
              colors={colors}
            />
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
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>&ldquo;{scribeResult.transcript}&rdquo;</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{scribeResult.reasoning}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: 'italic' }}>Auto-filled — please review all fields before saving.</Text>             </View>
            )}
            {scribeError && (
              <View style={{ backgroundColor: colors.error + '18', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.error + '44' }}>
                <Text style={{ fontSize: 12, color: colors.error }}>{scribeError}</Text>
                <TouchableOpacity onPress={() => setScribeError(null)} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.error, fontWeight: '600' }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* ── Form Fields ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={[s.fieldLabel, { color: colors.muted, marginBottom: 0 }]}>{t.procedureLabel}</Text>
            </View>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.procedure}
              onChangeText={(v) => set('procedure', v)}
              placeholder="e.g. Appendectomy"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.cptLabel}</Text>
            <TouchableOpacity
              style={[s.input, s.codeRow, { backgroundColor: colors.surface, borderColor: form.cptCode ? colors.primary : colors.border }]}
              onPress={() => setShowCptPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={[{ flex: 1, fontSize: 15 }, form.cptCode ? { color: colors.foreground, fontWeight: '600' } : { color: colors.muted }]}>
                {form.cptCode || 'Search CPT code…'}
              </Text>
              <IconSymbol name="magnifyingglass" size={16} color={colors.primary} />
            </TouchableOpacity>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.dateLabel}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={form.surgeryDate ? ymdToDisplay(form.surgeryDate) : ''}
                onChangeText={v => set('surgeryDate', parseDateText(v))}
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
                    borderColor: showSurgeryDatePicker ? colors.primary : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  },
                ])}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSurgeryDatePicker(v => !v);
                }}
              >
                <IconSymbol name="calendar" size={20} color={showSurgeryDatePicker ? colors.primary : colors.muted} />
              </Pressable>
            </View>
            {showSurgeryDatePicker && (
              <DateTimePickerField
                label={t.dateLabel}
                value={form.surgeryDate ? ymdToDate(form.surgeryDate) : null}
                onChange={d => {
                  if (d) set('surgeryDate', dateToYmd(d));
                  setShowSurgeryDatePicker(false);
                }}
                mode="date"
                maximumDate={new Date()}
                optional
                inlineMode
              />
            )}

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.surgeryTypeLabel}</Text>
            <View style={s.chipRow}>
              {TYPE_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: form.surgeryType === opt.value ? opt.color : colors.surface,
                      borderColor: form.surgeryType === opt.value ? opt.color : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => {
                    set('surgeryType', opt.value);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[s.chipText, { color: form.surgeryType === opt.value ? '#fff' : colors.foreground }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.surgeonLabel}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.surgeon}
              onChangeText={v => set('surgeon', v)}
              placeholder="e.g. Dr. John Doe"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.facilityLabel}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.facility}
              onChangeText={v => set('facility', v)}
              placeholder="e.g. General Hospital"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.anesthesiaLabel}</Text>
            <View style={s.chipRow}>
              {ANESTHESIA_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: form.anesthesia === opt.value ? colors.primary : colors.surface,
                      borderColor: form.anesthesia === opt.value ? colors.primary : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => {
                    set('anesthesia', form.anesthesia === opt.value ? '' : opt.value);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[s.chipText, { color: form.anesthesia === opt.value ? '#fff' : colors.foreground }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: colors.muted }]}>{t.complicationsLabel}</Text>
            <TextInput
              style={[s.input, s.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.complications}
              onChangeText={v => set('complications', v)}
              placeholder="Any post-surgical complications"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
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
              <Text style={s.saveBtnText}>{editingId ? t.updateProcedure : t.saveProcedure}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* CPT Code Picker */}
      <CodePickerSheet
        visible={showCptPicker}
        mode="cpt"
        initialQuery={form.procedure}
        onSelect={(code, description) => {
          setForm(f => ({ ...f, cptCode: code, procedure: f.procedure || description }));
        }}
        onClose={() => setShowCptPicker(false)}
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
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  typeText: { fontSize: 11, fontWeight: '600' },
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
});
