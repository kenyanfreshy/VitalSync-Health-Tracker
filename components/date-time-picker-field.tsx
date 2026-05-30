/**
 * DateTimePickerField — Shared calendar + time picker for all Record screens.
 *
 * iOS:   Native spinner wheel via @react-native-community/datetimepicker.
 *        Two-step: first pick date (calendar), then pick time (spinner).
 *        When `inlineMode` is true (for use inside Modals), the picker renders
 *        inline in the component tree instead of a nested Modal sheet.
 * Android: Same native picker (inline calendar + clock dialog).
 * Web:   Plain date + time text inputs as fallback.
 *
 * Usage (required):
 * ```tsx
 * <DateTimePickerField label="Date" value={date} onChange={setDate} mode="date" />
 * ```
 *
 * Usage inside a Modal (avoids nested Modal issue on iOS):
 * ```tsx
 * <DateTimePickerField label="Date" value={date} onChange={setDate} mode="datetime" inlineMode />
 * ```
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme, useColors } from '@/hooks';
import { useLang } from '@/hooks';

// Lazy-load native module — never loaded on web
let RNDateTimePicker: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
   
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNDateTimePicker = require('@react-native-community/datetimepicker').default;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDisplayTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDisplayDateTime(d: Date): string {
  return `${formatDisplayDate(d)}  ·  ${formatDisplayTime(d)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DateTimePickerFieldProps {
  label: string;
  /**
   * The selected date. When `optional` is true, may be null/undefined (blank state).
   * Non-optional fields should always pass a valid Date.
   */
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
  /** "date" shows only calendar, "time" shows only clock, "datetime" shows both (default) */
  mode?: 'date' | 'time' | 'datetime';
  /** Optional error message shown below the field */
  error?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Minimum selectable date */
  minimumDate?: Date;
  /** Maximum selectable date */
  maximumDate?: Date;
  /**
   * When true, the field starts blank (no date pre-filled).
   * Shows a dashed "Tap to set" placeholder and a clear (✕) button when a date is set.
   */
  optional?: boolean;
  /**
   * When true, the picker renders inline (no nested Modal) — required when this
   * component is used inside a Modal to avoid the iOS nested-Modal black screen bug.
   */
  inlineMode?: boolean;
  /** When true, shows a "Today" chip for quick selection */
  showTodayChip?: boolean;
  /** When true, automatically dismisses the picker after selection */
  autoDismiss?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DateTimePickerField({
  label,
  value,
  onChange,
  mode = 'datetime',
  error,
  disabled = false,
  minimumDate,
  maximumDate,
  optional = false,
  inlineMode = false,
}: DateTimePickerFieldProps) {
  const colors = useColors();
  const _dtLang = useLang();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Resolve a safe Date for the native picker (falls back to now if blank)
  const safeValue: Date = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();

  // iOS two-step: date first, then time
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Temporary value while picker is open (committed on Done)
  const [tempDate, setTempDate] = useState(safeValue);

  // ── Android: single-step native pickers ────────────────────────────────────
  const [androidStep, setAndroidStep] = useState<'idle' | 'date' | 'time'>('idle');

  function openPicker() {
    if (disabled) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempDate(safeValue);
    if (Platform.OS === 'ios') {
      if (mode === 'time') {
        setShowTimePicker(true);
      } else {
        setShowDatePicker(true);
      }
    } else if (Platform.OS === 'android') {
      if (mode === 'time') {
        setAndroidStep('time');
      } else {
        setAndroidStep('date');
      }
    }
  }

  function handleAndroidChange(_: any, picked?: Date) {
    if (!picked) {
      setAndroidStep('idle');
      return;
    }
    if (androidStep === 'date') {
      setTempDate(picked);
      if (mode === 'datetime') {
        setAndroidStep('time');
      } else {
        onChange(picked);
        setAndroidStep('idle');
      }
    } else if (androidStep === 'time') {
      // Merge the time into the previously picked date
      const merged = new Date(tempDate);
      merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      onChange(merged);
      setAndroidStep('idle');
    }
  }

  // ── Display label ───────────────────────────────────────────────────────────
  function getDisplayText(): string {
    if (!value) return '';
    if (mode === 'date') return formatDisplayDate(safeValue);
    if (mode === 'time') return formatDisplayTime(safeValue);
    return formatDisplayDateTime(safeValue);
  }

  const displayText = getDisplayText();
  const hasError = !!error;
  const hasValue = !!value;

  // ── Web fallback ────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <WebFallback
        label={label}
        value={value ?? null}
        onChange={onChange}
        mode={mode}
        error={error}
        disabled={disabled}
        optional={optional}
        colors={colors}
        isDark={isDark}
      />
    );
  }

  // ── Android native pickers (rendered inline when step is active) ────────────
  if (Platform.OS === 'android' && androidStep !== 'idle' && RNDateTimePicker) {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        <RNDateTimePicker
          value={androidStep === 'time' ? tempDate : safeValue}
          mode={androidStep}
          display={androidStep === 'date' ? 'calendar' : 'clock'}
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
        {hasError && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}
      </View>
    );
  }

  // ── Inline mode: renders picker directly in component tree (no nested Modal) ─
  if (inlineMode && Platform.OS === 'ios' && RNDateTimePicker) {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>

        {/* Tappable pill */}
        <View style={styles.pillRow}>
          <Pressable
            style={({ pressed }) => [
              styles.pill,
              optional && !hasValue && styles.pillBlank,
              {
                backgroundColor: isDark ? colors.surface : '#F8FAFC',
                borderColor: hasError
                  ? colors.error
                  : showDatePicker || showTimePicker
                  ? colors.primary
                  : colors.border,
                opacity: pressed || disabled ? 0.7 : 1,
                flex: 1,
              },
            ]}
            onPress={openPicker}
            disabled={disabled || showDatePicker || showTimePicker}
          >
            <IconSymbol
              name={mode === 'time' ? 'clock' : 'calendar'}
              size={15}
              color={hasValue ? (hasError ? colors.error : colors.primary) : colors.muted}
            />
            {hasValue ? (
              <Text style={[styles.pillText, { color: colors.foreground }]} numberOfLines={1}>
                {displayText}
              </Text>
            ) : (
              <Text style={[styles.pillText, { color: colors.muted, fontStyle: 'italic' }]} numberOfLines={1}>
                Tap to set
              </Text>
            )}
            {(!optional || !hasValue) && !showDatePicker && !showTimePicker && (
              <IconSymbol name="chevron.down" size={12} color={colors.muted} />
            )}
          </Pressable>
          {optional && hasValue && !showDatePicker && !showTimePicker && (
            <Pressable
              style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.5 : 1 }]}
              onPress={() => onChange(null)}
            >
              <Text style={[styles.clearBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          )}
        </View>

        {hasError && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

        {/* Inline date picker panel */}
        {showDatePicker && (
          <View style={[styles.inlinePanel, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
            {/* Toolbar */}
            <View style={[styles.inlineToolbar, { borderBottomColor: isDark ? '#38383A' : '#C6C6C8' }]}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.inlineToolbarBtn}>
                <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.toolbarTitle, { color: isDark ? '#EBEBF5' : '#1C1C1E' }]}>
                {mode === 'datetime' ? 'Select Date' : label}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDatePicker(false);
                  if (mode === 'datetime') {
                    setShowTimePicker(true);
                  } else {
                    onChange(tempDate);
                  }
                }}
                style={styles.inlineToolbarBtn}
              >
                <Text style={[styles.doneText, { color: colors.primary }]}>
                  {mode === 'datetime' ? 'Next →' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
            <RNDateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              style={styles.inlinePicker}
              textColor={isDark ? '#FFFFFF' : '#000000'}
              accentColor={colors.primary}
            />
          </View>
        )}

        {/* Inline time picker panel */}
        {showTimePicker && (
          <View style={[styles.inlinePanel, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
            {/* Toolbar */}
            <View style={[styles.inlineToolbar, { borderBottomColor: isDark ? '#38383A' : '#C6C6C8' }]}>
              <TouchableOpacity
                onPress={() => {
                  setShowTimePicker(false);
                  if (mode === 'datetime') onChange(tempDate);
                }}
                style={styles.inlineToolbarBtn}
              >
                <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.toolbarTitle, { color: isDark ? '#EBEBF5' : '#1C1C1E' }]}>
                {mode === 'datetime' ? 'Select Time' : label}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowTimePicker(false);
                  onChange(tempDate);
                }}
                style={styles.inlineToolbarBtn}
              >
                <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <RNDateTimePicker
              value={tempDate}
              mode="time"
              display="spinner"
              onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
              style={styles.spinnerPicker}
              textColor={isDark ? '#FFFFFF' : '#000000'}
            />
          </View>
        )}
      </View>
    );
  }

  // ── iOS + Android (idle state): tappable display pill with Modal sheets ──────
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>

      <View style={styles.pillRow}>
        {/* Tappable pill */}
        <Pressable
          style={({ pressed }) => [
            styles.pill,
            optional && !hasValue && styles.pillBlank,
            {
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              borderColor: hasError
                ? colors.error
                : showDatePicker || showTimePicker
                ? colors.primary
                : colors.border,
              opacity: pressed || disabled ? 0.7 : 1,
              flex: 1,
            },
          ]}
          onPress={openPicker}
          disabled={disabled}
          accessibilityLabel={
            hasValue
              ? `${label}: ${displayText}. Tap to change.`
              : `${label}: not set. Tap to set.`
          }
          accessibilityRole="button"
        >
          <IconSymbol
            name={mode === 'time' ? 'clock' : 'calendar'}
            size={15}
            color={hasValue ? (hasError ? colors.error : colors.primary) : colors.muted}
          />
          {hasValue ? (
            <Text style={[styles.pillText, { color: colors.foreground }]} numberOfLines={1}>
              {displayText}
            </Text>
          ) : (
            <Text
              style={[styles.pillText, { color: colors.muted, fontStyle: 'italic' }]}
              numberOfLines={1}
            >
              Tap to set
            </Text>
          )}
          {(!optional || !hasValue) && (
            <IconSymbol name="chevron.down" size={12} color={colors.muted} />
          )}
        </Pressable>

        {/* Clear button — only shown in optional mode when a value is set */}
        {optional && hasValue && (
          <Pressable
            style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.5 : 1 }]}
            onPress={() => onChange(null)}
            accessibilityLabel={`Clear ${label}`}
            accessibilityRole="button"
          >
            <Text style={[styles.clearBtnText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        )}
      </View>

      {hasError && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

      {/* ── iOS Date picker sheet ─────────────────────────────────────────── */}
      {RNDateTimePicker && (
        <PickerSheet
          visible={showDatePicker}
          title={mode === 'datetime' ? 'Select Date' : label}
          isDark={isDark}
          colors={colors}
          onClose={() => setShowDatePicker(false)}
          onDone={() => {
            setShowDatePicker(false);
            if (mode === 'datetime') {
              // Proceed to time step
              setShowTimePicker(true);
            } else {
              onChange(tempDate);
            }
          }}
          doneLabel={mode === 'datetime' ? 'Next' : (_dtLang === 'es' ? 'Listo' : _dtLang === 'fr' ? 'Terminé' : _dtLang === 'de' ? 'Fertig' : _dtLang === 'pt' ? 'Concluído' : _dtLang === 'zh' ? '完成' : _dtLang === 'ar' ? 'تم' : _dtLang === 'ja' ? '完了' : _dtLang === 'ko' ? '완료' : _dtLang === 'it' ? 'Fatto' : _dtLang === 'ru' ? 'Готово' : _dtLang === 'pl' ? 'Gotowe' : _dtLang === 'nl' ? 'Klaar' : _dtLang === 'tr' ? 'Tamam' : _dtLang === 'sv' ? 'Klar' : _dtLang === 'no' ? 'Ferdig' : _dtLang === 'hi' ? 'हो गया' : _dtLang === 'he' ? 'בוצע' : _dtLang === 'uk' ? 'Готово' : _dtLang === 'hy' ? 'Կատарված' : 'Done')}
        >
          <RNDateTimePicker
            value={tempDate}
            mode="date"
            display="inline"
            onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            style={styles.inlinePicker}
            textColor={isDark ? '#FFFFFF' : '#000000'}
            accentColor={colors.primary}
          />
        </PickerSheet>
      )}

      {/* ── iOS Time picker sheet ─────────────────────────────────────────── */}
      {RNDateTimePicker && (
        <PickerSheet
          visible={showTimePicker}
          title={mode === 'datetime' ? 'Select Time' : label}
          isDark={isDark}
          colors={colors}
          onClose={() => {
            setShowTimePicker(false);
            // If datetime mode and user dismisses time, still commit the date
            if (mode === 'datetime') onChange(tempDate);
          }}
          onDone={() => {
            setShowTimePicker(false);
            onChange(tempDate);
          }}
          doneLabel={(_dtLang === 'es' ? 'Listo' : _dtLang === 'fr' ? 'Terminé' : _dtLang === 'de' ? 'Fertig' : _dtLang === 'pt' ? 'Concluído' : _dtLang === 'zh' ? '完成' : _dtLang === 'ar' ? 'تم' : _dtLang === 'ja' ? '完了' : _dtLang === 'ko' ? '완료' : _dtLang === 'it' ? 'Fatto' : _dtLang === 'ru' ? 'Готово' : _dtLang === 'pl' ? 'Gotowe' : _dtLang === 'nl' ? 'Klaar' : _dtLang === 'tr' ? 'Tamam' : _dtLang === 'sv' ? 'Klar' : _dtLang === 'no' ? 'Ferdig' : _dtLang === 'hi' ? 'हो गया' : _dtLang === 'he' ? 'בוצע' : _dtLang === 'uk' ? 'Готово' : _dtLang === 'hy' ? 'Կատарված' : 'Done')}
        >
          <RNDateTimePicker
            value={tempDate}
            mode="time"
            display="spinner"
            onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
            style={styles.spinnerPicker}
            textColor={isDark ? '#FFFFFF' : '#000000'}
          />
        </PickerSheet>
      )}
    </View>
  );
}

