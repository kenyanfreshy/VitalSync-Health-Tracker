// Node.js script to add sort-by-type to vitals.tsx history list
import { readFileSync, writeFileSync } from 'fs';

const FILE = '/home/ubuntu/VitalSync-App/app/log/vitals.tsx';
let src = readFileSync(FILE, 'utf8');

// ── 1. Add vitalsSortMode state after vitalsDateRange ──────────────────────
const OLD_STATE = `  const [vitalsDateRange, setVitalsDateRange] = useState<VitalsDateRange>('all');`;
const NEW_STATE = `  const [vitalsDateRange, setVitalsDateRange] = useState<VitalsDateRange>('all');
  type VitalsSortMode = 'date' | 'type';
  const [vitalsSortMode, setVitalsSortMode] = useState<VitalsSortMode>('date');`;

if (src.includes(OLD_STATE)) {
  src = src.replace(OLD_STATE, NEW_STATE);
  console.log('1. Added vitalsSortMode state');
} else {
  console.error('WARNING: vitalsDateRange state not found');
}

// ── 2. Replace filteredVitalsRecords useMemo ───────────────────────────────
const OLD_MEMO = `  const filteredVitalsRecords = useMemo(() => {
    if (vitalsDateRange === 'all') return records;
    const cutoff = Date.now() - (vitalsDateRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    return records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
  }, [records, vitalsDateRange]);`;

const NEW_MEMO = `  // Assign a type label for sort-by-type grouping
  const getVitalType = (r: typeof records[0]): string => {
    if ((r.systolic != null) || (r.diastolic != null)) return 'Blood Pressure';
    if (r.heartRate != null) return 'Heart Rate';
    if ((r.spo2 != null) || (r.oxygenSaturation != null)) return 'SpO\u2082';
    if (r.temperature != null) return 'Temperature';
    if (r.respiratoryRate != null) return 'Respiratory Rate';
    if (r.hrv != null) return 'HRV';
    if (r.weightKg != null) return 'Weight';
    if (r.sleepBedtime != null) return 'Sleep';
    return 'Other';
  };
  const TYPE_ORDER = ['Blood Pressure', 'Heart Rate', 'SpO\u2082', 'Temperature', 'Respiratory Rate', 'HRV', 'Weight', 'Sleep', 'Other'];
  const filteredVitalsRecords = useMemo(() => {
    let base = records;
    if (vitalsDateRange !== 'all') {
      const cutoff = Date.now() - (vitalsDateRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
      base = records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
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
  }, [records, vitalsDateRange, vitalsSortMode]);`;

if (src.includes(OLD_MEMO)) {
  src = src.replace(OLD_MEMO, NEW_MEMO);
  console.log('2. Updated filteredVitalsRecords useMemo');
} else {
  console.error('WARNING: filteredVitalsRecords useMemo not found');
}

// ── 3. Add sort toggle button in history header ────────────────────────────
const OLD_HEADER = `        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={s.sectionTitle}>{l.history}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['7d', '30d', 'all'] as const).map(r => (
              <Pressable
                key={r}
                onPress={() => { setVitalsDateRange(r); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={({ pressed }) => [{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: vitalsDateRange === r ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: vitalsDateRange === r ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: vitalsDateRange === r ? '#fff' : colors.muted }}>
                  {r === '7d' ? '7d' : r === '30d' ? '30d' : 'All'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>`;

const NEW_HEADER = `        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={s.sectionTitle}>{l.history}</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {/* Sort-by-type toggle */}
            <Pressable
              onPress={() => {
                setVitalsSortMode(m => m === 'date' ? 'type' : 'date');
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: vitalsSortMode === 'type' ? colors.primary + '22' : colors.surface,
                borderWidth: 1, borderColor: vitalsSortMode === 'type' ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: vitalsSortMode === 'type' ? colors.primary : colors.muted }}>
                {vitalsSortMode === 'type' ? '\u229e By Type \u2713' : '\u229e By Type'}
              </Text>
            </Pressable>
            <View style={{ width: 1, height: 16, backgroundColor: colors.border }} />
            {(['7d', '30d', 'all'] as const).map(r => (
              <Pressable
                key={r}
                onPress={() => { setVitalsDateRange(r); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={({ pressed }) => [{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: vitalsDateRange === r ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: vitalsDateRange === r ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: vitalsDateRange === r ? '#fff' : colors.muted }}>
                  {r === '7d' ? '7d' : r === '30d' ? '30d' : 'All'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>`;

if (src.includes(OLD_HEADER)) {
  src = src.replace(OLD_HEADER, NEW_HEADER);
  console.log('3. Added sort toggle button to history header');
} else {
  console.error('WARNING: history header not found');
}

// ── 4. Add type-grouped view before FlatList and wrap FlatList ────────────
const OLD_FLATLIST_START = `        <FlatList
          data={filteredVitalsRecords}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.empty}>{vitalsDateRange === 'all' ? l.vitalsEmpty : 'No records in this period.'}</Text>}
          renderItem={({ item }) => {`;

