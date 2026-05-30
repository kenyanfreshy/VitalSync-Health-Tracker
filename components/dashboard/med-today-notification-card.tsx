/**
 * MedTodayNotificationCard
 *
 * Shown in the Smart Reminders section of the Dashboard for each due dose.
 *
 * Behaviour:
 *  - ✓ Taken   → logs dose, shows success flash, then DISMISSES from smart reminders
 *                 (moves to history only — card disappears from Today view)
 *  - ✗ Skip    → logs dose as skipped, transitions card to a "Skipped" status view
 *                 (stays visible under Today; does NOT disappear)
 *  - ↻ Later   → reschedules to a new time, transitions card to a "Rescheduled" status view
 *                 (stays visible under Today; does NOT disappear)
 *
 * Parent passes `onDismiss` which is only called for the Taken path.
 * For Skip/Reschedule the card self-manages a `status` state and renders a compact status row.
 */
import React, { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors, useDashboardStrings } from '@/hooks';
import {
  loadMedications,
  logDose,
  createDoseLog,
  logRescheduleEvent,
} from '@/lib/medications/storage';
import type { Medication, MedicationStore } from '@/lib/medications/types';
import { showHealthKitToast } from '@/components/healthkit-toast';

// ─── Props ────────────────────────────────────────────────────────────────────
export interface MedTodayNotificationCardProps {
  /** The medication to act on */
  med: Medication;
  /** The HH:MM scheduled time for this dose */
  scheduledTime: string;
  /** Called after any action so the parent can refresh its medication list */
  onActionComplete: (updatedMeds: MedicationStore) => void;
  /**
   * Called ONLY when the dose is marked as Taken.
   * Skip/Reschedule do NOT call this — the card stays visible with a status badge.
   */
  onDismiss: () => void;
  /**
   * Called when the user snoozes the reminder.
   * Parent should hide the card for the given duration (ms).
   */
  onSnooze?: (ms: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function minutesUntil(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  const now = new Date();
  return hh * 60 + mm - (now.getHours() * 60 + now.getMinutes());
}

type CardStatus = 'pending' | 'taken' | 'skipped' | 'rescheduled';

// ─── Component ───────────────────────────────────────────────────────────────
export function MedTodayNotificationCard({
  med,
  scheduledTime,
  onActionComplete,
  onDismiss,
  onSnooze,
}: MedTodayNotificationCardProps) {
  const colors = useColors();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const ds = useDashboardStrings();
  const [loading, setLoading] = useState<'taken' | 'skipped' | 'reschedule' | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [status, setStatus] = useState<CardStatus>('pending');
  const [rescheduledTo, setRescheduledTo] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const diff = minutesUntil(scheduledTime);
  const timeLabel = diff <= 0 ? `${ds.doseOverdue ?? 'Overdue'} (${fmtTime(scheduledTime)})` : `${ds.doseDueAt ?? 'Due at'} ${fmtTime(scheduledTime)}`;
  const urgentColor = isDark ? '#A78BFA' : '#5B21B6';
  const urgentBg = isDark ? '#1C1030' : '#F5F3FF';
  const urgentBorder = isDark ? '#7C3AED40' : '#DDD6FE';

  // ── Action handlers ──────────────────────────────────────────────────────
  async function handleTaken() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading('taken');
    try {
      const meds = await loadMedications();
      const log = createDoseLog(today, scheduledTime, 'taken');
      const updated = await logDose(meds, med.id, log);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStatus('taken');
      onActionComplete(updated);
      // Taken → dismiss from smart reminders after brief success flash
      setTimeout(onDismiss, 900);
    } finally {
      setLoading(null);
    }
  }

  async function handleSkipped() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading('skipped');
    try {
      const meds = await loadMedications();
      const log = createDoseLog(today, scheduledTime, 'skipped');
      const updated = await logDose(meds, med.id, log);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStatus('skipped');
      onActionComplete(updated);
      // Skip → show brief status flash, then dismiss from Today
      setTimeout(onDismiss, 1200);
    } finally {
      setLoading(null);
    }
  }

  async function handleReschedule() {
    if (!newTime.trim()) return;
    const match = newTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (hh > 23 || mm > 59) return;
    const formattedNew = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading('reschedule');
    try {
      const meds = await loadMedications();
      const updated = await logRescheduleEvent(meds, med.id, scheduledTime, formattedNew, 'user reschedule');
      showHealthKitToast(`${med.name} rescheduled to ${fmtTime(formattedNew)} ✓`);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRescheduledTo(formattedNew);
      setStatus('rescheduled');
      onActionComplete(updated);
      // Reschedule → show brief status flash, then dismiss from Today
      setTimeout(onDismiss, 1400);
    } finally {
      setLoading(null);
    }
  }

  // ── Status card (shown after Skip or Reschedule) ─────────────────────────
  if (status === 'taken') {
    return (
      <View style={[styles.card, { backgroundColor: isDark ? '#14532D30' : '#DCFCE7', borderColor: isDark ? '#16A34A50' : '#BBF7D0' }]}>
        <Text style={{ fontSize: 16 }}>✅</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#4ADE80' : '#15803D', marginLeft: 8 }}>
          {med.name} logged
        </Text>
      </View>
    );
  }

