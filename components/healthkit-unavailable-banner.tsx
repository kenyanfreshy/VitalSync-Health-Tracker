/**
 * HealthKitUnavailableBanner
 *
 * Shown on the Dashboard when isHealthDataAvailable() returns false — i.e. the
 * app is running on the iOS Simulator, on Android, on web, or on a device where
 * the HealthKit entitlement is missing from the provisioning profile.
 *
 * The banner is shown once per install. After the user taps "Got it" the
 * dismissal is persisted to AsyncStorage and the banner never reappears.
 *
 * It does NOT appear when:
 *   - HealthKit is available (real device with entitlement)
 *   - The user has already dismissed it
 *   - Platform.OS !== 'ios' (Android / web have their own data-source flows)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isHealthKitAvailable } from '@/lib/health/permissions';
import {
  isHKUnavailableBannerDismissed,
  markHKUnavailableBannerDismissed,
} from '@/lib/health/hk-unavailable-banner-tracker';

// Re-export so consumers can import from either location
export { isHKUnavailableBannerDismissed, markHKUnavailableBannerDismissed };

interface HealthKitUnavailableBannerProps {
  /** Whether HealthKit permissions have already been granted (banner hidden if true). */
  permissionsGranted: boolean;
}

export function HealthKitUnavailableBanner({
  permissionsGranted,
}: HealthKitUnavailableBannerProps) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    // Only relevant on iOS
    if (Platform.OS !== 'ios') return;
    // If permissions are already granted, HealthKit is working — no need for banner
    if (permissionsGranted) return;

    let cancelled = false;
    (async () => {
      const [available, dismissed] = await Promise.all([
        isHealthKitAvailable(),
        isHKUnavailableBannerDismissed(),
      ]);
      if (cancelled) return;
      // Show banner only when HealthKit is NOT available and not yet dismissed
      if (!available && !dismissed) {
        setVisible(true);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsGranted]);

  function handleDismiss() {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      markHKUnavailableBannerDismissed();
    });
  }

  if (!visible) return null;

  const isDark = colors.background === '#151718' || (colors.background as string).startsWith('#0');
  const bannerBg = isDark ? '#1A1A2E' : '#FFF7ED';
  const bannerBorder = isDark ? '#F59E0B40' : '#F59E0B50';
  const iconBg = '#F59E0B20';
  const iconColor = '#F59E0B';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bannerBg,
          borderColor: bannerBorder,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="HealthKit unavailable on this device"
    >
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <IconSymbol name="exclamationmark.triangle.fill" size={20} color={iconColor} />
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Apple Health Not Available
        </Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          {Platform.OS === 'ios'
            ? 'HealthKit is not available on this device. This typically means the app is running in the iOS Simulator or the HealthKit entitlement is missing from the build. Data entry and manual sync still work normally.'
            : 'Apple Health is only available on iOS. Use the Data Sources screen to connect a compatible device.'}
        </Text>
      </View>

      {/* Dismiss */}
      <Pressable
        style={({ pressed }) => [styles.dismissBtn, { opacity: pressed ? 0.6 : 1 }]}
        onPress={handleDismiss}
        accessibilityLabel="Dismiss Apple Health unavailable banner"
        accessibilityRole="button"
      >
        <Text style={[styles.dismissText, { color: iconColor }]}>Got it</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
  },
  dismissBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
