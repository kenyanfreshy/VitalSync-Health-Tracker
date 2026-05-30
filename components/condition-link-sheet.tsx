/**
 * ConditionLinkSheet
 *
 * A bottom sheet that lets the user link a lab result to one of their
 * Medical History conditions. Shows a searchable list of active conditions
 * with ICD-10 codes. Selecting one updates the lab result's linkedConditionId.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import type { LabResult } from '@/lib/health/lab-types';
import type { MedicalHistoryRecord } from '@/lib/health/types';

interface Props {
  visible: boolean;
  labResult: LabResult | null;
  onClose: () => void;
  onLinked: (updatedResult: LabResult) => void;
}

export function ConditionLinkSheet({ visible, labResult, onClose, onLinked }: Props) {
  const colors = useColors();
  const { state, updateLabResult } = useHealth();
  const [search, setSearch] = useState('');

  const conditions: MedicalHistoryRecord[] = useMemo(() => {
    return (state.data?.medicalHistory ?? []).filter(c => c.status !== 'resolved');
  }, [state.data?.medicalHistory]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return conditions;
    return conditions.filter(c =>
      c.condition.toLowerCase().includes(q) ||
      (c.icdCode ?? '').toLowerCase().includes(q)
    );
  }, [conditions, search]);

  const currentLinkedId = labResult?.linkedConditionId;

  const handleSelect = async (condition: MedicalHistoryRecord | null) => {
    if (!labResult) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated: LabResult = {
      ...labResult,
      linkedConditionId: condition?.id ?? undefined,
    };
    await updateLabResult(updated);
    onLinked(updated);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Link to Condition</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        </View>

        {/* Current link info */}
        {currentLinkedId && (
          <View style={[styles.currentLink, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
            <Text style={[styles.currentLinkLabel, { color: colors.primary }]}>
              Currently linked: {conditions.find(c => c.id === currentLinkedId)?.condition ?? 'Unknown'}
            </Text>
          </View>
        )}

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.searchIcon, { color: colors.muted }]}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search conditions..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="done"
          />
        </View>

        {/* Condition list */}
        {conditions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon]}>🩺</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No active conditions in Medical History.{'\n'}Add conditions first to link lab results.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            style={styles.list}
            ListHeaderComponent={
              currentLinkedId ? (
                <Pressable
                  style={[styles.conditionRow, styles.unlinkRow, { borderColor: colors.border }]}
                  onPress={() => handleSelect(null)}
                >
                  <Text style={[styles.unlinkText, { color: colors.error }]}>✕ Remove link</Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => {
              const isLinked = item.id === currentLinkedId;
              return (
                <Pressable
                  style={[
                    styles.conditionRow,
                    { borderColor: colors.border },
                    isLinked && { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}40` },
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.conditionInfo}>
                    <Text style={[styles.conditionName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.condition}
                    </Text>
                    {item.icdCode ? (
                      <Text style={[styles.conditionCode, { color: colors.muted }]}>{item.icdCode}</Text>
                    ) : null}
                  </View>
                  <View style={styles.conditionRight}>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: item.status === 'active' ? `${colors.success}20` : `${colors.warning}20` },
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: item.status === 'active' ? colors.success : colors.warning },
                      ]}>
                        {item.status}
                      </Text>
                    </View>
                    {isLinked && <Text style={[styles.linkedCheck, { color: colors.primary }]}>✓</Text>}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>No conditions match &quot;{search}&quot;</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    maxHeight: '70%',
    paddingBottom: 32,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
  },
  currentLink: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  currentLinkLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  unlinkRow: {
    justifyContent: 'center',
    marginBottom: 8,
  },
  unlinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  conditionInfo: {
    flex: 1,
    marginRight: 8,
  },
  conditionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  conditionCode: {
    fontSize: 12,
    marginTop: 2,
  },
  conditionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  linkedCheck: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
