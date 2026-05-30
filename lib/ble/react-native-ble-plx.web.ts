/**
 * Web stub for react-native-ble-plx.
 * BLE is not available on web — all exports are no-ops so the module can be
 * safely imported without crashing the Metro web bundler.
 */

export class BleManager {
  startDeviceScan() {}
  stopDeviceScan() {}
  connectToDevice() { return Promise.resolve(null); }
  cancelDeviceConnection() { return Promise.resolve(null); }
  destroy() {}
}

export const BleError = class BleError extends Error {};
export const BleErrorCode = {};
export const State = { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff', Unknown: 'Unknown' };
export const LogLevel = {};
export const ConnectionPriority = {};
export const ScanCallbackType = {};
export const ScanMode = {};
