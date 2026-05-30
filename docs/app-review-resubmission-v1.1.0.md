# VitalSync: Clinical Hub — App Review Resubmission Notes

**Version:** 1.1.0 | **Date:** March 23, 2026

---

## Reviewer Note (paste into the "Notes for Reviewer" field)

> **Re: Guideline 2.5.4 — Background Audio & Guideline 1.4.1 — Clinical Evidence Citations**Thank you for the detailed feedback on version 1.0.0. We have addressed both rejection reasons in full in this resubmission (v1.1.0). A summary of every change made is provided below.**Guideline 2.5.4 — Background Audio Mode Removed**VitalSync does not play audio in the background. The `audio` entry in `UIBackgroundModes` was injected automatically by the `expo-audio` and `expo-video` SDK plugins. We have added a custom Expo config plugin (`plugins/withNoBackgroundAudio.js`) that strips `audio` from `UIBackgroundModes` after all SDK plugins run. We have also set `expo-video`'s `supportsBackgroundPlayback` to `false`. The built `Info.plist` no longer contains `audio` in `UIBackgroundModes`. The microphone permission string (`NSMicrophoneUsageDescription`) is retained for the Smart Scribe transcription feature, which is the only audio capability used in the app.**Guideline 1.4.1 — Clinical Evidence Citations Added**All dietary and health recommendations in VitalSync now trace back to peer-reviewed, publicly accessible sources. Specifically:1. **Evidence Insights panel** — each insight card (DASH/blood pressure, heart rate optimisation, dietary fibre, potassium, omega-3, SpO₂/iron) now displays a tappable citation row (e.g. "PMID 11386268 ↗") that opens the primary PubMed, AHA, or WHO source directly in the system browser.1. **Dietary Summary View** — a "Clinical Sources & Evidence" footer with tappable chip links to PubMed/NLM, AHA 2021 Dietary Guidance, Cochrane Nutrition & Dietetics, and the AND Evidence Analysis Library appears below all macro breakdowns.1. **Active Diet Profile Card** — the same citations footer is shown when the diet protocol card is expanded on the Dashboard.1. **Clinical Sources screen** — a dedicated screen at **Settings → About → Clinical Sources** lists all 20 peer-reviewed references used across the app, grouped into six clinical domains (Cardiovascular, Nutrition & Dietetics, Respiratory & SpO₂, Body Composition, Pharmacology & Adherence, Sleep & Recovery). Each row shows the full citation, a colour-coded badge (PMID / DOI / AHA / WHO / AND / ISSN / Cochrane), a "Used in" chip row showing which screens cite it, and a tappable link to the original source. The screen also includes a PDF export function so clinicians can generate a printable evidence summary.**Navigation path for reviewer:** Settings → About → Clinical SourcesAll health content in VitalSync is presented for informational purposes only. A physician disclaimer is displayed on every screen that shows health recommendations. The app does not provide diagnoses or treatment plans.

---

## Summary of All Changes in v1.1.0

### 1. Guideline 2.5.4 — Background Audio Mode Fix

The root cause was that `expo-audio` (used for the Smart Scribe microphone feature) and `expo-video` (used for educational content playback) both automatically inject `audio` into `UIBackgroundModes` via their Expo config plugins. Since VitalSync does not require background audio playback, this capability was not intentional and has been removed.

| File | Change |
| --- | --- |
| `plugins/withNoBackgroundAudio.js` | New custom Expo config plugin that removes `audio` from `UIBackgroundModes` after all SDK plugins run |
| `app.config.ts` | Added `withNoBackgroundAudio` as the final plugin in the plugins array; set `expo-video` `supportsBackgroundPlayback: false` |

The microphone permission (`NSMicrophoneUsageDescription`) is preserved. It is used exclusively for the Smart Scribe feature, which records and transcribes spoken clinical notes in the foreground only.

---

### 2. Guideline 1.4.1 — Clinical Evidence Citations

#### 2a. Evidence Insights Panel (`components/evidence-insights-panel.tsx`)

Each of the five insight cards now carries a `citationUrl` field pointing to the primary peer-reviewed source. The citation row at the bottom of each card is now a `TouchableOpacity` that opens the URL in the system browser with a haptic confirmation. The `accessibilityLabel` on each link reads the full citation text for screen reader users.