// ─── PickerSheet ─────────────────────────────────────────────────────────────

function PickerSheet({
  visible,
  title,
  isDark,
  colors,
  onClose,
  onDone,
  doneLabel,
  children,
}: {
  visible: boolean;
  title: string;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onDone: () => void;
  doneLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Dim overlay — tap to dismiss */}
      <Pressable style={styles.overlay} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: isDark ? '#48484A' : '#C7C7CC' }]} />

        {/* Toolbar */}
        <View style={[styles.toolbar, { borderBottomColor: isDark ? '#38383A' : '#C6C6C8' }]}>
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>

          <Text style={[styles.toolbarTitle, { color: isDark ? '#EBEBF5' : '#1C1C1E' }]}>
            {title}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDone();
            }}
          >
            <Text style={[styles.doneText, { color: colors.primary }]}>{doneLabel}</Text>
          </Pressable>
        </View>

        {children}
      </View>
    </Modal>
  );
}

// ─── Web Fallback ─────────────────────────────────────────────────────────────

function WebFallback({
  label,
  value,
  onChange,
  mode,
  error,
  disabled,
  optional,
  colors,
  isDark,
}: {
  label: string;
  value: Date | null | undefined;
  onChange: (d: Date | null) => void;
  mode: 'date' | 'time' | 'datetime';
  error?: string;
  disabled?: boolean;
  optional?: boolean;
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
}) {
  const safeVal = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();
  const dateStr = value ? `${safeVal.getFullYear()}-${pad(safeVal.getMonth() + 1)}-${pad(safeVal.getDate())}` : '';
  const timeStr = value ? `${pad(safeVal.getHours())}:${pad(safeVal.getMinutes())}` : '';

  function handleDateChange(v: string) {
    const parts = v.split('-');
    if (parts.length !== 3) return;
    const d = new Date(safeVal);
    d.setFullYear(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (!isNaN(d.getTime())) onChange(d);
  }

  function handleTimeChange(v: string) {
    const parts = v.split(':');
    if (parts.length !== 2) return;
    const d = new Date(safeVal);
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    if (!isNaN(d.getTime())) onChange(d);
  }

  const inputStyle = [
    styles.webInput,
    {
      backgroundColor: isDark ? colors.surface : '#F8FAFC',
      borderColor: error ? colors.error : colors.border,
      color: colors.foreground,
    },
  ];

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <View style={styles.webRow}>
        {mode !== 'time' && (
          <TextInput
            style={[inputStyle, mode === 'datetime' && { flex: 1 }]}
            value={dateStr}
            onChangeText={handleDateChange}
            placeholder={optional ? 'YYYY-MM-DD (optional)' : 'YYYY-MM-DD'}
            placeholderTextColor={colors.muted}
            editable={!disabled}
            accessibilityLabel={`${label} date`}
          />
        )}
        {mode !== 'date' && (
          <TextInput
            style={[inputStyle, mode === 'datetime' && { width: 90 }]}
            value={timeStr}
            onChangeText={handleTimeChange}
            placeholder="HH:MM"
            placeholderTextColor={colors.muted}
            editable={!disabled}
            accessibilityLabel={`${label} time`}
          />
        )}
        {optional && value && (
          <Pressable
            style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.5 : 1 }]}
            onPress={() => onChange(null)}
          >
            <Text style={[styles.clearBtnText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

// ─── DatePickerIconButton ───────────────────────────────────────────────────
//
// A small calendar/clock icon button that can be placed to the RIGHT of any
// existing TextInput to provide a native date/time picker as an alternative
// to manual typing.
//
// Usage:
//   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
//     <TextInput ... style={{ flex: 1 }} />
//     <DatePickerIconButton
//       mode="date"
//       value={selectedDate}
//       onChange={(d) => { setSelectedDate(d); setFormStr(formatDate(d)); }}
//     />
//   </View>

export interface DatePickerIconButtonProps {
  /** Picker mode: 'date', 'time', or 'datetime' */
  mode?: 'date' | 'time' | 'datetime';
  /** Current Date value to seed the picker (defaults to now) */
  value?: Date | null;
  /** Called when the user confirms a selection */
  onChange: (date: Date) => void;
  /** Minimum selectable date */
  minimumDate?: Date;
  /** Maximum selectable date */
  maximumDate?: Date;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether this picker is inside a Modal (uses inline rendering to avoid nested Modal bug) */
  inModal?: boolean;
}

export function DatePickerIconButton({
  mode = 'date',
  value,
  onChange,
  minimumDate,
  maximumDate,
  disabled = false,
  inModal = false,
}: DatePickerIconButtonProps) {
  const colors = useColors();
  const _dtLang = useLang();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const safeValue = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(safeValue);
  const [androidStep, setAndroidStep] = useState<'idle' | 'date' | 'time'>('idle');

  function openPicker() {
    if (disabled) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Re-sync tempDate from the latest prop value every time the picker opens.
    // Without this, if the parent updates `value` after mount (e.g. editing an
    // existing record), tempDate stays at the stale mount-time value and the
    // picker appears to roll back to the wrong date (often epoch / 1969).
    const freshSafe = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();
    setTempDate(freshSafe);
    if (Platform.OS === 'ios') {
      if (mode === 'time') setShowTimePicker(true);
      else setShowDatePicker(true);
    } else if (Platform.OS === 'android') {
      setAndroidStep(mode === 'time' ? 'time' : 'date');
    }
  }

  function handleAndroidChange(_: any, picked?: Date) {
    if (!picked) { setAndroidStep('idle'); return; }
    if (androidStep === 'date') {
      setTempDate(picked);
      if (mode === 'datetime') { setAndroidStep('time'); }
      else { onChange(picked); setAndroidStep('idle'); }
    } else if (androidStep === 'time') {
      const merged = new Date(tempDate);
      merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      onChange(merged);
      setAndroidStep('idle');
    }
  }

  if (Platform.OS === 'web') return null;

  const iconName = mode === 'time' ? 'clock' : 'calendar';
  const iconColor = isDark ? '#60A5FA' : '#3B82F6';

  // Android: render picker inline when active
  if (Platform.OS === 'android' && androidStep !== 'idle' && RNDateTimePicker) {
    return (
      <RNDateTimePicker
        value={androidStep === 'time' ? tempDate : safeValue}
        mode={androidStep}
        display={androidStep === 'date' ? 'calendar' : 'clock'}
        onChange={handleAndroidChange}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
      />
    );
  }

  // Inline mode (inside a Modal): render picker panels directly in tree
  if (inModal && Platform.OS === 'ios' && RNDateTimePicker) {
    return (
      <View>
        <TouchableOpacity
          onPress={openPicker}
          disabled={disabled || showDatePicker || showTimePicker}
          style={[iconBtnStyles.btn, { borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F0F9FF' }]}
          accessibilityLabel={`Open ${mode} picker`}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name={iconName} size={18} color={iconColor} />
        </TouchableOpacity>

        {showDatePicker && (
          <View style={[iconBtnStyles.inlinePanel, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
            <View style={[iconBtnStyles.inlineToolbar, { borderBottomColor: isDark ? '#38383A' : '#C6C6C8' }]}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={{ fontSize: 15, color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#EBEBF5' : '#1C1C1E' }}>
                {mode === 'datetime' ? 'Select Date' : 'Select Date'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowDatePicker(false);
                if (mode === 'datetime') setShowTimePicker(true);
                else onChange(tempDate);
              }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>
                  {mode === 'datetime' ? 'Next →' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
            <RNDateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              style={{ alignSelf: 'stretch', marginHorizontal: 8 }}
              textColor={isDark ? '#FFFFFF' : '#000000'}
              accentColor={colors.primary}
            />
          </View>
        )}

        {showTimePicker && (
          <View style={[iconBtnStyles.inlinePanel, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
            <View style={[iconBtnStyles.inlineToolbar, { borderBottomColor: isDark ? '#38383A' : '#C6C6C8' }]}>
              <TouchableOpacity onPress={() => { setShowTimePicker(false); if (mode === 'datetime') onChange(tempDate); }}>
                <Text style={{ fontSize: 15, color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#EBEBF5' : '#1C1C1E' }}>Select Time</Text>
              <TouchableOpacity onPress={() => { setShowTimePicker(false); onChange(tempDate); }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>Done</Text>
              </TouchableOpacity>
            </View>
            <RNDateTimePicker
              value={tempDate}
              mode="time"
              display="spinner"
              onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
              style={{ height: 200, alignSelf: 'stretch', marginHorizontal: 8 }}
              textColor={isDark ? '#FFFFFF' : '#000000'}
            />
          </View>
        )}
      </View>
    );
  }

  // Default iOS: icon button + Modal sheets
  return (
    <View>
      <TouchableOpacity
        onPress={openPicker}
        disabled={disabled}
        style={[iconBtnStyles.btn, { borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F0F9FF' }]}
        accessibilityLabel={`Open ${mode} picker`}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <IconSymbol name={iconName} size={18} color={iconColor} />
      </TouchableOpacity>

      {RNDateTimePicker && (
        <PickerSheet
          visible={showDatePicker}
          title={mode === 'datetime' ? 'Select Date' : mode === 'date' ? 'Select Date' : 'Select Time'}
          isDark={isDark}
          colors={colors}
          onClose={() => setShowDatePicker(false)}
          onDone={() => {
            setShowDatePicker(false);
            if (mode === 'datetime') setShowTimePicker(true);
            else onChange(tempDate);
          }}
          doneLabel={mode === 'datetime' ? 'Next' : (_dtLang === 'es' ? 'Listo' : _dtLang === 'fr' ? 'Terminé' : _dtLang === 'de' ? 'Fertig' : _dtLang === 'pt' ? 'Concluído' : _dtLang === 'zh' ? '完成' : _dtLang === 'ar' ? 'تم' : _dtLang === 'ja' ? '完了' : _dtLang === 'ko' ? '완료' : _dtLang === 'it' ? 'Fatto' : _dtLang === 'ru' ? 'Готово' : _dtLang === 'pl' ? 'Gotowe' : _dtLang === 'nl' ? 'Klaar' : _dtLang === 'tr' ? 'Tamam' : _dtLang === 'sv' ? 'Klar' : _dtLang === 'no' ? 'Ferdig' : _dtLang === 'hi' ? 'हो गया' : _dtLang === 'he' ? 'בוצע' : _dtLang === 'uk' ? 'Готово' : _dtLang === 'hy' ? 'Կատарված' : 'Done')}
        >
          <RNDateTimePicker
            value={tempDate}
            mode="date"
            display="inline"
            onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            style={{ alignSelf: 'stretch', marginHorizontal: 8 }}
            textColor={isDark ? '#FFFFFF' : '#000000'}
            accentColor={colors.primary}
          />
        </PickerSheet>
      )}

      {RNDateTimePicker && (
        <PickerSheet
          visible={showTimePicker}
          title="Select Time"
          isDark={isDark}
          colors={colors}
          onClose={() => { setShowTimePicker(false); if (mode === 'datetime') onChange(tempDate); }}
          onDone={() => { setShowTimePicker(false); onChange(tempDate); }}
          doneLabel={(_dtLang === 'es' ? 'Listo' : _dtLang === 'fr' ? 'Terminé' : _dtLang === 'de' ? 'Fertig' : _dtLang === 'pt' ? 'Concluído' : _dtLang === 'zh' ? '完成' : _dtLang === 'ar' ? 'تم' : _dtLang === 'ja' ? '完了' : _dtLang === 'ko' ? '완료' : _dtLang === 'it' ? 'Fatto' : _dtLang === 'ru' ? 'Готово' : _dtLang === 'pl' ? 'Gotowe' : _dtLang === 'nl' ? 'Klaar' : _dtLang === 'tr' ? 'Tamam' : _dtLang === 'sv' ? 'Klar' : _dtLang === 'no' ? 'Ferdig' : _dtLang === 'hi' ? 'हो गया' : _dtLang === 'he' ? 'בוצע' : _dtLang === 'uk' ? 'Готово' : _dtLang === 'hy' ? 'Կատарված' : 'Done')}
        >
          <RNDateTimePicker
            value={tempDate}
            mode="time"
            display="spinner"
            onChange={(_: any, d?: Date) => { if (d) setTempDate(d); }}
            style={{ height: 200, alignSelf: 'stretch', marginHorizontal: 8 }}
            textColor={isDark ? '#FFFFFF' : '#000000'}
          />
        </PickerSheet>
      )}
    </View>
  );
}

const iconBtnStyles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  inlinePanel: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inlineToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  field: {
    gap: 6,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  // Optional pill row (pill + clear button side by side)
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillBlank: {
    borderStyle: 'dashed',
  },
  pillText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  // Inline panel (used in inlineMode — no nested Modal)
  inlinePanel: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  inlineToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inlineToolbarBtn: {
    minWidth: 64,
  },
  // Sheet (used in Modal-based PickerSheet)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  cancelBtn: {
    minWidth: 60,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '400',
  },
  doneBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  doneText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inlinePicker: {
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  spinnerPicker: {
    height: 200,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  // Web
  webRow: {
    flexDirection: 'row',
    gap: 8,
  },
  webInput: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
