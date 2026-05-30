/**
 * getSmartActivityMessage
 *
 * Combines up to 3 signals (weather + progress + streak/time/activity gap)
 * to produce a short, punchy, habit-forming motivation message.
 *
 * Signals (priority order):
 *   1. Weather (storm/rain/wind/hot/cold/ideal)
 *   2. Progress (near goal, goal complete, mid, low)
 *   3. Streak (at-risk, active, new, none)
 *   4. Time of day (morning, afternoon, evening)
 *   5. Recent activity gap (recently inactive)
 *
 * No medical advice. Lifestyle guidance only.
 */

import { getWeatherActivityMessage } from './get-weather-activity-message';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartActivityMessageInput {
  tempF?: number | null;
  rainChance?: number | null;
  windMph?: number | null;
  condition?: string | null;
  /** 0–23 hour of the day */
  timeOfDay?: number | null;
  stepsToday?: number | null;
  stepGoal?: number | null;
  streakDays?: number | null;
  /** Hours since last logged activity (null = unknown) */
  lastActiveHours?: number | null;
  /** Optional translated override for the day-one streak message */
  dayOneStreakMsg?: string | null;
}

// ─── Message pools ────────────────────────────────────────────────────────────

const NEAR_GOAL = [
  'You\'re close—finish strong',
  '🔥 Almost there—go grab those last steps',
  'You\'re so close to your goal—keep moving',
  'Final push—you\'ve got this',
  'One last effort and you\'re done',
];

const GOAL_COMPLETE = [
  '🎉 Goal crushed—nice work today',
  'You hit your goal—great day of movement',
  '⚡ Goal done—you showed up today',
  'Step goal complete—well done',
];

const MID_PROGRESS = [
  'Nice momentum—keep it going',
  'Good progress—keep building',
  'You\'re halfway there—stay on it',
  '🌿 Solid start—keep the energy up',
];

const LOW_PROGRESS = [
  'Every step counts—let\'s get moving',
  'Now\'s a great time to start moving',
  'Get up and go—your streak is waiting',
  'Small start, big finish—let\'s go',
];

const STREAK_AT_RISK = [
  'Don\'t break your streak today',
  '🔥 Streak on the line—go move',
  'Keep your streak alive—move now',
  'Your streak is waiting—don\'t let it slip',
];

const STREAK_ACTIVE = [
  '🔥 Streak alive—keep it going',
  'Active streak—don\'t stop now',
  'You\'re on a roll—keep it up',
];

const STREAK_NEW = [
  'New streak started—build on it',
  'Day one of your streak—let\'s go',
  'Fresh start—make it count',
];

const TIME_MORNING = [
  'Great way to start your day',
  'Morning energy—use it',
  '🌿 Start your day with movement',
];

const TIME_AFTERNOON = [
  'Perfect mid-day reset',
  'Afternoon boost—get moving',
  'Break the afternoon slump—go move',
];

const TIME_EVENING = [
  'Nice way to wind down with a walk',
  'Evening session—finish the day strong',
  'Great evening for a walk',
];

const RECENTLY_INACTIVE = [
  'It\'s been a while—now\'s a great time to move',
  'Time to get back at it',
  'Your body is ready—let\'s go',
];

const COMBO_WEATHER_GOAL = [
  'Perfect weather and you\'re close to goal—finish strong',
  '⚡ Great conditions—go grab those last steps',
  'Ideal weather—this is your moment to finish',
];

const COMBO_WEATHER_STREAK = [
  'Great weather and your streak is alive—go move',
  '🔥 Prime conditions—keep your streak going',
  'Perfect day to protect your streak',
];

const COMBO_EVENING_STREAK = [
  'Great evening for a walk—keep your streak alive',
  'Evening move—don\'t let your streak slip',
  'Wind down with a walk—streak protected',
];

// ─── Anti-repetition ring buffer ──────────────────────────────────────────────

const recentSmartMessages: string[] = [];
const MAX_RECENT = 3;

function pick(pool: string[]): string {
  const available = pool.filter((m) => !recentSmartMessages.includes(m));
  const candidates = available.length > 0 ? available : pool;
  const msg = candidates[Math.floor(Math.random() * candidates.length)];
  recentSmartMessages.push(msg);
  if (recentSmartMessages.length > MAX_RECENT) recentSmartMessages.shift();
  return msg;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isIdealWeather(tempF?: number | null, rainChance?: number | null, windMph?: number | null, condition?: string | null): boolean {
  const condLower = (condition ?? '').toLowerCase();
  if (condLower.includes('thunder') || condLower.includes('storm') || condLower.includes('hail')) return false;
  if ((rainChance ?? 0) >= 60) return false;
  if ((windMph ?? 0) >= 20) return false;
  const t = tempF ?? null;
  return t !== null && t >= 60 && t <= 80;
}

function progressBand(stepsToday?: number | null, stepGoal?: number | null): 'complete' | 'near' | 'mid' | 'low' | null {
  if (stepsToday == null || stepGoal == null || stepGoal <= 0) return null;
  const pct = stepsToday / stepGoal;
  if (pct >= 1) return 'complete';
  if (pct >= 0.8) return 'near';
  if (pct >= 0.4) return 'mid';
  return 'low';
}

function timeSlot(hour?: number | null): 'morning' | 'afternoon' | 'evening' | null {
  if (hour == null) return null;
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return null;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function getSmartActivityMessage(input: SmartActivityMessageInput): string {
  const { tempF, rainChance, windMph, condition, timeOfDay, stepsToday, stepGoal, streakDays, lastActiveHours } = input;

  const progress = progressBand(stepsToday, stepGoal);
  const time = timeSlot(timeOfDay);
  const ideal = isIdealWeather(tempF, rainChance, windMph, condition);
  const streakActive = (streakDays ?? 0) > 1;
  const streakNew = streakDays === 1;
  const streakAtRisk = streakActive && (lastActiveHours ?? 0) >= 20;

  // ── Combo signals (highest priority) ──────────────────────────────────────

  // Ideal weather + near goal
  if (ideal && progress === 'near') return pick(COMBO_WEATHER_GOAL);

  // Ideal weather + active streak
  if (ideal && streakActive) return pick(COMBO_WEATHER_STREAK);

  // Evening + streak at risk
  if (time === 'evening' && streakAtRisk) return pick(COMBO_EVENING_STREAK);

  // ── Progress layer ─────────────────────────────────────────────────────────

  if (progress === 'complete') return pick(GOAL_COMPLETE);
  if (progress === 'near') return pick(NEAR_GOAL);

  // ── Streak layer ───────────────────────────────────────────────────────────

  if (streakAtRisk) return pick(STREAK_AT_RISK);
  if (streakActive) return pick(STREAK_ACTIVE);
  if (streakNew) return input.dayOneStreakMsg ?? pick(STREAK_NEW);

  // ── Progress mid/low ──────────────────────────────────────────────────────

  if (progress === 'mid') return pick(MID_PROGRESS);
  if (progress === 'low') return pick(LOW_PROGRESS);

  // ── Recently inactive ─────────────────────────────────────────────────────

  if ((lastActiveHours ?? 0) >= 12) return pick(RECENTLY_INACTIVE);

  // ── Time of day ───────────────────────────────────────────────────────────

  if (time === 'morning') return pick(TIME_MORNING);
  if (time === 'afternoon') return pick(TIME_AFTERNOON);
  if (time === 'evening') return pick(TIME_EVENING);

  // ── Weather fallback ──────────────────────────────────────────────────────

  return getWeatherActivityMessage(tempF, rainChance, windMph, condition);
}
