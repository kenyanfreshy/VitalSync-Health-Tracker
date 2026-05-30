/**
 * Native platform stub for maps — react-native-maps has been removed.
 * All exports are null so existing consumers degrade gracefully to the
 * fallback UI (GPS point count card) without crashing.
 */
import React from "react";

export const MapView: React.ComponentType<any> | null = null;
export const Polyline: React.ComponentType<any> | null = null;
export const Marker: React.ComponentType<any> | null = null;
export const Circle: React.ComponentType<any> | null = null;
export const Callout: React.ComponentType<any> | null = null;
export const PROVIDER_DEFAULT: undefined = undefined;
export const PROVIDER_GOOGLE: string | null = null;
