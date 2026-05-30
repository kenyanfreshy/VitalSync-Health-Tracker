# VitalSync: Clinical Hub — Apple App Store Distribution Package

> **Document purpose:** This package contains every field, disclosure, and compliance note required to submit **VitalSync: Clinical Hub** to the Apple App Store via App Store Connect. It is structured in the same order that App Store Connect presents information during submission. All sections are ready to copy and paste directly into the corresponding fields.

---

## 1. App Identity

| Field | Value |
|---|---|
| **App Name** | VitalSync: Clinical Hub |
| **Bundle ID** | `com.myvitalsyncclinicalhub.vitalsync` |
| **SKU** | `VITALSYNC-CLINICAL-HUB-1` |
| **Primary Language** | English (U.S.) |
| **Platform** | iOS |
| **Version** | 1.1.0 |
| **Build** | *(assigned by Xcode / EAS Build at upload time)* |

---

## 2. App Store Connect — Version Information

### 2.1 App Name (30 characters max)

```
VitalSync: Clinical Hub
```

### 2.2 Subtitle (30 characters max)

```
Your Private Health Dashboard
```

### 2.3 Description (4,000 characters max)

```
VitalSync: Clinical Hub is your all-in-one personal health command center — built from the ground up with one non-negotiable principle: your health data never leaves your device.

WHAT VITALSYNC DOES
• Tracks blood pressure, heart rate, HRV, SpO₂, blood glucose, weight, body fat, sleep, activity, and temperature — all in one place.
• Reads from and writes to Apple Health (HealthKit), so your data stays inside Apple's secure ecosystem.
• Generates a shareable Doctor Report PDF that you control — it is created locally and only leaves your device when you explicitly tap Share.
• Analyzes ECG strips using on-device AI — no image is ever uploaded.
• Provides a Nutrition Smart Culinary Hub with evidence-based macro and calorie tracking, weekly adherence graphs, and Meal IQ insights.
• Tracks medications, side effects, surgical history, medical history, and lab results in a secure clinical record.
• Offers a Correlation Engine that surfaces relationships between your vitals, sleep, nutrition, and activity — all computed on-device.

YOUR DATA, YOUR RULES
VitalSync does not collect, transmit, or store any personal health information on external servers. There is no account required, no cloud sync, and no server-side processing of your health data. Every reading, every record, and every insight lives exclusively on your iPhone. You can delete all your data at any time from Settings → Privacy → Data & Privacy.

PRIVACY BY DESIGN
• No account required — no email, no password, no sign-up.
• No advertising, no analytics SDKs, no third-party data sharing.
• No data leaves your device unless you explicitly share a PDF or export a file.
• HealthKit data is governed by Apple's strict HealthKit privacy rules and is never used for marketing or advertising.
• All on-device Smart processing uses Apple's Neural Engine — no cloud API calls.

CLINICAL RECORD FEATURES
• Medical History — diagnoses, conditions, and chronic illness tracking.
• Surgical History — procedure records with dates and notes.
• Medications & Side Effects — dosage tracking and adverse reaction logging.
• Lab Results — CBC, metabolic panel, lipid panel, thyroid, and custom lab values.
• ECG Scan — photograph your ECG strip for on-device Smart pattern analysis.

HEALTH MONITORING
• Blood Pressure with AHA classification (Normal / Elevated / Stage 1 / Stage 2 / Crisis).
• Blood Glucose with projected A1C estimation and 7-day / 30-day trend analysis.
• Vitals Dashboard with average BP, average HR, and reading count for any date range.
• Sleep tracking with bedtime / wake-time logging and duration analysis.
• Activity tracking with step count, distance, and active calories.

IMPORTANT MEDICAL DISCLAIMER
VitalSync is a personal health tracking tool and is not a medical device. It is not intended to diagnose, treat, cure, or prevent any disease or medical condition. The information provided by this app is for informational and educational purposes only. Always consult a qualified healthcare professional before making any medical decisions. Do not use this app as a substitute for professional medical advice, diagnosis, or treatment.

SYSTEM REQUIREMENTS
• iPhone running iOS 16.0 or later.
• Apple Health (HealthKit) access is optional but recommended for automatic data import.
• Camera access is optional and used only for ECG strip scanning and lab report capture.

VitalSync is free to download and use. There are no subscriptions, no in-app purchases, and no hidden fees.
```

