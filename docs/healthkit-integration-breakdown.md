# VitalSync — HealthKit Integration & Sync Breakdown

**Prepared for:** Developer handoff  
**App:** VitalSync (Expo SDK 54 · React Native 0.81 · TypeScript 5.9)  
**Bundle ID:** `space.manus.vitalsync.t20241217105738`  
**Apple Team ID:** `ZKJKD74K2N`  
**App Store Connect App ID:** `6760296225`

---

## 1. Overview

VitalSync uses a **dual-bridge HealthKit architecture** on iOS. Two separate native modules are linked in parallel, and the app selects between them at runtime based on availability:

| Bridge | Package | API style | Primary role |
|---|---|---|---|
| **Nitro / JSI bridge** | `@kingstinct/react-native-healthkit@8.7.2` | Promise-based (`requestAuthorization`, `queryQuantitySamples`) | Primary data query path |
| **RCT bridge** | `react-native-health@^1.19.0` | Callback-based (`initHealthKit`, `getHeartRateSamples`) | Fallback when Nitro is unavailable (Expo Go, missing entitlement) |
| **Android** | `react-native-health-connect@^3.5.0` | Promise-based | Health Connect on Android 14+ |

The app **never asks the user to choose** between bridges. The loader layer (`healthkit-loader.ts`, `rnh-loader.ts`) handles selection transparently.

---

## 2. File Map

```
lib/health/
  healthkit-loader.ts          ← Safe loader for @kingstinct (Nitro/JSI bridge)
  rnh-loader.ts                ← Safe loader + initHealthKit() for react-native-health (RCT bridge)
  rnh-fetch.ts                 ← Per-type fetch helpers using the RCT bridge
  native-health-service.ts     ← NativeHealthServiceImpl class + background delivery
  permissions.ts               ← requestHealthPermissions() + fetchHealthData()
  health-context.tsx           ← React context: state, forceSync(), requestPermissions()
  storage.ts                   ← AsyncStorage persistence + schema migrations + mergeById()
  types.ts                     ← All shared TypeScript types (BloodSugarRecord, PulseRecord, …)
  healthkit-background-delivery.ts  ← enableAllBackgroundDelivery() helper

lib/data-sources/adapters/
  healthkit-adapter.ts         ← HealthKitSyncCounts, progress callbacks
  health-connect-adapter.ts    ← Android Health Connect adapter

app/(tabs)/index.tsx           ← Dashboard: calls forceSync() + requestPermissions() on mount
app/settings/healthkit-permissions.tsx  ← Permission details screen
app/settings/healthkit-debug.tsx        ← Debug panel (sync counts, last sync time)
```

---

## 3. Permission Request Flow

### 3.1 What triggers the iOS system sheet

The iOS HealthKit permission sheet is shown **only** by `AppleHealthKit.initHealthKit()` (RCT bridge). The Nitro bridge's `requestAuthorization()` is used as a secondary path. The sequence on first launch is:

```
User taps "Connect Apple Health"
  → handleConnectHealth() in index.tsx
    → requestPermissions() from health-context.tsx
      → requestHealthPermissions() in permissions.ts
        → requestHealthKitPermissions() (iOS path)
          → STEP 1: _requestViaRCT() — calls AppleHealthKit.initHealthKit()
                    ✅ Shows iOS system sheet
                    ✅ Caches _permissionGranted = true on success
          → STEP 2 (fallback): _requestViaFallback() — calls HK.requestAuthorization()
                    Used only if RCT bridge is not linked (Expo Go / missing entitlement)
```

### 3.2 Permission types requested

The following HealthKit types are requested for **read** access. No write permissions are requested.

| Category | HealthKit Type |
|---|---|
| Cardiovascular | `HeartRate`, `HeartRateVariability`, `BloodPressureSystolic`, `BloodPressureDiastolic` |
| Metabolic | `BloodGlucose`, `OxygenSaturation`, `BodyTemperature`, `RespiratoryRate` |
| Body composition | `BodyMass`, `BodyFatPercentage` |
| Activity | `StepCount`, `Workout` |
| Sleep | `SleepAnalysis` |

