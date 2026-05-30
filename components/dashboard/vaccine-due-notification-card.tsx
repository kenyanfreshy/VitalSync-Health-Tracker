/**
 * VaccineDueNotificationCard
 *
 * Smart notification card for an immunization due within 48 hours.
 * Renders inline Received / Reschedule / Skip action buttons so the user
 * can act without leaving the dashboard.
 *
 * Pharmacy row: if the immunization record has pharmacyName, pharmacyPhone,
 * or pharmacyAddress set, a compact row is shown with tap-to-call and
 * tap-for-directions buttons — matching the medication refill card pattern.
 *
 * Used inside the "Smart Reminders" section of the Dashboard.
 */

import { safeFormatDate } from '@/lib/utils';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  LayoutAnimation,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme, useColors } from '@/hooks';
import { showHealthKitToast } from '@/components/healthkit-toast';
import type { ImmunizationRecord } from '@/lib/health/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaccineDueNotificationCardProps {
  /** The immunization record to act on */
  record: ImmunizationRecord;
  /** Days until next dose (pre-computed by parent) */
  daysLeft: number;
  /** Called after Received or Skip so parent can refresh immunization list */
  onActionComplete: (updated: ImmunizationRecord) => void;
  /** Called to dismiss/remove the card from the reminders list */
  onDismiss: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format an ISO date string as "Mon, Apr 14" */
