/**
 * Onboarding Screen — Premium redesign (Round 32)
 *
 * Visual style: full-bleed deep blue/dark background, hero photo rising from
 * lower half on slide 1, large bold headline bottom-left, dark pill nav bar
 * with >>> advance button. All 6 slides preserve their original functional
 * content (permissions, thresholds, profile, consent, privacy, feature pills).
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import RAnimated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, withSequence, withSpring, Easing as REasing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  Switch,
  TextInput,
  FlatList,
  Alert,
  Animated,
  Modal,
  useColorScheme,
  Linking,
  TouchableOpacity,
  AppState,
  type AppStateStatus,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MicrophoneIcon } from '@/components/ui/microphone-icon';
import { useColors, useLang, useRawLang, useAboutStrings } from '@/hooks';
import { onboardingStrings, consentStrings, setLangOverride, type Lang } from '@/lib/i18n';
import { useT, STATIC_LANGS } from '@/lib/i18n-ai';
import { applyRTLForLang, isRTLLang } from '@/lib/rtl';
import { getLangFlag } from '@/lib/lang-flags';
import { SUPPORTED_LANGUAGES } from '@/lib/supported-languages';
import { markOnboardingComplete, hasCompletedOnboarding } from '@/lib/onboarding';
import { useThemeContext } from '@/lib/theme-provider';
import { markConsentAccepted } from '@/components/consent-modal';
import { saveUserProfile, type BiologicalSex } from '@/lib/user-profile';
import { DIET_TYPE_OPTIONS, type DietType, saveDietType } from '@/lib/health/diet-type';
import {
  loadThresholds,
  saveThresholds,
  DEFAULT_THRESHOLDS,
  type ThresholdConfig,
} from '@/lib/notifications/threshold-config';
import { requestNotificationPermissions } from '@/lib/notifications/threshold-checker';
import { registerHealthMonitorTask } from '@/lib/notifications/background-task';
import { registerBackgroundSyncTask } from '@/lib/health/background-sync-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const { width: SCREEN_WIDTH, height: _SCREEN_HEIGHT } = Dimensions.get('window');
const SLIDE_COUNT = 9;

// ─── Brand colours ────────────────────────────────────────────────────────────
const BG_TOP    = '#0D1117';
const BG_MID    = '#0A1A2E';
const BG_BOTTOM = '#030810';
const PILL_BG   = 'rgba(13,17,23,0.88)';
const PILL_BORDER = 'rgba(34,197,94,0.18)';
const ACCENT    = '#22C55E';  // Vital Green brand accent

// Stable English strings for Smart translation (outside component to avoid re-renders)
const ONBOARDING_EN: Record<string, string> = Object.fromEntries(
  Object.entries(onboardingStrings.en).filter(([, v]) => typeof v === 'string')
) as Record<string, string>;

const SLIDE_META = [
  { id: 'language',    icon: 'globe' as const,                  iconColor: '#38BDF8' },
  { id: 'welcome',     icon: 'heart.fill' as const,             iconColor: '#E53E3E' },
  { id: 'permissions', icon: 'heart.text.square.fill' as const, iconColor: '#38BDF8' },
  { id: 'thresholds',  icon: 'bolt.fill' as const,              iconColor: '#D69E2E' },
  { id: 'support',     icon: 'questionmark.circle.fill' as const, iconColor: '#38BDF8' },
  { id: 'theme',       icon: 'sun.max.fill' as const,           iconColor: '#F59E0B' },
  { id: 'profile',     icon: 'person.fill' as const,            iconColor: '#805AD5' },
  { id: 'paywall',     icon: 'star.fill' as const,              iconColor: '#F59E0B' },
  { id: 'consent',     icon: 'checkmark.shield.fill' as const,  iconColor: '#38BDF8' },
];

// ─── Mini Dashboard Preview (live theme mockup for slide 6) ────────────────
const MINI_PALETTES = {
  light: {
    bg: '#FBFBFB',
    surface: '#F0F0F3',
    card: '#FFFFFF',
    header: '#FFFFFF',
    text: '#1A1A2E',
    muted: '#7A7F8E',
    border: '#E5E7EB',
    accent: '#3B82F6',
    accentBg: '#EFF6FF',
    bar1: '#3B82F6',
    bar2: '#10B981',
    bar3: '#8B5CF6',
  },
  dark: {
    bg: '#0D1117',
    surface: '#0D2244',
    card: '#1A2540',
    header: '#0D1F3C',
    text: '#ECEDEE',
    muted: '#9BA1A6',
    border: '#1E3A5F',
    accent: '#60A5FA',
    accentBg: '#1E3A5F',
    bar1: '#60A5FA',
    bar2: '#34D399',
    bar3: '#A78BFA',
  },
  system: {
    bg: '#F5F5F7',
    surface: '#EBEBF0',
    card: '#FFFFFF',
    header: '#F5F5F7',
    text: '#1C1C1E',
    muted: '#8E8E93',
    border: '#D1D1D6',
    accent: '#007AFF',
    accentBg: '#E8F4FF',
    bar1: '#007AFF',
    bar2: '#34C759',
    bar3: '#AF52DE',
  },
  amoled: {
    bg: '#000000',
    surface: '#0A0A0A',
    card: '#111111',
    header: '#000000',
    text: '#ECEDEE',
    muted: '#9BA1A6',
    border: '#1A1A1A',
    accent: '#60A5FA',
    accentBg: '#0A1628',
    bar1: '#60A5FA',
    bar2: '#34D399',
    bar3: '#A78BFA',
  },
};

function MiniDashboardPreview({ theme }: { theme: 'light' | 'dark' | 'system' | 'amoled' }) {
  const p = MINI_PALETTES[theme];
  const fadeAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(0.96);
  const animStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ scale: scaleAnim.value }],
  }));

  useEffect(() => {
    fadeAnim.value = 0;
    scaleAnim.value = 0.96;
    fadeAnim.value = withTiming(1, { duration: 260, easing: REasing.out(REasing.quad) });
    scaleAnim.value = withTiming(1, { duration: 260, easing: REasing.out(REasing.quad) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return (
    <RAnimated.View style={[
      animStyle,
      {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: p.bg,
        borderWidth: 1.5,
        borderColor: p.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 6,
      },
    ]}>
      {/* Phone notch bar */}
      <View style={{ height: 10, backgroundColor: p.header, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
        <View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: p.border }} />
      </View>
      {/* Header bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 7, backgroundColor: p.header, borderBottomWidth: 0.5, borderBottomColor: p.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: p.accent }} />
          <View style={{ width: 48, height: 6, borderRadius: 3, backgroundColor: p.text, opacity: 0.8 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.accentBg, borderWidth: 1, borderColor: p.border }} />
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.accentBg, borderWidth: 1, borderColor: p.border }} />
        </View>
      </View>
      {/* Vital cards row */}
      <View style={{ flexDirection: 'row', gap: 6, padding: 8 }}>
        {[{ label: 'BP', value: '118/76', unit: 'mmHg', color: p.bar1 }, { label: 'HR', value: '68', unit: 'bpm', color: p.bar2 }].map(card => (
          <View key={card.label} style={{ flex: 1, backgroundColor: p.card, borderRadius: 10, padding: 8, borderWidth: 0.5, borderColor: p.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: card.color }} />
              <View style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: p.muted, opacity: 0.6 }} />
            </View>
            <View style={{ width: 36, height: 7, borderRadius: 3, backgroundColor: p.text, opacity: 0.85, marginBottom: 2 }} />
            <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: p.muted, opacity: 0.4 }} />
          </View>
        ))}
      </View>
      {/* Sleep bar section */}
      <View style={{ marginHorizontal: 8, marginBottom: 8, backgroundColor: p.card, borderRadius: 10, padding: 8, borderWidth: 0.5, borderColor: p.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
          <View style={{ width: 40, height: 5, borderRadius: 2, backgroundColor: p.text, opacity: 0.7 }} />
          <View style={{ width: 24, height: 5, borderRadius: 2, backgroundColor: p.accent, opacity: 0.6 }} />
        </View>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          {[0.15, 0.35, 0.25, 0.25].map((w, i) => (
            <View key={i} style={{ flex: w, backgroundColor: [p.bar3, p.bar1, p.bar2, p.accent][i], opacity: 0.75 }} />
          ))}
        </View>
      </View>
      {/* Bottom tab bar */}
      <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: p.border, backgroundColor: p.header, paddingVertical: 5 }}>
        {[p.accent, p.muted, p.muted, p.muted].map((c, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c, opacity: i === 0 ? 0.9 : 0.35 }} />
          </View>
        ))}
      </View>
    </RAnimated.View>
  );
}