### 2.4 Keywords (100 characters max, comma-separated, no spaces after commas)

```
health,vitals,blood pressure,glucose,ECG,HealthKit,clinical,medical,heart rate,sleep,nutrition
```

> **ASO note:** The app name and subtitle already contain "VitalSync," "Clinical," "Hub," "Private," "Health," and "Dashboard" — do not repeat these in the keyword field, as Apple's algorithm already indexes them.

### 2.5 Promotional Text (170 characters max — can be updated without a new submission)

```
Your health data stays on your device. No servers, no accounts, no data sharing. Track vitals, medications, labs, and nutrition — all private, all local.
```

### 2.6 What's New in This Version (4,000 characters max)

```
Version 1.1.0

• Privacy-first redesign: every clinical screen now displays a clear "Stays on Your Device" banner, so you always know your data never leaves your iPhone.
• Data & Privacy settings screen: a new dedicated page explains exactly what is stored locally, what can leave your device only when you explicitly share it, and how to delete everything in one tap.
• Blood Sugar improvements: projected A1C card and history list now scroll seamlessly together; new 7-day and 30-day date-range filters with an average / min / max stats bar.
• Vitals screen: same 7-day / 30-day filter with an average blood pressure and average heart rate stats bar.
• Swipe-to-delete on Blood Sugar history rows.
• Onboarding consent: "I understand" acknowledgement checkbox is now required before monitoring begins, with a direct link to the Data & Privacy screen.
• Terms of Use link fixed in Settings.
• Minor performance improvements and bug fixes.
```

---

## 3. App Store Connect — App Information

| Field | Value |
|---|---|
| **Primary Category** | Health & Fitness |
| **Secondary Category** | Medical |
| **Content Rights** | This app does not contain, show, or access third-party content. |
| **Age Rating** | 12+ *(see Section 4 for full age rating questionnaire answers)* |

---

## 4. Age Rating Questionnaire

Apple's age rating questionnaire must be completed in App Store Connect. The correct answers for VitalSync are as follows.

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | **Infrequent/Mild** |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Unrestricted Web Access | None |
| Gambling and Contests | None |

**Resulting Age Rating:** 12+

> The "Medical/Treatment Information" flag is set to Infrequent/Mild because the app displays health metric classifications (e.g., AHA blood pressure categories) and Smart-generated ECG pattern notes. The app's medical disclaimer is prominently displayed on all relevant screens and in the App Store description.

---

## 5. Privacy Nutrition Label (App Privacy)

Apple requires every developer to declare their app's data practices in App Store Connect before submission. VitalSync's declaration is as follows.

### 5.1 Primary Declaration

**VitalSync does not collect any data.**

> In App Store Connect, under **App Privacy → Data Collection**, select **"No, we do not collect data from this app."** This will display the "No Data Collected" label on the App Store product page.

### 5.2 Basis for "No Data Collected" Declaration

Apple defines "collect" as transmitting data off the device in a way that allows the developer or third-party partners to access it for longer than is necessary to service a real-time request. VitalSync satisfies the "No Data Collected" standard for the following reasons.

All health, fitness, clinical, and personal data entered by the user — including blood pressure readings, blood glucose values, ECG scans, medications, surgical history, medical history, lab results, nutrition logs, sleep records, and activity data — is stored exclusively in the device's local AsyncStorage and Apple HealthKit. None of this data is transmitted to any server operated by the developer or any third party.

The app does not integrate any analytics SDKs (e.g., Firebase Analytics, Mixpanel, Amplitude), advertising networks, crash reporting services (e.g., Sentry, Crashlytics), or any other third-party SDK that transmits data off the device. The app's bundled server component (`server/_core/index.ts`) serves only static legal pages (`/terms`, `/privacy`) and does not receive, process, or store any user health data.

The Doctor Report PDF is generated entirely on-device using local data. It is only transmitted when the user explicitly taps the system Share button — at which point it leaves the device via the iOS system share sheet under the user's full control. This constitutes user-initiated sharing, not developer data collection.

HealthKit data accessed via the HealthKit API is governed by Apple's HealthKit privacy rules (App Review Guideline 5.1.3(vi)) and is never used for marketing, advertising, or data mining.

