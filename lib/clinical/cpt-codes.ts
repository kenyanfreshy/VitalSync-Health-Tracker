/**
 * Curated CPT codes — ~200 most clinically relevant procedures
 * for a general-purpose patient surgical history record.
 *
 * Format: { code, description, category }
 * Source: AMA CPT 2024 (common/public reference codes)
 */

export interface CptEntry {
  code: string;
  description: string;
  category: string;
}

export const CPT_CODES: CptEntry[] = [
  // ── Evaluation & Management ──────────────────────────────────────────────────
  { code: '99213', description: 'Office visit, established patient, low complexity', category: 'E&M' },
  { code: '99214', description: 'Office visit, established patient, moderate complexity', category: 'E&M' },
  { code: '99215', description: 'Office visit, established patient, high complexity', category: 'E&M' },
  { code: '99203', description: 'Office visit, new patient, low complexity', category: 'E&M' },
  { code: '99204', description: 'Office visit, new patient, moderate complexity', category: 'E&M' },
  { code: '99205', description: 'Office visit, new patient, high complexity', category: 'E&M' },
  { code: '99232', description: 'Subsequent hospital care, moderate complexity', category: 'E&M' },
  { code: '99233', description: 'Subsequent hospital care, high complexity', category: 'E&M' },

  // ── Cardiovascular Surgery ───────────────────────────────────────────────────
  { code: '33533', description: 'CABG, arterial, single', category: 'Cardiac Surgery' },
  { code: '33534', description: 'CABG, arterial, two vessels', category: 'Cardiac Surgery' },
  { code: '33535', description: 'CABG, arterial, three vessels', category: 'Cardiac Surgery' },
  { code: '33510', description: 'CABG, venous, single', category: 'Cardiac Surgery' },
  { code: '33405', description: 'Aortic valve replacement with prosthetic valve', category: 'Cardiac Surgery' },
  { code: '33430', description: 'Mitral valve replacement with prosthetic valve', category: 'Cardiac Surgery' },
  { code: '33422', description: 'Mitral valve repair', category: 'Cardiac Surgery' },
  { code: '33880', description: 'Endovascular repair of descending thoracic aorta (TEVAR)', category: 'Cardiac Surgery' },
  { code: '33249', description: 'Implantation of ICD with defibrillation leads', category: 'Cardiac Surgery' },
  { code: '33206', description: 'Insertion of permanent pacemaker with transvenous electrode', category: 'Cardiac Surgery' },
  { code: '92928', description: 'Percutaneous coronary intervention (PCI) with stent', category: 'Cardiac Surgery' },
  { code: '93454', description: 'Coronary angiography', category: 'Cardiac Surgery' },
  { code: '33361', description: 'Transcatheter aortic valve replacement (TAVR)', category: 'Cardiac Surgery' },

  // ── Vascular Surgery ─────────────────────────────────────────────────────────
  { code: '35301', description: 'Carotid endarterectomy', category: 'Vascular Surgery' },
  { code: '34812', description: 'Endovascular repair of infrarenal aortic aneurysm (EVAR)', category: 'Vascular Surgery' },
  { code: '35656', description: 'Femoral-popliteal bypass', category: 'Vascular Surgery' },
  { code: '36821', description: 'Arteriovenous fistula creation for dialysis', category: 'Vascular Surgery' },
  { code: '37220', description: 'Iliac artery revascularization, angioplasty', category: 'Vascular Surgery' },

  // ── General Surgery ──────────────────────────────────────────────────────────
  { code: '44950', description: 'Appendectomy', category: 'General Surgery' },
  { code: '44970', description: 'Laparoscopic appendectomy', category: 'General Surgery' },
  { code: '47562', description: 'Laparoscopic cholecystectomy', category: 'General Surgery' },
  { code: '47600', description: 'Open cholecystectomy', category: 'General Surgery' },
  { code: '49505', description: 'Repair of initial inguinal hernia, age 5 or older', category: 'General Surgery' },
  { code: '49560', description: 'Repair of initial incisional or ventral hernia', category: 'General Surgery' },
  { code: '49650', description: 'Laparoscopic repair of initial inguinal hernia', category: 'General Surgery' },
  { code: '43239', description: 'Upper GI endoscopy with biopsy', category: 'General Surgery' },
  { code: '45378', description: 'Colonoscopy, diagnostic', category: 'General Surgery' },
  { code: '45380', description: 'Colonoscopy with biopsy', category: 'General Surgery' },
  { code: '45385', description: 'Colonoscopy with polypectomy', category: 'General Surgery' },
  { code: '43239', description: 'EGD with biopsy', category: 'General Surgery' },
  { code: '43280', description: 'Laparoscopic Nissen fundoplication', category: 'General Surgery' },
  { code: '43770', description: 'Laparoscopic adjustable gastric band placement', category: 'General Surgery' },
  { code: '43775', description: 'Laparoscopic sleeve gastrectomy', category: 'General Surgery' },
  { code: '43846', description: 'Gastric bypass, Roux-en-Y', category: 'General Surgery' },
  { code: '44140', description: 'Colectomy, partial, with anastomosis', category: 'General Surgery' },
  { code: '44204', description: 'Laparoscopic colectomy, partial', category: 'General Surgery' },
  { code: '48150', description: 'Pancreatectomy, partial (Whipple procedure)', category: 'General Surgery' },
  { code: '47135', description: 'Liver transplantation, orthotopic', category: 'General Surgery' },

  // ── Orthopedic Surgery ───────────────────────────────────────────────────────
  { code: '27447', description: 'Total knee arthroplasty', category: 'Orthopedic Surgery' },
  { code: '27130', description: 'Total hip arthroplasty', category: 'Orthopedic Surgery' },
  { code: '27125', description: 'Hemiarthroplasty, hip', category: 'Orthopedic Surgery' },
  { code: '29881', description: 'Arthroscopy, knee, with meniscectomy', category: 'Orthopedic Surgery' },
  { code: '29827', description: 'Arthroscopy, shoulder, with rotator cuff repair', category: 'Orthopedic Surgery' },
  { code: '27244', description: 'Intramedullary nail fixation, femur fracture', category: 'Orthopedic Surgery' },
  { code: '25600', description: 'Closed treatment of distal radial fracture', category: 'Orthopedic Surgery' },
  { code: '22612', description: 'Lumbar spinal fusion, posterior technique', category: 'Orthopedic Surgery' },
  { code: '63030', description: 'Laminotomy with discectomy, lumbar', category: 'Orthopedic Surgery' },
  { code: '23472', description: 'Total shoulder arthroplasty', category: 'Orthopedic Surgery' },
  { code: '27403', description: 'Arthrotomy with meniscus repair, knee', category: 'Orthopedic Surgery' },
  { code: '27428', description: 'Lateral retinacular release, knee', category: 'Orthopedic Surgery' },
  { code: '27570', description: 'Manipulation of knee joint under general anesthesia', category: 'Orthopedic Surgery' },

  // ── Neurosurgery ─────────────────────────────────────────────────────────────
  { code: '61510', description: 'Craniotomy for excision of brain tumor', category: 'Neurosurgery' },
  { code: '62270', description: 'Spinal puncture, lumbar, diagnostic', category: 'Neurosurgery' },
  { code: '63047', description: 'Laminectomy, lumbar, single interspace', category: 'Neurosurgery' },
  { code: '64483', description: 'Transforaminal epidural steroid injection, lumbar', category: 'Neurosurgery' },
  { code: '64490', description: 'Injection, diagnostic or therapeutic, facet joint, cervical', category: 'Neurosurgery' },
  { code: '61697', description: 'Clipping of cerebral aneurysm', category: 'Neurosurgery' },

  // ── Urology ──────────────────────────────────────────────────────────────────
  { code: '52601', description: 'Transurethral resection of prostate (TURP)', category: 'Urology' },
  { code: '55866', description: 'Laparoscopic radical prostatectomy', category: 'Urology' },
  { code: '50590', description: 'Lithotripsy, extracorporeal shock wave (ESWL)', category: 'Urology' },
  { code: '50080', description: 'Percutaneous nephrostolithotomy (PCNL)', category: 'Urology' },
  { code: '52353', description: 'Cystourethroscopy with ureteroscopy and lithotripsy', category: 'Urology' },
  { code: '55250', description: 'Vasectomy', category: 'Urology' },
  { code: '50300', description: 'Donor nephrectomy', category: 'Urology' },
  { code: '50360', description: 'Renal transplantation', category: 'Urology' },

  // ── Gynecology & Obstetrics ──────────────────────────────────────────────────
  { code: '59510', description: 'Routine obstetric care including cesarean delivery', category: 'OB/GYN' },
  { code: '59400', description: 'Routine obstetric care including vaginal delivery', category: 'OB/GYN' },
  { code: '58150', description: 'Total abdominal hysterectomy', category: 'OB/GYN' },
  { code: '58570', description: 'Laparoscopic total hysterectomy', category: 'OB/GYN' },
  { code: '58661', description: 'Laparoscopic salpingo-oophorectomy', category: 'OB/GYN' },
  { code: '58300', description: 'Insertion of intrauterine device (IUD)', category: 'OB/GYN' },
  { code: '57454', description: 'Colposcopy with biopsy of cervix', category: 'OB/GYN' },
  { code: '57522', description: 'Conization of cervix (LEEP)', category: 'OB/GYN' },

  // ── Thoracic Surgery ─────────────────────────────────────────────────────────
  { code: '32663', description: 'Thoracoscopic lobectomy (VATS)', category: 'Thoracic Surgery' },
  { code: '32480', description: 'Removal of lung, other than total pneumonectomy', category: 'Thoracic Surgery' },
  { code: '32551', description: 'Tube thoracostomy (chest tube)', category: 'Thoracic Surgery' },
  { code: '32560', description: 'Pleurodesis, chemical', category: 'Thoracic Surgery' },

  // ── Plastic & Reconstructive Surgery ────────────────────────────────────────
  { code: '19301', description: 'Mastectomy, partial (lumpectomy)', category: 'Plastic Surgery' },
  { code: '19303', description: 'Mastectomy, simple, complete', category: 'Plastic Surgery' },
  { code: '19340', description: 'Immediate insertion of breast prosthesis', category: 'Plastic Surgery' },
  { code: '15271', description: 'Application of skin substitute graft, trunk', category: 'Plastic Surgery' },
  { code: '21209', description: 'Osteoplasty, facial bones', category: 'Plastic Surgery' },

  // ── Ophthalmology ────────────────────────────────────────────────────────────
  { code: '66984', description: 'Extracapsular cataract removal with IOL implant', category: 'Ophthalmology' },
  { code: '67210', description: 'Destruction of localized lesion of retina', category: 'Ophthalmology' },
  { code: '66821', description: 'YAG laser posterior capsulotomy', category: 'Ophthalmology' },
  { code: '65855', description: 'Trabeculoplasty by laser surgery', category: 'Ophthalmology' },

  // ── ENT (Ear, Nose, Throat) ──────────────────────────────────────────────────
  { code: '42826', description: 'Tonsillectomy, primary or secondary, age 12 or over', category: 'ENT' },
  { code: '69436', description: 'Tympanostomy (tube insertion)', category: 'ENT' },
  { code: '30140', description: 'Submucous resection of turbinate', category: 'ENT' },
  { code: '31267', description: 'Nasal/sinus endoscopy with maxillary antrostomy', category: 'ENT' },
  { code: '69930', description: 'Cochlear device implantation', category: 'ENT' },

  // ── Endocrine Surgery ────────────────────────────────────────────────────────
  { code: '60240', description: 'Thyroidectomy, total', category: 'Endocrine Surgery' },
  { code: '60210', description: 'Partial thyroid lobectomy', category: 'Endocrine Surgery' },
  { code: '60500', description: 'Parathyroidectomy', category: 'Endocrine Surgery' },
  { code: '60650', description: 'Laparoscopic adrenalectomy', category: 'Endocrine Surgery' },

  // ── Diagnostic / Imaging Procedures ─────────────────────────────────────────
  { code: '71046', description: 'Chest X-ray, 2 views', category: 'Radiology' },
  { code: '74177', description: 'CT abdomen and pelvis with contrast', category: 'Radiology' },
  { code: '70553', description: 'MRI brain with and without contrast', category: 'Radiology' },
  { code: '93306', description: 'Echocardiography, transthoracic (TTE)', category: 'Radiology' },
  { code: '93307', description: 'Echocardiography, transthoracic, without Doppler', category: 'Radiology' },
  { code: '93312', description: 'Echocardiography, transesophageal (TEE)', category: 'Radiology' },
  { code: '93000', description: '12-lead electrocardiogram (ECG/EKG)', category: 'Radiology' },
  { code: '78452', description: 'Myocardial perfusion imaging, SPECT (nuclear stress test)', category: 'Radiology' },
  { code: '71250', description: 'CT thorax without contrast', category: 'Radiology' },
  { code: '72148', description: 'MRI lumbar spine without contrast', category: 'Radiology' },
  { code: '76817', description: 'Ultrasound, pregnant uterus, transvaginal', category: 'Radiology' },
  { code: '76700', description: 'Ultrasound, abdominal, complete', category: 'Radiology' },
  { code: '93880', description: 'Duplex scan of extracranial arteries, bilateral', category: 'Radiology' },
  { code: '93971', description: 'Duplex scan of extremity veins, unilateral', category: 'Radiology' },
];

/**
 * Search CPT codes by code prefix or description keyword.
 * Returns up to `limit` results sorted by relevance.
 */
export function searchCpt(query: string, limit = 12): CptEntry[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  const results: { entry: CptEntry; score: number }[] = [];

  for (const entry of CPT_CODES) {
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