const TYPE_GROUPED_JSX = `        {vitalsSortMode === 'type' && (() => {
          if (filteredVitalsRecords.length === 0) {
            return <Text style={[s.empty, { marginHorizontal: 16 }]}>{vitalsDateRange === 'all' ? l.vitalsEmpty : 'No records in this period.'}</Text>;
          }
          // Build sections grouped by type
          const sections: { type: string; data: typeof filteredVitalsRecords }[] = [];
          for (const r of filteredVitalsRecords) {
            const t = getVitalType(r);
            const last = sections[sections.length - 1];
            if (last && last.type === t) { last.data.push(r); }
            else { sections.push({ type: t, data: [r] }); }
          }
          return (
            <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
              {sections.map(section => (
                <View key={section.type}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 6, gap: 8 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {section.type} ({section.data.length})
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </View>
                  {section.data.map(item => {
                    const hasBP = item.systolic != null || item.diastolic != null;
                    const bpStatus = (item.systolic != null && item.diastolic != null) ? getBPStatus(item.systolic, item.diastolic) : null;
                    const bpColor = bpStatus ? getBPStatusColor(bpStatus, colors as unknown as Record<string, string>) : colors.muted;
                    const weightDisplay = item.weightKg
                      ? item.weightUnit === 'lbs'
                        ? \`\u2696\uFE0F \${kgToLbs(item.weightKg)} lbs\`
                        : \`\u2696\uFE0F \${item.weightKg} kg\`
                      : null;
                    const hasSleep = item.sleepBedtime && item.sleepWakeTime;
                    return (
                      <View key={item.id} style={s.row}>
                        <View style={s.rowLeft}>
                          {hasBP && (
                            <View style={s.bpRow}>
                              <Text style={s.rowValue}>{item.systolic ?? '--'}/{item.diastolic ?? '--'}</Text>
                              <Text style={s.mmhg}> mmHg</Text>
                              {bpStatus && (
                                <View style={[s.badge, { backgroundColor: bpColor + '22' }]}>
                                  <Text style={[s.badgeText, { color: bpColor }]}>{getBPStatusLabel(bpStatus)}</Text>
                                </View>
                              )}
                            </View>
                          )}
                          <View style={s.pillRow}>
                            {item.heartRate       && <Text style={s.pill}>\u2764\uFE0F {item.heartRate} bpm</Text>}
                            {item.hrv             && <Text style={s.pill}>\uD83D\uDC9C HRV {item.hrv} ms</Text>}
                            {item.spo2            && <Text style={s.pill}>\uD83E\uDEB1 {item.spo2}% SpO\u2082</Text>}
                            {item.temperature     && <Text style={s.pill}>\uD83C\uDF21\uFE0F {tempUnit === 'C' ? fToC(item.temperature).toFixed(1) : item.temperature}\xB0{tempUnit}</Text>}
                            {item.respiratoryRate && <Text style={s.pill}>\uD83D\uDCA8 {item.respiratoryRate}/min</Text>}
                            {weightDisplay        && <Text style={s.pill}>{weightDisplay}</Text>}
                            {hasSleep && (
                              <Text style={s.pill}>
                                \uD83C\uDF19 {formatTimeHHMM(item.sleepBedtime!)}\u2013{formatTimeHHMM(item.sleepWakeTime!)}
                                {item.sleepTotalMinutes ? \` \xB7 \${formatDuration(item.sleepTotalMinutes)}\` : ''}
                                {item.sleepEfficiency ? \` \xB7 \${item.sleepEfficiency}% eff\` : ''}
                              </Text>
                            )}
                          </View>
                          <Text style={s.rowSub}>{formatDate(item.timestamp)}</Text>
                          {item.note ? <Text style={s.rowNote}>{item.note}</Text> : null}
                        </View>
                        <Pressable
                          onPress={() => handleDelete(item.id)}
                          style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.5 }]}
                        >
                          <IconSymbol name="xmark" size={16} color={colors.error} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })()}
        {vitalsSortMode === 'date' && <FlatList
          data={filteredVitalsRecords}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.empty}>{vitalsDateRange === 'all' ? l.vitalsEmpty : 'No records in this period.'}</Text>}
          renderItem={({ item }) => {`;

if (src.includes(OLD_FLATLIST_START)) {
  src = src.replace(OLD_FLATLIST_START, TYPE_GROUPED_JSX);
  console.log('4. Added type-grouped view and wrapped FlatList');
} else {
  console.error('WARNING: FlatList start not found');
}

// ── 5. Close the FlatList with the date-mode condition ─────────────────────
const OLD_END = `        />
      </ScrollView>
    </ScreenContainer>
  );`;
const NEW_END = `        />}
      </ScrollView>
    </ScreenContainer>
  );`;

if (src.includes(OLD_END)) {
  src = src.replace(OLD_END, NEW_END);
  console.log('5. Closed FlatList date-mode condition');
} else {
  console.error('WARNING: FlatList end not found');
}

writeFileSync(FILE, src, 'utf8');
console.log('Done. File written successfully.');
