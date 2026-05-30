/**
 * react-native-health.web.ts
 * Web-safe no-op stub for react-native-health (iOS-only native package).
 * Metro resolves this file instead of the real package when bundling for web.
 */

const _noop = () => {};
const _noopAsync = async () => false;

const HealthKit = {
  isAvailable: (_cb: (err: any, available: boolean) => void) => {
    _cb(null, false);
  },
  initHealthKit: (_permissions: any, _cb: (err: string) => void) => {
    _cb("react-native-health is not available on web");
  },
  Constants: {
    Permissions: new Proxy({} as Record<string, string>, {
      get: (_target, prop) => String(prop),
    }),
  },
};

export default HealthKit;
module.exports = HealthKit;
