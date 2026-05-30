/**
 * AiScribeSheet — Reusable Smart Scribe component
 *
 * Flow:
 *  1. User taps the trigger button → camera opens
 *  2. Photo taken → sent to Smart Scribe endpoint
 *  3. Preview bottom sheet appears with all extracted fields (editable)
 *  4. User taps "Accept" → onAccept(fields) called
 *  5. User can tap "Retry" to re-take the photo, or "Cancel" to dismiss
 *
 * Usage:
 * ```tsx
 * <AiScribeSheet
 *   visible={showScribe}
 *   onClose={() => setShowScribe(false)}
 *   title="Medication Scribe"
 *   subtitle="Point camera at your prescription label or bottle"
 *   fields={[
 *     { key: 'name', label: 'Medication Name', placeholder: 'e.g. Metformin' },
 *     { key: 'dose', label: 'Dose', placeholder: 'e.g. 500 mg' },
 *   ]}
 *   onCapture={async (base64, mimeType) => {
 *     const result = await trpc.scribe.medication.mutateAsync({ imageBase64: base64, mimeType });
 *     return result; // Record<string, string>
 *   }}
 *   onAccept={(fields) => {
 *     setForm(prev => ({ ...prev, ...fields }));
 *   }}
 * />
 * ```
 */
import React, { useState, useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
} from 'react-native';
import * as ImagePicker from '@/lib/safe-image-picker';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';

export interface ScribeField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

interface AiScribeSheetProps {
  /** Whether the scribe sheet is visible */
  visible: boolean;
  /** Called when the sheet is dismissed without accepting */
  onClose: () => void;
  /** Title shown at the top of the sheet */
  title: string;
  /** Subtitle / instruction shown below the title */
  subtitle?: string;
  /** Field definitions for the preview form */
  fields: ScribeField[];
  /**
   * Called with the captured image base64 + mimeType.
   * Should call the Smart Scribe endpoint and return extracted fields as Record<string, string>.
   * Throw to indicate failure.
   */
  onCapture: (base64: string, mimeType: string) => Promise<Record<string, string>>;
  /**
   * Called when the user accepts the extracted (and optionally edited) fields.
   */
  onAccept: (fields: Record<string, string>) => void;
  /** Accent color for the sheet header and buttons */
  accentColor?: string;
}

type Phase = 'idle' | 'capturing' | 'processing' | 'preview' | 'error';

