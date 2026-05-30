/**
 * Curated ICD-10-CM codes — ~300 most clinically relevant conditions
 * for a general-purpose patient health record app.
 *
 * Format: { code, description, category }
 * Source: ICD-10-CM 2024 (public domain, CMS)
 */

export interface Icd10Entry {
  code: string;
  description: string;
  category: string;
}

export const ICD10_CODES: Icd10Entry[] = [
  // ── Cardiovascular ──────────────────────────────────────────────────────────
  { code: 'I10', description: 'Essential (primary) hypertension', category: 'Cardiovascular' },
  { code: 'I11.9', description: 'Hypertensive heart disease without heart failure', category: 'Cardiovascular' },
  { code: 'I12.9', description: 'Hypertensive chronic kidney disease, stage 1-4', category: 'Cardiovascular' },
  { code: 'I13.10', description: 'Hypertensive heart and CKD without heart failure', category: 'Cardiovascular' },
  { code: 'I20.9', description: 'Angina pectoris, unspecified', category: 'Cardiovascular' },
  { code: 'I21.9', description: 'Acute myocardial infarction, unspecified', category: 'Cardiovascular' },
  { code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery', category: 'Cardiovascular' },
  { code: 'I25.5', description: 'Ischemic cardiomyopathy', category: 'Cardiovascular' },
  { code: 'I42.0', description: 'Dilated cardiomyopathy', category: 'Cardiovascular' },
  { code: 'I42.2', description: 'Hypertrophic obstructive cardiomyopathy', category: 'Cardiovascular' },
  { code: 'I48.0', description: 'Paroxysmal atrial fibrillation', category: 'Cardiovascular' },
  { code: 'I48.11', description: 'Longstanding persistent atrial fibrillation', category: 'Cardiovascular' },
  { code: 'I48.19', description: 'Other persistent atrial fibrillation', category: 'Cardiovascular' },
  { code: 'I48.20', description: 'Chronic atrial fibrillation, unspecified', category: 'Cardiovascular' },
  { code: 'I49.9', description: 'Cardiac arrhythmia, unspecified', category: 'Cardiovascular' },
  { code: 'I50.9', description: 'Heart failure, unspecified', category: 'Cardiovascular' },
  { code: 'I50.22', description: 'Chronic systolic heart failure', category: 'Cardiovascular' },
  { code: 'I50.32', description: 'Chronic diastolic heart failure', category: 'Cardiovascular' },
  { code: 'I63.9', description: 'Cerebral infarction, unspecified', category: 'Cardiovascular' },
  { code: 'I65.2', description: 'Occlusion and stenosis of carotid artery', category: 'Cardiovascular' },
  { code: 'I70.209', description: 'Atherosclerosis of native arteries of extremities', category: 'Cardiovascular' },
  { code: 'I73.9', description: 'Peripheral vascular disease, unspecified', category: 'Cardiovascular' },
  { code: 'I80.3', description: 'Phlebitis and thrombophlebitis of lower extremities', category: 'Cardiovascular' },
  { code: 'I82.401', description: 'Deep vein thrombosis of right femoral vein', category: 'Cardiovascular' },
  { code: 'I87.2', description: 'Venous insufficiency (chronic)(peripheral)', category: 'Cardiovascular' },

  // ── Endocrine & Metabolic ────────────────────────────────────────────────────
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E11.65', description: 'Type 2 diabetes with hyperglycemia', category: 'Endocrine' },
  { code: 'E11.40', description: 'Type 2 diabetes with diabetic neuropathy, unspecified', category: 'Endocrine' },
  { code: 'E11.319', description: 'Type 2 diabetes with unspecified diabetic retinopathy', category: 'Endocrine' },
  { code: 'E11.21', description: 'Type 2 diabetes with diabetic nephropathy', category: 'Endocrine' },
  { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E13.9', description: 'Other specified diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E78.5', description: 'Hyperlipidemia, unspecified', category: 'Endocrine' },
  { code: 'E78.00', description: 'Pure hypercholesterolemia, unspecified', category: 'Endocrine' },
  { code: 'E78.1', description: 'Pure hypertriglyceridemia', category: 'Endocrine' },
  { code: 'E78.2', description: 'Mixed hyperlipidemia', category: 'Endocrine' },
  { code: 'E03.9', description: 'Hypothyroidism, unspecified', category: 'Endocrine' },
  { code: 'E05.90', description: 'Thyrotoxicosis, unspecified, without thyrotoxic crisis', category: 'Endocrine' },
  { code: 'E06.3', description: 'Autoimmune thyroiditis (Hashimoto\'s)', category: 'Endocrine' },
  { code: 'E27.49', description: 'Other adrenocortical insufficiency (Addison\'s disease)', category: 'Endocrine' },
  { code: 'E24.9', description: 'Cushing\'s syndrome, unspecified', category: 'Endocrine' },
  { code: 'E66.9', description: 'Obesity, unspecified', category: 'Endocrine' },
  { code: 'E66.01', description: 'Morbid (severe) obesity due to excess calories', category: 'Endocrine' },
  { code: 'E11.51', description: 'Type 2 diabetes with diabetic peripheral angiopathy', category: 'Endocrine' },
  { code: 'E83.51', description: 'Hypocalcemia', category: 'Endocrine' },
  { code: 'E87.1', description: 'Hypo-osmolality and hyponatremia', category: 'Endocrine' },
  { code: 'E87.5', description: 'Hyperkalemia', category: 'Endocrine' },
  { code: 'E87.6', description: 'Hypokalemia', category: 'Endocrine' },

  // ── Respiratory ──────────────────────────────────────────────────────────────
  { code: 'J45.20', description: 'Mild intermittent asthma, uncomplicated', category: 'Respiratory' },
  { code: 'J45.40', description: 'Moderate persistent asthma, uncomplicated', category: 'Respiratory' },
  { code: 'J45.50', description: 'Severe persistent asthma, uncomplicated', category: 'Respiratory' },
  { code: 'J44.1', description: 'Chronic obstructive pulmonary disease with acute exacerbation', category: 'Respiratory' },
  { code: 'J44.0', description: 'COPD with acute lower respiratory infection', category: 'Respiratory' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism', category: 'Respiratory' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', category: 'Respiratory' },
  { code: 'J30.9', description: 'Allergic rhinitis, unspecified', category: 'Respiratory' },
  { code: 'J34.89', description: 'Other specified disorders of nose and nasal sinuses', category: 'Respiratory' },
  { code: 'J96.00', description: 'Acute respiratory failure, unspecified', category: 'Respiratory' },
  { code: 'G47.33', description: 'Obstructive sleep apnea (adult)', category: 'Respiratory' },
  { code: 'J84.10', description: 'Pulmonary fibrosis, unspecified', category: 'Respiratory' },
  { code: 'J93.9', description: 'Pneumothorax, unspecified', category: 'Respiratory' },
  { code: 'I26.99', description: 'Other pulmonary embolism without acute cor pulmonale', category: 'Respiratory' },

  // ── Gastrointestinal ─────────────────────────────────────────────────────────
  { code: 'K21.0', description: 'Gastro-esophageal reflux disease with esophagitis', category: 'Gastrointestinal' },
  { code: 'K21.9', description: 'Gastro-esophageal reflux disease without esophagitis', category: 'Gastrointestinal' },
  { code: 'K25.9', description: 'Gastric ulcer, unspecified', category: 'Gastrointestinal' },
  { code: 'K26.9', description: 'Duodenal ulcer, unspecified', category: 'Gastrointestinal' },
  { code: 'K29.70', description: 'Gastritis, unspecified, without bleeding', category: 'Gastrointestinal' },
  { code: 'K50.90', description: 'Crohn\'s disease of small intestine, unspecified', category: 'Gastrointestinal' },
  { code: 'K51.90', description: 'Ulcerative colitis, unspecified', category: 'Gastrointestinal' },
  { code: 'K57.30', description: 'Diverticulosis of large intestine without perforation', category: 'Gastrointestinal' },
  { code: 'K58.9', description: 'Irritable bowel syndrome without diarrhea', category: 'Gastrointestinal' },
  { code: 'K74.60', description: 'Unspecified cirrhosis of liver', category: 'Gastrointestinal' },
  { code: 'K76.0', description: 'Fatty (change of) liver, not elsewhere classified (NAFLD)', category: 'Gastrointestinal' },
  { code: 'K80.20', description: 'Calculus of gallbladder without cholecystitis', category: 'Gastrointestinal' },
  { code: 'K85.9', description: 'Acute pancreatitis, unspecified', category: 'Gastrointestinal' },
  { code: 'K86.1', description: 'Other chronic pancreatitis', category: 'Gastrointestinal' },
  { code: 'K92.1', description: 'Melena', category: 'Gastrointestinal' },

  // ── Renal & Urological ───────────────────────────────────────────────────────
  { code: 'N18.3', description: 'Chronic kidney disease, stage 3 (moderate)', category: 'Renal' },
  { code: 'N18.4', description: 'Chronic kidney disease, stage 4 (severe)', category: 'Renal' },
  { code: 'N18.5', description: 'Chronic kidney disease, stage 5', category: 'Renal' },
  { code: 'N18.6', description: 'End-stage renal disease', category: 'Renal' },
  { code: 'N17.9', description: 'Acute kidney failure, unspecified', category: 'Renal' },
  { code: 'N20.0', description: 'Calculus of kidney', category: 'Renal' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', category: 'Renal' },
  { code: 'N40.0', description: 'Benign prostatic hyperplasia without lower urinary tract symptoms', category: 'Renal' },
  { code: 'N04.9', description: 'Nephrotic syndrome, unspecified', category: 'Renal' },

  // ── Musculoskeletal ──────────────────────────────────────────────────────────
  { code: 'M06.9', description: 'Rheumatoid arthritis, unspecified', category: 'Musculoskeletal' },
  { code: 'M15.9', description: 'Polyosteoarthritis, unspecified', category: 'Musculoskeletal' },
  { code: 'M16.9', description: 'Osteoarthritis of hip, unspecified', category: 'Musculoskeletal' },
  { code: 'M17.9', description: 'Osteoarthritis of knee, unspecified', category: 'Musculoskeletal' },
  { code: 'M10.9', description: 'Gout, unspecified', category: 'Musculoskeletal' },
  { code: 'M81.0', description: 'Age-related osteoporosis without current pathological fracture', category: 'Musculoskeletal' },
  { code: 'M54.5', description: 'Low back pain', category: 'Musculoskeletal' },
  { code: 'M54.2', description: 'Cervicalgia', category: 'Musculoskeletal' },
  { code: 'M79.3', description: 'Panniculitis, unspecified', category: 'Musculoskeletal' },
  { code: 'M32.9', description: 'Systemic lupus erythematosus, unspecified', category: 'Musculoskeletal' },
  { code: 'M35.00', description: 'Sicca syndrome, unspecified (Sjögren\'s)', category: 'Musculoskeletal' },
  { code: 'M45.9', description: 'Ankylosing spondylitis of unspecified sites in spine', category: 'Musculoskeletal' },
  { code: 'M07.60', description: 'Enteropathic arthropathies, unspecified site', category: 'Musculoskeletal' },

  // ── Neurological ─────────────────────────────────────────────────────────────
  { code: 'G20', description: 'Parkinson\'s disease', category: 'Neurological' },
  { code: 'G30.9', description: 'Alzheimer\'s disease, unspecified', category: 'Neurological' },
  { code: 'G35', description: 'Multiple sclerosis', category: 'Neurological' },
  { code: 'G40.909', description: 'Epilepsy, unspecified, not intractable, without status', category: 'Neurological' },
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable, without status', category: 'Neurological' },
  { code: 'G45.9', description: 'Transient cerebral ischaemic attack, unspecified (TIA)', category: 'Neurological' },
  { code: 'G47.00', description: 'Insomnia, unspecified', category: 'Neurological' },
  { code: 'G54.2', description: 'Cervical root disorders', category: 'Neurological' },
  { code: 'G62.9', description: 'Polyneuropathy, unspecified', category: 'Neurological' },
  { code: 'G89.29', description: 'Other chronic pain', category: 'Neurological' },

  // ── Mental Health ────────────────────────────────────────────────────────────
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified', category: 'Mental Health' },
  { code: 'F33.9', description: 'Major depressive disorder, recurrent, unspecified', category: 'Mental Health' },
  { code: 'F41.1', description: 'Generalized anxiety disorder', category: 'Mental Health' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified', category: 'Mental Health' },
  { code: 'F40.10', description: 'Social phobia, unspecified', category: 'Mental Health' },
  { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified', category: 'Mental Health' },
  { code: 'F31.9', description: 'Bipolar disorder, unspecified', category: 'Mental Health' },
  { code: 'F20.9', description: 'Schizophrenia, unspecified', category: 'Mental Health' },
  { code: 'F50.9', description: 'Eating disorder, unspecified', category: 'Mental Health' },
  { code: 'F10.20', description: 'Alcohol use disorder, moderate', category: 'Mental Health' },
  { code: 'F17.210', description: 'Nicotine dependence, cigarettes, uncomplicated', category: 'Mental Health' },

  // ── Oncology ─────────────────────────────────────────────────────────────────
  { code: 'C50.919', description: 'Malignant neoplasm of unspecified site of breast', category: 'Oncology' },
  { code: 'C61', description: 'Malignant neoplasm of prostate', category: 'Oncology' },
  { code: 'C34.10', description: 'Malignant neoplasm of upper lobe, bronchus or lung', category: 'Oncology' },
  { code: 'C18.9', description: 'Malignant neoplasm of colon, unspecified', category: 'Oncology' },
  { code: 'C20', description: 'Malignant neoplasm of rectum', category: 'Oncology' },
  { code: 'C25.9', description: 'Malignant neoplasm of pancreas, unspecified', category: 'Oncology' },
  { code: 'C73', description: 'Malignant neoplasm of thyroid gland', category: 'Oncology' },
  { code: 'C43.9', description: 'Malignant melanoma of skin, unspecified', category: 'Oncology' },
  { code: 'C91.00', description: 'Acute lymphoblastic leukemia not in remission', category: 'Oncology' },
  { code: 'C85.90', description: 'Non-Hodgkin lymphoma, unspecified, unspecified site', category: 'Oncology' },
  { code: 'Z85.3', description: 'Personal history of malignant neoplasm of breast', category: 'Oncology' },
  { code: 'Z85.46', description: 'Personal history of malignant neoplasm of prostate', category: 'Oncology' },

  // ── Hematology ───────────────────────────────────────────────────────────────
  { code: 'D50.9', description: 'Iron deficiency anemia, unspecified', category: 'Hematology' },
  { code: 'D51.9', description: 'Vitamin B12 deficiency anemia, unspecified', category: 'Hematology' },
  { code: 'D64.9', description: 'Anemia, unspecified', category: 'Hematology' },
  { code: 'D57.1', description: 'Sickle-cell disease without crisis', category: 'Hematology' },
  { code: 'D68.9', description: 'Coagulation defect, unspecified', category: 'Hematology' },
  { code: 'D69.6', description: 'Thrombocytopenia, unspecified', category: 'Hematology' },

  // ── Infectious Disease ───────────────────────────────────────────────────────
  { code: 'B20', description: 'Human immunodeficiency virus (HIV) disease', category: 'Infectious Disease' },
  { code: 'B18.1', description: 'Chronic viral hepatitis B without delta-agent', category: 'Infectious Disease' },
  { code: 'B18.2', description: 'Chronic viral hepatitis C', category: 'Infectious Disease' },
  { code: 'A41.9', description: 'Sepsis, unspecified organism', category: 'Infectious Disease' },
  { code: 'J12.89', description: 'Other viral pneumonia (COVID-19 related)', category: 'Infectious Disease' },
  { code: 'U09.9', description: 'Post-COVID-19 condition, unspecified', category: 'Infectious Disease' },
  { code: 'A15.0', description: 'Tuberculosis of lung', category: 'Infectious Disease' },
  { code: 'B37.9', description: 'Candidiasis, unspecified', category: 'Infectious Disease' },

  // ── Dermatology ──────────────────────────────────────────────────────────────
  { code: 'L40.9', description: 'Psoriasis, unspecified', category: 'Dermatology' },
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified', category: 'Dermatology' },
  { code: 'L30.9', description: 'Dermatitis, unspecified', category: 'Dermatology' },
  { code: 'L03.90', description: 'Cellulitis, unspecified', category: 'Dermatology' },

  // ── Ophthalmology ────────────────────────────────────────────────────────────
  { code: 'H40.10X0', description: 'Open-angle glaucoma, unspecified', category: 'Ophthalmology' },
  { code: 'H26.9', description: 'Unspecified cataract', category: 'Ophthalmology' },
  { code: 'H35.30', description: 'Unspecified macular degeneration', category: 'Ophthalmology' },
  { code: 'H52.4', description: 'Presbyopia', category: 'Ophthalmology' },

  // ── Reproductive & Gynecological ─────────────────────────────────────────────
  { code: 'N80.9', description: 'Endometriosis, unspecified', category: 'Gynecological' },
  { code: 'N83.20', description: 'Unspecified ovarian cysts', category: 'Gynecological' },
  { code: 'N92.0', description: 'Excessive and frequent menstruation with regular cycle', category: 'Gynecological' },
  { code: 'E28.2', description: 'Polycystic ovarian syndrome (PCOS)', category: 'Gynecological' },
  { code: 'O10.019', description: 'Pre-existing essential hypertension complicating pregnancy', category: 'Gynecological' },

  // ── Allergies & Immunology ───────────────────────────────────────────────────
  { code: 'J30.1', description: 'Allergic rhinitis due to pollen', category: 'Allergy' },
  { code: 'L50.0', description: 'Allergic urticaria', category: 'Allergy' },
  { code: 'T78.1XXA', description: 'Other adverse food reactions, initial encounter', category: 'Allergy' },
  { code: 'T78.40XA', description: 'Allergy, unspecified, initial encounter', category: 'Allergy' },
  { code: 'D84.9', description: 'Immunodeficiency, unspecified', category: 'Allergy' },

  // ── Preventive / Screening ───────────────────────────────────────────────────
  { code: 'Z00.00', description: 'Encounter for general adult medical examination without abnormal findings', category: 'Preventive' },
  { code: 'Z13.6', description: 'Encounter for screening for cardiovascular disorders', category: 'Preventive' },
  { code: 'Z12.11', description: 'Encounter for screening for malignant neoplasm of colon', category: 'Preventive' },
  { code: 'Z12.31', description: 'Encounter for screening mammogram for malignant neoplasm of breast', category: 'Preventive' },
  { code: 'Z79.01', description: 'Long-term (current) use of anticoagulants', category: 'Preventive' },
  { code: 'Z79.4', description: 'Long-term (current) use of insulin', category: 'Preventive' },
  { code: 'Z87.891', description: 'Personal history of nicotine dependence', category: 'Preventive' },
];

/**
 * Search ICD-10 codes by code prefix or description keyword.
 * Returns up to `limit` results sorted by relevance.
 */
export function searchIcd10(query: string, limit = 12): Icd10Entry[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  const results: { entry: Icd10Entry; score: number }[] = [];

  for (const entry of ICD10_CODES) {
    const codeMatch = entry.code.toLowerCase().startsWith(q);
    const descWords = entry.description.toLowerCase();
    const descStart = descWords.startsWith(q);
    const descContains = descWords.includes(q);
    const categoryMatch = entry.category.toLowerCase().includes(q);

    if (codeMatch || descStart || descContains || categoryMatch) {
      let score = 0;
      if (codeMatch) score += 10;
      if (descStart) score += 8;
      if (descContains) score += 4;
      if (categoryMatch) score += 1;
      results.push({ entry, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.entry);
}
