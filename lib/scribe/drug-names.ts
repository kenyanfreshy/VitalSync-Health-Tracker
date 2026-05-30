/**
 * lib/scribe/drug-names.ts
 *
 * Brand-name → generic drug name dictionary for VitalSync Scribe.
 *
 * Covers the most commonly prescribed and OTC medications in the US.
 * All keys are lowercase for case-insensitive matching.
 * Values are the standard generic (INN) name.
 */

export const BRAND_TO_GENERIC: Record<string, string> = {
  // ── Analgesics / Antipyretics ─────────────────────────────────────────────
  // US brand names
  tylenol: 'acetaminophen',
  panadol: 'acetaminophen',
  tempra: 'acetaminophen',
  // International INN name (UK, Australia, Africa, Asia, Europe)
  paracetamol: 'acetaminophen',
  // International brand names for paracetamol/acetaminophen
  calpol: 'acetaminophen',          // UK/Ireland
  efferalgan: 'acetaminophen',      // France, Europe
  doliprane: 'acetaminophen',       // France
  dafalgan: 'acetaminophen',        // France, Belgium, Switzerland
  perfalgan: 'acetaminophen',       // Europe (IV)
  ben_u_ron: 'acetaminophen',       // Germany
  mexalen: 'acetaminophen',         // Austria
  tachipirina: 'acetaminophen',     // Italy
  febrectal: 'acetaminophen',       // Spain
  apiretal: 'acetaminophen',        // Spain
  gelocatil: 'acetaminophen',       // Spain
  panadeine: 'acetaminophen',       // Australia (also has codeine)
  panamax: 'acetaminophen',         // Australia
  herron_paracetamol: 'acetaminophen', // Australia
  dolo: 'acetaminophen',            // India (Dolo-650)
  crocin: 'acetaminophen',          // India
  metacin: 'acetaminophen',         // India
  p_500: 'acetaminophen',           // India
  pyrigesic: 'acetaminophen',       // India
  paracip: 'acetaminophen',         // India
  febrinil: 'acetaminophen',        // East Africa
  panadol_extra: 'acetaminophen',   // Global
  // International ibuprofen brands
  brufen: 'ibuprofen',              // UK, Europe, Middle East
  nurofen: 'ibuprofen',             // UK, Australia, Europe
  calprofen: 'ibuprofen',           // UK
  ibuprom: 'ibuprofen',             // Poland
  moment: 'ibuprofen',              // Italy
  spedifen: 'ibuprofen',            // France
  antarene: 'ibuprofen',            // France
  ibugel: 'ibuprofen',              // UK (topical)
  // International naproxen brands
  synflex: 'naproxen',              // UK, Australia
  naprosyn_ec: 'naproxen',          // UK
  // International aspirin brands
  disprin: 'aspirin',               // UK, Australia, India
  cardiprin: 'aspirin',             // Australia
  // International diclofenac brands
  cataflam: 'diclofenac',           // Global
  rhumalgan: 'diclofenac',          // UK
  // International metformin brands
  glucophage_xr: 'metformin',       // Global
  diabex: 'metformin',              // Australia
  diaformin: 'metformin',           // Australia
  obimet: 'metformin',              // India
  glycomet: 'metformin',            // India
  // International omeprazole brands
  losec: 'omeprazole',              // UK, Europe, Australia
  omepral: 'omeprazole',            // Europe
  // International atorvastatin brands
  sortis: 'atorvastatin',           // Germany, Europe
  torvast: 'atorvastatin',          // Italy
  // International amoxicillin brands
  amoxil_uk: 'amoxicillin',         // UK
  flemoxin: 'amoxicillin',          // Netherlands, Europe
  ospamox: 'amoxicillin',           // Austria
  // International azithromycin brands
  sumamed: 'azithromycin',          // Eastern Europe
  azithral: 'azithromycin',         // India
  azee: 'azithromycin',             // India
  // International ciprofloxacin brands
  cifran: 'ciprofloxacin',          // India
  ciplox: 'ciprofloxacin',          // India
  // International cetirizine brands
  zirtek: 'cetirizine',             // UK, Europe
  reactine: 'cetirizine',           // Canada, Europe
  // International loratadine brands
  clarityn: 'loratadine',           // UK, Europe
  // International fluoxetine brands
  fluoxetine_hcl: 'fluoxetine',     // Generic global
  // International sertraline brands
  lustral: 'sertraline',            // UK
  // International levothyroxine brands
  eltroxin: 'levothyroxine',        // UK, Ireland, Australia
  euthyrox: 'levothyroxine',        // Europe
  oroxine: 'levothyroxine',         // Australia
  // International semaglutide brands
  ozempic_eu: 'semaglutide',        // Europe
  victoza_eu: 'liraglutide',        // Europe
  // International insulin brands
  novorapid: 'insulin aspart',      // UK, Europe (= NovoLog in US)
  novorapid_flexpen: 'insulin aspart', // Europe
  levemir_eu: 'insulin detemir',    // Europe
  // International salbutamol/albuterol
  salbutamol: 'albuterol',          // INN name used globally outside US
  ventolin_eu: 'albuterol',         // Europe
  salamol: 'albuterol',             // UK
  airomir: 'albuterol',             // UK
  // International prednisolone brands
  prednisolone: 'prednisolone',     // INN (different from prednisone)
  predsol: 'prednisolone',          // UK
  deltacortril: 'prednisolone',     // UK
  // International warfarin brands
  marevan: 'warfarin',              // UK, Europe
  // International amlodipine brands
  istin: 'amlodipine',              // UK, Europe
  // International lisinopril brands
  carace: 'lisinopril',             // UK
  zestoretic: 'lisinopril/hydrochlorothiazide', // Global
  advil: 'ibuprofen',
  motrin: 'ibuprofen',
  nuprin: 'ibuprofen',
  aleve: 'naproxen',
  naprosyn: 'naproxen',
  anaprox: 'naproxen',
  celebrex: 'celecoxib',
  voltaren: 'diclofenac',
  mobic: 'meloxicam',
  feldene: 'piroxicam',
  indocin: 'indomethacin',
  toradol: 'ketorolac',
  ultram: 'tramadol',
  ultracet: 'tramadol/acetaminophen',
  percocet: 'oxycodone/acetaminophen',
  vicodin: 'hydrocodone/acetaminophen',
  norco: 'hydrocodone/acetaminophen',
  lortab: 'hydrocodone/acetaminophen',
  oxycontin: 'oxycodone',
  roxicodone: 'oxycodone',
  dilaudid: 'hydromorphone',
  duragesic: 'fentanyl',
  ms_contin: 'morphine',
  kadian: 'morphine',
  avinza: 'morphine',
  demerol: 'meperidine',
  codeine: 'codeine',
  aspirin: 'aspirin',
  bayer: 'aspirin',
  ecotrin: 'aspirin',
  bufferin: 'aspirin',

  // ── Cardiovascular ────────────────────────────────────────────────────────
  lipitor: 'atorvastatin',
  zocor: 'simvastatin',
  crestor: 'rosuvastatin',
  pravachol: 'pravastatin',
  mevacor: 'lovastatin',
  lescol: 'fluvastatin',
  livalo: 'pitavastatin',
  vytorin: 'ezetimibe/simvastatin',
  zetia: 'ezetimibe',
  lopid: 'gemfibrozil',
  tricor: 'fenofibrate',
  niaspan: 'niacin',
  norvasc: 'amlodipine',
  procardia: 'nifedipine',
  cardizem: 'diltiazem',
  tiazac: 'diltiazem',
  calan: 'verapamil',
  isoptin: 'verapamil',
  toprol: 'metoprolol succinate',
  lopressor: 'metoprolol tartrate',
  tenormin: 'atenolol',
  coreg: 'carvedilol',
  inderal: 'propranolol',
  innopran: 'propranolol',
  zebeta: 'bisoprolol',
  bystolic: 'nebivolol',
  zestril: 'lisinopril',
  prinivil: 'lisinopril',
  altace: 'ramipril',
  vasotec: 'enalapril',
  lotensin: 'benazepril',
  accupril: 'quinapril',
  monopril: 'fosinopril',
  mavik: 'trandolapril',
  aceon: 'perindopril',
  cozaar: 'losartan',
  hyzaar: 'losartan/hydrochlorothiazide',
  diovan: 'valsartan',
  avapro: 'irbesartan',
  atacand: 'candesartan',
  micardis: 'telmisartan',
  benicar: 'olmesartan',
  entresto: 'sacubitril/valsartan',
  lasix: 'furosemide',
  bumex: 'bumetanide',
  demadex: 'torsemide',
  aldactone: 'spironolactone',
  inspra: 'eplerenone',
  hydrochlorothiazide: 'hydrochlorothiazide',
  hctz: 'hydrochlorothiazide',
  microzide: 'hydrochlorothiazide',
  chlorthalidone: 'chlorthalidone',
  hygroton: 'chlorthalidone',
  digoxin: 'digoxin',
  lanoxin: 'digoxin',
  amiodarone: 'amiodarone',
  cordarone: 'amiodarone',
  pacerone: 'amiodarone',
  multaq: 'dronedarone',
  tikosyn: 'dofetilide',
  rythmol: 'propafenone',
  tambocor: 'flecainide',
  nitrostat: 'nitroglycerin',
  nitro_dur: 'nitroglycerin',
  imdur: 'isosorbide mononitrate',
  isordil: 'isosorbide dinitrate',
  ranexa: 'ranolazine',
  plavix: 'clopidogrel',
  effient: 'prasugrel',
  brilinta: 'ticagrelor',
  coumadin: 'warfarin',
  jantoven: 'warfarin',
  eliquis: 'apixaban',
  xarelto: 'rivaroxaban',
  pradaxa: 'dabigatran',
  savaysa: 'edoxaban',
  lovenox: 'enoxaparin',
  fragmin: 'dalteparin',
  heparin: 'heparin',
  arixtra: 'fondaparinux',
  vascepa: 'icosapentaenoic acid',
  lovaza: 'omega-3 fatty acids',

  // ── Diabetes ──────────────────────────────────────────────────────────────
  glucophage: 'metformin',
  fortamet: 'metformin',
  glumetza: 'metformin',
  riomet: 'metformin',
  januvia: 'sitagliptin',
  tradjenta: 'linagliptin',
  onglyza: 'saxagliptin',
  nesina: 'alogliptin',
  victoza: 'liraglutide',
  ozempic: 'semaglutide',
  rybelsus: 'semaglutide',
  trulicity: 'dulaglutide',
  byetta: 'exenatide',
  bydureon: 'exenatide',
  jardiance: 'empagliflozin',
  farxiga: 'dapagliflozin',
  invokana: 'canagliflozin',
  steglatro: 'ertugliflozin',
  actos: 'pioglitazone',
  avandia: 'rosiglitazone',
  amaryl: 'glimepiride',
  glucotrol: 'glipizide',
  diabeta: 'glyburide',
  micronase: 'glyburide',
  glynase: 'glyburide',
  starlix: 'nateglinide',
  prandin: 'repaglinide',
  precose: 'acarbose',
  glyset: 'miglitol',
  lantus: 'insulin glargine',
  basaglar: 'insulin glargine',
  toujeo: 'insulin glargine',
  levemir: 'insulin detemir',
  tresiba: 'insulin degludec',
  novolog: 'insulin aspart',
  humalog: 'insulin lispro',
  apidra: 'insulin glulisine',
  humulin: 'human insulin',
  novolin: 'human insulin',
  mounjaro: 'tirzepatide',
  zepbound: 'tirzepatide',
  wegovy: 'semaglutide',

  // ── Respiratory ───────────────────────────────────────────────────────────
  ventolin: 'albuterol',
  proventil: 'albuterol',
  proair: 'albuterol',
  xopenex: 'levalbuterol',
  serevent: 'salmeterol',
  foradil: 'formoterol',
  perforomist: 'formoterol',
  spiriva: 'tiotropium',
  incruse: 'umeclidinium',
  tudorza: 'aclidinium',
  atrovent: 'ipratropium',
  combivent: 'ipratropium/albuterol',
  advair: 'fluticasone/salmeterol',
  symbicort: 'budesonide/formoterol',
  dulera: 'mometasone/formoterol',
  breo: 'fluticasone/vilanterol',
  trelegy: 'fluticasone/umeclidinium/vilanterol',
  flovent: 'fluticasone',
  pulmicort: 'budesonide',
  qvar: 'beclomethasone',
  asmanex: 'mometasone',
  singulair: 'montelukast',
  accolate: 'zafirlukast',
  zyflo: 'zileuton',
  xolair: 'omalizumab',
  nucala: 'mepolizumab',
  fasenra: 'benralizumab',
  dupixent: 'dupilumab',
  robitussin: 'guaifenesin',
  mucinex: 'guaifenesin',
  tessalon: 'benzonatate',
  delsym: 'dextromethorphan',

  // ── Mental Health ─────────────────────────────────────────────────────────
  prozac: 'fluoxetine',
  sarafem: 'fluoxetine',
  zoloft: 'sertraline',
  paxil: 'paroxetine',
  paxil_cr: 'paroxetine',
  lexapro: 'escitalopram',
  celexa: 'citalopram',
  luvox: 'fluvoxamine',
  effexor: 'venlafaxine',
  pristiq: 'desvenlafaxine',
  cymbalta: 'duloxetine',
  fetzima: 'levomilnacipran',
  wellbutrin: 'bupropion',
  zyban: 'bupropion',
  remeron: 'mirtazapine',
  trazodone: 'trazodone',
  desyrel: 'trazodone',
  elavil: 'amitriptyline',
  pamelor: 'nortriptyline',
  sinequan: 'doxepin',
  anafranil: 'clomipramine',
  tofranil: 'imipramine',
  vivactil: 'protriptyline',
  nardil: 'phenelzine',
  parnate: 'tranylcypromine',
  emsam: 'selegiline',
  trintellix: 'vortioxetine',
  viibryd: 'vilazodone',
  abilify: 'aripiprazole',
  risperdal: 'risperidone',
  seroquel: 'quetiapine',
  zyprexa: 'olanzapine',
  geodon: 'ziprasidone',
  latuda: 'lurasidone',
  vraylar: 'cariprazine',
  rexulti: 'brexpiprazole',
  clozaril: 'clozapine',
  haldol: 'haloperidol',
  thorazine: 'chlorpromazine',
  prolixin: 'fluphenazine',
  navane: 'thiothixene',
  lithium: 'lithium',
  eskalith: 'lithium',
  lithobid: 'lithium',
  depakote: 'valproate',
  depakene: 'valproic acid',
  lamictal: 'lamotrigine',
  tegretol: 'carbamazepine',
  trileptal: 'oxcarbazepine',
  topamax: 'topiramate',
  klonopin: 'clonazepam',
  xanax: 'alprazolam',
  valium: 'diazepam',
  ativan: 'lorazepam',
  librium: 'chlordiazepoxide',
  buspar: 'buspirone',
  ambien: 'zolpidem',
  lunesta: 'eszopiclone',
  sonata: 'zaleplon',
  belsomra: 'suvorexant',
  rozerem: 'ramelteon',
  strattera: 'atomoxetine',
  adderall: 'amphetamine/dextroamphetamine',
  ritalin: 'methylphenidate',
  concerta: 'methylphenidate',
  vyvanse: 'lisdexamfetamine',
  focalin: 'dexmethylphenidate',
  intuniv: 'guanfacine',
  kapvay: 'clonidine',

  // ── Antibiotics ───────────────────────────────────────────────────────────
  amoxil: 'amoxicillin',
  trimox: 'amoxicillin',
  augmentin: 'amoxicillin/clavulanate',
  keflex: 'cephalexin',
  duricef: 'cefadroxil',
  ceftin: 'cefuroxime',
  omnicef: 'cefdinir',
  suprax: 'cefixime',
  rocephin: 'ceftriaxone',
  cipro: 'ciprofloxacin',
  levaquin: 'levofloxacin',
  avelox: 'moxifloxacin',
  floxin: 'ofloxacin',
  zithromax: 'azithromycin',
  zpack: 'azithromycin',
  biaxin: 'clarithromycin',
  erythromycin: 'erythromycin',
  ery_tab: 'erythromycin',
  doxycycline: 'doxycycline',
  vibramycin: 'doxycycline',
  doryx: 'doxycycline',
  minocin: 'minocycline',
  bactrim: 'trimethoprim/sulfamethoxazole',
  septra: 'trimethoprim/sulfamethoxazole',
  macrobid: 'nitrofurantoin',
  macrodantin: 'nitrofurantoin',
  flagyl: 'metronidazole',
  diflucan: 'fluconazole',
  nystatin: 'nystatin',
  lamisil: 'terbinafine',
  sporanox: 'itraconazole',
  vfend: 'voriconazole',
  tamiflu: 'oseltamivir',
  valtrex: 'valacyclovir',
  zovirax: 'acyclovir',

  // ── GI / Acid Reflux ──────────────────────────────────────────────────────
  prilosec: 'omeprazole',
  nexium: 'esomeprazole',
  prevacid: 'lansoprazole',
  protonix: 'pantoprazole',
  aciphex: 'rabeprazole',
  dexilant: 'dexlansoprazole',
  zantac: 'ranitidine',
  pepcid: 'famotidine',
  tagamet: 'cimetidine',
  tums: 'calcium carbonate',
  maalox: 'aluminum/magnesium hydroxide',
  mylanta: 'aluminum/magnesium hydroxide',
  carafate: 'sucralfate',
  reglan: 'metoclopramide',
  zofran: 'ondansetron',
  phenergan: 'promethazine',
  compazine: 'prochlorperazine',
  colace: 'docusate',
  dulcolax: 'bisacodyl',
  miralax: 'polyethylene glycol',
  senokot: 'senna',
  imodium: 'loperamide',
  pepto_bismol: 'bismuth subsalicylate',
  xifaxan: 'rifaximin',
  linzess: 'linaclotide',
  amitiza: 'lubiprostone',
  humira: 'adalimumab',
  remicade: 'infliximab',
  entyvio: 'vedolizumab',
  stelara: 'ustekinumab',

  // ── Thyroid / Hormones ────────────────────────────────────────────────────
  synthroid: 'levothyroxine',
  levoxyl: 'levothyroxine',
  unithroid: 'levothyroxine',
  armour_thyroid: 'desiccated thyroid',
  cytomel: 'liothyronine',
  tapazole: 'methimazole',
  ptu: 'propylthiouracil',
  premarin: 'conjugated estrogens',
  prempro: 'conjugated estrogens/medroxyprogesterone',
  estrace: 'estradiol',
  vivelle: 'estradiol',
  climara: 'estradiol',
  provera: 'medroxyprogesterone',
  prometrium: 'progesterone',
  depo_provera: 'medroxyprogesterone',
  ortho_tri_cyclen: 'norgestimate/ethinyl estradiol',
  yaz: 'drospirenone/ethinyl estradiol',
  yasmin: 'drospirenone/ethinyl estradiol',
  lo_loestrin: 'norethindrone/ethinyl estradiol',
  nexplanon: 'etonogestrel',
  mirena: 'levonorgestrel',
  plan_b: 'levonorgestrel',
  ella: 'ulipristal acetate',
  testosterone: 'testosterone',
  androgel: 'testosterone',
  testim: 'testosterone',

  // ── Allergy / Antihistamines ──────────────────────────────────────────────
  claritin: 'loratadine',
  alavert: 'loratadine',
  zyrtec: 'cetirizine',
  xyzal: 'levocetirizine',
  allegra: 'fexofenadine',
  benadryl: 'diphenhydramine',
  unisom: 'diphenhydramine',
  chlor_trimeton: 'chlorpheniramine',
  atarax: 'hydroxyzine',
  vistaril: 'hydroxyzine',
  flonase: 'fluticasone nasal',
  nasacort: 'triamcinolone nasal',
  nasonex: 'mometasone nasal',
  rhinocort: 'budesonide nasal',
  astelin: 'azelastine nasal',
  patanase: 'olopatadine nasal',
  epipen: 'epinephrine',
  auvi_q: 'epinephrine',

  // ── Steroids / Immunosuppressants ─────────────────────────────────────────
  prednisone: 'prednisone',
  deltasone: 'prednisone',
  medrol: 'methylprednisolone',
  solu_medrol: 'methylprednisolone',
  decadron: 'dexamethasone',
  cortef: 'hydrocortisone',
  florinef: 'fludrocortisone',
  cellcept: 'mycophenolate',
  imuran: 'azathioprine',
  neoral: 'cyclosporine',
  sandimmune: 'cyclosporine',
  prograf: 'tacrolimus',
  rapamune: 'sirolimus',
  methotrexate: 'methotrexate',
  plaquenil: 'hydroxychloroquine',

  // ── Neurology / Seizures ──────────────────────────────────────────────────
  dilantin: 'phenytoin',
  phenobarbital: 'phenobarbital',
  keppra: 'levetiracetam',
  vimpat: 'lacosamide',
  lyrica: 'pregabalin',
  neurontin: 'gabapentin',
  gabitril: 'tiagabine',
  zonegran: 'zonisamide',
  onfi: 'clobazam',
  fycompa: 'perampanel',
  aricept: 'donepezil',
  exelon: 'rivastigmine',
  razadyne: 'galantamine',
  namenda: 'memantine',
  namzaric: 'donepezil/memantine',
  imitrex: 'sumatriptan',
  maxalt: 'rizatriptan',
  zomig: 'zolmitriptan',
  relpax: 'eletriptan',
  nurtec: 'rimegepant',
  ubrelvy: 'ubrogepant',
  aimovig: 'erenumab',
  ajovy: 'fremanezumab',
  emgality: 'galcanezumab',
  mirapex: 'pramipexole',
  requip: 'ropinirole',
  neupro: 'rotigotine',
  sinemet: 'carbidopa/levodopa',
  stalevo: 'carbidopa/levodopa/entacapone',
  azilect: 'rasagiline',
  eldepryl: 'selegiline',

  // ── Urology / BPH ────────────────────────────────────────────────────────
  flomax: 'tamsulosin',
  uroxatral: 'alfuzosin',
  rapaflo: 'silodosin',
  cardura: 'doxazosin',
  hytrin: 'terazosin',
  proscar: 'finasteride',
  avodart: 'dutasteride',
  cialis: 'tadalafil',
  viagra: 'sildenafil',
  levitra: 'vardenafil',
  stendra: 'avanafil',
  myrbetriq: 'mirabegron',
  detrol: 'tolterodine',
  ditropan: 'oxybutynin',
  vesicare: 'solifenacin',
  enablex: 'darifenacin',
  sanctura: 'trospium',

  // ── Dermatology ───────────────────────────────────────────────────────────
  retin_a: 'tretinoin',
  renova: 'tretinoin',
  tazorac: 'tazarotene',
  differin: 'adapalene',
  epiduo: 'adapalene/benzoyl peroxide',
  aczone: 'dapsone',
  clindamycin: 'clindamycin',
  erythromycin_gel: 'erythromycin',
  accutane: 'isotretinoin',
  absorica: 'isotretinoin',
  soriatane: 'acitretin',
  otezla: 'apremilast',
  cosentyx: 'secukinumab',
  taltz: 'ixekizumab',
  tremfya: 'guselkumab',
  skyrizi: 'risankizumab',
  ilumya: 'tildrakizumab',
  hydrocortisone: 'hydrocortisone',
  triamcinolone: 'triamcinolone',
  betamethasone: 'betamethasone',
  clobetasol: 'clobetasol',
  mometasone: 'mometasone',

  // ── Osteoporosis / Bone ───────────────────────────────────────────────────
  fosamax: 'alendronate',
  actonel: 'risedronate',
  boniva: 'ibandronate',
  reclast: 'zoledronic acid',
  prolia: 'denosumab',
  forteo: 'teriparatide',
  tymlos: 'abaloparatide',
  evista: 'raloxifene',

  // ── Ophthalmology ─────────────────────────────────────────────────────────
  xalatan: 'latanoprost',
  lumigan: 'bimatoprost',
  travatan: 'travoprost',
  timoptic: 'timolol',
  alphagan: 'brimonidine',
  azopt: 'brinzolamide',
  trusopt: 'dorzolamide',
  combigan: 'brimonidine/timolol',
  restasis: 'cyclosporine ophthalmic',
  xiidra: 'lifitegrast',

  // ── Misc / Other ──────────────────────────────────────────────────────────
  colchicine: 'colchicine',
  colcrys: 'colchicine',
  uloric: 'febuxostat',
  zyloprim: 'allopurinol',
  krystexxa: 'pegloticase',
  actemra: 'tocilizumab',
  orencia: 'abatacept',
  xeljanz: 'tofacitinib',
  rinvoq: 'upadacitinib',
  olumiant: 'baricitinib',
  chantix: 'varenicline',
  champix: 'varenicline',
  zyban_smoking: 'bupropion',
  nicorette: 'nicotine',
  nicoderm: 'nicotine',
  vivitrol: 'naltrexone',
  revia: 'naltrexone',
  suboxone: 'buprenorphine/naloxone',
  subutex: 'buprenorphine',
  narcan: 'naloxone',
  evzio: 'naloxone',
};

