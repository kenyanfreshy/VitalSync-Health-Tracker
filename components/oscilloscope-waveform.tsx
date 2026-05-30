/**
 * OscilloscopeWaveform
 *
 * A digital oscilloscope / logarithmic waveform animation that plays while
 * the Clinical Input system is "calculating" the impact of a bio-mass entry.
 *
 * Visual anatomy:
 *  - Dark (#0A0F0A) oscilloscope canvas with a phosphor-green (#00FF41) glow
 *  - An animated sine wave that morphs into a logarithmic spike at the peak
 *  - A horizontal baseline (zero line) with tick marks
 *  - A scrolling "scan line" that sweeps left-to-right like a real oscilloscope
 *  - Status text below: "CALCULATING..." / "ANALYSIS_COMPLETE"
 *
 * Usage:
 *   <OscilloscopeWaveform active={isCalculating} label="METABOLIC_FLUX_CALIBRATION" />
 */

import { Easing } from 'react-native-reanimated';
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Pressable } from 'react-native';
import Svg, { Path, Line, Rect, Text as SvgText } from 'react-native-svg';

// ─── Constants ────────────────────────────────────────────────────────────────

const W = 320;
const H = 72;
const BASELINE_Y = H / 2;
const PHOSPHOR_GREEN = '#00FF41';
const PHOSPHOR_DIM = '#00C832';
const CANVAS_BG = '#060D06';
const GRID_COLOR = '#0A2A0A';

// ─── Wave path generator ──────────────────────────────────────────────────────

function buildWavePath(phase: number, amplitude: number, logSpike: boolean): string {
  const steps = 120;
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * W;

    // Base sine wave
    let y = BASELINE_Y - Math.sin(t * Math.PI * 4 + phase) * amplitude;

    // Add a logarithmic spike at t ≈ 0.5 when logSpike is active
    if (logSpike) {
      const dist = Math.abs(t - 0.5);
      const spike = dist < 0.18
        ? (amplitude * 1.8) * Math.exp(-dist * dist * 120)
        : 0;
      y -= spike;
    }

    // Clamp to canvas
    y = Math.max(4, Math.min(H - 4, y));
    points.push({ x, y });
  }

  return points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(' ');
}

// ─── Grid lines ───────────────────────────────────────────────────────────────

function GridLines() {
  const vLines = [W * 0.25, W * 0.5, W * 0.75];
  const hLines = [H * 0.25, H * 0.5, H * 0.75];
  return (
    <>
      {vLines.map((x) => (
        <Line key={x} x1={x} y1={0} x2={x} y2={H} stroke={GRID_COLOR} strokeWidth={1} />
      ))}
      {hLines.map((y) => (
        <Line key={y} x1={0} y1={y} x2={W} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
      ))}
      {/* Baseline (zero line) */}
      <Line x1={0} y1={BASELINE_Y} x2={W} y2={BASELINE_Y} stroke="#0F3A0F" strokeWidth={1} strokeDasharray="4,4" />
      {/* Tick marks on baseline */}
      {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => (
        <Line key={t} x1={t * W} y1={BASELINE_Y - 3} x2={t * W} y2={BASELINE_Y + 3} stroke="#0F3A0F" strokeWidth={1} />
      ))}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Whether the waveform is actively animating (calculating state) */
  active: boolean;
  /** Label shown below the oscilloscope */
  label?: string;
  /** Whether to show the logarithmic spike (conflict/exercise calculation) */
  showLogSpike?: boolean;
  /** Whether to show the [REPLAY_ANALYSIS] button when inactive */
  showReplay?: boolean;
  /** Called when the user taps [REPLAY_ANALYSIS] */
  onReplay?: () => void;
}

