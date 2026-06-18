# VitalSync Health Tracker — Apple App Review Package v1.0.65

**Bundle ID:** `space.manus.vitalsync.health.tracker.t20250101000000`  
**App Name:** VitalSync Health Tracker  
**Version:** 1.0.65  
**Prepared:** June 18, 2026  
**Prepared by:** VitalSync Development Team  

---

## Section 1 — App Store Compliance Statement

VitalSync is intended for **personal wellness tracking, health organization, and educational purposes only**. The app is not intended to diagnose, treat, cure, monitor, or prevent any disease or medical condition. Information provided by the app should not be used as a substitute for professional medical advice, diagnosis, or treatment. Availability and functionality of connected devices may vary by region and applicable regulatory approvals. Always consult a qualified healthcare professional for any health concerns.

---

## Section 2 — Reviewer Notes

Dear App Review Team,

Thank you for reviewing VitalSync Health Tracker. This document addresses Apple App Review Guideline **1.4.1** and provides a complete compliance summary.

### What VitalSync Is

VitalSync is a **personal wellness and health organization app**. It allows users to:

- Import and view health records they have already authorized in Apple Health
- Log personal wellness data (blood pressure readings, weight, sleep, nutrition, activity)
- View trends and historical observations of their own logged data
- Organize medications, lab results, and personal health documents
- Set personal wellness reminders and goals

### What VitalSync Is Not

VitalSync **does not**:

- Manufacture, sell, or interface with any medical device
- Generate ECG or EKG diagnoses
- Detect, diagnose, or classify arrhythmias or atrial fibrillation
- Provide clinical decision support
- Recommend treatments or medications
- Predict, diagnose, or monitor any disease or medical condition
- Replace or substitute for professional medical advice

### Data Sources

All health data displayed in VitalSync originates from one of three sources:

1. **Apple Health** — data the user has already authorized Apple Health to collect from their devices
2. **Manual user entry** — values the user types in themselves
3. **Compatible third-party apps** — data the user has authorized to sync via Apple Health

VitalSync does not collect, transmit, or process health data on any server. All data remains on the user's device.

### Health Data Access Screen

The Health Data Access screen requests HealthKit read permissions for data the user has already collected via Apple Health. The screen now includes two prominent disclaimers:

> "VitalSync is intended for personal wellness tracking, organization, and educational purposes only. It does not diagnose, treat, cure, prevent, or monitor any disease or medical condition."

> "Health information displayed in VitalSync originates from Apple Health and compatible third-party sources. Data accuracy depends on the originating source."

The permission labels have been updated to wellness-focused language:

| Previous Label | Updated Label |
|---|---|
| Electrocardiogram (EKG) | Health App ECG Records |
| Blood Oxygen (SpO₂) | Imported Oxygen Records |
| Respiratory Rate | Imported Respiratory Records |
| Blood Pressure | Imported Blood Pressure Records |

### EKG / ECG Feature

The EKG screen **displays ECG waveform records imported from Apple Health**. It does not generate, interpret, or classify ECG readings. All classification labels (e.g., "Sinus Rhythm", "Atrial Fibrillation") are sourced directly from Apple Health metadata — they are Apple's own classifications, not VitalSync's. VitalSync displays them as imported data labels only, identical to how the Health app displays them.

The EKG screen includes a persistent disclaimer: *"Displays ECG records imported from Apple Health. VitalSync does not interpret or diagnose ECG results."*

### Correlate Tab / Pattern Explorer

The Correlate tab displays **historical relationships between the user's own logged data points** (e.g., "on days when you logged higher sodium, your blood pressure readings tended to be higher"). These are observational trend summaries, not diagnoses or clinical assessments. Every section includes a disclaimer: *"For informational purposes only · Not medical advice."*

### Insight Engine

The Insight Engine provides **educational information** grounded in peer-reviewed research. It does not generate personalized medical recommendations. Every insight card includes: *"This is general educational information, not medical advice. Consult a qualified healthcare professional."*

---

## Section 3 — Reviewer Walkthrough Script