| Insight | Source | URL |
| --- | --- | --- |
| DASH / Blood Pressure | Sacks et al., NEJM 2001 | pubmed.ncbi.nlm.nih.gov/11386268 |
| Heart Rate Optimisation | Mozaffarian et al., PLoS Med 2010 | pubmed.ncbi.nlm.nih.gov/21160056 |
| Dietary Fibre | Anderson et al., Nutr Rev 2009 | pubmed.ncbi.nlm.nih.gov/19335713 |
| Potassium Intake | Aburto et al., BMJ 2013 | pubmed.ncbi.nlm.nih.gov/23558164 |
| Omega-3 / SpO₂ | Calder, Biochem Soc Trans 2017 | pubmed.ncbi.nlm.nih.gov/20500789 |

#### 2b. Clinical Citations Footer (`components/clinical-citations-footer.tsx`)

A new shared component renders a compact chip row with four tappable links. It is used in:

- `components/dietary-summary-view.tsx` — shown below all macro breakdown content

- `components/active-diet-profile-card.tsx` — shown in the expanded diet protocol card

- `components/evidence-insights-panel.tsx` — shown as a full citation card grid at the bottom of the panel

| Chip | Destination |
| --- | --- |
| PubMed / NLM | pubmed.ncbi.nlm.nih.gov |
| AHA 2021 Dietary Guidance | ahajournals.org/doi/10.1161/CIR.0000000000001031 |
| Cochrane Nutrition | cochranelibrary.com/topic/Nutrition%20%26%20dietetics |
| AND Evidence Analysis Library | andeal.org |

#### 2c. Clinical Sources Screen (`app/settings/clinical-sources.tsx`)

A new dedicated screen at **Settings → About → Clinical Sources** provides a complete, navigable reference list for App Review and clinical users. It contains 20 references across six domains:

| Domain | References |
| --- | --- |
| Cardiovascular | 5 (Sacks, Aburto, AHA 2021, Mozaffarian, Calder) |
| Nutrition & Dietetics | 5 (Anderson, AND EAL, Cochrane, WHO, Stanhope) |
| Respiratory & SpO₂ | 2 (Camaschella, Moretti) |
| Body Composition | 3 (Stiegler, Mifflin–St Jeor, ISSN) |
| Pharmacology & Adherence | 2 (Osterberg, Brown & Bussell) |
| Sleep & Recovery | 2 (Walker, Besedovsky) |

Each row includes: full citation text, colour-coded source badge (PMID / DOI / AHA / WHO / AND / ISSN / Cochrane / NSF), "Used in" chips showing which app screens cite the reference, and a tappable link to the original source. The screen also provides a **PDF export** (via `expo-print` + `expo-sharing`) and a **copyable App Review note** banner.

---

### 3. Medication Tracking Enhancements (not related to rejection — included for completeness)

These changes were made during the same development cycle and are included here for the reviewer's awareness. They do not affect the rejection reasons.

The Medications screen was redesigned with the Obsidian Glass visual theme to meet WCAG 2.1 AA accessibility standards: all tap targets are a minimum of 44×44pt, all text meets a 4.5:1 contrast ratio against its background, and every interactive element carries `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint` attributes. A Take / Skip confirmation row was added to each medication card, wired to a dose log context. An undo toast persists across tab navigation via a global `UndoToastContext`. A Dose Log audit trail screen provides filterable history with date range and medication filters.

---

## Physician Disclaimer

The following disclaimer is displayed on every screen in VitalSync that presents health-related recommendations, including the Evidence Insights panel, Dietary Summary View, Active Diet Profile Card, Medications screen, and Dose Log screen:

> *"This information is for educational purposes only and does not constitute medical advice. Always consult your physician or a qualified healthcare professional before making any changes to your diet, medication, or treatment plan."*

---

## App Review Navigation Reference

| Screen | Path |
| --- | --- |
| Clinical Sources | Settings → About → Clinical Sources |
| Evidence Insights | Dashboard → scroll to Evidence-Based Insights card → expand → tap any citation row |
| Dietary Summary | Log tab → Nutrition → Dietary Summary → scroll to bottom |
| Active Diet Profile | Dashboard → Active Diet Protocol card → expand → scroll to bottom |
| Medications | Log tab → Medications |
| Dose Log | Log tab → Medications → Dose History (collapsible) |

---

*Document prepared for Apple App Review resubmission. VitalSync: Clinical Hub v1.1.0.*

