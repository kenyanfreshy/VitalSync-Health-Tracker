import { readFileSync, writeFileSync } from 'fs';

const path = '/home/ubuntu/VitalSync-App/app/log/vitals.tsx';
let src = readFileSync(path, 'utf8');

// 1. Add chipCounts memo after the filteredVitalsRecords memo
const memoInsertAfter = `  }, [records, vitalsDateRange, vitalsSortMode, vitalsTypeFilter]);`;
const chipCountsMemo = `
  // Count records per type from the date-filtered base (independent of active type filter)
  const chipCounts = useMemo(() => {
    let base = records;
    if (vitalsDateRange !== 'all') {
      const cutoff = Date.now() - (vitalsDateRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
      base = records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    }
    return {
      all:  base.length,
      bp:   base.filter(r => r.systolic != null || r.diastolic != null).length,
      hr:   base.filter(r => r.heartRate != null).length,
      spo2: base.filter(r => r.spo2 != null || r.oxygenSaturation != null).length,
      temp: base.filter(r => r.temperature != null).length,
      resp: base.filter(r => r.respiratoryRate != null).length,
      hrv:  base.filter(r => r.hrv != null).length,
    };
  }, [records, vitalsDateRange]);`;

if (!src.includes('chipCounts')) {
  src = src.replace(memoInsertAfter, memoInsertAfter + chipCountsMemo);
  console.log('Done: added chipCounts memo');
} else {
  console.log('Skip: chipCounts memo already present');
}

// 2. Replace the chip label rendering to include badge count
const oldChipLabel = `                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.muted }}>
                  {chip.label}
                </Text>`;
const newChipLabel = `                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.muted }}>
                  {chip.label}{chipCounts[chip.key] > 0 ? \` (\${chipCounts[chip.key]})\` : ''}
                </Text>`;

if (src.includes(oldChipLabel)) {
  src = src.replace(oldChipLabel, newChipLabel);
  console.log('Done: added badge counts to chip labels');
} else {
  console.log('WARN: chip label pattern not found — check for whitespace differences');
  // Try a more flexible match
  const flexOld = /(\s+<Text style=\{ fontSize: 12, fontWeight: '700', color: active \? '#fff' : colors\.muted \}>\s*\{chip\.label\}\s*<\/Text>)/;
  if (flexOld.test(src)) {
    src = src.replace(flexOld, (m) => m.replace('{chip.label}', "{chip.label}{chipCounts[chip.key] > 0 ? ` (${chipCounts[chip.key]})` : ''}"));
    console.log('Done (flex): added badge counts to chip labels');
  } else {
    console.log('ERR: could not find chip label to patch');
  }
}

writeFileSync(path, src, 'utf8');
console.log('Written:', path);
