/**
 * Oura Ring adapter — full OAuth 2.0 + REST API implementation.
 *
 * Flow:
 *   1. connect()  — opens Oura web auth page, captures code, exchanges for tokens
 *   2. sync()     — fetches last 30 days of sleep, heart rate, HRV, SpO2, activity,
 *                   and body temperature from the Oura v2 API; merges into health context
 *
 * Setup:
 *   1. Register an app at cloud.ouraring.com/oauth/applications
 *   2. Add EXPO_PUBLIC_OURA_CLIENT_ID and EXPO_PUBLIC_OURA_CLIENT_SECRET to your .env
 *   3. Set redirect URI to: vitalsync://oauth/oura
 */

import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';
import type {
  PulseRecord,
  SleepRecord,
  VitalSignsRecord,
  ActivityRecord,
} from '@/lib/health/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const OURA_CLIENT_ID = process.env.EXPO_PUBLIC_OURA_CLIENT_ID ?? '';
const OURA_CLIENT_SECRET = process.env.EXPO_PUBLIC_OURA_CLIENT_SECRET ?? '';
const OURA_REDIRECT_URI = 'vitalsync://oauth/oura';
const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
const OURA_SCOPES = 'email personal daily heartrate workout tag session spo2 ring_configuration';

const TOKEN_STORAGE_KEY = '@vitalsync/oura_tokens';

// ─── Token types ──────────────────────────────────────────────────────────────

interface OuraTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
}

// ─── Token storage ────────────────────────────────────────────────────────────

async function saveTokens(tokens: OuraTokens): Promise<void> {
  await secureSetItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

async function loadTokens(): Promise<OuraTokens | null> {
  try {
    const json = await secureGetItem(TOKEN_STORAGE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (_unused) {
    return null;
  }
}

async function clearTokens(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

async function exchangeCodeForTokens(code: string): Promise<OuraTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: OURA_REDIRECT_URI,
    client_id: OURA_CLIENT_ID,
    client_secret: OURA_CLIENT_SECRET,
  });

  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<OuraTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OURA_CLIENT_ID,
    client_secret: OURA_CLIENT_SECRET,
  });

  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** Returns a valid access token, refreshing if needed */
