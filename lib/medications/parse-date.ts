/**
 * parseNaturalDate
 * ────────────────
 * Converts natural-language date strings into ISO date strings (YYYY-MM-DD).
 * Supports:
 *   - "today", "tomorrow", "yesterday"
 *   - "last Monday", "next Friday", "this Thursday"
 *   - "3 days ago", "in 2 weeks", "2 weeks ago"
 *   - Month names: "January 15", "Jan 15", "Jan 15 2025", "15 January"
 *   - Numeric: "01/15/2025", "2025-01-15", "1/15"
 *   - Falls through to Date() constructor for anything else
 *
 * Returns an ISO date string "YYYY-MM-DD" on success, or null if unparseable.
 */
export function parseNaturalDate(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const lower = raw.toLowerCase();

  // ── Relative keywords ──────────────────────────────────────────────────────
  if (lower === 'today') return toISO(today);
  if (lower === 'tomorrow') return toISO(addDays(today, 1));
  if (lower === 'yesterday') return toISO(addDays(today, -1));

  // ── "N days/weeks/months ago" or "in N days/weeks/months" ─────────────────
  const relMatch = lower.match(
    /^(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months)\s*(ago)?$/
  );
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2].replace(/s$/, ''); // normalize plural
    const past = !!relMatch[3];
    const sign = past ? -1 : 1;
    if (unit === 'day') return toISO(addDays(today, sign * n));
    if (unit === 'week') return toISO(addDays(today, sign * n * 7));
    if (unit === 'month') {
      const d = new Date(today);
      d.setMonth(d.getMonth() + sign * n);
      return toISO(d);
    }
  }

  // ── "last/next/this <weekday>" ─────────────────────────────────────────────
  const weekdayMatch = lower.match(/^(last|next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekdayMatch) {
    const modifier = weekdayMatch[1];
    const targetDay = WEEKDAYS[weekdayMatch[2]];
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;
    if (modifier === 'last') {
      if (diff >= 0) diff -= 7;
    } else if (modifier === 'next') {
      if (diff <= 0) diff += 7;
    } else {
      // "this" — nearest occurrence (past or future within week)
      if (diff < 0) diff += 7;
    }
    return toISO(addDays(today, diff));
  }

  // ── "last/next <weekday>" without "this" already handled above ─────────────
  // ── Month name patterns ────────────────────────────────────────────────────
  // "January 15", "Jan 15", "Jan 15 2025", "January 15, 2025"
  const monthNameMatch = raw.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/
  );
  if (monthNameMatch) {
    const monthIdx = MONTH_NAMES[monthNameMatch[1].toLowerCase()];
    if (monthIdx !== undefined) {
      const day = parseInt(monthNameMatch[2], 10);
      const year = monthNameMatch[3] ? parseInt(monthNameMatch[3], 10) : today.getFullYear();
      const d = new Date(year, monthIdx, day);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  // "15 January", "15 Jan", "15 January 2025"
  const dayMonthMatch = raw.match(
    /^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?$/
  );
  if (dayMonthMatch) {
    const monthIdx = MONTH_NAMES[dayMonthMatch[2].toLowerCase()];
    if (monthIdx !== undefined) {
      const day = parseInt(dayMonthMatch[1], 10);
      const year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : today.getFullYear();
      const d = new Date(year, monthIdx, day);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  // ── Numeric formats ────────────────────────────────────────────────────────
  // "MM/DD/YYYY" or "MM/DD" (assume current year)
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : today.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return toISO(d);
  }

  // ── ISO or native Date fallback ────────────────────────────────────────────
  const fallback = new Date(raw);
  if (!isNaN(fallback.getTime())) return toISO(fallback);

  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};
