/**
 * Health Connect / Wear OS adapter.
 *
 * On Android:
 *   1. connect() — requests Health Connect read/write permissions via the native health service.
 *   2. sync()    — fetches the last 90 days of BP, HR, sleep, and body composition from
 *                  Health Connect and merges them into the health context via a shared callback.
 *
 * On other platforms: returns unavailable.
 */

import { Platform } from 'react-native';
import { getNativeHealthService } from '@/lib/health/native-health-service';

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

type MergeCallback = (data: {
  bloodPressure: any[];
  heartRate: any[];
  sleep: any[];
  bodyComposition: any[];
  activity?: any[];
}) => void;

let _mergeCallback: MergeCallback | null = null;

export function setHealthConnectMergeCallback(cb: MergeCallback): void {
  _mergeCallback = cb;
}

const healthConnectAdapter: Adapter = {
  async connect(): Promise<AdapterResult> {
    if (Platform.OS !== 'android') {
      return { success: false, error: 'Health Connect is only available on Android.' };
    }
    try {
      const svc = getNativeHealthService();
      const granted = await svc.requestPermissions();
      if (granted) {
        return { success: true, accountLabel: 'Health Connect' };
      }
      // Fallback: open Health Connect permissions UI
      const { Linking } = await import('react-native');
      const hcUrl = 'healthconnect://androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS';
      const canOpen = await Linking.canOpenURL(hcUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(hcUrl);
        return { success: true, accountLabel: 'Health Connect' };
      }
      return { success: false, error: 'Health Connect permissions were not granted.' };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Could not request Health Connect permissions.' };
    }
  },

  async disconnect(): Promise<void> {
    const { Linking } = await import('react-native');
    if (Platform.OS === 'android') {
      const hcUrl = 'healthconnect://androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS';
      const canOpen = await Linking.canOpenURL(hcUrl).catch(() => false);
      if (canOpen) await Linking.openURL(hcUrl);
    }
  },

  async sync(_accessToken?: string): Promise<void> {
    if (Platform.OS !== 'android') return;
    const svc = getNativeHealthService();
    const since = new Date(0); // DEBUG: fetch ALL historical data — restore to: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const result = await svc.syncAll(since);
    if (_mergeCallback) {
      _mergeCallback({
        bloodPressure: result.bloodPressure,
        heartRate: result.heartRate,
        sleep: result.sleep,
        bodyComposition: result.bodyComposition,
        activity: result.activity,
      });
    }
    if (result.errors.length > 0) {
      console.warn('[HealthConnect] Sync completed with errors:', result.errors);
    }
  },
};

export default healthConnectAdapter;
