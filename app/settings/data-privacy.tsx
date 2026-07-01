/**
 * Data & Privacy Screen
 *
 * Explains exactly what data VitalSync stores, what stays on-device,
 * what leaves the device (only on explicit share), and provides a
 * one-tap "Delete All Data" action.
 *
 * Accessible from Settings → Privacy → Data & Privacy.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Modal,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Animated,
  Linking,
  Share,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { loadConfigAuditLog, clearConfigAuditLog, appendConfigAuditEntry, type ConfigAuditEntry } from '@/lib/config-audit-log';
import { readAnalyticsEvents, clearAnalyticsEvents, type AnalyticsEvent } from '@/lib/analytics';
import { clearHealthData } from '@/lib/health/storage';
import { privacyStrings } from '@/lib/i18n';
import {
  hasGeminiConsent,
  markGeminiConsent,
  revokeGeminiConsent,
} from '@/lib/gemini-consent';
import { TransparencyCard } from '@/components/transparency-card';
import { useColorScheme } from '@/hooks';
// ─── Data sections ─────────────────────────────────────────────────────────────

// ON_DEVICE and LEAVES_DEVICE are built dynamically inside the component using tPrivacy keys

// ─── Component ────────────────────────────────────────────────────────────────

// Map each audit event type to an emoji icon and accent colour
const AUDIT_EVENT_META: Record<string, { icon: string; color: string }> = {
  report_language_changed: { icon: '🌐', color: '#3B82F6' },
  report_fields_reset:     { icon: '↺',  color: '#F59E0B' },
  report_data_cleared:     { icon: '🧹', color: '#8B5CF6' },
  app_lock_toggled:        { icon: '🔒', color: '#10B981' },
  data_retention_changed:  { icon: '📅', color: '#06B6D4' },
  all_data_deleted:             { icon: '🗑️', color: '#EF4444' },
  report_prepared_by_changed:   { icon: '📝', color: '#F97316' },
  app_theme_changed:             { icon: '🎨', color: '#A855F7' },
  unit_preference_changed:       { icon: '📐', color: '#14B8A6' },
  vital_signs_data_cleared:       { icon: '🩺', color: '#3B82F6' },
};
// Localised label lookup — falls back to English then raw key
function getAuditLabel(event: string, tPriv: Record<string, unknown>): string {
  const KEY_MAP: Record<string, keyof typeof privacyStrings['en']> = {
    report_language_changed:    'auditLabelReportLanguageChanged',
    report_fields_reset:        'auditLabelReportFieldsReset',
    report_data_cleared:        'auditLabelReportDataCleared',
    app_lock_toggled:           'auditLabelAppLockToggled',
    data_retention_changed:     'auditLabelDataRetentionChanged',
    all_data_deleted:           'auditLabelAllDataDeleted',
    report_prepared_by_changed: 'auditLabelReportPreparedByChanged',
    app_theme_changed:          'auditLabelAppThemeChanged',
    unit_preference_changed:    'auditLabelUnitPreferenceChanged',
    vital_signs_data_cleared:   'auditLabelVitalSignsDataCleared',
  };
  const key = KEY_MAP[event];
  if (key && tPriv[key]) return tPriv[key] as string;
  return AUDIT_EVENT_LABELS[event] ?? event.replace(/_/g, ' ');
}
const AUDIT_EVENT_LABELS: Record<string, string> = {
  report_language_changed:      'Report Language Changed',
  report_fields_reset:          'Report Fields Reset',
  report_data_cleared:          'Report Data Cleared',
  app_lock_toggled:             'App Lock Toggled',
  data_retention_changed:       'Data Retention Changed',
  all_data_deleted:             'All Data Deleted',
  report_prepared_by_changed:   'Prepared By Updated',
  app_theme_changed:             'App Theme Changed',
  unit_preference_changed:       'Unit Preference Changed',
  vital_signs_data_cleared:       'Vital Signs Data Cleared',
};
const DEFAULT_AUDIT_META = { icon: '📝', color: '#6B7280' };

export default function DataPrivacyScreen() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deletedAt, setDeletedAt] = useState<Date | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!deletedAt) return;
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [deletedAt, toastOpacity]);

  const [clearingReport, setClearingReport] = useState(false);
  const [reportCleared, setReportCleared] = useState(false);
  const [lastReportClearedAt, setLastReportClearedAt] = useState<Date | null>(null);
  // Config History modal
  const SHARE_FORMAT_KEY = '@audit:shareFormat';
  const [auditShareFormat, setAuditShareFormat] = useState<'file' | 'text'>('file');
  // Restore last-used share format on mount
  useEffect(() => {
    AsyncStorage.getItem(SHARE_FORMAT_KEY).then(val => {
      if (val === 'file' || val === 'text') setAuditShareFormat(val);
    }).catch(() => {});
  }, []);
  const lang = useLang();
  const tPrivacy = ((privacyStrings as unknown as Record<string, typeof privacyStrings.en>)[lang] ?? privacyStrings.en) as typeof privacyStrings['en'];
  const tp = tPrivacy as Record<string, string>;

  // Localised item arrays — update automatically when language changes
  const ON_DEVICE: { icon: string; title: string; desc: string }[] = [
    { icon: '🩺', title: tp.onDeviceItem1Title ?? 'Personal Records', desc: tp.onDeviceItem1Desc ?? 'Medical history, surgical history, diagnoses, and ICD-10 / CPT codes.' },
    { icon: '💊', title: tp.onDeviceItem2Title ?? 'Medications & Side Effects', desc: tp.onDeviceItem2Desc ?? 'Prescription names, doses, schedules, and any logged side effects.' },
    { icon: '🧪', title: tp.onDeviceItem3Title ?? 'Lab Results', desc: tp.onDeviceItem3Desc ?? 'CMP, CBC, lipid panel, A1C, and all other lab values you enter.' },
    { icon: '❤️', title: tp.onDeviceItem4Title ?? 'Vital Signs & Health Metrics', desc: tp.onDeviceItem4Desc ?? 'Blood pressure, heart rate, HRV, SpO₂, weight, blood sugar, and sleep data.' },
    { icon: '🏃', title: tp.onDeviceItem5Title ?? 'Activity & Nutrition', desc: tp.onDeviceItem5Desc ?? 'Workouts, calorie logs, and dietary sodium / potassium entries.' },
    { icon: '📈', title: tp.onDeviceItem6Title ?? 'Correlation & Insight History', desc: tp.onDeviceItem6Desc ?? 'All computed correlations and Meal IQ insights generated on your device.' },
  ];
  const LEAVES_DEVICE: { icon: string; title: string; desc: string }[] = [
    { icon: '📄', title: tp.leavesItem1Title ?? 'Personal Health Report PDF', desc: tp.leavesItem1Desc ?? 'Only when you tap "Generate PDF" and then explicitly share it via the system share sheet.' },
    { icon: '📤', title: tp.leavesItem2Title ?? 'Insight Share', desc: tp.leavesItem2Desc ?? 'Only when you tap the share button on a specific Correlation Engine insight card.' },
    {
      icon: '📷',
      title: 'Food Scan Images (Camera Scan only)',
      desc: 'When you use Camera Scan, your food photo is sent to Google Gemini for Nutrition Analysis. This requires your explicit consent, which you can revoke at any time in Settings → Privacy → Consent & Data Use. Manual food search and barcode scan do not send any images off-device.',
    },
  ];
  const WE_NEVER: string[] = [
    tp.weNever1 ?? 'Upload your health data to any server',
    tp.weNever2 ?? 'Sell or share your data with third parties',
    tp.weNever3 ?? 'Require an account or email address',
    tp.weNever4 ?? 'Track your usage or collect analytics',
    tp.weNever5 ?? 'Access your data without your explicit action',
  ];
  // ── AI Food Scan Consent state ──────────────────────────────────────────────
  const [geminiConsented, setGeminiConsented] = useState(false);
  const [revokingGemini, setRevokingGemini] = useState(false);
  const [aiConsentExpanded, setAiConsentExpanded] = useState(false);

  useEffect(() => {
    hasGeminiConsent().then(setGeminiConsented).catch(() => {});
  }, []);

  const handleGrantGemini = async () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markGeminiConsent();
    setGeminiConsented(true);
  };

  const handleRevokeGemini = () => {
    Alert.alert(
      'Revoke AI Food Scan Consent',
      'This will remove your consent for sending food photos to Google Gemini. The consent dialog will appear again the next time you try to scan a meal.\n\nYour logged nutrition data will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokingGemini(true);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await revokeGeminiConsent();
            setGeminiConsented(false);
            setRevokingGemini(false);
          },
        },
      ],
    );
  };

  const [configHistoryVisible, setConfigHistoryVisible] = useState(false);
  const [auditEntries, setAuditEntries] = useState<ConfigAuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditCount, setAuditCount] = useState(0);
  const [auditLastEntryAt, setAuditLastEntryAt] = useState<Date | null>(null);
  const auditListRef = useRef<FlatList<ConfigAuditEntry>>(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [showJumpFAB, setShowJumpFAB] = useState(false);
  const [showAuditTooltip, setShowAuditTooltip] = useState(false);
  // ── Analytics event log state ──────────────────────────────────────────────
  const [analyticsModalVisible, setAnalyticsModalVisible] = useState(false);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [analyticsCount, setAnalyticsCount] = useState(0);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const analyticsListRef = useRef<FlatList<AnalyticsEvent>>(null);

  // Load analytics count on mount so the badge is visible before the modal is opened
  useEffect(() => {
    readAnalyticsEvents().then((evts) => setAnalyticsCount(evts.length)).catch(() => {});
  }, []);

  const openAnalyticsLog = async () => {
    setLoadingAnalytics(true);
    setAnalyticsModalVisible(true);
    try {
      const evts = await readAnalyticsEvents();
      // Most-recent first
      setAnalyticsEvents([...evts].reverse());
      setAnalyticsCount(evts.length);
    } catch (_unused) {
      setAnalyticsEvents([]);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleClearAnalytics = () => {
    Alert.alert('Clear Event Log?', 'This will permanently remove all on-device analytics events.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await clearAnalyticsEvents();
        setAnalyticsEvents([]);
        setAnalyticsCount(0);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  };

  // Load audit count on mount so the badge is visible before the modal is opened
  useEffect(() => {
    loadConfigAuditLog().then((entries) => {
      setAuditCount(entries.length);
      if (entries.length > 0) setAuditLastEntryAt(new Date(entries[0].timestamp));
    }).catch(() => {});
  }, []);
  const openConfigHistory = async () => {
    setLoadingAudit(true);
    setConfigHistoryVisible(true);
    try {
      const entries = await loadConfigAuditLog();
      setAuditEntries(entries);
      setAuditCount(entries.length);
      if (entries.length > 0) setAuditLastEntryAt(new Date(entries[0].timestamp));
    } catch (_unused) {
      setAuditEntries([]);
    } finally {
      setLoadingAudit(false);
    }
  };
  const handleClearAuditLog = () => {
    Alert.alert('Clear History?', 'This will permanently remove all configuration change records.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await clearConfigAuditLog();
        setAuditEntries([]);
        setAuditCount(0);
        setAuditLastEntryAt(null);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  };
  const handleExportAuditCSV = async (forceFormat?: 'file' | 'text') => {
    if (auditEntries.length === 0) {
      Alert.alert('No Data', 'No configuration history to export.');
      return;
    }
    const header = 'Timestamp,Event,From,To,Note';
    const rows = auditEntries.map(e =>
      [e.timestamp, e.event, e.from ?? '', e.to ?? '', (e.note ?? '').replace(/,/g, ';')].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const useFileShare = forceFormat ? forceFormat === 'file' : auditShareFormat === 'file';
    try {
      if (Platform.OS !== 'web' && useFileShare) {
        // Write to a temp file so the share sheet offers "Save to Files" and other file targets
        const FS = await import('expo-file-system/legacy');
        const fileUri = FS.cacheDirectory + 'vitalsync-config-history.csv';
        await FS.writeAsStringAsync(fileUri, csv, { encoding: FS.EncodingType.UTF8 });
        const Sharing = await import('expo-sharing');
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Share Configuration History',
            UTI: 'public.comma-separated-values-text',
          });
          // Remember that file-based sharing was used last
          setAuditShareFormat('file');
          safeSetItem(SHARE_FORMAT_KEY, 'file').catch(() => {});
          return;
        }
      }
      // Fallback: share as plain text (web or if expo-sharing unavailable)
      await Share.share({ message: csv, title: 'VitalSync Config History' });
      // Remember that text sharing was used last
      setAuditShareFormat('text');
      safeSetItem(SHARE_FORMAT_KEY, 'text').catch(() => {});
    } catch (_unused) {}
  };
  const handleExportAuditPDF = async () => {
    if (auditEntries.length === 0) {
      Alert.alert('No Data', 'No configuration history to export.');
      return;
    }
    setIsPdfExporting(true);
    try {
      const pdfTitle = (tPrivacy as any).auditPdfTitle ?? 'Configuration History';
      const pdfExportedOn = (tPrivacy as any).auditPdfExportedOn ?? 'VitalSync Health Tracker — Exported';
      const pdfColDate = (tPrivacy as any).auditPdfColDate ?? 'Date';
      const pdfColIcon = (tPrivacy as any).auditPdfColIcon ?? 'Icon';
      const pdfColEvent = (tPrivacy as any).auditPdfColEvent ?? 'Event';
      const pdfFrom = (tPrivacy as any).auditPdfFrom ?? 'From';
      const pdfTo = (tPrivacy as any).auditPdfTo ?? 'To';
      const rows = auditEntries.map(e => {
        const meta = AUDIT_EVENT_META[e.event] ?? DEFAULT_AUDIT_META;
        const date = new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const label = getAuditLabel(e.event, tPrivacy);
        const fromTo = (e.from || e.to) ? `<span style="color:#687076;font-size:11px">${e.from ? `${pdfFrom}: ${e.from}` : ''}${e.from && e.to ? ' → ' : ''}${e.to ? `${pdfTo}: ${e.to}` : ''}</span>` : '';
        const note = e.note ? `<br/><span style="color:#11181C;font-size:12px">${e.note}</span>` : '';
        return `<tr><td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;white-space:nowrap;color:#687076;font-size:12px">${date}<br/>${time}</td><td style="padding:8px 12px;border-bottom:1px solid #E5E7EB"><span style="font-size:16px">${meta.icon}</span></td><td style="padding:8px 12px;border-bottom:1px solid #E5E7EB"><span style="font-weight:700;color:${meta.color};font-size:12px;text-transform:uppercase">${label}</span>${note}<br/>${fromTo}</td></tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:-apple-system,sans-serif;margin:32px;color:#11181C}h1{font-size:20px;font-weight:700;margin-bottom:4px}p{color:#687076;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#F5F5F5;font-size:12px;color:#687076;border-bottom:2px solid #E5E7EB}</style></head><body><h1>${pdfTitle}</h1><p>${pdfExportedOn} ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p><table><thead><tr><th>${pdfColDate}</th><th>${pdfColIcon}</th><th>${pdfColEvent}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Configuration History PDF', UTI: 'com.adobe.pdf' });
        // Delete temp PDF after sharing
        const { deleteAsync } = await import('expo-file-system/legacy');
        deleteAsync(uri, { idempotent: true }).catch(() => {});
      } else {
        Alert.alert('PDF Created', `Saved to: ${uri}`);
      }
     } catch (err) {
      Alert.alert('Export Failed', String(err));
    } finally {
      setIsPdfExporting(false);
    }
  };
  // Persist and restore lastReportClearedAtt
  const LAST_CLEARED_KEY = '@report:lastClearedAt';
  useEffect(() => {
    AsyncStorage.getItem(LAST_CLEARED_KEY).then(val => {
      if (val) setLastReportClearedAt(new Date(val));
    }).catch(() => {});
  }, []);

  async function handleClearReportData() {
    Alert.alert(
      'Clear Report Data?',
      'This will remove your saved name, doctor, prepared-by, notes, metric selections, and language preference from the Report screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingReport(true);
            try {
              const keys = [
                '@report:preparedBy',
                '@report:reportLang',
                '@report:patientName',
                '@report:doctorName',
                '@report:notes',
                '@report:neoVitalRangeDays',
                '@report:includeBloodPressure',
                '@report:includePulse',
                '@report:includeBodyComposition',
                '@report:includeSleep',
                '@report:includeTemperature',
                '@report:includeNeoVitalGraph',
                '@report:includeCorrelations',
                '@report:includeA1C',
                '@report:includeConditionTimeline',
                '@report:includeMealIQ',
                '@report:includeMedications',
                '@report:includeEKG',
              ];
              await AsyncStorage.multiRemove(keys);
              const now = new Date();
              setLastReportClearedAt(now);
              safeSetItem(LAST_CLEARED_KEY, now.toISOString()).catch(() => {});
              // Record audit log event
              appendConfigAuditEntry({
                event: 'report_data_cleared',
                note: 'All report screen data cleared (name, doctor, language, metric preferences)',
              }).then(() => {
                loadConfigAuditLog().then((entries) => setAuditCount(entries.length)).catch(() => {});
              }).catch(() => {});
              setReportCleared(true);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              setTimeout(() => setReportCleared(false), 3000);
            } catch (_unused) {
              Alert.alert('Error', 'Something went wrong. Please try again.');
            } finally {
              setClearingReport(false);
            }
          },
        },
      ]
    );
  }

  async function handleDeleteAll() {
    Alert.alert(
      'Delete All Data',
      'This will permanently erase all locally stored health records, vitals, medications, lab results, and activity logs. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await clearHealthData();
              setDeletedAt(new Date());
              // Record audit log event
              appendConfigAuditEntry({
                event: 'all_data_deleted',
                note: 'All locally stored health records, vitals, medications, lab results, and activity logs permanently erased',
              }).then(() => {
                loadConfigAuditLog().then((entries) => setAuditCount(entries.length)).catch(() => {});
              }).catch(() => {});
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch (_unused) {
              Alert.alert('Error', 'Something went wrong. Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[s.backLabel, { color: colors.primary }]}>{tPrivacy.backLabel ?? 'Settings'}</Text>
        </Pressable>
        <View style={s.headerTitle}>
          <View style={[s.headerIcon, { backgroundColor: '#10B981' + '18' }]}>
            <IconSymbol name="lock.shield.fill" size={22} color="#10B981" />
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>{tPrivacy.screenTitle ?? 'Data & Privacy'}</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>
            {tPrivacy.subtitle ?? 'Your health data belongs to you — always.'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Privacy commitment card */}
        <View style={[s.commitCard, { backgroundColor: '#10B981' + '10', borderColor: '#10B981' + '30' }]}>
          <Text style={[s.commitTitle, { color: '#10B981' }]}>🔒 {tPrivacy.commitTitle ?? 'Our Commitment'}</Text>
          <Text style={[s.commitBody, { color: colors.foreground }]}>
            {tPrivacy.commitBody ?? 'VitalSync is built privacy-first. Every piece of health data you enter is stored exclusively on this device using encrypted local storage. No account is required, no data is synced to any server, and no analytics are collected about your health.'}
          </Text>
        </View>

        {/* What stays on your device */}
        <Text style={[s.sectionHeader, { color: colors.foreground }]}>{tPrivacy.storedOnDeviceTitle ?? 'Stored on This Device Only'}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {ON_DEVICE.map((item, i) => (
            <View key={item.title}>
              {i > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
              <View style={s.row}>
                <Text style={s.rowIcon}>{item.icon}</Text>
                <View style={s.rowText}>
                  <Text style={[s.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[s.rowDesc, { color: colors.muted }]}>{item.desc}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* What can leave the device */}
        <Text style={[s.sectionHeader, { color: colors.foreground }]}>{tPrivacy.leavesDeviceTitle ?? 'Leaves Your Device Only When You Choose'}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {LEAVES_DEVICE.map((item, i) => (
            <View key={item.title}>
              {i > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
              <View style={s.row}>
                <Text style={s.rowIcon}>{item.icon}</Text>
                <View style={s.rowText}>
                  <Text style={[s.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[s.rowDesc, { color: colors.muted }]}>{item.desc}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* What we never do */}
        <Text style={[s.sectionHeader, { color: colors.foreground }]}>{tPrivacy.weNeverTitle ?? 'We Never'}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            tp.weNever1 ?? 'Upload your health data to any server',
            tp.weNever2 ?? 'Sell or share your data with third parties',
            tp.weNever3 ?? 'Require an account or email address',
            tp.weNever4 ?? 'Track your usage or collect analytics',
            tp.weNever5 ?? 'Access your data without your explicit action',
          ].map((item, i, _arr) => (
            <View key={item}>
              {i > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
              <View style={s.row}>
                <View style={[s.neverDot, { backgroundColor: '#EF4444' + '20' }]}>
                  <Text style={s.neverX}>✕</Text>
                </View>
                <Text style={[s.neverText, { color: colors.foreground }]}>{item}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Delete all data */}
        <Text style={[s.sectionHeader, { color: colors.foreground }]}>{tPrivacy.yourControlTitle ?? 'Your Control'}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.row}>
            <View style={[s.neverDot, { backgroundColor: '#10B981' + '20' }]}>
              <IconSymbol name="checkmark" size={12} color="#10B981" />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.foreground }]}>{tPrivacy.exportYourData ?? 'Export Your Data'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted }]}>
                {tPrivacy.exportYourDataDesc ?? 'Generate a Personal Health Report PDF from the Report tab to get a full summary of your health records at any time.'}
              </Text>
            </View>
          </View>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <View style={s.row}>
            <View style={[s.neverDot, { backgroundColor: '#10B981' + '20' }]}>
              <IconSymbol name="checkmark" size={12} color="#10B981" />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.foreground }]}>{tPrivacy.deleteEverything ?? 'Delete Everything'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted }]}>
                {tPrivacy.deleteEverythingDesc ?? 'Permanently erase all health records, vitals, medications, and activity logs from this device.'}
              </Text>
            </View>
          </View>
        </View>
        {/* ─── Configuration History row ────────────────── */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={openConfigHistory}
            onLongPress={() => {
              if (auditLastEntryAt) {
                setShowAuditTooltip(true);
                setTimeout(() => setShowAuditTooltip(false), 3000);
              }
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            delayLongPress={400}
          >
            <View style={[s.neverDot, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name="doc.text.magnifyingglass" size={14} color={colors.primary} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.foreground }]}>{tPrivacy.configHistory ?? 'Configuration History'}</Text>
              {showAuditTooltip && auditLastEntryAt ? (
                <Text style={[s.rowDesc, { color: colors.primary, fontWeight: '600' }]}>
                  {(tPrivacy.lastEntry ?? 'Last entry:') + ' '}
                  {auditLastEntryAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {auditLastEntryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : (
                <Text style={[s.rowDesc, { color: colors.muted }]}>{tPrivacy.viewRecentChanges ?? 'View recent language and field changes'}</Text>
              )}
            </View>
            {auditCount > 0 && (
              <View style={{ backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginRight: 6 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 }}>{auditCount > 99 ? '99+' : String(auditCount)}</Text>
              </View>
            )}
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        </View>
        {/* ─── Analytics Event Log row ──────────────────── */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={openAnalyticsLog}
          >
            <View style={[s.neverDot, { backgroundColor: '#8B5CF6' + '18' }]}>
              <IconSymbol name="chart.bar.doc.horizontal" size={14} color="#8B5CF6" />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.foreground }]}>{'View Event Log'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted }]}>{'On-device analytics events (paywall funnel)'}</Text>
            </View>
            {analyticsCount > 0 && (
              <View style={{ backgroundColor: '#8B5CF6', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginRight: 6 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 }}>{analyticsCount > 99 ? '99+' : String(analyticsCount)}</Text>
              </View>
            )}
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        </View>

        {/* ─── Clear Report Data ──────────────────────────── */}
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4, marginLeft: 2 }}>
            {tPrivacy.clearReportDataDesc ?? 'Resets saved name, doctor, language, and metric preferences from the Report screen.'}
          </Text>
          <Pressable
            style={({ pressed }) => [
              s.deleteBtn,
              {
                backgroundColor: '#F59E0B' + (pressed ? '25' : '12'),
                borderColor: '#F59E0B' + '40',
                opacity: clearingReport ? 0.6 : 1,
              },
            ]}
            onPress={handleClearReportData}
            disabled={clearingReport}
          >
            <IconSymbol name="lock.badge.xmark" size={16} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={[s.deleteBtnText, { color: '#F59E0B' }]}>
                {clearingReport ? (tPrivacy.clearingLabel ?? 'Clearing…') : reportCleared ? ('✓ ' + (tPrivacy.reportClearedLabel ?? 'Report data cleared')) : (tPrivacy.clearReportDataLabel ?? 'Clear All Report Data')}
              </Text>
              {!clearingReport && !reportCleared && lastReportClearedAt && (
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                  {(tPrivacy.lastClearedLabel ?? 'Last cleared:')} {lastReportClearedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              )}
            </View>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            s.deleteBtn,
            {
              backgroundColor: '#EF4444' + (pressed ? '25' : '12'),
              borderColor: '#EF4444' + '40',
              opacity: deleting ? 0.6 : 1,
            },
          ]}
          onPress={handleDeleteAll}
          disabled={deleting}
        >
          <IconSymbol name="trash.fill" size={16} color="#EF4444" />
          <Text style={[s.deleteBtnText, { color: '#EF4444' }]}>
            {deleting ? (tPrivacy.deletingLabel ?? 'Deleting…') : (tPrivacy.deleteAllDataLabel ?? 'Delete All My Data')}
          </Text>
        </Pressable>

        {/* ─── AI Food Scan Consent ──────────────────────────────────────── */}
        {/* TransparencyCard: About Meal Scanner (always visible, collapsible) */}
        <TransparencyCard variant="mealScanner" style={{ marginBottom: 8 }} />
        {/* AI Food Scan Consent collapsible tile */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAiConsentExpanded(v => !v);
          }}
          style={({ pressed }) => [{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            marginBottom: aiConsentExpanded ? 0 : 20,
            opacity: pressed ? 0.8 : 1,
          }]}
          accessibilityRole="button"
          accessibilityLabel="AI Food Scan Consent"
          accessibilityHint={aiConsentExpanded ? 'Tap to collapse' : 'Tap to expand'}
        >
          <View style={[s.neverDot, { backgroundColor: '#F59E0B18' }]}>
            <IconSymbol name="camera.fill" size={14} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowTitle, { color: colors.foreground }]}>AI Food Scan Consent</Text>
            <Text style={[s.rowDesc, { color: geminiConsented ? '#10B981' : '#F59E0B' }]}>
              {geminiConsented ? '● Consent Given' : '● Not Yet Consented'}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: colors.muted }}>{aiConsentExpanded ? '▲' : '▼'}</Text>
        </Pressable>
        {aiConsentExpanded && (
          <View style={[s.card, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            marginBottom: 20,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderTopWidth: 0,
            padding: 14,
            gap: 10,
          }]}>
            {/* Status row */}
            <View style={[{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              borderRadius: 12,
              borderWidth: 1,
              padding: 12,
              backgroundColor: geminiConsented
                ? ('#10B981' + (isDark ? '18' : '12'))
                : ('#F59E0B' + (isDark ? '18' : '12')),
              borderColor: geminiConsented
                ? ('#10B981' + (isDark ? '40' : '30'))
                : ('#F59E0B' + (isDark ? '40' : '30')),
            }]}>
              <Text style={{ fontSize: 16, color: geminiConsented ? '#10B981' : '#F59E0B', lineHeight: 20 }}>●</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', lineHeight: 18, color: geminiConsented ? '#10B981' : '#F59E0B' }}>
                  {geminiConsented ? 'Consent Given' : 'Not Yet Consented'}
                </Text>
                <Text style={[s.rowDesc, { color: colors.muted, marginTop: 2 }]}>
                  {geminiConsented
                    ? 'Food photos may be sent to Google Gemini for Nutrition Analysis.'
                    : 'Enable to allow Camera Scan to send food photos to Google Gemini for analysis.'}
                </Text>
              </View>
            </View>
            {/* Enable button */}
            {!geminiConsented && (
              <Pressable
                style={({ pressed }) => [{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 14,
                  paddingVertical: 14,
                  backgroundColor: '#10B981',
                  opacity: pressed ? 0.85 : 1,
                  marginTop: 4,
                }]}
                onPress={handleGrantGemini}
              >
                <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Enable AI Food Scan (Camera Scan)</Text>
              </Pressable>
            )}
            {/* Revoke button */}
            {geminiConsented && (
              <Pressable
                style={({ pressed }) => [{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  paddingVertical: 14,
                  backgroundColor: isDark ? (colors.error + '15') : '#FFF5F5',
                  borderColor: colors.error + '40',
                  opacity: (pressed || revokingGemini) ? 0.7 : 1,
                }]}
                onPress={handleRevokeGemini}
                disabled={revokingGemini}
              >
                {revokingGemini
                  ? <ActivityIndicator size="small" color={colors.error} />
                  : <IconSymbol name="xmark.circle.fill" size={16} color={colors.error} />}
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>
                  {revokingGemini ? 'Revoking…' : 'Revoke AI Food Scan Consent'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Legal documents: Privacy Policy + Terms of Use */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [
              s.legalRow,
              { backgroundColor: pressed ? colors.primary + '08' : 'transparent' },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const url = 'https://vitalsyncpersonalwellnesshub.com/article/privacy-policy';
              import('expo-web-browser')
                .then(({ openBrowserAsync }) => openBrowserAsync(url))
                .catch(() => Linking.openURL(url));
            }}
            accessibilityRole="link"
            accessibilityLabel="View VitalSync Privacy Policy"
          >
            <View style={[s.neverDot, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name="lock.shield.fill" size={14} color={colors.primary} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.primary }]}>{tPrivacy.privacyPolicy ?? 'Privacy Policy'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted }]}>{tPrivacy.tapToViewPrivacyPolicy ?? 'Tap to view our Privacy Policy'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted, marginTop: 1 }]}>{tPrivacy.lastUpdatedMarch2026 ?? 'Last updated March 2026'}</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [
              s.legalRow,
              { backgroundColor: pressed ? colors.primary + '08' : 'transparent' },
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const url = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
              import('expo-web-browser')
                .then(({ openBrowserAsync }) => openBrowserAsync(url))
                .catch(() => Linking.openURL(url));
            }}
            accessibilityRole="link"
            accessibilityLabel="View VitalSync Terms of Use (EULA)"
          >
            <View style={[s.neverDot, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name="doc.text.fill" size={14} color={colors.primary} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.primary }]}>{tPrivacy.termsOfUse ?? 'Terms of Use'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted }]}>{tPrivacy.tapToViewTerms ?? 'Tap to view our Terms of Use'}</Text>
              <Text style={[s.rowDesc, { color: colors.muted, marginTop: 1 }]}>{tPrivacy.lastUpdatedMarch2026 ?? 'Last updated March 2026'}</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>
        </View>

        {/* Footer note */}
        <Text style={[s.footer, { color: colors.muted }]}>
          {tPrivacy.footerDisclaimer ?? 'VitalSync is for personal wellness tracking and educational purposes only. It does not provide medical advice. Always consult a qualified healthcare professional.'}
        </Text>
      </ScrollView>

      {/* Deletion confirmation toast */}
      {/* ─── Configuration History Modal ───────────────── */}
      <Modal
        visible={configHistoryVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setConfigHistoryVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.foreground }}>{tPrivacy.configHistoryModalTitle ?? 'Configuration History'}</Text>
            <Pressable onPress={() => setConfigHistoryVisible(false)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 15, color: colors.primary, fontWeight: '600' }}>{tPrivacy.done ?? 'Done'}</Text>
            </Pressable>
          </View>
          {/* Share format toggle */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
          }}>
            <Text style={{ fontSize: 12, color: colors.muted, flex: 1 }}>{tPrivacy.exportFormat ?? 'Export format:'}</Text>
            {(['file', 'text'] as const).map(fmt => (
              <Pressable
                key={fmt}
                onPress={() => {
                  setAuditShareFormat(fmt);
                  safeSetItem(SHARE_FORMAT_KEY, fmt).catch(() => {});
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: auditShareFormat === fmt
                    ? colors.primary + '20'
                    : colors.surface,
                  borderColor: auditShareFormat === fmt
                    ? colors.primary + '60'
                    : colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13 }}>{fmt === 'file' ? '📄' : '💬'}</Text>
                <Text style={{
                  fontSize: 12, fontWeight: '600',
                  color: auditShareFormat === fmt ? colors.primary : colors.muted,
                }}>
                  {fmt === 'file' ? (tPrivacy.formatFile ?? 'File') : (tPrivacy.formatText ?? 'Text')}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* Action bar */}
          <View style={{
            flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          }}>
            <Pressable
              onPress={() => handleExportAuditCSV()}
              style={({ pressed }) => [{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                backgroundColor: colors.primary + (pressed ? '25' : '12'),
                borderColor: colors.primary + '40',
              }]}
            >
              <IconSymbol name="square.and.arrow.up" size={14} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{tPrivacy.exportCsv ?? 'Export CSV'}</Text>
            </Pressable>
            <Pressable
              onPress={isPdfExporting ? undefined : handleExportAuditPDF}
              style={({ pressed }) => [{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                backgroundColor: '#8B5CF6' + (isPdfExporting ? '08' : pressed ? '25' : '12'),
                borderColor: '#8B5CF6' + '40',
                opacity: isPdfExporting ? 0.6 : 1,
              }]}
            >
              {isPdfExporting
                ? <ActivityIndicator size="small" color="#8B5CF6" />
                : <IconSymbol name="doc.text.fill" size={14} color="#8B5CF6" />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#8B5CF6' }}>{isPdfExporting ? '…' : (tPrivacy.exportPdf ?? 'Export PDF')}</Text>
            </Pressable>
            <Pressable
              onPress={handleClearAuditLog}
              style={({ pressed }) => [{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                backgroundColor: '#EF4444' + (pressed ? '25' : '12'),
                borderColor: '#EF4444' + '40',
              }]}
            >
              <IconSymbol name="trash" size={14} color="#EF4444" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>{tPrivacy.clearHistory ?? 'Clear History'}</Text>
            </Pressable>
          </View>
          {/* List */}
          {loadingAudit ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{tPrivacy.loading ?? 'Loading…'}</Text>
            </View>
          ) : auditEntries.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Text style={{ fontSize: 32 }}>📝</Text>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{tPrivacy.noConfigChanges ?? 'No configuration changes recorded yet.'}</Text>
            </View>
          ) : (
            <>
            {/* Search bar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 16, paddingVertical: 8,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
            }}>
              <Text style={{ fontSize: 14 }}>🔍</Text>
              <TextInput
                value={auditSearch}
                onChangeText={setAuditSearch}
                placeholder={tPrivacy.auditSearchPlaceholder ?? 'Search history…'}
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1, fontSize: 14, color: colors.foreground,
                  paddingVertical: 6, paddingHorizontal: 4,
                }}
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
              {auditSearch.length > 0 && (
                <Pressable onPress={() => setAuditSearch('')} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>✕</Text>
                </Pressable>
              )}
            </View>
            <FlatList
              ref={auditListRef}
              onScroll={({ nativeEvent }) => {
                setShowJumpFAB(nativeEvent.contentOffset.y > 120);
              }}
              scrollEventThrottle={100}
              data={auditSearch.trim() === '' ? auditEntries : auditEntries.filter(e => {
                const q = auditSearch.toLowerCase();
                const label = getAuditLabel(e.event, tPrivacy).toLowerCase();
                return label.includes(q) || (e.note ?? '').toLowerCase().includes(q) || (e.from ?? '').toLowerCase().includes(q) || (e.to ?? '').toLowerCase().includes(q);
              })}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40 }}>
                  <Text style={{ fontSize: 32 }}>🔍</Text>
                  <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>
                    {`${tPrivacy.auditNoResults ?? 'No results for'} "${auditSearch}"`}
                  </Text>
                  <Pressable onPress={() => setAuditSearch('')} style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 13, color: colors.primary ?? '#0a7ea4' }}>{tPrivacy.auditClearSearch ?? 'Clear search'}</Text>
                  </Pressable>
                </View>
              }
              renderItem={({ item }) => {
                const meta = AUDIT_EVENT_META[item.event] ?? DEFAULT_AUDIT_META;
                return (
                  <View style={[{
                    borderRadius: 12, borderWidth: 1, padding: 12, gap: 4,
                    backgroundColor: colors.surface, borderColor: meta.color + '30',
                  }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View style={{
                          width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: meta.color + '18',
                        }}>
                          <Text style={{ fontSize: 13 }}>{meta.icon}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: meta.color, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 1 }}>
                          {getAuditLabel(item.event, tPrivacy)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.muted, flexShrink: 0 }}>
                        {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {item.note && (
                      <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{item.note}</Text>
                    )}
                    {(item.from || item.to) && (
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {item.from ? `${(tPrivacy as any).auditPdfFrom ?? 'From'}: ${item.from}` : ''}{item.from && item.to ? '  →  ' : ''}{item.to ? `${(tPrivacy as any).auditPdfTo ?? 'To'}: ${item.to}` : ''}
                      </Text>
                    )}
                  </View>
                );
              }}
            />
            {showJumpFAB && (
              <Pressable
                onPress={() => {
                  auditListRef.current?.scrollToIndex({ index: 0, animated: true });
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => ({
                  position: 'absolute',
                  bottom: 20,
                  right: 20,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 4,
                })}
              >
                <Text style={{ fontSize: 18, color: '#fff' }}>↑</Text>
              </Pressable>
            )}
            </>
          )}
        </View>
      </Modal>

      {/* ─── Analytics Event Log Modal ─────────────────── */}
      <Modal
        visible={analyticsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAnalyticsModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.foreground }}>{'Event Log'}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{'On-device only • never transmitted'}</Text>
            </View>
            <Pressable onPress={() => setAnalyticsModalVisible(false)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 15, color: colors.primary, fontWeight: '600' }}>{tPrivacy.done ?? 'Done'}</Text>
            </Pressable>
          </View>
          {/* Action bar */}
          <View style={{
            flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {analyticsCount} {analyticsCount === 1 ? 'event' : 'events'} stored on-device
              </Text>
            </View>
            <Pressable
              onPress={handleClearAnalytics}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                backgroundColor: '#EF4444' + (pressed ? '25' : '12'),
                borderColor: '#EF4444' + '40',
              })}
            >
              <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600' }}>{'Clear All'}</Text>
            </Pressable>
          </View>
          {/* Event list */}
          {loadingAnalytics ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={analyticsListRef}
              data={analyticsEvents}
              keyExtractor={(item, idx) => `${item.timestamp}-${idx}`}
              contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 60 }}>
                  <Text style={{ fontSize: 32 }}>📊</Text>
                  <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>
                    {'No events logged yet.\nInteract with paywall nudges to see events here.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={{
                  borderRadius: 12, borderWidth: 1, padding: 12, gap: 4,
                  backgroundColor: colors.surface, borderColor: '#8B5CF6' + '30',
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{
                      backgroundColor: '#8B5CF6' + '18', borderRadius: 6,
                      paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#8B5CF6', letterSpacing: 0.3 }}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' '}
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {item.properties && Object.keys(item.properties).length > 0 && (
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {Object.entries(item.properties).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                    </Text>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {deletedAt && (
        <Animated.View
          style={[
            s.toast,
            { backgroundColor: '#10B981', opacity: toastOpacity },
          ]}
          pointerEvents="none"
        >
          <IconSymbol name="checkmark.circle.fill" size={16} color="#fff" />
          <Text style={s.toastText}>
            {(tPrivacy as any).toastAllDataDeleted ?? 'All data deleted'} · {deletedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backLabel: { fontSize: 16, fontWeight: '500' },
  headerTitle: { alignItems: 'center', gap: 6 },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  scroll: { padding: 16, paddingBottom: 48, gap: 0 },
  commitCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  commitTitle: { fontSize: 14, fontWeight: '700' },
  commitBody: { fontSize: 13, lineHeight: 20 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 20,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  rowIcon: { fontSize: 22, width: 28, textAlign: 'center', marginTop: 1 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  rowDesc: { fontSize: 12, lineHeight: 17 },
  neverDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  neverX: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  neverText: { flex: 1, fontSize: 13, lineHeight: 20, paddingTop: 4 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 20,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700' },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  footer: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  toast: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
