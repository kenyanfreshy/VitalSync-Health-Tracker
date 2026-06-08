/**
 * VO2MaxCard — Collapsible Dashboard Card
 *
 * Header always visible: [VO2_MAX_CORRELATION] label + current value + fitness zone badge.
 * Tap to expand: logarithmic gauge arc, zone breakdown, ACSM stats.
 *
 * Matches the WeeklySummaryCard collapsible pattern.
 */

import React, { useState } from 'react';
import { SYSTEM_FONT_MONO as MONO } from '@/lib/_core/fonts';
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
import { useColorScheme, useColors } from '@/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VO2MaxCardProps {
  vo2max: number | null;
  ageYears?: number;
  sex?: 'male' | 'female';
  /** Start collapsed. Default: false (expanded). */
  defaultExpanded?: boolean;
}

// ─── Fitness zone classification ──────────────────────────────────────────────

interface FitnessZone {
  label: string;
  color: string;
  min: number;
  max: number;
}

function getFitnessZones(sex: 'male' | 'female'): FitnessZone[] {
  if (sex === 'female') {
    return [
      { label: 'POOR',      color: '#EF4444', min: 0,  max: 27 },
      { label: 'FAIR',      color: '#F97316', min: 27, max: 31 },
      { label: 'AVERAGE',   color: '#F59E0B', min: 31, max: 35 },
      { label: 'GOOD',      color: '#10B981', min: 35, max: 41 },
      { label: 'EXCELLENT', color: '#00FF41', min: 41, max: 60 },
    ];
  }
  return [
    { label: 'POOR',      color: '#EF4444', min: 0,  max: 34 },
    { label: 'FAIR',      color: '#F97316', min: 34, max: 38 },
    { label: 'AVERAGE',   color: '#F59E0B', min: 38, max: 44 },
    { label: 'GOOD',      color: '#10B981', min: 44, max: 51 },
    { label: 'EXCELLENT', color: '#00FF41', min: 51, max: 70 },
  ];
}

function classifyVO2Max(vo2max: number, sex: 'male' | 'female'): FitnessZone {
  const zones = getFitnessZones(sex);
  return zones.find((z) => vo2max >= z.min && vo2max < z.max) ?? zones[zones.length - 1];
}

// ─── Gauge arc helpers ────────────────────────────────────────────────────────

const GAUGE_SIZE = 160;
const CX = GAUGE_SIZE / 2;
const CY = GAUGE_SIZE / 2;
const R = 60;
const STROKE_W = 10;
const START_ANGLE = -210;
const SWEEP = 240;

