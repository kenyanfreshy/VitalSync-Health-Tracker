/**
 * SmartNutritionCard
 *
 * Consolidated nutrition dashboard card replacing Active Diet Protocol,
 * Macros Intelligence, and Weekly Sugar Intake tabs.
 *
 * Features:
 *  • Calories + Sugar progress rings (today vs. goal)
 *  • Latest blood glucose reading with animated trend arrow (↑ rising / → stable / ↓ falling)
 *  • Glucose sparkline (last 7 readings)
 *  • High-glucose alert banner (ADA threshold: >180 mg/dL)
 *  • Macros section — horizontal segmented bar (Protein | Fat | Carbs) with
 *    animated fill, AMDR gold-zone glow, and individual progress rows
 *  • 7-day weekly sugar bar chart with dashed budget line
 *  • Camera button for quick meal photo logging via Smart food-scan pipeline
 *  • Smart-generated risk badge, 1-line summary, and 2 actionable recommendations
 *  • Evidence references (collapsed by default per project guidelines)
 *
 * Data sources:
 *  - Calories / macros / sugar: summed from today's SodiumRecord entries
 *  - Blood glucose: from BloodSugarRecord entries
 *  - Health Insights: trpc.nutritionAI.smartNutritionInsights mutation
 *  - Meal photo scan: trpc.nutrition.analysePhoto mutation (same as Nutrition Log scan plate)
 *  - Barcode scan: trpc.nutrition.lookupBarcode mutation (same as Nutrition Log barcode scan)
 */
