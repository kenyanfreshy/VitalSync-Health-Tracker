/**
 * patch_settings_hr_row.mjs
 *
 * Inserts the HR Chart Resolution setting row into the Appearance section
 * of settings.tsx, just before the EvidenceRefBanner closing the section.
 */
import { readFileSync, writeFileSync } from 'fs';

const path = '/home/ubuntu/VitalSync-App/app/(tabs)/settings.tsx';
let src = readFileSync(path, 'utf8');

// The anchor: the closing </GlassCard> just before EvidenceRefBanner in Appearance
const anchor = `        </GlassCard>
        <EvidenceRefBanner
          accentColor="#8B5CF6"
          heading="Circadian & Chronobiology"`;

const hrRow = `        </GlassCard>
        {/* ── HR Chart Resolution ── */}
        <GlassCard accentColor="#EF4444" noPadding style={{ marginHorizontal: 16, marginTop: 12 }}>
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
                    backgroundColor: hrWindow === w ? (colors.heartRed + '20') : colors.surface,
                    borderWidth: 1,
                    borderColor: hrWindow === w ? (colors.heartRed + '60') : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: hrWindow === w ? '700' : '400', color: hrWindow === w ? colors.heartRed : colors.muted }}>
                    {w === '1h' ? '1 hr' : w === '4h' ? '4 hr' : 'Daily'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassCard>
        <EvidenceRefBanner
          accentColor="#8B5CF6"
          heading="Circadian & Chronobiology"`;

if (!src.includes(anchor)) {
  console.error('ERROR: anchor not found in settings.tsx');
  process.exit(1);
}

src = src.replace(anchor, hrRow);
writeFileSync(path, src, 'utf8');
console.log('settings.tsx HR row inserted');