function polarToXY(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function describeArc(startDeg: number, endDeg: number, r: number): string {
  const start = polarToXY(startDeg, r);
  const end = polarToXY(endDeg, r);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function vo2ToAngle(vo2: number): number {
  const clamped = Math.max(1, Math.min(vo2, 70));
  const logMin = Math.log(1);
  const logMax = Math.log(70);
  const t = (Math.log(clamped) - logMin) / (logMax - logMin);
  return START_ANGLE + t * SWEEP;
}

// ─── Component ────────────────────────────────────────────────────────────────



export function VO2MaxCard({
  vo2max,
  ageYears = 40,
  sex = 'male',
  defaultExpanded = false,
}: VO2MaxCardProps) {
  const _colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const [expanded, setExpanded] = useState(defaultExpanded);

  const zone = vo2max !== null ? classifyVO2Max(vo2max, sex) : null;
  const needleAngle = vo2max !== null ? vo2ToAngle(vo2max) : START_ANGLE;
  const needlePos = polarToXY(needleAngle, R - 4);

  const surfaceBg = isDark ? '#060D06' : '#F0FDF4';
  const borderColor = isDark ? '#00FF4130' : '#10B98130';
  const accentGreen = '#00FF41';
  const dimGreen = isDark ? '#00FF4140' : '#10B98140';

  function handleToggle() {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded((v) => !v);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  return (
    <View style={[s.card, { backgroundColor: surfaceBg, borderColor }]}>
      {/* ── Collapsible Header ── */}
      <Pressable style={s.header} onPress={handleToggle}>
        <View style={[s.iconWrap, { backgroundColor: accentGreen + '18' }]}>
          <Text style={{ fontSize: 14 }}>💚</Text>
        </View>
        <View style={s.headerText}>
          <Text style={[s.systemId, { color: accentGreen, fontFamily: MONO }]}>
            [VO2_MAX_CORRELATION]
          </Text>
          <Text style={[s.subId, { color: dimGreen, fontFamily: MONO }]}>
            HKQuantityTypeIdentifierVO2Max
          </Text>
        </View>
        {/* Current value pill */}
        <View style={[s.valuePill, { backgroundColor: (zone?.color ?? accentGreen) + '18', borderColor: (zone?.color ?? accentGreen) + '50' }]}>
          <Text style={[s.valuePillText, { color: zone?.color ?? accentGreen, fontFamily: MONO }]}>
            {vo2max !== null ? `${vo2max.toFixed(1)}` : '—'}
          </Text>
          <Text style={[s.valuePillUnit, { color: dimGreen, fontFamily: MONO }]}>mL/kg/min</Text>
        </View>
        {zone && (
          <View style={[s.zoneBadge, { backgroundColor: zone.color + '18', borderColor: zone.color + '50' }]}>
            <Text style={[s.zoneText, { color: zone.color, fontFamily: MONO }]}>{zone.label}</Text>
          </View>
        )}
        <IconSymbol
          name="chevron.right"
          size={14}
          color={dimGreen}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={[s.body, { borderTopColor: borderColor }]}>
          {/* Gauge + stats */}
          <View style={s.gaugeRow}>
            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE * 0.7} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
              {/* Background track */}
              <Path
                d={describeArc(START_ANGLE, START_ANGLE + SWEEP, R)}
                stroke={dimGreen}
                strokeWidth={STROKE_W}
                fill="none"
                strokeLinecap="round"
              />
              {/* Filled arc */}
              {vo2max !== null && (
                <Path
                  d={describeArc(START_ANGLE, needleAngle, R)}
                  stroke={zone?.color ?? accentGreen}
                  strokeWidth={STROKE_W}
                  fill="none"
                  strokeLinecap="round"
                />
              )}
              {/* Needle dot */}
              {vo2max !== null && (
                <Circle
                  cx={needlePos.x}
                  cy={needlePos.y}
                  r={6}
                  fill={zone?.color ?? accentGreen}
                  stroke="#fff"
                  strokeWidth={2}
                />
              )}
              {/* Zone tick marks */}
              {getFitnessZones(sex).map((z) => {
                const tickAngle = vo2ToAngle(z.min);
                const outer = polarToXY(tickAngle, R + STROKE_W / 2 + 2);
                const inner = polarToXY(tickAngle, R - STROKE_W / 2 - 2);
                return (
                  <Line
                    key={z.label}
                    x1={inner.x} y1={inner.y}
                    x2={outer.x} y2={outer.y}
                    stroke={z.color + '80'}
                    strokeWidth={1.5}
                  />
                );
              })}
              {/* Center value */}
              <SvgText
                x={CX} y={CY + 8}
                textAnchor="middle"
                fontSize={vo2max !== null ? 26 : 18}
                fontWeight="800"
                fill={zone?.color ?? dimGreen}
                fontFamily={MONO}
              >
                {vo2max !== null ? vo2max.toFixed(1) : '—'}
              </SvgText>
              <SvgText
                x={CX} y={CY + 22}
                textAnchor="middle"
                fontSize={9}
                fill={dimGreen}
                fontFamily={MONO}
              >
                mL/kg/min
              </SvgText>
            </Svg>

            {/* Stats column */}
            <View style={s.statsCol}>
              <View style={s.statRow}>
                <Text style={[s.statKey, { color: dimGreen, fontFamily: MONO }]}>AGE_BRACKET:</Text>
                <Text style={[s.statVal, { color: accentGreen, fontFamily: MONO }]}>{ageYears}y</Text>
              </View>
              <View style={s.statRow}>
                <Text style={[s.statKey, { color: dimGreen, fontFamily: MONO }]}>SEX_PARAM:</Text>
                <Text style={[s.statVal, { color: accentGreen, fontFamily: MONO }]}>{sex.toUpperCase()}</Text>
              </View>
              {vo2max !== null && zone && (
                <View style={s.statRow}>
                  <Text style={[s.statKey, { color: dimGreen, fontFamily: MONO }]}>RANGE:</Text>
                  <Text style={[s.statVal, { color: zone.color, fontFamily: MONO }]}>
                    {zone.min}–{zone.max === 70 ? '70+' : zone.max}
                  </Text>
                </View>
              )}
              {/* Zone ladder */}
              <View style={s.zoneLadder}>
                {getFitnessZones(sex).slice().reverse().map((z) => (
                  <View key={z.label} style={s.zoneRow}>
                    <View style={[s.zoneDot, { backgroundColor: z.color }]} />
                    <Text style={[s.zoneRowLabel, { color: zone?.label === z.label ? z.color : dimGreen, fontFamily: MONO, fontWeight: zone?.label === z.label ? '800' : '400' }]}>
                      {z.label}
                    </Text>
                    <Text style={[s.zoneRowRange, { color: dimGreen, fontFamily: MONO }]}>
                      {z.min}–{z.max === 70 ? '70+' : z.max}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Footer */}
          <Text style={[s.footer, { color: dimGreen, fontFamily: MONO }]}>
            {vo2max !== null
              ? `LOGARITHMIC_SCALE · ACSM_ZONES_${sex.toUpperCase()}_${ageYears}Y`
              : 'AWAITING_HEALTHKIT_TELEMETRY — Grant access to populate VO2 Max.'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  systemId: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  subId: { fontSize: 8, letterSpacing: 0.3 },
  valuePill: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center',
  },
  valuePillText: { fontSize: 14, fontWeight: '800' },
  valuePillUnit: { fontSize: 7, letterSpacing: 0.3 },
  zoneBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  zoneText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statsCol: { flex: 1, gap: 6 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statKey: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  statVal: { fontSize: 11, fontWeight: '800' },
  zoneLadder: { gap: 3, marginTop: 4 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  zoneRowLabel: { fontSize: 9, flex: 1 },
  zoneRowRange: { fontSize: 8 },
  footer: { fontSize: 8, letterSpacing: 0.3, lineHeight: 12 },
});
