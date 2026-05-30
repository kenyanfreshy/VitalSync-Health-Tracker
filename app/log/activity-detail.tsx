/**
 * Activity Detail Screen
 * Shows full stats for a saved activity.
 */
import { safeFormatTime } from '@/lib/utils';
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useColors, useLang } from '@/hooks';
import { logStrings } from '@/lib/i18n';
import { useHealth } from '@/lib/health/health-context';
import type { ActivityRecord } from '@/lib/health/types';

const ACTIVITY_COLORS: Record<string, string> = {
  'outdoor-run': '#22C55E',
  'indoor-run': '#6366F1',
  walk: '#22C55E',
  cycling: '#F59E0B',
  workout: '#EF4444',
};

function getActivityLabels(l: { typeOutdoorRun?: string; typeIndoorRun?: string; typeWalk?: string; typeCycling?: string; typeWorkout?: string }): Record<string, string> {
  return {
    'outdoor-run': l.typeOutdoorRun ?? 'Outdoor Run',
    'indoor-run': l.typeIndoorRun ?? 'Indoor Run',
    walk: l.typeWalk ?? 'Walk',
    cycling: l.typeCycling ?? 'Cycling',
    workout: l.typeWorkout ?? 'Workout',
  };
}

const ACTIVITY_ICONS: Record<string, string> = {
  'outdoor-run': '🏃',
  'indoor-run': '🏃',
  walk: '🚶',
  cycling: '🚴',
  workout: '💪',
};

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return safeFormatTime(iso, undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function ActivityDetailScreen() {
  const _adLang = useLang();
  const l = (logStrings as unknown as Record<string, typeof logStrings.en>)[_adLang] ?? logStrings.en;
  const ACTIVITY_LABELS = getActivityLabels(l);
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, deleteActivity } = useHealth();
  const data = state.data;

  const record: ActivityRecord | undefined = useMemo(
    () => data?.activity.find((a: ActivityRecord) => a.id === id),
    [data, id]
  );

  const accentColor = record ? (ACTIVITY_COLORS[record.type] ?? colors.primary) : colors.primary;

  const handleDelete = () => {
    Alert.alert('Delete Activity?', 'This cannot be undone.', [
      { text: (l.cancel ?? 'Cancel'), style: 'cancel' },
      {
        text: (l.delete ?? 'Delete'),
        style: 'destructive',
        onPress: () => {
          if (id) deleteActivity(id);
          router.back();
        },
      },
    ]);
  };

  if (!record) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>Activity not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <Text style={{ fontSize: 17, color: colors.primary }}>‹ Back</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.foreground }}>
          Activity Detail
        </Text>
        <Pressable onPress={handleDelete} style={{ padding: 4 }}>
          <Text style={{ fontSize: 14, color: colors.error }}>Delete</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Activity Header Card */}
        <View style={{
          marginHorizontal: 16,
          marginTop: 12,
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 20,
          borderLeftWidth: 4,
          borderLeftColor: accentColor,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 36 }}>{ACTIVITY_ICONS[record.type]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
                {ACTIVITY_LABELS[record.type]}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                {formatDate(record.timestamp)} · {formatTime(record.timestamp)}
              </Text>

            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={{
          marginHorizontal: 16,
          marginTop: 12,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        }}>
          {[
            { label: (l.duration ?? 'Duration'), value: formatDuration(record.durationMinutes) },
            ...(record.distanceKm != null ? [{ label: (l.distance ?? 'Distance'), value: `${record.distanceKm.toFixed(2)} km` }] : []),
            ...(record.distanceMiles != null ? [{ label: 'Distance (mi)', value: `${record.distanceMiles.toFixed(2)} mi` }] : []),
            ...(record.steps != null ? [{ label: (l.steps ?? 'Steps'), value: record.steps.toLocaleString() }] : []),
            ...(record.caloriesBurned != null ? [{ label: (l.calories ?? 'Calories'), value: `${record.caloriesBurned} kcal` }] : []),
            ...(record.avgHeartRate != null ? [{ label: (l.avgHR ?? 'Avg HR'), value: `${record.avgHeartRate} bpm` }] : []),
            ...(record.maxHeartRate != null ? [{ label: (l.maxHR ?? 'Max HR'), value: `${record.maxHeartRate} bpm` }] : []),

          ].map((item) => (
            <View key={item.label} style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 14,
              minWidth: '45%',
              flex: 1,
            }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>{item.value}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.label}</Text>
            </View>
          ))}
        </View>


        {/* Note */}
        {record.note && (
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.foreground, marginBottom: 8 }}>Note</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: colors.foreground, lineHeight: 20 }}>{record.note}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
