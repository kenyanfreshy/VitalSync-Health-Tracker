/**
 * Data Sources Screen
 *
 * Allows users to connect, disconnect, and sync VitalSync with supported
 * external health data sources: Apple Health, Apple Watch, Oura Ring, and Garmin Connect.
 */

import { safeFormatDate } from '@/lib/utils';
import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  useColorScheme,
  Linking,
} from 'react-native';
import type { HealthKitSyncCounts } from '@/lib/data-sources/adapters/healthkit-adapter';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EvidenceRefBanner } from '@/components/ui/evidence-ref-banner';
import { useColors, useLang } from '@/hooks';
import { useDataSources } from '@/lib/data-sources/data-sources-context';
import { showHealthKitToast } from '@/components/healthkit-toast';
import { settingsExtStrings } from '@/lib/i18n';
import {
  ALL_SOURCE_IDS,
  DATA_SOURCE_META,
  type DataSourceId,
  type ConnectionStatus,
} from '@/lib/data-sources/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SettingsExtT = typeof settingsExtStrings.en;
function statusLabel(status: ConnectionStatus, t: SettingsExtT): string {
  switch (status) {
    case 'connected': return t.statusConnected;
    case 'connecting': return t.statusConnecting;
    case 'error': return t.statusError;
    case 'unavailable': return t.statusUnavailable;
    default: return t.statusNotConnected;
  }
}

function statusColor(status: ConnectionStatus, colors: Record<string, string>): string {
  switch (status) {
    case 'connected': return colors.success ?? '#22C55E';
    case 'connecting': return colors.warning ?? '#F59E0B';
    case 'error': return colors.error ?? '#EF4444';
    default: return colors.muted ?? '#687076';
  }
}

