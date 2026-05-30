/**
 * VitalSync Configuration Audit Log
 *
 * Records configuration change events (e.g. report language changes) to
 * AsyncStorage for compliance-conscious clinical users who need to track
 * when and how the app was configured.
 *
 * Data stays on-device — never synced to any external server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfigAuditEventType =
  | 'report_language_changed'
  | 'report_fields_reset'
  | 'report_data_cleared'
  | 'app_lock_toggled'
  | 'data_retention_changed'
  | 'all_data_deleted'
  | 'report_prepared_by_changed'
  | 'app_theme_changed'
  | 'unit_preference_changed'
  | 'vital_signs_data_cleared';

export interface ConfigAuditEntry {
  id: string;
  timestamp: string;           // ISO 8601
  event: ConfigAuditEventType;
  from?: string;               // Previous value (if applicable)
  to?: string;                 // New value (if applicable)
  note?: string;               // Human-readable description
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@vsht:config_audit_log_v1';
const MAX_ENTRIES = 200;       // Cap to prevent unbounded growth

export async function loadConfigAuditLog(): Promise<ConfigAuditEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConfigAuditEntry[];
  } catch (_unused) {
    return [];
  }
}

export async function appendConfigAuditEntry(
  entry: Omit<ConfigAuditEntry, 'id' | 'timestamp'>,
): Promise<void> {
  try {
    const existing = await loadConfigAuditLog();
    const newEntry: ConfigAuditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    // Prepend newest first; trim to MAX_ENTRIES
    const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES);
    await safeSetItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (_unused) {
    // Silently ignore — audit log failure must never break the main flow
  }
}

export async function clearConfigAuditLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (_unused) {
    // ignore
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Human-readable label for a language code, e.g. "it" → "Italiano (IT)" */
const LANG_LABELS: Record<string, string> = {
  en: 'English (EN)', es: 'Español (ES)', fr: 'Français (FR)',
  'fr-ca': 'Français CA (FR-CA)', zh: '中文 (ZH)', 'zh-tw': '繁體中文 (ZH-TW)',
  ko: '한국어 (KO)', ja: '日本語 (JA)', ru: 'Русский (RU)',
  tr: 'Türkçe (TR)', it: 'Italiano (IT)', nl: 'Nederlands (NL)', pl: 'Polski (PL)', pt: 'Português (PT)',
  de: 'Deutsch (DE)', hi: 'हिन्दी (HI)', sw: 'Kiswahili (SW)', ar: 'العربية (AR)',
};

export function langLabel(code: string): string {
  return LANG_LABELS[code] ?? code.toUpperCase();
}
