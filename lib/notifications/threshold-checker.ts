import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * Threshold Checker
 * Evaluates the latest health data against user-configured thresholds
 * and fires local push notifications for any violations.
 * Runs inside the background task — no network calls, fully on-device.
 */

import { getNotificationsAsync } from './safe-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadHealthData } from '@/lib/health/storage';
import { loadThresholds } from './threshold-config';
import { loadGlucoseThresholds } from '@/lib/health/glucose-thresholds';
import { appendAlertHistory, incrementUnreadAlertCount, type AlertHistoryEntry, type AlertCategory } from './alert-history';
import { safeSetItem } from '@/lib/safe-async-storage';
import { fetchEKGFirstPage } from '@/lib/health/ekg-store';

// ── EKG / AFib alert cooldown (once per 4 h to avoid repeated alerts) ─────────
const EKG_AFIB_COOLDOWN_KEY = '@vsht:ekg_afib_notif_last';
const EKG_AFIB_COOLDOWN_HOURS = 4;
// Key to track the last-seen AFib record startDate so we only alert on NEW ones
const EKG_AFIB_LAST_SEEN_KEY = '@vsht:ekg_afib_last_seen';

async function isEKGAfibCooldown(cooldownHours = EKG_AFIB_COOLDOWN_HOURS): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(EKG_AFIB_COOLDOWN_KEY);
    if (!v) return false;
    const lastMs = parseInt(v, 10);
    if (isNaN(lastMs)) return false;
    return Date.now() - lastMs < cooldownHours * 60 * 60 * 1000;
  } catch (_unused) { return false; }
}

async function markEKGAfibCooldown(): Promise<void> {
  await safeSetItem(EKG_AFIB_COOLDOWN_KEY, String(Date.now())).catch(() => {});
}

async function getLastSeenAfibDate(): Promise<string | null> {
  try { return await AsyncStorage.getItem(EKG_AFIB_LAST_SEEN_KEY); }
  catch (_unused) { return null; }
}

async function markLastSeenAfibDate(date: string): Promise<void> {
  await safeSetItem(EKG_AFIB_LAST_SEEN_KEY, date).catch(() => {});
}

const HRV_TARGET_KEY = '@vsht:hrv_target_ms';
const HRV_TARGET_DEFAULT = 45;
const HRV_TARGET_NOTIF_COOLDOWN_KEY = '@vsht:hrv_target_notif_last';
/** Minimum hours between HRV target notifications to avoid spamming */
const HRV_TARGET_COOLDOWN_HOURS = 24;
export const HRV_TARGET_ALERT_ENABLED_KEY = '@vsht:hrv_target_alert_enabled';

// ── Glucose cooldown keys (1 h per direction to avoid notification spam) ─────
const GLUCOSE_HIGH_COOLDOWN_KEY = '@vsht:glucose_high_notif_last';
const GLUCOSE_LOW_COOLDOWN_KEY  = '@vsht:glucose_low_notif_last';
const GLUCOSE_COOLDOWN_HOURS = 1;

async function isGlucoseCooldown(key: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(key);
    if (!v) return false;
    const lastMs = parseInt(v, 10);
    if (isNaN(lastMs)) return false;
    return Date.now() - lastMs < GLUCOSE_COOLDOWN_HOURS * 60 * 60 * 1000;
  } catch (_unused) { return false; }
}

async function markGlucoseCooldown(key: string): Promise<void> {
  await safeSetItem(key, String(Date.now())).catch(() => {});
}

async function loadHrvTarget(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(HRV_TARGET_KEY);
    if (v !== null) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch (_unused) {}
  return HRV_TARGET_DEFAULT;
}

async function isHrvTargetNotifOnCooldown(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(HRV_TARGET_NOTIF_COOLDOWN_KEY);
    if (!v) return false;
    const lastMs = parseInt(v, 10);
    if (isNaN(lastMs)) return false;
    return Date.now() - lastMs < HRV_TARGET_COOLDOWN_HOURS * 60 * 60 * 1000;
  } catch (_unused) {
    return false;
  }
}

async function markHrvTargetNotifSent(): Promise<void> {
  await safeSetItem(HRV_TARGET_NOTIF_COOLDOWN_KEY, String(Date.now())).catch(() => {});
}

export interface ThresholdViolation {
  id: string;
  title: string;
  body: string;
  category: 'bp' | 'hrv' | 'heartRate' | 'spo2' | 'glucose' | 'restingHR' | 'ekg';
}

// Cooldown key for resting HR consecutive-day alert (once per 24 h max)
const RESTING_HR_HIGH_COOLDOWN_KEY = '@vsht:resting_hr_high_notif_last';
const RESTING_HR_COOLDOWN_HOURS = 24;

