/**
 * report-lang-utils.ts
 *
 * Pure utility functions for report language resolution.
 * Extracted from app/(tabs)/report.tsx so they can be unit-tested
 * without mounting the React component.
 *
 * REGRESSION GUARD: Do not inline these back into report.tsx.
 * The overrideLang behaviour (used by the Preview modal Share PDF button)
 * depends on resolveReportLang correctly preferring overrideLang over
 * the global reportLang.  See tests/report-lang-utils.test.ts.
 */

import { reportStrings } from '@/lib/i18n';
import { DEFAULT_REPORT_LABELS } from '@/lib/health/report-generator';

// Build the default labels map once at module load time.
// Keys are the string keys of DEFAULT_REPORT_LABELS whose values are strings.
export const DEFAULT_REPORT_LABELS_MAP: Partial<typeof DEFAULT_REPORT_LABELS> =
  Object.fromEntries(
    Object.entries(reportStrings.en).filter(([, v]) => typeof v === 'string'),
  ) as Partial<typeof DEFAULT_REPORT_LABELS>;

/**
 * Resolve the effective report language.
 *
 * @param overrideLang - Optional language code from the Preview modal selector.
 * @param globalLang   - The user's global report language setting.
 * @returns The language code that should be used for the current PDF operation.
 *
 * Contract: overrideLang takes precedence over globalLang when provided.
 */
export function resolveReportLang(
  overrideLang: string | undefined,
  globalLang: string,
): string {
  return overrideLang ?? globalLang;
}

/**
 * Look up the reportStrings entry for a given language code.
 * Returns undefined for English (caller uses DEFAULT_REPORT_LABELS directly).
 * Normalises fr-ca → fr and zh-tw → zh.
 */
export function getReportLabels(
  lang: string,
): Partial<typeof DEFAULT_REPORT_LABELS> | undefined {
  if (lang === 'en') return undefined;
  const key = lang === 'fr-ca' ? 'fr' : lang === 'zh-tw' ? 'zh' : lang;
  return (
    (reportStrings as unknown as Record<string, Partial<typeof DEFAULT_REPORT_LABELS>>)[key] ??
    undefined
  );
}
