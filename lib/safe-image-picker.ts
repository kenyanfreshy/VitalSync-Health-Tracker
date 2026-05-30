/**
 * safe-image-picker.ts
 *
 * A defensive wrapper around expo-image-picker that prevents the app from
 * crashing when the native module is unavailable (e.g. a binary built before
 * the expo-image-picker plugin was registered in app.config.ts).
 *
 * All functions return a typed result so call-sites require no changes other
 * than importing from this module instead of 'expo-image-picker' directly.
 */

import { Platform } from 'react-native';

// Attempt to load the native module at import time.
// If it fails (missing Info.plist permission strings on old binary), we catch
// the error and export no-op stubs so the rest of the app can still launch.
let ImagePicker: typeof import('expo-image-picker') | null = null;
let loadError: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
} catch (e) {
  loadError = e instanceof Error ? e.message : String(e);
  if (__DEV__) {
    console.warn('[safe-image-picker] expo-image-picker failed to load:', loadError);
    console.warn('[safe-image-picker] Camera/photo picker will be disabled. Rebuild the app with the expo-image-picker plugin registered in app.config.ts to fix this.');
  }
}

export type PickerResult = {
  canceled: boolean;
  assets?: { uri: string; base64?: string | null; mimeType?: string | null }[] | null;
};

export type PermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
};

/** Returns true if the native module loaded successfully and is usable. */
export function isImagePickerAvailable(): boolean {
  return ImagePicker !== null;
}

/** Returns the load error message if the module failed to initialise. */
export function getImagePickerError(): string | null {
  return loadError;
}

export async function requestCameraPermissionsAsync(): Promise<PermissionResult> {
  if (!ImagePicker) return { granted: false, canAskAgain: false };
  try {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    return { granted: result.granted, canAskAgain: result.canAskAgain };
  } catch (e) {
    if (__DEV__) console.warn('[safe-image-picker] requestCameraPermissionsAsync error:', e);
    return { granted: false, canAskAgain: false };
  }
}

export async function requestMediaLibraryPermissionsAsync(): Promise<PermissionResult> {
  if (!ImagePicker) return { granted: false, canAskAgain: false };
  try {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return { granted: result.granted, canAskAgain: result.canAskAgain };
  } catch (e) {
    if (__DEV__) console.warn('[safe-image-picker] requestMediaLibraryPermissionsAsync error:', e);
    return { granted: false, canAskAgain: false };
  }
}

export async function launchCameraAsync(
  options?: import('expo-image-picker').ImagePickerOptions,
): Promise<PickerResult> {
  if (!ImagePicker) return { canceled: true };
  // Camera is not available on web
  if (Platform.OS === 'web') return { canceled: true };
  try {
    const result = await ImagePicker.launchCameraAsync(options);
    return result;
  } catch (e) {
    if (__DEV__) console.warn('[safe-image-picker] launchCameraAsync error:', e);
    return { canceled: true };
  }
}

export async function launchImageLibraryAsync(
  options?: import('expo-image-picker').ImagePickerOptions,
): Promise<PickerResult> {
  if (!ImagePicker) return { canceled: true };
  try {
    const result = await ImagePicker.launchImageLibraryAsync(options);
    return result;
  } catch (e) {
    if (__DEV__) console.warn('[safe-image-picker] launchImageLibraryAsync error:', e);
    return { canceled: true };
  }
}