async function isRestingHRCooldown(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(RESTING_HR_HIGH_COOLDOWN_KEY);
    if (!v) return false;
    const lastMs = parseInt(v, 10);
    if (isNaN(lastMs)) return false;
    return Date.now() - lastMs < RESTING_HR_COOLDOWN_HOURS * 60 * 60 * 1000;
  } catch (_unused) { return false; }
}

async function markRestingHRCooldown(): Promise<void> {
  await safeSetItem(RESTING_HR_HIGH_COOLDOWN_KEY, String(Date.now())).catch(() => {});
}

/**
 * Check the latest health readings against all enabled thresholds.
 * Returns an array of violations found.
 */
export async function checkThresholds(): Promise<ThresholdViolation[]> {
  // Check if HRV target alert is enabled (default true)
  const hrvTargetAlertRaw = await AsyncStorage.getItem(HRV_TARGET_ALERT_ENABLED_KEY).catch(() => null);
  const hrvTargetAlertEnabled = hrvTargetAlertRaw === null ? true : hrvTargetAlertRaw === 'true';

  const [data, thresholds, glucoseThresholds, hrvTarget, onCooldown, glucoseHighCooldown, glucoseLowCooldown, restingHRCooldown] = await Promise.all([
    loadHealthData(),
    loadThresholds(),
    loadGlucoseThresholds(),
    loadHrvTarget(),
    isHrvTargetNotifOnCooldown(),
    isGlucoseCooldown(GLUCOSE_HIGH_COOLDOWN_KEY),
    isGlucoseCooldown(GLUCOSE_LOW_COOLDOWN_KEY),
    isRestingHRCooldown(),
  ]);

  if (!thresholds.enabled || !data) return [];

  const violations: ThresholdViolation[] = [];

  // ── Blood Pressure ─────────────────────────────────────────────────────────
  if (thresholds.bp.enabled && (data.bloodPressure ?? []).length > 0) {
    const latest = (data.bloodPressure ?? [])[(data.bloodPressure ?? []).length - 1];
    // Extract narrowed locals so TypeScript can track non-null through template literals
    const sys = latest.systolic;
    const dia = latest.diastolic;

    if (sys != null) {
      if (sys > thresholds.bp.systolicHigh) {
        violations.push({
          id: 'bp-systolic-high',
          title: '⚠️ High Blood Pressure',
          body: `Your systolic BP is ${sys} mmHg, above your ${thresholds.bp.systolicHigh} mmHg threshold.`,
          category: 'bp',
        });
      } else if (sys < thresholds.bp.systolicLow) {
        violations.push({
          id: 'bp-systolic-low',
          title: '⚠️ Low Blood Pressure',
          body: `Your systolic BP is ${sys} mmHg, below your ${thresholds.bp.systolicLow} mmHg threshold.`,
          category: 'bp',
        });
      }
    }

    if (dia != null) {
      if (dia > thresholds.bp.diastolicHigh) {
        violations.push({
          id: 'bp-diastolic-high',
          title: '⚠️ High Diastolic BP',
          body: `Your diastolic BP is ${dia} mmHg, above your ${thresholds.bp.diastolicHigh} mmHg threshold.`,
          category: 'bp',
        });
      } else if (dia < thresholds.bp.diastolicLow) {
        violations.push({
          id: 'bp-diastolic-low',
          title: '⚠️ Low Diastolic BP',
          body: `Your diastolic BP is ${dia} mmHg, below your ${thresholds.bp.diastolicLow} mmHg threshold.`,
          category: 'bp',
        });
      }
    }
  }

  // ── HRV ────────────────────────────────────────────────────────────────────
  if (thresholds.hrv.enabled && (data.pulse ?? []).length > 0) {
    const latest = (data.pulse ?? [])[(data.pulse ?? []).length - 1];
    if (latest.hrv !== undefined && latest.hrv < thresholds.hrv.low) {
      violations.push({
        id: 'hrv-low',
        title: '💛 Low HRV Detected',
        body: `Your HRV is ${latest.hrv} ms, below your ${thresholds.hrv.low} ms threshold. Consider rest or recovery.`,
        category: 'hrv',
      });
    }
  }

  // ── HRV Personal Target (7-day average) ──────────────────────────────────────────
  // Fires at most once per 24 hours to avoid notification fatigue
  if (hrvTargetAlertEnabled && !onCooldown) {
    const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pulseRecs = data.pulse ?? [];
    const vitalRecs = (data.vitalSigns ?? []).map((r) => ({ hrv: r.hrv ?? null, timestamp: r.timestamp }));
    const allHrv = [...pulseRecs, ...vitalRecs]
      .filter((r) => (r.hrv ?? 0) > 0 && new Date(r.timestamp).getTime() >= cutoff7d)
      .map((r) => r.hrv as number);
    if (allHrv.length >= 3) {
      const avg7d = Math.round(allHrv.reduce((s, v) => s + v, 0) / allHrv.length);
      if (avg7d < hrvTarget) {
        violations.push({
          id: 'hrv-target-below',
          title: '💙 HRV Below Your Target',
          body: `Your 7-day avg HRV is ${avg7d} ms — below your ${hrvTarget} ms target. Consider rest or stress management.`,
          category: 'hrv',
        });
        // Mark cooldown so we don’t fire again for 24 h
        markHrvTargetNotifSent().catch(() => {});
      }
    }
  }

  // ── Heart Rate ──────────────────────────────────────────────────────────────────
  if (thresholds.heartRate.enabled && (data.pulse ?? []).length > 0) {
    const latest = (data.pulse ?? [])[(data.pulse ?? []).length - 1];
    if (latest.bpm > thresholds.heartRate.high) {
      violations.push({
        id: 'hr-high',
        title: '❤️ Elevated Resting Heart Rate',
        body: `Your heart rate is ${latest.bpm} bpm, above your ${thresholds.heartRate.high} bpm threshold.`,
        category: 'heartRate',
      });
    } else if (latest.bpm < thresholds.heartRate.low) {
      violations.push({
        id: 'hr-low',
        title: '❤️ Low Resting Heart Rate',
        body: `Your heart rate is ${latest.bpm} bpm, below your ${thresholds.heartRate.low} bpm threshold.`,
        category: 'heartRate',
      });
    }
  }

  // ── SpO₂ ──────────────────────────────────────────────────────────────────
  if (thresholds.spo2?.enabled && (data.vitalSigns ?? []).length > 0) {
    // Find the most recent vitalSigns entry with a valid SpO2 reading
    const spo2Records = (data.vitalSigns ?? [])
      .filter((r) => (r.spo2 !== undefined && r.spo2 > 0) || (r.oxygenSaturation !== undefined && r.oxygenSaturation > 0))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (spo2Records.length > 0) {
      const latest = spo2Records[0];
      const spo2Value = latest.spo2 ?? latest.oxygenSaturation ?? 0;
      if (spo2Value < thresholds.spo2.low) {
        violations.push({
          id: 'spo2-low',
          title: '🟡 Low Blood Oxygen (SpO₂)',
          body: `Your SpO₂ is ${spo2Value}%, below your ${thresholds.spo2.low}% threshold. Consider consulting a healthcare provider.`,
          category: 'spo2',
        });
      } else if (thresholds.spo2.high < 100 && spo2Value > thresholds.spo2.high) {
        // Only fire if user has explicitly lowered the high threshold below 100%
        violations.push({
          id: 'spo2-high',
          title: '🟡 Elevated Blood Oxygen (SpO₂)',
          body: `Your SpO₂ is ${spo2Value}%, above your ${thresholds.spo2.high}% threshold.`,
          category: 'spo2',
        });
      }
    }
  }

  // ── Blood Glucose ───────────────────────────────────────────────────────────────────────
  const bloodSugar = data.bloodSugar ?? [];
  if ((glucoseThresholds.alertHigh || glucoseThresholds.alertLow) && bloodSugar.length > 0) {
    // Use the most recent reading
    const latest = bloodSugar[bloodSugar.length - 1];
    const mgDl = latest.glucoseMgDl;

    if (glucoseThresholds.alertHigh && !glucoseHighCooldown && mgDl > glucoseThresholds.highMgDl) {
      violations.push({
        id: 'glucose-high',
        title: '🩸 High Blood Glucose',
        body: `Your blood glucose is ${mgDl} mg/dL, above your ${glucoseThresholds.highMgDl} mg/dL threshold. Consider checking with your care team.`,
        category: 'glucose',
      });
      markGlucoseCooldown(GLUCOSE_HIGH_COOLDOWN_KEY).catch(() => {});
    } else if (glucoseThresholds.alertLow && !glucoseLowCooldown && mgDl < glucoseThresholds.lowMgDl) {
      violations.push({
        id: 'glucose-low',
        title: '🩸 Low Blood Glucose',
        body: `Your blood glucose is ${mgDl} mg/dL, below your ${glucoseThresholds.lowMgDl} mg/dL threshold. Consider consuming fast-acting carbohydrates.`,
        category: 'glucose',
      });
      markGlucoseCooldown(GLUCOSE_LOW_COOLDOWN_KEY).catch(() => {});
    }
  }


  // ── Resting HR Consecutive-Day Check ────────────────────────────────────────────
  // Fires at most once per 24 h; requires N consecutive days above threshold.
  const rhrConfig = thresholds.restingHeartRate;
  if (rhrConfig?.enabled && !restingHRCooldown) {
    const samples = (data.restingHRSamples ?? []).slice().sort(
      (a, b) => a.timestamp.localeCompare(b.timestamp)
    );
    if (samples.length >= rhrConfig.consecutiveDays) {
      // Check the last N days
      const recent = samples.slice(-rhrConfig.consecutiveDays);
      const allAbove = recent.every((r) => r.bpm > rhrConfig.high);
      if (allAbove) {
        const latestBpm = recent[recent.length - 1].bpm;
        violations.push({
          id: 'resting-hr-high-consecutive',
          title: '❤️ Elevated Resting Heart Rate',
          body: `Your resting HR has been above ${rhrConfig.high} bpm for ${rhrConfig.consecutiveDays} consecutive days (latest: ${latestBpm} bpm). This is an independent cardiovascular risk factor — consider discussing with your physician (Palatini et al., 2006).`,
          category: 'restingHR',
        });
        markRestingHRCooldown().catch(() => {});
      }
    }
  }

  // ── EKG / AFib New-Episode Check ──────────────────────────────────────────────────────────────────────
  // Fires only when ekg.enabled is true; cooldown is user-configurable (default 4 h).
  const ekgConfig = thresholds.ekg ?? { enabled: true, cooldownHours: 4 };
  const ekgCooldown = ekgConfig.enabled ? await isEKGAfibCooldown(ekgConfig.cooldownHours) : true;
  if (!ekgCooldown) {
    try {
      const ekgResult = await fetchEKGFirstPage();
      const afibRecords = ekgResult.records.filter(
        (r) => r.classification === 'AtrialFibrillation',
      );
      if (afibRecords.length > 0) {
        // Most recent AFib record (records are sorted newest-first)
        const latestAfib = afibRecords[0];
        const lastSeen = await getLastSeenAfibDate();
        const isNew = !lastSeen || latestAfib.startDate > lastSeen;
        if (isNew) {
          const hrText = latestAfib.averageHeartRate
            ? ` (avg ${Math.round(latestAfib.averageHeartRate)} bpm)`
            : '';
          const dateText = new Date(latestAfib.startDate).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          });
          violations.push({
            id: 'ekg-afib-new',
            title: '⚠️ Atrial Fibrillation Detected',
            body: `A new AFib episode was recorded on ${dateText}${hrText}. Review with your care team if this is unexpected.`,
            category: 'ekg',
          });
          markLastSeenAfibDate(latestAfib.startDate).catch(() => {});
          markEKGAfibCooldown().catch(() => {});
        }
      }
    } catch (_unused) {
      // EKG store unavailable — skip silently
    }
  }

  return violations;
}

