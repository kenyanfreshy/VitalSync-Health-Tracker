import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { safeSetItem } from '@/lib/safe-async-storage';

const KEY = '@vitalsync/celebration_sounds_enabled';

export function useCelebrationSounds() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((val) => {
      if (val !== null) setEnabled(val === 'true');
      setLoaded(true);
    });
  }, []);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    await safeSetItem(KEY, String(next));
  }, [enabled]);

  return { enabled, loaded, toggle };
}
