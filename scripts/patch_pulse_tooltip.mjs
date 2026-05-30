/**
 * patch_pulse_tooltip.mjs
 *
 * 1. Adds `onPointPress` + `selectedIndex` props to LineChart (line-chart.tsx)
 *    — wraps each dot in a touchable Rect hit-area using SVG Rect + onPress
 * 2. Adds bucket tooltip overlay in pulse.tsx BPM chart card
 *    — shows "4 PM–8 PM · avg 72 · min 65 · max 88 · 14 samples" on tap
 */
import { readFileSync, writeFileSync } from 'fs';

// ─── 1. Patch line-chart.tsx ────────────────────────────────────────────────
const lcPath = '/home/ubuntu/VitalSync-App/components/charts/line-chart.tsx';
let lc = readFileSync(lcPath, 'utf8');

// Add Rect to SVG imports
lc = lc.replace(
  `import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';`,
  `import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';`
);

// Add onPointPress and selectedIndex to LineChartProps
lc = lc.replace(
  `  padding?: number;\n}`,
  `  padding?: number;
  /** Called with the index of the tapped data point */
  onPointPress?: (index: number) => void;
  /** Index of the currently selected point (shows highlight ring) */
  selectedIndex?: number;
}`
);

// Add onPointPress and selectedIndex to destructured props
lc = lc.replace(
  `  padding = 8,\n}: LineChartProps)`,
  `  padding = 8,
  onPointPress,
  selectedIndex,
}: LineChartProps)`
);

// Replace the Dots section with interactive hit-area dots
lc = lc.replace(
  `        {/* Dots */}
        {showDots && data.map((p, i) => {
          const cx = padding + p.x * (width - padding * 2);
          const cy = height - padding - p.y * (height - padding * 2);
          return (
            <Circle key={i} cx={cx} cy={cy} r={3} fill={color} />
          );
        })}`,
  `        {/* Dots + touch hit areas */}
        {data.map((p, i) => {
          const cx = padding + p.x * (width - padding * 2);
          const cy = height - padding - p.y * (height - padding * 2);
          const isSelected = selectedIndex === i;
          return (
            <React.Fragment key={i}>
              {/* Invisible hit area (24×24) for easy tapping */}
              {onPointPress && (
                <Rect
                  x={cx - 12}
                  y={cy - 12}
                  width={24}
                  height={24}
                  fill="transparent"
                  onPress={() => onPointPress(i)}
                />
              )}
              {/* Visible dot — always shown when there are few points or a point is selected */}
              {(showDots || isSelected) && (
                <>
                  {isSelected && (
                    <Circle cx={cx} cy={cy} r={8} fill={color} opacity={0.18} />
                  )}
                  <Circle cx={cx} cy={cy} r={isSelected ? 5 : 3} fill={color} />
                </>
              )}
            </React.Fragment>
          );
        })}`
);

writeFileSync(lcPath, lc, 'utf8');
console.log('line-chart.tsx patched');

// ─── 2. Patch pulse.tsx ──────────────────────────────────────────────────────
const pPath = '/home/ubuntu/VitalSync-App/app/detail/pulse.tsx';
let p = readFileSync(pPath, 'utf8');

// Add Pressable to RN imports
p = p.replace(
  `import { ScrollView, StyleSheet, Text, View, Dimensions, useColorScheme, PanResponder } from 'react-native';`,
  `import { ScrollView, StyleSheet, Text, View, Dimensions, useColorScheme, PanResponder, Pressable } from 'react-native';`
);

// Add selectedBucketIndex state after the existing useState/useRef block
// Find the line: const bpmData = useMemo
p = p.replace(
  `  const bpmData = useMemo(() => normalizeData(records.map((r) => r.bpm)), [records]);`,
  `  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
  const bpmData = useMemo(() => normalizeData(records.map((r) => r.bpm)), [records]);`
);

// Build tooltip helper — add after bpmData line
p = p.replace(
  `  const bpmData = useMemo(() => normalizeData(records.map((r) => r.bpm)), [records]);`,
  `  const bpmData = useMemo(() => normalizeData(records.map((r) => r.bpm)), [records]);

  // ── Bucket tooltip helpers ──────────────────────────────────────────────
  /** Format ISO blockStart → "4 PM – 8 PM" */
  function formatBucketRange(blockStart: string, blockEnd: string): string {
    const fmt = (iso: string) => {
      const d = new Date(iso);
      const h = d.getHours();
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return \`\${h12} \${ampm}\`;
    };
    return \`\${fmt(blockStart)} – \${fmt(blockEnd)}\`;
  }
  const selectedBucket = selectedBucketIndex !== null
    ? (aggregatedHeartRate[selectedBucketIndex] ?? null)
    : null;`
);

// Replace the BPM Chart card to add tooltip overlay and onPointPress
const oldBpmChart = `          <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.hrChart}</Text>
          <LineChart
            data={bpmData}
            width={CHART_WIDTH - 32}
            height={140}
            color={colors.heartRed}
            strokeWidth={2}
            showGradient
          />`;

const newBpmChart = `          <Text style={[styles.chartTitle, { color: colors.foreground }]}>{d.hrChart}</Text>
          {/* Bucket tooltip */}
          {selectedBucket ? (
            <Pressable
              onPress={() => setSelectedBucketIndex(null)}
              style={{
                marginBottom: 8,
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.heartRed + '40',
                paddingVertical: 8,
                paddingHorizontal: 12,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heartRed }}>
                {formatBucketRange(selectedBucket.blockStart, selectedBucket.blockEnd)}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                avg {selectedBucket.avgBpm} bpm
              </Text>
              <Text style={{ fontSize: 12, color: colors.bpGreen }}>
                min {selectedBucket.minBpm}
              </Text>
              <Text style={{ fontSize: 12, color: colors.bpAmber }}>
                max {selectedBucket.maxBpm}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {selectedBucket.sampleCount} sample{selectedBucket.sampleCount !== 1 ? 's' : ''}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>tap to dismiss</Text>
            </Pressable>
          ) : (
            records.length > 0 && (
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
                Tap a data point for bucket details
              </Text>
            )
          )}
          <LineChart
            data={bpmData}
            width={CHART_WIDTH - 32}
            height={140}
            color={colors.heartRed}
            strokeWidth={2}
            showGradient
            showDots={records.length <= 12}
            selectedIndex={selectedBucketIndex ?? undefined}
            onPointPress={(i) => setSelectedBucketIndex(i === selectedBucketIndex ? null : i)}
          />`;

p = p.replace(oldBpmChart, newBpmChart);

writeFileSync(pPath, p, 'utf8');
console.log('pulse.tsx patched');
console.log('Done');
