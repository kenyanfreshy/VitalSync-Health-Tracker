/**
 * RecentEntriesSection
 *
 * Shows recent log entries across all health categories on the Record screen.
 * Features:
 *  - Category filter chips: All / Vitals / Labs / Nutrition / Activity / Other
 *  - Show More / Show Less toggle cycling 3 → 5 → 10 → 3
 *  - Empty state when no data exists
 */
import { safeFormatDate } from '@/lib/utils';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '@/components/glass-card';
import { View, Text, Pressable, ScrollView, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useColors, useRecordsStrings } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import { mgDlToMmol, kgToLbs } from '@/lib/health/types';

const FILTER_PERSIST_KEY = '@vsht:recent_entries_filter';
const SWIPE_HINT_KEY = '@vsht:swipe_hint_shown';
const UNDO_DELAY_MS = 4000;

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryCategory = 'Vitals' | 'Labs' | 'Nutrition' | 'Activity' | 'Other';

interface MacroPill {
  label: string;
  value: string;
  color: string;
  bg: string;
}
interface RecentEntry {
  id: string;
  /** Prefix used to identify the delete action, e.g. 'weight', 'vitals', 'lab' */
  deleteKey: string;
  /** The raw record id used for the delete dispatch */
  recordId: string;
  category: string;
  filterGroup: EntryCategory;
  icon: string;
  accentColor: string;
  summary: string;
  timestamp: string;
  route: string;
  /** Optional macro pills shown beneath the summary for Nutrition entries with full macro data */
  macroPills?: MacroPill[];
}

type FilterChip = 'All' | EntryCategory;

const FILTER_CHIPS: FilterChip[] = ['All', 'Vitals', 'Labs', 'Nutrition', 'Activity', 'Other'];