### 3.3 Info.plist usage descriptions (already in `app.config.ts`)

```
NSHealthShareUsageDescription:
  "VitalSync reads your health data to display trends and support clinical conversations."
NSHealthUpdateUsageDescription:
  "VitalSync may write health data you manually log back to Apple Health."
```

---

## 4. Entitlements

The following entitlements are declared in `app.config.ts` under `ios.entitlements` and are **automatically injected by EAS Build**:

```json
{
  "com.apple.developer.healthkit": true,
  "com.apple.developer.healthkit.background-delivery": true
}
```

> **Critical:** The HealthKit capability **must also be enabled** in Apple Developer Portal under Certificates, Identifiers & Profiles → App IDs → Edit → Capabilities → HealthKit. Without this, the entitlement in the provisioning profile is inactive and `initHealthKit()` will fail silently at runtime. After enabling it, a clean EAS build is required — entitlements cannot be updated OTA.

---

## 5. Data Sync Pipeline

### 5.1 Full sync (foreground)

```
forceSync() called (on mount, on permission grant, or manual tap)
  → fetchHealthData(onProgress) in permissions.ts
    → initAppleHealthKit() — ensures RCT bridge is ready (idempotent)
    → svc.syncAll() — NativeHealthServiceImpl.syncAll()
      → Parallel fetch of all 9 types via Nitro bridge (primary)
        with RCT bridge fallback per type if Nitro returns null
      → Returns NativeHealthSyncResult { bloodPressure, heartRate, sleep, … }
    → mergeHealthData(result) in storage.ts
      → Loads existing data from AsyncStorage (@vitalsync:health_data)
      → Deduplicates by id (new records win)
      → Saves merged result back to AsyncStorage
    → Returns merged HealthData to health-context
  → health-context updates state.data
  → All dashboard tiles re-render
```

### 5.2 Background sync (passive, iOS only)

Background delivery wakes the app when HealthKit has new data for a subscribed type, even when the app is not in the foreground.

```
enableAllBackgroundDelivery() — called once after permissions granted
  → HK.enableBackgroundDelivery() for each type
    Immediate types: HeartRate, BloodPressureSystolic/Diastolic, BloodGlucose,
                     OxygenSaturation, BodyTemperature, RespiratoryRate
    Hourly types:    SleepAnalysis, BodyMass, StepCount, Workout

registerHealthKitObservers() — called once after permissions granted
  → HK.subscribeToChanges() for each type
  → On change: fetches last 24h of data for the changed type
  → Merges into AsyncStorage (same mergeById deduplication)
  → Fires a local push notification summarising new record counts
```

### 5.3 Data storage

All health data is stored **on-device only** using `AsyncStorage` under the key `@vitalsync:health_data`. No health data is sent to any server. The storage layer includes schema versioning and automatic migrations (`storage.ts`).

---

## 6. Dashboard Data Flow

The dashboard tiles read from the central `HealthData` object exposed by `useHealth()`. The canonical data flow is:

```
HealthKit → NativeHealthService.syncAll()
         → fetchHealthData() / mergeHealthData()
         → AsyncStorage (@vitalsync:health_data)
         → health-context state.data
         → useMemo selectors in index.tsx
         → Tile renders
```

### 6.1 Tile → data mapping

| Tile | Source field | Selector |
|---|---|---|
| Blood Pressure | `data.bloodPressure` | Latest record sorted by `timestamp` desc |
| Pulse & HRV | `data.pulse` | Latest record sorted by `timestamp` desc |
| Blood Glucose | `data.bloodSugar` | `latestGlucoseMgDl` — newest `glucoseMgDl` value |
| Weight | `data.bodyComposition` | `latestWeightDisplay` — newest `weightKg`, converted to user's unit preference |
| Sleep | `data.sleep` | Most recent night by `date` |
| Steps | `data.activity` | `todaySteps` — sum of today's `steps` across activity records |
| Calories | `data.activity` | `todayCalories` — sum of today's `caloriesBurned` |
| SpO₂ / Temp | `data.vitalSigns` | Latest record with matching type |

