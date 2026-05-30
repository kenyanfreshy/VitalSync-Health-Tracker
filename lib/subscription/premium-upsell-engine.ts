/**
 * PremiumUpsellEngine — VitalSync v2.9.63
 *
 * Centralized engine for contextual premium upsell reminders.
 * Follows Apple HIG: elegant, subtle, never spammy.
 *
 * Rules:
 * - Max 1 upsell per 24 hours (global cooldown)
 * - Same upsell: 7-day cooldown per trigger type
 * - Trial/premium users: all upsells disabled immediately
 * - Never interrupt: onboarding, HealthKit flow, syncing, active logging, navigation
 * - Analytics: shown / dismissed / clicked / converted
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from "@/lib/safe-async-storage";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UpsellTrigger =
  | "medication_first_add"
  | "appointment_first_create"
  | "bp_third_log"
  | "glucose_third_log"
  | "ekg_tap"
  | "pdf_export_tap"
  | "ble_device_tap"
  | "insights_tap";

export type UpsellAnalyticsEvent =
  | "upsell_shown"
  | "upsell_dismissed"
  | "upsell_clicked"
  | "upsell_converted_trial"
  | "upsell_converted_paid";

export interface UpsellState {
  /** ISO timestamp of last global upsell shown */
  lastGlobalShownAt: string | null;
  /** Per-trigger last shown timestamps */
  triggerLastShownAt: Partial<Record<UpsellTrigger, string>>;
  /** Triggers that have been permanently dismissed (won't show again this session) */
  sessionDismissed: UpsellTrigger[];
  /** Whether upsells are globally disabled (trial/premium active) */
  disabled: boolean;
}

