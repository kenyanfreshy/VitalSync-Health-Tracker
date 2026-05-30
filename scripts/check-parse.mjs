import { parse } from '@babel/parser';
import { readFileSync } from 'fs';

const files = [
  'lib/health/health-context.tsx',
  'lib/health/permissions.ts',
  'lib/health/healthkit-background-delivery.ts',
  'lib/health/native-health-service.ts',
  'lib/health/healthkit-write.ts',
  'app/(tabs)/settings.tsx',
  'app/_layout.tsx',
];

let hasError = false;
for (const f of files) {
  try {
    parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    console.log('OK:', f);
  } catch (e) {
    console.log('ERROR', f, 'line', e.loc?.line, ':', e.message);
    hasError = true;
  }
}
process.exit(hasError ? 1 : 0);
