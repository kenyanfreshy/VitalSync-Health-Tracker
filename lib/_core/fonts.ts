/**
 * System font constants for VitalSync.
 *
 * On iOS, React Native uses SF Pro by default when no fontFamily is set.
 * On Android, it uses Roboto. On web, we fall back to -apple-system.
 *
 * Usage:
 *   import { SYSTEM_FONT, SYSTEM_FONT_MONO } from '@/lib/_core/fonts';
 *   style={{ fontFamily: SYSTEM_FONT }}
 *
 * Note: For most text, simply omit fontFamily and the platform default
 * (SF Pro on iOS) will be used automatically. Only set this explicitly
 * when you need to override a previously set fontFamily.
 */
import { Platform } from 'react-native';

/** SF Pro on iOS · Roboto on Android · -apple-system on web */
export const SYSTEM_FONT: string | undefined = Platform.select({
  ios: undefined,           // SF Pro is the default — no override needed
  android: 'Roboto',        // Roboto is the default — explicit for clarity
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

/** SF Mono on iOS · monospace on Android · ui-monospace on web */
export const SYSTEM_FONT_MONO: string = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  web: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Courier New", monospace',
  default: 'Courier New',
}) as string;
