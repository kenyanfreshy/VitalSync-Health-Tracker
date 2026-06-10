# VitalSync Clinical Hub — Requirement Traceability Matrix (RTM)
## Release v1.0.59 · Build 10059

**Document type:** Requirement Traceability Matrix  
**Prepared by:** Manus AI  
**Date:** 2026-06-10  
**App version:** 1.0.59 (iOS buildNumber 10059 · Android versionCode 59)  
**EAS Build ID:** 55c6df1d-a378-4d1a-aba1-86f30ca1f781  
**Git commit:** f3fd43a (branch: main, remote: kenyanfreshy/VitalSync-Health-Tracker)

---

## 1. Purpose

This document maps every feature requirement introduced or modified in v1.0.59 to its precise implementation location (file path and line range), its test coverage, and its acceptance criteria. It is intended for compliance review, App Store submission, and engineering audit.

---

## 2. Scope of v1.0.59

Release v1.0.59 is a **Correlate tab redesign** release. The following requirement categories are in scope:

| Category | Requirement Count |
|---|---|
| Correlate tab — InsightEngine redesign | 4 |
| Correlate tab — Wellness Summary | 3 |
| Correlate tab — Evidence Library | 1 |
| Correlate tab — Pattern Explorer | 5 |
| Correlate tab — 4-Metric Scoring System | 4 |
| Correlate tab — InsightEngine always-expanded | 1 |
| Correlate tab — Recovery Trend removal | 1 |
| Internationalisation (i18n) | 2 |
| Version management | 3 |
| What's New sheet | 2 |
| Bug fix — TypeScript null narrowing | 1 |

**Total requirements:** 27

---

## 3. Requirement Traceability Table

### 3.1 InsightEngine Redesign

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-IE-01 | InsightCardFull must accept a `defaultExpanded` prop that initialises the card's expanded state | `components/dashboard/insight-engine.tsx` | 697–708 | Card renders expanded on mount when `defaultExpanded={true}` is passed; collapses/expands on tap |
| REQ-IE-02 | First two full-width InsightCardFull cards must always be expanded by default when the Insight Engine section is opened | `components/dashboard/insight-engine.tsx` | 1186–1195 | On first render of the Insight Engine section, cards 0 and 1 are in expanded state without user interaction |
| REQ-IE-03 | Each InsightCardFull expanded view must display a 4-metric scoring block (Data Completeness, Trend Stability, Relationship Strength, Research Confidence) with individual bar charts and an Overall Score badge | `components/dashboard/insight-engine.tsx` | 830–860 | Scoring block visible inside expanded card; four labelled bars with colour-coded fills; overall score badge shows weighted average |
| REQ-IE-04 | Scoring block styles must be defined in the component's StyleSheet | `components/dashboard/insight-engine.tsx` | 1662–1722 | No inline style objects; all scoring styles referenced via `styles.*` keys |

### 3.2 Wellness Summary

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-WS-01 | Weekly and Monthly Wellness Summary collapsible sections must be rendered inside the Correlate tab | `app/(tabs)/analytics.tsx` | 801–803 | `WellnessSummarySection` component renders between InsightEngine and PatternExplorer |
| REQ-WS-02 | `WellnessSummarySection` must compute per-metric averages from logged data for 7-day and 30-day windows | `components/dashboard/wellness-summary.tsx` | 1–436 | Average values displayed for BP, HR, HRV, sleep, weight, blood sugar, sodium where data exists |
| REQ-WS-03 | Null-filter narrowing on all nullable number arrays must use type-guard syntax `(v): v is number => v != null && v > 0` | `components/dashboard/wellness-summary.tsx` | 67–70 | `npx tsc --noEmit` reports zero errors in this file |

### 3.3 Evidence Library

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-EL-01 | Evidence Library grid (PubMed, AHA, Cochrane, WHO, ISSN, AND-EAL) must appear at the bottom of the InsightEngine expanded section | `components/dashboard/insight-engine.tsx` | 1190–1191 | `EvidenceLibraryGrid` component renders below half-width cards and above the "View all sources" footer |

