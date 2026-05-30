import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

export const GRACE_PERIOD_KEY = '@med_auto_miss_grace_hours';

/** Options exposed in Settings */
export const GRACE_PERIOD_OPTIONS = [
  { label: '1h', value: 1 },
  { label: '2h', value: 2 },
  { label: '4h', value: 4 },
  { label: 'Never', value: 0 },
] as const;

export type GracePeriodHours = 0 | 1 | 2 | 4;

/** Returns the saved grace period in hours (default 2). 0 = Never auto-mark. */
export async function getMissedGracePeriod(): Promise<GracePeriodHours> {
  try {
    const raw = await AsyncStorage.getItem(GRACE_PERIOD_KEY);
    if (raw === null) return 2;
    const n = Number(raw);
    if ([0, 1, 2, 4].includes(n)) return n as GracePeriodHours;
    return 2;
  } catch {
    return 2;
  }
}

export async function setMissedGracePeriod(hours: GracePeriodHours): Promise<void> {
  await safeSetItem(GRACE_PERIOD_KEY, String(hours));
}
