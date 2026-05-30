/**
 * hr-window-pref.ts
 *
 * Persists the user's preferred HR aggregation window (1h / 4h / daily).
 * Used by Settings to save the preference and by health-context to read it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export type HrWindowSize = '1h' | '4h' | 'daily';

const KEY = '@vsht:hr_window';
const DEFAULT: HrWindowSize = '4h';

export async function loadHrWindow(): Promise<HrWindowSize> {
  try {
    const val = await AsyncStorage.getItem(KEY);
    if (val === '1h' || val === '4h' || val === 'daily') return val;
  } catch { /* ignore */ }
  return DEFAULT;
}

export async function saveHrWindow(window: HrWindowSize): Promise<void> {
  await safeSetItem(KEY, window);
}

/** Human-readable label for each window size */
export const HR_WINDOW_LABELS: Record<HrWindowSize, string> = {
  '1h':    '1-hour averages',
  '4h':    '4-hour averages',
  'daily': 'Daily averages',
};

/** Short label for axis labels */
export const HR_WINDOW_SHORT: Record<HrWindowSize, string> = {
  '1h':    '1-hr avg bpm',
  '4h':    '4-hr avg bpm',
  'daily': 'daily avg bpm',
};
