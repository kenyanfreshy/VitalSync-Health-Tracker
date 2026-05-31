/**
 * MedicalScanAnalysisOverlay
 *
 * Reusable live analysis overlay for Prescription Scan and Lab Scan.
 * Shows the captured image, animated step list, progress bar, and
 * error recovery actions.
 *
 * Usage:
 *   <MedicalScanAnalysisOverlay
 *     type="prescription"           // or "lab"
 *     imageUri={capturedUri}
 *     steps={stepStates}
 *     progress={0..100}
 *     isAnalyzing={true}
 *     error={null}
 *     onRetry={handleRetry}
 *     onUploadNew={handleUploadNew}
 *     onManualEntry={handleManualEntry}
 *   />
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MedicalScanType = 'prescription' | 'lab';
export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface ScanStep {
  id: string;
  label: string;
  status: StepStatus;
}

export interface PartialScanData {
  /** Extracted items to show on error (e.g. medication names or lab test names) */
  extractedItems?: string[];
  /** Count of fields successfully extracted */
  extractedCount?: number;
  /** Total fields expected */
  totalCount?: number;
}

export interface MedicalScanAnalysisOverlayProps {
  type: MedicalScanType;
  imageUri: string;
  steps: ScanStep[];
  progress: number; // 0–100
  isAnalyzing: boolean;
  error: string | null;
  /** Partial data extracted before failure — used to show what was found and pre-populate manual entry */
  partialData?: PartialScanData;
  onRetry: () => void;
  onUploadNew: () => void;
  onManualEntry: () => void;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0D1117',
  surface: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.10)',
  text: '#ECEDEE',
  muted: '#9BA1A6',
  prescription: '#7C3AED', // violet
  lab: '#059669',           // emerald
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
};

// ─── Spinner ──────────────────────────────────────────────────────────────────

function SpinnerRing({ color }: { color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [rotation, pulse]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.spinnerOuter, { transform: [{ scale: pulse }] }]}>
      <Animated.View
        style={[
          styles.spinnerRing,
          { borderTopColor: color, transform: [{ rotate: spin }] },
        ]}
      />
    </Animated.View>
  );
}

// ─── Step Row ─────────────────────────────────────────────────────────────────

function StepRow({ step, accentColor }: { step: ScanStep; accentColor: string }) {
  const fadeAnim = useRef(new Animated.Value(step.status === 'pending' ? 0.4 : 1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: step.status === 'pending' ? 0.4 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [step.status, fadeAnim]);

  const icon =
    step.status === 'done'   ? '✓' :
    step.status === 'active' ? '⏳' :
    step.status === 'error'  ? '✗' : '○';

  const iconColor =
    step.status === 'done'   ? COLORS.success :
    step.status === 'active' ? accentColor :
    step.status === 'error'  ? COLORS.error :
    COLORS.muted;

  return (
    <Animated.View style={[styles.stepRow, { opacity: fadeAnim }]}>
      <Text style={[styles.stepIcon, { color: iconColor }]}>{icon}</Text>
      <Text style={[styles.stepLabel, { color: step.status === 'active' ? COLORS.text : COLORS.muted }]}>
        {step.label}
      </Text>
    </Animated.View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, widthAnim]);

  const widthPct = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width: widthPct, backgroundColor: color }]} />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MedicalScanAnalysisOverlay({
  type,
  imageUri,
  steps,
  progress,
  isAnalyzing,
  error,
  partialData,
  onRetry,
  onUploadNew,
  onManualEntry,
}: MedicalScanAnalysisOverlayProps) {
  const accentColor = type === 'prescription' ? COLORS.prescription : COLORS.lab;
  const title = type === 'prescription' ? 'Analyzing Prescription' : 'Analyzing Lab Report';

  return (
    <View style={styles.container}>
      {/* Image preview */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        <View style={styles.imageDimOverlay} />
        {isAnalyzing && (
          <View style={styles.spinnerOverlay}>
            <SpinnerRing color={accentColor} />
          </View>
        )}
      </View>

      {/* Analysis card */}
      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={[styles.title, { color: accentColor }]}>{title}</Text>

        {/* Progress bar */}
        <ProgressBar progress={progress} color={accentColor} />
        <Text style={styles.progressLabel}>{Math.round(progress)}%</Text>

        {/* Step list */}
        <View style={styles.stepList}>
          {steps.map(step => (
            <StepRow key={step.id} step={step} accentColor={accentColor} />
          ))}
        </View>

        {/* Error recovery */}
        {error && !isAnalyzing && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Scan incomplete</Text>

            {/* Show what was successfully extracted */}
            {partialData && (partialData.extractedCount ?? 0) > 0 ? (
              <View style={styles.partialResultBox}>
                <Text style={styles.partialResultTitle}>
                  {partialData.extractedCount} of {partialData.totalCount ?? '?'} fields extracted
                </Text>
                {(partialData.extractedItems ?? []).slice(0, 5).map((item, i) => (
                  <View key={i} style={styles.partialResultRow}>
                    <Text style={[styles.stepIcon, { color: COLORS.success }]}>✓</Text>
                    <Text style={styles.partialResultItem}>{item}</Text>
                  </View>
                ))}
                {(partialData.extractedItems?.length ?? 0) > 5 && (
                  <Text style={styles.partialResultMore}>
                    +{(partialData.extractedItems?.length ?? 0) - 5} more extracted
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.errorDetail}>{error}</Text>
            )}

            <Text style={styles.manualEntryHint}>
              Tap "Manual Entry" to review and complete the extracted data.
            </Text>

            <View style={styles.recoveryButtons}>
              <TouchableOpacity style={[styles.recoveryBtn, { borderColor: accentColor }]} onPress={onRetry}>
                <Text style={[styles.recoveryBtnText, { color: accentColor }]}>Retry Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.recoveryBtn, { borderColor: COLORS.muted }]} onPress={onUploadNew}>
                <Text style={[styles.recoveryBtnText, { color: COLORS.muted }]}>Upload New Image</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.recoveryBtn, { borderColor: accentColor, backgroundColor: accentColor + '18' }]}
                onPress={onManualEntry}
              >
                <Text style={[styles.recoveryBtnText, { color: accentColor }]}>
                  {(partialData?.extractedCount ?? 0) > 0 ? 'Complete with Manual Entry' : 'Manual Entry'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  imageContainer: {
    height: 220,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerOuter: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopColor: '#7C3AED',
  },
  cardScroll: {
    flex: 1,
  },
  cardContent: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  stepList: {
    gap: 10,
    marginTop: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepIcon: {
    fontSize: 14,
    width: 18,
    textAlign: 'center',
  },
  stepLabel: {
    fontSize: 14,
    flex: 1,
  },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.error,
  },
  errorDetail: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  partialResultBox: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.20)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  partialResultTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
    marginBottom: 4,
  },
  partialResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partialResultItem: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  partialResultMore: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  manualEntryHint: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  recoveryButtons: {
    gap: 8,
    marginTop: 4,
  },
  recoveryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  recoveryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
