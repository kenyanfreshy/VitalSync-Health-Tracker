/**
 * CollapsibleCard
 *
 * A lightweight wrapper that adds a tap-to-collapse header row to any dashboard card.
 * The card container now uses the shared GlassCard shell for a cohesive 3D liquid glass look.
 *
 * Persistence: when a `storageKey` is provided the collapsed state is saved to
 * AsyncStorage under `@vsht:card_collapsed/<storageKey>` so the user's
 * layout preference survives app restarts.
 *
 * First-launch hint: on the very first time a card is shown in its collapsed state,
 * the chevron pulses gently and a "Tap to expand" label fades in for ~3 s to teach
 * new users that cards are expandable. The hint is shown only once (persisted via
 * AsyncStorage key `@vsht:collapsed_hint_shown_v1`).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme, useColors } from '@/hooks';
import { GlassCard } from '@/components/glass-card';
import type { SymbolViewProps } from 'expo-symbols';

type SFSymbolName = SymbolViewProps['name'];

const CARD_COLLAPSED_PREFIX = '@vsht:card_collapsed/';
export const HINT_SHOWN_KEY = '@vsht:collapsed_hint_shown_v1';
const ANIM_DURATION = 260;
const ANIM_EASING = Easing.bezier(0.4, 0, 0.2, 1);

interface CollapsibleCardProps {
  title: string;
  /** Optional subtitle shown below the title in the header row */
  subtitle?: string;
  accentColor: string;
  icon?: SFSymbolName;
  defaultCollapsed?: boolean;
  overrideExpanded?: boolean;
  storageKey?: string;
  children: React.ReactNode;
}

