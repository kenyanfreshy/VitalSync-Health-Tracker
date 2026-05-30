# VitalSync — Apple HealthKit Integration Guide

**Last updated:** March 13, 2026  
**Author:** Manus AI  
**Package:** `@kingstinct/react-native-healthkit` v13.2.3  
**Expo SDK:** 54  

---

## Overview

VitalSync connects to Apple Health via the `@kingstinct/react-native-healthkit` package, which uses a Nitro Modules (JSI C++) bridge for high-performance, type-safe access to the HealthKit store. The integration is structured as a four-layer pipeline:

```
Apple Health Store
      │
      ▼
@kingstinct/react-native-healthkit  (native bridge)
      │
      ▼
lib/health/native-health-service.ts  (data fetchers + sync engine)
      │
      ▼
lib/health/health-context.tsx        (React state + write-back)
      │
      ▼
Dashboard + Settings screens         (UI)
```

All HealthKit code is **iOS-only**. Every function that touches HealthKit is guarded by `Platform.OS === 'ios'` checks and uses the safe `loadHealthKit()` loader to prevent crashes on Android and web.

---

## Prerequisites

Before the HealthKit integration works on a real device, three things must be true:

| Requirement | Where to configure | Status |
|---|---|---|
| `com.apple.developer.healthkit` entitlement | Apple Developer Portal → App ID → Capabilities | Must be enabled manually |
| `com.apple.developer.healthkit.background-delivery` entitlement | Apple Developer Portal → App ID → Capabilities | Must be enabled manually |
| Provisioning profile includes HealthKit | Xcode / EAS Build | Regenerate after enabling capabilities |

The `app.config.ts` already declares both entitlements:

```ts
entitlements: {
  "com.apple.developer.healthkit": true,
  "com.apple.developer.healthkit.background-delivery": true,
},
```

> **Important:** Declaring entitlements in `app.config.ts` is not sufficient on its own. You must also enable the HealthKit capability on the App ID in the Apple Developer Portal and regenerate the provisioning profile. EAS Build handles this automatically when `eas build` is run with the correct Apple credentials.

---

## File Map

| File | Purpose |
|---|---|
| `lib/health/healthkit-loader.ts` | Safe dynamic import with NitroModules guard |
| `lib/health/native-health-service.ts` | All HealthKit data fetchers + Android Health Connect branch + background delivery |
| `lib/health/permissions.ts` | Permission request + `fetchHealthData` (full 30-day import) |
| `lib/health/healthkit-write.ts` | Write-back functions for all supported types |
| `lib/health/health-context.tsx` | React context: state, dispatch, `addX` actions, `forceSync` |
| `app/_layout.tsx` | `ColdLaunchPermissionBridge` + `HealthKitBackgroundBridge` |
| `app/settings/healthkit-permissions.tsx` | Per-type authorization status screen |
| `app.config.ts` | Entitlements, privacy strings, plugin registration |

---

## Permission Flow

### First Install

On first launch, the `ColdLaunchPermissionBridge` (mounted in `app/_layout.tsx`) waits for all pending JS interactions to settle, then waits an additional 400 ms, and calls `requestPermissions()`. This timing prevents a race condition where the NitroModules C++ bridge has not yet registered in the JS runtime.

```
Cold launch
    │
    ▼
InteractionManager.runAfterInteractions()
    │  + 400 ms
    ▼
requestPermissions()
    │
    ▼
HK.requestAuthorization({ toRead: [...], toShare: [...] })
    │  iOS shows system permission sheet
    ▼
permissionsGranted = true
    │  + 800 ms delay
    ▼
forceSync()  ← full 30-day import
    │
    ▼
Dashboard populated
```

### Subsequent Launches

`requestAuthorization` is called again on every cold launch. iOS never shows the permission sheet a second time for types that are already determined — it is a silent no-op. This ensures that if the user grants additional types in iOS Settings → Privacy → Health, the app picks them up on the next launch.

### Read Types Requested

| Category | HK Identifier |
|---|---|
| Blood Pressure | `HKCorrelationTypeIdentifierBloodPressure`, `HKQuantityTypeIdentifierBloodPressureSystolic`, `HKQuantityTypeIdentifierBloodPressureDiastolic` |
| Cardiovascular | `HKQuantityTypeIdentifierHeartRate`, `HKQuantityTypeIdentifierRestingHeartRate`, `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` |
| Metabolic | `HKQuantityTypeIdentifierBloodGlucose` |
| Body Composition | `HKQuantityTypeIdentifierBodyMass`, `HKQuantityTypeIdentifierBodyFatPercentage`, `HKQuantityTypeIdentifierHeight` |
| Activity | `HKQuantityTypeIdentifierStepCount`, `HKQuantityTypeIdentifierActiveEnergyBurned`, `HKQuantityTypeIdentifierDistanceWalkingRunning`, `HKQuantityTypeIdentifierDistanceCycling` |
| Respiratory | `HKQuantityTypeIdentifierOxygenSaturation`, `HKQuantityTypeIdentifierRespiratoryRate` |
| Temperature | `HKQuantityTypeIdentifierBodyTemperature` |
| ECG | `HKElectrocardiogramType` |
| Sleep | `HKCategoryTypeIdentifierSleepAnalysis` |
| Workouts | `HKWorkoutTypeIdentifier` |

