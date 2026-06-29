import { readFileSync } from 'fs';

const files = [
  'app/(tabs)/analytics.tsx',
  'app/(tabs)/report.tsx',
  'app/detail/ekg.tsx',
  'components/correlation-trend-chart.tsx',
  'components/dashboard/pattern-explorer.tsx',
  'components/dashboard/wellness-summary.tsx',
  'components/smart-nutrition-card.tsx',
  'components/meal-iq-sheet.tsx',
  'components/dashboard/insight-engine.tsx',
  'components/ai-food-camera-sheet.tsx',
  'components/ai-wellness-insight-card.tsx',
  'components/projected-a1c-card.tsx',
];

let allOk = true;
for (const f of files) {
  try {
    const content = readFileSync(f, 'utf8');
    const hasImport = content.includes("import { TransparencyCard }");
    const hasUsage = content.includes('<TransparencyCard');
    if (hasUsage && !hasImport) {
      console.log('MISSING IMPORT: ' + f);
      allOk = false;
    } else if (!hasUsage) {
      console.log('NO USAGE: ' + f);
    } else {
      // Count variants used
      const variants = [...content.matchAll(/variant="([^"]+)"/g)].map(m => m[1]);
      console.log('OK: ' + f + ' [variants: ' + variants.join(', ') + ']');
    }
  } catch (e) {
    console.log('ERROR: ' + f + ' - ' + e.message);
    allOk = false;
  }
}
console.log(allOk ? '\nAll checks passed.' : '\nSome checks FAILED.');
