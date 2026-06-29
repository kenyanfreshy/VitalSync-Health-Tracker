/**
 * Weight Log Screen
 * Manual weight entry with kg/lbs toggle, BT sync, Health sync, and trend chart.
 */
import React, { useState, useCallback, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useLang } from '@/hooks';
import { kgToLbs, lbsToKg, type WeightRecord } from '@/lib/health/types';
import { syncWeight, requestDeviceSyncPermissions } from '@/lib/health/device-sync';
// BLE removed — Apple Health integration only
import { logStrings } from '@/lib/i18n';
import { LineChart, normalizeData } from '@/components/charts/line-chart';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';

type Unit = 'kg' | 'lbs';
type Range = 7 | 30 | 90;

const CHART_HEIGHT = 120;
const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - 32; // 16px horizontal padding each side

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function WeightLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const lang = useLang();
  const l = ((logStrings as unknown as Record<string, typeof logStrings.en>)[lang] ?? logStrings.en);
  const { state, addWeight, deleteWeight } = useHealth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = state.data?.weight ?? [];
  const { weightUnit: prefUnit } = useUnitPreferences();

  const [unit, setUnit] = useState<Unit>(prefUnit === 'lbs' ? 'lbs' : 'kg');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [range, setRange] = useState<Range>(30);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    const cutoff = Date.now() - range * 24 * 60 * 60 * 1000;
    return [...records]
      .filter(r => new Date(r.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [records, range]);

  const chartValues = useMemo(
    () => filteredRecords.map(r => unit === 'lbs' ? r.weightLbs : r.weightKg),
    [filteredRecords, unit],
  );

  const chartData = useMemo(() => normalizeData(chartValues), [chartValues]);

  const chartStats = useMemo(() => {
    if (!chartValues.length) return null;
    const min = Math.min(...chartValues);
    const max = Math.max(...chartValues);
    const latest = chartValues[chartValues.length - 1];
    const first = chartValues[0];
    const delta = latest - first;
    return { min, max, latest, delta };
  }, [chartValues]);

  // ── Device sync handlers ───────────────────────────────────────────────────

  const handleDeviceSync = useCallback(async () => {
    setSyncing(true);
    try {
      const hasPermission = await requestDeviceSyncPermissions();
      if (!hasPermission) {
        Alert.alert(l.permissionRequired, l.permissionMsg);
        return;
      }
      const result = await syncWeight(30);
      if (!result.ok) {
        Alert.alert(l.syncFailed, result.error);
        return;
      }
      const existingIds = new Set(records.map((r) => r.id));
      const newRecords = result.records.filter((r) => !existingIds.has(r.id));
      if (!newRecords.length) {
        Alert.alert(l.upToDate, l.noNewWeight);
        return;
      }
      for (const rec of newRecords) {
        await addWeight(rec);
      }
      const sourceName = 'your scale';
      Alert.alert('Synced', l.syncedMsg(newRecords.length, sourceName));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSyncing(false);
    }
  }, [records, addWeight, l]);

  const handleSave = useCallback(async () => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0 || num > 999) {
      Alert.alert(l.invalidWeight, l.invalidWeightMsg);
      return;
    }
    const weightKg = unit === 'kg' ? num : lbsToKg(num);
    const weightLbs = unit === 'lbs' ? num : kgToLbs(num);
    const record: WeightRecord = {
      id: `w-${Date.now()}`,
      timestamp: new Date().toISOString(),
      weightKg,
      weightLbs,
      note: note.trim() || undefined,
      source: 'manual',
    };
    await addWeight(record);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setValue('');
    setNote('');
  }, [value, unit, note, addWeight, l]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(l.deleteEntry, l.deleteWeightMsg, [
      { text: l.cancel, style: 'cancel' },
      {
        text: l.delete, style: 'destructive', onPress: () => {
          deleteWeight(id);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [deleteWeight, l]);



  const s = styles(colors);
  const unitLabel = unit;
  const deltaColor = chartStats
    ? chartStats.delta < 0 ? colors.success : chartStats.delta > 0 ? colors.error : colors.muted
    : colors.muted;

  return (
    <ScreenContainer>


      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}>
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={s.title}>{l.weightTitle}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>

          {/* Health sync */}
          <Pressable
            onPress={handleDeviceSync}
            disabled={syncing}
            style={({ pressed }) => [s.syncBtn, pressed && { opacity: 0.6 }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[s.syncBtnText, { color: colors.primary }]}>{l.syncBtn}</Text>
            }
          </Pressable>
        </View>
      </View>

      <FlatList
        data={records}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={s.empty}>{l.weightEmpty}</Text>
        }
        ListHeaderComponent={
          <>
            {/* Entry Card */}
            <View style={s.card}>
              {/* Unit Toggle */}
              <View style={s.unitRow}>
                {(['lbs', 'kg'] as Unit[]).map(u => (
                  <Pressable
                    key={u}
                    onPress={() => { setUnit(u); setValue(''); }}
                    style={({ pressed }) => [s.unitBtn, unit === u && s.unitBtnActive, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[s.unitLabel, unit === u && s.unitLabelActive]}>{u}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Value Input */}
              <View style={s.inputRow}>
                <TextInput
                  style={s.valueInput}
                  value={value}
                  onChangeText={setValue}
                  placeholder={unit === 'lbs' ? '165.0' : '75.0'}
                  placeholderTextColor={colors.muted}
                  keyboardType="default"
                  returnKeyType="done"
                  maxLength={6}
                />
                <Text style={s.unitSuffix}>{unit}</Text>
              </View>

              {/* Note */}
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={l.notePlaceholder}
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                maxLength={80}
              />

              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
              >
                <Text style={s.saveBtnText}>{l.saveEntry}</Text>
              </Pressable>
            </View>

            {/* Trend Chart Card */}
            <View style={s.chartCard}>
              {/* Chart header row */}
              <View style={s.chartHeader}>
                <Text style={s.chartTitle}>{l.weightTrendTitle ?? 'Weight Trend'}</Text>
                {/* Range selector */}
                <View style={s.rangeRow}>
                  {([7, 30, 90] as Range[]).map(r => (
                    <Pressable
                      key={r}
                      onPress={() => setRange(r)}
                      style={({ pressed }) => [s.rangeBtn, range === r && s.rangeBtnActive, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={[s.rangeLabel, range === r && s.rangeLabelActive]}>{r}d</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Stats row */}
              {chartStats ? (
                <View style={s.statsRow}>
                  <View style={s.statItem}>
                    <Text style={s.statValue}>{chartStats.latest.toFixed(1)}</Text>
                    <Text style={s.statLabel}>{(l.latestLabel ?? 'Latest')} ({unitLabel})</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text style={[s.statValue, { color: deltaColor }]}>
                      {chartStats.delta >= 0 ? '+' : ''}{chartStats.delta.toFixed(1)}
                    </Text>
                    <Text style={s.statLabel}>{(l.changeDLabel ?? '{n}d change').replace('{n}', String(range))}</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text style={s.statValue}>{chartStats.min.toFixed(1)}</Text>
                    <Text style={s.statLabel}>{l.lowLabel ?? 'Low'}</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text style={s.statValue}>{chartStats.max.toFixed(1)}</Text>
                    <Text style={s.statLabel}>{l.highLabel ?? 'High'}</Text>
                  </View>
                </View>
              ) : null}

              {/* Chart or empty state */}
              {chartData.length >= 2 ? (
                <View style={s.chartWrap}>
                  <LineChart
                    data={chartData}
                    width={CHART_W - 32}
                    height={CHART_HEIGHT}
                    color={colors.primary}
                    showDots={chartData.length <= 14}
                    showGradient
                    strokeWidth={2}
                    padding={10}
                  />
                  {/* X-axis labels: first and last date */}
                  {filteredRecords.length >= 2 && (
                    <View style={s.xAxisRow}>
                      <Text style={s.xAxisLabel}>{formatShortDate(filteredRecords[0].timestamp)}</Text>
                      <Text style={s.xAxisLabel}>{formatShortDate(filteredRecords[filteredRecords.length - 1].timestamp)}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={s.chartEmpty}>
                  <Text style={s.chartEmptyText}>
                    {records.length === 0
                      ? 'Log your first weight entry to see the trend'
                      : `No entries in the last ${range} days`}
                  </Text>
                </View>
              )}
            </View>

            {/* History section title */}
            <Text style={s.sectionTitle}>{l.history}</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowValue}>
                {unit === 'lbs' ? `${item.weightLbs} lbs` : `${item.weightKg} kg`}
              </Text>
              <Text style={s.rowSub}>{formatDate(item.timestamp)}</Text>
              {item.note ? <Text style={s.rowNote}>{item.note}</Text> : null}
              {item.id.startsWith('w-vs-') ? (
                <Text style={s.sourceBadge}>From Vitals</Text>
              ) : item.deviceName ? (
                <Text style={s.sourceBadge}>{item.deviceName}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => handleDelete(item.id)}
              style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.5 }]}
            >
              <IconSymbol name="xmark" size={16} color={colors.error} />
            </Pressable>
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: c.foreground },

  // Entry card
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: c.surfaceRaised, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  unitRow: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 10, padding: 3, marginBottom: 14, alignSelf: 'flex-start' },
  unitBtn: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: 8 },
  unitBtnActive: { backgroundColor: c.primary },
  unitLabel: { fontSize: 14, fontWeight: '600', color: c.muted },
  unitLabelActive: { color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  valueInput: { flex: 1, fontSize: 36, fontWeight: '700', color: c.foreground, paddingVertical: 4 },
  unitSuffix: { fontSize: 18, color: c.muted, marginLeft: 8 },
  noteInput: { fontSize: 14, color: c.foreground, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  saveBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Trend chart card
  chartCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: c.surfaceRaised, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: c.foreground },
  rangeRow: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 8, padding: 2, gap: 2 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  rangeBtnActive: { backgroundColor: c.primary },
  rangeLabel: { fontSize: 12, fontWeight: '600', color: c.muted },
  rangeLabelActive: { color: '#fff' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: c.border },
  statValue: { fontSize: 15, fontWeight: '700', color: c.foreground },
  statLabel: { fontSize: 10, color: c.muted, marginTop: 2, textAlign: 'center' },
  chartWrap: { overflow: 'hidden' },
  xAxisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  xAxisLabel: { fontSize: 10, color: c.muted },
  chartEmpty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { fontSize: 13, color: c.muted, textAlign: 'center' },

  // History
  sectionTitle: { fontSize: 15, fontWeight: '700', color: c.foreground, marginHorizontal: 16, marginBottom: 10 },
  empty: { textAlign: 'center', color: c.muted, fontSize: 14, marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceRaised, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border, marginHorizontal: 16 },
  rowLeft: { flex: 1 },
  rowValue: { fontSize: 18, fontWeight: '700', color: c.foreground },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  rowNote: { fontSize: 12, color: c.muted, marginTop: 4, fontStyle: 'italic' },
  deleteBtn: { padding: 8 },
  sourceBadge: { fontSize: 10, fontWeight: '600', color: c.primary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  syncBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  syncBtnText: { fontSize: 14, fontWeight: '600' },

  // Voice UI (kept for compatibility)
  voicePulse: { width: 8, height: 8, borderRadius: 4 },
});
