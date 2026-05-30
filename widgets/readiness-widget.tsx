/**
 * VitalSync Readiness Widget
 *
 * iOS Home Screen widget that shows the Daily Readiness Score.
 * Supports three sizes: systemSmall, systemMedium, systemLarge.
 *
 * ─── ACTIVATION INSTRUCTIONS ──────────────────────────────────────────────
 * This widget is scaffolded and ready to activate. To enable it:
 *
 * 1. Upgrade the project to Expo SDK 55:
 *    pnpm add expo@^55.0.0 && npx expo install --fix
 *
 * 2. Install expo-widgets:
 *    npx expo install expo-widgets
 *
 * 3. Add the plugin to app.config.ts plugins array:
 *    [
 *      "expo-widgets",
 *      {
 *        "bundleIdentifier": "com.myvitalsyncclinicalhub.vitalsync.ReadinessWidget",
 *        "groupIdentifier": "group.com.myvitalsyncclinicalhub.vitalsync",
 *        "widgets": [{ "name": "ReadinessWidget", "file": "./widgets/readiness-widget" }]
 *      }
 *    ]
 *
 * 4. Update the widget snapshot after each sync in index.tsx:
 *    import ReadinessWidget from '@/widgets/readiness-widget';
 *    ReadinessWidget.updateSnapshot({ score: readiness.total, trend: readinessTrend ?? 'stable' });
 *
 * 5. Build with EAS:
 *    eas build --platform ios --profile preview
 *
 * ─── CURRENT STATUS ───────────────────────────────────────────────────────
 * SDK 54 (current): expo-widgets is not available — this file is inert.
 * SDK 55+ (target):  uncomment the import and activate the plugin above.
 * ──────────────────────────────────────────────────────────────────────────
 */

// ─── Uncomment when expo-widgets is installed (SDK 55+) ───────────────────
// import { Text, VStack, HStack, Spacer } from '@expo/ui/swift-ui';
// import { font, foregroundStyle, padding, background } from '@expo/ui/swift-ui/modifiers';
// import { createWidget, WidgetBase } from 'expo-widgets';

// ─── Widget data shape ─────────────────────────────────────────────────────
export interface ReadinessWidgetProps {
  /** 0–100 readiness score */
  score: number;
  /** 7-day trend direction */
  trend: 'improving' | 'stable' | 'declining';
  /** ISO date string of last update */
  updatedAt?: string;
}

// ─── Color helpers ─────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return '#10B981'; // Emerald — Optimal
  if (score >= 60) return '#3B82F6'; // Blue — Good
  if (score >= 40) return '#F59E0B'; // Amber — Fair
  return '#EF4444';                  // Red — Low
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Optimal';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Low';
}

function trendSymbol(trend: ReadinessWidgetProps['trend']): string {
  if (trend === 'improving') return '↑';
  if (trend === 'declining') return '↓';
  return '→';
}

// ─── Widget component (activate on SDK 55+) ───────────────────────────────
/*
const ReadinessWidgetComponent = (props: WidgetBase<ReadinessWidgetProps>) => {
  'widget';

  const color = scoreColor(props.score);
  const label = scoreLabel(props.score);
  const symbol = trendSymbol(props.trend);

  if (props.family === 'systemSmall') {
    return (
      <VStack modifiers={[padding({ all: 16 }), background('#111318')]}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('rgba(255,255,255,0.5)')]}>
          READINESS
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 48, weight: 'bold' }), foregroundStyle(color)]}>
          {props.score}
        </Text>
        <HStack>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(color)]}>
            {label}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(color)]}>
            {symbol}
          </Text>
        </HStack>
      </VStack>
    );
  }

  if (props.family === 'systemMedium') {
    return (
      <HStack modifiers={[padding({ all: 16 }), background('#111318')]}>
        <VStack>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('rgba(255,255,255,0.5)')]}>
            DAILY READINESS
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 56, weight: 'bold' }), foregroundStyle(color)]}>
            {props.score}
          </Text>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(color)]}>
            {label} {symbol}
          </Text>
        </VStack>
        <Spacer />
        <VStack>
          <Text modifiers={[font({ size: 11 }), foregroundStyle('rgba(255,255,255,0.4)')]}>
            /100
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 11 }), foregroundStyle('rgba(255,255,255,0.3)')]}>
            VitalSync
          </Text>
        </VStack>
      </HStack>
    );
  }

  // systemLarge
  return (
    <VStack modifiers={[padding({ all: 16 }), background('#111318')]}>
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('rgba(255,255,255,0.5)')]}>
        DAILY READINESS SCORE
      </Text>
      <Spacer />
      <HStack>
        <Text modifiers={[font({ size: 72, weight: 'bold' }), foregroundStyle(color)]}>
          {props.score}
        </Text>
        <Text modifiers={[font({ size: 20 }), foregroundStyle('rgba(255,255,255,0.3)')]}>
          /100
        </Text>
      </HStack>
      <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(color)]}>
        {label} {symbol}
      </Text>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle('rgba(255,255,255,0.3)')]}>
        VitalSync Personal Health Hub
      </Text>
    </VStack>
  );
};

export default createWidget('ReadinessWidget', ReadinessWidgetComponent);
*/

// ─── Stub export for SDK 54 compatibility ─────────────────────────────────
// Replace with the real export above once expo-widgets is installed.
export const ReadinessWidgetStub = {
  updateSnapshot: (_props: ReadinessWidgetProps) => {
    // No-op on SDK 54 — widget not yet active
  },
};

export default ReadinessWidgetStub;
