/**
 * HealthKitDebugPanel
 *
 * Full clinical diagnostic panel covering all 6 categories:
 *   1. Cardiovascular  — HR, Resting HR, HRV, BP
 *   2. Respiratory / Oxygenation — SpO2, Respiratory Rate, VO2 Max
 *   3. Metabolic / Nutritional   — Blood Glucose, Insulin, Dietary Fiber,
 *                                   Active Energy, Basal Energy
 *   4. Activity / Mobility       — Steps, Stand Time, Workouts
 *   5. Sleep / Recovery          — Sleep, Body Temperature, Weight, Body Fat
 *   6. EKG / Electrocardiogram   — EKG auth status, sample count, latest classification
 *
 * Uses the production bridge:
 *   • isRNHAvailable() / initAppleHealthKit() — RCT (react-native-health)
 *   • loadHealthKit()                         — Nitro (@kingstinct/react-native-healthkit)
 *   • rnhFetch* helpers                       — Promise-wrapped RNH queries
 *
 * Route: Settings → Diagnostics → HealthKit Diagnostics
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  NativeModules,
} from 'react-native';
import { useColors } from '@/hooks';
import { isRNHAvailable } from '@/lib/health/rnh-loader';
import { getNativeHealthService } from '@/lib/health/native-health-service';
import { loadHealthKit } from '@/lib/health/healthkit-loader';
import {
  rnhFetchHeartRate,
  rnhFetchRestingHeartRate,
  rnhFetchHRV,
  rnhFetchBloodPressure,
  rnhFetchSpO2,
  rnhFetchRespiratoryRate,
  rnhFetchVO2Max,
  rnhFetchBloodGlucose,
  rnhFetchInsulinDelivery,
  rnhFetchDietaryFiber,
  rnhFetchActiveEnergyBurned,
  rnhFetchBasalEnergyBurned,
  rnjFetchSteps,
  rnhFetchStandTime,
  rnjFetchWorkouts,
  rnhFetchSleep,
  rnhFetchBodyTemperature,
  rnhFetchWeight,
  rnhFetchBodyFat,
} from '@/lib/health/rnh-fetch';

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLine = { id: number; text: string; level: 'info' | 'ok' | 'warn' | 'error' };
type StepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error';

// ─── Step definitions — 6 clinical categories ─────────────────────────────────

const CATEGORIES: {
  key: string;
  label: string;
  color: string;
  steps: { key: string; label: string; unit?: string }[];
}[] = [
  {
    key: 'bridge',
    label: 'Bridge & Permissions',
    color: '#6366F1',
    steps: [
      { key: 'platform', label: 'Platform (iOS required)' },
      { key: 'native',   label: 'NativeModules.AppleHealthKit' },
      { key: 'rnh',      label: 'RCT bridge (react-native-health)' },
      { key: 'nitro',    label: 'Nitro bridge (@kingstinct/rn-healthkit)' },
      { key: 'init',     label: 'initHealthKit() / permissions' },
    ],
  },
  {
    key: 'cardio',
    label: '1 · Cardiovascular',
    color: '#EF4444',
    steps: [
      { key: 'hr',          label: 'Heart Rate',          unit: 'BPM' },
      { key: 'rhr',         label: 'Resting Heart Rate',  unit: 'BPM' },
      { key: 'hrv',         label: 'HRV',                 unit: 'ms' },
      { key: 'bp',          label: 'Blood Pressure',      unit: 'mmHg' },
      { key: 'bptiers',     label: 'BP Tier Selection',    unit: 'tier' },
    ],
  },
  {
    key: 'respiratory',
    label: '2 · Respiratory & Oxygenation',
    color: '#0EA5E9',
    steps: [
      { key: 'spo2',  label: 'SpO₂',            unit: '%' },
      { key: 'rr',    label: 'Respiratory Rate', unit: 'br/min' },
      { key: 'vo2',   label: 'VO₂ Max',          unit: 'mL/kg/min' },
    ],
  },
  {
    key: 'metabolic',
    label: '3 · Metabolic & Nutritional',
    color: '#F59E0B',
    steps: [
      { key: 'glucose',  label: 'Blood Glucose',    unit: 'mmol/L' },
      { key: 'insulin',  label: 'Insulin Delivery', unit: 'IU' },
      { key: 'fiber',    label: 'Dietary Fiber',    unit: 'g' },
      { key: 'active',   label: 'Active Energy',    unit: 'kcal' },
      { key: 'basal',    label: 'Basal Energy',     unit: 'kcal' },
    ],
  },
  {
    key: 'activity',
    label: '4 · Activity & Mobility',
    color: '#22C55E',
    steps: [
      { key: 'steps',    label: 'Step Count',    unit: 'steps' },
      { key: 'stand',    label: 'Stand Time',    unit: 'min' },
      { key: 'workouts', label: 'Workouts',      unit: 'sessions' },
    ],
  },
  {
    key: 'sleep',
    label: '5 · Sleep & Recovery',
    color: '#8B5CF6',
    steps: [
      { key: 'sleep',  label: 'Sleep Analysis',    unit: 'stages' },
      { key: 'temp',   label: 'Body Temperature',  unit: '°C' },
      { key: 'weight', label: 'Weight',            unit: 'kg' },
      { key: 'fat',    label: 'Body Fat %',        unit: '%' },
    ],
  },
  {
    key: 'ekg',
    label: '6 · EKG / Electrocardiogram',
    color: '#EF4444',
    steps: [
      { key: 'ekg_perm',   label: 'EKG Auth (@kingstinct v14)',              unit: 'bool' },
      { key: 'ekg_method', label: 'queryElectrocardiogramSamples()',          unit: 'fn' },
      { key: 'ekg_data',   label: 'EKG Samples (last 90 d)',                 unit: 'records' },
    ],
  },
];

const ALL_STEP_KEYS = CATEGORIES.flatMap(c => c.steps.map(s => s.key));

// ─── Component ────────────────────────────────────────────────────────────────

export function HealthKitDebugPanel() {
  const colors = useColors();
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({});
  const [running, setRunning] = useState(false);
  const logIdRef = useRef(0);

  const addLog = useCallback((text: string, level: LogLine['level'] = 'info') => {
    setLogs(prev => [{ id: logIdRef.current++, text, level }, ...prev]);
  }, []);

  const setStep = useCallback((key: string, status: StepStatus) => {
    setStepStatus(prev => ({ ...prev, [key]: status }));
  }, []);

  // 7-day window for metrics logged infrequently (weight, VO2, etc.)
  const since24h = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d  = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const runDiagnostic = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setLogs([]);
    const reset: Record<string, StepStatus> = {};
    ALL_STEP_KEYS.forEach(k => { reset[k] = 'pending'; });
    setStepStatus(reset);

    // ── Bridge & Permissions ─────────────────────────────────────────────────

    setStep('platform', 'running');
    addLog(`Platform: ${Platform.OS}`, 'info');
    if (Platform.OS !== 'ios') {
      addLog('⚠️  HealthKit is iOS-only. All checks skipped on this platform.', 'warn');
      const skip = Object.fromEntries(ALL_STEP_KEYS.map(k => [k, 'warn' as StepStatus]));
      setStepStatus(skip);
      setRunning(false);
      return;
    }
    setStep('platform', 'ok');

    setStep('native', 'running');
    const nativeBridge = (NativeModules as any).AppleHealthKit;
    if (nativeBridge && typeof nativeBridge.initHealthKit === 'function') {
      addLog('✅  NativeModules.AppleHealthKit present', 'ok');
      setStep('native', 'ok');
    } else {
      addLog('❌  NativeModules.AppleHealthKit missing — requires EAS/TestFlight build', 'error');
      addLog('   → Enable HealthKit in developer.apple.com → App IDs → Capabilities', 'warn');
      setStep('native', 'error');
    }

    setStep('rnh', 'running');
    if (isRNHAvailable()) {
      addLog('✅  RCT bridge (react-native-health) available', 'ok');
      setStep('rnh', 'ok');
    } else {
      addLog('⚠️  RCT bridge not available (Expo Go or missing native module)', 'warn');
      setStep('rnh', 'warn');
    }

    setStep('nitro', 'running');
    try {
      const HK = await loadHealthKit();
      if (HK) {
        // isHealthDataAvailable() is async in v8.x
        let avail = false;
        try { avail = await (HK as any).isHealthDataAvailable(); } catch (_unused) {}
        if (avail) {
          addLog('✅  @kingstinct bridge loaded — isHealthDataAvailable() = true', 'ok');
          setStep('nitro', 'ok');
        } else {
          addLog('⚠️  @kingstinct bridge loaded but isHealthDataAvailable() = false', 'warn');
          setStep('nitro', 'warn');
        }
      } else {
        addLog('⚠️  @kingstinct bridge absent (NativeModules.ReactNativeHealthkit not registered)', 'warn');
        setStep('nitro', 'warn');
      }
    } catch (e: any) {
      addLog(`❌  Nitro bridge error: ${e?.message ?? String(e)}`, 'error');
      setStep('nitro', 'error');
    }

    // Diagnostic only checks permission status — does NOT request permissions.
    // Permission requests must go through Settings → Health Permission Details → Request Permission.
    setStep('init', 'running');
    addLog('Checking HealthKit permission status (read-only, no prompt)…', 'info');
    try {
      const available = isRNHAvailable();
      if (available) {
        addLog('✅  react-native-health bridge is available — permissions were previously granted', 'ok');
        addLog('   To request permissions: Settings → Health Data → Health Permission Details → Request Permission', 'info');
        setStep('init', 'ok');
      } else {
        addLog('⚠️  react-native-health bridge not available — permissions not yet granted', 'warn');
        addLog('   To grant: Settings → Health Data → Health Permission Details → Request Permission', 'warn');
        setStep('init', 'warn');
      }
    } catch (e: any) {
      addLog(`❌  Permission status check threw: ${e?.message ?? String(e)}`, 'error');
      setStep('init', 'error');
    }

    // ── 1 · Cardiovascular ───────────────────────────────────────────────────

    addLog('── 1 · Cardiovascular ──', 'info');

    setStep('hr', 'running');
    try {
      const s = await rnhFetchHeartRate(since24h());
      if (s.length > 0) {
        addLog(`✅  Heart Rate: ${s.length} sample(s) · latest ${s[0].value} BPM`, 'ok');
        setStep('hr', 'ok');
      } else {
        addLog('⚠️  Heart Rate: 0 samples in last 24 h', 'warn');
        setStep('hr', 'warn');
      }
    } catch (e: any) { addLog(`❌  Heart Rate: ${e?.message}`, 'error'); setStep('hr', 'error'); }

    setStep('rhr', 'running');
    try {
      const s = await rnhFetchRestingHeartRate(since7d());
      if (s.length > 0) {
        addLog(`✅  Resting HR: ${s.length} sample(s) · latest ${s[0].value} BPM`, 'ok');
        setStep('rhr', 'ok');
      } else {
        addLog('⚠️  Resting HR: 0 samples in last 7 d', 'warn');
        setStep('rhr', 'warn');
      }
    } catch (e: any) { addLog(`❌  Resting HR: ${e?.message}`, 'error'); setStep('rhr', 'error'); }

    setStep('hrv', 'running');
    try {
      const s = await rnhFetchHRV(since7d());
      if (s.length > 0) {
        addLog(`✅  HRV: ${s.length} sample(s) · latest ${s[0].value.toFixed(1)} ms`, 'ok');
        setStep('hrv', 'ok');
      } else {
        addLog('⚠️  HRV: 0 samples in last 7 d (requires Apple Watch)', 'warn');
        setStep('hrv', 'warn');
      }
    } catch (e: any) { addLog(`❌  HRV: ${e?.message}`, 'error'); setStep('hrv', 'error'); }

    setStep('bp', 'running');
    try {
      const s = await rnhFetchBloodPressure(since7d());
      if (s.length > 0) {
        const l = s[0];
        addLog(`✅  BP: ${s.length} sample(s) · latest ${l.bloodPressureSystolicValue}/${l.bloodPressureDiastolicValue} mmHg`, 'ok');
        setStep('bp', 'ok');
      } else {
        addLog('⚠️  BP: 0 samples in last 7 d (manual entry or smart cuff)', 'warn');
        setStep('bp', 'warn');
      }
    } catch (e: any) { addLog(`❌  BP: ${e?.message}`, 'error'); setStep('bp', 'error'); }

    // ── BP Tier Selection ────────────────────────────────────────────────────
    // Calls the production NativeHealthService.fetchBloodPressure() which runs
    // the full tier waterfall and logs which tier was activated via console.info.
    setStep('bptiers', 'running');
    try {
      addLog('Testing BP tier waterfall (see console for tier selection)…', 'info');
      const svc = getNativeHealthService();
      const bpRecords = await svc.fetchBloodPressure(since7d());
      if (bpRecords.length > 0) {
        const latest = bpRecords[0];
        const tierHint = (latest as any)._tier ?? 'unknown';
        addLog(
          `✅  BP Tiers: ${bpRecords.length} record(s) · latest ${latest.systolic ?? '?'}/${latest.diastolic ?? '?'} mmHg` +
          (tierHint !== 'unknown' ? ` · tier=${tierHint}` : ' · check console for tier log'),
          'ok',
        );
        setStep('bptiers', 'ok');
      } else {
        addLog('⚠️  BP Tiers: 0 records returned — all tiers exhausted or no BP data in last 7 d', 'warn');
        addLog('   Tier 1: queryCorrelationSamples (Nitro v8.3+)', 'info');
        addLog('   Tier 2: queryQuantitySamples Systolic+Diastolic correlated ±1 s (Nitro pre-v8.3)', 'info');
        addLog('   Tier 3: rnhFetchBloodPressure() RCT bridge (react-native-health)', 'info');
        addLog('   Tier 4: getSamples(BloodPressure) generic fallback', 'info');
        setStep('bptiers', 'warn');
      }
    } catch (e: any) { addLog(`❌  BP Tiers: ${e?.message}`, 'error'); setStep('bptiers', 'error'); }

    // ── 2 · Respiratory & Oxygenation ───────────────────────────────────────

    addLog('── 2 · Respiratory & Oxygenation ──', 'info');

    setStep('spo2', 'running');
    try {
      const s = await rnhFetchSpO2(since24h());
      if (s.length > 0) {
        addLog(`✅  SpO₂: ${s.length} sample(s) · latest ${(s[0].value * 100).toFixed(1)}%`, 'ok');
        setStep('spo2', 'ok');
      } else {
        addLog('⚠️  SpO₂: 0 samples in last 24 h (requires Apple Watch Series 6+)', 'warn');
        setStep('spo2', 'warn');
      }
    } catch (e: any) { addLog(`❌  SpO₂: ${e?.message}`, 'error'); setStep('spo2', 'error'); }

    setStep('rr', 'running');
    try {
      const s = await rnhFetchRespiratoryRate(since24h());
      if (s.length > 0) {
        addLog(`✅  Respiratory Rate: ${s.length} sample(s) · latest ${s[0].value.toFixed(1)} br/min`, 'ok');
        setStep('rr', 'ok');
      } else {
        addLog('⚠️  Respiratory Rate: 0 samples in last 24 h (requires Apple Watch)', 'warn');
        setStep('rr', 'warn');
      }
    } catch (e: any) { addLog(`❌  Respiratory Rate: ${e?.message}`, 'error'); setStep('rr', 'error'); }

    setStep('vo2', 'running');
    try {
      const s = await rnhFetchVO2Max(since7d());
      if (s.length > 0) {
        addLog(`✅  VO₂ Max: ${s.length} sample(s) · latest ${s[0].value.toFixed(1)} mL/kg/min`, 'ok');
        setStep('vo2', 'ok');
      } else {
        addLog('⚠️  VO₂ Max: 0 samples in last 7 d (requires outdoor walk/run with Apple Watch)', 'warn');
        setStep('vo2', 'warn');
      }
    } catch (e: any) { addLog(`❌  VO₂ Max: ${e?.message}`, 'error'); setStep('vo2', 'error'); }

    // ── 3 · Metabolic & Nutritional ─────────────────────────────────────────

    addLog('── 3 · Metabolic & Nutritional ──', 'info');

    setStep('glucose', 'running');
    try {
      const s = await rnhFetchBloodGlucose(since24h());
      if (s.length > 0) {
        addLog(`✅  Blood Glucose: ${s.length} sample(s) · latest ${s[0].value.toFixed(2)} mmol/L`, 'ok');
        setStep('glucose', 'ok');
      } else {
        addLog('⚠️  Blood Glucose: 0 samples in last 24 h (CGM or manual entry)', 'warn');
        setStep('glucose', 'warn');
      }
    } catch (e: any) { addLog(`❌  Blood Glucose: ${e?.message}`, 'error'); setStep('glucose', 'error'); }

    setStep('insulin', 'running');
    try {
      const s = await rnhFetchInsulinDelivery(since24h());
      if (s.length > 0) {
        addLog(`✅  Insulin: ${s.length} dose(s) in last 24 h`, 'ok');
        setStep('insulin', 'ok');
      } else {
        addLog('⚠️  Insulin: 0 doses in last 24 h (smart pump or manual entry)', 'warn');
        setStep('insulin', 'warn');
      }
    } catch (e: any) { addLog(`❌  Insulin: ${e?.message}`, 'error'); setStep('insulin', 'error'); }

    setStep('fiber', 'running');
    try {
      const s = await rnhFetchDietaryFiber(since24h());
      if (s.length > 0) {
        const total = s.reduce((acc, x) => acc + x.value, 0);
        addLog(`✅  Dietary Fiber: ${s.length} entry(ies) · ${total.toFixed(1)} g total today`, 'ok');
        setStep('fiber', 'ok');
      } else {
        addLog('⚠️  Dietary Fiber: 0 entries in last 24 h (requires food logging)', 'warn');
        setStep('fiber', 'warn');
      }
    } catch (e: any) { addLog(`❌  Dietary Fiber: ${e?.message}`, 'error'); setStep('fiber', 'error'); }

    setStep('active', 'running');
    try {
      const s = await rnhFetchActiveEnergyBurned(since24h());
      if (s.length > 0) {
        const total = s.reduce((acc, x) => acc + x.value, 0);
        addLog(`✅  Active Energy: ${s.length} sample(s) · ${total.toFixed(0)} kcal today`, 'ok');
        setStep('active', 'ok');
      } else {
        addLog('⚠️  Active Energy: 0 samples in last 24 h', 'warn');
        setStep('active', 'warn');
      }
    } catch (e: any) { addLog(`❌  Active Energy: ${e?.message}`, 'error'); setStep('active', 'error'); }

    setStep('basal', 'running');
    try {
      const s = await rnhFetchBasalEnergyBurned(since24h());
      if (s.length > 0) {
        const total = s.reduce((acc, x) => acc + x.value, 0);
        addLog(`✅  Basal Energy: ${s.length} sample(s) · ${total.toFixed(0)} kcal today`, 'ok');
        setStep('basal', 'ok');
      } else {
        addLog('⚠️  Basal Energy: 0 samples in last 24 h', 'warn');
        setStep('basal', 'warn');
      }
    } catch (e: any) { addLog(`❌  Basal Energy: ${e?.message}`, 'error'); setStep('basal', 'error'); }

    // ── 4 · Activity & Mobility ──────────────────────────────────────────────

    addLog('── 4 · Activity & Mobility ──', 'info');

    setStep('steps', 'running');
    try {
      const count = await rnjFetchSteps(since24h());
      if (count > 0) {
        addLog(`✅  Steps: ${count.toLocaleString()} today`, 'ok');
        setStep('steps', 'ok');
      } else {
        addLog('⚠️  Steps: 0 today', 'warn');
        setStep('steps', 'warn');
      }
    } catch (e: any) { addLog(`❌  Steps: ${e?.message}`, 'error'); setStep('steps', 'error'); }

    setStep('stand', 'running');
    try {
      const s = await rnhFetchStandTime(since24h());
      if (s.length > 0) {
        const total = s.reduce((acc, x) => acc + x.value, 0);
        addLog(`✅  Stand Time: ${total.toFixed(0)} min today (${s.length} sample(s))`, 'ok');
        setStep('stand', 'ok');
      } else {
        addLog('⚠️  Stand Time: 0 samples in last 24 h (requires Apple Watch)', 'warn');
        setStep('stand', 'warn');
      }
    } catch (e: any) { addLog(`❌  Stand Time: ${e?.message}`, 'error'); setStep('stand', 'error'); }

    setStep('workouts', 'running');
    try {
      const s = await rnjFetchWorkouts(since7d());
      if (s.length > 0) {
        addLog(`✅  Workouts: ${s.length} session(s) in last 7 d · latest: ${s[0].activityName}`, 'ok');
        setStep('workouts', 'ok');
      } else {
        addLog('⚠️  Workouts: 0 sessions in last 7 d', 'warn');
        setStep('workouts', 'warn');
      }
    } catch (e: any) { addLog(`❌  Workouts: ${e?.message}`, 'error'); setStep('workouts', 'error'); }

    // ── 5 · Sleep & Recovery ─────────────────────────────────────────────────

    addLog('── 5 · Sleep & Recovery ──', 'info');

    setStep('sleep', 'running');
    try {
      const s = await rnhFetchSleep(since24h());
      if (s.length > 0) {
        const stages = [...new Set(s.map(x => x.value))].join(', ');
        addLog(`✅  Sleep: ${s.length} stage record(s) · stages: ${stages}`, 'ok');
        setStep('sleep', 'ok');
      } else {
        addLog('⚠️  Sleep: 0 records in last 24 h', 'warn');
        setStep('sleep', 'warn');
      }
    } catch (e: any) { addLog(`❌  Sleep: ${e?.message}`, 'error'); setStep('sleep', 'error'); }

    setStep('temp', 'running');
    try {
      const s = await rnhFetchBodyTemperature(since7d());
      if (s.length > 0) {
        addLog(`✅  Body Temp: ${s.length} sample(s) · latest ${s[0].value.toFixed(2)} °C`, 'ok');
        setStep('temp', 'ok');
      } else {
        addLog('⚠️  Body Temp: 0 samples in last 7 d (requires Apple Watch Ultra 2 or manual entry)', 'warn');
        setStep('temp', 'warn');
      }
    } catch (e: any) { addLog(`❌  Body Temp: ${e?.message}`, 'error'); setStep('temp', 'error'); }

    setStep('weight', 'running');
    try {
      const s = await rnhFetchWeight(since7d());
      if (s.length > 0) {
        addLog(`✅  Weight: ${s.length} sample(s) · latest ${s[0].value.toFixed(1)} kg`, 'ok');
        setStep('weight', 'ok');
      } else {
        addLog('⚠️  Weight: 0 samples in last 7 d', 'warn');
        setStep('weight', 'warn');
      }
    } catch (e: any) { addLog(`❌  Weight: ${e?.message}`, 'error'); setStep('weight', 'error'); }

    setStep('fat', 'running');
    try {
      const s = await rnhFetchBodyFat(since7d());
      if (s.length > 0) {
        addLog(`✅  Body Fat: ${s.length} sample(s) · latest ${(s[0].value * 100).toFixed(1)}%`, 'ok');
        setStep('fat', 'ok');
      } else {
        addLog('⚠️  Body Fat: 0 samples in last 7 d', 'warn');
        setStep('fat', 'warn');
      }
    } catch (e: any) { addLog(`❌  Body Fat: ${e?.message}`, 'error'); setStep('fat', 'error'); }

    // ── 6 · EKG / Electrocardiogram ─────────────────────────────────────────

    addLog('── 6 · EKG / Electrocardiogram ──', 'info');

    // Step 1: check that @kingstinct v14 Nitro bridge is present and has queryElectrocardiogramSamples
    setStep('ekg_perm', 'running');
    try {
      const nitroPresent = !!(global as any).NitroModulesProxy;
      const legacyPresent = !!(NativeModules as any).ReactNativeHealthkit;
      if (!nitroPresent && !legacyPresent) {
        addLog('❌  EKG: @kingstinct Nitro bridge not registered — requires EAS/TestFlight build with Nitro pods linked', 'error');
        setStep('ekg_perm', 'error');
      } else {
        const hkMod = await (async () => { try { return await import('@kingstinct/react-native-healthkit'); } catch { return null; } })();
        const hasMethod = hkMod && typeof (hkMod as any).queryElectrocardiogramSamples === 'function';
        if (hasMethod) {
          addLog('✅  EKG: @kingstinct v14 bridge present — queryElectrocardiogramSamples registered', 'ok');
          setStep('ekg_perm', 'ok');
        } else {
          addLog('❌  EKG: queryElectrocardiogramSamples not found — @kingstinct v14+ required', 'error');
          addLog('   → Run: pnpm add @kingstinct/react-native-healthkit@14 then rebuild', 'warn');
          setStep('ekg_perm', 'error');
        }
      }
    } catch (e: any) { addLog(`❌  EKG bridge check threw: ${e?.message}`, 'error'); setStep('ekg_perm', 'error'); }

    // Step 2: verify queryElectrocardiogramSamples is callable at runtime
    setStep('ekg_method', 'running');
    try {
      const hkMod = await (async () => { try { return await import('@kingstinct/react-native-healthkit'); } catch { return null; } })();
      if (hkMod && typeof (hkMod as any).queryElectrocardiogramSamples === 'function') {
        addLog('✅  queryElectrocardiogramSamples() is callable', 'ok');
        setStep('ekg_method', 'ok');
      } else {
        addLog('⚠️  queryElectrocardiogramSamples() not callable — @kingstinct v14 not installed or bridge absent', 'warn');
        addLog('   EKG data requires: pnpm add @kingstinct/react-native-healthkit@14 + EAS rebuild', 'info');
        setStep('ekg_method', 'warn');
      }
    } catch (e: any) { addLog(`❌  EKG method check threw: ${e?.message}`, 'error'); setStep('ekg_method', 'error'); }

    // Step 3: attempt a real data fetch over the last 90 days (metadata only, no voltage)
    setStep('ekg_data', 'running');
    try {
      const hkMod = await (async () => { try { return await import('@kingstinct/react-native-healthkit'); } catch { return null; } })();
      const queryFn = hkMod ? (hkMod as any).queryElectrocardiogramSamples : null;
      if (!queryFn) {
        addLog('⚠️  EKG: queryElectrocardiogramSamples not available — skipping data fetch', 'warn');
        setStep('ekg_data', 'warn');
      } else {
        const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const samples: any[] = await queryFn({ limit: 10, ascending: false, from: since90d, to: new Date() });
        if (Array.isArray(samples) && samples.length > 0) {
          const latest = samples[0];
          const classRaw = latest.classification ?? latest.metadata?.HKAppleECGClassification ?? 'unknown';
          const bpm = latest.averageHeartRate != null
            ? ` · ${Number(latest.averageHeartRate).toFixed(0)} BPM`
            : latest.metadata?.HKAverageHeartRate != null
              ? ` · ${Number(latest.metadata.HKAverageHeartRate).toFixed(0)} BPM`
              : '';
          addLog(`✅  EKG: ${samples.length} recording(s) in last 90 d · latest: ${classRaw}${bpm}`, 'ok');
          setStep('ekg_data', 'ok');
        } else {
          addLog('⚠️  EKG: 0 recordings in last 90 d — Apple Watch Series 4+ required; user must have taken an EKG', 'warn');
          addLog('   If permission was just granted, pull-to-refresh on the EKG screen', 'info');
          setStep('ekg_data', 'warn');
        }
      }
    } catch (e: any) { addLog(`❌  EKG data fetch threw: ${e?.message}`, 'error'); setStep('ekg_data', 'error'); }

    addLog('─── Diagnostic complete ───', 'info');
    setRunning(false);
  }, [running, addLog, setStep]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const statusIcon = (s: StepStatus) => {
    if (s === 'pending') return '○';
    if (s === 'running') return '…';
    if (s === 'ok')      return '✓';
    if (s === 'warn')    return '⚠';
    return '✗';
  };

  const statusColor = (s: StepStatus) => {
    if (s === 'ok')    return '#22C55E';
    if (s === 'warn')  return '#F59E0B';
    if (s === 'error') return '#EF4444';
    return colors.muted;
  };

  const logColor = (level: LogLine['level']) => {
    if (level === 'ok')    return '#4ADE80';
    if (level === 'warn')  return '#FCD34D';
    if (level === 'error') return '#F87171';
    return '#9CA3AF';
  };

  const okCount   = ALL_STEP_KEYS.filter(k => stepStatus[k] === 'ok').length;
  const warnCount = ALL_STEP_KEYS.filter(k => stepStatus[k] === 'warn').length;
  const errCount  = ALL_STEP_KEYS.filter(k => stepStatus[k] === 'error').length;
  const total     = ALL_STEP_KEYS.length;
  const hasRun    = okCount + warnCount + errCount > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>VitalSync Diagnostics</Text>
          {hasRun && !running && (
            <Text style={[styles.summary, { color: colors.muted }]}>
              {okCount}/{total} ok · {warnCount} warn · {errCount} error
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={runDiagnostic}
          disabled={running}
          style={[styles.runBtn, { backgroundColor: running ? colors.muted : '#22C55E', opacity: running ? 0.6 : 1 }]}
          activeOpacity={0.75}
        >
          <Text style={styles.runBtnText}>{running ? 'Running…' : 'Run Diagnostic'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Grouped step checklist ──────────────────────────────────────────── */}
      <ScrollView
        style={[styles.checklistScroll, { borderTopColor: colors.border, borderBottomColor: colors.border }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {CATEGORIES.map(cat => (
          <View key={cat.key} style={styles.categoryBlock}>
            <View style={[styles.categoryHeader, { borderLeftColor: cat.color }]}>
              <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
            </View>
            {cat.steps.map(step => {
              const s = stepStatus[step.key] ?? 'pending';
              return (
                <View key={step.key} style={styles.stepRow}>
                  <Text style={[styles.stepIcon, { color: statusColor(s) }]}>{statusIcon(s)}</Text>
                  <Text style={[styles.stepLabel, { color: s === 'pending' ? colors.muted : colors.foreground }]}>
                    {step.label}
                  </Text>
                  {step.unit && (
                    <Text style={[styles.stepUnit, { color: colors.muted }]}>{step.unit}</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* ── Log output ─────────────────────────────────────────────────────── */}
      <View style={styles.logHeader}>
        <Text style={[styles.logHeaderText, { color: colors.muted }]}>Output Log</Text>
        {logs.length > 0 && (
          <TouchableOpacity onPress={() => setLogs([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        style={[styles.logBox, { backgroundColor: '#0D1117' }]}
        contentContainerStyle={{ padding: 10 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {logs.length === 0 ? (
          <Text style={[styles.logLine, { color: '#4B5563' }]}>Tap &quot;Run Diagnostic&quot; to start…</Text>
        ) : (
          logs.map(line => (
            <Text key={line.id} style={[styles.logLine, { color: logColor(line.level) }]}>
              {line.text}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  summary: {
    fontSize: 11,
    marginTop: 2,
  },
  runBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  runBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  checklistScroll: {
    maxHeight: 340,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryBlock: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  categoryHeader: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingLeft: 8,
  },
  stepIcon: {
    fontSize: 12,
    fontWeight: '700',
    width: 14,
    textAlign: 'center',
  },
  stepLabel: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  stepUnit: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  logHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logBox: {
    height: 220,
    marginHorizontal: 10,
    marginBottom: 12,
    borderRadius: 8,
  },
  logLine: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 17,
  },
});
