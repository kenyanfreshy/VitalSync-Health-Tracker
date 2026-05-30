/**
 * Data Sources Context
 *
 * Manages connection state for all external health data sources.
 * Actual data ingestion is handled by per-source adapters in ./adapters/.
 */

import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { Platform } from 'react-native';
import {
  type DataSourceId,
  type DataSourceState,
  type DataSourcesStore,
  ALL_SOURCE_IDS,
} from './types';
import {
  loadDataSourcesStore,
  saveDataSourcesStore,
  saveAutoSyncOnLaunch,
  buildDefaultStore,
} from './storage';

// ─── State ────────────────────────────────────────────────────────────────────

type Action =
  | { type: 'INIT'; payload: DataSourcesStore }
  | { type: 'SET_STATUS'; id: DataSourceId; status: DataSourceState['status']; extra?: Partial<DataSourceState> }
  | { type: 'DISCONNECT'; id: DataSourceId }
  | { type: 'SYNC_COMPLETE'; id: DataSourceId; lastSyncedAt: string }
  | { type: 'SYNC_ERROR'; id: DataSourceId; message: string }
  | { type: 'TOGGLE_AUTO_SYNC'; enabled: boolean };

function reducer(state: DataSourcesStore, action: Action): DataSourcesStore {
  switch (action.type) {
    case 'INIT':
      return action.payload;
    case 'SET_STATUS': {
      const updated = {
        ...state,
        sources: {
          ...state.sources,
          [action.id]: {
            ...state.sources[action.id],
            status: action.status,
            errorMessage: null,
            ...(action.extra ?? {}),
          },
        },
      };
      return updated;
    }
    case 'DISCONNECT': {
      return {
        ...state,
        sources: {
          ...state.sources,
          [action.id]: {
            ...state.sources[action.id],
            status: 'disconnected',
            lastSyncedAt: null,
            errorMessage: null,
            accessToken: null,
            accountLabel: null,
          },
        },
      };
    }
    case 'SYNC_COMPLETE': {
      return {
        ...state,
        sources: {
          ...state.sources,
          [action.id]: {
            ...state.sources[action.id],
            status: 'connected',
            lastSyncedAt: action.lastSyncedAt,
            errorMessage: null,
          },
        },
      };
    }
    case 'SYNC_ERROR': {
      return {
        ...state,
        sources: {
          ...state.sources,
          [action.id]: {
            ...state.sources[action.id],
            status: 'error',
            errorMessage: action.message,
          },
        },
      };
    }
    case 'TOGGLE_AUTO_SYNC':
      return { ...state, autoSyncOnLaunch: action.enabled };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type NativeHealthMergeData = {
  bloodPressure: any[];
  heartRate: any[];
  sleep: any[];
  bodyComposition: any[];
  activity?: any[];
  vitalSigns?: any[];
  /** Blood glucose samples from HealthKit (iOS) or Health Connect (Android) */
  bloodGlucose?: any[];
};

interface DataSourcesContextValue {
  store: DataSourcesStore;
  /** Whether a launch sync is currently in progress */
  isSyncing: boolean;
  /** ISO timestamp of the most recent successful sync across all sources, or null */
  lastGlobalSyncAt: string | null;
  /** Initiate connection for a source (permissions or OAuth) */
  connect: (id: DataSourceId) => Promise<void>;
  /** Disconnect and clear stored credentials */
  disconnect: (id: DataSourceId) => Promise<void>;
  /** Trigger a manual sync for a connected source */
  sync: (id: DataSourceId) => Promise<void>;
  /** Sync all currently connected sources in parallel */
  syncAllConnected: () => Promise<void>;
  /** Toggle auto-sync on launch preference */
  toggleAutoSync: (enabled: boolean) => Promise<void>;
  /** Whether a source is available on the current platform */
  isAvailable: (id: DataSourceId) => boolean;
  /** Register a callback to receive merged native health data */
  setMergeCallback: (cb: (data: NativeHealthMergeData) => void) => void;
}

const DataSourcesContext = createContext<DataSourcesContextValue | null>(null);

export function useDataSources(): DataSourcesContextValue {
  const ctx = useContext(DataSourcesContext);
  if (!ctx) throw new Error('useDataSources must be used inside DataSourcesProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataSourcesProvider({ children }: { children: React.ReactNode }) {
  const [store, dispatch] = useReducer(reducer, buildDefaultStore());
  const [isSyncing, setIsSyncing] = React.useState(false);
  const mergeCallbackRef = React.useRef<((data: NativeHealthMergeData) => void) | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    loadDataSourcesStore()
      .then((s) => dispatch({ type: 'INIT', payload: s }))
      .catch((e) => {
        console.warn('[VitalSync] DataSourcesProvider failed to load store — using defaults:', e);
        // buildDefaultStore() is synchronous and always safe
        dispatch({ type: 'INIT', payload: buildDefaultStore() });
      });
  }, []);

  // Persist on every change
  useEffect(() => {
    saveDataSourcesStore(store);
  }, [store]);

  // Register merge callback for native health adapters
  const setMergeCallback = useCallback((cb: (data: NativeHealthMergeData) => void) => {
    mergeCallbackRef.current = cb;
    // Wire into the native adapters
    if (Platform.OS === 'ios') {
      import('./adapters/healthkit-adapter').then((mod) => {
        if (mod.setHealthKitMergeCallback) mod.setHealthKitMergeCallback(cb);
      }).catch(() => {});
    }
    if (Platform.OS === 'android') {
      import('./adapters/health-connect-adapter').then((mod) => {
        if (mod.setHealthConnectMergeCallback) mod.setHealthConnectMergeCallback(cb);
      }).catch(() => {});
    }
    // Wire into the Oura adapter (cross-platform)
    import('./adapters/oura-adapter').then((mod) => {
      if (mod.setOuraMergeCallback) mod.setOuraMergeCallback(cb as any);
    }).catch(() => {});
  }, []);

  // ── Platform availability ──────────────────────────────────────────────────
  const isAvailable = useCallback((id: DataSourceId): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DATA_SOURCE_META } = require('./types');
    const meta = DATA_SOURCE_META[id];
    if (!meta) return false;
    if (meta.platform === 'cross_platform') return true;
    if (meta.platform === 'both') return true;
    if (meta.platform === 'ios') return Platform.OS === 'ios';
    if (meta.platform === 'android') return Platform.OS === 'android';
    return false;
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async (id: DataSourceId) => {
    dispatch({ type: 'SET_STATUS', id, status: 'connecting' });
    try {
      const adapter = await getAdapter(id);
      const result = await adapter.connect();
      if (result.success) {
        dispatch({
          type: 'SET_STATUS',
          id,
          status: 'connected',
          extra: {
            accessToken: result.accessToken ?? null,
            accountLabel: result.accountLabel ?? null,
            lastSyncedAt: new Date().toISOString(),
          },
        });
      } else {
        dispatch({ type: 'SYNC_ERROR', id, message: result.error ?? 'Connection failed' });
      }
    } catch (e: any) {
      dispatch({ type: 'SYNC_ERROR', id, message: e?.message ?? 'Unknown error' });
    }
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async (id: DataSourceId) => {
    try {
      const adapter = await getAdapter(id);
      await adapter.disconnect?.();
    } catch (_unused) {
      // Best-effort cleanup
    }
    dispatch({ type: 'DISCONNECT', id });
  }, []);

  // ── Sync ──────────────────────────────────────────────────────────────────
  const sync = useCallback(async (id: DataSourceId) => {
    const current = store.sources[id];
    if (current.status !== 'connected') return;
    dispatch({ type: 'SET_STATUS', id, status: 'connecting' }); // reuse "connecting" as "syncing"
    try {
      const adapter = await getAdapter(id);
      await adapter.sync?.(current.accessToken ?? undefined);
      dispatch({ type: 'SYNC_COMPLETE', id, lastSyncedAt: new Date().toISOString() });
    } catch (e: any) {
      dispatch({ type: 'SYNC_ERROR', id, message: e?.message ?? 'Sync failed' });
    }
  }, [store]);

  // ── Sync all connected ────────────────────────────────────────────────────
  const syncAllConnected = useCallback(async () => {
    const connectedIds = ALL_SOURCE_IDS.filter(
      (id) => store.sources[id]?.status === 'connected'
    );
    if (connectedIds.length === 0) return;
    setIsSyncing(true);
    try {
      await Promise.allSettled(connectedIds.map((id) => sync(id)));
    } finally {
      setIsSyncing(false);
    }
  }, [store, sync]);

  // ── Toggle auto-sync ──────────────────────────────────────────────────────
  const toggleAutoSync = useCallback(async (enabled: boolean) => {
    dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
    await saveAutoSyncOnLaunch(enabled);
  }, []);

  // Derive the most recent successful sync timestamp across all sources
  const lastGlobalSyncAt = React.useMemo(() => {
    const times = Object.values(store.sources)
      .map((s) => s.lastSyncedAt)
      .filter((t): t is string => t !== null);
    if (times.length === 0) return null;
    return times.reduce((latest, t) => (t > latest ? t : latest));
  }, [store.sources]);

  const contextValue = React.useMemo(() => ({
    store, isSyncing, lastGlobalSyncAt, connect, disconnect, sync, syncAllConnected, toggleAutoSync, isAvailable, setMergeCallback,
  }), [store, isSyncing, lastGlobalSyncAt, connect, disconnect, sync, syncAllConnected, toggleAutoSync, isAvailable, setMergeCallback]);

  return (
    <DataSourcesContext.Provider value={contextValue}>
      {children}
    </DataSourcesContext.Provider>
  );
}

// ─── Adapter loader ───────────────────────────────────────────────────────────

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

async function getAdapter(id: DataSourceId): Promise<Adapter> {
  switch (id) {
    case 'healthkit':
    case 'apple_watch':
      return (await import('./adapters/healthkit-adapter')).default;
    case 'health_connect':
    case 'wear_os':
      return (await import('./adapters/health-connect-adapter')).default;
    case 'oura':
      return (await import('./adapters/oura-adapter')).default;
    case 'garmin':
      return (await import('./adapters/garmin-adapter')).default;
    default:
      return {
        connect: async () => ({ success: false, error: 'Unknown source' }),
      };
  }
}
