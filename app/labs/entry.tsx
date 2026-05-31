/**
 * Lab Entry Screen
 *
 * Glassmorphism + clinical design language:
 * - Frosted glass panel cards with layered depth shadows
 * - Rotary panel selector (hardware-feel dial)
 * - OCR photo capture → Smart extracts values
 * - Manual entry fallback with inline reference ranges
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as SafeImagePicker from '@/lib/safe-image-picker';
import { MedicalScanAnalysisOverlay, type ScanStep } from '@/components/medical-scan-analysis-overlay';
import { extractTextFromImage } from 'expo-text-extractor';
import { parseLabOcr } from '@/lib/scribe/parsers';
import { OcrReviewCard, type OcrReviewField } from '@/components/ocr-review-card';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors, useLang } from '@/hooks';
import { labsStrings } from '@/lib/i18n';
import { useLabResultsBadge } from '@/hooks/use-lab-results-badge';
import { scheduleLabPanelReminder } from '@/lib/health/lab-reminders';
import { checkAnalyteThresholdsForResult } from '@/lib/notifications/analyte-threshold-checker';
import { useHealth } from '@/lib/health/health-context';

import { LAB_PANEL_LABELS, PANEL_ANALYTES, REFERENCE_RANGES, getAnalyteStatus, type LabPanelId, type LabAnalyteId, LabResult } from '@/lib/health/lab-types';
import { DatePickerIconButton } from '@/components/date-time-picker-field';

const { width: _SCREEN_W } = Dimensions.get('window');

// ─── Panel Selector ───────────────────────────────────────────────────────────

const PANELS: LabPanelId[] = ['CMP', 'CBC', 'MG', 'PHOS', 'LIPID', 'A1C'];

const PANEL_ICONS: Record<LabPanelId, string> = {
  CMP: 'CMP', CBC: 'CBC', MG: 'Mg', PHOS: 'P', LIPID: 'HDL', A1C: 'A1C',
};

const PANEL_COLORS: Record<LabPanelId, string> = {
  CMP:   '#2563EB',
  CBC:   '#7C3AED',
  MG:    '#22C55E',
  PHOS:  '#D97706',
  LIPID: '#DC2626',
  A1C:   '#DB2777',
};

// ─── Glassmorphism Card ───────────────────────────────────────────────────────

function GlassCard({
  children,
  style,
  accentColor,
}: {
  children: React.ReactNode;
  style?: object;
  accentColor?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.glassCard,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: accentColor ? `${accentColor}30` : colors.border,
          shadowColor: colors.shadowBase,
        },
        style,
      ]}
    >
      {accentColor && (
        <View style={[styles.glassAccentBar, { backgroundColor: accentColor }]} />
      )}
      {children}
    </View>
  );
}

// ─── Panel Dial ───────────────────────────────────────────────────────────────

function PanelDial({
  selected,
  onSelect,
}: {
  selected: LabPanelId;
  onSelect: (p: LabPanelId) => void;
}) {
  const colors = useColors();
  const _dlang = useLang();
  const _dls = labsStrings[_dlang as keyof typeof labsStrings] ?? labsStrings.en;
  const _selectedIdx = PANELS.indexOf(selected);

  return (
    <View style={styles.dialContainer}>
      <Text style={[styles.dialLabel, { color: colors.muted }]}>{_dls.selectPanel.toUpperCase()}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dialScroll}
      >
        {PANELS.map((panel, _idx) => {
          const isActive = panel === selected;
          const color = PANEL_COLORS[panel];
          return (
            <Pressable
              key={panel}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onSelect(panel);
              }}
              style={({ pressed }) => [
                styles.dialItem,
                {
                  backgroundColor: isActive ? color : colors.surface,
                  borderColor: isActive ? color : colors.border,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: isActive ? 1.05 : 1 }],
                  shadowColor: isActive ? color : 'transparent',
                  shadowOpacity: isActive ? 0.4 : 0,
                  shadowRadius: isActive ? 8 : 0,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: isActive ? 6 : 0,
                },
              ]}
            >
              <Text style={[styles.dialItemAbbr, { color: isActive ? '#fff' : colors.muted }]}>
                {PANEL_ICONS[panel]}
              </Text>
              <Text style={[styles.dialItemName, { color: isActive ? '#fff' : colors.foreground }]}>
                {panel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[styles.dialPanelFull, { color: colors.foreground }]}>
        {selected === 'CMP' ? _dls.panelCmp
          : selected === 'CBC' ? _dls.panelCbc
          : selected === 'MG' ? _dls.panelMg
          : selected === 'PHOS' ? _dls.panelPhos
          : selected === 'LIPID' ? _dls.panelLipid
          : _dls.panelA1c}
      </Text>
    </View>
  );
}

// ─── Analyte Row ──────────────────────────────────────────────────────────────

function AnalyteRow({
  analyteId,
  value,
  onChange,
}: {
  analyteId: LabAnalyteId;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const ref = REFERENCE_RANGES[analyteId];
  if (!ref) return null;

  const numVal = parseFloat(value);
  const status = !isNaN(numVal) ? getAnalyteStatus(analyteId, numVal) : null;

  const statusColor = status === 'high'
    ? colors.error
    : status === 'low'
      ? colors.accent
      : status === 'normal'
        ? colors.success
        : colors.muted;

  return (
    <View style={[styles.analyteRow, { borderBottomColor: colors.border }]}>
      <View style={styles.analyteLeft}>
        <Text style={[styles.analyteLabel, { color: colors.foreground }]}>{ref.label}</Text>
        <Text style={[styles.analyteRef, { color: colors.muted }]}>
          {ref.low}–{ref.high} {ref.unit}
        </Text>
      </View>
      <View style={styles.analyteRight}>
        <TextInput
          style={[
            styles.analyteInput,
            {
              color: status ? statusColor : colors.foreground,
              borderColor: status ? statusColor : colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          value={value}
          onChangeText={onChange}
          keyboardType="default"
          placeholder="—"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          selectTextOnFocus
        />
        {status && (
          <Text style={[styles.analyteStatus, { color: statusColor }]}>
            {status === 'high' ? '▲' : status === 'low' ? '▼' : '✓'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LabEntryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addLabResult } = useHealth();
  const _lang = useLang();
  const ls = labsStrings[_lang as keyof typeof labsStrings] ?? labsStrings.en;
  const { markNewLabResult } = useLabResultsBadge();

  const [selectedPanel, setSelectedPanel] = useState<LabPanelId>('CMP');
  const [values, setValues] = useState<Partial<Record<LabAnalyteId, string>>>({});
  const [labName, setLabName] = useState('');
  const [collectionDate, setCollectionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrReviewFields, setOcrReviewFields] = useState<OcrReviewField[]>([]);
  // Accumulated extracted values across multiple scanned pages
  const [ocrAccumulated, setOcrAccumulated] = useState<Record<string, string>>({});
  const [ocrPageCount, setOcrPageCount] = useState(0);
  // Stable refs so onConfirm always reads the latest pending data regardless of re-renders
  const ocrPendingRef = useRef<Record<string, string> | null>(null);
  const ocrUsedLlmRef = useRef(false);

  const analytes = PANEL_ANALYTES[selectedPanel];
  const accentColor = PANEL_COLORS[selectedPanel];

  const handlePanelChange = useCallback((panel: LabPanelId) => {
    setSelectedPanel(panel);
    setOcrError(null);
  }, []);

  const handleValueChange = useCallback((analyteId: LabAnalyteId, val: string) => {
    setValues(prev => ({ ...prev, [analyteId]: val }));
  }, []);

  // ── Apply extracted OCR data to form ─────────────────────────────────────
  const applyExtracted = useCallback((extracted: Record<string, string>) => {
    const extractedKeys = Object.keys(extracted).filter(k => extracted[k]?.trim() && !k.startsWith('__'));
    // Auto-detect best panel from extracted analyte keys
    let bestPanel: LabPanelId = selectedPanel;
    let bestMatches = 0;
    for (const panel of PANELS) {
      const panelAnalytes = PANEL_ANALYTES[panel];
      const matches = extractedKeys.filter(k => panelAnalytes.includes(k as LabAnalyteId)).length;
      if (matches > bestMatches) { bestMatches = matches; bestPanel = panel; }
    }
    if (bestMatches > 0) setSelectedPanel(bestPanel);
    const newValues: Partial<Record<LabAnalyteId, string>> = {};
    for (const [k, v] of Object.entries(extracted)) {
      if (v?.trim() && !k.startsWith('__')) newValues[k as LabAnalyteId] = v;
    }
    if (Object.keys(newValues).length > 0) setValues(newValues);
    if (extracted.__labName) setLabName(extracted.__labName);
    if (extracted.__collectionDate) setCollectionDate(extracted.__collectionDate.slice(0, 10));
    setOcrError(null);
    setOcrReviewFields([]);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedPanel]);

  // ── Lab Report Scan: LLM vision primary, Apple Vision OCR fallback ─────────
  // Lab scan overlay state
  const [labScanOverlayVisible, setLabScanOverlayVisible] = useState(false);
  const [labScanImageUri, setLabScanImageUri] = useState<string>('');
  const [labScanProgress, setLabScanProgress] = useState(0);
  const [labScanError, setLabScanError] = useState<string | null>(null);
  const [labScanSteps, setLabScanSteps] = useState<ScanStep[]>([
    { id: 'capture',  label: 'Image captured',           status: 'pending' },
    { id: 'upload',   label: 'Sending to Gemini Vision', status: 'pending' },
    { id: 'reading',  label: 'Reading lab report',       status: 'pending' },
    { id: 'extract',  label: 'Extracting lab values',    status: 'pending' },
    { id: 'validate', label: 'Validating results',       status: 'pending' },
  ]);
  const INITIAL_LAB_STEPS: ScanStep[] = [
    { id: 'capture',  label: 'Image captured',           status: 'pending' },
    { id: 'upload',   label: 'Sending to Gemini Vision', status: 'pending' },
    { id: 'reading',  label: 'Reading lab report',       status: 'pending' },
    { id: 'extract',  label: 'Extracting lab values',    status: 'pending' },
    { id: 'validate', label: 'Validating results',       status: 'pending' },
  ];
  const updateLabStep = useCallback((id: string, status: ScanStep['status']) => {
    setLabScanSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }, []);

  const handleOcrScan = useCallback(async () => {
    try {
      const perm = await SafeImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(ls.cameraPermissionTitle, ls.cameraPermissionMsg);
        return;
      }
      const result = await SafeImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.9,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      // ── Show live analysis overlay ────────────────────────────────────────
      setLabScanImageUri(asset.uri);
      setLabScanSteps(INITIAL_LAB_STEPS);
      setLabScanProgress(0);
      setLabScanError(null);
      setLabScanOverlayVisible(true);
      setOcrLoading(true);
      setOcrError(null);
      setOcrReviewFields([]);

      let extracted: Record<string, string> = {};
      let usedLlm = false;

      try {
        updateLabStep('capture', 'done');
        setLabScanProgress(20);
        updateLabStep('upload', 'active');

        // ── Primary: Gemini 2.5-flash Vision (client-side, no server needed) ───
        if (asset.base64) {
          try {
            updateLabStep('upload', 'done');
            setLabScanProgress(40);
            updateLabStep('reading', 'active');

            const { parseLabReportWithGemini } = await import('@/lib/labs/gemini-lab-parser');
            const llmResult = await parseLabReportWithGemini(asset.base64, 'image/jpeg');

            updateLabStep('reading', 'done');
            setLabScanProgress(70);
            updateLabStep('extract', 'active');

            if (!llmResult.error && llmResult.results.length > 0) {
              // Map Gemini results to extracted key-value pairs
              for (const r of llmResult.results) {
                if (r.value !== null && r.value !== undefined) {
                  extracted[r.analyteId ?? r.testName.toLowerCase().replace(/\s+/g, '_')] = String(r.value);
                }
              }
              if (llmResult.labName) extracted.__labName = llmResult.labName;
              if (llmResult.collectionDate) extracted.__collectionDate = llmResult.collectionDate;
              // Auto-select panel from detected analytes
              const detectedKeys = Object.keys(extracted).filter(k => !k.startsWith('__'));
              let bestPanel: LabPanelId = selectedPanel;
              let bestMatches = 0;
              for (const panel of PANELS) {
                const matches = detectedKeys.filter(k => (PANEL_ANALYTES[panel] as string[]).includes(k)).length;
                if (matches > bestMatches) { bestMatches = matches; bestPanel = panel; }
              }
              if (bestMatches > 0) setSelectedPanel(bestPanel);
              usedLlm = true;
            } else if (llmResult.error) {
              throw new Error(llmResult.error);
            }
          } catch (llmErr) {
            console.warn('[Lab Scan] Gemini Vision failed, falling back to Apple Vision OCR:', llmErr);
            updateLabStep('reading', 'error');
          }
        }

        // ── Fallback: Apple Vision OCR + local regex parser ─────────────────
        if (!usedLlm) {
          updateLabStep('upload', 'done');
          setLabScanProgress(40);
          updateLabStep('reading', 'active');
          const lines = await extractTextFromImage(asset.uri);
          extracted = parseLabOcr(lines);
          updateLabStep('reading', 'done');
          setLabScanProgress(70);
          updateLabStep('extract', 'active');
        }

        updateLabStep('extract', 'done');
        setLabScanProgress(90);
        updateLabStep('validate', 'active');

        const analyteKeys = Object.keys(extracted).filter(k => !k.startsWith('__'));
        if (analyteKeys.length === 0) {
          throw new Error(usedLlm ? ls.ocrNoValuesFound : ls.ocrScanFailed);
        }

        updateLabStep('validate', 'done');
        setLabScanProgress(100);

        // Merge with previously accumulated values
        const merged = { ...ocrAccumulated, ...extracted };
        setOcrAccumulated(merged);
        setOcrPageCount(prev => prev + 1);

        // Rebuild review fields from merged data
        const mergedAnalyteKeys = Object.keys(merged).filter(k => !k.startsWith('__'));
        const allPanelAnalytes = PANEL_ANALYTES[selectedPanel];
        const allKnownAnalytes = PANELS.flatMap(p => PANEL_ANALYTES[p]);
        const extraAnalytes = mergedAnalyteKeys.filter(
          k => !allPanelAnalytes.includes(k as LabAnalyteId) && allKnownAnalytes.includes(k as LabAnalyteId)
        ) as LabAnalyteId[];
        const reviewAnalytes = [...allPanelAnalytes, ...extraAnalytes];
        const mergedReviewFields: OcrReviewField[] = reviewAnalytes.map(id => ({
          label: REFERENCE_RANGES[id]?.label ?? id,
          value: merged[id] ?? null,
          extracted: !!merged[id],
        }));
        if (merged.__labName) mergedReviewFields.push({ label: ls.labFacility, value: merged.__labName, extracted: true });
        if (merged.__collectionDate) mergedReviewFields.push({ label: ls.collectionDate, value: merged.__collectionDate, extracted: true });
        setOcrReviewFields(mergedReviewFields);
        ocrPendingRef.current = merged;
        ocrUsedLlmRef.current = usedLlm;

        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Close overlay after short success pause
        setTimeout(() => setLabScanOverlayVisible(false), 600);

      } catch (innerErr: any) {
        const msg = innerErr?.message ?? ls.ocrScanFailed;
        setLabScanError(msg);
        setOcrError(msg);
        setLabScanSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setOcrLoading(false);
      }
    } catch (err: any) {
      setOcrError(err?.message ?? ls.ocrScanFailed);
    }
  }, [selectedPanel, ocrAccumulated, updateLabStep]);

  // ── Save ──────────────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const numericValues: Partial<Record<LabAnalyteId, number>> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = parseFloat(v as string);
      if (!isNaN(n)) numericValues[k as LabAnalyteId] = n;
    }

    if (Object.keys(numericValues).length === 0) {
      Alert.alert(ls.noValuesTitle, ls.noValuesMsg);
      return;
    }

    setIsSaving(true);
    try {
      const record: LabResult = {
        id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(collectionDate).toISOString(),
        panel: selectedPanel,
        values: numericValues,
        source: 'manual',
        labName: labName.trim() || undefined,
      };
      await addLabResult(record);
      markNewLabResult();
      // Schedule a reminder for when this panel is due again
      scheduleLabPanelReminder(selectedPanel, record.timestamp).catch(console.warn);
      // Check per-analyte custom thresholds and fire alerts if needed
      checkAnalyteThresholdsForResult(record).catch(console.warn);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (_unused) {
      Alert.alert(ls.saveFailedTitle, ls.saveFailedMsg);
    } finally {
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, selectedPanel, collectionDate, labName, addLabResult]);

  const filledCount = analytes.filter(a => {
    const v = values[a];
    return v !== undefined && v !== '' && !isNaN(parseFloat(v));
  }).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          <Text style={[styles.headerBackText, { color: colors.primary }]}>{ls.back}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{ls.addLabResult}</Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.headerSave,
            { backgroundColor: accentColor, opacity: pressed || isSaving ? 0.7 : 1 },
          ]}
        >
          {isSaving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.headerSaveText}>{ls.saveLabResult}</Text>
          }
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Panel Dial */}
        <GlassCard accentColor={accentColor} style={styles.dialCard}>
          <PanelDial selected={selectedPanel} onSelect={handlePanelChange} />
        </GlassCard>

        {/* Apple Vision OCR Scan */}
        <GlassCard accentColor={accentColor}>
          <View style={styles.ocrSection}>
            <View style={styles.ocrTextBlock}>
              <Text style={[styles.ocrTitle, { color: colors.foreground }]}>{ls.scanLabReport}</Text>
              <Text style={[styles.ocrSubtitle, { color: colors.muted }]}>
                {ls.scanLabReportSubtitle}
              </Text>
            </View>
            <Pressable
              onPress={handleOcrScan}
              disabled={ocrLoading}
              style={({ pressed }) => [
                styles.ocrButton,
                { backgroundColor: accentColor, opacity: pressed || ocrLoading ? 0.7 : 1 },
              ]}
            >
              {ocrLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 22 }}>{'\uD83D\uDCF7'}</Text>
              }
            </Pressable>
          </View>
          {ocrError && (
            <Text style={[styles.ocrError, { color: colors.error }]}>{ocrError}</Text>
          )}
        </GlassCard>
        {ocrReviewFields.length > 0 && (
          <OcrReviewCard
            title={ocrPageCount > 1 ? `${ls.scanLabReport} · ${ocrPageCount} pages` : ls.scanLabReport}
            fields={ocrReviewFields}
            scanMethod={ocrUsedLlmRef.current ? 'smart' : 'ocr'}
            onConfirm={() => {
              const pending = ocrPendingRef.current;
              ocrPendingRef.current = null;
              if (pending) applyExtracted(pending);
              setOcrAccumulated({});
              setOcrPageCount(0);
            }}
            onRetake={() => {
              ocrPendingRef.current = null;
              setOcrReviewFields([]);
              setOcrAccumulated({});
              setOcrPageCount(0);
              handleOcrScan();
            }}
            onManual={() => {
              ocrPendingRef.current = null;
              setOcrReviewFields([]);
              setOcrAccumulated({});
              setOcrPageCount(0);
            }}
            onScanMore={() => {
              // Keep accumulated state and trigger another scan
              setOcrReviewFields([]);
              handleOcrScan();
            }}
          />
        )}

        {/* Meta: Lab Name + Date */}
        <GlassCard>
          <View style={styles.metaRow}>
            <View style={styles.metaField}>
              <Text style={[styles.metaLabel, { color: colors.muted }]}>{ls.labFacility.toUpperCase()}</Text>
              <TextInput
                style={[styles.metaInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={labName}
                onChangeText={setLabName}
placeholder={ls.facilityPlaceholder}
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
            </View>
            <View style={[styles.metaField, { marginLeft: 12 }]}>
              <Text style={[styles.metaLabel, { color: colors.muted }]}>{ls.collectionDate.toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.metaInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }]}
                  value={collectionDate}
                  onChangeText={setCollectionDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  keyboardType="default"
                  returnKeyType="done"
                />
                <DatePickerIconButton
                  mode="date"
                  value={collectionDate ? new Date(collectionDate + 'T12:00:00') : null}
                  onChange={(d) => setCollectionDate(d.toISOString().split('T')[0])}
                  maximumDate={new Date()}
                />
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Analyte Values */}
        <GlassCard accentColor={accentColor}>
          <View style={styles.analytesHeader}>
            <Text style={[styles.analytesTitle, { color: colors.foreground }]}>
              {selectedPanel === 'CMP' ? ls.panelCmp
                : selectedPanel === 'CBC' ? ls.panelCbc
                : selectedPanel === 'MG' ? ls.panelMg
                : selectedPanel === 'PHOS' ? ls.panelPhos
                : selectedPanel === 'LIPID' ? ls.panelLipid
                : ls.panelA1c}
            </Text>
            <View style={[styles.analytesBadge, { backgroundColor: `${accentColor}20` }]}>
              <Text style={[styles.analytesBadgeText, { color: accentColor }]}>
                {ls.enteredBadge.replace('{filled}', String(filledCount)).replace('{total}', String(analytes.length))}
              </Text>
            </View>
          </View>
          <Text style={[styles.analytesHint, { color: colors.muted }]}>
            {ls.refRangeHighlightHint}
          </Text>
          {analytes.map(analyteId => (
            <AnalyteRow
              key={analyteId}
              analyteId={analyteId}
              value={values[analyteId] ?? ''}
              onChange={val => handleValueChange(analyteId, val)}
            />
          ))}
        </GlassCard>

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: accentColor, opacity: pressed || isSaving ? 0.7 : 1 },
          ]}
        >
          {isSaving
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <IconSymbol name="cross.case.fill" size={18} color="#fff" />
                <Text style={styles.saveButtonText}>{ls.saveLabResult}</Text>
              </>
          }
        </Pressable>
      </ScrollView>

      {/* Lab Scan Analysis Overlay */}
      {labScanOverlayVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0D1117', zIndex: 100 }}>
          {/* Close button — always visible */}
          <Pressable
            onPress={() => setLabScanOverlayVisible(false)}
            style={{ position: 'absolute', top: insets.top + 12, right: 16, zIndex: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            hitSlop={12}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
          </Pressable>
          {labScanImageUri ? (
            <MedicalScanAnalysisOverlay
              type="lab"
              imageUri={labScanImageUri}
              steps={labScanSteps}
              progress={labScanProgress}
              isAnalyzing={ocrLoading}
              error={labScanError}
              onRetry={() => { setLabScanOverlayVisible(false); setTimeout(handleOcrScan, 300); }}
              onUploadNew={() => { setLabScanOverlayVisible(false); setTimeout(handleOcrScan, 300); }}
              onManualEntry={() => setLabScanOverlayVisible(false)}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  headerBackText: { fontSize: 16, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  headerSave: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  headerSaveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  // Glass card
  glassCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    padding: 16,
  },
  glassAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dialCard: { paddingTop: 20 },

  // Dial
  dialContainer: { gap: 8 },
  dialLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  dialScroll: { gap: 8, paddingVertical: 4 },
  dialItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 64,
    gap: 2,
  },
  dialItemAbbr: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dialItemName: { fontSize: 13, fontWeight: '600' },
  dialPanelFull: { fontSize: 13, fontWeight: '500', marginTop: 4, textAlign: 'center' },

  // OCR section
  ocrSection: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ocrTextBlock: { flex: 1, gap: 4 },
  ocrTitle: { fontSize: 15, fontWeight: '600' },
  ocrSubtitle: { fontSize: 12, lineHeight: 17 },
  ocrButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ocrError: { fontSize: 12, marginTop: 8, lineHeight: 16 },

  // Meta fields
  metaRow: { flexDirection: 'row' },
  metaField: { flex: 1 },
  metaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  metaInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },

  // Analytes
  analytesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  analytesTitle: { fontSize: 15, fontWeight: '600' },
  analytesBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  analytesBadgeText: { fontSize: 11, fontWeight: '600' },
  analytesHint: { fontSize: 11, marginBottom: 12, lineHeight: 15 },
  analyteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  analyteLeft: { flex: 1, gap: 2 },
  analyteLabel: { fontSize: 14, fontWeight: '500' },
  analyteRef: { fontSize: 11 },
  analyteRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  analyteInput: {
    width: 80,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  analyteStatus: { fontSize: 14, fontWeight: '700', width: 16, textAlign: 'center' },

  // Save button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
