/**
 * Personal Health Report Screen
 * Configure, preview, and export a PDF health summary.
 * Privacy-first: data never leaves the device unless user explicitly shares.
 *
 * Visual design: 3D Liquid Glass (GlassCard) — consistent with Dashboard.
 */

import { ScrollToTopButton } from '@/components/scroll-to-top-button';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import React, { useState, useEffect } from 'react';
import { useReportLang, type ReportLang } from '@/lib/report-lang-context';
import { SUPPORTED_LANGUAGES } from '@/lib/supported-languages';
import { appendConfigAuditEntry } from '@/lib/config-audit-log';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Switch,
  Alert,
  Platform,
  ActivityIndicator,
  useColorScheme,
  Modal,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { FloatingWellnessDisclaimer } from '@/components/floating-wellness-disclaimer';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GlassCard } from '@/components/glass-card';
import { useHealth } from '@/lib/health/health-context';
import { useColors, useCorrelationStrings, useLang, useRawLang, useReportStrings } from '@/hooks';
import { useUnitPreferences } from '@/hooks/use-unit-preferences';
import { generateReportHTML, type ReportConfig, DEFAULT_REPORT_LABELS } from '@/lib/health/report-generator';
import { loadUserProfile, type UserProfile } from '@/lib/user-profile';
import { NeoSleepWeeklyChart } from '@/components/neo-sleep-3d-chart';
import { NeoVitalMiniCard } from '@/components/neovital-mini-card';
import { loadMedications } from '@/lib/medications/storage';
import type { Medication } from '@/lib/medications/types';
import { loadA1CSnapshots, type A1CSnapshot } from '@/lib/health/a1c-snapshots';
import { fetchEKGFirstPage, type EKGRecord } from '@/lib/health/ekg-store';
import { exportHealthDataAsCSV, getExportSummary } from '@/lib/health/csv-export';
import * as Haptics from 'expo-haptics';
import * as _Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { reportStrings, disclaimerStrings, correlationStrings, complianceRingStrings } from '@/lib/i18n';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';
import { useUpsell } from '@/hooks/use-upsell';
import { useRTL } from '@/hooks/use-rtl';
import { SegmentedControl } from '@/components/segmented-control';
import { useT, STATIC_LANGS, getLangName } from '@/lib/i18n-ai';
import { translateWithFallback } from '@/lib/translation-fallback';
import { getReportLabels, resolveReportLang } from '@/lib/health/report-lang-utils';
// Stable English strings for Smart translation
const REPORT_EN: Record<string, string> = Object.fromEntries(
  Object.entries(reportStrings.en).filter(([, v]) => typeof v === 'string')
) as Record<string, string>;
export default function ReportScreen() {
  const reportScrollRef = React.useRef<import('react-native').ScrollView | null>(null);
  const { showScrollTop: showReportScrollTop, scrollTopOpacity: reportScrollTopOpacity, handleScroll: handleReportScroll, scrollToTop: reportScrollToTop } = useScrollToTop(reportScrollRef);
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const { state } = useHealth();

  const [patientName, setPatientName] = useState('');
  const DOCTOR_NAME_KEY = '@report:doctorName';
  const [doctorName, setDoctorName] = useState('');
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [lastPdfUri, setLastPdfUri] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isCopied, setIsCopied] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);
  const [, forceTimestampRefresh] = React.useReducer(x => x + 1, 0);

  // Auto-refresh the last-generated timestamp badge every 60 seconds
  React.useEffect(() => {
    if (!lastGeneratedAt) return;
    const timer = setInterval(() => forceTimestampRefresh(), 60_000);
    return () => clearInterval(timer);
  }, [lastGeneratedAt]);
  const [isAirDropping, setIsAirDropping] = useState(false);
  const [isGeneratingAndSaving, setIsGeneratingAndSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // previewLang: language override inside the Preview modal.
  // Allows users to generate a report in a different language (e.g. English for their doctor)
  // without changing the global report language setting.
  const [previewLang, setPreviewLang] = useState<ReportLang | null>(null);
  const [isRegeneratingPreview, setIsRegeneratingPreview] = useState(false);
  /** Controls the inline language picker modal triggered by tapping the badge chip */
  const [showLangPicker, setShowLangPicker] = useState(false);
  /** Which engine produced the current translation: 'server' | 'apple' | 'gemini' | null (English/static) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [translationEngine, setTranslationEngine] = useState<'server' | 'apple' | 'gemini' | null>(null);
  const [dateRangeDays, setDateRangeDays] = useState<number | 'all'>(30);

  const [includeBloodPressure, setIncludeBloodPressure] = useState(true);
  const [includePulse, setIncludePulse] = useState(true);
  const [includeBodyComposition, setIncludeBodyComposition] = useState(true);
  const [includeSleep, setIncludeSleep] = useState(true);
  const [neoSleepExpanded, setNeoSleepExpanded] = useState(false);
  const [neoVitalExpanded, setNeoVitalExpanded] = useState(false);
  const [includeNeoVitalGraph, setIncludeNeoVitalGraph] = useState(true);
  const [neoVitalRangeDays, setNeoVitalRangeDays] = useState<30 | 90>(30);

  // Persist and restore neoVitalRangeDays across sessions
  const NEO_RANGE_KEY = '@report:neoVitalRangeDays';
  useEffect(() => {
    AsyncStorage.getItem(NEO_RANGE_KEY).then(val => {
      if (val === '30' || val === '90') setNeoVitalRangeDays(Number(val) as 30 | 90);
    }).catch(() => {});
  }, []);

  const handleNeoVitalRangeChange = (days: 30 | 90) => {
    setNeoVitalRangeDays(days);
    safeSetItem(NEO_RANGE_KEY, String(days)).catch(() => {});
  };
  const [isPrintPreviewingNeoVital, setIsPrintPreviewingNeoVital] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [includeCorrelations, setIncludeCorrelations] = useState(false);
  const { isPremium: isReportPremium, openPaywall: openReportPaywall } = usePremiumGate();
  const { checkAndShow: checkUpsell, UpsellSheet } = useUpsell();

  const [includeTemperature, setIncludeTemperature] = useState(true);
  const { weightUnit, glucoseUnit, tempUnit } = useUnitPreferences();
  // Clinical analytics sections
  const [includeA1C, setIncludeA1C] = useState(true);
  const [a1cSnapshots, setA1CSnapshots] = React.useState<A1CSnapshot[]>([]);

  // Load A1C snapshots for trend data in the report
  React.useEffect(() => {
    loadA1CSnapshots().then(setA1CSnapshots).catch(() => {});
  }, []);
  const [includeConditionTimeline, setIncludeConditionTimeline] = useState(true);
  const [includeMealIQ, setIncludeMealIQ] = useState(false);
  const [includeMedications, setIncludeMedications] = useState(true);
  const [includeEKG, setIncludeEKG] = useState(true);
  const [ekgRecords, setEKGRecords] = React.useState<EKGRecord[]>([]);
  React.useEffect(() => {
    fetchEKGFirstPage().then(r => setEKGRecords(r.records)).catch(() => {});
  }, []);
  const [medications, setMedications] = React.useState<Medication[]>([]);
  const [userProfile, setUserProfile] = React.useState<UserProfile | undefined>(undefined);
  React.useEffect(() => {
    loadUserProfile().then(setUserProfile).catch(() => {});
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [clinicianName, setClinicianName] = React.useState<string | undefined>(undefined);
  const PREPARED_BY_KEY = '@report:preparedBy';
  // No default — leave blank means omit clinician attribution entirely
  const [preparedBy, setPreparedBy] = React.useState('');

  // Persist and restore preparedBy across sessions; blank = omit clinician attribution
  React.useEffect(() => {
    AsyncStorage.getItem(PREPARED_BY_KEY).then(val => {
      if (val !== null && val.trim().length > 0) {
        setPreparedBy(val);
      }
      // If never saved or empty, leave blank — no default applied
    }).catch(() => {});
  }, []);

  // Debounce ref so we only log one audit event after the user stops typing
  const preparedByAuditTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePreparedByChange = (v: string) => {
    const prev = preparedBy;
    setPreparedBy(v);
    safeSetItem(PREPARED_BY_KEY, v).catch(() => {});
    // Debounce: fire audit event 1.5 s after the user stops typing
    if (preparedByAuditTimer.current) clearTimeout(preparedByAuditTimer.current);
    preparedByAuditTimer.current = setTimeout(() => {
      if (v !== prev && v.trim().length > 0) {
        appendConfigAuditEntry({
          event: 'report_prepared_by_changed',
          from: prev,
          to: v,
          note: `Prepared By changed to: ${v}`,
        }).catch(() => {});
      }
    }, 1500);
  };
  // reportLang — shared context for bidirectional sync with Settings
  const { reportLang, setReportLang, langChangedAt } = useReportLang();
  // Effective language used in the preview (override takes precedence).
  // MUST be declared after useReportLang() to avoid the TDZ crash that occurs
  // when this const was placed before reportLang was initialized by the hook.
  const effectivePreviewLang: ReportLang = previewLang ?? reportLang;

  const handleReportLangChange = (v: string) => {
    const prev = reportLang;
    setReportLang(v as Parameters<typeof setReportLang>[0]);
    if (v !== prev) {
      appendConfigAuditEntry({
        event: 'report_language_changed',
        from: prev,
        to: v,
        note: `Report language changed from ${prev.toUpperCase()} to ${v.toUpperCase()}`,
      }).catch(() => {});
      // Live preview: regenerate the report HTML immediately so labels update without
      // the user having to tap Generate again.
      if (state.data && previewHtml !== null) {
        // Rebuild with the new language labels (static langs resolve instantly)
        const newLang = v as string;
        const buildAndSetPreview = async () => {
          const labels = getReportLabels(newLang);
          const cfg = { ...buildReportConfig(), labels };
          const html = generateReportHTML({ ...state.data!, medications }, cfg);
          setPreviewHtml(html);
        };
        buildAndSetPreview().catch(() => {});
      }
    }
  };

  // Human-readable native name for the selected report language (derived from shared config)
  const reportLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === reportLang)?.native ?? 'English';

  // Load medications for the report
  React.useEffect(() => {
    loadMedications().then(setMedications).catch(() => {});
  }, []);

  // Load clinician name from user profile (no longer used for auto-fill, kept for future use)
  React.useEffect(() => {
    loadUserProfile().then(profile => {
      if (profile.firstName) setClinicianName(profile.firstName);
    }).catch(() => {});
  }, []);

  // Persist and restore doctorName across sessions; fall back to default if empty or never set
  React.useEffect(() => {
    AsyncStorage.getItem(DOCTOR_NAME_KEY).then(val => {
      // Restore whatever the user last typed; empty string means "use default on print"
      if (val !== null) setDoctorName(val);
    }).catch(() => {});
  }, []);
  // Compute the next upcoming appointment doctor name for the prefill chip
  const upcomingApptDoctor = React.useMemo(() => {
    if (!state.data?.appointments?.length) return null;
    const upcoming = [...(state.data.appointments)]
      .filter(a => a.doctorName && new Date(a.dateTime) >= new Date())
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [state.data?.appointments]);

  // tempUnit is now reactive via useUnitPreferences hook

  const lang = useLang();
  const rawLang = useRawLang();
  const isRTL = useRTL();
  const rowDir: 'row' | 'row-reverse' = isRTL ? 'row-reverse' : 'row';
  const textDir: 'right' | 'left' | 'auto' = isRTL ? 'right' : 'auto';
  const tAI = useT(REPORT_EN);
  const _tStatic = useReportStrings();
  // For STATIC_LANGS (en, es, fr, zh, ko, ja, ru, tr, it, nl, pl, pt, de, hi, sw, hy, ar, am, tl, so),
  // useT() returns the English strings as a no-op. We must use _tStatic which reads the correct
  // translated block from reportStrings. For dynamic AI-translated languages (sv, he, uk, fa, etc.),
  // useT() returns the AI-translated strings which we prefer.
  const t = (STATIC_LANGS.has(rawLang) ? _tStatic : (tAI as unknown as typeof reportStrings.en));
  const cs = useCorrelationStrings();

  const [isTranslatingPDF, setIsTranslatingPDF] = useState(false);

  const recordCount = state.data
    ? (() => {
        const vs = state.data.vitalSigns ?? [];
        const bpCount = includeBloodPressure
          ? ((state.data.bloodPressure ?? []).length || vs.filter(r => r.systolic != null).length)
          : 0;
        const pulseCount = includePulse
          ? ((state.data.pulse ?? []).length || vs.filter(r => r.heartRate != null).length)
          : 0;
        const weightCount = includeBodyComposition
          ? ((state.data.bodyComposition ?? []).length || vs.filter(r => r.weightKg != null).length)
          : 0;
        return bpCount +
          pulseCount +
          weightCount +
          (includeSleep ? (state.data.sleep ?? []).length : 0) +
          (includeTemperature ? vs.filter(r => r.temperature !== undefined && r.temperature > 0).length : 0);
      })()
    : 0;

  function buildReportConfig(): ReportConfig {
    const endDate = new Date();
    const startDate = new Date();
    if (dateRangeDays === 'all') {
      startDate.setFullYear(2000, 0, 1);
    } else {
      startDate.setDate(startDate.getDate() - dateRangeDays);
    }
    return {
      patientName: patientName || undefined,
      doctorName: doctorName.trim() || undefined,
      notes: notes || undefined,
      clinicianName: preparedBy.trim() ? preparedBy.trim().split(',')[0].trim() : undefined,
      clinicianCredentials: (() => { const pb = preparedBy.trim(); return pb.includes(',') ? pb.split(',').slice(1).join(',').trim() || undefined : undefined; })(),
      clinicianRole: undefined,
      dateRange: { start: startDate, end: endDate },
      includeBloodPressure,
      includePulse,
      includeBodyComposition,
      includeSleep,
      includeCorrelations,
      includeTemperature,
      tempUnit,
      weightUnit,
      glucoseUnit,
      includeA1C,
      a1cSnapshots,
      includeConditionTimeline,
      includeMealIQ,
      includeMedications,
      includeNeoVitalGraph,
      neoVitalRangeDays,
      userProfile,
      includeEKG,
      ekgRecords: includeEKG ? ekgRecords : [],
    };
  }

  function handlePreviewReport() {
    if (!state.data) {
      Alert.alert(t.noDataSync, t.noDataSyncMsg);
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Reset preview language override so it matches the global report language
    setPreviewLang(null);
    const html = generateReportHTML({ ...state.data, medications }, {
      ...buildReportConfig(),
      labels: getReportLabels(reportLang),
    });
    setPreviewHtml(html);
    setIsPreviewing(true);
  }

  async function handlePreviewLangChange(newLang: ReportLang) {
    if (!state.data) return;
    if (newLang === effectivePreviewLang) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewLang(newLang);
    setIsRegeneratingPreview(true);
    try {
      if (newLang !== 'en' && !STATIC_LANGS.has(newLang)) {
        // Non-static: translate the English HTML via the translate flow
        const enHtml = generateReportHTML({ ...state.data, medications }, {
          ...buildReportConfig(),
          labels: undefined, // English labels
        });
        const langName = getLangName(newLang);
        const translated = await translateWithFallback({ html: enHtml }, newLang, langName);
        setPreviewHtml((translated as Record<string, string>).html ?? enHtml);
      } else {
        // Static lang: regenerate with static labels instantly
        const html = generateReportHTML({ ...state.data, medications }, {
          ...buildReportConfig(),
          labels: getReportLabels(newLang),
        });
        setPreviewHtml(html);
      }
    } catch {
      // On error, fall back to the global report language (not necessarily English)
      const html = generateReportHTML({ ...state.data, medications }, {
        ...buildReportConfig(),
        labels: getReportLabels(reportLang),
      });
      setPreviewHtml(html);
    } finally {
      setIsRegeneratingPreview(false);
    }
  }

  function handlePrintPreviewNeoVital() {
    if (!isReportPremium) {
      openReportPaywall();
      return;
    }
    if (!state.data) {
      Alert.alert(t.noDataSync, t.noDataSyncMsg);
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Force includeNeoVitalGraph=true for this preview
    const config = { ...buildReportConfig(), includeNeoVitalGraph: true, labels: getReportLabels(reportLang) };
    // Inject auto-scroll script to jump to the NeoVital section
    const baseHtml = generateReportHTML({ ...state.data, medications }, config);
    const htmlWithScroll = baseHtml.replace(
      '</body>',
      `<script>window.addEventListener('load',function(){var el=document.getElementById('neovital-graph');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});});<\/script></body>`
    );
    setPreviewHtml(htmlWithScroll);
    setIsPrintPreviewingNeoVital(true);
    setIsPreviewing(true);
  }

  async function handleGenerateAndSave() {
    if (!state.data) {
      Alert.alert(t.noDataSync, t.noDataSyncMsg);
      return;
    }
    // For non-English, non-static languages, use the translate flow instead
      if (reportLang !== 'en' && !STATIC_LANGS.has(reportLang)) {
      return handleTranslatePDF(reportLang);
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsGeneratingAndSaving(true);
    try {
      const config = {
        ...buildReportConfig(),
        labels: getReportLabels(reportLang),
      };
      const html = generateReportHTML({ ...state.data, medications }, config);
      const { uri: rawUri } = await Print.printToFileAsync({ html, base64: false });
      const dateStr = new Date().toISOString().slice(0, 10);
      const langSuffix = reportLang !== 'en' ? `_${reportLangLabel.replace(/\s+/g, '_')}` : '';
      const namedUri = `${FileSystem.cacheDirectory}VitalSync_Personal_Health_Report_${dateStr}${langSuffix}.pdf`;
      await FileSystem.copyAsync({ from: rawUri, to: namedUri });
      // Delete the raw temp file from Print.printToFileAsync immediately
      FileSystem.deleteAsync(rawUri, { idempotent: true }).catch(() => {});

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(namedUri, {
          mimeType: 'application/pdf',
          dialogTitle: reportLang !== 'en' ? `Save to Files or AirDrop (${reportLangLabel})` : 'Save to Files or AirDrop',
          UTI: 'com.adobe.pdf',
        });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Delete the named PDF after sharing to prevent health data lingering in cache
        FileSystem.deleteAsync(namedUri, { idempotent: true }).catch(() => {});
      } else {
        Alert.alert(t.pdfSaved, t.pdfSavedMsg);
      }
    } catch (e) {
      console.error('[VitalSync] Generate & Save error:', e);
      Alert.alert(t.errorTitle, t.errorMsg);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGeneratingAndSaving(false);
    }
  }

  async function handleGeneratePDF(overrideLang?: ReportLang): Promise<void> {
    if (!state.data) {
      Alert.alert(t.noDataSync, t.noDataSyncMsg);
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Contextual upsell: fire on PDF export attempt (free users only)
    checkUpsell('pdf_export_tap').catch(() => {});
    // Use override lang (from Preview modal language selector) if provided, else global reportLang
    const activeLang: ReportLang = resolveReportLang(overrideLang, reportLang) as ReportLang;
    // Delegate to translate flow for non-static languages
    if (activeLang !== 'en' && !STATIC_LANGS.has(activeLang)) {
      return handleTranslatePDF(activeLang);
    }
    setIsGenerating(true);
    try {
      const config = {
        ...buildReportConfig(),
         labels: getReportLabels(activeLang),
      };
      const html = generateReportHTML({ ...state.data, medications }, config);
      if ((Platform.OS as string) === 'web') {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setIsGenerating(false);
        return;
      }

      const { uri: rawUri } = await Print.printToFileAsync({ html, base64: false });
      const dateStr = new Date().toISOString().slice(0, 10);
      const langSuffix2 = activeLang !== 'en' ? `_${activeLang.toUpperCase()}` : '';
      const namedUri = `${FileSystem.cacheDirectory}VitalSync_Personal_Health_Report_${dateStr}${langSuffix2}.pdf`;
      await FileSystem.copyAsync({ from: rawUri, to: namedUri });
      // Delete the raw temp file from Print.printToFileAsync immediately
      FileSystem.deleteAsync(rawUri, { idempotent: true }).catch(() => {});
      setLastPdfUri(namedUri);
      setLastGeneratedAt(new Date());

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        const activeLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === activeLang)?.label ?? activeLang.toUpperCase();
        await Sharing.shareAsync(namedUri, {
          mimeType: 'application/pdf',
          dialogTitle: activeLang !== 'en' ? `VitalSync Health Report (${activeLangLabel})` : 'VitalSync Health Report',
          UTI: 'com.adobe.pdf',
        });
        // Delete the named PDF after sharing to prevent health data lingering in cache
        FileSystem.deleteAsync(namedUri, { idempotent: true }).catch(() => {});
      } else {
        Alert.alert(t.pdfSaved, t.pdfSavedMsg);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error('[VitalSync] PDF generation error:', e);
      Alert.alert(t.errorTitle, t.errorMsg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleTranslatePDF(overrideLang?: string): Promise<void> {
    if (!state.data) {
      Alert.alert(t.noDataSync, t.noDataSyncMsg);
      return;
    }
    // Use the report language selector value if provided, otherwise fall back to app language
    const targetLang = overrideLang ?? (reportLang !== 'en' ? reportLang : rawLang);
    if (STATIC_LANGS.has(targetLang)) {
      return handleGeneratePDF();
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsTranslatingPDF(true);
    try {
      const langName = getLangName(targetLang);
      // Use Apple on-device Translation (iOS 18+) or Gemini API (Android/Web) directly.
      // No server/tRPC call is made.
      const translations = await translateWithFallback(
        DEFAULT_REPORT_LABELS as unknown as Record<string, string>,
        targetLang,
        langName,
      ) as Partial<typeof DEFAULT_REPORT_LABELS>;
      // Detect which engine was used so we can show localized attribution in the footer
      const usedEngine: 'apple' | 'gemini' = Platform.OS === 'ios' ? 'apple' : 'gemini';
      setTranslationEngine(usedEngine);

      const endDate = new Date();
      const startDate = new Date();
      if (dateRangeDays !== 'all') startDate.setDate(startDate.getDate() - (dateRangeDays as number));
      else startDate.setFullYear(2000, 0, 1);

      const config: ReportConfig = {
        patientName: patientName || undefined,
        doctorName: doctorName.trim() || undefined,
        notes: notes || undefined,
        dateRange: { start: startDate, end: endDate },
        includeBloodPressure,
        includePulse,
        includeBodyComposition,
        includeSleep,
        includeCorrelations,
        includeTemperature,
        tempUnit,
        weightUnit,
        glucoseUnit,
        labels: translations as Partial<typeof DEFAULT_REPORT_LABELS>,
        includeA1C,
        a1cSnapshots,
        translationEngine: usedEngine,
      };

      const html = generateReportHTML({ ...state.data, medications }, config);

      if ((Platform.OS as string) === 'web') {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setIsTranslatingPDF(false);
        return;
      }

      const { uri: rawTransUri } = await Print.printToFileAsync({ html, base64: false });
      const dateStrT = new Date().toISOString().slice(0, 10);
      const namedTransUri = `${FileSystem.cacheDirectory}VitalSync_Personal_Health_Report_${dateStrT}_${langName.replace(/\s+/g, '_')}.pdf`;
      await FileSystem.copyAsync({ from: rawTransUri, to: namedTransUri });
      // Delete the raw temp file from Print.printToFileAsync immediately
      FileSystem.deleteAsync(rawTransUri, { idempotent: true }).catch(() => {});
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(namedTransUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share VitalSync Personal Health Report (${langName})`,
          UTI: 'com.adobe.pdf',
        });
        // Delete the named PDF after sharing to prevent health data lingering in cache
        FileSystem.deleteAsync(namedTransUri, { idempotent: true }).catch(() => {});
      } else {
        Alert.alert(t.pdfSaved, t.pdfSavedMsg);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error('[VitalSync] Translate PDF error:', e);
      Alert.alert(t.errorTitle, t.translateError);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsTranslatingPDF(false);
    }
  }

  // ── Text colours that stay readable on glass (dark foreground on light glass) ──
  const fgPrimary = isDark ? '#F1F5F9' : '#0F172A';
  const fgSecondary = isDark ? '#94A3B8' : '#475569';
  const inputBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.70)';
  const inputBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)';

  function ToggleRow({ label, subtitle, value, onToggle, color }: {
    label: string;
    subtitle?: string;
    value: boolean;
    onToggle: (v: boolean) => void;
    color: string;
  }) {
    return (
      <View style={[styles.toggleRow, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
        <View style={[styles.toggleDot, { backgroundColor: value ? color : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)') }]} />
        <View style={styles.toggleText}>
          <Text style={[styles.toggleLabel, { color: fgPrimary }]}>{label}</Text>
          {subtitle && <Text style={[styles.toggleSub, { color: fgSecondary }]}>{subtitle}</Text>}
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)', true: color + '60' }}
          thumbColor={value ? color : (isDark ? '#94A3B8' : '#CBD5E1')}
        />
      </View>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Contextual upsell bottom sheet */}
      {UpsellSheet}

      <ScrollView ref={reportScrollRef} onScroll={handleReportScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Wellness disclaimer moved to floating overlay — see below */}

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: fgPrimary }]}>{t.title}</Text>
          <Text style={[styles.subtitle, { color: fgSecondary }]}>
            {t.subtitle}
          </Text>
        </View>

        {/* ─── Privacy Notice ──────────────────────────────────────────────── */}
        <GlassCard
          accentColor="#10B981"
          style={styles.glassMargin}
          contentStyle={styles.privacyContent}
        >
          <View style={[styles.privacyInner, { flexDirection: rowDir }]}>
            <IconSymbol name="shield.fill" size={18} color="#10B981" />
            <View style={styles.privacyText}>
              <Text style={[styles.privacyTitle, { color: '#10B981' }]}>{t.privacyProtected}</Text>
              <Text style={[styles.privacySub, { color: fgSecondary }]}>
                {t.privacyNote}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── Personal Info ────────────────────────────────────────────────── */}
        <GlassCard accentColor="#22C55E" style={styles.glassMargin}>
          <Text style={[styles.cardTitle, { color: fgPrimary }]}>{t.patientInfo}</Text>
          <View style={{ flexDirection: rowDir, justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.inputLabel, { color: fgSecondary, textAlign: textDir }]}>{t.patientNameLabel}</Text>
            <Text style={{ fontSize: 10, color: patientName.length > 45 ? colors.error : fgSecondary }}>
              {patientName.length}/50
            </Text>
          </View>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: fgPrimary }]}
            placeholder={t.patientNamePlaceholder}
            placeholderTextColor={fgSecondary}
            value={patientName}
            onChangeText={(v) => { if (v.length <= 50) setPatientName(v); }}
            returnKeyType="next"
            maxLength={50}
          />
          <View style={{ flexDirection: rowDir, justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.inputLabel, { color: fgSecondary, textAlign: textDir }]}>{t.doctorNameLabel}</Text>
            <Text style={{ fontSize: 10, color: doctorName.length > 45 ? colors.error : fgSecondary }}>
              {doctorName.length}/50
            </Text>
          </View>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: fgPrimary }]}
            placeholder="e.g. John Smith"
            placeholderTextColor={fgSecondary}
            value={doctorName}
            onChangeText={(v) => { if (v.length <= 50) { setDoctorName(v); safeSetItem(DOCTOR_NAME_KEY, v).catch(() => {}); } }}
            returnKeyType="next"
            maxLength={50}
          />
          {doctorName.trim() === '' && upcomingApptDoctor && (
            <Pressable
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                marginTop: 5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(10,126,164,0.4)' : 'rgba(10,126,164,0.3)',
                backgroundColor: isDark ? 'rgba(10,126,164,0.12)' : 'rgba(10,126,164,0.07)',
                alignSelf: 'flex-start',
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={() => {
                const name = upcomingApptDoctor.doctorName;
                setDoctorName(name);
                safeSetItem(DOCTOR_NAME_KEY, name).catch(() => {});
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '500' }}>
                  {'📅 '}{t.prefillFromAppointment}: {upcomingApptDoctor.doctorName}
                </Text>
                {(upcomingApptDoctor.specialty || upcomingApptDoctor.dateTime) && (
                  <Text style={{ fontSize: 10, color: fgSecondary, marginTop: 1 }}>
                    {[upcomingApptDoctor.specialty, upcomingApptDoctor.dateTime ? new Date(upcomingApptDoctor.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
          {doctorName.trim() === '' && !upcomingApptDoctor && (
            <Text style={{ fontSize: 10, color: fgSecondary, marginTop: 3, fontStyle: 'italic' }}>
              {t.physicianOptionalHint}
            </Text>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={[styles.inputLabel, { color: fgSecondary }]}>{t.preparedByLabel}</Text>
            <Text style={{ fontSize: 10, color: preparedBy.length > 55 ? colors.error : fgSecondary }}>
              {preparedBy.length}/60
            </Text>
          </View>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: fgPrimary }]}
            placeholder={t.preparedByPlaceholder}
            placeholderTextColor={fgSecondary}
            value={preparedBy}
            onChangeText={(v) => { if (v.length <= 60) handlePreparedByChange(v); }}
            returnKeyType="done"
            maxLength={60}
          />
          {preparedBy.length === 0 && (
            <Text style={{ fontSize: 10, color: fgSecondary, marginTop: 3, fontStyle: 'italic' }}>
              {t.preparedByHint}
            </Text>
          )}

          {/* ─── Reset Fields Button ─────────────────────────────────── */}
          {(patientName.length > 0 || doctorName.length > 0 || preparedBy.length > 0) && (
            <Pressable
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                marginTop: 14,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.30)',
                backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)',
                alignSelf: 'flex-end',
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={() => {
                Alert.alert(
                  'Clear fields?',
                  'This will remove your name, doctor, and prepared-by fields.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setPatientName('');
                        setDoctorName('');
                        safeSetItem(DOCTOR_NAME_KEY, '').catch(() => {});
                        handlePreparedByChange('');
                      },
                    },
                  ],
                );
              }}
            >
              <IconSymbol name="xmark.circle" size={12} color={isDark ? '#F87171' : '#EF4444'} />
              <Text style={{ fontSize: 12, color: isDark ? '#F87171' : '#EF4444', fontWeight: '600' }}>
                Reset fields
              </Text>
            </Pressable>
          )}
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── Date Range ──────────────────────────────────────────────────── */}
        <GlassCard accentColor="#0EA5E9" style={styles.glassMargin}>
          <Text style={[styles.cardTitle, { color: fgPrimary }]}>{t.dateRange}</Text>
          <View style={styles.rangeRow}>
            {([7, 14, 30, 90, 'all'] as (number | 'all')[]).map((days) => {
              const isActive = dateRangeDays === days;
              return (
                <Pressable
                  key={days}
                  style={[
                    styles.rangeButton,
                    {
                      backgroundColor: isActive
                        ? (isDark ? 'rgba(14,165,233,0.28)' : 'rgba(14,165,233,0.15)')
                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.50)'),
                      borderColor: isActive
                        ? '#0EA5E9'
                        : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'),
                    },
                  ]}
                  onPress={() => setDateRangeDays(days)}
                >
                  <Text style={[styles.rangeText, { color: isActive ? '#0EA5E9' : fgSecondary }]}>
                    {days === 'all' ? 'All Time' : `${days}d`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* Inline warning when no records fall in the selected range */}
          {state.data && recordCount === 0 && (
            <View style={[styles.emptyRangeWarning, {
              backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.10)',
              borderColor: isDark ? 'rgba(245,158,11,0.40)' : 'rgba(245,158,11,0.30)',
            }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#F59E0B" />
              <Text style={[styles.emptyRangeText, { color: isDark ? '#FBBF24' : '#92400E' }]}>
                No records in this range — try a wider window
              </Text>
            </View>
          )}
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── NeoVital Graph Preview ──────────────────────────────────────── */}
        <GlassCard accentColor="#00C2FF" style={[styles.glassMargin, { overflow: 'hidden' }]}>
          {/* Collapsible header */}
          <TouchableOpacity
            onPress={() => setNeoVitalExpanded(prev => !prev)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: neoVitalExpanded ? 10 : 0 }}
            activeOpacity={0.75}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,194,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="waveform.path.ecg" size={16} color="#00C2FF" />
              </View>
              <View style={{ gap: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#E2E8F0' : '#1E293B' }}>{cs.neoVitalGraph ?? 'NeoVital Monitor'}</Text>
                <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>6 oscillating vital lines · tap to {neoVitalExpanded ? 'collapse' : 'expand'}</Text>
              </View>
            </View>
            <IconSymbol
              name={neoVitalExpanded ? 'chevron.up' : 'chevron.down'}
              size={16}
              color="#00C2FF"
            />
          </TouchableOpacity>
          {/* Range selector + Print Preview button row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
            {/* 30d / 90d range chips */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([30, 90] as const).map(days => {
                const isActive = neoVitalRangeDays === days;
                return (
                  <Pressable
                    key={days}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 20,
                      borderWidth: 1,
                      backgroundColor: isActive
                        ? (isDark ? 'rgba(0,194,255,0.22)' : 'rgba(0,194,255,0.14)')
                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                      borderColor: isActive ? '#00C2FF' : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'),
                      opacity: pressed ? 0.75 : 1,
                    })}
                    onPress={() => handleNeoVitalRangeChange(days)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? '#00C2FF' : (isDark ? '#94A3B8' : '#64748B') }}>
                      Last {days}d
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Print Preview button */}
            <TouchableOpacity
              onPress={handlePrintPreviewNeoVital}
              disabled={!state.data}
              style={[{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 11, paddingVertical: 5,
                borderRadius: 20, borderWidth: 1,
                backgroundColor: isDark ? 'rgba(0,194,255,0.12)' : 'rgba(0,194,255,0.08)',
                borderColor: '#00C2FF',
                opacity: state.data ? 1 : 0.45,
              }]}
              activeOpacity={0.75}
            >
              <IconSymbol name="eye.fill" size={13} color="#00C2FF" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#00C2FF' }}>{t.printPreviewBtn ?? 'Print Preview'}</Text>
            </TouchableOpacity>
          </View>
          {/* Expanded graph */}
          {neoVitalExpanded && (
            <View style={{ marginHorizontal: -16, marginBottom: -16, marginTop: 10 }}>
              <NeoVitalMiniCard />
            </View>
          )}
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── Metric Selection ────────────────────────────────────────────── */}
        <GlassCard accentColor="#8B5CF6" style={styles.glassMargin}>
          <Text style={[styles.cardTitle, { color: fgPrimary }]}>{t.includeMetrics}</Text>
          <ToggleRow
            label={t.bloodPressure}
            subtitle={`${state.data?.bloodPressure?.length ?? 0} ${t.readings}`}
            value={includeBloodPressure}
            onToggle={setIncludeBloodPressure}
            color="#22C55E"
          />
          <ToggleRow
            label={t.pulseHrv}
            subtitle={`${state.data?.pulse?.length ?? 0} ${t.readings}`}
            value={includePulse}
            onToggle={setIncludePulse}
            color="#EF4444"
          />
          <ToggleRow
            label={t.bodyComposition}
            subtitle={`${state.data?.bodyComposition?.length ?? 0} ${t.measurements}`}
            value={includeBodyComposition}
            onToggle={setIncludeBodyComposition}
            color="#3B82F6"
          />
          <ToggleRow
            label={t.sleep}
            subtitle={`${state.data?.sleep?.length ?? 0} ${t.nights}`}
            value={includeSleep}
            onToggle={setIncludeSleep}
            color="#8B5CF6"
          />
          {includeSleep && (state.data?.sleep?.length ?? 0) > 0 && (
            <View style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: '#05070A' }}>
              <TouchableOpacity
                onPress={() => setNeoSleepExpanded(prev => !prev)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}
                activeOpacity={0.75}
              >
                <Text style={{ color: '#A78BFA', fontWeight: '600', fontSize: 13, letterSpacing: 0.3 }}>{t.neoSleepChart ?? 'NeoSleep Chart'}</Text>
                <IconSymbol
                  name={neoSleepExpanded ? 'chevron.up' : 'chevron.down'}
                  size={16}
                  color="#A78BFA"
                />
              </TouchableOpacity>
              {neoSleepExpanded && (
                <NeoSleepWeeklyChart
                  records={state.data!.sleep!}
                  goalHrs={8}
                  colors={colors}
                  isDark={true}
                  compact
                  containerWidth={Dimensions.get('window').width - 32}
                />
              )}
            </View>
          )}
          <ToggleRow
            label={t.bodyTemperature ?? 'Body Temperature'}
            subtitle={`${(state.data?.vitalSigns ?? []).filter((r) => r.temperature !== undefined && r.temperature > 0).length} ${t.readings} (°${tempUnit})`}
            value={includeTemperature}
            onToggle={setIncludeTemperature}
            color="#F97316"
          />
          {/* ── Clinical Analytics ── */}
          <ToggleRow
            label={t.projectedA1c ?? 'Logged A1C & Trend Tracking'}
            subtitle={(t.projectedA1cSubtitle ?? 'ADAG formula · {n} glucose readings').replace('{n}', String((state.data?.bloodSugar ?? []).length))}
            value={includeA1C}
            onToggle={setIncludeA1C}
            color="#8B5CF6"
          />
          <ToggleRow
            label={t.conditionTimeline ?? 'Condition Timeline'}
            subtitle={(t.conditionTimelineSubtitle ?? '{c} conditions · {p} procedures · {v} vaccines').replace('{c}', String((state.data?.medicalHistory ?? []).length)).replace('{p}', String((state.data?.surgicalHistory ?? []).length)).replace('{v}', String((state.data?.immunizations ?? []).length))}
            value={includeConditionTimeline}
            onToggle={setIncludeConditionTimeline}
            color="#06B6D4"
          />
          <ToggleRow
            label={t.mealIqInsights ?? 'Meal IQ Insights'}
            subtitle={(t.mealIqSubtitle ?? '{n} analyzes · top 5 by impact score').replace('{n}', String((state.data?.mealIQAnalyzes ?? []).length))}
            value={includeMealIQ}
            onToggle={setIncludeMealIQ}
            color="#F59E0B"
          />
          <ToggleRow
            label={t.medicationAdherence ?? 'Medication Adherence'}
            subtitle={(t.medicationAdherenceSubtitle ?? '{n} medication(s) · 30-day adherence table').replace('{n}', String(medications.length))}
            value={includeMedications}
            onToggle={setIncludeMedications}
            color="#8B5CF6"
          />
          <ToggleRow
            label={'EKG Recordings'}
            subtitle={ekgRecords.length > 0 ? `${ekgRecords.length} recording(s) · classification breakdown + recent log` : 'No EKG recordings found'}
            value={includeEKG}
            onToggle={setIncludeEKG}
            color="#EF4444"
          />
          <ToggleRow
            label={t.neoVitalGraph ?? 'NeoVital Graph'}
            subtitle={(t.neoVitalSubtitle ?? '6 oscillating vital lines · {d}d range · dark background').replace('{d}', String(neoVitalRangeDays))}
            value={includeNeoVitalGraph}
            onToggle={setIncludeNeoVitalGraph}
            color="#00C2FF"
          />
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── Notes ───────────────────────────────────────────────────────── */}
        <GlassCard accentColor="#22C55E" style={styles.glassMargin}>
          <Text style={[styles.cardTitle, { color: fgPrimary }]}>{t.notesForDoctor}</Text>
          <TextInput
            style={[styles.notesInput, { backgroundColor: inputBg, borderColor: inputBorder, color: fgPrimary }]}
            placeholder={t.notesPlaceholder}
            placeholderTextColor={fgSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            returnKeyType="done"
          />
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── Summary ─────────────────────────────────────────────────────── */}
        <GlassCard accentColor={colors.primary} style={styles.glassMargin} contentStyle={styles.summaryContent}>
          <Text style={[styles.summaryTitle, { color: colors.primary }]}>{t.reportSummary}</Text>
          <Text style={[styles.summaryText, { color: fgPrimary }]}>
            {recordCount} {t.totalDataPoints ?? 'total data points'} · {dateRangeDays === 'all' ? (t.allTime ?? 'All time') : `${dateRangeDays}${t.dayWindow ?? '-day window'}`}
          </Text>
          <Text style={[styles.summaryText, { color: fgSecondary }]}>
            {[
              includeBloodPressure && t.bloodPressure,
              includePulse && t.pulseHrv,
              includeBodyComposition && t.bodyComposition,
              includeSleep && t.sleep,
            ].filter(Boolean).join(' · ')}
          </Text>
        </GlassCard>

        {/* ─── Section Divider ── */}
        <View style={{ height: 14 }} />
        <View style={{ height: 1, marginHorizontal: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)' }} />
        <View style={{ height: 14 }} />

        {/* ─── Disclaimer Notee ─────────────────────────────────────────────── */}
        <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, color: fgSecondary, textAlign: 'center', fontStyle: 'italic', lineHeight: 16 }}>
            {((disclaimerStrings as unknown as Record<string, typeof disclaimerStrings.en>)[lang] ?? disclaimerStrings.en).disclaimer}
          </Text>
        </View>

        {/* ─── Preview & Print Button ──────────────────────────────────────── */}
        <View style={{ position: 'relative', marginHorizontal: 16 }}>
          <Pressable
            style={({ pressed }) => [
              styles.generateButton,
              {
                marginHorizontal: 0,
                backgroundColor: isGenerating ? (isDark ? '#334155' : '#CBD5E1') : colors.primary,
                opacity: pressed ? 0.88 : 1,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: pressed ? 0 : 0.30,
                shadowRadius: 8,
                elevation: pressed ? 0 : 6,
                transform: [{ translateY: pressed ? 2 : 0 }],
              },
            ]}
            onPress={() => Platform.OS === 'web' ? handleGeneratePDF() : handlePreviewReport()}
            disabled={isGenerating || !state.data}
          >
            {isGenerating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <IconSymbol
                name={Platform.OS === 'web' ? 'square.and.arrow.up' : 'eye.fill'}
                size={18}
                color="#FFFFFF"
              />
            )}
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.generateButtonText}>
                {isGenerating
                  ? t.generatingPdf
                  : Platform.OS === 'web'
                  ? t.generatePdf
                  : (t.previewAndPrintReport ?? 'Preview & Print Report')}
              </Text>
              {!isGenerating && reportLang !== 'en' && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                  {reportLangLabel}
                </Text>
              )}
            </View>
          </Pressable>
          {/* 2-letter language badge chip — tappable to open inline language picker */}
          {!isGenerating && (
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowLangPicker(true);
              }}
              style={({ pressed }) => ({
                position: 'absolute',
                top: -8,
                right: -8,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderRadius: 10,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderWidth: 1.5,
                borderColor: colors.primary,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.12,
                shadowRadius: 3,
                elevation: 3,
                minWidth: 28,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: colors.primary,
                  letterSpacing: 0.5,
                }}
              >
                {reportLang.toUpperCase()}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ─── Privacy Badge ─────────────────────────────────────────────── */}
        <View style={styles.privacyBadge}>
          <IconSymbol name="lock.fill" size={11} color="#10B981" />
          <Text style={styles.privacyBadgeText}>
            {t.createdOnDevice ?? 'Created on-device · only leaves when you share'}
          </Text>
        </View>

        {/* ─── Last Generated Timestamp Badge ──────────────────────────── */}
        {lastGeneratedAt && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 6 }}>
            <IconSymbol name="checkmark.circle.fill" size={11} color={isDark ? '#4ADE80' : '#16A34A'} />
            <Text style={{ fontSize: 11, color: isDark ? '#4ADE80' : '#16A34A', fontWeight: '500' }}>
              {'Last generated: ' + (() => {
                const now = new Date();
                const diff = Math.floor((now.getTime() - lastGeneratedAt.getTime()) / 1000);
                if (diff < 60) return t.setJustNow ?? 'Just now';
                if (diff < 3600) return `${Math.floor(diff / 60)}${t.setMinAgo ?? 'm ago'}`;
                if (diff < 86400) return `${Math.floor(diff / 3600)}${t.setHrAgo ?? 'h ago'}`;
                return lastGeneratedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              })()}
            </Text>
          </View>
        )}

        {/* ─── Generate & Save to Files Button (primary, iOS/Android only) ──── */}
        {Platform.OS !== 'web' && (
          <Pressable
            style={({ pressed }) => [
              styles.generateButton,
              {
                backgroundColor: isGeneratingAndSaving
                  ? (isDark ? '#0E7490' : '#0891B2')
                  : '#06B6D4',
                opacity: pressed ? 0.88 : 1,
                shadowColor: '#06B6D4',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: pressed ? 0 : 0.30,
                shadowRadius: 8,
                elevation: pressed ? 0 : 6,
                transform: [{ translateY: pressed ? 2 : 0 }],
                marginTop: 10,
              },
            ]}
            onPress={handleGenerateAndSave}
            disabled={isGeneratingAndSaving || isGenerating || !state.data}
          >
            {isGeneratingAndSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <IconSymbol name="arrow.down.doc.fill" size={18} color="#FFFFFF" />
            )}
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.generateButtonText}>
                {isGeneratingAndSaving ? (t.generatingPdf ?? 'Generating PDF…') : (cs.generateAndSaveToFiles ?? 'Generate & Save to Files')}
              </Text>
              {!isGeneratingAndSaving && reportLang !== 'en' && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                  {reportLangLabel}
                </Text>
              )}
            </View>
          </Pressable>
        )}

        {/* ─── Share Last Report Button ─────────────────────────────────── */}
        {lastPdfUri && Platform.OS !== 'web' && (
          <Pressable
            style={({ pressed }) => [{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: colors.primary + '60',
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.70)',
              opacity: pressed ? 0.8 : 1,
              marginTop: 10,
              marginHorizontal: 16,
            }]}
            onPress={async () => {
              if (!lastPdfUri) return;
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) {
                await Sharing.shareAsync(lastPdfUri, {
                  mimeType: 'application/pdf',
                  dialogTitle: reportLang !== 'en' ? `VitalSync Health Report (${reportLangLabel})` : 'VitalSync Health Report',
                  UTI: 'com.adobe.pdf',
                });
              } else {
                Alert.alert(t.shareNotAvailable, t.shareNotAvailableMsg);
              }
            }}
          >
            <IconSymbol name="square.and.arrow.up" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Share Last Report</Text>
          </Pressable>
        )}

        {/* ─── Save to Files / AirDrop Button ──────────────────────────── */}
        {lastPdfUri && Platform.OS !== 'web' && (
          <Pressable
            style={({ pressed }) => [{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: '#06B6D4' + '60',
              backgroundColor: isAirDropping
                ? (isDark ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.08)')
                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.70)'),
              opacity: pressed ? 0.8 : 1,
              marginTop: 10,
              marginHorizontal: 16,
            }]}
            onPress={async () => {
              if (!lastPdfUri || isAirDropping) return;
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsAirDropping(true);
              try {
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(lastPdfUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: reportLang !== 'en' ? `Save to Files or AirDrop (${reportLangLabel})` : 'Save to Files or AirDrop',
                    UTI: 'com.adobe.pdf',
                  });
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } else {
                  Alert.alert(t.notAvailable, t.notAvailableMsg);
                }
              } catch (_unused) {
                Alert.alert(t.exportFailed, t.exportFailedMsg);
              } finally {
                setIsAirDropping(false);
              }
            }}
            disabled={isAirDropping}
          >
            {isAirDropping ? (
              <ActivityIndicator color="#06B6D4" size="small" />
            ) : (
              <IconSymbol name="arrow.down.doc.fill" size={16} color="#06B6D4" />
            )}
            <Text style={{ color: '#06B6D4', fontSize: 14, fontWeight: '600' }}>
              {isAirDropping ? 'Opening…' : 'Save to Files / AirDrop'}
            </Text>
          </Pressable>
        )}


        {/* ─── Translate PDF Button (Smart languages only) ─────────────────── */}
        {!STATIC_LANGS.has(rawLang) && (
          <Pressable
            style={({ pressed }) => [
              styles.translatePdfButton,
              {
                backgroundColor: isTranslatingPDF
                  ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                  : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.70)'),
                borderColor: colors.primary + '60',
                opacity: pressed ? 0.85 : 1,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: pressed ? 0 : 0.15,
                shadowRadius: 6,
                elevation: pressed ? 0 : 3,
                transform: [{ translateY: pressed ? 1 : 0 }],
              },
            ]}
            onPress={() => handleTranslatePDF()}
            disabled={isTranslatingPDF || isGenerating}
          >
            {isTranslatingPDF ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <IconSymbol name="globe" size={17} color={colors.primary} />
            )}
            <Text style={[styles.translatePdfButtonText, { color: colors.primary }]}>
              {isTranslatingPDF
                ? `Translating PDF (${getLangName(rawLang)})…`
                : `Translate PDF (${getLangName(rawLang)})`}
            </Text>
          </Pressable>
        )}

        {/* ─── CSV Export Card ─────────────────────────────────────────────── */}
        <GlassCard accentColor="#06B6D4" style={[styles.glassMargin, { marginTop: 12, marginBottom: 12 }]}>
          <View style={styles.csvHeader}>
            <View style={[styles.csvIcon, { backgroundColor: 'rgba(6,182,212,0.15)' }]}>
              <IconSymbol name="doc.text.fill" size={16} color="#06B6D4" />
            </View>
            <View style={styles.csvHeaderText}>
              <Text style={[styles.csvTitle, { color: fgPrimary }]}>{t.exportRawData}</Text>
              <Text style={[styles.csvSubtitle, { color: fgSecondary }]}>
                {(() => {
                  const summary = getExportSummary(state.data ?? null);
                  return summary.totalRecords > 0
                    ? `${summary.totalRecords} ${t.recordsAcrossCategories} ${summary.categories.length} ${t.categories}`
                    : t.syncFirstToExport;
                })()}
              </Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.csvButton,
              {
                backgroundColor: isExportingCSV ? (isDark ? '#334155' : '#CBD5E1') : '#06B6D4',
                opacity: pressed ? 0.85 : 1,
                shadowColor: '#06B6D4',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: pressed ? 0 : 0.25,
                shadowRadius: 6,
                elevation: pressed ? 0 : 4,
                transform: [{ translateY: pressed ? 1 : 0 }],
              },
            ]}
            onPress={async () => {
              if (!state.data) {
                Alert.alert(t.noDataSync, t.noDataSyncMsg);
                return;
              }
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              setIsExportingCSV(true);
              try {
                const result = await exportHealthDataAsCSV(state.data);
                if (result.success) {
                  if (Platform.OS !== 'web') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                } else {
                  Alert.alert(t.exportFailed, result.error ?? t.exportFailedUnknown);
                  if (Platform.OS !== 'web') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  }
                }
              } catch (_unused) {
                Alert.alert(t.exportFailed, t.exportFailedUnknown);
              } finally {
                setIsExportingCSV(false);
              }
            }}
            disabled={isExportingCSV || !state.data}
          >
            {isExportingCSV ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <IconSymbol name="arrow.down.doc.fill" size={16} color="#FFFFFF" />
            )}
            <Text style={styles.csvButtonText}>
              {isExportingCSV ? 'Exporting...' : t.exportCsv}
            </Text>
          </Pressable>
        </GlassCard>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ─── Full-Screen Report Preview Modal ──────────────────────────── */}
      <Modal
        visible={isPreviewing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setIsPreviewing(false); setIsPrintPreviewingNeoVital(false); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          {/* Modal header */}
          <View style={[styles.previewModalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.previewModalTitle, { color: colors.foreground }]}>
                {isPrintPreviewingNeoVital ? (t.neoVitalPreviewTitle ?? 'NeoVital Graph Preview') : (t.reportPreviewTitle ?? 'Report Preview')}
              </Text>
              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                {isPrintPreviewingNeoVital ? (t.neoVitalPreviewSubtitle ?? 'Scrolled to NeoVital graph section') : (t.reviewBeforePrinting ?? 'Review before printing or sharing')}
              </Text>
            </View>
            <View style={styles.previewModalActions}>
              {/* Print PDF — uses native print dialog */}
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={[styles.previewModalBtn, { backgroundColor: '#1E293B' }]}
                  disabled={isGenerating}
                  onPress={async () => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    try {
                      const html = previewHtml ?? '';
                      await Print.printAsync({ html });
                    } catch (_unused) {
                      // User cancelled print — not an error
                    }
                  }}
                >
                  <IconSymbol name="printer.fill" size={14} color="#FFFFFF" />
                  <Text style={styles.previewModalBtnText}>{t.printBtn ?? 'Print'}</Text>
                </TouchableOpacity>
              )}
              {/* Share PDF — uses effectivePreviewLang so the exported PDF matches the previewed language */}
              <TouchableOpacity
                style={[styles.previewModalBtn, { backgroundColor: colors.primary }]}
                disabled={isGenerating}
                onPress={async () => {
                  setIsPreviewing(false);
                  await handleGeneratePDF(effectivePreviewLang);
                }}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="square.and.arrow.up" size={14} color="#FFFFFF" />
                )}
                <Text style={styles.previewModalBtnText}>{t.sharePdfBtn ?? 'Share PDF'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.previewModalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { setIsPreviewing(false); setIsPrintPreviewingNeoVital(false); }}
              >
                <Text style={[styles.previewModalBtnText, { color: colors.foreground }]}>{t.closeBtn ?? 'Close'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* ─── Language Selector Bar ─────────────────────────────────── */}
          {!isPrintPreviewingNeoVital && (
            <View style={[
              styles.previewLangBar,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}>
              <Text style={[styles.previewLangLabel, { color: colors.muted }]}>
                {t.previewReportLang ?? 'Preview Language'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.previewLangChips}
              >
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isActive = effectivePreviewLang === lang.code;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={() => handlePreviewLangChange(lang.code as ReportLang)}
                      disabled={isRegeneratingPreview}
                      style={[
                        styles.previewLangChip,
                        {
                          backgroundColor: isActive ? colors.primary : colors.background,
                          borderColor: isActive ? colors.primary : colors.border,
                          opacity: isRegeneratingPreview && !isActive ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Text style={[
                        styles.previewLangChipNative,
                        { color: isActive ? colors.background : colors.foreground },
                      ]}>
                        {lang.native}
                      </Text>
                      <Text style={[
                        styles.previewLangChipSub,
                        { color: isActive ? colors.background : colors.muted },
                      ]}>
                        {lang.code.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {isRegeneratingPreview && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
              )}
            </View>
          )}
          {/* Translation engine attribution badge */}
          {translationEngine && !isPrintPreviewingNeoVital && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 5,
              paddingHorizontal: 12,
              backgroundColor: translationEngine === 'apple' ? '#F0F4FF' : '#F0FDF4',
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: translationEngine === 'apple' ? '#BFDBFE' : '#BBF7D0',
            }}>
              <Text style={{
                fontSize: 11,
                color: translationEngine === 'apple' ? '#1D4ED8' : '#15803D',
                fontWeight: '500',
              }}>
                {translationEngine === 'apple'
                  ? ((complianceRingStrings as unknown as Record<string, Record<string, string>>)[rawLang]?.translatedByApple ?? complianceRingStrings.en.translatedByApple)
                  : ((complianceRingStrings as unknown as Record<string, Record<string, string>>)[rawLang]?.translatedByGemini ?? complianceRingStrings.en.translatedByGemini)
                }
              </Text>
            </View>
          )}
          {/* WebView renders the full HTML report */}
          {previewHtml && !isRegeneratingPreview ? (
            <WebView
              source={{ html: previewHtml }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              scrollEnabled
              showsVerticalScrollIndicator
              javaScriptEnabled={isPrintPreviewingNeoVital}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {isRegeneratingPreview
                  ? (t.generatingPreview ?? 'Generating preview…')
                  : (t.generatingPreview ?? 'Generating preview…')}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
      <ScrollToTopButton opacity={reportScrollTopOpacity} visible={showReportScrollTop} onPress={reportScrollToTop} />
      {/* Floating wellness disclaimer — absolute overlay, stays visible while scrolling */}
      <FloatingWellnessDisclaimer bottomOffset={80} position="bottom" />

      {/* ─── Inline Language Picker Modal ─────────────────────────────── */}
      <Modal
        visible={showLangPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setShowLangPicker(false)}
        >
          {/* Stop propagation so tapping inside the sheet doesn't close it */}
          <Pressable
            style={{
              backgroundColor: isDark ? '#1E2022' : '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 12,
              paddingBottom: 32,
              paddingHorizontal: 16,
              maxHeight: Dimensions.get('window').height * 0.6,
            }}
            onPress={() => {}}
          >
            {/* Drag handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#334155' : '#D1D5DB', alignSelf: 'center', marginBottom: 14 }} />
            {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
                {t.previewReportLang ?? 'Report Language'}
              </Text>
              <Pressable
                onPress={() => setShowLangPicker(false)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
              >
                <Text style={{ fontSize: 14, color: colors.muted }}>✕</Text>
              </Pressable>
            </View>
            {/* Language chips grid */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isActive = reportLang === lang.code;
                  return (
                    <Pressable
                      key={lang.code}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        handleReportLangChange(lang.code);
                        setShowLangPicker(false);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        backgroundColor: isActive ? colors.primary : (isDark ? '#1E293B' : '#F8FAFC'),
                        borderColor: isActive ? colors.primary : colors.border,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      {/* 2-letter code badge */}
                      <View style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : colors.surface,
                        borderRadius: 6,
                        paddingHorizontal: 5,
                        paddingVertical: 2,
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: isActive ? '#FFFFFF' : colors.primary, letterSpacing: 0.5 }}>
                          {lang.code.toUpperCase()}
                        </Text>
                      </View>
                      {/* Native language name */}
                      <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500', color: isActive ? '#FFFFFF' : colors.foreground }}>
                        {lang.native}
                      </Text>
                      {/* Checkmark for active */}
                      {isActive && (
                        <Text style={{ fontSize: 12, color: '#FFFFFF', marginLeft: 2 }}>✓</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 16 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 6 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontWeight: '400', lineHeight: 18 },

  // Shared glass card margin
  glassMargin: { marginHorizontal: 16, marginBottom: 0 },

  // Privacy card inner layout
  privacyContent: { padding: 14 },
  privacyInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  privacyText: { flex: 1, gap: 3 },
  privacyTitle: { fontSize: 13, fontWeight: '700' },
  privacySub: { fontSize: 11, lineHeight: 16 },

  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
  inputLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 11, fontSize: 14, marginBottom: 14,
  },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeButton: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: 'center',
  },
  rangeText: { fontSize: 13, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleDot: { width: 8, height: 8, borderRadius: 4 },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleSub: { fontSize: 11, fontWeight: '400' },
  notesInput: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 11, fontSize: 13, minHeight: 90, lineHeight: 20,
  },
  summaryContent: { gap: 4 },
  summaryTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  summaryText: { fontSize: 13, fontWeight: '500' },
  generateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginHorizontal: 16, borderRadius: 16,
    paddingVertical: 16,
  },
  generateButtonText: {
    color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.2,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  privacyBadgeText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  translatePdfButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 16, marginTop: 10, borderRadius: 14,
    paddingVertical: 13, borderWidth: 1,
  },
  translatePdfButtonText: {
    fontSize: 14, fontWeight: '700', letterSpacing: 0.1,
  },
  csvHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  csvIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  csvHeaderText: { flex: 1, gap: 2 },
  csvTitle: { fontSize: 14, fontWeight: '700' },
  csvSubtitle: { fontSize: 12, lineHeight: 16 },
  csvButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 12,
  },
  csvButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  previewModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // backgroundColor and borderBottomColor set dynamically via colors.surface / colors.border
  },
  previewModalTitle: { fontSize: 17, fontWeight: '700' }, // color: colors.foreground applied inline
  previewModalActions: { flexDirection: 'row', gap: 8 },
  previewModalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  previewModalBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  emptyRangeWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  emptyRangeText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  // Preview modal language selector bar
  previewLangBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  previewLangLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  previewLangChips: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 4,
  },
  previewLangChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 52,
  },
  previewLangChipNative: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  previewLangChipSub: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 1,
    textAlign: 'center',
  },
});
