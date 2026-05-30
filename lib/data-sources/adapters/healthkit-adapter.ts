/**
 * HealthKit / Apple Watch adapter.
 *
 * On iOS:
 *   1. connect() — requests HealthKit read/write permissions via the native health service.
 *   2. sync()    — fetches the last 90 days of BP, HR, sleep, and body composition from
 *                  HealthKit and merges them into the health context via a shared callback.
 *
 * On other platforms: returns unavailable.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNativeHealthService } from '@/lib/health/native-health-service';
import { authorizeHealthKit } from '@/lib/health/healthkit-loader';
import { safeSetItem } from '@/lib/safe-async-storage';

const SYNC_COUNTS_KEY = '@vitalsync/healthkit_sync_counts';
const SYNC_ERRORS_KEY = '@vitalsync/healthkit_sync_errors';

interface AdapterResult {
  success: boolean;
  accessToken?: string;
  accountLabel?: string;
  error?: string;
}

interface Adapter {
  connect: () => Promise<AdapterResult>;
  disconnect?: () => Promise<void>;
  sync?: (accessToken?: string) => Promise<void>;
}

// Callback set by the DataSourcesProvider when it has access to the health context.
// This avoids a circular dependency between the adapter and the context.
// NOTE: vitalSigns and bloodGlucose are optional so the type is backward-compatible
// with any existing callers that do not yet pass these fields.
type MergeCallback = (data: {
  bloodPressure: any[];
  heartRate: any[];
  sleep: any[];
  bodyComposition: any[];
  activity?: any[];
  /** SpO2 + body temperature + respiratory rate records merged into the vitalSigns array */
  vitalSigns?: any[];
  /** Blood glucose samples from HealthKit (iOS) */
  bloodGlucose?: any[];
  /** Resting Heart Rate samples — one per day from Apple Watch */
  restingHRSamples?: any[];
}) => void;

let _mergeCallback: MergeCallback | null = null;

export function setHealthKitMergeCallback(cb: MergeCallback): void {
  _mergeCallback = cb;
}

// Last sync result counts — exposed for the Data Sources progress UI
export interface HealthKitSyncCounts {
  bloodPressure: number;
  heartRate: number;
  sleep: number;
  bodyComposition: number;
  activity: number;
  spO2: number;
  temperature: number;
  respiratoryRate: number;
  steps: number;
  bloodGlucose: number;
  syncedAt: string | null;
  /** Per-type ISO timestamps of the most recent record returned for each data type */
  lastPerType: {
    bloodPressure: string | null;
    heartRate: string | null;
    sleep: string | null;
    bodyComposition: string | null;
    activity: string | null;
    spO2: string | null;
    temperature: string | null;
    respiratoryRate: string | null;
    steps: string | null;
    bloodGlucose: string | null;
  };
}

let _lastSyncCounts: HealthKitSyncCounts | null = null;
let _lastSyncErrors: string[] = [];

export function getLastHealthKitSyncCounts(): HealthKitSyncCounts | null {
  return _lastSyncCounts;
}

export function getLastHealthKitSyncErrors(): string[] {
  return _lastSyncErrors;
}

/** Load persisted counts from AsyncStorage (call on app start or SourceCard mount) */
export async function loadPersistedHealthKitSyncCounts(): Promise<void> {
  try {
    const [countsJson, errorsJson] = await Promise.all([
      AsyncStorage.getItem(SYNC_COUNTS_KEY),
      AsyncStorage.getItem(SYNC_ERRORS_KEY),
    ]);
    if (countsJson) _lastSyncCounts = JSON.parse(countsJson);
    if (errorsJson) _lastSyncErrors = JSON.parse(errorsJson);
  } catch (_unused) {
    // Non-fatal — counts will just be null until next sync
  }
}

