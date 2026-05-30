/**
 * WeeklySugarChart
 *
 * Collapsible 7-day bar chart showing daily free-sugar totals (g) from
 * SodiumRecord entries, with a horizontal budget line at the user's custom
 * daily sugar limit (default: WHO ≤25 g/day).
 *
 * Bars are amber when within budget, red when over.
 * Today's bar is highlighted with a slightly brighter fill.
 * An Smart-generated one-line insight is shown below the chart.
 */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks';
import { getLastNDaysNutrients } from '@/lib/health/daily-nutrients';
import type { SodiumRecord } from '@/lib/health/types';
import { WHO_SUGAR_DEFAULT_G } from '@/lib/health/sugar-budget';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { GlassCard } from '@/components/glass-card';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLast7DayKeys(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function shortDay(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WeeklySugarChartProps {
  sodiumRecords: SodiumRecord[];
  /** User's custom daily sugar budget (g). Defaults to WHO 25 g. */
  budgetG?: number;
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklySugarChart({
  sodiumRecords,
  budgetG = WHO_SUGAR_DEFAULT_G,
  defaultExpanded = false,
  overrideExpanded,
}: WeeklySugarChartProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(defaultExpanded);
  // overrideExpanded=false (section collapsed) forces card closed;
  // overrideExpanded=true (section expanded) defers to card's own state.
  const isExpanded = overrideExpanded === false ? false : expanded;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  // Build 7-day data
  const days7 = getLast7DayKeys();
  const todayKey = days7[days7.length - 1];

  const nutrientsByDay = useMemo(
    () => getLastNDaysNutrients(sodiumRecords, 7),
    [sodiumRecords],
  );

  const dayData = useMemo(
    () =>
      days7.map((dateKey) => {
        const entry = nutrientsByDay.find((d) => d.date === dateKey);
        return { dateKey, sugarG: entry?.sugar_g ?? 0 };
      }),
    [days7, nutrientsByDay],
  );

  // Chart dimensions
  const chartW = 320;
  const chartH = 120;
  const barAreaH = 90;
  const labelH = 20;
  const barCount = 7;
  const barGap = 6;
  const barW = (chartW - barGap * (barCount + 1)) / barCount;

  const maxSugar = Math.max(...dayData.map((d) => d.sugarG), budgetG * 1.2, 10);
  const scale = (g: number) => (g / maxSugar) * barAreaH;

  // Budget line Y position
  const budgetY = barAreaH - scale(budgetG);

  const todayTotal = dayData.find((d) => d.dateKey === todayKey)?.sugarG ?? 0;
  const overBudgetDays = dayData.filter((d) => d.sugarG > budgetG).length;

  // Compute current streak (consecutive days under budget, counting backwards from today)
  const currentStreak = useMemo(() => {
    let streak = 0;
    for (let i = dayData.length - 1; i >= 0; i--) {
      const d = dayData[i];
      // Skip today if no data yet (sugarG === 0 and it's today)
      if (d.dateKey === todayKey && d.sugarG === 0) continue;
      if (d.sugarG <= budgetG && d.sugarG > 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [dayData, budgetG, todayKey]);

  // Milestone streaks that trigger celebration
  const MILESTONE_STREAKS = [3, 7, 14, 21, 30];
  const isMilestone = MILESTONE_STREAKS.includes(currentStreak);

  // Confetti particles — colours derived from live palette tokens so they match the current theme
  const CONFETTI_COLORS = [
    colors.primary,    // teal brand
    colors.success,    // green
    colors.warning,    // amber
    colors.error,      // red
    colors.sleepPurple ?? '#8B5CF6', // purple (health domain token)
    colors.bodyBlue ?? '#0EA5E9',    // blue (health domain token)
    colors.tempOrange ?? '#F97316',  // orange (health domain token)
    colors.accent ?? '#6366F1',      // indigo accent
  ];
  const PARTICLE_COUNT = 18;

  const [showConfetti, setShowConfetti] = useState(false);
  const prevStreakRef = useRef(currentStreak);
  const particleAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    const prev = prevStreakRef.current;
    prevStreakRef.current = currentStreak;
    // Only fire when streak crosses a milestone (not on initial mount)
    if (prev === currentStreak) return;
    if (!isMilestone) return;
    // Haptic celebration
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // Reset and launch confetti
    particleAnims.forEach((p) => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(0);
      p.scale.setValue(0);
    });
    setShowConfetti(true);
    const anims = particleAnims.map((p, i) => {
      const angle = (i / PARTICLE_COUNT) * 2 * Math.PI;
      const radius = 60 + Math.random() * 80;
      const dx = Math.cos(angle) * radius;
      const dy = -Math.abs(Math.sin(angle) * radius) - 20; // always upward
      return Animated.parallel([
        Animated.timing(p.x, { toValue: dx, duration: 700, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: dy, duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(p.opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: 550, delay: 150, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(p.scale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(p.scale, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        ]),
      ]);
    });
    Animated.parallel(anims).start(() => setShowConfetti(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStreak]);

  // ── Streak Share Card ──────────────────────────────────────────────────────
  const handleShareStreakCard = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const primaryColor = colors.primary;
    const successColor = colors.success;
    const warningColor = colors.warning;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 600px;
            height: 315px;
            background: linear-gradient(135deg, #0A0B0F 0%, #13151C 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, Helvetica, Arial, sans-serif;
            overflow: hidden;
          }
          .card {
            width: 560px;
            height: 280px;
            border-radius: 24px;
            background: linear-gradient(135deg, ${primaryColor}22 0%, ${warningColor}22 100%);
            border: 1.5px solid ${primaryColor}55;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 32px;
          }
          .flame { font-size: 64px; line-height: 1; }
          .streak-text {
            font-size: 42px;
            font-weight: 800;
            color: ${warningColor};
            letter-spacing: -1px;
          }
          .sub {
            font-size: 18px;
            color: #E8EAF2;
            font-weight: 500;
            letter-spacing: 0.5px;
          }
          .brand {
            font-size: 13px;
            color: ${primaryColor};
            font-weight: 600;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-top: 4px;
          }
          .dots {
            display: flex;
            gap: 6px;
            margin-top: 4px;
          }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${successColor};
          }
          .dot.over { background: #EF4444; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="flame">🔥</div>
          <div class="streak-text">${currentStreak}-Day Streak</div>
          <div class="sub">Stayed under my daily sugar budget</div>
          <div class="dots">
            ${dayData.map(d => `<div class="dot${d.sugarG > budgetG ? ' over' : ''}"></div>`).join('')}
          </div>
          <div class="brand">VitalSync · Personal Health Hub</div>
        </div>
      </body>
      </html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Your Streak' });
      }
    } catch (_unused) {
      // silently ignore share errors
    }
  };

  // Smart insight — only fetch when expanded and there's at least 1 day with data
  const hasSomeData = dayData.some((d) => d.sugarG > 0);
  const insightQuery = trpc.sugarInsight.useQuery(
    {
      dailyTotals: dayData.map((d) => d.sugarG),
      budgetG,
      dateLabels: dayData.map((d) => d.dateKey),
    },
    {
      enabled: isExpanded && hasSomeData,
      staleTime: 5 * 60 * 1000, // 5 min cache
      retry: 1,
    },
  );

  return (
    <GlassCard accentColor="#F59E0B" noPadding style={s.card}>
      {/* Confetti overlay — pointerEvents='none' so it doesn't block taps */}
      {showConfetti && (
        <View style={s.confettiContainer} pointerEvents="none">
          {particleAnims.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                s.confettiDot,
                {
                  backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
                  opacity: p.opacity,
                },
              ]}
            />
          ))}
        </View>
      )}
      {/* Milestone banner — tappable Share button */}
      {isMilestone && currentStreak >= 1 && (
        <View style={s.milestoneBanner}>
          <Text style={s.milestoneBannerText}>
            🎉 {currentStreak}-day streak! Keep it up!
          </Text>
          <Pressable
            onPress={handleShareStreakCard}
            style={({ pressed }) => [s.shareStreakBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={s.shareStreakBtnText}>📤 Share</Text>
          </Pressable>
        </View>
      )}
      {/* Header */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [s.header, pressed && { opacity: 0.75 }]}
      >
        <View style={s.headerLeft}>
          <Text style={s.headerIcon}>🍬</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.foreground }]}>Weekly Sugar Intake</Text>
            <Text style={[s.subtitle, { color: colors.muted }]}>
              Today: {todayTotal.toFixed(1)}g
              {' · '}
              Budget: {budgetG}g/day
              {overBudgetDays > 0 ? ` · ⚠️ ${overBudgetDays}d over` : ' · ✓ On track'}
            </Text>
          </View>
        </View>
        {/* Streak badge */}
        {currentStreak >= 1 && (
          <View style={s.streakBadge}>
            <Text style={s.streakFire}>🔥</Text>
            <Text style={s.streakCount}>{currentStreak}</Text>
          </View>
        )}
        <Text style={[s.chevron, { color: colors.muted }]}>{isExpanded ? '▲' : '▼'}</Text>
      </Pressable>

      {/* Chart body */}
      {isExpanded && (
        <View style={s.body}>
          <Svg width={chartW} height={chartH} style={s.svg}>
            {/* Budget line */}
            <Line
              x1={0}
              y1={budgetY}
              x2={chartW}
              y2={budgetY}
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="4,3"
            />
            {/* Budget label */}
            <SvgText
              x={chartW - 2}
              y={budgetY - 3}
              fontSize={8}
              fill="#F59E0B"
              textAnchor="end"
            >
              {budgetG}g limit
            </SvgText>

            {/* Bars */}
            {dayData.map((d, i) => {
              const x = barGap + i * (barW + barGap);
              const barH = scale(d.sugarG);
              const y = barAreaH - barH;
              const isToday = d.dateKey === todayKey;
              const over = d.sugarG > budgetG;
              const fill = over
                ? isToday ? '#EF4444' : '#EF444480'
                : isToday ? '#F59E0B' : '#F59E0B55';

              return (
                <React.Fragment key={d.dateKey}>
                  {barH > 0 && (
                    <Rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={3}
                      fill={fill}
                    />
                  )}
                  {/* Day label */}
                  <SvgText
                    x={x + barW / 2}
                    y={barAreaH + labelH - 4}
                    fontSize={9}
                    fill={isToday ? colors.foreground : colors.muted}
                    textAnchor="middle"
                    fontWeight={isToday ? '700' : '400'}
                  >
                    {shortDay(d.dateKey)}
                  </SvgText>
                  {/* Value label above bar (only if > 0) */}
                  {d.sugarG > 0 && (
                    <SvgText
                      x={x + barW / 2}
                      y={Math.max(y - 2, 10)}
                      fontSize={8}
                      fill={over ? '#EF4444' : '#F59E0B'}
                      textAnchor="middle"
                    >
                      {d.sugarG.toFixed(0)}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
          </Svg>

          {/* Legend */}
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[s.legendText, { color: colors.muted }]}>Within budget</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[s.legendText, { color: colors.muted }]}>Over budget</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendLine]} />
              <Text style={[s.legendText, { color: colors.muted }]}>Daily limit</Text>
            </View>
          </View>

          {/* Smart insight row */}
          {hasSomeData && (
            <View style={[s.insightRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {insightQuery.isLoading ? (
                <View style={s.insightLoading}>
                  <ActivityIndicator size="small" color="#F59E0B" />
                  <Text style={[s.insightLoadingText, { color: colors.muted }]}>Generating insight…</Text>
                </View>
              ) : insightQuery.data?.insight ? (
                <>
                  <Text style={s.insightIcon}>✨</Text>
                  <Text style={[s.insightText, { color: colors.foreground }]}>
                    {insightQuery.data.insight}
                  </Text>
                </>
              ) : null}
            </View>
          )}

          {/* WHO citation */}
          <Text style={[s.citation, { color: colors.muted }]}>
            WHO recommends ≤25 g/day free sugars (2015). Budget customisable in Settings.
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    overflow: 'hidden',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIcon: { fontSize: 22 },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  chevron: { fontSize: 12, marginLeft: 8 },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: 'center',
    gap: 8,
  },
  svg: { overflow: 'visible' },
  legend: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: {
    width: 16,
    height: 2,
    backgroundColor: '#F59E0B',
    borderStyle: 'dashed',
    borderWidth: 0,
  },
  legendText: { fontSize: 10 },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    width: '100%',
  },
  insightLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  insightLoadingText: { fontSize: 12, fontStyle: 'italic' },
  insightIcon: { fontSize: 14, lineHeight: 20 },
  insightText: { fontSize: 12, lineHeight: 18, flex: 1 },
  citation: { fontSize: 9, fontStyle: 'italic', textAlign: 'center', lineHeight: 13 },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B18',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    gap: 3,
  },
  streakFire: { fontSize: 13, lineHeight: 18 },
  streakCount: { fontSize: 13, fontWeight: '700', color: '#F59E0B', lineHeight: 18 },
  confettiContainer: {
    position: 'absolute',
    top: 28,
    left: '50%' as unknown as number,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  milestoneBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 11,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#F59E0BCC',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  milestoneBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  shareStreakBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shareStreakBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
