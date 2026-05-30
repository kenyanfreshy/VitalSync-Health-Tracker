/**
 * Data Sources — AsyncStorage persistence layer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALL_SOURCE_IDS, type DataSourceId, type DataSourceState, type DataSourcesStore } from './types';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vsht:data_sources_v1';
const AUTO_SYNC_KEY = '@vsht:auto_sync_on_launch';

function defaultState(id: DataSourceId): DataSourceState {
  return {
    id,
    status: 'disconnected',
    lastSyncedAt: null,
    errorMessage: null,
    accessToken: null,
    accountLabel: null,
  };
}

export function buildDefaultStore(): DataSourcesStore {
  const sources = {} as Record<DataSourceId, DataSourceState>;
  for (const id of ALL_SOURCE_IDS) {
    sources[id] = defaultState(id);
  }
  return { sources, autoSyncOnLaunch: false };
}

export async function loadAutoSyncOnLaunch(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_SYNC_KEY);
    return raw === 'true';
  } catch (_unused) {
    return false;
  }
}

export async function saveAutoSyncOnLaunch(enabled: boolean): Promise<void> {
  try {
    await safeSetItem(AUTO_SYNC_KEY, enabled ? 'true' : 'false');
  } catch (_unused) {
    // Silently ignore
  }
}

export async function loadDataSourcesStore(): Promise<DataSourcesStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const autoSyncOnLaunch = await loadAutoSyncOnLaunch();
    if (!raw) return { ...buildDefaultStore(), autoSyncOnLaunch };
    const parsed = JSON.parse(raw) as Partial<DataSourcesStore>;
    const store = buildDefaultStore();
    // Merge persisted state, backfilling any new sources added since last save
    if (parsed.sources) {
      for (const id of ALL_SOURCE_IDS) {
        if (parsed.sources[id]) {
          store.sources[id] = { ...store.sources[id], ...parsed.sources[id] };
        }
      }
    }
    store.autoSyncOnLaunch = autoSyncOnLaunch;
    return store;
  } catch (_unused) {
    return buildDefaultStore();
  }
}

export async function saveDataSourcesStore(store: DataSourcesStore): Promise<void> {
  try {
    await safeSetItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_unused) {
    // Silently ignore storage errors
  }
}

export async function updateSourceState(
  id: DataSourceId,
  patch: Partial<DataSourceState>
): Promise<void> {
  const store = await loadDataSourcesStore();
  store.sources[id] = { ...store.sources[id], ...patch };
  await saveDataSourcesStore(store);
}