### 5.3 Third-Party SDK Audit

| SDK / Library | Data Transmitted Off-Device? | Notes |
|---|---|---|
| React Native / Expo SDK 54 | No | Framework only; no telemetry in production builds |
| NativeWind / Tailwind CSS | No | Styling library; no network calls |
| expo-haptics | No | Device-only haptic feedback |
| expo-audio | No | Local audio playback only |
| expo-keep-awake | No | Device-only screen wake lock |
| expo-image | No | Local image rendering |
| react-native-gesture-handler | No | Device-only gesture recognition |
| react-native-reanimated | No | Device-only animation engine |
| react-native-svg | No | Device-only SVG rendering |
| @react-native-async-storage | No | Local on-device storage only |
| expo-secure-store | No | Local iOS Keychain storage only |
| expo-notifications | No | Local notifications only; no remote push server used |
| expo-router | No | Navigation library; no network calls |
| TanStack Query | No | Data-fetching library; only queries local data in this app |
| tRPC | No | API client; only used for local server static page serving |
| Zod | No | Schema validation library; no network calls |

**No third-party SDK in VitalSync transmits user data off the device.**

---

## 6. Privacy Policy URL

A privacy policy is **required** for all apps that access HealthKit data. VitalSync's privacy policy is hosted at:

```
https://vitalsync-gafxdnzk.manus.space/privacy
```

This URL must be entered in the **Privacy Policy URL** field in App Store Connect under **App Information**.

The privacy policy must remain live and accessible at this URL at all times. It is served by the app's built-in Express server and is always available when the app is deployed.

---

## 7. Terms of Use URL (Optional but Recommended)

```
https://vitalsync-gafxdnzk.manus.space/terms
```

Enter this in the **Terms of Use URL** field in App Store Connect (optional field under App Information).

---

## 8. App Review Information

App Store reviewers may need additional context to approve the app. The following information should be entered in the **App Review Information** section of App Store Connect.

### 8.1 Notes for App Review

```
VitalSync: Clinical Hub is a personal health tracking app that stores all data exclusively on the user's device. There is no user account, no login, and no server-side data processing.

KEY REVIEW NOTES:

1. NO ACCOUNT REQUIRED — The app does not require sign-in. Reviewers can use the app immediately after onboarding (tap "Skip setup" on the first screen to bypass onboarding, or complete the 6-slide onboarding flow).

2. HEALTHKIT ACCESS — The app requests HealthKit read/write permissions. On the iOS Simulator, HealthKit is not available; please review on a physical iPhone. The app gracefully handles the absence of HealthKit data by displaying "No data available" states.

3. CAMERA ACCESS — The app requests camera access for the ECG Scan feature (Settings → ECG Scan) and for scanning lab reports. This is optional; the app is fully functional without camera access.

4. BLUETOOTH ACCESS — The app requests Bluetooth access for syncing readings from glucometers, blood pressure monitors, and smart scales. This is optional; the app is fully functional without Bluetooth.

5. FACE ID / LOCAL AUTHENTICATION — The app uses Face ID to protect access to health data. This is optional; the app falls back to a PIN or no lock if Face ID is unavailable.

6. MEDICAL DISCLAIMER — The app displays a medical disclaimer on all clinical screens and in the onboarding consent slide. The disclaimer states that VitalSync is not a medical device and does not provide medical advice.

7. DATA PRIVACY — All health data is stored locally using AsyncStorage and HealthKit. No data is transmitted to any server. The "Data & Privacy" screen (Settings → Privacy → Data & Privacy) explains this in detail.

8. ECG FEATURE — The ECG Scan feature uses on-device AI to analyze ECG strip photographs. It does not upload images to any server. The feature includes a prominent disclaimer that it does not provide a medical diagnosis.

9. DEMO MODE — No demo account is needed. The app works fully offline with manually entered data. Reviewers may enter any test values.
```

### 8.2 Demo Account

Not applicable. VitalSync does not require a user account.

### 8.3 Contact Information for App Review

