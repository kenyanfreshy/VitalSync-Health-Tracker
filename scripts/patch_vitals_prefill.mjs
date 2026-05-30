// Patch vitals.tsx: pre-fill BP, HR, SpO2 placeholders with most recent saved values
import { readFileSync, writeFileSync } from 'fs';

const FILE = '/home/ubuntu/VitalSync-App/app/log/vitals.tsx';
let src = readFileSync(FILE, 'utf8');

// ── 1. Add lastRecord derivation after records definition ──────────────────
const OLD_RECORDS = `  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = state.data?.vitalSigns ?? [];`;

const NEW_RECORDS = `  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = state.data?.vitalSigns ?? [];
  // Most recent record that has each field — used for placeholder pre-fill
  const lastBPRecord = records.find(r => r.systolic != null && r.diastolic != null);
  const lastHRRecord = records.find(r => r.heartRate != null);
  const lastHRVRecord = records.find(r => r.hrv != null);
  const lastSpo2Record = records.find(r => r.spo2 != null);
  const lastTempRecord = records.find(r => r.temperature != null);
  const lastRespRecord = records.find(r => r.respiratoryRate != null);`;

if (src.includes(OLD_RECORDS)) {
  src = src.replace(OLD_RECORDS, NEW_RECORDS);
  console.log('1. Added lastRecord derivations');
} else {
  console.error('WARNING: records definition not found');
}

// ── 2. Update VitalField placeholders to show last values ──────────────────
// Systolic
const OLD_SYS = `            <VitalField label={l.systolic} value={systolic} onChangeText={setSystolic} placeholder="120" unit="mmHg" colors={colors} />`;
const NEW_SYS = `            <VitalField label={l.systolic} value={systolic} onChangeText={setSystolic} placeholder={lastBPRecord?.systolic != null ? String(lastBPRecord.systolic) : '120'} unit="mmHg" colors={colors} />`;
if (src.includes(OLD_SYS)) { src = src.replace(OLD_SYS, NEW_SYS); console.log('2a. Systolic placeholder updated'); }
else { console.error('WARNING: systolic VitalField not found'); }

// Diastolic
const OLD_DIA = `            <VitalField label={l.diastolic} value={diastolic} onChangeText={setDiastolic} placeholder="80" unit="mmHg" colors={colors} />`;
const NEW_DIA = `            <VitalField label={l.diastolic} value={diastolic} onChangeText={setDiastolic} placeholder={lastBPRecord?.diastolic != null ? String(lastBPRecord.diastolic) : '80'} unit="mmHg" colors={colors} />`;
if (src.includes(OLD_DIA)) { src = src.replace(OLD_DIA, NEW_DIA); console.log('2b. Diastolic placeholder updated'); }
else { console.error('WARNING: diastolic VitalField not found'); }

// Heart Rate
const OLD_HR = `            <VitalField label={l.heartRate} value={heartRate} onChangeText={setHeartRate} placeholder="72" unit="bpm" colors={colors} />`;
const NEW_HR = `            <VitalField label={l.heartRate} value={heartRate} onChangeText={setHeartRate} placeholder={lastHRRecord?.heartRate != null ? String(lastHRRecord.heartRate) : '72'} unit="bpm" colors={colors} />`;
if (src.includes(OLD_HR)) { src = src.replace(OLD_HR, NEW_HR); console.log('2c. Heart rate placeholder updated'); }
else { console.error('WARNING: heartRate VitalField not found'); }

// HRV
const OLD_HRV = `            <VitalField label="HRV" value={hrv} onChangeText={setHrv} placeholder="45" unit="ms" colors={colors} />`;
const NEW_HRV = `            <VitalField label="HRV" value={hrv} onChangeText={setHrv} placeholder={lastHRVRecord?.hrv != null ? String(lastHRVRecord.hrv) : '45'} unit="ms" colors={colors} />`;
if (src.includes(OLD_HRV)) { src = src.replace(OLD_HRV, NEW_HRV); console.log('2d. HRV placeholder updated'); }
else { console.error('WARNING: HRV VitalField not found'); }

// SpO2
const OLD_SPO2 = `            <VitalField label={l.spo2} value={spo2} onChangeText={setSpo2} placeholder="98" unit="%" colors={colors} />`;
const NEW_SPO2 = `            <VitalField label={l.spo2} value={spo2} onChangeText={setSpo2} placeholder={lastSpo2Record?.spo2 != null ? String(lastSpo2Record.spo2) : '98'} unit="%" colors={colors} />`;
if (src.includes(OLD_SPO2)) { src = src.replace(OLD_SPO2, NEW_SPO2); console.log('2e. SpO2 placeholder updated'); }
else { console.error('WARNING: spo2 VitalField not found'); }

// Temperature
const OLD_TEMP = `            <VitalField label={l.temperature} value={temperature} onChangeText={setTemperature} placeholder={tempUnit === 'C' ? '37.0' : '98.6'} unit={\`\u00b0\${tempUnit}\`} colors={colors} />`;
const NEW_TEMP = `            <VitalField label={l.temperature} value={temperature} onChangeText={setTemperature} placeholder={lastTempRecord?.temperature != null ? (tempUnit === 'C' ? String(((lastTempRecord.temperature - 32) * 5 / 9).toFixed(1)) : String(lastTempRecord.temperature)) : (tempUnit === 'C' ? '37.0' : '98.6')} unit={\`\u00b0\${tempUnit}\`} colors={colors} />`;
if (src.includes(OLD_TEMP)) { src = src.replace(OLD_TEMP, NEW_TEMP); console.log('2f. Temperature placeholder updated'); }
else { console.error('WARNING: temperature VitalField not found'); }

// Respiratory rate
const OLD_RESP = `            <VitalField label={l.respRate} value={respiratoryRate} onChangeText={setRespiratoryRate} placeholder="16" unit="/min" colors={colors} />`;
const NEW_RESP = `            <VitalField label={l.respRate} value={respiratoryRate} onChangeText={setRespiratoryRate} placeholder={lastRespRecord?.respiratoryRate != null ? String(lastRespRecord.respiratoryRate) : '16'} unit="/min" colors={colors} />`;
if (src.includes(OLD_RESP)) { src = src.replace(OLD_RESP, NEW_RESP); console.log('2g. Respiratory rate placeholder updated'); }
else { console.error('WARNING: respiratoryRate VitalField not found'); }

writeFileSync(FILE, src, 'utf8');
console.log('Done.');
