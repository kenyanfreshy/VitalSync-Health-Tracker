// MUST be first: patches NativeEventEmitter to be null-safe on iOS New Architecture.
// Prevents the PushNotificationIOS Dead-on-Arrival crash (fatal invariant when
// NativePushNotificationManagerIOS is null on Expo Go / TestFlight builds).
import "@/lib/polyfills/native-event-emitter-patch";
import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { defineHealthMonitorTask } from "@/lib/notifications/background-task";
import {
  initializeNotificationsSafely,
  addNotificationResponseReceivedListenerSafely,
  cleanupNotificationListeners,
} from "@/lib/notifications/safeNotifications";
import { defineBackgroundSyncTask } from "@/lib/health/background-sync-service";
import {
  enableHealthKitBackgroundDelivery,
  registerHealthKitObservers,
} from "@/lib/health/native-health-service";
import { HealthKitToastProvider } from "@/components/healthkit-toast";

import { TranslatingToast } from "@/components/translating-toast";

import { SafeAreaFrameContext, SafeAreaInsetsContext, SafeAreaProvider, initialWindowMetrics, EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { HealthProvider, useHealth } from '@/lib/health/health-context';
import { SmoothingStrengthProvider } from '@/lib/health/smoothing-strength-context';
import { DataSourcesProvider, useDataSources } from "@/lib/data-sources/data-sources-context";
import { initDevPreviewBridge, subscribeSafeAreaInsets } from "@/lib/_core/dev-preview-bridge";
import { ErrorBoundary } from "@/components/error-boundary";
import { GlobalErrorBoundary } from "@/components/global-error-boundary";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { installGlobalErrorHandlers } from "@/lib/crash-logger";
import { runStorageMigration } from '@/lib/storage/migration';
import { initEncryptionKey } from '@/lib/storage/encrypted-storage';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { ReportLangProvider } from '@/lib/report-lang-context';
import { AppLockScreen } from '@/components/app-lock-screen';
import { initLang, settingsStrings, homeStrings, logStrings, detailStrings, reportStrings, aboutStrings, onboardingStrings } from '@/lib/i18n';
import { initRTL } from '@/lib/rtl';
import { TranslationProvider, flattenStrings } from '@/lib/i18n-ai';
import { WeatherProvider } from '@/lib/weather/weather-context';
import { SubscriptionProvider, useSubscription } from '@/lib/subscription/subscription-context';
import { paywallGuard } from '@/lib/subscription/paywall-guard';
import {
  whatsNewUiStrings,
  whatsNewV1037Strings,
  whatsNewV1036Strings,
  whatsNewV1035Strings,
  whatsNewV1034Strings,
  whatsNewV14Strings,
  whatsNewV13Strings,
  whatsNewV12Strings,
} from '@/components/whats-new-sheet';
// ─── App Loading Gate ────────────────────────────────────────────────────────
// Renders AppLoadingScreen while HealthProvider is still loading persisted data
// from AsyncStorage. This prevents the brief flash of empty vital cards on
// first render and ensures the UI is fully mounted before any logic executes.
function AppLoadingGate({ children }: { children: React.ReactNode }) {
  const { state } = useHealth();
  if (state.isLoading) {
    return <AppLoadingScreen message="Loading your health data\u2026" />;
  }
  return <>{children}</>;
}
// ─── Subscription Loading Gate ───────────────────────────────────────────────
// Renders AppLoadingScreen while SubscriptionProvider is still reading
// AsyncStorage on mount. This prevents the ghost-launch race condition where
// the root Stack mounts before accessState is resolved, causing a blank screen
// or an immediate (incorrect) paywall push.
function SubscriptionLoadingGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useSubscription();
  if (isLoading) {
    return <AppLoadingScreen message="Loading\u2026" />;
  }
  return <>{children}</>;
}
// ─── Permission-Grant Sync Bridge ──────────────────────────────────────────────
// Watches for the first permission grant in a session and kicks off an
// immediate foreground sync so the Dashboard is populated without a manual tap.
// Does NOT auto-request permissions — that is handled exclusively by the
// "Request Permissions" button in Settings → HealthKit Permissions.
function ColdLaunchPermissionBridge() {
  const { state, forceSync } = useHealth();
  // Track whether this is the first time permissions become granted in this
  // session so we can kick off an immediate foreground sync.
  const prevGranted = useRef(state.permissionsGranted);

  // ── First-grant foreground sync ──────────────────────────────────────────
  // When permissions transition from false → true (i.e. the user just granted
  // them for the first time), run a full 30-day sync immediately so the
  // Dashboard is populated without requiring a manual tap.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!state.permissionsGranted) {
      prevGranted.current = false;
      return;
    }
    if (prevGranted.current) return; // already granted before this effect ran
    prevGranted.current = true;
    // Small delay so the permission sheet has fully dismissed before we start
    // the sync (avoids a UI flash on the Dashboard).
    const timer = setTimeout(() => {
      forceSync().catch((e) =>
        console.warn('[VitalSync] post-permission forceSync failed:', e)
      );
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.permissionsGranted]);

  // ── Cold-launch permission request REMOVED ──────────────────────────────
  // requestAuthorization is now ONLY called from the "Request Permissions"
  // button in Settings → HealthKit Permissions (user-initiated, main thread
  // guaranteed by React Native's touch event dispatch).
  //
  // Automatic cold-launch requests caused SIGABRT on iOS 26 Beta because the
  // TurboModule queue (not the main thread) dispatched the call. Removing the
  // auto-request eliminates the crash entirely. Users are guided to the
  // Settings screen via the onboarding flow and the Dashboard health banner.

  return null;
}



