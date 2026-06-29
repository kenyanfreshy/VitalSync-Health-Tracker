/**
 * Supported Data Sources Screen
 *
 * Lists all compatible devices and health platforms by category,
 * showing connection method (Bluetooth / Health platform / App).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks';
import { usePremiumGate } from '@/lib/subscription/use-premium-gate';

type ConnectionMethod = 'bluetooth' | 'healthkit' | 'health-connect' | 'app' | 'manual';

interface DataSource {
  name: string;
  brand: string;
  model?: string;
  connection: ConnectionMethod[];
  category: string;
  notes?: string;
}

const SOURCES: { category: string; icon: string; description: string; items: DataSource[] }[] = [
  {
    category: 'Continuous Glucose Monitors (CGM)',
    icon: '📡',
    description: 'Continuous real-time glucose readings',
    items: [
      { name: 'Dexcom G7', brand: 'Dexcom', connection: ['bluetooth', 'healthkit'], category: 'cgm', notes: 'Direct BLE + Apple Health / Google Health' },
      { name: 'Dexcom G6', brand: 'Dexcom', connection: ['healthkit'], category: 'cgm', notes: 'Via Apple Health' },
      { name: 'FreeStyle Libre 3', brand: 'Abbott', connection: ['bluetooth', 'healthkit'], category: 'cgm', notes: 'Direct BLE on iOS 15+ / Apple Health' },
      { name: 'FreeStyle Libre 2', brand: 'Abbott', connection: ['healthkit'], category: 'cgm', notes: 'Via LibreLink app → Apple Health' },
    ],
  },
  {
    category: 'Glucometers',
    icon: '🩸',
    description: 'Traditional fingerstick blood glucose meters',
    items: [
      { name: 'Contour NEXT ONE', brand: 'Ascensia', connection: ['bluetooth'], category: 'glucometer', notes: 'Bluetooth GLP profile' },
      { name: 'Contour NEXT GEN', brand: 'Ascensia', connection: ['bluetooth'], category: 'glucometer' },
      { name: 'Accu-Chek Guide', brand: 'Roche', connection: ['bluetooth'], category: 'glucometer', notes: 'Bluetooth GLP profile' },
      { name: 'Accu-Chek Instant', brand: 'Roche', connection: ['bluetooth'], category: 'glucometer' },
      { name: 'OneTouch Verio Reflect', brand: 'LifeScan', connection: ['bluetooth'], category: 'glucometer' },
      { name: 'OneTouch Ultra Plus Flex', brand: 'LifeScan', connection: ['bluetooth'], category: 'glucometer' },
      { name: 'FreeStyle Precision Neo', brand: 'Abbott', connection: ['bluetooth'], category: 'glucometer' },
      { name: 'Any glucometer', brand: 'All brands', connection: ['manual'], category: 'glucometer', notes: 'Manual entry always available' },
    ],
  },
  {
    category: 'Smart Scales',
    icon: '⚖️',
    description: 'Body weight and composition scales',
    items: [
      { name: 'Body+ / Body Cardio', brand: 'Withings', connection: ['bluetooth', 'healthkit'], category: 'scale' },
      { name: 'Body Scan', brand: 'Withings', connection: ['bluetooth', 'healthkit'], category: 'scale' },
      { name: 'Smart Scale P2 Pro', brand: 'Eufy', connection: ['bluetooth', 'healthkit'], category: 'scale' },
      { name: 'Smart Scale C1', brand: 'Eufy', connection: ['bluetooth'], category: 'scale' },
      { name: 'Smart Body Scale', brand: 'Renpho', connection: ['bluetooth', 'healthkit'], category: 'scale' },
      { name: 'QardioBase 2', brand: 'Qardio', connection: ['bluetooth', 'healthkit'], category: 'scale' },
      { name: 'BC-601 / BC-568', brand: 'Tanita', connection: ['bluetooth', 'healthkit'], category: 'scale' },
      { name: 'Body Composition Monitor', brand: 'Omron', connection: ['bluetooth'], category: 'scale' },
      { name: 'Any scale', brand: 'All brands', connection: ['manual'], category: 'scale', notes: 'Manual entry always available' },
    ],
  },
  {
    category: 'Blood Pressure Monitors',
    icon: '💓',
    description: 'Arm and wrist BP cuffs',
    items: [
      { name: 'HEM-7361T / HEM-7600T', brand: 'Omron', connection: ['bluetooth', 'healthkit'], category: 'bp-monitor' },
      { name: 'HEM-9200T / HEM-9210T', brand: 'Omron', connection: ['bluetooth', 'healthkit'], category: 'bp-monitor' },
      { name: 'BPM Connect / BPM Core', brand: 'Withings', connection: ['bluetooth', 'healthkit'], category: 'bp-monitor' },
      { name: 'QardioArm', brand: 'Qardio', connection: ['bluetooth', 'healthkit'], category: 'bp-monitor' },
      { name: 'iHealth Feel / Clear', brand: 'iHealth', connection: ['bluetooth', 'healthkit'], category: 'bp-monitor' },
      { name: 'UA-651BLE / UA-767PBT', brand: 'A&D Medical', connection: ['bluetooth'], category: 'bp-monitor' },
      { name: 'Any BP monitor', brand: 'All brands', connection: ['manual'], category: 'bp-monitor', notes: 'Manual entry always available' },
    ],
  },
  {
    category: 'Fitness Trackers & Smartwatches',
    icon: '⌚',
    description: 'HR, steps, calories, sleep, and activity',
    items: [
      { name: 'Apple Watch (all models)', brand: 'Apple', connection: ['healthkit'], category: 'fitness-tracker', notes: 'Full HealthKit integration' },
      { name: 'Charge 6 / Sense 2', brand: 'Fitbit / Google', connection: ['healthkit'], category: 'fitness-tracker', notes: 'Via Apple Health' },
      { name: 'Forerunner / Fenix / Venu', brand: 'Garmin', connection: ['healthkit', 'app'], category: 'fitness-tracker', notes: 'Via Garmin Connect app' },
      { name: 'H10 / Vantage V3', brand: 'Polar', connection: ['bluetooth', 'healthkit'], category: 'fitness-tracker', notes: 'Direct BLE HR + Polar Flow' },
      { name: 'WHOOP 4.0', brand: 'WHOOP', connection: ['healthkit'], category: 'fitness-tracker', notes: 'Via Apple Health' },
      { name: 'Fenix 7 / Epix', brand: 'Garmin', connection: ['app'], category: 'fitness-tracker' },
    ],
  },
  {
    category: 'Health Platforms',
    icon: '🏥',
    description: 'Aggregator platforms that sync all your devices',
    items: [
      { name: 'Apple Health (HealthKit)', brand: 'Apple', connection: ['healthkit'], category: 'platform', notes: 'iOS only — aggregates all Apple Health data' },
    ],
  },
];

const METHOD_LABEL: Record<ConnectionMethod, string> = {
  bluetooth: 'Bluetooth',
  healthkit: 'Apple Health',
  'health-connect': 'Apple Health',
  app: 'Companion App',
  manual: 'Manual Entry',
};

const METHOD_COLOR: Record<ConnectionMethod, string> = {
  bluetooth: '#38BDF8',
  healthkit: '#FF3B30',
  'health-connect': '#34A853',
  app: '#FF9500',
  manual: '#8E8E93',
};

function DataSourcesScreenInner() {
  const colors = useColors();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(SOURCES[0].category);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Supported Devices</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Legend */}
        <View style={[styles.legend, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.legendTitle, { color: colors.foreground }]}>Connection Methods</Text>
          <View style={styles.legendRow}>
            {(Object.keys(METHOD_LABEL) as ConnectionMethod[]).map((m) => (
              <View key={m} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: METHOD_COLOR[m] }]} />
                <Text style={[styles.legendText, { color: colors.muted }]}>{METHOD_LABEL[m]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Category sections */}
        {SOURCES.map((section) => (
          <View key={section.category} style={[styles.section, { borderColor: colors.border }]}>
            <Pressable
              style={[styles.sectionHeader, { backgroundColor: colors.surface }]}
              onPress={() => setExpanded(expanded === section.category ? null : section.category)}
            >
              <Text style={styles.sectionIcon}>{section.icon}</Text>
              <View style={styles.sectionTitleBlock}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.category}</Text>
                <Text style={[styles.sectionDesc, { color: colors.muted }]}>{section.description}</Text>
              </View>
              <Text style={[styles.chevron, { color: colors.muted }]}>
                {expanded === section.category ? '▲' : '▼'}
              </Text>
            </Pressable>

            {expanded === section.category && (
              <View style={[styles.itemList, { backgroundColor: colors.background }]}>
                {section.items.map((item, idx) => (
                  <View
                    key={item.name}
                    style={[
                      styles.deviceItem,
                      { borderBottomColor: colors.border },
                      idx === section.items.length - 1 && styles.lastItem,
                    ]}
                  >
                    <View style={styles.deviceItemLeft}>
                      <Text style={[styles.deviceItemName, { color: colors.foreground }]}>{item.name}</Text>
                      <Text style={[styles.deviceItemBrand, { color: colors.muted }]}>{item.brand}</Text>
                      {item.notes && (
                        <Text style={[styles.deviceItemNotes, { color: colors.muted }]}>{item.notes}</Text>
                      )}
                    </View>
                    <View style={styles.methodBadges}>
                      {item.connection.map((m) => (
                        <View key={m} style={[styles.methodBadge, { backgroundColor: METHOD_COLOR[m] + '22' }]}>
                          <Text style={[styles.methodBadgeText, { color: METHOD_COLOR[m] }]}>
                            {METHOD_LABEL[m]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={[styles.footer, { color: colors.muted }]}>
          Any device not listed can still be used via manual entry. Bluetooth sync requires the device to be powered on and within 10 metres.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

export default function DataSourcesScreen() {
  const { isPremium, requirePremium, PremiumGateSheet } = usePremiumGate({ fullScreen: true });
  React.useEffect(() => {
    if (!isPremium) {
      requirePremium(() => {}, { feature: 'Data Sources' })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);
  if (!isPremium) {
    return <>{PremiumGateSheet}</>;
  }
  return <DataSourcesScreenInner />;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 60 },
  backText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  legend: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  legendTitle: { fontSize: 13, fontWeight: '600' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  section: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  sectionIcon: { fontSize: 22 },
  sectionTitleBlock: { flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  sectionDesc: { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 12 },
  itemList: {},
  deviceItem: { padding: 14, borderBottomWidth: 0.5, gap: 8 },
  lastItem: { borderBottomWidth: 0 },
  deviceItemLeft: { gap: 2 },
  deviceItemName: { fontSize: 14, fontWeight: '500' },
  deviceItemBrand: { fontSize: 12 },
  deviceItemNotes: { fontSize: 11, fontStyle: 'italic' },
  methodBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  methodBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  methodBadgeText: { fontSize: 11, fontWeight: '600' },
  footer: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 8 },
});
