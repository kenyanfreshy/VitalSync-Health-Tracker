/**
 * Manual mock for expo-modules-core in the Vitest node test environment.
 */
const NativeModulesProxy = {};
const EventEmitter = function() {
  return {
    addListener: () => ({ remove: () => {} }),
    removeAllListeners: () => {},
    emit: () => {},
  };
};

module.exports = { NativeModulesProxy, EventEmitter };
