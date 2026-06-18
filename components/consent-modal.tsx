/**
 * ConsentModal — shown once on first launch.
 * Summarizes VitalSync's data-ownership commitment and links to Privacy Policy & Terms of Use.
 * Dismissed permanently by storing a flag in AsyncStorage.
 * Includes a language picker so first-launch users can read in their preferred language.
 *
 * Loading state improvements:
 *  1. Simultaneous crossfade — skeleton fades out while real content fades in.
 *  2. Minimum 400 ms skeleton display — prevents a millisecond flash on fast devices.
 *  3. Tappable "review policies" footer — navigates to Settings → About after agree.
 */

import { Easing } from 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  Animated,
  ActivityIndicator,
  TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import * as Haptics from 'expo-haptics';
import { openBrowserAsync } from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useColorScheme, useColors, useLang, useRawLang } from '@/hooks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { requestHealthPermissions } from '@/lib/health/permissions';
import { consentStrings, setLangOverride, type Lang } from '@/lib/i18n';
import { useT, STATIC_LANGS, useTranslationContext, getLangName } from '@/lib/i18n-ai';
import { getLangFlag } from '@/lib/lang-flags';
import { STATIC_LANG_LIST, SMART_SUPPORTED_LANGS } from '@/lib/supported-languages';

// Stable English strings for Smart translation (outside component)
const CONSENT_EN: Record<string, string> = Object.fromEntries(
  Object.entries(consentStrings.en).filter(([, v]) => typeof v === 'string')
) as Record<string, string>;

const CONSENT_KEY   = '@vsht:consent_accepted';
const PRIVACY_URL   = 'https://vitalsyncpersonalwellnesshub.com/article/privacy-policy';
const TERMS_BASE    = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
/** Minimum time (ms) the skeleton is shown so it never flashes on fast devices */
const MIN_SKELETON_MS = 400;

/**
 * Bump this number whenever the privacy policy or terms materially change.
 * Users who accepted a lower version will be re-shown the consent slide
 * during onboarding on their next launch.
 *
 * History:
 *   1 — initial consent (Mar 2026)
 */
export const CONSENT_VERSION = 1;

/**
 * Module-level in-memory cache of the accepted consent version.
 * null  → not yet checked
 * 0     → never accepted
 * n     → accepted version n
 */
let _consentVersionCache: number | null = null;

/**
 * Returns true if the user has accepted the current CONSENT_VERSION.
 * Uses an in-memory cache after the first AsyncStorage read.
 */
export async function hasAcceptedCurrentConsent(): Promise<boolean> {
  if (_consentVersionCache !== null) {
    return _consentVersionCache >= CONSENT_VERSION;
  }
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    if (raw === null) {
      _consentVersionCache = 0;
      return false;
    }
    // Legacy value was 'true' (pre-versioning). Treat it as version 1.
    const stored = raw === 'true' ? 1 : parseInt(raw, 10);
    _consentVersionCache = isNaN(stored) ? 0 : stored;
    return _consentVersionCache >= CONSENT_VERSION;
  } catch (_unused) {
    return false;
  }
}

/** Call this from anywhere to mark consent as accepted in both storage and cache. */
export async function markConsentAccepted(): Promise<void> {
  _consentVersionCache = CONSENT_VERSION;
  await safeSetItem(CONSENT_KEY, String(CONSENT_VERSION));
}

/** Call this alongside resetOnboarding() so the consent slide is shown again on next launch. */
export async function resetConsent(): Promise<void> {
  _consentVersionCache = 0;
  await AsyncStorage.removeItem(CONSENT_KEY);
}

const ICONS = ['📱', '🚫', '🔒', '👤', '✉️'];

// Static language quick-chips — derived from canonical SUPPORTED_LANGUAGES
const LANG_OPTIONS = STATIC_LANG_LIST.map(l => ({
  code: l.code,
  label: l.code.toUpperCase(),
  native: l.native,
}));
// Smart-translated language list — derived from canonical SUPPORTED_LANGUAGES
const ALL_AI_LANG_OPTIONS = SMART_SUPPORTED_LANGS.map(l => ({
  code: l.code,
  label: l.label,
  native: l.native,
}));

async function openPage(url: string, toolbarColor: string) {
  if (Platform.OS === 'web') {
    await Linking.openURL(url);
  } else {
    await openBrowserAsync(url, {
      presentationStyle: 'pageSheet' as any,
      toolbarColor,
    });
  }
}

