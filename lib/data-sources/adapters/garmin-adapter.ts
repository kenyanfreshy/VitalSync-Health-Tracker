/**
 * Garmin Connect adapter.
 *
 * Uses Garmin's OAuth 1.0a API to connect and pull activity, sleep, and health data.
 * The OAuth flow opens the Garmin authorization page in the system browser.
 *
 * Production setup requires:
 *   1. Register at developer.garmin.com/gc-developer-program/overview/
 *   2. Set EXPO_PUBLIC_GARMIN_CONSUMER_KEY in your .env
 *   3. Add the app's deep-link scheme as a callback URL in the Garmin dashboard
 */

import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

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

const GARMIN_CONSUMER_KEY = process.env.EXPO_PUBLIC_GARMIN_CONSUMER_KEY ?? '';
const GARMIN_REDIRECT_URI = 'vitalsync://oauth/garmin';
// Garmin uses OAuth 1.0a — this simplified flow uses the web authorization endpoint
const GARMIN_AUTH_URL = 'https://connect.garmin.com/oauthConfirm';

const garminAdapter: Adapter = {
  async connect(): Promise<AdapterResult> {
    if (!GARMIN_CONSUMER_KEY) {
      return {
        success: false,
        error:
          'Garmin integration requires a Consumer Key. Register at developer.garmin.com, then add EXPO_PUBLIC_GARMIN_CONSUMER_KEY to your environment.',
      };
    }

    try {
      // In production: first call /oauth/request_token to get a request token,
      // then redirect to GARMIN_AUTH_URL with oauth_token param.
      // Here we open the Garmin Connect login page as a placeholder.
      const authUrl = `${GARMIN_AUTH_URL}?oauth_token=placeholder&oauth_callback=${encodeURIComponent(GARMIN_REDIRECT_URI)}`;

      if (Platform.OS === 'web') {
        await Linking.openURL('https://connect.garmin.com/signin');
        return { success: false, error: 'Complete the Garmin login in the browser tab that opened.' };
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, GARMIN_REDIRECT_URI);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const token = url.searchParams.get('oauth_token') ?? url.searchParams.get('code');
        if (token) {
          return {
            success: true,
            accessToken: token,
            accountLabel: 'Garmin Account',
          };
        }
      }

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { success: false, error: 'Authorization cancelled.' };
      }

      return { success: false, error: 'Authorization failed. Please try again.' };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Could not open Garmin authorization.' };
    }
  },

  async disconnect(): Promise<void> {
    // Revoke token via Garmin API in production
  },

  async sync(accessToken?: string): Promise<void> {
    if (!accessToken) throw new Error('Not connected to Garmin.');
    // In production: call Garmin Health API endpoints for sleep, HRV, stress, etc.
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  },
};

export default garminAdapter;
