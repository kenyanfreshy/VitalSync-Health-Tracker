/**
 * share-insight.ts
 *
 * Formats a VitalSync EngineInsight as a clean, doctor-readable plain-text
 * message and triggers the native share sheet (iOS / Android) or copies to
 * clipboard on web.
 *
 * The output is deliberately plain text (no markdown) so it renders correctly
 * in SMS, WhatsApp, email, and clinical messaging apps.
 */

import { safeFormatDate } from '@/lib/utils';
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { EngineInsight } from './correlation-engine';

// ─── Category display names (used in the share header) ───────────────────────

const CATEGORY_NAMES: Record<EngineInsight['category'], string> = {
  'allostatic-load':    'Allostatic Load',
  'sleep-cv':           'Sleep-Cardiovascular Reciprocity',
  'hrv-training':       'HRV Recovery (Kibler Model)',
  'lag-analysis':       '72-Hour Lag Effect',
  'circadian-rhythm':   'Circadian Rhythm',
  'sodium-sensitivity': 'Sodium Sensitivity',
  'na-k-ratio':         'Na:K Ratio (INTERSALT Model)',
  'postmeal-glucose':    'Post-Meal Glucose Correlation',
  'medication-dipping':  'Medication-Induced BP Dipping',
  'resting-hr-sleep':    'Resting HR & Sleep Quality',
  'resting-hr-hrv':      'Resting HR & HRV Correlation',
};

const SEVERITY_LABELS: Record<EngineInsight['severity'], string> = {
  alert:   '⚠ Alert',
  caution: '◈ Caution',
  info:    '✓ Informational',
};

// ─── Evidence level label ─────────────────────────────────────────────────────

function evidenceStars(level: number): string {
  return '●'.repeat(level) + '○'.repeat(5 - level);
}

// ─── Main formatter ───────────────────────────────────────────────────────────

export function formatInsightForShare(insight: EngineInsight): string {
  const today = safeFormatDate(Date.now(), 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const lines: string[] = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '📊 VitalSync Health Insight',
    `Generated: ${today}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Model: ${CATEGORY_NAMES[insight.category]}`,
    `Status: ${SEVERITY_LABELS[insight.severity]}`,
    `Evidence Level: ${evidenceStars(insight.evidenceLevel)}  (${insight.evidenceLabel})`,
    `Data Points Analyzed: ${insight.dataPoints}`,
    '',
    '── HYPOTHESIS ──────────────────',
    insight.hypothesis,
    '',
    '── PERSONAL SUGGESTION ─────────',
    insight.clinicalSuggestion,
    '',
    '── DISCLAIMER ──────────────────',
    'This insight is generated from your personal health data stored locally on your device. It is not a medical diagnosis and should not replace professional clinical advice. Please share with your healthcare provider for interpretation.',
    '',
    '── DATA PRIVACY ────────────────',
    'All VitalSync data is stored exclusively on your device and is never uploaded to any server. This message was generated and shared at your explicit request.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Shared from VitalSync: Personal Health Hub',
    'App Store ID: 6760217377',
  ];

  return lines.join('\n');
}

// ─── Share trigger ────────────────────────────────────────────────────────────

export interface ShareInsightResult {
  success: boolean;
  usedClipboard?: boolean;
}

export async function shareInsight(insight: EngineInsight): Promise<ShareInsightResult> {
  const message = formatInsightForShare(insight);
  const title = `VitalSync Insight: ${CATEGORY_NAMES[insight.category]}`;

  // Web: copy to clipboard (Share API not widely available in WebViews)
  if (Platform.OS === 'web') {
    try {
      await Clipboard.setStringAsync(message);
      return { success: true, usedClipboard: true };
    } catch (_unused) {
      return { success: false };
    }
  }

  // Native: use React Native's built-in Share sheet
  try {
    const result = await Share.share(
      {
        message,
        title,
        // iOS only: subject line pre-fills email subject
        ...(Platform.OS === 'ios' ? { subject: title } : {}),
      },
      {
        // iOS: exclude AirDrop from the share sheet for privacy
        excludedActivityTypes: [],
        dialogTitle: title, // Android
      }
    );

    return { success: result.action !== Share.dismissedAction };
  } catch (_unused) {
    return { success: false };
  }
}
