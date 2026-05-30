/**
 * ekg-store.ts — EKG data layer for VitalSync
 *
 * Two-step query strategy (Apple requirement):
 *
 *   1. History (metadata) — queryElectrocardiogramSamples() via @kingstinct v14
 *      Returns classification, averageHeartRate, samplingFrequency per recording.
 *      Does NOT load voltage data — safe to call for a full list.
 *
 *   2. Waveform (voltage) — fetchEKGVoltage(uuid) via @kingstinct v14
 *      Loads the 15 000+ mV data points for a single recording.
 *      ONLY called when the user taps a specific EKG card to view the waveform.
 *      Fetching voltage for the full list would crash the bridge.
 *
 * Classification values from HKAppleECGClassification:
 *   0 = NotSet / Unclassified
 *   1 = SinusRhythm
 *   2 = AtrialFibrillation
 *   3 = InconclusiveLowHeartRate
 *   4 = InconclusiveHighHeartRate
 *   5 = InconclusivePoorReading
 *   6 = InconclusiveOther
 *   7 = LowHeartRateEvent (outlier, not AFib)
 *   8 = HighHeartRateEvent
 *   9 = IrregularRhythm
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { safeSetItem } from '@/lib/safe-async-storage';
import { loadHealthKit } from '@/lib/health/healthkit-loader';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EKGClassification =
  | 'SinusRhythm'
  | 'AtrialFibrillation'
  | 'Inconclusive'
  | 'Unclassified';

export type EKGFilter = 'all' | 'SinusRhythm' | 'AtrialFibrillation' | 'Inconclusive';

export interface EKGRecord {
  id: string;
  startDate: string;
  endDate: string;
  classification: EKGClassification;
  averageHeartRate: number | null;
  samplingFrequency: number | null;
  device: string | null;
  algorithmVersion: number | null;
  /** Populated only after fetchEKGVoltage(id) is called — null until then */
  voltageMeasurements: number[] | null;
}

export interface EKGDistribution {
  total: number;
  sinusRhythm: number;
  atrialFibrillation: number;
  inconclusive: number;
  unclassified: number;
  /** ISO string of the most recent EKG recording's startDate, or null if no records */
  latestDate: string | null;
}

