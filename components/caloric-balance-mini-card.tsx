/**
 * CaloricBalanceMiniCard — Standalone collapsible card for Today's Caloric Balance.
 *
 * Extracted from WeeklyMacroTrendCard so it can be positioned independently
 * on the dashboard (after Meal IQ Trend, before Weekly Macro Trend).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
} from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import type { SodiumRecord } from '@/lib/health/types';

// ─── Gauge constants ──────────────────────────────────────────────────────────

const GAUGE_SIZE = 130;
const GCX        = GAUGE_SIZE / 2;
const GCY        = GAUGE_SIZE / 2;
const GR         = 48;
const G_STROKE_W = 9;
const G_START    = -210;
const G_SWEEP    = 240;

function polarToXY(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: GCX + r * Math.cos(rad), y: GCY + r * Math.sin(rad) };
}

function describeArc(startDeg: number, endDeg: number, r: number): string {
  const s = polarToXY(startDeg, r);
  const e = polarToXY(endDeg, r);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CaloricBalanceMiniCardProps {
  sodiumRecords: SodiumRecord[];
  /** Caloric goal in kcal. Default 2000. */
  goalKcal?: number;
  /** Exercise caloric bonus from today's activity log. Default 0. */
  exerciseBonusKcal?: number;
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CaloricBalanceMiniCard({
  sodiumRecords,
  goalKcal = 2000,
  exerciseBonusKcal = 0,
  defaultExpanded = false,
  overrideExpanded,
}: CaloricBalanceMiniCardProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useCardExpanded('caloric-balance-mini', defaultExpanded, overrideExpanded);

  const todayKcal = useMemo(() => {
    const today = new Date().toDateString();
    return sodiumRecords
      .filter((r) => new Date(r.timestamp).toDateString() === today)
      .reduce((sum, r) => sum + (r.calories ?? 0), 0);
  }, [sodiumRecords]);

  const adjustedGoal = goalKcal + exerciseBonusKcal;
  const netBalance   = todayKcal - adjustedGoal;
  const pct          = Math.min(todayKcal / adjustedGoal, 1.2);
  const fillAngle    = G_START + pct * G_SWEEP;
  const isOver       = netBalance > 0;
  const isNear       = !isOver && netBalance > -200;
  const statusColor  = isOver ? '#EF4444' : isNear ? '#F59E0B' : '#10B981';
  const statusLabel  = isOver ? 'OVER' : isNear ? 'NEAR' : 'ON TRACK';

  // Header summary: remaining kcal or "—"
  const remaining = todayKcal > 0 ? Math.max(0, adjustedGoal - Math.round(todayKcal)) : null;

  function toggle() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  }

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* ── Header ── */}
      <Pressable
        style={({ pressed }) => [s.header, { opacity: pressed ? 0.8 : 1 }]}
        onPress={toggle}
      >
        <View style={[s.iconWrap, { backgroundColor: statusColor + '18' }]}>
          <IconSymbol name="flame.fill" size={16} color={statusColor} />
        </View>
        <View style={s.headerText}>
          <Text style={[s.title, { color: colors.foreground }]}>Caloric Balance</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>Today&apos;s intake vs. goal</Text>
        </View>
        {/* Status badge */}
        <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {/* Remaining chip */}
        {remaining !== null && (
          <View style={[s.remainChip, { backgroundColor: colors.background }]}>
            <Text style={[s.remainVal, { color: statusColor }]}>{remaining}</Text>
            <Text style={[s.remainLabel, { color: colors.muted }]}>kcal left</Text>
          </View>
        )}
        <IconSymbol
          name="chevron.right"
          size={14}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={[s.body, { borderTopColor: colors.border }]}>
          <View style={s.gaugeRow}>
            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE * 0.72} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
              {/* Track arc */}
              <Path
                d={describeArc(G_START, G_START + G_SWEEP, GR)}
                stroke={colors.border}
                strokeWidth={G_STROKE_W}
                fill="none"
                strokeLinecap="round"
              />
              {/* Fill arc */}
              {todayKcal > 0 && (
                <Path
                  d={describeArc(G_START, fillAngle, GR)}
                  stroke={statusColor}
                  strokeWidth={G_STROKE_W}
                  fill="none"
                  strokeLinecap="round"
                />
              )}
              {/* Max tick */}
              {(() => {
                const tickAngle = G_START + G_SWEEP;
                const outer = polarToXY(tickAngle, GR + G_STROKE_W / 2 + 3);
                const inner = polarToXY(tickAngle, GR - G_STROKE_W / 2 - 3);
                return <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={colors.muted} strokeWidth={2} />;
              })()}
              {/* Needle dot */}
              {todayKcal > 0 && (() => {
                const dot = polarToXY(fillAngle, GR);
                return <Circle cx={dot.x} cy={dot.y} r={5} fill={statusColor} stroke="#fff" strokeWidth={2} />;
              })()}
              {/* Center text */}
              <SvgText x={GCX} y={GCY + 5} textAnchor="middle" fontSize={20} fontWeight="800" fill={statusColor}>
                {todayKcal > 0 ? Math.round(todayKcal) : '—'}
              </SvgText>
              <SvgText x={GCX} y={GCY + 18} textAnchor="middle" fontSize={8} fill={colors.muted}>
                kcal consumed
              </SvgText>
            </Svg>

            <View style={s.statsCol}>
              <View style={s.statRow}>
                <View style={[s.statDot, { backgroundColor: '#10B981' }]} />
                <Text style={[s.statLabel, { color: colors.muted }]}>Base Goal</Text>
                <Text style={[s.statVal, { color: colors.foreground }]}>{goalKcal} kcal</Text>
              </View>
              {exerciseBonusKcal > 0 && (
                <View style={s.statRow}>
                  <View style={[s.statDot, { backgroundColor: '#38BDF8' }]} />
                  <Text style={[s.statLabel, { color: colors.muted }]}>Exercise Bonus</Text>
                  <Text style={[s.statVal, { color: '#38BDF8' }]}>+{exerciseBonusKcal} kcal</Text>
                </View>
              )}
              <View style={s.statRow}>
                <View style={[s.statDot, { backgroundColor: statusColor }]} />
                <Text style={[s.statLabel, { color: colors.muted }]}>Adjusted Goal</Text>
                <Text style={[s.statVal, { color: colors.foreground }]}>{adjustedGoal} kcal</Text>
              </View>
              <View style={s.statRow}>
                <View style={[s.statDot, { backgroundColor: statusColor }]} />
                <Text style={[s.statLabel, { color: colors.muted }]}>Remaining</Text>
                <Text style={[s.statVal, { color: statusColor }]}>
                  {todayKcal > 0 ? `${Math.max(0, adjustedGoal - Math.round(todayKcal))} kcal` : '—'}
                </Text>
              </View>
              {!todayKcal && (
                <Text style={[s.noData, { color: colors.muted }]}>Log meals to see balance</Text>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: 18, borderWidth: 1, marginHorizontal: 16, marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  statusBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  remainChip: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
  remainVal: { fontSize: 13, fontWeight: '800' },
  remainLabel: { fontSize: 9 },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statsCol: { flex: 1, gap: 7 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statLabel: { fontSize: 10, flex: 1 },
  statVal: { fontSize: 11, fontWeight: '700' },
  noData: { fontSize: 10, fontStyle: 'italic', marginTop: 2 },
});
