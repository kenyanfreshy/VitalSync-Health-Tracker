/**
 * VitalCardActionSheet
 * Cross-platform action sheet triggered by long-pressing a vital card.
 * iOS: ActionSheetIOS (native feel)
 * Android/Web: Modal bottom sheet (custom, dark-mode adaptive)
 *
 * Actions:
 *  - Set Threshold → navigates to /settings/thresholds
 *  - View History  → navigates to the detail screen for that vital
 *  - Share Reading → shares the latest value via the OS share sheet
 */

import React from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';

export type VitalCardType = 'blood-pressure' | 'pulse' | 'spo2' | 'sleep' | 'temperature' | 'ekg';

interface VitalCardActionSheetProps {
  visible: boolean;
  vitalType: VitalCardType;
  vitalLabel: string;
  latestValue: string;   // e.g. "118/76 mmHg" or "62 BPM"
  onClose: () => void;
}

const DETAIL_ROUTES: Record<VitalCardType, string> = {
  'blood-pressure': '/detail/blood-pressure',
  'pulse': '/detail/pulse',
  'spo2': '/detail/spo2',
  'sleep': '/detail/sleep',
  'temperature': '/detail/temperature',
  'ekg': '/detail/ekg',
};

const ACTIONS = [
  {
    id: 'threshold',
    label: 'Set Threshold',
    subtitle: 'Configure alert limits for this vital',
    icon: 'bolt.fill' as const,
    colorKey: 'bpAmber' as const,
  },
  {
    id: 'history',
    label: 'View History',
    subtitle: 'See trends and detailed readings',
    icon: 'chart.bar.fill' as const,
    colorKey: 'primary' as const,
  },
  {
    id: 'share',
    label: 'Share Reading',
    subtitle: 'Share your latest value',
    icon: 'paperplane.fill' as const,
    colorKey: 'bpGreen' as const,
  },
];

/**
 * Trigger the action sheet.
 * On iOS, uses native ActionSheetIOS.
 * On Android/Web, sets `visible = true` to show the custom Modal.
 */
export function triggerVitalCardActionSheet(
  vitalType: VitalCardType,
  vitalLabel: string,
  latestValue: string,
  onShowModal: () => void,
) {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: vitalLabel,
        message: `Latest: ${latestValue}`,
        options: ['Cancel', 'Set Threshold', 'View History', 'Share Reading'],
        cancelButtonIndex: 0,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) {
          router.push('/settings/thresholds' as any);
        } else if (buttonIndex === 2) {
          router.push(DETAIL_ROUTES[vitalType] as any);
        } else if (buttonIndex === 3) {
          Share.share({
            message: `My latest ${vitalLabel}: ${latestValue} — tracked with VitalSync`,
          });
        }
      }
    );
  } else {
    // Android / Web: show custom modal
    onShowModal();
  }
}

export function VitalCardActionSheet({
  visible,
  vitalType,
  vitalLabel,
  latestValue,
  onClose,
}: VitalCardActionSheetProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  function handleAction(id: string) {
    onClose();
    // Small delay so the modal closes before navigating
    setTimeout(() => {
      if (id === 'threshold') {
        router.push('/settings/thresholds' as any);
      } else if (id === 'history') {
        router.push(DETAIL_ROUTES[vitalType] as any);
      } else if (id === 'share') {
        Share.share({
          message: `My latest ${vitalLabel}: ${latestValue} — tracked with VitalSync`,
        });
      }
    }, 120);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: isDark ? colors.surfaceHigh : '#FFFFFF',
            borderColor: isDark ? colors.borderStrong : colors.border,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: isDark ? colors.borderStrong : '#D1D5DB' }]} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{vitalLabel}</Text>
          <Text style={[styles.sheetLatest, { color: colors.muted }]}>Latest: {latestValue}</Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: isDark ? colors.borderStrong : colors.border }]} />

        {/* Action rows */}
        {ACTIONS.map((action, idx) => {
          const accentColor = (colors as any)[action.colorKey] ?? colors.primary;
          return (
            <Pressable
              key={action.id}
              style={({ pressed }) => [
                styles.actionRow,
                {
                  backgroundColor: pressed
                    ? (isDark ? colors.surfaceRaised : '#F5F5F5')
                    : 'transparent',
                  borderBottomColor: isDark ? colors.borderStrong : colors.border,
                  borderBottomWidth: idx < ACTIONS.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                handleAction(action.id);
              }}
            >
              <View style={[styles.actionIcon, { backgroundColor: accentColor + '18' }]}>
                <IconSymbol name={action.icon} size={16} color={accentColor} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionLabel, { color: colors.foreground }]}>{action.label}</Text>
                <Text style={[styles.actionSubtitle, { color: colors.muted }]}>{action.subtitle}</Text>
              </View>
              <IconSymbol name="chevron.right" size={14} color={colors.muted} />
            </Pressable>
          );
        })}

        {/* Cancel button */}
        <Pressable
          style={({ pressed }) => [
            styles.cancelBtn,
            {
              backgroundColor: isDark ? colors.surface : '#F5F5F5',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={onClose}
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sheetLatest: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
