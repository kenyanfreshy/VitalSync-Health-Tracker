# VitalSync Pull Request

## Summary

<!-- Describe what this PR changes and why. -->

---

## Regression-Prevention Checklist (Mandatory — from RCA Build 2.7.54)

These three checks were added after a fatal crash-on-launch regression. Every PR that touches the tRPC router, native dependencies, or `app.config.ts` **must** verify all three before merge.

### ✅ Check 1 — Router Parity

> Verify that every `useMutation` hook in the UI has a corresponding **exported** route in the tRPC router.

- [ ] I searched for all `trpc.<router>.<procedure>.useMutation()` calls introduced or modified in this PR.
- [ ] I confirmed each procedure is exported from the corresponding `*-router.ts` file **and** registered in `server/routers.ts`.
- [ ] I ran `pnpm test` and the **Router Parity** vitest suite passes with no failures.

**How to verify manually:**
```bash
# List all useMutation calls in the app
grep -rn "\.useMutation()" app/ components/ --include="*.tsx" --include="*.ts"

# List all exported procedures in the medication router
grep -n "^  [a-zA-Z]*:" server/medication-router.ts

# Run the automated parity test
pnpm test -- --reporter=verbose tests/regression/router-parity.test.ts
```

---

### ✅ Check 2 — Native Linking

> Run `npx expo prebuild` or `pod install` if any changes were made to `@react-native-voice/voice` or any other native module.

- [ ] I checked `package.json` diff — if `@react-native-voice/voice` version changed, I ran `npx expo prebuild --clean` locally and verified the iOS build succeeds.
- [ ] I confirmed the `@react-native-voice/voice` web stub is present in `metro.config.js` (guards against `NativeEventEmitter(null)` crash on web/unlinked builds).
- [ ] I ran `pnpm test` and the **Native Linking Guard** vitest suite passes.

**How to verify manually:**
```bash
# Confirm the web stub is registered
grep -n "@react-native-voice/voice" metro.config.js

# Run the automated guard test
pnpm test -- --reporter=verbose tests/regression/native-linking-guard.test.ts
```

---

### ✅ Check 3 — Compiler Audit

> Double-check `app.config.ts` to ensure `reactCompiler` has **not** been flipped to `true`.

- [ ] I opened `app.config.ts` and confirmed `reactCompiler: false` (the comment `// IMPORTANT: reactCompiler MUST remain false.` is still present).
- [ ] I ran `pnpm test` and the **Compiler Audit** vitest suite passes.

**Why this matters:** Enabling the React Compiler rewrites hook call order in `useVoiceScribeApple` and `useSpeechRecognizer`, causing non-deterministic crashes in the gesture handler worklet thread on iOS.

**How to verify manually:**
```bash
grep "reactCompiler" app.config.ts
# Expected output: reactCompiler: false

# Run the automated audit test
pnpm test -- --reporter=verbose tests/regression/compiler-audit.test.ts
```

---

## General Checklist

- [ ] TypeScript compiles without new errors (`pnpm check`)
- [ ] All new tRPC routes have input validation via `zod`
- [ ] No hardcoded mock data in UI — loading/unknown states shown when data is unavailable
- [ ] `ScribeButton` / `AiScribeTrigger` usage: label prop set to `🍎 Scribe` (not legacy `Smart Scribe`)
- [ ] No `import` (non-lazy) of `@react-native-voice/voice` outside a `try/catch` block

---

## Testing

<!-- Describe how you tested this PR. -->

| Scenario | Platform | Result |
|---|---|---|
| | iOS Simulator | |
| | Android Emulator | |
| | Web | |

---

## Related Issues / RCA

<!-- Link to any related issues, tickets, or RCA documents. -->
- RCA: `RCA_Build_2.7.54.md`
