/**
 * Data Sources — shared types for all external health data integrations.
 */

export type DataSourceId =
  | 'healthkit'
  | 'apple_watch'
  | 'health_connect'
  | 'wear_os'
  | 'oura'
  | 'garmin';

export type DataSourcePlatform = 'ios' | 'android' | 'both' | 'cross_platform';

export type ConnectionStatus =
  | 'disconnected'   // never connected
  | 'connecting'     // in-progress OAuth / permission request
  | 'connected'      // active and syncing
  | 'error'          // last sync failed
  | 'unavailable';   // not supported on this platform

export interface DataSourceMeta {
  id: DataSourceId;
  name: string;
  subtitle: string;
  /** SF Symbol name for iOS, Material icon name for Android/web */
  iconName: string;
  accentColor: string;
  platform: DataSourcePlatform;
  /** Whether this source requires an OAuth flow (Oura, Garmin) */
  requiresOAuth: boolean;
  /** Data types this source can provide */
  dataTypes: string[];
}

export interface DataSourceState {
  id: DataSourceId;
  status: ConnectionStatus;
  lastSyncedAt: string | null;   // ISO date string
  errorMessage: string | null;
  /** For OAuth sources: stored access token (opaque) */
  accessToken: string | null;
  /** User-visible account label (e.g., email for Oura/Garmin) */
  accountLabel: string | null;
}

export interface DataSourcesStore {
  sources: Record<DataSourceId, DataSourceState>;
  /** Whether to automatically sync all connected sources on app launch */
  autoSyncOnLaunch: boolean;
}

// ─── Static metadata for all supported sources ────────────────────────────────

export const DATA_SOURCE_META: Record<DataSourceId, DataSourceMeta> = {
  healthkit: {
    id: 'healthkit',
    name: 'Apple Health',
    subtitle: 'HealthKit · iPhone & iPad',
    iconName: 'heart.text.square.fill',
    accentColor: '#FF2D55',
    platform: 'ios',
    requiresOAuth: false,
    dataTypes: ['Blood Pressure', 'Heart Rate', 'HRV', 'Sleep', 'Weight', 'Body Fat', 'Steps'],
  },
  apple_watch: {
    id: 'apple_watch',
    name: 'Apple Watch',
    subtitle: 'Syncs via HealthKit',
    iconName: 'applewatch',
    accentColor: '#1C1C1E',
    platform: 'ios',
    requiresOAuth: false,
    dataTypes: ['Heart Rate', 'HRV', 'Blood Oxygen', 'Activity', 'Sleep'],
  },
  health_connect: {
    id: 'health_connect',
    name: 'Health Connect',
    subtitle: 'Android Health Platform',
    iconName: 'health_and_safety',
    accentColor: '#4285F4',
    platform: 'android',
    requiresOAuth: false,
    dataTypes: ['Blood Pressure', 'Heart Rate', 'Sleep', 'Weight', 'Steps', 'Blood Glucose'],
  },
  wear_os: {
    id: 'wear_os',
    name: 'Wear OS',
    subtitle: 'Syncs via Health Connect',
    iconName: 'watch',
    accentColor: '#4285F4',
    platform: 'android',
    requiresOAuth: false,
    dataTypes: ['Heart Rate', 'Steps', 'Sleep', 'Blood Oxygen'],
  },
  oura: {
    id: 'oura',
    name: 'Oura Ring',
    subtitle: 'Sleep · HRV · Readiness',
    iconName: 'circle.hexagongrid.fill',
    accentColor: '#B8860B',
    platform: 'cross_platform',
    requiresOAuth: true,
    dataTypes: ['Sleep', 'HRV', 'Heart Rate', 'Body Temperature', 'Readiness Score', 'Activity'],
  },
  garmin: {
    id: 'garmin',
    name: 'Garmin Connect',
    subtitle: 'GPS · Fitness · Health',
    iconName: 'location.circle.fill',
    accentColor: '#007CC3',
    platform: 'cross_platform',
    requiresOAuth: true,
    dataTypes: ['Heart Rate', 'HRV', 'Sleep', 'Steps', 'VO2 Max', 'Stress', 'Body Battery'],
  },
};

export const ALL_SOURCE_IDS: DataSourceId[] = [
  'healthkit',
  'apple_watch',
  'health_connect',
  'wear_os',
  'oura',
  'garmin',
];
