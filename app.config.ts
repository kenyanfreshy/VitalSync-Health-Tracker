// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Apple reverse-domain name style bundle ID (com.domainname.appname)
const bundleId = "com.vitalsync.healthtracker";
// Deep link scheme
const schemeFromBundleId = "vshtapp";

// aps-environment is controlled per EAS build profile via the EAS_APS_ENVIRONMENT env var:
//   development profile → EAS_APS_ENVIRONMENT=development  (simulator / dev client builds)
//   preview profile     → EAS_APS_ENVIRONMENT=production   (internal TestFlight distribution)
//   production profile  → EAS_APS_ENVIRONMENT=production   (App Store / TestFlight release)
// Falls back to "development" when the env var is absent (matches pasted config default).
const apsEnvironment =
  (process.env.EAS_APS_ENVIRONMENT as "development" | "production" | undefined) ?? "development";

const env = {
  appName: "VitalSync Health Tracker",
  appSlug: "VitalSync-Health-Tracker",
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663404202670/tRjRLeXaFwalXOjc.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

/**
 * TestFlight / Xcode Distribution Requirements
 * ─────────────────────────────────────────────
 * Bundle ID:     com.vitalsync.healthtracker
 *
 * Entitlements (auto-injected by EAS Build from ios.entitlements below):
 *   com.apple.developer.healthkit                     = true
 *   com.apple.developer.healthkit.background-delivery = true
 *   aps-environment                                   = development | production
 *
 * Apple Developer Portal (one-time per App ID — com.vitalsync.healthtracker):
 *   1. Enable HealthKit capability under Certificates, IDs & Profiles → App IDs → Edit.
 *   2. Enable Push Notifications capability (for aps-environment entitlement).
 */
const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.60",
  orientation: "portrait",
  newArchEnabled: true,
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    buildNumber: "10060",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleDisplayName: "VitalSync Health Tracker",
      NSFaceIDUsageDescription:
        "VitalSync Health Tracker uses Face ID to protect access to your personal health data.",
      NSBluetoothAlwaysUsageDescription:
        "VitalSync Health Tracker uses Bluetooth to sync readings from your glucometer, blood pressure monitor, and smart scale.",
      NSBluetoothPeripheralUsageDescription:
        "VitalSync Health Tracker uses Bluetooth to sync readings from your health devices.",
      NSHealthShareUsageDescription:
        "VitalSync Health Tracker reads the following health data from Apple Health to display and track your wellness vitals: blood pressure (systolic and diastolic), heart rate, resting heart rate, heart rate variability (HRV), blood glucose, body mass (weight), body fat percentage, lean body mass, height, step count, oxygen saturation (SpO\u2082), body temperature, respiratory rate, sleep analysis, active energy burned, walking/running distance, cycling distance, workout sessions, and electrocardiogram (EKG) recordings to show heart rhythm history.",
      NSHealthUpdateUsageDescription:
        "VitalSync Health Tracker writes your manually entered health data back to Apple Health, including: heart rate, heart rate variability (HRV), blood pressure (systolic and diastolic), blood glucose, body mass (weight), oxygen saturation (SpO\u2082), sleep analysis, and analyzed heart rhythm trends from electrocardiogram (EKG) data.",
      NSCameraUsageDescription:
        "VitalSync Health Tracker uses the camera to scan lab reports, prescriptions, and medical documents.",
      NSMicrophoneUsageDescription:
        "VitalSync Health Tracker uses the microphone for AI Scribe voice-to-text transcription. Audio is processed on-device and never stored or transmitted.",
      NSSpeechRecognitionUsageDescription:
        "VitalSync Health Tracker uses on-device speech recognition to support keyboard dictation. No audio is sent to external servers.",
      // Guideline 2.5.4: explicitly declare only the background modes we use.
      // This overrides any 'audio' injected by expo-audio/expo-video plugins.
      UIBackgroundModes: ["fetch", "bluetooth-central", "bluetooth-peripheral"],
      BGTaskSchedulerPermittedIdentifiers: ["com.vitalsync.healthtracker.data.refresh"],
      LSApplicationQueriesSchemes: [
        "x-apple-health",
        "App-prefs",
        "app-settings",
      ],
    },
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.background-delivery": true,
      "aps-environment": apsEnvironment,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0D1117",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    versionCode: 60,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: bundleId,
    permissions: [
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.BODY_SENSORS",
      "android.permission.BODY_SENSORS_BACKGROUND",
      "android.permission.ACTIVITY_RECOGNITION",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH_ADVERTISE",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.health.READ_HEART_RATE",
      "android.permission.health.READ_HEART_RATE_VARIABILITY",
      "android.permission.health.READ_RESTING_HEART_RATE",
      "android.permission.health.READ_BLOOD_PRESSURE",
      "android.permission.health.READ_HEALTH_DATA_HISTORY",
      "android.permission.health.READ_SLEEP",
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_WEIGHT",
      "android.permission.health.READ_BODY_FAT",
      "android.permission.health.READ_LEAN_BODY_MASS",
      "android.permission.health.READ_HEIGHT",
      "android.permission.health.READ_OXYGEN_SATURATION",
      "android.permission.health.READ_RESPIRATORY_RATE",
      "android.permission.health.READ_BODY_TEMPERATURE",
      "android.permission.health.READ_BLOOD_GLUCOSE",
      "android.permission.health.READ_EXERCISE",
      "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
      "android.permission.health.READ_DISTANCE",
      "android.permission.health.WRITE_HEART_RATE",
      "android.permission.health.WRITE_BLOOD_PRESSURE",
      "android.permission.health.WRITE_STEPS",
      "android.permission.health.WRITE_WEIGHT",
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.WAKE_LOCK",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "android.permission.INTERNET",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-camera",
      {
        cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan barcodes and meal photos.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    "expo-screen-orientation",
    // expo-audio plugin removed: it injects 'audio' into UIBackgroundModes (Guideline 2.5.4).
    // NSMicrophoneUsageDescription is declared directly in infoPlist above instead.
    "@react-native-community/datetimepicker",
    "expo-localization",
    [
      "expo-media-library",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to save meal photos to your Camera Roll.",
        savePhotosPermission: "Allow $(PRODUCT_NAME) to save meal photos to your Camera Roll.",
        isAccessMediaLocationEnabled: false,
      },
    ],
    "./plugins/withZhDisplayName",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#0D1117",
        sounds: [],
        mode: "development",
      },
    ],
    [
      "expo-background-fetch",
      {},
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "VitalSync Health Tracker uses Face ID to protect access to your personal health data.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to access your photos to attach lab reports.",
        cameraPermission:
          "Allow $(PRODUCT_NAME) to use the camera to scan lab reports, prescriptions, and medical documents.",
        microphonePermission: false,
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: false,
        supportsPictureInPicture: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0D1117",
        dark: {
          backgroundColor: "#0D1117",
        },
      },
    ],
    [
      "@kingstinct/react-native-healthkit",
      {
        background: true,
        healthSharePermission:
          "VitalSync Health Tracker reads your health data from Apple Health to display and track your wellness vitals: " +
          "blood pressure, heart rate, HRV, blood glucose, weight, body fat, SpO\u2082, " +
          "respiratory rate, body temperature, sleep analysis, steps, active energy, workouts, " +
          "and electrocardiogram (EKG) recordings to show heart rhythm history.",
        healthUpdatePermission:
          "VitalSync Health Tracker writes your manually entered vitals back to Apple Health, including " +
          "heart rate, HRV, blood pressure, blood glucose, weight, SpO\u2082, body temperature, " +
          "sleep analysis, and analyzed heart rhythm trends from electrocardiogram (EKG) data.",
      },
    ],
    [
      "react-native-health",
      {
        healthSharePermission:
          "VitalSync Health Tracker reads your health data from Apple Health to display and track your wellness vitals: " +
          "blood pressure, heart rate, HRV, blood glucose, weight, body fat, SpO\u2082, " +
          "respiratory rate, body temperature, sleep analysis, steps, active energy, workouts, " +
          "and electrocardiogram (EKG) recordings to show heart rhythm history.",
        healthUpdatePermission:
          "VitalSync Health Tracker writes your manually entered vitals back to Apple Health, including " +
          "heart rate, HRV, blood pressure, blood glucose, weight, SpO\u2082, body temperature, " +
          "sleep analysis, and analyzed heart rhythm trends from electrocardiogram (EKG) data.",
      },
    ],
    [
      "react-native-health-connect",
      {
        "permissions": [
          "BloodPressure",
          "HeartRate",
          "HeartRateVariabilityRmssd",
          "OxygenSaturation",
          "BloodGlucose",
          "Weight",
          "LeanBodyMass",
          "BodyFat",
          "Height",
          "Distance",
          "TotalCaloriesBurned",
          "Steps",
          "ExerciseSession",
          "SleepSession"
        ]
      }
    ],
    "expo-secure-store",
    "expo-file-system",
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          kotlinVersion: "2.2.0",
        },
        ios: {
          useFrameworks: "static",
        },
      },
    ],
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: true,
        modes: ["peripheral", "central"],
        bluetoothAlwaysPermission:
          "VitalSync Health Tracker needs Bluetooth to sync with clinical monitors and wearables.",
      },
    ],
    // Guideline 2.5.4 fix: remove 'audio' from UIBackgroundModes injected by expo-audio/expo-video
    "./plugins/withNoBackgroundAudio",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "554a0a39-b44a-42fd-9698-e9c42ba5d1a4",
    },
  },
};

export default config;
