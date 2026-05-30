/**
 * KeyboardDictationBanner
 *
 * A one-time dismissible tip shown at the top of every log/form screen.
 * Informs users they can tap the keyboard mic (🎤) to dictate into any text field.
 *
 * Works on both iOS (native keyboard) and Android (Gboard).
 * The banner is shown once per app install and then permanently dismissed via AsyncStorage.
 *
 * Usage (basic — manual dismiss only):
 *   <KeyboardDictationBanner />
 *
 * Usage (auto-dismiss on first keystroke):
 *   const bannerRef = useRef<KeyboardDictationBannerHandle>(null);
 *   <KeyboardDictationBanner ref={bannerRef} />
 *   <TextInput onChangeText={(t) => { if (t.length > 0) bannerRef.current?.dismiss(); ... }} />
 *
 * The banner collapses with a smooth animation when dismissed.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import * as Haptics from 'expo-haptics';
import { useColors, useLang } from '@/hooks';
import { logAllVitalsStrings } from '@/lib/i18n';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const DICTATION_BANNER_KEY = '@vsht:kb_dictation_banner_dismissed_v1';

export interface KeyboardDictationBannerHandle {
  /** Programmatically dismiss the banner (e.g. on first keystroke). Idempotent. */
  dismiss: () => void;
}

export interface KeyboardDictationBannerProps {
  /** Called after the banner is dismissed (either by user tap or programmatically). */
  onDismiss?: () => void;
}

export const KeyboardDictationBanner = forwardRef<
  KeyboardDictationBannerHandle,
  KeyboardDictationBannerProps
>(function KeyboardDictationBanner({ onDismiss }, ref) {
  const colors = useColors();
  const lang = useLang();
  const lv = (logAllVitalsStrings as unknown as Record<string, typeof logAllVitalsStrings.en>)[lang] ?? logAllVitalsStrings.en;
  const [visible, setVisible] = useState(false);
  // Guard against double-dismiss (e.g. onChangeText fires multiple times rapidly)
  const dismissedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(DICTATION_BANNER_KEY).then(val => {
      if (val !== 'true') setVisible(true);
    });
  }, []);

  const dismiss = async () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVisible(false);
    await safeSetItem(DICTATION_BANNER_KEY, 'true');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onDismiss?.();
  };

  // Expose dismiss() to parent via ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({ dismiss }), []);

  if (!visible) return null;

  const s = styles(colors);
  return (
    <View
      style={s.container}
      accessibilityLabel={lv.bannerTitle}
      accessibilityRole="none"
    >
      <View style={s.iconWrap}>
        <Text style={s.micIcon}>🎤</Text>
      </View>
      <View style={s.textWrap}>
        <Text style={s.title}>{lv.bannerTitle}</Text>
        <Text style={s.body}>
          {Platform.OS === 'ios' ? lv.bannerBodyIos : lv.bannerBodyAndroid}
        </Text>
      </View>
      <Pressable
        onPress={dismiss}
        style={({ pressed }) => [s.dismissBtn, pressed && { opacity: 0.5 }]}
        accessibilityLabel="Dismiss dictation tip"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.dismissX}>✕</Text>
      </Pressable>
    </View>
  );
});

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primary + '14',
      borderWidth: 1,
      borderColor: colors.primary + '30',
      gap: 10,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1,
    },
    micIcon: {
      fontSize: 16,
    },
    textWrap: {
      flex: 1,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.foreground,
      marginBottom: 2,
    },
    body: {
      fontSize: 11,
      color: colors.muted,
      lineHeight: 16,
    },
    dismissBtn: {
      paddingTop: 2,
      flexShrink: 0,
    },
    dismissX: {
      fontSize: 13,
      color: colors.muted,
      fontWeight: '600',
    },
  });
