/**
 * CodePickerSheet
 * Reusable bottom-sheet picker for ICD-10 and CPT code autocomplete.
 *
 * Usage:
 *   <CodePickerSheet
 *     visible={showPicker}
 *     mode="icd10"
 *     onSelect={(code, description) => { setCode(code); setCondition(description); }}
 *     onClose={() => setShowPicker(false)}
 *   />
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { searchIcd10, type Icd10Entry } from '@/lib/clinical/icd10-codes';
import { searchCpt, type CptEntry } from '@/lib/clinical/cpt-codes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CodePickerMode = 'icd10' | 'cpt';

interface CodePickerSheetProps {
  visible: boolean;
  mode: CodePickerMode;
  onSelect: (code: string, description: string, category: string) => void;
  onClose: () => void;
  /** Pre-fill the search box with this value when opened */
  initialQuery?: string;
}

type CodeEntry = Icd10Entry | CptEntry;

// ─── Category color map ───────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Cardiovascular: '#EF4444',
  Endocrine: '#F59E0B',
  Respiratory: '#3B82F6',
  Gastrointestinal: '#8B5CF6',
  Renal: '#06B6D4',
  Musculoskeletal: '#10B981',
  Neurological: '#6366F1',
  'Mental Health': '#EC4899',
  Oncology: '#F97316',
  Hematology: '#DC2626',
  'Infectious Disease': '#16A34A',
  Dermatology: '#D97706',
  Ophthalmology: '#0284C7',
  Gynecological: '#DB2777',
  Allergy: '#65A30D',
  Preventive: '#64748B',
  'Cardiac Surgery': '#EF4444',
  'Vascular Surgery': '#DC2626',
  'General Surgery': '#8B5CF6',
  'Orthopedic Surgery': '#10B981',
  Neurosurgery: '#6366F1',
  Urology: '#06B6D4',
  'OB/GYN': '#EC4899',
  'Thoracic Surgery': '#3B82F6',
  'Plastic Surgery': '#F59E0B',
  ENT: '#22C55E',
  'Endocrine Surgery': '#F97316',
  Radiology: '#64748B',
  'E&M': '#94A3B8',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#64748B';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodePickerSheet({
  visible,
  mode,
  onSelect,
  onClose,
  initialQuery = '',
}: CodePickerSheetProps) {
  const colors = useColors();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<TextInput>(null);

  const results = useMemo<CodeEntry[]>(() => {
    if (!query.trim()) return [];
    return mode === 'icd10' ? searchIcd10(query, 15) : searchCpt(query, 15);
  }, [query, mode]);

  const handleSelect = useCallback((entry: CodeEntry) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(entry.code, entry.description, entry.category);
    setQuery('');
    onClose();
  }, [onSelect, onClose]);

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const s = styles(colors);
  const title = mode === 'icd10' ? 'ICD-10 Code Lookup' : 'CPT Code Lookup';
  const placeholder = mode === 'icd10'
    ? 'Search condition, e.g. "hypertension" or "I10"'
    : 'Search procedure, e.g. "appendectomy" or "44950"';

  const renderItem = ({ item }: { item: CodeEntry }) => {
    const color = getCategoryColor(item.category);
    return (
      <TouchableOpacity
        style={[s.item, { borderBottomColor: colors.border }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <View style={[s.codeBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[s.codeText, { color }]}>{item.code}</Text>
        </View>
        <View style={s.itemBody}>
          <Text style={[s.itemDesc, { color: colors.foreground }]} numberOfLines={2}>
            {item.description}
          </Text>
          <Text style={[s.itemCat, { color }]}>{item.category}</Text>
        </View>
        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[s.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View style={[s.iconWrap, { backgroundColor: colors.primary + '22' }]}>
            <IconSymbol name="magnifyingglass" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[s.subtitle, { color: colors.muted }]}>
              {mode === 'icd10' ? 'ICD-10-CM 2024' : 'CPT 2024'}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [s.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={handleClose}
          >
            <IconSymbol name="xmark" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Search Input */}
        <View style={[s.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            ref={inputRef}
            style={[s.searchInput, { color: colors.foreground }]}
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && Platform.OS !== 'ios' ? (
            <Pressable onPress={() => setQuery('')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Results */}
        {query.trim().length === 0 ? (
          <View style={s.emptyState}>
            <IconSymbol name="magnifyingglass" size={40} color={colors.muted} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>
              {mode === 'icd10' ? 'Search conditions' : 'Search procedures'}
            </Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>
              {mode === 'icd10'
                ? 'Type a condition name (e.g. "diabetes") or ICD-10 code (e.g. "E11")'
                : 'Type a procedure name (e.g. "knee replacement") or CPT code (e.g. "27447")'}
            </Text>
          </View>
        ) : results.length === 0 ? (
          <View style={s.emptyState}>
            <IconSymbol name="exclamationmark.circle" size={40} color={colors.muted} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No results found</Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>
              Try a different keyword or enter the code manually in the form.
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.code}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (_c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 20, paddingBottom: 16, borderBottomWidth: 0.5, gap: 12,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, lineHeight: 20 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  codeBadge: {
    minWidth: 60, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, alignItems: 'center',
  },
  codeText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  itemBody: { flex: 1, gap: 2 },
  itemDesc: { fontSize: 14, lineHeight: 19 },
  itemCat: { fontSize: 11, fontWeight: '500' },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
