/**
 * ScrollToTopButton
 *
 * A floating action button (FAB) that appears after the user scrolls down
 * past a threshold and scrolls the parent list/scroll-view back to the top.
 *
 * Usage:
 * ```tsx
 * const scrollRef = useRef<ScrollView>(null);
 * const { showScrollTop, scrollTopOpacity, handleScroll, scrollToTop } = useScrollToTop(scrollRef);
 *
 * <ScrollView ref={scrollRef} onScroll={handleScroll} scrollEventThrottle={16}>
 *   ...
 * </ScrollView>
 * <ScrollToTopButton opacity={scrollTopOpacity} visible={showScrollTop} onPress={scrollToTop} />
 * ```
 */
import React from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';

interface ScrollToTopButtonProps {
  /** Animated.Value controlling opacity (0–1) */
  opacity: Animated.Value;
  /** Whether the button is currently visible (controls pointer events) */
  visible: boolean;
  /** Called when the button is pressed */
  onPress: () => void;
  /** Optional bottom offset (default 24) */
  bottom?: number;
  /** Optional right offset (default 20) */
  right?: number;
}

export function ScrollToTopButton({
  opacity,
  visible,
  onPress,
  bottom = 24,
  right = 20,
}: ScrollToTopButtonProps) {
  const colors = useColors();

  return (
    <Animated.View
      style={[
        styles.btn,
        { backgroundColor: colors.primary, opacity, bottom, right },
        { pointerEvents: visible ? 'auto' : 'none' } as any,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.inner, pressed && { opacity: 0.75 }]}
        accessibilityLabel="Scroll to top"
        accessibilityRole="button"
      >
        <IconSymbol name="chevron.up" size={18} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  inner: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
