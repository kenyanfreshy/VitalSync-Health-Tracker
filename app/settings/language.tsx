/**
 * Language Settings Screen
 *
 * A dedicated full-screen language picker with:
 *  - Premium dark glass design
 *  - Device-language detection and auto-select
 *  - Checkmark beside the selected language
 *  - RTL badge for right-to-left languages
 *  - "Smart" badge for dynamically-translated languages
 *  - Platform-aware intelligence branding (Apple Intelligence / Gemini)
 *  - Smooth haptic feedback on selection
 *  - Instant apply without app restart (RTL requires reload)
 *  - Fallback to English if translation is missing
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useColorScheme, useColors, useLang, useRawLang } from '@/hooks';
import {
  settingsStrings,
  setLangOverride,
  type Lang,
} from '@/lib/i18n';
import { applyRTLForLang, isRTLLang } from '@/lib/rtl';
import { getLangFlag } from '@/lib/lang-flags';
import { interpolate } from '@/lib/intelligence';
import { SUPPORTED_LANGUAGES } from '@/lib/supported-languages';
import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Language catalogue (single source of truth: lib/supported-languages.ts) ─

type LangOption = {
  code: string;
  label: string;
  native: string;
  isStatic: boolean;
};

const ALL_LANGUAGES: LangOption[] = [...SUPPORTED_LANGUAGES];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LanguageSettingsScreen() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = useLang();
  const rawLang = useRawLang();
  const t = ((settingsStrings as unknown as Record<string, typeof settingsStrings.en>)[lang] ?? settingsStrings.en);

  const [query, setQuery] = useState('');

  // Filtered language list
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ALL_LANGUAGES;
    return ALL_LANGUAGES.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.native.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q),
    );
  }, [query]);

  const handleSelect = useCallback(
    async (opt: LangOption) => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const needsRestart = await applyRTLForLang(opt.code);
      await setLangOverride(opt.code as Lang);
      if (needsRestart) {
        Alert.alert(
          isRTLLang(opt.code) ? (t.rtlLayoutEnabled ?? 'RTL Layout Enabled') : (t.restartRequired ?? 'Restart Required'),
          isRTLLang(opt.code)
            ? (t.rtlLayoutMsg ? t.rtlLayoutMsg.replace('{{lang}}', opt.label) : `${opt.label} uses right-to-left layout. Reload now to apply the new direction.`)
            : (t.layoutChangedMsg ?? 'The layout direction has changed. Reload now to apply the new layout.'),
          [
            { text: t.later ?? 'Later', style: 'cancel' },
            {
              text: t.reloadApp ?? 'Reload App',
              onPress: async () => {
                try {
                  const U = await import('expo-updates');
                  await U.reloadAsync();
                } catch (_unused) {
                  // dev mode — no-op
                }
              },
            },
          ],
        );
      } else {
        router.back();
      }
    },
     [router, t],
  );
  const handleDeviceLanguage = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const needsRestart = await applyRTLForLang(null);
    await setLangOverride(null);
    if (needsRestart) {
      Alert.alert(
        t.restartRequired ?? 'Restart Required',
        t.layoutChangedMsg ?? 'The layout direction has changed. Reload now to apply the new layout.',
        [
          { text: t.later ?? 'Later', style: 'cancel' },
          {
            text: t.reloadApp ?? 'Reload App',
            onPress: async () => {
              try {
                const U = await import('expo-updates');
                await U.reloadAsync();
              } catch (_unused) {
                // dev mode — no-op
              }
            },
          },
        ],
      );
    } else {
      router.back();
    }
  }, [router, t]);
  // Glass card background
  const cardBg = isDark
    ? 'rgba(255,255,255,0.05)'
    : 'rgba(0,0,0,0.03)';
  const cardBorder = isDark
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(0,0,0,0.08)';

  const renderItem = useCallback(
    ({ item }: { item: LangOption }) => {
      const isSelected = rawLang === item.code;
      const isRTL = isRTLLang(item.code);
      const flag = getLangFlag(item.code);
      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: isSelected
                ? colors.primary + '14'
                : cardBg,
              borderColor: isSelected
                ? colors.primary + '40'
                : cardBorder,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          onPress={() => handleSelect(item)}
          accessibilityRole="radio"
          accessibilityState={{ checked: isSelected }}
          accessibilityLabel={`${item.label} — ${item.native}`}
        >
          {/* Flag + text */}
          <Text style={styles.flag}>{flag}</Text>
          <View style={styles.rowText}>
            <Text
              style={[
                styles.nativeLabel,
                { color: isSelected ? colors.primary : colors.foreground },
              ]}
            >
              {item.native}
            </Text>
            <Text style={[styles.engLabel, { color: colors.muted }]}>
              {item.label}
            </Text>
          </View>

          {/* Badges */}
          <View style={styles.badges}>
            {isRTL && (
              <View style={[styles.badge, { backgroundColor: '#8B5CF620' }]}>
                <Text style={[styles.badgeText, { color: '#8B5CF6' }]}>{t.rtlBadge ?? 'RTL'}</Text>
              </View>
            )}
            {!item.isStatic && !isSelected && (
              <View style={[styles.badge, { backgroundColor: '#0EA5E920' }]}>
                <Text style={[styles.badgeText, { color: '#0EA5E9' }]}>{t.smartLabel ?? 'Smart'}</Text>
              </View>
            )}
            {isSelected && (
              <IconSymbol name="checkmark" size={16} color={colors.primary} />
            )}
          </View>
        </Pressable>
      );
    },
    [rawLang, colors, cardBg, cardBorder, handleSelect],
  );

  const isDeviceLang = rawLang === 'en' && !rawLang; // null override = device lang
  const smartLabel = interpolate(t.intelligencePowered ?? 'Powered by {{intelligenceName}}');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: cardBorder,
            backgroundColor: isDark
              ? 'rgba(10,15,20,0.92)'
              : 'rgba(255,255,255,0.92)',
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.settingsBack ?? 'Back'}
        >
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>{t.settingsBack ?? 'Settings'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t.languagePageTitle ?? 'Language'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {t.languagePageSubtitle ?? 'Choose your preferred app language'}
          </Text>
        </View>
        <View style={{ width: 80 }} />
      </View>

      {/* ── Search ── */}
      <View style={[styles.searchWrap, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <IconSymbol name="paperplane.fill" size={14} color={colors.muted} style={{ opacity: 0.5, transform: [{ rotate: '45deg' }] }} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t.langSearchPlaceholder ?? 'Search language…'}
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* ── Device Language row ── */}
      <View style={[styles.deviceLangWrap, { backgroundColor: colors.background }]}>
        <Pressable
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: isDeviceLang ? colors.primary + '14' : cardBg,
              borderColor: isDeviceLang ? colors.primary + '40' : cardBorder,
              opacity: pressed ? 0.75 : 1,
              marginHorizontal: 16,
            },
          ]}
          onPress={handleDeviceLanguage}
          accessibilityRole="button"
          accessibilityLabel={t.deviceLanguage ?? 'Use device language'}
        >
          <Text style={styles.flag}>📱</Text>
          <View style={styles.rowText}>
            <Text style={[styles.nativeLabel, { color: isDeviceLang ? colors.primary : colors.foreground }]}>
              {t.deviceLanguage ?? 'Device Language'}
            </Text>
            <Text style={[styles.engLabel, { color: colors.muted }]}>
              {t.languageAuto ?? 'Use Device Language'}
            </Text>
          </View>
          {isDeviceLang && (
            <IconSymbol name="checkmark" size={16} color={colors.primary} />
          )}
        </Pressable>
      </View>

      {/* ── Language list ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <View style={[styles.divider, { backgroundColor: cardBorder }]} />
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>
              {t.languagePickerTitle ?? 'CHOOSE LANGUAGE'}
            </Text>
            <View style={[styles.divider, { backgroundColor: cardBorder }]} />
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {/* Intelligence branding */}
            <View style={[styles.intelligenceBadge, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={{ fontSize: 14 }}>
                {Platform.OS === 'ios' ? '🍎' : Platform.OS === 'android' ? '🤖' : '✨'}
              </Text>
              <Text style={[styles.intelligenceText, { color: colors.muted }]}>
                {smartLabel}
              </Text>
            </View>
            <Text style={[styles.footerNote, { color: colors.muted }]}>
              {interpolate(t.onDeviceNote ?? 'Smart-translated languages use {{intelligenceName}} on-device processing.')}
            </Text>
            <Text style={[styles.footerNote, { color: colors.muted, marginTop: 4 }]}>
              Medical terms and health values are never altered by translation.
            </Text>
            <Pressable
              onPress={() => router.push('/settings/about')}
              style={({ pressed }) => [styles.learnMoreLink, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.learnMoreText, { color: colors.primary }]}>
                {t.learnMore ?? 'Learn more about VitalSync'}
              </Text>
              <IconSymbol name="chevron.right" size={12} color={colors.primary} />
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 80,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    textAlign: 'center',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  deviceLangWrap: {
    paddingBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 6,
  },
  flag: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  nativeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  engLabel: {
    fontSize: 12,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  intelligenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  intelligenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  learnMoreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingVertical: 4,
  },
  learnMoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
