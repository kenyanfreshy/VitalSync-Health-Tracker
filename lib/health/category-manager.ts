/**
 * category-manager.ts
 *
 * Data Management Controls — state engine
 *
 * Responsibilities:
 *  1. Define the canonical list of trackable health categories.
 *  2. Persist per-category enabled/disabled state to AsyncStorage.
 *  3. Expose helpers for toggling, bulk-enabling, and reading state.
 *  4. Compute lightweight recommendations for categories that have not
 *     been used in 30–60 days.
 *  5. Estimate per-category on-device storage usage.
 *
 * The enabled state is stored at:
 *   @vsht:category_enabled_state_v1
 *
 * The last-activity timestamps are stored at:
 *   @vsht:category_last_activity_v1
 *
 * All operations are safe to call before hydration — they return defaults
 * (all categories enabled) if the key is not yet present.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const ENABLED_STATE_KEY = '@vsht:category_enabled_state_v1';
const LAST_ACTIVITY_KEY = '@vsht:category_last_activity_v1';

/** Days of inactivity before a suggestion is surfaced. */
const SUGGESTION_THRESHOLD_DAYS = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

export type CategoryGroup =
  | 'vitals'
  | 'metabolic'
  | 'body'
  | 'activity'
  | 'nutrition'
  | 'sleep'
  | 'clinical'
  | 'devices'
  | 'system';

export interface CategoryMeta {
  key: CategoryKey;
  group: CategoryGroup;
  label: string;
  description: string;
  /** SF Symbol name (iOS) — must be present in icon-mapping.ts */
  icon: string;
  color: string;
  /** AsyncStorage keys whose data belongs to this category */
  storageKeys: string[];
}

export interface CategoryRecommendation {
  key: CategoryKey;
  lastActivityDaysAgo: number;
  suggestionText: string;
}

// ─── Category keys ────────────────────────────────────────────────────────────

export type CategoryKey =
  | 'heart_rate'
  | 'blood_pressure'
  | 'blood_glucose'
  | 'a1c'
  | 'weight'
  | 'bmi'
  | 'sleep'
  | 'steps'
  | 'calories'
  | 'nutrition'
  | 'medications'
  | 'immunizations'
  | 'allergies'
  | 'lab_results'
  | 'ekg'
  | 'activity'
  | 'bluetooth_devices'
  | 'smart_reminders'
  | 'weather_insights'
  | 'doctor_appointments'
  | 'notifications'
  | 'background_sync'
  | 'food_scanning'
  | 'prescription_scanning';

// ─── Group labels ─────────────────────────────────────────────────────────────

export const CATEGORY_GROUPS: Record<CategoryGroup, string> = {
  vitals:     'Vitals',
  metabolic:  'Metabolic Health',
  body:       'Body Measurements',
  activity:   'Activity & Fitness',
  nutrition:  'Nutrition',
  sleep:      'Sleep',
  clinical:   'Clinical Records',
  devices:    'Devices & Connectivity',
  system:     'App Behaviour',
};

// ─── Category metadata ────────────────────────────────────────────────────────

