// Patch med-today-notification-card.tsx: add Snooze 30 min / 1 hour
import { readFileSync, writeFileSync } from 'fs';

const FILE = '/home/ubuntu/VitalSync-App/components/dashboard/med-today-notification-card.tsx';
let src = readFileSync(FILE, 'utf8');

// ── 1. Add onSnooze prop to interface ─────────────────────────────────────
const OLD_PROPS = `  /**
   * Called ONLY when the dose is marked as Taken.
   * Skip/Reschedule do NOT call this — the card stays visible with a status badge.
   */
  onDismiss: () => void;
}`;
const NEW_PROPS = `  /**
   * Called ONLY when the dose is marked as Taken.
   * Skip/Reschedule do NOT call this — the card stays visible with a status badge.
   */
  onDismiss: () => void;
  /**
   * Called when the user snoozes the reminder.
   * Parent should hide the card for the given duration (ms).
   */
  onSnooze?: (ms: number) => void;
}`;
if (src.includes(OLD_PROPS)) {
  src = src.replace(OLD_PROPS, NEW_PROPS);
  console.log('1. Added onSnooze prop to interface');
} else { console.error('WARNING: props interface not found'); }

// ── 2. Destructure onSnooze in component ─────────────────────────────────
const OLD_DESTRUCTURE = `}: MedTodayNotificationCardProps) {`;
const NEW_DESTRUCTURE = `  onSnooze,
}: MedTodayNotificationCardProps) {`;
// Only replace the last occurrence (inside the function signature)
const idx = src.lastIndexOf(OLD_DESTRUCTURE);
if (idx !== -1) {
  src = src.slice(0, idx) + NEW_DESTRUCTURE + src.slice(idx + OLD_DESTRUCTURE.length);
  console.log('2. Destructured onSnooze in component');
} else { console.error('WARNING: component destructure not found'); }

// ── 3. Add showSnooze state ───────────────────────────────────────────────
const OLD_STATE = `  const [showReschedule, setShowReschedule] = useState(false);`;
const NEW_STATE = `  const [showReschedule, setShowReschedule] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);`;
if (src.includes(OLD_STATE)) {
  src = src.replace(OLD_STATE, NEW_STATE);
  console.log('3. Added showSnooze state');
} else { console.error('WARNING: showReschedule state not found'); }

// ── 4. Add Snooze button to actionsRow (after Reschedule button) ──────────
const OLD_RESCHEDULE_BTN = `          {/* Reschedule */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderColor: isDark ? '#D9770640' : '#FDE68A' }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowReschedule(true);
            }}
            disabled={loading !== null}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
              ↻ Reschedule
            </Text>
          </TouchableOpacity>
        </View>
      )}`;

const NEW_RESCHEDULE_BTN = `          {/* Reschedule */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#78350F30' : '#FEF3C7', borderColor: isDark ? '#D9770640' : '#FDE68A' }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowReschedule(true);
              setShowSnooze(false);
            }}
            disabled={loading !== null}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
              ↻ Reschedule
            </Text>
          </TouchableOpacity>
          {/* Snooze */}
          {onSnooze && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isDark ? '#0C2A4A30' : '#EFF6FF', borderColor: isDark ? '#3B82F640' : '#BFDBFE' }]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowSnooze(s => !s);
                setShowReschedule(false);
              }}
              disabled={loading !== null}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={[styles.actionBtnText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
                \u23F0 Snooze
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Snooze duration picker */}
      {showSnooze && onSnooze && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.muted, flex: 1 }}>Snooze for:</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#0C2A4A30' : '#EFF6FF', borderColor: isDark ? '#3B82F640' : '#BFDBFE' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSnooze(30 * 60 * 1000);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowSnooze(false);
            }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>30 min</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#0C2A4A30' : '#EFF6FF', borderColor: isDark ? '#3B82F640' : '#BFDBFE' }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSnooze(60 * 60 * 1000);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowSnooze(false);
            }}
          >
            <Text style={[styles.actionBtnText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>1 hour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? '#1C1030' : '#F5F3FF', borderColor: urgentBorder }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowSnooze(false);
            }}
          >
            <Text style={[styles.actionBtnText, { color: colors.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}`;

if (src.includes(OLD_RESCHEDULE_BTN)) {
  src = src.replace(OLD_RESCHEDULE_BTN, NEW_RESCHEDULE_BTN);
  console.log('4. Added Snooze button and duration picker');
} else { console.error('WARNING: reschedule button block not found'); }

writeFileSync(FILE, src, 'utf8');
console.log('Done.');