// Cycle: 3 → 5 → 10 → 3
const LIMITS = [3, 5, 10] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return safeFormatDate(isoTimestamp, undefined, { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── SwipeableRow ─────────────────────────────────────────────────────────────

function SwipeableRow({
  onDelete,
  children,
  deleteLabel,
  showHint,
}: {
  onDelete: () => void;
  children: React.ReactNode;
  deleteLabel?: string;
  /** When true, plays a one-time left-nudge hint animation on mount */
  showHint?: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const DELETE_WIDTH = 72;

  // One-time swipe hint: nudge left then snap back
  useEffect(() => {
    if (!showHint) return;
    const NUDGE = -22;
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.spring(translateX, {
          toValue: NUDGE,
          useNativeDriver: true,
          speed: 14,
          bounciness: 6,
        }),
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 14,
          bounciness: 4,
        }),
      ]).start();
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHint]);

  const handleSwipeStart = () => {
    Animated.spring(translateX, {
      toValue: -DELETE_WIDTH,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  const handleClose = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Delete action revealed behind the row */}
      <View style={[swipeStyles.deleteAction, { width: DELETE_WIDTH }]}>
        <Pressable
          style={swipeStyles.deleteBtn}
          onPress={() => { handleClose(); onDelete(); }}
        >
          <Text style={swipeStyles.deleteText}>{deleteLabel ?? 'Delete'}</Text>
        </Pressable>
      </View>
      {/* Swipeable content */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
      >
        <Pressable onLongPress={handleSwipeStart} onPress={handleClose}>
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  deleteText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

// ─── Main Component ───────────────────────────────────────────────────────────

interface RecentEntriesSectionProps {
  /** When set, overrides the internal filter chip selection */
  externalFilter?: FilterChip;
}

export function RecentEntriesSection({ externalFilter }: RecentEntriesSectionProps = {}) {
  const _rs = useRecordsStrings();
  const colors = useColors();
  const { weightUnit, glucoseUnit } = useUnitPreferences();
  const { dietType: userDietType } = useDietType();
  const dietLabel = DIET_TYPE_OPTIONS.find(o => o.value === userDietType)?.label ?? 'Diet';
  const {
    state,
    deleteWeight,
    deleteVitalSigns,
    deleteBloodSugar,
    deleteSleep,
    deleteActivity,
    deleteSodium,
    deleteLabResult,
    deleteMedicalHistory,
    deleteSurgicalHistory,
  } = useHealth();
  const router = useRouter();
  const data = state.data;

  // ── Undo-delete snackbar state ────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<RecentEntry | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snackbarOpacity = useRef(new Animated.Value(0)).current;
  const snackbarTranslateY = useRef(new Animated.Value(24)).current;

  const commitDelete = useCallback((entry: RecentEntry) => {
    switch (entry.deleteKey) {
      case 'weight': deleteWeight(entry.recordId); break;
      case 'vitals': deleteVitalSigns(entry.recordId); break;
      case 'bloodSugar': deleteBloodSugar(entry.recordId); break;
      case 'sleep': deleteSleep(entry.recordId); break;
      case 'activity': deleteActivity(entry.recordId); break;
      case 'sodium': deleteSodium(entry.recordId); break;
      case 'lab': deleteLabResult(entry.recordId); break;
      case 'medicalHistory': deleteMedicalHistory(entry.recordId); break;
      case 'surgicalHistory': deleteSurgicalHistory(entry.recordId); break;
    }
  }, [deleteWeight, deleteVitalSigns, deleteBloodSugar, deleteSleep, deleteActivity, deleteSodium, deleteLabResult, deleteMedicalHistory, deleteSurgicalHistory]);

  const dismissSnackbar = useCallback((then?: () => void) => {
    Animated.parallel([
      Animated.timing(snackbarOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(snackbarTranslateY, { toValue: 24, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setPendingDelete(null);
      then?.();
    });
  }, [snackbarOpacity, snackbarTranslateY]);

  const handleDeleteEntry = useCallback((entry: RecentEntry) => {
    // Cancel any in-flight delete and commit it immediately before starting a new one
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    if (pendingDelete) {
      commitDelete(pendingDelete);
    }

    // Show snackbar
    setPendingDelete(entry);
    snackbarTranslateY.setValue(24);
    snackbarOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(snackbarOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(snackbarTranslateY, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();

    // Auto-commit after delay
    deleteTimerRef.current = setTimeout(() => {
      deleteTimerRef.current = null;
      commitDelete(entry);
      dismissSnackbar();
    }, UNDO_DELAY_MS);
  }, [pendingDelete, commitDelete, dismissSnackbar, snackbarOpacity, snackbarTranslateY]);

  // Commit any pending delete when component unmounts
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
        if (pendingDelete) commitDelete(pendingDelete);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDelete]);

  const [activeFilter, setActiveFilter] = useState<FilterChip>('All');
  const [limitIdx, setLimitIdx] = useState(0);
  const [swipeHintShown, setSwipeHintShown] = useState(false);
  const limit = LIMITS[limitIdx];

  // Restore persisted filter on mount + check if swipe hint has been shown
  useEffect(() => {
    AsyncStorage.getItem(FILTER_PERSIST_KEY)
      .then(saved => {
        if (saved && FILTER_CHIPS.includes(saved as FilterChip)) {
          setActiveFilter(saved as FilterChip);
        }
      })
      .catch(() => {});
    AsyncStorage.getItem(SWIPE_HINT_KEY)
      .then(val => {
        if (!val) {
          setSwipeHintShown(false);
          // Mark as shown so it only plays once across sessions
          safeSetItem(SWIPE_HINT_KEY, '1').catch(() => {});
        } else {
          setSwipeHintShown(true);
        }
      })
      .catch(() => {});
  }, []);

  // Sync external filter when provided
  useEffect(() => {
    if (externalFilter !== undefined) {
      setActiveFilter(externalFilter);
      setLimitIdx(0);
    }
  }, [externalFilter]);

  // Reset limit when filter changes and persist selection
  const handleFilterChange = useCallback((chip: FilterChip) => {
    setActiveFilter(chip);
    setLimitIdx(0);
    safeSetItem(FILTER_PERSIST_KEY, chip).catch(() => {});
  }, []);

  const allEntries = useMemo<RecentEntry[]>(() => {
    // weightUnit and glucoseUnit captured from outer scope
    if (!data) return [];
    const candidates: RecentEntry[] = [];

    // Weight
    for (const r of data.weight ?? []) {
      const rid = r.id ?? r.timestamp;
      candidates.push({
        id: `weight-${rid}`,
        deleteKey: 'weight',
        recordId: rid,
        category: 'Weight',
        filterGroup: 'Vitals',
        icon: '⚖️',
        accentColor: '#3B82F6',
        summary: weightUnit === 'kg'
          ? `${r.weightKg != null ? r.weightKg.toFixed(1) : (r.weightLbs != null ? (r.weightLbs / 2.20462).toFixed(1) : '—')} kg`
          : `${r.weightLbs != null ? r.weightLbs : (r.weightKg != null ? kgToLbs(r.weightKg).toFixed(1) : '—')} lbs`,
        timestamp: r.timestamp,
        route: '/log/weight',
      });
    }

    // Vital Signs
    for (const r of data.vitalSigns ?? []) {
      const parts: string[] = [];
      if (r.systolic && r.diastolic) parts.push(`${r.systolic}/${r.diastolic} mmHg`);
      if (r.heartRate) parts.push(`${r.heartRate} bpm`);
      if (r.oxygenSaturation) parts.push(`SpO₂ ${r.oxygenSaturation}%`);
      if (parts.length === 0) continue;
      const rid = r.id ?? r.timestamp;
      candidates.push({
        id: `vitals-${rid}`,
        deleteKey: 'vitals',
        recordId: rid,
        category: 'Vital Signs',
        filterGroup: 'Vitals',
        icon: '❤️',
        accentColor: '#EF4444',
        summary: parts.slice(0, 2).join(' · '),
        timestamp: r.timestamp,
        route: '/log/vitals',
      });
    }

    // Blood Sugar
    for (const r of data.bloodSugar ?? []) {
      const rid = r.id ?? r.timestamp;
      candidates.push({
        id: `glucose-${rid}`,
        deleteKey: 'bloodSugar',
        recordId: rid,
        category: 'Blood Sugar',
        filterGroup: 'Vitals',
        icon: '🩸',
        accentColor: '#F59E0B',
        summary: glucoseUnit === 'mmol/L'
          ? `${mgDlToMmol(r.glucoseMgDl).toFixed(1)} mmol/L${r.context ? ` · ${r.context}` : ''}`
          : `${r.glucoseMgDl} mg/dL${r.context ? ` · ${r.context}` : ''}`,
        timestamp: r.timestamp,
        route: '/log/blood-sugar',
      });
    }

    // Sleep
    for (const r of data.sleep ?? []) {
      if (!r.totalMinutes) continue;
      const h = Math.floor(r.totalMinutes / 60);
      const m = r.totalMinutes % 60;
      const dur = m > 0 ? `${h}h ${m}m` : `${h}h`;
      const effLabel = r.efficiency ? ` · ${r.efficiency}% eff.` : '';
      const rid = r.id ?? r.bedtime ?? r.wakeTime ?? '';
      candidates.push({
        id: `sleep-${rid}`,
        deleteKey: 'sleep',
        recordId: rid,
        category: 'Sleep',
        filterGroup: 'Vitals',
        icon: '🌙',
        accentColor: '#8B5CF6',
        summary: dur + effLabel,
        timestamp: r.bedtime ?? r.wakeTime ?? '',
        route: '/log/sleep',
      });
    }

    // Activity
    for (const r of data.activity ?? []) {
      const dur = r.durationMinutes ? ` · ${r.durationMinutes}m` : '';
      const rid = r.id ?? r.timestamp;
      candidates.push({
        id: `activity-${rid}`,
        deleteKey: 'activity',
        recordId: rid,
        category: 'Activity',
        filterGroup: 'Activity',
        icon: '🏃',
        accentColor: '#10B981',
        summary: `${r.type ?? 'Workout'}${dur}`,
        timestamp: r.timestamp,
        route: '/log/activity',
      });
    }

    // Lab Results
    for (const r of data.labResults ?? []) {
      const panel = r.panel ?? 'Lab';
      const count = Object.keys(r.values ?? {}).length;
      const rid = r.id ?? r.timestamp;
      candidates.push({
        id: `lab-${rid}`,
        deleteKey: 'lab',
        recordId: rid,
        category: 'Lab Results',
        filterGroup: 'Labs',
        icon: '🧪',
        accentColor: '#0EA5E9',
        summary: `${panel} · ${count} analyte${count !== 1 ? 's' : ''}`,
        timestamp: r.timestamp,
        route: '/labs',
      });
    }

    // Nutrition / Meal Log
    for (const r of data.sodiumIntake ?? []) {
      const rid = r.id ?? r.timestamp;
      // Build a human-readable meal summary:
      //   Primary: foodDescription (meal name) if present
      //   Secondary: calories + protein if available, otherwise sodium mg
      const mealName = r.foodDescription
        ? r.foodDescription.length > 40
          ? r.foodDescription.slice(0, 38) + '\u2026'
          : r.foodDescription
        : null;
      const macroHints: string[] = [];
      if (r.calories != null) macroHints.push(`${Math.round(r.calories)} kcal`);
      if (r.proteinG != null) macroHints.push(`${r.proteinG.toFixed(0)}g protein`);
      if (macroHints.length === 0) macroHints.push(`${r.sodiumMg} mg Na`);
      const summary = mealName
        ? `${mealName} · ${macroHints[0]}`
        : macroHints.join(' · ');
      // Build macro pills if full macro data is present
      const macroPills: MacroPill[] = [];
      if (r.calories != null) macroPills.push({ label: 'kcal', value: `${Math.round(r.calories)}`, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' });
      if (r.proteinG != null) macroPills.push({ label: 'P', value: `${r.proteinG.toFixed(0)}g`, color: '#22C55E', bg: 'rgba(34,197,94,0.12)' });
      if (r.carbsG != null) macroPills.push({ label: 'C', value: `${r.carbsG.toFixed(0)}g`, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' });
      if (r.fatG != null) macroPills.push({ label: 'F', value: `${r.fatG.toFixed(0)}g`, color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' });
      candidates.push({
        id: `sodium-${rid}`,
        deleteKey: 'sodium',
        recordId: rid,
        category: 'Meal',
        filterGroup: 'Nutrition',
        icon: r.source === 'ai-photo' ? '📸' : r.source === 'barcode-scan' ? '🔍' : '🥗',
        accentColor: '#84CC16',
        summary,
        timestamp: r.timestamp,
        route: '/log/nutrition',
        macroPills: macroPills.length >= 2 ? macroPills : undefined,
      });
    }

    // Medical History
    for (const r of data.medicalHistory ?? []) {
      candidates.push({
        id: `mhx-${r.id}`,
        deleteKey: 'medicalHistory',
        recordId: r.id,
        category: 'Medical History',
        filterGroup: 'Other',
        icon: '🩺',
        accentColor: '#6366F1',
        summary: r.condition,
        timestamp: r.diagnosedDate ?? '',
        route: '/log/medical-history',
      });
    }

    // Surgical History
    for (const r of data.surgicalHistory ?? []) {
      candidates.push({
        id: `surg-${r.id}`,
        deleteKey: 'surgicalHistory',
        recordId: r.id,
        category: 'Surgical History',
        filterGroup: 'Other',
        icon: '✂️',
        accentColor: '#8B5CF6',
        summary: r.procedure ?? r.cptCode ?? 'Procedure',
        timestamp: r.surgeryDate ?? '',
        route: '/log/surgical-history',
      });
    }

    return candidates
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [data, weightUnit, glucoseUnit, dietLabel]);
  // Apply category filter
  const filteredEntries = useMemo(
    () =>
      activeFilter === 'All'
        ? allEntries
        : allEntries.filter(e => e.filterGroup === activeFilter),
    [allEntries, activeFilter],
  );

  const s = styles(colors);
  const visibleEntries = filteredEntries.slice(0, limit);
  const hasMore = filteredEntries.length > limit;
  const isExpanded = limitIdx > 0;
  const toggleLabel = hasMore
    ? `Show more (${Math.min(LIMITS[Math.min(limitIdx + 1, LIMITS.length - 1)], filteredEntries.length)})`
    : isExpanded
    ? 'Show less'
    : null;

  function handleToggle() {
    if (hasMore) {
      setLimitIdx(prev => Math.min(prev + 1, LIMITS.length - 1));
    } else {
      setLimitIdx(0);
    }
  }

  return (
    <GlassCard accentColor="#6366F1" noPadding style={{ marginTop: 8, marginBottom: 4 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.sectionTitle}>{_rs?.recentEntries ?? 'RECENT ENTRIES'}</Text>
        <Text style={s.countBadge}>{filteredEntries.length} total</Text>
      </View>

      {/* ── Category filter chips ───────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsRow}
        style={s.chipsScroll}
      >
        {FILTER_CHIPS.map(chip => {
          const isActive = chip === activeFilter;
          return (
            <Pressable
              key={chip}
              style={({ pressed }) => [
                s.chip,
                isActive && { backgroundColor: colors.primary },
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => handleFilterChange(chip)}
            >
              <Text style={[s.chipText, isActive && { color: '#fff' }]}>{
              chip === 'All' ? (_rs?.filterAll ?? chip) :
              chip === 'Vitals' ? (_rs?.filterVitals ?? chip) :
              chip === 'Labs' ? (_rs?.filterLabs ?? chip) :
              chip === 'Nutrition' ? (_rs?.filterNutrition ?? chip) :
              chip === 'Activity' ? (_rs?.filterActivity ?? chip) :
              chip === 'Other' ? (_rs?.filterOther ?? chip) : chip
            }</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {filteredEntries.length === 0 && (
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>{activeFilter === 'All' ? '📋' : '🔍'}</Text>
          <Text style={s.emptyTitle}>
            {activeFilter === 'All' ? (_rs?.nothingLoggedYet ?? 'Nothing logged yet') : (_rs?.noEntriesFilter ?? `No ${activeFilter} entries`).replace('{filter}', activeFilter)}
          </Text>
          <Text style={s.emptyBody}>
            {activeFilter === 'All'
              ? (_rs?.startLogging ?? 'Start logging to see your recent entries here.')
              : (_rs?.logSomeData ?? `Log some ${activeFilter.toLowerCase()} data to see it here.`).replace('{filter}', activeFilter.toLowerCase())}
          </Text>
        </View>
      )}      {/* ── Entry rows (long-press to reveal swipe-delete) ─────────────────────────── */}
      {visibleEntries.map((entry, idx) => (
        <SwipeableRow
          key={entry.id}
          onDelete={() => handleDeleteEntry(entry)}
          deleteLabel={_rs?.deleteEntry ?? 'Delete'}
          showHint={!swipeHintShown && idx === 0}
        >
          <Pressable
            style={[s.row, !toggleLabel && idx === visibleEntries.length - 1 && s.rowLast]}
            onPress={() => router.push(entry.route as any)}
          >
            <View style={[s.iconWrap, { backgroundColor: entry.accentColor + '18' }]}>
              <Text style={s.iconText}>{entry.icon}</Text>
            </View>
            <View style={s.textBlock}>
              <Text style={s.categoryLabel} numberOfLines={1}>{entry.category}</Text>
              <Text style={s.summaryText} numberOfLines={1}>{entry.summary}</Text>
              {entry.macroPills && entry.macroPills.length > 0 && (
                <View style={s.macroPillRow}>
                  {entry.macroPills.map(p => (
                    <View key={p.label} style={[s.macroPill, { backgroundColor: p.bg }]}>
                      <Text style={[s.macroPillLabel, { color: p.color }]}>{p.label} </Text>
                      <Text style={[s.macroPillValue, { color: p.color }]}>{p.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Text style={s.timeText}>{formatRelativeTime(entry.timestamp)}</Text>
          </Pressable>
        </SwipeableRow>
      ))}     {/* ── Show more / Show less ────────────────────────────────────────────── */}
      {toggleLabel && (
        <Pressable
          style={({ pressed }) => [s.toggleRow, pressed && { opacity: 0.65 }]}
          onPress={handleToggle}
        >
          <Text style={[s.toggleText, { color: colors.primary }]}>{toggleLabel}</Text>
        </Pressable>
      )}
      {/* ── Undo-delete snackbar ──────────────────────────────────────────── */}
      {pendingDelete && (
        <Animated.View
          style={[
            snackStyles.container,
            {
              opacity: snackbarOpacity,
              transform: [{ translateY: snackbarTranslateY }],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={snackStyles.inner}>
            <Text style={snackStyles.label} numberOfLines={1}>
              {_rs?.deletedEntry ?? 'Deleted'}
            </Text>
            <Pressable
              onPress={() => {
                if (deleteTimerRef.current) {
                  clearTimeout(deleteTimerRef.current);
                  deleteTimerRef.current = null;
                }
                dismissSnackbar();
              }}
              style={snackStyles.undoBtn}
            >
              <Text style={snackStyles.undoText}>{_rs?.undoDelete ?? 'Undo'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (deleteTimerRef.current) {
                  clearTimeout(deleteTimerRef.current);
                  deleteTimerRef.current = null;
                }
                commitDelete(pendingDelete);
                dismissSnackbar();
              }}
              style={snackStyles.dismissBtn}
            >
              <Text style={snackStyles.dismissText}>×</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: c.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: c.muted,
    letterSpacing: 0.6,
  },
  countBadge: {
    fontSize: 11,
    color: c.muted,
  },
  // Filter chips
  chipsScroll: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: c.border,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.foreground,
  },
  // Entry rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    gap: 12,
  },
  rowLast: {
    paddingBottom: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 20 },
  textBlock: { flex: 1 },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: c.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.foreground,
  },
  timeText: {
    fontSize: 12,
    color: c.muted,
    flexShrink: 0,
  },
  // Show more / Show less
  toggleRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Macro pill row
  macroPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 5,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  macroPillValue: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.foreground,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: c.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});

// ─── Snackbar Styles (static — no theme dependency needed) ───────────────────

const snackStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    borderRadius: 12,
    backgroundColor: '#1E2022',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#ECEDEE',
  },
  undoBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0a7ea4',
  },
  undoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dismissBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#9BA1A6',
    lineHeight: 22,
  },
});
