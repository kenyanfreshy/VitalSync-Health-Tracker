/**
 * MapAppPicker
 * Bottom sheet that lets the user open Apple Maps, Google Maps, or Garmin Connect
 * for activity tracking. Uses Linking.openURL with deep-link schemes.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Linking,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { useColors } from '@/hooks';
import type { ActivityType } from '@/lib/health/types';

interface MapApp {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Returns the deep-link URL for the given activity type */
  getUrl: (type: ActivityType) => string;
  /** URL scheme to check availability (iOS canOpenURL) */
  scheme: string;
  /** Whether this app is always available (Apple Maps on iOS) */
  alwaysAvailable?: boolean;
}

const MAP_APPS: MapApp[] = [
  {
    id: 'apple-maps',
    name: 'Apple Maps',
    icon: '🍎',
    description: 'Open in Apple Maps for walking & running directions',
    scheme: 'maps://',
    alwaysAvailable: Platform.OS === 'ios',
    getUrl: (_type: ActivityType) => {
      // Apple Maps workout deep-link (opens Workout app via x-apple-health)
      // Fallback: open Apple Maps in walking directions mode
      if (Platform.OS === 'ios') {
        return 'x-apple-health://';
      }
      return 'maps://';
    },
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    icon: '🗺️',
    description: 'Track your route with Google Maps navigation',
    scheme: 'comgooglemaps://',
    getUrl: (type: ActivityType) => {
      const mode = type === 'cycling' ? 'bicycling' : 'walking';
      // Google Maps deep-link: open in the chosen travel mode
      return `comgooglemaps://?directionsmode=${mode}`;
    },
  },
  {
    id: 'garmin',
    name: 'Garmin Connect',
    icon: '⌚',
    description: 'Start a tracked activity in Garmin Connect',
    scheme: 'gcm://',
    getUrl: (type: ActivityType) => {
      // Garmin Connect IQ deep-link to start activity
      const activityMap: Record<ActivityType, string> = {
        'outdoor-run': 'running',
        'indoor-run': 'treadmill',
        walk: 'walking',
        cycling: 'cycling',
        workout: 'strength',
      };
      return `gcm://start-activity?type=${activityMap[type] ?? 'running'}`;
    },
  },
  {
    id: 'strava',
    name: 'Strava',
    icon: '🏅',
    description: 'Record your activity with Strava GPS tracking',
    scheme: 'strava://',
    getUrl: (type: ActivityType) => {
      const activityMap: Record<ActivityType, string> = {
        'outdoor-run': 'run',
        'indoor-run': 'run',
        walk: 'walk',
        cycling: 'ride',
        workout: 'workout',
      };
      return `strava://record?activity_type=${activityMap[type] ?? 'run'}`;
    },
  },
];

interface MapAppPickerProps {
  visible: boolean;
  activityType: ActivityType;
  onClose: () => void;
}

export function MapAppPicker({ visible, activityType, onClose }: MapAppPickerProps) {
  const colors = useColors();

  const handleOpen = useCallback(async (app: MapApp) => {
    const url = app.getUrl(activityType);

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen || app.alwaysAvailable) {
        await Linking.openURL(url);
        onClose();
      } else {
        // App not installed — offer to open App Store / Play Store
        const storeUrls: Record<string, string> = {
          'google-maps': Platform.OS === 'ios'
            ? 'https://apps.apple.com/app/google-maps/id585027354'
            : 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps',
          garmin: Platform.OS === 'ios'
            ? 'https://apps.apple.com/app/garmin-connect/id583446403'
            : 'https://play.google.com/store/apps/details?id=com.garmin.android.apps.connectmobile',
          strava: Platform.OS === 'ios'
            ? 'https://apps.apple.com/app/strava/id426826309'
            : 'https://play.google.com/store/apps/details?id=com.strava',
        };
        const storeUrl = storeUrls[app.id];
        if (storeUrl) {
          Alert.alert(
            `${app.name} Not Installed`,
            `Would you like to download ${app.name}?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Download', onPress: () => Linking.openURL(storeUrl) },
            ]
          );
        } else {
          Alert.alert('Not Available', `${app.name} is not available on this device.`);
        }
      }
    } catch (_unused) {
      Alert.alert('Error', `Could not open ${app.name}. Please try another app.`);
    }
  }, [activityType, onClose]);

  const activityLabel: Record<ActivityType, string> = {
    'outdoor-run': 'Outdoor Run',
    'indoor-run': 'Indoor Run',
    walk: 'Walk',
    cycling: 'Cycling',
    workout: 'Workout',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.foreground }]}>
          Track {activityLabel[activityType]}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Choose an app to record your route and stats
        </Text>

        <View style={styles.appList}>
          {MAP_APPS.map((app) => (
            <Pressable
              key={app.id}
              onPress={() => handleOpen(app)}
              style={({ pressed }) => [
                styles.appRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={styles.appIcon}>{app.icon}</Text>
              <View style={styles.appInfo}>
                <Text style={[styles.appName, { color: colors.foreground }]}>{app.name}</Text>
                <Text style={[styles.appDesc, { color: colors.muted }]}>{app.description}</Text>
              </View>
              <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.hint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.hintText, { color: colors.muted }]}>
            After your activity, return to VitalSync and log your results manually below.
          </Text>
        </View>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  appList: {
    gap: 10,
    marginBottom: 16,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    gap: 12,
  },
  appIcon: {
    fontSize: 28,
    width: 40,
    textAlign: 'center',
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  appDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  hint: {
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 12,
    marginBottom: 14,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  cancelBtn: {
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