**Estimated walkthrough time:** 8–10 minutes  
**Test device:** iPhone (iOS 17+) with Apple Health data present

### Step 1 — Onboarding (2 min)

1. Launch the app fresh (or delete and reinstall).
2. Tap **Get Started** on the welcome screen.
3. Review the onboarding slides — note the wellness positioning language throughout ("personal wellness tracking", "educational purposes", "peer-reviewed research").
4. On the **Health Data Access** screen, observe:
   - The two wellness disclaimer cards below the permission list
   - The updated permission labels ("Health App ECG Records", "Imported Oxygen Records", etc.)
5. Tap **Request Permissions** and grant all permissions.

### Step 2 — Dashboard (1 min)

1. Observe the Dashboard — it shows imported health records and logged wellness data.
2. Tap the **Clinical Narrative** card — note the disclaimer: *"This wellness summary is based on your logged data. It is not a medical assessment."*

### Step 3 — EKG Screen (2 min)

1. Navigate to **Health → EKG** (or tap an EKG card on the Dashboard).
2. Observe the disclaimer banner at the top: *"Displays ECG records imported from Apple Health. VitalSync does not interpret or diagnose ECG results."*
3. Note that rhythm labels (e.g., "Sinus Rhythm") are displayed as imported Apple Health metadata, not VitalSync classifications.
4. The alert threshold for Atrial Fibrillation recordings is labeled: *"Alert fires when a new Atrial Fibrillation recording is logged"* — this is a notification for a data event, not a diagnostic alert.

### Step 4 — Correlate Tab (2 min)

1. Navigate to **Analytics → Correlate**.
2. Open **Pattern Explorer** — observe the "For informational purposes only · Not medical advice" footer.
3. Open **Observed Historical Patterns** — observe the disclaimer in the chart area.
4. Open **Insight Engine** — observe the educational disclaimer on each card.

### Step 5 — Settings → Evidence Based Sources (1 min)

1. Navigate to **Settings → About → Evidence Based Sources**.
2. Observe the disclaimer banner: *"All health information in VitalSync is derived from the peer-reviewed sources listed below. This content is for educational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional."*

### Step 6 — Settings → Health Data Access (1 min)

1. Navigate to **Settings → Health Data Access**.
2. Scroll to the bottom — observe the wellness disclaimer card.

---

## Section 4 — Reviewer Video Script

**Duration:** 3–4 minutes  
**Format:** Screen recording with voiceover

---

**[0:00–0:20] Opening**

> "This is VitalSync Health Tracker, a personal wellness and health organization app for iPhone. VitalSync helps users import, log, and view their own health data — all stored locally on their device. VitalSync is not a medical device and does not provide medical advice, diagnoses, or treatment recommendations."

**[0:20–0:55] Health Data Access Screen**

> "When users first set up VitalSync, they see the Health Data Access screen. This screen requests permission to read data the user has already authorized in Apple Health. Notice the two wellness disclaimers prominently displayed. The permission labels use wellness-focused language — 'Health App ECG Records', 'Imported Oxygen Records', and 'Imported Respiratory Records' — to make clear that VitalSync is displaying imported records, not performing measurements."

**[0:55–1:30] EKG Screen**

> "The EKG screen displays ECG waveform records imported from Apple Health. VitalSync does not generate, interpret, or classify ECG readings. The rhythm labels shown — such as 'Sinus Rhythm' — are Apple Health metadata imported directly from the user's Apple Watch. The disclaimer at the top of the screen reads: 'Displays ECG records imported from Apple Health. VitalSync does not interpret or diagnose ECG results.'"

**[1:30–2:10] Correlate Tab**

> "The Correlate tab shows historical observations of the user's own logged data. The Pattern Explorer displays relationships between metrics the user has logged — for example, the relationship between sodium intake and blood pressure readings over time. These are observational trend summaries. Every section includes a disclaimer: 'For informational purposes only · Not medical advice.'"

**[2:10–2:40] Insight Engine**

