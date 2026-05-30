/**
 * intelligence.ts
 *
 * Platform-aware intelligence branding utility.
 *
 * Rules:
 *  - iOS  → "Apple Intelligence"
 *  - Android → "Gemini"
 *  - Web/other → "Smart Analysis"
 *
 * Never use the word "AI" in UI-facing strings.
 * Use {{intelligenceName}} as a placeholder in i18n strings.
 */
import { Platform } from 'react-native';

/** Platform-specific intelligence brand name. */
export const intelligenceName: string =
  Platform.OS === 'ios'
    ? 'Apple Intelligence'
    : Platform.OS === 'android'
      ? 'Gemini'
      : 'Smart Analysis';

/**
 * Interpolate {{intelligenceName}} (and other optional vars) in a template string.
 *
 * @example
 *   interpolate('Insights powered by {{intelligenceName}}')
 *   // iOS  → "Insights powered by Apple Intelligence"
 *   // Android → "Insights powered by Gemini"
 */
export function interpolate(
  template: string,
  vars?: Record<string, string>,
): string {
  let result = template.replace(/\{\{intelligenceName\}\}/g, intelligenceName);
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }
  return result;
}
