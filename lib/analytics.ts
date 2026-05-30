/**
 * analytics.ts — Lightweight on-device analytics for VitalSync
 *
 * Privacy-first design:
 *   • All events are stored exclusively on-device in AsyncStorage.
 *   • No data is transmitted to any external server.
 *   • The log is capped at MAX_EVENTS entries (FIFO eviction) to prevent
 *     unbounded storage growth.
 *   • In __DEV__ mode, events are also echoed to the console for debugging.
 *
 * Usage:
 *   import { logEvent } from '@/lib/analytics';
 *   logEvent('smart_reminders_learn_more_tap');
 *   logEvent('smart_reminders_trial_tap', { source: 'dashboard_nudge' });
 *
 * Swap-out path:
 *   Replace the body of `logEvent` with your SDK call (Firebase, Mixpanel, etc.)
 *   when you're ready — all call sites remain unchanged.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@vsht:analytics_events_v1';
const MAX_EVENTS = 500;

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: string; // ISO-8601
}

/**
 * Log an analytics event.
 * Fire-and-forget — never throws; errors are swallowed so analytics
 * never disrupts the user experience.
 */
export function logEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
): void {
  const event: AnalyticsEvent = {
    name,
    properties,
    timestamp: new Date().toISOString(),
  };

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[Analytics]', name, properties ?? '');
  }

  // Persist asynchronously — do not await
  _persistEvent(event).catch(() => {});
}

async function _persistEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const events: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    events.push(event);
    // FIFO eviction: keep only the most recent MAX_EVENTS entries
    const trimmed = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Swallow — analytics must never crash the app
  }
}

/**
 * Read all stored analytics events (for in-app debug / export).
 * Returns an empty array if nothing is stored or on error.
 */
export async function readAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear all stored analytics events.
 */
export async function clearAnalyticsEvents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Swallow
  }
}
