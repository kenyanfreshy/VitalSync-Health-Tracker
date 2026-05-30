#!/usr/bin/env node
// check-expo-versions.mjs — SDK 54 version guard
// EAS appends --platform ios; strip it here.
process.argv = process.argv.slice(0, 2);

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();

const EXPECTED_VERSIONS = {
  "expo": "~54.0.29",
  "expo-router": "~6.0.19",
  "expo-asset": "~12.0.12",
  "expo-audio": "~1.1.0",
  "expo-video": "~3.0.15",
  "expo-constants": "~18.0.12",
  "expo-font": "~14.0.10",
  "expo-haptics": "~15.0.8",
  "expo-image": "~3.0.11",
  "expo-keep-awake": "~15.0.8",
  "expo-linear-gradient": "~15.0.8",
  "expo-linking": "~8.0.10",
  "expo-secure-store": "~15.0.8",
  "expo-splash-screen": "~31.0.12",
  "expo-status-bar": "~3.0.9",
  "expo-symbols": "~1.0.8",
  "expo-system-ui": "~6.0.9",
  "expo-web-browser": "~15.0.10",
  "expo-background-fetch": "~14.0.9",
  "expo-build-properties": "~1.0.10",
  "expo-file-system": "~19.0.21",
  "expo-local-authentication": "~17.0.8",
  "expo-notifications": "~0.32.15",
  "expo-print": "~15.0.8",
  "expo-sharing": "~14.0.8",
  "expo-task-manager": "~14.0.9",
  "react-native": "0.81.5",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-reanimated": "~4.1.6",
  "react-native-safe-area-context": "~5.6.2",
  "react-native-screens": "~4.16.0",
  "react-native-svg": "15.12.1",
  "react-native-web": "~0.21.2",
  "react-native-worklets": "0.5.1",
};

function getVer(pkg) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "node_modules", pkg, "package.json"), "utf8")).version;
  } catch { return null; }
}

function matches(v, r) {
  const c = r.replace(/^[~^]/, "");
  const [eM, em] = c.split(".").map(Number);
  const [iM, im] = v.split(".").map(Number);
  if (r.startsWith("~")) return iM === eM && im === em;
  if (r.startsWith("^")) return iM === eM;
  return v === c;
}

let failed = false;
const results = [];
for (const [pkg, range] of Object.entries(EXPECTED_VERSIONS)) {
  const v = getVer(pkg);
  if (!v) { results.push({ pkg, status: "MISSING", v: "—", range }); failed = true; continue; }
  const ok = matches(v, range);
  results.push({ pkg, status: ok ? "OK" : "MISMATCH", v, range });
  if (!ok) failed = true;
}

const bad = results.filter(r => r.status !== "OK");
console.log(`\n📦 Expo SDK 54 Version Guard — ${results.length - bad.length}/${results.length} OK\n`);

if (bad.length) {
  console.error("❌ Mismatches:\n");
  for (const { pkg, status, v, range } of bad)
    console.error(`  ${status.padEnd(8)} ${pkg}\n           installed: ${v}  expected: ${range}\n`);
  console.error("Run 'npx expo install --check' to fix.\n");
  process.exit(1);
}
console.log("✅ All packages match SDK 54 expected ranges.\n");
