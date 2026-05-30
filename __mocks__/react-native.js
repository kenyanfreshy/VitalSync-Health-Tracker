/**
 * Manual mock for react-native in the Vitest node test environment.
 * react-native/index.js uses Flow syntax ('import typeof *') which
 * cannot be parsed by Rollup/Node.js.  This mock provides the minimal
 * surface area needed by the test suite.
 */
const Platform = {
  OS: 'ios',
  select: (obj) => obj.ios ?? obj.default,
};

const NativeModules = {};

const NativeEventEmitter = function() {
  return { addListener: () => {}, removeAllListeners: () => {} };
};

module.exports = {
  Platform,
  NativeModules,
  NativeEventEmitter,
};