export function OscilloscopeWaveform({
  active,
  label = 'CALCULATING...',
  showLogSpike = false,
  showReplay = false,
  onReplay,
}: Props) {
  const [replayActive, setReplayActive] = React.useState(false);

  const handleReplay = React.useCallback(() => {
    if (replayActive) return;
    if (Platform.OS !== 'web') {
      // Haptics imported at top
    }
    setReplayActive(true);
    onReplay?.();
    // Auto-stop replay after 2.5s
    setTimeout(() => setReplayActive(false), 2500);
  }, [replayActive, onReplay]);

  // Effective active state: either prop-driven or replay-driven
  const effectiveActive = active || replayActive;
  // Phase animation (scrolling wave)
  const _phaseAnim = useRef(new Animated.Value(0)).current;
  // Scan line position
  const scanAnim = useRef(new Animated.Value(0)).current;
  // Amplitude pulse
  const ampAnim = useRef(new Animated.Value(active ? 1 : 0.3)).current;
  // Blink for status text
  const blinkAnim = useRef(new Animated.Value(1)).current;

  // Derived state for SVG (we drive the SVG path via JS-side interpolation)
  const phaseRef = useRef(0);
  const [wavePath, setWavePath] = React.useState(() => buildWavePath(0, 14, false));
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (effectiveActive) {
      // Start phase scrolling
      let frame = 0;
      frameRef.current = setInterval(() => {
        frame += 1;
        phaseRef.current = (frame * 0.12) % (Math.PI * 2);
        const amp = 14 + Math.sin(frame * 0.05) * 6;
        setWavePath(buildWavePath(phaseRef.current, amp, showLogSpike || replayActive));
      }, 50);

      // Scan line sweep
      Animated.loop(
        Animated.timing(scanAnim, {
          toValue: W,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ).start();

      // Amplitude pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(ampAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
          Animated.timing(ampAnim, { toValue: 0.6, duration: 400, useNativeDriver: false }),
        ]),
      ).start();

      // Blink status text
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
        ]),
      ).start();
    } else {
      // Stop animations
      if (frameRef.current) clearInterval(frameRef.current);
      scanAnim.stopAnimation();
      ampAnim.stopAnimation();
      blinkAnim.stopAnimation();
      blinkAnim.setValue(1);
      // Show flat line
      setWavePath(buildWavePath(0, 4, false));
    }

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActive, showLogSpike, replayActive]);

  const scanX = scanAnim;

  return (
    <View style={styles.container}>
      {/* Oscilloscope canvas */}
      <View style={styles.canvas}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Canvas background */}
          <Rect x={0} y={0} width={W} height={H} fill={CANVAS_BG} rx={6} />

          {/* Grid */}
          <GridLines />

          {/* Wave path with glow effect (two passes: dim + bright) */}
          <Path d={wavePath} fill="none" stroke={PHOSPHOR_DIM} strokeWidth={3} opacity={0.3} />
          <Path d={wavePath} fill="none" stroke={PHOSPHOR_GREEN} strokeWidth={1.5} opacity={active ? 0.95 : 0.4} />

          {/* Scan line (animated vertical line) */}
          {effectiveActive && (
            <Animated.View
              style={[
                styles.scanLine,
                { left: scanX },
              ]}
            />
          )}

          {/* Corner labels */}
          <SvgText x={4} y={11} fontSize={7} fill={PHOSPHOR_DIM} opacity={0.6} fontFamily={Platform.OS === 'ios' ? 'Courier New' : 'monospace'}>
            CH1
          </SvgText>
          <SvgText x={W - 4} y={11} fontSize={7} fill={PHOSPHOR_DIM} opacity={0.6} textAnchor="end" fontFamily={Platform.OS === 'ios' ? 'Courier New' : 'monospace'}>
            LOG₁₀
          </SvgText>
          <SvgText x={4} y={H - 3} fontSize={7} fill={PHOSPHOR_DIM} opacity={0.6} fontFamily={Platform.OS === 'ios' ? 'Courier New' : 'monospace'}>
            0.0 mV
          </SvgText>
          <SvgText x={W - 4} y={H - 3} fontSize={7} fill={PHOSPHOR_DIM} opacity={0.6} textAnchor="end" fontFamily={Platform.OS === 'ios' ? 'Courier New' : 'monospace'}>
            2.3 kHz
          </SvgText>
        </Svg>
      </View>

      {/* Status row */}
      <View style={styles.statusRow}>
        {/* Blinking dot */}
        <Animated.View style={[styles.statusDot, { opacity: effectiveActive ? blinkAnim : 0.3, backgroundColor: effectiveActive ? PHOSPHOR_GREEN : '#334155' }]} />
        <Animated.Text
          style={[
            styles.statusText,
            {
              color: effectiveActive ? PHOSPHOR_GREEN : '#334155',
              opacity: effectiveActive ? blinkAnim : 0.5,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              flex: 1,
            },
          ]}
        >
          {replayActive ? 'REPLAYING_ANALYSIS...' : label}
        </Animated.Text>
        {/* Replay button — shown when inactive and showReplay is true */}
        {showReplay && !effectiveActive && (
          <Pressable
            style={(state) => [
              styles.replayBtn,
              { opacity: (state as { pressed: boolean }).pressed ? 0.6 : 1 },
            ]}
            onPress={handleReplay}
          >
            <Text style={[styles.replayText, { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' }]}>
              ↺ [REPLAY_ANALYSIS]
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: 6 },
  canvas: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0A2A0A',
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: H,
    backgroundColor: PHOSPHOR_GREEN,
    opacity: 0.4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  replayBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00FF4140',
    backgroundColor: '#00FF4108',
  },
  replayText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#00C832',
    letterSpacing: 0.5,
  },
});
