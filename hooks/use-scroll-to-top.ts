/**
 * useScrollToTop
 *
 * A hook that provides scroll-to-top FAB state and handlers for ScrollView
 * and FlatList components.
 *
 * Usage with ScrollView:
 * ```tsx
 * const scrollRef = useRef<ScrollView>(null);
 * const { showScrollTop, scrollTopOpacity, handleScroll, scrollToTop } = useScrollToTop(scrollRef);
 * ```
 *
 * Usage with FlatList:
 * ```tsx
 * const listRef = useRef<FlatList<any>>(null);
 * const { showScrollTop, scrollTopOpacity, handleScroll, scrollToTop } = useScrollToTop(listRef, 'flatlist');
 * ```
 */
import { useRef, useState, useCallback } from 'react';
import { Animated, Platform, ScrollView, FlatList } from 'react-native';
import * as Haptics from 'expo-haptics';

type ScrollableRef =
  | React.RefObject<ScrollView | null>
  | React.RefObject<FlatList<any> | null>;

type ScrollType = 'scrollview' | 'flatlist';

const SHOW_THRESHOLD = 300;

export function useScrollToTop(
  ref: ScrollableRef,
  type: ScrollType = 'scrollview',
) {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopOpacity = useRef(new Animated.Value(0)).current;

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      const shouldShow = y > SHOW_THRESHOLD;
      if (shouldShow !== showScrollTop) {
        setShowScrollTop(shouldShow);
        Animated.timing(scrollTopOpacity, {
          toValue: shouldShow ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
    [showScrollTop, scrollTopOpacity],
  );

  const scrollToTop = useCallback(() => {
    if (type === 'flatlist') {
      (ref as React.RefObject<FlatList<any>>).current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    } else {
      (ref as React.RefObject<ScrollView>).current?.scrollTo({
        y: 0,
        animated: true,
      });
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [ref, type]);

  return { showScrollTop, scrollTopOpacity, handleScroll, scrollToTop };
}