### 3.4 Pattern Explorer

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-PE-01 | Pattern Explorer must display exactly 16 evidence-based scatter plot pairs | `components/dashboard/pattern-explorer.tsx` | 57–183 | `PLOT_PAIRS` array contains 16 entries; each entry has `x`, `y`, `emoji`, `title`, `citation`, `citationUrl`, `researchConfidence` |
| REQ-PE-02 | Pattern Explorer must support 4 day-range views: 30, 90, 180, 365 days | `components/dashboard/pattern-explorer.tsx` | 54 | `DAY_RANGES = [30, 90, 180, 365]`; tab selector renders 4 options; data filtered by selected range |
| REQ-PE-03 | Each scatter plot card must compute Pearson r correlation using the shared `computeCorrelation` function | `components/dashboard/pattern-explorer.tsx` | 394 | `computeCorrelation(filteredData, pair.x, pair.y)` called inside `useMemo`; result used for r-value display |
| REQ-PE-04 | Each scatter plot card must display a 4-metric scoring block (Data Completeness, Trend Stability, Relationship Strength, Research Confidence) | `components/dashboard/pattern-explorer.tsx` | 497–555 | Scoring block visible in expanded card; bars rendered with colour-coded fills; overall score badge |
| REQ-PE-05 | Pattern Explorer must be wired into the Correlate tab after WellnessSummarySection | `app/(tabs)/analytics.tsx` | 63, 805–807 | `PatternExplorer` imported and rendered at line 807; receives `data` prop from `state.data` |

### 3.5 Correlation Engine (shared library)

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-CE-01 | `computeCorrelation` must accept `HealthData`, `xMetric: MetricKey`, `yMetric: MetricKey` and return `CorrelationResult` | `lib/health/correlation.ts` | 146–210 | Function signature matches; `CorrelationResult` includes `r`, `rSquared`, `strength`, `direction`, `points` |
| REQ-CE-02 | `extractMetricSeries` must return a `Map<string, number>` keyed by ISO date string | `lib/health/correlation.ts` | 72–145 | Map keys are ISO date strings; values are numeric metric readings |

### 3.6 Recovery Trend Removal

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-RT-01 | Recovery Trend section must be removed from the Correlate tab | `app/(tabs)/analytics.tsx` | — | No `RecoveryTrend` component import or render call exists in analytics.tsx; `grep -n "RecoveryTrend"` returns no results |

### 3.7 Internationalisation

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-I18N-01 | Pattern Explorer strings (`patternExplorerLabel`, `patternExplorerSubtitle`, `patternExplorerDayRange`, `patternExplorerFooter`) must be translated into all 10 supported languages | `lib/i18n.ts` | 35780–35790 (en), 35960+ (es), 36128+ (fr), 36297+ (pt), 36466+ (ar), 36635+ (sw), 36805+ (hi), 36975+ (zh), 37155+ (de), 37335+ (ja) | `grep -c "patternExplorerLabel" lib/i18n.ts` returns 10 |
| REQ-I18N-02 | Scoring strings (`scoreDataCompleteness`, `scoreTrendStability`, `scoreRelationshipStrength`, `scoreResearchConfidence`, `scoreOverall`, `scoreAnalysisTitle`) must be translated into all 10 supported languages | `lib/i18n.ts` | Same blocks as REQ-I18N-01 | `grep -c "scoreDataCompleteness" lib/i18n.ts` returns 10 |

### 3.8 Version Management

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-VER-01 | App version must be bumped to 1.0.59 | `app.config.ts` | 44 | `version: "1.0.59"` |
| REQ-VER-02 | iOS buildNumber must be set to "10059" | `app.config.ts` | 53 | `buildNumber: "10059"` |
| REQ-VER-03 | Android versionCode must be set to 59 | `app.config.ts` | 96 | `versionCode: 59` |

### 3.9 What's New Sheet

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-WN-01 | `whatsNewV1059Strings` constant must define version, 3 New items, and 1 Improved item | `components/whats-new-sheet.tsx` | 75–100 | Constant exported; `version: "1.0.59"`; keys `n1Title`, `n1Desc`, `n2Title`, `n2Desc`, `n3Title`, `n3Desc`, `i1Title`, `i1Desc` present |
| REQ-WN-02 | `LATEST_WHATS_NEW_VERSION` must be updated to "1.0.59" and the v1.0.59 release section must render at the top of the What's New sheet | `lib/whats-new-version.ts`, `components/whats-new-sheet.tsx` | whats-new-version.ts:1, whats-new-sheet.tsx:569–722 | Sheet shows v1.0.59 as the first (topmost) release section; `latestVersion === v1059` |

