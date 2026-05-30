import {
  queryQuantitySamples,
  HKQuantityTypeIdentifier,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { subDays } from 'date-fns';

export const syncVitalSyncData = async () => {
  const startDate = subDays(new Date(), 30);
  const endDate = new Date();

  try {
    // ✅ CORRECT format (NOT object) — two-argument form required by v8 API
    await requestAuthorization(
      [
        HKQuantityTypeIdentifier.heartRate,
        HKQuantityTypeIdentifier.oxygenSaturation,
        HKQuantityTypeIdentifier.bloodPressureSystolic,
        HKQuantityTypeIdentifier.bloodPressureDiastolic,
        HKQuantityTypeIdentifier.respiratoryRate,
        HKQuantityTypeIdentifier.bodyMass,
        HKQuantityTypeIdentifier.stepCount,
      ],
      []
    );

    // ✅ PARALLEL FETCH — 30-day window
    const [heartRates, spo2, bloodPressure] = await Promise.all([
      queryQuantitySamples(HKQuantityTypeIdentifier.heartRate, {
        from: startDate,
        to: endDate,
      }),
      queryQuantitySamples(HKQuantityTypeIdentifier.oxygenSaturation, {
        from: startDate,
        to: endDate,
      }),
      queryQuantitySamples(HKQuantityTypeIdentifier.bloodPressureSystolic, {
        from: startDate,
        to: endDate,
      }),
    ]);

    return {
      heartRates,
      spo2,
      bloodPressure,
      lastSynced: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
};
