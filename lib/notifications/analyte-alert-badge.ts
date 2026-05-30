/**
 * analyte-alert-badge.ts
 *
 * Tracks the number of unread analyte threshold alerts so the Settings tab
 * icon can show a badge count. The count is stored in AsyncStorage and is
 * cleared when the user opens the Threshold Alerts settings screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const BADGE_KEY = '@vitalsync/analyte_alert_badge';

/** Increment the unread badge count by 1 (called when an alert fires). */
export async function incrementAnalyteAlertBadge(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(BADGE_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    await safeSetItem(BADGE_KEY, String(isNaN(current) ? 1 : current + 1));
  } catch (_unused) {
    // non-critical — ignore
  }
}

/** Read the current unread badge count. Returns 0 on error. */
export async function getAnalyteAlertBadgeCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(BADGE_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : n;
  } catch (_unused) {
    return 0;
  }
}

/** Clear the badge (called when the user opens the Threshold Alerts screen). */
export async function clearAnalyteAlertBadge(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BADGE_KEY);
  } catch (_unused) {
    // non-critical — ignore
  }
}
