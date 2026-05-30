/**
 * MealIQHistoryCard
 * Displays all persisted Meal IQ analyses sorted by impact score (highest first).
 * Shown in the Records tab under a dedicated "Meal IQ History" section.
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { View, Text, FlatList, Pressable, Modal, ScrollView, StyleSheet, TouchableOpacity, LayoutAnimation, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import type { MealIQAnalysisRecord } from '@/lib/health/types';

const MEAL_IQ_HISTORY_KEY = 'meal-iq-history-expanded';

// ─── Impact Score Badge ───────────────────────────────────────────────────────

function ImpactBadge({ score }: { score: number | undefined }) {
  const _colors = useColors();
  const s = score ?? 0;
  const color = s >= 60 ? '#EF4444' : s >= 30 ? '#F59E0B' : '#10B981';
  const label = s >= 60 ? 'High' : s >= 30 ? 'Moderate' : 'Low';
  return (
    <View style={[badge.pill, { backgroundColor: color + '20' }]}>
      <Text style={[badge.text, { color }]}>{label} Impact</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  text: { fontSize: 11, fontWeight: '700' },
});

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function MealIQDetailModal({
  record,
  visible,
  onClose,
  onDelete,
}: {
  record: MealIQAnalysisRecord;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const s = detailStyles(colors);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[s.title, { color: colors.foreground }]}>{record.mealLabel}</Text>
            <Text style={[s.sub, { color: colors.muted }]}>
              {safeFormatDate(record.analyzedAt, 'en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <IconSymbol name="xmark" size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
          {/* Insight */}
          <View style={[s.insightCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
            <Text style={[s.insightLabel, { color: colors.primary }]}>🧠 Meal IQ Insight</Text>
            <Text style={[s.insightText, { color: colors.foreground }]}>{record.insight}</Text>
          </View>

          {/* Impact Grid */}
          <View style={s.grid}>
            <ImpactRow label="BP Impact" value={record.bpImpact} delta={record.bpDeltaSystolic != null ? `${record.bpDeltaSystolic > 0 ? '+' : ''}${record.bpDeltaSystolic} mmHg` : undefined} />
            <ImpactRow label="Heart Rate" value={record.hrImpact} />
            <ImpactRow label="Glucose" value={record.glucoseImpact} delta={record.glucoseDeltaMgDl != null ? `${record.glucoseDeltaMgDl > 0 ? '+' : ''}${record.glucoseDeltaMgDl} mg/dL` : undefined} />
            <ImpactRow label="Glycemic Load" value={record.glycemicLoad} />
            <ImpactRow label="Key Nutrient" value={record.keyNutrient} />
            {record.sodiumSensitive != null && (
              <ImpactRow label="Sodium Sensitive" value={record.sodiumSensitive ? 'Yes' : 'No'} />
            )}
            {record.naKRatio != null && (
              <ImpactRow label="Na:K Ratio" value={record.naKRatio.toFixed(2)} />
            )}
            {record.fiberCarbRatio != null && (
              <ImpactRow label="Fiber:Carb Ratio" value={record.fiberCarbRatio.toFixed(2)} />
            )}
          </View>

          {/* Recommendation */}
          <View style={[s.recCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.recLabel, { color: colors.muted }]}>RECOMMENDATION</Text>
            <Text style={[s.recText, { color: colors.foreground }]}>{record.recommendation}</Text>
          </View>

          {/* Disclaimer */}
          <Text style={[s.disclaimer, { color: colors.muted }]}>{record.disclaimer}</Text>

          {/* Delete */}
          <TouchableOpacity
            style={[s.deleteBtn, { borderColor: '#EF4444' + '40' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onDelete(record.id);
              onClose();
            }}
          >
            <IconSymbol name="trash" size={16} color="#EF4444" />
            <Text style={s.deleteBtnText}>Delete Analysis</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ImpactRow({ label, value, delta }: { label: string; value: string; delta?: string }) {
  const colors = useColors();
  return (
    <View style={[rowStyles.row, { borderBottomColor: colors.border }]}>
      <Text style={[rowStyles.label, { color: colors.muted }]}>{label}</Text>
      <View style={rowStyles.right}>
        <Text style={[rowStyles.value, { color: colors.foreground }]}>{value}</Text>
        {delta && <Text style={rowStyles.delta}>{delta}</Text>}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5 },
  label: { fontSize: 13, flex: 1 },
  right: { alignItems: 'flex-end' },
  value: { fontSize: 13, fontWeight: '600' },
  delta: { fontSize: 11, color: '#EF4444', marginTop: 1 },
});

const detailStyles = (_colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 0.5 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  closeBtn: { padding: 4 },
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  insightCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  insightLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  insightText: { fontSize: 14, lineHeight: 21 },
  grid: { gap: 0 },
  recCard: { padding: 14, borderRadius: 12, borderWidth: 0.5, gap: 6 },
  recLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  recText: { fontSize: 14, lineHeight: 21 },
  disclaimer: { fontSize: 11, lineHeight: 16, fontStyle: 'italic' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});

// ─── Main Component ───────────────────────────────────────────────────────────

interface MealIQHistoryCardProps {
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
}

export function MealIQHistoryCard({ defaultExpanded = false, overrideExpanded }: MealIQHistoryCardProps = {}) {
  const colors = useColors();
  const { state, deleteMealIQAnalysis } = useHealth();
  const [selected, setSelected] = useState<MealIQAnalysisRecord | null>(null);
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = overrideExpanded === false ? false : localExpanded;

  // Load persisted expanded state on mount
  useEffect(() => {
    AsyncStorage.getItem(MEAL_IQ_HISTORY_KEY).then(v => {
      if (v !== null) setLocalExpanded(v === 'true');
    }).catch(() => {});
  }, []);

  function handleToggle() {
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
      create: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setLocalExpanded(v => {
      const next = !v;
      safeSetItem(MEAL_IQ_HISTORY_KEY, String(next)).catch(() => {});
      return next;
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const analyses = [...(state.data?.mealIQAnalyses ?? [])]
    .sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0));

  const s = cardStyles(colors);

  if (analyses.length === 0) {
    return (
      <View style={[s.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconSymbol name="brain" size={28} color={colors.muted} />
        <Text style={[s.emptyTitle, { color: colors.foreground }]}>No Meal IQ Analyses Yet</Text>
        <Text style={[s.emptyText, { color: colors.muted }]}>
          Tap the 🧠 icon on any meal entry in your Sodium Log to generate a post-meal analysis.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.wrapper}>
      <Pressable style={s.headerRow} onPress={handleToggle}>
        <View style={s.headerLeft}>
          <IconSymbol name="brain" size={18} color={colors.primary} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Meal IQ History</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.headerCount, { color: colors.muted }]}>{analyses.length} analyses</Text>
          <IconSymbol
            name="chevron.right"
            size={14}
            color={colors.muted}
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
        </View>
      </Pressable>

      {/* Compact summary — shown when collapsed */}
      {!expanded && analyses.length > 0 && (
        <View style={[s.compactRow, { borderTopColor: colors.border }]}>
          <Text style={[s.compactText, { color: colors.muted }]}>
            {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'}
          </Text>
          <Text style={[s.compactDot, { color: colors.muted }]}> · </Text>
          <Text style={[s.compactText, { color: colors.muted }]} numberOfLines={1}>
            Last: {analyses[0]?.mealLabel ?? '—'}
          </Text>
          {analyses[0]?.impactScore != null && (
            <ImpactBadge score={analyses[0].impactScore} />
          )}
        </View>
      )}
      {expanded && <FlatList
        data={analyses}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={[s.separator, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelected(item);
            }}
            style={({ pressed }) => [s.row, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={s.rowLeft}>
              <Text style={[s.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.mealLabel}</Text>
              <Text style={[s.rowDate, { color: colors.muted }]}>
                {safeFormatDate(item.analyzedAt, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Text style={[s.rowInsight, { color: colors.muted }]} numberOfLines={2}>{item.insight}</Text>
            </View>
            <View style={s.rowRight}>
              <ImpactBadge score={item.impactScore} />
              {item.bpDeltaSystolic != null && (
                <Text style={[s.delta, { color: item.bpDeltaSystolic > 5 ? '#EF4444' : colors.muted }]}>
                  BP {item.bpDeltaSystolic > 0 ? '+' : ''}{item.bpDeltaSystolic} mmHg
                </Text>
              )}
              {item.glucoseDeltaMgDl != null && (
                <Text style={[s.delta, { color: item.glucoseDeltaMgDl > 20 ? '#F59E0B' : colors.muted }]}>
                  Gluc {item.glucoseDeltaMgDl > 0 ? '+' : ''}{item.glucoseDeltaMgDl} mg/dL
                </Text>
              )}
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </View>
          </Pressable>
        )}
      />}

      {selected && (
        <MealIQDetailModal
          record={selected}
          visible={!!selected}
          onClose={() => setSelected(null)}
          onDelete={(id) => {
            deleteMealIQAnalysis(id);
            setSelected(null);
          }}
        />
      )}
    </View>
  );
}

const cardStyles = (_colors: ReturnType<typeof useColors>) => StyleSheet.create({
  wrapper: { gap: 0 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerCount: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  rowLeft: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowDate: { fontSize: 12 },
  rowInsight: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4, minWidth: 90 },
  delta: { fontSize: 11, fontWeight: '600' },
  separator: { height: 0.5, marginLeft: 14 },
  emptyCard: { margin: 16, padding: 24, borderRadius: 16, borderWidth: 0.5, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  compactText: { fontSize: 12 },
  compactDot: { fontSize: 12 },
});