async function getValidAccessToken(storedToken?: string): Promise<string> {
  // Try to load persisted tokens first
  let tokens = await loadTokens();

  // If we have a stored token string from the context (legacy), use it directly
  if (!tokens && storedToken) {
    return storedToken;
  }

  if (!tokens) throw new Error('Not connected to Oura. Please connect first.');

  // Refresh if expired (with 60s buffer)
  if (Date.now() > tokens.expiresAt - 60_000) {
    tokens = await refreshAccessToken(tokens.refreshToken);
    await saveTokens(tokens);
  }

  return tokens.accessToken;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function ouraGet(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${OURA_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Oura API ${endpoint} failed (${res.status}): ${text}`);
  }

  return res.json();
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Data mappers ─────────────────────────────────────────────────────────────

function mapOuraSleepToSleepRecord(item: any): SleepRecord {
  const bedtime = item.bedtime_start ?? item.day + 'T22:00:00';
  const wakeTime = item.bedtime_end ?? item.day + 'T06:00:00';
  const totalMinutes = Math.round((item.total_sleep_duration ?? 0) / 60);
  const deepMinutes = Math.round((item.deep_sleep_duration ?? 0) / 60);
  const remMinutes = Math.round((item.rem_sleep_duration ?? 0) / 60);
  const lightMinutes = Math.round((item.light_sleep_duration ?? 0) / 60);
  const awakeMinutes = Math.round((item.awake_time ?? 0) / 60);
  return {
    id: `oura-sleep-${item.id ?? item.day}`,
    date: item.day,
    bedtime,
    wakeTime,
    totalMinutes,
    deepMinutes,
    remMinutes,
    lightMinutes,
    awakeMinutes,
    efficiency: item.efficiency ?? 0,
    source: 'device',
  };
}

function mapOuraHeartRateToPulseRecord(item: any): PulseRecord {
  return {
    id: `oura-hr-${item.timestamp}`,
    timestamp: item.timestamp,
    bpm: item.bpm,
    source: 'device',
  };
}

function mapOuraDailySleepToVitalSigns(item: any): VitalSignsRecord | null {
  // Daily sleep summary contains average HRV (RMSSD) and lowest resting HR
  if (!item.contributors) return null;
  return {
    id: `oura-vitals-${item.day}`,
    timestamp: item.day + 'T00:00:00.000Z',
    heartRate: item.lowest_heart_rate ?? undefined,
    source: 'device',
    deviceName: 'Oura Ring',
  };
}

function mapOuraSpO2ToVitalSigns(item: any): VitalSignsRecord | null {
  // Daily SpO2 average from Oura
  const avg = item.spo2_percentage?.average;
  if (avg == null) return null;
  return {
    id: `oura-spo2-${item.day}`,
    timestamp: item.day + 'T00:00:00.000Z',
    oxygenSaturation: avg,
    source: 'device',
    deviceName: 'Oura Ring',
  };
}

function mapOuraBodyTempToVitalSigns(item: any): VitalSignsRecord | null {
  // Body temperature deviation from baseline (°C), convert to °F
  const deviation = item.temperature_deviation ?? item.temperature_delta;
  if (deviation == null) return null;
  // Oura reports deviation from baseline (~37°C), so absolute ≈ 37 + deviation
  const tempC = 37.0 + deviation;
  const tempF = tempC * 9 / 5 + 32;
  return {
    id: `oura-temp-${item.day}`,
    timestamp: item.day + 'T00:00:00.000Z',
    temperature: Math.round(tempF * 10) / 10,
    source: 'device',
    deviceName: 'Oura Ring',
  };
}

function mapOuraWorkoutToActivity(item: any): ActivityRecord {
  const typeMap: Record<string, ActivityRecord['type']> = {
    running: 'outdoor-run',
    walking: 'walk',
    cycling: 'cycling',
    workout: 'workout',
  };
  const type = typeMap[item.activity?.toLowerCase?.()] ?? 'workout';
  return {
    id: `oura-workout-${item.id ?? item.start_datetime}`,
    timestamp: item.start_datetime,
    type,
    durationMinutes: Math.round((item.duration ?? 0) / 60),
    caloriesBurned: item.calories,
    avgHeartRate: item.average_heart_rate,
    maxHeartRate: item.max_heart_rate,
    source: 'healthkit',
  };
}

// ─── Merge callback ───────────────────────────────────────────────────────────

type OuraMergeCallback = (data: {
  pulse: PulseRecord[];
  sleep: SleepRecord[];
  vitalSigns: VitalSignsRecord[];
  activity: ActivityRecord[];
}) => void;

let _mergeCallback: OuraMergeCallback | null = null;

export function setOuraMergeCallback(cb: OuraMergeCallback): void {
  _mergeCallback = cb;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

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

const ouraAdapter: Adapter = {
  async connect(): Promise<AdapterResult> {
    if (!OURA_CLIENT_ID) {
      return {
        success: false,
        error:
          'Oura integration requires an API key. Go to cloud.ouraring.com/oauth/applications to create one, then add EXPO_PUBLIC_OURA_CLIENT_ID and EXPO_PUBLIC_OURA_CLIENT_SECRET to your environment.',
      };
    }

    try {
      const state = Math.random().toString(36).slice(2);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: OURA_CLIENT_ID,
        redirect_uri: OURA_REDIRECT_URI,
        scope: OURA_SCOPES,
        state,
      });

      const authUrl = `${OURA_AUTH_URL}?${params.toString()}`;

      if (Platform.OS === 'web') {
        await Linking.openURL(authUrl);
        return { success: false, error: 'Complete the Oura login in the browser tab that opened.' };
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, OURA_REDIRECT_URI);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (returnedState !== state) {
          return { success: false, error: 'OAuth state mismatch. Please try again.' };
        }

        if (code) {
          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code);
          await saveTokens(tokens);

          // Fetch user info for account label
          let accountLabel = 'Oura Account';
          try {
            const userRes = await fetch('https://api.ouraring.com/v2/usercollection/personal_info', {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (userRes.ok) {
              const user = await userRes.json();
              if (user.email) accountLabel = user.email;
            }
          } catch (_unused) {}

          return {
            success: true,
            accessToken: tokens.accessToken,
            accountLabel,
          };
        }
      }

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { success: false, error: 'Authorization cancelled.' };
      }

      return { success: false, error: 'Authorization failed. Please try again.' };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Could not open Oura authorization.' };
    }
  },

  async disconnect(): Promise<void> {
    await clearTokens();
    // Oura does not have a token revocation endpoint in v2
  },

  async sync(storedToken?: string): Promise<void> {
    const token = await getValidAccessToken(storedToken);
    const since = isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const today = isoDate(new Date());

    const dateParams = { start_date: since, end_date: today };

    // Fetch all endpoints in parallel — non-fatal if individual endpoints fail
    const [sleepData, hrData, dailySleepData, spO2Data, bodyTempData, workoutData] =
      await Promise.allSettled([
        ouraGet('sleep', token, dateParams),
        ouraGet('heartrate', token, { start_datetime: `${since}T00:00:00`, end_datetime: `${today}T23:59:59` }),
        ouraGet('daily_sleep', token, dateParams),
        ouraGet('daily_spo2', token, dateParams),
        ouraGet('daily_readiness', token, dateParams), // contains body temp deviation
        ouraGet('workout', token, dateParams),
      ]);

    const sleep: SleepRecord[] = sleepData.status === 'fulfilled'
      ? (sleepData.value.data ?? []).map(mapOuraSleepToSleepRecord)
      : [];

    const pulse: PulseRecord[] = hrData.status === 'fulfilled'
      ? (hrData.value.data ?? []).map(mapOuraHeartRateToPulseRecord)
      : [];

    const vitalSigns: VitalSignsRecord[] = [
      ...(dailySleepData.status === 'fulfilled'
        ? (dailySleepData.value.data ?? []).map(mapOuraDailySleepToVitalSigns).filter(Boolean) as VitalSignsRecord[]
        : []),
      ...(spO2Data.status === 'fulfilled'
        ? (spO2Data.value.data ?? []).map(mapOuraSpO2ToVitalSigns).filter(Boolean) as VitalSignsRecord[]
        : []),
      ...(bodyTempData.status === 'fulfilled'
        ? (bodyTempData.value.data ?? []).map(mapOuraBodyTempToVitalSigns).filter(Boolean) as VitalSignsRecord[]
        : []),
    ];

    const activity: ActivityRecord[] = workoutData.status === 'fulfilled'
      ? (workoutData.value.data ?? []).map(mapOuraWorkoutToActivity)
      : [];

    if (_mergeCallback) {
      _mergeCallback({ pulse, sleep, vitalSigns, activity });
    }
  },
};

export default ouraAdapter;