export const ALL_CATEGORIES: CategoryMeta[] = [
  // ── Vitals ────────────────────────────────────────────────────────────────
  {
    key: 'heart_rate',
    group: 'vitals',
    label: 'Heart Rate',
    description: 'Resting HR, live pulse, and HRV trends',
    icon: 'heart.fill',
    color: '#EF4444',
    storageKeys: ['@vsht:health_data'],
  },
  {
    key: 'blood_pressure',
    group: 'vitals',
    label: 'Blood Pressure',
    description: 'Systolic / diastolic readings and trend charts',
    icon: 'waveform.path.ecg',
    color: '#DC2626',
    storageKeys: ['@vsht:health_data', '@vsht:bg_bp_staging'],
  },
  {
    key: 'ekg',
    group: 'vitals',
    label: 'EKG',
    description: 'Apple Watch EKG recordings and rhythm classifications',
    icon: 'waveform.path.ecg.rectangle',
    color: '#F43F5E',
    storageKeys: ['@vsht:ekg_cache_v1', '@vsht:ekg_vault_v1'],
  },
  // ── Metabolic ─────────────────────────────────────────────────────────────
  {
    key: 'blood_glucose',
    group: 'metabolic',
    label: 'Blood Glucose',
    description: 'CGM readings, time-in-range, and glucose trends',
    icon: 'drop.fill',
    color: '#DC2626',
    storageKeys: ['@vsht:health_data'],
  },
  {
    key: 'a1c',
    group: 'metabolic',
    label: 'A1C',
    description: 'Estimated A1C and 90-day glucose average',
    icon: 'chart.line.uptrend.xyaxis',
    color: '#F97316',
    storageKeys: ['@vsht:health_data'],
  },
  // ── Body ──────────────────────────────────────────────────────────────────
  {
    key: 'weight',
    group: 'body',
    label: 'Weight',
    description: 'Body weight log and trend over time',
    icon: 'scalemass.fill',
    color: '#8B5CF6',
    storageKeys: ['@vsht:health_data'],
  },
  {
    key: 'bmi',
    group: 'body',
    label: 'BMI',
    description: 'Body mass index calculated from weight and height',
    icon: 'figure.stand',
    color: '#7C3AED',
    storageKeys: ['@vsht:health_data'],
  },
  // ── Activity ──────────────────────────────────────────────────────────────
  {
    key: 'steps',
    group: 'activity',
    label: 'Steps',
    description: 'Daily step count, distance, and active minutes',
    icon: 'figure.walk',
    color: '#22C55E',
    storageKeys: ['@vsht:activity_log_v1'],
  },
  {
    key: 'calories',
    group: 'activity',
    label: 'Calories',
    description: 'Active and resting energy burn',
    icon: 'flame.fill',
    color: '#F59E0B',
    storageKeys: ['@vsht:activity_log_v1'],
  },
  {
    key: 'activity',
    group: 'activity',
    label: 'Activity & Workouts',
    description: 'Workout sessions, readiness score, and exercise history',
    icon: 'figure.run',
    color: '#10B981',
    storageKeys: ['@vsht:activity_log_v1', '@vsht:readiness_history_v1'],
  },
  // ── Sleep ─────────────────────────────────────────────────────────────────
  {
    key: 'sleep',
    group: 'sleep',
    label: 'Sleep',
    description: 'Sleep duration, efficiency, and stage breakdown',
    icon: 'moon.fill',
    color: '#6366F1',
    storageKeys: ['@vsht:health_data'],
  },
  // ── Nutrition ─────────────────────────────────────────────────────────────
  {
    key: 'nutrition',
    group: 'nutrition',
    label: 'Nutrition',
    description: 'Macros, fiber, micronutrients, and meal log',
    icon: 'fork.knife',
    color: '#84CC16',
    storageKeys: ['@vsht:health_data'],
  },
  {
    key: 'food_scanning',
    group: 'nutrition',
    label: 'Food Scanning',
    description: 'Barcode and AI food recognition for meal logging',
    icon: 'barcode.viewfinder',
    color: '#65A30D',
    storageKeys: [],
  },
  // ── Clinical ──────────────────────────────────────────────────────────────
  {
    key: 'medications',
    group: 'clinical',
    label: 'Medications',
    description: 'Medication schedule, doses, and adherence log',
    icon: 'pills.fill',
    color: '#0EA5E9',
    storageKeys: [],
  },
  {
    key: 'immunizations',
    group: 'clinical',
    label: 'Immunizations',
    description: 'Vaccine history and upcoming immunization schedule',
    icon: 'syringe.fill',
    color: '#06B6D4',
    storageKeys: [],
  },
  {
    key: 'allergies',
    group: 'clinical',
    label: 'Allergies',
    description: 'Known allergies and adverse reactions',
    icon: 'allergens',
    color: '#F59E0B',
    storageKeys: [],
  },
  {
    key: 'lab_results',
    group: 'clinical',
    label: 'Lab Results',
    description: 'Blood panel, urinalysis, and other lab reports',
    icon: 'flask.fill',
    color: '#A855F7',
    storageKeys: [],
  },
  {
    key: 'doctor_appointments',
    group: 'clinical',
    label: 'Doctor Appointments',
    description: 'Upcoming and past appointment records',
    icon: 'stethoscope',
    color: '#3B82F6',
    storageKeys: [],
  },
  {
    key: 'prescription_scanning',
    group: 'clinical',
    label: 'Prescription Scanning',
    description: 'Scan and digitise prescription labels',
    icon: 'doc.viewfinder.fill',
    color: '#0284C7',
    storageKeys: [],
  },
  // ── Devices ───────────────────────────────────────────────────────────────
  {
    key: 'bluetooth_devices',
    group: 'devices',
    label: 'Bluetooth Devices',
    description: 'Paired BLE health monitors and wearables',
    icon: 'antenna.radiowaves.left.and.right',
    color: '#0A7EA4',
    storageKeys: [],
  },
  // ── System ────────────────────────────────────────────────────────────────
  {
    key: 'smart_reminders',
    group: 'system',
    label: 'Smart Reminders',
    description: 'Medication, measurement, and wellness reminders',
    icon: 'bell.badge.fill',
    color: '#F59E0B',
    storageKeys: [],
  },
  {
    key: 'weather_insights',
    group: 'system',
    label: 'Weather Insights',
    description: 'Local weather, UV index, and air quality cards',
    icon: 'cloud.sun.fill',
    color: '#06B6D4',
    storageKeys: [],
  },
  {
    key: 'notifications',
    group: 'system',
    label: 'Notifications',
    description: 'Push alerts for threshold breaches and reminders',
    icon: 'bell.fill',
    color: '#EF4444',
    storageKeys: [],
  },
  {
    key: 'background_sync',
    group: 'system',
    label: 'Background Sync',
    description: 'Automatic data fetch from HealthKit and connected devices',
    icon: 'arrow.triangle.2.circlepath',
    color: '#22C55E',
    storageKeys: [
      '@vsht:bg_bp_staging',
      '@vsht:bg_last_sync_time',
      '@vsht:last_hk_bg_sync',
    ],
  },
];

