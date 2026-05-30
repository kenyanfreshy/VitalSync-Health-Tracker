/**
 * PharmacyStore
 *
 * Persists a local dictionary of pharmacy entries so that once a user types
 * a pharmacy name + phone + address, subsequent medication entries can
 * auto-populate all three fields from a dropdown.
 *
 * One entry may be marked as "preferred" — it is pre-filled automatically
 * whenever the user opens the Add Medication form with an empty pharmacy field,
 * and it always appears first (with a ⭐ badge) in the autocomplete dropdown.
 *
 * Storage key: @vitalsync/pharmacies
 * Shape: Record<string (normalised name), PharmacyEntry>
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vitalsync/pharmacies';

export interface PharmacyEntry {
  /** Display name as entered by the user (original casing) */
  name: string;
  /** Phone number */
  phone: string;
  /** Street address */
  address: string;
  /**
   * Free-text opening hours, e.g. "Mon-Fri 9AM-9PM, Sat-Sun 10AM-6PM".
   * Also accepts a simple daily string like "9AM-9PM" (applies every day).
   */
  hours?: string;
  /** ISO timestamp of last use — used to sort suggestions by recency */
  lastUsed: string;
  /**
   * Whether this is the user's preferred / default pharmacy.
   * Only one entry may be preferred at a time.
   */
  isPreferred?: boolean;
}

/** Normalise a pharmacy name for use as a dictionary key */
export function normalisePharmacyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

export async function loadPharmacies(): Promise<Record<string, PharmacyEntry>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PharmacyEntry>;
  } catch (_unused) {
    return {};
  }
}

async function savePharmacies(
  store: Record<string, PharmacyEntry>,
): Promise<void> {
  await safeSetItem(STORAGE_KEY, JSON.stringify(store));
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Add or update a pharmacy entry.
 * Only saves if name is non-empty; phone and address are optional but stored
 * if provided. Preserves the existing isPreferred flag if already set.
 */
export async function upsertPharmacy(
  name: string,
  phone: string,
  address: string,
  hours?: string,
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) return;

  const store = await loadPharmacies();
  const key = normalisePharmacyName(trimmedName);
  const existing = store[key];

  store[key] = {
    name: trimmedName,
    phone: phone.trim(),
    address: address.trim(),
    hours: hours !== undefined ? hours.trim() : (existing?.hours ?? ''),
    lastUsed: new Date().toISOString(),
    // Preserve preferred flag if already set
    isPreferred: existing?.isPreferred ?? false,
  };

  await savePharmacies(store);
}

/**
 * Update an existing pharmacy entry in-place (e.g. after inline edit).
 * If the name key changes (user renamed it), the old key is removed.
 */
export async function updatePharmacy(
  originalName: string,
  updated: Pick<PharmacyEntry, 'name' | 'phone' | 'address'> & { hours?: string },
): Promise<void> {
  const store = await loadPharmacies();
  const oldKey = normalisePharmacyName(originalName);
  const newKey = normalisePharmacyName(updated.name);
  const existing = store[oldKey];
  if (!existing) return;

  // Remove old key if name changed
  if (oldKey !== newKey) {
    delete store[oldKey];
  }

  store[newKey] = {
    ...existing,
    name: updated.name.trim(),
    phone: updated.phone.trim(),
    address: updated.address.trim(),
    hours: updated.hours !== undefined ? updated.hours.trim() : existing.hours,
    lastUsed: new Date().toISOString(),
  };

  await savePharmacies(store);
}

// ─── Preferred pharmacy ───────────────────────────────────────────────────────

/**
 * Mark one pharmacy as preferred (clears the flag on all others).
 * Passing an empty string clears the preferred flag on all entries.
 */
export async function setPreferredPharmacy(name: string): Promise<void> {
  const store = await loadPharmacies();
  const targetKey = normalisePharmacyName(name);

  for (const key of Object.keys(store)) {
    store[key] = { ...store[key], isPreferred: key === targetKey && name.trim() !== '' };
  }

  await savePharmacies(store);
}

/**
 * Return the preferred pharmacy entry, or undefined if none is set.
 */
export async function getPreferredPharmacy(): Promise<PharmacyEntry | undefined> {
  const store = await loadPharmacies();
  return Object.values(store).find((p) => p.isPreferred);
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Return all saved pharmacies sorted:
 *   1. Preferred entry first
 *   2. Then by most-recently used
 */
export async function getAllPharmacies(): Promise<PharmacyEntry[]> {
  const store = await loadPharmacies();
  return Object.values(store).sort((a, b) => {
    if (a.isPreferred && !b.isPreferred) return -1;
    if (!a.isPreferred && b.isPreferred) return 1;
    return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
  });
}

/**
 * Return pharmacies whose name contains the query string (case-insensitive).
 * Returns all pharmacies (preferred first) when query is empty.
 */
export async function searchPharmacies(query: string): Promise<PharmacyEntry[]> {
  const all = await getAllPharmacies();
  if (!query.trim()) return all;
  const q = query.trim().toLowerCase();
  return all.filter((p) => p.name.toLowerCase().includes(q));
}

/**
 * Look up a pharmacy by exact normalised name.
 * Returns undefined if not found.
 */
export async function getPharmacyByName(
  name: string,
): Promise<PharmacyEntry | undefined> {
  const store = await loadPharmacies();
  return store[normalisePharmacyName(name)];
}

/**
 * Delete a pharmacy entry by name.
 */
export async function deletePharmacy(name: string): Promise<void> {
  const store = await loadPharmacies();
  const key = normalisePharmacyName(name);
  if (key in store) {
    delete store[key];
    await savePharmacies(store);
  }
}

// ─── Hours helpers ────────────────────────────────────────────────────────────

const _DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_ALIASES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  weekday: -1, weekdays: -1,
  weekend: -2, weekends: -2,
};

