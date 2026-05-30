/**
 * Web stub for react-native-maps.
 * Metro resolves this file on web, and the native shim (index.native.ts)
 * on iOS/Android — so the native-only module is never bundled for web.
 *
 * All exports are null; the activity-detail screen already guards rendering
 * with Platform.OS !== 'web' so these values are never rendered.
 */
import type React from 'react';

export const MapView: React.ComponentType<any> | null = null;
export const Polyline: React.ComponentType<any> | null = null;
export const Marker: React.ComponentType<any> | null = null;
export const Circle: React.ComponentType<any> | null = null;
export const Callout: React.ComponentType<any> | null = null;
// Provider constants — undefined on web (matches react-native-maps PROVIDER_DEFAULT value)
export const PROVIDER_DEFAULT: undefined = undefined;
export const PROVIDER_GOOGLE: string | null = null;
