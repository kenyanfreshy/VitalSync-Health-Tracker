/**
 * PersonalNarrativeCard
 *
 * A collapsible dashboard card that renders a concise prose-style summary of:
 *   • Medications — taken / skipped / missed doses in the selected time window
 *     + a 7-bar daily adherence sparkline (green = taken, amber = skipped, red = missed/no-log)
 *   • Lab Results — most recent panel in the window with any abnormal flags + "N days ago" recency
 *   • Appointments — next upcoming appointment
 *
 * Time-window selector: Today / 7d / 30d pill row below the header.
 * Window preference is persisted to AsyncStorage (key: "personal-narrative-window").
 *
 * Uses dashboardStrings for full i18n support across all 27 languages.
 * Collapse/expand state is persisted via useCardExpanded (AsyncStorage key:
 * "personal-narrative").  Defaults to expanded.
 */
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { useRouter } from 'expo-router';
import { useColors, useDashboardStrings } from '@/hooks';
import { useCardExpanded } from '@/hooks/use-card-expanded';
import { GlassCard } from '@/components/glass-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Medication } from '@/lib/medications/types';
import type { DoctorAppointment, HealthData } from '@/lib/health/types';
import { getAnalyteStatus, LAB_PANEL_LABELS } from '@/lib/health/lab-types';
import type { LabResult } from '@/lib/health/lab-types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const WINDOW_STORAGE_KEY = 'personal-narrative-window';

// ─── Types ────────────────────────────────────────────────────────────────────
type NarrativeWindow = 'today' | '7d' | '30d';

// ─── Props ────────────────────────────────────────────────────────────────────
interface PersonalNarrativeCardProps {
  medications: Medication[];
  data: HealthData | null;
  /** External collapse override (e.g. from a "Collapse All" button) */
  overrideExpanded?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatRelativeDate(isoDate: string, ds: ReturnType<typeof useDashboardStrings>): string {
  const now = new Date();
  const target = new Date(isoDate);
  const todayStr = now.toISOString().split('T')[0];
  const targetStr = target.toISOString().split('T')[0];
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  if (targetStr === todayStr) return ds.narrativeToday;
  if (targetStr === tomorrowStr) return ds.narrativeTomorrow;

  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays > 0) {
    return ds.narrativeDaysAgo.replace('{n}', String(diffDays)) + ' from now';
  }
  const absDays = Math.abs(diffDays);
  return ds.narrativeDaysAgo.replace('{n}', String(absDays));
}

/**
 * Builds a "CBC · 3 days ago" style label.
 */
function buildLabDateLabel(
  isoDate: string,
  ds: ReturnType<typeof useDashboardStrings>,
): string {
  const now = new Date();
  const target = new Date(isoDate);
  const todayStr = now.toISOString().split('T')[0];
  const targetStr = target.toISOString().split('T')[0];

  if (targetStr === todayStr) return ds.narrativeToday;

  const diffMs = now.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays <= 0) {
    return formatRelativeDate(isoDate, ds);
  }

  return ds.narrativeDaysAgo.replace('{n}', String(diffDays));
}

/** Returns the start-of-day ISO date string N days ago */
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/** Returns an array of ISO date strings for the last N days (oldest first) */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
/**
 * 7-bar daily adherence sparkline.
 * Each bar represents one day (oldest → newest, left → right).
 * Green = all doses taken, amber = some skipped, red = missed/no log.
 */
function AdherenceSparkline({
  medications,
}: {
  medications: Medication[];
}) {
  const days = lastNDays(7);

  const bars = useMemo(() => {
    return days.map(day => {
      const activeMeds = medications.filter(m => m.active !== false);
      if (activeMeds.length === 0) return 'none' as const;

      let taken = 0, skipped = 0, missed = 0, total = 0;
      for (const med of activeMeds) {
        const logs = (med.doseLogs ?? []).filter(l => l.date === day);
        for (const log of logs) {
          total++;
          if (log.status === 'taken') taken++;
          else if (log.status === 'skipped') skipped++;
          else missed++;
        }
      }
      if (total === 0) return 'none' as const;
      if (missed > 0) return 'missed' as const;
      if (skipped > 0) return 'skipped' as const;
      return 'taken' as const;
    });
  }, [medications, days]);

  const BAR_COLORS = {
    taken:   '#22C55E',
    skipped: '#F59E0B',
    missed:  '#EF4444',
    none:    'rgba(150,150,150,0.2)',
  };

  return (
    <View style={sparkStyles.row}>
      {bars.map((status, i) => (
        <View
          key={i}
          style={[
            sparkStyles.bar,
            {
              backgroundColor: BAR_COLORS[status],
              height: status === 'none' ? 12 : status === 'taken' ? 20 : 16,
            },
          ]}
        />
      ))}
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 8,
    marginBottom: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 3,
    minHeight: 12,
  },
});