export function AiScribeSheet({
  visible,
  onClose,
  title,
  subtitle,
  fields,
  onCapture,
  onAccept,
  accentColor,
}: AiScribeSheetProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [capturedMime, setCapturedMime] = useState<string>('image/jpeg');

  const _slideAnim = useRef(new Animated.Value(0)).current;

  const reset = useCallback(() => {
    Speech.stop();
    setPhase('idle');
    setErrorMsg('');
    setPreviewValues({});
    setCapturedUri(null);
    setCapturedBase64(null);
    setIsSpeaking(false);
  }, []);

  /** Reads back extracted fields so user can verify before accepting (Confirmation Loop) */
  const handleReadBack = useCallback(() => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    const lines = fields
      .filter(f => previewValues[f.key]?.trim())
      .map(f => `${f.label}: ${previewValues[f.key]}`);
    if (!lines.length) return;
    const utterance = `Verification. I extracted the following values. ${lines.join('. ')}. Please review and confirm.`;
    setIsSpeaking(true);
    Speech.speak(utterance, {
      language: 'en-US',
      rate: 0.92,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  }, [fields, previewValues, isSpeaking]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const launchCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPhase('error');
        setErrorMsg('Camera access is required. Please enable it in Settings.');
        return;
      }
      setPhase('capturing');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.9,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets || !result.assets[0]) {
        setPhase('idle');
        return;
      }
      const asset = result.assets[0];
      const base64 = asset.base64 ?? '';
      const mime = asset.mimeType ?? 'image/jpeg';
      setCapturedUri(asset.uri);
      setCapturedBase64(base64);
      setCapturedMime(mime);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Process
      setPhase('processing');
      const extracted = await onCapture(base64, mime);
      // Build preview values — only include fields that are defined
      const preview: Record<string, string> = {};
      for (const f of fields) {
        const val = extracted[f.key];
        preview[f.key] = typeof val === 'string' ? val : '';
      }
      setPreviewValues(preview);
      setPhase('preview');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_err) {
      setPhase('error');
      setErrorMsg('Smart Scribe could not extract values from this image. Please try again with better lighting or a clearer photo.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [fields, onCapture]);

  const handleAccept = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAccept(previewValues);
    reset();
    onClose();
  }, [previewValues, onAccept, reset, onClose]);

  const handleRetry = useCallback(() => {
    reset();
    launchCamera();
  }, [reset, launchCamera]);

  const s = styles(colors, accent);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={[s.headerAccent, { backgroundColor: accent + '22' }]}>
            <IconSymbol name="doc.viewfinder.fill" size={22} color={accent} />
          </View>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>{title}</Text>
            {subtitle ? <Text style={s.headerSubtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={handleClose} style={s.closeBtn}>
            <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Idle: Prompt to take photo ── */}
          {phase === 'idle' && (
            <View style={s.centerBlock}>
              <View style={[s.cameraIconWrap, { backgroundColor: accent + '18', borderColor: accent + '44' }]}>
                <Text style={{ fontSize: 48 }}>📷</Text>
              </View>
              <Text style={s.idleTitle}>📷 Vision Scan</Text>
              <Text style={s.idleSubtitle}>
                Take a photo of the document and the Smart Scribe will extract all fields automatically. You can review and edit before accepting.
              </Text>
              <Pressable
                onPress={launchCamera}
                style={({ pressed }) => [s.primaryBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: 18 }}>📷</Text>
                <Text style={s.primaryBtnText}>Vision Scan</Text>
              </Pressable>
            </View>
          )}

          {/* ── Capturing: waiting for camera ── */}
          {phase === 'capturing' && (
            <View style={s.centerBlock}>
              <ActivityIndicator size="large" color={accent} />
              <Text style={s.processingText}>Opening camera…</Text>
            </View>
          )}

          {/* ── Processing: Smart Scribe is working ── */}
          {phase === 'processing' && (
            <View style={s.centerBlock}>
              {capturedUri ? (
                <Image source={{ uri: capturedUri }} style={s.previewThumb} resizeMode="cover" />
              ) : null}
              <View style={s.processingRow}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={[s.processingText, { marginLeft: 8 }]}>Smart Scribe is reading the document…</Text>
              </View>
              <Text style={s.processingHint}>This usually takes 3–8 seconds</Text>
            </View>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <View style={s.centerBlock}>
              <View style={[s.errorIconWrap, { backgroundColor: colors.error + '18' }]}>
                <IconSymbol name="exclamationmark.triangle.fill" size={40} color={colors.error} />
              </View>
              <Text style={[s.errorTitle, { color: colors.error }]}>Extraction Failed</Text>
              <Text style={s.errorMsg}>{errorMsg}</Text>
              <Pressable
                onPress={launchCamera}
                style={({ pressed }) => [s.primaryBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: 18 }}>📷</Text>
                <Text style={s.primaryBtnText}>Vision Scan Again</Text>
              </Pressable>
            </View>
          )}

          {/* ── Preview: show extracted fields ── */}
          {phase === 'preview' && (
            <View style={s.previewBlock}>
              {/* Thumbnail */}
              {capturedUri ? (
                <View style={s.thumbRow}>
                  <Image source={{ uri: capturedUri }} style={s.previewThumb} resizeMode="cover" />
                  <View style={s.thumbMeta}>
                    <Text style={[s.thumbLabel, { color: colors.muted }]}>Captured Image</Text>
                    <Text style={[s.thumbHint, { color: colors.muted }]}>
                      Review and edit the extracted values below before accepting.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Extracted fields */}
              <View style={[s.fieldsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s.fieldsHeader}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
                  <Text style={[s.fieldsHeaderText, { color: colors.success }]}>
                    Smart extracted {Object.values(previewValues).filter(v => v.trim()).length} of {fields.length} fields
                  </Text>
                </View>
                {fields.map((field, idx) => (
                  <View key={field.key} style={[s.fieldRow, idx > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
                    <Text style={[s.fieldLabel, { color: colors.muted }]}>{field.label.toUpperCase()}</Text>
                    <TextInput
                      style={[s.fieldInput, { color: colors.foreground }]}
                      value={previewValues[field.key] ?? ''}
                      onChangeText={v => setPreviewValues(prev => ({ ...prev, [field.key]: v }))}
                      placeholder={field.placeholder ?? '—'}
                      placeholderTextColor={colors.muted}
                      multiline={field.multiline}
                      numberOfLines={field.multiline ? 3 : 1}
                    />
                    {!previewValues[field.key]?.trim() && (
                      <Text style={[s.fieldMissing, { color: colors.warning }]}>Not detected</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* Confirmation Loop — Read Back button */}
              <Pressable
                onPress={handleReadBack}
                style={({ pressed }) => [
                  s.secondaryBtn,
                  { borderColor: isSpeaking ? colors.warning : accent, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <IconSymbol
                  name={isSpeaking ? 'speaker.wave.2.fill' : 'speaker.wave.2'}
                  size={16}
                  color={isSpeaking ? colors.warning : accent}
                />
                <Text style={[s.secondaryBtnText, { color: isSpeaking ? colors.warning : accent }]}>
                  {isSpeaking ? 'Tap to Stop Readback' : '🔊 Read Back for Verification'}
                </Text>
              </Pressable>

              {/* Accept button */}
              <Pressable
                onPress={handleAccept}
                style={({ pressed }) => [s.primaryBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <IconSymbol name="checkmark" size={18} color="#fff" />
                <Text style={s.primaryBtnText}>Accept & Fill Form</Text>
              </Pressable>
              <Pressable
                onPress={handleRetry}
                style={({ pressed }) => [s.secondaryBtn, { borderColor: accent, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 16 }}>📷</Text>
                <Text style={[s.secondaryBtnText, { color: accent }]}>New Vision Scan</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Trigger button (small, inline) ──────────────────────────────────────────
interface AiScribeTriggerProps {
  onPress: () => void;
  label?: string;
  sublabel?: string;
  accentColor?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Optional colors override — if omitted, uses useColors() */
  colors?: ReturnType<typeof useColors>;
}

export function AiScribeTrigger({
  onPress,
  label = '🍎 Scribe',
  sublabel,
  accentColor,
  loading = false,
  disabled = false,
}: AiScribeTriggerProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;
  const s = triggerStyles(colors, accent);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.75 }]}
    >
      {loading
        ? <ActivityIndicator size="small" color={accent} />
        : <IconSymbol name="doc.viewfinder.fill" size={20} color={accent} />
      }
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{loading ? 'Processing…' : label}</Text>
        {sublabel ? <Text style={[s.label, { fontSize: 11, fontWeight: '400', opacity: 0.7, marginTop: 1 }]}>{sublabel}</Text> : null}
      </View>
      {!loading && <IconSymbol name="chevron.right" size={14} color={accent} />}
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = (c: ReturnType<typeof useColors>, _accent: string) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: c.border,
  },
  headerAccent: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.foreground },
  headerSubtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },

  // Idle
  centerBlock: { alignItems: 'center', paddingTop: 32, gap: 16 },
  cameraIconWrap: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  idleTitle: { fontSize: 20, fontWeight: '700', color: c.foreground, textAlign: 'center' },
  idleSubtitle: { fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 20, maxWidth: 300 },

  // Processing
  processingRow: { flexDirection: 'row', alignItems: 'center' },
  processingText: { fontSize: 15, color: c.foreground, fontWeight: '600' },
  processingHint: { fontSize: 12, color: c.muted },

  // Error
  errorIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorMsg: { fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 20, maxWidth: 300 },

  // Preview
  previewBlock: { gap: 16 },
  thumbRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  previewThumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: c.surface },
  thumbMeta: { flex: 1 },
  thumbLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  thumbHint: { fontSize: 13, marginTop: 4, lineHeight: 18 },

  fieldsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  fieldsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: c.success + '10',
  },
  fieldsHeaderText: { fontSize: 13, fontWeight: '600' },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 4 },
  fieldInput: { fontSize: 15, fontWeight: '500', minHeight: 22 },
  fieldMissing: { fontSize: 11, marginTop: 2 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 14,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
});

const triggerStyles = (c: ReturnType<typeof useColors>, accent: string) => StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1,
    borderColor: accent + '55',
    backgroundColor: accent + '12',
  },
  label: { fontSize: 13, fontWeight: '600', color: accent },
});
