/**
 * mergeParsedMedication
 *
 * Safely merges parsed medication fields into the current form state.
 *
 * Modes:
 *  - 'fillEmptyOnly' (default): only fills fields that are currently empty.
 *    Preserves any value the user has already manually entered.
 *  - 'replace': overwrites all fields with the parsed values (used for
 *    "Replace with Scan" / "Replace with Dictation" actions).
 *
 * Safety:
 *  - Skips any parsed value that is not a non-empty string.
 *  - Never mutates the original `current` object.
 *  - Never throws.
 */
export function mergeParsedMedication<T extends Record<string, string>>(
  current: T,
  parsed: Partial<T>,
  mode: 'fillEmptyOnly' | 'replace' = 'fillEmptyOnly'
): T {
  const next = { ...current };

  Object.entries(parsed).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) return;

    const typedKey = key as keyof T;

    if (mode === 'replace') {
      next[typedKey] = value as T[keyof T];
      return;
    }

    // fillEmptyOnly: only write if the current field is blank
    if (!String(next[typedKey] ?? '').trim()) {
      next[typedKey] = value as T[keyof T];
    }
  });

  return next;
}
