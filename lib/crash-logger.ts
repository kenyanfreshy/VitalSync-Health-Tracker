/**
 * VitalSync Local Crash Logger
 *
 * Persists JS errors and unhandled promise rejections to AsyncStorage so they
 * can be reviewed in Settings → Diagnostics without any cloud/server dependency.
 * All data remains on-device and is cleared when the user taps "Clear Logs".
 */

import { safeFormatDate } from '@/lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform, Share } from 'react-native';
import { safeSetItem } from '@/lib/safe-async-storage';

const CRASH_LOG_KEY = '@vsht:crash_logs';
const MAX_LOGS = 50; // Keep the 50 most recent entries to cap storage usage

export interface CrashEntry {
  /** ISO timestamp of when the error was captured */
  timestamp: string;
  /** Short human-readable label (e.g. "RenderError", "UnhandledRejection") */
  type: 'RenderError' | 'UnhandledRejection' | 'NativeError' | 'Warning' | 'Manual';
  /** Error message */
  message: string;
  /** JS stack trace (trimmed to 2 000 chars to limit storage) */
  stack?: string;
  /** Optional component stack from React ErrorBoundary */
  componentStack?: string;
  /** App version at time of crash */
  appVersion?: string;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function logCrash(entry: Omit<CrashEntry, 'timestamp'>): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    const existing: CrashEntry[] = raw ? JSON.parse(raw) : [];

    const newEntry: CrashEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      // Trim stack to avoid bloating storage
      stack: entry.stack ? entry.stack.slice(0, 2000) : undefined,
      componentStack: entry.componentStack
        ? entry.componentStack.slice(0, 1000)
        : undefined,
    };

    // Prepend newest first, cap at MAX_LOGS
    const updated = [newEntry, ...existing].slice(0, MAX_LOGS);
    await safeSetItem(CRASH_LOG_KEY, JSON.stringify(updated));
  } catch (_unused) {
    // Swallow — logging must never cause a secondary crash
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function readCrashLogs(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_unused) {
    return [];
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export async function clearCrashLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_LOG_KEY);
  } catch (_unused) {
    // Swallow
  }
}

// ─── Email Report ──────────────────────────────────────────────────────────

const SUPPORT_EMAIL = 'akorir@vitalsync-clinicalhub.com';

/**
 * Formats all crash log entries into a plain-text email body.
 * Includes a device/app header so the support team can triage quickly.
 */
export function formatCrashLogsForEmail(
  logs: CrashEntry[],
  appVersion: string,
): string {
  const header = [
    '=== VitalSync Crash Report ===',
    `App Version : ${appVersion}`,
    `Platform    : ${Platform.OS} ${Platform.Version}`,
    `Generated   : ${new Date().toISOString()}`,
    `Log Entries : ${logs.length}`,
    '==============================',
    '',
  ].join('\n');

  const entries = logs
    .map((e, i) => {
      const lines = [
        `--- Entry ${i + 1} ---`,
        `Time    : ${e.timestamp}`,
        `Type    : ${e.type}`,
        `Message : ${e.message}`,
      ];
      if (e.stack) lines.push(`Stack   :\n${e.stack}`);
      if (e.componentStack) lines.push(`Component Stack:\n${e.componentStack}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return header + entries;
}

/**
 * Opens the device mail client pre-filled with the crash log.
 * Falls back to an alert if mailto: is not supported.
 */
export async function sendCrashReport(
  logs: CrashEntry[],
  appVersion: string,
): Promise<void> {
  if (logs.length === 0) return;

  const subject = encodeURIComponent(`[VitalSync ${appVersion}] Crash Report — ${safeFormatDate(new Date())}`);
  const body = encodeURIComponent(formatCrashLogsForEmail(logs, appVersion));
  const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      // Fallback: open without body (some mail clients reject very long mailto: URIs)
      const shortUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
      await Linking.openURL(shortUrl);
    }
  } catch (e) {
    console.warn('[VitalSync] sendCrashReport: could not open mail client', e);
  }
}

// ─── Clipboard Copy ──────────────────────────────────────────────────────────

/**
 * Copies the full formatted crash log to the system clipboard.
 * Uses expo-clipboard on native, navigator.clipboard on web.
 * Returns true if the copy succeeded, false otherwise.
 */
export async function copyCrashReport(
  logs: CrashEntry[],
  appVersion: string,
): Promise<boolean> {
  try {
    const text =
      logs.length > 0
        ? formatCrashLogsForEmail(logs, appVersion)
        : `=== VitalSync Crash Report ===\nNo errors recorded.\nApp Version : ${appVersion}\nPlatform    : ${Platform.OS} ${Platform.Version}`;
    if (Platform.OS === 'web') {
      // Web: use the browser Clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
    } else {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(text);
    }
    return true;
  } catch (e) {
    console.warn('[VitalSync] copyCrashReport: clipboard write failed', e);
    return false;
  }
}

// ─── Native Share Sheet ─────────────────────────────────────────────────────

/**
 * Opens the native OS share sheet with the full formatted crash log.
 * On web, falls back to navigator.share if available, otherwise copies to clipboard.
 * Returns true if the user completed a share action, false if they dismissed or it failed.
 */
export async function shareCrashReport(
  logs: CrashEntry[],
  appVersion: string,
): Promise<boolean> {
  if (logs.length === 0) return false;
  try {
    const text = formatCrashLogsForEmail(logs, appVersion);
    const title = `VitalSync ${appVersion} Crash Report — ${safeFormatDate(new Date())}`;
    if (Platform.OS === 'web') {
      // Web: use navigator.share if available (mobile browsers), else clipboard fallback
      if (typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
        await (navigator as any).share({ title, text });
        return true;
      }
      // No native share on desktop web — fall back to clipboard copy
      return copyCrashReport(logs, appVersion);
    }
    const result = await Share.share({ message: text, title });
    return result.action === Share.sharedAction;
  } catch (e) {
    console.warn('[VitalSync] shareCrashReport: share sheet failed', e);
    return false;
  }
}

// ─── Global unhandled promise rejection hook ──────────────────────────────────

/**
 * Call once at app startup (in _layout.tsx) to capture unhandled promise
 * rejections and write them to the local crash log.
 */
export function installGlobalErrorHandlers(): void {
  // React Native exposes a global error handler for unhandled JS errors
  const prevHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
  (global as any).ErrorUtils?.setGlobalHandler?.((error: Error, isFatal: boolean) => {
    logCrash({
      type: 'NativeError',
      message: `[${isFatal ? 'FATAL' : 'non-fatal'}] ${error?.message ?? String(error)}`,
      stack: error?.stack,
    });
    // Always call the previous handler so React Native's default behaviour is preserved
    prevHandler?.(error, isFatal);
  });

  // Unhandled promise rejections (React Native >= 0.67 surfaces these via
  // the global ErrorUtils handler above, but we add a belt-and-suspenders
  // listener for environments that support it)
  const anyGlobal = global as any;
  if (typeof anyGlobal.addEventListener === 'function') {
    anyGlobal.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      logCrash({
        type: 'UnhandledRejection',
        message: reason instanceof Error ? reason.message : String(reason ?? 'Unknown rejection'),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });
  }
}