// ─── HealthKit Background Delivery Bridge ────────────────────────────────────
// Enables HealthKit background delivery and registers change observers so that
// new readings (e.g. overnight heart rate, sleep) are merged into AsyncStorage
// even when the app is not in the foreground. iOS only; no-op on other platforms.
function HealthKitBackgroundBridge() {
  const { state } = useHealth();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!state.permissionsGranted) return;

    let cancelled = false;
    (async () => {
      await enableHealthKitBackgroundDelivery();
      if (cancelled) return;
      const unsubscribe = await registerHealthKitObservers();
      if (cancelled) {
        unsubscribe();
        return;
      }
      unsubscribeRef.current = unsubscribe;
    })();

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [state.permissionsGranted]);

  return null;
}

// ─── Native Health Bridge ─────────────────────────────────────────────────────
// Connects the DataSourcesContext merge callback to the HealthContext so that
// native health data (HealthKit / Health Connect) flows into the app's vitals.
function NativeHealthBridge() {
  const { mergeNativeHealth } = useHealth();
  const { setMergeCallback } = useDataSources();
  useEffect(() => {
    setMergeCallback(mergeNativeHealth);
  }, [mergeNativeHealth, setMergeCallback]);
  return null;
}

// ─── Auto-Sync Bridge ────────────────────────────────────────────────────────
// Triggers a sync of all connected data sources on app launch when the
// autoSyncOnLaunch preference is enabled.
function AutoSyncBridge() {
  const { store, syncAllConnected } = useDataSources();
  const hasSynced = useRef(false);

  useEffect(() => {
    // Only run once per app launch, after the store has been loaded from storage
    if (hasSynced.current) return;
    if (!store.autoSyncOnLaunch) return;
    // Delay slightly to let the UI render first
    const timer = setTimeout(() => {
      hasSynced.current = true;
      syncAllConnected();
    }, 1500);
    return () => clearTimeout(timer);
  }, [store.autoSyncOnLaunch, syncAllConnected]);

  return null;
}

// ─── Notification Deep-Link Bridge ─────────────────────────────────────────────
// Listens for notification tap events and routes to the correct screen.
// Handles:
//   • healthkit-background      → Dashboard (/(tabs)/)
//   • threshold-violation       → Detail screen based on category
//   • medication-reminder       → Log tab (/(tabs)/log)
//   • missed-dose-followup type → Medications screen (/log/medications?highlightMedId=<id>)
//   • glucose-recheck           → Blood sugar screen
// Uses expo-router's router.navigate so the tab bar is preserved.

/** Maps a threshold category to its dedicated detail screen route. */
const THRESHOLD_CATEGORY_ROUTES: Record<string, string> = {
  bp: '/detail/blood-pressure',
  heartRate: '/detail/pulse',
  hrv: '/detail/pulse',
  spo2: '/detail/spo2',
};

