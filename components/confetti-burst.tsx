/**
 * ConfettiBurst — Lightweight confetti particle overlay.
 *
 * Renders 24 colored squares that fly outward from a given origin,
 * fade out over 1.2 s, then call onDone so the parent can unmount.
 *
 * Usage:
 *   {showConfetti && (
 *     <ConfettiBurst originX={cx} originY={cy} onDone={() => setShowConfetti(false)} />
 *   )}
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
 Easing } from 'react-native-reanimated';

const { width: _SW, height: _SH } = Dimensions.get('window');

const COLORS = [
  '#6366F1', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#EC4899', '#14B8A6', '#F97316',
  '#8B5CF6', '#22C55E', '#FBBF24', '#60A5FA',
];

const PARTICLE_COUNT = 24;
const DURATION = 1200;
const SIZE = 8;

interface Particle {
  id: number;
  color: string;
  angle: number;   // radians
  distance: number;
  delay: number;
  rotation: number;
}

function buildParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    angle: (i / PARTICLE_COUNT) * 2 * Math.PI + (Math.random() - 0.5) * 0.4,
    distance: 60 + Math.random() * 80,
    delay: Math.random() * 120,
    rotation: Math.random() * 360,
  }));
}

interface ParticleViewProps {
  particle: Particle;
  originX: number;
  originY: number;
  onDone?: () => void;
  isLast: boolean;
}

function ParticleView({ particle, originX, originY, onDone, isLast }: ParticleViewProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    const targetX = Math.cos(particle.angle) * particle.distance;
    const targetY = Math.sin(particle.angle) * particle.distance - 30; // slight upward bias

    const opts = {
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
    };

    tx.value = withDelay(particle.delay, withTiming(targetX, opts));
    ty.value = withDelay(particle.delay, withTiming(targetY, opts));
    rotate.value = withDelay(particle.delay, withTiming(particle.rotation, opts));
    opacity.value = withDelay(
      particle.delay + DURATION * 0.5,
      withTiming(0, { duration: DURATION * 0.5, easing: Easing.in(Easing.quad) },
        isLast ? (finished) => { if (finished && onDone) runOnJS(onDone)(); } : undefined
      )
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }), [tx, ty, rotate, opacity]);

  return (
    <Animated.View
      style={[
        styles.particle,
        { backgroundColor: particle.color, left: originX - SIZE / 2, top: originY - SIZE / 2 },
        style,
      ]}
    />
  );
}

interface ConfettiBurstProps {
  /** X coordinate of the burst origin (relative to the screen) */
  originX: number;
  /** Y coordinate of the burst origin (relative to the screen) */
  originY: number;
  /** Called after all particles have faded out */
  onDone: () => void;
}

export function ConfettiBurst({ originX, originY, onDone }: ConfettiBurstProps) {
  const particles = React.useMemo(buildParticles, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <ParticleView
          key={p.id}
          particle={p}
          originX={originX}
          originY={originY}
          isLast={i === particles.length - 1}
          onDone={onDone}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: 2,
  },
});