/**
 * Resolve a medication name from a transcript token.
 * Returns { generic, wasBrandName } where:
 *   - generic = the resolved generic name (or the original if not found)
 *   - wasBrandName = true if the input was a brand name that was mapped
 */
export function resolveDrugName(raw: string): { generic: string; wasBrandName: boolean } {
  if (!raw?.trim()) return { generic: raw, wasBrandName: false };
  // Normalise: lowercase, replace hyphens/spaces with underscore for lookup
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const keyNoUnderscore = raw.trim().toLowerCase().replace(/[\s-]+/g, '');

  const generic = BRAND_TO_GENERIC[key]
    ?? BRAND_TO_GENERIC[keyNoUnderscore]
    ?? BRAND_TO_GENERIC[raw.trim().toLowerCase()];

  if (generic) {
    return { generic, wasBrandName: true };
  }
  return { generic: raw, wasBrandName: false };
}

/**
 * Apply brand-name resolution to a parsed medication name.
 * Returns the resolved generic name and whether it was a brand name.
 */
export function resolveGenericName(name: string | null): { name: string | null; wasBrandName: boolean } {
  if (!name) return { name: null, wasBrandName: false };
  const { generic, wasBrandName } = resolveDrugName(name);
  return { name: generic, wasBrandName };
}
