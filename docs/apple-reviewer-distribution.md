# VitalSync — Apple App Store Reviewer Distribution Notes

**App Name:** VitalSync  
**Bundle ID:** `space.manus.vitalsync.t20241217105738`  
**Version:** 1.0.3 (Build 15)  
**Platform:** iOS 16.0+  
**Apple Team ID:** ZKJKD74K2N  
**App Store Connect App ID:** 6760296225  
**Category:** Health & Fitness  
**Content Rating:** 4+ (no objectionable content)

---

## App Description (for App Store Connect)

VitalSync is a private, on-device clinical health companion designed by a critical care nurse for patients and families. It helps users track, understand, and communicate their health data — without sending any personal health information to a server.

The app reads from Apple Health, supports manual entry for all major vitals, and generates a shareable PDF health summary formatted for clinical conversations. All data is stored exclusively on the user's device using encrypted local storage.

---

## What the App Does

VitalSync is organised around five main tabs:

**Dashboard (Home)** — The primary screen shows a real-time health overview. It displays tiles for blood pressure, pulse & HRV, blood glucose, weight, sleep, step count, and calories. A "Smart Reminders" section surfaces time-sensitive alerts including upcoming and missed medication doses, upcoming and missed doctor appointments, pre-dose vital check reminders, and vaccine due dates. The dashboard syncs with Apple Health on launch and whenever the user grants permissions.

**Record** — A dual-purpose data entry and clinical records hub. Users can log weight, vitals (blood pressure, heart rate, SpO₂, temperature, respiratory rate), sleep, blood glucose, activity, and nutrition. The Clinical Records section provides dedicated screens for medications, doctor appointments, lab results, immunizations, medical history, and surgical history. Several entry screens support Smart voice dictation (Batch Scribe) for hands-free clinical note entry.

**Analytics** — Displays trend charts and correlations across all logged metrics. Includes a Correlation Engine, Recovery Trend, Health Insights, DASH Diet caloric trend, and sodium/potassium electrolyte tracking. Charts cover 7-day, 30-day, and 90-day windows.

**Doctor Report** — Generates a formatted PDF health summary the user can share with their clinician. The report is configurable (the user selects which sections to include) and supports Smart translation into 17 languages. A CSV export option is also available.

**Settings** — Full configuration panel with collapsible sections: Appearance (dark/light/AMOLED, language), My Profile (age, sex, diet goals, macro targets), Health Data (Apple Health sync, Bluetooth device pairing, data sources), Stored Data (record counts, CSV export, data clear), Privacy & Security (Face ID / PIN lock, Medical ID, consent), Notifications (threshold alerts, reminder schedules), About, and Diagnostics.

---

## Key Features by Screen

### Doctor Appointments (`/log/appointments`)

The appointments screen has three tabs:

| Tab | Content |
|---|---|
| **Upcoming** | Future appointments with countdown chips, Reschedule and Done actions, and a "Confirm Attendance" button that schedules a 24-hour push notification |
| **Missed** | Past appointments (within 30 days) never dismissed, shown with an amber "⚠ Missed · Xd ago" badge, Reschedule and Log Outcome actions |
| **History** | All past appointments, newest first, with colour-coded outcome badges (Attended / Missed / Cancelled / Rebooked) |

The **Reschedule** action opens an edit modal pre-filled with the original appointment details. After saving, a toast confirms the change (e.g., "Cardiology rescheduled to May 15 ✓"). The **Log Outcome** action opens a bottom sheet with four outcome chips and an optional free-text note. Selecting "Rebooked" immediately opens a "Rebook Appointment" form pre-filled with the same doctor, specialty, location, and recurrence — the user only needs to set a new date.

### Medications (`/log/medications` via Record tab)

The medications screen has three tabs: **Today** (doses due now ±30 min, missed doses, skipped doses), **History** (full dose log with reinstate option), and **My Meds** (full medication list with pharmacy, dates, Smart-generated side effect summaries, and FDA interaction checks). When opened via a deep-link from Smart Reminders with `?filter=today`, the Today tab receives a brief pulse animation to draw the user's eye.

### Smart Reminders (Dashboard)

Smart Reminders is a collapsible section on the Dashboard that aggregates all time-sensitive clinical alerts in one place. It surfaces: medication doses due within 30 minutes, pre-dose vital check requirements, missed medication doses from the past 24 hours, upcoming doctor appointments within 48 hours, missed doctor appointments from the past 7 days, and vaccine doses due within 30 days. Each reminder card has contextual action buttons (e.g., Log Vitals, Take Dose, Reschedule, Confirm Attendance) that deep-link directly to the relevant entry screen.

### Lab Tracker (`/labs`)

Supports manual entry and OCR scanning of lab reports. Covers CMP (Comprehensive Metabolic Panel), CBC (Complete Blood Count), magnesium, phosphorus, lipid panel, and HbA1c. Results are displayed with reference ranges and dynamic correlation to other logged vitals.

### Immunizations (`/log/immunizations`)

Tracks vaccine records with lot numbers, administration dates, and next-dose reminders. Includes CDC-recommended schedule lookup and Smart voice scribe for hands-free entry.

### Medical & Surgical History

