/**
 * CaloricBreakdownModal
 *
 * Full-screen bottom-sheet style modal showing each day's caloric
 * surplus (+) or deficit (−) relative to the adjusted daily goal.
 * Opened by tapping the "vs. Goal" chip in SevenDayCaloricTrendCard.
 */

import React, { useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayBreakdown {
  label: string;       // e.g. "Mon"
  date: string;        // e.g. "Mar 10"
  kcal: number;        // actual intake (0 = no data)
  isToday: boolean;
}

export interface CaloricBreakdownModalProps {
  visible: boolean;
  onClose: () => void;
  days: DayBreakdown[];
  adjustedGoal: number;
}

// ─── Chart constants ──────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48;
const CHART_H  = 160;
const PAD_X    = 20;
const PAD_Y    = 16;
const SLOT_W   = (CHART_W - PAD_X * 2) / 7;
const BAR_W    = Math.min(30, Math.max(14, Math.floor(SLOT_W * 0.55)));

// ─── Component ────────────────────────────────────────────────────────────────

export function CaloricBreakdownModal({
  visible,
  onClose,
  days,
  adjustedGoal,
}: CaloricBreakdownModalProps) {
  const colors = useColors();

  // Compute signed deltas (kcal − goal); days with no data → 0
  const deltas = days.map((d) => (d.kcal > 0 ? d.kcal - adjustedGoal : 0));
  const maxAbs = Math.max(...deltas.map(Math.abs), 1);

  // Chart geometry: center line at midY; bars grow up (surplus) or down (deficit)
  const usableH = CHART_H - PAD_Y * 2;
  const midY    = PAD_Y + usableH / 2;
  const halfH   = usableH / 2;

  function barProps(delta: number, i: number) {
    const x    = PAD_X + i * SLOT_W + (SLOT_W - BAR_W) / 2;
    const norm = Math.abs(delta) / maxAbs;
    const h    = Math.max(2, norm * halfH);
    const y    = delta >= 0 ? midY - h : midY;
    const color = delta > 0 ? '#EF4444' : delta < 0 ? '#10B981' : colors.border;
    return { x, y, h, color };
  }

  // Summary stats
  const daysWithData  = days.filter((d) => d.kcal > 0);
  const surplusDays   = deltas.filter((d) => d > 0).length;
  const deficitDays   = deltas.filter((d) => d < 0).length;
  const netBalance    = deltas.reduce((s, d) => s + d, 0);

  // ── CSV export ────────────────────────────────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'CSV export is only available on iOS and Android.');
      return;
    }
    try {
      setIsExporting(true);
      const header = 'Date,Day,Intake (kcal),Goal (kcal),Delta (kcal)\n';
      const rows = days.map((d, _i) => {
        const delta = d.kcal > 0 ? d.kcal - adjustedGoal : '';
        return `${d.date},${d.label},${d.kcal > 0 ? Math.round(d.kcal) : ''},${adjustedGoal},${delta !== '' ? Math.round(delta as number) : ''}`;
      }).join('\n');
      const csv = header + rows;
      // Build date-range filename from the actual data (e.g. caloric_breakdown_Mar08-Mar14.csv)
      const _MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const firstDay = days[0];
      const lastDay  = days[days.length - 1];
      function shortDate(label: string) {
        // label is already like "Mar 8" — strip space and pad to 2 digits
        const parts = label.split(' ');
        return parts[0] + parts[1].padStart(2, '0');
      }
      const rangeStr = `${shortDate(firstDay.date)}-${shortDate(lastDay.date)}`;
      const fileUri = `${FileSystem.cacheDirectory}caloric_breakdown_${rangeStr}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Share Caloric Breakdown',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Sharing Not Available', 'Your device does not support file sharing.');
      }
    } catch (_unused) {
      Alert.alert('Export Failed', 'Could not export the CSV file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [days, adjustedGoal]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: colors.surface }]}>
        {/* Handle */}
        <View style={[s.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.foreground }]}>Daily Caloric Balance</Text>
            <Text style={[s.subtitle, { color: colors.muted }]}>Surplus (+) and deficit (−) vs. {adjustedGoal} kcal goal</Text>
          </View>
          <View style={s.headerActions}>
            {/* Export CSV */}
            <Pressable
              onPress={handleExportCSV}
              style={[s.closeBtn, { backgroundColor: '#0a7ea420', marginRight: 6 }]}
              hitSlop={8}
              disabled={isExporting}
            >
              {isExporting
                ? <ActivityIndicator size={14} color='#38BDF8' />
                : <IconSymbol name="square.and.arrow.up" size={14} color='#38BDF8' />
              }
            </Pressable>
            {/* Close */}
            <Pressable
              onPress={onClose}
              style={[s.closeBtn, { backgroundColor: colors.border + '60' }]}
              hitSlop={8}
            >
              <IconSymbol name="xmark" size={14} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {/* Signed bar chart */}
          <View style={s.chartWrap}>
            <Svg width={CHART_W} height={CHART_H}>
              {/* Zero line */}
              <Line
                x1={PAD_X} y1={midY}
                x2={CHART_W - PAD_X} y2={midY}
                stroke={colors.border}
                strokeWidth={1}
              />
              {/* Surplus label */}
              <SvgText x={PAD_X - 2} y={PAD_Y + 8} fontSize={7} fill="#EF4444" textAnchor="end">+</SvgText>
              {/* Deficit label */}
              <SvgText x={PAD_X - 2} y={CHART_H - PAD_Y} fontSize={7} fill="#10B981" textAnchor="end">−</SvgText>

              {/* Bars */}
              {days.map((d, i) => {
                const delta = deltas[i];
                const { x, y, h, color } = barProps(delta, i);
                const hasData = d.kcal > 0;
                return (
                  <React.Fragment key={i}>
                    <Rect
                      x={x} y={y}
                      width={BAR_W} height={h}
                      fill={color + (d.isToday ? 'FF' : '80')}
                      rx={3}
                    />
                    {/* Today ring */}
                    {d.isToday && hasData && (
                      <Rect
                        x={x + 1} y={y + 1}
                        width={BAR_W - 2} height={h - 2}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        rx={2}
                      />
                    )}
                    {/* Day label */}
                    <SvgText
                      x={x + BAR_W / 2}
                      y={CHART_H - 2}
                      textAnchor="middle"
                      fontSize={8}
                      fill={d.isToday ? colors.foreground : colors.muted}
                      fontWeight={d.isToday ? '700' : '400'}
                    >
                      {d.label}
                    </SvgText>
                    {/* Delta value above/below bar */}
                    {hasData && (
                      <SvgText
                        x={x + BAR_W / 2}
                        y={delta >= 0 ? y - 3 : y + h + 9}
                        textAnchor="middle"
                        fontSize={7}
                        fill={color}
                        fontWeight="700"
                      >
                        {delta > 0 ? `+${Math.round(delta)}` : Math.round(delta)}
                      </SvgText>
                    )}
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>

          {/* Per-day breakdown list */}
          <View style={[s.listCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {days.map((d, i) => {
              const delta = deltas[i];
              const hasData = d.kcal > 0;
              const deltaColor = delta > 0 ? '#EF4444' : delta < 0 ? '#10B981' : colors.muted;
              return (
                <View
                  key={i}
                  style={[
                    s.listRow,
                    { borderBottomColor: colors.border },
                    i === days.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={s.listLeft}>
                    <Text style={[s.listDay, { color: d.isToday ? colors.foreground : colors.muted }, d.isToday && s.listDayToday]}>
                      {d.label}
                    </Text>
                    <Text style={[s.listDate, { color: colors.muted }]}>{d.date}</Text>
                  </View>
                  <Text style={[s.listKcal, { color: hasData ? colors.foreground : colors.muted }]}>
                    {hasData ? `${Math.round(d.kcal)} kcal` : '—'}
                  </Text>
                  <View style={[s.listDeltaChip, { backgroundColor: deltaColor + '18', borderColor: deltaColor + '40' }]}>
                    <Text style={[s.listDeltaText, { color: deltaColor }]}>
                      {!hasData ? '—' : delta > 0 ? `+${Math.round(delta)}` : delta < 0 ? `${Math.round(delta)}` : 'On goal'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Summary stats */}
          <View style={s.summaryRow}>
            <View style={[s.summaryItem, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
              <Text style={[s.summaryNum, { color: '#EF4444' }]}>{surplusDays}</Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Surplus days</Text>
            </View>
            <View style={[s.summaryItem, { backgroundColor: '#10B98118', borderColor: '#10B98140' }]}>
              <Text style={[s.summaryNum, { color: '#10B981' }]}>{deficitDays}</Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Deficit days</Text>
            </View>
            <View style={[
              s.summaryItem,
              { backgroundColor: (netBalance > 0 ? '#EF4444' : '#10B981') + '18',
                borderColor: (netBalance > 0 ? '#EF4444' : '#10B981') + '40' },
            ]}>
              <Text style={[s.summaryNum, { color: netBalance > 0 ? '#EF4444' : '#10B981' }]}>
                {netBalance > 0 ? `+${Math.round(netBalance)}` : Math.round(netBalance)}
              </Text>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Net 7-day</Text>
            </View>
          </View>

          {/* Body-fat equivalent annotation */}
          {daysWithData.length > 0 && (() => {
            // 1 lb of body fat ≈ 3,500 kcal; 1 kg ≈ 7,700 kcal
            const absNet = Math.abs(netBalance);
            const grams  = Math.round((absNet / 7700) * 1000);
            const direction = netBalance > 0 ? 'stored' : 'burned';
            const icon      = netBalance > 0 ? '🔺' : '🔻';
            const color     = netBalance > 0 ? '#EF4444' : '#10B981';
            if (absNet < 100) return null; // too small to be meaningful
            return (
              <View style={[s.bodyFatRow, { backgroundColor: color + '10', borderColor: color + '30' }]}>
                <Text style={[s.bodyFatIcon]}>{icon}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.bodyFatText, { color: colors.muted }]}>
                    Net balance ≈{' '}
                    <Text style={{ fontWeight: '700', color }}>
                      {grams < 1000
                        ? `${grams} g`
                        : `${(grams / 1000).toFixed(2)} kg`} body fat {direction}
                    </Text>
                    {' '}this week
                  </Text>
                  <Text style={[s.bodyFatDisclaimer, { color: colors.muted }]}>
                    Estimate only — individual results vary.
                  </Text>
                </View>
              </View>
            );
          })()}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000060',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { paddingHorizontal: 24, paddingBottom: 16, gap: 16 },
  chartWrap: { alignItems: 'center' },
  listCard: {
    borderRadius: 14, borderWidth: 0.5, overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  listLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  listDay: { fontSize: 13, fontWeight: '500', width: 28 },
  listDayToday: { fontWeight: '800' },
  listDate: { fontSize: 11 },
  listKcal: { fontSize: 12, fontWeight: '600', width: 72, textAlign: 'right' },
  listDeltaChip: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
    minWidth: 60, alignItems: 'center',
  },
  listDeltaText: { fontSize: 11, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryItem: {
    flex: 1, borderRadius: 12, borderWidth: 0.5,
    paddingVertical: 10, alignItems: 'center', gap: 2,
  },
  summaryNum: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 10 },
  bodyFatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bodyFatIcon: { fontSize: 14 },
  bodyFatText: { fontSize: 12, lineHeight: 18 },
  bodyFatDisclaimer: { fontSize: 10, fontStyle: 'italic', opacity: 0.7 },
});
