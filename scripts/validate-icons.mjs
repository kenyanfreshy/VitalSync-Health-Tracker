#!/usr/bin/env node
/**
 * validate-icons.mjs — Pre-build icon safety gate
 *
 * Runs automatically before every `expo prebuild` (via the "prebuild" npm hook).
 * Also available as a standalone command: `pnpm validate:icons`
 *
 * Checks performed:
 *
 *  1. ICON_MAPPING values vs MaterialIcons.glyphMap
 *     Every value in ICON_MAPPING must be a valid MaterialIcons glyph name.
 *     An invalid name throws on native during the initial tab bar render,
 *     causing an immediate crash-on-launch.
 *
 *  2. Hardcoded <IconSymbol name="..."> literals vs ICON_MAPPING
 *     Scans all .tsx/.ts source files for literal IconSymbol name props and
 *     verifies each one exists in ICON_MAPPING.
 *
 *  3. Direct icon-set imports (non-IconSymbol usage)
 *     Warns if any file outside icon-symbol.tsx imports MaterialIcons,
 *     MaterialCommunityIcons, Ionicons, Feather, etc. directly — those glyph
 *     names bypass the CI test and the runtime fallback guard.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed (build should be aborted)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect all .tsx / .ts files under a directory. */
function collectFiles(dir, exts = ['.tsx', '.ts']) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectFiles(full, exts));
    } else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

let failed = false;
function fail(msg) {
  console.error(`\n❌ ${msg}`);
  failed = true;
}
function pass(msg) {
  console.log(`✅ ${msg}`);
}
function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

// ─── Load artefacts ───────────────────────────────────────────────────────────

const glyphMap = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json');

// Parse ICON_MAPPING from the TS source via regex (avoids TS compilation)
const iconMappingSrc = readFileSync(join(ROOT, 'components/ui/icon-mapping.ts'), 'utf8');
const iconMappingEntries = [...iconMappingSrc.matchAll(/"([^"]+)":\s*"([^"]+)"/g)]
  .map(m => [m[1], m[2]])
  .filter(([k]) => k !== 'FALLBACK_ICON');
const iconMappingKeys = new Set(iconMappingEntries.map(([k]) => k));

const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks'].map(d => join(ROOT, d));
const allFiles = SOURCE_DIRS.flatMap(d => collectFiles(d));

// ─── Check 1: ICON_MAPPING values vs MaterialIcons.glyphMap ──────────────────

console.log('\n── Check 1: ICON_MAPPING values vs MaterialIcons.glyphMap ──────────────');
const invalidGlyphs = iconMappingEntries.filter(([, v]) => !(v in glyphMap));
if (invalidGlyphs.length === 0) {
  pass(`All ${iconMappingEntries.length} ICON_MAPPING values are valid MaterialIcons glyph names.`);
} else {
  const detail = invalidGlyphs.map(([k, v]) => `  "${k}": "${v}"  ← NOT in MaterialIcons`).join('\n');
  fail(
    `${invalidGlyphs.length} ICON_MAPPING value(s) are not valid MaterialIcons glyph names:\n\n${detail}\n\n` +
    `  Find valid names at: https://icons.expo.fyi/Index?iconSet=material`
  );
}

// ─── Check 2: Hardcoded <IconSymbol name="..."> literals vs ICON_MAPPING ─────

console.log('\n── Check 2: Hardcoded <IconSymbol name="..."> literals ─────────────────');
const literalRe = /<IconSymbol[^>]*\bname="([^"]+)"/g;
const missingLiterals = [];
for (const file of allFiles) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = literalRe.exec(src)) !== null) {
    const name = m[1];
    if (!iconMappingKeys.has(name)) {
      missingLiterals.push({ name, file: relative(ROOT, file) });
    }
  }
}
if (missingLiterals.length === 0) {
  pass('All hardcoded <IconSymbol name="..."> literals are present in ICON_MAPPING.');
} else {
  const detail = missingLiterals.map(({ name, file }) => `  "${name}" — ${file}`).join('\n');
  fail(
    `${missingLiterals.length} hardcoded SF Symbol name(s) are missing from ICON_MAPPING:\n\n${detail}\n\n` +
    `  Add the missing entries to components/ui/icon-mapping.ts`
  );
}

// ─── Check 3: Direct icon-set imports outside icon-symbol.tsx ────────────────

console.log('\n── Check 3: Direct icon-set imports (bypass audit) ─────────────────────');
const ICON_SET_PATTERN = /from\s+["']@expo\/vector-icons\/(MaterialIcons|MaterialCommunityIcons|Ionicons|FontAwesome|FontAwesome5|AntDesign|Feather|Entypo|EvilIcons|Foundation|Octicons|SimpleLineIcons|Zocial)["']/;
const ALLOWED_DIRECT_IMPORT_FILES = new Set([
  join(ROOT, 'components/ui/icon-symbol.tsx'),
]);
const directImportViolations = [];
for (const file of allFiles) {
  if (ALLOWED_DIRECT_IMPORT_FILES.has(file)) continue;
  const src = readFileSync(file, 'utf8');
  const m = src.match(ICON_SET_PATTERN);
  if (m) {
    directImportViolations.push({ file: relative(ROOT, file), iconSet: m[1] });
  }
}
if (directImportViolations.length === 0) {
  pass('No direct icon-set imports found outside icon-symbol.tsx.');
} else {
  const detail = directImportViolations.map(({ file, iconSet }) => `  ${file}  (imports ${iconSet})`).join('\n');
  warn(
    `${directImportViolations.length} file(s) import icon sets directly, bypassing the IconSymbol fallback guard:\n\n${detail}\n\n` +
    `  These glyph names are NOT validated by the CI test. Use <IconSymbol> instead, or add\n` +
    `  the file to ALLOWED_DIRECT_IMPORT_FILES in scripts/validate-icons.mjs if intentional.`
  );
  // This is a warning, not a hard failure — direct imports are valid in some cases
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(72));
if (failed) {
  console.error('\n🚫 Icon validation FAILED — fix the errors above before building.\n');
  process.exit(1);
} else {
  console.log('\n🎉 Icon validation passed — safe to proceed with expo prebuild.\n');
  process.exit(0);
}
