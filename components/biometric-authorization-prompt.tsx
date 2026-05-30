/**
 * BiometricAuthorizationPrompt
 *
 * Terminal-style [SYSTEM_INTEGRITY_CHECK] screen shown when HealthKit telemetry
 * is locked or permissions have not been granted. Explains why VitalSync needs
 * access to Apple Watch heart rate and active energy data, then triggers the
 * native HealthKit authorization sheet via requestHealthPermissions().
 *
 * Design: Signal-Black (#060D06) background, Phosphor-Green (#00FF41) text,
 * monospaced Courier/SF Mono font throughout.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SYSTEM_FONT_MONO as MONO } from '@/lib/_core/fonts';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { OscilloscopeWaveform } from '@/components/oscilloscope-waveform';
import { requestHealthPermissions } from '@/lib/health/permissions';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');


// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthCoreStatus =
  | 'locked'        // permissions not yet requested
  | 'unavailable'   // HealthKit not available on this device
  | 'denied'        // user previously denied
  | 'granted';      // all permissions granted

interface BiometricAuthorizationPromptProps {
  visible: boolean;
  /** Current HealthKit status — drives the diagnostic message. Defaults to 'locked'. */
  status?: HealthCoreStatus;
  onGranted: () => void;
  onDismiss: () => void;
}

// ─── Diagnostic messages per status ──────────────────────────────────────────

const DIAGNOSTIC: Record<HealthCoreStatus, { title: string; body: string; severity: string }> = {
  locked: {
    title: 'HEALTH_CORE_TELEMETRY: LOCKED',
    body: 'VitalSync requires access to your Apple Watch heart rate and active energy data to calculate your Logarithmic Metabolic Flux. Authorization has not yet been initiated.',
    severity: 'CAUTION',
  },
  unavailable: {
    title: 'HEALTH_CORE_TELEMETRY: UNAVAILABLE',
    body: 'HealthKit is not available on this device. Ensure the app is running on a physical iPhone with iOS 15+ and that the HealthKit entitlement is active in the provisioning profile.',
    severity: 'ERROR',
  },
  denied: {
    title: 'HEALTH_CORE_TELEMETRY: ACCESS_DENIED',
    body: 'Authorization was previously denied. To restore access, navigate to Settings → Privacy & Security → Health → VitalSync and enable the required data types.',
    severity: 'WARNING',
  },
  granted: {
    title: 'HEALTH_CORE_TELEMETRY: AUTHORIZED',
    body: 'All required health data types are authorized. Metabolic Flux calculations are active.',
    severity: 'OK',
  },
};