const healthkitAdapter: Adapter = {
  async connect(): Promise<AdapterResult> {
    if (Platform.OS !== 'ios') {
      return { success: false, error: 'Apple Health is only available on iPhone and iPad.' };
    }
    try {
      // Step 1: request permissions via the RNH bridge (covers all vitals incl. Electrocardiogram)
      const svc = getNativeHealthService();
      const granted = await svc.requestPermissions();

      // Step 2: also authorize via the @kingstinct Nitro bridge so EKG (HKElectrocardiogramType)
      // and any Nitro-only types are requested in the same permission sheet.
      // This is a best-effort call — failure here does not block the connect flow.
      try {
        await authorizeHealthKit();
      } catch {
        // Nitro bridge unavailable (simulator, non-iOS) — ignore
      }

      if (granted) {
        return { success: true, accountLabel: 'Apple Health' };
      }
      return { success: false, error: 'Health permissions were not granted. Please enable them in Settings → Health → Data Access.' };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Could not request Health permissions.' };
    }
  },

  async disconnect(): Promise<void> {
    // HealthKit permissions cannot be revoked programmatically.
    // The user must go to Settings → Health → Data Access & Devices manually.
    // No automatic navigation — the Settings tab guides the user.
  },

  async sync(_accessToken?: string): Promise<void> {
    if (Platform.OS !== 'ios') return;
    const svc = getNativeHealthService();
    const since = new Date(0); // DEBUG: fetch ALL historical data — restore to: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const result = await svc.syncAll(since);
    // Compute the most recent record timestamp for each data type
    // Guard: arr may be null/undefined if a fetch silently returned null instead of []
    const latestTs = (arr: { timestamp?: string; date?: string; endDate?: string }[] | null | undefined) => {
      const safe = arr ?? [];
      return safe.length === 0 ? null : safe.reduce((best, r) => {
        const ts = r.timestamp ?? r.date ?? r.endDate ?? null;
        if (!ts) return best;
        return (!best || ts > best) ? ts : best;
      }, null as string | null);
    };

    // Store counts and errors for the progress UI, persist to AsyncStorage
    _lastSyncCounts = {
      ...result.counts,
      syncedAt: new Date().toISOString(),
      lastPerType: {
        bloodPressure: latestTs(result.bloodPressure ?? []),
        heartRate: latestTs(result.heartRate ?? []),
        sleep: latestTs(result.sleep ?? []),
        bodyComposition: latestTs(result.bodyComposition ?? []),
        activity: latestTs(result.activity ?? []),
        spO2: latestTs(result.spO2 ?? []),
        temperature: latestTs(result.temperature ?? []),
        respiratoryRate: latestTs(result.respiratoryRate ?? []),
        steps: result.counts.steps > 0 ? new Date().toISOString() : null,
        bloodGlucose: latestTs(result.bloodGlucose ?? []),
      },
    };
    _lastSyncErrors = result.errors ?? [];
    // Persist so counts survive app restart
    safeSetItem(SYNC_COUNTS_KEY, JSON.stringify(_lastSyncCounts)).catch(() => {});
    safeSetItem(SYNC_ERRORS_KEY, JSON.stringify(_lastSyncErrors)).catch(() => {});
    if (_mergeCallback) {
      // Combine spO2, temperature, and respiratory rate into a single vitalSigns array so the
      // health context can deduplicate and store them correctly.
      const vitalSigns = [
        ...(result.spO2 ?? []),
        ...(result.temperature ?? []),
        ...(result.respiratoryRate ?? []),
      ];
      _mergeCallback({
        bloodPressure: result.bloodPressure ?? [],
        heartRate: result.heartRate ?? [],
        sleep: result.sleep ?? [],
        bodyComposition: result.bodyComposition ?? [],
        activity: result.activity ?? [],
        vitalSigns,
        bloodGlucose: result.bloodGlucose ?? [],
        restingHRSamples: result.restingHRSamples ?? [],
      });
    }
    if ((result.errors ?? []).length > 0) {
      console.warn('[HealthKit] Sync completed with errors:', result.errors);
    }
  },
};

export default healthkitAdapter;
