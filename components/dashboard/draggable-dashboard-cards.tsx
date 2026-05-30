/**
 * DraggableDashboardCards
 *
 * Renders the three primary health-overview cards in the user-defined order:
 *   - vitals   → NeoVitalMiniCard
 *   - activity → ActivityReadinessCard
 *   - glucose  → GlucoseDashboardCard
 *
 * Long-press any card to enter "Edit Layout" mode, which reveals ↑↓ arrows.
 * Tap "Done" (or wait 8 seconds) to exit Edit Layout mode.
 *
 * The order is persisted via useDashboardCardOrder (AsyncStorage).
 *
 * NOTE: This file is kept as a standalone component for future use.
 * The actual drag-to-reorder is wired directly in app/(tabs)/index.tsx
 * using the useDashboardCardOrder hook and inline cardOrder.map().
 */

import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks';
import { useDashboardCardOrder, type DashboardCardId } from '@/hooks/use-dashboard-card-order';

// ─── Single draggable card wrapper ────────────────────────────────────────────
interface DraggableCardProps {
  id: DashboardCardId;
  index: number;
  totalCards: number;
  editMode: boolean;
  onLongPress: () => void;
  onMoveUp: (id: DashboardCardId) => void;
  onMoveDown: (id: DashboardCardId) => void;
  children: React.ReactNode;
}

function DraggableCard({
  id,
  index,
  totalCards,
  editMode,
  onLongPress,
  onMoveUp,
  onMoveDown,
  children,
}: DraggableCardProps) {
  const colors = useColors();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleLongPress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.97, { damping: 12, stiffness: 200 });
    setTimeout(() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }, 200);
    onLongPress();
  };

  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={styles.cardWrapper}
      >
        {children}
        {editMode && (
          <View style={styles.editOverlay} pointerEvents="box-none">
            {index > 0 && (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onMoveUp(id);
                }}
                style={[styles.arrowBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Move card up"
                accessibilityRole="button"
              >
                <Text style={[styles.arrowText, { color: colors.primary }]}>↑</Text>
              </TouchableOpacity>
            )}
            <View style={styles.dragHandle}>
              {[0,1,2,3,4,5].map(i => (
                <View key={i} style={[styles.dragDot, { backgroundColor: colors.primary }]} />
              ))}
            </View>
            {index < totalCards - 1 && (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onMoveDown(id);
                }}
                style={[styles.arrowBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Move card down"
                accessibilityRole="button"
              >
                <Text style={[styles.arrowText, { color: colors.primary }]}>↓</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// ─── Props for the main component ────────────────────────────────────────────
export interface DraggableDashboardCardsProps {
  cardMap: Record<DashboardCardId, React.ReactNode>;
}

// ─── Main component ────────────────────────────────────────────────────────────
export function DraggableDashboardCards({ cardMap }: DraggableDashboardCardsProps) {
  const colors = useColors();
  const { order, moveCard, resetOrder, hydrated } = useDashboardCardOrder();
  const [editMode, setEditMode] = React.useState(false);
  const editTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetEditTimer = React.useCallback(() => {
    if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
    editTimeoutRef.current = setTimeout(() => setEditMode(false), 8000);
  }, []);

  React.useEffect(() => {
    return () => { if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current); };
  }, []);

  const enterEditMode = React.useCallback(() => {
    setEditMode(true);
    resetEditTimer();
  }, [resetEditTimer]);

  const exitEditMode = React.useCallback(() => {
    if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
    setEditMode(false);
  }, []);

  const handleMoveUp = React.useCallback((id: DashboardCardId) => {
    const idx = order.indexOf(id);
    if (idx > 0) { moveCard(id, idx - 1); resetEditTimer(); }
  }, [order, moveCard, resetEditTimer]);

  const handleMoveDown = React.useCallback((id: DashboardCardId) => {
    const idx = order.indexOf(id);
    if (idx < order.length - 1) { moveCard(id, idx + 1); resetEditTimer(); }
  }, [order, moveCard, resetEditTimer]);

  if (!hydrated) return null;

  return (
    <View>
      {editMode && (
        <View style={[styles.editBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.editBannerText, { color: colors.primary }]}>✦ Edit Layout — use ↑↓ to reorder</Text>
          <TouchableOpacity
            onPress={exitEditMode}
            style={[styles.editDoneBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '50' }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Done editing layout"
            accessibilityRole="button"
          >
            <Text style={[styles.editDoneText, { color: colors.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {order.map((id, index) => (
        <DraggableCard
          key={id}
          id={id}
          index={index}
          totalCards={order.length}
          editMode={editMode}
          onLongPress={enterEditMode}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        >
          {cardMap[id]}
        </DraggableCard>
      ))}

      {editMode && (
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            resetOrder();
            resetEditTimer();
          }}
          style={[styles.resetBtn, { borderColor: colors.border }]}
          accessibilityLabel="Reset card order to default"
          accessibilityRole="button"
        >
          <Text style={[styles.resetText, { color: colors.muted }]}>Reset to default order</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
  },
  editOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  dragHandle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    paddingHorizontal: 6,
  },
  dragDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  editBannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  editDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 10,
  },
  editDoneText: {
    fontSize: 12,
    fontWeight: '700',
  },
  resetBtn: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
