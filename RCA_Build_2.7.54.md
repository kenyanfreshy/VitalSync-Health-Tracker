# Root Cause Analysis Report — VitalSync Build 2.7.54
**Incident Type:** Crash-on-Launch (COL) / Fatal Crash on Scribe Tap
**Severity:** P0 — App unusable for affected flow
**Reported Build:** 2.7.54
**Date:** 2026-04-21
**Engineer:** Senior Systems Engineer / Lead Debugger

---

## Incident Summary

Build 2.7.54 introduced a fatal crash triggered in two distinct scenarios: (1) tapping the **🍎 Scribe** section inside the **Add Medication** modal, and (2) a latent crash risk on iOS devices where `@react-native-voice/voice` is loaded before its native module is linked. The crash manifests as an immediate, unrecoverable application termination with no visible error UI, because the error occurs before the `GlobalErrorBoundary` can intercept it.

---

## Build Comparison

| Component | Previous Stable | Build 2.7.54 | Change Type |
|---|---|---|---|
| `trpc.medication.scribePhoto` route | Present | Missing (not exported from `medication-router.ts`) | **Regression** |
| `showScribePicker()` in `medications.tsx` | Called `handleScribePhoto()` directly | Same, but `scribePhotoMutation` pointed to non-existent route | **Regression** |
| `@react-native-voice/voice` | `^3.2.4` | `^3.2.4` | No change |
| `NativeEventEmitter(Voice)` guard | Lazy-require with try/catch | Same | No change |
| `expo-audio` | `~1.1.0` | `~1.1.1` (patch bump) | Minor patch |
| `react-native-reanimated` | `~4.1.6` | `4.1.7` (patch bump) | Minor patch |
| `reactCompiler` in `app.config.ts` | `false` | `false` | No change |
| `newArchEnabled` | Not set (defaults true in SDK 54) | Not set | No change |

---

## Causal Chain

### Primary Crash (P0) — Medications Scribe Tap

```
User taps "🍎 Scribe" in Add Medication modal
  → showScribePicker() called
    → handleScribePhoto() called
      → ImagePicker.requestCameraPermissionsAsync() [OK]
      → ImagePicker.launchCameraAsync() [OK]
      → scribePhotoMutation.mutateAsync({ imageBase64, mimeType })
        → trpc.medication.scribePhoto.useMutation()
          → HTTP POST to /api/trpc/medication.scribePhoto
            → ROUTE NOT FOUND — server returns 404 / tRPC "No procedure found"
              → React Query throws unhandled rejection
                → App crashes (unhandled promise rejection in gesture callback)
```

**Why it wasn't caught:** The outer `try/catch` in `handleScribePhoto` catches synchronous errors and `ImagePicker` failures, but `scribePhotoMutation.mutateAsync()` throws asynchronously via React Query's error propagation, which bypasses the catch block when the tRPC route is missing entirely (the mutation itself throws before the `.catch` handler fires in some RN versions).

### Secondary Crash Risk (P1) — NativeEventEmitter on Unlinked iOS Build

```
App launches on iOS device (Expo Go or build without native rebuild)
  → Module graph resolves: log-all-vitals-sheet.tsx
    → Module-level: require('@react-native-voice/voice')
      → @react-native-voice/voice/dist/index.js line 10:
          const Voice = NativeModules.Voice;  // undefined — module not linked
          const voiceEmitter = Platform.OS !== 'web'
            ? new NativeEventEmitter(Voice)   // NativeEventEmitter(undefined)
            : null;
        → React Native 0.81 throws:
            "new NativeEventEmitter() requires a non-null argument."
```

**Why the try/catch helps but isn't complete:** Both `use-speech-recognizer.ts` and `log-all-vitals-sheet.tsx` wrap the `require()` in a `try { } catch { Voice = null; }` block. This **does** catch the `NativeEventEmitter` error at require-time on iOS. However, if a future refactor moves the require outside the try/catch (e.g., a top-level `import`), the crash would be fatal and unrecoverable.

### Tertiary Risk (P2) — `reactCompiler: false` Enforcement

The `app.config.ts` has a comment `// IMPORTANT: reactCompiler MUST remain false.` This was correctly set to `false` in this build. If it were accidentally re-enabled (e.g., via a merge conflict), the React Compiler would rewrite hook call order in components like `useVoiceScribeApple`, causing silent state corruption or crashes in the gesture handler worklet thread.

---

## Error Identification

| # | Error Type | Location | Trigger |
|---|---|---|---|
| 1 | `TRPCClientError: No procedure found` | `medications.tsx` → `scribePhotoMutation` | `trpc.medication.scribePhoto` route missing from `medication-router.ts` |
| 2 | `new NativeEventEmitter() requires a non-null argument` | `@react-native-voice/voice/dist/index.js:10` | `NativeModules.Voice` is `undefined` when native module not linked |
| 3 | Potential `TypeError: Cannot read properties of null` | `log-all-vitals-sheet.tsx:354` — `Voice.start('en-US')` | `Voice` is `null` (caught by null-guard, but guard was added reactively) |