  if (status === 'skipped') {
    return (
      <View style={[styles.card, styles.statusCard, { backgroundColor: isDark ? '#1C1010' : '#FFF7ED', borderColor: isDark ? '#F9731640' : '#FED7AA' }]}>
        <View style={styles.statusRow}>
          <Text style={{ fontSize: 18 }}>⏭</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FB923C' : '#C2410C' }}>
              {ds.doseStatusSkipped ?? 'Skipped'} — {med.name}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              {fmtTime(scheduledTime)} · {ds.doseLoggedSkipped ?? 'Logged as skipped today'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isDark ? '#F9731620' : '#FEE2E2' }]}>
            <Text style={{ fontSize: 10, color: isDark ? '#FB923C' : '#C2410C', fontWeight: '700' }}>{ds.doseStatusSkippedBadge ?? 'Skipped'}</Text>
          </View>
        </View>
        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          {ds.doseDisclaimer}
        </Text>
      </View>
    );
  }

  if (status === 'rescheduled') {
    return (
      <View style={[styles.card, styles.statusCard, { backgroundColor: isDark ? '#1C1A08' : '#FFFBEB', borderColor: isDark ? '#D9770640' : '#FDE68A' }]}>
        <View style={styles.statusRow}>
          <Text style={{ fontSize: 18 }}>↻</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FCD34D' : '#92400E' }}>
              {ds.doseStatusRescheduled ?? 'Rescheduled'} — {med.name}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              {fmtTime(scheduledTime)} → {rescheduledTo ? fmtTime(rescheduledTo) : '—'} · {ds.doseUpdatedForToday ?? 'Updated for today'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isDark ? '#D9770620' : '#FEF3C7' }]}>
            <Text style={{ fontSize: 10, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '700' }}>{ds.doseStatusRescheduledBadge ?? 'Rescheduled'}</Text>
          </View>
        </View>
        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          {ds.doseDisclaimer}
        </Text>
      </View>
    );
  }

  // ── Pending card (default) ────────────────────────────────────────────────
  return (
    <View style={[styles.card, { backgroundColor: urgentBg, borderColor: urgentBorder }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.emoji}>💊</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.medName, { color: urgentColor }]} numberOfLines={1}>
            {med.name}
          </Text>
          <Text style={[styles.subtext, { color: colors.muted }]}>
            {med.dose}
            {'  ·  '}
            <Text style={{ color: diff <= 0 ? (isDark ? '#F87171' : '#DC2626') : urgentColor, fontWeight: '600' }}>
              {timeLabel}
            </Text>
          </Text>
        </View>
      </View>
      {/* Action buttons */}
      {!showReschedule && (
        <View style={styles.actionsRow}>
          {/* Taken */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#14532D40' : '#DCFCE7', borderColor: isDark ? '#16A34A60' : '#BBF7D0' }]}
            onPress={handleTaken}
            disabled={loading !== null}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#4ADE80' : '#166534' }]}>
              {loading === 'taken' ? '…' : ds.doseTakenBtn}
            </Text>
          </TouchableOpacity>
          {/* Skip */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#7F1D1D30' : '#FEF2F2', borderColor: isDark ? '#EF444440' : '#FECACA' }]}
            onPress={handleSkipped}
            disabled={loading !== null}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#F87171' : '#DC2626' }]}>
              {loading === 'skipped' ? '…' : ds.doseMissedBtn}
            </Text>
          </TouchableOpacity>
          {/* Reschedule */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderColor: isDark ? '#D9770640' : '#FDE68A' }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowReschedule(true);
              setShowSnooze(false);
            }}
            disabled={loading !== null}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
              {ds.doseRescheduleBtn}
            </Text>
          </TouchableOpacity>
          {/* Snooze */}
          {onSnooze && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isDark ? '#0C2A4A30' : '#EFF6FF', borderColor: isDark ? '#3B82F640' : '#BFDBFE' }]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowSnooze(s => !s);
                setShowReschedule(false);
              }}
              disabled={loading !== null}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={[styles.actionBtnText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
                {ds.doseSnoozeBtn}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Snooze duration picker */}
      {showSnooze && onSnooze && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.muted, flex: 1 }}>{ds.doseSnoozeFor}</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#0C2A4A30' : '#EFF6FF', borderColor: isDark ? '#3B82F640' : '#BFDBFE' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSnooze(30 * 60 * 1000);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowSnooze(false);
            }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>{ds.doseSnooze30min}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#0C2A4A30' : '#EFF6FF', borderColor: isDark ? '#3B82F640' : '#BFDBFE' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSnooze(60 * 60 * 1000);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowSnooze(false);
            }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>{ds.doseSnooze1hour}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#1C1030' : '#F5F3FF', borderColor: urgentBorder }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowSnooze(false);
            }}
          >
            <Text style={[styles.actionBtnText, { color: colors.muted }]}>{ds.doseCancelBtn}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Reschedule input row */}
      {showReschedule && (
        <View style={styles.rescheduleRow}>
          <TextInput
            style={[styles.timeInput, {
              color: colors.foreground,
              backgroundColor: isDark ? '#1C1030' : '#FFFFFF',
              borderColor: urgentBorder,
            }]}
            placeholder="HH:MM"
            placeholderTextColor={colors.muted}
            value={newTime}
            onChangeText={setNewTime}
            keyboardType="default"
            returnKeyType="done"
            onSubmitEditing={handleReschedule}
            maxLength={5}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderColor: isDark ? '#D9770640' : '#FDE68A' }]}
            onPress={handleReschedule}
            disabled={loading !== null}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
              {loading === 'reschedule' ? '…' : ds.doseSetBtn}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#1C1030' : '#F5F3FF', borderColor: urgentBorder }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowReschedule(false);
              setNewTime('');
            }}
          >
            <Text style={[styles.actionBtnText, { color: colors.muted }]}>{ds.doseCancelBtn}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Disclaimer */}
      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        {ds.doseDisclaimer}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 10,
  },
  statusCard: {
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 22,
  },
  medName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  subtext: {
    fontSize: 11,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rescheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
