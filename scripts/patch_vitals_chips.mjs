// Patch vitals.tsx: add type filter chips to history list
import { readFileSync, writeFileSync } from 'fs';

const FILE = '/home/ubuntu/VitalSync-App/app/log/vitals.tsx';
let src = readFileSync(FILE, 'utf8');

// ── 1. Add vitalsTypeFilter state after vitalsSortMode ────────────────────
const OLD_SORT_STATE = `  type VitalsSortMode = 'date' | 'type';
  const [vitalsSortMode, setVitalsSortMode] = useState<VitalsSortMode>('date');`;

const NEW_SORT_STATE = `  type VitalsSortMode = 'date' | 'type';
  const [vitalsSortMode, setVitalsSortMode] = useState<VitalsSortMode>('date');
  type VitalsTypeFilter = 'all' | 'bp' | 'hr' | 'spo2' | 'temp' | 'resp' | 'hrv';
  const [vitalsTypeFilter, setVitalsTypeFilter] = useState<VitalsTypeFilter>('all');`;

if (src.includes(OLD_SORT_STATE)) {
  src = src.replace(OLD_SORT_STATE, NEW_SORT_STATE);
  console.log('1. Added vitalsTypeFilter state');
} else {
  console.error('WARNING: vitalsSortMode state not found');
}

// ── 2. Add type filter to filteredVitalsRecords useMemo ───────────────────
const OLD_MEMO_END = `    if (vitalsSortMode === 'type') {
      return [...base].sort((a, b) => {
        const ta = TYPE_ORDER.indexOf(getVitalType(a));
        const tb = TYPE_ORDER.indexOf(getVitalType(b));
        if (ta !== tb) return ta - tb;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    }
    return [...base].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [records, vitalsDateRange, vitalsSortMode]);`;

const NEW_MEMO_END = `    // Apply type filter chip
    if (vitalsTypeFilter !== 'all') {
      base = base.filter(r => {
        switch (vitalsTypeFilter) {
          case 'bp':   return r.systolic != null || r.diastolic != null;
          case 'hr':   return r.heartRate != null;
          case 'spo2': return r.spo2 != null || r.oxygenSaturation != null;
          case 'temp': return r.temperature != null;
          case 'resp': return r.respiratoryRate != null;
          case 'hrv':  return r.hrv != null;
          default:     return true;
        }
      });
    }
    if (vitalsSortMode === 'type') {
      return [...base].sort((a, b) => {
        const ta = TYPE_ORDER.indexOf(getVitalType(a));
        const tb = TYPE_ORDER.indexOf(getVitalType(b));
        if (ta !== tb) return ta - tb;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    }
    return [...base].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [records, vitalsDateRange, vitalsSortMode, vitalsTypeFilter]);`;

if (src.includes(OLD_MEMO_END)) {
  src = src.replace(OLD_MEMO_END, NEW_MEMO_END);
  console.log('2. Added type filter to useMemo');
} else {
  console.error('WARNING: useMemo end not found');
}

// ── 3. Add filter chip row between the header row and the stats bar ────────
const OLD_STATS_BAR = `        {/* ─── Mini stats bar (shown only when a date range is active) ────── */}
        {vitalsStats && (`;

const TYPE_CHIPS = `        {/* ─── Type filter chips ─────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 6, flexDirection: 'row' }}
        >
          {([
            { key: 'all',  label: 'All' },
            { key: 'bp',   label: 'BP' },
            { key: 'hr',   label: 'HR' },
            { key: 'spo2', label: 'SpO\u2082' },
            { key: 'temp', label: 'Temp' },
            { key: 'resp', label: 'Resp' },
            { key: 'hrv',  label: 'HRV' },
          ] as const).map(chip => {
            const active = vitalsTypeFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => {
                  setVitalsTypeFilter(chip.key);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.muted }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* ─── Mini stats bar (shown only when a date range is active) ────── */}
        {vitalsStats && (`;

if (src.includes(OLD_STATS_BAR)) {
  src = src.replace(OLD_STATS_BAR, TYPE_CHIPS);
  console.log('3. Added type filter chip row');
} else {
  console.error('WARNING: stats bar anchor not found');
}

writeFileSync(FILE, src, 'utf8');
console.log('Done.');
