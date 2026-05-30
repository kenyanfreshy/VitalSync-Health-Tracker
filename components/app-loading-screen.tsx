/**
 * VitalSync App Loading Screen
 *
 * Shown during the async startup phase — while HealthProvider is loading
 * persisted data from AsyncStorage and AuthProvider is reading auth config.
 * Prevents the brief flash of empty vital cards on first render.
 *
 * Design: matches the app's deep gunmetal (#0D1117) splash screen so the
 * transition from the native splash screen to this component is seamless.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Props {
  /** Optional message shown below the spinner (defaults to "Loading your health data…") */
  message?: string;
}

export function AppLoadingScreen({ message = 'Loading your health data…' }: Props) {
  // Subtle pulse animation on the logo mark
  const pulse = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={styles.root}>
      {/* Animated logo mark */}
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: pulse }] }]}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            {/* Pulse line rendered with Views */}
            <View style={styles.pulseLine}>
              <View style={styles.pulseFlat} />
              <View style={styles.pulseUp} />
              <View style={styles.pulseDown} />
              <View style={styles.pulseFlat} />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* App name */}
      <Text style={styles.appName}>VitalSync</Text>
      <Text style={styles.tagline}>Personal Health Hub</Text>

      {/* Loading indicator */}
      <View style={styles.dotsRow}>
        <LoadingDot delay={0} />
        <LoadingDot delay={200} />
        <LoadingDot delay={400} />
      </View>

      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

/** Single animated dot for the loading indicator */
function LoadingDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D1117',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  logoWrap: {
    marginBottom: 24,
  },
  logoOuter: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft glow
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  logoInner: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseLine: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 2,
  },
  pulseFlat: {
    width: 10,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  pulseUp: {
    width: 3,
    height: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    transform: [{ skewX: '-10deg' }],
  },
  pulseDown: {
    width: 3,
    height: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    transform: [{ skewX: '10deg' }],
    marginTop: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: '#22C55E',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  message: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 19,
  },
});
