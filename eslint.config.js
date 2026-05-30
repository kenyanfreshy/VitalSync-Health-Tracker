// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import noUnimportedStringsHooks from "./eslint-rules/no-unimported-strings-hooks.js";

/**
 * ─── AsyncStorage Write Guard ────────────────────────────────────────────────
 *
 * All AsyncStorage writes MUST go through `safeSetItem` / `safeMultiSet`
 * from `@/lib/safe-async-storage`.  These wrappers:
 *   • Enforce a 4 MB per-key hard limit (prevents SIGSEGV in Hermes/TurboModule)
 *   • Emit size telemetry to the crash logger for keys > 500 KB
 *   • Fire a push notification warning for keys > 3 MB
 *
 * References:
 *   VitalSync crash reports: VitalSync-2026-04-26-214129.ips
 *                            VitalSync-2026-04-26-235918.ips
 *   Root cause: NSException from oversized write reaches Hermes heap from
 *               background GCD thread while HadesGC is concurrently compacting.
 */
const asyncStorageWriteGuard = {
  rules: {
    "no-restricted-syntax": [
      "error",
      // ── AsyncStorage.setItem(...) ─────────────────────────────────────────
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.object.name='AsyncStorage'][callee.property.name='setItem']",
        message:
          "Do not call AsyncStorage.setItem() directly. " +
          "Use safeSetItem() from '@/lib/safe-async-storage' instead. " +
          "Direct writes bypass the 4 MB size guard and can cause SIGSEGV in Hermes.",
      },
      // ── AsyncStorage.multiSet(...) ────────────────────────────────────────
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.object.name='AsyncStorage'][callee.property.name='multiSet']",
        message:
          "Do not call AsyncStorage.multiSet() directly. " +
          "Use safeMultiSet() from '@/lib/safe-async-storage' instead. " +
          "Direct writes bypass the 4 MB size guard and can cause SIGSEGV in Hermes.",
      },
    ],
  },
};

/**
 * ─── Unused Variables Convention ─────────────────────────────────────────────
 *
 * Variables prefixed with `_` are intentionally unused (TypeScript convention).
 * This is standard for catch bindings, destructuring, and unused params.
 * Examples: `catch (_err)`, `const [_state, setState]`, `(_unused) => ...`
 */
const unusedVarsConfig = {
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
  },
};

/**
 * ─── Strings-Hook Import Guard ────────────────────────────────────────────────
 *
 * Flags any call to a `useXxxStrings()` hook whose name is NOT present in an
 * import from '@/hooks' in the same file.
 *
 * Motivation: VitalSync crash report v2.9.22 — five files called
 * useCorrelationStrings() / useRecordsStrings() without importing them,
 * causing a ReferenceError at render time on device.
 *
 * Hooks covered (pattern: /^use[A-Z][a-zA-Z]*Strings$/):
 *   useDashboardStrings, useCorrelationStrings, useRecordsStrings,
 *   useReportStrings, useDictationBoxStrings, useLogAllVitalsStrings,
 *   useFoodCameraStrings — and any future useXxxStrings hooks.
 */
const stringsHooksPlugin = {
  rules: { "no-unimported-strings-hooks": noUnimportedStringsHooks },
};

const stringsHooksGuard = {
  plugins: { vitalsync: stringsHooksPlugin },
  rules: {
    "vitalsync/no-unimported-strings-hooks": "error",
  },
};

export default defineConfig([
  expoConfig,
  asyncStorageWriteGuard,
  unusedVarsConfig,
  stringsHooksGuard,
  {
    // The implementation file itself is allowed to call the raw AsyncStorage
    // methods — it IS the safe wrapper.  All other files must use safeSetItem.
    files: ["lib/safe-async-storage.ts", "lib/health/first-sync-tracker.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    // Hook definition files are allowed to export the hook without importing it
    files: ["hooks/use-*-strings.ts", "hooks/use-*-strings.tsx"],
    rules: {
      "vitalsync/no-unimported-strings-hooks": "off",
    },
  },
  {
    ignores: ["dist/*", "eslint-rules/*"],
  },
]);
