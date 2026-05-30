/**
 * ConditionTimelineCard
 * Dashboard card showing a chronological list of active medical conditions
 * and recent surgical procedures. Tapping navigates to the respective log screen.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { MedicalHistoryRecord, SurgicalHistoryRecord } from '@/lib/health/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConditionTimelineCardProps {
  medicalHistory: MedicalHistoryRecord[];
  surgicalHistory: SurgicalHistoryRecord[];
}

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: '#EF4444',
  chronic: '#F59E0B',
  in_remission: '#3B82F6',
  resolved: '#10B981',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  chronic: 'Chronic',
  in_remission: 'In Remission',
  resolved: 'Resolved',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr: string | undefined): string {
  const d = parseDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConditionTimelineCard({
  medicalHistory,
  surgicalHistory,
}: ConditionTimelineCardProps) {
  const colors = useColors();
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  // Merge and sort all events by date (most recent first)
  type TimelineEvent =
    | { kind: 'condition'; record: MedicalHistoryRecord; date: Date | null }
    | { kind: 'surgery'; record: SurgicalHistoryRecord; date: Date | null };

  const events: TimelineEvent[] = [
    ...medicalHistory.map(r => ({
      kind: 'condition' as const,
      record: r,
      date: parseDate(r.diagnosedDate),
    })),
    ...surgicalHistory.map(r => ({
      kind: 'surgery' as const,
      record: r,
      date: parseDate(r.surgeryDate),
    })),
  ].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.getTime() - a.date.getTime();
  });

  const hasData = events.length > 0;
  const activeCount = medicalHistory.filter(r => r.status === 'active' || r.status === 'chronic').length;
  const surgeryCount = surgicalHistory.length;

  const s = styles(colors);

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(e => !e);
  };

  const navigateTo = (path: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as never);
  };

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <Pressable
        style={({ pressed }) => [s.header, { opacity: pressed ? 0.8 : 1 }]}
        onPress={handlePress}
      >
        <View style={[s.iconWrap, { backgroundColor: '#6366F1' + '22' }]}>
          <IconSymbol name="timeline.selection" size={20} color="#6366F1" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.foreground }]}>Personal Timeline</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>
            {activeCount > 0 ? `${activeCount} active condition${activeCount !== 1 ? 's' : ''}` : 'No active conditions'}
            {surgeryCount > 0 ? ` · ${surgeryCount} procedure${surgeryCount !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        <View style={s.headerRight}>
          {activeCount > 0 ? (
            <View style={[s.badge, { backgroundColor: '#EF4444' + '22' }]}>
              <Text style={[s.badgeText, { color: '#EF4444' }]}>{activeCount}</Text>
            </View>
          ) : null}
          <IconSymbol
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={16}
            color={colors.muted}
          />
        </View>
      </Pressable>

      {expanded ? (
        <>
          {!hasData ? (
            <View style={s.empty}>
              <Text style={[s.emptyText, { color: colors.muted }]}>
                No conditions or procedures recorded yet.
              </Text>
              <View style={s.emptyActions}>
                <TouchableOpacity
                  style={[s.emptyBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
                  onPress={() => navigateTo('/log/medical-history')}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="stethoscope" size={14} color={colors.primary} />
                  <Text style={[s.emptyBtnText, { color: colors.primary }]}>Add Condition</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.emptyBtn, { backgroundColor: '#8B5CF6' + '18', borderColor: '#8B5CF6' + '44' }]}
                  onPress={() => navigateTo('/log/surgical-history')}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="scissors" size={14} color="#8B5CF6" />
                  <Text style={[s.emptyBtnText, { color: '#8B5CF6' }]}>Add Procedure</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={s.timeline}>
              {events.map((event, index) => {
                const isLast = index === events.length - 1;

                if (event.kind === 'condition') {
                  const r = event.record;
                  const statusColor = STATUS_COLORS[r.status] ?? '#64748B';
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.row, !isLast && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
                      onPress={() => navigateTo('/log/medical-history')}
                      activeOpacity={0.7}
                    >
                      <View style={s.timelineDot}>
                        <View style={[s.dot, { backgroundColor: statusColor }]} />
                        {!isLast ? <View style={[s.line, { backgroundColor: colors.border }]} /> : null}
                      </View>
                      <View style={s.rowContent}>
                        <View style={s.rowHeader}>
                          <View style={[s.kindBadge, { backgroundColor: '#6366F1' + '18' }]}>
                            <IconSymbol name="stethoscope" size={11} color="#6366F1" />
                            <Text style={[s.kindText, { color: '#6366F1' }]}>Condition</Text>
                          </View>
                          {event.date ? (
                            <Text style={[s.dateText, { color: colors.muted }]}>
                              {formatDate(r.diagnosedDate)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[s.rowTitle, { color: colors.foreground }]}>{r.condition}</Text>
                        <View style={s.rowMeta}>
                          {r.icdCode ? (
                            <Text style={[s.codeTag, { color: colors.muted, borderColor: colors.border }]}>
                              {r.icdCode}
                            </Text>
                          ) : null}
                          <View style={[s.statusChip, { backgroundColor: statusColor + '18' }]}>
                            <Text style={[s.statusText, { color: statusColor }]}>
                              {STATUS_LABELS[r.status] ?? r.status}
                            </Text>
                          </View>
                        </View>
                        {r.treatingPhysician ? (
                          <Text style={[s.physicianText, { color: colors.muted }]}>
                            Dr. {r.treatingPhysician}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                } else {
                  const r = event.record;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.row, !isLast && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
                      onPress={() => navigateTo('/log/surgical-history')}
                      activeOpacity={0.7}
                    >
                      <View style={s.timelineDot}>
                        <View style={[s.dot, { backgroundColor: '#8B5CF6' }]} />
                        {!isLast ? <View style={[s.line, { backgroundColor: colors.border }]} /> : null}
                      </View>
                      <View style={s.rowContent}>
                        <View style={s.rowHeader}>
                          <View style={[s.kindBadge, { backgroundColor: '#8B5CF6' + '18' }]}>
                            <IconSymbol name="scissors" size={11} color="#8B5CF6" />
                            <Text style={[s.kindText, { color: '#8B5CF6' }]}>Surgery</Text>
                          </View>
                          {event.date ? (
                            <Text style={[s.dateText, { color: colors.muted }]}>
                              {formatDate(r.surgeryDate)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[s.rowTitle, { color: colors.foreground }]}>{r.procedure}</Text>
                        <View style={s.rowMeta}>
                          {r.cptCode ? (
                            <Text style={[s.codeTag, { color: colors.muted, borderColor: colors.border }]}>
                              CPT {r.cptCode}
                            </Text>
                          ) : null}
                          {r.facility ? (
                            <Text style={[s.facilityText, { color: colors.muted }]}>{r.facility}</Text>
                          ) : null}
                        </View>
                        {r.surgeon ? (
                          <Text style={[s.physicianText, { color: colors.muted }]}>
                            Dr. {r.surgeon}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }
              })}

              {/* Footer actions */}
              <View style={[s.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[s.footerBtn, { backgroundColor: colors.primary + '18' }]}
                  onPress={() => navigateTo('/log/medical-history')}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="plus" size={13} color={colors.primary} />
                  <Text style={[s.footerBtnText, { color: colors.primary }]}>Condition</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.footerBtn, { backgroundColor: '#8B5CF6' + '18' }]}
                  onPress={() => navigateTo('/log/surgical-history')}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="plus" size={13} color="#8B5CF6" />
                  <Text style={[s.footerBtnText, { color: '#8B5CF6' }]}>Procedure</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (_c: ReturnType<typeof useColors>) => StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 0.5, marginHorizontal: 16, marginBottom: 12, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: { padding: 16, paddingTop: 0, gap: 12 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '600' },
  timeline: {},
  row: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  timelineDot: { alignItems: 'center', width: 12, paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: 1 },
  rowContent: { flex: 1, gap: 4 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kindBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  kindText: { fontSize: 10, fontWeight: '600' },
  dateText: { fontSize: 11 },
  rowTitle: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  codeTag: {
    fontSize: 11, borderWidth: 0.5, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  statusChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '500' },
  facilityText: { fontSize: 11 },
  physicianText: { fontSize: 11 },
  footer: {
    flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 0.5,
  },
  footerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 8,
  },
  footerBtnText: { fontSize: 13, fontWeight: '600' },
});