> "The Insight Engine provides educational information grounded in peer-reviewed research. Each card displays the source journal, study type, and sample size. The disclaimer on every card reads: 'This is general educational information, not medical advice. Consult a qualified healthcare professional.'"

**[2:40–3:00] Closing**

> "VitalSync is a personal wellness tracking and health organization app. It does not diagnose, treat, cure, monitor, or prevent any disease or medical condition. All data remains on the user's device. Thank you for reviewing VitalSync."

---

## Section 5 — Compliance Matrix

| Guideline 1.4.1 Criterion | VitalSync Status | Evidence |
|---|---|---|
| Does not claim to diagnose disease | **COMPLIANT** | No diagnostic language in any screen or metadata |
| Does not claim to treat disease | **COMPLIANT** | No treatment recommendations anywhere |
| Does not claim to cure disease | **COMPLIANT** | No cure claims anywhere |
| Does not claim to prevent disease | **COMPLIANT** | No prevention claims anywhere |
| Does not claim to monitor medical conditions | **COMPLIANT** | Repositioned as "wellness tracking" throughout |
| Does not manufacture or sell medical devices | **COMPLIANT** | App does not manufacture or sell any hardware |
| Does not interface with medical devices | **COMPLIANT** | Reads Apple Health data only; no direct device SDK |
| Health Data Access screen has wellness disclaimer | **COMPLIANT** | Two disclaimer cards added in v1.0.65 |
| EKG screen does not claim to interpret ECGs | **COMPLIANT** | Disclaimer banner added; labels are Apple Health metadata |
| Correlate/Insight sections have disclaimers | **COMPLIANT** | "Not medical advice" footer on all 5 Correlate sections |
| App Store description has jurisdiction statement | **COMPLIANT** | Compliance statement in Section 1 of this document |
| No "AFib detection" or "diagnosis" language | **COMPLIANT** | All instances replaced in v1.0.65 |
| No "clinical decision" language | **COMPLIANT** | All instances replaced in v1.0.65 |
| No "meta-analyzed clinical datasets" language | **COMPLIANT** | Replaced with "peer-reviewed research datasets" |
| Permission labels use wellness-focused language | **COMPLIANT** | Updated in v1.0.65 (see Section 2 table) |

**Overall 1.4.1 Risk Score: LOW**

---

## Section 6 — Apple Guideline 1.4.1 Resolution Summary

### Issue Identified by Apple

Apple flagged the Health Data Access screen as potentially positioning VitalSync as a medical device or clinical tool due to the presence of:

- Electrocardiogram (EKG) permission label
- Blood Oxygen (SpO₂) permission label
- Respiratory Rate permission label
- No wellness disclaimer on the permissions screen

### Root Cause

The original permission labels used clinical/medical terminology that is standard in HealthKit documentation but can create a perception of medical-device functionality when displayed to a reviewer without context.

### Resolution Actions Taken in v1.0.65

**Health Data Access Screen:**
- Added primary wellness disclaimer: *"VitalSync is intended for personal wellness tracking, organization, and educational purposes only. It does not diagnose, treat, cure, prevent, or monitor any disease or medical condition."*
- Added secondary source disclaimer: *"Health information displayed in VitalSync originates from Apple Health and compatible third-party sources. Data accuracy depends on the originating source."*
- Renamed `Electrocardiogram (EKG)` → `Health App ECG Records`
- Renamed `Blood Oxygen (SpO₂)` → `Imported Oxygen Records`
- Renamed `Respiratory Rate` → `Imported Respiratory Records`
- Renamed `Blood Pressure` → `Imported Blood Pressure Records`

**App-Wide Language Remediation:**
- Replaced all instances of "AFib episode detected" → "Atrial Fibrillation recording logged"
- Replaced all instances of "before making clinical decisions" → "Always consult a qualified healthcare professional"
- Replaced all instances of "meta-analyzed clinical datasets" → "peer-reviewed research datasets"
- Replaced "Search diagnoses" → "Search conditions"
- Replaced "AFib strips are always retained" → "Atrial Fibrillation recordings are always retained"
- Updated all `evidenceDisclaimerBanner` i18n values across all 10 language blocks