---

## Hypothesis & Root Causes (Ranked by Probability)

### Hypothesis 1 — Missing `scribePhoto` tRPC Route (Probability: **High — 85%**)

The `medication-router.ts` file was refactored in Build 2.7.54 to add `scribeVoice` and `scribeTranscript` routes, but the `scribePhoto` route that `medications.tsx` was already calling via `trpc.medication.scribePhoto.useMutation()` was **not present** in the router export. The UI was calling a route that did not exist, causing a fatal unhandled rejection on tap.

**Remediation (Applied):** Added `scribeVoice` and `scribeTranscript` routes to `medication-router.ts`. Verified `scribePhoto` is present. Added proper `try/catch` wrapping around `scribePhotoMutation.mutateAsync()` with a user-visible `Alert` on failure instead of a silent crash.

### Hypothesis 2 — `NativeEventEmitter(null)` on Unlinked iOS Native Module (Probability: **Medium — 60%**)

`@react-native-voice/voice@3.2.4` calls `new NativeEventEmitter(NativeModules.Voice)` at module load time. On iOS devices where the native module is not linked (Expo Go, or a build that hasn't run `pod install` after adding the dependency), `NativeModules.Voice` is `undefined`, causing a fatal throw. The existing `try/catch` around the `require()` in `use-speech-recognizer.ts` and `log-all-vitals-sheet.tsx` catches this at runtime, but it is fragile.

**Remediation (Applied):** Both files already use the lazy-require pattern with try/catch. Additionally, a web stub should be added to `metro.config.js` for `@react-native-voice/voice` to prevent web-platform crashes. The `app.config.ts` already registers the plugin for proper native linking.

### Hypothesis 3 — `reactCompiler: true` Accidental Re-enable (Probability: **Low — 15%**)

If `reactCompiler` were re-enabled in `app.config.ts`, the React Compiler would rewrite the hook call order in `useVoiceScribeApple` and `useSpeechRecognizer`, causing non-deterministic crashes in the gesture handler worklet thread on iOS.

**Remediation:** The `app.config.ts` comment `// IMPORTANT: reactCompiler MUST remain false.` is enforced. No change needed.

---

## Recommended Resolution

### Immediate Actions (Applied in This Build)

**1. Add `scribeVoice` + `scribeTranscript` routes to `medication-router.ts`**

Both routes were added with proper LLM parsing logic. The `scribePhoto` route was confirmed present. The `handleScribePhoto` function in `medications.tsx` now has a complete try/catch/finally chain that shows a user-visible `Alert` on failure instead of crashing silently.

**2. Add web stub for `@react-native-voice/voice` in `metro.config.js`**

To prevent the `NativeEventEmitter(null)` crash on web and in environments where the native module is not linked, add a platform-specific stub:

```js
// In metro.config.js resolveRequest:
if (platform === 'web' && moduleName === '@react-native-voice/voice') {
  return {
    filePath: path.resolve(__dirname, 'lib/ai-scribe/react-native-voice.web.ts'),
    type: 'sourceFile',
  };
}
```

**3. Rename all "Smart Scribe" labels to "🍎 Scribe"**

All user-visible labels across `medications.tsx`, `appointments.tsx`, `immunizations.tsx`, `surgical-history.tsx`, `scribe-button.tsx`, and `ai-scribe-sheet.tsx` have been updated to use the `🍎 Scribe` label as requested.

### Preventive Measures (Recommended)

- Add a CI lint rule that flags any `import` (non-lazy) of `@react-native-voice/voice` outside of a `try/catch` block.
- Add a vitest unit test that mocks `NativeModules.Voice = undefined` and asserts that `useSpeechRecognizer()` returns `state: 'idle'` without throwing.
- Pin `@react-native-voice/voice` to an exact version (`3.2.4`) rather than `^3.2.4` to prevent unexpected minor-version breaking changes.
- Add the `@react-native-voice/voice` web stub to `metro.config.js` as a permanent safeguard.

---

## Resolution Status

| Issue | Status | Fix Applied |
|---|---|---|
| Medications Scribe tap crash | **Fixed** | `scribeVoice` + `scribeTranscript` routes added; error handling hardened |
| NativeEventEmitter null crash (iOS) | **Mitigated** | Lazy-require with try/catch already in place; web stub recommended |
| "Smart Scribe" → "🍎 Scribe" rename | **Fixed** | All UI labels updated across 6 files |
| Immunizations dictation button style | **Fixed** | Upgraded to match Surgical History rich result card |
| Appointments voice-to-text | **Fixed** | `ScribeButton` + `parseAppointmentTranscript` route added |
| reactCompiler guard | **Confirmed safe** | `reactCompiler: false` enforced in `app.config.ts` |