export interface EKGPageResult {
  records: EKGRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Classification map ───────────────────────────────────────────────────────

export const EKG_CLASSIFICATIONS: Record<
  EKGClassification,
  { label: string; color: string; icon: string }
> = {
  SinusRhythm: {
    label: 'Sinus Rhythm',
    color: '#22C55E',
    icon: 'waveform.path.ecg',
  },
  AtrialFibrillation: {
    label: 'Atrial Fibrillation',
    color: '#EF4444',
    icon: 'exclamationmark.triangle.fill',
  },
  Inconclusive: {
    label: 'Inconclusive',
    color: '#F59E0B',
    icon: 'exclamationmark.circle',
  },
  Unclassified: {
    label: 'Unclassified',
    color: '#6B7280',
    icon: 'waveform',
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const EKG_PAGE_SIZE = 20;
const CACHE_KEY = '@vsht:ekg_cache_v2'; // bumped from v1 — new schema
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day TTL (extended from 7d)

/**
 * EKG fetch limits by tier.
 *
 * The `daily` value is a runaway-loop circuit-breaker only — it is intentionally
 * set high (50 fetches/day) so that normal usage (pull-to-refresh, pagination,
 * background sync) never hits it. Content volume is controlled by the
 * `applyTierRetention` + `applyDateRetention` functions that trim the cache
 * after each successful fetch, not by blocking the fetch itself.
 *
 * The `total` limit is also a soft cap: when the cache reaches this size the
 * oldest records are trimmed rather than blocking new fetches.
 *
 * - free: EKG screen is premium-gated upstream; this is a safety backstop only.
 * - trial: 30 total cached records, 50 fetches/day circuit-breaker.
 * - premium: 300 total cached records, 50 fetches/day circuit-breaker.
 */
export const EKG_LIMITS = {
  free:    { daily: 0,  total: 0   },
  trial:   { daily: 50, total: 30  },
  premium: { daily: 50, total: 300 },
} as const;

export type EKGTier = keyof typeof EKG_LIMITS;

/**
 * Result of an EKG limit check.
 */
export interface EKGLimitCheckResult {
  allowed: boolean;
  /** Human-readable reason when not allowed */
  reason?: string;
  /** How many records are already cached today */
  todayCount: number;
  /** How many records are cached in total */
  totalCount: number;
  /** The limits that apply for this tier */
  limits: { daily: number; total: number };
}

const EKG_DAILY_COUNT_KEY = '@vsht:ekg_daily_count_v1';

interface EKGDailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Read today's EKG fetch count from AsyncStorage.
 * Resets automatically when the stored date differs from today.
 */
async function readDailyCount(): Promise<EKGDailyCount> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = await AsyncStorage.getItem(EKG_DAILY_COUNT_KEY);
    if (!raw) return { date: today, count: 0 };
    const stored: EKGDailyCount = JSON.parse(raw);
    if (stored.date !== today) return { date: today, count: 0 };
    return stored;
  } catch {
    return { date: new Date().toISOString().slice(0, 10), count: 0 };
  }
}

async function incrementDailyCount(): Promise<void> {
  try {
    const current = await readDailyCount();
    const updated: EKGDailyCount = { date: current.date, count: current.count + 1 };
    await safeSetItem(EKG_DAILY_COUNT_KEY, JSON.stringify(updated));
  } catch {
    // best-effort
  }
}

/**
 * Check whether a new EKG fetch is permitted for the given tier.
 * Does NOT increment the counter — call incrementDailyCount() after a successful fetch.
 */
export async function checkEKGLimit(tier: EKGTier): Promise<EKGLimitCheckResult> {
  const limits = EKG_LIMITS[tier];
  const [daily, cached] = await Promise.all([readDailyCount(), readCache()]);
  const todayCount = daily.count;
  const totalCount = cached.length;

  if (limits.total === 0) {
    return {
      allowed: false,
      reason: 'EKG recording history is a premium feature. Start your free trial to access it.',
      todayCount,
      totalCount,
      limits,
    };
  }
  // When the cache is at or above the total cap, allow the fetch to proceed.
  // The cache will be trimmed by applyTierRetention() after the fetch completes,
  // keeping the newest records. Blocking the fetch here would prevent the user
  // from ever seeing new EKG recordings after the cap is first reached.
  // (The cap is enforced as a retention policy, not a fetch gate.)
  if (todayCount >= limits.daily) {
    return {
      allowed: false,
      reason: `You've synced ${limits.daily} EKG recording${limits.daily !== 1 ? 's' : ''} today. Come back tomorrow, or upgrade to Premium for higher daily limits.`,
      todayCount,
      totalCount,
      limits,
    };
  }
  return { allowed: true, todayCount, totalCount, limits };
}

/**
 * Enforce the total cache size cap for the given tier.
 * Trims the oldest records when the cache exceeds the tier limit.
 * Returns the pruned record list.
 */
function applyTierRetention(records: EKGRecord[], tier: EKGTier): EKGRecord[] {
  const limit = EKG_LIMITS[tier].total;
  if (limit === 0) return [];
  if (records.length <= limit) return records;
  // Records are sorted newest-first; keep the most recent `limit` entries
  return records.slice(0, limit);
}

/**
 * Enforce a 90-day retention window on the EKG cache regardless of tier.
 * Records older than 90 days are removed to prevent unbounded growth.
 */
function applyDateRetention(records: EKGRecord[]): EKGRecord[] {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return records.filter((r) => new Date(r.startDate).getTime() >= cutoff);
}

// ─── Classification normaliser ────────────────────────────────────────────────
// Maps HKAppleECGClassification numeric codes and string names to our 4-bucket type.

function normaliseClassification(raw: string | number | undefined | null): EKGClassification {
  if (raw === null || raw === undefined) return 'Unclassified';
  // Numeric codes from HKAppleECGClassification
  if (raw === 1 || raw === 'sinusRhythm' || raw === 'SinusRhythm') return 'SinusRhythm';
  if (raw === 2 || raw === 'atrialFibrillation' || raw === 'AtrialFibrillation') return 'AtrialFibrillation';
  if (
    raw === 3 || raw === 4 || raw === 5 || raw === 6 ||
    raw === 'inconclusiveLowHeartRate' || raw === 'InconclusiveLowHeartRate' ||
    raw === 'inconclusiveHighHeartRate' || raw === 'InconclusiveHighHeartRate' ||
    raw === 'inconclusivePoorReading' || raw === 'InconclusivePoorReading' ||
    raw === 'inconclusiveOther' || raw === 'InconclusiveOther'
  ) return 'Inconclusive';
  return 'Unclassified';
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

interface CacheEntry {
  records: EKGRecord[];
  savedAt: number;
}

async function readCache(): Promise<EKGRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return [];
    }
    return Array.isArray(entry.records) ? entry.records : [];
  } catch {
    return [];
  }
}