// ─── Default state ────────────────────────────────────────────────────────────

function buildDefaultState(): Record<CategoryKey, boolean> {
  const state = {} as Record<CategoryKey, boolean>;
  for (const cat of ALL_CATEGORIES) {
    state[cat.key] = true;
  }
  return state;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Load the enabled/disabled state for all categories.
 * Returns all-enabled defaults if no state has been saved yet.
 */
export async function loadCategoryEnabledState(): Promise<Record<CategoryKey, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(ENABLED_STATE_KEY);
    if (!raw) return buildDefaultState();
    const parsed = JSON.parse(raw) as Partial<Record<CategoryKey, boolean>>;
    // Merge with defaults so newly added categories default to enabled
    return { ...buildDefaultState(), ...parsed };
  } catch {
    return buildDefaultState();
  }
}

/**
 * Persist the full enabled state map.
 */
export async function saveCategoryEnabledState(
  state: Record<CategoryKey, boolean>
): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_STATE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail — UI will re-read on next mount
  }
}

/**
 * Toggle a single category and persist the result.
 * Returns the updated state map.
 */
export async function toggleCategory(
  key: CategoryKey,
  current: Record<CategoryKey, boolean>
): Promise<Record<CategoryKey, boolean>> {
  const next = { ...current, [key]: !current[key] };
  await saveCategoryEnabledState(next);
  return next;
}

// ─── Last-activity tracking ───────────────────────────────────────────────────

type LastActivityMap = Partial<Record<CategoryKey, number>>;

async function loadLastActivity(): Promise<LastActivityMap> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVITY_KEY);
    return raw ? (JSON.parse(raw) as LastActivityMap) : {};
  } catch {
    return {};
  }
}

/**
 * Record that a category was just accessed (view, sync, or data update).
 * Call this from screen focus handlers or sync completion callbacks.
 */