export interface UpsellCheckResult {
  /** Whether this upsell should be shown */
  shouldShow: boolean;
  /** Reason it was suppressed (for debugging) */
  suppressReason?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "@vsht:upsell_engine_v1";
const ANALYTICS_KEY = "@vsht:upsell_analytics_v1";

/** Global cooldown: max 1 upsell per 24 hours */
const GLOBAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Per-trigger cooldown: same upsell not shown again for 7 days */
const TRIGGER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface UpsellAnalyticsEntry {
  event: UpsellAnalyticsEvent;
  trigger: UpsellTrigger;
  timestamp: string;
}

async function trackAnalytics(event: UpsellAnalyticsEvent, trigger: UpsellTrigger): Promise<void> {
  try {
    const raw = await safeGetItem(ANALYTICS_KEY);
    const entries: UpsellAnalyticsEntry[] = raw ? JSON.parse(raw) : [];
    entries.push({ event, trigger, timestamp: new Date().toISOString() });
    // Keep last 200 entries to prevent unbounded growth
    const trimmed = entries.slice(-200);
    await safeSetItem(ANALYTICS_KEY, JSON.stringify(trimmed));
  } catch {
    // Analytics failure is non-fatal
  }
}

// ─── State Management ─────────────────────────────────────────────────────────

async function loadState(): Promise<UpsellState> {
  try {
    const raw = await safeGetItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UpsellState;
  } catch {
    // Fall through to default
  }
  return {
    lastGlobalShownAt: null,
    triggerLastShownAt: {},
    sessionDismissed: [],
    disabled: false,
  };
}

async function saveState(state: UpsellState): Promise<void> {
  await safeSetItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Core Engine API ─────────────────────────────────────────────────────────

/**
 * Check whether a given upsell trigger should be shown.
 * Does NOT mark it as shown — call `markShown()` after displaying.
 */
export async function checkUpsell(
  trigger: UpsellTrigger,
  accessState: "free" | "trial" | "premium" | "expired"
): Promise<UpsellCheckResult> {
  // Premium/trial users never see upsells
  if (accessState === "premium" || accessState === "trial") {
    return { shouldShow: false, suppressReason: "user_is_premium_or_trial" };
  }

  const state = await loadState();

  // Globally disabled
  if (state.disabled) {
    return { shouldShow: false, suppressReason: "globally_disabled" };
  }

  // Session dismissed
  if (state.sessionDismissed.includes(trigger)) {
    return { shouldShow: false, suppressReason: "session_dismissed" };
  }

  const now = Date.now();

  // Global 24h cooldown
  if (state.lastGlobalShownAt) {
    const elapsed = now - new Date(state.lastGlobalShownAt).getTime();
    if (elapsed < GLOBAL_COOLDOWN_MS) {
      return {
        shouldShow: false,
        suppressReason: `global_cooldown_${Math.round((GLOBAL_COOLDOWN_MS - elapsed) / 3600000)}h_remaining`,
      };
    }
  }

  // Per-trigger 7-day cooldown
  const triggerLastShown = state.triggerLastShownAt[trigger];
  if (triggerLastShown) {
    const elapsed = now - new Date(triggerLastShown).getTime();
    if (elapsed < TRIGGER_COOLDOWN_MS) {
      return {
        shouldShow: false,
        suppressReason: `trigger_cooldown_${Math.round((TRIGGER_COOLDOWN_MS - elapsed) / 86400000)}d_remaining`,
      };
    }
  }

  return { shouldShow: true };
}

/**
 * Mark an upsell as shown. Updates both global and per-trigger timestamps.
 * Call this immediately after displaying the upsell UI.
 */
export async function markShown(trigger: UpsellTrigger): Promise<void> {
  const state = await loadState();
  const now = new Date().toISOString();
  state.lastGlobalShownAt = now;
  state.triggerLastShownAt[trigger] = now;
  await saveState(state);
  await trackAnalytics("upsell_shown", trigger);
}

/**
 * Mark an upsell as dismissed. Adds to session-dismissed list.
 * The per-trigger cooldown from `markShown` still applies for future sessions.
 */
export async function markDismissed(trigger: UpsellTrigger): Promise<void> {
  const state = await loadState();
  if (!state.sessionDismissed.includes(trigger)) {
    state.sessionDismissed.push(trigger);
  }
  await saveState(state);
  await trackAnalytics("upsell_dismissed", trigger);
}

/**
 * Mark an upsell CTA as clicked (user tapped "Start Free Trial").
 */
export async function markClicked(trigger: UpsellTrigger): Promise<void> {
  await trackAnalytics("upsell_clicked", trigger);
}

/**
 * Mark a trial conversion. Disables all future upsells.
 */
export async function markConvertedTrial(trigger: UpsellTrigger): Promise<void> {
  const state = await loadState();
  state.disabled = true;
  await saveState(state);
  await trackAnalytics("upsell_converted_trial", trigger);
}

/**
 * Mark a paid subscription conversion. Disables all future upsells.
 */
export async function markConvertedPaid(trigger: UpsellTrigger): Promise<void> {
  const state = await loadState();
  state.disabled = true;
  await saveState(state);
  await trackAnalytics("upsell_converted_paid", trigger);
}

/**
 * Disable all upsells immediately (call when user starts trial or subscribes).
 */
export async function disableAllUpsells(): Promise<void> {
  const state = await loadState();
  state.disabled = true;
  await saveState(state);
}

/**
 * Re-enable upsells (call if user cancels trial and returns to free tier).
 */
export async function enableUpsells(): Promise<void> {
  const state = await loadState();
  state.disabled = false;
  state.sessionDismissed = [];
  await saveState(state);
}

/**
 * Get the full analytics log (for debugging or admin screens).
 */
export async function getAnalyticsLog(): Promise<UpsellAnalyticsEntry[]> {
  try {
    const raw = await safeGetItem(ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear all upsell state and analytics (for testing / account reset).
 */
export async function clearUpsellData(): Promise<void> {
  await safeRemoveItem(STORAGE_KEY);
  await safeRemoveItem(ANALYTICS_KEY);
}