// ─── Sub-section row ─────────────────────────────────────────────────────────
function NarrativeSection({
  icon,
  title,
  accentColor,
  onPress,
  children,
}: {
  icon: string;
  title: string;
  accentColor: string;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.section, { borderLeftColor: accentColor + '60' }]}
    >
      <View style={styles.sectionHeader}>
        <Text style={{ fontSize: 14 }}>{icon}</Text>
        <Text style={[styles.sectionTitle, { color: accentColor }]}>{title}</Text>
        {onPress && <IconSymbol name="chevron.right" size={12} color={colors.muted} />}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Wrapper>
  );
}

// ─── Window Pill Selector ─────────────────────────────────────────────────────
function WindowSelector({
  window: win,
  onChange,
  ds,
}: {
  window: NarrativeWindow;
  onChange: (w: NarrativeWindow) => void;
  ds: ReturnType<typeof useDashboardStrings>;
}) {
  const colors = useColors();
  const PILLS: { key: NarrativeWindow; label: string }[] = [
    { key: 'today', label: ds.winToday },
    { key: '7d',   label: ds.win7d   },
    { key: '30d',  label: ds.win30d  },
  ];
  return (
    <View style={styles.windowRow}>
      {PILLS.map(p => {
        const active = win === p.key;
        return (
          <TouchableOpacity
            key={p.key}
            onPress={() => onChange(p.key)}
            activeOpacity={0.7}
            style={[
              styles.windowPill,
              active
                ? { backgroundColor: '#6366F1', borderColor: '#6366F1' }
                : { backgroundColor: 'transparent', borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.windowPillText,
                { color: active ? '#FFFFFF' : colors.muted },
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PersonalNarrativeCard({
  medications,
  data,
  overrideExpanded,
}: PersonalNarrativeCardProps) {
  const colors = useColors();
  const ds = useDashboardStrings();
  const router = useRouter();

  // Time-window selector state — persisted to AsyncStorage
  const [narrativeWindow, setNarrativeWindowState] = useState<NarrativeWindow>('today');
  const [windowLoaded, setWindowLoaded] = useState(false);

  // Load persisted window preference on mount
  useEffect(() => {
    AsyncStorage.getItem(WINDOW_STORAGE_KEY).then(val => {
      if (val === 'today' || val === '7d' || val === '30d') {
        setNarrativeWindowState(val);
      }
      setWindowLoaded(true);
    }).catch(() => setWindowLoaded(true));
  }, []);

  const setNarrativeWindow = useCallback((w: NarrativeWindow) => {
    setNarrativeWindowState(w);
    safeSetItem(WINDOW_STORAGE_KEY, w).catch(() => {});
  }, []);

  // Collapsible state — defaults to expanded (true), persisted across sessions
  const [expanded, setExpanded] = useCardExpanded('personal-narrative', true, overrideExpanded);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

  // ── Medications ──────────────────────────────────────────────────────────
  const medSummary = useMemo(() => {
    const activeMeds = medications.filter(m => m.active !== false);
    if (activeMeds.length === 0) return null;

    const todayKey = new Date().toISOString().split('T')[0];
    const windowDays = narrativeWindow === 'today' ? 0 : narrativeWindow === '7d' ? 7 : 30;
    const windowStart = windowDays > 0 ? daysAgoISO(windowDays) : todayKey;

    let taken = 0, skipped = 0, missed = 0;
    const medLines: { name: string; status: string; statusColor: string }[] = [];

    for (const med of activeMeds) {
      const windowLogs = (med.doseLogs ?? []).filter(l => {
        if (narrativeWindow === 'today') return l.date === todayKey;
        return l.date >= windowStart && l.date <= todayKey;
      });
      for (const log of windowLogs) {
        if (log.status === 'taken') taken++;
        else if (log.status === 'skipped') skipped++;
        else if (log.status === 'missed') missed++;
      }
      // For the line list, show today's status only (to keep it concise)
      const todayLogs = (med.doseLogs ?? []).filter(l => l.date === todayKey);
      for (const log of todayLogs) {
        const statusLabel =
          log.status === 'taken' ? ds.narrativeTaken :
          log.status === 'skipped' ? ds.narrativeSkipped :
          ds.narrativeMissed;
        const statusColor =
          log.status === 'taken' ? '#22C55E' :
          log.status === 'skipped' ? '#F59E0B' :
          '#EF4444';
        medLines.push({ name: med.name, status: statusLabel, statusColor });
      }
    }

    // Rolling adherence rate for 7d/30d windows
    const totalDoses = taken + skipped + missed;
    const adherenceRate = totalDoses > 0 ? Math.round((taken / totalDoses) * 100) : null;

    return { taken, skipped, missed, lines: medLines.slice(0, 5), adherenceRate, totalDoses };
  }, [medications, ds, narrativeWindow]);

  // ── Lab Results ──────────────────────────────────────────────────────────
  const labSummary = useMemo(() => {
    const results: LabResult[] = (data?.labResults ?? []);
    if (results.length === 0) return null;

    const todayKey = new Date().toISOString().split('T')[0];
    const windowDays = narrativeWindow === 'today' ? 0 : narrativeWindow === '7d' ? 7 : 30;
    const windowStart = windowDays > 0 ? daysAgoISO(windowDays) : todayKey;

    // Filter to window
    const windowResults = results.filter(r => {
      const d = r.timestamp.split('T')[0];
      if (narrativeWindow === 'today') return d === todayKey;
      return d >= windowStart && d <= todayKey;
    });

    const pool = windowResults.length > 0 ? windowResults : results;
    const latest = [...pool].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    const panelLabel = LAB_PANEL_LABELS[latest.panel] ?? latest.panel;
    const analytes = Object.entries(latest.values) as [string, number][];
    const abnormal = analytes.filter(([id, val]) => {
      const status = getAnalyteStatus(id as any, val);
      return status !== 'normal';
    });

    const daysAgoLabel = buildLabDateLabel(latest.timestamp, ds);
    const dateLabel = `${panelLabel} · ${daysAgoLabel}`;

    return {
      panelLabel,
      dateLabel,
      abnormalCount: abnormal.length,
      totalCount: analytes.length,
      inWindow: windowResults.length > 0,
    };
  }, [data?.labResults, ds, narrativeWindow]);

  // ── Appointments ─────────────────────────────────────────────────────────
  const apptSummary = useMemo(() => {
    const upcoming: DoctorAppointment[] = (data?.appointments ?? [])
      .filter(a => new Date(a.dateTime).getTime() > Date.now())
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    if (upcoming.length === 0) return null;
    const next = upcoming[0];
    const dateLabel = formatRelativeDate(next.dateTime, ds);
    const timeStr = new Date(next.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      doctorName: next.doctorName || 'Doctor',
      specialty: next.specialty,
      dateLabel,
      timeStr,
      totalUpcoming: upcoming.length,
    };
  }, [data?.appointments, ds]);

  // Don't render until window preference is loaded (avoids flicker)
  if (!windowLoaded) return null;

  return (
    <GlassCard
      accentColor="#6366F1"
      noPadding
      style={{ marginHorizontal: 16, marginBottom: 8 }}
    >
      {/* ── Tappable header ── */}
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.75}
        style={[styles.header, { paddingHorizontal: 14, paddingTop: 14, paddingBottom: expanded ? 0 : 14 }]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `${ds.narrativeTitle} — ${ds.collapseAll}` : `${ds.narrativeTitle} — ${ds.expandAll}`}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {ds.narrativeTitle}
          </Text>
          <View style={[styles.headerBadge, { backgroundColor: '#6366F120' }]}>
            <Text style={[styles.headerBadgeText, { color: '#6366F1' }]}>
              {new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
        <IconSymbol
          name={expanded ? 'chevron.up' : 'chevron.down'}
          size={16}
          color={colors.muted}
        />
      </TouchableOpacity>

      {/* ── Collapsible body ── */}
      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <View style={styles.divider} />

          {/* ── Time-window selector ── */}
          <WindowSelector window={narrativeWindow} onChange={setNarrativeWindow} ds={ds} />

          {/* ── Medications ── */}
          <NarrativeSection
            icon="💊"
            title={ds.narrativeMeds}
            accentColor="#7C3AED"
            onPress={() => router.push('/(tabs)/medications' as any)}
          >
            {medSummary ? (
              <>
                {/* 7-bar daily adherence sparkline */}
                <AdherenceSparkline medications={medications} />

                {/* Summary pills */}
                <View style={styles.pillRow}>
                  {medSummary.taken > 0 && (
                    <View style={[styles.pill, { backgroundColor: '#22C55E20' }]}>
                      <Text style={[styles.pillText, { color: '#22C55E' }]}>
                        {medSummary.taken} {ds.narrativeTaken}
                      </Text>
                    </View>
                  )}
                  {medSummary.skipped > 0 && (
                    <View style={[styles.pill, { backgroundColor: '#F59E0B20' }]}>
                      <Text style={[styles.pillText, { color: '#F59E0B' }]}>
                        {medSummary.skipped} {ds.narrativeSkipped}
                      </Text>
                    </View>
                  )}
                  {medSummary.missed > 0 && (
                    <View style={[styles.pill, { backgroundColor: '#EF444420' }]}>
                      <Text style={[styles.pillText, { color: '#EF4444' }]}>
                        {medSummary.missed} {ds.narrativeMissed}
                      </Text>
                    </View>
                  )}
                  {medSummary.taken === 0 && medSummary.skipped === 0 && medSummary.missed === 0 && (
                    <Text style={[styles.emptyText, { color: colors.muted }]}>
                      {ds.narrativeNoMeds}
                    </Text>
                  )}
                  {/* Rolling adherence rate badge for 7d/30d windows */}
                  {narrativeWindow !== 'today' && medSummary.adherenceRate !== null && medSummary.totalDoses > 0 && (
                    <View style={[styles.pill, {
                      backgroundColor: medSummary.adherenceRate >= 80 ? '#22C55E20' :
                                       medSummary.adherenceRate >= 50 ? '#F59E0B20' : '#EF444420',
                    }]}>
                      <Text style={[styles.pillText, {
                        color: medSummary.adherenceRate >= 80 ? '#22C55E' :
                               medSummary.adherenceRate >= 50 ? '#F59E0B' : '#EF4444',
                      }]}>
                        {ds.narrativeAdherence.replace('{rate}', String(medSummary.adherenceRate))}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Individual med lines (today's status only) */}
                {medSummary.lines.map((line, i) => (
                  <View key={i} style={styles.medLine}>
                    <Text style={[styles.medName, { color: colors.foreground }]} numberOfLines={1}>
                      {line.name}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: line.statusColor + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: line.statusColor }]}>
                        {line.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {ds.narrativeNoMeds}
              </Text>
            )}
          </NarrativeSection>

          {/* ── Lab Results ── */}
          <NarrativeSection
            icon="🧪"
            title={ds.narrativeLabs}
            accentColor="#2563EB"
            onPress={() => router.push('/labs' as any)}
          >
            {labSummary ? (
              <View style={styles.labRow}>
                <View style={{ flex: 1 }}>
                  {/* "CBC · 3 days ago" — panel name + recency in one line */}
                  <Text style={[styles.labDateLine, { color: colors.muted }]}>
                    {labSummary.dateLabel}
                    {!labSummary.inWindow && narrativeWindow !== 'today' && (
                      <Text style={{ fontSize: 10, color: colors.muted }}> (outside window)</Text>
                    )}
                  </Text>
                </View>
                {labSummary.abnormalCount > 0 ? (
                  <View style={[styles.pill, { backgroundColor: '#EF444420' }]}>
                    <Text style={[styles.pillText, { color: '#EF4444' }]}>
                      {labSummary.abnormalCount}/{labSummary.totalCount} {ds.narrativeAbnormal}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.pill, { backgroundColor: '#22C55E20' }]}>
                    <Text style={[styles.pillText, { color: '#22C55E' }]}>
                      {ds.narrativeNormal}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {ds.narrativeNoLabs}
              </Text>
            )}
          </NarrativeSection>

          {/* ── Appointments ── */}
          <NarrativeSection
            icon="🗓️"
            title={ds.narrativeAppts}
            accentColor="#0ECFB8"
            onPress={() => router.push('/log/appointments' as any)}
          >
            {apptSummary ? (
              <View>
                <View style={styles.apptRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.apptDoctor, { color: colors.foreground }]} numberOfLines={1}>
                      {apptSummary.doctorName}
                      {apptSummary.specialty ? ` · ${apptSummary.specialty}` : ''}
                    </Text>
                    <Text style={[styles.apptDate, { color: colors.muted }]}>
                      {apptSummary.dateLabel} · {apptSummary.timeStr}
                    </Text>
                  </View>
                  {apptSummary.totalUpcoming > 1 && (
                    <View style={[styles.pill, { backgroundColor: '#0ECFB820' }]}>
                      <Text style={[styles.pillText, { color: '#0ECFB8' }]}>
                        +{apptSummary.totalUpcoming - 1} {ds.narrativeUpcoming}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {ds.narrativeNoAppts}
              </Text>
            )}
          </NarrativeSection>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(99,102,241,0.15)',
    marginTop: 10,
    marginBottom: 8,
  },
  windowRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  windowPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  windowPillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  section: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    gap: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  medLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  medName: {
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  labRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labDateLine: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  apptDoctor: {
    fontSize: 12,
    fontWeight: '600',
  },
  apptDate: {
    fontSize: 11,
    marginTop: 1,
  },
});