import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import Svg, {
  Circle,
  Path,
  Rect,
  Line,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { useColorScheme, useColors, useFoodCameraStrings, useDashboardStrings } from '@/hooks';
import { logEvent } from '@/lib/analytics';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import { useHealth } from '@/lib/health/health-context';
import { trpc } from '@/lib/trpc';
import { getLastNDaysNutrients, getTodayNutrients } from '@/lib/health/daily-nutrients';
import { useMacroGoals } from '@/hooks/use-macro-goals';
import { useDietType } from '@/hooks/use-diet-type';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import { AiFoodCameraSheet } from '@/components/ai-food-camera-sheet';
import type { SodiumRecord, BloodSugarRecord } from '@/lib/health/types';
import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Haptics from 'expo-haptics';
import * as SafeImagePicker from '@/lib/safe-image-picker';
import { MacroGoalsSheet } from '@/components/macro-goals-sheet';
import { classifyGlycemicLoad } from '@/hooks/use-nutrition-alignment';
import { lookupBarcodeOFF } from '@/lib/nutrition/open-food-facts';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { intelligenceName } from '@/lib/intelligence';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ADA_HIGH_GLUCOSE = 180;   // mg/dL
const WHO_SUGAR_DEFAULT_G = 25; // WHO free-sugar limit (g/day)
const DEFAULT_GOAL_KCAL = 2000;

// AMDR evidence-based ranges (% of total energy)
const AMDR = {
  proteinMin: 0.10, proteinMax: 0.35,
  fatMin:     0.20, fatMax:     0.35,
  carbsMin:   0.45, carbsMax:   0.65,
};

// Accent colours
const EMERALD = '#10B981';
const AMBER   = '#F59E0B';
const VIOLET  = '#8B5CF6';
const ROSE    = '#F43F5E';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, progress: number): string {
  const clamped = Math.min(Math.max(progress, 0), 0.9999);
  const endAngle = clamped * 360;
  const start = polarToCartesian(cx, cy, r, 0);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// ─── Sub-component: Progress Ring ─────────────────────────────────────────────
interface ProgressRingProps {
  progress: number;
  label: string;
  value: string;
  subValue?: string;
  color: string;
  trackColor: string;
  size?: number;
  strokeWidth?: number;
}

function ProgressRing({
  progress, label, value, subValue, color, trackColor,
  size = 88, strokeWidth = 8,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const over = progress > 1;
  return (
    <View style={[ringStyles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Path
          d={arcPath(cx, cy, r, Math.min(progress, 1))}
          stroke={over ? ROSE : color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <View style={ringStyles.label}>
        <Text style={[ringStyles.value, { color }]} numberOfLines={1}>{value}</Text>
        {subValue ? <Text style={ringStyles.sub} numberOfLines={1}>{subValue}</Text> : null}
        <Text style={ringStyles.name} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: '60%' },
  value: { fontSize: 14, fontWeight: '700', lineHeight: 17 },
  sub: { fontSize: 9, color: '#9BA1A6', lineHeight: 12 },
  name: { fontSize: 9, color: '#9BA1A6', lineHeight: 12, marginTop: 1 },
});

// ─── Sub-component: Glucose Sparkline ─────────────────────────────────────────
function GlucoseSparkline({ values, color, width = 200, height = 40 }: {
  values: number[]; color: string; width?: number; height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = width / (values.length - 1);
  const points = values.map((v, i) => ({
    x: i * xStep,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const fillD = `${pathD} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <Path d={fillD} fill="url(#sparkGrad)" />
      <Path d={pathD} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3} fill={color} />
    </Svg>
  );
}

// ─── Sub-component: Animated Glucose Trend Arrow ──────────────────────────────
function TrendArrow({ trend }: { trend: 'stable' | 'rising' | 'falling' | 'high risk' }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const targetRotation = trend === 'rising' ? -45 : trend === 'falling' ? 45 : 0;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: targetRotation,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [targetRotation, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [-45, 0, 45],
    outputRange: ['-45deg', '0deg', '45deg'],
  });

  const color = trend === 'rising' || trend === 'high risk' ? AMBER
    : trend === 'falling' ? EMERALD
    : '#6B7280';

  return (
    <Animated.Text style={[arrowStyles.arrow, { color, transform: [{ rotate }] }]}>
      →
    </Animated.Text>
  );
}

const arrowStyles = StyleSheet.create({
  arrow: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
});

// ─── Sub-component: Risk Level Badge ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RiskBadge({ level }: { level: 'low' | 'moderate' | 'high' }) {
  const colorMap = {
    low:      { bg: '#ECFDF5', text: '#16A34A', border: '#BBF7D0' },
    moderate: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
    high:     { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  };
  const c = colorMap[level] ?? colorMap.low;
  return (
    <View style={[badgeStyles.container, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[badgeStyles.text, { color: c.text }]}>{level.toUpperCase()} RISK</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});

// ─── Sub-component: Macro Progress Row ────────────────────────────────────────
function MacroRow({ label, grams, goalG, color, pct, isOptimal }: {
  label: string; grams: number; goalG: number; color: string; pct: number; isOptimal: boolean;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue: Math.min(pct, 1), duration: 700, useNativeDriver: false }).start();
  }, [pct, barAnim]);
  const barW = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={macroStyles.row}>
      <View style={macroStyles.rowHeader}>
        <Text style={[macroStyles.label, { color: isOptimal ? color : '#9BA1A6' }]}>{label}</Text>
        <Text style={macroStyles.grams}>
          {grams.toFixed(0)}g
          <Text style={macroStyles.goal}> / {goalG}g</Text>
        </Text>
      </View>
      <View style={macroStyles.track}>
        <Animated.View style={[macroStyles.fill, { width: barW, backgroundColor: color }]} />
        {/* AMDR gold-zone marker at 100% of goal */}
        {isOptimal && (
          <View style={[macroStyles.goldMarker, { backgroundColor: AMBER + '60' }]} />
        )}
      </View>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  row: { marginBottom: 8 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  grams: { fontSize: 11, fontWeight: '700', color: '#ECEDEE', lineHeight: 14 },
  goal: { fontSize: 10, fontWeight: '400', color: '#9BA1A6' },
  track: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: 3 },
  goldMarker: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 12,
    borderRadius: 3,
  },
});

// ─── Sub-component: 7-Day Sugar Bar Chart ─────────────────────────────────────
function WeeklySugarBars({ weeklyNutrients, sugarBudgetG, colors }: {
  weeklyNutrients: ({ date: string; sugar_g: number } | null)[];
  sugarBudgetG: number;
  colors: ReturnType<typeof useColors>;
}) {
  const W = 260;
  const H = 56;
  const barW = 28;
  const gap = (W - barW * 7) / 6;
  const maxVal = Math.max(sugarBudgetG * 1.5, ...weeklyNutrients.map(d => d?.sugar_g ?? 0));
  const scaleY = (v: number) => H - (v / maxVal) * (H - 4) - 2;

  // Budget line y
  const budgetY = scaleY(sugarBudgetG);

  return (
    <View style={sugarBarStyles.container}>
      <Text style={[sugarBarStyles.title, { color: colors.muted }]}>7-DAY SUGAR</Text>
      <Svg width={W} height={H + 18}>
        {/* Dashed budget line */}
        <Line
          x1={0} y1={budgetY} x2={W} y2={budgetY}
          stroke={AMBER} strokeWidth={1} strokeDasharray="4,3"
        />
        {weeklyNutrients.map((day, i) => {
          const x = i * (barW + gap);
          const val = day?.sugar_g ?? 0;
          const barH = val > 0 ? Math.max(3, (val / maxVal) * (H - 4)) : 2;
          const y = H - barH;
          const over = val > sugarBudgetG;
          const label = day?.date ? day.date.slice(5) : '';
          return (
            <React.Fragment key={i}>
              <Rect
                x={x} y={y} width={barW} height={barH}
                rx={3} ry={3}
                fill={over ? ROSE + 'CC' : EMERALD + 'CC'}
              />
              <Path
                d={`M ${x} ${H + 2} L ${x + barW} ${H + 2}`}
                stroke="transparent"
              />
              {/* Date label */}
              {label ? (
                <Path d={`M ${x + barW / 2} ${H + 4} L ${x + barW / 2} ${H + 4}`} stroke="transparent" />
              ) : null}
            </React.Fragment>
          );
        })}
        {/* Budget label */}
        <Path
          d={`M ${W - 2} ${budgetY - 2} L ${W - 2} ${budgetY - 2}`}
          stroke="transparent"
        />
      </Svg>
      {/* Date labels row */}
      <View style={sugarBarStyles.labelsRow}>
        {weeklyNutrients.map((day, i) => (
          <Text key={i} style={[sugarBarStyles.dateLabel, { color: colors.muted }]}>
            {day?.date ? day.date.slice(8) : '—'}
          </Text>
        ))}
      </View>
      <Text style={[sugarBarStyles.budgetLabel, { color: AMBER }]}>
        — {sugarBudgetG}g budget
      </Text>
    </View>
  );
}

const sugarBarStyles = StyleSheet.create({
  container: { marginTop: 12 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 260,
    marginTop: 2,
  },
  dateLabel: { fontSize: 9, lineHeight: 12, width: 28, textAlign: 'center' },
  budgetLabel: { fontSize: 10, marginTop: 4, lineHeight: 14 },
});

// ─── Props ────────────────────────────────────────────────────────────────────
export interface SmartNutritionCardProps {
  sodiumRecords: SodiumRecord[];
  bloodSugarRecords: BloodSugarRecord[];
  goalKcal?: number;
  sugarBudgetG?: number;
  dietProtocol?: string;
  defaultExpanded?: boolean;
  overrideExpanded?: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Sub-component: Period Selector ──────────────────────────────────────────
type Period = 'today' | '7d' | '14d' | '30d';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7d' },
  { key: '14d',   label: '14d' },
  { key: '30d',   label: '30d' },
];

function PeriodSelector({
  period,
  onChange,
  isDark,
  colors,
}: {
  period: Period;
  onChange: (p: Period) => void;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const ds = useDashboardStrings();
  const PERIOD_OPTIONS: { key: Period; label: string }[] = [
    { key: 'today', label: ds.winToday ?? 'Today' },
    { key: '7d',    label: '7d' },
    { key: '14d',   label: '14d' },
    { key: '30d',   label: '30d' },
  ];
  return (
    <View style={periodS.row}>
      {PERIOD_OPTIONS.map(opt => {
        const active = opt.key === period;
        return (
          <Pressable
            key={opt.key}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(opt.key);
            }}
            style={[
              periodS.btn,
              active && {
                backgroundColor: isDark ? 'rgba(139,92,246,0.20)' : 'rgba(139,92,246,0.12)',
                borderColor: isDark ? 'rgba(139,92,246,0.45)' : 'rgba(139,92,246,0.35)',
              },
              !active && {
                backgroundColor: 'transparent',
                borderColor: 'transparent',
              },
            ]}
          >
            <Text style={[
              periodS.btnText,
              { color: active ? VIOLET : colors.muted },
              active && { fontWeight: '700' },
            ]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const periodS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
    padding: 3,
    marginBottom: 12,
    gap: 2,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
});

export function SmartNutritionCard({
  sodiumRecords,
  bloodSugarRecords,
  goalKcal = DEFAULT_GOAL_KCAL,
  sugarBudgetG = WHO_SUGAR_DEFAULT_G,
  dietProtocol,
  defaultExpanded = false,
  overrideExpanded,
}: SmartNutritionCardProps) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const fc = useFoodCameraStrings();
  const ds = useDashboardStrings();
  const { addSodium } = useHealth();
  const { goals: macroGoals } = useMacroGoals();
  const { dietType } = useDietType();
  const dietOption = DIET_TYPE_OPTIONS.find(o => o.value === dietType);
  // Diet-aware button styling — mirrors unified-nutrition-card.tsx
  const _dietEmoji  = dietOption?.emoji  ?? '🍽️';
  const _dietAccent = dietOption?.color  ?? '#06B6D4';
  // Only show diet label in search button when user has chosen a non-default protocol
  const hasDietProfile = !!dietType && dietType !== 'balanced';
  const _dietLabel = hasDietProfile && dietOption ? dietOption.label : null;
  const { requirePremium, PremiumGateSheet: ScanMealGateSheet } = usePremiumGate();
  const [searchSheetVisible, setSearchSheetVisible] = useState(false);
  const [cameraInitialMode, setCameraInitialMode] = useState<'home' | 'plate' | 'barcode' | 'search'>('search');
  const [period, setPeriod] = useState<'today' | '7d' | '14d' | '30d'>('7d');
  const [expanded, setExpanded] = useCardExpanded('smart-nutrition', defaultExpanded, overrideExpanded);
  const [refsExpanded, setRefsExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [macroGoalsSheetVisible, setMacroGoalsSheetVisible] = useState(false);

  // ── Today's nutrition totals ─────────────────────────────────────────────
  const _today = todayKey();
  const todayNutrients = useMemo(
    () => getTodayNutrients(sodiumRecords),
    [sodiumRecords],
  );
  const totalCalories = todayNutrients?.total_calories_kcal ?? 0;
  const totalSugarG   = todayNutrients?.sugar_g ?? 0;
  const totalProteinG = todayNutrients?.protein_g ?? 0;
  const totalFatG     = todayNutrients?.fats_g ?? 0;
  const totalCarbsG   = todayNutrients?.carbohydrates_g ?? 0;
  const totalFiberG   = todayNutrients?.fiber_g ?? 0;
  const totalGL       = todayNutrients?.glycemic_load ?? 0;
  const bsImpact      = classifyGlycemicLoad(totalGL);
  const remainingKcal = macroGoals?.calories && macroGoals.calories > 0
    ? macroGoals.calories - totalCalories
    : null;

  // ── 7-day weekly sugar data ──────────────────────────────────────────────
  const weeklyNutrients = useMemo(
    () => {
      const days = getLastNDaysNutrients(sodiumRecords, 7);
      // Ensure exactly 7 slots (fill missing days with null)
      const map = new Map(days.map(d => [d.date, d]));
      const result: ({ date: string; sugar_g: number } | null)[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const entry = map.get(key);
        result.push(entry ? { date: key, sugar_g: entry.sugar_g } : { date: key, sugar_g: 0 });
      }
      return result;
    },
    [sodiumRecords],
  );

  // ── Latest blood glucose ─────────────────────────────────────────────────
  const latestGlucose = useMemo(() => {
    if (!bloodSugarRecords.length) return null;
    return [...bloodSugarRecords].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0];
  }, [bloodSugarRecords]);

  const glucoseMgDl = latestGlucose?.valueMgDl ?? null;
  const highGlucoseAlert = glucoseMgDl != null && glucoseMgDl > ADA_HIGH_GLUCOSE;

  // ── Glucose sparkline (last 7 readings) ─────────────────────────────────
  const glucoseSparkValues = useMemo(() => {
    return [...bloodSugarRecords]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-7)
      .map(r => r.valueMgDl)
      .filter((v): v is number => v != null);
  }, [bloodSugarRecords]);

  // ── Macro goals ──────────────────────────────────────────────────────────
  const proteinGoalG = macroGoals?.protein ?? 50;
  const fatGoalG     = macroGoals?.fat ?? 65;
  const carbsGoalG   = macroGoals?.carbs ?? 250;

  // AMDR alignment check
  const totalKcal = totalCalories > 0 ? totalCalories : 1;
  const proteinPct = (totalProteinG * 4) / totalKcal;
  const fatPct     = (totalFatG * 9) / totalKcal;
  const carbsPct   = (totalCarbsG * 4) / totalKcal;
  const proteinOptimal = proteinPct >= AMDR.proteinMin && proteinPct <= AMDR.proteinMax;
  const fatOptimal     = fatPct >= AMDR.fatMin && fatPct <= AMDR.fatMax;
  const carbsOptimal   = carbsPct >= AMDR.carbsMin && carbsPct <= AMDR.carbsMax;

  // ── Health Insights ──────────────────────────────────────────────────────────
  const insightsMutation = trpc.nutritionAI.smartNutritionInsights.useMutation();
  const analysePhotoMutation = trpc.nutrition.analysePhoto.useMutation();
  const _lookupBarcodeMutation = trpc.nutrition.lookupBarcode.useMutation();
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [insights, setInsights] = useState<{
    summary: string;
    risk_level: 'low' | 'moderate' | 'high';
    predicted_glucose_trend: 'stable' | 'rising' | 'high risk';
    recommendations: string[];
    references: string[];
  } | null>(null);
  const lastFetchRef = useRef<string>('');

  const fetchInsights = useCallback(async () => {
    const key = `${Math.round(totalCalories)}-${totalSugarG.toFixed(1)}-${glucoseMgDl ?? 'null'}`;
    if (key === lastFetchRef.current) return;
    lastFetchRef.current = key;
    try {
      const result = await insightsMutation.mutateAsync({
        caloriesKcal: totalCalories,
        sugarG: totalSugarG,
        glucoseMgDl: glucoseMgDl ?? undefined,
        dietProtocol,
        goalCalories: goalKcal,
        sugarBudgetG,
      });
      setInsights(result);
    } catch (_unused) {
      // silently fail — card still shows rings and glucose
    }
  }, [totalCalories, totalSugarG, glucoseMgDl, dietProtocol, goalKcal, sugarBudgetG, insightsMutation]);

  // ── Meal photo scan ──────────────────────────────────────────────────────
  const handleCameraPress = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const perm = await SafeImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera Access', 'Please allow camera access in Settings to scan meals.');
        return;
      }
      const result = await SafeImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      setScanning(true);

      // Primary path: Gemini Vision (single-step image → nutrition JSON, no USDA needed)
      const { recogniseAndLookup } = await import('@/lib/nutrition/apple-vision-food');
      const { recognition, usdaItem } = await recogniseAndLookup(result.assets[0].base64);

      let scan: {
        sodiumMg: number; potassiumMg?: number | null; foodDescription: string;
        calories?: number | null; carbsG?: number | null; sugarG?: number | null;
        fatG?: number | null; proteinG?: number | null; fiberG?: number | null;
        glycemicLoad?: number | null;
      };

      if (usdaItem) {
        scan = {
          sodiumMg: usdaItem.sodiumMg ?? 0,
          foodDescription: usdaItem.description,
          calories: usdaItem.calories,
          carbsG: usdaItem.carbsG,
          sugarG: usdaItem.sugarG,
          fatG: usdaItem.fatG,
          proteinG: usdaItem.proteinG,
          fiberG: usdaItem.fiberG,
          glycemicLoad: usdaItem.glycemicLoad,
        };
      } else if (recognition.primaryFood) {
        scan = { sodiumMg: 0, foodDescription: recognition.primaryFood };
      } else {
        scan = { sodiumMg: 0, foodDescription: 'Meal photo' };
      }

      // Save as a SodiumRecord so it appears in all nutrition views
      const record: SodiumRecord = {
        id: `sn-photo-${Date.now()}`,
        timestamp: new Date().toISOString(),
        sodiumMg: scan.sodiumMg ?? 0,
        potassiumMg: scan.potassiumMg ?? undefined,
        mealContext: 'other',
        foodDescription: scan.foodDescription || 'Meal photo',
        source: 'ai-photo',
        nutrientSource: 'ai_scan',
        calories: scan.calories ?? undefined,
        carbsG: scan.carbsG ?? undefined,
        sugarG: scan.sugarG ?? undefined,
        fatG: scan.fatG ?? undefined,
        proteinG: scan.proteinG ?? undefined,
        fiberG: scan.fiberG ?? undefined,
        glycemicLoad: scan.glycemicLoad ?? undefined,
      };
      await addSodium(record);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Meal Logged',
        `${scan.foodDescription || 'Meal'} logged — ${scan.calories ?? '?'} kcal · ${(scan.proteinG as number | null | undefined)?.toFixed(0) ?? '?'}g protein · ${(scan.carbsG as number | null | undefined)?.toFixed(0) ?? '?'}g carbs · ${(scan.fatG as number | null | undefined)?.toFixed(0) ?? '?'}g fat`,
        [{ text: 'OK' }],
      );
      // Refresh Health Insights with new data
      lastFetchRef.current = '';
      fetchInsights();
    } catch (err: any) {
      Alert.alert('Scan Failed', err?.message ?? 'Could not analyse the photo. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setScanning(false);
    }
  }, [addSodium, fetchInsights]);

  // ── Barcode scan ────────────────────────────────────────────────────────
  const _handleBarcodePress = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowBarcodeScanner(true);
  }, []);

  const handleBarcodeDetected = useCallback(async (barcodeValue: string) => {
    setShowBarcodeScanner(false);
    setBarcodeScanning(true);
    try {
      const scan = await lookupBarcodeOFF(barcodeValue);
      if (!scan) throw new Error('Product not found. Try searching by name.');
      const record: SodiumRecord = {
        id: `sn-barcode-${Date.now()}`,
        timestamp: new Date().toISOString(),
        sodiumMg: scan.sodiumMg ?? 0,
        potassiumMg: scan.potassiumMg ?? undefined,
        mealContext: 'other',
        foodDescription: scan.productName || 'Scanned product',
        source: 'barcode-scan',
        nutrientSource: 'ai_scan',
        calories: scan.calories ?? undefined,
        carbsG: scan.carbsG ?? undefined,
        sugarG: scan.sugarG ?? undefined,
        fatG: scan.fatG ?? undefined,
        proteinG: scan.proteinG ?? undefined,
        fiberG: scan.fiberG ?? undefined,
        glycemicLoad: scan.glycemicLoad ?? undefined,
      };
      await addSodium(record);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Product Logged',
        `${scan.productName} — ${scan.calories ?? '?'} kcal · ${scan.proteinG?.toFixed(0) ?? '?'}g protein · ${scan.carbsG?.toFixed(0) ?? '?'}g carbs · ${scan.fatG?.toFixed(0) ?? '?'}g fat`,
        [{ text: 'OK' }],
      );
      lastFetchRef.current = '';
      fetchInsights();
    } catch (err: any) {
      Alert.alert('Scan Failed', err?.message ?? 'Could not read the barcode. Please try again.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBarcodeScanning(false);
    }
  }, [addSodium, fetchInsights]);

  // ── Toggle ───────────────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (next && !insights) fetchInsights();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [expanded, setExpanded, insights, fetchInsights]);

  const calProgress   = goalKcal > 0 ? totalCalories / goalKcal : 0;
  const sugarProgress = sugarBudgetG > 0 ? totalSugarG / sugarBudgetG : 0;

  const glucoseColor =
    glucoseMgDl == null ? colors.muted
    : glucoseMgDl > ADA_HIGH_GLUCOSE ? colors.error
    : glucoseMgDl < 70 ? colors.warning
    : colors.success;

  // Derive trend from sparkline slope
  const glucoseTrend: 'stable' | 'rising' | 'falling' | 'high risk' = useMemo(() => {
    if (highGlucoseAlert) return 'high risk';
    if (glucoseSparkValues.length < 2) return 'stable';
    const last = glucoseSparkValues[glucoseSparkValues.length - 1];
    const prev = glucoseSparkValues[glucoseSparkValues.length - 2];
    if (last == null || prev == null) return 'stable';
    const delta = last - prev;
    if (delta > 10) return 'rising';
    if (delta < -10) return 'falling';
    return 'stable';
  }, [glucoseSparkValues, highGlucoseAlert]);

  // Card background
  const cardBg = isDark ? 'rgba(16,18,24,0.92)' : colors.surface;
  const cardBorder = isDark ? 'rgba(139,92,246,0.22)' : colors.border;

  return (
    <>
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `${ds.nutritionBreakdown} — Collapse` : `${ds.nutritionBreakdown} — Expand`}
      >
        {/* ── Top row: icon + title/subtitle + status pill + chevron ── */}
        <View style={styles.headerTopRow}>
          <View style={[styles.iconBg, { backgroundColor: isDark ? VIOLET + '22' : VIOLET + '18' }]}>
            <Text style={{ fontSize: 16 }}>📊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>{ds.nutritionBreakdown}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
              7-Day Avg · Evidence-Based
            </Text>
          </View>
          {/* Status pill */}
          {(() => {
            const noData = totalCalories === 0;
            const onTrack = calProgress >= 0.7 && calProgress <= 1.15;
            const label = noData ? 'No Data' : onTrack ? ds.onTrack : 'Partial';
            const pillBg = noData
              ? (isDark ? 'rgba(155,161,166,0.15)' : 'rgba(107,114,128,0.10)')
              : onTrack
              ? (isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.10)')
              : (isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.10)');
            const pillBorder = noData
              ? (isDark ? 'rgba(155,161,166,0.30)' : 'rgba(107,114,128,0.25)')
              : onTrack
              ? (isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.30)')
              : (isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.30)');
            const pillText = noData ? colors.muted : onTrack ? EMERALD : AMBER;
            return (
              <View style={[styles.statusPill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
                <View style={[styles.statusPillDot, { backgroundColor: pillText }]} />
                <Text style={[styles.statusPillText, { color: pillText }]}>{label}</Text>
              </View>
            );
          })()}
          {/* Mini calorie progress ring — only in collapsed state */}
          {!expanded && (
            <ProgressRing
              progress={calProgress}
              label="goal"
              value={calProgress > 0 ? `${Math.round(calProgress * 100)}%` : '—'}
              color={AMBER}
              trackColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}
              size={56}
              strokeWidth={5}
            />
          )}
          <IconSymbol
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={16}
            color={colors.muted}
          />
        </View>

        {/* ── Collapsed: always show Scan Meal + Search Food buttons ── */}
        {!expanded && (
          <View style={styles.collapsedBtnRow}>
            {/* Scan Meal — green border, camera icon (Premium) */}
            <Pressable
              onPress={requirePremium(() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCameraInitialMode('home');
                setSearchSheetVisible(true);
              }, { feature: 'Scan a Meal' })}
              style={({ pressed }) => [
                styles.scanMealBtn,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityLabel="Scan meal"
            >
              <>
                <Text style={styles.scanMealBtnIcon}>📷</Text>
                <Text style={[styles.scanMealBtnText, { color: EMERALD }]}>{ds.scanMeal}</Text>
              </>
            </Pressable>

            {/* Search Food — violet border, search icon */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearchSheetVisible(true);
              }}
              style={({ pressed }) => [
                styles.searchFoodBtn,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityLabel="Search food"
            >
              <Text style={styles.searchFoodBtnIcon}>🔍</Text>
              <Text style={[styles.searchFoodBtnText, { color: VIOLET }]}>{ds.searchFood}</Text>
            </Pressable>
          </View>
        )}
      </Pressable>

      {/* ── High Glucose Alert ──────────────────────────────────────────── */}
      {highGlucoseAlert && (
        <View style={[styles.alertBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <Text style={styles.alertText}>
            ⚠ High glucose alert — {glucoseMgDl} mg/dL (ADA threshold: {ADA_HIGH_GLUCOSE} mg/dL)
          </Text>
        </View>
      )}

      {/* ── Expanded Body ───────────────────────────────────────────────── */}
      {expanded && (
        <View style={styles.body}>

          {/* ── Period Selector (Today / 7d / 14d / 30d) ────────────────── */}
          <PeriodSelector period={period} onChange={setPeriod} isDark={isDark} colors={colors} />

          {/* ── Progress Rings Row ──────────────────────────────────────── */}
          <View style={styles.ringsRow}>
            <ProgressRing
              progress={calProgress}
              label={ds.calories ?? fc.calories}
              value={`${Math.round(totalCalories)}`}
              subValue={`/ ${Math.round(goalKcal)}`}
              color={VIOLET}
              trackColor={isDark ? 'rgba(255,255,255,0.06)' : colors.border}
            />
            <ProgressRing
              progress={sugarProgress}
              label="Sugar"
              value={`${totalSugarG.toFixed(0)}g`}
              subValue={`/ ${sugarBudgetG}g`}
              color={sugarProgress > 1 ? ROSE : AMBER}
              trackColor={isDark ? 'rgba(255,255,255,0.06)' : colors.border}
            />
            {/* Glucose block with animated trend arrow */}
            <View style={styles.glucoseBlock}>
              <View style={styles.glucoseValueRow}>
                <Text style={[styles.glucoseValue, { color: glucoseColor }]}>
                  {glucoseMgDl != null ? `${glucoseMgDl}` : '—'}
                </Text>
                {glucoseMgDl != null && (
                  <TrendArrow trend={glucoseTrend} />
                )}
              </View>
              <Text style={[styles.glucoseUnit, { color: colors.muted }]}>mg/dL</Text>
              <Text style={[styles.glucoseLabel, { color: colors.muted }]}>Glucose</Text>
              {glucoseSparkValues.length >= 2 && (
                <View style={{ marginTop: 4 }}>
                  <GlucoseSparkline values={glucoseSparkValues} color={glucoseColor} width={72} height={28} />
                </View>
              )}
            </View>
          </View>

          {/* ── Macros Section ──────────────────────────────────────────── */}
          <View style={[styles.macrosSection, { borderColor: isDark ? 'rgba(139,92,246,0.18)' : colors.border }]}>
            <View style={styles.macrosSectionHeader}>
              <Text style={[styles.macrosSectionTitle, { color: isDark ? VIOLET : colors.muted }]}>
                NUTRITIONAL ALIGNMENT
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {totalCalories > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.macrosKcal, { color: colors.muted }]}>
                      {Math.round(totalCalories)} kcal
                    </Text>
                    {remainingKcal !== null && (
                      <View style={[styles.remainingPill, {
                        backgroundColor: remainingKcal >= 0 ? '#8B5CF6' + '18' : '#EF4444' + '18',
                        borderColor: remainingKcal >= 0 ? '#8B5CF6' + '44' : '#EF4444' + '44',
                      }]}>
                        <Text style={[styles.remainingPillText, {
                          color: remainingKcal >= 0 ? '#8B5CF6' : '#EF4444',
                        }]}>
                          {remainingKcal >= 0
                            ? `${Math.round(remainingKcal)} left`
                            : `+${Math.round(Math.abs(remainingKcal))} over`}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                <Pressable
                  onPress={() => setMacroGoalsSheetVisible(true)}
                  style={({ pressed }) => [styles.editGoalsBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel="Edit macro goals"
                  hitSlop={8}
                >
                  <Text style={[styles.editGoalsBtnText, { color: VIOLET }]}>{ds.goal}</Text>
                </Pressable>
              </View>
            </View>
            {totalCalories > 0 ? (
              <>
                <MacroRow
                  label={`Protein  ${proteinOptimal ? '✓' : ''}`}
                  grams={totalProteinG}
                  goalG={proteinGoalG}
                  color={EMERALD}
                  pct={proteinGoalG > 0 ? totalProteinG / proteinGoalG : 0}
                  isOptimal={proteinOptimal}
                />
                <MacroRow
                  label={`Fat  ${fatOptimal ? '✓' : ''}`}
                  grams={totalFatG}
                  goalG={fatGoalG}
                  color={AMBER}
                  pct={fatGoalG > 0 ? totalFatG / fatGoalG : 0}
                  isOptimal={fatOptimal}
                />
                <MacroRow
                  label={`Carbs  ${carbsOptimal ? '✓' : ''}`}
                  grams={totalCarbsG}
                  goalG={carbsGoalG}
                  color={VIOLET}
                  pct={carbsGoalG > 0 ? totalCarbsG / carbsGoalG : 0}
                  isOptimal={carbsOptimal}
                />
                {totalFiberG > 0 && (
                  <Text style={[styles.fiberLabel, { color: colors.muted }]}>
                    Fiber: {totalFiberG.toFixed(0)}g
                    {totalFiberG >= 25 ? '  ✓ Adequate (WHO ≥25g/day)' : '  ↑ Aim for ≥25g/day'}
                  </Text>
                )}
                {/* Blood sugar impact badge */}
                {totalGL > 0 && (
                  <View style={[styles.bsImpactRow, {
                    backgroundColor: bsImpact.color + '14',
                    borderColor: bsImpact.color + '44',
                  }]}>
                    <View style={[styles.bsImpactDot, { backgroundColor: bsImpact.color }]} />
                    <Text style={[styles.bsImpactLabel, { color: bsImpact.color }]}>
                      {bsImpact.label}
                    </Text>
                    <Text style={[styles.bsImpactGL, { color: bsImpact.color + 'BB' }]}>
                      GL {totalGL.toFixed(0)}
                    </Text>
                    <Text style={[styles.bsImpactDesc, { color: isDark ? '#64748B' : '#9CA3AF' }]}>
                      {bsImpact.description}
                    </Text>
                  </View>
                )}
                <Text style={[styles.amdrNote, { color: isDark ? AMBER + 'BB' : '#D97706' }]}>
                  ✓ = within AMDR evidence-based range
                </Text>
              </>
            ) : (
              <Text style={[styles.macrosEmpty, { color: colors.muted }]}>
                Log a meal to see nutrition breakdown
              </Text>
            )}
          </View>

          {/* ── 7-Day Sugar Bar Chart ───────────────────────────────────── */}
          <WeeklySugarBars
            weeklyNutrients={weeklyNutrients}
            sugarBudgetG={sugarBudgetG}
            colors={colors}
          />

          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border }]} />

          {/* ── Smart Insight Section ──────────────────────────────────────── */}
          <Text style={[styles.insightSectionLabel, { color: colors.muted }]}>
            {intelligenceName} {ds.insightSectionLabel ?? 'Insights'}
          </Text>
          {insightsMutation.isPending && !insights ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={EMERALD} />
              <Text style={[styles.loadingText, { color: colors.muted }]}>
                {intelligenceName} {ds.insightAnalysing ?? 'is analysing your nutrition data…'}
              </Text>
            </View>
          ) : insights ? (
            <View style={styles.insightBlock}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, { color: colors.foreground }]}>
                  {insights.summary}
                </Text>
              </View>
              {insights.recommendations.length > 0 && (
                <View style={styles.recsBlock}>
                  <Text style={[styles.recsTitle, { color: colors.muted }]}>{ds.insightSuggestions ?? 'SUGGESTIONS'}</Text>
                  {insights.recommendations.map((rec, i) => (
                    <View key={i} style={styles.recRow}>
                      <Text style={[styles.recBullet, { color: EMERALD }]}>•</Text>
                      <Text style={[styles.recText, { color: colors.foreground }]}>{rec}</Text>
                    </View>
                  ))}
                </View>
              )}
              {insights.references.length > 0 && (
                <Pressable
                  onPress={() => setRefsExpanded(v => !v)}
                  style={({ pressed }) => [styles.refsToggle, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.refsToggleText, { color: colors.muted }]}>
                    {refsExpanded ? (ds.insightHideReferences ?? '▲ Hide references') : (ds.insightShowReferences ?? '▼ Show references')}
                  </Text>
                </Pressable>
              )}
              {refsExpanded && insights.references.map((ref, i) => (
                <Text key={i} style={[styles.refText, { color: colors.muted }]}>
                  [{i + 1}] {ref}
                </Text>
              ))}
              <Pressable
                onPress={() => { lastFetchRef.current = ''; fetchInsights(); }}
                style={({ pressed }) => [styles.refreshBtn, { borderColor: isDark ? EMERALD + '40' : colors.border }, pressed && { opacity: 0.7 }]}
              >
                {insightsMutation.isPending ? (
                  <ActivityIndicator size="small" color={EMERALD} />
                ) : (
                  <Text style={[styles.refreshText, { color: EMERALD }]}>{ds.insightRefreshAnalysis ?? '↻ Refresh'} {intelligenceName}</Text>
                )}
              </Pressable>
              <Text style={[styles.insightDisclaimer, { color: colors.muted }]}>
                {ds.insightDisclaimer ?? 'For informational purposes only. Not a substitute for medical or dietary advice. Consult a qualified healthcare provider before making health decisions.'}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyBlock}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {ds.insightLogMealPrompt ?? 'Log a meal or tap the camera button to get evidence-based nutrition insights grounded in ADA, WHO, and AMDR guidelines.'}
              </Text>
              <Pressable
                onPress={fetchInsights}
                style={({ pressed }) => [styles.refreshBtn, { borderColor: isDark ? EMERALD + '40' : colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.refreshText, { color: EMERALD }]}>{ds.insightAnalyseWith ?? '↻ Analyse with'} {intelligenceName}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
    {/* ── Macro Goals Sheet ──────────────────────────────────────────────────────── */}
    <MacroGoalsSheet
      visible={macroGoalsSheetVisible}
      onClose={() => setMacroGoalsSheetVisible(false)}
    />
    {/* ── Native Barcode Scanner ────────────────────────────────────────────────────────────────────────────────── */}
    <BarcodeScannerModal
      visible={showBarcodeScanner}
      onBarcode={handleBarcodeDetected}
      onClose={() => setShowBarcodeScanner(false)}
    />
    {/* ── Smart Food Search Sheet (Search Food button) ─────────────────────────────────────────────────────────────────────── */}
    <AiFoodCameraSheet
      visible={searchSheetVisible}
      onClose={() => { setSearchSheetVisible(false); setCameraInitialMode('search'); }}
      initialMode={cameraInitialMode}
      onMealLogged={() => {
        setSearchSheetVisible(false);
        setCameraInitialMode('search');
        lastFetchRef.current = '';
        fetchInsights();
      }}
      onScanMealPress={
        cameraInitialMode === 'search'
          ? requirePremium(() => {
              // Switch to home (scan) mode within the same sheet
              setCameraInitialMode('home');
              setSearchSheetVisible(false);
              setTimeout(() => setSearchSheetVisible(true), 50);
            }, { feature: 'Scan a Meal' })
          : undefined
      }
      onBarcodeScanPress={
        cameraInitialMode === 'search'
          ? requirePremium(() => {
              logEvent('barcode_scan_gate_tap', { source: 'smart_nutrition_card' });
              setCameraInitialMode('barcode');
              setSearchSheetVisible(false);
              setTimeout(() => setSearchSheetVisible(true), 50);
            }, { feature: 'Scan Barcode' })
          : undefined
      }
    />
    {ScanMealGateSheet}
    </>
  );
}
// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  // cameraBtn removed — replaced by visionFoodBtn
  alertBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  alertText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
    lineHeight: 16,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  glucoseBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 88,
  },
  glucoseValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  glucoseValue: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  glucoseUnit: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: -2,
  },
  glucoseLabel: {
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  macrosSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  macrosSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  macrosSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  macrosKcal: {
    fontSize: 10,
    lineHeight: 14,
  },
  fiberLabel: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  amdrNote: {
    fontSize: 9,
    lineHeight: 13,
    marginTop: 6,
    fontStyle: 'italic',
  },
  macrosEmpty: {
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightBlock: {
    gap: 10,
  },
  summaryRow: {
    gap: 6,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  recsBlock: {
    gap: 6,
  },
  recsTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  recRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  recBullet: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  recText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  refsToggle: { paddingVertical: 4 },
  refsToggleText: { fontSize: 11, lineHeight: 16 },
  refText: { fontSize: 10, lineHeight: 15, fontStyle: 'italic' },
  insightDisclaimer: { fontSize: 10, lineHeight: 14, marginTop: 8, textAlign: 'center', fontStyle: 'italic' },
  insightSectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  refreshBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  emptyBlock: {
    gap: 10,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  editGoalsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  editGoalsBtnText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: 0.3,
  },
  remainingPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  remainingPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  bsImpactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  bsImpactDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  bsImpactLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  bsImpactGL: {
    fontSize: 11,
    fontWeight: '700',
  },
  bsImpactDesc: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
    lineHeight: 15,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  statusPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  collapsedBtnRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  logFoodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  logFoodBtnIcon: {
    fontSize: 22,
  },
  logFoodBtnText: {
    flex: 1,
    gap: 2,
  },
  logFoodBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  logFoodBtnSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  logFoodBtnArrow: {
    fontSize: 22,
    fontWeight: '300',
  },
  visionFoodBtn: {
    width: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  visionFoodBtnIcon: {
    fontSize: 22,
  },
  visionFoodBtnLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 12,
  },
  todaySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  todaySummaryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginRight: 2,
  },
  todaySummaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  todaySummaryPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  todaySummaryPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  addMoreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'center',
    marginLeft: 4,
  },
  addMoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  todaySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  scanMealBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#10B981' + '66',
    backgroundColor: '#10B981' + '12',
    gap: 8,
  },
  scanMealBtnIcon: {
    fontSize: 20,
  },
  scanMealBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  searchFoodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#8B5CF6' + '66',
    backgroundColor: '#8B5CF6' + '12',
    gap: 8,
  },
  searchFoodBtnIcon: {
    fontSize: 20,
  },
  searchFoodBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