async function appendToCache(newRecords: EKGRecord[], tier: EKGTier = 'premium'): Promise<void> {
  try {
    const existing = await readCache();
    // Merge, dedupe, then apply date retention (90 days) and tier retention (total cap)
    const merged = dedupeRecords([...existing, ...newRecords]);
    const dateFiltered = applyDateRetention(merged);
    const tierFiltered = applyTierRetention(dateFiltered, tier);
    const entry: CacheEntry = { records: tierFiltered, savedAt: Date.now() };
    await safeSetItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // swallow — cache is best-effort
  }
}

/**
 * Returns the EKG distribution computed from the FULL cache (not just the first page).
 * Use this for the dashboard card total badge so it matches the detail tab count.
 */
export async function getEKGCacheDistribution(): Promise<EKGDistribution> {
  const cached = await readCache();
  return computeEKGDistribution(cached);
}

export async function clearEKGCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // swallow
  }
}

function dedupeRecords(records: EKGRecord[]): EKGRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// ─── Kingstinct v14 bridge ────────────────────────────────────────────────────

/**
 * Returns the @kingstinct module if available, null otherwise.
 * Uses loadHealthKit() which checks global.NitroModulesProxy (v14) and
 * NativeModules.ReactNativeHealthkit (v8 legacy).
 */