const SEVERITY_COLOR: Record<string, string> = {
  CAUTION:  '#F59E0B',
  ERROR:    '#EF4444',
  WARNING:  '#F97316',
  OK:       '#00FF41',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BiometricAuthorizationPrompt({
  visible,
  status = 'locked',
  onGranted,
  onDismiss,
}: BiometricAuthorizationPromptProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [requesting, setRequesting] = useState(false);
  const [localStatus, setLocalStatus] = useState<HealthCoreStatus>(status);
  const [scanPhase, setScanPhase] = useState<'idle' | 'scanning' | 'done'>('idle');

  // Sync external status changes
  useEffect(() => { setLocalStatus(status); }, [status]);

  // Slide animation
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleGrantAccess = useCallback(async () => {
    if (requesting) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (localStatus === 'unavailable') {
      // Can't request on this device — show info
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (localStatus === 'denied') {
      // Direct user to Settings — can't re-request programmatically after denial
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setRequesting(true);
    setScanPhase('scanning');

    try {
      await requestHealthPermissions();
      setScanPhase('done');
      // Small delay to let the oscilloscope finish
      setTimeout(() => {
        setRequesting(false);
        setLocalStatus('granted');
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onGranted();
      }, 1800);
    } catch (_unused) {
      setRequesting(false);
      setScanPhase('idle');
      setLocalStatus('denied');
    }
  }, [requesting, localStatus, onGranted]);

  const diag = DIAGNOSTIC[localStatus];
  const severityColor = SEVERITY_COLOR[diag.severity] ?? '#00FF41';
  const _isActionable = localStatus === 'locked' || localStatus === 'granted';

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      {/* Backdrop */}
      <Animated.View
        style={[s.backdrop, { opacity: backdropAnim }]}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={s.handle} />

        {/* Terminal header */}
        <View style={s.termHeader}>
          <Text style={s.termId}>[SYSTEM_ID: MANUS_v4.2 // BIOMETRIC_AUTH]</Text>
          <View style={[s.statusPill, { borderColor: severityColor + '60', backgroundColor: severityColor + '12' }]}>
            <Text style={[s.statusPillText, { color: severityColor }]}>{diag.severity}</Text>
          </View>
        </View>

        {/* Oscilloscope — plays during scanning */}
        {(scanPhase === 'scanning' || scanPhase === 'done') && (
          <View style={s.waveWrap}>
            <OscilloscopeWaveform
              active={scanPhase === 'scanning'}
              showReplay={scanPhase === 'done'}
            />
          </View>
        )}

        {/* Diagnostic card */}
        <View style={[s.diagCard, { borderColor: severityColor + '40' }]}>
          <Text style={[s.diagTitle, { color: severityColor }]}>
            DIAGNOSTIC: {diag.title}
          </Text>
          <Text style={s.diagBody}>{diag.body}</Text>
        </View>

        {/* Data types being requested */}
        {localStatus === 'locked' && (
          <View style={s.dataTypesCard}>
            <Text style={s.dataTypesLabel}>DATA_TYPES_REQUESTED:</Text>
            {[
              'Heart Rate (HKQuantityTypeIdentifierHeartRate)',
              'Active Energy Burned (HKQuantityTypeIdentifierActiveEnergyBurned)',
              'Resting Heart Rate',
              'HRV (SDNN)',
              'Workout Sessions (HKWorkoutTypeIdentifier)',
              'VO2 Max (HKQuantityTypeIdentifierVO2Max)',
            ].map((type) => (
              <View key={type} style={s.dataTypeRow}>
                <Text style={s.dataTypeDot}>▸</Text>
                <Text style={s.dataTypeText}>{type}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Rationale */}
        <View style={s.rationaleCard}>
          <Text style={s.rationaleLabel}>RATIONALE:</Text>
          <Text style={s.rationaleText}>
            VitalSync requires access to your Apple Watch heart rate and active energy data to calculate your{' '}
            <Text style={s.rationaleHighlight}>Logarithmic Metabolic Flux</Text>
            {' '}— the real-time adjustment of your daily caloric ceiling based on exercise intensity and EPOC recovery.
          </Text>
          <Text style={[s.rationaleText, { marginTop: 6 }]}>
            Your data is solely owned by you, does not sync with any outside server, and remains on your device.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={s.actionRow}>
          {localStatus === 'locked' && (
            <Pressable
              style={({ pressed }) => [
                s.grantBtn,
                { opacity: pressed || requesting ? 0.7 : 1 },
              ]}
              onPress={handleGrantAccess}
              disabled={requesting}
            >
              {requesting ? (
                <ActivityIndicator color="#060D06" size="small" />
              ) : (
                <Text style={s.grantBtnText}>[GRANT_ACCESS_TO_HEALTH_CORE]</Text>
              )}
            </Pressable>
          )}

          {localStatus === 'denied' && (
            <Pressable
              style={[s.grantBtn, { backgroundColor: '#F97316' }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDismiss();
              }}
            >
              <Text style={s.grantBtnText}>[OPEN_SETTINGS_TO_RESTORE_ACCESS]</Text>
            </Pressable>
          )}

          {localStatus === 'unavailable' && (
            <View style={[s.grantBtn, { backgroundColor: '#EF444430', borderColor: '#EF4444' }]}>
              <Text style={[s.grantBtnText, { color: '#EF4444' }]}>[HEALTHKIT_UNAVAILABLE_ON_THIS_DEVICE]</Text>
            </View>
          )}

          {localStatus === 'granted' && (
            <Pressable
              style={[s.grantBtn, { backgroundColor: '#00FF4120', borderColor: '#00FF41' }]}
              onPress={onDismiss}
            >
              <Text style={[s.grantBtnText, { color: '#00FF41' }]}>[HEALTH_CORE_AUTHORIZED ✓]</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={s.dismissBtn} onPress={onDismiss}>
          <Text style={s.dismissText}>[DISMISS]</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#060D06',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00FF4130',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  termHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  termId: {
    fontFamily: MONO,
    fontSize: 9,
    color: '#00FF4180',
    flex: 1,
    letterSpacing: 0.3,
  },
  statusPill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  waveWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  diagCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    backgroundColor: '#0A1A0A',
  },
  diagTitle: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  diagBody: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#00FF4199',
    lineHeight: 17,
  },
  dataTypesCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00FF4120',
    padding: 12,
    gap: 5,
    backgroundColor: '#0A1A0A',
  },
  dataTypesLabel: {
    fontFamily: MONO,
    fontSize: 9,
    color: '#00FF4160',
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dataTypeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  dataTypeDot: {
    fontFamily: MONO,
    fontSize: 10,
    color: '#00FF4180',
    lineHeight: 16,
  },
  dataTypeText: {
    fontFamily: MONO,
    fontSize: 10,
    color: '#00FF4199',
    lineHeight: 16,
    flex: 1,
  },
  rationaleCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00FF4115',
    padding: 12,
    gap: 4,
    backgroundColor: '#0A1A0A',
  },
  rationaleLabel: {
    fontFamily: MONO,
    fontSize: 9,
    color: '#00FF4160',
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rationaleText: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#00FF4199',
    lineHeight: 17,
  },
  rationaleHighlight: {
    color: '#00FF41',
    fontWeight: '800',
  },
  actionRow: {
    gap: 10,
  },
  grantBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#00FF41',
    borderWidth: 1,
    borderColor: '#00FF41',
  },
  grantBtnText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: '#060D06',
    letterSpacing: 0.4,
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    fontFamily: MONO,
    fontSize: 10,
    color: '#00FF4150',
    letterSpacing: 0.4,
  },
});