function formatLastSynced(iso: string | null): string {
  if (!iso) return 'Never synced';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Source Card ──────────────────────────────────────────────────────────────

interface SourceCardProps {
  id: DataSourceId;
  available: boolean;
}

function SourceCard({ id, available }: SourceCardProps) {
  const colors = useColors() as Record<string, string>;
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const lang = useLang();
  const t = ((settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[lang] ?? settingsExtStrings.en);
  const { store, connect, disconnect, sync } = useDataSources();
  const meta = DATA_SOURCE_META[id];
  const state = store.sources[id];
  const [actionLoading, setActionLoading] = useState(false);
  const [syncCounts, setSyncCounts] = useState<HealthKitSyncCounts | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [syncPhase, setSyncPhase] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [debugFetching, setDebugFetching] = useState(false);
  const [debugResult, setDebugResult] = useState<Record<string, number> | null>(null);
  // Tick every 60 s so the "X min ago" label stays current
  const [, setTick] = useState(0);
  const connected = state.status === 'connected';
  React.useEffect(() => {
    if (!connected) return;
    const timerId = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timerId);
  }, [connected]);

  // Load persisted counts from AsyncStorage on mount so last sync result survives app restart
  React.useEffect(() => {
    if (id !== 'healthkit' && id !== 'apple_watch') return;
    import('@/lib/data-sources/adapters/healthkit-adapter').then(({ loadPersistedHealthKitSyncCounts, getLastHealthKitSyncCounts, getLastHealthKitSyncErrors }) => {
      loadPersistedHealthKitSyncCounts().then(() => {
        const counts = getLastHealthKitSyncCounts();
        const errors = getLastHealthKitSyncErrors();
        if (counts) {
          setSyncCounts(counts);
          setSyncErrors(errors);
          setSyncPhase('done');
        }
      });
    }).catch(() => {});
  }, [id]);

  const isConnected = state.status === 'connected';
  const isConnecting = state.status === 'connecting' || actionLoading;
  const hasError = state.status === 'error';

  // Whether this card is an Apple Health source (shows Fix Permissions button)
  const isAppleHealthSource = id === 'healthkit' || id === 'apple_watch';

  const handleFixPermissions = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // x-apple-health://sources opens the Health app on the Sources tab,
    // where the user can tap VitalSync to manage per-data-type permissions.
    // Falls back to x-apple-health:// (Health app home) if sources path is unavailable,
    // then to App-prefs:Privacy&path=HEALTH (iOS Settings → Health) as last resort.
    const healthSourcesUrl = 'x-apple-health://sources';
    const healthHomeUrl = 'x-apple-health://';
    const healthSettingsUrl = 'App-prefs:Privacy&path=HEALTH';
    const canOpenSources = await Linking.canOpenURL(healthSourcesUrl).catch(() => false);
    if (canOpenSources) {
      await Linking.openURL(healthSourcesUrl).catch(async () => {
        const canOpenHome = await Linking.canOpenURL(healthHomeUrl).catch(() => false);
        if (canOpenHome) await Linking.openURL(healthHomeUrl).catch(() => {});
      });
    } else {
      const canOpenHome = await Linking.canOpenURL(healthHomeUrl).catch(() => false);
      if (canOpenHome) {
        await Linking.openURL(healthHomeUrl).catch(() => {});
      } else {
        // Last resort: iOS Settings → Privacy & Security → Health
        const canOpenSettings = await Linking.canOpenURL(healthSettingsUrl).catch(() => false);
        if (canOpenSettings) {
          await Linking.openURL(healthSettingsUrl).catch(() => {});
        } else {
          Alert.alert(
            t.openHealthAppTitle,
            t.openHealthAppMsg,
            [{ text: t.ok }],
          );
        }
      }
    }
  }, []);

  async function handleConnect() {
    if (!available) {
      const platformName = meta.platform === 'ios' ? 'iPhone or iPad' : 'Android';
      Alert.alert(t.notAvailableTitle, `${meta.name} ${t.notAvailableMsg} ${platformName}.`);
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(true);
    try {
      await connect(id);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    Alert.alert(
      `${t.disconnect} ${meta.name}`,
      t.disconnectMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.disconnect,
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await disconnect(id);
          },
        },
      ]
    );
  }

  const handleSync = useCallback(async () => {
    if (!isConnected) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActionLoading(true);
    setSyncPhase('syncing');
    setSyncCounts(null);
    try {
      await sync(id);
      // After sync, read the counts and errors from the adapter (HealthKit only)
      if (id === 'healthkit' || id === 'apple_watch') {
        try {
          const { getLastHealthKitSyncCounts, getLastHealthKitSyncErrors } = await import('@/lib/data-sources/adapters/healthkit-adapter');
          const counts = getLastHealthKitSyncCounts();
          const errors = getLastHealthKitSyncErrors();
          if (counts) setSyncCounts(counts);
          setSyncErrors(errors);
        } catch (_unused) {}
      }
      setSyncPhase('done');
      // Show success toast with record count when available
      if (id === 'healthkit' || id === 'apple_watch') {
        try {
          const { getLastHealthKitSyncCounts } = await import('@/lib/data-sources/adapters/healthkit-adapter');
          const counts = getLastHealthKitSyncCounts();
          const NUMERIC_KEYS = ['bloodPressure', 'heartRate', 'sleep', 'bodyComposition', 'activity', 'spO2', 'temperature', 'respiratoryRate', 'steps'] as const;
          const totalNew = counts
            ? NUMERIC_KEYS.reduce((sum, k) => sum + (counts[k] as number), 0)
            : 0;
          const sourceName = id === 'apple_watch' ? 'Apple Watch' : 'Apple Health';
          const msg = totalNew > 0
            ? `Synced ${totalNew} record${totalNew === 1 ? '' : 's'} from ${sourceName} \u2713`
            : `Synced from ${sourceName} \u2713`;
          showHealthKitToast(msg);
        } catch (_unused) {
          showHealthKitToast('Synced from Apple Health \u2713');
        }
      }
    } catch (_unused) {
      setSyncPhase('idle');
    } finally {
      setActionLoading(false);
    }
  }, [isConnected, sync, id]);

  const cardBg = isDark ? colors.surface : '#FFFFFF';
  const cardBorder = isDark ? colors.border : '#E5E7EB';
  const accentBg = meta.accentColor + (isDark ? '25' : '15');

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* ── Header ── */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: accentBg }]}>
          <IconSymbol name={meta.iconName as any} size={22} color={meta.accentColor} />
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.sourceName, { color: colors.foreground }]}>{meta.name}</Text>
          <Text style={[styles.sourceSubtitle, { color: colors.muted }]}>{meta.subtitle}</Text>
        </View>
        {/* Status dot */}
        <View style={[styles.statusDot, { backgroundColor: statusColor(state.status, colors) }]} />
      </View>

      {/* ── Status row ── */}
      <View style={styles.statusRow}>
        <Text style={[styles.statusText, { color: statusColor(state.status, colors) }]}>
          {statusLabel(state.status, t)}
        </Text>
        {isConnected && (
          <Text style={[styles.lastSynced, { color: colors.muted }]}>
            · {formatLastSynced(state.lastSyncedAt)}
          </Text>
        )}
        {state.accountLabel && isConnected && (
          <Text style={[styles.accountLabel, { color: colors.muted }]}>
            {' '}· {state.accountLabel}
          </Text>
        )}
      </View>

      {/* ── Error message ── */}
      {hasError && state.errorMessage && (
        <View style={[styles.errorBox, { backgroundColor: (colors.error ?? '#EF4444') + '15', borderColor: (colors.error ?? '#EF4444') + '30' }]}>
          <Text style={[styles.errorText, { color: colors.error ?? '#EF4444' }]} numberOfLines={3}>
            {state.errorMessage}
          </Text>
        </View>
      )}

      {/* ── Data types ── */}
      <View style={styles.dataTypes}>
        {meta.dataTypes.slice(0, 5).map((dt) => (
          <View key={dt} style={[styles.dataTypeChip, { backgroundColor: meta.accentColor + '18', borderColor: meta.accentColor + '30' }]}>
            <Text style={[styles.dataTypeText, { color: meta.accentColor }]}>{dt}</Text>
          </View>
        ))}
        {meta.dataTypes.length > 5 && (
          <View style={[styles.dataTypeChip, { backgroundColor: colors.border, borderColor: colors.border }]}>
            <Text style={[styles.dataTypeText, { color: colors.muted }]}>+{meta.dataTypes.length - 5}</Text>
          </View>
        )}
      </View>

      {/* ── Sync progress ── */}
      {(syncPhase === 'syncing' || syncPhase === 'done') && (id === 'healthkit' || id === 'apple_watch') && (
        <View style={[styles.syncProgress, { backgroundColor: meta.accentColor + '10', borderColor: meta.accentColor + '25' }]}>
          <Text style={[styles.syncProgressTitle, { color: meta.accentColor }]}>
            {syncPhase === 'syncing' ? (t.syncingFromAppleHealth ?? 'Syncing from Apple Health…') : (t.syncComplete ?? 'Sync complete')}
          </Text>
          {syncPhase === 'done' && syncCounts && (() => {
            const NUMERIC_KEYS = ['bloodPressure', 'heartRate', 'sleep', 'bodyComposition', 'activity', 'spO2', 'temperature', 'respiratoryRate', 'steps'] as const;
            const allZero = NUMERIC_KEYS.every(k => (syncCounts[k] as number) === 0);
            return allZero ? (
              <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: (colors.warning ?? '#F59E0B') + '15', borderWidth: 1, borderColor: (colors.warning ?? '#F59E0B') + '40' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.warning ?? '#F59E0B', marginBottom: 4 }}>{t.noDataReturned ?? 'No data returned — possible causes:'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 17 }}>
                  {'1. Running in Expo Go or on a simulator (HealthKit requires a real device + EAS build)\n'}
                  {'2. Permissions denied — tap “Fix Permissions” below to review access\n'}
                  {'3. Apple Health has no data for this period — check the Health app manually\n'}
                  {'4. HealthKit entitlement not active — rebuild via EAS'}
                </Text>
              </View>
            ) : null;
          })()}
          {syncPhase === 'syncing' && (
            <ActivityIndicator size="small" color={meta.accentColor} style={{ marginTop: 6 }} />
          )}
          {syncPhase === 'done' && syncCounts && (
            <View style={styles.syncCountGrid}>
              {([
                { label: 'Blood Pressure', count: syncCounts.bloodPressure, icon: '❤️', key: 'bloodPressure' },
                { label: 'Heart Rate', count: syncCounts.heartRate, icon: '💓', key: 'heartRate' },
                { label: 'SpO₂', count: syncCounts.spO2, icon: '🫁', key: 'spO2' },
                { label: 'Body Temp', count: syncCounts.temperature, icon: '🌡️', key: 'temperature' },
                { label: 'Resp. Rate', count: syncCounts.respiratoryRate ?? 0, icon: '🌬️', key: 'respiratoryRate' },
                { label: 'Sleep', count: syncCounts.sleep, icon: '🌙', key: 'sleep' },
                { label: 'Body Comp', count: syncCounts.bodyComposition, icon: '⚖️', key: 'bodyComposition' },
                { label: 'Workouts', count: syncCounts.activity, icon: '🏃', key: 'activity' },
                { label: 'Steps', count: syncCounts.steps, icon: '👟', key: 'steps' },
              ] as const).map(({ label, count, icon, key }) => {
                const lastTs = syncCounts.lastPerType?.[key as keyof typeof syncCounts.lastPerType] ?? null;
                const lastLabel = lastTs
                  ? safeFormatDate(lastTs, undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : null;
                return (
                  <View key={label} style={styles.syncCountRow}>
                    <Text style={styles.syncCountIcon}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.syncCountLabel, { color: colors.foreground }]}>{label}</Text>
                      {lastLabel && (
                        <Text style={[styles.syncCountSub, { color: colors.muted }]}>Last: {lastLabel}</Text>
                      )}
                    </View>
                    <Text style={[styles.syncCountValue, { color: count > 0 ? meta.accentColor : colors.muted }]}>
                      {count > 0 ? `+${count}` : 'No new data'}
                    </Text>
                  </View>
                );
              })}
              {/* Overall sync timestamp */}
              {syncCounts.syncedAt && (
                <Text style={[styles.syncTimestamp, { color: colors.muted }]}>
                  Synced: {safeFormatDate(syncCounts.syncedAt, undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
              )}
              {/* Sync error rows */}
              {syncErrors.length > 0 && (
                <View style={[styles.syncErrorBox, { backgroundColor: (colors.error ?? '#EF4444') + '15', borderColor: (colors.error ?? '#EF4444') + '40' }]}>
                  <Text style={[styles.syncErrorTitle, { color: colors.error ?? '#EF4444' }]}>
                    {syncErrors.length} issue{syncErrors.length !== 1 ? 's' : ''} during sync
                  </Text>
                  {syncErrors.map((err, i) => (
                    <Text key={i} style={[styles.syncErrorText, { color: colors.muted }]}>• {err}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Debug: Fetch Last 30 Days (Apple Health only, iOS) ── */}
      {isAppleHealthSource && Platform.OS === 'ios' && isConnected && (
        <>
          <Pressable
            style={({ pressed }) => [{
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#6366F1' + '50',
              backgroundColor: '#6366F1' + '10',
              opacity: pressed || debugFetching ? 0.7 : 1,
            }]}
            disabled={debugFetching}
            onPress={async () => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDebugFetching(true);
              setDebugResult(null);
              try {
                const { getNativeHealthService } = await import('@/lib/health/native-health-service');
                const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                console.log('[HealthKit Debug] Fetching last 30 days since', since.toISOString());
                const result = await getNativeHealthService().syncAll(since);
                const counts: Record<string, number> = {
                  'Blood Pressure': (result.bloodPressure ?? []).length,
                  'Heart Rate': (result.heartRate ?? []).length,
                  'SpO₂': (result.spO2 ?? []).length,
                  'Body Temp': (result.temperature ?? []).length,
                  'Resp. Rate': (result.respiratoryRate ?? []).length,
                  'Sleep': (result.sleep ?? []).length,
                  'Body Comp': (result.bodyComposition ?? []).length,
                  'Workouts': (result.activity ?? []).length,
                  'Steps': result.steps ?? 0,
                };
                console.log('[HealthKit Debug] 30-day raw counts:', JSON.stringify(counts));
                setDebugResult(counts);
                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                if (total === 0) {
                  console.warn('[HealthKit Debug] All types returned 0 — check permissions and Apple Health data');
                }
              } catch (e: any) {
                console.error('[HealthKit Debug] fetch failed:', e?.message ?? e);
                Alert.alert(t.debugFetchFailed ?? 'Debug Fetch Failed', e?.message ?? String(e));
              } finally {
                setDebugFetching(false);
              }
            }}
          >
            {debugFetching
              ? <ActivityIndicator size="small" color="#6366F1" />
              : <>
                  <IconSymbol name="magnifyingglass" size={13} color="#6366F1" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6366F1' }}>{t.fetchLast30Days ?? 'Fetch Last 30 Days Data'}</Text>
                </>
            }
          </Pressable>
          {debugResult && (
            <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: '#6366F1' + '10', borderWidth: 1, borderColor: '#6366F1' + '30' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6366F1', marginBottom: 6 }}>30-Day Debug Results</Text>
              {Object.entries(debugResult).map(([label, count]) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: count > 0 ? '#22C55E' : colors.muted }}>
                    {count > 0 ? `${count} record${count === 1 ? '' : 's'}` : 'No data'}
                  </Text>
                </View>
              ))}
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 6 }}>Full results logged to console (Metro)</Text>
            </View>
          )}
        </>
      )}

      {/* ── Fix Permissions button (Apple Health sources, iOS only) ── */}
      {isAppleHealthSource && Platform.OS === 'ios' && (
        <Pressable
          style={({ pressed }) => [
            styles.fixPermBtn,
            { borderColor: meta.accentColor + '50', opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={handleFixPermissions}
        >
          <IconSymbol name="lock.open.fill" size={13} color={meta.accentColor} />
              <Text style={[styles.fixPermBtnText, { color: meta.accentColor }]}>{t.fixPermissions}</Text>
        </Pressable>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {!isConnected ? (
          <Pressable
            style={({ pressed }) => [
              styles.connectBtn,
              { backgroundColor: available ? meta.accentColor : colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.connectBtnText}>{available ? t.connect : t.unavailable}</Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.connectedActions}>
            <Pressable
              style={({ pressed }) => [
                styles.syncBtn,
                { backgroundColor: meta.accentColor + '18', borderColor: meta.accentColor + '40', opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleSync}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color={meta.accentColor} />
              ) : (
                <>
                  <IconSymbol name="arrow.clockwise" size={14} color={meta.accentColor} />
                  <Text style={[styles.syncBtnText, { color: meta.accentColor }]}>{t.syncNow}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.disconnectBtn,
                { borderColor: (colors.error ?? '#EF4444') + '50', opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleDisconnect}
            >
              <Text style={[styles.disconnectBtnText, { color: colors.error ?? '#EF4444' }]}>{t.disconnect}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DataSourcesScreen() {
  const colors = useColors() as Record<string, string>;
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const lang = useLang();
  const t = ((settingsExtStrings as unknown as Record<string, typeof settingsExtStrings.en>)[lang] ?? settingsExtStrings.en);
  const { isAvailable } = useDataSources();

  // Group sources by platform
  const iosSources: DataSourceId[] = ['healthkit', 'apple_watch'];
  const androidSources: DataSourceId[] = ['health_connect', 'wear_os'];
  const crossSources: DataSourceId[] = ['oura', 'garmin'];

  function SectionHeader({ title }: { title: string }) {
    return (
      <Text style={[styles.sectionHeader, { color: colors.muted }]}>{title.toUpperCase()}</Text>
    );
  }

  return (
    <ScreenContainer>
      {/* ── Nav header ── */}
      <View style={[styles.navHeader, { borderBottomColor: colors.border, backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>{t.settings}</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>{t.dataSourcesTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={[styles.introBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '25' }]}>
          <IconSymbol name="arrow.triangle.2.circlepath" size={18} color={colors.primary} />
          <Text style={[styles.introText, { color: colors.foreground }]}>
            {t.dataSourcesIntro}
          </Text>
        </View>

        {/* iOS / Apple sources */}
        <SectionHeader title="Apple" />
        {iosSources.map((id) => (
          <SourceCard key={id} id={id} available={isAvailable(id)} />
        ))}

        {/* Android sources */}
        <SectionHeader title="Android" />
        {androidSources.map((id) => (
          <SourceCard key={id} id={id} available={isAvailable(id)} />
        ))}

        {/* Cross-platform / wearable sources */}
        <SectionHeader title="Wearables & Third-Party" />
        {crossSources.map((id) => (
          <SourceCard key={id} id={id} available={isAvailable(id)} />
        ))}

        {/* Color Guide link */}
        <Pressable
          style={({ pressed }) => [styles.colorGuideRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/color-legend' as any);
          }}
        >
          <View style={styles.colorGuideDots}>
            {['#10B981', '#F59E0B', '#EF4444', '#3B82F6'].map((c) => (
              <View key={c} style={[styles.colorGuideDot, { backgroundColor: c }]} />
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.colorGuideTitle, { color: colors.foreground }]}>Color Guide</Text>
            <Text style={[styles.colorGuideSub, { color: colors.muted }]}>What do the status colors mean?</Text>
          </View>
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </Pressable>

        {/* API key note for OAuth sources */}
        <View style={[styles.noteBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="info.circle.fill" size={16} color={colors.muted} />
          <Text style={[styles.noteText, { color: colors.muted }]}>
            Oura Ring and Garmin Connect require API credentials from their developer portals. Add{' '}
            <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_OURA_CLIENT_ID</Text> and{' '}
            <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_GARMIN_CONSUMER_KEY</Text> to your environment to enable OAuth.
          </Text>
        </View>

        <EvidenceRefBanner
          accentColor="#0EA5E9"
          heading="Wearable Accuracy & Data Privacy"
          refs={[
            { label: 'AHA Wearable Device Accuracy 2019', url: 'https://pubmed.ncbi.nlm.nih.gov/31154804/', badge: 'AHA' },
            { label: 'Apple HealthKit Privacy Docs', url: 'https://developer.apple.com/documentation/healthkit/protecting_user_privacy', badge: 'Apple' },          ]}
          style={{ marginHorizontal: 0, marginBottom: 0 }}
        />
        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  backText: {
    fontSize: 16,
    fontWeight: '400',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  introBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  introText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardMeta: {
    flex: 1,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  sourceSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lastSynced: {
    fontSize: 12,
  },
  accountLabel: {
    fontSize: 12,
  },
  errorBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
  },
  dataTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  dataTypeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  dataTypeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  actions: {
    marginTop: 2,
  },
  connectBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  connectedActions: {
    flexDirection: 'row',
    gap: 10,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    minHeight: 42,
  },
  syncBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disconnectBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    minHeight: 42,
  },
  disconnectBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  syncProgress: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    marginTop: 4,
  },
  syncProgressTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  syncCountGrid: {
    marginTop: 6,
    gap: 6,
  },
  syncCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncCountIcon: {
    fontSize: 13,
    width: 20,
    textAlign: 'center',
  },
  syncCountLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  syncCountSub: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  syncCountValue: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  syncTimestamp: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  syncErrorBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
  },
  syncErrorTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  syncErrorText: {
    fontSize: 12,
    lineHeight: 17,
  },
  fixPermBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  fixPermBtnText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  colorGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  colorGuideDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  colorGuideDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  colorGuideTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  colorGuideSub: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
});