// ─── Pulsing skeleton bar ─────────────────────────────────────────────────────
function SkeletonBar({
  width,
  height = 14,
  style,
}: {
  width: number | string;
  height?: number;
  style?: object;
}) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: '#4ADE80',
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

// ─── Loading skeleton sheet ───────────────────────────────────────────────────
function LoadingSheet({
  isDark,
  fadeAnim,
}: {
  isDark: boolean;
  /** Controlled from parent so the parent can drive the fade-out */
  fadeAnim: Animated.Value;
}) {
  const slideAnim = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  const sheetBg     = isDark ? '#0F172A' : '#FFFFFF';
  const sheetBorder = isDark ? '#1E293B' : '#E2E8F0';
  const headerBg    = isDark ? '#052E16' : '#F0FDF4';
  const headerBorder = isDark ? '#166534' : '#86EFAC';
  const cardBg      = isDark ? '#0F2A1A' : '#F0FDF4';
  const cardBorder  = isDark ? '#166534' : '#BBF7D0';
  const barBg       = isDark ? '#0D1117' : '#F8FAFC';

  return (
    <Animated.View
      style={[
        styles.sheet,
        { backgroundColor: sheetBg, borderColor: sheetBorder },
        { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
      ]}
    >
      {/* Language picker skeleton */}
      <View style={[styles.langBar, { backgroundColor: barBg, borderBottomColor: sheetBorder }]}>
        {[48, 40, 44, 52].map((w, i) => (
          <SkeletonBar key={i} width={w} height={28} style={{ borderRadius: 14 }} />
        ))}
      </View>

      {/* Header skeleton */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder, gap: 12 }]}>
        <View style={[styles.loadingIconRing, { borderColor: headerBorder, backgroundColor: cardBg }]}>
          <Text style={{ fontSize: 28 }}>🛡️</Text>
        </View>
        <SkeletonBar width="65%" height={16} />
        <SkeletonBar width="80%" height={12} />
      </View>

      {/* Body skeleton */}
      <View style={{ padding: 24, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <SkeletonBar width="100%" height={12} />
          <SkeletonBar width="90%"  height={12} />
          <SkeletonBar width="75%"  height={12} />
        </View>

        <View style={[styles.pointsCard, { backgroundColor: cardBg, borderColor: cardBorder, gap: 14 }]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <SkeletonBar width={26} height={26} style={{ borderRadius: 13 }} />
              <SkeletonBar width={`${60 + (i % 3) * 10}%`} height={12} />
            </View>
          ))}
        </View>

        <SkeletonBar width="85%" height={11} style={{ alignSelf: 'center' }} />
      </View>

      {/* Footer skeleton */}
      <View style={[styles.footer, { borderTopColor: sheetBorder }]}>
        <SkeletonBar width="100%" height={52} style={{ borderRadius: 14 }} />
        <SkeletonBar width="70%"  height={10} style={{ alignSelf: 'center' }} />
      </View>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ConsentModal() {
  const colors  = useColors();
  const scheme  = useColorScheme() ?? 'light';
  const isDark  = scheme === 'dark';
  const router  = useRouter();

  /**
   * Tri-state:
   *   null  → AsyncStorage check pending (show skeleton)
   *   true  → consent needed (show real content)
   *   false → already accepted (render nothing)
   *
   * If the module-level cache says consent was already accepted (e.g. after an
   * ErrorBoundary reset remounts this component), we start in the `false` state
   * immediately so nothing is rendered — no skeleton flash, no re-show.
   */
  const [visible, setVisible] = useState<boolean | null>(
    (_consentVersionCache !== null && _consentVersionCache >= CONSENT_VERSION) ? false : null
  );
  const mountedRef = useRef(true);

  /**
   * skeletonFade is shared between LoadingSheet (drives its slide-in) and the
   * crossfade logic (drives its fade-out). contentFade drives the real content
   * fade-in. Both animations run in parallel so the transition is seamless.
   */
  const skeletonFade = useRef(new Animated.Value(0)).current;
  const contentFade  = useRef(new Animated.Value(0)).current;

  /** Timestamp when the component first mounted, used to enforce MIN_SKELETON_MS */
  const mountTimeRef = useRef(Date.now());

  const lang = useLang();
  const rawLang = useRawLang();
  // RTL languages — flip text direction and row layouts
  const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);
  const isRTL = RTL_LANGS.has(rawLang);
  const tAI = useT(CONSENT_EN);
  const t = (STATIC_LANGS.has(rawLang)
    ? ((consentStrings as unknown as Record<string, typeof consentStrings.en>)[lang] ?? consentStrings.en)
    : tAI) as unknown as typeof consentStrings.en;
  // tAI is a flat string record (arrays are stripped by flattenStrings), so
  // t.points will be undefined for Smart-translated languages. Fall back to the
  // English points array so the consent bullet list always renders.
  const tPoints: readonly string[] = Array.isArray((t as any).points)
    ? (t as any).points
    : consentStrings.en.points;
  const TERMS_URL  = lang === 'zh' ? `${TERMS_BASE}&lang=zh` : TERMS_BASE;
  const conjunction =
    lang === 'fr' ? ' ' : lang === 'zh' ? '和' : lang === 'es' ? 'y ' : 'and ';
  const { ensureTranslations, isTranslating } = useTranslationContext();
  const [moreLangsVisible, setMoreLangsVisible] = useState(false);
  const [langSearch, setLangSearch] = useState('');

  useEffect(() => {
    // If the cache already says accepted, visible was initialized to false above
    // so there is nothing to do — skip the AsyncStorage round-trip entirely.
    if (_consentVersionCache !== null && _consentVersionCache >= CONSENT_VERSION) return;

    mountedRef.current  = true;
    mountTimeRef.current = Date.now();

    AsyncStorage.getItem(CONSENT_KEY)
      .then((val) => {
        if (!mountedRef.current) return;

        const shouldShow = !val;

        if (!shouldShow) {
          // Already accepted — update cache and hide
          // Legacy value was 'true'; treat as version 1.
          const stored = val === 'true' ? 1 : parseInt(val!, 10);
          _consentVersionCache = isNaN(stored) ? 0 : stored;
          setVisible(_consentVersionCache < CONSENT_VERSION);
          return;
        }

        // Enforce minimum skeleton display time so it never flashes
        const elapsed = Date.now() - mountTimeRef.current;
        const remaining = Math.max(0, MIN_SKELETON_MS - elapsed);

        setTimeout(() => {
          if (!mountedRef.current) return;
          setVisible(true);

          // Crossfade: fade skeleton out while content fades in simultaneously
          Animated.parallel([
            Animated.timing(skeletonFade, {
              toValue: 0,
              duration: 250,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(contentFade, {
              toValue: 1,
              duration: 300,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]).start();
        }, remaining);
      })
      .catch((e) => {
        // If AsyncStorage is unavailable, show the consent modal so the user
        // can still accept before using the app.
        console.warn('[VitalSync] ConsentModal storage check failed:', e);
        if (!mountedRef.current) return;
        setVisible(true);
      });

    return () => { mountedRef.current = false; };
  }, [skeletonFade, contentFade]);

  async function handleLangSelect(code: string) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await setLangOverride(code as Lang);
    setMoreLangsVisible(false);
    // Pre-translate all app strings for Smart languages so Dashboard is ready
    if (!STATIC_LANGS.has(code)) {
      ensureTranslations(code);
    }
  }

  async function handleAgree() {
    // Mark accepted in both cache and AsyncStorage so re-mounts never re-show
    await markConsentAccepted();
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setVisible(false);
    // Request health permissions after dismissing — non-blocking
    requestHealthPermissions().catch((e) =>
      console.warn('[VitalSync] Health permission request failed after consent:', e)
    );
  }

  async function handleReviewPolicies() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Mark accepted in both cache and AsyncStorage so re-mounts never re-show
    await markConsentAccepted();
    setVisible(false);
    // Request health permissions then navigate to About — both non-blocking
    requestHealthPermissions().catch((e) =>
      console.warn('[VitalSync] Health permission request failed after review:', e)
    );
    // Delay navigation slightly so the modal has time to fully dismiss
    setTimeout(() => {
      try { router.push('/settings/about' as any); } catch (_unused) {}
    }, 350);
  }

  // Already accepted — render nothing
  if (visible === false) return null;

  return (
    <>
    <Modal visible={true} transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>

        {/* ── Skeleton (pending + fading out during crossfade) ──────────── */}
        {visible !== (false as boolean | null) && (
          <LoadingSheet isDark={isDark} fadeAnim={skeletonFade} />
        )}

        {/* ── Real content (fades in once visible === true) ─────────────── */}
        {visible === true && (
          <Animated.View
            style={[
              styles.sheet,
              styles.absoluteSheet,
              {
                backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
              { opacity: contentFade },
            ]}
          >
            {/* ── Language Picker ───────────────────────────────────────── */}
            <View
              style={[
                styles.langBar,
                {
                  backgroundColor: isDark ? '#0D1117' : '#F8FAFC',
                  borderBottomColor: isDark ? '#1E293B' : '#E2E8F0',
                },
              ]}
            >
              {LANG_OPTIONS.map((opt) => {
                const isActive = rawLang === opt.code;
                return (
                  <Pressable
                    key={opt.code}
                    style={[
                      styles.langPill,
                      {
                        backgroundColor: isActive
                          ? isDark ? '#166534' : '#DCFCE7'
                          : 'transparent',
                        borderColor: isActive
                          ? isDark ? '#4ADE80' : '#86EFAC'
                          : isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                    onPress={() => handleLangSelect(opt.code)}
                  >
                    <Text style={[styles.langPillText, { color: isActive ? (isDark ? '#4ADE80' : '#166534') : colors.muted }]}>
                      {getLangFlag(opt.code)} {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
              {/* More languages chip */}
              <Pressable
                style={[
                  styles.langPill,
                  {
                    backgroundColor: !STATIC_LANGS.has(rawLang)
                      ? isDark ? '#1e3a5f' : '#DBEAFE'
                      : 'transparent',
                    borderColor: !STATIC_LANGS.has(rawLang)
                      ? isDark ? '#60a5fa' : '#93C5FD'
                      : isDark ? '#334155' : '#E2E8F0',
                  },
                ]}
                onPress={() => setMoreLangsVisible(true)}
              >
                <Text style={[styles.langPillText, { color: !STATIC_LANGS.has(rawLang) ? (isDark ? '#60a5fa' : '#1d4ed8') : colors.muted }]}>
                  {!STATIC_LANGS.has(rawLang) ? `${getLangFlag(rawLang)} ${getLangName(rawLang)}` : '🌐 More'}
                </Text>
              </Pressable>
            </View>

            {/* ── Header ────────────────────────────────────────────────── */}
            <View
              style={[
                styles.header,
                {
                  backgroundColor: isDark ? '#052E16' : '#F0FDF4',
                  borderBottomColor: isDark ? '#166534' : '#86EFAC',
                },
              ]}
            >
              <Text style={styles.headerIcon}>🛡️</Text>
              <Text style={[styles.headerTitle, { color: isDark ? '#4ADE80' : '#166634' }, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}>
                {t.title}
              </Text>
              <Text style={[styles.headerSub, { color: isDark ? '#86EFAC' : '#15803D' }, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}>
                {t.subtitle}
              </Text>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Commitment message */}
              <Text style={[styles.message, { color: colors.foreground }, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}>
                {t.body}
                <Text style={{ fontWeight: '700' }}>{t.bodyBold}</Text>
                {t.bodyEnd}
              </Text>

              {/* Data points */}
              <View
                style={[
                  styles.pointsCard,
                  {
                    backgroundColor: isDark ? '#0F2A1A' : '#F0FDF4',
                    borderColor: isDark ? '#166534' : '#BBF7D0',
                  },
                ]}
              >
                {tPoints.map((text, i) => (
                  <View key={text} style={[styles.pointRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={styles.pointIcon}>{ICONS[i]}</Text>
                    <Text style={[styles.pointText, { color: isDark ? '#BBF7D0' : '#14532D' }, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}>
                      {text}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Legal links */}
              <Text style={[styles.legalNote, { color: colors.muted }, isRTL && { textAlign: 'right', writingDirection: 'rtl' }]}>
                {t.legal}{' '}
                <Text
                  style={[styles.legalLink, { color: colors.primary }]}
                  onPress={() => openPage(PRIVACY_URL, '#22C55E')}
                >
                  {t.privacy}
                </Text>
                {' '}{conjunction}
                <Text
                  style={[styles.legalLink, { color: '#6366F1' }]}
                  onPress={() => openPage(TERMS_URL, '#6366F1')}
                >
                  {t.terms}
                </Text>
                .
              </Text>
            </ScrollView>

            {/* ── CTA ───────────────────────────────────────────────────── */}
            <View style={[styles.footer, { borderTopColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.agreeBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
                onPress={handleAgree}
              >
                <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
                <Text style={styles.agreeBtnText}>{t.agree}</Text>
              </Pressable>

              {/* Tappable review-policies footer — navigates to Settings → About */}
              <Pressable onPress={handleReviewPolicies} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <Text style={[styles.footerNote, styles.footerNoteLink, { color: colors.muted }]}>
                  {t.review}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>

    {/* ── More Languages bottom sheet ─────────────────────────────────── */}
    <Modal
      visible={moreLangsVisible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { setMoreLangsVisible(false); setLangSearch(''); }}
    >
      <Pressable style={styles.overlay} onPress={() => { setMoreLangsVisible(false); setLangSearch(''); }}>
        <View
          style={[
            styles.moreLangsSheet,
            { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.moreLangsHandle} />
          {/* Header row: title + translating indicator */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 8 }}>
            <Text style={[styles.moreLangsTitle, { color: isDark ? '#F1F5F9' : '#0F172A', flex: 1, paddingHorizontal: 0, paddingVertical: 0 }]}>
              🌐 All Languages
            </Text>
            {isTranslating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ActivityIndicator size="small" color="#60a5fa" />
                <Text style={{ fontSize: 11, color: '#60a5fa', fontWeight: '600' }}>Translating…</Text>
              </View>
            )}
          </View>
          {/* Search input */}
          <View style={[
            styles.searchBar,
            { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' },
          ]}>
            <Text style={{ fontSize: 15, color: isDark ? '#94A3B8' : '#94A3B8' }}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
              placeholder="Search language…"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={langSearch}
              onChangeText={setLangSearch}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <ScrollView
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 4 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {ALL_AI_LANG_OPTIONS.filter((opt) => {
              if (!langSearch.trim()) return true;
              const q = langSearch.toLowerCase();
              return (
                opt.native.toLowerCase().includes(q) ||
                opt.label.toLowerCase().includes(q) ||
                opt.code.toLowerCase().includes(q)
              );
            }).map((opt) => {
              const isActive = rawLang === opt.code;
              return (
                <Pressable
                  key={opt.code}
                  style={[styles.moreLangsRow, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                  onPress={() => handleLangSelect(opt.code)}
                >
                  <Text style={{ fontSize: 22 }}>{getLangFlag(opt.code)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moreLangsNative, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{opt.native}</Text>
                    <Text style={[styles.moreLangsLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{opt.label}</Text>
                  </View>
                  {isActive && <IconSymbol name="checkmark.circle.fill" size={20} color="#60a5fa" />}
                  <View style={[styles.aiBadge, { backgroundColor: isDark ? '#1e3a5f' : '#DBEAFE' }]}>
                    <Text style={[styles.aiBadgeText, { color: isDark ? '#60a5fa' : '#1d4ed8' }]}>Smart</Text>
                  </View>
                </Pressable>
              );
            })}
            {/* No results empty state */}
            {langSearch.trim() !== '' && ALL_AI_LANG_OPTIONS.filter((opt) => {
              const q = langSearch.toLowerCase();
              return (
                opt.native.toLowerCase().includes(q) ||
                opt.label.toLowerCase().includes(q) ||
                opt.code.toLowerCase().includes(q)
              );
            }).length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
                <Text style={{ fontSize: 36 }}>🔍</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#F1F5F9' : '#0F172A' }}>No languages found</Text>
                <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>
                  {'No match for "' + langSearch + '"'}
                </Text>
                <Pressable
                  style={[styles.clearSearchBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                  onPress={() => {
                    setLangSearch('');
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#60a5fa' : '#1d4ed8' }}>Clear search</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  /** Positions the real-content sheet on top of the skeleton during crossfade */
  absoluteSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  loadingIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  langPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    gap: 6,
  },
  headerIcon:  { fontSize: 36, marginBottom: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  headerSub:   { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  body:        { flexGrow: 0 },
  bodyContent: { padding: 24, gap: 16 },
  message:     { fontSize: 14, lineHeight: 22 },
  pointsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  pointRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  pointText: { fontSize: 13, fontWeight: '600', flex: 1 },
  legalNote: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  legalLink: { fontWeight: '700' },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    alignItems: 'center',
  },
  agreeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
  },
  agreeBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  footerNote:     { fontSize: 11, textAlign: 'center' },
  footerNoteLink: { textDecorationLine: 'underline' },
  moreLangsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  moreLangsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  moreLangsTitle: {
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  moreLangsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moreLangsNative: { fontSize: 15, fontWeight: '600' },
  moreLangsLabel:  { fontSize: 12, marginTop: 1 },
  aiBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: { fontSize: 10, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
});