### Write Types Requested

| Type | HK Identifier | Unit |
|---|---|---|
| Heart Rate | `HKQuantityTypeIdentifierHeartRate` | `count/min` |
| HRV (SDNN) | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `ms` |
| Blood Pressure Systolic | `HKQuantityTypeIdentifierBloodPressureSystolic` | `mmHg` |
| Blood Pressure Diastolic | `HKQuantityTypeIdentifierBloodPressureDiastolic` | `mmHg` |
| Blood Glucose | `HKQuantityTypeIdentifierBloodGlucose` | `mg/dL` |
| Body Mass | `HKQuantityTypeIdentifierBodyMass` | `kg` |
| Body Fat % | `HKQuantityTypeIdentifierBodyFatPercentage` | `%` |
| Height | `HKQuantityTypeIdentifierHeight` | `cm` |
| Step Count | `HKQuantityTypeIdentifierStepCount` | `count` |
| Active Energy | `HKQuantityTypeIdentifierActiveEnergyBurned` | `kcal` |
| SpO₂ | `HKQuantityTypeIdentifierOxygenSaturation` | `%` (stored as 0–1 fraction) |
| Body Temperature | `HKQuantityTypeIdentifierBodyTemperature` | `degC` |
| Sleep Analysis | `HKCategoryTypeIdentifierSleepAnalysis` | category value `1` (AsleepUnspecified) |

---

## Data Fetchers

All fetchers live in `lib/health/native-health-service.ts` and follow the same pattern:

```ts
async function fetchHealthKitBloodPressure(since: Date): Promise<BloodPressureRecord[]> {
  const HK = await loadHealthKit();
  if (!HK) return [];
  const results = await HK.queryCorrelationSamples(
    'HKCorrelationTypeIdentifierBloodPressure' as any,
    { limit: 100, filter: { date: { startDate: since, endDate: new Date() } } },
  );
  return results.map(r => ({
    id: r.uuid ?? uuid(),
    timestamp: r.startDate ?? new Date().toISOString(),
    systolic: Math.round(r.objects?.find(o => o.quantityType === 'HKQuantityTypeIdentifierBloodPressureSystolic')?.quantity ?? 0),
    diastolic: Math.round(r.objects?.find(o => o.quantityType === 'HKQuantityTypeIdentifierBloodPressureDiastolic')?.quantity ?? 0),
    source: 'Apple Health',
  })).filter(r => r.systolic > 0 && r.diastolic > 0);
}
```

The `syncAll(since?)` function runs all fetchers in parallel and returns a `NativeHealthSyncResult` with counts for each type:

```ts
const result = await getNativeHealthService().syncAll(
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
);
// result.bloodPressure, result.heartRate, result.sleep, ...
// result.counts.bloodPressure, result.counts.heartRate, ...
```

### SDK v13 Field Names

`@kingstinct/react-native-healthkit` v13 (Nitro Modules) uses different field names from v12 (JSI bridge). The key differences are:

| Data | v12 field | v13 field |
|---|---|---|
| ECG voltages | `voltageMeasurements` | `voltages` |
| ECG sampling rate | `samplingFrequency` | `samplingFrequencyHz` |
| ECG average HR | `averageHeartRate` | `averageHeartRateBpm` |
| Workout distance | `totalDistance.sumQuantity.doubleValue` | `totalDistance.quantity` |
| Workout energy | `totalEnergyBurned.sumQuantity.doubleValue` | `totalEnergyBurned.quantity` |

---

## Write-Back

When a user manually logs a health entry, VitalSync writes it back to Apple Health automatically. The write-back functions are in `lib/health/healthkit-write.ts`.

### Calling a Write-Back Function

```ts
import { saveBloodPressureToHealthKit } from '@/lib/health/healthkit-write';

await saveBloodPressureToHealthKit({
  id: 'abc123',
  timestamp: new Date().toISOString(),
  systolic: 120,
  diastolic: 80,
  source: 'manual',
});
```

All write-back functions are safe to call on Android and web — they check `Platform.OS` internally and return immediately if HealthKit is not available.

### Blood Glucose Meal Context

```ts
await saveBloodGlucoseToHealthKit({
  id: 'xyz',
  timestamp: new Date().toISOString(),
  value: 95,
  unit: 'mg/dL',
  context: 'fasting',   // 'fasting' | 'post-meal' | 'random'
  source: 'manual',
});
```

The `context` field maps to `HKMetadataKeyBloodGlucoseMealTime`:
- `'fasting'` → `1` (HKBloodGlucoseMealTimePreprandial)
- `'post-meal'` → `2` (HKBloodGlucoseMealTimePostprandial)
- `'random'` → `0` (unspecified)

---

## Background Delivery

HealthKit can wake the app (or trigger a background task) when new data arrives for a subscribed type, even when the app is not in the foreground.

### How It Works

