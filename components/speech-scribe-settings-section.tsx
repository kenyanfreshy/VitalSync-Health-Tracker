/**
 * SpeechScribeSettingsSection
 *
 * A self-contained settings section that shows the current microphone and
 * speech recognition permission status for VitalSync Scribe, and lets
 * clinicians request access or navigate to iPhone Settings to fix denied
 * permissions — all without leaving the app.
 *
 * Architecture notes:
 *  - Uses AppleSpeechModule.requestPermissions() (iOS only) to check status.
 *  - All async calls are wrapped in try/catch; no crash on permission API failure.
 *  - No duplicate listeners; state updates guarded by isMounted ref.
 *  - On web/Android the section renders a graceful "not available" state.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';

// ── Permission API (iOS only) ─────────────────────────────────────────────────
// Imported lazily so the module never throws on web/Android.
let AppleSpeechNative: {
  requestPermissions: () => Promise<{ speech: boolean; microphone: boolean }>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('apple-speech');
  AppleSpeechNative = mod.AppleSpeechModule ?? null;
} catch (_) {
  AppleSpeechNative = null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PermState = 'unknown' | 'granted' | 'denied' | 'unavailable';

interface ScribePermissions {
  microphone: PermState;
  speech: PermState;
}

type ScribeStatus = 'enabled' | 'needs_permission' | 'disabled';

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveScribeStatus(perms: ScribePermissions): ScribeStatus {
  if (perms.microphone === 'unavailable' || perms.speech === 'unavailable') {
    return 'disabled';
  }
  if (perms.microphone === 'granted' && perms.speech === 'granted') {
    return 'enabled';
  }
  return 'needs_permission';
}

function permLabel(state: PermState): string {
  switch (state) {
    case 'granted':     return 'Granted';
    case 'denied':      return 'Denied';
    case 'unavailable': return 'Not Available';
    default:            return 'Unknown';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ state }: { state: PermState }) {
  const color =
    state === 'granted'     ? '#22C55E' :
    state === 'denied'      ? '#EF4444' :
    state === 'unavailable' ? '#64748B' :
                              '#F59E0B';
  return (
    <View
      style={[styles.dot, { backgroundColor: color }]}
      accessibilityLabel={`Permission status: ${permLabel(state)}`}
    />
  );
}

function PermRow({
  icon,
  label,
  state,
  accentColor,
  foreground,
  muted,
  border,
}: {
  icon: 'mic.fill' | 'waveform';
  label: string;
  state: PermState;
  accentColor: string;
  foreground: string;
  muted: string;
  border: string;
}) {
  const badgeColor =
    state === 'granted'     ? '#22C55E' :
    state === 'denied'      ? '#EF4444' :
    state === 'unavailable' ? '#64748B' :
                              '#F59E0B';

  const badgeBg = badgeColor + '18';

  return (
    <View style={[styles.permRow, { borderBottomColor: border }]}>
      {/* Icon */}
      <View style={[styles.rowIconWrap, { backgroundColor: accentColor + '18' }]}>
        <IconSymbol name={icon} size={16} color={accentColor} />
      </View>
      {/* Label + sub */}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: muted }]}>
          {state === 'unavailable'
            ? 'Not available on this platform'
            : state === 'unknown'
            ? 'Tap "Check Permissions" to verify'
            : state === 'granted'
            ? 'Access is enabled'
            : 'Access is denied — tap "Open iPhone Settings"'}
        </Text>
      </View>
      {/* Badge */}
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <StatusDot state={state} />
        <Text style={[styles.badgeText, { color: badgeColor }]}>
          {permLabel(state)}
        </Text>
      </View>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  variant,
  foreground,
  border,
  primary,
  disabled,
}: {
  label: string;
  icon: 'arrow.clockwise' | 'hand.raised.fill' | 'gear';
  onPress: () => void;
  variant: 'primary' | 'secondary';
  foreground: string;
  border: string;
  primary: string;
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? primary : 'transparent';
  const textColor = variant === 'primary' ? '#FFFFFF' : foreground;
  const borderColor = variant === 'primary' ? 'transparent' : border;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: bg, borderColor, opacity: pressed || disabled ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <IconSymbol name={icon} size={14} color={textColor} />
      <Text style={[styles.actionBtnText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SpeechScribeSettingsSection() {
  const colors = useColors();
  const isMounted = useRef(true);

  const [perms, setPerms] = useState<ScribePermissions>({
    microphone: 'unknown',
    speech: 'unknown',
  });
  const [checking, setChecking] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const isIOS = Platform.OS === 'ios';
  const isAvailable = isIOS && AppleSpeechNative !== null;

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ── Initial check on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAvailable) {
      setPerms({ microphone: 'unavailable', speech: 'unavailable' });
      return;
    }
    // Silently probe on mount (no UI spinner — just a quick background check)
    (async () => {
      try {
        const result = await AppleSpeechNative!.requestPermissions();
        if (!isMounted.current) return;
        setPerms({
          microphone: result.microphone ? 'granted' : 'denied',
          speech:     result.speech     ? 'granted' : 'denied',
        });
      } catch (_) {
        // Silently ignore — user can tap "Check Permissions" manually
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAvailable]);

  // ── Check permissions ──────────────────────────────────────────────────────
  const handleCheck = useCallback(async () => {
    if (!isAvailable) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChecking(true);
    try {
      const result = await AppleSpeechNative!.requestPermissions();
      if (!isMounted.current) return;
      setPerms({
        microphone: result.microphone ? 'granted' : 'denied',
        speech:     result.speech     ? 'granted' : 'denied',
      });
    } catch (e) {
      if (!isMounted.current) return;
      const msg = e instanceof Error ? e.message : 'Could not check permissions';
      Alert.alert('Permission Check Failed', msg);
    } finally {
      if (isMounted.current) setChecking(false);
    }
  }, [isAvailable]);

  // ── Request access ─────────────────────────────────────────────────────────
  const handleRequest = useCallback(async () => {
    if (!isAvailable) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRequesting(true);
    try {
      const result = await AppleSpeechNative!.requestPermissions();
      if (!isMounted.current) return;
      const newPerms: ScribePermissions = {
        microphone: result.microphone ? 'granted' : 'denied',
        speech:     result.speech     ? 'granted' : 'denied',
      };
      setPerms(newPerms);
      const status = deriveScribeStatus(newPerms);
      if (status === 'enabled') {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Scribe Enabled',
          'Microphone and speech recognition are both enabled. Scribe is ready to use.',
          [{ text: 'Great!' }],
        );
      } else {
        // One or both were denied — guide to Settings
        Alert.alert(
          'Permission Required',
          'One or more permissions were denied. Please open iPhone Settings and enable them manually.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openURL('app-settings:') },
          ],
        );
      }
    } catch (e) {
      if (!isMounted.current) return;
      const msg = e instanceof Error ? e.message : 'Could not request permissions';
      Alert.alert('Request Failed', msg);
    } finally {
      if (isMounted.current) setRequesting(false);
    }
  }, [isAvailable]);

  // ── Open iPhone Settings ───────────────────────────────────────────────────
  const handleOpenSettings = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL('app-settings:');
    } catch (_) {
      Alert.alert(
        'Cannot Open Settings',
        'Please open the iPhone Settings app manually, tap VitalSync, and enable Microphone and Speech Recognition.',
      );
    }
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const scribeStatus = deriveScribeStatus(perms);
  const isDenied = perms.microphone === 'denied' || perms.speech === 'denied';
  const isEnabled = scribeStatus === 'enabled';

  const statusColor =
    isEnabled      ? '#22C55E' :
    isDenied       ? '#EF4444' :
    !isAvailable   ? '#64748B' :
                     '#F59E0B';

  const statusLabel =
    isEnabled    ? 'Enabled' :
    !isAvailable ? 'Not Available' :
    isDenied     ? 'Denied — Action Required' :
                   'Needs Permission';

  const statusIcon =
    isEnabled    ? 'checkmark.circle.fill' as const :
    !isAvailable ? 'xmark.circle.fill' as const :
    isDenied     ? 'exclamationmark.triangle.fill' as const :
                   'exclamationmark.circle.fill' as const;

  return (
    <View style={styles.container}>

      {/* ── Overall Scribe status banner ─────────────────────────────────── */}
      <View style={[styles.statusBanner, { backgroundColor: statusColor + '14', borderColor: statusColor + '40' }]}>
        <IconSymbol name={statusIcon} size={18} color={statusColor} />
        <View style={styles.statusBannerText}>
          <Text style={[styles.statusTitle, { color: statusColor }]}>
            Scribe Status: {statusLabel}
          </Text>
          <Text style={[styles.statusSub, { color: colors.muted }]}>
            {isEnabled
              ? 'Voice dictation is ready. Tap the mic icon on any log screen.'
              : !isAvailable
              ? 'Apple Speech Recognition requires a physical iOS device.'
              : isDenied
              ? 'One or more permissions are denied. Follow the steps below.'
              : 'Tap "Request Access" to enable voice dictation.'}
          </Text>
        </View>
      </View>

      {/* ── Permission rows ──────────────────────────────────────────────── */}
      <View style={[styles.permCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <PermRow
          icon="mic.fill"
          label="Microphone"
          state={perms.microphone}
          accentColor="#0D9488"
          foreground={colors.foreground}
          muted={colors.muted}
          border={colors.border}
        />
        <PermRow
          icon="waveform"
          label="Speech Recognition"
          state={perms.speech}
          accentColor="#6366F1"
          foreground={colors.foreground}
          muted={colors.muted}
          border="transparent"
        />
      </View>

      {/* ── Explanation copy ─────────────────────────────────────────────── */}
      <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.infoRow}>
          <IconSymbol name="info.circle.fill" size={14} color={colors.muted} />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            VitalSync uses Apple Speech Recognition and microphone access to turn your voice into text and auto-fill forms.
          </Text>
        </View>
        <View style={[styles.infoRow, { marginTop: 8 }]}>
          <IconSymbol name="info.circle.fill" size={14} color={colors.muted} />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            Your microphone must be enabled and speech recognition must be allowed in iPhone Settings.
          </Text>
        </View>
        <View style={[styles.infoRow, { marginTop: 8 }]}>
          <IconSymbol name="info.circle.fill" size={14} color={colors.muted} />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            Speech is used only when you tap the microphone. No audio is recorded in the background.
          </Text>
        </View>
      </View>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <View style={styles.actionsRow}>
        <ActionButton
          label={checking ? 'Checking…' : 'Check Permissions'}
          icon="arrow.clockwise"
          onPress={handleCheck}
          variant="secondary"
          foreground={colors.foreground}
          border={colors.border}
          primary={colors.primary}
          disabled={checking || !isAvailable}
        />
        <ActionButton
          label={requesting ? 'Requesting…' : 'Request Access'}
          icon="hand.raised.fill"
          onPress={handleRequest}
          variant="primary"
          foreground={colors.foreground}
          border={colors.border}
          primary={colors.primary}
          disabled={requesting || !isAvailable || isEnabled}
        />
      </View>

      <View style={[styles.actionsRow, { marginTop: 8 }]}>
        <ActionButton
          label="Open iPhone Settings"
          icon="gear"
          onPress={handleOpenSettings}
          variant="secondary"
          foreground={colors.foreground}
          border={colors.border}
          primary={colors.primary}
        />
      </View>

      {/* ── Step-by-step guide (shown only when denied) ──────────────────── */}
      {isDenied && isIOS && (
        <View style={[styles.stepsCard, { backgroundColor: '#EF444414', borderColor: '#EF444440' }]}>
          <Text style={[styles.stepsTitle, { color: '#EF4444' }]}>
            How to fix denied permissions
          </Text>
          {[
            'Open the iPhone Settings app.',
            'Scroll down and tap VitalSync.',
            'Turn on Microphone.',
            'Go to Settings → Privacy & Security → Speech Recognition.',
            'Enable VitalSync in the Speech Recognition list.',
            'Return to VitalSync and tap "Check Permissions" or "Refresh".',
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: '#EF444430' }]}>
                <Text style={[styles.stepNumText, { color: '#EF4444' }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Refresh button ───────────────────────────────────────────────── */}
      <Pressable
        onPress={handleCheck}
        disabled={checking || !isAvailable}
        style={({ pressed }) => [
          styles.refreshBtn,
          { borderColor: colors.border, opacity: pressed || checking || !isAvailable ? 0.5 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Refresh permission status"
      >
        {checking
          ? <ActivityIndicator size="small" color={colors.muted} />
          : <IconSymbol name="arrow.clockwise" size={14} color={colors.muted} />}
        <Text style={[styles.refreshText, { color: colors.muted }]}>
          {checking ? 'Refreshing…' : 'Refresh Permission Status'}
        </Text>
      </Pressable>

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <Text style={[styles.footerNote, { color: colors.muted }]}>
        If dictation is not working, re-enable permissions in iPhone Settings.
      </Text>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },

  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBannerText: {
    flex: 1,
    gap: 3,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  statusSub: {
    fontSize: 12,
    lineHeight: 17,
  },

  // Permission rows card
  permCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Info card
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Steps card (shown on denied)
  stepsCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },

  // Refresh button
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Footer
  footerNote: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
});
