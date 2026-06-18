/**
 * EKGSparklineDetailSheet
 *
 * Custom sparkline detail sheet for the EKG BentoMetricTile.
 * Shows a 7-day classification breakdown table (Sinus / AFib / Inconclusive / Unclassified)
 * plus a mini bar chart of daily AFib counts, instead of the generic numeric value list.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/use-colors';
import type { EKGRecord } from '@/lib/health/ekg-store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 80;
const BAR_GAP = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EKGSparklineDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  /** All EKG records (will be filtered to last 7 days internally). */
  records: EKGRecord[];
  accentColor?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildDayLabels(): string[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return i === 6 ? 'Today' : DAY_NAMES[d.getDay()];
  });
}

function startOfDay(daysAgo: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface DayBucket {
  label: string;
  sinus: number;
  afib: number;
  inconclusive: number;
  unclassified: number;
  total: number;
}

function buildBuckets(records: EKGRecord[]): DayBucket[] {
  const labels = buildDayLabels();
  return labels.map((label, i) => {
    const dayStart = startOfDay(6 - i);
    const dayEnd = dayStart + 86_400_000;
    const dayRecords = records.filter(r => {
      const t = new Date(r.startDate).getTime();
      return t >= dayStart && t < dayEnd;
    });
    const sinus = dayRecords.filter(r => r.classification === 'SinusRhythm').length;
    const afib = dayRecords.filter(r => r.classification === 'AtrialFibrillation').length;
    const inconclusive = dayRecords.filter(r => r.classification === 'Inconclusive').length;
    const unclassified = dayRecords.filter(r => r.classification === 'Unclassified').length;
    return { label, sinus, afib, inconclusive, unclassified, total: dayRecords.length };
  });
}

// ─── Mini Stacked Bar Chart ───────────────────────────────────────────────────

function StackedBarChart({ buckets, accentColor }: { buckets: DayBucket[]; accentColor: string }) {
  const colors = useColors();
  const maxVal = Math.max(...buckets.map(b => b.total), 1);
  const barW = (CHART_WIDTH - BAR_GAP * (buckets.length - 1)) / buckets.length;

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 20}>
      {/* Baseline */}
      <Line
        x1={0} y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT}
        stroke={colors.border} strokeWidth={0.5}
      />
      {buckets.map((b, i) => {
        const x = i * (barW + BAR_GAP);
        const totalH = (b.total / maxVal) * (CHART_HEIGHT - 8);
        let y = CHART_HEIGHT;

        // Draw stacked segments bottom-up: Sinus → AFib → Inconclusive → Unclassified
        const segments = [
          { count: b.sinus, color: '#22C55E' },
          { count: b.afib, color: '#EF4444' },
          { count: b.inconclusive, color: '#F59E0B' },
          { count: b.unclassified, color: colors.muted },
        ];

        const rects = segments.map((seg, si) => {
          if (seg.count === 0) return null;
          const h = (seg.count / maxVal) * (CHART_HEIGHT - 8);
          y -= h;
          return (
            <Rect
              key={si}
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={seg.color}
              rx={si === segments.filter(s => s.count > 0).length - 1 ? 3 : 0}
            />
          );
        });

        return (
          <React.Fragment key={i}>
            {b.total === 0 && (
              <Rect x={x} y={CHART_HEIGHT - 3} width={barW} height={3} fill={colors.border} rx={1.5} />
            )}
            {rects}
            <SvgText
              x={x + barW / 2}
              y={CHART_HEIGHT + 14}
              fontSize={9}
              fill={colors.muted}
              textAnchor="middle"
            >
              {b.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── Classification Row ───────────────────────────────────────────────────────

function ClassRow({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon: string;
}) {
  const colors = useColors();
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={styles.classRow}>
      <View style={[styles.classColorDot, { backgroundColor: color }]} />
      <Text style={{ fontSize: 12, marginRight: 4 }}>{icon}</Text>
      <Text style={[styles.classLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.classBarTrack}>
        <View style={[styles.classBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.classCount, { color: colors.muted }]}>{count}</Text>
      <Text style={[styles.classPct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EKGSparklineDetailSheet({
  visible,
  onClose,
  records,
  accentColor = '#EF4444',
}: EKGSparklineDetailSheetProps) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentRecords = useMemo(
    () => records.filter(r => new Date(r.startDate).getTime() >= sevenDaysAgo),
    [records],
  );

  const buckets = useMemo(() => buildBuckets(recentRecords), [recentRecords]);

  const totalSinus = recentRecords.filter(r => r.classification === 'SinusRhythm').length;
  const totalAfib = recentRecords.filter(r => r.classification === 'AtrialFibrillation').length;
  const totalInconclusive = recentRecords.filter(r => r.classification === 'Inconclusive').length;
  const totalUnclassified = recentRecords.filter(r => r.classification === 'Unclassified').length;
  const totalAll = recentRecords.length;

  const lastAfib = useMemo(() => {
    const afibRecs = recentRecords
      .filter(r => r.classification === 'AtrialFibrillation')
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return afibRecs[0] ?? null;
  }, [recentRecords]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>EKG — 7-Day Summary</Text>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text style={[styles.closeBtn, { color: colors.muted }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {totalAll === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                No EKG recordings in the last 7 days.
              </Text>
            </View>
          ) : (
            <>
              {/* AFib alert banner */}
              {totalAfib > 0 && (
                <View style={[styles.alertBanner, { backgroundColor: '#EF444418', borderColor: '#EF4444' }]}>
                  <Text style={styles.alertIcon}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertTitle, { color: '#EF4444' }]}>
                      {totalAfib} Atrial Fibrillation recording{totalAfib !== 1 ? 's' : ''} in the last 7 days
                    </Text>
                    {lastAfib && (
                      <Text style={[styles.alertSub, { color: colors.muted }]}>
                        Last:{' '}
                        {new Date(lastAfib.startDate).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                        {lastAfib.averageHeartRate
                          ? ` · ${Math.round(lastAfib.averageHeartRate)} bpm`
                          : ''}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Stacked bar chart */}
              <View style={styles.chartSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>DAILY BREAKDOWN</Text>
                <StackedBarChart buckets={buckets} accentColor={accentColor} />
              </View>

              {/* Legend */}
              <View style={styles.legendRow}>
                {[
                  { color: '#22C55E', label: 'Sinus Rhythm' },
                  { color: '#EF4444', label: 'Atrial Fibrillation' },
                  { color: '#F59E0B', label: 'Inconclusive' },
                  { color: colors.muted, label: 'Unclassified' },
                ].map(l => (
                  <View key={l.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                    <Text style={[styles.legendLabel, { color: colors.muted }]}>{l.label}</Text>
                  </View>
                ))}
              </View>

              {/* Classification breakdown table */}
              <View style={styles.tableSection}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>CLASSIFICATION BREAKDOWN</Text>
                <View style={[styles.tableCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <ClassRow label="Sinus Rhythm" count={totalSinus} total={totalAll} color="#22C55E" icon="💚" />
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <ClassRow label="Atrial Fibrillation" count={totalAfib} total={totalAll} color="#EF4444" icon="⚠️" />
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <ClassRow label="Inconclusive" count={totalInconclusive} total={totalAll} color="#F59E0B" icon="🟡" />
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <ClassRow label="Unclassified" count={totalUnclassified} total={totalAll} color={colors.muted} icon="⬜" />
                </View>
                <Text style={[styles.totalLine, { color: colors.muted }]}>
                  {totalAll} total recording{totalAll !== 1 ? 's' : ''} in the last 7 days
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 16,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  alertSub: {
    fontSize: 11,
  },
  chartSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: -4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
  },
  tableSection: {
    gap: 8,
  },
  tableCard: {
    borderWidth: 0.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  divider: {
    height: 0.5,
    marginHorizontal: 12,
  },
  totalLine: {
    fontSize: 11,
    textAlign: 'right',
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  classColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  classLabel: {
    fontSize: 12,
    fontWeight: '500',
    width: 130,
  },
  classBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(128,128,128,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  classBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  classCount: {
    fontSize: 12,
    fontWeight: '600',
    width: 24,
    textAlign: 'right',
  },
  classPct: {
    fontSize: 11,
    fontWeight: '700',
    width: 34,
    textAlign: 'right',
  },
});
