/**
 * patch_hr_window_wire.mjs
 *
 * 1. Wires hrWindow state into health-context.tsx
 *    - loads saved preference on mount
 *    - passes window to aggregateHrTo4HourBuckets
 *    - exposes hrWindow + setHrWindow in context value
 *
 * 2. Adds HR Chart Resolution row to Appearance section in settings.tsx
 */
import { readFileSync, writeFileSync } from 'fs';

// ─── 1. Patch health-context.tsx ────────────────────────────────────────────
const hcPath = '/home/ubuntu/VitalSync-App/lib/health/health-context.tsx';
let hc = readFileSync(hcPath, 'utf8');

// Add hr-window-pref import
hc = hc.replace(
  `import { aggregateHrTo4HourBuckets, aggregatedToPulseRecords, getLatestHrRecord, type HrBucket } from './hr-aggregation';`,
  `import { aggregateHrTo4HourBuckets, aggregatedToPulseRecords, getLatestHrRecord, type HrBucket } from './hr-aggregation';
import { loadHrWindow, saveHrWindow, type HrWindowSize } from './hr-window-pref';`
);

// Add hrWindow and setHrWindow to HealthContextValue interface
hc = hc.replace(
  `  aggregatedHeartRate: HrBucket[];`,
  `  aggregatedHeartRate: HrBucket[];
  /** Active HR aggregation window size */
  hrWindow: HrWindowSize;
  /** Update and persist the HR aggregation window size */
  setHrWindow: (w: HrWindowSize) => void;`
);

// Add hrWindow state after the rawPulse line
hc = hc.replace(
  `  // ── 4-hour HR aggregation (derived, memoized) ──────────────────────────────
  const rawPulse = state.data?.pulse ?? [];`,
  `  // ── 4-hour HR aggregation (derived, memoized) ──────────────────────────────
  const rawPulse = state.data?.pulse ?? [];
  const [hrWindow, setHrWindowState] = useState<HrWindowSize>('4h');
  // Load persisted window preference on mount
  useEffect(() => {
    loadHrWindow().then(setHrWindowState);
  }, []);
  const setHrWindow = useCallback((w: HrWindowSize) => {
    setHrWindowState(w);
    saveHrWindow(w);
  }, []);`
);

// Pass hrWindow to aggregateHrTo4HourBuckets
hc = hc.replace(
  `    () => aggregateHrTo4HourBuckets(rawPulse),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawPulse.length, rawPulse[0]?.timestamp, rawPulse[rawPulse.length - 1]?.timestamp]`,
  `    () => aggregateHrTo4HourBuckets(rawPulse, hrWindow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawPulse.length, rawPulse[0]?.timestamp, rawPulse[rawPulse.length - 1]?.timestamp, hrWindow]`
);

// Add hrWindow and setHrWindow to the context value object
hc = hc.replace(
  `    aggregatedHeartRate,
    aggregatedHrRecords,
    latestHrRecord,`,
  `    aggregatedHeartRate,
    aggregatedHrRecords,
    latestHrRecord,
    hrWindow,
    setHrWindow,`
);

writeFileSync(hcPath, hc, 'utf8');
console.log('health-context.tsx patched');

// ─── 2. Patch settings.tsx ───────────────────────────────────────────────────
const stPath = '/home/ubuntu/VitalSync-App/app/(tabs)/settings.tsx';
let st = readFileSync(stPath, 'utf8');

// Add hr-window-pref import near the top (after other lib imports)
st = st.replace(
  `import { loadHrWindow, saveHrWindow, type HrWindowSize } from '@/lib/health/hr-window-pref';`,
  '' // remove if already present (idempotent)
);
// Add fresh import after the last @/lib import
st = st.replace(
  `import { useHealth } from '@/lib/health/health-context';`,
  `import { useHealth } from '@/lib/health/health-context';
import { HR_WINDOW_LABELS, type HrWindowSize } from '@/lib/health/hr-window-pref';`
);

// Destructure hrWindow and setHrWindow from useHealth
st = st.replace(
  `  const { state, forceSync, requestPermissions, recheckPermissions,`,
  `  const { state, forceSync, requestPermissions, recheckPermissions, hrWindow, setHrWindow,`
);

// Add the HR Chart Resolution setting row at the end of the Appearance section
// Insert before the closing </CollapsibleSection> of the Appearance section
// The Appearance section ends at line 1706 with </CollapsibleSection>
// We'll insert after the last SettingsRow in the Appearance GlassCard
const hrWindowRow = `
          {/* ── HR Chart Resolution ── */}
          <View style={[styles.settingsRow, { borderColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.rowIconWrap, { backgroundColor: colors.heartRed + '18' }]}>
                <IconSymbol name="waveform.path.ecg" size={16} color={colors.heartRed} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>HR Chart Resolution</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>
                  {HR_WINDOW_LABELS[hrWindow as HrWindowSize]}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 46 }}>
              {(['1h', '4h', 'daily'] as HrWindowSize[]).map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setHrWindow(w)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: hrWindow === w ? colors.heartRed + '20' : colors.surface,
                    borderWidth: 1,
                    borderColor: hrWindow === w ? colors.heartRed + '60' : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: hrWindow === w ? '700' : '400', color: hrWindow === w ? colors.heartRed : colors.muted }}>
                    {w === '1h' ? '1 hr' : w === '4h' ? '4 hr' : 'Daily'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>`;

// Insert before the closing </GlassCard> of the Appearance section
// The Appearance GlassCard ends just before </CollapsibleSection>
// Find the last </GlassCard> before the Appearance </CollapsibleSection>
// We'll use the Circadian reference block as an anchor
st = st.replace(
  `          { label: 'Blue Light & Melatonin (PMID 23509952)', url: 'https://pubmed.ncbi.nlm.nih.gov/23509952/', badge: 'PMID' },
          ]}
        />
        </CollapsibleSection>
        </View>
         {/* ─── My Profilee`,
  `          { label: 'Blue Light & Melatonin (PMID 23509952)', url: 'https://pubmed.ncbi.nlm.nih.gov/23509952/', badge: 'PMID' },
          ]}
        />
        ${hrWindowRow}
        </CollapsibleSection>
        </View>
         {/* ─── My Profilee`
);

writeFileSync(stPath, st, 'utf8');
console.log('settings.tsx patched');
console.log('Done');