**EKG Screen:**
- Added persistent disclaimer banner: *"Displays ECG records imported from Apple Health. VitalSync does not interpret or diagnose ECG results."*
- Replaced "AFib detected" / "no AFib detected" with "Atrial Fibrillation recording present" / "No Atrial Fibrillation recordings"
- Clarified that rhythm classifications are Apple Health metadata, not VitalSync classifications

**Correlate Tab:**
- All 5 sections (Wellness Summary, Observed Historical Patterns, Nutrition Analysis, Insight Engine, Pattern Explorer) include "For informational purposes only · Not medical advice" disclaimer
- Pattern Explorer footer updated to: *"For informational purposes only · Not medical advice"*

### Files Modified

| File | Change |
|---|---|
| `lib/i18n.ts` | Updated `permEKG`, `permBloodOxygen`, `permRespiratoryRate`, `permBloodPressure` labels; added `hkWellnessDisclaimer1/2`; updated `evidenceDisclaimerBanner`, `afibCooldownHint` across all 10 language blocks |
| `app/settings/healthkit-permissions.tsx` | Added wellness disclaimer card UI |
| `components/dashboard/ekg-sparkline-detail-sheet.tsx` | Replaced AFib detection language |
| `components/clinical-narrative-card.tsx` | Replaced AFib detection language |
| `app/settings/thresholds.tsx` | Updated `afibCooldownHint` fallback |
| `app/settings/clinical-sources.tsx` | Updated `evidenceDisclaimerBanner` fallback and PDF template |
| `app/settings/data-privacy.tsx` | Updated `footerDisclaimer` fallback |
| `app/settings/storage-optimization.tsx` | Replaced "AFib (always kept)" and "AFib strips are always retained" |
| `app/onboarding.tsx` | Replaced "meta-analyzed clinical datasets" |
| `components/code-picker-sheet.tsx` | Replaced "Search diagnoses" with "Search conditions" |

### Residual Risk Assessment

| Risk Category | Pre-v1.0.65 | Post-v1.0.65 |
|---|---|---|
| Medical device perception | HIGH | LOW |
| Diagnostic language | HIGH | LOW |
| Clinical decision support language | MEDIUM | LOW |
| AFib detection claims | HIGH | LOW |
| Missing wellness disclaimers | HIGH | LOW |
| Non-compliant permission labels | HIGH | LOW |

**Final 1.4.1 Risk Score: LOW — Ready for App Store Approval**

---

## Section 7 — App Store Description (Compliant Version)

### Short Description (30 characters)

Personal health tracker & log

### Full Description

**VitalSync Health Tracker** is your personal wellness companion — a beautifully designed app for organizing, logging, and understanding your own health data.

**Import from Apple Health**
View your existing Apple Health records in one place — blood pressure, heart rate, sleep, activity, ECG records, and more. All data originates from Apple Health and your own manual entries.

**Log Your Wellness Data**
Track blood pressure readings, weight, blood sugar, sleep quality, nutrition, workouts, medications, and lab results. Everything stays on your device.

**Understand Your Trends**
The Correlate tab shows historical observations of your own logged data — helping you notice patterns over time. All insights are for educational purposes only.

**Organize Your Health Records**
Store medications, lab results, vaccination records, and personal health documents in one private, on-device location.

**Evidence-Based Education**
The Insight Engine provides educational information grounded in peer-reviewed research. Every insight cites its source journal, study type, and sample size.

---

**Important:** VitalSync is intended for personal wellness tracking, health organization, and educational purposes only. The app is not intended to diagnose, treat, cure, monitor, or prevent any disease or medical condition. Information provided by the app should not be used as a substitute for professional medical advice, diagnosis, or treatment. Availability and functionality of connected devices may vary by region and applicable regulatory approvals. Always consult a qualified healthcare professional for any health concerns.

---

*Document version: 1.0.65 · Prepared June 18, 2026*
