/**
 * CSV Export Engine
 * Converts all stored health data into a portable CSV file and shares it
 * via the OS share sheet. No data leaves the device unless the user
 * explicitly chooses a share destination.
 *
 * Output: one CSV file per vital category, concatenated with section headers.
 * Format: ISO 8601 timestamps, metric units, UTF-8 encoding.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { HealthData } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cells: (string | number | undefined | null)[]): string {
  return cells.map(escapeCSV).join(',');
}

function formatDate(ts: string | number | Date): string {
  return new Date(ts).toISOString();
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildBloodPressureCSV(data: HealthData['bloodPressure']): string {
  if (!data?.length) return '';
  const lines: string[] = [
    '# BLOOD PRESSURE',
    row('Timestamp', 'Systolic (mmHg)', 'Diastolic (mmHg)', 'Source'),
  ];
  for (const r of data) {
    lines.push(row(formatDate(r.timestamp), r.systolic, r.diastolic, r.source ?? ''));
  }
  return lines.join('\n');
}

function buildPulseCSV(data: HealthData['pulse']): string {
  if (!data?.length) return '';
  const lines: string[] = [
    '# PULSE & HRV',
    row('Timestamp', 'BPM', 'HRV (ms)', 'Source'),
  ];
  for (const r of data) {
    lines.push(row(formatDate(r.timestamp), r.bpm, r.hrv ?? '', r.source ?? ''));
  }
  return lines.join('\n');
}

function buildBodyCompositionCSV(data: HealthData['bodyComposition']): string {
  if (!data?.length) return '';
  const lines: string[] = [
    '# BODY COMPOSITION',
    row('Timestamp', 'Weight (kg)', 'Muscle Mass (kg)', 'Body Fat (%)', 'BMI', 'Source'),
  ];
  for (const r of data) {
    lines.push(row(
      formatDate(r.timestamp),
      r.weightKg,
      r.muscleMassKg ?? '',
      r.fatMassKg ?? '',
      r.bmi ?? '',
      r.source ?? ''
    ));
  }
  return lines.join('\n');
}

function buildSleepCSV(data: HealthData['sleep']): string {
  if (!data?.length) return '';
  const lines: string[] = [
    '# SLEEP',
    row('Timestamp', 'Total Minutes', 'Efficiency (%)', 'Deep (min)', 'REM (min)', 'Light (min)', 'Awake (min)', 'Source'),
  ];
  for (const r of data) {
    lines.push(row(
      formatDate(r.bedtime),
      r.totalMinutes,
      r.efficiency,
      r.deepMinutes ?? '',
      r.remMinutes ?? '',
      r.lightMinutes ?? '',
      r.awakeMinutes ?? '',
      r.source ?? ''
    ));
  }
  return lines.join('\n');
}


// ─── Main export function ─────────────────────────────────────────────────────

export interface CSVExportResult {
  success: boolean;
  filePath?: string;
  rowCount: number;
  error?: string;
}

export async function exportHealthDataAsCSV(data: HealthData | null): Promise<CSVExportResult> {
  if (!data) {
    return { success: false, rowCount: 0, error: 'No health data available to export.' };
  }

  // Build sections
  const sections: string[] = [];
  let rowCount = 0;

  const bpSection = buildBloodPressureCSV(data.bloodPressure);
  if (bpSection) { sections.push(bpSection); rowCount += data.bloodPressure?.length ?? 0; }

  const pulseSection = buildPulseCSV(data.pulse);
  if (pulseSection) { sections.push(pulseSection); rowCount += data.pulse?.length ?? 0; }

  const bodySection = buildBodyCompositionCSV(data.bodyComposition);
  if (bodySection) { sections.push(bodySection); rowCount += data.bodyComposition?.length ?? 0; }

  const sleepSection = buildSleepCSV(data.sleep);
  if (sleepSection) { sections.push(sleepSection); rowCount += data.sleep?.length ?? 0; }


  if (sections.length === 0) {
    return { success: false, rowCount: 0, error: 'No data records found to export.' };
  }

  // Build full CSV content with metadata header
  const exportDate = new Date().toISOString();
  const header = [
    '# VitalSync Health Data Export',
    `# Exported: ${exportDate}`,
    `# Total Records: ${rowCount}`,
    `# Privacy: This file was generated locally. No data was transmitted to any server.`,
    '',
  ].join('\n');

  const csvContent = header + sections.join('\n\n') + '\n';

  // Write to a temp file
  const fileName = `VitalSync_Export_${exportDate.slice(0, 10)}.csv`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  try {
    await FileSystem.writeAsStringAsync(filePath, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Share the file
    if (Platform.OS === 'web') {
      // Web: trigger download via data URL
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export VitalSync Health Data',
          UTI: 'public.comma-separated-values-text',
        });
        // Delete temp file after sharing to prevent plaintext health data lingering in cache
        FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
      }
    }

    return { success: true, filePath, rowCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during CSV export.';
    return { success: false, rowCount: 0, error: message };
  }
}

// ─── Summary stats for the export preview UI ─────────────────────────────────

export interface ExportSummary {
  totalRecords: number;
  categories: { label: string; count: number; icon: string }[];
}

export function getExportSummary(data: HealthData | null): ExportSummary {
  if (!data) return { totalRecords: 0, categories: [] };

  const categories = [
    { label: 'Blood Pressure', count: data.bloodPressure?.length ?? 0, icon: 'drop.fill' },
    { label: 'Pulse & HRV', count: data.pulse?.length ?? 0, icon: 'heart.fill' },
    { label: 'Body Composition', count: data.bodyComposition?.length ?? 0, icon: 'figure.stand' },
    { label: 'Sleep', count: data.sleep?.length ?? 0, icon: 'moon.fill' },
  ].filter((c) => c.count > 0);

  const totalRecords = categories.reduce((sum, c) => sum + c.count, 0);
  return { totalRecords, categories };
}
