/**
 * paywall-guard.ts — module-level singleton that prevents paywall navigation loops.
 *
 * All paywall entry points (openPaywall, notification deep-links, banners, settings)
 * MUST call `paywallGuard.tryPush(router)` instead of `router.push('/paywall')`.
 * The paywall screen MUST call `paywallGuard.release()` in its useEffect cleanup.
 *
 * Design:
 *  - `isOnStack`   — true while the paywall route is mounted; prevents re-entry from any source.
 *  - `lastPushAt`  — timestamp of the last push; enforces a minimum 2 s cooldown even after
 *                    the screen unmounts (handles rapid double-taps on banners).
 *  - `release()`   — called by the paywall screen on unmount; resets `isOnStack` and records
 *                    the unmount time so the cooldown window starts from dismissal, not push.
 */

const COOLDOWN_MS = 2000; // minimum ms between successive paywall pushes

let isOnStack = false;
let lastPushAt = 0;
let lastReleaseAt = 0;

export const paywallGuard = {
  /**
   * Attempt to push /paywall onto the navigation stack.
   * Returns `true` if the push was allowed, `false` if it was blocked.
   *
   * @param pushFn — the function that performs the actual router.push('/paywall') call
   */
  tryPush(pushFn: () => void): boolean {
    const now = Date.now();

    // Block if paywall is already on the stack
    if (isOnStack) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[paywallGuard] blocked — paywall already on stack');
      return false;
    }

    // Block if within cooldown window after the last push OR last release
    const lastActivity = Math.max(lastPushAt, lastReleaseAt);
    if (now - lastActivity < COOLDOWN_MS) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[paywallGuard] blocked — cooldown active', now - lastActivity, 'ms since last activity');
      return false;
    }

    isOnStack = true;
    lastPushAt = now;
    try {
      pushFn();
    } catch (e) {
      // If push throws (e.g. navigator not ready), release the guard immediately
      isOnStack = false;
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[paywallGuard] push threw, releasing guard:', e);
      return false;
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[paywallGuard] push allowed at', new Date(now).toISOString());
    return true;
  },

  /**
   * Called by the paywall screen's useEffect cleanup (on unmount).
   * Resets the on-stack flag and records the release time for the cooldown.
   */
  release(): void {
    isOnStack = false;
    lastReleaseAt = Date.now();
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[paywallGuard] released at', new Date(lastReleaseAt).toISOString());
  },

  /** Exposed for unit tests only — resets all state. */
  _reset(): void {
    isOnStack = false;
    lastPushAt = 0;
    lastReleaseAt = 0;
  },

  /** Exposed for unit tests / debug panel only. */
  get _isOnStack(): boolean { return isOnStack; },
  get _lastPushAt(): number { return lastPushAt; },
  get _lastReleaseAt(): number { return lastReleaseAt; },
};