async function getKingstinct(): Promise<any | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const hk = await loadHealthKit();
    if (!hk) return null;
    // v14 exposes queryElectrocardiogramSamples as a named export
    if (typeof (hk as any).queryElectrocardiogramSamples !== 'function') {
      console.warn('[EKG] queryElectrocardiogramSamples not found on @kingstinct module — check build');
      return null;
    }
    return hk;
  } catch (err) {
    console.warn('[EKG] getKingstinct error:', err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a page of EKG records (metadata only — no voltage data).
 * Uses @kingstinct v14 queryElectrocardiogramSamples.
 *
 * Classification and averageHeartRate come from the sample metadata fields:
 *   sample.metadata?.HKAppleECGClassification
 *   sample.metadata?.HKAverageHeartRate
 *   sample.metadata?.HKElectrocardiogramSamplingFrequency
 *
 * Pass forceRefresh: true to bypass the cache (used on pull-to-refresh).
 */
export async function fetchEKGPage(
  cursorDate?: Date,
  rangeStartDate?: Date,
  forceRefresh = false,
  tier: EKGTier = 'premium',
): Promise<EKGPageResult> {
  if (forceRefresh) {
    await clearEKGCache();
  }
  // Enforce tier-based limits before hitting HealthKit
  const limitCheck = await checkEKGLimit(tier);
  if (!limitCheck.allowed) {
    console.warn('[EKG] fetchEKGPage: limit reached —', limitCheck.reason);
    // Return cached records so the screen still shows existing data
    const cached = await readCache();
    return { records: cached.slice(0, EKG_PAGE_SIZE), nextCursor: null, hasMore: false };
  }

  const hk = await getKingstinct();
  console.log('[EKG] fetchEKGPage: @kingstinct =>', hk ? 'available' : 'null');
  if (!hk) {
    console.warn('[EKG] fetchEKGPage: @kingstinct bridge unavailable — returning empty');
    return { records: [], nextCursor: null, hasMore: false };
  }

  const endDate = cursorDate ?? new Date();
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  const startDate = rangeStartDate
    ? new Date(Math.max(rangeStartDate.getTime(), twoYearsAgo.getTime()))
    : twoYearsAgo;

  try {
    // queryElectrocardiogramSamples — returns metadata without voltage data
    const opts = {
      limit: EKG_PAGE_SIZE,
      ascending: false,
      from: startDate,
      to: endDate,
    };

    const raw: any[] = await (hk as any).queryElectrocardiogramSamples(opts).catch((e: unknown) => {
      console.warn('[EKG] queryElectrocardiogramSamples failed:', e);
      return [] as any[];
    });

    console.log('[EKG] fetchEKGPage: sample count =>', Array.isArray(raw) ? raw.length : 'not-array');

    if (!Array.isArray(raw) || raw.length === 0) {
      console.warn('[EKG] fetchEKGPage: no samples — user may have no EKG recordings, or Watch Series 4+ required');
      return { records: [], nextCursor: null, hasMore: false };
    }

    const records: EKGRecord[] = raw.map((s: any) => {
      // v14 returns classification as a numeric code or camelCase string in metadata
      const classRaw =
        s.classification ??
        s.metadata?.HKAppleECGClassification ??
        s.metadata?.['HKAppleECGClassification'] ??
        null;

      const avgHR =
        typeof s.averageHeartRate === 'number'
          ? s.averageHeartRate
          : typeof s.metadata?.HKAverageHeartRate === 'number'
            ? s.metadata.HKAverageHeartRate
            : null;

      const freq =
        typeof s.samplingFrequency === 'number'
          ? s.samplingFrequency
          : typeof s.metadata?.HKElectrocardiogramSamplingFrequency === 'number'
            ? s.metadata.HKElectrocardiogramSamplingFrequency
            : null;

      return {
        id: s.uuid ?? s.id ?? `${s.startDate}-${s.endDate}`,
        startDate: s.startDate instanceof Date ? s.startDate.toISOString() : String(s.startDate),
        endDate: s.endDate instanceof Date ? s.endDate.toISOString() : String(s.endDate),
        classification: normaliseClassification(classRaw),
        averageHeartRate: avgHR,
        samplingFrequency: freq,
        device: typeof s.device === 'string' ? s.device : (s.device?.name ?? null),
        algorithmVersion: typeof s.algorithmVersion === 'number' ? s.algorithmVersion : null,
        voltageMeasurements: null, // loaded on-demand via fetchEKGVoltage()
      };
    });

    // Update the persistent tally and apply the daily routine strip limit to the cache.
    // ingestEKGRecords handles both the tally update and the strip-cache pruning atomically.
    try {
      const { ingestEKGRecords } = await import('@/lib/health/ekg-tally-store');
      await ingestEKGRecords(records);
    } catch {
      // Fallback to raw cache append if tally store fails
      await appendToCache(records, tier);
    }
    // Only increment the daily circuit-breaker counter when HealthKit actually
    // returned samples. Empty fetches (no new EKG recordings today, Watch not
    // worn, etc.) must NOT burn the daily budget — otherwise the counter fills
    // up on days with no recordings and blocks fetches for the rest of the day.
    if (records.length > 0) {
      await incrementDailyCount();
    }
    const oldest = records[records.length - 1];
    const nextCursor = records.length === EKG_PAGE_SIZE ? oldest.startDate : null;
    const hasMore =
      nextCursor !== null &&
      (!rangeStartDate || new Date(oldest.startDate).getTime() > rangeStartDate.getTime());

    return { records, nextCursor, hasMore };
  } catch (e) {
    console.warn('[EKG] fetchEKGPage error:', e);
    return { records: [], nextCursor: null, hasMore: false };
  }
}

/**
 * Fetch the first page, using cache when available.
 */
export async function fetchEKGFirstPage(rangeStartDate?: Date): Promise<EKGPageResult> {
  if (!rangeStartDate) {
    const cached = await readCache();
    if (cached.length > 0) {
      const oldest = cached[cached.length - 1];
      return {
        records: cached.slice(0, EKG_PAGE_SIZE),
        nextCursor: cached.length >= EKG_PAGE_SIZE ? oldest.startDate : null,
        hasMore: cached.length >= EKG_PAGE_SIZE,
      };
    }
  }
  return fetchEKGPage(undefined, rangeStartDate);
}

/**
 * Fetch the voltage waveform for a single EKG recording.
 *
 * ⚠️  ONLY call this when the user explicitly opens a specific EKG detail view.
 *     A 30-second recording at 511 Hz = ~15 330 data points.
 *     Fetching voltage for the full list will crash the bridge.
 *
 * Returns an array of millivolt (mV) readings, or null on failure.
 */
export async function fetchEKGVoltage(uuid: string): Promise<number[] | null> {
  if (Platform.OS !== 'ios') return null;
  const hk = await getKingstinct();
  if (!hk) return null;
  try {
    // v14: queryElectrocardiogramSamples with a specific UUID and includeVoltages
    // The library exposes getElectrocardiogramVoltage(uuid) if available,
    // otherwise re-query with includeVoltages: true filtered by UUID.
    if (typeof (hk as any).getElectrocardiogramVoltage === 'function') {
      const voltages: number[] = await (hk as any).getElectrocardiogramVoltage(uuid);
      return Array.isArray(voltages) ? voltages : null;
    }
    // Fallback: re-query with includeVoltages flag
    const results: any[] = await (hk as any).queryElectrocardiogramSamples({
      limit: 1,
      ascending: false,
      includeVoltages: true,
    });
    const match = results.find((s: any) => (s.uuid ?? s.id) === uuid);
    if (!match) return null;
    const v = match.voltageMeasurements ?? match.voltages ?? match.voltage;
    return Array.isArray(v) ? v : null;
  } catch (err) {
    console.warn('[EKG] fetchEKGVoltage error:', err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function filterEKGRecords(records: EKGRecord[], filter: EKGFilter): EKGRecord[] {
  if (filter === 'all') return records;
  return records.filter((r) => r.classification === filter);
}

export function hasAFibRecords(records: EKGRecord[]): boolean {
  return records.some((r) => r.classification === 'AtrialFibrillation');
}

/**
 * Returns a Map<dateString, count> of AFib episodes per calendar day.
 * Used by the Correlation Engine to expose AFib episode count as a selectable metric.
 * dateString format: 'YYYY-MM-DD'
 */
export function getAfibDailyCounts(records: EKGRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.classification !== 'AtrialFibrillation') continue;
    const date = r.startDate.split('T')[0];
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

export function lastAfibRecord(records: EKGRecord[]): EKGRecord | null {
  return records.find((r) => r.classification === 'AtrialFibrillation') ?? null;
}

export function computeEKGDistribution(records: EKGRecord[]): EKGDistribution {
  const dist: EKGDistribution = {
    total: records.length,
    sinusRhythm: 0,
    atrialFibrillation: 0,
    inconclusive: 0,
    unclassified: 0,
    latestDate: null,
  };
  let latestMs = 0;
  for (const r of records) {
    if (r.classification === 'SinusRhythm') dist.sinusRhythm++;
    else if (r.classification === 'AtrialFibrillation') dist.atrialFibrillation++;
    else if (r.classification === 'Inconclusive') dist.inconclusive++;
    else dist.unclassified++;
    // Track the most recent startDate
    const ms = r.startDate ? new Date(r.startDate).getTime() : 0;
    if (ms > latestMs) { latestMs = ms; dist.latestDate = r.startDate; }
  }
  return dist;
}

export interface EKGSummaryLabels {
  sinusRhythm: string;
  atrialFibrillation: string;
  inconclusive: string;
  unclassified: string;
  avgHR: string;
  recordings: string;
  disclaimer: string;
}

/**
 * Build a plain-text summary for sharing with a doctor.
 * Pass i18n labels so the summary is fully translated.
 */
export function buildEKGDoctorSummary(
  records: EKGRecord[],
  headerLine: string,
  labels: EKGSummaryLabels,
  rangeDays: number,
): string {
  const dist = computeEKGDistribution(records);
  const generated = new Date().toLocaleDateString();
  const lines: string[] = [
    headerLine,
    generated,
    '',
    `${labels.recordings}: ${dist.total}`,
    `${labels.sinusRhythm}: ${dist.sinusRhythm}`,
    `${labels.atrialFibrillation}: ${dist.atrialFibrillation}`,
    `${labels.inconclusive}: ${dist.inconclusive}`,
    `${labels.unclassified}: ${dist.unclassified}`,
    '',
  ];
  const recent = records.slice(0, 10);
  for (const r of recent) {
    const date = new Date(r.startDate).toLocaleDateString();
    const hr = r.averageHeartRate ? ` — ${Math.round(r.averageHeartRate)} ${labels.avgHR}` : '';
    const cls =
      r.classification === 'SinusRhythm' ? labels.sinusRhythm
      : r.classification === 'AtrialFibrillation' ? labels.atrialFibrillation
      : r.classification === 'Inconclusive' ? labels.inconclusive
      : labels.unclassified;
    lines.push(`  ${date}: ${cls}${hr}`);
  }
  lines.push('');
  lines.push(labels.disclaimer);
  return lines.join('\n');
}
