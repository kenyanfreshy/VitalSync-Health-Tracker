/**
 * HealthKit Permission Status Screen
 *
 * Shows the authorization status of every HealthKit data type VitalSync
 * requests. Each row displays:
 *   - A category icon (tinted in the domain colour)
 *   - The data type name and category label
 *   - A green t.authorized / amber t.notDetermined / red t.denied badge
 *
 * Buttons:
 *   - t.requestPermissions — calls requestAuthorization again (iOS only
 *     shows the sheet for types that are still notDetermined; already-denied
 *     types require the user to go to Settings manually)
 *   - t.openHealthApp — deep-links to x-apple-health://
 *   - t.openAppSettings — deep-links to app-settings: so the user can
 *     toggle individual categories in iOS Settings → Privacy → Health
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { hkPermStrings } from '@/lib/i18n';
import { useColors, useLang } from '@/hooks';
import {
  Alert,
  Animated,
  AppState,
  type AppStateStatus,
  LayoutAnimation,
  Linking,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { FloatingWellnessDisclaimer } from '@/components/floating-wellness-disclaimer';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isRNHAvailable, initAppleHealthKit } from '@/lib/health/rnh-loader';
import { useHealth } from '@/lib/health/health-context';
import { showHealthKitToast } from '@/components/healthkit-toast';
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthStatus = 'authorized' | 'denied' | 'notDetermined' | 'unavailable';

interface PermissionItem {
  /** HKQuantityType / HKCategoryType identifier string */
  hkIdentifier: string;
  /** Display label */
  label: string;
  /** Grouping category */
  category: string;
  /** SF Symbol icon name */
  icon: string;
  /** Tint colour token key from useColors() */
  colorKey: string;
  /** Whether this type is read-only (no write-back) */
  readOnly?: boolean;
}

// ─── Permission manifest ──────────────────────────────────────────────────────

const PERMISSION_ITEMS: PermissionItem[] = [
  // Cardiovascular
  {
    hkIdentifier: 'HKCorrelationTypeIdentifierBloodPressure',
    label: 'permBloodPressure',
    category: 'catCardiovascular',
    icon: 'heart.fill',
    colorKey: 'bpGreen',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierHeartRate',
    label: 'permHeartRate',
    category: 'catCardiovascular',
    icon: 'heart.fill',
    colorKey: 'heartRed',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierRestingHeartRate',
    label: 'permRestingHeartRate',
    category: 'catCardiovascular',
    icon: 'heart.fill',
    colorKey: 'heartRed',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    label: 'permHRV',
    category: 'catCardiovascular',
    icon: 'waveform.path.ecg',
    colorKey: 'heartRed',
  },
  {
    hkIdentifier: 'HKAppleElectrocardiogramType',
    label: 'permEKG',
    category: 'catCardiovascular',
    icon: 'waveform.path.ecg.rectangle',
    colorKey: 'heartRed',
    readOnly: true,
  },
  // Respiratory & Vitals
  {
    hkIdentifier: 'HKQuantityTypeIdentifierOxygenSaturation',
    label: 'permBloodOxygen',
    category: 'catRespiratory',
    icon: 'lungs.fill',
    colorKey: 'spo2Blue',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierRespiratoryRate',
    label: 'permRespiratoryRate',
    category: 'catRespiratory',
    icon: 'lungs.fill',
    colorKey: 'spo2Blue',
    readOnly: true,
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierBodyTemperature',
    label: 'permBodyTemperature',
    category: 'catVitals',
    icon: 'thermometer.medium',
    colorKey: 'tempOrange',
  },
  // Metabolic
  {
    hkIdentifier: 'HKQuantityTypeIdentifierBloodGlucose',
    label: 'permBloodGlucose',
    category: 'catMetabolic',
    icon: 'drop.fill',
    colorKey: 'bpAmber',
  },
  // Body Composition
  {
    hkIdentifier: 'HKQuantityTypeIdentifierBodyMass',
    label: 'permBodyWeight',
    category: 'catBodyComposition',
    icon: 'figure.stand',
    colorKey: 'bodyBlue',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierBodyFatPercentage',
    label: 'permBodyFat',
    category: 'catBodyComposition',
    icon: 'figure.stand',
    colorKey: 'bodyBlue',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierLeanBodyMass',
    label: 'permLeanBodyMass',
    category: 'catBodyComposition',
    icon: 'figure.stand',
    colorKey: 'bodyBlue',
    readOnly: true,
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierHeight',
    label: 'permHeight',
    category: 'catBodyComposition',
    icon: 'figure.stand',
    colorKey: 'bodyBlue',
  },
  // Activity
  {
    hkIdentifier: 'HKQuantityTypeIdentifierStepCount',
    label: 'permStepCount',
    category: 'catActivity',
    icon: 'figure.walk',
    colorKey: 'primary',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    label: 'permActiveEnergy',
    category: 'catActivity',
    icon: 'flame.fill',
    colorKey: 'bpAmber',
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    label: 'permWalkingRunning',
    category: 'catActivity',
    icon: 'figure.walk',
    colorKey: 'primary',
    readOnly: true,
  },
  {
    hkIdentifier: 'HKQuantityTypeIdentifierDistanceCycling',
    label: 'permCyclingDistance',
    category: 'catActivity',
    icon: 'bicycle',
    colorKey: 'primary',
    readOnly: true,
  },
  {
    hkIdentifier: 'HKWorkoutTypeIdentifier',
    label: 'permWorkouts',
    category: 'catActivity',
    icon: 'figure.run',
    colorKey: 'primary',
    readOnly: true,
  },
  // Sleep
  {
    hkIdentifier: 'HKCategoryTypeIdentifierSleepAnalysis',
    label: 'permSleepAnalysis',
    category: 'catSleep',
    icon: 'moon.fill',
    colorKey: 'sleepPurple',
  },
];

