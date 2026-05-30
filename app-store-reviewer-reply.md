# App Store Review Reply — Submission ID aeeff992-94b9-4371-a8d7-fe66d2ff9824

**To:** App Store Review Team**Re:** VitalSync: Clinical Hub — Version 1.0, Build 5**Guidelines addressed:** 2.1(a) App Completeness, 2.5.4 UIBackgroundModes

---

Thank you for the detailed feedback. We have addressed both issues in Build 5 and are resubmitting.

---

## Guideline 2.5.4 — `audio` in UIBackgroundModes

The `audio` entry in `UIBackgroundModes` was unintentionally injected by the `expo-video` Expo config plugin. In the reviewed build (Build 4), `expo-video` was configured with `supportsBackgroundPlayback: true`, which caused its plugin to automatically append `"audio"` to `UIBackgroundModes` during the Xcode prebuild step — even though VitalSync does not use background audio playback.

In Build 5 we have made two changes to prevent this:

1. `expo-video` is now configured with `supportsBackgroundPlayback: false`, which prevents the plugin from injecting `"audio"` entirely.

1. A custom `withNoBackgroundAudio` Expo config plugin runs last in the plugin chain and explicitly removes `"audio"` from `UIBackgroundModes` as a defence-in-depth measure, ensuring no other plugin can re-introduce it.

VitalSync does not play audio in the background. The only audio feature in the app is the Smart Scribe microphone input, which is a foreground-only interaction.

---

## Guideline 2.1(a) — HealthKit Not Enabled on iPad

HealthKit on iPad requires iPadOS 17 or later. The review device (iPad Air 11-inch M3) was running iPadOS 26.3.1 (beta), which should support HealthKit; however, the HealthKit entitlements may not have been correctly provisioned during the EAS-managed workflow prebuild step in Build 4.

In Build 6 we have added a `withHealthKit` Expo config plugin that explicitly injects both `com.apple.developer.healthkit` and `com.apple.developer.healthkit.background-delivery` into the `.entitlements` file during prebuild, ensuring the entitlements survive the EAS cloud build environment.

Additionally, the Health Permissions screen now displays a clear informational banner on iPad devices stating that HealthKit requires iPadOS 17 or later, so users on older iPads receive a clear explanation rather than a blank state.

If HealthKit is still unavailable on the review device, this may indicate a provisioning profile issue specific to the beta iPadOS version. We are happy to provide a TestFlight build for direct verification.

---

We appreciate the thorough review and are committed to resolving these issues. Please let us know if any further clarification is needed.

**VitalSync Development Team**

