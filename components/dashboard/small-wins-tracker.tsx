/**
 * SmallWinsTracker
 *
 * Motivation tracker with visual streaks for:
 *   1. Vegan protocol adherence (no animal products logged today)
 *   2. Daily step / activity goal
 *   3. Medication adherence (all reminders dismissed = taken)
 *   4. Hydration (sodium log entries suggest adequate fluid intake)
 *   5. Sleep goal (≥7h)
 *
 * Each goal shows:
 *   - A 7-day streak bar (filled dots for completed days)
 *   - Current streak count
 *   - A motivational micro-copy line
 *
 * Data is persisted in AsyncStorage. Goals are evaluated daily from health context data.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  Modal,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useDashboardStrings } from '@/hooks';
import { GlassCard } from '@/components/glass-card';

// ─── Milestone Celebration ────────────────────────────────────────────────────

const MILESTONE_DAYS = [7, 14, 30, 60, 100];
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PARTICLE_COLORS = [
  '#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316',
];

interface Particle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  startX: number;
}

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    opacity: new Animated.Value(1),
    scale: new Animated.Value(1),
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    size: 6 + Math.random() * 8,
    startX: SCREEN_W * 0.2 + Math.random() * SCREEN_W * 0.6,
  }));
}

function CelebrationOverlay({
  visible,
  milestone,
  goalLabel,
  accentColor,
  onClose,
}: {
  visible: boolean;
  milestone: number;
  goalLabel: string;
  accentColor: string;
  onClose: () => void;
}) {
  const particles = useRef(createParticles(30)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Reset particles
    particles.forEach(p => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.scale.setValue(1);
    });
    scaleAnim.setValue(0);

    // Haptic
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Badge pop-in
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 80,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Particle burst
    const anims = particles.map(p => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 180;
      return Animated.parallel([
        Animated.timing(p.x, {
          toValue: Math.cos(angle) * distance,
          duration: 800 + Math.random() * 400,
          useNativeDriver: true,
        }),
        Animated.timing(p.y, {
          toValue: -Math.abs(Math.sin(angle) * distance) - 60,
          duration: 800 + Math.random() * 400,
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 900 + Math.random() * 300,
          useNativeDriver: true,
        }),
        Animated.timing(p.scale, {
          toValue: 0.3,
          duration: 900 + Math.random() * 300,
          useNativeDriver: true,
        }),
      ]);
    });
    Animated.stagger(20, anims).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={celebrate.overlay} onPress={onClose}>
        {/* Particles */}
        {particles.map(p => (
          <Animated.View
            key={p.id}
            style={[
              celebrate.particle,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                backgroundColor: p.color,
                left: p.startX,
                top: SCREEN_H * 0.45,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { scale: p.scale },
                ],
                opacity: p.opacity,
              },
            ]}
          />
        ))}

        {/* Badge */}
        <Animated.View
          style={[
            celebrate.badge,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Text style={celebrate.trophy}>🏆</Text>
          <Text style={[celebrate.milestoneNum, { color: accentColor }]}>{milestone}-Day Streak!</Text>
          <Text style={celebrate.goalLabel}>{goalLabel}</Text>
          <Text style={celebrate.subtext}>
            {milestone === 7 ? 'One full week — incredible consistency!' :
             milestone === 14 ? 'Two weeks strong — building real habits!' :
             milestone === 30 ? 'One month — this is now part of who you are.' :
             milestone === 60 ? 'Two months — your body is transforming.' :
             'Triple digits — you are elite.'}
          </Text>
          <TouchableOpacity
            style={[celebrate.closeBtn, { backgroundColor: accentColor }]}
            onPress={onClose}
          >
            <Text style={celebrate.closeBtnText}>Keep Going! 🚀</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const celebrate = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  badge: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 16,
  },
  trophy: { fontSize: 56 },
  milestoneNum: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  goalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  subtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  closeBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 6,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalConfig {
  id: string;
  label: string;
  icon: string;
  accentColor: string;
  unit: string;
  targetLabel: string;
}

interface DayRecord {
  date: string;   // YYYY-MM-DD
  completed: boolean;
}

interface GoalState {
  id: string;
  streak: number;
  personalBest: number;   // all-time highest streak
  history: DayRecord[];   // last 7 days
  completedToday: boolean;
}

interface WinsStore {
  goals: Record<string, GoalState>;
  lastUpdated: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WINS_KEY = '@vsht:small_wins';

const GOAL_CONFIGS: GoalConfig[] = [
  {
    id: 'vegan',
    label: 'Vegan Protocol',
    icon: '🌱',
    accentColor: '#22C55E',
    unit: 'day',
    targetLabel: 'No animal products logged',
  },
  {
    id: 'activity',
    label: 'Daily Activity',
    icon: '🏃',
    accentColor: '#3B82F6',
    unit: 'day',
    targetLabel: 'Activity recorded today',
  },
  {
    id: 'sleep',
    label: 'Sleep Goal',
    icon: '😴',
    accentColor: '#06B6D4',
    unit: 'day',
    targetLabel: '7+ hours of sleep',
  },
];

const STREAK_MESSAGES: Record<string, string[]> = {
  vegan: [
    'Every plant-based meal is a win for your health.',
    'Your gut microbiome is thriving on plants.',
    'Consistent vegan choices reduce inflammation markers.',
    'Plant-based protein supports lean muscle recovery.',
    'You\'re reducing cardiovascular risk with every meal.',
  ],
  activity: [
    'Movement is medicine — keep the streak alive.',
    'Each active day builds cardiovascular resilience.',
    'Consistent activity improves insulin sensitivity.',
    'Your VO₂ max improves with every active day.',
    'Daily movement reduces all-cause mortality risk.',
  ],
  sleep: [
    'Sleep is when your body repairs and consolidates.',
    'Quality sleep reduces cortisol and inflammation.',
    'Deep sleep is when growth hormone peaks.',
    'Sleep consistency improves cognitive performance.',
    'Your heart rate variability improves with good sleep.',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function computeStreak(history: DayRecord[]): number {
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  let expectedDate = todayStr();
  for (const record of sorted) {
    if (record.date === expectedDate && record.completed) {
      streak++;
      const d = new Date(expectedDate);
      d.setDate(d.getDate() - 1);
      expectedDate = d.toISOString().slice(0, 10);
    } else if (record.date < expectedDate) {
      break;
    }
  }
  return streak;
}

function emptyGoalState(id: string): GoalState {
  return {
    id,
    streak: 0,
    personalBest: 0,
    history: last7Days().map(date => ({ date, completed: false })),
    completedToday: false,
  };
}

function emptyWinsStore(): WinsStore {
  return {
    goals: Object.fromEntries(GOAL_CONFIGS.map(g => [g.id, emptyGoalState(g.id)])),
    lastUpdated: null,
  };
}

async function loadWinsStore(): Promise<WinsStore> {
  try {
    const raw = await AsyncStorage.getItem(WINS_KEY);
    if (!raw) return emptyWinsStore();
    const parsed = JSON.parse(raw) as WinsStore;
    // Ensure all goals exist
    for (const g of GOAL_CONFIGS) {
      if (!parsed.goals[g.id]) parsed.goals[g.id] = emptyGoalState(g.id);
    }
    return parsed;
  } catch (_unused) { return emptyWinsStore(); }
}

async function saveWinsStore(store: WinsStore): Promise<void> {
  await safeSetItem(WINS_KEY, JSON.stringify({
    ...store,
    lastUpdated: new Date().toISOString(),
  }));
}

function getMotivationMessage(goalId: string, streak: number): string {
  const msgs = STREAK_MESSAGES[goalId] ?? ['Keep going!'];
  return msgs[streak % msgs.length];
}

// ─── Auto-evaluate goals from health data ─────────────────────────────────────

interface HealthDataSnapshot {
  hasActivityToday: boolean;
  isVeganToday: boolean;
  hasSleepGoalToday: boolean;
  hasMedAdherenceToday: boolean;
}

const ANIMAL_KEYWORDS = [
  'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'lamb', 'turkey',
  'egg', 'milk', 'cheese', 'butter', 'yogurt', 'cream', 'bacon', 'sausage', 'ham',
  'steak', 'burger', 'meat', 'seafood', 'dairy', 'whey', 'casein',
];

function evaluateHealthData(data: any): HealthDataSnapshot {
  const today = todayStr();

  // Activity: any activity record today
  const hasActivityToday = (data?.activity ?? []).some((a: any) =>
    (a.date ?? a.timestamp ?? '').startsWith(today)
  );

  // Vegan: no sodium log entries today containing animal product keywords
  const todayLogs = (data?.sodiumIntake ?? []).filter((r: any) =>
    (r.timestamp ?? '').startsWith(today)
  );
  const isVeganToday = todayLogs.length === 0 || todayLogs.every((r: any) => {
    const name = (r.mealContext ?? r.foodName ?? r.name ?? '').toLowerCase();
    return !ANIMAL_KEYWORDS.some(k => name.includes(k));
  });

  // Sleep: any sleep record today with duration ≥ 7h
  const hasSleepGoalToday = (data?.sleep ?? []).some((s: any) => {
    const isToday = (s.date ?? s.timestamp ?? '').startsWith(today);
    const hours = s.durationHours ?? (s.durationMinutes ? s.durationMinutes / 60 : 0);
    return isToday && hours >= 7;
  });

  return { hasActivityToday, isVeganToday, hasSleepGoalToday, hasMedAdherenceToday: false };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CelebrationState {
  visible: boolean;
  milestone: number;
  goalLabel: string;
  accentColor: string;
}

const CELEBRATED_KEY = '@vsht:celebrated_milestones';

async function loadCelebrated(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(CELEBRATED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch (_unused) { return new Set(); }
}

async function saveCelebrated(set: Set<string>) {
  await safeSetItem(CELEBRATED_KEY, JSON.stringify([...set]));
}

interface SmallWinsTrackerProps {
  /** When provided, overrides the internal expanded state (true = expanded, false = collapsed). */
  overrideExpanded?: boolean;
  /** Called when the card becomes visible (true) or hidden (false). SmallWinsTracker is always visible. */
  onVisibilityChange?: (visible: boolean) => void;
}

export function SmallWinsTracker({ overrideExpanded, onVisibilityChange }: SmallWinsTrackerProps = {}) {
  const colors = useColors();
  const ds = useDashboardStrings();
  const { state } = useHealth();
  const data = state.data;
  const [store, setStore] = useState<WinsStore>(emptyWinsStore());
  const [expanded, setExpanded] = useState(false);

  // External override from Collapse/Expand All
  // overrideExpanded=false forces card closed; overrideExpanded=true forces card open.
  const prevOverrideRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (overrideExpanded === prevOverrideRef.current) return;
    prevOverrideRef.current = overrideExpanded;
    if (overrideExpanded === false) setExpanded(false);
    else if (overrideExpanded === true) setExpanded(true);
  }, [overrideExpanded]);
  // SmallWinsTracker is always visible — fire once on mount
  const didFireVisibilityRef = useRef(false);
  useEffect(() => {
    if (didFireVisibilityRef.current) return;
    didFireVisibilityRef.current = true;
    onVisibilityChange?.(true);
  }, [onVisibilityChange]);

  const [loaded, setLoaded] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationState>({
    visible: false, milestone: 7, goalLabel: '', accentColor: '#22C55E',
  });
  const celebratedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadCelebrated().then(s => { celebratedRef.current = s; });
  }, []);

  // Load persisted store
  useEffect(() => {
    loadWinsStore().then(s => { setStore(s); setLoaded(true); });
  }, []);

  // Auto-evaluate and update today's completion from health data
  useEffect(() => {
    if (!loaded || !data) return;
    const snapshot = evaluateHealthData(data);
    const today = todayStr();

    setStore(prev => {
      const next = { ...prev, goals: { ...prev.goals } };
      const autoMap: Record<string, boolean> = {
        vegan: snapshot.isVeganToday,
        activity: snapshot.hasActivityToday,
        sleep: snapshot.hasSleepGoalToday,
      };

      let changed = false;
      for (const [id, completed] of Object.entries(autoMap)) {
        const goal = { ...next.goals[id] };
        const histIdx = goal.history.findIndex(h => h.date === today);
          if (histIdx >= 0) {
          if (goal.history[histIdx].completed !== completed) {
            goal.history = [...goal.history];
            goal.history[histIdx] = { date: today, completed };
            goal.completedToday = completed;
            goal.streak = computeStreak(goal.history);
            goal.personalBest = Math.max(goal.personalBest ?? 0, goal.streak);
            next.goals[id] = goal;
            changed = true;
          }
        } else {
          // Add today
          const newHistory = [
            ...goal.history.filter(h => h.date !== today).slice(-6),
            { date: today, completed },
          ];
          goal.history = newHistory;
          goal.completedToday = completed;
          goal.streak = computeStreak(newHistory);
          goal.personalBest = Math.max(goal.personalBest ?? 0, goal.streak);
          next.goals[id] = goal;
          changed = true;
        }
      }

      if (changed) {
        saveWinsStore(next);
        // Check for milestone celebrations
        for (const [id, goal] of Object.entries(next.goals)) {
          const config = GOAL_CONFIGS.find(g => g.id === id);
          if (!config) continue;
          for (const ms of MILESTONE_DAYS) {
            const key = `${id}:${ms}`;
            if (goal.streak === ms && !celebratedRef.current.has(key)) {
              celebratedRef.current.add(key);
              saveCelebrated(celebratedRef.current);
              // Delay slightly so state update completes first
              setTimeout(() => {
                setCelebration({
                  visible: true,
                  milestone: ms,
                  goalLabel: config.label,
                  accentColor: config.accentColor,
                });
              }, 400);
              break;
            }
          }
        }
        return next;
      }
      return prev;
    });
  }, [data, loaded]);

  const toggleGoal = useCallback(async (goalId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const today = todayStr();
    setStore(prev => {
      const next = { ...prev, goals: { ...prev.goals } };
      const goal = { ...next.goals[goalId] };
      const histIdx = goal.history.findIndex(h => h.date === today);
      const newCompleted = !goal.completedToday;
      if (histIdx >= 0) {
        goal.history = [...goal.history];
        goal.history[histIdx] = { date: today, completed: newCompleted };
      } else {
        goal.history = [...goal.history.slice(-6), { date: today, completed: newCompleted }];
      }
      goal.completedToday = newCompleted;
      goal.streak = computeStreak(goal.history);
      goal.personalBest = Math.max(goal.personalBest ?? 0, goal.streak);
      next.goals[goalId] = goal;
      saveWinsStore(next);

      // Check milestone on manual toggle
      const config = GOAL_CONFIGS.find(g => g.id === goalId);
      if (config && newCompleted) {
        for (const ms of MILESTONE_DAYS) {
          const key = `${goalId}:${ms}`;
          if (goal.streak + 1 === ms && !celebratedRef.current.has(key)) {
            celebratedRef.current.add(key);
            saveCelebrated(celebratedRef.current);
            setTimeout(() => {
              setCelebration({
                visible: true,
                milestone: ms,
                goalLabel: config.label,
                accentColor: config.accentColor,
              });
            }, 300);
            break;
          }
        }
      }
      return next;
    });
  }, []);

  const totalStreakDays = useMemo(() =>
    Object.values(store.goals).reduce((sum, g) => sum + g.streak, 0),
    [store]
  );

  const completedToday = useMemo(() =>
    Object.values(store.goals).filter(g => g.completedToday).length,
    [store]
  );

  return (
    <GlassCard accentColor="#22C55E" noPadding style={styles.container}>
      {/* Header */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(e => !e);
        }}
      >
        <Text style={styles.headerIcon}>🏆</Text>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{ds.smallWins}</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {completedToday}/{GOAL_CONFIGS.length} goals today · {totalStreakDays} streak days
          </Text>
        </View>
        {/* Progress dots */}
        <View style={styles.progressDots}>
          {GOAL_CONFIGS.map(g => (
            <View
              key={g.id}
              style={[
                styles.progressDot,
                {
                  backgroundColor: store.goals[g.id]?.completedToday
                    ? g.accentColor
                    : colors.border,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.chevron, { color: colors.muted }]}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {/* Goal cards */}
      {expanded && (
        <View style={styles.goalList}>
          {GOAL_CONFIGS.map(config => {
            const goalState = store.goals[config.id] ?? emptyGoalState(config.id);
            const days7 = last7Days();
            return (
              <GoalCard
                key={config.id}
                config={config}
                goalState={goalState}
                days7={days7}
                onToggle={() => toggleGoal(config.id)}
                colors={colors}
              />
            );
          })}
        </View>
      )}

      <CelebrationOverlay
        visible={celebration.visible}
        milestone={celebration.milestone}
        goalLabel={celebration.goalLabel}
        accentColor={celebration.accentColor}
        onClose={() => setCelebration(c => ({ ...c, visible: false }))}
      />
    </GlassCard>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({
  config,
  goalState,
  days7,
  onToggle,
  colors,
}: {
  config: GoalConfig;
  goalState: GoalState;
  days7: string[];
  onToggle: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const motivationMsg = getMotivationMessage(config.id, goalState.streak);
  const historyMap = new Map(goalState.history.map(h => [h.date, h.completed]));

  return (
    <View style={[
      gCard.container,
      {
        borderColor: goalState.completedToday ? config.accentColor + '50' : colors.border,
        backgroundColor: goalState.completedToday ? config.accentColor + '08' : colors.background,
      },
    ]}>
      {/* Top row */}
      <View style={gCard.topRow}>
        <Text style={gCard.icon}>{config.icon}</Text>
        <View style={gCard.labelBlock}>
          <Text style={[gCard.label, { color: colors.foreground }]}>{config.label}</Text>
          <Text style={[gCard.targetLabel, { color: colors.muted }]}>{config.targetLabel}</Text>
        </View>
        {/* Streak badge */}
        <View style={gCard.streakBlock}>
          <View style={[gCard.streakBadge, { backgroundColor: config.accentColor + '18' }]}>
            <Text style={[gCard.streakCount, { color: config.accentColor }]}>{goalState.streak}</Text>
            <Text style={[gCard.streakUnit, { color: config.accentColor }]}>day{goalState.streak !== 1 ? 's' : ''}</Text>
          </View>
          {(goalState.personalBest ?? 0) > 0 && (
            <Text style={[gCard.personalBest, { color: colors.muted }]}>
              Best: {goalState.personalBest ?? goalState.streak}
            </Text>
          )}
        </View>

      </View>

      {/* 7-day streak bar */}
      <View style={gCard.streakBar}>
        {days7.map((date, _i) => {
          const completed = historyMap.get(date) ?? false;
          const isToday = date === todayStr();
          const dayLabel = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(date + 'T12:00:00').getDay()];
          return (
            <View key={date} style={gCard.dayCol}>
              <View style={[
                gCard.dayDot,
                {
                  backgroundColor: completed ? config.accentColor : colors.border,
                  borderWidth: isToday ? 2 : 0,
                  borderColor: config.accentColor,
                  transform: [{ scale: isToday ? 1.15 : 1 }],
                },
              ]}>
                {completed && <Text style={gCard.checkmark}>✓</Text>}
              </View>
              <Text style={[gCard.dayLabel, { color: isToday ? config.accentColor : colors.muted }]}>
                {dayLabel}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Motivation message */}
      <Text style={[gCard.motivation, { color: config.accentColor }]}>{motivationMsg}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  headerIcon: { fontSize: 20 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerSub: { fontSize: 12 },
  progressDots: { flexDirection: 'row', gap: 4 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  chevron: { fontSize: 16 },
  goalList: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
});

const gCard = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: { fontSize: 20 },
  labelBlock: { flex: 1, gap: 1 },
  label: { fontSize: 13, fontWeight: '700' },
  targetLabel: { fontSize: 11 },
  streakBlock: {
    alignItems: 'center',
    gap: 2,
  },
  streakBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  streakCount: { fontSize: 18, fontWeight: '900', lineHeight: 22 },
  streakUnit: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  personalBest: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 14, fontWeight: '800' },
  streakBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  motivation: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    paddingHorizontal: 2,
  },
});
