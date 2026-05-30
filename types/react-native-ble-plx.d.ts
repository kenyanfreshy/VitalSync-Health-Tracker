/**
 * Minimal type stub for react-native-ble-plx.
 * The real package is a native module loaded dynamically at runtime;
 * this stub satisfies the TypeScript compiler when the package is not
 * installed in the dev environment.
 */
declare module 'react-native-ble-plx' {
  export class BleManager {
    startDeviceScan(
      uuids: string[] | null,
      options: Record<string, unknown> | null,
      listener: (error: Error | null, device: Device | null) => void,
    ): void;
    stopDeviceScan(): void;
    connectToDevice(deviceId: string): Promise<Device>;
    cancelDeviceConnection(deviceId: string): Promise<Device>;
    destroy(): void;
  }

  export interface Device {
    id: string;
    name: string | null;
    rssi: number | null;
    discoverAllServicesAndCharacteristics(): Promise<Device>;
    characteristicsForService(serviceUUID: string): Promise<Characteristic[]>;
    readCharacteristicForService(
      serviceUUID: string,
      characteristicUUID: string,
    ): Promise<Characteristic>;
  }

  export interface Characteristic {
    uuid: string;
    value: string | null; // base64-encoded
  }
}
