// =======================
// services/healthkit.ts
// =======================
// react-native-health is a native iOS-only package.
// On web and Android we return safe no-op stubs so Metro can bundle without errors.
import { Platform, Alert, NativeModules } from "react-native";

let hasInitialized = false;

export const requestHealthPermission = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  if (Platform.OS !== "ios") {
    return { success: false, error: "Not iOS" };
  }

  // Dynamically require so Metro only resolves the native module on iOS
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppleHealthKit = require("react-native-health").default;

  if (!NativeModules.AppleHealthKit) {
    console.log("❌ Native HealthKit module NOT loaded");
    return { success: false, error: "Native module missing" };
  }

  const permissions = {
    permissions: {
      read: [
        AppleHealthKit.Constants.Permissions.StepCount,
        AppleHealthKit.Constants.Permissions.HeartRate,
      ],
      write: [AppleHealthKit.Constants.Permissions.StepCount],
    },
  };

  return new Promise((resolve) => {
    AppleHealthKit.isAvailable((err: any, available: boolean) => {
      if (err || !available) {
        Alert.alert("HealthKit not available");
        resolve({ success: false, error: "Not available" });
        return;
      }

      AppleHealthKit.initHealthKit(permissions, (error: any) => {
        hasInitialized = true;
        if (error) {
          Alert.alert(
            "Permission Required",
            "Enable permissions in Apple Health → Profile → Apps → VitalSync"
          );
          resolve({ success: false, error });
        } else {
          resolve({ success: true });
        }
      });
    });
  });
};

export const hasInitBeenCalled = () => hasInitialized;