| Field | Value |
|---|---|
| **First Name** | *(Developer's first name)* |
| **Last Name** | *(Developer's last name)* |
| **Phone Number** | *(Developer's phone number with country code)* |
| **Email** | *(Developer's email address)* |

---

## 9. HealthKit Entitlement Justification

Apple requires developers to justify their use of HealthKit in the App Review notes and in the entitlement request. The following justification should be submitted when requesting the HealthKit entitlement in the Apple Developer Portal.

### 9.1 HealthKit Read Access — Justification

VitalSync reads the following HealthKit data types to display the user's health history and trends within the app. All data is read locally and is never transmitted off the device.

| HealthKit Data Type | Purpose |
|---|---|
| `HKQuantityTypeIdentifierBloodPressureSystolic` | Display and track blood pressure readings |
| `HKQuantityTypeIdentifierBloodPressureDiastolic` | Display and track blood pressure readings |
| `HKQuantityTypeIdentifierHeartRate` | Display and track heart rate |
| `HKQuantityTypeIdentifierRestingHeartRate` | Display resting heart rate on the Dashboard |
| `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | Display HRV trends |
| `HKQuantityTypeIdentifierBloodGlucose` | Display and track blood glucose and projected A1C |
| `HKQuantityTypeIdentifierBodyMass` | Display and track body weight |
| `HKQuantityTypeIdentifierBodyFatPercentage` | Display body composition |
| `HKQuantityTypeIdentifierHeight` | Used for BMI and BMR calculations |
| `HKQuantityTypeIdentifierStepCount` | Display daily step count |
| `HKQuantityTypeIdentifierOxygenSaturation` | Display SpO₂ readings |
| `HKQuantityTypeIdentifierBodyTemperature` | Display body temperature readings |
| `HKQuantityTypeIdentifierRespiratoryRate` | Display respiratory rate |
| `HKCategoryTypeIdentifierSleepAnalysis` | Display sleep duration and quality |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | Display active calories burned |
| `HKQuantityTypeIdentifierDistanceWalkingRunning` | Display walking/running distance |
| `HKQuantityTypeIdentifierDistanceCycling` | Display cycling distance |
| `HKCorrelationTypeIdentifierBloodPressure` | Aggregate blood pressure correlation data |
| `HKDataTypeIdentifierElectrocardiogram` | Display ECG data from Apple Watch |

### 9.2 HealthKit Write Access — Justification

VitalSync writes manually entered health data back to HealthKit so that it is available in the Apple Health app and other HealthKit-compatible apps.

| HealthKit Data Type | Purpose |
|---|---|
| `HKQuantityTypeIdentifierHeartRate` | Write manually entered heart rate readings |
| `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | Write manually entered HRV readings |
| `HKQuantityTypeIdentifierBloodPressureSystolic` | Write manually entered blood pressure |
| `HKQuantityTypeIdentifierBloodPressureDiastolic` | Write manually entered blood pressure |
| `HKQuantityTypeIdentifierBloodGlucose` | Write manually entered blood glucose |
| `HKQuantityTypeIdentifierBodyMass` | Write manually entered body weight |
| `HKQuantityTypeIdentifierBodyFatPercentage` | Write manually entered body fat percentage |
| `HKQuantityTypeIdentifierHeight` | Write manually entered height |
| `HKQuantityTypeIdentifierStepCount` | Write manually entered step count |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | Write manually entered active calories |
| `HKQuantityTypeIdentifierOxygenSaturation` | Write manually entered SpO₂ readings |
| `HKQuantityTypeIdentifierBodyTemperature` | Write manually entered body temperature |
| `HKCategoryTypeIdentifierSleepAnalysis` | Write manually entered sleep records |

---

## 10. iOS Permission Strings (Info.plist)

These strings are already configured in `app.config.ts` and will be injected into the app's `Info.plist` automatically during the EAS Build process. They are listed here for reference and compliance verification.

| Permission Key | String |
|---|---|
| `NSHealthShareUsageDescription` | VitalSync reads the following health data from Apple Health to display and track your vitals: blood pressure (systolic and diastolic), heart rate, resting heart rate, heart rate variability (HRV), blood glucose, body mass (weight), body fat percentage, height, step count, oxygen saturation (SpO₂), body temperature, ECG (electrocardiogram), respiratory rate, sleep analysis, active energy burned, walking/running distance, and cycling distance. |
| `NSHealthUpdateUsageDescription` | VitalSync writes your manually entered health data back to Apple Health, including: heart rate, heart rate variability (HRV), blood pressure (systolic and diastolic), blood glucose, body mass (weight), body fat percentage, height, step count, active energy burned, oxygen saturation (SpO₂), body temperature, and sleep analysis. |
| `NSFaceIDUsageDescription` | VitalSync uses Face ID to protect access to your personal health data. |
| `NSCameraUsageDescription` | VitalSync uses the camera to scan lab reports, prescriptions, and ECG strips. |
| `NSBluetoothAlwaysUsageDescription` | VitalSync uses Bluetooth to sync readings from your glucometer, blood pressure monitor, and smart scale. |
| `NSBluetoothPeripheralUsageDescription` | VitalSync uses Bluetooth to sync readings from your health devices. |
| `ITSAppUsesNonExemptEncryption` | `false` — The app does not implement any custom encryption beyond what is provided by the iOS operating system. |

---

## 11. Export Compliance

| Question | Answer |
|---|---|
| Does the app use encryption? | **No** — The app relies entirely on iOS system encryption (Data Protection). It does not implement any proprietary or non-standard encryption algorithms. |
| Is the app exempt from export compliance documentation? | **Yes** — The app qualifies for the exemption under US Export Administration Regulations (EAR) EAR99 because it uses only standard OS-level encryption and does not implement any encryption for purposes other than data protection. |
| `ITSAppUsesNonExemptEncryption` in Info.plist | Set to `false` — this eliminates the annual self-classification report requirement. |

---

## 12. App Store Review Guidelines Compliance Checklist

The following checklist maps VitalSync's features to the relevant App Store Review Guidelines to confirm compliance before submission.

| Guideline | Requirement | VitalSync Status |
|---|---|---|
| **1.4.1** | Medical apps must clearly disclose data and methodology; must not claim to diagnose | ✅ Medical disclaimer on all clinical screens and in App Store description |
| **1.4.1** | Apps should remind users to check with a doctor | ✅ Disclaimer text on every clinical screen and in onboarding consent slide |
| **2.5.1** | Apps must use HealthKit for health/fitness purposes and integrate with the Health app | ✅ HealthKit used exclusively for health tracking; integrates with Apple Health |
| **2.5.18** | No behavioral advertising based on health/medical data | ✅ No advertising of any kind in the app |
| **5.1.1** | Apps in healthcare must be submitted by a legal entity | ⚠️ If submitted by an individual developer, note that the app is a personal tracking tool, not a clinical service provider |
| **5.1.2(i)** | Must not transmit personal data without user permission | ✅ No data is transmitted; all data is local |
| **5.1.3(i)** | Health data may not be used for advertising or data mining | ✅ No advertising; no data mining; no third-party data sharing |
| **5.1.3(ii)** | Must not write false data to HealthKit; must not store health data in iCloud | ✅ Only user-entered data is written to HealthKit; no iCloud storage |
| **5.1.5(i)** | Must provide a privacy policy | ✅ Privacy policy at `https://vitalsync-gafxdnzk.manus.space/privacy` |
| **5.1.5(ii)** | Must offer account deletion if accounts are supported | ✅ No accounts; "Delete All My Data" available in Data & Privacy settings |
| **4.0** | Apps must not be a thin wrapper around a website | ✅ Full native app with HealthKit, camera, Bluetooth, and local Smart features |
| **2.1** | App must be fully functional | ✅ All features functional without any external service dependency |

---

## 13. Medical Disclaimer (In-App Text — Reference Copy)

The following disclaimer text is displayed on all clinical screens within the app and must remain present in all future versions.

> **Medical Disclaimer:** VitalSync is a personal health tracking tool and is not a medical device. It is not intended to diagnose, treat, cure, or prevent any disease or medical condition. The information provided by this app is for informational and educational purposes only. Always consult a qualified healthcare professional before making any medical decisions. Do not use this app as a substitute for professional medical advice, diagnosis, or treatment.

---

## 14. Data Ownership & Privacy Disclaimer (In-App Text — Reference Copy)

The following privacy statement is displayed on all clinical data-entry and record screens within the app.

> **Your data stays on your device.** VitalSync does not collect, transmit, or store your health information on any external server. Your clinical records, medical history, surgical history, medications, lab results, and all other health data are stored exclusively on this iPhone. No server. No cloud. No data sharing. You have full control of your information. You can delete all your data at any time from Settings → Privacy → Data & Privacy.

---

## 15. App Store Screenshots and Preview Requirements

Apple requires screenshots for every device size you support. The minimum required set for a universal iPhone app is as follows.

| Device | Screen Size | Required |
|---|---|---|
| iPhone 16 Pro Max (or 6.9" display) | 1320 × 2868 px | **Required** |
| iPhone 16 Pro (or 6.3" display) | 1206 × 2622 px | Optional (inherits from 6.9") |
| iPhone SE 3rd gen (or 4.7" display) | 750 × 1334 px | Optional |
| iPad Pro 13" (M4) | 2064 × 2752 px | Required if iPad is supported |

**Screenshot content recommendations for VitalSync:**

1. **Dashboard** — Show the vitals summary cards with blood pressure, heart rate, and blood glucose widgets.
2. **Privacy Banner** — Show the "Stays on Your Device" banner on the Medical History or Clinical Records screen to reinforce the privacy-first message.
3. **Blood Sugar Screen** — Show the Projected A1C card and the 7-day stats bar.
4. **Doctor Report** — Show the PDF preview with the privacy badge ("Created on-device · only leaves when you share").
5. **Data & Privacy Screen** — Show the "We Never" list to reinforce the no-server, no-collection promise.

---

## 16. Submission Checklist

Complete every item in this checklist before clicking **Submit for Review** in App Store Connect.

- [ ] App name, subtitle, description, keywords, and promotional text entered in all supported locales
- [ ] What's New text entered for version 1.1.0
- [ ] Primary category set to **Health & Fitness**, secondary to **Medical**
- [ ] Age rating questionnaire completed (result: **12+**)
- [ ] Privacy Nutrition Label set to **"No Data Collected"**
- [ ] Privacy Policy URL entered: `https://vitalsync-gafxdnzk.manus.space/privacy`
- [ ] Terms of Use URL entered: `https://vitalsync-gafxdnzk.manus.space/terms`
- [ ] App Review notes entered (Section 8.1 of this document)
- [ ] Export compliance answered: **No non-exempt encryption** (`ITSAppUsesNonExemptEncryption = false`)
- [ ] Screenshots uploaded for 6.9" iPhone display (minimum)
- [ ] App icon (1024 × 1024 px, no alpha channel, no rounded corners) uploaded
- [ ] HealthKit capability enabled in Apple Developer Portal under Certificates, IDs & Profiles → App ID
- [ ] Push Notifications capability enabled in Apple Developer Portal (required for `aps-environment` entitlement)
- [ ] Distribution certificate and App Store provisioning profile valid and not expired
- [ ] Build uploaded via EAS Build (`eas build --platform ios --profile production`) or Xcode
- [ ] Build processed and visible in App Store Connect → TestFlight before submitting for review
- [ ] Privacy policy page live and accessible at the declared URL
- [ ] Terms of Use page live and accessible at the declared URL
- [ ] All in-app medical disclaimers present on clinical screens
- [ ] All in-app privacy banners present on clinical data-entry screens

---

## 17. References

The following Apple documentation was used to prepare this package.

| # | Source |
|---|---|
| [1] | [App Store Review Guidelines (February 6, 2026)](https://developer.apple.com/app-store/review/guidelines/) |
| [2] | [App Privacy Details on the App Store](https://developer.apple.com/app-store/app-privacy-details/) |
| [3] | [Creating Your Product Page — App Store](https://developer.apple.com/app-store/product-page/) |
| [4] | [App Store Category Definitions](https://developer.apple.com/app-store/categories/) |
| [5] | [Age Ratings Values and Definitions — App Store Connect](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) |
| [6] | [HealthKit — Apple Developer Documentation](https://developer.apple.com/documentation/healthkit) |
| [7] | [Requesting Permission to Use HealthKit](https://developer.apple.com/documentation/healthkit/setting_up_healthkit/requesting_permission_to_read_and_share_healthkit_data) |
| [8] | [Overview of Submitting for Review — App Store Connect](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/overview-of-submitting-for-review/) |

---

*Prepared by Manus AI · VitalSync: Clinical Hub v1.1.0 · March 2026*
