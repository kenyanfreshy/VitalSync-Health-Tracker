/**
 * Lab History CSV Export
 *
 * Converts all stored LabResult records into a flat CSV string.
 * Each row represents one analyte reading from one lab result.
 * Columns: Date, Panel, Lab Name, Analyte, Abbreviation, Value, Unit, Status, Reference Low, Reference High
 *
 * The CSV is written to a temporary file via expo-file-system and shared
 * via expo-sharing so the user can send it to their physician or import it
 * into another health platform.
 */

import { safeFormatDate } from '@/lib/utils';
import { LabResult, LabAnalyteId, REFERENCE_RANGES, getAnalyteStatus, LAB_PANEL_LABELS } from './lab-types';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { writeAsStringAsync, documentDirectory, EncodingType } from 'expo-file-system/legacy';
import { setStringAsync } from 'expo-clipboard';
// ─── CSV Builder ──────────────────────────────────────────────────────────────

function escapeCsv(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = [
  'Date',
  'Panel',
  'Panel Label',
  'Lab Name',
  'Analyte',
  'Abbreviation',
  'Value',
  'Unit',
  'Status',
  'Reference Low',
  'Reference High',
  'Source',
  'Note',
];

/**
 * Convert an array of LabResult records to a CSV string.
 * Results are sorted by date descending (newest first).
 */
export function buildLabsCsv(results: LabResult[]): string {
  const sorted = [...results].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const rows: string[] = [CSV_HEADERS.join(',')];

  for (const result of sorted) {
    const dateStr = safeFormatDate(result.timestamp, 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const panelLabel = LAB_PANEL_LABELS[result.panel] ?? result.panel;

    for (const [key, rawValue] of Object.entries(result.values)) {
      if (typeof rawValue !== 'number') continue;
      const analyteId = key as LabAnalyteId;
      const ref = REFERENCE_RANGES[analyteId];
      if (!ref) continue;

      const status = getAnalyteStatus(analyteId, rawValue);
      const statusLabel = status === 'high' ? 'High' : status === 'low' ? 'Low' : 'Normal';

      const row = [
        escapeCsv(dateStr),
        escapeCsv(result.panel),
        escapeCsv(panelLabel),
        escapeCsv(result.labName ?? ''),
        escapeCsv(ref.label),
        escapeCsv(ref.abbr),
        escapeCsv(rawValue),
        escapeCsv(ref.unit),
        escapeCsv(statusLabel),
        escapeCsv(ref.low),
        escapeCsv(ref.high),
        escapeCsv(result.source),
        escapeCsv(result.note ?? ''),
      ];

      rows.push(row.join(','));
    }
  }

  return rows.join('\n');
}

// ─── File write + share ───────────────────────────────────────────────────────

/**
 * Export lab results as a CSV file and open the system share sheet.
 * Falls back to copying the CSV to the clipboard if sharing is unavailable (e.g. web).
 *
 * Returns:
 *  'shared'    — share sheet opened successfully
 *  'clipboard' — copied to clipboard as fallback
 *  'failed'    — export failed entirely
 */
export type ExportResult = 'shared' | 'clipboard' | 'failed';

export async function exportLabsAsCsv(results: LabResult[]): Promise<ExportResult> {
  if (results.length === 0) return 'failed';

  const csv = buildLabsCsv(results);

  try {
    const isShareable = await isAvailableAsync();

    if (isShareable) {
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const fileName = `VitalSync_Labs_${timestamp}.csv`;
      const fileUri = `${documentDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csv, { encoding: EncodingType.UTF8 });
      await shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Lab Results',
        UTI: 'public.comma-separated-values-text',
      });
      return 'shared';
    }

    // Fallback: copy to clipboard
    await setStringAsync(csv);
    return 'clipboard';
  } catch (err) {
    console.warn('[lab-export] CSV export failed:', err);
    return 'failed';
  }
}
