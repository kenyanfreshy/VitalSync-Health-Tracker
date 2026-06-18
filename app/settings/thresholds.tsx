/**
 * Threshold Settings Screen
 * Configure alert thresholds for BP, HRV, and Heart Rate.
 * All settings are stored locally in AsyncStorage.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { thresholdStrings } from '@/lib/i18n';
import { useColors, useLang } from '@/hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Switch,
  Alert,
  Platform,
  useColorScheme,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EvidenceRefBanner } from '@/components/ui/evidence-ref-banner';
import {
  loadThresholds,
  saveThresholds,
  DEFAULT_THRESHOLDS,
  loadAnalyteThresholds,
  saveAnalyteThresholds,
  upsertAnalyteThreshold,
  deleteAnalyteThreshold,
  snoozeAnalyte,
  unsnoozeAnalyte,
  loadAnalyteSnoozed,
  loadCorrelationWindowHours,
  saveCorrelationWindowHours,
  DEFAULT_CORRELATION_WINDOW_HOURS,
  type ThresholdConfig,
  type AnalyteThreshold,
  type AnalyteThresholdMap,
  type AnalyteSnoozedMap,
} from '@/lib/notifications/threshold-config';
import {
  REFERENCE_RANGES,
  type LabAnalyteId,
} from '@/lib/health/lab-types';
import {
  registerHealthMonitorTask,
  unregisterHealthMonitorTask,
  getHealthMonitorStatus,
} from '@/lib/notifications/background-task';
import {
  registerBackgroundSyncTask,
  unregisterBackgroundSyncTask,
} from '@/lib/health/background-sync-service';
import { requestNotificationPermissions } from '@/lib/notifications/threshold-checker';
import {
  loadAlertHistory,
  clearAlertHistory,
  clearUnreadAlertCount,
  formatAlertAge,
  CATEGORY_LABELS,
  type AlertHistoryEntry,
} from '@/lib/notifications/alert-history';
import { clearAnalyteAlertBadge } from '@/lib/notifications/analyte-alert-badge';
import { ViolationFrequencyChart } from '@/components/charts/violation-frequency-chart';
import {
  loadGlucoseThresholds,
  saveGlucoseThresholds,
  DEFAULT_GLUCOSE_THRESHOLDS,
  type GlucoseThresholdConfig,
} from '@/lib/health/glucose-thresholds';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { getNotificationsAsync } from '@/lib/notifications/safe-notifications';
import { safeSetItem } from '@/lib/safe-async-storage';

// Glucose unit conversion helpers
const mgToMmol = (mg: number) => Math.round((mg / 18.0182) * 10) / 10;
const mmolToMg = (mmol: number) => Math.round(mmol * 18.0182);

// ─── AddAnalyteForm ──────────────────────────────────────────────────────────

const ALL_ANALYTE_IDS = Object.keys(REFERENCE_RANGES) as LabAnalyteId[];

function AddAnalyteForm({
  currentAnalyteId,
  existingIds,
  onCancel,
  onSave,
  colors,
  isDark,
  initialValues,
}: {
  currentAnalyteId: LabAnalyteId;
  existingIds: LabAnalyteId[];
  onCancel: () => void;
  onSave: (t: AnalyteThreshold) => Promise<void>;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  isDark: boolean;
  initialValues?: AnalyteThreshold;
}) {
  const _lang = useLang();
  const t = (thresholdStrings as unknown as Record<string, typeof thresholdStrings.en>)[_lang];
  const [analyteId, setAnalyteId] = useState<LabAnalyteId>(currentAnalyteId);
  const [alertHigh, setAlertHigh] = useState(initialValues?.alertHigh ?? true);
  const [alertLow, setAlertLow] = useState(initialValues?.alertLow ?? false);
  const [customHighText, setCustomHighText] = useState(
    initialValues?.customHigh != null ? String(initialValues.customHigh) : ''
  );
  const [customLowText, setCustomLowText] = useState(
    initialValues?.customLow != null ? String(initialValues.customLow) : ''
  );
  const [pickerVisible, setPickerVisible] = useState(false);

  const ref = REFERENCE_RANGES[analyteId];
  const availableIds = ALL_ANALYTE_IDS.filter(id => !existingIds.includes(id));

  const handleSave = async () => {
    if (!alertHigh && !alertLow) {
      Alert.alert(t.selectDirection, t.selectDirectionMsg);
      return;
    }
    const highVal = parseFloat(customHighText);
    const lowVal = parseFloat(customLowText);
    await onSave({
      analyteId,
      enabled: true,
      alertHigh,
      alertLow,
      customHigh: alertHigh && !isNaN(highVal) && highVal > 0 ? highVal : undefined,
      customLow: alertLow && !isNaN(lowVal) && lowVal > 0 ? lowVal : undefined,
    });
  };

  return (
    <View style={[addFormStyles.container, {
      backgroundColor: isDark ? colors.surface : colors.background,
      borderColor: '#2563EB40',
    }]}>
      {/* Analyte picker */}
      <Text style={[addFormStyles.label, { color: colors.muted }]}>{t.analyte}</Text>
      <Pressable
        style={[addFormStyles.pickerBtn, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surface,
          borderColor: colors.border,
        }]}
        onPress={() => setPickerVisible(v => !v)}
      >
        <Text style={[addFormStyles.pickerBtnText, { color: colors.foreground }]}>
          {ref?.label ?? analyteId}
        </Text>
        <IconSymbol name="chevron.right" size={12} color={colors.muted}
          style={{ transform: [{ rotate: pickerVisible ? '90deg' : '0deg' }] }} />
      </Pressable>
      {pickerVisible && (
        <ScrollView style={[addFormStyles.pickerList, { backgroundColor: isDark ? colors.surfaceRaised : colors.surface, borderColor: colors.border }]}
          nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {availableIds.map(id => (
            <Pressable
              key={id}
              style={({ pressed }) => [addFormStyles.pickerItem, {
                backgroundColor: id === analyteId ? '#2563EB12' : 'transparent',
                opacity: pressed ? 0.7 : 1,
              }]}
              onPress={() => { setAnalyteId(id); setPickerVisible(false); }}
            >
              <Text style={[addFormStyles.pickerItemText, { color: id === analyteId ? '#2563EB' : colors.foreground }]}>
                {REFERENCE_RANGES[id]?.label ?? id}
              </Text>
              <Text style={[addFormStyles.pickerItemUnit, { color: colors.muted }]}>
                {REFERENCE_RANGES[id]?.unit}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Alert directions */}
      <Text style={[addFormStyles.label, { color: colors.muted, marginTop: 8 }]}>{t.alertWhenValueIs}</Text>
      <View style={addFormStyles.dirRow}>
        <Pressable
          style={[addFormStyles.dirChip, {
            backgroundColor: alertHigh ? '#EF444420' : colors.surface,
            borderColor: alertHigh ? '#EF4444' : colors.border,
          }]}
          onPress={() => setAlertHigh(v => !v)}
        >
          <Text style={[addFormStyles.dirChipText, { color: alertHigh ? '#EF4444' : colors.muted }]}>↑ {t.highAlert}</Text>
        </Pressable>
        <Pressable
          style={[addFormStyles.dirChip, {
            backgroundColor: alertLow ? '#F59E0B20' : colors.surface,
            borderColor: alertLow ? '#F59E0B' : colors.border,
          }]}
          onPress={() => setAlertLow(v => !v)}
        >
          <Text style={[addFormStyles.dirChipText, { color: alertLow ? '#F59E0B' : colors.muted }]}>↓ {t.lowAlert}</Text>
        </Pressable>
      </View>

      {/* Custom bounds */}
      {alertHigh && (
        <View style={addFormStyles.boundRow}>
          <Text style={[addFormStyles.boundLabel, { color: colors.muted }]}>
            {t.highThreshold} ({ref?.unit})
          </Text>
          <TextInput
            style={[addFormStyles.boundInput, {
              color: '#EF4444',
              borderColor: '#EF444440',
              backgroundColor: isDark ? colors.surfaceRaised : colors.surface,
            }]}
            value={customHighText}
            onChangeText={setCustomHighText}
            placeholder={String(ref?.high ?? '')}
            placeholderTextColor={colors.muted}
            keyboardType="default"
            returnKeyType="done"
          />
        </View>
      )}
      {alertLow && (
        <View style={addFormStyles.boundRow}>
          <Text style={[addFormStyles.boundLabel, { color: colors.muted }]}>
            {t.lowThreshold} ({ref?.unit})
          </Text>
          <TextInput
            style={[addFormStyles.boundInput, {
              color: '#F59E0B',
              borderColor: '#F59E0B40',
              backgroundColor: isDark ? colors.surfaceRaised : colors.surface,
            }]}
            value={customLowText}
            onChangeText={setCustomLowText}
            placeholder={String(ref?.low ?? '')}
            placeholderTextColor={colors.muted}
            keyboardType="default"
            returnKeyType="done"
          />
        </View>
      )}

      {ref && (
        <Text style={[addFormStyles.refNote, { color: colors.muted }]}>
          {t.referenceRange}: {ref.low}–{ref.high} {ref.unit}
        </Text>
      )}

      {/* Actions */}
      <View style={addFormStyles.formActions}>
        <Pressable
          style={({ pressed }) => [addFormStyles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          onPress={onCancel}
        >
          <Text style={[addFormStyles.cancelBtnText, { color: colors.muted }]}>{t.cancel}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [addFormStyles.saveBtn, { backgroundColor: '#2563EB', opacity: pressed ? 0.8 : 1 }]}
          onPress={handleSave}
        >
          <Text style={addFormStyles.saveBtnText}>{t.saveAlert}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const addFormStyles = StyleSheet.create({
  container: {
    borderRadius: 12, borderWidth: 1, padding: 12, gap: 6,
  },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  pickerBtnText: { fontSize: 14, fontWeight: '600' },
  pickerList: {
    maxHeight: 160, borderWidth: 1, borderRadius: 8, marginTop: 2,
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  pickerItemText: { fontSize: 13, fontWeight: '500' },
  pickerItemUnit: { fontSize: 11 },
  dirRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  dirChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: 8, borderWidth: 1,
  },
  dirChipText: { fontSize: 13, fontWeight: '700' },
  boundRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4,
  },
  boundLabel: { fontSize: 12, fontWeight: '500', flex: 1 },
  boundInput: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 16, fontWeight: '700', minWidth: 80, textAlign: 'right',
  },
  refNote: { fontSize: 10, marginTop: 2 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: 8, borderWidth: 1,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '600' },
  saveBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8,
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

export default function ThresholdSettingsScreen() {
  const colors = useColors();
  const lang = useLang();
  const t = ((thresholdStrings as unknown as Record<string, typeof thresholdStrings.en>)[lang] ?? thresholdStrings.en);
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const { glucoseUnit } = useUnitPreferences();
  const isMmol = glucoseUnit === 'mmol/L';

  const [config, setConfig] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [glucoseConfig, setGlucoseConfig] = useState<GlucoseThresholdConfig>(DEFAULT_GLUCOSE_THRESHOLDS);
  const [isTaskRegistered, setIsTaskRegistered] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isSaving, setIsSaving] = useState(false);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<string>('all');

  // Derived: most recent glucose alert entry (for Last Alert badge)
  const lastGlucoseAlert = alertHistory.find((e) => e.category === 'glucose') ?? null;
  const [analyteThresholds, setAnalyteThresholds] = useState<AnalyteThresholdMap>({});
  const [analyteSnoozed, setAnalyteSnoozed] = useState<AnalyteSnoozedMap>({});
  const [analyteExpanded, setAnalyteExpanded] = useState(false);
  const [addAnalyteId, setAddAnalyteId] = useState<LabAnalyteId | null>(null);
  const [editingAnalyteId, setEditingAnalyteId] = useState<LabAnalyteId | null>(null);
  const [corrWindow, setCorrWindow] = useState(DEFAULT_CORRELATION_WINDOW_HOURS);

  useEffect(() => {
    // Clear the unread badge (general + analyte) when user visits this screen
    clearUnreadAlertCount().catch(() => {});
    clearAnalyteAlertBadge().catch(() => {});

    async function init() {
      const [saved, taskStatus, history, analyteMap, snoozedMap, windowHours, glucoseSaved] = await Promise.all([
        loadThresholds(),
        getHealthMonitorStatus(),
        loadAlertHistory(),
        loadAnalyteThresholds(),
        loadAnalyteSnoozed(),
        loadCorrelationWindowHours(),
        loadGlucoseThresholds(),
      ]);
      setConfig(saved);
      setGlucoseConfig(glucoseSaved);
      setIsTaskRegistered(taskStatus.isRegistered);
      setAlertHistory(history);
      setAnalyteThresholds(analyteMap);
      setAnalyteSnoozed(snoozedMap);
      setCorrWindow(windowHours);

      // Restore persisted history filter chip
      const savedFilter = await AsyncStorage.getItem('@vsht:alertHistoryFilter').catch(() => null);
      if (savedFilter) setHistoryFilter(savedFilter);

      if (Platform.OS !== 'web') {
        const _notif = await getNotificationsAsync();
        const { status } = _notif ? await _notif.getPermissionsAsync() : { status: 'undetermined' as const };
        setHasPermission(status === 'granted');
      }
    }
    init();
  }, []);

  async function handleClearHistory() {
    Alert.alert(
      t.clearAlertHistory,
      t.clearAlertHistoryMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.clear,
          style: 'destructive',
          onPress: async () => {
            await clearAlertHistory();
            setAlertHistory([]);
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  }

  const handleSave = useCallback(async (updated: ThresholdConfig) => {
    setIsSaving(true);
    try {
      await saveThresholds(updated);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (_unused) {
      Alert.alert(t.errorTitle ?? 'Error', t.errorSave);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<ThresholdConfig>) => {
      const updated = { ...config, ...patch };
      setConfig(updated);
      handleSave(updated);
    },
    [config, handleSave]
  );

  const updateGlucoseConfig = useCallback(
    (patch: Partial<GlucoseThresholdConfig>) => {
      const updated = { ...glucoseConfig, ...patch };
      setGlucoseConfig(updated);
      saveGlucoseThresholds(updated).catch(() => {});
    },
    [glucoseConfig]
  );

  async function handleToggleAlerts(enabled: boolean) {
    if (enabled && !hasPermission) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          t.permRequired,
          t.permRequiredMsg,
          [{ text: t.ok }]
        );
        return;
      }
      setHasPermission(true);
    }

    if (enabled) {
      await registerHealthMonitorTask();
      await registerBackgroundSyncTask();
      setIsTaskRegistered(true);
    } else {
      await unregisterHealthMonitorTask();
      await unregisterBackgroundSyncTask();
      setIsTaskRegistered(false);
    }

    updateConfig({ enabled });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  function NumericInput({
    label,
    value,
    unit,
    onCommit,
    color,
  }: {
    label: string;
    value: number;
    unit: string;
    onCommit: (v: number) => void;
    color: string;
  }) {
    const [text, setText] = useState(String(value));

    return (
      <View style={styles.numericRow}>
        <Text style={[styles.numericLabel, { color: colors.muted }]}>{label}</Text>
        <View style={[styles.numericInputWrap, {
          backgroundColor: isDark ? colors.surface : colors.background,
          borderColor: isDark ? colors.borderStrong : colors.border,
        }]}>
          <TextInput
            style={[styles.numericInput, { color: color }]}
            value={text}
            onChangeText={setText}
            keyboardType="default"
            returnKeyType="done"
            onBlur={() => {
              const n = parseFloat(text);
              if (!isNaN(n) && n > 0) {
                onCommit(n);
              } else {
                setText(String(value));
              }
            }}
          />
          <Text style={[styles.numericUnit, { color: colors.muted }]}>{unit}</Text>
        </View>
      </View>
    );
  }

  function SectionCard({
    title,
    icon,
    iconColor,
    enabled,
    onToggle,
    children,
  }: {
    title: string;
    icon: string;
    iconColor: string;
    enabled: boolean;
    onToggle: (v: boolean) => void;
    children: React.ReactNode;
  }) {
    return (
      <View style={[styles.card, {
        backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
        borderColor: isDark ? colors.borderStrong : colors.border,
        shadowColor: isDark ? '#000' : colors.shadowBase,
        shadowOpacity: isDark ? 0.4 : 0.06,
      }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconWrap, { backgroundColor: iconColor + '18' }]}>
            <IconSymbol name={icon as any} size={16} color={iconColor} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
          <Switch
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: iconColor + '60' }}
            thumbColor={enabled ? iconColor : colors.muted}
          />
        </View>
        {enabled && (
          <View style={[styles.cardBody, { borderTopColor: isDark ? colors.borderStrong : colors.border }]}>
            {children}
          </View>
        )}
      </View>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderStrong : colors.border }]}>
        <Pressable
          style={[styles.backBtn, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
          }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={14} color={colors.muted} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t.healthAlerts}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {isTaskRegistered ? t.backgroundMonitoringActive : t.monitoringInactive}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Master Toggle */}
        <View style={[styles.masterCard, {
          backgroundColor: config.enabled
            ? colors.bpGreen + (isDark ? '22' : '12')
            : isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: config.enabled
            ? colors.bpGreen + (isDark ? '40' : '30')
            : isDark ? colors.borderStrong : colors.border,
        }]}>
          <View style={styles.masterRow}>
            <View style={styles.masterLeft}>
              <Text style={[styles.masterTitle, { color: colors.foreground }]}>
                {t.healthAlerts}
              </Text>
              <Text style={[styles.masterSub, { color: colors.muted }]}>
                {config.enabled
                  ? t.backgroundActive
                  : t.enableToReceive}
              </Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={handleToggleAlerts}
              trackColor={{ false: colors.border, true: colors.bpGreen + '60' }}
              thumbColor={config.enabled ? colors.bpGreen : colors.muted}
            />
          </View>
          {config.enabled && !hasPermission && Platform.OS !== 'web' && (
            <Text style={[styles.permWarning, { color: colors.bpAmber }]}>
              ⚠ {t.permWarning}
            </Text>
          )}
        </View>

        {/* Blood Pressure Thresholds */}
        <SectionCard
          title={t.bloodPressure ?? "Blood Pressure"}
          icon="heart.fill"
          iconColor={colors.bpGreen}
          enabled={config.bp.enabled}
          onToggle={(v) => updateConfig({ bp: { ...config.bp, enabled: v } })}
        >
          <NumericInput
            label={t.systolicHigh ?? "Systolic High"}
            value={config.bp.systolicHigh}
            unit="mmHg"
            color={colors.error}
            onCommit={(v) => updateConfig({ bp: { ...config.bp, systolicHigh: v } })}
          />
          <NumericInput
            label={t.systolicLow ?? "Systolic Low"}
            value={config.bp.systolicLow}
            unit="mmHg"
            color={colors.bodyBlue}
            onCommit={(v) => updateConfig({ bp: { ...config.bp, systolicLow: v } })}
          />
          <NumericInput
            label={t.diastolicHigh ?? "Diastolic High"}
            value={config.bp.diastolicHigh}
            unit="mmHg"
            color={colors.bpAmber}
            onCommit={(v) => updateConfig({ bp: { ...config.bp, diastolicHigh: v } })}
          />
          <NumericInput
            label={t.diastolicLow ?? "Diastolic Low"}
            value={config.bp.diastolicLow}
            unit="mmHg"
            color={colors.primary}
            onCommit={(v) => updateConfig({ bp: { ...config.bp, diastolicLow: v } })}
          />
        </SectionCard>

        {/* HRV Thresholds */}
        <SectionCard
          title={t.hrv ?? "Heart Rate Variability (HRV)"}
          icon="monitor-heart"
          iconColor={colors.accent}
          enabled={config.hrv.enabled}
          onToggle={(v) => updateConfig({ hrv: { ...config.hrv, enabled: v } })}
        >
          <NumericInput
            label={t.lowHrv ?? "Low HRV Alert"}
            value={config.hrv.low}
            unit="ms"
            color={colors.accent}
            onCommit={(v) => updateConfig({ hrv: { ...config.hrv, low: v } })}
          />
          <Text style={[styles.hint, { color: colors.muted }]}>
            {t.hrvHint}
          </Text>
          {/* Normal range note */}
          <View style={[styles.spo2NoteRow, {
            backgroundColor: colors.accent + (isDark ? '12' : '08'),
            borderColor: colors.accent + (isDark ? '30' : '18'),
          }]}>
            <Text style={[styles.spo2NoteText, { color: colors.muted }]}>
              {t.hrvNormalRange}
            </Text>
          </View>
        </SectionCard>

        {/* Heart Rate Thresholds */}
        <SectionCard
          title={t.heartRate ?? "Heart Rate"}
          icon="bolt.heart.fill"
          iconColor={colors.heartRed}
          enabled={config.heartRate.enabled}
          onToggle={(v) => updateConfig({ heartRate: { ...config.heartRate, enabled: v } })}
        >
          <NumericInput
            label={t.highBpm ?? "High bpm Alert"}
            value={config.heartRate.high}
            unit="bpm"
            color={colors.error}
            onCommit={(v) => updateConfig({ heartRate: { ...config.heartRate, high: v } })}
          />
          <NumericInput
            label={t.lowBpm ?? "Low bpm Alert"}
            value={config.heartRate.low}
            unit="bpm"
            color={colors.bodyBlue}
            onCommit={(v) => updateConfig({ heartRate: { ...config.heartRate, low: v } })}
          />
        </SectionCard>

        {/* Resting Heart Rate Thresholds */}
        <SectionCard
          title={t.restingHR ?? "Resting Heart Rate"}
          icon="heart.fill"
          iconColor={colors.warning ?? '#F59E0B'}
          enabled={config.restingHeartRate?.enabled ?? true}
          onToggle={(v) => updateConfig({ restingHeartRate: { ...config.restingHeartRate, enabled: v, high: config.restingHeartRate?.high ?? 80, consecutiveDays: config.restingHeartRate?.consecutiveDays ?? 3 } })}
        >
          <NumericInput
            label={t.highRestingHr ?? "High Resting HR Alert"}
            value={config.restingHeartRate?.high ?? 80}
            unit="bpm"
            color={colors.error}
            onCommit={(v) => updateConfig({ restingHeartRate: { ...config.restingHeartRate, enabled: config.restingHeartRate?.enabled ?? true, high: v, consecutiveDays: config.restingHeartRate?.consecutiveDays ?? 3 } })}
          />
          <NumericInput
            label={t.consecutiveDays ?? "Consecutive Days"}
            value={config.restingHeartRate?.consecutiveDays ?? 3}
            unit="days"
            color={colors.warning ?? '#F59E0B'}
            onCommit={(v) => updateConfig({ restingHeartRate: { ...config.restingHeartRate, enabled: config.restingHeartRate?.enabled ?? true, high: config.restingHeartRate?.high ?? 80, consecutiveDays: Math.max(1, Math.min(7, v)) } })}
          />
          <View style={[styles.spo2NoteRow, {
            backgroundColor: (colors.warning ?? '#F59E0B') + (isDark ? '12' : '08'),
            borderColor: (colors.warning ?? '#F59E0B') + (isDark ? '30' : '18'),
          }]}>
            <Text style={[styles.spo2NoteText, { color: colors.muted }]}>
              {t.highRestingHRNote}
            </Text>
          </View>
        </SectionCard>

        {/* ─── AFib / EKG Alerts ───────────────────────────────────────────────────────────────────── */}
        <SectionCard
          title={t.afibAlerts ?? 'AFib Alerts'}
          icon="waveform.path.ecg"
          iconColor="#EF4444"
          enabled={config.ekg?.enabled ?? true}
          onToggle={(v) => updateConfig({ ekg: { ...config.ekg, enabled: v, cooldownHours: config.ekg?.cooldownHours ?? 4 } })}
        >
          <NumericInput
            label={t.afibCooldown ?? 'Alert Cooldown (hours)'}
            value={config.ekg?.cooldownHours ?? 4}
            unit="h"
            color="#EF4444"
            onCommit={(v) => updateConfig({ ekg: { enabled: config.ekg?.enabled ?? true, cooldownHours: Math.max(1, Math.min(24, Math.round(v))) } })}
          />
          <View style={[styles.spo2NoteRow, {
            backgroundColor: '#EF444412',
            borderColor: '#EF444430',
          }]}>
            <Text style={[styles.spo2NoteText, { color: colors.muted }]}>
              {t.afibCooldownHint ?? 'Alert fires when a new Atrial Fibrillation recording is logged. Minimum time between alerts: 1–24 hours.'}
            </Text>
          </View>
        </SectionCard>

        {/* SpO₂ Thresholds */}
        <SectionCard
          title={t.spo2 ?? "Blood Oxygen (SpO₂)"}
          icon="lungs.fill"
          iconColor={colors.spo2Blue ?? colors.primary}
          enabled={config.spo2?.enabled ?? true}
          onToggle={(v) => updateConfig({ spo2: { ...config.spo2, enabled: v, low: config.spo2?.low ?? 94 } })}
        >
          <NumericInput
            label={t.lowSpo2 ?? "Low SpO₂ Alert"}
            value={config.spo2?.low ?? 94}
            unit="%"
            color={colors.bodyBlue}
            onCommit={(v) => updateConfig({ spo2: { ...config.spo2, enabled: config.spo2?.enabled ?? true, low: v, high: config.spo2?.high ?? 100 } })}
          />
          <NumericInput
            label={t.highSpo2 ?? "High SpO₂ Alert"}
            value={config.spo2?.high ?? 100}
            unit="%"
            color={colors.error}
            onCommit={(v) => updateConfig({ spo2: { ...config.spo2, enabled: config.spo2?.enabled ?? true, low: config.spo2?.low ?? 94, high: v } })}
          />
          {/* Normal range note */}
          <View style={[styles.spo2NoteRow, {
            backgroundColor: (colors.spo2Blue ?? colors.primary) + (isDark ? '12' : '08'),
            borderColor: (colors.spo2Blue ?? colors.primary) + (isDark ? '30' : '18'),
          }]}>
            <Text style={[styles.spo2NoteText, { color: colors.muted }]}>
              {t.spo2NormalRange}
            </Text>
          </View>
        </SectionCard>

        {/* ─── Blood Glucose Alerts ─────────────────────────────────────────────────────────── */}
        <SectionCard
          title={t.bloodGlucose ?? "Blood Glucose Alerts"}
          icon="drop.fill"
          iconColor="#DC2626"
          enabled={glucoseConfig.alertHigh || glucoseConfig.alertLow}
          onToggle={(v) => updateGlucoseConfig({ alertHigh: v, alertLow: v })}
        >
          {/* High Alert row */}
          <View style={styles.glucoseAlertRow}>
            <View style={styles.glucoseAlertLeft}>
              <View style={[styles.glucoseAlertDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.glucoseAlertLabel, { color: colors.foreground }]}>{t.highAlert}</Text>
            </View>
            <Switch
              value={glucoseConfig.alertHigh}
              onValueChange={(v) => updateGlucoseConfig({ alertHigh: v })}
              trackColor={{ true: '#EF444488' }}
              thumbColor={glucoseConfig.alertHigh ? '#EF4444' : colors.muted}
            />
          </View>
          {glucoseConfig.alertHigh && (
            <View style={styles.glucoseInputRow}>
              <TextInput
                style={[styles.glucoseInput, { color: '#EF4444', borderColor: '#EF444440',
                  backgroundColor: isDark ? colors.surface : colors.background }]}
                value={isMmol ? String(mgToMmol(glucoseConfig.highMgDl)) : String(glucoseConfig.highMgDl)}
                onChangeText={(t) => {
                  const n = parseFloat(t);
                  if (!isNaN(n)) {
                    const min = isMmol ? 2.0 : 36; const max = isMmol ? 27.8 : 500;
                    if (n >= min && n <= max) updateGlucoseConfig({ highMgDl: isMmol ? mmolToMg(n) : Math.round(n) });
                  }
                }}
                keyboardType="default"
                returnKeyType="done"
                maxLength={5}
                placeholderTextColor={colors.muted}
              />
              <Text style={[styles.glucoseInputUnit, { color: colors.muted }]}>
                {isMmol ? 'mmol/L' : 'mg/dL'}
              </Text>
            </View>
          )}
          <Text style={[styles.hint, { color: colors.muted }]}>
            ADA default: {isMmol ? '10.0 mmol/L' : '180 mg/dL'}
          </Text>

          {/* Low Alert row */}
          <View style={[styles.glucoseAlertRow, { marginTop: 8 }]}>
            <View style={styles.glucoseAlertLeft}>
              <View style={[styles.glucoseAlertDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[styles.glucoseAlertLabel, { color: colors.foreground }]}>{t.lowAlert}</Text>
            </View>
            <Switch
              value={glucoseConfig.alertLow}
              onValueChange={(v) => updateGlucoseConfig({ alertLow: v })}
              trackColor={{ true: '#F59E0B88' }}
              thumbColor={glucoseConfig.alertLow ? '#F59E0B' : colors.muted}
            />
          </View>
          {glucoseConfig.alertLow && (
            <View style={styles.glucoseInputRow}>
              <TextInput
                style={[styles.glucoseInput, { color: '#F59E0B', borderColor: '#F59E0B40',
                  backgroundColor: isDark ? colors.surface : colors.background }]}
                value={isMmol ? String(mgToMmol(glucoseConfig.lowMgDl)) : String(glucoseConfig.lowMgDl)}
                onChangeText={(t) => {
                  const n = parseFloat(t);
                  if (!isNaN(n)) {
                    const min = isMmol ? 1.0 : 18; const max = isMmol ? 22.2 : 400;
                    if (n >= min && n <= max) updateGlucoseConfig({ lowMgDl: isMmol ? mmolToMg(n) : Math.round(n) });
                  }
                }}
                keyboardType="default"
                returnKeyType="done"
                maxLength={5}
                placeholderTextColor={colors.muted}
              />
              <Text style={[styles.glucoseInputUnit, { color: colors.muted }]}>
                {isMmol ? 'mmol/L' : 'mg/dL'}
              </Text>
            </View>
          )}
          <Text style={[styles.hint, { color: colors.muted }]}>
            ADA default: {isMmol ? '3.9 mmol/L' : '70 mg/dL'}
          </Text>

          {/* TIR Goal */}
          <View style={[styles.glucoseAlertRow, { marginTop: 8 }]}>
            <Text style={[styles.glucoseAlertLabel, { color: colors.foreground, flex: 1 }]}>{t.tirGoal}</Text>
            <View style={styles.glucoseInputRow}>
              <TextInput
                style={[styles.glucoseInput, { color: '#10B981', borderColor: '#10B98140',
                  backgroundColor: isDark ? colors.surface : colors.background }]}
                value={String(glucoseConfig.tirGoalPct)}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n)) updateGlucoseConfig({ tirGoalPct: Math.min(100, Math.max(1, n)) });
                }}
                keyboardType="default"
                returnKeyType="done"
                maxLength={3}
                placeholderTextColor={colors.muted}
              />
              <Text style={[styles.glucoseInputUnit, { color: colors.muted }]}>%</Text>
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            ADA recommends ≥70% of readings in {isMmol ? '3.9–10.0 mmol/L' : '70–180 mg/dL'}.
          </Text>

          {/* Last Alert badge — always visible */}
          <View style={[{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            marginTop: 8, paddingVertical: 5, paddingHorizontal: 10,
            borderRadius: 20, alignSelf: 'flex-start',
            backgroundColor: lastGlucoseAlert
              ? (isDark ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.08)')
              : (isDark ? 'rgba(148,163,184,0.10)' : 'rgba(100,116,139,0.08)'),
            borderWidth: 1,
            borderColor: lastGlucoseAlert ? 'rgba(220,38,38,0.20)' : 'rgba(148,163,184,0.25)',
          }]}>
            <IconSymbol
              name={lastGlucoseAlert ? 'bolt.fill' : 'checkmark.shield.fill'}
              size={10}
              color={lastGlucoseAlert ? '#DC2626' : colors.muted}
            />
            <Text style={{
              fontSize: 11,
              color: lastGlucoseAlert ? '#DC2626' : colors.muted,
              fontWeight: '600',
            }}>
              {lastGlucoseAlert
                ? `${t.lastAlert}: ${formatAlertAge(lastGlucoseAlert.timestamp)}`
                : t.noAlertsRecorded}
            </Text>
          </View>

          {/* Link to full glucose settings */}
          <Pressable
            onPress={() => router.push('/settings/glucose-thresholds' as never)}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
              paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
              backgroundColor: 'rgba(220,38,38,0.06)', borderWidth: 1,
              borderColor: 'rgba(220,38,38,0.20)',
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600', flex: 1 }}>
              {t.fastingTargets}
            </Text>
            <IconSymbol name="chevron.right" size={12} color="#DC2626" />
          </Pressable>
        </SectionCard>

        {/* ─── Per-Analyte Lab Thresholds ───────────────────────────────────────────────────────── */}
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.4 : 0.06,
        }]}>
          {/* Section header */}
          <Pressable
            style={styles.cardHeader}
            onPress={() => {
              setAnalyteExpanded(v => !v);
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={[styles.cardIconWrap, { backgroundColor: '#2563EB18' }]}>
              <IconSymbol name="cross.case.fill" size={16} color="#2563EB" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t.labAnalyteAlerts}</Text>
            <Text style={[styles.historyCount, { color: colors.muted }]}>
              {Object.keys(analyteThresholds).length > 0
                ? `${Object.keys(analyteThresholds).length} ${t.configured}`
                : 'None'}
            </Text>
            <IconSymbol
              name="chevron.right"
              size={14}
              color={colors.muted}
              style={{ transform: [{ rotate: analyteExpanded ? '90deg' : '0deg' }] }}
            />
          </Pressable>

          {analyteExpanded && (
            <View style={[styles.cardBody, { borderTopColor: isDark ? colors.borderStrong : colors.border }]}>
              <Text style={[styles.hint, { color: colors.muted, marginBottom: 4 }]}>
                {t.labAnalyteHint}
              </Text>

              {/* Existing configured analytes */}
              {(Object.values(analyteThresholds) as AnalyteThreshold[]).map((at) => {
                const ref = REFERENCE_RANGES[at.analyteId];
                if (!ref) return null;

                // In-place edit mode for this row
                if (editingAnalyteId === at.analyteId && addAnalyteId === null) {
                  return (
                    <AddAnalyteForm
                      key={at.analyteId}
                      currentAnalyteId={at.analyteId}
                      existingIds={Object.keys(analyteThresholds).filter(id => id !== at.analyteId) as LabAnalyteId[]}
                      initialValues={at}
                      onCancel={() => setEditingAnalyteId(null)}
                      onSave={async (threshold) => {
                        await upsertAnalyteThreshold(threshold);
                        setAnalyteThresholds(prev => ({ ...prev, [threshold.analyteId]: threshold }));
                        setEditingAnalyteId(null);
                        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }}
                      colors={colors}
                      isDark={isDark}
                    />
                  );
                }

                return (
                  <Pressable
                    key={at.analyteId}
                    style={({ pressed }) => [styles.analyteRow, {
                      backgroundColor: at.enabled ? '#2563EB08' : colors.surface,
                      borderColor: at.enabled ? '#2563EB30' : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    }]}
                    onPress={() => {
                      setEditingAnalyteId(at.analyteId);
                      setAddAnalyteId(null);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <View style={styles.analyteRowLeft}>
                      <View style={styles.analyteRowTitleRow}>
                        <Text style={[styles.analyteRowName, { color: colors.foreground }]}>{ref.label}</Text>
                        <View style={[styles.analyteRowUnit, { backgroundColor: colors.surface }]}>
                          <Text style={[styles.analyteRowUnitText, { color: colors.muted }]}>{ref.unit}</Text>
                        </View>
                      </View>
                      <View style={styles.analyteRowBounds}>
                        {at.alertHigh && (
                          <Text style={[styles.analyteRowBoundText, { color: colors.error }]}>
                            ↑ &gt;{at.customHigh ?? ref.high} {ref.unit}
                          </Text>
                        )}
                        {at.alertLow && (
                          <Text style={[styles.analyteRowBoundText, { color: '#F59E0B' }]}>
                            ↓ &lt;{at.customLow ?? ref.low} {ref.unit}
                          </Text>
                        )}
                        {!at.alertHigh && !at.alertLow && (
                          <Text style={[styles.analyteRowBoundText, { color: colors.muted }]}>{t.tapToConfigure}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.analyteRowActions}>
                      {/* Snooze duration picker */}
                      {(() => {
                        const snoozeExpiry = analyteSnoozed[at.analyteId];
                        const isSnoozed = snoozeExpiry ? new Date(snoozeExpiry) > new Date() : false;
                        const SNOOZE_OPTIONS = [
                          { label: '4 hours', hours: 4 },
                          { label: '12 hours', hours: 12 },
                          { label: '24 hours', hours: 24 },
                          { label: '48 hours', hours: 48 },
                        ];
                        const handleSnoozePress = () => {
                          if (isSnoozed) {
                            // Cancel snooze immediately
                            unsnoozeAnalyte(at.analyteId).then(() => {
                              setAnalyteSnoozed(prev => { const n = { ...prev }; delete n[at.analyteId]; return n; });
                            });
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            return;
                          }
                          // Show duration picker
                          if (Platform.OS === 'ios') {
                            // eslint-disable-next-line @typescript-eslint/no-require-imports
                            const { ActionSheetIOS } = require('react-native');
                            ActionSheetIOS.showActionSheetWithOptions(
                              {
                                title: `Snooze alerts for ${REFERENCE_RANGES[at.analyteId]?.label ?? at.analyteId}`,
                                options: [...SNOOZE_OPTIONS.map(o => o.label), 'Cancel'],
                                cancelButtonIndex: SNOOZE_OPTIONS.length,
                              },
                              async (idx: number) => {
                                if (idx < SNOOZE_OPTIONS.length) {
                                  const h = SNOOZE_OPTIONS[idx].hours;
                                  await snoozeAnalyte(at.analyteId, h);
                                  const expiresAt = new Date(Date.now() + h * 3600_000).toISOString();
                                  setAnalyteSnoozed(prev => ({ ...prev, [at.analyteId]: expiresAt }));
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                              },
                            );
                          } else {
                            // Android / web: use Alert with buttons
                            Alert.alert(
                              `Snooze ${REFERENCE_RANGES[at.analyteId]?.label ?? at.analyteId} alerts`,
                              t.chooseSnoozeDuration,
                              [
                                ...SNOOZE_OPTIONS.map(o => ({
                                  text: o.label,
                                  onPress: async () => {
                                    await snoozeAnalyte(at.analyteId, o.hours);
                                    const expiresAt = new Date(Date.now() + o.hours * 3600_000).toISOString();
                                    setAnalyteSnoozed(prev => ({ ...prev, [at.analyteId]: expiresAt }));
                                  },
                                })),
                                { text: t.cancel, style: 'cancel' as const },
                              ],
                            );
                          }
                        };
                        return (
                          <Pressable
                            style={({ pressed }) => [styles.analyteSnoozeBtn, {
                              backgroundColor: isSnoozed ? '#F59E0B20' : colors.surface,
                              borderColor: isSnoozed ? '#F59E0B60' : colors.border,
                              opacity: pressed ? 0.7 : 1,
                            }]}
                            onPress={handleSnoozePress}
                          >
                            <Text style={[styles.analyteSnoozeText, { color: isSnoozed ? '#F59E0B' : colors.muted }]}>
                              {isSnoozed ? `⏰ ${t.snoozed}` : t.snooze}
                            </Text>
                          </Pressable>
                        );
                      })()}
                      <Switch
                        value={at.enabled}
                        onValueChange={async (v) => {
                          const updated = { ...at, enabled: v };
                          await upsertAnalyteThreshold(updated);
                          setAnalyteThresholds(prev => ({ ...prev, [at.analyteId]: updated }));
                        }}
                        trackColor={{ false: colors.border, true: '#2563EB60' }}
                        thumbColor={at.enabled ? '#2563EB' : colors.muted}
                      />
                      <Pressable
                        style={({ pressed }) => [styles.analyteDeleteBtn, { opacity: pressed ? 0.6 : 1 }]}
                        onPress={async () => {
                          await deleteAnalyteThreshold(at.analyteId);
                          setAnalyteThresholds(prev => {
                            const next = { ...prev };
                            delete next[at.analyteId];
                            return next;
                          });
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }}
                      >
                        <IconSymbol name="trash" size={14} color={colors.error} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}

              {/* Add new analyte threshold */}
              {addAnalyteId === null ? (
                <Pressable
                  style={({ pressed }) => [styles.addAnalyteBtn, {
                    backgroundColor: '#2563EB12',
                    borderColor: '#2563EB40',
                    opacity: pressed ? 0.7 : 1,
                  }]}
                  onPress={() => {
                    // Pick first analyte not yet configured
                    const allIds = Object.keys(REFERENCE_RANGES) as LabAnalyteId[];
                    const unconfigured = allIds.find(id => !analyteThresholds[id]);
                    setAddAnalyteId(unconfigured ?? allIds[0]);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <IconSymbol name="plus" size={14} color="#2563EB" />
                  <Text style={[styles.addAnalyteBtnText, { color: '#2563EB' }]}>{t.addAnalyteAlert}</Text>
                </Pressable>
              ) : (
                <AddAnalyteForm
                  currentAnalyteId={addAnalyteId}
                  existingIds={Object.keys(analyteThresholds) as LabAnalyteId[]}
                  onCancel={() => setAddAnalyteId(null)}
                  onSave={async (threshold) => {
                    await upsertAnalyteThreshold(threshold);
                    setAnalyteThresholds(prev => ({ ...prev, [threshold.analyteId]: threshold }));
                    setAddAnalyteId(null);
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  colors={colors}
                  isDark={isDark}
                />
              )}
            </View>
          )}
        </View>

        {/* Personal Narrative — Correlation Window */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => {}}
          >
            <View style={[styles.sectionIconWrap, { backgroundColor: '#8B5CF6' + '22' }]}>
              <Text style={{ fontSize: 16 }}>🧠</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t.personalNarrative}</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{t.corrWindowSubtitle}: {corrWindow}h</Text>
            </View>
          </Pressable>
          <View style={[styles.sectionBody, { borderTopColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              {t.correlationWindow}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.muted }]}>
              {t.corrWindowHint}
            </Text>
            <View style={styles.corrSliderRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(h => {
                const isActive = h === corrWindow;
                return (
                  <Pressable
                    key={h}
                    style={[styles.corrHourChip,
                      isActive
                        ? { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }
                        : { backgroundColor: 'transparent', borderColor: colors.border },
                    ]}
                    onPress={() => {
                      setCorrWindow(h);
                      saveCorrelationWindowHours(h);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    <Text style={[styles.corrHourText, { color: isActive ? '#fff' : colors.muted }]}>
                      {h}h
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Info card */}
        <View style={[styles.infoCard, {
          backgroundColor: colors.primary + (isDark ? '18' : '08'),
          borderColor: colors.primary + (isDark ? '35' : '20'),
        }]}>
          <Text style={[styles.infoTitle, { color: colors.primary }]}>{t.howItWorks}</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            {t.howItWorksBody}
          </Text>
        </View>

        {/* Recent Alerts History */}
        <View style={[styles.historyCard, {
          backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
          borderColor: isDark ? colors.borderStrong : colors.border,
          shadowColor: isDark ? '#000' : colors.shadowBase,
          shadowOpacity: isDark ? 0.4 : 0.06,
        }]}>
          {/* History header row */}
          <Pressable
            style={styles.historyHeader}
            onPress={() => {
              setHistoryExpanded((v) => !v);
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
          >
            <View style={[styles.historyIconWrap, { backgroundColor: colors.bpAmber + '20' }]}>
              <IconSymbol name="bolt.fill" size={14} color={colors.bpAmber} />
            </View>
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              {t.recentAlerts}
            </Text>
            <Text style={[styles.historyCount, { color: colors.muted }]}>
              {alertHistory.length > 0 ? `${alertHistory.length}` : 'None'}
            </Text>
            <IconSymbol
              name={historyExpanded ? 'chevron.right' : 'chevron.right'}
              size={14}
              color={colors.muted}
              style={{ transform: [{ rotate: historyExpanded ? '90deg' : '0deg' }] }}
            />
          </Pressable>

          {/* 30-day frequency chart */}
          {alertHistory.length > 0 && (
            <View style={[styles.chartSection, { borderTopColor: isDark ? colors.borderStrong : colors.border }]}>
              <Text style={[styles.chartLabel, { color: colors.muted }]}>{t.violationsLast30}</Text>
              <ViolationFrequencyChart history={alertHistory} width={300} height={72} />
            </View>
          )}

          {historyExpanded && (
            <View style={[styles.historyBody, { borderTopColor: isDark ? colors.borderStrong : colors.border }]}>
              {alertHistory.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <IconSymbol name="checkmark.circle.fill" size={28} color={colors.bpGreen} />
                  <Text style={[styles.historyEmptyText, { color: colors.muted }]}>
                    {t.noViolations}
                  </Text>
                </View>
              ) : (
                <>
                  {/* ── Category filter chips ─────────────────────────────── */}
                  {(() => {
                    const FILTER_CHIPS: { key: string; label: string; color: string }[] = [
                      { key: 'all',       label: 'All',    color: colors.muted },
                      { key: 'bp',        label: 'BP',     color: colors.bpGreen },
                      { key: 'hrv',       label: 'HRV',    color: colors.accent },
                      { key: 'heartRate', label: 'HR',     color: colors.heartRed },
                      { key: 'restingHR', label: 'Resting HR', color: '#F97316' },
                      { key: 'spo2',      label: 'SpO₂',   color: colors.spo2Blue ?? colors.primary },
                      { key: 'glucose',   label: 'Glucose', color: '#DC2626' },
                      { key: 'analyte',   label: 'Lab',    color: '#2563EB' },
                    ];
                    // Only show chips for categories that have at least one entry (plus All)
                    const presentCats = new Set(alertHistory.map((e) => e.category));
                    const visibleChips = FILTER_CHIPS.filter(
                      (c) => c.key === 'all' || presentCats.has(c.key as never)
                    );
                    if (visibleChips.length <= 2) return null; // only All + one cat → no need for chips
                    return (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginBottom: 8 }}
                        contentContainerStyle={{ gap: 6, paddingVertical: 4, paddingHorizontal: 2 }}
                      >
                        {visibleChips.map((chip) => {
                          const isActive = historyFilter === chip.key;
                          return (
                            <Pressable
                              key={chip.key}
                              style={[{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: isActive ? chip.color : colors.border,
                                backgroundColor: isActive ? chip.color + '20' : 'transparent',
                              }]}
                              onPress={() => {
                                setHistoryFilter(chip.key);
                                safeSetItem('@vsht:alertHistoryFilter', chip.key).catch(() => {});
                                if (Platform.OS !== 'web') {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                              }}
                            >
                              <Text style={[{
                                fontSize: 11,
                                fontWeight: '600',
                                color: isActive ? chip.color : colors.muted,
                              }]}>{chip.label}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    );
                  })()}

                  {/* ── Filtered history rows ─────────────────────────────── */}
                  {alertHistory
                    .filter((e) => historyFilter === 'all' || e.category === historyFilter)
                    .slice(0, 20)
                    .map((entry) => {
                      const catColor =
                        entry.category === 'bp' ? colors.bpGreen :
                        entry.category === 'hrv' ? colors.accent :
                        entry.category === 'spo2' ? (colors.spo2Blue ?? colors.primary) :
                        entry.category === 'glucose' ? '#DC2626' :
                        entry.category === 'analyte' ? '#2563EB' :
                        colors.heartRed;
                      const dirIcon = entry.direction === 'high' ? '↑' : '↓';
                      return (
                        <View
                          key={entry.id}
                          style={[styles.historyRow, {
                            borderBottomColor: isDark ? colors.borderStrong : colors.border,
                          }]}
                        >
                          <View style={[styles.historyDot, { backgroundColor: catColor + '30' }]}>
                            <Text style={[styles.historyDirIcon, { color: catColor }]}>{dirIcon}</Text>
                          </View>
                          <View style={styles.historyRowContent}>
                            <Text style={[styles.historyRowTitle, { color: colors.foreground }]}>
                              {entry.title.replace(/^[^a-zA-Z]+/, '')}
                            </Text>
                            <Text style={[styles.historyRowMeta, { color: colors.muted }]}>
                              {CATEGORY_LABELS[entry.category]} · {entry.value} {entry.unit} · {formatAlertAge(entry.timestamp)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  {alertHistory.filter((e) => historyFilter === 'all' || e.category === historyFilter).length === 0 && (
                    <View style={styles.historyEmpty}>
                      <Text style={[styles.historyEmptyText, { color: colors.muted }]}>
                        No {CATEGORY_LABELS[historyFilter as never] ?? ''} alerts recorded yet.
                      </Text>
                    </View>
                  )}
                  <Pressable
                    style={[styles.clearBtn, { borderTopColor: isDark ? colors.borderStrong : colors.border }]}
                    onPress={handleClearHistory}
                  >
                    <Text style={[styles.clearBtnText, { color: colors.error }]}>{t.clearHistory}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>

        <EvidenceRefBanner
          accentColor="#F59E0B"
          heading={t.clinicalRefs ?? "Clinical Threshold References"}
          refs={[
            { label: 'AHA/ACC BP Guideline 2017', url: 'https://pubmed.ncbi.nlm.nih.gov/29133354/', badge: 'AHA' },
            { label: 'JNC 8 Hypertension (PMID 24352797)', url: 'https://pubmed.ncbi.nlm.nih.gov/24352797/', badge: 'PMID' },
            { label: 'Task Force HRV Standards', url: 'https://pubmed.ncbi.nlm.nih.gov/8737210/', badge: 'PMID' },
            { label: 'ADA Glycaemic Goals 2024', url: 'https://diabetesjournals.org/care/article/47/Supplement_1/S85/153945/', badge: 'ADA' },
            { label: 'WHO SpO\u2082 Reference', url: 'https://www.who.int/docs/default-source/documents/pulse-oximetry/who-ps-pulse-oximetry-training-manual-en.pdf', badge: 'WHO' },
          ]}
          style={{ marginHorizontal: 0, marginBottom: 0 }}
        />
        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  content: { padding: 16, gap: 12 },
  masterCard: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  masterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  masterLeft: { flex: 1 },
  masterTitle: { fontSize: 16, fontWeight: '700' },
  masterSub: { fontSize: 12, marginTop: 2 },
  permWarning: { fontSize: 11, fontWeight: '600', marginTop: 10 },
  card: {
    borderRadius: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  cardIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  cardBody: {
    paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  numericRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  numericLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
  numericInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    minWidth: 100,
  },
  numericInput: {
    fontSize: 18, fontWeight: '700', minWidth: 50, textAlign: 'right',
  },
  numericUnit: { fontSize: 11, fontWeight: '500' },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  infoCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 4,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  infoText: { fontSize: 12, lineHeight: 18 },
  // History card
  historyCard: {
    borderRadius: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    overflow: 'hidden',
  },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  historyIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  historyTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  historyCount: { fontSize: 12, fontWeight: '600', marginRight: 4 },
  historyBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  historyEmpty: {
    alignItems: 'center', gap: 8, padding: 24,
  },
  historyEmptyText: { fontSize: 13, textAlign: 'center' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyDot: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  historyDirIcon: { fontSize: 14, fontWeight: '800' },
  historyRowContent: { flex: 1 },
  historyRowTitle: { fontSize: 13, fontWeight: '600' },
  historyRowMeta: { fontSize: 11, marginTop: 2 },
  clearBtn: {
    padding: 14, alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  clearBtnText: { fontSize: 13, fontWeight: '700' },
  chartSection: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  chartLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  spo2NoteRow: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  spo2NoteText: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  // Analyte threshold rows
  analyteRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1, padding: 10, gap: 8,
  },
  analyteRowLeft: { flex: 1, gap: 2 },
  analyteRowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  analyteRowName: { fontSize: 13, fontWeight: '700' },
  analyteRowUnit: {
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  analyteRowUnitText: { fontSize: 10, fontWeight: '600' },
  analyteRowBounds: { flexDirection: 'row', gap: 8, marginTop: 2 },
  analyteRowBoundText: { fontSize: 11, fontWeight: '600' },
  analyteRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  analyteDeleteBtn: {
    width: 28, height: 28, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  analyteSnoozeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyteSnoozeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  addAnalyteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingVertical: 10,
  },
  addAnalyteBtnText: { fontSize: 13, fontWeight: '700' },
  fieldHint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  corrSliderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  corrHourChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  corrHourText: { fontSize: 13, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionSubtitle: { fontSize: 12, marginTop: 1 },
  sectionBody: {
    borderTopWidth: 0.5,
    padding: 14,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  section: {
    borderRadius: 14,
    borderWidth: 0.5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  // Glucose alert section styles
  glucoseAlertRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  glucoseAlertLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  glucoseAlertDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  glucoseAlertLabel: {
    fontSize: 14, fontWeight: '600',
  },
  glucoseInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
  },
  glucoseInput: {
    flex: 1, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 18, fontWeight: '700', textAlign: 'right',
  },
  glucoseInputUnit: {
    fontSize: 12, fontWeight: '500', minWidth: 50,
  },
});
