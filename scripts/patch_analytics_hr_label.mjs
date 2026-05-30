/**
 * patch_analytics_hr_label.mjs
 *
 * Updates analytics.tsx to:
 * 1. Destructure hrWindow from useHealth
 * 2. Import HR_WINDOW_SHORT from hr-window-pref
 * 3. Build a dynamic METRIC_LABELS override for heartRate based on hrWindow
 * 4. Use the override when rendering the HR axis label
 */
import { readFileSync, writeFileSync } from 'fs';

const path = '/home/ubuntu/VitalSync-App/app/(tabs)/analytics.tsx';
let src = readFileSync(path, 'utf8');

// 1. Add HR_WINDOW_SHORT import
src = src.replace(
  `import { useHealth } from '@/lib/health/health-context';`,
  `import { useHealth } from '@/lib/health/health-context';
import { HR_WINDOW_SHORT } from '@/lib/health/hr-window-pref';`
);

// 2. Destructure hrWindow from useHealth
src = src.replace(
  `  const { state } = useHealth();`,
  `  const { state, hrWindow } = useHealth();`
);

// 3. Add a dynamic metricLabel helper right after the hrWindow destructure
src = src.replace(
  `  const { state, hrWindow } = useHealth();`,
  `  const { state, hrWindow } = useHealth();
  /** Returns the display label for a metric, using the active HR window for heartRate */
  const getMetricLabel = (m: MetricKey): string => {
    if (m === 'heartRate') return \`Heart Rate (\${HR_WINDOW_SHORT[hrWindow]})\`;
    return METRIC_LABELS[m];
  };`
);

// 4. Replace all METRIC_LABELS[xMetric] / METRIC_LABELS[yMetric] / METRIC_LABELS[item]
// in the axis label and picker areas with getMetricLabel()
src = src.replace(
  /\{METRIC_LABELS\[xMetric\]\}/g,
  '{getMetricLabel(xMetric)}'
);
src = src.replace(
  /\{METRIC_LABELS\[yMetric\]\}/g,
  '{getMetricLabel(yMetric)}'
);
src = src.replace(
  /\{METRIC_LABELS\[item\]\}/g,
  '{getMetricLabel(item)}'
);
// The split(' ')[0] usage for chart title
src = src.replace(
  `{METRIC_LABELS[x].split(' ')[0]} vs {METRIC_LABELS[y].split(' ')[0]}`,
  `{getMetricLabel(x).split(' ')[0]} vs {getMetricLabel(y).split(' ')[0]}`
);

writeFileSync(path, src, 'utf8');
console.log('analytics.tsx patched');
console.log('Done');