### 3.10 Bug Fix — TypeScript Null Narrowing

| REQ-ID | Requirement | File | Lines | Acceptance Criteria |
|---|---|---|---|---|
| REQ-BUG-01 | All `.filter(v => v > 0)` calls on nullable number arrays in `wellness-summary.tsx` must be replaced with type-guard filters `(v): v is number => v != null && v > 0` to satisfy TypeScript strict null checks | `components/dashboard/wellness-summary.tsx` | 67–70 | `npx tsc --noEmit --skipLibCheck 2>&1 \| grep wellness-summary` returns no errors |

---

## 4. Test Coverage

| REQ-ID | Test File | Test Description | Status |
|---|---|---|---|
| REQ-IE-01 | — | Manual: render InsightCardFull with `defaultExpanded={true}`, verify expanded state | Verified |
| REQ-IE-02 | — | Manual: open Insight Engine section, verify first 2 cards are expanded | Verified |
| REQ-IE-03 | — | Manual: expand InsightCardFull, verify scoring block with 4 bars and overall badge | Verified |
| REQ-PE-01 | — | Static: `PLOT_PAIRS.length === 16` | Verified |
| REQ-PE-02 | — | Static: `DAY_RANGES.length === 4` | Verified |
| REQ-PE-03 | — | Manual: select day range, verify scatter plot updates | Verified |
| REQ-I18N-01 | `tests/correlation-i18n.test.ts` | Regression: all 10 language blocks contain `patternExplorerLabel` | Verified |
| REQ-I18N-02 | `tests/correlation-i18n.test.ts` | Regression: all 10 language blocks contain `scoreDataCompleteness` | Verified |
| REQ-BUG-01 | — | `npx tsc --noEmit --skipLibCheck 2>&1 \| grep wellness-summary` → 0 errors | Verified |
| REQ-VER-01–03 | — | Static: grep app.config.ts for version values | Verified |

---

## 5. Dependency Map

The following diagram shows the dependency chain for the Pattern Explorer feature:

```
app/(tabs)/analytics.tsx
  └── PatternExplorer (components/dashboard/pattern-explorer.tsx)
        ├── computeCorrelation (lib/health/correlation.ts:146)
        ├── extractMetricSeries (lib/health/correlation.ts:72)
        ├── MetricKey (lib/health/correlation.ts:28)
        ├── CorrelationResult (lib/health/correlation.ts:17)
        ├── GlassCard (components/glass-card.tsx)
        └── useCorrelationStrings → correlationStrings (lib/i18n.ts:35611)
```

```
app/(tabs)/analytics.tsx
  └── InsightEngine (components/dashboard/insight-engine.tsx)
        ├── InsightCardFull (line 697) → defaultExpanded prop (line 701)
        ├── 4-Metric Scoring Block (lines 830–860)
        ├── EvidenceLibraryGrid (line 1190)
        └── useCorrelationStrings → correlationStrings (lib/i18n.ts:35611)
```

---

## 6. Open Items

The following items were identified during v1.0.59 development and are deferred to v1.0.60:

| Item | Description | Target |
|---|---|---|
| Pattern Explorer — full i18n wiring | `patternExplorerLabel` and scoring strings are added to `correlationStrings` but the `PatternExplorer` component currently uses hardcoded English labels for the scoring block inside `InsightCardFull`. A `useCorrelationStrings()` call should replace the hardcoded strings. | v1.0.60 |
| InsightEngine scoring — dynamic computation | `Relationship Strength` is currently derived from `insight.status` (detected=85, normal=55, insufficient=20) rather than from the actual Pearson r value. A proper mapping from `r` to a 0–100 score should be implemented. | v1.0.60 |

---

## 7. Sign-off

| Role | Name | Date |
|---|---|---|
| Engineering | Manus AI | 2026-06-10 |
| QA | — | Pending |
| Product | — | Pending |

---

*This document was auto-generated from the VitalSync codebase. All line numbers are accurate as of git commit `f3fd43a`.*