// ─── Animated theme option card ─────────────────────────────────────────────
function ThemeOptionCard({
  val, emoji, label, desc,
  isSelected, onSelect,
}: {
  val: 'light' | 'dark' | 'system' | 'amoled';
  emoji: string;
  label: string;
  desc: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    // Bounce: shrink → overshoot → settle
    scale.value = withSequence(
      withTiming(0.94, { duration: 70 }),
      withSpring(1.04, { damping: 6, stiffness: 280 }),
      withSpring(1.0,  { damping: 10, stiffness: 260 }),
    );
    onSelect();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onSelect, scale]);

  return (
    <RAnimated.View style={animStyle}>
      <Pressable
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 14,
          padding: 14, borderRadius: 14, borderWidth: 1.5,
          backgroundColor: isSelected ? '#F59E0B18' : 'rgba(255,255,255,0.05)',
          borderColor: isSelected ? '#F59E0B' : 'rgba(255,255,255,0.12)',
        }}
        onPress={handlePress}
      >
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: isSelected ? '#F59E0B' : '#FFFFFF', marginBottom: 2 }}>{label}</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', lineHeight: 17 }}>{desc}</Text>
        </View>
        {isSelected && (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="checkmark" size={12} color="#000" />
          </View>
        )}
      </Pressable>
    </RAnimated.View>
  );
}

