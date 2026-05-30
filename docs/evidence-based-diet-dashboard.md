# Evidence-Based Diet Dashboard — Meta-Analysis Synthesis

## Key Meta-Analysis Findings

### DASH Diet (Umbrella Review, Chiavaroli et al. 2019, PMC6413235 — 634 citations)
| Outcome | Effect Size | Evidence Quality |
|---|---|---|
| Systolic BP | −5.2 mmHg (95% CI −7.0 to −3.4) | **Moderate** |
| Diastolic BP | −2.6 mmHg (−3.5 to −1.7) | **Moderate** |
| Total cholesterol | −0.20 mmol/L | Low |
| LDL-C | −0.10 mmol/L | Low |
| HbA1c | −0.53% (−0.62 to −0.43) | Low–Moderate |
| Fasting insulin | −0.15 μU/mL | Low |
| Body weight | −1.42 kg | Low |
| HDL-C | **No effect** | — |
| Triglycerides | **No effect** | — |
| Fasting glucose | **No effect** | — |
| CRP | **No effect** | — |
| CVD incidence (cohort) | RR 0.80 (0.76–0.85) | Low |

### Mediterranean Diet (Zheng et al. 2024, BMC Nutrition — T2D meta-analysis)
| Outcome | Effect Size | Significance |
|---|---|---|
| HbA1c | −0.39% (−0.58 to −0.20) | **p<0.001** |
| Fasting plasma glucose | −15.12 mg/dL (−24.69 to −5.55) | **p=0.002** |
| BMI | −0.71 kg/m² (−1.30 to −0.78) | **p=0.02** |
| Waist circumference | −1.69 cm (−3.35 to −0.02) | **p=0.05** |
| LDL-C | −2.34 mg/dL | Not significant |
| HDL-C | +2.33 mg/dL | Not significant |

### Sodium/Potassium Ratio (Perez & Chang 2014, 449 citations; Binia et al. 2015, 353 citations)
- **Na:K ratio is a SUPERIOR metric** to sodium alone for predicting BP
- Urinary Na:K ratio has stronger association with BP than either nutrient alone
- Potassium intake independently lowers BP: meta-analysis shows significant dose-response
- WHO recommends Na:K ratio < 1.0 (molar) as primary dietary target

### Sodium Reduction Dose-Response (Huang et al. 2020 BMJ, 462 citations)
- Every 1 g/day sodium reduction → ~1.1 mmHg SBP reduction
- Effect stronger in hypertensives: ~1.8 mmHg per g/day
- Linear dose-response confirmed across all age/sex groups

### DASH vs Mediterranean Head-to-Head (Filippou et al. 2024)
- On salt-restriction background: **Mediterranean superior** for office SBP
- Mediterranean also reduced fasting glucose, total cholesterol, LDL
- DASH reduced HbA1c and BP
- **Both superior to salt restriction alone**

---

## Evidence-Based Dashboard Metric Hierarchy

### TIER 1 — Strongest Evidence (Show Always)
1. **Systolic/Diastolic BP** — Primary outcome for both DASH and Mediterranean; moderate evidence
2. **Sodium intake (mg/day)** — Dose-response meta-analysis; directly actionable
3. **Na:K ratio** — Superior BP predictor vs sodium alone; WHO-endorsed metric
4. **Body weight / BMI** — Significant in both diets; directly measurable

### TIER 2 — Strong Evidence (Show When Data Available)
5. **HbA1c** — Significant in both DASH (−0.53%) and Mediterranean (−0.39%)
6. **Fasting glucose** — Significant for Mediterranean; proxy for glycemic control
7. **Waist circumference** — Significant for Mediterranean; visceral fat marker

### TIER 3 — Weak/No Evidence (Do NOT Prominently Feature)
- HDL-C: No significant effect in either diet
- Triglycerides: No significant effect in DASH
- CRP/inflammation: No significant effect in DASH
- LDL-C: Only trend-level in Mediterranean (not significant)

---

## Dashboard Redesign Principles

### What to SHOW on Dashboard
1. **BP trend** (already shown in vital cards — keep)
2. **Sodium intake vs target** — with Na:K ratio as the primary metric, not raw sodium alone
3. **Glycemic signal** — fasting glucose or HbA1c trend (when logged)
4. **Weight trend** — already in body composition card (keep)
5. **Meal IQ score** — evidence-based composite of meal quality (Mediterranean protocol)

### What to REMOVE / DE-EMPHASIZE from Dashboard
- DASH-specific compliance score (low evidence, protocol-specific)
- Potassium tracking as standalone (fold into Na:K ratio)
- Saturated fat tracking (weak evidence for standalone tracking)
- Macro ring (protein/carb/fat split) — not a primary outcome in any meta-analysis
- Caloric balance card — weight is the outcome; calorie counting has weak adherence evidence

### What to ADD
- **Na:K Ratio indicator** — replace raw sodium with ratio (stronger evidence)
- **7-day BP trend overlay with diet context** — show how dietary days correlate with BP readings
- **Glycemic risk signal** — postprandial glucose spikes correlated with meal logs

---

## Implementation Decision

**For the Dashboard, gate nutrition cards by evidence tier:**

| Card | Action | Reason |
|---|---|---|
| ActiveDietProfileCard | Keep, but show Na:K ratio prominently | Evidence-based primary metric |
| MacroRingCard | **Hide** | Macros not primary outcome in any meta-analysis |
| CalorieBurnCard | **Hide** | Calorie balance not a primary meta-analysis outcome |
| CaloricBalanceMiniCard | **Hide** | Same as above |
| WeeklyMacroTrendCard | **Hide** | Same as above |
| WeeklySummaryCard | Keep (shows BP, weight, HRV) | These ARE evidence-based |
| MealIQTrendCard | Keep (Mediterranean only) | Composite meal quality signal |
| ClinicalNarrativeCard | Keep | Integrates all evidence tiers |

**The DASH diet info to remove from Dashboard:**
- The `ActiveDietProfileCard` shows DASH compliance scores (sodium, potassium targets, compliance %)
- These are protocol-specific and not the strongest evidence metrics
- **Solution**: Hide `ActiveDietProfileCard` when `dietType === 'dash'` OR show a simplified version showing only Na:K ratio and BP correlation