function fmtDate(iso: string): string {
  return safeFormatDate(iso, [], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format an ISO date string as "Apr 14, 2026" */
function fmtDateFull(iso: string): string {
  return safeFormatDate(iso, [], { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Open the address in Apple Maps (iOS) or Google Maps (Android/web) */
function openMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const appleUrl = `maps://?q=${encoded}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  if (Platform.OS === 'ios') {
    Linking.canOpenURL(appleUrl)
      .then(ok => Linking.openURL(ok ? appleUrl : googleUrl))
      .catch(() => Linking.openURL(googleUrl));
  } else {
    const geoUrl = `geo:0,0?q=${encoded}`;
    Linking.canOpenURL(geoUrl)
      .then(ok => Linking.openURL(ok ? geoUrl : googleUrl))
      .catch(() => Linking.openURL(googleUrl));
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VaccineDueNotificationCard({
  record,
  daysLeft,
  onActionComplete,
  onDismiss,
}: VaccineDueNotificationCardProps) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';

  const [loading, setLoading] = useState<'received' | 'skip' | 'reschedule' | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDateStr, setNewDateStr] = useState('');
  const [done, setDone] = useState(false);
  const [doneLabel, setDoneLabel] = useState('');

  // Urgency colours — 0 days: red, 1 day: amber, 2 days: teal
  const urgentColor = daysLeft === 0 ? '#EF4444' : daysLeft === 1 ? '#F59E0B' : '#22C55E';
  const urgentBg = daysLeft === 0
    ? (isDark ? '#7F1D1D30' : '#FEF2F2')
    : daysLeft === 1
      ? (isDark ? '#78350F30' : '#FFFBEB')
      : (isDark ? '#134E4A30' : '#F0FDFA');
  const urgentBorder = urgentColor + '40';

  const dueLabel =
    daysLeft === 0 ? 'Due Today' :
    daysLeft === 1 ? 'Due Tomorrow' :
    `Due in ${daysLeft} days`;

  const doseLabel = record.doseNumber
    ? ` · Dose ${record.doseNumber}${record.seriesTotal ? `/${record.seriesTotal}` : ''}`
    : '';

  const hasPharmacy = !!(record.pharmacyName || record.pharmacyPhone || record.pharmacyAddress);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleReceived() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading('received');
    try {
      const today = new Date().toISOString().split('T')[0];
      const updated: ImmunizationRecord = {
        ...record,
        dateAdministered: today,
        nextDoseStatus: 'taken',
        updatedAt: new Date().toISOString(),
      };
      showHealthKitToast(`${record.vaccineName} marked as received ✓`);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDoneLabel('Received ✓');
      setDone(true);
      onActionComplete(updated);
      setTimeout(onDismiss, 1000);
    } finally {
      setLoading(null);
    }
  }

  async function handleSkip() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading('skip');
    try {
      const updated: ImmunizationRecord = {
        ...record,
        nextDoseStatus: 'skipped',
        updatedAt: new Date().toISOString(),
      };
      showHealthKitToast(`${record.vaccineName} skipped`);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDoneLabel('Skipped');
      setDone(true);
      onActionComplete(updated);
      setTimeout(onDismiss, 1000);
    } finally {
      setLoading(null);
    }
  }

  async function handleReschedule() {
    // Accept YYYY-MM-DD or MM/DD/YYYY or MM-DD-YYYY
    const trimmed = newDateStr.trim();
    let parsed: Date | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      parsed = new Date(trimmed + 'T12:00:00');
    } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(trimmed)) {
      const parts = trimmed.split(/[\/\-]/);
      parsed = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}T12:00:00`);
    }
    if (!parsed || isNaN(parsed.getTime())) return;
    if (parsed.getTime() <= Date.now()) return; // must be in the future

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading('reschedule');
    try {
      const newIso = parsed.toISOString().split('T')[0];
      const updated: ImmunizationRecord = {
        ...record,
        nextDoseDate: newIso,
        nextDoseStatus: 'pending',
        updatedAt: new Date().toISOString(),
      };
      showHealthKitToast(`${record.vaccineName} rescheduled to ${fmtDateFull(newIso)} ✓`);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDoneLabel(`Rescheduled → ${fmtDate(newIso)}`);
      setDone(true);
      onActionComplete(updated);
      setTimeout(onDismiss, 1000);
    } finally {
      setLoading(null);
    }
  }

  // ── Done state ───────────────────────────────────────────────────────────

  if (done) {
    return (
      <View style={[styles.card, { backgroundColor: isDark ? '#14532D30' : '#DCFCE7', borderColor: isDark ? '#16A34A50' : '#BBF7D0' }]}>
        <Text style={{ fontSize: 16 }}>✅</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#4ADE80' : '#15803D', marginLeft: 8 }}>
          {record.vaccineName} — {doneLabel}
        </Text>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <View style={[styles.card, { backgroundColor: urgentBg, borderColor: urgentBorder }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={{ fontSize: 20 }}>💉</Text>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.urgencyLabel, { color: urgentColor }]}>{dueLabel}</Text>
          <Text style={[styles.vaccineName, { color: colors.foreground }]} numberOfLines={1}>
            {record.vaccineName}{doseLabel}
          </Text>
          {record.nextDoseDate && (
            <Text style={[styles.dateText, { color: colors.muted }]}>
              {fmtDate(record.nextDoseDate)}
              {record.administeredBy ? ` · ${record.administeredBy}` : ''}
            </Text>
          )}
        </View>
      </View>

      {/* Pharmacy / clinic row — matches medication refill card pattern */}
      {hasPharmacy && (
        <View style={[styles.pharmacyRow, { backgroundColor: isDark ? '#0F172A50' : '#FFFFFF80', borderColor: colors.border }]}>
          <Text style={[styles.pharmacyName, { color: colors.muted }]} numberOfLines={1}>
            🏥 {record.pharmacyName || 'Pharmacy'}
          </Text>
          <View style={styles.pharmacyBtns}>
            {record.pharmacyAddress ? (
              <TouchableOpacity
                onPress={() => {
                  openMaps(record.pharmacyAddress!);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[styles.pharmacyBtn, { backgroundColor: isDark ? '#1A3A2A' : '#F0FDF4', borderColor: isDark ? '#16A34A40' : '#BBF7D0' }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 11 }}>🗺️</Text>
                <Text style={[styles.pharmacyBtnText, { color: isDark ? '#4ADE80' : '#166534' }]}>Map</Text>
              </TouchableOpacity>
            ) : null}
            {record.pharmacyPhone ? (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Linking.openURL(`tel:${record.pharmacyPhone!.replace(/\D/g, '')}`);
                }}
                style={[styles.pharmacyBtn, { backgroundColor: isDark ? '#1E3A5F40' : '#EFF6FF', borderColor: isDark ? '#3B82F660' : '#BFDBFE' }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 11 }}>📞</Text>
                <Text style={[styles.pharmacyBtnText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>Call</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {/* Action buttons */}
      {!showReschedule && (
        <View style={styles.actionRow}>
          {/* Received */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#14532D40' : '#DCFCE7', borderColor: isDark ? '#16A34A60' : '#BBF7D0' }]}
            onPress={handleReceived}
            disabled={loading !== null}
            activeOpacity={0.75}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#4ADE80' : '#166534' }]}>
              {loading === 'received' ? '…' : '✓ Received'}
            </Text>
          </TouchableOpacity>

          {/* Reschedule */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#1E3A5F40' : '#EFF6FF', borderColor: isDark ? '#3B82F660' : '#BFDBFE' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowReschedule(true);
            }}
            disabled={loading !== null}
            activeOpacity={0.75}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>↻ Later</Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#7F1D1D20' : '#FEF2F2', borderColor: isDark ? '#EF444440' : '#FECACA' }]}
            onPress={handleSkip}
            disabled={loading !== null}
            activeOpacity={0.75}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
              {loading === 'skip' ? '…' : '✗ Skip'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reschedule date input */}
      {showReschedule && (
        <View style={styles.rescheduleRow}>
          <TextInput
            style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            value={newDateStr}
            onChangeText={setNewDateStr}
            keyboardType="default"
            returnKeyType="done"
            onSubmitEditing={handleReschedule}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: isDark ? '#1E3A5F' : '#1D4ED8' }]}
            onPress={handleReschedule}
            disabled={loading !== null}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnText}>{loading === 'reschedule' ? '…' : 'Confirm'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: colors.border }]}
            onPress={() => { setShowReschedule(false); setNewDateStr(''); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Disclaimer */}
      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        Follow your physician&apos;s immunization schedule.
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  urgencyLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  vaccineName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  dateText: {
    fontSize: 11,
  },
  pharmacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 8,
    gap: 6,
  },
  pharmacyName: {
    fontSize: 10,
    flex: 1,
  },
  pharmacyBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  pharmacyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pharmacyBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
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
    marginBottom: 8,
  },
  dateInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  confirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
