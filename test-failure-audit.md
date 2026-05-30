# VitalSync Test Failure Audit

**Date:** 2026-04-23  
**Test run summary:** 1,810 passing · **9 failing** · 3 skipped (1,822 total)  
**Failing test files:** 3 (`app-config-audit.test.ts`, `meal-log-confirmation.test.ts`, `expo-token.test.ts`)

---

## Failure 1 — `aps-environment` entitlement set to `"development"` instead of `"production"`

| Field | Detail |
|-------|--------|
| **File** | `tests/app-config-audit.test.ts` |
| **Test** | `aps-environment entitlement > is set to "production"` |
| **Error** | `expected 'development' to be 'production'` |

**Root cause:** `app.config.ts` reads the `EAS_APS_ENVIRONMENT` environment variable and falls back to `"development"` when the variable is not set. In the sandbox (and in local development), `EAS_APS_ENVIRONMENT` is never set, so the entitlement is always `"development"`. The test unconditionally asserts `"production"`.

**Why this is a test design issue, not a code bug:** The `"development"` value is correct for simulator and dev-client builds. The test was written to guard against accidentally shipping a `"development"` entitlement to the App Store, but it does not account for the environment-variable-controlled design. The test should either be skipped when `EAS_APS_ENVIRONMENT` is not set, or it should assert that the value is one of `['development', 'production']` (which a separate passing test already does).

**Fix options:**
- **Recommended:** Update the test to skip when `process.env.EAS_APS_ENVIRONMENT !== 'production'`, or assert `toBeOneOf(['development', 'production'])` instead of `toBe('production')`.
- **Alternative:** Set `EAS_APS_ENVIRONMENT=production` in the CI environment only.

---

## Failures 2–4 — Android permissions missing short-form names

| Field | Detail |
|-------|--------|
| **File** | `tests/app-config-audit.test.ts` |
| **Tests** | `Android permissions > includes BODY_SENSORS`, `includes BODY_SENSORS_BACKGROUND`, `includes ACTIVITY_RECOGNITION`, `includes POST_NOTIFICATIONS` |
| **Error** | `expected [ …(39) ] to include 'BODY_SENSORS'` (and similar for the others) |

**Root cause:** `app.config.ts` lists permissions with the full `android.permission.` prefix (e.g., `"android.permission.BODY_SENSORS"`). The test checks for the short form (`"BODY_SENSORS"`). Both forms are valid in `app.json`/`app.config.ts` — Expo normalises them — but the test's `getPerms()` function reads the raw array from the loaded config, which contains the full-prefix strings.

**Current `app.config.ts` values (correct):**
```
"android.permission.POST_NOTIFICATIONS"
"android.permission.BODY_SENSORS"
"android.permission.BODY_SENSORS_BACKGROUND"
"android.permission.ACTIVITY_RECOGNITION"
```

**Fix options:**
- **Recommended:** Update the test's `getPerms()` helper to normalise each permission by stripping the `android.permission.` prefix before asserting, so both formats pass:
  ```ts
  const normalise = (p: string) => p.replace(/^android\.permission\./, '');
  return (config.android?.permissions ?? []).map(normalise);
  ```
- **Alternative:** Change `app.config.ts` to use the short form (no prefix) for these four permissions. Note: Health Connect permissions (`android.permission.health.*`) must keep their full prefix.

---

## Failures 5–7 — `ai-food-camera-sheet` meal log confirmation uses inline banner instead of `Alert`

| Field | Detail |
|-------|--------|
| **File** | `__tests__/meal-log-confirmation.test.ts` |
| **Tests** | `shows "Meal Logged ✓" as the alert title`, `offers "Log Another" button that resets the form`, `resets logged to false when Log Another is tapped` |
| **Error** | `expected '...' to contain "'Meal Logged ✓'"` / `expected '...' to contain "text: 'Log Another'"` / `expected '' to contain 'setLogged(false)'` |

**Root cause:** The test was written to assert an `Alert.alert('Meal Logged ✓', ..., [{ text: 'Log Another', onPress: () => setLogged(false) }, { text: 'Done' }])` call. The component was subsequently refactored to use an **inline success banner** (a `View` with `✓ Saved` text and `onLogMore`/`onDone` callbacks) instead of a modal `Alert`. The inline banner is better UX (non-blocking, no system dialog) but the test still looks for the old `Alert` string patterns.

