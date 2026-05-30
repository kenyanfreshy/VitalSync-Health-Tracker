/**
 * Batch Scribe Review Screen
 *
 * Shown when the Smart Scribe detects multiple vaccines in a single recording.
 * Each vaccine is displayed as a card with:
 *  - Confidence badge (high / medium / low)
 *  - Editable fields (name, date, dose, manufacturer, lot, site, route)
 *  - Individual dismiss (×) button
 *  - "Save Selected" action bar at the bottom
 *
 * Navigation params (passed via AsyncStorage key BATCH_SCRIBE_KEY):
 *   Array of scribe vaccine objects from parseImmunizationVoice
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureGetItem } from '@/lib/storage/health-storage';
import * as Haptics from 'expo-haptics';

import { ScreenContainer } from '@/components/screen-container';
import { useColors, useLang } from '@/hooks';
import { immunScreenStrings } from '@/lib/i18n';
import { useHealth } from '@/lib/health/health-context';
import type { ImmunizationRecord, ImmunizationRoute, ImmunizationSite } from '@/lib/health/types';
import { scheduleImmunizationNotifications } from '@/lib/health/immunization-notifications';

// ─── Storage key (written by immunizations.tsx before navigating here) ────────
export const BATCH_SCRIBE_KEY = '@vsht:batch_scribe_pending';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ScribeVaccine {
  vaccineName: string | null;
  vaccineType: string | null;
  manufacturer: string | null;
  lotNumber: string | null;
  dateAdministered: string | null;
  doseNumber: number | null;
  seriesTotal: number | null;
  nextDoseDate: string | null;
  administeredBy: string | null;
  site: string | null;
  route: string | null;
  reactions: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  filledCount: number;
  totalFields: number;
}

interface ReviewEntry {
  id: string;
  vaccine: ScribeVaccine;
  selected: boolean;
  /** Editable overrides */
  editName: string;
  editDate: string;
  editManufacturer: string;
  editLot: string;
  editDose: string;
  expanded: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CONFIDENCE_COLORS = {
  high:   { bg: '#DCFCE7', text: '#16A34A' },
  medium: { bg: '#FEF3C7', text: '#D97706' },
  low:    { bg: '#FEE2E2', text: '#DC2626' },
};

function formatDisplayDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_unused) {
    return iso;
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function BatchScribeReviewScreen() {
  const _bsLang = useLang();
  const iS = (immunScreenStrings as unknown as Record<string, typeof immunScreenStrings.en>)[_bsLang] ?? immunScreenStrings.en;
  const router = useRouter();
  const colors = useColors();
  const isDark = colors.background === '#151718' || colors.background === '#0D1117';
  const { addImmunization } = useHealth();

  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load vaccines from AsyncStorage
  useEffect(() => {
    secureGetItem(BATCH_SCRIBE_KEY).then(raw => {
      if (!raw) { router.back(); return; }
      try {
        const vaccines: ScribeVaccine[] = JSON.parse(raw);
        setEntries(vaccines.map((v, i) => ({
          id: `entry-${i}-${Date.now()}`,
          vaccine: v,
          selected: true,
          editName: v.vaccineName ?? '',
          editDate: v.dateAdministered ?? new Date().toISOString().slice(0, 10),
          editManufacturer: v.manufacturer ?? '',
          editLot: v.lotNumber ?? '',
          editDose: v.doseNumber != null ? String(v.doseNumber) : '',
          expanded: false,
        })));
      } catch (_unused) {
        router.back();
      }
    }).catch(() => router.back()).finally(() => setLoading(false));
  }, [router]);

  const toggleSelect = useCallback((id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, selected: !e.selected } : e));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e));
  }, []);

  const dismiss = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const updateField = useCallback((id: string, field: keyof Pick<ReviewEntry, 'editName' | 'editDate' | 'editManufacturer' | 'editLot' | 'editDose'>, value: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }, []);

  const selectedCount = entries.filter(e => e.selected).length;

  const handleSaveSelected = useCallback(async () => {
    const toSave = entries.filter(e => e.selected);
    if (toSave.length === 0) {
      Alert.alert('No vaccines selected', 'Select at least one vaccine to save.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const routeMap: Record<string, ImmunizationRoute> = {
        intramuscular: 'intramuscular', subcutaneous: 'subcutaneous',
        oral: 'oral', intranasal: 'intranasal', intradermal: 'intradermal', other: 'other',
      };
      const siteMap: Record<string, ImmunizationSite> = {
        left_arm: 'left_arm', right_arm: 'right_arm',
        left_thigh: 'left_thigh', right_thigh: 'right_thigh', other: 'other',
      };
      for (const entry of toSave) {
        const v = entry.vaccine;
        const record: ImmunizationRecord = {
          id: `imm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          vaccineName: entry.editName.trim() || v.vaccineName || (iS.unknownVaccineLabel ?? 'Unknown Vaccine'),
          vaccineType: v.vaccineType ?? undefined,
          manufacturer: entry.editManufacturer.trim() || undefined,
          lotNumber: entry.editLot.trim() || undefined,
          dateAdministered: entry.editDate || now.slice(0, 10),
          doseNumber: entry.editDose ? parseInt(entry.editDose, 10) || undefined : v.doseNumber ?? undefined,
          seriesTotal: v.seriesTotal ?? undefined,
          nextDoseDate: v.nextDoseDate ?? undefined,
          administeredBy: v.administeredBy ?? undefined,
          site: siteMap[v.site ?? ''] ?? undefined,
          route: routeMap[v.route ?? ''] ?? undefined,
          reactions: v.reactions ?? undefined,
          notes: v.notes ?? undefined,
          createdAt: now,
          aiScribe: {
            transcript: '',
            confidence: v.confidence,
            reasoning: v.reasoning,
            filledCount: v.filledCount,
            totalFields: v.totalFields,
          },
        };
        await addImmunization(record);
        scheduleImmunizationNotifications(record).catch(() => {});
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await AsyncStorage.removeItem(BATCH_SCRIBE_KEY);
      Alert.alert(
        (iS.saveBtn ?? 'Saved'),
        `${toSave.length} vaccine${toSave.length > 1 ? 's' : ''} added to your immunization record.`,
        [{ text: (iS.saveBtn ?? 'Done'), onPress: () => router.back() }],
      );
    } catch (_unused) {
      Alert.alert('Error', 'Could not save records. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [entries, addImmunization, router]);

  const handleCancel = useCallback(async () => {
    await AsyncStorage.removeItem(BATCH_SCRIBE_KEY);
    router.back();
  }, [router]);

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading vaccines…</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Review Vaccines</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            {entries.length} detected · {selectedCount} selected
          </Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {/* ── Instruction banner ─────────────────────────────────────────── */}
      <View style={[styles.banner, { backgroundColor: isDark ? '#1E3A4A' : '#EFF8FF', borderColor: isDark ? '#2D5A72' : '#BAE6FD' }]}>
        <Text style={[styles.bannerText, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
          Review each Smart-detected vaccine. Tap a card to edit details, tap ✓ to select/deselect, or × to remove it from this batch.
        </Text>
      </View>

      {/* ── Vaccine cards ──────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {entries.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>💉</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>All vaccines dismissed</Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.emptyBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {entries.map((entry) => {
          const conf = CONFIDENCE_COLORS[entry.vaccine.confidence] ?? CONFIDENCE_COLORS.low;
          return (
            <View
              key={entry.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: entry.selected ? colors.primary : colors.border,
                  borderWidth: entry.selected ? 1.5 : StyleSheet.hairlineWidth,
                  opacity: entry.selected ? 1 : 0.55,
                },
              ]}
            >
              {/* Card header row */}
              <View style={styles.cardHeader}>
                {/* Select toggle */}
                <TouchableOpacity
                  onPress={() => toggleSelect(entry.id)}
                  style={[
                    styles.selectCircle,
                    {
                      backgroundColor: entry.selected ? colors.primary : 'transparent',
                      borderColor: entry.selected ? colors.primary : colors.muted,
                    },
                  ]}
                  accessibilityLabel={entry.selected ? (iS.deleteVaccineLabel ?? 'Deselect vaccine') : (iS.vaccineNameLabel ?? 'Select vaccine')}
                >
                  {entry.selected && <Text style={styles.selectCheck}>✓</Text>}
                </TouchableOpacity>

                {/* Name + confidence */}
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                    {entry.editName || entry.vaccine.vaccineName || (iS.unknownVaccineLabel ?? 'Unknown Vaccine')}
                  </Text>
                  {entry.vaccine.vaccineType && (
                    <Text style={[styles.cardSubtype, { color: colors.muted }]}>{entry.vaccine.vaccineType}</Text>
                  )}
                </View>

                <View style={[styles.confBadge, { backgroundColor: conf.bg }]}>
                  <Text style={[styles.confText, { color: conf.text }]}>
                    {entry.vaccine.confidence.toUpperCase()}
                  </Text>
                </View>

                {/* Dismiss */}
                <TouchableOpacity
                  onPress={() => dismiss(entry.id)}
                  style={styles.dismissBtn}
                  accessibilityLabel={iS.deleteVaccineLabel ?? "Remove vaccine from batch"}
                >
                  <Text style={[styles.dismissText, { color: colors.error }]}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Quick info row */}
              <View style={styles.quickRow}>
                {entry.editDate ? (
                  <Text style={[styles.quickChip, { color: colors.muted }]}>
                    📅 {formatDisplayDate(entry.editDate)}
                  </Text>
                ) : null}
                {entry.editDose ? (
                  <Text style={[styles.quickChip, { color: colors.muted }]}>
                    💊 Dose {entry.editDose}{entry.vaccine.seriesTotal ? ` / ${entry.vaccine.seriesTotal}` : ''}
                  </Text>
                ) : null}
                {entry.editManufacturer ? (
                  <Text style={[styles.quickChip, { color: colors.muted }]} numberOfLines={1}>
                    🏭 {entry.editManufacturer}
                  </Text>
                ) : null}
              </View>

              {/* Smart reasoning */}
              {entry.vaccine.reasoning ? (
                <Text style={[styles.reasoning, { color: colors.muted }]} numberOfLines={entry.expanded ? undefined : 1}>
                  🤖 {entry.vaccine.reasoning}
                </Text>
              ) : null}

              {/* Expand / collapse edit fields */}
              <TouchableOpacity
                onPress={() => toggleExpand(entry.id)}
                style={styles.expandBtn}
                accessibilityLabel={entry.expanded ? (iS.cancelBtn ?? 'Collapse edit fields') : (iS.editImmunTitle ?? 'Edit details')}
              >
                <Text style={[styles.expandBtnText, { color: colors.primary }]}>
                  {entry.expanded ? '▲ Hide details' : '✏️ Edit details'}
                </Text>
              </TouchableOpacity>

              {entry.expanded && (
                <View style={[styles.editSection, { borderTopColor: colors.border }]}>
                  <EditRow label={iS.vaccineNameLabel ?? "Vaccine Name"}>
                    <TextInput
                      value={entry.editName}
                      onChangeText={v => updateField(entry.id, 'editName', v)}
                      style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? '#0D1117' : '#F9FAFB' }]}
                      placeholder="e.g. Influenza (Flu)"
                      placeholderTextColor={colors.muted}
                      returnKeyType="done"
                    />
                  </EditRow>
                  <EditRow label={iS.dateAdministeredLabel ?? "Date Administered"}>
                    <TextInput
                      value={entry.editDate}
                      onChangeText={v => updateField(entry.id, 'editDate', v)}
                      style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? '#0D1117' : '#F9FAFB' }]}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.muted}
                      keyboardType="default"
                      returnKeyType="done"
                    />
                  </EditRow>
                  <EditRow label={iS.manufacturerLabel ?? "Manufacturer"}>
                    <TextInput
                      value={entry.editManufacturer}
                      onChangeText={v => updateField(entry.id, 'editManufacturer', v)}
                      style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? '#0D1117' : '#F9FAFB' }]}
                      placeholder="e.g. Pfizer-BioNTech"
                      placeholderTextColor={colors.muted}
                      returnKeyType="done"
                    />
                  </EditRow>
                  <EditRow label={iS.lotNumberLabel ?? "Lot Number"}>
                    <TextInput
                      value={entry.editLot}
                      onChangeText={v => updateField(entry.id, 'editLot', v)}
                      style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? '#0D1117' : '#F9FAFB' }]}
                      placeholder="e.g. EK5730"
                      placeholderTextColor={colors.muted}
                      returnKeyType="done"
                    />
                  </EditRow>
                  <EditRow label={iS.doseNumberLabel ?? "Dose Number"}>
                    <TextInput
                      value={entry.editDose}
                      onChangeText={v => updateField(entry.id, 'editDose', v)}
                      style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? '#0D1117' : '#F9FAFB' }]}
                      placeholder="e.g. 1"
                      placeholderTextColor={colors.muted}
                      keyboardType="default"
                      returnKeyType="done"
                    />
                  </EditRow>
                  {entry.vaccine.reactions ? (
                    <View style={styles.reactionRow}>
                      <Text style={[styles.editLabel, { color: colors.muted }]}>Reactions noted</Text>
                      <Text style={[styles.reactionText, { color: colors.warning }]}>
                        ⚠️ {entry.vaccine.reactions}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}

        {/* Bottom padding for action bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <View style={[styles.actionBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => setEntries(prev => prev.map(e => ({ ...e, selected: true })))}
            style={[styles.selectAllBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.selectAllText, { color: colors.foreground }]}>Select All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSaveSelected}
            disabled={saving || selectedCount === 0}
            style={[
              styles.saveBtn,
              { backgroundColor: selectedCount > 0 ? colors.primary : colors.muted },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                Save {selectedCount > 0 ? `${selectedCount} ` : ''}Vaccine{selectedCount !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScreenContainer>
  );
}

// ─── EditRow helper ──────────────────────────────────────────────────────────
function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.editRow}>
      <Text style={styles.editLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minWidth: 60 },
  headerBtnText: { fontSize: 15, fontWeight: '500' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },

  banner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  bannerText: { fontSize: 13, lineHeight: 18 },

  listContent: { padding: 16, gap: 12 },

  card: {
    borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  selectCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  selectCheck: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  cardName: { fontSize: 15, fontWeight: '600' },
  cardSubtype: { fontSize: 11, marginTop: 1 },
  confBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  confText: { fontSize: 10, fontWeight: '700' },
  dismissBtn: { marginLeft: 8, padding: 4 },
  dismissText: { fontSize: 22, lineHeight: 24, fontWeight: '300' },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  quickChip: { fontSize: 12 },

  reasoning: { fontSize: 11, fontStyle: 'italic', marginBottom: 6, lineHeight: 16 },

  expandBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  expandBtnText: { fontSize: 13, fontWeight: '500' },

  editSection: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  editRow: { gap: 4 },
  editLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#687076' },
  editInput: {
    height: 38, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, fontSize: 14,
  },
  reactionRow: { gap: 4 },
  reactionText: { fontSize: 13 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  actionBar: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectAllBtn: {
    flex: 0, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  selectAllText: { fontSize: 14, fontWeight: '500' },
  saveBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