function NotificationDeepLinkBridge() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useRouter } = require('expo-router');
  const router = useRouter();
  // Guard: do not push paywall while subscription state is still loading from AsyncStorage
  const { isLoading: subIsLoading } = useSubscription();
  // Guard: don’t navigate until the navigation stack has had time to mount.
  // On cold launch from a notification, router.push() called too early causes
  // a white overlay because the Stack navigator isn’t ready yet.
  const navigationReady = useRef(false);
  const pendingPaywall = useRef(false);
  // Guard: track the last notification identifier we handled so we never
  // re-fire the same notification on repeated cold launches. iOS re-delivers
  // the last tapped notification on every cold launch.
  const lastHandledNotifId = useRef<string | null>(null);
  useEffect(() => {
    // Mark navigation as ready after a short delay (stack mounts in ~300ms)
    const readyTimer = setTimeout(() => {
      navigationReady.current = true;
      // Flush any pending paywall push — only if subscription state has resolved
      if (pendingPaywall.current && !subIsLoading) {
        pendingPaywall.current = false;
        paywallGuard.tryPush(() => { router.push('/paywall' as Parameters<typeof router.push>[0]); });
      }
    }, 600);
    return () => clearTimeout(readyTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let cancelled = false;
    // Use addNotificationResponseReceivedListenerSafely() — the new three-layer-safe
    // wrapper that guards against the PushNotificationIOS NativeEventEmitter(null)
    // crash on iOS New Architecture (Expo Go / TestFlight builds).
    let cleanup: (() => void) | null = null;
    addNotificationResponseReceivedListenerSafely(
      (response) => {
        if (cancelled) return;
        try {
          const data = response?.notification?.request?.content?.data ?? {};
          const source = (data as Record<string, unknown>).source as string | undefined;
          const category = (data as Record<string, unknown>).category as string | undefined;

          if (source === 'healthkit-background') {
            router.navigate('/(tabs)/');
          } else if (source === 'threshold-violation') {
            const route = (category && THRESHOLD_CATEGORY_ROUTES[category])
              ? THRESHOLD_CATEGORY_ROUTES[category]
              : '/settings/thresholds';
            router.navigate(route as Parameters<typeof router.navigate>[0]);
          } else if (source === 'glucose-recheck') {
            router.navigate('/log/blood-sugar' as Parameters<typeof router.navigate>[0]);
          } else if (source === 'appt-missed-followup') {
            const apptId = (data as Record<string, unknown>).apptId as string | undefined;
            if (apptId) {
              router.navigate({ pathname: '/log/appointments', params: { tab: 'missed', outcomeApptId: apptId } } as Parameters<typeof router.navigate>[0]);
            } else {
              router.navigate({ pathname: '/log/appointments', params: { tab: 'missed' } } as Parameters<typeof router.navigate>[0]);
            }
          } else if ((data as Record<string, unknown>).type === 'storage_size_alert') {
            router.navigate({ pathname: '/(tabs)/settings', params: { section: 'privacy' } } as Parameters<typeof router.navigate>[0]);
          } else if ((data as Record<string, unknown>).type === 'reason_streak') {
            // Tapping the notification or “Refill Now” action → go to Medications tab
            router.navigate('/(tabs)/medications' as Parameters<typeof router.navigate>[0]);
          } else if ((data as Record<string, unknown>).action === 'open_paywall') {
            // Trial-expiry notification → open paywall.
            // Guard: skip if we already handled this exact notification (prevents
            // re-firing on every cold launch since iOS re-delivers the last tapped
            // notification on cold launch).
            const notifId = response?.notification?.request?.identifier ?? null;
            if (notifId && notifId === lastHandledNotifId.current) {
              // Already handled — skip
            } else {
              if (notifId) lastHandledNotifId.current = notifId;
              if (navigationReady.current && !subIsLoading) {
                paywallGuard.tryPush(() => { router.push('/paywall' as Parameters<typeof router.push>[0]); });
              } else {
                // Queue the push — will be flushed once nav is ready AND subscription is loaded
                pendingPaywall.current = true;
              }
            }
          }
        } catch (e) {
          console.warn('[VitalSync] NotificationDeepLinkBridge navigate failed:', e);
        }
      }
    ).then((removeFn) => {
      if (!cancelled) cleanup = removeFn;
      else removeFn();
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────
// Renders the AppLockScreen overlay when the auth context says the app is locked.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isReady, isSetup, isLocked } = useAuth();
  // Don't block render while loading auth config
  if (!isReady) return <>{children}</>;
  return (
    <>
      {children}
      {isSetup && isLocked && <AppLockScreen />}
    </>
  );
}


// Register background task definition and notification handler at module load time
// (must happen before any rendering, as required by expo-task-manager)
// Wrapped in try/catch: a native module failure must never crash the JS bundle.
try { defineHealthMonitorTask(); } catch (e) { console.warn('[VitalSync] defineHealthMonitorTask failed:', e); }
try { defineBackgroundSyncTask(); } catch (e) { console.warn('[VitalSync] defineBackgroundSyncTask failed:', e); }
// configureNotificationHandler is now called lazily inside RootLayout's useEffect
// via initializeNotificationsSafely() — never at module evaluation time.
// This prevents the PushNotificationIOS NativeEventEmitter(null) DoA crash.
// Install global error handlers for local crash logging (no server required)
try { installGlobalErrorHandlers(); } catch (e) { console.warn('[VitalSync] installGlobalErrorHandlers failed:', e); }

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // langReady is kept for future use (e.g. language-gated UI). ConsentModal
  // has been moved to the onboarding flow (last step before Start Monitoring).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [langReady, setLangReady] = useState(false);

  // Pre-warm the AES encryption key and run the plaintext→encrypted migration.
  // This runs once on every app launch; subsequent launches skip quickly via flag.
  // Safe: never throws, never blocks UI, never crashes the app.
  useEffect(() => {
    if (Platform.OS === 'web') return; // SecureStore not available on web
    initEncryptionKey().catch(() => {});
    runStorageMigration().catch(() => {});
  }, []);
  useEffect(() => {
    // Load persisted language override and RTL preference before any UI renders.
    // Wrapped in try/catch: if AsyncStorage is unavailable on first launch,
    // we still mark langReady so it is not blocked forever.
    Promise.all([initLang(), initRTL()])
      .then(() => setLangReady(true))
      .catch((e) => {
        console.warn('[VitalSync] initLang/initRTL failed — proceeding with defaults:', e);
        setLangReady(true);
      });
  }, []);

  // Initialize dev preview bridge for safe-area inset sync in the preview iframe
  useEffect(() => {
    initDevPreviewBridge();
  }, []);

  // Initialize notifications safely — post-mount, never at module evaluation time.
  // This is the primary entry point for the three-layer PushNotificationIOS crash fix.
  // Layer 1: Metro resolver stub (metro.config.js) replaces PushNotificationIOS.js at bundle time.
  // Layer 2: NativeEventEmitter polyfill (first import in this file) patches the constructor.
  // Layer 3: initializeNotificationsSafely() guards the dynamic import with a TurboModuleRegistry check.
  useEffect(() => {
    void initializeNotificationsSafely();
    return () => cleanupNotificationListeners();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ReportLangProvider>
          <TranslationProvider allEnglishStrings={flattenStrings({
            settings: settingsStrings.en,
            home: homeStrings.en,
            log: logStrings.en,
            detail: detailStrings.en,
            report: reportStrings.en,
            about: aboutStrings.en,
            onboarding: onboardingStrings.en,
            whatsNewUi: whatsNewUiStrings,
            whatsNewV1037: whatsNewV1037Strings,
            whatsNewV1036: whatsNewV1036Strings,
            whatsNewV1035: whatsNewV1035Strings,
            whatsNewV1034: whatsNewV1034Strings,
            whatsNewV14: whatsNewV14Strings,
            whatsNewV13: whatsNewV13Strings,
            whatsNewV12: whatsNewV12Strings,
          } as Record<string, unknown>)}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <SubscriptionLoadingGate>
          <SmoothingStrengthProvider>
          <HealthProvider>
            <DataSourcesProvider>
            <AppLoadingGate>
              <ColdLaunchPermissionBridge />

              <NativeHealthBridge />
              <HealthKitBackgroundBridge />
              <AutoSyncBridge />
              <NotificationDeepLinkBridge />
            <AuthProvider>
              <AuthGate>
                {/* ConsentModal removed — consent is now the last step of onboarding */}
                <Stack
                  screenOptions={{ headerShown: false }}

                >
                  <Stack.Screen name="(tabs)" />
                  <TranslatingToast />
                  <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="oauth/callback" />
                  <Stack.Screen name="settings/thresholds" />
                  <Stack.Screen name="settings/profile" />
                  <Stack.Screen name="detail/clinical-narrative" options={{ headerShown: false }} />
                  <Stack.Screen name="detail/blood-pressure" />
                  <Stack.Screen name="detail/pulse" />
                  <Stack.Screen name="detail/body-composition" />
                  <Stack.Screen name="detail/sleep" />
                  <Stack.Screen name="detail/spo2" />
                  <Stack.Screen name="detail/temperature" />
                  <Stack.Screen name="detail/ekg" options={{ headerShown: false }} />
                  <Stack.Screen name="detail/ekg-waveform" options={{ headerShown: false }} />
                  <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
                  <Stack.Screen name="purchase-success" options={{ presentation: 'modal', headerShown: false, animation: 'fade', gestureEnabled: false }} />
                  <Stack.Screen name="auth/setup-lock" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="auth/change-pin" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="auth/medical-id" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="settings/data-sources" />
                  <Stack.Screen name="settings/healthkit-permissions" />
                  <Stack.Screen name="settings/about" />
                  <Stack.Screen name="settings/data-privacy" />
                  <Stack.Screen name="settings/crash-logs" />
                  <Stack.Screen name="settings/color-legend" />
                  <Stack.Screen name="settings/manage-dashboard" options={{ headerShown: false }} />
                  <Stack.Screen name="settings/data-management" options={{ headerShown: false }} />
                  <Stack.Screen name="settings/premium-compare" options={{ headerShown: false }} />
                  <Stack.Screen name="settings/language" options={{ headerShown: false }} />
                  <Stack.Screen name="log/activity-log-history" />
                  <Stack.Screen name="log/nutrition" options={{ headerShown: false }} />
                  <Stack.Screen name="diet/streak-records" />
                  <Stack.Screen name="log/medical-history" options={{ headerShown: false, gestureEnabled: true }} />
                  <Stack.Screen name="log/appointments" options={{ headerShown: false, gestureEnabled: true }} />
                  <Stack.Screen name="log/immunizations" options={{ headerShown: false, gestureEnabled: true }} />
                  <Stack.Screen name="log/vaccine-schedule" options={{ headerShown: false, gestureEnabled: true }} />
                  <Stack.Screen name="log/cdc-vaccines" options={{ headerShown: false, gestureEnabled: true }} />
                  <Stack.Screen name="log/allergies" options={{ headerShown: false, gestureEnabled: true }} />
                  <Stack.Screen name="log/surgical-history" options={{ headerShown: false, gestureEnabled: true }} />
                </Stack>
                <StatusBar style="auto" />
              </AuthGate>
            </AuthProvider>
            </AppLoadingGate>
            </DataSourcesProvider>
          </HealthProvider>
          </SmoothingStrengthProvider>
          </SubscriptionLoadingGate>
          </TranslationProvider>
          </ReportLangProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <GlobalErrorBoundary>
        <ThemeProvider>
          <SubscriptionProvider>
          <WeatherProvider>
            <HealthKitToastProvider>
              <SafeAreaProvider initialMetrics={providerInitialMetrics}>
                <SafeAreaFrameContext.Provider value={frame}>
                  <SafeAreaInsetsContext.Provider value={insets}>
                    {content}
                  </SafeAreaInsetsContext.Provider>
                </SafeAreaFrameContext.Provider>
              </SafeAreaProvider>
            </HealthKitToastProvider>
          </WeatherProvider>
        </SubscriptionProvider>
        </ThemeProvider>
      </GlobalErrorBoundary>
    );
  }
  return (
    <GlobalErrorBoundary>
      <ThemeProvider>
        <SubscriptionProvider>
          <WeatherProvider>
            <HealthKitToastProvider>
              <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
            </HealthKitToastProvider>
          </WeatherProvider>
        </SubscriptionProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}

export default RootLayout;
