/**
 * patch_hr_aggregation_window.mjs
 *
 * Extends hr-aggregation.ts to support 1h and daily window sizes
 * in addition to the existing 4h default.
 */
import { readFileSync, writeFileSync } from 'fs';

const path = '/home/ubuntu/VitalSync-App/lib/health/hr-aggregation.ts';
let src = readFileSync(path, 'utf8');

// Add HrWindowSize import at top
src = src.replace(
  `import type { PulseRecord } from './types';`,
  `import type { PulseRecord } from './types';
import type { HrWindowSize } from './hr-window-pref';`
);

// Replace BLOCK_MS and BLOCKS_PER_DAY constants with a window-aware helper
src = src.replace(
  `/** 4-hour block size in milliseconds */
const BLOCK_MS = 4 * 60 * 60 * 1000;
/** Number of 4-hour blocks per day */
const BLOCKS_PER_DAY = 6;`,
  `/** Window size → block duration in milliseconds */
const WINDOW_MS: Record<HrWindowSize, number> = {
  '1h':    1 * 60 * 60 * 1000,
  '4h':    4 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
};
/** Default block size (4-hour) */
const BLOCK_MS = WINDOW_MS['4h'];
/** Number of 4-hour blocks per day */
const BLOCKS_PER_DAY = 6;`
);

// Find the main export function signature and add optional window param
src = src.replace(
  `export function aggregateHrTo4HourBuckets(records: PulseRecord[]): HrBucket[] {`,
  `export function aggregateHrTo4HourBuckets(records: PulseRecord[], window: HrWindowSize = '4h'): HrBucket[] {`
);

// Replace BLOCK_MS usage inside the function with dynamic blockMs
src = src.replace(
  `export function aggregateHrTo4HourBuckets(records: PulseRecord[], window: HrWindowSize = '4h'): HrBucket[] {`,
  `export function aggregateHrTo4HourBuckets(records: PulseRecord[], window: HrWindowSize = '4h'): HrBucket[] {
  const blockMs = WINDOW_MS[window];`
);

// Replace all internal uses of BLOCK_MS with blockMs (only inside the function body)
// We do a targeted replacement of the floor calculation
src = src.replace(
  `    const blockStart = Math.floor(ts / BLOCK_MS) * BLOCK_MS;
    const blockEnd = blockStart + BLOCK_MS;`,
  `    const blockStart = Math.floor(ts / blockMs) * blockMs;
    const blockEnd = blockStart + blockMs;`
);

writeFileSync(path, src, 'utf8');
console.log('hr-aggregation.ts patched with window support');
