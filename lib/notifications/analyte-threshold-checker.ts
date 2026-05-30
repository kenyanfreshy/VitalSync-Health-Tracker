import { scheduleNotification } from '@/lib/notifications/schedule';
/**
 * Analyte Threshold Checker
 * Fires a local push notification when a newly saved lab value breaches
 * a user-configured custom analyte threshold.
 *
 * Called from labs/entry.tsx after a lab result is saved.
 * Runs entirely on-device — no network calls.
 */

import { Platform } from 'react-native';
import {
  loadAnalyteThresholds,
  checkAnalyteThreshold,
  isAnalyteSnoozed,
} from './threshold-config';
import { REFERENCE_RANGES, LabResult, LabAnalyteId } from '@/lib/health/lab-types';
import { appendAlertHistory, incrementUnreadAlertCount } from './alert-history';
import { incrementAnalyteAlertBadge } from './analyte-alert-badge';

export interface AnalyteViolation {
  analyteId: LabAnalyteId;
  value: number;
  direction: 'high' | 'low';
  customBound: number;
  unit: string;
  label: string;
}

/**
 * Check all analyte values in a newly saved LabResult against user-configured
 * custom thresholds. Fires a notification for each violation found.
 *
 * @param result  The LabResult that was just saved
 * @returns       Array of violations found (may be empty)
 */
export async function checkAnalyteThresholdsForResult(
  result: LabResult,
): Promise<AnalyteViolation[]> {
  if (Platform.OS === 'web') return [];

  const thresholdMap = await loadAnalyteThresholds();
  if (Object.keys(thresholdMap).length === 0) return [];

  const violations: AnalyteViolation[] = [];

  for (const [key, rawValue] of Object.entries(result.values)) {
    if (typeof rawValue !== 'number') continue;
    const analyteId = key as LabAnalyteId;
    const threshold = thresholdMap[analyteId];
    if (!threshold) continue;

    const breach = checkAnalyteThreshold(analyteId, rawValue, threshold);
    if (!breach) continue;

    const ref = REFERENCE_RANGES[analyteId];
    if (!ref) continue;

    violations.push({
      analyteId,
      value: rawValue,
      direction: breach.direction,
      customBound: breach.customValue,
      unit: ref.unit,
      label: ref.label,
    });
  }

  // Fire one notification per violation (skip snoozed analytes)
  for (const v of violations) {
    const snoozed = await isAnalyteSnoozed(v.analyteId);
    if (snoozed) continue;
    const directionLabel = v.direction === 'high' ? 'above' : 'below';
    const directionIcon = v.direction === 'high' ? '↑' : '↓';
    const title = `🧪 ${v.label} Alert ${directionIcon}`;
    const body = `${v.label} is ${v.value.toFixed(1)} ${v.unit} — ${directionLabel} your ${v.customBound} ${v.unit} threshold.`;

    try {
      await scheduleNotification({
        content: {
          title,
          body,
          data: {
            analyteId: v.analyteId,
            value: v.value,
            direction: v.direction,
            type: 'analyte-threshold',
            source: 'threshold-violation',
          },
          sound: true,
        },
        trigger: null, // Deliver immediately
      });

      // Persist to alert history
      await appendAlertHistory([{
        id: `analyte-${v.analyteId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        title,
        body,
        category: 'analyte',
        direction: v.direction,
        value: v.value,
        threshold: v.customBound,
        unit: v.unit,
      }]);
      await incrementUnreadAlertCount();
      await incrementAnalyteAlertBadge();
    } catch (_unused) {
      // Notification permission may not be granted — fail silently
    }
  }

  return violations;
}