/**
 * Parse a free-text hours string and return today's hours segment, or
 * the full string if no day-specific pattern is found.
 *
 * Supported formats (case-insensitive):
 *  - "9AM-9PM"                         → applies every day
 *  - "Mon-Fri 9AM-9PM, Sat-Sun 10AM-6PM"
 *  - "Weekdays 8AM-10PM, Weekends 9AM-7PM"
 *  - "Mon 9AM-5PM, Tue-Fri 8AM-9PM, Sat 10AM-6PM, Sun Closed"
 *
 * Returns undefined when the hours string is empty or unparseable.
 */
export function getOpenTodayHours(hours: string | undefined): string | undefined {
  if (!hours?.trim()) return undefined;

  const todayIdx = new Date().getDay(); // 0=Sun … 6=Sat
  const raw = hours.trim();

  // Split on commas or semicolons to get segments like "Mon-Fri 9AM-9PM"
  const segments = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

  // If only one segment with no day prefix → applies every day
  if (segments.length === 1 && !hasDayPrefix(segments[0])) {
    return segments[0];
  }

  for (const seg of segments) {
    const match = matchDayRange(seg, todayIdx);
    if (match !== null) return match;
  }

  // Fallback: return the full string so the user still sees something
  return raw;
}

function hasDayPrefix(seg: string): boolean {
  const lower = seg.toLowerCase();
  return Object.keys(DAY_ALIASES).some((k) => lower.startsWith(k));
}

/**
 * Check if `seg` covers `todayIdx`. Returns the time portion if it does,
 * null otherwise.
 */
function matchDayRange(seg: string, todayIdx: number): string | null {
  // Pattern: "Mon-Fri 9AM-9PM" or "Weekdays 8AM-10PM" or "Sun Closed"
  const m = seg.match(/^([a-z]+(?:-[a-z]+)?)\s+(.+)$/i);
  if (!m) return null;

  const dayPart = m[1].toLowerCase();
  const timePart = m[2].trim();

  // Range like "mon-fri"
  if (dayPart.includes('-')) {
    const [startDay, endDay] = dayPart.split('-');
    const startIdx = DAY_ALIASES[startDay];
    const endIdx = DAY_ALIASES[endDay];
    if (startIdx === undefined || endIdx === undefined) return null;

    // Handle weekday/weekend aliases
    if (startIdx < 0 || endIdx < 0) {
      return matchAlias(dayPart, todayIdx, timePart);
    }

    // Wrap-around range (e.g. Fri-Mon)
    if (startIdx <= endIdx) {
      if (todayIdx >= startIdx && todayIdx <= endIdx) return timePart;
    } else {
      if (todayIdx >= startIdx || todayIdx <= endIdx) return timePart;
    }
    return null;
  }

  // Single day or alias
  const idx = DAY_ALIASES[dayPart];
  if (idx === undefined) return null;
  if (idx === -1) return todayIdx >= 1 && todayIdx <= 5 ? timePart : null; // weekdays
  if (idx === -2) return todayIdx === 0 || todayIdx === 6 ? timePart : null; // weekends
  return idx === todayIdx ? timePart : null;
}

function matchAlias(alias: string, todayIdx: number, timePart: string): string | null {
  if (alias.includes('weekday')) return todayIdx >= 1 && todayIdx <= 5 ? timePart : null;
  if (alias.includes('weekend')) return todayIdx === 0 || todayIdx === 6 ? timePart : null;
  return null;
}

/**
 * Parse all days' hours from a pharmacy hours string.
 * Returns an array of 7 entries (Sun=0 … Sat=6), each being the hours string
 * for that day or undefined if closed/unknown.
 */
export function parseAllDayHours(hours: string | undefined): (string | undefined)[] | undefined {
  if (!hours?.trim()) return undefined;
  const raw = hours.trim();
  const segments = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  // If only one segment with no day prefix → applies every day
  if (segments.length === 1 && !hasDayPrefix(segments[0])) {
    return Array(7).fill(segments[0]);
  }
  const result: (string | undefined)[] = Array(7).fill(undefined);
  for (let day = 0; day < 7; day++) {
    for (const seg of segments) {
      const match = matchDayRange(seg, day);
      if (match !== null) {
        result[day] = match;
        break;
      }
    }
  }
  return result;
}
