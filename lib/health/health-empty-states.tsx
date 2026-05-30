/**
 * health-empty-states.tsx
 *
 * Null-safe, reusable empty-state components for health data types that may
 * legitimately be absent (blood pressure, glucose, sleep).
 *
 * Design principles:
 *   - Never crash or display zero/placeholder values when data is unavailable.
 *   - Show a clean, informative empty state with a contextual icon and message.
 *   - Provide an optional action button (e.g. "Log reading" or "Sync from Health").
 *   - All components are theme-aware (light/dark) via useColors().
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useDashboardStrings } from '@/hooks/use-dashboard-strings';

// ─── Shared base ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function HealthEmptyState({
  icon = '—',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 32, lineHeight: 40 }}>{icon}</Text>
      <Text
        style={{
          fontSize: 15,
          fontWeight: '600',
          color: colors.foreground,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            textAlign: 'center',
            lineHeight: 18,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={{
            marginTop: 4,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: colors.primary,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Blood Pressure ───────────────────────────────────────────────────────────

interface BPEmptyStateProps {
  onLog?: () => void;
  onSync?: () => void;
}

export function BloodPressureEmptyState({ onLog, onSync }: BPEmptyStateProps) {
  const d = useDashboardStrings();
  return (
    <HealthEmptyState
      icon="🩺"
      title={d.noBPData ?? 'No Blood Pressure Data'}
      subtitle={d.noBPDataSub ?? 'Log a reading manually or sync from Apple Health / Health Connect to see your BP trend.'}
      actionLabel={onLog ? (d.logReading ?? 'Log Reading') : onSync ? (d.syncFromHealth ?? 'Sync from Health') : undefined}
      onAction={onLog ?? onSync}
    />
  );
}

// ─── Blood Glucose ────────────────────────────────────────────────────────────

interface GlucoseEmptyStateProps {
  onLog?: () => void;
  onSync?: () => void;
  /** 'dashboard' shows a compact 24-h message; 'trend' shows the full message */
  variant?: 'dashboard' | 'trend';
}

export function GlucoseEmptyState({
  onLog,
  onSync,
  variant = 'dashboard',
}: GlucoseEmptyStateProps) {
  const d = useDashboardStrings();
  const title = d.noGlucoseData ?? 'No Glucose Data';
  const subtitle =
    variant === 'dashboard'
      ? (d.noGlucoseDataSub ?? 'No glucose readings in the last 24 hours. Log a reading or sync your CGM / glucometer.')
      : 'No glucose data available for this period. Sync from Apple Health or log readings manually.';
  return (
    <HealthEmptyState
      icon="🩸"
      title={title}
      subtitle={subtitle}
      actionLabel={onLog ? 'Log Reading' : onSync ? 'Sync from Health' : undefined}
      onAction={onLog ?? onSync}
    />
  );
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

interface SleepEmptyStateProps {
  onSync?: () => void;
}

export function SleepEmptyState({ onSync }: SleepEmptyStateProps) {
  const d = useDashboardStrings();
  return (
    <HealthEmptyState
      icon="😴"
      title={d.noSleepData ?? 'No Sleep Data'}
      subtitle={d.noSleepDataSub ?? 'Sleep data is imported automatically from Apple Health or Health Connect after your next sleep session.'}
      actionLabel={onSync ? (d.syncFromHealth ?? 'Sync from Health') : undefined}
      onAction={onSync}
    />
  );
}

// ─── Utility: safe value display ─────────────────────────────────────────────

/**
 * Returns a formatted display string for a nullable numeric health value.
 * Shows "—" instead of "0", "null", or "undefined" so the UI never
 * displays misleading zeros.
 *
 * @example
 *   safeHealthValue(120)       → "120"
 *   safeHealthValue(null)      → "—"
 *   safeHealthValue(undefined) → "—"
 *   safeHealthValue(0)         → "—"   (zero is treated as missing for vitals)
 */
export function safeHealthValue(
  value: number | null | undefined,
  unit?: string,
  decimals = 0,
): string {
  if (value == null || !isFinite(value) || value === 0) return '—';
  const formatted = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Returns a formatted BP string like "120/80 mmHg" or "—" when either
 * systolic or diastolic is missing.
 */
export function safeBPValue(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): string {
  if (systolic == null || diastolic == null || systolic === 0 || diastolic === 0) return '—';
  return `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`;
}
