#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const modules = [
  'expo-clipboard',
  'expo-file-system',
  'expo-haptics',
  'expo-image',
  'expo-linear-gradient',
  'expo-location',
  'expo-print',
  'expo-secure-store',
  'expo-sharing',
  'expo-task-manager',
  'expo-updates',
  'expo-web-browser',
  'expo-keep-awake',
  'expo-constants',
  'expo-font',
  'expo-linking',
  'expo-status-bar',
  'expo-symbols',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-safe-area-context',
  'react-native-svg',
  '@react-native-async-storage/async-storage',
  '@react-native-community/datetimepicker',
];

const registered = new Set([
  'expo-router',
  '@react-native-community/datetimepicker',
  'expo-localization',
  'expo-notifications',
  'expo-background-fetch',
  'expo-local-authentication',
  'expo-image-picker',
  'expo-audio',
  'expo-video',
  'expo-splash-screen',
  '@kingstinct/react-native-healthkit',
  'expo-build-properties',
  '@sentry/react-native',
]);

console.log('\n=== Expo Plugin Audit ===\n');
const missing = [];
for (const m of modules) {
  const pkgPath = join('node_modules', m, 'package.json');
  if (!existsSync(pkgPath)) {
    console.log(`  NOT INSTALLED: ${m}`);
    continue;
  }
  const hasAppPlugin = existsSync(join('node_modules', m, 'app.plugin.js'));
  if (hasAppPlugin) {
    const isRegistered = registered.has(m);
    if (!isRegistered) {
      missing.push(m);
      console.log(`  ⚠️  HAS PLUGIN BUT NOT REGISTERED: ${m}`);
    } else {
      console.log(`  ✅ registered: ${m}`);
    }
  } else {
    console.log(`  — no plugin needed: ${m}`);
  }
}

if (missing.length === 0) {
  console.log('\n✅ All modules with plugins are registered in app.config.ts\n');
} else {
  console.log(`\n❌ ${missing.length} module(s) with plugins are NOT registered:\n`);
  for (const m of missing) console.log(`   - ${m}`);
  console.log('');
  process.exit(1);
}