1. `enableHealthKitBackgroundDelivery()` calls `HK.enableBackgroundDelivery()` for each subscribed type. This registration persists across launches — it only needs to be called once.
2. `registerHealthKitObservers()` calls `HK.subscribeToChanges()` for each type. When a change fires, the observer runs a 24-hour sync, merges new records into AsyncStorage, updates the last-sync timestamp, and fires a rich local notification.
3. Both functions are called from `HealthKitBackgroundBridge` in `app/_layout.tsx` after `permissionsGranted` becomes `true`.

### Subscribed Types

```ts
const BACKGROUND_DELIVERY_TYPES = [
  'HKCorrelationTypeIdentifierBloodPressure',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKElectrocardiogramType',
];
```

### Background Notification

When new records arrive via background delivery, a local notification fires immediately with a per-type count breakdown:

> **Apple Health — 16 new readings**  
> 3 BP · 12 HR · 1 Sleep

The notification payload includes `data.source = 'healthkit-background'` for deep-link routing.

### Last-Sync Timestamp

The timestamp of the last successful background sync is stored at `@vitalsync:last_hk_bg_sync` (ISO string). The Settings → Data Sources screen reads this key and displays it as a "Last synced" badge.

---

## Safe Loader Pattern

The `loadHealthKit()` function in `lib/health/healthkit-loader.ts` must be used for every HealthKit import. Direct `import('@kingstinct/react-native-healthkit')` calls will crash on cold launch because the NitroModules C++ bridge may not yet be registered in the JS runtime.

```ts
// ✅ Correct
const HK = await loadHealthKit();
if (!HK) return; // gracefully degrade

// ❌ Wrong — crashes on cold launch
const HK = await import('@kingstinct/react-native-healthkit');
```

The loader checks for `global.__nitroModules` or `global.NitroModules` before attempting the import, and caches the result so subsequent calls are synchronous.

---

## EAS Build Setup

To build with HealthKit entitlements using EAS Build:

1. **Enable capabilities** in the Apple Developer Portal:
   - App ID → Edit → Capabilities → Health Kit → Enable
   - Check "Background Delivery" under HealthKit options

2. **Configure `eas.json`:**
   ```json
   {
     "build": {
       "production": {
         "ios": {
           "credentialsSource": "remote"
         }
       }
     }
   }
   ```

3. **Run the build:**
   ```bash
   eas build --platform ios --profile production
   ```

   EAS will automatically regenerate the provisioning profile with the HealthKit entitlement.

4. **Verify the entitlement** in the built `.ipa`:
   ```bash
   # Extract and inspect entitlements
   codesign -d --entitlements - YourApp.app
   # Should include:
   # com.apple.developer.healthkit = true
   # com.apple.developer.healthkit.background-delivery = true
   ```

---

## Testing on Device

HealthKit is **not available in the iOS Simulator**. `isHealthDataAvailable()` returns `false` in the Simulator, and all fetchers return empty arrays. Testing requires a physical iPhone.

### TestFlight Testing Checklist

| Test | Expected Result |
|---|---|
| First launch → permission sheet appears | System sheet shows all 20 data types |
| Grant all permissions → Dashboard populates | Banner slides in, data appears within 30 s |
| Add manual BP entry | Entry appears in Apple Health app |
| Add manual blood glucose entry | Entry appears in Apple Health app with meal context |
| Background: add data in Apple Health app | Notification fires within minutes; Dashboard updated on next foreground |
| Settings → HealthKit Permissions | All granted types show green "Authorized" badge |
| Settings → Data Sources | "Last synced" timestamp updates after each background delivery |
| Revoke a permission in iOS Settings → Privacy → Health | Affected card shows "No data" gracefully |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| App crashes on launch (NitroModules error) | Direct `import()` of HealthKit without loader | Use `loadHealthKit()` everywhere |
| `isHealthDataAvailable()` returns `false` | HealthKit entitlement not in provisioning profile | Enable in Apple Developer Portal, rebuild |
| Permission sheet never appears | `hasFired` ref prevents re-trigger | Delete app, reinstall |
| Background delivery not firing | `enableBackgroundDelivery` not called | Ensure `HealthKitBackgroundBridge` is mounted in `_layout.tsx` |
| ECG data empty | `includeVoltages: true` missing | Already set in `fetchHealthKitECG` — check device has Apple Watch Series 4+ |
| Workout distance is `undefined` | Using v12 field `sumQuantity.doubleValue` | Use `totalDistance.quantity` (v13 SDK) |
| Write-back silently fails | HealthKit write permission not granted | Check Settings → Privacy → Health → VitalSync → allow writes |

---

## Privacy

VitalSync's HealthKit usage strings (displayed in the iOS permission sheet) are set in `app.config.ts`:

```ts
NSHealthShareUsageDescription:
  "VitalSync reads the following health data from Apple Health to display and track your vitals: ...",
NSHealthUpdateUsageDescription:
  "VitalSync writes your manually entered health data back to Apple Health, including: ...",
```

All health data is processed on-device. No raw HealthKit data is transmitted to any external server. The Manus Smart analysis layer (when enabled) receives only anonymised statistical summaries — never raw timestamped records.
