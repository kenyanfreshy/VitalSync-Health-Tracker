/**
 * FoodLookupSheet
 * Searchable food database with potassium (and sodium) content.
 * When the Renal diet profile is active, high-potassium foods are flagged in red.
 * Tapping a food pre-fills the sodium log form.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks';
import { useHealth } from '@/lib/health/health-context';
import { DIET_TYPE_OPTIONS } from '@/lib/health/diet-type';
import {
  searchFoods,
  calcPotassiumMg,
  calcSodiumMg,
  calcCalories,
  CATEGORY_LABELS,
  RENAL_RISK_COLORS,
  RENAL_RISK_LABELS,
  type FoodItem,
} from '@/lib/clinical/potassium-foods';

export interface FoodLookupResult {
  food: FoodItem;
  servingG: number;
  potassiumMg: number;
  sodiumMg: number;
  calories: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: FoodLookupResult) => void;
}

export function FoodLookupSheet({ visible, onClose, onSelect }: Props) {
  const colors = useColors();
  const { dietType } = useHealth();
  const isRenal = DIET_TYPE_OPTIONS.find(o => o.value === dietType)?.isRenal ?? false;

  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingG, setServingG] = useState('');

  const results = useMemo(() => searchFoods(query, 25), [query]);

  const handleSelectFood = useCallback((food: FoodItem) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFood(food);
    setServingG(String(food.typicalServingG ?? 100));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedFood) return;
    const grams = parseFloat(servingG);
    if (isNaN(grams) || grams <= 0) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSelect({
      food: selectedFood,
      servingG: grams,
      potassiumMg: calcPotassiumMg(selectedFood, grams),
      sodiumMg: calcSodiumMg(selectedFood, grams),
      calories: calcCalories(selectedFood, grams),
    });
    handleClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFood, servingG, onSelect]);

  const handleClose = useCallback(() => {
    setQuery('');
    setSelectedFood(null);
    setServingG('');
    onClose();
  }, [onClose]);

  const s = styles(colors);

  const renderFoodItem = useCallback(({ item }: { item: FoodItem }) => {
    const isHighRisk = isRenal && item.renalRisk === 'high';
    const isMedRisk = isRenal && item.renalRisk === 'medium';
    const riskColor = RENAL_RISK_COLORS[item.renalRisk];
    const isSelected = selectedFood?.id === item.id;

    return (
      <Pressable
        style={({ pressed }) => [
          s.foodRow,
          isSelected && { backgroundColor: colors.primary + '18', borderColor: colors.primary + '60' },
          pressed && { opacity: 0.75 },
        ]}
        onPress={() => handleSelectFood(item)}
      >
        <View style={s.foodMain}>
          <View style={s.foodNameRow}>
            <Text style={[s.foodName, isHighRisk && { color: RENAL_RISK_COLORS.high }]}>
              {item.name}
            </Text>
            {isRenal && (
              <View style={[s.riskBadge, { backgroundColor: riskColor + '22', borderColor: riskColor + '55' }]}>
                <Text style={[s.riskBadgeText, { color: riskColor }]}>
                  {RENAL_RISK_LABELS[item.renalRisk]}
                </Text>
              </View>
            )}
          </View>
          <Text style={s.foodCategory}>{CATEGORY_LABELS[item.category]}</Text>
          {isRenal && item.renalNote && (
            <Text style={[s.renalNote, { color: isHighRisk ? RENAL_RISK_COLORS.high : RENAL_RISK_COLORS.medium }]}>
              ⚠ {item.renalNote}
            </Text>
          )}
        </View>
        <View style={s.foodStats}>
          <Text style={[s.kValue, { color: isHighRisk ? RENAL_RISK_COLORS.high : isMedRisk ? RENAL_RISK_COLORS.medium : colors.success }]}>
            {item.potassiumMgPer100g}
          </Text>
          <Text style={s.kUnit}>mg K/100g</Text>
        </View>
      </Pressable>
    );
  }, [isRenal, selectedFood, colors, s, handleSelectFood]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[s.title, { color: colors.foreground }]}>Food Lookup</Text>
            <Text style={[s.subtitle, { color: colors.muted }]}>
              {isRenal ? '🔴 Renal diet active — high-K foods flagged' : 'Search by food name'}
            </Text>
          </View>
          <Pressable style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]} onPress={handleClose}>
            <IconSymbol name="xmark" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Search foods (e.g. banana, potato)…"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <IconSymbol name="xmark" size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Results list */}
        {query.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            renderItem={renderFoodItem}
            style={s.list}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListEmptyComponent={
              <Text style={[s.emptyText, { color: colors.muted }]}>No foods found for &quot;{query}&quot;</Text>
            }
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <View style={s.emptyState}>
            <IconSymbol name="magnifyingglass" size={40} color={colors.border} />
            <Text style={[s.emptyStateTitle, { color: colors.foreground }]}>Search the food database</Text>
            <Text style={[s.emptyStateSubtitle, { color: colors.muted }]}>
              120+ foods with potassium and sodium content
            </Text>
            {isRenal && (
              <View style={[s.renalBanner, { backgroundColor: RENAL_RISK_COLORS.high + '15', borderColor: RENAL_RISK_COLORS.high + '40' }]}>
                <Text style={[s.renalBannerText, { color: RENAL_RISK_COLORS.high }]}>
                  Renal diet limit: 2,000 mg potassium/day
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Serving size + confirm panel */}
        {selectedFood && (
          <View style={[s.confirmPanel, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={s.confirmHeader}>
              <Text style={[s.confirmFoodName, { color: colors.foreground }]}>{selectedFood.name}</Text>
              {isRenal && (
                <View style={[s.riskBadge, { backgroundColor: RENAL_RISK_COLORS[selectedFood.renalRisk] + '22', borderColor: RENAL_RISK_COLORS[selectedFood.renalRisk] + '55' }]}>
                  <Text style={[s.riskBadgeText, { color: RENAL_RISK_COLORS[selectedFood.renalRisk] }]}>
                    {RENAL_RISK_LABELS[selectedFood.renalRisk]}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.servingRow}>
              <Text style={[s.servingLabel, { color: colors.muted }]}>Serving size (g)</Text>
              <TextInput
                style={[s.servingInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={servingG}
                onChangeText={setServingG}
                keyboardType="default"
                returnKeyType="done"
                selectTextOnFocus
              />
            </View>

            {/* Live nutrient preview */}
            {!isNaN(parseFloat(servingG)) && parseFloat(servingG) > 0 && (() => {
              const g = parseFloat(servingG);
              const k = calcPotassiumMg(selectedFood, g);
              const na = calcSodiumMg(selectedFood, g);
              const cal = calcCalories(selectedFood, g);
              const kColor = isRenal
                ? (k >= 300 ? RENAL_RISK_COLORS.high : k >= 150 ? RENAL_RISK_COLORS.medium : colors.success)
                : colors.foreground;
              return (
                <View style={s.nutrientPreview}>
                  <View style={s.nutrientItem}>
                    <Text style={[s.nutrientValue, { color: kColor }]}>{k}</Text>
                    <Text style={[s.nutrientLabel, { color: colors.muted }]}>mg K</Text>
                  </View>
                  <View style={[s.nutrientDivider, { backgroundColor: colors.border }]} />
                  <View style={s.nutrientItem}>
                    <Text style={[s.nutrientValue, { color: colors.foreground }]}>{na}</Text>
                    <Text style={[s.nutrientLabel, { color: colors.muted }]}>mg Na</Text>
                  </View>
                  <View style={[s.nutrientDivider, { backgroundColor: colors.border }]} />
                  <View style={s.nutrientItem}>
                    <Text style={[s.nutrientValue, { color: colors.foreground }]}>{cal}</Text>
                    <Text style={[s.nutrientLabel, { color: colors.muted }]}>kcal</Text>
                  </View>
                </View>
              );
            })()}

            <Pressable
              style={({ pressed }) => [s.confirmBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={handleConfirm}
            >
              <IconSymbol name="checkmark" size={16} color="#fff" />
              <Text style={s.confirmBtnText}>Use This Food</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  list: { flex: 1 },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderWidth: 1,
    borderColor: 'transparent',
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
  },
  foodMain: { flex: 1 },
  foodNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  foodName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  foodCategory: { fontSize: 12, color: colors.muted, marginTop: 2 },
  renalNote: { fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  riskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  riskBadgeText: { fontSize: 10, fontWeight: '700' },
  foodStats: { alignItems: 'flex-end', minWidth: 60 },
  kValue: { fontSize: 16, fontWeight: '700' },
  kUnit: { fontSize: 10, color: colors.muted },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyStateTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyStateSubtitle: { fontSize: 13, textAlign: 'center' },
  renalBanner: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  renalBannerText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  confirmPanel: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 12,
  },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  confirmFoodName: { fontSize: 16, fontWeight: '700' },
  servingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  servingLabel: { fontSize: 14 },
  servingInput: {
    width: 90,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    textAlign: 'center',
  },
  nutrientPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  nutrientItem: { alignItems: 'center', flex: 1 },
  nutrientValue: { fontSize: 18, fontWeight: '700' },
  nutrientLabel: { fontSize: 11, marginTop: 2 },
  nutrientDivider: { width: 1, height: 32 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