export function CollapsibleCard({
  title,
  subtitle,
  accentColor,
  icon,
  defaultCollapsed = false,
  overrideExpanded,
  storageKey,
  children,
}: CollapsibleCardProps) {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  // Re-measure on orientation change: width change means content may reflow
  const { width: screenWidth } = useWindowDimensions();

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hydrated, setHydrated] = useState(!storageKey);

  // ── First-launch hint state ───────────────────────────────────────────
  const [showHint, setShowHint] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  // Reanimated shared value for chevron pulse scale
  const hintChevronScale = useSharedValue(1);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Restore persisted state on mount ──────────────────────────────────
  useEffect(() => {
    if (!storageKey) return;
    const key = CARD_COLLAPSED_PREFIX + storageKey;
    AsyncStorage.getItem(key)
      .then(raw => { if (raw !== null) setCollapsed(raw === 'true'); })
      .catch(() => {})
      .finally(() => setHydrated(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Show first-launch hint once, only on the first collapsed card ─────
  useEffect(() => {
    if (!defaultCollapsed) return; // only show on cards that start collapsed
    AsyncStorage.getItem(HINT_SHOWN_KEY)
      .then(raw => {
        if (raw === 'true') return; // already shown
        // Mark as shown immediately so only the first CollapsibleCard shows it
        safeSetItem(HINT_SHOWN_KEY, 'true').catch(() => {});
        setShowHint(true);
        // Fade in the hint label
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
        // Pulse the chevron scale: 1 → 1.35 → 1, repeat 4 times
        hintChevronScale.value = withRepeat(
          withSequence(
            withTiming(1.35, { duration: 300, easing: Easing.out(Easing.quad) }),
            withTiming(1.0,  { duration: 300, easing: Easing.in(Easing.quad) }),
          ),
          4,   // 4 pulses ≈ 2.4 s
          false,
        );
        // Fade out the hint label after 3 s
        hintTimerRef.current = setTimeout(() => {
          Animated.timing(hintOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => setShowHint(false));
        }, 3000);
      })
      .catch(() => {});
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      cancelAnimation(hintChevronScale);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist state whenever it changes (after hydration) ───────────────
  useEffect(() => {
    if (!storageKey || !hydrated) return;
    safeSetItem(CARD_COLLAPSED_PREFIX + storageKey, String(collapsed)).catch(() => {});
  }, [collapsed, storageKey, hydrated]);

  // When the parent section expands, also expand this card
  const prevOverrideRef = useRef<boolean | undefined>(overrideExpanded);
  useEffect(() => {
    const prev = prevOverrideRef.current;
    prevOverrideRef.current = overrideExpanded;
    if (overrideExpanded === true && prev !== true) setCollapsed(false);
  }, [overrideExpanded]);

  const sectionHidden = overrideExpanded === false;
  const isCollapsed = sectionHidden || collapsed;

  // ── Reanimated accordion height ───────────────────────────────────────
  const naturalHeight = useSharedValue(0);
  const isCollapsedSV = useSharedValue(isCollapsed ? 1 : 0);

  useEffect(() => {
    isCollapsedSV.value = isCollapsed ? 1 : 0;
  }, [isCollapsed, isCollapsedSV]);

  const derivedHeight = useDerivedValue(() =>
    withTiming(
      naturalHeight.value * (1 - isCollapsedSV.value),
      { duration: ANIM_DURATION, easing: ANIM_EASING }
    )
  );

  const animatedContentStyle = useAnimatedStyle(() => ({
    height: derivedHeight.value,
    overflow: 'hidden' as const,
  }));

  // When naturalHeight changes while expanded (content added/removed), smoothly
  // re-animate to the new height using useAnimatedReaction on the UI thread.
  useAnimatedReaction(
    () => naturalHeight.value,
    (current, previous) => {
      if (previous !== null && current !== previous && isCollapsedSV.value === 0) {
        // Card is expanded and content height changed — re-run the timing animation.
        // Nudge isCollapsedSV to force derivedHeight to re-evaluate with the new height.
        isCollapsedSV.value = withTiming(0, { duration: ANIM_DURATION, easing: ANIM_EASING });
      }
    },
  );

  // ── Chevron rotation ──────────────────────────────────────────────────
  const chevronAnim = useRef(new Animated.Value(isCollapsed ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: isCollapsed ? 1 : 0,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start();
  }, [isCollapsed, chevronAnim]);
  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-90deg'],
  });

  // Hint chevron pulse scale (Reanimated)
  const hintChevronScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: hintChevronScale.value }],
  }));

  function handlePress() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Dismiss hint immediately on first tap
    if (showHint) {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      cancelAnimation(hintChevronScale);
      hintChevronScale.value = withTiming(1, { duration: 150 });
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowHint(false));
    }
    setCollapsed(prev => !prev);
  }

  function handleLongPress() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCollapsed(prev => !prev);
  }

  if (!hydrated) return null;

  const headerBorderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const titleColor = collapsed ? colors.muted : colors.foreground;

  return (
    <GlassCard
      accentColor={accentColor}
      noPadding
      style={styles.cardShell}
    >
      {/* ── Header row ── */}
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.header,
          { borderBottomColor: headerBorderColor },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${collapsed ? 'collapsed' : 'expanded'}. Tap to ${collapsed ? 'expand' : 'collapse'}.`}
      >
        <View style={styles.headerLeft}>
          {icon && (
            <View style={[styles.iconBadge, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
              <IconSymbol name={icon} size={13} color={accentColor} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.headerTitle, { color: titleColor }]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Chevron with optional hint pulse wrapper */}
        <Reanimated.View style={showHint ? hintChevronScaleStyle : undefined}>
          <Animated.Text
            style={[
              styles.chevron,
              { color: accentColor + 'CC', transform: [{ rotate: chevronRotate }] },
            ]}
          >
            ▾
          </Animated.Text>
        </Reanimated.View>
      </Pressable>

      {/* ── First-launch "Tap to expand" hint label ── */}
      {showHint && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hintContainer,
            { opacity: hintOpacity, backgroundColor: accentColor + '12' },
          ]}
        >
          <Text style={[styles.hintText, { color: accentColor }]}>
            Tap to expand ▾
          </Text>
        </Animated.View>
      )}

      {/* ── Ghost measurement view: absolutely positioned so onLayout fires even
           when the animated container has height=0 / overflow=hidden.
           The key prop forces a full re-measure when screen width changes
           (e.g. device rotation), preventing stale heights. ── */}
      <View
        key={`ghost-${screenWidth}`}
        pointerEvents="none"
        style={{ position: 'absolute', opacity: 0, left: 0, right: 0, top: 0 }}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && naturalHeight.value !== h) naturalHeight.value = h;
        }}
      >
        {children}
      </View>

      {/* ── Animated content wrapper ── */}
      <Reanimated.View style={animatedContentStyle}>
        {children}
      </Reanimated.View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  chevron: {
    fontSize: 12,
    flexShrink: 0,
    marginLeft: 6,
  },
  hintContainer: {
    paddingVertical: 5,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  hintText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    opacity: 0.9,
  },
});
