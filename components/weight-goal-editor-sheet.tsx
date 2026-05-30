/**
 * WeightGoalEditorSheet
 *
 * A compact bottom sheet for editing the user's weight goal inline,
 * without navigating away from the NeoVital chart screen.
 *
 * Usage:
 * ```tsx
 * <WeightGoalEditorSheet
 *   visible={showGoalEditor}
 *   currentGoal={weightGoalLbs}
 *   onSave={(newGoal) => setGoal(newGoal)}
 *   onClear={() => setGoal(null)}
 *   onClose={() => setShowGoalEditor(false)}
 * />
 * ```
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';

interface WeightGoalEditorSheetProps {
  visible: boolean;
  currentGoal: number | null;
  onSave: (goal: number) => void;
  onClear: () => void;
  onClose: () => void;
}

export function WeightGoalEditorSheet({
  visible,
  currentGoal,
  onSave,
  onClear,
  onClose,
}: WeightGoalEditorSheetProps) {
  const colors = useColors();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const inputRef = useRef<TextInput>(null);

  // Sync input with currentGoal when sheet opens
  useEffect(() => {
    if (visible) {
      setInputValue(currentGoal !== null ? String(currentGoal) : '');
      setError(null);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start(() => {
        // Focus input after animation
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentGoal]);

  const handleSave = () => {
    const parsed = parseFloat(inputValue.trim());
    if (isNaN(parsed) || parsed <= 0 || parsed > 999) {
      setError('Enter a valid weight between 1 and 999 lbs');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSave(Math.round(parsed * 10) / 10);
    onClose();
  };

  const handleClear = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onClear();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavContainer}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              ⚖️ Weight Goal
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Set your target weight in lbs. The goal line will appear on your chart.
          </Text>

          {/* Input row */}
          <View style={[styles.inputRow, { borderColor: error ? '#EF4444' : colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.foreground }]}
              value={inputValue}
              onChangeText={(t) => {
                setInputValue(t);
                setError(null);
              }}
              keyboardType="decimal-pad"
              placeholder={currentGoal !== null ? String(currentGoal) : '150'}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              maxLength={6}
            />
            <Text style={[styles.unit, { color: colors.muted }]}>lbs</Text>
          </View>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            {currentGoal !== null && (
              <Pressable
                onPress={handleClear}
                style={({ pressed }) => [
                  styles.clearBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.clearBtnText, { color: colors.muted }]}>Clear Goal</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [
                styles.saveBtn,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.saveBtnText}>Save Goal</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  kavContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingVertical: 0,
  },
  unit: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 12,
    marginLeft: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#FFD60A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
});
