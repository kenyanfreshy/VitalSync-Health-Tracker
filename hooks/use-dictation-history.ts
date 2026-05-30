/**
 * useDictationHistory
 * Persists the last 3 dictation phrases for a given form key.
 * Provides a `recentPhrases` array and a `pushPhrase` function.
 *
 * Usage:
 *   const { recentPhrases, pushPhrase } = useDictationHistory('medications');
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const MAX_HISTORY = 3;
const STORAGE_PREFIX = '@vsht:dictation_history:';

export function useDictationHistory(formKey: string) {
  const storageKey = `${STORAGE_PREFIX}${formKey}`;
  const [recentPhrases, setRecentPhrases] = useState<string[]>([]);

  // Load on mount
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecentPhrases(parsed);
        } catch {
          // ignore corrupt data
        }
      }
    });
  }, [storageKey]);

  /**
   * Push a new phrase to the front of the history list.
   * Deduplicates and trims to MAX_HISTORY entries.
   */
  const pushPhrase = useCallback(
    (phrase: string) => {
      const trimmed = phrase.trim();
      if (!trimmed) return;
      setRecentPhrases((prev) => {
        const deduped = [trimmed, ...prev.filter((p) => p !== trimmed)].slice(0, MAX_HISTORY);
        safeSetItem(storageKey, JSON.stringify(deduped)).catch(() => {});
        return deduped;
      });
    },
    [storageKey],
  );

  return { recentPhrases, pushPhrase };
}
