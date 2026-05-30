/**
 * HealthKitToast
 *
 * A lightweight, self-dismissing banner that appears at the top of the screen
 * after a successful HealthKit write-back. iOS only — renders null on Android/web.
 *
 * Usage:
 *   1. Mount <HealthKitToastProvider> once near the root (inside ThemeProvider).
 *   2. Call showHealthKitToast() from any save handler after a successful write.
 *
 * Example:
 *   import { showHealthKitToast } from '@/components/healthkit-toast';
 *   saveWeightToHealthKit(record)
 *     .then(() => showHealthKitToast())
 *     .catch(() => {});
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks';

// ─── Context ──────────────────────────────────────────────────────────────────

type ShowToastFn = (message?: string) => void;

const ToastContext = createContext<ShowToastFn>(() => {});

// Module-level reference so showHealthKitToast() can be called outside React
let _showToast: ShowToastFn = () => {};
let _showToastAllPlatforms: ShowToastFn = () => {};

/**
 * Call this from any save handler to show the HealthKit confirmation banner.
 * Safe to call on Android/web — it no-ops silently.
 */
export function showHealthKitToast(message?: string): void {
  _showToast(message);
}

/**
 * Show a success toast on ALL platforms (iOS, Android, web).
 * Use for non-HealthKit confirmations like settings changes.
 */
export function showAppToast(message: string): void {
  _showToastAllPlatforms(message);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function HealthKitToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('Saved to Apple Health ✓');
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const showAllPlatforms = useCallback((msg?: string) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setMessage(msg ?? 'Done ✓');
    setVisible(true);
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => { setVisible(false); });
    dismissTimer.current = setTimeout(() => { setVisible(false); }, 2600);
  }, [opacity]);
  const show = useCallback((msg?: string) => {
    if (Platform.OS !== 'ios') return;

    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    setMessage(msg ?? 'Saved to Apple Health ✓');
    setVisible(true);
    opacity.setValue(0);

    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
    });

    dismissTimer.current = setTimeout(() => {
      setVisible(false);
    }, 2600);
  }, [opacity]);

  // Wire module-level functions to this instance
  React.useEffect(() => {
    _showToast = show;
    _showToastAllPlatforms = showAllPlatforms;
    return () => {
      _showToast = () => {};
      _showToastAllPlatforms = () => {};
    };
  }, [show, showAllPlatforms]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.container,
            {
              top: insets.top + 8,
              opacity,
              backgroundColor: colors.surface,
              borderColor: colors.success,
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={[styles.text, { color: colors.foreground }]}>
              {message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHealthKitToast(): ShowToastFn {
  return useContext(ToastContext);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 9999,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
