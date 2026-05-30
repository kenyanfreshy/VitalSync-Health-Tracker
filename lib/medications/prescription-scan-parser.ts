/**
 * Prescription Scan Parser
 *
 * Parses raw OCR text from a prescription label into structured medication fields.
 * Processes locally — no data is sent to any external service.
 * All fields are optional; only clearly-present values are filled.
 * Never throws — returns EMPTY_MEDICATION_SCAN on any error.
 */

export type ParsedMedicationScan = {
  medicationName: string;
  dose: string;
  unit: string;
  route: string;
  frequency: string;
  time: string;
  quantity: string;
  refills: string;
  rxNumber: string;
  prescriber: string;
  pharmacy: string;
  fillDate: string;
  reasonNote: string;
  daysSupply?: string;
};

export const EMPTY_MEDICATION_SCAN: ParsedMedicationScan = {
  medicationName: '',
  dose: '',
  unit: '',
  route: '',
  frequency: '',
  time: '',
  quantity: '',
  refills: '',
  rxNumber: '',
  prescriber: '',
  pharmacy: '',
  fillDate: '',
  reasonNote: '',
  daysSupply: '',
};

export function parsePrescriptionScanText(input?: string | null): ParsedMedicationScan {
  try {
    if (!input || typeof input !== 'string') return EMPTY_MEDICATION_SCAN;

    const text = input.replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();

    // ── Dose + unit ──────────────────────────────────────────────────────────
    const doseMatch = text.match(
      /\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|gram|grams|ml|mL|units|iu|tablet|tablets|capsule|capsules)\b/i
    );

    // ── Rx number ─────────────────────────────────────────────────────────────
    const rxMatch = text.match(/\b(?:rx|rx#|rx\s*#)\s*[:#]?\s*([a-zA-Z0-9-]+)/i);

    // ── Quantity ──────────────────────────────────────────────────────────────
    const qtyMatch = text.match(/\b(?:qty|quantity)\s*[:#]?\s*(\d+)\b/i);

    // ── Refills ───────────────────────────────────────────────────────────────
    const refillMatch = text.match(/\b(?:refills?|rf)\s*[:#]?\s*(\d+)\b/i);

    // ── Fill / start date ─────────────────────────────────────────────────────
    const dateMatch = text.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/);

    // ── Route ─────────────────────────────────────────────────────────────────
    let route = '';
    if (/\bby mouth\b|\boral\b|\bpo\b/i.test(text)) route = 'By mouth';
    if (/\bsubcutaneous\b|\bsq\b/i.test(text)) route = 'Subcutaneous';
    if (/\btopical\b/i.test(text)) route = 'Topical';
    if (/\binhaled\b|\binhale\b/i.test(text)) route = 'Inhaled';

    // ── Frequency ─────────────────────────────────────────────────────────────
    let frequency = '';
    if (/\bonce daily\b|\bdaily\b|\bevery day\b/i.test(text)) frequency = 'Once daily';
    if (/\btwice daily\b|\btwo times daily\b|\bbid\b/i.test(text)) frequency = 'Twice daily';
    if (/\bthree times daily\b|\bthree times a day\b|\btid\b/i.test(text)) frequency = 'Three times daily';
    if (/\bat bedtime\b|\bbedtime\b|\bat night\b/i.test(text)) frequency = frequency || 'Nightly';
    if (/\bbefore meals\b/i.test(text)) frequency = frequency || 'Before meals';
    if (/\bafter meals\b/i.test(text)) frequency = frequency || 'After meals';
    if (/\bas directed\b/i.test(text)) frequency = frequency || 'As directed';

    // ── Time ──────────────────────────────────────────────────────────────────
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s?(?:AM|PM|am|pm))\b/);

    // ── Medication name ───────────────────────────────────────────────────────
    let medicationName = '';
    const medLineMatch = text.match(
      /\b([A-Z][A-Za-z-]+)\s+(\d+(?:\.\d+)?)\s*(MG|MCG|G|ML|UNITS|IU)\b/
    );
    if (medLineMatch?.[1]) {
      medicationName = capitalize(medLineMatch[1]);
    } else {
      const commonStart = text.match(/^([A-Za-z][A-Za-z-]+)\s+\d/);
      if (commonStart?.[1]) medicationName = capitalize(commonStart[1]);
    }

    // ── Prescriber ────────────────────────────────────────────────────────────
    let prescriber = '';
    const prescriberMatch = text.match(/\b(?:dr\.?|doctor|prescriber)\s+([A-Za-z .'-]+)/i);
    if (prescriberMatch?.[1]) {
      prescriber = prescriberMatch[1].trim();
    }

    // ── Pharmacy ──────────────────────────────────────────────────────────────
    let pharmacy = '';
    const pharmacyMatch = text.match(
      /\b([A-Za-z .'-]*(?:CVS|Walgreens|Rite Aid|Walmart|Costco|Kroger|Pharmacy)[A-Za-z .'-]*)\b/i
    );
    if (pharmacyMatch?.[1]) {
      pharmacy = pharmacyMatch[1].trim();
    }

    // ── Reason / note (only if "for <condition>" is clearly present) ──────────
    const reasonNote = lower.includes('for ')
      ? text.split(/\bfor\b/i).slice(1).join('for').trim()
      : '';

    return {
      medicationName,
      dose: doseMatch?.[1] ?? '',
      unit: normalizeUnit(doseMatch?.[2] ?? ''),
      route,
      frequency,
      time: timeMatch?.[1]?.toUpperCase().replace(/\s+/g, ' ') ?? '',
      quantity: qtyMatch?.[1] ?? '',
      refills: refillMatch?.[1] ?? '',
      rxNumber: rxMatch?.[1] ?? '',
      prescriber,
      pharmacy,
      fillDate: dateMatch?.[1] ?? '',
      reasonNote,
    };
  } catch {
    return EMPTY_MEDICATION_SCAN;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'mg' || u.startsWith('milligram')) return 'mg';
  if (u === 'mcg' || u.startsWith('microgram')) return 'mcg';
  if (u === 'g' || u.startsWith('gram')) return 'g';
  if (u === 'ml') return 'mL';
  if (u === 'iu') return 'IU';
  if (u.startsWith('unit')) return 'units';
  if (u.startsWith('tablet')) return 'tablet';
  if (u.startsWith('capsule')) return 'capsule';
  return unit;
}

function capitalize(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