/**
 * Fire local push notifications for each threshold violation
 * and persist them to the alert history log.
 * Deduplicates by cancelling any existing notification with the same identifier
 * before scheduling a new one.
 */
export async function dispatchViolationNotifications(
  violations: ThresholdViolation[]
): Promise<void> {
  if (violations.length === 0) return;

  const historyEntries: AlertHistoryEntry[] = [];
  const now = new Date().toISOString();

  const N = await getNotificationsAsync();
  for (const v of violations) {
    // Cancel any existing notification with this id to avoid stacking
    if (N) await N.cancelScheduledNotificationAsync(v.id).catch(() => {});

    await scheduleNotification({
      content: {
        title: v.title,
        body: v.body,
        sound: true,
        data: { source: 'threshold-violation', category: v.category },
      },
      trigger: null, // Fire immediately
    });

    // Build history entry from violation metadata
    const valueMatch = v.body.match(/is ([\d.]+)/);
    const thresholdMatch = v.body.match(/your ([\d.]+)/);
    const value = valueMatch ? parseFloat(valueMatch[1]) : 0;
    const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0;
    const unit =
      v.category === 'bp' ? 'mmHg' :
      v.category === 'hrv' ? 'ms' :
      v.category === 'spo2' ? '%' :
      v.category === 'glucose' ? 'mg/dL' :
      v.category === 'ekg' ? 'bpm' : 'bpm';
    const direction: 'high' | 'low' =
      v.id.endsWith('-high') || v.id.includes('-systolic-high') || v.id.includes('-diastolic-high')
        ? 'high' : 'low';

    historyEntries.push({
      id: `${v.id}-${Date.now()}`,
      timestamp: now,
      category: v.category as AlertCategory,
      title: v.title,
      body: v.body,
      value,
      unit,
      threshold,
      direction,
    });
  }

  // Persist to history and increment unread badge count (non-blocking)
  appendAlertHistory(historyEntries).catch(() => {});
  incrementUnreadAlertCount(historyEntries.length).catch(() => {});
}

/**
 * Request notification permissions. Must be called from UI context (not background task).
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const N = await getNotificationsAsync();
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch (_unused) {
    return false;
  }
}