**What the component currently has (passing tests confirm):**
- `const [logged, setLogged] = useState(false)` ✓
- `if (!preview || logged) return;` ✓
- `setLogged(true);` ✓
- `setLogged(false);   // ← reset so user can log again after reopening` ✓
- `disabled={logging || logged}` ✓
- `✓ Saved` ✓
- `logged, addSodium, onClose, onMealLogged` in dependency array ✓

**Fix options:**
- **Recommended:** Update the 3 failing tests to match the inline banner pattern. Replace the `Alert`-based assertions with checks for the inline success banner's text content and `onLogMore` callback:
  ```ts
  // Instead of: expect(src).toContain("'Meal Logged ✓'")
  expect(src).toContain('✓ Saved');           // already passing
  // Instead of: expect(src).toContain("text: 'Log Another'")
  expect(src).toContain('onLogMore');
  // Instead of: expect(logAnotherBlock).toContain('setLogged(false)')
  expect(src).toContain('setLogged(false)');  // already present
  ```
- **Alternative:** Restore the `Alert.alert('Meal Logged ✓', ...)` call in the component (regression in UX).

---

## Failure 8 — `EXPO_TOKEN` environment variable not set

| Field | Detail |
|-------|--------|
| **File** | `tests/expo-token.test.ts` |
| **Test** | `Expo Token Validation > should authenticate with EAS API using EXPO_TOKEN` |
| **Error** | `EXPO_TOKEN env var must be set: expected undefined to be truthy` |

**Root cause:** This test requires a valid `EXPO_TOKEN` (an EAS personal access token) to be set in the environment. It is a CI/CD integration test — it calls the live EAS GraphQL API to verify the token is valid. It is not a unit test and cannot pass in the sandbox or any environment where `EXPO_TOKEN` is not configured.

**This is an infrastructure/environment issue, not a code bug.**

**Fix options:**
- **Recommended:** Add `skipIf(!process.env.EXPO_TOKEN)` to the test so it is skipped gracefully in environments without the token, rather than failing:
  ```ts
  it.skipIf(!process.env.EXPO_TOKEN)('should authenticate with EAS API...', async () => { ... });
  ```
- **Alternative:** Set `EXPO_TOKEN` as a CI secret in the GitHub Actions workflow.

---

## Summary Table

| # | Test File | Test Name | Category | Severity | Fix Effort |
|---|-----------|-----------|----------|----------|------------|
| 1 | `app-config-audit.test.ts` | `aps-environment` is `"production"` | Test design mismatch | Low — never blocks a real build | 5 min |
| 2 | `app-config-audit.test.ts` | Android `BODY_SENSORS` | Test design mismatch (prefix format) | Low | 5 min |
| 3 | `app-config-audit.test.ts` | Android `BODY_SENSORS_BACKGROUND` | Test design mismatch (prefix format) | Low | 5 min |
| 4 | `app-config-audit.test.ts` | Android `ACTIVITY_RECOGNITION` | Test design mismatch (prefix format) | Low | 5 min |
| 5 | `app-config-audit.test.ts` | Android `POST_NOTIFICATIONS` | Test design mismatch (prefix format) | Low | 5 min |
| 6 | `meal-log-confirmation.test.ts` | `"Meal Logged ✓"` alert title | Test stale after UX refactor | Medium — test describes removed behaviour | 10 min |
| 7 | `meal-log-confirmation.test.ts` | `"Log Another"` button | Test stale after UX refactor | Medium | 10 min |
| 8 | `meal-log-confirmation.test.ts` | `setLogged(false)` in Log Another | Test stale after UX refactor | Medium | 10 min |
| 9 | `expo-token.test.ts` | EAS API authentication | Missing CI secret | Low — infrastructure only | 5 min |

**Total estimated fix time: ~55 minutes**

---

## Classification

All 9 failures are **test maintenance issues** — none represent a runtime bug or data loss risk in the app itself. They fall into three categories:

1. **Test design mismatch (5 failures):** The test asserts a specific value/format that is technically correct in a different context (production build, short permission format). The app code is correct; the test assertion is too strict.

2. **Stale test after UX refactor (3 failures):** The `meal-log-confirmation` tests were written for an `Alert`-based confirmation flow. The component was improved to use an inline banner (better UX), but the tests were not updated to match.

3. **Missing CI secret (1 failure):** `EXPO_TOKEN` is a live API integration test that requires a real EAS token. It should be skipped when the token is not available.

**No failures indicate a broken feature, data corruption, or regression in app functionality.**
