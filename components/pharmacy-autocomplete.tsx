/**
 * PharmacyAutocomplete
 *
 * A three-field group (Name / Phone / Address) that:
 *  1. Shows a dropdown of previously saved pharmacies as the user types the name.
 *  2. Auto-populates Phone and Address when the user selects a suggestion.
 *  3. Saves the entry to PharmacyStore whenever the parent form is submitted
 *     (the parent calls `pharmacyAutocompleteRef.current.persist()` on save).
 *
 * Usage:
 * ```tsx
 * <PharmacyAutocomplete
 *   name={formPharmacyName}      onNameChange={setFormPharmacyName}
 *   phone={formPharmacyPhone}    onPhoneChange={setFormPharmacyPhone}
 *   address={formPharmacyAddress} onAddressChange={setFormPharmacyAddress}
 *   colors={colors}
 * />
 * ```
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  searchPharmacies,
  upsertPharmacy,
  type PharmacyEntry,
} from '@/lib/medications/pharmacy-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PharmacyAutocompleteHandle {
  /** Call this when the parent form is saved to persist the current values */
  persist: () => Promise<void>;
}

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  address: string;
  onAddressChange: (v: string) => void;
  colors: {
    foreground: string;
    muted: string;
    surface: string;
    border: string;
    primary: string;
    background: string;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PharmacyAutocomplete = forwardRef<PharmacyAutocompleteHandle, Props>(
  function PharmacyAutocomplete(
    { name, onNameChange, phone, onPhoneChange, address, onAddressChange, colors },
    ref,
  ) {
    const [suggestions, setSuggestions] = useState<PharmacyEntry[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Expose persist() to parent
    useImperativeHandle(ref, () => ({
      persist: async () => {
        if (name.trim()) {
          await upsertPharmacy(name, phone, address);
        }
      },
    }));

    // Debounced search as user types
    useEffect(() => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(async () => {
        const results = await searchPharmacies(name);
        setSuggestions(results);
        // Only show dropdown if there are results AND the field is focused
        setShowDropdown(results.length > 0);
      }, 150);
      return () => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
      };
    }, [name]);

    const handleSelect = useCallback(
      (entry: PharmacyEntry) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onNameChange(entry.name);
        onPhoneChange(entry.phone);
        onAddressChange(entry.address);
        setShowDropdown(false);
        Keyboard.dismiss();
      },
      [onNameChange, onPhoneChange, onAddressChange],
    );

    const handleNameBlur = useCallback(() => {
      // Slight delay so tap on suggestion registers before hiding
      setTimeout(() => setShowDropdown(false), 200);
    }, []);

    const handleNameFocus = useCallback(async () => {
      const results = await searchPharmacies(name);
      setSuggestions(results);
      if (results.length > 0) setShowDropdown(true);
    }, [name]);

    const inputStyle = [
      styles.input,
      {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        color: colors.foreground,
      },
    ];

    return (
      <View>
        {/* ── Name field with dropdown ─────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.muted }]}>PHARMACY NAME</Text>
        <View style={styles.nameWrap}>
          <TextInput
            value={name}
            onChangeText={(v) => {
              onNameChange(v);
              setShowDropdown(true);
            }}
            onFocus={handleNameFocus}
            onBlur={handleNameBlur}
            placeholder="e.g. CVS Pharmacy"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            style={inputStyle}
            autoCorrect={false}
          />

          {/* Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <View
              style={[
                styles.dropdown,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.foreground,
                },
              ]}
            >
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.name}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={suggestions.length > 4}
                style={{ maxHeight: 180 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.suggestionRow,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    {/* Pharmacy icon — star if preferred */}
                    <Text style={styles.suggestionIcon}>{item.isPreferred ? '⭐' : '🏥'}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text
                          style={[styles.suggestionName, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        {item.isPreferred && (
                          <Text style={[styles.preferredTag, { color: '#F59E0B' }]}>Default</Text>
                        )}
                      </View>
                      {(item.phone || item.address) && (
                        <Text
                          style={[styles.suggestionSub, { color: colors.muted }]}
                          numberOfLines={1}
                        >
                          {[item.phone, item.address].filter(Boolean).join('  ·  ')}
                        </Text>
                      )}
                    </View>
                    {/* Auto-fill hint */}
                    <Text style={[styles.fillHint, { color: colors.primary }]}>Fill ↵</Text>
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>

        {/* ── Phone ────────────────────────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.muted }]}>PHARMACY PHONE</Text>
        <TextInput
          value={phone}
          onChangeText={onPhoneChange}
          placeholder="e.g. (555) 123-4567"
          placeholderTextColor={colors.muted}
          keyboardType="default"
            inputMode="tel"
          returnKeyType="next"
          style={inputStyle}
        />

        {/* ── Address ──────────────────────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.muted }]}>PHARMACY ADDRESS</Text>
        <TextInput
          value={address}
          onChangeText={onAddressChange}
          placeholder="e.g. 123 Main St, Springfield, IL"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={inputStyle}
          autoCorrect={false}
        />
      </View>
    );
  },
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 15,
    lineHeight: 20,
  },
  nameWrap: {
    position: 'relative',
    zIndex: 10,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    zIndex: 100,
    // Shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  suggestionIcon: {
    fontSize: 16,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  suggestionSub: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  fillHint: {
    fontSize: 11,
    fontWeight: '700',
  },
  preferredTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