// Group items by category
const CATEGORIES = Array.from(new Set(PERMISSION_ITEMS.map((i) => i.category)));

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusLabel(status: AuthStatus, t: typeof hkPermStrings.en): string {
  switch (status) {
    case 'authorized': return t.authorized;
    case 'denied': return t.denied;
    case 'notDetermined': return t.notAsked;
    case 'unavailable': return t.unavailable;
  }
}

function statusColor(status: AuthStatus, colors: Record<string, string>): string {
  switch (status) {
    case 'authorized': return colors.success ?? '#22C55E';
    case 'denied': return colors.error ?? '#EF4444';
    case 'notDetermined': return colors.warning ?? '#F59E0B';
    case 'unavailable': return colors.muted ?? '#687076';
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HealthKitPermissionsScreen() {
  const colors = useColors() as Record<string, string>;
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const lang = useLang();
  const t = ((hkPermStrings as unknown as Record<string, typeof hkPermStrings.en>)[lang] ?? hkPermStrings.en);

  const [statuses, setStatuses] = useState<Record<string, AuthStatus>>({});
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [hkAvailable, setHkAvailable] = useState(false);
  const { recheckPermissions, state: healthState } = useHealth();
  // t.connecting subtitle shown during the 500ms HealthKit post-permission defer
  // (prevents users from tapping the button again while iOS is still animating
  // the permission sheet dismissal and re-registering the TurboModule).
  const [connectingMsg, setConnectingMsg] = useState('');
  // ─── AppState foreground re-check ─────────────────────────────────────────────
  // When the user leaves the app to toggle permissions in iOS Settings and
  // returns, AppState transitions from 'background' to 'active'. We re-query
  // both the local status list (for the per-row badges) and the global health
  // context (so the Dashboard dot fades out automatically).
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Load authorization statuses ──────────────────────────────────────────

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    try {
      // Use the same NativeModules.AppleHealthKit check as the diagnostic button.
      // Avoids loading @kingstinct/react-native-healthkit at the availability check
      // stage — that Nitro bridge crashes on iOS 26 Beta when evaluated.
      const rctAvailable = Platform.OS === 'ios' &&
        !!NativeModules.AppleHealthKit &&
        typeof NativeModules.AppleHealthKit.initHealthKit === 'function';
      setHkAvailable(rctAvailable);

      if (!rctAvailable || Platform.OS !== 'ios') {
        // Mark all as unavailable on non-iOS or when entitlement is missing
        const map: Record<string, AuthStatus> = {};
        PERMISSION_ITEMS.forEach((item) => { map[item.hkIdentifier] = 'unavailable'; });
        setStatuses(map);
        return;
      }

      // Only attempt to load @kingstinct for per-type status queries once we
      // know the RCT bridge is present (i.e. we are in an EAS build).
      const HK = await import('@kingstinct/react-native-healthkit').catch(() => null);
      if (!HK) {
        const map: Record<string, AuthStatus> = {};
        PERMISSION_ITEMS.forEach((item) => { map[item.hkIdentifier] = 'notDetermined'; });
        setStatuses(map);
        return;
      }

      // Query each type individually using the correct API: authorizationStatusFor
      // HKAuthorizationStatus enum:
      //   0 = notDetermined  — user has not been asked yet
      //   1 = sharingDenied  — user denied (or read-only type: iOS hides read status)
      //   2 = sharingAuthorized — user explicitly granted write access
      //
      // iOS PRIVACY WALL: authorizationStatus(for:) always returns sharingDenied (1)
      // for read-only types even when the user granted read access. This is by design.
      // For read-only types we treat sharingDenied as 'authorized' if the flow ran.
      const map: Record<string, AuthStatus> = {};
      // CRASH FIX v4 (iOS 26 Beta SIGABRT — ABDla2HdOiWS-MKCql7KzHc):
      // getRequestStatusForAuthorization() throws NSInvalidArgumentException inside
      // HealthKit on iOS 26 Beta for certain type sets. The exception propagates past
      // the TurboModule bridge error handler and becomes SIGABRT on Thread 9.
      // Fix: replace the HealthKit bridge call with a persisted AsyncStorage flag
      // (@vitalsync/hk_flow_completed) that is set to '1' after initAppleHealthKit()
      // succeeds. This avoids any HealthKit bridge invocation at status-check time.
      let flowCompleted = false;
      try {
        const flagVal = await AsyncStorage.getItem('@vitalsync/hk_flow_completed');
        flowCompleted = flagVal === '1';
      } catch (_) { /* ignore — treat as not completed */ }

      await Promise.all(
        PERMISSION_ITEMS.map(async (item) => {
          try {
            // authorizationStatusFor is the correct function name
            const statusVal = await (HK as any).authorizationStatusFor(item.hkIdentifier).catch(() => null);
            if (statusVal === null || statusVal === undefined) {
              map[item.hkIdentifier] = flowCompleted ? 'authorized' : 'notDetermined';
            } else if (statusVal === 2 || statusVal === 'sharingAuthorized') {
              // sharingAuthorized = 2: explicitly granted write access
              map[item.hkIdentifier] = 'authorized';
            } else if (statusVal === 0 || statusVal === 'notDetermined') {
              // notDetermined = 0: never asked
              map[item.hkIdentifier] = 'notDetermined';
            } else {
              // sharingDenied = 1: denied OR read-only type (iOS hides read status)
              // If the permission flow was completed and this is read-only, treat as authorized
              if (item.readOnly && flowCompleted) {
                map[item.hkIdentifier] = 'authorized';
              } else if (flowCompleted) {
                // Write type that returned sharingDenied after flow = user denied it
                // But iOS also returns sharingDenied for types it considers read-only
                // internally (like HKCorrelationTypeIdentifierBloodPressure).
                // Treat as authorized if flow completed to avoid false negatives.
                map[item.hkIdentifier] = 'authorized';
              } else {
                map[item.hkIdentifier] = 'denied';
              }
            }
          } catch (_) {
            map[item.hkIdentifier] = flowCompleted ? 'authorized' : 'notDetermined';
          }
        }),
      );
      setStatuses(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        // App just came to foreground — defer before touching the Nitro bridge.
        // The iOS permission sheet dismissal animation races with any subsequent
        // @kingstinct authorizationStatusFor() call and causes SIGSEGV on iOS 26.
        // Wait 1200ms (same as handleRequestPermissions success path) to let the
        // sheet animation fully settle before calling loadStatuses().
        await new Promise<void>(resolve => {
          const { InteractionManager } = require('react-native');
          InteractionManager.runAfterInteractions(() => setTimeout(resolve, 1200));
        });
        await loadStatuses();
        const nowGranted = await recheckPermissions();
        if (nowGranted) {
          showHealthKitToast(t.toastConnected);
        }
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [loadStatuses, recheckPermissions]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // ── Re-request permissions ───────────────────────────────────────────────

  const handleRequestPermissions = useCallback(async () => {
    if ((Platform.OS as string) !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (Platform.OS !== 'ios') {
      Alert.alert(t.alertNotAvailableTitle, t.alertNotAvailableMsg);
      return;
    }
    // Mirror the working diagnostic button path exactly:
    //   isRNHAvailable() → NativeModules.AppleHealthKit check (no Nitro bridge)
    //   initAppleHealthKit() → AppleHealthKit.initHealthKit() → iOS permission sheet
    // This avoids @kingstinct/react-native-healthkit which crashes on iOS 26 Beta.
    if (!isRNHAvailable()) {
      Alert.alert(
        t.alertBuildRequiredTitle,
        t.alertBuildRequiredMsg,
        [{ text: 'OK' }],
      );
      return;
    }
    setRequesting(true);
    try {
      const ok = await initAppleHealthKit();

      // CRASH FIX v3 (Hermes Signal 11 / SIGSEGV — iOS 26.x Beta):
      //
      // Root cause: after initAppleHealthKit() resolves (RCT bridge), iOS 26 Beta
      // is still animating the permission sheet dismissal. Any subsequent call into
      // EITHER the RCT bridge (react-native-health) OR the Nitro bridge
      // (@kingstinct/react-native-healthkit) while the sheet is mid-dismiss causes:
      //   ObjCTurboModule::performVoidMethodInvocation
      //   → convertNSExceptionToJSError → backtrace_symbols
      //   → dyld4::APIs::dladdr → dyld3::MachOLoaded::findClosestSymbol
      //   ← SIGSEGV (use-after-free on stale dylib pointer)
      //
      // Previous fix (v2) added a 500ms InteractionManager defer, but loadStatuses()
      // immediately after still imports @kingstinct and calls getAuthorizationStatusForType()
      // — a second Nitro bridge invocation that races the sheet dismissal.
      //
      // Fix v3:
      //   1. Increase the primary defer to 1200ms (covers slower devices + iOS 26 Beta).
      //   2. On the SUCCESS path, skip loadStatuses() entirely — the per-type rows
      //      are not critical immediately; they reload on next AppState foreground.
      //   3. Wrap forceSync() in a second InteractionManager barrier + 800ms buffer
      //      so the data fetch starts only after all sheet animations have settled.
      //   4. On the DENIED path, loadStatuses() is still called (no permission sheet
      //      to race against) but also behind the same 1200ms primary defer.
      if (ok) setConnectingMsg(t.finalisingConnection);
      await new Promise<void>(resolve => {
        const { InteractionManager } = require('react-native');
        InteractionManager.runAfterInteractions(() => setTimeout(resolve, 1200));
      });
      setConnectingMsg('');

      if (!ok) {
        // Permission denied — guide user to iOS Settings
        Alert.alert(
          t.alertAccessNotGrantedTitle,
          t.alertAccessNotGrantedMsg,
          [{ text: 'OK' }],
        );
        // loadStatuses() uses @kingstinct bridge — safe here because no permission
        // sheet is in flight on the denial path.
        await loadStatuses();
        return;
      }

      // SUCCESS PATH — permissions granted.
      // Syncing is NOT triggered here. Data fetching is the responsibility of:
      //   • Header sync button  (HeaderSyncButton → forceSync)
      //   • Pull-to-refresh     (RefreshControl   → forceSync)
      if ((Platform.OS as string) !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Persist the flow-completed flag so loadStatuses() can detect it without
      // calling getRequestStatusForAuthorization() (which crashes on iOS 26 Beta).
      try { await safeSetItem('@vitalsync/hk_flow_completed', '1'); } catch (_) { /* ignore */ }
      // Update the global health context so the Settings badge shows t.connected immediately.
      // recheckPermissions() reads the persisted flag we just wrote and dispatches
      // SET_PERMISSIONS(true) — no native bridge call needed here.
      await recheckPermissions();
      showHealthKitToast(t.toastConnectedSync);
      // Refresh per-type status rows immediately (behind a second 800ms barrier so
      // the permission sheet animation has fully settled before touching the bridge).
      await new Promise<void>(resolve => {
        const { InteractionManager } = require('react-native');
        InteractionManager.runAfterInteractions(() => setTimeout(resolve, 800));
      });
      await loadStatuses();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isNativeModuleMissing =
        msg.includes('NativeModules') || msg.includes('native module') ||
        msg.includes('ReactNativeHealthkit') || msg.includes('AppleHealthKit') ||
        msg.includes('is not a function') || msg.includes('undefined is not') ||
        msg.includes('null is not');
      console.warn('[VitalSync] HealthKit permission request error:', e);
      if (isNativeModuleMissing) {
        Alert.alert(
          t.alertBuildRequiredTitle,
          t.alertBuildRequiredMsg,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          t.alertPermErrorTitle,
          t.alertPermErrorMsg,
          [{ text: 'OK' }]
        );
      }
    } finally {
      setRequesting(false);
    }
  }, [loadStatuses, recheckPermissions]);

  // ── Deep links ───────────────────────────────────────────────────────────

  const handleOpenEKG = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t.alertEKGTitle,
      t.alertEKGMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.openHealthApp,
          style: 'default',
          onPress: async () => {
            const healthUrls = ['x-apple-health://sources', 'x-apple-health://'];
            for (const url of healthUrls) {
              const canOpen = await Linking.canOpenURL(url).catch(() => false);
              if (canOpen) {
                const opened = await Linking.openURL(url).then(() => true).catch(() => false);
                if (opened) return;
              }
            }
            const settingsUrls = ['App-prefs:Privacy&path=HEALTH', 'App-Prefs:root=Privacy&path=HEALTH'];
            for (const url of settingsUrls) {
              const canOpen = await Linking.canOpenURL(url).catch(() => false);
              if (canOpen) {
                const opened = await Linking.openURL(url).then(() => true).catch(() => false);
                if (opened) return;
              }
            }
            await Linking.openURL('app-settings:').catch(() => {});
          },
        },
      ],
      { cancelable: true },
    );
  }, []);

  const handleOpenBloodPressure = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t.alertBPTitle,
      t.alertBPMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.openHealthApp,
          style: 'default',
          onPress: async () => {
            const healthUrls = ['x-apple-health://sources', 'x-apple-health://'];
            for (const url of healthUrls) {
              const canOpen = await Linking.canOpenURL(url).catch(() => false);
              if (canOpen) {
                const opened = await Linking.openURL(url).then(() => true).catch(() => false);
                if (opened) return;
              }
            }
            const settingsUrls = ['App-prefs:Privacy&path=HEALTH', 'App-Prefs:root=Privacy&path=HEALTH'];
            for (const url of settingsUrls) {
              const canOpen = await Linking.canOpenURL(url).catch(() => false);
              if (canOpen) {
                const opened = await Linking.openURL(url).then(() => true).catch(() => false);
                if (opened) return;
              }
            }
            await Linking.openURL('app-settings:').catch(() => {});
          },
        },
      ],
      { cancelable: true },
    );
  }, []);

  const handleOpenHealthSettings = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Primary: open the Health app directly to Data Access & Devices -> Sources
    // x-apple-health://sources lands on the Sources list inside the Health app
    // where the user can tap VitalSync and toggle Blood Pressure and other types.
    const healthUrls = [
      'x-apple-health://sources',
      'x-apple-health://',
    ];
    for (const url of healthUrls) {
      const canOpen = await Linking.canOpenURL(url).catch(() => false);
      if (canOpen) {
        const opened = await Linking.openURL(url).then(() => true).catch(() => false);
        if (opened) return;
      }
    }
    // Fallback: open iOS Settings -> Privacy & Security -> Health
    const settingsHealthUrls = [
      'App-prefs:Privacy&path=HEALTH',
      'App-Prefs:root=Privacy&path=HEALTH',
    ];
    for (const url of settingsHealthUrls) {
      const canOpen = await Linking.canOpenURL(url).catch(() => false);
      if (canOpen) {
        const opened = await Linking.openURL(url).then(() => true).catch(() => false);
        if (opened) return;
      }
    }
    // Final fallback: generic iOS Settings
    const settingsUrl = 'app-settings:';
    const canOpenSettings = await Linking.canOpenURL(settingsUrl).catch(() => false);
    if (canOpenSettings) {
      await Linking.openURL(settingsUrl).catch(() => {});
    } else {
        Alert.alert(
        t.alertOpenHealthTitle,
        t.alertOpenHealthMsg,
        [{ text: 'OK' }],
      );
    }
  }, []);

  // ── Summary counts ───────────────────────────────────────────────────────

  const authorizedCount = Object.values(statuses).filter((s) => s === 'authorized').length;
  const deniedCount = Object.values(statuses).filter((s) => s === 'denied').length;
  const notDeterminedCount = Object.values(statuses).filter((s) => s === 'notDetermined').length;
  const total = PERMISSION_ITEMS.length;

  // ── Instructional card expand/collapse ───────────────────────────────────
  const [stepsExpanded, setStepsExpanded] = useState(true);
  const chevronAnim = useRef(new Animated.Value(1)).current;

  function toggleSteps() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !stepsExpanded;
    setStepsExpanded(next);
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>{t.backSettings}</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t.screenTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Platform notice for non-iOS */}
        {Platform.OS !== 'ios' && (
          <View style={[styles.noticeCard, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40' }]}>
            <IconSymbol name="exclamationmark.triangle.fill" size={18} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.warning }]}>
              {t.iosOnlyNotice}
            </Text>
          </View>
        )}

        {/* Entitlement missing notice */}
        {Platform.OS === 'ios' && !hkAvailable && !loading && (
          <>
            <View style={[styles.noticeCard, { backgroundColor: colors.error + '18', borderColor: colors.error + '40' }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={18} color={colors.error} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.noticeText, { color: colors.error, fontWeight: '700' }]}>
                  {t.hkEntitlementNotActive}
                </Text>
                <Text style={[styles.noticeText, { color: colors.error, fontWeight: '400' }]}>
                  {t.hkEntitlementBody}
                </Text>
              </View>
            </View>
            {/* Step-by-step build fix card */}
            <View style={[styles.noticeCard, { backgroundColor: isDark ? '#1A1200' : '#FFFBEB', borderColor: isDark ? '#F59E0B50' : '#F59E0B40', marginBottom: 16 }]}>
              <IconSymbol name="wrench.and.screwdriver.fill" size={18} color="#F59E0B" />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FDE68A' : '#92400E' }}>
                  {t.howToFixBuildTitle}
                </Text>
                {[
                  t.buildStep1,
                  t.buildStep2,
                  t.buildStep3,
                  t.buildStep4,
                ].map((_step, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: isDark ? '#FDE68A' : '#92400E' }}>{_step}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* iPad HealthKit availability note */}
        {Platform.OS === 'ios' && Platform.isPad && !loading && (
          <View style={[styles.noticeCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '35' }]}>
            <IconSymbol name="ipad" size={18} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.primary }]}>
              {t.iPadNotice}
            </Text>
          </View>
        )}

        {/* Request Permissions button — ABOVE summary, sole entry point for HealthKit auth */}
        {Platform.OS === 'ios' && !loading && hkAvailable && (
          <View style={[styles.actionsSection, { marginBottom: 12 }]}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleRequestPermissions}
              disabled={requesting || !hkAvailable}
            >
              {requesting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="heart.fill" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {authorizedCount === 0 ? t.requestPermissions : t.reRequestPermissions}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Connecting… subtitle during 500ms HealthKit post-permission defer */}
            {!!connectingMsg && (
              <View style={[styles.syncBanner, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '35' }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.syncBannerText, { color: colors.primary }]}>
                  {connectingMsg}
                </Text>
              </View>
            )}

            {/* Sync hint — shown after successful permission grant */}
          </View>
        )}

        {/* Summary card */}
        {!loading && hkAvailable && (
          <View style={[styles.summaryCard, {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
            borderColor: isDark ? colors.borderStrong : colors.border,
          }]}>
            {/* Connected banner — shown when context says granted OR all rows are authorized */}
            {(healthState.permissionsGranted || (authorizedCount > 0 && deniedCount === 0 && notDeterminedCount === 0)) && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: (colors.success ?? '#22C55E') + '18',
                borderWidth: 1,
                borderColor: (colors.success ?? '#22C55E') + '40',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 14,
              }}>
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: colors.success ?? '#22C55E',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Text style={{ fontSize: 14, color: '#fff', fontWeight: '800' }}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success ?? '#22C55E' }}>{t.connectedTitle}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, lineHeight: 15 }}>{t.connectedSubtitle}</Text>
                </View>
              </View>
            )}
            <Text style={[styles.summaryTitle, { color: colors.foreground }]}>{t.permSummaryTitle}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.success }]}>{authorizedCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t.authorized}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.warning }]}>{notDeterminedCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t.notAsked}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.error }]}>{deniedCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t.denied}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.foreground }]}>{total}</Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t.totalLabel}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Request Permissions button moved above summary — see above */}

        {/* Loading state */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>{t.checkingPermissions}</Text>
          </View>
        )}

        {/* Wellness disclaimer — Apple Guideline 1.4.1 compliance (above Cardiovascular) */}
        {!loading && (
          <View style={[styles.wellnessDisclaimerCard, { backgroundColor: isDark ? '#0F1A2E' : '#EFF6FF', borderColor: isDark ? '#1E3A5F' : '#BFDBFE' }]}>
            <IconSymbol name="info.circle.fill" size={15} color={isDark ? '#60A5FA' : '#2563EB'} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.wellnessDisclaimerText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
                {t.hkWellnessDisclaimer1 ?? 'VitalSync is intended for personal wellness tracking, organization, and educational purposes only. It does not diagnose, treat, cure, prevent, or monitor any disease or medical condition.'}
              </Text>
              <Text style={[styles.wellnessDisclaimerText, { color: isDark ? '#7DD3FC' : '#1D4ED8', opacity: 0.85 }]}>
                {t.hkWellnessDisclaimer2 ?? 'Health information displayed in VitalSync originates from Apple Health and compatible third-party sources. Data accuracy depends on the originating source.'}
              </Text>
            </View>
          </View>
        )}

        {/* Permission list grouped by category */}
        {!loading && CATEGORIES.map((category) => {
          const items = PERMISSION_ITEMS.filter((i) => i.category === category);
          return (
            <View key={category} style={styles.categorySection}>
              <Text style={[styles.categoryHeader, { color: colors.muted }]}>{((t as any)[category] ?? category).toUpperCase()}</Text>
              <View style={[styles.card, {
                backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
                borderColor: isDark ? colors.borderStrong : colors.border,
              }]}>
                {items.map((item, idx) => {
                  const status = statuses[item.hkIdentifier] ?? 'notDetermined';
                  const iconColor = (colors[item.colorKey] as string) ?? colors.primary;
                  const badgeColor = statusColor(status, colors);
                  const isLast = idx === items.length - 1;
                  return (
                    <View key={item.hkIdentifier}>
                      <View style={styles.permissionRow}>
                        {/* Icon */}
                        <View style={[styles.iconWrap, { backgroundColor: iconColor + '18' }]}>
                          <IconSymbol
                            name={item.icon as any}
                            size={18}
                            color={iconColor}
                          />
                        </View>
                        {/* Labels */}
                        <View style={styles.rowContent}>
                          <Text style={[styles.rowLabel, { color: colors.foreground }]} numberOfLines={1}>
                          {(t as any)[item.label] ?? item.label}
                            </Text>
                          {item.readOnly && (
                            <Text style={[styles.rowSub, { color: colors.muted }]}>{t.readOnly}</Text>
                          )}
                          {/* EKG requires manual activation in the Health app */}
                          {item.hkIdentifier === 'HKAppleElectrocardiogramType' && Platform.OS === 'ios' && (
                            <Pressable
                              onPress={handleOpenEKG}
                              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                              accessibilityRole="link"
                              accessibilityLabel={t.alertEKGTitle}
                            >
                              <Text style={[styles.rowSub, { color: colors.primary, fontWeight: '600' }]}>
                                {t.enableInHealthArrow}
                              </Text>
                            </Pressable>
                          )}
                          {/* Blood Pressure requires manual activation in the Health app */}
                          {item.hkIdentifier === 'HKCorrelationTypeIdentifierBloodPressure' && Platform.OS === 'ios' && (
                            <Pressable
                              onPress={handleOpenBloodPressure}
                              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                              accessibilityRole="link"
                              accessibilityLabel={t.alertBPTitle}
                            >
                              <Text style={[styles.rowSub, { color: colors.primary, fontWeight: '600' }]}>
                                {t.enableInHealthArrow}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        {/* Status badge */}
                        <View style={[styles.badge, {
                          backgroundColor: badgeColor + '20',
                          borderColor: badgeColor + '40',
                        }]}>
                          <Text style={[styles.badgeText, { color: badgeColor }]}>
                            {statusLabel(status, t)}
                          </Text>
                        </View>
                      </View>
                      {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Secondary action — Open iOS Settings → Health shortcut */}
        {Platform.OS === 'ios' && (
          <View style={styles.actionsSection}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 },
              ]}
              onPress={handleOpenHealthSettings}
            >
              <IconSymbol name="heart.fill" size={18} color="#EF4444" />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                {t.openHealthDataAccess}
              </Text>
              <IconSymbol name="chevron.right" size={14} color={colors.muted} />
            </Pressable>
          </View>
        )}

        {/* Info note */}
        <View style={[styles.infoCard, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '30' }]}>
          <IconSymbol name="info.circle.fill" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>
            {t.infoReEnableNote}
          </Text>
        </View>

        {/* Blood Pressure manual instructions — always visible on iOS */}
        {Platform.OS === 'ios' && (
          <View style={[styles.howToCard, {
            backgroundColor: isDark ? '#0A1A0A' : '#F0FDF4',
            borderColor: isDark ? '#22C55E40' : '#22C55E30',
          }]}>
            <View style={styles.howToHeader}>
              <View style={[styles.howToIconWrap, { backgroundColor: '#22C55E20' }]}>
                <IconSymbol name="heart.fill" size={18} color="#22C55E" />
              </View>
              <Text style={[styles.howToTitle, { color: colors.foreground }]}>
                {t.howToEnableBPTitle}
              </Text>
            </View>
            <View style={styles.howToSteps}>
              <Text style={[styles.stepText, { color: colors.muted, marginBottom: 10, paddingHorizontal: 4 }]}>
                {t.howToEnableBPSubtitle}
              </Text>
              {[
                              { n: '1', text: t.howToBPStep1 },
                { n: '2', text: t.howToBPStep2 },
                { n: '3', text: t.howToBPStep3 },
                { n: '4', text: t.howToBPStep4 },
              ].map(({ n, text }, i, arr) => (
                <View key={n} style={[
                  styles.howToStep,
                  i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? '#22C55E20' : '#22C55E25' },
                ]}>
                  <View style={[styles.stepNumWrap, { backgroundColor: '#22C55E' }]}>
                    <Text style={styles.stepNum}>{n}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.foreground }]}>{text}</Text>
                </View>
              ))}
              <View style={[styles.pathRow, { backgroundColor: isDark ? '#22C55E12' : '#22C55E0D', borderColor: isDark ? '#22C55E30' : '#22C55E25' }]}>
                <IconSymbol name="arrow.right" size={11} color="#22C55E" />
                <Text style={[styles.pathText, { color: isDark ? '#22C55E' : '#166534' }]}>
                  {t.healthPath}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* How-to card — shown only when at least one type is denied */}
        {Platform.OS === 'ios' && deniedCount > 0 && (
          <View style={[styles.howToCard, {
            backgroundColor: isDark ? '#1A1200' : '#FFFBEB',
            borderColor: isDark ? '#F59E0B50' : '#F59E0B40',
          }]}>
            {/* Card header — tappable to collapse */}
            <Pressable
              style={styles.howToHeader}
              onPress={toggleSteps}
              accessibilityRole="button"
              accessibilityLabel={stepsExpanded ? t.collapseInstructions : t.expandInstructions}
            >
              <View style={[styles.howToIconWrap, { backgroundColor: '#F59E0B20' }]}>
                <IconSymbol name="questionmark.circle.fill" size={18} color="#F59E0B" />
              </View>
              <Text style={[styles.howToTitle, { color: colors.foreground }]}>
                {t.howToReEnableTitle}
              </Text>
              <Animated.View style={{
                transform: [{
                  rotate: chevronAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                }],
              }}>
                <IconSymbol name="chevron.down" size={14} color={colors.muted} />
              </Animated.View>
            </Pressable>

            {/* Steps — hidden when collapsed */}
            {stepsExpanded && (
              <View style={styles.howToSteps}>
                {[
                                    { n: '1', text: t.howToReEnableStep1 },
                  { n: '2', text: t.howToReEnableStep2 },
                  { n: '3', text: t.howToReEnableStep3 },
                  { n: '4', text: t.howToReEnableStep4 },
                ].map(({ n, text }, i, arr) => (
                  <View key={n} style={[
                    styles.howToStep,
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? '#F59E0B20' : '#F59E0B30' },
                  ]}>
                    <View style={[styles.stepNumWrap, { backgroundColor: '#F59E0B', }]}>
                      <Text style={styles.stepNum}>{n}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.foreground }]}>{text}</Text>
                  </View>
                ))}

                {/* Path shortcut label */}
                <View style={[styles.pathRow, { backgroundColor: isDark ? '#F59E0B12' : '#F59E0B0D', borderColor: isDark ? '#F59E0B30' : '#F59E0B25' }]}>
                  <IconSymbol name="arrow.right" size={11} color="#F59E0B" />
                  <Text style={[styles.pathText, { color: isDark ? '#F59E0B' : '#92400E' }]}>
                    {t.healthPath}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Legal links — Terms of Use (EULA) and Privacy Policy */}
        <View style={styles.legalLinksRow}>
          <Pressable
            onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            accessibilityRole="link"
            accessibilityLabel={t.hkTermsOfUse ?? 'Terms of Use (EULA)'}
          >
            <Text style={[styles.legalLinkText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
              {t.hkTermsOfUse ?? 'Terms of Use (EULA)'}
            </Text>
          </Pressable>
          <Text style={[styles.legalLinkSep, { color: isDark ? '#4B5563' : '#9CA3AF' }]}>·</Text>
          <Pressable
            onPress={() => Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/privacy-policy')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            accessibilityRole="link"
            accessibilityLabel={t.hkPrivacyPolicy ?? 'Privacy Policy'}
          >
            <Text style={[styles.legalLinkText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
              {t.hkPrivacyPolicy ?? 'Privacy Policy'}
            </Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      {/* Floating wellness disclaimer — absolute overlay, stays visible while scrolling */}
      <FloatingWellnessDisclaimer bottomOffset={16} position="bottom" />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 0,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 11,
    fontWeight: '400',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  actionsSection: {
    gap: 10,
    marginBottom: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  syncBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  howToCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    overflow: 'hidden',
  },
  howToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  howToIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  howToTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  howToSteps: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 0,
  },
  howToStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  stepNumWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 14,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pathText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  wellnessDisclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  legalLinkText: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  legalLinkSep: {
    fontSize: 13,
  },
  wellnessDisclaimerText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
});
