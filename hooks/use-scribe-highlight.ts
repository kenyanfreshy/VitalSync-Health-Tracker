/**
 * useScribeHighlight
 *
 * After a successful Smart Scribe result, briefly highlights (red border) any
 * form fields that were NOT filled by the scribe so the user's eye is drawn to
 * what still needs manual entry.
 *
 * Usage:
 *   const { isHighlighted, triggerHighlight, clearHighlight } = useScribeHighlight();
 *
 *   // Call after scribeResult is set and filledCount < totalFields:
 *   triggerHighlight(['systolic', 'diastolic'], { systolic: '', diastolic: '120' });
 *
 *   // In JSX:
 *   <TextInput style={[s.input, isHighlighted('systolic') && SCRIBE_HIGHLIGHT_STYLE]} />
 *
 * Duration is read from the user's Settings > Appearance > Smart Scribe Highlight Duration preference
 * (persisted under AI_FILL_HIGHLIGHT_DURATION_KEY). Defaults to 2000 ms.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

/** New key — consistent with "Smart Scribe Highlight Duration" label in Settings. */
export const AI_FILL_HIGHLIGHT_DURATION_KEY = '@vsht:ai_fill_highlight_duration_ms';

/** @deprecated Legacy key kept for one-time migration. @internal */
const _LEGACY_KEY = '@vsht:scribe_highlight_duration_ms';

/**
 * Backwards-compatible alias so existing imports of SCRIBE_HIGHLIGHT_DURATION_KEY compile.
 * @deprecated Use AI_FILL_HIGHLIGHT_DURATION_KEY instead.
 */
export const SCRIBE_HIGHLIGHT_DURATION_KEY = AI_FILL_HIGHLIGHT_DURATION_KEY;

export const DEFAULT_HIGHLIGHT_DURATION_MS = 2000;

/** One-time migration: copy legacy key value to new key, then remove the old key. */
async function migrateHighlightDurationKey(): Promise<void> {
  try {
    const [newVal, oldVal] = await Promise.all([
      AsyncStorage.getItem(AI_FILL_HIGHLIGHT_DURATION_KEY),
      AsyncStorage.getItem(_LEGACY_KEY),
    ]);
    if (newVal === null && oldVal !== null) {
      await safeSetItem(AI_FILL_HIGHLIGHT_DURATION_KEY, oldVal);
    }
    if (oldVal !== null) {
      await AsyncStorage.removeItem(_LEGACY_KEY);
    }
  } catch {
    // Non-critical
  }
}

export const SCRIBE_HIGHLIGHT_STYLE = {
  borderColor: '#EF4444',
  borderWidth: 2,
} as const;

export function useScribeHighlight() {
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number>(DEFAULT_HIGHLIGHT_DURATION_MS);

  // Migrate legacy key and load the user's preferred highlight duration once on mount
  useEffect(() => {
    migrateHighlightDurationKey().then(() => {
      AsyncStorage.getItem(AI_FILL_HIGHLIGHT_DURATION_KEY)
        .then((v) => {
          const n = Number(v);
          if (n === 1000 || n === 2000 || n === 5000) durationRef.current = n;
        })
        .catch(() => {});
    });
  }, []);

  /**
   * Trigger highlight for fields whose values are empty/falsy.
   *
   * @param fieldKeys  All field keys to check (e.g. ['systolic', 'diastolic', 'heartRate'])
   * @param values     Current form values keyed by field name
   */
  const triggerHighlight = useCallback(
    (fieldKeys: string[], values: Record<string, string | number | null | undefined>) => {
      const empty = new Set(fieldKeys.filter(k => !values[k] && values[k] !== 0));
      if (empty.size === 0) return; // all fields filled — nothing to highlight

      setHighlighted(empty);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setHighlighted(new Set());
        timerRef.current = null;
      }, durationRef.current);
    },
    [],
  );

  /** Returns true if the given field key should currently show the highlight border */
  const isHighlighted = useCallback(
    (fieldKey: string) => highlighted.has(fieldKey),
    [highlighted],
  );

  /** Clear all highlights immediately (e.g. when the form is reset) */
  const clearHighlight = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHighlighted(new Set());
  }, []);

  return { isHighlighted, triggerHighlight, clearHighlight };
}