Separate screens for diagnoses/conditions (with ICD-10 code lookup) and surgical procedures (with CPT codes and anaesthesia notes). Both support Smart voice dictation via the Batch Scribe feature.

---

## Permissions Used

The following system permissions are requested and the purpose of each is described below. All permissions are requested only when the user explicitly initiates the relevant feature.

| Permission | Purpose | When requested |
|---|---|---|
| **Apple Health (Read)** | Reads blood pressure, heart rate, HRV, blood glucose, body mass, body fat %, step count, SpO₂, body temperature, respiratory rate, sleep analysis, active energy, walking/running distance, cycling distance | When user taps "Connect Apple Health" on Dashboard or in Settings → Health Data |
| **Apple Health (Write)** | Writes manually entered vitals back to Apple Health (heart rate, BP, blood glucose, weight, SpO₂, temperature, sleep) | Same permission request as read; no write occurs without explicit user action |
| **Face ID** | Protects app access with biometric authentication | When user enables App Lock in Settings → Privacy & Security |
| **Bluetooth** | Syncs readings from Bluetooth-enabled glucometers, blood pressure monitors, and smart scales | When user taps "Add Bluetooth Device" in Settings → Health Data |
| **Camera** | Scans lab reports and prescriptions using OCR | When user taps the camera icon in Lab Tracker or Batch Scribe |
| **Microphone** | Records voice for Smart clinical note dictation (Batch Scribe) | When user taps the microphone icon in Medical History, Surgical History, or Immunizations entry screens |
| **Push Notifications** | Delivers medication reminders, appointment reminders, vital threshold alerts, and Apple Health background delivery notifications | When user enables reminders in Settings → Notifications or taps "Confirm Attendance" on an appointment |
| **Location (When In Use)** | Used only if the user enables pharmacy location lookup | When user taps "Find Nearby Pharmacy" in Settings → Health Data → Pharmacies |

---

## Data Privacy

VitalSync does not collect, transmit, or store any personal health data on any server. All health records, medication logs, appointment data, and clinical notes are stored exclusively on the user's device using `AsyncStorage` (encrypted by iOS Data Protection). No account creation is required. No analytics SDK is included. The app does not contain advertising.

The only network requests the app makes are:

1. **Apple Health sync** — local on-device framework calls only; no data leaves the device.
2. **Smart voice transcription (Batch Scribe)** — audio is sent to the server-side LLM only when the user explicitly taps the microphone and confirms transcription. The audio is not stored.
3. **PDF translation** — the text content of a generated PDF is sent to the server-side LLM only when the user explicitly taps "Translate Report." The text is not stored.

---

## Demo / Review Account

No account is required to use VitalSync. The app launches directly into the onboarding flow and all features are available immediately without login. To review the full feature set:

1. **Complete onboarding** — tap through the 7-step walkthrough (health overview, data sources, medications, appointments, lab results, immunizations, consent). Tap "Skip setup" to bypass if preferred.
2. **Connect Apple Health** — tap "Connect Apple Health" on the Dashboard. The iOS system permission sheet will appear. Grant all permissions to see live data populated.
3. **Add a medication** — go to Record → Medications → My Meds → "+" to add a prescription. Set a reminder time to see it appear in Smart Reminders and the Today tab.
4. **Add an appointment** — go to Record → Doctor Appointments → "+" to add an upcoming appointment. Use the Missed tab to see past appointments and test the Reschedule and Log Outcome flows.
5. **Generate a report** — go to Doctor Report, toggle the sections you want, and tap "Generate PDF" to produce a formatted health summary.

If Apple Health is not available during review (e.g., on a device without health data), all features remain fully functional using manually entered data. The app degrades gracefully when HealthKit returns no data.

---

## Notes for Reviewers

**HealthKit entitlement:** The `com.apple.developer.healthkit` and `com.apple.developer.healthkit.background-delivery` entitlements are declared in the provisioning profile and enabled in the App ID on Apple Developer Portal. The app requests only the HealthKit data types listed above and does not request access to health records (clinical data).

**Background delivery:** The app registers for HealthKit background delivery for heart rate, blood pressure, blood glucose, SpO₂, body temperature, respiratory rate (immediate frequency) and sleep, body mass, step count, and workouts (hourly frequency). This is used to update dashboard tiles and fire local push notifications when new readings are recorded in Apple Health while the app is backgrounded. No data is sent off-device during background delivery.

**No third-party health APIs:** The app does not integrate with any third-party health data broker, insurance provider, or employer wellness platform.

**Encryption:** `ITSAppUsesNonExemptEncryption` is set to `false`. The app uses only standard iOS Data Protection for local storage, which is provided by the OS and does not constitute export-controlled encryption.

**App Lock / Face ID:** The biometric lock feature uses `expo-local-authentication` and the standard iOS `LAContext` API. It does not store biometric data. The `NSFaceIDUsageDescription` is declared in `Info.plist`.

---

## Build & Submission Details

| Field | Value |
|---|---|
| EAS Build Profile | `production` |
| Distribution | App Store |
| iOS Build Configuration | Release |
| `aps-environment` entitlement | `production` |
| Apple ID | ak82korir@gmail.com |
| App Store Connect App ID | 6760296225 |
| Apple Team ID | ZKJKD74K2N |
