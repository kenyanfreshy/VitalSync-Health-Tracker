/**
 * useNumericField — a hook for numeric TextInput fields that:
 *  1. Accepts a raw string value (so the user can type freely)
 *  2. On blur, validates the value and shows an inline error if invalid
 *  3. Optionally reverts to the last valid value on blur (controlled mode)
 *
 * Usage:
 * ```tsx
 * const field = useNumericField({ value: weight, onChange: setWeight, allowDecimal: true });
 *
 * <TextInput
 *   value={field.text}
 *   onChangeText={field.onChangeText}
 *   onBlur={field.onBlur}
 *   keyboardType="default"
 *
 * />
 * {field.error ? (
 *   <Text style={{ color: colors.error, fontSize: 11, marginTop: 2 }}>{field.error}</Text>
 * ) : null}
 * ```
 */

import { useState, useCallback } from 'react';

export interface NumericFieldOptions {
  /** Current committed value (string). Used as the revert target on invalid blur. */
  value: string;
  /** Called when a valid number is committed on blur. */
  onChange?: (value: string) => void;
  /** Whether to allow decimal points (default: false = integers only). */
  allowDecimal?: boolean;
  /** Minimum allowed value (inclusive). */
  min?: number;
  /** Maximum allowed value (inclusive). */
  max?: number;
  /** Custom error message override. */
  errorMessage?: string;
  /** If true, revert to `value` on invalid blur instead of showing an error. Default: false. */
  revertOnInvalid?: boolean;
}

export interface NumericFieldResult {
  /** The current raw text in the input. */
  text: string;
  /** Update the raw text (pass to onChangeText). */
  onChangeText: (v: string) => void;
  /** Call on blur to validate and commit. */
  onBlur: () => void;
  /** Non-null when the current text is invalid (after blur). */
  error: string | null;
  /** Clear the error manually (e.g. when the user starts typing again). */
  clearError: () => void;
}

export function useNumericField(options: NumericFieldOptions): NumericFieldResult {
  const {
    value,
    onChange,
    allowDecimal = false,
    min,
    max,
    errorMessage,
    revertOnInvalid = false,
  } = options;

  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);

  // Keep text in sync when external value changes (e.g. reset)
  // We only sync if the field is not currently being edited (no error state)
  const onChangeText = useCallback((v: string) => {
    setText(v);
    if (error) setError(null); // clear error as soon as user types
  }, [error]);

  const onBlur = useCallback(() => {
    const trimmed = text.trim();

    // Empty field
    if (trimmed === '') {
      if (revertOnInvalid) {
        setText(value);
        setError(null);
      } else {
        setError(errorMessage ?? 'Enter a valid number');
      }
      return;
    }

    const num = allowDecimal ? parseFloat(trimmed) : parseInt(trimmed, 10);

    if (isNaN(num)) {
      if (revertOnInvalid) {
        setText(value);
        setError(null);
      } else {
        setError(errorMessage ?? 'Enter a valid number');
      }
      return;
    }

    if (min !== undefined && num < min) {
      if (revertOnInvalid) {
        setText(value);
        setError(null);
      } else {
        setError(errorMessage ?? `Minimum value is ${min}`);
      }
      return;
    }

    if (max !== undefined && num > max) {
      if (revertOnInvalid) {
        setText(value);
        setError(null);
      } else {
        setError(errorMessage ?? `Maximum value is ${max}`);
      }
      return;
    }

    // Valid — commit
    setError(null);
    if (onChange) onChange(String(num));
  }, [text, value, onChange, allowDecimal, min, max, errorMessage, revertOnInvalid]);

  const clearError = useCallback(() => setError(null), []);

  return { text, onChangeText, onBlur, error, clearError };
}