---

## 7. Build Requirements

HealthKit **does not work** in Expo Go or on the iOS Simulator. A physical device with an EAS build is required for all HealthKit testing.

### 7.1 EAS build profiles (`eas.json`)

| Profile | Distribution | Use case |
|---|---|---|
| `development` | Internal (TestFlight / direct install) | Day-to-day development on device |
| `preview` | Internal | QA / stakeholder testing |
| `production` | App Store | Release builds |

### 7.2 Build commands

```bash
# Development build (physical device, debug)
eas build --platform ios --profile development

# Preview build (physical device, release config)
eas build --platform ios --profile preview

# Production build (App Store submission)
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

### 7.3 Pre-build checklist

Before triggering any EAS build that requires HealthKit:

- [ ] HealthKit capability enabled in Apple Developer Portal (App ID → Edit → Capabilities)
- [ ] Push Notifications capability enabled (required for background delivery notifications)
- [ ] Bundle ID matches `space.manus.vitalsync.t20241217105738`
- [ ] Team ID `ZKJKD74K2N` is active and the provisioning profile is up to date
- [ ] `eas.json` `submit.production.ios` fields are correct (`appleId`, `ascAppId`, `appleTeamId`)

---

## 8. Diagnosing Empty Sync Results

If `syncAll()` returns all-zero counts, the following are the most common causes in order of likelihood:

| Cause | How to confirm | Fix |
|---|---|---|
| Running in Expo Go or Simulator | Check `Platform.OS === 'ios'` and `isRNHAvailable()` returns false | Use an EAS dev build on a physical device |
| HealthKit entitlement not active | `initHealthKit()` callback returns an error string | Enable HealthKit in Apple Developer Portal, rebuild |
| User denied permissions | Check Settings → Privacy & Security → Health → VitalSync | Re-prompt via `requestPermissions()` or guide user to Settings |
| Apple Health has no data for the queried period | Open Health app manually and verify data exists | Widen the `since` date window or add test data in Health app |
| RCT bridge not linked | `isRNHAvailable()` returns false | Ensure `react-native-health` is in `package.json` and rebuild |

The app logs detailed diagnostics to the console for each of these cases. Enable Metro logs (`npx expo start --dev-client`) and filter for `[HealthKit]` and `[RNH]` prefixes.

---

## 9. Key Gotchas

**`initHealthKit()` must be called before every data query on cold launch.** Even if the user already granted permissions in a previous session, the RCT bridge requires `initHealthKit()` to be called again on each app launch before any `getSamples` / `getHeartRateSamples` call. The app handles this in `fetchHealthData()` via the idempotent `initAppleHealthKit()` helper.

**Sort results newest-first before reading `[0]`.** HealthKit returns samples in oldest-first order by default. All fetch results in the dashboard init `useEffect` are now sorted by `timestamp` / `startDate` descending before the first element is read.

**`react-native-health` uses CommonJS `module.exports`, not ES module `default`.** Do not use `import HealthKit from 'react-native-health'` — use `const HealthKit = require('react-native-health')` and call `HealthKit.initHealthKit()` directly. The `.default` property is `undefined` for this package.

**Background delivery requires a real device and a production-signed build.** `enableBackgroundDelivery()` will throw silently on the simulator and in Expo Go.

---

## 10. Contact & References

| Resource | Location |
|---|---|
| HealthKit loader | `lib/health/healthkit-loader.ts` |
| RCT bridge loader | `lib/health/rnh-loader.ts` |
| Full sync orchestrator | `lib/health/permissions.ts` → `fetchHealthData()` |
| Background delivery | `lib/health/native-health-service.ts` → `registerHealthKitObservers()` |
| All TypeScript types | `lib/health/types.ts` |
| Debug screen (in-app) | Settings → HealthKit Debug |
| EAS build config | `eas.json` |
| Apple Developer Portal | [developer.apple.com](https://developer.apple.com) → App IDs → `space.manus.vitalsync.t20241217105738` |
