/**
 * DictationBox — shared dictation UI component
 *
 * Renders:
 *  - Header row: label (left) + "Tap field → tap mic on keyboard" hint (right)
 *  - Multiline TextInput for dictation
 *  - "Fill Form →" button (shown when text is non-empty)
 *  - "Recent" dropdown showing last 3 phrases (shown when history exists and text is empty)
 *
 * Props:
 *  - formKey: unique key for AsyncStorage history (e.g. "medications", "appointments")
 *  - label: e.g. "🎤  DICTATE PRESCRIPTION"
 *  - placeholder: rich example phrase
 *  - value / onChangeText: controlled text state
 *  - onSubmit: called with the current text when Fill Form is tapped
 *  - isParsing: shows ActivityIndicator instead of "Fill Form →"
 *  - colors: from useColors()
 */
import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useDictationHistory } from '@/hooks/use-dictation-history';
import { useLang } from '@/hooks';
import { dictationBoxStrings } from '@/lib/i18n';

export interface DictationBoxHandle {
  focus: () => void;
}

interface Props {
  formKey: string;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  isParsing?: boolean;
  colors: {
    surface: string;
    border: string;
    muted: string;
    foreground: string;
    primary: string;
    background: string;
  };
}

export const DictationBox = forwardRef<DictationBoxHandle, Props>(
  ({ formKey, label, placeholder, value, onChangeText, onSubmit, isParsing, colors }, ref) => {
    const inputRef = useRef<TextInput>(null);
    const { recentPhrases, pushPhrase } = useDictationHistory(formKey);
    const lang = useLang();
    const db = (dictationBoxStrings as unknown as Record<string, typeof dictationBoxStrings['en']>)[lang] ?? dictationBoxStrings['en'];

    useImperativeHandle(ref, () => ({
      focus: () => {
        setTimeout(() => inputRef.current?.focus(), 80);
      },
    }));

    const handleSubmit = () => {
      if (value.trim()) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        pushPhrase(value.trim());
        onSubmit();
      }
    };

    const showRecent = recentPhrases.length > 0 && value.trim().length === 0;

    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Header row */}
        <View style={styles.header}>
          <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>{db.hint}</Text>
        </View>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          returnKeyType="done"
          blurOnSubmit={false}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
        />

        {/* Fill Form button */}
        {value.trim().length > 0 && (
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isParsing}
            activeOpacity={0.8}
            style={[styles.fillBtn, { backgroundColor: colors.primary }]}
          >
            {isParsing ? (
              <>
                <ActivityIndicator size="small" color="#fff" accessibilityLabel={db.parsing} />
                <Text style={[styles.fillBtnText, { marginLeft: 6 }]}>{db.parsing}</Text>
              </>
            ) : (
              <Text style={styles.fillBtnText}>{db.fillBtn}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Recent phrases dropdown */}
        {showRecent && (
          <View style={[styles.recentContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.recentTitle, { color: colors.muted }]}>{db.recentTitle}</Text>
            {recentPhrases.map((phrase, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => onChangeText(phrase)}
                activeOpacity={0.7}
                style={[styles.recentItem, { borderColor: colors.border }]}
              >
                <Text style={[styles.recentIcon, { color: colors.muted }]}>↩</Text>
                <Text
                  style={[styles.recentText, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {phrase}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  },
);

DictationBox.displayName = 'DictationBox';

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 11,
  },
  input: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  fillBtn: {
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  fillBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  recentContainer: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 4,
  },
  recentTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recentIcon: {
    fontSize: 13,
    marginTop: 1,
  },
  recentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
