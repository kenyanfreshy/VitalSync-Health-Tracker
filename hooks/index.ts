/**
 * hooks/index.ts — Barrel export for all centralised string hooks.
 *
 * Import any string hook from a single entry point:
 *
 * ```tsx
 * import { useFoodCameraStrings, useDashboardStrings } from '@/hooks';
 * ```
 *
 * instead of knowing the individual hook file paths.
 */

// ── Theme / colour hooks ─────────────────────────────────────────────────────
export { useColors } from './use-colors';
export { useColorScheme } from './use-color-scheme';

// ── Language hooks ────────────────────────────────────────────────────────────
export { useLang, useRawLang } from './use-lang';

// ── String table hooks ────────────────────────────────────────────────────────
export { useFoodCameraStrings, type FoodCameraStrings } from './use-food-camera-strings';
export { useDashboardStrings, type DashboardStrings } from './use-dashboard-strings';
export { useCorrelationStrings, type CorrelationStrings } from './use-correlation-strings';
export { useRecordsStrings, type RecordsStrings } from './use-records-strings';
export { useReportStrings, type ReportStrings } from './use-report-strings';
export { useDictationBoxStrings, type DictationBoxStrings } from './use-dictation-box-strings';
export { useLogAllVitalsStrings, type LogAllVitalsStrings } from './use-log-all-vitals-strings';
export { useAboutStrings, type AboutStrings } from './use-about-strings';
export { useWeatherStrings, type WeatherStrings } from './use-weather-strings';
export { useDietDescStrings, type DietDescStrings } from './use-diet-desc-strings';
export { useRTL, useRTLStyles } from './use-rtl';