export async function recordCategoryActivity(key: CategoryKey): Promise<void> {
  try {
    const map = await loadLastActivity();
    map[key] = Date.now();
    await AsyncStorage.setItem(LAST_ACTIVITY_KEY, JSON.stringify(map));
  } catch {
    // Non-critical — ignore
  }
}

// ─── Recommendation engine ────────────────────────────────────────────────────

const SUGGESTION_TEMPLATES = [
  (label: string, days: number) =>
    `You haven't used ${label} recently (${days} days ago). You can disable it anytime in Data Management.`,
  (label: string, _days: number) =>
    `${label} hasn't been updated in a while. Consider disabling it to reduce background activity.`,
  (label: string, _days: number) =>
    `${label} is active but hasn't been viewed recently. Disabling it can free up storage and improve sync speed.`,
];

/**
 * Compute suggestions for categories that are enabled but have not been
 * accessed in SUGGESTION_THRESHOLD_DAYS days.
 *
 * Only surfaces suggestions for categories that are currently enabled —
 * disabled categories are already inactive.
 */
export async function computeRecommendations(
  enabledState: Record<CategoryKey, boolean>
): Promise<CategoryRecommendation[]> {
  const lastActivity = await loadLastActivity();
  const now = Date.now();
  const thresholdMs = SUGGESTION_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const recommendations: CategoryRecommendation[] = [];

  for (const cat of ALL_CATEGORIES) {
    if (!enabledState[cat.key]) continue; // Already disabled

    const lastTs = lastActivity[cat.key];
    if (lastTs === undefined) continue; // Never recorded — no suggestion yet

    const daysAgo = Math.floor((now - lastTs) / (24 * 60 * 60 * 1000));
    if (daysAgo < SUGGESTION_THRESHOLD_DAYS) continue;

    const templateIdx = Math.min(
      Math.floor((daysAgo - SUGGESTION_THRESHOLD_DAYS) / 15),
      SUGGESTION_TEMPLATES.length - 1
    );
    recommendations.push({
      key: cat.key,
      lastActivityDaysAgo: daysAgo,
      suggestionText: SUGGESTION_TEMPLATES[templateIdx](cat.label, daysAgo),
    });
  }

  // Sort by most stale first
  return recommendations.sort((a, b) => b.lastActivityDaysAgo - a.lastActivityDaysAgo);
}

// ─── Storage estimation ───────────────────────────────────────────────────────

/**
 * Estimate the number of bytes stored for a given category by reading
 * the raw JSON string length of each associated AsyncStorage key.
 *
 * This is a best-effort estimate — it measures the serialized JSON size,
 * not the actual on-disk footprint (which varies by OS and encryption).
 */
export async function estimateCategoryStorageBytes(key: CategoryKey): Promise<number> {
  const meta = ALL_CATEGORIES.find((c) => c.key === key);
  if (!meta || meta.storageKeys.length === 0) return 0;

  let total = 0;
  for (const storageKey of meta.storageKeys) {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) total += raw.length; // UTF-16 chars ≈ bytes for ASCII JSON
    } catch {
      // Key not present or read error — skip
    }
  }
  return total;
}

/**
 * Format a byte count as a human-readable string (KB / MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Sync suppression helper ──────────────────────────────────────────────────

/**
 * Returns true if the given category is currently enabled.
 * Use this at the top of any sync / notification / fetch function to
 * short-circuit processing for disabled categories.
 *
 * Example:
 *   if (!(await isCategoryEnabled('heart_rate'))) return;
 */
export async function isCategoryEnabled(key: CategoryKey): Promise<boolean> {
  const state = await loadCategoryEnabledState();
  return state[key] ?? true;
}

/**
 * Synchronous version — use only when the state has already been loaded
 * and passed as a parameter (e.g., inside a React component).
 */
export function isCategoryEnabledSync(
  key: CategoryKey,
  state: Record<CategoryKey, boolean>
): boolean {
  return state[key] ?? true;
}