export default function OnboardingScreen() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const _isDark = scheme === 'dark';
  const lang = useLang();
  const rawLang = useRawLang();
  const oAI = useT(ONBOARDING_EN);
  const o = (STATIC_LANGS.has(rawLang)
    ? ((onboardingStrings as unknown as Record<string, typeof onboardingStrings.en>)[lang] ?? onboardingStrings.en)
    : oAI) as unknown as typeof onboardingStrings.en;
  const ab = useAboutStrings();

  const scrollRef = useRef<ScrollView>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [profileAge, setProfileAge] = useState('');
  const [profileSex, setProfileSex] = useState<BiologicalSex | null>(null);
  const [profileWeight, setProfileWeight] = useState('');
  const [profileHeight, setProfileHeight] = useState('');
  const [selectedDiet, setSelectedDiet] = useState<DietType>('balanced');
  const { setPreference: setThemePref } = useThemeContext();
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system' | 'amoled'>('dark');
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [vitalsTooltipVisible, setVitalsTooltipVisible] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bioExpanded, setBioExpanded] = useState(false);
  const [skipConfirmVisible, setSkipConfirmVisible] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [meetCreatorVisible, setMeetCreatorVisible] = useState(false);
  const [booksExpanded, setBooksExpanded] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [termsExpanded, setTermsExpanded] = useState(false);
  // ─── Creator card entrance animation ─────────────────────────────────────────
  const creatorCardOpacity = useSharedValue(0);
  const creatorCardTranslateY = useSharedValue(24);
  const _creatorCardAnimStyle = useAnimatedStyle(() => ({
    opacity: creatorCardOpacity.value,
    transform: [{ translateY: creatorCardTranslateY.value }],
  }));
  useEffect(() => {
    if (currentSlide === 1) {
      creatorCardOpacity.value = 0;
      creatorCardTranslateY.value = 24;
      creatorCardOpacity.value = withDelay(220, withTiming(1, { duration: 380, easing: REasing.out(REasing.quad) }));
      creatorCardTranslateY.value = withDelay(220, withTiming(0, { duration: 380, easing: REasing.out(REasing.quad) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide]);
  // Onboarding creator photo press-zoom
  const onboardingPhotoScale = useSharedValue(1);
  const onboardingPhotoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: onboardingPhotoScale.value }],
  }));

  const progressAnim = useRef(new Animated.Value(1 / SLIDE_COUNT)).current;
  // Parallax: use Reanimated shared value (avoids useNativeDriver conflict with progressAnim)
  const scrollXShared = useSharedValue(0);
  const _heroParallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scrollXShared.value * -0.30 }],
  }));

  // ─── Headline entrance animation ─────────────────────────────────────────────
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(18);

  function animateHeadlineIn() {
    headlineOpacity.value = 0;
    headlineTranslateY.value = 18;
    headlineOpacity.value = withDelay(80, withTiming(1, { duration: 320, easing: REasing.out(REasing.quad) }));
    headlineTranslateY.value = withDelay(80, withTiming(0, { duration: 320, easing: REasing.out(REasing.quad) }));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { animateHeadlineIn(); }, [currentSlide]);

  const headlineAnimStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: headlineTranslateY.value }],
  }));

  // ─── Consent slide point icons (index-matched to consentStrings.points) ─────
  const CONSENT_POINT_ICONS = ['📱', '🚫', '🔒', '🙅', '📋'] as const;

  // ─── Privacy checklist stagger animation ────────────────────────────────────
  const _CHECKLIST_COUNT = 5;
  // useSharedValue must be called at the top level, not inside Array.from callback
  const cl0Op = useSharedValue(0); const cl1Op = useSharedValue(0); const cl2Op = useSharedValue(0);
  const cl3Op = useSharedValue(0); const cl4Op = useSharedValue(0);
  const cl0Tr = useSharedValue(-20); const cl1Tr = useSharedValue(-20); const cl2Tr = useSharedValue(-20);
  const cl3Tr = useSharedValue(-20); const cl4Tr = useSharedValue(-20);
  const checklistOpacities = [cl0Op, cl1Op, cl2Op, cl3Op, cl4Op];
  const checklistTranslates = [cl0Tr, cl1Tr, cl2Tr, cl3Tr, cl4Tr];

  function animateChecklistIn() {
    checklistOpacities.forEach((sv, i) => {
      sv.value = 0;
      sv.value = withDelay(i * 60, withTiming(1, { duration: 300, easing: REasing.out(REasing.quad) }));
    });
    checklistTranslates.forEach((sv, i) => {
      sv.value = -20;
      sv.value = withDelay(i * 60, withTiming(0, { duration: 300, easing: REasing.out(REasing.quad) }));
    });
  }

  useEffect(() => {
    // Privacy slide removed — checklist animation no longer needed here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide]);

  const checklistAnimStyles = checklistOpacities.map((op, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: op.value,
      transform: [{ translateX: checklistTranslates[i].value }],
    }))
  );

  // --- Consent CTA pulse animation ---
  const ctaPulseScale = useSharedValue(1);

  useEffect(() => {
    if (consentAcknowledged) {
      ctaPulseScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 500, easing: REasing.inOut(REasing.quad) }),
          withTiming(1.00, { duration: 500, easing: REasing.inOut(REasing.quad) })
        ),
        -1,
        false
      );
    } else {
      ctaPulseScale.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentAcknowledged]);

  const ctaPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaPulseScale.value }],
  }));

  // --- Completion overlay animation ---
  const completeOpacity = useSharedValue(0);
  const completeCheckScale = useSharedValue(0.3);
  const completeTextY = useSharedValue(30);
  const completeTextOpacity = useSharedValue(0);

  const completeOverlayStyle = useAnimatedStyle(() => ({
    opacity: completeOpacity.value,
  }));
  const completeCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: completeCheckScale.value }],
  }));
  const completeTextStyle = useAnimatedStyle(() => ({
    opacity: completeTextOpacity.value,
    transform: [{ translateY: completeTextY.value }],
  }));

  // ─── Load persisted consent ──────────────────────────────────────────────────
  React.useEffect(() => {
    AsyncStorage.getItem('@vitalsync/consent_ack_v1').then(v => {
      if (v === 'true') setConsentAcknowledged(true);
    }).catch(() => {});
  }, []);

  // ─── AppState auto-skip: if user already completed onboarding, finish on foreground ─
  React.useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && currentSlide === 7) {
        hasCompletedOnboarding().then(done => {
          if (done) handleFinish();
        }).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide]);

  // ─── Navigation ──────────────────────────────────────────────────────────────
  function goToSlide(index: number) {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setCurrentSlide(index);
    Animated.timing(progressAnim, {
      toValue: (index + 1) / SLIDE_COUNT,
      duration: 300,
      useNativeDriver: false,
    }).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function handleScroll(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== currentSlide) {
      setCurrentSlide(idx);
      Animated.timing(progressAnim, {
        toValue: (idx + 1) / SLIDE_COUNT,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }


  // ─── Slide 6: Finish ─────────────────────────────────────────────────────────
  async function handleFinish() {
    try {
      await saveThresholds({ ...thresholds, enabled: true });
      const age = parseInt(profileAge, 10);
      const weight = parseFloat(profileWeight);
      const height = parseFloat(profileHeight);
      await saveUserProfile({
        age: !isNaN(age) && age > 0 && age < 120 ? age : null,
        sex: profileSex,
        weightKg: !isNaN(weight) && weight > 0 && weight < 500 ? weight : null,
        heightCm: !isNaN(height) && height > 0 && height < 300 ? height : null,
      });
      await AsyncStorage.removeItem('@vitalsync/bmr_cache_v1').catch(() => {});
      if (Platform.OS !== 'web') {
        await requestNotificationPermissions();
        await registerHealthMonitorTask();
        await registerBackgroundSyncTask();
      }
    } catch (_unused) {
      // Non-fatal
    }
    await saveDietType(selectedDiet);
    setThemePref(selectedTheme);
    await markConsentAccepted();
    await markOnboardingComplete();
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // Show completion animation overlay, then navigate
    setShowComplete(true);
    completeOpacity.value = withTiming(1, { duration: 350 });
    completeCheckScale.value = withDelay(200, withSequence(
      withTiming(1.2, { duration: 300, easing: REasing.out(REasing.back()) }),
      withTiming(1.0, { duration: 150 })
    ));
    completeTextOpacity.value = withDelay(500, withTiming(1, { duration: 300 }));
    completeTextY.value = withDelay(500, withTiming(0, { duration: 300, easing: REasing.out(REasing.quad) }));
    setTimeout(() => {
      router.replace('/(tabs)' as any);
    }, 1800);
  }

  function handleCTAPress(slideIndex: number) {
    if (slideIndex === 8) {
      handleFinish();
    } else {
      goToSlide(slideIndex + 1);
    }
  }

  // ─── Threshold row ────────────────────────────────────────────────────────────
  function ThresholdRow({
    label, value, unit, color, onCommit,
  }: {
    label: string; value: number; unit: string; color: string;
    onCommit: (v: number) => void;
  }) {
    const [text, setText] = useState(String(value));
    return (
      <View style={styles.threshRow}>
        <Text style={[styles.threshLabel, { color: 'rgba(255,255,255,0.65)' }]}>{label}</Text>
        <View style={[styles.threshInputWrap, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}>
          <TextInput
            style={[styles.threshInput, { color }]}
            value={text}
            onChangeText={setText}
            keyboardType="default"
            returnKeyType="done"
            onBlur={() => {
              const n = parseFloat(text);
              if (!isNaN(n) && n > 0) onCommit(n);
              else setText(String(value));
            }}
          />
          <Text style={[styles.threshUnit, { color: 'rgba(255,255,255,0.45)' }]}>{unit}</Text>
        </View>
      </View>
    );
  }

  // ─── Slide headlines ────────────────────────────────────────────
  const SLIDE_HEADLINES = [
    { top: o.chooseLanguage ?? 'Choose Your Language', bottom: '' },
    { top: o.slideHeadline0top, bottom: o.slideHeadline0bottom },
    { top: o.slideHeadline1top, bottom: o.slideHeadline1bottom },
    { top: o.slideHeadline2top, bottom: o.slideHeadline2bottom },
    { top: o.slideHeadline3top, bottom: o.slideHeadline3bottom },
    { top: o.slideHeadline5top, bottom: o.slideHeadline5bottom },
    { top: o.slideHeadline6top, bottom: o.slideHeadline6bottom },
    { top: 'Unlock Premium', bottom: 'Start your 14-day free trial' },
    { top: o.slideHeadline4top, bottom: o.slideHeadline4bottom },
  ];

  const isLastSlide = currentSlide === SLIDE_COUNT - 1;
  const _ctaLabel = [o.langSlideContinue ?? 'Continue', o.welcomeCta, o.permissionsCta, o.thresholdsCta, o.everythingInSettings, o.pickTheme, o.profileCta, 'Continue', o.consentCta][currentSlide] ?? o.permissionsCta;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Full-bleed background */}
      <LinearGradient
        colors={[BG_TOP, BG_MID, BG_BOTTOM]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Subtle polygon texture overlay */}
      <View style={styles.polyOverlay} pointerEvents="none" />

      {/* Top bar: logo left + slide counter right */}
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.topLogo}
            contentFit="contain"
          />
          <Text style={styles.topLogoText}>VitalSync</Text>
        </View>
        <Text style={styles.slideCounter}>{currentSlide + 1} / {SLIDE_COUNT}</Text>
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        onScroll={(e) => { scrollXShared.value = e.nativeEvent.contentOffset.x; }}
        style={styles.slideScroll}
        contentContainerStyle={{ alignItems: 'flex-start' }}
      >
        {/* ── Slide 0: Language Picker ─────────────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH, justifyContent: 'flex-start', paddingTop: 0, paddingHorizontal: 0 }]}>
          {/* Globe icon */}
          <View style={[styles.slideIconWrap, { marginTop: 12 }]}>
            <View style={[styles.iconCircle, { backgroundColor: '#38BDF822' }]}>
              <IconSymbol name="globe" size={52} color="#38BDF8" />
            </View>
          </View>
          {/* Headline */}
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{o.chooseLanguage ?? 'Choose Your Language'}</Text>
            <Text style={styles.headlineSub}>{o.langSlideSubtitle ?? 'Select the language you prefer. You can change this anytime in Settings.'}</Text>
          </RAnimated.View>
          {/* Language list */}
          <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 8 }}>
            {/* Search bar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
              paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
            }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>🔍</Text>
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#ECEDEE' }}
                placeholder={o.langSearchPlaceholder ?? 'Search language…'}
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={langSearch}
                onChangeText={setLangSearch}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
            </View>
            <FlatList
              data={SUPPORTED_LANGUAGES.filter(l => {
                const q = langSearch.toLowerCase().trim();
                if (!q) return true;
                return l.label.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
              })}
              keyExtractor={item => item.code}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = rawLang === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => ([{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingVertical: 11, paddingHorizontal: 4,
                      borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
                      backgroundColor: isSelected ? 'rgba(10,126,164,0.15)' : 'transparent',
                      borderRadius: 8,
                      opacity: pressed ? 0.75 : 1,
                    }])}
                    onPress={async () => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const needsRestart = await applyRTLForLang(item.code);
                      await setLangOverride(item.code as Lang);
                      setLangSearch('');
                      if (needsRestart) {
                        const { Alert } = require('react-native');
                        Alert.alert(
                          isRTLLang(item.code) ? 'RTL Layout Enabled' : 'Restart Required',
                          'The layout direction has changed. Reload now to apply the new layout.',
                          [
                            { text: 'Later', style: 'cancel' },
                            { text: 'Reload App', onPress: async () => { try { const U = await import('expo-updates'); await U.reloadAsync(); } catch (_unused) {} } },
                          ],
                        );
                      }
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${item.label} — ${item.native}`}
                  >
                    <Text style={{ fontSize: 22 }}>{getLangFlag(item.code)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: isSelected ? '#38BDF8' : '#ECEDEE', lineHeight: 18 }}>{item.native}</Text>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 15 }}>{item.label}</Text>
                    </View>
                    {isSelected && <Text style={{ fontSize: 16, color: '#38BDF8' }}>✓</Text>}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>

        {/* ── Slide 1: Welcome ─────────────────────────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH, justifyContent: 'flex-start', paddingTop: 8, paddingHorizontal: 0 }]}>
          {/* Scrollable feature pills row with right-fade hint */}
          <View style={{ flexShrink: 0, position: 'relative' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4, gap: 8 }}
            style={{ flexShrink: 0 }}
          >
            {[
              { label: o.featureBP,         color: '#3B82F6', icon: '🩺' },
              { label: o.featurePulse,      color: '#EF4444', icon: '❤️' },
              { label: o.featureSleep,      color: '#8B5CF6', icon: '🌙' },
              { label: o.featureBody,       color: '#06B6D4', icon: '⚖️' },
              { label: o.featureBloodSugar, color: '#DC2626', icon: '🩸' },
              { label: o.featureNutrition,  color: '#22C55E', icon: '📷' },
              { label: o.featureMeds,       color: '#A78BFA', icon: '💊' },
              { label: o.featureAppts,      color: '#34D399', icon: '📅' },
              { label: o.featureVaccines,   color: '#FB923C', icon: '💉' },
              { label: o.featureLabs,       color: '#60A5FA', icon: '🔬' },
              { label: o.featureCorrelation,color: '#F472B6', icon: '📊' },
              { label: o.featureVitals,     color: '#F59E0B', icon: '📋' },
            ].map(({ label, color, icon }: { label: string; color: string; icon: string }) => (
              <View
                key={label}
                style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '55', flexDirection: 'row', alignItems: 'center', gap: 4 }]}
              >
                <Text style={{ fontSize: 12 }}>{icon}</Text>
                <Text style={[styles.pillText, { color }]}>{label}</Text>
              </View>
            ))}
          </ScrollView>
          {/* Right-fade gradient hint */}
          <View
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 40,
              backgroundColor: 'transparent',
            }}
            pointerEvents="none"
          />
          </View>

          {/* App tagline — live i18n via SLIDE_HEADLINES[1] + aboutStrings */}
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle, { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 2 }]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[1].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[1].bottom}</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 18 }}>
              {ab.tagline}
            </Text>
          </RAnimated.View>

          {/* Developed By card: text left, photo right */}
          <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 8 }}>
            <View style={[styles.createdByCard, { marginHorizontal: 0, flexDirection: 'row', alignItems: 'stretch', padding: 0, overflow: 'hidden', minHeight: 220 }]}>
              {/* Left: text content */}
              <View style={{ flex: 1, padding: 18, justifyContent: 'center' }}>
                <View style={[styles.createdByHeader, { marginBottom: 12 }]}>
                  <View style={styles.createdByHeaderIcon}>
                    <IconSymbol name="person.fill" size={18} color="#805AD5" />
                  </View>
                  <Text style={styles.createdByHeaderText}>{o.developedBy}</Text>
                </View>
                <Text style={styles.creatorName}>Alex Korir, MSN RN</Text>
                <Text style={styles.creatorCredentials}>MSN, RN, CCRN-CMC</Text>
                <View style={[styles.creatorRoleBadge, { marginBottom: 14 }]}>
                  <Text style={styles.creatorRoleText}>{o.creatorRole}</Text>
                </View>
                <Text style={[styles.creatorBioHeadline, { fontSize: 13, lineHeight: 19 }]}>
                  {ab.creatorBio1}
                </Text>
                <Text style={[styles.creatorBioBody, { fontSize: 12, lineHeight: 18 }]}>
                  {ab.creatorBio2}
                </Text>
              </View>
              {/* Right: photo with gradient blend on left edge + press-zoom */}
              <Pressable
                onPressIn={() => {
                  onboardingPhotoScale.value = withTiming(1.07, { duration: 180, easing: REasing.out(REasing.quad) });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                onPressOut={() => {
                  onboardingPhotoScale.value = withSpring(1, { damping: 14, stiffness: 180 });
                }}
                style={{ alignSelf: 'stretch' }}
              >
              <RAnimated.View style={[{ width: 150, alignSelf: 'stretch', borderTopRightRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', flex: 1 }, onboardingPhotoAnimStyle]}>
                {/* Use absolute fill + top-anchor so the head is never cropped.
                    The image natural ratio is 1:1.40 — we fill width=150 and let
                    height be 150*1.40=210 anchored to top=0 so the face shows. */}
                <Image
                  source={require('@/assets/images/creator-photo.jpg')}
                  style={{ position: 'absolute', top: 0, left: 0, width: 150, height: 210 }}
                  contentFit="cover"
                  transition={300}
                />
                {/* Left-to-right gradient to blend into card background */}
                <LinearGradient
                  colors={['rgba(26,29,38,0.85)', 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 0.35, y: 0.5 }}
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents="none"
                />
                {/* Name overlay label */}
                <Text
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    left: 8,
                    right: 6,
                    color: '#ffffff',
                    fontSize: 8,
                    fontWeight: '600',
                    letterSpacing: 0.1,
                    lineHeight: 11,
                  }}
                  numberOfLines={2}
                >
                  Alex Korir, MSN RN
                </Text>
                {/* Verified credential badge */}
                <View
                  style={{
                    position: 'absolute',
                    bottom: 5,
                    right: 5,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: '#22C55E',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: '#ffffff',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 8, fontWeight: '800', lineHeight: 10 }}>✓</Text>
                </View>
              </RAnimated.View>
              </Pressable>
            </View>
          </View>

          {/* ── Language picker button ──────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLangPickerVisible(true);
              }}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: 24, borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.15)',
                paddingHorizontal: 18, paddingVertical: 10,
                opacity: pressed ? 0.75 : 1,
              }]}
              accessibilityRole="button"
              accessibilityLabel={o.selectLanguage}
            >
              <Text style={{ fontSize: 18 }}>{getLangFlag(rawLang)}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>{o.languagePickerBtn}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>›</Text>
            </Pressable>
          </View>

          {/* Vitals tooltip modal */}
          <Modal
            visible={vitalsTooltipVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setVitalsTooltipVisible(false)}
          >
            <Pressable style={styles.tooltipOverlay} onPress={() => setVitalsTooltipVisible(false)}>
              <View style={[styles.tooltipCard, { backgroundColor: '#1A2540' }]}>
                <Text style={[styles.tooltipTitle, { color: '#F59E0B' }]}>{o.featureVitals}</Text>
                <Text style={[styles.tooltipBody, { color: '#ECEDEE' }]}>{o.featureVitalsDesc}</Text>
                <Pressable onPress={() => setVitalsTooltipVisible(false)} style={[styles.tooltipClose, { backgroundColor: '#F59E0B' }]}>
                  <Text style={styles.tooltipCloseText}>{o.gotIt}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
        </View>


        {/* ── Slide 2: Health Permissions ───────────────────────────────────── */}

        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          <View style={styles.slideIconWrap}>
            <View style={[styles.iconCircle, { backgroundColor: SLIDE_META[2].iconColor + '22' }]}>
              <IconSymbol name={SLIDE_META[2].icon} size={52} color={SLIDE_META[2].iconColor} />
            </View>
          </View>
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[2].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[2].bottom}</Text>
            <Text style={styles.headlineSub}>{o.dataSourcesTitle}</Text>
          </RAnimated.View>
          <View style={styles.contentCard}>

            {/* ── Apple Health (iOS) ── */}
            <View style={[styles.permPlatformCard, {
              backgroundColor: 'rgba(229,83,62,0.10)',
              borderColor: '#E53E3E50',
            }]}>
              <View style={[styles.permPlatformIcon, { backgroundColor: '#E53E3E20' }]}>
                <IconSymbol name="heart.fill" size={20} color="#E53E3E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permPlatformOS}>iOS · watchOS</Text>
                <Text style={styles.permPlatformName}>{o.dataSourceAppleHealth}</Text>
                <Text style={styles.permPlatformSub}>{o.dataSourceAppleHealthDesc}</Text>
              </View>
            </View>

            {/* ── Health Connect (Android) ── */}
            <View style={[styles.permPlatformCard, {
              backgroundColor: ACCENT + '20',
              borderColor: ACCENT + '50',
            }]}>
              <View style={[styles.permPlatformIcon, { backgroundColor: ACCENT + '20' }]}>
                <IconSymbol name="waveform" size={20} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permPlatformOS}>Android · Wear OS</Text>
                <Text style={styles.permPlatformName}>{o.dataSourceAndroidHealth}</Text>
                <Text style={styles.permPlatformSub}>{o.dataSourceAndroidHealthDesc}</Text>
              </View>
            </View>

            {/* ── Apple Scribe ── */}
            <View style={[styles.permPlatformCard, {
              backgroundColor: 'rgba(159,122,234,0.10)',
              borderColor: 'rgba(159,122,234,0.35)',
            }]}>
              <View style={[styles.permPlatformIcon, { backgroundColor: 'transparent' }]}>
                <MicrophoneIcon size={36} isActive={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permPlatformOS}>{Platform.OS === 'ios' ? 'On-Device' : 'Built-in'}</Text>
                <Text style={styles.permPlatformName}>{o.dataSourceAppleScribe}</Text>
                <Text style={styles.permPlatformSub}>{o.dataSourceAppleScribeDesc}</Text>
              </View>
            </View>

            {/* ── Manual Entry ── */}
            <View style={[styles.permPlatformCard, {
              backgroundColor: 'rgba(113,128,150,0.10)',
              borderColor: 'rgba(113,128,150,0.30)',
            }]}>
              <View style={[styles.permPlatformIcon, { backgroundColor: 'rgba(113,128,150,0.18)' }]}>
                <IconSymbol name="chevron.right" size={18} color="#718096" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permPlatformOS}>{o.alwaysAvailable}</Text>
                <Text style={styles.permPlatformName}>{o.dataSourceManual}</Text>
                <Text style={styles.permPlatformSub}>{o.dataSourceManualDesc}</Text>
              </View>
            </View>

            {/* ── Connect in Settings nudge ── */}
            <View style={{
              marginTop: 4,
              padding: 14,
              borderRadius: 12,
              backgroundColor: 'rgba(10,126,164,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(10,126,164,0.30)',
              gap: 6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>ℹ️</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#ECEDEE', flex: 1 }}>
                  Connect after setup
                </Text>
              </View>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 18 }}>
                Health platform access is configured in{' '}
                <Text style={{ color: '#38BDF8', fontWeight: '600' }}>{o.settingsHealthDetail}</Text>.
                Tap{' '}
                <Text style={{ color: '#E53E3E', fontWeight: '600' }}>{o.requestPermissionInline}</Text>
                {' '}to grant access on iOS or Android.
              </Text>
            </View>

            <View style={styles.permPrivacyNote}>
              <IconSymbol name="lock.fill" size={12} color="rgba(255,255,255,0.45)" />
              <Text style={styles.permPrivacyText}>{o.dataNeverLeavesDevice}</Text>
            </View>
          </View>
        </View>

        {/* ── Slide 4: Threshold Setup ──────────────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          <View style={styles.slideIconWrap}>
            <View style={[styles.iconCircle, { backgroundColor: SLIDE_META[3].iconColor + '22' }]}>
              <IconSymbol name={SLIDE_META[3].icon} size={52} color={SLIDE_META[3].iconColor} />
            </View>
          </View>
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[3].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[3].bottom}</Text>
            <Text style={styles.headlineSub}>{o.thresholdsSub}</Text>
          </RAnimated.View>
          <View style={styles.contentCard}>
            <ThresholdRow
              label={o.systolicBpHigh}
              value={thresholds.bp.systolicHigh}
              unit="mmHg"
              color={colors.error}
              onCommit={(v) => setThresholds((t) => ({ ...t, bp: { ...t.bp, systolicHigh: v } }))}
            />
            <ThresholdRow
              label={o.diastolicBpHigh}
              value={thresholds.bp.diastolicHigh}
              unit="mmHg"
              color={colors.bpAmber}
              onCommit={(v) => setThresholds((t) => ({ ...t, bp: { ...t.bp, diastolicHigh: v } }))}
            />
            <ThresholdRow
              label={o.lowHrvAlert}
              value={thresholds.hrv.low}
              unit="ms"
              color={colors.accent}
              onCommit={(v) => setThresholds((t) => ({ ...t, hrv: { ...t.hrv, low: v } }))}
            />
            <ThresholdRow
              label={o.highHeartRate}
              value={thresholds.heartRate.high}
              unit="BPM"
              color={colors.heartRed}
              onCommit={(v) => setThresholds((t) => ({ ...t, heartRate: { ...t.heartRate, high: v } }))}
            />
            <ThresholdRow
              label={o.bloodGlucoseHigh ?? 'Blood Sugar High'}
              value={thresholds.bloodGlucose?.high ?? 180}
              unit="mg/dL"
              color="#F59E0B"
              onCommit={(v) => setThresholds((t) => ({ ...t, bloodGlucose: { ...(t.bloodGlucose ?? { low: 70, high: 180 }), high: v } }))}
            />
            <ThresholdRow
              label={o.bloodGlucoseLow ?? 'Blood Sugar Low'}
              value={thresholds.bloodGlucose?.low ?? 70}
              unit="mg/dL"
              color="#EF4444"
              onCommit={(v) => setThresholds((t) => ({ ...t, bloodGlucose: { ...(t.bloodGlucose ?? { low: 70, high: 180 }), low: v } }))}
            />
            <ThresholdRow
              label={o.temperatureHigh ?? 'Temperature High'}
              value={thresholds.temperature?.high ?? 38.0}
              unit="°C"
              color="#E53E3E"
              onCommit={(v) => setThresholds((t) => ({ ...t, temperature: { ...(t.temperature ?? { high: 38.0, low: 35.0 }), high: v } }))}
            />
            <ThresholdRow
              label={o.temperatureLow ?? 'Temperature Low'}
              value={thresholds.temperature?.low ?? 35.0}
              unit="°C"
              color="#3B82F6"
              onCommit={(v) => setThresholds((t) => ({ ...t, temperature: { ...(t.temperature ?? { high: 38.0, low: 35.0 }), low: v } }))}
            />
          </View>
        </View>

        {/* ── Slide 5: Settings, Help & Support ─────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          <View style={styles.slideIconWrap}>
            <View style={[styles.iconCircle, { backgroundColor: '#0a7ea422' }]}>
              <IconSymbol name="questionmark.circle.fill" size={52} color="#38BDF8" />
            </View>
          </View>
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[4].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[4].bottom}</Text>
            <Text style={styles.headlineSub}>{o.everythingInSettings}</Text>
          </RAnimated.View>
          <View style={[styles.contentCard, { gap: 14 }]}>
            {/* Row 1: Settings → Help & Support */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: 'rgba(10,126,164,0.10)', borderRadius: 14,
              borderWidth: 1, borderColor: 'rgba(10,126,164,0.30)', padding: 14,
            }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(10,126,164,0.20)', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="gearshape.fill" size={20} color="#38BDF8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#ECEDEE', lineHeight: 18, marginBottom: 2 }}>{o.everythingInSettings}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 16 }}>{o.everythingInSettings}</Text>
              </View>
            </View>
            {/* Row 2: Website link */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                import('expo-web-browser').then(({ openBrowserAsync }) =>
                  openBrowserAsync('https://vitalsyncpersonalwellnesshub.com/article/privacy-policy')
                ).catch(() => import('react-native').then(({ Linking }) =>
                  Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/privacy-policy')
                ));
              }}
              style={({ pressed }) => ([
                {
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: pressed ? 'rgba(10,126,164,0.20)' : 'rgba(10,126,164,0.10)',
                  borderRadius: 14, borderWidth: 1, borderColor: 'rgba(10,126,164,0.40)', padding: 14,
                },
              ])}
              accessibilityRole="link"
              accessibilityLabel="View VitalSync Privacy Policy"
            >
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(10,126,164,0.20)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>🌐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#38BDF8', lineHeight: 18, marginBottom: 2 }}>{o.viewPrivacyPolicy}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 16 }}>{o.viewPrivacyPolicyDesc}</Text>
              </View>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>›</Text>
            </Pressable>
            {/* Row 3: Contact support */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL('mailto:support@vitalsyncpersonalwellnesshub.com?subject=VitalSync%20Support').catch(() => {});
              }}
              style={({ pressed }) => ([
                {
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 14,
                },
              ])}
              accessibilityRole="link"
              accessibilityLabel="Email VitalSync support"
            >
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>✉️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#ECEDEE', lineHeight: 18, marginBottom: 2 }}>{o.contactSupport}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 16 }}>support@vitalsyncpersonalwellnesshub.com</Text>
              </View>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>›</Text>
            </Pressable>
          </View>
        </View>
        {/* ── Slide 6: Theme Selection ────────────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          {/* Live mini-dashboard preview replaces the static icon */}
          <View style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2 }}>
            <MiniDashboardPreview theme={selectedTheme} />
          </View>
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[5].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[5].bottom}</Text>
            <Text style={styles.headlineSub}>{o.pickTheme}</Text>
          </RAnimated.View>
          <View style={[styles.contentCard, { gap: 12 }]}>
            {(
              [
                { val: 'light'  as const, emoji: '☀️', label: o.themeLight,  desc: o.themeLightDesc },
                { val: 'dark'   as const, emoji: '🌙', label: o.themeDark,   desc: o.themeDarkDesc },
                { val: 'amoled' as const, emoji: '⬛', label: (o as any).themeAmoled ?? 'AMOLED Black', desc: (o as any).themeAmoledDesc ?? 'Pure black background. Saves battery on OLED screens.' },
                { val: 'system' as const, emoji: '⚙️', label: o.themeSystem, desc: o.themeSystemDesc },
              ]
            ).map(({ val, emoji, label, desc }) => (
              <ThemeOptionCard
                key={val}
                val={val}
                emoji={emoji}
                label={label}
                desc={desc}
                isSelected={selectedTheme === val}
                onSelect={() => {
                  setSelectedTheme(val);
                  setThemePref(val);
                }}
              />
            ))}
          </View>
        </View>
        {/* ── Slide 7: Profile Personalisation ─────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          <View style={styles.slideIconWrap}>
            <View style={[styles.iconCircle, { backgroundColor: SLIDE_META[6].iconColor + '22' }]}>
              <IconSymbol name={SLIDE_META[6].icon} size={52} color={SLIDE_META[6].iconColor} />
            </View>
          </View>
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[6].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[6].bottom}</Text>
            <Text style={styles.headlineSub}>{o.profileSub}</Text>
          </RAnimated.View>
          <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
            <View style={[styles.contentCard, { marginBottom: 8 }]}>
              {/* Age */}
              <View style={styles.threshRow}>
                <Text style={[styles.threshLabel, { color: 'rgba(255,255,255,0.65)' }]}>{o.ageLabel}</Text>
                <View style={[styles.threshInputWrap, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}>
                  <TextInput
                    style={[styles.threshInput, { color: SLIDE_META[6].iconColor }]}
                    value={profileAge}
                    onChangeText={setProfileAge}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholder="—"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    maxLength={3}
                  />
                </View>
              </View>
              {/* Weight */}
              <View style={styles.threshRow}>
                <Text style={[styles.threshLabel, { color: 'rgba(255,255,255,0.65)' }]}>{o.weightKg}</Text>
                <View style={[styles.threshInputWrap, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}>
                  <TextInput
                    style={[styles.threshInput, { color: SLIDE_META[6].iconColor }]}
                    value={profileWeight}
                    onChangeText={setProfileWeight}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholder="—"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    maxLength={5}
                  />
                </View>
              </View>
              {/* Height */}
              <View style={styles.threshRow}>
                <Text style={[styles.threshLabel, { color: 'rgba(255,255,255,0.65)' }]}>{o.heightCm}</Text>
                <View style={[styles.threshInputWrap, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}>
                  <TextInput
                    style={[styles.threshInput, { color: SLIDE_META[6].iconColor }]}
                    value={profileHeight}
                    onChangeText={setProfileHeight}
                    keyboardType="default"
                    returnKeyType="done"
                    placeholder="—"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    maxLength={5}
                  />
                </View>
              </View>
              {/* Sex selector */}
              <View style={{ gap: 8 }}>
                <Text style={[styles.threshLabel, { color: 'rgba(255,255,255,0.65)' }]}>{o.sexLabel}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(['male', 'female', 'other', 'preferNotToSay'] as BiologicalSex[]).map((s) => (
                    <Pressable
                      key={s}
                      style={({ pressed }) => ([
                        styles.sexChip,
                        {
                          backgroundColor: profileSex === s ? SLIDE_META[6].iconColor + '22' : 'rgba(255,255,255,0.07)',
                          borderColor: profileSex === s ? SLIDE_META[6].iconColor : 'rgba(255,255,255,0.15)',
                          opacity: pressed ? 0.75 : 1,
                        },
                      ])}
                      onPress={() => {
                        setProfileSex(s === profileSex ? null : s);
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.sexChipText, { color: profileSex === s ? SLIDE_META[6].iconColor : 'rgba(255,255,255,0.65)' }]}>
                        {s === 'preferNotToSay' ? o.sexPrefer : s === 'male' ? o.sexMale : s === 'female' ? o.sexFemale : o.sexOther}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Diet protocol picker */}
            <View style={[styles.contentCard, { marginBottom: 16 }]}>
              <Text style={[styles.threshLabel, { color: 'rgba(255,255,255,0.65)', marginBottom: 4 }]}>{o.dietaryProtocol}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DIET_TYPE_OPTIONS.map((opt) => {
                  const isActive = selectedDiet === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={({ pressed }) => ([
                        styles.sexChip,
                        {
                          backgroundColor: isActive ? SLIDE_META[6].iconColor + '22' : 'rgba(255,255,255,0.07)',
                          borderColor: isActive ? SLIDE_META[6].iconColor : 'rgba(255,255,255,0.15)',
                          opacity: pressed ? 0.75 : 1,
                        },
                      ])}
                      onPress={() => {
                        setSelectedDiet(opt.value);
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.sexChipText, { color: isActive ? SLIDE_META[6].iconColor : 'rgba(255,255,255,0.65)' }]}>
                        {opt.emoji} {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {(() => {
                const active = DIET_TYPE_OPTIONS.find(opt => opt.value === selectedDiet);
                if (!active) return null;
                return (
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 15, marginTop: 6 }}>
                    {active.cardSubtitle}
                  </Text>
                );
              })()}
            </View>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 8 }}>
              {o.profileOptional}
            </Text>
            {/* Skip for now link */}
            <Pressable
              style={({ pressed }) => ([
                { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, opacity: pressed ? 0.5 : 1, marginBottom: 4 },
              ])}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                goToSlide(7);
              }}
              accessibilityRole="button"
              accessibilityLabel="Skip profile setup, go to paywall"
            >
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', textDecorationLine: 'underline' }}>
                {o.skipForNow}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
        {/* ── Slide 7: Paywall (before consent) ─────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH, paddingHorizontal: 0, paddingTop: 0 }]}>
          <ScrollView
            style={{ flex: 1, width: SCREEN_WIDTH }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ alignItems: 'center', paddingTop: 24, paddingHorizontal: 20, marginBottom: 12 }}>
              <Image
                source={require('@/assets/images/vitalsync-3d-logo-paywall.png')}
                style={{ width: 80, height: 80, marginBottom: 10 }}
                contentFit="contain"
              />
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#F59E0B', marginBottom: 4 }}>VITALSYNC PREMIUM</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 6, lineHeight: 30 }}>Unlock Premium</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 }}>Full access to all premium features. Cancel anytime.</Text>
            </View>

            {/* Plan cards */}
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 10 }}>
              {/* Annual */}
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 14, borderWidth: 2, borderColor: '#3B82F6' }}>
                <View style={{ backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.8 }}>BEST VALUE</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, marginBottom: 4 }}>ANNUAL PLAN</Text>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF' }}>$69.99<Text style={{ fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.55)' }}>/year</Text></Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Includes a 14-day free trial</Text>
                <Text style={{ fontSize: 11, color: '#4ADE80', fontWeight: '600', marginTop: 2 }}>Save ~16% vs monthly</Text>
              </View>
              {/* Monthly */}
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, marginBottom: 4 }}>MONTHLY PLAN</Text>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF' }}>$6.99<Text style={{ fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.55)' }}>/month</Text></Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Includes a 14-day free trial</Text>
              </View>
            </View>

            {/* Feature list */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 14, gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 4, letterSpacing: 0.3 }}>What's included</Text>
              {[
                { text: 'EKG waveform viewer & rhythm trends', highlight: true },
                { text: Platform.OS === 'ios' ? 'Apple Intelligence powered nutrition analysis' : 'Gemini powered nutrition analysis', highlight: true },
                { text: 'Unlimited vital signs & lab tracking' },
                { text: 'Blood pressure & glucose trends' },
                { text: 'Medication & appointment management' },
                { text: 'Advanced health reports & PDF export' },
                { text: 'Personal health narrative generation' },
                { text: 'Correlation engine & pattern detection' },
                { text: 'Lab results tracking & trend analysis' },
                { text: 'BLE device connectivity (BP monitors, scales)' },
              ].map(({ text, highlight }) => (
                <View key={text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <MaterialIcons name="check-circle" size={16} color={highlight ? '#3B82F6' : '#4ADE80'} style={{ marginTop: 2 }} />
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', flex: 1, lineHeight: 19 }}>{text}</Text>
                  {highlight && (
                    <View style={{ backgroundColor: 'rgba(255,196,0,0.15)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(255,196,0,0.35)' }}>
                      <Text style={{ fontSize: 10 }}>👑</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Disclosure (Apple 3.1.2(c) — above CTA) */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 16, textAlign: 'center' }}>
                After the 14-day free trial, your subscription automatically renews at $69.99/year (or $6.99/month) unless canceled at least 24 hours before renewal.
              </Text>
            </View>

            {/* CTA */}
            <Pressable
              style={({ pressed }) => [{
                backgroundColor: '#3B82F6',
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: 'center',
                marginHorizontal: 20,
                marginBottom: 10,
                opacity: pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/paywall' as any);
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff' }}>Continue with Annual Plan</Text>
            </Pressable>

            {/* Skip to consent */}
            <Pressable
              style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: 8, opacity: pressed ? 0.5 : 1 }]}
              onPress={() => goToSlide(8)}
            >
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)', textDecorationLine: 'underline' }}>Maybe later</Text>
            </Pressable>

            {/* Privacy / Terms */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              <Pressable onPress={() => Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/privacy-policy')}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textDecorationLine: 'underline' }}>Privacy Policy</Text>
              </Pressable>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>·</Text>
              <Pressable onPress={() => Linking.openURL('https://vitalsyncpersonalwellnesshub.com/article/subscription-plans')}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textDecorationLine: 'underline' }}>Terms of Use</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>

        {/* ── Slide 8: Consent ────────────────────────────────────────── */}
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          <View style={styles.slideIconWrap}>
            <View style={[styles.iconCircle, { backgroundColor: SLIDE_META[8].iconColor + '22' }]}>
              <IconSymbol name={SLIDE_META[8].icon} size={52} color={SLIDE_META[8].iconColor} />
            </View>
          </View>
          <RAnimated.View style={[styles.headlineWrap, headlineAnimStyle]}>
            <Text style={styles.headlineTop}>{SLIDE_HEADLINES[6].top}</Text>
            <Text style={styles.headlineBottom}>{SLIDE_HEADLINES[6].bottom}</Text>
            <Text style={styles.headlineSub}>{o.consentSub}</Text>
          </RAnimated.View>
          <View style={styles.privacyChecklistCard}>
            {consentStrings[lang as keyof typeof consentStrings]?.points.map((point, i) => (
              <View key={i} style={[styles.privacyChecklistRow, { borderColor: SLIDE_META[7].iconColor + '30', backgroundColor: SLIDE_META[7].iconColor + '10' }]}>
                <View style={[styles.privacyCheckCircle, { backgroundColor: SLIDE_META[7].iconColor + '20', borderColor: SLIDE_META[7].iconColor + '40' }]}>
                  <Text style={styles.privacyCheckIcon}>{CONSENT_POINT_ICONS[i] ?? '✅'}</Text>
                </View>
                <Text style={styles.privacyCheckLabel}>{point}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', lineHeight: 16, marginTop: 4 }}>
              {consentStrings[lang as keyof typeof consentStrings]?.legal ?? consentStrings.en.legal}{' '}
              <Text style={{ color: SLIDE_META[7].iconColor, fontWeight: '600' }}>
                {consentStrings[lang as keyof typeof consentStrings]?.privacy ?? consentStrings.en.privacy}
              </Text>
              {' & '}
              <Text style={{ color: SLIDE_META[7].iconColor, fontWeight: '600' }}>
                {consentStrings[lang as keyof typeof consentStrings]?.terms ?? consentStrings.en.terms}
              </Text>
            </Text>
            {/* Acknowledgement checkbox */}
            <Pressable
              style={({ pressed }) => ([
                styles.ackRow,
                {
                  backgroundColor: consentAcknowledged ? SLIDE_META[7].iconColor + '12' : 'rgba(255,255,255,0.05)',
                  borderColor: consentAcknowledged ? SLIDE_META[7].iconColor : 'rgba(255,255,255,0.15)',
                  opacity: pressed ? 0.8 : 1,
                },
              ])}
              onPress={() => {
                const next = !consentAcknowledged;
                setConsentAcknowledged(next);
                safeSetItem('@vitalsync/consent_ack_v1', next ? 'true' : 'false').catch(() => {});
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[
                styles.ackCheckbox,
                {
                  backgroundColor: consentAcknowledged ? SLIDE_META[7].iconColor : 'transparent',
                  borderColor: consentAcknowledged ? SLIDE_META[7].iconColor : 'rgba(255,255,255,0.35)',
                },
              ]}>
                {consentAcknowledged && <IconSymbol name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={[styles.ackText, { color: consentAcknowledged ? SLIDE_META[7].iconColor : 'rgba(255,255,255,0.55)' }]}>
                {(o as any).consentAck ?? 'I understand this app does not give medical advice and my data stays on this device.'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, alignSelf: 'center', marginTop: 4 }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/settings/data-privacy' as any);
              }}
            >
              <Text style={[styles.learnMoreLink, { color: SLIDE_META[7].iconColor }]}>
                {o.viewPrivacyPolicy} →
              </Text>
            </Pressable>
            {/* Terms of Use expandable section */}
            <Pressable
              style={({ pressed }) => [{
                opacity: pressed ? 0.7 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                marginTop: 8,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: termsExpanded ? SLIDE_META[7].iconColor + '15' : 'transparent',
              }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTermsExpanded(prev => !prev);
              }}
            >
              <Text style={{ color: SLIDE_META[7].iconColor, fontSize: 13, fontWeight: '600' }}>
                {o.viewTermsOfUse ?? 'Terms of Use'}
              </Text>
              <Text style={{ color: SLIDE_META[7].iconColor, fontSize: 11 }}>{termsExpanded ? '▲' : '▼'}</Text>
            </Pressable>
            {termsExpanded && (
              <View style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderWidth: 1,
                borderColor: SLIDE_META[7].iconColor + '30',
              }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 18 }}>
                  {`By using VitalSync, you agree to use this app for personal health tracking only. This app does not provide medical advice, diagnosis, or treatment. All data is stored locally on your device. You may delete your data at any time from Settings → Privacy. VitalSync is not liable for decisions made based on app data. Use of this app constitutes acceptance of these terms.`}
                </Text>
                <Pressable
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-end', marginTop: 8 }]}
                  onPress={() => Linking.openURL('https://vitalsync.health/terms')}
                >
                  <Text style={{ color: SLIDE_META[7].iconColor, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                    {o.viewTermsOfUse ?? 'Full Terms of Use'} →
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

      </ScrollView>

      {/* ── Bottom pill nav bar ─────────────────────────────────────────────── */}
      <View style={styles.pillNavBar}>
        {/* Left: logo dot (slide 0) or back-dot */}
        <Pressable
          style={styles.pillNavLeft}
          onPress={() => currentSlide > 0 && goToSlide(currentSlide - 1)}
        >
          {currentSlide === 0 ? (
            <Image source={require('@/assets/images/icon.png')} style={styles.pillNavIcon} contentFit="contain" />
          ) : (
            <Text style={styles.pillNavChevron}>‹</Text>
          )}
        </Pressable>

        {/* Centre: linear progress bar */}
        <View style={styles.pillNavProgress}>
          <View style={styles.pillProgressTrack}>
            <Animated.View
              style={[
                styles.pillProgressFill,
                { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <Text style={styles.pillProgressLabel}>{currentSlide + 1} / {SLIDE_COUNT}</Text>
        </View>

        {/* Right: >>> advance / ✓ finish */}
        <RAnimated.View style={[isLastSlide && consentAcknowledged ? ctaPulseStyle : undefined]}>
          <Pressable
            style={({ pressed }) => [
              styles.pillNavRight,
              {
                backgroundColor: 'transparent',
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
                overflow: 'hidden',
              },
            ]}
            onPress={() => handleCTAPress(currentSlide)}
            disabled={
              (currentSlide === SLIDE_COUNT - 1 && !consentAcknowledged)
            }
          >
            {isLastSlide && consentAcknowledged ? (
              <LinearGradient
                colors={['#D69E2E', '#F6AD55', '#ECC94B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <LinearGradient
                colors={
                  (isLastSlide && !consentAcknowledged)
                    ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.15)']
                    : [ACCENT, '#1D4ED8']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            )}
            {isLastSlide ? (
              <Text style={[styles.pillNavCheckmark, isLastSlide && consentAcknowledged ? { color: '#1A1A00' } : {}]}>✓</Text>
            ) : (
              <Text style={styles.pillNavArrow}>»»</Text>
            )}
          </Pressable>
        </RAnimated.View>
      </View>

      {/* Skip link */}
      {currentSlide > 0 && currentSlide < 3 && (
        <Pressable onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSkipConfirmVisible(true);
        }} style={styles.skipBtn}>
          <Text style={styles.skipText}>{o.skipSetup}</Text>
        </Pressable>
      )}

      {/* Skip confirmation bottom sheet */}
      <Modal
        visible={skipConfirmVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSkipConfirmVisible(false)}
      >
        <Pressable
          style={styles.skipSheetOverlay}
          onPress={() => setSkipConfirmVisible(false)}
        >
          <Pressable style={styles.skipSheetCard} onPress={() => {}}>
            {/* Handle bar */}
            <View style={styles.skipSheetHandle} />
            <Text style={styles.skipSheetTitle}>{o.skipTitle}</Text>
            <Text style={styles.skipSheetBody}>{o.skipBody}</Text>
            <Pressable
              style={styles.skipSheetConfirmBtn}
              onPress={() => {
                setSkipConfirmVisible(false);
                handleFinish();
              }}
            >
              <Text style={styles.skipSheetConfirmText}>{o.skipForNow}</Text>
            </Pressable>
            <Pressable
              style={styles.skipSheetCancelBtn}
              onPress={() => setSkipConfirmVisible(false)}
            >
              <Text style={styles.skipSheetCancelText}>{o.continueSetup}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Language picker modal ── */}
      <Modal
        visible={langPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangPickerVisible(false)}
      >
        <Pressable
          style={[styles.skipSheetOverlay, { justifyContent: 'flex-end' }]}
          onPress={() => setLangPickerVisible(false)}
        >
          <Pressable
            style={[styles.skipSheetCard, { maxHeight: '80%', paddingBottom: 24 }]}
            onPress={() => {}}
          >
            <View style={styles.skipSheetHandle} />
            <Text style={[styles.skipSheetTitle, { marginBottom: 8 }]}>{o.selectLanguage}</Text>
            {/* Search bar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
              paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
            }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>🔍</Text>
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#ECEDEE' }}
                placeholder="Search language…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={langSearch}
                onChangeText={setLangSearch}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
            </View>
            {/* Language list */}
            <FlatList
              data={SUPPORTED_LANGUAGES.filter(l => {
                const q = langSearch.toLowerCase().trim();
                if (!q) return true;
                return l.label.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
              })}
              keyExtractor={item => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = rawLang === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => ([
                      {
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 4,
                        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
                        backgroundColor: isSelected ? 'rgba(10,126,164,0.15)' : 'transparent',
                        borderRadius: 8,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ])}
                    onPress={async () => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const needsRestart = await applyRTLForLang(item.code);
                      await setLangOverride(item.code as Lang);
                      setLangPickerVisible(false);
                      setLangSearch('');
                      if (needsRestart) {
                        const { Alert } = require('react-native');
                        Alert.alert(
                          isRTLLang(item.code) ? 'RTL Layout Enabled' : 'Restart Required',
                          'The layout direction has changed. Reload now to apply the new layout.',
                          [
                            { text: 'Later', style: 'cancel' },
                            {
                              text: 'Reload App',
                              onPress: async () => {
                                try {
                                  const U = await import('expo-updates');
                                  await U.reloadAsync();
                                } catch (_unused) {}
                              },
                            },
                          ],
                        );
                      }
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${item.label} — ${item.native}`}
                  >
                    <Text style={{ fontSize: 22 }}>{getLangFlag(item.code)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: isSelected ? '#38BDF8' : '#ECEDEE', lineHeight: 18 }}>{item.native}</Text>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 15 }}>{item.label}</Text>
                    </View>
                    {isSelected && <Text style={{ fontSize: 16, color: '#38BDF8' }}>✓</Text>}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Completion overlay ── */}
      {showComplete && (
        <RAnimated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: '#0A0E1A', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
            completeOverlayStyle,
          ]}
        >
          {/* Confetti particles */}
          {['#D69E2E','#38A169','#38BDF8','#E53E3E','#805AD5','#F6AD55'].map((color, i) => (
            <RAnimated.View
              key={i}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: color,
                top: `${15 + (i * 12)}%` as any,
                left: `${10 + (i * 14)}%` as any,
                opacity: 0.85,
              }}
            />
          ))}
          {/* Checkmark circle */}
          <RAnimated.View style={[completeCheckStyle, { alignItems: 'center', justifyContent: 'center' }]}>
            <LinearGradient
              colors={['#38A169', '#48BB78', '#68D391']}
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#38A169',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
                elevation: 12,
              }}
            >
              <Text style={{ fontSize: 52, color: '#FFFFFF' }}>✓</Text>
            </LinearGradient>
          </RAnimated.View>
          {/* Text */}
          <RAnimated.View style={[completeTextStyle, { alignItems: 'center', marginTop: 28 }]}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, textAlign: 'center' }}>
              {o.allSet}
            </Text>
            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.60)', marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
              {o.welcomeMessage}
            </Text>
          </RAnimated.View>
        </RAnimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_TOP,
  },
  polyOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  topLogoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  slideCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
  },
  slideScroll: { flex: 1 },
  slide: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 14,
    overflow: 'hidden',
  },
  // ── Hero photo (slide 1) — kept as no-op for parallax style reference ──────
  heroPhotoWrap: { position: 'absolute', top: 0, right: 0, width: 0, height: 0 },
  heroPhoto: { width: 0, height: 0 },
  heroFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 0 },
  heroLeftFade: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 0 },
  heroTextCol: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 0 },

  // ── Created By card (slide 1) ─────────────────────────────────────────────
  createdByCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 20,
  },
  createdByHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  createdByHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#805AD522',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createdByHeaderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  creatorPhoto: {
    width: 110,
    height: 140,
    borderRadius: 14,
    backgroundColor: '#1A2540',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  creatorInfo: {
    flex: 1,
    paddingTop: 4,
  },
  creatorName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  creatorCredentials: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38A169',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  creatorRoleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#38A16922',
    borderWidth: 1,
    borderColor: '#38A16944',
  },
  creatorRoleText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#68D391',
    letterSpacing: 0.3,
  },
  creatorBioHeadline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 10,
  },
  creatorBioBody: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.60)',
    lineHeight: 22,
  },
  // ── Headlines ─────────────────────────────────────────────────────────────────────────────────
  headlineWrap: {
    paddingBottom: 6,
  },
  headlineTop: {
    fontSize: 30,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 36,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  headlineBottom: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 40,
    letterSpacing: -1,
    marginBottom: 10,
  },
  headlineSub: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  // ── Creator credential badge (slide 1) ────────────────────────────────────
  credentialBadge: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  credentialText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.90)',
    letterSpacing: 0.3,
  },
  credentialRole: {
    fontSize: 10,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  // ── Feature pills ─────────────────────────────────────────────────────────────
  featurePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  pillInfoDot: { fontSize: 11, fontWeight: '700' },
  // ── Slide icon (non-hero slides) ──────────────────────────────────────────────
  slideIconWrap: {
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Content card (glass) ──────────────────────────────────────────────────────
  contentCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16,
    gap: 12,
  },
  // ── Privacy rows ──────────────────────────────────────────────────────────────
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  privacyIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyText: { flex: 1 },
  privacyLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  privacyDesc: { fontSize: 11, marginTop: 1, color: 'rgba(255,255,255,0.55)' },
  // ── Privacy checklist (slide 2) ───────────────────────────────────────────
  privacyChecklistCard: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  privacyChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(104,211,145,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(104,211,145,0.18)',
  },
  privacyCheckCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(104,211,145,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(104,211,145,0.30)',
  },
  privacyCheckIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  privacyCheckLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.90)',
    lineHeight: 18,
  },
  // ── Permissions ───────────────────────────────────────────────────────────────
  permPlatformCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  permPlatformIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permPlatformOS: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' },
  permPlatformName: { fontSize: 15, fontWeight: '700', marginTop: 1, color: '#FFFFFF' },
  permPlatformSub: { fontSize: 11, marginTop: 1, color: 'rgba(255,255,255,0.55)' },
  permStatusDot: { width: 8, height: 8, borderRadius: 4 },
  grantBtn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  grantBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grantBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  grantBtnSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500' },
  grantedBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
  },
  grantedTextLarge: { fontSize: 15, fontWeight: '800' },
  grantedSubText: { fontSize: 12, marginTop: 2, color: 'rgba(255,255,255,0.55)' },
  permPrivacyNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  permPrivacyText: { color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: '500' },
  // ── Threshold inputs ──────────────────────────────────────────────────────────
  threshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  threshLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
  threshInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 90,
  },
  threshInput: { fontSize: 16, fontWeight: '700', minWidth: 44, textAlign: 'right' },
  threshUnit: { fontSize: 10, fontWeight: '500' },
  // ── Sex / diet chips ──────────────────────────────────────────────────────────
  sexChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  sexChipText: { fontSize: 13, fontWeight: '600' },
  // ── Consent ───────────────────────────────────────────────────────────────────
  ackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  ackCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  ackText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  learnMoreLink: { fontSize: 12, fontWeight: '600', textDecorationLine: 'underline', letterSpacing: 0.1 },
  // ── Tooltip ───────────────────────────────────────────────────────────────────
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  tooltipCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  tooltipTitle: { fontSize: 16, fontWeight: '700' },
  tooltipBody: { fontSize: 14, lineHeight: 22 },
  tooltipClose: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  tooltipCloseText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  // ── Bottom pill nav bar ───────────────────────────────────────────────────────
  pillNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: PILL_BG,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: PILL_BORDER,
    // Glass shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  pillNavLeft: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillNavIcon: { width: 28, height: 28, borderRadius: 6 },
  pillNavChevron: { fontSize: 22, color: '#FFFFFF', fontWeight: '700', lineHeight: 26 },
  pillNavDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  dot: { height: 7, borderRadius: 4 },
  pillNavRight: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  pillNavArrow: { fontSize: 18, color: '#FFFFFF', fontWeight: '800', letterSpacing: -1 },
  pillNavCheckmark: { fontSize: 20, color: '#FFFFFF', fontWeight: '800' },
  // ── Skip ────────────────────────────────────────────────────────────────────────────────
  skipBtn: { alignSelf: 'center', paddingVertical: 4, marginBottom: Platform.OS === 'ios' ? 8 : 4 },
  skipText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.40)' },
  // ── Skip confirmation sheet ──────────────────────────────────────────────
  skipSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  skipSheetCard: {
    backgroundColor: '#0D1E3A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  skipSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  skipSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  skipSheetBody: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 24,
  },
  skipSheetConfirmBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  skipSheetConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
  },
  skipSheetCancelBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipSheetCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ── Privacy Shield illustration ──────────────────────────────────────────────────
  privacyShieldWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  privacyShieldGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#38A169',
    opacity: 0.10,
  },
  privacyShieldBody: {
    width: 110,
    height: 120,
    borderRadius: 14,
    borderBottomLeftRadius: 55,
    borderBottomRightRadius: 55,
    backgroundColor: 'rgba(56,161,105,0.14)',
    borderWidth: 1.5,
    borderColor: 'rgba(56,161,105,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 8,
  },
  privacyLockCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(56,161,105,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(56,161,105,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyBadgeRow: {
    flexDirection: 'row',
    gap: 3,
  },
  privacyBadge: {
    backgroundColor: 'rgba(56,161,105,0.18)',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(56,161,105,0.30)',
  },
  privacyBadgeText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#68D391',
    letterSpacing: 0.2,
  },
  // ── Linear progress bar (replaces dots) ───────────────────────────────────────
  pillNavProgress: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  pillProgressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  pillProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  pillProgressLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.5,
  },
});