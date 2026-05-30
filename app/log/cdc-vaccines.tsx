/**
 * CDC Vaccines Screen  (/log/cdc-vaccines)
 *
 * A dedicated full-screen route for browsing, searching, and selecting vaccines
 * from the CDC vaccine library. Extracted from the immunizations modal to:
 *   1. Eliminate the O(n^2) getItemLayout offset loop (now O(1) via precomputed offsets)
 *   2. Lazy-load vaccine data only when this screen is pushed onto the stack
 *   3. Keep the immunizations.tsx component tree small and fast
 *
 * Navigation params (passed back via router.back() + AsyncStorage handoff):
 *   - When user selects a vaccine, the template is written to
 *     '@vsht:cdc_selected_vaccine' in AsyncStorage, then router.back() is called.
 *   - The immunizations form reads and clears this key on focus.
 *
 * Quick-add path:
 *   - When the user taps the lightning bolt, the vaccine is written to
 *     '@vsht:cdc_quick_add_vaccine' and router.back() is called.
 *   - The immunizations screen reads and clears this key on focus.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useLang } from '@/hooks/use-lang';
import { cdcVaccineStrings } from '@/lib/i18n';
import { safeSetItem } from '@/lib/safe-async-storage';
import {
  VACCINE_LIBRARY,
  VACCINE_CATEGORIES,
  CATEGORY_ICON,
  CATEGORY_COLOR,
  type VaccineCategory,
  type VaccineTemplate,
} from '@/lib/health/vaccine-library';

// ── AsyncStorage keys (shared with immunizations.tsx) ─────────────────────────
export const CDC_SELECTED_KEY   = '@vsht:cdc_selected_vaccine';
export const CDC_QUICK_ADD_KEY  = '@vsht:cdc_quick_add_vaccine';
export const CDC_CATEGORY_KEY   = '@vsht:vaccine_library_category';

// ── FlatList row types ─────────────────────────────────────────────────────────
type HeaderRow  = { type: 'header';  category: VaccineCategory; count: number };
type VaccineRow = { type: 'vaccine'; vaccine: VaccineTemplate };
type ListRow    = HeaderRow | VaccineRow;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFlatRows(
  filtered: VaccineTemplate[],
  showHeaders: boolean,
): ListRow[] {
  if (!showHeaders) {
    return filtered.map(v => ({ type: 'vaccine', vaccine: v }));
  }
  const map = new Map<VaccineCategory, VaccineTemplate[]>();
  for (const v of filtered) {
    if (!map.has(v.category)) map.set(v.category, []);
    map.get(v.category)!.push(v);
  }
  const rows: ListRow[] = [];
  for (const cat of VACCINE_CATEGORIES) {
    const items = map.get(cat);
    if (!items || items.length === 0) continue;
    rows.push({ type: 'header', category: cat, count: items.length });
    for (const v of items) rows.push({ type: 'vaccine', vaccine: v });
  }
  return rows;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CDCVaccinesScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const lang = useLang();
  const cvs = (cdcVaccineStrings as unknown as Record<string, typeof cdcVaccineStrings.en>)[lang] ?? cdcVaccineStrings.en;
  const isDark  = colors.background === '#151718' || colors.background === '#0D1117';

  // Search state — split input (immediate) from committed (debounced)
  const [inputValue,      setInputValue]      = useState('');
  const [committedQuery,  setCommittedQuery]  = useState('');
  const [activeCategory,  setActiveCategory]  = useState<VaccineCategory | 'All'>('All');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef     = useRef<FlatList<ListRow>>(null);

  // Restore last-used category from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(CDC_CATEGORY_KEY).then(saved => {
      if (saved) setActiveCategory(saved as VaccineCategory | 'All');
    }).catch(() => {});
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleQueryChange = useCallback((text: string) => {
    setInputValue(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCommittedQuery(text);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 280);
  }, []);

  const handleClearQuery = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue('');
    setCommittedQuery('');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleCategoryChange = useCallback((cat: VaccineCategory | 'All') => {
    setActiveCategory(cat);
    safeSetItem(CDC_CATEGORY_KEY, cat).catch(() => {});
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleSelect = useCallback(async (v: VaccineTemplate) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await safeSetItem(CDC_SELECTED_KEY, JSON.stringify(v));
    router.back();
  }, [router]);

  const handleQuickAdd = useCallback(async (v: VaccineTemplate) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await safeSetItem(CDC_QUICK_ADD_KEY, JSON.stringify(v));
    router.back();
  }, [router]);

  // ── Data ────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = committedQuery.toLowerCase().trim();
    return VACCINE_LIBRARY.filter(v => {
      const matchesCategory = (activeCategory as string) === 'All' || (activeCategory as string) === cvs.allLabel || v.category === activeCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.abbreviation.toLowerCase().includes(q) ||
        v.brandNames.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    });
  }, [committedQuery, activeCategory]);

  const showHeaders = (activeCategory as string) === 'All' || (activeCategory as string) === cvs.allLabel;

  const flatRows = useMemo(
    () => buildFlatRows(filtered, showHeaders),
    [filtered, showHeaders],
  );

  const keyExtractor = useCallback(
    (item: ListRow, index: number) =>
      item.type === 'header'
        ? `hdr-${item.category}`
        : `vax-${item.vaccine.abbreviation}-${index}`,
    [],
  );

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.type === 'header') {
        const cat = item.category;
        return (
          <View style={[s.catHeader, {
            borderLeftColor: CATEGORY_COLOR[cat],
            backgroundColor: colors.background,
          }]}>
            <Text style={{ fontSize: 14, marginRight: 6 }}>{CATEGORY_ICON[cat]}</Text>
            <Text style={[s.catHeaderText, { color: colors.foreground }]}>
              {(cat as string).replace('Routine – ', '').replace('Travel – ', '')}
            </Text>
            <Text style={[s.catHeaderCount, { color: colors.muted }]}>
              {item.count}
            </Text>
          </View>
        );
      }

      const v = item.vaccine;
      return (
        <TouchableOpacity
          onPress={() => handleSelect(v)}
          style={[s.vaccineRow, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Select ${v.name}`}
        >
          <View style={s.vaccineInfo}>
            <View style={s.vaccineNameRow}>
              <Text style={[s.vaccineName, { color: colors.foreground }]} numberOfLines={1}>
                {v.name}
              </Text>
              <Text style={[s.vaccineAbbr, { color: colors.muted }]}>
                {v.abbreviation}
              </Text>
            </View>
            <Text style={[s.vaccineDesc, { color: colors.muted }]} numberOfLines={2}>
              {v.description}
            </Text>
            <View style={s.vaccineMeta}>
              <Text style={[s.vaccineMetaText, { color: colors.muted }]}>
                {v.route.split(' or ')[0]}
              </Text>
              <Text style={[s.vaccineMetaDot, { color: colors.border }]}>·</Text>
              <Text style={[s.vaccineMetaText, { color: colors.muted }]}>
                {v.typicalDoses} dose{v.typicalDoses !== 1 ? 's' : ''}
              </Text>
              {v.brandNames && (
                <>
                  <Text style={[s.vaccineMetaDot, { color: colors.border }]}>·</Text>
                  <Text style={[s.vaccineMetaText, { color: colors.muted }]} numberOfLines={1}>
                    {v.brandNames.split(',')[0].trim()}
                  </Text>
                </>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => handleQuickAdd(v)}
            style={[s.quickAddBtn, { backgroundColor: CATEGORY_COLOR[v.category] + '22' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Quick add ${v.name}`}
          >
            <Text style={s.quickAddText}>+</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, isDark, handleSelect, handleQuickAdd],
  );

  const ListEmpty = useMemo(() => (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🔍</Text>
      <Text style={[s.emptyTitle, { color: colors.foreground }]}>{cvs.noMatches}</Text>
      <Text style={[s.emptyBody, { color: colors.muted }]}>
        {cvs.tryDifferentSearch}
      </Text>
    </View>
  ), [colors]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={cvs.goBack}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{cvs.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar */}
      <View style={[s.searchRow, { backgroundColor: isDark ? '#1e2022' : '#f5f5f5' }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          value={inputValue}
          onChangeText={handleQueryChange}
          placeholder={cvs.searchPlaceholder}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          autoFocus={false}
        />
        {inputValue.length > 0 && (
          <TouchableOpacity
            onPress={handleClearQuery}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: colors.muted, fontSize: 16, paddingLeft: 6 }}>x</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.catRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
      >
        {(['All', ...VACCINE_CATEGORIES] as const).map(cat => {
          const isActive = activeCategory === cat;
          const chipColor = cat === 'All' ? '#22C55E' : CATEGORY_COLOR[cat as VaccineCategory];
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => handleCategoryChange(cat as VaccineCategory | 'All')}
              style={[
                s.catChip,
                {
                  backgroundColor: isActive ? chipColor : isDark ? '#1e2022' : '#f5f5f5',
                  borderColor: isActive ? chipColor : colors.border,
                },
              ]}
            >
              {cat !== cvs.allLabel && (
                <Text style={{ fontSize: 12, marginRight: 4 }}>
                  {CATEGORY_ICON[cat as VaccineCategory]}
                </Text>
              )}
              <Text style={[s.catChipText, { color: isActive ? '#fff' : colors.foreground }]}>
                {cat === 'All'
                  ? cvs.allLabel
                  : (cat as string).replace('Routine – ', cvs.routinePrefix + ' – ').replace('Travel – ', cvs.travelPrefix + ' – ')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results count */}
      <Text style={[s.resultCount, { color: colors.muted }]}>
        {filtered.length} {filtered.length !== 1 ? cvs.vaccines : cvs.vaccine}
        {committedQuery.length > 0 ? ` ${cvs.matching} "${committedQuery}"` : ''}
        {' · '}{cvs.tapToPreFill}{' · '}{cvs.quickAdd}
      </Text>

      {/* Vaccine list — KeyboardAvoidingView ensures the list is never hidden
           behind the keyboard. flex:1 on the outer View gives it all remaining
           height after the header/search/chips/count rows. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList<ListRow>
          ref={listRef}
          data={flatRows}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          style={{ flex: 1 }}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          ListEmptyComponent={ListEmpty}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  catRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 56,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  resultCount: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginTop: 4,
  },
  catHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.3,
  },
  catHeaderCount: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  vaccineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  vaccineInfo: {
    flex: 1,
    gap: 3,
  },
  vaccineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vaccineName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  vaccineAbbr: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  vaccineDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  vaccineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  vaccineMetaText: {
    fontSize: 11,
  },
  vaccineMetaDot: {
    fontSize: 11,
  },
  quickAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  quickAddText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22C55E',
    lineHeight: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
  },
});
